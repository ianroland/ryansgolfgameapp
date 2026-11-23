"""Cuts the Waifu/Winston sheet (Retro_Casino_Pixel_Art_Asset_Sheet, transparent PNG) into game assets.

Usage: python3 tools/cut_waifu_winston.py <sheet.png> <out_dir>
Boxes are (x, y, w, h) on the 1536x1024 sheet. Alpha below 8 is cleared (stray haze); flecks under 120 px are dropped.
"""
import json, sys
import numpy as np
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
sheet = np.array(Image.open(src).convert('RGBA'))
sheet[..., 3] = np.where(sheet[..., 3] < 8, 0, np.minimum(255, sheet[..., 3].astype(int) + 1)).astype(np.uint8)

def crop(x, y, w, h, pad=3, specks=False):
    sub = sheet[max(0, y - pad):y + h + pad, max(0, x - pad):x + w + pad].copy()
    if specks:  # drop stray flecks that aren't part of the figure
        from scipy import ndimage
        lab, n = ndimage.label(sub[..., 3] > 0)
        sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
        for i, sz in enumerate(sizes, 1):
            if sz < 120: sub[lab == i, 3] = 0
    ys, xs = np.nonzero(sub[..., 3])
    return Image.fromarray(sub[ys.min():ys.max() + 1, xs.min():xs.max() + 1])

BOXES = {
    'waifu_idle': (49, 4, 247, 253), 'waifu_deal': (344, 6, 224, 259), 'waifu_present': (588, 6, 293, 249), 'waifu_think': (899, 6, 196, 247),
    'winston_idle': (26, 266, 266, 242), 'winston_present': (311, 266, 278, 242), 'winston_point': (586, 266, 279, 242), 'winston_think': (885, 271, 215, 236),
    'baccarat_felt': (22, 522, 552, 222), 'threecard_felt': (581, 522, 537, 222),
    'chip_tray': (1137, 532, 196, 62), 'shoe_red': (1342, 529, 92, 82), 'shoe_blue': (1435, 529, 92, 83),
    'vp_cabinet': (62, 748, 298, 274), 'vp_marquee': (798, 782, 335, 111),
}
meta = {}
for name, b in BOXES.items():
    im = crop(*b, specks=True)
    im.save(f'{out}/{name}.png', optimize=True)
    meta[name] = list(im.size)

# Expression portraits: two rows of four tiles per dealer, cut on the gaps between frames.
def tiles(y0, y1):
    band = sheet[y0:y1, 1105:1536, 3] > 128
    cols = band.sum(0) > 20
    runs, inrun = [], False
    for x, on in enumerate(cols):
        if on and not inrun: start, inrun = x, True
        if not on and inrun: runs.append((start, x)); inrun = False
    if inrun: runs.append((start, len(cols)))
    runs = [r for r in runs if r[1] - r[0] > 60]
    assert len(runs) == 4, runs
    return [crop(1105 + a, y0, b - a, y1 - y0, pad=0) for a, b in runs]

FACES = {
    'waifu': (['neutral', 'smile', 'confident', 'surprised', 'soft', 'closed', 'delighted', 'wink'], [(18, 131), (131, 243)]),
    'winston': (['grin', 'laugh', 'smirk', 'surprised', 'neutral', 'closed', 'roar', 'wink'], [(271, 385), (384, 500)]),
}
for who, (names, rows) in FACES.items():
    ts = [t for r in rows for t in tiles(*r)]
    cw = max(t.width for t in ts); ch = max(t.height for t in ts)
    strip = Image.new('RGBA', (cw * len(ts), ch), (0, 0, 0, 0))
    for i, t in enumerate(ts):
        strip.paste(t.resize((cw, ch), Image.LANCZOS), (i * cw, 0))
    strip.save(f'{out}/{who}_faces.png', optimize=True)
    meta[f'{who}_faces'] = {'cell': [cw, ch], 'faces': names}

# Head-centre x per pose (largest run of opaque columns 8-20% down), so poses swap without the head jumping.
anchors = {}
for name in [n for n in BOXES if n.startswith(('waifu_', 'winston_'))]:
    a = np.array(Image.open(f'{out}/{name}.png'))[..., 3] > 128
    h = a.shape[0]
    xs = np.nonzero(a[int(h * 0.08):int(h * 0.2)].sum(0) > 2)[0]
    runs, s0, p = [], xs[0], xs[0]
    for x in xs[1:]:
        if x > p + 3: runs.append((s0, p)); s0 = x
        p = x
    runs.append((s0, p))
    r = max(runs, key=lambda r: r[1] - r[0])
    anchors[name] = int(round((r[0] + r[1]) / 2))
meta['anchors'] = anchors

json.dump(meta, open(f'{out}/ww_meta.json', 'w'), indent=1)
print(json.dumps(meta))
