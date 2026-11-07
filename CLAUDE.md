# CLAUDE.md

Guidance for Claude Code in this repository: a buildable source for **Dare Devil Denis** (Visions,
1984; Simon Pick) for the BBC Micro, made from Level7's annotated disassembly, as the base for a
multiplayer sequel with a vertical rupture. `PLAN.md` is what is left to do, `docs/done.md` what has
landed, `docs/decisions.md` every agreed decision, `BUGS.md` the bug log. The method is
beeb-port-kit's (`C:\Users\khcon\OneDrive\BEEB\Repos\beeb-port-kit`, `PORTING.md`, section 2.1c is
this kind of job; Stryker's Run at `..\strykers` is the worked example); its skills are in
`.claude/skills/`. Budget: keep this file under 150 lines.

## The rules

- **The original is the specification.** Step 1 rebuilt the game byte for byte; the sequel changes
  what it plays like only by numbered decision.
- **Deviations are agreed before they are built and written down after**, in `docs/decisions.md`.
- **No hardware abstraction layer. One layer at a time, visible in the emulator before the next.**
- **Measure, do not recall.** Every timing number says what it was measured on and when.
- **Verify against the reference, not the screenshot.** `tools/compare.py` for bytes; RAM dumps at
  equal game state for behaviour.

## Target

| | |
|---|---|
| Machine | BBC Model B, DFS (the original's). The sequel: Model B too, strips scrolled in software at 50 Hz, writes timed to the raster (decisions 9, 11, 12; `docs/spike-swscroll.md`) |
| Reference | Stairway to Hell disc, `reference/sth/DareDevilDenis.ssd` (decision 1; gitignored - not ours to publish; `compare.py` skips when it is absent) |
| Specification | `reference/dare-devil-denis-disassembly.txt` (Level7; of the TAPE release - `tools/check_disasm.py`) |
| Disc | `!BOOT` (*EXEC) -> `LOAD` (STH banner, PAGE=&1900) -> `DENIS` (envelopes, VDU 23,250) -> `DENIS2` (BASIC at &4000: loading screen, v-sync tune, `*L.DENIS3 1100`, copy down, `CALL &3475`) -> `DENIS3` (the game, &0E00-&348F) |

## Build

```powershell
.\build.ps1             # build/ddd.ssd, then tools/compare.py against the reference
.\build.ps1 -NoCompare
.\build.ps1 -Run        # and b2
```

`make` / `make compare` is the same build for POSIX and makes the same image. Baron 0.6.0
(`bin\baron.exe`, gitignored; decision 2). One assembly, `src/main.6502`: each disc file is a
`SECTION`, written in the order the reference disc holds them, so Baron lays them out in the same
sectors. `build/ddd.lst` is the listing, `build/ddd.symbols.json` the symbol dump - take addresses
from there (`python tools/listing.py symbols build/ddd.symbols.json NAME`).

## Source (`src/`)

| File | Holds |
|---|---|
| `main.6502` | the disc: one SECTION per file; the BASIC files (`DENIS2`'s header, `DENIS`, `LOAD`, `!BOOT`) as `BASIC ... ENDBASIC` |
| `game.6502` | DENIS3, the game, &0E00-&348F; entry_point &3475 |
| `denis2.6502` | DENIS2 from &40E9: v-sync event tune player, loading screen data (&46E6), unused leftovers |
| `zp.6502` | zero page names (one address, many names: each routine's own) and workspace (&0Cxx, the screen) |
| `os.6502` | MOS entry points |
| `lib/` | the kit's shared includes (IRQ owner, keyboard, loader, ZX02), not yet used |

The sequel's design is `docs/sequel.md`; its source is `sequel/` (`sequel/build.ps1` after the
main build -> `sequel/build/ddd2.ssd`, `-Run` boots it in b2; `node tools/verify_strips.mjs` is its
oracle: four scripted riders, a model of the game re-made from the original, every strip every
field 0 bytes wrong, every crash agreed, 0 writes in a strip's window; `--scenario level` is the
cost's worst case; `--plant`, `--early`, `--no-holes` show it failing; `--video` records a clip).
`tools/measure_crash.mjs` times the original's crash; `tools/verify_sound.mjs` checks the
title's tune and the game's sound requests; `sequel/make_sound.py` builds the sound data.
`spikes/swscroll/` is the software-scroll spike (its own
`build.ps1`, after the main build: it takes the sprites from `build/ddd.ssd`).

The original measured in headless jsbeeb (after the build; `node tools/X.mjs`): `tools/ddd.mjs`
boots it into a game; `capture_course.mjs` captures every level and `make_course.py` turns that
into `data/course.json` and checks it (0 bytes wrong); `record_original.mjs` plays it with a
planner rider into `data/original_play.json` and a video in `build/`.

`game.6502`, `denis2.6502` and `zp.6502` were made once by `tools/disasm2baron.py` and are
hand-maintained now (it refuses to overwrite them without `--force`). Lines starting `\ ` carry
the disassembly's annotations. Every byte is the original's: an absolute-mode instruction on a
zero-page operand is `EQUB op : EQUW addr` so Baron cannot shrink it.

## The original, briefly (from the disassembly)

- MODE 2 play area, four ground rows; MOS calls throughout (OSWRCH for text, OSBYTE &81 for keys
  and the start screen's `INKEY(2)`, OSWORD 7 for sound, OSBYTE &13 for v-sync). It does not own
  IRQ1V; DENIS2's tune runs on the v-sync event (EVNTV = &4150).
- Keys: SPACE jump, SHIFT accelerate, RETURN stop. Skill A-F picks the starting level
  (`starting_levels_table`, &0EF0). Workspace at &0C00-&0C5F.
- Pokes from the disassembly: `&1B51=&60` infinite takes; `&1550=&4C,&1551=&08,&1552=&15`
  invulnerability.

## Verifying in jsbeeb

Boot `build/ddd.ssd` (model B-DFS1.2). The loading screen waits `INKEY(3000)` - press SPACE. Title:
SPACE. Skill: hold A for ~25 frames (a 10-frame press was missed once: the start screen polls
`INKEY(2)` between scrolltext steps). Then SHIFT to ride.
