/**
 * Versioned Dexie/IndexedDB schema for Ryan's Road to the LPGA saves.
 *
 * Version history
 *  v1 — career RPG: profile, ledger + balance snapshot, home, furniture,
 *       trophies, trophy placements, career state, tournaments, career
 *       events and processed-event records.
 *  v2 — record book: `albatrosses` (verified albatross records). Additive:
 *       every v1 table is unchanged. Past albatrosses are recovered from
 *       stored hole-by-hole results by RecordsService.backfill().
 *  v3 — Casino Secrets & Rivalries, Slice 1: `unlocks` (permanent casino
 *       unlocks), `milestones` (peak bankroll), `npcState` + `relationshipLog`
 *       (dealer relationships and tips), `locationState`. Additive. Unlocks
 *       already earned are recognised from the ledger (ExpansionService.reconcile).
 *
 * Future versions add `this.version(n).stores(...).upgrade(...)` below and a
 * matching step in saveService.migrateSaveFile, so old saves keep loading.
 *
 * Every write to every table is validated against its runtime schema by
 * Dexie hooks, so nothing malformed can reach IndexedDB.
 */
import Dexie, { type DexieOptions, type Table } from 'dexie';
import type { CareerState } from '../career/types';
import type {
  BalanceSnapshot,
  CareerEvent,
  EconomyTransaction,
  FurnitureInstance,
  PlayerProfile,
  ProcessedCareerEvent,
  Property,
  TrophyInstance,
  TrophyPlacement,
} from '../core/types';
import type { AlbatrossRecord } from '../records/albatross';
import type { TournamentRecord } from './records';
import type { MilestoneRecord, UnlockRecord } from '../expansion/unlocks';
import type { LocationState, NpcState, RelationshipLogEntry } from '../npc/types';
import { TABLE_SCHEMAS, type TableName } from './schemas';

export const DB_NAME = 'ryans-road-to-the-lpga';
export const CURRENT_SCHEMA_VERSION = 3;

export const STORES_V1 = {
  profiles: 'id',
  ledger: 'id, ownerId, &idempotencyKey, [ownerId+seq]',
  balances: 'ownerId',
  properties: 'id, ownerId',
  // Unique compound index: two furniture instances can never share a zone.
  // Unplaced furniture has no propertyId/placementZoneId, so it isn't indexed.
  furniture: 'id, ownerId, catalogItemId, &[propertyId+placementZoneId]',
  // Primary key is `trophy:<owner>:<tournament>` → at most one per tournament.
  trophies: 'id, ownerId, trophyDefinitionId',
  // Primary key = trophy → a trophy can only be in one slot. Unique slot index.
  trophyPlacements: 'trophyInstanceId, furnitureInstanceId, &[furnitureInstanceId+slotIndex]',
  careers: 'id',
  tournaments: 'id, season',
  careerEvents: 'id, golferId, tournamentId',
  processedEvents: 'eventId',
} as const;

export const STORES_V2 = {
  ...STORES_V1,
  albatrosses: 'id, golferId, season, courseId, tournamentId',
} as const;

export const STORES_V3 = {
  ...STORES_V2,
  unlocks: 'id, ownerId',
  milestones: 'ownerId',
  npcState: 'npcId',
  relationshipLog: 'id, npcId, [npcId+seq]',
  locationState: 'locationId',
} as const;

export const CURRENT_STORES = STORES_V3;

export class AppDB extends Dexie {
  profiles!: Table<PlayerProfile, string>;
  ledger!: Table<EconomyTransaction, string>;
  balances!: Table<BalanceSnapshot, string>;
  properties!: Table<Property, string>;
  furniture!: Table<FurnitureInstance, string>;
  trophies!: Table<TrophyInstance, string>;
  trophyPlacements!: Table<TrophyPlacement, string>;
  careers!: Table<CareerState, string>;
  tournaments!: Table<TournamentRecord, string>;
  careerEvents!: Table<CareerEvent, string>;
  processedEvents!: Table<ProcessedCareerEvent, string>;
  albatrosses!: Table<AlbatrossRecord, string>;
  unlocks!: Table<UnlockRecord, string>;
  milestones!: Table<MilestoneRecord, string>;
  npcState!: Table<NpcState, string>;
  relationshipLog!: Table<RelationshipLogEntry, string>;
  locationState!: Table<LocationState, string>;

  constructor(name: string = DB_NAME, options?: DexieOptions) {
    super(name, options);
    this.version(1).stores(STORES_V1);
    this.version(2).stores(STORES_V2);
    this.version(3).stores(STORES_V3);
    this.installValidationHooks();
  }

  private installValidationHooks() {
    for (const name of Object.keys(CURRENT_STORES) as TableName[]) {
      const table = this.table(name);
      const schema = TABLE_SCHEMAS[name];
      table.hook('creating', (_key, obj) => {
        schema.parse(obj);
      });
      table.hook('updating', (mods, _key, obj) => {
        const next = Dexie.deepClone(obj) as Record<string, unknown>;
        for (const [path, value] of Object.entries(mods as Record<string, unknown>)) {
          if (value === undefined) Dexie.delByKeyPath(next, path);
          else Dexie.setByKeyPath(next, path, value);
        }
        schema.parse(next);
        return undefined;
      });
    }
  }

  /** All tables, for whole-save transactions. */
  get allTables() {
    return Object.keys(CURRENT_STORES).map((n) => this.table(n));
  }
}
