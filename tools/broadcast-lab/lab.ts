/**
 * Broadcast Phase 1 lab — DEVELOPER ONLY. Not part of any build (Vite only
 * builds index.html). Drives the real RoundScene for the A/B comparison,
 * camera study, parity, input-safety and performance runs.
 *
 * Shots are either simulated by the real engine (fixture capture, parity) or
 * a previously captured full-precision record is played back through the
 * normal flight/result rendering (A/B). The lab never alters physics.
 */
import '@fontsource/tiny5/400.css';
import '@fontsource/jersey-15/400.css';
import * as Phaser from 'phaser';
import { RoundScene, type HoleSetup } from '../../src/game/RoundScene';
import { getCourse } from '../../src/golf/courses';
import { planShot } from '../../src/golf/ai';
import { dist, pointAlongPolyline, polylineLength, type Vec2 } from '../../src/golf/math';
import { surfaceAt, type HoleDef } from '../../src/golf/course';
import type { BroadcastConfig } from '../../src/broadcast/config';
import { recordFromJSON, recordToJSON, type ShotRecord } from '../../src/broadcast/shotRecord';
import { PerfProbe } from '../../src/broadcast/perf';
import type { ShotResult } from '../../src/golf/physics';

type Cmd = Parameters<RoundScene['command']>[0];

interface BootOpts {
  broadcast: BroadcastConfig | null;
  renderer: 'canvas' | 'auto';
  manual: boolean;
  fixedDt?: number | null;
  perf?: boolean;
}

let game: Phaser.Game | null = null;
let scene: RoundScene | null = null;
let hole: HoleDef | null = null;
let setupRef: HoleSetup | null = null;
let time = 0;
let frame = 0;
const DT_MS = 1000 / 60;

const counts = { finishShot: 0, afterResult: 0, holeComplete: 0 };
const phases: string[] = [];
const holeCompletes: unknown[] = [];
const shots: { res: ShotResult; rec: ShotRecord | null }[] = [];

