/**
 * Casino Secrets & Rivalries, Slice 1: permanent casino unlocks on bankroll peaks (through the
 * central ledger, for every income source, and for existing saves), the location registry,
 * dealer relationships and tipping (totals, frequency, diminishing returns, no decay, no
 * penalty for not tipping), and that tips never touch a game's odds, payouts or statistics.
 */
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { totalReturn } from '../src/casino/baccarat';
import { isDomainError } from '../src/core/errors';
import { LOCATIONS, isUnlocked, unlockThreshold } from '../src/expansion/locations';
import { deriveFromLedger, UNLOCK_RULES } from '../src/expansion/unlocks';
import { DEALERS } from '../src/npc/registry';
import {
  applyInteraction, applyTip, applyVisit, freshNpcState, GOODWILL_CAP, NEUTRAL_BASE, normalizeNpcState, relationshipOf, TIERS, tierIdOf, tierOf,
  tipFrequency, TIP_AMOUNTS, TIP_GAIN_CAP, VISIT_GAIN_CAP,
} from '../src/npc/relationship';
import { RELATIONSHIP_CONFIG } from '../src/npc/config';
import { eligibleHooks, RELATIONSHIP_HOOKS } from '../src/npc/hooks';
import { pickTipLine, TIP_SCRIPTS } from '../src/npc/tipLines';
import { CURRENT_SCHEMA_VERSION, STORES_V2 } from '../src/persistence/db';
import { createServices, type GameServices } from '../src/services';
import { setCareer } from './careerHelpers';
import { newCareer, reload, RYAN, spend, START } from './helpers';

const WB = 'unlock:white_buffalo';
const MS = 'unlock:morongo_sky';
let n = 0;
const add = (s: GameServices, amount: number, type: 'prize_money' | 'sponsor_income' | 'job_wage' | 'story' | 'casino' = 'job_wage') =>
  s.economy.post({ ownerId: RYAN, amount, type, sourceId: 'test', idempotencyKey: `t-${++n}` });
const unlockIds = async (s: GameServices) => (await s.db.unlocks.toArray()).map((u) => u.id).sort();

describe('location registry', () => {
  it('three casinos in canon order; Desert Palms open with every existing game; the others unlock on bankroll', () => {
    expect(LOCATIONS.map((l) => l.id)).toEqual(['desert_palms', 'white_buffalo', 'morongo_sky']);
    const dp = LOCATIONS[0];
    expect(dp.unlock).toBeNull();
    expect(isUnlocked(dp, new Set())).toBe(true);
    expect(dp.games.map((g) => g.id)).toEqual(['blackjack', 'slots', 'craps', 'roulette', 'baccarat', 'threecard', 'greyhounds', 'sportsbook']);
    expect(unlockThreshold(LOCATIONS[1])).toBe(100_000);
    expect(unlockThreshold(LOCATIONS[2])).toBe(1_000_000);
    expect(isUnlocked(LOCATIONS[1], new Set([WB]))).toBe(true);
    expect(isUnlocked(LOCATIONS[2], new Set([WB]))).toBe(false);
    expect(UNLOCK_RULES.map((r) => r.threshold)).toEqual([100_000, 1_000_000]);
  });
});

