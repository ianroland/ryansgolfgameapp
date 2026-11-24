/**
 * Casino table art, per casino (data-driven). Purely visual: geometry here places cards, chips
 * and betting zones over the art; every rule, limit and payout stays in src/casino/*.
 *
 * Card tables v2 (approved 2026-11-24): one scene per casino and game, cut from the supplied 3x3
 * sheet by tools/cut_card_tables_v2.py (crop only). The felt prints each game's betting spots, so
 * the game's zones sit over the printed ones as invisible hit areas (`printedZones`). Layouts are
 * fractions of the whole scene ([centre x, centre y, w, h]) and are per scene, because the three
 * casinos' tables differ slightly.
 *
 * Two printed details don't match the game and are handled here, not by changing rules:
 *  - Blackjack's felt says "Dealer hits soft 17"; the dealer stands on all 17s. `ruleCover`
 *    covers that printed line with the real rule, in the felt's colour.
 *  - Three Card Poker's felt has two seats; the game plays one hand, on the left seat.
 */
import type { LocationId } from './unlocks';

export type CardGame = 'blackjack' | 'baccarat' | 'three_card_poker';
export type FeltBox = [number, number, number, number];

export interface CardLayouts {
  blackjack: { dealer: FeltBox; rules: FeltBox; hands: FeltBox };
  baccarat: { playerCards: FeltBox; bankerCards: FeltBox; result: FeltBox; player: FeltBox; tie: FeltBox; banker: FeltBox };
  three_card_poker: { dealer: FeltBox; dealerRank: FeltBox; player: FeltBox; playerRank: FeltBox; result: FeltBox; ante: FeltBox; play: FeltBox; pairplus: FeltBox };
}

export interface CardScene<G extends CardGame = CardGame> {
  location: LocationId;
  game: G;
  url: string;
  /** Scene size in pixels. */
  size: [number, number];
  /** Rows of room above the table that are not shown (0: the whole scene shows). */
  viewTop: number;
  /** Box (scene pixels) the layout's fractions are measured in: here, the whole scene. */
  felt: [number, number, number, number];
  layout: CardLayouts[G];
  /** The felt prints the betting spots: zones are drawn as invisible hit areas over them. */
  printedZones: boolean;
  /** Blackjack only: the printed rule line to cover with the game's real rule, and the felt colour. */
  ruleCover?: { box: FeltBox; felt: string };
}

const files = import.meta.glob<string>('../assets/casino/tables/*/*_scene.webp', { eager: true, query: '?url', import: 'default' });
const sceneUrl = (loc: LocationId, game: CardGame) => files[`../assets/casino/tables/${loc}/${game}_scene.webp`];

const SIZES: Record<LocationId, number> = { desert_palms: 507, white_buffalo: 492, morongo_sky: 503 };
const HEIGHTS: Record<CardGame, number> = { blackjack: 322, three_card_poker: 300, baccarat: 315 };
const FELT_COLOUR: Record<LocationId, string> = { desert_palms: '#01461a', white_buffalo: '#013e43', morongo_sky: '#3c0155' };

