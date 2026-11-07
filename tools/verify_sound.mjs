// verify_sound.mjs - the sequel's sound (step 6), checked against the original's.
//
//   node tools/verify_sound.mjs [--fields N] [--plant]
//
// Boots sequel/build/ddd2.ssd and records every byte the SN76489 is sent (the System VIA's port A
// as the addressable latch's line 0 - the chip's write enable - goes low), keeping the chip's
// registers as they stand after each field.
//   THE TITLE (decision 40). DENIS2's tune, from src/denis2.6502's tune_data_4204: each note's
//     two pitches on tones 2 and 1 (the MOS's channels 1 and 2), at full volume, for 6 x its
//     duration fields (the original's vsync-event player: cooldown d, x4, +d, +d). Each pitch's
//     period from data/mos_pitch_period.json, the MOS's own (measured; pitch 0 never occurs in the
//     tune). The first --notes notes (default 60) are checked field by field: tone 2's and tone 1's
//     periods, their volumes.
//   THE GAME (skill A, player 1 riding, joined at the title): every crash (`crash_at`) requests
//     the crash effect on the noise channel that field; every gold collected (the wages' +80)
//     the gold effect on tone 1; every take won back the take effect on tone 1. Once a pass of
//     the original's (3 fields) the engine: the fastest riding player, tone 2 sent its pitch
//     (vel / 2, the MOS's period) and the engine (or, on snow, moving and on the ground, the
//     snow) effect requested on the noise channel - but not while a crash still sounds.
// Exit 0: every tune field right, every effect and engine request as expected, the engine's
// periods right; 1: anything else; 2: could not run.
import { readFileSync } from "node:fs";

import { open } from "./harness.mjs";

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i < 0 ? d : args[i + 1]; };
const NOTES = parseInt(opt("--notes", "60"), 10), FIELDS = parseInt(opt("--fields", "3000"), 10);
const PLANT = args.includes("--plant");                // a wrong tune pitch, to see the check fail

// the original's tune and the MOS's periods
const den = readFileSync("src/denis2.6502", "utf8");
const tv = [...den.slice(den.indexOf(".tune_data_4204"), den.indexOf(".unused_44ad")).matchAll(/&([0-9A-F]{2})/g)].map((m) => parseInt(m[1], 16));
const tune = [];
for (let k = 0; k + 2 < tv.length; k += 3) { if (!tv[k]) break; tune.push({ p1: tv[k], p2: tv[k + 1], d: tv[k + 2] }); }
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

// ---- the title: the tune ----
if (await h.runTo(N("title_loop"), 40_000_000) === null) h.die("never reached the title", h.gaveUp);
if (PLANT) h.wr(N("tune_pitch") + 3, [h.rd(N("tune_pitch") + 3, 1, "main")[0] + 4], "main");
let tuneWrong = 0, firstTune = null, tuneFields = 0;
// where the tune is: at a note's start (tune_note), its byte offset in the packed notes - each
// note 1 byte if its pitches are the same, else 2 (sequel/make_sound.py's form, recomputed here)
const offsets = []; { let o = 0; for (const n of tune) { offsets.push(o); o += n.p1 === n.p2 ? 1 : 2; } }
const NOTES_AT = N("tune_notes"), TUNE_AT = N("tune_at");
let startNote = -1;
const offNote = h.onExec(N("tune_note"), () => {
    if (startNote < 0) startNote = offsets.indexOf((h.byte(TUNE_AT) | (h.byte(TUNE_AT + 1) << 8)) - NOTES_AT);
});
for (let f = 0; f < 200 && startNote < 0; f++) await h.s.runFrames(1);
offNote();
if (startNote < 0) h.die("no note started");
let note = startNote, left = 0;
const expectNote = (n) => ({ t2: per[tune[n % tune.length].p1], t1: per[tune[n % tune.length].p2], fields: 6 * tune[n % tune.length].d });
let cur = expectNote(note); left = cur.fields;         // (this sample is the note's first field)
while (note < startNote + NOTES) {
    const got = { t2: reg.tone[2], t1: reg.tone[1], a2: reg.att[2], a1: reg.att[1] };
    if (got.t2 !== cur.t2 || got.t1 !== cur.t1 || got.a2 !== 0 || got.a1 !== 0) {
        tuneWrong++;
        if (!firstTune) firstTune = { note, left, got, want: cur, tune: tune[note % tune.length] };
    }
    tuneFields++;
    await h.s.runFrames(1);
    if (--left === 0) { note++; cur = expectNote(note); left = cur.fields; }
}

