/**
 * Desert Palms greyhound racing: six dogs, 500 yards, win bets.
 *
 * v0.13.2 (dynamic race cards):
 *   - A roster of 36 named greyhounds, each with a persistent id and ratings:
 *     `speed` (top speed, yd/s), `early` (acceleration out of the boxes),
 *     `stamina` (holding speed late), `consistency` (how steady its stride is),
 *     a hidden base `form`, and a running `style`.
 *   - Each NEW race card draws six distinct dogs from the card seed, in random
 *     traps, and sets each dog's current form for the day (its base form plus a
 *     seeded swing). The card is the seed: same seed, same six dogs, same traps,
 *     same form, same odds.
 *   - The race runs in fixed ticks of 0.05 s. Each tick a dog accelerates toward
 *     a target speed: top speed, times its form for the day, times its running
 *     style's push for that part of the race, less a fatigue fade after 300 yards
 *     that stamina reduces, times a slow-changing seeded stride variation (smaller
 *     for consistent dogs). Leads change and finishes are close; nothing picks a
 *     winner for drama.
 *   - `frames` records every dog's position each tick until the last dog
 *     finishes. The screen only ever draws these positions.
 *   - Odds come from the same model: each card is raced SIMS times with a fixed
 *     seed, and a dog's price is its fair price less HOUSE_MARGIN, on a standard
 *     fractional ladder (odds-on through 30-1), never paying more than the
 *     margin allows.
 *
 * Races bet before v0.13.2 keep their own model (the `V1` functions below) so a
 * saved bet replays and pays exactly as it was bet.
 */
import { cryptoInt, seededInt, type RandomInt } from './random';

export const TRACK_YARDS = 500;
export const TICK = 0.05;
export const LANES = 6;
export const GREYHOUND_LIMITS = { min: 5, max: 500 };
/** The casino's margin on every price (configurable). 0.15 = prices pay 85% of fair. */
export const HOUSE_MARGIN = 0.15;
/** Simulated runs used to price a card. */
export const SIMS = 1500;
/** Lane colours (the Desert Palms race board): 1 red, 2 blue, 3 white, 4 yellow, 5 orange, 6 green. Colours belong to the lane, not the dog. */
export const TRAP_COLORS = ['#d7262e', '#2c63d6', '#f2f2f2', '#f2c230', '#f07c1e', '#2e9e46'];
export const TRAP_INK = ['#fff', '#fff', '#111', '#111', '#fff', '#fff'];

export type RunningStyle = 'fast_starter' | 'closer' | 'front_runner' | 'wildcard' | 'mid_surge' | 'stayer';
export const STYLE_LABEL: Record<RunningStyle, string> = {
  fast_starter: 'Fast starter, can fade',
  closer: 'Slow away, strong finish',
  front_runner: 'Steady front-runner',
  wildcard: 'Unpredictable',
  mid_surge: 'Kicks mid-race',
  stayer: 'Stays all day',
};

export interface Greyhound {
  /** Persistent roster id. */
  id: string;
  name: string;
  speed: number;
  early: number;
  stamina: number;
  consistency: number;
  /** Hidden base form (0–1). */
  form: number;
  style: RunningStyle;
}

/** A dog on today's card: its form for the day is set by the card seed. */
export interface Entrant extends Greyhound {
  formNow: number;
}

const S: Record<string, RunningStyle> = { F: 'fast_starter', C: 'closer', R: 'front_runner', W: 'wildcard', M: 'mid_surge', T: 'stayer' };
const slug = (n: string) => n.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

