# Feris-Teach

A teaching agent for [Claude Code](https://claude.com/claude-code). The **teacher**, speaking as the persona **Feris**, teaches any subject by talking with you in short turns, in text or voice, while a local web **classroom** shows the **book** you are studying. The teacher knows what is on your screen and can point at it.

> **Status: under construction.** The first release, `0.1.0` ("a talking class with Feris"), is being built ticket by ticket. What exists today is the project base: the teacher's toolbelt skeleton and the checks. Starting a class does not work yet. The plan is in the [spec](https://github.com/sayee-444/Feris-Teach/issues/1), and progress is in the [changelog](CHANGELOG.md).

## What a class will be

- **One command starts a class.** It opens the classroom in its own browser window and starts the voice.
- **Feris talks, you answer.** One idea, one question, then she waits. You type or dictate.
- **The classroom shows the book**: chapters, lessons, a glossary and a reference, with diagrams and quizzes.
- **Material is built in the background** by a stronger model, so the conversation never stalls.
- **Everything personal stays on your machine**, in one git-ignored `student/` folder.

Teacher, persona, classroom, book and the other words of the product are defined in the [glossary](GLOSSARY.md). The architecture is recorded in the [decision records](docs/adr/).

## Requirements

- [Node.js](https://nodejs.org/) 22 or later
- [uv](https://docs.astral.sh/uv/), which runs the Python tools
- Linux or Windows

## Getting started

```bash
git clone https://github.com/sayee-444/Feris-Teach.git
cd Feris-Teach
npm install
npm run feris -- --version
```

`feris` is the teacher's toolbelt: one command-line tool for everything outside the conversation. `npm run feris -- --help` lists what it can do.

## Contributing

[CONTRIBUTING.md](CONTRIBUTING.md) explains how work is tracked, the branch and commit conventions, and how to run the checks.

## Licence

[MIT](LICENSE)
