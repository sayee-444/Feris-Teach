/**
 * The teacher directing the student's attention: opening a page of the classroom, pointing at an
 * element of the page on screen, and clearing the pointing.
 *
 * The toolbelt asks the classroom's server, and the server passes the order on to the shell
 * (ADR-0004), which listens on a stream of server-sent events. The shell carries the order out
 * on the page in its frame and says whether it could; the server answers the toolbelt only then,
 * so each order is one call that tells the teacher it was done, or why not.
 */

/** @import { ServerResponse } from "node:http" */

/**
 * What the teacher can order the shell to do. `point` with no id clears the pointing.
 *
 * @typedef {{ kind: "open", page: string } | { kind: "point", id: string | null }} Order
 */

/**
 * Where the toolbelt gives its orders, and where the shell listens for them and says each one is
 * done. The shell's script, which has no imports, names the last two again in its `ORDERS`.
 *
 * @package
 */
export const ORDER_PATHS = {
	open: "/control/open",
	point: "/control/point",
	orders: "/shell/orders",
	done: "/shell/done",
};

/** How long an order waits for the shell to carry it out: a page may take a while to load. */
const ORDER_TIMEOUT = 10_000;

/**
 * An order the teacher gave that the classroom could not carry out. Its message says why, for
 * the teacher.
 */
export class ClassroomRefusal extends Error {}

/**
 * The shells listening for orders, and the orders they have not carried out yet. Every shell gets
 * every order: the order is done when one of them has done it, and refused when all of them have
 * refused it or none answers in time.
 *
 * @package
 */
export function orderLine() {
	/** @type {Set<ServerResponse>} */
	const shells = new Set();
	/**
	 * The orders given and not yet answered, by number, with how many shells have yet to answer.
	 *
	 * @type {Map<number, { waiting: number, finish: (reason: string | null) => void }>}
	 */
	const pending = new Map();
	let given = 0;

	return {
		/** Keeps a shell's stream open, to send it every order from now on. */
		listen(/** @type {ServerResponse} */ res) {
			res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
			res.setHeader("Cache-Control", "no-store");
			res.flushHeaders();
			shells.add(res);
			res.on("close", () => shells.delete(res));
		},

		/** Whether any shell is listening: whether the classroom is open in a browser. */
		listening() {
			return shells.size > 0;
		},

		/**
		 * Gives an order to every shell listening and waits for the outcome.
		 *
		 * @param {Order} order
		 * @returns {Promise<string | null>} Why the order is not done, or nothing when it is
		 */
		give(order) {
			const number = ++given;
			return new Promise((resolve) => {
				const timer = setTimeout(
					() => finish("the classroom in the browser did not answer in time."),
					ORDER_TIMEOUT,
				);
				const finish = (/** @type {string | null} */ reason) => {
					clearTimeout(timer);
					pending.delete(number);
					resolve(reason);
				};
				pending.set(number, { waiting: shells.size, finish });
				const event = `data: ${JSON.stringify({ order: number, ...order })}\n\n`;
				for (const shell of shells) shell.write(event);
			});
		},

		/**
		 * Takes a shell's word on an order: done, or refused and why.
		 *
		 * @param {number} number
		 * @param {string | null} reason
		 */
		done(number, reason) {
			const order = pending.get(number);
			if (order === undefined) return;
			order.waiting -= 1;
			if (reason === null || order.waiting === 0) order.finish(reason);
		},

		/** Ends every shell's stream, so that the server can stop. */
		close() {
			for (const shell of shells) shell.end();
			for (const order of pending.values()) order.finish("the classroom has stopped.");
		},
	};
}

/**
 * Reads a shell's report that an order is done, or nothing when it is not one.
 *
 * @param {unknown} body The report, parsed from JSON
 * @returns {{ order: number, reason: string | null } | undefined}
 * @package
 */
export function doneReport(body) {
	const report = /** @type {any} */ (body);
	if (typeof report !== "object" || report === null) return undefined;
	const { order, reason } = report;
	if (!Number.isInteger(order) || !(reason === null || typeof reason === "string")) {
		return undefined;
	}
	return { order, reason };
}

/**
 * Gives an order to the classroom being served at `url` and waits until it is carried out.
 *
 * @param {string} url The classroom's home page
 * @param {string} path Where the order goes
 * @param {unknown} body
 * @throws {ClassroomRefusal} When the classroom could not carry the order out
 */
async function give(url, path, body) {
	const response = await fetch(new URL(path, url), {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	if (response.ok) return;
	const answer = /** @type {{ reason?: unknown }} */ (await response.json().catch(() => ({})));
	if (response.status === 409 && typeof answer.reason === "string") {
		throw new ClassroomRefusal(answer.reason);
	}
	throw new Error(`the classroom answered ${response.status} to an order`);
}

/**
 * Opens a page on the student's screen, in the classroom being served at `url`, and returns once
 * it is on screen.
 *
 * @param {string} url The classroom's home page
 * @param {string} page The page's path in the classroom, as the classroom state names it
 * @throws {ClassroomRefusal} When there is no such page, or the classroom is not open
 */
export function openPage(url, page) {
	return give(url, ORDER_PATHS.open, { page });
}

/**
 * Points at an element of the page on the student's screen: highlights it and scrolls it into
 * view, in place of whatever was pointed at before. With no id, clears the pointing.
 *
 * @param {string} url The classroom's home page
 * @param {string | null} id The element's `id`
 * @throws {ClassroomRefusal} When there is no such element on screen, or the classroom is not
 *   open
 */
export function pointAt(url, id) {
	return give(url, ORDER_PATHS.point, { id });
}
