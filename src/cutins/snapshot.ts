/**
 * The only CI-1 module that reads game state. It calls `previewRound` (a
 * pure function: the field's scores are fixed by the tournament seed) and
 * keeps the current round only through hole `q`. Nothing past `q` ever
 * leaves this function.
 */
import { activeCourse, parsOf, previewRound, type TournamentDef } from '../career/tournament';
import type { ActiveTournament, CareerState } from '../career/types';
import type { RevealSnapshot } from './types';

/** Boundaries reached this round: one per hole Ryan has finished, as holes revealed (i + 1). */
export function boundariesOf(active: Pick<ActiveTournament, 'playerHoles'>): number[] {
  return active.playerHoles.flatMap((h, i) => (h === null ? [] : [i + 1])).sort((a, b) => a - b);
}

/** Holes revealed this round, exactly as the live leaderboard computes `thruN`. */
export function thruOf(active: Pick<ActiveTournament, 'playerHoles'>): number {
  const played = active.playerHoles.map((h, i) => (h === null ? -1 : i));
  return Math.max(-1, ...played) + 1;
}

export function revealSnapshot(active: ActiveTournament, def: TournamentDef, c: CareerState, q: number = thruOf(active)): RevealSnapshot {
  if (active.round >= def.rounds) throw new Error('revealSnapshot: tournament has no round in progress');
  const pars = parsOf(activeCourse(active));
  if (!Number.isInteger(q) || q < 0 || q > pars.length) throw new Error(`revealSnapshot: bad q ${q}`);
  const coursePar = pars.reduce((a, b) => a + b, 0);
  const preview = q > 0 ? previewRound(active, def, c) : {};
  const prior: Record<string, number> = {};
  const holes: Record<string, number[]> = {};
  for (const id of active.alive) {
    const done = active.scores[id] ?? [];
    prior[id] = done.reduce((s, r) => s + r.reduce((a, b) => a + b, 0), 0) - coursePar * done.length;
    holes[id] = (preview[id] ?? []).slice(0, q);
  }
  return {
    tournamentId: active.tournamentId,
    tour: def.tour,
    special: def.special,
    round: active.round,
    rounds: def.rounds,
    isFinal: active.round === def.rounds - 1,
    pars: [...pars],
    q,
    boundaries: boundariesOf(active).filter((b) => b <= q),
    ryanId: c.playerId,
    rivalId: c.rivalId,
    alive: [...active.alive],
    prior,
    holes,
  };
}

/** The same snapshot cut back to `q` (≤ snap.q). Used so detection at q structurally cannot see later holes. */
export function truncateSnapshot(snap: RevealSnapshot, q: number): RevealSnapshot {
  if (q > snap.q) throw new Error('truncateSnapshot: cannot extend a snapshot');
  const holes: Record<string, number[]> = {};
  for (const id of Object.keys(snap.holes)) holes[id] = snap.holes[id].slice(0, q);
  return { ...snap, q, boundaries: snap.boundaries.filter((b) => b <= q), holes };
}
