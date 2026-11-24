"""Spin to Win art: cut the supplied concept sheet (art/source_sheets/spin_wheel/spin_wheel_concept_sheet.png,
1536x1024 RGB, no alpha) into the pieces the game uses, and write src/assets/casino/spin/atlas.json with
every crop rectangle, size and the overlay geometry on each cabinet.

- Cabinets: each casino's machine is used whole (opaque). The game draws its own wheel, odds and
  controls over the painted wheel, PAYOUTS panel and BET / SPIN controls (the painted labels and
  payouts are sample art, not rules).
- Small pieces (emblems, pointers, SPIN buttons, meters, chip buttons, panels) sit on the sheet's dark
  slate background (about #1e1b21): that background is removed by a flood fill from the crop edge
  (colour distance under 40), keeping a soft edge. Emblems are cut to their circle.
Nothing is redrawn. Usage: python3 tools/cut_spin_wheel.py
"""
import json
import os

import numpy as np
from PIL import Image
from scipy import ndimage

SRC = 'art/source_sheets/spin_wheel/spin_wheel_concept_sheet.png'
OUT = 'src/assets/casino/spin'
os.makedirs(OUT, exist_ok=True)
sheet = Image.open(SRC).convert('RGB')
BG = np.array([30, 27, 33])
atlas = {'source': SRC, 'pieces': {}, 'cabinets': {}}


def save(name, im, crop, **extra):
    im.save(f'{OUT}/{name}.webp', quality=92, method=6, alpha_quality=100)
    atlas['pieces'][name] = {'crop': list(crop), 'w': im.width, 'h': im.height, **extra}


def keyed(box):
    """Crop and remove the slate background connected to the crop's edge."""
    a = np.asarray(sheet.crop(box)).astype(int)
    near = np.abs(a - BG).sum(2) < 40
    lab, _ = ndimage.label(near)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(edge))
    alpha = np.where(bg, 0, 255).astype(np.uint8)
    # Soft edge: one pixel of partial alpha where the piece meets the removed background.
    grown = ndimage.binary_dilation(bg, iterations=1) & ~bg
    alpha[grown] = 150
    rgba = np.dstack([a.astype(np.uint8), alpha])
    return Image.fromarray(rgba, 'RGBA')


def circle(box):
    a = np.asarray(sheet.crop(box).convert('RGBA')).copy()
    h, w = a.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    r = min(w, h) / 2 - 1
    d = np.sqrt((xx - (w - 1) / 2) ** 2 + (yy - (h - 1) / 2) ** 2)
    a[..., 3] = np.clip((r - d + 0.5) * 255, 0, 255).astype(np.uint8)
    return Image.fromarray(a, 'RGBA')


# Cabinets (origin = top-left of the crop; all overlay geometry below is in cabinet pixels).
CAB = {'desert_palms': 0, 'white_buffalo': 512, 'morongo_sky': 1024}
GEOM = {
    # wheel: centre and radius of the painted wheel's coloured disc (fitted to its gold rim);
    # pays: the painted PAYOUTS panel; bet: the painted BET selector; spin: the painted SPIN button.
    'desert_palms': {'wheel': [197.3, 240.6, 121], 'pays': [331, 113, 141, 255], 'bet': [76, 376, 201, 46], 'spin': [299, 369, 153, 58]},
    'white_buffalo': {'wheel': [189.9, 237.9, 121], 'pays': [334, 113, 134, 253], 'bet': [79, 377, 198, 45], 'spin': [301, 369, 153, 56]},
    'morongo_sky': {'wheel': [190.7, 237.2, 121], 'pays': [332, 113, 134, 253], 'bet': [79, 377, 198, 45], 'spin': [299, 369, 154, 56]},
}
for loc, x0 in CAB.items():
    box = (x0 + 4, 4, x0 + 508, 538)
    cab = sheet.crop(box)
    cab.save(f'{OUT}/{loc}_cabinet.webp', quality=92, method=6)
    atlas['cabinets'][loc] = {'crop': list(box), 'w': cab.width, 'h': cab.height, **GEOM[loc]}

EMBLEM = {'desert_palms': (10, 670, 129, 790), 'white_buffalo': (132, 668, 254, 789), 'morongo_sky': (259, 667, 379, 789)}
POINTER = {'desert_palms': (400, 673, 456, 753), 'white_buffalo': (472, 674, 527, 752), 'morongo_sky': (542, 672, 597, 752)}
SPIN = {'desert_palms': (21, 804, 169, 860), 'white_buffalo': (183, 800, 337, 860), 'morongo_sky': (353, 801, 493, 858)}
SPIN_DIM = {'desert_palms': (21, 863, 169, 914), 'white_buffalo': (184, 863, 337, 913), 'morongo_sky': (354, 863, 493, 914)}
PANEL = {'desert_palms': (9, 923, 316, 1016), 'white_buffalo': (320, 925, 623, 1016), 'morongo_sky': (629, 924, 932, 1016)}
for loc in CAB:
    save(f'{loc}_emblem', circle(EMBLEM[loc]), EMBLEM[loc])
    save(f'{loc}_pointer', keyed(POINTER[loc]), POINTER[loc])
    save(f'{loc}_spin', keyed(SPIN[loc]), SPIN[loc])
    save(f'{loc}_spin_dim', keyed(SPIN_DIM[loc]), SPIN_DIM[loc])
    save(f'{loc}_panel', keyed(PANEL[loc]), PANEL[loc], slice=[18, 18, 18, 18])

# Meters (shared): the painted digits are covered by the game; `window` is the LCD area in meter pixels.
METERS = {'credits': (1027, 810, 1191, 902), 'bet': (1206, 810, 1348, 902), 'win': (1362, 810, 1520, 902)}
for k, box in METERS.items():
    im = keyed(box)
    a = np.asarray(im).astype(int)
    dark = (a[..., :3].max(2) < 45) & (a[..., 3] > 200)
    dark[: a.shape[0] // 3] = False
    lab, _ = ndimage.label(dark)
    sizes = ndimage.sum(dark, lab, range(1, lab.max() + 1))
    big = lab == (int(np.argmax(sizes)) + 1)
    ys, xs = np.nonzero(big)
    save(f'meter_{k}', im, box, window=[int(xs.min()), int(ys.min()), int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1)])

# Chip buttons (shared): the sheet's 1 / 5 / 10 / 25 / 50 / 100 buttons, which match the wheel's chips.
CHIPS = {1: (522, 855, 595, 907), 5: (603, 854, 677, 906), 10: (681, 856, 753, 907), 25: (760, 855, 835, 907), 50: (842, 855, 920, 907), 100: (925, 856, 1006, 907)}
for v, box in CHIPS.items():
    save(f'chip_{v}', keyed(box), box)

with open(f'{OUT}/atlas.json', 'w') as f:
    json.dump(atlas, f, indent=1)
print(len(atlas['pieces']), 'pieces,', len(atlas['cabinets']), 'cabinets')
