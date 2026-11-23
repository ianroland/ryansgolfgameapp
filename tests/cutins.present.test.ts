/**
 * CI-2 · Visible competitor cut-ins (prototype): presentation safety.
 * Author directive "CI-2 Implementation & Career Legacy Decisions" (2026-11-22).
 *
 * The game drives `prepareCutIn(before, after, …)` once per saved hole, exactly
 * as TournamentView does after `recordHole`. These tests drive it the same way
 * through real simulated tournaments.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { checksum } from '../src/core/checksum';
import { completeRound, finalizeTournament, holesToPlay, activeCourse, parsOf, previewRound, seasonSchedule, startTournament, type TournamentDef } from '../src/career/tournament';
import type { ActiveTournament, CareerState, RoundMode } from '../src/career/types';
import { totalsAt } from '../src/cutins/detect';
import { planRound } from '../src/cutins/plan';
import { presentationHistory, resetPresentationMemory, wasPresented } from '../src/cutins/presentationLog';
import { revealSnapshot } from '../src/cutins/snapshot';
import { resetTokens } from '../src/cutins/token';
import type { ProfileId, RevealSnapshot } from '../src/cutins/types';
import { buildCutInView, CUTIN_MS, cutInEnding, CutInFrame, cutInProfile, isSkipKey, prepareCutIn, PROFILE_KEY, type CutInView } from '../src/ui/tournament/CutInCard';
import { CUTIN_LABEL } from '../src/ui/tournament/cutinCopy';
import { CUTINS_ENABLED, loadCutInRuntime } from '../src/ui/tournament/useCutIn';
import { toPar } from '../src/ui/format';
import { careerFor, runTournament } from '../tools/cutins-lab/rates';

// A device store for the presentation log (node has none): survives "reloads", like localStorage.
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() {
    return store.size;
  },
} as Storage;

/** A fresh device: no tokens, no presentation memory, empty device log. */
function freshDevice() {
  resetTokens();
  resetPresentationMemory();
  store.clear();
}
beforeEach(freshDevice);

const APPROVED = ['NEW LEADER', 'EAGLE', 'HOLE-IN-ONE', 'ALBATROSS', 'LEADER STUMBLES', 'RIVAL WATCH', 'ON A RUN'];

const deepFreeze = <T,>(o: T): T => {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o as object)) deepFreeze(v);
  }
  return o;
};

/** Ryan's simulated stroke on hole i (the lab driver's stand-in for a played hole). */
const ryanStroke = (a: ActiveTournament, def: TournamentDef, c: CareerState, i: number) => previewRound(a, def, c)[c.playerId][i];
/** Exactly what careerService.recordHole saves: one hole, nothing else. */
const recordHole = (a: ActiveTournament, i: number, strokes: number): ActiveTournament => ({ ...a, playerHoles: a.playerHoles.map((h, j) => (j === i ? strokes : h)) });

interface Played {
  views: { view: CutInView; snap: RevealSnapshot; q: number; after: ActiveTournament }[];
  /** prepareCutIn results on the round-completion (sim) transitions. */
  simTransitions: (CutInView | null)[];
  result: ReturnType<typeof finalizeTournament>;
  final: ActiveTournament;
}

/** Plays a tournament as the game does, offering a cut-in after every saved hole. */
function play(def: TournamentDef, c: CareerState, mode: RoundMode, profile: ProfileId | null): Played {
  let a = startTournament(def, c, mode);
  const views: Played['views'] = [];
  const simTransitions: (CutInView | null)[] = [];
  while (a.round < def.rounds) {
    if (a.alive.includes(c.playerId)) {
      for (const i of holesToPlay(mode, a.round, parsOf(activeCourse(a)))) {
        const next = recordHole(a, i, ryanStroke(a, def, c, i));
        if (profile) {
          const view = prepareCutIn(deepFreeze(structuredClone(a)), deepFreeze(structuredClone(next)), def, c, profile);
          if (view) views.push({ view, snap: revealSnapshot(next, def, c), q: i + 1, after: next });
        }
        a = next;
      }
    }
    const done = completeRound(a, def, c);
    if (profile) simTransitions.push(prepareCutIn(a, done, def, c, profile));
    a = done;
  }
  return { views, simTransitions, result: finalizeTournament(a, def, c.playerId), final: a };
}

const lpgaEvent = (season: number, i = 0) => seasonSchedule(season).filter((d) => d.tour === 'lpga')[i];

