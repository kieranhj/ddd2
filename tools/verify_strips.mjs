// verify_strips.mjs - layer 4.2's oracle: four riders over the whole course, every strip's picture
// checked every field against an independent redraw, every screen write checked against the
// raster, the loop's rate and the field's cost measured.
//
//   node tools/verify_strips.mjs [--scenario same|mixed] [--fields N] [--plant] [--early]
//
// Boots sequel/build/ddd2.ssd (Model B, SHIFT+BREAK) and holds the players' accelerate keys,
// pressed by their measured internal numbers (Z 97, V 99, M 101, full stop 103; docs/done.md):
//   same    all four held from the start: the riders stay level, the densest stretches land on
//           all four strips at once - the worst case for the field's cost
//   mixed   P1 held throughout; P2 from field 300; P3 held 400 fields, let go 200, and so on;
//           P4 held to field 3000, let go 600 (it slows, decision 24), then held again
// It runs until every rider has stopped at the finish, or N fields.
//   - THE PICTURE. At every pass's end (`loop`), each strip's three character rows (7+7k to
//     9+7k) are compared with a model drawn from data/course.json's `course` at that strip's pos:
//     black; the ground's four lit lines green but for hole columns; each obstacle clipped; the
//     player's rider at column 12 over it all. The sprites are read out of build/ddd.ssd (DENIS3,
//     at build/ddd.symbols.json's addresses), and the riders' colour swap (decision 17: green
//     with yellow, cyan, magenta for players 2-4) is done here, not taken from the sequel's data.
//   - THE RASTER (decision 12). Every CPU write to &3000-&7FFF after the loop starts is checked:
//     a write to strip k's rows while the CRTC's character row counter is on those rows (and not
//     in the vertical adjust) is a tear.
//   - THE RATE. Passes of the loop (`new_field`) against fields (`frames`): one each.
//   - THE COST. Each strip's update (`strip_go` to `strip_done`), the key read (`keys_go` to
//     `keys_done`) and their sum per field.
// Exit 0: every rider at the finish, every field checked, 0 bytes wrong, 0 tearing writes, one
// pass a field; 1: anything else; 2: could not run.
import { readFileSync } from "node:fs";

import { open, readSymbols } from "./harness.mjs";

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i < 0 ? d : args[i + 1]; };
const SCENARIO = opt("--scenario", "mixed"), MAXF = parseInt(opt("--fields", "20000"), 10);
const PLANT = args.includes("--plant");
// --early: make T1's first fire 24 lines (a band) sooner (the LDA #LO/#HI(T1_FIRST) immediates at
// vs_count + 5 and + 10), so each strip is updated as the raster ENTERS its band - the oracle must
// then see tearing writes
const EARLY = args.includes("--early");
const ACCEL = [97, 99, 101, 103];
const held = {
    same: () => true,
    mixed: (p, f) => [true, f >= 300, f % 600 < 400, f < 3000 || f >= 3600][p],
}[SCENARIO];
if (!held) { console.error(`no scenario ${SCENARIO}`); process.exit(2); }

// ---- the model's inputs ----
const course = JSON.parse(readFileSync("data/course.json", "utf8"));
const NAMES = ["obstacle_one", "obstacle_two", "obstacle_three"];
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
// decision 17: player p's rider has green (2) swapped with SWAP[p]; pixel by pixel, MODE 2
const SWAP = [null, 3, 6, 5];
const pixels = (b) => [[7, 5, 3, 1], [6, 4, 2, 0]].map((bits) => bits.reduce((c, bit, i) => c | (((b >> bit) & 1) << (3 - i)), 0));
const byte = ([l, r]) => [7, 5, 3, 1].reduce((b, bit, i) => b | (((l >> (3 - i)) & 1) << bit), 0) |
                         [6, 4, 2, 0].reduce((b, bit, i) => b | (((r >> (3 - i)) & 1) << bit), 0);
const land = sprite("sprite_land_player");
const riders = SWAP.map((o) => Uint8Array.from(land, (b) => o === null ? b : byte(pixels(b).map((c) => (c === 2 ? o : c === o ? 2 : c)))));
const RCOL = 12, ROW = 640;

const model = (pos, p) => {
    const m = new Uint8Array(3 * ROW);
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
    put(riders[p], RCOL);
    return m;
};

// ---- the run ----
const h = await open({ name: "verify_strips", disc: "sequel/build/ddd2.ssd" });
const N = (n) => h.need(n);
const POSLO = N("pos_lo"), POSHI = N("pos_hi"), VEL = N("vel"), DONE = N("finished"), FRAMES = N("frames");
await h.boot({ field: FRAMES, fieldBytes: 2 });
if (EARLY) {
    const at = N("vs_count");
    if (h.byte(at + 4) !== 0xa9 || h.byte(at + 9) !== 0xa9) h.die("vs_count + 4 and + 9 are not LDA #");
    const t1 = (h.byte(at + 5) | (h.byte(at + 10) << 8)) - 24 * 64;
    h.wr(at + 5, [t1 & 255]); h.wr(at + 10, [t1 >> 8]);
}