describe('casino unlocks through the central ledger', () => {
  it('a new career has none; $99,999 is not enough; exactly $100,000 unlocks White Buffalo', async () => {
    const { s } = await newCareer();
    expect(await unlockIds(s)).toEqual([]);
    expect((await s.db.milestones.get(RYAN))?.peakBalance).toBe(START);
    await add(s, 99_999 - START);
    expect(await unlockIds(s)).toEqual([]);
    const { transaction } = await add(s, 1);
    expect(await unlockIds(s)).toEqual([WB]);
    const u = (await s.db.unlocks.get(WB))!;
    expect(u).toMatchObject({ trigger: 'live', txnId: transaction.id, threshold: 100_000, balance: 100_000, at: transaction.timestamp });
    s.db.close();
  });

  it('every income source counts (prize, sponsor, wages, story, casino)', async () => {
    for (const type of ['prize_money', 'sponsor_income', 'job_wage', 'story', 'casino'] as const) {
      const { s } = await newCareer();
      await add(s, 100_000 - START, type);
      expect(await unlockIds(s), type).toEqual([WB]);
      s.db.close();
    }
  });

  it('crossing through real services: a career step and a casino payout', async () => {
    const { s } = await newCareer();
    await s.career.runStep((c) => ({ career: c, money: [{ amount: 99_990 - START, type: 'story', sourceId: 'test', key: 'story-step' }] }));
    expect(await unlockIds(s)).toEqual([]);
    await s.casino.visit();
    const id = s.casino.newRoundId('blackjack');
    await s.casino.wager('blackjack', id, 'main', 10);
    await s.casino.settle('blackjack', id, 'result', 25);
    expect(await s.economy.getBalance(RYAN)).toBe(100_005);
    expect(await unlockIds(s)).toEqual([WB]);
    expect((await s.db.unlocks.get(WB))!.trigger).toBe('live');
    s.db.close();
  });

  it('Morongo Sky at exactly $1,000,000; both unlocks survive a crash in the bankroll and a reload', async () => {
    const { s, dbName } = await newCareer();
    await add(s, 999_999 - START);
    expect(await unlockIds(s)).toEqual([WB]);
    await add(s, 1);
    expect(await unlockIds(s)).toEqual([MS, WB]);
    await spend(s, 990_000);
    expect(await s.economy.getBalance(RYAN)).toBe(10_000);
    const s2 = await reload(s, dbName);
    expect(await unlockIds(s2)).toEqual([MS, WB]);
    const view = await s2.career.loadClubhouse(RYAN);
    expect(view.expansion.unlocks.map((u) => u.id).sort()).toEqual([MS, WB]);
    expect(view.expansion.peakBalance).toBe(1_000_000);
    // Earning more never rewrites the original unlock.
    const before = await s2.db.unlocks.get(MS);
    await add(s2, 2_000_000);
    expect(await s2.db.unlocks.get(MS)).toEqual(before);
    await expect(s2.economy.verifyIntegrity(RYAN)).resolves.toBeUndefined();
    s2.db.close();
  });

  it('a payment that fails (insufficient funds) rolls back with nothing unlocked', async () => {
    const { s } = await newCareer();
    const e = await spend(s, START + 1).catch((x) => x);
    expect(isDomainError(e, 'INSUFFICIENT_FUNDS')).toBe(true);
    expect(await unlockIds(s)).toEqual([]);
    s.db.close();
  });
});

