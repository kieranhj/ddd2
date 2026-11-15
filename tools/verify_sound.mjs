// verify_sound.mjs - the sequel's sound (step 6), checked against the original's.
//
//   node tools/verify_sound.mjs [--fields N] [--plant]
//
// Boots sequel/build/ddd2.ssd and records every byte the SN76489 is sent (the System VIA's port A
// as the addressable latch's line 0 - the chip's write enable - goes low), keeping the chip's
// registers as they stand after each field.
//   THE TITLE: silent (decision 58: the tune went) - every channel at attenuation 15, each of
//     --title fields (default 200).
//   THE GAME (player 1 riding, joined at the title, SPACE): every crash (`crash_at`) requests
//     the crash effect on the noise channel that field; every gold collected (the wages' +80)
//     the gold effect on tone 1 (the takes, and their effect, went: decision 55). Once a pass of
//     the original's (3 fields) the engine: the fastest riding player, tone 2 sent its pitch
//     (vel / 2, the MOS's period) and the engine (or, on snow, moving and on the ground, the
//     snow) effect requested on the noise channel - but not while a crash still sounds.
// Exit 0: the title silent, every effect and engine request as expected, the engine's
// periods right; 1: anything else; 2: could not run.
import { readFileSync } from "node:fs";

import { open } from "./harness.mjs";

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i < 0 ? d : args[i + 1]; };
const TITLE = parseInt(opt("--title", "200"), 10), FIELDS = parseInt(opt("--fields", "3000"), 10);
const PLANT = args.includes("--plant");                // the gold effect asked for on the title, to see the check fail

// the MOS's periods
const per = Object.fromEntries(Object.entries(JSON.parse(readFileSync("data/mos_pitch_period.json", "utf8"))).map(([k, v]) => [+k, v]));
per[0] = per[48] * 2;

const h = await open({ name: "verify_sound", disc: "sequel/build/ddd2.ssd" });
const N = (n) => h.need(n);
await h.boot({ field: N("frames"), fieldBytes: 2 });

// the chip: every byte sent, its registers
const reg = { tone: [0, 0, 0], att: [15, 15, 15, 15], noise: 0 };
let latch = 0, porta = 0, sent = 0;
const cpu = h.cpu, wm = cpu.writemem.bind(cpu);
cpu.writemem = (a, v) => {
    if (a === 0xfe4f || a === 0xfe41) porta = v;
    else if (a === 0xfe40 && v === 0) {                // line 0 low: the chip takes port A
        sent++;
        const b = porta;
        if (b & 0x80) {
            latch = (b >> 4) & 7;
            const ch = latch >> 1;
            if (latch & 1) reg.att[ch] = b & 15;
            else if (ch === 3) reg.noise = b & 7;
            else reg.tone[ch] = (reg.tone[ch] & 0x3f0) | (b & 15);
        } else {
            const ch = latch >> 1;
            if (!(latch & 1) && ch < 3) reg.tone[ch] = (reg.tone[ch] & 15) | ((b & 63) << 4);
        }
    }
    return wm(a, v);
};

// ---- the title: silent ----
if (await h.runTo(N("title_loop"), 40_000_000) === null) h.die("never reached the title", h.gaveUp);
await h.s.runFrames(2);                                // (sound_quiet's bytes reach the chip)
if (PLANT) h.wr(N("sfx_request") + 1, [2], "main");
let titleLoud = 0, firstLoud = null, titleFields = 0;
for (let f = 0; f < TITLE; f++) {
    await h.s.runFrames(1);
    titleFields++;
    if (reg.att.some((a) => a !== 15)) { titleLoud++; if (!firstLoud) firstLoud = { field: f, att: [...reg.att] }; }
}

