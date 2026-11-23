/**
 * Dealer tipping UI (Casino Secrets & Rivalries, Slice 1), built on the Tipping &
 * Relationships V2 asset pack (prototype art): tip tray, $5/$25/$100 buttons with normal /
 * hover / pressed states, tier badges, gain / neutral indicators, the tier-up banner, the
 * dialogue-panel frame (as a 9-slice border, never stretched) and the 6-frame tip flight.
 *
 * Presentation only: rules live in src/npc, money in NpcService (one ledger debit per press,
 * type 'tip', a gratuity). Nothing here reaches a game's odds, RNG, rules or payouts. The panel
 * sits below the dealer's dialogue box, in the page flow, so it never covers cards, chips, bet
 * controls or the dealer. The flight is a brief overlay that ignores the pointer and is skipped
 * when the player prefers reduced motion.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { sound } from '../../audio/sound';
import { newId } from '../../core/ids';
import type { TierId } from '../../npc/config';
import { dealerById } from '../../npc/registry';
import { freshNpcState, normalizeNpcState, TIERS, TIP_AMOUNTS, tierDefOf, type TipEvent } from '../../npc/relationship';
import { pickTipLine, type TipLine } from '../../npc/tipLines';
import type { NpcId } from '../../npc/types';
import { useGame } from '../GameContext';
import { formatMoney } from '../format';
import { CHIP_THEMES } from '../../expansion/chipThemes';
import { useCasinoLocation } from './casinoLocation';

const art = import.meta.glob<string>('../../assets/casino/tipping/*.png', { eager: true, query: '?url', import: 'default' });
const tipArt = (name: string) => art[`../../assets/casino/tipping/${name}.png`];
const FLIGHT = [0, 1, 2, 3, 4, 5].map((i) => tipArt(`tip_flight_0${i}`));
const FLIGHT_FRAME_MS = 80;

export const tierBadge = (id: TierId) => tipArt(`tier_${id}`);

/** The dealer's relationship, from saved state (tier only: the score is never shown). */
export function useDealerTier(npcId: NpcId) {
  const { state } = useGame();
  const row = state.expansion.npcs.find((n) => n.npcId === npcId);
  const s = row ? normalizeNpcState(row) : freshNpcState(npcId);
  return { tier: tierDefOf(s), state: s };
}

export function TierChip({ npcId }: { npcId: NpcId }) {
  const { tier } = useDealerTier(npcId);
  return (
    <span className="tier-chip" title="How well this dealer knows you" data-testid={`tier-${npcId}`} data-tier={tier.id}>
      <img src={tierBadge(tier.id)} alt="" width={18} height={18} draggable={false} />
      {tier.label}
    </span>
  );
}

export interface TipReaction {
  line: TipLine;
  event: TipEvent;
  amount: number;
}

const reducedMotion = () => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

/**
 * The chip flies from the tray to the dealer. With a casino chip face for the amount it's that
 * chip, spinning; otherwise the six-frame flight art.
 */
function TipFlight({ from, to, face, onDone }: { from: DOMRect; to: DOMRect; face: string | null; onDone: () => void }) {
  const [frame, setFrame] = useState(0);
  const [go, setGo] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setGo(true));
    const t = window.setInterval(() => setFrame((f) => Math.min(FLIGHT.length - 1, f + 1)), FLIGHT_FRAME_MS);
    const end = window.setTimeout(onDone, FLIGHT_FRAME_MS * FLIGHT.length + 120);
    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(t);
      window.clearTimeout(end);
    };
  }, [onDone]);
  const size = face ? 44 : 96;
  const x0 = from.left + from.width / 2 - size / 2;
  const y0 = from.top + from.height / 2 - size / 2;
  const dx = to.left + to.width / 2 - size / 2 - x0;
  const dy = to.top + to.height * 0.55 - size / 2 - y0;
  return createPortal(
    <img
      className={`tip-flight ${face ? 'chip-flight chip-img' : ''}`}
      src={face ?? FLIGHT[frame]}
      alt=""
      aria-hidden
      data-testid="tip-flight"
      style={{ left: x0, top: y0, width: size, height: size, transform: go ? `translate(${dx}px, ${dy}px)` : 'none', transitionDuration: `${FLIGHT_FRAME_MS * FLIGHT.length}ms` }}
    />,
    document.body,
  );
}

/**
 * Tip panel for one dealer, under the dealer's dialogue box. Disabled during a hand, spin or roll
 * (`disabled`). Counts a visit to the dealer's table once per casino visit. A press is locked
 * until its request finishes, and has its own id, so rapid clicks can't charge twice.
 */
