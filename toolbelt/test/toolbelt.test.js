import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/** @type {{ version: string }} */
const manifest = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
const bin = fileURLToPath(new URL("../bin/feris.js", import.meta.url));

/** Runs the toolbelt the way the teacher does: as a separate process. */
function feris(/** @type {string[]} */ ...args) {
	const result = spawnSync(process.execPath, [bin, ...args], { encoding: "utf8" });
	return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

test("the toolbelt reports the version of the release it belongs to", () => {
	const { status, stdout } = feris("--version");

	assert.equal(status, 0);
	assert.match(manifest.version, /^\d+\.\d+\.\d+/);
	assert.equal(stdout, `${manifest.version}\n`);
});

test("the toolbelt explains how to use it when asked for help", () => {
	const { status, stdout } = feris("--help");

	assert.equal(status, 0);
	assert.match(stdout, /^Usage: feris <command>/);
	assert.match(stdout, /--version/);
});

test("the toolbelt rejects a command it does not know and points to the help", () => {
	const { status, stdout, stderr } = feris("dance");

	assert.equal(status, 1);
	assert.equal(stdout, "");
	assert.equal(
		stderr,
		'feris: unknown command "dance". Run "feris --help" to see what it can do.\n',
	);
});

test("the toolbelt shows its help when run with no command", () => {
	const { status, stderr } = feris();

	assert.equal(status, 1);
	assert.match(stderr, /^Usage: feris <command>/);
});
