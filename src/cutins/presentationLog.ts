/**
 * Presentation history (layer H): what actually happened on this device.
 * Infrastructure only in CI-1: nothing in the game calls it.
 *
 * In memory, plus a best-effort device log of the last 200 presented
 * moment ids (the `celebrate.ts` precedent). It is not part of the save,
 * never synced, and never changes eligibility or the plan. It can only stop
 * a presentation.
 */
import { LOG_KEY, LOG_LIMIT } from './constants';

export type PresentationOutcome = 'shown' | 'watched' | 'skipped' | 'interrupted';

const memory = new Set<string>();
const history: { momentId: string; how: PresentationOutcome }[] = [];

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function load() {
  try {
    const raw = storage()?.getItem(LOG_KEY);
    if (raw) for (const id of JSON.parse(raw) as unknown[]) if (typeof id === 'string') memory.add(id);
  } catch {
    /* in-memory only */
  }
}

function save() {
  try {
    storage()?.setItem(LOG_KEY, JSON.stringify([...memory].slice(-LOG_LIMIT)));
  } catch {
    /* in-memory only */
  }
}

/** Record an outcome. The first call for an id (at presentation start) is what blocks a repeat. */
export function markPresented(momentId: string, how: PresentationOutcome): void {
  load();
  history.push({ momentId, how });
  if (!memory.has(momentId)) {
    memory.add(momentId);
    while (memory.size > LOG_LIMIT) memory.delete(memory.values().next().value as string);
    save();
  }
}

export function wasPresented(momentId: string): boolean {
  load();
  return memory.has(momentId);
}

export function presentationHistory(): readonly { momentId: string; how: PresentationOutcome }[] {
  return history;
}

/** Test aid: forget this session's memory (the device log is left as it is). */
export function resetPresentationMemory(): void {
  memory.clear();
  history.length = 0;
}
