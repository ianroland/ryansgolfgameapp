/** Equipment and lifestyle items Ryan can buy. Homes live in catalog/properties.ts. */
import type { StatKey } from './types';

export type GearSlot = 'driver' | 'irons' | 'wedges' | 'putter';
export type LifestyleKind = 'car' | 'caddie' | 'coach';

export interface GearItem {
  id: string;
  slot: GearSlot;
  name: string;
  price: number;
  bonus: Partial<Record<StatKey, number>>;
  minFame: number;
  description: string;
}

export interface LifestyleItem {
  id: string;
  kind: LifestyleKind;
  name: string;
  price: number;
  minFame: number;
  requiresPro?: boolean;
  description: string;
  /** Fraction off tournament travel costs. */
  travelDiscount?: number;
  /** Extra energy recovered each week. */
  energyRegen?: number;
  /** Bonus to stats during tournaments only. */
  tournamentBonus?: Partial<Record<StatKey, number>>;
  /** Multiplier on training gains. */
  trainingBoost?: number;
}

export const GEAR: GearItem[] = [
  { id: 'driver_starter', slot: 'driver', name: 'Hand-me-down Driver', price: 0, bonus: {}, minFame: 0, description: 'Mom found it at a garage sale. It works.' },
  { id: 'driver_tour', slot: 'driver', name: 'Tour Driver', price: 900, bonus: { power: 3 }, minFame: 0, description: 'Modern head, fitted shaft. +3 Power.' },
  { id: 'driver_pro', slot: 'driver', name: 'Pro Launch Driver', price: 4200, bonus: { power: 6, accuracy: 1 }, minFame: 20, description: 'Low spin, big carry. +6 Power, +1 Accuracy.' },
  { id: 'driver_elite', slot: 'driver', name: 'Elite Custom Driver', price: 12000, bonus: { power: 9, accuracy: 2 }, minFame: 45, description: 'Built to your swing by the tour van. +9 Power, +2 Accuracy.' },
  { id: 'irons_starter', slot: 'irons', name: 'Game-Improvement Irons', price: 0, bonus: {}, minFame: 0, description: 'Forgiving, a little clunky.' },
  { id: 'irons_forged', slot: 'irons', name: 'Forged Irons', price: 1800, bonus: { accuracy: 3 }, minFame: 0, description: 'Soft feel, tighter dispersion. +3 Accuracy.' },
  { id: 'irons_blades', slot: 'irons', name: 'Tour Blades', price: 6500, bonus: { accuracy: 6 }, minFame: 25, description: 'Unforgiving and beautiful. +6 Accuracy.' },
  { id: 'irons_custom', slot: 'irons', name: 'Custom Tour Irons', price: 15000, bonus: { accuracy: 9 }, minFame: 50, description: 'Ground to your lie angles. +9 Accuracy.' },
  { id: 'wedges_starter', slot: 'wedges', name: 'Worn Wedges', price: 0, bonus: {}, minFame: 0, description: 'The grooves are mostly gone.' },
  { id: 'wedges_spin', slot: 'wedges', name: 'Spin Wedges', price: 600, bonus: { shortGame: 3 }, minFame: 0, description: 'Fresh grooves. +3 Short Game.' },
  { id: 'wedges_tour', slot: 'wedges', name: 'Tour Grind Wedges', price: 2400, bonus: { shortGame: 6 }, minFame: 20, description: 'Grinds for every lie. +6 Short Game.' },
  { id: 'putter_starter', slot: 'putter', name: 'Blade Putter', price: 0, bonus: {}, minFame: 0, description: 'A classic, if you can hold your nerve.' },
  { id: 'putter_mallet', slot: 'putter', name: 'Mallet Putter', price: 500, bonus: { putting: 3 }, minFame: 0, description: 'Stable through the stroke. +3 Putting.' },
  { id: 'putter_milled', slot: 'putter', name: 'Milled Tour Putter', price: 3000, bonus: { putting: 6, nerve: 1 }, minFame: 25, description: 'Feels like butter. +6 Putting, +1 Nerve.' },
];

export const LIFESTYLE: LifestyleItem[] = [
  { id: 'car_hatch', kind: 'car', name: 'Used Hatchback', price: 5500, minFame: 0, description: 'Get yourself to events. −40% travel costs, +4 energy a week.', travelDiscount: 0.4, energyRegen: 4 },
  { id: 'car_suv', kind: 'car', name: 'Tour SUV', price: 38000, minFame: 40, description: 'Room for clubs and naps. −60% travel, +8 energy a week.', travelDiscount: 0.6, energyRegen: 8 },
  { id: 'caddie_local', kind: 'caddie', name: 'Hire Local Caddie (Marco)', price: 2500, minFame: 5, requiresPro: true, description: 'Reads greens, keeps you calm. +2 Putting, +2 Nerve in tournaments.', tournamentBonus: { putting: 2, nerve: 2 } },
  { id: 'caddie_tour', kind: 'caddie', name: 'Hire Tour Caddie (Bev)', price: 20000, minFame: 45, requiresPro: true, description: '20 years on tour. +4 Putting, +4 Nerve, +2 Accuracy in tournaments.', tournamentBonus: { putting: 4, nerve: 4, accuracy: 2 } },
  { id: 'coach_swing', kind: 'coach', name: 'Swing Coach Camp', price: 3000, minFame: 10, description: 'A week with a top teacher. Training gains +30% for good.', trainingBoost: 0.3 },
  { id: 'coach_mental', kind: 'coach', name: 'Sports Psychologist', price: 9000, minFame: 30, description: 'Pressure is a privilege. Training gains +20%, +3 Nerve in tournaments.', trainingBoost: 0.2, tournamentBonus: { nerve: 3 } },
];

export const STARTING_EQUIPMENT: Record<GearSlot, string> = {
  driver: 'driver_starter',
  irons: 'irons_starter',
  wedges: 'wedges_starter',
  putter: 'putter_starter',
};

export const gearById = (id: string) => GEAR.find((g) => g.id === id);
export const lifestyleById = (id: string) => LIFESTYLE.find((l) => l.id === id);