describe('C1 — presents only CI-1\'s selection, at the boundary just completed', () => {
  it('every cut-in is the moment CI-1 selected at that hole, each selection shown once, in order', () => {
    let total = 0;
    for (const [season, idx] of [[1, 0], [1, 2], [2, 5]] as const) {
      freshDevice();
      const def = lpgaEvent(season, idx);
      const c = careerFor('lpga', 1000 + season);
      const p = play(def, c, 'full', 'fullTv');
      for (const v of p.views) {
        const d = planRound(v.snap, 'fullTv').find((x) => x.q === v.q)!;
        expect(v.view.momentId).toBe(d.selected);
      }
      // Every CI-1 selection of the tournament appears exactly once.
      const selected = runTournament(def, c, 'full').rounds.flatMap((rt) => (rt.snap ? planRound(rt.snap, 'fullTv').filter((d) => d.selected).map((d) => d.selected) : []));
      expect(p.views.map((v) => v.view.momentId)).toEqual(selected);
      total += p.views.length;
    }
    expect(total).toBeGreaterThan(5);
  });
});

describe('C2 — boundary tokens: only a single completed, saved hole', () => {
  const def = lpgaEvent(1);
  const c = careerFor('lpga', 1001);
  const a0 = startTournament(def, c, 'full');
  const s = (a: ActiveTournament, i: number) => ryanStroke(a, def, c, i);
  it('no cut-in without exactly one hole going from unplayed to played', () => {
    const a1 = recordHole(a0, 0, s(a0, 0));
    expect(prepareCutIn(a0, a0, def, c, 'fullTv')).toBeNull(); // nothing changed
    expect(prepareCutIn(a0, recordHole(a1, 1, s(a1, 1)), def, c, 'fullTv')).toBeNull(); // two holes at once
    expect(prepareCutIn(a1, recordHole(a1, 0, s(a1, 0) + 1), def, c, 'fullTv')).toBeNull(); // a played hole edited
    expect(prepareCutIn(a1, { ...a1, round: a1.round + 1 }, def, c, 'fullTv')).toBeNull(); // another round
    expect(prepareCutIn(a1, { ...recordHole(a1, 1, s(a1, 1)), tournamentId: 'other' }, def, c, 'fullTv')).toBeNull(); // another tournament
  });
  it('a boundary is claimed once: offering the same transition again shows nothing', () => {
    // Find a hole with a selection, then offer it twice.
    let a = a0;
    for (let i = 0; i < 9; i++) {
      const next = recordHole(a, i, s(a, i));
      const first = prepareCutIn(a, next, def, c, 'fullTv');
      if (first) {
        expect(prepareCutIn(a, next, def, c, 'fullTv')).toBeNull();
        expect(wasPresented(first.momentId)).toBe(true);
        return;
      }
      a = next;
    }
    throw new Error('no selection in round 1 of the test event');
  });
});

describe('C3 — simulation never shows a cut-in', () => {
  it('Quick Sim tournaments, "sim rest of round" and round completion present nothing', () => {
    for (const tour of ['amateur', 'epson', 'lpga'] as const) {
      const def = seasonSchedule(3).filter((d) => d.tour === tour)[1];
      const c = careerFor(tour, 1003);
      const sim = play(def, c, 'sim', 'fullTv');
      expect(sim.views).toEqual([]);
      expect(sim.simTransitions.every((x) => x === null)).toBe(true);
      // Sim the rest of a round after two played holes.
      let a = startTournament(def, c, 'full');
      for (const i of [0, 1]) a = recordHole(a, i, ryanStroke(a, def, c, i));
      expect(prepareCutIn(a, completeRound(a, def, c), def, c, 'fullTv')).toBeNull();
      const full = play(def, c, 'full', 'fullTv');
      expect(full.simTransitions.every((x) => x === null)).toBe(true);
    }
  });
});

describe('C4 — profiles', () => {
  it('Off shows nothing; Balanced shows no more than Full TV; the device choice defaults to Balanced', () => {
    const def = lpgaEvent(1, 2);
    const c = careerFor('lpga', 1001);
    expect(play(def, c, 'full', 'off').views).toEqual([]);
    freshDevice();
    const bal = play(def, c, 'full', 'balanced').views.length;
    freshDevice();
    const ftv = play(def, c, 'full', 'fullTv').views.length;
    expect(bal).toBeLessThanOrEqual(ftv);
    expect(cutInProfile()).toBe('balanced');
    store.set(PROFILE_KEY, 'fullTv');
    expect(cutInProfile()).toBe('fullTv');
    store.set(PROFILE_KEY, 'loud');
    expect(cutInProfile()).toBe('balanced');
  });
});

