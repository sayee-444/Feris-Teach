/**
 * Books on disk: reading a book's index and checking it against the files the book holds, and
 * checking that each lesson names its sections and paragraphs, which the view and pointing go by.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, posix } from "node:path";
import { escapeHtml, wordsFor } from "./pages.js";

/** @import { BookCheck, BookIndex } from "../types.js" */

const STATUSES = ["planned", "ready"];

/**
 * Says what is wrong with the shape of a parsed index, one line per flaw.
 *
 * @param {any} index
 * @returns {string[]}
 */
function shapeFlaws(index) {
	/** @type {string[]} */
	const flaws = [];
	const text = (/** @type {any} */ value, /** @type {string} */ where) => {
		if (typeof value !== "string" || value.trim() === "") {
			flaws.push(`index.json: ${where} must be a non-empty string`);
		}
	};
	const list = (/** @type {any} */ value, /** @type {string} */ where) => {
		if (Array.isArray(value)) return value;
		flaws.push(`index.json: ${where} must be a list`);
		return [];
	};

	if (typeof index !== "object" || index === null || Array.isArray(index)) {
		return ["index.json: it must hold an object"];
	}
	text(index.title, '"title"');
	text(index.language, '"language"');
	text(index.glossary, '"glossary"');
	list(index.chapters, '"chapters"').forEach((/** @type {any} */ chapter, c) => {
		const at = `chapters[${c}]`;
		text(chapter?.title, `${at}.title`);
		list(chapter?.lessons, `${at}.lessons`).forEach((/** @type {any} */ lesson, l) => {
			const where = `${at}.lessons[${l}]`;
			text(lesson?.id, `${where}.id`);
			text(lesson?.title, `${where}.title`);
			text(lesson?.file, `${where}.file`);
			if (!STATUSES.includes(lesson?.status)) {
				flaws.push(`index.json: ${where}.status must be "planned" or "ready"`);
			}
		});
	});
	list(index.reference, '"reference"').forEach((/** @type {any} */ page, r) => {
		text(page?.title, `reference[${r}].title`);
		text(page?.file, `reference[${r}].file`);
	});
	return flaws;
}

