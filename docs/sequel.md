# The sequel: proposal

Four players, each riding one of the original's four strips as an endless runner (decisions 4-10).
This page records what the original is made of, as far as the sequel cares, and how the sequel is
to be built. `PLAN.md` holds the steps.

## What the original is made of (read from `src/game.6502`, 2026-11-07)

**The screen** is MODE 2 at `&3000`, set up through the MOS.
- The status box is character rows 0-2: `WAGES` and the takes.
- Below it are four bands of 7 character rows. Band k's ground is character row 9+7k, written as
  20 copies of character 250.
- Its obstacles sit on the two rows above the ground: `screen_y` = &38 + &38k, i.e. rows 7+7k
  and 8+7k.

**The ground character** is `VDU 23,250,255,255,255,255,0,0,0,0`: four solid lines and four blank
ones. It looks the same at every column, so it never needs redrawing when the strip scrolls. Only
the holes break it.

**Levels are generated, not stored.** `initialise_level` makes each of the 36 levels from a few
small tables:
- **Level type,** (level - 1) MOD 3: land, sea or snow. It chooses the sprites and the ground
  colour.
- **Level set data,** 3 bytes per set of three levels: the obstacle count, whether there is a
  horizontal enemy, and the vertical enemy count.
- **`x_positions_table`,** 40 column positions, stepped through from an offset of `level`.

