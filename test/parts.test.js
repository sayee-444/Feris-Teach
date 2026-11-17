/**
 * The boundaries between parts (ADR-0003): the checks fail when an import reaches inside
 * another part. Each test builds a small repo of its own and lints it with this repo's Biome
 * configuration, so turning a rule off turns a test red.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("..", import.meta.url));
const biome = createRequire(import.meta.url).resolve("@biomejs/biome/bin/biome");

const SCENARIO = `export default { kind: "automatic", title: "A scenario", check() {} };\n`;

/**
 * Lints a repo made of `files` with this repo's Biome configuration.
 *
 * @param {import("node:test").TestContext} t
 * @param {Record<string, string>} files The source of each file, by its path from the root
 * @returns {{ passed: boolean, rules: string[] }} Whether the lint passed, and the rules broken
 */
function lint(t, files) {
	const root = mkdtempSync(join(tmpdir(), "feris-parts-"));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	for (const name of ["biome.json", "package.json"]) cpSync(join(repo, name), join(root, name));
	for (const [path, source] of Object.entries(files)) {
		mkdirSync(dirname(join(root, path)), { recursive: true });
		writeFileSync(join(root, path), source);
	}

	// The copy is not a git repo, so Biome's use of .gitignore is switched off for it.
	const result = spawnSync(
		process.execPath,
		[biome, "lint", "--vcs-enabled=false", "--reporter=json", "--colors=off", "."],
		{ cwd: root, encoding: "utf8" },
	);
	/** @type {{ diagnostics: { category: string }[] }} */
	const report = JSON.parse(result.stdout);
	return {
		passed: result.status === 0,
		rules: report.diagnostics.map(({ category }) => category),
	};
}

test("a part that imports another part by its #name passes the checks", (t) => {
	const { passed, rules } = lint(t, {
		"toolbelt/index.js": 'export { lab } from "./lib/lab.js";\n',
		"toolbelt/lib/lab.js": "export function lab() {}\n",
		"lab/scenarios/sums/scenario.js": `import { lab } from "#toolbelt";\n\nlab();\n\n${SCENARIO}`,
	});

	assert.deepEqual(rules, []);
	assert.equal(passed, true);
});

test("an import that reaches inside another part fails the checks", (t) => {
	const { passed, rules } = lint(t, {
		"toolbelt/index.js": 'export { lab } from "./lib/lab.js";\n',
		"toolbelt/lib/lab.js": "export function lab() {}\n",
		"lab/scenarios/sums/scenario.js": `import { lab } from "../../../toolbelt/lib/lab.js";\n\nlab();\n\n${SCENARIO}`,
	});

	assert.deepEqual(rules, ["lint/style/noRestrictedImports"]);
	assert.equal(passed, false);
});

test("an import of something marked private fails the checks", (t) => {
	const { passed, rules } = lint(t, {
		"toolbelt/index.js": 'export { lab } from "./lib/lab.js";\n',
		"toolbelt/lib/lab.js":
			'import { secret } from "./deep/secret.js";\n\nexport function lab() {\n\treturn secret;\n}\n',
		"toolbelt/lib/deep/secret.js": "/** @package */\nexport const secret = 1;\n",
	});

	assert.deepEqual(rules, ["lint/correctness/noPrivateImports"]);
	assert.equal(passed, false);
});

test("an import cycle fails the checks", (t) => {
	const { passed, rules } = lint(t, {
		"toolbelt/index.js": 'export { lab } from "./lib/lab.js";\n',
		"toolbelt/lib/lab.js":
			'import { run } from "./run.js";\n\nexport function lab() {\n\trun();\n}\n',
		"toolbelt/lib/run.js":
			'import { lab } from "./lab.js";\n\nexport function run() {\n\tlab();\n}\n',
	});

	assert.deepEqual(rules, ["lint/suspicious/noImportCycles", "lint/suspicious/noImportCycles"]);
	assert.equal(passed, false);
});

test("no file names the inside of another part, not even in a JSDoc type", () => {
	/** @type {{ imports: Record<string, string> }} */
	const manifest = JSON.parse(readFileSync(join(repo, "package.json"), "utf8"));
	const entries = Object.values(manifest.imports).map((entry) => resolve(repo, entry));
	const listed = spawnSync("git", ["ls-files", "-co", "--exclude-standard", "--", "*.js"], {
		cwd: repo,
		encoding: "utf8",
	});
	const files = listed.stdout.split("\n").filter(Boolean);
	assert.notEqual(files.length, 0, "git listed no JavaScript file");

	// Biome reads import statements only, so a path in a JSDoc `@import` or `import("…")` type
	// gets past it. This reads every relative path a file names, wherever it is written.
	const reaches = [];
	for (const file of files) {
		const source = readFileSync(join(repo, file), "utf8");
		for (const [, specifier] of source.matchAll(/(?:from\s+|import\()["'](\.[^"'\n]*)["']/g)) {
			const target = resolve(repo, dirname(file), String(specifier));
			const entry = entries.find((entry) => !relative(dirname(entry), target).startsWith(".."));
			if (entry === undefined || target === entry) continue;
			if (relative(dirname(entry), resolve(repo, file)).startsWith("..")) {
				reaches.push(`${file} names "${specifier}"`);
			}
		}
	}

	assert.deepEqual(reaches, []);
});
