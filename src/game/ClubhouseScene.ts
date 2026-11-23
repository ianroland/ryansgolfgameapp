/**
 * Clubhouse scene (Phaser, 2.5D): Ryan's home, its decor and trophy cabinets.
 *
 * The scene is a pure view: React pushes a `SceneViewModel` in and receives
 * click callbacks out. It never touches persistence or game rules.
 */
import * as Phaser from 'phaser';
import { getCatalogItem } from '../catalog/items';
import { getPropertyDefinition, STARTER_PAD_ID, type PlacementZone, type PropertyDefinition } from '../catalog/properties';
import type { TrophyDefinition } from '../catalog/trophies';
import sofaUrl from '../assets/ui/sofa.png';
import lampUrl from '../assets/ui/lamp.png';
import tableUrl from '../assets/ui/coffee_table.png';
import shelfUrl from '../assets/ui/bookshelf.png';
import pinkJacketUrl from '../assets/legacy/pink_jacket.png';
import roomStarterUrl from '../assets/rooms/starter_pad.png';
import roomCondoUrl from '../assets/rooms/coastal_condo.png';
import roomHillsideUrl from '../assets/rooms/hillside_house.png';
import roomEstateUrl from '../assets/rooms/champions_estate.png';
import roomGrandUrl from '../assets/rooms/grand_clubhouse.png';
import pinkJacketCaseUrl from '../assets/legacy/pink_jacket_case.png';
import plantUrl from '../assets/ui/plant.png';
import painting0Url from '../assets/ui/painting_0.png';
import painting1Url from '../assets/ui/painting_1.png';
import rugUrl from '../assets/ui/rug.png';
import windowUrl from '../assets/ui/window.png';
import shoesUrl from '../assets/ui/shoes.png';
import bagUrl from '../assets/ui/golf_bag.png';

const INTERIOR: Record<string, string> = {
  sofa: sofaUrl, lamp: lampUrl, coffee_table: tableUrl, bookshelf: shelfUrl, plant: plantUrl,
  painting_0: painting0Url, painting_1: painting1Url, rug: rugUrl, window: windowUrl, shoes: shoesUrl, golf_bag: bagUrl,
};

/** Fixed interior sprites every home has: [key, centre x, base y, scale]. */
/**
 * Empty-room art per home (author-supplied, art/source_sheets/rooms). `floorY` is where the
 * floor meets the back wall in the art; the room is scaled so that line sits on the scene's
 * back-wall base (FLOOR_Y) and the floor reaches the bottom edge, centred, side walls cropped.
 */
/** Where the back wall meets the floor in the room art scenes (cabinets stand on this line). */
const FLOOR_Y = 360;

const ROOM_ART: Record<string, { url: string; w: number; h: number; floorY: number }> = {
  starter_pad: { url: roomStarterUrl, w: 740, h: 298, floorY: 201 },
  coastal_condo: { url: roomCondoUrl, w: 749, h: 298, floorY: 174 },
  hillside_house: { url: roomHillsideUrl, w: 738, h: 319, floorY: 222 },
  champions_estate: { url: roomEstateUrl, w: 755, h: 319, floorY: 214 },
  grand_clubhouse: { url: roomGrandUrl, w: 1349, h: 376, floorY: 265 },
};

const FURNISHING: [string, number, number, number][] = [
  ['window', 595, 196, 0.8], // between the centre and right cabinets
  ['shoes', 858, 530, 1],
  ['golf_bag', 905, 530, 1],
];

const FINISH = {
  oak: { body: 0x9a6a3a, dark: 0x6b4522, light: 0xb98551, interior: 0x2a1a0d },
  walnut: { body: 0x5a3a24, dark: 0x3a2414, light: 0x7a5236, interior: 0x1a0f08 },
  glass: { body: 0x8fa4b0, dark: 0x4d5e68, light: 0xc9d8e0, interior: 0x1c2a33 },
  gold: { body: 0xc9a227, dark: 0x7a5f10, light: 0xffe27a, interior: 0x24180a },
} as const;

