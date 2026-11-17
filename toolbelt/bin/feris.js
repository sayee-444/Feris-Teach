#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { book } from "../lib/book.js";
import { classroom } from "../lib/classroom.js";
import { lab } from "../lib/lab.js";

const USAGE = `Usage: feris <command> [options]

The teacher's toolbelt: the single interface to everything outside the conversation.

Commands:
  book        Check the books ("feris book" lists its commands)
  classroom   Start and stop the classroom ("feris classroom" lists its commands)
  lab         Try one part of Feris-Teach in isolation ("feris lab" lists its commands)

Options:
  --version   Print the toolbelt's version
  --help      Print this help
`;

/** @type {{ version: string }} */
const manifest = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));

const [command, ...rest] = process.argv.slice(2);

if (command === "--version") {
	console.log(manifest.version);
} else if (command === "--help") {
	process.stdout.write(USAGE);
} else if (command === "book") {
	process.exitCode = book(rest);
} else if (command === "classroom") {
	process.exitCode = await classroom(rest);
} else if (command === "lab") {
	process.exitCode = await lab(rest);
} else if (command === undefined) {
	process.stderr.write(USAGE);
	process.exitCode = 1;
} else {
	console.error(`feris: unknown command "${command}". Run "feris --help" to see what it can do.`);
	process.exitCode = 1;
}
