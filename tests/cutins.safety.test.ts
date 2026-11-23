/**
 * CI-1 acceptance tests: isolation and gameplay safety (A1–A4, A24, A26).
 * Spec: "Live Tournament Cut-Ins — CI-1 Specification (Revision 2)".
 *
 * A24 and the bundle half of A26 need inputs from outside the repo:
 *   CI1_BASELINE=<sha256 manifest of the approved baseline>   (A24)
 *   CI1_BASELINE_SHA256=<that manifest file's own SHA-256>    (A24, optional; checked when set)
 *   CI1_BUNDLE_DIR=<a fresh production build>                 (A26)
 *   CI2_REVIEW_BUNDLE_DIR=<a fresh VITE_CUTINS=1 review build> (A26, CI-2 positive control)
 * Without them those checks are skipped, never reported as passed.
 * Since CI-1 Revision 3 the approved A24 baseline is the post-ace-fix tree
 * (582 files; manifest SHA-256 5968934d…3362). The allowlist is unchanged.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { checksum } from '../src/core/checksum';
import { applyTournamentResult } from '../src/career/engine';
import { seasonSchedule } from '../src/career/tournament';
import type { RoundMode } from '../src/career/types';
import { planRound } from '../src/cutins/plan';
import { revealSnapshot } from '../src/cutins/snapshot';
import type { Decision, ProfileId, RevealSnapshot } from '../src/cutins/types';
import { careerFor, eventsFor, runTournament, TOURS_ALL } from '../tools/cutins-lab/rates';

const ROOT = resolve(__dirname, '..');
const CUTINS = join(ROOT, 'src', 'cutins');
const cutinsFiles = readdirSync(CUTINS).filter((f) => f.endsWith('.ts')).map((f) => join(CUTINS, f));

/**
 * Runtime import graph (type-only imports skipped), following relative specifiers.
 * `skipDynamicFrom`: files whose dynamic `import()`s are not followed (the CI-2 gate).
 */
function runtimeGraph(entries: string[], skipDynamicFrom: ReadonlySet<string> = new Set()): Set<string> {
  const seen = new Set<string>();
  const stack = [...entries];
  const res = (from: string, spec: string) => {
    if (!spec.startsWith('.')) return null;
    const b = resolve(dirname(from), spec);
    for (const c of [b, `${b}.ts`, `${b}.tsx`, join(b, 'index.ts'), join(b, 'index.tsx')]) if (existsSync(c) && statSync(c).isFile()) return c;
    return null;
  };
  while (stack.length) {
    const f = stack.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/(?:^|\n)\s*(?:import|export)\s+(type\s+)?[^'"]*?from\s+['"]([^'"]+)['"]/g)) {
      if (m[1]) continue;
      const r = res(f, m[2]);
      if (r) stack.push(r);
    }
    for (const m of src.matchAll(/(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g)) {
      const r = res(f, m[1]);
      if (r) stack.push(r);
    }
    if (!skipDynamicFrom.has(f)) for (const m of src.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      const r = res(f, m[1]);
      if (r) stack.push(r);
    }
  }
  return seen;
}
const rel = (f: string) => relative(ROOT, f).split('\\').join('/');

