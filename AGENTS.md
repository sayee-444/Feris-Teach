# AGENTS.md

Feris-Teach is a **teaching agent** built on Claude Code. The **teacher**, speaking as the **persona** Feris, gives a **class** to the **student** in short spoken turns, while a local web **classroom** shows the **book** being studied. `GLOSSARY.md` defines these terms, and `docs/adr/` holds the decisions behind the architecture. Use the glossary's words and flag any conflict with an ADR.

The first release (`0.1.0`) is under construction: its spec is issue #1, and each part lands as its own ticket. A part named below as "planned" does not exist yet.

## Two modes

Work out which one the human wants before acting.

- **Giving a class**: the human is the student and wants to learn. You are the teacher. Planned: the `teach-feris` skill drives the class, and until it lands there is no class to give from this repo.
- **Building the agent**: the human wants to improve Feris-Teach itself. This is engineering work on issues, done with the skills listed under "Agent skills" in `CLAUDE.md`. Follow `CONTRIBUTING.md` for branches, commits, pull requests and releases. Tell the human before you launch `/wayfinder`.

## Where things live

- `toolbelt/`: the teacher's toolbelt, `feris`, the single interface to everything outside the conversation. Node, plain JavaScript with JSDoc types. Other parts import its entry, `toolbelt/index.js`, as `#toolbelt`. Run it with `npm run feris -- <command>`. Its tests in `toolbelt/test/` drive it as a separate process, the way the teacher does.
- `lab/scenarios/`: the lab's scenarios, one self-contained folder each. `npm run feris -- lab list` lists them and `npm run feris -- lab run <scenario>` runs one. To add a scenario, copy `example-automatic/` or `example-human/`; the lab itself needs no change.
- `voice/`: the voice service, a Python package managed with uv.
- `assets/`: the shared lesson components (stylesheet, quiz, token chips) from before the classroom existed. Planned: they become the classroom's shared components. They are excluded from the lint until then.
- `student/`: the student folder, git-ignored (ADR-0002). The profile, the student's books with their state, the ratings of the lab's human scenarios (`student/lab/`), and later the sources and the inbox. Nothing in it is ever committed.
- `test/`: the tests of the repo as a whole. `parts.test.js` holds the boundaries between parts.
- `docs/agents/`: instructions for agents, covering the issue tracker, the triage labels, the domain docs, JavaScript and Python.
- `docs/adr/`: the architecture decision records.
- `.github/workflows/`: the checks that run on every pull request.

## Parts

Feris-Teach is split into **parts**, one folder each at the root, and each part's one entry file is its whole public interface (ADR-0003). The checks fail when an import reaches inside another part.

- Before writing, running or reviewing JavaScript, read `docs/agents/javascript.md`.
- Before writing, running or reviewing Python, read `docs/agents/python.md`.
- A new part goes in a new folder at the root, named with the glossary's word for it. "Adding a part" in `docs/agents/javascript.md` lists what to register; a Python part follows "Parts and their interface" in `docs/agents/python.md`.

## Done means checked

Run `npm run check` (lint, formatting and types for Node and Python), `npm test` and `npm run feris -- lab run --automatic` (every automatic scenario) before you call a change done. All must pass on Linux and Windows, so use `node:path` and `node:url` for paths, and keep shell-specific syntax out of the npm scripts.

## Personal instructions

Instructions that belong to one person's machine go in `CLAUDE.local.md`, which is git-ignored. Keep them out of this file.
