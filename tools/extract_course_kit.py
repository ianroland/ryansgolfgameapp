"""Cut the course art kit into sprites, tiles and backdrops.

Usage: python3 tools/extract_course_kit.py art/course_kit_source.png src/assets
Outputs course_atlas.png + course_atlas.json (sprites with ground anchors),
tiles/*.png (64×64 ground textures) and backdrop_*.png.
"""
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

SRC, OUT = sys.argv[1], sys.argv[2]
im = Image.open(SRC).convert("RGB")
A = np.asarray(im).astype(np.int16)
BG = np.array([13, 7, 28])
dist = np.abs(A - BG).sum(axis=2)
FG = dist > 45

# name, x0, x1, y0, y1, names in left→right (then top→bottom) order
REGIONS = [
    ("palm", 8, 572, 232, 410, ["palm_0", "palm_1", "palm_2", "palm_double", "palm_3"]),
    ("oak", 578, 1175, 225, 410, ["oak_0", "oak_1", "oak_2", "oak_3"]),
    ("pine", 1180, 1532, 218, 410, ["pine_0", "pine_1", "pine_2", "pine_3"]),
    ("bush", 8, 652, 452, 530, ["bush_0", "bush_1", "bush_2", "bush_3", "bush_4"]),
    ("flower", 660, 1075, 455, 530, ["flower_0", "flower_1", "grass_0", "grass_1"]),
    ("rock", 1082, 1532, 432, 530, ["rock_0", "rock_1", "rock_2"]),
    ("tee", 12, 400, 882, 1000, ["cube_white", "ball_white", "cube_blue", "ball_blue", "cube_yellow", "ball_yellow", "cube_red", "ball_red", "post_0", "post_1", "post_2"]),
    ("flag", 415, 705, 878, 1000, ["flag_red", "flag_yellow", "flag_white", "flag_blue", "cup"]),
    ("acc", 715, 1240, 885, 1000, ["sign", "yard_100", "yard_150", "yard_200", "bench", "cooler", "trash"]),
]

TILES = {
    "fairway": (22, 732, 144, 816),
    "rough": (170, 732, 292, 816),
    "deep": (318, 732, 440, 816),
    "green": (490, 750, 566, 798),
    "rough2": (616, 732, 733, 816),
    "sand": (760, 587, 836, 659),
    "water": (1404, 576, 1516, 664),
}
BACKDROPS = {"coast": (300, 47, 715, 176), "city": (729, 47, 1113, 176), "mountains": (1128, 47, 1518, 176)}

MIN_AREA = {"palm": 2500, "oak": 2500, "pine": 2500, "bush": 800, "flower": 800, "rock": 800, "tee": 300, "flag": 300, "acc": 1000}
FOUR = ndimage.generate_binary_structure(2, 1)

