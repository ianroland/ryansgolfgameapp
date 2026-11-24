"""Card tables v2: cut the supplied 3x3 sheet (art/source_sheets/machines/card_tables_v2_concept.png) into one
scene per casino and game: src/assets/casino/tables/<casino>/<game>_scene.webp. Crop only (the casino-name
banners on the top row and the sheet's grid lines are left out); no scaling or repainting.
Usage: python3 tools/cut_card_tables_v2.py"""
from PIL import Image

SRC = 'art/source_sheets/machines/card_tables_v2_concept.png'
COLS = {'desert_palms': (3, 510), 'white_buffalo': (526, 1018), 'morongo_sky': (1030, 1533)}
ROWS = {'blackjack': (64, 386), 'three_card_poker': (396, 696), 'baccarat': (706, 1021)}
im = Image.open(SRC).convert('RGB')
for c, (x0, x1) in COLS.items():
    for g, (y0, y1) in ROWS.items():
        out = im.crop((x0, y0, x1, y1))
        out.save(f'src/assets/casino/tables/{c}/{g}_scene.webp', quality=94, method=6)
        print(c, g, out.size)
