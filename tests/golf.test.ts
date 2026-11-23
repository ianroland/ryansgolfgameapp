import { describe, expect, it } from 'vitest';
import { aiPlayHole, planShot, planToInput, type AiProfile } from '../src/golf/ai';
import { CLUBS, type ClubId } from '../src/golf/clubs';
import { coursePar, holeYardage, surfaceAt, type HoleDef } from '../src/golf/course';
import { DRY_CREEK_MUNI } from '../src/golf/courses/dryCreek';
import { rng } from '../src/golf/math';
import { simulateShot, type ShotInput } from '../src/golf/physics';

const H = DRY_CREEK_MUNI.holes;
const OPEN: HoleDef = {
  number: 99, par: 4, name: 'Test range', pin: { x: 0, y: 600 },
  centerline: [{ x: 0, y: 0 }, { x: 0, y: 600 }], corridorHalfWidth: 200,
  fairways: [{ type: 'strip', pts: [{ x: 0, y: 10 }, { x: 0, y: 580 }], hw: 150 }],
  green: { x: 0, y: 600, rx: 15, ry: 15 }, greenSlope: { x: 0, y: 0 }, bunkers: [], water: [], trees: [],
};
const shot = (o: Partial<ShotInput> & { club: ClubId }): ShotInput => ({
  start: { x: 0, y: 0 }, heading: 0, power: 1, height: 0.5, curve: 0, spin: 0, wind: { heading: 0, mph: 0 }, lie: 'tee', ...o,
});

describe('ball physics', () => {
  it('full-power carry matches the club chart in still air', () => {
    for (const c of CLUBS.filter((c) => c.id !== 'PT')) {
      const r = simulateShot(OPEN, shot({ club: c.id }));
      expect(Math.abs(r.carry - c.carry) / c.carry).toBeLessThan(0.02);
      expect(r.total).toBeGreaterThan(r.carry);
    }
  });

  it('wind: headwind shortens, tailwind lengthens, crosswind drifts downwind', () => {
    const still = simulateShot(OPEN, shot({ club: '7I' }));
    const head = simulateShot(OPEN, shot({ club: '7I', wind: { heading: Math.PI, mph: 12 } }));
    const tail = simulateShot(OPEN, shot({ club: '7I', wind: { heading: 0, mph: 12 } }));
    const cross = simulateShot(OPEN, shot({ club: '7I', wind: { heading: Math.PI / 2, mph: 12 } }));
    expect(head.carry).toBeLessThan(still.carry - 5);
    expect(tail.carry).toBeGreaterThan(still.carry + 5);
    expect(cross.end.x).toBeGreaterThan(4);
  });

  it('curve: fade goes right, draw goes left', () => {
    expect(simulateShot(OPEN, shot({ club: '5I', curve: 3 })).end.x).toBeGreaterThan(15);
    expect(simulateShot(OPEN, shot({ club: '5I', curve: -3 })).end.x).toBeLessThan(-15);
  });

  it('height: low shots run out, high shots stop; backspin bites, topspin releases', () => {
    const low = simulateShot(OPEN, shot({ club: 'DR', height: 0 }));
    const high = simulateShot(OPEN, shot({ club: 'DR', height: 1 }));
    expect(low.total - low.carry).toBeGreaterThan(high.total - high.carry);
    expect(high.apex).toBeGreaterThan(low.apex);
    const approach = { start: { x: 0, y: 600 - 154 }, lie: 'fairway' as const, club: '7I' as const };
    const back = simulateShot(OPEN, shot({ ...approach, spin: -1 }));
    const top = simulateShot(OPEN, shot({ ...approach, spin: 1 }));
    expect(back.total - back.carry).toBeLessThan(4);
    expect(top.total - top.carry).toBeGreaterThan((back.total - back.carry) * 2);
  });

  it('water costs a stroke and replays from the same spot', () => {
    const r = simulateShot(H[4], shot({ club: 'SW', power: 0.8 })); // into the reservoir
    expect(r.outcome).toBe('water');
    expect(r.penaltyStrokes).toBe(1);
    expect(r.nextLie).toEqual({ x: 0, y: 0 });
  });

  it('out of bounds costs a stroke', () => {
    const r = simulateShot(H[3], shot({ club: '3W', heading: Math.PI / 2 }));
    expect(r.outcome).toBe('ob');
    expect(r.penaltyStrokes).toBe(1);
  });

  it('trees stop the ball', () => {
    const t = H[0].trees[H[0].trees.length - 1]; // corner eucalyptus
    const heading = Math.atan2(t.x, t.y);
    const r = simulateShot(H[0], shot({ club: '3W', heading, height: 0.2, power: Math.hypot(t.x, t.y) / 222 }));
    expect(r.hitTree).toBe(true);
  });

  it('putting: a well-judged putt drops, a charged one lips/runs past, a short one stays out', () => {
    const start = { x: 0, y: 594 };
    const plan = planShot(OPEN, start, 'green', { heading: 0, mph: 0 }, 1, false);
    expect(plan.club).toBe('PT');
    expect(simulateShot(OPEN, planToInput(plan, start, 'green', { heading: 0, mph: 0 }, 1)).outcome).toBe('holed');
    const hard = simulateShot(OPEN, { ...planToInput(plan, start, 'green', { heading: 0, mph: 0 }, 1), power: 1, puttScale: 32 });
    expect(hard.outcome).toBe('rest');
    const short = simulateShot(OPEN, { ...planToInput(plan, start, 'green', { heading: 0, mph: 0 }, 1), power: plan.power * 0.5 });
    expect(short.outcome).toBe('rest');
  });

  it('green slope breaks putts', () => {
    const sloped = { ...OPEN, greenSlope: { x: 0.35, y: 0 } };
    const start = { x: 0, y: 590 };
    const straight = simulateShot(sloped, shot({ start, club: 'PT', power: 0.6, puttScale: 16, lie: 'green' }));
    expect(straight.end.x).toBeGreaterThan(0.3);
  });
});

