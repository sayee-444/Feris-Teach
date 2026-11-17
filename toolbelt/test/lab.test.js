import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const bin = fileURLToPath(new URL("../bin/feris.js", import.meta.url));

const PASSING = `export default {
	kind: "automatic",
	title: "Two and two make four",
	check() {},
};
`;

const FAILING = `export default {
	kind: "automatic",
	title: "The sky is green",
	check() {
		throw new Error("the sky is blue");
	},
};
`;

const HUMAN = `export default {
	kind: "human",
	title: "The greeting sounds warm",
	present() {
		console.log("Hello, student!");
	},
	checklist: ["It sounds friendly", "It is short"],
};
`;

/**
 * A lab of its own for one test: a folder of scenarios and an empty student folder.
 *
 * @param {import("node:test").TestContext} t
 * @param {Record<string, string>} scenarios The source of each scenario, by name
 */
function lab(t, scenarios) {
	const root = mkdtempSync(join(tmpdir(), "feris-lab-"));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const scenariosDir = join(root, "scenarios");
	const studentDir = join(root, "student");
	mkdirSync(scenariosDir);
	writeFileSync(join(root, "package.json"), '{ "type": "module" }\n');
	for (const [name, source] of Object.entries(scenarios)) {
		mkdirSync(join(scenariosDir, name));
		writeFileSync(join(scenariosDir, name, "scenario.js"), source);
	}

	return {
		/** Runs the toolbelt against this lab, typing `input` as the human would. */
		feris(/** @type {string[]} */ args, input = "") {
			const result = spawnSync(process.execPath, [bin, ...args], {
				encoding: "utf8",
				input,
				env: { ...process.env, FERIS_SCENARIOS_DIR: scenariosDir, FERIS_STUDENT_DIR: studentDir },
			});
			return { status: result.status, stdout: result.stdout, stderr: result.stderr };
		},
		/** The ratings saved for a scenario, oldest first. */
		ratings(/** @type {string} */ name) {
			return readFileSync(join(studentDir, "lab", `${name}.jsonl`), "utf8")
				.trimEnd()
				.split("\n")
				.map((line) => JSON.parse(line));
		},
	};
}

test("the lab lists its scenarios with their kind and title", (t) => {
	const { feris } = lab(t, { "sky-colour": FAILING, greeting: HUMAN });

	const { status, stdout } = feris(["lab", "list"]);

	assert.equal(status, 0);
	assert.equal(
		stdout,
		"greeting    human      The greeting sounds warm\nsky-colour  automatic  The sky is green\n",
	);
});

test("an automatic scenario that behaves passes", (t) => {
	const { feris } = lab(t, { sums: PASSING });

	const { status, stdout, stderr } = feris(["lab", "run", "sums"]);

	assert.equal(status, 0);
	assert.equal(stdout, "PASS sums: Two and two make four\n");
	assert.equal(stderr, "");
});

test("an automatic scenario that misbehaves fails and says why", (t) => {
	const { feris } = lab(t, { "sky-colour": FAILING });

	const { status, stderr } = feris(["lab", "run", "sky-colour"]);

	assert.equal(status, 1);
	assert.equal(stderr, "FAIL sky-colour: The sky is green\n  the sky is blue\n");
});

test("the lab rejects a scenario it does not have and points to the list", (t) => {
	const { feris } = lab(t, { sums: PASSING });

	const { status, stderr } = feris(["lab", "run", "nope"]);

	assert.equal(status, 1);
	assert.equal(
		stderr,
		'feris: no scenario named "nope". Run "feris lab list" to see the scenarios.\n',
	);
});

test("a human scenario shows what to judge and its checklist", (t) => {
	const { feris } = lab(t, { greeting: HUMAN });

	const { stdout } = feris(["lab", "run", "greeting"], "4\nA bit flat\n");

	assert.match(stdout, /^greeting: The greeting sounds warm\n/);
	assert.match(stdout, /\nHello, student!\n/);
	assert.match(stdout, /\n {2}- It sounds friendly\n {2}- It is short\n/);
});

test("a human scenario saves the rating and the comments with a timestamp", (t) => {
	const { feris, ratings } = lab(t, { greeting: HUMAN });
	const before = Date.now();

	const { status } = feris(["lab", "run", "greeting"], "4\nA bit flat\n");

	assert.equal(status, 0);
	const [saved, ...others] = ratings("greeting");
	assert.deepEqual(others, []);
	assert.equal(saved.scenario, "greeting");
	assert.equal(saved.rating, 4);
	assert.equal(saved.comments, "A bit flat");
	assert.equal(new Date(saved.at).toISOString(), saved.at);
	assert.ok(Date.parse(saved.at) >= before && Date.parse(saved.at) <= Date.now());
});

test("a human scenario keeps every rating, so runs can be compared over time", (t) => {
	const { feris, ratings } = lab(t, { greeting: HUMAN });

	feris(["lab", "run", "greeting"], "2\nToo cold\n");
	feris(["lab", "run", "greeting"], "5\n\n");

	assert.deepEqual(
		ratings("greeting").map(({ rating, comments }) => ({ rating, comments })),
		[
			{ rating: 2, comments: "Too cold" },
			{ rating: 5, comments: "" },
		],
	);
});

test("a human scenario asks again when the rating is not from 1 to 5", (t) => {
	const { feris, ratings } = lab(t, { greeting: HUMAN });

	const { status, stdout } = feris(["lab", "run", "greeting"], "great\n9\n3\nFine\n");

	assert.equal(status, 0);
	assert.match(stdout, /whole number from 1 to 5/);
	assert.deepEqual(
		ratings("greeting").map(({ rating }) => rating),
		[3],
	);
});

