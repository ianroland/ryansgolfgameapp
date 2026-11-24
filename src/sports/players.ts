/**
 * Players: identity, attributes and status. Phase 2a generates basketball rosters; the other
 * sports, development, aging and retirement follow in later phases (same shapes).
 */
import { SPORTS_CONFIG } from './config';
import { makeNameGen } from './names';
import type { Rng } from './rng';

export type BasketballPos = 'PG' | 'SG' | 'SF' | 'PF' | 'C';
export type PlayerTag = 'clutch' | 'streaky' | 'iron_man' | 'injury_prone' | 'leader' | 'hothead' | 'none';

export interface BasketballAttrs {
  shooting: number;
  inside: number;
  playmaking: number;
  rebounding: number;
  defense: number;
}

export interface Player {
  id: string;
  teamId: string;
  name: string;
  sport: 'basketball';
  pos: BasketballPos;
  age: number;
  attrs: BasketballAttrs;
  /** Shown to players (star rating comes from this). */
  overall: number;
  /** Hidden: development ceiling and the age it peaks. */
  potential: number;
  peakAge: number;
  tag: PlayerTag;
  /** Team games left to miss (0 = available). */
  injuryGames: number;
}

/** Position emphasis: which attributes make a good player at each position. */
const WEIGHTS: Record<BasketballPos, BasketballAttrs> = {
  PG: { shooting: 0.3, inside: 0.1, playmaking: 0.35, rebounding: 0.05, defense: 0.2 },
  SG: { shooting: 0.4, inside: 0.15, playmaking: 0.2, rebounding: 0.05, defense: 0.2 },
  SF: { shooting: 0.3, inside: 0.2, playmaking: 0.15, rebounding: 0.15, defense: 0.2 },
  PF: { shooting: 0.15, inside: 0.3, playmaking: 0.1, rebounding: 0.25, defense: 0.2 },
  C: { shooting: 0.05, inside: 0.35, playmaking: 0.05, rebounding: 0.3, defense: 0.25 },
};

const clamp = (v: number, lo = 25, hi = 99) => Math.max(lo, Math.min(hi, Math.round(v)));

export function overallOf(pos: BasketballPos, a: BasketballAttrs): number {
  const w = WEIGHTS[pos];
  return clamp(a.shooting * w.shooting + a.inside * w.inside + a.playmaking * w.playmaking + a.rebounding * w.rebounding + a.defense * w.defense);
}

const TAGS: PlayerTag[] = ['clutch', 'streaky', 'iron_man', 'injury_prone', 'leader', 'hothead'];

/** A basketball roster: two players per position around the team's quality level. */
export function generateBasketballRoster(teamId: string, teamQuality: number, r: Rng, name: () => string, idBase: string): Player[] {
  const C = SPORTS_CONFIG.basketball;
  const players: Player[] = [];
  let n = 0;
  for (const pos of C.positions) {
    for (let k = 0; k < C.rosterSize / C.positions.length; k++) {
      const level = 60 + teamQuality + r.normal() * C.playerSpread - k * 4;
      const w = WEIGHTS[pos];
      // Strong where the position needs it, weaker elsewhere.
      const attr = (key: keyof BasketballAttrs) => clamp(level + (w[key] - 0.2) * 40 + r.normal() * 6);
      const attrs: BasketballAttrs = { shooting: attr('shooting'), inside: attr('inside'), playmaking: attr('playmaking'), rebounding: attr('rebounding'), defense: attr('defense') };
      const age = r.int(20, 34);
      const overall = overallOf(pos, attrs);
      players.push({
        id: `${idBase}_${++n}`,
        teamId,
        name: name(),
        sport: 'basketball',
        pos,
        age,
        attrs,
        overall,
        potential: clamp(overall + Math.max(0, 27 - age) * r.int(0, 3), overall, 99),
        peakAge: r.int(26, 29),
        tag: r.chance(0.35) ? r.pick(TAGS) : 'none',
        injuryGames: 0,
      });
    }
  }
  return players;
}

export { makeNameGen };
