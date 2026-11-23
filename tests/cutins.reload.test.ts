/**
 * CI-1 acceptance tests: presentation point and save/reload safety
 * (A19, A21 with scenarios R1–R11, A22, A23).
 * Spec: "Live Tournament Cut-Ins — CI-1 Specification (Revision 2)", section 4;
 * caps per context from "CI-1 Revision 3 — Broadcast Intelligence Tuning Specification".
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { completeRound, previewRound, seasonSchedule, type TournamentDef } from '../src/career/tournament';
import type { ActiveTournament, CareerState, RoundMode } from '../src/career/types';
import { capFor, contextOf, LOG_KEY, LOG_LIMIT } from '../src/cutins/constants';
import { planRound } from '../src/cutins/plan';
import { markPresented, presentationHistory, resetPresentationMemory, wasPresented } from '../src/cutins/presentationLog';
import { revealSnapshot, thruOf } from '../src/cutins/snapshot';
import { claimPresentation, consume, issueToken, resetTokens, type BoundaryToken } from '../src/cutins/token';
import type { ProfileId } from '../src/cutins/types';
import { careerFor, runTournament, TOURS_ALL } from '../tools/cutins-lab/rates';

// ── A device's localStorage, replaceable per test ──
class MemStorage {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
  key() { return null; }
  get length() { return this.m.size; }
}
class ThrowingStorage extends MemStorage {
  getItem(): string | null { throw new Error('denied'); }
  setItem(): void { throw new Error('quota'); }
}
const g = globalThis as { localStorage?: unknown };
const useDevice = (s: unknown) => { g.localStorage = s; };
/** A reload: every in-memory token and the session memory are gone; the device log survives. */
const reload = () => { resetTokens(); resetPresentationMemory(); };
beforeEach(() => { useDevice(new MemStorage()); reload(); });
afterEach(() => { delete g.localStorage; });

/** A tournament round with its live progression (state after each recorded hole). */
interface LiveRound { def: TournamentDef; c: CareerState; mode: RoundMode; before: ActiveTournament; steps: ActiveTournament[] }
function liveRounds(tour: (typeof TOURS_ALL)[number], seed: number, mode: RoundMode): LiveRound[] {
  const c = careerFor(tour, seed);
  const out: LiveRound[] = [];
  for (const def of seasonSchedule(seed).filter((d) => d.tour === tour)) {
    let cur: LiveRound | null = null;
    runTournament(def, c, mode, {
      onHole: (before, after) => {
        if (!cur || cur.before.round !== before.round || cur.def !== def) {
          cur = { def, c, mode, before, steps: [] };
          out.push(cur);
        }
        cur.steps.push(after);
      },
    });
  }
  return out;
}
const planAt = (r: LiveRound, a: ActiveTournament, p: ProfileId = 'balanced') => planRound(revealSnapshot(a, r.def, r.c), p);
/** Revision 3: the round's cap depends on its context (regular/special × early/final). */
const capOf = (r: LiveRound, p: ProfileId = 'balanced') => {
  const s = revealSnapshot(r.steps[r.steps.length - 1], r.def, r.c);
  return capFor(p, contextOf(s.special, s.isFinal), s.pars.length);
};
const roundtrip = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

/** A Balanced round that selects something before its last boundary, so later boundaries exist. */
const found = new Map<RoundMode, LiveRound>();
function findRound(mode: RoundMode): LiveRound {
  const hit = found.get(mode);
  if (hit) return hit;
  for (let seed = 1; seed < 40; seed++) for (const tour of ['lpga', 'epson'] as const) for (const r of liveRounds(tour, seed, mode)) {
    const p = planAt(r, r.steps[r.steps.length - 1]);
    if (p.some((d) => d.selected && d.q < p[p.length - 1].q) && r.steps.length >= 4) {
      found.set(mode, r);
      return r;
    }
  }
  throw new Error('no suitable round');
}

