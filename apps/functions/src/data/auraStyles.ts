// auraStyles.ts — Voice-to-Aura particle engine presets (session 385).
//
// Defines style + intensity + size + mood modifiers that compose into:
//   1. A flux text-to-image prompt for the concept preview.
//   2. An Anthropic prompt that generates SAFE Roblox Lua particle code.
//
// CRITICAL SAFETY: the Lua generator NEVER produces exploit / RemoteEvent
// abuse / loadstring / performance-bomb particles. Strict whitelist:
// ParticleEmitter, Attachment, Beam, Trail, PointLight on a character
// HumanoidRootPart only.

export type AuraStyleId =
  | 'anime'
  | 'realistic'
  | 'sigma'
  | 'demon'
  | 'cyber'
  | 'void'
  | 'cosmic'
  | 'meme';

export type AuraIntensity = 'calm' | 'aggressive' | 'extreme';
export type AuraSize      = 'small' | 'normal' | 'massive';
export type AuraTone      = 'clean' | 'cursed';

export interface AuraStyle {
  id: AuraStyleId;
  titleEN: string;
  titleRU: string;
  emoji: string;
  accentHex: string;
  /** Prompt fragment for flux concept image. */
  imageStyle: string;
  /** Prompt fragment guiding the LLM toward a specific Lua particle palette. */
  luaPaletteHint: string;
}

export const AURA_STYLES: Record<AuraStyleId, AuraStyle> = {
  anime: {
    id: 'anime',
    titleEN: 'Anime',
    titleRU: 'Anime',
    emoji: '⚔️',
    accentHex: 'FF1493',
    imageStyle: 'anime cel-shaded aura with dramatic streaking energy lines, glowing aura outline around the character, shounen-style overpowered vibe',
    luaPaletteHint: 'bright anime palette — neons and primary saturated colors (cyan, magenta, gold)',
  },
  realistic: {
    id: 'realistic',
    titleEN: 'Realistic',
    titleRU: 'Realistic',
    emoji: '🔥',
    accentHex: 'FF6B35',
    imageStyle: 'photorealistic stylized particle simulation, real fire/smoke physics, cinematic lighting',
    luaPaletteHint: 'naturalistic palette — fire orange to red gradient, smoke greys, ember sparks',
  },
  sigma: {
    id: 'sigma',
    titleEN: 'Sigma',
    titleRU: 'Sigma',
    emoji: '🗿',
    accentHex: '1F2530',
    imageStyle: 'cold minimalist sigma aura — dark monochrome smoky particles, gold dust accents, suit-and-sunglasses character',
    luaPaletteHint: 'monochrome dark with gold/silver accent particles',
  },
  demon: {
    id: 'demon',
    titleEN: 'Demon',
    titleRU: 'Demon',
    emoji: '👿',
    accentHex: '8B0000',
    imageStyle: 'cursed-meme demon aura, dark red and black smoke, glowing eyes, anime demon arc protagonist energy (stylized cartoon, NOT real horror)',
    luaPaletteHint: 'dark red + black + crimson palette, hellfire-style sparks',
  },
  cyber: {
    id: 'cyber',
    titleEN: 'Cyber',
    titleRU: 'Cyber',
    emoji: '⚡',
    accentHex: '00FFAA',
    imageStyle: 'cyberpunk neon glitch aura, electric blue and green lightning, futuristic tech particles, 2077 dystopia vibe',
    luaPaletteHint: 'electric blue/green/cyan neon palette, sharp lightning sparks',
  },
  void: {
    id: 'void',
    titleEN: 'Void',
    titleRU: 'Void',
    emoji: '🌀',
    accentHex: '5C0D9C',
    imageStyle: 'void/cosmic dark aura — black with deep purple and indigo wisps, swirling particles, mysterious negative space',
    luaPaletteHint: 'deep purple + black + indigo + occasional white star-spark',
  },
  cosmic: {
    id: 'cosmic',
    titleEN: 'Cosmic',
    titleRU: 'Cosmic',
    emoji: '✨',
    accentHex: '8A2BE2',
    imageStyle: 'cosmic galaxy aura — nebula clouds, star-dust, swirling galaxy spiral around character, deep space wonder',
    luaPaletteHint: 'cosmic palette — deep violet, royal blue, pink stardust, occasional white stars',
  },
  meme: {
    id: 'meme',
    titleEN: 'Meme',
    titleRU: 'Meme',
    emoji: '💀',
    accentHex: '39FF14',
    imageStyle: 'absurd brainrot meme aura — random unrelated objects floating around (bananas, hamsters, cursed faces), chaotic neon energy',
    luaPaletteHint: 'chaotic neon palette — every color, random, deliberately absurd combinations',
  },
};

