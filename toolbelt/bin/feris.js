#!/usr/bin/env node
import { readFileSync } from "node:fs";

const USAGE = `Usage: feris <command> [options]

The teacher's toolbelt: the single interface to everything outside the conversation.

Options:
  --version   Print the toolbelt's version
  --help      Print this help
`;

/** @type {{ version: string }} */
const manifest = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));

const [command] = process.argv.slice(2);

if (command === "--version") {
	console.log(manifest.version);
} else if (command === "--help") {
	process.stdout.write(USAGE);
} else if (command === undefined) {
	process.stderr.write(USAGE);
	process.exitCode = 1;
} else {
	console.error(`feris: unknown command "${command}". Run "feris --help" to see what it can do.`);
	process.exitCode = 1;
}
