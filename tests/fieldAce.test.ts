/**
 * Competitor ace-frequency correction: acceptance tests F1–F9.
 * Plan: "Competitor Ace-Frequency Correction Plan" (22 Nov 2026), Option A,
 * per-attempt calibration, Ryan's simulated holes included, S2 model marker.
 *
 * F6, F7's byte-identity half and F9 need inputs from outside the repo:
 *   ACEFIX_REFERENCE=<results recorded from the pre-change engine>
 *   ACEFIX_BASELINE=<SHA-256 manifest taken before the change>
 * Without them those checks are skipped, never reported as passed.
 */
import 'fake-indexeddb/auto';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { careerStats } from '../src/career/careerStats';
import { applyTournamentResult } from '../src/career/engine';
import { aceChance, holedLongShotChance, simHole, type FieldModel } from '../src/career/field';
import {
  activeCourse,
  completeRound,
  ENGINE_VERSION,
  fieldModelOf,
  finalizeTournament,
  holesToPlay,
  LEGACY_ENGINE_VERSION,
  parsOf,
  pressureFor,
  previewRound,
  startTournament,
  type TournamentDef,
  type TournamentResult,
} from '../src/career/tournament';
import type { ActiveTournament, CareerState, RoundMode } from '../src/career/types';
import { checksum } from '../src/core/checksum';
import { rng } from '../src/golf/math';
import { CareerStateSchema, TournamentResultSchema } from '../src/persistence/schemas';
import { careerFor, eventsFor, TOURS_ALL } from '../tools/cutins-lab/rates';
import { setCareer } from './careerHelpers';
import { newCareer, reload } from './helpers';

const ROOT = resolve(__dirname, '..');

/**
 * The CI-1 tournament driver (tools/cutins-lab/rates.ts runTournament), with
 * the model chosen: model 1 removes the marker, as on a pre-update save.
 */
function play(def: TournamentDef, c: CareerState, mode: RoundMode, model: FieldModel) {
  let a: ActiveTournament = startTournament(def, c, mode);
  if (model === 1) delete a.fieldModel;
  const pressure: number[] = [];
  while (a.round < def.rounds) {
    pressure.push(pressureFor(a, def));
    if (a.alive.includes(c.playerId)) {
      const PARS = parsOf(activeCourse(a));
      const ryanSim = previewRound(a, def, c)[c.playerId];
      for (const i of holesToPlay(mode, a.round, PARS)) a = { ...a, playerHoles: a.playerHoles.map((h, j) => (j === i ? ryanSim[i] : h)) };
    }
    a = completeRound(a, def, c);
  }
  return { result: finalizeTournament(a, def, c.playerId), final: a, pressure };
}

describe('F1 — same random sequence: exactly 7 draws per hole on both models', () => {
  it('1,000,000 holes across pars 3–5, ratings 10–100, wind and difficulty', () => {
    const pick = rng(20261122);
    for (let k = 0; k < 1_000_000; k++) {
      const par = 3 + Math.floor(pick.next() * 3);
      const rating = 10 + pick.next() * 90;
      const wind = pick.next() * 25;
      const extra = pick.next() * 0.5;
      const seed = Math.floor(pick.next() * 2 ** 32);
      const a = rng(seed);
      const b = rng(seed);
      simHole(par, rating, a, wind, extra, 1);
      simHole(par, rating, b, wind, extra, 2);
      const ref = rng(seed);
      for (let i = 0; i < 7; i++) ref.next();
      const next = ref.next();
      expect(a.next()).toBe(next);
      expect(b.next()).toBe(next);
    }
  }, 300_000);
});

describe('F3 — calibrated rate', () => {
  for (const rating of [35, 48, 63, 78, 90]) {
    it(`rating ${rating}: ace rate over 2,000,000 par-3 draws within the 99% interval of 1 in ${Math.round(1 / aceChance(rating))}`, () => {
      const N = 2_000_000;
      const p = aceChance(rating);
      const r = rng(rating * 7919 + 1);
      let aces = 0;
      for (let i = 0; i < N; i++) if (simHole(3, rating, r, (i % 20), (i % 7) * 0.05, 2) === 1) aces++;
      const mean = N * p;
      const z = 2.5758 * Math.sqrt(N * p * (1 - p));
      expect(Math.abs(aces - mean)).toBeLessThanOrEqual(z);
    });
  }
  it('the curve: 1 in 3,000 at rating 78, about 1 in 5,000 at 35', () => {
    expect(1 / aceChance(78)).toBeCloseTo(3000, 6);
    expect(Math.round(1 / aceChance(35))).toBe(5015);
  });
});

