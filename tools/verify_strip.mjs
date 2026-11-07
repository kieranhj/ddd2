// verify_strip.mjs - layer 4.1's oracle: strip 0 ridden over the whole course, every field's
// picture checked against an independent redraw, and every field's cost measured.
//
//   node tools/verify_strip.mjs [--every 1] [--fields N] [--plant]
//
// Boots sequel/build/ddd2.ssd (Model B, SHIFT+BREAK), holds SHIFT, and runs until strip 0 has
// stopped at the finish (or N fields). At each `frame_end` (every --every fields):
//   - THE PICTURE. Strip 0's obstacle rows and ground row (character rows 7-9) are compared with
//     a model drawn from data/course.json's `course` at the strip's pos (read from `pos_lo/hi`):
//     black; the ground's four lit lines green except hole columns; each obstacle's sprite at
//     x - pos, clipped; the land rider at column 12 over it all. The sprites are read out of
//     build/ddd.ssd (DENIS3) at build/ddd.symbols.json's addresses, NOT out of the sequel's data.
//   - THE STILL STRIPS. Strips 1-3, rows 7+7k to 9+7k, must not change from the first field.
//   - THE COST. Cycles from `frame_start` to `frame_end` (the key read and the four strips'
//     update, MOS interrupts that land inside included), and strip 0's own update alone (from
//     `strip_loop` with X = 0 to X = 1), with the pos, the velocity and the objects on screen.
// Exit 0: strip 0 reached the finish, every field checked, 0 bytes wrong; 1: a byte differs, or
// it never got there; 2: could not run.
import { readFileSync } from "node:fs";

import { open, readSymbols } from "./harness.mjs";

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i < 0 ? d : args[i + 1]; };
const EVERY = parseInt(opt("--every", "1"), 10), MAXF = parseInt(opt("--fields", "20000"), 10);
// --plant: write one wrong byte into strip 0 and one into strip 2 at field 500, to see it fail
const PLANT = args.includes("--plant");

// ---- the model's inputs: the course, and the original's sprites from the original's disc ----
const course = JSON.parse(readFileSync("data/course.json", "utf8"));
const TYPES = ["land", "sea", "snow"], NAMES = ["obstacle_one", "obstacle_two", "obstacle_three"];
const typeOf = Object.fromEntries(course.levels.map((L) => [L.level, L.type]));
const img = readFileSync("build/ddd.ssd");
let denis3 = null;
for (let i = 0; i < img[256 + 5] / 8; i++) {
    if (img.subarray(8 + i * 8, 15 + i * 8).toString("latin1").trimEnd() !== "DENIS3") continue;
    const e = img.subarray(256 + 8 + i * 8, 256 + 16 + i * 8);
    const len = e[4] | (e[5] << 8) | (((e[6] >> 4) & 3) << 16), sec = e[7] | ((e[6] & 3) << 8);
    denis3 = img.subarray(sec * 256, sec * 256 + len);
}
const orig = readSymbols("build/ddd.symbols.json");
const symOf = (n) => { const v = orig.found.get(n); if (!v) throw new Error(`${n} not in build/ddd.symbols.json`); return (v.find((x) => x.exact) || v[0]).value; };
const sprite = (name) => { const a = symOf(name) - 0x0e00; return denis3.subarray(a, a + 64); };
const objects = course.course.map((o) => o.type === "obstacle"
    ? { x: o.x, w: 4, spr: sprite(`sprite_${typeOf[o.level]}_${NAMES[o.sprite - 1]}`) }
    : { x: o.x, w: o.width, hole: true });
const RIDER = sprite("sprite_land_player"), RCOL = 12, ROW = 640;

const model = (pos) => {
    const m = new Uint8Array(3 * ROW);                         // rows 7, 8, 9 of strip 0
    for (let c = 0; c < 80; c++) for (let l = 0; l < 4; l++) m[2 * ROW + c * 8 + l] = 0x0c;
    const put = (spr, c0) => {
        for (let c = 0; c < 4; c++) {
            const sc = c0 + c;
            if (sc < 0 || sc > 79) continue;
            for (let l = 0; l < 16; l++) m[(l >> 3) * ROW + sc * 8 + (l & 7)] = spr[l * 4 + c];
        }
    };
    for (const o of objects) {
        const c0 = o.x - pos;
        if (c0 + o.w <= 0 || c0 >= 80) continue;
        if (o.hole) { for (let c = Math.max(0, c0); c < Math.min(80, c0 + o.w); c++) for (let l = 0; l < 4; l++) m[2 * ROW + c * 8 + l] = 0; }
        else put(o.spr, c0);
    }
    put(RIDER, RCOL);
    return m;
};

