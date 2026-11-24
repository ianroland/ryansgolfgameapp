/**
 * Casino lobby (Casino Secrets & Rivalries, Slice 1): pick a casino.
 *
 * Desert Palms is open from the start; The White Buffalo and Morongo Sky unlock permanently the
 * first time the bank reaches $100,000 and $1,000,000 (CONFIRMED). All three floors are open:
 * choosing one goes there (a night out uses one weekly activity; once in, moving between
 * casinos that night is free).
 *
 * Art (CASINO_LOBBY_ASSET_PACK_V1, prototype): each card is the casino's 1200x520 panel, the
 * transparent locked overlay when locked, and the transparent gold frame, stacked at the art's
 * own aspect ratio (never stretched). Names, requirements, progress and buttons are UI.
 *
 * Input: mouse/touch, keyboard (Tab or arrow keys between cards, Enter/Space to choose), and a
 * gamepad (d-pad / left stick between cards, A to choose) as on the title screen.
 */
import { useEffect, useRef } from 'react';
import { casinoBlocker, casinoWeekKey } from '../../career/engine';
import { casinoAt, isUnlocked, locationById, LOCATIONS, unlockThreshold, type LocationDef } from '../../expansion/locations';
import { requestCasinoMusic } from '../../expansion/music';
import type { LocationId } from '../../expansion/unlocks';
import { useGame } from '../GameContext';
import { formatMoney } from '../format';
import frame from '../../assets/casino/lobby/card_frame.png';
import dpArt from '../../assets/casino/lobby/desert_palms_art.webp';
import wbArt from '../../assets/casino/lobby/white_buffalo_art.webp';
import msArt from '../../assets/casino/lobby/morongo_sky_art.webp';
import wbLock from '../../assets/casino/lobby/white_buffalo_locked.png';
import msLock from '../../assets/casino/lobby/morongo_sky_locked.png';

export const ART: Record<LocationId, { art: string; locked: string | null }> = {
  desert_palms: { art: dpArt, locked: null },
  white_buffalo: { art: wbArt, locked: wbLock },
  morongo_sky: { art: msArt, locked: msLock },
};

/** Source panel size (every card shares it). */
const ART_W = 1200;
const ART_H = 520;

