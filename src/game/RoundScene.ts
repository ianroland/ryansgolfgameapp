/**
 * Arcade golf round scene — behind-the-golfer pseudo-3D view in the spirit of
 * 90s arcade golf: power meter, height meter, hook/slice, top/back spin,
 * wind, ball-follow camera, overhead minimap. All artwork is procedural.
 *
 * Controls
 *   ← →   aim (hold Shift for fine aim)      ↑ ↓   change club
 *   Z / X curve: draw (left) / fade (right)   SPACE swing:
 *     1st press starts the power meter, 2nd sets power,
 *     3rd sets height (hold ↑ topspin / ↓ backspin while pressing).
 *   Putter: 1st press starts, 2nd sets power.
 *   Gamepad: d-pad/stick aim+club, A swing, LB/RB curve.
 */
import * as Phaser from 'phaser';
import { planShot, MAX_OVER_PAR, allowedClubs, shouldPutt } from '../golf/ai';
import { CLUB_BY_ID, CLUBS, puttScaleFor, type ClubId } from '../golf/clubs';
import { corridorLine, FRINGE_WIDTH, holeYardage, shapePolygon, surfaceAt, type CourseTheme, type HoleDef, type Surface } from '../golf/course';
import {
  add,
  clamp,
  DEG,
  dirFromHeading,
  dist,
  ellipsePolygon,
  headingTo,
  lerp,
  norm,
  pointAlongPolyline,
  polylineLength,
  rightOf,
  rng,
  scale,
  sub,
  type Vec2,
} from '../golf/math';
import {
  DEFAULT_LOOK,
  CUTIN_SIZE,
  cutinFor,
  frameFor,
  frameKey,
  GOLFER_LOOKS,
  PUTT_DURATION,
  reactionFrame,
  SWING_DURATION,
  YDS_PER_PX,
  type AnimName,
  type AtlasFrame,
  type CutinPose,
  type GolferLook,
  type Reaction,
  type SwingState,
} from './golferAnim';
import { GroundRenderer } from './groundRenderer';
import { sound } from '../audio/sound';
import { BACKDROP_FOR_HOLE, buildDecor, depthFor, kitFrame, preloadCourseArt, registerCourseFrames, type Decor } from './scenery';
import { LIE_EFFECT, MAX_CURVE, nominalCarry, simulateShot, type ShotResult, type Wind } from '../golf/physics';
// Broadcast proof of concept (Phase 1): developer-only, presentation-only.
import { broadcastConfigFromSearch, type BroadcastConfig } from '../broadcast/config';
import { PocDirector } from '../broadcast/director';
import { resultStep, ResultGate } from '../broadcast/resultFlow';
import { captureShotRecord, recordToShotResult, type ShotRecord } from '../broadcast/shotRecord';
import type { ReplayFrame } from '../broadcast/replayPlayer';
import type { PerfProbe } from '../broadcast/perf';

const W = 960;
const H = 540;
const HORIZON = 188;
const FOCAL = 540;
const NEAR = 0.6;

const COL = {
  skyTop: 0x2f7fd8,
  skyBottom: 0xbfe4f7,
  haze: 0xd8efe8,
  mountainFar: 0x8fa7c4,
  mountainNear: 0x6f8f8a,
  ob: 0x2e5a2a,
  rough: 0x4f8f34,
  fairwayA: 0x74c346,
  fairwayB: 0x67b33c,
  fringe: 0x62b23d,
  green: 0x86dc5c,
  bunker: 0xead9a2,
  bunkerRim: 0xc7b47a,
  water: 0x2f86d4,
  waterHi: 0x7cc3f2,
  tee: 0x7ccb4c,
  white: 0xffffff,
  gold: 0xe8b931,
  red: 0xe5423a,
  ink: 0x0b1f16,
};

/** Distance haze per backdrop (matches each panorama's base). */
const HAZE: Record<string, [number, number, number]> = { mountains: [150, 190, 140], city: [160, 196, 150], coast: [150, 196, 170] };

const UI = { ink: 0x06160c, gold: 0xf2c230, goldDark: 0xa8790f, goldLight: 0xfff0a0, felt: 0x12391f };
const METER = [0x23b14d, 0x3cc44a, 0x6fd23f, 0xa6dc35, 0xd9e030, 0xffd23a, 0xffaa2e, 0xff7a26, 0xf04b23, 0xd8261f];
/** Minimap texture size and on-screen position. */
const MAP = { x: 822, y: 128, w: 122, h: 284 };

type Phase = 'intro' | 'flyover' | 'aim' | 'power' | 'height' | 'swing' | 'flight' | 'result' | 'done';

export interface HoleSetup {
  hole: HoleDef;
  holeIndex: number;
  holeCount: number;
  /** Course look (backdrops, tint, ground grade). Default: Dry Creek's. */
  theme?: CourseTheme;
  wind: Wind;
  golferName: string;
  /** e.g. "RD 2 · T14 · -3" */
  statusLine: string;
  strength: number;
  /** Ryan's phase look (stable appearance id); default phase 3. */
  look?: GolferLook;
  /** How Ryan's stats feel: extra wobble and meter speed. */
  mods?: {
    aimWobbleDeg: number;
    powerWobble: number;
    shortWobble: number;
    puttAimWobbleDeg: number;
    puttPowerWobble: number;
    meterSpeed: number;
  };
}

export interface RoundSceneHandlers {
  /** `shot` describes the holing shot when it went in from off the green (e.g. "3 Wood from 231 yds"). */
  onHoleComplete?: (strokes: number, holed: boolean, shot?: string) => void;
  onPhase?: (phase: Phase) => void;
}

interface Cam {
  x: number;
  y: number;
  h: number;
  heading: number;
}

/** Shortest signed angle difference, in (−π, π]. */
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

type Cmd = 'left' | 'right' | 'up' | 'down' | 'curveL' | 'curveR' | 'swing' | 'fine' | 'flyover';

export class RoundScene extends Phaser.Scene {
  private g!: Phaser.GameObjects.Graphics;
  private hud!: Phaser.GameObjects.Graphics;
  private texts: Record<string, Phaser.GameObjects.Text> = {};
  private flyLabel!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private sub!: Phaser.GameObjects.Text;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private handlers: RoundSceneHandlers = {};
  private pending: HoleSetup | null = null;

  // Hole state
  private setup!: HoleSetup;
  private hole!: HoleDef;
  private polys!: { corridor: Vec2[]; stripes: { pts: Vec2[]; c: number }[]; fringe: Vec2[]; green: Vec2[]; bunkers: Vec2[][]; water: Vec2[][]; tee: Vec2[] };
  private ball: Vec2 = { x: 0, y: 0 };
  private ballZ = 0;
  private lie: Surface = 'tee';
  private strokes = 0;
  private aim = 0;
  private club: ClubId = 'DR';
  private curve = 0;
  private power = 0;
  private powerDir = 1;
  private height = 0.5;
  private heightT = 0;
  private spin: -1 | 0 | 1 = 0;
  private phase: Phase = 'intro';
  private phaseT = 0;
  private shot: ShotResult | null = null;
  private shotHeading = 0;
  private flightIdx = 0;
  private lastSoundZ = 0;
  private lastSoundIdx = -1;
  private preview: Vec2 | null = null;
  private previewDirty = true;
  private cam: Cam = { x: 0, y: -10, h: 4, heading: 0 };
  private held = new Set<Cmd>();
  private tapped = new Set<Cmd>();
  private padPrev: boolean[] = [];
  private holed = false;
  private holedShot: string | undefined;
  private swingSpot: Vec2 | null = null;
  private hitTime = 0;
  private golferImg!: Phaser.GameObjects.Image;
  private portrait!: Phaser.GameObjects.Image;
  private cutinBg!: Phaser.GameObjects.Graphics;
  private cutinImg!: Phaser.GameObjects.Image;
  private bustBg!: Phaser.GameObjects.Graphics;
  private bustImg!: Phaser.GameObjects.Image;
  private bust: CutinPose | null = null;
  private reaction: Reaction | null = null;
  private reactionStart = 0;
  private spriteShowsBall = false;
  private hudTop!: Phaser.GameObjects.Graphics;
  private minimapTex!: Phaser.Textures.CanvasTexture;
  private mapXf = { k: 1, cx: 0, cy: 0 };
  private ground!: GroundRenderer;
  private backdrop!: Phaser.GameObjects.TileSprite;
  private ballG!: Phaser.GameObjects.Graphics;
  private decor: Decor[] = [];
  private decorImgs: Phaser.GameObjects.Image[] = [];

  // ── Broadcast proof of concept (Phase 1) — developer-only, presentation-only ──
  /** null = Classic presentation (the default; release builds are always Classic). */
  broadcast: BroadcastConfig | null =
    typeof window === 'undefined' ? null : broadcastConfigFromSearch(window.location.search, import.meta.env.DEV);
  private bc: PocDirector | null = null;
  /** Lets afterResult run at most once per shot. */
  private resultGate = new ResultGate();
  /** DEV/A-B harness: a recorded shot to play instead of simulating (playback only). */
  private injectedRecord: ShotRecord | null = null;
  private bcOverlay?: Phaser.GameObjects.Graphics;
  private bcLabel?: Phaser.GameObjects.Text;
  private bcBannerWas: [boolean, boolean] | null = null;
  /** DEV: fixed frame step (seconds) for deterministic playback; null = real time. */
  debugFixedDt: number | null = null;
  /** DEV: frame-time instrumentation; null = off. */
  perfProbe: PerfProbe | null = null;
  /** DEV: called with every simulated (or injected) shot. */
  debugOnShot: ((res: ShotResult, record: ShotRecord | null) => void) | null = null;
  private lastRecord: ShotRecord | null = null;

  constructor() {
    super('round');
  }

  setHandlers(h: RoundSceneHandlers) {
    this.handlers = h;
  }

  /** External (touch / React) controls. */
  command(cmd: Cmd, down: boolean) {
    if (down) {
      if (!this.held.has(cmd)) this.tapped.add(cmd);
      this.held.add(cmd);
    } else this.held.delete(cmd);
  }

