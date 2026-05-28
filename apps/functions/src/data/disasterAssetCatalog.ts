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
  /** Numeric Roblox Mesh asset id (inner mesh extracted from the uploaded
   * Model wrapper). Lua emitter passes it to
   * `AssetService:CreateMeshPartAsync(Content.fromAssetId(id))`. */
  assetId: number;
  /** Longest-edge target size in studs. Lua emit scales the mesh uniformly
   * so the longest natural axis = preferredScale, preserving aspect ratio. */
  preferredScale: number;
  /** Optional Color3 override (RGB 0-255). Most uses leave this undefined
   * to keep the baked PBR texture. */
  colorRGB?: [number, number, number];
  /** Inner Texture asset id, when the source .glb shipped a baked PBR
   * texture. Wired into SurfaceAppearance.ColorMap at spawn time. */
  textureAssetId?: number;
  /** Natural bounding-box dimensions of the mesh in studs (XYZ). Used by
   * the runtime to compute uniform scale instead of forcing a cubic Size
   * (banana stays banana-shaped, not crushed into a cube). */
  naturalSize?: { x: number; y: number; z: number };
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
  /** Best-guess Color3 (RGB 0-255) used as a fallback tint when neither
   * SurfaceAppearance.ColorMap nor MeshPart.TextureID can be written from
   * a server script (both are capability-gated). Without this the mesh
   * renders pure white and the user can't tell what spawned.
   * banana=yellow, shark=grey, toilet=white, etc. */
  fallbackColorRGB?: [number, number, number];
}

// ─── Whitelist — user-verified asset ids from create.roblox.com/store ────

export const DISASTER_ASSET_BUNDLES: DisasterAssetBundle[] = [
  {
    keyword: 'banana',
    category: 'food',
    aliases: ['banana', 'bananas', 'банан', 'бананы'],
    entries: [],
    fallbackColorRGB: [255, 220, 40],
  },
  {
    keyword: 'duck',
    category: 'animal',
    aliases: ['duck', 'ducks', 'rubber duck', 'утка', 'утки'],
    entries: [],
    fallbackColorRGB: [255, 220, 0],
  },
  {
    keyword: 'shark',
    category: 'animal',
    aliases: ['shark', 'tralalero', 'tralalero tralala', 'акула'],
    entries: [],
    fallbackColorRGB: [90, 110, 130],
  },
  {
    keyword: 'toilet',
    category: 'household',
    aliases: ['toilet', 'toilets', 'skibidi', 'туалет'],
    entries: [],
    fallbackColorRGB: [240, 240, 240],
  },
  {
    keyword: 'meteor',
    category: 'natural',
    aliases: ['meteor', 'asteroid', 'meteor shower', 'метеор', 'астероид'],
    entries: [],
    fallbackColorRGB: [70, 60, 50],
  },
  {
    keyword: 'cat',
    category: 'animal',
    aliases: ['cat', 'meme cat', 'pop cat', 'кот', 'кошка'],
    entries: [],
    fallbackColorRGB: [180, 130, 80],
  },
  {
    keyword: 'lava',
    category: 'natural',
    aliases: ['lava', 'lava rock', 'lava boulder', 'magma', 'volcanic', 'лава', 'вулкан'],
    entries: [],
    fallbackColorRGB: [220, 80, 30],
  },
  {
    keyword: 'zombie',
    category: 'horror',
    aliases: ['zombie', 'zombies', 'zombie rush', 'undead', 'зомби'],
    entries: [],
    fallbackColorRGB: [80, 140, 80],
  },
  {
    keyword: 'sigma_boss',
    category: 'meme',
    aliases: ['sigma', 'sigma boss', 'gigachad', 'chad', 'sigma chad', 'sigma character'],
    entries: [],
    fallbackColorRGB: [50, 50, 60],
  },
  {
    keyword: 'tsunami',
    category: 'natural',
    aliases: ['tsunami', 'wave', 'tidal wave', 'flood', 'цунами', 'волна'],
    entries: [],
    fallbackColorRGB: [40, 110, 180],
  },
  {
    keyword: 'ufo',
    category: 'tech',
    aliases: ['ufo', 'alien', 'alien ship', 'alien invasion', 'нло', 'инопланетянин'],
    entries: [],
    fallbackColorRGB: [180, 200, 220],
  },
  {
    keyword: 'brainrot_meme',
    category: 'meme',
    aliases: ['brainrot', 'among us', 'ohio', 'meme object', 'cursed meme'],
    entries: [],
    fallbackColorRGB: [255, 80, 220],
  },
  {
    keyword: 'dog',
    category: 'animal',
    aliases: ['dog', 'shiba', 'giant dog', 'puppy', 'собака', 'пёс'],
    entries: [],
    fallbackColorRGB: [230, 170, 90],
  },
  {
    keyword: 'car',
    category: 'tech',
    aliases: ['car', 'cars', 'flying car', 'supercar', 'sedan', 'машина', 'автомобиль'],
    entries: [],
    fallbackColorRGB: [200, 30, 30],
  },
  {
    keyword: 'black_hole',
    category: 'horror',
    aliases: ['black hole', 'void', 'void orb', 'singularity', 'чёрная дыра'],
    entries: [],
    fallbackColorRGB: [20, 10, 30],
  },
  {
    keyword: 'lightning',
    category: 'natural',
    aliases: ['lightning', 'thunderbolt', 'thunder', 'electric storm', 'молния'],
    entries: [],
    fallbackColorRGB: [255, 245, 100],
  },
  {
    keyword: 'earthquake',
    category: 'natural',
    aliases: ['earthquake', 'rock', 'boulder', 'землетрясение', 'камень'],
    entries: [],
    fallbackColorRGB: [110, 90, 70],
  },
  {
    keyword: 'npc_invasion',
    category: 'meme',
    aliases: ['npc', 'classic npc', 'blocky npc', 'noob invasion', 'нпс'],
    entries: [],
    fallbackColorRGB: [255, 220, 50],
  },
  {
    keyword: 'fire',
    category: 'natural',
    aliases: ['fire', 'fireball', 'flames', 'flaming meteor', 'fire rain', 'огонь'],
    entries: [],
    fallbackColorRGB: [255, 90, 20],
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