export const SCENE_W = 960;
export const SCENE_H = 540;

export type ZoneHighlight = 'compatible' | 'occupied' | 'unavailable' | 'selected';

export interface PlacedFurnitureVM {
  furnitureId: string;
  zoneId: string;
  catalogItemId: string;
  slots: ({ trophyId: string; style: TrophyDefinition['style'] } | null)[];
}

export interface SceneViewModel {
  mode: 'view' | 'edit';
  home: PropertyDefinition;
  placed: PlacedFurnitureVM[];
  highlight: Record<string, ZoneHighlight>;
  selectedFurnitureId: string | null;
  selectedTrophyId: string | null;
  /** When choosing a cabinet slot for a trophy. */
  slotPicking: boolean;
  /** The Pink Jacket display case (one case, shown once Ryan has won a Pink Jacket). */
  pinkJacketCase?: { trophyId: string } | null;
}

export interface SceneCallbacks {
  onZoneClick?: (zoneId: string) => void;
  onFurnitureClick?: (furnitureId: string) => void;
  onTrophyClick?: (trophyId: string) => void;
  onSlotClick?: (furnitureId: string, slotIndex: number) => void;
}

const BASE = {
  ceiling: 0x7a4a2a,
  backWall: 0xe4c8a0,
  leftWall: 0xcfae84,
  rightWall: 0xc7a57b,
  baseboard: 0x5a3519,
  crown: 0x8a5428,
  crownDark: 0x4e2c14,
  floorA: 0xa8602c,
  floorB: 0x8f4f24,
  floorC: 0xb86e34,
  seam: 0x5a2f14,
  oak: 0x9a6a3a,
  oakDark: 0x6b4522,
  oakLight: 0xb98551,
  glass: 0xd8eef3,
  gold: 0xe8b931,
  goldDark: 0xb5891b,
  silver: 0xcfd6dd,
  ok: 0x3ddc84,
  warn: 0xf29e4c,
  muted: 0x8a8f98,
  select: 0x4fc3f7,
};

export class ClubhouseScene extends Phaser.Scene {
  private vm: SceneViewModel = {
    mode: 'view',
    home: getPropertyDefinition(STARTER_PAD_ID),
    placed: [],
    highlight: {},
    selectedFurnitureId: null,
    selectedTrophyId: null,
    slotPicking: false,
  };
  private callbacks: SceneCallbacks = {};
  private dynamic?: Phaser.GameObjects.Container;
  private room?: Phaser.GameObjects.Container;
  private roomFor = '';
  private zones: PlacementZone[] = getPropertyDefinition(STARTER_PAD_ID).zones;

  constructor() {
    super('clubhouse');
  }

  setCallbacks(cb: SceneCallbacks) {
    this.callbacks = cb;
  }

  setViewModel(vm: SceneViewModel) {
    this.vm = vm;
    this.zones = vm.home.zones;
    if (this.room && this.roomFor !== vm.home.id) this.renderRoom();
    if (this.dynamic) this.renderDynamic();
  }

  preload() {
    for (const [k, url] of Object.entries(INTERIOR)) this.load.image(`int_${k}`, url);
    this.load.image('pink_jacket', pinkJacketUrl);
    for (const [id, r] of Object.entries(ROOM_ART)) this.load.image(`room_${id}`, r.url);
    this.load.image('pink_jacket_case', pinkJacketCaseUrl);
  }

  create() {
    for (const k of Object.keys(INTERIOR)) this.textures.get(`int_${k}`).setFilter(Phaser.Textures.FilterMode.NEAREST);
    for (const id of Object.keys(ROOM_ART)) this.textures.get(`room_${id}`).setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.room = this.add.container(0, 0);
    this.renderRoom();
    this.dynamic = this.add.container(0, 0);
    this.renderDynamic();
  }

  private renderRoom() {
    const room = this.room!;
    room.removeAll(true);
    this.roomFor = this.vm.home.id;
    const g = this.add.graphics();
    room.add(g);
    this.drawRoom(g, room);
  }