  setPaused(paused: boolean) {
    if (!this.g) return;
    if (paused) this.scene.pause();
    else this.scene.resume();
    this.held.clear();
  }

  /** DEV/test aid: plays the planned shot for the current lie (through the same physics). */
  debugAutoShot() {
    if (this.phase !== 'aim') return false;
    const plan = planShot(this.hole, this.ball, this.lie, this.setup.wind, this.setup.strength, this.strokes === 0, true);
    this.club = plan.club;
    this.aim = plan.heading;
    this.power = plan.power;
    this.height = plan.height;
    this.spin = plan.spin;
    this.curve = 0;
    this.hit();
    return true;
  }

  get debugPhase() {
    return this.phase;
  }

  // ── DEV aids for the broadcast proof of concept (A/B harness, tests) ──

  /** The broadcast director, created on first use when the developer flag is on. */
  private get director(): PocDirector | null {
    if (!this.broadcast) return null;
    if (!this.bc || this.bc.config !== this.broadcast) this.bc = new PocDirector(this.broadcast);
    return this.bc;
  }

  get debugReplaying() {
    return !!this.bc?.replaying;
  }

  get debugState() {
    return {
      phase: this.phase,
      sub: this.broadcastSubState(),
      strokes: this.strokes,
      ball: { ...this.ball },
      ballZ: this.ballZ,
      flightIdx: this.flightIdx,
      cam: { ...this.cam },
      aim: this.aim,
      club: this.club,
      curve: this.curve,
      spin: this.spin,
      power: this.power,
      banner: this.banner?.visible ? `${this.banner.text}|${this.sub.text}` : '',
      reaction: this.reaction,
      holed: this.holed,
      replay: (() => {
        const f = this.bc?.replaying ? this.bc.frame() : null;
        return f ? { idx: f.idx, segment: f.segment } : null;
      })(),
    };
  }

  get debugLastRecord() {
    return this.lastRecord;
  }

  /** DEV: put the ball at `pos` and return to aiming (for fixture shots); optionally set strokes already taken. */
  debugSetLie(pos: Vec2, strokesTaken?: number) {
    if (strokesTaken !== undefined) this.strokes = strokesTaken;
    this.ball = { ...pos };
    this.ballZ = 0;
    this.lie = surfaceAt(this.hole, this.ball);
    this.curve = 0;
    this.spin = 0;
    this.planFromHere();
    this.setPhase('aim');
  }

  /** DEV: set up a planned shot and play the normal swing (the real hit() runs at its end). */
  debugSwing(plan: { club: ClubId; heading: number; power: number; height: number; spin: -1 | 0 | 1 }, record?: ShotRecord) {
    this.club = plan.club;
    this.aim = plan.heading;
    this.power = plan.power;
    this.height = plan.height;
    this.spin = plan.spin;
    this.curve = 0;
    this.injectedRecord = record ?? null;
    this.setPhase('swing');
  }

  private broadcastSubState(): string {
    if (this.bc?.replaying) return 'replay';
    if ((this.phase === 'flight' || this.phase === 'result') && this.bc?.greenOnAir) return 'green';
    return '';
  }

  startHole(s: HoleSetup) {
    if (!this.g) {
      this.pending = s;
      return;
    }
    this.setup = s;
    this.hole = s.hole;
    this.buildPolys();
    this.ground.setHole(this.hole);
    const theme = s.theme;
    const list = theme?.backdrops.length ? theme.backdrops : BACKDROP_FOR_HOLE;
    const bd = list[(this.hole.number - 1) % list.length];
    this.backdrop.setTexture(`backdrop_${bd}`);
    const bh = this.textures.get(`backdrop_${bd}`).getSourceImage().height;
    const k = (HORIZON + 4) / bh;
    this.backdrop.setTileScale(k, k);
    if (theme?.sky !== undefined) this.backdrop.setTint(theme.sky);
    else this.backdrop.clearTint();
    this.ground.setHaze(theme?.haze ?? HAZE[bd]);
    this.ground.setGrade(theme?.grade);
    this.setupDecor();
    this.buildMinimap();
    this.ball = { x: 0, y: 0 };
    this.ballZ = 0;
    this.lie = 'tee';
    this.strokes = 0;
    this.holedShot = undefined;
    this.curve = 0;
    this.holed = false;
    this.shot = null;
    this.swingSpot = null;
    this.planFromHere();
    this.setPhase('intro');
  }

  preload() {
    for (const [look, g] of Object.entries(GOLFER_LOOKS)) {
      this.load.image(`golfer_${look}`, g.url);
      this.load.image(`portrait_${look}`, g.portrait);
      this.load.image(`cutin_${look}`, g.cutin);
    }
    preloadCourseArt(this);
  }

  private registerFrames() {
    for (const [look, g] of Object.entries(GOLFER_LOOKS)) {
      const tex = this.textures.get(`golfer_${look}`);
      for (const [anim, frames] of Object.entries(g.atlas.frames) as [AnimName, AtlasFrame[]][]) {
        frames.forEach((f, i) => tex.add(frameKey(anim, i), 0, f.x, f.y, f.w, f.h));
      }
      const ct = this.textures.get(`cutin_${look}`);
      for (let i = 0; i < 6; i++) ct.add(`pose_${i}`, 0, i * CUTIN_SIZE, 0, CUTIN_SIZE, CUTIN_SIZE);
    }
  }

  /** Ryan's current phase look (from the hole setup). */
  private get look(): GolferLook {
    return this.setup?.look ?? DEFAULT_LOOK;
  }
  private get atlas() {
    return GOLFER_LOOKS[this.look].atlas;
  }

  create() {
    this.registerFrames();
    registerCourseFrames(this);
    this.backdrop = this.add.tileSprite(0, 0, W, HORIZON + 4, 'backdrop_mountains').setOrigin(0, 0).setDepth(0);
    this.ground = new GroundRenderer(this, W, H, HORIZON, FOCAL);
    this.ground.image.setDepth(1);
    this.ballG = this.add.graphics();
    this.g = this.add.graphics().setDepth(5);
    this.golferImg = this.add.image(0, 0, `golfer_${DEFAULT_LOOK}`, frameKey('idle', 0)).setDepth(1).setVisible(false);
    this.hud = this.add.graphics().setDepth(2000);
    this.portrait = this.add.image(18, 16, `portrait_${DEFAULT_LOOK}`).setOrigin(0, 0).setDisplaySize(90, 86).setDepth(2001);
    this.cutinBg = this.add.graphics().setDepth(2002);
    this.bustBg = this.add.graphics().setDepth(2004);
    this.bustImg = this.add.image(0, 0, `cutin_${DEFAULT_LOOK}`, 'pose_0').setOrigin(0, 0).setDepth(2005).setVisible(false);
    this.cutinImg = this.add.image(0, 0, `golfer_${DEFAULT_LOOK}`, frameKey('win', 2)).setDepth(2003).setVisible(false);
    const HEAD = '"Jersey 15", "Arial Black", sans-serif';
    const BODY = 'Tiny5, Arial, sans-serif';
    const t = (key: string, x: number, y: number, size: number, color = '#ffffff', origin: [number, number] = [0, 0], font = BODY) => {
      this.texts[key] = this.add
        .text(x, y, '', { fontFamily: font, fontSize: `${size}px`, color })
        .setOrigin(...origin)
        .setDepth(2003)
        .setStroke('#06160c', Math.max(3, Math.round(size / 6)))
        .setShadow(2, 2, '#06160c', 0, true, true);
    };
    t('hole', 118, 6, 42, '#ffffff', [0, 0], HEAD);
    t('holeInfo', 120, 50, 15);
    t('stroke', 120, 69, 15);
    t('skins', 120, 88, 15, '#ffd84a');
    t('toPin', W / 2, 4, 40, '#ffffff', [0.5, 0], HEAD);
    t('lie', W / 2, 46, 16, '#ffd84a', [0.5, 0]);
    t('wind', 883, 104, 16, '#ffffff', [0.5, 0]);
    t('club', 22, 416, 54, '#ffffff', [0, 0], HEAD);
    t('clubName', 22, 468, 14, '#ffffff');
    t('carry', 22, 488, 16, '#ffd84a');
    t('curve', 222, 426, 15, '#ffffff', [0.5, 0]);
    t('meterLabel', 302, 432, 16, '#ffffff');
    t('heightLabel', 702, 388, 14, '#ffffff', [0.5, 0]);
    t('spin', 702, 510, 12, '#ffd84a', [0.5, 0]);
    t('hint', W / 2 - 40, 523, 13, '#ffffff', [0.5, 0]);
    this.banner = this.add
      .text(W / 2, 205, '', { fontFamily: HEAD, fontSize: '72px', color: '#ffe36b', align: 'center' })
      .setOrigin(0.5)
      .setDepth(2005)
      .setStroke('#06160c', 10)
      .setShadow(4, 5, '#000000', 0, true, true);
    this.sub = this.add
      .text(W / 2, 258, '', { fontFamily: BODY, fontSize: '20px', color: '#ffffff', align: 'center' })
      .setOrigin(0.5)
      .setDepth(2005)
      .setStroke('#06160c', 5);
    this.flyLabel = this.add
      .text(W / 2, 118, '', { fontFamily: HEAD, fontSize: '26px', color: '#ffe36b', align: 'center' })
      .setOrigin(0.5)
      .setDepth(2005)
      .setShadow(2, 2, '#06160c', 0, false, true)
      .setVisible(false);
    this.hudTop = this.add.graphics().setDepth(2002);
    this.minimapTex = this.textures.createCanvas('minimap', MAP.w, MAP.h)!;
    this.minimapTex.setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.add.image(MAP.x, MAP.y, 'minimap').setOrigin(0, 0).setDepth(2001);

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('LEFT,RIGHT,UP,DOWN,SPACE,Z,X,SHIFT,ENTER,F') as Record<string, Phaser.Input.Keyboard.Key>;
    kb.addCapture('LEFT,RIGHT,UP,DOWN,SPACE');
    if (this.pending) {
      const p = this.pending;
      this.pending = null;
      this.startHole(p);
    }
  }

