/**
 * Bet-slip maths (pure; reused by the real sportsbook in Phase 3). A slip holds selections;
 * a parlay needs 2-6 legs from different games. Returns are stake × product of decimal odds,
 * capped. Values are PROPOSED (SPORTSBOOK_DESIGN.md §11).
 */
import { decimalOf, type Market, type Side } from './demo';

export const SLIP_RULES = {
  minStake: 5,
  /** Desert Palms maximum single stake (proposed). */
  maxStake: 1000,
  minLegs: 2,
  maxLegs: 6,
  /** Parlay payout cap: the lower of 100x stake and $50,000 (proposed). */
  capMultiple: 100,
  capAmount: 50_000,
} as const;

export interface Selection {
  gameId: string;
  market: Market;
  side: Side;
  point: number | null;
  american: number;
  label: string;
}

export const selectionKey = (s: Pick<Selection, 'gameId' | 'market' | 'side'>) => `${s.gameId}|${s.market}|${s.side}`;

/** Adds or replaces a selection: one pick per game and market (picking the other side swaps it). */
export function toggleSelection(slip: Selection[], sel: Selection): Selection[] {
  const key = selectionKey(sel);
  if (slip.some((s) => selectionKey(s) === key)) return slip.filter((s) => selectionKey(s) !== key);
  return [...slip.filter((s) => !(s.gameId === sel.gameId && s.market === sel.market)), sel];
}

export type ParlayCheck = { ok: true } | { ok: false; reason: string };

/** A parlay: 2-6 legs, all from different games (no same-game parlays in v1). */
export function parlayCheck(slip: Selection[]): ParlayCheck {
  if (slip.length < SLIP_RULES.minLegs) return { ok: false, reason: `A parlay needs at least ${SLIP_RULES.minLegs} picks` };
  if (slip.length > SLIP_RULES.maxLegs) return { ok: false, reason: `A parlay can have at most ${SLIP_RULES.maxLegs} picks` };
  if (new Set(slip.map((s) => s.gameId)).size !== slip.length) return { ok: false, reason: 'Parlay picks must come from different games' };
  return { ok: true };
}

export const parlayDecimal = (slip: Selection[]) => slip.reduce((a, s) => a * decimalOf(s.american), 1);

/** Total return (stake included) for a single pick or a parlay, with the parlay cap applied. */
export function potentialReturn(slip: Selection[], stake: number, parlay: boolean): number {
  if (stake <= 0 || slip.length === 0) return 0;
  if (!parlay) return slip.reduce((a, s) => a + Math.floor(stake * decimalOf(s.american)), 0);
  const raw = Math.floor(stake * parlayDecimal(slip));
  return Math.min(raw, stake * SLIP_RULES.capMultiple, SLIP_RULES.capAmount);
}

export type StakeCheck = { ok: true } | { ok: false; reason: string };
export function stakeCheck(stake: number, legs: number, parlay: boolean, balance: number): StakeCheck {
  if (!Number.isInteger(stake) || stake < SLIP_RULES.minStake) return { ok: false, reason: `Minimum stake is $${SLIP_RULES.minStake}` };
  if (stake > SLIP_RULES.maxStake) return { ok: false, reason: `Maximum stake is $${SLIP_RULES.maxStake}` };
  const total = parlay ? stake : stake * legs;
  if (total > balance) return { ok: false, reason: 'Not enough in the bank' };
  return { ok: true };
}