const LAYOUTS: { [L in LocationId]: CardLayouts } = {
  desert_palms: {
    blackjack: { dealer: [0.5, 0.31, 0.5, 0.2], rules: [0.49, 0.515, 0.42, 0.08], hands: [0.5, 0.635, 0.8, 0.26] },
    three_card_poker: {
      dealer: [0.5, 0.225, 0.22, 0.18], dealerRank: [0.71, 0.225, 0.2, 0.07],
      player: [0.31, 0.355, 0.22, 0.18], playerRank: [0.125, 0.355, 0.2, 0.07], result: [0.71, 0.4, 0.3, 0.08],
      pairplus: [0.215, 0.53, 0.1, 0.15], ante: [0.31, 0.53, 0.085, 0.14], play: [0.425, 0.53, 0.095, 0.14],
    },
    baccarat: {
      playerCards: [0.22, 0.31, 0.24, 0.18], bankerCards: [0.78, 0.31, 0.24, 0.18], result: [0.5, 0.405, 0.4, 0.08],
      player: [0.295, 0.52, 0.27, 0.16], tie: [0.495, 0.52, 0.12, 0.19], banker: [0.73, 0.52, 0.3, 0.16],
    },
  },
  white_buffalo: {
    blackjack: { dealer: [0.5, 0.325, 0.5, 0.2], rules: [0.49, 0.535, 0.42, 0.08], hands: [0.5, 0.655, 0.8, 0.26] },
    three_card_poker: {
      dealer: [0.5, 0.235, 0.22, 0.18], dealerRank: [0.71, 0.235, 0.2, 0.07],
      player: [0.3, 0.375, 0.22, 0.18], playerRank: [0.115, 0.375, 0.2, 0.07], result: [0.71, 0.42, 0.3, 0.08],
      pairplus: [0.195, 0.55, 0.1, 0.15], ante: [0.3, 0.55, 0.085, 0.14], play: [0.41, 0.55, 0.095, 0.14],
    },
    baccarat: {
      playerCards: [0.21, 0.31, 0.24, 0.18], bankerCards: [0.79, 0.31, 0.24, 0.18], result: [0.5, 0.415, 0.4, 0.08],
      player: [0.28, 0.535, 0.28, 0.16], tie: [0.495, 0.535, 0.14, 0.19], banker: [0.72, 0.535, 0.3, 0.16],
    },
  },
  morongo_sky: {
    blackjack: { dealer: [0.5, 0.33, 0.5, 0.2], rules: [0.49, 0.525, 0.42, 0.08], hands: [0.5, 0.635, 0.8, 0.26] },
    three_card_poker: {
      dealer: [0.5, 0.225, 0.22, 0.18], dealerRank: [0.71, 0.225, 0.2, 0.07],
      player: [0.31, 0.355, 0.22, 0.18], playerRank: [0.125, 0.355, 0.2, 0.07], result: [0.71, 0.4, 0.3, 0.08],
      pairplus: [0.19, 0.53, 0.1, 0.15], ante: [0.31, 0.535, 0.085, 0.14], play: [0.41, 0.53, 0.095, 0.14],
    },
    baccarat: {
      playerCards: [0.21, 0.31, 0.24, 0.18], bankerCards: [0.79, 0.31, 0.24, 0.18], result: [0.5, 0.405, 0.4, 0.08],
      player: [0.275, 0.515, 0.3, 0.16], tie: [0.495, 0.505, 0.13, 0.19], banker: [0.715, 0.515, 0.3, 0.16],
    },
  },
};

const make = <G extends CardGame>(location: LocationId, game: G): CardScene<G> => {
  const size: [number, number] = [SIZES[location], HEIGHTS[game]];
  return {
    location, game, url: sceneUrl(location, game), size, viewTop: 0, felt: [0, 0, size[0], size[1]],
    layout: LAYOUTS[location][game], printedZones: true,
    ...(game === 'blackjack' ? { ruleCover: { box: LAYOUTS[location].blackjack.rules, felt: FELT_COLOUR[location] } } : {}),
  };
};

export const CARD_SCENES: { [L in LocationId]: { [G in CardGame]: CardScene<G> } } = {
  desert_palms: { blackjack: make('desert_palms', 'blackjack'), three_card_poker: make('desert_palms', 'three_card_poker'), baccarat: make('desert_palms', 'baccarat') },
  white_buffalo: { blackjack: make('white_buffalo', 'blackjack'), three_card_poker: make('white_buffalo', 'three_card_poker'), baccarat: make('white_buffalo', 'baccarat') },
  morongo_sky: { blackjack: make('morongo_sky', 'blackjack'), three_card_poker: make('morongo_sky', 'three_card_poker'), baccarat: make('morongo_sky', 'baccarat') },
};

export function cardSceneFor<G extends CardGame>(location: LocationId, game: G): CardScene<G> | null {
  const s = CARD_SCENES[location]?.[game] as CardScene<G> | undefined;
  return s?.url ? s : null;
}

/**
 * Craps scenes (CASINO_CRAPS_TABLES_V1): full 1672x941 scenes, shown whole (never cropped).
 * Files keep the pack's names (tables/<casino>/craps_full_scene), re-encoded as WebP at the same size.
 *
 * Craps step 1 (0.20.2) plays the line, Come / Don't Come, Place bets, odds and the Field, so
 * those painted areas are uncovered. Hardways, the one-roll bets and Big 6/8 are not offered yet
 * (step 2; some of their painted payouts are wrong), so `veils` still cover them. The number boxes
 * carry the point puck and the chips on each number (`box` is their size). Coordinates are scene pixels.
 */
export type Pt = [number, number];
export type Rect = [number, number, number, number];
export interface CrapsScene {
  location: LocationId;
  url: string;
  sourceAsset: string;
  size: [number, number];
  /** Centre of each point box. */
  point: Record<4 | 5 | 6 | 8 | 9 | 10, Pt>;
  /** Where each bet's chip sits. */
  spots: { pass: Pt; dontPass: Pt; odds: Pt; field: Pt; come: Pt; dontCome: Pt; dontOdds: Pt };
  /** Size of a number box (chips on a number sit at fixed fractions of it). */
  box: [number, number];
  dice: Pt;
  /** Painted areas for bets the game does not offer. */
  veils: Rect[];
}

