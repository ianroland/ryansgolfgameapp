/**
 * Puts earned trophies on display in placed cabinets. Placements are stored
 * separately from trophies, so removing a display never touches the trophy.
 */
import { getCatalogItem } from '../catalog/items';
import { DomainError } from '../core/errors';
import type { PlayerId, TrophyPlacement } from '../core/types';
import type { AppDB } from '../persistence/db';

export class TrophyDisplayService {
  constructor(private readonly db: AppDB) {}

  /**
   * Displays `trophyId` in `slotIndex` of a cabinet. If the trophy is already
   * displayed elsewhere it moves (never duplicates). If the target slot holds
   * another trophy and the moving trophy was already on display, the two swap;
   * otherwise an occupied slot is rejected.
   */
  display(ownerId: PlayerId, trophyId: string, furnitureId: string, slotIndex: number): Promise<TrophyPlacement> {
    return this.db.transaction('rw', [this.db.trophies, this.db.furniture, this.db.trophyPlacements], async () => {
      const trophy = await this.db.trophies.get(trophyId);
      if (!trophy || trophy.ownerId !== ownerId) throw new DomainError('NOT_OWNED', 'That trophy was not earned by this golfer');
      const furniture = await this.db.furniture.get(furnitureId);
      if (!furniture || furniture.ownerId !== ownerId) throw new DomainError('NOT_OWNED', 'Cabinet is not owned');
      if (!furniture.placementZoneId) throw new DomainError('NOT_PLACED', 'Place the cabinet in the room first');
      const capacity = getCatalogItem(furniture.catalogItemId).displayCapacity;
      if (capacity === 0) throw new DomainError('NOT_A_DISPLAY', 'This furniture cannot display trophies');
      if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= capacity) {
        throw new DomainError('SLOT_OUT_OF_RANGE', `Slot ${slotIndex + 1} doesn't exist (capacity ${capacity})`);
      }

      const current = await this.db.trophyPlacements.get(trophyId);
      if (current && current.furnitureInstanceId === furnitureId && current.slotIndex === slotIndex) return current;

      const occupant = await this.db.trophyPlacements
        .where('[furnitureInstanceId+slotIndex]')
        .equals([furnitureId, slotIndex])
        .first();

      const inCabinet = await this.db.trophyPlacements.where('furnitureInstanceId').equals(furnitureId).count();
      const movingWithin = current?.furnitureInstanceId === furnitureId;
      if (!occupant && !movingWithin && inCabinet >= capacity) {
        throw new DomainError('CAPACITY_EXCEEDED', 'This cabinet is full');
      }

      if (occupant) {
        if (!current) throw new DomainError('SLOT_OCCUPIED', 'That slot already holds a trophy');
        // Swap: occupant takes the moving trophy's old slot.
        await this.db.trophyPlacements.delete(occupant.trophyInstanceId);
        await this.db.trophyPlacements.delete(trophyId);
        await this.db.trophyPlacements.put({
          trophyInstanceId: occupant.trophyInstanceId,
          furnitureInstanceId: current.furnitureInstanceId,
          slotIndex: current.slotIndex,
        });
      } else if (current) {
        await this.db.trophyPlacements.delete(trophyId);
      }

      const placement: TrophyPlacement = { trophyInstanceId: trophyId, furnitureInstanceId: furnitureId, slotIndex };
      await this.db.trophyPlacements.put(placement);
      return placement;
    });
  }

  /** Takes a trophy off display. The trophy itself is untouched. */
  async remove(ownerId: PlayerId, trophyId: string): Promise<void> {
    await this.db.transaction('rw', [this.db.trophies, this.db.trophyPlacements], async () => {
      const trophy = await this.db.trophies.get(trophyId);
      if (!trophy || trophy.ownerId !== ownerId) throw new DomainError('NOT_OWNED', 'That trophy was not earned by this golfer');
      await this.db.trophyPlacements.delete(trophyId);
    });
  }
}
