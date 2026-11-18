"""Qwen3-TTS (https://github.com/QwenLM/Qwen3-TTS) on an NVIDIA GPU, run by faster-qwen3-tts
(https://github.com/andimarafioti/faster-qwen3-tts), which streams each sentence in pieces of 4
codec frames (a third of a second), so that a sentence sounds well before it is all made.

Settings:

- `voice`: one of the speakers of Qwen3-TTS-12Hz-1.7B-CustomVoice, the stock model, downloaded
  into the Hugging Face cache; or the name of a voice in the voices folder, a folder holding a
  CustomVoice model of its own, such as a voice trained in the studio.
- `speaker`: which speaker of a voice in the voices folder speaks. It may be left out when the
  voice has one speaker, or one named after its folder.
- `language`: the language spoken, `spanish` unless set.
"""

from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol, cast

from feris_voice import Audio, VoiceError

MODEL = "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice"
"""The stock model on Hugging Face, whose speakers are the stock voices."""

SPEAKERS = (
    "aiden",
    "dylan",
    "eric",
    "ono_anna",
    "ryan",
    "serena",
    "sohee",
    "uncle_fu",
    "vivian",
)
"""The stock model's speakers, known before it is downloaded."""

CHUNK = 4
"""Codec frames per streamed piece: at 12 frames a second, a third of a second of sound."""

MINIMUM = "an NVIDIA RTX 30 series or newer with 8 GB of VRAM"
"""The least GPU the voice runs on, an estimate: it is tested on an RTX 5090."""

_COMPUTE = (8, 0)
"""The CUDA compute capability of the RTX 30 series' generation, Ampere."""

_MEMORY = 7 * 2**30
"""The least memory a GPU of 8 GB reports, with room for what the driver keeps."""

_FILES = ("config.json", "model.safetensors", "speech_tokenizer/config.json")
"""The files a Qwen voice cannot be loaded without."""

_WARM_UP = "Hola."
"""What the engine says to itself once loaded, so that the first sentence of a class is fast."""


class _Model(Protocol):
    """What the engine uses of faster-qwen3-tts's model, which carries no types."""

    def warmup(self) -> None: ...

    def generate_custom_voice_streaming(
        self, *, text: str, speaker: str, language: str, chunk_size: int
    ) -> Iterator[tuple[object, int, object]]: ...


class _Wrapped(Protocol):
    """qwen-tts's model inside faster-qwen3-tts's, which knows its speakers and languages."""

    def get_supported_speakers(self) -> list[str] | None: ...

    def get_supported_languages(self) -> list[str] | None: ...


class _Device(Protocol):
    """What the engine reads of a GPU's properties."""

    name: str
    major: int
    minor: int
    total_memory: int


@dataclass(frozen=True, slots=True)
class QwenEngine:
    model: _Model
    speaker: str
    language: str
    voice: str

    def synthesise(self, sentence: str) -> Iterator[Audio]:
        import numpy as np

        for samples, rate, _timing in self.model.generate_custom_voice_streaming(
            text=sentence, speaker=self.speaker, language=self.language, chunk_size=CHUNK
        ):
            floats = np.clip(np.asarray(samples, dtype=np.float32), -1.0, 1.0)
            yield Audio((floats * 32767).astype("<i2").tobytes(), rate)


def _text(settings: dict[str, object], key: str) -> str | None:
    value = settings.get(key)
    if value is None:
        return None
    if not isinstance(value, str) or value == "":
        raise VoiceError(f'{key} in [engine] must be a name, as {key} = "<name>".')
    return value


def _stock_model() -> tuple[Path | None, str | None]:
    """The stock model's folder in the Hugging Face cache, or what to do to download it."""
    from huggingface_hub import try_to_load_from_cache

    found = [try_to_load_from_cache(MODEL, name) for name in _FILES]
    if all(isinstance(path, str) for path in found):
        return Path(str(found[0])).parent, None
    return None, (
        f"the Qwen model {MODEL} is not downloaded. Download it (about 4.5 GB), from the "
        + f"repo's folder, with:\n    uv run --project voice hf download {MODEL}"
    )


