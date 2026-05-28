// disasterAssetCatalog.ts — curated whitelist of safe public Roblox assets
// usable as spawn entities in Disaster Spawner Lua.
//
// User feedback (session 385 round 7):
//   «Жёлтые круги вместо бананов = скорее всего Part + Sphere + yellow color.
//    Нужно перейти на Asset-based disaster spawning»
//
// Design decisions:
//
// 1. We **don't** scrape Roblox Catalog live for each generation — the API
//    is unauthenticated, rate-limited (we already hit 429s on roblox-trends),
//    and returns mostly accessory hats / faces when you search for viral
//    keywords like "banana" or "toilet". Live scraping = noise + flakiness.
//
// 2. We **don't** trust random Toolbox imports — third-party Models on the
//    Marketplace can carry scripts / backdoors that would auto-execute when
//    InsertService:LoadAsset spawns them in someone's place. Hard pass.
//
// 3. The whitelist below is **manually curated** — every asset id should
//    have been verified by a human to be:
//       - free (priceInRobux === 0 OR Roblox-published)
//       - AssetTypeId === 4 (Mesh) or 40 (MeshPart) — usable as MeshPart.MeshId
//       - script-free (Meshes literally cannot carry code — that's the point
//         of picking Mesh AssetType instead of Model)
//       - low-poly enough for ~30 simultaneous spawns (MAX_ALIVE cap)
//       - visually unambiguous (a banana mesh looks like a banana)
//
// 4. If the whitelist is empty for a keyword, viralChatDispatch falls back
//    to **branded primitive composition** (see buildDisasterLuaPrompt in
//    disasterStyles.ts) — multi-Part shapes that read as the named object
//    rather than a single yellow ball.
//
// Adding entries: paste a rbxassetid that you've personally verified in
// Studio (drag from Toolbox → Properties → MeshId). Don't paste accessory
// AssetIds — they're rigged to a humanoid attachment point and won't spawn
// in mid-air as a falling part.

export type DisasterAssetCategory =
  | 'food'        // banana, pizza, cappuccino, donut, sahur drum
  | 'household'   // toilet, fridge, couch, lamp, microwave
  | 'animal'      // duck, shark, crocodilo, cat, fish
  | 'meme'        // moai, skibidi head, brainrot pet, italian gesture
  | 'natural'     // meteor, rock, log, fireball
  | 'tech';       // robot, satellite, gadget

export interface DisasterAssetEntry {
  /** Display name shown in the Lua comment for debug. */
  name: string;
  /** Numeric Roblox asset id. Use the numeric value, NOT the rbxassetid:// URI.
   * The Lua emitter prepends rbxassetid:// itself. */
  meshAssetId: number;
  /** Cube edge in studs for the spawned MeshPart. Mesh authors don't standardise
   * scale, so we override it per-entry. Typical range 2-10. */
  preferredScale: number;
  /** Optional Color3 override (RGB 0-255). Roblox `Color3.fromRGB(r,g,b)`.
   * Leave undefined to use the mesh's baked texture. */
  colorRGB?: [number, number, number];
  /** Optional Roblox material name. Default 'Plastic'. */
  material?: 'Plastic' | 'Neon' | 'Metal' | 'Wood' | 'Marble' | 'SmoothPlastic';
  /** Optional notes for future curators (don't ship). */
  notes?: string;
}

export interface DisasterAssetBundle {
  /** Lowercase, ASCII, snake_case identifier. */
  keyword: string;
  /** Coarse category for fallback routing (e.g. unknown "kebab" → food bundle). */
  category: DisasterAssetCategory;
  /** All curated entries. Empty array = no curated assets; emitter falls back
   * to branded primitive composition. */
  entries: DisasterAssetEntry[];
  /** Aliases the keyword router will also match against. */
  aliases: string[];
}

// ─── Whitelist — start small, grow over time ─────────────────────
//
// IMPORTANT: every meshAssetId below MUST be verified in Studio before being
// added. The router will happily spawn whatever you put here; if the id is
// wrong / private / removed, the user sees an invisible MeshPart with no
// geometry. Better to ship empty entries[] (falls back to branded primitive)
// than ship a broken meshAssetId.
//
// Format example (DO NOT enable until verified):
//
//   entries: [
//     {
//       name: 'Stylised Banana',
//       meshAssetId: 9999999999,        // ← REPLACE with verified id
//       preferredScale: 4,
//       colorRGB: [255, 220, 0],
//       material: 'Plastic',
//     },
//   ],

export const DISASTER_ASSET_BUNDLES: DisasterAssetBundle[] = [
  {
    keyword: 'banana',
    category: 'food',
    aliases: ['banana', 'bananas', 'банан', 'бананы'],
    entries: [],
  },
  {
    keyword: 'toilet',
    category: 'household',
    aliases: ['toilet', 'toilets', 'skibidi', 'туалет'],
    entries: [],
  },
  {
    keyword: 'duck',
    category: 'animal',
    aliases: ['duck', 'ducks', 'rubber duck', 'утка', 'утки'],
    entries: [],
  },
  {
    keyword: 'fridge',
    category: 'household',
    aliases: ['fridge', 'refrigerator', 'холодильник'],
    entries: [],
  },
  {
    keyword: 'meteor',
    category: 'natural',
    aliases: ['meteor', 'asteroid', 'meteor shower', 'метеор', 'астероид'],
    entries: [],
  },
  {
    keyword: 'shark',
    category: 'animal',
    aliases: ['shark', 'tralalero', 'tralalero tralala', 'акула'],
    entries: [],
  },
  {
    keyword: 'moai',
    category: 'meme',
    aliases: ['moai', 'sigma', 'stone head', 'easter island', 'sigma stone'],
    entries: [],
  },
  {
    keyword: 'couch',
    category: 'household',
    aliases: ['couch', 'sofa', 'furniture rain', 'диван'],
    entries: [],
  },
  {
    keyword: 'pizza',
    category: 'food',
    aliases: ['pizza', 'italian pizza', 'пицца'],
    entries: [],
  },
  {
    keyword: 'crocodile',
    category: 'animal',
    aliases: ['crocodile', 'bombardiro', 'bombardiro crocodilo', 'крокодил'],
    entries: [],
  },
];

// ─── Router helpers ───────────────────────────────────────────────

/** Case-insensitive lookup. Returns the FIRST bundle whose keyword or any
 * alias is a substring of `text` (normalized). Order matters — earlier
 * bundles in DISASTER_ASSET_BUNDLES take priority on collision. */
export function findDisasterBundle(text: string): DisasterAssetBundle | undefined {
  const lc = text.toLowerCase();
  for (const bundle of DISASTER_ASSET_BUNDLES) {
    for (const alias of bundle.aliases) {
      if (lc.includes(alias.toLowerCase())) return bundle;
    }
  }
  return undefined;
}

/** True iff this bundle has at least one verified asset entry. When false,
 * emitter should use branded primitive composition instead of MeshPart.MeshId. */
export function bundleHasAssets(bundle: DisasterAssetBundle | undefined): boolean {
  return !!bundle && bundle.entries.length > 0;
}

/** Pick a random verified entry from the bundle, or undefined if the
 * whitelist is still empty. Used by the Lua emitter to seed the spawn
 * function with a real MeshPart. */
export function pickRandomEntry(
  bundle: DisasterAssetBundle | undefined,
): DisasterAssetEntry | undefined {
  if (!bundleHasAssets(bundle)) return undefined;
  const e = bundle!.entries;
  return e[Math.floor(Math.random() * e.length)];
}