/** The roster: 36 fictional racing dogs (names only, no story roles). The first six are the Desert Palms originals. */
export const ROSTER: Greyhound[] = ([
  // name, speed, early, stamina, consistency, form, style
  ['Dusty Trail', 17.9, 0.7, 0.9, 0.7, 0.6, 'T'],
  ['Velvet Rocket', 18.3, 0.8, 0.5, 0.6, 0.6, 'F'],
  ['Palm Springs Pete', 18.0, 0.5, 0.7, 0.8, 0.6, 'R'],
  ['Sandstorm Sally', 18.4, 0.7, 0.6, 0.5, 0.6, 'M'],
  ['Coyote Ugly', 18.0, 0.8, 0.6, 0.3, 0.6, 'W'],
  ['Snake Eyes', 17.8, 0.4, 0.8, 0.6, 0.6, 'C'],
  ['Mirage Runner', 18.1, 0.6, 0.8, 0.6, 0.5, 'T'],
  ['Cactus Jack', 17.8, 0.9, 0.5, 0.5, 0.6, 'F'],
  ['Neon Comet', 18.6, 0.4, 0.4, 0.3, 0.6, 'W'],
  ['Jackpot Jo', 17.7, 0.6, 0.8, 0.6, 0.5, 'C'],
  ['Sidewinder', 18.2, 0.9, 0.3, 0.5, 0.6, 'F'],
  ['Tumbleweed', 17.5, 0.5, 0.9, 0.8, 0.5, 'T'],
  ['Mojave Max', 18.0, 0.6, 0.6, 0.7, 0.5, 'R'],
  ['Lucky Seven', 17.8, 0.7, 0.7, 0.4, 0.7, 'M'],
  ['High Roller', 18.5, 0.5, 0.5, 0.5, 0.5, 'C'],
  ['Sunset Strip', 17.9, 0.8, 0.7, 0.7, 0.4, 'R'],
  ['Dune Buggy', 17.6, 0.9, 0.6, 0.5, 0.6, 'F'],
  ['Oasis Belle', 18.1, 0.5, 0.8, 0.6, 0.5, 'C'],
  ['Biscuit Bandit', 17.9, 0.7, 0.6, 0.5, 0.6, 'M'],
  ['Turbo Pickles', 18.4, 0.8, 0.4, 0.3, 0.5, 'W'],
  ['Sir Runs-a-Lot', 17.7, 0.5, 0.9, 0.8, 0.6, 'T'],
  ['Desert Lightning', 18.5, 0.9, 0.4, 0.5, 0.5, 'F'],
  ['Tax Write-Off', 17.4, 0.4, 0.6, 0.4, 0.4, 'W'],
  ['Nacho Average Dog', 17.6, 0.6, 0.6, 0.7, 0.5, 'R'],
  ['Midnight Zoomies', 18.3, 0.5, 0.7, 0.4, 0.6, 'C'],
  ['Lucky Left Paw', 17.8, 0.6, 0.7, 0.6, 0.7, 'M'],
  ['Double Down Dottie', 18.2, 0.7, 0.6, 0.5, 0.5, 'M'],
  ['Buffet Line Bob', 17.3, 0.4, 0.8, 0.7, 0.5, 'T'],
  ['Free Spin Fran', 18.0, 0.8, 0.5, 0.4, 0.6, 'F'],
  ['Comped Suite', 17.9, 0.6, 0.7, 0.8, 0.5, 'R'],
  ['Last Call Larry', 17.6, 0.3, 0.9, 0.6, 0.6, 'C'],
  ['Neon Noodle', 18.1, 0.6, 0.5, 0.3, 0.6, 'W'],
  ['Valet Parker', 17.8, 0.8, 0.6, 0.7, 0.5, 'R'],
  ['Snack Attack', 17.7, 0.7, 0.6, 0.5, 0.7, 'M'],
  ['Waffle Iron', 17.5, 0.5, 0.8, 0.8, 0.5, 'T'],
  ['Mai Tai Monday', 18.2, 0.4, 0.7, 0.5, 0.6, 'C'],
] as [string, number, number, number, number, number, string][]).map(([name, speed, early, stamina, consistency, form, st]) => ({
  id: slug(name), name, speed, early, stamina, consistency, form, style: S[st],
}));

