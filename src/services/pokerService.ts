/**
 * Private rooms: the dealer invitation that unlocks a casino's poker room and private course,
 * and the poker table itself.
 *
 * Money: Ryan's buy-in (and any rebuy) is one ledger debit, and his stack is credited back once
 * when he leaves the table. Both use idempotency keys tied to the table session, so a reload
 * or a double click can never charge or pay twice. In between, chips move only inside the
 * saved table state, where the rules module conserves them. The regulars' chips aren't
 * Ryan's money: a regular who busts reloads between hands. Opponents decide from their own
 * cards and the board only (src/casino/poker/ai.ts).
 */
import { decide, viewFor } from '../casino/poker/ai';
import { act, legal, newTable, runOut, startHand, type Action, type HoldemState, type TableRules } from '../casino/poker/holdem';
import type { Card } from '../casino/blackjack';
import { roomAt, type PokerRoom } from '../casino/poker/rooms';
import { cryptoInt, type RandomInt } from '../casino/random';
import * as engine from '../career/engine';
import type { CareerState } from '../career/types';
import { DomainError } from '../core/errors';
import { newId } from '../core/ids';
import { casinoAt, locationById } from '../expansion/locations';
import type { LocationId } from '../expansion/unlocks';
import { freshNpcState, normalizeNpcState } from '../npc/relationship';
import { DEALERS } from '../npc/registry';
import type { DealerId, NpcState } from '../npc/types';
import { hasVip, inviterAt, vipByKey, vipKey } from '../npc/vip';
import type { AppDB } from '../persistence/db';
import type { EconomyService } from './economyService';
import { buyIn as skinsBuyIn, courseAt, newMatch, payoutOf, playHole, type SkinsMatch, type SkinsStyle } from '../expansion/skins';
import { playerRating } from '../career/stats';

export const SKINS_ENERGY = 10;
export const skinsMatch = (c: CareerState) => readTable(c.flags.skinsMatch) as unknown as SkinsMatch | null;
export const skinsWeekKey = (loc: LocationId) => `skinsWeek:${loc}`;
/** Why Ryan can't tee off at this course right now, or null. */
export function skinsBlocker(c: CareerState, loc: LocationId, balance: number): string | null {
  if (!hasVip(c.flags, loc)) return 'Members and their guests only';
  if (skinsMatch(c)) return 'Finish the match you started';
  if (c.flags[skinsWeekKey(loc)] === engine.casinoWeekKey(c)) return 'One tee time a week. Come back next week.';
  if (c.energy < SKINS_ENERGY) return 'Too tired for nine holes';
  if (balance < skinsBuyIn(courseAt(loc))) return `The buy-in is ${skinsBuyIn(courseAt(loc)).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}`;
  return null;
}

export const HERO = 0;

export interface ChatLine { seat: number; text: string }

/** One finished hand, for the hand history (newest last, capped). */
export interface HandRecord {
  handNo: number;
  hole: Card[];
  board: Card[];
  board2?: Card[];
  /** Ryan's chips won or lost on the hand. */
  net: number;
  lines: string[];
}
export const HISTORY_KEPT = 20;
export const TIME_BANKS = 3;

export interface PokerTable {
  sessionId: string;
  location: LocationId;
  /** Chips Ryan has bought (buy-in plus rebuys), for the casino totals at cash-out. */
  bought: number;
  buys: number;
  state: HoldemState;
  /** What was said during the last stretch of play (presentation only). */
  chat: ChatLine[];
  /** Table rules picked when sitting down (missing on 0.25 tables: none). */
  rules?: TableRules;
  /** Ryan straddles when he's under the gun. */
  straddle?: boolean;
  /** Ryan's stack when the current hand was dealt. */
  startStack?: number;
  history?: HandRecord[];
  /** Time Bank extensions left this session. */
  timeBank?: number;
  v: 1;
}

/** A moment in the regulars' play, for the table to replay one action at a time. */
export interface Frame { state: HoldemState; chat?: ChatLine }

