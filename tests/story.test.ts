import 'fake-indexeddb/auto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as E from '../src/career/engine';
import { appearanceBlocker, appearanceOf, resolveLook, storyOf } from '../src/story/appearance';
import { CAST, RYAN_ID } from '../src/story/cast';
import { judgeDrive, judgePutt, maxDrive, opponentDrive, simChallenge } from '../src/story/challenge';
import { ENCOUNTERS, encounterById, nextEncounter, walkEncounter, type EncounterDef } from '../src/story/encounters';
import { poseFrames, portraitKey, sheetManifest } from '../src/story/sprites';
import { EXPRESSIONS, HAIRS } from '../src/story/types';
import { playTournament, setCareer, topUp } from './careerHelpers';
import { newCareer, reload, RYAN } from './helpers';
import { alphaAt, decodePng } from './png';

const ASSETS = join(__dirname, '../src/assets/characters');

describe('character art (real transparency, complete manifests)', () => {
  const pngs = readdirSync(ASSETS).filter((f) => f.endsWith('.png'));

  it('every atlas has genuine alpha: only fully clear or fully opaque pixels, and see-through frame corners', () => {
    expect(pngs.length).toBe(12);
    for (const f of pngs) {
      const img = decodePng(join(ASSETS, f));
      const m = JSON.parse(readFileSync(join(ASSETS, f.replace('.png', '.json')), 'utf8'));
      expect([m.w, m.h], f).toEqual([img.width, img.height]);
      const alphas = new Set<number>();
      for (let i = 3; i < img.data.length; i += 4) alphas.add(img.data[i]);
      expect([...alphas].sort((a, b) => a - b), `${f} alpha values`).toEqual([0, 255]);
      for (const [key, fr] of Object.entries(m.frames) as [string, { x: number; y: number; w: number; h: number }][]) {
        expect(fr.x + fr.w <= img.width && fr.y + fr.h <= img.height, `${f} ${key} in bounds`).toBe(true);
        const corners = [alphaAt(img, fr.x, fr.y), alphaAt(img, fr.x + fr.w - 1, fr.y), alphaAt(img, fr.x, fr.y + fr.h - 1), alphaAt(img, fr.x + fr.w - 1, fr.y + fr.h - 1)];
        expect(Math.min(...corners), `${f} ${key} has a transparent corner`).toBe(0);
        let opaque = 0;
        for (let y = fr.y; y < fr.y + fr.h; y += 2) for (let x = fr.x; x < fr.x + fr.w; x += 2) opaque += alphaAt(img, x, y) ? 1 : 0;
        expect(opaque, `${f} ${key} is not empty`).toBeGreaterThan(20);
      }
    }
  });

  it('Ryan is only the approved phase art: all 8 expressions per phase, and no other Ryan art', () => {
    const frames = Object.keys(sheetManifest('ryan')!.frames);
    for (const hair of HAIRS) for (const e of EXPRESSIONS) expect(frames, `${hair} ${e}`).toContain(`${hair}.portrait.${e}`);
    // Only portraits: no unapproved body art ships for Ryan (story scenes show the phase portrait).
    expect(frames.every((k) => /^(curly|bald|wig)\.portrait\./.test(k))).toBe(true);
    expect(frames).toHaveLength(HAIRS.length * EXPRESSIONS.length);
    for (const hair of HAIRS) expect(poseFrames(RYAN_ID, 'idle', { hair, hat: false })).toEqual([]);
  });

  it('every cast member has a portrait for every expression and the core poses', () => {
    expect(CAST).toHaveLength(11);
    for (const ch of CAST) {
      for (const e of EXPRESSIONS) expect(sheetManifest(ch.id)!.frames[portraitKey(ch.id, e)], `${ch.id} ${e}`).toBeDefined();
      for (const pose of ['idle', 'talk', 'celebrate', 'disappointed'] as const) expect(poseFrames(ch.id, pose)[0]?.startsWith(`${pose}.`), `${ch.id} ${pose}`).toBe(true);
    }
    // A pose nobody drew falls back to idle instead of breaking.
    expect(poseFrames('biff_fairway', 'handshake')[0]).toBe('idle.0');
  });
});

