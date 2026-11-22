# ddd2: start here

**Dare Devil Denis** (Visions, 1984, BBC Micro) rebuilt byte for byte from Level7's commented disassembly with the Baron assembler, plus `sequel/`: a four-player sequel built on it. 6502; a game port/rebuild and a new game.

| | |
|---|---|
| GitHub | https://github.com/kieranhj/ddd2 (public) |
| Upstream | Original game by Simon Pick / Visions; disassembly by Level7 (`reference/`) |
| Local path | D:\beeb\mine\ddd2 (moved from OneDrive\BEEB\Projects\ddd2 on 2026-11-22) |
| Branch | playtest3-2026-11-15 (checked out, 15 commits ahead of master, includes play-test-fixes, playtest2, brake, ram-hunt-2026-11-12); others: master, brake-2026-11-12, docs-pass-2026-11-07, layer-4.4b-enemies, layer-4.5c, play-test-fixes, playtest2-2026-11-14, ram-hunt-2026-11-07, ram-hunt-2026-11-12, stash/ram-hunt-2026-11-12 |
| Last commit | 2026-11-15: Third play test: the clock, the brake always, respawn past enemies, marker pay, skill A, the title (decisions 54-59) |

## What's in here
- `src/` - the original game: `main.6502` (the disc), `game.6502`, `denis2.6502` (tune + loading screen), `os.6502`, `zp.6502`.
- `sequel/` - the four-player sequel: `src/`, `build.ps1`, `make_data.py`, `make_sound.py` -> `sequel/build/ddd2.ssd`.
- `reference/` - Level7's disassembly and the Stairway to Hell disc the build is compared against.
- `data/` - course, sound captures; `tools/` - compare.py, check_disasm.py, disasm2baron.py, verifiers.
- `docs/` - `sequel.md` (design), `decisions.md` (1-59), `done.md`, scroll spikes; `spikes/`, `examples/`.
- `bin/` (gitignored) - baron.exe, zx02.exe; `local.ps1` (gitignored) - this machine's tool paths.

## Build and run
- `make`: builds the original (`build.ps1`: `build\ddd.ssd`, compared with the reference, "ALL IDENTICAL") then the sequel (`sequel\build.ps1` -> `sequel\build\ddd2.ssd`). Tested 2026-11-22, works. Other targets: `make build`, `make nocompare`, `make sequel`, `make help`.
- How: `GNUmakefile` (added 2026-11-22) is read by GNU make before the POSIX `Makefile`; on Windows it calls the PowerShell scripts, elsewhere it includes `Makefile` unchanged. The POSIX `Makefile` alone cannot run here (needs `sh`).
- Tools: Baron 0.6.0 (`local.ps1` points at `D:\beeb\mine\beeb-port-kit\template\bin\baron.exe`), Python 3; the sequel's sound needs `D:\beeb\mine\beeb-port-kit\py` (found as `..\beeb-port-kit`, or `$env:BEEB_PORT_KIT`).
- Run: SHIFT+BREAK on a Model B with DFS; `.\sequel\build.ps1 -Run` boots the sequel in b2 (`local.ps1` B2 = `D:\tools\beeb\b2\b2\b2.exe`).

## Local changes
- 2026-11-22 tidy fixes (uncommitted): `sequel/make_sound.py` looked for the kit at `..\..\Repos\beeb-port-kit` (the old OneDrive layout), now `..\beeb-port-kit`; `local.ps1` B2 path updated (gitignored).
- `stash/ram-hunt-2026-11-12` (local and pushed) is the same commit as `stash@{0}`: WIP on ram-hunt-2026-11-12 touching `sequel/src/main.6502`, `src/lib/irq.6502`, `src/lib/keydown.6502` (6 files).
- Most feature branches are already contained in playtest3-2026-11-15; playtest3 is not yet merged to master.

## Status and next steps
- PLAN.md: the owner's play test of the WIP; decisions 17, 23-25, 33-35, 46 waiting for a yes.
- BUGS.md #1 open: fields dropped when all four riders hit a heavy moment together.
- Still to check off jsbeeb: BREAK with `*FX200,2`, b2 and real hardware (tearing, keys, sound).
- Step 7 next: game modes, the endless part, RAM (PLAN.md).

## See also
- README.md, PLAN.md, BUGS.md, CLAUDE.md, docs/.
- D:\beeb\mine\beeb-port-kit (the kit), sibling ports D:\beeb\mine\isometrikum, D:\beeb\mine\cpc-roto.