export function TipTray({ npcId, disabled, onTipped }: { npcId: NpcId; disabled: boolean; onTipped: (r: TipReaction) => void }) {
  const { state, services, run } = useGame();
  const { tier, state: npc } = useDealerTier(npcId);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [flight, setFlight] = useState<{ from: DOMRect; to: DOMRect; face: string | null } | null>(null);
  const chips = CHIP_THEMES[useCasinoLocation()];
  const [feedback, setFeedback] = useState<'gain' | 'neutral' | null>(null);
  const [banner, setBanner] = useState<TierId | null>(null);
  const recent = useRef<string[]>([]);
  const trayRef = useRef<HTMLImageElement>(null);
  const timers = useRef<number[]>([]);
  const dealer = dealerById(npcId)!;
  const endFlight = useCallback(() => setFlight(null), []);

  useEffect(() => {
    void services.npc.visit(npcId).catch(() => {});
  }, [services, npcId]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  const later = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms));

  const startFlight = (amount: number) => {
    const tray = trayRef.current;
    const table = tray?.closest('.casino-game');
    const target = table?.querySelector('.table-dealer, .ww-dealer, [data-testid="monique-sprite"]');
    if (!tray || !target || reducedMotion()) return;
    setFlight({ from: tray.getBoundingClientRect(), to: target.getBoundingClientRect(), face: chips.face(amount) });
  };

  const tip = async (amount: number) => {
    if (lock.current || disabled) return;
    lock.current = true;
    setBusy(true);
    const tipId = newId('tip');
    const r = await run(() => services.npc.tip(npcId, amount, tipId));
    lock.current = false;
    setBusy(false);
    if (!r || !r.outcome) return;
    const outcome = r.outcome;
    startFlight(amount);
    sound.play(outcome.event === 'tier_up' ? 'achievement' : 'cash', { volume: 0.4 });
    const line = pickTipLine(npcId, outcome.event, recent.current);
    recent.current = [...recent.current, line.id].slice(-6);
    setFeedback(outcome.gain > 0 ? 'gain' : 'neutral');
    later(2200, () => setFeedback(null));
    if (outcome.event === 'tier_up') {
      setBanner(outcome.tierAfter);
      later(3600, () => setBanner(null));
    }
    // The dealer answers once the chip has landed.
    later(reducedMotion() ? 0 : FLIGHT_FRAME_MS * FLIGHT.length, () => onTipped({ line, event: outcome.event, amount }));
  };

  const bannerTier = banner ? TIERS.find((t) => t.id === banner) : null;
  const visits = Math.max(npc.visits, npc.tips.visitsTipped ?? 0);

  return (
    <div className="tip-panel" data-testid={`tip-tray-${npcId}`} style={{ borderImageSource: `url(${tipArt('panel')})` }}>
      {bannerTier ? (
        <div className="tier-banner" role="status" data-testid="tier-banner">
          <img className="tier-banner-art" src={tipArt('tier_up_banner')} alt="Relationship advanced!" draggable={false} />
          <span className="tier-banner-text">
            <img src={tierBadge(bannerTier.id)} alt="" width={34} height={34} draggable={false} />
            {dealer.name} now counts you as <b>{bannerTier.id === 'inner_circle' ? 'Inner Circle' : `a ${bannerTier.label}`}</b>
          </span>
        </div>
      ) : null}
      <div className="tip-row">
        <div className="tip-head">
          <picture>
            <source media="(max-width: 760px)" srcSet={tipArt('tips_icon_64')} width={64} height={64} />
            <img ref={trayRef} className="tip-icon" src={tipArt('tips_icon_96')} alt="Tips" draggable={false} width={96} height={96} />
          </picture>
          <div className="tip-info">
            <span className="tip-title">Tip {dealer.short}</span>
            <span className="tip-rel">
              <img src={tierBadge(tier.id)} alt="" width={30} height={30} draggable={false} />
              <b data-testid={`tip-tier-${npcId}`}>{tier.label}</b>
              {feedback && <img className="tip-feedback" src={tipArt(`rel_${feedback}`)} alt={feedback === 'gain' ? 'Relationship improved' : 'No change'} data-testid="tip-feedback" data-kind={feedback} />}
            </span>
          </div>
        </div>
        <div className="tip-buttons" role="group" aria-label={`Tip ${dealer.name}`}>
          {TIP_AMOUNTS.map((a) => {
            const off = disabled || busy || state.balance < a;
            return (
              <button
                key={a}
                className="tip-btn"
                onClick={() => tip(a)}
                disabled={off}
                title={disabled ? 'Tip between hands' : state.balance < a ? 'Not enough in the bank' : `Tip ${dealer.name} ${formatMoney(a)}`}
                data-testid={`tip-${npcId}-${a}`}
                style={{ ['--tip-n' as string]: `url(${tipArt(`tip_${a}_normal`)})`, ['--tip-h' as string]: `url(${tipArt(`tip_${a}_hover`)})`, ['--tip-p' as string]: `url(${tipArt(`tip_${a}_pressed`)})` }}
              >
                <span className="sr-only">Tip {formatMoney(a)}</span>
              </button>
            );
          })}
        </div>
        <span className="tip-total" data-testid={`tip-total-${npcId}`}>
          {npc.tips.count > 0 ? (
            <>
              <b>{formatMoney(npc.tips.lifetime)}</b> in {npc.tips.count} {npc.tips.count === 1 ? 'tip' : 'tips'} · tipped on {npc.tips.visitsTipped ?? 0} of {visits} {visits === 1 ? 'visit' : 'visits'}
            </>
          ) : (
            'Optional. Tips never change the game.'
          )}
        </span>
      </div>
      {disabled && <span className="tip-wait">Tips open between hands</span>}
      {flight && <TipFlight from={flight.from} to={flight.to} face={flight.face} onDone={endFlight} />}
    </div>
  );
}
