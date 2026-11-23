/**
 * Homes (clubhouse levels) and their placement zones.
 *
 * Every home shares one room layout; better homes unlock more zones, new
 * colours and bigger furniture, and help Ryan recover. Zones locked at the
 * current level are kept as `reserved` so the editor can show what's coming.
 * Coordinates are in the clubhouse scene's logical 960×540 space; `baseY` is
 * where furniture stands and `x` is the horizontal centre.
 */

export type PlacementTag = 'display_cabinet' | 'seating' | 'table' | 'rug' | 'plant' | 'lamp' | 'shelf' | 'wall_art';

export interface PlacementZone {
  id: string;
  label: string;
  /** Tags of furniture this zone accepts. */
  accepts: PlacementTag[];
  /** Locked zones are valid zones that open at a better home. */
  reserved: boolean;
  /** Home tier that unlocks this zone. */
  minTier: number;
  x: number;
  baseY: number;
  width: number;
  height: number;
  /** Visual scale for furniture drawn here (pseudo-depth). */
  scale: number;
}

export interface RoomPalette {
  ceiling: number;
  backWall: number;
  leftWall: number;
  rightWall: number;
  floor: [number, number, number];
  seam: number;
  trim: number;
  plaque: number;
}

export interface PropertyDefinition {
  id: string;
  name: string;
  tier: number;
  theme: string;
  /** Purchase price in dollars (0 for the starter). */
  price: number;
  minFame: number;
  /** Weekly living cost while you live here. */
  livingCost: number;
  /** Extra energy recovered each week. */
  energyBonus: number;
  palette: RoomPalette;
  zones: PlacementZone[];
}

export const STARTER_PAD_ID = 'starter_pad';

type ZoneSpec = Omit<PlacementZone, 'reserved'>;

// Room layout (960 x 540; the room art's back wall fills the width, floor from y 360 down). Wall art
// hangs on the plain wall either side of the room's windows. Trophy cabinets stand in a row on
// the back wall; the side walls stay clear; everything else sits on the floor. Zone ids are stable save
// keys: `left_corner` and `right_corner` are now the left and right back-wall cabinet spots.
const ALL_ZONES: ZoneSpec[] = [
  { id: 'left_corner', label: 'Back wall (left)', accepts: ['display_cabinet'], minTier: 1, x: 250, baseY: 360, width: 112, height: 176, scale: 1 },
  { id: 'back_wall', label: 'Back wall (centre)', accepts: ['display_cabinet'], minTier: 1, x: 480, baseY: 360, width: 112, height: 176, scale: 1 },
  { id: 'right_corner', label: 'Back wall (right)', accepts: ['display_cabinet'], minTier: 1, x: 710, baseY: 360, width: 112, height: 176, scale: 1 },
  { id: 'art_left', label: 'Wall art (left)', accepts: ['wall_art'], minTier: 1, x: 130, baseY: 250, width: 100, height: 72, scale: 0.85 },
  { id: 'rug_spot', label: 'Floor', accepts: ['rug'], minTier: 1, x: 300, baseY: 513, width: 190, height: 44, scale: 1 },
  { id: 'table_spot', label: 'Coffee table', accepts: ['table'], minTier: 1, x: 300, baseY: 493, width: 120, height: 60, scale: 1 },
  { id: 'plant_spot', label: 'Plant', accepts: ['plant'], minTier: 1, x: 470, baseY: 464, width: 64, height: 116, scale: 0.9 },
  { id: 'lamp_spot', label: 'Lamp', accepts: ['lamp', 'plant'], minTier: 2, x: 150, baseY: 452, width: 50, height: 120, scale: 1 },
  { id: 'sofa_spot', label: 'Seating', accepts: ['seating'], minTier: 2, x: 300, baseY: 448, width: 200, height: 100, scale: 1 },
  { id: 'shelf_spot', label: 'Shelving', accepts: ['shelf'], minTier: 2, x: 790, baseY: 475, width: 110, height: 135, scale: 1 },
  { id: 'art_back', label: 'Wall art (right)', accepts: ['wall_art'], minTier: 3, x: 860, baseY: 250, width: 100, height: 72, scale: 0.85 },
  { id: 'plant_right', label: 'Front plant', accepts: ['plant'], minTier: 3, x: 120, baseY: 529, width: 60, height: 100, scale: 0.85 },
];

