"""Video poker and keno machine art: cut the supplied sprite sheets into the pieces the game uses.

Sources (kept unchanged) in art/source_sheets/machines/:
  videopoker_sheet.png, keno_sheet.png      "base" set: complete card deck and complete 1-80 ball set
  desert_palms_keno.png                     "dp": Desert Palms keno (balls 1-20 and 80 only, so the board uses base balls)
  white_buffalo_videopoker.png              "wb": White Buffalo video poker
  morongo_sky_machines.png                  "ms": Morongo Sky keno + video poker (its deck is not used: see MACHINE_ART.md)
Output: src/assets/casino/machines/<theme>_<piece>.webp and machines.json (sizes, atlas grids, 9-slice insets).

Only crops, a floor on near-transparent alpha, brightness keying for sparkles drawn on dark tiles, and packing
into uniform cells. Nothing is redrawn, with one flagged exception: on the base and White Buffalo decks the
King of diamonds carries a heart in its corner, so the corner diamond of the Queen of diamonds (same sheet,
same spot) is copied over it.

Usage: python3 tools/cut_machines.py
"""
import glob
import json
import os

import numpy as np
from PIL import Image

SRC = 'art/source_sheets/machines'
OUT = 'src/assets/casino/machines'
os.makedirs(OUT, exist_ok=True)
for f in glob.glob(f'{OUT}/*.webp') + glob.glob(f'{OUT}/*.png'):
    os.remove(f)
meta = {}


def clean(im, floor=60):
    """Drop the sheet's faint background (alpha below `floor`); keep the soft edge above it."""
    a = np.array(im.convert('RGBA'))
    a[..., 3] = np.where(a[..., 3] < floor, 0, a[..., 3])
    a[a[..., 3] == 0, :3] = 0
    return Image.fromarray(a)


def glow(im, lo=80, hi=210):
    """Sparkle frames drawn on dark tiles: alpha from brightness so only the light remains."""
    a = np.array(im.convert('RGBA')).astype(float)
    a[..., 3] = np.clip((a[..., :3].max(2) - lo) / (hi - lo), 0, 1) * 255 * (a[..., 3] > 20)
    return Image.fromarray(a.astype(np.uint8))


def save(name, im, **extra):
    # WebP keeps the alpha at a fraction of the PNG size (quality 92: no visible change at game sizes).
    im.save(f'{OUT}/{name}.webp', quality=92, method=6, alpha_quality=100)
    meta[name] = {'w': im.width, 'h': im.height, **extra}


