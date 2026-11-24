/**
 * The live leagues' rosters from the history carry-over (Phase D part 2): the players on the 2027
 * rosters built by scripts/history/build_forward.ts, as engine players. Same players in every
 * save; each save's own seed still decides its games, injuries and lines.
 *
 * Seasons after 2027 reuse these rosters as they are (the live off-season with aging,
 * retirements and drafts is later work).
 */
import packed from './data/live2027.json';
import type { Sport } from './demo';
import { overallFor, SPECS, type Player } from './players';
import type { World } from './season';

export const LIVE_ROSTER_YEAR = 2027;
type Row = [id: string, team: string, name: string, sport: Sport, pos: string, age: number, attrs: number[]];
interface Packed { year: number; players: Row[] }

const keysFor = (sport: Sport, pos: string) => Object.keys((SPECS[sport].find((s) => s.pos === pos) ?? SPECS[sport][0]).attrs);

export function packLive(players: Player[]): Packed {
  return {
    year: LIVE_ROSTER_YEAR,
    players: players.map((p) => {
      const keys = keysFor(p.sport, p.pos);
      if (Object.keys(p.attrs).some((k) => !keys.includes(k))) throw new Error(`${p.id}: attributes outside its position`);
      return [p.id, p.teamId, p.name, p.sport, p.pos, p.age, keys.map((k) => p.attrs[k])];
    }),
  };
}

export function unpackLive(data: Packed): Player[] {
  return data.players.map(([id, teamId, name, sport, pos, age, values]) => {
    const keys = keysFor(sport, pos);
    const attrs = Object.fromEntries(keys.map((k, i) => [k, values[i]]));
    const specPos = SPECS[sport].some((s) => s.pos === pos) ? pos : SPECS[sport][0].pos;
    return { id, teamId, name, sport, pos, age, attrs, overall: overallFor(sport, specPos, attrs), potential: 0, peakAge: 0, tag: 'none', injuryGames: 0 } satisfies Player;
  });
}

let cache: Player[] | null = null;
/** The carried-over world for a save's seed (team quality is not used by the engine). */
export function historyWorld(seed: number): World {
  cache ??= unpackLive(packed as unknown as Packed);
  const quality: Record<string, number> = {};
  return { seed, quality, players: cache.map((p) => ({ ...p, attrs: { ...p.attrs } })) };
}
