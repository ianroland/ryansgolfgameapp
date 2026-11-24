import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bookTotalsOf, sportsWorldOf, ticketsOf } from '../src/career/sportsbook';
import { gradeLeg, settleTicket, type Ticket, type TicketLeg } from '../src/sports/bets';
import { boardFor, gamesOf, isFinal, priceGame, recentFinals, seasonOf, standingsToDate } from '../src/sports/book';
import { decimalOf } from '../src/sports/demo';
import type { Selection } from '../src/sports/slip';
import { newCareer, RYAN, spend } from './helpers';

const SEED = 4242;
const pick = (g: ReturnType<typeof boardFor>['games'][number], market: 'moneyline' | 'spread' | 'total', side: 'home' | 'away' | 'over' | 'under'): Selection => {
  const l = g.lines.find((x) => x.market === market && x.side === side)!;
  return { gameId: g.id, market, side, point: l.point, american: l.american, label: `${market} ${side}` };
};

describe('grading', () => {
  it('moneyline, spread and total, with pushes', () => {
    expect(gradeLeg({ market: 'moneyline', side: 'home', point: null }, 5, 3)).toBe('won');
    expect(gradeLeg({ market: 'moneyline', side: 'away', point: null }, 5, 3)).toBe('lost');
    expect(gradeLeg({ market: 'moneyline', side: 'home', point: null }, 20, 20)).toBe('push'); // football tie
    expect(gradeLeg({ market: 'spread', side: 'home', point: -1.5 }, 5, 3)).toBe('won');
    expect(gradeLeg({ market: 'spread', side: 'home', point: -1.5 }, 4, 3)).toBe('lost');
    expect(gradeLeg({ market: 'spread', side: 'away', point: 3 }, 24, 21)).toBe('push');
    expect(gradeLeg({ market: 'total', side: 'over', point: 8.5 }, 5, 4)).toBe('won');
    expect(gradeLeg({ market: 'total', side: 'under', point: 9 }, 5, 4)).toBe('push');
  });

  it('settles singles and parlays, dropping pushed legs and capping parlays', () => {
    const s = seasonOf(SEED, 1).leagues.ccl;
    const [g1, g2, g3] = s.regular;
    const leg = (g: typeof g1, market: TicketLeg['market'], side: TicketLeg['side'], point: number | null, american: number): TicketLeg =>
      ({ gameId: g.id, league: 'ccl', season: 1, week: g.week, when: '', home: g.home, away: g.away, market, side, point, american, label: 'x' });
    const winner = (g: typeof g1) => (g.result.homeScore > g.result.awayScore ? 'home' : 'away') as 'home' | 'away';
    const base = { placed: { season: 1, week: 1 }, lounge: 'desert_palms', status: 'open' as const, payout: 0, toReturn: 0 };
    const single: Ticket = { ...base, id: 's', kind: 'single', stake: 100, legs: [leg(g1, 'moneyline', winner(g1), null, 150)] };
    expect(settleTicket(single, SEED, 1, g1.week)).toBeNull(); // still this week: not final
    expect(settleTicket(single, SEED, 1, g1.week + 1)).toMatchObject({ status: 'won', payout: 250 });
    const total = g2.result.homeScore + g2.result.awayScore;
    const parlay: Ticket = { ...base, id: 'p', kind: 'parlay', stake: 10, legs: [leg(g1, 'moneyline', winner(g1), null, 100), leg(g2, 'total', 'over', total, -110), leg(g3, 'moneyline', winner(g3), null, 100)] };
    const done = settleTicket(parlay, SEED, 1, 30)!;
    expect(done.legs.map((l) => l.result)).toEqual(['won', 'push', 'won']);
    expect(done).toMatchObject({ status: 'won', payout: 40 });
    const lose: Ticket = { ...parlay, id: 'l', legs: [parlay.legs[0], leg(g3, 'moneyline', winner(g3) === 'home' ? 'away' : 'home', null, 100)] };
    expect(settleTicket(lose, SEED, 1, 30)).toMatchObject({ status: 'lost', payout: 0 });
    const allPush: Ticket = { ...parlay, id: 'a', legs: [leg(g2, 'total', 'over', total, -110)] };
    expect(settleTicket(allPush, SEED, 1, 30)).toMatchObject({ status: 'push', payout: 10 });
    const huge: Ticket = { ...parlay, id: 'h', stake: 1000, legs: [leg(g1, 'moneyline', winner(g1), null, 900), leg(g3, 'moneyline', winner(g3), null, 900)] };
    expect(settleTicket(huge, SEED, 1, 30)!.payout).toBe(50_000); // $100,000 raw, capped
    const unknown: Ticket = { ...single, id: 'v', legs: [{ ...single.legs[0], gameId: 'ccl:1:nope' }] };
    expect(settleTicket(unknown, SEED, 1, 30)).toMatchObject({ status: 'push', payout: 100 }); // void leg refunds
  });
});

