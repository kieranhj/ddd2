// record_original.mjs - the original being played, as the behavioural reference for the sequel
// (PLAN.md step 2): a video with its sound, and the game's state at every pass of its main loop.
//
//   node tools/record_original.mjs [--fields 3000] [--skill A] [--out build/original_play]
//
// Writes OUT.mp4 (or OUT.video frames without ffmpeg), OUT.wav, and data/original_play.json: one
// row per `main_game_loop` pass - the field it ran in, the keys held, level, take, player_x,
// player_ground_y, jump state, velocity and its fraction, wages.
//
// THE RIDER is a script, not a person, so the run can be made again exactly:
//   - SHIFT (accelerate) is held throughout;
//   - SPACE (jump) and RETURN (brake) are pressed for one pass when the planner below says so.
// Unless --finite-takes, the take count is held (the disassembly's poke &1B51=&60), so a crash
// costs a take's clapperboard and respawn but never the game: the run reaches later levels.
// It plays well enough to cross levels, ground changes and holes, and badly enough to crash, so the
// recording shows the take, the clapperboard and the respawn as well.
import { mkdirSync, writeFileSync } from "node:fs";

import { bootGame, state, KEY } from "./ddd.mjs";
import { cropFor, startVideo, captureSound, writeWav, mux } from "./capture.mjs";

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i < 0 ? d : args[i + 1]; };
const FIELDS = parseInt(opt("--fields", "3000"), 10), SKILL = opt("--skill", "A");
const OUT = opt("--out", "build/original_play");
const FINITE = args.includes("--finite-takes");

const h = await bootGame("record_original", { skill: SKILL });
const s = h.s;
// The disassembly's poke for infinite takes (CLAUDE.md): an RTS where a crash takes a take away.
// A crash still happens, with its clapperboard and respawn; only the count stays. Checked first.
const TAKES = 0x1b51;
if (!FINITE) {
    const b = h.rd(TAKES, 3);
    if (b[0] !== 0xee || b[1] !== 0x15 || b[2] !== 0x0c) h.die("&1B51 is not INC take (EE 15 0C) in this build");
    h.wr(TAKES, [0x60]);
}
mkdirSync("data", { recursive: true });

const ROW = 640;
const screen = (a) => h.byte(a, "main");
// THE PLANNER. Each pass with the rider on the ground, the next HORIZON passes are simulated with
// the original's own rules (update_player, read from src/game.6502):
//   - x += velocity x 3 / 256 with its fraction, THEN SHIFT adds 3 to velocity (cap 250) - in the
//     air too;
//   - SPACE on the ground: the jump state is 2 after that pass, +1 a pass, 0 again at 30; the rider
//     is raised jump_offsets_table[state] lines (read from memory);
//   - RETURN sets velocity to 0, once a take (player_can_brake);
//   - at x &4B-&4D the rider moves to x 0 of the next ground.
// The world is the screen as it stands (moving enemies taken as standing still): a column is an
// obstacle if either obstacle row has a lit byte in it, a hole if its ground byte is unlit; the
// rider's own four columns are left out. A crash is an obstacle column under the rider while it is
// raised less than 16 lines, or a hole under its left column on the ground. The spider (levels
// 1-3, columns &28-&2B over the fourth ground, at y &BB + spider_y, 1..&1A and back a step a pass,
// moved before the rider) is simulated too: it hits a rider raised OFF lines when spider_y >=
// &14 - OFF. So are the two that move sideways: the horizontal enemy (update_rotating_colour_and_
// enemies: +1 column a pass, back to 0 at &4B, on its ground) and, from level 4, the helicopter
// (update_helicopter: -1 a pass; at 0 it goes back to &4C and up a ground, the top wrapping to &CF).
// Both move before the rider in a pass, and are left out of the screen's obstacle columns.
// The vertical enemies too (update_vertical_enemies): each at a fixed column, raised
// jump_offsets_table[state] lines, state +1 a pass from 1 to &1F and back to 1. Only the first
// five move (the loop stops at X = &0F); with more, the rest are never drawn.
// Each plan - do nothing, jump at pass k (k = 0..HORIZON), brake now - is scored by the passes it
// survives. It jumps now only if that beats doing nothing and every later jump (so it jumps as
// late as it can), and brakes only if that beats them all; otherwise it waits. (Tried and dropped,
// 2026-11-07: scoring a jump with the best second jump after it, and a 90-pass horizon. Both
// stopped on level 4 where this reaches level 7.)
const HORIZON = 48, OFFSETS = h.rd(h.need("jump_offsets_table"), 32);   // 32: the enemies read past 29
const lit = (g, c) => { const ob = 0x3000 + (7 + 7 * g) * ROW + c * 8;
                        for (let l = 0; l < 8; l++) if (screen(ob + l) || screen(ob + ROW + l)) return true;
                        return false; };
