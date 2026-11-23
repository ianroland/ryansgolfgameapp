/**
 * CI-1 Revision 3 regression and equivalence tests (T1–T12) and the Revision 3
 * fixtures E7–E13.
 * Spec: "CI-1 Revision 3 — Broadcast Intelligence Tuning Specification"
 * (2026-11-22; author decisions D1 = K2, D2 = external parity script).
 *
 * T7 runs the full reference dataset (about 27,000 rounds per profile). Set
 * CI1_QUICK=1 to check the 1-in-7 subsample digest instead.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { seasonSchedule } from '../src/career/tournament';
import type { RoundMode } from '../src/career/types';
import { BASE, capFor, contextOf, EXCEPTIONAL_OVERRIDE, GATE_TOP, KAYLA_TOP, LATE_HOLES, PROFILES, PROX_WINDOW } from '../src/cutins/constants';
import { detect, totalsAt } from '../src/cutins/detect';
import { planRound } from '../src/cutins/plan';
import { isSignificant, kaylaEligible, scoreTerms } from '../src/cutins/score';
import { truncateSnapshot } from '../src/cutins/snapshot';
import type { BroadcastContext, Decision, MomentType, ProfileId, RevealSnapshot } from '../src/cutins/types';
import { careerFor, computeDigests, eventsFor, runTournament, TOURS_ALL } from '../tools/cutins-lab/rates';

const ROOT = resolve(__dirname, '..');
const fx = (name: string) => JSON.parse(readFileSync(join(__dirname, 'fixtures', `cutins-${name}.json`), 'utf8'));
const CXS: BroadcastContext[] = ['regEarly', 'regFinal', 'spcEarly', 'spcFinal'];
const sel = (plan: Decision[]) => plan.filter((d) => d.selected);
const at = (plan: Decision[], q: number) => plan.find((d) => d.q === q)!;
const reasonOf = (d: Decision, id: string) => d.suppressed.find((x) => x.momentId === id)?.reason;

/** A hand-built round: every hole is par unless `changes` says otherwise. */
function snap(opts: { pars?: number[]; round?: number; rounds?: number; special?: boolean; golfers: Record<string, [prior: number, changes?: Record<number, number>]>; boundaries?: number[] }): RevealSnapshot {
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
    tournamentId: 't-1', tour: 'lpga', special: opts.special ?? false, round, rounds, isFinal: round === rounds - 1,
    pars, q: pars.length, boundaries: opts.boundaries ?? pars.map((_, i) => i + 1),
    ryanId: 'golfer_ryan', rivalId: 'golfer_kayla_brooks', alive: Object.keys(holes), prior, holes,
  };
}

describe('T1 — the constants equal the Revision 3 table (item 1)', () => {
  it('Balanced = B2 + K2 + M3, Full TV = C3 + K2 + M3, Off unchanged', () => {
    const view = (p: ProfileId) => {
      const P = PROFILES[p];
      return { threshold: CXS.map((c) => P.threshold[c]), cap: CXS.map((c) => P.cap[c]), cooldown: P.cooldown, base: P.base, contender: P.contender, kaylaBonus: P.kaylaBonus, ryanFarGap: P.ryanFarGap, lateReserve: P.lateReserve, majorTopExempt: P.majorTopExempt };
    };
    expect(view('balanced')).toEqual({
      threshold: [14, 14, 14, 13], cap: [1, 2, 1, 2], cooldown: 3,
      base: { ACE: 15, ALBATROSS: 15, LEAD_CHANGE: 10, EAGLE: 7, LEADER_STUMBLE: 8, RIVAL_SWING: 5, HOT_RUN: 6 },
      contender: { bonus: 2, window: 2 }, kaylaBonus: 2, ryanFarGap: 6, lateReserve: true, majorTopExempt: 3,
    });
    expect(view('fullTv')).toEqual({
      threshold: [13, 12, 12, 11], cap: [1, 2, 2, 3], cooldown: 2,
      base: { ACE: 15, ALBATROSS: 15, LEAD_CHANGE: 10, EAGLE: 8, LEADER_STUMBLE: 9, RIVAL_SWING: 5, HOT_RUN: 7 },
      contender: { bonus: 3, window: 3 }, kaylaBonus: 2, ryanFarGap: 8, lateReserve: true, majorTopExempt: 3,
    });
    expect(view('off')).toEqual({
      threshold: [0, 0, 0, 0], cap: [0, 0, 0, 0], cooldown: 0, base: BASE,
      contender: { bonus: 0, window: 0 }, kaylaBonus: 0, ryanFarGap: null, lateReserve: false, majorTopExempt: 0,
    });
    expect(BASE).toEqual({ ACE: 15, ALBATROSS: 15, LEAD_CHANGE: 10, EAGLE: 7, LEADER_STUMBLE: 6, RIVAL_SWING: 5, HOT_RUN: 5 });
    expect([EXCEPTIONAL_OVERRIDE, GATE_TOP, KAYLA_TOP, PROX_WINDOW, LATE_HOLES]).toEqual([false, 10, 10, 2, 3]);
  });
});

