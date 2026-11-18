# Feris-Teach is built for its owner alone, on Linux

Feris-Teach is built for one person, its owner, on their own Linux machine with an NVIDIA GPU. The repo is public on GitHub, but nothing in it is made for anyone else: it supports one system, speaks to one reader, and its voice runs on the owner's GPU. Whoever else runs it does so on their own.

## Considered Options

- **An open-source product for anyone who clones it**, on Linux and Windows, with a voice that runs on any CPU: rejected. It spent effort on machines the owner does not use (a Windows checks job, Windows code paths) and held the voice back to what a CPU can do.

## Consequences

- Linux is the only system: the checks run only on Linux, and code may use what Linux offers.
- The voice may need a GPU; the README states the minimum, and below it there is no voice.
- The docs speak to the owner and the agents that build Feris-Teach for them, never to visitors or contributors.
