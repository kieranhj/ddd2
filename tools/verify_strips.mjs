// verify_strips.mjs - the sequel's oracle (layers 4.2-4.3): four riders over the whole course,
// every strip's picture checked every field against an independent model of the game, every
// screen write checked against the raster, the loop's rate and the field's cost measured.
//
//   node tools/verify_strips.mjs [--scenario play|level] [--players 1111] [--fields N] [--plant]
//                                [--early] [--no-holes] [--no-vert]
//
// Boots sequel/build/ddd2.ssd (Model B, SHIFT+BREAK) and plays all four riders by their keys,
// pressed by their measured internal numbers (accelerate, jump, brake; decision 49:
// SHIFT Z X | G H J | , . / | keypad 4 5 6, on a Model B cursor LEFT DOWN RIGHT):
//   play    P1 a planner: accelerate held, jumps when riding on would crash and jumping would not
//           P2 the planner blind to holes: rides into them (from level 5)
//           P3 eager: jumps whenever anything is within 40 fields - lands on obstacles, and in
//              the air into their fronts
//           P4 the planner, but lets go of accelerate 200 fields in every 600 (decision 24), and
//              holds the brake from 240 until 120, accelerate mostly held too: a dead stop,
//              any time (decisions 48, 54)
//   level   all four held level, no jumps: as layer 4.2's worst case, until the clock is out
// It runs until the game ends - the clock out (120 s, decision 55) or every rider at the finish -
// or N fields; then through the end's 250-field wait every strip must still be its last picture,
// and the title must come back; the title's texts and the winner's must be the MOS ROM's font.
//
// --video OUT.mp4 [--video-from F] [--video-fields N]: also a clip of fields F to F+N (default
// 1150, 750: P1-P3's crash at level 4, P2 and P3 into holes at level 5).
//
// THE MODEL is the game's rules re-made from the original (src/game.6502, docs/sequel.md) and
// the decisions, not from the sequel's source or its data: the course from data/course.json, the
// sprites out of build/ddd.ssd's DENIS3 (at build/ddd.symbols.json's addresses), recoloured here
// (decision 17); jump_offsets_table out of DENIS3 too. Per field, per rider:
//   riding   pos += vel/256; the brake stops it dead, any time (decisions 48, 54) - else vel +1
//            with accelerate (to 250), -1 without (decision 24); the finish (decision 22); wages
//            10 x the level at each ground's end, 5 at each floor marker (decision 59); the jump - from the ground with jump held, 84 fields, the height the
//            table at state 1 + n/3, interpolated, rounded half up; the picture - the course at
//            pos, the rider over it at column 12; then the collisions, pixel-perfect (decision
//            53; `touch`): its sprite against each obstacle's and enemy's own, the ground under
//            its bottom line for a hole, a gold touched taken
//   crash    the explosion at the rider; the dead rider, from 5 columns right, a column every 3
//            fields for 14 passes at jump_offsets_table[19 + pass] (interpolated), rubbed out
//            where it was when it moves; then frames one and two, 10 fields each, 7 times, 18
//            columns right (tools/measure_crash.mjs: 42 + 140 fields); then a respawn, always
//            (no takes: decision 55)
//   respawn  the next field the strip is black but its ground; the one after, standing at the
//            first course column past the crash with 16 columns clear of obstacles, holes
//            (decision 26) and the vertical enemies' columns (decision 56), drawn whole
//   clock    120 s from the first pass's field + 50, a second every 50 fields (the frame
//            counter's low byte, read where game_done reads it); shown in every block (decision 55)
// At the end of each pass (`loop`) each strip's window (character rows 4+7k to 9+7k) must equal
// the model's, byte for byte; and each crash the game makes (`crash_at`) must be the model's, on
// the same field, for the same reading (`cause`).
//   THE RASTER (decision 12). A CPU write to strip k's window while the CRTC's character row
//   counter is on it (and not in the vertical adjust) is a tear.
//   THE RATE. Passes of the loop (`new_field`) against fields (`frames`): one each.
//   THE COST. Each strip's update (`strip_go` to `strip_done`), the key read, their sum a field.
// Exit 0: the game ended (the clock or the finish), every field checked, 0 bytes wrong, every
// crash agreed, crashes seen of each kind the course can give (an obstacle, an enemy, a hole), a
// respawn; 0 tearing writes; one pass a field. 1: anything else; 2: could not run.
import { readFileSync } from "node:fs";

import { cropFor, startVideo } from "./capture.mjs";
import { open, readSymbols } from "./harness.mjs";
import { resolveJsbeebSrc } from "./jsbeeb_src.mjs";
import { join } from "node:path";

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i < 0 ? d : args[i + 1]; };
const SCENARIO = opt("--scenario", "play"), MAXF = parseInt(opt("--fields", "30000"), 10);
const PLANT = args.includes("--plant");
// --early: T1's first fire 24 lines (3 rows) sooner (the LDA #LO/#HI(T1_FIRST) immediates at
// vs_count + 5 and + 10): each strip is then updated while the raster is still in its window
const EARLY = args.includes("--early");
// --no-holes: the game's hole check never crashes (its BEQ cl_hit at cl_ground + 10 made to fall
// through) - the crashes must then disagree with the model's
const NOHOLES = args.includes("--no-holes");
// --no-vert: the respawn's check for the vertical enemies (place's rs_found) skipped - a respawn
// the model moves past one must then disagree (decision 56)
const NOVERT = args.includes("--no-vert");
// --model Master: the same run on a Master 128 (MOS 3.20), whose font is not at &C000 (BUGS.md #3)
const MODEL = opt("--model", "B-DFS1.2");
// the keys (decision 49; measured in jsbeeb): player 4 on the Master's keypad, else the cursor keys
const MASTER = /master/i.test(MODEL);
const ACCEL = [0, 83, 102, MASTER ? 122 : 25], JUMP = [97, 84, 103, MASTER ? 123 : 41], BRAKE = [66, 69, 104, MASTER ? 26 : 121];
const JOINED = opt("--players", "1111").split("").map((c) => c === "1");
if (JOINED.length !== 4 || !JOINED.some(Boolean)) { console.error("--players four of 0/1"); process.exit(2); }
// --join P:F,...: player P (1-4), not joined on the title, presses accelerate at field F of the
// game and plays from then on (decision 51: a player joins mid-game)
const LATE = [undefined, undefined, undefined, undefined];
for (const j of (opt("--join", "") || "").split(",").filter(Boolean)) {
    const [p, f] = j.split(":").map(Number);
    if (!(p >= 1 && p <= 4) || JOINED[p - 1] || !(f >= 0)) { console.error("--join P:F, P a player not in --players"); process.exit(2); }
    LATE[p - 1] = f;
}
const VIDEO = opt("--video", null), VFROM = parseInt(opt("--video-from", "1150"), 10), VN = parseInt(opt("--video-fields", "750"), 10);
if (!["play", "level"].includes(SCENARIO)) { console.error(`no scenario ${SCENARIO}`); process.exit(2); }

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
const bytesAt = (name, n) => { const a = symOf(name) - 0x0e00; return denis3.subarray(a, a + n); };
const sprite = (name) => bytesAt(name, 64);            // the original's: row by row, 4 bytes a line
const JT = [...bytesAt("jump_offsets_table", 34)];
const FINISH = course.finish, RIDER = 12, ROW = 640, SKY = 24, LEVEL = 4 * 76;
const CLOCK = 120;                                     // seconds (decision 55)
const objects = course.course.map((o) => o.type === "obstacle"
    ? { x: o.x, w: 4, spr: sprite(`sprite_${typeOf[o.level]}_${NAMES[o.sprite - 1]}`) }
    : { x: o.x, w: o.width, hole: true });
