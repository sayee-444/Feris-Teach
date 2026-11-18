/**
 * What the toolbelt's background services share, the classroom and the voice service: each runs
 * as a detached process that records itself in a JSON file of the student's run folder, and is
 * ended by the process id it recorded.
 */
import { existsSync, readFileSync, rmSync } from "node:fs";

/**
 * Whether a process with this id is running.
 *
 * @package
 */
export function isRunning(/** @type {number} */ pid) {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return /** @type {NodeJS.ErrnoException} */ (error).code === "EPERM";
	}
}

/**
 * Waits a little.
 *
 * @package
 */
export const pause = (/** @type {number} */ ms) =>
	new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The record a running service left in this file, if its process still runs. A record left by
 * a service that died, or that cannot be read, is removed.
 *
 * @template {{ pid: number }} Record
 * @param {string} file
 * @returns {Record | undefined}
 * @package
 */
export function liveRecord(file) {
	if (!existsSync(file)) return undefined;
	/** @type {Record | undefined} */
	let record;
	try {
		record = JSON.parse(readFileSync(file, "utf8"));
	} catch {
		record = undefined;
	}
	if (record !== undefined && Number.isInteger(record.pid) && isRunning(record.pid)) return record;
	rmSync(file, { force: true });
	return undefined;
}

/**
 * Ends a process: asks it to stop, gives it `timeout` milliseconds to do so, then kills it, and
 * returns once it is gone.
 *
 * @param {number} pid
 * @param {number} timeout
 * @package
 */
export async function endProcess(pid, timeout) {
	process.kill(pid, "SIGTERM");
	const deadline = Date.now() + timeout;
	while (isRunning(pid) && Date.now() < deadline) await pause(50);
	if (isRunning(pid)) {
		process.kill(pid, "SIGKILL");
		while (isRunning(pid)) await pause(50);
	}
}
