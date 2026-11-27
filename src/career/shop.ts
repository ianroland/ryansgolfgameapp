/** Equipment and lifestyle items Ryan can buy. Homes live in catalog/properties.ts. */
import type { StatKey } from './types';

export type GearSlot = 'driver' | 'irons' | 'wedges' | 'putter';
export type LifestyleKind = 'car' | 'caddie' | 'coach' | 'accessory';

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
  { id: 'driver_starter', slot: 'driver', name: 'Hand-me-down Driver', price: 0, bonus: {}, minFame: 0, description: 'Baba\'s old driver. It works. Don\'t lose it.' },
  { id: 'driver_tour', slot: 'driver', name: 'Tour Driver', price: 900, bonus: { power: 3 }, minFame: 0, description: 'Modern head, fitted shaft. +3 Power.' },
  { id: 'driver_pro', slot: 'driver', name: 'Pro Launch Driver', price: 4200, bonus: { power: 6, accuracy: 1 }, minFame: 20, description: 'Low spin, big carry. +6 Power, +1 Accuracy.' },
  { id: 'driver_elite', slot: 'driver', name: 'Elite Custom Driver', price: 12000, bonus: { power: 9, accuracy: 2 }, minFame: 45, description: 'Built to your swing by the tour van. +9 Power, +2 Accuracy.' },
  { id: 'driver_bigstick', slot: 'driver', name: 'The Big Stick 460', price: 2200, bonus: { power: 4, accuracy: -1 }, minFame: 10, description: 'Head the size of a toaster. +4 Power, −1 Accuracy. Fun.' },
  { id: 'irons_starter', slot: 'irons', name: 'Game-Improvement Irons', price: 0, bonus: {}, minFame: 0, description: 'Forgiving, a little clunky.' },
  { id: 'irons_forged', slot: 'irons', name: 'Forged Irons', price: 1800, bonus: { accuracy: 3 }, minFame: 0, description: 'Soft feel, tighter dispersion. +3 Accuracy.' },
  { id: 'irons_blades', slot: 'irons', name: 'Tour Blades', price: 6500, bonus: { accuracy: 6 }, minFame: 25, description: 'Unforgiving and beautiful. +6 Accuracy.' },
  { id: 'irons_custom', slot: 'irons', name: 'Custom Tour Irons', price: 15000, bonus: { accuracy: 9 }, minFame: 50, description: 'Ground to your lie angles. +9 Accuracy.' },
  { id: 'irons_cavity', slot: 'irons', name: 'Players Cavity Irons', price: 3600, bonus: { accuracy: 4, shortGame: 1 }, minFame: 15, description: 'Blade looks, a little help on the toe. +4 Accuracy, +1 Short Game.' },
  { id: 'wedges_starter', slot: 'wedges', name: 'Worn Wedges', price: 0, bonus: {}, minFame: 0, description: 'The grooves are mostly gone.' },
  { id: 'wedges_spin', slot: 'wedges', name: 'Spin Wedges', price: 600, bonus: { shortGame: 3 }, minFame: 0, description: 'Fresh grooves. +3 Short Game.' },
  { id: 'wedges_tour', slot: 'wedges', name: 'Tour Grind Wedges', price: 2400, bonus: { shortGame: 6 }, minFame: 20, description: 'Grinds for every lie. +6 Short Game.' },
  { id: 'wedges_custom', slot: 'wedges', name: 'Hand-Ground Wedges', price: 7000, bonus: { shortGame: 9 }, minFame: 50, description: 'Ground by a guy in a garage who won\'t give his last name. +9 Short Game.' },
  { id: 'putter_starter', slot: 'putter', name: 'Blade Putter', price: 0, bonus: {}, minFame: 0, description: 'A classic, if you can hold your nerve.' },
  { id: 'putter_mallet', slot: 'putter', name: 'Mallet Putter', price: 500, bonus: { putting: 3 }, minFame: 0, description: 'Stable through the stroke. +3 Putting.' },
  { id: 'putter_milled', slot: 'putter', name: 'Milled Tour Putter', price: 3000, bonus: { putting: 6, nerve: 1 }, minFame: 25, description: 'Feels like butter. +6 Putting, +1 Nerve.' },
  { id: 'putter_broom', slot: 'putter', name: 'Broomstick Putter', price: 1400, bonus: { putting: 4, nerve: 2 }, minFame: 10, description: 'Anchors nothing, steadies everything. +4 Putting, +2 Nerve.' },
  { id: 'putter_custom', slot: 'putter', name: 'Custom Tour Putter', price: 9000, bonus: { putting: 9, nerve: 2 }, minFame: 50, description: 'Face milled to a thousandth. +9 Putting, +2 Nerve.' },
];

