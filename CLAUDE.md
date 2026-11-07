# CLAUDE.md

Guidance for Claude Code in this repository: a buildable source for **Dare Devil Denis** (Visions,
1984; Simon Pick) for the BBC Micro, made from Level7's annotated disassembly, as the base for a
four-player sequel, **Dare Devil Denis 2** (`sequel/`), each player on one of the original's strips,
scrolled in software at 50 Hz (decision 9). `PLAN.md` is what is left to do, `docs/done.md` what has
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
| `lib/` | the kit's shared includes: `irq.6502`, `keydown.6502`, `beeb.h.6502`, `sfx50.6502` (the sequel's); loader, ZX02 unused |

`spikes/swscroll/` is the software-scroll spike (its own `build.ps1`, after the main build).
`examples/` and `docs/vertical-scroll.md` are the kit template's, not the sequel's.

## The sequel (`sequel/`)

Design: `docs/sequel.md`; what landed, with its numbers: `docs/done.md`. Build after the main build
(the sprites, tables and tune come out of `build/ddd.ssd` and `src/`):

```powershell
.\sequel\build.ps1          # make_data.py, make_sound.py, Baron -> sequel/build/ddd2.ssd
.\sequel\build.ps1 -Run     # and b2
```

`!BOOT` is *EXEC (option 3): `MODE2`, then `*RUN DDD2` (loads at &1900; `reloc` copies it down).
Title: a player joins with its accelerate key; A-F starts. Keys (decision 25): Z X | V B | M , | . /
(accelerate, jump). The published WIP: memory `ddd2-wip-published`.

| `sequel/src/` | Holds |
|---|---|
| `main.6502` | the loop, the strip update (scroll, jump, collide, crash, respawn), drawing, `reloc` |
| `enemies.6502` | the enemies in course coordinates, two level slots a strip, erase/draw with spans |
| `specials.6502` | the spider, the helicopter, the gold |
| `status.6502` | wages, the status line, `set_look` (a player's colours) |
| `flow.6502`, `flow8.6502`, `flow1.6502` | the title, joining, skill, the game's end |
| `screen.6502` | `screen_init`: rows 3-30 cleared, the CRTC set |
| `sound.6502`, `sound_main.6502` | the sfx50 driver's caller, the engine, the title tune |

**Where things live** (read the addresses off `sequel/build/ddd2.symbols.json`; the free space is
in `docs/done.md`'s latest entry):
- Main RAM: the tall sprites first at &0E00 (a page start: no ALIGN gaps), then the code, below &3000.
- Low RAM: &0400-&07FF and &0900-&0CFF tables and sprites (`make_data.py`'s `low.6502`, copied by
  `reloc`); page &0D: `RTI` at &0D00 (decision 32), then small tables.
- Page 8, the stack page below &01C0, and page 3 from &0360: code and tables, copied by `start`
  after `install_irq` (which flushes the MOS's buffers in page 8).
- The screen shows rows 3-30 only (decisions 31, 37, 41, 42; R6 28, R7 31, start &3780). Rows 0-2
  (&3000-&377F) hold code, copied once by `reloc`; row 31 (&7D80) holds the enemies', the status
  line's and the looks' state, set at each game's start.
- Zero page: &00-&1F, &50-&8D, &90-&B0 (`main.6502`'s names).

**Traps:**
- **Never VDU 22** (or any MODE change) after start: it clears rows 0-2 and 31. `screen_init`
  clears rows 3-30 itself.
- **The timing** (decision 12): strip k is updated once System VIA T1 has fired k + 1 times after
  VSync, at most two bands late, or it waits a field (a dropped field, never a tear); strip 3 may
  also start in the next field before line 120. `BUGS.md` #1: fields dropped in four-way lockstep.
- **sfx50 effects must lie at &1000 or above** (its header says why).
- **B is player 2's jump and skill B** on the title.
- **jsbeeb draws the picture 8 lines lower** with the shortened display; every row is on its MODE 2
  scanline after VSync (measured). A real TV syncs to VSync: check in b2 and on hardware.

**Oracles** (headless jsbeeb, after the build; `node tools/X.mjs`; exit 0 = pass):
- `verify_strips.mjs`: drives the title, plays four scripted riders against a model of the game
  re-made from the original (course, sprites, rules, decisions); every strip and the status line
  every field, every crash, sound request and the game's end must agree; no write in a strip's
  window. `--scenario level` (the cost's worst case), `--skill A-F --players 1010`, `--plant`,
  `--early`, `--no-holes` (each must fail), `--video OUT.mp4`. In the harness, reads at &3000 and
  above name the bank (`"main"`), and `onExec` only works after `boot`.
- `verify_sound.mjs`: the title's tune against DENIS2's notes through the MOS's measured periods;
  the game's effect and engine requests. `--plant` must fail.
- `measure_crash.mjs`, `measure_palette.mjs`: the original's crash timing, its rotating colour.

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