export function CasinoLobby({ onPlayHere }: { onPlayHere?: () => void }) {
  const { state, services, run, notify, refresh } = useGame();
  const c = state.career;
  const unlocked = new Set(state.expansion.unlocks.map((u) => u.id));
  const seen = new Map(state.expansion.locations.map((l) => [l.locationId, l.seenUnlock]));
  const peak = Math.max(state.expansion.peakBalance, state.balance);
  const inside = c.flags.casinoVisit === casinoWeekKey(c);
  const block = casinoBlocker(c);
  const cards = useRef<(HTMLButtonElement | null)[]>([]);

  const at = casinoAt(c);
  // Music hook for the future soundtrack system: the lobby of the casino Ryan is in.
  useEffect(() => {
    requestCasinoMusic(locationById(at).music.lobby);
    return () => requestCasinoMusic(null);
  }, [at]);

  const choose = async (l: LocationDef) => {
    if (!isUnlocked(l, unlocked)) {
      return notify({ kind: 'info', title: `${l.name} is locked`, body: `It opens the first time your bank reaches ${formatMoney(unlockThreshold(l)!)}.` });
    }
    if (l.status !== 'open') {
      return notify({ kind: 'info', title: `${l.name} is unlocked`, body: 'Its doors open in a future update. Your unlock is saved for good.' });
    }
    if (!seen.get(l.id) && l.unlock) {
      await services.expansion.markSeen(l.id).catch(() => {});
      await refresh();
    }
    if (inside && at === l.id) return onPlayHere?.();
    if (!inside && block) return notify({ kind: 'info', title: 'Not tonight', body: block });
    const o = await run(() => services.casino.visit(l.id));
    if (o) {
      notify({ kind: 'info', title: `Welcome to ${l.name}` });
      onPlayHere?.();
    }
  };

  const focusCard = (i: number) => cards.current[(i + LOCATIONS.length) % LOCATIONS.length]?.focus();
  const indexOfFocus = () => cards.current.findIndex((el) => el === document.activeElement);

  // Gamepad: d-pad / stick moves between cards (picks up focus if nothing is focused), A chooses.
  const live = useRef({ choose });
  live.current.choose = choose;
  useEffect(() => {
    let raf = 0;
    let armed = false;
    let lastMove = 0;
    const poll = (t: number) => {
      const pad = [...(navigator.getGamepads?.() ?? [])].find(Boolean);
      if (pad) {
        const i = indexOfFocus();
        const free = document.activeElement === document.body || document.activeElement === null;
        const x = (pad.axes[0] ?? 0) + (pad.buttons[15]?.pressed ? 1 : 0) - (pad.buttons[14]?.pressed ? 1 : 0);
        if (Math.abs(x) > 0.5 && t - lastMove > 250 && (i >= 0 || free)) {
          lastMove = t;
          focusCard(i < 0 ? 0 : i + (x > 0 ? 1 : -1));
        }
        const a = pad.buttons[0]?.pressed;
        if (!a) armed = true;
        else if (armed) {
          armed = false;
          if (i >= 0) void live.current.choose(LOCATIONS[i]);
        }
      }
      raf = requestAnimationFrame(poll);
    };
    raf = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <nav className="casino-lobby" aria-label="Casinos" data-testid="casino-lobby">
      {LOCATIONS.map((l, i) => {
        const isOpen = isUnlocked(l, unlocked);
        // `here`: open to Ryan tonight (unlocked and its floor built). `current`: where he is.
        const here = isOpen && l.status === 'open';
        const current = here && inside && at === l.id;
        const threshold = unlockThreshold(l);
        const fresh = here && !!l.unlock && !seen.get(l.id);
        const art = ART[l.id];
        const status = current ? 'You are here' : here ? 'Open tonight' : isOpen ? 'Unlocked · opening soon' : 'Locked';
        const action = current ? 'Play here' : here ? (inside ? 'Go here' : 'Head inside') : isOpen ? 'Coming soon' : `Reach ${formatMoney(threshold!)}`;
        return (
          <button
            key={l.id}
            ref={(el) => {
              cards.current[i] = el;
            }}
            className={`lobby-card ${here ? 'here' : isOpen ? 'unlocked' : 'locked'} ${current ? 'current' : ''}`}
            onClick={() => choose(l)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault();
                focusCard(i + 1);
              } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault();
                focusCard(i - 1);
              }
            }}
            aria-current={current ? 'page' : undefined}
            aria-label={`${l.name}. ${status}.${!isOpen && threshold ? ` Opens the first time your bank reaches ${formatMoney(threshold)}.` : ''}`}
            data-testid={`lobby-${l.id}`}
            data-state={here ? 'open' : isOpen ? 'unlocked' : 'locked'}
          >
            <span className="lobby-art-wrap" style={{ aspectRatio: `${ART_W} / ${ART_H}` }}>
              <img className="lobby-art" src={art.art} alt="" draggable={false} width={ART_W} height={ART_H} />
              {!isOpen && art.locked && <img className="lobby-lock" src={art.locked} alt="" draggable={false} width={ART_W} height={ART_H} data-testid={`lobby-lock-${l.id}`} />}
              <img className="lobby-frame" src={frame} alt="" draggable={false} width={ART_W} height={ART_H} />
              {fresh && <span className="lobby-new">New</span>}
            </span>
            <span className="lobby-info">
              <span className="lobby-name">{l.name}</span>
              <span className="lobby-tag">{l.tagline}</span>
              <span className={`lobby-status s-${here ? 'open' : isOpen ? 'unlocked' : 'locked'}`}>
                {status}
                {!isOpen && threshold && <> · opens the first time your bank reaches <b>{formatMoney(threshold)}</b></>}
              </span>
              {!isOpen && threshold && (
                <span className="lobby-progress" role="progressbar" aria-valuemin={0} aria-valuemax={threshold} aria-valuenow={Math.min(peak, threshold)} aria-label={`Best bank balance so far ${formatMoney(peak)}`}>
                  <span style={{ width: `${Math.min(100, (peak / threshold) * 100)}%` }} />
                  <small>Best so far {formatMoney(peak)}</small>
                </span>
              )}
              <span className={`btn small lobby-action ${here ? 'primary' : ''}`} aria-hidden>{action}</span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}
