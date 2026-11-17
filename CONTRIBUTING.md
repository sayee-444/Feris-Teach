# Contributing to Feris-Teach

The repo is in English: docs, code, issues, commit messages and pull requests. Use the words of the [glossary](GLOSSARY.md) for the product's concepts, and read the [decision records](docs/adr/) before changing the area they cover.

## Setting up

You need [Node.js](https://nodejs.org/) 22 or later and [uv](https://docs.astral.sh/uv/). Linux and Windows are both supported, and every change must work on both.

```bash
npm install
```

## Checks

| Command          | What it does                                                      |
| ---------------- | ----------------------------------------------------------------- |
| `npm run check`  | Lint, formatting and type checks for the Node and the Python code |
| `npm test`       | The toolbelt's tests                                              |
| `npm run format` | Applies the formatting and the safe lint fixes                    |

The Node code is plain JavaScript with JSDoc types, checked by Biome and the TypeScript compiler. The Python code is checked by Ruff and basedpyright. GitHub Actions runs `npm run check` and `npm test` on every pull request, on Linux and Windows.

`main` always passes the checks.

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

Every pull request that changes what a student or a contributor sees adds a line under `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md), which follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

A release is:

1. a commit that sets the version in `package.json` and `voice/pyproject.toml` and moves the `[Unreleased]` entries under the new version in the changelog,
2. a git tag `v<version>` on that commit,
3. a GitHub Release for the tag, with the changelog entry as its notes.

## Nothing personal in the repo

Everything that belongs to a student lives in the git-ignored `student/` folder ([ADR-0002](docs/adr/0002-one-private-student-folder.md)). Never commit a profile, a student's book, a source or any third-party material. The only book the repo will ever hold is the sample book, written for this repo (planned).
