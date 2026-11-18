# AGENTS.md

Feris-Teach is a **teaching agent** built on Claude Code for one person, its owner (ADR-0005). The **teacher**, speaking as the **persona** Feris, gives a **class** to the **student** in short spoken turns, while a local web **classroom** shows the **book** being studied. `GLOSSARY.md` defines these terms, and `docs/adr/` holds the decisions behind the architecture. Use the glossary's words and flag any conflict with an ADR.

The first release (`0.1.0`) is under construction: its spec is issue #1, and each part lands as its own ticket. A part named below as "planned" does not exist yet.

## Two modes

Work out which one the human wants before acting.

- **Giving a class**: the human is the student and wants to learn. You are the teacher. Planned: the `teach-feris` skill drives the class, and until it lands there is no class to give from this repo.
- **Building the agent**: the human wants to improve Feris-Teach itself. This is engineering work on issues, done with the skills listed under "Agent skills" in `CLAUDE.md`. Follow `CONTRIBUTING.md` for branches, commits, pull requests and releases. Tell the human before you launch `/wayfinder`.

## Where things live

- `toolbelt/`: the teacher's toolbelt, `feris`, the single interface to everything outside the conversation. Node, plain JavaScript with JSDoc types. Other parts import its entry, `toolbelt/index.js`, as `#toolbelt`. Run it with `npm run feris -- <command>`. Its tests in `toolbelt/test/` drive it as a separate process, the way the teacher does.
- `classroom/`: the classroom, the local web page that shows the books. Served by Vite on localhost with live reload; other parts import its entry, `classroom/index.js`, as `#classroom`. It is one page, the shell, that never reloads, with the book's pages in a frame (ADR-0004): what must last the class lives in the shell. `classroom/web/` holds the shell's script and the shared lesson components every page of a book gets (stylesheet, quiz, token chips). Start it with `npm run feris -- classroom start` and stop it with `npm run feris -- classroom stop`. `npm run feris -- classroom state` prints the classroom state as JSON: the page, book and lesson on screen, the view, the selection and the class's quiz answers. The shell gathers it from the page in the frame and the classroom's server holds it for the length of the class. `npm run feris -- classroom open <page>` opens a page on the student's screen, and `npm run feris -- classroom point <id>` highlights an element of the page on screen and scrolls to it (`point --clear` stops pointing): the server passes each order on to the shell, and the call returns once the shell has carried it out, or fails saying why.
- `books/`: the books that ship with the repo, today only the sample book, `basic-algebra`, written for this repo. A book is a folder with an `index.json` (chapters, lessons, titles, order, status; its shape is in `classroom/types.js`), plain HTML lessons, a glossary page and reference pages. In a lesson, every `<section>` and every element right inside one (paragraph, note, list, table, figure, quiz), its heading aside, has an `id` that never changes once given: the view and pointing name them by it. `npm run feris -- book new <book> [--title <title>] [--language <tag>]` creates an empty book in `student/books/`, and `npm run feris -- book check <book>` reports every mismatch between the index and the files, and every lesson element missing its `id`.
- `lab/scenarios/`: the lab's scenarios, one self-contained folder each. `npm run feris -- lab list` lists them and `npm run feris -- lab run <scenario>` runs one. To add a scenario, copy `example-automatic/` or `example-human/`; the lab itself needs no change.
- `voice/`: the voice service, a Python package managed with uv (`feris_voice`, its interface in `voice/src/feris_voice/__init__.py`). It runs for the length of a class with the speech engine loaded, and speaks the **spoken version** of a reply: what the teacher marks between `<spoken>` and `</spoken>`, or the whole reply when nothing is marked, always without code, tables or links' addresses. The engines are a self-registering set, one folder each in `voice/src/feris_voice/engines/` with an `engine.py`; the real engine is `qwen`, Qwen3-TTS on an NVIDIA GPU through `faster-qwen3-tts`, which streams each sentence in pieces so that it sounds while the rest is made. `npm run feris -- voice start` starts the service and `npm run feris -- voice shutdown` ends it; `voice say [<reply>]` (the reply as an argument or on standard input) speaks, `voice stop` silences at once and prints as JSON the last sentence heard and those not heard, `voice off` and `voice on` turn the voice off and on, and `voice status` prints what it is saying. The defaults are in `voice/src/feris_voice/defaults.toml` and the student's own settings in `student/voice.toml`. A voice is one of the stock voices of Qwen3-TTS CustomVoice, whose model is downloaded into the Hugging Face cache, or a voice of the student's own in `student/voices/<name>/`. The lab's scenarios and the tests set the `fake` engine, which makes silence in as many pieces and as slowly as told, and the `fake` player, which records what it would play and can stay on a chosen sentence until it is stopped.
- `assets/`: the lesson components from before the classroom existed, in their original Spanish markup. The classroom's components in `classroom/web/` are their English port. `assets/` stays only for lessons written before the classroom, and is excluded from the lint.
- `student/`: the student folder, git-ignored (ADR-0002). The profile, the student's books (`student/books/`, served next to the repo's), the voice's settings and voices (`student/voice.toml`, `student/voices/`), the ratings of the lab's human scenarios (`student/lab/`), the running classroom's and voice service's records and logs (`student/run/`), and later the sources and the inbox. Nothing in it is ever committed.
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

Run `npm run check` (lint, formatting and types for Node and Python), `npm test` and `npm run feris -- lab run --automatic` (every automatic scenario) before you call a change done. The classroom's scenarios run a headless Chromium: install it once with `npx playwright install chromium`. All must pass on Linux and Windows, so use `node:path` and `node:url` for paths, and keep shell-specific syntax out of the npm scripts. A fresh clone on a clean machine must start a class by following the README.

## Personal instructions

Instructions that belong to one person's machine go in `CLAUDE.local.md`, which is git-ignored. Keep them out of this file.
