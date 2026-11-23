/**
 * Textured pseudo-3D ground ("Mode 7" style).
 *
 * Each hole is rasterised once into a surface map (2 cells per yard). Every
 * frame, each screen row below the horizon is mapped back to a line on the
 * ground; each pixel looks up its surface and samples that surface's tile
 * texture (mirror-tiled, mipmapped to avoid shimmer), with edge shading for
 * bunker lips, water banks and the first cut, plus distance haze.
 *
 * Renders at half resolution into a canvas texture, scaled up with nearest
 * filtering for a crisp 32-bit-era look.
 */
import * as Phaser from 'phaser';
import { corridorLine, FRINGE_WIDTH, inShape, type CourseTheme, type HoleDef } from '../golf/course';
import { dirFromHeading, distToPolyline, inEllipse, projectOnPolyline, rightOf } from '../golf/math';

export const SURF = { OB: 0, ROUGH: 1, FAIRWAY: 2, FRINGE: 3, GREEN: 4, BUNKER: 5, WATER: 6, TEE: 7 } as const;
// Fairway and tee use the smooth grass tile; mowing stripes are generated (straight bands that follow the hole).
export const TILE_KEYS = ['deep', 'rough', 'green', 'rough2', 'green', 'sand', 'water', 'green'] as const;
/** Brightness per surface so fairway, tee and green read apart. */
const SHADE = [1, 1, 0.86, 1, 1.05, 1, 1, 0.9];
/** Width of each mowing stripe, in yards along the hole. */
const STRIPE_YDS = 10;
/** Darkening of the "into the sun" stripes. */
const STRIPE_DARK = 0.2;
/** World yards covered by one (un-mirrored) tile, per surface id. */
const TILE_YDS = [6, 5, 9, 4, 5, 4, 7, 4];
const CELLS_PER_YD = 2;
/** Which grade key tints each surface id (OB, rough, fairway, fringe, green, bunker, water, tee). */
const GRADE_KEYS = ['deep', 'rough', 'fairway', 'fairway', 'green', 'sand', 'water', 'fairway'] as const;
const TILE = 64;

interface Mip {
  size: number;
  px: Uint32Array;
}

export interface GroundCam {
  x: number;
  y: number;
  h: number;
  heading: number;
}

export class GroundRenderer {
  readonly gw: number;
  readonly gh: number;
  private tex: Phaser.Textures.CanvasTexture;
  private img: ImageData;
  private buf: Uint32Array;
  private mips: Mip[][] = [];
  private grid!: Uint8Array;
  private edge!: Uint8Array;
  /** 1 on the darker mowing stripes. */
  private stripe!: Uint8Array;
  private gx0 = 0;
  private gy0 = 0;
  private gwCells = 0;
  private ghCells = 0;
  private haze = [150, 190, 140];
  /** Per-surface course grade: target colour per unit of brightness, and blend amount. */
  private gR = SHADE.map(() => 1);
  private gG = SHADE.map(() => 1);
  private gB = SHADE.map(() => 1);
  private gA = SHADE.map(() => 0);
  readonly image: Phaser.GameObjects.Image;

  constructor(
    scene: Phaser.Scene,
    private readonly screenW: number,
    private readonly screenH: number,
    private readonly horizon: number,
    private readonly focal: number,
    scaleDown = 2,
  ) {
    this.gw = Math.round(screenW / scaleDown);
    this.gh = Math.round((screenH - horizon) / scaleDown);
    this.tex = scene.textures.createCanvas('ground', this.gw, this.gh)!;
    this.tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.img = this.tex.getContext().createImageData(this.gw, this.gh);
    this.buf = new Uint32Array(this.img.data.buffer);
    this.image = scene.add.image(0, horizon, 'ground').setOrigin(0, 0).setDisplaySize(screenW, screenH - horizon);
    for (const key of TILE_KEYS) this.mips.push(buildMips(scene, `tile_${key}`));
  }

  /** Haze colour for the far distance (match the backdrop's base). */
  setHaze(rgb: [number, number, number]) {
    this.haze = rgb;
  }

