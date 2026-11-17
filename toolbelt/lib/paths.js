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

/** The student folder (ADR-0002); `FERIS_STUDENT_DIR` replaces it. */
export function studentDir() {
	return process.env.FERIS_STUDENT_DIR ?? inRepo("student");
}

/** The lab's scenarios; `FERIS_SCENARIOS_DIR` replaces them. */
export function scenariosDir() {
	return process.env.FERIS_SCENARIOS_DIR ?? inRepo("lab/scenarios");
}

/** The books that ship with the repo, the sample book among them; `FERIS_BOOKS_DIR` replaces them. */
export function booksDir() {
	return process.env.FERIS_BOOKS_DIR ?? inRepo("books");
}

/**
 * Every folder that holds books: the repo's, then the student's own in `<student>/books/`.
 * A book of the repo wins over a student's book of the same name.
 */
export function booksDirs() {
	return [booksDir(), join(studentDir(), "books")];
}
