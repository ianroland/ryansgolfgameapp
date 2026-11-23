"""Cocktail server portraits: split each 3x2 sheet (1536x1024) into six square portraits.
Each cell is cropped inside its painted frame (frames measured per sheet), never stretched,
then scaled to 256x256. The sheets' alpha is semi-transparent everywhere (export artefact:
most pixels alpha 200-250), so portraits are made fully opaque; colours are untouched.
Usage: cut_server_portraits.py SHEET_DIR OUT_DIR"""
import sys, os, json
import numpy as np
from PIL import Image

# Inner (inside-frame) square crop per cell: (x, y, size) for the top-left cell, plus the cell pitch.
SHEETS = {
    'desert_palms': {'origin': (10, 10), 'pitch': (512, 512), 'size': 488},   # no frame; thin separators
    'white_buffalo': {'origin': (32, 32), 'pitch': (512, 512), 'size': 452},  # gold frame + cut corners
    'morongo_sky': {'origin': (26, 26), 'pitch': (512, 512), 'size': 462},    # gold rounded frame
}
src, out = sys.argv[1], sys.argv[2]
meta = {}
for casino, s in SHEETS.items():
    im = Image.open(f'{src}/{casino}.png').convert('RGBA')
    os.makedirs(f'{out}/{casino}', exist_ok=True)
    cells = []
    for row in range(2):
        for col in range(3):
            x = s['origin'][0] + col * s['pitch'][0]
            y = s['origin'][1] + row * s['pitch'][1]
            c = im.crop((x, y, x + s['size'], y + s['size']))
            a = np.array(c)
            a[..., 3] = 255
            c = Image.fromarray(a).resize((256, 256), Image.LANCZOS)
            n = row * 3 + col + 1
            c.save(f'{out}/{casino}/cell_{n}.png', optimize=True)
            cells.append({'cell': n, 'crop': [x, y, s['size'], s['size']]})
    meta[casino] = cells
print(json.dumps({k: [c['crop'] for c in v] for k, v in meta.items()}))