  // ───────────────────────── Static room ─────────────────────────

  private drawRoom(g: Phaser.GameObjects.Graphics, room: Phaser.GameObjects.Container) {
    const art = ROOM_ART[this.vm.home.id];
    if (art && this.textures.exists(`room_${this.vm.home.id}`)) {
      // Floor line on the back-wall base (y 360), floor down to the bottom edge, whole view covered.
      const k = Math.max(540 / art.h, FLOOR_Y / art.floorY, (540 - FLOOR_Y) / (art.h - art.floorY), 960 / art.w);
      const bg = this.add.image(480, FLOOR_Y - art.floorY * k, `room_${this.vm.home.id}`).setOrigin(0.5, 0).setScale(k);
      room.add(bg);
      room.sendToBack(bg);
      for (const [key, x, base, sc] of FURNISHING) {
        if (key === 'window') continue; // the room art has its own windows
        g.fillStyle(0x000000, 0.18);
        g.fillEllipse(x, base - 2, this.textures.get(`int_${key}`).getSourceImage().width * sc * 0.95, 12 * sc);
        room.add(this.add.image(x, base, `int_${key}`).setOrigin(0.5, 1).setScale(sc));
      }
      this.drawPlaque(g, room);
      return;
    }
    const P = this.vm.home.palette;
    const C = { ...BASE, ceiling: P.ceiling, backWall: P.backWall, leftWall: P.leftWall, rightWall: P.rightWall, floorA: P.floor[0], floorB: P.floor[1], floorC: P.floor[2], seam: P.seam, crown: P.trim };
    const poly = (color: number, pts: number[][], alpha = 1) => {
      g.fillStyle(color, alpha);
      g.fillPoints(pts.map(([x, y]) => new Phaser.Math.Vector2(x, y)), true);
    };
    // Ceiling + walls (single-point perspective).
    poly(C.ceiling, [[0, 0], [960, 0], [820, 30], [140, 30]]);
    poly(C.backWall, [[140, 30], [820, 30], [820, 304], [140, 304]]);
    poly(C.leftWall, [[0, 0], [140, 30], [140, 304], [0, 540]]);
    poly(C.rightWall, [[960, 0], [820, 30], [820, 304], [960, 540]]);
    // Subtle wall texture bands.
    for (let y = 40; y < 300; y += 24) poly(0xffffff, [[140, y], [820, y], [820, y + 1], [140, y + 1]], 0.06);

    // Wood floor: perspective planks converging toward the back wall.
    const planks = 16;
    for (let i = 0; i < planks; i++) {
      const bx0 = (960 / planks) * i;
      const bx1 = (960 / planks) * (i + 1);
      const tx0 = 140 + (680 / planks) * i;
      const tx1 = 140 + (680 / planks) * (i + 1);
      const tone = [C.floorA, C.floorB, C.floorC][i % 3];
      poly(tone, [[tx0, 304], [tx1, 304], [bx1, 540], [bx0, 540]]);
    }
    // Horizontal seams spaced with depth, staggered per plank.
    g.lineStyle(1, C.seam, 0.45);
    const rows = [318, 336, 358, 386, 420, 462, 512];
    rows.forEach((y, r) => {
      const t = (y - 304) / 236;
      for (let i = 0; i < planks; i += 1) {
        if ((i + r) % 2 === 0) continue;
        const x0 = 140 + (680 / planks) * i + ((960 / planks) * i - (140 + (680 / planks) * i)) * t;
        const w = 680 / planks + (960 / planks - 680 / planks) * t;
        g.lineBetween(x0, y, x0 + w, y);
      }
    });
    g.lineStyle(1, C.seam, 0.3);
    for (let i = 1; i < planks; i++) g.lineBetween(140 + (680 / planks) * i, 304, (960 / planks) * i, 540);

    // Baseboards.
    poly(C.baseboard, [[140, 296], [820, 296], [820, 304], [140, 304]]);
    poly(C.baseboard, [[140, 296], [140, 304], [0, 540], [0, 524]], 0.9);
    poly(C.baseboard, [[820, 296], [820, 304], [960, 540], [960, 524]], 0.9);

    // Wood crown moulding.
    poly(C.crown, [[140, 30], [820, 30], [820, 40], [140, 40]]);
    poly(C.crownDark, [[140, 40], [820, 40], [820, 43], [140, 43]]);

    // Ceiling light.
    g.fillStyle(0xfff6d5, 0.1);
    g.fillEllipse(480, 70, 460, 120);
    g.fillStyle(0x6b4a2a, 1);
    g.fillRect(452, 6, 56, 6);
    g.fillStyle(0xfff3c4, 1);
    g.fillEllipse(480, 16, 92, 20);
    g.fillStyle(0xffffff, 0.8);
    g.fillEllipse(480, 13, 60, 8);

    // Furniture from the interior kit.
    for (const [key, x, base, sc] of FURNISHING) {
      if (key !== 'rug' && !key.startsWith('painting') && key !== 'window') {
        g.fillStyle(0x000000, 0.18);
        const w = this.textures.get(`int_${key}`).getSourceImage().width * sc;
        g.fillEllipse(x, base - 2, w * 0.95, 12 * sc);
      }
      room.add(this.add.image(x, base, `int_${key}`).setOrigin(0.5, 1).setScale(sc));
    }

    this.drawPlaque(g, room);
  }

