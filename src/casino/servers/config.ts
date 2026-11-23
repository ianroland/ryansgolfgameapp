/**
 * Cocktail servers and drinks (RYANS_CASINO_SERVERS_DIALOGUE_V1). Every number here is
 * PROPOSED and can be tuned without touching code elsewhere. Values that come from the pack's
 * system_config.json are read from it; the rest are the game's proposals, marked as such.
 *
 * Drinks are RPG and social only: nothing here is read by any casino game's rules, RNG, odds or
 * payouts (enforced by tests).
 */
import type { LocationId } from '../../expansion/unlocks';
import pack from './system_config.json';

export type ServerEffectId = 'liquid_courage' | 'loose_lips' | 'second_wind' | 'bad_judgment' | 'quiet_night';
export type ServerEffectStat = 'social_confidence' | 'focus' | 'discretion' | 'social_energy' | 'stamina' | 'decision_making';

export interface ServerEffectDef {
  id: ServerEffectId;
  label: string;
  type: 'buff' | 'debuff' | 'mixed' | 'neutral';
  stats: Partial<Record<ServerEffectStat, number>>;
  /** Weight when Ryan is merely buzzed, and when impaired (weights slide between them). PROPOSED. */
  weightSober: number;
  weightImpaired: number;
}

const effect = (id: ServerEffectId) => pack.proposed_random_effects.outcomes.find((o) => o.id === id)!;
const statsOf = (id: ServerEffectId) => {
  const { id: _id, type: _t, ...rest } = effect(id) as Record<string, unknown>;
  return rest as Partial<Record<ServerEffectStat, number>>;
};

export const SERVER_CONFIG = {
  drink: {
    id: pack.drink.id as 'titos_double',
    name: pack.drink.display_name,
    /** The only alcoholic drink Ryan can order. */
    onlyAlcoholicOption: true,
    prices: pack.drink.prices_proposed as Record<LocationId, number>,
  },
  water: { id: pack.non_alcoholic.id as 'water', name: pack.non_alcoholic.display_name, price: pack.non_alcoholic.price },
  tipAmounts: pack.proposed_tip_amounts as readonly number[],
  /** A "normal" tip, used for the tip relationship scale (dealers use their table minimum). PROPOSED. */
  tipReference: 10,

  // ── Intoxication (buzz 0-100). PROPOSED unless noted. ──
  /** Buzz added by one Tito's Double (2 strength units × 12). */
  buzzPerDrink: pack.drink.strength_units * 12,
  /** Buzz shed for every completed round at a table (time passing). */
  buzzPerRound: 3,
  /** Buzz shed by a glass of water. */
  buzzPerWater: 8,
  /** Levels by buzz. */
  levels: { buzzed: 20, tipsy: 45, impaired: pack.proposed_refusal.buzz_threshold },
  /** The server voices concern at or above this buzz (before refusing). */
  concernAt: 45,
  /** At or above this buzz the server refuses alcohol (pack value). */
  refuseAt: pack.proposed_refusal.buzz_threshold,
  /** A refusal lifts once buzz has recovered to this or below. */
  refusalLiftsAt: 30,
  /** Energy each Tito's Double costs Ryan (stamina consequence). */
  energyPerDrink: 2,

  // ── Random RPG effects (pack: start after 2 alcoholic drinks this visit). ──
  effectsStartAfter: pack.proposed_random_effects.start_after_alcoholic_drinks_this_visit,
  effects: [
    { id: 'liquid_courage', label: 'Liquid courage', type: 'mixed', stats: statsOf('liquid_courage'), weightSober: 4, weightImpaired: 2 },
    { id: 'loose_lips', label: 'Loose lips', type: 'debuff', stats: statsOf('loose_lips'), weightSober: 2, weightImpaired: 4 },
    { id: 'second_wind', label: 'Second wind', type: 'mixed', stats: statsOf('second_wind'), weightSober: 3, weightImpaired: 1 },
    { id: 'bad_judgment', label: 'Bad judgment', type: 'debuff', stats: statsOf('bad_judgment'), weightSober: 1, weightImpaired: 5 },
    { id: 'quiet_night', label: 'Quiet night', type: 'neutral', stats: {}, weightSober: 4, weightImpaired: 1 },
  ] as ServerEffectDef[],

  // ── Server approaches (between completed rounds only). PROPOSED. ──
  approachFirstAfterRounds: 1,
  approachEveryRounds: 4,

  // ── Relationship (reuses the dealer system: tiers, tip caps, diminishing returns). ──
  chatGain: 1,
  rudeLoss: 4,
  apologyGain: 2,

  // ── Career consequences (pack: a pattern, never a single drink). PROPOSED. ──
  /** Serious incidents (being refused, or rude while impaired) in one season before the sponsor writes. */
  sponsorWarnAfter: 2,
  /** Sponsor relationship lost at the warning, and at each further incident that season. */
  sponsorRelLoss: 5,
} as const;
