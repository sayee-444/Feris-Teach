# Feris-Teach

A teaching agent for [Claude Code](https://claude.com/claude-code). The **teacher**, speaking as the persona **Feris**, teaches any subject by talking with you in short turns, in text or voice, while a local web **classroom** shows the **book** you are studying. The teacher knows what is on your screen and can point at it.

> **Status: under construction.** The first release, `0.1.0` ("a talking class with Feris"), is being built ticket by ticket. What exists today is the teacher's toolbelt, the lab, the classroom serving a sample book, and the voice service. Starting a class does not work yet. The plan is in the [spec](https://github.com/sayee-444/Feris-Teach/issues/1), and progress is in the [changelog](CHANGELOG.md).

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
npm run feris -- classroom start
```

The last command prints the classroom's address. Open it in a browser to read the sample book on basic algebra; `npm run feris -- classroom stop` stops it.

## The voice

Feris's replies are spoken aloud by a local voice: the **voice service**, which keeps a speech engine loaded while it runs. The first engine is [Piper](https://github.com/OHF-Voice/piper1-gpl), which runs on the CPU, with a Spanish voice. Only the **spoken version** of a reply is spoken: the teacher marks it between `<spoken>` and `</spoken>`, and code, tables and links' addresses are never read out.

1. **Install the engine.** uv installs Piper into `voice/.venv` the first time the voice service starts. To do it beforehand, run `uv sync --project voice`.
2. **Download a voice** into the student folder (about 60 MB):

   ```bash
   uv run --project voice python -m piper.download_voices --data-dir student/voices es_ES-davefx-medium
   ```

3. **Start the voice service and try it:**

   ```bash
   npm run feris -- voice start
   npm run feris -- voice say "Hola. Soy Feris, y hoy aprendemos álgebra."
   npm run feris -- voice stop
   npm run feris -- voice shutdown
   ```

`voice stop` silences the voice at once and prints the last sentence heard and the sentences not heard; `voice off` and `voice on` turn the voice off and on. If the engine or the voice is missing, `voice start` says what is missing and how to install it.

On Linux the sound goes out through PipeWire (`pw-play`), PulseAudio (`paplay`) or ALSA (`aplay`), whichever is installed; on Windows, through Windows' own player. To use another voice or other settings, write a `student/voice.toml` with the keys of [`defaults.toml`](voice/src/feris_voice/defaults.toml) you want to change, for example:

```toml
[engine]
voice = "es_MX-claude-high"
length_scale = 0.9
```

`feris` is the teacher's toolbelt: one command-line tool for everything outside the conversation. `npm run feris -- --help` lists what it can do.

## Contributing

[CONTRIBUTING.md](CONTRIBUTING.md) explains how work is tracked, the branch and commit conventions, and how to run the checks.

## Licence

[MIT](LICENSE)
