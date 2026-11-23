/**
 * CI-1 acceptance tests: selection (A9–A18).
 * Spec: "Live Tournament Cut-Ins — CI-1 Specification (Revision 2)", values as
 * tuned by "CI-1 Revision 3 — Broadcast Intelligence Tuning Specification".
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { holesToPlay, seasonSchedule, startTournament } from '../src/career/tournament';
import type { RoundMode } from '../src/career/types';
import { hashString } from '../src/golf/math';
import { capFor, contextOf, EXCEPTIONAL, PROFILES, TYPE_PRIORITY } from '../src/cutins/constants';
import { detect, totalsAt } from '../src/cutins/detect';
import { planRound } from '../src/cutins/plan';
import { scoreTerms } from '../src/cutins/score';
import { revealSnapshot } from '../src/cutins/snapshot';
import type { BroadcastContext, Decision, MomentType, ProfileId, RevealSnapshot, SuppressReason } from '../src/cutins/types';
import { careerFor, eventsFor, runTournament, TOURS_ALL } from '../tools/cutins-lab/rates';

const fx = (name: string) => JSON.parse(readFileSync(join(__dirname, 'fixtures', `cutins-${name}.json`), 'utf8'));

function snap(opts: {
  pars?: number[];
  round?: number;
  rounds?: number;
  special?: boolean;
  golfers: Record<string, [prior: number, changes?: Record<number, number>]>;
  boundaries?: number[];
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
    tournamentId: 't-1', tour: 'lpga', special: opts.special ?? false, round, rounds, isFinal: round === rounds - 1,
    pars, q: pars.length, boundaries: opts.boundaries ?? pars.map((_, i) => i + 1),
    ryanId: 'golfer_ryan', rivalId: 'golfer_kayla_brooks', alive: Object.keys(holes), prior, holes,
  };
}
const fillers = (n: number, from: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`golfer_f${i}`, [from + i] as [number]]));

function check(plan: Decision[], exp: { q: number; selected: string | null; s4?: Record<string, number>; reasons?: Record<string, string>; alsoTags?: Record<string, string[]> }[]) {
  for (const e of exp) {
    const d = plan.find((x) => x.q === e.q)!;
    expect(d, `decision at q ${e.q}`).toBeDefined();
    expect(d.selected, `selected at q ${e.q}`).toBe(e.selected);
    for (const [id, s4] of Object.entries(e.s4 ?? {})) expect(d.candidates.find((c) => c.moment.momentId === id)?.s4, id).toBe(s4);
    for (const [id, r] of Object.entries(e.reasons ?? {})) expect(d.suppressed.find((x) => x.momentId === id)?.reason, id).toBe(r);
    for (const [id, t] of Object.entries(e.alsoTags ?? {})) expect(d.candidates.find((c) => c.moment.momentId === id)?.moment.alsoTags, id).toEqual(t);
  }
  const selectedQs = new Set(exp.map((e) => e.q));
  for (const d of plan) if (!selectedQs.has(d.q)) expect(d.selected, `nothing else selected (q ${d.q})`).toBeNull();
}

/** S4 of one raw (unmerged) tag, e.g. "EAGLE@whitfield@8". */
function tagScore(s: RevealSnapshot, plan: Decision[], key: string): number {
  const [type, who, hole] = key.split('@');
  for (const d of plan) {
    const m = detect(s, d.p, d.q).find((x) => x.type === type && x.golferId.includes(who) && x.hole === +hole);
    if (!m) continue;
    const atQ = totalsAt(s, d.q);
    const lead = Math.min(...atQ.values());
    return scoreTerms(m, { profile: 'fullTv', special: s.special, isFinal: s.isFinal, holesPerRound: 9, ryanAlive: true, ryanTotalToPar: atQ.get(s.ryanId)!, lead, rivalId: s.rivalId, repeat: false }).s4;
  }
  throw new Error(`no tag ${key}`);
}

