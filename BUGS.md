# Bugs

Open defects, with the evidence and what has been ruled out. Fixed entries stay for what they
ruled out. Index first, detail below.

| # | Status | Summary |
|---|---|---|
| 1 | Open: to play test | Fields dropped when all four riders hit a heavy moment together (decision 11) |

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

