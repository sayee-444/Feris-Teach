/**
 * The shell (ADR-0004): the one page the student keeps open. The book's pages show in its frame
 * named "lesson"; the shell itself never reloads, so what lives here lasts the whole class.
 *
 * It keeps the bar in step with the page in the frame, keeps the shell's address pointing at
 * that page (`/#/books/…`, so a reload or a bookmark comes back to it), and switches between
 * light and dark for the shell and the frame together.
 *
 * It also watches the page in the frame and reports the classroom state to the classroom's
 * server, which holds it for the teacher: the page, the view and the selection each time they
 * change, and each quiz answer as the page announces it. Sections and paragraphs are named by
 * their `id`: a section is a `<section>` with one, and a paragraph any element with one right
 * inside such a section.
 */

const root = document.documentElement;
const frame = /** @type {HTMLIFrameElement} */ (document.querySelector("iframe[name=lesson]"));
const nav = /** @type {HTMLElement} */ (document.querySelector("header.classroom-bar nav"));
/** Where the theme is kept; the pages read the same key before they paint. */
const THEME_KEY = "feris-theme";
const HOME = "/books/";
/** Where the shell reports the view and the selection, and the quiz answers. */
const REPORT = { view: "/shell/view", answer: "/shell/answer" };
const SECTIONS = "section[id]";
const PARAGRAPHS = "section[id] > [id]:not(section)";
/** How long the shell lets the student act before it reports, so that a scroll is one report. */
const SETTLE = 100;
/** The most of a selection reported: the teacher needs to know which text, not all of it. */
const SELECTION_LIMIT = 2000;

/** The page the shell's address points at. */
function wanted() {
	const page = decodeURI(location.hash.slice(1));
	return page.startsWith("/books/") ? page : HOME;
}

/** The page on screen in the frame, as a path with its fragment. */
function showing() {
	const { pathname, hash } = /** @type {Window} */ (frame.contentWindow).location;
	return decodeURI(pathname + hash);
}

/** The theme on screen now. */
function theme() {
	if (root.dataset.theme === "light" || root.dataset.theme === "dark") return root.dataset.theme;
	return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Gives the page in the frame the shell's theme, when the student has chosen one. */
function shareTheme() {
	const page = frame.contentDocument?.documentElement;
	if (page && root.dataset.theme) page.dataset.theme = root.dataset.theme;
}

/**
 * Sends a report to the classroom's server. One that cannot be sent is dropped: the next one
 * tells the whole view again.
 */
function send(/** @type {string} */ path, /** @type {string} */ body) {
	fetch(path, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body,
		keepalive: true,
	}).catch(() => {});
}

/** The text selected in the frame, and the paragraph, or else the section, where it starts. */
function selected(/** @type {Window} */ win) {
	const selection = win.getSelection();
	const text = selection?.toString().trim() ?? "";
	if (!selection || selection.rangeCount === 0 || text === "") return null;
	const start = selection.getRangeAt(0).startContainer;
	const element =
		start.nodeType === Node.ELEMENT_NODE ? /** @type {Element} */ (start) : start.parentElement;
	const holder = element?.closest(PARAGRAPHS) ?? element?.closest(SECTIONS);
	return { text: text.slice(0, SELECTION_LIMIT), within: holder?.id || null };
}

/** What the shell reports when no page is on screen. */
const NOTHING = { page: null, view: { sections: [], paragraphs: [] }, selection: null };

/** The page in the frame, without its fragment. */
const page = () => showing().split("#")[0] ?? "";

/** What the student has on screen now: the page, the view and the selection. */
function seen() {
	const win = frame.contentWindow;
	const doc = frame.contentDocument;
	if (!win || !doc) return NOTHING;
	const height = win.innerHeight;
	const inSight = (/** @type {Element} */ element) => {
		const { top, bottom } = element.getBoundingClientRect();
		return bottom > top && bottom > 0 && top < height;
	};
	const ids = (/** @type {string} */ selector) =>
		[...doc.querySelectorAll(selector)].filter(inSight).map((element) => element.id);
	return {
		page: page(),
		view: { sections: ids(SECTIONS), paragraphs: ids(PARAGRAPHS) },
		selection: selected(win),
	};
}

let reported = "";
/** Reports what is on screen, unless it is what was reported last. */
function report() {
	const body = JSON.stringify(seen());
	if (body === reported) return;
	reported = body;
	send(REPORT.view, body);
}

/** @type {ReturnType<typeof setTimeout> | undefined} */
let settling;
/** Reports what is on screen once the student has stopped for a moment. */
function soon() {
	if (settling !== undefined) return;
	settling = setTimeout(() => {
		settling = undefined;
		report();
	}, SETTLE);
}

/** Watches the page that has just loaded in the frame, for as long as it is there. */
function watch() {
	const win = frame.contentWindow;
	const doc = frame.contentDocument;
	if (!win || !doc) return;
	const answeredOn = page();
	win.addEventListener("scroll", soon, { passive: true });
	win.addEventListener("resize", soon);
	doc.addEventListener("selectionchange", soon);
	// An image or a chart that arrives late moves what is in sight without a scroll.
	// It is the frame's own observer, so that it goes away with the page.
	const realm = /** @type {typeof globalThis} */ (/** @type {unknown} */ (win));
	new realm.ResizeObserver(soon).observe(doc.documentElement);
	doc.addEventListener("feris:answer", (event) => {
		const { detail } = /** @type {CustomEvent} */ (event);
		send(REPORT.answer, JSON.stringify({ page: answeredOn, ...detail }));
	});
	report();
}

let loads = 0;
frame.addEventListener("load", async () => {
	const load = ++loads;
	history.replaceState(null, "", `#${encodeURI(showing())}`);
	document.title = frame.contentDocument?.title || "Classroom";
	shareTheme();
	watch();
	const response = await fetch(`/shell/bar?page=${encodeURIComponent(page())}`);
	const bar = await response.text();
	// A slow answer for a page the student has already left is dropped.
	if (load === loads) nav.innerHTML = bar;
});

// A shell that closes leaves nothing on screen; one that reloads reports its page again.
addEventListener("pagehide", () => {
	reported = JSON.stringify(NOTHING);
	send(REPORT.view, reported);
});

addEventListener("hashchange", () => {
	if (wanted() !== showing()) frame.contentWindow?.location.replace(wanted());
});

document.querySelector("header.classroom-bar .theme")?.addEventListener("click", () => {
	root.dataset.theme = theme() === "dark" ? "light" : "dark";
	shareTheme();
	try {
		localStorage.setItem(THEME_KEY, root.dataset.theme);
	} catch {
		// Without storage the choice lasts until the shell is closed.
	}
});

frame.src = wanted();
