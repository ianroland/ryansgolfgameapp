/**
 * Basketball game simulation: possession by possession, from the two teams' available players.
 * Deterministic for (world seed, game id) and the rosters it is given; nothing outside those
 * inputs can affect a result (no NPC, drink, golf or casino state is read anywhere in src/sports).
 */
import { SPORTS_CONFIG } from './config';
import type { Player } from './players';
import type { Rng } from './rng';
import type { GameContext, GameResult } from './sim';

export type { GameResult, PlayerLine } from './sim';

const C = SPORTS_CONFIG.basketball;

export interface TeamStrength {
  offense: number;
  defense: number;
  /** Rotation, best first, with shot-share weights. */
  rotation: { player: Player; share: number }[];
}

/** Strength from the available rotation (injured players sit). Starters count more than the bench. */
export function teamStrength(roster: readonly Player[]): TeamStrength {
  const avail = roster.filter((p) => p.injuryGames === 0).sort((a, b) => b.overall - a.overall || a.id.localeCompare(b.id));
  const rot = avail.slice(0, C.rotation);
  const starters = rot.slice(0, 5);
  const bench = rot.slice(5);
  const avg = (ps: readonly Player[], f: (p: Player) => number) => (ps.length ? ps.reduce((s, p) => s + f(p), 0) / ps.length : 30);
  const off = (p: Player) => p.attrs.shooting * 0.45 + p.attrs.inside * 0.3 + p.attrs.playmaking * 0.25;
  const def = (p: Player) => p.attrs.defense * 0.7 + p.attrs.rebounding * 0.3;
  const blend = (f: (p: Player) => number) => avg(starters, f) * C.starterWeight + avg(bench.length ? bench : starters, f) * (1 - C.starterWeight);
  return {
    offense: blend(off),
    defense: blend(def),
    // `usage` is history-only (a scorer's extra shot share); live players don't have it.
    rotation: rot.map((player, i) => ({ player, share: (i < 5 ? 1 : 0.45) * (0.5 + (player.attrs.shooting + player.attrs.inside) / 200) * (player.attrs.usage ?? 1) })),
  };
}

type Tally = Record<'fg2a' | 'fg3a' | 'fta' | 'fg2m' | 'fg3m' | 'ftm' | 'oreb' | 'tov', number>;
const tally = (): Tally => ({ fg2a: 0, fg3a: 0, fta: 0, fg2m: 0, fg3m: 0, ftm: 0, oreb: 0, tov: 0 });

function possession(r: Rng, off: TeamStrength, def: TeamStrength, home: boolean, box: Map<string, number>, neutral: boolean, t: Tally, makes: Map<string, Record<string, number>>): number {
  if (r.chance(C.turnoverRate)) {
    t.tov++;
    return 0;
  }
  const adj = (off.offense - def.defense) * C.matchupScale + (home && !neutral ? C.homeEdge : 0);
  const scorer = () => off.rotation[r.weighted(off.rotation.map((x) => x.share))].player.id;
  const add = (pts: number, kind: 'ft' | 'fg2' | 'fg3') => {
    if (pts) {
      const id = scorer();
      box.set(id, (box.get(id) ?? 0) + pts);
      const m = makes.get(id) ?? { fg2m: 0, fg3m: 0, ftm: 0 };
      if (kind === 'ft') m.ftm += pts;
      else m[`${kind}m`]++;
      makes.set(id, m);
    }
    return pts;
  };
  if (r.chance(C.foulRate)) {
    let pts = 0;
    for (let i = 0; i < 2; i++) if (r.chance(C.freeThrowPct)) pts++;
    t.fta += 2;
    t.ftm += pts;
    return add(pts, 'ft');
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const three = r.chance(C.threeShare);
    t[three ? 'fg3a' : 'fg2a']++;
    if (r.chance((three ? C.threePct : C.twoPct) + adj)) {
      t[three ? 'fg3m' : 'fg2m']++;
      return add(three ? 3 : 2, three ? 'fg3' : 'fg2');
    }
    if (!r.chance(C.offRebound)) return 0;
    t.oreb++;
  }
  return 0;
}

/** Plays one game. `r` must be the game's own stream. */
export function playBasketball(id: string, home: string, away: string, homeRoster: readonly Player[], awayRoster: readonly Player[], r: Rng, ctx?: GameContext): GameResult {
  const neutral = !!ctx?.neutral;
  const H = teamStrength(homeRoster);
  const A = teamStrength(awayRoster);
  const box = new Map<string, number>();
  const makes = new Map<string, Record<string, number>>();
  const th = tally();
  const ta = tally();
  let hs = 0;
  let as = 0;
  const period = (possessions: number) => {
    for (let i = 0; i < possessions; i++) {
      hs += possession(r, H, A, true, box, neutral, th, makes);
      as += possession(r, A, H, false, box, neutral, ta, makes);
    }
  };
  const pace = Math.max(85, Math.round(C.pace.mean + r.normal() * C.pace.sd));
  period(pace);
  let ot = 0;
  while (hs === as) {
    ot++;
    period(Math.round((pace * 5) / 48));
  }
  return {
    id,
    home,
    away,
    homeScore: hs,
    awayScore: as,
    ot,
    ...(neutral ? { neutral } : {}),
    box: [...box].map(([playerId, points]) => ({ playerId, points, extra: { v: points, ...makes.get(playerId) } })).sort((a, b) => b.points - a.points || a.playerId.localeCompare(b.playerId)),
    detail: { home: { ...th, rotation: H.rotation.map((x) => x.player.id).join(',') }, away: { ...ta, rotation: A.rotation.map((x) => x.player.id).join(',') } },
  };
}
