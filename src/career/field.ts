/**
 * The people Ryan competes against: persistent player pools per tour (so the
 * same names and rivals recur), and a statistical hole model for simulated golf.
 */
import { rng, type Rng } from '../golf/math';
import { PLAYER_ID, TOURS, type TourId } from './config';
import type { PoolGolfer } from './types';

/** Women's names: Kayla's tours (and Ryan's ladder from phase 3, which isn't built yet). */
const FIRST = [
  'Ava', 'Mia', 'Sofia', 'Lena', 'Maya', 'Zoe', 'Nora', 'Ella', 'Chloe', 'Ivy', 'Hana', 'Yuna', 'Mei', 'Priya', 'Ana', 'Lucia', 'Elise', 'Greta',
  'Freya', 'Ingrid', 'Camila', 'Valentina', 'Riley', 'Jordan', 'Sky', 'Tess', 'Brooke', 'Paige', 'Kendra', 'Dani', 'Marisol', 'Noor', 'Leilani',
  'Aiko', 'Soo-ah', 'Minji', 'Thao', 'Imani', 'Keira', 'Sienna', 'Harper', 'Quinn', 'Rosa', 'Julia', 'Astrid', 'Beatriz', 'Cleo', 'Dahlia',
];
const LAST = [
  'Alvarez', 'Bennett', 'Castillo', 'Delgado', 'Ellison', 'Fairbanks', 'Garza', 'Hollis', 'Ibarra', 'Jansen', 'Kowalski', 'Lindqvist', 'Moreau',
  'Nakamura', 'Okafor', 'Petrova', 'Quintero', 'Ramsey', 'Sato', 'Thornton', 'Ueda', 'Valdez', 'Whitlock', 'Xu', 'Yamada', 'Zielinski', 'Arden',
  'Blake', 'Cortez', 'Dunmore', 'Everly', 'Finch', 'Grayson', 'Hayward', 'Iwata', 'Jun', 'Kaur', 'Lowell', 'Marsh', 'Navarro', 'Oyelaran',
  'Park', 'Reyes', 'Silva', 'Tanaka', 'Vance', 'Weller', 'Young',
];

/** Men's tours use these first names (original, generic; no real golfers). */
const MALE_FIRST = [
  'Liam', 'Noah', 'Mateo', 'Ethan', 'Lucas', 'Owen', 'Caleb', 'Diego', 'Marcus', 'Jamal', 'Kenji', 'Hiro', 'Arjun', 'Rohan', 'Tomas', 'Andre',
  'Felix', 'Henrik', 'Lars', 'Mikael', 'Rafael', 'Santiago', 'Tyler', 'Connor', 'Brady', 'Cole', 'Garrett', 'Wes', 'Dante', 'Malik', 'Kai', 'Ren',
  'Minho', 'Jae', 'Duc', 'Femi', 'Kofi', 'Elias', 'Jonah', 'Silas', 'Theo', 'Hugo', 'Nico', 'Pablo', 'Callum', 'Rhys', 'Declan', 'Emeka',
];

/**
 * Until phase 3 every field Ryan plays is a men's field: the Amateur Circuit, the SoCal Pro Series
 * and the PGA ladder (PGA Tour Q-School, Korn Ferry Tour, PGA Tour). Owner, 2026-11-24.
 * Kayla Brooks only plays the women's tours, so she's never in Ryan's fields before phase 3: she
 * stays in the pools (for her rating and rival news) but is skipped in fields and money lists.
 * Phase 3 will need its own women's pools; the PGA-ladder pools were renamed to men's names.
 */
export const MENS_TOURS: ReadonlySet<TourId> = new Set<TourId>(['amateur', 'mini', 'qschool', 'epson', 'lpga']);
/** Kayla never sits in these pools (she's moved to her women's tour by rating). */
const NO_RIVAL_TOURS: ReadonlySet<TourId> = new Set<TourId>(['amateur', 'mini']);
/** Phase 3 (Acts III–IV) puts Ryan on the LPGA ladder: only the amateur and mini tours stay men's. */
export const isMensTour = (t: TourId, phase: 1 | 2 | 3 = 1) => (phase === 3 ? NO_RIVAL_TOURS.has(t) : MENS_TOURS.has(t));

