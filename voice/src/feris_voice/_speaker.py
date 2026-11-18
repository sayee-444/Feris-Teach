"""The speaker: it speaks the sentences it is given one after another, and knows what was heard.

Each sentence is played as it is made: the player starts on its first piece while the engine
makes the rest, and then the sentences after it, so that the voice runs on without gaps.
Stopping silences the sentence that is playing at once, stops making it, drops the rest, and
says what was cut, the interruption: the sentence the voice was on, or else the last one of the
reply it finished, and the sentences that were never heard.
"""

import sys
import threading
import traceback
from collections import deque
from collections.abc import Iterator, Sequence
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from typing import TYPE_CHECKING, final

from feris_voice._audio import Audio, Engine, Player

if TYPE_CHECKING:
    from feris_voice._audio import Playback


@dataclass(frozen=True, slots=True)
class Interruption:
    """What stopping the voice cut."""

    cut: bool
    """Whether anything was playing or waiting to be played."""
    last_heard: str | None
    """The sentence that was playing, or else the last one of the reply that finished; None if
    none was."""
    unheard: tuple[str, ...]
    """The sentences that were waiting and were never heard, in order."""


@dataclass(frozen=True, slots=True)
class Status:
    """What the voice is doing."""

    on: bool
    speaking: str | None
    """The sentence that is playing."""
    queued: tuple[str, ...]
    """The sentences waiting to be played, in order."""


def _log(message: str) -> None:
    print(f"feris-voice: {message}", file=sys.stderr, flush=True)


@final
class _Making:
    """A sentence's sound while the engine makes it: the engine adds the pieces, the player
    takes them as they come. Cutting it ends both at once."""

    def __init__(self, sentence: str) -> None:
        self._sentence = sentence
        self._changed = threading.Condition()
        self._pieces: list[bytes] = []
        self._rate: int | None = None
        self._made = False
        self._cut = False

    @property
    def sentence(self) -> str:
        return self._sentence

    @property
    def rate(self) -> int:
        with self._changed:
            if self._rate is None:
                raise RuntimeError(f"{self._sentence!r} has no sound yet.")
            return self._rate

    @property
    def is_cut(self) -> bool:
        with self._changed:
            return self._cut

    def add(self, audio: Audio) -> bool:
        """Adds a piece the engine made. False when the sound was cut: make no more."""
        with self._changed:
            if self._cut:
                return False
            if self._rate is None:
                self._rate = audio.rate
            elif audio.rate != self._rate:
                raise ValueError(f"a piece at {audio.rate} Hz after pieces at {self._rate} Hz.")
            self._pieces.append(audio.samples)
            self._changed.notify_all()
            return True

    def finish(self) -> None:
        """The engine made all it will make."""
        with self._changed:
            self._made = True
            self._changed.notify_all()

    def cut(self) -> None:
        with self._changed:
            self._cut = True
            self._changed.notify_all()

    def wait_started(self) -> bool:
        """Waits until the first piece is made. False when none will be: the engine failed, or
        the sound was cut."""
        with self._changed:
            while not self._pieces and not self._made and not self._cut:
                _ = self._changed.wait()
            return bool(self._pieces) and not self._cut

    def pieces(self) -> Iterator[bytes]:
        taken = 0
        while True:
            with self._changed:
                while taken == len(self._pieces) and not self._made and not self._cut:
                    _ = self._changed.wait()
                if self._cut or taken == len(self._pieces):
                    return
                piece = self._pieces[taken]
            taken += 1
            yield piece


