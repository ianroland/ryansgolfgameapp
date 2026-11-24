/**
 * Spin to Win wheel geometry (presentation only). The wheel is drawn with slot 0 starting at
 * 12 o'clock and slots running clockwise; the pointer is fixed at 12 o'clock. A CSS rotation of
 * `deg` (clockwise) puts the wheel angle (-deg) under the pointer. The result is always decided
 * by the rules first; this only works out where to stop so the pointer shows that result.
 */
import { SLOT_COUNT } from '../../casino/wheel';

export const SLOT_DEG = 360 / SLOT_COUNT;
const mod = (a: number, m: number) => ((a % m) + m) % m;

/** The slot under the pointer for a wheel rotated `deg` clockwise. */
export const slotAtPointer = (deg: number) => Math.floor(mod(-deg, 360) / SLOT_DEG);

/**
 * Where to stop so `slot` is under the pointer: `from` is the current rotation, `turns` the full
 * turns to spin first, `jitter` (-1..1) moves the stop within the slot, never past its edges.
 */
export function rotationFor(slot: number, from = 0, turns = 0, jitter = 0): number {
  const within = Math.max(-1, Math.min(1, jitter)) * 0.38 * SLOT_DEG;
  const target = mod(-(slot + 0.5) * SLOT_DEG + within, 360);
  return from + turns * 360 + mod(target - mod(from, 360), 360);
}

/** Point on the wheel (SVG units, centre 0,0) at `deg` clockwise from 12 o'clock and radius `r`. */
export const polar = (deg: number, r: number): [number, number] => {
  const a = (deg * Math.PI) / 180;
  return [r * Math.sin(a), -r * Math.cos(a)];
};
