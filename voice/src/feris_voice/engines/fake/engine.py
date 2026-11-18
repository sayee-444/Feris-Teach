"""The lab's fake engine: it makes silent sound, so that the lab can check what would be said
without a voice installed. Its settings: `seconds`, how long each sentence lasts; `pieces`, how
many pieces it makes each sentence in; and `making`, how many seconds it takes to make each
piece."""

import time
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path

from feris_voice import Audio, VoiceError

RATE = 16_000


@dataclass(frozen=True, slots=True)
class FakeEngine:
    seconds: float
    pieces: int
    making: float
    voice: str = "the fake voice of the lab"

    def synthesise(self, _sentence: str) -> Iterator[Audio]:
        samples = round(self.seconds * RATE / self.pieces)
        for _ in range(self.pieces):
            time.sleep(self.making)
            yield Audio(bytes(2 * samples), RATE)


def _seconds(settings: dict[str, object], key: str) -> float:
    value = settings.get(key, 0)
    if isinstance(value, bool) or not isinstance(value, int | float) or value < 0:
        raise VoiceError(f"{key} in [engine] must be a number of seconds, 0 or more.")
    return float(value)


def load(settings: dict[str, object], _voices: Path) -> FakeEngine:
    unknown = set(settings) - {"seconds", "pieces", "making"}
    if unknown:
        raise VoiceError(
            f"[engine] has settings the fake engine does not know: {', '.join(sorted(unknown))}."
        )
    pieces = settings.get("pieces", 1)
    if isinstance(pieces, bool) or not isinstance(pieces, int) or pieces < 1:
        raise VoiceError("pieces in [engine] must be a whole number, 1 or more.")
    return FakeEngine(_seconds(settings, "seconds"), pieces, _seconds(settings, "making"))
