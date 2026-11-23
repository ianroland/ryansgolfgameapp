"""Self-test for tools/check_ryan_art.py on synthetic frames with known answers.

Usage: python3 -I tools/test_check_ryan_art.py
Builds a fake Phase 1 swing in a temp folder (simple shapes: shoes, body, a
grey club), then breaks it one way at a time and checks the verdict.
"""
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
CHECK = HERE / 'check_ryan_art.py'
POSES = ['address', 'takeaway', 'half_backswing', 'top', 'transition', 'downswing', 'impact', 'release', 'follow_through', 'finish']
# Hands and club head per pose (rough, but every pose differs).
CLUB = [((185, 150), (262, 236)), ((185, 140), (110, 150)), ((175, 110), (175, 30)), ((150, 40), (230, 30)),
        ((160, 60), (110, 40)), ((175, 120), (120, 90)), ((190, 150), (262, 236)), ((200, 140), (290, 170)),
        ((150, 50), (90, 70)), ((140, 40), (80, 60))]
ARMS = [(150, 70), (160, 80), (170, 60), (150, 40), (155, 60), (165, 90), (175, 100), (185, 90), (145, 45), (140, 40)]


def frame(k, shift=0, heel_up=False, overhang=False, ball=False, soft=False):
    im = Image.new('RGBA', (320, 256), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    ink, navy, tan, shoe, grey = (20, 20, 28, 255), (30, 40, 110, 255), (200, 170, 120, 255), (245, 245, 245, 255), (150, 152, 158, 255)
    # Trail shoe (heel at x=112) and lead shoe; outlined.
    if heel_up:
        d.polygon([(130 + shift, 239), (150 + shift, 239), (150 + shift, 226), (118 + shift, 214)], fill=shoe, outline=ink)
    else:
        d.rectangle((112 + shift, 228, 150 + shift, 239), fill=shoe, outline=ink)
    d.rectangle((158 + shift, 228, 196 + shift, 239), fill=shoe, outline=ink)
    if overhang:  # a toe cap / cuff reaching further left, above the ground contact
        d.rectangle((100 + shift, 222, 112 + shift, 233), fill=shoe, outline=ink)
    d.rectangle((122 + shift, 130, 186 + shift, 227), fill=tan, outline=ink)   # legs
    d.rectangle((118 + shift, 50, 190 + shift, 130), fill=navy, outline=ink)   # polo
    d.ellipse((134 + shift, 8, 176 + shift, 50), fill=(220, 170, 130, 255), outline=ink)  # head
    d.line((165 + shift, 70, ARMS[k][0] + shift, ARMS[k][1]), fill=(220, 170, 130, 255), width=9)
    (hx, hy), (cx, cy) = CLUB[k]
    d.line((hx + shift, hy, cx + (0 if cx == 262 else shift), cy), fill=grey, width=3)
    d.ellipse((cx - 7, cy - 4, cx + 7, cy + 3), fill=grey, outline=ink)
    if ball:
        d.ellipse((290, 230, 299, 239), fill=(255, 255, 255, 255))
    if soft:
        px = im.load()
        px[60, 60] = (255, 255, 255, 120)
    return im


def run(folder):
    r = subprocess.run([sys.executable, '-I', str(CHECK), str(folder), '--phases', 'p1', '--only', 'swing'], capture_output=True, text=True)
    return r.returncode, r.stdout


def write(folder, frames):
    for k, im in enumerate(frames):
        im.save(folder / f'ryan_p1_swing_{k + 1:02d}_{POSES[k]}.png')


CASES = []


def case(fn):
    CASES.append(fn)
    return fn


@case
def valid_swing(base):
    return [frame(k) for k in range(10)], 0, []


@case
def shoe_reaching_left_is_not_the_heel(base):
    return [frame(k, overhang=(k in (0, 2, 5))) for k in range(10)], 0, []


@case
def club_head_on_the_ground_is_not_a_foot(base):
    frames = [frame(k) for k in range(10)]
    for k in (4, 5):  # club head grounded short of the ball, 29 px past the lead toe
        ImageDraw.Draw(frames[k]).ellipse((225, 232, 239, 239), fill=(150, 152, 158, 255), outline=(20, 20, 28, 255))
    return frames, 0, []


@case
def club_head_next_to_the_lead_foot_at_impact(base):
    frames = [frame(k) for k in range(10)]
    ImageDraw.Draw(frames[6]).ellipse((205, 232, 219, 239), fill=(150, 152, 158, 255), outline=(20, 20, 28, 255))  # 9 px past the toe
    return frames, 0, []


@case
def lead_foot_slide_alone_fails(base):
    frames = [frame(k) for k in range(10)]
    d = ImageDraw.Draw(frames[5])
    d.rectangle((158, 228, 196, 239), fill=(0, 0, 0, 0))
    d.rectangle((164, 228, 202, 239), fill=(245, 245, 245, 255), outline=(20, 20, 28, 255))  # lead shoe 6 px right
    return frames, 1, ['06 downswing: planted feet slid']


@case
def finish_heel_lifts_without_failing(base):
    return [frame(k, heel_up=(k >= 8)) for k in range(10)], 0, []


@case
def planted_foot_slide_fails(base):
    return [frame(k, shift=(6 if k == 4 else 0)) for k in range(10)], 1, ['05 transition: planted feet slid']


@case
def address_off_anchor_fails(base):
    return [frame(k, shift=5) for k in range(10)], 1, ['01 address: trail heel at x=117']


@case
def subtle_takeaway_only_warns(base):
    frames = [frame(k) for k in range(10)]
    frames[1] = frame(0)
    d = ImageDraw.Draw(frames[1])
    d.line((185, 150, 255, 232), fill=(150, 152, 158, 255), width=3)  # club barely moved
    return frames, 0, ['WARN p1 swing 02 takeaway: very similar']


@case
def exact_duplicate_fails(base):
    frames = [frame(k) for k in range(10)]
    frames[5] = frames[4].copy()
    return frames, 1, ['06 downswing: exact duplicate']


@case
def drawn_ball_fails(base):
    return [frame(k, ball=(k == 0)) for k in range(10)], 1, ['01 address: a ball seems to be drawn']


@case
def soft_alpha_fails(base):
    return [frame(k, soft=(k == 3)) for k in range(10)], 1, ['04 top: partial alpha']


@case
def missing_frame_fails(base):
    frames = [frame(k) for k in range(10)]
    return frames[:9], 1, ['10 finish: MISSING']


def main():
    bad = 0
    for fn in CASES:
        with tempfile.TemporaryDirectory() as t:
            folder = Path(t)
            frames, want_code, want_lines = fn(folder)
            write(folder, frames)
            code, out = run(folder)
            ok = code == want_code and all(w in out for w in want_lines)
            if want_code == 0:
                ok = ok and 'FAIL' not in out
            print(('PASS ' if ok else 'FAIL ') + fn.__name__)
            if not ok:
                bad += 1
                print(out)
    print(f'{len(CASES) - bad}/{len(CASES)} cases pass')
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
