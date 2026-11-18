import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const bin = fileURLToPath(new URL("../bin/feris.js", import.meta.url));

/**
 * A student folder of its own for one test, so that its voice service is not the student's. The
 * voice service is shut down when the test ends, whatever happened.
 *
 * @param {import("node:test").TestContext} t
 * @param {Record<string, string>} [env] Environment variables added to every run of the toolbelt
 */
function student(t, env = {}) {
	const dir = mkdtempSync(join(tmpdir(), "feris-student-"));
	/** Runs the toolbelt the way the teacher does, with this student folder. */
	const feris = (/** @type {string[]} */ ...args) => {
		const result = spawnSync(process.execPath, [bin, ...args], {
			encoding: "utf8",
			env: { ...process.env, ...env, FERIS_STUDENT_DIR: dir },
			timeout: 120_000,
		});
		return { status: result.status, stdout: result.stdout, stderr: result.stderr };
	};
	t.after(() => {
		feris("voice", "shutdown");
		rmSync(dir, { recursive: true, force: true });
	});
	return { feris, dir };
}

/**
 * Sets up the voice of a student folder: the lab's fake engine and fake player, which records
 * in `played.jsonl` what it would have played, unless `config` says otherwise.
 *
 * @param {string} dir The student folder
 * @param {string} [config] The content of the student's `voice.toml`
 */
function fakeVoice(dir, config) {
	const record = join(dir, "played.jsonl");
	writeFileSync(
		join(dir, "voice.toml"),
		config ?? `[engine]\nname = "fake"\n\n[player]\nname = "fake"\nrecord = '${record}'\n`,
	);
	return record;
}

/** What `feris voice start` reports: the voice it speaks with and the service's process. */
function started(/** @type {string} */ stdout) {
	const match = /^The voice service is running with (.+) \(process (\d+)\)\.\n$/.exec(stdout);
	assert.ok(match, `"${stdout}" does not say that the voice service is running`);
	return { voice: String(match[1]), pid: Number(match[2]) };
}

