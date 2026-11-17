/**
 * The classroom's server: Vite on localhost, serving the books with live reload.
 *
 * URLs:
 *   /                      the shell: the one page the student keeps open (ADR-0004)
 *   /shell/bar?page=<path> the shell's bar while <path> is on screen
 *   /books/                the list of books
 *   /books/<book>/         a book's index page
 *   /books/<book>/<file>   a file of a book; its pages get the components and live reload
 *   /shell/view            where the shell reports the view and the selection (POST)
 *   /shell/answer          where the shell reports a quiz answer (POST)
 *   /control/state         the classroom state, for the teacher's toolbelt
 *   /<file>                the classroom's own stylesheets and scripts, from `web/`
 *
 * Everything under /books/ shows in the shell's frame; only the frame reloads.
 */
import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { checkBook, lessonAt, readIndex } from "./book.js";
import {
	bookBar,
	bookUrl,
	brokenBookPage,
	indexPage,
	libraryBar,
	libraryPage,
	shellPage,
	THEME,
} from "./pages.js";
import { answerReport, classRecord, PATHS, viewReport } from "./state.js";

/** @import { IncomingMessage, ServerResponse } from "node:http" */
/** @import { HtmlTagDescriptor, Plugin, ViteDevServer } from "vite" */
/** @import { Classroom, ClassroomOptions } from "../types.js" */

const WEB = fileURLToPath(new URL("../web", import.meta.url));

