"""Cut the golfer sprite sheet into aligned, transparent frames + an atlas.

Usage: python3 -I extract_sprites.py <sheet.png> <out_dir>
"""
import json
import sys

import numpy as np
from PIL import Image

SRC, OUT = sys.argv[1], sys.argv[2]
im = Image.open(SRC).convert("RGB")
A = np.asarray(im).astype(np.int16)
R, G, B = A[..., 0], A[..., 1], A[..., 2]

# Background = the felt green and its darker shadow ellipses.
green = (G > R * 1.18) & (G > B * 1.35)
# Grid lines / label boxes are excluded by only scanning below the labels.
fg = ~green

# (name, expected frames, x0, x1, y0, y1)  — y0 starts below the label badges.
SECTIONS = [
    ("idle", 4, 330, 805, 62, 232),
    ("walk", 6, 860, 1600, 62, 232),
    ("win", 4, 1650, 2165, 58, 232),
    ("swing", 12, 20, 2165, 292, 478),
    ("putt", 6, 20, 850, 538, 700),
    ("pickup", 4, 880, 1490, 538, 700),
    ("misc", 4, 1510, 2165, 538, 700),
]


def runs(mask_1d, min_gap):
    """Index ranges where mask is true, merging gaps smaller than min_gap."""
    idx = np.flatnonzero(mask_1d)
    if idx.size == 0:
        return []
    out = [[idx[0], idx[0]]]
    for i in idx[1:]:
        if i - out[-1][1] <= min_gap:
            out[-1][1] = i
        else:
            out.append([i, i])
    return out


frames = {}
for name, n, x0, x1, y0, y1 in SECTIONS:
    sub = fg[y0:y1, x0:x1]
    col = sub.sum(axis=0) >= 2
    gap = 4
    rs = runs(col, gap)
    # Drop specks.
    rs = [r for r in rs if r[1] - r[0] >= 4]
    # Thin slivers (a club shaft split from its golfer) join their nearest neighbour.
    changed = True
    while changed and len(rs) > 1:
        changed = False
        for i, r in enumerate(rs):
            if r[1] - r[0] < 25:
                left_gap = r[0] - rs[i - 1][1] if i > 0 else 1e9
                right_gap = rs[i + 1][0] - r[1] if i < len(rs) - 1 else 1e9
                j = i - 1 if left_gap <= right_gap else i + 1
                lo, hi = min(i, j), max(i, j)
                rs[lo] = [rs[lo][0], rs[hi][1]]
                del rs[hi]
                changed = True
                break
    # Merge until we reach the expected count (clubs can split a frame).
    while len(rs) > n:
        gaps = [rs[i + 1][0] - rs[i][1] for i in range(len(rs) - 1)]
        i = int(np.argmin(gaps))
        rs[i] = [rs[i][0], rs[i + 1][1]]
        del rs[i + 1]
    if len(rs) != n:
        print(f"WARN {name}: found {len(rs)} expected {n}", file=sys.stderr)
    out = []
    for a, b in rs:
        cx0, cx1 = x0 + a, x0 + b + 1
        m = fg[y0:y1, cx0:cx1]
        rows = np.flatnonzero(m.any(axis=1))
        cy0, cy1 = y0 + rows[0], y0 + rows[-1] + 1
        crop_mask = fg[cy0:cy1, cx0:cx1]
        crop_rgb = A[cy0:cy1, cx0:cx1].astype(np.uint8)
        # Feet anchor: bottom band, leftmost cluster of pixels (the shoes, not the club head).
        h = cy1 - cy0
        band = crop_mask[max(0, h - 14):h]
        cols = band.any(axis=0)
        feet_runs = runs(cols, 6)
        # Shoes: the widest run among the left-most two (club head is small and to the right).
        feet_runs = sorted(feet_runs, key=lambda r: r[0])
        cand = [r for r in feet_runs if r[1] - r[0] >= 8] or feet_runs
        left = cand[0]
        group = [left] + [r for r in cand[1:] if r[0] - left[1] < 14 and r[1] - r[0] >= 8]
        fx = (group[0][0] + group[-1][1]) / 2
        out.append({"rgb": crop_rgb, "mask": crop_mask, "anchor": (fx, h), "src": (int(cx0), int(cy0))})
    frames[name] = out
    print(name, [(f["src"][0], f["rgb"].shape[1], f["rgb"].shape[0]) for f in out])

# Portrait.
portrait = im.crop((28, 24, 230, 216))

# Pack an atlas: each frame keeps its own size; record anchor (feet) in px.
pad = 2
atlas_w = 2048
x = y = row_h = 0
placed = []
for name, fl in frames.items():
    for i, f in enumerate(fl):
        h, w = f["mask"].shape
        if x + w + pad > atlas_w:
            x, y, row_h = 0, y + row_h + pad, 0
        placed.append((name, i, x, y, f))
        x += w + pad
        row_h = max(row_h, h)
atlas_h = y + row_h + pad
atlas = np.zeros((atlas_h, atlas_w, 4), np.uint8)
meta = {"frames": {}, "image": "golfer_atlas.png"}
for name, i, px, py, f in placed:
    h, w = f["mask"].shape
    rgba = np.dstack([f["rgb"], (f["mask"] * 255).astype(np.uint8)])
    atlas[py:py + h, px:px + w] = rgba
    meta["frames"].setdefault(name, []).append(
        {"x": int(px), "y": int(py), "w": int(w), "h": int(h), "ax": round(float(f["anchor"][0]), 1), "ay": int(f["anchor"][1])}
    )

# Trim unused width.
used_w = max(px + f["mask"].shape[1] for _, _, px, _, f in placed) + pad
atlas = atlas[:, :used_w]
Image.fromarray(atlas, "RGBA").save(f"{OUT}/golfer_atlas.png", optimize=True)
portrait.save(f"{OUT}/golfer_portrait.png", optimize=True)
# Where the drawn ball sits relative to the feet anchor (px), per animation's address frame.
def ball_dx(name, i):
    f = frames[name][i]
    h = f["mask"].shape[0]
    band = f["mask"][max(0, h - 12):h]
    rr = runs(band.any(axis=0), 1)
    r = rr[-1]
    return round((r[0] + r[1]) / 2 - f["anchor"][0], 1)
meta["ballDx"] = {"idle": ball_dx("idle", 0), "swing": ball_dx("swing", 0), "putt": ball_dx("putt", 1)}
# Median standing height (idle) for scaling to yards.
meta["standHeightPx"] = int(np.median([f["mask"].shape[0] for f in frames["idle"]]))
with open(f"{OUT}/golfer_atlas.json", "w") as fh:
    json.dump(meta, fh, indent=1)
print("atlas", atlas.shape, "stand height", meta["standHeightPx"])
