#!/usr/bin/env python3
"""
Cek "pindah saja" saat memecah file JS menjadi beberapa modul.

Membandingkan setiap deklarasi top-level (function / const / let, export maupun tidak)
di file lama dengan deklarasi bernama sama di file-file baru. Isi harus identik,
kecuali perubahan yang diizinkan (ALLOWED). Exit code 1 bila ada perbedaan lain.

Contoh:
  git show c48f8bf:client/src/services/tenantOperationalService.js > /tmp/old.js
  python3 docs/handoff/tools/compare_split.py /tmp/old.js client/src/services/tenant/*.js
"""
import difflib
import os
import re
import sys

DECL = re.compile(r'^(export\s+)?(async\s+)?(function\s+([A-Za-z0-9_]+)|const\s+([A-Za-z0-9_]+)|let\s+([A-Za-z0-9_]+))')

# Baris yang boleh berbeda: path dynamic import mockData ('./mockData' -> '../mockData')
# dan definisi IS_DEMO yang dipindah ke shared.js.
ALLOWED = [
    re.compile(r"import\('\.\.?/mockData'\)"),
    re.compile(r"^(export\s+)?const IS_DEMO\b"),
]


def blocks(path):
    res, cur, buf = {}, None, []
    for line in open(path, encoding='utf-8').read().split('\n'):
        m = DECL.match(line)
        if m:
            if cur:
                res[cur] = buf
            cur = m.group(4) or m.group(5) or m.group(6)
            buf = []
        if cur is not None:
            buf.append(line.rstrip())
    if cur:
        res[cur] = buf
    for v in res.values():  # JSDoc/komentar di ekor milik deklarasi berikutnya
        while v and (not v[-1].strip() or v[-1].strip().startswith(('/**', '*', '*/', '//'))):
            v.pop()
    return res


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    old = blocks(sys.argv[1])
    new = {}
    for f in sys.argv[2:]:
        for k, v in blocks(f).items():
            if k in new:
                print(f'DUPLIKAT: {k} ada di {new[k][0]} dan {os.path.basename(f)}')
            new[k] = (os.path.basename(f), v)

    bad = 0
    for name in old:
        if name not in new:
            print(f'HILANG: {name}')
            bad += 1
            continue
        fname, body = new[name]
        if body == old[name]:
            continue
        diff = [l for l in difflib.unified_diff(old[name], body, lineterm='', n=0)
                if l[:1] in '+-' and not l.startswith(('+++', '---'))]
        if all(any(p.search(l[1:].strip()) for p in ALLOWED) for l in diff):
            continue
        bad += 1
        print(f'BERUBAH: {name} ({fname})')
        for l in diff[:40]:
            print('   ', l)
    extra = [k for k in new if k not in old]
    if extra:
        print('BARU (tidak ada di file lama):', ', '.join(extra))
        bad += len(extra)
    print('OK: semua deklarasi identik' if bad == 0 else f'GAGAL: {bad} perbedaan')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