const obstAt = new Int32Array(FINISH + 200).fill(-1), holeAt = new Uint8Array(FINISH + 200);
objects.forEach((o, i) => { for (let c = o.x; c < o.x + o.w; c++) { if (o.hole) holeAt[c] = 1; else obstAt[c] = i; } });
// decision 17: player p's rider (and dead rider) has green (2) swapped with SWAP[p]; MODE 2
const SWAP = [null, 3, 6, 5];
const pixels = (b) => [[7, 5, 3, 1], [6, 4, 2, 0]].map((bits) => bits.reduce((c, bit, i) => c | (((b >> bit) & 1) << (3 - i)), 0));
const byte = ([l, r]) => [7, 5, 3, 1].reduce((b, bit, i) => b | (((l >> (3 - i)) & 1) << bit), 0) |
                         [6, 4, 2, 0].reduce((b, bit, i) => b | (((r >> (3 - i)) & 1) << bit), 0);
const recolour = (spr, o) => Uint8Array.from(spr, (b) => o === null ? b : byte(pixels(b).map((c) => (c === 2 ? o : c === o ? 2 : c))));
const TYPES = ["land", "sea", "snow"];
const RIDERS = SWAP.map((o) => TYPES.map((t) => recolour(sprite(`sprite_${t}_player`), o)));
// level types (layer 4.4): level L (from 1) is (L - 1) MOD 3, 304 columns each; the ground in its
// type's colour (ground_colours_table, both pixels; decision 30: blue at sea, always)
const typeAt = (x) => Math.floor(x / LEVEL) % 3;
const both = (c) => [0, 1, 2, 3].reduce((b, i) => b | (((c >> i) & 1) << (2 * i + 1)) | (((c >> i) & 1) << (2 * i)), 0);
const GROUNDS = [...bytesAt("ground_colours_table", 3)].map(both);
// the rotating colour: logical 8 stepped once a pass, VDU 19,8,rotating_colour_table[i] (&10 is 0)
const C8 = [...bytesAt("rotating_colour_table", 14)].map((v) => 0x80 | ((v & 15) ^ 7));
const riderOf = (r) => RIDERS[r.p][typeAt(r.pos + RIDER)];
// the enemies (layer 4.4; initialise_level, update_rotating_colour_and_enemies): per level, the
// horizontal enemy on its second ground (column 76 of the level), x 0-74 and round, a column a
// pass of 3 fields; the first five vertical enemies at 76 x ground + x, jump_offsets_table[state]
// lines up, the state stepping 1-31 a pass from the one after its start (interpolated in thirds,
// as the jump). Decision 28: a level's clock starts the first field it is on a strip's screen,
// and runs every field after. Drawn whole, the level at the left edge's first, the horizontal
// before the vertical, the rider over them.
// decision 44: out x 0-74, then back 73 ... 1 facing left (the sprite mirrored: each line's
// columns reversed, each byte's two pixels swapped), a 148-pass round
const mirror = (spr) => Uint8Array.from({ length: 64 }, (_, i) => { const [l, r] = pixels(spr[(i & ~3) + 3 - (i & 3)]); return byte([r, l]); });
const HZ = TYPES.map((t) => sprite(`sprite_${t}_horizontal_enemy`)), HZM = HZ.map(mirror), VT = TYPES.map((t) => sprite(`sprite_${t}_vertical_enemy`));
const VEN = course.levels.map((L) => L.vertical.slice(0, 5).map((v) => ({ off: 76 * v.ground + v.x, q0: 3 * (v.state % 31) })));
const VCOL = VEN.flatMap((vs, l) => vs.map((v) => l * LEVEL + v.off));     // every vertical enemy's course column
const vheight = (q) => { const s = Math.floor(q / 3), f = q % 3, a = JT[s + 1], b = JT[(s + 1) % 31 + 1]; return Math.floor((6 * a + (b - a) * f * 2 + 3) / 6); };
function enemies(r) {
    const out = [], l0 = Math.floor(r.pos / LEVEL);
    for (const l of [l0, l0 + 1]) {
        if (!r.clk.has(l)) continue;
        const f = r.clk.get(l), S = l * LEVEL, ty = l % 3;
        const q = Math.floor(f / 3) % 148;
        out.push({ x: S + 76 + (q < 75 ? q : 148 - q), t: SKY, spr: q < 75 ? HZ[ty] : HZM[ty] });
        for (const v of VEN[l]) out.push({ x: S + v.off, t: SKY - vheight((v.q0 + f) % 93), spr: VT[ty] });
        const sp = r.spec.get(l);                      // the spider or the helicopter, the gold, the 80
        if (l < 3) out.push({ x: S + 3 * 76 + 40, t: Math.max(0, sp.y - 13), spr: SPIDER });
        else out.push({ x: S + 76 * sp.g + sp.x, t: SKY - 17, spr: HELI });
        for (const g of sp.golds) if (g.t) out.push({ x: S + g.off, t: g.t, spr: GOLD, gold: g, sp, l });
        if (sp.eighty) out.push({ x: S + sp.off80, t: 0, spr: EIGHTY });
    }
    return out;
}
// THE SPIDER, THE HELICOPTER, THE GOLD (layer 4.5c; update_spider, update_helicopter, update_gold,
// collect_gold; decisions 36, 38), a level's, stepped a pass (3 fields) from its clock's start:
//   the spider (levels 1-3): y 1-26 and back from 1 going down, at column 40 of the fourth ground,
//     its top y - 13 into the band but no higher than its top
//   the helicopter: x &4C down a column a pass on the fourth ground, then the third ... the first,
//     then the fourth again (the next gold's index back to the level number); 17 lines above
//   the gold: none falling, the helicopter's x = x_positions_table[next], not over the second
//     ground, and 6 columns on no obstacle's bottom line lit and no hole (among the objects not
//     gone off the left): one drops 4 columns on from line 7, a line a pass to 24; then next + 1
//     (40 back to 1). Two at most; a third replaces the one lying longer
//   the 80: 17 passes, at the band's top over where the rider was when it took the gold
const SPIDER = sprite("sprite_spider"), HELI = sprite("sprite_helicopter"), GOLD = sprite("sprite_gold"), EIGHTY = sprite("sprite_eighty");
const XPOS = [...bytesAt("x_positions_table", 40)];
const newSpec = (l) => ({ y: 1, down: true, x: 76, g: 3, goff: l + 1, golds: [{ t: 0, off: 0 }, { t: 0, off: 0 }], old: 0, eighty: 0, off80: 0 });
function courseClear(r, c) {                           // no obstacle's bottom line, no hole, at c
    for (const o of objects) {
        if (o.x + o.w <= r.pos) continue;              // gone off the left
        if (o.x > c) return true;
        if (c < o.x + o.w) return o.hole ? false : o.spr[15 * 4 + (c - o.x)] === 0;
    }
    return true;
}
function specPass(r, l) {
    const sp = r.spec.get(l), S = l * LEVEL;
    if (l < 3) {
        if (sp.down) { if (++sp.y === 26) sp.down = false; } else if (--sp.y === 1) sp.down = true;
    } else {
        if (--sp.x === 0) { sp.x = 76; if (--sp.g < 0) { sp.g = 3; sp.goff = l + 1; } }
        let falling = false;
        for (const g of sp.golds) if (g.t && g.t < SKY) { falling = true; if (++g.t === SKY) sp.goff = sp.goff + 1 === 40 ? 1 : sp.goff + 1; }
        if (!falling && sp.x === XPOS[sp.goff] && sp.g !== 1 && courseClear(r, S + 76 * sp.g + sp.x + 6)) {
            const k = !sp.golds[0].t ? 0 : !sp.golds[1].t ? 1 : sp.old;
            sp.old = 1 - k;
            sp.golds[k] = { t: SKY - 17, off: 76 * sp.g + sp.x + 4 };
        }
    }
    if (sp.eighty) sp.eighty--;
}
// wages (layer 4.5a; is_end_of_ground): at the end of each ground (the rider's column at a
// multiple of 76) 10 x that ground's level; nothing for grounds a respawn passes (decision 34)
// and 5 at each floor marker the rider's left column reaches (course column 20k + 19; decision 59)
function wageCheck(r) {
    if (r.pos + RIDER >= r.wg) { r.wages = (r.wages + 10 * (Math.floor(r.gcount / 4) + 1)) % 1000000; r.wg += 76; r.gcount++; }
    if ((r.pos + RIDER) % 20 === 19) r.wages = (r.wages + 5) % 1000000;
}
function skipGrounds(r) { while (r.pos + RIDER >= r.wg) { r.wg += 76; r.gcount++; } }
// the status line (decisions 13, 33, 41): row 2, a block of 20 byte columns a player in its colour,
// wages at columns 1-12 and the game's clock at 14-19 in 3 x 7 digits, 4 pixels wide (decision 55)
const DIGITS = [[7, 5, 5, 5, 5, 5, 7], [2, 6, 2, 2, 2, 2, 7], [7, 1, 1, 7, 4, 4, 7], [7, 1, 1, 7, 1, 1, 7], [5, 5, 5, 7, 1, 1, 1],
                [7, 4, 4, 7, 1, 1, 7], [7, 4, 4, 7, 5, 5, 7], [7, 1, 1, 1, 1, 1, 1], [7, 5, 5, 7, 5, 5, 7], [7, 5, 5, 7, 1, 1, 7]];
