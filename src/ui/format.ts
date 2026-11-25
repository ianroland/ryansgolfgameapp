import type { GameTime } from '../core/types';

export function formatMoney(n: number, signed = false) {
  const s = Math.abs(Math.round(n)).toLocaleString('en-US');
  return `${signed ? (n < 0 ? '−' : '+') : n < 0 ? '−' : ''}$${s}`;
}

/** Compact money: $2.5M, $45K, $900. */
export function shortMoney(n: number) {
  const a = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  if (a >= 1_000_000) return `${sign}$${(a / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1).replace(/\.0$/, '')}M`;
  if (a >= 10_000) return `${sign}$${Math.round(a / 1000)}K`;
  return `${sign}$${Math.round(a).toLocaleString('en-US')}`;
}

export function toPar(n: number) {
  return n === 0 ? 'E' : n > 0 ? `+${n}` : `${n}`;
}

/** In-game calendar date, e.g. "Sat, Mar 6, 2027". */
export function formatGameDate(t: GameTime) {
  return new Date(t).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export const TX_LABELS: Record<string, string> = {
  career_start_grant: 'Savings',
  furniture_purchase: 'Furniture',
  home_purchase: 'New home',
  gear_purchase: 'Equipment',
  lifestyle_purchase: 'Lifestyle',
  entry_fee: 'Entry fee',
  travel: 'Travel',
  prize_money: 'Prize money',
  living_costs: 'Rent & bills',
  job_wage: 'Wages',
  sponsor_income: 'Sponsor',
  story: 'Life',
  casino: 'Casino',
  tip: 'Tip (gratuity)',
  drink: "Drink (Tito's Double)",
  sports_bet: 'Sportsbook bet',
  sports_payout: 'Sportsbook payout',
  family_loan: 'Baba\u2019s loan',
};