/** Whether a process with this id is running. */
function isRunning(/** @type {number} */ pid) {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

test("the voice cannot speak, be silenced or be switched while its service is not running", (t) => {
	const { feris } = student(t);

	const results = [
		feris("voice", "say", "Hola."),
		feris("voice", "stop"),
		feris("voice", "off"),
		feris("voice", "on"),
		feris("voice", "status"),
	];

	for (const { status, stdout, stderr } of results) {
		assert.equal(status, 1);
		assert.equal(stdout, "");
		assert.equal(
			stderr,
			'feris: the voice service is not running. Start it with "feris voice start".\n',
		);
	}
});

test("the voice service starts in the background and shuts down without a trace", (t) => {
	const { feris, dir } = student(t);
	fakeVoice(dir);

	const start = feris("voice", "start");
	assert.equal(start.stderr, "");
	assert.equal(start.status, 0);
	const { voice, pid } = started(start.stdout);
	assert.equal(voice, "the fake voice of the lab");
	assert.equal(isRunning(pid), true);

	const again = feris("voice", "start");
	assert.equal(again.status, 0);
	assert.deepEqual(started(again.stdout), { voice, pid });

	const shutdown = feris("voice", "shutdown");
	assert.equal(shutdown.status, 0);
	assert.equal(shutdown.stdout, "The voice service has stopped.\n");
	assert.equal(isRunning(pid), false, `the voice service's process ${pid} is still running`);
	assert.equal(feris("voice", "shutdown").stdout, "The voice service is not running.\n");
});

test("a Qwen voice without its model or a GPU stops the start with what is missing and how to fix it", (t) => {
	// An empty Hugging Face cache holds no model, and CUDA sees no GPU.
	const cache = mkdtempSync(join(tmpdir(), "feris-hf-"));
	t.after(() => rmSync(cache, { recursive: true, force: true }));
	const { feris, dir } = student(t, { HF_HOME: cache, CUDA_VISIBLE_DEVICES: "" });
	fakeVoice(dir, '[engine]\nname = "qwen"\nvoice = "serena"\n');

	const { status, stdout, stderr } = feris("voice", "start");

	assert.equal(status, 1);
	assert.equal(stdout, "");
	assert.match(stderr, /^feris: the voice service did not start\.\n/);
	for (const part of [
		"the Qwen model Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice is not downloaded",
		"uv run --project voice hf download Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice",
		"there is no NVIDIA GPU that CUDA can use",
		"an NVIDIA RTX 30 series or newer with 8 GB of VRAM",
	]) {
		assert.ok(stderr.includes(part), `"${part}" is not in: ${stderr}`);
	}
	assert.equal(feris("voice", "status").status, 1, "a voice service runs without its voice");
});

test("a Qwen voice that is neither a stock speaker nor in the voices folder stops the start", (t) => {
	const { feris, dir } = student(t);
	fakeVoice(dir, '[engine]\nname = "qwen"\nvoice = "nadie"\n');

	const { status, stderr } = feris("voice", "start");

	assert.equal(status, 1);
	assert.ok(
		stderr.includes(
			'there is no Qwen voice "nadie": it is not one of CustomVoice\'s speakers (aiden, ' +
				"dylan, eric, ono_anna, ryan, serena, sohee, uncle_fu, vivian), nor a voice in " +
				join(dir, "voices"),
		),
		stderr,
	);
});

test("an engine that does not exist stops the start with a message that names the engines", (t) => {
	const { feris, dir } = student(t);
	fakeVoice(dir, '[engine]\nname = "espeak"\n');

	const { status, stderr } = feris("voice", "start");

	assert.equal(status, 1);
	assert.ok(
		stderr.includes('there is no voice engine "espeak". The engines are: fake, qwen.'),
		stderr,
	);
});

test("without uv the voice service cannot start, and the message says how to install uv", (t) => {
	const { dir } = student(t);
	const empty = mkdtempSync(join(tmpdir(), "feris-path-"));
	t.after(() => rmSync(empty, { recursive: true, force: true }));

	const result = spawnSync(process.execPath, [bin, "voice", "start"], {
		encoding: "utf8",
		env: { ...process.env, FERIS_STUDENT_DIR: dir, PATH: empty, Path: empty },
	});

	assert.equal(result.status, 1);
	assert.match(result.stderr, /^feris: the voice service needs uv, which is not installed/);
	assert.match(result.stderr, /https:\/\/docs\.astral\.sh\/uv\//);
});

test("the reply to speak can come on standard input, as a hook sends it", async (t) => {
	const { feris, dir } = student(t);
	const record = fakeVoice(dir);
	assert.equal(feris("voice", "start").status, 0);

	const said = spawnSync(process.execPath, [bin, "voice", "say"], {
		encoding: "utf8",
		env: { ...process.env, FERIS_STUDENT_DIR: dir },
		input: "Texto en pantalla.\n\n<spoken>Lo que se oye. Y su pregunta, ¿vale?</spoken>\n",
	});
	assert.equal(said.stderr, "");
	assert.equal(said.status, 0);
	assert.equal(said.stdout, "");

	const deadline = Date.now() + 10_000;
	/** @type {string[]} */
	let heard = [];
	while (heard.length < 2 && Date.now() < deadline) {
		await new Promise((resolve) => setTimeout(resolve, 50));
		heard = existsSync(record)
			? readFileSync(record, "utf8")
					.split("\n")
					.filter(Boolean)
					.map((line) => JSON.parse(line).sentence)
			: [];
	}
	assert.deepEqual(heard, ["Lo que se oye.", "Y su pregunta, ¿vale?"]);
});

test("a sentence starts to sound before it is all made", async (t) => {
	const { feris, dir } = student(t);
	const record = join(dir, "played.jsonl");
	// Each sentence is made in four pieces of a second each, and lasts five seconds.
	writeFileSync(
		join(dir, "voice.toml"),
		'[engine]\nname = "fake"\nseconds = 5\npieces = 4\nmaking = 1\n\n' +
			`[player]\nname = "fake"\nrecord = '${record}'\n`,
	);
	assert.equal(feris("voice", "start").status, 0);

	const said = Date.now();
	assert.equal(feris("voice", "say", "<spoken>Uno. Dos.</spoken>").status, 0);
	/** @type {{ speaking: string | null, queued: string[] }} */
	let status = { speaking: null, queued: [] };
	while (status.speaking === null && Date.now() - said < 10_000) {
		await new Promise((resolve) => setTimeout(resolve, 50));
		status = JSON.parse(feris("voice", "status").stdout);
	}
	const heard = Date.now() - said;

	assert.equal(status.speaking, "Uno.");
	assert.deepEqual(status.queued, ["Dos."]);
	assert.ok(heard < 3_000, `the first sentence sounded only after ${heard} ms, once all made`);
});

test("the voice's commands take what they need and nothing more", (t) => {
	const { feris } = student(t);

	const results = [
		feris("voice"),
		feris("voice", "sing"),
		feris("voice", "say", "Hola.", "Adiós."),
		feris("voice", "stop", "now"),
		feris("voice", "start", "--port", "1"),
	];

	for (const { status, stderr } of results) {
		assert.equal(status, 1);
		assert.match(stderr, /^Usage: feris voice <command>/);
		for (const command of ["start", "shutdown", "say", "stop", "off", "on", "status"]) {
			assert.match(stderr, new RegExp(`\\n {2}${command} `));
		}
	}
});

test("of two starts at once, one voice service runs and both report it", async (t) => {
	const { dir } = student(t);
	fakeVoice(dir);

	/** Starts the voice service without waiting, and resolves with what the start printed. */
	const starting = () =>
		new Promise((resolve) => {
			const child = spawn(process.execPath, [bin, "voice", "start"], {
				env: { ...process.env, FERIS_STUDENT_DIR: dir },
			});
			let stdout = "";
			child.stdout.on("data", (chunk) => {
				stdout += chunk;
			});
			child.once("exit", (status) => resolve({ status, stdout }));
		});
	const [first, second] = /** @type {{ status: number, stdout: string }[]} */ (
		await Promise.all([starting(), starting()])
	);

	assert.deepEqual([first?.status, second?.status], [0, 0]);
	const running = started(String(first?.stdout));
	assert.deepEqual(started(String(second?.stdout)), running);
	// uv runs the service's Python as its child; count the Python processes alone.
	const services = spawnSync("pgrep", ["-f", `bin/feris-voice serve --student ${dir}`], {
		encoding: "utf8",
	});
	if (services.error === undefined) {
		assert.deepEqual(services.stdout.split("\n").filter(Boolean), [String(running.pid)]);
	}
});
