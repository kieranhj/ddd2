"""
disasm2baron.py - turn Level7's annotated Dare Devil Denis disassembly into Baron source.

ONE-SHOT. Run once to create src/game.6502, src/denis2.6502 and src/zp.6502; from then on those
files are the source of truth and are edited by hand. It refuses to overwrite them unless given
--force. Kept so the conversion can be audited and repeated against a corrected disassembly.
Forked from Stryker's Run's tools/disasm2baron.py (beeb-port-kit PORTING.md 2.1c).

    python tools/disasm2baron.py [--force]

The disassembly is of the TAPE release; the reference is the STH DISC (decision 1).
tools/check_disasm.py proves the two agree on every byte of the code: DENIS3 entirely, DENIS2
from &40E9 (below that the disc has its own BASIC, written by hand in src/main.6502).

What it does:
  * Takes the disassembly's DDDenis2 section from &40E9 and DDDenis3 (the game, &0E00-&348F).
    DDDenis1 (the tape's BASIC loader) is not on the disc and is not converted.
  * Re-decodes every instruction from its hex bytes (tools/m6502.py, NMOS opcodes only), so the
    source assembles to exactly those bytes; the text mnemonic is a cross-check. A line that
    does not decode as its mnemonic becomes EQUB with the disassembly's text in the comment.
  * Labels: every "; name" line becomes .name (duplicated names get an _xxxx address suffix).
  * Operands become symbols where the disassembly gives one:
      - branch, JMP, JSR and absolute operands landing in the program: label (+ offset)
      - a name the comment gives for an address in the program with no label of its own
        (self-modified operands, variables inside code): `name = * + k` where its byte is
      - workspace outside the program (&0Cxx sound_block, the screen): constants in zp.6502
      - zero page: the comment's name, as a constant in zp.6502 (the game reuses zero page
        under many names; each name is the one the disassembly uses in that routine)
      - immediates commented "&XXXX = name [+/- n]": LO(...) / HI(...)
      - MOS entry points: the names in src/os.6502
    A name the disassembly gives to two different addresses gets an _xxxx suffix on each.
  * An absolute instruction whose operand is in zero page (an assembler would shrink it) is
    emitted as raw bytes with the instruction in the comment.
"""
import re
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import m6502  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DISASM = ROOT / 'reference' / 'dare-devil-denis-disassembly.txt'
SRC = ROOT / 'src'

# (exact text at the start of a line, replacement). Each must match exactly once.
CORRECTIONS = [
    # The disassembly's last line is cut off mid-instruction: the file ends at &4AFF, so only
    # the opcode byte of this LDA abs is in DENIS2 (the disc agrees: &AD).
    ('&4aff ad       LDA &....', '&4aff ad                                                            # LDA abs, cut off by the end of the file'),
]

# (file, first line of its section in the disassembly, first address converted)
FILES = [
    ('denis2', '; DDDenis2', 0x40E9),
    ('game',   '; DDDenis3', 0x0E00),
]
ENDS = {'denis2': 'Game disassembly', 'game': None}

OSNAMES = {}
for line in (SRC / 'os.6502').read_text().splitlines():
    m = re.match(r'^(\w+)\s*=\s*&([0-9A-Fa-f]+)', line)
    if m:
        OSNAMES.setdefault(int(m.group(2), 16), m.group(1))

RX_INS = re.compile(r'^\s*&([0-9a-f]{4}) ((?:[0-9a-f]{2} ){1,3})\s*([A-Z]{3})\b(.*)$')
RX_DAT = re.compile(r'^\s*&([0-9a-f]{4})\s+((?:[0-9a-f]{2} ?)+)(.*)$')
RX_LAB = re.compile(r'^; ([A-Za-z_][A-Za-z0-9_]*)\s*(\(.*?\))?\s*(#.*)?$')
RX_NAMEREF = re.compile(r'^([A-Za-z_][A-Za-z0-9_]*)(?:\s*([+-])\s*(&?[0-9a-fA-F]+))?\s*(\(.*\))?\s*$')
NOT_NAMES = {'OSBYTE', 'OSWORD', 'OSWRCH', 'OSCLI', 'OSFILE', 'CR'}


def parse_num(s):
    return int(s[1:], 16) if s.startswith('&') else int(s)


def comment_name(comment):
    """'; name', '; name + 3', '; name + 3 (what)' in an operand comment -> (name, offset)."""
    c = comment.split('#')[0].strip()
    if not c.startswith(';'):
        return None
    c = c[1:].strip()
    if '=' in c or ':' in c or '"' in c:
        return None
    m = RX_NAMEREF.match(c)
    if not m or m.group(1) in NOT_NAMES or m.group(1).upper() == m.group(1):
        return None
    if not re.search(r'[a-z]', m.group(1)) or ' ' in m.group(1):
        return None
    off = 0
    if m.group(2):
        off = parse_num(m.group(3)) * (1 if m.group(2) == '+' else -1)
    return m.group(1), off


