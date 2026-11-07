# Plan

What is left. What has landed is in `docs/done.md`. The sequel's design is `docs/sequel.md`; the
decisions are `docs/decisions.md` (1-22).

## Step 1 - the original, buildable and verified: DONE (tag `step1-byte-identical-rebuild`, public at github.com/kieranhj/ddd2)

## Step 2 - measure the original: DONE (decisions 1-3 agreed 2026-11-07)

## Step 3 - the course, captured from the original: DONE (`data/course.json`, 0 bytes wrong in 71)

## Step 4 - the sequel, one layer at a time (each visible in jsbeeb before the next)

1. [ ] One strip on the real course (`data/course.json`'s `course`, decisions 18-22): the scroll
       from the spike, optimised (unrolled column copy;
       redraw the rider only when something passes under it; target: the four strips well under
       the spike's 22-23.5K cycles at the real top speed). The accelerate key drives the
       original's velocity rules. Measure the worst case.
2. [ ] Four strips and eight keys, at 50 Hz (decision 11). Measure the key numbers and check
       for ghosting (`beeb-key-numbers`). The cycle budget. No tearing (decision 12): each strip
       is written only while the raster is outside its band. Choose, by measuring, between
       polling the raster and a timer on IRQ1V. Show it with an oracle that records each write's
       raster line, and get a second opinion in b2 (`beeb-cross-emulator`). Choose the four rider
       colours (decision 17).
3. [ ] Jump, collisions, crash and respawn, takes. Holes crash (decision 6).
4. [ ] Enemies, horizontal and vertical, in course coordinates. Each strip changes its level type
       (land, sea, snow; sprites and ground colour) as its rider crosses a level boundary.
5. [ ] The status line at the top: four players' wages and takes (decision 13). Game mode 1
       (decision 8). The title screen, and skill chosen once for everyone (decision 15). A strip
       with no one playing it stays static (decision 14).
6. [ ] Sound (our own driver if IRQ1V is ours).
7. [ ] Game modes 2 and 3. Then the endless part: loop the last sets, then a level editor or a
       procedural generator.