const PCOL = [2, 3, 6, 5].map(both);
function statusRow({ blocks: snap, clock }) {
    const w = new Uint8Array(ROW);
    snap.forEach(({ wages }, p) => {
        if (!snap[p].shown) return;                    // no block for a player not playing (yet)
        const L = PCOL[p] & 0xaa, R = PCOL[p] & 0x55;
        const digit = (d, col) => DIGITS[d].forEach((g, y) => { w[col * 8 + y] = (g & 4 ? L : 0) | (g & 2 ? R : 0); w[col * 8 + 8 + y] = g & 1 ? L : 0; });
        String(wages).padStart(6, "0").split("").forEach((ch, i) => digit(+ch, 20 * p + 1 + 2 * i));
        String(clock).padStart(3, "0").split("").forEach((ch, i) => digit(+ch, 20 * p + 14 + 2 * i));
    });
    return w;
}
// (a player who joined mid-game: its block from its join's crash end, cu_take)
const snapshot = () => ({ clock, blocks: riders.map((r) => ({ wages: r.wages, shown: r.phase !== 4 && r.block })) });
const clocks = (r) => { for (const [l, f] of r.clk) { r.clk.set(l, f + 1); if ((f + 1) % 3 === 0) specPass(r, l); } };
function startVisible(r) {
    const l0 = Math.floor(r.pos / LEVEL);
    for (const l of [l0, l0 + 1]) if (l < course.levels.length && l * LEVEL <= r.pos + 79 && !r.clk.has(l)) { r.clk.set(l, 0); r.spec.set(l, newSpec(l)); }
}
// the picture while riding: the course, the enemies, the rider
function riding(r) {
    const w = picture(r.pos);
    for (const e of enemies(r)) putClip(w, e.spr, e.x - r.pos, e.t);
    put(w, riderOf(r), RIDER, r.t);
    return w;
}
const DEAD = SWAP.map((o) => [recolour(sprite("sprite_dead_player_one"), o), recolour(sprite("sprite_dead_player_two"), o)]);
const EXPLOSION = sprite("sprite_explosion"), BLANK = new Uint8Array(64);
// the jump: the table at state s3/3 (thirds), interpolated, rounded half up
const height = (s3) => { const s = Math.floor(s3 / 3), f = s3 % 3; return Math.floor((6 * JT[s] + (JT[s + 1] - JT[s]) * f * 2 + 3) / 6); };
const JUMP_FIELDS = 84, CRASH_FLY = 42, CRASH_ALL = 42 + 140;