describe('existing saves', () => {
  it('derives the first crossing and the peak from the ledger', () => {
    const t = (seq: number, balanceAfter: number) => ({ id: `x${seq}`, ownerId: RYAN, amount: 1, type: 'job_wage' as const, sourceId: 's', timestamp: `2027-01-0${seq}T00:00:00.000Z`, balanceAfter, seq, idempotencyKey: `k${seq}` });
    const d = deriveFromLedger([t(1, 50_000), t(2, 120_000), t(3, 90_000), t(4, 150_000), t(5, 20_000)], RYAN);
    expect(d.milestone).toMatchObject({ peakBalance: 150_000, peakTxnId: 'x4' });
    expect(d.unlocks).toEqual([expect.objectContaining({ id: WB, txnId: 'x2', balance: 120_000, trigger: 'backfill' })]);
  });

  it('a v2 database that once peaked at $150K (now $20K) opens at v3, and the start-up check unlocks White Buffalo only', async () => {
    const { s } = await newCareer();
    await add(s, 150_000 - START);
    await spend(s, 130_000);
    const tables: Record<string, unknown[]> = {};
    for (const name of Object.keys(STORES_V2)) tables[name] = await s.db.table(name).toArray();
    s.db.close();
    const name = `v2-${Date.now()}-${++n}`;
    const v2 = new Dexie(name);
    v2.version(2).stores(STORES_V2);
    await v2.open();
    for (const [t, rows] of Object.entries(tables)) await v2.table(t).bulkAdd(rows);
    v2.close();

    const s2 = createServices(name);
    await s2.career.ensureCareer(RYAN);
    expect(s2.db.verno).toBe(CURRENT_SCHEMA_VERSION);
    expect(await unlockIds(s2)).toEqual([]); // nothing invented on open
    expect(await s2.expansion.reconcile()).toEqual([WB]);
    const u = (await s2.db.unlocks.get(WB))!;
    expect(u.trigger).toBe('backfill');
    expect(u.balance).toBeGreaterThanOrEqual(100_000);
    expect((await s2.db.milestones.get(RYAN))!.peakBalance).toBe(150_000);
    expect(await s2.expansion.reconcile()).toEqual([]); // idempotent
    expect(await s2.economy.getBalance(RYAN)).toBe(20_000); // nothing about the money changed
    await expect(s2.economy.verifyIntegrity(RYAN)).resolves.toBeUndefined();
    s2.db.close();
  });

  it('an old save that never ran the check still unlocks correctly on its next transaction', async () => {
    const { s } = await newCareer();
    await add(s, 200_000);
    await s.db.unlocks.clear();
    await s.db.milestones.clear();
    await add(s, 5);
    const u = (await s.db.unlocks.get(WB))!;
    expect(u.trigger).toBe('backfill'); // crossed earlier, recognised now
    s.db.close();
  });

  it('a v2 save file imports with its unlocks recognised; a v3 file round-trips', async () => {
    const { s } = await newCareer();
    await add(s, 1_200_000);
    await spend(s, 1_100_000);
    const file = await s.saves.exportSave();
    expect(file.schemaVersion).toBe(CURRENT_SCHEMA_VERSION); // v4 since the living sports universe (Phase D part 3)
    const old = structuredClone(file);
    old.schemaVersion = 2;
    for (const t of ['unlocks', 'milestones', 'npcState', 'relationshipLog', 'locationState'] as const) delete old.tables[t];
    const { s: a } = await newCareer();
    await a.saves.importSave(old);
    expect(await unlockIds(a)).toEqual([MS, WB]);
    expect((await a.db.unlocks.toArray()).every((u) => u.trigger === 'backfill')).toBe(true);
    const { s: b } = await newCareer();
    await b.saves.importSave(file);
    expect(await b.db.unlocks.toArray()).toEqual(await s.db.unlocks.toArray());
    // A file can't lose an unlock its own ledger proves.
    const stripped = structuredClone(file);
    stripped.tables.unlocks = [];
    const { s: c } = await newCareer();
    await c.saves.importSave(stripped);
    expect(await unlockIds(c)).toEqual([MS, WB]);
    for (const x of [s, a, b, c]) x.db.close();
  });
});

