"""The speech engines. Each folder here is one engine, named after the folder, and holds an
`engine.py` with a `load(settings, voices)` function that returns an engine with its voice
loaded: an object with a `voice` text and a `synthesise(sentence)` method returning
`feris_voice.Audio`. The voice service finds an engine by the name the configuration gives, so
adding one needs no other change.
"""
