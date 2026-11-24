/**
 * Players for all four sports: identity, position, attributes, overall, hidden potential and
 * peak age, a personality tag, and injury status. Rosters are generated from per-sport specs;
 * development, aging and retirement come with the off-season (Phase 2c).
 */
import type { Sport } from './demo';
import { makeNameGen } from './names';
import type { Rng } from './rng';

export type BasketballPos = 'PG' | 'SG' | 'SF' | 'PF' | 'C';
export type PlayerTag = 'clutch' | 'streaky' | 'iron_man' | 'injury_prone' | 'leader' | 'hothead' | 'none';

export interface Player {
  id: string;
  teamId: string;
  name: string;
  sport: Sport;
  pos: string;
  age: number;
  /** Sport-specific attributes, 0-100 (see SPECS). */
  attrs: Record<string, number>;
  /** Shown to players (star rating comes from this). */
  overall: number;
  /** Hidden: development ceiling and the age it peaks. */
  potential: number;
  peakAge: number;
  tag: PlayerTag;
  /** Team games left to miss (0 = available). */
  injuryGames: number;
}

interface PosSpec {
  pos: string;
  count: number;
  /** Attribute weights for the overall (sum 1). Attributes are generated in this order. */
  attrs: Record<string, number>;
}

const BB = (shooting: number, inside: number, playmaking: number, rebounding: number, defense: number) => ({ shooting, inside, playmaking, rebounding, defense });
const HIT = (contact: number, power: number, discipline: number, speed: number, fielding: number) => ({ contact, power, discipline, speed, fielding });
const PIT = (velocity: number, control: number, stamina: number) => ({ velocity, control, stamina });
const FB = (skill: number, speed: number, strength: number, awareness: number) => ({ skill, speed, strength, awareness });
const SK = (skating: number, shooting: number, passing: number, checking: number) => ({ skating, shooting, passing, checking });

export const SPECS: Record<Sport, PosSpec[]> = {
  basketball: [
    { pos: 'PG', count: 2, attrs: BB(0.3, 0.1, 0.35, 0.05, 0.2) },
    { pos: 'SG', count: 2, attrs: BB(0.4, 0.15, 0.2, 0.05, 0.2) },
    { pos: 'SF', count: 2, attrs: BB(0.3, 0.2, 0.15, 0.15, 0.2) },
    { pos: 'PF', count: 2, attrs: BB(0.15, 0.3, 0.1, 0.25, 0.2) },
    { pos: 'C', count: 2, attrs: BB(0.05, 0.35, 0.05, 0.3, 0.25) },
  ],
  baseball: [
    { pos: 'C', count: 1, attrs: HIT(0.25, 0.2, 0.15, 0.05, 0.35) },
    { pos: '1B', count: 1, attrs: HIT(0.3, 0.35, 0.2, 0.05, 0.1) },
    { pos: '2B', count: 1, attrs: HIT(0.3, 0.1, 0.2, 0.15, 0.25) },
    { pos: '3B', count: 1, attrs: HIT(0.25, 0.3, 0.15, 0.05, 0.25) },
    { pos: 'SS', count: 1, attrs: HIT(0.25, 0.1, 0.15, 0.2, 0.3) },
    { pos: 'LF', count: 1, attrs: HIT(0.3, 0.3, 0.2, 0.1, 0.1) },
    { pos: 'CF', count: 1, attrs: HIT(0.3, 0.15, 0.15, 0.25, 0.15) },
    { pos: 'RF', count: 1, attrs: HIT(0.3, 0.3, 0.2, 0.1, 0.1) },
    { pos: 'DH', count: 1, attrs: HIT(0.35, 0.4, 0.25, 0, 0) },
    { pos: 'UT', count: 1, attrs: HIT(0.3, 0.2, 0.2, 0.15, 0.15) },
    { pos: 'SP', count: 4, attrs: PIT(0.45, 0.4, 0.15) },
    { pos: 'RP', count: 2, attrs: PIT(0.55, 0.45, 0) },
  ],
  football: [
    { pos: 'QB', count: 1, attrs: FB(0.55, 0.1, 0.05, 0.3) },
    { pos: 'RB', count: 2, attrs: FB(0.35, 0.35, 0.2, 0.1) },
    { pos: 'WR', count: 3, attrs: FB(0.45, 0.35, 0.05, 0.15) },
    { pos: 'TE', count: 1, attrs: FB(0.35, 0.15, 0.35, 0.15) },
    { pos: 'OL', count: 5, attrs: FB(0.2, 0.05, 0.55, 0.2) },
    { pos: 'DL', count: 4, attrs: FB(0.2, 0.15, 0.5, 0.15) },
    { pos: 'LB', count: 3, attrs: FB(0.25, 0.25, 0.25, 0.25) },
    { pos: 'DB', count: 4, attrs: FB(0.3, 0.4, 0.05, 0.25) },
    { pos: 'K', count: 1, attrs: FB(0.8, 0, 0.1, 0.1) },
  ],
  hockey: [
    { pos: 'C', count: 3, attrs: SK(0.25, 0.3, 0.35, 0.1) },
    { pos: 'W', count: 7, attrs: SK(0.3, 0.4, 0.2, 0.1) },
    { pos: 'D', count: 6, attrs: SK(0.25, 0.1, 0.2, 0.45) },
    { pos: 'G', count: 2, attrs: { reflexes: 0.55, positioning: 0.45 } },
  ],
};

export const PEAK_AGE: Record<Sport, [number, number]> = { basketball: [26, 29], baseball: [27, 30], football: [25, 28], hockey: [26, 29] };

const clamp = (v: number, lo = 25, hi = 99) => Math.max(lo, Math.min(hi, Math.round(v)));

export function overallFor(sport: Sport, pos: string, a: Record<string, number>): number {
  const spec = SPECS[sport].find((s) => s.pos === pos)!;
  return clamp(Object.entries(spec.attrs).reduce((s, [k, w]) => s + (a[k] ?? 0) * w, 0));
}

const TAGS: PlayerTag[] = ['clutch', 'streaky', 'iron_man', 'injury_prone', 'leader', 'hothead'];

/** A roster around the team's quality level; depth players a little weaker. */
export function generateRoster(sport: Sport, teamId: string, teamQuality: number, r: Rng, name: () => string, idBase: string, playerSpread: number): Player[] {
  const players: Player[] = [];
  let n = 0;
  for (const spec of SPECS[sport]) {
    const keys = Object.keys(spec.attrs);
    const even = 1 / keys.length;
    for (let k = 0; k < spec.count; k++) {
      const level = 60 + teamQuality + r.normal() * playerSpread - k * (spec.count > 2 ? 2.5 : 4);
      const attrs: Record<string, number> = {};
      // Strong where the position needs it, weaker elsewhere.
      for (const key of keys) attrs[key] = clamp(level + (spec.attrs[key] - even) * 40 + r.normal() * 6);
      const age = r.int(20, 34);
      const overall = overallFor(sport, spec.pos, attrs);
      const [p0, p1] = PEAK_AGE[sport];
      players.push({
        id: `${idBase}_${++n}`,
        teamId,
        name: name(),
        sport,
        pos: spec.pos,
        age,
        attrs,
        overall,
        potential: clamp(overall + Math.max(0, 27 - age) * r.int(0, 3), overall, 99),
        peakAge: r.int(p0, p1),
        tag: r.chance(0.35) ? r.pick(TAGS) : 'none',
        injuryGames: 0,
      });
    }
  }
  return players;
}

export { makeNameGen };
