"""Turn a one-row Ryan swing sheet into candidate 320x256 frames for review.

Usage:
  python3 -I tools/place_ryan_sheet.py <out_dir> p1=<sheet.png> [p2=<sheet.png> p3=<sheet.png>] [--scale S]

This is a review aid, not a production step: the spec asks for frames drawn
on the 320x256 canvas. It lets us check a sheet before that happens:

- finds the 10 poses in each sheet by 2D connectivity, left to right (stray
  club heads join the nearest golfer; poses that touch are split at the
  emptiest column),
- scales every pose of every phase by ONE common factor (so body size and club
  length stay comparable), small enough that the tallest pose fits above the
  ground line,
- snaps alpha to 0/255,
- puts the soles on y=240; planted frames (address..release) are placed by the
  trail heel at x=112, follow-through and finish by the lead toe (the lead
  foot stays planted while the trail heel lifts), at the address stance,
- writes ryan_<phase>_swing_<NN>_<pose>.png plus placement.json (scale,
  offsets, where the club head lands at address versus the ball at x=262).
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

POSES = ['address', 'takeaway', 'half_backswing', 'top', 'transition', 'downswing', 'impact', 'release', 'follow_through', 'finish']
W, H, HEEL_X, GROUND_Y, BALL_X = 320, 256, 112, 240, 262
SOLE_ROWS, FOOT_GAP = 4, 24
HEADROOM = 2  # px kept clear at the top of the canvas


def poses_in(sheet: Image.Image, n=10):
    """The n poses, left to right. Pixels are grouped by 2D connectivity (after a
    small dilation so a thin shaft or a club head drawn a few px off still joins
    its golfer), so a club head that pokes into the next pose's columns stays
    with its own golfer. Poses that touch are split at the emptiest column."""
    a = np.asarray(sheet)[..., 3] >= 64
    lab, k = ndimage.label(ndimage.binary_dilation(a, iterations=4))
    lab = lab * a
    boxes = ndimage.find_objects(lab)
    comps = [(i + 1, b, int((lab[b] == i + 1).sum())) for i, b in enumerate(boxes) if b is not None]
    big = sorted([c for c in comps if c[2] > 2000], key=lambda c: c[1][1].start)
    groups = [[c[0]] for c in big]
    spans = [(c[1][1].start, c[1][1].stop) for c in big]
    for idx, b, area in comps:  # stray bits join the nearest golfer
        if area > 2000:
            continue
        cx = (b[1].start + b[1].stop) / 2
        j = min(range(len(spans)), key=lambda j: 0 if spans[j][0] <= cx <= spans[j][1] else min(abs(cx - spans[j][0]), abs(cx - spans[j][1])))
        groups[j].append(idx)
    masks = [np.isin(lab, g) for g in groups]
    while len(masks) < n:  # two golfers touching: split the widest at its emptiest column
        i = max(range(len(masks)), key=lambda j: np.ptp(np.nonzero(masks[j].any(0))[0]))
        xs = np.nonzero(masks[i].any(0))[0]
        x0, x1 = int(xs.min()), int(xs.max()) + 1
        counts = masks[i][:, x0:x1].sum(0)
        lo, hi = (x1 - x0) // 4, 3 * (x1 - x0) // 4
        cut = x0 + lo + int(np.argmin(counts[lo:hi]))
        left, right = masks[i].copy(), masks[i].copy()
        left[:, cut:] = False
        right[:, :cut] = False
        masks[i:i + 1] = [left, right]
    if len(masks) != n:
        raise SystemExit(f'expected {n} poses, found {len(masks)}')
    px = np.asarray(sheet)
    out = []
    for m in sorted(masks, key=lambda m: np.nonzero(m.any(0))[0].min()):
        ys, xs = np.nonzero(m)
        crop = px[ys.min():ys.max() + 1, xs.min():xs.max() + 1].copy()
        keep = ndimage.binary_dilation(m, iterations=2)[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
        crop[~keep] = 0  # drop soft fringe that belongs to a neighbour
        out.append(Image.fromarray(crop))
    return out


def snap(img):
    """Binary alpha, then trim to what's left so the soles really touch the ground line."""
    px = np.asarray(img).copy()
    px[..., 3] = np.where(px[..., 3] >= 128, 255, 0)
    px[px[..., 3] == 0] = 0
    ys, xs = np.nonzero(px[..., 3])
    return Image.fromarray(px[ys.min():ys.max() + 1, xs.min():xs.max() + 1])


def feet(op):
    contact = op[-SOLE_ROWS:].any(0)
    lab, n = ndimage.label(contact)
    runs = sorted((int(np.nonzero(lab == k)[0].min()), int(np.nonzero(lab == k)[0].max())) for k in range(1, n + 1) if (lab == k).sum() >= 3)
    if not runs:
        return None
    heel, toe = runs[0]
    for a0, b in runs[1:]:
        if a0 - toe > FOOT_GAP:
            break
        toe = max(toe, b)
    return heel, toe, runs


def main():
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    sheets = {a.split('=')[0]: a.split('=')[1] for a in sys.argv[2:] if '=' in a}
    forced = float(sys.argv[sys.argv.index('--scale') + 1]) if '--scale' in sys.argv else None
    poses = {ph: poses_in(Image.open(p).convert('RGBA')) for ph, p in sheets.items()}
    tallest = max(im.height for v in poses.values() for im in v)
    scale = forced or (GROUND_Y - HEADROOM) / tallest
    report = {'scale': round(scale, 4), 'phases': {}}
    for ph, ims in poses.items():
        scaled = [snap(im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)) for im in ims]
        ref = feet(np.asarray(scaled[0])[..., 3] > 0)
        stance = ref[1] - ref[0]
        rep = {'address_height': scaled[0].height, 'frames': []}
        for k, im in enumerate(scaled):
            op = np.asarray(im)[..., 3] > 0
            f = feet(op)
            if k >= 8 and f:  # lead foot planted, trail heel up: line up the lead toe with address
                dx = HEEL_X + stance - f[1]
            else:
                dx = HEEL_X - (f[0] if f else 0)
            dy = GROUND_Y - im.height
            canvas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
            canvas.paste(im, (dx, dy), im)
            clipped = dx < 0 or dy < 0 or dx + im.width > W
            name = f'ryan_{ph}_swing_{k + 1:02d}_{POSES[k]}.png'
            canvas.save(out / name)
            entry = {'file': name, 'dx': dx, 'dy': dy, 'size': [im.width, im.height], 'clipped': bool(clipped)}
            if k == 0 and f:
                club = [r for r in f[2] if r[0] - f[1] > FOOT_GAP]
                if club:
                    head = (club[-1][0] + club[-1][1]) / 2 + dx
                    entry['club_head_x'] = round(head)
                    entry['club_head_vs_ball'] = round(head - BALL_X)
            rep['frames'].append(entry)
        report['phases'][ph] = rep
    (out / 'placement.json').write_text(json.dumps(report, indent=1))
    print(json.dumps({'scale': report['scale'], **{ph: {'address_height': r['address_height'], 'club_head_vs_ball': r['frames'][0].get('club_head_vs_ball'), 'clipped': [f['file'][9:-4] for f in r['frames'] if f['clipped']]} for ph, r in report['phases'].items()}}, indent=1))


if __name__ == '__main__':
    main()
