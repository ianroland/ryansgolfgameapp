"""Cut the approved TIPS icon out of its source and export master/128/96/64 (see docs/casino).
Source alpha: art opaque, background transparent with a faint low-alpha glow. Glow (alpha < 64)
is dropped, the art's own edge pixels are kept. Crop tight + 8px padding; square exports keep the
aspect ratio with transparent padding (never stretched). Usage: cut_tips_icon.py SRC OUTDIR"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage

src, out = sys.argv[1], sys.argv[2]
a = np.array(Image.open(src).convert('RGBA'))
al = a[..., 3].astype(int)
keep = al >= 64
lab, n = ndimage.label(keep)
sizes = ndimage.sum(keep, lab, range(1, n + 1))
main = lab == (int(np.argmax(sizes)) + 1)
# keep any other component of real size (none expected); drop specks
for i, s in enumerate(sizes):
    if s >= 200:
        main |= lab == i + 1
a[..., 3] = np.where(main, al, 0).astype(np.uint8)
a[~main] = 0
ys, xs = np.nonzero(a[..., 3])
PAD = 8
x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
crop = Image.fromarray(a).crop((x0, y0, x1 + 1, y1 + 1))
w, h = crop.size
master = Image.new('RGBA', (w + 2 * PAD, h + 2 * PAD), (0, 0, 0, 0))
master.paste(crop, (PAD, PAD))
master.save(f'{out}/tips_icon_master.png')
print('master', master.size, 'art', (w, h))

def premul_resize(im, size):
    arr = np.array(im).astype(np.float64)
    arr[..., :3] *= arr[..., 3:4] / 255
    pm = Image.fromarray(arr.round().astype(np.uint8), 'RGBA').resize(size, Image.LANCZOS)
    r = np.array(pm).astype(np.float64)
    al = r[..., 3:4]
    r[..., :3] = np.where(al > 0, np.clip(r[..., :3] * 255 / np.maximum(al, 1), 0, 255), 0)
    r[..., 3] = np.where(r[..., 3] < 24, 0, r[..., 3])
    return Image.fromarray(r.round().astype(np.uint8), 'RGBA')

for N in (128, 96, 64):
    pad = {128: 8, 96: 7, 64: 6}[N]  # 6-10px transparent padding at every size
    s = (N - 2 * pad) / max(w, h)
    tw, th = max(1, round(w * s)), max(1, round(h * s))
    small = premul_resize(crop, (tw, th))
    canvas = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    canvas.paste(small, ((N - tw) // 2, (N - th) // 2))
    canvas.save(f'{out}/tips_icon_{N}.png')
    print(N, 'art', (tw, th), 'ratio', round(tw / th, 3), 'vs', round(w / h, 3))
