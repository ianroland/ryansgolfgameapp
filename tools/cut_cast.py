"""Cut the supporting-cast sheet (10 rows: big portrait, 7 expression heads,
then full-body poses) into individual transparent sprites.

Usage: python3 -I tools/cut_cast.py <cast_sheet.png> <out_dir>
Writes <out_dir>/<row>/portrait.png, head_0..6.png, body_<n>.png and manifest.json.
"""
import json, sys
from pathlib import Path
import numpy as np
from PIL import Image

src, out = Path(sys.argv[1]), Path(sys.argv[2])
im = np.array(Image.open(src).convert('RGBA'))
im[..., 3] = np.where(im[..., 3] >= 64, 255, 0)
A = im[..., 3] > 0
H, W = A.shape

def bands(mask1d, min_gap, min_len):
    out, start, gap = [], None, 0
    for i, v in enumerate(list(mask1d) + [False] * (min_gap + 1)):
        if v:
            if start is None: start = i
            gap = 0
            end = i
        elif start is not None:
            gap += 1
            if gap > min_gap:
                if end - start + 1 >= min_len: out.append((start, end + 1))
                start = None
    return out

def trim(x0, y0, x1, y1):
    sub = A[y0:y1, x0:x1]
    ys, xs = np.nonzero(sub)
    if not len(ys): return None
    return x0 + xs.min(), y0 + ys.min(), x0 + xs.max() + 1, y0 + ys.max() + 1

def save(box, path):
    x0, y0, x1, y1 = box
    Image.fromarray(im[y0:y1, x0:x1]).save(path)
    return {'w': int(x1 - x0), 'h': int(y1 - y0), 'ax': round((x1 - x0) / 2, 1), 'ay': int(y1 - y0), 'sheet': [int(x0), int(y0)]}

# Row bands from the body columns (x > 680), where rows have clear gaps.
rows = bands(A[:, 690:].sum(1) > 0, 3, 40)
manifest = {'source': src.name, 'rows': []}
HEADS_X0, HEADS_X1, PORTRAIT_X1 = 140, 676, 138
for r, (y0, y1) in enumerate(rows):
    d = out / str(r); d.mkdir(parents=True, exist_ok=True)
    row = {'row': r, 'heads': [], 'bodies': []}
    # Big portrait: the left column, bounded vertically by this row band (+ a little).
    pb = trim(0, max(0, y0 - 6), PORTRAIT_X1, min(H, y1 + 6))
    if pb: row['portrait'] = save(pb, d / 'portrait.png')
    cw = (HEADS_X1 - HEADS_X0) / 7
    for k in range(7):
        hb = trim(int(HEADS_X0 + k * cw) + 1, y0, int(HEADS_X0 + (k + 1) * cw) - 1, y1)
        if hb: row['heads'].append(save(hb, d / f'head_{k}.png'))
    cols = bands(A[y0:y1, 690:].sum(0) > 0, 1, 6)
    # Poses that touch (wide characters) come out as one band: split those evenly.
    widths = sorted(c1 - c0 for c0, c1 in cols)
    med = widths[len(widths) // 2] if widths else 1
    split = []
    for c0, c1 in cols:
        k = max(1, round((c1 - c0) / med)) if (c1 - c0) > 1.6 * med else 1
        split += [(c0 + (c1 - c0) * j // k, c0 + (c1 - c0) * (j + 1) // k) for j in range(k)]
    cols = split
    for n, (c0, c1) in enumerate(cols):
        bb = trim(690 + c0, y0, 690 + c1, y1)
        if bb and bb[3] - bb[1] > 30: row['bodies'].append(save(bb, d / f'body_{len(row["bodies"])}.png'))
    manifest['rows'].append(row)
(out / 'manifest.json').write_text(json.dumps(manifest, indent=1))
print(len(rows), 'rows', [len(r['bodies']) for r in manifest['rows']])