// ---- the game: skill A, player 1 ----
const ACCEL = 97, SKILL_A = 65;
h.keyDownRaw(ACCEL);
for (let f = 0; f < 100 && h.byte(0xa4) !== 1; f++) await h.s.runFrames(1);
h.keyDownRaw(SKILL_A);
if (await h.runTo(N("game_start"), 40_000_000) === null) h.die("the game never started", h.gaveUp);
h.keyUpRaw(SKILL_A);
const REQ = N("sfx_request"), PITCH = N("engine_pitch");
const SYM = Object.fromEntries(["phase", "vel", "rtype", "js", "take", "crash_sound"].map((n) => [n, N(n)]));
const requests = [];                                   // [field, channel, value]
let field = 0;
const wm2 = cpu.writemem;
cpu.writemem = (a, v) => { if (a >= REQ && a < REQ + 4 && v) requests.push([field, a - REQ, v]); return wm2(a, v); };
const events = [];
h.onExec(N("crash_at"), () => events.push([field, "crash"]));
h.onExec(N("sound_gold"), () => events.push([field, "gold-call"]));
h.onExec(N("sound_take"), () => events.push([field, "take-call"]));
// the engine: at engine_pass, what it should pick (from the game's state then)
const engineWant = [];
h.onExec(N("engine_pass"), () => {
    if (h.rd(SYM.crash_sound, 1, "main")[0]) { engineWant.push([field, null]); return; }
    let best = -1, bv = -1;
    for (let k = 3; k >= 0; k--) if (h.byte(SYM.phase + k) === 0 && h.byte(SYM.vel + k) >= bv) { bv = h.byte(SYM.vel + k); best = k; }
    if (best < 0) { engineWant.push([field, null]); return; }
    const snow = h.byte(SYM.rtype + best) === 2;
    if (snow) engineWant.push([field, (h.byte(SYM.js + best) === 0 && bv) ? { req: 5 } : null]);
    else engineWant.push([field, { req: 4, pitch: bv >> 1 }]);
});
// tone 2's period after each field the engine sent a pitch
const pitchSeen = [];
h.onExec(N("sf_driver"), () => { const p = h.rd(PITCH, 1, "main")[0]; });
let lastPitch = null, periodWrong = 0, firstPeriod = null, periodChecks = 0;
for (; field < FIELDS; field++) {
    // a simple rider: accelerate, jump now and then (crashes and golds come with it)
    if (field % 90 === 30) h.keyDownRaw(66); else if (field % 90 === 33) h.keyUpRaw(66);
    const before = h.rd(PITCH, 1, "main")[0];
    await h.s.runFrames(1);
    const w = engineWant.find(([f]) => f === field);
    if (w && w[1] && w[1].pitch !== undefined) {
        await h.s.runFrames(1); field++;               // the interrupt sends it next field
        periodChecks++;
        if (reg.tone[2] !== per[w[1].pitch]) { periodWrong++; if (!firstPeriod) firstPeriod = { field, pitch: w[1].pitch, got: reg.tone[2], want: per[w[1].pitch] }; }
    }
    if (h.byte(SYM.phase) === 3) break;                // out of takes
}
// effects: each crash -> a request 1 on channel 3 the same field; gold -> 2 on 1; take -> 3 on 1
const want = { crash: [3, 1], "gold-call": [1, 2], "take-call": [1, 3] };
let effectWrong = 0, firstEffect = null;
for (const [f, what] of events) {
    const [ch, v] = want[what];
    if (!requests.some(([rf, rc, rv]) => rf === f && rc === ch && rv === v)) { effectWrong++; if (!firstEffect) firstEffect = { field: f, what }; }
}
let engineWrong = 0, firstEngine = null;
for (const [f, w] of engineWant) {
    const got = requests.filter(([rf, rc]) => rf === f && rc === 3 && h);
    const engineReq = got.find(([, , v]) => v === 4 || v === 5);
    const ok = w ? !!engineReq && engineReq[2] === w.req : !engineReq;
    if (!ok) { engineWrong++; if (!firstEngine) firstEngine = { field: f, want: w, got }; }
}
const counts = Object.fromEntries(Object.keys(want).map((k) => [k, events.filter(([, w]) => w === k).length]));
const ok = tuneWrong === 0 && tuneFields > 0 && effectWrong === 0 && engineWrong === 0 && periodWrong === 0 &&
           counts.crash > 0 && engineWant.length > 0 && periodChecks > 0;
h.finish({ tune: { from_note: startNote, notes: NOTES, fields: tuneFields, wrong: tuneWrong, first_wrong: firstTune },
           game: { fields: field, events: counts, effect_wrong: effectWrong, first_effect_wrong: firstEffect,
                   engine_passes: engineWant.length, engine_wrong: engineWrong, first_engine_wrong: firstEngine,
                   period_checks: periodChecks, period_wrong: periodWrong, first_period_wrong: firstPeriod },
           chip_bytes: sent }, ok, { samples: tuneFields + engineWant.length });
