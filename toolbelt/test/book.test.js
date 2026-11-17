import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const bin = fileURLToPath(new URL("../bin/feris.js", import.meta.url));
const sample = fileURLToPath(new URL("../../books/basic-algebra", import.meta.url));

/** Runs the toolbelt the way the teacher does, with `env` added to its environment. */
function feris(/** @type {string[]} */ args, /** @type {Record<string, string>} */ env = {}) {
	const result = spawnSync(process.execPath, [bin, ...args], {
		encoding: "utf8",
		env: { ...process.env, ...env },
	});
	return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/**
 * A copy of the sample book in a folder of books of its own, for one test to break.
 *
 * @param {import("node:test").TestContext} t
 */
function copyOfSample(t) {
	const books = mkdtempSync(join(tmpdir(), "feris-books-"));
	t.after(() => rmSync(books, { recursive: true, force: true }));
	const book = join(books, "algebra");
	cpSync(sample, book, { recursive: true });
	return {
		book,
		env: { FERIS_BOOKS_DIR: books },
		/** Rewrites the book's index with `change` applied to it. */
		editIndex(/** @type {(index: any) => void} */ change) {
			const file = join(book, "index.json");
			const index = JSON.parse(readFileSync(file, "utf8"));
			change(index);
			writeFileSync(file, JSON.stringify(index, null, "\t"));
		},
	};
}

test("the sample book matches its index", () => {
	const { status, stdout, stderr } = feris(["book", "check", "basic-algebra"]);

	assert.equal(stderr, "");
	assert.equal(status, 0);
	assert.match(stdout, /^basic-algebra matches its index: 2 chapters, 5 lessons\.\n$/);
});

test("a broken book is reported with every mismatch between its index and its files", (t) => {
	const { book, env, editIndex } = copyOfSample(t);
	rmSync(join(book, "lessons/02-like-terms.html"));
	writeFileSync(join(book, "lessons/05-systems.html"), "<title>Systems of two equations</title>");
	writeFileSync(join(book, "lessons/99-stray.html"), "<title>A stray page</title>");
	editIndex((index) => {
		index.chapters[1].lessons[0].title = "Solving equations";
		index.reference[0].file = "reference/missing.html";
	});

	const { status, stdout, stderr } = feris(["book", "check", "algebra"], env);

	assert.equal(stdout, "");
	assert.equal(status, 1);
	assert.equal(
		stderr,
		[
			"algebra does not match its index:",
			"  - lessons/02-like-terms.html: the index lists it, but the page is missing",
			'  - lessons/03-solving.html: the index calls it "Solving equations", but its <title> is "Solving a linear equation"',
			"  - lessons/05-systems.html: the index says it is planned, but the page exists",
			"  - reference/missing.html: the index lists it, but the page is missing",
			"  - lessons/99-stray.html: the page is in the book, but not in the index",
			"  - reference/rules.html: the page is in the book, but not in the index",
			"",
		].join("\n"),
	);
});

test("an index that is not JSON is reported as such", (t) => {
	const { book, env } = copyOfSample(t);
	writeFileSync(join(book, "index.json"), "{ not json");

	const { status, stderr } = feris(["book", "check", "algebra"], env);

	assert.equal(status, 1);
	assert.match(
		stderr,
		/^algebra does not match its index:\n {2}- index\.json: it is not valid JSON/,
	);
});

test("an index of the wrong shape is reported field by field", (t) => {
	const { env, editIndex } = copyOfSample(t);
	editIndex((index) => {
		delete index.language;
		index.chapters[0].lessons[1].status = "done";
	});

	const { status, stderr } = feris(["book", "check", "algebra"], env);

	assert.equal(status, 1);
	assert.equal(
		stderr,
		[
			"algebra does not match its index:",
			'  - index.json: "language" must be a non-empty string',
			'  - index.json: chapters[0].lessons[1].status must be "planned" or "ready"',
			"",
		].join("\n"),
	);
});

test("two lessons with the same id are reported", (t) => {
	const { env, editIndex } = copyOfSample(t);
	editIndex((index) => {
		index.chapters[1].lessons[2].id = "variables";
	});

	const { status, stderr } = feris(["book", "check", "algebra"], env);

	assert.equal(status, 1);
	assert.match(stderr, /index\.json: two lessons have the id "variables"/);
});

test("a lesson whose sections or paragraphs have no id, or share one, is reported", (t) => {
	const { book, env } = copyOfSample(t);
	const lesson = join(book, "lessons/01-variables.html");
	writeFileSync(
		lesson,
		readFileSync(lesson, "utf8")
			.replace('<p id="coefficient">', "<p>")
			.replace('<div id="why-letters" class="note">', '<div id="variable" class="note">')
			.replace('<section id="expressions">', "<section>"),
	);

	const { status, stderr } = feris(["book", "check", "algebra"], env);

	assert.equal(status, 1);
	assert.equal(
		stderr,
		[
			"algebra does not match its index:",
			'  - lessons/01-variables.html: a <p> in the section "the-idea" has no id',
			"  - lessons/01-variables.html: a <section> has no id",
			'  - lessons/01-variables.html: two elements have the id "variable"',
			"",
		].join("\n"),
	);
});

test("a book can be checked by the path to its folder", (t) => {
	const { book } = copyOfSample(t);

	const { status, stdout } = feris(["book", "check", book]);

	assert.equal(status, 0);
	assert.match(stdout, /matches its index: 2 chapters, 5 lessons\.\n$/);
});

test("checking a book that does not exist says so", () => {
	const { status, stderr } = feris(["book", "check", "astrology"]);

	assert.equal(status, 1);
	assert.equal(stderr, 'feris: there is no book named "astrology", and no folder at that path.\n');
});

test("a book in the student folder is checked by its name", (t) => {
	const student = mkdtempSync(join(tmpdir(), "feris-student-"));
	t.after(() => rmSync(student, { recursive: true, force: true }));
	cpSync(sample, join(student, "books", "my-algebra"), { recursive: true });

	const { status, stdout } = feris(["book", "check", "my-algebra"], { FERIS_STUDENT_DIR: student });

	assert.equal(status, 0);
	assert.equal(stdout, "my-algebra matches its index: 2 chapters, 5 lessons.\n");
});
