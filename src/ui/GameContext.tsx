import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { LOCATIONS } from '../expansion/locations';
import { isDomainError } from '../core/errors';
import { PLAYER_ID } from '../core/ids';
import type { GameServices } from '../services';
import type { ClubhouseState } from '../services/careerService';
import type { GameNotification } from '../services/notifier';
import { sound } from '../audio/sound';
import { celebrateAlbatross } from './records/celebrate';
import { celebrateLegacy } from './legacy/celebrateLegacy';
import { legacyMilestone } from '../career/legacy';
import { fameLevel } from '../career/config';

interface GameContextValue {
  /** True when saves can't persist in this browser context. */
  ephemeral: boolean;
  services: GameServices;
  playerId: string;
  state: ClubhouseState;
  refresh: () => Promise<void>;
  notifications: GameNotification[];
  dismiss: (id: string) => void;
  notify: (n: Omit<GameNotification, 'id'>) => void;
  /** Runs an action, reports domain errors as toasts, then refreshes state. */
  run: <T>(action: () => Promise<T>) => Promise<T | undefined>;
  inspectTrophyId: string | null;
  setInspectTrophyId: (id: string | null) => void;
}

const Ctx = createContext<GameContextValue | null>(null);

export function GameProvider({ services, initial, ephemeral = false, children }: { services: GameServices; initial: ClubhouseState; ephemeral?: boolean; children: ReactNode }) {
  const [state, setState] = useState(initial);
  const [notifications, setNotifications] = useState<GameNotification[]>([]);
  const [inspectTrophyId, setInspectTrophyId] = useState<string | null>(null);

  const refresh = useCallback(async () => setState(await services.career.loadClubhouse(PLAYER_ID)), [services]);
  const dismiss = useCallback((id: string) => setNotifications((ns) => ns.filter((n) => n.id !== id)), []);
  const push = useCallback(
    (n: GameNotification) => {
      setNotifications((ns) => [...ns.slice(-2), n]);
      window.setTimeout(() => dismiss(n.id), n.kind === 'trophy' ? 9000 : n.kind === 'info' ? 3500 : 5000);
    },
    [dismiss],
  );
  // Albatrosses get the full-screen celebration instead of a toast.
  useEffect(
    () =>
      services.notifier.subscribe((n) => {
        if (n.kind === 'albatross') {
          if (n.moment) celebrateAlbatross(n.moment);
        } else if (n.kind === 'legacy' && n.legacy?.full) celebrateLegacy(n.legacy);
        else push(n);
      }),
    [services, push],
  );
  // Casino unlocks (White Buffalo at $100,000, Morongo Sky at $1,000,000) are written by the ledger
  // in the same transaction as the money that earned them; announce new ones once they're loaded.
  const unlockIds = state.expansion.unlocks.map((u) => u.id).sort().join(',');
  const knownUnlocks = useRef<string | null>(null);
  useEffect(() => {
    const prev = knownUnlocks.current;
    knownUnlocks.current = unlockIds;
    if (prev === null) return; // first load: nothing new to announce
    const before = new Set(prev ? prev.split(',') : []);
    for (const id of unlockIds ? unlockIds.split(',') : []) {
      if (before.has(id)) continue;
      const loc = LOCATIONS.find((l) => l.unlock === id);
      if (loc) push({ id: `unlock-${id}`, kind: 'info', title: `New casino unlocked: ${loc.name}`, body: 'Your bank reached a new high. This unlock is permanent.' });
    }
  }, [unlockIds, push]);
  // Career Legacy: season-end and fame milestones don't come from a tournament result, so they are
  // recognized when the season or the fame level changes (idempotent; see LegacyService.reconcile).
  const legacySeason = state.career.season;
  const legacyFame = fameLevel(state.career.fame).name;
  useEffect(() => {
    let live = true;
    void services.legacy.reconcile().then((ids) => {
      if (!live || !ids.length) return;
      for (const id of ids) {
        const m = legacyMilestone(id);
        if (m) services.notifier.emit({ kind: 'legacy', title: `Milestone: ${m.name}`, body: m.description, refId: id });
      }
      void refresh();
    });
    return () => {
      live = false;
    };
  }, [services, refresh, legacySeason, legacyFame]);
  // Notification sounds.
  useEffect(
    () =>
      services.notifier.subscribe((n) => {
        if (n.kind === 'payout') sound.play('cash');
        else if (n.kind === 'trophy') sound.play('trophy');
        else if (n.kind === 'legacy' && !n.legacy?.full) sound.play('achievement');
        else if (n.kind === 'purchase') sound.play('buy');
        else if (n.kind === 'error') sound.play('error');
        else if (n.refId?.startsWith('ach:')) sound.play('achievement');
      }),
    [services],
  );

  const notify = useCallback((n: Omit<GameNotification, 'id'>) => services.notifier.emit(n), [services]);

  const run = useCallback(
    async <T,>(action: () => Promise<T>) => {
      try {
        return await action();
      } catch (e) {
        notify({ kind: 'error', title: isDomainError(e) ? e.message : 'Something went wrong', body: isDomainError(e) ? undefined : String(e) });
        return undefined;
      } finally {
        await refresh();
      }
    },
    [notify, refresh],
  );

  const value = useMemo(
    () => ({ ephemeral, services, playerId: PLAYER_ID, state, refresh, notifications, dismiss, notify, run, inspectTrophyId, setInspectTrophyId }),
    [ephemeral, services, state, refresh, notifications, dismiss, notify, run, inspectTrophyId],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGame() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useGame outside GameProvider');
  return v;
}