def decode(bs):
    """NMOS decode of an instruction's bytes, or None."""
    if bs[0] in m6502.CMOS_ONLY:
        return None
    return m6502.decode(bytes(bs) + b'\0\0', 0)


class Item:
    def __init__(self, kind, **kw):
        self.kind = kind
        self.__dict__.update(kw)


def load_lines():
    text = DISASM.read_text(encoding='latin1').split('\n')
    for old, new in CORRECTIONS:
        hits = [i for i, l in enumerate(text) if l.startswith(old)]
        if len(hits) != 1:
            sys.exit(f'correction {old!r} matched {len(hits)} lines')
        text[hits[0]] = new + text[hits[0]][len(old):]
    return text


def section_lines(text, f):
    start = next(i for i, l in enumerate(text) if l.rstrip() == dict((a, b) for a, b, _ in FILES)[f])
    end = ENDS[f]
    stop = next((i for i, l in enumerate(text) if i > start and end and l.startswith(end)), len(text))
    return start, text[start + 2:stop]       # skip the "; DDDenisN" and "; load exec length" lines


def parse(lines, base, first):
    items, pending = [], []
    started = False
    for n, raw in enumerate(lines, base + 3):
        line = raw.rstrip()
        mi = RX_INS.match(line)
        md = None if mi else RX_DAT.match(line)
        if mi or md:
            addr = int((mi or md).group(1), 16)
            if addr < first:
                pending = []
                continue
            started = True
            for lab, extra in pending:
                items.append(Item('label', name=lab, addr=addr, extra=extra, line=n))
            pending = []
            g = mi or md
            bs = [int(b, 16) for b in g.group(2).split()]
            if mi:
                items.append(Item('ins', addr=addr, bytes=bs, mn=mi.group(3), rest=mi.group(4), line=n))
            else:
                items.append(Item('data', addr=addr, bytes=bs, rest=md.group(3), line=n))
            continue
        ml = RX_LAB.match(line)
        if ml:
            extra = ' '.join(x for x in (ml.group(2), ml.group(3)) if x)
            pending.append((ml.group(1), extra))
            continue
        if started or not line.strip():
            items.append(Item('comment', text=line, line=n))
        # comment lines before the first converted address are dropped (the BASIC's)
    for lab, extra in pending:
        items.append(Item('comment', text='; ' + lab + (' ' + extra if extra else ''), line=0))
    return items


