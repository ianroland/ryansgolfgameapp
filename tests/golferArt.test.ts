/** Ryan's on-course art per phase: every animation the round uses exists, and the big cut-ins pick sensibly. */
import { describe, expect, it } from 'vitest';
import { cutinFor, frameFor, GOLFER_LOOKS, reactionFrame, type Reaction } from '../src/game/golferAnim';

describe('Ryan on-course art (approved per-phase sheets)', () => {
  it('each phase has the swing, putt, waggle and every reaction frame the round can ask for', () => {
    for (const [look, g] of Object.entries(GOLFER_LOOKS)) {
      const f = g.atlas.frames;
      expect(f.swing, look).toHaveLength(12);
      expect(f.putt, look).toHaveLength(6);
      expect(f.idle, look).toHaveLength(12);
      for (let t = 0; t < 4; t += 0.05) {
        for (const r of ['celebrate', 'pump', 'pumpLow', 'hips', 'shade', 'frustrated'] as Reaction[]) {
          const { anim, index } = reactionFrame(r, t);
          expect(f[anim][index], `${look} ${r} ${t}`).toBeDefined();
        }
        const a = frameFor({ kind: 'address', putt: false, idle: t });
        expect(f[a.anim][a.index]).toBeDefined();
      }
      expect(g.atlas.drawnBall).toBe(false);
    }
  });

  it('big reaction cut-ins: ace/albatross, eagle, birdie, par, and a par-3 green from the tee', () => {
    const base = { putt: true, par: 4, teeShotOnGreen: false };
    expect(cutinFor({ ...base, holed: true, strokes: 1, par: 3 })).toBe(1);
    expect(cutinFor({ ...base, holed: true, strokes: 2, par: 5 })).toBe(1);
    expect(cutinFor({ ...base, holed: true, strokes: 2 })).toBe(0);
    expect(cutinFor({ ...base, holed: true, strokes: 3 })).toBe(2);
    expect(cutinFor({ ...base, holed: true, strokes: 4 })).toBe(3);
    expect(cutinFor({ ...base, holed: true, strokes: 4, putt: false })).toBe(4);
    expect(cutinFor({ ...base, holed: true, strokes: 5 })).toBeNull();
    expect(cutinFor({ ...base, holed: false, strokes: 1, par: 3, teeShotOnGreen: true })).toBe(5);
    expect(cutinFor({ ...base, holed: false, strokes: 2 })).toBeNull();
  });
});
