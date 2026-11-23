"""Card table scenes (CASINO_CARD_TABLES_V1): remove the concept sheet's leftover grid separators
(the top 3 rows on every scene; a gold/dark strip on the left of White Buffalo and Morongo Sky).
Only those border strips are removed: no scaling, no other cropping. Then measures the felt.
Usage: prep_card_scenes.py SRC_BACKGROUNDS_DIR OUT_DIR"""
import json, sys
import numpy as np
from PIL import Image
from scipy import ndimage

TRIM = {'desert_palms': (0, 3), 'white_buffalo': (7, 3), 'morongo_sky': (23, 3)}  # (left, top) pixels
src, out = sys.argv[1], sys.argv[2]
meta = {}
for c, (l, t) in TRIM.items():
    im = Image.open(f'{src}/{c}/scene.png').convert('RGBA')
    im = im.crop((l, t, im.width, im.height))
    import os; os.makedirs(f'{out}/{c}', exist_ok=True)
    im.save(f'{out}/{c}/card_scene.png', optimize=True)
    a = np.array(im.convert('RGB')).astype(int)
    h, w = a.shape[:2]
    ref = a[262:272, w // 2 - 10:w // 2 + 10].reshape(-1, 3).mean(0)
    m = np.sqrt(((a - ref) ** 2).sum(2)) < 45
    lab, _ = ndimage.label(m)
    felt = ndimage.binary_fill_holes(lab == lab[267, w // 2])
    felt = ndimage.binary_opening(felt, iterations=2)
    ys, xs = np.nonzero(felt)
    rows = {}
    for f in np.linspace(0, 1, 11):
        y = int(ys.min() + f * (ys.max() - ys.min()))
        r = np.nonzero(felt[y])[0]
        rows[round(float(f), 1)] = [int(r.min()), int(r.max())] if len(r) else None
    meta[c] = {'size': [w, h], 'trim_left_top': [l, t], 'felt_bbox': [int(xs.min()), int(ys.min()), int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1)], 'felt_rows': rows}
print(json.dumps(meta, indent=1))
