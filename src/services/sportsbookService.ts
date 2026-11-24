/**
 * Places sportsbook bets. Each ticket is one ledger debit (type `sports_bet`, key
 * `bet:<ticketId>`) written in the same transaction as the ticket itself, so a double click, a
 * second tab or a reload can never charge twice. Settlement happens when Ryan's week advances
 * (CareerService.advanceWeek → settleSports) and pays through `sports_payout` / `payout:<id>`.
 *
 * Odds and results come only from the sports engine. NPCs, drinks, tips, golf and the casino
 * never touch them.
 */
import { DomainError } from '../core/errors';
import { bookTotalsOf, settleSports, sportsSeedOf, ticketsOf, withBook } from '../career/sportsbook';
import { buildTickets, type Ticket } from '../sports/bets';
import type { MoneyOp } from '../career/engine';
import type { Selection } from '../sports/slip';
import type { AppDB } from '../persistence/db';
import type { EconomyService } from './economyService';
import type { Notifier } from './notifier';

export interface PlaceRequest {
  picks: Selection[];
  stake: number;
  parlay: boolean;
  lounge: string;
  /** One id per click: replaying it changes nothing. */
  requestId: string;
}

export class SportsbookService {
  constructor(
    private readonly db: AppDB,
    private readonly economy: EconomyService,
    private readonly notifier: Notifier,
  ) {}

  async place(req: PlaceRequest): Promise<{ tickets: Ticket[]; replayed: boolean }> {
    if (!req.requestId) throw new DomainError('CAREER_RULE', 'Missing request id');
    return this.db.transaction('rw', [...this.economy.tables, this.db.careers], async () => {
      const c = await this.db.careers.get('career');
      if (!c) throw new DomainError('NO_PROFILE', 'No career found');
      const existing = ticketsOf(c);
      const mine = existing.filter((t) => t.id.startsWith(`${req.requestId}:`));
      if (mine.length) return { tickets: mine, replayed: true };
      const balance = await this.economy.getBalance(c.playerId);
      const built = buildTickets({
        seed: sportsSeedOf(c), season: c.season, week: c.week, picks: req.picks, stake: req.stake, parlay: req.parlay,
        balance, lounge: req.lounge, requestId: req.requestId, openCount: existing.filter((t) => t.status === 'open').length,
      });
      if (!built.ok) throw new DomainError('CAREER_RULE', built.reason);
      for (const t of built.tickets) {
        await this.economy.post({ ownerId: c.playerId, amount: -t.stake, type: 'sports_bet', sourceId: t.id, idempotencyKey: `bet:${t.id}` });
      }
      const totals = bookTotalsOf(c);
      totals.tickets += built.tickets.length;
      totals.staked += built.total;
      await this.db.careers.put(withBook(c, [...built.tickets, ...existing], totals));
      return { tickets: built.tickets, replayed: false };
    });
  }

  /**
   * Settles anything already final (normally done by advancing the week; this catches tickets
   * left over from an older build). Idempotent.
   */
  async settleDue(): Promise<Ticket[]> {
    const settled = await this.db.transaction('rw', [...this.economy.tables, this.db.careers], async (): Promise<Ticket[]> => {
      const c = await this.db.careers.get('career');
      if (!c) return [];
      const o = settleSports({ career: c, money: [] as MoneyOp[] });
      if (!o.settledTickets.length) return [];
      for (const op of o.money) await this.economy.post({ ownerId: c.playerId, amount: op.amount, type: op.type, sourceId: op.sourceId, idempotencyKey: op.key });
      await this.db.careers.put(o.career);
      return o.settledTickets;
    });
    if (settled.length) this.notifier.emit({ kind: 'info', title: 'Sportsbook tickets settled', body: 'Results are in your Inbox.', refId: `sb:${settled[0].id}` });
    return settled;
  }
}
