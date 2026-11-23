"""Acceptance checks for Ryan production art (ART_DIRECTION.md, ryan-art-v1).

Usage:
  python3 -I tools/check_ryan_art.py <asset_folder> [--phases p1,p2,p3]
      [--only swing,putt,waggle,reaction] [--review DIR]

check_assets.py (from the art direction package) checks format only: RGBA,
320x256, binary alpha. This script runs those checks and adds the acceptance
tests that can be measured from the pixels.

FAIL (blocks the frame):
  - a frame is missing, not RGBA, not 320x256, or has partial alpha
  - nothing rests on the ground line (lowest pixel must be y=239/240)
  - address frames: the trail heel is not at x=112 (±2 px)
  - a planted foot slides: from address to impact the trail heel must stay
    within 2 px and the lead toe within 3 px of where they are at address
  - a ball is drawn in the frame
  - a swing frame is an exact duplicate of the frame before it

WARN (look at it, but it may be fine):
  - poses that look very similar (silhouette overlap with the previous frame
    or with address). A small takeaway is expected to warn.
  - release, follow-through and finish: feet moved more than 8 px (the lead
    foot may turn and the trail heel lifts there by design)
  - a foot could not be measured (feet touching each other, odd shapes)

How feet are measured: only pixels on the bottom 4 rows above the ground
line (y=236–239), i.e. the soles actually touching the ground, count. Shoe
outline, toe caps and trouser cuffs higher up are ignored, so a shoe that
reaches further left above the ground no longer moves the "heel". The club
head resting on the ground at the ball (x=262 ± 20) is ignored too. The
trail heel is the left end of the leftmost ground contact; the lead toe is
the right end of the feet's contact (shoes overlapping or up to 24 px
apart count as the feet; anything further right is the club).

Visual review is still needed for what pixels can't tell: the club's shape
and that it's visible, the camera angle, and costume consistency. --review
DIR writes one strip per phase and animation for that.

File names: ryan_{phase}_{animation}_{NN}_{pose}.png (also accepted:
ryan_{phase}_{animation}_{pose}.png and ryan_{phase}_{animation}_{NN}.png).
Exit code 1 if any FAIL.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

CANVAS = (320, 256)
HEEL_X, GROUND_Y = 112, 240
BALL_X, BALL_Y = 262, 240
SOLE_ROWS = 4          # rows above the ground line that count as "touching the ground"
CLUB_ZONE = 20         # ground contact starting within this many px of the ball (or beyond it) is the club head
TOL = 2                # px, the trail heel (address anchor and planted frames), per the spec's 2 px
FOOT_GAP = 24          # px, largest gap between the two shoes' ground contact
LEAD_TOL = 3           # px, the lead toe in planted frames (shoe outlines get redrawn; a 1 px wobble is not a slide)
LOOSE = 8              # px, feet in release / follow-through / finish
SIMILAR_PREV, SIMILAR_ADDR = 0.82, 0.78   # silhouette overlap that triggers a warning
GOLF = {
    'swing': ['address', 'takeaway', 'half_backswing', 'top', 'transition', 'downswing', 'impact', 'release', 'follow_through', 'finish'],
    'putt': ['address', 'set', 'back', 'strike', 'through', 'hold'],
    'waggle': ['waggle_1', 'waggle_2', 'waggle_3', 'waggle_4'],
    'reaction': ['celebrate_1', 'celebrate_2', 'fist_pump_1', 'fist_pump_2', 'hands_on_hips', 'shade_eyes'],
}
PLANTED = {'swing': set(range(0, 7)), 'putt': set(range(0, 6)), 'waggle': set(range(0, 4))}  # frame indexes with both feet down


def args():
    root = Path(sys.argv[1])
    opts = {'phases': ['p1', 'p2', 'p3'], 'only': list(GOLF), 'review': None}
    for i, a in enumerate(sys.argv):
        if a == '--phases':
            opts['phases'] = sys.argv[i + 1].split(',')
        elif a == '--only':
            opts['only'] = sys.argv[i + 1].split(',')
        elif a == '--review':
            opts['review'] = Path(sys.argv[i + 1])
    return root, opts


def find(root, phase, anim, k, pose):
    pats = [f'ryan_{phase}_{anim}_{k + 1:02d}_{pose}.png', f'ryan_{phase}_{anim}_{pose}.png', f'ryan_{phase}_{anim}_{k + 1:02d}.png']
    if anim == 'waggle':
        pats.append(f'ryan_{phase}_waggle_{k + 1}.png')
    for pat in pats:
        hits = list(root.rglob(pat))
        if hits:
            return hits[0]
    return None


def feet(op, ref=None):
    """(trail_heel_x, lead_toe_x) from the soles touching the ground, or None.

    Down the line, the two shoes often overlap into one patch of ground
    contact, so the feet are the leftmost contact plus any contact chained to
    it by gaps of at most FOOT_GAP px. The club head on the ground at the ball
    is never counted. With `ref` (the address feet), contact that starts more
    than FOOT_GAP px past the address lead toe is the club head, not a foot:
    at impact the club head can rest close to the shoes.
    """
    contact = op[GROUND_Y - SOLE_ROWS:GROUND_Y].any(0)
    lab, n = ndimage.label(contact)
    runs = []
    for k in range(1, n + 1):
        xs = np.nonzero(lab == k)[0]
        if len(xs) < 3 or xs.min() >= BALL_X - CLUB_ZONE:
            continue
        if ref is not None and ref[1] is not None and xs.min() > ref[1] + LEAD_TOL and xs.min() - ref[1] > 6:
            continue
        runs.append((int(xs.min()), int(xs.max())))
    if not runs:
        return None
    runs.sort()
    heel, toe = runs[0]
    for a, b in runs[1:]:
        if a - toe > FOOT_GAP:
            break
        toe = max(toe, b)
    return heel, toe


def has_ball(op, rgb):
    """A small, separate, bright, roundish blob resting near the ground anywhere in the frame."""
    lab, n = ndimage.label(op)
    for k in range(1, n + 1):
        ys, xs = np.nonzero(lab == k)
        if len(ys) > 160 or len(ys) < 6:
            continue
        if ys.max() >= GROUND_Y - 16 and rgb[ys, xs].mean() > 185:
            h, w = np.ptp(ys) + 1, np.ptp(xs) + 1
            if 0.6 < h / w < 1.6:
                return True
    return False


def iou(a, b):
    return (a & b).sum() / max(1, (a | b).sum())


def main():
    root, o = args()
    fails, warns, summary = [], [], {}
    for phase in o['phases']:
        ref_feet = None  # swing address feet, reused by waggle
        for anim in o['only']:
            prev = prev_px = first = None
            anim_ref = None
            strip = []
            summary[(phase, anim)] = [0, len(GOLF[anim])]
            for k, pose in enumerate(GOLF[anim]):
                name = f'{phase} {anim} {k + 1:02d} {pose}'
                path = find(root, phase, anim, k, pose)
                if not path:
                    fails.append(f'{name}: MISSING')
                    prev = prev_px = None
                    continue
                summary[(phase, anim)][0] += 1
                im = Image.open(path)
                if im.mode != 'RGBA':
                    fails.append(f'{name}: mode {im.mode}, not RGBA')
                    im = im.convert('RGBA')
                if im.size != CANVAS:
                    fails.append(f'{name}: size {im.size}, expected {CANVAS}')
                    prev = prev_px = None
                    continue
                px = np.asarray(im)
                a = px[..., 3]
                soft = int(((a > 0) & (a < 255)).sum())
                if soft:
                    fails.append(f'{name}: partial alpha ({soft} px)')
                op = a > 0
                if not op.any():
                    fails.append(f'{name}: empty frame')
                    continue
                low = int(np.nonzero(op.any(1))[0].max())
                if low not in (GROUND_Y - 1, GROUND_Y):
                    fails.append(f'{name}: lowest pixel at y={low}; soles must rest on y={GROUND_Y}')
                if has_ball(op, px[..., :3].astype(int)):
                    fails.append(f'{name}: a ball seems to be drawn in the frame')

                # Feet
                if anim in PLANTED:
                    f = feet(op, None if k == 0 and anim != 'waggle' else (anim_ref if anim != 'waggle' else ref_feet))
                    if f is None:
                        warns.append(f'{name}: no sole touching the ground could be measured')
                    else:
                        heel, toe = f
                        if k == 0 and anim in ('swing', 'putt'):
                            if abs(heel - HEEL_X) > TOL:
                                fails.append(f'{name}: trail heel at x={heel}, expected {HEEL_X}±{TOL}')
                            anim_ref = f
                            if anim == 'swing':
                                ref_feet = f
                        ref = anim_ref if anim != 'waggle' else (ref_feet or (HEEL_X, None))
                        if ref and not (k == 0 and anim != 'waggle'):
                            dh = heel - ref[0]
                            dt = None if ref[1] is None else toe - ref[1]
                            moved = max(abs(dh), abs(dt or 0))
                            what = f'trail heel {dh:+d} px' + ('' if dt is None else f', lead toe {dt:+d} px')
                            if k in PLANTED[anim]:
                                if abs(dh) > TOL or (dt is not None and abs(dt) > LEAD_TOL):
                                    fails.append(f'{name}: planted feet slid vs address ({what}; allowed heel ±{TOL}, toe ±{LEAD_TOL})')
                            elif moved > LOOSE:
                                warns.append(f'{name}: feet moved vs address ({what}); fine if the foot is turning or lifting')

                # Repeated poses (swing only)
                if anim == 'swing':
                    if prev_px is not None and (np.array_equal(px, prev_px) or (iou(op, prev) > 0.995 and (np.abs(px.astype(int) - prev_px.astype(int)).sum(-1) > 30).sum() < 0.005 * op.sum())):
                        fails.append(f'{name}: exact duplicate of the previous frame')
                    elif prev is not None and iou(op, prev) >= SIMILAR_PREV:
                        warns.append(f'{name}: very similar to the previous frame (silhouette overlap {iou(op, prev):.0%})')
                    elif first is not None and k > 1 and iou(op, first) >= SIMILAR_ADDR:
                        warns.append(f'{name}: very similar to address (silhouette overlap {iou(op, first):.0%})')
                    if first is None:
                        first = op
                prev, prev_px = op, px
                strip.append((pose, im))
            if o['review'] and strip:
                write_strip(o['review'], phase, anim, strip)

    total = sum(v[1] for v in summary.values())
    have = sum(v[0] for v in summary.values())
    print(f'Ryan golf frames present: {have}/{total}')
    for (phase, anim), (h, t) in sorted(summary.items()):
        print(f'  {phase} {anim:8} {h}/{t}')
    print(f'\n{len(fails)} failures, {len(warns)} warnings')
    for e in fails:
        print('FAIL', e)
    for w in warns:
        print('WARN', w)
    print('\nStill needs eyes: club visible and the right shape in every swing frame, same camera angle, same costume.')
    sys.exit(1 if fails else 0)


def write_strip(out, phase, anim, strip):
    out.mkdir(parents=True, exist_ok=True)
    sheet = Image.new('RGBA', (CANVAS[0] * len(strip), CANVAS[1] + 18), (34, 52, 40, 255))
    dr = ImageDraw.Draw(sheet)
    for j, (pose, im) in enumerate(strip):
        x0 = j * CANVAS[0]
        dr.line((x0, 18 + GROUND_Y, x0 + CANVAS[0], 18 + GROUND_Y), fill=(240, 210, 60, 255))
        dr.line((x0 + HEEL_X, 18 + GROUND_Y - 8, x0 + HEEL_X, 18 + GROUND_Y + 6), fill=(230, 60, 60, 255), width=2)
        dr.ellipse((x0 + BALL_X - 4, 18 + BALL_Y - 8, x0 + BALL_X + 4, 18 + BALL_Y), outline=(255, 255, 255, 255))
        if im.size == CANVAS:
            sheet.alpha_composite(im.convert('RGBA'), (x0, 18))
        dr.text((x0 + 4, 3), f'{phase} {anim} {pose}', fill=(255, 255, 255, 255))
    sheet.save(out / f'_review_{phase}_{anim}.png')


if __name__ == '__main__':
    main()