The level contents are placed like this:
- **Obstacles:** one per ground, cycling down the four grounds.
- **Holes:** (level - 1) DIV 4 of them from level 5, on grounds 1 and 3, placed by
  `consider_plotting_holes`. This reads state left over from the previous take ("holes sometimes
  move between takes", says the disassembly). That is why the course is to be *captured* from
  the original running, not re-derived.
- **Enemies:** the horizontal enemy (ambulance, yacht or snowball) runs along ground 2. The
  vertical enemies (policeman, red ball or skull) move up and down at fixed columns.

After level 36 the original goes back to level 33.

**Sprites** are 4 bytes (8 pixels) wide and 16 lines tall.
- They are plotted with `STA`, so each carries its own black background.
- There is one rider sprite per level type: motorbike, speedboat and skis.
- Collisions are found by reading screen bytes. For example, a non-zero byte under the rider means
  ground; a zero byte means a hole.

**Speed.** `update_player` adds velocity x 3/256 to `player_x`, which counts in 2-pixel columns.
Velocity is capped at 250, so the top speed is 2.93 columns per update. **The original updates
once every 3 fields (16.7 Hz)**, so its top speed is 48.8 columns a second, **0.98 columns per
50 Hz field** (measured, step 2). SHIFT adds 3 to velocity per update (three `INC`s), on the ground
and in the air, so 0 to 250 takes 84 updates, 5.0 seconds (step 2's recording: 0, 3, 6 ...; an
earlier note here said 2 and 7.5 s, which was a misreading). Starting a level - not only a take -
sets velocity to 0 (`initialise_level`). At 50 Hz the sequel moves in steps of at most one column (2 pixels) where
the original jumped up to 3 columns at a time. Decision 16 keeps the speeds the same.

**The jump** (`update_player`, `jump_offsets_table`; measured, step 2):
- **Starting it:** SPACE, only from the ground (`player_jump_state` 0).
- **Its length:** the state counts up one a pass; on reaching 30 it is set back to 0. After the
  pass that sees SPACE the state is 2, so the rider is in the air for 28 passes: 84 fields, 1.68 s.
- **Its height:** the rider is raised by `jump_offsets_table[state]`, which climbs 0, 1, 3, 6 ... to
  a peak of 20 lines (&14) at states 13-18 and falls back symmetrically.
- **What it clears:** an obstacle is 16 lines tall, and the rider is at least 16 lines up for states
  8-23 (16 passes, 48 fields). At top speed that is 47 columns of clearance, against an obstacle
  only 4 columns wide.
- **How far it goes:** SHIFT still adds to velocity in the air, so a jump started below top speed
  ends faster than it began. At top speed it covers 82 columns, more than a screen width.
- **Holes are only checked on the ground.** Each pass, with the rider not jumping, it reads the
  ground row under the rider's LEFT column (`player_x`). A zero byte there means a fall. So a rider
  falls only when that column is over the 8-column hole.

**Collisions** (`check_for_collision`, and the middle-right read in `main_game_loop`) are reads of
screen bytes; anything non-zero hits:
- the column just right of the sprite, kept by `plot_sprite` as `right_edge`;
- its middle-right and top-right;
- below its left column, the line under its feet, while jumping.

So a crash is a lit byte at one of a few points, not an overlap of shapes. Gold is lit too: touching
it on the right edge with colour &1F collects it, but meeting it at another point would be a crash
(read from the code, not seen happen).

**What moves** (read from the code; the step 2 rider's planner models it, `tools/record_original.mjs`):
- **The horizontal enemy** (every level): +1 column a pass along the second ground, back to 0 at
  &4B.
- **The vertical enemies:** each at a fixed column, raised `jump_offsets_table[state]` lines, the
  state stepping 1 to &1F a pass (it reads two bytes past the 30-byte table). Only the first five
  move: the update loop stops at X = &0F. Levels with 6-8 have the rest cleared and never drawn.
- **The spider,** levels 1-3: column &28 over the fourth ground, down and up a line a pass.
- **The helicopter,** from level 4: -1 column a pass; at 0 it goes back to &4C and up a ground. It
  drops the gold.

For the sequel at 50 Hz (decision 16), the jump state counts in thirds and the height comes from
interpolating between table entries. The arc is the same shape, drawn a line at a time instead of
up to 3 lines a pass.

**The course** (captured, step 3: `data/course.json`, made by `tools/capture_course.mjs` and
`tools/make_course.py`; checked by redrawing every level from it, 71 pictures, 0 bytes wrong):
- **35 levels, not 36.** After level 35 the game goes to 33 (`INC level`, then 36 becomes 33), so
  level 36 is never played; no skill starts there (F starts at 31). Level 33 the second time round
  is the same as the first.
- **Everything is on a 4-column grid,** 20 cells a ground. 144 obstacles, 106 holes.
- **The second ground never has an obstacle.** `clear_paths_of_enemies` wipes its whole obstacle
  row for the horizontal enemy. Holes are only on the first and third grounds.
- **Holes are 8 columns wide, but can touch or overlap:** 90 are 8, 13 are 12, 2 are 16, 1 is 20.
- **A level is not always the same twice.** The first time a level comes up (through the
  end-of-level path) and on a retake (through `new_take`) the holes start from different offsets
  in 20 of the 35 levels, and `new_take` also clears an obstacle at column 8 of the first ground,
  which the end-of-level path does not. With velocity reset to 0 at a level start, that obstacle
  can be all but unclearable: level 7's first take begins 4 columns from a grave with a house 4
  beyond it. The course file holds the FIRST time each level comes up.
- **Length.** The rider travels about 76 columns a ground (`player_x` 0 to &4B-&4D). 140 grounds at
  76 is 10,640 columns: about 218 seconds at the top speed of 48.8 columns a second, so the
  endless part (looping the last sets, then a generator or an editor) arrives quickly.
- **Joined at 76 columns a ground (decision 18):** 7 holes run past column 76 (to 80) and are cut
  there in the flat `course`. The finish is the end of level 35 (decision 22); speed carries over
  level boundaries (decision 21).

## How the sequel is built

**A new main loop around the original's parts, not the original edited in place.**
- The original is MOS-bound, single-player and screen-relative: every object has a screen
  position, not a course position.
- The sequel needs four course positions and a scroll per strip. Its outline:
  - a loop that owns the machine;
  - the four strips scrolled in software (decision 9, `docs/spike-swscroll.md`);
  - eight keys read from the VIA (decision 7).
- What carries over:
  - **Unchanged:** the original's sprites and tables, taken from the rebuild's symbols.
  - **Transliterated from `game.6502`, each with a reference to the original routine:** its
    rules — the velocity, the jump arc, what collides, and the wages.
- The byte-identical rebuild stays as the reference: tag `step1-byte-identical-rebuild`;
  `.\build.ps1` builds it, and `.\sequel\build.ps1` the sequel from it.
- **Built** (steps 4-6, `docs/done.md`): the code map, the memory layout and the traps are in
  `CLAUDE.md`, "The sequel".

**The course is captured, not re-derived** (done, step 3). A jsbeeb harness plays the original
from level 1, moving the rider to the end of each level so the game's own end-of-level code sets
up the next. It logs every sprite plot and the screen, and crashes once on each level to see the
retake too. `make_course.py` turns the plots into the course, then redraws every picture from the
course alone and compares it with the original's screen.

## Settled 2026-11-07

- **Model B with software scrolling (decision 9).** Each strip's writes are timed so the raster
  never sees them (decision 12).
- **50 Hz (decision 11).**
- **One status line at the top (decision 13).**
- **Always four strips (decision 14).** A strip no one is playing stays static; computer riders
  come later.
- **Skill A-F is chosen once, for everyone (decision 15).**
- **Each rider has its own colour (decision 17).**
- **The original's speeds, in smoother steps (decision 16).**
- **The course (decisions 18-22):** grounds joined at 76 columns; each level as it first comes up,
  the column-8 obstacle kept; no speed reset at a level; levels 1-35, the end of 35 the finish.