  // ───────────────────────── Setup helpers ─────────────────────────

  private buildPolys() {
    const h = this.hole;
    const stripes: { pts: Vec2[]; c: number }[] = [];
    for (const f of h.fairways) {
      if (f.type !== 'strip') {
        stripes.push({ pts: shapePolygon(f), c: COL.fairwayA });
        continue;
      }
      const L = polylineLength(f.pts);
      const seg = 10;
      stripes.push({ pts: shapePolygon(f), c: COL.fairwayA });
      for (let a = 0, k = 0; a < L; a += seg, k++) {
        if (k % 2) continue;
        const p0 = pointAlongPolyline(f.pts, a);
        const p1 = pointAlongPolyline(f.pts, Math.min(L, a + seg));
        const d = norm(sub(p1, p0));
        const n = { x: -d.y, y: d.x };
        stripes.push({
          pts: [add(p0, scale(n, f.hw)), add(p1, scale(n, f.hw)), add(p1, scale(n, -f.hw)), add(p0, scale(n, -f.hw))],
          c: COL.fairwayB,
        });
      }
    }
    this.polys = {
      corridor: shapePolygon({ type: 'strip', pts: corridorLine(h), hw: h.corridorHalfWidth }),
      stripes,
      fringe: ellipsePolygon(h.green, FRINGE_WIDTH, 36),
      green: ellipsePolygon(h.green, 0, 36),
      bunkers: h.bunkers.map(shapePolygon),
      water: h.water.map(shapePolygon),
      tee: [{ x: -5, y: -5 }, { x: 5, y: -5 }, { x: 5, y: 5 }, { x: -5, y: 5 }],
    };
  }

  private isPutt() {
    return this.club === 'PT';
  }

  private planFromHere() {
    const plan = planShot(this.hole, this.ball, this.lie, this.setup.wind, this.setup.strength, this.strokes === 0, false);
    this.club = plan.club;
    this.aim = plan.heading;
    this.previewDirty = true;
  }

  private clubsHere(): ClubId[] {
    if (shouldPutt(this.hole, this.ball, this.lie)) return ['PT', ...allowedClubs(this.lie, this.strokes === 0).filter((c) => this.lie === 'fringe' && (c === 'SW' || c === 'PW'))];
    const list = allowedClubs(this.lie, this.strokes === 0);
    return this.lie === 'fringe' ? [...list, 'PT'] : list;
  }

  private carryNow(power = 1) {
    return nominalCarry(this.club, power, this.lie, this.setup.strength);
  }

  private puttScale() {
    return puttScaleFor(dist(this.ball, this.hole.pin));
  }

  private setPhase(p: Phase) {
    this.phase = p;
    this.phaseT = 0;
    this.handlers.onPhase?.(p);
    if (p === 'intro') {
      this.showBanner(`HOLE ${this.hole.number}`, `PAR ${this.hole.par} · ${holeYardage(this.hole)} YARDS\n${this.hole.name.toUpperCase()}`);
    }
    if (p === 'aim') this.hideBanner();
    if (p === 'flyover') {
      this.hideBanner();
      this.flyLabel.setText(`FLYOVER · HOLE ${this.hole.number} · PAR ${this.hole.par} · ${holeYardage(this.hole)} YDS`).setVisible(true);
      sound.play('swing', { volume: 0.35 });
    } else this.flyLabel?.setVisible(false);
    if (p === 'power') sound.play('meter_start');
    if (p === 'height') sound.play('meter_set');
    if (p === 'swing' && !this.isPutt()) sound.play('swing', { volume: 0.4 + this.power * 0.6 });
    if (p === 'aim' || p === 'intro') {
      this.reaction = null;
      this.bust = null;
    }
    if (p === 'power') {
      this.power = 0;
      this.powerDir = 1;
    }
    if (p === 'height') this.heightT = 0;
  }

  /**
   * Hole flyover: the camera glides from the tee along the hole to the green,
   * holds on the pin, then swoops back to the ball. Space or F skips.
   */
  private updateFlyover(dt: number, skip: boolean) {
    const cl = this.hole.centerline;
    const L = polylineLength(cl);
    const FLY = clamp(L / 52, 4.5, 9);
    const HOLD = 1.8;
    const t = this.phaseT;
    let target: Cam;
    if (t < FLY) {
      const u = t / FLY;
      const e = u * u * (3 - 2 * u);
      const along = lerp(-8, L - 22, e);
      const p = pointAlongPolyline(cl, Math.max(0, along));
      const ahead = pointAlongPolyline(cl, Math.min(L, Math.max(0, along) + 45));
      const hd = along > L - 70 ? headingTo(p, this.hole.pin) : headingTo(p, ahead);
      const d = dirFromHeading(hd);
      const back = along < 0 ? 12 - along : 12;
      target = { x: p.x - d.x * back, y: p.y - d.y * back, h: lerp(22, 7, e) + Math.sin(u * Math.PI) * 9, heading: hd };
    } else {
      const p = pointAlongPolyline(cl, Math.max(0, L - 34));
      const hd = headingTo(p, this.hole.pin);
      target = { x: p.x, y: p.y, h: 6, heading: hd };
    }
    // Ease the camera along so the start and turns stay smooth.
    const k = Math.min(1, dt * (t < 0.6 ? 3 : 6));
    this.cam = {
      x: lerp(this.cam.x, target.x, k),
      y: lerp(this.cam.y, target.y, k),
      h: lerp(this.cam.h, target.h, k),
      heading: this.cam.heading + wrapAngle(target.heading - this.cam.heading) * k,
    };
    // Live yardage under the title: how far the view point is from the pin.
    const look = { x: this.cam.x + dirFromHeading(this.cam.heading).x * 12, y: this.cam.y + dirFromHeading(this.cam.heading).y * 12 };
    const togo = Math.max(0, Math.round(dist(look, this.hole.pin)));
    this.flyLabel.setText(`FLYOVER · HOLE ${this.hole.number} · PAR ${this.hole.par}\n${t >= FLY ? 'THE GREEN' : `${togo} YDS TO THE PIN`}`);
    if (t >= FLY + HOLD || (skip && t > 0.3)) {
      // The aim camera eases back to the ball from here.
      this.cam.heading = this.aim + wrapAngle(this.cam.heading - this.aim);
      this.setPhase('aim');
    }
  }

  /** Starts the hole flyover (from the tee box or while aiming). */
  flyover() {
    if (this.phase === 'aim' || this.phase === 'intro') this.setPhase('flyover');
  }

  private showBanner(main: string, sub = '') {
    this.banner.setText(main).setVisible(true).setScale(0.6).setAlpha(0);
    this.sub.setText(sub).setVisible(!!sub).setAlpha(0);
    this.tweens.add({ targets: this.banner, scale: 1, alpha: 1, duration: 220, ease: 'Back.Out' });
    this.tweens.add({ targets: this.sub, alpha: 1, duration: 300, delay: 120 });
  }

  private hideBanner() {
    this.banner.setVisible(false);
    this.sub.setVisible(false);
  }

  // ───────────────────────── Input ─────────────────────────

  private pollInput() {
    const k = this.keys;
    const map: [Cmd, Phaser.Input.Keyboard.Key][] = [
      ['left', k.LEFT],
      ['right', k.RIGHT],
      ['up', k.UP],
      ['down', k.DOWN],
      ['curveL', k.Z],
      ['curveR', k.X],
      ['swing', k.SPACE],
      ['fine', k.SHIFT],
    ];
    const kbHeld = new Set<Cmd>();
    for (const [c, key] of map) {
      if (key.isDown) kbHeld.add(c);
      if (Phaser.Input.Keyboard.JustDown(key)) this.tapped.add(c);
    }
    if (Phaser.Input.Keyboard.JustDown(k.ENTER)) this.tapped.add('swing');
    if (Phaser.Input.Keyboard.JustDown(k.F)) this.tapped.add('flyover');

    // Gamepad.
    const pad = this.input.gamepad?.pad1;
    if (pad) {
      const btn = (i: number) => !!pad.buttons[i]?.pressed;
      const axisX = pad.axes[0]?.getValue() ?? 0;
      const axisY = pad.axes[1]?.getValue() ?? 0;
      const state: [Cmd, boolean][] = [
        ['left', pad.left || axisX < -0.4],
        ['right', pad.right || axisX > 0.4],
        ['up', pad.up || axisY < -0.5],
        ['down', pad.down || axisY > 0.5],
        ['swing', btn(0)],
        ['curveL', btn(4)],
        ['curveR', btn(5)],
        ['flyover', btn(3)],
      ];
      state.forEach(([c, on], i) => {
        if (on) kbHeld.add(c);
        if (on && !this.padPrev[i]) this.tapped.add(c);
        this.padPrev[i] = on;
      });
    }
    return { isHeld: (c: Cmd) => kbHeld.has(c) || this.held.has(c), tapped: (c: Cmd) => this.tapped.has(c) };
  }

  // ───────────────────────── Update ─────────────────────────