export const RIVAL = { id: 'golfer_kayla_brooks', name: 'Kayla Brooks' };

/** The rival's tour for a rating: never a men's tour. */
export function rivalTourFor(rating: number): TourId {
  return rating >= 68 ? 'lpga' : rating >= 57 ? 'epson' : 'qschool';
}

const LEGACY_POOL_SIZES: Record<TourId, number> = { amateur: 40, mini: 45, qschool: 0, epson: 90, lpga: 110 };
/** Q-School hopefuls (added by reconcileFieldPools; men's names until phase 3). */
const QSCHOOL_POOL_SIZE = 45;

/**
 * The tour pools for a new career. Generated exactly as before (same draws, so the Epson and
 * LPGA pools and every rating are unchanged), then split into men's and women's fields by
 * reconcileFieldPools, which uses its own random stream.
 */
export function buildPools(seed = 2027, rules: PoolRules = 'current'): Record<TourId, PoolGolfer[]> {
  const pools = buildLegacyPools(seed);
  return reconcileFieldPools(pools, seed, rules) ?? pools;
}

/**
 * 'current': men's names on every tour Ryan plays (until phase 3). 'reference-v1': the pools the
 * frozen cut-in reference dataset was recorded with (men's names only on the amateur and mini
 * tours, women's Q-School hopefuls). Only tools/cutins-lab uses 'reference-v1'.
 */
export type PoolRules = 'current' | 'reference-v1';
const REFERENCE_MENS_TOURS: ReadonlySet<TourId> = new Set<TourId>(['amateur', 'mini']);

/** The original generator (one shared name list, Kayla on the amateur tour). */
function buildLegacyPools(seed: number): Record<TourId, PoolGolfer[]> {
  const r = rng(seed);
  const used = new Set<string>([RIVAL.name]);
  const name = () => {
    for (;;) {
      const n = `${FIRST[r.int(0, FIRST.length - 1)]} ${LAST[r.int(0, LAST.length - 1)]}`;
      if (!used.has(n)) {
        used.add(n);
        return n;
      }
    }
  };
  const pools = {} as Record<TourId, PoolGolfer[]>;
  let n = 0;
  for (const tour of ['amateur', 'mini', 'qschool', 'epson', 'lpga'] as TourId[]) {
    const cfg = TOURS[tour];
    pools[tour] = Array.from({ length: LEGACY_POOL_SIZES[tour] }, () => ({
      id: `golfer_${tour}_${++n}`,
      name: name(),
      // Skewed so most of the field is mid-pack and a few are elite.
      rating: Math.round(cfg.ratingMin + (cfg.ratingMax - cfg.ratingMin) * Math.pow(r.next(), 0.8)),
      tour,
    }));
  }
  pools.amateur.push({ id: RIVAL.id, name: RIVAL.name, rating: 40, tour: 'amateur' });
  return pools;
}

/**
 * Brings an older save's pools in line with the men's fields: renames women in the men's pools
 * (same ids and ratings, so records and money lists still match; Kayla keeps her name), adds the
 * Q-School pool if the save has none, and moves Kayla out of the amateur and mini pools. Returns null when
 * nothing needs changing. Deterministic for a save's seed.
 */
