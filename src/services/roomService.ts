/**
 * Room editor service. The UI edits a *draft* layout in memory; nothing is
 * written until `commitLayout`, which validates the whole draft and applies it
 * atomically. Cancelling an edit simply discards the draft.
 *
 * Moving furniture changes the instance's zone in place — it never creates a
 * copy. Returning a display cabinet to inventory returns its trophies to the
 * undisplayed trophy inventory (trophies are never deleted).
 */
import { getCatalogItem } from '../catalog/items';
import { getPropertyDefinition, type PlacementZone, type PropertyDefinition } from '../catalog/properties';
import { DomainError } from '../core/errors';
import type { FurnitureInstance, PlayerId, Property } from '../core/types';
import type { AppDB } from '../persistence/db';

/** furnitureInstanceId → zoneId, or null to return it to inventory. */
export type LayoutAssignments = Record<string, string | null>;

export interface CommitResult {
  layoutVersion: number;
  /** Trophies taken off cabinets that went back to inventory. */
  returnedTrophyIds: string[];
}

export function zoneAccepts(def: PropertyDefinition, zone: PlacementZone, catalogItemId: string): boolean {
  const item = getCatalogItem(catalogItemId);
  // A spot for a bigger home (reserved) takes nothing until Ryan moves up.
  return !zone.reserved && zone.accepts.includes(item.placementTag) && def.tier >= item.minPropertyTier;
}

export function compatibleZones(propertyDefinitionId: string, catalogItemId: string): PlacementZone[] {
  const def = getPropertyDefinition(propertyDefinitionId);
  return def.zones.filter((z) => zoneAccepts(def, z, catalogItemId));
}

/**
 * Validates a full proposed layout for one property. `finalZones` maps every
 * furniture instance that would be placed in the property to its zone.
 */
export function validateLayout(
  propertyDefinitionId: string,
  furniture: Map<string, FurnitureInstance>,
  finalZones: Map<string, string>,
): void {
  const def = getPropertyDefinition(propertyDefinitionId);
  const occupied = new Map<string, string>();
  for (const [furnId, zoneId] of finalZones) {
    const f = furniture.get(furnId);
    if (!f) throw new DomainError('NOT_OWNED', `Furniture ${furnId} is not owned`);
    const zone = def.zones.find((z) => z.id === zoneId);
    if (!zone) throw new DomainError('UNKNOWN_ZONE', `No zone "${zoneId}" in ${def.name}`);
    if (!zoneAccepts(def, zone, f.catalogItemId)) {
      throw new DomainError(
        zone.reserved ? 'RESERVED_ZONE' : 'INCOMPATIBLE_ZONE',
        `${getCatalogItem(f.catalogItemId).name} can't go in ${zone.label}`,
      );
    }
    const footprint = getCatalogItem(f.catalogItemId).footprint;
    if (footprint !== 1) throw new DomainError('INCOMPATIBLE_ZONE', 'Multi-zone footprints are not supported yet');
    if (occupied.has(zoneId)) throw new DomainError('ZONE_OCCUPIED', `${zone.label} already has furniture`);
    occupied.set(zoneId, furnId);
  }
}

export class RoomService {
  constructor(private readonly db: AppDB) {}

  async getProperty(ownerId: PlayerId, propertyId: string): Promise<Property> {
    const p = await this.db.properties.get(propertyId);
    if (!p || p.ownerId !== ownerId) throw new DomainError('NOT_OWNED', `Property ${propertyId} is not owned`);
    return p;
  }

  commitLayout(
    ownerId: PlayerId,
    propertyId: string,
    baseLayoutVersion: number,
    assignments: LayoutAssignments,
  ): Promise<CommitResult> {
    return this.db.transaction('rw', [this.db.properties, this.db.furniture, this.db.trophyPlacements], async () => {
      const property = await this.getProperty(ownerId, propertyId);
      if (property.layoutVersion !== baseLayoutVersion) {
        throw new DomainError('STALE_LAYOUT', 'The room changed since editing began. Reopen the editor.');
      }

      const owned = new Map((await this.db.furniture.where('ownerId').equals(ownerId).toArray()).map((f) => [f.id, f]));
      for (const furnId of Object.keys(assignments)) {
        if (!owned.has(furnId)) throw new DomainError('NOT_OWNED', `Furniture ${furnId} is not owned`);
      }

      // Final state of this property = current placements overridden by the draft.
      const finalZones = new Map<string, string>();
      for (const f of owned.values()) {
        if (f.propertyId === propertyId && f.placementZoneId) finalZones.set(f.id, f.placementZoneId);
      }
      for (const [furnId, zoneId] of Object.entries(assignments)) {
        if (zoneId === null) finalZones.delete(furnId);
        else finalZones.set(furnId, zoneId);
      }
      validateLayout(property.propertyDefinitionId, owned, finalZones);

      const changed = Object.keys(assignments).filter((id) => {
        const f = owned.get(id)!;
        const target = assignments[id];
        return target === null ? f.placementZoneId !== undefined : !(f.propertyId === propertyId && f.placementZoneId === target);
      });

      // Two phases so swaps never collide on the unique zone index.
      for (const id of changed) {
        const { propertyId: _p, placementZoneId: _z, ...rest } = owned.get(id)!;
        await this.db.furniture.put(rest);
      }
      for (const id of changed) {
        const target = assignments[id];
        if (target !== null) await this.db.furniture.update(id, { propertyId, placementZoneId: target });
      }

      // Cabinets returned to inventory release their trophies (never delete them).
      const returnedTrophyIds: string[] = [];
      for (const id of changed.filter((i) => assignments[i] === null)) {
        const placements = await this.db.trophyPlacements.where('furnitureInstanceId').equals(id).toArray();
        returnedTrophyIds.push(...placements.map((p) => p.trophyInstanceId));
        await this.db.trophyPlacements.bulkDelete(placements.map((p) => p.trophyInstanceId));
      }

      const layoutVersion = changed.length ? property.layoutVersion + 1 : property.layoutVersion;
      if (changed.length) await this.db.properties.update(propertyId, { layoutVersion });
      return { layoutVersion, returnedTrophyIds };
    });
  }

  /** Convenience single-item operations (each is its own atomic commit). */
  async place(ownerId: PlayerId, propertyId: string, furnitureId: string, zoneId: string) {
    const p = await this.getProperty(ownerId, propertyId);
    return this.commitLayout(ownerId, propertyId, p.layoutVersion, { [furnitureId]: zoneId });
  }

  move = this.place;

  async returnToInventory(ownerId: PlayerId, propertyId: string, furnitureId: string) {
    const p = await this.getProperty(ownerId, propertyId);
    return this.commitLayout(ownerId, propertyId, p.layoutVersion, { [furnitureId]: null });
  }
}
