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
OUT_SPRITES = os.path.join(HERE, 'build', 'sprites.6502')
OUT_MIRROR = os.path.join(HERE, 'build', 'mirror.6502')
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
    def one(v):
        return v if isinstance(v, str) else '&%02X' % v
    return ['    EQUB ' + ', '.join(one(v) for v in vals[i:i + 16]) for i in range(0, len(vals), 16)]


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
    # the riders and dead riders in the original's colours; each player's own look is made in
    # its buffer (main.6502's set_look: decision 17's swap, done when the look changes)
    tall = [('tall_blank', raw('sprite_blank')), ('tall_explosion', raw('sprite_explosion'))]
    for t in TYPES:
        tall.append(('tall_rider_%s' % t, raw('sprite_%s_player' % t)))
    for f in ('one', 'two'):
        tall.append(('tall_dead_%s' % f, raw('sprite_dead_player_%s' % f)))
    for p in range(4):
        tall.append(('tall_look%d' % (p + 1), bytes(64)))
    for kind in ('horizontal', 'vertical'):
        for t in TYPES:
            tall.append(('tall_%s_%s' % (kind, t), raw('sprite_%s_%s_enemy' % (t, kind))))
    for n in ('spider', 'helicopter', 'gold', 'eighty'):     # layer 4.5c
        tall.append(('tall_' + n, raw('sprite_' + n)))
    # the horizontal enemies facing left, for their way back (decision 44): each line's four
    # bytes in reverse order, each byte's two pixels swapped (MODE 2: left 7 5 3 1, right 6 4 2 0)
    mirror = lambda b: ((b << 1) & 0xAA) | ((b >> 1) & 0x55)
    for t in TYPES:
        r = raw('sprite_%s_horizontal_enemy' % t)
        tall.append(('tall_horizontal_%s_m' % t, bytes(mirror(r[l * 4 + 3 - c]) for l in range(16) for c in range(4))))
    names_ = [n for n, _ in tall]
    TALL_CONSTS = [('TALL_BLANK', 'tall_blank'), ('TALL_EXPLOSION', 'tall_explosion'), ('TALL_RIDER', 'tall_rider_land'),
                   ('TALL_DEAD', 'tall_dead_one'), ('TALL_LOOK', 'tall_look1'), ('TALL_HZ', 'tall_horizontal_land'),
                   ('TALL_VT', 'tall_vertical_land'), ('TALL_SPIDER', 'tall_spider'), ('TALL_HELICOPTER', 'tall_helicopter'),
                   ('TALL_GOLD', 'tall_gold'), ('TALL_EIGHTY', 'tall_eighty'), ('TALL_HZM', 'tall_horizontal_land_m')]
    # where each tall sprite lives: the program (sprites.6502) or low RAM (low.6502)
    IN_LOW = {'tall_horizontal_snow': 'C', 'tall_vertical_land': 'C', 'tall_vertical_sea': 'C',
              'tall_vertical_snow': 'C', 'tall_spider': '9', 'tall_helicopter': '9', 'tall_gold': 'B',
              # page 3 (mirror.6502, assembled at &0300 in main.6502's page3 section)
              'tall_horizontal_land_m': 'M', 'tall_horizontal_sea_m': 'M', 'tall_horizontal_snow_m': 'M'}
    col_major = lambda d: [d[l * 4 + c] for c in range(4) for l in range(16)]
    assert not any(raw('sprite_blank'))
    jt = code[syms['jump_offsets_table'] - load:syms['jump_offsets_table'] - load + 34]
    xpos = list(code[syms['x_positions_table'] - load:syms['x_positions_table'] - load + 40])

    def height(s3):
        """the table at state s3 / 3 (thirds of a state), interpolated, rounded half up"""
        s, f = divmod(s3, 3)
        return (6 * jt[s] + (jt[s + 1] - jt[s]) * f * 2 + 3) // 6
    jump_h = [0] + [height(3 + n) for n in range(1, 85)]
    assert all(abs(a - b) <= 2 for a, b in zip(jump_h, jump_h[1:]))
    assert all(jump_h[3 * (s - 1)] == jt[s] for s in range(2, 30))
    crash_col, crash_t, crash_spr = [], [], []         # (crash_spr: checked here, not stored)
    for f in range(42):
        p, r = divmod(f, 3)
        crash_col.append(5 + p)
        crash_t.append(24 - height(3 * (19 + p) + r))
        moved = f == 0 or (crash_col[-1], crash_t[-1]) != (crash_col[-2], crash_t[-2])
        crash_spr.append(3 if moved else 0)
    assert crash_col[-1] == 18 and crash_t[-1] == 24    # after it flies: there, on the ground
    for g in range(140):                                # (main.6502's DEAD_COL; crash_col/t stop)
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
         'CRASH_FIELDS = %d   \\ the explosion to the next take, less the clapperboard' % len(crash_spr),
         'DEAD_FRAME = 10     \\ fields a dead rider frame shows',
         'CRASH_FLY = %d      \\ the fields it flies; crash_col/crash_t cover these' % len(crash_col), ''] + \
        ['%s = %d' % (c, names_.index(n)) for c, n in TALL_CONSTS] + ['']
    # THE SPRITES go first in the program (sprites.6502, at ORG &0E00, a page start): every
    # block is 32 or 64 bytes from a page start, so none crosses a page and LDA abs,X/Y stays
    # 4 cycles, with no ALIGN gap anywhere.
    S = ['\\ sprites.6502 - GENERATED by sequel/make_data.py; do not edit. First in the program.',
         'ASSERT LO(tall_blank) = 0    \\ (the first label)']
    for name, data in tall:
        if name in IN_LOW:
            continue
        S.append('.' + name)
        S += equb(col_major(data))
    for name in sprites:
        top, bot = blocks(raws[name])
        S.append('.%s_top' % name)
        S += equb(top)
        S.append('.%s_bot' % name)
        S += equb(bot)
    open(OUT_SPRITES, 'w', newline='\n').write('\n'.join(S) + '\n')
    M = ['\\ mirror.6502 - GENERATED by sequel/make_data.py; do not edit. The horizontal enemies',
         "\\ facing left, for main.6502's page3 section (&0300, 64-byte aligned)."]
    for name, data in tall:
        if IN_LOW.get(name) == 'M':
            M.append('.' + name)
            M += equb(col_major(data))
    open(OUT_MIRROR, 'w', newline='\n').write('\n'.join(M) + '\n')
    gc = code[syms['ground_colours_table'] - load:syms['ground_colours_table'] - load + 3]
    def both(c):                    # MODE 2: logical colour c in both pixels of a byte
        return sum(((c >> i) & 1) << (2 * i + 1) | ((c >> i) & 1) << (2 * i) for i in range(4))
    page_d = [('nmi_rti', [0x40])]      # &0D00: RTI, for any NMI (the DFS's handler was here)
    page_d.append(('ground_byte', [both(c) for c in gc]))     # land, sea, snow
    rc = code[syms['rotating_colour_table'] - load:syms['rotating_colour_table'] - load + 14]
    phys = [v & 15 for v in rc]     # VDU 19's physical colour; &10 gives 0 (measured)
    assert phys == [0, 4, 5, 1, 6, 3, 7, 7, 7, 3, 6, 1, 5, 4], phys
    page_d.append(('c8_ulas', [0x80 | (p ^ 7) for p in phys]))
    L.append('C8_STEPS = %d' % len(phys))
    page_d.append(('tall_lo', ['LO(%s)' % n for n, _ in tall]))
    page_d.append(('tall_hi', ['HI(%s)' % n for n, _ in tall]))
    for half in ('top', 'bot'):
        page_d.append(('spr_%s_lo' % half, ['LO(%s_%s)' % (n, half) for n in sprites]))
        page_d.append(('spr_%s_hi' % half, ['HI(%s_%s)' % (n, half) for n in sprites]))
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
    page_d.append(('shift_lo', ['LO(shift_%d)' % k for k in range(9)]))
    page_d.append(('shift_hi', ['HI(shift_%d)' % k for k in range(9)]))
    # main.6502's per-strip constants (its SCREEN, ROW; checked there by ASSERTs): each strip's
    # window rows 0-5 at strip x 6, its obstacle and ground rows, its rider's tall sprite; the keys
    SCREEN, ROW = 0x3000, 640
    rows = [SCREEN + (4 + 7 * k + r) * ROW for k in range(4) for r in range(6)]
    page_d += [('wrow_lo', [a & 255 for a in rows]), ('wrow_hi', [a >> 8 for a in rows]),
               ('wix', [0, 6, 12, 18]),
               ('obase_lo', [(SCREEN + (7 + 7 * k) * ROW) & 255 for k in range(4)]),
               ('obase_hi', [(SCREEN + (7 + 7 * k) * ROW) >> 8 for k in range(4)]),
               ('gbase_lo', [(SCREEN + (9 + 7 * k) * ROW) & 255 for k in range(4)]),
               ('gbase_hi', [(SCREEN + (9 + 7 * k) * ROW) >> 8 for k in range(4)]),
               ('rider_tall', [names_.index('tall_look1') + p for p in range(4)]),
               # the keys by slot (read_keys): accelerate Z V M . (keys), jump X B , / (jumps),
               # brake D G K RETURN (brakes, decision 48); internal numbers, measured in jsbeeb
               ('key_numbers', [97, 99, 101, 103, 66, 100, 102, 104, 50, 83, 70, 73])]
    # ENEMIES (layer 4.4), per level, from data/course.json (as initialise_level sets them up):
    # the horizontal enemy on the second ground of every level (level_set_data says so for all
    # twelve sets), starting at x 74 (&4A); the vertical enemies, the first five only (the
    # original's update loop stops at X = &0F; the rest are never drawn), at their ground and x,
    # with their starting states. Both step once a pass, and the pass after initialise_level
    # is the first: the horizontal enemy is shown at x 0, 1 ... 74, 0 ...; a vertical enemy at
    # state s0 + 1, s0 + 2 ... 31, 1 ... (jump_offsets_table[state] lines up). At 50 Hz a pass is
    # 3 fields, and the vertical enemy's height is interpolated in thirds of it like the jump:
    #   ven_first[l]      level l's vertical enemies: ven_first[l] .. ven_first[l + 1] - 1
    #   ven_off_lo/hi     an enemy's column from its level's start (76 x ground + x)
    #   ven_q0            its phase when its level's clock starts: 3 x (s0 MOD 31)
    #   vh[q]             the height at phase q (0-92): state 1 + q DIV 3, third q MOD 3
    assert all(lv['horizontal'] == {'x': 74, 'ground': 1} for lv in course['levels'])
    vfirst, voff, vq0 = [], [], []
    for lv in course['levels']:
        vfirst.append(len(voff))
        for v in lv['vertical'][:5]:
            assert 1 <= v['state'] <= 31
            voff.append(76 * v['ground'] + v['x'])
            vq0.append(3 * (v['state'] % 31))
    vfirst.append(len(voff))

    def vheight(q):
        s, r = divmod(q, 3)
        a, b = jt[s + 1], jt[(s + 1) % 31 + 1]
        return (6 * a + (b - a) * r * 2 + 3) // 6
    vh = [vheight(q) for q in range(93)]
    assert all(vh[3 * (s - 1)] == jt[s] for s in range(1, 32))
    L.append('NUM_LEVELS = %d' % len(course['levels']))
    L.append('HZ_BASE = 76      \\ the horizontal enemy: the second ground')
    L.append('HZ_TURN = 75      \\ x 0-74 out (the original: then 0, &4B), then back (decision 44):')
    L.append('HZ_WRAP = 148     \\ its count 0-147; x = the count to 74, then 148 - it, facing left')
    L.append('VPHASES = 93      \\ 31 states x 3 fields')
    ven = {'ven_first': vfirst, 'ven_off_lo': [o & 255 for o in voff], 'ven_off_hi': [o >> 8 for o in voff],
           'ven_q0': vq0, 'vh': vh}          # (to low RAM, below)
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
           'B': (0x0900, 4, [(n, col_major(d)) for n, d in tall if IN_LOW.get(n) == '9'] +
                            [('crash_col', crash_col), ('ven_first', ven['ven_first']), ('x_positions', xpos),
                             ('PAGE', None),
                             ('ven_off_lo', ven['ven_off_lo']), ('ven_off_hi', ven['ven_off_hi']), ('crash_t', crash_t),
                             ('PAGE', None),
                             ('ven_q0', ven['ven_q0']), ('vh', ven['vh']), ('ALIGN64', None)] +
                            [(n, col_major(d)) for n, d in tall if IN_LOW.get(n) == 'B'] +
                            [(n, col_major(d)) for n, d in tall if IN_LOW.get(n) == 'C']),
           'D': (0x0D00, 1, page_d)}
    LL = ['\\ low.6502 - GENERATED by sequel/make_data.py; do not edit. The tables for low RAM,',
          '\\ assembled here as bytes, their labels where reloc copies them.', '']
    for name, (base, pages, tables) in low.items():
        image, labels = [], []
        for label, vals in tables:
            if label == 'PAGE':                     # the rest from the next page
                image += [0] * ((256 - len(image) % 256) % 256)
                continue
            if label == 'ALIGN64':                  # a tall sprite next: a 64-byte boundary
                image += [0] * ((64 - len(image) % 64) % 64)
                continue
            room = 256 - len(image) % 256
            if len(vals) > room and len(image) % 256:
                image += [0] * room                 # does not fit in this page: the next one
            labels.append('%s = &%04X    \\ %d bytes' % (label, base + len(image), len(vals)))
            image += vals
        assert len(image) <= pages * 256, (name, len(image))
        LL += ['LOW_%s = &%04X    \\ %d of %d bytes used' % (name, base, len(image), pages * 256),
               'LOW_%s_PAGES = %d' % (name, pages), 'LOW_%s_USED = %d' % (name, len(image))] + labels
        LL.append('.low_%s_image' % name.lower())
        LL += equb(image)
        LL.append('')
    open(OUT_LOW, 'w', newline='\n').write('\n'.join(LL) + '\n')
    print('wrote %s: %d sprites, %d tall, %d objects, finish %d, shift routines writing %d bytes' %
          (OUT, len(sprites), len(tall), len(objs) - 1, course['finish'], total))


if __name__ == '__main__':
    main()
