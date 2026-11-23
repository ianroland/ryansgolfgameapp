/**
 * Broadcast Phase 1 proof of concept: record fidelity, replay, result exits,
 * camera placement, and the guarantee that nothing in src/broadcast can reach
 * the golf engine. (Browser-level parity and input tests run in the lab
 * harness; see tools/broadcast-lab.)
 */
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { planShot, planToInput } from '../src/golf/ai';
import { surfaceAt, type HoleDef } from '../src/golf/course';
import { COURSES } from '../src/golf/courses';
import { dist, pointAlongPolyline, polylineLength, rng, type Vec2 } from '../src/golf/math';
import { simulateShot, type ShotResult } from '../src/golf/physics';
import { captureShotRecord, recordFromJSON, recordToJSON, recordToShotResult, sampleAt, sampleCount, verifyShotRecord, type ShotRecord } from '../src/broadcast/shotRecord';
import { bytesOf, decode, encodeFloat32, encodeInt16, maxError } from '../src/broadcast/quantise';
import { planReplay, positionAt, replayFrameAt, LIVE_SAMPLES_PER_SEC } from '../src/broadcast/replayPlayer';
import { resultStep, ResultGate, type ResultInput } from '../src/broadcast/resultFlow';
import { FLAG_HEIGHT, GREEN_CAM, greenCamPose, placeGreenCam, placementProblem, project, PIN_SAFE_X, FLAG_TOP_MIN_Y } from '../src/broadcast/greenCam';
import { isApproach, PocDirector } from '../src/broadcast/director';
import { broadcastConfigFromSearch, DEFAULT_BROADCAST, type GreenCamAngle, type GreenCamCandidate } from '../src/broadcast/config';

const ALL_HOLES: HoleDef[] = COURSES.flatMap((c) => c.holes);
const OUT = join(__dirname, '..', 'broadcast-lab-output');

/** A point on the hole's centreline about `yards` from the pin (or the tee, if the hole is shorter). */
function approachSpot(h: HoleDef, yards: number): Vec2 {
  const L = polylineLength(h.centerline);
  let best: Vec2 = h.centerline[0];
  for (let a = 0; a <= L; a += 1) {
    const p = pointAlongPolyline(h.centerline, a);
    if (Math.abs(dist(p, h.pin) - yards) < Math.abs(dist(best, h.pin) - yards)) best = p;
  }
  return best;
}

interface Sample {
  hole: HoleDef;
  res: ShotResult;
  rec: ShotRecord;
}

/** 1,000 seeded approach shots across every course, simulated by the real engine. */
function seededApproaches(n = 1000): Sample[] {
  const r = rng(20261121);
  const out: Sample[] = [];
  for (let i = 0; i < n; i++) {
    const hole = ALL_HOLES[Math.floor(r.next() * ALL_HOLES.length)];
    const start = approachSpot(hole, 120 + r.next() * 60);
    const lie = surfaceAt(hole, start) === 'water' ? 'fairway' : surfaceAt(hole, start);
    const wind = { heading: r.next() * Math.PI * 2, mph: r.next() * 15 };
    const plan = planShot(hole, start, lie, wind, 1, false, true);
    const input = planToInput(plan, start, lie, wind, 1, r);
    input.heading += r.gauss() * 0.04;
    input.power = Math.max(0.05, Math.min(1, input.power * (1 + r.gauss() * 0.05)));
    const res = simulateShot(hole, { ...input, rng: rng(1000 + i) });
    const rec = captureShotRecord(
      { holeNumber: hole.number, holeName: hole.name, pin: hole.pin, club: input.club, putt: input.club === 'PT', start, shotHeading: input.heading },
      res,
    );
    out.push({ hole, res, rec });
  }
  return out;
}

const SAMPLES = seededApproaches();

