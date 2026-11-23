/**
 * Desert Palms casino art (made by tools/cut_casino.py from art/source_sheets/).
 * Purely visual: nothing here touches game rules, odds or payouts.
 */
import manifest from '../../assets/casino/casino.json';

export interface CasinoSprite {
  file: string;
  w: number;
  h: number;
  ax: number;
  ay: number;
  url: string;
  /** Slot cabinet only: transparent reel windows and front buttons, [x, y, w, h] in image pixels. */
  windows?: [number, number, number, number][];
  buttons?: [number, number, number, number][];
  /** Lever only: where it sits on the cabinet image. */
  at?: [number, number];
}

const urls = import.meta.glob<string>('../../assets/casino/*.png', { eager: true, query: '?url', import: 'default' });
const M = manifest as unknown as Record<string, Omit<CasinoSprite, 'url'>>;

export function casinoArt(name: string): CasinoSprite {
  const m = M[name];
  if (!m) throw new Error(`Missing casino art: ${name}`);
  return { ...m, url: urls[`../../assets/casino/${m.file}`] };
}

/** A box on an image as CSS percentages of that image. */
export function boxStyle(img: { w: number; h: number }, [x, y, w, h]: [number, number, number, number]) {
  return { left: `${(x / img.w) * 100}%`, top: `${(y / img.h) * 100}%`, width: `${(w / img.w) * 100}%`, height: `${(h / img.h) * 100}%` };
}

/** Chip token for an amount: the biggest drawn chip that fits. */
export function chipFor(amount: number): CasinoSprite {
  const d = [500, 100, 25, 5].find((v) => amount >= v) ?? 5;
  return casinoArt(`chip_${d}`);
}
