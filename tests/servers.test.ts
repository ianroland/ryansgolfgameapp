import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SERVER_CONFIG as C } from '../src/casino/servers/config';
import {
  applyOrder, applyRounds, applyWater, canOrderAlcohol, drawEffect, forVisit, freshDrinkState, parseDrinkState, recordIncident, serverDue,
} from '../src/casino/servers/drinks';
import { SERVERS, serverAt, serverFace, serverPortrait, type ServerEvent } from '../src/casino/servers/registry';
import { isDomainError } from '../src/core/errors';
import { DRINK_FLAG } from '../src/services/drinkService';
import { decodePng } from './png';
import { newCareer, RYAN } from './helpers';
import { setCareer } from './careerHelpers';

const EVENTS: ServerEvent[] = ['intro', 'order', 'first_order', 'chat', 'tip', 'no_tip', 'decline', 'water', 'rumor', 'concern', 'refusal', 'hostile', 'apology', 'farewell'];

describe('cocktail servers: data and portraits', () => {
  it('one server per casino, each with every dialogue event from servers.json (stable line ids)', () => {
    expect(SERVERS.map((s) => [s.location, s.id])).toEqual([['desert_palms', 'dp_server'], ['white_buffalo', 'wb_server'], ['morongo_sky', 'ms_server']]);
    expect(serverAt('white_buffalo').name).toBe('Nina Calder');
    for (const s of SERVERS) {
      for (const e of EVENTS) {
        expect(s.dialogue[e]?.length, `${s.id} ${e}`).toBeGreaterThan(0);
        for (const l of s.dialogue[e]) expect(l.id.startsWith(`${s.id}.${e}.`), l.id).toBe(true);
      }
    }
  });

  it('all 18 portraits exist as 256x256 opaque squares, one per drawn face, and every line has a face', () => {
    for (const s of SERVERS) {
      const dir = join(__dirname, `../src/assets/casino/npcs/servers/${s.location}`);
      expect(readdirSync(dir).sort()).toEqual(['concerned.png', 'firm.png', 'friendly.png', 'impressed.png', 'playful.png', 'whisper.png']);
      for (const f of readdirSync(dir)) {
        const png = decodePng(join(dir, f));
        expect([png.width, png.height], f).toEqual([256, 256]);
      }
      for (const e of EVENTS) for (const l of s.dialogue[e]) expect(serverPortrait(s.location, serverFace(l.expression, e)), l.id).toBeTruthy();
    }
  });

  it("Tito's Double is the only alcoholic drink; water is free", () => {
    expect(C.drink.name).toBe("Tito's Double");
    expect(C.drink.onlyAlcoholicOption).toBe(true);
    expect(C.water.price).toBe(0);
  });
});

describe('drinking rules (pure)', () => {
  const at = (buzz: number) => ({ ...forVisit(freshDrinkState(), '1:1'), buzz });

  it('buzz rises per drink, falls with rounds and water; a new visit starts sober', () => {
    let s = forVisit(freshDrinkState(), '1:1');
    s = applyOrder(s, 1).state;
    expect(s.buzz).toBe(C.buzzPerDrink);
    expect(applyRounds(s, 2).buzz).toBe(C.buzzPerDrink - 2 * C.buzzPerRound);
    expect(applyWater(s).buzz).toBe(C.buzzPerDrink - C.buzzPerWater);
    const next = forVisit(s, '1:2');
    expect([next.buzz, next.drinksThisVisit, next.lifetimeDrinks]).toEqual([0, 0, 1]);
  });

  it('refusal is enforced at the threshold and only recovery lifts it', () => {
    expect(canOrderAlcohol(at(C.refuseAt - 1)).ok).toBe(true);
    expect(canOrderAlcohol(at(C.refuseAt)).ok).toBe(false);
    const refused = { ...at(C.refuseAt), refused: true };
    expect(canOrderAlcohol(applyRounds(refused, 1)).ok).toBe(false);
    let s = refused;
    for (let i = 0; i < 40 && s.refused; i++) s = applyRounds(s, 1);
    expect(s.refused).toBe(false);
    expect(s.buzz).toBeLessThanOrEqual(C.refusalLiftsAt);
  });

  it('effects start only after the configured number of drinks, and draws are deterministic (no re-rolling)', () => {
    let s = forVisit(freshDrinkState(), '1:1');
    const effects = [];
    for (let i = 0; i < C.effectsStartAfter + 1; i++) {
      const r = applyOrder(s, 42);
      effects.push(r.effect);
      s = r.state;
    }
    expect(effects.slice(0, C.effectsStartAfter)).toEqual(Array(C.effectsStartAfter).fill(null));
    expect(effects.at(-1)).not.toBeNull();
    expect(drawEffect(42, 7, 50).id).toBe(drawEffect(42, 7, 50).id);
  });

  it('heavier buzz makes bad outcomes more likely', () => {
    const share = (buzz: number) => {
      let bad = 0;
      for (let i = 0; i < 2000; i++) if (drawEffect(9, i, buzz).type === 'debuff') bad++;
      return bad / 2000;
    };
    expect(share(C.refuseAt)).toBeGreaterThan(share(C.levels.buzzed) + 0.15);
  });

  it('the sponsor hears about a pattern, never a single incident; counts reset each season', () => {
    let s = freshDrinkState();
    const a = recordIncident(s, 1);
    expect([a.sponsorWarning, a.sponsorLoss]).toEqual([false, false]);
    const b = recordIncident(a.state, 1);
    expect(b.sponsorWarning).toBe(true);
    const c = recordIncident(b.state, 1);
    expect([c.sponsorWarning, c.sponsorLoss]).toEqual([false, true]);
    s = recordIncident(c.state, 2).state;
    expect(s.incidents).toEqual({ season: 2, count: 1, warned: false });
  });

  it('servers come by between rounds: after the first round, then every few rounds', () => {
    const due = Array.from({ length: 12 }, (_, i) => serverDue(i));
    expect(due.filter(Boolean).length).toBeGreaterThan(1);
    expect(due[0]).toBe(false);
  });

  it('a corrupt or missing saved state reads as sober', () => {
    expect(parseDrinkState('nope').buzz).toBe(0);
    expect(parseDrinkState(undefined).v).toBe(1);
  });
});