describe('A19 — presentation point: one-use tokens from the live recordHole transition', () => {
  const base = { tournamentId: 't', round: 0, playerHoles: [null, null, null] as (number | null)[] };
  it('a token is issued only when exactly one hole goes from null to a stroke count', () => {
    expect(issueToken(base, { ...base, playerHoles: [4, null, null] })?.q).toBe(1);
    expect(issueToken(base, base)).toBeNull();
    expect(issueToken(base, { ...base, playerHoles: [4, 3, null] })).toBeNull();
    expect(issueToken({ ...base, playerHoles: [4, null, null] }, { ...base, playerHoles: [5, null, null] })).toBeNull();
    expect(issueToken(base, { ...base, round: 1, playerHoles: [4, null, null] })).toBeNull();
    expect(issueToken(base, { ...base, tournamentId: 'u', playerHoles: [4, null, null] })).toBeNull();
    expect(issueToken(null, base)).toBeNull();
  });
  it('consume is true exactly once; a forged or pre-reload token never works', () => {
    const t = issueToken(base, { ...base, playerHoles: [null, 4, null] })!;
    expect(consume(t)).toBe(true);
    expect(consume(t)).toBe(false);
    const forged: BoundaryToken = { tournamentId: 't', round: 0, q: 3 };
    expect(consume(forged)).toBe(false);
    const old = issueToken(base, { ...base, playerHoles: [null, null, 4] })!;
    reload();
    expect(consume(old)).toBe(false);
  });
  it('nothing is presentable without a token, and a planned moment is presented once', () => {
    const r = findRound('full');
    const last = r.steps[r.steps.length - 1];
    const plan = planAt(r, last);
    const d = plan.find((x) => x.selected)!;
    const t = issueToken(r.steps[d.q - 2] ?? r.before, r.steps[d.q - 1])!;
    expect(t.q).toBe(d.q);
    expect(claimPresentation(t, plan)).toBe(d.selected);
    expect(claimPresentation(t, plan)).toBeNull();
    const again = issueToken(r.steps[d.q - 2] ?? r.before, r.steps[d.q - 1])!;
    expect(claimPresentation(again, plan)).toBeNull();
  });
});