  update(_time: number, deltaMs: number) {
    if (!this.setup) return;
    const t0 = this.perfProbe ? performance.now() : 0;
    const dt = this.debugFixedDt ?? Math.min(0.05, deltaMs / 1000);
    this.phaseT += dt;
    const input = this.pollInput();

    switch (this.phase) {
      case 'intro': {
        const T = 2.4;
        const t = clamp(this.phaseT / T, 0, 1);
        const e = t * t * (3 - 2 * t);
        const cl = this.hole.centerline;
        const L = polylineLength(cl);
        const along = lerp(L + 10, 0, e);
        const p = pointAlongPolyline(cl, Math.max(0, along));
        const ahead = pointAlongPolyline(cl, Math.min(L, Math.max(0, along) + 25));
        const hd = along > L - 20 ? headingTo(pointAlongPolyline(cl, L - 30), this.hole.pin) : headingTo(p, ahead);
        const d = dirFromHeading(hd);
        this.cam = { x: p.x - d.x * 7.4, y: p.y - d.y * 7.4, h: lerp(24, 3.3, e), heading: lerp(hd, this.aim, e * e) };
        if (input.tapped('flyover')) this.setPhase('flyover');
        else if (t >= 1 || input.tapped('swing')) this.setPhase('aim');
        break;
      }
      case 'flyover': {
        this.updateFlyover(dt, input.tapped('swing') || input.tapped('flyover'));
        break;
      }
      case 'aim': {
        const fine = input.isHeld('fine');
        const rate = (fine ? 6 : this.isPutt() ? 18 : 32) * DEG;
        if (input.isHeld('left')) {
          this.aim -= rate * dt;
          this.previewDirty = true;
        }
        if (input.isHeld('right')) {
          this.aim += rate * dt;
          this.previewDirty = true;
        }
        if (input.tapped('up') || input.tapped('down')) {
          const list = this.clubsHere();
          const i = list.indexOf(this.club);
          const next = input.tapped('up') ? Math.max(0, i - 1) : Math.min(list.length - 1, i + 1);
          this.club = list[i === -1 ? 0 : next];
          this.previewDirty = true;
        }
        if (!this.isPutt()) {
          if (input.tapped('curveL')) this.curve = Math.max(-MAX_CURVE, this.curve - 1);
          if (input.tapped('curveR')) this.curve = Math.min(MAX_CURVE, this.curve + 1);
          if (input.tapped('curveL') || input.tapped('curveR')) this.previewDirty = true;
        }
        this.aimCamera(dt);
        if (input.tapped('flyover')) this.setPhase('flyover');
        else if (input.tapped('swing')) this.setPhase('power');
        break;
      }
      case 'power': {
        // Meter units per second; pressure (low Nerve) speeds it up.
        const speed = (this.isPutt() ? 0.75 : 1.05) * (this.setup.mods?.meterSpeed ?? 1);
        this.power += this.powerDir * speed * dt;
        if (this.power >= 1) {
          this.power = 1;
          this.powerDir = -1;
        }
        if (this.power <= 0 && this.powerDir < 0) {
          this.power = 0;
          this.setPhase('aim'); // let it drop: cancel
          break;
        }
        this.aimCamera(dt);
        if (input.tapped('swing')) {
          if (this.isPutt()) {
            this.height = 0.5;
            this.spin = 0;
            this.setPhase('swing');
          } else this.setPhase('height');
        }
        break;
      }
      case 'height': {
        this.heightT += dt * 1.5;
        this.height = 1 - Math.abs(((this.heightT % 2) + 2) % 2 - 1); // ping-pong 0..1
        this.spin = input.isHeld('up') ? 1 : input.isHeld('down') ? -1 : 0;
        this.aimCamera(dt);
        if (input.tapped('swing')) this.setPhase('swing');
        break;
      }
      case 'swing': {
        this.aimCamera(dt);
        if (this.phaseT >= (this.isPutt() ? PUTT_DURATION : SWING_DURATION)) this.hit();
        break;
      }
      case 'flight': {
        const fast = input.isHeld('swing');
        this.flightIdx += (fast ? 5 : this.isPutt() ? 1.2 : 1.7) * dt * 60;
        const path = this.shot!.path;
        const i = Math.min(path.length - 1, Math.floor(this.flightIdx));
        const pt = path[i];
        this.ball = { x: pt.x, y: pt.y };
        this.ballZ = pt.z;
        this.bounceSounds(i);
        this.afterImpactCamera(dt);
        if (i >= path.length - 1) this.finishShot();
        break;
      }
      case 'result': {
        // Classic: leave after the hold, or on a Swing tap after 0.4 s. The
        // broadcast replay (DEV flag only) is a sub-state inside `result`, and
        // every exit goes through leaveResult(), so afterResult runs once.
        const dir = this.bc && this.broadcast ? this.bc : null;
        const frame = dir?.replaying ? dir.advance(dt) : null;
        if (!dir?.replaying) this.afterImpactCamera(dt);
        const act = resultStep({
          phaseT: this.phaseT,
          wait: this.holed ? 2.2 : 1.5,
          tappedSwing: input.tapped('swing'),
          replaying: !!dir?.replaying,
          replayDone: !!frame?.done,
          replayDue: !!dir?.replayDue,
        });
        if (act === 'startReplay') {
          dir!.startReplay();
          this.applyReplayFrame(dir!.frame());
        } else if (act === 'skipReplay' || act === 'endReplay' || act === 'leave') {
          this.leaveResult();
        } else if (frame) {
          this.applyReplayFrame(frame);
        }
        break;
      }
      case 'done':
        break;
    }

    if (this.previewDirty && (this.phase === 'aim' || this.phase === 'power' || this.phase === 'height')) this.computePreview();
    this.tapped.clear();
    this.render();
    if (this.perfProbe) {
      const sub = this.broadcastSubState();
      this.perfProbe.add({ state: sub ? `${this.phase}:${sub}` : this.phase, cpuMs: performance.now() - t0, groundMs: this.perfProbe.groundMs, deltaMs });
    }
  }

  /** Camera after impact: the broadcast director's pick (DEV flag) or Classic's follow camera. */
  private afterImpactCamera(dt: number) {
    const c = this.bc && this.broadcast ? this.bc.liveCamera(this.flightIdx) : null;
    if (c) this.cam = c;
    else this.followCamera(dt);
  }

  /** The only way out of `result`: runs afterResult at most once per shot. */
  private leaveResult() {
    this.resultGate.leave(() => {
      this.endReplay();
      this.afterResult();
    });
  }

  /** Replay (DEV flag): drives the camera only; the ball's game state is never touched. */
  private applyReplayFrame(f: ReplayFrame | null) {
    if (!f) return;
    this.cam = { ...f.cam };
    if (!this.bcBannerWas) {
      this.bcBannerWas = [this.banner.visible, this.sub.visible];
      this.banner.setVisible(false);
      this.sub.setVisible(false);
    }
  }

  private endReplay() {
    if (!this.bc?.replaying) return;
    this.bc.stopReplay();
    if (this.bcBannerWas) {
      this.banner.setVisible(this.bcBannerWas[0]);
      this.sub.setVisible(this.bcBannerWas[1]);
      this.bcBannerWas = null;
    }
    this.bcOverlay?.clear();
    this.bcLabel?.setVisible(false);
  }

  private aimCamera(dt: number) {
    const d = dirFromHeading(this.aim);
    const back = this.isPutt() ? 6.2 : 7.4;
    const target: Cam = { x: this.ball.x - d.x * back, y: this.ball.y - d.y * back, h: this.isPutt() ? 2.8 : 3.3, heading: this.aim };
    const k = Math.min(1, dt * 10);
    this.cam = {
      x: lerp(this.cam.x, target.x, k),
      y: lerp(this.cam.y, target.y, k),
      h: lerp(this.cam.h, target.h, k),
      heading: lerp(this.cam.heading, target.heading, k),
    };
  }

  private followCamera(dt: number) {
    // Hold the shot for a beat so the follow-through plays before the chase.
    if (!this.isPutt() && (this.time.now - this.hitTime) / 1000 < 0.5) return;
    const d = dirFromHeading(this.shotHeading);
    const back = this.isPutt() ? 6 : 14;
    const target = { x: this.ball.x - d.x * back, y: this.ball.y - d.y * back, h: (this.isPutt() ? 2.6 : 4.5) + this.ballZ * 0.55 };
    const k = Math.min(1, dt * 4.5);
    this.cam = { x: lerp(this.cam.x, target.x, k), y: lerp(this.cam.y, target.y, k), h: lerp(this.cam.h, target.h, k), heading: lerp(this.cam.heading, this.shotHeading, k) };
  }

  private computePreview() {
    this.previewDirty = false;
    if (this.isPutt()) {
      this.preview = add(this.ball, scale(dirFromHeading(this.aim), Math.min(this.puttScale(), dist(this.ball, this.hole.pin))));
      return;
    }
    const res = simulateShot(this.hole, {
      start: this.ball,
      heading: this.aim,
      club: this.club,
      power: 1,
      height: 0.5,
      curve: this.curve,
      spin: 0,
      wind: { heading: 0, mph: 0 },
      lie: this.lie,
      strength: this.setup.strength,
    });
    const l = res.path[res.landingIndex] ?? res.path[res.path.length - 1];
    this.preview = { x: l.x, y: l.y };
  }

