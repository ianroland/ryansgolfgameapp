"""Cut the UI asset pack: logo, menu icons, clubhouse interior sprites, extra backdrops.

Usage: python3 tools/extract_ui_kit.py art/ui_kit_source.png src/assets
"""
import json
import os
import sys

import numpy as np
from PIL import Image

SRC, OUT = sys.argv[1], sys.argv[2]
im = Image.open(SRC).convert("RGB")
A = np.asarray(im).astype(np.int16)
dist = np.abs(A - np.array([12, 2, 21])).sum(axis=2)

# (x0, y0, x1, y1) boxes, surveyed from the sheet's connected components.
SPRITES = {
    "logo": (12, 4, 377, 70),
    # Menu icons
    "icon_trophy": (1221, 780, 1252, 809),
    "icon_coins": (1255, 780, 1286, 809),
    "icon_cart": (1289, 780, 1321, 808),
    "icon_sofa": (1325, 783, 1359, 807),
    "icon_flag": (1363, 780, 1396, 810),
    "icon_gear": (1401, 780, 1430, 808),
    "icon_disk": (1435, 781, 1462, 808),
    "icon_x": (1469, 782, 1494, 807),
    "icon_check": (1500, 780, 1530, 808),
    # Clubhouse interior
    "sofa": (12, 894, 242, 1008),
    "lamp": (238, 888, 278, 1003),
    "coffee_table": (276, 929, 386, 1008),
    "bookshelf": (396, 869, 509, 1008),
    "plant": (512, 875, 589, 1008),
    "painting_0": (592, 878, 711, 963),
    "painting_1": (717, 877, 840, 963),
    "rug": (606, 976, 856, 1018),
    "window": (846, 870, 993, 990),
    "shoes": (982, 978, 1033, 1008),
    "golf_bag": (1034, 869, 1095, 1015),
}
BACKDROPS = {"lake": (405, 36, 745, 117), "sunset": (1149, 36, 1519, 117)}


def cut(box):
    x0, y0, x1, y1 = box
    rgb = A[y0:y1, x0:x1].astype(np.uint8)
    d = dist[y0:y1, x0:x1]
    alpha = np.clip((d - 22) * 255 / 40, 0, 255).astype(np.uint8)
    rgba = np.dstack([rgb, alpha])
    rows = np.flatnonzero((alpha > 100).any(axis=1))
    cols = np.flatnonzero((alpha > 100).any(axis=0))
    return rgba[rows[0]: rows[-1] + 1, cols[0]: cols[-1] + 1]


os.makedirs(os.path.join(OUT, "ui"), exist_ok=True)
meta = {}
from scipy import ndimage


def strip_slivers(rgba):
    # Remove thin tall components (frame lines touching the logo box).
    lab, n = ndimage.label(rgba[..., 3] > 60, structure=ndimage.generate_binary_structure(2, 1))
    for i, sl in enumerate(ndimage.find_objects(lab)):
        h = sl[0].stop - sl[0].start
        w = sl[1].stop - sl[1].start
        if w <= 8 and h > 40:
            rgba[..., 3][lab == i + 1] = 0
    return rgba


for name, box in SPRITES.items():
    rgba = cut(box)
    if name == "logo":
        rgba = strip_slivers(rgba)
    Image.fromarray(rgba, "RGBA").save(os.path.join(OUT, "ui", f"{name}.png"), optimize=True)
    meta[name] = {"w": int(rgba.shape[1]), "h": int(rgba.shape[0])}
for name, box in BACKDROPS.items():
    b = im.crop(box)
    wrap = Image.new("RGB", (b.width * 2, b.height))
    wrap.paste(b, (0, 0))
    wrap.paste(b.transpose(Image.FLIP_LEFT_RIGHT), (b.width, 0))
    wrap.save(os.path.join(OUT, f"backdrop_{name}.png"), optimize=True)
with open(os.path.join(OUT, "ui", "ui_sprites.json"), "w") as fh:
    json.dump(meta, fh, indent=1)
print(json.dumps(meta))
