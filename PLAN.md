# Plan

What is left. What has landed is in `docs/done.md`. The sequel's design is `docs/sequel.md`; the
decisions are `docs/decisions.md` (1-37).

## Step 1 - the original, buildable and verified: DONE (tag `step1-byte-identical-rebuild`, public at github.com/kieranhj/ddd2)

## Step 2 - measure the original: DONE (decisions 1-3 agreed 2026-11-07)

## Step 3 - the course, captured from the original: DONE (`data/course.json`, 0 bytes wrong in 71)

## Step 4 - the sequel, one layer at a time (each visible in jsbeeb before the next)

1. [x] One strip on the real course: DONE (`docs/done.md` layer 4.1; decision 23 proposed).
2. [x] Four strips and eight keys, 50 Hz, no tearing: DONE in jsbeeb (`docs/done.md` layer 4.2;
       decisions 24-25 proposed, the colours of 17 to be seen). Left: b2 (`sequel/build.ps1 -Run`)
       and real hardware for the tearing and the keys' ghosting.
3. [x] Jump, collisions, crash and respawn, takes; holes crash (decision 6): DONE in jsbeeb
       (`docs/done.md` layer 4.3; decisions 26-27 agreed). Left: b2 and real hardware, as 4.2.
       RAM hunt done (`docs/done.md`): 2,240 bytes free below the screen, 478 in low RAM.
4. [x] Level types, and the enemies in course coordinates: DONE in jsbeeb (`docs/done.md` layer
       4.4; decisions 28-32). Left: b2 and real hardware, as 4.2.
5. [ ] The status line at the top: four players' wages and takes (decision 13). The spider, the
       helicopter and its gold (decision 29). Game mode 1
       (decision 8). The title screen, and skill chosen once for everyone (decision 15). A strip
       with no one playing it stays static (decision 14).
6. [ ] Sound, and no MOS interrupt handling at all (the owner, 2026-11-07: "remove any MOS IRQ
       handling and do it all ourselves"). Today the MOS's IRQ entry still dispatches to our
       IRQ1V, and the MOS's sound code still touches page 8 (&083B written in play, the RAM
       hunt). Take that over: our handler does everything, no MOS sound, keyboard or timers. Use
       Stryker's Run's replacement sound driver (`../strykers/src/lib/sfx50.6502`, its effects
       made by `../strykers/tools/sfx50.py`). Page 8 then becomes ours too (re-measure with
       `tools/memwatch.mjs` before claiming it).
7. [ ] Game modes 2 and 3. Then the endless part: loop the last sets, then a level editor or a
       procedural generator.
