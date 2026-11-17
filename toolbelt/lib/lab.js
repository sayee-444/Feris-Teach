/**
 * The lab: where one part of Feris-Teach is tried in isolation by loading a scenario.
 *
 * A scenario is a folder holding a `scenario.js` whose default export is a {@link Scenario}.
 * The folder's name is the scenario's name.
 */
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";
import { scenariosDir, studentDir } from "./paths.js";

/** @import { Browser } from "playwright" */
/** @import { AutomaticScenario, HumanScenario, Scenario, Tools } from "../types.js" */

const USAGE = `Usage: feris lab <command>

The lab: try one part of Feris-Teach in isolation by loading a scenario.

Commands:
  list              List the scenarios, with their kind and title
  run <scenario>    Run one scenario by name
  run --automatic   Run every automatic scenario
`;

/** A problem to report to whoever ran the lab, as opposed to a bug in the lab. */
class LabError extends Error {}

/** Launches a headless Chromium, saying how to install one when there is none. */
async function launchBrowser() {
	const { chromium } = await import("playwright");
	try {
		return await chromium.launch();
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		if (!reason.includes("Executable doesn't exist")) throw error;
		throw new Error(
			'there is no headless browser to run this scenario. Install one with "npx playwright install chromium".',
		);
	}
}

/**
 * The tools for one run of a scenario, each run with its own, and a way to put them away when
 * the run is over.
 */
function toolsForRun() {
	/** @type {Record<string, string>} */
	const env = {};
	/** @type {Promise<Browser> | undefined} */
	let browser;
	/** @type {Tools} */
	const tools = {
		env,
		feris(...args) {
			const bin = fileURLToPath(new URL("../bin/feris.js", import.meta.url));
			const result = spawnSync(process.execPath, [bin, ...args], {
				encoding: "utf8",
				env: { ...process.env, ...env },
			});
			return { status: result.status, stdout: result.stdout, stderr: result.stderr };
		},
		browser() {
			browser ??= launchBrowser();
			return browser;
		},
	};
	const close = async () => {
		const launched = await browser?.catch(() => undefined);
		await launched?.close();
	};
	return { tools, close };
}

/** The names of the scenarios in the lab, in alphabetical order. */
function scenarioNames() {
	const dir = scenariosDir();
	if (!existsSync(dir)) return [];
	return readdirSync(dir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && existsSync(join(dir, entry.name, "scenario.js")))
		.map((entry) => entry.name)
		.sort();
}

/**
 * Says what is wrong with a scenario's default export, or nothing when it is a scenario.
 *
 * @param {any} scenario
 * @returns {string | undefined}
 */
function flaw(scenario) {
	if (typeof scenario !== "object" || scenario === null) return "it has no default export";
	if (typeof scenario.title !== "string") return "its title must be a string";
	if (scenario.kind === "automatic") {
		if (typeof scenario.check !== "function") return "its check must be a function";
	} else if (scenario.kind === "human") {
		if (typeof scenario.present !== "function") return "its present must be a function";
		const { checklist } = scenario;
		if (!Array.isArray(checklist) || checklist.some((item) => typeof item !== "string")) {
			return "its checklist must be a list of strings";
		}
	} else {
		return 'its kind must be "automatic" or "human"';
	}
}

/**
 * Loads a scenario by name.
 *
 * @param {string} name
 * @returns {Promise<Scenario>}
 */
async function load(name) {
	if (!scenarioNames().includes(name)) {
		throw new LabError(`no scenario named "${name}". Run "feris lab list" to see the scenarios.`);
	}
	let scenario;
	try {
		const module = await import(pathToFileURL(join(scenariosDir(), name, "scenario.js")).href);
		scenario = module.default;
	} catch (error) {
		throw new LabError(`scenario "${name}" is not valid: it does not load (${error})`);
	}
	const problem = flaw(scenario);
	if (problem) throw new LabError(`scenario "${name}" is not valid: ${problem}`);
	return scenario;
}

async function list() {
	const names = scenarioNames();
	const width = Math.max(0, ...names.map((name) => name.length));
	let invalid = 0;
	for (const name of names) {
		const row = await load(name).then(
			({ kind, title }) => `${kind.padEnd("automatic".length)}  ${title}`,
			(error) => {
				if (!(error instanceof LabError)) throw error;
				invalid++;
				return `invalid    ${error.message}`;
			},
		);
		console.log(`${name.padEnd(width)}  ${row}`);
	}
	return invalid === 0 ? 0 : 1;
}