describe('tipping rules (pure)', () => {
  const at = '2027-03-01T00:00:00.000Z';
  it('five tiers; everyone starts an Acquaintance; tips alone can never pass Regular', () => {
    expect(TIERS.map((t) => t.label)).toEqual(['Acquaintance', 'Regular', 'Friend', 'Confidant', 'Inner Circle']);
    expect(TIERS.map((t) => t.id)).toEqual(RELATIONSHIP_CONFIG.tiers.map((t) => t.id));
    expect(tierOf(freshNpcState('waifu'))).toBe('Acquaintance');
    expect(tierOf({ base: NEUTRAL_BASE, goodwill: GOODWILL_CAP })).toBe('Regular');
  });

  it('higher tiers need meaningful interactions; tier advancement is flagged and remembered', () => {
    let s = freshNpcState('winston');
    for (let v = 0; v < 40; v++) for (let i = 0; i < 3; i++) s = applyTip(s, 100, 10, `v${v}`, at).next;
    expect(tierIdOf(s)).toBe('regular');
    expect(s.flags!.reached_regular).toBe(at);
    s = applyInteraction(s, 8, 'helped_winston', at);
    expect(tierIdOf(s)).toBe('friend');
    expect(s.flags!.reached_friend).toBe(at);
    expect(s.memories!.map((m) => m.key)).toContain('helped_winston');
    s = applyInteraction(s, 30, 'big_favour', at);
    expect(tierIdOf(s)).toBe('inner_circle');
    expect(relationshipOf(s)).toBeLessThanOrEqual(100);
  });

  it('the tier-up event fires on the tip that crosses a tier', () => {
    let s = freshNpcState('velvet_vega');
    const events: string[] = [];
    for (let v = 0; v < 6; v++) for (let i = 0; i < 2; i++) {
      const o = applyTip(s, 100, 10, `v${v}`, at);
      events.push(o.event);
      s = o.next;
    }
    expect(events.filter((e) => e === 'tier_up')).toHaveLength(1);
    expect(events[0]).toBe('tip_first');
  });

  it('relationship hooks: none registered yet; a registered hook becomes eligible once, at its tier', () => {
    expect(RELATIONSHIP_HOOKS).toEqual([]);
    const hook = { id: 'test_invite', npc: 'winston' as const, minTier: 'friend' as const, onceFlag: 'invited' };
    const s = freshNpcState('winston');
    expect(eligibleHooks(s, [hook])).toEqual([]);
    const friend = applyInteraction(s, 25, 'x', at);
    expect(eligibleHooks(friend, [hook]).map((h) => h.id)).toEqual(['test_invite']);
    expect(eligibleHooks({ ...friend, flags: { invited: true } }, [hook])).toEqual([]);
    expect(eligibleHooks(friend, [{ ...hook, npc: 'waifu' as const }])).toEqual([]);
  });

  it('rows saved by v0.15.0 (no flags, memories or visit count) load with sensible defaults', () => {
    const old = { npcId: 'waifu' as const, base: 50, goodwill: 2, visits: 3, lastVisitKey: '1:3', tips: { lifetime: 30, count: 2, largest: 25, visitKeys: ['1:1', '1:3'], visitKey: '1:3', visitGain: 1 } };
    const n = normalizeNpcState(old);
    expect(n.tips.visitsTipped).toBe(2);
    expect(n.flags).toEqual({});
    expect(n.memories).toEqual([]);
    expect(tipFrequency(n)).toBeCloseTo(2 / 3);
  });

  it('diminishing returns: bigger tips help more, but far less than proportionally, and one tip is capped', () => {
    const g = (amt: number) => applyTip(freshNpcState('velvet_vega'), amt, 10, 'v1', at).gain;
    expect(g(25)).toBeGreaterThan(g(5));
    expect(g(100)).toBeGreaterThan(g(25));
    expect(g(100) / g(5)).toBeLessThan(6); // 20× the money, under 6× the gain
    expect(g(1_000_000)).toBeLessThanOrEqual(TIP_GAIN_CAP);
  });

  it('per-visit cap, goodwill cap, and huge tips can’t buy friendship', () => {
    let s = freshNpcState('winston');
    let visitGain = 0;
    for (let i = 0; i < 20; i++) {
      const o = applyTip(s, 1_000_000, 10, 'v1', at);
      visitGain += o.gain;
      s = o.next;
    }
    expect(visitGain).toBeLessThanOrEqual(VISIT_GAIN_CAP + 1e-9);
    for (let v = 2; v < 60; v++) for (let i = 0; i < 5; i++) s = applyTip(s, 100, 10, `v${v}`, at).next;
    expect(s.goodwill).toBeLessThanOrEqual(GOODWILL_CAP);
    expect(s.goodwill).toBeGreaterThan(GOODWILL_CAP - 0.5);
    expect(tierOf(s)).toBe('Regular');
    expect(s.tips.count).toBe(20 + 58 * 5);
    expect(s.tips.visitsTipped).toBe(59);
    expect(s.tips.largest).toBe(1_000_000);
    expect(s.tips.visitKeys).toHaveLength(8);
  });

  it('consistency: tipping on recent visits earns a little more than a first-time tipper', () => {
    const fresh = applyTip(freshNpcState('waifu'), 25, 10, 'v9', at).gain;
    let s = freshNpcState('waifu');
    for (const v of ['v1', 'v2', 'v3']) s = applyTip(s, 5, 10, v, at).next;
    const s2 = { ...s, goodwill: 0 }; // same goodwill, only the history differs
    const regular = applyTip(s2, 25, 10, 'v9', at).gain;
    expect(regular).toBeGreaterThan(fresh);
    expect(regular).toBeLessThan(fresh * 1.5 + 1e-9);
  });

  it('no decay and no penalty: visits without tips never lower anything', () => {
    let s = applyTip(freshNpcState('stick_lady'), 25, 5, 'v1', at).next;
    const g = s.goodwill;
    for (let v = 2; v < 100; v++) s = applyVisit(s, `v${v}`);
    expect(s.goodwill).toBe(g);
    expect(s.base).toBe(NEUTRAL_BASE);
    expect(s.visits).toBe(98);
    const never = Array.from({ length: 50 }, (_, i) => i).reduce((x, i) => applyVisit(x, `w${i}`), freshNpcState('madame_monique'));
    expect(never.base).toBe(NEUTRAL_BASE);
    expect(never.goodwill).toBe(0);
    expect(tierOf(never)).toBe('Acquaintance');
  });

  it('reaction events: first tip, generous, huge, maxed', () => {
    const s0 = freshNpcState('velvet_vega');
    expect(applyTip(s0, 5, 10, 'v1', at).event).toBe('tip_first');
    const s1 = applyTip(s0, 5, 10, 'v1', at).next;
    expect(applyTip(s1, 5, 10, 'v1', at).event).toBe('tip_small');
    expect(applyTip(s1, 25, 10, 'v1', at).event).toBe('tip_generous');
    expect(applyTip(s1, 100, 10, 'v1', at).event).toBe('tip_huge');
    expect(applyTip({ ...s1, goodwill: GOODWILL_CAP }, 5, 10, 'v1', at).event).toBe('tip_maxed');
  });

  it('every dealer has draft lines for every tip event; no line promises a better game', () => {
    for (const d of DEALERS) {
      for (const [ev, lines] of Object.entries(TIP_SCRIPTS[d.id])) {
        expect(lines.length, `${d.id} ${ev}`).toBeGreaterThan(0);
        for (const t of lines) expect(t).not.toMatch(/\b(luck(ier)?|win more|better odds|rig)\b/i);
      }
      const l1 = pickTipLine(d.id, 'tip_small', []);
      expect(l1.status).toBe('draft');
      expect(pickTipLine(d.id, 'tip_small', [l1.id]).id).not.toBe(l1.id);
    }
  });
});

