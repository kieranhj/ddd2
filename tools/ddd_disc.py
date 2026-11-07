"""Reading the rebuilt original: DENIS3 out of build/ddd.ssd, and the symbols Baron dumped.

DENIS3 in our build is byte identical to the Stairway to Hell disc's (tools/compare.py), so what
is read here is the original's.
"""
import json
import os
import sys

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), '..'))


def denis3():
    """(load address, bytes) of DENIS3. It loads at &1100 and runs copied down to &0E00; the
    symbols are the run addresses, so `load` here is the run address of its first byte."""
    img = open(os.path.join(ROOT, 'build', 'ddd.ssd'), 'rb').read()
    s0, s1 = img[0:256], img[256:512]
    for i in range(s1[5] // 8):
        if s0[8 + i * 8:8 + i * 8 + 7].decode('ascii').rstrip() != 'DENIS3':
            continue
        e = s1[8 + i * 8:16 + i * 8]
        length = e[4] | e[5] << 8 | ((e[6] >> 4) & 3) << 16
        sector = e[7] | (e[6] & 3) << 8
        return 0x0E00, img[sector * 256:sector * 256 + length]
    sys.exit('DENIS3 not in build/ddd.ssd - run .\\build.ps1 first')


def _find(obj, acc):
    if isinstance(obj, dict):
        for k, v in obj.items():
            if isinstance(v, dict) and 'value' in v and isinstance(v['value'], int):
                acc.setdefault(k, v['value'])
            else:
                _find(v, acc)
    elif isinstance(obj, list):
        for v in obj:
            _find(v, acc)
    return acc


def symbols():
    return _find(json.load(open(os.path.join(ROOT, 'build', 'ddd.symbols.json'))), {})
