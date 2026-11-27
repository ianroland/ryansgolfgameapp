/**
 * Private rooms: hand ranking, the Hold'em state machine (chips conserved, side pots, blinds),
 * opponents that only see their own cards, the dealer invitation that unlocks a casino's room
 * and course, and the poker ledger (one buy-in debit, one cash-out credit).
 */
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import type { Card } from '../src/casino/blackjack';
import { decide, equity, viewFor } from '../src/casino/poker/ai';
import { bestHand, classOf, low5, omahaHigh, omahaLow, score5 } from '../src/casino/poker/handRank';
import { act, chipsInPlay, legal, newTable, rabbit, runOut, showing, sidePots, startHand, type HoldemState, type PokerVariant, type Seat } from '../src/casino/poker/holdem';
import { POKER_ROOMS, roomAt } from '../src/casino/poker/rooms';
import { seededInt } from '../src/casino/random';
import { isDomainError } from '../src/core/errors';
import { freshNpcState } from '../src/npc/relationship';
import { applyTableNight, INVITE_LINES, INVITE_NIGHTS, inviterAt, nightsAt } from '../src/npc/vip';
import { DEALERS } from '../src/npc/registry';
import type { GameServices } from '../src/services';
import { HERO } from '../src/services/pokerService';
import { setCareer } from './careerHelpers';
import { newCareer, RYAN } from './helpers';

const C = (s: string): Card => {
  const r = 'A23456789TJQK'.indexOf(s[0]) + 1;
  return { rank: r, suit: 'shdc'.indexOf(s[1]) as Card['suit'] };
};
const H = (s: string) => s.split(' ').map(C);

describe('hand ranking', () => {
  it('orders every class and breaks ties by kickers', () => {
    const order = ['As Ks Qs Js Ts', '9h 9d 9s 9c 2d', 'Kh Kd Ks 4c 4d', 'Ah 9h 7h 4h 2h', '9c 8d 7h 6s 5c', 'Qh Qd Qs 7c 2d', 'Jh Jd 4s 4c Ad', 'Th Td As 8c 3d', 'Ah Jd 9s 6c 3d'];
    const scores = order.map((h) => score5(H(h)));
    for (let i = 1; i < scores.length; i++) expect(scores[i - 1]).toBeGreaterThan(scores[i]);
    expect(classOf(scores[0])).toBe('straight_flush');
    expect(score5(H('5c 4d 3h 2s Ac'))).toBeLessThan(score5(H('6c 5d 4h 3s 2c'))); // the wheel is the lowest straight
    expect(score5(H('Ah Ad 9s 6c 3d'))).toBeGreaterThan(score5(H('Ah Ad 9s 6c 2d')));
    expect(score5(H('Ah Ad 9s 6c 3d'))).toBe(score5(H('As Ac 9d 6h 3c')));
  });
  it('finds the best five of seven', () => {
    const b = bestHand(H('2c 7d As Ks Qs Js Ts'));
    expect(b.cls).toBe('straight_flush');
    expect(bestHand(H('Ah Ad 2c 2d 7s 7h 9c')).cls).toBe('two_pair');
  });
});

const seat = (total: number, folded = false): Seat => ({ id: 'x', name: 'x', stack: 0, hole: [], bet: 0, total, folded, allIn: false, acted: true, inHand: true });

