/**
 * The classroom's server: Vite on localhost, serving the books with live reload.
 *
 * URLs:
 *   /                      the home page, listing the books
 *   /books/<book>/         a book's contents
 *   /books/<book>/<file>   a file of a book; its pages get the classroom's bar and components
 *   /<file>                the classroom's own stylesheets and scripts, from `web/`
 */
import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, posix, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { checkBook, readIndex } from "./book.js";
import { bookBar, bookUrl, brokenBookPage, contentsPage, homePage } from "./pages.js";

/** @import { IncomingMessage, ServerResponse } from "node:http" */
/** @import { HtmlTagDescriptor, Plugin, ViteDevServer } from "vite" */
/** @import { Classroom, ClassroomOptions } from "../types.js" */

const WEB = fileURLToPath(new URL("../web", import.meta.url));

const TYPES = /** @type {Record<string, string>} */ ({
	".css": "text/css; charset=utf-8",
	".gif": "image/gif",
	".jpeg": "image/jpeg",
	".jpg": "image/jpeg",
	".js": "text/javascript; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".png": "image/png",
	".svg": "image/svg+xml",
	".txt": "text/plain; charset=utf-8",
	".webp": "image/webp",
});

/**
 * Sets the theme before the page paints, so that a student who chose dark never sees a flash
 * of light. The choice is kept in the browser and shared by every page of the classroom.
 */