export const dogById = (id: string) => ROSTER.find((d) => d.id === id);

export interface RaceCard {
  /** Card seed: which six dogs, in which traps, at what form. */
  seed: number;
  dogs: Entrant[];
  /** Fractional odds per trap, [numerator, denominator]: a winning $d bet returns d + d × num / den. */
  odds: [number, number][];
  /** Model the card belongs to (2 = dynamic cards, v0.13.2). */
  v?: 1 | 2;
}

export interface RaceResult {
  seed: number;
  /** Trap indexes 0–5, winner first. */
  order: number[];
  /** Seconds to the line, per trap. */
  times: number[];
  /** Yards run per tick, per trap (capped at the finish line). */
  frames: number[][];
}

/** Six different dogs from the roster in random traps, with today's form, all from the card seed. */
export function drawCard(seed: number): Omit<RaceCard, 'odds'> {
  const rand = seededInt(seed);
  const pool = [...ROSTER];
  const dogs: Entrant[] = [];
  for (let i = 0; i < LANES; i++) {
    const d = pool.splice(rand(pool.length), 1)[0];
    // Today's form: the hidden base form, swung up to ±0.25 by the card seed.
    const swing = (rand(1001) / 1000 - 0.5) * 0.5;
    dogs.push({ ...d, formNow: Math.max(0, Math.min(1, d.form + swing)) });
  }
  return { seed, dogs, v: 2 };
}

/** How hard a running style pushes at a point in the race (share of the way, 0–1). */
function stylePush(style: RunningStyle, p: number): number {
  switch (style) {
    case 'fast_starter': return p < 0.4 ? 1.02 : p > 0.6 ? 0.985 : 1;
    case 'closer': return p < 0.4 ? 0.985 : p > 0.62 ? 1.02 : 1;
    case 'front_runner': return p < 0.7 ? 1.008 : 0.997;
    case 'mid_surge': return p > 0.35 && p < 0.7 ? 1.018 : 0.994;
    case 'stayer': return p > 0.7 ? 1.012 : 0.997;
    default: return 1;
  }
}

/**
 * Race tuning (measured over 1,200 races on 30 cards): favourites win about a third of the
 * time and the longest price about 1 in 20, like a real track. Field-average top speed, how
 * much of a dog's rating edges count (SPREAD for break/stamina, SPEED_SPREAD for top speed),
 * and stride variation.
 */
const BASE_SPEED = 18;
const SPREAD = 0.6;
const SPEED_SPREAD = 0.4;
const SURGE = 0.08;