def frames(sheet, boxes, fn, cell=None):
    """Sparkle frames (boxes may differ in size), each centred in an equal cell, left to right."""
    cw = cell[0] if cell else max(b[2] - b[0] for b in boxes)
    ch = cell[1] if cell else max(b[3] - b[1] for b in boxes)
    out = Image.new('RGBA', (cw * len(boxes), ch))
    for i, b in enumerate(boxes):
        f = fn(sheet.crop(b))
        out.alpha_composite(f, (i * cw + (cw - f.width) // 2, (ch - f.height) // 2))
    return out, cw


def even(box, n):
    x0, y0, x1, y1 = box
    w = (x1 - x0) / n
    return [(int(round(x0 + i * w)), y0, int(round(x0 + (i + 1) * w)), y1) for i in range(n)]


def deck(sheet, x0, x1, rows_y, cell, fix_kd):
    """13 ranks x 4 suits (hearts, diamonds, clubs, spades) packed into equal cells."""
    cw = (x1 - x0) / 13
    cells = {}
    for r, y in enumerate(rows_y):
        for c in range(13):
            x = int(round(x0 + c * cw))
            cells[(r, c)] = sheet.crop((x, y, x + cell[0], y + cell[1]))
    if fix_kd:
        cells[(1, 12)].paste(cells[(1, 11)].crop(fix_kd), fix_kd[:2])
    atlas = Image.new('RGBA', (cell[0] * 13, cell[1] * 4))
    for (r, c), t in cells.items():
        atlas.alpha_composite(clean(t), (c * cell[0], r * cell[1]))
    return atlas


# ── base: the first video poker and keno sheets ──
vp = Image.open(f'{SRC}/videopoker_sheet.png').convert('RGBA')
save('base_vp_marquee', clean(vp.crop((302, 51, 704, 221))))
save('base_vp_screen', clean(vp.crop((718, 52, 1089, 226))), slice=[20, 24, 22, 24], fill=True)
# The printed paytable has hand names and 3 value columns; the game draws its 5 coin columns over the value area.
save('base_vp_paytable', clean(vp.crop((1104, 52, 1525, 368))), values_x=[241, 403], rows_y=[63, 92, 117, 143, 168, 193, 218, 243, 269, 298])
save('base_vp_cards', deck(vp, 319, 1147, [386, 476, 566, 656], (64, 90), (5, 26, 28, 49)), cols=13, rows=4)
save('base_vp_back', clean(vp.crop((112, 540, 199, 658))))
save('base_vp_hold_off', clean(vp.crop((1180, 398, 1249, 461))))
save('base_vp_hold_on', clean(vp.crop((1180, 472, 1249, 532))))
for name, box in {'deal': (1177, 571, 1290, 655), 'draw': (1293, 571, 1408, 655), 'bet': (1410, 571, 1525, 655)}.items():
    save(f'base_vp_{name}', clean(vp.crop(box)))
    save(f'base_vp_{name}_lit', clean(vp.crop((box[0], box[1] + 97, box[2], box[3] + 97))))
sp, fw = frames(vp, even((1058, 888, 1522, 1000), 5), glow)
save('base_vp_sparkles', sp, frames=5, frame_w=fw)

kn = Image.open(f'{SRC}/keno_sheet.png').convert('RGBA')
save('base_keno_marquee', clean(kn.crop((360, 22, 862, 188))))
save('base_keno_draw', clean(kn.crop((436, 768, 636, 858))))
save('base_keno_clear', clean(kn.crop((655, 768, 856, 858))))
save('base_meter_bet', clean(kn.crop((896, 771, 1075, 851)), floor=110), box=[66, 10, 172, 68])
save('base_meter_win', clean(kn.crop((1099, 763, 1305, 851)), floor=110), box=[74, 16, 198, 76])
save('base_keno_paycard', clean(kn.crop((1100, 556, 1521, 739))), slice=[55, 22, 18, 22], fill=False)
yy, xx = np.mgrid[0:64, 0:64]
circle = ((xx - 31.5) ** 2 + (yy - 31.5) ** 2) <= 31.5 ** 2
balls = Image.new('RGBA', (640, 512))
for j in range(8):
    for i in range(10):
        cx, cy = 391 + i * (1047 - 391) / 9, 247 + j * (695 - 247) / 7
        b = np.array(clean(kn.crop((int(round(cx)) - 32, int(round(cy)) - 32, int(round(cx)) + 32, int(round(cy)) + 32))))
        b[..., 3] = np.where(circle, b[..., 3], 0)
        balls.alpha_composite(Image.fromarray(b), (i * 64, j * 64))
save('base_keno_balls', balls, cols=10, rows=8)
sp, fw = frames(kn, even((7, 884, 1529, 1010), 11), glow)
save('base_keno_sparkles', sp, frames=11, frame_w=fw)

# ── dp: Desert Palms keno ──
dp = Image.open(f'{SRC}/desert_palms_keno.png').convert('RGBA')
save('dp_keno_marquee', clean(dp.crop((369, 9, 826, 227))))
save('dp_keno_frame', clean(dp.crop((859, 26, 1501, 235))), slice=[20, 97, 22, 97], fill=True)
save('dp_keno_paycard', clean(dp.crop((1113, 240, 1508, 547))), slice=[90, 23, 22, 27], fill=False)
save('dp_keno_draw', clean(dp.crop((1108, 570, 1298, 674))))
save('dp_keno_clear', clean(dp.crop((1316, 571, 1510, 674))))
save('dp_keno_band', clean(dp.crop((44, 897, 1207, 1006))))
sp, fw = frames(dp, [(943, 762, 986, 806), (1012, 747, 1077, 822), (1105, 739, 1198, 832), (1213, 725, 1336, 848), (1356, 720, 1496, 848)], clean, cell=(142, 130))
save('dp_keno_sparkles', sp, frames=5, frame_w=fw)

# ── wb: White Buffalo video poker ──
wb = Image.open(f'{SRC}/white_buffalo_videopoker.png').convert('RGBA')
save('wb_vp_marquee', clean(wb.crop((302, 8, 698, 251))))
save('wb_vp_screen', clean(wb.crop((714, 50, 1098, 268))), slice=[28, 36, 28, 35], fill=True)
save('wb_vp_payframe', clean(wb.crop((1111, 14, 1529, 396))), slice=[96, 28, 30, 28], fill=False)
save('wb_vp_cards', deck(wb, 312, 1140, [423, 516, 612, 708], (64, 91), (5, 26, 28, 49)), cols=13, rows=4)
save('wb_vp_back', clean(wb.crop((78, 578, 224, 702))))
save('wb_vp_hold_off', clean(wb.crop((1168, 435, 1236, 495))))
save('wb_vp_hold_on', clean(wb.crop((1168, 510, 1236, 567))))
for name, box in {'deal': (1170, 606, 1342, 700), 'draw': (1348, 606, 1522, 700), 'bet': (1206, 715, 1489, 814)}.items():
    save(f'wb_vp_{name}', clean(wb.crop(box)))
sp, fw = frames(wb, [(994, 878, 1083, 971), (1102, 876, 1195, 976), (1208, 877, 1302, 978), (1316, 877, 1408, 977), (1423, 876, 1521, 979)], glow)
save('wb_vp_sparkles', sp, frames=5, frame_w=fw)

# ── ms: Morongo Sky keno + video poker ──
ms = Image.open(f'{SRC}/morongo_sky_machines.png').convert('RGBA')
save('ms_sign', clean(ms.crop((536, 13, 991, 171))))
save('ms_keno_sign', clean(ms.crop((536, 178, 746, 281))))
save('ms_vp_sign', clean(ms.crop((769, 177, 983, 281))))
save('ms_keno_frame', clean(ms.crop((1004, 34, 1264, 251))), slice=[44, 28, 40, 29], fill=True)
save('ms_vp_screen', clean(ms.crop((1276, 34, 1524, 252))), slice=[47, 28, 37, 29], fill=True)
save('ms_keno_paycard', clean(ms.crop((24, 462, 300, 656))), slice=[50, 20, 21, 19], fill=False)
save('ms_vp_payframe', clean(ms.crop((1270, 592, 1519, 839))), slice=[50, 19, 16, 20], fill=False)
save('ms_keno_draw', clean(ms.crop((327, 482, 479, 531))))
save('ms_keno_clear', clean(ms.crop((488, 482, 617, 531))))
save('ms_keno_draw_lit', clean(ms.crop((654, 480, 795, 531))))
save('ms_keno_clear_lit', clean(ms.crop((805, 480, 942, 530))))
save('ms_vp_hold_off', clean(ms.crop((1096, 602, 1168, 657))))
save('ms_vp_hold_on', clean(ms.crop((1096, 746, 1169, 799))))
for name, x in {'deal': (500, 638), 'draw': (647, 786), 'bet': (795, 928)}.items():
    save(f'ms_vp_{name}', clean(ms.crop((x[0], 870, x[1], 923))))
    save(f'ms_vp_{name}_lit', clean(ms.crop((x[0], 933, x[1], 988))))
save('ms_vp_back', clean(ms.crop((183, 677, 294, 841))))
sp, fw = frames(ms, even((1229, 380, 1515, 439), 5), glow)
save('ms_keno_sparkles', sp, frames=5, frame_w=fw)
sp, fw = frames(ms, [(1206, 884, 1261, 961), (1266, 884, 1332, 961), (1338, 884, 1410, 961), (1415, 884, 1502, 961)], glow)
save('ms_vp_sparkles', sp, frames=4, frame_w=fw)

with open(f'{OUT}/machines.json', 'w') as f:
    json.dump(meta, f, indent=1)
print(f'{len(meta)} pieces')
