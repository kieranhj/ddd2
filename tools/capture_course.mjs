// capture_course.mjs - capture every level the original draws, as the original draws it (PLAN.md
// step 3). The levels are generated, and where the holes go depends on bytes left over from
// whatever ran before (`consider_plotting_holes` reads `variables_for_hole_position`, which shares
// its addresses with tune_delay, wipe_y, death_delay and others), so they are captured from the
// game running rather than re-derived.
//
//   node tools/capture_course.mjs [OUT.json]       (default data/course_capture.json)
//
// The run: skill A (level 1). For each level the game reaches it takes two pictures:
//   first   the level as a rider first sees it. Level 1's comes through `new_take` (the game's
//           start); every later level's through the end-of-level path in `update_player`
//           (initialise_level, consider_plotting_holes, clear_paths_of_enemies), taken at the
//           instruction after the last of them (`not_end_of_level` - 5, LDA #1 : STA
//           player_can_brake, checked below).
//   retake  the level after a crash on it: the run is stopped at `main_game_loop` and sent to
//           `is_collision`, as a collision would, with `take` reset to 1 so the game never ends;
//           the picture is taken at the next `main_game_loop`, after new_take has redrawn it.
// Then the rider is put at the end of the last ground (player_x &4B, player_ground_y &E0, not
// jumping, velocity 0) and the game's own end-of-ground code moves it on to the next level. The
// run follows the game's level order, including its wrap (after 35 comes 33), until a level comes
// round a second time.
//
// For each picture it records every `plot_sprite` call since the previous picture (who called,
// where, which sprite), the enemies' starting state, the hole search's starting offset, and the
// screen (build/course/<level>-<kind>.bin, &3000-&7FFF). tools/make_course.py turns the plots into
// the course and checks it: drawn from the course alone, each picture must match the screen.
// Exit 0: every level reached and captured; 2: could not run.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { bootGame, state } from "./ddd.mjs";

const OUT = process.argv[2] || "data/course_capture.json";
const h = await bootGame("capture_course");
const A = (n) => h.need(n);
const hex = (v, n = 4) => "&" + v.toString(16).toUpperCase().padStart(n, "0");

const MAIN = A("main_game_loop"), COLLIDE = A("is_collision"), LEVEL_END = A("not_end_of_level") - 5;
const code = h.rd(LEVEL_END, 5);
if (code[0] !== 0xa9 || code[1] !== 0x01 || code[2] !== 0x8d)
    h.die(`not LDA #1 : STA abs at ${hex(LEVEL_END)}: ${[...code].map((b) => hex(b, 2)).join(" ")}`);

let plots = [], holeStart = null;
h.onExec(A("plot_sprite"), () => {
    const c = h.cpu, sp = c.s;
    const ret = (c.readmem(0x100 + ((sp + 1) & 0xff)) | (c.readmem(0x100 + ((sp + 2) & 0xff)) << 8)) - 2;
    const sa = h.word(A("screen_address_low")), spr = h.word(A("sprite_address_low"));
    const off = sa - 0x3000;
    plots.push({ site: hex(ret), at: h.symAt(ret), col: (off % 640) >> 3, charRow: Math.floor(off / 640),
                 line: h.byte(A("row_in_group")), sprite: h.symAt(spr) || hex(spr) });
});
h.onExec(A("initialise_level"), () => { plots = []; holeStart = null; });   // a level's own plots only
h.onExec(A("plot_holes_loop"), () => {
    if (holeStart === null) holeStart = h.byte(A("position_table_offset"));
});

const pictures = [];
mkdirSync("build/course", { recursive: true });
mkdirSync(dirname(OUT), { recursive: true });
const snap = (kind) => {
    const s = state(h);
    const nv = h.byte(A("number_of_vertical_enemies"));
    const v = h.rd(A("vertical_enemies_x"), 3 * 8);
    const vertical = [];
    for (let i = 0; i < nv; i++) vertical.push({ x: v[3 * i], y: v[3 * i + 1], state: v[3 * i + 2] });
    const screen = h.rd(0x3000, 0x5000, "main");
    const file = `build/course/${String(s.level).padStart(2, "0")}-${kind}.bin`;
    writeFileSync(file, Uint8Array.from(screen));
    pictures.push({ kind, level: s.level, levelType: h.byte(A("level_type")), take: s.take,
                    holeStart, horizontal: { x: h.byte(A("horizontal_enemy_x")), y: h.byte(A("horizontal_enemy_y")) },
                    vertical, plots, screen: file });
    console.error(`level ${s.level} ${kind}: ${plots.length} plots, hole start ${holeStart}, ${nv} vertical`);
    plots = []; holeStart = null;
};
const runTo = async (addr) => {
    if ((await h.runTo(addr, 400_000_000)) === null) h.die(`never reached ${hex(addr)}`, h.gaveUp);
};

// Level 1: bootGame stopped at new_take, before initialise_level.
plots = []; holeStart = null;
await runTo(MAIN);
snap("first");
const seen = new Set();
for (;;) {
    const level = state(h).level;
    seen.add(level);
    // a crash, then the retake
    h.cpu.pc = COLLIDE;
    h.wr(A("take"), [1]);
    plots = []; holeStart = null;
    await runTo(MAIN);
    if (state(h).level !== level) h.die(`the retake of ${level} came back on ${state(h).level}`);
    snap("retake");
    // to the end of the last ground
    h.wr(A("player_x"), [0x4b]); h.wr(A("player_ground_y"), [0xe0]);
    h.wr(A("player_jump_state"), [0]); h.wr(A("player_x_velocity"), [0]);
    plots = []; holeStart = null;
    await runTo(LEVEL_END);
    const next = state(h).level;
    if (seen.has(next)) {
        snap("first");                      // the wrap: kept, to show it matches the first time
        break;
    }
    snap("first");
    await runTo(MAIN);
}

writeFileSync(OUT, JSON.stringify({ tool: "tools/capture_course.mjs", disc: "build/ddd.ssd", model: h.model,
                                     order: pictures.filter((p) => p.kind === "first").map((p) => p.level),
                                     pictures }, null, 1) + "\n");
console.log(JSON.stringify({ out: OUT, pictures: pictures.length,
                             levels: [...seen].length, order: pictures.filter((p) => p.kind === "first").map((p) => p.level) }));
process.exit(0);