describe('cocktail service (ledger, refusal, relationships)', () => {
  async function inCasino() {
    const ctx = await newCareer();
    await ctx.s.casino.visit();
    return ctx;
  }

  it("ordering charges the casino's price once per order id, as a 'drink' ledger entry, and costs a little energy", async () => {
    const { s } = await inCasino();
    const bank = await s.economy.getBalance(RYAN);
    const energy = (await s.career.getCareer()).energy;
    const r = await s.drinks.order('dp_server', 'o1');
    expect(r.event).toBe('first_order');
    expect(await s.economy.getBalance(RYAN)).toBe(bank - C.drink.prices.desert_palms);
    const again = await s.drinks.order('dp_server', 'o1');
    expect(again.replayed).toBe(true);
    expect(await s.economy.getBalance(RYAN)).toBe(bank - C.drink.prices.desert_palms);
    const txns = (await s.economy.listTransactions(RYAN)).filter((t) => t.type === 'drink');
    expect(txns).toHaveLength(1);
    expect((await s.career.getCareer()).energy).toBe(Math.max(0, energy - C.energyPerDrink));
    expect((await s.npc.history('dp_server')).map((h) => h.kind)).toEqual(['order']);
  });

  it('refusal is enforced by the service: no charge, and tips or chat cannot lift it', async () => {
    const { s } = await inCasino();
    await setCareer(s, (c) => {
      c.flags[DRINK_FLAG] = JSON.stringify({ ...forVisit(freshDrinkState(), `${c.season}:${c.week}`), buzz: C.refuseAt });
    });
    const bank = await s.economy.getBalance(RYAN);
    const r = await s.drinks.order('dp_server', 'x1');
    expect(r.event).toBe('refusal');
    expect(r.state.refused).toBe(true);
    expect(await s.economy.getBalance(RYAN)).toBe(bank);
    await s.npc.tip('dp_server', 25, 't1');
    await s.drinks.chat('dp_server', 'c1');
    expect((await s.drinks.order('dp_server', 'x2')).event).toBe('refusal');
    // Water is always available, and recovery (rounds) eventually lifts the refusal.
    expect((await s.drinks.water('dp_server', 'w1')).event).toBe('water');
    for (let i = 0; i < 30; i++) await s.drinks.round();
    expect((await s.drinks.state()).refused).toBe(false);
  });

  it('server tips use the server tip sizes and the same relationship system as dealers', async () => {
    const { s } = await inCasino();
    expect(isDomainError(await s.npc.tip('dp_server', 100, 'big').catch((e) => e), 'CAREER_RULE')).toBe(true);
    const r = await s.npc.tip('dp_server', 10, 'ok');
    expect(r.outcome?.gain).toBeGreaterThan(0);
    expect((await s.npc.history('dp_server')).at(-1)?.kind).toBe('tip');
  });

  it('rudeness costs relationship; apologies only when there was rudeness', async () => {
    const { s } = await inCasino();
    expect(isDomainError(await s.drinks.apologize('dp_server', 'a0').catch((e) => e), 'CAREER_RULE')).toBe(true);
    const rude = await s.drinks.rude('dp_server', 'r1');
    expect(rude.event).toBe('hostile');
    const sorry = await s.drinks.apologize('dp_server', 'a1');
    expect(sorry.event).toBe('apology');
    expect(sorry.state.rude).toEqual([]);
  });

  it('a pattern of refusals in one season makes the sponsor write once, and never ends the deal', async () => {
    const { s } = await inCasino();
    await setCareer(s, (c) => {
      c.sponsor = { name: 'Acme Golf', weekly: 100, untilSeason: c.season + 2 } as typeof c.sponsor;
      c.relationships.sponsor = 50;
    });
    const refuseOnce = async (id: string) => {
      await setCareer(s, (c) => {
        const cur = parseDrinkState(c.flags[DRINK_FLAG]);
        c.flags[DRINK_FLAG] = JSON.stringify({ ...forVisit(cur, `${c.season}:${c.week}`), buzz: C.refuseAt, refused: false });
      });
      return s.drinks.order('dp_server', id);
    };
    expect((await refuseOnce('a')).sponsorWarning).toBe(false);
    expect((await refuseOnce('b')).sponsorWarning).toBe(true);
    expect((await refuseOnce('c')).sponsorWarning).toBe(false);
    const c = await s.career.getCareer();
    expect(c.sponsor).not.toBeNull();
    expect(c.inbox.filter((m) => m.title.includes('a word about the casino'))).toHaveLength(1);
    expect(c.relationships.sponsor).toBe(50 - 2 * C.sponsorRelLoss);
  });
});

describe('drinks never touch casino maths', () => {
  it('no casino rule or game file reads the drink or server modules', () => {
    for (const f of readdirSync(join(__dirname, '../src/casino')).filter((x) => x.endsWith('.ts'))) {
      expect(readFileSync(join(__dirname, '../src/casino', f), 'utf8'), f).not.toMatch(/servers\/|drinkService|DrinkState/);
    }
    for (const f of ['casinoService.ts', 'economyService.ts']) {
      expect(readFileSync(join(__dirname, '../src/services', f), 'utf8'), f).not.toMatch(/drink|servers\//i);
    }
  });
});
