/**
 * Career configuration. Every tour, event and organisation name lives here so
 * the game can be re-skinned (e.g. with fictional names) in one place.
 *
 * Note: "PGA Tour", "Korn Ferry Tour", "LPGA", "Epson Tour" and "Q-School" refer to real
 * organisations and are trademarks of their owners. Fine for a personal project; swap these
 * strings for fictional names before any public release.
 */

export const GAME_TITLE = "Ryan's Road to the LPGA";
export const PLAYER_ID = 'golfer_ryan';
export const PLAYER_NAME = 'Ryan';
export const START_AGE = 18;
export const START_MONEY = 2500;
/** Weeks in a playable season (roughly February → November). */
export const SEASON_WEEKS = 30;
export const WEEKLY_LIVING_COST = 250;
export const ACTIONS_PER_WEEK = 3;

/**
 * Tour ids are stable save keys. Until phase 3 (owner, 2026-11-24: "all PGA talk until phase 3 where
 * Ryan transitions") the ladder is the PGA path: 'qschool' is PGA Tour Q-School, 'epson' the Korn
 * Ferry Tour and 'lpga' the PGA Tour, all with men's fields. WOMENS_TOUR_NAMES keeps the LPGA
 * ladder's names for Kayla now and for phase 3 later.
 */
export type TourId = 'amateur' | 'mini' | 'qschool' | 'epson' | 'lpga';

/** The women's ladder (Kayla's tours; Ryan's from phase 3, which isn't built yet). */
export const WOMENS_TOUR_NAMES: Record<'qschool' | 'epson' | 'lpga', string> = {
  qschool: 'LPGA Q-School',
  epson: 'Epson Tour',
  lpga: 'LPGA Tour',
};
/** Kayla's tour name: she only plays the women's tours. */
export const rivalTourName = (t: TourId) => (t === 'qschool' || t === 'epson' || t === 'lpga' ? WOMENS_TOUR_NAMES[t] : TOURS[t].name);

export interface TourConfig {
  id: TourId;
  name: string;
  short: string;
  rounds: number;
  fieldSize: number;
  ratingMin: number;
  ratingMax: number;
  purse: number;
  entryFee: number;
  travelCost: number;
  /** Cut after this round to the top N (and ties). */
  cut?: { afterRound: number; top: number };
  /** Places paid (pros only). */
  paidPlaces: number;
  prizeMoney: boolean;
  fameBase: number;
  skillPointsBase: number;
}

export const TOURS: Record<TourId, TourConfig> = {
  amateur: {
    id: 'amateur', name: 'Amateur Circuit', short: 'AM', rounds: 2, fieldSize: 24, ratingMin: 16, ratingMax: 50,
    purse: 0, entryFee: 60, travelCost: 40, paidPlaces: 0, prizeMoney: false, fameBase: 2, skillPointsBase: 2,
  },
  mini: {
    id: 'mini', name: 'SoCal Pro Series', short: 'MINI', rounds: 3, fieldSize: 30, ratingMin: 34, ratingMax: 60,
    purse: 15000, entryFee: 450, travelCost: 150, paidPlaces: 12, prizeMoney: true, fameBase: 1.5, skillPointsBase: 2,
  },
  qschool: {
    id: 'qschool', name: 'PGA Tour Q-School', short: 'Q', rounds: 4, fieldSize: 40, ratingMin: 46, ratingMax: 70,
    purse: 0, entryFee: 0, travelCost: 500, paidPlaces: 0, prizeMoney: false, fameBase: 3, skillPointsBase: 2,
  },
  epson: {
    id: 'epson', name: 'Korn Ferry Tour', short: 'KFT', rounds: 3, fieldSize: 60, ratingMin: 50, ratingMax: 74,
    purse: 200000, entryFee: 0, travelCost: 600, cut: { afterRound: 2, top: 30 }, paidPlaces: 30, prizeMoney: true, fameBase: 3, skillPointsBase: 2,
  },
  lpga: {
    id: 'lpga', name: 'PGA Tour', short: 'PGA', rounds: 4, fieldSize: 72, ratingMin: 62, ratingMax: 90,
    purse: 2000000, entryFee: 0, travelCost: 1500, cut: { afterRound: 2, top: 36 }, paidPlaces: 36, prizeMoney: true, fameBase: 6, skillPointsBase: 3,
  },
};

