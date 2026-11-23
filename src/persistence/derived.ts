/**
 * Derived data rebuilt purely from authoritative records. Used by save-file
 * import and ledger integrity checks.
 */
import type { BalanceSnapshot, EconomyTransaction } from '../core/types';

export function computeBalanceSnapshots(ledger: EconomyTransaction[]): BalanceSnapshot[] {
  const byOwner = new Map<string, EconomyTransaction[]>();
  for (const t of ledger) byOwner.set(t.ownerId, [...(byOwner.get(t.ownerId) ?? []), t]);
  return [...byOwner].map(([ownerId, txs]) => {
    txs.sort((a, b) => a.seq - b.seq);
    const last = txs[txs.length - 1];
    return { ownerId, balance: txs.reduce((s, t) => s + t.amount, 0), lastTransactionId: last.id, seq: last.seq };
  });
}