/** The text of a page's `<title>`, or nothing when it has none. */
function pageTitle(/** @type {string} */ html) {
	const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
	if (!match) return undefined;
	const entities = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'" };
	return String(match[1])
		.replace(/&(amp|lt|gt|quot|#39|apos);/g, (_, name) => entities[/** @type {"amp"} */ (name)])
		.replace(/\s+/g, " ")
		.trim();
}

/** Elements that never hold anything, so they have no closing tag. */
const VOID = new Set("area base br col embed hr img input link meta source track wbr".split(" "));

/**
 * Says what keeps a lesson's sections and paragraphs from being named: a `<section>` without an
 * `id`, an element right inside a section without one (its heading aside), and an `id` given
 * twice. It reads the tags without a full HTML parser, so a page whose tags it cannot follow is
 * reported for less, never for more.
 *
 * @param {string} html The lesson's page
 * @returns {string[]} One line per flaw, in the order of the page, then the ids given twice
 */
function idFlaws(html) {
	/** @type {string[]} */
	const flaws = [];
	/** @type {{ name: string, id: string | undefined }[]} */
	const open = [];
	const seen = new Set();
	const twice = new Set();
	const text = html
		.replace(/<!--[\s\S]*?-->/g, "")
		.replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, "");
	for (const [, closing, tag, attributes] of text.matchAll(/<(\/?)([a-zA-Z][\w-]*)([^>]*)>/g)) {
		const name = String(tag).toLowerCase();
		if (closing) {
			// A closing tag closes whatever was left open inside its element, as browsers do.
			const at = open.findLastIndex((element) => element.name === name);
			if (at !== -1) open.length = at;
			continue;
		}
		const id = /\sid\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(String(attributes));
		const value = id ? (id[1] ?? id[2] ?? id[3] ?? "") : undefined;
		if (value) {
			if (seen.has(value)) twice.add(value);
			seen.add(value);
		}
		const parent = open.at(-1);
		if (name === "section" && !value) {
			flaws.push("a <section> has no id");
		} else if (parent?.name === "section" && !/^h[1-6]$/.test(name) && !value) {
			const where = parent.id ? ` in the section "${parent.id}"` : "";
			flaws.push(`a <${name}>${where} has no id`);
		}
		if (!VOID.has(name) && !String(attributes).trimEnd().endsWith("/")) {
			open.push({ name, id: value });
		}
	}
	for (const value of twice) flaws.push(`two elements have the id "${value}"`);
	return flaws;
}

/** Every page in a book's folder, as paths from the folder written with `/`. */
function pagesOnDisk(/** @type {string} */ dir) {
	return readdirSync(dir, { recursive: true, encoding: "utf8" })
		.map((file) => file.replaceAll("\\", "/"))
		.filter((file) => file.endsWith(".html"))
		.sort();
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
 * Reads a book's index without looking at its pages: fast enough for every request.
 *
 * @param {string} dir The book's folder
 * @returns {BookCheck} The index, or why it could not be read
 */
export function readIndex(dir) {
	const indexFile = join(dir, "index.json");
	if (!existsSync(indexFile))
		return { index: undefined, mismatches: ["index.json: it is missing"] };
	let parsed;
	try {
		parsed = JSON.parse(readFileSync(indexFile, "utf8"));
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		return { index: undefined, mismatches: [`index.json: it is not valid JSON (${reason})`] };
	}
	const flaws = shapeFlaws(parsed);
	if (flaws.length > 0) return { index: undefined, mismatches: flaws };
	return { index: /** @type {BookIndex} */ (parsed), mismatches: [] };
}

/**
 * Checks a book: reads its index and reports every mismatch between the index and what is on
 * disk.
 *
 * @param {string} dir The book's folder
 * @returns {BookCheck}
 */
export function checkBook(dir) {
	const read = readIndex(dir);
	const { index } = read;
	if (index === undefined) return read;
	/** @type {string[]} */
	const mismatches = [];
	const lessons = index.chapters.flatMap((chapter) => chapter.lessons);
	/** @type {{ file: string, title?: string, planned: boolean, lesson?: boolean }[]} */
	const pages = [
		...lessons.map(({ file, title, status }) => ({
			file,
			title,
			planned: status === "planned",
			lesson: true,
		})),
		{ file: index.glossary, planned: false },
		...index.reference.map(({ file, title }) => ({ file, title, planned: false })),
	];

	const ids = new Set();
	for (const { id } of lessons) {
		if (ids.has(id)) mismatches.push(`index.json: two lessons have the id "${id}"`);
		ids.add(id);
	}

	const listed = new Set();
	for (const page of pages) {
		const file = posix.normalize(page.file);
		if (listed.has(file)) {
			mismatches.push(`${file}: the index lists it twice`);
			continue;
		}
		listed.add(file);
		if (file.startsWith("../") || posix.isAbsolute(file) || !file.endsWith(".html")) {
			mismatches.push(`${file}: the index must name an .html page inside the book`);
			continue;
		}
		const path = join(dir, file);
		const exists = existsSync(path);
		if (page.planned) {
			if (exists) mismatches.push(`${file}: the index says it is planned, but the page exists`);
			continue;
		}
		if (!exists) {
			mismatches.push(`${file}: the index lists it, but the page is missing`);
			continue;
		}
		if (page.title === undefined) continue;
		const html = readFileSync(path, "utf8");
		const title = pageTitle(html);
		if (title === undefined) {
			mismatches.push(`${file}: the page has no <title>; the index calls it "${page.title}"`);
		} else if (title !== page.title) {
			mismatches.push(`${file}: the index calls it "${page.title}", but its <title> is "${title}"`);
		}
		if (page.lesson) {
			for (const flaw of idFlaws(html)) mismatches.push(`${file}: ${flaw}`);
		}
	}

	for (const file of pagesOnDisk(dir)) {
		if (!listed.has(file))
			mismatches.push(`${file}: the page is in the book, but not in the index`);
	}
	return { index, mismatches };
}

/**
 * Writes a new, empty book into a folder that does not exist yet: an index with no chapters and
 * no reference, and a glossary page with no words, both in the book's language. The book matches
 * its index from the start.
 *
 * @param {string} dir The book's folder, which this creates
 * @param {{ title: string, language: string }} book
 * @returns {BookIndex} The book's index
 */
export function newBook(dir, { title, language }) {
	/** @type {BookIndex} */
	const index = { title, language, chapters: [], glossary: "glossary.html", reference: [] };
	const { glossary } = wordsFor(language);
	mkdirSync(dir, { recursive: false });
	writeFileSync(join(dir, "index.json"), `${JSON.stringify(index, null, "\t")}\n`);
	writeFileSync(
		join(dir, index.glossary),
		`<!doctype html>
<html lang="${escapeHtml(language)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${glossary}</title>
</head>
<body>
<main>

<header class="lesson">
  <div class="series">${escapeHtml(title)}</div>
  <h1>${glossary}</h1>
</header>

<dl class="glossary">
</dl>

</main>
</body>
</html>
`,
	);
	return index;
}
