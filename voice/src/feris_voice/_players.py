"""The players: `native` plays through the machine's own sound, `fake` records what it would play.

The native player needs nothing installed beyond the system. On Linux it uses the first
command-line player it finds, PipeWire's `pw-play`, PulseAudio's `paplay` or ALSA's `aplay`, and
streams each sentence into it as it is made. On Windows it uses the standard library's
`winsound`, which plays only whole files: each sentence is written to a temporary WAV file once
it is all made, and played. Stopping ends the playing at once.
"""

import contextlib
import json
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import wave
from collections.abc import Callable
from pathlib import Path
from typing import IO, final

from feris_voice._audio import Playback, Player, Sound
from feris_voice._config import Settings, VoiceError


def _pw_play(path: str, rate: int) -> list[str]:
    return [path, "--raw", "--format", "s16", "--channels", "1", "--rate", str(rate), "-"]


def _paplay(path: str, rate: int) -> list[str]:
    return [path, "--raw", "--format=s16le", "--channels=1", f"--rate={rate}"]


def _aplay(path: str, rate: int) -> list[str]:
    return [path, "-q", "-t", "raw", "-f", "S16_LE", "-c", "1", "-r", str(rate), "-"]


type _Command = Callable[[str, int], list[str]]
"""A command-line player's command line, from its path and the rate of the sound it reads on
its standard input as signed 16-bit mono samples."""

_COMMANDS: tuple[tuple[str, _Command], ...] = (
    ("pw-play", _pw_play),
    ("paplay", _paplay),
    ("aplay", _aplay),
)
"""The command-line players, in the order they are tried."""


@final
class _ProcessPlayback:
    """A sound streamed into a command-line player as it is made."""

    def __init__(self, command: list[str], sound: Sound) -> None:
        self._stopped = False
        self._failed: Exception | None = None
        self._process = subprocess.Popen(
            command,
            stdin=subprocess.PIPE,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        stdin = self._process.stdin
        assert stdin is not None
        self._feeding = threading.Thread(
            target=self._feed, args=(sound, stdin), name="play", daemon=True
        )
        self._feeding.start()

    def _feed(self, sound: Sound, stdin: IO[bytes]) -> None:
        try:
            # A stopped player closes its end of the pipe.
            with contextlib.suppress(OSError, ValueError), stdin:
                for piece in sound.pieces():
                    _ = stdin.write(piece)
                    stdin.flush()
        except Exception as error:
            self._failed = error
            self.stop()

    def wait(self) -> bool:
        self._feeding.join()
        code = self._process.wait()
        if self._failed is not None:
            raise self._failed
        return code == 0 and not self._stopped

    def stop(self) -> None:
        self._stopped = True
        if self._process.poll() is None:
            self._process.terminate()


@final
class _CommandPlayer:
    def __init__(self, path: str, command: _Command) -> None:
        self._path = path
        self._command = command

    def play(self, sound: Sound) -> Playback:
        return _ProcessPlayback(self._command(self._path, sound.rate), sound)


if sys.platform == "win32":
    import winsound

    def _wav(rate: int, samples: bytes) -> Path:
        """The sound written to a temporary WAV file, which whoever plays it deletes."""
        with tempfile.NamedTemporaryFile(
            prefix="feris-voice-", suffix=".wav", delete=False
        ) as file:
            with wave.open(file, "wb") as out:
                out.setnchannels(1)
                out.setsampwidth(2)
                out.setframerate(rate)
                out.writeframes(samples)
            return Path(file.name)

    @final
    class _WindowsPlayback:
        """A sound played by Windows' own player, which plays one whole file at a time: it
        starts once the sentence is all made."""

        def __init__(self, sound: Sound) -> None:
            self._over = threading.Event()
            self._lock = threading.Lock()
            self._path: Path | None = None
            self._seconds = 0.0
            self._failed: Exception | None = None
            self._starting = threading.Thread(
                target=self._start, args=(sound,), name="play", daemon=True
            )
            self._starting.start()

        def _start(self, sound: Sound) -> None:
            try:
                samples = b"".join(sound.pieces())
                with self._lock:
                    if self._over.is_set() or samples == b"":
                        return
                    self._path = _wav(sound.rate, samples)
                    self._seconds = len(samples) / 2 / sound.rate
                    winsound.PlaySound(
                        str(self._path),
                        winsound.SND_FILENAME | winsound.SND_ASYNC | winsound.SND_NODEFAULT,
                    )
            except Exception as error:
                self._failed = error

        def wait(self) -> bool:
            self._starting.join()
            if self._failed is not None:
                self.stop()
                raise self._failed
            stopped = self._over.wait(self._seconds)
            with self._lock:
                self._over.set()
            # Windows may still hold the file a moment after the sound ends.
            if self._path is not None:
                with contextlib.suppress(OSError):
                    self._path.unlink(missing_ok=True)
            return not stopped

        def stop(self) -> None:
            with self._lock:
                if not self._over.is_set():
                    if self._path is not None:
                        winsound.PlaySound(None, 0)
                    self._over.set()

    @final
    class _WindowsPlayer:
        def play(self, sound: Sound) -> Playback:
            return _WindowsPlayback(sound)


def _native() -> Player:
    if sys.platform == "win32":
        return _WindowsPlayer()
    for name, command in _COMMANDS:
        found = shutil.which(name)
        if found is not None:
            return _CommandPlayer(found, command)
    raise VoiceError(
        "there is no audio player on this machine. Install PipeWire (pw-play), PulseAudio "
        + "(paplay) or the ALSA utilities (aplay)."
    )


@final
class _FakePlayback:
    def __init__(self, record: Path, sound: Sound, hold: bool) -> None:
        self._record = record
        self._sound = sound
        self._hold = hold
        self._began = time.monotonic()
        self._stopped = threading.Event()

    def wait(self) -> bool:
        seconds = sum(len(piece) for piece in self._sound.pieces()) / 2 / self._sound.rate
        left = max(0.0, seconds - (time.monotonic() - self._began))
        cut = self._stopped.wait(None if self._hold else left)
        line = json.dumps({"sentence": self._sound.sentence, "cut": cut}, ensure_ascii=False)
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

    def play(self, sound: Sound) -> Playback:
        self._played += 1
        return _FakePlayback(self._record, sound, self._played == self._hold_on)


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
