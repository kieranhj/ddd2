// measure_crash.mjs - the original's crash, timed (layer 4.3): how many fields from the collision to
// the explosion, each pass of the flying dead rider, the dead rider on the ground, and the next take.
//
//   node tools/measure_crash.mjs
//
// Boots build/ddd.ssd at skill A and holds SHIFT, so the rider rides into the first obstacle.
// Times are in fields of 39,936 cycles (312 lines x 128), from jsbeeb's cycle counter.
import { bootGame, KEY, state } from "./ddd.mjs";

const h = await bootGame("measure_crash");
const FIELD = 312 * 128;
const t = () => h.s.elapsedCycles / FIELD;
const log = [];
const at = (name, extra = () => ({})) => h.onExec(h.need(name), () => log.push({ at: name, field: +t().toFixed(2), ...state(h), ...extra() }));
at("kill_player");
at("skip_ceiling_1ab8");
at("animate_dead_player");
at("new_take");
let passes = 0;
h.onExec(h.need("main_game_loop"), () => { passes++; });
h.keyDownRaw(KEY.SHIFT);
const t0 = t();
for (let f = 0; f < 3000 && !log.some((e) => e.at === "new_take"); f++) await h.s.runFrames(1);
h.keyUpRaw(KEY.SHIFT);
const k = log.find((e) => e.at === "kill_player");
const fly = log.filter((e) => e.at === "skip_ceiling_1ab8");
const dead = log.find((e) => e.at === "animate_dead_player"), nt = log.find((e) => e.at === "new_take");
h.finish({
    riding_fields: k && +(k.field - t0).toFixed(2), main_loop_passes: passes, at_crash: k,
    flying_passes: fly.length, flying_fields_per_pass: fly.slice(1).map((e, i) => +(e.field - fly[i].field).toFixed(2)),
    flying_states: fly.map((e) => e.jump), flying_x: fly.map((e) => e.x),
    kill_to_dead_on_ground: dead && +(dead.field - k.field).toFixed(2),
    dead_on_ground_to_new_take: nt && dead && +(nt.field - dead.field).toFixed(2), new_take: nt,
}, !!(k && dead && nt), { samples: log.length });
