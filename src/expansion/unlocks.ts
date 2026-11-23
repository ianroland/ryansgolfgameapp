/**
 * Casino location unlocks (Casino Secrets & Rivalries, Slice 1).
 *
 * CONFIRMED (bible v0.2): The White Buffalo unlocks the first time Ryan's bankroll reaches
 * $100,000; Morongo Sky the first time it reaches $1,000,000. Every income source counts.
 * An unlock is permanent: it is never revoked when the bankroll falls.
 *
 * The check runs inside EconomyService.post (the single bankroll path), in the same
 * transaction as the ledger entry. Existing saves are recognised from the ledger itself:
 * each entry records the balance after it, so the first crossing is known exactly.
 */
import type { EconomyTransaction, GameTime } from '../core/types';

export type LocationId = 'desert_palms' | 'white_buffalo' | 'morongo_sky';
export type UnlockId = 'unlock:white_buffalo' | 'unlock:morongo_sky';

export interface UnlockRule {
  id: UnlockId;
  location: LocationId;
  /** Bankroll that unlocks it the first time it is reached. */
  threshold: number;
}

export const UNLOCK_RULES: readonly UnlockRule[] = [
  { id: 'unlock:white_buffalo', location: 'white_buffalo', threshold: 100_000 },
  { id: 'unlock:morongo_sky', location: 'morongo_sky', threshold: 1_000_000 },
];

export interface UnlockRecord {
  id: UnlockId;
  ownerId: string;
  /** In-game time of the transaction that first crossed the threshold. */
  at: GameTime;
  /** 'live' when crossed in play; 'backfill' when recognised from an older save's ledger. */
  trigger: 'live' | 'backfill';
  txnId: string;
  threshold: number;
  /** Bankroll right after that transaction. */
  balance: number;
}

export interface MilestoneRecord {
  ownerId: string;
  peakBalance: number;
  peakTxnId: string;
  peakAt: GameTime;
}

/** Rules a balance has reached. */
export const rulesReached = (balance: number) => UNLOCK_RULES.filter((r) => balance >= r.threshold);

/**
 * Everything an owner's ledger proves: the peak balance and, for each rule, the first
 * entry that reached it. Pure; used by the save migration and the boot-time reconcile.
 */
export function deriveFromLedger(ledger: EconomyTransaction[], ownerId: string): { milestone: MilestoneRecord | null; unlocks: UnlockRecord[] } {
  const rows = ledger.filter((t) => t.ownerId === ownerId).sort((a, b) => a.seq - b.seq);
  let peak: EconomyTransaction | null = null;
  const firsts = new Map<UnlockId, EconomyTransaction>();
  for (const t of rows) {
    if (!peak || t.balanceAfter > peak.balanceAfter) peak = t;
    for (const r of rulesReached(t.balanceAfter)) if (!firsts.has(r.id)) firsts.set(r.id, t);
  }
  const unlocks = UNLOCK_RULES.filter((r) => firsts.has(r.id)).map((r) => {
    const t = firsts.get(r.id)!;
    return { id: r.id, ownerId, at: t.timestamp, trigger: 'backfill' as const, txnId: t.id, threshold: r.threshold, balance: t.balanceAfter };
  });
  return { milestone: peak ? { ownerId, peakBalance: peak.balanceAfter, peakTxnId: peak.id, peakAt: peak.timestamp } : null, unlocks };
}
