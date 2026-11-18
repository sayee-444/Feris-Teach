import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { get } from "node:http";
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

test("the classroom's state cannot be read while the classroom is not running", (t) => {
	const { feris } = student(t);

	const { status, stdout, stderr } = feris("classroom", "state");

	assert.equal(status, 1);
	assert.equal(stdout, "");
	assert.equal(
		stderr,
		'feris: the classroom is not running. Start it with "feris classroom start".\n',
	);
});

test("the teacher can neither open a page nor point while the classroom is not running", (t) => {
	const { feris } = student(t);

	const open = feris("classroom", "open", "/books/basic-algebra/glossary.html");
	const point = feris("classroom", "point", "variable");

	for (const { status, stdout, stderr } of [open, point]) {
		assert.equal(status, 1);
		assert.equal(stdout, "");
		assert.equal(
			stderr,
			'feris: the classroom is not running. Start it with "feris classroom start".\n',
		);
	}
});

test("opening a page that is not in the classroom says so", (t) => {
	const { feris } = student(t);
	feris("classroom", "start");

	const missing = feris("classroom", "open", "/books/basic-algebra/lessons/nowhere.html");
	const unknown = feris("classroom", "open", "books/astrology/");
	const notPage = feris("classroom", "open", "/books/basic-algebra/index.json");

	assert.deepEqual(
		[missing, unknown, notPage].map(({ status, stderr }) => ({ status, stderr })),
		[
			{
				status: 1,
				stderr:
					'feris: there is no page "/books/basic-algebra/lessons/nowhere.html" in the classroom.\n',
			},
			{ status: 1, stderr: 'feris: there is no page "/books/astrology/" in the classroom.\n' },
			{
				status: 1,
				stderr: 'feris: there is no page "/books/basic-algebra/index.json" in the classroom.\n',
			},
		],
	);
});

test("the teacher can neither open a page nor point while no browser shows the classroom", (t) => {
	const { feris } = student(t);
	const { url } = opened(feris("classroom", "start").stdout);

	const results = [
		feris("classroom", "open", "books/basic-algebra/glossary.html"),
		feris("classroom", "point", "variable"),
		feris("classroom", "point", "--clear"),
	];

	for (const { status, stdout, stderr } of results) {
		assert.equal(status, 1);
		assert.equal(stdout, "");
		assert.equal(stderr, `feris: the classroom is not open in a browser. Open ${url} first.\n`);
	}
});

test("opening and pointing take exactly one page or one element", (t) => {
	const { feris } = student(t);

	const results = [
		feris("classroom", "open"),
		feris("classroom", "open", "books/", "books/basic-algebra/"),
		feris("classroom", "point"),
		feris("classroom", "point", "variable", "coefficient"),
	];

	for (const { status, stderr } of results) {
		assert.equal(status, 1);
		assert.match(stderr, /^Usage: feris classroom <command>/);
		assert.match(stderr, /open <page>/);
		assert.match(stderr, /point <id>/);
		assert.match(stderr, /point --clear/);
	}
});

test("before the student opens the classroom, its state says nothing is on screen", (t) => {
	const { feris } = student(t);
	feris("classroom", "start");

	const { status, stdout, stderr } = feris("classroom", "state");

	assert.equal(stderr, "");
	assert.equal(status, 0);
	assert.deepEqual(JSON.parse(stdout), {
		page: null,
		book: null,
		lesson: null,
		view: { sections: [], paragraphs: [] },
		selection: null,
		answers: [],
	});
});

test("another site in the student's browser can neither read nor change the classroom state", async (t) => {
	const { feris } = student(t);
	const { url } = opened(feris("classroom", "start").stdout);
	const state = new URL("control/state", url);
	const view = new URL("shell/view", url);
	const forged = JSON.stringify({
		page: "/books/basic-algebra/glossary.html",
		view: { sections: [], paragraphs: [] },
		selection: null,
	});

	const read = await fetch(state, { headers: { origin: "http://example.com" } });
	// A site whose name is made to point at 127.0.0.1 sends its own name as the host; `fetch`
	// always sends the real one, so this request goes through `node:http`.
	const rebound = await new Promise((resolve, reject) => {
		get(state, { headers: { host: `example.com:${state.port}` } }, (res) => {
			res.resume();
			resolve({ status: res.statusCode });
		}).on("error", reject);
	});
	const change = await fetch(view, {
		method: "POST",
		headers: { origin: "http://example.com", "content-type": "text/plain" },
		body: forged,
	});

	assert.deepEqual([read.status, rebound.status, change.status], [403, 403, 403]);
	assert.equal(JSON.parse(feris("classroom", "state").stdout).page, null);
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

test("a book the student creates while the classroom is open is listed and served at once", async (t) => {
	const { feris } = student(t);
	const { url } = opened(feris("classroom", "start").stdout);

	const created = feris("book", "new", "linear-algebra", "--title", "Linear algebra");
	const library = await (await fetch(new URL("books/", url))).text();
	const index = await fetch(new URL("books/linear-algebra/", url));
	const glossary = await fetch(new URL("books/linear-algebra/glossary.html", url));

	assert.equal(created.status, 0, created.stderr);
	assert.match(library, /<a href="\/books\/linear-algebra\/">Linear algebra<\/a>/);
	assert.match(library, /href="\/books\/basic-algebra\/"/);
	assert.equal(index.status, 200);
	assert.doesNotMatch(await index.text(), /mismatches/, "the new book does not match its index");
	assert.equal(glossary.status, 200);
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