describe('A1 — no physics: static scan of src/cutins', () => {
  const ALLOWED: Record<string, string[] | null> = {
    '../career/tournament': ['activeCourse', 'parsOf', 'previewRound', 'holesToPlay', 'type TournamentDef', 'TournamentDef'],
    '../career/config': null,
    '../career/types': null,
    '../golf/math': ['hashString'],
  };
  it('imports only the allowed modules and names', () => {
    for (const f of cutinsFiles) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/import\s+(type\s+)?\{([^}]*)\}\s+from\s+['"]([^'"]+)['"]/g)) {
        const spec = m[3];
        if (spec.startsWith('./')) continue;
        expect(Object.keys(ALLOWED), `${rel(f)} imports ${spec}`).toContain(spec);
        const names = ALLOWED[spec];
        if (names && !m[1]) for (const n of m[2].split(',').map((x) => x.trim()).filter(Boolean)) expect(names, `${rel(f)}: ${n} from ${spec}`).toContain(n);
      }
      expect(src).not.toMatch(/import\s+[^{'"]+from/); // no default or namespace imports
    }
  });
  it('never mentions the shot engine, the launch-speed cache, other layers, or ambient randomness/time', () => {
    const FORBIDDEN = ['simulateShot', 'launchSpeedFor', 'golf/physics', 'golf/ai', 'game/', 'broadcast/', 'ui/', 'services/', 'persistence/', 'story/', 'Math.random', 'Date.now', 'performance.now', 'new Date'];
    for (const f of cutinsFiles) {
      const src = readFileSync(f, 'utf8');
      for (const w of FORBIDDEN) expect(src.includes(w), `${rel(f)} contains ${w}`).toBe(false);
    }
  });
  it('the runtime import graph never reaches physics, the AI, the game scene, broadcast, UI, services, persistence or story', () => {
    const graph = [...runtimeGraph([join(CUTINS, 'index.ts')])].map(rel);
    expect(graph).toContain('src/career/tournament.ts');
    for (const f of graph) {
      expect(f).not.toMatch(/^src\/(golf\/physics|golf\/ai|game\/|broadcast\/|ui\/|services\/|persistence\/|story\/)/);
    }
  });
  it('planning a sample of real rounds calls Math.random zero times', () => {
    const spy = vi.spyOn(Math, 'random');
    let rounds = 0;
    for (const tour of TOURS_ALL) {
      const c = careerFor(tour, 9);
      for (const def of seasonSchedule(9).filter((d) => d.tour === tour).slice(0, 3)) {
        for (const rt of runTournament(def, c, 'full').rounds) {
          if (!rt.snap) continue;
          rounds++;
          for (const p of ['balanced', 'fullTv', 'off'] as ProfileId[]) planRound(rt.snap, p);
        }
      }
    }
    expect(rounds).toBeGreaterThan(20);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o as object)) deepFreeze(v);
  }
  return o;
}

describe('A2 — no mutation', () => {
  it('with active, def and career deep-frozen, snapshots and plans succeed and nothing changes', () => {
    let steps = 0;
    for (const mode of ['full', 'key'] as RoundMode[]) {
      for (const tour of TOURS_ALL) {
        const c = careerFor(tour, 12);
        const def = seasonSchedule(12).find((d) => d.tour === tour)!;
        runTournament(def, c, mode, {
          onHole: (_b, after, d, cc) => {
            const a = structuredClone(after);
            const dd = structuredClone(d);
            const c2 = structuredClone(cc);
            const sums = [checksum(a), checksum(dd), checksum(c2)];
            deepFreeze(a);
            deepFreeze(dd);
            deepFreeze(c2);
            const s = revealSnapshot(a, dd, c2);
            for (const p of ['balanced', 'fullTv', 'off'] as ProfileId[]) planRound(s, p);
            planRound(s, 'balanced', { exceptionalOverride: true });
            expect([checksum(a), checksum(dd), checksum(c2)]).toEqual(sums);
            steps++;
          },
        });
      }
    }
    expect(steps).toBeGreaterThan(50);
  });
});

