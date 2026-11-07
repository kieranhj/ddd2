# Done

What has landed, with the number that says it landed. `PLAN.md` is what is left. Newest first.

---

## Layer 4.4: level types and the enemies (2026-11-07)

**Level types (4.4a):**
- The ground is drawn in each level's colour: `ground_colours_table`, with the sea always blue
  (decision 30). It changes a column a scroll at a level's start.
- A hole's edges are redrawn in their own level's colour.
- The rider becomes that level type's (bike, boat, skis) as it reaches the level.
- Logical colour 8 steps through the original's cycle every 3 fields from the VSync interrupt.
  Measured on the original (`tools/measure_palette.mjs`): physical 0 4 5 1 6 3 7 7 7 3 6 1 5 4,
  a step every 3.0 fields.

**The enemies (4.4b, `sequel/src/enemies.6502`):**
- **What:** each level's horizontal enemy on its second ground, and its first five vertical
  enemies (`initialise_level`'s; `data/course.json`).
- **When:** stepping as the original's, from the field the level scrolls on (decision 28). A
  crashed strip's enemies stand still on its screen until respawn.
- **Slots:** two level slots a strip; the enemies of the level at the left edge and the next.
- **Erasing:** a moved enemy's vacated pixels are put back from the course (`restore_lines`).
- **Drawing:** an enemy is drawn whole if it moved or anything wrote over its columns this
  field (spans).
- **The rider's columns:** where the rider is drawn again, what is under it is put back, the
  enemies in its columns are drawn again, then the rider.
- **The spider, helicopter and gold** come in 4.5 (decision 29).

**RAM** (decisions 31, 32). The program ends at &2D02, **766 bytes free**.
- **Row 31:** off the display (R6 = 31), it holds the enemies' state (320 bytes).
- **Page &0D:** `RTI` at &0D00, then the small tables (216 bytes).
- **Page &0C:** four tall sprites.
- **Pages &09-&0B:** the enemy tables.
- **Zero page &90-&99:** `draw16`'s pointers.
- **The sprites come first in the program,** from &0E00, a page start, so no ALIGN gaps.
- **The crash's column and line tables** are cut to the 42 flying fields.
- **Measured unwritten in play** (`memwatch`): zero page &90-&CF, page &0D, and the stack below
  &01D8.

**Speed: what it took to fit.** First version, `play`: field median 10,153 cycles, worst 53,963,
1,368 writes in a window. Then, in order:
- **A compact list:** the enemies that exist, made once a field (the overhead was 3,300 cycles a
  field).
- **`restore_lines`:** a pointer per character row, not per line.
- **The rider's columns:** `compose_full`, a 40-line buffer per column, is gone (9,400 cycles a
  call).
- **`draw16`:** unrolled runs, entered by the sprite's line within its character row: 2,060 ->
  1,472 cycles a sprite.

**Two scheduling rules in the loop:**
- **A strip starts at most two bands after its own,** so at least 208 lines before the raster
  is back. A later start waits for the next field: a dropped field, never a write in the window.
  This is the cause of the 4.4 tears: a pass that started late let strip 0 run on past VSync
  into its own window, 9,092 cycles after its start.
- **Strip 3 may also start in the next field before its first band:** its window is at line
  240, 120 lines on. Without this, strips 0-2 had to finish within 192 lines of band 1 (21
  fields dropped in `play`).

**MEASURED** (`tools/verify_strips.mjs`, jsbeeb 2.10.2, `B-DFS1.2`). The oracle models the level
types (ground colours, riders, every palette write) and the enemies from the course and the
original's rules. It also catches up the enemies' clocks for the passes before it starts
watching.

| Scenario | Fields (= passes) | Bytes wrong | Crashes, all agreed | Writes in a window | Worst field |
|---|---|---|---|---|---|
| `play` | 3,922 | 0 | 14: 9 front, 1 top right (an enemy), 2 landed on, 2 holes | 0 (nearest 18 rows) | 34,615; strip worst 14,510 |
| `level` | 894 | 0 | all | 0 (nearest 13 rows) | 41,037: more than a field's 39,936, absorbed by strip 3's late start, none dropped |