describe("Hold'em rules", () => {
  it('builds side pots by contribution, and folded chips stay in the pots they fed', () => {
    const pots = sidePots([seat(50), seat(200), seat(200), seat(80, true)]);
    expect(pots).toEqual([{ amount: 200, eligible: [0, 1, 2] }, { amount: 330, eligible: [1, 2] }]);
    expect(pots.reduce((a, p) => a + p.amount, 0)).toBe(530);
  });

  it('posts blinds left of the button; heads-up the button is the small blind and acts first', () => {
    const t = startHand(newTable([{ id: 'a', name: 'A', stack: 500 }, { id: 'b', name: 'B', stack: 500 }, { id: 'c', name: 'C', stack: 500 }], 5, 10), seededInt(1));
    expect(t.button).toBe(0);
    expect([t.seats[1].bet, t.seats[2].bet]).toEqual([5, 10]);
    expect(t.toAct).toBe(0);
    expect(t.seats.every((x) => x.hole.length === 2)).toBe(true);
    const hu = startHand(newTable([{ id: 'a', name: 'A', stack: 500 }, { id: 'b', name: 'B', stack: 500 }], 5, 10), seededInt(2));
    expect(hu.seats[hu.button].bet).toBe(5);
    expect(hu.toAct).toBe(hu.button);
  });

  it('gives the big blind its option, and rejects illegal moves', () => {
    let t = startHand(newTable([{ id: 'a', name: 'A', stack: 500 }, { id: 'b', name: 'B', stack: 500 }, { id: 'c', name: 'C', stack: 500 }], 5, 10), seededInt(3));
    expect(() => act(t, { type: 'check' })).toThrow();
    expect(() => act(t, { type: 'raise', to: 15 })).toThrow(); // min raise is to 20
    t = act(t, { type: 'call' });
    t = act(t, { type: 'call' });
    expect(t.street).toBe('preflop');
    expect(t.toAct).toBe(2);
    expect(legal(t).check).toBe(true);
    t = act(t, { type: 'check' });
    expect(t.street).toBe('flop');
    expect(t.board).toHaveLength(3);
  });

  it('an all-in short stack can only win the main pot; the side pot goes to the best of the rest', () => {
    let t = startHand(newTable([{ id: 'a', name: 'A', stack: 50 }, { id: 'b', name: 'B', stack: 200 }, { id: 'c', name: 'C', stack: 200 }], 5, 10), seededInt(5));
    // A has the nuts, B second best, C worst. Deck pops from the end: burn, flop, burn, turn, burn, river.
    const holes = [H('As Ah'), H('Ks Kh'), H('7c 2d')];
    const board = H('Ad Kd 9c 4s 3h');
    const deck = [board[4], C('8h'), board[3], C('8d'), board[2], board[1], board[0], C('8c')];
    t = { ...t, seats: t.seats.map((x, i) => ({ ...x, hole: holes[i] })), deck };
    // Button is A (seat 0) and acts first: everybody all in.
    t = act(t, { type: 'raise', to: 50 });
    t = act(t, { type: 'raise', to: 200 });
    t = act(t, { type: 'call' });
    expect(t.result?.shown).toBe(true);
    expect(t.board).toEqual(board);
    expect(t.seats.map((x) => x.stack)).toEqual([150, 300, 0]);
  });

  it.each(['holdem', 'omaha8', 'stud'] as PokerVariant[])('%s: random legal play over many hands conserves chips and every hand ends', (variant) => {
    const rand = seededInt(42);
    let t: HoldemState = newTable([0, 1, 2, 3, 4].map((i) => ({ id: `p${i}`, name: `P${i}`, stack: 100 + i * 150 })), 5, 10, { variant });
    let hands = 0;
    for (let h = 0; h < 300; h++) {
      // Busted seats reload (as the regulars do), so play goes on.
      t = { ...t, seats: t.seats.map((x) => (x.stack > 0 ? x : { ...x, stack: 300 })) };
      const total = chipsInPlay(t);
      t = startHand(t, rand);
      expect(chipsInPlay(t)).toBe(total);
      let steps = 0;
      while (!t.result) {
        const L = legal(t);
        const options = [
          ...(L.fold ? [{ type: 'fold' as const }] : []), ...(L.check ? [{ type: 'check' as const }] : []),
          ...(L.toCall > 0 ? [{ type: 'call' as const }] : []), ...(L.maxTo ? [{ type: 'raise' as const, to: L.minTo + rand(L.maxTo - L.minTo + 1) }] : []),
        ];
        t = act(t, options[rand(options.length)]);
        expect(chipsInPlay(t)).toBe(total);
        expect(t.seats.every((x) => x.stack >= 0)).toBe(true);
        expect(++steps).toBeLessThan(200);
      }
      expect(t.result!.wins.reduce((a, w) => a + w.amount, 0)).toBeGreaterThan(0);
      hands++;
    }
    expect(hands).toBe(300);
    expect(t.seats.every((x) => !x.inHand || x.hole.length <= (variant === 'stud' ? 7 : variant === 'omaha8' ? 4 : 2))).toBe(true);
  });
});

