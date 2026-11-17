/**
 * The classroom state: what the student has on screen and has answered, for the teacher to read
 * in one call.
 *
 * The shell watches the page in its frame and reports to the classroom's server (ADR-0004): the
 * view and the selection each time they change, and each quiz answer as it is given. The server
 * holds the latest view and every answer for as long as it runs, which is the length of the
 * class, so a page that reloads, and even a shell that reloads, forgets nothing.
 */

/** @import { Answer, BookIndex, ClassroomState, Selection, View } from "../types.js" */

/**
 * What the shell reports about the page on screen.
 *
 * @typedef {object} ViewReport
 * @property {string | null} page The page's path in the classroom, or nothing when no page is
 *   on screen
 * @property {View} view
 * @property {Selection | null} selection
 */

/**
 * What the shell reports when the student answers a quiz.
 *
 * @typedef {object} AnswerReport
 * @property {string} page The path of the page the quiz is on
 * @property {string | null} quiz
 * @property {string} question
 * @property {string} answer
 * @property {boolean} correct
 */

/**
 * The book and the lesson a page of the classroom belongs to.
 *
 * @callback Locate
 * @param {string} page A page's path in the classroom
 * @returns {{ book: string | null, lesson: string | null }}
 */

/**
 * Where the classroom answers with its state, and where the shell sends its reports.
 *
 * @package
 */
export const PATHS = {
	state: "/control/state",
	view: "/shell/view",
	answer: "/shell/answer",
};

/** Whether a value is a string. */
const isText = (/** @type {unknown} */ value) => typeof value === "string";

/** Whether a value is a list of strings. */
const isTextList = (/** @type {unknown} */ value) =>
	Array.isArray(value) && value.every((item) => isText(item));

/**
 * Reads a view report, or nothing when it is not one.
 *
 * @param {unknown} body The report, parsed from JSON
 * @returns {ViewReport | undefined}
 * @package
 */
export function viewReport(body) {
	const report = /** @type {any} */ (body);
	if (typeof report !== "object" || report === null) return undefined;
	const { page, view, selection } = report;
	if (page !== null && !isText(page)) return undefined;
	if (!isTextList(view?.sections) || !isTextList(view?.paragraphs)) return undefined;
	if (
		selection !== null &&
		!(isText(selection?.text) && (selection.within === null || isText(selection.within)))
	) {
		return undefined;
	}
	return {
		page,
		view: { sections: view.sections, paragraphs: view.paragraphs },
		selection: selection === null ? null : { text: selection.text, within: selection.within },
	};
}

/**
 * Reads an answer report, or nothing when it is not one.
 *
 * @param {unknown} body The report, parsed from JSON
 * @returns {AnswerReport | undefined}
 * @package
 */
export function answerReport(body) {
	const report = /** @type {any} */ (body);
	if (typeof report !== "object" || report === null) return undefined;
	const { page, quiz, question, answer, correct } = report;
	if (!isText(page) || !(quiz === null || isText(quiz))) return undefined;
	if (!isText(question) || !isText(answer) || typeof correct !== "boolean") return undefined;
	return { page, quiz, question, answer, correct };
}

/**
 * The lesson a page of a book is, by the index's id, or nothing when the page is not a lesson.
 *
 * @param {BookIndex} index
 * @param {string} file The page, from the book's folder
 * @package
 */
export function lessonAt(index, file) {
	for (const chapter of index.chapters) {
		for (const lesson of chapter.lessons) if (lesson.file === file) return lesson.id;
	}
	return null;
}

/**
 * The record of one class: the latest view and every answer, in the order they were given.
 *
 * @param {Locate} locate
 * @package
 */
export function classRecord(locate) {
	/** @type {ViewReport} */
	let latest = { page: null, view: { sections: [], paragraphs: [] }, selection: null };
	/** @type {Answer[]} */
	const answers = [];
	return {
		/** Keeps what is on screen now, in place of what was before. */
		see(/** @type {ViewReport} */ report) {
			latest = report;
		},
		/** Adds an answer to the class's answers. */
		answer(/** @type {AnswerReport} */ report) {
			const { page, quiz, question, answer, correct } = report;
			answers.push({ page, ...locate(page), quiz, question, answer, correct });
		},
		/** @returns {ClassroomState} */
		state() {
			const where = latest.page === null ? { book: null, lesson: null } : locate(latest.page);
			return {
				page: latest.page,
				...where,
				view: latest.view,
				selection: latest.selection,
				answers: [...answers],
			};
		},
	};
}

/**
 * Reads the state of the classroom being served at `url`.
 *
 * @param {string} url The classroom's home page
 * @returns {Promise<ClassroomState>}
 */
export async function classroomState(url) {
	const response = await fetch(new URL(PATHS.state, url));
	if (!response.ok) {
		throw new Error(`the classroom answered ${response.status} when asked for its state`);
	}
	return /** @type {ClassroomState} */ (await response.json());
}
