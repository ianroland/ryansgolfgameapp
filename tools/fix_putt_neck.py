"""Phase-1 putting frames: shorten the neck (owner, 2026-11-27: "his neck looks too long").

The approved reference head wears a polo whose navy collar rises to the jaw. The putting body's
collar is lower at the front, so after the chin fix a band of bare throat (the darker neck
shading) showed between the chin and the white collar stripe. Here that throat band is covered
by the shirt: each throat pixel takes the colour of the nearest shirt pixel, so the collar rises
to the jaw as in the reference. The face, the hair and the rest of the figure are untouched.

usage: python3 tools/fix_putt_neck.py <atlas.png> <out.png> <atlas.json>
"""
import json
import sys

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ATL, OUTP, JS = sys.argv[1], sys.argv[2], sys.argv[3]
m = json.load(open(JS))
atlas = np.array(Image.open(ATL).convert('RGBA'))


def masks(a):
    r, g, b = [a[..., i].astype(int) for i in range(3)]
    al = a[..., 3] > 0
    navy = al & (b > 70) & (b - r > 30) & (r < 90)
    white = al & (r > 190) & (g > 190) & (b > 190)
    # the throat's shading: darker red-brown than the lit face
    throat = al & (r > 70) & (r < 200) & (g < 125) & (b < 95) & (r - b > 35)
    return navy, white, throat


report = []
for f in m['frames']['putt']:
    a = atlas[f['y']:f['y'] + f['h'], f['x']:f['x'] + f['w']].copy()
    navy, white, throat = masks(a)
    shirt = navy | white
    top = np.nonzero((a[..., 3] > 0).any(1))[0].min()
    collar = [y for y in range(top, top + 60) if navy[y].sum() >= 3][0]
    # The throat band sits just above and in front of the white collar stripe.
    zone = np.zeros_like(throat)
    zone[collar - 3:collar + 9] = True
    band = throat & zone
    # keep only throat pixels that touch the collar (directly or through other throat pixels)
    lab, n = ndi.label(band, structure=np.ones((3, 3)))
    near = ndi.binary_dilation(shirt, structure=np.ones((3, 3)))
    keep = np.zeros_like(band)
    for i in range(1, n + 1):
        comp = lab == i
        if (comp & near).any():
            keep |= comp
    # each throat pixel becomes the nearest navy shirt pixel's colour
    _, (iy, ix) = ndi.distance_transform_edt(~navy, return_indices=True)
    a[keep, :3] = a[iy[keep], ix[keep], :3]
    # stray throat specks left between the new collar pixels: a non-navy pixel in the zone with
    # five or more navy neighbours (outline pixels excluded) joins the shirt too
    for _ in range(2):
        nv = masks(a)[0]
        cnt = ndi.convolve(nv.astype(int), np.ones((3, 3), int), mode='constant') - nv
        dark = a[..., :3].max(2) < 60
        speck = zone & (a[..., 3] > 0) & ~nv & ~dark & (cnt >= 5)
        if not speck.any():
            break
        _, (iy, ix) = ndi.distance_transform_edt(~nv, return_indices=True)
        a[speck, :3] = a[iy[speck], ix[speck], :3]
        keep |= speck
    atlas[f['y']:f['y'] + f['h'], f['x']:f['x'] + f['w']] = a
    report.append(int(keep.sum()))
Image.fromarray(atlas, 'RGBA').save(OUTP)
print(report)
