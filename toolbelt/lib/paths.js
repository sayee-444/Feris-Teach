/**
 * Where the toolbelt finds things on disk. Each folder can be pointed elsewhere with an
 * environment variable, which is how the tests and the lab's scenarios run the toolbelt against
 * folders of their own.
 */
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** The repo's own folder for `name`. */
function inRepo(/** @type {string} */ name) {
	return fileURLToPath(new URL(`../../${name}`, import.meta.url));
}

/**
 * The student folder (ADR-0002); `FERIS_STUDENT_DIR` replaces it.
 *
 * @package
 */
export function studentDir() {
	return process.env.FERIS_STUDENT_DIR ?? inRepo("student");
}

/**
 * The lab's scenarios; `FERIS_SCENARIOS_DIR` replaces them.
 *
 * @package
 */
export function scenariosDir() {
	return process.env.FERIS_SCENARIOS_DIR ?? inRepo("lab/scenarios");
}

/** The books that ship with the repo, the sample book among them; `FERIS_BOOKS_DIR` replaces them. */
function booksDir() {
	return process.env.FERIS_BOOKS_DIR ?? inRepo("books");
}

/**
 * The student's own books.
 *
 * @package
 */
export function studentBooksDir() {
	return join(studentDir(), "books");
}

/**
 * Every folder that holds books: the repo's, then the student's own. A book of the repo wins
 * over a student's book of the same name.
 *
 * @package
 */
export function booksDirs() {
	return [booksDir(), studentBooksDir()];
}

/**
 * The voice service's Python project, run with uv.
 *
 * @package
 */
export function voiceDir() {
	return inRepo("voice");
}

/**
 * The toolbelt's command, run with Node as a separate process.
 *
 * @package
 */
export function ferisBin() {
	return inRepo("toolbelt/bin/feris.js");
}
