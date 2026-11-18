"""The lab's fake engine: it makes silent sound at once, so that the lab can check what would be
said without a voice installed. Its one setting, `seconds`, is how long each sentence lasts."""

from dataclasses import dataclass
from pathlib import Path

from feris_voice import Audio, VoiceError

RATE = 16_000


@dataclass(frozen=True, slots=True)
class FakeEngine:
    seconds: float
    voice: str = "the fake voice of the lab"

    def synthesise(self, sentence: str) -> Audio:
        return Audio(sentence, bytes(2 * round(self.seconds * RATE)), RATE)


def load(settings: dict[str, object], _voices: Path) -> FakeEngine:
    seconds = settings.get("seconds", 0)
    if isinstance(seconds, bool) or not isinstance(seconds, int | float) or seconds < 0:
        raise VoiceError("seconds in [engine] must be a number of seconds, 0 or more.")
    return FakeEngine(float(seconds))
