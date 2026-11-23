import { describe, expect, it } from 'vitest';
import { checksum } from '../src/core/checksum';
import {
  activeCourse, completeRound, finalizeTournament, findTournament, holesToPlay, parsOf, seasonSchedule, startTournament, validateResult,
  type TournamentResult,
} from '../src/career/tournament';
import * as E from '../src/career/engine';
import { aiPlayHole } from '../src/golf/ai';
import { coursePar, holeYardage, inShape, surfaceAt } from '../src/golf/course';
import { COURSES, DRY_CREEK_MUNI, getCourse, HIGHLAND_RIDGE } from '../src/golf/courses';
import { pointAlongPolyline, rng } from '../src/golf/math';

describe('courses', () => {
  it('there are six distinct venues, each a sane 9-hole layout', () => {
    expect(COURSES).toHaveLength(6);
    expect(new Set(COURSES.map((c) => c.id)).size).toBe(6);
    for (const c of COURSES) {
      expect(c.holes).toHaveLength(9);
      expect(coursePar(c)).toBeGreaterThanOrEqual(34);
      expect(coursePar(c)).toBeLessThanOrEqual(37);
      expect(c.holes.some((h) => h.par === 3) && c.holes.some((h) => h.par === 5)).toBe(true);
      for (const h of c.holes) {
        const where = `${c.name} #${h.number}`;
        expect(surfaceAt(h, { x: 0, y: 0 }), where).toBe('tee');
        expect(surfaceAt(h, h.pin), where).toBe('green');
        const y = holeYardage(h);
        if (h.par === 3) expect(y > 120 && y < 230, `${where} ${y}y`).toBe(true);
        if (h.par === 4) expect(y > 300 && y < 470, `${where} ${y}y`).toBe(true);
        if (h.par === 5) expect(y > 470 && y < 600, `${where} ${y}y`).toBe(true);
        // No tree stands in water, a bunker, or on the green.
        for (const t of h.trees) expect(['water', 'bunker', 'green'], where).not.toContain(surfaceAt(h, t));
        // Par 4s and 5s have dry fairway to land a drive on.
        if (h.par > 3) {
          const landing = pointAlongPolyline(h.centerline, 240);
          expect(h.fairways.some((f) => inShape(landing, f)) || surfaceAt(h, landing) === 'rough', where).toBe(true);
          expect(['water', 'ob'], where).not.toContain(surfaceAt(h, landing));
        }
      }
    }
  });

  it('play to credible scores, with Highland Ridge the hardest', () => {
    const P = [{ strength: 0.97, aimSdDeg: 2.2, powerSd: 0.05, putting: 0.6 }, { strength: 1.02, aimSdDeg: 1.4, powerSd: 0.035, putting: 0.75 }];
    const over: Record<string, number> = {};
    for (const c of COURSES) {
      const r = rng(7);
      let total = 0;
      const N = 16;
      for (let n = 0; n < N; n++) for (const h of c.holes) total += aiPlayHole(h, P[n % 2], { heading: r.range(0, 6.28), mph: r.range(0, 12) }, r);
      over[c.id] = total / N - coursePar(c);
      expect(over[c.id], c.name).toBeGreaterThan(-2);
      expect(over[c.id], c.name).toBeLessThan(7);
    }
    expect(Math.max(...Object.values(over))).toBe(over[HIGHLAND_RIDGE.id]);
  });

  it('unknown course ids fall back to Dry Creek', () => {
    expect(getCourse('nope')).toBe(DRY_CREEK_MUNI);
    expect(getCourse(undefined)).toBe(DRY_CREEK_MUNI);
  });
});

describe('the tour travels', () => {
  it('every tour visits several courses, and LPGA majors go to marquee venues', () => {
    const sched = seasonSchedule(1);
    for (const tour of ['amateur', 'mini', 'epson', 'lpga'] as const) {
      const ids = new Set(sched.filter((t) => t.tour === tour).map((t) => t.courseId));
      expect(ids.size, tour).toBeGreaterThanOrEqual(4);
      for (const id of ids) expect(getCourse(id).id).toBe(id);
    }
    const qseries = sched.find((t) => t.id === 'qschool-1-s3')!;
    expect(qseries.courseId).toBe(HIGHLAND_RIDGE.id);
    // Back-to-back events don't repeat a course on the same tour (most of the time).
    const lpga = sched.filter((t) => t.tour === 'lpga');
    const repeats = lpga.filter((t, i) => i > 0 && lpga[i - 1].courseId === t.courseId).length;
    expect(repeats).toBeLessThanOrEqual(4);
  });

  it('a tournament is played, sealed and validated on its own course', () => {
    const c = E.newCareerState(3);
    c.status = 'pro';
    c.tourCard = 'lpga';
    const def = findTournament('lpga-1-w2')!;
    expect(def.courseId).not.toBe(DRY_CREEK_MUNI.id);
    let a = startTournament(def, c, 'key');
    expect(a.courseId).toBe(def.courseId);
    const pars = parsOf(activeCourse(a));
    expect(holesToPlay('key', 0, pars).length).toBeGreaterThanOrEqual(3);
    while (a.round < def.rounds) {
      a.playerHoles = pars.map((p) => p);
      a = completeRound(a, def, c);
    }
    const r = finalizeTournament(a, def, c.playerId);
    expect(r.courseId).toBe(def.courseId);
    expect(r.pars).toEqual(pars);
    expect(validateResult(r)).toEqual({ ok: true });
    // Claiming a different course is rejected.
    const forged = reseal(r, (x) => { x.courseId = DRY_CREEK_MUNI.id; x.pars = parsOf(DRY_CREEK_MUNI); });
    expect(validateResult(forged).ok).toBe(false);
  });

  it('a save mid-tournament from before courses varied finishes at Dry Creek', () => {
    const c = E.newCareerState(3);
    c.status = 'pro';
    c.tourCard = 'lpga';
    const def = findTournament('lpga-1-w2')!;
    let a = startTournament(def, c, 'sim');
    delete a.courseId; // an old save
    expect(activeCourse(a)).toBe(DRY_CREEK_MUNI);
    while (a.round < def.rounds) a = completeRound(a, def, c);
    const r = finalizeTournament(a, def, c.playerId);
    expect(r.pars).toEqual(parsOf(DRY_CREEK_MUNI));
    expect(validateResult(r)).toEqual({ ok: true });
  });

  it('harder courses cost the simulated field strokes', () => {
    const c = E.newCareerState(3);
    c.status = 'pro';
    c.tourCard = 'lpga';
    const avg = (courseId: string) => {
      let sum = 0;
      let n = 0;
      for (const w of [2, 4, 6, 8, 10, 12, 14]) {
        const def = { ...findTournament(`lpga-1-w${w}`)!, courseId };
        let a = startTournament(def, c, 'sim');
        while (a.round < def.rounds) a = completeRound(a, def, c);
        for (const rounds of Object.values(a.scores)) for (const holes of rounds) {
          sum += holes.reduce((x, y) => x + y, 0) - coursePar(getCourse(courseId));
          n++;
        }
      }
      return sum / n;
    };
    expect(avg(HIGHLAND_RIDGE.id)).toBeGreaterThan(avg(DRY_CREEK_MUNI.id) + 1);
  });
});

function reseal(r: TournamentResult, mutate: (x: TournamentResult) => void): TournamentResult {
  const x = structuredClone(r);
  mutate(x);
  const { authority, ...content } = x;
  x.authority = { ...authority, checksum: checksum(content) };
  return x;
}
