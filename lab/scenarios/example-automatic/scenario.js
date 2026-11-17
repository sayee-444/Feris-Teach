/**
 * A template for an automatic scenario: copy this folder, rename it and change the check.
 *
 * `check` tries one part of Feris-Teach through the toolbelt and throws when it misbehaves.
 * The message of what it throws is what the lab shows, so make it say what went wrong.
 */
import assert from "node:assert/strict";

/** @import { AutomaticScenario } from "#toolbelt" */

/** @type {AutomaticScenario} */
export default {
	kind: "automatic",
	title: "The toolbelt reports a version",
	check({ feris }) {
		const { status, stdout } = feris("--version");

		assert.equal(status, 0, `"feris --version" exited with ${status}`);
		assert.match(stdout, /^\d+\.\d+\.\d+\n$/, `"${stdout.trim()}" is not a version number`);
	},
};