describe('T2 — context selection and cap scaling', () => {
  it('contextOf maps special × isFinal; capFor scales floor(cap × H / 9)', () => {
    expect([contextOf(false, false), contextOf(false, true), contextOf(true, false), contextOf(true, true)]).toEqual(CXS);
    expect(capFor('fullTv', 'spcFinal', 18)).toBe(6);
    expect(capFor('fullTv', 'spcFinal', 6)).toBe(2);
    expect(capFor('balanced', 'regEarly', 6)).toBe(0);
    expect(capFor('balanced', 'regFinal', 9)).toBe(2);
  });
  it('every tour\'s special events reach the special contexts, and only they do', () => {
    const seen = new Set<string>();
    for (const tour of TOURS_ALL) {
      const c = careerFor(tour, 3);
      for (const def of seasonSchedule(3).filter((d) => d.tour === tour)) {
        for (const rt of runTournament(def, c, 'key').rounds) {
          if (!rt.snap) continue;
          expect(rt.snap.special).toBe(!!def.special);
          if (def.special) seen.add(`${tour}/${contextOf(rt.snap.special, rt.snap.isFinal)}`);
        }
      }
    }
    for (const t of ['lpga', 'epson', 'amateur', 'qschool']) expect([...seen].some((x) => x.startsWith(`${t}/spc`)), t).toBe(true);
  });
});

describe('T3 — late reserve (item 5)', () => {
  // Final round of a regular event: Balanced cap 2, threshold 14 (S4 56), cooldown 3.
  // A takes the lead alone at 2 (selected). C's eagle at 5 passes every rule but the reserve.
  const base = { golfer_ryan: [0] as [number], golfer_a: [-1, { 2: 4 }] as [number, Record<number, number>], golfer_b: [-1] as [number] };
  it('a second non-exceptional selection waits for q > H − 3; the same moment at q = 7 is selected', () => {
    const s5 = snap({ round: 3, golfers: { ...base, golfer_c: [0, { 5: 2 }] } });
    const p5 = planRound(s5, 'balanced');
    expect(at(p5, 2).selected).toBe('t-1:r4:LEAD_CHANGE:golfer_a:h2');
    const d5 = at(p5, 5);
    const c5 = d5.candidates.find((c) => c.moment.golferId === 'golfer_c')!;
    expect(c5.s4).toBeGreaterThanOrEqual(4 * PROFILES.balanced.threshold.regFinal);
    expect(5 - 2).toBeGreaterThanOrEqual(PROFILES.balanced.cooldown);
    expect(d5.selected).toBeNull();
    expect(reasonOf(d5, c5.moment.momentId)).toBe('late_reserve');
    const s7 = snap({ round: 3, golfers: { ...base, golfer_c: [0, { 7: 3 }] } });
    expect(at(planRound(s7, 'balanced'), 7).selected).toBe('t-1:r4:EAGLE:golfer_c:h7');
  });
  it('an exceptional moment is not held by the reserve (nor by the cooldown), only by the cap', () => {
    const s = snap({ round: 3, golfers: { ...base, golfer_c: [0, { 4: 1 }] } });
    const p = planRound(s, 'balanced');
    expect(at(p, 4).selected).toBe('t-1:r4:ACE:golfer_c:h4');
    expect(sel(p)).toHaveLength(2);
  });
  it('the first slot is never reserved', () => {
    // D leads at −2 throughout; C's eagle at 5 only ties her, so it is an EAGLE (not a lead change).
    const s = snap({ round: 3, golfers: { golfer_ryan: [0], golfer_d: [-2], golfer_c: [0, { 5: 2 }] } });
    expect(at(planRound(s, 'balanced'), 5).selected).toBe('t-1:r4:EAGLE:golfer_c:h5');
  });
});

