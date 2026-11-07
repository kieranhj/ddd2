# Done

What has landed, with the number that says it landed. `PLAN.md` is what is left. Newest first.

---

## Layer 4.2: four strips, eight keys, 50 Hz, no tearing (2026-11-07)

`sequel/build/ddd2.ssd`: four riders, each on two keys (decision 25, proposed), moving with the
original's velocity rules (decision 16) and slowing when let go (decision 24, proposed), each in
its own colours (decision 17). The program copies itself from &1900 to &0E00 after loading and
runs &0E00-&22BA (5,307 bytes); IRQ1V is the kit's `irq.6502`, the keys the kit's
`keydown.6502`. Strip k is updated once System VIA T1, started at VSync, has fired k+1 times: as
the raster leaves its band (decision 12).

**MEASURED** in jsbeeb (`B-DFS1.2`):
- **The keys** (the jsbeeb MCP, host keys pressed by name, OSBYTE 121 scanning from 16; the scan
  proven first on Z, 97): Z 97, X 66, V 99, B 100, M 101, comma 102, full stop 103, slash 104 -
  matrix columns 1-8. jsbeeb was not shown to model phantom keys, so the ghosting claim rests on the
  one-key-a-column layout; a real keyboard should confirm it.
- **`tools/verify_strips.mjs`**, two whole-course rides, every field: each strip's three rows
  against a redraw from `data/course.json` and the original's sprites (the riders' colour swap
  redone in the tool); every screen write against the CRTC's row counter; loop passes against
  fields.

| Ride | Fields | Passes | Bytes wrong | Writes in a strip's band | Nearest write to its band |
|---|---|---|---|---|---|
| all four held together | 11,009 | 11,009 | 0 | 0 | 30 character rows ahead |
| mixed: started late, let go, held again | 14,855 | 14,855 | 0 | 0 | 30 |

  Shown able to fail: a byte planted in strip 2 gave 357 bytes wrong; T1's first fire moved a
  band (24 lines) earlier gave 63,123 writes in a band in 600 fields, the first at field 23 with the
  raster on row 8. (Starting each field one band early instead did not tear in 3,000 fields: a
  strip's work over the sparse first levels ends before the 32 lines above its band run out.)
- **The cost**, all four held together (the worst case: the densest stretches on all four strips
  at once), cycles: one strip's update median 1,104, 99th percentile 3,691, worst 5,269 (strip 3:
  5,412); the eight keys 692-693; the whole field's work median 5,108, 99th percentile 15,600,
  **worst 21,912 - 55% of the 40,000-cycle field**. Mixed: field worst 14,257.
- **Room:** &22BB-&2FFF (3,397 bytes) is free below the screen; &0400-&0DFF is not yet claimed.

**Not yet:** a second opinion in b2 (`sequeluild.ps1 -Run` boots it) and on real hardware - the
tearing claim is jsbeeb's CRTC counters.

## Layer 4.1: one strip on the real course (2026-11-07)

