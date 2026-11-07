# Done

What has landed, with the number that says it landed. `PLAN.md` is what is left. Newest first.

---

## Step 2: the original's update rate (2026-11-07)

**MEASURED** (jsbeeb MCP, `B-DFS1.2`, `build/ddd.ssd`, skill A, level 1): cycles between passes of
`main_game_loop` (`&1508`).
- **At rest:** 114,904 (the first sample), 119,992 and 120,064.
- **With SHIFT held:** 119,996 and 120,004, while velocity (`&0C13`) rose from 60 to 66.

So one pass every 3 fields, 16.7 Hz, whatever the speed. Top speed 2.93 columns a pass = 48.8
columns a second = 0.98 columns per field. Velocity rises 2 a pass, so it takes 7.5 s to reach the
cap.

**The jump** (same session): SPACE held for one pass. `player_jump_state` (`&0C12`) read at
`main_game_loop` after each pass: 2 after the first, 28 after the 27th, 29, then 0. That is 28
passes in the air, from elapsed cycle 44,903,552 to 48,263,606: 3,360,054 cycles = 84.0 fields.

**The spike at that speed** (all four at 0.98 columns a field): 21,987-23,510 cycles a field, against
25,158-27,328 at 2.93. The distance moved hardly matters; the per-object redraw does.

---

## The sequel's brief, and the software-scroll spike (2026-11-07)

The owner's brief: a four-player endless runner, one strip of the original each, with the course
made of the original's levels end to end. It is recorded as decisions 4-10, with the design in
`docs/sequel.md`. The rebuild was pushed to github.com/kieranhj/ddd2 with its tag.

**Spike** (MEASURED, jsbeeb `B-DFS1.2`, `spikes/swscroll/`, `docs/spike-swscroll.md`). Four MODE 2
strips scrolled in software at independent speeds on a Model B.
- **Rate:** 100 loop passes in 100 fields, both at mixed speeds and with all four at the
  original's top speed of 2.93 columns.
- **Cost:** 25,158-27,328 cycles a field at the worst case, before any optimisation.

---

## Step 1 - the original rebuilt byte for byte (2026-11-07)

**Specification proved** (MEASURED, `tools/check_disasm.py`). Level7's disassembly
(`reference/dare-devil-denis-disassembly.txt`, SHA256 `ae26b2c9...788d`) is of the tape release
(DDDenis1-3). Against the STH disc (`reference/sth/DareDevilDenis.ssd`, SHA256
`44634388...2a15`; files `DENIS3`, `DENIS2`, `DENIS`, `!BOOT`, `LOAD`):

| Tape section | Disc file | Result |
|---|---|---|
| DDDenis3 (&0E00, game) | DENIS3, 9,872 bytes | all 9,872 bytes identical (the disassembly's `&2edf    04 05 ...` line has extra spaces after the address; the first check regex missed it) |
| DDDenis2 (&4000) | DENIS2, 2,816 bytes | identical from &40E9; &4002-&40E8 differ - the disc release's own BASIC, which loads DENIS3 at &1100 and copies it to &0E00 instead of the tape's `*RUN`, and drops the tape's `*FX247-249` BREAK intercept |
| DDDenis1 (tape BASIC loader) | none | the disc's `DENIS` is a shorter program: envelopes, `VDU 23,250`, `PAGE=&4000`, `CHAIN"DENIS2"` |

**Converted** (`tools/disasm2baron.py`, forked from Stryker's Run's): 386 labels, 1,080 absolute and
297 zero-page operands symbolic, 45 immediates as `LO()`/`HI()`, 11 names defined inside
instructions, 42 zero-page names and 24 workspace constants (`src/zp.6502`). One correction: the
disassembly's last line (`&4aff ad LDA &....`) is cut off by the end of the file - one byte, `&AD`.
Two lines in unused copies of code are partial instructions and stay as `EQUB`.

**Rebuilt** (MEASURED, `tools/compare.py`, Baron 0.6.0): all five files identical in bytes, load
and exec address (all 18 bits) and start sector; title `DAREDEVILDEN`, boot option 3, 800 sectors.
Whole image: 82 bytes differ, none in a file - the catalogue's write-cycle byte (&11 vs 0) and 81
bytes of slack past file ends (&34B1-&34FF after DENIS, &370E-&370F after LOAD) (decision 3).
`build.ps1` and `make` produce the same image (`cmp`). Built image SHA256 `dea7f485...e63b`.

**Smoke test** (jsbeeb MCP, B-DFS1.2, 2026-11-07): boots through !BOOT, LOAD, DENIS, the Visions
loading screen (SPACE past `INKEY(3000)`), the title page, the skill screen ("Highest wages paid
today £0"); A starts the game: MODE 2, WAGES 000000, four ground rows, house, ambulance moving,
tree, spider.