  private drawPlaque(g: Phaser.GameObjects.Graphics, room: Phaser.GameObjects.Container) {
    // Wooden name plaque.
    const P = this.vm.home.palette;
    g.fillStyle(0x3b2412, 1);
    g.fillRoundedRect(16, 14, 176, 40, 6);
    g.fillStyle(P.plaque, 1);
    g.fillRoundedRect(19, 17, 170, 34, 5);
    g.lineStyle(2, 0xc77d3a, 1);
    g.strokeRoundedRect(22, 20, 164, 28, 4);
    room.add(
      this.add
        .text(104, 34, this.vm.home.name.toUpperCase(), { fontFamily: '"Jersey 15", Arial, sans-serif', fontSize: this.vm.home.name.length > 14 ? '21px' : '26px', color: '#fff1d0' })
        .setOrigin(0.5)
        .setShadow(2, 2, '#2a160a', 0, false, true),
    );
    room.add(
      this.add
        .text(104, 60, `CLUBHOUSE LV ${this.vm.home.tier}`, { fontFamily: '"Tiny5", Arial, sans-serif', fontSize: '12px', color: '#fff1d0' })
        .setOrigin(0.5)
        .setShadow(1, 1, '#2a160a', 0, false, true),
    );
  }

  // ───────────────────────── Dynamic layer ─────────────────────────

