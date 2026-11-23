/**
 * One-use presentation tokens. Infrastructure only in CI-1: not wired.
 *
 * A token exists only when a hole changes from unplayed to played in this
 * session (the `recordHole` transition). It lives in memory, so a reload
 * destroys it: a boundary that was already reached can never present again.
 */
import { wasPresented, markPresented } from './presentationLog';
import type { ActiveTournament } from '../career/types';
import type { Decision } from './types';

export interface BoundaryToken {
  readonly tournamentId: string;
  /** 0-based round. */
  readonly round: number;
  /** Boundary: holes revealed (hole index + 1). */
  readonly q: number;
}

/** Tokens this module issued, with the session generation they belong to. */
const issued = new WeakMap<BoundaryToken, number>();
const consumed = new Set<string>();
let generation = 0;
const keyOf = (t: BoundaryToken) => `${t.tournamentId}:${t.round}:${t.q}`;

/**
 * A token for the live transition `before → after`, or null unless exactly
 * one hole went from null to a stroke count in the same tournament and round,
 * with every other hole unchanged.
 */
export function issueToken(
  before: Pick<ActiveTournament, 'tournamentId' | 'round' | 'playerHoles'> | null,
  after: Pick<ActiveTournament, 'tournamentId' | 'round' | 'playerHoles'> | null,
): BoundaryToken | null {
  if (!before || !after) return null;
  if (before.tournamentId !== after.tournamentId || before.round !== after.round) return null;
  if (before.playerHoles.length !== after.playerHoles.length) return null;
  let idx = -1;
  for (let i = 0; i < after.playerHoles.length; i++) {
    const a = before.playerHoles[i];
    const b = after.playerHoles[i];
    if (a === b) continue;
    if (a === null && typeof b === 'number' && idx === -1) idx = i;
    else return null;
  }
  if (idx === -1) return null;
  const t: BoundaryToken = Object.freeze({ tournamentId: after.tournamentId, round: after.round, q: idx + 1 });
  issued.set(t, generation);
  return t;
}

/** True exactly once per boundary, and only for a token this module issued. */
export function consume(t: BoundaryToken): boolean {
  if (issued.get(t) !== generation) return false;
  const k = keyOf(t);
  if (consumed.has(k)) return false;
  consumed.add(k);
  return true;
}

/**
 * Consumes the token and returns the moment to present at its boundary, or
 * null. Marks the moment presented at the start, so a skip or an interruption
 * counts the same as watching it.
 */
export function claimPresentation(t: BoundaryToken, plan: Decision[]): string | null {
  if (!consume(t)) return null;
  const d = plan.find((x) => x.q === t.q);
  const id = d?.selected ?? null;
  if (!id || !id.startsWith(`${t.tournamentId}:r${t.round + 1}:`)) return null;
  if (wasPresented(id)) return null;
  markPresented(id, 'shown');
  return id;
}

/** Test aid: simulates a reload. Every token issued so far becomes invalid. */
export function resetTokens(): void {
  generation++;
  consumed.clear();
}
