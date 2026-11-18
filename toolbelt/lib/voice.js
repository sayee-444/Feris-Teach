/**
 * `feris voice`: starts and shuts down the voice service, and makes it speak a reply's spoken
 * version, fall silent and be switched off and on.
 *
 * The voice service is a Python program in `voice/`, run with uv. `start` runs it as a detached
 * process and returns once its engine is loaded and it listens, so the service outlives the call
 * that started it. The service records itself in `<student>/run/voice.json`, which the other
 * commands read to reach it; its output goes to `<student>/run/voice.log`.
 */
import { spawn } from "node:child_process";
import { closeSync, mkdirSync, openSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { studentDir, voiceDir } from "./paths.js";
import { endProcess, liveRecord, pause } from "./service.js";

const USAGE = `Usage: feris voice <command>

The voice service: it speaks the spoken version of the teacher's replies aloud.

Commands:
  start          Start the voice service in the background, with its voice loaded
  shutdown       Shut the voice service down, leaving no process behind
  say [<reply>]  Speak the spoken version of a reply, given here or on standard input
  stop           Silence the voice at once, and print as JSON what was cut: the last sentence
                 heard and the sentences not heard
  off            Silence the voice and keep it silent
  on             Let the voice speak again
  status         Print, as JSON, whether the voice is on, what it is saying and what is queued
  serve          Run the voice service in this terminal until Ctrl+C

The voice is set in student/voice.toml; see the README for installing a voice.
`;

/** How long `start` waits for the service to listen (uv may first install it), and `shutdown`
 * for it to end. */
const START_TIMEOUT = 300_000;
const STOP_TIMEOUT = 10_000;

/**
 * What the voice service records about itself.
 *
 * @typedef {object} Running
 * @property {number} pid
 * @property {string} url
 * @property {string} voice The voice it speaks with, as the student is told it
 */

/** A problem to report to whoever ran the command. */
class VoiceError extends Error {}

const runDir = () => join(studentDir(), "run");
const recordFile = () => join(runDir(), "voice.json");
const logFile = () => join(runDir(), "voice.log");

/**
 * The voice service that is running, if any. A record left by a service that died is removed.
 *
 * @returns {Running | undefined}
 */
const running = () => liveRecord(recordFile());

/** The line that says the voice service is running. */
function runningLine(/** @type {Running} */ { voice, pid }) {
	return `The voice service is running with ${voice} (process ${pid}).`;
}

/** The arguments that run the voice service with uv, in this terminal. */
function serveArgs() {
	return [
		"run",
		"--project",
		voiceDir(),
		"--quiet",
		"feris-voice",
		"serve",
		"--student",
		studentDir(),
	];
}

/** What to say when uv cannot be run. */
const NO_UV =
	"the voice service needs uv, which is not installed or not on the PATH. Install it as " +
	"https://docs.astral.sh/uv/getting-started/installation/ says, then try again.";

/** Runs the voice service in this terminal until it is told to stop. */
async function serve() {
	const other = running();
	if (other) throw new VoiceError(`the voice service is already running. ${runningLine(other)}`);
	const child = spawn("uv", serveArgs(), { stdio: "inherit" });
	for (const signal of /** @type {const} */ (["SIGINT", "SIGTERM"])) {
		process.on(signal, () => child.kill(signal));
	}
	return await new Promise((resolve, reject) => {
		child.once("error", (error) =>
			/** @type {NodeJS.ErrnoException} */ (error).code === "ENOENT"
				? reject(new VoiceError(NO_UV))
				: reject(error),
		);
		child.once("exit", (code) => resolve(code ?? 1));
	});
}

/** Starts the voice service in the background, or reports the one already running. */
async function start() {
	const open = running();
	if (open) {
		console.log(runningLine(open));
		return 0;
	}

	mkdirSync(runDir(), { recursive: true });
	const log = openSync(logFile(), "w");
	const child = spawn("uv", serveArgs(), {
		detached: true,
		stdio: ["ignore", log, log],
		windowsHide: true,
	});
	closeSync(log);

	/** @type {{ ended: boolean, missing: boolean }} */
	const outcome = { ended: false, missing: false };
	child.once("error", (error) => {
		outcome.ended = true;
		outcome.missing = /** @type {NodeJS.ErrnoException} */ (error).code === "ENOENT";
	});
	child.once("exit", () => {
		outcome.ended = true;
	});
	const deadline = Date.now() + START_TIMEOUT;
	let service = running();
	while (service === undefined && !outcome.ended && Date.now() < deadline) {
		await pause(50);
		service = running();
	}
	if (outcome.missing) throw new VoiceError(NO_UV);
	// Of two services started at once, the one that lost has ended: the other one is running.
	service ??= running();
	if (service === undefined) {
		// uv runs the service as a child of its own: on Linux, end them both.
		try {
			if (process.platform === "win32" || child.pid === undefined) child.kill();
			else process.kill(-child.pid, "SIGKILL");
		} catch {
			// They have already ended.
		}
		const output = readFileSync(logFile(), "utf8").trim();
		throw new VoiceError(
			`the voice service did not start.${output ? `\n${output}` : ""}\nIts output is in ${logFile()}`,
		);
	}
	child.unref();
	console.log(runningLine(service));
	return 0;
}

/** Shuts the voice service down and waits until its process is gone. */
async function shutdown() {
	const open = running();
	if (open === undefined) {
		console.log("The voice service is not running.");
		return 0;
	}
	await endProcess(open.pid, STOP_TIMEOUT);
	rmSync(recordFile(), { force: true });
	console.log("The voice service has stopped.");
	return 0;
}

/** The voice service that is running; when none is, the teacher is told to start it. */
function runningService() {
	const service = running();
	if (service === undefined) {
		throw new VoiceError('the voice service is not running. Start it with "feris voice start".');
	}
	return service;
}

/**
 * Asks the voice service that is running to do something, and returns its answer.
 *
 * @param {"say" | "stop" | "off" | "on" | "status"} order
 * @param {object} [body] What to send with the order
 * @returns {Promise<any>} The service's answer, parsed from JSON
 */
async function ask(order, body) {
	const { url } = runningService();
	/** @type {Response} */
	let response;
	try {
		response = await fetch(
			new URL(order, url),
			order === "status"
				? {}
				: {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify(body ?? {}),
					},
		);
	} catch {
		throw new VoiceError(
			`the voice service at ${url} does not answer. Its output is in ${logFile()}`,
		);
	}
	if (!response.ok) {
		throw new VoiceError(`the voice service answered "${order}" with ${response.status}.`);
	}
	return await response.json();
}

/** Prints a value as JSON. */
function printJson(/** @type {unknown} */ value) {
	process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

/** Reads all of standard input. */
async function readStdin() {
	/** @type {Buffer[]} */
	const chunks = [];
	for await (const chunk of process.stdin) chunks.push(chunk);
	return Buffer.concat(chunks).toString("utf8");
}

/**
 * Speaks the spoken version of a reply, after anything the voice is still saying.
 *
 * @param {string | undefined} reply The reply; when it is not given, standard input holds it
 */
async function say(reply) {
	const { on } = await ask("say", { reply: reply ?? (await readStdin()) });
	if (!on) console.log("The voice is off: nothing was said.");
	return 0;
}

/** Silences the voice at once and prints what was cut. */
async function stop() {
	printJson(await ask("stop"));
	return 0;
}

/** Silences the voice and keeps it silent. */
async function off() {
	await ask("off");
	console.log("The voice is off.");
	return 0;
}

/** Lets the voice speak again. */
async function on() {
	await ask("on");
	console.log("The voice is on.");
	return 0;
}

/** Prints whether the voice is on, what it is saying and what is queued. */
async function status() {
	printJson(await ask("status"));
	return 0;
}

/**
 * Runs a `feris voice` command.
 *
 * @param {string[]} args What follows `voice` on the command line
 * @returns {Promise<number>} The exit code
 */
export async function voice(args) {
	const [command, ...options] = args;
	try {
		if (command === "say" && options.length <= 1) return await say(options[0]);
		if (options.length === 0) {
			if (command === "start") return await start();
			if (command === "shutdown") return await shutdown();
			if (command === "serve") return await serve();
			if (command === "stop") return await stop();
			if (command === "off") return await off();
			if (command === "on") return await on();
			if (command === "status") return await status();
		}
	} catch (error) {
		if (!(error instanceof VoiceError)) throw error;
		console.error(`feris: ${error.message}`);
		return 1;
	}
	process.stderr.write(USAGE);
	return 1;
}