  private renderDynamic() {
    const layer = this.dynamic!;
    layer.removeAll(true);
    const placedByZone = new Map(this.vm.placed.map((p) => [p.zoneId, p]));
    const g = this.add.graphics();
    layer.add(g);

    // Zone markers: faint in view mode, highlighted in edit mode.
    for (const zone of this.zones) {
      const occupied = placedByZone.has(zone.id);
      const left = zone.x - zone.width / 2;
      const top = zone.baseY - zone.height;
      const hl = this.vm.highlight[zone.id];
      if (this.vm.mode === 'view') {
        if (!occupied && !zone.reserved && !zone.accepts.includes('wall_art')) {
          g.lineStyle(1, 0x5a4a35, 0.25);
          g.strokeEllipse(zone.x, zone.baseY - 4, zone.width * 0.9, 14);
        }
        continue;
      }
      const C = BASE;
      const color =
        hl === 'compatible' ? C.ok : hl === 'selected' ? C.select : hl === 'occupied' ? C.warn : C.muted;
      g.fillStyle(color, hl === 'unavailable' || !hl ? 0.08 : 0.18);
      g.fillRect(left, top, zone.width, zone.height);
      g.lineStyle(2, color, hl === 'unavailable' || !hl ? 0.35 : 0.9);
      g.strokeRect(left, top, zone.width, zone.height);
      const label = zone.reserved ? `${zone.label}\n(bigger home)` : zone.label;
      layer.add(
        this.add
          .text(zone.x, top + 6, label, {
            fontFamily: 'Arial, sans-serif',
            fontSize: '11px',
            color: '#ffffff',
            backgroundColor: 'rgba(15,42,29,0.75)',
            padding: { x: 4, y: 2 },
            align: 'center',
          })
          .setOrigin(0.5, 0),
      );
      if (!occupied) {
        const hit = this.add.zone(zone.x, zone.baseY - zone.height / 2, zone.width, zone.height).setInteractive({ useHandCursor: true });
        hit.on('pointerdown', () => this.callbacks.onZoneClick?.(zone.id));
        layer.add(hit);
      }
    }

    // Furniture, back to front (rugs and wall art underneath everything).
    const flat = (p: PlacedFurnitureVM) => ['rug', 'wall_art'].includes(getCatalogItem(p.catalogItemId).placementTag);
    const ordered = [...this.vm.placed].sort(
      (a, b) => Number(flat(b)) - Number(flat(a)) || (this.zone(a.zoneId)?.baseY ?? 0) - (this.zone(b.zoneId)?.baseY ?? 0),
    );
    for (const p of ordered) {
      const zone = this.zone(p.zoneId);
      if (!zone) continue;
      const item = getCatalogItem(p.catalogItemId);
      if (item.sprite) this.drawDecor(layer, zone, p, item.sprite, item.placementTag);
      else this.drawCabinet(layer, zone, p);
    }

    // The Pink Jacket display case: one freestanding case on the open floor (author-supplied art).
    const jc = this.vm.pinkJacketCase;
    if (jc && this.textures.exists('pink_jacket_case')) {
      const x = 640;
      const baseY = 500;
      const g = this.add.graphics();
      g.fillStyle(0x000000, 0.22);
      g.fillEllipse(x, baseY - 3, 140, 14);
      layer.add(g);
      const img = this.add.image(x, baseY, 'pink_jacket_case').setOrigin(0.5, 1).setDisplaySize(150 * (383 / 360), 150);
      if (this.vm.selectedTrophyId === jc.trophyId) {
        const sel = this.add.graphics();
        sel.lineStyle(3, BASE.select, 1);
        sel.strokeRect(img.x - img.displayWidth / 2 - 4, img.y - img.displayHeight - 4, img.displayWidth + 8, img.displayHeight + 8);
        layer.add(sel);
      }
      layer.add(img);
      if (this.vm.mode === 'view') {
        img.setInteractive({ useHandCursor: true });
        img.on('pointerdown', () => this.callbacks.onTrophyClick?.(jc.trophyId));
      }
    }
  }

  private drawDecor(layer: Phaser.GameObjects.Container, zone: PlacementZone, p: PlacedFurnitureVM, sprite: string, tag: string) {
    const key = `int_${sprite}`;
    if (!this.textures.exists(key)) return;
    const sc = zone.scale;
    if (tag !== 'rug' && tag !== 'wall_art') {
      const g = this.add.graphics();
      g.fillStyle(0x000000, 0.18);
      g.fillEllipse(zone.x, zone.baseY - 2, this.textures.get(key).getSourceImage().width * sc * 0.95, 12 * sc);
      layer.add(g);
    }
    const img = this.add.image(zone.x, zone.baseY, key).setOrigin(0.5, 1).setScale(sc);
    layer.add(img);
    if (this.vm.selectedFurnitureId === p.furnitureId) {
      const g = this.add.graphics();
      g.lineStyle(3, BASE.select, 1);
      g.strokeRect(img.x - img.displayWidth / 2 - 4, img.y - img.displayHeight - 4, img.displayWidth + 8, img.displayHeight + 8);
      layer.add(g);
    }
    if (this.vm.mode === 'edit') {
      img.setInteractive({ useHandCursor: true });
      img.on('pointerdown', () => this.callbacks.onFurnitureClick?.(p.furnitureId));
    }
  }