  /** Course colour grade: blends each surface toward a target hue, keeping its texture's brightness. */
  setGrade(grade: CourseTheme['grade']) {
    for (let i = 0; i < SHADE.length; i++) {
      const g = grade?.[GRADE_KEYS[i]];
      if (!g) {
        this.gA[i] = 0;
        continue;
      }
      const lum = Math.max(1, 0.3 * g[0] + 0.59 * g[1] + 0.11 * g[2]);
      this.gR[i] = g[0] / lum;
      this.gG[i] = g[1] / lum;
      this.gB[i] = g[2] / lum;
      this.gA[i] = g[3];
    }
  }

  /** Applies the grade to one ABGR texel. */
  private graded(c: number, s: number): number {
    const a = this.gA[s];
    if (!a) return c;
    const R = c & 255;
    const G = (c >> 8) & 255;
    const B = (c >> 16) & 255;
    const l = 0.3 * R + 0.59 * G + 0.11 * B;
    const ia = 1 - a;
    const r2 = Math.min(255, R * ia + this.gR[s] * l * a) | 0;
    const g2 = Math.min(255, G * ia + this.gG[s] * l * a) | 0;
    const b2 = Math.min(255, B * ia + this.gB[s] * l * a) | 0;
    return 0xff000000 | (b2 << 16) | (g2 << 8) | r2;
  }

