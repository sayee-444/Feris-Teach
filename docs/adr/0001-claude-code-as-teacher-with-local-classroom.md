# Claude Code as the teacher, with a local web classroom seen through Playwright

The teacher is a Claude Code session in the terminal. The preparer and the advisor are subagents with a stronger model and higher effort, and the classroom is a web page served on `localhost` from this repo, which the teacher sees and points at through a Playwright-controlled browser. We chose this because the project wants Claude as its main model and Anthropic's own tooling (skills, subagents, `/voice`), and because it must work the same on Linux and Windows.

## Considered Options

- **A custom Python app on llama-cpp-python with a local Qwen**: full privacy and zero cost, but a weaker teacher and far more to build. Rejected as the teacher; a local model may return as a helper.
- **The classroom published as claude.ai Artifacts**: shareable, but the teacher cannot see it or point at it live. Kept only for sharing a finished book.
- **Desktop screenshots (grim/hyprctl)**: the teacher would see any window, but it only works on Linux with Hyprland and exposes the whole desktop. The teacher sees **only the classroom**; the student's code reaches it by pasting or by file path.

## Consequences

- The classroom is a separate browser (Playwright), not the student's personal browser.
- One student per machine for now: no accounts, hosting or per-student cost.