describe('F4 — skill-model floor on par 3; par 4 and par 5 unchanged', () => {
  it('model 2 par 3 gives 1 exactly when the first draw is under aceChance, and never below 1', () => {
    const r0 = rng(77);
    let aces = 0;
    for (let k = 0; k < 2_000_000; k++) {
      const seed = Math.floor(r0.next() * 2 ** 32);
      const rating = 10 + (k % 91);
      const u = rng(seed).next();
      const s = simHole(3, rating, rng(seed), k % 15, 0, 2);
      expect(s).toBeGreaterThanOrEqual(1);
      expect(s === 1).toBe(u < aceChance(rating));
      if (s === 1) aces++;
    }
    expect(aces).toBeGreaterThan(0);
  }, 300_000);
  it('par 4 and par 5 outcomes (including par-4 aces and albatrosses) are identical on both models', () => {
    const r0 = rng(78);
    let rare = 0;
    for (let k = 0; k < 1_000_000; k++) {
      const seed = Math.floor(r0.next() * 2 ** 32);
      const par = k % 2 ? 4 : 5;
      const rating = 10 + (k % 91);
      const a = simHole(par, rating, rng(seed), k % 15, 0.1, 1);
      expect(simHole(par, rating, rng(seed), k % 15, 0.1, 2)).toBe(a);
      if (a === par - 3) rare++;
    }
    expect(holedLongShotChance(3, 80)).toBe(0);
    expect(rare).toBeGreaterThan(0);
  }, 300_000);
});

describe('F2 and F5 — 5,000 tournaments per tour, same seeds, model 1 vs model 2', () => {
  const PER_TOUR = Number(process.env.ACEFIX_PER_TOUR ?? 5000);
  const stats: Record<string, { strokes: [number, number]; rounds: [number, number]; changed: number; holes: number; ryanSkipped: number }> = {};
  let violations: string[] = [];
  it(`F2: every par-4/5 hole identical; a par-3 hole differs only when either score is an ace (${PER_TOUR} per tour)`, () => {
    for (const tour of TOURS_ALL) {
      const st = (stats[tour] = { strokes: [0, 0], rounds: [0, 0], changed: 0, holes: 0, ryanSkipped: 0 });
      let n = 0;
      for (const { def, career } of eventsFor(tour, 100000)) {
        if (n++ >= PER_TOUR) break;
        const A = play(def, career, 'full', 1);
        const B = play(def, career, 'full', 2);
        const pars = A.result.pars;
        for (const [arm, R] of [[0, A.result], [1, B.result]] as [0 | 1, TournamentResult][]) {
          for (const [id, rounds] of Object.entries(R.scores)) {
            if (id === career.playerId) continue;
            for (const rd of rounds) {
              st.rounds[arm]++;
              st.strokes[arm] += rd.reduce((x, y) => x + y, 0);
            }
          }
        }
        for (const [id, ra] of Object.entries(A.result.scores)) {
          const rb = B.result.scores[id];
          for (let ri = 0; ri < Math.min(ra.length, rb.length); ri++) {
            if (id === career.playerId && A.pressure[ri] !== B.pressure[ri]) {
              st.ryanSkipped++;
              continue;
            }
            for (let i = 0; i < pars.length; i++) {
              st.holes++;
              const x = ra[ri][i];
              const y = rb[ri][i];
              if (x === y) continue;
              st.changed++;
              if (pars[i] !== 3 || (x !== 1 && y !== 1)) violations.push(`${def.id} ${id} r${ri + 1} h${i + 1}: ${x} -> ${y}`);
            }
          }
        }
      }
    }
    expect(violations.slice(0, 5)).toEqual([]);
    console.log('F2', JSON.stringify(Object.fromEntries(Object.entries(stats).map(([t, s]) => [t, { holes: s.holes, changed: s.changed, ryanRoundsSkippedForPressure: s.ryanSkipped }]))));
  }, 1_800_000);
  it('F5: mean strokes per golfer-round moves by less than 0.02 on every tour', () => {
    const out: Record<string, number> = {};
    for (const [tour, s] of Object.entries(stats)) {
      const d = s.strokes[1] / s.rounds[1] - s.strokes[0] / s.rounds[0];
      out[tour] = +d.toFixed(4);
      expect(Math.abs(d)).toBeLessThan(0.02);
    }
    expect(Object.keys(out)).toHaveLength(5);
    console.log('F5', JSON.stringify(out));
  });
});

