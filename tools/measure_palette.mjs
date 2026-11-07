// measure_palette.mjs - the original's rotating colour (layer 4.4): every write to the ULA's
// palette register (&FE21) while a game runs, with the field it was made in.
//
//   node tools/measure_palette.mjs
//
// update_rotating_colour_and_enemies does VDU 19,8,rotating_colour_table[i],0,0,0 once a pass;
// this records what the MOS turns that into. Boots build/ddd.ssd at skill A, SHIFT held.
import { bootGame, KEY } from "./ddd.mjs";

const h = await bootGame("measure_palette");
const FIELD = 312 * 128;
const writes = [];
let off = null;
const cpu = h.cpu;
const orig = cpu.writemem.bind(cpu);
cpu.writemem = (addr, v) => { if (addr === 0xfe21) writes.push({ field: Math.floor(h.s.elapsedCycles / FIELD), v }); return orig(addr, v); };
h.keyDownRaw(KEY.SHIFT);
for (let f = 0; f < 200; f++) await h.s.runFrames(1);
const logical8 = writes.filter((w) => (w.v >> 4) === 8);
h.finish({ writes: writes.length, logical8: logical8.slice(0, 40).map((w) => ({ field: w.field, physical: (w.v & 15) ^ 7 })),
           others: [...new Set(writes.map((w) => w.v >> 4))] }, logical8.length > 0, { samples: writes.length });
