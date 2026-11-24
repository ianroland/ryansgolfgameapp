/** Shared shapes for every sport's game simulation. */
import type { Player } from './players';
import type { Rng } from './rng';

export interface PlayerLine {
  playerId: string;
  /** The sport's scoring stat: points (basketball, football), RBI (baseball), goals (hockey). */
  points: number;
  /** Extra stats; `v` is the player's overall contribution (used for awards). */
  extra?: Record<string, number>;
}

export interface GameResult {
  id: string;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  /** Overtime periods / extra innings played (0 = none). */
  ot: number;
  /** Hockey: decided by a shootout. */
  so?: boolean;
  /** Football: regular-season games can end tied. */
  tie?: boolean;
  /** Played at a neutral site (no home advantage). */
  neutral?: boolean;
  /** Everyone who played (zero lines included). */
  box: PlayerLine[];
  /**
   * Exact team-level and pitching events recorded without extra randomness (so recording them
   * never changes a result). Used to derive full stat lines for history (Phase C).
   */
  detail?: { home: Record<string, number | string>; away: Record<string, number | string> };
}

export interface GameContext {
  neutral: boolean;
  playoff: boolean;
  /** Each team's game number this season (0-based), e.g. for pitcher and goalie rotation. */
  homeGameNo: number;
  awayGameNo: number;
  /** History only: force a starting pitcher (by id) and the outs he must pitch. The live engine never sets these. */
  starter?: { home?: string; away?: string };
  starterOuts?: { home?: number; away?: number };
}

export type Simulator = (id: string, home: string, away: string, homeRoster: readonly Player[], awayRoster: readonly Player[], r: Rng, ctx: GameContext) => GameResult;

/** Available players at a position, best first. */
export const available = (roster: readonly Player[], ...pos: string[]) =>
  roster.filter((p) => p.injuryGames === 0 && pos.includes(p.pos)).sort((a, b) => b.overall - a.overall || a.id.localeCompare(b.id));

export const avg = (ps: readonly Player[], f: (p: Player) => number, fallback = 40) => (ps.length ? ps.reduce((s, p) => s + f(p), 0) / ps.length : fallback);

/** Box line builder. */
export function boxOf(ids: readonly string[]) {
  const lines = new Map<string, PlayerLine>(ids.map((id) => [id, { playerId: id, points: 0, extra: {} }]));
  const line = (id: string) => {
    let l = lines.get(id);
    if (!l) {
      l = { playerId: id, points: 0, extra: {} };
      lines.set(id, l);
    }
    return l;
  };
  return {
    add(id: string, stat: string, n = 1) {
      const l = line(id);
      l.extra![stat] = (l.extra![stat] ?? 0) + n;
    },
    points(id: string, n: number) {
      line(id).points += n;
    },
    lines: () => [...lines.values()].sort((a, b) => b.points - a.points || a.playerId.localeCompare(b.playerId)),
  };
}
