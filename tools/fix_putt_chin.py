"""Phase-1 putting frames: remove the double chin left by fix_putt_phase1.py.

That tool pasted the approved reference head only above the collar row, so on the front of the
neck (where the collar slants down) the OLD frame's chin stayed visible under the new one.
Here, in the rows just under the collar row, everything in front of the collar is replaced by
the reference's own chin and neck (same offset as the head paste). Body, arms and putter are untouched.

usage: python3 tools/fix_putt_chin.py <atlas.png> <out.png> <atlas.json> [ref.png]
"""
import json
import sys

import numpy as np
from PIL import Image

ATL, OUTP, JS = sys.argv[1], sys.argv[2], sys.argv[3]
REF = sys.argv[4] if len(sys.argv) > 4 else 'tools/putt_phase1_ref_small.png'
ROWS = 12  # rows under the collar row that the old chin can reach

m = json.load(open(JS))
atlas = np.array(Image.open(ATL).convert('RGBA'))
ref = np.array(Image.open(REF).convert('RGBA'))


def skin(a):
    r, g, b = [a[..., i].astype(int) for i in range(3)]
    return (a[..., 3] > 0) & (r > 170) & (r - b > 60) & (g > 90) & (g < 200)


def navy(a):
    r, g, b = [a[..., i].astype(int) for i in range(3)]
    return (a[..., 3] > 0) & (b > 70) & (b - r > 30) & (r < 90)


def collarish(a):
    """Shirt and its white collar stripe."""
    r, g, b = [a[..., i].astype(int) for i in range(3)]
    white = (a[..., 3] > 0) & (r > 190) & (g > 190) & (b > 190)
    return navy(a) | white


def geom(a):
    al = a[..., 3] > 0
    ys, _ = np.nonzero(al)
    top = ys.min()
    nv = navy(a)
    collar = [y for y in range(top, top + 60) if nv[y].sum() >= 3][0]
    sk = skin(a)
    hd = np.zeros_like(al)
    hd[top:collar] = True
    return collar, np.nonzero((sk & hd).any(0))[0].max()


def front(a, y):
    xs = np.nonzero(collarish(a)[y])[0]
    return int(xs.max()) if len(xs) else None


rc, rf = geom(ref)
# Only the reference's chin and neck travel: skin, plus outline pixels touching skin. Its collar
# outline stays behind (the frames' collars sit elsewhere, so it would float).
from scipy import ndimage as ndi
_sk = skin(ref) | (lambda r, g, b: (ref[..., 3] > 0) & (r > 120) & (r - b > 40))(*[ref[..., i].astype(int) for i in range(3)])
CHIN = _sk | (ndi.binary_dilation(_sk, structure=np.ones((3, 3))) & (ref[..., 3] > 0) & ~collarish(ref))
report = []
for f in m['frames']['putt']:
    a = atlas[f['y']:f['y'] + f['h'], f['x']:f['x'] + f['w']].copy()
    H, W = a.shape[:2]
    c, fx = geom(a)  # the head is already the reference's, so this gives the paste offset
    dx, dy = fx - rf, c - rc
    changed = 0
    for y in range(rc, rc + ROWS):
        ty = y + dy
        if not (0 <= ty < H) or y >= ref.shape[0]:
            continue
        rfront = front(ref, y)
        if rfront is None:
            continue
        # In front of the reference's own collar line (moved by the head's offset), the row becomes
        # the reference's row exactly: its chin and neck in, the old chin out.
        bx = rfront + dx
        for tx in range(max(0, bx + 1), W):
            x = tx - dx
            px = ref[y, x] if 0 <= x < ref.shape[1] and CHIN[y, x] else np.zeros(4, np.uint8)
            if (a[ty, tx] != px).any():
                a[ty, tx] = px
                changed += 1
    atlas[f['y']:f['y'] + f['h'], f['x']:f['x'] + f['w']] = a
    report.append((dx, dy, changed))
Image.fromarray(atlas, 'RGBA').save(OUTP)
print(report)