// Intensity → speed/rate multipliers (the AI sees these as guidance).
export const INTENSITY_GUIDANCE: Record<AuraIntensity, string> = {
  calm:       'Gentle particle rate (20-40), slow movement (1-3 stud/s), low transparency variance. Calm atmospheric vibe.',
  aggressive: 'High particle rate (60-120), fast movement (5-10 stud/s), dynamic color swings. Powerful action vibe.',
  extreme:    'Maximum particle rate (150-250), explosive speed (10-20 stud/s), screen-filling. UNHINGED power-fantasy vibe. (Still bounded — Roblox client must not lag.)',
};

export const SIZE_GUIDANCE: Record<AuraSize, string> = {
  small:   'Particle size 0.3-0.6 stud, tight around the character.',
  normal:  'Particle size 0.8-1.5 stud, body-radius aura.',
  massive: 'Particle size 2-4 stud, oversized arena-sized aura.',
};

export const TONE_GUIDANCE: Record<AuraTone, string> = {
  clean:  'Tight readable particle silhouette, harmonious palette, anime-clean composition.',
  cursed: 'Chaotic absurd composition, deliberately weird color clashes, brainrot meme energy.',
};

export function isAuraStyleId(v: unknown): v is AuraStyleId {
  return typeof v === 'string' && v in AURA_STYLES;
}
export function parseAuraIntensity(v: unknown): AuraIntensity {
  return v === 'calm' || v === 'aggressive' || v === 'extreme' ? v : 'aggressive';
}
export function parseAuraSize(v: unknown): AuraSize {
  return v === 'small' || v === 'normal' || v === 'massive' ? v : 'normal';
}
export function parseAuraTone(v: unknown): AuraTone {
  return v === 'clean' || v === 'cursed' ? v : 'clean';
}

export function listAuraStyles(): AuraStyle[] {
  return Object.values(AURA_STYLES);
}

// ─── Prompt builders ────────────────────────────────────────────

export interface AuraPromptInput {
  userPrompt: string;        // user's free-form (voice transcript or typed)
  style: AuraStyleId;
  intensity: AuraIntensity;
  size: AuraSize;
  tone: AuraTone;
}

// ─── Prompt-driven visual resolution (color + motion + texture) ──
//
// The user's free-form brief is the PRIMARY driver of how an aura looks —
// not just the style preset. We mine the brief for named colors and
// described motion so two different prompts produce visually DISTINCT,
// on-description auras instead of the same style-default look. Bilingual
// (EN + RU) because voice transcripts arrive in either language. Russian
// stems are word-start-anchored to avoid false hits inside other words
// (e.g. "красн" must not fire on "прекрасный").

export type Rgb = [number, number, number];
export interface AuraColorHint { name: string; rgb: Rgb; }

function hexToRgb(hex: string): Rgb {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16) || 0,
    parseInt(h.slice(2, 4), 16) || 0,
    parseInt(h.slice(4, 6), 16) || 0,
  ];
}

