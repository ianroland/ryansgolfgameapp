/**
 * Clubhouse store. Purchases debit the authoritative economy and create an
 * owned furniture instance in a single atomic IndexedDB transaction.
 *
 * Duplicate protection: every purchase carries a client-generated `requestId`
 * (one per purchase intent). The ledger's unique idempotency index guarantees
 * a request is charged at most once; replays return the original result.
 */
import { getCatalogItem } from '../catalog/items';
import { getPropertyDefinition } from '../catalog/properties';
import { DomainError } from '../core/errors';
import { newId } from '../core/ids';
import type { EconomyTransaction, FurnitureInstance, PlayerId } from '../core/types';
import type { AppDB } from '../persistence/db';
import type { EconomyService } from './economyService';

export interface PurchaseResult {
  status: 'purchased' | 'duplicate';
  transaction: EconomyTransaction;
  instance: FurnitureInstance;
}

export class StoreService {
  constructor(
    private readonly db: AppDB,
    private readonly economy: EconomyService,
  ) {}

  purchase(ownerId: PlayerId, catalogItemId: string, requestId: string): Promise<PurchaseResult> {
    const idempotencyKey = `purchase:${ownerId}:${requestId}`;
    return this.db.transaction('rw', [...this.economy.tables, this.db.furniture, this.db.properties], async () => {
      // Replay of an already-applied request: return it, charge nothing.
      const prior = await this.db.ledger.where('idempotencyKey').equals(idempotencyKey).first();
      if (prior) {
        const instance = await this.db.furniture
          .where('ownerId')
          .equals(ownerId)
          .filter((f) => f.purchaseTransactionId === prior.id)
          .first();
        if (!instance) throw new DomainError('LEDGER_INTEGRITY', `Purchase ${prior.id} has no item instance`);
        return { status: 'duplicate' as const, transaction: prior, instance };
      }

      let item;
      try {
        item = getCatalogItem(catalogItemId);
      } catch {
        throw new DomainError('UNKNOWN_ITEM', `Unknown item ${catalogItemId}`);
      }
      if (!item.purchasable) throw new DomainError('NOT_PURCHASABLE', `${item.name} is not for sale`);

      const properties = await this.db.properties.where('ownerId').equals(ownerId).toArray();
      const maxTier = Math.max(0, ...properties.map((p) => getPropertyDefinition(p.propertyDefinitionId).tier));
      if (maxTier < item.minPropertyTier) {
        throw new DomainError('PROPERTY_TIER_TOO_LOW', `${item.name} needs a better property`);
      }

      const { transaction } = await this.economy.post({
        ownerId,
        amount: -item.cost,
        type: 'furniture_purchase',
        sourceId: item.id,
        idempotencyKey,
      });

      const instance: FurnitureInstance = {
        id: newId('furn'),
        ownerId,
        catalogItemId: item.id,
        purchasedAt: transaction.timestamp,
        purchaseTransactionId: transaction.id,
      };
      await this.db.furniture.add(instance);
      return { status: 'purchased' as const, transaction, instance };
    });
  }

  async ownedCount(ownerId: PlayerId, catalogItemId: string): Promise<number> {
    return this.db.furniture.where('ownerId').equals(ownerId).filter((f) => f.catalogItemId === catalogItemId).count();
  }
}
