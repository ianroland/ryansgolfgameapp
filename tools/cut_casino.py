"""Cut the Desert Palms casino art into game-ready sprites + one manifest.

Usage: python3 -I tools/cut_casino.py <sliced_dir> <out_dir>

<sliced_dir> holds slice_sheet.py output for casino_retro_tables, casino_assets
and casino_pixel_cast (see art/source_sheets/). The Greyhound pack is reference
only: its background haze is baked in and its reel windows are painted on.

Checks (fails loudly):
- every sprite has 0/255 alpha and a transparent corner (no baked background);
- the slot cabinet's three reel windows are fully transparent holes.
Output: <out_dir>/<name>.png (256-colour, 1-bit alpha) and casino.json:
  { name: { file, w, h, ax, ay, source: [sheet, x, y, w, h] }, cabinet.windows: [[x,y,w,h]...], cabinet.lever: [...] }
"""
import json, sys
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage

SL, OUT = Path(sys.argv[1]), Path(sys.argv[2])
OUT.mkdir(parents=True, exist_ok=True)
SHEETS = {'retro': 'casino_retro_tables', 'assets': 'casino_assets', 'pixel': 'casino_pixel_cast'}
manifests = {k: json.loads((SL / v / 'manifest.json').read_text()) for k, v in SHEETS.items()}
manifest = {}

def sprite(sheet, i):
    return Image.open(SL / SHEETS[sheet] / f'{i}.png').convert('RGBA'), manifests[sheet]['sprites'][i]

def trim(img):
    a = np.asarray(img)[..., 3]
    ys, xs = np.nonzero(a)
    return img.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)), (int(xs.min()), int(ys.min()))

def check(img, name, corner=True):
    a = np.asarray(img)[..., 3]
    assert set(np.unique(a)) <= {0, 255}, f'{name}: soft alpha'
    if corner:
        assert min(a[0, 0], a[0, -1], a[-1, 0], a[-1, -1]) == 0, f'{name}: no transparent corner'

def save(name, img, source, anchor='bottom', extra=None):
    check(img, name)
    # Quantize colour only (255 colours) and reserve index 255 for full transparency,
    # so alpha in the shipped PNG is strictly 0/255.
    rgba = np.asarray(img)
    q = img.convert('RGB').quantize(colors=255, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    idx = np.asarray(q).copy()
    idx[rgba[..., 3] == 0] = 255
    pal = q.getpalette()[:255 * 3]
    pal += [0, 0, 0] * (256 - len(pal) // 3)
    q = Image.fromarray(idx.astype(np.uint8), 'P')
    q.putpalette(pal)
    assert ((idx != 255) == (rgba[..., 3] > 0)).all(), f'{name}: palette changed the mask'
    q.save(OUT / f'{name}.png', optimize=True, transparency=255)
    w, h = img.size
    manifest[name] = {'file': f'{name}.png', 'w': w, 'h': h, 'ax': round(w / 2, 1), 'ay': h if anchor == 'bottom' else round(h / 2, 1), 'source': source, **(extra or {})}

def split_even(img, n):
    w = img.width / n
    return [trim(img.crop((round(k * w), 0, round((k + 1) * w), img.height)))[0] for k in range(n)]

# ── Fairway Fortune cabinet: windows are real holes; the lever is cut out so it can move. ──
cab, src = sprite('retro', 1)
a = np.asarray(cab)[..., 3] == 0
lab, n = ndimage.label(a)
border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])))
windows = []
for k in range(1, n + 1):
    if k in border: continue
    ys, xs = np.nonzero(lab == k)
    if len(ys) > 5000:
        windows.append([int(xs.min()), int(ys.min()), int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1)])
windows.sort()
assert len(windows) == 3, f'cabinet: expected 3 transparent reel windows, found {len(windows)}'
for x, y, w, h in windows:
    # Rounded corners aside, the window must be see-through: an inner box inset 12% is fully clear.
    ix, iy = int(w * 0.12), int(h * 0.12)
    assert not np.asarray(cab)[y + iy:y + h - iy, x + ix:x + w - ix, 3].any(), 'cabinet: a reel window is not fully transparent'
