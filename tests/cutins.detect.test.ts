/**
 * CI-1 acceptance tests: detection (A5–A8) and output schema (A25).
 * Spec: "Live Tournament Cut-Ins — CI-1 Specification (Revision 2)".
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { QSCHOOL, SCHEDULES, TOURS, PLAYER_NAME } from '../src/career/config';
import { newCareerState } from '../src/career/engine';
import { seasonSchedule } from '../src/career/tournament';
import { detect, totalsAt } from '../src/cutins/detect';
import { planRound } from '../src/cutins/plan';
import { score4 } from '../src/cutins/score';
import { revealSnapshot } from '../src/cutins/snapshot';
import type { Moment, RevealSnapshot } from '../src/cutins/types';
import { careerFor, runTournament } from '../tools/cutins-lab/rates';

/** A synthetic snapshot: every golfer pars every hole unless `changes` says otherwise. */
function snap(opts: {
  pars?: number[];
  round?: number;
  rounds?: number;
  special?: boolean;
  golfers: Record<string, [prior: number, changes?: Record<number, number>]>;
  boundaries?: number[];
  rival?: string;
}): RevealSnapshot {
  const pars = opts.pars ?? [4, 5, 4, 3, 4, 4, 5, 3, 4];
  const holes: Record<string, number[]> = {};
  const prior: Record<string, number> = {};
  for (const [id, [p, ch = {}]] of Object.entries(opts.golfers)) {
    holes[id] = pars.map((par, i) => ch[i + 1] ?? par);
    prior[id] = p;
  }
  const round = opts.round ?? 1;
  const rounds = opts.rounds ?? 4;
  return {
    tournamentId: 't-1',
    tour: 'lpga',
    special: opts.special ?? false,
    round,
    rounds,
    isFinal: round === rounds - 1,
    pars,
    q: pars.length,
    boundaries: opts.boundaries ?? pars.map((_, i) => i + 1),
    ryanId: 'golfer_ryan',
    rivalId: opts.rival ?? 'golfer_kayla_brooks',
    alive: Object.keys(holes),
    prior,
    holes,
  };
}
const types = (ms: Moment[]) => ms.map((m) => `${m.type}:${m.golferId}:h${m.hole}`).sort();

describe('A5 — truncation: a snapshot built at q holds nothing after q', () => {
  it('every golfer has exactly q holes, for every q of real tournaments', () => {
    for (const tour of ['amateur', 'lpga'] as const) {
      const c = careerFor(tour, 7);
      const def = seasonSchedule(1).find((d) => d.tour === tour)!;
      runTournament(def, c, 'full', {
        onHole: (_b, after, d, cc) => {
          for (let q = 0; q <= 9; q++) {
            const s = revealSnapshot(after, d, cc, q);
            expect(s.q).toBe(q);
            for (const id of s.alive) expect(s.holes[id]).toHaveLength(q);
            expect(s.boundaries.every((b) => b <= q)).toBe(true);
          }
        },
      });
    }
  });
});

describe('A6 — evidence classes', () => {
  const s = snap({
    golfers: {
      golfer_ryan: [0],
      golfer_par3ace: [0, { 4: 1 }],
      golfer_par4ace: [0, { 1: 1 }],
      golfer_alb: [0, { 2: 2 }],
      golfer_eagle5: [0, { 7: 3 }],
      golfer_eagle4: [0, { 3: 2 }],
    },
    boundaries: [9],
  });
  const ms = detect(s, 0, 9);
  const byGolfer = (g: string) => ms.filter((m) => m.golferId === g);
  it('a 1 on a par 3 is an ACE with tee_shot_holed', () => {
    expect(byGolfer('golfer_par3ace').map((m) => [m.type, m.evidence])).toEqual([['ACE', ['tee_shot_holed']]]);
  });
  it('a 1 on a par 4 is an ACE, never an ALBATROSS', () => {
    expect(byGolfer('golfer_par4ace').map((m) => m.type)).toEqual(['ACE']);
  });
  it('a 2 on a par 5 is an ALBATROSS with score_only', () => {
    expect(byGolfer('golfer_alb').map((m) => [m.type, m.evidence])).toEqual([['ALBATROSS', ['score_only']]]);
  });
  it('eagles are score_only, on par 4 and par 5', () => {
    for (const g of ['golfer_eagle5', 'golfer_eagle4']) expect(byGolfer(g).map((m) => [m.type, m.evidence])).toEqual([['EAGLE', ['score_only']]]);
  });
  it('over a real sample, only ACE ever carries tee_shot_holed, and every ACE has strokes 1', () => {
    let aces = 0;
    for (const tour of ['epson', 'lpga'] as const) {
      for (let season = 1; season <= 6; season++) {
        const c = careerFor(tour, season);
        for (const def of seasonSchedule(season).filter((d) => d.tour === tour)) {
          for (const rt of runTournament(def, c, 'full').rounds) {
            if (!rt.snap) continue;
            for (const d of planRound(rt.snap, 'off')) {
              for (const cand of d.candidates) {
                const m = cand.moment;
                if (m.type === 'ACE') {
                  aces++;
                  expect(m.strokes).toBe(1);
                  expect(m.evidence).toEqual(['tee_shot_holed']);
                } else expect(m.evidence).not.toContain('tee_shot_holed');
                if (['EAGLE', 'RIVAL_SWING', 'HOT_RUN', 'ALBATROSS'].includes(m.type)) expect(m.evidence).toEqual(['score_only']);
                if (m.type === 'LEAD_CHANGE') expect(m.evidence).toEqual(['standings']);
              }
            }
          }
        }
      }
    }
    expect(aces).toBeGreaterThan(0);
  });
});

