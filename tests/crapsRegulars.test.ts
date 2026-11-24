/** Craps table life: the shooter, hot and cold, and the regulars (presentation only; never the dice or the money). */
import { describe, expect, it } from 'vitest';
import {
  chooseBets, newRegularState, pickLine, placeBets, REGULARS, regularsAt, rollEvents, RYAN_SEAT,
  seatsAt, settleRegular, type Mood,
} from '../src/ui/casino/crapsRegulars';
import { advanceShooter, newShooter, readShooter, tableMood, type ShooterState } from '../src/casino/crapsShooter';
import { betBlocker, onTable, rollDice } from '../src/casino/craps';
import { seededInt } from '../src/casino/random';
import { crapsShooter } from '../src/services/casinoService';
import { LOCATIONS } from '../src/expansion/locations';
import { newCareer, RYAN, START } from './helpers';

const S = (o: Partial<ShooterState> = {}): ShooterState => ({ ...newShooter(), ...o });

describe('the shooter', () => {
  it('counts rolls and points, and passes the dice on a seven-out only', () => {
    let s = advanceShooter(S(), null, [3, 4]); // come-out 7: not a seven-out
    expect(s).toMatchObject({ seat: 0, rolls: 1, points: 0 });
    s = advanceShooter(s, 6, [3, 3]);
    expect(s).toMatchObject({ seat: 0, rolls: 2, points: 1 });
    s = advanceShooter(s, 8, [3, 4]);
    expect(s).toMatchObject({ seat: 1, rolls: 0, points: 0 });
    expect(s.history[0]).toEqual({ seat: 0, rolls: 3, points: 1 });
    expect(advanceShooter(S({ seat: 3 }), 5, [1, 6]).seat).toBe(0);
  });

  it('hot, on fire and cold come from what the dice did', () => {
    expect(tableMood(S())).toBe('steady');
    expect(tableMood(S({ rolls: 10 }))).toBe('hot');
    expect(tableMood(S({ points: 2 }))).toBe('hot');
    expect(tableMood(S({ rolls: 20 }))).toBe('fire');
    expect(tableMood(S({ points: 3 }))).toBe('fire');
    const quick = { seat: 0, rolls: 3, points: 0 };
    expect(tableMood(S({ history: [quick, quick, quick] }))).toBe('cold');
    expect(tableMood(S({ history: [quick, quick, { ...quick, points: 1 }] }))).toBe('steady');
    expect(tableMood(S({ rolls: 6, history: [quick, quick, quick] }))).toBe('steady');
  });

  it('reads old or broken saves as a fresh shooter', () => {
    expect(readShooter(undefined)).toEqual(newShooter());
    expect(readShooter('{nope')).toEqual(newShooter());
    expect(readShooter(JSON.stringify(S({ seat: 7 }))).seat).toBe(3);
  });

  it('through the casino: the shooter is saved with each roll; the regulars never touch the money', async () => {
    const { s } = await newCareer();
    await s.casino.visit();
    await s.casino.crapsBet({ kind: 'field' }, 5);
    const r = await s.casino.crapsRoll();
    expect(r.shooter.rolls).toBe(1);
    expect(crapsShooter(await s.career.getCareer())).toEqual(r.shooter);
    expect(await s.economy.getBalance(RYAN)).toBe(START - 5 + r.paid);
    s.db.close();
  });
});

describe('the regulars', () => {
  it('three per casino, each with lines for the big moments; Ryan shoots third', () => {
    for (const l of LOCATIONS) {
      const r = regularsAt(l.id);
      expect(r, l.id).toHaveLength(3);
      expect(seatsAt(l.id)[RYAN_SEAT]).toBe('ryan');
      for (const x of r) for (const e of ['arrive', 'sevenOut', 'hot', 'cold', 'ryanShoots', 'myShoot', 'broke'] as const) expect(x.lines[e]?.length, `${x.id} ${e}`).toBeGreaterThan(0);
    }
    expect(new Set(REGULARS.map((r) => r.id)).size).toBe(REGULARS.length);
  });

  it('every bet a regular makes is legal under the real rules', () => {
    const rand = seededInt(5);
    for (const r of REGULARS) {
      let st = newRegularState(r);
      let point: number | null = null;
      for (let i = 0; i < 300; i++) {
        const mood: Mood = (['steady', 'hot', 'fire', 'cold'] as Mood[])[i % 4];
        const table = { ...st.table, point: point as never };
        for (const [a, amt] of chooseBets(r, table, mood)) void betBlocker(table, a, amt); // computing is fine; placeBets skips illegal ones
        st = placeBets(r, st, point as never, mood).state;
        const d = rollDice(rand);
        const res = settleRegular(st, d);
        st = res.state;
        point = st.table.point;
        expect(st.stack, r.id).toBeGreaterThanOrEqual(0);
      }
      // Pretend money is conserved: stack + chips on the table - buy-ins = what they started with + their net.
      expect(st.stack + onTable(st.table) - st.rebuys * r.stack - r.stack).toBe(st.net);
    }
  });

  it('a regular with nothing left buys another stack', () => {
    const r = regularsAt('morongo_sky')[0];
    const res = placeBets(r, { ...newRegularState(r), stack: 10 }, null, 'steady');
    expect(res.rebought).toBe(true);
    expect(res.state.rebuys).toBe(1);
  });

  it('events and lines: the right event comes first, and the same roll always picks the same line', () => {
    expect(rollEvents(6, [3, 4], 'steady', 'steady', 0, 1)).toEqual(['myShoot', 'sevenOut']);
    expect(rollEvents(6, [3, 4], 'hot', 'steady', 1, 2)).toEqual(['ryanShoots', 'sevenOut']);
    expect(rollEvents(8, [4, 4], 'steady', 'hot', 0, 0)).toEqual(['hot', 'pointMade', 'hardWin']);
    expect(rollEvents(null, [5, 6], 'steady', 'steady', 0, 0)).toEqual(['natural']);
    const a = pickLine('desert_palms', ['sevenOut'], 12, 1);
    expect(a).toEqual(pickLine('desert_palms', ['sevenOut'], 12, 1));
    expect(a?.who.lines.sevenOut).toContain(a?.text);
    expect(pickLine('desert_palms', ['myShoot'], 3, 1)?.who.id).toBe('dee_ruiz');
    expect(pickLine('desert_palms', ['myShoot'], 3, RYAN_SEAT)).toBeNull();
  });
});

describe('approval and portraits', () => {
  it('the regulars are approved; faces follow the last roll; no portrait files yet means initials', async () => {
    const { REGULARS_STATUS, faceFor } = await import('../src/ui/casino/crapsRegulars');
    const { regularPortrait } = await import('../src/ui/casino/regularPortraits');
    expect(REGULARS_STATUS).toBe('approved');
    const r = REGULARS[0];
    expect(faceFor({ ...newRegularState(r), lastNet: 20 })).toBe('happy');
    expect(faceFor({ ...newRegularState(r), lastNet: -10 })).toBe('groan');
    expect(faceFor(newRegularState(r))).toBe('neutral');
    for (const x of REGULARS) expect(regularPortrait(x.id, 'happy')).toBeNull();
  });
});
