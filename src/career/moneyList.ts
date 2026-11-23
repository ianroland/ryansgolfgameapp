/**
 * All-time career money list, Game Dev Story style: every golfer in the
 * world ranked by career prize money, with Ryan climbing it season by season.
 *
 * Established pros start with a career's worth of earnings (seeded from
 * their rating), so reaching the top takes a real career.
 */
import { hashString, rng } from '../golf/math';
import type { TourId } from './config';
import type { CareerState } from './types';

export interface MoneyEntry {
  name: string;
  amount: number;
  tour: TourId;
}

export type CareerMoney = Record<string, MoneyEntry>;

/** Starting career earnings for the existing field. */
export function seedCareerMoney(c: CareerState): CareerMoney {
  const out: CareerMoney = {};
  const seed = Number(c.flags.seed ?? 0);
  for (const tour of ['lpga', 'epson', 'mini'] as TourId[]) {
    for (const g of c.pools[tour] ?? []) {
      if (g.id === c.rivalId) continue;
      const r = rng(seed ^ hashString(`money:${g.id}`));
      const k = 0.55 + r.next() * 0.9;
      const amount =
        tour === 'lpga' ? Math.max(0, g.rating - 58) ** 2 * 11_000 * k + 150_000 * k
        : tour === 'epson' ? Math.max(0, g.rating - 48) ** 2 * 900 * k + 20_000 * k
        : Math.max(0, g.rating - 35) ** 2 * 60 * k;
      if (amount >= 1000) out[g.id] = { name: g.name, amount: Math.round(amount / 100) * 100, tour };
    }
  }
  return out;
}

/** Existing career money, seeding it for saves made before it existed. */
export function careerMoneyOf(c: CareerState): CareerMoney {
  return c.careerMoney ?? seedCareerMoney(c);
}

export interface MoneyRow extends MoneyEntry {
  id: string;
  rank: number;
}

/** The ranked list (golfers with any earnings), Ryan included. */
export function rankMoney(c: CareerState): MoneyRow[] {
  const money = { ...careerMoneyOf(c) };
  const tourNow = new Map(Object.values(c.pools).flat().map((g) => [g.id, g.tour]));
  const rows = Object.entries(money)
    .filter(([, e]) => e.amount > 0)
    .map(([id, e]) => ({ id, ...e, tour: tourNow.get(id) ?? e.tour }));
  rows.sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}

export function ryanRank(c: CareerState): number | null {
  return rankMoney(c).find((r) => r.id === c.playerId)?.rank ?? null;
}