LEVER = (732, 240, cab.width, 470)  # stick and knob, above the mount
lever = cab.crop(LEVER)
body = cab.copy()
px = np.asarray(body).copy()
px[LEVER[1]:LEVER[3], LEVER[0]:LEVER[2], 3] = 0
body = Image.fromarray(px)
lever, (lx, ly) = trim(lever)
save('cabinet', body, ['casino_retro_tables', src['x'], src['y'], src['w'], src['h']], extra={'windows': windows})
save('cabinet_lever', lever, ['casino_retro_tables', src['x'] + LEVER[0] + lx, src['y'] + LEVER[1] + ly, lever.width, lever.height],
     extra={'at': [LEVER[0] + lx, LEVER[1] + ly]})
# Buttons on the cabinet front (red, yellow, blue), measured on the art.
manifest['cabinet']['buttons'] = [[118, 586, 150, 60], [316, 586, 150, 60], [514, 586, 150, 60]]

# ── Tables ──
for name, i in (('blackjack_table', 0), ('craps_table', 2)):
    img, s = sprite('retro', i)
    save(name, img, ['casino_retro_tables', s['x'], s['y'], s['w'], s['h']])

# ── Dealers ──
sheet = Image.open(SL / SHEETS['assets'] / '_contact.png')  # only for size reference
full = np.array(Image.open(Path(__file__).resolve().parents[1] / 'art/source_sheets/casino_assets.png').convert('RGBA'))
full[..., 3] = np.where(full[..., 3] >= 64, 255, 0)
def crop_sheet(x0, y0, x1, y1):
    img = Image.fromarray(full[y0:y1, x0:x1])
    img, (dx, dy) = trim(img)
    return img, [x0 + dx, y0 + dy, img.width, img.height]
# The dealer standing behind a table edge (felt strip included).
for name, box in (('dealer_blackjack', (892, 282, 1000, 412)), ('dealer_craps', (338, 280, 441, 408))):
    img, s = crop_sheet(*box)
    save(name, img, ['casino_assets', *s])

# ── Velvet Vega portrait (one expression drawn so far) ──
img, s = sprite('pixel', 4)
save('velvet_portrait', img, ['casino_pixel_cast', s['x'], s['y'], s['w'], s['h']], anchor='center')

# ── Slot symbols (same art as the reel glyphs they replace) ──
for name, i in (('sym_seven', 15), ('sym_trophy', 16), ('sym_flag', 17)):
    img, s = sprite('assets', i)
    save(name, img, ['casino_assets', s['x'], s['y'], s['w'], s['h']], anchor='center')
row, s = sprite('assets', 27)  # cherry, bell, BAR, diamond touch: split evenly
for name, img in zip(('sym_cherry', 'sym_bell', 'sym_bar', 'sym_diamond'), split_even(row, 4)):
    save(name, img, ['casino_assets', s['x'], s['y'], s['w'], s['h']], anchor='center')

# ── Chip tokens ──
pair, s = sprite('assets', 26)
for name, img in zip(('chip_5', 'chip_25'), split_even(pair, 2)):
    save(name, img, ['casino_assets', s['x'], s['y'], s['w'], s['h']], anchor='center')
for name, i in (('chip_100', 28), ('chip_500', 29)):
    img, s = sprite('assets', i)
    save(name, img, ['casino_assets', s['x'], s['y'], s['w'], s['h']], anchor='center')

# ── Signage and backdrop ──
for name, sheet_key, i in (('casino_exterior', 'assets', 0), ('casino_logo', 'assets', 2)):
    img, s = sprite(sheet_key, i)
    save(name, img, ['casino_assets', s['x'], s['y'], s['w'], s['h']])

(OUT / 'casino.json').write_text(json.dumps(manifest, indent=1))
print(len(manifest), 'sprites;', 'windows', windows, '; total', sum((OUT / v['file']).stat().st_size for v in manifest.values()) // 1024, 'KB')
