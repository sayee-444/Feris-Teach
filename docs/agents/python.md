# Python

The Python code of Feris-Teach is the voice service, in `voice/` (package `feris_voice`, sources in `voice/src/`).

## Environment: uv

Every Python command goes through [uv](https://docs.astral.sh/uv/). System `pip` and system `python` stay untouched. The tools run through `uvx` at pinned versions, so they need no environment of their own.

## Toolchain: basedpyright + Ruff

**basedpyright** is the only type checker and **Ruff** the only linter and formatter. One command runs all three checks, with the versions pinned in `package.json`:

```bash
npm run check:python
```

It runs `ruff check`, `ruff format --check` and `basedpyright` over `voice/`. `npm run format` applies the formatting. `pyrightconfig.json` at the root sets the `recommended` level for both the editor and the CLI; `ruff.toml` holds the lint rules.

Keep the basedpyright version in `package.json` equal to the human's editor extension, so the CLI reports what the human sees in the **Problems** panel.

## Reading a diagnostic

The human may paste Problems entries as JSON. The fields that matter:

- `resource` + `startLineNumber:startColumn`: where the problem is.
- `source`: which tool reported it (`basedpyright` or `Ruff`).
- `code.value`: the rule, e.g. `reportArgumentType`. Look it up at `https://docs.basedpyright.com/latest/configuration/config-files/#<rule>` or with `uvx ruff rule <CODE>`.
- `severity`: `8` = error, `4` = warning, `2` = info, `1` = hint.

Fix the cause in the types: narrow `Optional` values, annotate with the library's own types, and use `cast` or `isinstance` where a union comes back. A `# pyright: ignore[<rule>]` comment is a last resort: name the rule and add a one-line reason.

## Done means clean

Python work is done when `npm run check:python` reports zero errors and the formatter wants to change nothing. Run it after every change to `voice/`. If a warning stays, report it to the human by rule name and say why.