describe('the board', () => {
  it('offers this week\'s unplayed games, priced with the house margin, the same every time', () => {
    const b = boardFor(SEED, 1, 1, 'gdc');
    expect(b.week).toBe(1);
    expect(b.games.length).toBeGreaterThan(0);
    for (const g of b.games) {
      const [h, a] = g.lines.filter((l) => l.market === 'moneyline');
      expect(1 / decimalOf(h.american) + 1 / decimalOf(a.american)).toBeGreaterThan(1); // overround
      expect(g.lines.find((l) => l.market === 'spread')!.point!).toBeCloseTo(g.homeWinProb >= 0.5 ? -1.5 : 1.5);
    }
    expect(boardFor(SEED, 1, 1, 'gdc')).toEqual(b);
    // Football hasn't started in week 1: the board shows its first week instead.
    expect(boardFor(SEED, 1, 1, 'igl').week).toBe(13);
    expect(boardFor(SEED, 1, 31, 'ccl')).toEqual({ week: null, games: [] });
    expect(isFinal(1, 4, 1, 5)).toBe(true);
    expect(isFinal(1, 5, 1, 5)).toBe(false);
  });

  it('prices are calibrated and the house keeps roughly its margin', () => {
    let expectedHome = 0;
    let homeWins = 0;
    let decided = 0;
    let staked = 0;
    let returned = 0;
    for (const league of ['ccl', 'fhl'] as const) {
      for (const g of seasonOf(SEED, 1).leagues[league].regular) {
        const lines = priceGame(SEED, 1, league, g);
        if (g.result.homeScore === g.result.awayScore) continue;
        decided++;
        expectedHome += lines.pHome;
        const homeWon = g.result.homeScore > g.result.awayScore;
        if (homeWon) homeWins++;
        // $100 on both sides of every moneyline.
        staked += 200;
        returned += 100 * decimalOf(lines[homeWon ? 0 : 1].american);
      }
    }
    expect(Math.abs(expectedHome - homeWins) / decided).toBeLessThan(0.06);
    const hold = 1 - returned / staked;
    expect(hold).toBeGreaterThan(-0.01);
    expect(hold).toBeLessThan(0.08);
  });

  it('scores and standings only show games already played', () => {
    expect(recentFinals(SEED, 1, 1, 'gdc')).toEqual([]);
    const f = recentFinals(SEED, 1, 4, 'gdc');
    expect(f.length).toBeGreaterThan(0);
    expect(f.every((g) => g.week < 4 && g.week >= 2)).toBe(true);
    const st = standingsToDate(SEED, 1, 4, 'gdc');
    expect(st.reduce((a, r) => a + r.w, 0)).toBe(gamesOf(seasonOf(SEED, 1).leagues.gdc).filter((g) => g.week < 4 && !g.pre.playoff).length);
  });
});

