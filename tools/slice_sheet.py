"""Slice a concept sprite sheet into clean, individual transparent sprites.

Usage: python3 -I tools/slice_sheet.py <sheet.png> <out_dir> [--key-white]

- Sheets with an alpha channel: AI-made "transparent" sheets have a faint
  haze (alpha 1-30) around everything and sprites that are never fully
  opaque. Alpha is snapped: < 64 becomes 0, the rest becomes 255.
- `--key-white` is for RGB sheets on a white/light background (no alpha):
  near-white pixels connected to the sheet border are made transparent, so
  white *inside* a sprite (a shirt, a visor) is kept.
- Each separate sprite (connected component, small gaps closed) is saved as
  `<index>.png`, ordered in reading order (rows, then left to right), with
  `manifest.json` giving its box on the sheet, size and a bottom-centre anchor.
  A labelled contact sheet (`_contact.png`) makes picking sprites by index easy.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

src, out = Path(sys.argv[1]), Path(sys.argv[2])
key_white = '--key-white' in sys.argv
out.mkdir(parents=True, exist_ok=True)
im = np.array(Image.open(src).convert('RGBA'))
rgb = im[..., :3].astype(np.int16)
if key_white:
    light = (rgb.min(-1) > 225) & (rgb.max(-1) - rgb.min(-1) < 22)
    lab, _ = ndimage.label(light)
    border = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    bg = np.isin(lab, border[border > 0])
    alpha = np.where(bg, 0, 255).astype(np.uint8)
else:
    alpha = np.where(im[..., 3] >= 64, 255, 0).astype(np.uint8)
im[..., 3] = alpha

fg = ndimage.binary_closing(alpha > 0, iterations=2)
lab, n = ndimage.label(fg)
boxes = []
for i, sl in enumerate(ndimage.find_objects(lab)):
    if sl is None:
        continue
    y0, y1, x0, x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
    if (y1 - y0) * (x1 - x0) < 200 or (y1 - y0) < 10:
        continue
    boxes.append([x0, y0, x1, y1, i + 1])

# Reading order: group into rows by vertical overlap of box centres.
boxes.sort(key=lambda b: (b[1] + b[3]) / 2)
rows = []
for b in boxes:
    cy = (b[1] + b[3]) / 2
    if rows and abs(cy - rows[-1]['cy']) < max(12, (b[3] - b[1]) * 0.35):
        rows[-1]['items'].append(b)
        rows[-1]['cy'] = np.mean([(x[1] + x[3]) / 2 for x in rows[-1]['items']])
    else:
        rows.append({'cy': cy, 'items': [b]})
ordered = [b for r in rows for b in sorted(r['items'], key=lambda b: b[0])]

manifest = {'source': src.name, 'keyWhite': key_white, 'sprites': []}
contact = Image.new('RGBA', (im.shape[1], im.shape[0]), (40, 70, 50, 255))
contact.alpha_composite(Image.fromarray(im))
draw = ImageDraw.Draw(contact)
for idx, (x0, y0, x1, y1, li) in enumerate(ordered):
    crop = im[y0:y1, x0:x1].copy()
    crop[lab[y0:y1, x0:x1] != li, 3] = 0  # only this sprite, not a neighbour poking in
    Image.fromarray(crop).save(out / f'{idx}.png')
    manifest['sprites'].append({'i': idx, 'x': int(x0), 'y': int(y0), 'w': int(x1 - x0), 'h': int(y1 - y0), 'ax': round((x1 - x0) / 2, 1), 'ay': int(y1 - y0)})
    draw.rectangle([x0, y0, x1 - 1, y1 - 1], outline=(255, 0, 255, 255))
    draw.text((x0 + 2, y0 + 1), str(idx), fill=(255, 255, 0, 255))
contact.save(out / '_contact.png')
(out / 'manifest.json').write_text(json.dumps(manifest, indent=1))
print(f'{len(ordered)} sprites -> {out}')
