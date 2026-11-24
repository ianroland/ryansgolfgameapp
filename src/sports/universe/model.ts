/**
 * Phase D part 3: the living sports universe. One save's leagues after the shared history
 * (1972-2026 plus the 2027 rosters): players age, develop, retire and are replaced every year.
 *
 * This file holds the player model and the yearly rules (development, retirement). The off-season
 * itself is in offseason.ts and the per-save chain of seasons in chain.ts. Everything is pure and
 * deterministic from (the previous state, the season's results, the save's sports seed).
 */
import { PEAK_AGE, overallFor, SPECS, type Player } from '../players';
import { leagueById, type LeagueId, type Sport } from '../demo';
import type { World } from '../season';
import { stream } from '../rng';
import { mapPositions } from '../history/rosters';
import type { HPlayer } from '../history/data';
import type { RecordEntry } from '../history/honors';
import type { StatLine } from '../history/stats';

export const LEAGUE_IDS: LeagueId[] = ['gdc', 'ccl', 'igl', 'fhl'];
export const sportOfLeague = (l: LeagueId): Sport => leagueById(l).sport;

export type DevKind = 'standard' | 'late_bloomer' | 'durable' | 'early_fade';

/** An active player (on a game roster or a reserve). */
export interface UPlayer {
  i: string;
  n: string;
  l: LeagueId;
  /** Position group as in the history data (baseball P/C/1B/2B/3B/SS/OF; basketball G/F/C; hockey C/LW/RW/D/G). */
  p: string;
  /** Birth year: age is always the season year minus this, never a stored counter. */
  b: number;
  /** First season in the league. */
  d: number;
  /** Franchise. Players stay with their team (no trades or free agency in this phase). */
  t: string;
  /** 1 = reserve: active but not on a game roster. */
  r: 0 | 1;
  /** Development profile: peak age and kind. */
  pk: number;
  k: DevKind;
  /** Current ability (overall points). */
  L: number;
  /** Ability and attributes when the attributes were set, and the engine position they were set for. */
  L0: number;
  e: string;
  a0: number[];
  /** Last off-season's change in ability. */
  dL: number;
  /** Draftees: [year, round, pick, overall], expected peak ability. */
  dr?: [number, number, number, number];
  pot?: number;
}

/** Career record for an active player: canon + 2026 + this save's seasons. */
export interface UCareer {
  /** Seasons played, titles, total season value, award bonus (the Hall of Fame score parts). */
  n: number;
  ti: number;
  v: number;
  bo: number;
  /** Regular-season totals for the record-book stats. */
  tot: StatLine;
  /** Awards won in this save's seasons. */
  aw?: string[];
}

export interface HofPending {
  i: string;
  n: string;
  l: LeagueId;
  /** Induction year, final season, seasons, score. */
  y: number;
  f: number;
  s: number;
  sc: number;
}

export interface RecordBook {
  game: RecordEntry[];
  season: RecordEntry[];
  career: RecordEntry[];
  team: RecordEntry[];
}

export interface UState {
  v: 1;
  /** The season year these players and rosters are for. */
  year: number;
  players: UPlayer[];
  rosters: Record<LeagueId, Record<string, string[]>>;
  careers: Record<string, UCareer>;
  pending: HofPending[];
  book: RecordBook;
  /** Team → championship years (canon and this save). */
  titles: Record<string, number[]>;
  /** Names created in this save (canon names are in the seed). */
  names: string[];
}

/** Shared inputs built from the history (universe2027.json). */
export interface UniverseSeed {
  note: string;
  start: UState;
  canonNames: string[];
  vocab: { first: string[]; last: string[] };
  debutAges: Record<LeagueId, number[]>;
  hazard: Record<LeagueId, [number, number][]>;
  composition: Record<LeagueId, Record<string, number>>;
  /** Hall of Fame statistical bar per league (score of the last career in the canon top 2.5%). */
  threshold: Record<LeagueId, number>;
  /** The canon class of 2027 (inducted before the first save season). */
  hof2027: { i: string; n: string; l: LeagueId; sc: number }[];
}

// ── Development ──
/** Growth per year below peak, years at peak, decline per year after (overall points). */
export const DEV: Record<Sport, { grow: number; plateau: number; decline: number }> = {
  basketball: { grow: 1.2, plateau: 2, decline: 1.1 },
  baseball: { grow: 1.0, plateau: 3, decline: 0.9 },
  football: { grow: 1.2, plateau: 1, decline: 1.3 },
  hockey: { grow: 1.2, plateau: 2, decline: 1.1 },
};
/** Profile shares: most players standard; a few late bloomers, durable veterans and early faders. */
export const DEV_KINDS: [DevKind, number][] = [['standard', 0.8], ['late_bloomer', 0.08], ['durable', 0.07], ['early_fade', 0.05]];
export function devKindFor(seed: number, id: string): DevKind {
  return DEV_KINDS[stream(seed, 'devkind', id).weighted(DEV_KINDS.map(([, w]) => w))][0];
}
export function peakFor(seed: number, sport: Sport, id: string): number {
  const [p0, p1] = PEAK_AGE[sport];
  return stream(seed, 'peak', id).int(p0, p1);
}

/**
 * Expected ability at an age relative to peak (0 at peak, negative before and after). Decline
 * speeds up from 33, so nobody stays good forever.
 */