describe('Dry Creek Muni', () => {
  it('is a sane 9-hole, par-35 layout', () => {
    expect(H).toHaveLength(9);
    expect(coursePar(DRY_CREEK_MUNI)).toBe(35);
    for (const h of H) {
      expect(surfaceAt(h, { x: 0, y: 0 })).toBe('tee');
      expect(surfaceAt(h, h.pin)).toBe('green');
      const y = holeYardage(h);
      if (h.par === 3) expect(y).toBeGreaterThan(120), expect(y).toBeLessThan(230);
      if (h.par === 4) expect(y).toBeGreaterThan(300), expect(y).toBeLessThan(460);
      if (h.par === 5) expect(y).toBeGreaterThan(470);
    }
  });
});

describe('AI golfers', () => {
  const PROFILES: AiProfile[] = [
    { strength: 0.97, aimSdDeg: 2.2, powerSd: 0.05, putting: 0.6 },
    { strength: 1.02, aimSdDeg: 1.4, powerSd: 0.035, putting: 0.75 },
  ];
  it('are deterministic for a seed', () => {
    const a = H.map((h) => aiPlayHole(h, PROFILES[0], { heading: 1, mph: 6 }, rng(5)));
    const b = H.map((h) => aiPlayHole(h, PROFILES[0], { heading: 1, mph: 6 }, rng(5)));
    expect(a).toEqual(b);
  });

  it('score in a credible range', () => {
    for (const p of PROFILES) {
      const r = rng(11);
      let total = 0;
      const N = 25;
      for (let n = 0; n < N; n++) for (const h of H) total += aiPlayHole(h, p, { heading: r.range(0, 6.28), mph: r.range(0, 12) }, r);
      const avgOverPar = total / N - coursePar(DRY_CREEK_MUNI);
      expect(avgOverPar).toBeGreaterThan(-2);
      expect(avgOverPar).toBeLessThan(8);
    }
  });
});

describe('backspin', () => {
  const green = { start: { x: 0, y: 600 - 70 }, lie: 'fairway' as const, club: 'SW' as const, power: 0.82, height: 0.6 };
  it('a backspin wedge checks and spins back on the green', () => {
    const r = simulateShot(OPEN, shot({ ...green, spin: -1 }));
    expect(r.endSurface).toBe('green');
    expect(r.spinBack).toBeGreaterThan(2);
    const landing = r.path[r.landingIndex];
    expect(r.end.y).toBeLessThan(landing.y); // finished short of where it landed
  });
  it('without backspin the same wedge releases forward', () => {
    const r = simulateShot(OPEN, shot({ ...green, spin: 0 }));
    expect(r.spinBack).toBeLessThan(0.5);
    expect(r.end.y).toBeGreaterThan(r.path[r.landingIndex].y);
  });
  it('spin depends on club and lie: wedges zip back, long irons and rough lies barely do', () => {
    const wedge = simulateShot(OPEN, shot({ ...green, spin: -1 }));
    const rough = simulateShot(OPEN, shot({ ...green, spin: -1, lie: 'rough', power: 0.95 }));
    const iron = simulateShot(OPEN, shot({ start: { x: 0, y: 600 - 190 }, lie: 'fairway', club: '3I', spin: -1 }));
    expect(rough.spinBack).toBeLessThan(wedge.spinBack / 2);
    expect(iron.spinBack).toBeLessThan(wedge.spinBack);
  });
  it('a short backspin chip still spins back a little', () => {
    const r = simulateShot(OPEN, shot({ start: { x: 0, y: 600 - 30 }, lie: 'fairway', club: 'SW', power: 0.42, height: 0.7, spin: -1 }));
    expect(r.endSurface).toBe('green');
    expect(r.spinBack).toBeGreaterThan(0.4);
  });
});