def _gpu() -> str | None:
    """What is wrong with the GPU for the voice, or None when it will do."""
    import torch

    if not torch.cuda.is_available():
        return (
            f"there is no NVIDIA GPU that CUDA can use. The Qwen voice needs {MINIMUM}, and "
            + "an NVIDIA driver 580 or later: check with nvidia-smi that the driver sees the GPU."
        )
    # torch gives the properties no type: _Device says what the engine reads of them.
    properties = cast("_Device", torch.cuda.get_device_properties(0))  # pyright: ignore[reportUnknownMemberType]
    capability = (properties.major, properties.minor)
    if capability < _COMPUTE or properties.total_memory < _MEMORY:
        return (
            f"the GPU {properties.name}, with {properties.total_memory / 2**30:.0f} GB, is too "
            + f"small for the Qwen voice, which needs {MINIMUM}."
        )
    return None


def _speaker(wrapped: _Wrapped, voice: str, chosen: str | None) -> str:
    speakers = sorted(wrapped.get_supported_speakers() or [])
    if chosen is not None:
        if chosen.lower() not in speakers:
            raise VoiceError(
                f'the Qwen voice "{voice}" has no speaker "{chosen}". Its speakers are: '
                + f"{', '.join(speakers)}."
            )
        return chosen.lower()
    if voice.lower() in speakers:
        return voice.lower()
    if len(speakers) == 1:
        return speakers[0]
    raise VoiceError(
        f'the Qwen voice "{voice}" has several speakers: {", ".join(speakers)}. Choose one in '
        + '[engine], as speaker = "<speaker>".'
    )


def load(settings: dict[str, object], voices: Path) -> QwenEngine:
    unknown = set(settings) - {"voice", "speaker", "language"}
    if unknown:
        raise VoiceError(
            f"[engine] has settings the Qwen engine does not know: {', '.join(sorted(unknown))}."
        )
    voice = _text(settings, "voice")
    if voice is None:
        raise VoiceError('[engine] must name a Qwen voice, as voice = "serena".')
    chosen = _text(settings, "speaker")
    language = (_text(settings, "language") or "spanish").lower()

    problems: list[str] = []
    folder: Path | None = voices / voice
    if folder.is_dir():
        missing = [name for name in _FILES if not (folder / name).is_file()]
        if missing:
            problems.append(
                f'the Qwen voice "{voice}" in {voices} is not whole: it lacks '
                + f"{', '.join(missing)}. Download or train it again."
            )
    elif voice.lower() in SPEAKERS:
        folder, missing_model = _stock_model()
        if missing_model is not None:
            problems.append(missing_model)
    else:
        raise VoiceError(
            f'there is no Qwen voice "{voice}": it is not one of CustomVoice\'s speakers '
            + f"({', '.join(SPEAKERS)}), nor a voice in {voices}."
        )
    gpu = _gpu()
    if gpu is not None:
        problems.append(gpu)
    if problems or folder is None:
        raise VoiceError(
            "the Qwen voice cannot start:\n" + "\n".join(f"  - {problem}" for problem in problems)
        )

    # faster-qwen3-tts is imported only now: importing it is slow and noisy.
    # The library ships no types: _Model says what the engine uses of it.
    from faster_qwen3_tts import FasterQwen3TTS  # pyright: ignore[reportMissingTypeStubs]

    loaded = cast("object", FasterQwen3TTS.from_pretrained(str(folder)))
    model = cast("_Model", loaded)
    wrapped = cast("_Wrapped", getattr(loaded, "model"))  # noqa: B009
    speaker = _speaker(wrapped, voice, chosen)
    languages = sorted(wrapped.get_supported_languages() or [])
    if language not in languages:
        raise VoiceError(
            f'the Qwen voice "{voice}" does not speak "{language}". Its languages are: '
            + f"{', '.join(languages)}."
        )
    model.warmup()
    named = f"the Qwen voice {voice}"
    engine = QwenEngine(
        model, speaker, language, named if speaker == voice.lower() else f"{named} ({speaker})"
    )
    for _ in engine.synthesise(_WARM_UP):
        pass
    return engine
