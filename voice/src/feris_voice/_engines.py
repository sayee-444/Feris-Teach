"""The speech engines, a self-registering set (ADR-0003): each is a folder in `engines/` holding an
`engine.py`, found by the folder's name at run time, whose `load(settings, voices)` returns an
`Engine` with its voice loaded."""

import importlib
import re
from pathlib import Path
from typing import cast

from feris_voice._audio import Engine
from feris_voice._config import Settings, VoiceError


def engine_names() -> list[str]:
    """The engines there are, by name."""
    folder = Path(__file__).with_name("engines")
    return sorted(path.parent.name for path in folder.glob("*/engine.py"))


def load_engine(name: str, settings: Settings, voices: Path) -> Engine:
    """The engine of this name with its voice loaded. `voices` is where voices are downloaded."""
    if not re.fullmatch(r"[a-z][a-z0-9_]*", name) or name not in engine_names():
        raise VoiceError(
            f'there is no voice engine "{name}". The engines are: {", ".join(engine_names())}.'
        )
    try:
        module = importlib.import_module(f"feris_voice.engines.{name}.engine")
    except ImportError as error:
        raise VoiceError(
            f'the voice engine "{name}" is not installed: {error}. Install it, from the '
            + "repo's folder, with:\n  uv sync --project voice"
        ) from error
    load: object = getattr(module, "load", None)
    if not callable(load):
        raise VoiceError(f'the voice engine "{name}" has no load(settings, voices) function.')
    engine: object = load(settings, voices)
    if not (
        isinstance(getattr(engine, "voice", None), str)
        and callable(getattr(engine, "synthesise", None))
    ):
        raise VoiceError(
            f'the voice engine "{name}" did not load an engine with a voice and synthesise().'
        )
    return cast("Engine", engine)
