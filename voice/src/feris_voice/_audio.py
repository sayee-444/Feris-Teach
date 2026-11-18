"""What the voice service swaps: the engine that turns a sentence into sound, and the player."""

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True, slots=True)
class Audio:
    """One sentence turned into sound."""

    sentence: str
    """The sentence the sound says."""
    samples: bytes
    """Signed 16-bit mono samples, little-endian."""
    rate: int
    """Samples per second."""

    @property
    def seconds(self) -> float:
        """How long the sound lasts."""
        return len(self.samples) / 2 / self.rate


class Engine(Protocol):
    """A speech engine with its voice loaded, ready to speak."""

    @property
    def voice(self) -> str:
        """The voice it speaks with, as the student is told it: "the Piper voice x"."""
        ...

    def synthesise(self, sentence: str) -> Audio:
        """Turns one sentence into sound."""
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

    def play(self, audio: Audio) -> Playback:
        """Starts playing the sound and returns at once."""
        ...
