/**
 * Save export / import. A save file is a JSON snapshot of every table, tagged
 * with the schema version it was written at. Older save files are migrated
 * forward on import; every row is validated before anything is written, and
 * the import replaces the save in a single transaction (all or nothing).
 */
import { DomainError } from '../core/errors';
import type { EconomyTransaction } from '../core/types';
import { CURRENT_SCHEMA_VERSION, CURRENT_STORES, type AppDB } from '../persistence/db';
import { computeBalanceSnapshots } from '../persistence/derived';
import { TABLE_SCHEMAS, type TableName } from '../persistence/schemas';

export const SAVE_FORMAT = 'ryans-road-save';

export interface SaveFile {
  format: typeof SAVE_FORMAT;
  schemaVersion: number;
  exportedAtReal: string;
  tables: Partial<Record<TableName, unknown[]>>;
}

const TABLES = Object.keys(CURRENT_STORES) as TableName[];

/** Migrates a save file's tables forward to CURRENT_SCHEMA_VERSION. */
export function migrateSaveFile(file: SaveFile): SaveFile {
  const { schemaVersion } = file;
  let { tables } = file;
  if (schemaVersion > CURRENT_SCHEMA_VERSION) {
    throw new DomainError('INVALID_SAVE', `Save is from a newer version (v${schemaVersion})`);
  }
  if (schemaVersion < 1) throw new DomainError('INVALID_SAVE', `Unsupported save version v${schemaVersion}`);
  let version = schemaVersion;
  // v1 → v2: the record book table is new. It starts empty; past albatrosses
  // are recovered from the stored hole-by-hole results after import
  // (RecordsService.backfill), never copied from an unverified source.
  if (version === 1) {
    tables = { ...tables, albatrosses: [] };
    version = 2;
  }
  // The balance snapshot is always rebuilt from the ledger so an edited or
  // partial save can't smuggle in money the ledger doesn't hold.
  tables = { ...tables, balances: computeBalanceSnapshots((tables.ledger ?? []) as EconomyTransaction[]) };
  return { ...file, schemaVersion: version, tables };
}

export class SaveService {
  constructor(private readonly db: AppDB) {}

  async exportSave(): Promise<SaveFile> {
    const tables: SaveFile['tables'] = {};
    await this.db.transaction('r', this.db.allTables, async () => {
      for (const name of TABLES) tables[name] = await this.db.table(name).toArray();
    });
    return { format: SAVE_FORMAT, schemaVersion: CURRENT_SCHEMA_VERSION, exportedAtReal: new Date().toISOString(), tables };
  }

  async importSave(input: unknown): Promise<void> {
    const file = input as SaveFile;
    if (!file || file.format !== SAVE_FORMAT || typeof file.schemaVersion !== 'number' || typeof file.tables !== 'object') {
      throw new DomainError('INVALID_SAVE', "Not a Ryan's Road to the LPGA save file");
    }
    const migrated = migrateSaveFile(file);
    const validated: Partial<Record<TableName, unknown[]>> = {};
    for (const name of TABLES) {
      const rows = migrated.tables[name] ?? [];
      if (!Array.isArray(rows)) throw new DomainError('INVALID_SAVE', `Table ${name} is not a list`);
      validated[name] = rows.map((row, i) => {
        const r = TABLE_SCHEMAS[name].safeParse(row);
        if (!r.success) throw new DomainError('INVALID_SAVE', `Invalid ${name} row ${i}: ${r.error.issues[0]?.message}`);
        return r.data;
      });
    }
    await this.db.transaction('rw', this.db.allTables, async () => {
      for (const name of TABLES) {
        await this.db.table(name).clear();
        await this.db.table(name).bulkAdd(validated[name] as object[]);
      }
    });
  }
}
