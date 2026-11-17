/**
 * The classroom state: a student moves around the sample book in a real headless browser,
 * scrolls, selects text and answers quizzes, and after each step `feris classroom state` tells
 * the teacher the page, the book, the lesson, the view, the selection and every answer so far.
 * The answers outlast the pages they were given on, and the shell reloading.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** @import { AutomaticScenario, Tools } from "#toolbelt" */
/** @import { ClassroomState } from "#classroom" */

const LESSON_1 = "/books/basic-algebra/lessons/01-variables.html";
const LESSON_2 = "/books/basic-algebra/lessons/02-like-terms.html";

/**
 * Reads the classroom state until it is what `wanted` expects: the shell reports a moment after
 * the student acts, as a page would.
 *
 * @param {Tools["feris"]} feris
 * @param {(state: ClassroomState) => boolean} wanted
 * @param {string} failure What went wrong when the state never comes
 * @returns {Promise<ClassroomState>}
 */
async function stateWhen(feris, wanted, failure) {
	const deadline = Date.now() + 5_000;
	/** @type {ClassroomState | undefined} */
	let state;
	while (Date.now() < deadline) {
		const result = feris("classroom", "state");
		assert.equal(result.status, 0, `"feris classroom state" failed: ${result.stderr}`);
		state = /** @type {ClassroomState} */ (JSON.parse(result.stdout));
		if (wanted(state)) return state;
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	return assert.fail(`${failure}. The state is:\n${JSON.stringify(state, null, 2)}`);
}

/** @type {AutomaticScenario} */
export default {
	kind: "automatic",
	title: "The teacher reads what the student has on screen, selected and answered, in one call",
	async check({ feris, env, browser }) {
		const student = mkdtempSync(join(tmpdir(), "feris-scenario-"));
		env.FERIS_STUDENT_DIR = student;
		try {
			const start = feris("classroom", "start");
			assert.equal(start.status, 0, `"feris classroom start" failed: ${start.stderr}`);
			const url = String(/open at (\S+) /.exec(start.stdout)?.[1]);

			const page = await (await browser()).newPage({ viewport: { width: 1000, height: 700 } });
			await page.goto(url);
			const book = page.frameLocator("iframe[name=lesson]");
			const bar = page.locator("header.classroom-bar");

			const library = await stateWhen(
				feris,
				(state) => state.page === "/books/",
				"the state does not show the list of books the classroom opens on",
			);
			assert.deepEqual(
				{ book: library.book, lesson: library.lesson, view: library.view },
				{ book: null, lesson: null, view: { sections: [], paragraphs: [] } },
			);

			await book.getByRole("link", { name: "Basic algebra" }).click();
			const index = await stateWhen(
				feris,
				(state) => state.page === "/books/basic-algebra/",
				"the state does not follow the student to the book's index page",
			);
			assert.deepEqual([index.book, index.lesson], ["basic-algebra", null]);

			await book.getByRole("link", { name: "Variables and expressions" }).click();
			const top = await stateWhen(
				feris,
				(state) => state.page === LESSON_1,
				"the state does not follow the student to lesson 1.1",
			);
			assert.deepEqual([top.book, top.lesson], ["basic-algebra", "variables"]);
			assert.equal(top.view.sections[0], "the-idea", "the view does not start at the top");
			assert.equal(top.view.paragraphs[0], "variable");
			assert.ok(!top.view.sections.includes("check"), "the end of the lesson is in view");

			await book.locator("#evaluate-steps").scrollIntoViewIfNeeded();
			const middle = await stateWhen(
				feris,
				(state) => state.view.paragraphs.includes("evaluate-steps"),
				"the view does not follow the student scrolling to the steps of section 3",
			);
			assert.ok(middle.view.sections.includes("evaluating"));
			assert.ok(!middle.view.paragraphs.includes("variable"), "the top is still in view");

			await book.locator("#terms").selectText();
			const selected = await stateWhen(
				feris,
				(state) => state.selection !== null,
				"the state does not show the text the student selected",
			);
			assert.deepEqual(selected.selection, {
				text: "The parts joined by + or − are its terms. 3x + 5 has two terms: 3x, which depends on x, and 5, a constant that does not.",
				within: "terms",
			});

			await book.locator("#evaluate-predict input").fill("11");
			await book.locator("#evaluate-predict").getByRole("button", { name: "Check" }).click();
			await book.locator("#coefficient-quiz").getByRole("button", { name: "−2" }).click();
			const bottom = await stateWhen(
				feris,
				(state) => state.answers.length === 2 && state.view.sections.includes("check"),
				"the state does not show the two answers given in lesson 1.1",
			);
			assert.deepEqual(bottom.answers, [
				{
					page: LESSON_1,
					book: "basic-algebra",
					lesson: "variables",
					quiz: "evaluate-predict",
					question: "What is the value of 2a + 3 when a = 4?",
					answer: "11",
					correct: true,
				},
				{
					page: LESSON_1,
					book: "basic-algebra",
					lesson: "variables",
					quiz: "coefficient-quiz",
					question: "In the expression 5y − 2, what is the coefficient of y?",
					answer: "−2",
					correct: false,
				},
			]);

			await bar.locator("a[rel=next]").click();
			const next = await stateWhen(
				feris,
				(state) => state.page === LESSON_2,
				"the state does not follow the student to lesson 1.2",
			);
			assert.equal(next.lesson, "like-terms");
			assert.equal(next.view.sections[0], "like-terms");
			assert.equal(next.selection, null, "the selection of the page left behind is still shown");
			assert.equal(next.answers.length, 2, "the answers of lesson 1.1 were forgotten");

			await book.locator("#shortest-quiz").getByRole("button", { name: "5y + 2" }).click();
			await stateWhen(
				feris,
				(state) => state.answers.length === 3,
				"the answer given in lesson 1.2 was not added",
			);
			await page.reload();
			const reloaded = await stateWhen(
				feris,
				(state) => state.page === LESSON_2,
				"the state does not show the lesson after the shell reloaded",
			);
			assert.deepEqual(
				reloaded.answers.map(({ lesson, quiz, answer, correct }) => ({
					lesson,
					quiz,
					answer,
					correct,
				})),
				[
					{ lesson: "variables", quiz: "evaluate-predict", answer: "11", correct: true },
					{ lesson: "variables", quiz: "coefficient-quiz", answer: "−2", correct: false },
					{ lesson: "like-terms", quiz: "shortest-quiz", answer: "5y + 2", correct: true },
				],
				"the class's answers did not outlast the shell reloading",
			);
		} finally {
			feris("classroom", "stop");
			rmSync(student, { recursive: true, force: true });
		}
	},
};
