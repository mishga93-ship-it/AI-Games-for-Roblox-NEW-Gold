// cursedUgcCategories.ts — Giant & Cursed UGC Modeler presets (session 384).
//
// 7 categories × 8 styles × 3 intensity levels. Each combination produces
// a flux text-to-image prompt that biases toward "cursed Roblox meme UGC"
// — absurd, stylized, oversized, but NEVER real horror/gore.

export type CursedUGCCategoryId =
  | 'giant_backpack'
  | 'cursed_face'
  | 'meme_plushie'
  | 'giant_pet'
  | 'weird_mask'
  | 'brainrot_item'
  | 'oversized_hat';

export type CursedUGCStyleId =
  | 'cute'
  | 'horror'
  | 'sigma'
  | 'brainrot'
  | 'anime'
  | 'hyperreal'
  | 'cursed'
  | 'emo';

export type CursedUGCIntensity = 'mild' | 'strong' | 'extreme';

export interface CursedUGCCategory {
  id: CursedUGCCategoryId;
  titleEN: string;
  titleRU: string;
  pitchEN: string;
  pitchRU: string;
  iconSymbol: string;
  accentHex: string;
  /** Base prompt fragment specific to this category (the THING being made). */
  promptBase: string;
}

export interface CursedUGCStyle {
  id: CursedUGCStyleId;
  titleEN: string;
  titleRU: string;
  iconSymbol: string;
  accentHex: string;
  /** Style fragment appended to the base. */
  promptStyle: string;
}

export const CURSED_UGC_CATEGORIES: Record<CursedUGCCategoryId, CursedUGCCategory> = {
  giant_backpack: {
    id: 'giant_backpack',
    titleEN: 'Giant Backpack',
    titleRU: 'Giant Backpack',
    pitchEN: 'Absurdly oversized plushie backpacks the size of a small car.',
    pitchRU: 'Абсурдно огромные плюшевые рюкзаки размером с маленькую машину.',
    iconSymbol: 'backpack.fill',
    accentHex: 'FF6B9D',
    promptBase: 'A massively oversized Roblox UGC backpack that is comically larger than the avatar wearing it — the backpack alone is 3-4x bigger than the character.',
  },
  cursed_face: {
    id: 'cursed_face',
    titleEN: 'Cursed Face',
    titleRU: 'Cursed Face',
    pitchEN: 'Roblox face accessory with absolutely cursed-but-meme energy.',
    pitchRU: 'Roblox face accessory с absolutely cursed-but-meme энергией.',
    iconSymbol: 'face.dashed.fill',
    accentHex: '8B0000',
    promptBase: 'A Roblox UGC face accessory with comically exaggerated cursed-meme features — wide unsettling smile, asymmetric eyes, "deep-fried" texture, but stylized cartoon (NOT real horror, NOT gore).',
  },
  meme_plushie: {
    id: 'meme_plushie',
    titleEN: 'Meme Plushie',
    titleRU: 'Meme Plushie',
    pitchEN: 'Giant shoulder plushies based on absurd meme creatures.',
    pitchRU: 'Гигантские плюшевые игрушки на плечо на основе мем-существ.',
    iconSymbol: 'pawprint.fill',
    accentHex: 'FFB347',
    promptBase: 'A Roblox UGC shoulder plushie of an absurd meme creature, comically oversized, sitting on the avatar shoulder. The plushie itself is the size of the avatar head.',
  },
  giant_pet: {
    id: 'giant_pet',
    titleEN: 'Giant Pet',
    titleRU: 'Giant Pet',
    pitchEN: 'Massively oversized following pets — bigger than the avatar.',
    pitchRU: 'Огромные follow-pets — больше самого аватара.',
    iconSymbol: 'tortoise.fill',
    accentHex: '00B4D8',
    promptBase: 'A Roblox UGC pet companion that is massively oversized — bigger than the player avatar. Following next to a tiny avatar that looks helpless next to it.',
  },
  weird_mask: {
    id: 'weird_mask',
    titleEN: 'Weird Mask',
    titleRU: 'Weird Mask',
    pitchEN: 'Cursed-meme face masks that cover the whole head bizarrely.',
    pitchRU: 'Cursed-meme маски, странно закрывающие всю голову.',
    iconSymbol: 'theatermasks.fill',
    accentHex: '6A0DAD',
    promptBase: 'A Roblox UGC head mask that bizarrely covers the entire head with a meme creature face. Stylized cartoon — exaggerated proportions but NOT scary realistic.',
  },
  brainrot_item: {
    id: 'brainrot_item',
    titleEN: 'Brainrot Item',
    titleRU: 'Brainrot Item',
    pitchEN: 'Steal-a-Brainrot style absurdist meme accessories.',
    pitchRU: 'Steal-a-Brainrot стиль — абсурдные мем-аксессуары.',
    iconSymbol: 'brain.head.profile',
    accentHex: '39FF14',
    promptBase: 'A Roblox UGC accessory in the Steal-a-Brainrot meme aesthetic — absurd cartoon character combining 2-3 unrelated things (e.g., banana with shark legs, hamster with sunglasses and chains, cat with rocket boosters).',
  },
  oversized_hat: {
    id: 'oversized_hat',
    titleEN: 'Oversized Hat',
    titleRU: 'Oversized Hat',
    pitchEN: 'Absurd hats bigger than the avatar wearing them.',
    pitchRU: 'Абсурдные шапки больше аватара.',
    iconSymbol: 'graduationcap.fill',
    accentHex: 'F4A460',
    promptBase: 'A Roblox UGC hat that is comically oversized — the hat itself is 2-3x bigger than the avatar head, almost crushing them.',
  },
};

