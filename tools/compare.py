"""
compare.py - check the built disc against the reference, file by file and catalogue entry by entry.

    python tools/compare.py [build/ddd.ssd] [reference/sth/DareDevilDenis.ssd]

The reference is the Stairway to Hell disc (decision 1). Files are paired by name. For each pair:
the bytes, the load and exec addresses (all 18 bits the catalogue holds) and the start sector.
Then the disc title and boot option. Not compared, and said so: the catalogue's write-cycle
count, and the slack between a file's last byte and the next sector, which on the reference
holds leftovers of whatever was on the disc before (79 bytes after DENIS, 2 after LOAD).
A file in the build with no reference partner (INFO, later) is listed but not compared.
Exit status 0 only if every paired file and every compared field is identical.

Forked from Stryker's Run's tools/compare.py.
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FILES = ['DENIS3', 'DENIS2', 'DENIS', '!BOOT', 'LOAD']


def catalogue(path):
    d = Path(path).read_bytes()
    n = d[256 + 5] // 8
    out = {}
    for i in range(n):
        name = d[8 + i * 8:8 + i * 8 + 7].decode('latin1').rstrip()
        dr = chr(d[8 + i * 8 + 7] & 0x7F)
        e = d[256 + 8 + i * 8:256 + 16 + i * 8]
        load = e[0] | e[1] << 8 | ((e[6] >> 2) & 3) << 16
        exe = e[2] | e[3] << 8 | ((e[6] >> 6) & 3) << 16
        ln = e[4] | e[5] << 8 | ((e[6] >> 4) & 3) << 16
        st = ((e[6] & 3) << 8) | e[7]
        key = name if dr == '$' else dr + '.' + name
        out[key] = dict(load=load, exec=exe, sector=st, locked=bool(d[8 + i * 8 + 7] & 0x80),
                        data=d[st * 256:st * 256 + ln])
    return out


def header(path):
    d = Path(path).read_bytes()
    return dict(title=(d[0:8] + d[256:260]).decode('latin1').rstrip('\0 '),
                opt=(d[256 + 6] >> 4) & 3, sectors=((d[256 + 6] & 3) << 8) | d[256 + 7],
                cycle=d[256 + 4])


def main():
    built = sys.argv[1] if len(sys.argv) > 1 else ROOT / 'build' / 'ddd.ssd'
    ref = sys.argv[2] if len(sys.argv) > 2 else ROOT / 'reference' / 'sth' / 'DareDevilDenis.ssd'
    if not Path(ref).exists():
        print(f'reference {ref} absent: not compared')
        return 0
    b, r = catalogue(built), catalogue(ref)
    ok = True
    for name in FILES:
        if name not in b:
            print(f'  {name:8} not built')
            ok = False
            continue
        x, y = b[name], r[name]
        diffs = [i for i in range(min(len(x['data']), len(y['data']))) if x['data'][i] != y['data'][i]]
        meta = [f'{k} built &{x[k]:X} reference &{y[k]:X}' for k in ('load', 'exec', 'sector', 'locked')
                if x[k] != y[k]]
        if not diffs and len(x['data']) == len(y['data']) and not meta:
            print(f'  {name:8} {len(x["data"]):6} bytes  identical (load &{x["load"]:05X} exec &{x["exec"]:05X}, sector {x["sector"]})')
            continue
        ok = False
        print(f'  {name:8} DIFFERS: built {len(x["data"])} bytes, reference {len(y["data"])}; {len(diffs)} bytes differ')
        for m in meta:
            print(f'           {m}')
        for i in diffs[:12]:
            print(f'           +&{i:04X} (&{(x["load"] + i) & 0xFFFF:04X}): built &{x["data"][i]:02X} reference &{y["data"][i]:02X}')
    for name in sorted(set(b) - set(FILES)):
        print(f'  {name:8} {len(b[name]["data"]):6} bytes  (no reference partner)')
    hb, hr = header(built), header(ref)
    for k in ('title', 'opt', 'sectors'):
        if hb[k] != hr[k]:
            ok = False
            print(f'  disc {k}: built {hb[k]!r}, reference {hr[k]!r}')
    print(f'  disc title {hb["title"]!r}, boot option {hb["opt"]}, {hb["sectors"]} sectors '
          f'(write cycle not compared: built {hb["cycle"]}, reference {hr["cycle"]})')
    print('ALL IDENTICAL' if ok else 'NOT IDENTICAL')
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