describe('C5 — skipping and ending', () => {
  it('the first ending wins and is recorded once; skip keys are Space, Enter and Esc', () => {
    let closed = 0;
    const e = cutInEnding('t:r1:EAGLE:g:h1', () => closed++);
    expect(e.end('skipped')).toBe(true);
    expect(e.end('watched')).toBe(false);
    expect(e.end('interrupted')).toBe(false);
    expect(closed).toBe(1);
    expect(presentationHistory().filter((h) => h.momentId === 't:r1:EAGLE:g:h1').map((h) => h.how)).toEqual(['skipped']);
    const torn = cutInEnding('t:r1:EAGLE:g:h2', () => closed++);
    expect(torn.end('interrupted')).toBe(true);
    expect(closed).toBe(1); // a torn-down screen is not called back
    expect([' ', 'Enter', 'Escape'].every(isSkipKey)).toBe(true);
    expect(['a', 'ArrowLeft', 'Tab', 'm'].some(isSkipKey)).toBe(false);
    expect(CUTIN_MS).toBe(3500);
  });
  it('a claimed moment is presented ("shown") before any ending, so a skip can never bring it back', () => {
    const def = lpgaEvent(1);
    const c = careerFor('lpga', 1001);
    const p = play(def, c, 'full', 'fullTv');
    const v = p.views[0].view;
    expect(presentationHistory().find((h) => h.momentId === v.momentId)?.how).toBe('shown');
    cutInEnding(v.momentId, () => {}).end('skipped');
    expect(wasPresented(v.momentId)).toBe(true);
  });
});

describe('C6 — reload never repeats a moment', () => {
  it('after a reload (new session, device log kept), a presented or skipped moment never shows again', () => {
    const def = lpgaEvent(1);
    const c = careerFor('lpga', 1001);
    const p = play(def, c, 'full', 'fullTv');
    expect(p.views.length).toBeGreaterThan(0);
    const { view, after } = p.views[0];
    cutInEnding(view.momentId, () => {}).end('skipped');
    // Reload: tokens are gone and session memory is cleared; the device log survives.
    resetTokens();
    resetPresentationMemory();
    expect(store.get('ryans-road.cutins.presented')).toContain(view.momentId);
    // Even if the same hole transition could somehow be replayed, the moment is blocked.
    const before = { ...after, playerHoles: after.playerHoles.map((h, i) => (i === view.hole - 1 ? null : h)) };
    expect(prepareCutIn(before, after, def, c, 'fullTv')).toBeNull();
    // And a reload simply resumes: the saved state equals itself, so no transition, no cut-in.
    expect(prepareCutIn(after, after, def, c, 'fullTv')).toBeNull();
  });
  it('a reload between holes doesn\'t stop the next boundary from presenting normally', () => {
    const def = lpgaEvent(1);
    const c = careerFor('lpga', 1001);
    const reference = play(def, c, 'full', 'fullTv').views.map((v) => v.view.momentId);
    freshDevice();
    let a = startTournament(def, c, 'full');
    const shown: string[] = [];
    while (a.round < def.rounds) {
      for (const i of holesToPlay('full', a.round, parsOf(activeCourse(a)))) {
        resetTokens(); // a reload before every hole
        const next = recordHole(a, i, ryanStroke(a, def, c, i));
        const v = prepareCutIn(a, next, def, c, 'fullTv');
        if (v) shown.push(v.momentId);
        a = next;
      }
      a = completeRound(a, def, c);
    }
    expect(shown).toEqual(reference);
  });
});

describe('C7 — result parity: cut-ins change nothing', () => {
  it('results, standings, payouts and the career are identical with and without cut-ins (full and key, three tours)', () => {
    let tournaments = 0;
    for (const tour of ['amateur', 'epson', 'lpga'] as const) {
      for (const mode of ['full', 'key'] as RoundMode[]) {
        for (const def of seasonSchedule(4).filter((d) => d.tour === tour).slice(0, 3)) {
          const c = deepFreeze(careerFor(tour, 1004));
          freshDevice();
          const withCutIns = play(def, c, mode, 'fullTv');
          const without = play(def, c, mode, null);
          expect(checksum(withCutIns.result)).toBe(checksum(without.result));
          expect(withCutIns.result).toEqual(without.result);
          expect(withCutIns.final).toEqual(without.final);
          tournaments++;
        }
      }
    }
    expect(tournaments).toBe(18);
  });
});