// ---- the model ----
// the course's own byte at window (column c, line L) of a strip at pos: sky, obstacle, ground
function bg(pos, c, L) {
    const x = pos + c;
    if (L < SKY) return 0;
    if (L < SKY + 16) { const i = obstAt[x]; return i < 0 ? 0 : objects[i].spr[(L - SKY) * 4 + (x - objects[i].x)]; }
    return (L - SKY - 16) < 4 && !holeAt[x] ? groundAt(x) : 0;
}
// the ground's lit byte at course column x: its level's colour, but yellow (logical 3) at every
// course column 20k + 19 (decision 45: markers, four on the screen)
const MARK = both(3);
const groundAt = (x) => (x % 20 === 19 ? MARK : GROUNDS[typeAt(x)]);
// the picture: a window, 6 character rows
const at = (c, L) => (L >> 3) * ROW + c * 8 + (L & 7);
function picture(pos) {
    const w = new Uint8Array(6 * ROW);
    for (let c = 0; c < 80; c++) for (let L = SKY; L < 48; L++) w[at(c, L)] = bg(pos, c, L);
    return w;
}
function put(w, spr, c0, t) {                          // a 16-line sprite, whole, top at line t
    for (let c = 0; c < 4; c++) for (let l = 0; l < 16; l++) w[at(c0 + c, t + l)] = spr[l * 4 + c];
}
function putClip(w, spr, c0, t) {                      // the same, but only its columns on the screen
    for (let c = 0; c < 4; c++) if (c0 + c >= 0 && c0 + c < 80) for (let l = 0; l < 16; l++) w[at(c0 + c, t + l)] = spr[l * 4 + c];
}
// THE COLLISIONS (decision 53): pixel-perfect, the rider's sprite against each thing's own, not
// the picture. On the ground: a hole (5) when no lit pixel of its bottom line has a lit ground
// pixel under it (the planner's blind rider sees ground everywhere). Then a crash on an obstacle
// (1) or an enemy - the spider and the helicopter too - (2) when a pixel is lit in both; a gold
// touched is taken there and then (gone, 80 wages, the 80 over the rider's left column), in the
// enemies' drawing order, until something crashes it; the 80 is only a score.
const lit2 = (s, o) => ((s & 0xaa) !== 0 && (o & 0xaa) !== 0) || ((s & 0x55) !== 0 && (o & 0x55) !== 0);
function touch(r, blind) {
    const R = riderOf(r), t = r.t;
    if (r.js === 0) {
        let foot = false;
        for (let c = 0; c < 4 && !foot; c++) foot = blind ? R[15 * 4 + c] !== 0 : lit2(R[15 * 4 + c], bg(r.pos, RIDER + c, SKY + 16));
        if (!foot) return 5;
    }
    for (let c = 0; c < 4; c++) {
        const x = r.pos + RIDER + c, i = obstAt[x];
        if (i < 0) continue;
        const o = objects[i];
        for (let l = 0; l < 16; l++) { const L = t + l; if (L >= SKY && L < SKY + 16 && lit2(R[l * 4 + c], o.spr[(L - SKY) * 4 + x - o.x])) return 1; }
    }
    for (const e of enemies(r)) {
        if (e.spr === EIGHTY) continue;
        let hit = false;
        for (let c = 0; c < 4 && !hit; c++) {
            const ec = RIDER + c - (e.x - r.pos);
            if (ec < 0 || ec > 3) continue;
            for (let l = 0; l < 16 && !hit; l++) { const el = t + l - e.t; hit = el >= 0 && el < 16 && lit2(R[l * 4 + c], e.spr[el * 4 + ec]); }
        }
        if (!hit) continue;
        if (e.spr !== GOLD) return 2;
        e.gold.t = 0; e.sp.eighty = 17; e.sp.off80 = r.pos + RIDER - e.l * LEVEL; r.wages = (r.wages + 80) % 1000000;
    }
    return 0;
}
// the start (flow.6502): level 1 (decision 57: skill A only), the strip's left edge at column 0,
// the rider at column 12
const newRider = (p) => ({ p, pos: 0, frac: 0, vel: 0, js: 0, t: SKY, phase: JOINED[p] ? 0 : 4, ct: 0, block: JOINED[p], finished: false,
                           crashT: 0, dead: null, w: null, cause: 0, clk: new Map(), spec: new Map(), wages: 0, wg: 76, gcount: 0 });
// one field of rider r; draw: keep its picture (r.w). Returns the crash's reading, or 0.
function step(r, accel, jump, draw, brake = false) {
    r.cause = 0;
    if (r.phase === 4) {                               // no one playing it: it stands still (decision 14),
        clocks(r);                                     // its enemies' clocks running (crash_update); accelerate
        if (accel)                                     // joins it (decision 51): at the course's start, at the crash's end
            Object.assign(r, { ...newRider(r.p), clk: r.clk, spec: r.spec, w: r.w, phase: 1, ct: CRASH_ALL, block: false });
        return 0;
    }
    if (r.phase === 0) {
        if (!r.finished) {
            r.frac += r.vel;
            const moved = r.frac >= 256;
            r.frac &= 255;
            if (brake) r.vel = 0;
            else r.vel = accel ? Math.min(r.vel + 1, 250) : Math.max(r.vel - 1, 0);
            if (moved) {
                r.pos++;
                if (r.pos >= FINISH - RIDER) { r.finished = true; r.vel = 0; }
                wageCheck(r);
            }
        }
        clocks(r);
        startVisible(r);
        if (r.js === 0) { if (jump) r.js = 1; } else if (++r.js === JUMP_FIELDS + 1) r.js = 0;
        r.t = SKY - (r.js ? height(3 + r.js) : 0);
        if (draw) r.w = riding(r);
        r.cause = touch(r, !draw && r.blind);
        if (r.cause) {
            r.phase = 1; r.ct = 0; r.vel = 0; r.js = 0; r.crashT = r.t; r.dead = null;
            if (draw) put(r.w, EXPLOSION, RIDER, r.t);
        }
    } else if (r.phase === 1) {
        clocks(r);
        if (r.ct === CRASH_ALL) {                      // the crash over: the strip erased (a player
            r.block = true;                            // joining: its status block from now)
            r.ct++;
            if (draw) r.w.fill(0, 0, 5 * ROW);         // all but the ground row, which stays
            return 0;
        }
        if (r.ct === CRASH_ALL + 1) {
            // the next field: the respawn's place (decision 26) and levels and grounds reached;
            // its ground whole in its levels' colours (the holes come with the rest, next field)
            r.phase = 2;
            let q = r.pos + RIDER;                     // past the crash, CLEAR (16) columns clear
            for (;;) {                                 // of the objects, and of the vertical enemies
                for (const o of objects) {
                    if (o.x + o.w <= r.pos) continue;
                    if (o.x >= q + 16) break;
                    q = Math.max(q, o.x + o.w);
                }
                const v = VCOL.find((v) => v < q + 16 && v + 4 > q);
                if (v === undefined) break;
                q = v + 4; r.vertMoved = (r.vertMoved || 0) + 1;
            }
            Object.assign(r, { pos: q - RIDER, frac: 0, vel: 0, js: 0, t: SKY });
            if (r.pos >= FINISH - RIDER) { r.pos = FINISH - RIDER; r.finished = true; }
            skipGrounds(r);
            if (draw) {
                r.w = new Uint8Array(6 * ROW);
                for (let c = 0; c < 80; c++) for (let L = 40; L < 44; L++) r.w[at(c, L)] = groundAt(r.pos + c);
            }
            return 0;
        }
        const f = r.ct++;
        if (!draw) return 0;
        let c, t, spr;
        if (f < CRASH_FLY) { const p = Math.floor(f / 3); c = RIDER + 5 + p; t = SKY - height(3 * (19 + p) + f % 3); spr = DEAD[r.p][0]; }
        else { c = RIDER + 18; t = SKY; spr = DEAD[r.p][Math.floor((f - CRASH_FLY) / 10) % 2]; }
        if (r.dead && (r.dead.c !== c || r.dead.t !== t)) put(r.w, BLANK, r.dead.c, r.dead.t);
        put(r.w, spr, c, t);
        r.dead = { c, t };
    } else if (r.phase === 2) {                        // the respawn: the rest of the strip
        clocks(r);
        r.phase = 0;
        startVisible(r);
        if (draw) r.w = riding(r);
    } else clocks(r);
    return r.cause;
}
const clone = (r) => ({ ...r, w: null, dead: r.dead && { ...r.dead }, clk: new Map(r.clk),
                          spec: new Map([...r.spec].map(([l, sp]) => [l, { ...sp, golds: sp.golds.map((g) => ({ ...g })) }])) });
