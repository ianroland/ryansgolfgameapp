/**
 * Turns a historical team-season roster into engine players. Talent is seeded per player and
 * shaped by age (peak years) and by how good that team was that season, so strong teams have
 * strong players. Positions are mapped onto the engine's (baseball OF → LF/CF/RF, the four best
 * pitchers start, the best spare bat is the DH; basketball G/F → PG/SG/SF/PF; hockey LW/RW → W).
 * v0.4 football rosters have no kickers: kicks count for the team, credited to no one.
 */
import { SPORTS_CONFIG } from '../config';
import { leagueById, type Sport } from '../demo';
import { overallFor, PEAK_AGE, SPECS, type Player } from '../players';
import { stream } from '../rng';
import type { HistoryData, HPlayer, HSeason } from './data';

export const HISTORY_SEED = 19_721_974;

/** Legends play like legends: extra talent for the bible's named players (overall points). */
export const ANCHOR_BOOST: Record<string, number> = {
  gdc_elias_voss: 14, fhl_viktor_soren: 14, ccl_andre_bellamy: 16, ccl_darius_king: 12, ccl_leon_mercer: 12,
  gdc_marco_salazar: 8, igl_mason_vale: 10, fhl_owen_kessler: 8, ccl_calvin_redd: 4,
};
/** Fixed roster ranks for anchors in a season (1 = best). Calvin Redd was a reserve: first off the bench. */
export const ANCHOR_RANK: Record<string, Record<string, number>> = { 'ccl-1996': { ccl_calvin_redd: 6 } };
/**
 * Andre Bellamy was a four-time scoring champion before the 2008 trade: his scoring seasons
 * (a larger shot share). The tests check he leads the league in exactly these years.
 */
export const ANCHOR_USAGE: Record<string, Record<string, number>> = Object.fromEntries(
  [2002, 2003, 2005, 2007].map((y) => [`ccl-${y}`, { ccl_andre_bellamy: 1.9 }]),
);

/** Team strength in overall points from its record (a .750 team is about +8). */
export const STRENGTH: Record<Sport, number> = { baseball: 24, basketball: 34, football: 30, hockey: 28 };
/** Team strength from a record (overall points; 0 for a .500 team). */
export const offsetOf = (sport: Sport, [w, l]: [number, number]) => (w / Math.max(1, w + l) - 0.5) * STRENGTH[sport];
const clamp = (v: number, lo = 25, hi = 99) => Math.max(lo, Math.min(hi, Math.round(v)));

export function level(sport: Sport, p: HPlayer, year: number, teamOffset: number): number {
  const r = stream(HISTORY_SEED, 'talent', p.i);
  const talent = 60 + r.normal() * SPORTS_CONFIG.generation[sport].playerSpread + (ANCHOR_BOOST[p.i] ?? 0);
  const peakR = stream(HISTORY_SEED, 'peak', p.i);
  const [p0, p1] = PEAK_AGE[sport];
  const peak = peakR.int(p0, p1);
  const age = year - p.b;
  const agePenalty = age < peak ? (peak - age) * 1.2 : Math.max(0, age - peak - 2) * 1.0;
  return talent + teamOffset - agePenalty;
}

function attrsFor(sport: Sport, pos: string, lvl: number, id: string, year: number): Record<string, number> {
  const spec = SPECS[sport].find((s) => s.pos === pos) ?? SPECS[sport][0];
  const keys = Object.keys(spec.attrs);
  const even = 1 / keys.length;
  const r = stream(HISTORY_SEED, 'attrs', id, year);
  const attrs: Record<string, number> = {};
  for (const k of keys) attrs[k] = clamp(lvl + (spec.attrs[k as keyof typeof spec.attrs] - even) * 40 + r.normal() * 6);
  return attrs;
}