  private hit() {
    const injected = this.injectedRecord;
    this.injectedRecord = null;
    this.resultGate.newShot();
    this.shotHeading = this.aim;
    this.swingSpot = { ...this.ball };
    this.hitTime = this.time.now;
    const seed = (this.setup.holeIndex + 1) * 1000 + this.strokes * 17 + Math.floor(this.power * 1000);
    // Stat wobble: Ryan's skills decide how true the struck ball is to the
    // aim and power you chose.
    const m = this.setup.mods;
    let heading = this.aim;
    let power = this.power;
    if (m) {
      const w = rng(seed ^ 0x9e3779b9);
      const deg = Math.PI / 180;
      if (this.isPutt()) {
        heading += w.gauss() * m.puttAimWobbleDeg * 0.25 * deg;
        power *= 1 + w.gauss() * m.puttPowerWobble;
      } else {
        const short = nominalCarry(this.club, this.power, this.lie, this.setup.strength) < 100;
        heading += w.gauss() * (short ? m.shortWobble * 40 : m.aimWobbleDeg) * deg;
        power *= 1 + w.gauss() * (short ? m.shortWobble : m.powerWobble);
      }
      power = Math.max(0.01, Math.min(1.08, power));
      this.shotHeading = heading;
    }
    this.shot = injected ? recordToShotResult(injected) : simulateShot(this.hole, {
      start: this.ball,
      heading,
      club: this.club,
      power: Math.max(0.01, power),
      height: this.height,
      curve: this.isPutt() ? 0 : this.curve,
      spin: this.spin,
      wind: this.setup.wind,
      lie: this.lie,
      strength: this.setup.strength,
      puttScale: this.puttScale(),
      rng: rng(seed),
    });
    // Presentation only: an injected (DEV A/B) recording keeps its own heading,
    // and the broadcast prototype copies the result it was given.
    if (injected) this.shotHeading = injected.meta.shotHeading;
    const dir = this.director;
    if (dir || this.debugOnShot) {
      const rec = captureShotRecord(
        {
          holeNumber: this.hole.number,
          holeName: this.hole.name,
          pin: this.hole.pin,
          club: this.club,
          putt: this.isPutt(),
          start: this.ball,
          shotHeading: this.shotHeading,
        },
        this.shot,
      );
      this.lastRecord = rec;
      dir?.onShot(rec, this.hole);
      this.debugOnShot?.(this.shot, rec);
    }
    this.flightIdx = 0;
    this.lastSoundZ = 0;
    this.lastSoundIdx = -1;
    const c = this.club;
    sound.play(c === 'PT' ? 'hit_putt' : c === 'DR' || c === '3W' ? 'hit_driver' : c === 'PW' || c === 'SW' ? 'hit_wedge' : 'hit_iron', {
      volume: this.isPutt() ? 0.5 + Math.min(1, this.power) * 0.5 : 0.6 + Math.min(1, this.power) * 0.4,
    });
    this.setPhase('flight');
  }

  /** Plays a thud each time the ball touches down between path samples. */
  private bounceSounds(upTo: number) {
    const path = this.shot!.path;
    for (let j = this.lastSoundIdx + 1; j <= upTo; j++) {
      const z = path[j].z;
      if (z < 0.05 && this.lastSoundZ >= 0.35) {
        const surf = surfaceAt(this.hole, path[j]);
        const vol = Math.min(1, 0.35 + this.lastSoundZ / 12);
        if (surf === 'water') sound.play('splash');
        else sound.play(surf === 'green' || surf === 'fringe' ? 'bounce_green' : surf === 'bunker' ? 'bounce_bunker' : surf === 'rough' ? 'bounce_rough' : 'bounce_fairway', { volume: vol });
        this.lastSoundZ = 0;
      } else if (z > this.lastSoundZ) {
        this.lastSoundZ = z;
      }
    }
    this.lastSoundIdx = Math.max(this.lastSoundIdx, upTo);
  }

  private finishShot() {
    const s = this.shot!;
    this.strokes += 1 + s.penaltyStrokes;
    const toPar = this.strokes - this.hole.par;
    this.reaction =
      s.outcome === 'holed'
        ? toPar < 0 || (!this.isPutt() && this.strokes > 1)
          ? 'celebrate'
          : toPar === 0
            ? 'pumpLow'
            : 'hips'
        : s.outcome === 'water' || s.outcome === 'ob' || s.hitTree
          ? 'frustrated'
          : s.endSurface === 'green' && !this.isPutt()
            ? 'pump'
            : !this.isPutt() && (s.endSurface === 'fairway' || s.endSurface === 'fringe')
              ? 'shade'
              : null;
    this.bust = cutinFor({
      holed: s.outcome === 'holed',
      putt: this.isPutt(),
      strokes: this.strokes,
      par: this.hole.par,
      teeShotOnGreen: this.hole.par === 3 && this.strokes === 1 && s.outcome !== 'holed' && s.endSurface === 'green',
    });
    this.reactionStart = this.time.now;
    if (s.hitTree) sound.play('tree');
    if (s.outcome === 'holed') {
      sound.play('cup');
      this.time.delayedCall(350, () => sound.play(toPar < 0 || this.strokes === 1 ? 'cheer' : toPar === 0 ? 'clap' : 'groan', { volume: toPar < 0 ? 1 : 0.6 }));
    } else if (s.outcome === 'water') {
      this.time.delayedCall(250, () => sound.play('groan', { volume: 0.6 }));
    } else if (s.outcome === 'ob') {
      sound.play('groan', { volume: 0.7 });
    } else if (!this.isPutt() && s.endSurface === 'green' && dist(s.end, this.hole.pin) < 3) {
      sound.play('clap', { volume: 0.7 });
    }
    if (s.outcome === 'holed') {
      this.holed = true;
      const from = dist(s.path[0] ?? this.ball, this.hole.pin);
      this.holedShot = this.isPutt() ? `Holed a ${Math.max(1, Math.round(from * 3))}-foot putt` : `Holed a ${CLUB_BY_ID[this.club].name} from ${Math.round(from)} yds`;
      const name =
        this.strokes === 1
          ? 'HOLE IN ONE!!'
          : toPar <= -3
            ? 'ALBATROSS!!'
            : toPar === -2
              ? 'EAGLE!'
              : toPar === -1
                ? 'BIRDIE!'
                : toPar === 0
                  ? 'PAR'
                  : toPar === 1
                    ? 'BOGEY'
                    : toPar === 2
                      ? 'DOUBLE BOGEY'
                      : `+${toPar}`;
      const how = this.isPutt() ? '' : this.strokes > 1 ? 'IN FROM OFF THE GREEN!' : '';
      this.showBanner(name, how);
    } else if (s.outcome === 'water') {
      this.showBanner('WATER HAZARD!', '1 STROKE PENALTY · REPLAY THE SHOT');
    } else if (s.outcome === 'ob') {
      this.showBanner('OUT OF BOUNDS!', '1 STROKE PENALTY · REPLAY THE SHOT');
    } else {
      const surf = s.endSurface;
      const main = s.hitTree
        ? 'TIMBER!'
        : surf === 'green'
          ? this.isPutt()
            ? dist(s.end, this.hole.pin) < 1
              ? 'SO CLOSE!'
              : 'ON THE GREEN'
            : 'ON THE GREEN!'
          : surf === 'bunker'
            ? 'IN THE BUNKER'
            : surf === 'rough'
              ? 'ROUGH'
              : surf === 'fringe'
                ? 'FRINGE'
                : 'NICE SHOT!';
      const spun = !this.isPutt() && s.spinBack >= 1.5;
      const detail = this.isPutt()
        ? `${dist(s.end, this.hole.pin).toFixed(1)} YDS LEFT`
        : spun
          ? `SPUN BACK ${s.spinBack.toFixed(1)}Y · ${dist(s.end, this.hole.pin) < 20 ? dist(s.end, this.hole.pin).toFixed(1) : Math.round(dist(s.end, this.hole.pin))}Y TO PIN`
          : `CARRY ${Math.round(s.carry)}Y · TOTAL ${Math.round(s.total)}Y · ${Math.round(dist(s.end, this.hole.pin))}Y TO PIN`;
      this.showBanner(spun && surf === 'green' && !s.hitTree ? 'SPIN BACK!' : main, detail);
    }
    this.setPhase('result');
  }

  private afterResult() {
    const s = this.shot!;
    if (this.holed) {
      this.setPhase('done');
      this.handlers.onHoleComplete?.(this.strokes, true, this.holedShot);
      return;
    }
    if (this.strokes >= this.hole.par + MAX_OVER_PAR) {
      this.showBanner('PICKED UP', `MAX ${this.hole.par + MAX_OVER_PAR} STROKES`);
      this.setPhase('done');
      this.time.delayedCall(1400, () => this.handlers.onHoleComplete?.(this.strokes, false));
      return;
    }
    this.ball = { ...s.nextLie };
    this.ballZ = 0;
    this.lie = surfaceAt(this.hole, this.ball);
    this.curve = 0;
    this.spin = 0;
    this.planFromHere();
    this.setPhase('aim');
  }

  // ───────────────────────── Rendering ─────────────────────────

  private project(x: number, y: number, z: number) {
    const f = dirFromHeading(this.cam.heading);
    const r = rightOf(f);
    const rx = x - this.cam.x;
    const ry = y - this.cam.y;
    const d = rx * f.x + ry * f.y;
    if (d < NEAR) return null;
    const lx = rx * r.x + ry * r.y;
    return { x: W / 2 + (lx * FOCAL) / d, y: HORIZON + ((this.cam.h - z) * FOCAL) / d, d, s: FOCAL / d };
  }

  private render() {
    this.g.clear();
    this.hud.clear();
    this.hudTop.clear();
    this.ballG.clear();

    // Backdrop pans with the camera heading; the textured ground is rendered per scanline.
    this.backdrop.tilePositionX = (this.cam.heading * FOCAL) / this.backdrop.tileScaleX;
    const g0 = this.perfProbe ? performance.now() : 0;
    this.ground.render(this.cam);
    if (this.perfProbe) this.perfProbe.groundMs = performance.now() - g0;

    const aiming = this.phase === 'aim' || this.phase === 'power' || this.phase === 'height' || this.phase === 'swing';
    if (aiming) this.drawAimAids();
    this.drawCup();
    this.drawScenery();

    this.spriteShowsBall = this.drawGolfer(this.debugPose ? { spot: this.ball, heading: this.aim, state: this.debugPose } : this.golferState());
    const replay = this.bc?.replaying ? this.bc.frame() : null;
    if (replay) this.drawReplayBall(replay);
    else if (!this.spriteShowsBall && !(this.holed && this.phase !== 'flight')) this.drawBall();
    this.drawCutin();
    this.drawHud();
    if (replay) this.drawReplayOverlay(replay);
  }