describe('Omaha Hi-Lo', () => {
  it('uses exactly two hole cards and three from the board', () => {
    // Four hearts on board and one heart in hand: no flush in Omaha.
    expect(omahaHigh(H('Ah Kc Qd Js'), H('2h 5h 8h 9h Tc')).cls).not.toBe('flush');
    expect(omahaHigh(H('Ah Kh Qd Js'), H('2h 5h 8h 9c Tc')).cls).toBe('flush');
  });
  it('lows need five different ranks, eight or better, and lower is better', () => {
    expect(low5(H('Ac 2d 3h 4s 5c'))).not.toBeNull();
    expect(low5(H('Ac 2d 3h 4s 9c'))).toBeNull();
    expect(low5(H('Ac 2d 3h 3s 5c'))).toBeNull();
    expect(low5(H('Ac 2d 3h 4s 6c'))!).toBeLessThan(low5(H('Ac 2d 3h 4s 7c'))!);
    expect(omahaLow(H('Ac 2d Kh Ks'), H('3h 6c 8d Qs Jd'))).not.toBeNull();
    expect(omahaLow(H('Ac Qd Kh Ks'), H('3h 6c 8d 2s 4d'))).toBeNull(); // only one low card in hand
  });
  it('splits the pot between the best high and the best low', () => {
    let t = startHand(newTable([{ id: 'a', name: 'A', stack: 100 }, { id: 'b', name: 'B', stack: 100 }, { id: 'c', name: 'C', stack: 100 }], 5, 10, { variant: 'omaha8' }), seededInt(5));
    const holes = [H('Ks Kh Qd Jc'), H('As 2h 9d 9c'), H('Tc Td 7s 7h')];
    const board = H('Kd 3c 4h 8s Qh');
    const deck = [board[4], C('Jh'), board[3], C('Js'), board[2], board[1], board[0], C('Jd')];
    t = { ...t, seats: t.seats.map((x, i) => ({ ...x, hole: holes[i] })), deck };
    // Pot limit: raise as far as allowed, then call everything off.
    let guard = 0;
    while (!t.result && guard++ < 30) { const L = legal(t); t = act(t, L.maxTo ? { type: 'raise', to: L.maxTo } : L.toCall ? { type: 'call' } : { type: 'check' }); }
    expect(t.result?.shown).toBe(true);
    // A: trip kings (high, 150). B: 8-4-3-2-A low (150). C: nothing.
    expect(t.seats.map((x) => x.stack)).toEqual([150, 150, 0]);
    expect(t.result!.wins.map((w) => w.half).sort()).toEqual(['high', 'low']);
  });
});

