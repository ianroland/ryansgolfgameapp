import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION } from '../src/persistence/db';
import { trophyInstanceId } from '../src/catalog/trophies';
import { isDomainError } from '../src/core/errors';
import { buyCabinet, newCareer, PAD, reload, RYAN, START } from './helpers';
import { playTournament } from './careerHelpers';

describe('definition of done (service level, with reloads)', () => {
  it('career → cabinet → tournament win → trophy on display, surviving every reload', async () => {
    const { s, dbName } = await newCareer();
    // 1. New career: starter home, savings, week 1.
    let st = await s.career.loadClubhouse(RYAN);
    expect(st).toMatchObject({ balance: START, propertyDef: { id: 'starter_pad' }, career: { season: 1, week: 1 } });
    // 2. Buy and place the oak cabinet.
    const cab = (await buyCabinet(s, 'dod')).instance;
    await s.room.place(RYAN, PAD, cab.id, 'back_wall');
    let s2 = await reload(s, dbName);
    expect((await s2.db.furniture.get(cab.id))?.placementZoneId).toBe('back_wall');
    // 3. Win an amateur event through the real pipeline.
    const out = await playTournament(s2, 'amateur-1-w2');
    const tid = trophyInstanceId(RYAN, 'amateur-1-w2');
    expect(out.outcome).toMatchObject({ status: 'applied', awardedTrophyIds: [tid] });
    s2 = await reload(s2, dbName);
    // 4. Display it; reload; everything is still there and consistent.
    await s2.trophyDisplay.display(RYAN, tid, cab.id, 0);
    const s3 = await reload(s2, dbName);
    st = await s3.career.loadClubhouse(RYAN);
    expect(st.placements).toEqual([{ trophyInstanceId: tid, furnitureInstanceId: cab.id, slotIndex: 0 }]);
    expect(st.career.totals).toMatchObject({ events: 1, wins: 1 });
    expect(st.career.achievements.first_win).toBeDefined();
    expect(st.balance).toBe(START - 300 - 100);
    await expect(s3.economy.verifyIntegrity(RYAN)).resolves.toBeUndefined();
  });
});

describe('save files', () => {
  it('exports and re-imports a save exactly', async () => {
    const { s } = await newCareer();
    await buyCabinet(s);
    await playTournament(s, 'amateur-1-w2');
    await s.career.doAction('train_putting');
    const file = await s.saves.exportSave();
    expect(file).toMatchObject({ format: 'ryans-road-save', schemaVersion: CURRENT_SCHEMA_VERSION });
    const { s: other } = await newCareer();
    await other.saves.importSave(JSON.parse(JSON.stringify(file)));
    const again = await other.saves.exportSave();
    expect(again.tables).toEqual(file.tables);
    const st = await other.career.loadClubhouse(RYAN);
    expect(st.career.actionsUsed).toBe(1);
    expect(st.trophies).toHaveLength(1);
  });

  it('rebuilds the balance from the ledger on import (no smuggled money)', async () => {
    const { s } = await newCareer();
    const file = await s.saves.exportSave();
    (file.tables.balances as { balance: number }[])[0].balance = 9_999_999;
    const { s: other } = await newCareer();
    await other.saves.importSave(file);
    expect(await other.economy.getBalance(RYAN)).toBe(START);
  });

  it('rejects invalid or future save files without touching the current save', async () => {
    const { s } = await newCareer();
    await buyCabinet(s);
    const good = await s.saves.exportSave();
    for (const bad of [
      { nope: true },
      { ...good, format: 'wtg-underground-save' },
      { ...good, schemaVersion: CURRENT_SCHEMA_VERSION + 1 },
      { ...good, tables: { ...good.tables, careers: [{ id: 'career', week: 99 }] } },
    ]) {
      const err = await s.saves.importSave(bad).catch((e) => e);
      expect(isDomainError(err, 'INVALID_SAVE')).toBe(true);
    }
    expect(await s.economy.getBalance(RYAN)).toBe(START - 300);
  });

  it('runtime validation blocks malformed writes at the persistence boundary', async () => {
    const { s } = await newCareer();
    const c = await s.career.getCareer();
    await expect(s.db.careers.put({ ...c, energy: 400 })).rejects.toThrow();
    await expect(s.db.ledger.add({ id: 'x', ownerId: RYAN, amount: 0 } as never)).rejects.toThrow();
    expect((await s.career.getCareer()).energy).toBe(c.energy);
  });
});
