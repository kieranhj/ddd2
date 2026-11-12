# Bugs

Open defects, with the evidence and what has been ruled out. Fixed entries stay for what they
ruled out. Index first, detail below.

| # | Status | Summary |
|---|---|---|
| 1 | Open: to play test | Fields dropped when all four riders hit a heavy moment together (decision 11) |
| 2 | Fixed 2026-11-12 | The title's and the game end's text drawn through OSWRCH with the game's tables as the VDU's workspace: no text, and gaps in the floors |
| 3 | Fixed 2026-11-12 | The texts garbled on a Master: `print` read the font at &C000, where only a Model B keeps it |

<!--
Format for an entry:

## N. One-line title

**Open YYYY-MM-DD.** Who saw it and where (emulator, model, hardware).

### What was measured
### Ruled out
### Fixed (step X, YYYY-MM-DD)
-->

## 1. Fields dropped when all four riders hit a heavy moment together

**Open 2026-11-07.** `tools/verify_strips.mjs` (jsbeeb 2.10.2, B-DFS1.2), skill A, four players,
`play`: 3,390 passes in 3,397 fields - 7 fields dropped (decision 11 wants none). The other runs
(`level`, B 0110, D 1010, F 0001) drop none. Merged as it is on the owner's word (2026-11-07):
play testing decides whether it matters.

### What was measured
- Every drop is in a run of heavy fields with the four scripted riders in lockstep (they ride
  the same course with the same planner):
  - crossing into a level together: three look buffers recoloured (`set_look`, ~3,300 cycles
    each; player 1's is a copy) while the new level's enemies come on;
  - all four airborne among enemies (rider ~4,800 + enemies ~4,600 a strip).
- The worst field is 38,562 cycles (the field is 39,936); the loop's slack absorbs single heavy
  fields, and a run of them drops one. A drop never tears: the late-start rule makes it a field
  late instead (0 writes in a window).
- **2026-11-12, after the play test's changes** (same harness and run):
  - With the enemies turning back (decision 44) the scripted game is a different one (its riders
    crash elsewhere); with the markers' code taken out of game and model alike: 3,271 passes in
    3,285 fields, **14 dropped**, worst field 43,756.
  - With the markers (decision 45) as well: 3,271 passes in 3,307 fields, **36 dropped**, worst
    field 48,024. `marks_move` costs a median 973 cycles each column a strip moves (p99 1,058,
    4,690 calls): about 3,900 a field with four riders at speed.
  - `level` (four players) now drops 1 (940 fields for 939 passes); B 0110, D 1010, F 0001
    none.
  - 0 bytes wrong in all of it; 0 writes in a window.

### Ruled out / done
- Four respawns at once: fixed (the three-field respawn, 58,541 -> under 15,000).
- Absent specials listed every field; `set_look` on black bytes; enemies redrawn under the rider
  where nothing was put back: all trimmed, each measured.

### Mitigations, not built
1. **Prepare a rider's next look before the level boundary**, into a second look buffer a player
   (+256 bytes; room below the screen): removes the level-crossing case.
2. **Faster enemy drawing** for the airborne case: shift routines for the horizontal enemies
   (one column left or right, as the obstacles'), ~1.2K of code; or a tighter `draw16`.
3. Spread a strip's enemy redraws: a moved enemy that is not near the rider could wait a field
   when the field is already heavy (a visible lag of one field for that enemy).
4. **Faster markers** (estimated, not measured): each marker's old and new column from one
   pointer (the new one is 8 bytes before the old), the stores unrolled, no JSR a marker; about
   460 cycles a move, half today's. Needs about 40 more bytes in one piece: page 3 has 36 at its
   end and page 8 27 (decision 46 has taken the rest of the measured-free MOS workspace).
5. **Lighter markers** (a visible change): two lines tall instead of four, or two on the screen
   instead of four, each about halving their cost.

## 2. No text, and gaps in the floors, at the game's end

**Open 2026-11-12.** The owner's play test (bbc.xania.org, the WIP disc, ddd2 18eaa84): at the
game's end there is no "PLAYER n WINS"; the game seems to stop, and gaps appear in the middle of
strips 1-3's floors.

### What was measured
- In jsbeeb (2.10.2, B-DFS1.2) no text either, on the title ("PRESS A-F TO START") or at the end:
  row 10 all 0 during the end's wait, while the MOS's cursor (&0318-&0319) had moved on to row 11
  and the screen start (&0350) was &3000. After VDU 17,7 the text colour (&0357) was 0.
- The cause: `print` sent the texts to OSWRCH, and the VDU's workspace runs to &037F; from &0360
  it holds the game's pitch table since `start` (decision 32 claimed page 3 from &0360 because
  nothing WRITES it once the game runs - but OSWRCH READS it: the colour count &0360, the pixels a
  byte &0361, the font's pages &0368-&036E). Every text has been drawn with those since step 4.5.
  The gaps were not reproduced here (jsbeeb drew black text in row 10), but OSWRCH plotting with a
  garbage pixel count and font pages explains them.

### Ruled out
- The strips through the end's wait: unchanged, every field (verify_strips now checks it).

### Fixed (2026-11-12)
- `print` (flow.6502) draws the texts itself from the MOS ROM's font at &C000, white on black;
  the game no longer calls OSWRCH after `start`'s cursor-off. `verify_strips` checks row 10 on the
  title and at the end against the font drawn independently: the OSWRCH build fails it (288 and
  231 bytes wrong), the fix passes.

## 3. The texts garbled on a Master

**Open 2026-11-12.** The owner, playing on a Master 128 after #2's fix: "the font looks corrupted".

### What was measured
- `print` (#2's fix) read each glyph at &C000 + (c - 32) x 8: the font on a Model B (MOS 1.20).
  In jsbeeb's Master 128 (MOS 3.20) &C000 reads 0, and the font's bytes appear nowhere in
  &8000-&FFFF as the CPU sees them; in the MOS 3.20 ROM image they are at &1F900, the same 768
  bytes as the Model B's. So on a Master the texts were drawn from whatever &C000 held.
- jsbeeb's Master runs the game (an earlier screenshot after 150 frames was still loading).
- `verify_strips --model Master` on the build before the fix: 306 bytes of the title's text wrong
  and 242 of the end's; the fix: 0 and 0.

### Fixed (2026-11-12)
- `start` copies the 18 glyphs the texts use, through OSWORD 10, into `font` (126 bytes of main
  RAM) while the MOS is still whole; `print` draws from there (decision 47). The room came from
  the RAM hunt's first lever (run-once code out of main RAM). `verify_strips` takes its expected
  glyphs from jsbeeb's Model B ROM file, so it checks a Master's text too (`--model Master`).