  /** Replay (DEV flag): the recorded ball, drawn like the live one, with a short trail. */
  private drawReplayBall(f: ReplayFrame) {
    const sh = this.project(f.pos.x, f.pos.y, 0);
    const b = this.project(f.pos.x, f.pos.y, f.pos.z);
    if (!sh || !b) return;
    const r = Math.max(2.4, 0.06 * b.s);
    this.g.fillStyle(0x000000, 0.3);
    this.g.fillEllipse(sh.x, sh.y, r * 2.2, r * 0.9);
    const g = this.ballG;
    g.setDepth(depthFor(sh.d) + 0.01);
    if (f.pos.z > 0.5 && this.shot) {
      const path = this.shot.path;
      const i = Math.floor(f.idx);
      g.lineStyle(Math.max(1, r * 0.6), 0xffffff, 0.35);
      const pts = [];
      for (let k = Math.max(0, i - 8); k <= i; k += 2) {
        const q = this.project(path[k].x, path[k].y, path[k].z);
        if (q && q.d > 5) pts.push(q);
      }
      if (pts.length > 1) g.strokePoints(pts as unknown as Phaser.Math.Vector2[], false);
    }
    g.lineStyle(1, 0x333333, 0.6);
    g.strokeCircle(b.x, b.y, r + 0.5);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(b.x, b.y, r);
  }

  /** Replay (DEV flag): letterbox bars under the HUD, and a REPLAY bug in the clear bottom bar, only during the replay. */
  private drawReplayOverlay(f: ReplayFrame) {
    if (!this.bcOverlay) {
      this.bcOverlay = this.add.graphics().setDepth(1999); // below the HUD: the HUD stays readable
      this.bcLabel = this.add
        .text(W / 2, H - 22, 'REPLAY', { fontFamily: '"Jersey 15", "Arial Black", sans-serif', fontSize: '26px', color: '#ffe36b' })
        .setOrigin(0.5, 0.5)
        .setStroke('#06160c', 5)
        .setDepth(2101);
    }
    const o = this.bcOverlay;
    o.clear();
    const bar = Math.round(H * 0.08 * f.overlay);
    o.fillStyle(0x000000, 0.92);
    o.fillRect(0, 0, W, bar);
    o.fillRect(0, H - bar, W, bar);
    this.bcLabel!.setVisible(f.overlay > 0.5).setAlpha(Math.min(1, f.overlay * 1.5));
  }

  private setupDecor() {
    this.decor = buildDecor(this.hole);
    this.decor.push({ key: 'flag_red', x: this.hole.pin.x, y: this.hole.pin.y, h: 2.8, shadow: 0 });
    while (this.decorImgs.length < this.decor.length) this.decorImgs.push(this.add.image(0, 0, 'course', 'palm_0').setVisible(false));
    this.decorImgs.forEach((img, i) => {
      const d = this.decor[i];
      if (!d) {
        img.setVisible(false);
        return;
      }
      const f = kitFrame(d.key);
      img.setFrame(d.key).setOrigin(f.ax / f.w, 1);
    });
  }

  private drawScenery() {
    const g = this.g;
    for (let i = 0; i < this.decor.length; i++) {
      const d = this.decor[i];
      const img = this.decorImgs[i];
      const p = this.project(d.x, d.y, 0);
      const f = kitFrame(d.key);
      if (!p || p.d < 1 || p.d > 750) {
        img.setVisible(false);
        continue;
      }
      const sc = (p.s * d.h) / f.h;
      if (f.h * sc < 1.5) {
        img.setVisible(false);
        continue;
      }
      img.setPosition(p.x, p.y).setScale(sc).setDepth(depthFor(p.d)).setVisible(true);
      if (d.shadow > 0 && p.d < 350) {
        g.fillStyle(0x000000, 0.2);
        g.fillEllipse(p.x + d.shadow * p.s * 0.25, p.y, d.shadow * 2.2 * p.s, d.shadow * 0.55 * p.s);
      }
    }
  }

  private drawCup() {
    const p = this.project(this.hole.pin.x, this.hole.pin.y, 0);
    if (!p) return;
    this.g.fillStyle(0x111111, 1);
    this.g.fillEllipse(p.x, p.y, Math.max(3, 0.26 * p.s), Math.max(1.5, 0.09 * p.s));
  }

  private drawAimAids() {
    const g = this.g;
    if (this.isPutt()) {
      // Slope arrows over the green.
      const s = this.hole.greenSlope;
      const mag = Math.hypot(s.x, s.y);
      if (mag > 0.01) {
        const dir = norm(s);
        const step = 3.5;
        for (let gx = -18; gx <= 18; gx += step) {
          for (let gy = -16; gy <= 16; gy += step) {
            const p = { x: this.hole.green.x + gx, y: this.hole.green.y + gy };
            if (surfaceAt(this.hole, p) !== 'green') continue;
            const a = this.project(p.x, p.y, 0);
            if (!a || a.d < 4) continue;
            const b = this.project(p.x + dir.x * 1.1, p.y + dir.y * 1.1, 0);
            if (!b) continue;
            // Cap on-screen length so near arrows don't dominate.
            const vx = b.x - a.x;
            const vy = b.y - a.y;
            const L = Math.hypot(vx, vy) || 1;
            const k2 = Math.min(1, 22 / L);
            const ex = a.x + vx * k2;
            const ey = a.y + vy * k2;
            const alpha = clamp(0.2 + mag * 0.9, 0.25, 0.55);
            g.lineStyle(1.5, 0xffffff, alpha);
            g.lineBetween(a.x, a.y, ex, ey);
            const px = -vy / L;
            const py = vx / L;
            g.fillStyle(0xffffff, alpha + 0.1);
            g.fillTriangle(ex + (vx / L) * 5, ey + (vy / L) * 5, ex + px * 3.5, ey + py * 3.5, ex - px * 3.5, ey - py * 3.5);
          }
        }
      }
      // Aim line.
      const len = Math.min(this.puttScale(), dist(this.ball, this.hole.pin) + 2);
      const d = dirFromHeading(this.aim);
      for (let k = 0.5; k < len; k += 0.6) {
        const p = this.project(this.ball.x + d.x * k, this.ball.y + d.y * k, 0);
        if (p) {
          g.fillStyle(COL.gold, 0.9);
          g.fillCircle(p.x, p.y, Math.max(1.2, p.s * 0.07));
        }
      }
      return;
    }
    if (!this.preview) return;
    // Target cursor at full-power landing (no wind), scaled by current power.
    const t = this.phase === 'power' || this.phase === 'height' || this.phase === 'swing' ? Math.max(0.05, this.power) : 1;
    const tgt = add(this.ball, scale(sub(this.preview, this.ball), t));
    const ring = (radius: number, color: number, alpha: number) => {
      const pts = Array.from({ length: 20 }, (_, i) => {
        const a = (i / 20) * Math.PI * 2;
        return this.project(tgt.x + Math.cos(a) * radius, tgt.y + Math.sin(a) * radius, 0);
      });
      if (pts.some((p) => !p)) return;
      g.lineStyle(2, color, alpha);
      g.strokePoints(pts as unknown as Phaser.Math.Vector2[], true);
    };
    ring(6, 0xffffff, 0.85);
    ring(2.5, COL.red, 0.95);
  }

  private drawBall() {
    const sh = this.project(this.ball.x, this.ball.y, 0);
    const b = this.project(this.ball.x, this.ball.y, this.ballZ);
    if (!sh || !b) return;
    const r = Math.max(2.4, 0.06 * b.s);
    this.g.fillStyle(0x000000, 0.3);
    this.g.fillEllipse(sh.x, sh.y, r * 2.2, r * 0.9);
    const g = this.ballG;
    g.setDepth(depthFor(sh.d) + 0.01);
    g.lineStyle(1, 0x333333, 0.6);
    g.strokeCircle(b.x, b.y, r + 0.5);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(b.x, b.y, r);
    if (this.phase === 'flight' && this.ballZ > 0.5) {
      // Short trail.
      const path = this.shot!.path;
      const i = Math.floor(this.flightIdx);
      g.lineStyle(Math.max(1, r * 0.6), 0xffffff, 0.35);
      const pts = [];
      for (let k = Math.max(0, i - 8); k <= i; k += 2) {
        const q = this.project(path[k].x, path[k].y, path[k].z);
        if (q && q.d > 5) pts.push(q);
      }
      if (pts.length > 1) g.strokePoints(pts as unknown as Phaser.Math.Vector2[], false);
    }
  }

  /** Where the golfer stands: beside the ball while aiming, at the swing spot afterwards. */
  /** DEV/test aid: freeze the golfer in a given pose. */
  debugPose: SwingState | null = null;

  private golferState(): { spot: Vec2; heading: number; state: SwingState } | null {
    const putt = this.isPutt();
    switch (this.phase) {
      case 'aim':
        return { spot: this.ball, heading: this.aim, state: { kind: 'address', putt, idle: this.time.now / 1000 } };
      case 'power':
      case 'height':
        return { spot: this.ball, heading: this.aim, state: { kind: 'backswing', putt, amount: this.power } };
      case 'swing':
        return {
          spot: this.ball,
          heading: this.aim,
          state: { kind: 'downswing', putt, amount: this.power, t: clamp(this.phaseT / (putt ? PUTT_DURATION : SWING_DURATION), 0, 1) },
        };
      case 'flight':
      case 'result':
        if (!this.swingSpot) return null;
        return {
          spot: this.swingSpot,
          heading: this.shotHeading,
          state: { kind: 'finish', putt, amount: this.power, since: this.bc?.replaying ? this.bc.replaySince : (this.time.now - this.hitTime) / 1000 },
        };
      default:
        return null;
    }
  }

  /** Positions the golfer sprite so its drawn ball sits on the real ball. Returns whether that ball is showing. */
  private drawGolfer(info: { spot: Vec2; heading: number; state: SwingState } | null): boolean {
    const img = this.golferImg;
    if (!info) {
      img.setVisible(false);
      return false;
    }
    const choice = frameFor(info.state);
    const side = rightOf(dirFromHeading(info.heading));
    const atlas = this.atlas;
    const off = atlas.ballDx[choice.ballRef] * YDS_PER_PX;
    const feet = this.project(info.spot.x - side.x * off, info.spot.y - side.y * off, 0);
    if (!feet || feet.d < 1.5) {
      img.setVisible(false);
      return false;
    }
    const f = atlas.frames[choice.anim][choice.index];
    img
      .setTexture(`golfer_${this.look}`, frameKey(choice.anim, choice.index))
      .setOrigin(f.ax / f.w, f.ay / f.h)
      .setPosition(feet.x, feet.y)
      .setScale(feet.s * YDS_PER_PX)
      .setDepth(depthFor(feet.d))
      .setVisible(true);
    this.g.fillStyle(0x000000, 0.25);
    this.g.fillEllipse(feet.x + 0.1 * feet.s, feet.y, 0.8 * feet.s, 0.18 * feet.s);
    return choice.showsBall && atlas.drawnBall;
  }

