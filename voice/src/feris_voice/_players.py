"""The players: `native` plays through the machine's own sound, `fake` records what it would play.

The native player needs nothing installed beyond the system: on Windows it uses the standard
library's `winsound`, elsewhere the first command-line player it finds (PipeWire's `pw-play`,
PulseAudio's `paplay`, ALSA's `aplay`, or `afplay` on macOS). Each sentence is written to a
temporary WAV file and played; stopping ends the playing at once.
"""

import contextlib
import json
import shutil
import subprocess
import sys
import tempfile
import threading
import wave
from pathlib import Path
from typing import final

from feris_voice._audio import Audio, Playback, Player
from feris_voice._config import Settings, VoiceError

_COMMANDS = (["pw-play"], ["paplay"], ["aplay", "-q"], ["afplay"])
"""The command-line players, in the order they are tried, each with its options."""


def _wav(audio: Audio) -> Path:
    """The sound written to a temporary WAV file, which whoever plays it deletes."""
    with tempfile.NamedTemporaryFile(prefix="feris-voice-", suffix=".wav", delete=False) as file:
        with wave.open(file, "wb") as out:
            out.setnchannels(1)
            out.setsampwidth(2)
            out.setframerate(audio.rate)
            out.writeframes(audio.samples)
        return Path(file.name)


@final
class _ProcessPlayback:
    """A sound played by a command-line player."""

    def __init__(self, command: list[str], audio: Audio) -> None:
        self._path = _wav(audio)
        self._stopped = False
        self._process = subprocess.Popen(
            [*command, str(self._path)],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

    def wait(self) -> bool:
        code = self._process.wait()
        self._path.unlink(missing_ok=True)
        return code == 0 and not self._stopped

    def stop(self) -> None:
        self._stopped = True
        if self._process.poll() is None:
            self._process.terminate()


@final
class _CommandPlayer:
    def __init__(self, command: list[str]) -> None:
        self._command = command

    def play(self, audio: Audio) -> Playback:
        return _ProcessPlayback(self._command, audio)


if sys.platform == "win32":
    import winsound

    @final
    class _WindowsPlayback:
        """A sound played by Windows' own player, which plays one sound at a time."""

        def __init__(self, audio: Audio) -> None:
            self._path = _wav(audio)
            self._seconds = audio.seconds
            self._over = threading.Event()
            self._lock = threading.Lock()
            winsound.PlaySound(
                str(self._path), winsound.SND_FILENAME | winsound.SND_ASYNC | winsound.SND_NODEFAULT
            )

        def wait(self) -> bool:
            stopped = self._over.wait(self._seconds)
            with self._lock:
                self._over.set()
            # Windows may still hold the file a moment after the sound ends.
            with contextlib.suppress(OSError):
                self._path.unlink(missing_ok=True)
            return not stopped

        def stop(self) -> None:
            with self._lock:
                if not self._over.is_set():
                    winsound.PlaySound(None, 0)
                    self._over.set()

    @final
    class _WindowsPlayer:
        def play(self, audio: Audio) -> Playback:
            return _WindowsPlayback(audio)


def _native() -> Player:
    if sys.platform == "win32":
        return _WindowsPlayer()
    for command in _COMMANDS:
        found = shutil.which(command[0])
        if found is not None:
            return _CommandPlayer([found, *command[1:]])
    raise VoiceError(
        "there is no audio player on this machine. Install PipeWire (pw-play), PulseAudio "
        + "(paplay) or the ALSA utilities (aplay)."
    )


@final
class _FakePlayback:
    def __init__(self, record: Path, audio: Audio, hold: bool) -> None:
        self._record = record
        self._audio = audio
        self._hold = hold
        self._stopped = threading.Event()

    def wait(self) -> bool:
        cut = self._stopped.wait(None if self._hold else self._audio.seconds)
        line = json.dumps({"sentence": self._audio.sentence, "cut": cut}, ensure_ascii=False)
        with self._record.open("a", encoding="utf-8") as file:
            _ = file.write(f"{line}\n")
        return not cut

    def stop(self) -> None:
        self._stopped.set()


@final
class _FakePlayer:
    """The lab's player: it plays nothing, and appends each sentence it was given to `record`, one
    JSON object per line, saying whether it was cut. It stays on sentence number `hold_on`,
    counted from 1 since the service started, until it is stopped: that is how the lab cuts the
    voice at a chosen moment."""

    def __init__(self, record: Path, hold_on: int | None) -> None:
        self._record = record
        self._hold_on = hold_on
        self._played = 0

    def play(self, audio: Audio) -> Playback:
        self._played += 1
        return _FakePlayback(self._record, audio, self._played == self._hold_on)


def _fake(settings: Settings) -> Player:
    record = settings.get("record")
    if not isinstance(record, str) or record == "":
        raise VoiceError("the fake player needs a record = '<file>' in [player].")
    hold_on = settings.get("hold_on")
    if hold_on is not None and (
        isinstance(hold_on, bool) or not isinstance(hold_on, int) or hold_on < 1
    ):
        raise VoiceError("hold_on in [player] must be the number of a sentence, from 1.")
    return _FakePlayer(Path(record), hold_on)


def load_player(name: str, settings: Settings) -> Player:
    """The player of this name."""
    if name == "native":
        return _native()
    if name == "fake":
        return _fake(settings)
    raise VoiceError(f'there is no player "{name}". The players are: fake, native.')