/** Indents every line of a message under the line that announces it. */
function indent(/** @type {string} */ text) {
	return text.replace(/^/gm, "  ");
}

/**
 * Runs an automatic scenario and reports whether it passed.
 *
 * @param {string} name
 * @param {AutomaticScenario} scenario
 * @returns {Promise<boolean>}
 */
async function runAutomatic(name, scenario) {
	const { tools, close } = toolsForRun();
	try {
		await scenario.check(tools);
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		console.error(`FAIL ${name}: ${scenario.title}\n${indent(reason)}`);
		return false;
	} finally {
		await close();
	}
	console.log(`PASS ${name}: ${scenario.title}`);
	return true;
}

/**
 * Shows a human scenario, asks for a rating and comments, and saves them in the student folder.
 *
 * @param {string} name
 * @param {HumanScenario} scenario
 */
async function runHuman(name, scenario) {
	console.log(`${name}: ${scenario.title}\n`);
	const { tools, close } = toolsForRun();
	try {
		await scenario.present(tools);
	} catch (error) {
		await close();
		const reason = error instanceof Error ? error.message : String(error);
		throw new LabError(`scenario "${name}" could not be presented: ${reason}`);
	}
	console.log(`\nChecklist:\n${scenario.checklist.map((item) => `  - ${item}`).join("\n")}\n`);

	const answers = createInterface({ input: process.stdin });
	const lines = answers[Symbol.asyncIterator]();
	/** Asks one question; the answer is undefined when the human is gone. */
	const ask = async (/** @type {string} */ question) => {
		process.stdout.write(question);
		const { value, done } = await lines.next();
		return done ? undefined : String(value).trim();
	};

	try {
		let rating = await ask("Rating (1-5): ");
		while (rating !== undefined && !/^[1-5]$/.test(rating)) {
			rating = await ask("Give a whole number from 1 to 5.\nRating (1-5): ");
		}
		if (rating === undefined) {
			throw new LabError(`scenario "${name}" was not rated, so nothing was saved.`);
		}
		const comments = (await ask("Comments (optional): ")) ?? "";

		const file = join(studentDir(), "lab", `${name}.jsonl`);
		const entry = {
			scenario: name,
			at: new Date().toISOString(),
			rating: Number(rating),
			comments,
		};
		mkdirSync(dirname(file), { recursive: true });
		appendFileSync(file, `${JSON.stringify(entry)}\n`);
		console.log(`Saved to ${file}`);
	} finally {
		answers.close();
		await close();
	}
}

/** Runs one scenario by name. */
async function runOne(/** @type {string} */ name) {
	const scenario = await load(name);
	if (scenario.kind === "automatic") return (await runAutomatic(name, scenario)) ? 0 : 1;
	await runHuman(name, scenario);
	return 0;
}

/** Runs every automatic scenario; the human ones need a human, so they are left out. */
async function runAutomaticOnes() {
	let passed = 0;
	let failed = 0;
	for (const name of scenarioNames()) {
		try {
			const scenario = await load(name);
			if (scenario.kind !== "automatic") continue;
			if (await runAutomatic(name, scenario)) passed++;
			else failed++;
		} catch (error) {
			if (!(error instanceof LabError)) throw error;
			console.error(`FAIL ${name}\n${indent(error.message)}`);
			failed++;
		}
	}
	if (passed + failed === 0) throw new LabError("the lab has no automatic scenario to run.");
	console.log(`${passed} passed, ${failed} failed`);
	return failed === 0 ? 0 : 1;
}

/**
 * Runs a `feris lab` command.
 *
 * @param {string[]} args What follows `lab` on the command line
 * @returns {Promise<number>} The exit code
 */
export async function lab(args) {
	const [command, target] = args;
	try {
		if (command === "list") return await list();
		if (command === "run" && target === "--automatic") return await runAutomaticOnes();
		if (command === "run" && target !== undefined) return await runOne(target);
	} catch (error) {
		if (!(error instanceof LabError)) throw error;
		console.error(`feris: ${error.message}`);
		return 1;
	}
	process.stderr.write(USAGE);
	return 1;
}
