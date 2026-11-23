/**
 * Craps with the bets most people know: Pass Line, Don't Pass, Pass Odds
 * (true odds, up to 2× the pass bet) and the one-roll Field.
 */
import { cryptoInt, type RandomInt } from './random';

export interface CrapsBets {
  pass: number;
  dontPass: number;
  odds: number;
  field: number;
}

export interface CrapsState {
  point: number | null;
  bets: CrapsBets;
}

export type BetKey = keyof CrapsBets;

export interface BetOutcome {
  bet: BetKey;
  result: 'win' | 'lose' | 'push';
  /** Returned to the player, stake included. */
  payout: number;
}

export const CRAPS_LIMITS = { min: 5, max: 1000 };
export const POINTS = [4, 5, 6, 8, 9, 10];
const ODDS_PAY: Record<number, [number, number]> = { 4: [2, 1], 10: [2, 1], 5: [3, 2], 9: [3, 2], 6: [6, 5], 8: [6, 5] };

export const emptyBets = (): CrapsBets => ({ pass: 0, dontPass: 0, odds: 0, field: 0 });
export const newCraps = (): CrapsState => ({ point: null, bets: emptyBets() });

/** Why a bet can't be placed right now, if it can't. */
export function betBlocker(s: CrapsState, bet: BetKey, amount: number): string | null {
  if (amount <= 0) return 'Pick a chip';
  if (bet === 'pass' || bet === 'dontPass') {
    if (s.point !== null) return 'Line bets go down on the come-out roll';
    if (s.bets[bet] + amount > CRAPS_LIMITS.max) return `Table max $${CRAPS_LIMITS.max}`;
  }
  if (bet === 'odds') {
    if (s.point === null || s.bets.pass === 0) return 'Odds need a Pass bet and a point';
    if (s.bets.odds + amount > s.bets.pass * 2) return 'Odds max is 2× your Pass bet';
  }
  if (bet === 'field' && s.bets.field + amount > CRAPS_LIMITS.max) return `Table max $${CRAPS_LIMITS.max}`;
  return null;
}

export const rollDice = (rand: RandomInt = cryptoInt): [number, number] => [rand(6) + 1, rand(6) + 1];

export function resolveRoll(prev: CrapsState, dice: [number, number]): { state: CrapsState; outcomes: BetOutcome[]; message: string } {
  const sum = dice[0] + dice[1];
  const bets = { ...prev.bets };
  const outcomes: BetOutcome[] = [];
  let point = prev.point;
  let message = `${sum}`;
  const settle = (bet: BetKey, result: BetOutcome['result'], payout: number) => {
    if (bets[bet] > 0) outcomes.push({ bet, result, payout });
    bets[bet] = 0;
  };

  // Field: one roll.
  if (bets.field > 0) {
    const f = bets.field;
    if (sum === 2) settle('field', 'win', f * 3);
    else if (sum === 12) settle('field', 'win', f * 4);
    else if ([3, 4, 9, 10, 11].includes(sum)) settle('field', 'win', f * 2);
    else settle('field', 'lose', 0);
  }

  if (point === null) {
    if (sum === 7 || sum === 11) {
      settle('pass', 'win', bets.pass * 2);
      settle('dontPass', 'lose', 0);
      message = `${sum}: natural! Pass wins`;
    } else if (sum === 2 || sum === 3 || sum === 12) {
      settle('pass', 'lose', 0);
      if (sum === 12) {
        if (bets.dontPass > 0) outcomes.push({ bet: 'dontPass', result: 'push', payout: bets.dontPass });
        bets.dontPass = 0;
      } else settle('dontPass', 'win', bets.dontPass * 2);
      message = `${sum}: craps`;
    } else {
      point = sum;
      message = `Point is ${sum}`;
    }
  } else if (sum === point) {
    const [n, d] = ODDS_PAY[point];
    settle('odds', 'win', bets.odds + Math.floor((bets.odds * n) / d));
    settle('pass', 'win', bets.pass * 2);
    settle('dontPass', 'lose', 0);
    point = null;
    message = `${sum}: hit the point! Pass wins`;
  } else if (sum === 7) {
    settle('odds', 'lose', 0);
    settle('pass', 'lose', 0);
    settle('dontPass', 'win', bets.dontPass * 2);
    point = null;
    message = '7 out';
  }
  return { state: { point, bets }, outcomes, message };
}

export const betsOnTable = (s: CrapsState) => s.bets.pass + s.bets.dontPass + s.bets.odds + s.bets.field;