describe('F7 — in-progress policy (S2 model marker)', () => {
  it('new tournaments carry the marker; results seal stroke-1.3; a tournament without the marker seals stroke-1.2', () => {
    const c = careerFor('lpga', 3);
    const def = [...eventsFor('lpga', 3)].find((e) => e.def.season === 3)!.def;
    const a = startTournament(def, c, 'full');
    expect(a.fieldModel).toBe(2);
    expect([ENGINE_VERSION, LEGACY_ENGINE_VERSION]).toEqual(['stroke-1.3', 'stroke-1.2']);
    expect(play(def, c, 'full', 2).result.authority.engineVersion).toBe('stroke-1.3');
    expect(play(def, c, 'full', 1).result.authority.engineVersion).toBe('stroke-1.2');
  });
  it('the marker survives completeRound, mode changes, JSON round trips and save-schema parsing; its absence survives too', () => {
    const c = careerFor('epson', 4);
    const def = [...eventsFor('epson', 4)].find((e) => e.def.season === 4)!.def;
    let marked = startTournament(def, c, 'key');
    let legacy: ActiveTournament = startTournament(def, c, 'key');
    delete legacy.fieldModel;
    for (let r = 0; r < def.rounds; r++) {
      marked = JSON.parse(JSON.stringify(completeRound({ ...marked, mode: r % 2 ? 'full' : 'key' }, def, c)));
      legacy = JSON.parse(JSON.stringify(completeRound({ ...legacy, mode: r % 2 ? 'full' : 'key' }, def, c)));
      expect(fieldModelOf(marked)).toBe(2);
      expect('fieldModel' in legacy).toBe(false);
    }
    const parsed = CareerStateSchema.parse({ ...c, active: marked }) as unknown as CareerState;
    expect(parsed.active?.fieldModel).toBe(2);
    const parsedLegacy = CareerStateSchema.parse({ ...c, active: legacy }) as unknown as CareerState;
    expect(parsedLegacy.active && 'fieldModel' in parsedLegacy.active).toBe(false);
  });
  it('through the real services and a reload: a new tournament stays on model 2; a pre-update save finishes on model 1', async () => {
    for (const legacyArm of [false, true]) {
      const { s, dbName } = await newCareer();
      await setCareer(s, (c) => { c.week = 2; });
      await s.career.enterTournament('amateur-1-w2', 'full');
      if (legacyArm) await setCareer(s, (c) => { delete c.active!.fieldModel; });
      await s.career.recordHole(0, 4);
      await s.career.setMode('key');
      const s2 = await reload(s, dbName);
      const mid = await s2.career.getCareer();
      expect(mid.active?.fieldModel).toBe(legacyArm ? undefined : 2);
      let out = await s2.career.finishRound();
      for (let i = 0; i < 6 && !out.result; i++) out = await s2.career.finishRound();
      expect(out.result?.authority.engineVersion).toBe(legacyArm ? 'stroke-1.2' : 'stroke-1.3');
      s2.db.close();
    }
  });

  const refPath = process.env.ACEFIX_REFERENCE;
  it.runIf(!!refPath)('a tournament without the marker plays out byte-identical to the pre-change engine (180 tournaments, full/key/sim)', () => {
    const ref = JSON.parse(readFileSync(refPath!, 'utf8'));
    // Career Legacy V1 renamed one event's display name (author-approved): the week-6
    // top-tour major. The reference was recorded under the old name, so a renamed
    // event replays under the name it was recorded with; anything else differing fails.
    const APPROVED_RENAMES: Record<string, [string, string]> = { 'lpga:6': ['The Desert Major', 'The Desert Rose Invitational'] };
    let n = 0;
    let renamed = 0;
    for (const run of ref.runs) {
      const { def, career } = [...eventsFor(run.tour, run.season)].find((e) => e.def.id === run.defId)!;
      let replayDef = def;
      if (def.name !== run.result.def.name) {
        expect(APPROVED_RENAMES[`${def.tour}:${def.week}`]).toEqual([run.result.def.name, def.name]);
        replayDef = { ...def, name: run.result.def.name };
        expect(replayDef).toEqual(run.result.def); // the name is the only difference
        // The name plays no part in the simulation: today's event plays the identical tournament.
        const { authority: _now, ...today } = play(def, structuredClone(career), run.mode, 1).result;
        const { authority: _ref, ...recorded } = run.result as TournamentResult;
        expect(JSON.stringify({ ...today, def: { ...today.def, name: run.result.def.name } })).toBe(JSON.stringify(recorded));
        renamed++;
      }
      const replay = play(replayDef, structuredClone(career), run.mode, 1).result;
      expect(JSON.stringify(replay)).toBe(JSON.stringify(run.result));
      n++;
    }
    expect(n).toBe(180);
    expect(renamed).toBe(3);
  }, 600_000);
});

