/** Career Legacy celebration bus: GameContext routes full-screen legacy notifications here. */
import type { LegacyMoment } from '../../services/notifier';

type Listener = (m: LegacyMoment) => void;
const listeners = new Set<Listener>();

export function celebrateLegacy(m: LegacyMoment) {
  for (const l of listeners) l(m);
}

export function onLegacyCelebration(fn: Listener): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
