// outfitAesthetics.ts — 1-Click Outfit Generator aesthetic presets (session 383).
//
// 9 hand-tuned aesthetic profiles for the TikTok-vibe outfit assembler.
// Each profile = curated core items + live catalog keywords + AI hints.
//
// Hybrid sourcing (per user spec):
//   • curatedCore[] — small list of always-good assetIds (1-3 per aesthetic)
//     that anchor the look. Hand-verified Roblox catalog items.
//   • liveKeywords[] — search terms for fetchCatalogByKeyword to flesh out
//     each category (hair / face / shirt / pants / accessories / aura).
//     Live results refresh Roblox trends automatically; curated core
//     guarantees baseline quality.
//
// The assembler picks 1 item per category, biasing toward curatedCore when
// available, falling back to live-search ranking otherwise.

export type OutfitAestheticId =
  | 'sigma'
  | 'baddie'
  | 'y2k'
  | 'goth'
  | 'rich_emo'
  | 'slender'
  | 'softie'
  | 'cyber'
  | 'anime_demon';

export type OutfitGender = 'boys' | 'girls' | 'neutral';
export type OutfitStyleMode = 'dark' | 'colorful';
export type OutfitRemixMode = 'remix' | 'budget' | 'more_cursed' | 'more_clean';

/** Outfit slot categories we try to fill. */
export type OutfitSlot =
  | 'hair'
  | 'face'
  | 'shirt'
  | 'pants'
  | 'jacket'
  | 'neck'
  | 'shoulder'
  | 'back'
  | 'aura'
  | 'accessory';

export interface CuratedItem {
  assetId: string;
  name: string;
  slot: OutfitSlot;
  approxRobux: number;   // approximate; live API price wins when available
  notes?: string;
}

export interface OutfitAesthetic {
  id: OutfitAestheticId;
  /** Display title (matches what shows on the vibe-picker card). */
  title: string;
  /** TikTok-ready hook for App Store screenshots / share captions. */
  appStoreHook: string;
  /** Short marketing pitch (EN + RU, client picks). */
  pitchEN: string;
  pitchRU: string;
  /** SF Symbol for the picker card placeholder. */
  iconSymbol: string;
  /** Accent hex for the picker card gradient. */
  accentHex: string;
  /**
   * Catalog search keywords by slot. Stronger weight on the first keyword;
   * additional keywords are tried in fallback order.
   */
  liveKeywords: Partial<Record<OutfitSlot, string[]>>;
  /** Small set of hand-verified items that always pass quality bar. */
  curatedCore: CuratedItem[];
  /** Caption candidates the AI ranker can pick from / remix. */
  captionSeedsEN: string[];
  captionSeedsRU: string[];
  /** Retail-style imitation cost — used as the "saved" hype number. */
  imitatedRetailRobux: number;
}

// ─── Curated items ────────────────────────────────────────────────
// Cores emptied (session 394): every previously-"curated" id was corrupt —
// 3 were non-wearable types (Lua 5 / Place 9 / Model 10) and 2 were
// mislabeled junk (a random Hat posing as sunglasses, a TShirt literally
// named "hmm"). A single non-wearable id 403s the /v1/avatar/render fit
// composite and poisons the WHOLE render — that 403 is why the Fitting Room
// showed a clothing-less body + "Your Avatar" 502. Until hand-verified
// replacements land, all aesthetics lean on live catalog search
// (liveKeywords) like rich_emo / slender / softie / anime_demon already do.
// The render layer also enforces wearable types defensively
// (filterRenderableAssetIds in robloxAvatar3D.ts).
const SIGMA_CORE: CuratedItem[] = [];
const BADDIE_CORE: CuratedItem[] = [];
const Y2K_CORE: CuratedItem[] = [];
const GOTH_CORE: CuratedItem[] = [];
const CYBER_CORE: CuratedItem[] = [];
// rich_emo / slender / softie / anime_demon — start with empty curated, lean on live.
const EMPTY_CORE: CuratedItem[] = [];