// ---- the game: player 1 ----
const ACCEL = 0, JUMP = 97, SPACE = 98;               // SHIFT, Z (decision 49); SPACE starts (57)
h.keyDownRaw(ACCEL);
for (let f = 0; f < 100 && h.byte(0xa4) !== 1; f++) await h.s.runFrames(1);
h.keyDownRaw(SPACE);
if (await h.runTo(N("game_start"), 40_000_000) === null) h.die("the game never started", h.gaveUp);
h.keyUpRaw(SPACE);
const REQ = N("sfx_request"), PITCH = N("engine_pitch");
const SYM = Object.fromEntries(["phase", "vel", "rtype", "js", "crash_sound"].map((n) => [n, N(n)]));
const requests = [];                                   // [field, channel, value]
let field = 0;
const wm2 = cpu.writemem;
cpu.writemem = (a, v) => { if (a >= REQ && a < REQ + 4 && v) requests.push([field, a - REQ, v]); return wm2(a, v); };
const events = [];
h.onExec(N("crash_at"), () => events.push([field, "crash"]));
h.onExec(N("sound_gold"), () => events.push([field, "gold-call"]));
// the engine: at engine_pass, what it should pick (from the game's state then)
const engineWant = [];
h.onExec(N("engine_pass"), () => {
    if (h.rd(SYM.crash_sound, 1, "main")[0]) { engineWant.push([field, null]); return; }
    let best = -1, bv = -1;
    for (let k = 3; k >= 0; k--) if (h.byte(SYM.phase + k) === 0 && h.byte(SYM.vel + k) >= bv) { bv = h.byte(SYM.vel + k); best = k; }
    if (best < 0) { engineWant.push([field, null]); return; }
    const snow = h.byte(SYM.rtype + best) === 2;
    if (snow) engineWant.push([field, (h.byte(SYM.js + best) === 0 && bv) ? { req: 4 } : null]);
    else engineWant.push([field, { req: 3, pitch: bv >> 1 }]);
});
// tone 2's period after each field the engine sent a pitch
const pitchSeen = [];
h.onExec(N("sf_driver"), () => { const p = h.rd(PITCH, 1, "main")[0]; });
let lastPitch = null, periodWrong = 0, firstPeriod = null, periodChecks = 0;
for (; field < FIELDS; field++) {
    // a simple rider: accelerate, jump now and then (crashes and golds come with it)
    if (field % 90 === 30) h.keyDownRaw(JUMP); else if (field % 90 === 33) h.keyUpRaw(JUMP);
    const before = h.rd(PITCH, 1, "main")[0];
    await h.s.runFrames(1);
    const w = engineWant.find(([f]) => f === field);
    if (w && w[1] && w[1].pitch !== undefined) {
        await h.s.runFrames(1); field++;               // the interrupt sends it next field
        periodChecks++;
        if (reg.tone[2] !== per[w[1].pitch]) { periodWrong++; if (!firstPeriod) firstPeriod = { field, pitch: w[1].pitch, got: reg.tone[2], want: per[w[1].pitch] }; }
    }
}
// effects: each crash -> a request 1 on channel 3 the same field; gold -> 2 on 1
const want = { crash: [3, 1], "gold-call": [1, 2] };
let effectWrong = 0, firstEffect = null;
for (const [f, what] of events) {
    const [ch, v] = want[what];
    if (!requests.some(([rf, rc, rv]) => rf === f && rc === ch && rv === v)) { effectWrong++; if (!firstEffect) firstEffect = { field: f, what }; }
}
let engineWrong = 0, firstEngine = null;
for (const [f, w] of engineWant) {
    const got = requests.filter(([rf, rc]) => rf === f && rc === 3 && h);
    const engineReq = got.find(([, , v]) => v === 3 || v === 4);
    const ok = w ? !!engineReq && engineReq[2] === w.req : !engineReq;
    if (!ok) { engineWrong++; if (!firstEngine) firstEngine = { field: f, want: w, got }; }
}
const counts = Object.fromEntries(Object.keys(want).map((k) => [k, events.filter(([, w]) => w === k).length]));
const ok = titleLoud === 0 && titleFields > 0 && effectWrong === 0 && engineWrong === 0 && periodWrong === 0 &&
           counts.crash > 0 && engineWant.length > 0 && periodChecks > 0;
h.finish({ title: { fields: titleFields, loud: titleLoud, first_loud: firstLoud },
           game: { fields: field, events: counts, effect_wrong: effectWrong, first_effect_wrong: firstEffect,
                   engine_passes: engineWant.length, engine_wrong: engineWrong, first_engine_wrong: firstEngine,
                   period_checks: periodChecks, period_wrong: periodWrong, first_period_wrong: firstPeriod },
           chip_bytes: sent }, ok, { samples: titleFields + engineWant.length });