const CONTENT_TYPES = /** @type {Record<string, string>} */ ({
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

/** Whether `path` is `dir` or lies inside it. */
function isInside(/** @type {string} */ dir, /** @type {string} */ path) {
	const rel = relative(dir, path);
	// On Windows a path on another drive comes back absolute.
	return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
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

/** Answers with JSON. */
function sendJson(/** @type {ServerResponse} */ res, /** @type {unknown} */ value) {
	res.setHeader("Content-Type", "application/json; charset=utf-8");
	res.setHeader("Cache-Control", "no-store");
	res.end(`${JSON.stringify(value, null, 2)}\n`);
}

/** Answers with a status and nothing more. */
function sendStatus(/** @type {ServerResponse} */ res, /** @type {number} */ status) {
	res.statusCode = status;
	res.end();
}

/** The most a report from the shell may weigh. */
const REPORT_LIMIT = 64 * 1024;

/**
 * Reads a request's body as JSON.
 *
 * @param {IncomingMessage} req
 * @returns {Promise<unknown>} The parsed body, or nothing when it is not JSON or is too long
 */
async function readJson(req) {
	/** @type {Buffer[]} */
	const chunks = [];
	let size = 0;
	for await (const chunk of req) {
		size += chunk.length;
		if (size > REPORT_LIMIT) return undefined;
		chunks.push(chunk);
	}
	try {
		return JSON.parse(Buffer.concat(chunks).toString("utf8"));
	} catch {
		return undefined;
	}
}

/**
 * Whether a request comes from the classroom itself or from a program on this machine, and not
 * from another site open in the student's browser: the class's state is the student's own.
 */
function isOwn(/** @type {IncomingMessage} */ req) {
	const host = req.headers.host ?? "";
	const hostname = host.replace(/:\d+$/, "");
	if (hostname !== "127.0.0.1" && hostname !== "localhost") return false;
	const origin = req.headers.origin;
	return origin === undefined || origin === `http://${host}`;
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

	/**
	 * The book a page of the classroom is in, with the book's index when it can be read.
	 *
	 * @param {string} page The decoded path of the page
	 */
	const bookOf = (page) => {
		const target = bookPath(page);
		const dir = target && findBooks(dirs).get(target.name);
		if (!target || !dir) return undefined;
		return { name: target.name, file: target.file ?? "", index: readIndex(dir).index };
	};
	const record = classRecord((page) => {
		const book = bookOf(page);
		if (book === undefined) return { book: null, lesson: null };
		return { book: book.name, lesson: book.index ? lessonAt(book.index, book.file) : null };
	});

	return {
		name: "feris-classroom",

		configureServer(server) {
			server.watcher.add(dirs);
			server.watcher.on("all", (_event, path) => {
				const changed = owner(resolve(path));
				if (changed === undefined) return;
				// A changed page reloads only where it is open; anything else (the index, an image,
				// a new book) can change every page, so every page reloads.
				const page = changed.file.endsWith(".html")
					? `/books/${changed.name}/${changed.file}`
					: "*";
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

		transformIndexHtml() {
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
				...["page.js", "quiz.js", "token-chips.js"].map(
					(script) =>
						/** @type {HtmlTagDescriptor} */ ({
							tag: "script",
							attrs: { type: "module", src: `/${script}` },
							injectTo: "body",
						}),
				),
			];
			return tags;
		},
	};

	/**
	 * The shell's bar while a page is on screen.
	 *
	 * @param {string} page The decoded path of the page
	 */
	function bar(page) {
		const book = bookOf(page);
		return book?.index ? bookBar(book.name, book.index, book.file) : libraryBar();
	}

	/**
	 * Answers the teacher's toolbelt with the classroom state, and takes the shell's reports.
	 *
	 * @param {IncomingMessage} req
	 * @param {ServerResponse} res
	 * @param {string} path
	 */
	async function control(req, res, path) {
		if (!isOwn(req)) return sendStatus(res, 403);
		if (path === PATHS.state) {
			return req.method === "GET" ? sendJson(res, record.state()) : sendStatus(res, 405);
		}
		if (req.method !== "POST") return sendStatus(res, 405);
		const body = await readJson(req);
		if (path === PATHS.view) {
			const report = viewReport(body);
			if (report === undefined) return sendStatus(res, 400);
			record.see(report);
		} else if (path === PATHS.answer) {
			const report = answerReport(body);
			if (report === undefined) return sendStatus(res, 400);
			record.answer(report);
		} else {
			return notFound(res);
		}
		return sendStatus(res, 204);
	}

	/**
	 * Serves the shell, its bar, the classroom state and the books; anything else goes on to Vite.
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
			// Sent as it is: without Vite's client, the shell never reloads.
			res.setHeader("Content-Type", "text/html; charset=utf-8");
			res.setHeader("Cache-Control", "no-store");
			return res.end(shellPage());
		}
		if (path === "/shell/bar") {
			res.setHeader("Content-Type", "text/html; charset=utf-8");
			res.setHeader("Cache-Control", "no-store");
			return res.end(bar(url.searchParams.get("page") ?? ""));
		}
		if (path === PATHS.state || path === PATHS.view || path === PATHS.answer) {
			return control(req, res, path);
		}
		if (path === "/books/") {
			const books = [...findBooks(dirs)].map(([name, dir]) => ({
				name,
				title: readIndex(dir).index?.title ?? name,
			}));
			return sendHtml(server, res, url.pathname, libraryPage(books));
		}

		const target = bookPath(path);
		if (target === undefined) return next();
		const dir = findBooks(dirs).get(target.name);
		if (dir === undefined) return notFound(res);
		if (target.file === undefined) {
			res.statusCode = 301;
			res.setHeader("Location", bookUrl(target.name));
			return res.end();
		}
		if (target.file === "") {
			const { index, mismatches } = checkBook(dir);
			const html = index
				? indexPage(target.name, index, mismatches)
				: brokenBookPage(target.name, mismatches);
			return sendHtml(server, res, url.pathname, html);
		}

		const file = resolve(dir, target.file);
		if (!isInside(dir, file) || !existsSync(file) || !statSync(file).isFile()) {
			return notFound(res);
		}
		if (extname(file) === ".html") {
			return sendHtml(server, res, url.pathname, readFileSync(file, "utf8"));
		}
		res.setHeader(
			"Content-Type",
			CONTENT_TYPES[extname(file).toLowerCase()] ?? "application/octet-stream",
		);
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
	// Loaded here, so that a part that only reads the classroom state never waits for Vite.
	const { createServer } = await import("vite");
	const server = await createServer({
		configFile: false,
		root: WEB,
		publicDir: false,
		appType: "custom",
		logLevel: "warn",
		clearScreen: false,
		server: {
			host: "127.0.0.1",
			port: port ?? 0,
			strictPort: true,
			// Vite serves only the classroom's own files; the books go through `serve` above. Its
			// default would serve any file in the repo, the student folder among them, as /@fs/….
			fs: { strict: true, allow: [WEB] },
		},
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
