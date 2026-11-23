/**
 * Golfer sprite animation: maps the swing state to frames of Ryan's sprite atlas.
 *
 * Ryan's on-course art is the author-approved swing sequence for each phase
 * (art/source_sheets/legacy/Ryan-Phase-{1,2,3}-Swing-Sequence: 10 frames each,
 * cut by the Career Legacy art pass). Phase keys are the stable appearance ids:
 * curly = phase 1, bald = phase 2, wig = phase 3. The frames carry no drawn
 * ball, so the real ball always shows. The approved set has no putting, waggle
 * or reaction frames yet: those states reuse the closest approved swing frames
 * (see golfer_<phase>.json) until dedicated frames are approved.
 */
import curlyUrl from '../assets/golfer/golfer_curly.png';
import curlyMeta from '../assets/golfer/golfer_curly.json';
import baldUrl from '../assets/golfer/golfer_bald.png';
import baldMeta from '../assets/golfer/golfer_bald.json';
import wigUrl from '../assets/golfer/golfer_wig.png';
import wigMeta from '../assets/golfer/golfer_wig.json';
import curlyPortrait from '../assets/golfer/portrait_curly.png';
import curlyCutin from '../assets/golfer/cutin_curly.png';
import baldCutin from '../assets/golfer/cutin_bald.png';
import wigCutin from '../assets/golfer/cutin_wig.png';
import baldPortrait from '../assets/golfer/portrait_bald.png';
import wigPortrait from '../assets/golfer/portrait_wig.png';

export interface AtlasFrame {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Feet anchor within the frame (px). */
  ax: number;
  ay: number;
}

export type AnimName = 'idle' | 'walk' | 'win' | 'swing' | 'putt' | 'pickup' | 'misc';
export interface GolferAtlas {
  frames: Record<AnimName, AtlasFrame[]>;
  standHeightPx: number;
  ballDx: { idle: number; swing: number; putt: number };
  /** True when address frames include a drawn ball (the approved art never does). */
  drawnBall: boolean;
}

/** Ryan's phase look: the stable appearance ids (curly = phase 1, bald = phase 2, wig = phase 3). */
export type GolferLook = 'curly' | 'bald' | 'wig';
export const GOLFER_LOOKS: Record<GolferLook, { atlas: GolferAtlas; url: string; portrait: string; cutin: string }> = {
  curly: { atlas: curlyMeta as unknown as GolferAtlas, url: curlyUrl, portrait: curlyPortrait, cutin: curlyCutin },
  bald: { atlas: baldMeta as unknown as GolferAtlas, url: baldUrl, portrait: baldPortrait, cutin: baldCutin },
  wig: { atlas: wigMeta as unknown as GolferAtlas, url: wigUrl, portrait: wigPortrait, cutin: wigCutin },
};

/**
 * Big reaction cut-ins (approved per-phase sheets, 6 portraits of 256 x 256 in a row), shown for
 * standout moments in the style of the arcade golf games: 0 roar with fists, 1 both arms up,
 * 2 confident fist, 3 fist to chest, 4 hands on hips looking up, 5 shading the eyes.
 */
export type CutinPose = 0 | 1 | 2 | 3 | 4 | 5;
export const CUTIN_SIZE = 256;

/** Which big cut-in (if any) a finished shot earns. Presentation only. */
export function cutinFor(o: { holed: boolean; putt: boolean; strokes: number; par: number; teeShotOnGreen: boolean }): CutinPose | null {
  const toPar = o.strokes - o.par;
  if (o.holed) {
    if (o.strokes === 1 || toPar <= -3) return 1; // ace or albatross: both arms up
    if (toPar === -2) return 0; // eagle: the roar
    if (toPar === -1) return 2; // birdie: confident fist
    if (toPar === 0) return o.putt ? 3 : 4; // par: fist to chest on a putt, hands on hips for a chip-in
    return null;
  }
  if (o.teeShotOnGreen) return 5; // par 3 tee shot finding the green: watching it land
  return null;
}
export const DEFAULT_LOOK: GolferLook = 'wig';
/** Every phase atlas is scaled to the same standing height, so on-course size is unchanged. */
export const ATLAS = GOLFER_LOOKS[DEFAULT_LOOK].atlas;

