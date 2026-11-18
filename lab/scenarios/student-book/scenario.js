/**
 * A student's own book: the toolbelt creates it, empty, in a temporary student folder while the
 * classroom is open, and the list of books on the student's screen shows it next to the sample
 * book without a reload by hand. The new book opens, matches its index and has its glossary.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** @import { AutomaticScenario } from "#toolbelt" */
/** @import { Page } from "playwright" */

/** Waits until the frame shows a page whose main heading is `text`. */
async function shows(/** @type {Page} */ page, /** @type {string} */ text, failure = "") {
	await page
		.waitForFunction(
			(text) =>
				document.querySelector("iframe")?.contentDocument?.querySelector("h1")?.textContent ===
				text,
			text,
			{ timeout: 10_000 },
		)
		.catch(() => assert.fail(failure || `the classroom did not show "${text}"`));
}

/** @type {AutomaticScenario} */
export default {
	kind: "automatic",
	title: "A book the student creates shows in the classroom next to the sample book",
	async check({ feris, env, browser }) {
		const root = mkdtempSync(join(tmpdir(), "feris-scenario-"));
		// A student folder that does not exist yet, as on a fresh clone.
		env.FERIS_STUDENT_DIR = join(root, "student");
		try {
			const start = feris("classroom", "start");
			assert.equal(start.status, 0, `"feris classroom start" failed: ${start.stderr}`);
			const url = String(/open at (\S+) /.exec(start.stdout)?.[1]);

			const page = await (await browser()).newPage();
			await page.goto(url);
			await shows(page, "Books");
			const book = page.frameLocator("iframe[name=lesson]");
			assert.deepEqual(await book.locator("ul.books a").allTextContents(), ["Basic algebra"]);

			const created = feris(
				"book",
				"new",
				"algebra-lineal",
				"--title",
				"Álgebra lineal",
				"--language",
				"es",
			);
			assert.equal(created.status, 0, `"feris book new" failed: ${created.stderr}`);
			const check = feris("book", "check", "algebra-lineal");
			assert.equal(check.status, 0, `the new book does not match its index:\n${check.stderr}`);

			await book
				.getByRole("link", { name: "Álgebra lineal" })
				.waitFor({ timeout: 10_000 })
				.catch(() => assert.fail("the list of books did not show the new book by itself"));
			assert.deepEqual(
				await book.locator("ul.books a").allTextContents(),
				["Álgebra lineal", "Basic algebra"],
				"the list does not hold the student's book and the sample book",
			);

			await book.getByRole("link", { name: "Álgebra lineal" }).click();
			await shows(page, "Álgebra lineal", "the new book's index page did not open");
			assert.equal(await book.locator(".mismatches").count(), 0, "the index page reports flaws");
			const bar = page.locator("header.classroom-bar");
			await bar.locator("a.glossary").click();
			await shows(page, "Glosario", "the bar did not open the new book's glossary");
		} finally {
			feris("classroom", "stop");
			rmSync(root, { recursive: true, force: true });
		}
	},
};
