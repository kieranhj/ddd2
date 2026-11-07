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

## Dare Devil Denis 2 (`sequel/`)

A four-player sequel for the BBC Model B: each player rides one of the original's four strips as
an endless runner over the original's 35 levels laid end to end, scrolled in software at 50 Hz.
Built so far: riding, jumping, crashing and takes, the enemies, the spider, the helicopter and its
gold, wages and the status line, the title, game mode 1 (the most wages wins), and sound (the
original's effects and its loading-screen tune). Next: game modes 2 and 3 (`PLAN.md`).

```powershell
.\build.ps1 -NoCompare      # the original first: the sequel takes its sprites and tables from it
.\sequel\build.ps1         # sequel/build/ddd2.ssd (needs beeb-port-kit beside this repo)
```

Boot `sequel/build/ddd2.ssd` on a Model B (SHIFT+BREAK). On the title each player joins with its
accelerate key, then A-F picks the skill (the starting level) and starts. Keys, accelerate then
jump: player 1 Z X, player 2 V B, player 3 M comma, player 4 full stop slash.

The latest work-in-progress disc, in the browser:
https://bbc.xania.org/?disc=https://bitshifters.github.io/content/wip/ddd2-wip.ssd&autoboot&model=B

`PLAN.md` is what is left, `docs/done.md` what landed, `docs/decisions.md` every decision.

Method: [beeb-port-kit](https://github.com/kieranhj/beeb-port-kit).