def main():
    if (SRC / 'game.6502').exists() and '--force' not in sys.argv:
        sys.exit('src/game.6502 exists and is hand-maintained now; pass --force to overwrite')
    text = load_lines()
    files = {}
    for f, _, first in FILES:
        base, lines = section_lines(text, f)
        files[f] = parse(lines, base, first)

    # duplicate label names -> _xxxx suffix
    counts = defaultdict(int)
    for items in files.values():
        for it in items:
            if it.kind == 'label':
                counts[it.name] += 1
    labels = {}                              # name -> addr
    label_of = {}                            # (disassembly name, addr) -> label
    lab_at = {}                              # addr -> first name
    for items in files.values():
        for it in items:
            if it.kind == 'label':
                base_name = it.name
                if counts[it.name] > 1:
                    it.name = f'{it.name}_{it.addr:04x}'
                labels[it.name] = it.addr
                label_of[(base_name, it.addr)] = it.name
                lab_at.setdefault(it.addr, it.name)
    sorted_labs = sorted(lab_at.items())

    occupied = {}                            # addr -> item (both files: one address space)
    for items in files.values():
        for it in items:
            if it.kind in ('ins', 'data'):
                for k in range(len(it.bytes)):
                    if it.addr + k in occupied:
                        print(f'warning: &{it.addr + k:04x} defined twice (line {it.line})')
                    occupied[it.addr + k] = it

    # ---- names from operand comments ----
    claims = defaultdict(set)                # name -> {addr}  (absolute operands)
    zp_claims = defaultdict(set)             # name -> {addr}
    for items in files.values():
        for it in items:
            if it.kind != 'ins':
                continue
            d = decode(it.bytes)
            if d is None:
                continue
            mn, mode, v, n = d
            cp = it.rest.find(';')
            cn = comment_name(it.rest[cp:]) if cp >= 0 else None
            if not cn or mode in ('imp', 'acc', 'imm', 'rel'):
                continue
            nm, off = cn
            (zp_claims if m6502.MODES[mode][0] == 1 else claims)[nm].add(v - off)
        # immediates "&XXXX = name"
        for it in items:
            if it.kind == 'ins':
                m = re.search(r';\s*&([0-9a-f]{4}) = ([A-Za-z_]\w*)\s*(?:([+-])\s*(&?[0-9a-fA-F]+))?', it.rest)
                if m:
                    off = parse_num(m.group(4)) * (1 if m.group(3) == '+' else -1) if m.group(3) else 0
                    claims[m.group(2)].add(int(m.group(1), 16) - off)

    # resolve: a name with one address keeps its name; with several, each gets _xxxx
    def fan(cl):
        out = {}
        for nm, s in cl.items():
            if nm in OSNAMES.values():
                continue
            s = {a for a in s if (nm, a) not in label_of}
            if not s:
                continue
            if nm in labels and len(s) == 1:
                out[(nm, next(iter(s)))] = f'{nm}_{next(iter(s)):04x}'
                continue
            if len(s) == 1:
                out[(nm, next(iter(s)))] = nm
            else:
                for a in s:
                    out[(nm, a)] = f'{nm}_{a:04x}'
        return out
    abs_names = fan(claims)                  # (name, addr) -> symbol
    zp_names = fan(zp_claims)
    # a name used both as zp and abs: keep both but make sure symbols differ
    for key, sym in list(zp_names.items()):
        if sym in abs_names.values() and abs_names.get(key) != sym:
            zp_names[key] = f'{sym}_zp'

    inner = {}                               # symbol -> addr, defined inside the program
    consts = {}                              # symbol -> addr, outside the program
    for (nm, a), sym in abs_names.items():
        if a in occupied:
            if lab_at.get(a) != nm:
                inner[sym] = a
        else:
            consts[sym] = a
    inner_at = defaultdict(list)
    for sym, a in inner.items():
        if lab_at.get(a) is None or True:
            inner_at[a].append(sym)
    zp_consts = {sym: a for (nm, a), sym in zp_names.items()}

    def abs_sym(nm, a):
        if (nm, a) in label_of:
            return label_of[(nm, a)]
        return abs_names.get((nm, a))

    def sym_for(v, cn):
        """Best symbolic expression for absolute address v."""
        if cn:
            nm, off = cn
            s = abs_sym(nm, v - off)
            if s:
                return s + (f' + {off}' if off > 0 else f' - {-off}' if off < 0 else '')
        if v in OSNAMES:
            return OSNAMES[v]
        if v not in occupied:
            return None
        if v in lab_at:
            return lab_at[v]
        best = None
        for a, nm in sorted_labs:
            if a <= v:
                best = (a, nm)
            else:
                break
        if best and all(x in occupied for x in range(best[0], v + 1)):
            return f'{best[1]} + {v - best[0]}'
        return None

    stats = defaultdict(int)

    def emit_file(items):
        out = []
        pc = None
        ind = '    '
        for it in items:
            if it.kind == 'comment':
                t = it.text
                out.append('' if not t.strip() else '\\ ' + t.strip())
                continue
            if it.kind == 'label':
                if pc is not None and it.addr != pc:
                    out.append(f'    ASSERT * = &{it.addr:04X}    \\ !!! gap')
                    stats['gap'] += 1
                out.append(f'.{it.name}' + (f'    \\ {it.extra.lstrip("#").strip()}' if it.extra else ''))
                continue
            if pc is not None and it.addr != pc:
                out.append(f'    ASSERT * = &{it.addr:04X}    \\ !!! discontinuity')
                stats['discontinuity'] += 1
            pc = it.addr
            for k in range(len(it.bytes)):
                for nm in inner_at.get(it.addr + k, []):
                    out.append(f'{nm} = * + {k}' if k else f'{nm} = *')
            if it.kind == 'data':
                rest = it.rest.strip()
                if rest.startswith(';'):
                    rest = rest[1:].strip()
                rest = rest.lstrip('#').strip()
                out.append((ind + 'EQUB ' + ', '.join('&%02X' % b for b in it.bytes) +
                            ('    \\ ' + rest if rest else '')).rstrip())
                pc += len(it.bytes)
                continue
            bs = it.bytes
            d = decode(bs)
            if d is None or d[3] != len(bs) or d[0] != it.mn:
                stats['badins'] += 1
                out.append(ind + 'EQUB ' + ', '.join('&%02X' % b for b in bs) +
                           f'    \\ !!! does not decode as {it.mn}{it.rest.rstrip()}')
                pc += len(bs)
                continue
            mn, mode, v, n = d
            if mode == 'rel':
                v = (it.addr + 2 + (bs[1] - 256 if bs[1] >= 128 else bs[1])) & 0xFFFF
            rest = it.rest
            cpos = rest.find(';')
            mc = re.search(r';|\s{2,}#', rest)
            comment = rest[mc.start():].strip() if mc else ''
            cn = comment_name(rest[cpos:]) if cpos >= 0 else None
            mcn = re.match(r';\s*[A-Za-z_]\w*(\s*[+-]\s*&?[0-9a-fA-F]+)?\s*', comment)
            if mcn and cn:
                comment = comment[mcn.end():].strip()
            comment = comment.lstrip(';').strip()
            comment = re.sub(r'\s+#\s*', '    ', comment)
            if comment.startswith('#'):
                comment = comment[1:].strip()
            opw = m6502.MODES[mode][0]
            raw = False
            if v is None:
                operand = ''
            elif mode == 'imm':
                operand = '#&%02X' % v
                m = re.search(r';\s*&([0-9a-f]{4}) = ([A-Za-z_]\w*)\s*(?:([+-])\s*(&?[0-9a-fA-F]+))?', rest)
                if m:
                    full = int(m.group(1), 16)
                    off = parse_num(m.group(4)) * (1 if m.group(3) == '+' else -1) if m.group(3) else 0
                    s = abs_sym(m.group(2), full - off)
                    if s:
                        s = s + (f' + {off}' if off > 0 else f' - {-off}' if off < 0 else '')
                        if (full & 0xFF) == v:
                            operand = f'#LO({s})'
                            stats['imm_sym'] += 1
                        elif (full >> 8) == v:
                            operand = f'#HI({s})'
                            stats['imm_sym'] += 1
                        m2 = re.match(r';\s*&[0-9a-f]{4} = [A-Za-z_]\w*(\s*[+-]\s*&?[0-9a-fA-F]+)?\s*', comment and ';' + comment or '')
                        if m2:
                            comment = comment[m2.end() - 1:].strip()
            elif mode == 'rel':
                s = sym_for(v, cn)
                if s is None:
                    s = '&%04X' % v
                    stats['rel_num'] += 1
                operand = s
            elif opw == 1:
                s = None
                if cn and (cn[0], v - cn[1]) in zp_names:
                    s = zp_names[(cn[0], v - cn[1])] + (f' + {cn[1]}' if cn[1] else '')
                if s is None:
                    s = '&%02X' % v
                    stats['zp_num'] += 1
                else:
                    stats['zp_sym'] += 1
                operand = m6502.MODES[mode][1].format(s)
            else:
                if v < 0x100 and m6502.shrinks(mn, mode):
                    raw = True
                s = sym_for(v, cn)
                if s is None:
                    s = '&%04X' % v
                    stats['abs_num'] += 1
                else:
                    stats['abs_sym'] += 1
                operand = m6502.MODES[mode][1].format(s)
            line = mn + (' ' + operand if operand else '')
            if mode == 'acc':
                line = mn + ' A'
            if raw:
                out.append(ind + f'EQUB &{bs[0]:02X} : EQUW {s}    \\ {line} - absolute, not zero page' +
                           (f'  {comment}' if comment else ''))
                stats['raw_abs_zp'] += 1
            else:
                out.append((ind + f'{line:<32}' + ('\\ ' + comment if comment else '')).rstrip())
            pc += len(bs)
        return out

    header = ('\\ {name}.6502 - {what}\n'
              '\\\n'
              '\\ Created once by tools/disasm2baron.py from Level7\'s disassembly,\n'
              '\\ reference/dare-devil-denis-disassembly.txt (lines starting "\\ " carry its annotations).\n'
              '\\ Hand-maintained from here on. INCLUDEd inside its SECTION by src/main.6502.\n\n')
    whats = {
        'game': 'the game (DENIS3), &0E00-&348F, entered at entry_point (&3475)',
        'denis2': 'DENIS2 from &40E9, after its BASIC: the tune player, loading screen and leftovers',
    }
    for f, items in files.items():
        (SRC / f'{f}.6502').write_text(header.format(name=f, what=whats[f]) + '\n'.join(emit_file(items)) + '\n')

    zl = ['\\ zp.6502 - zero page names and workspace outside the program.',
          '\\',
          '\\ Created once by tools/disasm2baron.py from the disassembly\'s operand comments. The game',
          '\\ reuses zero page freely, so one address often has several names, each the one the',
          '\\ disassembly uses in that routine. Hand-maintained from here on.', '',
          '\\ ---- zero page ----']
    for nm, a in sorted(zp_consts.items(), key=lambda x: (x[1], x[0])):
        zl.append(f'{nm:<40} = &{a:02X}')
    zl += ['', '\\ ---- workspace and screen (not part of any file) ----']
    for nm, a in sorted(consts.items(), key=lambda x: (x[1], x[0])):
        zl.append(f'{nm:<40} = &{a:04X}')
    (SRC / 'zp.6502').write_text('\n'.join(zl) + '\n')
    print(dict(stats))
    print(f'labels {len(labels)}, inner symbols {len(inner)}, zp names {len(zp_consts)}, '
          f'workspace constants {len(consts)}')


if __name__ == '__main__':
    main()