function approachSpot(h: HoleDef, yards: number): Vec2 {
  const L = polylineLength(h.centerline);
  let best: Vec2 = h.centerline[0];
  for (let a = 0; a <= L; a += 0.5) {
    const p = pointAlongPolyline(h.centerline, a);
    if (Math.abs(dist(p, h.pin) - yards) < Math.abs(dist(best, h.pin) - yards)) best = p;
  }
  return best;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const lab = {
  async boot(o: BootOpts) {
    if (game) {
      game.destroy(true);
      await wait(50);
    }
    counts.finishShot = counts.afterResult = counts.holeComplete = 0;
    phases.length = 0;
    holeCompletes.length = 0;
    shots.length = 0;
    time = 0;
    frame = 0;
    const s = new RoundScene();
    s.broadcast = o.broadcast;
    s.debugFixedDt = o.fixedDt ?? null;
    s.perfProbe = o.perf ? new PerfProbe() : null;
    s.debugOnShot = (res, rec) => shots.push({ res, rec });
    s.setHandlers({
      onPhase: (p) => phases.push(p),
      onHoleComplete: (strokes, holed, shot) => {
        counts.holeComplete++;
        holeCompletes.push({ strokes, holed, shot });
      },
    });
    // Count calls without changing them.
    const anyS = s as unknown as Record<string, () => void>;
    for (const k of ['finishShot', 'afterResult'] as const) {
      const orig = anyS[k].bind(s);
      anyS[k] = () => {
        counts[k]++;
        orig();
      };
    }
    scene = s;
    game = new Phaser.Game({
      type: o.renderer === 'canvas' ? Phaser.CANVAS : Phaser.AUTO,
      parent: document.getElementById('stage')!,
      width: 960,
      height: 540,
      backgroundColor: '#0b1f16',
      input: { gamepad: false },
      banner: false,
      audio: { noAudio: true },
      scene: [s],
    });
    await document.fonts.ready;
    for (let i = 0; i < 400; i++) {
      if ((s as unknown as { g?: unknown }).g && s.sys.settings.status === Phaser.Scenes.RUNNING) break;
      await wait(25);
    }
    if (o.manual) game.loop.sleep();
    return true;
  },

  startHole(courseId: string, holeIndex: number, wind = { heading: 0, mph: 0 }, mods?: HoleSetup['mods']) {
    const course = getCourse(courseId);
    hole = course.holes[holeIndex];
    setupRef = {
      hole,
      holeIndex,
      holeCount: course.holes.length,
      theme: course.theme,
      wind,
      golferName: 'RYAN',
      statusLine: 'BROADCAST LAB',
      strength: 1,
      mods,
    };
    scene!.startHole(setupRef);
    return { name: hole.name, par: hole.par, holes: course.holes.length };
  },

  /** Manual frame stepping at a fixed 60 Hz clock. Returns one log row per frame. */
  step(n: number, log = false) {
    const rows: unknown[] = [];
    for (let i = 0; i < n; i++) {
      time += DT_MS;
      frame++;
      game!.step(time, DT_MS);
      if (log) rows.push({ frame, ...scene!.debugState });
    }
    return rows;
  },

  /** Steps until the scene reaches `phase` (or `max` frames). */
  stepUntil(phase: string, max = 2000, log = false) {
    const rows: unknown[] = [];
    for (let i = 0; i < max && scene!.debugPhase !== phase; i++) rows.push(...lab.step(1, log));
    return rows;
  },

  setLie(yards: number, strokesTaken?: number) {
    const spot = approachSpot(hole!, yards);
    scene!.debugSetLie(spot, strokesTaken);
    return spot;
  },

  /** Plays the normal swing with the AI's plan; with `recordJson`, plays that recording instead of simulating. */
  swingPlanned(recordJson?: string) {
    const st = scene!.debugState;
    const lie = surfaceAt(hole!, st.ball);
    const plan = planShot(hole!, st.ball, lie, setupRef!.wind, setupRef!.strength, false, true);
    const rec = recordJson ? recordFromJSON(recordJson) : undefined;
    scene!.debugSwing({ club: plan.club, heading: plan.heading, power: plan.power, height: plan.height, spin: plan.spin }, rec);
    return { club: plan.club };
  },

  /** The AI's plan from the current lie (used by the demo to press the meters like a player). */
  plan() {
    const st = scene!.debugState;
    const lie = surfaceAt(hole!, st.ball);
    return planShot(hole!, st.ball, lie, setupRef!.wind, setupRef!.strength, false, true);
  },

  autoShot() {
    return scene!.debugAutoShot();
  },

  press(cmd: Cmd, down: boolean) {
    scene!.command(cmd, down);
  },

  state() {
    return scene!.debugState;
  },

  replaying() {
    return scene!.debugReplaying;
  },

  lastRecordJson() {
    const r = scene!.debugLastRecord;
    return r ? recordToJSON(r) : null;
  },

  shotsJson() {
    return JSON.stringify(shots.map((s) => ({ res: s.res })));
  },

  snapshot() {
    return game!.canvas.toDataURL('image/png');
  },

  counts: () => ({ ...counts }),
  phases: () => [...phases],
  holeCompletes: () => [...holeCompletes],
  perf: () => scene!.perfProbe?.summary() ?? null,
  perfRaw: () => scene!.perfProbe?.samples ?? [],
  frame: () => frame,
};

(window as unknown as { lab: typeof lab }).lab = lab;
(window as unknown as { labReady: boolean }).labReady = true;

// ── Parity runs (new scene, flag off / on) ──
import { runRound } from './parityRunner';
import { DEFAULT_BROADCAST } from '../../src/broadcast/config';
(window as unknown as Record<string, unknown>).runNew = (flagOn: boolean) =>
  runRound(
    () => new RoundScene() as never,
    (s) => {
      (s as unknown as RoundScene).broadcast = flagOn ? { ...DEFAULT_BROADCAST } : null;
    },
  );
