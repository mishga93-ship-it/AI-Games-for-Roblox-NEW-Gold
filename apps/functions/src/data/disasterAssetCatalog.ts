// disasterAssetCatalog.ts — curated whitelist of public Roblox Marketplace
// assets usable as spawn entities in Disaster Spawner Lua.
//
// User feedback (session 385 round 7+8):
//   «Жёлтые круги вместо бананов = Part + Sphere + yellow color.
//    Нужно перейти на InsertService:LoadAsset».
//
// Spawn pattern emitted into the generated Lua (see buildEntityShapeGuidance
// in disasterStyles.ts):
//
//   local asset = InsertService:LoadAsset(id)
//   -- strip any embedded Scripts (toolbox-malware defence)
//   for _, d in ipairs(asset:GetDescendants()) do
//     if d:IsA("BaseScript") or d:IsA("ModuleScript") then d:Destroy() end
//   end
//   local model = asset:GetChildren()[1] ; model.Parent = workspace
//   model:PivotTo(CFrame.new(pos))
//   -- unanchor so the asset falls under gravity
//   for _, p in ipairs(model:GetDescendants()) do
//     if p:IsA("BasePart") then p.Anchored = false end
//   end
//
// All assetIds below come from links the user verified on the Roblox
// Creator Store (https://create.roblox.com/store/asset/<id>/...).
//
// SECURITY: every spawned Model strips Script / LocalScript / ModuleScript
// before parenting to workspace. Toolbox assets are NOT trusted to be
// script-free even if the listing looks clean — backdoors live in malicious
// ModuleScripts embedded inside otherwise innocent Models.

export type DisasterAssetCategory =
  | 'food'        // banana, pizza, cappuccino, donut, sahur drum
  | 'household'   // toilet, fridge, couch, lamp, microwave
  | 'animal'      // duck, shark, crocodilo, cat, fish, dog
  | 'meme'        // moai, skibidi head, brainrot pet, sigma, among us, ohio
  | 'natural'     // meteor, lava, rock, fireball, tsunami
  | 'tech'        // robot, ufo, satellite, gadget, car
  | 'horror';     // zombie, ghost, black hole

export interface DisasterAssetEntry {
  /** Display name shown in the Lua comment for debug. */
  name: string;
  /** Numeric Roblox asset id. Use the numeric value, NOT the rbxassetid:// URI.
   * The Lua emitter wraps it as `InsertService:LoadAsset(id)`. */
  assetId: number;
  /** Approximate cube edge in studs used to NORMALISE the spawned Model size
   * — toolbox assets ship at wildly different scales. Lua emit computes the
   * model's bounding box and uniformly scales to roughly this edge length. */
  preferredScale: number;
  /** Optional Color3 override (RGB 0-255). Most uses leave this undefined
   * and trust the baked texture from the original Marketplace upload. */
  colorRGB?: [number, number, number];
  /** Optional notes (creator name, source URL, license caveat). Not shipped
   * into the prompt — for human curators reading this file. */
  notes?: string;
}

export interface DisasterAssetBundle {
  /** Lowercase, ASCII, snake_case identifier. */
  keyword: string;
  /** Coarse category for fallback routing (e.g. unknown "kebab" → food). */
  category: DisasterAssetCategory;
  /** All curated entries. Empty array = no curated assets; emitter falls back
   * to branded primitive composition (recipes in disasterStyles.ts). */
  entries: DisasterAssetEntry[];
  /** Aliases the keyword router will also match against. */
  aliases: string[];
}

// ─── Whitelist — user-verified asset ids from create.roblox.com/store ────