describe('appearance', () => {
  it('older saves start in Act I with only the natural look, and nothing assumed done', () => {
    const c = E.newCareerState(3);
    delete c.story;
    delete c.appearance;
    expect(storyOf(c)).toEqual({ act: 1, hairUnlocked: ['curly'], encounters: {}, available: null, bonds: {} });
    expect(appearanceOf(c)).toEqual({ hair: 'curly', hat: false });
  });

  it('the look follows the phase: one approved look per phase, each with portraits and an on-course swing', () => {
    expect(resolveLook({ hair: 'wig', hat: true })).toMatchObject({ sheet: 'wig', hat: true, exact: true, gameplay: true, missing: [] });
    expect(resolveLook({ hair: 'bald', hat: false })).toMatchObject({ sheet: 'bald', hat: false, exact: true, gameplay: true, missing: [] });
    expect(resolveLook({ hair: 'curly', hat: false })).toMatchObject({ sheet: 'curly', hat: false, exact: true, gameplay: true, missing: [] });
    // A stored visor choice that the phase doesn't wear (older saves) still draws the phase's approved look.
    expect(resolveLook({ hair: 'curly', hat: true })).toMatchObject({ sheet: 'curly', hat: false, gameplay: true });
    expect(resolveLook({ hair: 'bald', hat: true })).toMatchObject({ sheet: 'bald', hat: false });
  });

  it('locked looks can’t be worn; unlocked ones save and survive a reload', async () => {
    const { s, dbName } = await newCareer();
    const c = await s.career.getCareer();
    expect(appearanceBlocker(c, { hair: 'wig', hat: true })).toMatch(/Act III/);
    await expect(s.career.setAppearance({ hair: 'bald', hat: false })).rejects.toThrow(/Act II/);
    await setCareer(s, (k) => (k.story = { ...storyOf(k), hairUnlocked: ['curly', 'bald'] }));
    await s.career.setAppearance({ hair: 'bald', hat: false });
    const s2 = await reload(s, dbName);
    expect((await s2.career.getCareer()).appearance).toEqual({ hair: 'bald', hat: false });
  });
});

describe('encounter scripts', () => {
  /** Every path through an encounter: choices × challenge results. */
  function allPaths(def: EncounterDef): string[][] {
    const out: string[][] = [];
    const go = (id: string, path: string[]) => {
      const n = def.nodes[id];
      if ('outcome' in n) return out.push(path);
      if ('next' in n) return go(n.next, path);
      if ('choice' in n) return n.choice.options.forEach((o) => go(o.next, [...path, o.id]));
      go(n.win, [...path, 'win']);
      go(n.lose, [...path, 'lose']);
    };
    go(def.start, []);
    return out;
  }

  it('every line has a known speaker with drawn art, every node is reachable, every outcome can happen', () => {
    for (const def of ENCOUNTERS) {
      const seen = new Set<string>();
      const outcomes = new Set<string>();
      for (const p of allPaths(def)) {
        const w = walkEncounter(def, p);
        expect(w.ok, `${def.id} ${p.join('>')}`).toBe(true);
        if (w.ok) {
          w.nodes.forEach((n) => seen.add(n));
          outcomes.add(w.outcome);
        }
      }
      expect([...seen].sort(), def.id).toEqual(Object.keys(def.nodes).sort());
      expect([...outcomes].sort(), def.id).toEqual(Object.keys(def.outcomes).sort());
      for (const n of Object.values(def.nodes)) {
        for (const l of n.lines) {
          expect(['narrator', RYAN_ID, ...def.cast], `${def.id}: ${l.text}`).toContain(l.who);
          expect(l.text.length).toBeGreaterThan(0);
          if (l.who !== 'narrator' && l.expr) expect(portraitKey(l.who, l.expr, { hair: 'curly', hat: true })).toMatch(new RegExp(`portrait\\.${l.expr}$`));
        }
      }
    }
  });

  it('only real endings are accepted', () => {
    const def = encounterById('gold_plated_driver')!;
    expect(walkEncounter(def, ['bet', 'win'])).toMatchObject({ ok: true, outcome: 'won_bet', stake: 200 });
    expect(walkEncounter(def, ['bet'])).toMatchObject({ ok: false });
    expect(walkEncounter(def, ['bet', 'jackpot'])).toMatchObject({ ok: false });
    expect(walkEncounter(def, ['walk', 'extra'])).toMatchObject({ ok: false });
  });
});

