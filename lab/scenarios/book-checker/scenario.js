/**
 * The book checker passes on the sample book and reports each mismatch on a broken copy of it,
 * both from the toolbelt and on the book's index page in a real headless browser.
 */
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** @import { AutomaticScenario } from "#toolbelt" */

const sample = fileURLToPath(new URL("../../../books/basic-algebra", import.meta.url));

const MISMATCHES = [
	"lessons/02-like-terms.html: the index lists it, but the page is missing",
	'lessons/03-solving.html: the index calls it "Solving a linear equation", but its <title> is "Equations"',
	"lessons/99-stray.html: the page is in the book, but not in the index",
];

/** @type {AutomaticScenario} */
export default {
	kind: "automatic",
	title: "The book checker passes on the sample book and reports each mismatch on a broken one",
	async check({ feris, env, browser }) {
		const sound = feris("book", "check", "basic-algebra");
		assert.equal(sound.status, 0, `the sample book does not match its index:\n${sound.stderr}`);

		const root = mkdtempSync(join(tmpdir(), "feris-scenario-"));
		const book = join(root, "books", "broken");
		cpSync(sample, book, { recursive: true });
		rmSync(join(book, "lessons/02-like-terms.html"));
		writeFileSync(join(book, "lessons/03-solving.html"), "<title>Equations</title>");
		writeFileSync(join(book, "lessons/99-stray.html"), "<title>Stray</title>");
		env.FERIS_BOOKS_DIR = join(root, "books");
		env.FERIS_STUDENT_DIR = join(root, "student");
		try {
			const broken = feris("book", "check", "broken");
			assert.equal(broken.status, 1, "the broken book passed the check");
			for (const mismatch of MISMATCHES) {
				assert.ok(broken.stderr.includes(`  - ${mismatch}\n`), `not reported: ${mismatch}`);
			}

			const start = feris("classroom", "start");
			assert.equal(start.status, 0, `"feris classroom start" failed: ${start.stderr}`);
			const url = String(/open at (\S+) /.exec(start.stdout)?.[1]);
			const page = await (await browser()).newPage();
			await page.goto(`${url}#/books/broken/`);
			const mismatches = page.frameLocator("iframe[name=lesson]").locator(".mismatches li");
			await mismatches.first().waitFor({ timeout: 10_000 });
			const shown = await mismatches.allTextContents();
			assert.deepEqual(shown, MISMATCHES, "the index page does not show the mismatches");
		} finally {
			feris("classroom", "stop");
			rmSync(root, { recursive: true, force: true });
		}
	},
};