- **Palette writes:** 1,314 in `play`, all in step.
- **Still able to fail:**
  - `--plant`: 197 bytes wrong;
  - `--early`: 86,968 writes in a window;
  - `--no-holes`: 3,602 bytes wrong and a crash only the model made.
- **Bug found on the way:** `el_want` tested Z after `STA sl_nv` (STA sets no flags). A level
  with no vertical enemies then wrote a garbage count of phases across other strips' enemies;
  the horizontal enemies of strips 2 and 3 started at x 54 and 6.

**The clip:** `build/layer44.mp4`. **Not yet:** b2 and real hardware for the shortened display
(R6 = 31) and the NMI guard.

## RAM hunt before layer 4.4 (2026-11-07, branch `ram-hunt-2026-11-07`)

Layer 4.3 left 658 bytes below the screen. Layer 4.4 (enemies, their sprites and tables,
per-level-type ground and riders) wants about 2.5K.

**MEASURED, what touches low RAM** (`tools/memwatch.mjs` over `tools/verify_strips.mjs`'s whole
`play` run, 6,515 fields; the phase "play" from `start`, so the MODE change and `install_irq`
included):
- **&0400-&0DFF:** the only accesses once ours runs are the MOS's sound code, reading
  &0804-&0807 and &0838 and writing &083B, 8 times each.
- **&0D00:** the DFS's NMI code; it runs during the load.

So page 8 stays the MOS's and page &0D the DFS's. **Claimed: &0400-&07FF and &0900-&0CFF.**

**Built:** the read-only tables there, each page-aligned or packed inside a page, so no indexed
read crosses one.
- **&0400-&07FF:** `obj_x_lo/hi`, `obj_kind`, `jump_h`, `col8_lo/hi` (1,013 bytes).
- **&0900-&0BFF:** `crash_col/t/spr` (546 bytes).

`make_data.py` writes them as `sequel/build/low.6502`: bytes at the end of the file, their labels
set to the low addresses. `reloc` copies both images there before moving the program down.

| Region | Before | After |
|---|---|---|
| Main RAM &0E00-&2FFF | 658 free (ends &2D6D) | **2,240 free** (ends &273F) |
| Low A &0400-&07FF | unclaimed | 11 free |
| Low B &0900-&0CFF | unclaimed | 478 free: &0C00-&0CFF, and 74 at the end of each of pages 9-B |
| Zero page | &00-&4F, &68-&6F, &8E-&8F free | the same |

**Proof** (jsbeeb 2.10.2, B-DFS1.2, same day as the baseline):
- **The low tables:** 318,018 reads and 0 writes during play (`memwatch`, &0400-&07FF and
  &0900-&0CFF).
- **`play`:** 6,485 fields, 0 bytes wrong, 21 crashes agreed, 0 writes in a window. Worst field
  20,474 cycles (was 20,530), median 4,640 (was 4,655).
- **`level`:** 0 bytes wrong. Worst field 19,015 (was 19,054).
- **Still able to fail:** `--plant` 197 bytes wrong; `--early` 253,652 writes in a window;
  `--no-holes` 2 crashes disagreeing.

**Measured, not built** (the next RAM, roughly in order):
- **Screen rows never drawn:** rows 3, 10, 17, 24 (between the strips) and row 31. They are
  displayed, so they must stay black. Row 31 (640 bytes at &7D80) could leave the display by
  setting R6 to 31: the picture would look the same, but the CRTC changes, so it is a decision.
- **Rows 1-2:** freed by decision 13's single status line only if the screen is moved up, which
  changes the layout.
- **The 74-byte page ends in low B,** for small tables.

**Rejected:**
- **Page 8:** the MOS writes &083B in play.
- **Page &0D:** the DFS's NMI handler.

## Layer 4.3: the jump, collisions, the crash, respawn and takes (2026-11-07)