describe('T4 — contender bonus (item 7)', () => {
  // Round 2 of 4 (early). Ryan leads at −5. The subject eagles 2.
  const s = (prior: number) => snap({ golfers: { golfer_ryan: [-5], golfer_s: [prior, { 2: 3 }], ...Object.fromEntries([0, 1, 2].map((i) => [`golfer_f${i}`, [3] as [number]])) }, boundaries: [2, 9] });
  const s4 = (prior: number, p: ProfileId) => planRound(s(prior), p)[0].candidates.find((c) => c.moment.golferId === 'golfer_s')!.s4;
  it('applies in early rounds; "lead" includes Ryan; inclusive at the window edge, 0 one stroke beyond', () => {
    // Subject at −2: 3 behind Ryan's lead. Balanced (window 2): no bonus, and none would be wrong if Ryan were excluded.
    expect(s4(0, 'balanced')).toBe(7 * 2 * 2);
    // Full TV (window 3): exactly at the edge, +3.
    expect(s4(0, 'fullTv')).toBe(8 * 2 * 2 + 4 * 3);
    // One beyond the edge: 0.
    expect(s4(1, 'fullTv')).toBe(8 * 2 * 2);
    // Balanced at its edge (2 behind; also within 2 of Ryan, so prox applies too).
    expect(s4(-1, 'balanced')).toBe(7 * 2 * 2 + 4 * (2 + 2));
  });
  it('the contender term is +2 (Balanced) and +3 (Full TV) for the leader herself', () => {
    const m = { type: 'LEAD_CHANGE' as MomentType, hole: 3, totalToPar: -6, golferId: 'golfer_x', position: 1 };
    const ctx = { special: false, isFinal: false, holesPerRound: 9, ryanAlive: true, ryanTotalToPar: 5, lead: -6, rivalId: 'golfer_kayla_brooks', repeat: false };
    expect(scoreTerms(m, { ...ctx, profile: 'balanced' }).contender).toBe(2);
    expect(scoreTerms(m, { ...ctx, profile: 'fullTv' }).contender).toBe(3);
    expect(scoreTerms(m, { ...ctx, profile: 'off' }).contender).toBe(0);
  });
});

