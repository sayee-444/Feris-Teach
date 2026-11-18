/**
 * The student folder is private (ADR-0002): git ignores everything in it, the profile and the
 * student's books among them, so nothing personal can be committed by accident.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("..", import.meta.url));

/** Runs git in the repo. */
function git(/** @type {string[]} */ ...args) {
	return spawnSync("git", args, { cwd: repo, encoding: "utf8" });
}

test("git ignores everything in the student folder", () => {
	const paths = [
		"student/profile.md",
		"student/books/linear-algebra/index.json",
		"student/books/linear-algebra/lessons/01-vectors.html",
		"student/lab/example-human.jsonl",
		"student/run/classroom.json",
		"student/run/voice.json",
		"student/voice.toml",
		"student/voices/es_ES-davefx-medium.onnx",
		"student/sources/a-book.pdf",
	];

	const ignored = git("check-ignore", "--no-index", ...paths);

	assert.equal(ignored.stderr, "");
	assert.deepEqual(ignored.stdout.split(/\r?\n/).filter(Boolean), paths);
});

test("the repo holds no file of the student folder", () => {
	const tracked = git("ls-files", "student");

	assert.equal(tracked.status, 0, tracked.stderr);
	assert.equal(tracked.stdout, "");
});
