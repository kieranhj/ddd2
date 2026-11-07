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