export const CURSED_UGC_STYLES: Record<CursedUGCStyleId, CursedUGCStyle> = {
  cute: {
    id: 'cute',
    titleEN: 'Cute',
    titleRU: 'Cute',
    iconSymbol: 'heart.fill',
    accentHex: 'FFB6C1',
    promptStyle: 'Kawaii cute aesthetic, pastel colors, big sparkly eyes, soft plushie texture, family-friendly cute.',
  },
  horror: {
    id: 'horror',
    titleEN: 'Horror',
    titleRU: 'Horror',
    iconSymbol: 'flame.fill',
    accentHex: '2A0A0A',
    promptStyle: 'Stylized cartoon-horror aesthetic — exaggerated unsettling features but NOT real gore. Dark color palette, edge-lighting, dramatic shadows. Family-friendly meme-horror only.',
  },
  sigma: {
    id: 'sigma',
    titleEN: 'Sigma',
    titleRU: 'Sigma',
    iconSymbol: 'person.fill.checkmark',
    accentHex: '1F2530',
    promptStyle: 'Sigma chad meme aesthetic — sunglasses, suit, cold stoic vibe, gold chains, jaw-line. Even the cursed item should feel "alpha".',
  },
  brainrot: {
    id: 'brainrot',
    titleEN: 'Brainrot',
    titleRU: 'Brainrot',
    iconSymbol: 'sparkles',
    accentHex: '39FF14',
    promptStyle: 'Steal-a-Brainrot meme aesthetic — combines 2-3 unrelated absurd elements, hyperactive colors, chaotic energy, "what the hell is this" vibe.',
  },
  anime: {
    id: 'anime',
    titleEN: 'Anime',
    titleRU: 'Anime',
    iconSymbol: 'star.fill',
    accentHex: 'FF1493',
    promptStyle: 'Anime aesthetic — huge sparkling eyes, dramatic hair, kawaii expression, anime cel-shading, deformed cute proportions.',
  },
  hyperreal: {
    id: 'hyperreal',
    titleEN: 'Hyperreal',
    titleRU: 'Hyperreal',
    iconSymbol: 'eye.fill',
    accentHex: 'A0A0A0',
    promptStyle: 'Hyperreal stylized 3D render — uncanny photo-realism mixed with blocky Roblox proportions. Surreal, dreamlike quality.',
  },
  cursed: {
    id: 'cursed',
    titleEN: 'Cursed',
    titleRU: 'Cursed',
    iconSymbol: 'wand.and.stars',
    accentHex: '5C0D9C',
    promptStyle: 'Cursed-meme aesthetic — comically wrong proportions, weird color combinations, "deep-fried" oversaturated colors, asymmetric features. NOT scary, just absurdly weird.',
  },
  emo: {
    id: 'emo',
    titleEN: 'Emo',
    titleRU: 'Emo',
    iconSymbol: 'music.note',
    accentHex: '6B0F1A',
    promptStyle: 'Emo 2007 aesthetic — black, chains, side-bangs, eyeliner, MySpace vibes, sad designer energy.',
  },
};

export const INTENSITY_MULTIPLIERS: Record<CursedUGCIntensity, string> = {
  mild: 'Slightly weird but charming.',
  strong: 'Very weird, very memorable, full cursed-meme energy.',
  extreme: 'ABSOLUTELY UNHINGED. Maximum absurdity. The kind of item that makes people screenshot and forward it. Still NO real horror or gore — just maxed-out meme cursedness.',
};

// Always-appended safety + style suffix.
export const SAFETY_SUFFIX =
  ' Stylized 3D cartoon render, plain white background, soft studio lighting, blocky Roblox aesthetic.' +
  ' Family-friendly meme content only. NO real horror, NO gore, NO blood, NO disturbing imagery,' +
  ' NO realistic violence. NO text, NO logos, NO watermarks.';

export function buildCursedUGCPrompt(args: {
  category: CursedUGCCategoryId;
  style: CursedUGCStyleId;
  intensity: CursedUGCIntensity;
  userPrompt?: string;
  variationOverride?: 'cuter' | 'more_cursed';
}): string {
  const cat = CURSED_UGC_CATEGORIES[args.category];
  const sty = CURSED_UGC_STYLES[args.style];
  const intensityClause = INTENSITY_MULTIPLIERS[args.intensity];
  const userExtra = args.userPrompt?.trim()
    ? ` User context: ${args.userPrompt.trim().slice(0, 120)}.`
    : '';
  const variationClause = args.variationOverride === 'cuter'
    ? ' Lean CUTER — soft proportions, pastel accents, plushie texture, less aggressive.'
    : args.variationOverride === 'more_cursed'
      ? ' Lean MORE CURSED — push the weirdness further, more absurd, more "what is this" energy.'
      : '';
  return `${cat.promptBase} ${sty.promptStyle} ${intensityClause}${variationClause}${userExtra}${SAFETY_SUFFIX}`;
}

export function isCursedUGCCategoryId(v: unknown): v is CursedUGCCategoryId {
  return typeof v === 'string' && v in CURSED_UGC_CATEGORIES;
}
export function isCursedUGCStyleId(v: unknown): v is CursedUGCStyleId {
  return typeof v === 'string' && v in CURSED_UGC_STYLES;
}
export function parseCursedUGCIntensity(v: unknown): CursedUGCIntensity {
  return v === 'mild' || v === 'strong' || v === 'extreme' ? v : 'strong';
}

export function listCursedUGCCategories(): CursedUGCCategory[] {
  return Object.values(CURSED_UGC_CATEGORIES);
}
export function listCursedUGCStyles(): CursedUGCStyle[] {
  return Object.values(CURSED_UGC_STYLES);
}