describe('A21 — reload determinism', () => {
  it('the plan at any boundary is the prefix of the plan at every later boundary (full and key, 5 tours)', () => {
    let rounds = 0;
    for (const mode of ['full', 'key'] as RoundMode[]) for (const tour of TOURS_ALL) for (const r of liveRounds(tour, 3, mode)) {
      rounds++;
      const plans = r.steps.map((a) => planAt(r, a, 'fullTv'));
      const final = plans[plans.length - 1];
      for (const p of plans) expect(final.slice(0, p.length)).toEqual(p);
    }
    expect(rounds).toBeGreaterThan(100);
  });
  it('a JSON round trip of the save (career + active tournament) gives an identical plan', () => {
    for (const mode of ['full', 'key'] as RoundMode[]) for (const r of liveRounds('lpga', 4, mode).slice(0, 20)) {
      for (const a of r.steps) {
        for (const p of ['balanced', 'fullTv'] as ProfileId[]) {
          expect(planRound(revealSnapshot(roundtrip(a), roundtrip(r.def), roundtrip(r.c)), p)).toEqual(planAt(r, a, p));
        }
      }
    }
  });

  /** Plays a round from hole index `from`, claiming at each live boundary; returns what was presented. */
  function playOn(r: LiveRound, from: number, profile: ProfileId = 'balanced', opts: { reloadAfter?: number } = {}): string[] {
    const shown: string[] = [];
    for (let i = from; i < r.steps.length; i++) {
      const before = i === 0 ? r.before : r.steps[i - 1];
      const after = r.steps[i];
      const t = issueToken(before, after);
      expect(t).not.toBeNull();
      const id = claimPresentation(t!, planAt(r, after, profile));
      if (id) shown.push(id);
      if (opts.reloadAfter === i) reload();
    }
    return shown;
  }

  it('R1 reload mid-hole: no boundary was reached, so no token; finishing the hole works normally', () => {
    const r = findRound('full');
    expect(issueToken(r.before, r.before)).toBeNull();
    reload();
    expect(issueToken(r.before, r.steps[0])).not.toBeNull();
  });
  it('R2 reload after recordHole, before the cut-in: the moment is lost, never moved, and still uses the cap', () => {
    const r = findRound('full');
    const final = planAt(r, r.steps[r.steps.length - 1]);
    const d = final.find((x) => x.selected)!;
    const k = r.steps.findIndex((a) => thruOf(a) === d.q);
    expect(issueToken(k === 0 ? r.before : r.steps[k - 1], r.steps[k])).not.toBeNull(); // issued, never claimed
    reload();
    // After the reload the hole is already saved: there is no transition, so no token.
    expect(issueToken(r.steps[k], r.steps[k])).toBeNull();
    const shown = playOn(r, k + 1);
    expect(shown).toEqual([]); // Balanced cap of 1 was used by the lost moment
    expect(wasPresented(d.selected!)).toBe(false);
  });
  it('R3/R4 reload during or after a cut-in (interrupted or skipped): it never plays again', () => {
    for (const how of ['interrupted', 'skipped'] as const) {
      useDevice(new MemStorage());
      reload();
      const r = findRound('full');
      const final = planAt(r, r.steps[r.steps.length - 1]);
      const d = final.find((x) => x.selected)!;
      const k = r.steps.findIndex((a) => thruOf(a) === d.q);
      const shown = playOn({ ...r, steps: r.steps.slice(0, k + 1) }, 0);
      expect(shown).toEqual([d.selected]);
      markPresented(d.selected!, how);
      reload();
      expect(issueToken(r.steps[k], r.steps[k])).toBeNull();
      expect(wasPresented(d.selected!)).toBe(true); // the device log survived the reload
      expect(planRound(revealSnapshot(roundtrip(r.steps[k]), r.def, roundtrip(r.c)), 'balanced')).toEqual(planAt(r, r.steps[k]));
      expect(playOn(r, k + 1)).toEqual([]);
    }
  });
  it('R5 watched, reload, continue: later boundaries respect the cap already used', () => {
    const r = findRound('full');
    const final = planAt(r, r.steps[r.steps.length - 1]);
    const k = r.steps.findIndex((a) => thruOf(a) === final.find((x) => x.selected)!.q);
    const shown = playOn(r, 0, 'balanced', { reloadAfter: k });
    // Every planned selection is shown exactly once, and never more than the round's cap.
    expect(shown).toHaveLength(final.filter((d) => d.selected).length);
    expect(shown.length).toBeLessThanOrEqual(capOf(r));
  });
  it('R6 the save moved to another device mid-round: identical plan, no repeat', () => {
    const r = findRound('key');
    const final = planAt(r, r.steps[r.steps.length - 1]);
    const k = r.steps.findIndex((a) => thruOf(a) === final.find((x) => x.selected)!.q);
    const first = playOn({ ...r, steps: r.steps.slice(0, k + 1) }, 0);
    useDevice(new MemStorage()); // the other device has no log
    reload();
    const moved = roundtrip(r.steps[k]);
    expect(planRound(revealSnapshot(moved, r.def, roundtrip(r.c)), 'balanced')).toEqual(planAt(r, r.steps[k]));
    const second = playOn(r, k + 1);
    expect([...first, ...second]).toEqual(final.filter((d) => d.selected).map((d) => d.selected));
  });
  it('R7 device log unavailable: tokens and the span rule still prevent repeats', () => {
    useDevice(new ThrowingStorage());
    reload();
    const r = findRound('full');
    const final = planAt(r, r.steps[r.steps.length - 1]);
    const k = r.steps.findIndex((a) => thruOf(a) === final.find((x) => x.selected)!.q);
    const shown = playOn(r, 0, 'balanced', { reloadAfter: k });
    // Every planned selection is shown exactly once, and never more than the round's cap.
    expect(shown).toHaveLength(final.filter((d) => d.selected).length);
    expect(shown.length).toBeLessThanOrEqual(capOf(r));
    expect(issueToken(r.steps[k], r.steps[k])).toBeNull();
  });
  it('R8 profile changed mid-round: earlier virtual selections count; nothing retroactive, nothing twice (Decision C)', () => {
    let cases = 0;
    for (const mode of ['full', 'key'] as RoundMode[]) for (const tour of ['lpga', 'epson'] as const) for (const r of liveRounds(tour, 6, mode)) {
      const n = r.steps.length;
      for (let switchAt = 0; switchAt < n; switchAt++) {
        useDevice(new MemStorage()); // each case is its own device and session
        reload();
        const shown: { id: string; q: number }[] = [];
        for (let i = 0; i < n; i++) {
          const profile: ProfileId = i < switchAt ? 'off' : 'balanced';
          const t = issueToken(i === 0 ? r.before : r.steps[i - 1], r.steps[i])!;
          const plan = planAt(r, r.steps[i], profile);
          const id = claimPresentation(t, plan);
          if (id) shown.push({ id, q: t.q });
        }
        const balanced = planAt(r, r.steps[n - 1], 'balanced');
        const switchQ = thruOf(r.steps[switchAt]);
        const expected = balanced.filter((d) => d.selected && d.q >= switchQ).map((d) => ({ id: d.selected!, q: d.q }));
        expect(shown).toEqual(expected);
        expect(shown.length).toBeLessThanOrEqual(capOf(r));
        cases++;
      }
    }
    expect(cases).toBeGreaterThan(200);
  });
  it('R9 "Sim the rest" mid-round: no further boundaries, nothing presents', () => {
    const r = findRound('full');
    const k = 3;
    const simmed: ActiveTournament = { ...r.steps[k], mode: 'sim' };
    const plan = planAt(r, simmed);
    expect(plan.map((d) => d.q)).toEqual([1, 2, 3, 4]);
    const next = completeRound(simmed, r.def, r.c);
    if (next.round < r.def.rounds) expect(revealSnapshot({ ...next, mode: 'sim' }, r.def, r.c).boundaries).toEqual([]);
  });
  it('R10 a double mount or a double click: the token is consumed once', () => {
    const r = findRound('full');
    const final = planAt(r, r.steps[r.steps.length - 1]);
    const d = final.find((x) => x.selected)!;
    const k = r.steps.findIndex((a) => thruOf(a) === d.q);
    const t1 = issueToken(k === 0 ? r.before : r.steps[k - 1], r.steps[k])!;
    const t2 = issueToken(k === 0 ? r.before : r.steps[k - 1], r.steps[k])!;
    const plan = planAt(r, r.steps[k]);
    expect([claimPresentation(t1, plan), claimPresentation(t2, plan), claimPresentation(t1, plan)]).toEqual([d.selected, null, null]);
  });
  it('R11 next round: a fresh plan, cap and cooldown; ids carry their own round', () => {
    const c = careerFor('lpga', 2);
    const def = seasonSchedule(2).find((d) => d.tour === 'lpga' && d.special)!;
    const run = runTournament(def, c, 'full');
    const plans = run.rounds.filter((x) => x.snap).map((x) => planRound(x.snap!, 'fullTv'));
    expect(plans.length).toBeGreaterThan(1);
    plans.forEach((p, i) => {
      for (const d of p) for (const cand of d.candidates) expect(cand.moment.momentId).toContain(`:r${i + 1}:`);
      expect(p.filter((d) => d.selected).length).toBeLessThanOrEqual(2);
    });
    expect(plans.reduce((s, p) => s + p.filter((d) => d.selected).length, 0)).toBeGreaterThan(2);
  });
});

