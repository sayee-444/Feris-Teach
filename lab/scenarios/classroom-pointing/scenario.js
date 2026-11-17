/**
 * Pointing and opening: the teacher opens a lesson, the glossary and the reference on the
 * student's screen, and points at elements on them, each with one call to the toolbelt. A real
 * headless browser shows the classroom, and the scenario looks at what the student would see:
 * which page is in the frame, which element stands out, and whether it is in sight.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** @import { AutomaticScenario, Tools } from "#toolbelt" */
/** @import { Frame, Page } from "playwright" */

const LESSON_1 = "/books/basic-algebra/lessons/01-variables.html";
const GLOSSARY = "/books/basic-algebra/glossary.html";
const REFERENCE = "/books/basic-algebra/reference/rules.html";

/** Runs a toolbelt command and fails, with its output, unless it succeeds silently. */
function succeeds(/** @type {Tools["feris"]} */ feris, /** @type {string[]} */ ...args) {
	const result = feris(...args);
	assert.equal(result.stderr, "", `"feris ${args.join(" ")}" said: ${result.stderr}`);
	assert.equal(result.status, 0, `"feris ${args.join(" ")}" failed`);
}

/**
 * Opens a page as soon as the shell listens for the teacher: a browser that has just loaded the
 * classroom may not be connected yet.
 */
async function firstOpen(/** @type {Tools["feris"]} */ feris, /** @type {string} */ page) {
	const deadline = Date.now() + 5_000;
	let result = feris("classroom", "open", page);
	while (result.stderr.includes("not open in a browser") && Date.now() < deadline) {
		await new Promise((resolve) => setTimeout(resolve, 100));
		result = feris("classroom", "open", page);
	}
	assert.equal(result.stderr, "", `the first page did not open: ${result.stderr}`);
}

/**
 * The page the frame shows, and the one the shell's address names. Both are asked of the
 * browser: Playwright's own record of them lags behind while `feris` runs, which blocks.
 */
const onScreen = (/** @type {Page} */ shell) =>
	shell.evaluate(() => ({
		frame: document.querySelector("iframe")?.contentWindow?.location.pathname,
		address: decodeURI(location.hash.slice(1)),
	}));

/** The ids of the elements that stand out with an outline, as the pointing draws it. */
const highlighted = (/** @type {Frame} */ frame) =>
	frame.evaluate(() =>
		[...document.querySelectorAll("[id]")]
			.filter((element) => {
				const style = getComputedStyle(element);
				return style.outlineStyle !== "none" && Number.parseFloat(style.outlineWidth) > 0;
			})
			.map((element) => element.id),
	);

/**
 * Whether the element with this id is in sight: `wholly`, or else in part. It runs in the page.
 *
 * @param {[id: string, wholly: boolean]} question
 */
function sight([id, wholly]) {
	const element = document.getElementById(id);
	if (!element) return false;
	const { top, bottom } = element.getBoundingClientRect();
	return wholly ? top >= 0 && bottom <= innerHeight : bottom > 0 && top < innerHeight;
}

/** Waits until the element with this id is wholly in sight, once any scrolling has finished. */
async function inSight(/** @type {Frame} */ frame, /** @type {string} */ id) {
	await frame
		.waitForFunction(sight, /** @type {[string, boolean]} */ ([id, true]), { timeout: 5_000 })
		.catch(() => assert.fail(`"${id}" was not scrolled into view`));
}

/** Whether the element with this id is in sight at all. */
const visible = (/** @type {Frame} */ frame, /** @type {string} */ id) =>
	frame.evaluate(sight, /** @type {[string, boolean]} */ ([id, false]));

/** @type {AutomaticScenario} */
export default {
	kind: "automatic",
	title: "The teacher opens pages and points at their elements, each in one call",
	async check({ feris, env, browser }) {
		const student = mkdtempSync(join(tmpdir(), "feris-scenario-"));
		env.FERIS_STUDENT_DIR = student;
		try {
			const start = feris("classroom", "start");
			assert.equal(start.status, 0, `"feris classroom start" failed: ${start.stderr}`);
			const url = String(/open at (\S+) /.exec(start.stdout)?.[1]);

			const shell = await (await browser()).newPage({ viewport: { width: 1000, height: 600 } });
			await shell.goto(url);
			const frame = shell.frame({ name: "lesson" });
			assert.ok(frame, "the classroom has no frame for the book");

			// Opening returns once the page is on screen, with the shell's address behind it.
			await firstOpen(feris, LESSON_1);
			assert.deepEqual(await onScreen(shell), { frame: LESSON_1, address: LESSON_1 });
			assert.deepEqual(await highlighted(frame), [], "something stands out before any pointing");
			assert.equal(await visible(frame, "evaluate-steps"), false, "the steps start in sight");

			succeeds(feris, "classroom", "point", "evaluate-steps");
			assert.deepEqual(await highlighted(frame), ["evaluate-steps"]);
			await inSight(frame, "evaluate-steps");

			succeeds(feris, "classroom", "point", "variable");
			assert.deepEqual(
				await highlighted(frame),
				["variable"],
				"a new point does not replace the one before",
			);
			await inSight(frame, "variable");

			const missing = feris("classroom", "point", "nowhere");
			assert.equal(missing.status, 1);
			assert.equal(
				missing.stderr,
				`feris: there is no element "nowhere" on the page on screen, ${LESSON_1}.\n`,
			);
			assert.deepEqual(
				await highlighted(frame),
				["variable"],
				"pointing at nothing moved the point",
			);

			succeeds(feris, "classroom", "point", "--clear");
			assert.deepEqual(await highlighted(frame), [], "the pointing was not cleared");

			succeeds(feris, "classroom", "open", GLOSSARY.slice(1));
			assert.deepEqual(await onScreen(shell), { frame: GLOSSARY, address: GLOSSARY });
			succeeds(feris, "classroom", "point", "variable");
			assert.deepEqual(await highlighted(frame), ["variable"]);
			await inSight(frame, "variable");

			// A path written the long way opens the same page.
			succeeds(
				feris,
				"classroom",
				"open",
				"/books/basic-algebra/lessons/../reference/./rules.html",
			);
			assert.deepEqual(await onScreen(shell), { frame: REFERENCE, address: REFERENCE });
			assert.deepEqual(
				await highlighted(frame),
				[],
				"the point of the page left behind is still shown",
			);

			// The student can still move on their own, and the address follows them.
			await shell.goBack();
			await frame.waitForURL((address) => address.pathname === GLOSSARY);
		} finally {
			feris("classroom", "stop");
			rmSync(student, { recursive: true, force: true });
		}
	},
};