const readTable = (raw: unknown): PokerTable | null => {
  if (typeof raw !== 'string' || !raw) return null;
  try { return JSON.parse(raw) as PokerTable; } catch { return null; }
};
export const pokerTable = (c: CareerState) => readTable(c.flags.pokerTable);
export const handLive = (t: PokerTable) => !t.state.result && t.state.handNo > 0;
const heroLive = (s: HoldemState) => s.seats[HERO].inHand && !s.seats[HERO].folded;

const pick = <T,>(xs: readonly T[], rand: RandomInt) => xs[rand(xs.length)];
const frameOf = (s: HoldemState, chat?: ChatLine): Frame => ({ state: { ...s, deck: [] }, chat });

/**
 * Opponents act until it's Ryan's turn, Ryan has a Run It Twice call to make, or the hand is
 * over. Adds table talk as it goes, and a frame per action when `frames` is given.
 */
export function playToHero(s0: HoldemState, room: PokerRoom, chat: ChatLine[], rand: RandomInt = cryptoInt, talk: RandomInt = cryptoInt, frames?: Frame[]): HoldemState {
  let s = s0;
  let guard = 0;
  while (!s.result) {
    if (++guard > 500) throw new Error('Poker loop did not settle');
    if (s.awaitRunout) {
      if (heroLive(s)) return s; // Ryan's call
      s = runOut(s, 1);
      frames?.push(frameOf(s));
      continue;
    }
    if (s.toAct < 0 || s.toAct === HERO) break;
    const i = s.toAct;
    const reg = room.regulars[i - 1];
    const a = decide(viewFor(s, i), reg.style, rand);
    s = act(s, a);
    let line: ChatLine | undefined;
    if (talk(100) < 22) {
      const lines = a.type === 'raise' ? reg.lines.raise : a.type === 'fold' ? reg.lines.fold : null;
      if (lines) { line = { seat: i, text: pick(lines, talk) }; chat.push(line); }
    }
    frames?.push(frameOf(s, line));
  }
  if (s.result) {
    const top = [...s.result.wins].sort((a, b) => b.amount - a.amount)[0];
    let line: ChatLine | undefined;
    if (top && top.seat !== HERO && talk(100) < 60) line = { seat: top.seat, text: pick(room.regulars[top.seat - 1].lines.win, talk) };
    else if (top && top.seat === HERO && talk(100) < 40) {
      const loser = 1 + talk(room.regulars.length);
      line = { seat: loser, text: pick(room.regulars[loser - 1].lines.lose, talk) };
    }
    if (line) { chat.push(line); if (frames?.length) frames[frames.length - 1].chat ??= line; }
  }
  return s;
}

/** Adds the finished hand to the history once. */
function withHistory(t: PokerTable, s: HoldemState): PokerTable {
  const hist = t.history ?? [];
  if (!s.result || hist.some((h) => h.handNo === s.handNo)) return { ...t, state: s };
  const rec: HandRecord = {
    handNo: s.handNo, hole: s.seats[HERO].hole, board: s.board, board2: s.board2,
    net: s.seats[HERO].stack - (t.startStack ?? s.seats[HERO].stack), lines: s.log.slice(-6),
  };
  return { ...t, state: s, history: [...hist, rec].slice(-HISTORY_KEPT) };
}

/** Text of a hand for "Share hand" (copied to the clipboard by the table). */
export function shareText(h: HandRecord, room: string): string {
  const card = (c: Card) => `${['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K'][c.rank]}${'shdc'[c.suit]}`;
  return [
    `${room}, hand #${h.handNo}`,
    `Ryan: ${h.hole.map(card).join(' ')}`,
    h.board.length ? `Board: ${h.board.map(card).join(' ')}` : '',
    h.board2?.length ? `Board 2: ${h.board2.map(card).join(' ')}` : '',
    ...h.lines,
    `Result: ${h.net >= 0 ? '+' : ''}$${h.net}`,
  ].filter(Boolean).join('\n');
}

export interface VipStatus {
  location: LocationId;
  unlocked: boolean;
  /** A dealer ready to invite Ryan here now (only when not yet unlocked). */
  inviter: DealerId | null;
  room: PokerRoom;
}

