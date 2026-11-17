/**
 * The classroom's script on every page: the switch between light and dark.
 *
 * The page starts in the system's theme. The switch picks the other one and keeps the choice in
 * the browser, where every page of the classroom reads it before painting.
 */

const root = document.documentElement;
const KEY = "feris-theme";

/** The theme on screen now. */
function current() {
	if (root.dataset.theme === "light" || root.dataset.theme === "dark") return root.dataset.theme;
	return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

for (const button of document.querySelectorAll("nav.classroom-bar .theme")) {
	button.addEventListener("click", () => {
		const theme = current() === "dark" ? "light" : "dark";
		root.dataset.theme = theme;
		try {
			localStorage.setItem(KEY, theme);
		} catch {
			// Without storage the choice lasts until the page changes.
		}
	});
}