describe('A7 — detection rules', () => {
  it('no LEAD_CHANGE or LEADER_STUMBLE at the tournament\'s first boundary', () => {
    const s = snap({ round: 0, golfers: { golfer_ryan: [0], golfer_a: [0, { 1: 3 }], golfer_b: [0, { 1: 6 }] }, boundaries: [1] });
    expect(types(detect(s, 0, 1))).toEqual([]);
  });
  it('the same lead taken in a later round is a LEAD_CHANGE', () => {
    const s = snap({ round: 1, golfers: { golfer_ryan: [0], golfer_a: [0, { 1: 3 }], golfer_b: [0] }, boundaries: [1] });
    expect(types(detect(s, 0, 1))).toEqual(['LEAD_CHANGE:golfer_a:h1']);
  });
  it('a tie is never a sole leader', () => {
    const s = snap({ golfers: { golfer_ryan: [0], golfer_a: [-1, { 1: 3 }], golfer_b: [-2] } });
    expect(types(detect(s, 0, 1)).filter((t) => t.startsWith('LEAD_CHANGE'))).toEqual([]);
  });
  it('moving from co-leader to sole leader is a LEAD_CHANGE; keeping a sole lead is not', () => {
    const s = snap({ golfers: { golfer_ryan: [0], golfer_a: [-2, { 1: 3 }], golfer_b: [-2] } });
    expect(types(detect(s, 0, 1))).toContain('LEAD_CHANGE:golfer_a:h1');
    expect(types(detect(s, 1, 2))).toEqual([]);
  });
  it('Ryan taking the lead is never a moment', () => {
    const s = snap({ golfers: { golfer_ryan: [-1, { 2: 3 }], golfer_a: [-1] } });
    expect(detect(s, 1, 2).filter((m) => m.golferId === 'golfer_ryan')).toEqual([]);
  });
  it('LEADER_STUMBLE needs a double bogey or worse in the span, and losing the lead', () => {
    const bogey = snap({ golfers: { golfer_ryan: [0], golfer_a: [-2, { 1: 5 }], golfer_b: [-2] } });
    expect(types(detect(bogey, 0, 1))).toEqual(['LEAD_CHANGE:golfer_b:h1']);
    const dbl = snap({ golfers: { golfer_ryan: [0], golfer_a: [-2, { 1: 6 }], golfer_b: [-2] } });
    expect(types(detect(dbl, 0, 1))).toEqual(['LEADER_STUMBLE:golfer_a:h1', 'LEAD_CHANGE:golfer_b:h1'].sort());
    const stillLeads = snap({ golfers: { golfer_ryan: [0], golfer_a: [-5, { 1: 6 }], golfer_b: [-2] } });
    expect(types(detect(stillLeads, 0, 1))).toEqual([]);
  });
  it('HOT_RUN fires once, when a run of birdie-or-better first reaches 3; a new run can fire again', () => {
    const s = snap({ golfers: { golfer_ryan: [0], golfer_a: [5, { 1: 3, 2: 4, 3: 3, 4: 2, 6: 3, 7: 4, 8: 2 }] } });
    const runs = () => [1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap((q) => detect(s, q - 1, q)).filter((m) => m.type === 'HOT_RUN');
    expect(runs().map((m) => m.hole)).toEqual([3, 8]);
  });
  it('RIVAL_SWING needs a non-par hole and Kayla within 3 of Ryan', () => {
    const near = snap({ golfers: { golfer_ryan: [0], golfer_kayla_brooks: [2, { 2: 6 }] } });
    expect(types(detect(near, 1, 2))).toEqual(['RIVAL_SWING:golfer_kayla_brooks:h2']);
    const far = snap({ golfers: { golfer_ryan: [0], golfer_kayla_brooks: [4, { 2: 6 }] } });
    expect(types(detect(far, 1, 2))).toEqual([]);
    const level = snap({ golfers: { golfer_ryan: [0], golfer_kayla_brooks: [1] } });
    expect(types(detect(level, 1, 2))).toEqual([]);
  });
  it('a multi-hole span (key mode) reports every hole in it, and only those', () => {
    const s = snap({ golfers: { golfer_ryan: [0], golfer_a: [5, { 2: 3, 7: 3 }] }, boundaries: [5, 9] });
    expect(types(detect(s, 0, 5))).toEqual(['EAGLE:golfer_a:h2']);
    expect(types(detect(s, 5, 9))).toEqual(['EAGLE:golfer_a:h7']);
  });
  it('totals match the live leaderboard rule (completed rounds plus holes through q)', () => {
    const s = snap({ golfers: { golfer_ryan: [-3, { 1: 3 }], golfer_a: [2, { 1: 6, 2: 4 }] } });
    expect(totalsAt(s, 2).get('golfer_ryan')).toBe(-4);
    expect(totalsAt(s, 2).get('golfer_a')).toBe(3);
  });
});

describe('A8 — merge: one candidate per golfer', () => {
  it('an exceptional tag wins over a higher-scoring one', () => {
    // A lead change with late and prox (final round) vs an ace the same golfer made earlier in the span.
    const s = snap({ round: 3, golfers: { golfer_ryan: [-1], golfer_a: [0, { 4: 1, 9: 3 }], golfer_b: [-1] }, boundaries: [9] });
    const [c] = planRound(s, 'fullTv')[0].candidates.filter((x) => x.moment.golferId === 'golfer_a');
    expect(c.moment.type).toBe('ACE');
    expect(c.exceptional).toBe(true);
    expect(c.moment.alsoTags).toEqual(['LEAD_CHANGE']);
  });
  it('otherwise the highest S4 wins, and the other tags are kept as alsoTags', () => {
    const fx = (name: string) => JSON.parse(readFileSync(join(__dirname, 'fixtures', `cutins-${name}.json`), 'utf8'));
    const s: RevealSnapshot = fx('e1').snapshot;
    const d8 = planRound(s, 'fullTv').find((d) => d.q === 8)!;
    const w = d8.candidates.find((c) => c.moment.golferId === 'golfer_whitfield')!;
    expect([w.moment.type, w.s4, w.moment.alsoTags]).toEqual(['LEAD_CHANGE', 84, ['EAGLE']]);
    expect(d8.candidates.filter((c) => c.moment.golferId === 'golfer_whitfield')).toHaveLength(1);
  });
  it('equal S4 falls to type priority', () => {
    // Revision 3 gives RIVAL_SWING and HOT_RUN different bases in Balanced and Full TV, so the tie is
    // shown on the Off profile, which keeps the CI-1 base table. The merge rule is the same for every profile.
    const m = (type: Moment['type']) => ({ type, hole: 3, totalToPar: 0, golferId: 'golfer_kayla_brooks', position: 1 });
    const ctx = { profile: 'off' as const, special: false, isFinal: false, holesPerRound: 9, ryanAlive: true, ryanTotalToPar: 10, lead: 0, rivalId: 'golfer_kayla_brooks', repeat: false };
    expect(score4(m('RIVAL_SWING'), ctx)).toBe(score4(m('HOT_RUN'), ctx));
    const s = snap({ golfers: { golfer_ryan: [-5], golfer_kayla_brooks: [-1, { 1: 3, 2: 4, 3: 3 }] }, boundaries: [3] });
    const [c] = planRound(s, 'off')[0].candidates;
    expect(c.moment.type).toBe('RIVAL_SWING');
    expect(c.moment.alsoTags).toEqual(['HOT_RUN']);
  });
});

describe('A25 — structured facts only: no prose, no names', () => {
  it('every moment matches the schema, and no string equals a tour, event, Q-School or golfer name', () => {
    const names = new Set<string>([
      ...Object.values(TOURS).map((t) => t.name),
      ...Object.values(SCHEDULES).flat().map((e) => e.name),
      ...Object.values(QSCHOOL).map((q) => q.name),
      PLAYER_NAME,
      'Kayla Brooks',
      ...Object.values(newCareerState(1).pools).flat().map((g) => g.name),
    ]);
    const keys = new Set(['momentId', 'type', 'evidence', 'tour', 'tournamentId', 'round', 'hole', 'golferId', 'strokes', 'par', 'totalToPar', 'position', 'tied', 'alsoTags']);
    const ID = /^[a-z0-9_-]+:r\d+:(ACE|ALBATROSS|LEAD_CHANGE|EAGLE|LEADER_STUMBLE|RIVAL_SWING|HOT_RUN):[a-z0-9_]+:h\d+$/;
    let n = 0;
    for (const tour of ['amateur', 'mini', 'qschool', 'epson', 'lpga'] as const) {
      const c = careerFor(tour, 3);
      for (const def of seasonSchedule(1).filter((d) => d.tour === tour).slice(0, 4)) {
        for (const rt of runTournament(def, c, 'full').rounds) {
          if (!rt.snap) continue;
          for (const d of planRound(rt.snap, 'fullTv')) {
            for (const { moment } of d.candidates) {
              n++;
              for (const k of Object.keys(moment)) expect(keys.has(k)).toBe(true);
              expect(moment.momentId).toMatch(ID);
              expect(moment.golferId).toMatch(/^golfer_[a-z0-9_]+$/);
              for (const v of Object.values(moment).flat()) if (typeof v === 'string') expect(names.has(v)).toBe(false);
              for (const v of Object.values(moment)) expect(['string', 'number', 'boolean', 'object'].includes(typeof v)).toBe(true);
            }
          }
        }
      }
    }
    expect(n).toBeGreaterThan(50);
  });
});
