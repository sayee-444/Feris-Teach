/**
 * The spoken version: given replies with code, tables and links, the voice service speaks only
 * what the teacher marked to be heard, as plain text, sentence by sentence. The real voice service runs with the lab's
 * fake engine and fake player, which records what it would have played.
 */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** @import { AutomaticScenario, Tools } from "#toolbelt" */

/** A reply that ends with its spoken version, marked. */
const MARKED = `Una **variable** es una letra que guarda un número. Mira el ejemplo:

\`\`\`js
let x = 3;
\`\`\`

| x | 2x + 1 |
|---|--------|
| 1 | 3      |

Tienes más en [la lección 1](https://example.com/lesson-1) y en https://example.com/more.

<spoken>
Una variable es una letra que guarda un número. En el ejemplo, la [x](https://example.com/x) vale tres \`let x = 3\`.

¿Cuánto vale **dos x más uno** si x vale uno?
</spoken>`;

/** A reply with no spoken version marked: nothing of it is spoken. */
const UNMARKED = `Una variable guarda un número, como en \`x = 3\`. Mira la [guía](https://example.com).

\`\`\`python
print(x)
\`\`\``;

/**
 * A reply whose spoken version is written carelessly, as Markdown: only its plain text is
 * spoken. The mark shown as code in the text before it is not a mark.
 */
const CARELESS = `El bloque va entre \`<spoken>\` y su cierre.

<spoken>
## Variables

- La primera idea: una letra 📘.
- Lo demás, en [la guía](https://example.com/guide).

x | y
--|--
1 | 2

\`\`\`
let y = 2;
\`\`\`\`

Y ahora, ¿qué es |x|? Piénsalo.
</spoken>`;

/** Runs a toolbelt command and fails, with its output, unless it succeeds. */
function succeeds(/** @type {Tools["feris"]} */ feris, /** @type {string[]} */ ...args) {
	const result = feris(...args);
	assert.equal(result.status, 0, `"feris ${args.join(" ")}" failed: ${result.stderr}`);
	return result.stdout;
}

/** What the fake player was given so far, one sentence after another. */
function played(/** @type {string} */ record) {
	if (!existsSync(record)) return [];
	return readFileSync(record, "utf8")
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line).sentence);
}

/** Waits until the voice has said all it had to say. */
async function quiet(/** @type {Tools["feris"]} */ feris) {
	const deadline = Date.now() + 10_000;
	for (;;) {
		const status = JSON.parse(succeeds(feris, "voice", "status"));
		if (status.speaking === null && status.queued.length === 0) return;
		assert.ok(Date.now() < deadline, `the voice did not finish: ${JSON.stringify(status)}`);
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
}

/** @type {AutomaticScenario} */
export default {
	kind: "automatic",
	title: "Only the marked spoken version of a reply is spoken, without code, tables or links",
	async check({ feris, env }) {
		const student = mkdtempSync(join(tmpdir(), "feris-scenario-"));
		const record = join(student, "played.jsonl");
		writeFileSync(
			join(student, "voice.toml"),
			`[engine]\nname = "fake"\n\n[player]\nname = "fake"\nrecord = '${record}'\n`,
		);
		env.FERIS_STUDENT_DIR = student;
		try {
			succeeds(feris, "voice", "start");

			succeeds(feris, "voice", "say", MARKED);
			await quiet(feris);
			assert.deepEqual(played(record), [
				"Una variable es una letra que guarda un número.",
				"En el ejemplo, la x vale tres.",
				"¿Cuánto vale dos x más uno si x vale uno?",
			]);

			rmSync(record);
			succeeds(feris, "voice", "say", UNMARKED);
			succeeds(feris, "voice", "say", CARELESS);
			await quiet(feris);
			assert.deepEqual(played(record), [
				"Variables",
				"La primera idea: una letra.",
				"Lo demás, en la guía.",
				"Y ahora, ¿qué es |x|?",
				"Piénsalo.",
			]);
		} finally {
			feris("voice", "shutdown");
			rmSync(student, { recursive: true, force: true });
		}
	},
};