export class PokerService {
  constructor(private readonly db: AppDB, private readonly economy: EconomyService, private readonly rand: RandomInt = cryptoInt) {}

  private async career(): Promise<CareerState> {
    const c = await this.db.careers.get('career');
    if (!c) throw new DomainError('NO_PROFILE', 'No career found');
    return c;
  }

  /** At the casino this week, not mid-tournament (same rule as every table). */
  private async open(): Promise<CareerState> {
    const c = await this.career();
    if (c.flags.casinoVisit !== engine.casinoWeekKey(c)) throw new DomainError('CAREER_RULE', 'Visit the casino first (uses one activity)');
    if (c.active) throw new DomainError('CAREER_RULE', 'Finish your tournament first');
    return c;
  }

  private async dealerStates(): Promise<NpcState[]> {
    const rows = new Map((await this.db.npcState.toArray()).map((r) => [r.npcId, r as NpcState]));
    return DEALERS.map((d) => { const r = rows.get(d.id); return r ? normalizeNpcState(r) : freshNpcState(d.id); });
  }

  async vipStatus(loc: LocationId): Promise<VipStatus> {
    const c = await this.career();
    const unlocked = hasVip(c.flags, loc);
    return { location: loc, unlocked, inviter: unlocked ? null : inviterAt(loc, await this.dealerStates()), room: roomAt(loc) };
  }

  /** Ryan says yes to the invitation: the poker room and the private course here open for good. */
  async acceptInvite(loc: LocationId): Promise<VipStatus> {
    return this.db.transaction('rw', [this.db.careers, this.db.npcState, this.db.profiles], async () => {
      const c = await this.open();
      if (casinoAt(c) !== loc) throw new DomainError('CAREER_RULE', `You're not at ${locationById(loc).name}`);
      if (hasVip(c.flags, loc)) return { location: loc, unlocked: true, inviter: null, room: roomAt(loc) };
      const by = inviterAt(loc, await this.dealerStates());
      if (!by) throw new DomainError('CAREER_RULE', 'Nobody has invited you yet');
      const at = (await this.db.profiles.get(c.playerId))?.careerClock ?? new Date(0).toISOString();
      const next = { ...c, flags: { ...c.flags, [vipKey(loc)]: at, [vipByKey(loc)]: by } };
      await this.db.careers.put(next);
      return { location: loc, unlocked: true, inviter: null, room: roomAt(loc) };
    });
  }

  /** Tees off a skins match at this casino's private course: buy-in debited once, 10 energy. */
  async skinsStart(): Promise<SkinsMatch> {
    return this.db.transaction('rw', [...this.economy.tables, this.db.careers], async () => {
      const c = await this.open();
      const loc = casinoAt(c);
      const block = skinsBlocker(c, loc, await this.economy.getBalance(c.playerId));
      if (block) throw new DomainError('CAREER_RULE', block);
      const id = newId('skins');
      const m = newMatch(id, loc, (this.rand(2 ** 30) ^ Date.now()) >>> 0, Math.round(playerRating(c)));
      await this.economy.post({ ownerId: c.playerId, amount: -skinsBuyIn(m), type: 'casino', sourceId: id, idempotencyKey: `skins:${id}:buy` });
      const flags = { ...c.flags, skinsMatch: JSON.stringify(m), [skinsWeekKey(loc)]: engine.casinoWeekKey(c) };
      await this.db.careers.put({ ...c, energy: Math.max(0, c.energy - SKINS_ENERGY), flags });
      return m;
    });
  }

