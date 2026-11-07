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
50 Hz field** (measured, step 2). SHIFT adds 2 to velocity per update, so 0 to 250 takes 125
updates, 7.5 seconds. At 50 Hz the sequel moves in steps of at most one column (2 pixels) where
the original jumped up to 3 columns at a time. Decision 16 keeps the speeds the same.

**Course length.** A ground is about 76 columns, from `player_x` 0 to &4B. That makes 36 levels x 4
grounds, about 11,000 columns. At the top speed of 48.8 columns a second, that is about 225
seconds (under four minutes) of flat-out riding, so the endless part (looping the last sets, then a generator or an
editor) arrives quickly.

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
- The byte-identical rebuild stays as the reference: tag `step1-byte-identical-rebuild`, and
  `.\build.ps1` builds both.

**The course is captured, not re-derived.** A jsbeeb harness runs the original's
`initialise_level` and `consider_plotting_holes` for each level from a fixed state. It reads the
object positions back and writes the course table. It is checked by drawing each captured level
and comparing it byte for byte with the original's screen.

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