describe('the Gold-Plated Driver, end to end', () => {
  async function ready() {
    const { s, dbName } = await newCareer();
    await playTournament(s, 'amateur-1-w2');
    await setCareer(s, (c) => {
      c.pendingStory = null;
      c.week = 3;
    });
    await topUp(s, 1000, 'enc-test');
    await s.career.advanceWeek();
    return { s, dbName };
  }

  it('is offered after Ryan has played an event, not before', async () => {
    const { s } = await newCareer();
    await setCareer(s, (c) => (c.week = 4));
    expect(nextEncounter(await s.career.getCareer(), storyOf(await s.career.getCareer()))).toBeNull();
    const { s: t } = await ready();
    expect(storyOf(await t.career.getCareer()).available).toBe('gold_plated_driver');
  });

  it('applies its consequences exactly once, then never runs again', async () => {
    const { s, dbName } = await ready();
    const before = await s.economy.getBalance(RYAN);
    // Two clicks at once: one goes through, the other is refused.
    const [a, b] = await Promise.allSettled([s.career.resolveEncounter('gold_plated_driver', ['bet', 'win']), s.career.resolveEncounter('gold_plated_driver', ['bet', 'win'])]);
    expect([a.status, b.status].sort()).toEqual(['fulfilled', 'rejected']);
    expect(await s.economy.getBalance(RYAN)).toBe(before + 200);
    const c = await s.career.getCareer();
    expect(storyOf(c).encounters.gold_plated_driver).toMatchObject({ outcome: 'won_bet', path: ['bet', 'win'] });
    expect(storyOf(c).available).toBeNull();
    expect(storyOf(c).bonds.biff_fairway).toBe(46);
    expect(c.inbox[0].title).toBe('The Gold-Plated Driver');
    // After a reload it's still done, and still can't pay again.
    const s2 = await reload(s, dbName);
    await expect(s2.career.resolveEncounter('gold_plated_driver', ['walk'])).rejects.toThrow(/Already played/);
    expect(await s2.economy.getBalance(RYAN)).toBe(before + 200);
    expect(nextEncounter(await s2.career.getCareer(), storyOf(await s2.career.getCareer()))).toBeNull();
  });

  it("can't bet money Ryan doesn't have", async () => {
    const { s } = await ready();
    const bal = await s.economy.getBalance(RYAN);
    await s.economy.post({ ownerId: RYAN, amount: -(bal - 50), type: 'living_costs', sourceId: 'test', idempotencyKey: 'drain' });
    await expect(s.career.resolveEncounter('gold_plated_driver', ['bet', 'lose'])).rejects.toThrow(/\$200/);
    expect(await s.economy.getBalance(RYAN)).toBe(50);
  });

  it('leads to the Gold-Plated Putter four weeks after the bet, but not after walking away', async () => {
    const { s } = await ready();
    await s.career.resolveEncounter('gold_plated_driver', ['bet', 'lose']);
    for (let i = 0; i < 4; i++) {
      await setCareer(s, (c) => {
        c.pendingStory = null;
        c.active = null;
      });
      await s.career.advanceWeek();
    }
    expect(storyOf(await s.career.getCareer()).available).toBe('gold_plated_putter');

    const { s: t } = await ready();
    await t.career.resolveEncounter('gold_plated_driver', ['walk']);
    const c = await t.career.getCareer();
    c.week += 6;
    expect(nextEncounter(c, storyOf(c))).toBeNull();
  });
});

describe('skill challenges', () => {
  it("a great swing beats Biff at any power level; a bad one doesn't", () => {
    for (const power of [20, 45, 70, 95]) {
      const c = E.newCareerState(1);
      c.stats.power = power;
      expect(judgeDrive(c, { power: 1, accuracy: 0 }).win).toBe(true);
      expect(judgeDrive(c, { power: 0.3, accuracy: 0 }).win).toBe(false);
      expect(judgeDrive(c, { power: 1, accuracy: 0.9 })).toMatchObject({ lie: 'out of bounds', yards: 0, win: false });
      expect(opponentDrive(c)).toBeLessThan(maxDrive(c));
    }
  });

  it('putting: dead weight drops, way off misses; better putters get more room', () => {
    const c = E.newCareerState(1);
    expect(judgePutt(c, { pace: 0.5 }).win).toBe(true);
    expect(judgePutt(c, { pace: 0.95 }).win).toBe(false);
    const good = { ...c, stats: { ...c.stats, putting: 90 } };
    expect(judgePutt(good, { pace: 0.5 }).window).toBeGreaterThan(judgePutt(c, { pace: 0.5 }).window);
  });

  it('"Sim it" gives the same result every time for the same week', () => {
    const c = E.newCareerState(5);
    expect(simChallenge(c, 'drive', 'gold_plated_driver')).toEqual(simChallenge(c, 'drive', 'gold_plated_driver'));
  });
});