  /** Plays the next hole; when the match ends, pays Ryan's skins once and clears it. */
  async skinsPlay(style: SkinsStyle): Promise<{ match: SkinsMatch; payout: number | null }> {
    if (!['safe', 'normal', 'aggressive'].includes(style)) throw new DomainError('CAREER_RULE', 'Pick how to play the hole');
    return this.db.transaction('rw', [...this.economy.tables, this.db.careers], async () => {
      const c = await this.career();
      const prev = skinsMatch(c);
      if (!prev) throw new DomainError('CAREER_RULE', 'No match in progress');
      const m = playHole(prev, style);
      if (!m.done) {
        await this.db.careers.put({ ...c, flags: { ...c.flags, skinsMatch: JSON.stringify(m) } });
        return { match: m, payout: null };
      }
      const payout = payoutOf(m);
      if (payout > skinsBuyIn(m) * m.players.length) throw new DomainError('CAREER_RULE', 'Payout exceeds the pool');
      if (payout > 0) await this.economy.post({ ownerId: c.playerId, amount: payout, type: 'casino', sourceId: m.id, idempotencyKey: `skins:${m.id}:pay` });
      const recorded = engine.recordCasino(c, skinsBuyIn(m), payout, { biggestWin: payout - skinsBuyIn(m) });
      const flags: CareerState['flags'] = { ...recorded.flags, skinsLast: JSON.stringify(m) };
      delete flags.skinsMatch;
      await this.db.careers.put({ ...recorded, flags });
      return { match: m, payout };
    });
  }

  async table(): Promise<PokerTable | null> {
    return pokerTable(await this.career());
  }

  private roomFor(c: CareerState): PokerRoom {
    const loc = casinoAt(c);
    if (!hasVip(c.flags, loc)) throw new DomainError('CAREER_RULE', 'This room is invitation only');
    const room = roomAt(loc);
    if (!room.open) throw new DomainError('CAREER_RULE', `The ${room.variantName} table is still being set up`);
    return room;
  }

  /** Buys in and deals the first hand. */
  async sit(buyIn: number, rules: TableRules = {}): Promise<PokerTable & { frames: Frame[] }> {
    return this.db.transaction('rw', [...this.economy.tables, this.db.careers], async () => {
      const c = await this.open();
      if (pokerTable(c)) throw new DomainError('CAREER_RULE', "You're already sitting at the table");
      const room = this.roomFor(c);
      if (!Number.isInteger(buyIn) || buyIn < room.buyIn.min || buyIn > room.buyIn.max) throw new DomainError('CAREER_RULE', `Buy in for ${room.buyIn.min}–${room.buyIn.max}`);
      if (buyIn > (await this.economy.getBalance(c.playerId))) throw new DomainError('CAREER_RULE', 'Not enough in the bankroll');
      const sessionId = newId('poker');
      await this.economy.post({ ownerId: c.playerId, amount: -buyIn, type: 'casino', sourceId: sessionId, idempotencyKey: `poker:${sessionId}:buy:1` });
      const players = [{ id: 'ryan', name: 'Ryan', stack: buyIn }, ...room.regulars.map((r) => ({ id: r.id, name: r.short, stack: room.regularStack }))];
      const clean: TableRules = {
        runTwice: !!rules.runTwice && room.variant !== 'stud',
        doubleBoard: !!rules.doubleBoard && room.variant !== 'stud',
        sevenDeuce: room.variant === 'holdem' && rules.sevenDeuce ? room.bb : 0,
      };
      const chat: ChatLine[] = [{ seat: 1 + this.rand(room.regulars.length), text: '' }];
      chat[0].text = pick(room.regulars[chat[0].seat - 1].lines.sit, this.rand);
      const frames: Frame[] = [];
      const first = startHand(newTable(players, room.sb, room.bb, { variant: room.variant, rules: clean }), this.rand);
      frames.push(frameOf(first, chat[0]));
      const state = playToHero(first, room, chat, this.rand, this.rand, frames);
      const t = withHistory({ sessionId, location: room.location, bought: buyIn, buys: 1, state, chat, rules: clean, startStack: buyIn, history: [], timeBank: TIME_BANKS, v: 1 }, state);
      await this.save(c, t);
      return { ...t, frames };
    });
  }

  /** Ryan's straddle preference (used when he's under the gun in Hold'em or Omaha). */
  async setStraddle(on: boolean): Promise<PokerTable> {
    return this.db.transaction('rw', [this.db.careers], async () => {
      const c = await this.career();
      const t = pokerTable(c);
      if (!t) throw new DomainError('CAREER_RULE', 'Sit down first');
      const next = { ...t, straddle: on };
      await this.save(c, next);
      return next;
    });
  }