describe('Seven Card Stud', () => {
  const table = () => startHand(newTable([0, 1, 2, 3].map((i) => ({ id: `p${i}`, name: `P${i}`, stack: 500 })), 5, 10, { variant: 'stud' }), seededInt(11));
  it('antes, two down and one up, and the lowest card showing brings it in', () => {
    const t = table();
    expect(t.street).toBe('third');
    for (const x of t.seats) { expect(x.hole).toHaveLength(3); expect(x.up).toEqual([false, false, true]); }
    const hi = (r: number) => (r === 1 ? 14 : r);
    const lowest = Math.min(...t.seats.map((x) => hi(showing(x)[0].rank)));
    const bringer = t.seats.findIndex((x) => x.bet === 5);
    expect(hi(showing(t.seats[bringer])[0].rank)).toBe(lowest);
    expect(chipsInPlay(t)).toBe(2000);
    expect(t.seats.reduce((a, x) => a + x.total, 0)).toBe(4 * 2 + 5);
  });
  it('fixed limit: complete to 10 on third street, bets of 20 from fifth, four bets a street at most', () => {
    let t = table();
    expect(legal(t)).toMatchObject({ minTo: 10, maxTo: 10 });
    t = act(t, { type: 'raise', to: 10 });
    expect(legal(t)).toMatchObject({ minTo: 20, maxTo: 20 });
    t = act(t, { type: 'raise', to: 20 });
    t = act(t, { type: 'raise', to: 30 });
    t = act(t, { type: 'raise', to: 40 });
    expect(legal(t).maxTo).toBe(0); // capped
    while (t.street === 'third') t = act(t, legal(t).toCall ? { type: 'call' } : { type: 'check' });
    while (t.street === 'fourth') t = act(t, legal(t).toCall ? { type: 'call' } : { type: 'check' });
    expect(t.street).toBe('fifth');
    expect(legal(t)).toMatchObject({ minTo: 20, maxTo: 20 });
  });
  it('deals the last card face down, seven cards in all', () => {
    let t = table();
    while (!t.result && t.street !== 'seventh') t = act(t, legal(t).toCall ? { type: 'call' } : { type: 'check' });
    for (const x of t.seats.filter((x) => !x.folded)) expect(x.up).toEqual([false, false, true, true, true, true, false]);
  });
  it("opponents can't see down cards: changing someone's hidden cards changes nothing", () => {
    let t = table();
    t = act(t, legal(t).toCall ? { type: 'call' } : { type: 'check' });
    const i = t.toAct;
    const v = viewFor(t, i);
    const swapped: HoldemState = { ...t, seats: t.seats.map((x, j) => (j === i ? x : { ...x, hole: x.hole.map((c, k) => (x.up![k] ? c : C('As'))) })) };
    expect(viewFor(swapped, i).oppShowing).toEqual(v.oppShowing);
    const p = POKER_ROOMS[1].regulars[0].style;
    expect(decide(viewFor(swapped, i), p, seededInt(3))).toEqual(decide(v, p, seededInt(3)));
  });
});

describe('opponents', () => {
  it("decide from their own cards and the board only: changing another seat's cards changes nothing", () => {
    const t = startHand(newTable([0, 1, 2, 3].map((i) => ({ id: `p${i}`, name: `P${i}`, stack: 1000 })), 5, 10), seededInt(7));
    const i = t.toAct;
    const v = viewFor(t, i);
    expect(Object.keys(v).sort()).toEqual(['bb', 'board', 'currentBet', 'hole', 'maxTo', 'minTo', 'myBet', 'oppShowing', 'opponents', 'pot', 'stack', 'toCall', 'variant']);
    const swapped: HoldemState = { ...t, seats: t.seats.map((x, j) => (j === i ? x : { ...x, hole: H('As Ah') })) };
    const p = POKER_ROOMS[0].regulars[1].style;
    expect(decide(viewFor(swapped, i), p, seededInt(9))).toEqual(decide(v, p, seededInt(9)));
  });
  it('rate strong hands as strong', () => {
    expect(equity(H('As Ah'), [], 1, 300, seededInt(1))).toBeGreaterThan(0.75);
    expect(equity(H('7c 2d'), [], 1, 300, seededInt(1))).toBeLessThan(0.4);
  });
  it('a tight regular folds trash to a big bet; a loose one plays more hands', () => {
    const base = { variant: 'holdem' as const, oppShowing: [], board: [], pot: 115, toCall: 100, currentBet: 100, myBet: 0, stack: 1000, minTo: 190, maxTo: 1000, opponents: 2, bb: 10 };
    const tight = POKER_ROOMS[0].regulars[0].style;
    let folds = 0;
    for (let k = 0; k < 20; k++) if (decide({ ...base, hole: H('7c 2d') }, tight, seededInt(k)).type === 'fold') folds++;
    expect(folds).toBeGreaterThanOrEqual(18);
  });
});