const gap = (g, c) => !screen(0x3000 + (9 + 7 * g) * ROW + c * 8);
const world = (st) => {
    const g0 = (st.ground - 0x38) / 0x38, spider = st.level < 4, copter = st.level >= 4;
    const hx = h.byte(h.need("horizontal_enemy_x")), hy = h.byte(h.need("horizontal_enemy_y"));
    const cx = h.byte(h.need("helicopter_x")), cy = h.byte(h.need("helicopter_y"));
    const vb = h.rd(h.need("vertical_enemies_x"), 15), vert = [];
    for (let i = 0; i < Math.min(5, h.byte(h.need("number_of_vertical_enemies"))); i++)
        vert.push({ x: vb[3 * i], y: vb[3 * i + 1], s: vb[3 * i + 2], g: (vb[3 * i + 1] - 0x38) / 0x38 });
    const grounds = [];
    for (let g = g0; g <= Math.min(3, g0 + 1); g++) {
        const ob = [], hole = [];
        for (let c = 0; c < 80; c++) {
            const mine = g === g0 && c >= st.x && c < st.x + 4;
            const web = spider && g === 3 && c >= 40 && c < 44;
            const amb = g === (hy - 0x38) / 0x38 && c >= hx && c < hx + 4;
            const heli = copter && c >= cx && c < cx + 4 && cy < 0x38 * (g + 1) + 16 && 0x38 * (g + 1) < cy + 16;
            const cop = vert.some((v) => v.g === g && c >= v.x && c < v.x + 4);
            ob.push(!mine && !web && !amb && !heli && !cop && lit(g, c)); hole.push(gap(g, c));
        }
        grounds[g] = { ob, hole };
    }
    return { g0, grounds, spider, copter, hx, hy, cx, cy, vert, sy: h.byte(h.need("spider_y")), down: h.byte(h.need("spider_direction")) === 0x80 };
};
// passes survived (HORIZON if all) with SPACE at the passes in `jumps` and RETURN at 0 if brake
const survive = (st, w, jumps, brake) => {
    let { x, frac, vel, jump } = st, g = w.g0, sy = w.sy, down = w.down;
    let { hx, cx, cy } = w;
    const vs = w.vert.map((v) => v.s);
    for (let n = 0; n < HORIZON; n++) {
        for (let i = 0; i < vs.length; i++) if (++vs[i] === 0x20) vs[i] = 1;
        if (w.hy && ++hx === 0x4b) hx = 0;
        if (w.copter && --cx === 0) { cx = 0x4c; cy = (cy - 0x38) & 255; if (cy === 0xef) cy = 0xcf; }
        if (w.spider) { if (down) { if (++sy === 0x1a) down = false; } else if (--sy === 1) down = true; }
        const t = frac + vel * 3; frac = t & 255; x += t >> 8;
        vel = Math.min(250, vel + 3);
        if (x >= 0x4b) { x = 0; g++; }
        if (jump === 0 && jumps.includes(n)) jump = 1;
        if (jump) { if (++jump === 30) jump = 0; }
        if (brake && n === 0) vel = 0;
        const W = w.grounds[g];
        if (!W) return HORIZON;                       // beyond what the screen shows
        const off = OFFSETS[jump];
        for (let c = x; c < x + 4 && c < 80; c++) if (W.ob[c] && off < 16) return n;
        if (jump === 0 && W.hole[x]) return n;
        if (w.spider && g === 3 && x + 4 > 40 && x < 44 && sy >= 0x14 - off) return n;
        const top = 0x38 * (g + 1) - off;
        if (w.hy && g === (w.hy - 0x38) / 0x38 && x + 4 > hx && x < hx + 4 && off < 16) return n;
        if (w.copter && x + 4 > cx && x < cx + 4 && cy < top + 16 && top < cy + 16) return n;
        for (let i = 0; i < vs.length; i++) {
            const v = w.vert[i], vy = v.y - OFFSETS[vs[i]];
            if (v.g === g && x + 4 > v.x && x < v.x + 4 && vy < top + 16 && top < vy + 16) return n;
        }
    }
    return HORIZON;
};
// What the rider does this pass: "SPACE", "RETURN" or null.
const decide = (st) => {
    if (st.jump !== 0) return null;
    const g = (st.ground - 0x38) / 0x38;
    if (!Number.isInteger(g) || g < 0 || g > 3) return null;
    const w = world(st);
    const none = survive(st, w, [], false);
    if (none === HORIZON) return null;
    const now = survive(st, w, [0], false);
    let later = 0;
    for (let k = 1; k < HORIZON; k++) later = Math.max(later, survive(st, w, [k], false));
    const brake = h.byte(h.need("player_can_brake")) ? survive(st, w, [], true) : -1;
    if (now > none && now > later && now >= brake) return "SPACE";
    if (brake > none && brake > later && brake > now) return "RETURN";
    return null;
};

