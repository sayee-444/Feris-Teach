/**
 * A template for a human scenario: copy this folder, rename it and change what it presents.
 *
 * `present` puts in front of the human what only a human can judge (a voice, the persona, how
 * a class teaches). The lab then shows the checklist, asks for a rating from 1 to 5 and for
 * comments, and saves them in the student folder.
 */

/** @type {import("../../../toolbelt/lib/lab.js").HumanScenario} */
export default {
	kind: "human",
	title: "The toolbelt's help is easy to read",
	present({ feris }) {
		process.stdout.write(feris("--help").stdout);
	},
	checklist: [
		"The first lines say what the toolbelt is for",
		"Every command and option is explained in plain words",
		"Nothing in it needs the source code to be understood",
	],
};