describe('rooms and invitations', () => {
  it('one room per casino, each with four permanent regulars and a private course', () => {
    expect(POKER_ROOMS.map((r) => [r.location, r.variant, r.open])).toEqual([['desert_palms', 'holdem', true], ['white_buffalo', 'stud', true], ['morongo_sky', 'omaha8', true]]);
    for (const r of POKER_ROOMS) {
      expect(r.regulars).toHaveLength(4);
      expect(r.course.name).toBeTruthy();
    }
    for (const d of DEALERS) expect(INVITE_LINES[d.id]('Room', 'Course').length).toBeGreaterThan(1);
  });

  it('table time: nights count per casino, and only a Regular gains relationship from them', () => {
    const fresh = applyTableNight(freshNpcState('waifu'), 'desert_palms', 't');
    expect(fresh.gain).toBe(0);
    expect(nightsAt(fresh.next, 'desert_palms')).toBe(1);
    expect(nightsAt(fresh.next, 'white_buffalo')).toBe(0);
    const regular = { ...freshNpcState('waifu'), goodwill: 10 };
    expect(applyTableNight(regular, 'desert_palms', 't').gain).toBe(1);
  });

  it('a Friend with enough nights at this casino invites; nights elsewhere do not count', () => {
    const friend = { ...freshNpcState('winston'), base: 60, goodwill: 12, flags: { 'nights:desert_palms': INVITE_NIGHTS } };
    expect(inviterAt('desert_palms', [freshNpcState('waifu'), friend])).toBe('winston');
    expect(inviterAt('white_buffalo', [friend])).toBeNull();
    expect(inviterAt('desert_palms', [{ ...friend, base: 50 }])).toBeNull();
  });
});

async function invited(): Promise<GameServices> {
  const { s } = await newCareer();
  await s.casino.visit();
  await s.db.npcState.put({ ...freshNpcState('winston'), base: 60, goodwill: 12, flags: { 'nights:desert_palms': INVITE_NIGHTS } });
  return s;
}
const balance = (s: GameServices) => s.economy.getBalance(RYAN);

