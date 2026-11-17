# One folder per part, each with a narrow interface that the linters enforce

Feris-Teach is split into parts (the toolbelt, the classroom, the voice service, the lab), each in its own folder with one entry file that is its whole public interface: `index.js` in Node, `__init__.py` with `__all__` in Python. Other parts import only that entry (in Node through a `#name` subpath import), and Biome and Ruff fail the checks when an import reaches inside a part. The repo keeps one `package.json` and one `pyproject.toml`. We chose this so that a part can be added, changed or removed without touching the rest, and so that an agent learns a part by reading one file.

Where a set of pieces is open-ended, the pieces register themselves instead: a folder with a file of a fixed name, found at run time, as the lab's scenarios are. This applies to scenarios, voice engines and whiteboard tools, and to nothing else. The toolbelt's commands are an explicit list.

A part's public types live in one known file of that part and are re-exported from its entry; internal types live beside the code that uses them. There is no repo-wide types folder.

## Considered Options

- **A monorepo with npm workspaces, a uv workspace and TypeScript project references**: Node itself would refuse imports of a package's internals, and each part would get its own dependencies. Rejected for now because a relative import still bypasses `exports`, so the same lint rules would be needed anyway, and because project references cannot be combined with `noEmit`, which would add generated declaration files. Reconsider when a second Python package depends on the voice service, or when one Node part needs dependencies the others must not install.
- **Self-registration everywhere, including the toolbelt's commands**: adding anything would be adding a folder, but a dynamic import escapes the type checker and "go to definition", and hides what depends on what. Kept only for the open-ended sets.
- **One shared types folder for the whole repo**: every part would depend on it, and removing a part would mean editing it.

## Consequences

- The boundary is held by the linters, not by the runtime: turning a rule off removes it.
- Every self-registering set needs its own check of the piece's shape at run time, as the lab has for scenarios.
- No Python module is named `types.py`: it shadows the standard library when anything runs from inside its folder.
- Pydantic enters only where the toolbelt and the voice service exchange data, and only once that boundary exists. Inside a part, the type checker is enough.
