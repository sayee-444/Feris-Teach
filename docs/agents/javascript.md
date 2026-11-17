# JavaScript

The Node code of Feris-Teach is plain JavaScript with JSDoc types, checked by Biome and the TypeScript compiler (`npm run check:node`). It is split into **parts** (ADR-0003). Today two parts have code of their own: the toolbelt, in `toolbelt/`, which also runs the lab, and the classroom, in `classroom/`. The lab's scenarios in `lab/scenarios/` are a self-registering set, found at run time.

The classroom's `web/` folder holds scripts that run in the student's browser, not in Node. They are ES modules with no imports, checked by the same tools; the classroom adds them to every page of a book.

## One entry file per part

A part's whole public interface is its `index.js`. Read it to learn the part; everything else in the folder is the part's inside, free to change.

- **Between parts, import the entry by its `#name`**: `#toolbelt` or `#classroom`, declared under `imports` in the root `package.json`. Inside a part, import by relative path.
- **The entry lists what it shares by name**: `export { name } from "./lib/file.js"`, one line per export, so the interface reads at a glance.
- **Mark an export `@package`** in its JSDoc when only its own folder and subfolders may import it, and `@private` when no other file may.

## Where types live

- **Public types** go in the part's `types.js` as `@typedef`s, and the entry re-exports each one: `/** @typedef {import("./types.js").Scenario} Scenario */`.
- **Internal types** go beside the code that uses them, in the same file.
- **Bring a type in with JSDoc `@import`**, once at the top of the file: `/** @import { Scenario } from "#toolbelt" */`. It imports nothing at run time. Give a re-exported type one of the two tags: `@import` and `@typedef` of the same name in one file is error TS2440.

`types.js` ends with `export {}` so that TypeScript treats it as a module.

## What holds the boundary

| Reaching inside another part with                                                                 | Caught by                   |
| ------------------------------------------------------------------------------------------------- | --------------------------- |
| An `import` statement or `import()`                                                               | Biome `noRestrictedImports` |
| An import of an export marked `@package` or `@private`                                            | Biome `noPrivateImports`    |
| An import cycle                                                                                   | Biome `noImportCycles`      |
| A path in a JSDoc `@import` or `import("…")` type, or in a `require()`, none of which Biome reads | `test/parts.test.js`        |

`test/parts.test.js` also proves the three Biome rules against this repo's `biome.json`, so a rule that is turned off turns a test red.

Both forbid the entry's relative path too: another part names it only as `#name`.

A file loaded by a path built at run time, as the lab loads a scenario, is outside all four. Each self-registering set checks the shape of what it loads itself, as the lab does.

## Adding a part

1. Create `<part>/index.js`, and `<part>/types.js` once it has public types.
2. Add `"#<part>": "./<part>/index.js"` to `imports` in the root `package.json`.
3. Add a pattern group for `**/<part>/**` to `noRestrictedImports` in `biome.json`, with a message naming `#<part>`.
4. Add the folder to `include` in `tsconfig.json`.

Removing a part is the same four steps undone.
