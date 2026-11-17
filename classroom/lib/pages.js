/**
 * The pages the classroom writes itself: the home page listing the books, a book's contents,
 * and the bar at the top of every book page that moves the student around the book.
 */

/** @import { BookIndex, Lesson } from "../types.js" */

/** The words the classroom shows, in the languages it speaks. A book in another language gets English. */
const WORDS = {
	en: {
		books: "Books",
		contents: "Contents",
		glossary: "Glossary",
		reference: "Reference",
		previous: "Previous",
		next: "Next",
		planned: "planned",
		theme: "Switch between light and dark",
		broken: "This book does not match its index",
	},
	es: {
		books: "Libros",
		contents: "Índice",
		glossary: "Glosario",
		reference: "Referencia",
		previous: "Anterior",
		next: "Siguiente",
		planned: "en preparación",
		theme: "Cambiar entre claro y oscuro",
		broken: "Este libro no coincide con su índice",
	},
};

/** The words for a book's language. */
function wordsFor(/** @type {string} */ language) {
	const base = /** @type {keyof typeof WORDS} */ (language.toLowerCase().split("-")[0]);
	return WORDS[base] ?? WORDS.en;
}

/** Escapes text for HTML. */
export function escapeHtml(/** @type {string} */ text) {
	return text
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");
}

/** The address of a file of a book. */
export function bookUrl(/** @type {string} */ book, file = "") {
	const path = file.split("/").map(encodeURIComponent).join("/");
	return `/books/${encodeURIComponent(book)}/${path}`;
}

/** A whole page in the classroom's layout. */
function page(
	/** @type {{ language: string, title: string, body: string }} */ { language, title, body },
) {
	return `<!doctype html>
<html lang="${escapeHtml(language)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
</head>
<body>
<main>
${body}
</main>
</body>
</html>
`;
}

/**
 * The home page: every book the classroom serves.
 *
 * @param {{ name: string, title: string }[]} books
 */
export function homePage(books) {
	const items = books
		.map(({ name, title }) => `<li><a href="${bookUrl(name)}">${escapeHtml(title)}</a></li>`)
		.join("\n");
	return page({
		language: "en",
		title: "Classroom",
		body: `<header class="lesson"><h1>Classroom</h1></header>
<h2>${WORDS.en.books}</h2>
<ul class="books">
${items}
</ul>`,
	});
}

/**
 * A book's contents: its chapters and lessons in order, its glossary and its reference.
 *
 * @param {string} name The book's name
 * @param {BookIndex} index
 * @param {string[]} mismatches What the book checker found, shown above the contents
 */
export function contentsPage(name, index, mismatches) {
	const words = wordsFor(index.language);
	const chapters = index.chapters
		.map((chapter, c) => {
			// Lessons are numbered chapter.lesson from their order, as books number their sections.
			const lessons = chapter.lessons
				.map((lesson, l) => {
					const number = `<span class="number">${c + 1}.${l + 1}</span>`;
					const title = escapeHtml(lesson.title);
					return lesson.status === "ready"
						? `<li>${number} <a href="${bookUrl(name, lesson.file)}">${title}</a></li>`
						: `<li class="planned">${number} ${title} <span class="status">(${words.planned})</span></li>`;
				})
				.join("\n");
			return `<section class="chapter">
<h2><span class="step">${c + 1}.</span>${escapeHtml(chapter.title)}</h2>
<ul class="lessons">
${lessons}
</ul>
</section>`;
		})
		.join("\n");
	const reference = index.reference
		.map(({ title, file }) => `<li><a href="${bookUrl(name, file)}">${escapeHtml(title)}</a></li>`)
		.join("\n");
	return page({
		language: index.language,
		title: index.title,
		body: `<header class="lesson">
<div class="series">${words.contents}</div>
<h1>${escapeHtml(index.title)}</h1>
</header>
${mismatches.length > 0 ? mismatchNote(name, mismatches) : ""}
${chapters}
<section class="chapter">
<h2>${words.glossary} · ${words.reference}</h2>
<ul>
<li><a href="${bookUrl(name, index.glossary)}">${words.glossary}</a></li>
${reference}
</ul>
</section>`,
	});
}

/**
 * The page shown in place of a book's contents when its index does not match its files.
 *
 * @param {string} name
 * @param {string[]} mismatches
 */
export function brokenBookPage(name, mismatches) {
	return page({
		language: "en",
		title: name,
		body: `<header class="lesson"><h1>${escapeHtml(name)}</h1></header>
${mismatchNote(name, mismatches)}`,
	});
}

/** A note listing what the book checker found. */
function mismatchNote(/** @type {string} */ name, /** @type {string[]} */ mismatches) {
	const items = mismatches
		.map((mismatch) => `<li><code>${escapeHtml(mismatch)}</code></li>`)
		.join("\n");
	return `<div class="note mismatches"><strong>${WORDS.en.broken}.</strong> Run <code>feris book check ${escapeHtml(name)}</code> after fixing it.
<ul>
${items}
</ul>
</div>`;
}

/**
 * The bar at the top of every page of a book: back to the contents, the lessons before and after
 * the one on screen, the glossary, the reference, and the switch between light and dark.
 *
 * @param {string} name The book's name
 * @param {BookIndex} index
 * @param {string} file The page on screen, from the book's folder
 * @returns {string} The bar's inner HTML
 */
export function bookBar(name, index, file) {
	const words = wordsFor(index.language);
	const ready = index.chapters
		.flatMap((chapter) => chapter.lessons)
		.filter((lesson) => lesson.status === "ready");
	const at = ready.findIndex((lesson) => lesson.file === file);
	const link = (
		/** @type {Lesson | undefined} */ lesson,
		/** @type {string} */ rel,
		/** @type {string} */ label,
	) =>
		lesson
			? `<a rel="${rel}" href="${bookUrl(name, lesson.file)}" title="${escapeHtml(lesson.title)}">${label}</a>`
			: "";
	const reference = index.reference
		.map(
			({ title, file }) =>
				`<a class="reference" href="${bookUrl(name, file)}">${escapeHtml(title)}</a>`,
		)
		.join("");
	return [
		`<a class="contents" href="${bookUrl(name)}">${escapeHtml(index.title)}</a>`,
		at === -1 ? "" : link(ready[at - 1], "prev", `← ${words.previous}`),
		at === -1 ? "" : link(ready[at + 1], "next", `${words.next} →`),
		'<span class="spacer"></span>',
		`<a class="glossary" href="${bookUrl(name, index.glossary)}">${words.glossary}</a>`,
		reference,
		`<button type="button" class="theme" title="${words.theme}" aria-label="${words.theme}">◐</button>`,
	].join("");
}