@final
class Speaker:
    """Speaks sentences in order through an engine and a player."""

    def __init__(self, engine: Engine, player: Player) -> None:
        self._engine = engine
        self._player = player
        self._changed = threading.Condition()
        self._queue: deque[_Making] = deque()
        self._on = True
        self._closed = False
        self._preparing: _Making | None = None
        """The sentence taken from the queue, waiting for its first piece of sound."""
        self._speaking: _Making | None = None
        self._playback: Playback | None = None
        self._last_heard: str | None = None
        self._cuts = 0
        """How many times the voice was cut: a sentence taken before the last cut is dropped."""
        self._synthesiser = ThreadPoolExecutor(max_workers=1, thread_name_prefix="synthesise")
        self._thread = threading.Thread(target=self._run, name="speak", daemon=True)
        self._thread.start()

    def say(self, sentences: Sequence[str]) -> bool:
        """Queues the sentences of a reply after any already queued. False, and nothing queued,
        if the voice is off."""
        with self._changed:
            if not self._on:
                return False
            if self._speaking is None and not self._waiting():
                # A reply that starts in silence: what was heard of the one before is no news.
                self._last_heard = None
            for sentence in sentences:
                sound = _Making(sentence)
                _ = self._synthesiser.submit(self._make, sound)
                self._queue.append(sound)
            self._changed.notify_all()
            return True

    def stop(self) -> Interruption:
        """Silences the voice at once and drops what is queued."""
        with self._changed:
            return self._cut()

    def off(self) -> None:
        """Silences the voice and keeps it silent until it is turned on."""
        with self._changed:
            self._on = False
            _ = self._cut()

    def on(self) -> None:
        """Lets the voice speak again."""
        with self._changed:
            self._on = True

    def status(self) -> Status:
        with self._changed:
            speaking = None if self._speaking is None else self._speaking.sentence
            return Status(self._on, speaking, self._waiting())

    def close(self) -> None:
        """Silences the voice and ends the speaker's threads."""
        with self._changed:
            _ = self._cut()
            self._closed = True
            self._changed.notify_all()
        self._synthesiser.shutdown(cancel_futures=True)
        self._thread.join()

    def _make(self, sound: _Making) -> None:
        """Makes a sentence's sound with the engine, until it is all made or cut."""
        if sound.is_cut:
            return
        made: Iterator[Audio] | None = None
        try:
            made = iter(self._engine.synthesise(sound.sentence))
            for audio in made:
                if not sound.add(audio):
                    break
        except Exception:
            _log(f"could not synthesise {sound.sentence!r}:\n{traceback.format_exc()}")
        finally:
            # A generator left halfway keeps the engine's work open until it is closed.
            close: object = getattr(made, "close", None)
            if callable(close):
                _ = close()
            sound.finish()

    def _waiting(self) -> tuple[str, ...]:
        first = () if self._preparing is None else (self._preparing,)
        return tuple(sound.sentence for sound in (*first, *self._queue))

    def _cut(self) -> Interruption:
        unheard = self._waiting()
        last_heard = self._last_heard if self._speaking is None else self._speaking.sentence
        cut = self._speaking is not None or len(unheard) > 0
        # The playback stops first, so that it knows its sound was cut, not all made.
        if self._playback is not None:
            try:
                self._playback.stop()
            except Exception:
                _log(f"could not stop {last_heard!r}:\n{traceback.format_exc()}")
        for sound in (self._preparing, self._speaking, *self._queue):
            if sound is not None:
                sound.cut()
        self._queue.clear()
        self._cuts += 1
        self._preparing = self._speaking = self._playback = self._last_heard = None
        return Interruption(cut, last_heard if cut else None, unheard)

    def _run(self) -> None:
        while True:
            with self._changed:
                while not self._queue and not self._closed:
                    _ = self._changed.wait()
                if self._closed:
                    return
                sound = self._queue.popleft()
                self._preparing = sound
                cuts = self._cuts
            started = sound.wait_started()
            with self._changed:
                if cuts != self._cuts:
                    continue
                self._preparing = None
                if not started:
                    continue
                try:
                    playback = self._player.play(sound)
                except Exception:
                    _log(f"could not play {sound.sentence!r}:\n{traceback.format_exc()}")
                    sound.cut()
                    continue
                self._speaking = sound
                self._playback = playback
            try:
                _ = playback.wait()
            except Exception:
                _log(f"could not play {sound.sentence!r} to the end:\n{traceback.format_exc()}")
                sound.cut()
            with self._changed:
                if cuts == self._cuts:
                    self._speaking = self._playback = None
                    self._last_heard = sound.sentence
