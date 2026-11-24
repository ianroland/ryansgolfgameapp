/**
 * Balanced league schedules (circle method). With 8 teams, one round-robin is 7 rounds of 4
 * games. A season repeats it `meetingsPerOpponent` times, swapping home and away every cycle,
 * so every pair meets equally often and each side hosts exactly half of those games.
 */
import type { Rng } from './rng';

export interface ScheduledGame {
  id: string;
  round: number;
  home: string;
  away: string;
}

/** One round-robin: rounds of [home, away] pairs (circle method; first team fixed). */
export function roundRobin(teams: readonly string[]): [string, string][][] {
  if (teams.length % 2) throw new Error('Even number of teams required');
  const n = teams.length;
  const rot = teams.slice(1);
  const rounds: [string, string][][] = [];
  for (let r = 0; r < n - 1; r++) {
    const order = [teams[0], ...rot];
    const games: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = order[i];
      const b = order[n - 1 - i];
      // Alternate who hosts so home games spread out within a cycle.
      games.push((r + i) % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(games);
    rot.unshift(rot.pop()!);
  }
  return rounds;
}

/**
 * A full season. Each round-robin round becomes a series of `seriesLength` consecutive game days
 * between the same teams at the same venue (baseball plays 3-game series; other sports 1).
 * Cycles repeat until each pair has met `meetings` times, swapping home and away every cycle.
 * `round` on each game is its game day.
 */
export function seasonSchedule(teamIds: readonly string[], meetings: number, r: Rng, idPrefix: string, seriesLength = 1): ScheduledGame[] {
  if (meetings % seriesLength) throw new Error('Meetings must be a multiple of the series length');
  const cycles = meetings / seriesLength;
  if (cycles % 2) throw new Error('Home and away must split evenly: an even number of cycles is required');
  const order = [...teamIds];
  for (let i = order.length - 1; i > 0; i--) {
    const j = r.int(0, i);
    [order[i], order[j]] = [order[j], order[i]];
  }
  const base = roundRobin(order);
  const games: ScheduledGame[] = [];
  let day = 0;
  for (let cycle = 0; cycle < cycles; cycle++) {
    for (const rd of base) {
      for (let g = 0; g < seriesLength; g++) {
        for (const [h, a] of rd) {
          const [home, away] = cycle % 2 === 0 ? [h, a] : [a, h];
          games.push({ id: `${idPrefix}:r${day + 1}:${home}-${away}`, round: day, home, away });
        }
        day++;
      }
    }
  }
  return games;
}

export interface ScheduleProblem {
  problem: string;
}

/** Checks a schedule is balanced; returns the problems found (empty when valid). */
export function validateSchedule(games: readonly ScheduledGame[], teamIds: readonly string[], meetings: number): string[] {
  const problems: string[] = [];
  const perTeam = new Map(teamIds.map((t) => [t, 0]));
  const pair = new Map<string, { a: number; b: number }>();
  const rounds = new Map<number, Set<string>>();
  for (const g of games) {
    if (g.home === g.away) problems.push(`${g.id}: team plays itself`);
    perTeam.set(g.home, (perTeam.get(g.home) ?? 0) + 1);
    perTeam.set(g.away, (perTeam.get(g.away) ?? 0) + 1);
    const [x, y] = [g.home, g.away].sort();
    const p = pair.get(`${x}|${y}`) ?? { a: 0, b: 0 };
    if (g.home === x) p.a++;
    else p.b++;
    pair.set(`${x}|${y}`, p);
    const seen = rounds.get(g.round) ?? new Set<string>();
    if (seen.has(g.home) || seen.has(g.away)) problems.push(`round ${g.round}: a team plays twice`);
    seen.add(g.home).add(g.away);
    rounds.set(g.round, seen);
  }
  const expected = meetings * (teamIds.length - 1);
  for (const [t, n] of perTeam) if (n !== expected) problems.push(`${t}: ${n} games, expected ${expected}`);
  for (const [k, p] of pair) if (p.a !== meetings / 2 || p.b !== meetings / 2) problems.push(`${k}: home split ${p.a}/${p.b}`);
  const pairs = (teamIds.length * (teamIds.length - 1)) / 2;
  if (pair.size !== pairs) problems.push(`${pair.size} pairings, expected ${pairs}`);
  if (new Set(games.map((g) => g.id)).size !== games.length) problems.push('duplicate game ids');
  return problems;
}