describe('Test 1 — full-precision record fidelity', () => {
  it('copies every sample and result field bit-for-bit, for 1,000 seeded approach shots', () => {
    for (const { res, rec } of SAMPLES) {
      expect(sampleCount(rec)).toBe(res.path.length);
      res.path.forEach((p, i) => {
        const q = sampleAt(rec, i);
        expect(Object.is(q.x, p.x) && Object.is(q.y, p.y) && Object.is(q.z, p.z)).toBe(true);
      });
      expect(rec.landingIndex).toBe(res.landingIndex);
      expect(rec.outcome).toBe(res.outcome);
      expect(rec.end).toEqual(res.end);
      expect(rec.nextLie).toEqual(res.nextLie);
      expect(rec.endSurface).toBe(res.endSurface);
      expect(rec.penaltyStrokes).toBe(res.penaltyStrokes);
      expect([rec.carry, rec.total, rec.apex, rec.spinBack]).toEqual([res.carry, res.total, res.apex, res.spinBack]);
      expect(rec.hitTree).toBe(res.hitTree);
      expect(verifyShotRecord(rec)).toBe(true);
      // Playback copy is identical to what the engine returned.
      expect(recordToShotResult(rec)).toEqual(res);
    }
  });

  it('detects tampering, and survives a JSON round trip exactly', () => {
    const rec = SAMPLES[0].rec;
    const back = recordFromJSON(recordToJSON(rec));
    expect(verifyShotRecord(back)).toBe(true);
    expect(Array.from(back.path)).toEqual(Array.from(rec.path));
    // Negative zero survives too (JSON alone would turn it into 0).
    const z = { ...rec, path: Float64Array.from([-0, 0, -0]), end: { x: -0, y: 1 } };
    const zb = recordFromJSON(recordToJSON(z));
    expect(Object.is(zb.path[0], -0) && Object.is(zb.path[1], 0) && Object.is(zb.end.x, -0)).toBe(true);
    for (const { rec: r } of SAMPLES) {
      const b2 = recordFromJSON(recordToJSON(r));
      expect(Array.from(b2.path).every((v, i) => Object.is(v, r.path[i]))).toBe(true);
    }
    const bad = { ...rec, path: Float64Array.from(rec.path) };
    bad.path[10] += 0.001;
    expect(verifyShotRecord(bad)).toBe(false);
    expect(verifyShotRecord({ ...rec, outcome: 'holed' })).toBe(rec.outcome === 'holed');
  });
});

describe('Test 1b — quantisation experiment (report only; nothing adopted)', () => {
  it('measures each encoding, and never clips: out-of-range or non-finite values fall back to Float32', () => {
    const encodings = [
      { name: 'Int16 0.05 yd', enc: (p: Float64Array) => encodeInt16(p, 0.05) },
      { name: 'Int16 0.01 yd', enc: (p: Float64Array) => encodeInt16(p, 0.01) },
      { name: 'Float32', enc: (p: Float64Array) => encodeFloat32(p) },
    ];
    const report = encodings.map(({ name, enc }) => {
      const errs: number[] = [];
      let bytes = 0;
      let fallbacks = 0;
      for (const { rec } of SAMPLES) {
        const e = enc(rec.path);
        if (name.startsWith('Int16') && e.encoding === 'f32') fallbacks++;
        bytes += bytesOf(e);
        errs.push(maxError(rec.path, decode(e)));
      }
      errs.sort((a, b) => a - b);
      const worst = errs[errs.length - 1];
      const p99 = errs[Math.floor(errs.length * 0.99)];
      // On-screen error at the pin for each green-side candidate (FOCAL 540 / distance).
      const px = Object.fromEntries(Object.entries(GREEN_CAM).map(([k, c]) => [k, +((worst * 540) / c.d).toFixed(3)]));
      return { encoding: name, worstYd: +worst.toFixed(6), p99Yd: +p99.toFixed(6), avgBytes: Math.round(bytes / SAMPLES.length), int16Fallbacks: fallbacks, worstPxAtPin: px };
    });
    mkdirSync(OUT, { recursive: true });
    writeFileSync(join(OUT, 'quantisation.json'), JSON.stringify(report, null, 2));
    // Int16 error is bounded by half a step per axis.
    expect(report[0].worstYd).toBeLessThanOrEqual((0.05 / 2) * Math.sqrt(3) + 1e-9);
    expect(report[1].worstYd).toBeLessThanOrEqual((0.01 / 2) * Math.sqrt(3) + 1e-9);

    const far = new Float64Array([0, 0, 0, 2000, 0, 0]);
    expect(encodeInt16(far, 0.05).encoding).toBe('f32');
    const nan = new Float64Array([0, 0, 0, NaN, 0, 0]);
    expect(encodeInt16(nan, 0.05).encoding).toBe('f32');
  });
});