/** Runs one race. Same entrants and seed: the same race, frame for frame. */
export function runRace(dogs: Entrant[], seed: number): RaceResult {
  const rand = seededInt(seed);
  const u = () => rand(1_000_000) / 1_000_000;
  const n = dogs.length;
  const pos = new Array(n).fill(0);
  const vel = new Array(n).fill(0);
  const times: (number | null)[] = new Array(n).fill(null);
  // Ratings count toward the field average (SPREAD), so any dog can win on its day.
  const eff = (x: number) => 0.6 + (x - 0.6) * SPREAD;
  // Break from the boxes: a reaction delay (better breakers are quicker; closers are slow away).
  const delay = dogs.map((d) => 0.05 + (1 - eff(d.early)) * 0.25 + (d.style === 'closer' ? 0.05 : 0) + u() * 0.2);
  const surge = dogs.map(() => 0);
  const frames: number[][] = [pos.slice()];
  let t = 0;
  while (times.some((x) => x === null) && t < 120) {
    t += TICK;
    for (let i = 0; i < n; i++) {
      if (times[i] !== null) continue;
      const d = dogs[i];
      // Slow-changing stride variation: wilder for inconsistent dogs and wildcards.
      const wild = (1.2 - d.consistency) * (d.style === 'wildcard' ? 1.7 : 1);
      surge[i] = surge[i] * 0.97 + (u() - 0.5) * SURGE * wild;
      const stamina = Math.min(1, eff(d.stamina) + (d.style === 'stayer' ? 0.08 : 0));
      const fade = pos[i] > 300 ? ((pos[i] - 300) / 200) * (1 - stamina) * 1.6 : 0;
      const formMul = 1 + (d.formNow - 0.55) * 0.025;
      // Ratings are compressed toward the field average so any dog can win on its day.
      const top = (BASE_SPEED + (d.speed - BASE_SPEED) * SPEED_SPREAD) * formMul * stylePush(d.style, pos[i] / TRACK_YARDS);
      const target = t < delay[i] ? 0 : Math.max(8, top * (1 + surge[i]) - fade);
      const accel = 7 + eff(d.early) * 5 + (d.style === 'fast_starter' ? 0.8 : 0);
      // Speeding up and easing off at the same rate: stride variation is luck, not an edge
      // (with a slower ease-off, the most erratic dogs would keep their surges and win too often).
      vel[i] = vel[i] < target ? Math.min(target, vel[i] + accel * TICK) : Math.max(target, vel[i] - accel * TICK);
      const next = pos[i] + vel[i] * TICK;
      if (next >= TRACK_YARDS) {
        times[i] = t - TICK + ((TRACK_YARDS - pos[i]) / (next - pos[i])) * TICK;
        pos[i] = TRACK_YARDS;
      } else pos[i] = next;
    }
    frames.push(pos.slice());
  }
  const finals = times.map((x) => x ?? Infinity);
  const order = finals.map((_, i) => i).sort((a, b) => finals[a] - finals[b] || a - b);
  return { seed, order, times: finals, frames };
}

/** Fractional prices, shortest first: odds-on, Evens, then the usual track prices to 30-1. */
export const ODDS_LADDER: [number, number][] = [
  [1, 5], [1, 4], [2, 7], [1, 3], [2, 5], [1, 2], [4, 7], [8, 13], [4, 6], [8, 11], [4, 5], [10, 11],
  [1, 1], [6, 5], [5, 4], [11, 8], [3, 2], [13, 8], [7, 4], [15, 8], [2, 1], [9, 4], [5, 2], [11, 4], [3, 1], [10, 3], [7, 2], [4, 1], [9, 2], [5, 1],
  [11, 2], [6, 1], [13, 2], [7, 1], [15, 2], [8, 1], [9, 1], [10, 1], [12, 1], [14, 1], [15, 1], [16, 1], [20, 1], [25, 1], [30, 1],
];

/** Win chances for a card from SIMS runs of the same model (with a fixed seed). */
export function winChances(card: Omit<RaceCard, 'odds'>, sims = SIMS): number[] {
  const wins = new Array(LANES).fill(0);
  for (let s = 0; s < sims; s++) wins[runRace(card.dogs, card.seed * 7919 + s + 1).order[0]]++;
  return wins.map((w) => Math.max(w, 1) / sims);
}

/** The longest ladder price that pays no more than fair less the margin. */
export function priceFor(p: number, margin = HOUSE_MARGIN): [number, number] {
  const decimal = (1 / p) * (1 - margin); // stake included
  let best: [number, number] = ODDS_LADDER[0];
  for (const o of ODDS_LADDER) if (1 + o[0] / o[1] <= decimal) best = o;
  return best;
}

/** Prices a card: fair odds from the race model, less the house margin. */
export function priceCard(card: Omit<RaceCard, 'odds'>, sims = SIMS): RaceCard {
  return { ...card, odds: winChances(card, sims).map((p) => priceFor(p)) };
}

/** Same six dogs in any order? (Used to avoid running the same field twice in a row.) */
export const sameField = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