describe('tipping through the casino', () => {
  async function inCasino() {
    const ctx = await newCareer();
    await ctx.s.casino.visit();
    return ctx;
  }
  const nextVisit = (s: GameServices) =>
    setCareer(s, (c) => {
      c.week += 1;
      c.flags.casinoVisit = `${c.season}:${c.week}`;
    });

  it('needs a casino visit, a listed amount and the money for it', async () => {
    const { s } = await newCareer();
    expect(isDomainError(await s.npc.tip('waifu', 5, 'a').catch((e) => e), 'CAREER_RULE')).toBe(true);
    await s.casino.visit();
    expect(isDomainError(await s.npc.tip('waifu', 7, 'b').catch((e) => e), 'CAREER_RULE')).toBe(true);
    const bank = await s.economy.getBalance(RYAN);
    await spend(s, bank - 3);
    expect(isDomainError(await s.npc.tip('waifu', 5, 'c').catch((e) => e), 'INSUFFICIENT_FUNDS')).toBe(true);
    expect(await s.npc.history('waifu')).toEqual([]);
    s.db.close();
  });

  it('debits once per tip id, records totals and history, and keeps the ledger intact', async () => {
    const { s, dbName } = await inCasino();
    const bank = await s.economy.getBalance(RYAN);
    const r1 = await s.npc.tip('velvet_vega', 25, 'press-1');
    expect(r1.replayed).toBe(false);
    expect(r1.outcome!.event).toBe('tip_first');
    const again = await s.npc.tip('velvet_vega', 25, 'press-1'); // double click / retry
    expect(again.replayed).toBe(true);
    await s.npc.tip('velvet_vega', 5, 'press-2');
    expect(await s.economy.getBalance(RYAN)).toBe(bank - 30);
    const txs = (await s.economy.listTransactions(RYAN)).filter((t) => t.type === 'tip');
    expect(txs.map((t) => [t.amount, t.sourceId])).toEqual([[-25, 'velvet_vega'], [-5, 'velvet_vega']]);
    const st = (await s.db.npcState.get('velvet_vega'))!;
    expect(st.tips).toMatchObject({ lifetime: 30, count: 2, largest: 25 });
    const hist = await s.npc.history('velvet_vega');
    expect(hist.filter((h) => h.kind === 'tip').map((h) => h.amount)).toEqual([25, 5]);
    expect(hist.map((h) => h.seq)).toEqual(hist.map((_, i) => i + 1));
    await expect(s.economy.verifyIntegrity(RYAN)).resolves.toBeUndefined();
    // Persists across a reload.
    const s2 = await reload(s, dbName);
    expect((await s2.db.npcState.get('velvet_vega'))!.tips.lifetime).toBe(30);
    const view = await s2.career.loadClubhouse(RYAN);
    expect(view.expansion.npcs.find((x) => x.npcId === 'velvet_vega')!.tips.count).toBe(2);
    s2.db.close();
  });

  it('tracks frequency across visits; dealers Ryan never tips stay neutral', async () => {
    const { s } = await inCasino();
    for (let v = 0; v < 4; v++) {
      await s.npc.visit('waifu');
      await s.npc.visit('winston');
      await s.npc.visit('waifu'); // same visit: counted once
      if (v % 2 === 0) await s.npc.tip('waifu', 5, `w${v}`);
      await nextVisit(s);
    }
    const [w, x] = [(await s.db.npcState.get('waifu'))!, (await s.db.npcState.get('winston'))!];
    expect(w.visits).toBe(4);
    expect(w.tips.count).toBe(2);
    expect(w.tips.visitKeys).toHaveLength(2);
    expect(x.visits).toBe(4);
    expect(x.tips.count).toBe(0);
    expect(x.goodwill).toBe(0);
    expect(tierOf(x)).toBe('Acquaintance');
    expect(w.tips.visitsTipped).toBe(2);
    expect(tipFrequency(w)).toBe(0.5);
    expect(w.tips.lastAt).toBeDefined();
    s.db.close();
  });

  it('Winston can’t be tipped mid-hand (the dealt hand is saved)', async () => {
    const { s } = await inCasino();
    const p = await s.casino.startThreeCard(10, 0);
    expect(isDomainError(await s.npc.tip('winston', 5, 'mid').catch((e) => e), 'CAREER_RULE')).toBe(true);
    await s.casino.finishThreeCard(p.roundId, false);
    expect((await s.npc.tip('winston', 5, 'after')).replayed).toBe(false);
    s.db.close();
  });

  it('tips never touch casino statistics, payouts or settlement limits', async () => {
    const { s } = await inCasino();
    const c0 = await s.career.getCareer();
    for (const d of DEALERS) for (const a of TIP_AMOUNTS) await s.npc.tip(d.id, a, `${d.id}-${a}`);
    const c1 = await s.career.getCareer();
    for (const k of ['casinoWagered', 'casinoReturned', 'casinoBiggestWin']) expect(c1.flags[k]).toEqual(c0.flags[k]);
    // A baccarat hand after tipping pays exactly what the rules say.
    for (let i = 0; i < 10; i++) {
      const r = await s.casino.playBaccarat({ banker: 25 });
      expect(r.payout).toBe(totalReturn({ banker: 25 }, r.hand.outcome));
    }
    await expect(s.economy.verifyIntegrity(RYAN)).resolves.toBeUndefined();
    s.db.close();
  });

  it('no casino rules module can see tips, relationships or unlocks', () => {
    const dir = join(__dirname, '../src/casino');
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.ts'))) {
      const src = readFileSync(join(dir, f), 'utf8');
      expect(src, f).not.toMatch(/from '\.\.\/(npc|expansion|services|ui)\//);
    }
  });
});

