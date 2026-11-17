/**
 * Live reload: editing a lesson file refreshes the page where it is open, and only there;
 * editing a book's index refreshes every page of the book.
 */
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** @import { AutomaticScenario } from "#toolbelt" */
/** @import { Browser, Page } from "playwright" */

const sample = fileURLToPath(new URL("../../../books/basic-algebra", import.meta.url));

/** Rewrites a file with `from` replaced by `to`. */
function edit(/** @type {string} */ file, /** @type {string} */ from, /** @type {string} */ to) {
	const text = readFileSync(file, "utf8");
	assert.ok(text.includes(from), `${file} does not hold "${from}"`);
	writeFileSync(file, text.replace(from, to));
}

/**
 * Opens a page and waits until its live reload is connected. The page is marked, so a reload
 * shows as the mark gone.
 *
 * @param {Browser} browser
 * @param {string} url
 */
async function open(browser, url) {
	const page = await browser.newPage();
	const connected = page.waitForEvent("console", (message) =>
		message.text().includes("[vite] connected"),
	);
	await page.goto(url);
	await connected;
	await page.evaluate(() => {
		/** @type {any} */ (window).marked = true;
	});
	return page;
}

/** Whether the page has not reloaded since it was opened. */
const marked = (/** @type {Page} */ page) =>
	page.evaluate(() => /** @type {any} */ (window).marked === true);

/** Waits until `selector` shows `text`, or fails saying what was expected. */
async function waitForText(
	/** @type {Page} */ page,
	/** @type {string} */ selector,
	/** @type {string} */ text,
	/** @type {string} */ failure,
) {
	await page
		.waitForFunction(
			([selector, text]) => document.querySelector(String(selector))?.textContent === text,
			[selector, text],
			{ timeout: 10_000 },
		)
		.catch(() => assert.fail(failure));
}

/** @type {AutomaticScenario} */
export default {
	kind: "automatic",
	title: "Editing a lesson file refreshes the open page without a manual reload",
	async check({ feris, env, browser }) {
		const root = mkdtempSync(join(tmpdir(), "feris-scenario-"));
		const book = join(root, "books", "algebra");
		cpSync(sample, book, { recursive: true });
		env.FERIS_BOOKS_DIR = join(root, "books");
		env.FERIS_STUDENT_DIR = join(root, "student");
		try {
			const start = feris("classroom", "start");
			assert.equal(start.status, 0, `"feris classroom start" failed: ${start.stderr}`);
			const url = String(/open at (\S+) /.exec(start.stdout)?.[1]);

			const chromium = await browser();
			const first = await open(chromium, `${url}books/algebra/lessons/01-variables.html`);
			const second = await open(chromium, `${url}books/algebra/lessons/02-like-terms.html`);

			edit(
				join(book, "lessons/01-variables.html"),
				"<h1>Variables and expressions</h1>",
				"<h1>Letters for numbers</h1>",
			);
			await waitForText(first, "h1", "Letters for numbers", "the edited lesson did not refresh");
			assert.equal(await marked(first), false, "the edited lesson changed without a reload");
			await second.waitForTimeout(500);
			assert.equal(await marked(second), true, "a lesson that did not change reloaded too");

			edit(join(book, "index.json"), '"title": "Basic algebra"', '"title": "Algebra, edited"');
			await waitForText(
				second,
				"nav.classroom-bar .index",
				"Algebra, edited",
				"editing the index did not refresh the pages of the book",
			);
		} finally {
			feris("classroom", "stop");
			rmSync(root, { recursive: true, force: true });
		}
	},
};
