/**
 * The classroom serves the sample book: a student moves between its lessons, glossary and
 * reference in a real headless browser, the quizzes answer, light and dark both work, and
 * stopping the classroom leaves no process behind.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** @import { AutomaticScenario } from "#toolbelt" */
/** @import { Page } from "playwright" */

/** The page's main heading. */
const heading = (/** @type {Page} */ page) => page.locator("h1").textContent();

/** The colour of the page's background. */
const background = (/** @type {Page} */ page) =>
	page.evaluate(() => getComputedStyle(document.body).backgroundColor);

const LIGHT = "rgb(255, 255, 248)";
const DARK = "rgb(27, 26, 23)";

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
	title: "The classroom serves the sample book, and stops without a trace",
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
			await page.getByRole("link", { name: "Basic algebra" }).click();
			assert.equal(await heading(page), "Basic algebra", "the book's index page did not open");
			const lessons = await page.locator(".chapter ul.lessons li").allTextContents();
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
			assert.equal(await page.locator("li.planned a").count(), 0, "a planned lesson is a link");

			const bar = page.locator("nav.classroom-bar");
			await page.getByRole("link", { name: "Variables and expressions" }).click();
			assert.equal(await heading(page), "Variables and expressions");
			await bar.locator("a[rel=next]").click();
			assert.equal(await heading(page), "Combining like terms", "Next did not go to lesson 2");
			await bar.locator("a[rel=prev]").click();
			assert.equal(await heading(page), "Variables and expressions", "Previous did not go back");
			await bar.locator("a.glossary").click();
			assert.equal(await heading(page), "Glossary", "the bar did not open the glossary");
			await bar.locator("a.reference").click();
			assert.equal(await heading(page), "Rules at a glance", "the bar did not open the reference");
			await bar.locator("a.index").click();
			assert.equal(
				await heading(page),
				"Basic algebra",
				"the bar did not go back to the index page",
			);

			await page.getByRole("link", { name: "Graphing a line" }).click();
			assert.ok(await page.locator("figure#chart svg").isVisible(), "the chart is not shown");
			const quiz = page.locator(".quiz").first();
			await quiz.getByRole("button", { name: "−2" }).click();
			assert.equal(await quiz.getAttribute("class"), "quiz answered", "the quiz did not answer");
			assert.ok(await quiz.locator(".explanation").isVisible(), "the explanation is hidden");
			assert.match(String(await quiz.locator("button.incorrect").textContent()), /−2/);
			const prediction = page.locator(".prediction").first();
			await prediction.locator("input").fill("-4");
			await prediction.getByRole("button", { name: "Check" }).click();
			assert.equal(await prediction.locator(".verdict").textContent(), "Exactly! -4");
			assert.equal(await page.locator(".score").textContent(), "1 / 2 of 3");

			assert.equal(await background(page), LIGHT, "the light theme is not light");
			await page.emulateMedia({ colorScheme: "dark" });
			assert.equal(await background(page), DARK, "the system's dark theme is not followed");
			await bar.locator("button.theme").click();
			assert.equal(await background(page), LIGHT, "the switch did not turn the page light");
			await page.reload();
			assert.equal(await background(page), LIGHT, "the chosen theme was forgotten on reload");
			await bar.locator("button.theme").click();
			assert.equal(await background(page), DARK, "the switch did not turn the page dark");

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