export function reconcileFieldPools(pools: Record<TourId, PoolGolfer[]>, seed: number, rules: PoolRules = 'current', phase: 1 | 2 | 3 = 1): Record<TourId, PoolGolfer[]> | null {
  // The women's ladder (reference pools, or Ryan's phase 3) keeps women's names on Q-School, Epson and LPGA.
  const womensLadder = rules === 'reference-v1' || phase === 3;
  const mens = womensLadder ? REFERENCE_MENS_TOURS : MENS_TOURS;
  const female = new Set(FIRST);
  const next = Object.fromEntries(Object.entries(pools).map(([k, v]) => [k, v.map((g) => ({ ...g }))])) as Record<TourId, PoolGolfer[]>;
  let changed = false;
  const used = new Set(Object.values(next).flat().map((g) => g.name));
  const r = rng(seed ^ 0x6e6d);
  const fresh = (list: string[]) => {
    for (;;) {
      const raw = `${list[r.int(0, list.length - 1)]} ${LAST[r.int(0, LAST.length - 1)]}`;
      const n = list === MALE_FIRST ? raw.replace(/ Petrova$/, ' Petrov') : raw;
      if (!used.has(n)) {
        used.add(n);
        return n;
      }
    }
  };
  // Kayla leaves the amateur and mini pools.
  for (const t of NO_RIVAL_TOURS) {
    const k = next[t]?.find((g) => g.id === RIVAL.id);
    if (k) {
      next[t] = next[t].filter((g) => g.id !== RIVAL.id);
      const tour = rivalTourFor(k.rating);
      next[tour] = [...(next[tour] ?? []), { ...k, tour }];
      changed = true;
    }
  }
  for (const t of mens) {
    for (const g of next[t] ?? []) {
      if (g.id !== PLAYER_ID && g.id !== RIVAL.id && female.has(g.name.split(' ')[0])) {
        g.name = fresh(MALE_FIRST);
        changed = true;
      }
      // Men's surname form (current rules only; the reference pools keep theirs).
      if (rules === 'current' && mens.has(t) && g.id !== PLAYER_ID && g.id !== RIVAL.id && / Petrova$/.test(g.name) && !female.has(g.name.split(' ')[0])) {
        const n = g.name.replace(/ Petrova$/, ' Petrov');
        if (!used.has(n)) {
          used.add(n);
          g.name = n;
          changed = true;
        }
      }
    }
  }
  if (!next.qschool || next.qschool.filter((g) => g.id !== RIVAL.id).length === 0) {
    const cfg = TOURS.qschool;
    const extra = Array.from({ length: QSCHOOL_POOL_SIZE }, (_, i) => ({
      id: `golfer_qs_${i + 1}`,
      name: fresh(womensLadder ? FIRST : MALE_FIRST),
      rating: Math.round(cfg.ratingMin + (cfg.ratingMax - cfg.ratingMin) * Math.pow(r.next(), 0.8)),
      tour: 'qschool' as TourId,
    }));
    next.qschool = [...(next.qschool ?? []), ...extra];
    changed = true;
  }
  return changed ? next : null;
}

/** Expected strokes over par per hole for a rating, before noise. */
export function holeExpectation(par: number, rating: number, windMph = 0): number {
  const base = 0.95 - 0.0125 * rating;
  const parAdj = par === 5 ? -0.28 : par === 3 ? 0.04 : 0.08;
  return base + parAdj + windMph * 0.012;
}

/**
 * Chance that a hole is finished three under par: a par 5 holed in two, or a
 * par 4 holed from the tee. Real tour golf sees roughly one per 20-40
 * thousand par 5s. Better players reach more par 5s in two, so it scales
 * with rating. Par 4 aces are rarer still. Par 3s can't be three under.
 */
export function holedLongShotChance(par: number, rating: number): number {
  const skill = Math.pow(2, (rating - 60) / 20);
  if (par === 5) return 2.4e-5 * skill;
  if (par === 4) return 1.2e-6 * skill;
  return 0;
}

/**
 * Which competitor model a tournament uses. 1: the original model, where a
 * par-3 ace came from the skill model's tail (about 1 in 135 on the LPGA).
 * 2: par-3 aces have their own chance (`aceChance`). Tournaments keep the
 * model they started with (`ActiveTournament.fieldModel`).
 */
export type FieldModel = 1 | 2;

/** Model 2 ace odds: 1 in 3,000 at rating 78 (National Hole-in-One Registry, tour players), doubling every 58 points. */
export const ACE_ANCHOR_RATING = 78;
export const ACE_ODDS_AT_ANCHOR = 3000;
export const ACE_DOUBLING_POINTS = 58;

/** Model 2: chance a par 3 is holed from the tee. About 1 in 5,000 at rating 35. */
export function aceChance(rating: number): number {
  return Math.pow(2, (rating - ACE_ANCHOR_RATING) / ACE_DOUBLING_POINTS) / ACE_ODDS_AT_ANCHOR;
}

/**
 * Simulated strokes on one hole. One hole, one outcome: first whether the
 * long shot drops (a rare outcome of its own), otherwise strokes from the
 * skill model, from eagle to quadruple bogey.
 *
 * Model 2 changes par 3s only: the first draw (unused on par 3s by model 1)
 * decides an ace, and the skill model's best par-3 score is a birdie. Both
 * models take exactly the same draws, so every other hole is unchanged.
 */