describe('Test 2 — replay reproduces the stored result', () => {
  it('ends every replay exactly on the last stored sample, which is where Classic leaves the ball', () => {
    let endMismatch = 0;
    for (const { hole, rec } of SAMPLES) {
      const green = isApproach(rec) ? placeGreenCam(hole, rec.meta.start, 'C', 'offset30') : null;
      const plan = planReplay(rec, green);
      const last = replayFrameAt(rec, plan, plan.totalSec + 1);
      expect(last.done).toBe(true);
      const lastSample = sampleAt(rec, sampleCount(rec) - 1);
      expect(last.pos).toEqual(lastSample);
      // Two runs give identical frames.
      for (const t of [0, 0.1, 0.7, plan.totalSec / 2, plan.totalSec - 0.01]) {
        expect(replayFrameAt(rec, plan, t)).toEqual(replayFrameAt(rec, plan, t));
      }
      if (dist(lastSample, rec.end) > 1e-9) endMismatch++;
    }
    // Recorded for the report: the engine's `end` can differ from its last path
    // sample (e.g. water entry). The replay shows the last sample, exactly as
    // Classic does at finishShot; the result itself is never re-derived.
    mkdirSync(OUT, { recursive: true });
    writeFileSync(join(OUT, 'replay-end-check.json'), JSON.stringify({ shots: SAMPLES.length, lastSampleNotEqualEnd: endMismatch }, null, 2));
  });

  it('never re-derives the result: integer indices return stored samples exactly', () => {
    const rec = SAMPLES[3].rec;
    for (let i = 0; i < sampleCount(rec); i++) expect(positionAt(rec, i)).toEqual(sampleAt(rec, i));
  });
});

describe('Test 3 — frame-rate independence', () => {
  it('the frame depends only on replay time, and ends on the same frame within one frame of the same time at 30, 60 and 144 Hz', () => {
    for (const { hole, rec } of SAMPLES.slice(0, 200)) {
      const dir = new PocDirector(DEFAULT_BROADCAST);
      const runs = [30, 60, 144].map((hz) => {
        dir.onShot(rec, hole);
        dir.startReplay();
        const plan = planReplay(rec, dir.green);
        let f = dir.frame()!;
        let t = 0;
        let frames = 0;
        while (!f.done && frames < 100000) {
          f = dir.advance(1 / hz)!;
          t += 1 / hz;
          frames++;
          // The director's frame is exactly the pure function of elapsed time.
          expect(f.idx).toBe(replayFrameAt(rec, plan, t).idx);
        }
        dir.stopReplay();
        return { end: f.pos, endTime: t, total: plan.totalSec, hz };
      });
      expect(runs[0].end).toEqual(runs[1].end);
      expect(runs[1].end).toEqual(runs[2].end);
      for (const r of runs) expect(Math.abs(r.endTime - r.total)).toBeLessThanOrEqual(1 / r.hz + 1e-9);
    }
    expect(LIVE_SAMPLES_PER_SEC).toBe(102);
  });
});

describe('Test 4 (logic level) — Classic result exit is unchanged when the flag is off', () => {
  it('matches the original rule for every combination of time, hold and tap', () => {
    for (let t = 0; t <= 3; t += 0.01) {
      for (const wait of [1.5, 2.2]) {
        for (const tapped of [false, true]) {
          const original = t >= wait || (t > 0.4 && tapped);
          const act = resultStep({ phaseT: t, wait, tappedSwing: tapped, replaying: false, replayDone: false, replayDue: false });
          expect(act === 'leave').toBe(original);
          expect(['leave', 'none']).toContain(act);
        }
      }
    }
  });

  it('the flag is off unless a developer build asks for it', () => {
    expect(broadcastConfigFromSearch('?broadcast=poc', false)).toBeNull();
    expect(broadcastConfigFromSearch('', true)).toBeNull();
    expect(broadcastConfigFromSearch('?broadcast=on', true)).toBeNull();
    expect(broadcastConfigFromSearch('?broadcast=poc&cam=b&angle=line', true)).toEqual({ candidate: 'B', angle: 'line', replayApproaches: true });
    // Camera A is out of the active candidates (author decision); research only.
    expect(broadcastConfigFromSearch('?broadcast=poc&cam=A', true)?.candidate).toBe('C');
    expect(broadcastConfigFromSearch('?broadcast=poc&cam=A&research=1', true)?.candidate).toBe('A');
    expect(broadcastConfigFromSearch('?broadcast=poc', true)).toEqual({ candidate: 'C', angle: 'offset30', replayApproaches: true });
  });
});