export const LIFESTYLE: LifestyleItem[] = [
  { id: 'car_hatch', kind: 'car', name: 'Used Hatchback', price: 5500, minFame: 0, description: 'Get yourself to events. −40% travel costs, +4 energy a week.', travelDiscount: 0.4, energyRegen: 4 },
  { id: 'car_suv', kind: 'car', name: 'Tour SUV', price: 38000, minFame: 40, description: 'Room for clubs and naps. −60% travel, +8 energy a week.', travelDiscount: 0.6, energyRegen: 8 },
  { id: 'caddie_local', kind: 'caddie', name: 'Hire Local Caddie (Marco)', price: 2500, minFame: 5, requiresPro: true, description: 'Reads greens, keeps you calm. +2 Putting, +2 Nerve in tournaments.', tournamentBonus: { putting: 2, nerve: 2 } },
  { id: 'caddie_tour', kind: 'caddie', name: 'Hire Tour Caddie (Bev)', price: 20000, minFame: 45, requiresPro: true, description: '20 years on tour. +4 Putting, +4 Nerve, +2 Accuracy in tournaments.', tournamentBonus: { putting: 4, nerve: 4, accuracy: 2 } },
  { id: 'coach_swing', kind: 'coach', name: 'Swing Coach Camp', price: 3000, minFame: 10, description: 'A week with a top teacher. Training gains +30% for good.', trainingBoost: 0.3 },
  { id: 'coach_mental', kind: 'coach', name: 'Sports Psychologist', price: 9000, minFame: 30, description: 'Pressure is a privilege. Training gains +20%, +3 Nerve in tournaments.', trainingBoost: 0.2, tournamentBonus: { nerve: 3 } },
  { id: 'acc_glove', kind: 'accessory', name: 'Tour Glove 3-Pack', price: 45, minFame: 0, description: 'Fresh leather every round. +1 Nerve in tournaments.', tournamentBonus: { nerve: 1 } },
  { id: 'acc_shoes', kind: 'accessory', name: 'Spiked Tour Shoes', price: 380, minFame: 0, description: 'Grip on every slope. +1 Power in tournaments.', tournamentBonus: { power: 1 } },
  { id: 'acc_sticks', kind: 'accessory', name: 'Alignment Sticks', price: 30, minFame: 0, description: 'Two orange sticks that make you honest. Training gains +5%.', trainingBoost: 0.05 },
  { id: 'acc_rangefinder', kind: 'accessory', name: 'Laser Rangefinder', price: 650, minFame: 5, description: 'Knows the number so you don\'t have to guess. +1 Accuracy in tournaments.', tournamentBonus: { accuracy: 1 } },
  { id: 'acc_greenbook', kind: 'accessory', name: 'Green Reading Book', price: 900, minFame: 15, description: 'Every slope, in tiny arrows. +2 Putting in tournaments.', tournamentBonus: { putting: 2 } },
  { id: 'acc_launch', kind: 'accessory', name: 'Launch Monitor', price: 4800, minFame: 25, description: 'Spin rates, smash factor, lies about nothing. Training gains +15%.', trainingBoost: 0.15 },
  { id: 'acc_massage', kind: 'accessory', name: 'Massage Gun', price: 300, minFame: 0, description: 'Sounds like a jackhammer, feels like a vacation. +3 energy a week.', energyRegen: 3 },
];

/** Snacks & energy: used on the spot, a few per week. Never alcoholic. */
export interface SnackItem {
  id: string;
  name: string;
  price: number;
  energy: number;
  description: string;
}
export const SNACKS_PER_WEEK = 3;
export const SNACKS: SnackItem[] = [
  { id: 'bobo_milky', name: 'BOBO MILKY', price: 15, energy: 10, description: 'Baba\'s brand. Tastes like childhood and a little like the carton. +10 Energy.' },
  { id: 'bobo_six', name: 'BOBO MILKY Six-Pack', price: 70, energy: 25, description: 'For emergencies. Every day is an emergency. +25 Energy.' },
  { id: 'turn_dog', name: 'Turn Hot Dog', price: 8, energy: 5, description: 'From the halfway hut. Do not ask what\'s in it. +5 Energy.' },
  { id: 'fairway_fizz', name: 'Fairway Fizz', price: 12, energy: 8, description: 'Electrolytes in a colour not found in nature. +8 Energy.' },
  { id: 'grind_bar', name: 'Grind Bar', price: 10, energy: 6, description: 'Protein bar. Chews like a yardage book. +6 Energy.' },
  { id: 'banana', name: 'Range Banana', price: 2, energy: 3, description: 'The tour pro\'s secret weapon. It\'s a banana. +3 Energy.' },
];
export const snackById = (id: string) => SNACKS.find((x) => x.id === id);
export const snackWeekKey = (season: number, week: number) => `snacks:${season}:${week}`;

export const STARTING_EQUIPMENT: Record<GearSlot, string> = {
  driver: 'driver_starter',
  irons: 'irons_starter',
  wedges: 'wedges_starter',
  putter: 'putter_starter',
};

export const gearById = (id: string) => GEAR.find((g) => g.id === id);
export const lifestyleById = (id: string) => LIFESTYLE.find((l) => l.id === id);