describe('A9 — worked examples E1–E6 reproduce exactly (Revision 3 expectations, item 15)', () => {
  for (const name of ['e1', 'e2', 'e2alt', 'e4', 'e5', 'e6']) {
    it(fx(name).name, () => {
      const f = fx(name);
      const s: RevealSnapshot = f.snapshot;
      const b = planRound(s, 'balanced');
      const t = planRound(s, 'fullTv');
      check(b, f.expected.balanced);
      check(t, f.expected.fullTv);
      if (f.expected.balancedOverride) check(planRound(s, 'balanced', { exceptionalOverride: true }), f.expected.balancedOverride);
      for (const [k, v] of Object.entries(f.expected.scoresByTag ?? {})) expect(tagScore(s, t, k), k).toBe(v);
      for (const [id, h] of Object.entries(f.expected.hashes ?? {})) expect(hashString(id)).toBe(h);
      for (const q of f.expected.noCandidatesAt ?? []) expect(t.find((d) => d.q === q)!.candidates).toEqual([]);
    });
  }
});

type Ctx = 'reg-nf' | 'reg-f' | 'spc-nf' | 'spc-f';
const CTX: Record<Ctx, { special: boolean; isFinal: boolean }> = {
  'reg-nf': { special: false, isFinal: false }, 'reg-f': { special: false, isFinal: true },
  'spc-nf': { special: true, isFinal: false }, 'spc-f': { special: true, isFinal: true },
};
type Bonus = 'late' | 'prox' | 'contender' | 'kayla';
const subsets = <T,>(xs: T[]): T[][] => xs.reduce<T[][]>((acc, x) => [...acc, ...acc.map((a) => [...a, x])], [[]]);

/** Score one synthetic moment with exactly the chosen bonuses switched on (and nothing else). */
function termsWith(p: ProfileId, type: MomentType, special: boolean, isFinal: boolean, on: Bonus[], repeat = false) {
  const total = on.includes('prox') ? 0 : 10;
  const kayla = on.includes('kayla');
  return scoreTerms(
    { type, hole: on.includes('late') ? 9 : 1, totalToPar: total, golferId: kayla ? 'golfer_kayla_brooks' : 'golfer_x', position: 1, strokes: undefined, par: undefined },
    { profile: p, special, isFinal, holesPerRound: 9, ryanAlive: true, ryanTotalToPar: 0, lead: on.includes('contender') ? total : total - 10, rivalId: 'golfer_kayla_brooks', repeat },
  );
}

describe('A10 — the threshold table (Revision 3, item 16) matches the constants', () => {
  // Transcribed from the Revision 3 table: [base S, bonus points needed to pass], per profile and context.
  type Cell = [number, number];
  const DOC: Record<'balanced' | 'fullTv', Record<string, Record<Ctx, Cell>>> = {
    balanced: {
      LEAD_CHANGE: { 'reg-nf': [10, 4], 'reg-f': [15, 0], 'spc-nf': [15, 0], 'spc-f': [22.5, 0] },
      EAGLE: { 'reg-nf': [7, 7], 'reg-f': [10.5, 4], 'spc-nf': [10.5, 4], 'spc-f': [15.75, 0] },
      LEADER_STUMBLE: { 'reg-nf': [8, 6], 'reg-f': [12, 2], 'spc-nf': [12, 2], 'spc-f': [18, 0] },
      RIVAL_SWING: { 'reg-nf': [5, 9], 'reg-f': [7.5, 7], 'spc-nf': [7.5, 7], 'spc-f': [11.25, 2] },
      HOT_RUN: { 'reg-nf': [6, 8], 'reg-f': [9, 5], 'spc-nf': [9, 5], 'spc-f': [13.5, 0] },
    },
    fullTv: {
      LEAD_CHANGE: { 'reg-nf': [10, 3], 'reg-f': [15, 0], 'spc-nf': [15, 0], 'spc-f': [22.5, 0] },
      EAGLE: { 'reg-nf': [8, 5], 'reg-f': [12, 0], 'spc-nf': [12, 0], 'spc-f': [18, 0] },
      LEADER_STUMBLE: { 'reg-nf': [9, 4], 'reg-f': [13.5, 0], 'spc-nf': [13.5, 0], 'spc-f': [20.25, 0] },
      RIVAL_SWING: { 'reg-nf': [5, 8], 'reg-f': [7.5, 5], 'spc-nf': [7.5, 5], 'spc-f': [11.25, 0] },
      HOT_RUN: { 'reg-nf': [7, 6], 'reg-f': [10.5, 2], 'spc-nf': [10.5, 2], 'spc-f': [15.75, 0] },
    },
  };
  const NEVER: Record<'balanced' | 'fullTv', string[]> = {
    balanced: ['EAGLE reg-nf', 'RIVAL_SWING reg-nf', 'RIVAL_SWING spc-nf', 'HOT_RUN reg-nf'],
    fullTv: ['RIVAL_SWING reg-nf'],
  };
  it('every cell: base S, and a bonus combination passes exactly when its points reach the table value', () => {
    for (const p of ['balanced', 'fullTv'] as const) {
      const pts: Record<Bonus, number> = { late: 3, prox: 2, contender: PROFILES[p].contender.bonus, kayla: PROFILES[p].kaylaBonus };
      const never: string[] = [];
      for (const [type, cells] of Object.entries(DOC[p])) {
        for (const [ctxName, [baseS, need]] of Object.entries(cells) as [Ctx, Cell][]) {
          const { special, isFinal } = CTX[ctxName];
          const T = PROFILES[p].threshold[contextOf(special, isFinal)];
          expect(termsWith(p, type as MomentType, special, isFinal, []).s4 / 4, `${p} ${type} ${ctxName} base`).toBe(baseS);
          const avail: Bonus[] = isFinal ? ['late', 'prox', 'contender', 'kayla'] : ['prox', 'contender', 'kayla'];
          for (const on of subsets(avail)) {
            const t = termsWith(p, type as MomentType, special, isFinal, on);
            const got = on.reduce((a, b) => a + pts[b], 0);
            expect(t.s4 >= 4 * T, `${p} ${type} ${ctxName} +[${on.join(',')}]`).toBe(got >= need);
          }
          if (avail.reduce((a, b) => a + pts[b], 0) < need) never.push(`${type} ${ctxName}`);
        }
      }
      expect(never, `${p}: cells marked "never"`).toEqual(NEVER[p]);
    }
  });
});

