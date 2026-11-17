import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const bin = fileURLToPath(new URL("../bin/feris.js", import.meta.url));

/**
 * A student folder of its own for one test, so that its classroom is not the student's. The
 * classroom is stopped when the test ends, whatever happened.
 *
 * @param {import("node:test").TestContext} t
 */
function student(t) {
	const dir = mkdtempSync(join(tmpdir(), "feris-student-"));
	/** Runs the toolbelt the way the teacher does, with this student folder. */
	const feris = (/** @type {string[]} */ ...args) => {
		const result = spawnSync(process.execPath, [bin, ...args], {
			encoding: "utf8",
			env: { ...process.env, FERIS_STUDENT_DIR: dir },
			timeout: 30_000,
		});
		return { status: result.status, stdout: result.stdout, stderr: result.stderr };
	};
	t.after(() => {
		feris("classroom", "stop");
		rmSync(dir, { recursive: true, force: true });
	});
	return { feris, dir };
}

/** What `feris classroom start` reports: the classroom's address and its process. */
function opened(/** @type {string} */ stdout) {
	const match =
		/^The classroom is open at (http:\/\/127\.0\.0\.1:\d+\/) \(process (\d+)\)\.\n$/.exec(stdout);
	assert.ok(match, `"${stdout}" does not say where the classroom is open`);
	return { url: String(match[1]), pid: Number(match[2]) };
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

test("the classroom starts on localhost, serves the sample book and stops without a trace", async (t) => {
	const { feris } = student(t);

	const start = feris("classroom", "start");
	assert.equal(start.stderr, "");
	assert.equal(start.status, 0);
	const { url, pid } = opened(start.stdout);

	const library = await fetch(new URL("books/", url));
	assert.equal(library.status, 200);
	assert.match(await library.text(), /Basic algebra/);
	const lesson = await fetch(new URL("books/basic-algebra/lessons/01-variables.html", url));
	assert.equal(lesson.status, 200);
	assert.match(await lesson.text(), /<h1>Variables and expressions<\/h1>/);

	const stop = feris("classroom", "stop");
	assert.equal(stop.status, 0);
	assert.equal(stop.stdout, "The classroom has stopped.\n");
	assert.equal(isRunning(pid), false, `the classroom's process ${pid} is still running`);
	await assert.rejects(fetch(url), "the classroom still answers after it stopped");
});

test("the classroom is one page that never reloads: the books open inside it", async (t) => {
	const { feris } = student(t);
	const { url } = opened(feris("classroom", "start").stdout);

	const shell = await (await fetch(url)).text();
	const lesson = await (
		await fetch(new URL("books/basic-algebra/lessons/01-variables.html", url))
	).text();

	assert.match(shell, /<iframe name="lesson"/, "the home page has no frame for the book");
	assert.doesNotMatch(shell, /@vite\/client/, "the home page would reload with the books");
	assert.match(lesson, /@vite\/client/, "a lesson does not reload when it changes");
});

test("starting the classroom again reports the one already open", (t) => {
	const { feris } = student(t);
	const first = opened(feris("classroom", "start").stdout);

	const again = feris("classroom", "start");

	assert.equal(again.status, 0);
	assert.deepEqual(opened(again.stdout), first);
});

test("stopping a classroom that is not running says so and succeeds", (t) => {
	const { feris } = student(t);

	const { status, stdout } = feris("classroom", "stop");

	assert.equal(status, 0);
	assert.equal(stdout, "The classroom is not running.\n");
});

test("a page that is not in a book is not found", async (t) => {
	const { feris } = student(t);
	const { url } = opened(feris("classroom", "start").stdout);

	const missing = await fetch(new URL("books/basic-algebra/lessons/nowhere.html", url));
	const outside = await fetch(new URL("books/basic-algebra/..%2f..%2fpackage.json", url));
	const unknown = await fetch(new URL("books/astrology/", url));

	assert.deepEqual([missing.status, outside.status, unknown.status], [404, 404, 404]);
});

test("the classroom serves the student's books next to the sample book", async (t) => {
	const { feris, dir } = student(t);
	const sample = fileURLToPath(new URL("../../books/basic-algebra", import.meta.url));
	cpSync(sample, join(dir, "books", "my-algebra"), { recursive: true });
	const { url } = opened(feris("classroom", "start").stdout);

	const library = await (await fetch(new URL("books/", url))).text();
	const lesson = await fetch(new URL("books/my-algebra/lessons/01-variables.html", url));

	assert.match(library, /href="\/books\/basic-algebra\/"/);
	assert.match(library, /href="\/books\/my-algebra\/"/);
	assert.equal(lesson.status, 200);
});

test("the classroom serves no file outside the books and its own, not even through Vite", async (t) => {
	const { feris, dir } = student(t);
	const { url } = opened(feris("classroom", "start").stdout);
	const repo = fileURLToPath(new URL("../..", import.meta.url)).replaceAll("\\", "/");
	const secret = join(dir, "secret.txt");
	writeFileSync(secret, "private");

	const statuses = [];
	for (const path of [`${repo}package.json`, secret.replaceAll("\\", "/")]) {
		const response = await fetch(new URL(`@fs/${path.replace(/^\//, "")}`, url));
		statuses.push(response.status);
	}

	assert.equal(statuses.includes(200), false, `a file outside the books was served: ${statuses}`);
});
