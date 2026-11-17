/**
 * The pages the classroom writes itself: the one page the student keeps open (the shell,
 * ADR-0004), the bar at its top, the list of books, and a book's index page. The book's pages
 * show inside the shell, in its frame named "lesson".
 */

/** @import { BookIndex, Lesson } from "../types.js" */

/** The words the classroom shows, in the languages it speaks. A book in another language gets English. */
const WORDS = {
	en: {
		books: "Books",
		index: "Index",
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
		index: "Índice",
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

/**
 * Escapes text for HTML.
 *
 * @package
 */
export function escapeHtml(/** @type {string} */ text) {
	return text
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");
}

/**
 * The address of a file of a book.
 *
 * @package
 */
export function bookUrl(/** @type {string} */ book, file = "") {
	const path = file.split("/").map(encodeURIComponent).join("/");
	return `/books/${encodeURIComponent(book)}/${path}`;
}

/**
 * Sets the theme before a page paints, so that a student who chose dark never sees a flash of
 * light. The shell's switch, in `web/shell.js`, keeps the choice in the browser under this key.
 *
 * @package
 */
export const THEME = `try{var t=localStorage.getItem("feris-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

/**
 * The one page the student keeps open: the bar, and the frame where the book's pages show. It
 * never reloads, so what lives in it (the class's state, later the persona's avatar) lasts the
 * whole class. It gets no live reload: only the frame does.
 *
 * @package
 */
export function shellPage() {
	const { theme } = WORDS.en;
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Classroom</title>
<script>${THEME}</script>
<link rel="stylesheet" href="/lesson.css">
<link rel="stylesheet" href="/shell.css">
<script type="module" src="/shell.js"></script>
</head>
<body class="shell">
<header class="classroom-bar"><nav></nav><button type="button" class="theme" title="${theme}" aria-label="${theme}">◐</button></header>
<iframe name="lesson" title="Book"></iframe>
</body>
</html>
`;
}

/** A link in the bar, which opens in the shell's frame. */
function barLink(
	/** @type {string} */ href,
	/** @type {string} */ attributes,
	/** @type {string} */ label,
) {
	return `<a ${attributes} href="${href}" target="lesson">${label}</a>`;
}

/**
 * The bar while a page that is not in a book is on screen: the way to the books.
 *
 * @package
 */
export function libraryBar() {
	return barLink("/books/", 'class="library"', WORDS.en.books);
}

/**
 * The bar while a page of a book is on screen: the books, the book's index page, the lessons
 * before and after the one on screen, the glossary and the reference.
 *
 * @param {string} name The book's name
 * @param {BookIndex} index
 * @param {string} file The page on screen, from the book's folder
 * @returns {string} The bar's inner HTML
 * @package
 */
export function bookBar(name, index, file) {
	const words = wordsFor(index.language);
	const ready = index.chapters
		.flatMap((chapter) => chapter.lessons)
		.filter((lesson) => lesson.status === "ready");
	const position = ready.findIndex((lesson) => lesson.file === file);
	const neighbour = (
		/** @type {Lesson | undefined} */ lesson,
		/** @type {string} */ rel,
		/** @type {string} */ label,
	) =>
		lesson && position !== -1
			? barLink(
					bookUrl(name, lesson.file),
					`rel="${rel}" title="${escapeHtml(lesson.title)}"`,
					label,
				)
			: "";
	const reference = index.reference
		.map(({ title, file }) => barLink(bookUrl(name, file), 'class="reference"', escapeHtml(title)))
		.join("");
	return [
		barLink("/books/", 'class="library"', words.books),
		barLink(bookUrl(name), 'class="index"', escapeHtml(index.title)),
		neighbour(ready[position - 1], "prev", `← ${words.previous}`),
		neighbour(ready[position + 1], "next", `${words.next} →`),
		'<span class="spacer"></span>',
		barLink(bookUrl(name, index.glossary), 'class="glossary"', words.glossary),
		reference,
	].join("");
}

/** A whole page in the classroom's layout, shown in the shell's frame. */
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
 * The list of every book the classroom serves.
 *
 * @param {{ name: string, title: string }[]} books
 * @package
 */
export function libraryPage(books) {
	const items = books
		.map(({ name, title }) => `<li><a href="${bookUrl(name)}">${escapeHtml(title)}</a></li>`)
		.join("\n");
	return page({
		language: "en",
		title: WORDS.en.books,
		body: `<header class="lesson"><h1>${WORDS.en.books}</h1></header>
<ul class="books">
${items}
</ul>`,
	});
}

/**
 * A book's index page: its chapters and lessons in order, its glossary and its reference.
 *
 * @param {string} name The book's name
 * @param {BookIndex} index
 * @param {string[]} mismatches What the book checker found, shown above the chapters
 * @package
 */
export function indexPage(name, index, mismatches) {
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
<div class="series">${words.index}</div>
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
 * The page shown in place of a book's index page when its index cannot be read.
 *
 * @param {string} name
 * @param {string[]} mismatches
 * @package
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
