"""`feris-voice serve`: runs the voice service until it is told to stop.

The toolbelt starts it in the background (`feris voice start`). Once the engine is loaded and
the service listens, it records itself in `<student>/run/voice.json` (its process, its address
and its voice), which is how the toolbelt finds it; it removes the record when it stops.
"""

import argparse
import json
import os
import signal
import sys
import threading
from pathlib import Path
from typing import cast

from feris_voice._config import VoiceError, load_config
from feris_voice._engines import load_engine
from feris_voice._players import load_player
from feris_voice._server import VoiceServer
from feris_voice._speaker import Speaker


def _claim_record(path: Path, record: dict[str, object]) -> None:
    """Writes the record whole or not at all, so that the toolbelt never reads half of it, and
    only if no other voice service has written one: of two started at once, one runs."""
    path.parent.mkdir(parents=True, exist_ok=True)
    partial = path.with_name(f"{path.name}.{os.getpid()}.tmp")
    _ = partial.write_text(f"{json.dumps(record)}\n", encoding="utf-8")
    try:
        os.link(partial, path)
    except FileExistsError:
        raise VoiceError(f"another voice service is already running: see {path}.") from None
    finally:
        partial.unlink(missing_ok=True)


def _is_mine(path: Path) -> bool:
    try:
        record = cast("object", json.loads(path.read_text(encoding="utf-8")))
    except (OSError, ValueError):
        return False
    if not isinstance(record, dict):
        return False
    return cast("dict[str, object]", record).get("pid") == os.getpid()


def serve(student: Path) -> int:
    config = load_config(student)
    engine = load_engine(config.engine.name, config.engine.settings, student / "voices")
    player = load_player(config.player.name, config.player.settings)
    speaker = Speaker(engine, player)
    server = VoiceServer(speaker)
    record = student / "run" / "voice.json"

    stopping = threading.Event()

    def stop(_signal: int, _frame: object) -> None:
        stopping.set()

    for name in ("SIGINT", "SIGTERM", "SIGBREAK"):
        number = cast("signal.Signals | None", getattr(signal, name, None))
        if number is not None:
            _ = signal.signal(number, stop)
    try:
        _claim_record(record, {"pid": os.getpid(), "url": server.url, "voice": engine.voice})
    except VoiceError:
        server.server_close()
        speaker.close()
        raise
    listening = threading.Thread(target=server.serve_forever, name="listen", daemon=True)
    listening.start()
    print(f"The voice service is listening at {server.url} with {engine.voice}.", flush=True)
    try:
        while not stopping.wait(0.5):
            pass
    finally:
        server.shutdown()
        server.server_close()
        speaker.close()
        if _is_mine(record):
            record.unlink(missing_ok=True)
    print("The voice service has stopped.", flush=True)
    return 0


def main(argv: list[str] | None = None) -> int:
    """The command line of the voice service."""
    parser = argparse.ArgumentParser(
        prog="feris-voice",
        description="The voice service of Feris-Teach. The toolbelt runs it: see feris voice.",
    )
    commands = parser.add_subparsers(dest="command", required=True)
    serving = commands.add_parser("serve", help="run the voice service until Ctrl+C")
    _ = serving.add_argument(
        "--student", type=Path, required=True, help="the student folder, where voice.toml is"
    )
    args = parser.parse_args(argv)
    # argparse's namespace holds Any; type=Path made this one a Path.
    student: Path = args.student  # pyright: ignore[reportAny]
    try:
        return serve(student)
    except VoiceError as error:
        print(f"feris-voice: {error}", file=sys.stderr, flush=True)
        return 2