const COLOR_LEXICON: Array<{ re: RegExp; name: string; rgb: Rgb }> = [
  { re: /\bgold(en)?\b|\bamber\b|(?<![a-zа-яё])(золот|янтар)/i,            name: 'gold',    rgb: [255, 196, 40] },
  { re: /\bcrimson\b|blood[\s-]?red|\bscarlet\b|(?<![a-zа-яё])(кров|багров|алый|алая)/i, name: 'crimson', rgb: [176, 22, 28] },
  { re: /\bred\b|(?<![a-zа-яё])красн/i,                                    name: 'red',     rgb: [228, 42, 42] },
  { re: /\borange\b|(?<![a-zа-яё])оранж/i,                                 name: 'orange',  rgb: [255, 124, 28] },
  { re: /\byellow\b|(?<![a-zа-яё])(жёлт|желт)/i,                           name: 'yellow',  rgb: [255, 224, 64] },
  { re: /\bemerald\b|\btoxic\b|\bgreen\b|(?<![a-zа-яё])(зелён|зелен|изумруд)/i, name: 'green', rgb: [40, 200, 90] },
  { re: /\blime\b|(?<![a-zа-яё])(салатов|кислотн)/i,                       name: 'lime',    rgb: [140, 255, 50] },
  { re: /\bcyan\b|\baqua\b|turquoise|\bic[ye]\b|(?<![a-zа-яё])(бирюз|голуб|лёд|лед)/i, name: 'cyan', rgb: [120, 224, 255] },
  { re: /\bblue\b|(?<![a-zа-яё])син(ий|яя|ее|ие|ь|еват)?/i,                name: 'blue',    rgb: [50, 110, 255] },
  { re: /\bpurple\b|\bviolet\b|(?<![a-zа-яё])(фиолет|пурпур|сирен)/i,      name: 'purple',  rgb: [150, 60, 255] },
  { re: /\bindigo\b|(?<![a-zа-яё])индиго/i,                                name: 'indigo',  rgb: [80, 32, 168] },
  { re: /\bpink\b|magenta|(?<![a-zа-яё])(розов|малинов)/i,                 name: 'pink',    rgb: [255, 90, 185] },
  { re: /\bwhite\b|\bholy\b|\bdivine\b|(?<![a-zа-яё])(белый|белая|белое|белые|сиян|свет)/i, name: 'white', rgb: [245, 245, 255] },
  { re: /\bsilver\b|\bchrome\b|\bsteel\b|(?<![a-zа-яё])(серебр|сталь|хром)/i, name: 'silver', rgb: [200, 205, 215] },
  { re: /\bblack\b|\bshadow\b|\bdark\b|\babyss\b|(?<![a-zа-яё])(чёрн|черн|тёмн|темн|тень)/i, name: 'black', rgb: [24, 24, 34] },
];

const RAINBOW_RE = /rainbow|prismatic|multicolou?r|(?<![a-zа-яё])(раду[гж]|разноцвет)/i;

export function extractAuraColors(userPrompt: string): AuraColorHint[] {
  const out: AuraColorHint[] = [];
  for (const c of COLOR_LEXICON) {
    if (c.re.test(userPrompt)) out.push({ name: c.name, rgb: c.rgb });
    if (out.length >= 3) break;
  }
  return out;
}

const MOTION_LEXICON: Array<{ re: RegExp; clause: string }> = [
  { re: /fire|flame|burn|ris(e|ing)|upward|ascend|(?<![a-zа-яё])(огонь|огнен|пламя|горит|вверх|восход)/i,
    clause: 'MOTION: particles rise UPWARD like flame/heat — positive Y Acceleration (~ +6) and an upward EmissionDirection.' },
  { re: /swirl|vortex|spiral|tornado|spin|orbit|whirl|(?<![a-zа-яё])(вихр|спирал|торнадо|враща|кружит|закрут)/i,
    clause: 'MOTION: particles SWIRL and orbit the body — high RotSpeed and tangential Speed so the aura spins/spirals around the character.' },
  { re: /burst|explo(de|sion)|blast|shockwave|nova|(?<![a-zа-яё])(взрыв|вспышк|ударн|нова)/i,
    clause: 'MOTION: particles BURST outward from the center — high Speed, short Lifetime (~0.4-0.8), wide SpreadAngle, outward EmissionDirection.' },
  { re: /fall(ing)?|rain|snow|drip|descend|sink|(?<![a-zа-яё])(падает|дождь|снег|вниз|ниспад|оседа)/i,
    clause: 'MOTION: particles FALL/drift downward — negative Y Acceleration (~ -6), gentle Speed, longer Lifetime.' },
  { re: /lightning|electric|crackle|spark|zap|thunder|(?<![a-zа-яё])(молни|электр|искр|разряд|гром)/i,
    clause: 'MOTION: sharp erratic ELECTRIC sparks — very short Lifetime (~0.3-0.6), high Speed, high Drag, jittery.' },
  { re: /flow|wave|water|liquid|stream|smooth|(?<![a-zа-яё])(поток|волна|вода|текуч|плавн|струит)/i,
    clause: 'MOTION: smooth FLOWING motion — moderate Speed, long Lifetime, narrow SpreadAngle, low Drag.' },
  { re: /puls(e|ing)|heartbeat|breath(e|ing)|throb|(?<![a-zа-яё])(пульс|биени|дыхан)/i,
    clause: 'MOTION: PULSING rhythm — vary Size/Transparency over lifetime in waves for a breathing feel.' },
];

