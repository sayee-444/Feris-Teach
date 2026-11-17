/**
 * `feris book`: the books the classroom serves.
 */
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { checkBook } from "#classroom";
import { booksDirs } from "./paths.js";

const USAGE = `Usage: feris book <command>

The books: each one is a folder with an index, lessons, a glossary and a reference.

Commands:
  check <book>   Report every mismatch between a book's index and its files. <book> is the
                 name of a book (the sample book or one in the student folder) or the path
                 to its folder.
`;

/** Whether `path` is a folder. */
function isDir(/** @type {string} */ path) {
	return existsSync(path) && statSync(path).isDirectory();
}

/**
 * Finds a book's folder by its name, or by a path to it.
 *
 * @param {string} book
 * @returns {string | undefined}
 */
function findBook(book) {
	for (const dir of booksDirs()) {
		const named = join(dir, book);
		if (isDir(named)) return named;
	}
	return isDir(book) ? book : undefined;
}

/** Checks one book and reports what it found. */
function check(/** @type {string} */ book) {
	const dir = findBook(book);
	if (dir === undefined) {
		console.error(`feris: there is no book named "${book}", and no folder at that path.`);
		return 1;
	}
	const { index, mismatches } = checkBook(dir);
	if (index === undefined || mismatches.length > 0) {
		const lines = mismatches.map((mismatch) => `  - ${mismatch}`).join("\n");
		console.error(`${book} does not match its index:\n${lines}`);
		return 1;
	}
	const chapters = index.chapters.length;
	const lessons = index.chapters.reduce((sum, chapter) => sum + chapter.lessons.length, 0);
	const plural = (/** @type {number} */ n, /** @type {string} */ word) =>
		`${n} ${word}${n === 1 ? "" : "s"}`;
	console.log(
		`${book} matches its index: ${plural(chapters, "chapter")}, ${plural(lessons, "lesson")}.`,
	);
	return 0;
}

/**
 * Runs a `feris book` command.
 *
 * @param {string[]} args What follows `book` on the command line
 * @returns {number} The exit code
 */
export function book(args) {
	const [command, target, ...extra] = args;
	if (command === "check" && target !== undefined && extra.length === 0) return check(target);
	process.stderr.write(USAGE);
	return 1;
}