describe('real tickets through the ledger', () => {
  it('a bet is charged once, saved, settled on week advance, paid once and reported in the inbox', async () => {
    const { s } = await newCareer();
    const c0 = await s.career.getCareer();
    const seed = sportsWorldOf(c0);
    const games = boardFor(seed, c0.season, c0.week, 'gdc').games;
    const before = await s.economy.getBalance(RYAN);
    const picks = [pick(games[0], 'moneyline', 'home'), pick(games[1], 'total', 'under')];
    const r1 = await s.sportsbook.place({ picks, stake: 50, parlay: false, lounge: 'desert_palms', requestId: 'req1' });
    expect(r1.tickets).toHaveLength(2);
    const replay = await s.sportsbook.place({ picks, stake: 50, parlay: false, lounge: 'desert_palms', requestId: 'req1' });
    expect(replay.replayed).toBe(true);
    expect(await s.economy.getBalance(RYAN)).toBe(before - 100);
    const tx = await s.economy.listTransactions(RYAN);
    expect(tx.filter((t) => t.type === 'sports_bet').map((t) => t.idempotencyKey)).toEqual(['bet:req1:0', 'bet:req1:1']);

    // Games this week aren't final until the week advances.
    expect(await s.sportsbook.settleDue()).toEqual([]);
    await s.career.advanceWeek();
    const c1 = await s.career.getCareer();
    const tickets = ticketsOf(c1);
    expect(tickets.every((t) => t.status !== 'open')).toBe(true);
    const paid = tickets.reduce((a, t) => a + t.payout, 0);
    const payTx = (await s.economy.listTransactions(RYAN)).filter((t) => t.type === 'sports_payout');
    expect(payTx.reduce((a, t) => a + t.amount, 0)).toBe(paid);
    expect(c1.inbox[0].title).toMatch(/^Sportsbook: /);
    expect(bookTotalsOf(c1)).toMatchObject({ tickets: 2, staked: 100, returned: paid });
    // Running settlement again changes nothing.
    expect(await s.sportsbook.settleDue()).toEqual([]);
    expect((await s.economy.listTransactions(RYAN)).filter((t) => t.type === 'sports_payout')).toHaveLength(payTx.length);
    await s.economy.verifyIntegrity(RYAN);
  });

  it('refuses bad bets without charging', async () => {
    const { s } = await newCareer();
    const c = await s.career.getCareer();
    const g = boardFor(sportsWorldOf(c), c.season, c.week, 'gdc').games[0];
    const ml = pick(g, 'moneyline', 'home');
    const bal = await s.economy.getBalance(RYAN);
    await expect(s.sportsbook.place({ picks: [ml], stake: 2, parlay: false, lounge: 'desert_palms', requestId: 'a' })).rejects.toThrow(/Minimum/);
    await expect(s.sportsbook.place({ picks: [ml], stake: 2000, parlay: false, lounge: 'desert_palms', requestId: 'b' })).rejects.toThrow(/Maximum stake here is \$1,000/);
    await expect(s.sportsbook.place({ picks: [{ ...ml, american: ml.american + 50 }], stake: 10, parlay: false, lounge: 'desert_palms', requestId: 'c' })).rejects.toThrow(/line changed/);
    await expect(s.sportsbook.place({ picks: [ml, pick(g, 'total', 'over')], stake: 10, parlay: true, lounge: 'desert_palms', requestId: 'd' })).rejects.toThrow(/different games/);
    await spend(s, bal - 20);
    await expect(s.sportsbook.place({ picks: [ml], stake: 50, parlay: false, lounge: 'desert_palms', requestId: 'e' })).rejects.toThrow(/Not enough/);
    expect(await s.economy.getBalance(RYAN)).toBe(20);
    expect(ticketsOf(await s.career.getCareer())).toEqual([]);
    // After the week advances, last week's game can't be bet.
    await s.career.advanceWeek();
    await expect(s.sportsbook.place({ picks: [ml], stake: 5, parlay: false, lounge: 'desert_palms', requestId: 'f' })).rejects.toThrow(/already been played/);
  });

  it('higher lounges allow bigger stakes', async () => {
    const { s } = await newCareer();
    const c = await s.career.getCareer();
    const g = boardFor(sportsWorldOf(c), c.season, c.week, 'gdc').games[0];
    await s.economy.post({ ownerId: RYAN, amount: 20_000, type: 'prize_money', sourceId: 't', idempotencyKey: 'grant' });
    await expect(s.sportsbook.place({ picks: [pick(g, 'moneyline', 'away')], stake: 2500, parlay: false, lounge: 'white_buffalo', requestId: 'w' })).resolves.toBeTruthy();
    await expect(s.sportsbook.place({ picks: [pick(g, 'moneyline', 'away')], stake: 2600, parlay: false, lounge: 'white_buffalo', requestId: 'x' })).rejects.toThrow(/\$2,500/);
    await expect(s.sportsbook.place({ picks: [pick(g, 'moneyline', 'away')], stake: 10_000, parlay: false, lounge: 'morongo_sky', requestId: 'm' })).resolves.toBeTruthy();
  });
});

describe('boundaries', () => {
  it('book and bets never read NPCs, drinks, tips, golf, casino or lore', () => {
    for (const f of ['src/sports/book.ts', 'src/sports/bets.ts', 'src/career/sportsbook.ts']) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/from '[^']*(npc|drink|servers|casino|lore|tip)[^']*'/i);
    }
  });
});
