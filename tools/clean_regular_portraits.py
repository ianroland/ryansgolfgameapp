"""Craps regulars' portraits (CRAPS_REGULARS_ASSET_PACK): remove scraps of neighbouring sheet cells that the
pack's automatic background removal left behind. Pixels are never repainted; scraps are only made transparent.

1. Transparent gutters: keep the run of columns, then the run of rows, holding most of the picture
   (removes pieces of the cells beside and above, which sit across an empty gap).
2. Thin strips at the top: full-width rows near the top (one or two pixels tall) that are much wider than
   the row below are cleared.
3. Loose pieces: keep the character (the largest shape) and anything within 3 px of it (hair wisps,
   earrings); drop the rest.
Usage: clean_regular_portraits.py SRC_DIR OUT_DIR [REPORT_PNG]
"""
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage


def runs(mask1d):
    out, start = [], None
    for i, v in enumerate(list(mask1d) + [False]):
        if v and start is None:
            start = i
        elif not v and start is not None:
            out.append((start, i))
            start = None
    return out


def clean(a):
    solid = a[..., 3] > 0
    keep = solid.copy()
    # 1. gutters
    for axis in (0, 1):
        has = keep.any(axis=axis)
        rs = runs(has)
        if len(rs) > 1:
            weight = [keep[:, s:e].sum() if axis == 0 else keep[s:e, :].sum() for s, e in rs]
            s, e = rs[int(np.argmax(weight))]
            if axis == 0:
                keep[:, :s] = False
                keep[:, e:] = False
            else:
                keep[:s, :] = False
                keep[e:, :] = False
    # 2. thin full-width strips at the top
    rows = keep.sum(1)
    top = int(np.argmax(rows > 0)) if rows.any() else 0
    y = top
    while y < min(top + 3, 40) and rows[y] >= 150 and rows[y + 1] < 0.6 * rows[y]:
        keep[y, :] = False
        y += 1
    # 3. loose pieces
    lab, n = ndimage.label(keep, structure=np.ones((3, 3)))
    if n > 1:
        sizes = ndimage.sum(keep, lab, range(1, n + 1))
        main = lab == int(np.argmax(sizes)) + 1
        near = ndimage.binary_dilation(main, iterations=3)
        ok = np.zeros(n + 1, bool)
        ok[np.unique(lab[near & keep])] = True
        ok[0] = False
        keep = ok[lab]
    return keep


src, out = sys.argv[1], sys.argv[2]
report = sys.argv[3] if len(sys.argv) > 3 else None
tiles = []
for rid in sorted(os.listdir(src)):
    for face in ('neutral', 'happy', 'groan'):
        a = np.array(Image.open(f'{src}/{rid}/{face}.png').convert('RGBA'))
        keep = clean(a)
        removed = (a[..., 3] > 0) & ~keep
        b = a.copy()
        b[~keep] = 0
        os.makedirs(f'{out}/{rid}', exist_ok=True)
        # Exact: keep the pack's own palette file and only point the scrap pixels at its transparent colour.
        src_im = Image.open(f'{src}/{rid}/{face}.png')
        if src_im.mode == 'P' and isinstance(src_im.info.get('transparency'), int):
            idx = np.array(src_im)
            idx[removed] = src_im.info['transparency']
            o = Image.fromarray(idx, 'P')
            o.putpalette(src_im.getpalette())
            o.save(f'{out}/{rid}/{face}.png', optimize=True, transparency=src_im.info['transparency'])
        else:
            Image.fromarray(b).save(f'{out}/{rid}/{face}.png', optimize=True)
        print(f'{rid}/{face}: removed {int(removed.sum())} px')
        if report:
            t = Image.new('RGBA', (256, 256), (255, 0, 255, 255))
            t.alpha_composite(Image.fromarray(b))
            v = np.array(t)
            v[removed] = [0, 255, 0, 255]
            tiles.append(Image.fromarray(v))
if report:
    sheet = Image.new('RGB', (3 * 140, 9 * 140), 'black')
    for k, t in enumerate(tiles):
        r, c = divmod(k, 3)
        sheet.paste(t.convert('RGB').resize((136, 136), Image.NEAREST), (c * 140, r * 140))
    sheet.save(report)