describe('A11 — integer maths', () => {
  it('S4 is a safe integer and S4 ≥ 4T exactly when the rational S ≥ T, for every profile, type, context and bonus', () => {
    let n = 0;
    for (const p of ['balanced', 'fullTv'] as const) {
      const P = PROFILES[p];
      for (const type of TYPE_PRIORITY) {
        for (const { special, isFinal } of Object.values(CTX)) {
          const T = P.threshold[contextOf(special, isFinal)];
          const avail: Bonus[] = isFinal ? ['late', 'prox', 'contender', 'kayla'] : ['prox', 'contender', 'kayla'];
          for (const on of subsets(avail)) {
            for (const repeat of [false, true]) {
              const t = termsWith(p, type, special, isFinal, on, repeat);
              expect(Number.isSafeInteger(t.s4)).toBe(true);
              // Exact rational: S = B·me·mr + adds, with me, mr ∈ {1, 3/2} (dyadic, so exact in binary).
              const S = P.base[type] * (special ? 1.5 : 1) * (isFinal ? 1.5 : 1)
                + (on.includes('late') ? 3 : 0) + (on.includes('prox') ? 2 : 0) + (on.includes('contender') ? P.contender.bonus : 0)
                + (on.includes('kayla') ? P.kaylaBonus : 0) - (repeat ? 4 : 0);
              expect(t.s4).toBe(S * 4);
              expect(t.s4 >= 4 * T).toBe(S >= T);
              n++;
            }
          }
        }
      }
    }
    expect(n).toBe(2 * 7 * (2 * 8 * 2 + 2 * 16 * 2));
  });
});