/** Engine positions for a roster, best players first within each group. */
function mapPositions(sport: Sport, ranked: { p: HPlayer; lvl: number }[]): Map<string, string> {
  const pos = new Map<string, string>();
  const by = (x: string[]) => ranked.filter((r) => x.includes(r.p.p));
  if (sport === 'baseball') {
    by(['P']).forEach((r, i) => pos.set(r.p.i, i < 4 ? 'SP' : 'RP'));
    const spare: typeof ranked = [];
    for (const infield of ['C', '1B', '2B', '3B', 'SS']) by([infield]).forEach((r, i) => (i === 0 ? pos.set(r.p.i, infield) : spare.push(r)));
    by(['OF']).forEach((r, i) => (i < 3 ? pos.set(r.p.i, ['LF', 'CF', 'RF'][i]) : spare.push(r)));
    spare.sort((a, b) => b.lvl - a.lvl).forEach((r, i) => pos.set(r.p.i, i === 0 ? 'DH' : 'UT'));
  } else if (sport === 'basketball') {
    by(['G']).forEach((r, i) => pos.set(r.p.i, i % 2 ? 'SG' : 'PG'));
    by(['F']).forEach((r, i) => pos.set(r.p.i, i % 2 ? 'PF' : 'SF'));
    by(['C']).forEach((r) => pos.set(r.p.i, 'C'));
  } else if (sport === 'hockey') {
    for (const r of ranked) pos.set(r.p.i, r.p.p === 'LW' || r.p.p === 'RW' ? 'W' : r.p.p);
  } else {
    for (const r of ranked) pos.set(r.p.i, r.p.p);
  }
  return pos;
}

/** Engine players for one team in one historical season. */
export function historyRoster(data: HistoryData, season: HSeason, teamId: string): Player[] {
  const sport = leagueById(season.league).sport;
  const offset = season.offsets?.[teamId] ?? offsetOf(sport, season.records[teamId]);
  const ranked = season.rosters[teamId].map((ix) => {
    const p = data.players[ix];
    return { p, lvl: level(sport, p, season.year, offset) };
  }).sort((a, b) => b.lvl - a.lvl || a.p.i.localeCompare(b.p.i));
  for (const [pid, rank] of Object.entries(ANCHOR_RANK[season.id] ?? {})) {
    const at = ranked.findIndex((x) => x.p.i === pid);
    if (at < 0) continue;
    const [me] = ranked.splice(at, 1);
    // Sit between the players ranked just above and below.
    const above = ranked[rank - 2]?.lvl ?? me.lvl + 1;
    const below = ranked[rank - 1]?.lvl ?? me.lvl - 1;
    me.lvl = (above + below) / 2;
    ranked.splice(rank - 1, 0, me);
  }
  const pos = mapPositions(sport, ranked);
  const players = ranked.map(({ p, lvl }) => {
    const ep = pos.get(p.i) ?? p.p;
    const attrs = attrsFor(sport, ep, lvl, p.i, season.year);
    const usage = ANCHOR_USAGE[season.id]?.[p.i];
    if (usage) attrs.usage = usage;
    return {
      id: p.i, teamId, name: p.n, sport, pos: ep, age: season.year - p.b, attrs,
      overall: overallFor(sport, SPECS[sport].some((s) => s.pos === ep) ? ep : SPECS[sport][0].pos, attrs),
      potential: 0, peakAge: 0, tag: 'none', injuryGames: 0,
    } satisfies Player;
  });
  // Fixed ranks also hold for the engine, which orders its rotation by overall rating.
  for (const [pid, rank] of Object.entries(ANCHOR_RANK[season.id] ?? {})) {
    const me = players.find((x) => x.id === pid);
    if (!me) continue;
    const others = players.filter((x) => x !== me).map((x) => x.overall).sort((a, b) => b - a);
    const above = others[rank - 2] ?? me.overall + 1;
    const below = others[rank - 1] ?? me.overall - 1;
    me.overall = (above + below) / 2 - (above === below ? 0.01 : 0);
  }
  return players;
}
