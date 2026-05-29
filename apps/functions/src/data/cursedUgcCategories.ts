// cursedUgcCategories.ts — Giant & Cursed UGC Modeler presets (session 384).
//
// 7 categories × 8 styles × 3 intensity levels. Each combination produces
// a flux text-to-image prompt that biases toward "cursed Roblox meme UGC"
// — absurd, stylized, oversized, but NEVER real horror/gore.
//
// session 396 — prompts rewritten to describe the ISOLATED ITEM only.
//   User repro: "тут человек с айтемом а не просто рюкзак" — every promptBase
//   referenced "the avatar wearing it" / "cartoon character" and the sigma
//   style described a person ("sunglasses, suit, jaw-line"), so both flux (2D)
//   and Meshy (3D, item_tool) rendered a CHARACTER. Now every base/style
//   describes the standalone accessory and SAFETY_SUFFIX hard-negatives any
//   avatar/person/body/wearer.

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
    promptBase: 'A single massively oversized Roblox UGC backpack accessory, shown entirely on its own as one standalone object — an absurdly huge plushie-style backpack, the item alone, nobody wearing it.',
  },
  cursed_face: {
    id: 'cursed_face',
    titleEN: 'Cursed Face',
    titleRU: 'Cursed Face',
    pitchEN: 'Roblox face accessory with absolutely cursed-but-meme energy.',
    pitchRU: 'Roblox face accessory с absolutely cursed-but-meme энергией.',
    iconSymbol: 'face.dashed.fill',
    accentHex: '8B0000',
    promptBase: 'A single Roblox UGC face accessory (a wearable face-decal accessory, shown by itself as one floating standalone object) with comically exaggerated cursed-meme features — wide unsettling smile, asymmetric eyes, "deep-fried" texture, stylized cartoon (NOT real horror, NOT gore), just the accessory alone with no body.',
  },
  meme_plushie: {
    id: 'meme_plushie',
    titleEN: 'Meme Plushie',
    titleRU: 'Meme Plushie',
    pitchEN: 'Giant shoulder plushies based on absurd meme creatures.',
    pitchRU: 'Гигантские плюшевые игрушки на плечо на основе мем-существ.',
    iconSymbol: 'pawprint.fill',
    accentHex: 'FFB347',
    promptBase: 'A single Roblox UGC shoulder-plushie accessory of an absurd meme creature, comically oversized, shown entirely on its own as one standalone plushie toy object — just the plushie, no avatar, no shoulder, no person.',
  },
  giant_pet: {
    id: 'giant_pet',
    titleEN: 'Giant Pet',
    titleRU: 'Giant Pet',
    pitchEN: 'Massively oversized following pets — bigger than the avatar.',
    pitchRU: 'Огромные follow-pets — больше самого аватара.',
    iconSymbol: 'tortoise.fill',
    accentHex: '00B4D8',
    promptBase: 'A single Roblox UGC pet companion accessory, massively oversized, shown entirely on its own as one standalone creature-prop centered in frame — just the pet object alone, no avatar, no person standing next to it.',
  },
  weird_mask: {
    id: 'weird_mask',
    titleEN: 'Weird Mask',
    titleRU: 'Weird Mask',
    pitchEN: 'Cursed-meme face masks that cover the whole head bizarrely.',
    pitchRU: 'Cursed-meme маски, странно закрывающие всю голову.',
    iconSymbol: 'theatermasks.fill',
    accentHex: '6A0DAD',
    promptBase: 'A single Roblox UGC head-mask accessory with a bizarre meme creature face, shown by itself as one standalone hollow mask object (as if displayed on an invisible stand) — just the mask alone, no head, no body, no avatar wearing it. Stylized cartoon, exaggerated proportions, NOT scary realistic.',
  },
  brainrot_item: {
    id: 'brainrot_item',
    titleEN: 'Brainrot Item',
    titleRU: 'Brainrot Item',
    pitchEN: 'Steal-a-Brainrot style absurdist meme accessories.',
    pitchRU: 'Steal-a-Brainrot стиль — абсурдные мем-аксессуары.',
    iconSymbol: 'brain.head.profile',
    accentHex: '39FF14',
    promptBase: 'A single Roblox UGC accessory prop in the Steal-a-Brainrot meme aesthetic — one absurd standalone OBJECT that mashes together 2-3 unrelated things (e.g., banana with shark fins, donut with rocket boosters, ice-cream cone with tank treads), shown by itself centered in frame. It is an object/prop, NOT a living character, NOT a person, NOT a humanoid.',
  },
  oversized_hat: {
    id: 'oversized_hat',
    titleEN: 'Oversized Hat',
    titleRU: 'Oversized Hat',
    pitchEN: 'Absurd hats bigger than the avatar wearing them.',
    pitchRU: 'Абсурдные шапки больше аватара.',
    iconSymbol: 'graduationcap.fill',
    accentHex: 'F4A460',
    promptBase: 'A single Roblox UGC hat accessory, comically oversized, shown entirely on its own as one standalone hat object — just the hat alone, no head, no avatar, no person wearing it.',
  },
};