/** A new card seed whose field differs from the last card's, if one is given. */
export function newCardSeed(lastIds: string[] = [], rand: RandomInt = cryptoInt): number {
  for (;;) {
    const seed = rand(2_000_000_000);
    if (!lastIds.length || !sameField(drawCard(seed).dogs.map((d) => d.id), lastIds)) return seed;
  }
}

export const newRaceCard = (seed: number = newCardSeed()): RaceCard => priceCard(drawCard(seed));
export const newRaceSeed = (rand: RandomInt = cryptoInt) => rand(2_000_000_000);

/** What a winning bet returns, stake included (rounded down to the dollar). */
export const winReturn = (stake: number, [num, den]: [number, number]) => Math.floor(stake + (stake * num) / den);
/** The most any win bet can return per dollar staked. */
export const MAX_WIN_RETURN = 1 + 30;

export const oddsLabel = ([num, den]: [number, number]) => (num === den ? 'Evens' : `${num}-${den}`);

export function betBlocker(stake: number, balance: number): string | null {
  if (!Number.isInteger(stake) || stake < GREYHOUND_LIMITS.min) return `Minimum bet $${GREYHOUND_LIMITS.min}`;
  if (stake > GREYHOUND_LIMITS.max) return `Maximum bet $${GREYHOUND_LIMITS.max}`;
  if (stake > balance) return 'Not enough in the bank';
  return null;
}

/** A race that has been bet on and decided, kept on the career until it is paid (survives reloads). */
export interface PendingRace {
  roundId: string;
  cardSeed: number;
  raceSeed: number;
  trap: number;
  stake: number;
  odds: [number, number];
  /** 2 for v0.13.2 cards; missing on races bet before (they replay with the V1 model). */
  v?: 2;
}

/** The card a saved bet was placed on, in its own model. */
export function cardForPending(p: Pick<PendingRace, 'cardSeed' | 'v'>): Omit<RaceCard, 'odds'> {
  if (p.v === 2) return drawCard(p.cardSeed);
  const old = drawCardV1(p.cardSeed);
  return { seed: old.seed, v: 1, dogs: old.dogs.map((d) => ({ ...d, id: slug(d.name), consistency: 1 - d.form, style: 'wildcard' as RunningStyle, formNow: d.form })) };
}

/** Runs a saved bet's race in its own model. */
export function raceForPending(p: Pick<PendingRace, 'cardSeed' | 'raceSeed' | 'v'>): RaceResult {
  return p.v === 2 ? runRace(drawCard(p.cardSeed).dogs, p.raceSeed) : runRaceV1(drawCardV1(p.cardSeed).dogs, p.raceSeed);
}

/** One line of the recent-races board (the last 10 are kept on the career). */
export interface RaceHistoryEntry {
  roundId: string;
  season: number;
  week: number;
  /** Names in finishing order, with their trap (0–5) and time. */
  order: { name: string; trap: number; time: number }[];
  pick: { name: string; trap: number };
  stake: number;
  odds: [number, number];
  payout: number;
}
export const HISTORY_SIZE = 10;

// ───────────────────────── v0.13.1 model (legacy saved races only) ─────────────────────────

/** v0.13.1 dog (kept so races bet before v0.13.2 replay exactly). */
export interface GreyhoundV1 {
  name: string;
  speed: number;
  early: number;
  stamina: number;
  form: number;
}

