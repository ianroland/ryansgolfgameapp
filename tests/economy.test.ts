import { describe, expect, it } from 'vitest';
import { CABINET_OAK_STARTER } from '../src/catalog/items';
import { isDomainError } from '../src/core/errors';
import { AFTER_CABINET, buyCabinet, newCareer, reload, RYAN, spend, START } from './helpers';

describe('starting economy', () => {
  it('a new career starts with $2,500 savings from a single recorded grant', async () => {
    const { s } = await newCareer();
    expect(await s.economy.getBalance(RYAN)).toBe(START);
    const txs = await s.economy.listTransactions(RYAN);
    expect(txs).toHaveLength(1);
    expect(txs[0]).toMatchObject({ type: 'career_start_grant', amount: START, balanceAfter: START });
  });

  it('ensureCareer is idempotent and never re-grants', async () => {
    const { s } = await newCareer();
    await s.career.ensureCareer(RYAN);
    await s.career.ensureCareer(RYAN);
    expect(await s.economy.getBalance(RYAN)).toBe(START);
    expect(await s.economy.listTransactions(RYAN)).toHaveLength(1);
  });
});

describe('cabinet purchase', () => {
  it('successful purchase: deducts $300, creates one owned instance, records the transaction', async () => {
    const { s } = await newCareer();
    const res = await buyCabinet(s, 'req-a');

    expect(res.status).toBe('purchased');
    expect(await s.economy.getBalance(RYAN)).toBe(AFTER_CABINET);
    expect(res.instance.catalogItemId).toBe(CABINET_OAK_STARTER);
    expect(res.instance.id).not.toBe(CABINET_OAK_STARTER);
    expect(res.instance.placementZoneId).toBeUndefined();
    expect(await s.store.ownedCount(RYAN, CABINET_OAK_STARTER)).toBe(1);

    const t = res.transaction;
    expect(t).toMatchObject({
      ownerId: RYAN,
      amount: -300,
      type: 'furniture_purchase',
      sourceId: CABINET_OAK_STARTER,
      balanceAfter: AFTER_CABINET,
    });
    expect(t.id).toMatch(/^txn_/);
    expect(Date.parse(t.timestamp)).not.toBeNaN();
    await expect(s.economy.verifyIntegrity(RYAN)).resolves.toBeUndefined();
  });

  it('rejects insufficient funds without charging or granting anything', async () => {
    const { s } = await newCareer();
    await spend(s, START - 450); // leaves $450
    await buyCabinet(s); // → $150
    const err = await buyCabinet(s).catch((e) => e);
    expect(isDomainError(err, 'INSUFFICIENT_FUNDS')).toBe(true);
    expect(await s.economy.getBalance(RYAN)).toBe(150);
    expect(await s.store.ownedCount(RYAN, CABINET_OAK_STARTER)).toBe(1);
    expect(await s.economy.listTransactions(RYAN)).toHaveLength(3);
  });

  it('duplicate purchase requests (replayed) charge once', async () => {
    const { s } = await newCareer();
    const first = await buyCabinet(s, 'same-request');
    const again = await buyCabinet(s, 'same-request');
    expect(again.status).toBe('duplicate');
    expect(again.transaction.id).toBe(first.transaction.id);
    expect(again.instance.id).toBe(first.instance.id);
    expect(await s.economy.getBalance(RYAN)).toBe(AFTER_CABINET);
    expect(await s.store.ownedCount(RYAN, CABINET_OAK_STARTER)).toBe(1);
  });

  it('duplicate purchase requests (concurrent double-click) charge once', async () => {
    const { s } = await newCareer();
    const results = await Promise.all([buyCabinet(s, 'dbl'), buyCabinet(s, 'dbl'), buyCabinet(s, 'dbl')]);
    expect(results.filter((r) => r.status === 'purchased')).toHaveLength(1);
    expect(new Set(results.map((r) => r.instance.id)).size).toBe(1);
    expect(await s.economy.getBalance(RYAN)).toBe(AFTER_CABINET);
    expect(await s.store.ownedCount(RYAN, CABINET_OAK_STARTER)).toBe(1);
  });

  it('item ownership and balance persist across a reload', async () => {
    const { s, dbName } = await newCareer();
    const { instance } = await buyCabinet(s);
    const s2 = await reload(s, dbName);
    const state = await s2.career.loadClubhouse(RYAN);
    expect(state.balance).toBe(AFTER_CABINET);
    expect(state.furniture.map((f) => f.id)).toEqual([instance.id]);
  });

  it('rejects unknown items', async () => {
    const { s } = await newCareer();
    const err = await s.store.purchase(RYAN, 'golden_toilet', 'x').catch((e) => e);
    expect(isDomainError(err, 'UNKNOWN_ITEM')).toBe(true);
    expect(await s.economy.getBalance(RYAN)).toBe(START);
  });
});
