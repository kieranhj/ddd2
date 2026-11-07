"""
check_disasm.py - check the Level7 disassembly's hex columns against the reference disc's files.

    python tools/check_disasm.py [reference/dare-devil-denis-disassembly.txt] [reference/sth/DareDevilDenis.ssd]

The disassembly was made from the TAPE release (files DDDenis1-3); the reference is the Stairway
to Hell DISC (decision 1). Each tape section is paired with the disc file holding the same bytes:

    DDDenis2 (&4000, BASIC + code)  <->  DENIS2 (catalogued at &1900, CHAINed with PAGE=&4000)
    DDDenis3 (&0E00, the game)      <->  DENIS3

DDDenis1 (the tape's BASIC loader) has no disc partner: the disc's DENIS is a different, shorter
program. Prints every byte the disassembly has that the disc disagrees with, every address the
disc has that the disassembly leaves out, and exit status 0 only if both are empty.
"""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from compare import catalogue  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
RX = re.compile(r'^\s*&([0-9a-f]{4})\s+((?:[0-9a-f]{2} ?)+)')
PAIRS = {'DDDenis2': ('DENIS2', 0x4000), 'DDDenis3': ('DENIS3', 0x0E00)}


def sections(text):
    """{section name: {address: byte}} from the '; DDDenisN' headers on."""
    out, cur = {}, None
    for line in text.splitlines():
        m = re.match(r'^; (DDDenis\d)\s*$', line)
        if m:
            cur = out.setdefault(m.group(1), {})
            continue
        m = RX.match(line)
        if m and cur is not None:
            a = int(m.group(1), 16)
            for i, h in enumerate(m.group(2).split()):
                if a + i in cur and cur[a + i] != int(h, 16):
                    print(f'  disassembly gives &{a + i:04X} twice, differently')
                cur[a + i] = int(h, 16)
    return out


def main():
    dis = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'reference' / 'dare-devil-denis-disassembly.txt'
    ssd = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / 'reference' / 'sth' / 'DareDevilDenis.ssd'
    secs = sections(dis.read_text(encoding='latin1'))
    cat = catalogue(ssd)
    ok = True
    for sec, (fname, base) in PAIRS.items():
        data = cat[fname]['data']
        got = secs[sec]
        wrong = [a for a in sorted(got) if not (0 <= a - base < len(data)) or data[a - base] != got[a]]
        missing = [base + i for i in range(len(data)) if base + i not in got]
        print(f'{sec} vs {fname}: {len(data)} bytes on disc, {len(got)} in the disassembly, '
              f'{len(wrong)} differ, {len(missing)} missing')
        for a in wrong[:40]:
            d = data[a - base] if 0 <= a - base < len(data) else None
            print(f'    &{a:04X}: disassembly &{got[a]:02X}, disc ' + (f'&{d:02X}' if d is not None else 'beyond end'))
        # runs of missing addresses
        runs, start = [], None
        for i, a in enumerate(missing):
            if start is None:
                start = a
            if i + 1 == len(missing) or missing[i + 1] != a + 1:
                runs.append((start, a))
                start = None
        for s, e in runs:
            print(f'    missing &{s:04X}-&{e:04X}: ' + ' '.join(f'{data[x - base]:02x}' for x in range(s, min(e + 1, s + 16))))
        ok = ok and not wrong and not missing
    print('DISASSEMBLY MATCHES DISC' if ok else 'DISASSEMBLY DIFFERS FROM DISC')
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