sprites = {}
for region, x0, x1, y0, y1, names in REGIONS:
    d = dist[y0:y1, x0:x1]
    lab, n = ndimage.label(d > 30, structure=FOUR)
    ids = np.arange(1, n + 1)
    areas = ndimage.sum(np.ones_like(lab), lab, ids)
    objs = ndimage.find_objects(lab)
    def aspect(i):
        return (objs[i][1].stop - objs[i][1].start) / max(1, objs[i][0].stop - objs[i][0].start)
    big = [i for i in range(n) if areas[i] >= MIN_AREA[region] and aspect(i) < 6]
    groups = {i: [i] for i in big}
    # Attach fragments (and drop badge slivers) by bounding-box overlap.
    for i in range(n):
        if i in groups or areas[i] < 6:
            continue
        sl = objs[i]
        h = sl[0].stop - sl[0].start
        w = sl[1].stop - sl[1].start
        if h < 4 or w / max(1, h) > 7:
            continue
        best, best_ov = None, 0
        for j in big:
            bj = objs[j]
            ox = min(sl[1].stop, bj[1].stop) - max(sl[1].start, bj[1].start)
            oy = min(sl[0].stop, bj[0].stop) - max(sl[0].start, bj[0].start)
            if ox > -2 and oy > -2 and max(ox, 1) * max(oy, 1) > best_ov:
                best, best_ov = j, max(ox, 1) * max(oy, 1)
        if best is not None:
            groups[best].append(i)
    def bbox(g):
        sls = [objs[k] for k in g]
        return min(q[1].start for q in sls), max(q[1].stop for q in sls), min(q[0].start for q in sls), max(q[0].stop for q in sls)
    order = list(groups)
    if region in ("acc", "tee"):
        order.sort(key=lambda g: (round((bbox(groups[g])[0] + bbox(groups[g])[1]) / 2 / 35), bbox(groups[g])[2]))
    else:
        order.sort(key=lambda g: bbox(groups[g])[0])
    if len(order) != len(names):
        print(f"WARN {region}: {len(order)} objects, expected {len(names)}", file=sys.stderr)
        names = [f"{region}_{k}" for k in range(len(order))]
    for name, g in zip(names, order):
        bx0, bx1, by0, by1 = bbox(groups[g])
        own = np.isin(lab[by0:by1, bx0:bx1], [k + 1 for k in groups[g]])
        own = ndimage.binary_dilation(own, iterations=1)  # keep the soft edge
        dd = d[by0:by1, bx0:bx1]
        alpha = np.where(own, np.clip((dd - 22) * 255 / 40, 0, 255), 0).astype(np.uint8)
        rgb = A[y0 + by0:y0 + by1, x0 + bx0:x0 + bx1].astype(np.uint8)
        rgba = np.dstack([rgb, alpha])
        hh, ww = rgba.shape[:2]
        solid = alpha > 128
        cols = np.flatnonzero(solid[max(0, hh - 6):hh].any(axis=0))
        ax = float(cols.mean()) if cols.size else ww / 2
        sprites[name] = {"img": rgba, "ax": round(ax, 1), "ay": hh}
    print(region, [(nm, sprites[nm]["img"].shape[1], sprites[nm]["img"].shape[0]) for nm in names if nm in sprites])

# Pack atlas.
pad, atlas_w = 2, 1400
x = y = row_h = 0
placed = []
for name, s in sprites.items():
    h, w = s["img"].shape[:2]
    if x + w + pad > atlas_w:
        x, y, row_h = 0, y + row_h + pad, 0
    placed.append((name, x, y, s))
    x += w + pad
    row_h = max(row_h, h)
atlas = np.zeros((y + row_h + pad, atlas_w, 4), np.uint8)
meta = {"frames": {}}
for name, px, py, s in placed:
    h, w = s["img"].shape[:2]
    atlas[py:py + h, px:px + w] = s["img"]
    meta["frames"][name] = {"x": px, "y": py, "w": int(w), "h": int(h), "ax": s["ax"], "ay": s["ay"]}
used_w = max(px + s["img"].shape[1] for _, px, _, s in placed) + pad
Image.fromarray(atlas[:, :used_w], "RGBA").save(os.path.join(OUT, "course_atlas.png"), optimize=True)

# Tiles: crop, resample to 64×64.
os.makedirs(os.path.join(OUT, "tiles"), exist_ok=True)
for name, box in TILES.items():
    im.crop(box).resize((64, 64), Image.LANCZOS).save(os.path.join(OUT, "tiles", f"{name}.png"))
for name, box in BACKDROPS.items():
    # Mirror-double so the panorama wraps without a seam.
    b = im.crop(box)
    wrap = Image.new("RGB", (b.width * 2, b.height))
    wrap.paste(b, (0, 0))
    wrap.paste(b.transpose(Image.FLIP_LEFT_RIGHT), (b.width, 0))
    wrap.save(os.path.join(OUT, f"backdrop_{name}.png"), optimize=True)

with open(os.path.join(OUT, "course_atlas.json"), "w") as fh:
    json.dump(meta, fh, indent=1)
print("atlas", atlas.shape, "sprites", len(sprites))