// ---- the run ----
const h = await open({ name: "verify_strip", disc: "sequel/build/ddd2.ssd" });
const START = h.need("frame_start"), END = h.need("frame_end");
const POSLO = h.need("pos_lo"), POSHI = h.need("pos_hi"), VEL = h.need("vel"), DONE = h.need("done");
await h.boot({ field: h.need("frames"), fieldBytes: 2 });
const SHIFT = 0;
h.keyDownRaw(SHIFT);

const STRIP0 = 0x3000 + 7 * ROW;
const still = [1, 2, 3].map((k) => ({ k, a: 0x3000 + (7 + 7 * k) * ROW, ref: null }));
let t0 = 0, ts = 0, own = 0, fields = 0, checked = 0, wrong = 0, firstWrong = null, done = false;
const costs = [];
h.onExec(START, () => { t0 = h.s.elapsedCycles; });
// strip 0's own update: from strip_loop with X = 0 to strip_loop with X = 1
h.onExec(h.need("strip_loop"), () => {
    const x = h.cpu.x;
    if (x === 0) ts = h.s.elapsedCycles; else if (x === 1) own = h.s.elapsedCycles - ts;
});
h.onExec(END, () => {
    const cyc = h.s.elapsedCycles - t0;
    const pos = h.byte(POSLO) | (h.byte(POSHI) << 8);
    const onScreen = objects.filter((o) => o.x - pos + o.w > -1 && o.x - pos < 80).length;
    costs.push({ cyc, own, pos, vel: h.byte(VEL), onScreen });
    if (fields % EVERY === 0) {
        const got = h.rd(STRIP0, 3 * ROW, "main"), want = model(pos);
        let w = 0;
        for (let i = 0; i < want.length; i++) if (got[i] !== want[i]) { w++; if (!firstWrong) firstWrong = { field: fields, pos, row: 7 + Math.floor(i / ROW), col: (i % ROW) >> 3, line: i & 7, got: got[i], want: want[i] }; }
        for (const s of still) {
            const b = h.rd(s.a, 3 * ROW, "main");
            if (!s.ref) s.ref = b;
            else for (let i = 0; i < b.length; i++) if (b[i] !== s.ref[i]) { w++; if (!firstWrong) firstWrong = { field: fields, strip: s.k, i }; }
        }
        wrong += w; checked++;
    }
    fields++;
    if (PLANT && fields === 500) { h.wr(STRIP0 + 79 * 8 + 3, [0x3f], "main"); h.wr(still[1].a + 40 * 8, [0x3f], "main"); }
    if (h.byte(DONE)) done = true;
});
while (!done && fields < MAXF) await h.s.runFrames(50);
h.keyUpRaw(SHIFT);

const moving = costs.filter((c, i) => i && c.pos !== costs[i - 1].pos);
const still0 = costs.filter((c, i) => i && c.pos === costs[i - 1].pos);
const worst = moving.reduce((a, c) => (c.cyc > a.cyc ? c : a), { cyc: 0 });
const worstOwn = moving.reduce((a, c) => (c.own > a.own ? c : a), { own: 0 });
const sorted = moving.map((c) => c.own).sort((a, b) => a - b), pct = (p) => sorted[Math.floor(p * (sorted.length - 1))];
const byN = {};
for (const c of moving) { const b = (byN[c.onScreen] ||= { n: 0, max: 0, sum: 0 }); b.n++; b.sum += c.own; b.max = Math.max(b.max, c.own); }
for (const k in byN) { byN[k].mean = Math.round(byN[k].sum / byN[k].n); delete byN[k].sum; }
h.finish({ fields, checked, bytes_wrong: wrong, first_wrong: firstWrong, reached_finish: done,
           final_pos: costs.at(-1)?.pos, finish: course.finish,
           cost_moving: { fields: moving.length, worst_field: worst, worst_strip0: worstOwn,
                          strip0_median: pct(0.5), strip0_p99: pct(0.99) },
           cost_still_max: Math.max(0, ...still0.map((c) => c.cyc)),
           strip0_cost_by_objects_on_screen: byN },
         done && wrong === 0 && checked > 0, { samples: checked });