const THEME = `try{var t=localStorage.getItem("feris-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

/** Whether `path` is `dir` or lies inside it. */
function isInside(/** @type {string} */ dir, /** @type {string} */ path) {
	const rel = relative(dir, path);
	return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !posix.isAbsolute(rel));
}

/**
 * The books the classroom serves, by name. When two folders hold a book of the same name, the
 * first one wins.
 *
 * @param {string[]} booksDirs
 * @returns {Map<string, string>} Each book's folder, by the book's name
 */
function findBooks(booksDirs) {
	const books = new Map();
	for (const dir of booksDirs) {
		if (!existsSync(dir)) continue;
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			if (entry.isDirectory() && !books.has(entry.name)) {
				books.set(entry.name, join(dir, entry.name));
			}
		}
	}
	return new Map([...books].sort(([a], [b]) => a.localeCompare(b)));
}

/** Answers with a page of HTML, after Vite has added its live reload client to it. */
async function sendHtml(
	/** @type {ViteDevServer} */ server,
	/** @type {ServerResponse} */ res,
	/** @type {string} */ url,
	/** @type {string} */ html,
) {
	res.setHeader("Content-Type", "text/html; charset=utf-8");
	res.setHeader("Cache-Control", "no-store");
	res.end(await server.transformIndexHtml(url, html));
}

/** Answers that there is nothing here. */
function notFound(/** @type {ServerResponse} */ res) {
	res.statusCode = 404;
	res.setHeader("Content-Type", "text/plain; charset=utf-8");
	res.end("Not found\n");
}

/**
 * Splits a path of the classroom into the book it is about and the file within the book.
 *
 * @param {string} path A decoded URL path
 * @returns {{ name: string, file: string | undefined } | undefined}
 */
function bookPath(path) {
	const match = /^\/books\/([^/]+)(?:\/(.*))?$/.exec(path);
	if (!match) return undefined;
	return { name: String(match[1]), file: match[2] };
}

/**
 * The plugin that makes Vite a classroom.
 *
 * @param {string[]} booksDirs
 * @returns {Plugin}
 */
function classroom(booksDirs) {
	const dirs = booksDirs.map((dir) => resolve(dir));
	/** The book a file on disk belongs to, and the file's path within the book. */
	const owner = (/** @type {string} */ path) => {
		for (const dir of dirs) {
			if (!isInside(dir, path) || path === dir) continue;
			const [name, ...rest] = relative(dir, path).split(sep);
			return { name: String(name), file: rest.join("/") };
		}
		return undefined;
	};

	return {
		name: "feris-classroom",

		configureServer(server) {
			server.watcher.add(dirs);
			server.watcher.on("all", (_event, path) => {
				const at = owner(resolve(path));
				if (at === undefined) return;
				// A changed page reloads only where it is open; anything else (the index, an image,
				// a new book) can change every page, so every page reloads.
				const page = at.file.endsWith(".html") ? `/books/${at.name}/${at.file}` : "*";
				server.ws.send({ type: "full-reload", path: page });
			});

			server.middlewares.use(async (req, res, next) => {
				try {
					await serve(server, req, res, next);
				} catch (error) {
					next(error);
				}
			});
		},

		hotUpdate({ file }) {
			// The books are not modules: their reload is sent above.
			if (owner(resolve(file)) !== undefined) return [];
		},

		transformIndexHtml(_html, { path }) {
			/** @type {HtmlTagDescriptor[]} */
			const tags = [
				{ tag: "script", children: THEME, injectTo: "head-prepend" },
				{
					tag: "link",
					attrs: { rel: "stylesheet", href: "/lesson.css" },
					injectTo: "head-prepend",
				},
				{
					tag: "link",
					attrs: { rel: "stylesheet", href: "/classroom.css" },
					injectTo: "head-prepend",
				},
				...["classroom.js", "quiz.js", "token-chips.js"].map(
					(script) =>
						/** @type {HtmlTagDescriptor} */ ({
							tag: "script",
							attrs: { type: "module", src: `/${script}` },
							injectTo: "body",
						}),
				),
			];
			const at = bookPath(decodeURIComponent(path));
			const dir = at && findBooks(dirs).get(at.name);
			const { index } = dir ? readIndex(dir) : { index: undefined };
			if (at && index) {
				tags.push({
					tag: "nav",
					attrs: { class: "classroom-bar" },
					children: bookBar(at.name, index, at.file ?? ""),
					injectTo: "body-prepend",
				});
			}
			return tags;
		},
	};

	/**
	 * Serves the home page and the books; anything else goes on to Vite.
	 *
	 * @param {ViteDevServer} server
	 * @param {IncomingMessage} req
	 * @param {ServerResponse} res
	 * @param {() => void} next
	 */
	async function serve(server, req, res, next) {
		const url = new URL(req.url ?? "/", "http://localhost");
		let path;
		try {
			path = decodeURIComponent(url.pathname);
		} catch {
			return notFound(res);
		}
		if (path === "/" || path === "/index.html") {
			const books = [...findBooks(dirs)].map(([name, dir]) => ({
				name,
				title: readIndex(dir).index?.title ?? name,
			}));
			return sendHtml(server, res, url.pathname, homePage(books));
		}

		const at = bookPath(path);
		if (at === undefined) return next();
		const dir = findBooks(dirs).get(at.name);
		if (dir === undefined) return notFound(res);
		if (at.file === undefined) {
			res.statusCode = 301;
			res.setHeader("Location", bookUrl(at.name));
			return res.end();
		}
		if (at.file === "") {
			const { index, mismatches } = checkBook(dir);
			const html = index
				? contentsPage(at.name, index, mismatches)
				: brokenBookPage(at.name, mismatches);
			return sendHtml(server, res, url.pathname, html);
		}

		const file = resolve(dir, at.file);
		if (!isInside(dir, file) || !existsSync(file) || !statSync(file).isFile()) {
			return notFound(res);
		}
		if (extname(file) === ".html") {
			return sendHtml(server, res, url.pathname, readFileSync(file, "utf8"));
		}
		res.setHeader("Content-Type", TYPES[extname(file).toLowerCase()] ?? "application/octet-stream");
		res.setHeader("Cache-Control", "no-store");
		createReadStream(file).pipe(res);
	}
}

/**
 * Serves the classroom on localhost until it is closed.
 *
 * @param {ClassroomOptions} options
 * @returns {Promise<Classroom>}
 */
export async function startClassroom({ booksDirs, port }) {
	const server = await createServer({
		configFile: false,
		root: WEB,
		publicDir: false,
		appType: "custom",
		logLevel: "warn",
		clearScreen: false,
		server: { host: "127.0.0.1", port: port ?? 0, strictPort: true },
		optimizeDeps: { noDiscovery: true, include: [] },
		plugins: [classroom(booksDirs)],
	});
	await server.listen();
	const address = server.httpServer?.address();
	if (typeof address !== "object" || address === null) {
		await server.close();
		throw new Error("the classroom's server did not report the port it listens on");
	}
	return {
		url: `http://127.0.0.1:${address.port}/`,
		close: () => server.close(),
	};
}
