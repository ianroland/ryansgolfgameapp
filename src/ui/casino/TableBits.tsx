/** Shared table pieces: playing cards and bet chips drawn on the felt (presentation only). */
import type { Card } from '../../casino/blackjack';
import { formatMoney } from '../format';
import { chipFor } from './casinoArt';

/** A bet sitting on the felt: the drawn chip that fits, and the amount. */
export function BetChip({ amount, className }: { amount: number; className?: string }) {
  if (amount <= 0) return null;
  const chip = chipFor(amount);
  return (
    <span className={`felt-chip ${className ?? ''}`} key={amount}>
      <img src={chip.url} alt="" draggable={false} />
      <b>{formatMoney(amount)}</b>
    </span>
  );
}

export const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const SUITS = ['♠', '♥', '♦', '♣'];

/** `delay` (seconds) overrides the default stagger, for tables that deal in a set order. */
export function PlayingCard({ card, hidden, i, delay }: { card: Card; hidden?: boolean; i: number; delay?: number }) {
  const d = `${delay ?? i * 0.12}s`;
  if (hidden) return <div className="pcard back" style={{ animationDelay: d }} aria-label="Face-down card" />;
  const red = card.suit === 1 || card.suit === 2;
  return (
    <div className={`pcard ${red ? 'red' : ''}`} style={{ animationDelay: d }} aria-label={`${RANKS[card.rank]} of ${['spades', 'hearts', 'diamonds', 'clubs'][card.suit]}`}>
      <span className="pc-corner">{RANKS[card.rank]}<br />{SUITS[card.suit]}</span>
      <span className="pc-suit">{SUITS[card.suit]}</span>
    </div>
  );
}

