/**
 * Dealer relationships and tipping (Casino Secrets & Rivalries, Slice 1). Pure rules.
 *
 * CONFIRMED: tips come out of the bankroll; lifetime totals, counts and frequency are kept per
 * dealer; generosity and consistency help, with diminishing returns so one enormous tip can't
 * buy maximum friendship; no decay; no penalty for never tipping; tips never touch a game's
 * odds or payouts (nothing here is imported by src/casino).
 *
 * PROPOSED numbers (pending approval): tip sizes, the gain curve, the caps and the tier names.
 *
 * relationship = base + goodwill
 *   base      conversations and events (later slices); starts neutral at 50
 *   goodwill  tips only, capped at GOODWILL_CAP, so tips alone top out at the "Regular" tier
 */
import type { NpcId, NpcState } from './types';

/** PROPOSED tip sizes at Desert Palms. */
export const TIP_AMOUNTS = [5, 25, 100] as const;
export const NEUTRAL_BASE = 50;
/** Most relationship tips alone can ever add. */
export const GOODWILL_CAP = 15;
/** Most one tip can add, and most one casino visit's tips can add. */
export const TIP_GAIN_CAP = 3;
export const VISIT_GAIN_CAP = 5;
/** Visits remembered for the consistency bonus. */
export const VISITS_REMEMBERED = 8;

/** Tier labels shown instead of numbers (PROPOSED names). */
export const TIERS = [
  { min: 0, label: 'New face' },
  { min: 55, label: 'Familiar' },
  { min: 62, label: 'Regular' },
  { min: 70, label: 'Friend' },
  { min: 80, label: 'Close friend' },
  { min: 90, label: 'Confidant' },
] as const;
export type TierLabel = (typeof TIERS)[number]['label'];

export const relationshipOf = (s: Pick<NpcState, 'base' | 'goodwill'>) => Math.max(0, Math.min(100, s.base + s.goodwill));

export function tierOf(s: Pick<NpcState, 'base' | 'goodwill'>): TierLabel {
  const r = relationshipOf(s);
  let label: TierLabel = TIERS[0].label;
  for (const t of TIERS) if (r >= t.min - 1e-9) label = t.label;
  return label;
}

export const tierIndex = (label: TierLabel) => TIERS.findIndex((t) => t.label === label);

export function freshNpcState(npcId: NpcId): NpcState {
  return { npcId, base: NEUTRAL_BASE, goodwill: 0, visits: 0, lastVisitKey: '', tips: { lifetime: 0, count: 0, largest: 0, visitKeys: [], visitKey: '', visitGain: 0 } };
}

export type TipEvent = 'tip_first' | 'tip_small' | 'tip_generous' | 'tip_huge' | 'tip_regular' | 'tip_maxed' | 'tier_up';

export interface TipOutcome {
  next: NpcState;
  /** Goodwill actually added (0 when a cap was reached). */
  gain: number;
  event: TipEvent;
  tierBefore: TierLabel;
  tierAfter: TierLabel;
}

/**
 * Applies one tip. `reference` is what counts as a normal bet at that table (its minimum),
 * so "generous" means generous for that game. Gain grows with log2 of the tip-to-reference
 * ratio (diminishing returns), is capped per tip and per visit, earns a small bonus for
 * tipping on several recent visits, and slows as goodwill approaches its cap.
 */
export function applyTip(prev: NpcState, amount: number, reference: number, visitKey: string, at: string): TipOutcome {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('Invalid tip');
  const tips = { ...prev.tips, visitKeys: [...prev.tips.visitKeys] };
  const sameVisit = tips.visitKey === visitKey;
  const visitGainSoFar = sameVisit ? tips.visitGain : 0;
  const ratio = amount / Math.max(1, reference);
  const priorVisits = tips.visitKeys.filter((k) => k !== visitKey).length;
  const consistency = 1 + 0.1 * Math.min(priorVisits, 5);
  const headroom = Math.sqrt(Math.max(0, 1 - prev.goodwill / GOODWILL_CAP));
  let gain = Math.min(1.2 * Math.log2(1 + ratio), TIP_GAIN_CAP) * consistency * headroom;
  gain = Math.min(gain, Math.max(0, VISIT_GAIN_CAP - visitGainSoFar), Math.max(0, GOODWILL_CAP - prev.goodwill));
  gain = Math.round(Math.max(0, gain) * 1000) / 1000;

  const firstTip = tips.count === 0;
  tips.lifetime += amount;
  tips.count += 1;
  tips.largest = Math.max(tips.largest, amount);
  tips.visitKey = visitKey;
  tips.visitGain = Math.round((visitGainSoFar + gain) * 1000) / 1000;
  if (!tips.visitKeys.includes(visitKey)) tips.visitKeys = [...tips.visitKeys, visitKey].slice(-VISITS_REMEMBERED);
  tips.firstAt = tips.firstAt ?? at;
  tips.lastAt = at;
  const next: NpcState = { ...prev, goodwill: Math.min(GOODWILL_CAP, Math.round((prev.goodwill + gain) * 1000) / 1000), tips };

  const tierBefore = tierOf(prev);
  const tierAfter = tierOf(next);
  const event: TipEvent =
    tierIndex(tierAfter) > tierIndex(tierBefore) ? 'tier_up'
    : firstTip ? 'tip_first'
    : prev.goodwill >= GOODWILL_CAP - 1e-9 ? 'tip_maxed'
    : ratio >= 8 ? 'tip_huge'
    : !sameVisit && priorVisits >= 2 ? 'tip_regular'
    : ratio >= 2 ? 'tip_generous'
    : 'tip_small';
  return { next, gain, event, tierBefore, tierAfter };
}

/** Records Ryan sitting at a dealer's table, once per casino visit. Visits never lower anything. */
export function applyVisit(prev: NpcState, visitKey: string): NpcState {
  if (prev.lastVisitKey === visitKey) return prev;
  return { ...prev, visits: prev.visits + 1, lastVisitKey: visitKey };
}

/** How often Ryan tips this dealer: tips per visit at the table (display only). */
export const tipsPerVisit = (s: NpcState) => (s.visits > 0 ? s.tips.count / s.visits : 0);
