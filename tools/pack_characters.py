"""Pack curated character sprites into one atlas per character.

Usage: python3 -I tools/pack_characters.py <sliced_dir> <out_dir>

<sliced_dir> holds the output of slice_sheet.py (ryan_looks/, ryan_rpg/) and
cut_cast.py (cast_cut/). The picks below name which sprite is which. Every
frame is checked for real transparency before it's packed (corners must be
fully transparent, no near-white haze); the script fails loudly otherwise.
Output: <out_dir>/<id>.png (8-bit RGBA) + <id>.json
  { "image": "<id>.png", "w", "h", "frames": { key: {x, y, w, h, ax, ay} } }
`ax, ay` is the anchor: bottom centre for bodies (feet), centre for portraits.
"""
import json, sys
from pathlib import Path
import numpy as np
from PIL import Image

SL, OUT = Path(sys.argv[1]), Path(sys.argv[2])
OUT.mkdir(parents=True, exist_ok=True)
EXPR = ['neutral', 'happy', 'angry', 'surprised', 'worried', 'laughing', 'confident', 'disappointed']

# Ryan's three looks, all from the same sheet so they match.
# Portrait layout per look: row 1 neutral/happy/angry/surprised, row 2 worried/laughing/confident/disappointed.
LOOK_PORTRAITS = {'curly': [0, 1, 2, 3, 17, 18, 19, 20], 'bald': [35, 36, 37, 38, 52, 53, 54, 55], 'wig': [70, 71, 72, 73, 87, 88, 89, 90]}
LOOK_BODIES = {
    'curly': {'idle': [21, 22, 23], 'talk': [24, 25, 26, 27], 'celebrate': [28, 29, 30, 31], 'disappointed': [32, 33, 34], 'walk': [4, 5, 6, 7, 8, 9]},
    'bald': {'idle': [56, 57, 58], 'talk': [59, 60, 61, 62], 'celebrate': [63, 64, 65, 66], 'disappointed': [67, 68, 69], 'walk': [39, 40, 41, 42, 43, 44]},
    'wig': {'idle': [91, 92, 93], 'talk': [94, 95, 96, 97], 'celebrate': [98, 99, 100, 101], 'disappointed': [102, 103, 104], 'walk': [74, 75, 76, 77, 78, 79]},
}
# The final look also has a full RPG animation set (01_ryan_rpg_animations).
WIG_EXTRA = {'laugh': [14, 15, 16, 17], 'angry': [18, 19, 20, 21], 'surprised': [22, 23, 24, 25], 'sad': [26, 27, 28, 29],
             'point': [45, 46, 47, 48], 'handshake': [39, 40, 41], 'sit': [53, 54, 55], 'stand': [58, 59]}
# Cast rows in cut_cast.py order. Heads: neutral, happy, angry, surprised, laughing, confident, disappointed.
CAST = ['kayla_brooks', 'coach_martinez', 'biff_fairway', 'marty_mulligan', 'commissioner_clipboard', 'agent_reese', 'sponsor_dawson', 'caddie_jordan', 'friend_avery', 'reporter_kim']
HEAD_EXPR = {'neutral': 0, 'happy': 1, 'angry': 2, 'surprised': 3, 'laughing': 4, 'confident': 5, 'disappointed': 6, 'worried': 6}
# Cast body poses, same layout on every row: idle 0-3, talk 4-7, arms crossed 8-10,
# celebrate 11-13, disappointed 14-16.
CAST_BODIES = {'idle': [0, 1], 'talk': [4, 5, 6, 7], 'confident': [8, 9, 10], 'celebrate': [11, 12, 13], 'disappointed': [14, 15, 16]}

def check(img, label):
    a = np.asarray(img)[..., 3]
    assert img.mode == 'RGBA', label
    assert set(np.unique(a)) <= {0, 255}, f'{label}: alpha must be 0 or 255 (pixel art), got soft alpha'
    # A real sprite never fills its box edge to edge; at least one corner is see-through.
    assert min(a[0, 0], a[0, -1], a[-1, 0], a[-1, -1]) == 0, f'{label}: no transparent corner (background not removed?)'
    rgb = np.asarray(img)[..., :3]
    # Top, left and right edges (portraits are cut off at the shoulders, so the bottom may be clothing).
    ring = np.zeros(a.shape, bool); ring[0, :] = True; ring[:, [0, -1]] = True
    haze = ring & (a > 0) & (rgb.min(-1) > 240)
    assert haze.sum() < max(4, ring.sum() * 0.02), f'{label}: white fringe on the border ({haze.sum()} px)'

def pack(items, name, anchor):
    """items: list of (key, Image, anchor_kind). Shelf-pack into rows of max width 1024."""
    pad, maxw = 2, 1024
    x = y = rowh = 0; placed = []
    for key, img, kind in items:
        check(img, f'{name}:{key}')
        if x + img.width > maxw:
            x, y, rowh = 0, y + rowh + pad, 0
        placed.append((key, img, kind, x, y))
        x += img.width + pad; rowh = max(rowh, img.height)
    W = max(p[3] + p[1].width for p in placed); H = y + rowh
    atlas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    frames = {}
    for key, img, kind, px, py in placed:
        atlas.paste(img, (px, py))
        ax, ay = (img.width / 2, img.height) if kind == 'body' else (img.width / 2, img.height / 2)
        frames[key] = {'x': px, 'y': py, 'w': img.width, 'h': img.height, 'ax': round(ax, 1), 'ay': round(ay, 1)}
    # 256-colour palette with 1-bit transparency: pixel art survives it, and
    # the file is a fraction of the size of 32-bit RGBA.
    q = atlas.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    q.save(OUT / f'{name}.png', optimize=True)
    back = np.asarray(q.convert('RGBA'))[..., 3]
    assert ((back > 0) == (np.asarray(atlas)[..., 3] > 0)).all(), f'{name}: palette changed the transparency mask'
    (OUT / f'{name}.json').write_text(json.dumps({'image': f'{name}.png', 'w': W, 'h': H, 'frames': frames}, separators=(',', ':')))
    print(name, W, H, len(frames), (OUT / f'{name}.png').stat().st_size // 1024, 'KB')

op = lambda p: Image.open(p).convert('RGBA')
items = []
for look, idx in LOOK_PORTRAITS.items():
    for e, i in zip(EXPR, idx): items.append((f'{look}.portrait.{e}', op(SL / 'ryan_looks' / f'{i}.png'), 'portrait'))
for look, anims in LOOK_BODIES.items():
    for anim, idx in anims.items():
        for k, i in enumerate(idx): items.append((f'{look}.{anim}.{k}', op(SL / 'ryan_looks' / f'{i}.png'), 'body'))
for anim, idx in WIG_EXTRA.items():
    for k, i in enumerate(idx): items.append((f'wig.{anim}.{k}', op(SL / 'ryan_rpg' / f'{i}.png'), 'body'))
pack(items, 'ryan', None)

for row, cid in enumerate(CAST):
    d = SL / 'cast2' / str(row)
    items = [('portrait.big', op(d / 'portrait.png'), 'portrait')]
    for e, k in HEAD_EXPR.items(): items.append((f'portrait.{e}', op(d / f'head_{k}.png'), 'portrait'))
    for anim, idx in CAST_BODIES.items():
        for k, i in enumerate(idx): items.append((f'{anim}.{k}', op(d / f'body_{i}.png'), 'body'))
    pack(items, cid, None)