/** The v0.13.1 kennel, unchanged (legacy races only). */
export const KENNEL_V1: GreyhoundV1[] = [
  ['Sandstorm Sally', 18.4, 0.8, 0.6, 0.5],
  ['Mirage Runner', 18.1, 0.6, 0.8, 0.4],
  ['Cactus Jack', 17.8, 0.9, 0.5, 0.6],
  ['Palm Springs Pete', 18.0, 0.5, 0.7, 0.3],
  ['Neon Comet', 18.6, 0.4, 0.4, 0.7],
  ['Dusty Trail', 17.6, 0.7, 0.9, 0.4],
  ['Coyote Ugly', 17.9, 0.8, 0.6, 0.8],
  ['Velvet Rocket', 18.3, 0.7, 0.5, 0.5],
  ['Jackpot Jo', 17.7, 0.6, 0.8, 0.6],
  ['Sidewinder', 18.2, 0.9, 0.3, 0.6],
  ['Tumbleweed', 17.5, 0.5, 0.9, 0.3],
  ['Mojave Max', 18.0, 0.6, 0.6, 0.4],
  ['Lucky Seven', 17.8, 0.7, 0.7, 0.7],
  ['High Roller', 18.5, 0.5, 0.5, 0.5],
  ['Sunset Strip', 17.9, 0.8, 0.7, 0.4],
  ['Dune Buggy', 17.6, 0.9, 0.6, 0.6],
  ['Oasis Belle', 18.1, 0.5, 0.8, 0.5],
  ['Snake Eyes', 17.7, 0.6, 0.5, 0.8],
].map(([name, speed, early, stamina, form]) => ({ name: name as string, speed: speed as number, early: early as number, stamina: stamina as number, form: form as number }));

interface RaceCardV1 {
  /** Card seed: which six dogs, in which traps. */
  seed: number;
  dogs: GreyhoundV1[];
  /** Fractional odds per trap, [numerator, denominator]: a winning $d bet returns d + d × num / den. */
  odds: [number, number][];
}

/** v0.13.1: six different dogs from the old kennel, drawn from the card seed. */
export function drawCardV1(seed: number): Omit<RaceCardV1, 'odds'> {
  const rand = seededInt(seed);
  const pool = [...KENNEL_V1];
  const dogs: GreyhoundV1[] = [];
  for (let i = 0; i < LANES; i++) dogs.push(pool.splice(rand(pool.length), 1)[0]);
  return { seed, dogs };
}

/** v0.13.1 race model, unchanged. */
export function runRaceV1(dogs: GreyhoundV1[], seed: number): RaceResult {
  const rand = seededInt(seed);
  const u = () => rand(1_000_000) / 1_000_000;
  const n = dogs.length;
  const pos = new Array(n).fill(0);
  const vel = new Array(n).fill(0);
  const times: (number | null)[] = new Array(n).fill(null);
  // Break from the boxes: a reaction delay (better breakers are quicker and steadier).
  const delay = dogs.map((d) => 0.05 + (1 - d.early) * 0.25 + u() * 0.2);
  const surge = dogs.map(() => 0);
  const frames: number[][] = [pos.slice()];
  let t = 0;
  while (times.some((x) => x === null) && t < 120) {
    t += TICK;
    for (let i = 0; i < n; i++) {
      if (times[i] !== null) continue;
      const d = dogs[i];
      // Slow-changing stride variation (the source of passing and lead changes).
      surge[i] = surge[i] * 0.97 + (u() - 0.5) * 0.06 * (0.6 + d.form);
      const fade = pos[i] > 300 ? ((pos[i] - 300) / 200) * (1 - d.stamina) * 1.6 : 0;
      const target = t < delay[i] ? 0 : Math.max(8, d.speed * (1 + surge[i]) - fade);
      const accel = 7 + d.early * 5;
      vel[i] = vel[i] < target ? Math.min(target, vel[i] + accel * TICK) : Math.max(target, vel[i] - 3 * TICK);
      const next = pos[i] + vel[i] * TICK;
      if (next >= TRACK_YARDS) {
        times[i] = t - TICK + ((TRACK_YARDS - pos[i]) / (next - pos[i])) * TICK;
        pos[i] = TRACK_YARDS;
      } else pos[i] = next;
    }
    frames.push(pos.slice());
  }
  const finals = times.map((x) => x ?? Infinity);
  const order = finals.map((_, i) => i).sort((a, b) => finals[a] - finals[b] || a - b);
  return { seed, order, times: finals, frames };
}

