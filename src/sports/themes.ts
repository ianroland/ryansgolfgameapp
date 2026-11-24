/**
 * Sportsbook lounge themes, one per casino: colour tokens and art slots. The same components
 * render every lounge; only these tokens and the art change. Art slots that aren't supplied yet
 * are null, and the UI draws a labelled placeholder (src/assets/sportsbook/manifest.json lists
 * what's missing).
 */
import type { LocationId } from '../expansion/unlocks';

export interface LoungeTheme {
  location: LocationId;
  name: string;
  /** Colour tokens (CSS custom properties). */
  tokens: { bg1: string; bg2: string; neon: string; trim: string; crt: string; crtText: string; accent: string; panel: string };
  /** Art slots: background 1672x941, odds board frame (9-slice ~1200x600). Null = not supplied yet. */
  art: { background: string | null; boardFrame: string | null; clerk: string | null };
  /** Unlocked by the casino's existing rule (no new thresholds). */
  playable: boolean;
}

const art = import.meta.glob<string>('../assets/sportsbook/*/*.png', { eager: true, query: '?url', import: 'default' });
const slot = (loc: LocationId, file: string) => art[`../assets/sportsbook/${loc}/${file}`] ?? null;

export const LOUNGES: Record<LocationId, LoungeTheme> = {
  desert_palms: {
    location: 'desert_palms',
    name: 'Palms Sports Bar',
    tokens: { bg1: '#2a0f2e', bg2: '#0e3b2a', neon: '#ff4fa8', trim: '#d8a33a', crt: '#06140c', crtText: '#7dffb0', accent: '#2fbf71', panel: '#1c0c22' },
    art: { background: slot('desert_palms', 'bg_lounge.png'), boardFrame: slot('desert_palms', 'odds_board_frame.png'), clerk: null },
    playable: true,
  },
  white_buffalo: {
    location: 'white_buffalo',
    name: 'Firelight Lounge',
    tokens: { bg1: '#2b1408', bg2: '#0d3b3e', neon: '#ff9a3c', trim: '#c9793a', crt: '#0a1414', crtText: '#7ff0e6', accent: '#3fb6b0', panel: '#1f120a' },
    art: { background: slot('white_buffalo', 'bg_lounge.png'), boardFrame: slot('white_buffalo', 'odds_board_frame.png'), clerk: null },
    playable: false,
  },
  morongo_sky: {
    location: 'morongo_sky',
    name: 'Skybox',
    tokens: { bg1: '#1a0633', bg2: '#06061a', neon: '#b25cff', trim: '#e4c35a', crt: '#08051a', crtText: '#d9b8ff', accent: '#e4e6f0', panel: '#140828' },
    art: { background: slot('morongo_sky', 'bg_lounge.png'), boardFrame: slot('morongo_sky', 'odds_board_frame.png'), clerk: null },
    playable: false,
  },
};

/**
 * Where the live UI sits on the lounge art, in the art's native 1672x941 pixels. Measured from
 * the three approved backgrounds (they share one layout, within a few pixels): four blank CRT
 * monitors (league screens), the blank board under them (menu), the right-hand pillar (clerk),
 * and the lower band over the booths and counter (betting content and bet slip).
 */
export type NativeRect = [x: number, y: number, w: number, h: number];
export const LOUNGE_SIZE = [1672, 941] as const;
export interface LoungeLayout {
  screens: [NativeRect, NativeRect, NativeRect, NativeRect];
  board: NativeRect;
  clerk: NativeRect;
  content: NativeRect;
  slip: NativeRect;
}
export const LOUNGE_LAYOUT: LoungeLayout = {
  screens: [
    [744, 271, 126, 104],
    [916, 257, 131, 106],
    [1091, 244, 147, 114],
    [1287, 233, 160, 118],
  ],
  board: [737, 414, 719, 112],
  clerk: [1478, 206, 178, 322],
  content: [16, 546, 1150, 384],
  slip: [1180, 546, 476, 384],
};

/** CSS for a native rect as percentages of the lounge. */
export const rectPct = ([x, y, w, h]: NativeRect) => ({
  left: `${(x / LOUNGE_SIZE[0]) * 100}%`,
  top: `${(y / LOUNGE_SIZE[1]) * 100}%`,
  width: `${(w / LOUNGE_SIZE[0]) * 100}%`,
  height: `${(h / LOUNGE_SIZE[1]) * 100}%`,
});