describe('A22 — preview stability: revealed holes never change later in the round', () => {
  it('for every golfer, revealed scores equal the round\'s final preview, in full and key modes', () => {
    let checked = 0;
    for (const mode of ['full', 'key'] as RoundMode[]) for (const tour of TOURS_ALL) for (const r of liveRounds(tour, 8, mode)) {
      const final = previewRound(r.steps[r.steps.length - 1], r.def, r.c);
      for (const a of r.steps) {
        const q = thruOf(a);
        const now = previewRound(a, r.def, r.c);
        for (const id of a.alive) {
          expect(now[id].slice(0, q)).toEqual(final[id].slice(0, q));
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(10000);
  });
});

describe('A23 — device presentation log', () => {
  it('tolerates localStorage throwing, or not existing', () => {
    useDevice(new ThrowingStorage());
    expect(() => markPresented('x:r1:ACE:golfer_a:h1', 'shown')).not.toThrow();
    expect(wasPresented('x:r1:ACE:golfer_a:h1')).toBe(true); // in memory
    delete g.localStorage;
    expect(() => markPresented('x:r1:ACE:golfer_b:h1', 'shown')).not.toThrow();
  });
  it(`keeps the last ${LOG_LIMIT} ids`, () => {
    const dev = new MemStorage();
    useDevice(dev);
    for (let i = 0; i < 250; i++) markPresented(`x:r1:ACE:golfer_${i}:h1`, 'shown');
    const stored = JSON.parse(dev.getItem(LOG_KEY)!) as string[];
    expect(stored).toHaveLength(LOG_LIMIT);
    expect(stored[0]).toBe('x:r1:ACE:golfer_50:h1');
    expect(stored[LOG_LIMIT - 1]).toBe('x:r1:ACE:golfer_249:h1');
    expect(presentationHistory()).toHaveLength(250);
  });
  it('a logged id blocks presentation but never changes eligibility or the plan', () => {
    const r = findRound('full');
    const last = r.steps[r.steps.length - 1];
    const before = planAt(r, last);
    const d = before.find((x) => x.selected)!;
    markPresented(d.selected!, 'watched');
    expect(planAt(r, last)).toEqual(before);
    const k = r.steps.findIndex((a) => thruOf(a) === d.q);
    const t = issueToken(k === 0 ? r.before : r.steps[k - 1], r.steps[k])!;
    expect(claimPresentation(t, planAt(r, r.steps[k]))).toBeNull();
  });
});