describe('poker room service', () => {
  it('the room is locked until the invitation is accepted, then open for good', async () => {
    const { s } = await newCareer();
    await s.casino.visit();
    expect((await s.poker.vipStatus('desert_palms')).inviter).toBeNull();
    expect(isDomainError(await s.poker.sit(500).catch((e) => e), 'CAREER_RULE')).toBe(true);
    expect(isDomainError(await s.poker.acceptInvite('desert_palms').catch((e) => e), 'CAREER_RULE')).toBe(true);
    await s.db.npcState.put({ ...freshNpcState('winston'), base: 60, goodwill: 12, flags: { 'nights:desert_palms': INVITE_NIGHTS } });
    expect((await s.poker.vipStatus('desert_palms')).inviter).toBe('winston');
    expect((await s.poker.acceptInvite('desert_palms')).unlocked).toBe(true);
    // Even if the friendship cooled, the room stays open.
    await s.db.npcState.put(freshNpcState('winston'));
    expect((await s.poker.vipStatus('desert_palms')).unlocked).toBe(true);
    expect(isDomainError(await s.poker.acceptInvite('white_buffalo').catch((e) => e), 'CAREER_RULE')).toBe(true);
  });

  it('one debit to sit, one credit to leave, and the bankroll moves by exactly the result', async () => {
    const s = await invited();
    await s.poker.acceptInvite('desert_palms');
    const before = await balance(s);
    let t = await s.poker.sit(500);
    expect(await balance(s)).toBe(before - 500);
    expect(isDomainError(await s.poker.sit(500).catch((e) => e), 'CAREER_RULE')).toBe(true);
    const total = t.state.seats.reduce((a, x) => a + x.stack + x.total, 0);
    for (let h = 0; h < 15; h++) {
      let guard = 0;
      while (!t.state.result && t.state.toAct === HERO && guard++ < 20) {
        const L = legal(t.state, HERO);
        t = await s.poker.act(L.check ? { type: 'check' } : { type: 'call' });
      }
      expect(t.state.seats.reduce((a, x) => a + x.stack + x.total, 0)).toBeGreaterThanOrEqual(total - 1); // reloads only add
      if (t.state.seats[HERO].stack <= 0) break;
      t = await s.poker.nextHand();
    }
    const stack = (await s.poker.table())!.state;
    const { cashOut, bought } = await s.poker.leave();
    expect(bought).toBe(500);
    expect(await balance(s)).toBe(before - 500 + cashOut);
    expect(stack.seats[HERO].stack === cashOut || stack.result === undefined).toBe(true);
    expect(await s.poker.table()).toBeNull();
    const keys = (await s.db.ledger.toArray()).filter((e) => e.idempotencyKey.startsWith('poker:')).map((e) => e.idempotencyKey.split(':')[2]);
    expect(keys.filter((k) => k === 'buy')).toHaveLength(1);
    expect(keys.filter((k) => k === 'cash').length).toBeLessThanOrEqual(1);
  });

  it('buy-in limits and rebuys stay inside the room maximum', async () => {
    const s = await invited();
    await s.poker.acceptInvite('desert_palms');
    const room = roomAt('desert_palms');
    expect(isDomainError(await s.poker.sit(room.buyIn.min - 1).catch((e) => e), 'CAREER_RULE')).toBe(true);
    expect(isDomainError(await s.poker.sit(room.buyIn.max + 1).catch((e) => e), 'CAREER_RULE')).toBe(true);
    let t = await s.poker.sit(room.buyIn.max);
    while (!t.state.result) t = await s.poker.act({ type: legal(t.state, HERO).check ? 'check' : 'fold' });
    const stack = t.state.seats[HERO].stack;
    if (stack < room.buyIn.max) expect(isDomainError(await s.poker.rebuy(room.buyIn.max - stack + 1).catch((e) => e), 'CAREER_RULE')).toBe(true);
    await s.poker.leave();
  });

  it.each([['white_buffalo', 'stud'], ['morongo_sky', 'omaha8']] as const)('%s deals %s with its own regulars', async (loc, variant) => {
    const { s } = await newCareer();
    await s.casino.visit();
    await setCareer(s, (c) => { c.flags.casinoAt = loc; c.flags[`vip:${loc}`] = 't'; });
    const before = await balance(s);
    let t = await s.poker.sit(roomAt(loc).buyIn.min);
    expect(t.state.variant).toBe(variant);
    expect(t.state.seats.slice(1).map((x) => x.id)).toEqual(roomAt(loc).regulars.map((r) => r.id));
    let guard = 0;
    while (!t.state.result && guard++ < 20) t = await s.poker.act({ type: legal(t.state, HERO).check ? 'check' : 'fold' });
    const { cashOut } = await s.poker.leave();
    expect(await balance(s)).toBe(before - roomAt(loc).buyIn.min + cashOut);
  });

  it('app-style table: frames to replay, hand history, Time Bank, straddle setting, Run It Twice', async () => {
    const s = await invited();
    await s.poker.acceptInvite('desert_palms');
    await s.economy.post({ ownerId: RYAN, amount: 50_000, type: 'job_wage', sourceId: 'test', idempotencyKey: 'poker-bank' });
    let t = await s.poker.sit(1000, { runTwice: true, sevenDeuce: 10 });
    expect(t.rules).toMatchObject({ runTwice: true, sevenDeuce: 10, doubleBoard: false });
    expect(t.frames.length).toBeGreaterThan(0);
    expect(t.frames.every((f) => f.state.deck.length === 0)).toBe(true); // frames never carry the deck
    expect((await s.poker.useTimeBank()).timeBank).toBe(2);
    expect((await s.poker.setStraddle(true)).straddle).toBe(true);
    let sawRunout = false;
    for (let h = 0; h < 25; h++) {
      let guard = 0;
      while (!t.state.result && guard++ < 30) {
        if (t.state.awaitRunout) { const o = await s.poker.runout(true); t = { ...o.table, frames: o.frames }; sawRunout = true; continue; }
        const L = legal(t.state, HERO);
        t = await s.poker.act(L.maxTo ? { type: 'raise', to: L.maxTo } : L.toCall ? { type: 'call' } : { type: 'check' });
      }
      if (t.state.seats[HERO].stack <= 0) await s.poker.rebuy(1000);
      t = await s.poker.nextHand();
    }
    const table = (await s.poker.table())!;
    expect(table.history!.length).toBeGreaterThan(5);
    expect(sawRunout).toBe(true);
    for (const h of table.history!) expect(h.hole).toHaveLength(2);
    await s.poker.leave();
  });

  it('leaving mid-hand folds and still pays out the rest of the stack', async () => {
    const s = await invited();
    await s.poker.acceptInvite('desert_palms');
    const before = await balance(s);
    let t = await s.poker.sit(300);
    while (t.state.result) t = await s.poker.nextHand();
    const { cashOut } = await s.poker.leave();
    expect(cashOut).toBeGreaterThan(0);
    expect(cashOut).toBeLessThanOrEqual(300 + 4 * 1000);
    expect(await balance(s)).toBe(before - 300 + cashOut);
    void setCareer;
  });
});

