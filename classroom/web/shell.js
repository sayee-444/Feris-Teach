/**
 * The shell (ADR-0004): the one page the student keeps open. The book's pages show in its frame
 * named "lesson"; the shell itself never reloads, so what lives here lasts the whole class.
 *
 * It keeps the bar in step with the page in the frame, keeps the shell's address pointing at
 * that page (`/#/books/…`, so a reload or a bookmark comes back to it), and switches between
 * light and dark for the shell and the frame together.
 */

const root = document.documentElement;
const frame = /** @type {HTMLIFrameElement} */ (document.querySelector("iframe[name=lesson]"));
const nav = /** @type {HTMLElement} */ (document.querySelector("header.classroom-bar nav"));
/** Where the theme is kept; the pages read the same key before they paint. */
const THEME_KEY = "feris-theme";
const HOME = "/books/";

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

let loads = 0;
frame.addEventListener("load", async () => {
	const load = ++loads;
	const page = showing();
	history.replaceState(null, "", `#${encodeURI(page)}`);
	document.title = frame.contentDocument?.title || "Classroom";
	shareTheme();
	const response = await fetch(`/shell/bar?page=${encodeURIComponent(page.split("#")[0] ?? "")}`);
	const bar = await response.text();
	// A slow answer for a page the student has already left is dropped.
	if (load === loads) nav.innerHTML = bar;
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