// the planner: jump now if riding on (no jumps) crashes within the horizon and jumping now gets
// it back on the ground clear of it - or if it is the last field it could jump at all
function plan(r, accelFor, { blind = false, eager = false, brakeOf = () => false } = {}) {
    if (r.phase !== 0 || r.js !== 0) return false;
    const survive = (jumpNow) => {
        const s = clone(r);
        s.blind = blind;
        for (let f = 0; f < 120; f++) {
            if (step(s, accelFor(f), jumpNow && f === 0, false, brakeOf(s))) return f;
            if (s.finished) return 999;
        }
        return 999;
    };
    const stay = survive(false);
    if (stay === 999) return false;
    if (eager) return stay < 40;
    const jump = survive(true);
    return (jump > stay && jump > JUMP_FIELDS) || (stay <= 1 && jump > stay);
}

// ---- the run ----
const h = await open({ name: "verify_strips", disc: "sequel/build/ddd2.ssd", model: MODEL });
const N = (n) => h.need(n);
const SYM = Object.fromEntries(["pos_lo", "pos_hi", "pos_frac", "vel", "js", "phase", "finished", "frames", "cause", "strip", "brakes", "clk_next"].map((n) => [n, N(n)]));
await h.boot({ field: SYM.frames, fieldBytes: 2 });
if (EARLY) {
    const a = N("vs_count");
    if (h.byte(a + 4) !== 0xa9 || h.byte(a + 9) !== 0xa9) h.die("vs_count + 4 and + 9 are not LDA #");
    const t1 = (h.byte(a + 5) | (h.byte(a + 10) << 8)) - 24 * 64;
    h.wr(a + 5, [t1 & 255]); h.wr(a + 10, [t1 >> 8]);
}
if (NOVERT) {
    const a = N("rs_found"), to = N("rs_clear");      // rs_found: JMP rs_clear - objects only
    if (h.rd(a, 1, "main")[0] !== 0xa6) h.die("rs_found does not start LDX zp");
    h.wr(a, [0x4c, to & 255, to >> 8], "main");      // (rows 0-2: place.6502)
}
if (NOHOLES) {
    const a = N("feet");                               // feet: CLC, RTS - always ground under it
    if (h.byte(a) !== 0xbc) h.die("feet does not start LDY abs,X");
    h.wr(a, [0x18, 0x60]);
}
// THE TITLE (flow.6502): the players join with their accelerate keys, then SPACE (decision 57;
// internal 98, measured)
const START_KEY = 98;
const heldT = [[false, false, false], [false, false, false], [false, false, false], [false, false, false]];
if (await h.runTo(N("title_loop"), 40_000_000) === null) h.die("never reached the title", h.gaveUp);
// THE TEXTS (row 10, the black row between strips 0 and 1; decision 42): the MOS ROM's font
// (characters 32-127 at the start of the Model B's MOS 1.20 ROM, read from jsbeeb's own file, not
// from the machine: a Master's MOS 3.20 holds the same 768 bytes, but not at &C000 - measured
// 2026-11-12, its ROM image at &1F900 - and the game copies them through OSWORD 10, decision 47;
// a byte a line, bit 7 the left pixel), white on black, MODE 2 (a byte
// two pixels: the left in bits 7 5 3 1, the right in 6 4 2 0; white is colour 7, bits 5 3 1 / 4 2 0)
const textRow = (str, col) => {
    const row = new Uint8Array(ROW), font = readFileSync(join(resolveJsbeebSrc().src, "..", "public", "roms", "os.rom")).subarray(0, 96 * 8);
    [...str].forEach((ch, i) => {
        for (let y = 0; y < 7; y++) {                  // 7 lines (print); a comma's 1-7, its tail (decision 52)
            const g = font[(ch.charCodeAt(0) - 32) * 8 + y + (ch === "," ? 1 : 0)];
            for (let b = 0; b < 4; b++) row[(col + i) * 32 + b * 8 + y] = (g & (0x80 >> (2 * b)) ? 0x2a : 0) | (g & (0x40 >> (2 * b)) ? 0x15 : 0);
        }
    });
    return row;
};
const textWrong = (want, row = 10) => { const got = h.rd(0x3000 + row * ROW, ROW, "main"); let n = 0; for (let i = 0; i < ROW; i++) if (got[i] !== want[i]) n++; return n; };
const titleTextWrong = textWrong(textRow("PRESS SPACE TO START", 0));
// THE LEGEND (decision 52): in each strip's sky (rows 5 + 7k and 6 + 7k) its labels and its keys
// under them (decision 49: player 4's are the keypad's on a Master, else the cursor keys), and
// row 17 "ACCELERATE TO JOIN"; the rest of those rows black
const LEGEND_KEYS = [["SHIFT  Z     X", 2], ["G    H     J", 4], [",    .     /", 4], MASTER ? ["4    5     6", 4] : ["LEFT DOWN RIGHT", 3]];
let legendWrong = textWrong(textRow("ACCELERATE TO JOIN", 1), 17) + textWrong(textRow("DARE DEVIL DENIS 2", 1), 4);  // and the name (decision 58)
LEGEND_KEYS.forEach(([keys, col], k) => { legendWrong += textWrong(textRow("ACCEL JUMP BRAKE", 2), 5 + 7 * k) + textWrong(textRow(keys, col), 6 + 7 * k); });
const mask = JOINED.reduce((m, j, p) => m | (j ? 1 << p : 0), 0);
JOINED.forEach((j, p) => { if (j) { h.keyDownRaw(ACCEL[p]); heldT[p][0] = true; } });
for (let f = 0; h.byte(0xa4) !== mask; f++) { if (f > 100) h.die("the players did not join", { joined: h.byte(0xa4), mask }); await h.s.runFrames(1); }
h.keyDownRaw(START_KEY);
if (await h.runTo(N("game_start"), 40_000_000) === null) h.die("the game never started", h.gaveUp);
h.keyUpRaw(START_KEY);
const riders = [0, 1, 2, 3].map(newRider);
riders.forEach(startVisible);                          // every level on the screen at the start: its clock
riders.forEach((r) => { r.w = riding(r); });