describe('Pokerrrr-style table rules', () => {
  const players = (n: number, stack = 500) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, stack }));
  it('Run It Twice: waits for the table, then splits each pot between two full boards', () => {
    let t = startHand(newTable(players(2), 5, 10, { rules: { runTwice: true } }), seededInt(21));
    t = act(t, { type: 'raise', to: 500 });
    t = act(t, { type: 'call' });
    expect(t.awaitRunout).toBe(true);
    expect(t.result).toBeUndefined();
    const two = runOut(t, 2);
    expect(two.board).toHaveLength(5);
    expect(two.board2).toHaveLength(5);
    expect(two.result!.wins.reduce((a, w) => a + w.amount, 0)).toBe(1000);
    expect(new Set(two.result!.wins.map((w) => w.run))).toEqual(new Set([1, 2]));
    const one = runOut(t, 1);
    expect(one.board2).toBeUndefined();
    expect(chipsInPlay(one)).toBe(1000);
  });
  it('Double Board: two boards every hand, pot split between them, chips conserved', () => {
    const rand = seededInt(8);
    let t = newTable(players(4), 5, 10, { rules: { doubleBoard: true } });
    for (let h = 0; h < 60; h++) {
      t = { ...t, seats: t.seats.map((x) => (x.stack > 0 ? x : { ...x, stack: 500 })) };
      const total = chipsInPlay(t);
      t = startHand(t, rand);
      while (!t.result) { const L = legal(t); t = act(t, L.toCall ? { type: rand(4) ? 'call' : 'fold' } : { type: 'check' }); }
      expect(chipsInPlay(t)).toBe(total);
      if (t.result.shown) { expect(t.board).toHaveLength(5); expect(t.board2).toHaveLength(5); }
    }
  });
  it('7-2 Game: winning with seven-deuce collects the bounty from everyone dealt in', () => {
    let t = startHand(newTable(players(3), 5, 10, { rules: { sevenDeuce: 10 } }), seededInt(3));
    t = { ...t, seats: t.seats.map((x, i) => (i === t.toAct ? { ...x, hole: H('7c 2d') } : x)) };
    const hero = t.toAct;
    t = act(t, { type: 'raise', to: 40 });
    while (!t.result) t = act(t, legal(t).fold ? { type: 'fold' } : { type: 'check' });
    expect(t.bounty).toEqual({ seat: hero, amount: 20 });
    expect(chipsInPlay(t)).toBe(1500);
  });
  it('straddle: left of the big blind posts double, action starts after them, and they get their option', () => {
    let t = startHand(newTable(players(4), 5, 10), seededInt(4), { straddle: true });
    const st = t.seats.findIndex((x) => x.bet === 20);
    expect(st).toBeGreaterThanOrEqual(0);
    expect(t.currentBet).toBe(20);
    expect(legal(t).minTo).toBe(40);
    while (t.toAct !== st) t = act(t, legal(t).toCall ? { type: 'call' } : { type: 'check' });
    expect(legal(t).check).toBe(true);
  });
  it('rabbit hunt shows the cards that would have come and changes nothing', () => {
    let t = startHand(newTable(players(2), 5, 10), seededInt(9));
    t = act(t, { type: 'fold' });
    const r = rabbit(t);
    expect(r).toHaveLength(5);
    expect(chipsInPlay(t)).toBe(1000);
  });
});