/** On-course height of the golfer. */
export const STAND_HEIGHT_YDS = 1.8;
export const YDS_PER_PX = STAND_HEIGHT_YDS / ATLAS.standHeightPx;

export const frameKey = (anim: AnimName, i: number) => `${anim}_${i}`;

/** Full swing: address 0, takeaway 1–2, halfway 3, top 4, transition 5, downswing 6, impact 7, follow-through 8–9, finish 10–11. */
const BACKSWING = [0, 1, 2, 3, 4];
const DOWNSWING = [5, 6, 7];
const FOLLOW = [8, 9, 10, 11];
export const SWING_DURATION = 0.3;
export const PUTT_DURATION = 0.22;

export type SwingState =
  | { kind: 'address'; putt: boolean; idle: number }
  | { kind: 'backswing'; putt: boolean; amount: number }
  | { kind: 'downswing'; putt: boolean; amount: number; t: number }
  | { kind: 'finish'; putt: boolean; amount: number; since: number };

export type Reaction = 'celebrate' | 'pump' | 'pumpLow' | 'hips' | 'shade' | 'frustrated';

export interface FrameChoice {
  anim: AnimName;
  index: number;
  /** Which address offset positions the sprite against the real ball. */
  ballRef: 'idle' | 'swing' | 'putt';
  /** True while the drawn ball is part of the frame. */
  showsBall: boolean;
}

export function frameFor(state: SwingState): FrameChoice {
  if (state.putt) {
    switch (state.kind) {
      case 'address':
        return { anim: 'putt', index: 1, ballRef: 'putt', showsBall: true };
      case 'backswing':
        return { anim: 'putt', index: state.amount > 0.35 ? 2 : 1, ballRef: 'putt', showsBall: true };
      case 'downswing':
        return { anim: 'putt', index: 3, ballRef: 'putt', showsBall: true };
      case 'finish':
        return { anim: 'putt', index: state.since < 0.25 ? 4 : 5, ballRef: 'putt', showsBall: false };
    }
  }
  switch (state.kind) {
    case 'address':
      // Address waggle: the approved 12-frame waggle, looping every two seconds.
      return { anim: 'idle', index: Math.floor(state.idle * 6) % 12, ballRef: 'idle', showsBall: true };
    case 'backswing':
      return { anim: 'swing', index: BACKSWING[Math.min(BACKSWING.length - 1, Math.floor(state.amount * BACKSWING.length))], ballRef: 'swing', showsBall: true };
    case 'downswing':
      return { anim: 'swing', index: DOWNSWING[Math.min(DOWNSWING.length - 1, Math.floor(state.t * DOWNSWING.length))], ballRef: 'swing', showsBall: true };
    case 'finish': {
      const i = Math.min(FOLLOW.length - 1, Math.floor(state.since / 0.09));
      return { anim: 'swing', index: FOLLOW[i], ballRef: 'swing', showsBall: false };
    }
  }
}

/**
 * Reaction animation for the result cut-in (approved reactions sheet, per phase).
 * win:  0-3 celebrate (arms raise), 4-6 fist pump high, 7-9 fist pump low
 * misc: 0-3 hands on hips, 4-7 follow ball (shade eyes), 8-11 frustrated
 * Each plays through once and holds its last frame (celebrate keeps pumping its arms).
 */
export function reactionFrame(r: Reaction, t: number): { anim: AnimName; index: number } {
  const play = (start: number, count: number, fps: number) => start + Math.min(count - 1, Math.floor(t * fps));
  switch (r) {
    case 'celebrate':
      return { anim: 'win', index: t < 0.6 ? play(0, 4, 6.5) : [2, 3][Math.floor(t * 4) % 2] };
    case 'pump':
      return { anim: 'win', index: play(4, 3, 8) };
    case 'pumpLow':
      return { anim: 'win', index: play(7, 3, 8) };
    case 'hips':
      return { anim: 'misc', index: play(0, 4, 6) };
    case 'shade':
      return { anim: 'misc', index: play(4, 4, 6) };
    case 'frustrated':
      return { anim: 'misc', index: play(8, 4, 6) };
  }
}
