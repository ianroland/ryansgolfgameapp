/**
 * Character atlases: one 256-colour PNG + JSON manifest per character, made by
 * tools/pack_characters.py from the source sheets in art/source_sheets/.
 * Manifests are small and bundled; the images load on first use.
 *
 * Frame keys
 *   Ryan:  `<hair>.portrait.<expression>`, `<hair>.<pose>.<n>`
 *   Cast:  `portrait.big`, `portrait.<expression>`, `<pose>.<n>`
 */
import { RYAN_ID } from './cast';
import { resolveLook } from './appearance';
import type { Appearance, Expression, Pose } from './types';

export interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Anchor: feet for bodies, centre for portraits. */
  ax: number;
  ay: number;
}
export interface SheetManifest {
  image: string;
  w: number;
  h: number;
  frames: Record<string, Frame>;
}

const manifests = import.meta.glob<SheetManifest>('../assets/characters/*.json', { eager: true, import: 'default' });
const images = import.meta.glob<string>('../assets/characters/*.png', { query: '?url', import: 'default' });

const idOf = (path: string) => path.replace(/^.*\/([^/]+)\.(json|png)$/, '$1');
const MANIFESTS: Record<string, SheetManifest> = Object.fromEntries(Object.entries(manifests).map(([p, m]) => [idOf(p), m]));
const IMAGES: Record<string, () => Promise<string>> = Object.fromEntries(Object.entries(images).map(([p, load]) => [idOf(p), load]));
const urlCache = new Map<string, Promise<string>>();

export function sheetManifest(sheet: string): SheetManifest | undefined {
  return MANIFESTS[sheet];
}

export function sheetIds(): string[] {
  return Object.keys(MANIFESTS);
}

/** Loads (once) and returns the URL of a character's atlas image. */
export function sheetUrl(sheet: string): Promise<string> {
  let p = urlCache.get(sheet);
  if (!p) {
    const load = IMAGES[sheet];
    p = load ? load() : Promise.reject(new Error(`No atlas image for ${sheet}`));
    urlCache.set(sheet, p);
  }
  return p;
}

/** Frame key for a portrait, falling back to neutral if an expression isn't drawn. */
export function portraitKey(who: string, expr: Expression, look?: Appearance): string {
  const m = MANIFESTS[who === RYAN_ID ? 'ryan' : who];
  const prefix = who === RYAN_ID ? `${resolveLook(look ?? { hair: 'curly', hat: true }).sheet}.` : '';
  const key = `${prefix}portrait.${expr}`;
  return m?.frames[key] ? key : `${prefix}portrait.neutral`;
}

/** Frame keys for a pose (in order), falling back to idle when a pose isn't drawn for this character or look. */
export function poseFrames(who: string, pose: Pose, look?: Appearance): string[] {
  const m = MANIFESTS[who === RYAN_ID ? 'ryan' : who];
  if (!m) return [];
  const prefix = who === RYAN_ID ? `${resolveLook(look ?? { hair: 'curly', hat: true }).sheet}.` : '';
  const keys = (p: string) => Object.keys(m.frames).filter((k) => k.startsWith(`${prefix}${p}.`) && /\.\d+$/.test(k)).sort((a, b) => Number(a.split('.').pop()) - Number(b.split('.').pop()));
  const got = keys(pose);
  return got.length ? got : keys('idle');
}

export const sheetFor = (who: string) => (who === RYAN_ID ? 'ryan' : who);