// ── Mass simulation shared by A12–A14, A18 and A20: checked round by round, nothing kept ──
const PER_TOUR = Number(process.env.CI1_PER_TOUR ?? 10000);
const sel = (plan: Decision[]) => plan.filter((d) => d.selected);
const REASONS: SuppressReason[] = ['below_threshold', 'gate', 'suppressed_cap', 'suppressed_cooldown', 'late_reserve', 'lost_tiebreak'];
const isExc = (d: Decision) => d.candidates.find((c) => c.moment.momentId === d.selected)!.exceptional;
const V = {
  tournaments: 0, rounds: 0,
  capBalanced: 0, capFullTv: 0, capOff: 0, capOverride: 0, overrideSecondNotExceptional: 0, overrideSeconds: 0,
  cooldownViolations: 0, closeExceptional: 0,
  partitionViolations: 0,
  ryanSubject: 0, outOfFieldSubject: 0, boundaryMismatch: 0,
  duplicateIds: 0, idsChecked: 0,
};
let built = false;
function buildSample() {
  if (built) return;
  built = true;
  for (const tour of TOURS_ALL) {
    for (const mode of ['full', 'key'] as RoundMode[]) {
      let count = 0;
      for (const { def, career } of eventsFor(tour, 100000)) {
        if (count++ >= PER_TOUR / 2) break;
        V.tournaments++;
        const ids = new Set<string>();
        for (const rt of runTournament(def, career, mode).rounds) {
          if (!rt.snap) continue;
          V.rounds++;
          const snap = rt.snap;
          const plans = {
            balanced: planRound(snap, 'balanced'), fullTv: planRound(snap, 'fullTv'), off: planRound(snap, 'off'),
            override: planRound(snap, 'balanced', { exceptionalOverride: true }),
          };
          // A12 (Revision 3: caps per context)
          const cx: BroadcastContext = contextOf(snap.special, snap.isFinal);
          const capB = capFor('balanced', cx, 9);
          if (sel(plans.balanced).length > capB) V.capBalanced++;
          if (sel(plans.fullTv).length > capFor('fullTv', cx, 9)) V.capFullTv++;
          if (sel(plans.off).length !== 0) V.capOff++;
          const o = sel(plans.override);
          if (o.length > capB + 1) V.capOverride++;
          if (o.length === capB + 1) {
            V.overrideSeconds++;
            if (!isExc(o[capB])) V.overrideSecondNotExceptional++;
          }
          // A13 (Full TV cooldown 2, Balanced cooldown 3)
          for (const p of ['fullTv', 'balanced'] as const) {
            const ss = sel(plans[p]);
            for (let i = 1; i < ss.length; i++) {
              const gap = ss[i].q - ss[i - 1].q;
              if (isExc(ss[i])) {
                if (p === 'fullTv' && gap < PROFILES.fullTv.cooldown) V.closeExceptional++;
              } else if (gap < PROFILES[p].cooldown) V.cooldownViolations++;
            }
          }
          // A14
          for (const plan of Object.values(plans)) for (const d of plan) {
            const all = d.candidates.map((c) => c.moment.momentId).sort();
            const accounted = [...(d.selected ? [d.selected] : []), ...d.suppressed.map((x) => x.momentId)].sort();
            if (JSON.stringify(all) !== JSON.stringify(accounted)) V.partitionViolations++;
            for (const x of d.suppressed) if (!REASONS.includes(x.reason)) V.partitionViolations++;
          }
          // A18
          for (const d of plans.off) for (const c of d.candidates) {
            if (c.moment.golferId === snap.ryanId) V.ryanSubject++;
            if (!snap.alive.includes(c.moment.golferId)) V.outOfFieldSubject++;
          }
          const expected = mode === 'full' ? [1, 2, 3, 4, 5, 6, 7, 8, 9] : holesToPlay('key', snap.round, snap.pars).map((i) => i + 1);
          if (JSON.stringify(snap.boundaries) !== JSON.stringify(expected) || JSON.stringify(plans.off.map((d) => d.q)) !== JSON.stringify(expected)) V.boundaryMismatch++;
          // A20
          for (const d of plans.off) for (const c of d.candidates) {
            V.idsChecked++;
            if (ids.has(c.moment.momentId)) V.duplicateIds++;
            ids.add(c.moment.momentId);
          }
        }
      }
    }
  }
}