`sequel/` (its own `build.ps1`, after the main build) builds `sequel/build/ddd2.ssd`, 4,400 bytes of
code and data at &1900-&2A2F. The original's MODE 2 screen. Four strips are drawn; strip 0's rider
is driven by SHIFT with the original's velocity rules at 50 Hz (decision 16: pos += vel / 256 and
vel += 1 a field, cap 250); strips 1-3 stand still (decision 14). The riders are at column 12
(decision 23, proposed). Not yet: jumps, collisions, enemies, level types (the land rider and
green ground throughout; the obstacles are the right level type's), the VIA keys, raster timing.

How a strip scrolls (vel < 256, so 0 or 1 column a field): per object on the screen, an obstacle
is moved by a routine generated per sprite (`make_data.py`) that writes only the bytes that
differ from the obstacle one column to the right - 440 bytes over the 9 obstacle sprites, against
9 x 80 for a full draw and clear. Edges use a clipped column draw. A hole opens one column and
closes one. The rider is redrawn whole after any write in its four columns.

**MEASURED** (`tools/verify_strip.mjs`, headless jsbeeb 2.10.2, `B-DFS1.2`; SHIFT held from the
boot to the finish):
- **The picture:** strip 0's three character rows compared every field with a redraw from
  `data/course.json` and the original's sprites read from `build/ddd.ssd`; strips 1-3 compared
  with their first field. **11,050 fields, 0 bytes wrong**; the rider stopped at course column
  10,640, the end of level 35. Shown able to fail: one byte planted in strip 0 and one in strip 2
  at field 500 gave 1,023 bytes wrong over the next 1,000 fields, exit 1.
- **The cost, strip 0's own update** (MOS interrupts landing in it included), over the 10,628
  fields it moved: median 1,141 cycles, 99th percentile 3,682, worst 5,243 (6 objects on the
  screen, course column 9,892). By objects on the screen, mean / worst: 0: 230 / 351; 1: 846 /
  1,945; 2: 1,233 / 3,241; 3: 1,713 / 3,922; 4: 2,342 / 4,289; 5: 2,803 / 4,775; 6: 3,483 / 5,243;
  7: 4,010 / 4,888. A field that does not move costs at most 503 for all four strips and the key read.
- **Four strips, estimated from that:** typically about 4,600 cycles; about 21,000 if all four
  riders are at the densest place at once (they can be: one course). The spike was 22,000-23,500
  every field.
- **The steps to it:** a full draw and clear of every obstacle, worst field 7,981; shift routines
  except beside the rider, 6,211; shift routines everywhere with the rider redrawn over them, 5,669
  (all four strips' fields).
- **Room:** &2A30-&2FFF, 1,488 bytes, is all that is left below the screen.

## Step 3: the course, captured from the original (2026-11-07)

**MEASURED** (`tools/capture_course.mjs` on headless jsbeeb 2.10.2, `B-DFS1.2`, `build/ddd.ssd`;
`tools/make_course.py`). Skill A. For each level: a picture the first time the game sets it up,
then a crash (`is_collision`, take held at 1) and a picture of the retake. Then the rider is put at
the end of the last ground and the game's own end-of-level code moves on. Level order 1-35, then
33 again (the same course as the first time); 71 pictures, every `plot_sprite` call logged.
- **Oracle:** every picture redrawn from the course alone (ground colour from
  `ground_colours_table`, sprites from DENIS3), compared with the captured screen over character
  rows 3-31: **0 bytes wrong in 71**. Shown able to fail: one obstacle dropped and one hole moved
  4 columns gave 46 and 32 bytes wrong, exit 1.
- **The course** (`data/course.json`): 35 levels, 140 grounds, 144 obstacles, 106 holes (widths 8 x
  90, 12 x 13, 16 x 2, 20 x 1), the enemies' starting places; 10,640 columns at 76 a ground.
- **Found:** level 36 is never played; the second ground never has an obstacle; the holes start
  from a different offset on a retake in 20 of 35 levels; the end-of-level path leaves an obstacle
  at column 8 that `new_take` clears. Details in `docs/sequel.md`.

## Step 2: the original played, recorded (2026-11-07)

**MEASURED** (`tools/record_original.mjs`, headless jsbeeb 2.10.2, `B-DFS1.2`, skill A, the takes
held with the disassembly's `&1B51=&60`; 6,000 fields). `data/original_play.json` has the state at
each of 1,297 passes of `main_game_loop`; `build/original_play.mp4` and `.wav` are the picture and
sound (not committed; the tool makes them again exactly).
- **The rider** is a planner: SHIFT held, and SPACE or RETURN when a 48-pass simulation of the
  original's rules, against the screen and the moving enemies, says so.
- **It reached level 7:** levels 1-4 without a crash, then 7 crashes, at fields 2133 (level 5),
  3439 (6), 3896 (7), then 4353, 4810, 5267, 5724, all on the same jump on level 7. Its first
  jump on that level lands at column 43, just before the hole at 44. Then it has to jump at once,
  and rises into the policeman at 60. A planner that also scored a second jump, and one with a
  90-pass horizon, were tried and stopped on level 4.
- **What it showed that the docs had wrong:** velocity rises 3 a pass, not 2, and in the air too.

## Step 2: the original's update rate (2026-11-07)

**MEASURED** (jsbeeb MCP, `B-DFS1.2`, `build/ddd.ssd`, skill A, level 1): cycles between passes of
`main_game_loop` (`&1508`).
- **At rest:** 114,904 (the first sample), 119,992 and 120,064.
- **With SHIFT held:** 119,996 and 120,004, while velocity (`&0C13`) rose from 60 to 66.

So one pass every 3 fields, 16.7 Hz, whatever the speed. Top speed 2.93 columns a pass = 48.8
columns a second = 0.98 columns per field. Velocity rises 3 a pass (corrected: this said 2, and 7.5 s;
the recording below shows 0, 3, 6 ..., and the code has three `INC`s), so it takes 84 passes, 5.0 s,
to reach the cap.

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