// the sound's requests (step 6): each crash and gold must request its effect that pass
const REQ = N("sfx_request"), sndEvents = [], sndReqs = [];
{
    const cpu2 = h.cpu, wm3 = cpu2.writemem.bind(cpu2);
    cpu2.writemem = (a, v) => { if (started && a >= REQ && a < REQ + 4 && v) sndReqs.push([passes, a - REQ, v]); return wm3(a, v); };
}
h.onExec(N("sound_crash"), () => sndEvents.push([passes, 3, 1, "crash"]));
h.onExec(N("sound_gold"), () => sndEvents.push([passes, 1, 2, "gold"]));
const LOOP = N("pass_end");             // the end of every pass, the last one too
// THE CLOCK (decision 55): 120 s; it steps at the field `clkNext` (the frame counter's low byte,
// 50 fields after the first pass's field) and every 50 after, as game_done reads the counter
// (its hook: the same read); the game ends there when it is out or every rider has finished
let clock = CLOCK, clkNext = null, ended = false;
let statusSnap = snapshot(), statusWrong = 0, firstStatus = null;
// the palette (layer 4.4): every write to the ULA's palette register once the loop runs must be
// the rotating colour's next step, 3 fields after the last
const palette = [];
{
    const cpu = h.cpu, wm = cpu.writemem.bind(cpu);
    cpu.writemem = (addr, v) => { if (addr === 0xfe21 && started) palette.push({ field: h.word(SYM.frames, "main"), v }); return wm(addr, v); };
}
let started = false, fields = 0, passes = 0, checked = 0, wrong = 0, firstWrong = null, tears = 0, firstTear = null;
let writes = 0, minGap = 99, t0 = 0, kt0 = 0, cur = null, stateWrong = 0, firstState = null;
const crashes = { game: [], model: [] }, causes = [0, 0, 0, 0, 0, 0];
let respawns = 0, vertMoves = 0, brakeFields = 0, brakeStops = 0, joins = 0, row24Writes = 0, ticks = 0;
const fieldCost = [], stripCost = [[], [], [], []], keyCost = [];
const held = heldT;
h.onExec(N("new_field"), () => {
    // the game's loop has made pass_count passes since start-up (this one not yet counted: the
    // hook is at new_field's head); the riders stood still all that time (no keys), but the
    // enemies' clocks ran a step a pass: the model catches up first
    if (!started) {
        for (let k = 0; k < h.word(N("pass_count"), "main"); k++) riders.forEach(clocks);
        clkNext = (h.byte(SYM.frames) + 50) & 255;
        if (h.byte(SYM.clk_next) !== clkNext) h.die("the clock does not start 50 fields after the first pass", { clk_next: h.byte(SYM.clk_next), want: clkNext });
    }
    started = true; passes++; cur = { strips: [0, 0, 0, 0], keys: 0 }; fieldCost.push(cur); });
