/**
 * CI-1 developer tool: highlight-selection frequency analysis.
 *
 * Drives real tournaments through the pure career engine (startTournament,
 * previewRound, completeRound, finalizeTournament), fills Ryan's played
 * holes with her own simulated scores, and plans every round with CI-1
 * under each profile. Writes cutins-lab-output/rates.json.
 *
 * Not part of the game build. Run from the project root:
 *   node --input-type=module -e "import {createServer} from 'vite'; const s = await createServer({server:{middlewareMode:true},appType:'custom',logLevel:'error'}); const m = await s.ssrLoadModule('/tools/cutins-lab/rates.ts'); await m.main(); await s.close();"
 * Revision 3 decision digests only (no file written): pass '--digest' to main,
 * i.e. `await m.main(['--digest'])` in the command above.
 *
 * The driver below is also used by the CI-1 tests.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { newCareerState } from '../../src/career/engine';
import { TOURS, type TourId } from '../../src/career/config';
import { activeCourse, completeRound, finalizeTournament, holesToPlay, parsOf, previewRound, seasonSchedule, startTournament, type TournamentDef, type TournamentResult } from '../../src/career/tournament';
import type { ActiveTournament, CareerState, RoundMode } from '../../src/career/types';
import { planRound } from '../../src/cutins/plan';
import { revealSnapshot } from '../../src/cutins/snapshot';
import type { Candidate, Decision, ProfileId, RevealSnapshot } from '../../src/cutins/types';
import { capFor, contextOf, GATE_TOP, PROFILES } from '../../src/cutins/constants';
import { totalsAt } from '../../src/cutins/detect';
import { isProximate } from '../../src/cutins/score';
import { checksum } from '../../src/core/checksum';

// ───────────────────────── Driver ─────────────────────────

/** Ryan modelled as a mid-field player of each tour (all stats at this value). */
export const RYAN_LEVEL: Record<TourId, number> = { amateur: 35, mini: 48, qschool: 58, epson: 63, lpga: 78 };

/** A career where Ryan and Kayla are both mid-field players of `tour`. */
export function careerFor(tour: TourId, seed: number): CareerState {
  const c = newCareerState(seed);
  const lvl = RYAN_LEVEL[tour];
  c.stats = { power: lvl, accuracy: lvl, shortGame: lvl, putting: lvl, nerve: lvl, fitness: Math.max(60, lvl) };
  c.energy = 100;
  c.form = 0;
  const poolTour: TourId = tour === 'qschool' ? 'mini' : tour;
  for (const t of Object.keys(c.pools) as TourId[]) c.pools[t] = c.pools[t].filter((g) => g.id !== c.rivalId);
  c.pools[poolTour].push({ id: c.rivalId, name: 'Kayla Brooks', rating: lvl, tour: poolTour });
  return c;
}

export interface RoundTrace {
  round: number;
  /** Snapshot at the round's last boundary (null when Ryan had no boundaries). */
  snap: RevealSnapshot | null;
  /** The live progression: active after each recordHole, in play order. */
  steps: ActiveTournament[];
}

export interface DriverOptions {
  /** Plan with CI-1 at every boundary (the A3 "enabled" arm). */
  withCutins?: boolean;
  profiles?: ProfileId[];
  /** Called after each hole Ryan records, with the live state before and after. */
  onHole?: (before: ActiveTournament, after: ActiveTournament, def: TournamentDef, c: CareerState) => void;
  keepSteps?: boolean;
  /** The A3 "absent" arm: no CI-1 call at all. */
  noSnapshots?: boolean;
}

export interface DriverResult {
  def: TournamentDef;
  mode: RoundMode;
  career: CareerState;
  result: TournamentResult;
  final: ActiveTournament;
  rounds: RoundTrace[];
}