export const CURSED_UGC_STYLES: Record<CursedUGCStyleId, CursedUGCStyle> = {
  cute: {
    id: 'cute',
    titleEN: 'Cute',
    titleRU: 'Cute',
    iconSymbol: 'heart.fill',
    accentHex: 'FFB6C1',
    promptStyle: 'Kawaii cute aesthetic applied to the item — pastel colors, soft plushie texture, glossy highlights, family-friendly cute styling on the object itself.',
  },
  horror: {
    id: 'horror',
    titleEN: 'Horror',
    titleRU: 'Horror',
    iconSymbol: 'flame.fill',
    accentHex: '2A0A0A',
    promptStyle: 'Stylized cartoon-horror aesthetic on the item — exaggerated unsettling shapes but NOT real gore. Dark color palette, edge-lighting, dramatic shadows. Family-friendly meme-horror only.',
  },
  sigma: {
    id: 'sigma',
    titleEN: 'Sigma',
    titleRU: 'Sigma',
    iconSymbol: 'person.fill.checkmark',
    accentHex: '1F2530',
    promptStyle: 'Sigma "alpha" meme aesthetic applied to the OBJECT only — sleek black-and-gold color scheme, gold-chain accents draped on the item, cold premium stoic vibe. Style the item itself; do NOT add a person, suit, sunglasses or face.',
  },
  brainrot: {
    id: 'brainrot',
    titleEN: 'Brainrot',
    titleRU: 'Brainrot',
    iconSymbol: 'sparkles',
    accentHex: '39FF14',
    promptStyle: 'Steal-a-Brainrot meme aesthetic on the item — combines 2-3 unrelated absurd object elements, hyperactive colors, chaotic energy, "what the hell is this" vibe.',
  },
  anime: {
    id: 'anime',
    titleEN: 'Anime',
    titleRU: 'Anime',
    iconSymbol: 'star.fill',
    accentHex: 'FF1493',
    promptStyle: 'Anime aesthetic applied to the item — glossy cel-shaded surfaces, sparkly highlights, bright saturated colors, deformed cute proportions on the object itself.',
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
    promptStyle: 'Emo 2007 aesthetic applied to the item — black-and-dark color scheme, chains, studs, MySpace-era designer energy styled onto the object itself, no person.',
  },
};

export const INTENSITY_MULTIPLIERS: Record<CursedUGCIntensity, string> = {
  mild: 'Slightly weird but charming.',
  strong: 'Very weird, very memorable, full cursed-meme energy.',
  extreme: 'ABSOLUTELY UNHINGED. Maximum absurdity. The kind of item that makes people screenshot and forward it. Still NO real horror or gore — just maxed-out meme cursedness.',
};

// Always-appended isolation + safety + style suffix.
// session 396 — the isolation clause is the hard negative that keeps flux/Meshy
// from drawing a character. Keep it first so it carries the most weight.
export const SAFETY_SUFFIX =
  ' Show ONLY the item itself as a single standalone Roblox UGC accessory, isolated and centered, floating on a plain white background.' +
  ' Do NOT show any avatar, person, character, humanoid, body, mannequin, hands, arms, legs or anyone wearing, holding or standing next to the item — just the item by itself.' +
  ' Stylized 3D cartoon render, soft studio lighting, blocky Roblox aesthetic.' +
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
