import { describe, expect, it } from 'vitest';
import { CABINET_OAK_STARTER } from '../src/catalog/items';
import { getPropertyDefinition, STARTER_PAD_ID } from '../src/catalog/properties';
import { isDomainError } from '../src/core/errors';
import { compatibleZones } from '../src/services/roomService';
import { AFTER_CABINET, buyCabinet, newCareer, PAD, reload, RYAN } from './helpers';

describe('starter pad', () => {
  it('is owned from the start: three cabinet zones, decor zones, and spots locked until a bigger home', async () => {
    const { s } = await newCareer();
    const state = await s.career.loadClubhouse(RYAN);
    expect(state.property).toMatchObject({ propertyDefinitionId: 'starter_pad', ownerId: RYAN });
    expect(state.propertyDef.name).toBe('Starter Pad');
    const zones = getPropertyDefinition(STARTER_PAD_ID).zones;
    expect(zones.filter((z) => !z.reserved).map((z) => z.id).sort()).toEqual(['art_left', 'back_wall', 'left_corner', 'plant_spot', 'right_corner', 'rug_spot', 'table_spot']);
    expect(zones.filter((z) => z.reserved).length).toBeGreaterThan(0);
    expect(compatibleZones(STARTER_PAD_ID, CABINET_OAK_STARTER).map((z) => z.id).sort()).toEqual([
      'back_wall',
      'left_corner',
      'right_corner',
    ]);
  });
});

describe('room editor', () => {
  it('valid placement persists and bumps the layout version', async () => {
    const { s, dbName } = await newCareer();
    const { instance } = await buyCabinet(s);
    const res = await s.room.place(RYAN, PAD, instance.id, 'back_wall');
    expect(res.layoutVersion).toBe(1);
    const s2 = await reload(s, dbName);
    const f = await s2.db.furniture.get(instance.id);
    expect(f).toMatchObject({ propertyId: PAD, placementZoneId: 'back_wall' });
    expect(await s2.economy.getBalance(RYAN)).toBe(AFTER_CABINET); // placing never charges
  });

  it('invalid placements are rejected: reserved, unknown, unowned', async () => {
    const { s } = await newCareer();
    const { instance } = await buyCabinet(s);
    for (const [zone, code] of [
      ['sofa_spot', 'RESERVED_ZONE'],
      ['art_back', 'RESERVED_ZONE'],
      ['rug_spot', 'INCOMPATIBLE_ZONE'],
      ['hot_tub', 'UNKNOWN_ZONE'],
    ] as const) {
      const err = await s.room.place(RYAN, PAD, instance.id, zone).catch((e) => e);
      expect(isDomainError(err, code)).toBe(true);
    }
    const err = await s.room.place(RYAN, PAD, 'furn_not_mine', 'back_wall').catch((e) => e);
    expect(isDomainError(err, 'NOT_OWNED')).toBe(true);
    expect((await s.db.furniture.get(instance.id))?.placementZoneId).toBeUndefined();
  });

  it('a zone cannot hold conflicting furniture', async () => {
    const { s } = await newCareer();
    const a = (await buyCabinet(s)).instance;
    const b = (await buyCabinet(s)).instance;
    await s.room.place(RYAN, PAD, a.id, 'back_wall');
    const err = await s.room.place(RYAN, PAD, b.id, 'back_wall').catch((e) => e);
    expect(isDomainError(err, 'ZONE_OCCUPIED')).toBe(true);
    // A draft putting both in one zone is rejected as a whole.
    const p = await s.room.getProperty(RYAN, PAD);
    const err2 = await s.room.commitLayout(RYAN, PAD, p.layoutVersion, { [a.id]: 'left_corner', [b.id]: 'left_corner' }).catch((e) => e);
    expect(isDomainError(err2, 'ZONE_OCCUPIED')).toBe(true);
    // But swapping two cabinets in one commit works.
    await s.room.place(RYAN, PAD, b.id, 'right_corner');
    const p2 = await s.room.getProperty(RYAN, PAD);
    await s.room.commitLayout(RYAN, PAD, p2.layoutVersion, { [a.id]: 'right_corner', [b.id]: 'back_wall' });
    expect((await s.db.furniture.get(a.id))?.placementZoneId).toBe('right_corner');
    expect((await s.db.furniture.get(b.id))?.placementZoneId).toBe('back_wall');
  });

  it('moving furniture changes the zone without duplicating the item', async () => {
    const { s } = await newCareer();
    const { instance } = await buyCabinet(s);
    await s.room.place(RYAN, PAD, instance.id, 'back_wall');
    await s.room.move(RYAN, PAD, instance.id, 'left_corner');
    const all = await s.db.furniture.where('ownerId').equals(RYAN).toArray();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ id: instance.id, placementZoneId: 'left_corner' });
    expect(await s.economy.getBalance(RYAN)).toBe(AFTER_CABINET);
    expect(await s.economy.listTransactions(RYAN)).toHaveLength(2);
  });

  it('removing furniture returns it to inventory (still owned)', async () => {
    const { s } = await newCareer();
    const { instance } = await buyCabinet(s);
    await s.room.place(RYAN, PAD, instance.id, 'back_wall');
    await s.room.returnToInventory(RYAN, PAD, instance.id);
    const f = await s.db.furniture.get(instance.id);
    expect(f).toBeDefined();
    expect(f?.placementZoneId).toBeUndefined();
    expect(f?.propertyId).toBeUndefined();
  });

  it('a failed or cancelled edit leaves saved state untouched', async () => {
    const { s } = await newCareer();
    const { instance } = await buyCabinet(s);
    await s.room.place(RYAN, PAD, instance.id, 'back_wall');
    const before = await s.db.furniture.toArray();
    const p = await s.room.getProperty(RYAN, PAD);
    // Mixed valid+invalid draft is atomic: nothing applies.
    await s.room.commitLayout(RYAN, PAD, p.layoutVersion, { [instance.id]: 'sofa_spot' }).catch(() => {});
    // Stale drafts are refused.
    const err = await s.room.commitLayout(RYAN, PAD, p.layoutVersion - 1, { [instance.id]: 'left_corner' }).catch((e) => e);
    expect(isDomainError(err, 'STALE_LAYOUT')).toBe(true);
    expect(await s.db.furniture.toArray()).toEqual(before);
    expect((await s.room.getProperty(RYAN, PAD)).layoutVersion).toBe(p.layoutVersion);
  });
});

