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
| 9 | 2026-11-07 | AGREED | **Target the Model B, and scroll the strips in software, not with a CRTC rupture.** A rupture per strip needs a doubled buffer per strip (4 x 8,960 = 35,840 bytes, too much for a Model B). The spike scrolls all four on the original's MODE 2 screen at 50 Hz, with all four at top speed, in 25-27K cycles a field before any optimisation. **Each strip's redraw is timed to the raster so it never tears** (decision 12). The owner, 2026-11-07: "Let's go Model B software scroll and time the writes to avoid tearing" | `docs/spike-swscroll.md` |
| 10 | 2026-11-07 | AGREED | **The rebuild of the original is public** at `github.com/kieranhj/ddd2`, tag `step1-byte-identical-rebuild`; the reference disc is not in the repo (decision 1). The owner, 2026-11-07 | `README.md` |
| 11 | 2026-11-07 | AGREED | **50 Hz:** one game update every field, with all four riders at top speed. The owner, 2026-11-07 | `docs/sequel.md` |
| 12 | 2026-11-07 | AGREED | **No tearing:** a strip is only written while the raster is outside its band. Each band is 7 character rows (56 scanlines) on the display, so after the raster leaves a band there are about 256 scanlines (~32,700 cycles) before it comes round to that band again. How the writes are timed (polling the raster, or a timer on IRQ1V) is chosen in step 4.2, measured. The owner, 2026-11-07 | `docs/sequel.md` |
| 13 | 2026-11-07 | AGREED | **One status line at the top** for all four players' wages and takes, in place of the original's 3-row box. The owner, 2026-11-07 | `docs/sequel.md` |
| 14 | 2026-11-07 | AGREED | **Always four strips.** A strip with no one playing it stays static (its rider does not move). Computer riders are wanted later. The owner, 2026-11-07 | `docs/sequel.md` |
| 15 | 2026-11-07 | AGREED | **Skill A-F is one choice for everyone:** every rider starts on the same level, as in the original's `starting_levels_table`. The owner, 2026-11-07 | `docs/sequel.md` |
| 16 | 2026-11-07 | AGREED | **The riders move at the original's speeds:** top speed 48.8 columns a second (0.98 a 50 Hz field) and 7.5 s from standstill to top speed. Velocity is kept in the original's units, and the update runs 3 times as often with a third of the step. The motion is then the original's, only smoother (2-pixel steps, not up to 6). A faster game is one constant away. The owner, 2026-11-07: "Keep the original speed but smoother" | `docs/done.md` step 2 |
| 17 | 2026-11-07 | AGREED | **Each rider has its own colour.** The rider sprite's colours are remapped per player at build time (MODE 2 holds 2 pixels of 4-bit colour a byte, so a remap is a 256-byte table), and the status line uses the same colours. The four colours are chosen in step 4.2, against the three level types' backgrounds. The owner, 2026-11-07 | `docs/sequel.md` |