describe('A3 — gameplay identity: CI-1 enabled vs absent', () => {
  const PER_TOUR = Number(process.env.CI1_A3_PER_TOUR ?? 500);
  it(`${PER_TOUR} seeded tournaments per tour, full, key and sim modes: identical results, standings, payouts, points and career state`, () => {
    const spy = vi.spyOn(Math, 'random');
    let n = 0;
    let boundaries = 0;
    for (const mode of ['full', 'key', 'sim'] as RoundMode[]) {
      for (const tour of TOURS_ALL) {
        let count = 0;
        for (const { def, career } of eventsFor(tour, 100000)) {
          if (count++ >= PER_TOUR) break;
          const c1 = structuredClone(career);
          const c2 = structuredClone(career);
          spy.mockClear();
          const absent = runTournament(def, c1, mode, { noSnapshots: true });
          const randomAbsent = spy.mock.calls.length;
          spy.mockClear();
          const enabled = runTournament(def, c2, mode, { withCutins: true, profiles: ['balanced', 'fullTv', 'off'], onHole: () => boundaries++ });
          expect(spy.mock.calls.length).toBe(randomAbsent);
          expect(enabled.result.authority.checksum).toBe(absent.result.authority.checksum);
          expect(JSON.stringify(enabled.result)).toBe(JSON.stringify(absent.result));
          expect(JSON.stringify(enabled.final)).toBe(JSON.stringify(absent.final));
          expect(JSON.stringify(c2)).toBe(JSON.stringify(c1));
          const o1 = applyTournamentResult(structuredClone(career), absent.result);
          const o2 = applyTournamentResult(structuredClone(career), enabled.result);
          expect(JSON.stringify(o2)).toBe(JSON.stringify(o1));
          n++;
        }
      }
    }
    spy.mockRestore();
    expect(n).toBe(PER_TOUR * TOURS_ALL.length * 3);
    expect(boundaries).toBeGreaterThan(PER_TOUR * 10);
  }, 1_800_000);
});

describe('A4 — no future results (1,000 fuzzed cases)', () => {
  it('randomising every hole after q never changes any decision at or before q', () => {
    let x = 20261121;
    const rand = (k: number) => {
      x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
      return x % k;
    };
    const pool: RevealSnapshot[] = [];
    for (const mode of ['full', 'key'] as RoundMode[]) for (const tour of TOURS_ALL) {
      const c = careerFor(tour, 21);
      for (const def of seasonSchedule(21).filter((d) => d.tour === tour).slice(0, 4)) for (const rt of runTournament(def, c, mode).rounds) if (rt.snap) pool.push(rt.snap);
    }
    expect(pool.length).toBeGreaterThan(40);
    const upTo = (p: Decision[], q: number) => p.filter((d) => d.q <= q);
    for (let k = 0; k < 1000; k++) {
      const s = pool[rand(pool.length)];
      const q = s.boundaries[rand(s.boundaries.length)];
      const holes = Object.fromEntries(Object.entries(s.holes).map(([id, h]) => [id, h.map((v, i) => (i < q ? v : 1 + rand(8)))]));
      const fuzzed: RevealSnapshot = { ...s, holes };
      for (const p of ['balanced', 'fullTv'] as ProfileId[]) expect(upTo(planRound(fuzzed, p), q)).toEqual(upTo(planRound(s, p), q));
    }
  });
});

describe('A24 — untouched code: SHA-256 manifest against the approved baseline', () => {
  const baseline = process.env.CI1_BASELINE;
  const baselineSha = process.env.CI1_BASELINE_SHA256;
  it.runIf(!!baseline && !!baselineSha)('the baseline manifest is the approved one (its own SHA-256 matches)', () => {
    expect(createHash('sha256').update(readFileSync(baseline!)).digest('hex')).toBe(baselineSha);
  });
  const AUTHORISED = [/^src\/cutins\//, /^tests\/cutins\.[a-z]+\.test\.ts$/, /^tests\/fixtures\/cutins-[a-z0-9]+\.json$/, /^tools\/cutins-lab\//, /^cutins-lab-output\//];
  const SKIP_DIRS = new Set(['node_modules', 'dist', 'dist-single', 'dist-site']);
  it.runIf(!!baseline)('every file outside the authorised CI-1 list is byte-identical to the baseline', () => {
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
          if (d === ROOT && SKIP_DIRS.has(e.name)) continue;
          walk(p);
        } else if (e.isFile()) now.set(rel(p), createHash('sha256').update(readFileSync(p)).digest('hex'));
      }
    };
    walk(ROOT);
    const changed: string[] = [];
    const added: string[] = [];
    const removed: string[] = [];
    for (const [f, h] of now) {
      if (!before.has(f)) added.push(f);
      else if (before.get(f) !== h) changed.push(f);
    }
    for (const f of before.keys()) if (!now.has(f)) removed.push(f);
    const unauthorised = (f: string) => !AUTHORISED.some((r) => r.test(f));
    expect(changed.filter(unauthorised), 'changed outside CI-1').toEqual([]);
    expect(added.filter(unauthorised), 'added outside CI-1').toEqual([]);
    expect(removed, 'removed').toEqual([]);
    expect(before.get('src/golf/physics.ts')).toBe(now.get('src/golf/physics.ts'));
    console.log(`A24: ${before.size} baseline files, ${now.size} now; ${added.length} added (all CI-1), ${changed.length} changed (all CI-1), 0 removed`);
  });
});