function zonesFor(tier: number): PlacementZone[] {
  return ALL_ZONES.map((z) => ({ ...z, reserved: z.minTier > tier }));
}

function home(def: Omit<PropertyDefinition, 'zones'>): PropertyDefinition {
  return { ...def, zones: zonesFor(def.tier) };
}

export const PROPERTY_DEFINITIONS: Record<string, PropertyDefinition> = {
  [STARTER_PAD_ID]: home({
    id: STARTER_PAD_ID,
    name: 'Starter Pad',
    tier: 1,
    theme: 'A one-bed apartment above a taco shop in Dry Creek.',
    price: 0,
    minFame: 0,
    livingCost: 250,
    energyBonus: 0,
    palette: {
      ceiling: 0x7a4a2a, backWall: 0xe4c8a0, leftWall: 0xcfae84, rightWall: 0xc7a57b,
      floor: [0xa8602c, 0x8f4f24, 0xb86e34], seam: 0x5a2f14, trim: 0x8a5428, plaque: 0x8a4f22,
    },
  }),
  coastal_condo: home({
    id: 'coastal_condo',
    name: 'Coastal Condo',
    tier: 2,
    theme: 'Ocean breeze, a balcony and a building gym.',
    price: 45_000,
    minFame: 25,
    livingCost: 600,
    energyBonus: 4,
    palette: {
      ceiling: 0x4e6b7a, backWall: 0xd8e6e4, leftWall: 0xbfd2d0, rightWall: 0xb6cac8,
      floor: [0xc9a67a, 0xb8946a, 0xd4b388], seam: 0x7d6142, trim: 0x5f8090, plaque: 0x2f5866,
    },
  }),
  hillside_house: home({
    id: 'hillside_house',
    name: 'Hillside House',
    tier: 3,
    theme: 'Canyon views, a home studio and a backyard putting green.',
    price: 400_000,
    minFame: 50,
    livingCost: 1_500,
    energyBonus: 8,
    palette: {
      ceiling: 0x3a3330, backWall: 0xefe6d6, leftWall: 0xd9cdb8, rightWall: 0xd1c4ad,
      floor: [0x6e4a33, 0x5c3d2a, 0x7c573d], seam: 0x2e1d12, trim: 0x2e2a28, plaque: 0x3a3330,
    },
  }),
  champions_estate: home({
    id: 'champions_estate',
    name: "Champion's Estate",
    tier: 4,
    theme: 'Marble, oak and a trophy room worthy of a major champion.',
    price: 2_500_000,
    minFame: 75,
    livingCost: 4_000,
    energyBonus: 12,
    palette: {
      ceiling: 0x1f2a3a, backWall: 0x2f4058, leftWall: 0x273750, rightWall: 0x24324a,
      floor: [0xe9e4da, 0xd9d2c4, 0xf2eee6], seam: 0xa59c8b, trim: 0xc9a227, plaque: 0x1f2a3a,
    },
  }),  // Approved 22 Nov as the fifth home. Bought with career earnings only: no Pink Jacket
  // or major required. PRICE IS A PROPOSAL awaiting author approval; living cost and
  // energy follow the existing tier steps and are provisional with it.
  grand_clubhouse: home({
    id: 'grand_clubhouse',
    name: 'Grand Clubhouse',
    tier: 5,
    theme: 'A clubhouse of your own, with floor-to-ceiling windows over the course.',
    price: 7_500_000,
    minFame: 75,
    livingCost: 7_500,
    energyBonus: 16,
    palette: {
      ceiling: 0x3a2414, backWall: 0x6b4522, leftWall: 0x5a3a24, rightWall: 0x543620,
      floor: [0xc98a4a, 0xb8793c, 0xd49a5a], seam: 0x7a4a22, trim: 0xd4a537, plaque: 0x3a2414,
    },
  }),
};

export const HOMES = Object.values(PROPERTY_DEFINITIONS).sort((a, b) => a.tier - b.tier);

export function getPropertyDefinition(id: string): PropertyDefinition {
  const def = PROPERTY_DEFINITIONS[id];
  if (!def) throw new Error(`Unknown property definition: ${id}`);
  return def;
}

export function getZone(propertyDefinitionId: string, zoneId: string): PlacementZone | undefined {
  return getPropertyDefinition(propertyDefinitionId).zones.find((z) => z.id === zoneId);
}

export function homeForTier(tier: number) {
  return HOMES.find((h) => h.tier === tier);
}