const crapsFiles = import.meta.glob<string>('../assets/casino/tables/*/craps_full_scene.webp', { eager: true, query: '?url', import: 'default' });
const crapsUrl = (loc: LocationId) => crapsFiles[`../assets/casino/tables/${loc}/craps_full_scene.webp`];

export const CRAPS_SCENES: Record<LocationId, CrapsScene> = {
  desert_palms: {
    location: 'desert_palms', url: crapsUrl('desert_palms'), sourceAsset: 'tables/desert_palms/craps_full_scene.png', size: [1672, 941],
    point: { 4: [497, 335], 5: [632, 335], 6: [767, 335], 8: [902, 335], 9: [1037, 335], 10: [1174, 335] },
    spots: { pass: [215, 758], odds: [595, 758], dontPass: [400, 700], field: [430, 598], come: [440, 445], dontCome: [362, 322], dontOdds: [480, 700] },
    box: [130, 74],
    dice: [835, 565],
    veils: [[215, 490, 440, 82], [1010, 490, 440, 82], [650, 383, 375, 362]],
  },
  white_buffalo: {
    location: 'white_buffalo', url: crapsUrl('white_buffalo'), sourceAsset: 'tables/white_buffalo/craps_full_scene.png', size: [1672, 941],
    point: { 4: [470, 395], 5: [618, 395], 6: [762, 395], 8: [908, 395], 9: [1053, 395], 10: [1195, 395] },
    spots: { pass: [228, 732], odds: [600, 732], dontPass: [390, 672], field: [450, 560], come: [480, 500], dontCome: [325, 392], dontOdds: [470, 672] },
    box: [145, 80],
    dice: [835, 615],
    veils: [[666, 446, 342, 344]],
  },
  morongo_sky: {
    location: 'morongo_sky', url: crapsUrl('morongo_sky'), sourceAsset: 'tables/morongo_sky/craps_full_scene.png', size: [1672, 941],
    point: { 4: [373, 397], 5: [440, 397], 6: [510, 397], 8: [577, 397], 9: [645, 397], 10: [715, 397] },
    spots: { pass: [250, 702], odds: [572, 702], dontPass: [380, 648], field: [430, 552], come: [450, 485], dontCome: [285, 392], dontOdds: [460, 648] },
    box: [66, 86],
    dice: [835, 585],
    veils: [[626, 430, 419, 309]],
  },
};

export function crapsSceneFor(location: LocationId): CrapsScene | null {
  const s = CRAPS_SCENES[location];
  return s?.url ? s : null;
}

/**
 * Roulette scenes (supplied 2026-11-23): whole 1672x941 scenes, wheel on the left. The painted
 * betting grid is decorative and not accurate, so the game covers it with its own board
 * (`board`, scene pixels) built from the roulette rules (single zero, the bets the engine
 * supports). `wheel` is the painted ball track: centre and radii (it's drawn in perspective).
 * The painted wheel's pockets aren't readable, so the ball lands by angle and the result badge
 * announces the number.
 */
export interface RouletteScene {
  location: LocationId;
  url: string;
  size: [number, number];
  wheel: { x: number; y: number; rx: number; ry: number };
  board: Rect;
}

const rouletteFiles = import.meta.glob<string>('../assets/casino/tables/*/roulette_scene.webp', { eager: true, query: '?url', import: 'default' });
const rouletteUrl = (loc: LocationId) => rouletteFiles[`../assets/casino/tables/${loc}/roulette_scene.webp`];

export const ROULETTE_SCENES: Record<LocationId, RouletteScene> = {
  desert_palms: { location: 'desert_palms', url: rouletteUrl('desert_palms'), size: [1672, 941], wheel: { x: 298, y: 432, rx: 188, ry: 92 }, board: [604, 336, 1042, 278] },
  white_buffalo: { location: 'white_buffalo', url: rouletteUrl('white_buffalo'), size: [1672, 941], wheel: { x: 343, y: 435, rx: 186, ry: 90 }, board: [634, 344, 928, 258] },
  morongo_sky: { location: 'morongo_sky', url: rouletteUrl('morongo_sky'), size: [1672, 941], wheel: { x: 300, y: 462, rx: 190, ry: 70 }, board: [622, 394, 986, 226] },
};

export function rouletteSceneFor(location: LocationId): RouletteScene | null {
  const s = ROULETTE_SCENES[location];
  return s?.url ? s : null;
}