  private zone(id: string) {
    return this.zones.find((z) => z.id === id);
  }

  private drawCabinet(layer: Phaser.GameObjects.Container, zone: PlacementZone, p: PlacedFurnitureVM) {
    const C = BASE;
    const item = getCatalogItem(p.catalogItemId);
    const F = FINISH[item.finish ?? 'oak'];
    const cols = p.slots.length > 4 ? 2 : 1;
    const rows = Math.ceil(p.slots.length / cols);
    const s = zone.scale;
    const w = (cols === 2 ? 112 : 94) * s;
    const h = (rows > 4 ? 172 : 164) * s;
    const left = zone.x - w / 2;
    const top = zone.baseY - h;
    const g = this.add.graphics();
    layer.add(g);

    g.fillStyle(0x000000, 0.22);
    g.fillEllipse(zone.x, zone.baseY, w * 1.15, 12 * s);
    g.fillStyle(F.dark, 1);
    g.fillRect(left - 3 * s, top - 6 * s, w + 6 * s, 10 * s); // crown
    if (item.finish === 'gold') {
      g.fillStyle(C.gold, 1);
      g.fillTriangle(zone.x - 16 * s, top - 6 * s, zone.x + 16 * s, top - 6 * s, zone.x, top - 18 * s);
    }
    g.fillStyle(F.body, 1);
    g.fillRect(left, top, w, h);
    g.fillStyle(F.light, 0.5);
    for (let i = 0; i < 5; i++) g.fillRect(left + 4 * s + i * (w / 5), top + 4 * s, 2, h - 8 * s); // grain
    const inset = 8 * s;
    const innerTop = top + 10 * s;
    const innerH = h - 34 * s;
    const innerW = w - inset * 2;
    const shelfH = innerH / rows;
    const colW = innerW / cols;
    const ts = s * (cols === 2 ? 0.62 : 1) * (rows > 4 ? 0.85 : 1); // trophy scale
    g.fillStyle(F.interior, 1);
    g.fillRect(left + inset, innerTop, innerW, innerH);
    g.fillStyle(0xfff3c4, 0.25); // shelf light
    g.fillRect(left + inset, innerTop, innerW, 4 * s);
    g.fillStyle(F.dark, 1);
    g.fillRect(left, zone.baseY - 22 * s, w, 22 * s); // plinth drawer
    g.fillStyle(C.gold, 1);
    g.fillRect(zone.x - 8 * s, zone.baseY - 13 * s, 16 * s, 3 * s);

    for (let r = 0; r < rows; r++) {
      const shelfBottom = innerTop + shelfH * (r + 1);
      g.fillStyle(F.light, 1);
      g.fillRect(left + inset, shelfBottom - 3 * s, innerW, 3 * s);
    }
    p.slots.forEach((slot, i) => {
      const r = Math.floor(i / cols);
      const col = i % cols;
      const shelfBottom = innerTop + shelfH * (r + 1);
      const cx = left + inset + colW * (col + 0.5);
      if (slot) this.drawTrophy(g, cx, shelfBottom - 3 * s, ts, slot.style, slot.trophyId === this.vm.selectedTrophyId);
      if (slot?.style === 'pink_jacket') {
        // The Pink Jacket: the author-supplied sprite, standing on the shelf.
        const jh = Math.min(shelfH - 8 * s, 34 * ts);
        layer.add(this.add.image(cx, shelfBottom - 3 * s, 'pink_jacket').setOrigin(0.5, 1).setDisplaySize(jh * (425 / 480), jh));
      }

      const hit = this.add.zone(cx, shelfBottom - shelfH / 2, colW, shelfH).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', (_ptr: unknown, _x: number, _y: number, ev: { stopPropagation: () => void }) => {
        ev?.stopPropagation?.();
        if (this.vm.slotPicking) this.callbacks.onSlotClick?.(p.furnitureId, i);
        else if (slot) this.callbacks.onTrophyClick?.(slot.trophyId);
        else this.callbacks.onFurnitureClick?.(p.furnitureId);
      });
      layer.add(hit);

      if (this.vm.slotPicking) {
        g.lineStyle(2, slot ? C.warn : C.ok, 0.9);
        g.strokeRect(cx - colW / 2 + 2, shelfBottom - shelfH + 2, colW - 4, shelfH - 4);
      }
    });

    // Glass doors.
    g.fillStyle(C.glass, item.finish === 'glass' ? 0.08 : 0.16);
    g.fillRect(left + inset, innerTop, innerW, innerH);
    g.lineStyle(2, F.dark, 1);
    g.lineBetween(zone.x, innerTop, zone.x, innerTop + innerH);
    g.lineStyle(1, 0xffffff, 0.35);
    g.lineBetween(left + inset + 6, innerTop + 8, left + inset + 20, innerTop + 40);

    if (this.vm.selectedFurnitureId === p.furnitureId) {
      g.lineStyle(3, C.select, 1);
      g.strokeRect(left - 6, top - 10 * s, w + 12, h + 14 * s);
    }

    if (this.vm.mode === 'edit') {
      const body = this.add.zone(zone.x, zone.baseY - 11 * s, w, 22 * s).setInteractive({ useHandCursor: true });
      body.on('pointerdown', () => this.callbacks.onFurnitureClick?.(p.furnitureId));
      layer.add(body);
    }
  }

  private drawTrophy(
    g: Phaser.GameObjects.Graphics,
    cx: number,
    shelfY: number,
    s: number,
    style: TrophyDefinition['style'],
    selected: boolean,
  ) {
    const C = BASE;
    if (selected) {
      g.fillStyle(C.select, 0.35);
      g.fillCircle(cx, shelfY - 14 * s, 18 * s);
    }
    if (style === 'medal') {
      // Ribboned medal on a stand.
      g.fillStyle(0x3b2a1a, 1);
      g.fillRect(cx - 9 * s, shelfY - 5 * s, 18 * s, 5 * s);
      g.fillStyle(0x2f7fe0, 1);
      g.fillTriangle(cx - 7 * s, shelfY - 34 * s, cx - 1 * s, shelfY - 34 * s, cx - 2 * s, shelfY - 20 * s);
      g.fillStyle(0xd8261f, 1);
      g.fillTriangle(cx + 7 * s, shelfY - 34 * s, cx + 1 * s, shelfY - 34 * s, cx + 2 * s, shelfY - 20 * s);
      g.fillStyle(C.silver, 1);
      g.fillCircle(cx, shelfY - 15 * s, 8 * s);
      g.fillStyle(0xffffff, 0.6);
      g.fillCircle(cx - 2 * s, shelfY - 17 * s, 2.5 * s);
      return;
    }
    if (style === 'albatross_ball') {
      // Commemorative ball on a tee, under a glass dome on a walnut base.
      g.fillStyle(0x3b2a1a, 1);
      g.fillRect(cx - 11 * s, shelfY - 6 * s, 22 * s, 6 * s);
      g.fillStyle(C.gold, 1);
      g.fillRect(cx - 6 * s, shelfY - 4 * s, 12 * s, 2 * s);
      g.fillStyle(0xd9c7a0, 1);
      g.fillRect(cx - 1 * s, shelfY - 13 * s, 2 * s, 7 * s);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(cx, shelfY - 17 * s, 5 * s);
      g.fillStyle(0xc9d2da, 1);
      g.fillCircle(cx + 1.5 * s, shelfY - 16 * s, 1 * s);
      g.fillCircle(cx - 1.5 * s, shelfY - 18.5 * s, 1 * s);
      g.lineStyle(2, 0xd9f0ff, 0.6);
      g.strokeEllipse(cx, shelfY - 18 * s, 18 * s, 26 * s);
      g.fillStyle(0xffffff, 0.45);
      g.fillRect(cx - 6 * s, shelfY - 26 * s, 2 * s, 6 * s);
      return;
    }
    if (style === 'albatross_plaque') {
      // Walnut plaque: a gold bird over five gold balls.
      g.fillStyle(0x3b2a1a, 1);
      g.fillRect(cx - 14 * s, shelfY - 32 * s, 28 * s, 30 * s);
      g.fillStyle(0x5b3d22, 1);
      g.fillRect(cx - 11 * s, shelfY - 29 * s, 22 * s, 24 * s);
      g.fillStyle(C.gold, 1);
      g.fillRect(cx - 9 * s, shelfY - 24 * s, 18 * s, 2 * s);
      g.fillRect(cx - 2 * s, shelfY - 26 * s, 4 * s, 5 * s);
      g.fillTriangle(cx - 9 * s, shelfY - 24 * s, cx - 9 * s, shelfY - 22 * s, cx - 11 * s, shelfY - 21 * s);
      g.fillTriangle(cx + 9 * s, shelfY - 24 * s, cx + 9 * s, shelfY - 22 * s, cx + 11 * s, shelfY - 21 * s);
      for (let i = 0; i < 5; i++) g.fillCircle(cx + (i - 2) * 4 * s, shelfY - 13 * s, 1.5 * s);
      g.fillStyle(0xfbf1d6, 1);
      g.fillRect(cx - 7 * s, shelfY - 9 * s, 14 * s, 2 * s);
      return;
    }
    if (style === 'pink_jacket') return; // drawn as the jacket sprite (see renderCabinet)
    if (style === 'card_plaque') {
      // Framed tour card.
      g.fillStyle(0x3b2a1a, 1);
      g.fillRect(cx - 13 * s, shelfY - 30 * s, 26 * s, 28 * s);
      g.fillStyle(0xfbf1d6, 1);
      g.fillRect(cx - 10 * s, shelfY - 27 * s, 20 * s, 22 * s);
      g.fillStyle(0x1d4fa0, 1);
      g.fillRect(cx - 10 * s, shelfY - 27 * s, 20 * s, 6 * s);
      g.fillStyle(0xd8261f, 1);
      g.fillRect(cx - 6 * s, shelfY - 17 * s, 12 * s, 2 * s);
      g.fillRect(cx - 6 * s, shelfY - 12 * s, 8 * s, 2 * s);
      return;
    }
    const metal = style === 'pro_cup' ? 0xc58a4a : style === 'epson_cup' || style === 'state_cup' ? C.silver : C.gold;
    const k = style === 'major_cup' ? 1.3 : style === 'lpga_cup' ? 1.15 : 1;
    g.fillStyle(0x3b2a1a, 1);
    g.fillRect(cx - 10 * s * k, shelfY - 6 * s, 20 * s * k, 6 * s);
    g.fillStyle(metal, 1);
    g.fillRect(cx - 2 * s, shelfY - 13 * s * k, 4 * s, 8 * s * k);
    g.fillTriangle(cx - 11 * s * k, shelfY - 30 * s * k, cx + 11 * s * k, shelfY - 30 * s * k, cx, shelfY - 12 * s * k);
    g.lineStyle(2, metal, 1);
    g.strokeCircle(cx - 11 * s * k, shelfY - 25 * s * k, 4 * s * k);
    g.strokeCircle(cx + 11 * s * k, shelfY - 25 * s * k, 4 * s * k);
    if (style === 'major_cup' || style === 'lpga_cup') {
      g.fillStyle(C.goldDark, 1);
      g.fillCircle(cx, shelfY - 33 * s * k, 3 * s);
    }
    if (style === 'major_cup') {
      g.fillStyle(0xffffff, 0.5);
      g.fillCircle(cx - 4 * s, shelfY - 26 * s * k, 2 * s);
    }
  }
}

export function createClubhouseGame(parent: HTMLElement, scene: ClubhouseScene): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: SCENE_W,
    height: SCENE_H,
    backgroundColor: '#0f2a1d',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_HORIZONTALLY },
    banner: false,
    scene: [scene],
  });
}