describe('clubhouse layout (Career Legacy V1 revision)', () => {
  it('three trophy cabinets stand in a row on the back wall; the side walls hold nothing', () => {
    const zones = getPropertyDefinition('hillside_house').zones;
    const cab = zones.filter((z) => z.accepts.includes('display_cabinet'));
    expect(cab.map((z) => z.id)).toEqual(['left_corner', 'back_wall', 'right_corner']);
    // Same base line (where the room art's floor meets the back wall), inside x 140-820, no overlaps.
    expect(new Set(cab.map((z) => z.baseY))).toEqual(new Set([360]));
    const spans = cab.map((z) => [z.x - z.width / 2, z.x + z.width / 2]).sort((a, b) => a[0] - b[0]);
    expect(spans[0][0]).toBeGreaterThanOrEqual(140);
    expect(spans[2][1]).toBeLessThanOrEqual(820);
    for (let i = 1; i < spans.length; i++) expect(spans[i][0]).toBeGreaterThan(spans[i - 1][1]);
    // Everything else stands on the floor (in front of the back wall) or hangs on the back wall.
    for (const z of zones.filter((z) => !z.accepts.includes('display_cabinet'))) {
      if (z.accepts.includes('wall_art')) expect(z.baseY, z.id).toBeLessThan(360);
      else expect(z.baseY, z.id).toBeGreaterThan(360);
    }
  });

  it('a spot reserved for a bigger home takes nothing, even an item the current home allows', async () => {
    const { s } = await newCareer();
    const plant = (await s.store.purchase(RYAN, 'decor_plant', 'plant-1')).instance;
    const err = await s.room.place(RYAN, PAD, plant.id, 'plant_right').catch((e) => e);
    expect(isDomainError(err, 'RESERVED_ZONE')).toBe(true);
    await s.room.place(RYAN, PAD, plant.id, 'plant_spot');
  });
});