describe('A26 — the default release build carries no CI-1 code (CI-2: the review build loads it behind VITE_CUTINS)', () => {
  // Adjusted for CI-2 as approved (author directive, 2026-11-22): the default release bundle stays
  // CI-1-free; a development/review build may load CI-1 and CI-2 behind the VITE_CUTINS flag.
  const GATE = 'src/ui/tournament/useCutIn.ts';
  it('the app entry reaches src/cutins only through the CI-2 gate\'s single flag-guarded dynamic import', () => {
    const graph = [...runtimeGraph([join(ROOT, 'src', 'main.tsx')], new Set([join(ROOT, GATE)]))].map(rel);
    expect(graph.length).toBeGreaterThan(50);
    expect(graph.filter((f) => f.startsWith('src/cutins/'))).toEqual([]);
    expect(graph.filter((f) => f === 'src/ui/tournament/CutInCard.tsx' || f === 'src/ui/tournament/cutinCopy.ts')).toEqual([]);
    expect(graph).toContain('src/career/tournament.ts');
    expect(graph).toContain(GATE);
    const code = readFileSync(join(ROOT, GATE), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(code).toMatch(/export const CUTINS_ENABLED = import\.meta\.env\.VITE_CUTINS === '1';/);
    const dynamic = [...code.matchAll(/(typeof\s+)?import\(\s*['"]([^'"]+)['"]\s*\)/g)].filter((m) => !m[1]).map((m) => m[2]);
    expect(dynamic).toEqual(['./CutInCard']);
    expect(code).toMatch(/return CUTINS_ENABLED \? \(runtime \?\?= import\('\.\/CutInCard'\)\) : null;/);
    // No static runtime import of CI-1 or of the cut-in runtime anywhere in the gate.
    for (const m of code.matchAll(/(?:^|\n)\s*import\s+(type\s+)?[^'"]*?from\s+['"]([^'"]+)['"]/g)) {
      if (m[1]) continue;
      expect(m[2]).not.toMatch(/cutins|CutInCard|cutinCopy/);
    }
  });
  const bundle = process.env.CI1_BUNDLE_DIR;
  const CI_STRINGS = ['ryans-road.cutins', 'LEADER_STUMBLE', 'revealSnapshot', 'suppressed_cooldown', 'LEADER STUMBLES', 'RIVAL WATCH'];
  const bundleFiles = (dir: string) => {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(js|html|css|mjs)$/.test(e.name)) files.push(p);
      }
    };
    walk(dir);
    return files;
  };
  it.runIf(!!bundle)('a fresh default production bundle contains no CI-1 or CI-2 strings', () => {
    const files = bundleFiles(bundle!);
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      for (const w of CI_STRINGS) expect(src.includes(w), `${f} contains ${w}`).toBe(false);
    }
  });
  const review = process.env.CI2_REVIEW_BUNDLE_DIR;
  it.runIf(!!review)('positive control: the VITE_CUTINS=1 review bundle does carry the cut-in runtime', () => {
    const all = bundleFiles(review!).map((f) => readFileSync(f, 'utf8')).join('\n');
    for (const w of CI_STRINGS) expect(all.includes(w), `review bundle lacks ${w}`).toBe(true);
  });
});
