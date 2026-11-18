/**
 * Silencing the voice: stopping it cuts the sentence it is on at once, drops the rest, and
 * reports the last sentence heard and the sentences not heard; turned off, it says nothing
 * until it is turned on. The real voice service runs with the lab's fake engine and fake
 * player, which stays on the second sentence until it is stopped, as if the student cut the
 * teacher off there.
 */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** @import { AutomaticScenario, Tools } from "#toolbelt" */

const REPLY =
	"<spoken>Una ecuación es una igualdad con una incógnita. Resolverla es hallar su valor. " +
	"Para eso se despeja la x. ¿Qué harías primero con dos x más tres igual a siete?</spoken>";

/** Runs a toolbelt command and fails, with its output, unless it succeeds. */
function succeeds(/** @type {Tools["feris"]} */ feris, /** @type {string[]} */ ...args) {
	const result = feris(...args);
	assert.equal(result.status, 0, `"feris ${args.join(" ")}" failed: ${result.stderr}`);
	return result.stdout;
}

/** What the fake player was given so far, and whether each sentence was cut. */
function played(/** @type {string} */ record) {
	if (!existsSync(record)) return [];
	return readFileSync(record, "utf8")
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line));
}

const pause = (/** @type {number} */ ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Waits until the voice's status passes a test, and returns that status. */
async function until(
	/** @type {Tools["feris"]} */ feris,
	/** @type {(status: any) => boolean} */ test,
	/** @type {string} */ what,
) {
	const deadline = Date.now() + 10_000;
	for (;;) {
		const status = JSON.parse(succeeds(feris, "voice", "status"));
		if (test(status)) return status;
		assert.ok(Date.now() < deadline, `${what}: ${JSON.stringify(status)}`);
		await pause(50);
	}
}

/** @type {AutomaticScenario} */
export default {
	kind: "automatic",
	title: "Stopping the voice cuts it at once and reports what went unheard; off keeps it silent",
	async check({ feris, env }) {
		const student = mkdtempSync(join(tmpdir(), "feris-scenario-"));
		const record = join(student, "played.jsonl");
		writeFileSync(
			join(student, "voice.toml"),
			`[engine]\nname = "fake"\n\n[player]\nname = "fake"\nrecord = '${record}'\nhold_on = 2\n`,
		);
		env.FERIS_STUDENT_DIR = student;
		try {
			succeeds(feris, "voice", "start");
			succeeds(feris, "voice", "say", REPLY);
			const speaking = await until(
				feris,
				(status) => status.speaking === "Resolverla es hallar su valor.",
				"the voice never reached the second sentence",
			);
			assert.deepEqual(speaking.queued, [
				"Para eso se despeja la x.",
				"¿Qué harías primero con dos x más tres igual a siete?",
			]);

			const report = JSON.parse(succeeds(feris, "voice", "stop"));
			assert.deepEqual(report, {
				cut: true,
				lastHeard: "Resolverla es hallar su valor.",
				unheard: [
					"Para eso se despeja la x.",
					"¿Qué harías primero con dos x más tres igual a siete?",
				],
			});
			const after = JSON.parse(succeeds(feris, "voice", "status"));
			assert.deepEqual(after, { on: true, speaking: null, queued: [] }, "the voice goes on");
			await pause(300);
			assert.deepEqual(played(record), [
				{ sentence: "Una ecuación es una igualdad con una incógnita.", cut: false },
				{ sentence: "Resolverla es hallar su valor.", cut: true },
			]);

			assert.deepEqual(
				JSON.parse(succeeds(feris, "voice", "stop")),
				{ cut: false },
				"stopping a silent voice reports a cut",
			);

			assert.equal(succeeds(feris, "voice", "off"), "The voice is off.\n");
			assert.equal(
				succeeds(feris, "voice", "say", "<spoken>Esto no se oye.</spoken>"),
				"The voice is off: nothing was said.\n",
			);
			assert.equal((await until(feris, () => true, "")).on, false);
			assert.equal(succeeds(feris, "voice", "on"), "The voice is on.\n");
			succeeds(feris, "voice", "say", "<spoken>Ya se me oye otra vez.</spoken>");
			await until(
				feris,
				(status) => status.speaking === null && status.queued.length === 0,
				"the voice did not finish",
			);
			assert.deepEqual(
				played(record)
					.slice(2)
					.map(({ sentence }) => sentence),
				["Ya se me oye otra vez."],
				"the voice spoke while it was off, or not once it was on",
			);
		} finally {
			feris("voice", "shutdown");
			rmSync(student, { recursive: true, force: true });
		}
	},
};
