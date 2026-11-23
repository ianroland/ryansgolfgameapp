/**
 * DEVELOPER ONLY. Plays a scripted round with fixed inputs (the AI's plan via
 * the scene's existing debugAutoShot) at a manual 60 Hz clock, and records
 * everything the game cares about: every ShotResult, the onPhase sequence and
 * the onHoleComplete calls. Used to compare the ORIGINAL RoundScene with the
 * new one (flag off and flag on).
 */
import * as Phaser from 'phaser';
import { getCourse } from '../../src/golf/courses';

interface SceneLike extends Phaser.Scene {
  setHandlers(h: { onPhase?: (p: string) => void; onHoleComplete?: (s: number, h: boolean, shot?: string) => void }): void;
  startHole(s: unknown): void;
  debugAutoShot(): boolean;
  readonly debugPhase: string;
}

export interface RoundLog {
  shots: string[];
  phases: string[];
  holeCompletes: { strokes: number; holed: boolean; shot?: string }[];
  frames: number;
  finishShotCalls: number;
  afterResultCalls: number;
}

export const ROUND = [
  ...Array.from({ length: 9 }, (_, i) => ({ course: 'course_dry_creek_muni', hole: i })),
  ...Array.from({ length: 9 }, (_, i) => ({ course: 'course_pacific_bluffs', hole: i })),
];

const MODS = { aimWobbleDeg: 2.2, powerWobble: 0.05, shortWobble: 0.04, puttAimWobbleDeg: 3, puttPowerWobble: 0.06, meterSpeed: 1 };

export async function runRound(make: () => SceneLike, configure?: (s: SceneLike) => void): Promise<RoundLog> {
  const scene = make();
  configure?.(scene);
  const log: RoundLog = { shots: [], phases: [], holeCompletes: [], frames: 0, finishShotCalls: 0, afterResultCalls: 0 };
  let completes = 0;
  scene.setHandlers({
    onPhase: (p) => log.phases.push(p),
    onHoleComplete: (strokes, holed, shot) => {
      completes++;
      log.holeCompletes.push({ strokes, holed, shot });
    },
  });
  const anyS = scene as unknown as Record<string, () => void>;
  const orig = { f: anyS.finishShot.bind(scene), a: anyS.afterResult.bind(scene) };
  anyS.finishShot = () => {
    log.finishShotCalls++;
    orig.f();
  };
  anyS.afterResult = () => {
    log.afterResultCalls++;
    orig.a();
  };
  const host = document.getElementById('stage')!;
  host.innerHTML = '';
  const game = new Phaser.Game({
    type: Phaser.CANVAS,
    parent: host,
    width: 960,
    height: 540,
    backgroundColor: '#0b1f16',
    input: { gamepad: false },
    banner: false,
    audio: { noAudio: true },
    scene: [scene],
  });
  for (let i = 0; i < 400; i++) {
    if ((scene as unknown as { g?: unknown }).g && scene.sys.settings.status === Phaser.Scenes.RUNNING) break;
    await new Promise((r) => setTimeout(r, 25));
  }
  game.loop.sleep();
  const DT = 1000 / 60;
  let time = 0;
  let lastShot: unknown = null;
  for (let h = 0; h < ROUND.length; h++) {
    const course = getCourse(ROUND[h].course);
    const hole = course.holes[ROUND[h].hole];
    scene.startHole({
      hole,
      holeIndex: h,
      holeCount: ROUND.length,
      theme: course.theme,
      wind: { heading: 0.7 + h * 0.3, mph: 4 + (h % 5) * 2 },
      golferName: 'RYAN',
      statusLine: 'PARITY',
      strength: 1,
      mods: MODS,
    });
    const want = completes + 1;
    for (let f = 0; f < 60 * 60 * 3 && completes < want; f++) {
      if (scene.debugPhase === 'aim') scene.debugAutoShot();
      time += DT;
      game.step(time, DT);
      log.frames++;
      const shot = (scene as unknown as { shot: unknown }).shot;
      if (shot && shot !== lastShot) {
        lastShot = shot;
        log.shots.push(JSON.stringify(shot));
      }
    }
  }
  game.destroy(true);
  return log;
}
