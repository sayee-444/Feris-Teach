"""The voice service of Feris-Teach: it speaks the teacher's spoken version aloud.

Its whole public interface is this file (ADR-0003). The toolbelt runs it as a separate process,
`feris-voice serve`, and talks with it over HTTP on 127.0.0.1. The speech engines in `engines/`
match `Engine` in `_audio.py` by shape; they build their sound with `Audio` and report problems
with `VoiceError`.
"""

from feris_voice._audio import Audio
from feris_voice._cli import main
from feris_voice._config import VoiceError

__all__ = ["Audio", "VoiceError", "main"]
