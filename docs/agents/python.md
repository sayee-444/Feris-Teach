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

## Parts and their interface

The voice service is one **part** (ADR-0003). Its whole public interface is `voice/src/feris_voice/__init__.py`.

- **The interface is `__init__.py` with `__all__`**: it imports each public name from the module that owns it and lists it in `__all__`. Code outside the part imports from `feris_voice` and from nowhere deeper.
- **Private modules are named `_name.py`**, with ordinary names inside them. A `_function` shared between two modules trips `reportPrivateUsage` even inside the package, so put the underscore on the module.
- **List every private module in `ruff.toml`** under `[lint.flake8-tidy-imports.banned-api]` when you create it, by its full dotted name. `TID251` then fails any import of it from outside `voice/src/feris_voice/`; basedpyright does not catch that case.
- **Imports are absolute**: `from feris_voice._engine import Engine`. `TID252` fails a relative one.
- **Name a module after what it holds** (`messages.py`, `_report.py`). A module named `types.py` shadows the standard library whenever something runs from inside its folder, so the name is never used.

`voice/pyproject.toml` declares a `[build-system]`, so `uv sync` and `uv run` inside `voice/` install `feris_voice` into the environment.

## Typing conventions

| For                                            | Use                                                                                          |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------- |
| What is swappable (a voice engine)             | `Protocol`. An implementation matches by shape and imports nothing from the service          |
| Data                                           | `@dataclass(frozen=True, slots=True)`                                                        |
| Identifiers that must not be mixed up          | `NewType`                                                                                    |
| Aliases                                        | The `type` statement. An alias made this way cannot be the second argument of `isinstance()` |
| A constrained type used in more than one place | `Annotated`, behind an alias                                                                 |

A type lives beside the code that owns it. Move it to a module of its own only to break an import cycle, and that module imports nothing from the package.

An import used only in annotations goes under `if TYPE_CHECKING:`; the `TC` rules ask for it and `npm run format` moves it.

**Pydantic** enters only where the toolbelt and the voice service exchange data, and only once that boundary exists. Inside the part, basedpyright is enough. When Pydantic arrives, set `lint.flake8-type-checking.runtime-evaluated-base-classes` in `ruff.toml`, because Pydantic reads annotations at run time and the `TC` rules would otherwise move its imports away.

## Reading a diagnostic

The human may paste Problems entries as JSON. The fields that matter:

- `resource` + `startLineNumber:startColumn`: where the problem is.
- `source`: which tool reported it (`basedpyright` or `Ruff`).
- `code.value`: the rule, e.g. `reportArgumentType`. Look it up at `https://docs.basedpyright.com/latest/configuration/config-files/#<rule>` or with `uvx ruff rule <CODE>`.
- `severity`: `8` = error, `4` = warning, `2` = info, `1` = hint.

Fix the cause in the types: narrow `Optional` values, annotate with the library's own types, and use `cast` or `isinstance` where a union comes back. A `# pyright: ignore[<rule>]` comment is a last resort: name the rule and add a one-line reason.

## Done means clean

Python work is done when `npm run check:python` reports zero errors and the formatter wants to change nothing. Run it after every change to `voice/`. If a warning stays, report it to the human by rule name and say why.
