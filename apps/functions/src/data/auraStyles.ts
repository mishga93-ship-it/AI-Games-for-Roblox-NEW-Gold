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

export function buildAuraImagePrompt(input: AuraPromptInput, variation?: 'op' | 'cursed'): string {
  const style = AURA_STYLES[input.style];
  const userClause = input.userPrompt.trim()
    ? ` Concept brief: "${input.userPrompt.trim().slice(0, 200)}".`
    : '';
  const variationClause = variation === 'op'
    ? ' OVERPOWERED variant — push particle count, screen-filling, broken-game energy.'
    : variation === 'cursed'
      ? ' CURSED variant — absurd, weird, brainrot meme energy mixed in.'
      : '';
  return [
    `A Roblox blocky avatar emanating a powerful ${style.titleEN} aura.${userClause}`,
    style.imageStyle,
    INTENSITY_GUIDANCE[input.intensity],
    SIZE_GUIDANCE[input.size],
    TONE_GUIDANCE[input.tone],
    variationClause,
    'Full body 3/4 view, character centered, plain dark background to make particles pop, dramatic studio lighting, sharp clean stylized 3D cartoon render. R15 Roblox proportions.',
    'Family-friendly, no real horror, no gore, no blood, no text, no logos.',
  ].join(' ');
}

/**
 * System + user prompt for the Anthropic Lua generation call. Strict
 * safety: no HttpService, no RemoteEvent abuse, no loadstring, no
 * task.spawn forever-loops, no performance bombs. Only cosmetic
 * ParticleEmitter / Attachment / PointLight / Beam.
 */
export function buildAuraLuaPrompt(input: AuraPromptInput): string {
  const style = AURA_STYLES[input.style];
  const userClause = input.userPrompt.trim()
    ? `\nUser brief: "${input.userPrompt.trim().slice(0, 240)}"`
    : '';
  return [
    'You are a SAFE Roblox Lua VFX generator. Output ONLY a complete Lua script wrapped in ```lua ... ``` — no preamble.',
    '',
    `Generate a server Script that creates a cosmetic aura effect on the player character.`,
    `Style: ${style.titleEN}. Palette: ${style.luaPaletteHint}.`,
    `Intensity: ${input.intensity}. ${INTENSITY_GUIDANCE[input.intensity]}`,
    `Size: ${input.size}. ${SIZE_GUIDANCE[input.size]}`,
    `Tone: ${input.tone}. ${TONE_GUIDANCE[input.tone]}${userClause}`,
    '',
    'STRICT RULES (the user is a beginner — script must be safe + drop-in):',
    '1) Place the Script in ServerScriptService (one server script that listens for new players).',
    '2) Use ONLY: Players service, ParticleEmitter, Attachment, Beam, Trail, PointLight, NumberSequence, ColorSequence, NumberRange, Color3.fromRGB.',
    '3) Attach all VFX to HumanoidRootPart of the player character via a new Attachment.',
    '4) BANNED — never use: HttpService, MarketplaceService, MessagingService, RemoteEvent, RemoteFunction, BindableEvent, loadstring, require(rbx<number>), os.execute, game:HttpGet, game:GetService("DataStoreService"), exploit hooks. ZERO networking.',
    '5) Particle Rate ≤ 250. Lifetime ≤ 3. Size ≤ 4. No infinite `while true do` loops without `task.wait`. No `task.spawn(function() while true do end end)`.',
    '6) Use built-in Roblox particle textures only via assetId — pick a safe COSMETIC one (e.g. rbxassetid://243660364 for sparkle, rbxassetid://3433284175 for smoke, rbxassetid://244524246 for flare). If unsure, just use rbxassetid://243660364.',
    '7) Wrap player listener in Players.PlayerAdded + CharacterAdded so it works for late joiners + respawns.',
    '8) Add a couple of inline comments in English explaining what each block does (beginner-friendly).',
    '9) Keep total script ≤ 80 lines.',
    '10) NO outside imports, NO non-Roblox APIs.',
    '',
    'Output ONLY the ```lua code block. No prose.',
  ].join('\n');
}
