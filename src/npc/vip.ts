/**
 * Private rooms: each casino has a poker room and a private course, unlocked together and for
 * good by an invitation from a dealer who works that floor. Pure rules.
 *
 * Path to Friend: tips alone top out at Regular (base 50 + goodwill cap 15). Once a dealer
 * counts Ryan as a Regular, every casino night spent at their table adds one point of real
 * relationship ("table time", via applyInteraction), so Friend takes steady visits, not money.
 *
 * The invitation for a casino needs a dealer at Friend or better who has had Ryan at their
 * table on at least INVITE_NIGHTS nights at that casino. (Until the other floors have dealers of
 * their own, the Desert Palms dealers fill in everywhere, so the nights are what tie an
 * invitation to a place.)
 */
import type { LocationId } from '../expansion/unlocks';
import { dealerById } from './registry';
import { applyInteraction, normalizeNpcState, relationshipOf, tierIdOf, tierRank } from './relationship';
import type { DealerId, NpcState } from './types';

export const INVITE_NIGHTS = 3;
export const TABLE_TIME_GAIN = 1;

export const nightsKey = (loc: LocationId) => `nights:${loc}`;
export const nightsAt = (s: NpcState, loc: LocationId) => Number(normalizeNpcState(s).flags?.[nightsKey(loc)] ?? 0);

/** A new casino night at this dealer's table: counts the night here, and table time once Regular. */
export function applyTableNight(prev0: NpcState, loc: LocationId, at: string): { next: NpcState; gain: number } {
  const prev = normalizeNpcState(prev0);
  let next: NpcState = { ...prev, flags: { ...prev.flags, [nightsKey(loc)]: nightsAt(prev, loc) + 1 } };
  let gain = 0;
  if (tierRank(tierIdOf(prev)) >= tierRank('regular')) {
    const after = applyInteraction(next, TABLE_TIME_GAIN, 'table_time', at);
    gain = after.base - next.base;
    next = after;
  }
  return { next, gain };
}

/** The dealer who would invite Ryan at this casino now (the closest one), or null. */
export function inviterAt(loc: LocationId, states: readonly NpcState[]): DealerId | null {
  const ok = states
    .filter((s) => dealerById(s.npcId) && tierRank(tierIdOf(s)) >= tierRank('friend') && nightsAt(s, loc) >= INVITE_NIGHTS)
    .sort((a, b) => relationshipOf(b) - relationshipOf(a));
  return (ok[0]?.npcId as DealerId) ?? null;
}

/** Career flag set when a casino's private room and course are unlocked (value: game time). */
export const vipKey = (loc: LocationId) => `vip:${loc}`;
export const vipByKey = (loc: LocationId) => `vipBy:${loc}`;
export const hasVip = (flags: Record<string, unknown>, loc: LocationId) => typeof flags[vipKey(loc)] === 'string';

/** What the inviting dealer says (approved under the standing approval, docs/APPROVALS.md). */
export const INVITE_LINES: Record<DealerId, (room: string, course: string) => string[]> = {
  velvet_vega: (room, course) => [
    'Hey. Lean in. No, not that close.',
    `There's a game in ${room} on nights like this. Regulars only. I told them you tip well and lose with dignity. They took that as a warning.`,
    `And the owner's got a private course out back, ${course}. He plays skins for real money. Bring your good putter.`,
  ],
  stick_lady: (room, course) => [
    'Seven out. Table\'s cold. Come here a sec.',
    `You've been good to my rail. ${room} has a seat open. Real poker, real sharks. Don't roll anything.`,
    `Also, ${course}. Private. They gamble on every hole. I'd go with you but I'm afraid of grass.`,
  ],
  madame_monique: (room, course) => [
    'The wheel told me you would be here tonight. The schedule also told me.',
    `There is a room, ${room}. The cards in there have memories. So do the players. Go.`,
    `And ${course}. A private course. I see money changing hands. Some of it yours. Which way, the wheel won't say.`,
  ],
  waifu: (room, course) => [
    'A quiet word, before the next shoe.',
    `${room}. A private game for people the house trusts. You are one now. Please don't make me wrong.`,
    `There is also ${course}. Private. The members play for stakes. Very well. Let us see.`,
  ],
  winston: (room, course) => [
    'Three cards are for tourists. You\'re not a tourist anymore.',
    `There's a game upstairs, ${room}. Four people who've never once said "I got lucky." Tell them Winston sent you.`,
    `And if your swing needs the exercise, ${course}. Private course, skins for cash. Don't make me regret this.`,
  ],
};
