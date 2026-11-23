import type { PlacementTag } from './properties';

export type ItemCategory = 'cabinet' | 'decor';

export interface CatalogItem {
  id: string;
  name: string;
  description: string;
  category: ItemCategory;
  /** Price in dollars. */
  cost: number;
  purchasable: boolean;
  resellable: boolean;
  /** Minimum home tier this item can be bought for / placed in. */
  minPropertyTier: number;
  /** Number of furniture zones occupied. */
  footprint: number;
  placementTag: PlacementTag;
  /** Trophy display capacity (0 for non-display furniture). */
  displayCapacity: number;
  /** Interior sprite key for decor. */
  sprite?: string;
  /** Cabinet wood/finish for the renderer. */
  finish?: 'oak' | 'walnut' | 'glass' | 'gold';
}

export const CABINET_OAK_STARTER = 'cabinet_oak_starter';

const cabinet = (
  id: string, name: string, cost: number, cap: number, tier: number, finish: CatalogItem['finish'], description: string,
): CatalogItem => ({
  id, name, description, category: 'cabinet', cost, purchasable: true, resellable: false, minPropertyTier: tier,
  footprint: 1, placementTag: 'display_cabinet', displayCapacity: cap, finish,
});

const decor = (
  id: string, name: string, cost: number, tag: PlacementTag, sprite: string, tier: number, description: string,
): CatalogItem => ({
  id, name, description, category: 'decor', cost, purchasable: true, resellable: false, minPropertyTier: tier,
  footprint: 1, placementTag: tag, displayCapacity: 0, sprite,
});

export const CATALOG: Record<string, CatalogItem> = Object.fromEntries(
  [
    cabinet(CABINET_OAK_STARTER, 'Oak Trophy Cabinet', 300, 3, 1, 'oak', 'A sturdy oak-finish cabinet with three lit glass shelves. Every career starts somewhere.'),
    cabinet('cabinet_walnut', 'Walnut Display Case', 4_000, 6, 2, 'walnut', 'Dark walnut, six lit shelves. For a player who has started winning.'),
    cabinet('cabinet_glass', 'Glass Tower Vitrine', 15_000, 8, 3, 'glass', 'Floor-to-ceiling glass and brushed steel. Eight spotlit spots.'),
    cabinet('cabinet_champion', "Champion's Trophy Wall", 60_000, 12, 4, 'gold', 'Gilded and grand: twelve spots for a Hall of Fame career.'),
    decor('decor_rug', 'Woven Rug', 150, 'rug', 'rug', 1, 'Warms up the floor.'),
    decor('decor_table', 'Coffee Table', 250, 'table', 'coffee_table', 1, 'Somewhere to put your yardage books.'),
    decor('decor_plant', 'Fiddle-Leaf Fig', 120, 'plant', 'plant', 1, 'Needs light, water and compliments.'),
    decor('art_print', 'Seaside Print', 200, 'wall_art', 'painting_0', 1, 'A framed print of a links course at dusk.'),
    decor('decor_lamp', 'Floor Lamp', 400, 'lamp', 'lamp', 2, 'Soft light for late-night swing videos.'),
    decor('decor_sofa', 'Leather Sofa', 2_200, 'seating', 'sofa', 2, 'Room for Jess, Mom and the trophy-room tour.'),
    decor('decor_bookshelf', 'Bookshelf', 1_500, 'shelf', 'bookshelf', 2, 'Golf books, scorecards and souvenirs.'),
    decor('art_canvas', 'Original Canvas', 8_000, 'wall_art', 'painting_1', 3, 'An original painting by a local artist.'),
  ].map((i) => [i.id, i]),
);

export function getCatalogItem(id: string): CatalogItem {
  const item = CATALOG[id];
  if (!item) throw new Error(`Unknown catalog item: ${id}`);
  return item;
}

export function listStoreItems(): CatalogItem[] {
  return Object.values(CATALOG).filter((i) => i.purchasable);
}