export function runTournament(def: TournamentDef, c: CareerState, mode: RoundMode, opts: DriverOptions = {}): DriverResult {
  let a = startTournament(def, c, mode);
  const rounds: RoundTrace[] = [];
  while (a.round < def.rounds) {
    const steps: ActiveTournament[] = [];
    if (a.alive.includes(c.playerId)) {
      const PARS = parsOf(activeCourse(a));
      // Ryan's own simulated scores; unaffected by the holes she records (A22 checks this).
      const ryanSim = previewRound(a, def, c)[c.playerId];
      for (const i of holesToPlay(mode, a.round, PARS)) {
        const strokes = ryanSim[i];
        const next: ActiveTournament = { ...a, playerHoles: a.playerHoles.map((h, j) => (j === i ? strokes : h)) };
        opts.onHole?.(a, next, def, c);
        if (opts.withCutins) for (const pr of opts.profiles ?? ['balanced']) planRound(revealSnapshot(next, def, c), pr);
        if (opts.keepSteps) steps.push(next);
        a = next;
      }
    }
    const played = a.playerHoles.some((h) => h !== null);
    rounds.push({ round: a.round, snap: played && !opts.noSnapshots ? revealSnapshot(a, def, c) : null, steps });
    a = completeRound(a, def, c);
  }
  return { def, mode, career: c, result: finalizeTournament(a, def, c.playerId), final: a, rounds };
}

export const TOURS_ALL: TourId[] = ['amateur', 'mini', 'qschool', 'epson', 'lpga'];

/** Every event of `tour` in seasons 1…n, with a matching career per season. */
export function* eventsFor(tour: TourId, seasons: number): Generator<{ def: TournamentDef; career: CareerState }> {
  for (let s = 1; s <= seasons; s++) {
    const career = careerFor(tour, 1000 + s);
    for (const def of seasonSchedule(s).filter((d) => d.tour === tour)) yield { def, career };
  }
}

// ───────────────────────── Analysis ─────────────────────────

type Variant = ProfileId | 'balancedOverride';
const VARIANTS: Variant[] = ['balanced', 'fullTv', 'off', 'balancedOverride'];
const planFor = (snap: RevealSnapshot, v: Variant): Decision[] =>
  v === 'balancedOverride' ? planRound(snap, 'balanced', { exceptionalOverride: true }) : planRound(snap, v);

/** Would this candidate have been selectable had the round's allowance not been used? (Revision 3 gate and threshold.) */
function wouldPass(snap: RevealSnapshot, d: Decision, c: Candidate, v: Variant): boolean {
  if (c.exceptional) return true;
  const profile = PROFILES[v === 'balancedOverride' ? 'balanced' : v];
  const atQ = totalsAt(snap, d.q);
  const ryanAlive = snap.alive.includes(snap.ryanId);
  const ryanTotalToPar = ryanAlive ? atQ.get(snap.ryanId)! : 0;
  const lead = Math.min(...atQ.values());
  const prox = isProximate(c.moment.totalToPar, { ryanAlive, ryanTotalToPar });
  const rival = c.moment.golferId === snap.rivalId;
  const far = profile.ryanFarGap !== null && !snap.isFinal && (ryanAlive ? ryanTotalToPar - lead : Infinity) >= profile.ryanFarGap;
  const gate = far ? prox || rival || (snap.special && c.moment.position <= profile.majorTopExempt) : c.moment.position <= GATE_TOP || prox || rival;
  return gate && c.s4 >= 4 * profile.threshold[contextOf(snap.special, snap.isFinal)];
}

/** The rates.json produced before Revision 3 (post-ace-fix, Revision 2 values), kept for comparison. */
export const REVISION2_REFERENCE = {
  source: 'cutins-lab-output/rates.json before CI-1 Revision 3 (same dataset; post-ace-fix field model)',
  balanced: { averagePerRound: 0.3344, pctZero: 66.56, special: 0.8894, regular: 0.2381, final: 0.8053, notFinal: 0.1658, selected: 9140, selectedKayla: 233, exceptionalSuppressedByCap: { ACE: 115, ALBATROSS: 9 } },
  fullTv: { averagePerRound: 1.6828, pctZero: 4.04, special: 1.8971, regular: 1.6456, final: 1.7524, notFinal: 1.6579, selected: 45991, selectedKayla: 4380, exceptionalSuppressedByCap: { ACE: 189, ALBATROSS: 12 } },
};

/**
 * Revision 3 decision digests (spec item 17, T7): `checksum` over the per-round,
 * comma-joined selected moment ids, every round of the reference dataset in
 * order (modes full then key, TOURS_ALL, eventsFor order, rounds in order).
 */