export function extractAuraMotion(userPrompt: string): string | undefined {
  for (const m of MOTION_LEXICON) if (m.re.test(userPrompt)) return m.clause;
  return undefined;
}

// Trusted, already-shipped Roblox particle texture IDs (in production since
// session 385). We deliberately do NOT expand to random Toolbox IDs — those
// can be moderation-deleted, which would silently break the aura.
export const AURA_TEXTURES = {
  sparkle: 'rbxassetid://243660364',
  smoke:   'rbxassetid://3433284175',
  flare:   'rbxassetid://244524246',
} as const;

export type AuraTextureConcept = 'sparkle' | 'smoke' | 'flare';

export function pickAuraTexture(userPrompt: string, style: AuraStyleId): { id: string; concept: AuraTextureConcept } {
  const lc = userPrompt.toLowerCase();
  if (/fire|flame|smoke|burn|fog|mist|cloud|ash|ember|огонь|пламя|дым|туман|пепел/.test(lc)) {
    return { id: AURA_TEXTURES.smoke, concept: 'smoke' };
  }
  if (/flare|sun|solar|burst|explos|energy|laser|beam|plasma|вспышк|солнц|энерг|плазм|взрыв/.test(lc)) {
    return { id: AURA_TEXTURES.flare, concept: 'flare' };
  }
  if (/star|sparkle|magic|glitter|shimmer|holy|fairy|звезд|искр|маги|блеск|волшеб/.test(lc)) {
    return { id: AURA_TEXTURES.sparkle, concept: 'sparkle' };
  }
  const byStyle: Record<AuraStyleId, AuraTextureConcept> = {
    anime: 'flare', realistic: 'smoke', sigma: 'smoke', demon: 'smoke',
    cyber: 'sparkle', void: 'smoke', cosmic: 'sparkle', meme: 'sparkle',
  };
  const concept = byStyle[style];
  return { id: AURA_TEXTURES[concept], concept };
}

export interface AuraVisualResolution {
  colors: AuraColorHint[];
  primaryRgb: Rgb;
  rainbow: boolean;
  motionClause?: string;
  texture: { id: string; concept: AuraTextureConcept };
}

/**
 * Resolve the user's free-form brief into concrete visual directives that
 * OVERRIDE the style-preset defaults. This is what makes every prompt yield
 * a distinct, on-description aura instead of the same style look.
 */
export function resolveAuraVisuals(input: AuraPromptInput): AuraVisualResolution {
  const colors = extractAuraColors(input.userPrompt);
  const style = AURA_STYLES[input.style];
  return {
    colors,
    primaryRgb: colors[0]?.rgb ?? hexToRgb(style.accentHex),
    rainbow: RAINBOW_RE.test(input.userPrompt),
    motionClause: extractAuraMotion(input.userPrompt),
    texture: pickAuraTexture(input.userPrompt, input.style),
  };
}

function describeColors(v: AuraVisualResolution): string {
  if (v.rainbow) return 'RAINBOW / prismatic — cycle many vivid hues across the ColorSequence';
  if (v.colors.length === 0) return '';
  return v.colors.map(c => `${c.name} rgb(${c.rgb.join(',')})`).join(', ');
}

export function buildAuraImagePrompt(input: AuraPromptInput, variation?: 'op' | 'cursed'): string {
  const style = AURA_STYLES[input.style];
  const v = resolveAuraVisuals(input);
  const brief = input.userPrompt.trim().slice(0, 200);
  const colorDesc = describeColors(v);

  const conceptClause = brief
    ? `Concept (PRIMARY — match this exactly): "${brief}".`
    : `Concept: a powerful ${style.titleEN} aura.`;
  const colorClause = colorDesc ? `Dominant colors: ${colorDesc}.` : '';
  const motionClause = v.motionClause ? v.motionClause.replace(/^MOTION:\s*/, 'Motion: ') : '';
  const variationClause = variation === 'op'
    ? 'OVERPOWERED variant — push particle count, screen-filling, broken-game energy.'
    : variation === 'cursed'
      ? 'CURSED variant — absurd, weird, brainrot meme energy mixed in.'
      : '';
  return [
    `A Roblox blocky R15 avatar emanating an aura. ${conceptClause}`,
    colorClause,
    motionClause,
    `Style flavor: ${style.imageStyle}.`,
    INTENSITY_GUIDANCE[input.intensity],
    SIZE_GUIDANCE[input.size],
    TONE_GUIDANCE[input.tone],
    variationClause,
    'Full body 3/4 view, character centered, plain dark background to make particles pop, dramatic studio lighting, sharp clean stylized 3D cartoon render. R15 Roblox proportions.',
    'Family-friendly, no real horror, no gore, no blood, no text, no logos.',
  ].filter(Boolean).join(' ');
}

