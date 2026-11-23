import { CABINET_OAK_STARTER } from '../src/catalog/items';
import { PLAYER_ID, STARTING_BALANCE } from '../src/core/ids';
import { createServices, type GameServices } from '../src/services';
import { homePropertyId } from '../src/services/careerService';

let counter = 0;

export const RYAN = PLAYER_ID;
export const PAD = homePropertyId(RYAN);
export const START = STARTING_BALANCE;
export const AFTER_CABINET = START - 300;

export async function newCareer(name = `test-db-${Date.now()}-${++counter}`) {
  const s = createServices(name);
  await s.career.ensureCareer(RYAN);
  return { s, dbName: name };
}

/** Simulates a browser reload: close the DB and rebuild every service. */
export async function reload(s: GameServices, dbName: string) {
  s.db.close();
  return createServices(dbName);
}

export async function buyCabinet(s: GameServices, requestId = `req-${++counter}`) {
  return s.store.purchase(RYAN, CABINET_OAK_STARTER, requestId);
}

/** Spends money directly through the ledger (test setup only). */
export async function spend(s: GameServices, amount: number, key = `spend-${++counter}`) {
  return s.economy.post({ ownerId: RYAN, amount: -amount, type: 'living_costs', sourceId: 'test', idempotencyKey: key });
}
