"""Make the sequel's data: the original's sprites in the sequel's layout, and the course.

    python sequel/make_data.py      (after .\\build.ps1 has made build/ddd.ssd)

Writes sequel/build/data.6502, and sequel/build/low.6502: the tables that run in low RAM.

SPRITES are read out of our rebuilt DENIS3 (byte identical to the original's, tools/compare.py) at
the addresses in build/ddd.symbols.json. The original stores a sprite row by row, 4 bytes x 16
lines. Here each is two 32-byte blocks in screen order, one per character row: block[c * 8 + l]
is column c, line l (top block lines 0-7, bottom block lines 8-15). A whole sprite is then one
loop of Y = 31..0 over both character rows, and column c alone is 8 bytes from c * 8 in each.
  sprites 0-8   the obstacles: level type t (0 land, 1 sea, 2 snow), sprite n (1-3) at 3t + n - 1

TALL SPRITES are the ones drawn at any height (layer 4.3): column-major, tall[c * 16 + l] is column
c, line l, so one 16-line column is one run of X. They are
  0             the blank (sprite_blank: all black), also the black under a rider with no obstacle
  1             the explosion
  2 + 5p + t    player p's rider for level type t (sprite_<type>_player)
  2 + 5p + 3/4  player p's dead rider, frames one and two (sprite_dead_player_one/two)
  22 + t        the horizontal enemy for level type t (ambulance, yacht, snowball)
  25 + t        the vertical enemy (policeman, ball, skull)
Player 1 (p 0) has the original's colours; for the others green (logical colour 2) is swapped with
yellow, cyan or magenta, both ways (decision 17: RIDER_SWAP), in the rider and the dead rider alike.

THE JUMP (layer 4.3). The original's rider is jump_offsets_table[state] lines up, the state one
higher each pass of 3 fields, shown from 2 to 29 (28 passes, 84 fields). Here the jump is counted
in fields, n = 1..84, and jump_h[n] is the table at state s = 1 + n / 3, interpolated between
whole states and rounded: at n = 3(s - 1) it is the original's height exactly.

THE CRASH (measured in the original, tools/measure_crash.mjs): the explosion at the rider, then the
dead rider flies from 5 columns right of it, one column a pass of 3 fields, its height
jump_offsets_table[19 + pass] (interpolated as above), for 14 passes; then it lies on the ground 18
columns right of the rider, frame one and frame two 10 fields each, 7 times. crash_col/crash_t/
crash_spr give, for each field of it, where the dead rider is (columns right of the rider, window
line of its top) and which frame to draw there (0: none - it has not moved, or the frame stays).

THE COURSE is data/course.json's flat `course` (decisions 18-22), in course columns:
  obj_x_lo/hi   the column it starts at, ascending; a sentinel at &7FFF ends it
  obj_kind      < &80: an obstacle, its sprite number; &80 + t x &20 + w: a hole w columns wide
                in a level of type t (its edges are drawn back in that type's ground colour)
Level types: level L is (L - 1) MOD 3, land, sea, snow; a level is 304 columns (decision 18).
  ground_byte   the ground's lit byte per type: green, blue, white (ground_colours_table;
                decision 30: always blue at sea)
  c8_ulas       the rotating colour: logical colour 8's ULA palette writes, one a pass of 3
                fields (measured, tools/measure_palette.mjs: physical 0 4 5 1 6 3 7 7 7 3 6 1 5 4)
FINISH is the course's end, the end of level 35 (decision 22).

SHIFT ROUTINES (layer 4.1's optimisation). Moving an obstacle one column left only changes the
screen where its column j differs from its column j-1 (the column that was there before), over
columns 0-4 (column -1 and column 4 are black). So each obstacle sprite gets a routine that writes
just those bytes: grouped by value, `LDA #v` once, then `LDY #offset : STA (d0),Y` (and/or
`STA (d1),Y` for the lower character row, sharing the LDY). Entered with d0/d1 at the obstacle's
new column. It is right only if the screen held the obstacle one column to the right, untouched:
main.6502 uses the full draw where the rider may have been drawn over it.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'tools'))
from ddd_disc import ROOT, denis3, symbols  # noqa: E402

OUT = os.path.join(HERE, 'build', 'data.6502')
OUT_LOW = os.path.join(HERE, 'build', 'low.6502')
TYPES = ['land', 'sea', 'snow']
NAMES = ['obstacle_one', 'obstacle_two', 'obstacle_three']


RIDER_SWAP = [None, 3, 6, 5]     # per player: the colour swapped with green (2); None: as drawn


def recolour(raw, other):
    """MODE 2: left pixel colour bits 3-0 in byte bits 7,5,3,1, right pixel in 6,4,2,0."""
    if other is None:
        return bytes(raw)
    out = []
    for b in raw:
        px = []
        for shift in (1, 0):
            c = sum(((b >> (2 * i + shift)) & 1) << i for i in range(4))
            px.append(other if c == 2 else 2 if c == other else c)
        out.append(sum(((px[0] >> i) & 1) << (2 * i + 1) | ((px[1] >> i) & 1) << (2 * i) for i in range(4)))
    return bytes(out)


def blocks(raw):
    top = [raw[line * 4 + c] for c in range(4) for line in range(8)]
    bot = [raw[(line + 8) * 4 + c] for c in range(4) for line in range(8)]
    return top, bot


def equb(vals):
    return ['    EQUB ' + ', '.join('&%02X' % v for v in vals[i:i + 16]) for i in range(0, len(vals), 16)]


def main():
    load, code = denis3()
    syms = symbols()
    sprites, raws = [], {}
    for t in TYPES:
        for n in NAMES:
            name = 'sprite_%s_%s' % (t, n)
            sprites.append(name)
            raws[name] = code[syms[name] - load:syms[name] - load + 64]
    def raw(name):
        return code[syms[name] - load:syms[name] - load + 64]
    tall = [('tall_blank', raw('sprite_blank')), ('tall_explosion', raw('sprite_explosion'))]
    for p, other in enumerate(RIDER_SWAP):
        for t in TYPES:
            tall.append(('tall_rider%d_%s' % (p + 1, t), recolour(raw('sprite_%s_player' % t), other)))
        for f in ('one', 'two'):
            tall.append(('tall_dead%d_%s' % (p + 1, f), recolour(raw('sprite_dead_player_%s' % f), other)))
    for kind in ('horizontal', 'vertical'):
        for t in TYPES:
            tall.append(('tall_%s_%s' % (kind, t), raw('sprite_%s_%s_enemy' % (t, kind))))
    assert [n for n, _ in tall].index('tall_horizontal_land') == 22
    assert not any(raw('sprite_blank'))
    jt = code[syms['jump_offsets_table'] - load:syms['jump_offsets_table'] - load + 34]

    def height(s3):
        """the table at state s3 / 3 (thirds of a state), interpolated, rounded half up"""
        s, f = divmod(s3, 3)
        return (6 * jt[s] + (jt[s + 1] - jt[s]) * f * 2 + 3) // 6
    jump_h = [0] + [height(3 + n) for n in range(1, 85)]
    assert all(abs(a - b) <= 2 for a, b in zip(jump_h, jump_h[1:]))
    assert all(jump_h[3 * (s - 1)] == jt[s] for s in range(2, 30))
    crash_col, crash_t, crash_spr = [], [], []
    for f in range(42):
        p, r = divmod(f, 3)
        crash_col.append(5 + p)
        crash_t.append(24 - height(3 * (19 + p) + r))
        moved = f == 0 or (crash_col[-1], crash_t[-1]) != (crash_col[-2], crash_t[-2])
        crash_spr.append(3 if moved else 0)
    for g in range(140):
        crash_col.append(18)
        crash_t.append(24)
        crash_spr.append(0 if g % 10 else 3 + (g // 10) % 2)

    course = json.load(open(os.path.join(ROOT, 'data', 'course.json')))
    types = {L['level']: TYPES.index(L['type']) for L in course['levels']}
    objs = []
    for o in course['course']:
        if o['type'] == 'obstacle':
            objs.append((o['x'], types[o['level']] * 3 + o['sprite'] - 1))
        else:
            assert 0 < o['width'] < 0x20
            objs.append((o['x'], 0x80 + (types[o['level']] << 5) + o['width']))
    objs.append((0x7FFF, 0))
    assert len(objs) <= 256 and objs == sorted(objs, key=lambda o: o[0])

    L = ['\\ data.6502 - GENERATED by sequel/make_data.py from build/ddd.ssd and data/course.json;',
         '\\ do not edit', '',
         'FINISH = %d    \\ the end of level 35, in course columns (decision 22)' % course['finish'],
         'NUM_OBJECTS = %d' % len(objs),
         'JUMP_FIELDS = %d    \\ in the air (the original: 28 passes of 3 fields)' % (len(jump_h) - 1),
         'CRASH_FIELDS = %d   \\ the explosion to the next take, less the clapperboard' % len(crash_col), '',
         'ALIGN 256      \\ no sprite block crosses a page: LDA abs,Y stays 4 cycles']
    for name in sprites:
        top, bot = blocks(raws[name])
        L.append('.%s_top' % name)
        L += equb(top)
        L.append('.%s_bot' % name)
        L += equb(bot)
    L.append('ALIGN 256      \\ tall sprites: 64 bytes each, none crosses a page')
    for name, data in tall:
        L.append('.' + name)
        L += equb([data[l * 4 + c] for c in range(4) for l in range(16)])
    gc = code[syms['ground_colours_table'] - load:syms['ground_colours_table'] - load + 3]
    def both(c):                    # MODE 2: logical colour c in both pixels of a byte
        return sum(((c >> i) & 1) << (2 * i + 1) | ((c >> i) & 1) << (2 * i) for i in range(4))
    L.append('.ground_byte   EQUB %s    \\ land, sea, snow' % ', '.join('&%02X' % both(c) for c in gc))
    rc = code[syms['rotating_colour_table'] - load:syms['rotating_colour_table'] - load + 14]
    phys = [v & 15 for v in rc]     # VDU 19's physical colour; &10 gives 0 (measured)
    assert phys == [0, 4, 5, 1, 6, 3, 7, 7, 7, 3, 6, 1, 5, 4], phys
    L.append('.c8_ulas   EQUB %s' % ', '.join('&%02X' % (0x80 | (p ^ 7)) for p in phys))
    L.append('C8_STEPS = %d' % len(phys))
    L.append('.tall_lo   EQUB %s' % ', '.join('LO(%s)' % n for n, _ in tall))
    L.append('.tall_hi   EQUB %s' % ', '.join('HI(%s)' % n for n, _ in tall))
    for half in ('top', 'bot'):
        L.append('.spr_%s_lo   EQUB %s' % (half, ', '.join('LO(%s_%s)' % (n, half) for n in sprites)))
        L.append('.spr_%s_hi   EQUB %s' % (half, ', '.join('HI(%s_%s)' % (n, half) for n in sprites)))
    total = 0
    for k, name in enumerate(sprites[:9]):
        raw = code[syms[name] - load:syms[name] - load + 64]

        def px(j, line):
            return 0 if j < 0 or j > 3 else raw[line * 4 + j]
        writes = {}
        for j in range(5):
            for line in range(16):
                if px(j, line) != px(j - 1, line):
                    writes.setdefault(px(j, line), {}).setdefault(j * 8 + (line & 7), []).append(line >> 3)
        n = sum(len(r) for v in writes.values() for r in v.values())
        total += n
        L.append('.shift_%d    \\ %s: %d bytes' % (k, name, n))
        for v in sorted(writes):
            L.append('    LDA #&%02X' % v)
            for off in sorted(writes[v]):
                L.append('    LDY #%d' % off)
                for r in sorted(writes[v][off]):
                    L.append('    STA (d%d),Y' % r)
        L.append('    RTS')
    L.append('.shift_lo   EQUB %s' % ', '.join('LO(shift_%d)' % k for k in range(9)))
    L.append('.shift_hi   EQUB %s' % ', '.join('HI(shift_%d)' % k for k in range(9)))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    open(OUT, 'w', newline='\n').write('\n'.join(L) + '\n')

    # LOW RAM (the RAM hunt, docs/done.md): read-only tables at &0400-&07FF and &0900-&0CFF,
    # which nothing touches once the game runs (tools/memwatch.mjs over a whole driven game;
    # page 8 is the MOS's sound workspace and stays out). Each table starts a page or is packed
    # inside one, so no indexed read crosses a page. They are assembled as bytes at the end of
    # the file (`low_a_image`, `low_b_image`) with their labels set to where `reloc` copies them.
    low = {'A': (0x0400, 4, [('obj_x_lo', [o[0] & 255 for o in objs]),
                             ('obj_x_hi', [o[0] >> 8 for o in objs]),
                             ('obj_kind', [o[1] for o in objs]),
                             ('jump_h', jump_h),
                             ('col8_lo', [(c * 8) & 255 for c in range(80)]),
                             ('col8_hi', [(c * 8) >> 8 for c in range(80)])]),
           'B': (0x0900, 4, [('crash_col', crash_col), ('crash_t', crash_t), ('crash_spr', crash_spr)])}
    LL = ['\\ low.6502 - GENERATED by sequel/make_data.py; do not edit. The tables for low RAM,',
          '\\ assembled here as bytes, their labels where reloc copies them.', '']
    for name, (base, pages, tables) in low.items():
        image, labels = [], []
        for label, vals in tables:
            room = 256 - len(image) % 256
            if len(vals) > room and len(image) % 256:
                image += [0] * room                 # does not fit in this page: the next one
            labels.append('%s = &%04X    \\ %d bytes' % (label, base + len(image), len(vals)))
            image += vals
        assert len(image) <= pages * 256, (name, len(image))
        LL += ['LOW_%s = &%04X    \\ %d of %d bytes used' % (name, base, len(image), pages * 256),
               'LOW_%s_PAGES = %d' % (name, pages)] + labels
        LL.append('.low_%s_image' % name.lower())
        LL += equb(image)
        LL.append('')
    open(OUT_LOW, 'w', newline='\n').write('\n'.join(LL) + '\n')
    print('wrote %s: %d sprites, %d tall, %d objects, finish %d, shift routines writing %d bytes' %
          (OUT, len(sprites), len(tall), len(objs) - 1, course['finish'], total))


if __name__ == '__main__':
    main()