describe(`A12–A14, A18, A20 — ${PER_TOUR.toLocaleString()} simulated tournaments per tour (half full, half key mode)`, () => {
  it('A12 cap per context: Balanced ≤ 1/2/1/2, Full TV ≤ 1/2/2/3, Off 0; with the override Balanced ≤ cap + 1 and the extra is exceptional', () => {
    buildSample();
    expect(V.tournaments).toBe(PER_TOUR * TOURS_ALL.length);
    const CXS: BroadcastContext[] = ['regEarly', 'regFinal', 'spcEarly', 'spcFinal'];
    expect(CXS.map((c) => capFor('balanced', c, 9))).toEqual([1, 2, 1, 2]);
    expect(CXS.map((c) => capFor('fullTv', c, 9))).toEqual([1, 2, 2, 3]);
    expect(CXS.map((c) => capFor('off', c, 9))).toEqual([0, 0, 0, 0]);
    expect([V.capBalanced, V.capFullTv, V.capOff, V.capOverride, V.overrideSecondNotExceptional]).toEqual([0, 0, 0, 0, 0]);
    expect(V.overrideSeconds).toBeGreaterThan(0);
    console.log(`A12 sample: ${V.tournaments} tournaments, ${V.rounds} rounds; override would add an extra (exceptional) cut-in in ${V.overrideSeconds} rounds`);
  }, 1_800_000);

  it('A13 cooldown: non-exceptional selections are ≥ 2 (Full TV) or ≥ 3 (Balanced) holes after the previous selection; exceptional may be closer', () => {
    buildSample();
    expect(V.cooldownViolations).toBe(0);
    expect(V.closeExceptional).toBeGreaterThan(0);
  });

  it('A14 one per boundary: each candidate is either the one selection or suppressed with a known reason (late_reserve included)', () => {
    buildSample();
    expect(V.partitionViolations).toBe(0);
  });

  it('A18 subjects and modes: never Ryan, never a golfer out of the field; key-mode boundaries match holesToPlay', () => {
    buildSample();
    expect([V.ryanSubject, V.outOfFieldSubject, V.boundaryMismatch]).toEqual([0, 0, 0]);
  });

  it('A18 sim mode: no boundaries, so an empty plan', () => {
    const c = careerFor('lpga', 5);
    const def = seasonSchedule(1).find((d) => d.tour === 'lpga')!;
    const a = startTournament(def, c, 'sim');
    const s = revealSnapshot(a, def, c);
    expect(s.boundaries).toEqual([]);
    for (const p of ['balanced', 'fullTv', 'off'] as ProfileId[]) expect(planRound(s, p)).toEqual([]);
    expect(runTournament(def, c, 'sim').rounds.every((r) => r.snap === null)).toBe(true);
  });

  it('A20 span rule: no moment id appears twice across a tournament', () => {
    buildSample();
    expect(V.idsChecked).toBeGreaterThan(10000);
    expect(V.duplicateIds).toBe(0);
  });
});

describe('A15 — exceptional events', () => {
  it('an ace beats a higher-S4 lead change at the same boundary (Full TV)', () => {
    // Revision 3: a final round (Full TV regular-final cap 2), so the second slot is open at 8.
    // Round 3 of 3. X eagles 2 (selected), makes 8 on the 5th, then aces 8, 3 behind Ryan and 5 off the lead,
    // with late and a repeat penalty: 15·2·3 + 4·(3 − 4) = 86.
    // Y takes the lead alone at 8, within 2 of Ryan: 10·2·3 + 4·(late 3 + prox 2 + contender 3) = 92.
    const s = snap({
      round: 2, rounds: 3,
      golfers: { golfer_ryan: [-7], golfer_l: [-8], golfer_y: [-8, { 8: 2 }], golfer_x: [-4, { 2: 3, 5: 8, 8: 1 }] },
    });
    const plan = planRound(s, 'fullTv');
    expect(plan.find((d) => d.q === 2)!.selected).toBe('t-1:r3:EAGLE:golfer_x:h2');
    const d8 = plan.find((d) => d.q === 8)!;
    const ace = d8.candidates.find((c) => c.moment.type === 'ACE')!;
    const lead = d8.candidates.find((c) => c.moment.type === 'LEAD_CHANGE')!;
    expect([ace.s4, lead.s4]).toEqual([86, 92]);
    expect(d8.selected).toBe(ace.moment.momentId);
    expect(d8.suppressed).toEqual([{ momentId: lead.moment.momentId, reason: 'lost_tiebreak' }]);
  });
  it('an ace beats an albatross at the same boundary, even with a lower S4', () => {
    const s = snap({
      round: 1,
      golfers: { golfer_ryan: [0], golfer_alb: [1, { 2: 2 }], golfer_acer: [6, { 4: 1 }], ...fillers(3, -3) },
      boundaries: [4, 9],
    });
    const d = planRound(s, 'balanced')[0];
    const alb = d.candidates.find((c) => c.moment.type === 'ALBATROSS')!;
    const ace = d.candidates.find((c) => c.moment.type === 'ACE')!;
    expect(alb.s4).toBeGreaterThan(ace.s4);
    expect(d.selected).toBe(ace.moment.momentId);
  });
  it('exceptional events skip threshold, gate and cooldown (and the late reserve: T3), but not the cap', () => {
    // X, far down the board: albatross at 2 (selected), ace at 4 (S4 44 < 56, gate fails, 2 < cooldown 3). Z aces 8.
    const s = snap({ round: 1, golfers: { golfer_ryan: [-10], golfer_x: [8, { 2: 2, 4: 1 }], golfer_z: [9, { 8: 1 }], ...fillers(12, -9) } });
    const without = planRound(s, 'balanced');
    expect(without.find((d) => d.q === 2)!.selected).toBe('t-1:r2:ALBATROSS:golfer_x:h2');
    expect(without.find((d) => d.q === 4)!.suppressed).toEqual([{ momentId: 't-1:r2:ACE:golfer_x:h4', reason: 'suppressed_cap' }]);
    const withOverride = planRound(s, 'balanced', { exceptionalOverride: true });
    const d5 = withOverride.find((d) => d.q === 4)!;
    const c5 = d5.candidates[0];
    expect(c5.s4).toBe(44);
    expect(c5.moment.position).toBeGreaterThan(10);
    expect(4 - 2).toBeLessThan(PROFILES.balanced.cooldown);
    expect(d5.selected).toBe('t-1:r2:ACE:golfer_x:h4');
    expect(withOverride.find((d) => d.q === 8)!.suppressed).toEqual([{ momentId: 't-1:r2:ACE:golfer_z:h8', reason: 'suppressed_cap' }]);
    expect(planRound(s, 'off').every((d) => d.selected === null)).toBe(true);
  });
});