const rows = [], kills = [];
h.onExec(h.need("kill_player"), () => { kills.push(field); });
let field = 0, held = null;
h.keyDownRaw(KEY.SHIFT);
h.onExec(h.need("main_game_loop"), () => {
    const st = state(h);
    if (held) { h.keyUpRaw(KEY[held]); held = null; }
    else if ((held = decide(st))) h.keyDownRaw(KEY[held]);
    rows.push({ field, keys: held ? "SHIFT+" + held : "SHIFT", ...st });
});

const sound = captureSound(s);
const video = await startVideo(s, OUT + ".video.mp4", { crop: cropFor(s, "mos"), title: "Dare Devil Denis (1984) - the original, scripted rider" });
for (; field < FIELDS; field++) {
    const r = await s.runFrames(1);
    if (!r.completed) h.die(`field ${field} did not complete`, { where: h.where() });
    const last = rows[rows.length - 1];
    await video.frame(last ? `field ${field}  level ${last.level}  take ${last.take}  wages ${last.wages}` : `field ${field}`);
}
await video.finish();
const wav = writeWav(OUT + ".wav", [sound.finish()], sound.rate);
let path = video.path;
if (video.format === "mp4") path = mux(video.ffmpeg, OUT + ".video.mp4", wav.path, OUT + ".mp4") || OUT + ".mp4";

writeFileSync("data/original_play.json", JSON.stringify({
    tool: "tools/record_original.mjs", disc: "build/ddd.ssd", model: h.model, skill: SKILL, fields: FIELDS, takes: FINITE ? "finite" : "infinite (&1B51=&60)",
    rider: "SHIFT held; SPACE or RETURN for one pass when a 48-pass look-ahead on the screen says so (the planner in the tool)",
    kills, passes: rows }) .replace(/\},\{/g, "},\n{") + "\n");
const crashes = kills.length;
const levels = [...new Set(rows.map((r) => r.level))];
h.finish({ video: path, frames: video.frames, wav: wav.path, passes: rows.length, levels, crashes, kills,
           last: rows[rows.length - 1] }, rows.length > 0 && video.frames === FIELDS, { samples: rows.length });