let started = false, fields = 0, passes = 0, checked = 0, wrong = 0, firstWrong = null, tears = 0, firstTear = null;
let writes = 0, minGap = 99, t0 = 0, kt0 = 0, cur = null;
const fieldCost = [];
const stripCost = [[], [], [], []], keyCost = [];
h.onExec(N("new_field"), () => { started = true; passes++; cur = { strips: [0, 0, 0, 0], keys: 0 }; fieldCost.push(cur); });
h.onExec(N("strip_go"), () => { t0 = h.s.elapsedCycles; });
h.onExec(N("strip_done"), () => {
    const k = h.byte(N("strip")), c = h.s.elapsedCycles - t0;
    if (cur) cur.strips[k] = c;
    stripCost[k].push(c);
});
h.onExec(N("keys_go"), () => { kt0 = h.s.elapsedCycles; });
h.onExec(N("keys_done"), () => { const c = h.s.elapsedCycles - kt0; if (cur) cur.keys = c; keyCost.push(c); });
h.onWrite(0x3000, 0x7fff, (addr, val, ctx) => {
    if (!started) return false;
    writes++;
    const row = Math.floor((addr - 0x3000) / ROW);
    const k = Math.floor((row - 7) / 7);
    if (row < 7 || (row - 7) % 7 > 2 || k > 3) return false;
    const lo = 7 + 7 * k, hi = 9 + 7 * k;
    if (!ctx.adj && ctx.vc >= lo && ctx.vc <= hi) {
        tears++;
        if (!firstTear) firstTear = { field: fields, addr: "&" + addr.toString(16), strip: k, vc: ctx.vc, sc: ctx.sc, pc: "&" + ctx.pc.toString(16), at: h.symAt(ctx.pc) };
    } else if (!ctx.adj) {
        // how far ahead of its band the raster was, in character rows (wrapping at 39)
        const gap = (lo - ctx.vc + 39) % 39;
        minGap = Math.min(minGap, gap);
    }
    return false;
});
// the picture, at the end of each pass (the loop's top, after strip 3)
const stripsAt = (k) => 0x3000 + (7 + 7 * k) * ROW;
h.onExec(N("loop"), () => {
    if (!started) return;
    const pos = [0, 1, 2, 3].map((k) => h.byte(POSLO + k) | (h.byte(POSHI + k) << 8));
    for (let k = 0; k < 4; k++) {
        const got = h.rd(stripsAt(k), 3 * ROW, "main"), want = model(pos[k], k);
        for (let i = 0; i < want.length; i++) if (got[i] !== want[i]) {
            wrong++;
            if (!firstWrong) firstWrong = { field: fields, strip: k, pos: pos[k], row: 7 + 7 * k + Math.floor(i / ROW), col: (i % ROW) >> 3, line: i & 7, got: got[i], want: want[i] };
        }
    }
    checked++;
});

let pressed = [false, false, false, false];
const f0 = h.word(FRAMES, "main");
let allDone = false;
while (!allDone && fields < MAXF) {
    for (let p = 0; p < 4; p++) {
        const want = held(p, fields);
        if (want !== pressed[p]) { (want ? h.keyDownRaw : h.keyUpRaw)(ACCEL[p]); pressed[p] = want; }
    }
    if (PLANT && fields === 500) { h.wr(stripsAt(2) + 70 * 8 + 2, [0x3f], "main"); }
    await h.s.runFrames(1);
    fields++;
    allDone = [0, 1, 2, 3].every((k) => h.byte(DONE + k));
}
const elapsed = h.word(FRAMES, "main") - f0;

const stats = (a) => { const s = [...a].sort((x, y) => x - y); return { n: s.length, median: s[s.length >> 1], p99: s[Math.floor(0.99 * (s.length - 1))], max: s.at(-1) }; };
const totals = fieldCost.map((c) => c.keys + c.strips.reduce((a, b) => a + b, 0));
const worstField = fieldCost[totals.indexOf(Math.max(...totals))];
const finals = [0, 1, 2, 3].map((k) => ({ pos: h.byte(POSLO + k) | (h.byte(POSHI + k) << 8), done: h.byte(DONE + k) }));
const ok = allDone && checked > 0 && wrong === 0 && tears === 0 && Math.abs(passes - elapsed) <= 1;
h.finish({ scenario: SCENARIO, fields, elapsed_fields: elapsed, passes, checked, bytes_wrong: wrong, first_wrong: firstWrong,
           screen_writes: writes, tearing_writes: tears, first_tear: firstTear, closest_rows_ahead_of_band: minGap,
           finals, keys: stats(keyCost), strips: stripCost.map(stats), field_total: stats(totals), worst_field: worstField },
         ok, { samples: checked });
