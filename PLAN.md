# Plan

What is left. What has landed is in `docs/done.md`.

## Step 1 - the original, buildable and verified: DONE (tag `step1-byte-identical-rebuild`)

## Step 2 - make it ours to change (beeb-port-kit PORTING.md 2.1c, steps 3-6)

- [ ] Owner agrees decisions 1-3.
- [ ] Symbolise what the converter left as numbers: the 1 zero-page and the pointer tables in data
      (level data, sprite address tables), so moving code moves them.
- [ ] Relocation proof: build shifted by whole pages against a padded control, lockstep for
      30,000 frames (`tools/lockstep.mjs`, `tools/tracediff.mjs`). Finds layout couplings.
- [ ] Profile where the time goes (`tools/irqprofile.mjs`, `tools/pcprof.mjs`): MOS OSWRCH plotting
      and OSBYTE polling are the likely bulk.
- [ ] A seeded, replayable input script, and a side-by-side run of the original disc and the
      rebuild on the same keys (game state compared each pass).
- [ ] A short play-through recording of the original as the behavioural reference.

## Step 3 - the sequel (to be proposed)

Multiplayer, with a vertical rupture. Needs a proposal (PORTING.md 2.3) and decisions before code:
the machine (Model B? sideways RAM?), the screen split (two players' lanes above/below a CRTC
rupture - `docs/vertical-scroll.md` and `examples/vscroll` are the kit's measured starting points),
keys for two players read direct from the VIA, taking IRQ1V from the MOS, what of the original's
levels and rules carry over.