  /** Uses one Time Bank extension (+10 seconds on the shot clock). */
  async useTimeBank(): Promise<PokerTable> {
    return this.db.transaction('rw', [this.db.careers], async () => {
      const c = await this.career();
      const t = pokerTable(c);
      if (!t) throw new DomainError('CAREER_RULE', 'Sit down first');
      const left = t.timeBank ?? TIME_BANKS;
      if (left <= 0) throw new DomainError('CAREER_RULE', 'No Time Bank left');
      const next = { ...t, timeBank: left - 1 };
      await this.save(c, next);
      return next;
    });
  }

  /**
   * Run It Twice: Ryan's answer when everyone left is all in. Running it twice needs every
   * player in the hand to agree; each regular's answer depends on their style.
   */
  async runout(twice: boolean): Promise<{ table: PokerTable; frames: Frame[]; agreed: boolean }> {
    return this.db.transaction('rw', [this.db.careers], async () => {
      const c = await this.career();
      const t = pokerTable(c);
      if (!t || !t.state.awaitRunout) throw new DomainError('CAREER_RULE', 'Nothing to run out');
      const room = roomAt(t.location);
      const others = t.state.seats.map((x, i) => (i !== HERO && x.inHand && !x.folded ? i : -1)).filter((i) => i > 0);
      const agreed = twice && others.every((i) => this.rand(100) < 45 + 50 * room.regulars[i - 1].style.aggro);
      const chat: ChatLine[] = [];
      if (twice && !agreed) {
        const no = others.find(() => true)!;
        chat.push({ seat: no, text: 'Once. I like my bad beats in one piece.' });
      }
      const frames: Frame[] = [];
      let state = runOut(t.state, agreed ? 2 : 1);
      frames.push(frameOf(state, chat[0]));
      state = playToHero(state, room, chat, this.rand, this.rand, frames);
      const next = withHistory({ ...t, chat }, state);
      await this.save(c, next);
      return { table: next, frames, agreed };
    });
  }

  private async save(c: CareerState, t: PokerTable | null) {
    const flags = { ...c.flags };
    if (t) flags.pokerTable = JSON.stringify(t);
    else delete flags.pokerTable;
    await this.db.careers.put({ ...c, flags });
  }

  /** Ryan's move; the regulars then play until it's his turn again or the hand ends. */
  async act(a: Action): Promise<PokerTable & { frames: Frame[] }> {
    return this.db.transaction('rw', [this.db.careers], async () => {
      const c = await this.open();
      const t = pokerTable(c);
      if (!t) throw new DomainError('CAREER_RULE', 'Sit down first');
      if (t.state.toAct !== HERO) throw new DomainError('CAREER_RULE', 'Not your turn');
      const room = roomAt(t.location);
      const chat: ChatLine[] = [];
      const frames: Frame[] = [];
      let state: HoldemState;
      try { state = act(t.state, a); } catch (e) { throw new DomainError('CAREER_RULE', (e as Error).message); }
      frames.push(frameOf(state));
      state = playToHero(state, room, chat, this.rand, this.rand, frames);
      const next = withHistory({ ...t, chat }, state);
      await this.save(c, next);
      return { ...next, frames };
    });
  }