/**
 * System + user prompt for the Anthropic Lua generation call. Strict
 * safety: no HttpService, no RemoteEvent abuse, no loadstring, no
 * task.spawn forever-loops, no performance bombs. Only cosmetic
 * ParticleEmitter / Attachment / PointLight / Beam.
 */
export function buildAuraLuaPrompt(input: AuraPromptInput): string {
  const style = AURA_STYLES[input.style];
  const v = resolveAuraVisuals(input);
  const brief = input.userPrompt.trim().slice(0, 240);
  const colorDesc = describeColors(v);

  const colorDirective = v.rainbow
    ? `COLORS: ${colorDesc}. Build a multi-stop ColorSequence cycling those hues.`
    : v.colors.length > 0
      ? `COLORS (from the user's words — these OVERRIDE the style default; build the ColorSequence around them and use these exact Color3.fromRGB values as the dominant stops): ${colorDesc}.`
      : `COLORS: base on the style palette — ${style.luaPaletteHint}.`;

  return [
    'You are a SAFE Roblox Lua VFX generator. Output ONLY a complete Lua script wrapped in ```lua ... ``` — no preamble.',
    '',
    'Generate a server Script that creates a cosmetic aura effect on the player character.',
    brief ? `USER BRIEF (this is the PRIMARY spec — the aura MUST visibly match it): "${brief}"` : '',
    colorDirective,
    v.motionClause ?? 'MOTION: pick motion that fits the brief and style.',
    `TEXTURE: use ${v.texture.id} (${v.texture.concept}) as the particle Texture — it matches the described element.`,
    `Style flavor: ${style.titleEN}. Intensity: ${input.intensity}. ${INTENSITY_GUIDANCE[input.intensity]}`,
    `Size: ${input.size}. ${SIZE_GUIDANCE[input.size]}`,
    `Tone: ${input.tone}. ${TONE_GUIDANCE[input.tone]}`,
    '',
    'COMPOSITION (make it look pro, not one flat emitter):',
    '- Layer 2-3 ParticleEmitters on the attachment: (a) a dense CORE close to the body, (b) a softer wider AMBIENT glow, (c) a sparse ACCENT (sparks/embers/stars). Give them different Size/Speed/Transparency so the aura has depth.',
    '- Add ONE PointLight tinted to the dominant color for a real glow.',
    '- Drive Color via ColorSequence (gradient across the dominant colors) and Size/Transparency via NumberSequence over lifetime.',
    '',
    'STRICT RULES (the user is a beginner — script must be safe + drop-in):',
    '1) Place the Script in ServerScriptService (one server script that listens for new players).',
    '2) Use ONLY: Players service, ParticleEmitter, Attachment, Beam, Trail, PointLight, NumberSequence, ColorSequence, NumberRange, Color3.fromRGB.',
    '3) Attach all VFX to HumanoidRootPart of the player character via a new Attachment.',
    '4) BANNED — never use: HttpService, MarketplaceService, MessagingService, RemoteEvent, RemoteFunction, BindableEvent, loadstring, require(rbx<number>), os.execute, game:HttpGet, game:GetService("DataStoreService"), exploit hooks. ZERO networking.',
    '5) COMBINED Rate across all emitters ≤ 250. Lifetime ≤ 3. Size ≤ 4. No infinite `while true do` loops without `task.wait`. No `task.spawn(function() while true do end end)`.',
    `6) Use ONLY these particle textures (assetId): ${AURA_TEXTURES.sparkle} (sparkle), ${AURA_TEXTURES.smoke} (smoke), ${AURA_TEXTURES.flare} (flare). Prefer the one named in TEXTURE above. Do NOT invent other assetIds.`,
    '7) Wrap player listener in Players.PlayerAdded + CharacterAdded so it works for late joiners + respawns.',
    '8) Add a couple of inline comments in English explaining what each block does (beginner-friendly).',
    '9) Keep total script ≤ 130 lines.',
    '10) NO outside imports, NO non-Roblox APIs.',
    '',
    'Output ONLY the ```lua code block. No prose.',
  ].filter(Boolean).join('\n');
}