  private drawCutin() {
    const show = !!this.reaction && (this.phase === 'result' || this.phase === 'done') && !this.bc?.replaying;
    this.cutinBg.clear();
    this.cutinImg.setVisible(show);
    if (!show) {
      this.drawBust(0);
      return;
    }
    const t = (this.time.now - this.reactionStart) / 1000;
    const slide = Math.min(1, t / 0.18);
    const x0 = lerp(-170, 14, 1 - (1 - slide) ** 3);
    const y0 = 128;
    this.pixelPanel(this.cutinBg, x0, y0, 150, 200);
    this.cutinBg.fillStyle(0x2f86e8, 1);
    this.cutinBg.fillRoundedRect(x0 + 8, y0 + 8, 134, 184, 5);
    this.cutinBg.fillStyle(0x7cd0ff, 0.5);
    this.cutinBg.fillRect(x0 + 8, y0 + 8, 134, 70);
    this.cutinBg.fillStyle(0x3fa45e, 1);
    this.cutinBg.fillRect(x0 + 8, y0 + 160, 134, 32);
    const rf = reactionFrame(this.reaction!, t);
    const f = this.atlas.frames[rf.anim][rf.index];
    this.cutinImg
      .setTexture(`golfer_${this.look}`, frameKey(rf.anim, rf.index))
      .setOrigin(f.ax / f.w, f.ay / f.h)
      .setPosition(x0 + 68, y0 + 186)
      .setScale(1.1);
    this.drawBust(t);
  }

  /** The big arcade-style reaction portrait for standout moments: slides in from the right, holds, slides out. */
  private drawBust(t: number) {
    this.bustBg.clear();
    const show = this.bust !== null && t < 2.6 && !!this.reaction && (this.phase === 'result' || this.phase === 'done') && !this.bc?.replaying;
    this.bustImg.setVisible(show);
    if (!show) return;
    const size = 236;
    const into = Math.min(1, t / 0.22);
    const out = t > 2.3 ? (t - 2.3) / 0.3 : 0;
    const x = W - 22 - size + (1 - (1 - (1 - into) ** 3)) * (size + 40) + out * (size + 40);
    const y = 118;
    this.pixelPanel(this.bustBg, x - 8, y - 8, size + 16, size + 16);
    this.bustImg.setTexture(`cutin_${this.look}`, `pose_${this.bust}`).setPosition(x, y).setDisplaySize(size, size);
  }

  /** Gold-framed felt panel in the kit's 9-slice style. */
  private pixelPanel(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number) {
    g.fillStyle(UI.ink, 1);
    g.fillRoundedRect(x - 3, y - 3, w + 6, h + 6, 11);
    g.fillStyle(UI.gold, 1);
    g.fillRoundedRect(x, y, w, h, 9);
    g.fillStyle(UI.goldDark, 1);
    g.fillRoundedRect(x + 2, y + 4, w - 4, h - 6, 8);
    g.fillStyle(UI.goldLight, 1);
    g.fillRect(x + 8, y + 1, w - 16, 2);
    g.fillStyle(UI.ink, 1);
    g.fillRoundedRect(x + 5, y + 5, w - 10, h - 10, 6);
    g.fillStyle(UI.felt, 1);
    g.fillRoundedRect(x + 7, y + 7, w - 14, h - 14, 5);
    g.fillStyle(0xffffff, 0.05);
    g.fillRect(x + 9, y + 8, w - 18, Math.max(2, (h - 16) * 0.45));
  }

  private drawHud() {
    const h = this.hud;
    const top = this.hudTop;
    const T = this.texts;
    const showPlay = this.phase !== 'intro';

    // Hole card with portrait.
    this.pixelPanel(h, 6, 6, 284, 110);
    h.fillStyle(UI.ink, 1);
    h.fillRect(15, 13, 96, 92);
    h.fillStyle(UI.gold, 1);
    h.fillRect(16, 14, 94, 90);
    this.portrait.setTexture(`portrait_${this.look}`).setDisplaySize(90, 86).setVisible(true);
    T.hole.setText(`HOLE ${this.hole.number}`);
    T.holeInfo.setText(`PAR ${this.hole.par} · ${holeYardage(this.hole)}Y · ${this.setup.holeIndex + 1}/${this.setup.holeCount}`);
    T.stroke.setText(`STROKE ${this.strokes + (this.phase === 'result' || this.phase === 'done' ? 0 : 1)}`);
    T.skins.setText(this.setup.statusLine);

    // Distance + lie.
    const toPin = dist(this.ball, this.hole.pin);
    T.toPin.setText(showPlay ? `${toPin < 20 ? toPin.toFixed(1) : Math.round(toPin)}Y TO PIN` : '').setVisible(showPlay);
    const lieFx = LIE_EFFECT[this.lie];
    T.lie.setText(showPlay ? `LIE: ${lieFx.label.toUpperCase()}${lieFx.power < 1 && !this.isPutt() ? `  -${Math.round((1 - (this.club === 'SW' && this.lie === 'bunker' ? 0.9 : lieFx.power)) * 100)}%` : ''}` : '').setVisible(showPlay);

    // Wind compass: gold ring.
    const wx = 883;
    const wy = 50;
    h.fillStyle(UI.ink, 1);
    h.fillCircle(wx, wy, 45);
    h.fillStyle(UI.gold, 1);
    h.fillCircle(wx, wy, 42);
    h.fillStyle(UI.goldDark, 1);
    h.fillCircle(wx, wy + 2, 38);
    h.fillStyle(UI.ink, 1);
    h.fillCircle(wx, wy, 36);
    h.fillStyle(UI.felt, 1);
    h.fillCircle(wx, wy, 33);
    const rel = this.setup.wind.heading - this.cam.heading;
    if (this.setup.wind.mph > 0) {
      const ax = Math.sin(rel);
      const ay = -Math.cos(rel);
      const L = 14 + Math.min(12, this.setup.wind.mph) * 1.4;
      const px = -ay;
      const py = ax;
      const tail = { x: wx - ax * L * 0.5, y: wy - ay * L * 0.5 };
      const tip = { x: wx + ax * L * 0.5, y: wy + ay * L * 0.5 };
      h.lineStyle(9, UI.ink, 1);
      h.lineBetween(tail.x, tail.y, tip.x, tip.y);
      h.lineStyle(6, 0x3a9cf0, 1);
      h.lineBetween(tail.x, tail.y, tip.x, tip.y);
      h.fillStyle(UI.ink, 1);
      h.fillTriangle(tip.x + ax * 14, tip.y + ay * 14, tip.x + px * 11, tip.y + py * 11, tip.x - px * 11, tip.y - py * 11);
      h.fillStyle(0x7cd0ff, 1);
      h.fillTriangle(tip.x + ax * 10, tip.y + ay * 10, tip.x + px * 8, tip.y + py * 8, tip.x - px * 8, tip.y - py * 8);
    } else {
      h.fillStyle(0x7cd0ff, 1);
      h.fillCircle(wx, wy, 5);
    }

    this.drawMinimap();
    T.wind.setText(this.setup.wind.mph ? `WIND ${this.setup.wind.mph} MPH` : 'CALM');

    const aiming = this.phase === 'aim' || this.phase === 'power' || this.phase === 'height' || this.phase === 'swing';
    for (const k of ['club', 'clubName', 'carry', 'curve', 'meterLabel', 'heightLabel', 'spin', 'hint']) T[k].setVisible(aiming);
    if (!aiming) return;

    // Club card with a little club-head icon.
    this.pixelPanel(h, 8, 414, 154, 104);
    const club = CLUB_BY_ID[this.club];
    T.club.setText(this.club);
    T.clubName.setText(club.name.toUpperCase());
    T.carry.setText(this.isPutt() ? `${this.puttScale()}Y SCALE` : `${Math.round(this.carryNow())}Y CARRY`);
    this.drawClubIcon(top, 126, 448, this.club);

    // Curve: crosshair over a ball.
    if (!this.isPutt()) {
      this.pixelPanel(h, 170, 414, 106, 104);
      const cx = 223;
      const cy = 478;
      top.fillStyle(UI.ink, 1);
      top.fillCircle(cx, cy, 17);
      top.fillStyle(0xffffff, 1);
      top.fillCircle(cx, cy, 15);
      top.fillStyle(0xd8dde2, 1);
      top.fillCircle(cx + 4, cy + 4, 8);
      top.fillStyle(0xffffff, 1);
      top.fillCircle(cx - 1, cy - 1, 9);
      const off = this.curve * 4;
      top.lineStyle(2, 0xe5342b, 1);
      top.lineBetween(cx - 22 + off, cy, cx + 22 + off, cy);
      top.lineBetween(cx + off, cy - 22, cx + off, cy + 22);
      top.strokeCircle(cx + off, cy, 7);
      if (this.curve !== 0) {
        const dir = Math.sign(this.curve);
        top.lineStyle(3, UI.gold, 1);
        top.beginPath();
        top.arc(cx - dir * 6, cy, 24, dir > 0 ? -2.4 : -0.74, dir > 0 ? -1.2 : -1.94, dir < 0);
        top.strokePath();
      }
      T.curve.setText(this.curve === 0 ? 'STRAIGHT' : `${this.curve < 0 ? 'DRAW' : 'FADE'} ${Math.abs(this.curve)}`);
    } else T.curve.setVisible(false);

    // Power meter: green → yellow → red segments.
    const mx = 302;
    const my = 460;
    const mw = 352;
    const mh = 30;
    this.pixelPanel(h, 288, 422, 380, 84);
    top.fillStyle(UI.ink, 1);
    top.fillRect(mx - 3, my - 3, mw + 6, mh + 6);
    top.fillStyle(0x7a5a10, 1);
    top.fillRect(mx - 1, my - 1, mw + 2, mh + 2);
    top.fillStyle(0x04100a, 1);
    top.fillRect(mx, my, mw, mh);
    const p = this.phase === 'aim' ? 0 : this.power;
    const SEG = 20;
    const sw = mw / SEG;
    for (let i = 0; i < SEG; i++) {
      const filled = (i + 1) / SEG <= p + 0.0001;
      const c = METER[Math.min(METER.length - 1, Math.floor((i / SEG) * METER.length))];
      top.fillStyle(c, filled ? 1 : 0.22);
      top.fillRect(mx + 2 + i * sw, my + 3, sw - 3, mh - 6);
      if (filled) {
        top.fillStyle(0xffffff, 0.35);
        top.fillRect(mx + 2 + i * sw, my + 3, sw - 3, 4);
      }
    }
    const full = this.isPutt() ? this.puttScale() : this.carryNow();
    const pinFrac = clamp((this.isPutt() ? toPin : toPin * (1 - CLUB_BY_ID[this.club].rollFactor)) / full, 0, 1.2);
    if (pinFrac <= 1) {
      const px2 = mx + pinFrac * mw;
      top.fillStyle(UI.ink, 1);
      top.fillTriangle(px2, my + 1, px2 - 10, my - 15, px2 + 10, my - 15);
      top.fillStyle(0xe5342b, 1);
      top.fillTriangle(px2, my - 2, px2 - 7, my - 13, px2 + 7, my - 13);
    }
    T.meterLabel.setText(this.isPutt() ? 'PUTT POWER' : `POWER ${Math.round(p * 100)}%`);

    // Height meter.
    if (!this.isPutt()) {
      this.pixelPanel(h, 678, 382, 48, 136);
      const hx = 690;
      const hy = 410;
      const hh2 = 96;
      top.fillStyle(UI.ink, 1);
      top.fillRect(hx - 2, hy - 2, 28, hh2 + 4);
      top.fillStyle(0x04100a, 1);
      top.fillRect(hx, hy, 24, hh2);
      const hv = this.phase === 'height' || this.phase === 'swing' ? this.height : 0.5;
      top.fillStyle(0x2f86e8, 1);
      top.fillRect(hx + 3, hy + hh2 - hv * hh2, 18, hv * hh2);
      top.fillStyle(0x9fdcff, 1);
      top.fillRect(hx + 3, hy + hh2 - hv * hh2, 18, 3);
      top.fillStyle(0xffffff, 0.9);
      top.fillRect(hx - 4, hy + hh2 / 2 - 1, 32, 2);
      T.heightLabel.setText('HEIGHT');
      T.spin.setText(this.phase === 'height' || this.phase === 'swing' ? (this.spin === 1 ? 'TOPSPIN' : this.spin === -1 ? 'BACKSPIN' : '') : '');
    } else {
      T.heightLabel.setVisible(false);
      T.spin.setVisible(false);
    }

    T.hint.setText(
      this.phase === 'intro'
        ? '[SPACE] SKIP   [F] FLYOVER'
        : this.phase === 'flyover'
          ? '[SPACE] BACK TO THE BALL'
          : this.phase === 'aim'
        ? this.isPutt()
          ? '<-> AIM (SHIFT FINE)   ^v CLUB   [SPACE] PUTT   [F] FLYOVER'
          : '<-> AIM   ^v CLUB   Z/X CURVE   [SPACE] SWING   [F] FLYOVER'
        : this.phase === 'power'
          ? '[SPACE] SET POWER'
          : this.phase === 'height'
            ? '[SPACE] SET HEIGHT   HOLD ^ TOPSPIN / v BACKSPIN'
            : '',
    );
  }

