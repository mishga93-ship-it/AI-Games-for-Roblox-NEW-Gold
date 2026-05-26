// fakeLimitedCatalog.ts — Curated whitelist of Roblox Catalog items used by the
// "Fake Headless & Korblox" AI Crafter (session 382). Hand-picked; LLM is
// instructed to ONLY reference these IDs, never invent new ones.
//
// Prices are Robux. `free` items are 0 R$. Asset IDs are real Roblox catalog
// IDs (verified at session 382 time — may rot, see PROGRESS.md Known Issues).

export type FakeLimitedKind = 'headless' | 'korblox' | 'combo';

export interface FakeLimitedItem {
  assetId: string;          // Roblox catalog asset ID
  name: string;             // Display name
  pricedRobux: number;      // 0 = free
  category: 'head' | 'face' | 'face_accessory' | 'hat' | 'neck' | 'shoulder' | 'shirt' | 'pants' | 'layered' | 'leg_accessory' | 'waist';
  role: 'primary_illusion' | 'concealer' | 'accent';
  notes: string;            // Why this item is in the recipe
}

// Fake-Headless candidate items (creates illusion of missing head).
// Sources: roblox catalog browse + DevForum dynamic-head discussions.
export const HEADLESS_ITEMS: FakeLimitedItem[] = [
  {
    assetId: '4819740796',
    name: 'Void Smooth Brain',
    pricedRobux: 0,
    category: 'face_accessory',
    role: 'primary_illusion',
    notes: 'Dark void-tone face accessory; hides facial features when paired with a head-scale-down trick.',
  },
  {
    assetId: '7805334103',
    name: 'Glass Half Head',
    pricedRobux: 80,
    category: 'face_accessory',
    role: 'primary_illusion',
    notes: 'Thin transparent dynamic head accessory — best Headless mimic as of 2026.',
  },
  {
    assetId: '376031762',
    name: 'City Life Woman Head',
    pricedRobux: 0,
    category: 'head',
    role: 'concealer',
    notes: 'Free legacy head with small footprint; combine with dark face for shrunken-head effect.',
  },
  {
    assetId: '20577850',
    name: 'Black Turtleneck',
    pricedRobux: 15,
    category: 'shirt',
    role: 'concealer',
    notes: 'High-collar dark shirt masks the neck seam below the illusion.',
  },
];

// Fake-Korblox candidate items (skeleton / dark right leg).
export const KORBLOX_ITEMS: FakeLimitedItem[] = [
  {
    assetId: '11748356095',
    name: 'Pencil Body (Saefeks2)',
    pricedRobux: 0,
    category: 'layered',
    role: 'primary_illusion',
    notes: 'Free thin layered body — slim leg silhouette reads as skeleton on dark color.',
  },
  {
    assetId: '7464884377',
    name: 'Skeleton Leg Accessory',
    pricedRobux: 25,
    category: 'leg_accessory',
    role: 'primary_illusion',
    notes: 'Right-leg overlay with bone texture; cheapest "real" skeleton-look on the right leg.',
  },
  {
    assetId: '12537634918',
    name: 'Black Skinny Jeans (Right Leg only)',
    pricedRobux: 5,
    category: 'pants',
    role: 'concealer',
    notes: 'Left leg dark pant, right leg transparent — combined with skin tone set to (12,12,12).',
  },
];

export const RECIPE_CATALOG: Record<FakeLimitedKind, FakeLimitedItem[]> = {
  headless: HEADLESS_ITEMS,
  korblox: KORBLOX_ITEMS,
  combo: [...HEADLESS_ITEMS, ...KORBLOX_ITEMS],
};

export function summarizeRecipe(kind: FakeLimitedKind): {
  totalCostRobux: number;
  freeOnlyCostRobux: number;
  itemCount: number;
} {
  const items = RECIPE_CATALOG[kind];
  const totalCostRobux = items.reduce((acc, it) => acc + it.pricedRobux, 0);
  const freeOnly = items.filter((it) => it.role === 'primary_illusion' && it.pricedRobux === 0);
  const freeOnlyCostRobux = freeOnly.reduce((acc, it) => acc + it.pricedRobux, 0);
  return { totalCostRobux, freeOnlyCostRobux, itemCount: items.length };
}
