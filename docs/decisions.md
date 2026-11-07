# Decisions of record

Every deviation from the original, and every choice the hardware forced, gets a row. **This table
is the only copy.** A row is short: the question, the answer, one line of reason and where the
evidence is. Nothing is re-litigated without a new row saying why.

| Status | Means |
|---|---|
| `OPEN` | raised, waiting on the owner; nothing is built on it |
| `PROPOSED` | an answer is written down and costed, waiting on the owner's yes |
| `TAKEN` | the agent took it while the owner was away, provisionally |
| `AGREED` | the owner said yes, or merged it |
| `SUPERSEDED by N` | replaced by row N |
| `REJECTED` | considered and refused |

| # | Date | Status | Decision | Where |
|---|---|---|---|---|
| 1 | 2026-11-07 | PROPOSED | **The reference is the Stairway to Hell disc** `reference/sth/DareDevilDenis.ssd` (SHA256 in `docs/done.md`). Level7's disassembly is of the *tape* release; `tools/check_disasm.py` shows it agrees with this disc on every byte of code (DENIS3 all 9,872 bytes; DENIS2 from &40E9). The disc's own BASIC (DENIS2 &4000-&40E8, DENIS, LOAD, !BOOT) is taken from the disc | `docs/done.md` step 1 |
| 2 | 2026-11-07 | PROPOSED | **Baron 0.6.0**, one assembly (`src/main.6502`), every disc file a `SECTION`; the BASIC files as `BASIC ... ENDBASIC` (needs 0.5.2+), not binary blobs, so the sequel can edit them | `src/main.6502` |
| 3 | 2026-11-07 | PROPOSED | **The image comparison skips two things**, both outside every file: the catalogue's write-cycle count (reference 17, Baron 0) and 81 bytes of slack past the ends of files - 79 after DENIS in sector 52, 2 after LOAD in sector 55 - leftovers of earlier files on the master disc. Everything else in the image is identical | `tools/compare.py` |
| 4 | 2026-11-07 | AGREED | **The sequel: four players, one of the original's four strips each, as an endless runner.** Each rider stays at a fixed screen column and their strip's landscape moves at their speed. The owner's brief, 2026-11-07 | `docs/sequel.md` |
| 5 | 2026-11-07 | AGREED | **The course is the original's 36 levels laid end to end**, ground by ground (level 1 grounds 1-4, then level 2 ...), the same course in every strip. A level editor or a procedural generator comes later. The owner's brief | `docs/sequel.md` |
| 6 | 2026-11-07 | AGREED | **A gap in the track is a crash.** In the original, a hole drops the rider to the ground below; the strips are now separate players. The owner's brief | `docs/sequel.md` |
| 7 | 2026-11-07 | AGREED | **Two keys per player: accelerate and jump.** Letting go of accelerate coasts and slows; the original's brake key goes. Eight keys, read direct from the System VIA, chosen so no three held keys form a ghosting rectangle in the matrix. The owner, 2026-11-07 | `docs/sequel.md` |
| 8 | 2026-11-07 | AGREED | **Three game modes, built in this order:** (1) takes, and the highest wages wins - a crash costs a take, the rider respawns past the hazard, out of takes is out; (2) a timed race - crashes cost standstill time, the furthest at the end wins; (3) last rider standing. The owner, 2026-11-07 | `docs/sequel.md` |
| 9 | 2026-11-07 | PROPOSED | **Target the Model B, and scroll the strips in software, not with a CRTC rupture.** The owner prefers the Model B. A rupture per strip needs a doubled buffer per strip (4 x 8,960 = 35,840 bytes, too much for a Model B). The spike scrolls all four on the original's MODE 2 screen at 50 Hz, with all four at top speed, in 25-27K cycles a field before any optimisation. Open: whether the rupture is then wanted for anything else, and tearing (not yet measured) | `docs/spike-swscroll.md` |
| 10 | 2026-11-07 | AGREED | **The rebuild of the original is public** at `github.com/kieranhj/ddd2`, tag `step1-byte-identical-rebuild`; the reference disc is not in the repo (decision 1). The owner, 2026-11-07 | `README.md` |
