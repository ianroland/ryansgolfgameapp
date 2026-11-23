/**
 * Dealer relationships and tipping (Casino Secrets & Rivalries, Slice 1). Pure rules.
 *
 * CONFIRMED: tips come out of the bankroll as gratuities (never wagers); lifetime totals,
 * counts, frequency and the last tip are kept per dealer; consistency earns modest benefits;
 * large tips have diminishing returns and tipping's total contribution is capped, so the higher
 * tiers need real interactions; never tipping costs nothing; no decay; tips never touch a
 * game's odds, RNG, rules or payouts (nothing here is imported by src/casino).
 *
 * relationship = base + goodwill (0–100, never shown; the tier name and badge are)
 *   base      meaningful interactions: conversations, events, quests (`applyInteraction`)
 *   goodwill  tips only, capped at RELATIONSHIP_CONFIG.goodwillCap
 *
 * All numbers live in ./config.ts.
 */
import { RELATIONSHIP_CONFIG as C, type TierDef, type TierId } from './config';
import type { NpcId, NpcState } from './types';

export const TIERS: readonly TierDef[] = C.tiers;
/** Desert Palms tip sizes (the only open casino). */
export const TIP_AMOUNTS: readonly number[] = C.tipAmounts.desert_palms;
export const NEUTRAL_BASE = C.neutralBase;
export const GOODWILL_CAP = C.goodwillCap;
export const TIP_GAIN_CAP = C.tipGainCap;
export const VISIT_GAIN_CAP = C.visitGainCap;

export const relationshipOf = (s: Pick<NpcState, 'base' | 'goodwill'>) => Math.max(0, Math.min(100, s.base + s.goodwill));

export function tierDefOf(s: Pick<NpcState, 'base' | 'goodwill'>): TierDef {
  const r = relationshipOf(s);
  let t: TierDef = TIERS[0];
  for (const d of TIERS) if (r >= d.min - 1e-9) t = d;
  return t;
}
export const tierOf = (s: Pick<NpcState, 'base' | 'goodwill'>): string => tierDefOf(s).label;
export const tierIdOf = (s: Pick<NpcState, 'base' | 'goodwill'>): TierId => tierDefOf(s).id;
export const tierRank = (id: TierId) => TIERS.findIndex((t) => t.id === id);

export function freshNpcState(npcId: NpcId): NpcState {
  return {
    npcId, base: NEUTRAL_BASE, goodwill: 0, visits: 0, lastVisitKey: '',
    tips: { lifetime: 0, count: 0, largest: 0, visitKeys: [], visitKey: '', visitGain: 0, visitsTipped: 0 },
    flags: {}, memories: [],
  };
}

/** Fills fields added after a row was first saved (rows from v0.15.0 lack flags and memories). */
export function normalizeNpcState(s: NpcState): NpcState {
  return {
    ...s,
    tips: { ...s.tips, visitsTipped: s.tips.visitsTipped ?? s.tips.visitKeys.length },
    flags: s.flags ?? {},
    memories: s.memories ?? [],
  };
}

const remember = (s: NpcState, key: string, at: string): NpcState => ({
  ...s,
  memories: [...(s.memories ?? []).filter((m) => m.key !== key), { key, at }].slice(-C.memoriesKept),
});

export type TipEvent = 'tip_first' | 'tip_small' | 'tip_generous' | 'tip_huge' | 'tip_regular' | 'tip_maxed' | 'tier_up';

export interface TipOutcome {
  next: NpcState;
  /** Goodwill actually added (0 when a cap was reached). */
  gain: number;
  event: TipEvent;
  tierBefore: TierId;
  tierAfter: TierId;
}

/**
 * Applies one tip. `reference` is a normal bet at that table (its minimum), so "generous" means
 * generous for that game. Gain grows with log2 of the tip-to-reference ratio, is capped per tip
 * and per visit, earns a small bonus for tipping on several recent visits, and slows as
 * goodwill nears its cap.
 */
