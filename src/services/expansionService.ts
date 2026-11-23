/**
 * Casino Secrets & Rivalries: location unlocks and lobby state.
 *
 * Live unlocks are written by EconomyService.post. `reconcile` recognises unlocks a save
 * earned before this existed (from the ledger's recorded balances; exact, idempotent) and is
 * run at start-up and after importing a save, like the record book and Career Legacy checks.
 */
import { PLAYER_ID } from '../core/ids';
import type { AppDB } from '../persistence/db';
import { deriveFromLedger, type LocationId, type UnlockId } from '../expansion/unlocks';

export class ExpansionService {
  constructor(private readonly db: AppDB) {}

  /** Adds unlocks the ledger proves but the save lacks. Returns the ids added. Never removes any. */
  async reconcile(ownerId: string = PLAYER_ID): Promise<UnlockId[]> {
    return this.db.transaction('rw', [this.db.ledger, this.db.milestones, this.db.unlocks], async () => {
      const d = deriveFromLedger(await this.db.ledger.where('ownerId').equals(ownerId).toArray(), ownerId);
      const m = await this.db.milestones.get(ownerId);
      if (d.milestone && (!m || d.milestone.peakBalance > m.peakBalance)) await this.db.milestones.put(d.milestone);
      const added: UnlockId[] = [];
      for (const u of d.unlocks) {
        if (await this.db.unlocks.get(u.id)) continue;
        await this.db.unlocks.add(u);
        added.push(u.id);
      }
      return added;
    });
  }

  /** The lobby has shown a location's "newly unlocked" state; also counts a visit to it. */
  async markSeen(locationId: LocationId): Promise<void> {
    await this.db.transaction('rw', [this.db.locationState], async () => {
      const prev = await this.db.locationState.get(locationId);
      await this.db.locationState.put({ locationId, seenUnlock: true, visits: (prev?.visits ?? 0) + 1 });
    });
  }
}