  /** Deals the next hand. Busted regulars reload; Ryan needs chips (rebuy) to be dealt in. */
  async nextHand(): Promise<PokerTable & { frames: Frame[] }> {
    return this.db.transaction('rw', [this.db.careers], async () => {
      const c = await this.open();
      const t = pokerTable(c);
      if (!t) throw new DomainError('CAREER_RULE', 'Sit down first');
      if (handLive(t)) throw new DomainError('CAREER_RULE', 'Finish this hand first');
      if (t.state.seats[HERO].stack <= 0) throw new DomainError('CAREER_RULE', "You're out of chips: rebuy or leave");
      const room = roomAt(t.location);
      const reloaded = { ...t.state, seats: t.state.seats.map((x, i) => (i !== HERO && x.stack < room.bb ? { ...x, stack: room.regularStack } : x)) };
      // Straddle: the seat after the big blind. Ryan straddles if he's set it; aggressive regulars sometimes do.
      const n = reloaded.seats.length;
      const utg = (reloaded.button + 4) % n; // button moves one, then SB, BB, then under the gun
      const wantsStraddle = room.variant !== 'stud' && (utg === HERO ? !!t.straddle : room.regulars[utg - 1].style.aggro > 0.6 && this.rand(100) < 30);
      const chat: ChatLine[] = [];
      const frames: Frame[] = [];
      const dealt = startHand(reloaded, this.rand, { straddle: wantsStraddle });
      frames.push(frameOf(dealt));
      const state = playToHero(dealt, room, chat, this.rand, this.rand, frames);
      const next = withHistory({ ...t, chat, startStack: t.state.seats[HERO].stack }, state);
      await this.save(c, next);
      return { ...next, frames };
    });
  }

  /** More chips between hands, up to the room's maximum buy-in on the table. */
  async rebuy(amount: number): Promise<PokerTable> {
    return this.db.transaction('rw', [...this.economy.tables, this.db.careers], async () => {
      const c = await this.open();
      const t = pokerTable(c);
      if (!t) throw new DomainError('CAREER_RULE', 'Sit down first');
      if (handLive(t)) throw new DomainError('CAREER_RULE', 'Rebuy between hands');
      const room = roomAt(t.location);
      const stack = t.state.seats[HERO].stack;
      if (!Number.isInteger(amount) || amount <= 0 || stack + amount > room.buyIn.max) throw new DomainError('CAREER_RULE', `You can have at most ${room.buyIn.max} on the table`);
      if (amount > (await this.economy.getBalance(c.playerId))) throw new DomainError('CAREER_RULE', 'Not enough in the bankroll');
      const buys = t.buys + 1;
      await this.economy.post({ ownerId: c.playerId, amount: -amount, type: 'casino', sourceId: t.sessionId, idempotencyKey: `poker:${t.sessionId}:buy:${buys}` });
      const seats = t.state.seats.map((x, i) => (i === HERO ? { ...x, stack: x.stack + amount } : x));
      const next = { ...t, buys, bought: t.bought + amount, state: { ...t.state, seats }, chat: [] };
      await this.save(c, next);
      return next;
    });
  }

  /**
   * Cashes out. Mid-hand, Ryan's hand is folded (or, if he's all in, played out) first, so
   * chips already in the pot stay there. Credits his stack once.
   */
  async leave(): Promise<{ cashOut: number; bought: number }> {
    return this.db.transaction('rw', [...this.economy.tables, this.db.careers], async () => {
      const c = await this.career();
      const t = pokerTable(c);
      if (!t) throw new DomainError('CAREER_RULE', "You're not at a table");
      const room = roomAt(t.location);
      let s = t.state;
      if (handLive(t)) {
        if (s.toAct === HERO) s = legal(s, HERO).check ? act(s, { type: 'check' }) : act(s, { type: 'fold' });
        // Ryan checked or folded; if he's still in, keep checking/folding until the hand ends.
        let guard = 0;
        while (!s.result) {
          if (++guard > 200) throw new Error('Poker loop did not settle');
          if (s.awaitRunout) s = runOut(s, 1);
          s = playToHero(s, room, [], this.rand, this.rand);
          if (!s.result && s.toAct === HERO) s = act(s, { type: legal(s, HERO).check ? 'check' : 'fold' });
        }
      }
      const cashOut = s.seats[HERO].stack;
      if (cashOut > 0) await this.economy.post({ ownerId: c.playerId, amount: cashOut, type: 'casino', sourceId: t.sessionId, idempotencyKey: `poker:${t.sessionId}:cash` });
      const recorded = engine.recordCasino(c, t.bought, cashOut, { biggestWin: cashOut - t.bought });
      await this.save(recorded, null);
      return { cashOut, bought: t.bought };
    });
  }
}
