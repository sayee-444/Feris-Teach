/**
 * The classroom serves the sample book: a student moves between its lessons, glossary and
 * reference in a real headless browser while the shell stays the same page, the quizzes
 * answer, light and dark both work, and stopping the classroom leaves no process behind.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** @import { AutomaticScenario } from "#toolbelt" */
/** @import { Page } from "playwright" */

const LIGHT = "rgb(255, 255, 248)";
const DARK = "rgb(27, 26, 23)";

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

/** The colours of the shell's bar and of the page in the frame. */
function backgrounds(/** @type {Page} */ page) {
	return page.evaluate(() => {
		const colour = (/** @type {Element | null | undefined} */ element) =>
			element ? getComputedStyle(element).backgroundColor : "";
		return {
			shell: colour(document.querySelector("header.classroom-bar")),
			page: colour(document.querySelector("iframe")?.contentDocument?.body),
		};
	});
}

/** Whether a process with this id is running. */
function isRunning(/** @type {number} */ pid) {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

/** @type {AutomaticScenario} */
export default {
	kind: "automatic",
	title: "The classroom serves the sample book in one page, and stops without a trace",
	async check({ feris, env, browser }) {
		const student = mkdtempSync(join(tmpdir(), "feris-scenario-"));
		env.FERIS_STUDENT_DIR = student;
		try {
			const start = feris("classroom", "start");
			assert.equal(start.status, 0, `"feris classroom start" failed: ${start.stderr}`);
			const opened = /open at (\S+) \(process (\d+)\)/.exec(start.stdout);
			assert.ok(opened, `"${start.stdout.trim()}" does not say where the classroom is open`);
			const url = String(opened[1]);
			const pid = Number(opened[2]);

			const page = await (await browser()).newPage();
			await page.emulateMedia({ colorScheme: "light" });
			await page.goto(url);
			await page.evaluate(() => {
				/** @type {any} */ (window).shell = true;
			});
			const book = page.frameLocator("iframe[name=lesson]");
			const bar = page.locator("header.classroom-bar");

			await shows(page, "Books");
			await book.getByRole("link", { name: "Basic algebra" }).click();
			await shows(page, "Basic algebra", "the book's index page did not open");
			const lessons = await book.locator(".chapter ul.lessons li").allTextContents();
			assert.deepEqual(
				lessons.map((lesson) => lesson.trim()),
				[
					"1.1 Variables and expressions",
					"1.2 Combining like terms",
					"2.1 Solving a linear equation",
					"2.2 Graphing a line",
					"2.3 Systems of two equations (planned)",
				],
				"the index page does not list the lessons in the index's order",
			);
			assert.equal(await book.locator("li.planned a").count(), 0, "a planned lesson is a link");

			await book.getByRole("link", { name: "Variables and expressions" }).click();
			await shows(page, "Variables and expressions");
			await bar.locator("a[rel=next]").click();
			await shows(page, "Combining like terms", "Next did not go to lesson 1.2");
			await bar.locator("a[rel=prev]").click();
			await shows(page, "Variables and expressions", "Previous did not go back");
			await bar.locator("a.glossary").click();
			await shows(page, "Glossary", "the bar did not open the glossary");
			await bar.locator("a.reference").click();
			await shows(page, "Rules at a glance", "the bar did not open the reference");
			await bar.locator("a.index").click();
			await shows(page, "Basic algebra", "the bar did not go back to the index page");
			await page
				.waitForURL(/#\/books\/basic-algebra\/$/, { timeout: 5_000 })
				.catch(() => assert.fail(`the address does not follow the page: ${page.url()}`));

			await book.getByRole("link", { name: "Graphing a line" }).click();
			await shows(page, "Graphing a line");
			assert.ok(await book.locator("figure#chart svg").isVisible(), "the chart is not shown");
			const quiz = book.locator(".quiz").first();
			await quiz.getByRole("button", { name: "−2" }).click();
			assert.equal(await quiz.getAttribute("class"), "quiz answered", "the quiz did not answer");
			assert.ok(await quiz.locator(".explanation").isVisible(), "the explanation is hidden");
			assert.match(String(await quiz.locator("button.incorrect").textContent()), /−2/);
			const prediction = book.locator(".prediction").first();
			await prediction.locator("input").fill("-4");
			await prediction.getByRole("button", { name: "Check" }).click();
			assert.equal(await prediction.locator(".verdict").textContent(), "Exactly! -4");
			assert.equal(await book.locator(".score").textContent(), "1 / 2 of 3");

			assert.equal(
				await page.evaluate(() => /** @type {any} */ (window).shell),
				true,
				"the shell reloaded while the student moved around the book",
			);

			assert.deepEqual(await backgrounds(page), { shell: LIGHT, page: LIGHT });
			await page.emulateMedia({ colorScheme: "dark" });
			assert.deepEqual(
				await backgrounds(page),
				{ shell: DARK, page: DARK },
				"the system's dark theme is not followed",
			);
			await bar.locator("button.theme").click();
			assert.deepEqual(
				await backgrounds(page),
				{ shell: LIGHT, page: LIGHT },
				"the switch did not turn the shell and the page light",
			);
			await page.reload();
			await shows(page, "Graphing a line", "a reload did not come back to the same page");
			assert.deepEqual(
				await backgrounds(page),
				{ shell: LIGHT, page: LIGHT },
				"the chosen theme was forgotten on reload",
			);

			const direct = await (await browser()).newPage();
			await direct.goto(`${url}books/basic-algebra/glossary.html`);
			await shows(direct, "Glossary", "a page opened on its own did not move into the shell");
			assert.equal(await direct.locator("iframe[name=lesson]").count(), 1);

			const stop = feris("classroom", "stop");
			assert.equal(stop.status, 0, `"feris classroom stop" failed: ${stop.stderr}`);
			assert.equal(isRunning(pid), false, `the classroom's process ${pid} is still running`);
			await assert.rejects(fetch(url), TypeError, "the classroom still answers after it stopped");
		} finally {
			feris("classroom", "stop");
			rmSync(student, { recursive: true, force: true });
		}
	},
};