describe('A16 — tie-break determinism', () => {
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
  it('E5 selects Duarte, whatever the field order (100 shuffles)', () => {
    const s: RevealSnapshot = fx('e5').snapshot;
    for (let k = 0; k < 100; k++) expect(planRound(reorder(s, k), 'fullTv')[0].selected).toBe('epson-2-w6:r2:EAGLE:golfer_duarte_m:h1');
  });
  it('real rounds plan identically under 100 shuffles of the field order', () => {
    const c = careerFor('lpga', 11);
    for (const def of seasonSchedule(2).filter((d) => d.tour === 'lpga').slice(0, 3)) {
      for (const rt of runTournament(def, c, 'full').rounds) {
        if (!rt.snap) continue;
        const want = JSON.stringify(planRound(rt.snap, 'fullTv').map((d) => d.selected));
        for (let k = 0; k < 100; k += 10) expect(JSON.stringify(planRound(reorder(rt.snap, k), 'fullTv').map((d) => d.selected))).toBe(want);
      }
    }
  });
});

describe('A17 — relevance gate', () => {
  it('a passing eagle outside the top 10, not near Ryan and not the rival, is never selected', () => {
    const golfers = { golfer_ryan: [-12] as [number], golfer_g: [5, { 3: 2 }] as [number, Record<number, number>], ...fillers(24, -11) };
    const s = snap({ round: 3, special: true, golfers });
    const d3 = planRound(s, 'balanced').find((d) => d.q === 3)!;
    const g = d3.candidates.find((c) => c.moment.golferId === 'golfer_g')!;
    expect(g.s4).toBe(63);
    expect(g.moment.position).toBeGreaterThan(10);
    expect(d3.suppressed).toContainEqual({ momentId: g.moment.momentId, reason: 'gate' });
    // Control: the same eagle within 2 of Ryan passes the gate.
    const near = snap({ round: 3, special: true, golfers: { ...golfers, golfer_ryan: [1] } });
    expect(planRound(near, 'balanced').find((d) => d.q === 3)!.selected).toBe(g.moment.momentId);
  });
  it('the rival passes the gate from anywhere on the board', () => {
    const s = snap({ round: 3, special: true, golfers: { golfer_ryan: [-12], golfer_kayla_brooks: [5, { 3: 2 }], ...fillers(24, -11) } });
    expect(planRound(s, 'balanced').find((d) => d.q === 3)!.selected).toBe('t-1:r4:EAGLE:golfer_kayla_brooks:h3');
  });
  it('exceptional types are not gated (EXCEPTIONAL = ACE, ALBATROSS)', () => {
    expect([...EXCEPTIONAL].sort()).toEqual(['ACE', 'ALBATROSS']);
  });
});