export type QStage = 1 | 2 | 3;
export const QSCHOOL: Record<QStage, { name: string; week: number; entryFee: number; ratingShift: number; advanceFraction: number }> = {
  1: { name: 'Q-School · First Stage', week: 20, entryFee: 2000, ratingShift: -4, advanceFraction: 0.35 },
  2: { name: 'Q-School · Second Stage', week: 24, entryFee: 0, ratingShift: 0, advanceFraction: 0.3 },
  3: { name: 'Q-School · Final Stage', week: 28, entryFee: 0, ratingShift: 1, advanceFraction: 0 },
};
/** Final Stage: top 20 earn a PGA Tour card; 21–45 earn Korn Ferry Tour status. */
export const QSERIES_LPGA_CARDS = 20;
export const QSERIES_EPSON_CARDS = 45;
/** Korn Ferry Tour money-list graduates to the PGA Tour. */
export const EPSON_GRADUATES = 15;
/** PGA Tour money-list rank needed to keep the card. */
export const LPGA_KEEP_CARD = 100;

interface EventTemplate {
  week: number;
  name: string;
  /** Designated championship (amateur) or major (top tour). */
  special?: boolean;
}

export const SCHEDULES: Record<Exclude<TourId, 'qschool'>, EventTemplate[]> = {
  amateur: [
    { week: 2, name: 'Dry Creek City Amateur' },
    { week: 5, name: 'Inland Empire Amateur' },
    { week: 8, name: 'Desert Springs Amateur' },
    { week: 11, name: 'Coastal Amateur Classic' },
    { week: 14, name: 'SoCal Amateur' },
    { week: 18, name: 'Harbor Lights Invitational' },
    { week: 22, name: 'State Amateur Championship', special: true },
    { week: 26, name: 'Fall Amateur Classic' },
  ],
  mini: [
    { week: 3, name: 'Pro Series · Riverside' },
    { week: 6, name: 'Pro Series · Palm Desert' },
    { week: 9, name: 'Pro Series · Temecula' },
    { week: 12, name: 'Pro Series · Ojai' },
    { week: 15, name: 'Pro Series · Santa Clarita' },
    { week: 17, name: 'Pro Series · Long Beach' },
    { week: 19, name: 'Pro Series · Bakersfield' },
    { week: 22, name: 'Pro Series · San Diego' },
    { week: 26, name: 'Pro Series · Ventura' },
    { week: 29, name: 'Pro Series Finale' },
  ],
  epson: [
    'Desert Bloom Classic', 'Gulf Coast Championship', 'Magnolia Open', 'Lone Star Classic', 'Prairie Winds Invitational',
    'Lakeshore Classic', 'Mountain Pines Open', 'Heartland Championship', 'Carolina Coast Classic', 'River Valley Open',
    'Bluegrass Invitational', 'Peach State Classic', 'Twin Lakes Championship', 'Season Finale Championship',
  ].map((name, i) => ({ week: 2 + i * 2, name, special: i === 13 })),
  lpga: [
    // Week 6, the season's first major: "The Desert Rose Invitational" (Pink Jacket), approved for Career Legacy V1
    // (author, 2026-11-22). Previously the placeholder "The Desert Major"; stored results keep the name they were played under.
    'Sunshine Coast Classic', 'Desert Palms Open', 'The Desert Rose Invitational', 'Pacific Coast Championship', 'Bay City Classic',
    'Championship of the Americas', 'Great Lakes Open', 'Lakeside Classic', 'National Open Championship',
    'Heartland Invitational', 'Highland Classic', 'Alpine Championship', 'Asia Swing Classic', 'Tour Championship',
  ].map((name, i) => ({ week: 2 + i * 2, name, special: [2, 5, 8, 11].includes(i) })),
};

export const FAME_LEVELS: { min: number; name: string }[] = [
  { min: 0, name: 'Unknown' },
  { min: 10, name: 'Local Talent' },
  { min: 25, name: 'Rising Star' },
  { min: 45, name: 'Tour Pro' },
  { min: 65, name: 'Star' },
  { min: 85, name: 'Legend' },
];

export function fameLevel(fame: number) {
  return [...FAME_LEVELS].reverse().find((l) => fame >= l.min)!;
}

/** Game calendar: season 1 starts in February 2027. */
export function gameDate(season: number, week: number): string {
  const d = new Date(Date.UTC(2027 + season - 1, 1, 1, 18, 0, 0));
  d.setUTCDate(d.getUTCDate() + (week - 1) * 7);
  return d.toISOString();
}