export function computeDigests(opts: RatesOptions & { every?: number } = {}) {
  const seasons = opts.seasons ?? 100;
  const modes = opts.modes ?? ['full', 'key'];
  const every = opts.every ?? 1;
  const ids: Record<'balanced' | 'fullTv', string[]> = { balanced: [], fullTv: [] };
  let rounds = 0;
  let idx = 0;
  for (const mode of modes) for (const tour of TOURS_ALL) for (const { def, career } of eventsFor(tour, seasons)) {
    for (const rt of runTournament(def, career, mode).rounds) {
      if (!rt.snap) continue;
      if (idx++ % every !== 0) continue;
      rounds++;
      for (const p of ['balanced', 'fullTv'] as const) ids[p].push(planRound(rt.snap, p).filter((d) => d.selected).map((d) => d.selected).join(','));
    }
  }
  return { rounds, balanced: checksum(ids.balanced), fullTv: checksum(ids.fullTv) };
}

interface Bucket {
  rounds: number;
  highlights: number;
  dist: Record<string, number>;
}
const bucket = (): Bucket => ({ rounds: 0, highlights: 0, dist: {} });
const add = (b: Bucket, n: number) => {
  b.rounds++;
  b.highlights += n;
  b.dist[n] = (b.dist[n] ?? 0) + 1;
};
const summarise = (b: Bucket) => ({
  rounds: b.rounds,
  highlights: b.highlights,
  averagePerRound: b.rounds ? +(b.highlights / b.rounds).toFixed(4) : 0,
  pctZero: b.rounds ? +((100 * (b.dist[0] ?? 0)) / b.rounds).toFixed(2) : 0,
  pctOne: b.rounds ? +((100 * (b.dist[1] ?? 0)) / b.rounds).toFixed(2) : 0,
  pctTwo: b.rounds ? +((100 * (b.dist[2] ?? 0)) / b.rounds).toFixed(2) : 0,
  distribution: b.dist,
});

interface VariantStats {
  all: Bucket;
  byContext: Record<string, Bucket>;
  /** Highlights per tournament, by tour and event type (regular / special). */
  perEvent: Record<string, { events: number; highlights: number; none: number }>;
  selectedFinalRound: number;
  selectedLastThreeHoles: number;
  byTour: Record<string, Bucket>;
  byImportance: Record<'special' | 'regular', Bucket>;
  byRound: Record<'final' | 'notFinal', Bucket>;
  byMode: Record<string, Bucket>;
  byTourMode: Record<string, Bucket>;
  selectedByType: Record<string, number>;
  selectedKayla: number;
  suppressed: Record<string, number>;
  /** Would have passed gate and threshold (or exceptional) but the round's allowance was used. */
  eligibleSuppressedByCap: number;
  eligibleSuppressedByCapByType: Record<string, number>;
  exceptionalSuppressedByCap: { ACE: number; ALBATROSS: number };
  /** Exceptional events suppressed by the cap in rounds where the slot went to a non-exceptional moment. */
  exceptionalSuppressedAfterNonExceptional: number;
}
const variantStats = (): VariantStats => ({
  all: bucket(),
  byContext: {},
  perEvent: {},
  selectedFinalRound: 0,
  selectedLastThreeHoles: 0,
  byTour: {},
  byImportance: { special: bucket(), regular: bucket() },
  byRound: { final: bucket(), notFinal: bucket() },
  byMode: {},
  byTourMode: {},
  selectedByType: {},
  selectedKayla: 0,
  suppressed: {},
  eligibleSuppressedByCap: 0,
  eligibleSuppressedByCapByType: {},
  exceptionalSuppressedByCap: { ACE: 0, ALBATROSS: 0 },
  exceptionalSuppressedAfterNonExceptional: 0,
});

interface ExampleRound {
  why: string;
  tournamentId: string;
  tour: TourId;
  special: boolean;
  mode: RoundMode;
  round: string;
  boundaries: number[];
  balanced: ReturnType<typeof describePlan>;
  fullTv: ReturnType<typeof describePlan>;
}

function describePlan(plan: Decision[]) {
  return plan
    .filter((d) => d.candidates.length)
    .map((d) => ({
      q: d.q,
      span: `holes ${d.p + 1}-${d.q}`,
      selected: d.selected,
      candidates: d.candidates.map((c) => ({
        momentId: c.moment.momentId,
        type: c.moment.type,
        alsoTags: c.moment.alsoTags,
        golferId: c.moment.golferId,
        hole: c.moment.hole,
        strokes: c.moment.strokes,
        par: c.moment.par,
        totalToPar: c.moment.totalToPar,
        position: (c.moment.tied ? 'T' : '') + c.moment.position,
        evidence: c.moment.evidence,
        s4: c.s4,
        S: c.s4 / 4,
        outcome: d.selected === c.moment.momentId ? 'selected' : d.suppressed.find((s) => s.momentId === c.moment.momentId)!.reason,
      })),
    }));
}

