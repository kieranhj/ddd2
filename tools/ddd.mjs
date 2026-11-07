// ddd.mjs - driving the ORIGINAL Dare Devil Denis (build/ddd.ssd) in headless jsbeeb: boot it
// past the loading screen and the title into a game at a chosen skill, and read its state.
// Shared by tools/record_original.mjs (step 2) and tools/capture_course.mjs (step 3).
//
// The way in, measured by hand in the jsbeeb MCP (CLAUDE.md "Verifying in jsbeeb", 2026-11-07):
// the loading screen waits INKEY(3000) for SPACE, the title waits for SPACE, then the start
// screen polls INKEY(2) for A-F between scrolltext steps, so a short press can be missed. Here
// nothing is timed by guesswork: SPACE is tapped until `start_screen` runs, then the skill key
// is held until `new_take` runs.
import { open } from "./harness.mjs";

export const KEY = { SHIFT: 0, SPACE: 98, RETURN: 73, A: 65, B: 100, C: 82, D: 50, E: 34, F: 67 };

export async function bootGame(name, { skill = "A", disc = "build/ddd.ssd" } = {}) {
    const h = await open({ name, disc });
    await h.boot();
    let atStart = false, inGame = false;
    const offs = [h.onExec(h.need("start_screen"), () => { atStart = true; }),
                  h.onExec(h.need("new_take"), () => { inGame = true; })];
    for (let f = 0; !atStart; f++) {
        if (f > 3000) h.die("never reached start_screen", { where: h.where() });
        if (f % 20 === 0) h.keyDownRaw(KEY.SPACE);
        if (f % 20 === 5) h.keyUpRaw(KEY.SPACE);
        await h.s.runFrames(1);
    }
    h.keyUpRaw(KEY.SPACE);
    await h.s.runFrames(5);
    h.keyDownRaw(KEY[skill]);
    for (let f = 0; !inGame; f++) {
        if (f > 1000) h.die(`never reached new_take holding ${skill}`, { where: h.where() });
        await h.s.runFrames(1);
    }
    h.keyUpRaw(KEY[skill]);
    offs.forEach((off) => off());
    return h;
}

/** The game's state, as named in src/game.6502 and src/zp.6502. */
export function state(h) {
    const b = (n) => h.byte(h.need(n));
    const wages = String.fromCharCode(...h.rd(h.need("wages"), 6));
    return { level: b("level"), take: b("take"), x: b("player_x"), ground: b("player_ground_y"),
             jump: b("player_jump_state"), vel: b("player_x_velocity"), frac: b("player_x_fraction"),
             wages };
}