  /** Rasterises a hole's surfaces. Mirrors the physics' surface priorities. */
  setHole(h: HoleDef) {
    const corridor = corridorLine(h);
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of corridor) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    const m = h.corridorHalfWidth + 12;
    this.gx0 = minX - m;
    this.gy0 = minY - m;
    this.gwCells = Math.ceil((maxX - minX + 2 * m) * CELLS_PER_YD);
    this.ghCells = Math.ceil((maxY - minY + 2 * m) * CELLS_PER_YD);
    const W = this.gwCells;
    const H = this.ghCells;
    const grid = new Uint8Array(W * H);
    const p = { x: 0, y: 0 };
    for (let cy = 0; cy < H; cy++) {
      p.y = this.gy0 + (cy + 0.5) / CELLS_PER_YD;
      for (let cx = 0; cx < W; cx++) {
        p.x = this.gx0 + (cx + 0.5) / CELLS_PER_YD;
        let s: number = SURF.OB;
        if (distToPolyline(p, corridor) <= h.corridorHalfWidth) {
          if (h.water.some((w) => inShape(p, w))) s = SURF.WATER;
          else if (h.bunkers.some((b) => inShape(p, b))) s = SURF.BUNKER;
          else if (inEllipse(p, h.green)) s = SURF.GREEN;
          else if (inEllipse(p, h.green, FRINGE_WIDTH)) s = SURF.FRINGE;
          else if (Math.abs(p.x) <= 5 && p.y >= -5 && p.y <= 5) s = SURF.TEE;
          else if (h.fairways.some((f) => inShape(p, f))) s = SURF.FAIRWAY;
          else s = SURF.ROUGH;
        }
        grid[cy * W + cx] = s;
      }
    }
    // Edge codes: 1 = this cell borders a different surface.
    const edge = new Uint8Array(W * H);
    for (let cy = 1; cy < H - 1; cy++) {
      for (let cx = 1; cx < W - 1; cx++) {
        const i = cy * W + cx;
        const s = grid[i];
        if (grid[i - 1] !== s || grid[i + 1] !== s || grid[i - W] !== s || grid[i + W] !== s) edge[i] = 1;
      }
    }
    this.grid = grid;
    this.edge = edge;
    // Mowing stripes: bands across the fairway by distance along the hole's path, so they bend with doglegs.
    const stripe = new Uint8Array(W * H);
    for (let cy = 0; cy < H; cy++) {
      p.y = this.gy0 + (cy + 0.5) / CELLS_PER_YD;
      for (let cx = 0; cx < W; cx++) {
        const sv = grid[cy * W + cx];
        if (sv !== SURF.FAIRWAY && sv !== SURF.TEE) continue;
        p.x = this.gx0 + (cx + 0.5) / CELLS_PER_YD;
        const band = Math.floor(projectOnPolyline(p, h.centerline).along / STRIPE_YDS);
        stripe[cy * W + cx] = ((band % 2) + 2) % 2;
      }
    }
    this.stripe = stripe;
  }

  /** Surface id at a world point (OB outside the map). */
  surfaceIdAt(wx: number, wy: number): number {
    const cxi = ((wx - this.gx0) * CELLS_PER_YD) | 0;
    const cyi = ((wy - this.gy0) * CELLS_PER_YD) | 0;
    if (cxi < 0 || cyi < 0 || cxi >= this.gwCells || cyi >= this.ghCells) return SURF.OB;
    return this.grid[cyi * this.gwCells + cxi];
  }

  /** Textured colour (ABGR) for a world point, for top-down maps. */
  colorAt(wx: number, wy: number, yardsPerPixel: number): number {
    const s = this.surfaceIdAt(wx, wy);
    const cxi = ((wx - this.gx0) * CELLS_PER_YD) | 0;
    const cyi = ((wy - this.gy0) * CELLS_PER_YD) | 0;
    const e = cxi > 0 && cyi > 0 && cxi < this.gwCells && cyi < this.ghCells ? this.edge[cyi * this.gwCells + cxi] : 0;
    const tpy = TILE / TILE_YDS[s];
    const lvl = Math.min(6, Math.max(0, Math.log2(Math.max(1, tpy * yardsPerPixel * 0.5)) | 0));
    const mip = this.mips[s][lvl];
    const size = mip.size;
    const kk = tpy / (1 << lvl);
    let u = Math.floor(wx * kk) % (2 * size);
    let v = Math.floor(wy * kk) % (2 * size);
    if (u < 0) u += 2 * size;
    if (v < 0) v += 2 * size;
    if (u >= size) u = 2 * size - 1 - u;
    if (v >= size) v = 2 * size - 1 - v;
    const st = cxi > 0 && cyi > 0 && cxi < this.gwCells && cyi < this.ghCells ? this.stripe[cyi * this.gwCells + cxi] : 0;
    const k = SHADE[s] * (st ? 1 - STRIPE_DARK : 1) * (s === SURF.OB ? 0.6 : e ? 0.75 : 1);
    const c = this.graded(mip.px[v * size + u], s);
    const R = Math.min(255, (c & 255) * k) | 0;
    const G = Math.min(255, ((c >> 8) & 255) * k) | 0;
    const B = Math.min(255, ((c >> 16) & 255) * k) | 0;
    return 0xff000000 | (B << 16) | (G << 8) | R;
  }

  render(cam: GroundCam) {
    const { gw, gh, buf, grid, edge, gA } = this;
    const f = dirFromHeading(cam.heading);
    const r = rightOf(f);
    const rowScale = (this.screenH - this.horizon) / gh;
    const colScale = this.screenW / gw;
    const W = this.gwCells;
    const H = this.ghCells;
    const [hr, hg, hb] = this.haze;
    const ob = 0xff2a5a2e; // ABGR fallback for beyond the map

    for (let j = 0; j < gh; j++) {
      const sy = (j + 0.5) * rowScale; // pixels below horizon
      const d = (cam.h * this.focal) / sy;
      const step = (colScale * d) / this.focal; // yards per output pixel
      const cx0 = cam.x + f.x * d - r.x * ((this.screenW / 2 - colScale / 2) * d) / this.focal;
      const cy0 = cam.y + f.y * d - r.y * ((this.screenW / 2 - colScale / 2) * d) / this.focal;
      const dx = r.x * step;
      const dy = r.y * step;
      const fog = Math.min(0.9, Math.max(0, (d - 140) / 520));
      // Stripes fade out with distance so they never shimmer near the horizon.
      const stripeK = STRIPE_DARK * Math.min(1, Math.max(0, 1 - (d - 120) / 280));
      const fogInv = 1 - fog;
      const fr = hr * fog;
      const fg = hg * fog;
      const fb = hb * fog;
      let wx = cx0;
      let wy = cy0;
      const rowBase = j * gw;
      for (let i = 0; i < gw; i++, wx += dx, wy += dy) {
        const cxi = ((wx - this.gx0) * CELLS_PER_YD) | 0;
        const cyi = ((wy - this.gy0) * CELLS_PER_YD) | 0;
        let s = 0;
        let e = 0;
        let st = 0;
        if (cxi >= 0 && cyi >= 0 && cxi < W && cyi < H) {
          const k = cyi * W + cxi;
          s = grid[k];
          e = edge[k];
          st = this.stripe[k];
        } else if (d > 2000) {
          buf[rowBase + i] = ob;
          continue;
        }
        // Mip level from texels per output pixel.
        const tpy = TILE / TILE_YDS[s];
        const tpp = tpy * step;
        const lvl = tpp <= 1 ? 0 : Math.min(6, Math.log2(tpp) | 0);
        const mip = this.mips[s][lvl];
        const size = mip.size;
        const kk = tpy / (1 << lvl);
        let u = Math.floor(wx * kk) % (2 * size);
        let v = Math.floor(wy * kk) % (2 * size);
        if (u < 0) u += 2 * size;
        if (v < 0) v += 2 * size;
        if (u >= size) u = 2 * size - 1 - u;
        if (v >= size) v = 2 * size - 1 - v;
        let c = gA[s] ? this.graded(mip.px[v * size + u], s) : mip.px[v * size + u];
        const shade = SHADE[s] * (st ? 1 - stripeK : 1);
        let R = Math.min(255, (c & 255) * shade) | 0;
        let G = Math.min(255, ((c >> 8) & 255) * shade) | 0;
        let B = Math.min(255, ((c >> 16) & 255) * shade) | 0;
        if (e) {
          if (s === SURF.BUNKER) {
            // Grass lip: a darker, greener rim.
            R = (R * 0.45) | 0;
            G = (G * 0.7) | 0;
            B = (B * 0.35) | 0;
          } else if (s === SURF.WATER) {
            // Bank: light foam.
            R = Math.min(255, R + 90);
            G = Math.min(255, G + 90);
            B = Math.min(255, B + 60);
          } else {
            R = (R * 0.78) | 0;
            G = (G * 0.82) | 0;
            B = (B * 0.78) | 0;
          }
        }
        if (fog > 0) {
          R = (R * fogInv + fr) | 0;
          G = (G * fogInv + fg) | 0;
          B = (B * fogInv + fb) | 0;
        }
        c = 0xff000000 | (B << 16) | (G << 8) | R;
        buf[rowBase + i] = c;
      }
    }
    this.tex.putData(this.img, 0, 0);
    this.tex.refresh();
  }
}

/** Reads a 64×64 tile texture and builds box-filtered mip levels down to 1×1. */
function buildMips(scene: Phaser.Scene, key: string): Mip[] {
  const src = scene.textures.get(key).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  const c = document.createElement('canvas');
  c.width = TILE;
  c.height = TILE;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(src, 0, 0, TILE, TILE);
  const data = ctx.getImageData(0, 0, TILE, TILE).data;
  let level: Mip = { size: TILE, px: new Uint32Array(data.buffer.slice(0)) };
  const out = [level];
  while (level.size > 1) {
    const n = level.size / 2;
    const px = new Uint32Array(n * n);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        let r = 0;
        let g = 0;
        let b = 0;
        for (const [ox, oy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
          const c0 = level.px[(y * 2 + oy) * level.size + x * 2 + ox];
          r += c0 & 255;
          g += (c0 >> 8) & 255;
          b += (c0 >> 16) & 255;
        }
        px[y * n + x] = 0xff000000 | ((b >> 2) << 16) | ((g >> 2) << 8) | (r >> 2);
      }
    }
    level = { size: n, px };
    out.push(level);
  }
  return out;
}
