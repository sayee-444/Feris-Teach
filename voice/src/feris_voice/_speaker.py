"""The speaker: it speaks the sentences it is given one after another, and knows what was heard.

While one sentence plays, the next ones are already being synthesised, so that the voice runs
on without gaps. Stopping silences the sentence that is playing at once and drops the rest, and
says what was cut, the interruption: the sentence the voice was on, or else the last one of the
reply it finished, and the sentences that were never heard.
"""

import sys
import threading
import traceback
from collections import deque
from collections.abc import Sequence
from concurrent.futures import CancelledError, Future, ThreadPoolExecutor
from dataclasses import dataclass
from typing import TYPE_CHECKING, final

from feris_voice._audio import Engine, Player

if TYPE_CHECKING:
    from feris_voice._audio import Audio, Playback


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
class Speaker:
    """Speaks sentences in order through an engine and a player."""

    def __init__(self, engine: Engine, player: Player) -> None:
        self._engine = engine
        self._player = player
        self._changed = threading.Condition()
        self._queue: deque[tuple[str, Future[Audio]]] = deque()
        self._on = True
        self._closed = False
        self._preparing: str | None = None
        """The sentence taken from the queue, waiting for its sound."""
        self._speaking: str | None = None
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
                sound = self._synthesiser.submit(self._engine.synthesise, sentence)
                self._queue.append((sentence, sound))
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
            return Status(self._on, self._speaking, self._waiting())

    def close(self) -> None:
        """Silences the voice and ends the speaker's threads."""
        with self._changed:
            _ = self._cut()
            self._closed = True
            self._changed.notify_all()
        self._synthesiser.shutdown(cancel_futures=True)
        self._thread.join()

    def _waiting(self) -> tuple[str, ...]:
        first = () if self._preparing is None else (self._preparing,)
        return (*first, *(sentence for sentence, _ in self._queue))

    def _cut(self) -> Interruption:
        unheard = self._waiting()
        last_heard = self._speaking or self._last_heard
        cut = self._speaking is not None or len(unheard) > 0
        for _, sound in self._queue:
            _ = sound.cancel()
        self._queue.clear()
        if self._playback is not None:
            try:
                self._playback.stop()
            except Exception:
                _log(f"could not stop {self._speaking!r}:\n{traceback.format_exc()}")
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
                sentence, sound = self._queue.popleft()
                self._preparing = sentence
                cuts = self._cuts
            try:
                audio = sound.result()
            except CancelledError:
                continue
            except Exception:
                _log(f"could not synthesise {sentence!r}:\n{traceback.format_exc()}")
                audio = None
            with self._changed:
                if cuts != self._cuts:
                    continue
                self._preparing = None
                if audio is None:
                    continue
                try:
                    playback = self._player.play(audio)
                except Exception:
                    _log(f"could not play {sentence!r}:\n{traceback.format_exc()}")
                    continue
                self._speaking = sentence
                self._playback = playback
            try:
                _ = playback.wait()
            except Exception:
                _log(f"could not play {sentence!r} to the end:\n{traceback.format_exc()}")
            with self._changed:
                if cuts == self._cuts:
                    self._speaking = self._playback = None
                    self._last_heard = sentence