export interface RatesOptions {
  seasons?: number;
  modes?: RoundMode[];
}

export function computeRates(opts: RatesOptions = {}) {
  const seasons = opts.seasons ?? 100;
  const modes = opts.modes ?? ['full', 'key'];
  const stats = Object.fromEntries(VARIANTS.map((v) => [v, variantStats()])) as Record<Variant, VariantStats>;
  const detected: Record<string, number> = {};
  const detectedKayla: Record<string, number> = {};
  let tournaments = 0;
  let roundsEvaluated = 0;
  let roundsWithoutBoundaries = 0;
  let boundaries = 0;
  // Representative rounds: a deterministic reservoir sample per kind, over the whole run.
  const RESERVOIR = 40;
  const reservoir = new Map<string, { seen: number; items: ExampleRound[] }>();
  let lcg = 20261121;
  const rnd = (n: number) => {
    lcg = (Math.imul(lcg, 1664525) + 1013904223) >>> 0;
    return lcg % n;
  };

  for (const mode of modes) {
    for (const tour of TOURS_ALL) {
      for (const { def, career } of eventsFor(tour, seasons)) {
        tournaments++;
        const run = runTournament(def, career, mode);
        const perT: Record<string, number> = {};
        for (const rt of run.rounds) {
          if (!rt.snap) {
            roundsWithoutBoundaries++;
            continue;
          }
          roundsEvaluated++;
          const snap = rt.snap;
          boundaries += snap.boundaries.length;
          const plans = Object.fromEntries(VARIANTS.map((v) => [v, planFor(snap, v)])) as Record<Variant, Decision[]>;
          for (const d of plans.off) for (const c of d.candidates) {
            detected[c.moment.type] = (detected[c.moment.type] ?? 0) + 1;
            if (c.moment.golferId === snap.rivalId) detectedKayla[c.moment.type] = (detectedKayla[c.moment.type] ?? 0) + 1;
          }
          for (const v of VARIANTS) {
            const st = stats[v];
            const plan = plans[v];
            const n = plan.filter((d) => d.selected).length;
            add(st.all, n);
            add((st.byTour[tour] ??= bucket()), n);
            add(st.byImportance[snap.special ? 'special' : 'regular'], n);
            add(st.byRound[snap.isFinal ? 'final' : 'notFinal'], n);
            add((st.byMode[mode] ??= bucket()), n);
            add((st.byTourMode[`${tour}/${mode}`] ??= bucket()), n);
            add((st.byContext[contextOf(snap.special, snap.isFinal)] ??= bucket()), n);
            perT[v] = (perT[v] ?? 0) + n;
            for (const d of plan) if (d.selected) {
              if (snap.isFinal) st.selectedFinalRound++;
              if (d.q > snap.pars.length - 3) st.selectedLastThreeHoles++;
            }
            const nonExcSelected = plan.some((d) => d.selected && !d.candidates.find((c) => c.moment.momentId === d.selected)!.exceptional);
            for (const d of plan) {
              for (const c of d.candidates) {
                if (d.selected === c.moment.momentId) {
                  st.selectedByType[c.moment.type] = (st.selectedByType[c.moment.type] ?? 0) + 1;
                  if (c.moment.golferId === snap.rivalId) st.selectedKayla++;
                  continue;
                }
                const reason = d.suppressed.find((s) => s.momentId === c.moment.momentId)!.reason;
                st.suppressed[reason] = (st.suppressed[reason] ?? 0) + 1;
                if (reason === 'suppressed_cap' && wouldPass(snap, d, c, v)) {
                  st.eligibleSuppressedByCap++;
                  st.eligibleSuppressedByCapByType[c.moment.type] = (st.eligibleSuppressedByCapByType[c.moment.type] ?? 0) + 1;
                  if (c.exceptional) {
                    st.exceptionalSuppressedByCap[c.moment.type as 'ACE' | 'ALBATROSS']++;
                    if (nonExcSelected) st.exceptionalSuppressedAfterNonExceptional++;
                  }
                }
              }
            }
          }
          // Representative rounds: the first of each kind found.
          const b = plans.balanced;
          const f = plans.fullTv;
          const selType = (plan: Decision[]) => plan.flatMap((d) => d.candidates.filter((c) => c.moment.momentId === d.selected).map((c) => c.moment.type));
          const tags: string[] = [];
          const candCount = b.reduce((s, d) => s + d.candidates.length, 0);
          if (candCount === 0) tags.push('quiet round: nothing detected');
          if (candCount > 0 && selType(b).length === 0) tags.push('moments detected, none good enough for Balanced');
          for (const t of selType(b)) tags.push(`Balanced selects ${t}${snap.special ? ' (special event)' : ''}${snap.isFinal ? ' (final round)' : ''}`);
          if (b.some((d) => d.suppressed.some((s) => s.reason === 'suppressed_cap' && /:(ACE|ALBATROSS):/.test(s.momentId)))) tags.push('exceptional event suppressed by the Balanced cap');
          if (selType(f).length === 2) tags.push('Full TV uses both slots');
          if (mode === 'key' && b.some((d) => d.q - d.p > 1 && d.candidates.length > 1)) tags.push('key mode: several holes revealed at once');
          if (b.some((d) => d.candidates.some((c) => c.moment.golferId === snap.rivalId))) tags.push('Kayla moment');
          if (b.some((d) => d.suppressed.some((s) => s.reason === 'gate'))) tags.push('relevance gate filters a moment');
          for (const tag of tags) {
            const r = reservoir.get(tag) ?? { seen: 0, items: [] };
            reservoir.set(tag, r);
            r.seen++;
            const slot = r.items.length < RESERVOIR ? r.items.length : rnd(r.seen);
            if (slot < RESERVOIR) {
              r.items[slot] = {
                why: tag,
                tournamentId: def.id,
                tour,
                special: snap.special,
                mode,
                round: `${snap.round + 1} of ${snap.rounds}`,
                boundaries: snap.boundaries,
                balanced: describePlan(b),
                fullTv: describePlan(f),
              };
            }
          }
        }
        for (const v of VARIANTS) {
          const e = (stats[v].perEvent[`${tour}/${def.special ? 'special' : 'regular'}`] ??= { events: 0, highlights: 0, none: 0 });
          e.events++;
          e.highlights += perT[v] ?? 0;
          if (!perT[v]) e.none++;
        }
      }
    }
  }

  const preferred = [
    'quiet round: nothing detected',
    'moments detected, none good enough for Balanced',
    'Balanced selects LEAD_CHANGE (final round)',
    'Balanced selects EAGLE (special event) (final round)',
    'Balanced selects ACE',
    'exceptional event suppressed by the Balanced cap',
    'Full TV uses both slots',
    'key mode: several holes revealed at once',
    'Kayla moment',
    'relevance gate filters a moment',
  ];
  // One per kind; each from a different round, spreading tours as evenly as possible.
  const examples: ExampleRound[] = [];
  const usedRounds = new Set<string>();
  const tourUse: Record<string, number> = {};
  const roundKey = (e: ExampleRound) => `${e.mode}:${e.tournamentId}:${e.round}`;
  for (const tag of preferred) {
    const items = (reservoir.get(tag)?.items ?? []).filter((e) => !usedRounds.has(roundKey(e)));
    items.sort((a, b) => (tourUse[a.tour] ?? 0) - (tourUse[b.tour] ?? 0));
    const pick = items[0];
    if (!pick) continue;
    examples.push(pick);
    usedRounds.add(roundKey(pick));
    tourUse[pick.tour] = (tourUse[pick.tour] ?? 0) + 1;
  }

  const out = (v: Variant) => {
    const st = stats[v];
    const selected = Object.values(st.selectedByType).reduce((a, b) => a + b, 0);
    const pct = (n: number) => (selected ? +((100 * n) / selected).toFixed(2) : 0);
    return {
      overall: summarise(st.all),
      byContext: Object.fromEntries(Object.entries(st.byContext).map(([k, b]) => [k, summarise(b)])),
      perEvent: Object.fromEntries(Object.entries(st.perEvent).map(([k, e]) => [k, { events: e.events, highlightsPerEvent: +(e.highlights / e.events).toFixed(3), pctEventsWithNone: +((100 * e.none) / e.events).toFixed(2) }])),
      shares: {
        kaylaPct: pct(st.selectedKayla),
        leadChangePct: pct(st.selectedByType.LEAD_CHANGE ?? 0),
        finalRoundPct: pct(st.selectedFinalRound),
        lastThreeHolesPct: pct(st.selectedLastThreeHoles),
      },
      byTour: Object.fromEntries(Object.entries(st.byTour).map(([k, b]) => [k, summarise(b)])),
      byImportance: { special: summarise(st.byImportance.special), regular: summarise(st.byImportance.regular) },
      byRound: { final: summarise(st.byRound.final), notFinal: summarise(st.byRound.notFinal) },
      byMode: Object.fromEntries(Object.entries(st.byMode).map(([k, b]) => [k, summarise(b)])),
      byTourAndMode: Object.fromEntries(Object.entries(st.byTourMode).map(([k, b]) => [k, summarise(b)])),
      selectedByType: st.selectedByType,
      selectedKayla: st.selectedKayla,
      suppressedByReason: st.suppressed,
      eligibleSuppressedByCap: st.eligibleSuppressedByCap,
      eligibleSuppressedByCapByType: st.eligibleSuppressedByCapByType,
      exceptionalSuppressedByCap: st.exceptionalSuppressedByCap,
      exceptionalSuppressedAfterNonExceptionalSelection: st.exceptionalSuppressedAfterNonExceptional,
    };
  };

  return {
    about: {
      tool: 'tools/cutins-lab/rates.ts (CI-1, developer only)',
      sample: `Every scheduled event of every tour in seasons 1-${seasons}, in ${modes.join(' and ')} mode`,
      ryanModel: `Ryan's stats set to a mid-field level per tour (${JSON.stringify(RYAN_LEVEL)}); her played holes take her own simulated scores`,
      kaylaModel: 'Kayla placed on the same tour as each event, at the same mid-field rating',
      holesPerRound: 9,
      revision: 'CI-1 Revision 3 (Balanced = B2 + K2 + M3, Full TV = C3 + K2 + M3)',
      capsPerContext: Object.fromEntries((['balanced', 'fullTv', 'off'] as ProfileId[]).map((p) => [p, Object.fromEntries((['regEarly', 'regFinal', 'spcEarly', 'spcFinal'] as const).map((c) => [c, capFor(p, c, 9)]))])),
      thresholdsPerContext: { balanced: PROFILES.balanced.threshold, fullTv: PROFILES.fullTv.threshold },
      note: "balancedOverride is informational only: the exceptional override is OFF (Decision B).",
    },
    totals: {
      tournamentsSimulated: tournaments,
      roundsSimulated: roundsEvaluated + roundsWithoutBoundaries,
      roundsEvaluated,
      roundsWithoutBoundaries: { count: roundsWithoutBoundaries, why: 'Ryan missed the cut, so the field finishes without boundaries' },
      boundariesEvaluated: boundaries,
      tours: Object.fromEntries(TOURS_ALL.map((t) => [t, { rounds: TOURS[t].rounds }])),
    },
    momentsDetected: { byType: detected, kaylaByType: detectedKayla },
    balanced: out('balanced'),
    fullTv: out('fullTv'),
    off: out('off'),
    balancedOverrideInformational: out('balancedOverride'),
    revision2Reference: REVISION2_REFERENCE,
    examples,
  };
}

export async function main(args: string[] = []) {
  const t0 = Date.now();
  if (args.includes('--digest')) {
    const d = computeDigests();
    console.log(`CI-1 Revision 3 digests over ${d.rounds} rounds: balanced ${d.balanced}, fullTv ${d.fullTv} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    return d;
  }
  const t1 = Date.now();
  const digests = computeDigests();
  const rates = { ...computeRates(), digests: { ...digests, seconds: (Date.now() - t1) / 1000 } };
  const dir = join(process.cwd(), 'cutins-lab-output');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'rates.json'), JSON.stringify({ ...rates, runtimeSeconds: (Date.now() - t0) / 1000 }, null, 2));
  console.log(`rates.json: ${rates.totals.tournamentsSimulated} tournaments, ${rates.totals.roundsEvaluated} rounds evaluated, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}
