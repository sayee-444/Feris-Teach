# Changelog

All notable changes to Feris-Teach are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- The project base: README, CONTRIBUTING, this changelog and the MIT licence.
- The skeleton of the teacher's toolbelt, `feris`, which reports its version and its help.
- Lint and type checks for the Node and Python code, run with `npm run check` and by GitHub Actions on every pull request.
- The skeleton of the voice service's Python package.
- AGENTS.md in English: the product, its two modes and where things live.
- The lab: `feris lab list` and `feris lab run <scenario>` try one part of Feris-Teach in isolation. Automatic scenarios check themselves and run on every pull request; human scenarios save a rating and comments in the student folder.
- The classroom: `feris classroom start` serves the books on localhost with live reload and `feris classroom stop` stops it, leaving no process behind. Every page gets a bar to move between lessons, the glossary and the reference, and a switch between light and dark.
- The sample book, `basic-algebra`: original lessons on expressions and linear equations, with a chart, quizzes, a glossary and a reference.
- A book's machine-readable index (`index.json`) and the book checker, `feris book check <book>`, which reports every mismatch between the index and the files.
- The shared lesson components (stylesheet, quiz, token chips), ported to English as the classroom's components.
- The student's own books in `student/books/` are served and checked next to the sample book.
- Lab scenarios get their own environment for the toolbelt and a headless browser.
- Parts with a narrow interface (ADR-0003): each part has one entry file, other parts import the toolbelt as `#toolbelt`, and the checks fail when an import reaches inside another part. `docs/agents/javascript.md` and `docs/agents/python.md` hold the conventions.

[Unreleased]: https://github.com/sayee-444/Feris-Teach/commits/main
