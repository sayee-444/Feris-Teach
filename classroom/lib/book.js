/**
 * Books on disk: reading a book's index and checking it against the files the book holds.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";

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

/** Every page in a book's folder, as paths from the folder written with `/`. */
function pagesOnDisk(/** @type {string} */ dir) {
	return readdirSync(dir, { recursive: true, encoding: "utf8" })
		.map((file) => file.replaceAll("\\", "/"))
		.filter((file) => file.endsWith(".html"))
		.sort();
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
	/** @type {{ file: string, title?: string, planned: boolean }[]} */
	const pages = [
		...lessons.map(({ file, title, status }) => ({ file, title, planned: status === "planned" })),
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
		const title = pageTitle(readFileSync(path, "utf8"));
		if (title === undefined) {
			mismatches.push(`${file}: the page has no <title>; the index calls it "${page.title}"`);
		} else if (title !== page.title) {
			mismatches.push(`${file}: the index calls it "${page.title}", but its <title> is "${title}"`);
		}
	}

	for (const file of pagesOnDisk(dir)) {
		if (!listed.has(file))
			mismatches.push(`${file}: the page is in the book, but not in the index`);
	}
	return { index, mismatches };
}