describe('F6 — history untouched', () => {
  const refPath = process.env.ACEFIX_REFERENCE;
  it.runIf(!!refPath)('stored pre-change results still validate and verify; career stats and outcomes (achievements) are identical', () => {
    const ref = JSON.parse(readFileSync(refPath!, 'utf8'));
    const results: TournamentResult[] = ref.runs.map((r: { result: TournamentResult }) => r.result);
    let holeInOne = 0;
    for (const run of ref.runs) {
      const R: TournamentResult = run.result;
      expect(TournamentResultSchema.safeParse(R).success).toBe(true);
      const { authority, ...unsealed } = R;
      expect(checksum(unsealed)).toBe(authority.checksum);
      expect(authority.engineVersion).toBe('stroke-1.2');
      const career = careerFor(run.tour, 1000 + run.season);
      const outcome = applyTournamentResult(structuredClone(career), R);
      expect(JSON.stringify(outcome)).toBe(JSON.stringify(run.outcome));
      if (JSON.stringify(outcome).includes('hole_in_one')) holeInOne++;
    }
    expect(JSON.stringify(careerStats(results, results[0].playerId))).toBe(JSON.stringify(ref.stats));
    expect(holeInOne).toBe(6);
  }, 600_000);
});

describe('F8 — determinism', () => {
  it('same seed, same model: identical results in full, key and sim mode on repeated runs', () => {
    let n = 0;
    for (const mode of ['full', 'key', 'sim'] as RoundMode[]) for (const tour of TOURS_ALL) {
      let k = 0;
      for (const { def, career } of eventsFor(tour, 3)) {
        if (k++ >= 6) break;
        for (const model of [1, 2] as FieldModel[]) {
          const x = play(def, structuredClone(career), mode, model);
          const y = play(def, structuredClone(career), mode, model);
          expect(JSON.stringify(y.result)).toBe(JSON.stringify(x.result));
          n++;
        }
      }
    }
    expect(n).toBe(3 * 5 * 6 * 2);
  });
});

describe('F9 — only the authorised files changed (SHA-256 manifest)', () => {
  const baseline = process.env.ACEFIX_BASELINE;
  const MAY_CHANGE = ['src/career/field.ts', 'src/career/tournament.ts', 'src/career/types.ts', 'cutins-lab-output/rates.json'];
  const MAY_ADD = ['tests/fieldAce.test.ts'];
  const SKIP = new Set(['node_modules', 'dist', 'dist-single', 'dist-site']);
  it.runIf(!!baseline)('every other file is byte-identical to the pre-change baseline', () => {
    const before = new Map<string, string>();
    for (const line of readFileSync(baseline!, 'utf8').split('\n')) {
      const m = line.match(/^([0-9a-f]{64})\s+\.\/(.+)$/);
      if (m) before.set(m[2], m[1]);
    }
    const now = new Map<string, string>();
    const walk = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, e.name);
        if (e.isDirectory()) {
          if (d === ROOT && SKIP.has(e.name)) continue;
          walk(p);
        } else if (e.isFile()) now.set(relative(ROOT, p).split('\\').join('/'), createHash('sha256').update(readFileSync(p)).digest('hex'));
      }
    };
    walk(ROOT);
    const changed = [...now].filter(([f, h]) => before.has(f) && before.get(f) !== h).map(([f]) => f);
    const added = [...now.keys()].filter((f) => !before.has(f));
    const removed = [...before.keys()].filter((f) => !now.has(f));
    expect(changed.filter((f) => !MAY_CHANGE.includes(f))).toEqual([]);
    expect(added.filter((f) => !MAY_ADD.includes(f))).toEqual([]);
    expect(removed).toEqual([]);
    expect(now.get('src/golf/physics.ts')).toBe(before.get('src/golf/physics.ts'));
    console.log(`F9: ${before.size} baseline files; changed ${JSON.stringify(changed)}; added ${JSON.stringify(added)}`);
  });
});
