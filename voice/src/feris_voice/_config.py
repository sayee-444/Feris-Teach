"""The voice's configuration: the defaults of the repo, then the student's own `voice.toml`."""

import tomllib
from dataclasses import dataclass
from importlib.resources import files
from pathlib import Path
from typing import cast

type Settings = dict[str, object]
"""The settings of an engine or a player, as written in its table of the configuration."""


class VoiceError(Exception):
    """A problem whoever started the voice service can fix. The message says what and how."""


@dataclass(frozen=True, slots=True)
class Choice:
    """An engine or a player, by name, with its settings."""

    name: str
    settings: Settings


@dataclass(frozen=True, slots=True)
class Config:
    """Which engine and which player the voice service uses."""

    engine: Choice
    player: Choice


def _table(value: object, where: str) -> Settings:
    """A TOML table as settings, or an error saying where it is wrong."""
    if value is None:
        return {}
    if not isinstance(value, dict):
        raise VoiceError(f"{where} must be a table.")
    return {str(key): item for key, item in cast("dict[object, object]", value).items()}


def _read(text: str, where: str) -> Settings:
    try:
        return tomllib.loads(text)
    except tomllib.TOMLDecodeError as error:
        raise VoiceError(f"{where} is not valid TOML: {error}") from error


def _section(defaults: Settings, own: Settings, name: str, where: str) -> Choice:
    """One table of the configuration: the student's keys over the defaults' keys, unless the
    student names another engine or player, whose settings then start empty."""
    base = _table(defaults.get(name), f"[{name}] of the defaults")
    mine = _table(own.get(name), f"[{name}] in {where}")
    if "name" in mine and mine["name"] != base.get("name"):
        base = {}
    merged = base | mine
    chosen = merged.pop("name", None)
    if not isinstance(chosen, str):
        raise VoiceError(f'[{name}] in {where} must say which one to use, as name = "<name>".')
    return Choice(chosen, merged)


def load_config(student: Path) -> Config:
    """The voice's configuration for the student whose folder this is."""
    defaults = _read(
        files("feris_voice").joinpath("defaults.toml").read_text("utf-8"), "defaults.toml"
    )
    path = student / "voice.toml"
    own = _read(path.read_text("utf-8"), str(path)) if path.is_file() else {}
    return Config(
        _section(defaults, own, "engine", str(path)), _section(defaults, own, "player", str(path))
    )