h.onExec(N("strip_go"), () => { t0 = h.s.elapsedCycles; });
// the breakdown of a riding strip's update: moving (strip_go to prof_enemies), the enemies
// (to prof_rider), the rider and its collisions (to strip_done)
let tE = 0, tR = 0;
const segs = [];
h.onExec(N("prof_enemies"), () => { tE = h.s.elapsedCycles; tR = 0; });
const timed = {};
for (const [from, to] of [["enemies_over_rider", "eor_rts"], ["set_look", "sl_done"], ["slot_pass", "spp_rts"], ["enemy_draw", "ed_none"], ["draw16", "d16_rts"], ["restore_under", "ru_draw"], ["erase_box", null], ["restore_lines", "rl_rts"], ["marks_move", "md_rts"]]) {
    if (!to) continue;
    let t = 0; timed[from] = [];
    h.onExec(N(from), () => { t = h.s.elapsedCycles; });
    h.onExec(N(to), () => { if (t) timed[from].push(h.s.elapsedCycles - t); t = 0; });
}
h.onExec(N("prof_rider"), () => { tR = h.s.elapsedCycles; });
h.onExec(N("strip_done"), () => {
    if (tE && tR) { segs.push({ move: tE - t0, enemies: tR - tE, rider: h.s.elapsedCycles - tR });
                    if (cur) (cur.parts = cur.parts || [])[h.byte(SYM.strip)] = segs.at(-1); }
    tE = tR = 0;
});
h.onExec(N("strip_done"), () => {
    const k = h.byte(SYM.strip), c = h.s.elapsedCycles - t0;
    if (cur) { cur.strips[k] = c; (cur.phases = cur.phases || [])[k] = h.byte(SYM.phase + k); cur.at = fields; }
    stripCost[k].push(c);
});
h.onExec(N("keys_go"), () => { kt0 = h.s.elapsedCycles; });
h.onExec(N("keys_done"), () => {
    const c = h.s.elapsedCycles - kt0; if (cur) cur.keys = c; keyCost.push(c);
    for (let k = 0; k < 4; k++) {               // what it read is what is held
        const accel = !!(h.byte(0x80 + k) & 0x80), jump = !!(h.byte(0x84 + k) & 0x80), brake = !!(h.byte(SYM.brakes + k) & 0x80);
        if (accel !== held[k][0] || jump !== held[k][1] || brake !== held[k][2])
            h.die("the keys the game read are not the keys held", { field: fields, strip: k, accel, jump, brake, held: held[k] });
    }
});
h.onExec(N("crash_at"), () => { crashes.game.push({ field: passes, strip: h.byte(SYM.strip), cause: h.byte(SYM.cause) }); });
h.onWrite(0x3000, 0x7fff, (addr, val, ctx) => {
    if (!started) return false;
    writes++;
    const row = Math.floor((addr - 0x3000) / ROW);
    if (row === 24) { row24Writes++; return false; }   // never: its first 64 bytes are the blank sprite (make_data.py)
    // the CRTC shows memory row 2 first (decisions 37, 41: rows 2-30), so the row shown is vc + 2
    const shown = ctx.vc + 3;                          // (decision 42: rows 3-30)
    if (row === 3) {                                   // the status line: not while it is shown
        if (!ctx.adj && shown === 3) { tears++; if (!firstTear) firstTear = { field: fields, addr: "&" + addr.toString(16), status: true, vc: ctx.vc, at: h.symAt(ctx.pc) }; }
        return false;
    }
    const k = Math.floor((row - 4) / 7);
    if (row < 4 || (row - 4) % 7 > 5 || k > 3) return false;
    const lo = 4 + 7 * k, hi = 9 + 7 * k;
    if (!ctx.adj && shown >= lo && shown <= hi) {
        tears++;
        if (!firstTear) firstTear = { field: fields, addr: "&" + addr.toString(16), strip: k, vc: ctx.vc, sc: ctx.sc, pc: "&" + ctx.pc.toString(16), at: h.symAt(ctx.pc),
                                       updating: h.byte(SYM.strip), bands: h.byte(0x8a), loop_field: h.byte(0x8b), frames: h.word(SYM.frames, "main") & 255,
                                       since_strip_go: h.s.elapsedCycles - t0 };
    } else if (!ctx.adj) minGap = Math.min(minGap, (lo - shown + 39) % 39);
    return false;
});
// at the end of each pass: the model's field, then the pictures and the state
const windowAt = (k) => 0x3000 + (4 + 7 * k) * ROW;
let lastPass = 0;
h.onExec(LOOP, () => {
    if (!started || passes === lastPass) return;
    lastPass = passes;
    for (let k = 0; k < 4; k++) {
        const r = riders[k];
        const accel = !!(h.byte(0x80 + k) & 0x80), jump = !!(h.byte(0x84 + k) & 0x80), brake = !!(h.byte(SYM.brakes + k) & 0x80);
        const was = r.phase, vm = r.vertMoved || 0;
        if (brake && was === 0 && !r.finished) { brakeFields++; if (r.vel > 0) brakeStops++; }
        const cause = step(r, accel, jump, true, brake);
        if (cause) { crashes.model.push({ field: passes, strip: k, cause, pos: r.pos, js: r.js, t: r.crashT }); causes[cause]++; }
        if (was === 2 && r.phase === 0) respawns++;
        if (was === 4 && r.phase !== 4) joins++;
        if ((r.vertMoved || 0) > vm) vertMoves++;
        const got = h.rd(windowAt(k), 6 * ROW, "main");
        for (let i = 0; i < got.length; i++) if (got[i] !== r.w[i]) {
            wrong++;
            if (!firstWrong) firstWrong = { field: fields, pass: passes, strip: k, phase: r.phase, ct: r.ct, pos: r.pos, js: r.js, t: r.t,
                                            row: 4 + 7 * k + Math.floor(i / ROW), col: (i % ROW) >> 3, line: i & 7, got: got[i], want: r.w[i] };
        }
        const g = { pos: h.byte(SYM.pos_lo + k) | (h.byte(SYM.pos_hi + k) << 8), vel: h.byte(SYM.vel + k), js: h.byte(SYM.js + k),
                    phase: h.byte(SYM.phase + k) };
        const m = { pos: r.pos, vel: r.vel, js: r.js, phase: r.phase };
        if (JSON.stringify(g) !== JSON.stringify(m)) { stateWrong++; if (!firstState) firstState = { field: fields, pass: passes, strip: k, game: g, model: m }; }
    }
    const sGot = h.rd(0x3000 + 3 * ROW, ROW, "main"), sWant = statusRow(statusSnap);
    for (let i = 0; i < ROW; i++) if (sGot[i] !== sWant[i]) { statusWrong++; if (!firstStatus) firstStatus = { field: fields, col: i >> 3, line: i & 7, got: sGot[i], want: sWant[i], snap: statusSnap }; }
    checked++;
});
h.onExec(N("game_done"), () => {
    if (!started) return;
    if (((h.byte(SYM.frames) - clkNext) & 0x80) === 0) { clock--; ticks++; clkNext = (clkNext + 50) & 255; }
    statusSnap = snapshot();                           // what the next pass's head draws
    const playing = riders.filter((r) => r.phase !== 4);
    if (clock === 0 || playing.every((r) => r.finished)) ended = true;
});
// run to the next pass's end, or to the game's end (gd_end): which
const runToPass = async () => {
    const at = h.s.elapsedCycles, END = N("gd_end");
    let hit = null;
    const offs = [LOOP, END].map((a) => h.onExec(a, () => { if (h.s.elapsedCycles === at) return false; hit = a; return true; }));
    try { while (!hit && h.s.elapsedCycles - at < 400_000) await h.s.runFor(100_000); } finally { offs.forEach((o) => o()); }
    return hit === null ? null : hit === LOOP ? "pass" : "end";
};

const accelFor = {
    play: (p, f) => p !== 3 || f % 600 < 400,
    level: () => true,
}[SCENARIO];
// the brake (P4 in play): on at 240, off at 120 (r.brk is the driver's, kept on the model rider
// so the planner's copies brake as the run will)
const brakeOf = (p) => (s) => {
    if (SCENARIO !== "play" || p !== 3 || s.phase !== 0) return (s.brk = false);
    if (s.vel >= 240) s.brk = true; else if (s.vel <= 120) s.brk = false;
    return !!s.brk;
};
const f0 = h.word(SYM.frames, "main");
let video = null;
while (!ended && fields < MAXF) {
    for (let p = 0; p < 4; p++) {
        if (!JOINED[p] && !(LATE[p] !== undefined && fields >= LATE[p])) continue;
        const r = riders[p];
        const a = accelFor(p, fields);
        let j = false;
        if (SCENARIO === "play") {
            j = plan(r, (f) => accelFor(p, fields + 1 + f), { blind: p === 1, eager: p === 2, brakeOf: brakeOf(p) });
        }
        const b = brakeOf(p)(r);
        if (b !== held[p][2]) { (b ? h.keyDownRaw : h.keyUpRaw)(BRAKE[p]); held[p][2] = b; }
        if (a !== held[p][0]) { (a ? h.keyDownRaw : h.keyUpRaw)(ACCEL[p]); held[p][0] = a; }
        if (j !== held[p][1]) { (j ? h.keyDownRaw : h.keyUpRaw)(JUMP[p]); held[p][1] = j; }
    }
    if (PLANT && fields === 500) h.wr(windowAt(2) + 3 * ROW + 70 * 8 + 2, [0x3f], "main");
    // a pass at a time: the keys set above are the ones the next pass reads, and the planner
    // plans from the model after the pass before it
    const got = await runToPass();
    if (got === null) h.die("the loop stopped", h.where());
    if (got === "end") { if (!ended) h.die("the game ended and the model's had not", { clock, field: fields }); break; }
    if (ended) h.die("the model's game ended and the game's had not", { clock, field: fields });
    fields++;
    if (VIDEO && fields === VFROM) video = await startVideo(h.s, VIDEO, { crop: cropFor(h.s, "mos"), title: "Dare Devil Denis 2" });
    if (video && fields < VFROM + VN) await video.frame(`field ${fields}   clock ${clock}`);
    if (video && fields === VFROM + VN) { await video.finish(); console.error(JSON.stringify({ video: video.path, format: video.format, frames: video.frames })); video = null; }
    if (stateWrong > 20 || wrong > 5000) break;
}
const elapsed = h.word(SYM.frames, "main") - f0;
// the game's end (decision 55): the winner the furthest along the course, then the most wages,
// then the first; then, 250 fields on, the title again
let endOk = null;
if (ended) {
    started = false;                                   // the game is over: the end and the title are not watched
    let best = -1;
    riders.forEach((r, p) => { if (r.phase !== 4 && (best < 0 || r.pos > riders[best].pos || (r.pos === riders[best].pos && r.wages > riders[best].wages))) best = p; });
    // through the end's wait nothing may change in the strips' windows: each field of it, every
    // strip must still be the last pass's picture (only the text row between strips changes)
    let endWrong = 0, firstEnd = null, endFields = 0, endTextWrong = null;
    const atWait = await h.runTo(N("gd_wait"), 2_000_000);
    if (atWait !== null) {
        endTextWrong = textWrong(textRow(`PLAYER ${best + 1} WINS`, 3));
        for (let f = 0; f < 250; f++) {
            if (await h.runTo(N("gd_wait"), 400_000) === null) break;
            endFields++;
            for (let k = 0; k < 4; k++) {
                const got = h.rd(windowAt(k), 6 * ROW, "main");
                for (let i = 0; i < got.length; i++) if (got[i] !== riders[k].w[i]) {
                    endWrong++;
                    if (!firstEnd) firstEnd = { end_field: f, strip: k, row: 4 + 7 * k + Math.floor(i / ROW), col: (i % ROW) >> 3, line: i & 7, got: got[i], want: riders[k].w[i] };
                }
            }
        }
    }
    const back = await h.runTo(N("title_loop"), 20_000_000);
    endOk = { winner_game: h.byte(0xa5), winner_model: best, back_at_title: back !== null, end_fields: endFields, end_bytes_wrong: endWrong, end_text_wrong: endTextWrong, title_text_wrong: titleTextWrong, first_end_wrong: firstEnd };
}