describe('T5 — Kayla eligibility, K2 (item 8, approved as D1)', () => {
  const KAYLA = 'golfer_kayla_brooks';
  const cases: { label: string; type: MomentType; strokes?: number; par?: number; significant: boolean }[] = [
    { label: 'ACE', type: 'ACE', strokes: 1, par: 3, significant: true },
    { label: 'ALBATROSS', type: 'ALBATROSS', strokes: 2, par: 5, significant: true },
    { label: 'EAGLE', type: 'EAGLE', strokes: 3, par: 5, significant: true },
    { label: 'LEADER_STUMBLE', type: 'LEADER_STUMBLE', significant: true },
    { label: 'RIVAL_SWING birdie (−1)', type: 'RIVAL_SWING', strokes: 3, par: 4, significant: false },
    { label: 'RIVAL_SWING bogey (+1)', type: 'RIVAL_SWING', strokes: 5, par: 4, significant: false },
    { label: 'RIVAL_SWING eagle (−2)', type: 'RIVAL_SWING', strokes: 2, par: 4, significant: true },
    { label: 'RIVAL_SWING double bogey (+2)', type: 'RIVAL_SWING', strokes: 6, par: 4, significant: true },
    { label: 'HOT_RUN', type: 'HOT_RUN', strokes: 3, par: 4, significant: false },
    { label: 'LEAD_CHANGE', type: 'LEAD_CHANGE', significant: false },
  ];
  it('the bonus is +2 exactly when top 10, within 2 of Ryan, or independently significant', () => {
    let n = 0;
    for (const c of cases) for (const top10 of [true, false]) for (const near of [true, false]) {
      const m = { type: c.type, hole: 3, totalToPar: near ? 2 : 3 + PROX_WINDOW, golferId: KAYLA, position: top10 ? KAYLA_TOP : KAYLA_TOP + 1, strokes: c.strokes, par: c.par };
      expect(isSignificant(m), c.label).toBe(c.significant);
      const want = top10 || near || c.significant;
      expect(kaylaEligible(m, { ryanAlive: true, ryanTotalToPar: 0 }), `${c.label} top10=${top10} near=${near}`).toBe(want);
      for (const p of ['balanced', 'fullTv'] as const) {
        const t = scoreTerms(m, { profile: p, special: false, isFinal: false, holesPerRound: 9, ryanAlive: true, ryanTotalToPar: 0, lead: -20, rivalId: KAYLA, repeat: false });
        expect(t.kayla, `${p} ${c.label} top10=${top10} near=${near}`).toBe(want ? 2 : 0);
      }
      // Never for anyone else.
      expect(scoreTerms({ ...m, golferId: 'golfer_x' }, { profile: 'balanced', special: false, isFinal: false, holesPerRound: 9, ryanAlive: true, ryanTotalToPar: 0, lead: -20, rivalId: KAYLA, repeat: false }).kayla).toBe(0);
      n++;
    }
    expect(n).toBe(cases.length * 4);
  });
  it('Kayla still passes the gate from anywhere, with the far filter active too', () => {
    // Ryan +3, lead −9 (12 back: far filter active for both profiles). Kayla bogeys 3 to finish 3 from Ryan, far outside the top 10.
    const s = snap({ golfers: { golfer_ryan: [3], golfer_kayla_brooks: [5, { 3: 5 }], ...Object.fromEntries(Array.from({ length: 14 }, (_, i) => [`golfer_f${i}`, [-9 + i] as [number]])) }, boundaries: [3, 9] });
    for (const p of ['balanced', 'fullTv'] as const) {
      const d = planRound(s, p)[0];
      const k = d.candidates.find((c) => c.moment.golferId === KAYLA)!;
      expect(k.moment.position).toBeGreaterThan(10);
      expect(reasonOf(d, k.moment.momentId)).toBe('below_threshold');
    }
  });
});

describe('T6 — Ryan-far filter and the special-event exemption, M3 (item 9)', () => {
  // M (prior −4) eagles 2 and takes the lead alone from L (−5) at −6.
  const lc = (ryan: number, special: boolean, round = 1) => snap({ round, special, golfers: { golfer_ryan: [ryan], golfer_l: [-5], golfer_m: [-4, { 2: 3 }], ...Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`golfer_f${i}`, [-3 + i] as [number]])) }, boundaries: [1, 2, 9] });
  const lcId = (round: number) => `t-1:r${round + 1}:LEAD_CHANGE:golfer_m:h2`;
  it('regular event, Full TV: a lead change by the leader is gated at 8 back, selected at 7 back', () => {
    const far = at(planRound(lc(2, false), 'fullTv'), 2);
    expect(far.selected).toBeNull();
    expect(reasonOf(far, lcId(1))).toBe('gate');
    expect(at(planRound(lc(1, false), 'fullTv'), 2).selected).toBe(lcId(1));
  });
  it('regular event, Balanced: gated at 6 back; at 5 back the gate passes (and the threshold decides)', () => {
    expect(reasonOf(at(planRound(lc(0, false), 'balanced'), 2), lcId(1))).toBe('gate');
    expect(reasonOf(at(planRound(lc(-1, false), 'balanced'), 2), lcId(1))).toBe('below_threshold');
  });
  it('special event: the leader passes while Ryan is far back (M3)', () => {
    expect(at(planRound(lc(2, true), 'fullTv'), 2).selected).toBe(lcId(1));
    expect(at(planRound(lc(0, true), 'balanced'), 2).selected).toBe(lcId(1));
  });
  // Special early round, Ryan +3 (11 back). A −8, B −7, C −6 hold positions 1–3; D eagles 2.
  const pos = (dPrior: number, round = 1) => snap({ round, special: true, golfers: { golfer_ryan: [3], golfer_a: [-8], golfer_b: [-7], golfer_c: [-6], golfer_d: [dPrior, { 2: 3 }], golfer_e: [0], golfer_f: [1] }, boundaries: [2, 9] });
  const dId = (round: number) => `t-1:r${round + 1}:EAGLE:golfer_d:h2`;
  it('the exemption is position ≤ 3: position 4 is gated, T3 passes', () => {
    const d4 = planRound(pos(-3), 'fullTv')[0];
    expect(d4.candidates.find((c) => c.moment.momentId === dId(1))!.moment.position).toBe(4);
    expect(reasonOf(d4, dId(1))).toBe('gate');
    const d3 = planRound(pos(-4), 'fullTv')[0];
    expect(d3.candidates.find((c) => c.moment.momentId === dId(1))!.moment.position).toBe(3);
    expect(d3.selected).toBe(dId(1));
  });
  it('final rounds are never filtered', () => {
    expect(planRound(pos(-3, 3), 'fullTv')[0].selected).toBe(dId(3));
    expect(at(planRound(lc(2, false, 3), 'fullTv'), 2).selected).toBe(lcId(3));
  });
});

