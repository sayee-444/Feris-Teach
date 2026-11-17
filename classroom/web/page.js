/**
 * The classroom's script in every page of a book, which shows inside the shell's frame
 * (ADR-0004).
 *
 * A page opened on its own, outside the shell, moves into the shell, so the student always has
 * the bar and the class always has one page that lasts. Links that leave the classroom open in
 * a new tab, so they never replace the book in the frame.
 */

if (window.top === window) {
	location.replace(`/#${location.pathname}${location.hash}`);
}

for (const link of document.querySelectorAll("a[href]")) {
	const anchor = /** @type {HTMLAnchorElement} */ (link);
	if (anchor.origin !== location.origin) {
		anchor.target = "_blank";
		anchor.rel = "noopener";
	}
}