export const OUTFIT_AESTHETICS: Record<OutfitAestheticId, OutfitAesthetic> = {
  sigma: {
    id: 'sigma',
    title: 'Sigma',
    appStoreHook: 'SIGMA AVATAR',
    pitchEN: 'Cold, minimalist, suited. The 1% Roblox mindset look.',
    pitchRU: 'Холодный, минималистичный, в костюме. Лук «1% mindset».',
    iconSymbol: 'person.fill.checkmark',
    accentHex: '1F2530',
    liveKeywords: {
      hair: ['sigma slick hair', 'clean cut hair'],
      face: ['black sunglasses', 'stoic face'],
      shirt: ['black suit jacket', 'dark blazer'],
      pants: ['black slacks', 'dark trousers'],
      neck: ['gold chain', 'silver chain'],
      accessory: ['sigma watch', 'pocket square'],
    },
    curatedCore: SIGMA_CORE,
    captionSeedsEN: ['Sigma mode locked in 🗿', 'Cold demeanor, hot fit', 'No smile, all gain'],
    captionSeedsRU: ['Sigma режим активирован 🗿', 'Холодный взгляд, дорогой фит'],
    imitatedRetailRobux: 5_000,
  },
  baddie: {
    id: 'baddie',
    title: 'Baddie',
    appStoreHook: 'BADDIE ENERGY',
    pitchEN: 'TikTok baddie energy — bold, confident, slay-ready.',
    pitchRU: 'TikTok-baddie энергетика — смело, дерзко, готово к slay.',
    iconSymbol: 'sparkle',
    accentHex: 'D642FF',
    liveKeywords: {
      hair: ['long wavy hair', 'baddie hair'],
      face: ['baddie makeup', 'glossy lips'],
      shirt: ['crop top', 'baddie shirt'],
      pants: ['high waist jeans', 'baddie pants'],
      accessory: ['hoop earrings', 'baddie chain'],
      neck: ['gold chain', 'choker'],
    },
    curatedCore: BADDIE_CORE,
    captionSeedsEN: ['Baddie energy unlocked ✨', 'Slay mode ON', 'Main character vibes 💅'],
    captionSeedsRU: ['Baddie энергия включена ✨', 'Slay режим ON', 'Главная героиня 💅'],
    imitatedRetailRobux: 8_000,
  },
  y2k: {
    id: 'y2k',
    title: 'Y2K',
    appStoreHook: 'Y2K PRINCESS',
    pitchEN: 'Early-2000s mall princess core — butterflies, pink, low-rise.',
    pitchRU: 'Mall princess из ранних 2000-х — бабочки, розовый, low-rise.',
    iconSymbol: 'star.bubble.fill',
    accentHex: 'FF87C9',
    liveKeywords: {
      hair: ['y2k hair', 'pink streak hair'],
      face: ['glossy face', 'pink makeup'],
      shirt: ['y2k top', 'pink crop top'],
      pants: ['low rise jeans', 'y2k pants'],
      accessory: ['butterfly hair clip', 'y2k accessory'],
      neck: ['butterfly necklace', 'choker'],
    },
    curatedCore: Y2K_CORE,
    captionSeedsEN: ['Y2K core unlocked 🦋', 'Mall princess era ✨', '2003 was a vibe 💖'],
    captionSeedsRU: ['Y2K эра 🦋', 'Mall princess вернулась ✨', '2003-й — это вайб 💖'],
    imitatedRetailRobux: 6_000,
  },
  goth: {
    id: 'goth',
    title: 'Goth',
    appStoreHook: 'GOTH AVATAR',
    pitchEN: 'Dark, dramatic, cathedral-energy. Pure goth aesthetic.',
    pitchRU: 'Тёмная, драматичная, cathedral-energy. Чистая goth-эстетика.',
    iconSymbol: 'moon.fill',
    accentHex: '2A0A3A',
    liveKeywords: {
      hair: ['black goth hair', 'long black hair'],
      face: ['goth makeup', 'dark eye makeup'],
      shirt: ['black corset', 'goth shirt'],
      pants: ['black pants', 'goth pants'],
      accessory: ['cross necklace', 'goth chain'],
      back: ['black wings', 'goth wings'],
    },
    curatedCore: GOTH_CORE,
    captionSeedsEN: ['Goth mode 🦇', 'Cathedral core', 'Dark academia ✝️'],
    captionSeedsRU: ['Goth режим 🦇', 'Cathedral core', 'Dark academia ✝️'],
    imitatedRetailRobux: 7_000,
  },
  rich_emo: {
    id: 'rich_emo',
    title: 'Rich Emo',
    appStoreHook: 'RICH EMO',
    pitchEN: 'Designer emo — chains, layers, intentional sadness.',
    pitchRU: 'Designer emo — цепи, слои, намеренная грусть.',
    iconSymbol: 'music.note',
    accentHex: '6B0F1A',
    liveKeywords: {
      hair: ['emo hair', 'side bangs'],
      face: ['emo makeup', 'eyeliner'],
      shirt: ['chain shirt', 'emo top'],
      pants: ['skinny jeans', 'emo pants'],
      neck: ['silver chain', 'cross necklace'],
      accessory: ['emo accessory', 'chain belt'],
    },
    curatedCore: EMPTY_CORE,
    captionSeedsEN: ['Rich emo era 🖤', 'Sad but designer', 'Tears on the runway'],
    captionSeedsRU: ['Rich emo эра 🖤', 'Sad but designer', 'Слёзы на подиуме'],
    imitatedRetailRobux: 9_000,
  },
  slender: {
    id: 'slender',
    title: 'Slender',
    appStoreHook: 'SLENDER LOOK',
    pitchEN: 'Tall, narrow, mysterious. The iconic Slender silhouette.',
    pitchRU: 'Высокий, узкий, загадочный. Iconic Slender silhouette.',
    iconSymbol: 'figure.stand',
    accentHex: '0A0A0A',
    liveKeywords: {
      hair: ['slim hair', 'plain hair'],
      face: ['blank face', 'plain face'],
      shirt: ['black formal shirt', 'slim suit'],
      pants: ['black slim pants', 'slender pants'],
      accessory: ['black tie', 'simple tie'],
    },
    curatedCore: EMPTY_CORE,
    captionSeedsEN: ['Slender unlocked 🎭', 'Tall and quiet', 'Faceless king'],
    captionSeedsRU: ['Slender активирован 🎭', 'Высокий и тихий', 'Faceless king'],
    imitatedRetailRobux: 4_000,
  },
  softie: {
    id: 'softie',
    title: 'Softie',
    appStoreHook: 'SOFT GIRL CORE',
    pitchEN: 'Pastel, cozy, soft-girl daydream energy.',
    pitchRU: 'Пастель, уютно, soft-girl daydream энергия.',
    iconSymbol: 'cloud.fill',
    accentHex: 'F8B8D0',
    liveKeywords: {
      hair: ['soft hair', 'pastel hair'],
      face: ['soft makeup', 'blush'],
      shirt: ['pastel cardigan', 'soft top'],
      pants: ['skirt pastel', 'soft pants'],
      accessory: ['heart accessory', 'bow'],
      back: ['fairy wings', 'pastel wings'],
    },
    curatedCore: EMPTY_CORE,
    captionSeedsEN: ['Softie era ☁️', 'Daydream mode 💕', 'Cottage core unlocked'],
    captionSeedsRU: ['Softie эра ☁️', 'Daydream режим 💕', 'Cottage core'],
    imitatedRetailRobux: 5_500,
  },
  cyber: {
    id: 'cyber',
    title: 'Cyber',
    appStoreHook: 'CYBERPUNK AVATAR',
    pitchEN: 'Neon glow, future-tech, cyberpunk dystopia core.',
    pitchRU: 'Неоновое свечение, future-tech, cyberpunk dystopia.',
    iconSymbol: 'bolt.fill',
    accentHex: '00FFAA',
    liveKeywords: {
      hair: ['cyber hair', 'neon hair'],
      face: ['cyber visor', 'neon glasses'],
      shirt: ['cyberpunk jacket', 'tech shirt'],
      pants: ['tech pants', 'cyber pants'],
      accessory: ['cyber headset', 'tech accessory'],
      back: ['mech wings', 'tech wings'],
      aura: ['neon aura', 'cyber aura'],
    },
    curatedCore: CYBER_CORE,
    captionSeedsEN: ['Jacked into the matrix ⚡', 'Cyber mode online', '2077 vibes'],
    captionSeedsRU: ['Вошёл в матрицу ⚡', 'Cyber режим онлайн', '2077 вайб'],
    imitatedRetailRobux: 12_000,
  },
  anime_demon: {
    id: 'anime_demon',
    title: 'Anime Demon',
    appStoreHook: 'ANIME DEMON',
    pitchEN: 'Domain expansion energy — anime demon arc protagonist.',
    pitchRU: 'Domain expansion энергия — anime demon arc protagonist.',
    iconSymbol: 'flame.fill',
    accentHex: 'C70039',
    liveKeywords: {
      hair: ['anime demon hair', 'long anime hair'],
      face: ['demon eyes', 'anime face'],
      shirt: ['anime jacket', 'demon haori'],
      pants: ['anime pants', 'samurai pants'],
      accessory: ['anime mask', 'demon horns'],
      back: ['demon wings', 'anime aura'],
      aura: ['red aura', 'flame aura'],
    },
    curatedCore: EMPTY_CORE,
    captionSeedsEN: ['Domain expansion 🔥', 'Demon arc activated', 'Cursed energy: max'],
    captionSeedsRU: ['Domain expansion 🔥', 'Demon arc активирован', 'Cursed energy: max'],
    imitatedRetailRobux: 10_000,
  },
};

export function isOutfitAestheticId(value: unknown): value is OutfitAestheticId {
  return typeof value === 'string' && value in OUTFIT_AESTHETICS;
}

export function listOutfitAesthetics(): OutfitAesthetic[] {
  return Object.values(OUTFIT_AESTHETICS);
}

export function getOutfitAesthetic(id: OutfitAestheticId): OutfitAesthetic {
  return OUTFIT_AESTHETICS[id];
}

/** Slots we try to fill per outfit, in display order. */
export const OUTFIT_SLOT_ORDER: OutfitSlot[] = [
  'hair', 'face', 'shirt', 'pants', 'jacket',
  'neck', 'shoulder', 'back', 'aura', 'accessory',
];
