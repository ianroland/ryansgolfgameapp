/**
 * Albatross celebrations. A celebration is shown once per albatross: right
 * away for a hole Ryan played herself, or when the tournament result is
 * recorded for one that was simulated. Seen IDs are remembered so the same
 * albatross never celebrates twice (best effort: storage may be unavailable).
 */
import type { AlbatrossMoment } from '../../records/albatross';

type Listener = (m: AlbatrossMoment) => void;
const listeners = new Set<Listener>();
const KEY = 'ryans-road.celebrated';
const memory = new Set<string>();

function load(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) for (const id of JSON.parse(raw) as string[]) memory.add(id);
  } catch {
    /* in-memory only */
  }
  return memory;
}

function remember(id: string) {
  memory.add(id);
  try {
    localStorage.setItem(KEY, JSON.stringify([...memory].slice(-200)));
  } catch {
    /* in-memory only */
  }
}

export function celebrateAlbatross(m: AlbatrossMoment) {
  if (load().has(m.id)) return;
  remember(m.id);
  for (const l of listeners) l(m);
}

export function onCelebrate(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
