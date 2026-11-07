# Dare Devil Denis - buildable source

**Dare Devil Denis** (Visions Software, 1984), written by Simon Pick for the BBC Micro, rebuilt
from Level7's commented disassembly so that it assembles with
[Baron](https://github.com/waitingforvsync/baron) into a disc byte-identical, file for file, to the
Stairway to Hell release. It is the starting point for a multiplayer sequel.

The disassembly is Level7's (`reference/`); the game is Visions' and Simon Pick's. Nothing here
claims otherwise.

## Build

Needs Baron 0.6.0 (or 0.5.2+) and Python 3.

```powershell
.\build.ps1        # Windows: build/ddd.ssd, compared with reference/sth/DareDevilDenis.ssd
```
```sh
make compare       # anywhere else (BARON=..., PYTHON=...)
```

Boot `build/ddd.ssd` on a Model B with DFS (SHIFT+BREAK).

## Layout

- `src/main.6502` - the disc, one SECTION per file
- `src/game.6502` - the game (DENIS3, &0E00-&348F)
- `src/denis2.6502` - the tune player and loading screen
- `tools/check_disasm.py` - proves the disassembly matches the disc
- `tools/disasm2baron.py` - the one-shot converter that made the sources
- `tools/compare.py` - checks a build against the reference

Method: [beeb-port-kit](https://github.com/kieranhj/beeb-port-kit).