describe('C8 — the card shows verified data only', () => {
  it('every field traces to the snapshot; labels are the approved seven; no other words', () => {
    let n = 0;
    for (const season of [1, 2, 3]) {
      freshDevice();
      for (const def of seasonSchedule(season).filter((d) => d.tour === 'lpga').slice(0, 4)) {
        const c = careerFor('lpga', 1000 + season);
        for (const { view: v, snap, q, after } of play(def, c, 'full', 'fullTv').views) {
          n++;
          expect(APPROVED).toContain(v.label);
          expect(v.label).toBe(CUTIN_LABEL[v.type]);
          const golfer = after.entrants.find((e) => e.name === v.name)!;
          expect(golfer).toBeDefined();
          expect(v.strokes).toBe(snap.holes[golfer.id][v.hole - 1]);
          expect(v.par).toBe(snap.pars[v.hole - 1]);
          const atQ = totalsAt(snap, q);
          expect(v.total).toBe(toPar(atQ.get(golfer.id)!));
          const best3 = [...atQ.values()].sort((a, b) => a - b).slice(0, 3).map(toPar);
          expect(v.top3.map((r) => r.total)).toEqual(best3);
          for (const r of v.top3) expect(r.name).toBe(after.entrants.find((e) => e.id === r.id)!.name);
          if (v.type === 'HOT_RUN') for (const h of v.run) expect(h.strokes).toBeLessThan(h.par);
          // Rendered text: only the label, names, numbers and existing UI vocabulary.
          const html = renderToStaticMarkup(createElement(CutInFrame, { view: v }));
          const text = html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&');
          let rest = ` ${text} `;
          for (const w of [v.label, v.name, ...v.top3.map((r) => r.name)]) rest = rest.split(w).join(' ');
          for (const w of rest.split(/\s+/).filter(Boolean)) expect(w, `unexpected text "${w}"`).toMatch(/^(HOLE|PAR|SKIP|LPGA|AMATEUR|EPSON|PRO|SERIES|Q-SCHOOL|R\d|T?\d+|[+-]\d+|E|▶)$/);
        }
      }
    }
    expect(n).toBeGreaterThan(20);
  }, 300_000);
});

describe('C9 — the review gallery uses genuine simulation records only', () => {
  const doc = JSON.parse(readFileSync(join(__dirname, '..', 'tools', 'cutins-lab', 'preview-records.json'), 'utf8')) as {
    records: { category: string; momentId: string; profile: ProfileId; q: number; source: { tournamentId: string; tour: string; season: number; round: number; careerSeed: number; mode: RoundMode }; names: Record<string, string>; snapshot: RevealSnapshot }[];
  };
  it('one record per approved category, each re-simulated byte for byte and re-selected by CI-1', () => {
    expect(doc.records.map((r) => CUTIN_LABEL[r.category as keyof typeof CUTIN_LABEL]).sort()).toEqual([...APPROVED].sort());
    for (const r of doc.records) {
      const def = seasonSchedule(r.source.season).find((d) => d.id === r.source.tournamentId)!;
      const c = careerFor(r.source.tour as never, r.source.careerSeed);
      const rt = runTournament(def, c, r.source.mode, { keepSteps: true }).rounds.find((x) => x.round === r.source.round - 1)!;
      expect(rt.snap).toEqual(r.snapshot);
      const entrants = rt.steps[rt.steps.length - 1].entrants;
      for (const [id, name] of Object.entries(r.names)) expect(entrants.find((e) => e.id === id)?.name).toBe(name);
      const d = planRound(r.snapshot, r.profile).find((x) => x.q === r.q)!;
      expect(d.selected).toBe(r.momentId);
      const m = d.candidates.find((x) => x.moment.momentId === r.momentId)!.moment;
      expect(m.type).toBe(r.category);
      expect(buildCutInView(r.snapshot, r.q, m, r.names).label).toBe(CUTIN_LABEL[m.type]);
    }
  });
});

describe('C10 — build flag', () => {
  it('the feature is off unless the review build sets VITE_CUTINS=1', () => {
    expect(CUTINS_ENABLED).toBe(false);
    expect(loadCutInRuntime()).toBeNull();
  });
});