describe('lobby art and music hooks', () => {
  it('each casino has a 1200x520 panel; the locked ones have matching transparent overlays; every location names its music cues', async () => {
    const { decodePng } = await import('./png');
    const dir = join(__dirname, '../src/assets/casino/lobby');
    for (const f of ['white_buffalo_locked.png', 'morongo_sky_locked.png', 'card_frame.png']) {
      const png = decodePng(join(dir, f));
      expect([png.width, png.height], f).toEqual([1200, 520]);
    }
    for (const l of LOCATIONS) {
      expect(readdirSync(dir)).toContain(`${l.id}_art.webp`);
      expect(Object.keys(l.music).sort()).toEqual(['bar', 'floor', 'lobby', 'vip']);
      expect(Object.values(l.music).every((c) => c.startsWith(l.id))).toBe(true);
    }
    const { requestCasinoMusic, requestedCasinoMusic } = await import('../src/expansion/music');
    requestCasinoMusic(LOCATIONS[0].music.lobby);
    expect(requestedCasinoMusic()).toBe('desert_palms_lobby');
  });
});

describe('casino chip themes (Chip Pack V7)', () => {
  const CASINOS = ['desert_palms', 'white_buffalo', 'morongo_sky'] as const;
  const V7 = join(__dirname, '../src/assets/casino/chips/v7');

  it('the manifest maps all 21 chips: 3 casinos x $1, $5, $10, $25, $100, $500, $1,000', async () => {
    const { CHIP_MANIFEST, CHIP_DENOMINATIONS } = await import('../src/expansion/chipThemes');
    expect([...CHIP_DENOMINATIONS]).toEqual([1, 5, 10, 25, 100, 500, 1000]);
    expect(CHIP_MANIFEST.denominations).toEqual([...CHIP_DENOMINATIONS]);
    expect(CHIP_MANIFEST.files).toHaveLength(21);
    const keys = new Set(CHIP_MANIFEST.files.map((f) => `${f.casino}:${f.denomination}`));
    for (const c of CASINOS) for (const d of CHIP_DENOMINATIONS) expect(keys.has(`${c}:${d}`), `${c} $${d}`).toBe(true);
  });

  it('every chip is one round 256x256 transparent PNG with padding on all sides', async () => {
    const { CHIP_MANIFEST } = await import('../src/expansion/chipThemes');
    const { decodePng } = await import('./png');
    for (const f of CHIP_MANIFEST.files) {
      const png = decodePng(join(V7, f.path));
      expect([png.width, png.height], f.path).toEqual([256, 256]);
      const a = (x: number, y: number) => png.data[(y * 256 + x) * 4 + 3];
      let x0 = 256, x1 = -1, y0 = 256, y1 = -1, n = 0;
      for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) if (a(x, y) > 16) { n++; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      expect(Math.min(x0, y0, 255 - x1, 255 - y1), `${f.path} padding`).toBeGreaterThanOrEqual(16);
      const w = x1 - x0 + 1, h = y1 - y0 + 1;
      expect(Math.abs(w - h), `${f.path} not oval`).toBeLessThanOrEqual(2);
      // Filled area matches a disc of that width (a square or oval would not).
      expect(n / (Math.PI * (w / 2) ** 2), `${f.path} round`).toBeCloseTo(1, 1);
      expect(a(128, 128), f.path).toBe(255);
    }
  });

  it('each casino shows its own V7 chips through one shared lookup', async () => {
    const { CHIP_THEMES, CHIP_DENOMINATIONS, chipAsset } = await import('../src/expansion/chipThemes');
    const urls = new Set<string>();
    for (const c of CASINOS) {
      expect(CHIP_THEMES[c].location).toBe(c);
      for (const d of CHIP_DENOMINATIONS) {
        const asset = chipAsset(c, d)!;
        expect(asset.source, `${c} $${d}`).toBe('v7');
        expect(CHIP_THEMES[c].face(d)).toBe(asset.url);
        urls.add(asset.url);
      }
    }
    expect(urls.size).toBe(21);
    expect(CHIP_THEMES.white_buffalo.emblem).toBe('Buffalo');
  });

  it('felt chips pick the biggest face that fits, now including $10; unknown amounts have no face', async () => {
    const { chipFaceForAmount, chipAsset } = await import('../src/expansion/chipThemes');
    expect(chipFaceForAmount('desert_palms', 3)!.denomination).toBe(1);
    expect(chipFaceForAmount('desert_palms', 10)!.denomination).toBe(10);
    expect(chipFaceForAmount('white_buffalo', 24)!.denomination).toBe(10);
    expect(chipFaceForAmount('desert_palms', 250)!.denomination).toBe(100);
    expect(chipFaceForAmount('morongo_sky', 5000)!.denomination).toBe(1000);
    expect(chipAsset('desert_palms', 2)).toBeNull();
  });

  it('the V3 faces are kept as fallbacks until V7 passes QA', () => {
    for (const c of CASINOS) for (const d of [1, 5, 25, 100, 500, 1000]) expect(existsSync(join(__dirname, `../src/assets/casino/chips/${c}/chip_${d}.png`))).toBe(true);
  });

  it('chip art is presentation only: no casino rules or money code reads it', () => {
    for (const dir of ['../src/casino', '../src/services', '../src/career']) {
      const d = join(__dirname, dir);
      for (const f of readdirSync(d).filter((x) => x.endsWith('.ts'))) expect(readFileSync(join(d, f), 'utf8'), f).not.toMatch(/chipThemes/);
    }
  });
});