export function applyTip(prev0: NpcState, amount: number, reference: number, visitKey: string, at: string): TipOutcome {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('Invalid tip');
  const prev = normalizeNpcState(prev0);
  const tips = { ...prev.tips, visitKeys: [...prev.tips.visitKeys] };
  const sameVisit = tips.visitKey === visitKey;
  const visitGainSoFar = sameVisit ? tips.visitGain : 0;
  const ratio = amount / Math.max(1, reference);
  const priorVisits = tips.visitKeys.filter((k) => k !== visitKey).length;
  const consistency = 1 + C.consistencyStep * Math.min(priorVisits, C.consistencyMaxVisits);
  const headroom = Math.sqrt(Math.max(0, 1 - prev.goodwill / GOODWILL_CAP));
  let gain = Math.min(C.gainScale * Math.log2(1 + ratio), TIP_GAIN_CAP) * consistency * headroom;
  gain = Math.min(gain, Math.max(0, VISIT_GAIN_CAP - visitGainSoFar), Math.max(0, GOODWILL_CAP - prev.goodwill));
  gain = Math.round(Math.max(0, gain) * 1000) / 1000;

  const firstTip = tips.count === 0;
  const newVisit = !tips.visitKeys.includes(visitKey);
  tips.lifetime += amount;
  tips.count += 1;
  tips.largest = Math.max(tips.largest, amount);
  tips.visitKey = visitKey;
  tips.visitGain = Math.round((visitGainSoFar + gain) * 1000) / 1000;
  if (newVisit) {
    tips.visitKeys = [...tips.visitKeys, visitKey].slice(-C.visitsRemembered);
    tips.visitsTipped = (tips.visitsTipped ?? 0) + 1;
  }
  tips.firstAt = tips.firstAt ?? at;
  tips.lastAt = at;
  let next: NpcState = { ...prev, goodwill: Math.min(GOODWILL_CAP, Math.round((prev.goodwill + gain) * 1000) / 1000), tips };

  const tierBefore = tierIdOf(prev);
  const tierAfter = tierIdOf(next);
  const event: TipEvent =
    tierRank(tierAfter) > tierRank(tierBefore) ? 'tier_up'
    : firstTip ? 'tip_first'
    : prev.goodwill >= GOODWILL_CAP - 1e-9 ? 'tip_maxed'
    : ratio >= C.hugeRatio ? 'tip_huge'
    : newVisit && priorVisits >= C.consistentAfterVisits ? 'tip_regular'
    : ratio >= C.generousRatio ? 'tip_generous'
    : 'tip_small';
  // Significant moments, for dialogue that should only happen once and for future events.
  if (firstTip) next = remember({ ...next, flags: { ...next.flags, first_tip: at } }, 'first_tip', at);
  if (event === 'tier_up') next = remember({ ...next, flags: { ...next.flags, [`reached_${tierAfter}`]: at } }, `reached_${tierAfter}`, at);
  return { next, gain, event, tierBefore, tierAfter };
}

/** Records Ryan sitting at a dealer's table, once per casino visit. Visits never lower anything. */
export function applyVisit(prev0: NpcState, visitKey: string): NpcState {
  const prev = normalizeNpcState(prev0);
  if (prev.lastVisitKey === visitKey) return prev;
  return { ...prev, visits: prev.visits + 1, lastVisitKey: visitKey };
}

/**
 * A meaningful interaction (a conversation choice, an event, a favour): the only way past the
 * tip ceiling. Not wired to any content yet; future relationship events call this. Positive or
 * negative, clamped to 0–100, remembered under `key`.
 */
export function applyInteraction(prev0: NpcState, delta: number, key: string, at: string): NpcState {
  const prev = normalizeNpcState(prev0);
  const base = Math.max(0, Math.min(100 - prev.goodwill, prev.base + delta));
  const next = remember({ ...prev, base }, key, at);
  const before = tierIdOf(prev);
  const after = tierIdOf(next);
  return tierRank(after) > tierRank(before) ? { ...next, flags: { ...next.flags, [`reached_${after}`]: at } } : next;
}

/** Tip frequency: share of Ryan's visits to this dealer's table on which he tipped (display/hooks). */
export const tipFrequency = (s: NpcState) => (s.visits > 0 ? Math.min(1, (s.tips.visitsTipped ?? s.tips.visitKeys.length) / s.visits) : 0);