export function simHole(par: number, rating: number, r: Rng, windMph = 0, extra = 0, model: FieldModel = 1): number {
  const u = r.next();
  const holedLong = u < holedLongShotChance(par, rating);
  const mu = holeExpectation(par, rating, windMph) + extra;
  const sd = 0.62 + (100 - rating) * 0.003;
  const over = Math.round(mu + r.gauss() * sd);
  if (holedLong) return par - 3;
  if (model === 2 && par === 3) return u < aceChance(rating) ? 1 : par + Math.max(-1, Math.min(4, over));
  return Math.max(1, par + Math.max(-2, Math.min(4, over)));
}

export function simRound(pars: number[], rating: number, r: Rng, winds: number[], extra = 0, model: FieldModel = 1): number[] {
  return pars.map((p, i) => simHole(p, rating, r, winds[i] ?? 0, extra, model));
}

/**
 * Picks a tournament field from the tour pool (plus Ryan and, if he plays
 * the same tour, her rival). Deterministic for a seed.
 */
export function pickField(
  pool: PoolGolfer[],
  size: number,
  seed: number,
  ratingShift: number,
  extras: { id: string; name: string; rating: number }[],
): { id: string; name: string; rating: number }[] {
  const r = rng(seed);
  const taken = new Set(extras.map((e) => e.id));
  const shuffled = pool.filter((g) => !taken.has(g.id)).sort(() => r.next() - 0.5);
  const others = shuffled.slice(0, Math.max(0, size - extras.length)).map((g) => ({ id: g.id, name: g.name, rating: Math.max(5, Math.min(99, g.rating + ratingShift + Math.round(r.gauss() * 2))) }));
  return [...extras, ...others];
}

/** Season rollover: players improve or fade, and the best move up a tour. */
export function evolvePools(pools: Record<TourId, PoolGolfer[]>, seasonEarnings: Record<string, number>, seed: number) {
  const r = rng(seed);
  const next = Object.fromEntries(Object.entries(pools).map(([k, v]) => [k, v.map((g) => ({ ...g }))])) as Record<TourId, PoolGolfer[]>;
  for (const list of Object.values(next)) for (const g of list) if (g.id !== PLAYER_ID) g.rating = Math.max(5, Math.min(97, Math.round(g.rating + r.gauss() * 2 + 0.6)));
  // Top Korn Ferry earners graduate; the weakest PGA Tour players drop down.
  const earn = (tour: TourId, g: PoolGolfer) => seasonEarnings[`${tour}:${g.id}`] ?? 0;
  const up = [...next.epson].sort((a, b) => earn('epson', b) - earn('epson', a)).slice(0, 10);
  const down = [...next.lpga].sort((a, b) => earn('lpga', a) - earn('lpga', b)).slice(0, 10);
  next.epson = next.epson.filter((g) => !up.includes(g)).concat(down.map((g) => ({ ...g, tour: 'epson' as TourId })));
  next.lpga = next.lpga.filter((g) => !down.includes(g)).concat(up.map((g) => ({ ...g, tour: 'lpga' as TourId })));
  return next;
}

/** First-name lists by field (for tests and docs). */
export const FIRST_NAMES = { men: MALE_FIRST, women: FIRST } as const;

/**
 * Phase 3: Ryan's world moves to the LPGA ladder. Q-School, Epson and LPGA get fresh women's
 * pools (new ids, `w3_` prefix, so nothing collides with the PGA-ladder golfers they replace);
 * Kayla stays where she is; the amateur and mini pools are untouched.
 */
export function lpgaLadderPools(pools: Record<TourId, PoolGolfer[]>, seed: number): Record<TourId, PoolGolfer[]> {
  const women = buildPools(seed ^ 0x3a5e, 'reference-v1');
  const kayla = Object.values(pools).flat().find((g) => g.id === RIVAL.id);
  const next = { ...pools };
  for (const t of ['qschool', 'epson', 'lpga'] as const) {
    next[t] = (women[t] ?? []).filter((g) => g.id !== RIVAL.id && g.id !== PLAYER_ID).map((g) => ({ ...g, id: `w3_${g.id}`, tour: t }));
    if (kayla && kayla.tour === t) next[t] = [...next[t], kayla];
  }
  return next;
}