describe('T7 — decision-digest equivalence with the reference harness (item 17)', () => {
  const quick = process.env.CI1_QUICK === '1';
  it(quick ? 'the 1-in-7 subsample digests match' : 'the full reference dataset digests match: Balanced cca707745b56bf59, Full TV 3194cbe28786ca49', () => {
    const d = computeDigests(quick ? { every: 7 } : {});
    console.log(`T7: ${d.rounds} rounds; balanced ${d.balanced}, fullTv ${d.fullTv}`);
    if (quick) expect(d).toEqual({ rounds: 3905, balanced: 'd2a2177b8b36bcb4', fullTv: '8a3e431f4f95e534' });
    else expect(d).toEqual({ rounds: 27330, balanced: 'cca707745b56bf59', fullTv: '3194cbe28786ca49' });
  }, 1_800_000);
});

describe('T8 — order independence', () => {
  const shuffle = <T,>(xs: T[], seed: number) => {
    const a = [...xs];
    let x = seed;
    for (let i = a.length - 1; i > 0; i--) {
      x = (Math.imul(x, 1103515245) + 12345) >>> 0;
      const j = x % (i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const reorder = (s: RevealSnapshot, seed: number): RevealSnapshot => {
    const alive = shuffle(s.alive, seed);
    return { ...s, alive, holes: Object.fromEntries(alive.map((id) => [id, s.holes[id]])), prior: Object.fromEntries(shuffle(alive, seed + 1).map((id) => [id, s.prior[id]])) };
  };
  it('100 shuffles of the field order give identical plans under both Revision 3 profiles', () => {
    let rounds = 0;
    for (const tour of ['lpga', 'epson'] as const) {
      const c = careerFor(tour, 12);
      for (const def of seasonSchedule(12).filter((d) => d.tour === tour && (d.special || d.week <= 8))) {
        for (const rt of runTournament(def, c, 'full').rounds) {
          if (!rt.snap) continue;
          rounds++;
          for (const p of ['balanced', 'fullTv'] as const) {
            const want = JSON.stringify(planRound(rt.snap, p));
            for (let k = 0; k < 100; k++) expect(JSON.stringify(planRound(reorder(rt.snap, k), p))).toBe(want);
          }
        }
      }
    }
    expect(rounds).toBeGreaterThan(10);
  }, 600_000);
});

describe('T9 — Full/Key honesty (each mode on its own boundaries)', () => {
  it('key mode: a selected lead change\'s subject is the sole leader at its own boundary; no decision depends on later holes; deterministic', () => {
    let lcs = 0, rounds = 0;
    for (const mode of ['key', 'full'] as RoundMode[]) for (const tour of ['lpga', 'epson', 'mini'] as const) {
      for (const { def, career } of eventsFor(tour, 4)) {
        for (const rt of runTournament(def, career, mode).rounds) {
          const s = rt.snap;
          if (!s) continue;
          rounds++;
          for (const p of ['balanced', 'fullTv'] as const) {
            const plan = planRound(s, p);
            expect(JSON.stringify(planRound(s, p))).toBe(JSON.stringify(plan));
            for (const d of plan) {
              // The plan up to each boundary is exactly what that boundary's own snapshot yields.
              expect(JSON.stringify(planRound(truncateSnapshot(s, d.q), p))).toBe(JSON.stringify(plan.filter((x) => x.q <= d.q)));
              if (!d.selected) continue;
              const c = d.candidates.find((x) => x.moment.momentId === d.selected)!;
              if (c.moment.type !== 'LEAD_CHANGE') continue;
              const atQ = totalsAt(s, d.q);
              const lead = Math.min(...atQ.values());
              expect(atQ.get(c.moment.golferId)).toBe(lead);
              expect([...atQ.values()].filter((v) => v === lead)).toHaveLength(1);
              if (mode === 'key') lcs++;
            }
          }
        }
      }
    }
    expect(rounds).toBeGreaterThan(100);
    expect(lcs).toBeGreaterThan(0);
  }, 600_000);
});

describe('T10 — Off', () => {
  it('zero selections in every context and mode', () => {
    const contexts = new Set<string>();
    for (const mode of ['full', 'key'] as RoundMode[]) for (const tour of TOURS_ALL) for (const { def, career } of eventsFor(tour, 2)) {
      for (const rt of runTournament(def, career, mode).rounds) {
        if (!rt.snap) continue;
        contexts.add(contextOf(rt.snap.special, rt.snap.isFinal));
        expect(sel(planRound(rt.snap, 'off'))).toHaveLength(0);
      }
    }
    expect([...contexts].sort()).toEqual([...CXS].sort());
    expect(CXS.map((c) => capFor('off', c, 9))).toEqual([0, 0, 0, 0]);
  }, 600_000);
});

describe('T11 — frequency bands (item 18) on a 20-season sample', () => {
  it('per-context averages, quiet rounds and the per-round maximum fall inside the bands', () => {
    type Acc = { r: number; n: number; z: number; max: number };
    const acc: Record<string, Acc> = {};
    for (const mode of ['full', 'key'] as RoundMode[]) for (const tour of TOURS_ALL) for (const { def, career } of eventsFor(tour, 20)) {
      for (const rt of runTournament(def, career, mode).rounds) {
        const s = rt.snap;
        if (!s) continue;
        for (const p of ['balanced', 'fullTv'] as const) {
          const n = sel(planRound(s, p)).length;
          for (const k of ['all', contextOf(s.special, s.isFinal)]) {
            const a = (acc[`${p}/${k}`] ??= { r: 0, n: 0, z: 0, max: 0 });
            a.r++;
            a.n += n;
            if (!n) a.z++;
            a.max = Math.max(a.max, n);
          }
        }
      }
    }
    const avg = (k: string) => acc[k].n / acc[k].r;
    const BANDS: Record<string, [number, number]> = {
      'balanced/all': [0.55, 0.65], 'balanced/regEarly': [0.19, 0.27], 'balanced/regFinal': [1.2, 1.4], 'balanced/spcEarly': [0.8, 1.0], 'balanced/spcFinal': [1.5, 1.75],
      'fullTv/all': [1.05, 1.22], 'fullTv/regEarly': [0.7, 0.85], 'fullTv/regFinal': [1.55, 1.75], 'fullTv/spcEarly': [1.7, 1.95], 'fullTv/spcFinal': [1.8, 2.05],
    };
    for (const [k, [lo, hi]] of Object.entries(BANDS)) {
      expect(avg(k), k).toBeGreaterThanOrEqual(lo);
      expect(avg(k), k).toBeLessThanOrEqual(hi);
    }
    const quiet = (k: string) => (100 * acc[k].z) / acc[k].r;
    expect(quiet('balanced/all')).toBeGreaterThanOrEqual(48);
    expect(quiet('balanced/all')).toBeLessThanOrEqual(56);
    expect(quiet('fullTv/all')).toBeGreaterThanOrEqual(12);
    expect(quiet('fullTv/all')).toBeLessThanOrEqual(19);
    expect([acc['balanced/all'].max, acc['fullTv/all'].max]).toEqual([2, 3]);
    console.log(`T11: ${acc['balanced/all'].r} rounds; ${Object.keys(BANDS).map((k) => `${k} ${avg(k).toFixed(3)}`).join(', ')}`);
  }, 900_000);
});

describe('T12 — no new content in src/cutins', () => {
  it('every string literal is an id, enum value, reason code, type key or existing error text', () => {
    const ALLOWED = new Set([
      'ACE', 'ALBATROSS', 'EAGLE', 'HOT_RUN', 'LEADER_STUMBLE', 'LEAD_CHANGE', 'RIVAL_SWING',
      'tee_shot_holed', 'score_only', 'standings',
      'off', 'balanced', 'fullTv',
      'regEarly', 'regFinal', 'spcEarly', 'spcFinal',
      'below_threshold', 'gate', 'suppressed_cap', 'suppressed_cooldown', 'late_reserve', 'lost_tiebreak',
      'watched', 'interrupted', 'skipped', 'shown',
      'ryans-road.cutins.presented',
      'type', 'hole', 'totalToPar', 'golferId', 'position', 'strokes', 'par', 'ryanAlive', 'ryanTotalToPar', 'playerHoles', 'round', 'tournamentId',
      'number', 'string', 'undefined',
      'revealSnapshot: tournament has no round in progress', 'truncateSnapshot: cannot extend a snapshot',
      '`${t.tournamentId}:${t.round}:${t.q}`', '`${t.tournamentId}:r${t.round + 1}:`', '`${tournamentId}:r${round1}:${type}:${golferId}:h${hole1}`',
      '`detect: bad span (${p}, ${q}]`', '`revealSnapshot: bad q ${q}`',
    ]);
    const dir = join(ROOT, 'src', 'cutins');
    const found: string[] = [];
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.ts'))) {
      let src = readFileSync(join(dir, f), 'utf8');
      src = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').replace(/(import|export)[^;]*?from\s+'[^']*'/g, '');
      for (const m of src.matchAll(/'([^'\\\n]*)'/g)) found.push(m[1]);
      for (const m of src.matchAll(/`([^`]*)`/g)) found.push('`' + m[1] + '`');
    }
    const unexpected = [...new Set(found)].filter((x) => !ALLOWED.has(x));
    expect(unexpected).toEqual([]);
    expect(found.length).toBeGreaterThan(50);
  });
});

// ── Revision 3 fixtures E7–E13: actual simulation records (item 15) ──
function check(plan: Decision[], exp: { q: number; selected: string | null; s4: Record<string, number>; reasons?: Record<string, string> }[]) {
  const withCandidates = plan.filter((d) => d.candidates.length);
  expect(withCandidates.map((d) => d.q)).toEqual(exp.map((e) => e.q));
  for (const e of exp) {
    const d = at(plan, e.q);
    expect(d.selected, `selected at q ${e.q}`).toBe(e.selected);
    expect(Object.fromEntries(d.candidates.map((c) => [c.moment.momentId, c.s4])), `S4 at q ${e.q}`).toEqual(e.s4);
    expect(Object.fromEntries(d.suppressed.map((x) => [x.momentId, x.reason])), `reasons at q ${e.q}`).toEqual(e.reasons ?? {});
  }
}

describe('E7–E13 — Revision 3 fixtures reproduce exactly', () => {
  for (const name of ['e7', 'e8', 'e9', 'e10', 'e11', 'e12', 'e13']) {
    it(fx(name).name, () => {
      const f = fx(name);
      check(planRound(f.snapshot, 'balanced'), f.expected.balanced);
      check(planRound(f.snapshot, 'fullTv'), f.expected.fullTv);
    });
  }
  it('E7: the ace is held by the cap (override off)', () => {
    const d = at(planRound(fx('e7').snapshot, 'balanced'), 7);
    expect(d.selected).toBeNull();
    expect(reasonOf(d, 'lpga-9-w10:r1:ACE:golfer_lpga_231:h7')).toBe('suppressed_cap');
    expect(at(planRound(fx('e7').snapshot, 'balanced'), 2).selected).toBe('lpga-9-w10:r1:LEAD_CHANGE:golfer_lpga_181:h2');
  });
  it('E8: the late reserve holds the early lead changes and keeps the slot for h7', () => {
    const s = fx('e8').snapshot;
    const b = planRound(s, 'balanced');
    expect(reasonOf(at(b, 4), 'lpga-12-w12:r4:LEAD_CHANGE:golfer_lpga_177:h4')).toBe('late_reserve');
    expect(at(b, 7).selected).toBe('lpga-12-w12:r4:LEAD_CHANGE:golfer_lpga_256:h7');
    const f = planRound(s, 'fullTv');
    expect(reasonOf(at(f, 3), 'lpga-12-w12:r4:LEAD_CHANGE:golfer_lpga_264:h3')).toBe('late_reserve');
    expect(reasonOf(at(f, 4), 'lpga-12-w12:r4:LEAD_CHANGE:golfer_lpga_177:h4')).toBe('late_reserve');
  });
  it('E9: the contender bonus lifts an early-round lead change exactly to the Balanced threshold', () => {
    const d = at(planRound(fx('e9').snapshot, 'balanced'), 2);
    const c = d.candidates.find((x) => x.moment.momentId === d.selected)!;
    expect([c.moment.type, c.s4]).toEqual(['LEAD_CHANGE', 4 * PROFILES.balanced.threshold.regEarly]);
  });
  it('E10: Kayla\'s ordinary bogey, three from Ryan and outside the top 10, earns no Kayla bonus', () => {
    const s: RevealSnapshot = fx('e10').snapshot;
    const m = detect(s, 6, 7).find((x) => x.golferId === s.rivalId)!;
    expect([m.type, m.strokes, m.par]).toEqual(['RIVAL_SWING', 5, 4]);
    const atQ = totalsAt(s, 7);
    expect(m.position).toBeGreaterThan(10);
    expect(Math.abs(m.totalToPar - atQ.get(s.ryanId)!)).toBe(3);
    const t = scoreTerms(m, { profile: 'fullTv', special: s.special, isFinal: s.isFinal, holesPerRound: 9, ryanAlive: true, ryanTotalToPar: atQ.get(s.ryanId)!, lead: Math.min(...atQ.values()), rivalId: s.rivalId, repeat: false });
    expect(t.kayla).toBe(0);
    expect(at(planRound(s, 'fullTv'), 8).selected).toBe('lpga-11-w18:r1:LEAD_CHANGE:golfer_lpga_245:h8');
  });
  it('E11: in a major, the leader\'s lead change passes the gate while Ryan is 8 back (M3)', () => {
    const s: RevealSnapshot = fx('e11').snapshot;
    const atQ = totalsAt(s, 9);
    expect(atQ.get(s.ryanId)! - Math.min(...atQ.values())).toBeGreaterThanOrEqual(PROFILES.balanced.ryanFarGap!);
    expect(at(planRound(s, 'balanced'), 9).selected).toBe('lpga-4-w6:r2:LEAD_CHANGE:golfer_lpga_189:h9');
  });
  it('E12: in a regular early round, the far filter gates a top-of-board lead change (key mode)', () => {
    const s: RevealSnapshot = fx('e12').snapshot;
    expect(s.boundaries).toEqual([2, 6, 8, 9]);
    for (const p of ['balanced', 'fullTv'] as const) expect(reasonOf(at(planRound(s, p), 8), 'lpga-2-w8:r2:LEAD_CHANGE:golfer_lpga_182:h8')).toBe('gate');
  });
  it('E13: near Ryan, K2 keeps the bonus for a double bogey and for an ordinary bogey (D1)', () => {
    const b = planRound(fx('e13').snapshot, 'balanced');
    expect(at(b, 1).selected).toBe('epson-42-w28:r3:RIVAL_SWING:golfer_kayla_brooks:h1');
    expect(at(b, 8).selected).toBe('epson-42-w28:r3:RIVAL_SWING:golfer_kayla_brooks:h8');
    const s: RevealSnapshot = fx('e13').snapshot;
    const h8 = detect(s, 7, 8).find((x) => x.golferId === s.rivalId)!;
    expect([h8.strokes, h8.par]).toEqual([4, 3]);
    expect(isSignificant(h8)).toBe(false);
  });
});
