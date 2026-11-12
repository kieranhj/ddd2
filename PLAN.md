# Plan

What is left. What has landed (steps 1-6, with their numbers) is in `docs/done.md`. The sequel's
design is `docs/sequel.md`; the decisions are `docs/decisions.md` (1-47).

## Now: the owner's play test (WIP published 2026-11-07, ddd2 18eaa84)

- **The first notes are built** (2026-11-12, `docs/done.md`): BREAK, the texts, the enemies
  turning back, the floor markers. Not yet published or merged: branch `play-test-fixes`.
- **`BUGS.md` #1:** fields dropped when the four riders hit a heavy moment together: 7, now 36 in
  the scripted worst case, 22 of them the markers'. Does it show in play? Mitigations 4 and 5
  (faster or lighter markers) are the new ones.
- **Decisions waiting for the owner's yes:** 17 (the riders' colours, to see), 23 (the riders at
  column 12), 24 (letting go slows by 1 a field), 25 (the keys), 33 (the status line's layout), 34
  (no wages for grounds a respawn skips), 35 (the title and the game's end), 46 (the MOS's
  workspace in pages 2-3 taken).

## Still to check off jsbeeb (`beeb-cross-emulator`)

- BREAK in game, with `*FX200,2` (decision 43): the DFS back (the owner saw it lost; jsbeeb never
  did).
- In b2 (`.\sequel\build.ps1 -Run`) and on real hardware: no tearing (decision 12); the picture
  where it was under the shortened display (decisions 31, 37, 41, 42: jsbeeb draws it 8 lines
  lower); the eight keys with no phantoms (decision 7); the sound on the chip.

## Step 7 - game modes 2 and 3, then the endless part

1. **Game modes 2 and 3** (decision 8): a timed race (crashes cost standstill time, the furthest
   wins) and last rider standing. Needs the owner's answers first: the race's length, what a crash
   costs, how a mode is chosen on the title.
2. **The endless part:** loop the last sets, then a level editor or a procedural generator.
3. **RAM:** main RAM has 178 bytes free after the 2026-11-12 RAM hunt (`docs/done.md`); the
   levers left are listed there ("measured, not built").