const stats = (a) => { const s = [...a].sort((x, y) => x - y); return { n: s.length, median: s[s.length >> 1], p99: s[Math.floor(0.99 * (s.length - 1))], max: s.at(-1) }; };
const totals = fieldCost.map((c) => c.keys + c.strips.reduce((a, b) => a + b, 0));
const worstField = fieldCost[totals.indexOf(Math.max(...totals))];
const key = (c) => `${c.field}/${c.strip}/${c.cause}`;
const gameSet = new Set(crashes.game.map(key)), modelSet = new Set(crashes.model.map(key));
const crashDiff = [...crashes.game.filter((c) => !modelSet.has(key(c))).map((c) => ({ only: "game", ...c })),
                   ...crashes.model.filter((c) => !gameSet.has(key(c))).map((c) => ({ only: "model", ...c }))];
// (the cycle repeats a value, so it is matched from each possible first step; the best counts)
let paletteWrong = Infinity, firstPalette = null;
for (let s0 = 0; s0 < C8.length; s0++) {
    let n = 0, first = null;
    palette.forEach((w, i) => {
        const ok = w.v === C8[(s0 + i) % C8.length] && (i === 0 || w.field - palette[i - 1].field === 3);
        if (!ok) { n++; if (!first) first = { at: i, ...w, prev: palette[i - 1] }; }
    });
    if (n < paletteWrong) { paletteWrong = n; firstPalette = first; }
}
const full = JOINED.every(Boolean);                    // the runs that must see every kind of crash
const lateWanted = LATE.filter((f) => f !== undefined).length;
const coverage = ended && (lateWanted && joins !== lateWanted ? false : !full || SCENARIO !== "play" ? true :
    causes[1] > 0 && causes[2] > 0 && causes[5] > 0 && respawns > 0 && brakeStops > 0 && ticks === CLOCK || riders.every((r) => r.finished));
const sndMissing = sndEvents.filter(([p, c, v]) => !sndReqs.some(([q, d, w]) => q === p && d === c && w === v));
const sndCounts = Object.fromEntries(["crash", "gold"].map((k) => [k, sndEvents.filter((e) => e[3] === k).length]));
const ok = legendWrong === 0 && row24Writes === 0 && sndMissing.length === 0 && ended && endOk && endOk.back_at_title && endOk.end_fields >= 249 && endOk.end_bytes_wrong === 0 && endOk.end_text_wrong === 0 && endOk.title_text_wrong === 0 && endOk.winner_game === endOk.winner_model && checked > 0 && wrong === 0 && statusWrong === 0 && stateWrong === 0 && crashDiff.length === 0 && tears === 0 && paletteWrong === 0 && palette.length > fields / 3 - 2 &&
           Math.abs(passes - elapsed) <= 1 && coverage;
h.finish({ scenario: SCENARIO, legend_text_wrong: legendWrong, row24_writes: row24Writes, sound: { events: sndCounts, missing: sndMissing.slice(0, 5) }, clock, clock_steps: ticks, players: JOINED.map(Number).join(""), game_end: endOk, status_wrong: statusWrong, first_status_wrong: firstStatus, wages: riders.map((r) => r.wages), fields, passes, elapsed_fields: elapsed, coverage, checked, bytes_wrong: wrong, first_wrong: firstWrong, state_wrong: stateWrong, first_state: firstState,
           crashes: crashes.game.length, crashes_disagreeing: crashDiff.slice(0, 5), by_cause: { obstacle: causes[1], enemy: causes[2], hole: causes[5] },
           respawns, respawns_past_vertical: vertMoves, brake_fields: brakeFields, brake_stops: brakeStops, joins, model_crashes: process.env.CRASHLOG ? crashes.model : undefined,
           finals: riders.map((r) => ({ pos: r.pos, finished: r.finished, phase: r.phase })),
           palette_writes: palette.length, palette_wrong: paletteWrong, first_palette_wrong: firstPalette, screen_writes: writes, tearing_writes: tears, first_tear: firstTear, closest_rows_ahead_of_window: minGap,
           keys: stats(keyCost), strips: stripCost.map(stats),
           timed: Object.fromEntries(Object.entries(timed).map(([k, v]) => [k, { ...stats(v), total: v.reduce((x, y) => x + y, 0) }])),
           riding_parts: { move: stats(segs.map((x) => x.move)), enemies: stats(segs.map((x) => x.enemies)), rider: stats(segs.map((x) => x.rider)) }, field_total: stats(totals), worst_field: worstField, over_36k: totals.filter((t) => t > 36000).length,
           worst_fields: totals.map((t, i) => [t, i]).sort((a, b) => b[0] - a[0]).slice(0, 8).map(([t, i]) => ({ t, at: fieldCost[i].at, parts: fieldCost[i].parts })) },
         ok, { samples: checked });