describe('Test 5 — no physics reachable from src/broadcast', () => {
  it('imports nothing at runtime from golf/physics or golf/ai, and never calls simulateShot or rng', () => {
    const dir = join(__dirname, '..', 'src', 'broadcast');
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
      const src = readFileSync(join(dir, f), 'utf8');
      const runtimeImports = [...src.matchAll(/^import\s+(?!type\b)([^;]*?)from\s+'([^']+)'/gms)];
      for (const m of runtimeImports) {
        expect(m[2], `${f} imports ${m[2]}`).not.toMatch(/golf\/(physics|ai)$/);
        expect(m[1], `${f} imports rng`).not.toMatch(/\brng\b/);
      }
      const code = src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      expect(code, f).not.toMatch(/\bsimulateShot\s*\(/);
      expect(code, f).not.toMatch(/\brng\s*\(/);
    }
  });
});

describe('Test 6 — finishShot/afterResult once: every exit from result leaves once', () => {
  type Script = { name: string; tapAt: number[]; replayDue: boolean; replayLen: number };
  const scripts: Script[] = [
    { name: 'Classic, no tap', tapAt: [], replayDue: false, replayLen: 0 },
    { name: 'Classic, tap after 0.4 s', tapAt: [0.6], replayDue: false, replayLen: 0 },
    { name: 'tap before 0.4 s is ignored', tapAt: [0.2], replayDue: false, replayLen: 0 },
    { name: 'replay plays to the end', tapAt: [], replayDue: true, replayLen: 3 },
    { name: 'tap during live hold cancels replay', tapAt: [0.9], replayDue: true, replayLen: 3 },
    { name: 'tap skips replay', tapAt: [2.0], replayDue: true, replayLen: 3 },
    { name: 'tap in the frame the replay ends', tapAt: [1.5 + 3], replayDue: true, replayLen: 3 },
    { name: 'taps every frame', tapAt: Array.from({ length: 400 }, (_, i) => i / 60), replayDue: true, replayLen: 3 },
  ];
  for (const s of scripts) {
    it(s.name, () => {
      const gate = new ResultGate();
      gate.newShot();
      let leaves = 0;
      let replaying = false;
      let replayT = 0;
      let replays = 0;
      let left = false;
      const dt = 1 / 60;
      for (let f = 0; f < 600 && !left; f++) {
        const t = f * dt;
        const tapped = s.tapAt.some((x) => Math.abs(x - t) < dt / 2);
        if (replaying) replayT += dt;
        const input: ResultInput = { phaseT: t, wait: 1.5, tappedSwing: tapped, replaying, replayDone: replaying && replayT >= s.replayLen, replayDue: s.replayDue };
        const act = resultStep(input);
        if (act === 'startReplay') {
          replaying = true;
          replays++;
        } else if (act !== 'none') {
          // Call twice on purpose: the gate must still only let one through.
          if (gate.leave(() => leaves++)) left = true;
          gate.leave(() => leaves++);
        }
      }
      expect(leaves).toBe(1);
      expect(replays).toBeLessThanOrEqual(1);
    });
  }

  it('a new shot re-arms the gate exactly once', () => {
    const gate = new ResultGate();
    let n = 0;
    for (let shot = 0; shot < 5; shot++) {
      gate.newShot();
      gate.leave(() => n++);
      gate.leave(() => n++);
    }
    expect(n).toBe(5);
  });
});

describe('Test 8 — green-side camera placement on every hole of every course', () => {
  it('every placement is safe, or falls back to Ball Follow', () => {
    const rows: Record<string, unknown>[] = [];
    for (const c of COURSES) {
      c.holes.forEach((hole) => {
        const from = approachSpot(hole, 150);
        for (const cand of ['A', 'B', 'C', 'D'] as GreenCamCandidate[]) {
          for (const angle of ['line', 'offset30'] as GreenCamAngle[]) {
            const pose = placeGreenCam(hole, from, cand, angle);
            if (pose) {
              expect(placementProblem(hole, pose)).toBeNull();
              const pin = project(pose, hole.pin.x, hole.pin.y, 0)!;
              const top = project(pose, hole.pin.x, hole.pin.y, FLAG_HEIGHT)!;
              expect(pin.x).toBeGreaterThanOrEqual(PIN_SAFE_X[0]);
              expect(pin.x).toBeLessThanOrEqual(PIN_SAFE_X[1]);
              expect(top.y).toBeGreaterThanOrEqual(FLAG_TOP_MIN_Y);
            }
            rows.push({
              course: c.id,
              hole: hole.number,
              candidate: cand,
              angle,
              placed: !!pose,
              reason: pose ? '' : placementProblem(hole, greenCamPose(hole, from, cand, angle)),
            });
          }
        }
      });
    }
    mkdirSync(OUT, { recursive: true });
    writeFileSync(join(OUT, 'placement.json'), JSON.stringify(rows, null, 2));
    const placed = rows.filter((r) => r.placed).length;
    expect(placed / rows.length).toBeGreaterThan(0.5);
  });

  it('matches the height study numbers', () => {
    const pin = { x: 0, y: 0 };
    const at = (c: GreenCamCandidate) => {
      const { h, d } = GREEN_CAM[c];
      const cam = { x: 0, y: d, h, heading: Math.PI };
      return { top: project(cam, pin.x, pin.y, FLAG_HEIGHT)!.y, cup: project(cam, pin.x, pin.y, 0)!.y };
    };
    expect(Math.round(at('B').top)).toBe(80);
    expect(Math.round(at('C').top)).toBe(145);
    expect(Math.round(at('D').cup)).toBe(315);
    expect(at('A').top).toBeGreaterThanOrEqual(FLAG_TOP_MIN_Y);
  });
});

describe('A/B procedure step 2 — the saved fixtures are real engine results', () => {
  // physics.ts caches launch speeds under a rounded key, so a result can depend on
  // which shots were simulated earlier in the session (see the Phase 1 report).
  // Each fixture is therefore re-simulated with freshly loaded engine modules,
  // the same state the lab page started from.
  beforeEach(() => vi.resetModules());
  for (const name of ['fixture', 'bunker', 'tree']) {
    it(`re-running simulateShot with the ${name} fixture's inputs gives a bit-identical result`, async () => {
      const { getCourse } = await import('../src/golf/courses');
      const { puttScaleFor } = await import('../src/golf/clubs');
      const { planShot } = await import('../src/golf/ai');
      const { surfaceAt } = await import('../src/golf/course');
      const { dist, rng } = await import('../src/golf/math');
      const { simulateShot } = await import('../src/golf/physics');
      const fx = JSON.parse(readFileSync(join(__dirname, 'fixtures', `broadcast-${name}.json`), 'utf8'));
      const rec = recordFromJSON(fx.recordJson);
      expect(verifyShotRecord(rec)).toBe(true);
      const hole = getCourse(fx.course).holes[fx.holeIndex];
      const start = rec.meta.start;
      const lie = surfaceAt(hole, start);
      const plan = planShot(hole, start, lie, fx.wind, fx.strength, false, true);
      const power = Math.max(0.01, plan.power);
      const seed = (fx.holeIndex + 1) * 1000 + 0 * 17 + Math.floor(plan.power * 1000);
      const res = simulateShot(hole, {
        start, heading: plan.heading, club: plan.club, power, height: plan.height, curve: 0, spin: plan.spin,
        wind: fx.wind, lie, strength: fx.strength, puttScale: puttScaleFor(dist(start, hole.pin)), rng: rng(seed),
      });
      expect(recordToShotResult(rec)).toEqual(res);
      res.path.forEach((p, i) => {
        const q = sampleAt(rec, i);
        expect(Object.is(q.x, p.x) && Object.is(q.y, p.y) && Object.is(q.z, p.z)).toBe(true);
      });
    });
  }
});
