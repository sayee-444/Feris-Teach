/**
 * Live reload: editing a lesson file refreshes the lesson where it is open, and only there;
 * editing a book's index refreshes every page of the book. The shell around the pages never
 * reloads (ADR-0004).
 */
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** @import { AutomaticScenario } from "#toolbelt" */
/** @import { Browser, Frame, Page } from "playwright" */

const sample = fileURLToPath(new URL("../../../books/basic-algebra", import.meta.url));

/** Rewrites a file with `from` replaced by `to`. */
function edit(/** @type {string} */ file, /** @type {string} */ from, /** @type {string} */ to) {
	const text = readFileSync(file, "utf8");
	assert.ok(text.includes(from), `${file} does not hold "${from}"`);
	writeFileSync(file, text.replace(from, to));
}

/** Marks a window, so that a reload shows as the mark gone. */
const mark = (/** @type {Page | Frame} */ where) =>
	where.evaluate(() => {
		/** @type {any} */ (window).marked = true;
	});

/** Whether a window has not reloaded since it was marked. */
const marked = (/** @type {Page | Frame} */ where) =>
	where.evaluate(() => /** @type {any} */ (window).marked === true);

/**
 * Opens the classroom on a page of a book and waits until the page's live reload is connected.
 * The shell and the page are both marked.
 *
 * @param {Browser} browser
 * @param {string} url The classroom's address
 * @param {string} path The page's path
 */
async function open(browser, url, path) {
	const page = await browser.newPage();
	const connected = page.waitForEvent("console", (message) =>
		message.text().includes("[vite] connected"),
	);
	await page.goto(`${url}#${path}`);
	await connected;
	const frame = page.frame({ name: "lesson" });
	assert.ok(frame, "the classroom has no frame for the book");
	await page.waitForFunction(
		(path) => document.querySelector("iframe")?.contentWindow?.location.pathname === path,
		path,
	);
	await mark(page);
	await mark(frame);
	return { page, frame };
}

/** Waits until `selector`, in the shell or in its frame, shows `text`. */
async function waitForText(
	/** @type {Page | Frame} */ where,
	/** @type {string} */ selector,
	/** @type {string} */ text,
	/** @type {string} */ failure,
) {
	await where
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
	title: "Editing a lesson file refreshes the open lesson, and never the shell around it",
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
			const first = await open(chromium, url, "/books/algebra/lessons/01-variables.html");
			const second = await open(chromium, url, "/books/algebra/lessons/02-like-terms.html");

			edit(
				join(book, "lessons/01-variables.html"),
				"<h1>Variables and expressions</h1>",
				"<h1>Letters for numbers</h1>",
			);
			await waitForText(
				first.frame,
				"h1",
				"Letters for numbers",
				"the edited lesson did not refresh",
			);
			assert.equal(await marked(first.frame), false, "the edited lesson changed without a reload");
			assert.equal(await marked(first.page), true, "the shell reloaded with the lesson");
			await second.page.waitForTimeout(500);
			assert.equal(await marked(second.frame), true, "a lesson that did not change reloaded too");

			edit(join(book, "index.json"), '"title": "Basic algebra"', '"title": "Algebra, edited"');
			await waitForText(
				second.page,
				"header.classroom-bar .index",
				"Algebra, edited",
				"editing the index did not refresh the bar of the book",
			);
			assert.equal(await marked(second.page), true, "the shell reloaded with the book's index");
		} finally {
			feris("classroom", "stop");
			rmSync(root, { recursive: true, force: true });
		}
	},
};
