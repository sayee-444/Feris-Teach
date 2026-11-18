"""Piper (https://github.com/OHF-Voice/piper1-gpl): a fast local engine that runs on the CPU.

Settings: `voice`, the name of a Piper voice downloaded into the voices folder, such as
`es_ES-davefx-medium`; and optionally `length_scale`, `noise_scale`, `noise_w_scale`, `volume`
and `speaker`.
"""

from dataclasses import dataclass
from pathlib import Path

from piper import PiperVoice, SynthesisConfig

from feris_voice import Audio, VoiceError

_SCALES = ("length_scale", "noise_scale", "noise_w_scale", "volume")


@dataclass(frozen=True, slots=True)
class PiperEngine:
    piper: PiperVoice
    options: SynthesisConfig
    voice: str

    def synthesise(self, sentence: str) -> Audio:
        samples = b"".join(
            chunk.audio_int16_bytes for chunk in self.piper.synthesize(sentence, self.options)
        )
        return Audio(sentence, samples, self.piper.config.sample_rate)


def _number(settings: dict[str, object], key: str) -> float | None:
    value = settings.get(key)
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int | float) or value <= 0:
        raise VoiceError(f"{key} in [engine] must be a number above 0.")
    return float(value)


def load(settings: dict[str, object], voices: Path) -> PiperEngine:
    name = settings.get("voice")
    if not isinstance(name, str) or name == "":
        raise VoiceError('[engine] must name a Piper voice, as voice = "es_ES-davefx-medium".')
    unknown = set(settings) - {"voice", "speaker", *_SCALES}
    if unknown:
        raise VoiceError(
            f"[engine] has settings Piper does not know: {', '.join(sorted(unknown))}."
        )
    speaker = settings.get("speaker")
    if speaker is not None and (isinstance(speaker, bool) or not isinstance(speaker, int)):
        raise VoiceError("speaker in [engine] must be the number of one of the voice's speakers.")

    model = voices / f"{name}.onnx"
    if not model.is_file() or not model.with_name(f"{model.name}.json").is_file():
        raise VoiceError(
            f'the Piper voice "{name}" is not in {voices}. Download it, from the repo\'s '
            + "folder, with:\n"
            + f"  uv run --project voice python -m piper.download_voices --data-dir {voices} {name}"
        )
    scales = {key: _number(settings, key) for key in _SCALES}
    options = SynthesisConfig(
        speaker_id=speaker,
        length_scale=scales["length_scale"],
        noise_scale=scales["noise_scale"],
        noise_w_scale=scales["noise_w_scale"],
        volume=scales["volume"] or 1.0,
    )
    return PiperEngine(PiperVoice.load(model), options, f"the Piper voice {name}")