`sequel/build/ddd2.ssd`, &0E00-&2D6D (8,046 bytes; **658 free below the screen**). Each strip now
has a 48-line window (character rows 4+7k to 9+7k) where its rider can be drawn at any height.
- **The jump** (`update_player`): from the ground with jump held, 84 fields, at
  `jump_offsets_table` interpolated in thirds of the original's 3-field pass (at every whole
  pass, the original's height exactly).
- **Collisions are the original's reads of the screen** (`main_game_loop`,
  `check_for_collision`), every field rather than every third:
  - the column right of the rider at its bottom line (`right_edge`), its middle and the line
    above it;
  - under its left column, in the air;
  - the ground under it, on the ground. A hole is a crash (decision 6).
- **What a rider is drawn over:** the rider and its black, as `plot_sprite` draws it. Under it
  in the air, its four columns show the obstacle there (`restore_under`); the sky lines it leaves
  are blacked.
- **The crash** (`kill_player`; `tools/measure_crash.mjs` on the original):
  - the explosion where the rider was;
  - the dead rider from 5 columns right, a column a pass of 3 fields for 14 passes (rubbed out
    with `sprite_blank` as it moves), then lying 18 columns right, two frames of 10 fields, 7
    times. Measured: 42.05 fields from the crash to `animate_dead_player`, 3.00-3.01 a pass, then
    226 fields to the next take, 86 of them the clapperboard, which goes (decision 27);
  - then the next take or out; the strip erased (1 field), and redrawn at the respawn point
    (decision 26, 1 field).
- **Takes:** 3, one back at each sea level reached if one is lost (decision 27).
- **The dead rider and explosion are new tall sprites:** 22 in all at 64 bytes, column-major, so
  any height is one draw loop (`draw16`).

**MEASURED** (`tools/verify_strips.mjs`, headless jsbeeb 2.10.2, `B-DFS1.2`). The oracle now holds
a model of the whole game: motion, jump, the picture, the collision reads made on the model's own
picture, crash, respawn, takes. It is re-made from the original and the decisions (sprites and
`jump_offsets_table` out of DENIS3), not from the sequel's source or data. Per field, every strip's
window must equal the model's; every crash the game makes (`crash_at`, with its `cause`) must be
the model's, same field, same reading; and the game's state must equal the model's.

| Scenario | Fields | Bytes wrong | Crashes, all agreed | Respawns | Takes back | Out | Writes in a window | Worst field |
|---|---|---|---|---|---|---|---|---|
| `play`: a planner; one blind to holes; one jumping too eagerly; a planner that coasts | 6,485 | 0 | 21: 17 into a front, 1 landed on top, 3 holes | 17 | 9 | 4 | 0 (nearest 25 rows) | 20,530 (51%) |
| `level`: all four together, never jumping | 1,648 | 0 | 16: 12 front, 4 middle right | 12 | 0 | 4 | 0 | 19,054 (48%): all four respawning at once |

- **The cost** (`play`): one strip's update 99th percentile 4,949-5,695, worst 7,268 (the
  respawn's draw, or a rider in the air over a dense stretch). The keys: 692-693.
- **Shown able to fail:**
  - a byte planted in strip 2: 197 bytes wrong;
  - T1 a band early: 114,014 writes in a window;
  - the game's hole check broken (`--no-holes`): 2 crashes only the model made, then the state
    and 2,778 bytes wrong.
- **Bugs the oracle found while building:**
  - `black_line` built its column offsets with `ORA` (line + 8, + 24, + 24): one column of sky
    left lit as a rider rose. 2,898 bytes wrong over 2,245 fields, then fixed.
  - Respawning redrew the whole ground: 11,000 cycles a strip, 45,075 for a field with all four
    respawning (a field dropped). `erase_strip` now leaves the ground whole and respawn draws only
    the objects: 4,555.
- **Not seen yet:** a top-right crash. Nothing but an enemy can be there (layer 4.4).

**The original's collision reads at 50 Hz.** The original moves up to 3 columns between reads,
the sequel one, so the sequel always meets an obstacle's first column. Its rider can therefore
crash on a front pixel the original's would have stepped past. It is the original's rule, read
three times as often.

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

**Not yet:** a second opinion in b2 (`sequel/build.ps1 -Run` boots it) and on real hardware - the
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
