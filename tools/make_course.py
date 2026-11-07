"""Turn the captured levels into the course, and check it against the original's screens.

    python tools/make_course.py [data/course_capture.json] [data/course.json]

Input: tools/capture_course.mjs's record. For each picture it has every `plot_sprite` call the
original made while setting the level up, and the screen as it stood (build/course/*.bin).

THE COURSE. Everything the original places sits on a 4-column grid: x_positions_table holds
multiples of 4, and the wipes step by 4. So each ground is 20 cells, built by replaying the plots
in order:
  - an obstacle sprite on a ground's obstacle rows (character row 7 + 7g) puts it in that cell;
  - `sprite_blank` there empties the cell;
  - `sprite_blank` on the ground row (9 + 7g) cuts the ground out of the cell: a hole.
Any other plot stops the script, because the course would not describe it.

THE ORACLE. Each picture is redrawn from the COURSE ALONE, not from the plots:
  - black;
  - each ground row's top four lines in the level's ground colour (`ground_colours_table`,
    MODE 2: logical colour c is byte bits 7,5,3,1 for the left pixel and 6,4,2,0 for the right);
  - a hole's cells cleared on the obstacle rows and the ground row and the row below it;
  - each obstacle's 16 lines from DENIS3.
It is compared with the captured screen over character rows 3-31: the status box above is text
and is not the course. Exit 0: every picture matches, 0 bytes wrong; 1: a byte differs.

The course is written ground by ground in level order (the order the original plays them). Each
ground also has its course column: ground s (counting from 0 down the whole course) starts at
s * PITCH. PITCH is 76, the distance the original's rider travels on a ground (player_x 0 to the
end-of-ground check at &4B; it rides &4B-&4D, then player_x is set to 0).
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from ddd_disc import ROOT, denis3, symbols  # noqa: E402

PITCH = 76
TYPES = {1: 'land', 2: 'sea', 3: 'snow'}
ROW = 640
SPRITES = ['obstacle_one', 'obstacle_two', 'obstacle_three']


def mode2_byte(c):
    b = 0
    for i in range(4):
        if c >> i & 1:
            b |= 1 << (2 * i + 1) | 1 << (2 * i)
    return b


def course_of(pic):
    """The picture's four grounds, from its plots."""
    kind = TYPES[pic['levelType']]
    grounds = [{'cells': [None] * 20, 'ground': [True] * 20} for _ in range(4)]
    for p in pic['plots']:
        r, col, spr = p['charRow'], p['col'], p['sprite']
        if p['line'] != 0 or col % 4:
            sys.exit('level %d: a plot off the grid: %r' % (pic['level'], p))
        cell = col // 4
        if (r - 7) % 7 == 0 and 0 <= (r - 7) // 7 < 4:
            g = grounds[(r - 7) // 7]
            if spr == 'sprite_blank':
                g['cells'][cell] = None
            elif spr.startswith('sprite_%s_obstacle_' % kind):
                g['cells'][cell] = SPRITES.index(spr[len('sprite_%s_' % kind):]) + 1
            else:
                sys.exit('level %d: an unexpected sprite: %r' % (pic['level'], p))
        elif (r - 9) % 7 == 0 and 0 <= (r - 9) // 7 < 4 and spr == 'sprite_blank':
            grounds[(r - 9) // 7]['ground'][cell] = False
        else:
            sys.exit('level %d: a plot the course cannot describe: %r' % (pic['level'], p))
    out = []
    for g in grounds:
        holes, c = [], 0
        while c < 20:
            if not g['ground'][c]:
                s = c
                while c < 20 and not g['ground'][c]:
                    c += 1
                holes.append([s * 4, (c - s) * 4])
            else:
                c += 1
        out.append({'obstacles': [[c * 4, n] for c, n in enumerate(g['cells']) if n],
                    'holes': holes})
    return out


def draw(level_type, grounds, sprite_bytes, colour):
    scr = bytearray(0x5000)
    fg = mode2_byte(colour)
    for g in range(4):
        base = (9 + 7 * g) * ROW
        for c in range(80):
            for line in range(4):
                scr[base + c * 8 + line] = fg
        for x, w in grounds[g]['holes']:
            for c in range(x, x + w):
                for r in (7, 8, 9, 10):
                    for line in range(8):
                        scr[(r + 7 * g) * ROW + c * 8 + line] = 0
        for x, n in grounds[g]['obstacles']:
            raw = sprite_bytes[(level_type, n)]
            for line in range(16):
                for c in range(4):
                    scr[(7 + 7 * g + line // 8) * ROW + (x + c) * 8 + (line & 7)] = raw[line * 4 + c]
    return scr


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'data', 'course_capture.json')
    dst = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'data', 'course.json')
    cap = json.load(open(src))
    load, code = denis3()
    syms = symbols()
    sprite_bytes = {}
    for t, name in TYPES.items():
        for n, s in enumerate(SPRITES, 1):
            a = syms['sprite_%s_%s' % (name, s)] - load
            sprite_bytes[(t, n)] = code[a:a + 64]
    colours = code[syms['ground_colours_table'] - load:syms['ground_colours_table'] - load + 3]

    wrong_total, judged, per = 0, 0, {}
    for pic in cap['pictures']:
        grounds = course_of(pic)
        want = draw(pic['levelType'], grounds, sprite_bytes, colours[pic['levelType'] - 1])
        got = open(os.path.join(ROOT, pic['screen']), 'rb').read()
        lo = 3 * ROW
        wrong = sum(1 for a, b in zip(want[lo:], got[lo:]) if a != b)
        if wrong:
            first = next(i for i in range(lo, 0x5000) if want[i] != got[i])
            print('level %2d %-6s %5d bytes wrong, first at &%04X (row %d col %d)' %
                  (pic['level'], pic['kind'], wrong, 0x3000 + first, first // ROW, first % ROW // 8))
        wrong_total += wrong
        judged += 1
        per[(pic['level'], pic['kind'], len(per))] = (pic, grounds)

    levels, firsts, seen = [], {}, set()
    for (lv, kind, _), (pic, grounds) in per.items():
        if kind == 'first':
            if lv in seen:
                same = firsts[lv] == grounds
                print('level %d comes round again after 35: %s' %
                      (lv, 'the same course' if same else 'A DIFFERENT COURSE'))
                if not same:
                    wrong_total += 1
                continue
            seen.add(lv)
            firsts[lv] = grounds
            levels.append({'level': lv, 'type': TYPES[pic['levelType']],
                           'holeStart': pic['holeStart'], 'grounds': grounds,
                           'vertical': [{'x': v['x'], 'ground': (v['y'] - 0x38) // 0x38,
                                         'state': v['state']} for v in pic['vertical']],
                           'horizontal': {'x': pic['horizontal']['x'],
                                          'ground': (pic['horizontal']['y'] - 0x38) // 0x38}})
    moved = []
    for (lv, kind, _), (pic, grounds) in per.items():
        if kind == 'retake' and grounds != firsts[lv]:
            moved.append(lv)
    s = 0
    for L in levels:
        for g in L['grounds']:
            g['course_x'] = s * PITCH
            s += 1
    out = {'tool': 'tools/make_course.py', 'from': os.path.relpath(src, ROOT).replace('\\', '/'),
           'pitch': PITCH, 'columns': s * PITCH,
           'note': 'x is the column within the ground (0-79); a ground starts at course_x. '
                   'obstacles: [x, sprite 1-3 of the level type]; holes: [x, width]',
           'levels': levels}
    with open(dst, 'w', newline='\n') as f:
        json.dump(out, f, indent=1)
        f.write('\n')
    n_obs = sum(len(g['obstacles']) for L in levels for g in L['grounds'])
    n_holes = sum(len(g['holes']) for L in levels for g in L['grounds'])
    print(json.dumps({'pictures': judged, 'bytes_wrong': wrong_total, 'levels': len(levels),
                      'grounds': s, 'columns': s * PITCH, 'obstacles': n_obs, 'holes': n_holes,
                      'retake_differs': moved, 'out': os.path.relpath(dst, ROOT)}))
    sys.exit(0 if wrong_total == 0 and judged else 1)


if __name__ == '__main__':
    main()
