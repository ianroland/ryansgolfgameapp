/**
 * Dealer tipping (Casino Secrets & Rivalries, Slice 1): the tip tray under each dealer's
 * dialogue box, and the relationship tier shown beside the dealer's name (a label, never a
 * number). Reuses the existing chip buttons; no new art. Presentation only: the rules live in
 * src/npc and NpcService, and nothing here reaches a game's rules or payouts.
 */
import { useEffect, useRef, useState } from 'react';
import { sound } from '../../audio/sound';
import { newId } from '../../core/ids';
import { dealerById } from '../../npc/registry';
import { freshNpcState, TIP_AMOUNTS, tierOf, type TipEvent } from '../../npc/relationship';
import { pickTipLine, type TipLine } from '../../npc/tipLines';
import type { NpcId } from '../../npc/types';
import { useGame } from '../GameContext';
import { formatMoney } from '../format';

/** The dealer's relationship tier, from saved state. */
export function useDealerTier(npcId: NpcId) {
  const { state } = useGame();
  const s = state.expansion.npcs.find((n) => n.npcId === npcId) ?? freshNpcState(npcId);
  return { tier: tierOf(s), state: s };
}

export function TierChip({ npcId }: { npcId: NpcId }) {
  const { tier } = useDealerTier(npcId);
  return (
    <span className="tier-chip" title="How well this dealer knows you" data-testid={`tier-${npcId}`}>
      {tier}
    </span>
  );
}

export interface TipReaction {
  line: TipLine;
  event: TipEvent;
  amount: number;
}

/**
 * Tip buttons for one dealer. Disabled during a hand, spin or roll (`disabled`). Counts a visit
 * to the dealer's table once per casino visit. Each press has its own id, so a retried request
 * can't charge twice.
 */
export function TipTray({ npcId, disabled, onTipped }: { npcId: NpcId; disabled: boolean; onTipped: (r: TipReaction) => void }) {
  const { state, services, run } = useGame();
  const { state: npc } = useDealerTier(npcId);
  const [busy, setBusy] = useState(false);
  const recent = useRef<string[]>([]);
  const dealer = dealerById(npcId)!;

  useEffect(() => {
    void services.npc.visit(npcId).catch(() => {});
  }, [services, npcId]);

  const tip = async (amount: number) => {
    if (busy || disabled) return;
    setBusy(true);
    const tipId = newId('tip');
    const r = await run(() => services.npc.tip(npcId, amount, tipId));
    setBusy(false);
    if (!r || !r.outcome) return;
    sound.play(r.outcome.event === 'tier_up' ? 'achievement' : 'cash', { volume: 0.4 });
    const line = pickTipLine(npcId, r.outcome.event, recent.current);
    recent.current = [...recent.current, line.id].slice(-6);
    onTipped({ line, event: r.outcome.event, amount });
  };

  return (
    <div className="tip-tray" data-testid={`tip-tray-${npcId}`}>
      <span className="tip-label">Tip {dealer.short}</span>
      {TIP_AMOUNTS.map((a) => (
        <button
          key={a}
          className={`chip chip-${a}`}
          onClick={() => tip(a)}
          disabled={disabled || busy || state.balance < a}
          title={disabled ? 'Tip between hands' : `Tip ${formatMoney(a)}`}
          aria-label={`Tip ${dealer.name} ${formatMoney(a)}`}
          data-testid={`tip-${npcId}-${a}`}
        >
          {a}
        </button>
      ))}
      <span className="tip-total" data-testid={`tip-total-${npcId}`}>
        {npc.tips.count > 0 ? <>Tipped <b>{formatMoney(npc.tips.lifetime)}</b> over {npc.tips.count} {npc.tips.count === 1 ? 'tip' : 'tips'}</> : 'Tips are optional, and never change the game.'}
      </span>
    </div>
  );
}
