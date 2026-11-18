/**
 * `feris book`: the books the classroom serves.
 */
import { existsSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { checkBook, newBook } from "#classroom";
import { booksDirs, studentBooksDir } from "./paths.js";

const USAGE = `Usage: feris book <command>

The books: each one is a folder with an index, lessons, a glossary and a reference.

Commands:
  new <book> [--title <title>] [--language <tag>]
                 Create an empty book in the student folder. <book> names its folder:
                 lowercase letters, digits and hyphens. The title defaults to the name and
                 the language, a BCP 47 tag, to "en".
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

/** A book's name: its folder's name and part of its address, the same on every system. */
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** A language tag of the shape BCP 47 gives it, such as "en", "es" or "pt-BR". */
const LANGUAGE = /^[a-zA-Z]{2,8}(?:-[a-zA-Z0-9]{1,8})*$/;

/** Creates an empty book in the student folder, and never writes over one that exists. */
function create(/** @type {string[]} */ args) {
	const { values, positionals } = parseArgs({
		args,
		allowPositionals: true,
		options: { title: { type: "string" }, language: { type: "string" } },
	});
	const [name, ...extra] = positionals;
	if (name === undefined || extra.length > 0) return usage();
	const title = (values.title ?? name).trim();
	const language = values.language ?? "en";
	if (!NAME.test(name)) {
		console.error(
			`feris: "${name}" is not a book name. Use lowercase letters, digits and hyphens, as in "linear-algebra".`,
		);
		return 1;
	}
	if (title === "") {
		console.error("feris: the book's title is empty.");
		return 1;
	}
	if (!LANGUAGE.test(language)) {
		console.error(`feris: "${language}" is not a language tag. Use one such as "en" or "es".`);
		return 1;
	}
	const taken = booksDirs().find((dir) => existsSync(join(dir, name)));
	if (taken !== undefined) {
		console.error(`feris: there is already a book named "${name}", in ${join(taken, name)}.`);
		return 1;
	}
	const dir = join(studentBooksDir(), name);
	mkdirSync(studentBooksDir(), { recursive: true });
	newBook(dir, { title, language });
	console.log(`Created the book ${name} in ${dir}.`);
	return 0;
}

/** Prints how to use `feris book`, and fails. */
function usage() {
	process.stderr.write(USAGE);
	return 1;
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
	if (command === "new") {
		try {
			return create(args.slice(1));
		} catch (error) {
			// parseArgs throws on an option it does not know or one left without its value.
			if (!(error instanceof TypeError)) throw error;
			console.error(`feris: ${error.message}`);
			return 1;
		}
	}
	return usage();
}
