# How Feris-Teach is built

Feris-Teach is built for its owner alone, on Linux ([ADR-0005](docs/adr/0005-built-for-its-owner-alone-on-linux.md)); this file holds the conventions every agent building it follows. The repo is in English: docs, code, issues, commit messages and pull requests. Use the words of the [glossary](GLOSSARY.md) for the product's concepts, and read the [decision records](docs/adr/) before changing the area they cover.

## Setting up

You need Linux, [Node.js](https://nodejs.org/) 22 or later and [uv](https://docs.astral.sh/uv/).

```bash
npm install
npx playwright install chromium
uv sync --project voice
```

The second line downloads the headless Chromium that the classroom's lab scenarios look at pages with; the third installs the voice service and its engine into `voice/.venv`, where the type checker finds them. The tests and the lab's scenarios use the lab's fake voice, so they need no voice downloaded.

## Checks

| Command                                | What it does                                                      |
| -------------------------------------- | ----------------------------------------------------------------- |
| `npm run check`                        | Lint, formatting and type checks for the Node and the Python code |
| `npm test`                             | The toolbelt's tests and the boundaries between parts             |
| `npm run format`                       | Applies the formatting and the safe lint fixes                    |
| `npm run feris -- lab run --automatic` | Runs every automatic scenario of the lab                          |

The Node code is plain JavaScript with JSDoc types, checked by Biome and the TypeScript compiler. The Python code is checked by Ruff and basedpyright. GitHub Actions runs `npm run check`, `npm test` and the lab's automatic scenarios on every pull request, on Linux.

The code is split into parts, each with one entry file, and the checks fail when an import reaches inside another part ([ADR-0003](docs/adr/0003-one-folder-per-part-with-a-narrow-interface.md)). The conventions are in [docs/agents/javascript.md](docs/agents/javascript.md) and [docs/agents/python.md](docs/agents/python.md).

`main` always passes the checks.

## The lab

The lab tries one part of Feris-Teach in isolation, without giving a class, by loading a scenario:

```bash
npm run feris -- lab list
npm run feris -- lab run example-automatic
```

A scenario is a folder in `lab/scenarios/` holding a `scenario.js`, and the folder's name is the scenario's name. There are two kinds:

- An **automatic** scenario checks itself: its `check` throws when the part under trial misbehaves, and the run exits accordingly.
- A **human** scenario is for what only a person can judge. Its `present` shows what to judge; the lab then shows the scenario's checklist, asks for a rating from 1 to 5 and for comments, and appends them with a timestamp to `student/lab/<scenario>.jsonl`.

To add a scenario, copy `lab/scenarios/example-automatic/` or `lab/scenarios/example-human/` and change it. The lab finds it by itself. Both `check` and `present` receive the lab's tools, fresh for each run:

- `feris` runs the toolbelt as a separate process, the way the teacher does.
- `env` holds environment variables added to every `feris` run of the scenario. A scenario that starts the classroom sets `FERIS_STUDENT_DIR` to a temporary folder, so it never meets the student's own classroom.
- `browser()` launches a headless Chromium on the first call; the lab closes it when the scenario is over.

Three environment variables point the toolbelt elsewhere, which is how the tests and the scenarios run it: `FERIS_SCENARIOS_DIR` replaces `lab/scenarios/`, `FERIS_STUDENT_DIR` replaces `student/`, and `FERIS_BOOKS_DIR` replaces `books/`.

## How work flows

1. **Every change starts as a GitHub issue.** Issues carry one of the triage labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human` or `wontfix`.
2. **One branch per issue**, named from the issue number and a short slug: `2-project-base`.
3. **One pull request per branch.** Its description closes the issue (`Closes #2`).
4. **Squash merge.** Each ticket lands on `main` as one commit, and the branch is deleted.

### Working on several issues at once

Use one [git worktree](https://git-scm.com/docs/git-worktree) per branch, so that agents working in parallel never share a working directory:

```bash
git worktree add ../Feris-Teach-7 -b 7-classroom-state
```

## Commit messages

Commits follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/):

```
<type>(<optional scope>): <description>
```

The types in use are `feat`, `fix`, `docs`, `refactor`, `test`, `chore` and `ci`. Since pull requests are squash-merged, the pull request title is the commit that lands on `main`: write it as a Conventional Commit and end it with the issue number, as in `feat(toolbelt): report the classroom state (#7)`.

## Versions and releases

Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). The first release is `0.1.0`; fixes to it bump the patch number.

Every pull request that changes what the student sees adds a line under `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md), which follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

A release is:

1. a commit that sets the version in `package.json` and `voice/pyproject.toml`, refreshes `voice/uv.lock` with `uv lock` run inside `voice/`, and moves the `[Unreleased]` entries under the new version in the changelog,
2. a git tag `v<version>` on that commit,
3. a GitHub Release for the tag, with the changelog entry as its notes.

## Nothing personal in the repo

Everything that belongs to the student lives in the git-ignored `student/` folder ([ADR-0002](docs/adr/0002-one-private-student-folder.md)): the profile, the student's books, sources, voices and recipes. The repo's only book is the sample book, `books/basic-algebra/`, written for this repo; the student's books live in `student/books/`.