  /** Tiny pixel club head: wood, iron blade or putter. */
  private drawClubIcon(g: Phaser.GameObjects.Graphics, x: number, y: number, club: ClubId) {
    g.lineStyle(3, UI.ink, 1);
    g.lineBetween(x + 14, y - 22, x + 4, y + 2);
    g.lineStyle(2, 0xd6dbe0, 1);
    g.lineBetween(x + 14, y - 22, x + 4, y + 2);
    if (club === 'DR' || club === '3W') {
      g.fillStyle(UI.ink, 1);
      g.fillEllipse(x - 2, y + 6, 32, 20);
      g.fillStyle(0x3b3f46, 1);
      g.fillEllipse(x - 2, y + 5, 28, 16);
      g.fillStyle(0x8a9099, 1);
      g.fillEllipse(x - 5, y + 2, 14, 6);
    } else if (club === 'PT') {
      g.fillStyle(UI.ink, 1);
      g.fillRect(x - 14, y + 1, 26, 10);
      g.fillStyle(0xb9c0c8, 1);
      g.fillRect(x - 12, y + 3, 22, 6);
    } else {
      g.fillStyle(UI.ink, 1);
      g.fillTriangle(x - 12, y + 12, x + 8, y + 12, x + 6, y - 4);
      g.fillStyle(0xc9d0d8, 1);
      g.fillTriangle(x - 9, y + 10, x + 6, y + 10, x + 5, y - 1);
    }
  }

  /** Paints the hole top-down from the course tiles, with tree and flag icons. */
  private buildMinimap() {
    const P = this.polys.corridor;
    const minX = Math.min(...P.map((p) => p.x));
    const maxX = Math.max(...P.map((p) => p.x));
    const minY = Math.min(...P.map((p) => p.y));
    const maxY = Math.max(...P.map((p) => p.y));
    const k = Math.min(MAP.w / (maxX - minX + 6), MAP.h / (maxY - minY + 6));
    const cx = MAP.w / 2 - ((minX + maxX) / 2) * k;
    const cy = MAP.h / 2 + ((minY + maxY) / 2) * k;
    this.mapXf = { k, cx, cy };
    const ctx = this.minimapTex.getContext();
    const img = ctx.createImageData(MAP.w, MAP.h);
    const buf = new Uint32Array(img.data.buffer);
    const ypp = 1 / k;
    for (let y = 0; y < MAP.h; y++) {
      for (let x = 0; x < MAP.w; x++) {
        const wx = (x + 0.5 - cx) / k;
        const wy = (cy - (y + 0.5)) / k;
        buf[y * MAP.w + x] = this.ground.colorAt(wx, wy, ypp);
      }
    }
    ctx.putImageData(img, 0, 0);
    // Tree icons and the flag, from the course atlas.
    const atlas = this.textures.get('course').getSourceImage() as HTMLImageElement;
    ctx.imageSmoothingEnabled = false;
    const icon = (key: string, x: number, y: number, h: number) => {
      const f = kitFrame(key);
      const s = h / f.h;
      ctx.drawImage(atlas, f.x, f.y, f.w, f.h, Math.round(x - f.ax * s), Math.round(y - f.h * s), Math.round(f.w * s), Math.round(f.h * s));
    };
    const trees = this.decor.filter((d) => /^(palm|oak|pine)/.test(d.key)).sort((a, b) => b.y - a.y);
    for (const t of trees) icon(t.key, cx + t.x * k, cy - t.y * k, 13);
    icon('flag_red', cx + this.hole.pin.x * k + 1, cy - this.hole.pin.y * k, 14);
    this.minimapTex.refresh();
  }

  private drawMinimap() {
    const h = this.hud;
    const g = this.hudTop;
    this.pixelPanel(h, MAP.x - 12, MAP.y - 32, MAP.w + 24, MAP.h + 44);
    h.fillStyle(UI.ink, 1);
    h.fillRect(MAP.x - 2, MAP.y - 2, MAP.w + 4, MAP.h + 4);
    const { k, cx, cy } = this.mapXf;
    const m = (p: Vec2) => ({ x: MAP.x + cx + p.x * k, y: MAP.y + cy - p.y * k });
    const b = m(this.ball);
    if ((this.phase === 'aim' || this.phase === 'power' || this.phase === 'height') && this.preview && !this.isPutt()) {
      const tgt = m(this.preview);
      g.lineStyle(4, UI.ink, 0.8);
      g.lineBetween(b.x, b.y, tgt.x, tgt.y);
      g.lineStyle(2, 0xffffff, 1);
      g.lineBetween(b.x, b.y, tgt.x, tgt.y);
      g.strokeCircle(tgt.x, tgt.y, 5);
    }
    if (this.phase === 'flight' && this.shot) {
      g.lineStyle(2, 0xffe36b, 1);
      const path = this.shot.path;
      const i = Math.floor(this.flightIdx);
      const pts = [];
      for (let j = 0; j <= Math.min(i, path.length - 1); j += 4) pts.push(m(path[j]));
      if (pts.length > 1) g.strokePoints(pts as Phaser.Math.Vector2[], false);
    }
    if (this.phase === 'flyover') {
      // Camera marker: a yellow wedge pointing where the flyover is looking.
      const c = m(this.cam);
      const d = dirFromHeading(this.cam.heading);
      const tip = { x: c.x + d.x * 11, y: c.y - d.y * 11 };
      const side = { x: -d.y * 5, y: -d.x * 5 };
      g.fillStyle(UI.ink, 1);
      g.fillCircle(c.x, c.y, 6);
      g.fillStyle(0xffe36b, 1);
      g.fillTriangle(tip.x, tip.y, c.x + side.x, c.y + side.y, c.x - side.x, c.y - side.y);
      g.fillCircle(c.x, c.y, 4);
    }
    g.fillStyle(UI.ink, 1);
    g.fillCircle(b.x, b.y, 5);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(b.x, b.y, 3.5);
  }
}

export function createRoundGame(parent: HTMLElement, scene: RoundScene): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: W,
    height: H,
    backgroundColor: '#0b1f16',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    input: { gamepad: true },
    banner: false,
    scene: [scene],
  });
}

export const ROUND_CLUBS = CLUBS;
