"""What the voice service swaps: the engine that turns a sentence into sound, and the player.

Sound streams: the engine makes a sentence piece by piece, and the player starts playing the
first piece while the rest is still being made.
"""

from collections.abc import Iterable, Iterator
from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True, slots=True)
class Audio:
    """A piece of sound, as an engine makes it."""

    samples: bytes
    """Signed 16-bit mono samples, little-endian."""
    rate: int
    """Samples per second."""

    @property
    def seconds(self) -> float:
        """How long the piece lasts."""
        return len(self.samples) / 2 / self.rate


class Engine(Protocol):
    """A speech engine with its voice loaded, ready to speak."""

    @property
    def voice(self) -> str:
        """The voice it speaks with, as the student is told it: "the Qwen voice x"."""
        ...

    def synthesise(self, sentence: str) -> Iterable[Audio]:
        """Turns one sentence into sound, giving each piece as soon as it is made. The pieces
        of a sentence share one rate."""
        ...


class Sound(Protocol):
    """One sentence's sound, which may still be being made."""

    @property
    def sentence(self) -> str:
        """The sentence the sound says."""
        ...

    @property
    def rate(self) -> int:
        """Samples per second."""
        ...

    def pieces(self) -> Iterator[bytes]:
        """The samples, signed 16-bit mono little-endian, piece by piece, each as soon as it is
        made. It ends once the sentence is all made, or at once when the sound is cut."""
        ...


class Playback(Protocol):
    """A sound that is playing."""

    def wait(self) -> bool:
        """Waits until the sound ends. True when it played to the end, False when it was stopped."""
        ...

    def stop(self) -> None:
        """Silences the sound at once. Stopping a sound that has ended does nothing."""
        ...


class Player(Protocol):
    """What plays the sound on the student's machine."""

    def play(self, sound: Sound) -> Playback:
        """Starts playing the sound, as it is made, and returns at once."""
        ...