test("a human scenario left without a rating fails and saves nothing", (t) => {
	const { feris, ratings } = lab(t, { greeting: HUMAN });

	const { status, stderr } = feris(["lab", "run", "greeting"], "");

	assert.equal(status, 1);
	assert.equal(stderr, 'feris: scenario "greeting" was not rated, so nothing was saved.\n');
	assert.throws(() => ratings("greeting"), { code: "ENOENT" });
});

test("the lab runs every automatic scenario at once and leaves the human ones out", (t) => {
	const { feris } = lab(t, { sums: PASSING, greeting: HUMAN });

	const { status, stdout } = feris(["lab", "run", "--automatic"]);

	assert.equal(status, 0);
	assert.equal(stdout, "PASS sums: Two and two make four\n1 passed, 0 failed\n");
});

test("running every automatic scenario fails when one of them fails", (t) => {
	const { feris } = lab(t, { sums: PASSING, "sky-colour": FAILING });

	const { status, stdout, stderr } = feris(["lab", "run", "--automatic"]);

	assert.equal(status, 1);
	assert.equal(stdout, "PASS sums: Two and two make four\n1 passed, 1 failed\n");
	assert.match(stderr, /^FAIL sky-colour: /);
});

test("a folder that is not a valid scenario is reported by name", (t) => {
	const { feris } = lab(t, { broken: "export default { kind: 'magic' };\n" });

	const { status, stderr } = feris(["lab", "run", "broken"]);

	assert.equal(status, 1);
	assert.match(stderr, /^feris: scenario "broken" is not valid: /);
});

test("the lab explains its commands when given none it knows", (t) => {
	const { feris } = lab(t, {});

	const { status, stderr } = feris(["lab", "juggle"]);

	assert.equal(status, 1);
	assert.match(stderr, /^Usage: feris lab <command>/);
});

test("the lab ships one template scenario of each kind", () => {
	const { FERIS_SCENARIOS_DIR: _, ...env } = process.env;
	const result = spawnSync(process.execPath, [bin, "lab", "list"], { encoding: "utf8", env });

	assert.equal(result.status, 0);
	assert.match(result.stdout, /^example-automatic +automatic /m);
	assert.match(result.stdout, /^example-human +human /m);
});

test("one broken scenario does not stop the others from running", (t) => {
	const { feris } = lab(t, { broken: "export default { kind: 'magic' };\n", sums: PASSING });

	const { status, stdout, stderr } = feris(["lab", "run", "--automatic"]);

	assert.equal(status, 1);
	assert.equal(stdout, "PASS sums: Two and two make four\n1 passed, 1 failed\n");
	assert.match(stderr, /^FAIL broken\n {2}scenario "broken" is not valid: /);
});

test("one broken scenario still shows in the list, beside the others", (t) => {
	const { feris } = lab(t, { broken: "export default { kind: 'magic' };\n", sums: PASSING });

	const { status, stdout } = feris(["lab", "list"]);

	assert.equal(status, 1);
	assert.match(stdout, /^broken +invalid +scenario "broken" is not valid: /);
	assert.match(stdout, /\nsums +automatic +Two and two make four\n$/);
});

test("running every automatic scenario fails when there is none to run", (t) => {
	const { feris } = lab(t, { greeting: HUMAN });

	const { status, stderr } = feris(["lab", "run", "--automatic"]);

	assert.equal(status, 1);
	assert.equal(stderr, "feris: the lab has no automatic scenario to run.\n");
});

test("a human scenario that cannot show what to judge fails and says why", (t) => {
	const { feris, ratings } = lab(t, {
		greeting: HUMAN.replace('console.log("Hello, student!")', 'throw new Error("no voice")'),
	});

	const { status, stderr } = feris(["lab", "run", "greeting"], "4\nFine\n");

	assert.equal(status, 1);
	assert.equal(stderr, 'feris: scenario "greeting" could not be presented: no voice\n');
	assert.throws(() => ratings("greeting"), { code: "ENOENT" });
});

test("a scenario gives the toolbelt it runs an environment of its own", (t) => {
	const { feris } = lab(t, {
		"own-env": `import assert from "node:assert/strict";
export default {
	kind: "automatic",
	title: "The toolbelt sees the scenario's environment",
	check({ feris, env }) {
		env.FERIS_SCENARIOS_DIR = "a folder that does not exist";
		const { stdout } = feris("lab", "list");
		assert.equal(stdout, "", "the toolbelt still lists the lab's scenarios");
	},
};
`,
	});

	const { status, stdout, stderr } = feris(["lab", "run", "own-env"]);

	assert.equal(stderr, "");
	assert.equal(status, 0);
	assert.equal(stdout, "PASS own-env: The toolbelt sees the scenario's environment\n");
});

test("a scenario can look at a page in a headless browser", (t) => {
	const { feris } = lab(t, {
		looks: `import assert from "node:assert/strict";
export default {
	kind: "automatic",
	title: "A page shows its heading",
	async check({ browser }) {
		const page = await (await browser()).newPage();
		await page.setContent("<h1>Hello</h1>");
		assert.equal(await page.textContent("h1"), "Hello");
	},
};
`,
	});

	const { status, stdout, stderr } = feris(["lab", "run", "looks"]);

	assert.equal(stderr, "");
	assert.equal(status, 0);
	assert.equal(stdout, "PASS looks: A page shows its heading\n");
});