export const DISASTER_ASSET_BUNDLES: DisasterAssetBundle[] = [
  {
    keyword: 'banana',
    category: 'food',
    aliases: ['banana', 'bananas', 'банан', 'бананы'],
    entries: [
      { name: 'Banana',   assetId: 5279263715,  preferredScale: 4 },
      { name: 'Banana 2', assetId: 13013708959, preferredScale: 4 },
      { name: 'Banana 3', assetId: 15333715,    preferredScale: 4 },
    ],
  },
  {
    keyword: 'duck',
    category: 'animal',
    aliases: ['duck', 'ducks', 'rubber duck', 'утка', 'утки'],
    entries: [
      { name: 'Rubber Duck', assetId: 12626260508, preferredScale: 4 },
      { name: 'Duck',        assetId: 151726060,   preferredScale: 4 },
    ],
  },
  {
    keyword: 'shark',
    category: 'animal',
    aliases: ['shark', 'tralalero', 'tralalero tralala', 'акула'],
    entries: [
      { name: 'Shark',      assetId: 4904761582, preferredScale: 6 },
      { name: 'Shark Mesh', assetId: 299414459,  preferredScale: 6 },
    ],
  },
  {
    keyword: 'toilet',
    category: 'household',
    aliases: ['toilet', 'toilets', 'skibidi', 'туалет'],
    entries: [
      { name: 'Toilet',         assetId: 166423547,   preferredScale: 4 },
      { name: 'Skibidi Toilet', assetId: 13386321534, preferredScale: 5 },
    ],
  },
  {
    keyword: 'meteor',
    category: 'natural',
    aliases: ['meteor', 'asteroid', 'meteor shower', 'метеор', 'астероид'],
    entries: [
      { name: 'Meteor',   assetId: 18474459,   preferredScale: 5 },
      { name: 'Asteroid', assetId: 4962411368, preferredScale: 5 },
    ],
  },
  {
    keyword: 'cat',
    category: 'animal',
    aliases: ['cat', 'meme cat', 'pop cat', 'кот', 'кошка'],
    entries: [
      { name: 'Meme Cat', assetId: 13604364842, preferredScale: 4 },
      { name: 'Pop Cat',  assetId: 12349209162, preferredScale: 4 },
    ],
  },
  {
    keyword: 'lava',
    category: 'natural',
    aliases: ['lava', 'lava rock', 'lava boulder', 'magma', 'volcanic', 'лава', 'вулкан'],
    entries: [
      { name: 'Lava Rock',    assetId: 943845397,  preferredScale: 5 },
      { name: 'Lava Boulder', assetId: 7546582758, preferredScale: 6 },
    ],
  },
  {
    keyword: 'zombie',
    category: 'horror',
    aliases: ['zombie', 'zombies', 'zombie rush', 'undead', 'зомби'],
    entries: [
      { name: 'Zombie',     assetId: 5031162850, preferredScale: 6 },
      { name: 'Zombie NPC', assetId: 616849621,  preferredScale: 6 },
    ],
  },
  {
    keyword: 'sigma_boss',
    category: 'meme',
    aliases: ['sigma', 'sigma boss', 'gigachad', 'chad', 'sigma chad', 'sigma character'],
    entries: [
      { name: 'Gigachad',        assetId: 13960771829, preferredScale: 7 },
      { name: 'Sigma Character', assetId: 15132526539, preferredScale: 7 },
    ],
  },
  {
    keyword: 'tsunami',
    category: 'natural',
    aliases: ['tsunami', 'wave', 'tidal wave', 'flood', 'цунами', 'волна'],
    entries: [
      { name: 'Wave',         assetId: 534774995,  preferredScale: 8 },
      { name: 'Tsunami Water', assetId: 8462198416, preferredScale: 8 },
    ],
  },
  {
    keyword: 'ufo',
    category: 'tech',
    aliases: ['ufo', 'alien', 'alien ship', 'alien invasion', 'нло', 'инопланетянин'],
    entries: [
      { name: 'UFO',        assetId: 570538491,  preferredScale: 6 },
      { name: 'Alien Ship', assetId: 6695306993, preferredScale: 6 },
    ],
  },
  {
    keyword: 'brainrot_meme',
    category: 'meme',
    aliases: ['brainrot', 'among us', 'ohio', 'meme object', 'cursed meme'],
    entries: [
      { name: 'Among Us',  assetId: 13742580144, preferredScale: 4 },
      { name: 'Ohio Meme', assetId: 15498451998, preferredScale: 4 },
    ],
  },
  {
    keyword: 'dog',
    category: 'animal',
    aliases: ['dog', 'shiba', 'giant dog', 'puppy', 'собака', 'пёс'],
    entries: [
      { name: 'Dog',   assetId: 13456955734, preferredScale: 4 },
      { name: 'Shiba', assetId: 15072806244, preferredScale: 4 },
    ],
  },
  {
    keyword: 'car',
    category: 'tech',
    aliases: ['car', 'cars', 'flying car', 'supercar', 'sedan', 'машина', 'автомобиль'],
    entries: [
      { name: 'Supercar', assetId: 6433330180, preferredScale: 7 },
      { name: 'Sedan',    assetId: 6418239833, preferredScale: 7 },
    ],
  },
  {
    keyword: 'black_hole',
    category: 'horror',
    aliases: ['black hole', 'void', 'void orb', 'singularity', 'чёрная дыра'],
    entries: [
      { name: 'Black Hole', assetId: 11974288330, preferredScale: 8 },
      { name: 'Void Orb',   assetId: 6685221158,  preferredScale: 6 },
    ],
  },
  {
    keyword: 'lightning',
    category: 'natural',
    aliases: ['lightning', 'thunderbolt', 'thunder', 'electric storm', 'молния'],
    entries: [
      { name: 'Lightning VFX',  assetId: 8317372502, preferredScale: 6 },
      { name: 'Lightning Bolt', assetId: 1227289425, preferredScale: 6 },
    ],
  },
  {
    keyword: 'earthquake',
    category: 'natural',
    aliases: ['earthquake', 'rock', 'boulder', 'землетрясение', 'камень'],
    entries: [
      { name: 'Earth Rock', assetId: 253519495,  preferredScale: 5 },
      { name: 'Boulder',    assetId: 7546582758, preferredScale: 6 },
    ],
  },
  {
    keyword: 'npc_invasion',
    category: 'meme',
    aliases: ['npc', 'classic npc', 'blocky npc', 'noob invasion', 'нпс'],
    entries: [
      { name: 'Classic NPC', assetId: 616849621,  preferredScale: 6 },
      { name: 'Blocky NPC',  assetId: 5031162850, preferredScale: 6 },
    ],
  },
  {
    keyword: 'fire',
    category: 'natural',
    aliases: ['fire', 'fireball', 'flames', 'flaming meteor', 'fire rain', 'огонь'],
    entries: [
      { name: 'Fireball',       assetId: 243098098,  preferredScale: 4 },
      { name: 'Flaming Meteor', assetId: 8233231494, preferredScale: 5 },
    ],
  },
  // Empty-bundle fallbacks: known keywords without curated ids yet → emitter
  // uses branded multi-Part recipes (see BRANDED_SHAPES in disasterStyles.ts).
  {
    keyword: 'fridge',
    category: 'household',
    aliases: ['fridge', 'refrigerator', 'холодильник'],
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
  {
    keyword: 'moai',
    category: 'meme',
    aliases: ['moai', 'stone head', 'easter island', 'sigma stone'],
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
 * emitter should use branded primitive composition instead of LoadAsset. */
export function bundleHasAssets(bundle: DisasterAssetBundle | undefined): boolean {
  return !!bundle && bundle.entries.length > 0;
}

/** Pick a random verified entry from the bundle, or undefined if the
 * whitelist is empty. Mostly used in tests; the Lua emitter ships the full
 * entries list so the loaded script can randomise spawn at runtime. */
export function pickRandomEntry(
  bundle: DisasterAssetBundle | undefined,
): DisasterAssetEntry | undefined {
  if (!bundleHasAssets(bundle)) return undefined;
  const e = bundle!.entries;
  return e[Math.floor(Math.random() * e.length)];
}
