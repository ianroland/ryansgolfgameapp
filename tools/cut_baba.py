"""Cut the author's Baba animation sheet into a cast atlas (src/assets/characters/baba.png + .json).

Source: art/source_sheets/cast/Baba_Pixel_Art_Animation_Sprite_Sheet.png (author art, 2026-11-21).
Known sheet issues (BABA_CONTINUITY_REPORT.md §5) and how they're handled:
- the printed frame numbers are out of order: frames are taken left to right in each strip;
- rows are drawn at different scales (standing Baba is ~125 px in row 1, ~85 px in row 4): each row
  is scaled so standing Baba is STAND px tall, then every body frame is padded to one canvas
  height (feet on the baseline), so scenes draw him at one constant scale;
- red keying fringe: alpha is hard-thresholded and edge pixels that are keying red are dropped
  (the red BOBO MILKY carton itself is kept: only pixels touching transparency are tested);
- 5 portraits for 8 expressions: mapped as below (proposed in the continuity report).

usage: python3 -I tools/cut_baba.py <sheet.png> <out_dir>
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

SRC, OUT = Path(sys.argv[1]), Path(sys.argv[2])
STAND = 84  # standing height of the other cast sheets
sheet = Image.open(SRC).convert('RGBA')
a = np.array(sheet)
A = a[..., 3] >= 128

# ── strips, left to right (counts as labelled on the sheet) ──
ROWS = [
    [('idle', 8), ('walk', 8), ('talk', 8)],
    [('emphatic', 8), ('laugh', 6), ('sad', 6), ('disappointed', 6)],
    [('angry', 8), ('confident', 6), ('give', 8)],
    [('celebrate', 8), ('surprised', 4), ('think', 4), ('drink', 6)],
]
# standing-height reference per row: the strip whose frames stand upright with arms crossed
# (engine pose names: the sheet's PROUD is `confident`, CONCERNED is `sad`, TALK - EMPHATIC is `emphatic`)
REF = ['idle', 'emphatic', 'confident', 'surprised']
PORTRAIT_X = 1620  # portraits live right of this in the last row

lab, n = ndi.label(A, structure=np.ones((3, 3)))
objs = ndi.find_objects(lab)
bodies, smalls = [], []
for i, sl in enumerate(objs):
    y0, y1, x0, x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
    comp = lab[sl] == i + 1
    px = a[sl][comp][:, :3]
    dark = float((px.max(1) < 50).mean())
    if y1 - y0 >= 60:
        if y0 > 560 and x0 >= PORTRAIT_X:
            continue
        bodies.append({'id': i + 1, 'box': [x0, y0, x1, y1]})
    elif comp.sum() >= 6 and dark < 0.45:
        smalls.append({'id': i + 1, 'box': [x0, y0, x1, y1]})

# rows by top edge
BANDS = [0, 200, 390, 560, 724]  # the four strip rows (labels sit at the top of each)
band = lambda y: next(i for i in range(4) if BANDS[i] <= y < BANDS[i + 1])
bodies.sort(key=lambda b: (band(b['box'][1]), b['box'][0]))
rows = {}
for b in bodies:
    rows.setdefault(band(b['box'][1]), []).append(b)
row_keys = sorted(rows)
assert len(row_keys) == 4, row_keys
for k, spec in zip(row_keys, ROWS):
    assert len(rows[k]) == sum(c for _, c in spec), (k, len(rows[k]), sum(c for _, c in spec))

# effect marks (sparkles, "!") belong to the body under them
for s in smalls:
    sx0, sy0, sx1, sy1 = s['box']
    for b in bodies:
        bx0, by0, bx1, by1 = b['box']
        if sx1 >= bx0 - 12 and sx0 <= bx1 + 12 and sy1 <= by1 and sy0 >= by0 - 40:
            b.setdefault('extra', []).append(s)
            break


def cut(b):
    ids = [b['id']] + [s['id'] for s in b.get('extra', [])]
    boxes = [b['box']] + [s['box'] for s in b.get('extra', [])]
    x0 = min(x[0] for x in boxes); y0 = min(x[1] for x in boxes)
    x1 = max(x[2] for x in boxes); y1 = max(x[3] for x in boxes)
    keep = np.isin(lab[y0:y1, x0:x1], ids)
    img = a[y0:y1, x0:x1].copy()
    img[~keep] = 0
    img[..., 3] = np.where(keep, 255, 0)
    # red keying fringe: a pure keying red pixel on the outline goes
    r, g, bl = [img[..., i].astype(int) for i in range(3)]
    edge = keep & ndi.binary_dilation(~keep, structure=np.ones((3, 3)))
    fringe = edge & (r > 150) & (g < 90) & (bl < 90)
    img[fringe] = 0
    return Image.fromarray(img), (x0, y0, x1, y1), int(fringe.sum())


def scaled(im, s):
    w, h = max(1, round(im.width * s)), max(1, round(im.height * s))
    # premultiplied resample, then a hard alpha edge
    arr = np.array(im).astype(float)
    arr[..., :3] *= arr[..., 3:4] / 255
    pm = Image.fromarray(arr.clip(0, 255).astype(np.uint8))
    out = np.array(pm.resize((w, h), Image.LANCZOS)).astype(float)
    al = out[..., 3]
    rgb = np.where(al[..., None] > 0, out[..., :3] * 255 / np.maximum(al[..., None], 1), 0)
    res = np.zeros_like(out)
    res[..., :3] = rgb.clip(0, 255)
    res[..., 3] = np.where(al >= 128, 255, 0)
    res[res[..., 3] == 0] = 0
    return Image.fromarray(res.astype(np.uint8))


frames = {}
fringe_total = 0
for k, spec in zip(row_keys, ROWS):
    row = rows[k]
    i = 0
    strips = {}
    for name, count in spec:
        strips[name] = row[i:i + count]
        i += count
    ref = [cut(b)[0].height for b in strips[REF[row_keys.index(k)]]]
    s = STAND / float(np.median(ref))
    for name, items in strips.items():
        for j, b in enumerate(items):
            im, _, fr = cut(b)
            fringe_total += fr
            frames[f'{name}.{j}'] = scaled(im, s)

# one canvas height for every body frame (feet on the baseline)
CANVAS = max(im.height for im in frames.values()) + 2
for key, im in list(frames.items()):
    c = Image.new('RGBA', (im.width + 2, CANVAS), (0, 0, 0, 0))
    c.paste(im, (1, CANVAS - im.height - 1))
    frames[key] = c

# ── portraits: blue squares in the last row, keyed to transparency ──
reg = a[600:712, PORTRAIT_X:]
cols = (reg[..., 3] >= 128).any(0)
boxes, start = [], None
for x, v in enumerate(list(cols) + [False]):
    if v and start is None:
        start = x
    if not v and start is not None:
        if x - start > 60:
            boxes.append((PORTRAIT_X + start, PORTRAIT_X + x))
        start = None
assert len(boxes) == 5, boxes
ys = np.nonzero((a[580:724, boxes[0][0]:boxes[-1][1], 3] >= 128).any(1))[0]
pt_faces = ['unimpressed', 'laughing', 'concerned', 'smirk', 'proud']
portraits = {}
for name, (x0, x1) in zip(pt_faces, boxes):
    col = np.nonzero((a[595:724, x0:x1, 3] >= 128).any(1))[0]
    y0, y1 = 595 + col.min(), 595 + col.max() + 1
    p = a[y0 + 4:y1 - 4, x0 + 4:x1 - 4].copy()  # inside the light border
    r, g, b = [p[..., i].astype(int) for i in range(3)]
    blue = (b > 100) & (b - r > 40) & (p[..., 3] > 0)
    seed = np.zeros_like(blue)
    seed[0, :] = blue[0, :]
    seed[:, 0] = blue[:, 0]
    seed[:, -1] = blue[:, -1]
    bg = ndi.binary_propagation(seed, mask=blue)
    p[bg] = 0
    p[..., 3] = np.where(p[..., 3] >= 128, 255, 0)
    p[p[..., 3] == 0] = 0
    im = Image.fromarray(p)
    bbox = im.getbbox()
    im = im.crop(bbox)
    c = Image.new('RGBA', (im.width + 2, im.height + 1), (0, 0, 0, 0))
    c.paste(im, (1, 1))
    portraits[name] = c

# 8 engine expressions from 5 drawn faces (continuity report §5, approved under the standing approval)
EXPR = {
    'neutral': 'unimpressed', 'confident': 'smirk', 'happy': 'proud', 'laughing': 'laughing',
    'worried': 'concerned', 'disappointed': 'concerned', 'angry': 'unimpressed', 'surprised': 'smirk',
}
pt_frames = {f'portrait.{e}': portraits[f] for e, f in EXPR.items()}
pt_frames['portrait.big'] = portraits['proud']

# ── pack (shelf) ──
order = list(pt_frames.items()) + list(frames.items())
W = 1024
x = y = shelf = 0
placed = {}
seen = {}
for key, im in order:
    sig = id(im)
    if sig in seen:  # shared faces share pixels
        placed[key] = placed[seen[sig]]
        continue
    if x + im.width > W:
        x, y, shelf = 0, y + shelf + 2, 0
    placed[key] = (x, y, im.width, im.height)
    seen[sig] = key
    x += im.width + 2
    shelf = max(shelf, im.height)
H = y + shelf
atlas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
imgs = dict(order)
for key, (px, py, w, h) in placed.items():
    if seen.get(id(imgs[key])) == key:
        atlas.paste(imgs[key], (px, py))
OUT.mkdir(parents=True, exist_ok=True)
atlas.save(OUT / 'baba.png', optimize=True)
manifest = {'image': 'baba.png', 'w': W, 'h': H, 'frames': {
    k: {'x': px, 'y': py, 'w': w, 'h': h, 'ax': w / 2, 'ay': h if not k.startswith('portrait') else h / 2}
    for k, (px, py, w, h) in placed.items()}}
(OUT / 'baba.json').write_text(json.dumps(manifest, separators=(',', ':')))
print('frames', len(frames), 'canvas', CANVAS, 'atlas', W, H, 'fringe px', fringe_total)
