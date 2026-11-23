/**
 * Authoritative money economy. The ledger is the source of truth; the balance
 * snapshot is a derived cache written in the same IndexedDB transaction as the
 * ledger entry, so they can never diverge. There is no separate clubhouse
 * balance anywhere in the app.
 *
 * Amounts are whole in-game dollars (fictional).
 */
import { DomainError } from '../core/errors';
import { newId } from '../core/ids';
import type { EconomyTransaction, PlayerId, TransactionType } from '../core/types';
import type { AppDB } from '../persistence/db';
import { BalanceSnapshotSchema, EconomyTransactionSchema } from '../persistence/schemas';

export interface PostRequest {
  ownerId: PlayerId;
  amount: number;
  type: TransactionType;
  sourceId: string;
  /** Same key ⇒ same logical operation ⇒ applied at most once. */
  idempotencyKey: string;
}

export interface PostResult {
  transaction: EconomyTransaction;
  /** True if this key had already been applied and nothing new was charged. */
  replayed: boolean;
}

export class EconomyService {
  constructor(private readonly db: AppDB) {}

  /** Tables a caller must include if it posts inside its own transaction. */
  get tables() {
    return [this.db.profiles, this.db.ledger, this.db.balances];
  }

  /**
   * Atomically appends a ledger entry and updates the balance snapshot.
   * Joins the caller's transaction when invoked inside one (Dexie nests).
   */
  post(req: PostRequest): Promise<PostResult> {
    return this.db.transaction('rw', this.tables, async () => {
      const existing = await this.db.ledger.where('idempotencyKey').equals(req.idempotencyKey).first();
      if (existing) return { transaction: existing, replayed: true };

      const profile = await this.db.profiles.get(req.ownerId);
      if (!profile) throw new DomainError('NO_PROFILE', `No player profile for ${req.ownerId}`);

      const current = (await this.db.balances.get(req.ownerId))?.balance ?? 0;
      const balanceAfter = current + req.amount;
      if (balanceAfter < 0) {
        throw new DomainError(
          'INSUFFICIENT_FUNDS',
          `Not enough money: you have $${current.toLocaleString()}, need $${(-req.amount).toLocaleString()}`,
        );
      }

      const seq = profile.ledgerSeq + 1;
      const transaction: EconomyTransaction = {
        id: newId('txn'),
        ownerId: req.ownerId,
        amount: req.amount,
        type: req.type,
        sourceId: req.sourceId,
        timestamp: profile.careerClock,
        balanceAfter,
        seq,
        idempotencyKey: req.idempotencyKey,
      };
      await this.db.ledger.add(transaction);
      await this.db.balances.put({ ownerId: req.ownerId, balance: balanceAfter, lastTransactionId: transaction.id, seq });
      await this.db.profiles.update(req.ownerId, { ledgerSeq: seq });
      return { transaction, replayed: false };
    });
  }

  async getBalance(ownerId: PlayerId): Promise<number> {
    const snap = await this.db.balances.get(ownerId);
    return snap ? BalanceSnapshotSchema.parse(snap).balance : 0;
  }

  async listTransactions(ownerId: PlayerId): Promise<EconomyTransaction[]> {
    const rows = await this.db.ledger.where('[ownerId+seq]').between([ownerId, 0], [ownerId, Infinity]).toArray();
    return rows.map((r) => EconomyTransactionSchema.parse(r));
  }

  /** Verifies the snapshot equals the ledger sum and the running balances chain. */
  async verifyIntegrity(ownerId: PlayerId): Promise<void> {
    const txs = await this.listTransactions(ownerId);
    let running = 0;
    for (const t of txs) {
      running += t.amount;
      if (running !== t.balanceAfter) {
        throw new DomainError('LEDGER_INTEGRITY', `Ledger chain broken at transaction ${t.id}`);
      }
    }
    const snapshot = await this.getBalance(ownerId);
    if (snapshot !== running) {
      throw new DomainError('LEDGER_INTEGRITY', `Balance snapshot ${snapshot} ≠ ledger total ${running}`);
    }
  }
}
