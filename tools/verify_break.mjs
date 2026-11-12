// verify_break.mjs - BREAK in a game gives back a working machine (decisions 43, 46).
//
//   node tools/verify_break.mjs [--plant]
//
// Boots sequel/build/ddd2.ssd (Model B, SHIFT+BREAK), joins player 1, starts a game at skill A,
// rides 200 fields, then presses BREAK. The game has taken the DFS's workspace, IRQ1V and parts of
// the MOS's workspace in pages 2 and 3 (decision 46), so the machine must come back by `*FX200,2`
// (BREAK clears memory, decision 43) to BASIC with the DFS: PAGE (&18) = &19 after 300 fields.
// Then SHIFT+BREAK must boot the disc again, to the title (`title_loop`).
//
// --plant: before BREAK, &0280-&02FF filled with &AA - the MOS's workspace BREAK reads before it
// clears anything (measured 2026-11-12: junk there hangs the reset). It must FAIL.
// Exit 0: both came back. 1: either did not. 2: could not run.
import { open } from "./harness.mjs";

const PLANT = process.argv.includes("--plant");
const h = await open({ name: "verify_break", disc: "sequel/build/ddd2.ssd" });
const N = (n) => h.need(n);
await h.boot({ field: N("frames"), fieldBytes: 2 });
if (await h.runTo(N("title_loop"), 40_000_000) === null) h.die("never reached the title", h.gaveUp);
h.keyDownRaw(97);                                      // Z: player 1 joins
await h.s.runFrames(5);
h.keyDownRaw(65);                                      // A: skill A
if (await h.runTo(N("game_start"), 40_000_000) === null) h.die("the game never started", h.gaveUp);
h.keyUpRaw(65);
await h.s.runFrames(200);
h.keyUpRaw(97);
const inGame = { fx200: h.s.readMemory(0x258, 1)[0], pc: h.cpu.pc };
if (PLANT) for (let a = 0x280; a <= 0x2ff; a++) h.s.writeMemory(a, [0xaa]);
h.s.reset(false);                                      // BREAK
await h.s.runFrames(300);
const page = h.s.readMemory(0x18, 1)[0];
h.s.keyDown(h.keys.SHIFT);
h.s.reset(false);                                      // SHIFT+BREAK
await h.s.runFrames(50);
h.s.keyUp(h.keys.SHIFT);
const title = await h.runTo(N("title_loop"), 40_000_000);
const ok = page === 0x19 && title !== null;
h.finish({ plant: PLANT, in_game: inGame, page_after_break: "&" + page.toString(16), title_after_shift_break: title !== null }, ok, { samples: 2 });
