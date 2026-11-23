/**
 * One blocking screen at a time.
 *
 * Every modal that must not be covered (story events and their result
 * screens, encounters, the tournament entry dialog, trophy details, the look
 * editor…) registers here while it's on screen. A new encounter may only open
 * when nothing is registered, no story event is waiting and no tournament
 * screen (including its results) is up.
 */
import { useEffect, useSyncExternalStore } from 'react';

const open = new Map<string, number>();
const listeners = new Set<() => void>();
let snapshot: readonly string[] = [];

function emit() {
  snapshot = [...open.keys()];
  for (const l of listeners) l();
}

export function registerBlocking(id: string): () => void {
  open.set(id, (open.get(id) ?? 0) + 1);
  emit();
  return () => {
    const n = (open.get(id) ?? 1) - 1;
    if (n <= 0) open.delete(id);
    else open.set(id, n);
    emit();
  };
}

export function openBlockingScreens(): readonly string[] {
  return snapshot;
}

export function subscribeBlocking(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Registers `id` as a blocking screen while `active`. */
export function useBlocking(id: string, active = true) {
  useEffect(() => (active ? registerBlocking(id) : undefined), [id, active]);
}

export function useOpenBlockingScreens(): readonly string[] {
  return useSyncExternalStore(subscribeBlocking, openBlockingScreens, openBlockingScreens);
}

export interface ScreenState {
  /** The tournament screen (play, leaderboard or final results) is showing. */
  tournamentScreen: boolean;
  /** A story event is waiting for an answer. */
  storyPending: boolean;
  /** Blocking screens currently open (other than the encounter itself). */
  openScreens: readonly string[];
}

/** May an encounter be shown right now? */
export function encounterMayShow(s: ScreenState): boolean {
  return !s.tournamentScreen && !s.storyPending && s.openScreens.length === 0;
}

/** Should a newly offered encounter open by itself? Only once per offer, and only when nothing else is up. */
export function encounterShouldAutoOpen(s: ScreenState, offered: string | null, alreadyOpened: string | null): boolean {
  return !!offered && offered !== alreadyOpened && encounterMayShow(s);
}
