// verify_break.mjs - BREAK in a game gives back a working machine (decisions 43, 46).
//
//   node tools/verify_break.mjs [--plant]
//
// Boots sequel/build/ddd2.ssd (Model B, SHIFT+BREAK), joins player 1, starts a game with SPACE,
// rides 200 fields, then presses BREAK. The game has taken the DFS's workspace, IRQ1V and parts of
// the MOS's workspace in pages 2 and 3 (decision 46), so the machine must come back by `*FX200,2`
// (BREAK clears memory, decision 43) to BASIC with the DFS: PAGE (&18) = &19 after 300 fields (&0E
// on a Master).
// Then SHIFT+BREAK must boot the disc again, to the title (`title_loop`).
//
// --plant: before BREAK, &0280-&02FF filled with &AA - the MOS's workspace BREAK reads before it
// clears anything (measured 2026-11-12: junk there hangs the reset). It must FAIL.
// --zp-fill V: before BREAK, &C5-&FB (the MOS's zero page, the game's from `start` on - nothing
// else touches it in play, tools/memwatch.mjs) filled with V (hex): it must still PASS.
// --fill LO-HI:V: before BREAK, LO-HI (hex) filled with V (hex) - a region the game takes from
// the MOS, shown untouched in play by tools/memwatch.mjs: it must still PASS.
// --model M: the machine (default B-DFS1.2; the owner plays on a Master).
// Exit 0: both came back. 1: either did not. 2: could not run.
import { open } from "./harness.mjs";

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i < 0 ? d : args[i + 1]; };
const PLANT = args.includes("--plant"), ZPFILL = opt("--zp-fill", null), MODEL = opt("--model", "B-DFS1.2"), FILL = opt("--fill", null);
const h = await open({ name: "verify_break", disc: "sequel/build/ddd2.ssd", model: MODEL });
const N = (n) => h.need(n);
await h.boot({ field: N("frames"), fieldBytes: 2 });
if (await h.runTo(N("title_loop"), 40_000_000) === null) h.die("never reached the title", h.gaveUp);
h.keyDownRaw(0);                                       // SHIFT: player 1 joins (decision 49)
await h.s.runFrames(5);
h.keyDownRaw(98);                                      // SPACE: start (decision 57)
if (await h.runTo(N("game_start"), 40_000_000) === null) h.die("the game never started", h.gaveUp);
h.keyUpRaw(98);
await h.s.runFrames(200);
h.keyUpRaw(0);
const inGame = { fx200: h.s.readMemory(0x258, 1)[0], pc: h.cpu.pc };
if (PLANT) for (let a = 0x280; a <= 0x2ff; a++) h.s.writeMemory(a, [0xaa]);
if (ZPFILL !== null) for (let a = 0xc5; a <= 0xfb; a++) h.s.writeMemory(a, [parseInt(ZPFILL, 16)]);
if (FILL !== null) {
    const [range, v] = FILL.split(":"), [lo, hi] = range.split("-").map((x) => parseInt(x, 16));
    for (let a = lo; a <= hi; a++) h.s.writeMemory(a, [parseInt(v, 16)]);
}
h.s.reset(false);                                      // BREAK
await h.s.runFrames(300);
const page = h.s.readMemory(0x18, 1)[0];
h.s.keyDown(h.keys.SHIFT);
h.s.reset(false);                                      // SHIFT+BREAK
await h.s.runFrames(50);
h.s.keyUp(h.keys.SHIFT);
const title = await h.runTo(N("title_loop"), 40_000_000);
const wantPage = /master/i.test(MODEL) ? 0x0e : 0x19;   // a Master's DFS keeps its workspace in hidden RAM: PAGE &0E00
const ok = page === wantPage && title !== null;
h.finish({ plant: PLANT, zp_fill: ZPFILL, fill: FILL, model: MODEL, in_game: inGame, page_after_break: "&" + page.toString(16), title_after_shift_break: title !== null }, ok, { samples: 2 });
