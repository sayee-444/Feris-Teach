/**
 * `feris classroom`: starts and stops the classroom on localhost.
 *
 * `start` runs `feris classroom serve` as a detached process and returns once it is listening,
 * so the classroom outlives the call that started it. The serving process records itself in
 * `<student>/run/classroom.json`, which `stop` reads to stop it; its output goes to
 * `<student>/run/classroom.log`.
 */
import { spawn } from "node:child_process";
import {
	closeSync,
	existsSync,
	mkdirSync,
	openSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { startClassroom } from "#classroom";
import { booksDirs, studentDir } from "./paths.js";

const USAGE = `Usage: feris classroom <command> [options]

The classroom: the local web page that shows the books.

Commands:
  start   Start the classroom in the background and print its address
  stop    Stop the classroom, leaving no process behind
  serve   Run the classroom in this terminal until Ctrl+C

Options:
  --port <port>   Serve on this port instead of any free one (start and serve)
`;

/** How long `start` waits for the classroom to listen, and `stop` for it to end. */
const START_TIMEOUT = 30_000;
const STOP_TIMEOUT = 10_000;

/**
 * What the serving process records about itself.
 *
 * @typedef {object} Running
 * @property {number} pid
 * @property {string} url
 */

/** A problem to report to whoever ran the command. */
class ClassroomError extends Error {}

const runDir = () => join(studentDir(), "run");
const stateFile = () => join(runDir(), "classroom.json");
const logFile = () => join(runDir(), "classroom.log");

/** Whether a process with this id is running. */
function isRunning(/** @type {number} */ pid) {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return /** @type {NodeJS.ErrnoException} */ (error).code === "EPERM";
	}
}

/** The classroom that is running, if any. A record left by a classroom that died is removed. */
function running() {
	if (!existsSync(stateFile())) return undefined;
	/** @type {Running | undefined} */
	let state;
	try {
		state = JSON.parse(readFileSync(stateFile(), "utf8"));
	} catch {
		state = undefined;
	}
	if (state !== undefined && Number.isInteger(state.pid) && isRunning(state.pid)) return state;
	rmSync(stateFile(), { force: true });
	return undefined;
}

/** The line that says where the classroom is open. */
function openLine(/** @type {Running} */ { url, pid }) {
	return `The classroom is open at ${url} (process ${pid}).`;
}

/** Waits a little. */
const pause = (/** @type {number} */ ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Reads `--port <port>` from the options.
 *
 * @param {string[]} options
 * @returns {number | undefined}
 */
function portOption(options) {
	if (options.length === 0) return undefined;
	const [flag, value, ...extra] = options;
	const port = Number(value);
	if (
		flag !== "--port" ||
		extra.length > 0 ||
		!Number.isInteger(port) ||
		port < 1 ||
		port > 65535
	) {
		throw new ClassroomError(`"${options.join(" ")}" is not a valid option. Use --port <1-65535>.`);
	}
	return port;
}

/** Runs the classroom in this process until it is told to stop. */
async function serve(/** @type {number | undefined} */ port) {
	const other = running();
	if (other) throw new ClassroomError(`the classroom is already running. ${openLine(other)}`);

	const classroom = await startClassroom({ booksDirs: booksDirs(), port });
	/** @type {Running} */
	const state = { pid: process.pid, url: classroom.url };
	mkdirSync(runDir(), { recursive: true });
	writeFileSync(stateFile(), `${JSON.stringify(state)}\n`);
	console.log(`${openLine(state)} Press Ctrl+C to stop it.`);
	// Tells `start`, when it is the one that ran this process, that the classroom is listening.
	if (process.send) {
		process.send(state);
		process.disconnect?.();
	}

	await new Promise((resolve) => {
		process.once("SIGINT", resolve);
		process.once("SIGTERM", resolve);
	});
	await classroom.close();
	if (running()?.pid === process.pid) rmSync(stateFile(), { force: true });
	console.log("The classroom has stopped.");
	return 0;
}

/** Starts the classroom in the background, or reports the one already open. */
async function start(/** @type {number | undefined} */ port) {
	const open = running();
	if (open) {
		console.log(openLine(open));
		return 0;
	}

	mkdirSync(runDir(), { recursive: true });
	const log = openSync(logFile(), "w");
	const bin = fileURLToPath(new URL("../bin/feris.js", import.meta.url));
	const args = [bin, "classroom", "serve", ...(port === undefined ? [] : ["--port", String(port)])];
	const child = spawn(process.execPath, args, {
		detached: true,
		stdio: ["ignore", log, log, "ipc"],
		windowsHide: true,
	});
	closeSync(log);

	/** @type {Running | undefined} */
	const state = await new Promise((resolve) => {
		const timer = setTimeout(() => resolve(undefined), START_TIMEOUT);
		child.once("message", (message) => {
			clearTimeout(timer);
			resolve(/** @type {Running} */ (message));
		});
		child.once("exit", () => {
			clearTimeout(timer);
			resolve(undefined);
		});
	});
	if (state === undefined) {
		child.kill();
		const output = readFileSync(logFile(), "utf8").trim();
		throw new ClassroomError(
			`the classroom did not start.${output ? `\n${output}` : ""}\nIts output is in ${logFile()}`,
		);
	}
	if (child.connected) child.disconnect();
	child.unref();
	console.log(openLine(state));
	return 0;
}

/** Stops the classroom and waits until its process is gone. */
async function stop() {
	const open = running();
	if (open === undefined) {
		console.log("The classroom is not running.");
		return 0;
	}
	process.kill(open.pid, "SIGTERM");
	const deadline = Date.now() + STOP_TIMEOUT;
	while (isRunning(open.pid) && Date.now() < deadline) await pause(50);
	if (isRunning(open.pid)) {
		process.kill(open.pid, "SIGKILL");
		while (isRunning(open.pid)) await pause(50);
	}
	rmSync(stateFile(), { force: true });
	console.log("The classroom has stopped.");
	return 0;
}

/**
 * Runs a `feris classroom` command.
 *
 * @param {string[]} args What follows `classroom` on the command line
 * @returns {Promise<number>} The exit code
 */
export async function classroom(args) {
	const [command, ...options] = args;
	try {
		if (command === "start") return await start(portOption(options));
		if (command === "serve") return await serve(portOption(options));
		if (command === "stop" && options.length === 0) return await stop();
	} catch (error) {
		if (!(error instanceof ClassroomError)) throw error;
		console.error(`feris: ${error.message}`);
		return 1;
	}
	process.stderr.write(USAGE);
	return 1;
}
