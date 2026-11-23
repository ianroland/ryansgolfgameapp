"""Cleans Casino Chip Asset Pack V3 (FIXED) faces for the game.

The supplied 128x128 faces were cut from a concept sheet with a circular mask a little larger
than the chips, so dark shadow crescents and slivers of the chip stack below show inside the
circle (worst on $100, $500 and $1,000). This re-masks each face with a tighter anti-aliased
circle, per denomination. Originals stay in art/source_sheets/casino_chips_v3/.

Usage: python3 tools/clean_chip_faces.py <pack_dir> <out_dir>
"""
import json, os, sys
import numpy as np
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
# Circle (cx, cy, r) on the 128x128 canvas, per denomination (measured by eye on the pack).
MASK = {1: (64, 61, 50), 5: (64, 61, 50), 25: (64, 61, 50), 100: (64, 58, 47), 500: (64, 57, 46), 1000: (64, 58, 48)}
yy, xx = np.mgrid[0:128, 0:128]
meta = {}
for casino in ('desert_palms', 'white_buffalo', 'morongo_sky'):
    os.makedirs(f'{out}/{casino}', exist_ok=True)
    for d, (cx, cy, r) in MASK.items():
        a = np.array(Image.open(f'{src}/{casino}/chip_{d}_face_128.png').convert('RGBA')).astype(float)
        a[..., 3] *= np.clip(r + 0.5 - np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2), 0, 1)
        # Re-centre the cleaned chip on the canvas so it sits true in round buttons.
        img = Image.fromarray(a.astype(np.uint8))
        bbox = img.getbbox()
        chip = img.crop(bbox)
        # Same diameter for every denomination (uniform scale, aspect kept), so chips match in a row.
        D = 112
        chip = chip.resize((D, round(chip.height * D / chip.width)), Image.LANCZOS)
        canvas = Image.new('RGBA', (128, 128), (0, 0, 0, 0))
        canvas.paste(chip, ((128 - chip.width) // 2, (128 - chip.height) // 2), chip)
        canvas.save(f'{out}/{casino}/chip_{d}.png', optimize=True)
        meta.setdefault(casino, {})[d] = {'mask': [cx, cy, r], 'chip': list(chip.size)}
json.dump(meta, open(f'{out}/chips_meta.json', 'w'), indent=1)
print(json.dumps(meta))