export function curve(sport: Sport, kind: DevKind, peak: number, age: number): number {
  const c = DEV[sport];
  const pk = peak + (kind === 'late_bloomer' ? 2 : 0);
  const plateau = c.plateau + (kind === 'durable' ? 2 : 0);
  const decline = c.decline * (kind === 'durable' ? 0.6 : kind === 'early_fade' ? 1.5 : 1);
  if (age < pk) return -(pk - age) * c.grow * (kind === 'late_bloomer' ? 1.15 : 1);
  let v = 0;
  for (let a = pk + plateau + 1; a <= age; a++) v -= decline * (1 + Math.max(0, a - 33) * 0.2);
  return v;
}
/** Largest change in one off-season (no dramatic swings). */
export const MAX_RISE = 5;
export const MAX_DROP = 6;

/** One off-season of development, from the age at `fromYear` to the age at `toYear`. */
export function develop(p: UPlayer, fromYear: number, toYear: number, seed: number): { L: number; dL: number } {
  const sport = sportOfLeague(p.l);
  const expected = curve(sport, p.k, p.pk, toYear - p.b) - curve(sport, p.k, p.pk, fromYear - p.b);
  const noise = Math.max(-1.5, Math.min(1.5, stream(seed, 'develop', p.i, toYear).normal() * 0.7));
  const d = Math.max(-MAX_DROP, Math.min(MAX_RISE, expected + noise));
  const L = Math.round(Math.max(20, Math.min(99, p.L + d)) * 10) / 10;
  return { L, dL: Math.round((L - p.L) * 10) / 10 };
}

// ── Retirement ──
/** Only Mason Vale: his career end awaits an owner decision (Phase D part 2). */
export const PROTECTED: Record<string, string> = { igl_mason_vale: 'Bible legend still active; his career end awaits an owner decision (Phase D part 2).' };
/** Position wear: running backs leave sooner, quarterbacks and goalies later. */
const POSITION_RISK: Partial<Record<Sport, Record<string, number>>> = {
  football: { RB: 1.25, QB: 0.85, OL: 0.95 },
  hockey: { G: 0.85 },
  baseball: { P: 1.05 },
};
export interface RetireContext {
  /** Share of team games played (0 for reserves). */
  share: number;
  /** Ability rank within the team, 0 = best, 1 = worst. */
  rank: number;
  seasons: number;
}
export const hazardAt = (h: [number, number][], age: number) => {
  const hit = h.find(([a]) => a === age);
  if (hit) return hit[1];
  return age < h[0][0] ? 0.01 : 0.95;
};
/**
 * Chance of retiring after a season: the league's historical chance for the age (Phase D part 2),
 * adjusted for playing time, recent performance, career length, decline and position.
 * Everyone retires by 44.
 */
export function retireChance(p: UPlayer, age: number, ctx: RetireContext, hazard: [number, number][]): number {
  if (PROTECTED[p.i]) return 0;
  let m = 1;
  if (ctx.share < 0.3) m *= 1.5;
  else if (ctx.share > 0.8) m *= 0.85;
  if (ctx.rank > 0.66) m *= 1.25;
  else if (ctx.rank < 0.2) m *= 0.75;
  if (ctx.seasons >= 14) m *= 1.25;
  if (p.dL <= -1.5) m *= 1.3;
  m *= POSITION_RISK[sportOfLeague(p.l)]?.[p.p] ?? 1;
  let q = Math.min(0.95, hazardAt(hazard, age) * m);
  if (age >= 41) q = Math.max(q, 0.6);
  if (age >= 44) q = 1;
  return q;
}

// ── Engine players ──
const keysFor = (sport: Sport, pos: string) => Object.keys((SPECS[sport].find((s) => s.pos === pos) ?? SPECS[sport][0]).attrs);
/** The engine position a player's attributes are first set for. */
export const DEFAULT_ENGINE_POS: Record<Sport, Record<string, string>> = {
  baseball: { P: 'SP', C: 'C', '1B': '1B', '2B': '2B', '3B': '3B', SS: 'SS', OF: 'LF' },
  basketball: { G: 'PG', F: 'SF', C: 'C' },
  football: { QB: 'QB', RB: 'RB', WR: 'WR', TE: 'TE', OL: 'OL', DL: 'DL', LB: 'LB', DB: 'DB' },
  hockey: { C: 'C', LW: 'W', RW: 'W', D: 'D', G: 'G' },
};
const clampAttr = (v: number) => Math.max(25, Math.min(99, Math.round(v)));
export function attrsNow(p: UPlayer): Record<string, number> {
  const keys = keysFor(sportOfLeague(p.l), p.e);
  const shift = p.L - p.L0;
  return Object.fromEntries(keys.map((k, i) => [k, clampAttr(p.a0[i] + shift)]));
}

/** The season's world: every rostered player as an engine player, positions by ability. */
export function worldFromState(st: UState, seed: number): World {
  const byId = new Map(st.players.map((p) => [p.i, p]));
  const players: Player[] = [];
  for (const l of LEAGUE_IDS) {
    const sport = sportOfLeague(l);
    for (const team of Object.keys(st.rosters[l]).sort()) {
      const ranked = st.rosters[l][team].map((id) => byId.get(id)!).sort((a, b) => b.L - a.L || a.i.localeCompare(b.i));
      const pos = mapPositions(sport, ranked.map((p) => ({ p: { i: p.i, p: p.p } as HPlayer, lvl: p.L })));
      for (const p of ranked) {
        const ep = pos.get(p.i) ?? p.e;
        const attrs = attrsNow(p);
        const spec = SPECS[sport].some((s) => s.pos === ep) ? ep : SPECS[sport][0].pos;
        players.push({ id: p.i, teamId: team, name: p.n, sport, pos: ep, age: st.year - p.b, attrs, overall: overallFor(sport, spec, attrs), potential: Math.round(p.pot ?? p.L), peakAge: p.pk, tag: 'none', injuryGames: 0 });
      }
    }
  }
  return { seed, quality: {}, players };
}
