/**
 * Waifu (baccarat) and Winston (Three Card Poker): event-driven dealer lines from
 * the supplied dialogue JSON. Every line is a DRAFT until the Script Room signs it
 * off (see docs/casino/WAIFU_WINSTON_DIALOGUE_BIBLE.md); the UI marks them as such.
 *
 * Rules from the dialogue bible: lines are picked at random per event with an
 * anti-repeat cooldown; a "quiet" chat setting keeps only result and notice lines;
 * nothing is said over a deal (the table queues the line until the cards are down);
 * speech never blocks betting or settlement.
 */
import waifuJson from './dialogue/waifu.json';
import winstonJson from './dialogue/winston.json';
import { cryptoInt, type RandomInt } from './random';

export type WWDealer = 'waifu' | 'winston';

export interface WWLine {
  id: string;
  text: string;
  status: string;
}

interface DialogueFile {
  character: string;
  approval_status: string;
  lines: Record<string, WWLine[]>;
}

export const WW_DIALOGUE: Record<WWDealer, DialogueFile> = { waifu: waifuJson as DialogueFile, winston: winstonJson as DialogueFile };

export const WAIFU_EVENTS = ['welcome', 'bet', 'deal', 'natural', 'player_win', 'banker_win', 'push', 'shuffle', 'big_win', 'loss', 'insufficient_funds', 'return_visit'] as const;
export const WINSTON_EVENTS = [
  'welcome', 'bet', 'deal', 'decision', 'dealer_qualifies', 'dealer_no_qualify', 'player_win', 'dealer_win', 'push',
  'pair_plus_win', 'ante_bonus', 'fold', 'big_win', 'loss', 'insufficient_funds', 'return_visit',
] as const;
export type WaifuEvent = (typeof WAIFU_EVENTS)[number];
export type WinstonEvent = (typeof WINSTON_EVENTS)[number];
export type WWEvent = WaifuEvent | WinstonEvent;

/** Lines kept when chat is set to quiet: results and things the player needs to know. */
const ESSENTIAL = new Set<string>(['natural', 'player_win', 'banker_win', 'dealer_win', 'push', 'shuffle', 'insufficient_funds', 'dealer_qualifies', 'dealer_no_qualify', 'pair_plus_win', 'ante_bonus', 'big_win']);

export type ChatLevel = 'normal' | 'quiet';

/** How many of a dealer's most recent line ids are skipped when picking. */
export const COOLDOWN = 4;

/**
 * Picks a line for an event, skipping the recently used ones where the event has
 * enough alternatives. Returns null if the event is muted by the chat setting or
 * has no lines.
 */
export function pickLine(who: WWDealer, event: WWEvent, recent: string[], level: ChatLevel = 'normal', rand: RandomInt = cryptoInt): WWLine | null {
  if (level === 'quiet' && !ESSENTIAL.has(event)) return null;
  const pool = WW_DIALOGUE[who].lines[event] ?? [];
  if (!pool.length) return null;
  const fresh = pool.filter((l) => !recent.slice(-COOLDOWN).includes(l.id));
  const from = fresh.length ? fresh : pool.filter((l) => l.id !== recent[recent.length - 1]);
  const list = from.length ? from : pool;
  return list[rand(list.length)];
}

export const isApproved = (l: WWLine) => l.status === 'approved';

// ── Faces and poses (presentation) ──

export type WaifuPose = 'idle' | 'deal' | 'present' | 'think';
export type WinstonPose = 'idle' | 'present' | 'point' | 'think';

export const WAIFU_FACE: Record<WaifuEvent, string> = {
  welcome: 'smile', return_visit: 'smile', bet: 'neutral', deal: 'soft', natural: 'surprised', player_win: 'confident', banker_win: 'confident',
  push: 'soft', shuffle: 'closed', big_win: 'delighted', loss: 'soft', insufficient_funds: 'neutral',
};
export const WAIFU_POSE: Record<WaifuEvent, WaifuPose> = {
  welcome: 'idle', return_visit: 'idle', bet: 'idle', deal: 'deal', natural: 'present', player_win: 'present', banker_win: 'present',
  push: 'present', shuffle: 'deal', big_win: 'present', loss: 'think', insufficient_funds: 'think',
};
export const WINSTON_FACE: Record<WinstonEvent, string> = {
  welcome: 'grin', return_visit: 'grin', bet: 'smirk', deal: 'neutral', decision: 'smirk', dealer_qualifies: 'smirk', dealer_no_qualify: 'surprised',
  player_win: 'laugh', dealer_win: 'wink', push: 'neutral', pair_plus_win: 'roar', ante_bonus: 'roar', fold: 'closed', big_win: 'roar', loss: 'closed',
  insufficient_funds: 'neutral',
};
export const WINSTON_POSE: Record<WinstonEvent, WinstonPose> = {
  welcome: 'present', return_visit: 'present', bet: 'idle', deal: 'idle', decision: 'think', dealer_qualifies: 'point', dealer_no_qualify: 'present',
  player_win: 'present', dealer_win: 'point', push: 'present', pair_plus_win: 'point', ante_bonus: 'point', fold: 'idle', big_win: 'present', loss: 'idle',
  insufficient_funds: 'think',
};
