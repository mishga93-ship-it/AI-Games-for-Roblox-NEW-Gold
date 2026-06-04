import type { SimulatorSceneSpec, HeroAssetResult } from './types.js';
import { withCinematicCamera } from './cinematicCamera.js';
import type { TrendingShowcaseItem } from './generationEnrichment.js';
import { rgbLua, atmosphereOptsLua, deriveTdPack, deriveTdMap, tdMapLua, type GameVisualSpec } from './gameThemeSpec.js';

export type MemeSubTheme = 'skibidi' | 'bombardir' | 'tralalero' | 'sigma' | 'generic';

export interface BrainrotPoolEntry {
  name: string;
  memeSubTheme: MemeSubTheme;
  rarity: 'common' | 'rare' | 'legendary' | 'mythic' | 'secret' | 'brainrot' | 'galactic';
  baseCps: number;
  priceCash: number;
  spawnWeight: number;
  primaryColor: [number, number, number];
  accentColor: [number, number, number];
  /** Session #149 visual upgrade: real Roblox catalog asset ID rendered via
   * `rbxthumb://type=Asset&id={ID}&w=420&h=420` in a BillboardGui ImageLabel.
   * Roblox auto-generates a 420×420 thumbnail for ANY asset (decal/accessory/
   * bundle/face/back/hat). When set, the runtime builder skips the composite-
   * block NPC and renders a floating meme sticker — much closer to the
   * TikTok-vibe of Steal-a-Brainrot games. Falls back to composite block if
   * thumbnail fails to load. Verified IDs picked from Roblox catalog April 2026
   * search results. */
  decalAssetId?: number;
}

export interface GameTemplateParams {
  title: string;
  genre: string;
  systems: string[];
  stageCount?: number;
  currencyName?: string;
  summary?: string;
  simulatorSpec?: SimulatorSceneSpec;
  tycoonThemeKey?: string;
  obbyThemeKey?: string;
  memeSubTheme?: MemeSubTheme;
  heroAssets?: HeroAssetResult[];
  platformTextureUrls?: string[];
  /** Session #073: unique per-generation job ID so the same prompt produces different layouts */
  jobId?: string;
  /** Session #073b: rbxassetid:// URLs for meme NPC billboard images */
  npcImageUrls?: string[];
  /** Session #149: brainrot_sim Steal-a-Brainrot conveyor mode */
  gameKind?: 'brainrot_sim' | 'obby_troll' | string;
  brainrotPool?: BrainrotPoolEntry[];
  rarityTiers?: 3 | 5 | 7;
  baseCpsScale?: 'low' | 'balanced' | 'whale';
  stealingEnabled?: boolean;
  basePlotCount?: number;
  /** Session #175: obby_troll Trap Maker — invisible kills, fake checkpoints, decoys */
  trolls?: TrollObbyTrap[];
  /** Session #255: focused trap preference from interview chips, e.g. "Невидимые шипы".
   * When set, synthetic/fallback trap slots use only these types instead of
   * reintroducing the full 6-trap mixed pool. */
  trollTrapFocus?: TrollObbyTrap['type'][];
  savagery?: 'lite' | 'medium' | 'savage';
  totalLevels?: number;
  checkpointEvery?: number;
  signatureGotchaText?: string;
  /** Session #185: playable genre expansion */
  simulatorKind?: 'pet' | 'mining' | 'fighting' | 'muscle' | 'clicker' | string;
  themeKey?: string;
  playerClass?: 'warrior' | 'mage' | 'archer' | string;
  questCount?: number;
  enemyFamily?: string;
  bossName?: string;
  lootTheme?: string;
  settingKey?: string;
  monsterName?: string;
  keyCount?: number;
  doorCount?: number;
  scareIntensity?: 'soft' | 'medium' | 'intense' | string;
  arenaTheme?: string;
  mode?: 'ffa' | 'teams' | string;
  weaponSet?: 'sword_bow' | 'sword_blaster' | 'magic' | string;
  roundSeconds?: number;
  spawnCount?: number;
  zoneTheme?: string;
  rebirthPace?: 'slow' | 'balanced' | 'fast' | string;
  /** Session 399: tower_defense — wave-based deterministic builder */
  waveCount?: number;
  towerSlots?: number;
  mapTheme?: string;
  startingCash?: number;
  baseHealth?: number;
  difficulty?: 'casual' | 'normal' | 'hard' | string;
  /** Session 399 (cont.): remaining playable genres reuse mapTheme/difficulty/
   * startingCash/baseHealth and add these per-genre counts. */
  jobCount?: number;       // roleplay_town
  lapCount?: number;       // racing
  chapterCount?: number;   // story_game
  roundCount?: number;     // minigame_hub / fighting
  dayLength?: number;      // survival
  roundTime?: number;      // fighting
  hasObbyShop?: boolean;
  obbyDescription?: string;
  /** Master Plan Phase 0+A (session 219): live Roblox catalog items welded
   * into the generated map as `rbxthumb://` BillboardGui showcase. Server
   * fetches from `fetchTrendingShowcaseItems` once per job; each genre
   * builder calls `buildTrendingShowcaseLua(items, opts)` and embeds the
   * result. `null`/empty silently skips the showcase. */
  trendingItems?: TrendingShowcaseItem[];
  /** Phase D (session 225): live Roblox Decal IDs per brainrot sub-theme,
   * fetched at /api/content/generate via `fetchCatalogByKeyword`. Replaces
   * the 18 hardcoded IDs in `DEFAULT_BRAINROT_POOL` for `brainrot_sim` jobs.
   * Map shape: `{ skibidi: [id1, id2, ...], tralalero: [...], ... }`.
   * Empty/missing → fillDecalAssetIdsFromDefaults uses hardcoded fallback.
   * Generated game's brainrot pool stays meme-fresh forever без redeploy. */
  brainrotLiveDecalsBySubTheme?: Record<string, number[]>;
  /** Phase G (session 230): LLM-generated visual spec from user brief.
   * When present, overrides palette/atmosphere/decoration in buildObbyScript
   * instead of using OBBY_THEMES[obbyThemeKey]. liveDecalsByTerm is hydrated
   * via Apify keyword-search for live on-theme decoration decals.
   * `null`/missing → fall back to OBBY_THEMES regex flow (no regression). */
  obbyVisualSpec?: ObbyVisualSpecLike;
  /** Phase G v2 (session 233): Roblox Decal `rbxassetid://` URLs for AI-generated
   * obby decoration prop images. One per `obbyVisualSpec.decorationConcepts[i]`.
   * Length should match decorationConcepts.length when both are present. Placed
   * in-world as SurfaceGui ImageLabel on 8×8×0.5 prop-blocks. Empty/missing →
   * decoration stations fall back to BillboardGui rbxthumb live-decal stickers
   * from `obbyVisualSpec.liveDecalsByTerm` (variant A). */
  obbyDecorationPropImageUrls?: string[];
  /** Session 414: deterministic per-preset recognizability spec derived from the
   * user's brief (palette + themed building names/signs + themed jobs + flavor +
   * hero-prop keyword). When present, runtime builders use it INSTEAD of the
   * ~4-enum `mapTheme` collapse so every preset looks like its theme. `null`/
   * missing → builders fall back to their existing enum behaviour (no regression). */
  gameVisualSpec?: GameVisualSpec;
}

/** Phase G (session 230): structural copy of ObbyVisualSpec used by buildObbyScript.
 * Defined here (not imported from obbyVisualSpec.ts) so gameTemplates.ts has no
 * runtime dep on the spec module — only the type. */
export interface ObbyVisualSpecLike {
  themeName: string;
  layoutStyle?: ObbyLayoutStyle;
  palette: {
    platform: [number, number, number];
    checkpoint: [number, number, number];
    kill: [number, number, number];
    win: [number, number, number];
    accent1: [number, number, number];
    accent2: [number, number, number];
    decoration: [number, number, number];
  };
  materials: {
    platform: string;
    checkpoint: string;
    kill: string;
    decoration: string;
  };
  atmosphere: {
    clockTime: number;
    brightness: number;
    fogEnd: number;
    fogColor: [number, number, number];
    ambient: [number, number, number];
    outdoorAmbient: [number, number, number];
  };
  decorationConcepts: string[];
  decalSearchTerms: string[];
  liveDecalsByTerm?: Record<string, number[]>;
}

type ObbyLayoutStyle = 'corridor' | 'zigzag' | 'islands' | 'tower' | 'loop' | 'gauntlet';

const OBBY_LAYOUT_STYLES = new Set<ObbyLayoutStyle>([
  'corridor',
  'zigzag',
  'islands',
  'tower',
  'loop',
  'gauntlet',
]);

export interface TrollObbyTrap {
  level: number;
  type: 'invisible_kill' | 'fake_checkpoint' | 'disappear' | 'launcher' | 'decoy' | 'reverse';
  intensity?: 'soft' | 'medium' | 'hard';
}

export interface MultiScriptResult {
  serverScript: string;
  additionalScripts: Array<{
    name: string;
    scriptType: 'Script' | 'LocalScript' | 'ModuleScript';
    container: string;
    source: string;
  }>;
}

// Session #19: deterministic per-prompt seed so every unique prompt produces
// a different obby layout (levels count / platform size / spacing / obstacle
// sequence / collectible density) while still being reproducible for the same
// prompt. Hash derived from title+summary so the same prompt in a retry keeps
// the same shape, but two different prompts always differ.
function hashStringToInt(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h | 0) || 1;
}

function makeSeededRng(seed: number): () => number {
  let state = seed | 0 || 1;
  return () => {
    state = Math.imul(state, 1664525) + 1013904223;
    state = state | 0;
    return ((state >>> 0) % 100000) / 100000;
  };
}

function isObbyLayoutStyle(value: unknown): value is ObbyLayoutStyle {
  return typeof value === 'string' && OBBY_LAYOUT_STYLES.has(value as ObbyLayoutStyle);
}

function detectObbyLayoutStyle(intentText: string, seed: number): ObbyLayoutStyle {
  const text = (intentText || '').toLowerCase();
  const rejectsCorridor = /\b(no|not|without)\s+(a\s+)?(corridor|hallway)\b|не\s+коридор|без\s+коридор/i.test(text);
  if (!rejectsCorridor && /\b(hospital|school|classroom|hallway|corridor|clinic|lab|laboratory|factory hallway|больниц|школ|класс|коридор|лаборатор)\b/.test(text)) return 'corridor';
  if (/\b(tower|vertical|climb|treehouse|mountain|shaft|elevator|башн|вертикал|гора|шахт|лифт)\b/.test(text)) return 'tower';
  if (/\b(forest|woods|swamp|floating|island|space|asteroid|cave|dream|лес|болот|остров|космос|пещер|сон)\b/.test(text)) return 'islands';
  if (/\b(arena|circle|circular|ring|ritual|boss|circus ring|цирк|арен|круг|ритуал|босс)\b/.test(text)) return 'loop';
  if (/\b(trap|speedrun|gauntlet|lava|conveyor|factory|troll|chase|slime|goo|ooze|monster|ловуш|лава|конвейер|фабрик|завод|тролл|погон|слиз|монстр)\b/.test(text)) return 'gauntlet';
  return (seed % 2 === 0) ? 'zigzag' : 'islands';
}

function brightenRgb(color: [number, number, number], minimum: number): [number, number, number] {
  return [
    Math.max(color[0], minimum),
    Math.max(color[1], minimum),
    Math.max(color[2], minimum),
  ];
}

function buildObbyScript(params: GameTemplateParams): MultiScriptResult {
  // Derive a deterministic seed from the prompt. Used both at TS build time
  // (variable levels count / platform size / spacing) and injected into Lua
  // runtime via math.randomseed so pickType / math.random use predictable but
  // prompt-unique streams.
  // Session #073: include jobId so each generation request produces a unique layout.
  // Previously same prompt → same seed → same obby every time.
  const seedSource = `${params.title || ''}|${params.summary || ''}|${params.obbyThemeKey || ''}|${params.memeSubTheme || ''}|${params.jobId || ''}|${Date.now()}`;
  const jobSeed = hashStringToInt(seedSource);
  const rng = makeSeededRng(jobSeed);
  // Variable levels count: 10..15 (biased up for meme/brainrot). Build-time so
  // obbyJson/Lua constants stay in sync.
  const baseLevels = 10 + Math.floor(rng() * 6); // 10..15
  const levels = Math.min(Math.max(params.stageCount || baseLevels, 10), 15);
  // Session #20: sanitize raw iOS prompt leaking into BillboardGui label.
  // ChatStore.swift sends the literal string "Generate a game package brief
  // for <title>. Genre: ... Scale: ... Style: ... Monetization: ..." — we
  // strip the boilerplate prefix, cut everything after the first structured
  // field, trim, and cap at 40 chars so the spawn platform shows just the
  // meaningful title ("Skibidi обби") instead of the full AI prompt.
  const sanitizeDisplayTitle = (raw: string | undefined, fallback: string): string => {
    if (!raw) return fallback;
    const serviceMarkers = /Existing project context|authoritative baseline|Requested change|Latest user intent|Generate a complete new Roblox package version/i;
    if (serviceMarkers.test(raw)) {
      const marker = /(requested\s+change|latest\s+user\s+intent)\s*(?:\([^)]*\))?\s*:/gi;
      let lastMarkerEnd = -1;
      let match: RegExpExecArray | null;
      while ((match = marker.exec(raw)) !== null) {
        lastMarkerEnd = match.index + match[0].length;
      }
      if (lastMarkerEnd >= 0) {
        raw = raw.slice(lastMarkerEnd).replace(/Generate a complete new Roblox package version[\s\S]*$/i, '').trim();
      }
    }
    let s = raw
      // Broad catch: "Generate a game package [brief] [for] <title>"
      // Handles all iOS variants: with/without "brief", with/without "for"
      .replace(/^generate\s+a\s+game\s+package\s*(brief\s*)?(for\s+)?/gi, '')
      // Even broader: any "generate/create/make/build ... for <title>" prefix
      .replace(/^(please\s+)?(generate|create|make|build)\b[^.]*?\bfor\s+/gi, '')
      // Cut boilerplate structured fields tail: ". Genre: ..." / ". Scale: ..."
      .replace(/\.\s*(genre|scale|style|monetization|theme|gameplay)\s*:.*$/is, '')
      .replace(/^["'“”`]+|["'“”`]+$/g, '')
      .trim();
    if (s.length > 40) s = s.slice(0, 40).trim();
    return s && !serviceMarkers.test(s) ? s : fallback;
  };
  const theme = sanitizeDisplayTitle(params.title, 'Obby');
  const obbyIntentText = `${params.title || ''} ${params.genre || ''} ${params.summary || ''} ${(params.systems || []).join(' ')}`.toLowerCase();
  // Resolve visual theme from OBBY_THEMES (colors/materials/lighting) so every
  // generated obby looks distinct and matches user prompt. Falls back to 'default'.
  const themeKey = params.obbyThemeKey && OBBY_THEMES[params.obbyThemeKey] ? params.obbyThemeKey : 'default';
  // Phase G (session 230): if visualSpec was generated by LLM from the user's
  // brief, override palette/materials/atmosphere on top of the chosen baseline
  // theme. Technical fields (atmoD, bloomI, etc.) are kept from the baseline
  // because LLM doesn't generate them. decorationConcepts / liveDecalsByTerm
  // are read from spec further below.
  const visualSpec = params.obbyVisualSpec;
  // Diagnostic: log whether spec is applied. Lets us verify in Cloud Logs
  // that Phase G v1+v2 actually drives obby palette per generation.
  if (visualSpec) {
    // eslint-disable-next-line no-console
    console.info('[ObbyVisualSpec] palette applied to obby Lua', {
      themeName: visualSpec.themeName,
      layoutStyle: visualSpec.layoutStyle ?? 'missing',
      baselineThemeKey: themeKey,
      platformRgb: visualSpec.palette.platform,
      brightness: visualSpec.atmosphere.brightness,
      fogEnd: visualSpec.atmosphere.fogEnd,
      decorationConcepts: visualSpec.decorationConcepts.length,
      liveDecalTerms: Object.keys(visualSpec.liveDecalsByTerm ?? {}).length,
    });
  } else {
    // eslint-disable-next-line no-console
    console.info('[ObbyVisualSpec] no spec — falling back to OBBY_THEMES baseline', {
      themeKey,
    });
  }
  let themeData: ObbyTheme = visualSpec
    ? {
        ...OBBY_THEMES[themeKey],
        name: visualSpec.themeName,
        platform: visualSpec.palette.platform,
        platformMat: visualSpec.materials.platform,
        checkpoint: visualSpec.palette.checkpoint,
        checkpointMat: visualSpec.materials.checkpoint,
        kill: visualSpec.palette.kill,
        killMat: visualSpec.materials.kill,
        accent1: visualSpec.palette.accent1,
        accent2: visualSpec.palette.accent2,
        decoration: visualSpec.palette.decoration,
        decorationMat: visualSpec.materials.decoration,
        win: visualSpec.palette.win,
        clockTime: visualSpec.atmosphere.clockTime,
        ambient: visualSpec.atmosphere.ambient,
        brightness: visualSpec.atmosphere.brightness,
        fogEnd: visualSpec.atmosphere.fogEnd,
        fogColor: visualSpec.atmosphere.fogColor,
        outdoorAmbient: visualSpec.atmosphere.outdoorAmbient,
      }
    : OBBY_THEMES[themeKey];
  const isHospitalHorror = themeKey === 'hospital_horror';
  const isSchoolHorror = themeKey === 'school_horror';
  const isLabHorror = themeKey === 'lab_horror';
  const isSlimeHorror = themeKey === 'slime_horror';
  const hasDeterministicEnvironmentKit = isHospitalHorror || isSchoolHorror || isLabHorror || isSlimeHorror;
  // Slime chase is a deterministic gameplay/readability kit. Do not let a
  // hallucinated visualSpec palette rename it back into lab/containment.
  if (isSlimeHorror) {
    themeData = { ...OBBY_THEMES.slime_horror };
  }
  const specLayoutStyle = isObbyLayoutStyle(visualSpec?.layoutStyle) ? visualSpec.layoutStyle : null;
  const fallbackLayoutStyle = detectObbyLayoutStyle(obbyIntentText, jobSeed);
  const layoutStyle: ObbyLayoutStyle = (isHospitalHorror || isSchoolHorror)
    ? 'corridor'
    : isSlimeHorror
      ? 'gauntlet'
    : specLayoutStyle ?? fallbackLayoutStyle;
  const avgPlatformLight = (themeData.platform[0] + themeData.platform[1] + themeData.platform[2]) / 3;
  const wantsReadableDark = avgPlatformLight < 0.42 || /(horror|scary|dark|zombie|ghost|haunted|creepy|nightmare|abandoned|ужас|страш|тёмн|темн|призрак)/i.test(obbyIntentText);
  if (wantsReadableDark) {
    themeData = {
      ...themeData,
      brightness: Math.max(themeData.brightness, 1.65),
      fogEnd: Math.max(themeData.fogEnd, 420),
      ambient: brightenRgb(themeData.ambient, 0.14),
      outdoorAmbient: brightenRgb(themeData.outdoorAmbient, 0.16),
      atmoD: Math.min(themeData.atmoD, 0.38),
      atmoHaze: Math.min(themeData.atmoHaze, 1.45),
      bloomI: Math.max(themeData.bloomI, 0.28),
      ccB: Math.max(themeData.ccB, -0.005),
    };
  }
  // eslint-disable-next-line no-console
  console.info('[ObbyLayout] resolved', {
    layoutStyle,
    specLayoutStyle,
    fallbackLayoutStyle,
    wantsReadableDark,
    jobSeed,
  });
  const forbidsDecorativeNpcs = /\bno\s+npcs?\b|\bno\s+characters?\b|\bwithout\s+npcs?\b|\bwithout\s+characters?\b|без\s+npc|без\s+нпс|без\s+персонаж/i.test(obbyIntentText);
  const wantsCharacters = /\b(npc|monster|ghost|spirit|zombie|enemy|teacher|student|principal|pet|character|mascot)\b|призрак|дух|зомби|монстр|враг|учител|ученик|директор|персонаж|питом/i.test(obbyIntentText);
  const wantsMonsterLab = isLabHorror && /\b(monsters?|creatures?|beasts?|mutants?|abominations?|specimens?|experiments?)\b|монстр|чудовищ|твар|мутант|эксперимент|образец/i.test(obbyIntentText);
  const allowsSchoolAmbientNpc = isSchoolHorror && /\b(haunted|horror|ghost|spirit|school|classroom|teacher|student|principal|npc|monster|character)\b|школ|класс|призрак|дух|учител|ученик|директор|нпс|персонаж/i.test(obbyIntentText);
  const decorativeNpcsEnabled = !forbidsDecorativeNpcs && (themeKey === 'meme' || wantsCharacters || allowsSchoolAmbientNpc);
  const collectiblesEnabled = themeKey === 'meme' || /\b(collect|coin|coins|currency|souls|points|economy|shop|buy|cosmetic)\b|монет|валют|душ|магазин|покуп|косметик|собирать/i.test(obbyIntentText);
  const memeBillboardsEnabled = themeKey === 'meme';
  const trollPlatformEnabled = /troll|gotcha|fake\s+platform|prank|trap\s+maker|обман|тролл|фейк/i.test(obbyIntentText);
  const rgb = (c: [number, number, number]) => `Color3.fromRGB(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)})`;
  // Build a 10-color palette by mixing platform + accent1 + accent2 + decoration + win.
  // randomBright() in the Lua code below will pick from this palette.
  const themePalette: [number, number, number][] = isHospitalHorror
    ? [
        themeData.platform,
        themeData.decoration,
        [0.74, 0.78, 0.74],
        [0.50, 0.62, 0.60],
        [0.25, 0.46, 0.50],
        [0.72, 0.12, 0.12],
        [0.86, 0.90, 0.86],
        [0.34, 0.38, 0.36],
        [0.44, 0.72, 0.76],
        [0.58, 0.16, 0.16],
      ]
    : isSchoolHorror
      ? [
          themeData.platform,
          themeData.decoration,
          [0.12, 0.18, 0.16],
          [0.20, 0.36, 0.28],
          [0.72, 0.66, 0.48],
          [0.78, 0.20, 0.18],
          [0.86, 0.82, 0.68],
          [0.16, 0.20, 0.28],
          [0.40, 0.78, 0.65],
          [0.90, 0.86, 0.62],
        ]
      : isLabHorror
        ? [
            themeData.platform,
            themeData.decoration,
            [0.07, 0.10, 0.11],
            [0.18, 0.24, 0.24],
            [0.42, 0.52, 0.50],
            [0.82, 0.62, 0.18],
            [0.78, 0.86, 0.78],
            [0.08, 0.10, 0.12],
            [0.28, 0.68, 0.76],
            [0.75, 0.12, 0.10],
          ]
        : isSlimeHorror
          ? [
              themeData.platform,
              themeData.decoration,
              [0.05, 0.16, 0.08],
              [0.10, 0.42, 0.12],
              [0.18, 0.90, 0.28],
              [0.34, 1.00, 0.46],
              [0.68, 1.00, 0.52],
              [0.08, 0.10, 0.08],
              [0.84, 1.00, 0.32],
              [0.36, 0.78, 0.18],
            ]
    : [
        themeData.platform,
        themeData.accent1,
        themeData.accent2,
        themeData.decoration,
        themeData.checkpoint,
        themeData.win,
        [(themeData.platform[0] + themeData.accent1[0]) / 2, (themeData.platform[1] + themeData.accent1[1]) / 2, (themeData.platform[2] + themeData.accent1[2]) / 2],
        [(themeData.platform[0] + themeData.accent2[0]) / 2, (themeData.platform[1] + themeData.accent2[1]) / 2, (themeData.platform[2] + themeData.accent2[2]) / 2],
        [Math.min(1, themeData.accent1[0] * 1.3), Math.min(1, themeData.accent1[1] * 1.3), Math.min(1, themeData.accent1[2] * 1.3)],
        [Math.min(1, themeData.accent2[0] * 1.3), Math.min(1, themeData.accent2[1] * 1.3), Math.min(1, themeData.accent2[2] * 1.3)],
      ];
  const themePaletteLua = themePalette.map((c) => `    ${rgb(c)},`).join('\n');
  // Session #073: Roblox can only load rbxassetid:// in ImageLabel.Image.
  // When platformTextureUrls is empty (no Roblox auth or upload failed), use
  // curated Roblox library texture IDs per theme so platforms are never bare.
  // Session #075: Fallback platform decoration — emoji + Material based (no rbxassetid dependency).
  // When AI-generated textures are available (rbxassetid://), use them via SurfaceGui ImageLabel.
  // Otherwise, apply themed Material + emoji SurfaceGui which always works without external assets.
  const FALLBACK_PLATFORM_EMOJIS: Record<string, string[]> = {
    meme:     ['🚽', '💀', '🗿', '😎', '🔥', '👁️', '🦈', '🐊'],
    hospital_horror: [],
    school_horror: [],
    lab_horror: [],
    slime_horror: [],
    candy:    ['🍭', '🍬', '🧁', '🍩', '🎂', '🍪'],
    horror:   ['💀', '👻', '🕷️', '🦇', '🔪', '🩸'],
    space:    ['🚀', '⭐', '🌙', '🪐', '👽', '🛸'],
    nature:   ['🌿', '🌸', '🍄', '🌳', '🦋', '🌺'],
    lava:     ['🔥', '🌋', '💎', '⚡', '☄️', '🏔️'],
    medieval: ['⚔️', '🛡️', '👑', '🏰', '🐉', '🗡️'],
    neon:     ['💜', '💙', '💚', '💛', '❤️', '⚡'],
    default:  ['⭐', '🔥', '💎', '🎮', '🏆', '✨'],
  };
  const FALLBACK_PLATFORM_MATERIALS: Record<string, string> = {
    meme:     'Neon',
    hospital_horror: 'Concrete',
    school_horror: 'Concrete',
    lab_horror: 'Metal',
    slime_horror: 'Slate',
    candy:    'SmoothPlastic',
    horror:   'Slate',
    space:    'ForceField',
    nature:   'Grass',
    lava:     'Neon',
    medieval: 'Cobblestone',
    neon:     'Neon',
    default:  'SmoothPlastic',
  };
  const hasAiTextures = params.platformTextureUrls && params.platformTextureUrls.length > 0;
  const textureUrls = hasAiTextures ? params.platformTextureUrls! : [];
  const textureTableLua = textureUrls.map((u) => `    "${u}",`).join('\n');
  const fallbackEmojis = hasDeterministicEnvironmentKit ? [] : (FALLBACK_PLATFORM_EMOJIS[themeKey] ?? FALLBACK_PLATFORM_EMOJIS.default);
  const fallbackEmojiTableLua = fallbackEmojis.map((e) => `    "${e}",`).join('\n');
  const fallbackMaterial = FALLBACK_PLATFORM_MATERIALS[themeKey] ?? FALLBACK_PLATFORM_MATERIALS.default;
  const luaString = (value: string): string => JSON.stringify(value.replace(/\s+/g, ' ').trim().slice(0, 260));
  const defaultObbyDescription = isSchoolHorror
    ? `${theme}: haunted school escape with classrooms, lockers, chalkboards, detention hallways, ghost NPCs, and checkpoints.`
    : isHospitalHorror
      ? `${theme}: hospital horror escape with ruined wards, toxic spills, flickering lights, and checkpoints.`
      : isLabHorror
        ? `${theme}: abandoned lab horror escape with broken equipment, flickering lights, ${wantsMonsterLab ? 'mutant specimen monsters, ' : ''}toxic chemical hazards, warning signs, and checkpoints.`
        : isSlimeHorror
          ? `${theme}: horror slime chase obby with glowing goo trails, clear route arrows, safe jumps, and a slime monster behind the player.`
        : `${theme}: obby generated from the latest user prompt.`;
  const obbyDescriptionLua = luaString(params.obbyDescription || defaultObbyDescription);
  const obbyTitleLua = luaString(theme);
  // Session #073b: NPC billboard images (rbxassetid:// URLs)
  const npcImageUrls = params.npcImageUrls ?? [];
  const npcImageTableLua = npcImageUrls.map((u) => `    "${u}",`).join('\n');
  const killColorLua = rgb(themeData.kill);
  const checkpointColorLua = rgb(themeData.checkpoint);
  const winColorLua = rgb(themeData.win);
  const routeGuideColorLua = isLabHorror
    ? 'Color3.fromRGB(90, 225, 235)'
    : isHospitalHorror
      ? 'Color3.fromRGB(130, 245, 185)'
      : isSchoolHorror
        ? 'Color3.fromRGB(130, 245, 205)'
        : 'Color3.fromRGB(120, 255, 80)';
  const routeGuideLabelColorLua = isLabHorror
    ? 'Color3.fromRGB(220, 255, 255)'
    : 'Color3.fromRGB(220, 255, 150)';
  const ambientLua = rgb(themeData.ambient);
  const outdoorAmbientLua = rgb(themeData.outdoorAmbient);
  const fogColorLua = rgb(themeData.fogColor);
  const atmoColorLua = rgb(themeData.atmoColor);
  const atmoDecayLua = rgb(themeData.atmoDecay);
  const ccTintLua = rgb(themeData.ccTint);
  const platformMat = themeData.platformMat;
  const killMat = themeData.killMat;

  // ── UNIVERSAL THEME SYSTEM ──
  // Session #077: ALL themes now get NPCs, collectibles, interaction, and
  // leaderstats — not just meme. For meme themes, sub-theme selects the
  // meme-specific pack (skibidi/bombardir/etc). For non-meme themes,
  // themeSubKey == themeKey and picks the appropriate theme pack.
  const isMeme = themeKey === 'meme';
  const memeSubTheme: MemeSubTheme = params.memeSubTheme || 'generic';
  // themeSubKey: for meme → sub-theme (skibidi/bombardir/etc), for others → themeKey itself
  const themeSubKey = isMeme ? memeSubTheme : themeKey;
  // Troll platform fires only when the brief explicitly asks for troll/fake platforms.
  const trollLevel = trollPlatformEnabled
    ? Math.max(2, Math.min(levels - 1, Math.round(levels * 0.7)))
    : -1;
  const fallbackNpcModelsLua = isMeme
    ? [
        93516536089491,
        99845836208274,
        126544366375256,
        76780768588054,
        119466042681726,
        136397081175463,
        95723558089763,
        136932940830087,
        134402127064976,
        132231245850236,
      ].map((id) => `    ${id},`).join('\n')
    : '';

  // ── PART 1: Structured Obby JSON ──
  // Session #19: obbyJson is now driven by seeded rng so the same prompt yields
  // the same skeleton, and different prompts yield different skeletons. The
  // actual Lua builder also uses math.randomseed(jobSeed) so runtime picks
  // align with this build-time sequence.
  const OBSTACLE_TYPES = ['jump', 'kill_brick', 'moving_platform', 'spinner', 'disappearing', 'wallhop', 'tightrope', 'lava_run', 'climb'] as const;
  const levelDefs: { id: number; type: string; difficulty: number; length: number; height: number }[] = [];
  let lastType = '';
  for (let i = 1; i <= levels; i++) {
    let type: string;
    do {
      type = OBSTACLE_TYPES[Math.floor(rng() * OBSTACLE_TYPES.length)];
    } while (type === lastType);
    lastType = type;
    const difficulty = Math.min(5, Math.ceil(i / (levels / 5)));
    levelDefs.push({ id: i, type, difficulty, length: 30 + Math.floor(rng() * 50), height: Math.floor(rng() * 20) });
  }
  const obbyJson = JSON.stringify({ levels: levelDefs }, null, 2);

  // Session #19: vary platform footprint and level spacing per prompt. Range
  // chosen so small (~8×8) prompts feel tighter and large (~14×14) feel open.
  const platformSizeXZ = 8 + Math.floor(rng() * 7); // 8..14
  const levelOffsetZ = 50 + Math.floor(rng() * 25); // 50..74

  // Currency name per theme (used in leaderstats + collectible labels)
  const THEME_CURRENCY: Record<string, string> = {
    meme: 'Rizz', candy: 'Sweets', horror: 'Souls', space: 'Stars',
    nature: 'Seeds', lava: 'Embers', medieval: 'Gold', neon: 'Watts',
    hospital_horror: 'Supplies', school_horror: 'Notes', lab_horror: 'Samples', slime_horror: 'Goo',
    default: 'Coins',
  };
  const currencyName = THEME_CURRENCY[themeKey] ?? 'Coins';
  const hasObbyShop = params.hasObbyShop === true;
  const obbyShopLua = hasObbyShop ? `
-- ═══════════════════════════════════════════
-- OBBY SHOP: deterministic v1 add-on for iterative "add a shop" requests.
-- Uses the existing theme currency leaderstat and ProximityPrompt items.
-- ═══════════════════════════════════════════
local function getObbyCurrency(player)
    local stats = player:FindFirstChild("leaderstats")
    if not stats then return nil end
    return stats:FindFirstChild("${currencyName}")
end

local function chargeObbyCurrency(player, cost)
    local currency = getObbyCurrency(player)
    if not currency then
        updateHud(player, "Collect ${currencyName} first", "")
        return false
    end
    if currency.Value < cost then
        updateHud(player, "Need " .. tostring(cost - currency.Value) .. " more ${currencyName}", "")
        return false
    end
    currency.Value -= cost
    return true
end

local function teleportPlayerToCheckpoint(player, checkpointNum)
    local character = player.Character
    local rootPart = character and character:FindFirstChild("HumanoidRootPart")
    if not rootPart then return false end
    for _, cp in checkpoints do
        if cp.num == checkpointNum then
            rootPart.CFrame = cp.part.CFrame + Vector3.new(0, 5, 0)
            return true
        end
    end
    return false
end

local function createObbyShopItem(name, position, color, actionText, objectText, cost, onPurchase)
    local pad = makePart({
        name = "ObbyShop_" .. name,
        size = Vector3.new(5, 0.8, 5),
        position = position,
        color = color,
        material = Enum.Material.Neon,
        neon = true,
        label = objectText .. "\\n" .. tostring(cost) .. " ${currencyName}",
        labelOffset = 5,
        labelColor = Color3.fromRGB(255, 255, 255),
        noSparkles = true,
    })
    local prompt = Instance.new("ProximityPrompt")
    prompt.Name = "ObbyShopPrompt_" .. name
    prompt.ActionText = actionText .. " (" .. tostring(cost) .. " ${currencyName})"
    prompt.ObjectText = objectText
    prompt.HoldDuration = 0.35
    prompt.MaxActivationDistance = 12
    prompt.RequiresLineOfSight = false
    prompt.Parent = pad
    prompt.Triggered:Connect(function(player)
        if not chargeObbyCurrency(player, cost) then return end
        onPurchase(player)
    end)
    return pad
end

local function buildObbyShop()
    local shopBase = makePart({
        name = "ObbyShop",
        size = Vector3.new(28, 1, 18),
        position = Vector3.new(26, 20.15, 0),
        color = Color3.fromRGB(35, 35, 55),
        material = Enum.Material.SmoothPlastic,
        label = "Obby Shop",
        labelOffset = 8,
        labelColor = Color3.fromRGB(255, 255, 255),
        noSparkles = true,
    })
    shopBase.Transparency = 0.05

    makePart({
        name = "ObbyShop_Counter",
        size = Vector3.new(18, 3, 2),
        position = Vector3.new(26, 22, -7),
        color = Color3.fromRGB(255, 200, 80),
        material = Enum.Material.SmoothPlastic,
        label = "Spend ${currencyName}",
        labelOffset = 4,
        labelColor = Color3.fromRGB(35, 25, 10),
        noSparkles = true,
    })

    createObbyShopItem("SpeedBoost", Vector3.new(16, 21, 0), Color3.fromRGB(80, 220, 255), "Buy Speed", "Speed Boost", 20, function(player)
        local humanoid = player.Character and player.Character:FindFirstChildOfClass("Humanoid")
        if humanoid then
            humanoid.WalkSpeed = math.max(humanoid.WalkSpeed, 26)
            task.delay(45, function()
                if humanoid and humanoid.Parent then humanoid.WalkSpeed = 16 end
            end)
        end
        updateHud(player, "Speed Boost active", "45 sec")
    end)

    createObbyShopItem("JumpBoost", Vector3.new(26, 21, 0), Color3.fromRGB(120, 255, 120), "Buy Jump", "Jump Boost", 25, function(player)
        local humanoid = player.Character and player.Character:FindFirstChildOfClass("Humanoid")
        if humanoid then
            humanoid.UseJumpPower = true
            humanoid.JumpPower = math.max(humanoid.JumpPower, 78)
            task.delay(45, function()
                if humanoid and humanoid.Parent then humanoid.JumpPower = 50 end
            end)
        end
        updateHud(player, "Jump Boost active", "45 sec")
    end)

    createObbyShopItem("SkipStage", Vector3.new(36, 21, 0), Color3.fromRGB(255, 120, 210), "Skip", "Skip Stage", 40, function(player)
        local current = playerCheckpoints[player.UserId] or 0
        local target = math.min(current + 1, #checkpoints)
        if target > current then
            playerCheckpoints[player.UserId] = target
            playerStages[player.UserId] = math.min(TOTAL_LEVELS, target * CHECKPOINT_EVERY)
            teleportPlayerToCheckpoint(player, target)
            updateHud(player, "Skipped to checkpoint " .. tostring(target), "")
        else
            playerStages[player.UserId] = math.min(TOTAL_LEVELS, (playerStages[player.UserId] or 0) + 1)
            updateHud(player, "Stage helper applied", "")
        end
    end)

    createObbyShopItem("CheckpointHelper", Vector3.new(26, 21, 6), Color3.fromRGB(255, 230, 80), "Teleport", "Checkpoint Helper", 15, function(player)
        local current = playerCheckpoints[player.UserId] or 0
        if current > 0 and teleportPlayerToCheckpoint(player, current) then
            updateHud(player, "Returned to checkpoint " .. tostring(current), "")
        else
            updateHud(player, "No checkpoint unlocked yet", "")
        end
    end)
end
` : '';
  const obbyShopBuildCallLua = hasObbyShop ? '\nbuildObbyShop()\n' : '';

  // ── Universal NPC/collectible Lua injections (active for ALL themes) ──
  // Session #077: expanded from meme-only to universal. themeSubKey picks the
  // right THEME_PACK at runtime.
  const memeHelperLua = `
-- ═══════════════════════════════════════════
-- MEME: Platform stickers + per-level NPC props + collectibles + meme-text
-- + troll platform. All pools are selected once from MEME_PACKS at the top
-- so every platform call site picks from the SAME sub-theme pool.
-- Sub-theme (resolved at build time, not via runtime detection):
--   "${memeSubTheme}"
-- ═══════════════════════════════════════════

-- Ambient spin/bob helper shared by every NPC builder below. Takes a Model
-- with a valid PrimaryPart and loops a low-amplitude bob + slow yaw so the
-- scene always feels "alive" without being distracting.
local function _memeNpcIdle(model, primary)
    if not model or not primary then return end
    local baseCF = primary.CFrame
    local t0 = tick()
    task.spawn(function()
        while model.Parent do
            local dt = tick() - t0
            local bob = math.sin(dt * 1.5) * 0.35
            model:PivotTo(baseCF * CFrame.new(0, bob, 0) * CFrame.Angles(0, math.rad((dt * 25) % 360), 0))
            RunService.Heartbeat:Wait()
        end
    end)
end

-- Shared quick helper to create an anchored decorative Part under a Model.
-- NPCs must not collide (player walks through them on the platform).
local function _memeMakeDecor(parent, shape, color, size, offset, material)
    local p = Instance.new("Part")
    p.Shape = shape or Enum.PartType.Block
    p.Color = color
    p.Size = size
    p.Material = material or Enum.Material.SmoothPlastic
    p.Anchored = true
    p.CanCollide = false
    p.CastShadow = false
    p.Position = offset
    p.Parent = parent
    return p
end

-- Session #18: Fallback composite NPCs were too small (~2 studs) to read on
-- the platform. Weld everything to PrimaryPart and scale the whole model up
-- so the silhouette is at least visible even when the real 3D template fails
-- to load. 2.6× scale puts Skibidi bowl at ~5 studs width, head at ~4.7.
local MEME_NPC_FALLBACK_SCALE = 2.6
local function _memeFinalizeNpc(model, primary)
    if not model or not primary then return end
    -- Weld every decor part to the primary so ScaleTo propagates.
    for _, d in ipairs(model:GetDescendants()) do
        if d:IsA("BasePart") and d ~= primary then
            d.Anchored = false
            local w = Instance.new("WeldConstraint")
            w.Part0 = primary
            w.Part1 = d
            w.Parent = primary
        end
    end
    primary.Anchored = true
    pcall(function() model:ScaleTo(MEME_NPC_FALLBACK_SCALE) end)
end

-- ═══════════════════════════════════════════
-- NPC BUILDERS — compact theme-specific composite Models that sit on top of
-- safe platforms to signal the meme sub-theme at a glance.
-- Each function: (position: Vector3, idx: number) -> Model
-- ═══════════════════════════════════════════

local function buildSkibidiNpc(position, idx)
    local m = Instance.new("Model")
    m.Name = "SkibidiNpc_" .. idx
    -- Porcelain bowl (Cylinder sideways acts as a round bowl silhouette)
    local bowl = _memeMakeDecor(m, Enum.PartType.Cylinder, Color3.fromRGB(245, 245, 250), Vector3.new(1.6, 2.2, 2.2), position, Enum.Material.SmoothPlastic)
    bowl.Orientation = Vector3.new(0, 0, 90)
    m.PrimaryPart = bowl
    -- Seat ring as 8 small blocks around the bowl top
    for i = 1, 8 do
        local a = (i - 1) * (math.pi * 2 / 8)
        _memeMakeDecor(m, Enum.PartType.Block, Color3.fromRGB(235, 235, 240),
            Vector3.new(0.35, 0.2, 0.35),
            position + Vector3.new(math.cos(a) * 1.3, 1.0, math.sin(a) * 1.3),
            Enum.Material.SmoothPlastic)
    end
    -- Head (skin tone sphere) — the "guy in the toilet"
    local head = _memeMakeDecor(m, Enum.PartType.Ball, Color3.fromRGB(255, 215, 175),
        Vector3.new(1.8, 1.8, 1.8), position + Vector3.new(0, 1.9, 0), Enum.Material.SmoothPlastic)
    -- Cyan neon eyes
    _memeMakeDecor(m, Enum.PartType.Ball, Color3.fromRGB(80, 200, 255),
        Vector3.new(0.35, 0.35, 0.35), position + Vector3.new(0.35, 2.1, 0.75), Enum.Material.Neon)
    _memeMakeDecor(m, Enum.PartType.Ball, Color3.fromRGB(80, 200, 255),
        Vector3.new(0.35, 0.35, 0.35), position + Vector3.new(-0.35, 2.1, 0.75), Enum.Material.Neon)
    -- Open mouth (dark block)
    _memeMakeDecor(m, Enum.PartType.Block, Color3.fromRGB(30, 20, 20),
        Vector3.new(0.7, 0.35, 0.2), position + Vector3.new(0, 1.55, 0.85), Enum.Material.SmoothPlastic)
    m.Parent = container
    _memeFinalizeNpc(m, bowl)
    _memeNpcIdle(m, bowl) -- bob the whole welded model
    return m
end

local function buildBombardiroNpc(position, idx)
    local m = Instance.new("Model")
    m.Name = "BombardiroNpc_" .. idx
    local body = _memeMakeDecor(m, Enum.PartType.Block, Color3.fromRGB(85, 200, 90),
        Vector3.new(1.4, 1.2, 4.5), position, Enum.Material.Neon)
    m.PrimaryPart = body
    _memeMakeDecor(m, Enum.PartType.Cylinder, Color3.fromRGB(45, 140, 60),
        Vector3.new(1.6, 1.1, 1.1), position + Vector3.new(0, 0, -2.8), Enum.Material.Neon)
    _memeMakeDecor(m, Enum.PartType.Block, Color3.fromRGB(120, 120, 130),
        Vector3.new(3.8, 0.2, 1.6), position + Vector3.new(-2.5, 0, 0), Enum.Material.Metal)
    _memeMakeDecor(m, Enum.PartType.Block, Color3.fromRGB(120, 120, 130),
        Vector3.new(3.8, 0.2, 1.6), position + Vector3.new(2.5, 0, 0), Enum.Material.Metal)
    _memeMakeDecor(m, Enum.PartType.Block, Color3.fromRGB(45, 140, 60),
        Vector3.new(0.3, 1.2, 1.2), position + Vector3.new(0, 0.8, 2.2), Enum.Material.Neon)
    m.Parent = container
    _memeFinalizeNpc(m, body)
    _memeNpcIdle(m, body)
    return m
end

local function buildTralaleroNpc(position, idx)
    local m = Instance.new("Model")
    m.Name = "TralaleroNpc_" .. idx
    local body = _memeMakeDecor(m, Enum.PartType.Block, Color3.fromRGB(60, 120, 220),
        Vector3.new(4.2, 1.6, 1.6), position, Enum.Material.SmoothPlastic)
    m.PrimaryPart = body
    -- Dorsal fin
    _memeMakeDecor(m, Enum.PartType.Block, Color3.fromRGB(40, 90, 180),
        Vector3.new(0.5, 1.2, 0.9), position + Vector3.new(0, 1.2, 0), Enum.Material.SmoothPlastic)
    -- Left + right sneakers underneath
    _memeMakeDecor(m, Enum.PartType.Block, Color3.fromRGB(240, 240, 240),
        Vector3.new(1, 0.5, 1.6), position + Vector3.new(-1.1, -1.1, 0), Enum.Material.SmoothPlastic)
    _memeMakeDecor(m, Enum.PartType.Block, Color3.fromRGB(240, 240, 240),
        Vector3.new(1, 0.5, 1.6), position + Vector3.new(1.1, -1.1, 0), Enum.Material.SmoothPlastic)
    -- Eye
    _memeMakeDecor(m, Enum.PartType.Ball, Color3.fromRGB(255, 255, 255),
        Vector3.new(0.4, 0.4, 0.4), position + Vector3.new(1.8, 0.4, 0.6), Enum.Material.SmoothPlastic)
    m.Parent = container
    _memeFinalizeNpc(m, body)
    _memeNpcIdle(m, body)
    return m
end

local function buildSigmaNpc(position, idx)
    local m = Instance.new("Model")
    m.Name = "SigmaNpc_" .. idx
    local head = _memeMakeDecor(m, Enum.PartType.Ball, Color3.fromRGB(255, 210, 80),
        Vector3.new(2.5, 2.5, 2.5), position, Enum.Material.Neon)
    m.PrimaryPart = head
    -- Sunglasses (two black blocks)
    _memeMakeDecor(m, Enum.PartType.Block, Color3.fromRGB(20, 20, 20),
        Vector3.new(0.35, 0.55, 0.9), position + Vector3.new(0.5, 0.25, 1.1), Enum.Material.SmoothPlastic)
    _memeMakeDecor(m, Enum.PartType.Block, Color3.fromRGB(20, 20, 20),
        Vector3.new(0.35, 0.55, 0.9), position + Vector3.new(-0.5, 0.25, 1.1), Enum.Material.SmoothPlastic)
    -- Crown: cylinder base + 4 prongs
    _memeMakeDecor(m, Enum.PartType.Cylinder, Color3.fromRGB(255, 220, 60),
        Vector3.new(0.5, 2.2, 2.2), position + Vector3.new(0, 1.6, 0), Enum.Material.Metal)
    for i = 1, 4 do
        local a = (i - 1) * (math.pi * 2 / 4)
        _memeMakeDecor(m, Enum.PartType.Block, Color3.fromRGB(255, 220, 60),
            Vector3.new(0.25, 0.7, 0.25),
            position + Vector3.new(math.cos(a) * 0.9, 2.1, math.sin(a) * 0.9),
            Enum.Material.Metal)
    end
    m.Parent = container
    _memeFinalizeNpc(m, head)
    _memeNpcIdle(m, head)
    return m
end

-- Session #073: generic fallback now randomly picks one of the 4 themed
-- builders instead of showing a pink cube. Each call rotates through the pool.
local _genericBuilders = { buildSkibidiNpc, buildBombardiroNpc, buildTralaleroNpc, buildSigmaNpc }
local _genericIdx = 0
local function buildGenericMemeNpc(position, idx)
    _genericIdx = _genericIdx + 1
    local builder = _genericBuilders[((_genericIdx - 1) % #_genericBuilders) + 1]
    return builder(position, idx)
end

-- ═══════════════════════════════════════════
-- Session #077: UNIVERSAL NPC BUILDERS — one per non-meme theme
-- Each creates a composite Model from primitives sitting on platforms.
-- ═══════════════════════════════════════════

-- CANDY: cupcake (pink cylinder body + cherry ball on top + sprinkle dots)
local function buildCandyNpc(position, idx)
    local m = Instance.new("Model"); m.Name = "CandyNpc_" .. idx
    local body = _memeMakeDecor(m, Enum.PartType.Cylinder, Color3.fromRGB(255, 180, 200), Vector3.new(2, 2, 2), position, Enum.Material.SmoothPlastic)
    body.Orientation = Vector3.new(0, 0, 90); m.PrimaryPart = body
    -- Frosting top (white wider disc)
    _memeMakeDecor(m, Enum.PartType.Cylinder, Color3.fromRGB(255, 255, 245), Vector3.new(0.4, 2.4, 2.4), position + Vector3.new(0, 1.1, 0), Enum.Material.SmoothPlastic)
    -- Cherry on top
    _memeMakeDecor(m, Enum.PartType.Ball, Color3.fromRGB(220, 30, 50), Vector3.new(0.8, 0.8, 0.8), position + Vector3.new(0, 1.8, 0), Enum.Material.SmoothPlastic)
    -- Colorful sprinkles (small neon dots)
    for i = 1, 6 do
        local a = (i - 1) * (math.pi * 2 / 6)
        local colors = {Color3.fromRGB(255,100,100), Color3.fromRGB(100,255,100), Color3.fromRGB(100,100,255), Color3.fromRGB(255,255,100), Color3.fromRGB(255,100,255), Color3.fromRGB(100,255,255)}
        _memeMakeDecor(m, Enum.PartType.Ball, colors[i], Vector3.new(0.25, 0.25, 0.25), position + Vector3.new(math.cos(a)*0.8, 0.5 + math.random()*0.5, math.sin(a)*0.8), Enum.Material.Neon)
    end
    m.Parent = container; _memeFinalizeNpc(m, body); _memeNpcIdle(m, body); return m
end

-- HORROR: readable ghost silhouette, not a generic transparent bubble.
local function buildHorrorNpc(position, idx)
    local m = Instance.new("Model"); m.Name = "HorrorNpc_" .. idx
    local body = _memeMakeDecor(m, Enum.PartType.Block, Color3.fromRGB(205, 220, 220), Vector3.new(1.9, 2.5, 1.0), position, Enum.Material.SmoothPlastic)
    body.Transparency = 0.1
    m.PrimaryPart = body
    local head = _memeMakeDecor(m, Enum.PartType.Ball, Color3.fromRGB(225, 235, 235), Vector3.new(1.25, 1.25, 1.25), position + Vector3.new(0, 1.8, 0), Enum.Material.SmoothPlastic)
    head.Transparency = 0.06
    _memeMakeDecor(m, Enum.PartType.Ball, Color3.fromRGB(10, 10, 10), Vector3.new(0.24, 0.32, 0.12), position + Vector3.new(0.32, 1.92, 0.58), Enum.Material.SmoothPlastic)
    _memeMakeDecor(m, Enum.PartType.Ball, Color3.fromRGB(10, 10, 10), Vector3.new(0.24, 0.32, 0.12), position + Vector3.new(-0.32, 1.92, 0.58), Enum.Material.SmoothPlastic)
    _memeMakeDecor(m, Enum.PartType.Block, Color3.fromRGB(10, 10, 10), Vector3.new(0.48, 0.12, 0.08), position + Vector3.new(0, 1.5, 0.62), Enum.Material.SmoothPlastic)
    local leftArm = _memeMakeDecor(m, Enum.PartType.Block, Color3.fromRGB(195, 215, 215), Vector3.new(0.35, 1.5, 0.35), position + Vector3.new(-1.05, 0.15, 0), Enum.Material.SmoothPlastic)
    leftArm.Transparency = 0.16
    leftArm.Orientation = Vector3.new(0, 0, -16)
    local rightArm = _memeMakeDecor(m, Enum.PartType.Block, Color3.fromRGB(195, 215, 215), Vector3.new(0.35, 1.5, 0.35), position + Vector3.new(1.05, 0.15, 0), Enum.Material.SmoothPlastic)
    rightArm.Transparency = 0.16
    rightArm.Orientation = Vector3.new(0, 0, 16)
    local tail = _memeMakeDecor(m, Enum.PartType.Block, Color3.fromRGB(190, 205, 210), Vector3.new(1.1, 1.2, 0.55), position + Vector3.new(0, -1.65, 0), Enum.Material.SmoothPlastic)
    tail.Transparency = 0.22
    tail.Orientation = Vector3.new(0, 0, 8)
    local auraLight = Instance.new("PointLight")
    auraLight.Name = "HorrorNpcAuraLight"
    auraLight.Brightness = 1.1
    auraLight.Range = 10
    auraLight.Color = Color3.fromRGB(170, 255, 220)
    auraLight.Parent = body
    m.Parent = container; _memeFinalizeNpc(m, body); _memeNpcIdle(m, body); return m
end

-- SCHOOL HORROR: readable school ghost NPC, not the generic eye bubble.
-- Passive set dressing: a translucent student/teacher shape holding a book.
local function buildSchoolGhostNpc(position, idx)
    local m = Instance.new("Model"); m.Name = "SchoolGhostNpc_" .. idx
    local bodyColor = (idx % 2 == 0) and Color3.fromRGB(155, 235, 210) or Color3.fromRGB(180, 205, 255)
    local torso = _memeMakeDecor(m, Enum.PartType.Block, bodyColor, Vector3.new(1.8, 2.6, 1.0), position, Enum.Material.SmoothPlastic)
    torso.Transparency = 0.08
    m.PrimaryPart = torso
    local head = _memeMakeDecor(m, Enum.PartType.Ball, Color3.fromRGB(225, 245, 240), Vector3.new(1.35, 1.35, 1.35), position + Vector3.new(0, 1.95, 0), Enum.Material.SmoothPlastic)
    head.Transparency = 0.05
    _memeMakeDecor(m, Enum.PartType.Ball, Color3.fromRGB(15, 22, 28), Vector3.new(0.24, 0.32, 0.12), position + Vector3.new(0.28, 2.08, 0.62), Enum.Material.SmoothPlastic)
    _memeMakeDecor(m, Enum.PartType.Ball, Color3.fromRGB(15, 22, 28), Vector3.new(0.24, 0.32, 0.12), position + Vector3.new(-0.28, 2.08, 0.62), Enum.Material.SmoothPlastic)
    _memeMakeDecor(m, Enum.PartType.Block, Color3.fromRGB(35, 90, 70), Vector3.new(0.72, 0.08, 0.08), position + Vector3.new(0, 1.72, 0.68), Enum.Material.SmoothPlastic)
    local leftArm = _memeMakeDecor(m, Enum.PartType.Block, bodyColor, Vector3.new(0.35, 1.7, 0.35), position + Vector3.new(-1.08, 0.25, 0), Enum.Material.SmoothPlastic)
    leftArm.Transparency = 0.12
    leftArm.Orientation = Vector3.new(0, 0, -12)
    local rightArm = _memeMakeDecor(m, Enum.PartType.Block, bodyColor, Vector3.new(0.35, 1.7, 0.35), position + Vector3.new(1.08, 0.25, 0), Enum.Material.SmoothPlastic)
    rightArm.Transparency = 0.12
    rightArm.Orientation = Vector3.new(0, 0, 12)
    _memeMakeDecor(m, Enum.PartType.Block, Color3.fromRGB(210, 190, 120), Vector3.new(1.25, 0.16, 1.0), position + Vector3.new(0.72, 0.35, 0.7), Enum.Material.Wood)
    _memeMakeDecor(m, Enum.PartType.Block, Color3.fromRGB(45, 70, 62), Vector3.new(1.0, 1.15, 0.18), position + Vector3.new(0, 0.1, -0.7), Enum.Material.Fabric)
    local leftLeg = _memeMakeDecor(m, Enum.PartType.Block, Color3.fromRGB(68, 84, 92), Vector3.new(0.45, 1.15, 0.38), position + Vector3.new(-0.45, -1.82, 0), Enum.Material.SmoothPlastic)
    leftLeg.Transparency = 0.18
    local rightLeg = _memeMakeDecor(m, Enum.PartType.Block, Color3.fromRGB(68, 84, 92), Vector3.new(0.45, 1.15, 0.38), position + Vector3.new(0.45, -1.82, 0), Enum.Material.SmoothPlastic)
    rightLeg.Transparency = 0.18
    local auraLight = Instance.new("PointLight")
    auraLight.Name = "SchoolGhostAuraLight"
    auraLight.Brightness = 1.25
    auraLight.Range = 11
    auraLight.Color = Color3.fromRGB(125, 255, 205)
    auraLight.Parent = torso
    m.Parent = container; _memeFinalizeNpc(m, torso); _memeNpcIdle(m, torso); return m
end

-- LAB HORROR: readable escaped specimen / mutant silhouette for monster-lab prompts.
local function buildLabMonsterNpc(position, idx)
    local m = Instance.new("Model"); m.Name = "LabMonsterNpc_" .. idx
    local bodyColor = (idx % 2 == 0) and Color3.fromRGB(86, 116, 104) or Color3.fromRGB(92, 104, 118)
    local torso = _memeMakeDecor(m, Enum.PartType.Block, bodyColor, Vector3.new(2.1, 2.8, 1.15), position, Enum.Material.SmoothPlastic)
    torso.Transparency = 0.04
    m.PrimaryPart = torso
    local head = _memeMakeDecor(m, Enum.PartType.Ball, Color3.fromRGB(118, 145, 128), Vector3.new(1.55, 1.35, 1.35), position + Vector3.new(0, 2.05, 0), Enum.Material.SmoothPlastic)
    head.Transparency = 0.03
    _memeMakeDecor(m, Enum.PartType.Ball, Color3.fromRGB(255, 78, 54), Vector3.new(0.25, 0.32, 0.12), position + Vector3.new(0.34, 2.12, 0.65), Enum.Material.Neon)
    _memeMakeDecor(m, Enum.PartType.Ball, Color3.fromRGB(255, 78, 54), Vector3.new(0.25, 0.32, 0.12), position + Vector3.new(-0.34, 2.12, 0.65), Enum.Material.Neon)
    _memeMakeDecor(m, Enum.PartType.Block, Color3.fromRGB(24, 38, 34), Vector3.new(0.68, 0.14, 0.12), position + Vector3.new(0, 1.72, 0.72), Enum.Material.SmoothPlastic)
    local leftArm = _memeMakeDecor(m, Enum.PartType.Block, bodyColor, Vector3.new(0.42, 1.8, 0.38), position + Vector3.new(-1.18, 0.2, 0), Enum.Material.SmoothPlastic)
    leftArm.Orientation = Vector3.new(0, 0, -18)
    local rightArm = _memeMakeDecor(m, Enum.PartType.Block, bodyColor, Vector3.new(0.42, 1.8, 0.38), position + Vector3.new(1.18, 0.2, 0), Enum.Material.SmoothPlastic)
    rightArm.Orientation = Vector3.new(0, 0, 18)
    _memeMakeDecor(m, Enum.PartType.Block, Color3.fromRGB(210, 185, 75), Vector3.new(0.18, 0.9, 0.18), position + Vector3.new(-1.36, -0.9, 0.48), Enum.Material.Metal)
    _memeMakeDecor(m, Enum.PartType.Block, Color3.fromRGB(210, 185, 75), Vector3.new(0.18, 0.9, 0.18), position + Vector3.new(1.36, -0.9, 0.48), Enum.Material.Metal)
    _memeMakeDecor(m, Enum.PartType.Block, Color3.fromRGB(54, 70, 66), Vector3.new(0.52, 1.15, 0.42), position + Vector3.new(-0.48, -1.9, 0), Enum.Material.SmoothPlastic)
    _memeMakeDecor(m, Enum.PartType.Block, Color3.fromRGB(54, 70, 66), Vector3.new(0.52, 1.15, 0.42), position + Vector3.new(0.48, -1.9, 0), Enum.Material.SmoothPlastic)
    local auraLight = Instance.new("PointLight")
    auraLight.Name = "LabMonsterAuraLight"
    auraLight.Brightness = 1.1
    auraLight.Range = 11
    auraLight.Color = Color3.fromRGB(90, 225, 235)
    auraLight.Parent = torso
    m.Parent = container; _memeFinalizeNpc(m, torso); _memeNpcIdle(m, torso); return m
end

-- SPACE: robot (metal cylinder body + antenna + glowing eye visor)
local function buildSpaceNpc(position, idx)
    local m = Instance.new("Model"); m.Name = "SpaceNpc_" .. idx
    local body = _memeMakeDecor(m, Enum.PartType.Cylinder, Color3.fromRGB(140, 150, 170), Vector3.new(2.2, 1.8, 1.8), position, Enum.Material.Metal)
    body.Orientation = Vector3.new(0, 0, 90); m.PrimaryPart = body
    -- Head (smaller metal sphere)
    _memeMakeDecor(m, Enum.PartType.Ball, Color3.fromRGB(160, 170, 190), Vector3.new(1.6, 1.6, 1.6), position + Vector3.new(0, 1.6, 0), Enum.Material.Metal)
    -- Visor (neon cyan bar)
    _memeMakeDecor(m, Enum.PartType.Block, Color3.fromRGB(0, 200, 255), Vector3.new(1.2, 0.3, 0.2), position + Vector3.new(0, 1.7, 0.7), Enum.Material.Neon)
    -- Antenna
    _memeMakeDecor(m, Enum.PartType.Cylinder, Color3.fromRGB(180, 180, 180), Vector3.new(1.0, 0.15, 0.15), position + Vector3.new(0, 2.8, 0), Enum.Material.Metal)
    _memeMakeDecor(m, Enum.PartType.Ball, Color3.fromRGB(255, 50, 50), Vector3.new(0.3, 0.3, 0.3), position + Vector3.new(0, 3.3, 0), Enum.Material.Neon)
    -- Arms
    _memeMakeDecor(m, Enum.PartType.Block, Color3.fromRGB(120, 130, 150), Vector3.new(0.4, 1.2, 0.4), position + Vector3.new(1.2, 0, 0), Enum.Material.Metal)
    _memeMakeDecor(m, Enum.PartType.Block, Color3.fromRGB(120, 130, 150), Vector3.new(0.4, 1.2, 0.4), position + Vector3.new(-1.2, 0, 0), Enum.Material.Metal)
    m.Parent = container; _memeFinalizeNpc(m, body); _memeNpcIdle(m, body); return m
end

-- NATURE: mushroom (brown stem cylinder + red cap with white dots)
local function buildNatureNpc(position, idx)
    local m = Instance.new("Model"); m.Name = "NatureNpc_" .. idx
    local stem = _memeMakeDecor(m, Enum.PartType.Cylinder, Color3.fromRGB(200, 170, 120), Vector3.new(1.8, 1.0, 1.0), position, Enum.Material.Wood)
    stem.Orientation = Vector3.new(0, 0, 90); m.PrimaryPart = stem
    -- Red mushroom cap (flattened ball)
    _memeMakeDecor(m, Enum.PartType.Ball, Color3.fromRGB(220, 40, 40), Vector3.new(2.8, 1.4, 2.8), position + Vector3.new(0, 1.4, 0), Enum.Material.SmoothPlastic)
    -- White dots on cap
    for i = 1, 5 do
        local a = (i - 1) * (math.pi * 2 / 5)
        _memeMakeDecor(m, Enum.PartType.Ball, Color3.fromRGB(255, 255, 255), Vector3.new(0.4, 0.4, 0.4), position + Vector3.new(math.cos(a)*1.0, 1.8, math.sin(a)*1.0), Enum.Material.SmoothPlastic)
    end
    -- Small green leaf
    _memeMakeDecor(m, Enum.PartType.Block, Color3.fromRGB(80, 180, 60), Vector3.new(0.6, 0.15, 0.8), position + Vector3.new(0.6, 0.5, 0), Enum.Material.Grass)
    m.Parent = container; _memeFinalizeNpc(m, stem); _memeNpcIdle(m, stem); return m
end

-- LAVA: fire elemental (orange/red core + flame spikes)
local function buildLavaNpc(position, idx)
    local m = Instance.new("Model"); m.Name = "LavaNpc_" .. idx
    local core = _memeMakeDecor(m, Enum.PartType.Ball, Color3.fromRGB(255, 120, 20), Vector3.new(2.2, 2.2, 2.2), position, Enum.Material.Neon)
    m.PrimaryPart = core
    -- Glowing eyes
    _memeMakeDecor(m, Enum.PartType.Ball, Color3.fromRGB(255, 255, 50), Vector3.new(0.4, 0.4, 0.3), position + Vector3.new(0.4, 0.3, 0.9), Enum.Material.Neon)
    _memeMakeDecor(m, Enum.PartType.Ball, Color3.fromRGB(255, 255, 50), Vector3.new(0.4, 0.4, 0.3), position + Vector3.new(-0.4, 0.3, 0.9), Enum.Material.Neon)
    -- Flame spikes (upward cones as blocks rotated)
    for i = 1, 5 do
        local a = (i - 1) * (math.pi * 2 / 5)
        local h = 1.0 + math.random() * 0.8
        _memeMakeDecor(m, Enum.PartType.Block, Color3.fromRGB(255, math.random(60, 160), 0), Vector3.new(0.4, h, 0.4), position + Vector3.new(math.cos(a)*0.8, 1.2 + h/2, math.sin(a)*0.8), Enum.Material.Neon)
    end
    m.Parent = container; _memeFinalizeNpc(m, core); _memeNpcIdle(m, core); return m
end

-- MEDIEVAL: knight (grey armor body + helmet + sword)
local function buildMedievalNpc(position, idx)
    local m = Instance.new("Model"); m.Name = "MedievalNpc_" .. idx
    -- Body (armor)
    local body = _memeMakeDecor(m, Enum.PartType.Block, Color3.fromRGB(140, 140, 150), Vector3.new(1.6, 2.2, 1.0), position, Enum.Material.Metal)
    m.PrimaryPart = body
    -- Helmet (sphere with visor)
    _memeMakeDecor(m, Enum.PartType.Ball, Color3.fromRGB(160, 160, 170), Vector3.new(1.4, 1.4, 1.4), position + Vector3.new(0, 1.6, 0), Enum.Material.Metal)
    -- Visor slit (dark bar)
    _memeMakeDecor(m, Enum.PartType.Block, Color3.fromRGB(20, 20, 20), Vector3.new(0.8, 0.15, 0.15), position + Vector3.new(0, 1.6, 0.65), Enum.Material.SmoothPlastic)
    -- Sword (grey blade + yellow handle)
    _memeMakeDecor(m, Enum.PartType.Block, Color3.fromRGB(180, 180, 190), Vector3.new(0.15, 2.5, 0.4), position + Vector3.new(1.2, 0.5, 0), Enum.Material.Metal)
    _memeMakeDecor(m, Enum.PartType.Block, Color3.fromRGB(160, 120, 40), Vector3.new(0.2, 0.6, 0.6), position + Vector3.new(1.2, -0.8, 0), Enum.Material.Wood)
    -- Shield on left arm
    _memeMakeDecor(m, Enum.PartType.Block, Color3.fromRGB(120, 60, 30), Vector3.new(0.2, 1.4, 1.0), position + Vector3.new(-1.0, 0, 0.2), Enum.Material.Wood)
    m.Parent = container; _memeFinalizeNpc(m, body); _memeNpcIdle(m, body); return m
end

-- NEON: hologram cube (translucent rotating cube with glowing edges)
local function buildNeonNpc(position, idx)
    local m = Instance.new("Model"); m.Name = "NeonNpc_" .. idx
    local core = _memeMakeDecor(m, Enum.PartType.Block, Color3.fromRGB(0, 200, 255), Vector3.new(2, 2, 2), position, Enum.Material.Neon)
    m.PrimaryPart = core
    -- Inner glow sphere
    _memeMakeDecor(m, Enum.PartType.Ball, Color3.fromRGB(255, 0, 200), Vector3.new(1.2, 1.2, 1.2), position, Enum.Material.Neon)
    -- Edge highlight bars
    local edgeColor = Color3.fromRGB(0, 255, 150)
    _memeMakeDecor(m, Enum.PartType.Block, edgeColor, Vector3.new(2.2, 0.1, 0.1), position + Vector3.new(0, 1.05, 1.05), Enum.Material.Neon)
    _memeMakeDecor(m, Enum.PartType.Block, edgeColor, Vector3.new(2.2, 0.1, 0.1), position + Vector3.new(0, -1.05, 1.05), Enum.Material.Neon)
    _memeMakeDecor(m, Enum.PartType.Block, edgeColor, Vector3.new(0.1, 2.2, 0.1), position + Vector3.new(1.05, 0, 1.05), Enum.Material.Neon)
    _memeMakeDecor(m, Enum.PartType.Block, edgeColor, Vector3.new(0.1, 2.2, 0.1), position + Vector3.new(-1.05, 0, 1.05), Enum.Material.Neon)
    m.Parent = container; _memeFinalizeNpc(m, core); _memeNpcIdle(m, core); return m
end

-- DEFAULT: star trophy (gold star shape from blocks)
local function buildDefaultNpc(position, idx)
    local m = Instance.new("Model"); m.Name = "DefaultNpc_" .. idx
    local body = _memeMakeDecor(m, Enum.PartType.Ball, Color3.fromRGB(255, 215, 0), Vector3.new(2.2, 2.2, 2.2), position, Enum.Material.Metal)
    m.PrimaryPart = body
    -- Star points (5 gold blocks radiating outward)
    for i = 1, 5 do
        local a = (i - 1) * (math.pi * 2 / 5) - math.pi / 2
        _memeMakeDecor(m, Enum.PartType.Block, Color3.fromRGB(255, 220, 50), Vector3.new(0.5, 0.5, 1.4), position + Vector3.new(math.cos(a)*1.5, math.sin(a)*1.5, 0), Enum.Material.Metal)
    end
    -- Face: eyes + smile
    _memeMakeDecor(m, Enum.PartType.Ball, Color3.fromRGB(20, 20, 20), Vector3.new(0.3, 0.3, 0.2), position + Vector3.new(0.35, 0.2, 1.0), Enum.Material.SmoothPlastic)
    _memeMakeDecor(m, Enum.PartType.Ball, Color3.fromRGB(20, 20, 20), Vector3.new(0.3, 0.3, 0.2), position + Vector3.new(-0.35, 0.2, 1.0), Enum.Material.SmoothPlastic)
    m.Parent = container; _memeFinalizeNpc(m, body); _memeNpcIdle(m, body); return m
end

-- ═══════════════════════════════════════════
-- MEME_PACKS — per-sub-theme data pack. Selected once by the hard-coded
-- memeSubTheme template string below; the rest of the script reads MEME_PACK
-- without caring which variant it is.
-- ═══════════════════════════════════════════
local MEME_PACKS = {
    skibidi = {
        stickers = {
            { emoji = "🚽", bg = Color3.fromRGB(245, 245, 255) },
            { emoji = "👁️", bg = Color3.fromRGB(80, 200, 255) },
            { emoji = "🗣️", bg = Color3.fromRGB(255, 220, 120) },
            { emoji = "💥", bg = Color3.fromRGB(255, 120, 120) },
        },
        texts = { "skibidi toilet 🚽", "flushed 😱", "dop dop yes yes", "you're next 👁️", "cameraman diff", "toilet army 💀" },
        npc = buildSkibidiNpc,
        collectLabel = "SKIBIDI +1 RIZZ",
        collectColor = Color3.fromRGB(245, 245, 250),
    },
    bombardir = {
        stickers = {
            { emoji = "🐊", bg = Color3.fromRGB( 90, 200,  90) },
            { emoji = "✈️", bg = Color3.fromRGB(150, 180, 255) },
            { emoji = "💣", bg = Color3.fromRGB( 70,  70,  80) },
            { emoji = "🔥", bg = Color3.fromRGB(255, 140,  60) },
        },
        texts = { "bombardiro incoming 💣", "crocodilo 🐊", "bomba bomba", "ka-boom 💥", "level go brrr", "flight 404" },
        npc = buildBombardiroNpc,
        collectLabel = "BOMBARDIRO +1 RIZZ",
        collectColor = Color3.fromRGB(85, 200, 90),
    },
    tralalero = {
        stickers = {
            { emoji = "🦈", bg = Color3.fromRGB( 80, 160, 255) },
            { emoji = "👟", bg = Color3.fromRGB(240, 240, 240) },
            { emoji = "🌊", bg = Color3.fromRGB( 60, 130, 220) },
            { emoji = "🎵", bg = Color3.fromRGB(255, 200, 120) },
        },
        texts = { "tralalero tralala 🦈", "nike shark", "beat drop 🎵", "splash 🌊", "fin-ally", "you fail 💀" },
        npc = buildTralaleroNpc,
        collectLabel = "TRALALERO +1 RIZZ",
        collectColor = Color3.fromRGB(60, 120, 220),
    },
    sigma = {
        stickers = {
            { emoji = "👑", bg = Color3.fromRGB(255, 215,  80) },
            { emoji = "😎", bg = Color3.fromRGB( 90, 180, 255) },
            { emoji = "🗿", bg = Color3.fromRGB(130, 130, 140) },
            { emoji = "💪", bg = Color3.fromRGB(255, 200, 150) },
        },
        texts = { "sigma grindset 😎", "ohio moment 🗿", "rizz +100", "alpha energy", "mewing hard", "gyatt 💀" },
        npc = buildSigmaNpc,
        collectLabel = "SIGMA +1 RIZZ",
        collectColor = Color3.fromRGB(255, 210, 80),
    },
    generic = {
        stickers = {
            { emoji = "🚽", bg = Color3.fromRGB(245, 245, 255) },
            { emoji = "🦈", bg = Color3.fromRGB( 80, 160, 255) },
            { emoji = "🐊", bg = Color3.fromRGB( 90, 200,  90) },
            { emoji = "🤡", bg = Color3.fromRGB(255, 200, 220) },
            { emoji = "💀", bg = Color3.fromRGB( 40,  40,  50) },
            { emoji = "😹", bg = Color3.fromRGB(255, 230, 120) },
            { emoji = "👑", bg = Color3.fromRGB(255, 215,  80) },
            { emoji = "🗿", bg = Color3.fromRGB(130, 130, 140) },
            { emoji = "🔥", bg = Color3.fromRGB(255, 140,  60) },
            { emoji = "✨", bg = Color3.fromRGB(200, 150, 255) },
            { emoji = "😎", bg = Color3.fromRGB( 90, 180, 255) },
            { emoji = "🍕", bg = Color3.fromRGB(255, 180, 120) },
        },
        texts = { "easy 😂", "good luck 💀", "you fail?", "gg ez", "skill issue", "rizz up" },
        npc = buildGenericMemeNpc,
        collectLabel = "MEME +1 RIZZ",
        collectColor = Color3.fromRGB(255, 90, 200),
    },
    -- ═══════════════════════════════════════════
    -- Session #077: Universal theme packs for non-meme themes
    -- ═══════════════════════════════════════════
    candy = {
        stickers = {
            { emoji = "🍭", bg = Color3.fromRGB(255, 180, 220) },
            { emoji = "🧁", bg = Color3.fromRGB(255, 200, 230) },
            { emoji = "🍬", bg = Color3.fromRGB(255, 150, 200) },
            { emoji = "🍩", bg = Color3.fromRGB(200, 150, 100) },
        },
        texts = { "sweet! 🍭", "yummy 🧁", "sugar rush!", "candy crush 🍬", "nom nom 🍩", "sprinkles ✨" },
        npc = buildCandyNpc,
        collectLabel = "+1 SWEET 🍭",
        collectColor = Color3.fromRGB(255, 150, 200),
    },
    hospital_horror = {
        stickers = {},
        texts = { "emergency lights", "roof exit", "toxic spill", "power surge" },
        npc = buildHorrorNpc,
        collectLabel = "+1 SUPPLY",
        collectColor = Color3.fromRGB(80, 255, 120),
    },
    school_horror = {
        stickers = {},
        texts = { "locker 13", "detention", "classroom key", "chalk arrow", "principal office", "library exit" },
        npc = buildSchoolGhostNpc,
        collectLabel = "+1 NOTE",
        collectColor = Color3.fromRGB(90, 255, 190),
    },
    lab_horror = {
        stickers = {},
        texts = { "specimen breach", "containment cracked", "mutant sample", "decon route", "emergency airlock" },
        npc = buildLabMonsterNpc,
        collectLabel = "+1 SAMPLE",
        collectColor = Color3.fromRGB(90, 225, 235),
    },
    slime_horror = {
        stickers = {},
        texts = { "goo trail", "run forward", "slime behind you", "next jump", "safe pad", "escape tunnel" },
        npc = buildHorrorNpc,
        collectLabel = "+1 GOO",
        collectColor = Color3.fromRGB(80, 255, 90),
    },
    horror = {
        stickers = {
            { emoji = "👻", bg = Color3.fromRGB(200, 200, 220) },
            { emoji = "💀", bg = Color3.fromRGB( 40,  40,  50) },
            { emoji = "🕷️", bg = Color3.fromRGB( 60,  60,  70) },
            { emoji = "🦇", bg = Color3.fromRGB( 80,  40,  80) },
        },
        texts = { "boo! 👻", "run... 💀", "behind you 🕷️", "too late", "don't look back", "you're trapped 🦇" },
        npc = buildHorrorNpc,
        collectLabel = "+1 SOUL 💀",
        collectColor = Color3.fromRGB(180, 50, 50),
    },
    space = {
        stickers = {
            { emoji = "🚀", bg = Color3.fromRGB(100, 120, 200) },
            { emoji = "👽", bg = Color3.fromRGB(100, 255, 100) },
            { emoji = "🪐", bg = Color3.fromRGB(200, 160, 100) },
            { emoji = "⭐", bg = Color3.fromRGB(255, 255, 100) },
        },
        texts = { "to the stars! 🚀", "alien spotted 👽", "zero gravity", "warp speed!", "houston... 🪐", "orbit achieved ⭐" },
        npc = buildSpaceNpc,
        collectLabel = "+1 STAR ⭐",
        collectColor = Color3.fromRGB(100, 150, 255),
    },
    nature = {
        stickers = {
            { emoji = "🍄", bg = Color3.fromRGB(220, 80, 80) },
            { emoji = "🌿", bg = Color3.fromRGB(100, 200, 100) },
            { emoji = "🌸", bg = Color3.fromRGB(255, 180, 200) },
            { emoji = "🦋", bg = Color3.fromRGB(150, 200, 255) },
        },
        texts = { "nature vibes 🌿", "mushroom power 🍄", "bloom! 🌸", "butterfly chase 🦋", "jungle time", "wild run 🌳" },
        npc = buildNatureNpc,
        collectLabel = "+1 SEED 🌱",
        collectColor = Color3.fromRGB(100, 200, 80),
    },
    lava = {
        stickers = {
            { emoji = "🔥", bg = Color3.fromRGB(255, 120, 30) },
            { emoji = "🌋", bg = Color3.fromRGB(200, 80, 20) },
            { emoji = "💎", bg = Color3.fromRGB(100, 200, 255) },
            { emoji = "⚡", bg = Color3.fromRGB(255, 255, 80) },
        },
        texts = { "floor is lava! 🔥", "eruption! 🌋", "hot hot hot!", "magma rising ⚡", "don't burn 💎", "inferno mode" },
        npc = buildLavaNpc,
        collectLabel = "+1 EMBER 🔥",
        collectColor = Color3.fromRGB(255, 120, 30),
    },
    medieval = {
        stickers = {
            { emoji = "⚔️", bg = Color3.fromRGB(180, 180, 190) },
            { emoji = "🛡️", bg = Color3.fromRGB(140, 100, 60) },
            { emoji = "👑", bg = Color3.fromRGB(255, 215, 80) },
            { emoji = "🐉", bg = Color3.fromRGB(100, 180, 80) },
        },
        texts = { "for glory! ⚔️", "defend! 🛡️", "dragon ahead 🐉", "quest on!", "knight's honor 👑", "dungeon clear" },
        npc = buildMedievalNpc,
        collectLabel = "+1 GOLD 👑",
        collectColor = Color3.fromRGB(255, 200, 50),
    },
    neon = {
        stickers = {
            { emoji = "💜", bg = Color3.fromRGB(150, 50, 255) },
            { emoji = "💙", bg = Color3.fromRGB(50, 100, 255) },
            { emoji = "💚", bg = Color3.fromRGB(50, 255, 100) },
            { emoji = "⚡", bg = Color3.fromRGB(255, 255, 80) },
        },
        texts = { "neon glow 💜", "electric! ⚡", "synthwave", "cyber run 💙", "hologram 💚", "retro vibes" },
        npc = buildNeonNpc,
        collectLabel = "+1 WATT ⚡",
        collectColor = Color3.fromRGB(0, 255, 200),
    },
    default = {
        stickers = {
            { emoji = "⭐", bg = Color3.fromRGB(255, 220, 80) },
            { emoji = "🏆", bg = Color3.fromRGB(255, 200, 50) },
            { emoji = "💎", bg = Color3.fromRGB(100, 200, 255) },
            { emoji = "🎮", bg = Color3.fromRGB(100, 150, 200) },
        },
        texts = { "let's go! ⭐", "nice jump!", "keep going 🏆", "almost there 💎", "you got this!", "pro gamer 🎮" },
        npc = buildDefaultNpc,
        collectLabel = "+1 COIN 💎",
        collectColor = Color3.fromRGB(255, 220, 80),
    },
}
local MEME_PACK = MEME_PACKS["${themeSubKey}"] or MEME_PACKS.generic or MEME_PACKS.default
local MEME_STICKERS = MEME_PACK.stickers

local function applyPlatformTexture(part, idx)
    if not part or not part:IsA("BasePart") then return end

    -- If AI-generated textures available, use ImageLabel on top
    if #PLATFORM_TEXTURES > 0 then
        local url = PLATFORM_TEXTURES[((idx - 1) % #PLATFORM_TEXTURES) + 1]
        if url and url ~= "" then
            local sg = Instance.new("SurfaceGui")
            sg.Name = "PlatformTexture"
            sg.Face = Enum.NormalId.Top
            sg.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
            sg.PixelsPerStud = 50
            sg.LightInfluence = 1
            sg.Parent = part

            local img = Instance.new("ImageLabel")
            img.Size = UDim2.new(1, 0, 1, 0)
            img.BackgroundTransparency = 1
            img.Image = url
            img.ImageTransparency = 0.15
            img.ScaleType = Enum.ScaleType.Crop
            img.Parent = sg
            return
        end
    end
    -- Fallback: emoji on Top + Front faces (always works, no rbxassetid needed)
    if #PLATFORM_EMOJIS > 0 then
        local emoji = PLATFORM_EMOJIS[((idx - 1) % #PLATFORM_EMOJIS) + 1]
        for _, face in ipairs({Enum.NormalId.Top, Enum.NormalId.Front, Enum.NormalId.Back, Enum.NormalId.Left, Enum.NormalId.Right, Enum.NormalId.Bottom}) do
            local sg = Instance.new("SurfaceGui")
            sg.Name = "PlatformEmoji"
            sg.Face = face
            sg.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
            sg.PixelsPerStud = 5
            sg.LightInfluence = 1
            sg.Parent = part

            local tl = Instance.new("TextLabel")
            tl.Size = UDim2.new(1, 0, 1, 0)
            tl.BackgroundTransparency = 1
            tl.Text = emoji
            tl.TextScaled = true
            tl.Font = Enum.Font.GothamBold
            tl.TextColor3 = Color3.fromRGB(255, 255, 255)
            tl.Parent = sg
        end
    end
end

-- Session #20: robust model-height read (moved before spawnMemeCollectible so
-- both collectible and NPC placement can use it). GetBoundingBox can return 0
-- or NaN for certain Meshy-imported models. Fallback to GetExtentsSize.
local function _safeModelHeight(m)
    local okBB, _, bb = pcall(function() return m:GetBoundingBox() end)
    if okBB and typeof(bb) == "Vector3" and bb.Y > 0.5 then return bb.Y end
    local okEx, ex = pcall(function() return m:GetExtentsSize() end)
    if okEx and typeof(ex) == "Vector3" and ex.Y > 0.5 then return ex.Y end
    return 0
end
-- Hard cap: after all scaling, a per-platform NPC must not exceed 12 studs
local MEME_NPC_HARD_CAP_Y = 12

-- ═══════════════════════════════════════════
-- MEME: Theme-aware collectible pickup
-- ═══════════════════════════════════════════
-- Builds a collectible by reusing the selected NPC builder (so Skibidi obbies
-- get toilet pickups, Bombardiro obbies get plane pickups, etc.), adds a
-- themed BillboardGui label, glowing outline + point light, and a collect-
-- on-touch handler that increments leaderstats.Rizz. Replaces the old
-- hardcoded spawnBombardiroCollectible which fired the "BOMBARDIRO +1 RIZZ"
-- label for every meme sub-theme.
local function spawnMemeCollectible(position)
    position = _stageShift(position)
    local themeColor = MEME_PACK.collectColor or Color3.fromRGB(255, 255, 120)

    -- Session #074b: Try loading a real 3D model as small collectible
    if #FALLBACK_NPC_MODELS > 0 then
        local modelId = FALLBACK_NPC_MODELS[math.random(1, #FALLBACK_NPC_MODELS)]
        local okIns, inserted = pcall(function()
            return game:GetService("InsertService"):LoadAsset(modelId)
        end)
        if okIns and inserted then
            local model = inserted
            local inner = inserted:FindFirstChildWhichIsA("Model")
            if inner then model = inner; inner.Parent = nil end
            -- Strip scripts to prevent Humanoid errors on static prop models
            for _, child in model:GetDescendants() do
                if child:IsA("BaseScript") then child.Disabled = true; child:Destroy() end
            end
            -- Scale down to collectible size (~3 studs tall)
            local rawH = _safeModelHeight(model)
            if rawH > 0 then
                pcall(function() model:ScaleTo(3 / rawH) end)
            end
            pcall(function() model:PivotTo(CFrame.new(position + Vector3.new(0, 1.5, 0))) end)
            for _, d in model:GetDescendants() do
                if d:IsA("BasePart") then d.Anchored = true; d.CanCollide = false end
            end
            model.Name = "MemeCollectible"
            model.Parent = container
            if inserted ~= model and inserted.Parent then inserted:Destroy() end

            local primary = model.PrimaryPart or model:FindFirstChildWhichIsA("BasePart")
            if primary then
                local light = Instance.new("PointLight")
                light.Brightness = 3; light.Range = 14; light.Color = themeColor
                light.Parent = primary

                local bb = Instance.new("BillboardGui")
                bb.Size = UDim2.new(0, 140, 0, 36)
                bb.StudsOffset = Vector3.new(0, 3, 0)
                bb.MaxDistance = 45; bb.AlwaysOnTop = false
                bb.Parent = primary
                local tl = Instance.new("TextLabel")
                tl.Size = UDim2.new(1, 0, 1, 0)
                tl.BackgroundTransparency = 1
                tl.Text = MEME_PACK.collectLabel or "MEME +1 RIZZ"
                tl.TextColor3 = Color3.fromRGB(255, 255, 90)
                tl.TextStrokeTransparency = 0
                tl.TextStrokeColor3 = Color3.fromRGB(60, 20, 120)
                tl.TextScaled = true; tl.Font = Enum.Font.FredokaOne
                tl.Parent = bb
            end

            -- Bob + collect
            local baseCF = (model.PrimaryPart or model:FindFirstChildWhichIsA("BasePart")).CFrame
            local t0 = tick()
            task.spawn(function()
                while model and model.Parent do
                    local dt = tick() - t0
                    model:PivotTo(baseCF * CFrame.new(0, math.sin(dt * 2.5) * 0.4, 0))
                    RunService.Heartbeat:Wait()
                end
            end)
            local collected = false
            for _, d in model:GetDescendants() do
                if d:IsA("BasePart") then
                    d.Touched:Connect(function(hit)
                        if collected then return end
                        local player = Players:GetPlayerFromCharacter(hit.Parent)
                        if not player then return end
                        collected = true
                        local stats = player:FindFirstChild("leaderstats")
                        if stats then
                            local curr = stats:FindFirstChild(_CURRENCY_NAME)
                            if curr then curr.Value = curr.Value + 1 end
                        end
                        for _, p in model:GetDescendants() do
                            if p:IsA("BasePart") then
                                TweenService:Create(p, TweenInfo.new(0.3), {Transparency = 1}):Play()
                            end
                        end
                        task.delay(0.4, function() if model and model.Parent then model:Destroy() end end)
                    end)
                end
            end
            return
        end
    end

    -- Session #073b: Billboard collectible from AI-generated NPC image
    if #NPC_IMAGES > 0 then
        local imgUrl = NPC_IMAGES[math.random(1, #NPC_IMAGES)]
        if imgUrl and imgUrl ~= "" then
            local hitbox = Instance.new("Part")
            hitbox.Size = Vector3.new(4, 5, 1)
            hitbox.Anchored = true
            hitbox.CanCollide = false
            hitbox.Transparency = 1
            hitbox.Position = position
            hitbox.Name = "MemeCollectible"
            hitbox.Parent = container

            local bb = Instance.new("BillboardGui")
            bb.Size = UDim2.new(4, 0, 5, 0)
            bb.StudsOffset = Vector3.new(0, 2.5, 0)
            bb.AlwaysOnTop = false
            bb.MaxDistance = 60
            bb.Parent = hitbox

            local img = Instance.new("ImageLabel")
            img.Size = UDim2.new(1, 0, 1, 0)
            img.BackgroundTransparency = 1
            img.Image = imgUrl
            img.ScaleType = Enum.ScaleType.Fit
            img.Parent = bb

            -- Collect label above
            local labelBb = Instance.new("BillboardGui")
            labelBb.Size = UDim2.new(0, 140, 0, 36)
            labelBb.StudsOffset = Vector3.new(0, 6, 0)
            labelBb.MaxDistance = 45
            labelBb.AlwaysOnTop = false
            labelBb.Parent = hitbox
            local tl = Instance.new("TextLabel")
            tl.Size = UDim2.new(1, 0, 1, 0)
            tl.BackgroundTransparency = 1
            tl.Text = MEME_PACK.collectLabel or "MEME +1 RIZZ"
            tl.TextColor3 = Color3.fromRGB(255, 255, 90)
            tl.TextStrokeTransparency = 0
            tl.TextStrokeColor3 = Color3.fromRGB(60, 20, 120)
            tl.TextScaled = true
            tl.Font = Enum.Font.FredokaOne
            tl.Parent = labelBb

            local glow = Instance.new("PointLight")
            glow.Brightness = 3
            glow.Range = 14
            glow.Color = themeColor
            glow.Parent = hitbox

            -- Bob animation
            local baseCF = hitbox.CFrame
            local t0 = tick()
            task.spawn(function()
                while hitbox and hitbox.Parent do
                    local dt = tick() - t0
                    local bob = math.sin(dt * 2.5) * 0.4
                    hitbox.CFrame = baseCF * CFrame.new(0, bob, 0)
                    RunService.Heartbeat:Wait()
                end
            end)

            -- Collect on touch
            local collected = false
            hitbox.Touched:Connect(function(hit)
                if collected then return end
                local player = Players:GetPlayerFromCharacter(hit.Parent)
                if not player then return end
                collected = true
                local stats = player:FindFirstChild("leaderstats")
                if stats then
                    local curr = stats:FindFirstChild(_CURRENCY_NAME)
                    if curr then curr.Value = curr.Value + 1 end
                end
                TweenService:Create(hitbox, TweenInfo.new(0.3), {Transparency = 1}):Play()
                task.delay(0.4, function() if hitbox and hitbox.Parent then hitbox:Destroy() end end)
            end)
            return
        end
    end

    -- Fallback: primitive composite collectible
    local model = MEME_PACK.npc(position, math.random(1, 999999))
    if not model or not model.PrimaryPart then return end
    model.Name = "MemeCollectible"
    local primary = model.PrimaryPart

    -- Glow light so the pickup is impossible to miss
    local light = Instance.new("PointLight")
    light.Brightness = 3
    light.Range = 14
    light.Color = themeColor
    light.Parent = primary

    -- Outline highlight (works for any sub-theme NPC shape)
    local sel = Instance.new("SelectionBox")
    sel.Adornee = primary
    sel.LineThickness = 0.08
    sel.Color3 = Color3.fromRGB(255, 255, 120)
    sel.SurfaceTransparency = 0.6
    sel.SurfaceColor3 = Color3.fromRGB(255, 255, 120)
    sel.Parent = primary

    -- Theme-aware billboard label
    local bb = Instance.new("BillboardGui")
    bb.Size = UDim2.new(0, 140, 0, 36)
    bb.StudsOffset = Vector3.new(0, 3.5, 0)
    bb.MaxDistance = 45
    bb.AlwaysOnTop = false
    bb.Parent = primary
    local tl = Instance.new("TextLabel")
    tl.Size = UDim2.new(1, 0, 1, 0)
    tl.BackgroundTransparency = 1
    tl.Text = MEME_PACK.collectLabel or "MEME +1 RIZZ"
    tl.TextColor3 = Color3.fromRGB(255, 255, 90)
    tl.TextStrokeTransparency = 0
    tl.TextStrokeColor3 = Color3.fromRGB(60, 20, 120)
    tl.TextScaled = true
    tl.Font = Enum.Font.FredokaOne
    tl.Parent = bb

    -- Collect on touch
    local collected = false
    local function onTouch(hit)
        if collected then return end
        local player = Players:GetPlayerFromCharacter(hit.Parent)
        if not player then return end
        collected = true
        local stats = player:FindFirstChild("leaderstats")
        if stats then
            local curr = stats:FindFirstChild(_CURRENCY_NAME)
            if curr then curr.Value = curr.Value + 1 end
        end
        for _, d in ipairs(model:GetDescendants()) do
            if d:IsA("BasePart") then
                TweenService:Create(d, TweenInfo.new(0.3), {Transparency = 1, Size = d.Size * 0.2}):Play()
            end
        end
        task.delay(0.4, function() if model and model.Parent then model:Destroy() end end)
    end
    for _, d in ipairs(model:GetDescendants()) do
        if d:IsA("BasePart") then
            d.Touched:Connect(onTouch)
        end
    end
end

-- Non-character pickup for serious obbies where the brief forbids monsters/NPCs.
-- Uses a readable glowing coin/vial shape instead of reusing the theme NPC builder.
local function spawnSimpleCollectible(position)
    position = _stageShift(position)
    local themeColor = MEME_PACK.collectColor or Color3.fromRGB(120, 255, 120)
    local coin = Instance.new("Part")
    coin.Name = "ThemeCollectible"
    coin.Shape = Enum.PartType.Cylinder
    coin.Size = Vector3.new(0.45, 2.8, 2.8)
    coin.CFrame = CFrame.new(position) * CFrame.Angles(0, 0, math.rad(90))
    coin.Anchored = true
    coin.CanCollide = false
    coin.Material = Enum.Material.Neon
    coin.Color = themeColor
    coin.Parent = container

    local light = Instance.new("PointLight")
    light.Brightness = 2.5
    light.Range = 13
    light.Color = themeColor
    light.Parent = coin

    local bb = Instance.new("BillboardGui")
    bb.Size = UDim2.new(0, 120, 0, 28)
    bb.StudsOffset = Vector3.new(0, 2.4, 0)
    bb.MaxDistance = 42
    bb.AlwaysOnTop = false
    bb.Parent = coin
    local tl = Instance.new("TextLabel")
    tl.Size = UDim2.new(1, 0, 1, 0)
    tl.BackgroundTransparency = 1
    tl.Text = "+1 ${currencyName}"
    tl.TextColor3 = Color3.fromRGB(210, 255, 210)
    tl.TextStrokeTransparency = 0.2
    tl.TextScaled = true
    tl.Font = Enum.Font.GothamBold
    tl.Parent = bb

    local baseCF = coin.CFrame
    local t0 = tick()
    task.spawn(function()
        while coin and coin.Parent do
            local dt = tick() - t0
            coin.CFrame = baseCF * CFrame.new(0, math.sin(dt * 2.1) * 0.35, 0) * CFrame.Angles(0, math.rad((dt * 80) % 360), 0)
            RunService.Heartbeat:Wait()
        end
    end)

    local collected = false
    coin.Touched:Connect(function(hit)
        if collected then return end
        local player = Players:GetPlayerFromCharacter(hit.Parent)
        if not player then return end
        collected = true
        local stats = player:FindFirstChild("leaderstats")
        if stats then
            local curr = stats:FindFirstChild("${currencyName}")
            if curr then curr.Value = curr.Value + 1 end
        end
        TweenService:Create(coin, TweenInfo.new(0.25), {Transparency = 1, Size = coin.Size * 0.2}):Play()
        task.delay(0.35, function() if coin and coin.Parent then coin:Destroy() end end)
    end)
end

-- ═══════════════════════════════════════════
-- MEME: checkpoint meme-text billboard
-- ═══════════════════════════════════════════
-- Picks a deterministic meme phrase from MEME_PACK.texts indexed by level and
-- floats it above the given part. MaxDistance=80 + AlwaysOnTop=false so the
-- text does not visually stack across adjacent checkpoints.
local function attachMemeText(part, levelIdx)
    if not ${memeBillboardsEnabled ? 'true' : 'false'} then return end
    if not part or not MEME_PACK.texts or #MEME_PACK.texts == 0 then return end
    local memeText = MEME_PACK.texts[((math.floor(levelIdx / 3) - 1) % #MEME_PACK.texts) + 1]
    local bb = Instance.new("BillboardGui")
    bb.Name = "MemeText"
    bb.Size = UDim2.new(0, 220, 0, 60)
    bb.StudsOffset = Vector3.new(0, 10, 0)
    bb.MaxDistance = 80
    bb.AlwaysOnTop = false
    bb.Parent = part
    local tl = Instance.new("TextLabel")
    tl.Size = UDim2.new(1, 0, 1, 0)
    tl.BackgroundTransparency = 1
    tl.Text = memeText
    tl.TextColor3 = Color3.fromRGB(255, 255, 255)
    tl.TextStrokeTransparency = 0
    tl.TextStrokeColor3 = Color3.fromRGB(120, 0, 140)
    tl.TextScaled = true
    tl.Font = Enum.Font.FredokaOne
    tl.Parent = bb
end

-- ═══════════════════════════════════════════
-- MEME: helper to place an NPC on top of a platform
--
-- Session #18: primary path is Clone of a real 3D template stored at
-- ReplicatedStorage.MemeNpcTemplates[sub-theme] (populated by the hero asset
-- loader). Falls back to the session #17 primitive composite builder only if
-- the template is missing (Tier 1 + Tier 2 both failed in hero asset pipeline).
-- ═══════════════════════════════════════════
local _MEME_NPC_SUB_THEME = "${themeSubKey}"
local _CURRENCY_NAME = "${currencyName}"
local SERIOUS_DECORATIVE_NPCS = ${isMeme ? 'false' : 'true'}
local DECORATIVE_NPC_LEVEL_INTERVAL = ${isMeme ? '1' : '5'}
local _decorativeNpcLevels = {}

local function _shouldPlaceDecorativeNpc(platformPart, levelIdx)
    if not DECORATIVE_NPCS_ENABLED then return false end
    if not platformPart or not platformPart:IsA("BasePart") then return false end
    if not SERIOUS_DECORATIVE_NPCS then return true end
    if levelIdx < 2 then return false end
    if (levelIdx % DECORATIVE_NPC_LEVEL_INTERVAL) ~= 0 then return false end
    if _decorativeNpcLevels[levelIdx] then return false end
    _decorativeNpcLevels[levelIdx] = true
    return true
end

local function _decorativeNpcPlacement(platformPart, levelIdx, finalHeight)
    local height = finalHeight or 4
    if not SERIOUS_DECORATIVE_NPCS then
        local top = platformPart.Position + Vector3.new(0, (platformPart.Size.Y / 2) + (height / 2) + 0.2, 0)
        return top, CFrame.Angles(0, math.rad(levelIdx * 37 % 360), 0)
    end

    local side = (levelIdx % 2 == 0) and -1 or 1
    local routeHalfWidth = math.max(platformPart.Size.X, platformPart.Size.Z) / 2
    local sideOffset = side * math.max(routeHalfWidth + 7, 10)
    local pedestalPos = Vector3.new(
        platformPart.Position.X + sideOffset,
        platformPart.Position.Y + (platformPart.Size.Y / 2) + 0.18,
        platformPart.Position.Z
    )
    local pedestal = makePart({
        name = "AmbientNpcSidePedestal_L" .. tostring(levelIdx),
        size = Vector3.new(4.2, 0.35, 4.2),
        position = pedestalPos,
        color = MEME_PACK.collectColor or Color3.fromRGB(90, 255, 190),
        material = Enum.Material.SmoothPlastic,
        transparency = 0.18,
        canCollide = false,
        noSparkles = true,
        noLight = false,
    })
    if pedestal then
        pedestal.Name = "AmbientNpcSidePedestal_L" .. tostring(levelIdx)
    end
    local top = pedestalPos + Vector3.new(0, (height / 2) + 0.36, 0)
    local faceRoute = side < 0 and math.rad(90) or math.rad(-90)
    return top, CFrame.Angles(0, faceRoute, 0)
end

-- Session #075: ProximityPrompt interaction on NPC — press E → random meme phrase + Rizz
local function _addNpcInteraction(npc, levelIdx)
    local primary = npc.PrimaryPart or npc:FindFirstChildWhichIsA("BasePart")
    if not primary then return end
    local prox = Instance.new("ProximityPrompt")
    prox.ActionText = "Talk"
    prox.ObjectText = _MEME_NPC_SUB_THEME ~= "" and _MEME_NPC_SUB_THEME or "Meme NPC"
    prox.HoldDuration = 0
    prox.MaxActivationDistance = 10
    prox.RequiresLineOfSight = false
    prox.Parent = primary

    local phrases = MEME_PACK.texts or { "bruh 💀", "rizz +1", "gg ez" }
    local chatCooldown = false
    prox.Triggered:Connect(function(player)
        if chatCooldown then return end
        chatCooldown = true
        -- Give +1 currency
        local stats = player:FindFirstChild("leaderstats")
        if stats then
            local curr = stats:FindFirstChild(_CURRENCY_NAME)
            if curr then curr.Value = curr.Value + 1 end
        end
        -- Show meme phrase in chat bubble
        local phrase = phrases[math.random(1, #phrases)]
        local chatBb = Instance.new("BillboardGui")
        chatBb.Name = "NpcChat"
        chatBb.Size = UDim2.new(0, 200, 0, 50)
        chatBb.StudsOffset = Vector3.new(0, 6, 0)
        chatBb.MaxDistance = 40
        chatBb.AlwaysOnTop = false
        chatBb.Parent = primary
        local chatLabel = Instance.new("TextLabel")
        chatLabel.Size = UDim2.new(1, 0, 1, 0)
        chatLabel.BackgroundColor3 = Color3.fromRGB(0, 0, 0)
        chatLabel.BackgroundTransparency = 0.3
        chatLabel.Text = phrase
        chatLabel.TextColor3 = Color3.fromRGB(255, 255, 90)
        chatLabel.TextStrokeTransparency = 0
        chatLabel.TextStrokeColor3 = Color3.fromRGB(60, 20, 120)
        chatLabel.TextScaled = true
        chatLabel.Font = Enum.Font.FredokaOne
        chatLabel.Parent = chatBb
        -- Pop animation
        task.delay(2, function()
            if chatBb and chatBb.Parent then chatBb:Destroy() end
            chatCooldown = false
        end)
    end)
end

local function placeMemeNpcOnPlatform(platformPart, levelIdx)
    if not _shouldPlaceDecorativeNpc(platformPart, levelIdx) then return end
    local templates = game:GetService("ReplicatedStorage"):FindFirstChild("MemeNpcTemplates")
    local template = templates and templates:FindFirstChild(_MEME_NPC_SUB_THEME)
    if template then
        -- Tier A: Clone the real 3D model (Skibidi Toilet etc.) that was loaded
        -- into ReplicatedStorage by the hero asset pipeline.
        local npc = template:Clone()
        local platformWidth = math.min(platformPart.Size.X, platformPart.Size.Z)
        local targetHeight = math.clamp(platformWidth * 0.7, 5, 8)
        local rawH = _safeModelHeight(npc)
        print(string.format("[MemeNpc] %s L%d raw height=%.2f target=%.2f", _MEME_NPC_SUB_THEME, levelIdx, rawH, targetHeight))
        if rawH > 0 then
            local scale = targetHeight / rawH
            if math.abs(scale - 1) > 0.05 then
                pcall(function() npc:ScaleTo(scale) end)
            end
        end
        -- Hard cap pass: re-measure and scale down if still huge.
        local postH = _safeModelHeight(npc)
        if postH > MEME_NPC_HARD_CAP_Y then
            local capScale = MEME_NPC_HARD_CAP_Y / postH
            pcall(function() npc:ScaleTo(capScale) end)
            print(string.format("[MemeNpc] %s L%d hard cap: postH=%.2f → capScale=%.2f", _MEME_NPC_SUB_THEME, levelIdx, postH, capScale))
            postH = MEME_NPC_HARD_CAP_Y
        end
        local finalHeight = postH > 0 and postH or targetHeight
        local top, orient = _decorativeNpcPlacement(platformPart, levelIdx, finalHeight)
        pcall(function() npc:PivotTo(CFrame.new(top) * orient) end)
        -- Freeze in place
        if npc.PrimaryPart then
            npc.PrimaryPart.Anchored = true
        end
        for _, d in npc:GetDescendants() do
            if d:IsA("BasePart") then
                d.Anchored = true
                d.CanCollide = false
            end
        end
        npc.Name = "MemeNpc_L" .. tostring(levelIdx)
        npc.Parent = container
        pcall(function() _memeNpcIdle(npc, npc.PrimaryPart) end)
        pcall(function() _addNpcInteraction(npc, levelIdx) end)
        return
    end
    -- Tier A2: Load user-uploaded 3D model via InsertService (session #074b)
    if #FALLBACK_NPC_MODELS > 0 then
        local modelId = FALLBACK_NPC_MODELS[((levelIdx - 1) % #FALLBACK_NPC_MODELS) + 1]
        local okInsert, inserted = pcall(function()
            return game:GetService("InsertService"):LoadAsset(modelId)
        end)
        if okInsert and inserted then
            -- InsertService wraps in a Model; find the actual model inside
            local npc = inserted
            local inner = inserted:FindFirstChildWhichIsA("Model")
            if inner then npc = inner; inner.Parent = nil end
            -- Strip scripts to prevent Humanoid errors on static prop models
            for _, child in npc:GetDescendants() do
                if child:IsA("BaseScript") then child.Disabled = true; child:Destroy() end
            end
            local platformWidth = math.min(platformPart.Size.X, platformPart.Size.Z)
            local targetHeight = math.clamp(platformWidth * 0.7, 4, 8)
            local rawH = _safeModelHeight(npc)
            if rawH > 0 then
                local scale = targetHeight / rawH
                if math.abs(scale - 1) > 0.05 then
                    pcall(function() npc:ScaleTo(scale) end)
                end
            end
            local postH = _safeModelHeight(npc)
            if postH > MEME_NPC_HARD_CAP_Y then
                pcall(function() npc:ScaleTo(MEME_NPC_HARD_CAP_Y / postH) end)
                postH = MEME_NPC_HARD_CAP_Y
            end
            local finalHeight = postH > 0 and postH or targetHeight
            local top, orient = _decorativeNpcPlacement(platformPart, levelIdx, finalHeight)
            pcall(function() npc:PivotTo(CFrame.new(top) * orient) end)
            for _, d in npc:GetDescendants() do
                if d:IsA("BasePart") then d.Anchored = true; d.CanCollide = false end
            end
            npc.Name = "MemeNpc_L" .. tostring(levelIdx)
            npc.Parent = container
            pcall(function() _memeNpcIdle(npc, npc.PrimaryPart) end)
            pcall(function() _addNpcInteraction(npc, levelIdx) end)
            if inserted ~= npc and inserted.Parent then inserted:Destroy() end
            print(string.format("[MemeNpc] Tier A2: loaded model %d for L%d", modelId, levelIdx))
            return
        else
            print(string.format("[MemeNpc] Tier A2 failed for model %d: %s", modelId, tostring(inserted)))
        end
    end
    -- Tier B: Billboard NPC from AI-generated 2D image (session #073b)
    if #NPC_IMAGES > 0 then
        local imgUrl = NPC_IMAGES[((levelIdx - 1) % #NPC_IMAGES) + 1]
        if imgUrl and imgUrl ~= "" then
            local pedestal = Instance.new("Part")
            pedestal.Size = Vector3.new(2, 0.4, 2)
            pedestal.Anchored = true
            pedestal.CanCollide = false
            pedestal.Material = Enum.Material.SmoothPlastic
            pedestal.Color = MEME_PACK.collectColor or Color3.fromRGB(180, 180, 220)
            local top, orient = _decorativeNpcPlacement(platformPart, levelIdx, 6)
            pedestal.CFrame = CFrame.new(top - Vector3.new(0, 3, 0)) * orient
            pedestal.Name = "NpcPedestal_L" .. tostring(levelIdx)
            pedestal.Parent = container

            local bb = Instance.new("BillboardGui")
            bb.Size = UDim2.new(8, 0, 10, 0)
            bb.StudsOffset = Vector3.new(0, 5.5, 0)
            bb.AlwaysOnTop = false
            bb.MaxDistance = 150
            bb.Name = "NpcBillboard"
            bb.Parent = pedestal

            local img = Instance.new("ImageLabel")
            img.Size = UDim2.new(1, 0, 1, 0)
            img.BackgroundTransparency = 1
            img.Image = imgUrl
            img.ScaleType = Enum.ScaleType.Fit
            img.Parent = bb

            local glow = Instance.new("PointLight")
            glow.Brightness = 2
            glow.Range = 12
            glow.Color = MEME_PACK.collectColor or Color3.fromRGB(200, 200, 255)
            glow.Parent = pedestal

            -- Idle bob animation for billboard NPC
            local baseCF = pedestal.CFrame
            local t0 = tick()
            task.spawn(function()
                while pedestal and pedestal.Parent do
                    local dt = tick() - t0
                    local bob = math.sin(dt * 1.5) * 0.3
                    pedestal.CFrame = baseCF * CFrame.new(0, bob, 0)
                    RunService.Heartbeat:Wait()
                end
            end)
            return
        end
    end
    -- Tier C: primitive composite fallback (session #17 builders)
    local top, orient = _decorativeNpcPlacement(platformPart, levelIdx, 4)
    local npc = MEME_PACK.npc(top, levelIdx)
    if npc and npc.PrimaryPart then
        pcall(function() npc:PivotTo(CFrame.new(top) * orient) end)
    end
end

-- ═══════════════════════════════════════════
-- MEME: troll platform — soft fall after touch so the player slides off
-- ═══════════════════════════════════════════
local function makeTrollPlatform(part)
    if not TROLL_PLATFORM_ENABLED then return end
    if not part then return end
    local trolled = false
    part.Touched:Connect(function(hit)
        if trolled then return end
        local hum = hit.Parent and hit.Parent:FindFirstChildOfClass("Humanoid")
        if not hum then return end
        trolled = true
        -- Swap the sticker to GOTCHA so the player gets feedback
        local sg = part:FindFirstChildOfClass("SurfaceGui")
        if sg then
            local frame = sg:FindFirstChildOfClass("Frame")
            if frame then
                local tl2 = frame:FindFirstChildOfClass("TextLabel")
                if tl2 then tl2.Text = "💀 GOTCHA 💀" end
                frame.BackgroundColor3 = Color3.fromRGB(255, 80, 80)
            end
        end
        task.wait(0.3)
        local tweenInfo = TweenInfo.new(0.8, Enum.EasingStyle.Quad, Enum.EasingDirection.In)
        TweenService:Create(part, tweenInfo, { Position = part.Position - Vector3.new(0, 80, 0) }):Play()
    end)
end
`;

  // Collectible seeding inside build loop — universal for all themes
  // dispatcher so "Skibidi" obby gets Skibidi pickups, "Bombardiro" obby gets
  // Bombardiro pickups, etc. No more hardcoded "BOMBARDIRO +1 RIZZ" for
  // unrelated sub-themes.
  // Session #19: collectible density is now randomized (~45% chance per level)
  // using the seeded math.random stream so different prompts scatter pickups
  // differently. Previous "every 2nd level" was too predictable.
  const collectibleSpawner = isMeme && decorativeNpcsEnabled ? 'spawnMemeCollectible' : 'spawnSimpleCollectible';
  const memeCollectibleInLoopLua = collectiblesEnabled ? `
    -- Session #077: 45% chance to seed a theme pickup on any given level
    if math.random() < 0.45 then
        local jx = math.random(-5, 5)
        local jy = math.random(2, 6)
        ${collectibleSpawner}(Vector3.new(jx, currentY + jy, (basePos.Z + endPos.Z) / 2))
    end` : '';

  // trollLevel constant — disabled unless the brief explicitly asks for troll/fake platforms
  const trollLevelLua = String(trollLevel);

  // leaderstats setup (universal for all themes)
  const memeLeaderstatsLua = `
    -- Session #077: Universal currency counter
    local stats = Instance.new("Folder")
    stats.Name = "leaderstats"
    stats.Parent = player
    local rizz = Instance.new("IntValue")
    rizz.Name = "${currencyName}"
    rizz.Value = 0
    rizz.Parent = stats`;

  // Meme spawn sound on CharacterAdded — disabled (no validated free-use asset id yet).
  // TODO: wire a real rbxassetid once we find a public Skibidi/Brainrot short SFX.
  const memeSpawnSoundLua = '';

  const hospitalDressingLua = isHospitalHorror ? `
-- ═══════════════════════════════════════════
-- HOSPITAL HORROR ENVIRONMENTAL DRESSING
-- Keeps the obby path playable while making the map read as a ruined hospital:
-- corridor walls, floor tiles, fluorescent lights, beds, IV stands, wires,
-- toxic green spills, and a rescue helicopter at the final platform.
-- ═══════════════════════════════════════════
local HOSPITAL_SET_DRESSING_VERSION = 2

local function _hospitalPart(name, size, position, color, material, extra)
    extra = extra or {}
    extra.name = name
    extra.size = size
    extra.position = position
    extra.cframe = extra.cframe or CFrame.new(position)
    extra.color = color
    extra.material = material or Enum.Material.Concrete
    if extra.canCollide == nil then extra.canCollide = false end
    extra.noSparkles = true
    extra.noLight = extra.noLight ~= false
    return makePart(extra)
end

local function _hospitalWallSign(parentPart, text, color)
    if not parentPart then return end
    local bb = Instance.new("BillboardGui")
    bb.Name = "HospitalSign"
    bb.Size = UDim2.new(0, 170, 0, 34)
    bb.StudsOffset = Vector3.new(0, 3.5, 0)
    bb.MaxDistance = 55
    bb.AlwaysOnTop = false
    bb.Parent = parentPart
    local label = Instance.new("TextLabel")
    label.Size = UDim2.new(1, 0, 1, 0)
    label.BackgroundColor3 = Color3.fromRGB(18, 26, 28)
    label.BackgroundTransparency = 0.2
    label.Text = text
    label.TextColor3 = color or Color3.fromRGB(130, 255, 180)
    label.TextStrokeTransparency = 0.35
    label.TextScaled = true
    label.Font = Enum.Font.GothamBold
    label.Parent = bb
end

local function _hospitalSurfaceLabel(parentPart, text, color)
    if not parentPart then return end
    local gui = Instance.new("SurfaceGui")
    gui.Name = "HospitalSurfaceLabel"
    gui.Face = Enum.NormalId.Front
    gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
    gui.PixelsPerStud = 48
    gui.LightInfluence = 0.15
    gui.Parent = parentPart
    local label = Instance.new("TextLabel")
    label.Size = UDim2.new(1, -24, 1, -16)
    label.Position = UDim2.new(0, 12, 0, 8)
    label.BackgroundTransparency = 1
    label.Text = text
    label.TextColor3 = color or Color3.fromRGB(210, 255, 225)
    label.TextStrokeTransparency = 0.2
    label.TextScaled = true
    label.TextWrapped = true
    label.Font = Enum.Font.GothamBlack
    label.Parent = gui
end

local function _hospitalLight(part, brightness, range, color)
    if not part then return end
    local pl = part:FindFirstChildOfClass("PointLight")
    if not pl then
        pl = Instance.new("PointLight")
        pl.Parent = part
    end
    pl.Brightness = brightness or 1.6
    pl.Range = range or 18
    pl.Color = color or part.Color
end

local function _hospitalCross(name, center, scale)
    scale = scale or 1
    _hospitalPart(name .. "_Vertical", Vector3.new(0.35 * scale, 2.3 * scale, 0.18), center, Color3.fromRGB(210, 40, 45), Enum.Material.Neon, { noLight = false })
    _hospitalPart(name .. "_Horizontal", Vector3.new(1.6 * scale, 0.35 * scale, 0.18), center, Color3.fromRGB(210, 40, 45), Enum.Material.Neon, { noLight = false })
end

local function _hospitalDoorFrame(name, side, y, z, label)
    local x = side * 22.7
    _hospitalPart(name .. "_JambA", Vector3.new(0.45, 5.2, 0.5), Vector3.new(x, y + 2.6, z - 2.5), Color3.fromRGB(78, 88, 86), Enum.Material.Metal)
    _hospitalPart(name .. "_JambB", Vector3.new(0.45, 5.2, 0.5), Vector3.new(x, y + 2.6, z + 2.5), Color3.fromRGB(78, 88, 86), Enum.Material.Metal)
    local top = _hospitalPart(name .. "_Header", Vector3.new(0.55, 0.55, 5.4), Vector3.new(x, y + 5.15, z), Color3.fromRGB(78, 88, 86), Enum.Material.Metal)
    local door = _hospitalPart(name .. "_DoorSlab", Vector3.new(0.25, 4.2, 4.0), Vector3.new(side * 22.45, y + 2.1, z + side * 0.35), Color3.fromRGB(150, 170, 166), Enum.Material.SmoothPlastic, { transparency = 0.18 })
    _hospitalWallSign(top, label or "WARD", Color3.fromRGB(235, 255, 245))
    _hospitalPart(name .. "_Window", Vector3.new(0.1, 1.0, 1.2), Vector3.new(side * 22.3, y + 3.1, z), Color3.fromRGB(120, 245, 230), Enum.Material.Glass, { transparency = 0.35, noLight = false })
    return door
end

local function _hospitalBedCluster(prefix, side, y, z)
    local x = side * 15.5
    _hospitalPart(prefix .. "_GurneyFrame", Vector3.new(4.8, 0.45, 7.2), Vector3.new(x, y + 0.35, z), Color3.fromRGB(155, 160, 162), Enum.Material.Metal)
    _hospitalPart(prefix .. "_Mattress", Vector3.new(4.35, 0.5, 6.4), Vector3.new(x, y + 0.85, z), Color3.fromRGB(216, 232, 236), Enum.Material.Fabric)
    _hospitalPart(prefix .. "_Pillow", Vector3.new(3.1, 0.35, 1.05), Vector3.new(x, y + 1.25, z - 2.45), Color3.fromRGB(238, 246, 246), Enum.Material.Fabric)
    _hospitalPart(prefix .. "_Blanket", Vector3.new(4.15, 0.24, 2.6), Vector3.new(x, y + 1.18, z + 1.2), Color3.fromRGB(92, 168, 178), Enum.Material.Fabric)
    _hospitalPart(prefix .. "_WheelA", Vector3.new(0.55, 0.55, 0.55), Vector3.new(x - 1.75, y - 0.05, z - 2.6), Color3.fromRGB(25, 25, 25), Enum.Material.Metal, { shape = Enum.PartType.Ball })
    _hospitalPart(prefix .. "_WheelB", Vector3.new(0.55, 0.55, 0.55), Vector3.new(x + 1.75, y - 0.05, z + 2.6), Color3.fromRGB(25, 25, 25), Enum.Material.Metal, { shape = Enum.PartType.Ball })
    _hospitalPart(prefix .. "_IvPole", Vector3.new(0.16, 4.6, 0.16), Vector3.new(side * 12.2, y + 2.2, z - 2.0), Color3.fromRGB(180, 185, 185), Enum.Material.Metal)
    _hospitalPart(prefix .. "_IvBag", Vector3.new(0.85, 1.05, 0.18), Vector3.new(side * 12.2, y + 4.15, z - 2.0), Color3.fromRGB(185, 255, 230), Enum.Material.Glass, { transparency = 0.35, noLight = false })
    local monitor = _hospitalPart(prefix .. "_MedicalMonitor", Vector3.new(2.2, 1.35, 0.25), Vector3.new(side * 12.8, y + 2.8, z + 2.3), Color3.fromRGB(12, 22, 20), Enum.Material.SmoothPlastic)
    _hospitalPart(prefix .. "_MonitorPulse", Vector3.new(1.65, 0.12, 0.13), Vector3.new(side * 12.78, y + 2.95, z + 2.12), Color3.fromRGB(80, 255, 130), Enum.Material.Neon, { noLight = false })
    _hospitalLight(monitor, 0.7, 9, Color3.fromRGB(90, 255, 150))
end

local function _hospitalCabinetStack(prefix, side, y, z)
    local x = side * 17.2
    _hospitalPart(prefix .. "_HospitalCabinet", Vector3.new(2.7, 4.2, 1.1), Vector3.new(x, y + 2.1, z), Color3.fromRGB(182, 194, 190), Enum.Material.Metal)
    _hospitalPart(prefix .. "_CabinetDoorL", Vector3.new(0.08, 3.6, 1.0), Vector3.new(x - 0.72, y + 2.1, z - 0.03), Color3.fromRGB(120, 146, 146), Enum.Material.SmoothPlastic, { transparency = 0.08 })
    _hospitalPart(prefix .. "_CabinetDoorR", Vector3.new(0.08, 3.6, 1.0), Vector3.new(x + 0.72, y + 2.1, z - 0.03), Color3.fromRGB(120, 146, 146), Enum.Material.SmoothPlastic, { transparency = 0.08 })
    _hospitalCross(prefix .. "_CabinetCross", Vector3.new(x, y + 3.65, z - 0.62), 0.5)
end

local function buildHospitalStageDressing(levelNum, basePos, endPos, levelType)
    local minZ = math.min(basePos.Z, endPos.Z)
    local maxZ = math.max(basePos.Z, endPos.Z)
    local length = math.max(28, maxZ - minZ + 22)
    local midZ = (minZ + maxZ) / 2
    local floorY = basePos.Y - 0.62

    _hospitalPart("HospitalTileFloor_" .. levelNum, Vector3.new(40, 0.18, length), Vector3.new(0, floorY, midZ), Color3.fromRGB(165, 178, 170), Enum.Material.Concrete, { transparency = 0.24 })
    _hospitalPart("HospitalCeilingPanel_" .. levelNum, Vector3.new(42, 0.24, length), Vector3.new(0, basePos.Y + 9.8, midZ), Color3.fromRGB(68, 76, 74), Enum.Material.Concrete, { transparency = 0.16 })
    _hospitalPart("HospitalWall_L_" .. levelNum, Vector3.new(1, 10, length), Vector3.new(-23, basePos.Y + 4, midZ), Color3.fromRGB(184, 194, 188), Enum.Material.Concrete, { transparency = 0.08 })
    _hospitalPart("HospitalWall_R_" .. levelNum, Vector3.new(1, 10, length), Vector3.new(23, basePos.Y + 4, midZ), Color3.fromRGB(184, 194, 188), Enum.Material.Concrete, { transparency = 0.08 })
    _hospitalPart("HospitalBlueStripe_L_" .. levelNum, Vector3.new(0.25, 0.55, length), Vector3.new(-22.35, basePos.Y + 4.6, midZ), Color3.fromRGB(70, 170, 190), Enum.Material.SmoothPlastic, { transparency = 0.05 })
    _hospitalPart("HospitalBlueStripe_R_" .. levelNum, Vector3.new(0.25, 0.55, length), Vector3.new(22.35, basePos.Y + 4.6, midZ), Color3.fromRGB(70, 170, 190), Enum.Material.SmoothPlastic, { transparency = 0.05 })

    for offset = -math.floor(length / 2) + 6, math.floor(length / 2) - 6, 8 do
        _hospitalPart("HospitalTileGrout_Z_" .. levelNum .. "_" .. tostring(offset), Vector3.new(39, 0.04, 0.08), Vector3.new(0, floorY + 0.12, midZ + offset), Color3.fromRGB(88, 104, 100), Enum.Material.SmoothPlastic, { transparency = 0.35 })
    end
    for x = -16, 16, 8 do
        _hospitalPart("HospitalTileGrout_X_" .. levelNum .. "_" .. tostring(x), Vector3.new(0.08, 0.04, length - 4), Vector3.new(x, floorY + 0.13, midZ), Color3.fromRGB(88, 104, 100), Enum.Material.SmoothPlastic, { transparency = 0.35 })
    end

    local lightCount = math.clamp(math.floor(length / 22), 1, 5)
    for i = 1, lightCount do
        local z = minZ + (i / (lightCount + 1)) * length
        local flicker = (i + levelNum) % 3 == 0
        local light = _hospitalPart("FlickerFluorescent_" .. levelNum .. "_" .. i, Vector3.new(7, 0.25, 0.8), Vector3.new(0, basePos.Y + 9.2, z), flicker and Color3.fromRGB(120, 255, 170) or Color3.fromRGB(185, 255, 230), Enum.Material.Neon, { noLight = false })
        _hospitalLight(light, flicker and 0.9 or 2.4, 22, light.Color)
        _hospitalPart("FluorescentFixture_" .. levelNum .. "_" .. i, Vector3.new(8.2, 0.18, 1.2), Vector3.new(0, basePos.Y + 9.37, z), Color3.fromRGB(58, 64, 65), Enum.Material.Metal, { transparency = 0.08 })
    end

    local roomSide = (levelNum % 2 == 1) and -1 or 1
    _hospitalDoorFrame("HospitalDoorFrame_" .. levelNum, roomSide, basePos.Y, midZ - math.min(length * 0.18, 9), levelNum > TOTAL_LEVELS - 3 and "ROOF EXIT" or "WARD " .. tostring(levelNum))
    _hospitalBedCluster("HospitalPatientRoom_" .. levelNum, roomSide, basePos.Y, midZ + math.min(length * 0.12, 7))
    _hospitalCabinetStack("HospitalCabinetStack_" .. levelNum, -roomSide, basePos.Y, midZ - math.min(length * 0.12, 7))

    if levelNum % 2 == 1 then
        _hospitalPart("BrokenHospitalBedRail_" .. levelNum, Vector3.new(0.18, 1.0, 5.8), Vector3.new(roomSide * 12.6, basePos.Y + 1.6, midZ + 6), Color3.fromRGB(120, 125, 125), Enum.Material.Metal)
        _hospitalPart("WallMedicalChart_" .. levelNum, Vector3.new(0.12, 2.1, 1.55), Vector3.new(-roomSide * 22.25, basePos.Y + 4.3, midZ + 6), Color3.fromRGB(240, 248, 245), Enum.Material.SmoothPlastic, { transparency = 0.05 })
    else
        local wireZ = midZ + math.random(-math.floor(length / 5), math.floor(length / 5))
        _hospitalPart("HangingWireA_" .. levelNum, Vector3.new(0.22, 7, 0.22), Vector3.new(-8, basePos.Y + 5.2, wireZ), Color3.fromRGB(25, 25, 25), Enum.Material.Metal)
        _hospitalPart("HangingWireB_" .. levelNum, Vector3.new(0.22, 5, 0.22), Vector3.new(8, basePos.Y + 5.8, wireZ + 6), Color3.fromRGB(25, 25, 25), Enum.Material.Metal)
        _hospitalPart("WireSpark_" .. levelNum, Vector3.new(1.2, 1.2, 1.2), Vector3.new(-8, basePos.Y + 1.7, wireZ), Color3.fromRGB(80, 255, 180), Enum.Material.Neon, { shape = Enum.PartType.Ball, noLight = false })
    end

    if levelNum % 3 == 0 or levelType == "lava_run" then
        local spill = _hospitalPart("ToxicGreenSpill_" .. levelNum, Vector3.new(10, 0.25, 7), Vector3.new(math.random(-7, 7), basePos.Y - 1.05, midZ), Color3.fromRGB(55, 255, 85), Enum.Material.Neon, { transparency = 0.18, noLight = false })
        _hospitalLight(spill, 2.2, 18, Color3.fromRGB(80, 255, 120))
    end

    if levelNum % 4 == 1 then
        local sign = _hospitalPart("EmergencySign_" .. levelNum, Vector3.new(6, 2.2, 0.35), Vector3.new(-22.1, basePos.Y + 6.8, midZ), Color3.fromRGB(170, 30, 35), Enum.Material.Neon, { noLight = false })
        _hospitalWallSign(sign, levelNum > TOTAL_LEVELS - 3 and "ROOF EXIT" or "WARD " .. tostring(levelNum), Color3.fromRGB(255, 235, 235))
    end
end

local function buildHospitalSpawnLobby(spawnCenter)
    local y = spawnCenter.Y
    _hospitalPart("HospitalLobbyTileFloor", Vector3.new(54, 0.22, 42), Vector3.new(0, y - 0.7, -8), Color3.fromRGB(172, 184, 178), Enum.Material.Concrete, { transparency = 0.16 })
    _hospitalPart("HospitalLobbyBackWall", Vector3.new(54, 9, 1), Vector3.new(0, y + 4, -28), Color3.fromRGB(184, 194, 188), Enum.Material.Concrete, { transparency = 0.08 })
    _hospitalPart("HospitalLobbyLeftWall", Vector3.new(1, 9, 42), Vector3.new(-27, y + 4, -8), Color3.fromRGB(184, 194, 188), Enum.Material.Concrete, { transparency = 0.08 })
    _hospitalPart("HospitalLobbyRightWall", Vector3.new(1, 9, 42), Vector3.new(27, y + 4, -8), Color3.fromRGB(184, 194, 188), Enum.Material.Concrete, { transparency = 0.08 })
    local entryBanner = _hospitalPart("HospitalEmergencyOverheadBanner", Vector3.new(26, 4.2, 0.45), Vector3.new(0, y + 11.2, -16), Color3.fromRGB(25, 72, 70), Enum.Material.SmoothPlastic, { noLight = false })
    _hospitalSurfaceLabel(entryBanner, "HOSPITAL EMERGENCY", Color3.fromRGB(210, 255, 225))
    _hospitalLight(entryBanner, 1.5, 20, Color3.fromRGB(110, 255, 185))
    _hospitalPart("HospitalEmergencyBannerPost_L", Vector3.new(0.65, 9.2, 0.65), Vector3.new(-13.6, y + 6.6, -16), Color3.fromRGB(90, 98, 96), Enum.Material.Metal)
    _hospitalPart("HospitalEmergencyBannerPost_R", Vector3.new(0.65, 9.2, 0.65), Vector3.new(13.6, y + 6.6, -16), Color3.fromRGB(90, 98, 96), Enum.Material.Metal)
    local desk = _hospitalPart("HospitalLobbyReceptionDesk", Vector3.new(18, 2.2, 4), Vector3.new(0, y + 0.9, -19), Color3.fromRGB(130, 154, 152), Enum.Material.SmoothPlastic)
    _hospitalPart("HospitalLobbyDeskTop", Vector3.new(19, 0.35, 4.8), Vector3.new(0, y + 2.2, -19), Color3.fromRGB(215, 225, 218), Enum.Material.Marble)
    _hospitalPart("HospitalLobbyComputer", Vector3.new(2.5, 1.6, 0.25), Vector3.new(-5, y + 3.15, -17.4), Color3.fromRGB(10, 22, 20), Enum.Material.SmoothPlastic)
    _hospitalPart("HospitalLobbyKeyboard", Vector3.new(2.8, 0.12, 0.85), Vector3.new(-5, y + 2.55, -16.7), Color3.fromRGB(30, 36, 36), Enum.Material.SmoothPlastic)
    _hospitalWallSign(desk, "CHECK-IN / EMERGENCY", Color3.fromRGB(210, 255, 225))
    _hospitalCross("HospitalLobbyRedCross", Vector3.new(0, y + 6.2, -27.35), 1.35)
    for i = 1, 4 do
        local x = -16 + (i - 1) * 6
        _hospitalPart("HospitalWaitingChair_" .. i .. "_Seat", Vector3.new(3.6, 0.45, 3.0), Vector3.new(x, y + 0.15, -3), Color3.fromRGB(72, 135, 150), Enum.Material.SmoothPlastic)
        _hospitalPart("HospitalWaitingChair_" .. i .. "_Back", Vector3.new(3.6, 3.2, 0.35), Vector3.new(x, y + 1.65, -4.35), Color3.fromRGB(72, 135, 150), Enum.Material.SmoothPlastic)
    end
    _hospitalDoorFrame("HospitalLobbyEmergencyDoors", 1, y, -24, "ER")
    _hospitalDoorFrame("HospitalLobbyExitDoors", -1, y, -24, "EXIT")
    for i = 1, 5 do
        local z = -24 + i * 7
        _hospitalPart("HospitalLobbyTileGrout_" .. i, Vector3.new(52, 0.05, 0.08), Vector3.new(0, y - 0.52, z), Color3.fromRGB(88, 104, 100), Enum.Material.SmoothPlastic, { transparency = 0.3 })
    end
    local light = _hospitalPart("HospitalLobbyFluorescentMain", Vector3.new(13, 0.25, 1.0), Vector3.new(0, y + 9.1, -12), Color3.fromRGB(185, 255, 230), Enum.Material.Neon, { noLight = false })
    _hospitalLight(light, 2.8, 34, Color3.fromRGB(185, 255, 230))
end

local function buildHospitalCheckpointDressing(checkpointNum, position)
    local y = position.Y
    local z = position.Z
    _hospitalPart("HospitalCheckpointNurseStation_" .. checkpointNum, Vector3.new(14, 2.0, 3.5), Vector3.new(0, y + 1.1, z + 11), Color3.fromRGB(128, 150, 148), Enum.Material.SmoothPlastic)
    _hospitalPart("HospitalCheckpointStationTop_" .. checkpointNum, Vector3.new(15, 0.3, 4.2), Vector3.new(0, y + 2.25, z + 11), Color3.fromRGB(218, 228, 220), Enum.Material.Marble)
    _hospitalPart("HospitalCheckpointClipboard_" .. checkpointNum, Vector3.new(1.5, 0.08, 2.0), Vector3.new(-4, y + 2.55, z + 9.5), Color3.fromRGB(244, 248, 238), Enum.Material.SmoothPlastic)
    _hospitalPart("HospitalCheckpointDefib_" .. checkpointNum, Vector3.new(2.2, 1.4, 1.1), Vector3.new(5, y + 3.0, z + 10.6), Color3.fromRGB(205, 48, 52), Enum.Material.SmoothPlastic)
    _hospitalCross("HospitalCheckpointCross_" .. checkpointNum, Vector3.new(5, y + 3.1, z + 10.0), 0.55)
    local sign = _hospitalPart("HospitalCheckpointSign_" .. checkpointNum, Vector3.new(8, 1.8, 0.3), Vector3.new(0, y + 5.3, z + 12.8), Color3.fromRGB(28, 38, 40), Enum.Material.Neon, { noLight = false })
    _hospitalWallSign(sign, "CHECKPOINT / NURSE", Color3.fromRGB(165, 255, 195))
end

local function buildHospitalRescueFinish(position)
    _hospitalPart("RescueHelipad", Vector3.new(32, 0.35, 32), position + Vector3.new(0, -1.35, 0), Color3.fromRGB(35, 45, 42), Enum.Material.Concrete, { transparency = 0.18 })
    local pad = _hospitalPart("RescueHelipadH", Vector3.new(18, 0.18, 3), position + Vector3.new(0, -1.05, 0), Color3.fromRGB(235, 245, 235), Enum.Material.Neon, { noLight = false })
    _hospitalWallSign(pad, "RESCUE", Color3.fromRGB(160, 255, 190))

    local body = _hospitalPart("RescueHelicopterBody", Vector3.new(10, 3, 4), position + Vector3.new(0, 8, -6), Color3.fromRGB(240, 245, 235), Enum.Material.Metal, { canCollide = false })
    _hospitalPart("RescueHelicopterNose", Vector3.new(3, 2.4, 3), position + Vector3.new(0, 8, -11), Color3.fromRGB(80, 170, 190), Enum.Material.Glass, { shape = Enum.PartType.Ball, transparency = 0.25 })
    _hospitalPart("RescueHelicopterTail", Vector3.new(2, 1, 10), position + Vector3.new(0, 8, 2), Color3.fromRGB(220, 235, 230), Enum.Material.Metal)
    _hospitalPart("RescueRotorA", Vector3.new(24, 0.25, 1), position + Vector3.new(0, 10.1, -6), Color3.fromRGB(35, 35, 35), Enum.Material.Metal)
    _hospitalPart("RescueRotorB", Vector3.new(1, 0.25, 24), position + Vector3.new(0, 10.15, -6), Color3.fromRGB(35, 35, 35), Enum.Material.Metal)
    local light = _hospitalPart("RescueSearchLight", Vector3.new(1.6, 1.6, 1.6), position + Vector3.new(0, 6.3, -10), Color3.fromRGB(160, 255, 190), Enum.Material.Neon, { shape = Enum.PartType.Ball, noLight = false })
    local pl = light:FindFirstChildOfClass("PointLight")
    if pl then
        pl.Brightness = 3
        pl.Range = 30
        pl.Color = Color3.fromRGB(160, 255, 190)
    end
    if body then body.Name = "RescueHelicopterBody_HospitalWin" end
end
` : `
local function buildHospitalStageDressing(levelNum, basePos, endPos, levelType) end
local function buildHospitalSpawnLobby(spawnCenter) end
local function buildHospitalCheckpointDressing(checkpointNum, position) end
local function buildHospitalRescueFinish(position) end
`;

  const schoolDressingLua = isSchoolHorror ? `
-- ═══════════════════════════════════════════
-- SCHOOL HORROR ENVIRONMENTAL DRESSING
-- Makes a haunted school obby read as a school: lockers, classrooms,
-- chalkboards, desks, detention signs, ceiling lights, bell props, and an exit bus.
-- ═══════════════════════════════════════════
local SCHOOL_SET_DRESSING_VERSION = 1

local function _schoolPart(name, size, position, color, material, extra)
    extra = extra or {}
    extra.name = name
    extra.size = size
    extra.position = position
    extra.cframe = extra.cframe or CFrame.new(position)
    extra.color = color
    extra.material = material or Enum.Material.Concrete
    if extra.canCollide == nil then extra.canCollide = false end
    extra.noSparkles = true
    extra.noLight = extra.noLight ~= false
    return makePart(extra)
end

local function _schoolLight(part, brightness, range, color)
    if not part then return end
    local pl = part:FindFirstChildOfClass("PointLight") or Instance.new("PointLight")
    pl.Parent = part
    pl.Brightness = brightness or 1.5
    pl.Range = range or 18
    pl.Color = color or part.Color
end

local function _schoolSign(parentPart, text, color)
    if not parentPart then return end
    local bb = Instance.new("BillboardGui")
    bb.Name = "SchoolSign"
    bb.Size = UDim2.new(0, 180, 0, 38)
    bb.StudsOffset = Vector3.new(0, 3.3, 0)
    bb.MaxDistance = 55
    bb.AlwaysOnTop = false
    bb.Parent = parentPart
    local label = Instance.new("TextLabel")
    label.Size = UDim2.new(1, 0, 1, 0)
    label.BackgroundColor3 = Color3.fromRGB(20, 28, 24)
    label.BackgroundTransparency = 0.15
    label.Text = text
    label.TextColor3 = color or Color3.fromRGB(190, 255, 220)
    label.TextStrokeTransparency = 0.3
    label.TextScaled = true
    label.Font = Enum.Font.GothamBold
    label.Parent = bb
end

local function _schoolSurfaceLabel(parentPart, text, color)
    if not parentPart then return end
    local gui = Instance.new("SurfaceGui")
    gui.Name = "SchoolSurfaceLabel"
    gui.Face = Enum.NormalId.Front
    gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
    gui.PixelsPerStud = 48
    gui.LightInfluence = 0.15
    gui.Parent = parentPart
    local label = Instance.new("TextLabel")
    label.Size = UDim2.new(1, -24, 1, -16)
    label.Position = UDim2.new(0, 12, 0, 8)
    label.BackgroundTransparency = 1
    label.Text = text
    label.TextColor3 = color or Color3.fromRGB(220, 255, 200)
    label.TextStrokeTransparency = 0.2
    label.TextScaled = true
    label.TextWrapped = true
    label.Font = Enum.Font.GothamBlack
    label.Parent = gui
end

local function _schoolLockerRow(prefix, side, y, z)
    local x = side * 19.8
    for i = 1, 5 do
        local lockerZ = z + (i - 3) * 2.7
        _schoolPart(prefix .. "_Locker_" .. i, Vector3.new(0.75, 5.4, 2.2), Vector3.new(x, y + 2.7, lockerZ), Color3.fromRGB(52, 72, 88), Enum.Material.Metal)
        _schoolPart(prefix .. "_LockerVent_" .. i, Vector3.new(0.1, 0.12, 1.2), Vector3.new(side * 19.35, y + 4.4, lockerZ), Color3.fromRGB(25, 32, 38), Enum.Material.SmoothPlastic)
        _schoolPart(prefix .. "_LockerHandle_" .. i, Vector3.new(0.12, 0.55, 0.12), Vector3.new(side * 19.3, y + 2.8, lockerZ + 0.55), Color3.fromRGB(190, 200, 195), Enum.Material.Metal)
    end
end

local function _schoolDeskCluster(prefix, side, y, z)
    local x0 = side * 11.5
    for i = 1, 3 do
        local dz = (i - 2) * 3.4
        _schoolPart(prefix .. "_DeskTop_" .. i, Vector3.new(3.2, 0.35, 2.1), Vector3.new(x0, y + 1.45, z + dz), Color3.fromRGB(128, 98, 62), Enum.Material.Wood)
        _schoolPart(prefix .. "_DeskLegA_" .. i, Vector3.new(0.18, 1.4, 0.18), Vector3.new(x0 - 1.2, y + 0.75, z + dz - 0.72), Color3.fromRGB(48, 48, 48), Enum.Material.Metal)
        _schoolPart(prefix .. "_DeskLegB_" .. i, Vector3.new(0.18, 1.4, 0.18), Vector3.new(x0 + 1.2, y + 0.75, z + dz + 0.72), Color3.fromRGB(48, 48, 48), Enum.Material.Metal)
        _schoolPart(prefix .. "_Chair_" .. i, Vector3.new(2.3, 0.35, 1.8), Vector3.new(x0 + side * 2.6, y + 0.8, z + dz), Color3.fromRGB(72, 92, 110), Enum.Material.SmoothPlastic)
    end
end

local function _schoolBlackboard(prefix, side, y, z, text)
    local x = side * 21.8
    local board = _schoolPart(prefix .. "_Blackboard", Vector3.new(0.32, 3.4, 8.2), Vector3.new(x, y + 4.2, z), Color3.fromRGB(20, 72, 48), Enum.Material.SmoothPlastic)
    _schoolPart(prefix .. "_ChalkTray", Vector3.new(0.4, 0.18, 8.8), Vector3.new(side * 21.55, y + 2.35, z), Color3.fromRGB(210, 210, 185), Enum.Material.Wood)
    _schoolSign(board, text or "CLASS 13", Color3.fromRGB(235, 255, 220))
end

local function _schoolClassDoor(prefix, side, y, z, label)
    local x = side * 21.8
    local door = _schoolPart(prefix .. "_ClassroomDoor", Vector3.new(0.38, 5.4, 3.6), Vector3.new(x, y + 2.7, z), Color3.fromRGB(88, 64, 44), Enum.Material.Wood, { transparency = 0.04 })
    _schoolPart(prefix .. "_DoorWindow", Vector3.new(0.12, 1.0, 1.05), Vector3.new(side * 21.45, y + 3.8, z), Color3.fromRGB(120, 220, 205), Enum.Material.Glass, { transparency = 0.38, noLight = false })
    _schoolSign(door, label or "ROOM 13", Color3.fromRGB(255, 245, 180))
end

local function buildSchoolStageDressing(levelNum, basePos, endPos, levelType)
    local minZ = math.min(basePos.Z, endPos.Z)
    local maxZ = math.max(basePos.Z, endPos.Z)
    local length = math.max(30, maxZ - minZ + 24)
    local midZ = (minZ + maxZ) / 2
    local floorY = basePos.Y - 0.66

    _schoolPart("SchoolHallwayFloor_" .. levelNum, Vector3.new(42, 0.18, length), Vector3.new(0, floorY, midZ), Color3.fromRGB(116, 122, 102), Enum.Material.Concrete, { transparency = 0.14 })
    _schoolPart("SchoolCeiling_" .. levelNum, Vector3.new(44, 0.22, length), Vector3.new(0, basePos.Y + 9.5, midZ), Color3.fromRGB(38, 44, 44), Enum.Material.Concrete, { transparency = 0.12 })
    _schoolPart("SchoolWall_L_" .. levelNum, Vector3.new(1, 9.5, length), Vector3.new(-22, basePos.Y + 4, midZ), Color3.fromRGB(70, 82, 78), Enum.Material.Concrete, { transparency = 0.05 })
    _schoolPart("SchoolWall_R_" .. levelNum, Vector3.new(1, 9.5, length), Vector3.new(22, basePos.Y + 4, midZ), Color3.fromRGB(70, 82, 78), Enum.Material.Concrete, { transparency = 0.05 })
    _schoolPart("SchoolWallStripe_L_" .. levelNum, Vector3.new(0.18, 0.5, length), Vector3.new(-21.45, basePos.Y + 4.2, midZ), Color3.fromRGB(190, 170, 90), Enum.Material.SmoothPlastic)
    _schoolPart("SchoolWallStripe_R_" .. levelNum, Vector3.new(0.18, 0.5, length), Vector3.new(21.45, basePos.Y + 4.2, midZ), Color3.fromRGB(190, 170, 90), Enum.Material.SmoothPlastic)

    for offset = -math.floor(length / 2) + 5, math.floor(length / 2) - 5, 7 do
        _schoolPart("SchoolFloorTileLine_" .. levelNum .. "_" .. tostring(offset), Vector3.new(40, 0.04, 0.08), Vector3.new(0, floorY + 0.12, midZ + offset), Color3.fromRGB(52, 62, 58), Enum.Material.SmoothPlastic, { transparency = 0.3 })
    end

    local lightCount = math.clamp(math.floor(length / 20), 1, 5)
    for i = 1, lightCount do
        local z = minZ + (i / (lightCount + 1)) * length
        local flicker = (i + levelNum) % 3 == 0
        local light = _schoolPart("SchoolFlickerLight_" .. levelNum .. "_" .. i, Vector3.new(6.8, 0.22, 0.75), Vector3.new(0, basePos.Y + 8.9, z), flicker and Color3.fromRGB(80, 255, 180) or Color3.fromRGB(210, 240, 205), Enum.Material.Neon, { noLight = false })
        _schoolLight(light, flicker and 0.8 or 2.0, 20, light.Color)
    end

    local roomSide = (levelNum % 2 == 0) and -1 or 1
    _schoolLockerRow("SchoolLockerRow_" .. levelNum, -roomSide, basePos.Y, midZ)
    _schoolDeskCluster("SchoolDesks_" .. levelNum, roomSide, basePos.Y, midZ + 3)
    _schoolBlackboard("SchoolBoard_" .. levelNum, roomSide, basePos.Y, midZ - 7, levelNum > TOTAL_LEVELS - 3 and "EXIT EXAM" or "LESSON " .. tostring(levelNum))
    _schoolClassDoor("SchoolDoor_" .. levelNum, -roomSide, basePos.Y, midZ - math.min(9, length * 0.2), levelNum % 4 == 0 and "DETENTION" or "CLASS " .. tostring(levelNum))

    if levelNum % 3 == 0 or levelType == "disappearing" then
        _schoolPart("ScatteredHomework_" .. levelNum, Vector3.new(8, 0.08, 5), Vector3.new(math.random(-5, 5), floorY + 0.25, midZ + 5), Color3.fromRGB(230, 225, 190), Enum.Material.SmoothPlastic, { transparency = 0.12 })
    end
    if levelNum % 4 == 1 then
        local sign = _schoolPart("DetentionWarningSign_" .. levelNum, Vector3.new(7, 1.8, 0.32), Vector3.new(-21.3, basePos.Y + 6.5, midZ), Color3.fromRGB(90, 24, 24), Enum.Material.Neon, { noLight = false })
        _schoolSign(sign, "DETENTION", Color3.fromRGB(255, 220, 160))
    end
end

local function buildSchoolSpawnLobby(spawnCenter)
    local y = spawnCenter.Y
    _schoolPart("SchoolLobbyFloor", Vector3.new(54, 0.22, 42), Vector3.new(0, y - 0.7, -8), Color3.fromRGB(112, 118, 100), Enum.Material.Concrete, { transparency = 0.12 })
    _schoolPart("SchoolLobbyBackWall", Vector3.new(54, 9, 1), Vector3.new(0, y + 4, -28), Color3.fromRGB(68, 80, 76), Enum.Material.Concrete)
    _schoolPart("SchoolLobbyLeftWall", Vector3.new(1, 9, 42), Vector3.new(-27, y + 4, -8), Color3.fromRGB(68, 80, 76), Enum.Material.Concrete)
    _schoolPart("SchoolLobbyRightWall", Vector3.new(1, 9, 42), Vector3.new(27, y + 4, -8), Color3.fromRGB(68, 80, 76), Enum.Material.Concrete)
    local frontBoard = _schoolPart("HauntedSchoolEntranceBanner", Vector3.new(26, 4.2, 0.45), Vector3.new(0, y + 11.2, -16), Color3.fromRGB(18, 72, 48), Enum.Material.SmoothPlastic)
    _schoolSurfaceLabel(frontBoard, "HAUNTED SCHOOL ENTRANCE", Color3.fromRGB(220, 255, 200))
    _schoolLight(frontBoard, 1.5, 20, Color3.fromRGB(110, 255, 185))
    _schoolPart("SchoolEntranceBannerPost_L", Vector3.new(0.65, 9.2, 0.65), Vector3.new(-13.6, y + 6.6, -16), Color3.fromRGB(82, 64, 42), Enum.Material.Wood)
    _schoolPart("SchoolEntranceBannerPost_R", Vector3.new(0.65, 9.2, 0.65), Vector3.new(13.6, y + 6.6, -16), Color3.fromRGB(82, 64, 42), Enum.Material.Wood)
    _schoolLockerRow("SchoolLobbyLockerLeft", -1, y, -12)
    _schoolLockerRow("SchoolLobbyLockerRight", 1, y, -12)
    _schoolBlackboard("SchoolLobbyBoard", -1, y, -23, "FIND THE EXIT")
    _schoolClassDoor("SchoolLobbyOfficeDoor", 1, y, -23, "PRINCIPAL")
    local bell = _schoolPart("SchoolLobbyBell", Vector3.new(2.2, 2.2, 2.2), Vector3.new(0, y + 4.2, -18), Color3.fromRGB(205, 170, 75), Enum.Material.Metal, { shape = Enum.PartType.Ball, noLight = false })
    _schoolLight(bell, 1.1, 14, Color3.fromRGB(255, 225, 120))
end

local function buildSchoolCheckpointDressing(checkpointNum, position)
    local y = position.Y
    local z = position.Z
    local desk = _schoolPart("SchoolCheckpointDesk_" .. checkpointNum, Vector3.new(12, 1.8, 3.4), Vector3.new(0, y + 1.0, z + 10), Color3.fromRGB(112, 82, 54), Enum.Material.Wood)
    _schoolPart("SchoolCheckpointBook_" .. checkpointNum, Vector3.new(2.4, 0.18, 1.8), Vector3.new(-3.2, y + 2.0, z + 9.3), Color3.fromRGB(230, 215, 150), Enum.Material.Wood)
    _schoolPart("SchoolCheckpointChalk_" .. checkpointNum, Vector3.new(2.6, 0.12, 0.18), Vector3.new(3.0, y + 2.1, z + 9.1), Color3.fromRGB(238, 238, 210), Enum.Material.SmoothPlastic)
    _schoolSign(desk, "CHECKPOINT / HOME ROOM", Color3.fromRGB(210, 255, 220))
end

local function buildSchoolRescueFinish(position)
    _schoolPart("SchoolExitCourtyard", Vector3.new(34, 0.35, 30), position + Vector3.new(0, -1.35, 0), Color3.fromRGB(78, 92, 76), Enum.Material.Concrete, { transparency = 0.12 })
    local sign = _schoolPart("SchoolFinalExitSign", Vector3.new(18, 2.5, 0.45), position + Vector3.new(0, 3.5, -10), Color3.fromRGB(18, 86, 50), Enum.Material.Neon, { noLight = false })
    _schoolSign(sign, "SCHOOL EXIT", Color3.fromRGB(230, 255, 210))
    _schoolPart("SchoolBusBody", Vector3.new(18, 5, 7), position + Vector3.new(0, 3.2, 9), Color3.fromRGB(232, 180, 42), Enum.Material.Metal)
    _schoolPart("SchoolBusWindowA", Vector3.new(15, 1.6, 0.22), position + Vector3.new(0, 4.3, 5.35), Color3.fromRGB(95, 190, 210), Enum.Material.Glass, { transparency = 0.3 })
    _schoolPart("SchoolBusWheelA", Vector3.new(2.2, 2.2, 2.2), position + Vector3.new(-6, 0.6, 5.0), Color3.fromRGB(20, 20, 20), Enum.Material.Metal, { shape = Enum.PartType.Ball })
    _schoolPart("SchoolBusWheelB", Vector3.new(2.2, 2.2, 2.2), position + Vector3.new(6, 0.6, 5.0), Color3.fromRGB(20, 20, 20), Enum.Material.Metal, { shape = Enum.PartType.Ball })
end
` : `
local function buildSchoolStageDressing(levelNum, basePos, endPos, levelType) end
local function buildSchoolSpawnLobby(spawnCenter) end
local function buildSchoolCheckpointDressing(checkpointNum, position) end
local function buildSchoolRescueFinish(position) end
`;

  const labDressingLua = isLabHorror ? `
-- ═══════════════════════════════════════════
-- ABANDONED LAB HORROR ENVIRONMENTAL DRESSING
-- Deterministic 3D lab set dressing replaces noisy catalog/AI decals:
-- containment walls, broken consoles, specimen tanks, pipes, chemical spills,
-- hazard signs, and green/cyan lab lighting.
-- ═══════════════════════════════════════════
local LAB_SET_DRESSING_VERSION = 1
local LAB_MONSTER_SET_DRESSING_VERSION = ${wantsMonsterLab ? '1' : '0'}

local function _labPart(name, size, position, color, material, extra)
    extra = extra or {}
    extra.name = name
    extra.size = size
    extra.position = position
    extra.cframe = extra.cframe or CFrame.new(position)
    extra.color = color
    extra.material = material or Enum.Material.Metal
    if extra.canCollide == nil then extra.canCollide = false end
    extra.noSparkles = true
    extra.noLight = extra.noLight ~= false
    return makePart(extra)
end

local function _labLight(part, brightness, range, color)
    if not part then return end
    local pl = part:FindFirstChildOfClass("PointLight") or Instance.new("PointLight")
    pl.Parent = part
    pl.Brightness = brightness or 1.8
    pl.Range = range or 20
    pl.Color = color or part.Color
end

local function _labSurfaceLabel(parentPart, text, color)
    if not parentPart then return end
    local gui = Instance.new("SurfaceGui")
    gui.Name = "LabSurfaceLabel"
    gui.Face = Enum.NormalId.Front
    gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
    gui.PixelsPerStud = 48
    gui.LightInfluence = 0.08
    gui.Parent = parentPart
    local label = Instance.new("TextLabel")
    label.Size = UDim2.new(1, -20, 1, -14)
    label.Position = UDim2.new(0, 10, 0, 7)
    label.BackgroundTransparency = 1
    label.Text = text
    label.TextColor3 = color or Color3.fromRGB(210, 245, 240)
    label.TextStrokeTransparency = 0.2
    label.TextScaled = true
    label.TextWrapped = true
    label.Font = Enum.Font.GothamBlack
    label.Parent = gui
end

local function _labBillboard(parentPart, text, color)
    if not parentPart then return end
    local bb = Instance.new("BillboardGui")
    bb.Name = "LabSign"
    bb.Size = UDim2.new(0, 180, 0, 38)
    bb.StudsOffset = Vector3.new(0, 3.2, 0)
    bb.MaxDistance = 60
    bb.AlwaysOnTop = false
    bb.Parent = parentPart
    local label = Instance.new("TextLabel")
    label.Size = UDim2.new(1, 0, 1, 0)
    label.BackgroundColor3 = Color3.fromRGB(10, 22, 20)
    label.BackgroundTransparency = 0.15
    label.Text = text
    label.TextColor3 = color or Color3.fromRGB(220, 245, 235)
    label.TextStrokeTransparency = 0.25
    label.TextScaled = true
    label.Font = Enum.Font.GothamBold
    label.Parent = bb
end

local function _labHazardStripe(prefix, y, z, length)
    for i = 1, math.max(2, math.floor(length / 18)) do
        local stripeZ = z - length / 2 + i * (length / (math.max(2, math.floor(length / 18)) + 1))
        local stripe = _labPart(prefix .. "_HazardStripe_" .. i, Vector3.new(17, 0.1, 0.9), Vector3.new(0, y, stripeZ), Color3.fromRGB(210, 190, 40), Enum.Material.Neon, { noLight = false })
        stripe.Orientation = Vector3.new(0, 18, 0)
        _labLight(stripe, 0.65, 11, Color3.fromRGB(210, 190, 40))
    end
end

local function _labConsole(prefix, side, y, z, label)
    local x = side * 15.5
    local base = _labPart(prefix .. "_ConsoleBase", Vector3.new(4.8, 2.4, 2.4), Vector3.new(x, y + 1.1, z), Color3.fromRGB(36, 44, 46), Enum.Material.Metal)
    local screen = _labPart(prefix .. "_ConsoleScreen", Vector3.new(4.2, 1.55, 0.18), Vector3.new(x, y + 2.65, z - side * 1.25), Color3.fromRGB(8, 24, 18), Enum.Material.Neon, { noLight = false })
    _labSurfaceLabel(screen, label or "SYSTEM FAIL", Color3.fromRGB(120, 235, 235))
    _labLight(screen, 1.25, 14, Color3.fromRGB(80, 220, 235))
    _labPart(prefix .. "_Keyboard", Vector3.new(3.6, 0.15, 1.0), Vector3.new(x, y + 2.25, z + side * 0.35), Color3.fromRGB(12, 16, 18), Enum.Material.Metal)
    _labPart(prefix .. "_CableA", Vector3.new(0.18, 0.18, 5.5), Vector3.new(x - side * 2.4, y + 0.45, z + 1.7), Color3.fromRGB(20, 20, 20), Enum.Material.Metal)
    return base
end

local function _labMonsterSpecimen(prefix, x, y, z)
    local body = _labPart(prefix .. "_LabMonsterSpecimenBody", Vector3.new(1.45, 2.35, 1.05), Vector3.new(x, y + 3.15, z), Color3.fromRGB(86, 120, 104), Enum.Material.SmoothPlastic, { transparency = 0.12, noLight = false })
    _labPart(prefix .. "_LabMonsterSpecimenHead", Vector3.new(1.15, 1.05, 1.05), Vector3.new(x, y + 4.65, z), Color3.fromRGB(118, 146, 128), Enum.Material.SmoothPlastic, { shape = Enum.PartType.Ball, transparency = 0.12 })
    _labPart(prefix .. "_LabMonsterSpecimenEyeL", Vector3.new(0.18, 0.22, 0.08), Vector3.new(x - 0.26, y + 4.75, z - 0.52), Color3.fromRGB(255, 70, 48), Enum.Material.Neon, { noLight = false })
    _labPart(prefix .. "_LabMonsterSpecimenEyeR", Vector3.new(0.18, 0.22, 0.08), Vector3.new(x + 0.26, y + 4.75, z - 0.52), Color3.fromRGB(255, 70, 48), Enum.Material.Neon, { noLight = false })
    _labPart(prefix .. "_LabMonsterSpecimenClawL", Vector3.new(0.16, 0.85, 0.16), Vector3.new(x - 1.0, y + 2.3, z - 0.25), Color3.fromRGB(215, 185, 70), Enum.Material.Metal)
    _labPart(prefix .. "_LabMonsterSpecimenClawR", Vector3.new(0.16, 0.85, 0.16), Vector3.new(x + 1.0, y + 2.3, z - 0.25), Color3.fromRGB(215, 185, 70), Enum.Material.Metal)
    _labLight(body, 0.75, 10, Color3.fromRGB(100, 220, 225))
end

local function _labSpecimenTank(prefix, side, y, z)
    local x = side * 18
    local glass = _labPart(prefix .. "_SpecimenTankGlass", Vector3.new(4.2, 7.2, 4.2), Vector3.new(x, y + 3.6, z), Color3.fromRGB(82, 215, 225), Enum.Material.Glass, { shape = Enum.PartType.Cylinder, transparency = 0.48, noLight = false })
    _labLight(glass, 1.8, 20, Color3.fromRGB(80, 215, 225))
    _labPart(prefix .. "_TankTop", Vector3.new(4.8, 0.45, 4.8), Vector3.new(x, y + 7.4, z), Color3.fromRGB(70, 82, 84), Enum.Material.Metal, { shape = Enum.PartType.Cylinder })
    _labPart(prefix .. "_TankBottom", Vector3.new(5.0, 0.55, 5.0), Vector3.new(x, y - 0.1, z), Color3.fromRGB(70, 82, 84), Enum.Material.Metal, { shape = Enum.PartType.Cylinder })
    if LAB_MONSTER_SET_DRESSING_VERSION == 1 then
        _labMonsterSpecimen(prefix, x, y, z)
    else
        local sample = _labPart(prefix .. "_FloatingSpecimen", Vector3.new(1.3, 2.2, 1.3), Vector3.new(x, y + 3.7, z), Color3.fromRGB(170, 215, 205), Enum.Material.Neon, { shape = Enum.PartType.Ball, transparency = 0.18, noLight = false })
        _labLight(sample, 0.9, 10, Color3.fromRGB(140, 220, 210))
    end
end

local function _labPipeRun(prefix, side, y, z, length)
    local x = side * 21.0
    _labPart(prefix .. "_PipeMain", Vector3.new(0.75, 0.75, length), Vector3.new(x, y + 7.0, z), Color3.fromRGB(82, 92, 94), Enum.Material.Metal, { shape = Enum.PartType.Cylinder })
    for i = 1, 3 do
        local dz = z - length / 2 + i * length / 4
        local valve = _labPart(prefix .. "_Valve_" .. i, Vector3.new(1.3, 1.3, 1.3), Vector3.new(x, y + 7.0, dz), Color3.fromRGB(210, 170, 55), Enum.Material.Neon, { shape = Enum.PartType.Ball, noLight = false })
        _labLight(valve, 0.65, 10, Color3.fromRGB(210, 170, 55))
    end
end

local function _labContainmentDoor(prefix, side, y, z, label)
    local x = side * 22.2
    local door = _labPart(prefix .. "_ContainmentDoor", Vector3.new(0.42, 6.4, 5.2), Vector3.new(x, y + 3.2, z), Color3.fromRGB(64, 72, 74), Enum.Material.Metal)
    local window = _labPart(prefix .. "_DoorWindow", Vector3.new(0.12, 1.2, 1.6), Vector3.new(side * 21.9, y + 4.2, z), Color3.fromRGB(105, 220, 235), Enum.Material.Glass, { transparency = 0.35, noLight = false })
    _labSurfaceLabel(door, label or "CONTAINMENT", Color3.fromRGB(215, 245, 240))
    _labLight(window, 0.9, 12, Color3.fromRGB(105, 220, 235))
end

local function buildLabStageDressing(levelNum, basePos, endPos, levelType)
    local minZ = math.min(basePos.Z, endPos.Z)
    local maxZ = math.max(basePos.Z, endPos.Z)
    local length = math.max(32, maxZ - minZ + 24)
    local midZ = (minZ + maxZ) / 2
    local floorY = basePos.Y - 0.66

    _labPart("LabFloor_" .. levelNum, Vector3.new(43, 0.22, length), Vector3.new(0, floorY, midZ), Color3.fromRGB(34, 42, 42), Enum.Material.Metal, { transparency = 0.08 })
    _labPart("LabCeiling_" .. levelNum, Vector3.new(44, 0.24, length), Vector3.new(0, basePos.Y + 9.6, midZ), Color3.fromRGB(18, 24, 26), Enum.Material.Metal, { transparency = 0.08 })
    _labPart("LabWall_L_" .. levelNum, Vector3.new(1, 9.6, length), Vector3.new(-22, basePos.Y + 4.1, midZ), Color3.fromRGB(36, 45, 46), Enum.Material.Metal)
    _labPart("LabWall_R_" .. levelNum, Vector3.new(1, 9.6, length), Vector3.new(22, basePos.Y + 4.1, midZ), Color3.fromRGB(36, 45, 46), Enum.Material.Metal)
    _labPart("LabGlassPanel_L_" .. levelNum, Vector3.new(0.18, 5.4, math.max(8, length * 0.34)), Vector3.new(-21.35, basePos.Y + 4.4, midZ), Color3.fromRGB(60, 210, 180), Enum.Material.Glass, { transparency = 0.5, noLight = false })
    _labPart("LabGlassPanel_R_" .. levelNum, Vector3.new(0.18, 5.4, math.max(8, length * 0.34)), Vector3.new(21.35, basePos.Y + 4.4, midZ), Color3.fromRGB(60, 210, 180), Enum.Material.Glass, { transparency = 0.5, noLight = false })
    _labHazardStripe("LabFloor_" .. levelNum, floorY + 0.2, midZ, length)
    _labPipeRun("LabPipeL_" .. levelNum, -1, basePos.Y, midZ, length)
    _labPipeRun("LabPipeR_" .. levelNum, 1, basePos.Y, midZ, length)

    local lightCount = math.clamp(math.floor(length / 20), 1, 5)
    for i = 1, lightCount do
        local z = minZ + (i / (lightCount + 1)) * length
        local flicker = (i + levelNum) % 3 == 0
        local tube = _labPart("LabFlickerTube_" .. levelNum .. "_" .. i, Vector3.new(7.5, 0.22, 0.72), Vector3.new(0, basePos.Y + 8.9, z), flicker and Color3.fromRGB(105, 220, 235) or Color3.fromRGB(190, 235, 230), Enum.Material.Neon, { noLight = false })
        _labLight(tube, flicker and 1.0 or 2.4, 24, tube.Color)
    end

    local side = (levelNum % 2 == 0) and -1 or 1
    _labConsole("LabConsole_" .. levelNum, side, basePos.Y, midZ - math.min(8, length * 0.16), levelNum % 3 == 0 and "POWER LOW" or "ACCESS DENIED")
    _labSpecimenTank("LabTank_" .. levelNum, -side, basePos.Y, midZ + math.min(8, length * 0.14))
    _labContainmentDoor("LabDoor_" .. levelNum, side, basePos.Y, midZ + math.min(12, length * 0.22), levelNum > TOTAL_LEVELS - 3 and "EXIT AIRLOCK" or "SECTOR " .. tostring(levelNum))

    if levelType == "lava_run" or levelNum % 3 == 0 then
        local spill = _labPart("LabChemicalSpill_" .. levelNum, Vector3.new(10, 0.24, 7), Vector3.new(math.random(-6, 6), basePos.Y - 1.0, midZ), Color3.fromRGB(50, 230, 95), Enum.Material.Neon, { transparency = 0.18, noLight = false })
        _labLight(spill, 1.9, 18, Color3.fromRGB(70, 230, 110))
    end
    if levelNum % 4 == 1 then
        local sign = _labPart("LabBreachSign_" .. levelNum, Vector3.new(7.5, 2.0, 0.34), Vector3.new(-21.2, basePos.Y + 6.6, midZ), Color3.fromRGB(210, 58, 44), Enum.Material.Neon, { noLight = false })
        _labBillboard(sign, "CONTAINMENT BREACH", Color3.fromRGB(255, 225, 150))
    end
end

local function buildLabSpawnLobby(spawnCenter)
    local y = spawnCenter.Y
    _labPart("LabLobbyFloor", Vector3.new(56, 0.24, 44), Vector3.new(0, y - 0.7, -8), Color3.fromRGB(32, 40, 40), Enum.Material.Metal)
    _labPart("LabLobbyBackWall", Vector3.new(56, 9.5, 1), Vector3.new(0, y + 4, -29), Color3.fromRGB(34, 44, 44), Enum.Material.Metal)
    _labPart("LabLobbyLeftWall", Vector3.new(1, 9.5, 44), Vector3.new(-28, y + 4, -8), Color3.fromRGB(34, 44, 44), Enum.Material.Metal)
    _labPart("LabLobbyRightWall", Vector3.new(1, 9.5, 44), Vector3.new(28, y + 4, -8), Color3.fromRGB(34, 44, 44), Enum.Material.Metal)
    local banner = _labPart("LabEntranceWarningBanner", Vector3.new(28, 4.4, 0.45), Vector3.new(0, y + 11.3, -17), Color3.fromRGB(42, 48, 48), Enum.Material.SmoothPlastic, { noLight = false })
    _labSurfaceLabel(banner, "ABANDONED LAB - CONTAINMENT BREACH", Color3.fromRGB(255, 225, 150))
    _labLight(banner, 1.25, 22, Color3.fromRGB(210, 170, 55))
    _labConsole("LabLobbyMainConsole", -1, y, -18, "LOCKDOWN")
    _labSpecimenTank("LabLobbySpecimenTank", 1, y, -18)
    _labContainmentDoor("LabLobbyAirlockDoor", 1, y, -27, "AIRLOCK")
    _labContainmentDoor("LabLobbyDeconDoor", -1, y, -27, "DECON")
end

local function buildLabCheckpointDressing(checkpointNum, position)
    local y = position.Y
    local z = position.Z
    local station = _labPart("LabCheckpointStation_" .. checkpointNum, Vector3.new(13, 2.0, 3.6), Vector3.new(0, y + 1.0, z + 11), Color3.fromRGB(42, 52, 52), Enum.Material.Metal)
    _labSurfaceLabel(station, "CHECKPOINT / SAMPLE LOG", Color3.fromRGB(210, 245, 240))
    _labPart("LabCheckpointSampleA_" .. checkpointNum, Vector3.new(1.2, 1.8, 1.2), Vector3.new(-4, y + 2.6, z + 10.4), Color3.fromRGB(90, 225, 235), Enum.Material.Glass, { shape = Enum.PartType.Cylinder, transparency = 0.35, noLight = false })
    _labPart("LabCheckpointSampleB_" .. checkpointNum, Vector3.new(1.2, 1.8, 1.2), Vector3.new(4, y + 2.6, z + 10.4), Color3.fromRGB(210, 170, 65), Enum.Material.Glass, { shape = Enum.PartType.Cylinder, transparency = 0.35, noLight = false })
end

local function buildLabRescueFinish(position)
    _labPart("LabEmergencyExitPlatform", Vector3.new(34, 0.38, 30), position + Vector3.new(0, -1.35, 0), Color3.fromRGB(24, 34, 34), Enum.Material.Metal)
    local exit = _labPart("LabFinalAirlock", Vector3.new(18, 8, 3.5), position + Vector3.new(0, 4.0, -11), Color3.fromRGB(44, 58, 58), Enum.Material.Metal)
    _labSurfaceLabel(exit, "EMERGENCY AIRLOCK", Color3.fromRGB(220, 245, 240))
    _labPart("LabFinalExitGlow", Vector3.new(14, 5.5, 0.35), position + Vector3.new(0, 4.0, -12.9), Color3.fromRGB(90, 225, 235), Enum.Material.Neon, { noLight = false, transparency = 0.22 })
    _labConsole("LabFinalConsole", -1, position.Y, position.Z + 8, "ESCAPE ROUTE")
    _labSpecimenTank("LabFinalBrokenTank", 1, position.Y, position.Z + 8)
end
` : `
local function buildLabStageDressing(levelNum, basePos, endPos, levelType) end
local function buildLabSpawnLobby(spawnCenter) end
local function buildLabCheckpointDressing(checkpointNum, position) end
local function buildLabRescueFinish(position) end
`;

  const slimeDressingLua = isSlimeHorror ? `
-- ═══════════════════════════════════════════
-- HORROR SLIME CHASE ENVIRONMENTAL DRESSING
-- Deterministic 3D slime kit: clear route arrows, goo trails, warning signs,
-- non-blocking slime props, and a visible chase monster silhouette.
-- ═══════════════════════════════════════════
local SLIME_SET_DRESSING_VERSION = 1

local function _slimePart(name, size, position, color, material, extra)
    extra = extra or {}
    extra.name = name
    extra.size = size
    extra.position = position
    extra.cframe = extra.cframe or CFrame.new(position)
    extra.color = color
    extra.material = material or Enum.Material.SmoothPlastic
    extra.canCollide = extra.canCollide == true
    extra.noSparkles = true
    extra.noLight = extra.noLight ~= false
    return makePart(extra)
end

local function _slimeLight(part, brightness, range, color)
    if not part then return end
    local pl = part:FindFirstChildOfClass("PointLight") or Instance.new("PointLight")
    pl.Parent = part
    pl.Brightness = brightness or 1.8
    pl.Range = range or 22
    pl.Color = color or part.Color
end

local function _slimeLabel(parentPart, text, color)
    if not parentPart then return end
    local bb = Instance.new("BillboardGui")
    bb.Name = "SlimeRouteLabel"
    bb.Size = UDim2.new(0, 190, 0, 44)
    bb.StudsOffset = Vector3.new(0, 3.5, 0)
    bb.MaxDistance = 85
    bb.AlwaysOnTop = false
    bb.Parent = parentPart
    local label = Instance.new("TextLabel")
    label.Size = UDim2.new(1, 0, 1, 0)
    label.BackgroundColor3 = Color3.fromRGB(10, 22, 12)
    label.BackgroundTransparency = 0.1
    label.Text = text
    label.TextColor3 = color or Color3.fromRGB(180, 255, 90)
    label.TextStrokeTransparency = 0.15
    label.TextScaled = true
    label.Font = Enum.Font.GothamBlack
    label.Parent = bb
end

local function _slimePuddle(prefix, x, y, z, sx, sz)
    local puddle = _slimePart(prefix .. "_Puddle", Vector3.new(sx, 0.18, sz), Vector3.new(x, y, z), Color3.fromRGB(38, 255, 84), Enum.Material.Neon, { transparency = 0.18, noLight = false })
    _slimeLight(puddle, 1.6, 18, Color3.fromRGB(80, 255, 100))
    return puddle
end

local function _slimeDrip(prefix, x, y, z)
    local drop = _slimePart(prefix .. "_Drop", Vector3.new(1.2, 1.2, 1.2), Vector3.new(x, y, z), Color3.fromRGB(95, 255, 90), Enum.Material.Neon, { shape = Enum.PartType.Ball, transparency = 0.08, noLight = false })
    _slimeLight(drop, 1.2, 12, Color3.fromRGB(95, 255, 90))
    task.spawn(function()
        local start = drop.Position
        while drop and drop.Parent do
            drop.Position = start
            local tween = TweenService:Create(drop, TweenInfo.new(1.35, Enum.EasingStyle.Sine, Enum.EasingDirection.In), { Position = start + Vector3.new(0, -3.5, 0), Transparency = 0.75 })
            tween:Play()
            tween.Completed:Wait()
            drop.Transparency = 0.08
            task.wait(0.45)
        end
    end)
end

local function buildSlimeStageDressing(levelNum, basePos, endPos, levelType)
    local minZ = math.min(basePos.Z, endPos.Z)
    local maxZ = math.max(basePos.Z, endPos.Z)
    local midZ = (minZ + maxZ) / 2
    local length = math.max(30, maxZ - minZ + 18)
    local floorY = basePos.Y - 0.72

    local leftGuide = _slimePart("SlimeGuideRail_L_" .. levelNum, Vector3.new(0.55, 0.55, length), Vector3.new(-13.5, floorY + 0.55, midZ), Color3.fromRGB(60, 255, 95), Enum.Material.Neon, { noLight = false })
    local rightGuide = _slimePart("SlimeGuideRail_R_" .. levelNum, Vector3.new(0.55, 0.55, length), Vector3.new(13.5, floorY + 0.55, midZ), Color3.fromRGB(60, 255, 95), Enum.Material.Neon, { noLight = false })
    _slimeLight(leftGuide, 0.9, 14, Color3.fromRGB(60, 255, 95))
    _slimeLight(rightGuide, 0.9, 14, Color3.fromRGB(60, 255, 95))

    for i = 1, 3 do
        local z = minZ + (i / 4) * (maxZ - minZ)
        local side = (i % 2 == 0) and -1 or 1
        _slimePuddle("SlimeStage_" .. levelNum .. "_" .. i, side * math.random(5, 10), floorY + 0.1, z, math.random(5, 9), math.random(4, 8))
    end

    if levelNum == 1 or levelNum % 3 == 0 then
        local sign = _slimePart("SlimeRunForwardSign_" .. levelNum, Vector3.new(9.5, 2.2, 0.35), Vector3.new(-11, basePos.Y + 5.2, minZ + 4), Color3.fromRGB(18, 58, 22), Enum.Material.SmoothPlastic, { noLight = false })
        _slimeLabel(sign, "RUN -> NEXT JUMP", Color3.fromRGB(210, 255, 120))
        _slimeLight(sign, 1.5, 20, Color3.fromRGB(120, 255, 90))
    end

    if levelType == "moving_platform" or levelType == "lava_run" or levelNum % 4 == 2 then
        _slimeDrip("SlimeCeilingDrip_" .. levelNum, math.random(-8, 8), basePos.Y + 8.5, midZ)
        _slimeDrip("SlimeCeilingDripB_" .. levelNum, math.random(-8, 8), basePos.Y + 8.0, midZ + 7)
    end
end

local function buildSlimeSpawnLobby(spawnCenter)
    local y = spawnCenter.Y
    local gate = _slimePart("SlimeSpawnGate", Vector3.new(22, 6, 1), Vector3.new(0, y + 4.2, -15), Color3.fromRGB(18, 70, 24), Enum.Material.SmoothPlastic, { noLight = false })
    _slimeLabel(gate, "SLIME CHASE - FOLLOW GREEN ARROWS", Color3.fromRGB(210, 255, 120))
    _slimeLight(gate, 2.0, 28, Color3.fromRGB(100, 255, 90))
    _slimePuddle("SlimeSpawn", -9, y - 0.45, -7, 8, 6)
    _slimePuddle("SlimeSpawnB", 9, y - 0.45, -2, 7, 5)
    local body = _slimePart("SlimeMonsterBody", Vector3.new(7, 5.2, 7), Vector3.new(0, y + 2.6, -24), Color3.fromRGB(44, 230, 55), Enum.Material.Neon, { shape = Enum.PartType.Ball, noLight = false })
    _slimePart("SlimeMonsterEye_L", Vector3.new(0.8, 0.8, 0.8), Vector3.new(-1.4, y + 4.2, -18.2), Color3.fromRGB(245, 255, 210), Enum.Material.Neon, { shape = Enum.PartType.Ball, noLight = false })
    _slimePart("SlimeMonsterEye_R", Vector3.new(0.8, 0.8, 0.8), Vector3.new(1.4, y + 4.2, -18.2), Color3.fromRGB(245, 255, 210), Enum.Material.Neon, { shape = Enum.PartType.Ball, noLight = false })
    _slimeLight(body, 2.4, 30, Color3.fromRGB(80, 255, 90))
end

local function buildSlimeCheckpointDressing(checkpointNum, position)
    local beacon = _slimePart("SlimeCheckpointBeacon_" .. checkpointNum, Vector3.new(3.2, 6.5, 3.2), position + Vector3.new(-9, 3.2, 0), Color3.fromRGB(78, 255, 90), Enum.Material.Neon, { noLight = false })
    _slimeLabel(beacon, "SAFE PAD", Color3.fromRGB(230, 255, 150))
    _slimeLight(beacon, 2.2, 24, Color3.fromRGB(90, 255, 100))
end

local function buildSlimeRescueFinish(position)
    local exit = _slimePart("SlimeFinalEscapeTunnel", Vector3.new(24, 7, 3.5), position + Vector3.new(0, 4.0, -11), Color3.fromRGB(20, 72, 26), Enum.Material.SmoothPlastic, { noLight = false })
    _slimeLabel(exit, "ESCAPE!", Color3.fromRGB(230, 255, 140))
    _slimeLight(exit, 2.5, 30, Color3.fromRGB(100, 255, 90))
end
` : `
local function buildSlimeStageDressing(levelNum, basePos, endPos, levelType) end
local function buildSlimeSpawnLobby(spawnCenter) end
local function buildSlimeCheckpointDressing(checkpointNum, position) end
local function buildSlimeRescueFinish(position) end
`;

  const obbyDescriptionBoardLua = `
local OBBY_DESCRIPTION_TEXT = ${obbyDescriptionLua}

local function buildObbyDescriptionBoard(spawnCenter)
    local board = makePart({
        name = "ObbyDescriptionBoard",
        size = Vector3.new(18, 5, 0.35),
        position = spawnCenter + Vector3.new(-23, 6.5, -12),
        color = Color3.fromRGB(24, 30, 34),
        material = Enum.Material.SmoothPlastic,
        canCollide = false,
        noSparkles = true,
        noLight = false,
    })
    local gui = Instance.new("SurfaceGui")
    gui.Name = "ObbyDescriptionGui"
    gui.Face = Enum.NormalId.Front
    gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
    gui.PixelsPerStud = 45
    gui.LightInfluence = 0.2
    gui.Parent = board
    local title = Instance.new("TextLabel")
    title.Size = UDim2.new(1, -20, 0.32, 0)
    title.Position = UDim2.new(0, 10, 0, 8)
    title.BackgroundTransparency = 1
    title.Text = ${obbyTitleLua}
    title.TextColor3 = Color3.fromRGB(235, 245, 255)
    title.TextScaled = true
    title.Font = Enum.Font.GothamBold
    title.Parent = gui
    local body = Instance.new("TextLabel")
    body.Size = UDim2.new(1, -24, 0.58, 0)
    body.Position = UDim2.new(0, 12, 0.36, 0)
    body.BackgroundTransparency = 1
    body.Text = OBBY_DESCRIPTION_TEXT
    body.TextColor3 = Color3.fromRGB(198, 220, 218)
    body.TextWrapped = true
    body.TextScaled = true
    body.Font = Enum.Font.Gotham
    body.Parent = gui
end
`;

  // ── Phase G v2 (session 233): Decoration stations ──
  // Two sources: live Roblox decals from spec.liveDecalsByTerm (variant A,
  // BillboardGui rbxthumb) and AI-generated prop images (variant B, SurfaceGui
  // ImageLabel on a prop block). Both rendered as floating decoration stations
  // alongside obby stages. Empty when visualSpec is null → no decorations
  // (existing behaviour, no regression).
  type DecorationStation = { kind: 'thumb' | 'asset'; value: string; name: string };
  const decorationStations: DecorationStation[] = [];
  if (visualSpec && !hasDeterministicEnvironmentKit) {
    const concepts = Array.isArray(visualSpec.decorationConcepts) ? visualSpec.decorationConcepts : [];
    const liveDecals = visualSpec.liveDecalsByTerm ?? {};
    const propUrls = Array.isArray(params.obbyDecorationPropImageUrls) ? params.obbyDecorationPropImageUrls : [];
    // Variant B first — AI-generated prop images for each decoration concept.
    for (let i = 0; i < concepts.length; i++) {
      const url = propUrls[i];
      if (typeof url === 'string' && url.length > 0) {
        decorationStations.push({ kind: 'asset', value: url, name: concepts[i].slice(0, 40) });
      }
    }
    // Variant A — live Roblox catalog decals from Apify keyword search.
    for (const term of (visualSpec.decalSearchTerms ?? [])) {
      const ids = liveDecals[term] ?? [];
      for (const id of ids) {
        if (typeof id === 'number' && Number.isFinite(id) && id > 0) {
          decorationStations.push({ kind: 'thumb', value: String(id), name: term.slice(0, 40) });
        }
      }
    }
  }
  const luaQuote = (s: string): string => JSON.stringify(s.replace(/[ -]/g, ' '));
  const decorationStationsLua = decorationStations.length > 0
    ? decorationStations
        .map((s) => `    { kind = ${luaQuote(s.kind)}, value = ${luaQuote(s.value)}, name = ${luaQuote(s.name)} },`)
        .join('\n')
    : '';
  const decorationsAccentLua = rgb(themeData.accent1);
  const decorationsPrimaryLua = rgb(themeData.accent2);

  // ── PART 2: Full Lua Script ──
  const luaScript = `-- Obby Builder: ${theme} (theme=${themeKey})
-- Placement: ServerScriptService
-- This script creates the ENTIRE obby automatically via Instance.new()
-- No manual setup required — just paste and play!

local Players = game:GetService("Players")
local TweenService = game:GetService("TweenService")
local RunService = game:GetService("RunService")
local Lighting = game:GetService("Lighting")
local OBBY_QUALITY_GATE_VERSION = 1

-- ═══════════════════════════════════════════
-- APPLY THEME LIGHTING (${themeData.name})
-- ═══════════════════════════════════════════
-- Clean previous atmosphere/effects so themes don't stack in Studio playtests
for _, inst in ipairs(Lighting:GetChildren()) do
    if inst:IsA("Atmosphere") or inst:IsA("BloomEffect") or inst:IsA("ColorCorrectionEffect") or inst:IsA("Sky") then
        inst:Destroy()
    end
end
Lighting.ClockTime = ${themeData.clockTime}
Lighting.Brightness = ${themeData.brightness}
Lighting.Ambient = ${ambientLua}
Lighting.OutdoorAmbient = ${outdoorAmbientLua}
Lighting.FogEnd = ${themeData.fogEnd}
Lighting.FogColor = ${fogColorLua}
local _atmo = Instance.new("Atmosphere")
_atmo.Density = ${themeData.atmoD}
_atmo.Offset = ${themeData.atmoOff}
_atmo.Color = ${atmoColorLua}
_atmo.Decay = ${atmoDecayLua}
_atmo.Glare = 0.2
_atmo.Haze = ${themeData.atmoHaze}
_atmo.Parent = Lighting
local _bloom = Instance.new("BloomEffect")
_bloom.Intensity = ${themeData.bloomI}
_bloom.Size = ${themeData.bloomS}
_bloom.Threshold = ${themeData.bloomT}
_bloom.Parent = Lighting
local _cc = Instance.new("ColorCorrectionEffect")
_cc.Brightness = ${themeData.ccB}
_cc.Contrast = ${themeData.ccC}
_cc.Saturation = ${themeData.ccS}
_cc.TintColor = ${ccTintLua}
_cc.Parent = Lighting

-- ═══════════════════════════════════════════
-- CONFIGURATION
-- ═══════════════════════════════════════════
-- Session 234: seed runtime math.random with the same per-job seed used at
-- build time. New generation job/request => new seed; Play-testing the same
-- export stays reproducible so a bad map can be debugged.
math.randomseed(${jobSeed})
local TOTAL_LEVELS = ${levels}
local TROLL_LEVEL = ${trollLevelLua}  -- meme troll platform target (-1 = disabled)
local DECORATIVE_NPCS_ENABLED = ${decorativeNpcsEnabled ? 'true' : 'false'}
local TROLL_PLATFORM_ENABLED = ${trollPlatformEnabled ? 'true' : 'false'}
local LEVEL_OFFSET_Z = ${levelOffsetZ}
local LAYOUT_STYLE = "${layoutStyle}"
local LAYOUT_SEED = ${jobSeed}
local PLATFORM_SIZE = Vector3.new(${platformSizeXZ}, 1, ${platformSizeXZ})
local CHECKPOINT_EVERY = 3
local WIN_LEVEL = TOTAL_LEVELS + 1
local PLATFORM_MATERIAL = Enum.Material.${platformMat}
local KILL_MATERIAL = Enum.Material.${killMat}

-- ═══════════════════════════════════════════
-- THEMED COLOR PALETTE (${themeData.name})
-- ═══════════════════════════════════════════
local BRIGHT_COLORS = {
${themePaletteLua}
}
local KILL_COLOR = ${killColorLua}
local CHECKPOINT_COLOR = ${checkpointColorLua}
local ROUTE_GUIDE_COLOR = ${routeGuideColorLua}
local ROUTE_GUIDE_LABEL_COLOR = ${routeGuideLabelColorLua}
local WIN_COLOR = ${winColorLua}

local PLATFORM_TEXTURES = {
${textureTableLua}
}

-- Session #075: Fallback emoji decorations for platforms (no rbxassetid dependency)
local PLATFORM_EMOJIS = {
${fallbackEmojiTableLua}
}

-- Session #073b: AI-generated NPC billboard images (rbxassetid:// URLs)
local NPC_IMAGES = {
${npcImageTableLua}
}

-- Session #074b: User-uploaded 3D Skibidi Toilet models from Roblox Creator Dashboard.
-- Only meme obbies receive these IDs; serious themes must not fall back to Skibidi assets.
local FALLBACK_NPC_MODELS = {
${fallbackNpcModelsLua}
}

local function randomBright()
    return BRIGHT_COLORS[math.random(1, #BRIGHT_COLORS)]
end

local _STAGE_X_SHIFT = 0
local function _stageShift(v)
    return v + Vector3.new(_STAGE_X_SHIFT, 0, 0)
end
local function _stageShiftCFrame(cf)
    return cf + Vector3.new(_STAGE_X_SHIFT, 0, 0)
end

-- ═══════════════════════════════════════════
-- CONTAINER
-- ═══════════════════════════════════════════
local container = Instance.new("Folder")
container.Name = "GeneratedContent"
container.Parent = workspace

-- ═══════════════════════════════════════════
-- SANITIZE WORKSPACE
-- Remove any pre-existing SpawnLocations so our raised obby spawn is the only
-- one Roblox uses for player respawn (otherwise the default baseplate spawn
-- keeps dropping the player on the grass at Y=0). Sink the default Baseplate
-- way down so it never blocks gameplay or looks like a second floor.
-- ═══════════════════════════════════════════
for _, inst in ipairs(workspace:GetDescendants()) do
    if inst:IsA("SpawnLocation") then
        inst:Destroy()
    end
end
local _bp = workspace:FindFirstChild("Baseplate")
if _bp and _bp:IsA("BasePart") then
    _bp.CFrame = CFrame.new(0, -500, 0)
    _bp.CanCollide = false
end

-- ═══════════════════════════════════════════
-- HELPER: Create a Part
-- ═══════════════════════════════════════════
local function makePart(props)
    local p = Instance.new("Part")
    local rawPosition = props.position or Vector3.new(0, 0, 0)
    local rawCFrame = props.cframe or CFrame.new(rawPosition)
    local worldCFrame = props.worldSpace and rawCFrame or _stageShiftCFrame(rawCFrame)
    p.Name = props.name or "Part"
    p.Size = props.size or PLATFORM_SIZE
    p.CFrame = worldCFrame
    p.Color = props.color or randomBright()
    p.Material = props.material or Enum.Material.SmoothPlastic
    p.Anchored = true
    p.CanCollide = props.canCollide ~= nil and props.canCollide or true
    p.Transparency = props.transparency or 0
    p.Shape = props.shape or Enum.PartType.Block
    p.Parent = props.parent or container
    if props.neon then
        p.Material = Enum.Material.Neon
    end
    -- Billboard label (clipped at distance, not always-on-top to avoid stacking across the map)
    if props.label then
        local bb = Instance.new("BillboardGui")
        bb.Name = "Label"
        bb.Size = UDim2.new(0, 150, 0, 38)
        bb.StudsOffset = Vector3.new(0, props.labelOffset or 5, 0)
        bb.MaxDistance = 40
        bb.AlwaysOnTop = false
        bb.Parent = p
        local txt = Instance.new("TextLabel")
        txt.Size = UDim2.new(1, 0, 1, 0)
        txt.BackgroundTransparency = 1
        txt.Text = props.label
        txt.TextColor3 = props.labelColor or Color3.new(1, 1, 1)
        txt.TextStrokeTransparency = 0
        txt.TextScaled = true
        txt.Font = Enum.Font.GothamBold
        txt.Parent = bb
    end
    -- Sparkles (random 30% chance)
    if props.sparkles or (not props.noSparkles and math.random() < 0.3) then
        local sp = Instance.new("Sparkles")
        sp.SparkleColor = props.color or randomBright()
        sp.Parent = p
    end
    -- PointLight (random 20% chance)
    if props.pointLight or (not props.noLight and math.random() < 0.2) then
        local pl = Instance.new("PointLight")
        pl.Color = props.color or randomBright()
        pl.Brightness = 2
        pl.Range = 15
        pl.Parent = p
    end
    return p
end

${memeHelperLua}

${hospitalDressingLua}
${schoolDressingLua}
${labDressingLua}
${slimeDressingLua}
${obbyDescriptionBoardLua}

-- ═══════════════════════════════════════════
-- LEVEL TYPE DEFINITIONS
-- ═══════════════════════════════════════════
local LEVEL_TYPES = {"jump", "kill_brick", "moving_platform", "spinner", "disappearing", "wallhop", "tightrope", "lava_run", "climb"}

-- Difficulty scaling: platforms get smaller and gaps get wider
local function getDifficulty(levelNum)
    if levelNum <= 3 then return 1
    elseif levelNum <= 6 then return 2
    elseif levelNum <= 9 then return 3
    elseif levelNum <= 12 then return 4
    else return 5 end
end

-- Pick a level type avoiding repeats
local lastType = ""
local function pickType(levelNum)
    local diff = getDifficulty(levelNum)
    local available = {}
    -- Early levels: easier types (jump, tightrope, lava_run)
    if diff <= 2 then
        available = {"jump", "jump", "moving_platform", "tightrope", "lava_run", "climb", "disappearing"}
    elseif diff <= 3 then
        available = {"jump", "kill_brick", "moving_platform", "spinner", "wallhop", "tightrope", "lava_run", "climb"}
    else
        available = {"kill_brick", "moving_platform", "spinner", "disappearing", "wallhop", "tightrope", "lava_run", "climb", "jump"}
    end
    -- Avoid repeating same type
    local filtered = {}
    for _, t in available do
        if t ~= lastType then table.insert(filtered, t) end
    end
    if #filtered == 0 then filtered = available end
    local chosen = filtered[math.random(1, #filtered)]
    lastType = chosen
    return chosen
end

-- ═══════════════════════════════════════════
-- PHASE G v2 (session 233): Decoration Stations
-- Live Roblox catalog decals (rbxthumb, variant A) and AI-generated prop
-- images (rbxassetid, variant B) placed alongside obby stages so the world
-- visually matches the user's brief (e.g. "creepy circus" gets clown-face
-- decals + funhouse-mirror prop blocks instead of generic-themed obby).
-- ═══════════════════════════════════════════
local DECORATION_STATIONS = {
${decorationStationsLua}
}
local DECORATION_ACCENT_COLOR = ${decorationsAccentLua}
local DECORATION_PRIMARY_COLOR = ${decorationsPrimaryLua}

local function buildObbyDecorationStation(parent, position, station, idx)
    local model = Instance.new("Model"); model.Name = "Decoration_" .. tostring(idx) .. "_" .. (station.name or "station")
    local anchor = Instance.new("Part")
    anchor.Name = "Anchor"
    anchor.Size = Vector3.new(3, 3, 3)
    anchor.Position = position
    anchor.Anchored = true
    anchor.CanCollide = false
    anchor.Transparency = 1
    anchor.Massless = true
    anchor.Parent = model
    model.PrimaryPart = anchor
    -- Glowing pedestal disc
    local pedestal = Instance.new("Part")
    pedestal.Name = "Pedestal"
    pedestal.Shape = Enum.PartType.Cylinder
    pedestal.Size = Vector3.new(0.6, 7, 7)
    pedestal.Orientation = Vector3.new(0, 0, 90)
    pedestal.Position = position - Vector3.new(0, 3, 0)
    pedestal.Anchored = true
    pedestal.CanCollide = false
    pedestal.Material = Enum.Material.Neon
    pedestal.Color = DECORATION_ACCENT_COLOR
    pedestal.Parent = model
    -- Halo light for dark themes
    local light = Instance.new("PointLight")
    light.Brightness = 1.5
    light.Range = 16
    light.Color = DECORATION_PRIMARY_COLOR
    light.Parent = anchor
    -- BillboardGui with the decoration art
    local billboard = Instance.new("BillboardGui")
    billboard.Name = "DecorationCard"
    billboard.Adornee = anchor
    billboard.Size = UDim2.new(0, 240, 0, 300)
    billboard.StudsOffset = Vector3.new(0, 5, 0)
    billboard.AlwaysOnTop = false
    billboard.LightInfluence = 0
    billboard.MaxDistance = 280
    billboard.Parent = anchor
    local img = Instance.new("ImageLabel")
    img.Size = UDim2.new(1, 0, 1, 0)
    img.BackgroundTransparency = 1
    img.ScaleType = Enum.ScaleType.Fit
    img.Parent = billboard
    if station.kind == "thumb" then
        img.Image = "rbxthumb://type=Asset&id=" .. station.value .. "&w=420&h=420"
    else
        img.Image = station.value
    end
    local stroke = Instance.new("UIStroke")
    stroke.Color = DECORATION_PRIMARY_COLOR
    stroke.Thickness = 3
    stroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
    stroke.Parent = img
    -- Idle bob — gentle vertical sway so decorations feel alive, not stickers.
    task.spawn(function()
        local TweenService = game:GetService("TweenService")
        while anchor.Parent do
            local up = TweenService:Create(anchor, TweenInfo.new(2.4, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut), { CFrame = CFrame.new(position + Vector3.new(0, 0.6, 0)) })
            local down = TweenService:Create(anchor, TweenInfo.new(2.4, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut), { CFrame = CFrame.new(position - Vector3.new(0, 0.6, 0)) })
            up:Play()
            up.Completed:Wait()
            down:Play()
            down.Completed:Wait()
        end
    end)
    model.Parent = parent
    return model
end

local _DECORATION_FOLDER = nil
local _DECORATION_PLACED_COUNT = 0
local function placeObbyDecorationForLevel(levelNum, basePos, endPos)
    if #DECORATION_STATIONS == 0 then return end
    -- Place every 2 stages to avoid clutter — total ~6-8 decorations on 12-15 stage obby.
    if levelNum % 2 ~= 1 then return end
    if not _DECORATION_FOLDER then
        _DECORATION_FOLDER = Instance.new("Folder")
        _DECORATION_FOLDER.Name = "ObbyDecorations"
        _DECORATION_FOLDER.Parent = workspace
    end
    _DECORATION_PLACED_COUNT = _DECORATION_PLACED_COUNT + 1
    local idx = ((_DECORATION_PLACED_COUNT - 1) % #DECORATION_STATIONS) + 1
    local station = DECORATION_STATIONS[idx]
    -- Alternate left/right offset, position roughly mid-stage at eye height.
    local sideOffset = (_DECORATION_PLACED_COUNT % 2 == 1) and -22 or 22
    local midZ = (basePos.Z + (endPos and endPos.Z or basePos.Z)) / 2
    local stationPos = _stageShift(Vector3.new(sideOffset, basePos.Y + 6, midZ))
    pcall(buildObbyDecorationStation, _DECORATION_FOLDER, stationPos, station, _DECORATION_PLACED_COUNT)
end

-- ═══════════════════════════════════════════
-- BUILD LEVEL FUNCTIONS
-- ═══════════════════════════════════════════

-- Shared state for kill brick connections
local killBricks = {}

-- JUMP: series of platforms the player must jump across
local function buildJumpLevel(levelNum, basePos)
    local diff = getDifficulty(levelNum)
    local platformCount = 3 + math.floor(diff * 0.5) + math.random(0, 2)
    local gapSize = 5 + diff + math.random(0, 3)
    local platformScale = math.max(0.6, 1 - diff * 0.06 - math.random() * 0.15)
    local baseY = basePos.Y

    for i = 1, platformCount do
        local x = math.random(-6, 6)
        local y = baseY + math.random(0, math.max(2, diff)) + math.random(0, 1)
        local z = basePos.Z + (i - 1) * gapSize + math.random(-2, 2)
        local col = randomBright()
        local sz = PLATFORM_SIZE * platformScale

        local _p = makePart({
            name = "Jump_" .. levelNum .. "_" .. i,
            size = sz,
            position = Vector3.new(x, y, z),
            color = col,
            material = PLATFORM_MATERIAL,
        })
        applyPlatformTexture(_p, levelNum * 10 + i)
        if i <= 2 or (i > 2 and math.random() < 0.35) then
            placeMemeNpcOnPlatform(_p, levelNum)
            if levelNum == TROLL_LEVEL then makeTrollPlatform(_p) end
        end
    end

    -- End platform for this level
    local endZ = basePos.Z + platformCount * gapSize
    return Vector3.new(0, baseY, endZ)
end

-- KILL BRICK: platforms with deadly red neon parts
local function buildKillBrickLevel(levelNum, basePos)
    local diff = getDifficulty(levelNum)
    local platformCount = 3 + math.floor(diff * 0.3) + math.random(0, 2)
    local gapSize = 7 + diff + math.random(0, 3)
    local baseY = basePos.Y

    for i = 1, platformCount do
        -- Safe platform
        local x = math.random(-6, 6)
        local y = baseY + math.random(0, math.max(1, diff)) + math.random(0, 1)
        local z = basePos.Z + (i - 1) * gapSize + math.random(-2, 2)

        local _p = makePart({
            name = "Safe_" .. levelNum .. "_" .. i,
            size = PLATFORM_SIZE * math.max(0.75, 1 - diff * 0.04),
            position = Vector3.new(x, y, z),
            color = randomBright(),
            material = PLATFORM_MATERIAL,
        })
        applyPlatformTexture(_p, levelNum * 10 + i)
        if i <= 2 or (i > 2 and math.random() < 0.35) then
            placeMemeNpcOnPlatform(_p, levelNum)
            if levelNum == TROLL_LEVEL then makeTrollPlatform(_p) end
        end

        -- Kill brick between platforms
        if i < platformCount then
            local killX = math.random(-4, 4)
            local killY = y - 0.5
            local killZ = z + gapSize * 0.5
            local killPart = makePart({
                name = "Kill_" .. levelNum .. "_" .. i,
                size = Vector3.new(8, 0.5, 4),
                position = Vector3.new(killX, killY, killZ),
                color = KILL_COLOR,
                material = KILL_MATERIAL,
                neon = true,
                noSparkles = true,
            })
            table.insert(killBricks, killPart)
        end
    end

    local endZ = basePos.Z + platformCount * gapSize
    return Vector3.new(0, baseY, endZ)
end

-- MOVING PLATFORM: platforms that slide back and forth
local function buildMovingPlatformLevel(levelNum, basePos)
    local diff = getDifficulty(levelNum)
    local platformCount = 2 + math.floor(diff * 0.3) + math.random(0, 2)
    local gapSize = 10 + diff + math.random(0, 4)
    local baseY = basePos.Y
    local moveDistance = 6 + diff * 1.5 + math.random(0, 4)
    local moveSpeed = math.max(1.2, 3.0 - diff * 0.2 - math.random() * 0.5)

    for i = 1, platformCount do
        local z = basePos.Z + (i - 1) * gapSize + math.random(-2, 2)
        local col = randomBright()

        local movingPart = makePart({
            name = "Moving_" .. levelNum .. "_" .. i,
            size = PLATFORM_SIZE * math.max(0.8, 1 - diff * 0.03),
            position = Vector3.new(0, baseY + 2, z),
            color = col,
            material = PLATFORM_MATERIAL,
            noSparkles = true,
        })
        applyPlatformTexture(movingPart, levelNum * 10 + i)
        if i <= 2 or (i > 2 and math.random() < 0.35) then
            placeMemeNpcOnPlatform(movingPart, levelNum)
            if levelNum == TROLL_LEVEL then makeTrollPlatform(movingPart) end
        end

        -- Tween back and forth along X axis
        local startPos = movingPart.Position
        local endPos = startPos + Vector3.new(moveDistance, 0, 0)
        local tweenInfo = TweenInfo.new(moveSpeed, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut, -1, true)
        TweenService:Create(movingPart, tweenInfo, {Position = endPos}):Play()
    end

    local endZ = basePos.Z + platformCount * gapSize
    return Vector3.new(0, baseY, endZ)
end

-- SPINNER: rotating parts that the player must avoid or ride
local function buildSpinnerLevel(levelNum, basePos)
    local diff = getDifficulty(levelNum)
    local platformCount = 2 + math.floor(diff * 0.2) + math.random(0, 1)
    local gapSize = 12 + diff + math.random(0, 4)
    local baseY = basePos.Y

    for i = 1, platformCount do
        local z = basePos.Z + (i - 1) * gapSize + math.random(-2, 2)

        -- Platform to stand on (bigger so player has space to dodge)
        local _p = makePart({
            name = "SpinBase_" .. levelNum .. "_" .. i,
            size = Vector3.new(16, 1, 16),
            position = Vector3.new(0, baseY, z),
            color = randomBright(),
            material = PLATFORM_MATERIAL,
        })
        applyPlatformTexture(_p, levelNum * 10 + i)
        if i <= 2 or (i > 2 and math.random() < 0.35) then
            placeMemeNpcOnPlatform(_p, levelNum)
            if levelNum == TROLL_LEVEL then makeTrollPlatform(_p) end
        end

        -- Spinning kill arm
        local armLength = 4 + math.floor(diff * 0.5)
        local spinner = makePart({
            name = "Spinner_" .. levelNum .. "_" .. i,
            size = Vector3.new(armLength, 1, 1),
            cframe = CFrame.new(Vector3.new(0, baseY + 2, z)),
            color = KILL_COLOR,
            material = KILL_MATERIAL,
            neon = true,
            noSparkles = true,
        })
        table.insert(killBricks, spinner)

        -- Rotate spinner (slower — player can time it)
        local spinSpeed = math.rad(1.0 + diff * 0.25)
        task.spawn(function()
            while spinner and spinner.Parent do
                spinner.CFrame = spinner.CFrame * CFrame.Angles(0, spinSpeed, 0)
                RunService.Heartbeat:Wait()
            end
        end)
    end

    local endZ = basePos.Z + platformCount * gapSize
    return Vector3.new(0, baseY, endZ)
end

-- DISAPPEARING: platforms that vanish on touch and reappear after 2 seconds
local function buildDisappearingLevel(levelNum, basePos)
    local diff = getDifficulty(levelNum)
    local platformCount = 3 + math.floor(diff * 0.5) + math.random(0, 2)
    local gapSize = 6 + diff + math.random(0, 3)
    local baseY = basePos.Y

    for i = 1, platformCount do
        local x = math.random(-6, 6)
        local y = baseY + math.random(0, math.max(1, diff)) + math.random(0, 1)
        local z = basePos.Z + (i - 1) * gapSize + math.random(-2, 2)
        local col = randomBright()

        local disappearPart = makePart({
            name = "Disappear_" .. levelNum .. "_" .. i,
            size = PLATFORM_SIZE * math.max(0.75, 1 - diff * 0.04),
            position = Vector3.new(x, y, z),
            color = col,
            material = PLATFORM_MATERIAL,
            noSparkles = true,
        })
        applyPlatformTexture(disappearPart, levelNum * 10 + i)

        -- Disappearing logic
        disappearPart.Touched:Connect(function(hit)
            local player = Players:GetPlayerFromCharacter(hit.Parent)
            if not player then return end
            if disappearPart.Transparency >= 0.9 then return end
            -- Start fade
            task.delay(0.3, function()
                disappearPart.Transparency = 1
                disappearPart.CanCollide = false
            end)
            -- Reappear after 2 seconds
            task.delay(2.3, function()
                if disappearPart and disappearPart.Parent then
                    disappearPart.Transparency = 0
                    disappearPart.CanCollide = true
                end
            end)
        end)
    end

    local endZ = basePos.Z + platformCount * gapSize
    return Vector3.new(0, baseY, endZ)
end

-- WALLHOP: bounce between two parallel walls going upward
local function buildWallhopLevel(levelNum, basePos)
    local diff = getDifficulty(levelNum)
    local hopCount = 3 + math.floor(diff * 0.4) + math.random(0, 2)
    local wallGap = 6 + math.random(0, 2)  -- distance between walls
    local hopHeight = 4 + math.random(0, 2)  -- vertical gain per hop
    local baseY = basePos.Y
    local baseZ = basePos.Z

    -- Entry platform
    local entryPart = makePart({
        name = "WallhopEntry_" .. levelNum,
        size = PLATFORM_SIZE,
        position = Vector3.new(0, baseY, baseZ),
        color = randomBright(),
        material = PLATFORM_MATERIAL,
    })
    applyPlatformTexture(entryPart, levelNum * 10)

    -- Two tall walls with ledges to hop between
    for i = 1, hopCount do
        local side = (i % 2 == 1) and -1 or 1
        local ledgeX = side * (wallGap / 2)
        local ledgeY = baseY + i * hopHeight
        local ledgeZ = baseZ + 8 + (i - 1) * 3 + math.random(-1, 1)

        local ledge = makePart({
            name = "WallLedge_" .. levelNum .. "_" .. i,
            size = Vector3.new(4 + math.random(0, 2), 1, 3),
            position = Vector3.new(ledgeX, ledgeY, ledgeZ),
            color = randomBright(),
            material = PLATFORM_MATERIAL,
        })
        applyPlatformTexture(ledge, levelNum * 10 + i)
        if i <= 2 or (i > 2 and math.random() < 0.3) then
            placeMemeNpcOnPlatform(ledge, levelNum)
        end

        -- Wall segment behind ledge
        makePart({
            name = "Wall_" .. levelNum .. "_" .. i,
            size = Vector3.new(1, hopHeight + 2, 5),
            position = Vector3.new(side * (wallGap / 2 + 2.5), ledgeY + hopHeight / 2, ledgeZ),
            color = Color3.fromRGB(80, 80, 100),
            material = Enum.Material.Brick,
            noSparkles = true,
            noLight = true,
        })
    end

    -- Exit platform at the top
    local exitY = baseY + hopCount * hopHeight + 2
    local exitZ = baseZ + 8 + hopCount * 3
    makePart({
        name = "WallhopExit_" .. levelNum,
        size = PLATFORM_SIZE,
        position = Vector3.new(0, exitY, exitZ),
        color = randomBright(),
        material = PLATFORM_MATERIAL,
    })

    return Vector3.new(0, exitY, exitZ)
end

-- TIGHTROPE: narrow beams the player must carefully walk across
local function buildTightropeLevel(levelNum, basePos)
    local diff = getDifficulty(levelNum)
    local segmentCount = 2 + math.floor(diff * 0.3) + math.random(0, 2)
    local baseY = basePos.Y
    local currentZ = basePos.Z

    for i = 1, segmentCount do
        -- Safe rest platform at start of each segment
        local restPart = makePart({
            name = "TightRest_" .. levelNum .. "_" .. i,
            size = Vector3.new(6 + math.random(0, 3), 1, 6),
            position = Vector3.new(math.random(-3, 3), baseY, currentZ),
            color = randomBright(),
            material = PLATFORM_MATERIAL,
        })
        applyPlatformTexture(restPart, levelNum * 10 + i)
        if math.random() < 0.5 then
            placeMemeNpcOnPlatform(restPart, levelNum)
        end

        currentZ = currentZ + 4

        -- Narrow beam (the tightrope)
        local beamLength = 10 + math.random(0, 8) + diff * 2
        local beamWidth = math.max(1, 3 - math.floor(diff * 0.3))
        local beamAngleX = math.random(-3, 3)

        makePart({
            name = "Tightrope_" .. levelNum .. "_" .. i,
            size = Vector3.new(beamWidth, 0.5, beamLength),
            position = Vector3.new(beamAngleX, baseY, currentZ + beamLength / 2),
            color = Color3.fromRGB(200, 180, 50),
            material = Enum.Material.Wood,
            noSparkles = true,
        })

        -- Kill zone below the beam
        makePart({
            name = "TightKill_" .. levelNum .. "_" .. i,
            size = Vector3.new(16, 0.5, beamLength + 4),
            position = Vector3.new(0, baseY - 8, currentZ + beamLength / 2),
            color = KILL_COLOR,
            material = KILL_MATERIAL,
            neon = true,
            noSparkles = true,
        })
        table.insert(killBricks, container:FindFirstChild("TightKill_" .. levelNum .. "_" .. i))

        currentZ = currentZ + beamLength + 2
        baseY = baseY + math.random(-1, 1)
    end

    -- Final rest platform
    makePart({
        name = "TightEnd_" .. levelNum,
        size = PLATFORM_SIZE,
        position = Vector3.new(0, baseY, currentZ),
        color = randomBright(),
        material = PLATFORM_MATERIAL,
    })

    return Vector3.new(0, baseY, currentZ)
end

-- LAVA RUN: corridor with kill floor, player runs between safe islands
local function buildLavaRunLevel(levelNum, basePos)
    local diff = getDifficulty(levelNum)
    local islandCount = 3 + math.floor(diff * 0.4) + math.random(0, 2)
    local corridorWidth = 14 + math.random(0, 4)
    local baseY = basePos.Y
    local currentZ = basePos.Z

    -- Lava floor stretching the whole corridor
    local corridorLength = islandCount * 12 + 20
    local lavaFloor = makePart({
        name = "LavaFloor_" .. levelNum,
        size = Vector3.new(corridorWidth, 0.5, corridorLength),
        position = Vector3.new(0, baseY - 4, currentZ + corridorLength / 2),
        color = KILL_COLOR,
        material = KILL_MATERIAL,
        neon = true,
        noSparkles = true,
    })
    table.insert(killBricks, lavaFloor)

    -- Optional corridor walls
    for _, side in ipairs({-1, 1}) do
        makePart({
            name = "LavaWall_" .. levelNum .. "_" .. (side == 1 and "R" or "L"),
            size = Vector3.new(1, 8, corridorLength),
            position = Vector3.new(side * (corridorWidth / 2 + 0.5), baseY, currentZ + corridorLength / 2),
            color = Color3.fromRGB(60, 60, 70),
            material = Enum.Material.Slate,
            noSparkles = true,
            noLight = true,
        })
    end

    -- Safe islands scattered across the lava
    for i = 1, islandCount do
        local ix = math.random(-math.floor(corridorWidth / 3), math.floor(corridorWidth / 3))
        local iz = currentZ + 8 + (i - 1) * 12 + math.random(-3, 3)
        local islandSize = math.max(3, 6 - diff * 0.4 + math.random(0, 2))

        local island = makePart({
            name = "LavaIsland_" .. levelNum .. "_" .. i,
            size = Vector3.new(islandSize, 1, islandSize),
            position = Vector3.new(ix, baseY, iz),
            color = randomBright(),
            material = PLATFORM_MATERIAL,
        })
        applyPlatformTexture(island, levelNum * 10 + i)
        if i <= 2 or (i > 2 and math.random() < 0.35) then
            placeMemeNpcOnPlatform(island, levelNum)
        end
    end

    local endZ = currentZ + corridorLength
    return Vector3.new(0, baseY, endZ)
end

-- CLIMB: TrussPart ladder sections going upward with platforms between
local function buildClimbLevel(levelNum, basePos)
    local diff = getDifficulty(levelNum)
    local climbSections = 2 + math.floor(diff * 0.3) + math.random(0, 1)
    local baseY = basePos.Y
    local currentZ = basePos.Z

    for i = 1, climbSections do
        -- Platform before climb
        local platX = math.random(-4, 4)
        local plat = makePart({
            name = "ClimbPlat_" .. levelNum .. "_" .. i,
            size = Vector3.new(8 + math.random(0, 4), 1, 8),
            position = Vector3.new(platX, baseY, currentZ),
            color = randomBright(),
            material = PLATFORM_MATERIAL,
        })
        applyPlatformTexture(plat, levelNum * 10 + i)
        if math.random() < 0.5 then
            placeMemeNpcOnPlatform(plat, levelNum)
        end

        -- Truss ladder going up
        local ladderHeight = 8 + math.random(0, 6) + diff * 2
        local ladderX = platX + math.random(-2, 2)
        local truss = Instance.new("TrussPart")
        truss.Name = "Ladder_" .. levelNum .. "_" .. i
        truss.Size = Vector3.new(2, ladderHeight, 2)
        truss.Position = _stageShift(Vector3.new(ladderX, baseY + ladderHeight / 2, currentZ + 3))
        truss.Anchored = true
        truss.Color = Color3.fromRGB(150, 120, 80)
        truss.Material = Enum.Material.Wood
        truss.Parent = container

        baseY = baseY + ladderHeight
        currentZ = currentZ + 8 + math.random(0, 4)
    end

    -- Final platform at top
    makePart({
        name = "ClimbTop_" .. levelNum,
        size = PLATFORM_SIZE,
        position = Vector3.new(0, baseY, currentZ),
        color = randomBright(),
        material = PLATFORM_MATERIAL,
    })

    return Vector3.new(0, baseY, currentZ)
end

-- ═══════════════════════════════════════════
-- BUILD SPAWN AREA
-- ═══════════════════════════════════════════
local function buildSpawnArea()
    -- Raised spawn platform so the whole obby floats clearly above the baseplate.
    -- Must align with START_Y used by the level loop below (currentY = 20).
    local SPAWN_Y = 20
    makePart({
        name = "SpawnPlatform",
        size = Vector3.new(30, 1, 30),
        position = Vector3.new(0, SPAWN_Y, 0),
        color = Color3.fromRGB(100, 200, 255),
        material = Enum.Material.SmoothPlastic,
        label = "${theme}",
        labelOffset = 8,
        labelColor = Color3.fromRGB(255, 255, 255),
    })

    -- Spawn location — explicitly Neutral/Enabled so the engine always picks
    -- THIS one for player respawn, not some leftover default baseplate spawn.
    local spawn = Instance.new("SpawnLocation")
    spawn.Name = "MainSpawn"
    spawn.Size = Vector3.new(6, 1, 6)
    spawn.Position = Vector3.new(0, SPAWN_Y + 0.5, 0)
    spawn.Anchored = true
    spawn.CanCollide = true
    spawn.Color = Color3.fromRGB(50, 150, 255)
    spawn.Material = Enum.Material.SmoothPlastic
    spawn.Neutral = true
    spawn.Enabled = true
    spawn.AllowTeamChangeOnTouch = false
    spawn.Parent = container

    -- Quality gate route start: the first playable jump is always straight
    -- ahead from spawn, so players never face two ambiguous exits or fall
    -- because stage 1 shifted sideways.
    makePart({
        name = "RouteStartBridge",
        size = Vector3.new(14, 1, 24),
        position = Vector3.new(0, SPAWN_Y, 16),
        color = CHECKPOINT_COLOR,
        material = Enum.Material.Neon,
        neon = true,
        noSparkles = true,
        pointLight = true,
        label = "START ->",
        labelOffset = 5,
        labelColor = Color3.fromRGB(210, 255, 120),
    })
    makePart({
        name = "RouteStartArrow",
        size = Vector3.new(2.2, 0.25, 10),
        position = Vector3.new(0, SPAWN_Y + 0.85, 17),
        color = ROUTE_GUIDE_COLOR,
        material = Enum.Material.Neon,
        neon = true,
        noSparkles = true,
        pointLight = true,
    })

    -- Decorative arch (anchored to SPAWN_Y so it sits above the raised spawn)
    makePart({
        name = "Arch_L",
        size = Vector3.new(2, 15, 2),
        position = Vector3.new(-6, SPAWN_Y + 7.5, -5),
        color = Color3.fromRGB(255, 200, 50),
        material = Enum.Material.Neon,
        neon = true,
        noSparkles = true,
    })
    makePart({
        name = "Arch_R",
        size = Vector3.new(2, 15, 2),
        position = Vector3.new(6, SPAWN_Y + 7.5, -5),
        color = Color3.fromRGB(255, 200, 50),
        material = Enum.Material.Neon,
        neon = true,
        noSparkles = true,
    })
    makePart({
        name = "Arch_Top",
        size = Vector3.new(14, 2, 2),
        position = Vector3.new(0, SPAWN_Y + 15.5, -5),
        color = Color3.fromRGB(255, 200, 50),
        material = Enum.Material.Neon,
        neon = true,
        sparkles = true,
    })
end

-- ═══════════════════════════════════════════
-- BUILD CHECKPOINT
-- ═══════════════════════════════════════════
local checkpoints = {}

local function buildCheckpoint(checkpointNum, position)
    local cp = makePart({
        name = "Checkpoint_" .. checkpointNum,
        size = Vector3.new(16, 1, 16),
        position = position,
        color = CHECKPOINT_COLOR,
        material = Enum.Material.Neon,
        neon = true,
        label = "Checkpoint " .. checkpointNum,
        labelOffset = 6,
        labelColor = Color3.fromRGB(0, 255, 0),
        sparkles = true,
        pointLight = true,
    })
    cp:SetAttribute("Checkpoint", checkpointNum)
    table.insert(checkpoints, {num = checkpointNum, part = cp})
    -- Session #077: float a theme phrase above every checkpoint
    attachMemeText(cp, checkpointNum * 3)

    -- Green glow pillar
    makePart({
        name = "CP_Pillar_" .. checkpointNum,
        size = Vector3.new(1, 10, 1),
        position = position + Vector3.new(7, 5, 7),
        color = CHECKPOINT_COLOR,
        material = Enum.Material.Neon,
        neon = true,
        transparency = 0.5,
        noSparkles = true,
        noLight = true,
    })
    buildHospitalCheckpointDressing(checkpointNum, position)
    buildSchoolCheckpointDressing(checkpointNum, position)
    buildLabCheckpointDressing(checkpointNum, position)
    buildSlimeCheckpointDressing(checkpointNum, position)
end

-- ═══════════════════════════════════════════
-- BUILD WIN PLATFORM
-- ═══════════════════════════════════════════
local function buildWinPlatform(position)
    local win = makePart({
        name = "WinPlatform",
        size = Vector3.new(20, 2, 20),
        position = position,
        color = WIN_COLOR,
        material = Enum.Material.Neon,
        neon = true,
        label = "YOU WIN!",
        labelOffset = 8,
        labelColor = Color3.fromRGB(255, 255, 255),
        sparkles = true,
        pointLight = true,
    })

    -- Trophy pillar
    makePart({
        name = "TrophyPillar",
        size = Vector3.new(3, 12, 3),
        position = position + Vector3.new(0, 6, 0),
        color = WIN_COLOR,
        material = Enum.Material.Neon,
        neon = true,
        sparkles = true,
    })
end

-- ═══════════════════════════════════════════
-- PLAYER STATE
-- ═══════════════════════════════════════════
local playerStages = {}
local playerTimers = {}
local playerWon = {}
local playerCheckpoints = {}

local function formatTime(seconds)
    local mins = math.floor(seconds / 60)
    local secs = math.floor(seconds % 60)
    local ms = math.floor((seconds % 1) * 10)
    if mins > 0 then
        return string.format("%d:%02d.%d", mins, secs, ms)
    end
    return string.format("%d.%d", secs, ms)
end

-- ═══════════════════════════════════════════
-- HUD
-- ═══════════════════════════════════════════
local function createHud(player)
    local screenGui = Instance.new("ScreenGui")
    screenGui.Name = "ObbyHud"
    screenGui.ResetOnSpawn = false
    screenGui.Parent = player.PlayerGui

    local bar = Instance.new("Frame")
    bar.Name = "TopBar"
    bar.Size = UDim2.new(0.28, 0, 0, 36)
    bar.Position = UDim2.new(0.36, 0, 0, 8)
    bar.BackgroundColor3 = Color3.fromRGB(20, 20, 40)
    bar.BackgroundTransparency = 0.3
    bar.Parent = screenGui
    local barCorner = Instance.new("UICorner")
    barCorner.CornerRadius = UDim.new(0, 12)
    barCorner.Parent = bar

    local stageLabel = Instance.new("TextLabel")
    stageLabel.Name = "StageLabel"
    stageLabel.Size = UDim2.new(0.6, 0, 1, 0)
    stageLabel.Position = UDim2.new(0.05, 0, 0, 0)
    stageLabel.BackgroundTransparency = 1
    stageLabel.Text = "Stage 0 / ${levels}"
    stageLabel.TextColor3 = Color3.new(1, 1, 1)
    stageLabel.TextScaled = true
    stageLabel.Font = Enum.Font.GothamBold
    stageLabel.TextXAlignment = Enum.TextXAlignment.Left
    stageLabel.Parent = bar

    -- Session #077: Build ID label to verify each play is a new generation
    local buildIdLabel = Instance.new("TextLabel")
    buildIdLabel.Name = "BuildId"
    buildIdLabel.Size = UDim2.new(0.2, 0, 0.5, 0)
    buildIdLabel.Position = UDim2.new(0.78, 0, 0, 2)
    buildIdLabel.BackgroundTransparency = 1
    buildIdLabel.Text = "#" .. _BUILD_ID
    buildIdLabel.TextColor3 = Color3.fromRGB(150, 150, 180)
    buildIdLabel.TextScaled = true
    buildIdLabel.Font = Enum.Font.Gotham
    buildIdLabel.Parent = bar

    local timeLabel = Instance.new("TextLabel")
    timeLabel.Name = "TimeLabel"
    timeLabel.Size = UDim2.new(0.35, 0, 1, 0)
    timeLabel.Position = UDim2.new(0.6, 0, 0, 0)
    timeLabel.BackgroundTransparency = 1
    timeLabel.Text = "0.0"
    timeLabel.TextColor3 = Color3.fromRGB(255, 215, 0)
    timeLabel.TextScaled = true
    timeLabel.Font = Enum.Font.GothamBold
    timeLabel.TextXAlignment = Enum.TextXAlignment.Right
    timeLabel.Parent = bar

    return screenGui
end

local function updateHud(player, stageText, timeText)
    local gui = player.PlayerGui:FindFirstChild("ObbyHud")
    if not gui then return end
    local stageLabel = gui:FindFirstChild("TopBar") and gui.TopBar:FindFirstChild("StageLabel")
    if stageLabel then stageLabel.Text = stageText end
    local timeLabel = gui:FindFirstChild("TopBar") and gui.TopBar:FindFirstChild("TimeLabel")
    if timeLabel then timeLabel.Text = timeText or "" end
end
${obbyShopLua}

-- ═══════════════════════════════════════════
-- PLAYER SETUP
-- ═══════════════════════════════════════════
local function setupPlayer(player)
    playerStages[player.UserId] = 0
    playerTimers[player.UserId] = tick()
    playerWon[player.UserId] = false
    playerCheckpoints[player.UserId] = 0
${memeLeaderstatsLua}

    createHud(player)

    player.CharacterAdded:Connect(function(character)
        local humanoid = character:WaitForChild("Humanoid")
        local rootPart = character:WaitForChild("HumanoidRootPart")
        task.wait(0.5)
${memeSpawnSoundLua}

        -- Respawn at checkpoint
        local cpNum = playerCheckpoints[player.UserId] or 0
        for _, cp in checkpoints do
            if cp.num == cpNum then
                rootPart.CFrame = cp.part.CFrame + Vector3.new(0, 5, 0)
                break
            end
        end

        -- Wire kill bricks for this character
        for _, killPart in killBricks do
            killPart.Touched:Connect(function(hit)
                local hitPlayer = Players:GetPlayerFromCharacter(hit.Parent)
                if hitPlayer == player then
                    humanoid.Health = 0
                end
            end)
        end
    end)
end

-- ═══════════════════════════════════════════
-- CHECKPOINT & WIN LOGIC
-- ═══════════════════════════════════════════
local function setupCheckpoints()
    for _, cp in checkpoints do
        cp.part.Touched:Connect(function(hit)
            local player = Players:GetPlayerFromCharacter(hit.Parent)
            if not player then return end
            if playerWon[player.UserId] then return end
            local current = playerCheckpoints[player.UserId] or 0
            if cp.num > current then
                playerCheckpoints[player.UserId] = cp.num
                playerStages[player.UserId] = cp.num * CHECKPOINT_EVERY
                local elapsed = tick() - (playerTimers[player.UserId] or tick())
                updateHud(player, "Checkpoint " .. cp.num .. " ✓  Stage " .. (cp.num * CHECKPOINT_EVERY) .. " / ${levels}", formatTime(elapsed))
            end
        end)
    end
end

local function setupWinPlatform()
    local winPart = container:FindFirstChild("WinPlatform")
    if not winPart then return end
    winPart.Touched:Connect(function(hit)
        local player = Players:GetPlayerFromCharacter(hit.Parent)
        if not player then return end
        if playerWon[player.UserId] then return end
        playerWon[player.UserId] = true
        playerStages[player.UserId] = TOTAL_LEVELS
        local elapsed = tick() - (playerTimers[player.UserId] or tick())
        local timeStr = formatTime(elapsed)
        updateHud(player, "🎉 YOU WIN!", "Time: " .. timeStr)

        -- Win celebration
        local screenGui = Instance.new("ScreenGui")
        screenGui.Name = "WinFlash"
        screenGui.Parent = player.PlayerGui
        local frame = Instance.new("Frame")
        frame.Size = UDim2.new(1, 0, 1, 0)
        frame.BackgroundColor3 = WIN_COLOR
        frame.BackgroundTransparency = 0.4
        frame.BorderSizePixel = 0
        frame.Parent = screenGui
        local label = Instance.new("TextLabel")
        label.Size = UDim2.new(0.8, 0, 0.3, 0)
        label.Position = UDim2.new(0.1, 0, 0.35, 0)
        label.BackgroundTransparency = 1
        label.Text = "🎉 YOU WIN!\\nTime: " .. timeStr
        label.TextColor3 = Color3.new(1, 1, 1)
        label.TextStrokeTransparency = 0
        label.TextScaled = true
        label.Font = Enum.Font.GothamBold
        label.Parent = frame
        task.delay(3, function()
            local tween = TweenService:Create(frame, TweenInfo.new(1, Enum.EasingStyle.Quad), {BackgroundTransparency = 1})
            local textTween = TweenService:Create(label, TweenInfo.new(1, Enum.EasingStyle.Quad), {TextTransparency = 1, TextStrokeTransparency = 1})
            tween:Play()
            textTween:Play()
            task.delay(1.2, function() screenGui:Destroy() end)
        end)
        print("[Obby] " .. player.Name .. " completed in " .. timeStr)
    end)
end

-- ═══════════════════════════════════════════
-- TRACK PLAYER PROGRESS (touch any platform)
-- ═══════════════════════════════════════════
local function setupPlatformTracking()
    for _, obj in container:GetDescendants() do
        if obj:IsA("BasePart") and (obj.Name:match("^Jump_") or obj.Name:match("^Safe_") or obj.Name:match("^SpinBase_") or obj.Name:match("^Disappear_")) then
            obj.Touched:Connect(function(hit)
                local player = Players:GetPlayerFromCharacter(hit.Parent)
                if not player then return end
                if playerWon[player.UserId] then return end
                -- Extract level number from part name
                local levelStr = obj.Name:match("_(%d+)_")
                if not levelStr then return end
                local levelNum = tonumber(levelStr) or 0
                local current = playerStages[player.UserId] or 0
                if levelNum > current then
                    playerStages[player.UserId] = levelNum
                    local elapsed = tick() - (playerTimers[player.UserId] or tick())
                    updateHud(player, "Stage " .. levelNum .. " / ${levels}", formatTime(elapsed))
                end
            end)
        end
    end
end

-- ═══════════════════════════════════════════
-- KILL BRICK LOGIC (for parts not handled per-character)
-- ═══════════════════════════════════════════
local function setupKillBricks()
    for _, killPart in killBricks do
        killPart.Touched:Connect(function(hit)
            local humanoid = hit.Parent:FindFirstChild("Humanoid")
            if humanoid then
                humanoid.Health = 0
            end
        end)
    end
end

-- Session 234: actual route layout. Individual level builders still create
-- their local obstacle micro-layout around X=0, but the stage shift below
-- moves whole stages sideways and adds safe connector pads between them.
local function computeStageX(levelNum, lastX)
    if levelNum == 1 then
        return 0
    end
    if LAYOUT_STYLE == "corridor" then
        return 0
    elseif LAYOUT_STYLE == "zigzag" then
        local side = (levelNum % 2 == 0) and 1 or -1
        return side * (18 + (levelNum % 3) * 5)
    elseif LAYOUT_STYLE == "islands" then
        return math.clamp(math.floor(math.sin(levelNum * 0.85 + LAYOUT_SEED * 0.001) * 28 + math.random(-7, 7)), -36, 36)
    elseif LAYOUT_STYLE == "tower" then
        return ((levelNum % 4) - 1.5) * 11
    elseif LAYOUT_STYLE == "loop" then
        return math.floor(math.sin(levelNum * 0.7 + LAYOUT_SEED * 0.0007) * 30)
    elseif LAYOUT_STYLE == "gauntlet" then
        return math.clamp(lastX + math.random(-18, 18), -32, 32)
    end
    return math.clamp(lastX + math.random(-16, 16), -30, 30)
end

local function buildLayoutConnector(levelNum, fromX, toX, y, z)
    local dx = toX - fromX
    if math.abs(dx) < 6 then return end
    local steps = math.clamp(math.ceil(math.abs(dx) / 10), 2, 5)
    for i = 1, steps do
        local t = i / (steps + 1)
        local x = fromX + dx * t
        local p = makePart({
            name = "LayoutConnector_" .. levelNum .. "_" .. i,
            size = Vector3.new(9, 1, 9),
            position = Vector3.new(x, y, z + i * 7),
            color = CHECKPOINT_COLOR,
            material = Enum.Material.Neon,
            neon = true,
            noSparkles = true,
            pointLight = true,
            worldSpace = true,
            label = i == steps and "NEXT" or nil,
            labelOffset = 5,
            labelColor = Color3.fromRGB(210, 255, 120),
        })
        local light = p:FindFirstChildOfClass("PointLight")
        if light then
            light.Brightness = 2.4
            light.Range = 26
            light.Color = CHECKPOINT_COLOR
        end
        applyPlatformTexture(p, levelNum * 100 + i)
    end
end

local function buildRouteGuide(levelNum, basePos, endPos)
    if not endPos then return end
    local minZ = math.min(basePos.Z, endPos.Z)
    local maxZ = math.max(basePos.Z, endPos.Z)
    local midZ = (minZ + maxZ) / 2
    local guideY = basePos.Y + 1.05
    local shaft = makePart({
        name = "RouteGuide_" .. levelNum .. "_Shaft",
        size = Vector3.new(1.8, 0.25, math.max(9, math.min(18, maxZ - minZ))),
        position = Vector3.new(0, guideY, midZ),
        color = Color3.fromRGB(120, 255, 80),
        material = Enum.Material.Neon,
        neon = true,
        canCollide = false,
        noSparkles = true,
        pointLight = true,
        label = "NEXT",
        labelOffset = 4.5,
        labelColor = ROUTE_GUIDE_LABEL_COLOR,
    })
    local pl = shaft:FindFirstChildOfClass("PointLight")
    if pl then
        pl.Brightness = 2.0
        pl.Range = 26
        pl.Color = ROUTE_GUIDE_COLOR
    end
    local left = makePart({
        name = "RouteGuide_" .. levelNum .. "_ArrowL",
        size = Vector3.new(1.2, 0.25, 5.4),
        position = Vector3.new(-1.8, guideY, maxZ - 2.5),
        color = ROUTE_GUIDE_COLOR,
        material = Enum.Material.Neon,
        neon = true,
        canCollide = false,
        noSparkles = true,
    })
    left.Orientation = Vector3.new(0, -34, 0)
    local right = makePart({
        name = "RouteGuide_" .. levelNum .. "_ArrowR",
        size = Vector3.new(1.2, 0.25, 5.4),
        position = Vector3.new(1.8, guideY, maxZ - 2.5),
        color = ROUTE_GUIDE_COLOR,
        material = Enum.Material.Neon,
        neon = true,
        canCollide = false,
        noSparkles = true,
    })
    right.Orientation = Vector3.new(0, 34, 0)
end

local function buildReadabilityLamp(levelNum, basePos, endPos)
    local midZ = (basePos.Z + (endPos and endPos.Z or basePos.Z)) / 2
    local lamp = makePart({
        name = "ReadabilityLamp_" .. levelNum,
        size = Vector3.new(1.4, 1.4, 1.4),
        position = Vector3.new(0, basePos.Y + 5.5, midZ),
        color = CHECKPOINT_COLOR,
        material = Enum.Material.Neon,
        neon = true,
        noSparkles = true,
        pointLight = true,
    })
    local pl = lamp:FindFirstChildOfClass("PointLight")
    if pl then
        pl.Brightness = 2.8
        pl.Range = 32
        pl.Color = CHECKPOINT_COLOR
    end
end

-- ═══════════════════════════════════════════
-- BUILD THE ENTIRE OBBY
-- ═══════════════════════════════════════════
print("[Obby] Building ${levels} levels with layout " .. LAYOUT_STYLE .. "...")

buildSpawnArea()
buildHospitalSpawnLobby(Vector3.new(0, 20, 0))
buildSchoolSpawnLobby(Vector3.new(0, 20, 0))
buildLabSpawnLobby(Vector3.new(0, 20, 0))
buildSlimeSpawnLobby(Vector3.new(0, 20, 0))
buildObbyDescriptionBoard(Vector3.new(0, 20, 0))
${obbyShopBuildCallLua}

local currentZ = 20 -- Start after spawn area
-- Start obby well above the baseplate so platforms clearly float and the player
-- actually has to jump between them (not walk across a floor at ground level).
local currentY = 20
local currentX = 0
local checkpointCount = 0
local _BUILD_ID = string.format("%04d", math.random(1000, 9999))

for level = 1, TOTAL_LEVELS do
    local nextX = computeStageX(level, currentX)
    buildLayoutConnector(level, currentX, nextX, currentY, currentZ - 4)
    currentX = nextX
    _STAGE_X_SHIFT = currentX
    local basePos = Vector3.new(0, currentY, currentZ)
    local levelType = pickType(level)
    local endPos

    if levelType == "jump" then
        endPos = buildJumpLevel(level, basePos)
    elseif levelType == "kill_brick" then
        endPos = buildKillBrickLevel(level, basePos)
    elseif levelType == "moving_platform" then
        endPos = buildMovingPlatformLevel(level, basePos)
    elseif levelType == "spinner" then
        endPos = buildSpinnerLevel(level, basePos)
    elseif levelType == "disappearing" then
        endPos = buildDisappearingLevel(level, basePos)
    elseif levelType == "wallhop" then
        endPos = buildWallhopLevel(level, basePos)
    elseif levelType == "tightrope" then
        endPos = buildTightropeLevel(level, basePos)
    elseif levelType == "lava_run" then
        endPos = buildLavaRunLevel(level, basePos)
    elseif levelType == "climb" then
        endPos = buildClimbLevel(level, basePos)
    end
    buildHospitalStageDressing(level, basePos, endPos, levelType)
    buildSchoolStageDressing(level, basePos, endPos, levelType)
    buildLabStageDressing(level, basePos, endPos, levelType)
    buildSlimeStageDressing(level, basePos, endPos, levelType)
    placeObbyDecorationForLevel(level, basePos, endPos)
    buildRouteGuide(level, basePos, endPos)
    buildReadabilityLamp(level, basePos, endPos)
${memeCollectibleInLoopLua}

    -- Advance position with random variation for unique layouts
    currentZ = endPos.Z + 10 + math.random(0, 8)
    currentY = currentY + math.random(-1, 2)

    -- Checkpoint every CHECKPOINT_EVERY levels
    if level % CHECKPOINT_EVERY == 0 then
        checkpointCount = checkpointCount + 1
        buildCheckpoint(checkpointCount, Vector3.new(0, currentY - 1, currentZ))
        currentZ = currentZ + 20
    end
end

-- Win platform at the end
_STAGE_X_SHIFT = currentX
local winPosition = Vector3.new(0, currentY + 2, currentZ + 20)
buildWinPlatform(winPosition)
buildHospitalRescueFinish(winPosition)
buildSchoolRescueFinish(winPosition)
buildLabRescueFinish(winPosition)
buildSlimeRescueFinish(winPosition)

print("[Obby] Built ${levels} levels + " .. checkpointCount .. " checkpoints + win platform; layout=" .. LAYOUT_STYLE)

-- ═══════════════════════════════════════════
-- TIMER HUD UPDATE LOOP
-- ═══════════════════════════════════════════
task.spawn(function()
    while true do
        for _, player in Players:GetPlayers() do
            if not playerWon[player.UserId] and playerTimers[player.UserId] then
                local elapsed = tick() - playerTimers[player.UserId]
                local stage = playerStages[player.UserId] or 0
                updateHud(player, "Stage " .. stage .. " / ${levels}", formatTime(elapsed))
            end
        end
        task.wait(0.5)
    end
end)

-- ═══════════════════════════════════════════
-- INIT
-- ═══════════════════════════════════════════
Players.PlayerAdded:Connect(setupPlayer)
for _, player in Players:GetPlayers() do setupPlayer(player) end
task.wait(1)
setupKillBricks()
setupCheckpoints()
setupWinPlatform()
setupPlatformTracking()
print("[Obby] Initialized — ${levels} levels, " .. checkpointCount .. " checkpoints, 5 obstacle types")
${buildHeroAssetsLua(params.heroAssets ?? [])}
`;

  const qualityIssues: string[] = [];
  if (!luaScript.includes('OBBY_QUALITY_GATE_VERSION = 1')) qualityIssues.push('missing quality gate marker');
  if (!luaScript.includes('RouteStartBridge')) qualityIssues.push('missing spawn-to-stage route bridge');
  if (!luaScript.includes('RouteGuide_')) qualityIssues.push('missing per-stage route guide arrows');
  if (!luaScript.includes('ReadabilityLamp_')) qualityIssues.push('missing readability lamps');
  if (!luaScript.includes('buildLayoutConnector(')) qualityIssues.push('missing safe layout connectors');
  if (!/if levelNum == 1 then\s+return 0/.test(luaScript)) qualityIssues.push('stage 1 is not locked to spawn X=0');
  if (hasDeterministicEnvironmentKit && decorationStations.length > 0) qualityIssues.push('deterministic kit still has live/image decoration stations');
  if (isSlimeHorror) {
    if (!luaScript.includes('SLIME_SET_DRESSING_VERSION = 1')) qualityIssues.push('slime theme missing deterministic slime kit');
    if (luaScript.includes('LAB_SET_DRESSING_VERSION = 1')) qualityIssues.push('slime theme leaked lab kit');
    if (!luaScript.includes('buildSlimeStageDressing(level')) qualityIssues.push('slime stage dressing not called');
  }
  if (qualityIssues.length > 0) {
    // eslint-disable-next-line no-console
    console.warn('[ObbyQualityGate] failed', { themeKey, layoutStyle, issues: qualityIssues });
    throw new Error(`ObbyQualityGate failed: ${qualityIssues.join('; ')}`);
  }
  // eslint-disable-next-line no-console
  console.info('[ObbyQualityGate] passed', {
    themeKey,
    layoutStyle,
    levels,
    deterministicEnvironmentKit: hasDeterministicEnvironmentKit,
    checks: 7 + (isSlimeHorror ? 3 : 0),
  });

  return {
    serverScript: luaScript,
    additionalScripts: [
      {
        name: 'ObbyLevelData',
        scriptType: 'ModuleScript',
        container: 'ReplicatedStorage',
        source: `-- Obby Level Data (structured JSON)\nlocal LevelData = ${obbyJson}\nreturn LevelData`,
      },
    ],
  };
}

function buildTycoonConfigModule(params: GameTemplateParams): string {
  const currency = params.currencyName || 'Coins';
  const theme = TYCOON_THEMES[params.tycoonThemeKey || 'default'] || TYCOON_THEMES.default;
  const dt = theme.dropperTiers;
  const pl = theme.purchaseLabels;
  return `-- TycoonConfig: shared between Server and Client
local Config = {}

Config.CURRENCY_NAME = "${currency}"
Config.THEME_NAME = "${theme.name}"
Config.REBIRTH_BASE_COST = 800000
Config.SAVE_INTERVAL = 60

Config.DROPPER_TIERS = {
    { name = "${dt[0]}",     dropValue = 5,    dropInterval = 2.0,  dropColor = Color3.new(1, 0.85, 0),    unlockCost = 0 },
    { name = "${dt[1]}",    dropValue = 15,   dropInterval = 1.6,  dropColor = Color3.new(0.75, 0.75, 0.8), unlockCost = 2000 },
    { name = "${dt[2]}",      dropValue = 40,   dropInterval = 1.2,  dropColor = Color3.new(1, 0.75, 0.2),  unlockCost = 8000 },
    { name = "${dt[3]}",   dropValue = 100,  dropInterval = 0.9,  dropColor = Color3.new(0.4, 0.85, 1),  unlockCost = 25000 },
    { name = "${dt[4]}",    dropValue = 250,  dropInterval = 0.7,  dropColor = Color3.new(0.9, 0.3, 1),   unlockCost = 80000 },
    { name = "${dt[5]}", dropValue = 600,  dropInterval = 0.5,  dropColor = Color3.new(1, 0.5, 0),     unlockCost = 250000 },
    { name = "${dt[6]}",    dropValue = 1500, dropInterval = 0.35, dropColor = Color3.new(1, 1, 1),       unlockCost = 1000000 },
}

Config.UPGRADE_BASE_COSTS = { speed = 50, value = 75, capacity = 100 }

-- Tier system: all pads in a tier visible at once, buy in any order
Config.TIERS = {
    [1] = { from = 1, to = 8 },
    [2] = { from = 9, to = 16 },
    [3] = { from = 17, to = 24 },
    [4] = { from = 25, to = 30 },
}

-- Upgrader multipliers: parts on conveyor that multiply drop value
Config.UPGRADER_MULTIPLIERS = {
    Upgrader_1 = 1.5,
    Upgrader_2 = 2.0,
    Upgrader_3 = 3.0,
}

-- 30 purchases in 4 tiers (themed labels)
Config.PURCHASES = {
    -- TIER 1: Startup ($50-$2500)
    [ 1] = { label = "${pl[0]}", parts = {"Upgrade_1", "UpgradeLabel_1"} },
    [ 2] = { label = "${pl[1]}", parts = {"Conveyor_2", "ConveyorSupport_3", "ConveyorSupport_4"} },
    [ 3] = { label = "${pl[2]}", parts = {"Upgrade_2", "UpgradeLabel_2"} },
    [ 4] = { label = "${pl[3]}", parts = {"Crate_1", "Crate_2", "Crate_3"} },
    [ 5] = { label = "${pl[4]}", parts = {"WorkshopWall_1", "WorkshopWall_2"} },
    [ 6] = { label = "${pl[5]}", parts = {"WorkshopRoof", "WorkshopFloor"} },
    [ 7] = { label = "${pl[6]}", parts = {"Button_1", "ButtonPedestal_1"} },
    [ 8] = { label = "${pl[7]}", parts = {"Upgrade_3", "UpgradeLabel_3"} },
    -- TIER 2: Factory ($4000-$50000)
    [9] = { label = "${pl[8]}", parts = {"Dropper_2", "DropperPipe_2"} },
    [10] = { label = "${pl[9]}", parts = {"Upgrader_1", "UpgraderLabel_1"} },
    [11] = { label = "${pl[10]}", parts = {"FactoryWall_1", "FactoryWall_2"} },
    [12] = { label = "${pl[11]}", parts = {"FactoryRoof", "FactoryFloor"} },
    [13] = { label = "${pl[12]}", parts = {"LightPost_1", "LightBall_1", "LightPost_2", "LightBall_2"} },
    [14] = { label = "${pl[13]}", parts = {"Machine_1", "Machine_2", "MachinePedestal"} },
    [15] = { label = "${pl[14]}", parts = {"Conveyor_3", "ConveyorSupport_5", "ConveyorSupport_6"} },
    [16] = { label = "${pl[15]}", parts = {"NeonSign_1"} },
    -- TIER 3: Empire ($75000-$800000)
    [17] = { label = "${pl[16]}", parts = {"Dropper_3", "DropperPipe_3"} },
    [18] = { label = "${pl[17]}", parts = {"Upgrader_2", "UpgraderLabel_2"} },
    [19] = { label = "${pl[18]}", parts = {"Gate_1", "ExpansionPlot_1"} },
    [20] = { label = "${pl[19]}", parts = {"Trophy_1", "TrophyPedestal_1"} },
    [21] = { label = "${pl[20]}", parts = {"WarehouseWall_1", "WarehouseWall_2", "WarehouseRoof", "WarehouseFloor"} },
    [22] = { label = "${pl[21]}", parts = {"Collector_2"} },
    [23] = { label = "${pl[22]}", parts = {"Plant_1", "Plant_2", "Fountain"} },
    [24] = { label = "${pl[23]}", parts = {"RebirthPlatform", "RebirthButton"} },
    -- TIER 4: Endgame ($1.2M-$8M)
    [25] = { label = "${pl[24]}", parts = {"Upgrader_3", "UpgraderLabel_3"} },
    [26] = { label = "${pl[25]}", parts = {"Gate_2", "ExpansionPlot_2"} },
    [27] = { label = "${pl[26]}", parts = {"Dropper_4", "DropperPipe_4"} },
    [28] = { label = "${pl[27]}", parts = {"Monument", "MonumentBase"} },
    [29] = { label = "${pl[28]}", parts = {"Gate_3", "ExpansionPlot_3"} },
    [30] = { label = "${pl[29]}", parts = {"Crown", "CrownPedestal"} },
}
Config.TOTAL_PURCHASES = 30

function Config.upgradeCost(baseKey, level)
    local base = Config.UPGRADE_BASE_COSTS[baseKey] or 50
    return math.floor(base * math.pow(level + 1, 1.5))
end

function Config.rebirthCost(rebirthCount)
    return math.floor(Config.REBIRTH_BASE_COST * math.pow(rebirthCount + 1, 2))
end

function Config.getDefaultData()
    return {
        version = 3,
        currency = 0,
        dropperTier = 1,
        speedLevel = 0,
        valueLevel = 0,
        capacityLevel = 0,
        rebirthCount = 0,
        rebirthMultiplier = 1,
        purchases = {},
        activeDrops = 0,
        totalEarned = 0,
    }
end

return Config
`;
}

function buildTycoonServerScript(params: GameTemplateParams): string {
  return `local Players = game:GetService("Players")
local Debris = game:GetService("Debris")
local DataStoreService = game:GetService("DataStoreService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local CONFIG = require(ReplicatedStorage:WaitForChild("TycoonConfig"))

local GC = workspace:WaitForChild("GeneratedContent", 10)
if not GC then
    warn("[Tycoon] GeneratedContent folder not found! Creating fallback.")
    GC = Instance.new("Folder")
    GC.Name = "GeneratedContent"
    GC.Parent = workspace
end

-- DataStore
local dataStore
local dataStoreOk, dataStoreErr = pcall(function()
    dataStore = DataStoreService:GetDataStore("TycoonData_v3")
end)
if not dataStoreOk then warn("[Tycoon] DataStore unavailable: " .. tostring(dataStoreErr)) end

-- RemoteEvents
local remotes = Instance.new("Folder"); remotes.Name = "TycoonRemotes"; remotes.Parent = ReplicatedStorage
local DataSyncRemote = Instance.new("RemoteEvent"); DataSyncRemote.Name = "DataSyncRemote"; DataSyncRemote.Parent = remotes
local CollectFXRemote = Instance.new("RemoteEvent"); CollectFXRemote.Name = "CollectFXRemote"; CollectFXRemote.Parent = remotes
local PurchaseFXRemote = Instance.new("RemoteEvent"); PurchaseFXRemote.Name = "PurchaseFXRemote"; PurchaseFXRemote.Parent = remotes
local RebirthRemote = Instance.new("RemoteEvent"); RebirthRemote.Name = "RebirthRemote"; RebirthRemote.Parent = remotes
local TierUnlockRemote = Instance.new("RemoteEvent"); TierUnlockRemote.Name = "TierUnlockRemote"; TierUnlockRemote.Parent = remotes
local NPCDialogRemote = Instance.new("RemoteEvent"); NPCDialogRemote.Name = "NPCDialogRemote"; NPCDialogRemote.Parent = remotes

local playerData = {}
local sessionLock = {}
local buyPads = {}
local purchasableParts = {}

-- ── DataStore ──

local function loadPlayerData(player)
    if not dataStore then return CONFIG.getDefaultData() end
    local data
    for attempt = 1, 3 do
        local ok, result = pcall(function() return dataStore:GetAsync("Player_" .. player.UserId) end)
        if ok then data = result; break
        else warn("[Tycoon] Load attempt " .. attempt .. " failed: " .. tostring(result)); if attempt < 3 then task.wait(1) end end
    end
    if data and type(data) == "table" then
        local defaults = CONFIG.getDefaultData()
        for key, val in defaults do if data[key] == nil then data[key] = val end end
        if type(data.purchases) ~= "table" then data.purchases = {} end
        return data
    end
    return CONFIG.getDefaultData()
end

local function savePlayerData(player)
    if not dataStore or sessionLock[player.UserId] then return end
    local data = playerData[player.UserId]; if not data then return end
    local toSave = {}
    for k, v in data do if k ~= "activeDrops" then toSave[k] = v end end
    sessionLock[player.UserId] = true
    pcall(function() dataStore:SetAsync("Player_" .. player.UserId, toSave) end)
    sessionLock[player.UserId] = false
end

-- ── Helpers ──

local function getData(player) return playerData[player.UserId] end

local function syncToClient(player)
    local data = getData(player); if not data then return end
    local ls = player:FindFirstChild("leaderstats")
    if ls then
        local cv = ls:FindFirstChild(CONFIG.CURRENCY_NAME); if cv then cv.Value = math.floor(data.currency) end
        local rv = ls:FindFirstChild("Rebirths"); if rv then rv.Value = data.rebirthCount end
    end
    DataSyncRemote:FireClient(player, {
        currency = data.currency, dropperTier = data.dropperTier,
        speedLevel = data.speedLevel, valueLevel = data.valueLevel,
        capacityLevel = data.capacityLevel, rebirthCount = data.rebirthCount,
        rebirthMultiplier = data.rebirthMultiplier, purchases = data.purchases, totalEarned = data.totalEarned,
    })
end

local function addCurrency(player, amount)
    local data = getData(player); if not data then return end
    data.currency = data.currency + amount
    if amount > 0 then data.totalEarned = data.totalEarned + amount end
    syncToClient(player)
end

local function effectiveDropValue(data, tierValue)
    return tierValue * (1 + 0.25 * data.valueLevel) * data.rebirthMultiplier
end
local function effectiveDropInterval(data, tierInterval)
    return tierInterval * math.max(0.3, 1 - 0.12 * data.speedLevel)
end
local function maxDrops(data) return 5 + data.capacityLevel * 3 end

-- ── Part reveal / hide ──

local function hidePart(obj)
    if not obj or not obj:IsA("BasePart") then return end
    obj.Transparency = 0.99; obj.CanCollide = false
    for _, child in obj:GetChildren() do
        if child:IsA("BillboardGui") or child:IsA("ParticleEmitter") or child:IsA("PointLight") or child:IsA("ProximityPrompt") then
            child.Enabled = false
        end
    end
end

local function showPart(obj)
    if not obj or not obj:IsA("BasePart") then return end
    obj.Transparency = 0; obj.CanCollide = true
    for _, child in obj:GetChildren() do
        if child:IsA("BillboardGui") or child:IsA("ParticleEmitter") or child:IsA("PointLight") then child.Enabled = true end
    end
end

-- ── Wire functional parts ──

local function wirePartFunction(obj)
    if not obj or not obj:IsA("BasePart") then return end
    local name = obj.Name

    if name:match("^Upgrade_%d+$") then
        local num = tonumber(name:match("%d+")) or 1
        local upgradeMap = { [1] = "speed", [2] = "value", [3] = "capacity" }
        local uType = upgradeMap[num] or "speed"
        local prompt = Instance.new("ProximityPrompt")
        prompt.ObjectText = uType:sub(1,1):upper() .. uType:sub(2) .. " Upgrade"
        prompt.HoldDuration = 0.4; prompt.MaxActivationDistance = 8
        prompt.ActionText = "Buy (" .. CONFIG.upgradeCost(uType, 0) .. " " .. CONFIG.CURRENCY_NAME .. ")"
        prompt.Parent = obj
        prompt.Triggered:Connect(function(player)
            local data = getData(player); if not data then return end
            local level = data[uType .. "Level"]
            local cost = CONFIG.upgradeCost(uType, level)
            if data.currency >= cost then
                addCurrency(player, -cost); data[uType .. "Level"] = level + 1; syncToClient(player)
                prompt.ActionText = "Buy (" .. CONFIG.upgradeCost(uType, level + 1) .. " " .. CONFIG.CURRENCY_NAME .. ")"
            end
        end)

    elseif name:match("^Button_%d+$") then
        local prompt = Instance.new("ProximityPrompt")
        prompt.ObjectText = "Dropper Upgrade"; prompt.HoldDuration = 0.5; prompt.MaxActivationDistance = 8
        local t2 = CONFIG.DROPPER_TIERS[2]
        prompt.ActionText = t2 and (t2.name .. " (" .. t2.unlockCost .. " " .. CONFIG.CURRENCY_NAME .. ")") or "Upgrade"
        prompt.Parent = obj
        prompt.Triggered:Connect(function(player)
            local data = getData(player); if not data then return end
            local nextTier = data.dropperTier + 1
            if nextTier > #CONFIG.DROPPER_TIERS then return end
            local tier = CONFIG.DROPPER_TIERS[nextTier]
            if data.currency >= tier.unlockCost then
                addCurrency(player, -tier.unlockCost); data.dropperTier = nextTier; syncToClient(player)
                local after = nextTier + 1
                if after <= #CONFIG.DROPPER_TIERS then
                    prompt.ActionText = CONFIG.DROPPER_TIERS[after].name .. " (" .. CONFIG.DROPPER_TIERS[after].unlockCost .. " " .. CONFIG.CURRENCY_NAME .. ")"
                else prompt.ActionText = "MAX TIER" end
            end
        end)

    elseif name == "RebirthButton" then
        local prompt = Instance.new("ProximityPrompt")
        prompt.ObjectText = "Rebirth"; prompt.HoldDuration = 1.5; prompt.MaxActivationDistance = 8
        prompt.ActionText = "Rebirth (" .. CONFIG.REBIRTH_BASE_COST .. " " .. CONFIG.CURRENCY_NAME .. ")"
        prompt.Parent = obj
        prompt.Triggered:Connect(function(player)
            local data = getData(player); if not data then return end
            local cost = CONFIG.rebirthCost(data.rebirthCount)
            if data.currency >= cost then
                data.currency = 0; data.dropperTier = 1
                data.speedLevel = 0; data.valueLevel = 0; data.capacityLevel = 0
                data.rebirthCount = data.rebirthCount + 1
                data.rebirthMultiplier = 1 + 0.5 * data.rebirthCount
                syncToClient(player); RebirthRemote:FireClient(player)
                prompt.ActionText = "Rebirth (" .. CONFIG.rebirthCost(data.rebirthCount) .. " " .. CONFIG.CURRENCY_NAME .. ")"
            end
        end)

    elseif name:match("^Gate_%d+$") then
        obj.Transparency = 0.6; obj.CanCollide = false

    elseif name:match("^Conveyor_%d+$") then
        obj.Anchored = true
    end
end

-- ── Reveal purchase ──

local function revealPurchase(order)
    local info = CONFIG.PURCHASES[order]; if not info then return end
    for _, partName in info.parts do
        local obj = purchasableParts[partName]
        if obj then showPart(obj); wirePartFunction(obj) end
    end
end

-- ── Tier-based BuyPad system ──

local padDebounce = {}

local function getPlayerTier(data)
    for tierNum, tier in CONFIG.TIERS do
        for i = tier.from, tier.to do
            if not data.purchases[tostring(i)] then return tierNum, tier end
        end
    end
    return nil, nil
end

local function showTierPads(data)
    for _, pad in buyPads do hidePart(pad.part) end
    local tierNum, tier = getPlayerTier(data)
    if not tier then return end
    for i = tier.from, tier.to do
        if not data.purchases[tostring(i)] and buyPads[i] then
            showPart(buyPads[i].part)
        end
    end
end

local function tryPurchase(player, order, pad)
    local dKey = player.UserId .. "_" .. order
    if padDebounce[dKey] then return end
    padDebounce[dKey] = true
    task.delay(0.5, function() padDebounce[dKey] = nil end)

    local data = getData(player); if not data then return end
    if data.purchases[tostring(order)] then return end

    -- Check tier: all previous tiers must be complete
    local _, playerTier = getPlayerTier(data)
    if not playerTier then return end
    if order < playerTier.from or order > playerTier.to then return end

    if data.currency < pad.price then return end

    addCurrency(player, -pad.price)
    data.purchases[tostring(order)] = true
    revealPurchase(order)

    -- Check if tier just completed
    local oldTierNum = nil
    for tn, t in CONFIG.TIERS do
        if order >= t.from and order <= t.to then oldTierNum = tn; break end
    end
    local tierComplete = true
    if oldTierNum then
        local t = CONFIG.TIERS[oldTierNum]
        for i = t.from, t.to do
            if not data.purchases[tostring(i)] then tierComplete = false; break end
        end
    end

    showTierPads(data)
    savePlayerData(player); syncToClient(player)

    local info = CONFIG.PURCHASES[order]
    if info then PurchaseFXRemote:FireClient(player, pad.part.Position, info.label) end
    if tierComplete and oldTierNum and oldTierNum < #CONFIG.TIERS then
        TierUnlockRemote:FireClient(player, oldTierNum + 1)
    end
    print("[Tycoon] " .. player.Name .. " bought #" .. order .. " (" .. (info and info.label or "?") .. ")")
end

local function initBuyPadSystem()
    for _, obj in GC:GetDescendants() do
        if obj:IsA("BasePart") and obj.Name:match("^BuyPad_") then
            local order, price = obj.Name:match("BuyPad_(%d+)_(%d+)")
            if order and price then buyPads[tonumber(order)] = { part = obj, price = tonumber(price) } end
        end
    end

    local purchasableNames = {}
    for _, info in CONFIG.PURCHASES do
        for _, partName in info.parts do purchasableNames[partName] = true end
    end
    for _, obj in GC:GetDescendants() do
        if obj:IsA("BasePart") and purchasableNames[obj.Name] then
            purchasableParts[obj.Name] = obj; hidePart(obj)
        end
    end

    for _, pad in buyPads do hidePart(pad.part) end

    -- Proximity poll loop
    task.spawn(function()
        while true do
            task.wait(0.25)
            for order, pad in buyPads do
                if pad.part.Transparency < 0.5 then
                    local pp = pad.part.Position
                    local ps = pad.part.Size
                    local halfX = ps.X / 2 + 1; local halfZ = ps.Z / 2 + 1
                    for _, player in Players:GetPlayers() do
                        local char = player.Character
                        if char then
                            local hrp = char:FindFirstChild("HumanoidRootPart")
                            if hrp then
                                local hp = hrp.Position
                                if math.abs(hp.X - pp.X) < halfX and math.abs(hp.Z - pp.Z) < halfZ and math.abs(hp.Y - pp.Y) < 5 then
                                    tryPurchase(player, order, pad)
                                end
                            end
                        end
                    end
                end
            end
        end
    end)
    print("[Tycoon] BuyPad system: " .. #buyPads .. " pads registered")
end

-- ── Restore purchases ──

local function restorePurchases(player)
    local data = getData(player); if not data or not data.purchases then return end
    for orderStr, _ in data.purchases do
        local order = tonumber(orderStr)
        if order then revealPurchase(order) end
    end
    showTierPads(data)
end

-- ── Player lifecycle ──

local function setupPlayer(player)
    local data = loadPlayerData(player); data.activeDrops = 0; playerData[player.UserId] = data
    local leaderstats = Instance.new("Folder"); leaderstats.Name = "leaderstats"; leaderstats.Parent = player
    local cv = Instance.new("IntValue"); cv.Name = CONFIG.CURRENCY_NAME; cv.Value = math.floor(data.currency); cv.Parent = leaderstats
    local rv = Instance.new("IntValue"); rv.Name = "Rebirths"; rv.Value = data.rebirthCount; rv.Parent = leaderstats
    restorePurchases(player)
    task.defer(function() syncToClient(player) end)
end

local function removePlayer(player) savePlayerData(player); playerData[player.UserId] = nil; sessionLock[player.UserId] = nil end

-- ── Dropper system (supports multiple purchasable droppers) ──

-- Pizza-shaped drop helper (Food theme only). Returns a single BasePart
-- (cylinder) named "TycoonDrop" with welded decorative children so existing
-- conveyor/collector/upgrader loops (which iterate GC:GetChildren and
-- filter by IsA("BasePart") + Name == "TycoonDrop") continue to work.
local function createPizzaDrop(tierColor, targetPos)
    local baseCFrame = CFrame.new(targetPos) * CFrame.Angles(0, 0, math.pi / 2)

    local base = Instance.new("Part")
    base.Name = "TycoonDrop"
    base.Shape = Enum.PartType.Cylinder
    base.Size = Vector3.new(0.5, 2.4, 2.4)
    base.CFrame = baseCFrame
    base.Color = Color3.fromRGB(210, 150, 80) -- dough
    base.Material = Enum.Material.SmoothPlastic
    base.Anchored = false
    base.CanCollide = true

    local sauce = Instance.new("Part")
    sauce.Name = "Sauce"
    sauce.Shape = Enum.PartType.Cylinder
    sauce.Size = Vector3.new(0.12, 2.1, 2.1)
    sauce.CFrame = baseCFrame * CFrame.new(0.3, 0, 0)
    sauce.Color = Color3.fromRGB(200, 40, 30)
    sauce.Material = Enum.Material.SmoothPlastic
    sauce.Anchored = false
    sauce.CanCollide = false
    sauce.Massless = true
    sauce.Parent = base
    local w1 = Instance.new("WeldConstraint")
    w1.Part0 = base; w1.Part1 = sauce; w1.Parent = base

    local cheese = Instance.new("Part")
    cheese.Name = "Cheese"
    cheese.Shape = Enum.PartType.Cylinder
    cheese.Size = Vector3.new(0.1, 1.9, 1.9)
    cheese.CFrame = baseCFrame * CFrame.new(0.36, 0, 0)
    cheese.Color = tierColor -- tier tint rides on cheese
    cheese.Material = Enum.Material.SmoothPlastic
    cheese.Anchored = false
    cheese.CanCollide = false
    cheese.Massless = true
    cheese.Parent = base
    local w2 = Instance.new("WeldConstraint")
    w2.Part0 = base; w2.Part1 = cheese; w2.Parent = base

    for i = 1, 5 do
        local pep = Instance.new("Part")
        pep.Name = "Pepperoni"
        pep.Shape = Enum.PartType.Cylinder
        pep.Size = Vector3.new(0.06, 0.5, 0.5)
        local a = (i - 1) * (math.pi * 2 / 5) + math.pi / 10
        pep.CFrame = baseCFrame * CFrame.new(0.4, math.cos(a) * 0.6, math.sin(a) * 0.6)
        pep.Color = Color3.fromRGB(140, 30, 20)
        pep.Material = Enum.Material.SmoothPlastic
        pep.Anchored = false
        pep.CanCollide = false
        pep.Massless = true
        pep.Parent = base
        local wp = Instance.new("WeldConstraint")
        wp.Part0 = base; wp.Part1 = pep; wp.Parent = base
    end

    return base
end

local function setupDroppers()
    local droppers = {}
    for _, obj in GC:GetDescendants() do
        if obj:IsA("BasePart") and (obj.Name == "Dropper" or obj.Name:match("^Dropper_%d+$")) then
            table.insert(droppers, obj)
        end
    end
    if #droppers == 0 then warn("[Tycoon] No Dropper found!"); return end

    task.spawn(function()
        while true do
            for _, player in Players:GetPlayers() do
                local data = getData(player)
                if data and data.activeDrops < maxDrops(data) then
                    local tier = CONFIG.DROPPER_TIERS[data.dropperTier] or CONFIG.DROPPER_TIERS[1]
                    for _, dropper in droppers do
                        if dropper.Transparency < 0.5 then -- only spawn from visible (purchased) droppers
                            local targetPos = Vector3.new(dropper.Position.X, dropper.Position.Y - dropper.Size.Y / 2 - 1, dropper.Position.Z - 5)
                            local drop
                            if CONFIG.THEME_NAME == "Food" then
                                drop = createPizzaDrop(tier.dropColor, targetPos)
                            else
                                drop = Instance.new("Part")
                                drop.Size = Vector3.new(1.2, 1.2, 1.2)
                                drop.Position = targetPos
                                drop.Color = tier.dropColor; drop.Material = Enum.Material.Neon
                                drop.Anchored = false; drop.CanCollide = true; drop.Name = "TycoonDrop"
                            end
                            drop:SetAttribute("owner", player.UserId)
                            drop:SetAttribute("value", effectiveDropValue(data, tier.dropValue))
                            drop.Parent = GC
                            data.activeDrops = data.activeDrops + 1
                            Debris:AddItem(drop, 20)
                            task.delay(20, function() if data then data.activeDrops = math.max(0, data.activeDrops - 1) end end)
                        end
                    end
                end
            end
            local minInterval = 2
            for _, player in Players:GetPlayers() do
                local data = getData(player)
                if data then
                    local tier = CONFIG.DROPPER_TIERS[data.dropperTier] or CONFIG.DROPPER_TIERS[1]
                    local int = effectiveDropInterval(data, tier.dropInterval)
                    if int < minInterval then minInterval = int end
                end
            end
            task.wait(minInterval)
        end
    end)
    print("[Tycoon] Dropper loop started with " .. #droppers .. " dropper(s)")
end

-- ── Conveyor: position-based push ──

local function setupConveyors()
    local belts = {}
    for _, obj in GC:GetDescendants() do
        if obj:IsA("BasePart") and obj.Name:match("^Conveyor_") then
            obj.Anchored = true; table.insert(belts, obj)
        end
    end
    if #belts == 0 then return end
    task.spawn(function()
        while true do
            task.wait(0.1)
            for _, belt in belts do
                if belt.Transparency < 0.5 then -- only active if visible
                    local bp = belt.Position; local bs = belt.Size
                    local halfX = bs.X / 2 + 1.5; local halfZ = bs.Z / 2 + 1.5
                    for _, obj in GC:GetChildren() do
                        if obj.Name == "TycoonDrop" and obj:IsA("BasePart") and not obj.Anchored then
                            local dp = obj.Position
                            if math.abs(dp.X - bp.X) < halfX and math.abs(dp.Z - bp.Z) < halfZ and dp.Y > bp.Y - 1 and dp.Y < bp.Y + 4 then
                                obj.AssemblyLinearVelocity = Vector3.new(0, obj.AssemblyLinearVelocity.Y, -12)
                            end
                        end
                    end
                end
            end
        end
    end)
    print("[Tycoon] Conveyor loop: " .. #belts .. " belt(s)")
end

-- ── Collector: position-based collection ──

local function setupCollectors()
    local collectors = {}
    for _, obj in GC:GetDescendants() do
        if obj:IsA("BasePart") and (obj.Name:match("Collect") or obj.Name:match("Sell")) then
            table.insert(collectors, obj)
        end
    end
    if #collectors == 0 then warn("[Tycoon] No Collector found!"); return end

    task.spawn(function()
        while true do
            task.wait(0.15)
            for _, collector in collectors do
                if collector.Transparency < 0.5 then -- only collect if visible
                    local cp = collector.Position; local cs = collector.Size
                    local halfX = cs.X / 2 + 2; local halfZ = cs.Z / 2 + 2
                    for _, obj in GC:GetChildren() do
                        if obj.Name == "TycoonDrop" and obj:IsA("BasePart") then
                            local dp = obj.Position
                            if math.abs(dp.X - cp.X) < halfX and math.abs(dp.Z - cp.Z) < halfZ and dp.Y > cp.Y - 3 and dp.Y < cp.Y + 5 then
                                local ownerId = obj:GetAttribute("owner")
                                local dropVal = obj:GetAttribute("value") or 5
                                local pos = obj.Position
                                obj:Destroy()
                                if ownerId then
                                    local player = Players:GetPlayerByUserId(ownerId)
                                    if player then addCurrency(player, dropVal); CollectFXRemote:FireClient(player, pos, dropVal) end
                                end
                            end
                        end
                    end
                end
            end
        end
    end)
    print("[Tycoon] Collector loop: " .. #collectors .. " collector(s)")
end

-- ── Upgrader: multiply drop value when passing through ──

local function setupUpgraders()
    local upgraders = {}
    for _, obj in GC:GetDescendants() do
        if obj:IsA("BasePart") and obj.Name:match("^Upgrader_%d+$") then
            local mult = CONFIG.UPGRADER_MULTIPLIERS[obj.Name]
            if mult then table.insert(upgraders, { part = obj, mult = mult }) end
        end
    end
    if #upgraders == 0 then return end

    task.spawn(function()
        while true do
            task.wait(0.15)
            for _, upg in upgraders do
                if upg.part.Transparency < 0.5 then
                    local bp = upg.part.Position; local bs = upg.part.Size
                    for _, obj in GC:GetChildren() do
                        if obj.Name == "TycoonDrop" and obj:IsA("BasePart") then
                            local dp = obj.Position
                            if math.abs(dp.X - bp.X) < bs.X / 2 + 2
                                and math.abs(dp.Z - bp.Z) < bs.Z / 2 + 2
                                and dp.Y > bp.Y - 2 and dp.Y < bp.Y + 4 then
                                local key = "upg_" .. upg.part.Name
                                if not obj:GetAttribute(key) then
                                    obj:SetAttribute(key, true)
                                    local val = obj:GetAttribute("value") or 5
                                    obj:SetAttribute("value", val * upg.mult)
                                end
                            end
                        end
                    end
                end
            end
        end
    end)
    print("[Tycoon] Upgrader loop: " .. #upgraders .. " upgrader(s)")
end

-- ── Auto-save ──

task.spawn(function()
    while true do task.wait(CONFIG.SAVE_INTERVAL); for _, player in Players:GetPlayers() do savePlayerData(player) end end
end)

-- ── Quest System ──

local QUESTS = {
    { task = "Earn $500", target = 500, reward = 200, check = function(d) return d.totalEarned end },
    { task = "Buy 3 items", target = 3, reward = 500, check = function(d) local c=0; for _ in d.purchases do c=c+1 end; return c end },
    { task = "Earn $5000", target = 5000, reward = 1000, check = function(d) return d.totalEarned end },
    { task = "Buy 8 items", target = 8, reward = 2000, check = function(d) local c=0; for _ in d.purchases do c=c+1 end; return c end },
    { task = "Earn $50000", target = 50000, reward = 5000, check = function(d) return d.totalEarned end },
}

local playerQuests = {} -- userId → current quest index

-- Replace lightweight NPC marker Parts (emitted by backend buildSceneNodes)
-- with real R15 character models via Players:CreateHumanoidModelFromDescriptionAsync.
-- Markers are invisible 1x1x1 Parts named NPC_* with NpcRole/NpcDialog StringValues.
local function spawnNpcCharacters()
    for _, marker in GC:GetDescendants() do
        if marker:IsA("BasePart") and marker.Name:match("^NPC_") then
            local markerCFrame = marker.CFrame
            local markerName = marker.Name
            local roleVal = marker:FindFirstChild("NpcRole")
            local dialogVal = marker:FindFirstChild("NpcDialog")
            local displayName = markerName:gsub("NPC_", ""):gsub("_", " ")

            local ok, model = pcall(function()
                local desc = Instance.new("HumanoidDescription")
                desc.HeadColor = Color3.fromRGB(255, 220, 180)
                desc.TorsoColor = Color3.fromRGB(math.random(80, 255), math.random(80, 255), math.random(80, 255))
                desc.LeftArmColor = desc.TorsoColor
                desc.RightArmColor = desc.TorsoColor
                desc.LeftLegColor = Color3.fromRGB(60, 60, 80)
                desc.RightLegColor = Color3.fromRGB(60, 60, 80)
                return Players:CreateHumanoidModelFromDescriptionAsync(desc, Enum.HumanoidRigType.R15)
            end)

            if ok and model then
                model.Name = markerName
                local markerParent = marker.Parent
                model:PivotTo(markerCFrame)
                -- IMPORTANT: parent to the marker's original container (GC/GeneratedContent)
                -- so Pass 2 (setupNPCQuests) finds it via GC:GetDescendants() and can
                -- attach the ProximityPrompt. Previously parented to workspace which
                -- put the model outside GC and broke interaction.
                model.Parent = markerParent or workspace
                local hrp = model:FindFirstChild("HumanoidRootPart")
                if hrp then hrp.Anchored = true end
                local hum = model:FindFirstChildOfClass("Humanoid")
                if hum then
                    hum.WalkSpeed = 0
                    hum.JumpPower = 0
                    -- Hide default Roblox nameplate — custom BillboardGui below
                    -- provides the label; otherwise the name is rendered twice.
                    hum.DisplayDistanceType = Enum.HumanoidDisplayDistanceType.None
                    hum.NameDisplayDistance = 0
                    hum.HealthDisplayDistance = 0
                end

                local head = model:FindFirstChild("Head")
                if head then
                    local bb = Instance.new("BillboardGui")
                    bb.Size = UDim2.new(0, 160, 0, 40)
                    bb.StudsOffset = Vector3.new(0, 2.5, 0)
                    bb.AlwaysOnTop = true
                    bb.Parent = head
                    local lbl = Instance.new("TextLabel")
                    lbl.Size = UDim2.new(1, 0, 1, 0)
                    lbl.BackgroundTransparency = 1
                    lbl.Text = displayName
                    lbl.TextColor3 = Color3.new(1, 1, 1)
                    lbl.TextStrokeTransparency = 0
                    lbl.Font = Enum.Font.GothamBold
                    lbl.TextScaled = true
                    lbl.Parent = bb
                end

                if roleVal then roleVal.Parent = model end
                if dialogVal then dialogVal.Parent = model end

                marker:Destroy()
            else
                -- Fallback: make marker visible so NPC is still discoverable
                marker.Transparency = 0
                marker.Size = Vector3.new(2, 5, 2)
                marker.Color = Color3.fromRGB(255, 200, 60)
                warn("[NPC] Spawn failed for " .. markerName .. ", using fallback block")
            end
        end
    end
end

local function setupNPCQuests()
    spawnNpcCharacters()
    for _, obj in GC:GetDescendants() do
        if obj:IsA("Model") and obj.Name:match("^NPC_") and obj:FindFirstChildOfClass("Humanoid") then
            local hrp = obj:FindFirstChild("HumanoidRootPart")
            if not hrp then continue end
            -- Add ProximityPrompt to all NPCs
            local prompt = Instance.new("ProximityPrompt")
            prompt.ActionText = "Talk"
            prompt.ObjectText = obj.Name:gsub("NPC_", ""):gsub("_", " ")
            prompt.HoldDuration = 0
            prompt.MaxActivationDistance = 12
            prompt.RequiresLineOfSight = false
            prompt.Parent = hrp

            local role = obj:FindFirstChild("NpcRole")
            local isQuest = role and role.Value == "quest"

            prompt.Triggered:Connect(function(player)
                local data = getData(player)
                if not data then return end

                if isQuest then
                    local qIdx = playerQuests[player.UserId] or 1
                    local quest = QUESTS[qIdx]
                    if not quest then
                        NPCDialogRemote:FireClient(player, obj.Name:gsub("NPC_",""):gsub("_"," "), "You completed all quests! Amazing!", -1)
                        return
                    end
                    local progress = quest.check(data)
                    if progress >= quest.target then
                        addCurrency(player, quest.reward)
                        playerQuests[player.UserId] = qIdx + 1
                        NPCDialogRemote:FireClient(player, obj.Name:gsub("NPC_",""):gsub("_"," "), "Quest complete! +" .. quest.reward .. "$ | Next: " .. (QUESTS[qIdx+1] and QUESTS[qIdx+1].task or "All done!"), 1)
                        syncToClient(player)
                    else
                        NPCDialogRemote:FireClient(player, obj.Name:gsub("NPC_",""):gsub("_"," "), "Quest: " .. quest.task .. " (" .. math.floor(progress) .. "/" .. quest.target .. ")", quest.target > 0 and (progress / quest.target) or 0)
                    end
                else
                    local greetings = {"Welcome to the factory!", "Keep working hard!", "Great progress!", "Need anything?", "You are doing great!"}
                    NPCDialogRemote:FireClient(player, obj.Name:gsub("NPC_",""):gsub("_"," "), greetings[math.random(#greetings)], -1)
                end
            end)
        end
    end
end

-- ── Interactive Stations ──

local stationCooldowns = {}

local function setupStations()
    for _, obj in GC:GetDescendants() do
        if obj:IsA("BasePart") and obj.Name:match("^Station_") then
            local prompt = obj:FindFirstChild("Prompt")
            if not prompt then continue end

            prompt.Triggered:Connect(function(player)
                local data = getData(player); if not data then return end
                local key = player.UserId .. "_" .. obj.Name
                if stationCooldowns[key] and tick() - stationCooldowns[key] < 60 then
                    NPCDialogRemote:FireClient(player, "Station", "Cooldown: " .. math.ceil(60 - (tick() - stationCooldowns[key])) .. "s", -1)
                    return
                end
                stationCooldowns[key] = tick()

                if obj.Name == "Station_Speed" then
                    -- Temporary speed boost (handled client-side via data sync)
                    data.speedLevel = data.speedLevel + 3
                    syncToClient(player)
                    NPCDialogRemote:FireClient(player, "Speed Station", "Speed boosted for 30s!", -1)
                    task.delay(30, function()
                        local d = getData(player)
                        if d then d.speedLevel = math.max(0, d.speedLevel - 3); syncToClient(player) end
                    end)
                elseif obj.Name == "Station_Bonus" then
                    local bonus = math.floor(100 + data.totalEarned * 0.01)
                    addCurrency(player, bonus)
                    syncToClient(player)
                    NPCDialogRemote:FireClient(player, "Bonus Station", "+" .. bonus .. "$ collected!", -1)
                elseif obj.Name == "Station_Info" then
                    local purchaseCount = 0
                    for _ in data.purchases do purchaseCount = purchaseCount + 1 end
                    local msg = "Cash: $" .. math.floor(data.currency) .. " | Purchases: " .. purchaseCount .. "/30 | Earned: $" .. math.floor(data.totalEarned)
                    NPCDialogRemote:FireClient(player, "Stats", msg, -1)
                end
            end)
        end
    end
end

-- ── Pizzeria interior (Food theme only) ──
-- Adds L-shaped wooden bar counter, 3 round tables with Seat chairs,
-- decorative pizzas on tables and bar, and repositions (or creates)
-- Chef_Mario NPC marker behind the bar so the R15 spawn step places
-- the character there. Gated by CONFIG.THEME_NAME == "Food".
local function buildPizzeriaInterior()
    if CONFIG.THEME_NAME ~= "Food" then return end

    local interior = Instance.new("Model")
    interior.Name = "PizzeriaInterior"
    interior.Parent = GC

    local function mkPart(parent, name, size, cframe, color, mat, collide)
        local p = Instance.new("Part")
        p.Name = name
        p.Size = size
        p.CFrame = cframe
        p.Color = color
        p.Material = mat
        p.Anchored = true
        p.CanCollide = collide ~= false
        p.Parent = parent
        return p
    end

    local function mkDecoPizza(parent, cx, cy, cz)
        local cf = CFrame.new(cx, cy, cz) * CFrame.Angles(0, 0, math.pi / 2)
        local dough = Instance.new("Part")
        dough.Name = "DecoPizza_Base"
        dough.Shape = Enum.PartType.Cylinder
        dough.Size = Vector3.new(0.3, 2.4, 2.4)
        dough.CFrame = cf
        dough.Color = Color3.fromRGB(210, 150, 80)
        dough.Material = Enum.Material.SmoothPlastic
        dough.Anchored = true
        dough.CanCollide = false
        dough.Parent = parent

        local sauce = Instance.new("Part")
        sauce.Name = "DecoPizza_Sauce"
        sauce.Shape = Enum.PartType.Cylinder
        sauce.Size = Vector3.new(0.1, 2.1, 2.1)
        sauce.CFrame = cf * CFrame.new(0.2, 0, 0)
        sauce.Color = Color3.fromRGB(200, 40, 30)
        sauce.Material = Enum.Material.SmoothPlastic
        sauce.Anchored = true
        sauce.CanCollide = false
        sauce.Parent = parent

        local cheese = Instance.new("Part")
        cheese.Name = "DecoPizza_Cheese"
        cheese.Shape = Enum.PartType.Cylinder
        cheese.Size = Vector3.new(0.08, 1.9, 1.9)
        cheese.CFrame = cf * CFrame.new(0.26, 0, 0)
        cheese.Color = Color3.fromRGB(255, 220, 80)
        cheese.Material = Enum.Material.SmoothPlastic
        cheese.Anchored = true
        cheese.CanCollide = false
        cheese.Parent = parent

        for i = 1, 5 do
            local pep = Instance.new("Part")
            pep.Name = "DecoPizza_Pep"
            pep.Shape = Enum.PartType.Cylinder
            pep.Size = Vector3.new(0.05, 0.5, 0.5)
            local a = (i - 1) * (math.pi * 2 / 5)
            pep.CFrame = cf * CFrame.new(0.31, math.cos(a) * 0.55, math.sin(a) * 0.55)
            pep.Color = Color3.fromRGB(140, 30, 20)
            pep.Material = Enum.Material.SmoothPlastic
            pep.Anchored = true
            pep.CanCollide = false
            pep.Parent = parent
        end
    end

    -- ─ Bar counter (L-shape, at z=35) ─
    local bar = Instance.new("Model")
    bar.Name = "BarCounter"
    bar.Parent = interior
    local wood1 = Color3.fromRGB(110, 65, 30)
    local wood2 = Color3.fromRGB(80, 45, 20)
    mkPart(bar, "CounterTop", Vector3.new(20, 0.4, 3.2), CFrame.new(0, 3.7, 35), wood1, Enum.Material.WoodPlanks, true)
    mkPart(bar, "CounterFront", Vector3.new(20, 3.5, 0.4), CFrame.new(0, 1.75, 33.6), wood2, Enum.Material.WoodPlanks, true)
    mkPart(bar, "CounterBack", Vector3.new(20, 3.5, 0.4), CFrame.new(0, 1.75, 36.4), wood2, Enum.Material.WoodPlanks, true)
    mkPart(bar, "CounterLeftCap", Vector3.new(0.4, 3.5, 3.2), CFrame.new(-10, 1.75, 35), wood2, Enum.Material.WoodPlanks, true)
    mkPart(bar, "CounterRightCap", Vector3.new(0.4, 3.5, 3.2), CFrame.new(10, 1.75, 35), wood2, Enum.Material.WoodPlanks, true)
    -- Two decorative pizzas on the bar top
    mkDecoPizza(bar, -5, 4.1, 35)
    mkDecoPizza(bar, 5, 4.1, 35)

    -- ─ 3 tables with 2 Seat chairs each, in front of bar at z=22 ─
    local tableXs = { -14, 0, 14 }
    for idx = 1, #tableXs do
        local x = tableXs[idx]
        local tbl = Instance.new("Model")
        tbl.Name = "PizzaTable_" .. idx
        tbl.Parent = interior

        -- Round table top (cylinder rotated flat)
        local top = Instance.new("Part")
        top.Name = "TableTop"
        top.Shape = Enum.PartType.Cylinder
        top.Size = Vector3.new(0.4, 6, 6)
        top.CFrame = CFrame.new(x, 2.7, 22) * CFrame.Angles(0, 0, math.pi / 2)
        top.Color = Color3.fromRGB(160, 110, 70)
        top.Material = Enum.Material.WoodPlanks
        top.Anchored = true
        top.CanCollide = true
        top.Parent = tbl

        mkPart(tbl, "TableLeg", Vector3.new(0.8, 2.5, 0.8), CFrame.new(x, 1.25, 22), wood1, Enum.Material.WoodPlanks, true)
        mkPart(tbl, "TableBase", Vector3.new(2.2, 0.3, 2.2), CFrame.new(x, 0.15, 22), wood2, Enum.Material.WoodPlanks, true)

        -- Decorative pizza on table
        mkDecoPizza(tbl, x, 3.2, 22)

        -- Two chairs (Roblox Seat = auto-sittable)
        local chairOffsets = { -4, 4 }
        for ci = 1, #chairOffsets do
            local ox = chairOffsets[ci]
            local seat = Instance.new("Seat")
            seat.Name = "PizzaSeat_" .. idx .. "_" .. ci
            seat.Size = Vector3.new(2, 0.6, 2)
            seat.CFrame = CFrame.new(x + ox, 1.3, 22)
            seat.Color = Color3.fromRGB(170, 45, 35)
            seat.Material = Enum.Material.Fabric
            seat.Anchored = true
            seat.CanCollide = true
            seat.Parent = tbl

            -- Chair back (decorative only)
            local backSign = (ox > 0) and 1 or -1
            local back = Instance.new("Part")
            back.Name = "ChairBack_" .. idx .. "_" .. ci
            back.Size = Vector3.new(0.3, 2.8, 2)
            back.CFrame = CFrame.new(x + ox + backSign * 0.85, 2.4, 22)
            back.Color = Color3.fromRGB(170, 45, 35)
            back.Material = Enum.Material.Fabric
            back.Anchored = true
            back.CanCollide = false
            back.Parent = tbl
        end
    end

    -- ─ Chef Mario positioning ─
    -- Prefer repositioning an existing marker (so NpcRole/NpcDialog carry over);
    -- if backend did not emit one for this theme, create a minimal marker.
    local chefCFrame = CFrame.new(0, 5, 37) * CFrame.Angles(0, math.pi, 0)
    local chefMarker
    for _, d in GC:GetDescendants() do
        if d:IsA("BasePart") and d.Name == "NPC_Chef_Mario" then
            chefMarker = d
            break
        end
    end
    if chefMarker then
        chefMarker.CFrame = chefCFrame
    else
        local m = Instance.new("Part")
        m.Name = "NPC_Chef_Mario"
        m.Size = Vector3.new(1, 1, 1)
        m.Transparency = 1
        m.CanCollide = false
        m.Anchored = true
        m.CFrame = chefCFrame
        m.Parent = interior
        local role = Instance.new("StringValue")
        role.Name = "NpcRole"
        role.Value = "quest"
        role.Parent = m
        local dialog = Instance.new("StringValue")
        dialog.Name = "NpcDialog"
        dialog.Value = "Welcome to Pizza Empire!"
        dialog.Parent = m
    end

    print("[Tycoon] Pizzeria interior: bar + 3 tables + 6 seats + 5 decorative pizzas")
end

-- ── Init ──

Players.PlayerRemoving:Connect(removePlayer)
game:BindToClose(function() for _, player in Players:GetPlayers() do savePlayerData(player) end end)

task.wait(1)
buildPizzeriaInterior()
setupDroppers()
setupConveyors()
setupCollectors()
setupUpgraders()
initBuyPadSystem()
setupNPCQuests()
setupStations()

-- Connect AFTER init so buyPads are populated when setupPlayer runs
Players.PlayerAdded:Connect(setupPlayer)
for _, player in Players:GetPlayers() do task.spawn(setupPlayer, player) end

print("[Tycoon] Initialized v3: " .. CONFIG.CURRENCY_NAME .. " | 30 purchases, 4 tiers, upgraders, multi-dropper")
${buildHeroAssetsLua(params.heroAssets ?? [])}`;
}

function buildTycoonClientScript(params: GameTemplateParams): string {
  return `-- TycoonClient: HUD + Visual Effects + BuyPad pulse + Purchase animations
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")
local RunService = game:GetService("RunService")

local CONFIG = require(ReplicatedStorage:WaitForChild("TycoonConfig"))
local remotes = ReplicatedStorage:WaitForChild("TycoonRemotes")
local DataSyncRemote = remotes:WaitForChild("DataSyncRemote")
local CollectFXRemote = remotes:WaitForChild("CollectFXRemote")
local PurchaseFXRemote = remotes:WaitForChild("PurchaseFXRemote")
local RebirthRemote = remotes:WaitForChild("RebirthRemote")
local TierUnlockRemote = remotes:WaitForChild("TierUnlockRemote")
local NPCDialogRemote = remotes:WaitForChild("NPCDialogRemote")

local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")
local localData = CONFIG.getDefaultData()

-- ═══════════════════════════════════════════
-- HUD Creation
-- ═══════════════════════════════════════════

local screenGui = Instance.new("ScreenGui")
screenGui.Name = "TycoonHUD"
screenGui.ResetOnSpawn = false
screenGui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
screenGui.Parent = playerGui

-- Top bar container
local topBar = Instance.new("Frame")
topBar.Name = "TopBar"
topBar.Size = UDim2.new(1, 0, 0, 48)
topBar.Position = UDim2.new(0, 0, 0, 0)
topBar.BackgroundColor3 = Color3.fromRGB(15, 15, 25)
topBar.BackgroundTransparency = 0.3
topBar.BorderSizePixel = 0
topBar.Parent = screenGui

local topCorner = Instance.new("UICorner")
topCorner.CornerRadius = UDim.new(0, 0)
topCorner.Parent = topBar

-- Currency display
local currencyFrame = Instance.new("Frame")
currencyFrame.Name = "CurrencyFrame"
currencyFrame.Size = UDim2.new(0, 200, 0, 36)
currencyFrame.Position = UDim2.new(0, 12, 0, 6)
currencyFrame.BackgroundColor3 = Color3.fromRGB(255, 200, 50)
currencyFrame.BackgroundTransparency = 0.8
currencyFrame.Parent = topBar
local cCorner = Instance.new("UICorner"); cCorner.CornerRadius = UDim.new(0, 8); cCorner.Parent = currencyFrame
local cStroke = Instance.new("UIStroke"); cStroke.Color = Color3.fromRGB(255, 200, 50); cStroke.Thickness = 1; cStroke.Transparency = 0.5; cStroke.Parent = currencyFrame

local currencyIcon = Instance.new("TextLabel")
currencyIcon.Name = "Icon"
currencyIcon.Size = UDim2.new(0, 30, 1, 0)
currencyIcon.Position = UDim2.new(0, 4, 0, 0)
currencyIcon.BackgroundTransparency = 1
currencyIcon.Text = "$"
currencyIcon.TextColor3 = Color3.fromRGB(255, 220, 80)
currencyIcon.TextSize = 22
currencyIcon.Font = Enum.Font.GothamBold
currencyIcon.Parent = currencyFrame

local currencyLabel = Instance.new("TextLabel")
currencyLabel.Name = "Amount"
currencyLabel.Size = UDim2.new(1, -38, 1, 0)
currencyLabel.Position = UDim2.new(0, 34, 0, 0)
currencyLabel.BackgroundTransparency = 1
currencyLabel.Text = "0"
currencyLabel.TextColor3 = Color3.fromRGB(255, 255, 255)
currencyLabel.TextSize = 20
currencyLabel.Font = Enum.Font.GothamBold
currencyLabel.TextXAlignment = Enum.TextXAlignment.Left
currencyLabel.Parent = currencyFrame

-- Tier badge
local tierBadge = Instance.new("TextLabel")
tierBadge.Name = "TierBadge"
tierBadge.Size = UDim2.new(0, 120, 0, 36)
tierBadge.Position = UDim2.new(0, 224, 0, 6)
tierBadge.BackgroundColor3 = Color3.fromRGB(100, 80, 200)
tierBadge.BackgroundTransparency = 0.8
tierBadge.Text = "Basic"
tierBadge.TextColor3 = Color3.fromRGB(220, 200, 255)
tierBadge.TextSize = 16
tierBadge.Font = Enum.Font.GothamBold
tierBadge.Parent = topBar
local tCorner = Instance.new("UICorner"); tCorner.CornerRadius = UDim.new(0, 8); tCorner.Parent = tierBadge
local tStroke = Instance.new("UIStroke"); tStroke.Color = Color3.fromRGB(120, 100, 220); tStroke.Thickness = 1; tStroke.Transparency = 0.5; tStroke.Parent = tierBadge

-- Rebirth multiplier badge
local rebirthBadge = Instance.new("TextLabel")
rebirthBadge.Name = "RebirthBadge"
rebirthBadge.Size = UDim2.new(0, 100, 0, 36)
rebirthBadge.Position = UDim2.new(0, 356, 0, 6)
rebirthBadge.BackgroundColor3 = Color3.fromRGB(200, 150, 50)
rebirthBadge.BackgroundTransparency = 0.8
rebirthBadge.Text = "x1.0"
rebirthBadge.TextColor3 = Color3.fromRGB(255, 220, 100)
rebirthBadge.TextSize = 16
rebirthBadge.Font = Enum.Font.GothamBold
rebirthBadge.Parent = topBar
local rCorner = Instance.new("UICorner"); rCorner.CornerRadius = UDim.new(0, 8); rCorner.Parent = rebirthBadge

-- Upgrade levels (right side)
local upgradeFrame = Instance.new("Frame")
upgradeFrame.Name = "Upgrades"
upgradeFrame.Size = UDim2.new(0, 260, 0, 36)
upgradeFrame.Position = UDim2.new(1, -272, 0, 6)
upgradeFrame.BackgroundTransparency = 1
upgradeFrame.Parent = topBar

local upgradeLayout = Instance.new("UIListLayout")
upgradeLayout.FillDirection = Enum.FillDirection.Horizontal
upgradeLayout.Padding = UDim.new(0, 6)
upgradeLayout.Parent = upgradeFrame

local upgradeLabels = {}
for _, info in ipairs({{"SPD", Color3.fromRGB(80, 220, 80)}, {"VAL", Color3.fromRGB(80, 130, 255)}, {"CAP", Color3.fromRGB(180, 80, 255)}}) do
    local lbl = Instance.new("TextLabel")
    lbl.Size = UDim2.new(0, 82, 1, 0)
    lbl.BackgroundColor3 = info[2]
    lbl.BackgroundTransparency = 0.85
    lbl.Text = info[1] .. " 0"
    lbl.TextColor3 = Color3.fromRGB(255, 255, 255)
    lbl.TextSize = 14
    lbl.Font = Enum.Font.GothamBold
    lbl.Parent = upgradeFrame
    local c = Instance.new("UICorner"); c.CornerRadius = UDim.new(0, 6); c.Parent = lbl
    table.insert(upgradeLabels, lbl)
end

-- ═══════════════════════════════════════════
-- Format number with commas
-- ═══════════════════════════════════════════

local function formatNumber(n)
    local s = tostring(math.floor(n))
    local result = ""
    for i = #s, 1, -1 do
        result = s:sub(i, i) .. result
        if (#s - i + 1) % 3 == 0 and i > 1 then result = "," .. result end
    end
    return result
end

-- ═══════════════════════════════════════════
-- Update HUD from data snapshot
-- ═══════════════════════════════════════════

local function updateHUD()
    currencyLabel.Text = formatNumber(localData.currency)
    local tier = CONFIG.DROPPER_TIERS[localData.dropperTier] or CONFIG.DROPPER_TIERS[1]
    tierBadge.Text = tier.name
    tierBadge.TextColor3 = tier.dropColor
    rebirthBadge.Text = "x" .. string.format("%.1f", localData.rebirthMultiplier)
    if localData.rebirthCount > 0 then
        rebirthBadge.BackgroundTransparency = 0.7
    end
    upgradeLabels[1].Text = "SPD " .. localData.speedLevel
    upgradeLabels[2].Text = "VAL " .. localData.valueLevel
    upgradeLabels[3].Text = "CAP " .. localData.capacityLevel
end

-- ═══════════════════════════════════════════
-- Visual Effects
-- ═══════════════════════════════════════════

-- Currency popup: floats up from collector position
local function showCurrencyPopup(worldPos, amount)
    local anchor = Instance.new("Part")
    anchor.Size = Vector3.new(0.1, 0.1, 0.1)
    anchor.Position = worldPos
    anchor.Anchored = true
    anchor.Transparency = 1
    anchor.CanCollide = false
    anchor.Parent = workspace

    local billboard = Instance.new("BillboardGui")
    billboard.Size = UDim2.new(0, 100, 0, 40)
    billboard.StudsOffset = Vector3.new(0, 2, 0)
    billboard.AlwaysOnTop = true
    billboard.Adornee = anchor
    billboard.Parent = anchor

    local label = Instance.new("TextLabel")
    label.Size = UDim2.new(1, 0, 1, 0)
    label.BackgroundTransparency = 1
    label.Text = "+" .. formatNumber(amount)
    label.TextColor3 = Color3.fromRGB(100, 255, 100)
    label.TextStrokeColor3 = Color3.fromRGB(0, 0, 0)
    label.TextStrokeTransparency = 0.4
    label.TextSize = 20
    label.Font = Enum.Font.GothamBold
    label.Parent = billboard

    local tw1 = TweenService:Create(anchor, TweenInfo.new(1.2, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), {
        Position = worldPos + Vector3.new(0, 5, 0)
    })
    local tw2 = TweenService:Create(label, TweenInfo.new(0.8, Enum.EasingStyle.Linear, Enum.EasingDirection.In, 0, false, 0.4), {
        TextTransparency = 1, TextStrokeTransparency = 1
    })
    tw1:Play()
    tw2:Play()
    tw2.Completed:Connect(function() anchor:Destroy() end)
end

-- Purchase flash effect on a part
local function flashPart(part)
    if not part or not part:IsA("BasePart") then return end
    local origColor = part.Color
    TweenService:Create(part, TweenInfo.new(0.15, Enum.EasingStyle.Quad), {
        Color = Color3.fromRGB(255, 255, 255)
    }):Play()
    task.delay(0.15, function()
        TweenService:Create(part, TweenInfo.new(0.25, Enum.EasingStyle.Quad), {
            Color = origColor
        }):Play()
    end)
end

-- Building appear animation: scale up from small + flash
local function animateBuildAppear(worldPos, labelText)
    -- Expanding ring effect
    local ring = Instance.new("Part")
    ring.Shape = Enum.PartType.Cylinder
    ring.Size = Vector3.new(0.2, 2, 2)
    ring.CFrame = CFrame.new(worldPos) * CFrame.Angles(0, 0, math.rad(90))
    ring.Anchored = true
    ring.CanCollide = false
    ring.Material = Enum.Material.Neon
    ring.Color = Color3.fromRGB(80, 255, 80)
    ring.Transparency = 0.3
    ring.Parent = workspace

    TweenService:Create(ring, TweenInfo.new(0.6, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), {
        Size = Vector3.new(0.2, 20, 20),
        Transparency = 1
    }):Play()
    task.delay(0.7, function() ring:Destroy() end)

    -- "UNLOCKED: label" floating text
    local anchor = Instance.new("Part")
    anchor.Size = Vector3.new(0.1, 0.1, 0.1)
    anchor.Position = worldPos + Vector3.new(0, 4, 0)
    anchor.Anchored = true
    anchor.Transparency = 1
    anchor.CanCollide = false
    anchor.Parent = workspace

    local bb = Instance.new("BillboardGui")
    bb.Size = UDim2.new(0, 200, 0, 50)
    bb.AlwaysOnTop = true
    bb.Adornee = anchor
    bb.Parent = anchor

    local lbl = Instance.new("TextLabel")
    lbl.Size = UDim2.new(1, 0, 1, 0)
    lbl.BackgroundTransparency = 1
    lbl.Text = "UNLOCKED: " .. labelText
    lbl.TextColor3 = Color3.fromRGB(80, 255, 80)
    lbl.TextStrokeColor3 = Color3.fromRGB(0, 0, 0)
    lbl.TextStrokeTransparency = 0.3
    lbl.TextSize = 22
    lbl.Font = Enum.Font.GothamBold
    lbl.Parent = bb

    TweenService:Create(anchor, TweenInfo.new(1.5, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), {
        Position = worldPos + Vector3.new(0, 10, 0)
    }):Play()
    TweenService:Create(lbl, TweenInfo.new(1.0, Enum.EasingStyle.Linear, Enum.EasingDirection.In, 0, false, 0.5), {
        TextTransparency = 1, TextStrokeTransparency = 1
    }):Play()
    task.delay(1.6, function() anchor:Destroy() end)
end

-- Rebirth screen flash
local function rebirthFlash()
    local flash = Instance.new("Frame")
    flash.Size = UDim2.new(1, 0, 1, 0)
    flash.BackgroundColor3 = Color3.fromRGB(255, 255, 255)
    flash.BackgroundTransparency = 1
    flash.ZIndex = 100
    flash.Parent = screenGui

    TweenService:Create(flash, TweenInfo.new(0.2), { BackgroundTransparency = 0.2 }):Play()
    task.delay(0.2, function()
        TweenService:Create(flash, TweenInfo.new(0.6), { BackgroundTransparency = 1 }):Play()
        task.delay(0.7, function() flash:Destroy() end)
    end)
end

-- ═══════════════════════════════════════════
-- BuyPad pulse animation (active pad glows)
-- ═══════════════════════════════════════════

local activePadPulse = nil

local function startPadPulse()
    if activePadPulse then return end
    activePadPulse = RunService.Heartbeat:Connect(function()
        for _, obj in workspace.GeneratedContent:GetDescendants() do
            if obj:IsA("BasePart") and obj.Name:match("^BuyPad_") and obj.Transparency < 0.5 then
                -- Gentle size pulse via transparency oscillation
                local t = tick() * 2
                local pulse = 0.05 + 0.05 * math.sin(t)
                obj.Transparency = pulse
            end
        end
    end)
end

-- ═══════════════════════════════════════════
-- Track previous data to detect changes
-- ═══════════════════════════════════════════

local prevData = CONFIG.getDefaultData()

local function detectAndAnimate(newData)
    -- Upgrade purchased: flash the relevant part
    for _, uType in ipairs({"speed", "value", "capacity"}) do
        local key = uType .. "Level"
        if newData[key] > (prevData[key] or 0) then
            local num = uType == "speed" and 1 or uType == "value" and 2 or 3
            for _, obj in workspace.GeneratedContent:GetDescendants() do
                if obj:IsA("BasePart") and obj.Name == "Upgrade_" .. num then
                    flashPart(obj)
                end
            end
        end
    end

    -- Dropper tier changed: tween dropper color
    if newData.dropperTier > (prevData.dropperTier or 1) then
        local tier = CONFIG.DROPPER_TIERS[newData.dropperTier]
        if tier then
            for _, obj in workspace.GeneratedContent:GetDescendants() do
                if obj:IsA("BasePart") and obj.Name:match("Dropper") then
                    TweenService:Create(obj, TweenInfo.new(0.5), { Color = tier.dropColor }):Play()
                end
            end
        end
    end

    for k, v in newData do
        prevData[k] = v
    end
end

-- ═══════════════════════════════════════════
-- Event Listeners
-- ═══════════════════════════════════════════

DataSyncRemote.OnClientEvent:Connect(function(data)
    if data and type(data) == "table" then
        detectAndAnimate(data)
        for k, v in data do localData[k] = v end
        updateHUD()
    end
end)

CollectFXRemote.OnClientEvent:Connect(function(worldPos, amount)
    showCurrencyPopup(worldPos, amount)
end)

PurchaseFXRemote.OnClientEvent:Connect(function(worldPos, labelText)
    animateBuildAppear(worldPos, labelText or "Building")
end)

RebirthRemote.OnClientEvent:Connect(function()
    rebirthFlash()
end)

local tierNames = { [1] = "STARTUP", [2] = "FACTORY", [3] = "EMPIRE", [4] = "ENDGAME" }
local tierColors = { [1] = Color3.fromRGB(80, 255, 80), [2] = Color3.fromRGB(255, 200, 50), [3] = Color3.fromRGB(255, 80, 80), [4] = Color3.fromRGB(180, 80, 255) }

TierUnlockRemote.OnClientEvent:Connect(function(tierNum)
    local tName = tierNames[tierNum] or ("TIER " .. tierNum)
    local tColor = tierColors[tierNum] or Color3.fromRGB(255, 255, 255)

    -- Full-screen banner
    local banner = Instance.new("TextLabel")
    banner.Size = UDim2.new(1, 0, 0, 80)
    banner.Position = UDim2.new(0, 0, 0.35, 0)
    banner.BackgroundColor3 = tColor
    banner.BackgroundTransparency = 0.6
    banner.Text = tName .. " UNLOCKED!"
    banner.TextColor3 = Color3.fromRGB(255, 255, 255)
    banner.TextStrokeColor3 = Color3.fromRGB(0, 0, 0)
    banner.TextStrokeTransparency = 0.3
    banner.TextSize = 36
    banner.Font = Enum.Font.GothamBold
    banner.TextTransparency = 1
    banner.ZIndex = 50
    banner.Parent = screenGui

    TweenService:Create(banner, TweenInfo.new(0.3), { TextTransparency = 0, TextStrokeTransparency = 0.3 }):Play()
    task.delay(2, function()
        TweenService:Create(banner, TweenInfo.new(0.5), { TextTransparency = 1, TextStrokeTransparency = 1, BackgroundTransparency = 1 }):Play()
        task.delay(0.6, function() banner:Destroy() end)
    end)
end)

-- ── NPC Dialogue UI ──

local dialogFrame = nil
local dialogTween = nil

NPCDialogRemote.OnClientEvent:Connect(function(npcName, dialogText, progress)
    -- Remove existing dialog
    if dialogFrame then dialogFrame:Destroy() end

    dialogFrame = Instance.new("Frame")
    dialogFrame.Name = "NPCDialog"
    dialogFrame.Size = UDim2.new(0.6, 0, 0, 90)
    dialogFrame.Position = UDim2.new(0.2, 0, 0.75, 0)
    dialogFrame.BackgroundColor3 = Color3.fromRGB(20, 20, 30)
    dialogFrame.BackgroundTransparency = 0.2
    dialogFrame.BorderSizePixel = 0
    dialogFrame.ZIndex = 40
    dialogFrame.Parent = screenGui
    local dc = Instance.new("UICorner"); dc.CornerRadius = UDim.new(0, 12); dc.Parent = dialogFrame
    local ds = Instance.new("UIStroke"); ds.Color = Color3.fromRGB(100, 150, 255); ds.Thickness = 2; ds.Parent = dialogFrame

    local nameLabel = Instance.new("TextLabel")
    nameLabel.Size = UDim2.new(1, -16, 0, 24)
    nameLabel.Position = UDim2.new(0, 8, 0, 6)
    nameLabel.BackgroundTransparency = 1
    nameLabel.Text = npcName
    nameLabel.TextColor3 = Color3.fromRGB(100, 200, 255)
    nameLabel.TextSize = 18
    nameLabel.Font = Enum.Font.GothamBold
    nameLabel.TextXAlignment = Enum.TextXAlignment.Left
    nameLabel.ZIndex = 41
    nameLabel.Parent = dialogFrame

    local textLabel = Instance.new("TextLabel")
    textLabel.Size = UDim2.new(1, -16, 0, 30)
    textLabel.Position = UDim2.new(0, 8, 0, 30)
    textLabel.BackgroundTransparency = 1
    textLabel.Text = dialogText
    textLabel.TextColor3 = Color3.fromRGB(240, 240, 240)
    textLabel.TextSize = 15
    textLabel.Font = Enum.Font.GothamMedium
    textLabel.TextXAlignment = Enum.TextXAlignment.Left
    textLabel.TextWrapped = true
    textLabel.ZIndex = 41
    textLabel.Parent = dialogFrame

    -- Progress bar (if quest)
    if progress and progress >= 0 and progress <= 1 then
        local barBg = Instance.new("Frame")
        barBg.Size = UDim2.new(0.8, 0, 0, 8)
        barBg.Position = UDim2.new(0.1, 0, 0, 68)
        barBg.BackgroundColor3 = Color3.fromRGB(40, 40, 50)
        barBg.ZIndex = 41
        barBg.Parent = dialogFrame
        local bc = Instance.new("UICorner"); bc.CornerRadius = UDim.new(0, 4); bc.Parent = barBg

        local barFill = Instance.new("Frame")
        barFill.Size = UDim2.new(math.min(1, progress), 0, 1, 0)
        barFill.BackgroundColor3 = progress >= 1 and Color3.fromRGB(80, 255, 80) or Color3.fromRGB(80, 150, 255)
        barFill.ZIndex = 42
        barFill.Parent = barBg
        local fc = Instance.new("UICorner"); fc.CornerRadius = UDim.new(0, 4); fc.Parent = barFill
    end

    -- Auto-hide after 4 seconds
    task.delay(4, function()
        if dialogFrame then
            TweenService:Create(dialogFrame, TweenInfo.new(0.5), { BackgroundTransparency = 1 }):Play()
            TweenService:Create(nameLabel, TweenInfo.new(0.5), { TextTransparency = 1 }):Play()
            TweenService:Create(textLabel, TweenInfo.new(0.5), { TextTransparency = 1 }):Play()
            task.delay(0.6, function() if dialogFrame then dialogFrame:Destroy(); dialogFrame = nil end end)
        end
    end)
end)

-- Start pad pulse + initial HUD
startPadPulse()
updateHUD()
print("[TycoonClient] HUD + BuyPad FX initialized")
`;
}

// ── Hero Assets Lua Builder ──

function escapeLua(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function buildHeroAssetsLua(heroes: HeroAssetResult[]): string {
  if (!heroes || heroes.length === 0) return '';

  // Obby platforms start at Y=20 and drift up ~1 per level.
  // Hero asset specs use Y=10-16 which lands them under the track.
  // Clamp Y so assets always sit at platform altitude or above.
  const OBBY_MIN_Y = 25;

  const entries = heroes.map((h, i) => {
    const rawPos = h.spec.position;
    const pos: [number, number, number] = [rawPos[0], Math.max(rawPos[1], OBBY_MIN_Y), rawPos[2]];
    const sz = h.spec.size ?? [10, 10, 10];
    // Session #18: memeSubTheme drives per-platform NPC template storage.
    // Empty string stays nil-safe in the Lua check `if cfg.memeSubTheme`.
    const meme = h.spec.memeSubTheme ? `, memeSubTheme="${escapeLua(h.spec.memeSubTheme)}"` : '';
    const concept = h.conceptImageUrl ? `, conceptImage="${escapeLua(h.conceptImageUrl)}"` : '';
    if (h.isMesh && h.assetId > 0) {
      return `    [${i + 1}] = { kind="mesh", assetId=${h.assetId}, name="${escapeLua(h.spec.name)}", pos=Vector3.new(${pos[0]},${pos[1]},${pos[2]}), size=Vector3.new(${sz[0]},${sz[1]},${sz[2]}), effect="${h.spec.effect}", anim="${h.spec.animation}"${meme}${concept} }`;
    } else {
      const c = h.fallbackColor ?? [0.8, 0.5, 0.2];
      return `    [${i + 1}] = { kind="part", name="${escapeLua(h.spec.name)}", pos=Vector3.new(${pos[0]},${pos[1]},${pos[2]}), size=Vector3.new(${sz[0]},${sz[1]},${sz[2]}), color=Color3.new(${c[0].toFixed(3)},${c[1].toFixed(3)},${c[2].toFixed(3)}), effect="${h.spec.effect}", anim="${h.spec.animation}"${meme}${concept} }`;
    }
  }).join(',\n');

  return `
-- ═══════════════════════════════════════════════════════
-- HERO ASSETS  (AI-generated 3D)
-- ═══════════════════════════════════════════════════════
local TweenServiceHA = game:GetService("TweenService")

-- Resolve container by name so this block works for both tycoon (local GC)
-- and obby (local container) without parameterization.
local heroContainer = workspace:FindFirstChild("GeneratedContent")
if not heroContainer then
    heroContainer = Instance.new("Folder")
    heroContainer.Name = "GeneratedContent"
    heroContainer.Parent = workspace
end

local HERO_CONFIGS = {
${entries}
}

local function addHeroEffect(part, effectType)
    if effectType == "none" then return end
    if effectType == "glow" then
        local light = Instance.new("PointLight")
        light.Range = 20; light.Brightness = 2; light.Color = Color3.new(0.9, 0.7, 1)
        light.Parent = part
    end
    local pe = Instance.new("ParticleEmitter")
    if effectType == "sparkles" then
        pe.Rate = 12; pe.Lifetime = NumberRange.new(1.5, 3)
        pe.Speed = NumberRange.new(1, 2); pe.SpreadAngle = Vector2.new(30, 30)
        pe.Color = ColorSequence.new(Color3.new(1, 0.95, 0.5))
        pe.LightEmission = 0.8; pe.Size = NumberSequence.new(0.3)
    elseif effectType == "fire" then
        pe.Rate = 20; pe.Lifetime = NumberRange.new(0.8, 1.8)
        pe.Speed = NumberRange.new(3, 6); pe.SpreadAngle = Vector2.new(20, 20)
        pe.Color = ColorSequence.new({
            ColorSequenceKeypoint.new(0, Color3.new(1, 0.5, 0.1)),
            ColorSequenceKeypoint.new(1, Color3.new(0.8, 0.1, 0))
        })
        pe.LightEmission = 1; pe.Size = NumberSequence.new(0.5)
    elseif effectType == "glow" then
        pe.Rate = 6; pe.Lifetime = NumberRange.new(2, 4); pe.Speed = NumberRange.new(0.3, 0.6)
        pe.SpreadAngle = Vector2.new(60, 60)
        pe.Color = ColorSequence.new(Color3.new(0.8, 0.6, 1)); pe.LightEmission = 1
        pe.Size = NumberSequence.new(0.4)
    elseif effectType == "smoke" then
        pe.Rate = 8; pe.Lifetime = NumberRange.new(3, 5); pe.Speed = NumberRange.new(0.5, 1.5)
        pe.SpreadAngle = Vector2.new(15, 15); pe.LightEmission = 0
        pe.Color = ColorSequence.new(Color3.new(0.7, 0.7, 0.7)); pe.Size = NumberSequence.new(1.5)
    elseif effectType == "bubbles" then
        pe.Rate = 8; pe.Lifetime = NumberRange.new(2, 4); pe.Speed = NumberRange.new(1, 3)
        pe.SpreadAngle = Vector2.new(45, 45)
        pe.Color = ColorSequence.new(Color3.new(0.5, 0.8, 1)); pe.LightEmission = 0.3
        pe.Size = NumberSequence.new(0.35)
    elseif effectType == "stars" then
        pe.Rate = 10; pe.Lifetime = NumberRange.new(2, 3); pe.Speed = NumberRange.new(1, 3)
        pe.SpreadAngle = Vector2.new(50, 50)
        pe.Color = ColorSequence.new(Color3.new(1, 1, 0.6)); pe.LightEmission = 1
        pe.Size = NumberSequence.new(0.25)
    else
        pe:Destroy(); return
    end
    pe.Parent = part
end

local function addHeroAnimation(part, animType)
    if animType == "none" then return end
    local origin = part.CFrame
    task.spawn(function()
        if animType == "rotate" or animType == "spin_fast" then
            local speed = animType == "spin_fast" and 1.2 or 4
            while part.Parent do
                local t = TweenServiceHA:Create(part,
                    TweenInfo.new(speed, Enum.EasingStyle.Linear, Enum.EasingDirection.InOut, -1),
                    { CFrame = origin * CFrame.Angles(0, math.pi * 2, 0) })
                t:Play(); t.Completed:Wait()
                origin = part.CFrame -- re-anchor after each full rotation
            end
        elseif animType == "float" then
            while part.Parent do
                local up = TweenServiceHA:Create(part, TweenInfo.new(2, Enum.EasingStyle.Sine),
                    { CFrame = origin + Vector3.new(0, 3, 0) })
                up:Play(); up.Completed:Wait()
                local dn = TweenServiceHA:Create(part, TweenInfo.new(2, Enum.EasingStyle.Sine),
                    { CFrame = origin })
                dn:Play(); dn.Completed:Wait()
            end
        elseif animType == "pulse" then
            local s0 = part.Size
            while part.Parent do
                local big = TweenServiceHA:Create(part, TweenInfo.new(1, Enum.EasingStyle.Quad),
                    { Size = s0 * 1.2 })
                big:Play(); big.Completed:Wait()
                local sm = TweenServiceHA:Create(part, TweenInfo.new(1, Enum.EasingStyle.Quad),
                    { Size = s0 })
                sm:Play(); sm.Completed:Wait()
            end
        end
    end)
end

-- Open Cloud uploads Meshy GLBs as "Model" asset type. MeshPart.MeshId is
-- read-only at runtime AND only accepts FileMesh ("Mesh") assets, so
-- Instance.new("MeshPart") + mesh.MeshId = "rbxassetid://..." silently
-- fails. Correct pattern: InsertService:LoadAsset(id) returns a Model
-- wrapping the uploaded MeshPart(s); we weld them under a single anchored
-- primary so the existing tween-based animations keep working.
--
-- Important caveat: InsertService:LoadAsset refuses to load a private asset
-- unless game.CreatorId matches the asset owner. In local Studio play of an
-- unpublished .rbxl (CreatorId = 0), load fails with "User is not authorized
-- to access Asset". To still give the player something 3D-ish that matches
-- the tycoon theme, we fall back to a themed composite Model built from
-- primitive Parts (buildThemedFallback) rather than a single Neon block.
--
-- Session #18: AssetService:LoadAssetAsync is the modern replacement that
-- supports free Creator Store models (needed for Skibidi Toilet etc.). Must
-- enable Workspace.AllowInsertFreeAssets at runtime (pcall-safe if gated).
local InsertServiceHA = game:GetService("InsertService")
local AssetServiceHA = game:GetService("AssetService")
local ReplicatedStorageHA = game:GetService("ReplicatedStorage")
pcall(function() AssetServiceHA.AllowInsertFreeAssets = true end)

-- Builds a small composite Model from primitive Parts that visually evokes
-- a well-known hero asset by name. Returns (model, primaryPart) or nil.
local function buildThemedFallback(cfg, originCFrame)
    local lower = string.lower(cfg.name or "")
    local function hasWord(w) return string.find(lower, w, 1, true) ~= nil end

    local function makePart(parent, shape, color, size, offset, material)
        local p = Instance.new("Part")
        p.Shape = shape or Enum.PartType.Block
        p.Color = color
        p.Size = size
        p.Material = material or Enum.Material.SmoothPlastic
        p.Anchored = false
        p.CanCollide = false
        p.CastShadow = false
        p.CFrame = originCFrame * CFrame.new(offset)
        p.Parent = parent
        return p
    end

    local model = Instance.new("Model")
    model.Name = "HeroAsset_" .. cfg.name
    local primary

    if hasWord("pizza") or hasWord("volcano") then
        -- Pizza Volcano: red cylinder base (dough+sauce) + yellow dots (cheese)
        -- + darker red cone top (volcano)
        primary = makePart(model, Enum.PartType.Cylinder, Color3.fromRGB(220, 60, 40),
            Vector3.new(2, 10, 10), Vector3.new(0, 0, 0), Enum.Material.SmoothPlastic)
        local crust = makePart(model, Enum.PartType.Cylinder, Color3.fromRGB(210, 160, 90),
            Vector3.new(1.8, 10.6, 10.6), Vector3.new(-0.2, 0, 0))
        for i = 1, 6 do
            local angle = (i - 1) * (math.pi * 2 / 6)
            local r = 3
            makePart(model, Enum.PartType.Ball, Color3.fromRGB(250, 220, 100),
                Vector3.new(1.2, 1.2, 1.2), Vector3.new(1.2, math.cos(angle) * r, math.sin(angle) * r))
        end
        -- Volcano cone in the middle
        makePart(model, Enum.PartType.Cylinder, Color3.fromRGB(180, 40, 30),
            Vector3.new(4, 3, 3), Vector3.new(3, 0, 0), Enum.Material.Neon)
    elseif hasWord("cupcake") or hasWord("muffin") then
        -- Giant Cupcake: brown cylinder base (wrapper) + pink dome (frosting) + cherry
        primary = makePart(model, Enum.PartType.Cylinder, Color3.fromRGB(120, 70, 30),
            Vector3.new(4, 6, 6), Vector3.new(-2, 0, 0))
        makePart(model, Enum.PartType.Ball, Color3.fromRGB(255, 180, 200),
            Vector3.new(7, 7, 7), Vector3.new(2.5, 0, 0))
        makePart(model, Enum.PartType.Ball, Color3.fromRGB(200, 30, 40),
            Vector3.new(1.8, 1.8, 1.8), Vector3.new(6, 0, 0), Enum.Material.Neon)
    elseif hasWord("sunflower") or hasWord("flower") then
        -- Giant Sunflower: brown disk + green stem + yellow petals
        primary = makePart(model, Enum.PartType.Cylinder, Color3.fromRGB(90, 50, 30),
            Vector3.new(1.2, 5, 5), Vector3.new(3, 0, 0))
        for i = 1, 8 do
            local a = (i - 1) * (math.pi * 2 / 8)
            makePart(model, Enum.PartType.Ball, Color3.fromRGB(250, 210, 60),
                Vector3.new(2, 3.5, 2), Vector3.new(3, math.cos(a) * 3.8, math.sin(a) * 3.8))
        end
        makePart(model, Enum.PartType.Cylinder, Color3.fromRGB(60, 140, 60),
            Vector3.new(8, 1, 1), Vector3.new(-2, 0, 0))
    elseif hasWord("trophy") or hasWord("crown") or hasWord("cup") then
        -- Golden Trophy: gold cup + gold stem + square base
        primary = makePart(model, Enum.PartType.Cylinder, Color3.fromRGB(255, 215, 70),
            Vector3.new(5, 5, 5), Vector3.new(2, 0, 0), Enum.Material.Metal)
        makePart(model, Enum.PartType.Cylinder, Color3.fromRGB(240, 200, 60),
            Vector3.new(4, 1.5, 1.5), Vector3.new(-2, 0, 0), Enum.Material.Metal)
        makePart(model, nil, Color3.fromRGB(120, 90, 30),
            Vector3.new(3, 1, 4), Vector3.new(-5, 0, 0))
    elseif hasWord("crystal") or hasWord("diamond") or hasWord("orb") or hasWord("core") then
        -- Crystal / Diamond: cluster of glowing cyan / blue spheres
        primary = makePart(model, Enum.PartType.Ball, Color3.fromRGB(120, 200, 255),
            Vector3.new(6, 6, 6), Vector3.new(0, 0, 0), Enum.Material.Neon)
        makePart(model, Enum.PartType.Ball, Color3.fromRGB(200, 230, 255),
            Vector3.new(3, 3, 3), Vector3.new(3, 3, 0), Enum.Material.Neon)
        makePart(model, Enum.PartType.Ball, Color3.fromRGB(80, 150, 220),
            Vector3.new(3, 3, 3), Vector3.new(-3, -3, 0), Enum.Material.Neon)
    elseif hasWord("robot") or hasWord("mascot") then
        -- Robot Mascot: grey cube body + sphere head + glowing eyes
        primary = makePart(model, nil, Color3.fromRGB(170, 180, 190),
            Vector3.new(5, 5, 4), Vector3.new(0, 0, 0), Enum.Material.Metal)
        makePart(model, Enum.PartType.Ball, Color3.fromRGB(200, 210, 220),
            Vector3.new(4, 4, 4), Vector3.new(4, 0, 0), Enum.Material.Metal)
        makePart(model, Enum.PartType.Ball, Color3.fromRGB(100, 220, 255),
            Vector3.new(0.8, 0.8, 0.8), Vector3.new(5.5, 1, 1.5), Enum.Material.Neon)
        makePart(model, Enum.PartType.Ball, Color3.fromRGB(100, 220, 255),
            Vector3.new(0.8, 0.8, 0.8), Vector3.new(5.5, 1, -1.5), Enum.Material.Neon)
    elseif hasWord("toilet") or hasWord("skibid") then
        -- Skibidi Toilet: porcelain bowl cylinder + skin sphere head + cyan neon eyes + dark mouth
        primary = makePart(model, Enum.PartType.Cylinder, Color3.fromRGB(245, 245, 250),
            Vector3.new(5, 5, 5), Vector3.new(-2, 0, 0), Enum.Material.SmoothPlastic)
        -- seat ring (darker porcelain)
        makePart(model, Enum.PartType.Cylinder, Color3.fromRGB(220, 220, 230),
            Vector3.new(0.8, 5.6, 5.6), Vector3.new(0.6, 0, 0))
        -- tank (back)
        makePart(model, nil, Color3.fromRGB(240, 240, 248),
            Vector3.new(3, 4, 4.8), Vector3.new(-4, 1, 0))
        -- skin-tone head
        primary = primary -- keep porcelain as primary for anchor stability
        makePart(model, Enum.PartType.Ball, Color3.fromRGB(255, 215, 180),
            Vector3.new(4.2, 4.2, 4.2), Vector3.new(3.2, 1.5, 0))
        -- cyan neon eyes
        makePart(model, Enum.PartType.Ball, Color3.fromRGB(80, 220, 255),
            Vector3.new(0.8, 0.8, 0.8), Vector3.new(5, 2, 1.1), Enum.Material.Neon)
        makePart(model, Enum.PartType.Ball, Color3.fromRGB(80, 220, 255),
            Vector3.new(0.8, 0.8, 0.8), Vector3.new(5, 2, -1.1), Enum.Material.Neon)
        -- mouth
        makePart(model, nil, Color3.fromRGB(20, 20, 20),
            Vector3.new(0.4, 0.6, 1.6), Vector3.new(5.1, 0.6, 0))
    elseif hasWord("crocodil") or hasWord("bombardir") or hasWord("bombard") or hasWord("plane") then
        -- Bombardiro Crocodilo: green croc body + grey wings + nose cylinder + tail
        primary = makePart(model, nil, Color3.fromRGB(85, 200, 90),
            Vector3.new(3, 2.8, 8), Vector3.new(0, 0, 0), Enum.Material.Neon)
        -- snout
        makePart(model, Enum.PartType.Cylinder, Color3.fromRGB(45, 140, 60),
            Vector3.new(3, 2.2, 2.2), Vector3.new(0, -0.2, -5))
        -- teeth (white sliver)
        makePart(model, nil, Color3.fromRGB(245, 245, 240),
            Vector3.new(2.4, 0.3, 2), Vector3.new(0, -0.9, -5))
        -- wings
        makePart(model, nil, Color3.fromRGB(120, 125, 135),
            Vector3.new(7, 0.4, 3), Vector3.new(-4.5, 0.4, 0), Enum.Material.Metal)
        makePart(model, nil, Color3.fromRGB(120, 125, 135),
            Vector3.new(7, 0.4, 3), Vector3.new(4.5, 0.4, 0), Enum.Material.Metal)
        -- tail fin
        makePart(model, nil, Color3.fromRGB(60, 160, 70),
            Vector3.new(0.6, 2, 1.8), Vector3.new(0, 1.4, 4.2))
        -- eye dot
        makePart(model, Enum.PartType.Ball, Color3.fromRGB(255, 255, 255),
            Vector3.new(0.6, 0.6, 0.6), Vector3.new(1.4, 0.9, -3.2))
    elseif hasWord("shark") or hasWord("tralal") then
        -- Tralalero Tralala: blue shark body + dorsal fin + white sneakers
        primary = makePart(model, nil, Color3.fromRGB(60, 120, 220),
            Vector3.new(3.4, 3.2, 8), Vector3.new(0, 0, 0), Enum.Material.SmoothPlastic)
        -- dorsal fin
        makePart(model, nil, Color3.fromRGB(40, 90, 180),
            Vector3.new(0.6, 2.6, 2.2), Vector3.new(0, 2.2, 0))
        -- white belly
        makePart(model, nil, Color3.fromRGB(240, 240, 245),
            Vector3.new(2.6, 0.4, 6), Vector3.new(0, -1.6, 0))
        -- sneakers (3 like the meme)
        makePart(model, nil, Color3.fromRGB(245, 245, 245),
            Vector3.new(2, 1.2, 3), Vector3.new(-1.3, -2.4, -1.8))
        makePart(model, nil, Color3.fromRGB(245, 245, 245),
            Vector3.new(2, 1.2, 3), Vector3.new(1.3, -2.4, -1.8))
        makePart(model, nil, Color3.fromRGB(245, 245, 245),
            Vector3.new(2, 1.2, 3), Vector3.new(0, -2.4, 2.4))
        -- eye
        makePart(model, Enum.PartType.Ball, Color3.fromRGB(255, 255, 255),
            Vector3.new(0.7, 0.7, 0.7), Vector3.new(1.5, 0.6, -3.2), Enum.Material.Neon)
    elseif hasWord("sigma") or hasWord("rizz") or hasWord("ohio") then
        -- Sigma / Rizz: gold sphere head + sunglasses + crown
        primary = makePart(model, Enum.PartType.Ball, Color3.fromRGB(255, 210, 80),
            Vector3.new(5, 5, 5), Vector3.new(0, 0, 0), Enum.Material.Neon)
        -- sunglasses (two black blocks)
        makePart(model, nil, Color3.fromRGB(20, 20, 20),
            Vector3.new(0.5, 0.9, 1.6), Vector3.new(2.4, 0.6, 1.1))
        makePart(model, nil, Color3.fromRGB(20, 20, 20),
            Vector3.new(0.5, 0.9, 1.6), Vector3.new(2.4, 0.6, -1.1))
        -- sunglass bridge
        makePart(model, nil, Color3.fromRGB(20, 20, 20),
            Vector3.new(0.4, 0.25, 0.8), Vector3.new(2.5, 0.7, 0))
        -- crown base cylinder
        makePart(model, Enum.PartType.Cylinder, Color3.fromRGB(255, 220, 60),
            Vector3.new(1, 4.2, 4.2), Vector3.new(0, 3.2, 0), Enum.Material.Metal)
        -- crown prongs
        for _, off in ipairs({Vector3.new(0, 4.2, 1.6), Vector3.new(0, 4.2, -1.6), Vector3.new(1.6, 4.2, 0), Vector3.new(-1.6, 4.2, 0)}) do
            makePart(model, nil, Color3.fromRGB(255, 230, 80),
                Vector3.new(0.8, 1.4, 0.8), off, Enum.Material.Metal)
        end
    elseif hasWord("dragon") or hasWord("statue") or hasWord("knight") then
        -- Stone statue stand-in: grey cylinder + cube pedestal
        primary = makePart(model, nil, Color3.fromRGB(140, 140, 140),
            Vector3.new(4, 8, 3), Vector3.new(2, 0, 0))
        makePart(model, nil, Color3.fromRGB(100, 100, 100),
            Vector3.new(5, 2, 5), Vector3.new(-4, 0, 0))
    else
        -- Generic: cannot identify, return nil so caller emits Neon block
        model:Destroy()
        return nil, nil
    end

    if not primary then
        model:Destroy()
        return nil, nil
    end

    -- Weld everything to primary, anchor primary only
    primary.Anchored = true
    for _, desc in model:GetDescendants() do
        if desc:IsA("BasePart") and desc ~= primary then
            desc.Anchored = false
            local w = Instance.new("WeldConstraint")
            w.Part0 = primary
            w.Part1 = desc
            w.Parent = primary
        end
    end
    model.PrimaryPart = primary
    return model, primary
end

-- Session #18: save any successfully-loaded hero asset as a meme NPC template
-- in ReplicatedStorage so the per-platform spawner can Clone() a real 3D model
-- instead of building a primitive composite. First model per sub-theme wins.
local function _saveMemeNpcTemplate(cfg, sourceHolder)
    if not cfg.memeSubTheme or not sourceHolder then return end
    local templates = ReplicatedStorageHA:FindFirstChild("MemeNpcTemplates")
    if not templates then
        templates = Instance.new("Folder")
        templates.Name = "MemeNpcTemplates"
        templates.Parent = ReplicatedStorageHA
    end
    if templates:FindFirstChild(cfg.memeSubTheme) then return end
    local clone = sourceHolder:Clone()
    clone.Name = cfg.memeSubTheme
    -- Unanchor so spawner can position each clone individually
    for _, d in clone:GetDescendants() do
        if d:IsA("BasePart") then
            d.Anchored = false
            d.CanCollide = false
            d.CastShadow = false
        end
    end
    clone.Parent = templates
    print("[HeroAssets] Saved MemeNpcTemplate " .. cfg.memeSubTheme .. " from " .. cfg.name)
end

local function createHeroAsset(cfg)
    local originCFrame = CFrame.new(cfg.pos)
    local anchor -- the part addHeroEffect / addHeroAnimation will operate on
    local holder -- optional Model wrapper (nil for fallback path)

    if cfg.kind == "mesh" and cfg.assetId and cfg.assetId > 0 then
        -- Session #20: multi-ID chain. If cfg.assetIds is provided, loop
        -- through it and take the first LoadAssetAsync that succeeds. This
        -- lets us ship multiple Creator Store candidates (Skibidi had one
        -- moderated ID returning "not authorized") without baking the
        -- decision into TS. Falls back to single cfg.assetId if no chain.
        local candidateIds = cfg.assetIds or { cfg.assetId }
        local ok, loaded, winningId = false, nil, cfg.assetId
        for _, candidateId in ipairs(candidateIds) do
            local tryOk, tryRes = pcall(function()
                return AssetServiceHA:LoadAssetAsync(candidateId)
            end)
            print("[HeroAssets] Tier1a AssetService " .. cfg.name .. " id=" .. tostring(candidateId) .. " ok=" .. tostring(tryOk) .. (tryOk and "" or (" err=" .. tostring(tryRes))))
            if tryOk and tryRes then
                ok, loaded, winningId = true, tryRes, candidateId
                break
            end
        end
        if not ok or not loaded then
            -- Tier 1b: legacy InsertService path (owned-only, kept as fallback)
            ok, loaded = pcall(function()
                return InsertServiceHA:LoadAsset(cfg.assetId)
            end)
            print("[HeroAssets] Tier1b InsertService " .. cfg.name .. " ok=" .. tostring(ok) .. (ok and "" or (" err=" .. tostring(loaded))))
        end
        -- Reflect the winning ID back onto cfg so downstream logs show the
        -- actually-loaded asset, not the first candidate.
        if ok then cfg.assetId = winningId end
        if ok and loaded then
            holder = Instance.new("Model")
            holder.Name = "HeroAsset_" .. cfg.name
            for _, child in loaded:GetChildren() do
                child.Parent = holder
            end
            loaded:Destroy()

            -- First BasePart becomes the primary anchor; all others are
            -- WeldConstraint-bound to it so the model moves as one rigid body.
            local primary
            for _, desc in holder:GetDescendants() do
                if desc:IsA("BasePart") then
                    desc.CanCollide = false
                    desc.CastShadow = false
                    if not primary then
                        primary = desc
                        desc.Anchored = true
                    else
                        desc.Anchored = false
                        local w = Instance.new("WeldConstraint")
                        w.Part0 = primary
                        w.Part1 = desc
                        w.Parent = primary
                    end
                end
            end

            if primary then
                holder.PrimaryPart = primary
                holder:PivotTo(originCFrame)

                -- Session #20: robust height read (bbox → extents fallback)
                -- + log + hard cap. Meshy-imported models sometimes report
                -- degenerate bounding boxes which previously produced the
                -- "huge white blob" on the spawn platform.
                local function _holderHeight()
                    local okBB, _, bb = pcall(function() return holder:GetBoundingBox() end)
                    if okBB and typeof(bb) == "Vector3" and bb.Y > 0.5 then return bb.Y end
                    local okEx, ex = pcall(function() return holder:GetExtentsSize() end)
                    if okEx and typeof(ex) == "Vector3" and ex.Y > 0.5 then return ex.Y end
                    return 0
                end
                local bbY = _holderHeight()
                print(string.format("[HeroAssets] %s raw height=%.2f cfg.size.Y=%.2f", cfg.name, bbY, cfg.size.Y))
                if bbY > 0 then
                    local scale = cfg.size.Y / bbY
                    if math.abs(scale - 1) > 0.05 then
                        local okScale = pcall(function() holder:ScaleTo(scale) end)
                        if not okScale then
                            warn("[HeroAssets] ScaleTo failed for " .. cfg.name)
                        end
                    end
                end
                -- Hard cap: after primary scale pass, final height must not
                -- exceed cfg.size.Y * 1.5. Catches pathological bbox reads.
                local postH = _holderHeight()
                local heroCap = cfg.size.Y * 1.5
                if postH > heroCap then
                    local capScale = heroCap / postH
                    pcall(function() holder:ScaleTo(capScale) end)
                    print(string.format("[HeroAssets] %s hard cap: postH=%.2f → capScale=%.2f", cfg.name, postH, capScale))
                end

                holder.Parent = heroContainer
                anchor = primary
                print("[HeroAssets] Tier1 loaded mesh for " .. cfg.name .. " (assetId=" .. cfg.assetId .. ")")
                _saveMemeNpcTemplate(cfg, holder)
            else
                holder:Destroy()
                holder = nil
                warn("[HeroAssets] LoadAsset returned no BaseParts for " .. cfg.name)
            end
        else
            warn("[HeroAssets] Tier1 LoadAsset failed for " .. cfg.name .. " id=" .. tostring(cfg.assetId) .. " err=" .. tostring(loaded))
        end
    end

    if not anchor and cfg.conceptImage and cfg.conceptImage ~= "" then
        -- Tier 1.5: Billboard — display the AI-generated concept image on a
        -- small pedestal. BillboardGui always faces camera, so the 2D art is
        -- visible from all angles. HTTP/HTTPS URLs load in ImageLabel at runtime.
        local pedestal = Instance.new("Part")
        pedestal.Name = "HeroAsset_" .. cfg.name
        pedestal.Size = Vector3.new(cfg.size.X * 0.4, cfg.size.Y * 0.12, cfg.size.X * 0.4)
        pedestal.CFrame = originCFrame - Vector3.new(0, cfg.size.Y * 0.44, 0)
        pedestal.Anchored = true
        pedestal.CanCollide = false
        pedestal.CastShadow = false
        if cfg.color then pedestal.Color = cfg.color end
        pedestal.Material = Enum.Material.SmoothPlastic
        pedestal.Parent = heroContainer

        local bb = Instance.new("BillboardGui")
        bb.Name = "HeroConceptBillboard"
        bb.Size = UDim2.new(0, cfg.size.X * 50, 0, cfg.size.Y * 50)
        bb.StudsOffset = Vector3.new(0, cfg.size.Y * 0.5, 0)
        bb.AlwaysOnTop = false
        bb.MaxDistance = 200
        bb.LightInfluence = 0.5
        bb.Parent = pedestal

        local img = Instance.new("ImageLabel")
        img.Size = UDim2.new(1, 0, 1, 0)
        img.BackgroundTransparency = 1
        img.Image = cfg.conceptImage
        img.ScaleType = Enum.ScaleType.Fit
        img.Parent = bb

        anchor = pedestal
        print("[HeroAssets] Tier1.5 billboard for " .. cfg.name)
    end

    if not anchor then
        -- Tier 2: themed composite fallback (pizza-shaped Model for "Pizza
        -- Volcano", cupcake for "Giant Cupcake", etc.). Visually far better
        -- than a single colored block and does not depend on Studio auth.
        local themedModel, themedPrimary = buildThemedFallback(cfg, originCFrame)
        if themedModel and themedPrimary then
            -- Scale themed composite to cfg.size.Y for consistency with mesh path
            local _, bbSize = themedModel:GetBoundingBox()
            if bbSize.Y > 0 then
                local scale = cfg.size.Y / bbSize.Y
                if scale > 0.01 and math.abs(scale - 1) > 0.05 then
                    pcall(function() themedModel:ScaleTo(scale) end)
                end
            end
            themedModel.Parent = heroContainer
            anchor = themedPrimary
            print("[HeroAssets] Tier2 themed composite built for " .. cfg.name)
            _saveMemeNpcTemplate(cfg, themedModel)
        end
    end

    if not anchor then
        -- Tier 3: last-resort plain Neon Part with deterministic theme color
        local part = Instance.new("Part")
        if cfg.color then part.Color = cfg.color end
        part.Material = Enum.Material.Neon
        part.Name = "HeroAsset_" .. cfg.name
        part.Size = cfg.size
        part.CFrame = originCFrame
        part.Anchored = true
        part.CanCollide = false
        part.CastShadow = false
        part.Parent = heroContainer
        anchor = part
        print("[HeroAssets] Tier3 neon fallback for " .. cfg.name)
    end

    addHeroEffect(anchor, cfg.effect)
    addHeroAnimation(anchor, cfg.anim)
end

-- Spawn hero assets after tycoon init so GC folder is ready
task.delay(2, function()
    local count = 0
    for _, cfg in HERO_CONFIGS do
        local ok, err = pcall(createHeroAsset, cfg)
        if ok then count += 1
        else warn("[HeroAssets] Failed to create " .. tostring(cfg.name) .. ": " .. tostring(err))
        end
    end
    print("[HeroAssets] Spawned " .. count .. "/" .. #HERO_CONFIGS .. " hero assets")
end)
`;
}

function buildTycoonScript(params: GameTemplateParams): MultiScriptResult {
  const theme = TYCOON_THEMES[params.tycoonThemeKey || 'default'] || TYCOON_THEMES.default;
  return {
    serverScript: buildTycoonServerScript(params),
    additionalScripts: [
      {
        name: 'TycoonConfig',
        scriptType: 'ModuleScript',
        container: 'ReplicatedStorage',
        source: buildTycoonConfigModule(params),
      },
      {
        name: 'TycoonClient',
        scriptType: 'LocalScript',
        container: 'StarterPlayerScripts',
        source: buildTycoonClientScript(params),
      },
      {
        name: 'TycoonToolGiver',
        scriptType: 'Script',
        container: 'ServerScriptService',
        source: buildTycoonToolScript(theme),
      },
    ],
  };
}

function buildTycoonToolScript(theme: TycoonTheme): string {
  const toolName = theme.toolName || 'Hammer';
  const c = theme.name.toLowerCase();
  const isMagic = c === 'medieval' || c === 'candy' || c === 'meme';
  const isRanged = c === 'space' || c === 'military';
  const handleColor = isMagic ? '0.5, 0.3, 1' : isRanged ? '0.3, 0.3, 0.35' : '0.6, 0.45, 0.25';
  const handleSize = isRanged ? '1, 1, 4' : isMagic ? '1, 4, 1' : '1, 5, 1';
  const matName = isMagic ? 'Neon' : 'Metal';
  const particleBlock = isMagic ? `
    local particles = Instance.new("ParticleEmitter")
    particles.Rate = 5
    particles.Lifetime = NumberRange.new(1, 2)
    particles.Speed = NumberRange.new(1, 2)
    particles.Color = ColorSequence.new(Color3.new(${theme.dropParticle.join(', ')}))
    particles.Size = NumberSequence.new(0.3)
    particles.Parent = handle` : '';

  return `-- TycoonToolGiver: gives themed tool to players
local Players = game:GetService("Players")

local function giveTool(player)
    local char = player.Character or player.CharacterAdded:Wait()
    task.wait(1)
    if player.Backpack:FindFirstChild("${toolName}") then return end
    if char:FindFirstChild("${toolName}") then return end

    local tool = Instance.new("Tool")
    tool.Name = "${toolName}"
    tool.CanBeDropped = false
    tool.RequiresHandle = true

    local handle = Instance.new("Part")
    handle.Name = "Handle"
    handle.Size = Vector3.new(${handleSize})
    handle.Color = Color3.new(${handleColor})
    handle.Material = Enum.Material.${matName}
    handle.Anchored = false
    handle.CanCollide = false
    handle.Parent = tool
${particleBlock}
    local light = Instance.new("PointLight")
    light.Brightness = 0.3
    light.Range = 6
    light.Color = Color3.new(${handleColor})
    light.Parent = handle

    tool.Parent = player.Backpack
end

Players.PlayerAdded:Connect(function(player)
    giveTool(player)
    player.CharacterAdded:Connect(function() task.wait(1); giveTool(player) end)
end)
for _, player in Players:GetPlayers() do task.spawn(giveTool, player) end
`;
}

function buildSimulatorConfigModule(params: GameTemplateParams): string {
  const simSpec = params.simulatorSpec;
  const currency = simSpec?.currency || params.currencyName || 'Coins';
  // Escape Lua strings
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

  // Pet names from LLM spec or defaults
  const cp = simSpec?.pets?.common?.length === 5 ? simSpec.pets.common : ['Puppy', 'Kitten', 'Fox', 'Dragon', 'Phoenix'];
  const gp = simSpec?.pets?.golden?.length === 5 ? simSpec.pets.golden : ['Gold Pup', 'Gold Cat', 'Gold Fox', 'Gold Drake', 'Gold Phoenix'];
  const lp = simSpec?.pets?.legendary?.length === 5 ? simSpec.pets.legendary : ['Prism Pup', 'Prism Cat', 'Prism Fox', 'Prism Drake', 'Prism Phoenix'];
  // Egg names
  const en = [
    simSpec?.eggHatchery?.eggs?.[0]?.name || 'Common Egg',
    simSpec?.eggHatchery?.eggs?.[1]?.name || 'Golden Egg',
    simSpec?.eggHatchery?.eggs?.[2]?.name || 'Rainbow Egg',
  ];
  // Zone names (up to 7)
  const zn = [
    simSpec?.zones?.[0]?.name || 'Meadow',
    simSpec?.zones?.[1]?.name || 'Crystal Cave',
    simSpec?.zones?.[2]?.name || 'Lava Islands',
    simSpec?.zones?.[3]?.name || 'Shadow Forest',
    simSpec?.zones?.[4]?.name || 'Frozen Peaks',
    simSpec?.zones?.[5]?.name || 'Void Realm',
    simSpec?.zones?.[6]?.name || 'Celestial Throne',
  ];

  return `-- SimulatorConfig: shared between Server and Client
-- IMPORTANT: Replace GAMEPASS_X2_ID and DEVPRODUCT_100_COINS with real IDs from Creator Dashboard
local Config = {}

Config.CURRENCY_NAME = "${esc(currency)}"
Config.BASE_COLLECT = 1
Config.REBIRTH_BASE_COST = 10000
Config.MAX_EQUIPPED_PETS = 3
Config.SAVE_INTERVAL = 60
Config.COLLECT_COOLDOWN = 0.15

-- Pet Variants
Config.GOLDEN_CHANCE = 0.10
Config.RAINBOW_CHANCE = 0.02
Config.GOLDEN_BONUS = 0.5
Config.RAINBOW_BONUS = 1.5

-- Multi-Hatch
Config.MULTI_HATCH_3_UNLOCK = 0
Config.MULTI_HATCH_5_UNLOCK = 2

-- Fuse
Config.FUSE_COUNT = 3
Config.FUSE_RARITY_ORDER = {"Common", "Uncommon", "Rare", "Legendary", "Mythic"}
Config.FUSE_UNLOCK_REBIRTH = 3

-- Rebirth
Config.REBIRTH_MULTIPLIER_PER = 0.75

-- Replace 0 with real IDs from Roblox Creator Dashboard
Config.GAMEPASS_X2_ID = 0
Config.GAMEPASS_LUCKY_ID = 0
Config.GAMEPASS_AUTOHATCH_ID = 0
Config.GAMEPASS_PLUS5_PETS_ID = 0
Config.GAMEPASS_TRIPLE_HATCH_ID = 0
Config.DEVPRODUCT_100_COINS = 0
Config.DEVPRODUCT_500_COINS = 0
Config.DEVPRODUCT_5000_COINS = 0

Config.ZONE_TIERS = {
    { tier = 1, name = "${esc(zn[0])}", baseValue = 5,     rebirthReq = 0  },
    { tier = 2, name = "${esc(zn[1])}", baseValue = 25,    rebirthReq = 1  },
    { tier = 3, name = "${esc(zn[2])}", baseValue = 100,   rebirthReq = 3  },
    { tier = 4, name = "${esc(zn[3])}", baseValue = 250,   rebirthReq = 5  },
    { tier = 5, name = "${esc(zn[4])}", baseValue = 1000,  rebirthReq = 10 },
    { tier = 6, name = "${esc(zn[5])}", baseValue = 5000,  rebirthReq = 20 },
    { tier = 7, name = "${esc(zn[6])}", baseValue = 25000, rebirthReq = 50 },
}

Config.EGG_TIERS = {
    {
        name = "${esc(en[0])}", cost = 100,
        pets = {
            { name = "${esc(cp[0])}", rarity = "Common",    powerBonus = 1,  weight = 60 },
            { name = "${esc(cp[1])}", rarity = "Uncommon",  powerBonus = 3,  weight = 25 },
            { name = "${esc(cp[2])}", rarity = "Rare",      powerBonus = 8,  weight = 10 },
            { name = "${esc(cp[3])}", rarity = "Legendary", powerBonus = 25, weight = 4 },
            { name = "${esc(cp[4])}", rarity = "Mythic",    powerBonus = 75, weight = 1 },
        },
    },
    {
        name = "${esc(en[1])}", cost = 1000,
        pets = {
            { name = "${esc(gp[0])}", rarity = "Common",    powerBonus = 5,   weight = 50 },
            { name = "${esc(gp[1])}", rarity = "Uncommon",  powerBonus = 15,  weight = 25 },
            { name = "${esc(gp[2])}", rarity = "Rare",      powerBonus = 40,  weight = 15 },
            { name = "${esc(gp[3])}", rarity = "Legendary", powerBonus = 120, weight = 8 },
            { name = "${esc(gp[4])}", rarity = "Mythic",    powerBonus = 350, weight = 2 },
        },
    },
    {
        name = "${esc(en[2])}", cost = 10000,
        pets = {
            { name = "${esc(lp[0])}", rarity = "Uncommon",  powerBonus = 30,   weight = 40 },
            { name = "${esc(lp[1])}", rarity = "Rare",      powerBonus = 80,   weight = 30 },
            { name = "${esc(lp[2])}", rarity = "Rare",      powerBonus = 150,  weight = 18 },
            { name = "${esc(lp[3])}", rarity = "Legendary", powerBonus = 500,  weight = 10 },
            { name = "${esc(lp[4])}", rarity = "Mythic",    powerBonus = 1500, weight = 2 },
        },
    },
}

Config.POWER_UPGRADE_BASE = 100
Config.BAG_UPGRADE_BASE = 150
Config.AUTO_COLLECT_COST = 500
Config.AUTO_COLLECT_RANGE = 20
Config.AUTO_COLLECT_INTERVAL = 2
Config.SPEED_BOOST_COST = 300
Config.SPEED_BOOST_DURATION = 10
Config.SPEED_BOOST_MULTIPLIER = 1.6
Config.LUCK_UPGRADE_BASE = 2000
Config.LUCK_PER_LEVEL = 0.05
Config.LUCK_MAX_LEVEL = 10

-- Quests
Config.QUEST_TYPES = {
    { type = "collect", desc = "Collect %d coins", targets = {50, 200, 500}, reward = {100, 300, 800} },
    { type = "hatch",   desc = "Hatch %d eggs",    targets = {3, 5, 10},    reward = {200, 500, 1500} },
    { type = "sell",    desc = "Sell %d times",     targets = {5, 10, 20},   reward = {100, 250, 600} },
}
Config.QUESTS_PER_SESSION = 3

-- Rebirth Milestones
Config.REBIRTH_MILESTONES = {
    [2]  = "Zone 4 + Multi-Hatch x3",
    [5]  = "Zone 5 + Multi-Hatch x5",
    [10] = "Zone 6 + Fuse Station",
    [20] = "Zone 7",
}

function Config.powerUpgradeCost(level)
    return math.floor(Config.POWER_UPGRADE_BASE * math.pow(level + 1, 1.4))
end

function Config.bagUpgradeCost(level)
    return math.floor(Config.BAG_UPGRADE_BASE * math.pow(level + 1, 1.5))
end

function Config.luckUpgradeCost(level)
    return math.floor(Config.LUCK_UPGRADE_BASE * math.pow(level + 1, 1.6))
end

function Config.rebirthCost(rebirthCount)
    return math.floor(Config.REBIRTH_BASE_COST * math.pow(rebirthCount + 1, 2))
end

function Config.getZoneTier(partName)
    local num = tonumber(partName:match("%d+")) or 1
    return Config.ZONE_TIERS[math.min(num, #Config.ZONE_TIERS)] or Config.ZONE_TIERS[1]
end

function Config.getDefaultData()
    return {
        version = 1,
        currency = 0,
        bag = 0,
        bagMax = 20,
        power = 1,
        powerLevel = 0,
        bagLevel = 0,
        rebirthCount = 0,
        rebirthMultiplier = 1,
        pets = {},
        equippedPets = {},
        petBonusPower = 0,
        totalCollected = 0,
        processedReceipts = {},
        hasAutoCollect = false,
        hasSpeedBoost = false,
        speedBoostEnd = 0,
        luckLevel = 0,
        totalHatched = 0,
        totalSells = 0,
        quests = {},
        lastQuestDate = "",
        hasLuckyPass = false,
        hasAutoHatchPass = false,
        hasPlus5PetsPass = false,
        hasTripleHatchPass = false,
    }
end

return Config
`;
}

function buildSimulatorServerScript(params: GameTemplateParams): string {
  return `local Players = game:GetService("Players")
local DataStoreService = game:GetService("DataStoreService")
local MarketplaceService = game:GetService("MarketplaceService")
local RunService = game:GetService("RunService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

-- Config
local CONFIG = require(ReplicatedStorage:WaitForChild("SimulatorConfig"))

-- DataStore (fails gracefully in Studio test mode)
local dataStore
local dataStoreOk, dataStoreErr = pcall(function()
    dataStore = DataStoreService:GetDataStore("SimulatorData_v1")
end)
if not dataStoreOk then
    warn("[Simulator] DataStore unavailable (Studio?): " .. tostring(dataStoreErr))
end

-- RemoteEvents
local remotes = Instance.new("Folder")
remotes.Name = "Remotes"
remotes.Parent = ReplicatedStorage

local CollectRemote = Instance.new("RemoteEvent"); CollectRemote.Name = "CollectRemote"; CollectRemote.Parent = remotes
local SellRemote = Instance.new("RemoteEvent"); SellRemote.Name = "SellRemote"; SellRemote.Parent = remotes
local BuyUpgradeRemote = Instance.new("RemoteEvent"); BuyUpgradeRemote.Name = "BuyUpgradeRemote"; BuyUpgradeRemote.Parent = remotes
local HatchEggRemote = Instance.new("RemoteEvent"); HatchEggRemote.Name = "HatchEggRemote"; HatchEggRemote.Parent = remotes
local RebirthRemote = Instance.new("RemoteEvent"); RebirthRemote.Name = "RebirthRemote"; RebirthRemote.Parent = remotes
local DataSyncRemote = Instance.new("RemoteEvent"); DataSyncRemote.Name = "DataSyncRemote"; DataSyncRemote.Parent = remotes
local BuyProductRemote = Instance.new("RemoteEvent"); BuyProductRemote.Name = "BuyProductRemote"; BuyProductRemote.Parent = remotes
local EquipPetRemote = Instance.new("RemoteEvent"); EquipPetRemote.Name = "EquipPetRemote"; EquipPetRemote.Parent = remotes
local UnequipPetRemote = Instance.new("RemoteEvent"); UnequipPetRemote.Name = "UnequipPetRemote"; UnequipPetRemote.Parent = remotes
local HatchResultRemote = Instance.new("RemoteEvent"); HatchResultRemote.Name = "HatchResultRemote"; HatchResultRemote.Parent = remotes
local MultiHatchRemote = Instance.new("RemoteEvent"); MultiHatchRemote.Name = "MultiHatchRemote"; MultiHatchRemote.Parent = remotes
local FusePetsRemote = Instance.new("RemoteEvent"); FusePetsRemote.Name = "FusePetsRemote"; FusePetsRemote.Parent = remotes
local FuseResultRemote = Instance.new("RemoteEvent"); FuseResultRemote.Name = "FuseResultRemote"; FuseResultRemote.Parent = remotes
local QuestDataRemote = Instance.new("RemoteEvent"); QuestDataRemote.Name = "QuestDataRemote"; QuestDataRemote.Parent = remotes
local QuestClaimRemote = Instance.new("RemoteEvent"); QuestClaimRemote.Name = "QuestClaimRemote"; QuestClaimRemote.Parent = remotes
local RebirthMilestoneRemote = Instance.new("RemoteEvent"); RebirthMilestoneRemote.Name = "RebirthMilestoneRemote"; RebirthMilestoneRemote.Parent = remotes

-- Player session data
local playerData = {}
local sessionLock = {}
local lastFireTime = {} -- rate limiting

-- ── DataStore Functions ──

local function loadPlayerData(player)
    if not dataStore then return CONFIG.getDefaultData() end
    local data
    for attempt = 1, 3 do
        local ok, result = pcall(function()
            return dataStore:GetAsync("Player_" .. player.UserId)
        end)
        if ok then
            data = result
            break
        else
            warn("[Simulator] DataStore load attempt " .. attempt .. " failed: " .. tostring(result))
            if attempt < 3 then task.wait(1) end
        end
    end
    if data and type(data) == "table" then
        -- Merge with defaults to add any new fields
        local defaults = CONFIG.getDefaultData()
        for key, val in defaults do
            if data[key] == nil then data[key] = val end
        end
        return data
    end
    return CONFIG.getDefaultData()
end

local function savePlayerData(player)
    if not dataStore then return end
    if sessionLock[player.UserId] then return end
    local data = playerData[player.UserId]
    if not data then return end
    sessionLock[player.UserId] = true
    local ok, err = pcall(function()
        dataStore:SetAsync("Player_" .. player.UserId, data)
    end)
    sessionLock[player.UserId] = false
    if not ok then
        warn("[Simulator] Failed to save " .. player.Name .. ": " .. tostring(err))
    end
end

-- ── Helpers ──

local function getData(player)
    return playerData[player.UserId]
end

local function totalPower(data)
    return (data.power * data.rebirthMultiplier + data.petBonusPower) * (data.hasGamePass and 2 or 1)
end

local function syncToClient(player)
    local data = getData(player)
    if not data then return end
    -- Update leaderstats
    local ls = player:FindFirstChild("leaderstats")
    if ls then
        local cv = ls:FindFirstChild(CONFIG.CURRENCY_NAME)
        if cv then cv.Value = math.floor(data.currency) end
        local pv = ls:FindFirstChild("Power")
        if pv then pv.Value = math.floor(data.power * data.rebirthMultiplier + data.petBonusPower) end
        local rv = ls:FindFirstChild("Rebirths")
        if rv then rv.Value = data.rebirthCount end
    end
    -- Send full snapshot to client
    DataSyncRemote:FireClient(player, {
        currency = data.currency,
        bag = data.bag,
        bagMax = data.bagMax,
        power = data.power,
        powerLevel = data.powerLevel,
        bagLevel = data.bagLevel,
        rebirthCount = data.rebirthCount,
        rebirthMultiplier = data.rebirthMultiplier,
        pets = data.pets,
        equippedPets = data.equippedPets,
        petBonusPower = data.petBonusPower,
        hasGamePass = data.hasGamePass,
        totalCollected = data.totalCollected,
    })
end

local function rateCheck(player, remoteName, cooldown)
    local key = player.UserId .. "_" .. remoteName
    local now = tick()
    if lastFireTime[key] and (now - lastFireTime[key]) < cooldown then
        return false
    end
    lastFireTime[key] = now
    return true
end

local function weightedRandom(pets)
    local totalWeight = 0
    for _, p in pets do totalWeight = totalWeight + p.weight end
    local roll = math.random() * totalWeight
    local cumulative = 0
    for _, p in pets do
        cumulative = cumulative + p.weight
        if roll <= cumulative then return p end
    end
    return pets[#pets]
end

-- ── Player Lifecycle ──

local function setupPlayer(player)
    local data = loadPlayerData(player)
    playerData[player.UserId] = data

    -- Check GamePasses
    local function checkPass(passId)
        if passId <= 0 then return false end
        local ok, has = pcall(function() return MarketplaceService:UserOwnsGamePassAsync(player.UserId, passId) end)
        return ok and has or false
    end
    data.hasGamePass = checkPass(CONFIG.GAMEPASS_X2_ID)
    data.hasLuckyPass = checkPass(CONFIG.GAMEPASS_LUCKY_ID)
    data.hasAutoHatchPass = checkPass(CONFIG.GAMEPASS_AUTOHATCH_ID)
    data.hasPlus5PetsPass = checkPass(CONFIG.GAMEPASS_PLUS5_PETS_ID)
    data.hasTripleHatchPass = checkPass(CONFIG.GAMEPASS_TRIPLE_HATCH_ID)

    -- Apply lucky pass bonus (5 free luck levels)
    if data.hasLuckyPass and (data.luckLevel or 0) < 5 then
        data.luckLevel = 5
    end

    -- Generate daily quests
    generateQuests(data)
    task.defer(function()
        QuestDataRemote:FireClient(player, data.quests)
    end)

    -- Leaderstats
    local ls = Instance.new("Folder"); ls.Name = "leaderstats"; ls.Parent = player
    local cv = Instance.new("IntValue"); cv.Name = CONFIG.CURRENCY_NAME; cv.Value = math.floor(data.currency); cv.Parent = ls
    local pv = Instance.new("IntValue"); pv.Name = "Power"; pv.Value = math.floor(data.power); pv.Parent = ls
    local rv = Instance.new("IntValue"); rv.Name = "Rebirths"; rv.Value = data.rebirthCount; rv.Parent = ls

    task.defer(function() syncToClient(player) end)
end

local function cleanupPlayer(player)
    savePlayerData(player)
    lastFireTime[player.UserId .. "_Collect"] = nil
    lastFireTime[player.UserId .. "_Sell"] = nil
    playerData[player.UserId] = nil
    sessionLock[player.UserId] = nil
end

-- ── Quest Helpers ──

local function advanceQuest(data, questType, amount)
    if not data.quests then return end
    for _, q in data.quests do
        if q.type == questType and not q.claimed then
            q.progress = math.min((q.progress or 0) + (amount or 1), q.target)
        end
    end
end

local function generateQuests(data)
    local today = os.date("%Y-%m-%d")
    if data.lastQuestDate == today and #data.quests > 0 then return end
    data.quests = {}
    data.lastQuestDate = today
    local used = {}
    for _ = 1, CONFIG.QUESTS_PER_SESSION do
        local idx
        repeat idx = math.random(1, #CONFIG.QUEST_TYPES) until not used[idx]
        used[idx] = true
        local qt = CONFIG.QUEST_TYPES[idx]
        local tIdx = math.random(1, #qt.targets)
        table.insert(data.quests, {
            type = qt.type,
            desc = string.format(qt.desc, qt.targets[tIdx]),
            target = qt.targets[tIdx],
            progress = 0,
            reward = qt.reward[tIdx],
            claimed = false,
        })
    end
end

-- ── Variant Roll ──

local function rollVariant(data)
    local luckMult = 1 + (data.luckLevel or 0) * CONFIG.LUCK_PER_LEVEL
    local roll = math.random()
    if roll <= CONFIG.RAINBOW_CHANCE * luckMult then
        return "rainbow", CONFIG.RAINBOW_BONUS
    elseif roll <= (CONFIG.RAINBOW_CHANCE + CONFIG.GOLDEN_CHANCE) * luckMult then
        return "golden", CONFIG.GOLDEN_BONUS
    end
    return nil, 0
end

-- ── Handler Functions (used by both RemoteEvents and ProximityPrompts) ──

local function handleCollect(player, zoneName)
    if type(zoneName) ~= "string" then return end
    if not rateCheck(player, "Collect", CONFIG.COLLECT_COOLDOWN) then return end
    if not zoneName:match("^CollectZone_") then return end

    local data = getData(player)
    if not data then return end

    local zoneTier = CONFIG.getZoneTier(zoneName)
    if data.rebirthCount < zoneTier.rebirthReq then return end
    if data.bag >= data.bagMax then return end

    local gain = CONFIG.BASE_COLLECT * zoneTier.baseValue * totalPower(data)
    data.bag = math.min(data.bag + gain, data.bagMax)
    data.totalCollected = data.totalCollected + gain
    advanceQuest(data, "collect", gain)
    syncToClient(player)
end

local function handleSell(player)
    if not rateCheck(player, "Sell", 0.5) then return end
    local data = getData(player)
    if not data or data.bag <= 0 then return end
    data.currency = data.currency + data.bag
    data.bag = 0
    data.totalSells = (data.totalSells or 0) + 1
    advanceQuest(data, "sell", 1)
    syncToClient(player)
end

local function recalcPetBonus(data)
    local bonus = 0
    for _, idx in data.equippedPets do
        local pet = data.pets[idx]
        if pet then bonus = bonus + pet.powerBonus end
    end
    data.petBonusPower = bonus
end

-- ── Remote Handlers (all validation server-side) ──

CollectRemote.OnServerEvent:Connect(handleCollect)
SellRemote.OnServerEvent:Connect(handleSell)

BuyUpgradeRemote.OnServerEvent:Connect(function(player, upgradeType)
    if type(upgradeType) ~= "string" then return end
    local validTypes = { power = true, bag = true }
    if not validTypes[upgradeType] then return end

    local data = getData(player)
    if not data then return end

    if upgradeType == "power" then
        local cost = CONFIG.powerUpgradeCost(data.powerLevel)
        if data.currency < cost then return end
        data.currency = data.currency - cost
        data.powerLevel = data.powerLevel + 1
        data.power = 1 + data.powerLevel * 2
    elseif upgradeType == "bag" then
        local cost = CONFIG.bagUpgradeCost(data.bagLevel)
        if data.currency < cost then return end
        data.currency = data.currency - cost
        data.bagLevel = data.bagLevel + 1
        data.bagMax = 20 + data.bagLevel * 10
    end
    syncToClient(player)
end)

HatchEggRemote.OnServerEvent:Connect(function(player, eggTierIdx)
    if type(eggTierIdx) ~= "number" then return end
    eggTierIdx = math.floor(eggTierIdx)
    if eggTierIdx < 1 or eggTierIdx > #CONFIG.EGG_TIERS then return end

    local data = getData(player)
    if not data then return end

    local eggTier = CONFIG.EGG_TIERS[eggTierIdx]
    if data.currency < eggTier.cost then return end
    data.currency = data.currency - eggTier.cost

    local petInfo = weightedRandom(eggTier.pets)
    local variant, variantBonus = rollVariant(data)
    local finalPower = petInfo.powerBonus * (1 + variantBonus)
    table.insert(data.pets, { name = petInfo.name, rarity = petInfo.rarity, powerBonus = finalPower, variant = variant })

    -- Track hatching for quests
    data.totalHatched = (data.totalHatched or 0) + 1
    advanceQuest(data, "hatch", 1)

    -- Auto-equip if slots available
    local maxEquip = CONFIG.MAX_EQUIPPED_PETS
    if data.hasPlus5PetsPass then maxEquip = maxEquip + 5 end
    if #data.equippedPets < maxEquip then
        table.insert(data.equippedPets, #data.pets)
        recalcPetBonus(data)
    end

    -- Send hatch result to client for animation
    HatchResultRemote:FireClient(player, { name = petInfo.name, rarity = petInfo.rarity, powerBonus = finalPower, variant = variant, eggTier = eggTierIdx })
    syncToClient(player)
end)

-- ── Equip / Unequip Pets ──

EquipPetRemote.OnServerEvent:Connect(function(player, petIdx)
    if type(petIdx) ~= "number" then return end
    petIdx = math.floor(petIdx)
    local data = getData(player)
    if not data then return end
    if petIdx < 1 or petIdx > #data.pets then return end
    if #data.equippedPets >= CONFIG.MAX_EQUIPPED_PETS then return end
    -- Check not already equipped
    for _, idx in data.equippedPets do
        if idx == petIdx then return end
    end
    table.insert(data.equippedPets, petIdx)
    recalcPetBonus(data)
    syncToClient(player)
end)

UnequipPetRemote.OnServerEvent:Connect(function(player, petIdx)
    if type(petIdx) ~= "number" then return end
    petIdx = math.floor(petIdx)
    local data = getData(player)
    if not data then return end
    for i, idx in data.equippedPets do
        if idx == petIdx then
            table.remove(data.equippedPets, i)
            recalcPetBonus(data)
            syncToClient(player)
            return
        end
    end
end)

RebirthRemote.OnServerEvent:Connect(function(player)
    if not rateCheck(player, "Rebirth", 2) then return end
    local data = getData(player)
    if not data then return end
    local cost = CONFIG.rebirthCost(data.rebirthCount)
    if data.currency < cost then return end

    -- Reset progress
    data.currency = 0
    data.bag = 0
    data.power = 1
    data.powerLevel = 0
    data.bagLevel = 0
    data.bagMax = 20
    -- Permanent bonus
    data.rebirthCount = data.rebirthCount + 1
    data.rebirthMultiplier = 1 + CONFIG.REBIRTH_MULTIPLIER_PER * data.rebirthCount

    -- Check milestones
    local milestone = CONFIG.REBIRTH_MILESTONES[data.rebirthCount]
    if milestone then
        RebirthMilestoneRemote:FireClient(player, { rebirthCount = data.rebirthCount, unlocks = milestone, newMultiplier = data.rebirthMultiplier })
    end

    syncToClient(player)
end)

-- ── Auto-Collect & Speed Boost Upgrades ──

BuyUpgradeRemote.OnServerEvent:Connect(function(player, upgradeType)
    if upgradeType == "autoCollect" then
        local data = getData(player)
        if not data or data.hasAutoCollect then return end
        if data.currency < CONFIG.AUTO_COLLECT_COST then return end
        data.currency = data.currency - CONFIG.AUTO_COLLECT_COST
        data.hasAutoCollect = true
        syncToClient(player)
    elseif upgradeType == "speedBoost" then
        local data = getData(player)
        if not data then return end
        if data.currency < CONFIG.SPEED_BOOST_COST then return end
        data.currency = data.currency - CONFIG.SPEED_BOOST_COST
        data.hasSpeedBoost = true
        data.speedBoostEnd = tick() + CONFIG.SPEED_BOOST_DURATION
        local humanoid = player.Character and player.Character:FindFirstChildOfClass("Humanoid")
        if humanoid then humanoid.WalkSpeed = 16 * CONFIG.SPEED_BOOST_MULTIPLIER end
        syncToClient(player)
        -- Reset speed after duration
        task.delay(CONFIG.SPEED_BOOST_DURATION, function()
            data.hasSpeedBoost = false
            local hum = player.Character and player.Character:FindFirstChildOfClass("Humanoid")
            if hum then hum.WalkSpeed = 16 end
            syncToClient(player)
        end)
    elseif upgradeType == "luck" then
        local data = getData(player)
        if not data then return end
        local lvl = data.luckLevel or 0
        if lvl >= CONFIG.LUCK_MAX_LEVEL then return end
        local cost = CONFIG.luckUpgradeCost(lvl)
        if data.currency < cost then return end
        data.currency = data.currency - cost
        data.luckLevel = lvl + 1
        syncToClient(player)
    end
end)

-- Auto-collect loop for players who purchased it
task.spawn(function()
    while true do
        task.wait(CONFIG.AUTO_COLLECT_INTERVAL)
        for _, player in Players:GetPlayers() do
            local data = getData(player)
            if not data or not data.hasAutoCollect then continue end
            local character = player.Character
            if not character then continue end
            local root = character:FindFirstChild("HumanoidRootPart")
            if not root then continue end

            -- Find nearest zone in range
            local content = workspace:FindFirstChild("GeneratedContent")
            if not content then continue end
            for _, obj in content:GetDescendants() do
                if obj:IsA("BasePart") and obj.Name:match("^CollectZone_") then
                    local dist = (obj.Position - root.Position).Magnitude
                    if dist < CONFIG.AUTO_COLLECT_RANGE then
                        handleCollect(player, obj.Name)
                        break
                    end
                end
            end
        end
    end
end)

-- Auto-hatch loop for players with AutoHatch game pass
task.spawn(function()
    while true do
        task.wait(5)
        for _, player in Players:GetPlayers() do
            local data = getData(player)
            if not data or not data.hasAutoHatchPass then continue end
            -- Auto-hatch cheapest affordable egg
            for i = #CONFIG.EGG_TIERS, 1, -1 do
                local eggTier = CONFIG.EGG_TIERS[i]
                if data.rebirthCount >= (CONFIG.ZONE_TIERS[i] and CONFIG.ZONE_TIERS[i].rebirthReq or 0) and data.currency >= eggTier.cost then
                    data.currency = data.currency - eggTier.cost
                    local petInfo = weightedRandom(eggTier.pets)
                    local variant, variantBonus = rollVariant(data)
                    local finalPower = petInfo.powerBonus * (1 + variantBonus)
                    table.insert(data.pets, { name = petInfo.name, rarity = petInfo.rarity, powerBonus = finalPower, variant = variant })
                    data.totalHatched = (data.totalHatched or 0) + 1
                    advanceQuest(data, "hatch", 1)
                    local maxEquip = CONFIG.MAX_EQUIPPED_PETS
                    if data.hasPlus5PetsPass then maxEquip = maxEquip + 5 end
                    if #data.equippedPets < maxEquip then
                        table.insert(data.equippedPets, #data.pets)
                        recalcPetBonus(data)
                    end
                    HatchResultRemote:FireClient(player, { name = petInfo.name, rarity = petInfo.rarity, powerBonus = finalPower, variant = variant, eggTier = i })
                    syncToClient(player)
                    break
                end
            end
        end
    end
end)

-- ── Multi-Hatch ──

MultiHatchRemote.OnServerEvent:Connect(function(player, eggTierIdx, count)
    if type(eggTierIdx) ~= "number" or type(count) ~= "number" then return end
    eggTierIdx = math.floor(eggTierIdx)
    count = math.floor(count)
    if count ~= 3 and count ~= 5 then return end
    if eggTierIdx < 1 or eggTierIdx > #CONFIG.EGG_TIERS then return end

    local data = getData(player)
    if not data then return end

    -- Check rebirth requirement for multi-hatch tier
    if count == 3 and data.rebirthCount < CONFIG.MULTI_HATCH_3_UNLOCK then return end
    if count == 5 and data.rebirthCount < CONFIG.MULTI_HATCH_5_UNLOCK then return end

    local eggTier = CONFIG.EGG_TIERS[eggTierIdx]
    local totalCost = eggTier.cost * count
    -- Triple hatch pass: pay for 1 instead of 3
    if data.hasTripleHatchPass and count == 3 then totalCost = eggTier.cost end
    if data.currency < totalCost then return end
    data.currency = data.currency - totalCost

    local results = {}
    local maxEquip = CONFIG.MAX_EQUIPPED_PETS
    if data.hasPlus5PetsPass then maxEquip = maxEquip + 5 end

    for i = 1, count do
        local petInfo = weightedRandom(eggTier.pets)
        local variant, variantBonus = rollVariant(data)
        local finalPower = petInfo.powerBonus * (1 + variantBonus)
        table.insert(data.pets, { name = petInfo.name, rarity = petInfo.rarity, powerBonus = finalPower, variant = variant })
        data.totalHatched = (data.totalHatched or 0) + 1
        advanceQuest(data, "hatch", 1)

        if #data.equippedPets < maxEquip then
            table.insert(data.equippedPets, #data.pets)
        end

        table.insert(results, { name = petInfo.name, rarity = petInfo.rarity, powerBonus = finalPower, variant = variant, eggTier = eggTierIdx })
    end
    recalcPetBonus(data)
    HatchResultRemote:FireClient(player, results)
    syncToClient(player)
end)

-- ── Fuse Pets ──

FusePetsRemote.OnServerEvent:Connect(function(player, petIndices)
    if type(petIndices) ~= "table" or #petIndices ~= CONFIG.FUSE_COUNT then return end
    local data = getData(player)
    if not data then return end
    if data.rebirthCount < CONFIG.FUSE_UNLOCK_REBIRTH then return end

    -- Validate indices and same rarity
    local rarity = nil
    local validIndices = {}
    for _, idx in petIndices do
        if type(idx) ~= "number" then return end
        idx = math.floor(idx)
        if idx < 1 or idx > #data.pets then return end
        local pet = data.pets[idx]
        if not pet then return end
        if rarity == nil then
            rarity = pet.rarity
        elseif pet.rarity ~= rarity then
            return -- Must all be same rarity
        end
        -- Check not equipped
        for _, eqIdx in data.equippedPets do
            if eqIdx == idx then return end
        end
        table.insert(validIndices, idx)
    end
    -- Check no duplicates
    local seen = {}
    for _, idx in validIndices do
        if seen[idx] then return end
        seen[idx] = true
    end

    -- Find next rarity
    local nextRarity = nil
    for i, r in CONFIG.FUSE_RARITY_ORDER do
        if r == rarity and i < #CONFIG.FUSE_RARITY_ORDER then
            nextRarity = CONFIG.FUSE_RARITY_ORDER[i + 1]
            break
        end
    end
    if not nextRarity then return end -- Already max rarity

    -- Remove pets (highest index first to avoid shifting)
    table.sort(validIndices, function(a, b) return a > b end)
    for _, idx in validIndices do
        table.remove(data.pets, idx)
    end
    -- Fix equipped indices after removal
    local newEquipped = {}
    for _, eqIdx in data.equippedPets do
        local newIdx = eqIdx
        for _, removedIdx in validIndices do
            if eqIdx > removedIdx then
                newIdx = newIdx - 1
            end
        end
        if newIdx >= 1 and newIdx <= #data.pets then
            table.insert(newEquipped, newIdx)
        end
    end
    data.equippedPets = newEquipped

    -- Create fused pet
    local variant, variantBonus = rollVariant(data)
    local fusedPower = 1.5 * (1 + variantBonus)
    local fusedPet = { name = nextRarity .. " Fused Pet", rarity = nextRarity, powerBonus = fusedPower, variant = variant }
    table.insert(data.pets, fusedPet)
    recalcPetBonus(data)

    FuseResultRemote:FireClient(player, fusedPet)
    syncToClient(player)
end)

-- ── Quest Claim ──

QuestClaimRemote.OnServerEvent:Connect(function(player, questIndex)
    if type(questIndex) ~= "number" then return end
    questIndex = math.floor(questIndex)
    local data = getData(player)
    if not data then return end
    if not data.quests or questIndex < 1 or questIndex > #data.quests then return end

    local quest = data.quests[questIndex]
    if not quest or quest.claimed then return end
    if quest.progress < quest.target then return end

    quest.claimed = true
    data.currency = data.currency + quest.reward
    QuestDataRemote:FireClient(player, data.quests)
    syncToClient(player)
end)

-- ── Developer Products ──

MarketplaceService.ProcessReceipt = function(receiptInfo)
    local player = Players:GetPlayerByUserId(receiptInfo.PlayerId)
    if not player then return Enum.ProductPurchaseDecision.NotProcessedYet end
    local data = getData(player)
    if not data then return Enum.ProductPurchaseDecision.NotProcessedYet end

    -- Idempotency: check if already processed
    local receiptId = tostring(receiptInfo.PurchaseId)
    if data.processedReceipts[receiptId] then
        return Enum.ProductPurchaseDecision.PurchaseGranted
    end

    local productId = receiptInfo.ProductId
    if CONFIG.DEVPRODUCT_100_COINS > 0 and productId == CONFIG.DEVPRODUCT_100_COINS then
        data.currency = data.currency + 100
        data.processedReceipts[receiptId] = true
        savePlayerData(player)
        syncToClient(player)
        return Enum.ProductPurchaseDecision.PurchaseGranted
    elseif CONFIG.DEVPRODUCT_500_COINS > 0 and productId == CONFIG.DEVPRODUCT_500_COINS then
        data.currency = data.currency + 500
        data.processedReceipts[receiptId] = true
        savePlayerData(player)
        syncToClient(player)
        return Enum.ProductPurchaseDecision.PurchaseGranted
    elseif CONFIG.DEVPRODUCT_5000_COINS > 0 and productId == CONFIG.DEVPRODUCT_5000_COINS then
        data.currency = data.currency + 5000
        data.processedReceipts[receiptId] = true
        savePlayerData(player)
        syncToClient(player)
        return Enum.ProductPurchaseDecision.PurchaseGranted
    end

    return Enum.ProductPurchaseDecision.NotProcessedYet
end

-- Client requests DevProduct purchase
BuyProductRemote.OnServerEvent:Connect(function(player, productId)
    if type(productId) ~= "number" or productId <= 0 then return end
    pcall(function()
        MarketplaceService:PromptProductPurchase(player, productId)
    end)
end)

-- GamePass purchase listener (live purchase during session)
MarketplaceService.PromptGamePassPurchaseFinished:Connect(function(player, gamePassId, wasPurchased)
    if not wasPurchased then return end
    local data = getData(player)
    if not data then return end

    if gamePassId == CONFIG.GAMEPASS_X2_ID then
        data.hasGamePass = true
    elseif CONFIG.GAMEPASS_LUCKY_ID > 0 and gamePassId == CONFIG.GAMEPASS_LUCKY_ID then
        data.hasLuckyPass = true
        -- Lucky pass gives +25% luck permanently
        data.luckLevel = math.min((data.luckLevel or 0) + 5, CONFIG.LUCK_MAX_LEVEL)
    elseif CONFIG.GAMEPASS_AUTOHATCH_ID > 0 and gamePassId == CONFIG.GAMEPASS_AUTOHATCH_ID then
        data.hasAutoHatchPass = true
    elseif CONFIG.GAMEPASS_PLUS5_PETS_ID > 0 and gamePassId == CONFIG.GAMEPASS_PLUS5_PETS_ID then
        data.hasPlus5PetsPass = true
    elseif CONFIG.GAMEPASS_TRIPLE_HATCH_ID > 0 and gamePassId == CONFIG.GAMEPASS_TRIPLE_HATCH_ID then
        data.hasTripleHatchPass = true
    end
    syncToClient(player)
end)

-- ── ProximityPrompts (fallback for mobile/gamepad) ──

local function setupProximityPrompts()
    local content = workspace:FindFirstChild("GeneratedContent")
    if not content then return end

    for _, obj in content:GetDescendants() do
        if not obj:IsA("BasePart") then continue end

        if obj.Name:match("CollectZone") then
            -- Only add if no ProximityPrompt already exists (scene template may have added one)
            if not obj:FindFirstChildOfClass("ProximityPrompt") then
                local zoneTier = CONFIG.getZoneTier(obj.Name)
                local prompt = Instance.new("ProximityPrompt")
                prompt.ActionText = "Collect (Tier " .. zoneTier.tier .. ")"
                prompt.ObjectText = "Zone " .. zoneTier.tier
                prompt.HoldDuration = 0.1
                prompt.MaxActivationDistance = 12
                prompt.Parent = obj
            end
            -- Connect ALL prompts (including scene-template ones)
            for _, prompt in obj:GetChildren() do
                if prompt:IsA("ProximityPrompt") then
                    prompt.Triggered:Connect(function(player)
                        handleCollect(player, obj.Name)
                    end)
                end
            end
        end

        -- Sell zone touch + prompt
        if obj.Name:match("Sell") and not obj.Name:match("Collect") then
            obj.Touched:Connect(function(hit)
                local player = Players:GetPlayerFromCharacter(hit.Parent)
                if player then handleSell(player) end
            end)
            for _, prompt in obj:GetChildren() do
                if prompt:IsA("ProximityPrompt") then
                    prompt.Triggered:Connect(function(player) handleSell(player) end)
                end
            end
        end

        -- Egg hatching via ProximityPrompt
        if obj.Name:match("^EggZone_") then
            local eggNum = tonumber(obj.Name:match("%d+")) or 1
            for _, prompt in obj:GetChildren() do
                if prompt:IsA("ProximityPrompt") then
                    prompt.Triggered:Connect(function(player)
                        if type(eggNum) ~= "number" then return end
                        if eggNum < 1 or eggNum > #CONFIG.EGG_TIERS then return end
                        local data = getData(player)
                        if not data then return end
                        local eggTier = CONFIG.EGG_TIERS[eggNum]
                        if data.currency < eggTier.cost then return end
                        data.currency = data.currency - eggTier.cost
                        local petInfo = weightedRandom(eggTier.pets)
                        local variant, variantBonus = rollVariant(data)
                        local finalPower = petInfo.powerBonus * (1 + variantBonus)
                        table.insert(data.pets, { name = petInfo.name, rarity = petInfo.rarity, powerBonus = finalPower, variant = variant })
                        data.totalHatched = (data.totalHatched or 0) + 1
                        advanceQuest(data, "hatch", 1)
                        local maxEquip = CONFIG.MAX_EQUIPPED_PETS
                        if data.hasPlus5PetsPass then maxEquip = maxEquip + 5 end
                        if #data.equippedPets < maxEquip then
                            table.insert(data.equippedPets, #data.pets)
                            recalcPetBonus(data)
                        end
                        HatchResultRemote:FireClient(player, { name = petInfo.name, rarity = petInfo.rarity, powerBonus = finalPower, variant = variant, eggTier = eggNum })
                        syncToClient(player)
                    end)
                end
            end
        end

        -- PowerUp via ProximityPrompt
        if obj.Name:match("PowerUp") then
            for _, prompt in obj:GetChildren() do
                if prompt:IsA("ProximityPrompt") then
                    prompt.Triggered:Connect(function(player)
                        local data = getData(player)
                        if not data then return end
                        local cost = CONFIG.powerUpgradeCost(data.powerLevel)
                        if data.currency < cost then return end
                        data.currency = data.currency - cost
                        data.powerLevel = data.powerLevel + 1
                        data.power = 1 + data.powerLevel * 2
                        syncToClient(player)
                    end)
                end
            end
        end

        -- BagUpgrade via ProximityPrompt
        if obj.Name:match("BagUpgrade") then
            for _, prompt in obj:GetChildren() do
                if prompt:IsA("ProximityPrompt") then
                    prompt.Triggered:Connect(function(player)
                        local data = getData(player)
                        if not data then return end
                        local cost = CONFIG.bagUpgradeCost(data.bagLevel)
                        if data.currency < cost then return end
                        data.currency = data.currency - cost
                        data.bagLevel = data.bagLevel + 1
                        data.bagMax = 20 + data.bagLevel * 10
                        syncToClient(player)
                    end)
                end
            end
        end

        -- Rebirth via ProximityPrompt
        if obj.Name:match("Rebirth") and obj.Name:match("Button") then
            for _, prompt in obj:GetChildren() do
                if prompt:IsA("ProximityPrompt") then
                    prompt.Triggered:Connect(function(player)
                        local data = getData(player)
                        if not data then return end
                        local cost = CONFIG.rebirthCost(data.rebirthCount)
                        if data.currency < cost then return end
                        data.currency = 0
                        data.bag = 0
                        data.power = 1
                        data.powerLevel = 0
                        data.bagLevel = 0
                        data.bagMax = 20
                        data.rebirthCount = data.rebirthCount + 1
                        data.rebirthMultiplier = 1 + 0.5 * data.rebirthCount
                        recalcPetBonus(data)
                        syncToClient(player)
                    end)
                end
            end
        end

        -- Zone gates: unlock on rebirth
        if obj.Name:match("^ZoneGate_") then
            local gateNum = tonumber(obj.Name:match("%d+")) or 1
            for _, prompt in obj:GetChildren() do
                if prompt:IsA("ProximityPrompt") then
                    prompt.Triggered:Connect(function(player)
                        local data = getData(player)
                        if not data then return end
                        if data.rebirthCount >= gateNum then
                            -- Unlock: make gate transparent and non-collidable
                            obj.Transparency = 1
                            obj.CanCollide = false
                            -- Also hide billboard
                            local bb = obj:FindFirstChildOfClass("BillboardGui")
                            if bb then bb.Enabled = false end
                        end
                    end)
                end
            end
        end
    end
end

-- ── Auto-save ──

task.spawn(function()
    while true do
        task.wait(CONFIG.SAVE_INTERVAL)
        for _, player in Players:GetPlayers() do
            task.spawn(savePlayerData, player)
        end
    end
end)

-- ── BindToClose (save all before shutdown) ──

game:BindToClose(function()
    for _, player in Players:GetPlayers() do
        task.spawn(savePlayerData, player)
    end
    task.wait(3)
end)

-- ── Init ──

Players.PlayerAdded:Connect(setupPlayer)
Players.PlayerRemoving:Connect(cleanupPlayer)
task.wait(1)
setupProximityPrompts()
print("[Simulator] Server initialized | DataStore: " .. tostring(dataStore ~= nil) .. " | GamePass ID: " .. CONFIG.GAMEPASS_X2_ID .. " | DevProduct ID: " .. CONFIG.DEVPRODUCT_100_COINS)
`;
}

function buildSimulatorClientScript(params: GameTemplateParams): string {
  const currency = params.currencyName || 'Coins';
  return `-- SimulatorClient: Glassmorphism GUI + Click interaction + Pop-up numbers + Pet rendering
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local TweenService = game:GetService("TweenService")
local MarketplaceService = game:GetService("MarketplaceService")

local CONFIG = require(ReplicatedStorage:WaitForChild("SimulatorConfig"))
local remotes = ReplicatedStorage:WaitForChild("Remotes")
local CollectRemote = remotes:WaitForChild("CollectRemote")
local SellRemote = remotes:WaitForChild("SellRemote")
local BuyUpgradeRemote = remotes:WaitForChild("BuyUpgradeRemote")
local HatchEggRemote = remotes:WaitForChild("HatchEggRemote")
local RebirthRemote = remotes:WaitForChild("RebirthRemote")
local DataSyncRemote = remotes:WaitForChild("DataSyncRemote")
local BuyProductRemote = remotes:WaitForChild("BuyProductRemote")
local EquipPetRemote = remotes:WaitForChild("EquipPetRemote")
local UnequipPetRemote = remotes:WaitForChild("UnequipPetRemote")
local HatchResultRemote = remotes:WaitForChild("HatchResultRemote")
local MultiHatchRemote = remotes:WaitForChild("MultiHatchRemote")
local FusePetsRemote = remotes:WaitForChild("FusePetsRemote")
local FuseResultRemote = remotes:WaitForChild("FuseResultRemote")
local QuestDataRemote = remotes:WaitForChild("QuestDataRemote")
local QuestClaimRemote = remotes:WaitForChild("QuestClaimRemote")
local RebirthMilestoneRemote = remotes:WaitForChild("RebirthMilestoneRemote")

local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")
local localData = CONFIG.getDefaultData()
local petParts = {}
local lastCollectTime = 0
local lastSellTime = 0
local prevCurrency = 0

-- ══════════════════════════════════════════════
-- ██ GLASSMORPHISM GUI BUILDER
-- ══════════════════════════════════════════════

local ACCENT = Color3.fromRGB(0, 200, 255)
local ACCENT2 = Color3.fromRGB(180, 60, 255)
local BG_COLOR = Color3.fromRGB(15, 15, 25)
local GLASS_BG = Color3.fromRGB(25, 25, 40)
local TEXT_COLOR = Color3.new(1, 1, 1)

local function addCorner(parent, radius)
    local c = Instance.new("UICorner")
    c.CornerRadius = UDim.new(0, radius or 12)
    c.Parent = parent
    return c
end

local function addStroke(parent, color, thickness)
    local s = Instance.new("UIStroke")
    s.Color = color or ACCENT
    s.Thickness = thickness or 1.5
    s.Transparency = 0.4
    s.Parent = parent
    return s
end

local function addGradient(parent, c1, c2)
    local g = Instance.new("UIGradient")
    g.Color = ColorSequence.new(c1 or ACCENT, c2 or ACCENT2)
    g.Rotation = 45
    g.Parent = parent
    return g
end

local function glassFrame(parent, size, pos, name)
    local f = Instance.new("Frame")
    f.Name = name or "GlassPanel"
    f.Size = size
    f.Position = pos
    f.BackgroundColor3 = GLASS_BG
    f.BackgroundTransparency = 0.35
    f.BorderSizePixel = 0
    f.Parent = parent
    addCorner(f, 16)
    addStroke(f, ACCENT, 1.5)
    return f
end

-- ══════════════════════════════════════════════
-- ██ HUD CREATION
-- ══════════════════════════════════════════════

local hud = Instance.new("ScreenGui")
hud.Name = "SimulatorHUD"
hud.ResetOnSpawn = false
hud.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
hud.Parent = playerGui

-- Top bar
local topBar = glassFrame(hud, UDim2.new(0, 520, 0, 56), UDim2.new(0.5, -260, 0, 10), "TopBar")

-- Currency icon + label
local coinIcon = Instance.new("TextLabel")
coinIcon.Name = "CoinIcon"
coinIcon.Size = UDim2.new(0, 40, 0, 40)
coinIcon.Position = UDim2.new(0, 10, 0.5, -20)
coinIcon.BackgroundColor3 = Color3.fromRGB(255, 200, 50)
coinIcon.BackgroundTransparency = 0.1
coinIcon.Text = "${currency === 'Coins' ? '💰' : '💎'}"
coinIcon.TextScaled = true
coinIcon.Font = Enum.Font.GothamBold
coinIcon.Parent = topBar
addCorner(coinIcon, 20)

local currencyLabel = Instance.new("TextLabel")
currencyLabel.Name = "CurrencyLabel"
currencyLabel.Size = UDim2.new(0, 130, 1, 0)
currencyLabel.Position = UDim2.new(0, 55, 0, 0)
currencyLabel.BackgroundTransparency = 1
currencyLabel.Text = "0"
currencyLabel.TextColor3 = Color3.fromRGB(255, 220, 80)
currencyLabel.TextScaled = true
currencyLabel.Font = Enum.Font.GothamBold
currencyLabel.TextXAlignment = Enum.TextXAlignment.Left
currencyLabel.Parent = topBar

-- Bag bar
local bagFrame = glassFrame(topBar, UDim2.new(0, 120, 0, 30), UDim2.new(0, 195, 0.5, -15), "BagFrame")
bagFrame.BackgroundTransparency = 0.6
local bagFill = Instance.new("Frame")
bagFill.Name = "BagFill"
bagFill.Size = UDim2.new(0, 0, 1, -4)
bagFill.Position = UDim2.new(0, 2, 0, 2)
bagFill.BackgroundColor3 = ACCENT
bagFill.BorderSizePixel = 0
bagFill.Parent = bagFrame
addCorner(bagFill, 12)
addGradient(bagFill, ACCENT, ACCENT2)

local bagLabel = Instance.new("TextLabel")
bagLabel.Name = "BagLabel"
bagLabel.Size = UDim2.new(1, 0, 1, 0)
bagLabel.BackgroundTransparency = 1
bagLabel.Text = "0/20"
bagLabel.TextColor3 = TEXT_COLOR
bagLabel.TextScaled = true
bagLabel.Font = Enum.Font.GothamBold
bagLabel.ZIndex = 2
bagLabel.Parent = bagFrame

-- Power label
local powerLabel = Instance.new("TextLabel")
powerLabel.Name = "PowerLabel"
powerLabel.Size = UDim2.new(0, 80, 1, 0)
powerLabel.Position = UDim2.new(0, 325, 0, 0)
powerLabel.BackgroundTransparency = 1
powerLabel.Text = "⚡ 1"
powerLabel.TextColor3 = Color3.fromRGB(100, 200, 255)
powerLabel.TextScaled = true
powerLabel.Font = Enum.Font.GothamBold
powerLabel.Parent = topBar

-- Rebirth label
local rebirthLabel = Instance.new("TextLabel")
rebirthLabel.Name = "RebirthLabel"
rebirthLabel.Size = UDim2.new(0, 80, 1, 0)
rebirthLabel.Position = UDim2.new(0, 415, 0, 0)
rebirthLabel.BackgroundTransparency = 1
rebirthLabel.Text = "🔄 0"
rebirthLabel.TextColor3 = Color3.fromRGB(255, 180, 80)
rebirthLabel.TextScaled = true
rebirthLabel.Font = Enum.Font.GothamBold
rebirthLabel.Parent = topBar

-- GamePass badge
local gpBadge = Instance.new("TextLabel")
gpBadge.Name = "GamePassBadge"
gpBadge.Size = UDim2.new(0, 50, 0, 22)
gpBadge.Position = UDim2.new(1, -55, 0, -5)
gpBadge.BackgroundColor3 = Color3.fromRGB(255, 50, 100)
gpBadge.BackgroundTransparency = 0.2
gpBadge.Text = "x2"
gpBadge.TextColor3 = TEXT_COLOR
gpBadge.TextScaled = true
gpBadge.Font = Enum.Font.GothamBold
gpBadge.Visible = false
gpBadge.Parent = topBar
addCorner(gpBadge, 8)
addStroke(gpBadge, Color3.fromRGB(255, 80, 120), 1)

-- Pet count (bottom-left)
local petPanel = glassFrame(hud, UDim2.new(0, 140, 0, 36), UDim2.new(0, 10, 1, -46), "PetPanel")
local petLabel = Instance.new("TextLabel")
petLabel.Name = "PetLabel"
petLabel.Size = UDim2.new(1, -8, 1, -4)
petLabel.Position = UDim2.new(0, 4, 0, 2)
petLabel.BackgroundTransparency = 1
petLabel.Text = "🐾 Pets: 0/3"
petLabel.TextColor3 = TEXT_COLOR
petLabel.TextScaled = true
petLabel.Font = Enum.Font.GothamMedium
petLabel.Parent = petPanel

-- ══════════════════════════════════════════════
-- ██ POP-UP FLOATING NUMBERS
-- ══════════════════════════════════════════════

local function popupNumber(amount, color, prefix)
    local character = player.Character
    if not character then return end
    local head = character:FindFirstChild("Head")
    if not head then return end

    local bb = Instance.new("BillboardGui")
    bb.Size = UDim2.new(0, 120, 0, 50)
    bb.StudsOffset = Vector3.new(math.random(-15, 15) / 10, 3, 0)
    bb.AlwaysOnTop = true
    bb.Adornee = head
    bb.Parent = playerGui

    local label = Instance.new("TextLabel")
    label.Size = UDim2.new(1, 0, 1, 0)
    label.BackgroundTransparency = 1
    label.Text = (prefix or "+") .. tostring(math.floor(amount))
    label.TextColor3 = color or Color3.fromRGB(255, 220, 50)
    label.TextStrokeColor3 = Color3.new(0, 0, 0)
    label.TextStrokeTransparency = 0.3
    label.TextScaled = true
    label.Font = Enum.Font.GothamBold
    label.Parent = bb

    -- Animate: float up + fade out
    local tweenInfo = TweenInfo.new(1.2, Enum.EasingStyle.Quad, Enum.EasingDirection.Out)
    local floatTween = TweenService:Create(bb, tweenInfo, {
        StudsOffset = bb.StudsOffset + Vector3.new(0, 3, 0)
    })
    local fadeTween = TweenService:Create(label, tweenInfo, {
        TextTransparency = 1,
        TextStrokeTransparency = 1
    })

    -- Scale pop effect
    label.TextScaled = false
    label.TextSize = 14
    local popTween = TweenService:Create(label, TweenInfo.new(0.15, Enum.EasingStyle.Back, Enum.EasingDirection.Out), {
        TextSize = 28
    })
    popTween:Play()
    task.delay(0.15, function()
        label.TextScaled = true
    end)

    floatTween:Play()
    fadeTween:Play()
    task.delay(1.3, function()
        bb:Destroy()
    end)
end

-- Pop-up for sell (currency gain)
local function popupSell(gained)
    if gained > 0 then
        popupNumber(gained, Color3.fromRGB(255, 220, 50), "+")
    end
end

-- Pop-up for collect (bag gain)
local function popupCollect()
    popupNumber(1, Color3.fromRGB(100, 220, 255), "+")
end

-- Pop-up for hatch
local function popupHatch(petName, rarity)
    local rarityColors = {
        Common = Color3.fromRGB(180, 180, 180),
        Uncommon = Color3.fromRGB(80, 230, 80),
        Rare = Color3.fromRGB(80, 130, 255),
        Legendary = Color3.fromRGB(255, 190, 50),
        Mythic = Color3.fromRGB(230, 80, 255),
    }
    local character = player.Character
    if not character then return end
    local head = character:FindFirstChild("Head")
    if not head then return end

    local bb = Instance.new("BillboardGui")
    bb.Size = UDim2.new(0, 180, 0, 60)
    bb.StudsOffset = Vector3.new(0, 4, 0)
    bb.AlwaysOnTop = true
    bb.Adornee = head
    bb.Parent = playerGui

    local label = Instance.new("TextLabel")
    label.Size = UDim2.new(1, 0, 1, 0)
    label.BackgroundTransparency = 1
    label.Text = "🥚 " .. petName .. "!"
    label.TextColor3 = rarityColors[rarity] or TEXT_COLOR
    label.TextStrokeColor3 = Color3.new(0, 0, 0)
    label.TextStrokeTransparency = 0.2
    label.TextScaled = true
    label.Font = Enum.Font.GothamBold
    label.Parent = bb

    local tweenInfo = TweenInfo.new(2, Enum.EasingStyle.Quad, Enum.EasingDirection.Out)
    TweenService:Create(bb, tweenInfo, { StudsOffset = bb.StudsOffset + Vector3.new(0, 4, 0) }):Play()
    TweenService:Create(label, tweenInfo, { TextTransparency = 1, TextStrokeTransparency = 1 }):Play()

    -- Scale bounce
    label.TextScaled = false
    label.TextSize = 10
    TweenService:Create(label, TweenInfo.new(0.3, Enum.EasingStyle.Back, Enum.EasingDirection.Out), { TextSize = 32 }):Play()
    task.delay(0.3, function() label.TextScaled = true end)

    task.delay(2.1, function() bb:Destroy() end)
end

-- ══════════════════════════════════════════════
-- ██ WORLD-POSITION FLOATING TEXT (at zone, not head)
-- ══════════════════════════════════════════════

local function showWorldFloatingText(worldPos, text, color)
    local anchor = Instance.new("Part")
    anchor.Size = Vector3.new(1, 1, 1)
    anchor.Transparency = 1
    anchor.Anchored = true
    anchor.CanCollide = false
    anchor.Position = worldPos + Vector3.new(math.random(-3, 3), 2, math.random(-3, 3))
    anchor.Parent = workspace

    local bb = Instance.new("BillboardGui")
    bb.Size = UDim2.new(0, 120, 0, 45)
    bb.AlwaysOnTop = true
    bb.Parent = anchor

    local label = Instance.new("TextLabel")
    label.Size = UDim2.new(1, 0, 1, 0)
    label.BackgroundTransparency = 1
    label.Text = text
    label.TextColor3 = color or Color3.fromRGB(255, 220, 50)
    label.TextStrokeColor3 = Color3.new(0, 0, 0)
    label.TextStrokeTransparency = 0.3
    label.Font = Enum.Font.GothamBold
    label.TextScaled = true
    label.Parent = bb

    -- Pop in
    label.TextScaled = false
    label.TextSize = 10
    TweenService:Create(label, TweenInfo.new(0.15, Enum.EasingStyle.Back, Enum.EasingDirection.Out), { TextSize = 30 }):Play()
    task.delay(0.15, function() label.TextScaled = true end)

    -- Float up + fade
    local ti = TweenInfo.new(1.4, Enum.EasingStyle.Quad, Enum.EasingDirection.Out)
    TweenService:Create(anchor, ti, { Position = anchor.Position + Vector3.new(0, 6, 0) }):Play()
    TweenService:Create(label, ti, { TextTransparency = 1, TextStrokeTransparency = 1 }):Play()
    task.delay(1.5, function() anchor:Destroy() end)
end

-- ══════════════════════════════════════════════
-- ██ SELL ZONE FLASH FX
-- ══════════════════════════════════════════════

local function flashSellZone(gained)
    local content = workspace:FindFirstChild("GeneratedContent")
    if not content then return end
    local sellPart = nil
    for _, obj in content:GetDescendants() do
        if obj.Name == "SellZone" and obj:IsA("BasePart") then sellPart = obj; break end
    end
    if not sellPart then return end

    local origColor = sellPart.Color
    local origMat = sellPart.Material
    sellPart.Color = Color3.fromRGB(80, 255, 80)
    sellPart.Material = Enum.Material.Neon
    showWorldFloatingText(sellPart.Position, "+" .. tostring(math.floor(gained)) .. " 💰", Color3.fromRGB(255, 220, 50))
    task.delay(0.2, function()
        TweenService:Create(sellPart, TweenInfo.new(0.4, Enum.EasingStyle.Quad), {
            Color = origColor
        }):Play()
        task.delay(0.4, function() sellPart.Material = origMat end)
    end)
end

-- ══════════════════════════════════════════════
-- ██ UPGRADE / REBIRTH SCREEN EFFECTS
-- ══════════════════════════════════════════════

local function screenFlash(color, duration)
    local flash = Instance.new("Frame")
    flash.Size = UDim2.new(1, 0, 1, 0)
    flash.BackgroundColor3 = color or Color3.new(1, 1, 1)
    flash.BackgroundTransparency = 0.5
    flash.ZIndex = 99
    flash.BorderSizePixel = 0
    flash.Parent = hud
    TweenService:Create(flash, TweenInfo.new(duration or 0.4, Enum.EasingStyle.Quad, Enum.EasingDirection.In), {
        BackgroundTransparency = 1
    }):Play()
    task.delay((duration or 0.4) + 0.1, function() flash:Destroy() end)
end

local function rebirthScreenShake()
    local cam = workspace.CurrentCamera
    if not cam then return end
    screenFlash(Color3.fromRGB(255, 200, 50), 0.6)
    -- Shake camera
    task.spawn(function()
        local orig = cam.CFrame
        for _ = 1, 10 do
            local shakeOffset = CFrame.new(
                math.random(-10, 10) / 20,
                math.random(-10, 10) / 20,
                0
            )
            cam.CFrame = orig * shakeOffset
            task.wait(0.04)
        end
        cam.CFrame = orig
    end)
end

-- ══════════════════════════════════════════════
-- ██ COMBO SYSTEM
-- ══════════════════════════════════════════════

local comboCount = 0
local comboTimer = 0
local comboLabel = nil
local COMBO_TIMEOUT = 2.5
local COMBO_MAX = 5

local function getComboFrame()
    if comboLabel and comboLabel.Parent then return comboLabel end
    local frame = Instance.new("Frame")
    frame.Size = UDim2.new(0, 140, 0, 50)
    frame.Position = UDim2.new(0.5, -70, 0.35, 0)
    frame.BackgroundColor3 = BG_COLOR
    frame.BackgroundTransparency = 0.4
    frame.ZIndex = 50
    frame.BorderSizePixel = 0
    frame.Parent = hud
    addCorner(frame, 12)

    local stroke = Instance.new("UIStroke")
    stroke.Color = ACCENT
    stroke.Thickness = 2
    stroke.Transparency = 0.3
    stroke.Parent = frame

    local lbl = Instance.new("TextLabel")
    lbl.Size = UDim2.new(1, -8, 1, -4)
    lbl.Position = UDim2.new(0, 4, 0, 2)
    lbl.BackgroundTransparency = 1
    lbl.Text = "COMBO x1"
    lbl.TextColor3 = ACCENT
    lbl.TextStrokeTransparency = 0.5
    lbl.Font = Enum.Font.GothamBold
    lbl.TextScaled = true
    lbl.Name = "ComboText"
    lbl.Parent = frame

    comboLabel = frame
    return frame
end

local function updateCombo()
    local now = tick()
    if now - comboTimer < COMBO_TIMEOUT then
        comboCount = math.min(comboCount + 1, COMBO_MAX)
    else
        comboCount = 1
    end
    comboTimer = now

    if comboCount >= 2 then
        local frame = getComboFrame()
        local txt = frame:FindFirstChild("ComboText")
        if txt then
            txt.Text = "COMBO x" .. comboCount
            -- Pulse effect
            txt.TextScaled = false
            txt.TextSize = 16
            TweenService:Create(txt, TweenInfo.new(0.15, Enum.EasingStyle.Back, Enum.EasingDirection.Out), { TextSize = 30 }):Play()
            task.delay(0.15, function() txt.TextScaled = true end)
        end
        frame.Visible = true
    end
end

-- Combo decay check
task.spawn(function()
    while true do
        task.wait(0.5)
        if comboLabel and comboLabel.Parent and tick() - comboTimer > COMBO_TIMEOUT then
            comboCount = 0
            comboLabel.Visible = false
        end
    end
end)

-- ══════════════════════════════════════════════
-- ██ EGG HATCH ANIMATION
-- ══════════════════════════════════════════════

local function playHatchAnimation(petResult)
    local character = player.Character
    if not character then return end
    local root = character:FindFirstChild("HumanoidRootPart")
    if not root then return end

    -- Create temporary egg part in front of player
    local egg = Instance.new("Part")
    egg.Size = Vector3.new(3, 4, 3)
    egg.Shape = Enum.PartType.Ball
    egg.Material = Enum.Material.Neon
    egg.Anchored = true
    egg.CanCollide = false
    local tierColors = { Color3.fromRGB(240, 240, 240), Color3.fromRGB(255, 210, 50), Color3.fromRGB(190, 80, 255) }
    egg.Color = tierColors[petResult.eggTier] or tierColors[1]
    egg.Position = root.Position + root.CFrame.LookVector * 6 + Vector3.new(0, 2, 0)
    egg.Parent = workspace

    -- Phase 1: Lift egg up
    local liftTween = TweenService:Create(egg, TweenInfo.new(0.5, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), {
        Position = egg.Position + Vector3.new(0, 4, 0)
    })
    liftTween:Play()
    liftTween.Completed:Wait()

    -- Phase 2: Shake egg (rotation wobble)
    for i = 1, 8 do
        local angle = (i % 2 == 0) and 15 or -15
        local shakeTween = TweenService:Create(egg, TweenInfo.new(0.08, Enum.EasingStyle.Sine), {
            CFrame = CFrame.new(egg.Position) * CFrame.Angles(0, 0, math.rad(angle))
        })
        shakeTween:Play()
        shakeTween.Completed:Wait()
    end
    -- Reset rotation
    egg.CFrame = CFrame.new(egg.Position)

    -- Phase 3: Flash overlay
    local flash = Instance.new("Frame")
    flash.Size = UDim2.new(1, 0, 1, 0)
    flash.BackgroundColor3 = Color3.new(1, 1, 1)
    flash.BackgroundTransparency = 1
    flash.ZIndex = 100
    flash.Parent = hud
    TweenService:Create(flash, TweenInfo.new(0.15, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), {
        BackgroundTransparency = 0
    }):Play()
    task.wait(0.15)

    -- Phase 4: Replace egg with pet reveal
    egg:Destroy()
    TweenService:Create(flash, TweenInfo.new(0.4, Enum.EasingStyle.Quad, Enum.EasingDirection.In), {
        BackgroundTransparency = 1
    }):Play()
    task.delay(0.5, function() flash:Destroy() end)

    -- Phase 5: Show pet name + rarity + variant popup
    local displayName = petResult.name
    local variant = petResult.variant
    if variant == "golden" then
        displayName = "⭐ GOLDEN " .. displayName
        screenFlash(Color3.fromRGB(255, 215, 80), 0.3)
    elseif variant == "rainbow" then
        displayName = "🌈 RAINBOW " .. displayName
        screenFlash(Color3.fromRGB(255, 100, 200), 0.4)
    end
    popupHatch(displayName, petResult.rarity)
end

HatchResultRemote.OnClientEvent:Connect(function(petResult)
    if type(petResult) == "table" then
        -- Multi-hatch: array of results
        if petResult[1] and type(petResult[1]) == "table" then
            for idx, singleResult in petResult do
                task.delay((idx - 1) * 0.4, function()
                    playHatchAnimation(singleResult)
                end)
            end
        else
            task.spawn(playHatchAnimation, petResult)
        end
    end
end)

-- ── Fuse Result ──
FuseResultRemote.OnClientEvent:Connect(function(fusedPet)
    if type(fusedPet) == "table" then
        screenFlash(Color3.fromRGB(180, 60, 255), 0.5)
        local variantPrefix = ""
        if fusedPet.variant == "golden" then variantPrefix = "GOLDEN " end
        if fusedPet.variant == "rainbow" then variantPrefix = "RAINBOW " end
        popupNumber(player, variantPrefix .. fusedPet.name .. " (" .. fusedPet.rarity .. ")", Color3.fromRGB(200, 100, 255))
        renderPets()
    end
end)

-- ── Rebirth Milestone ──
RebirthMilestoneRemote.OnClientEvent:Connect(function(info)
    if type(info) ~= "table" then return end
    screenFlash(Color3.fromRGB(255, 215, 80), 0.6)
    rebirthScreenShake()
    local msg = "REBIRTH " .. (info.rebirthCount or "?") .. "!"
    if info.unlocks then msg = msg .. " Unlocked: " .. info.unlocks end
    popupNumber(player, msg, Color3.fromRGB(255, 215, 80))
end)

-- ── Quest Data ──
local questData = {}
QuestDataRemote.OnClientEvent:Connect(function(quests)
    if type(quests) == "table" then
        questData = quests
        updateQuestUI()
    end
end)

-- ══════════════════════════════════════════════
-- ██ PET INVENTORY UI
-- ══════════════════════════════════════════════

local inventoryOpen = false
local inventoryPanel = nil

local function toggleInventory()
    if inventoryOpen and inventoryPanel then
        inventoryPanel:Destroy()
        inventoryPanel = nil
        inventoryOpen = false
        return
    end

    inventoryOpen = true
    inventoryPanel = glassFrame(hud, UDim2.new(0, 320, 0, 400), UDim2.new(0.5, -160, 0.5, -200), "InventoryPanel")

    -- Title
    local title = Instance.new("TextLabel")
    title.Size = UDim2.new(1, 0, 0, 36)
    title.BackgroundTransparency = 1
    title.Text = "PET INVENTORY"
    title.TextColor3 = ACCENT
    title.TextScaled = true
    title.Font = Enum.Font.GothamBold
    title.Parent = inventoryPanel

    -- Close button
    local closeBtn = Instance.new("TextButton")
    closeBtn.Size = UDim2.new(0, 30, 0, 30)
    closeBtn.Position = UDim2.new(1, -35, 0, 3)
    closeBtn.BackgroundColor3 = Color3.fromRGB(200, 50, 50)
    closeBtn.Text = "X"
    closeBtn.TextColor3 = TEXT_COLOR
    closeBtn.TextScaled = true
    closeBtn.Font = Enum.Font.GothamBold
    closeBtn.Parent = inventoryPanel
    addCorner(closeBtn, 6)
    closeBtn.MouseButton1Click:Connect(toggleInventory)

    -- Scroll frame for pets
    local scroll = Instance.new("ScrollingFrame")
    scroll.Size = UDim2.new(1, -16, 1, -44)
    scroll.Position = UDim2.new(0, 8, 0, 40)
    scroll.BackgroundTransparency = 1
    scroll.ScrollBarThickness = 4
    scroll.ScrollBarImageColor3 = ACCENT
    scroll.CanvasSize = UDim2.new(0, 0, 0, 0)
    scroll.Parent = inventoryPanel

    local layout = Instance.new("UIListLayout")
    layout.SortOrder = Enum.SortOrder.LayoutOrder
    layout.Padding = UDim.new(0, 4)
    layout.Parent = scroll

    if not localData.pets then return end

    for idx, pet in localData.pets do
        local isEquipped = false
        if localData.equippedPets then
            for _, eIdx in localData.equippedPets do
                if eIdx == idx then isEquipped = true; break end
            end
        end

        local row = Instance.new("Frame")
        row.Size = UDim2.new(1, -4, 0, 44)
        row.BackgroundColor3 = GLASS_BG
        row.BackgroundTransparency = 0.5
        row.BorderSizePixel = 0
        row.Parent = scroll
        addCorner(row, 8)

        -- Rarity dot
        local dot = Instance.new("Frame")
        dot.Size = UDim2.new(0, 12, 0, 12)
        dot.Position = UDim2.new(0, 8, 0.5, -6)
        dot.BackgroundColor3 = RARITY_COLORS[pet.rarity] or Color3.new(1,1,1)
        dot.BorderSizePixel = 0
        dot.Parent = row
        addCorner(dot, 6)

        -- Pet name
        local nameL = Instance.new("TextLabel")
        nameL.Size = UDim2.new(0, 130, 1, 0)
        nameL.Position = UDim2.new(0, 26, 0, 0)
        nameL.BackgroundTransparency = 1
        nameL.Text = pet.name
        nameL.TextColor3 = RARITY_COLORS[pet.rarity] or TEXT_COLOR
        nameL.TextScaled = true
        nameL.Font = Enum.Font.GothamMedium
        nameL.TextXAlignment = Enum.TextXAlignment.Left
        nameL.Parent = row

        -- Power bonus
        local pwrL = Instance.new("TextLabel")
        pwrL.Size = UDim2.new(0, 50, 1, 0)
        pwrL.Position = UDim2.new(0, 160, 0, 0)
        pwrL.BackgroundTransparency = 1
        pwrL.Text = "+" .. pet.powerBonus
        pwrL.TextColor3 = Color3.fromRGB(100, 200, 255)
        pwrL.TextScaled = true
        pwrL.Font = Enum.Font.GothamMedium
        pwrL.Parent = row

        -- Equip/Unequip button
        local btn = Instance.new("TextButton")
        btn.Size = UDim2.new(0, 70, 0, 28)
        btn.Position = UDim2.new(1, -78, 0.5, -14)
        btn.BackgroundColor3 = isEquipped and Color3.fromRGB(200, 60, 60) or Color3.fromRGB(60, 180, 80)
        btn.Text = isEquipped and "Unequip" or "Equip"
        btn.TextColor3 = TEXT_COLOR
        btn.TextScaled = true
        btn.Font = Enum.Font.GothamBold
        btn.Parent = row
        addCorner(btn, 6)

        local capturedIdx = idx
        local capturedEquipped = isEquipped
        btn.MouseButton1Click:Connect(function()
            if capturedEquipped then
                UnequipPetRemote:FireServer(capturedIdx)
            else
                EquipPetRemote:FireServer(capturedIdx)
            end
            -- Close and reopen to refresh
            task.delay(0.2, function()
                if inventoryOpen then
                    toggleInventory()
                    toggleInventory()
                end
            end)
        end)
    end

    -- Update canvas size
    scroll.CanvasSize = UDim2.new(0, 0, 0, layout.AbsoluteContentSize.Y + 10)

    -- Slide in animation
    inventoryPanel.Position = UDim2.new(0.5, -160, 1.2, 0)
    TweenService:Create(inventoryPanel, TweenInfo.new(0.4, Enum.EasingStyle.Back, Enum.EasingDirection.Out), {
        Position = UDim2.new(0.5, -160, 0.5, -200)
    }):Play()
end

-- Inventory button on HUD
local invBtn = Instance.new("TextButton")
invBtn.Name = "InventoryBtn"
invBtn.Size = UDim2.new(0, 100, 0, 36)
invBtn.Position = UDim2.new(0, 155, 1, -46)
invBtn.BackgroundColor3 = GLASS_BG
invBtn.BackgroundTransparency = 0.35
invBtn.Text = "Inventory"
invBtn.TextColor3 = ACCENT
invBtn.TextScaled = true
invBtn.Font = Enum.Font.GothamBold
invBtn.Parent = hud
addCorner(invBtn, 12)
addStroke(invBtn, ACCENT, 1.5)
invBtn.MouseButton1Click:Connect(toggleInventory)

-- ══════════════════════════════════════════════
-- ██ UPGRADE COST DISPLAY
-- ══════════════════════════════════════════════

local function updateUpgradeBillboards()
    local content = workspace:FindFirstChild("GeneratedContent")
    if not content then return end
    for _, obj in content:GetDescendants() do
        if not obj:IsA("BasePart") then continue end
        local bb = obj:FindFirstChild("Label")
        if not bb or not bb:IsA("BillboardGui") then continue end
        local textLabel = bb:FindFirstChild("Text")
        if not textLabel then continue end

        if obj.Name:match("PowerUp") then
            local cost = CONFIG.powerUpgradeCost(localData.powerLevel or 0)
            textLabel.Text = "POWER UP\\n" .. tostring(math.floor(cost)) .. " Coins"
        elseif obj.Name:match("BagUpgrade") then
            local cost = CONFIG.bagUpgradeCost(localData.bagLevel or 0)
            textLabel.Text = "BAG SIZE UP\\n" .. tostring(math.floor(cost)) .. " Coins"
        end
    end
end

-- ══════════════════════════════════════════════
-- ██ HUD UPDATE
-- ══════════════════════════════════════════════

local prevPetCount = 0
local prevBag = 0

local function updateHUD()
    -- Currency with commas
    local function formatNum(n)
        local s = tostring(math.floor(n))
        local formatted = s:reverse():gsub("(%d%d%d)", "%1,"):reverse():gsub("^,", "")
        return formatted
    end

    currencyLabel.Text = formatNum(localData.currency)
    powerLabel.Text = "⚡ " .. formatNum(localData.power * localData.rebirthMultiplier + localData.petBonusPower)
    rebirthLabel.Text = "🔄 " .. localData.rebirthCount
    bagLabel.Text = math.floor(localData.bag) .. "/" .. localData.bagMax
    gpBadge.Visible = localData.hasGamePass == true

    -- Bag fill bar animation
    local fillPct = math.clamp(localData.bag / math.max(localData.bagMax, 1), 0, 1)
    TweenService:Create(bagFill, TweenInfo.new(0.3, Enum.EasingStyle.Quad), {
        Size = UDim2.new(fillPct, 0, 1, -4)
    }):Play()

    -- Pet count
    local equipped = localData.equippedPets and #localData.equippedPets or 0
    local total = localData.pets and #localData.pets or 0
    petLabel.Text = "🐾 " .. equipped .. "/" .. CONFIG.MAX_EQUIPPED_PETS .. " (" .. total .. " total)"

    -- Currency gain popup (sell)
    if localData.currency > prevCurrency and prevCurrency > 0 then
        local gained = localData.currency - prevCurrency
        popupSell(gained)
        flashSellZone(gained)
    end

    -- Collect popup + combo
    if localData.bag > prevBag and prevBag >= 0 then
        popupCollect()
        updateCombo()
    end

    -- Pet count change (animation handled by HatchResultRemote)
    prevCurrency = localData.currency
    prevBag = localData.bag
    prevPetCount = localData.pets and #localData.pets or 0
end

-- ══════════════════════════════════════════════
-- ██ DATA SYNC
-- ══════════════════════════════════════════════

DataSyncRemote.OnClientEvent:Connect(function(data)
    if type(data) ~= "table" then return end
    localData = data
    updateHUD()
    updateUpgradeBillboards()
end)

-- ══════════════════════════════════════════════
-- ██ CLICK INTERACTION
-- ══════════════════════════════════════════════

local function setupClickDetectors()
    local content = workspace:FindFirstChild("GeneratedContent")
    if not content then return end

    for _, obj in content:GetDescendants() do
        if not obj:IsA("BasePart") then continue end

        if obj.Name:match("CollectZone") then
            local cd = Instance.new("ClickDetector")
            cd.MaxActivationDistance = 15
            cd.Parent = obj
            cd.MouseClick:Connect(function()
                local now = tick()
                if now - lastCollectTime < CONFIG.COLLECT_COOLDOWN then return end
                lastCollectTime = now
                CollectRemote:FireServer(obj.Name)
                -- World floating text at zone position
                local gain = comboCount >= 2 and comboCount or 1
                local color = comboCount >= 3 and Color3.fromRGB(255, 180, 50) or Color3.fromRGB(100, 220, 255)
                showWorldFloatingText(obj.Position, "+" .. gain, color)
            end)
        end

        if obj.Name:match("Sell") and not obj.Name:match("Collect") then
            obj.Touched:Connect(function(hit)
                if hit.Parent ~= player.Character then return end
                local now = tick()
                if now - lastSellTime < 1 then return end
                lastSellTime = now
                SellRemote:FireServer()
            end)
        end

        if obj.Name:match("PowerUp") then
            local cd = Instance.new("ClickDetector")
            cd.MaxActivationDistance = 12
            cd.Parent = obj
            cd.MouseClick:Connect(function()
                local prevPower = localData.powerLevel or 0
                BuyUpgradeRemote:FireServer("power")
                task.delay(0.2, function()
                    if localData.powerLevel > prevPower then
                        screenFlash(Color3.fromRGB(255, 100, 100), 0.3)
                        showWorldFloatingText(obj.Position, "POWER UP!", Color3.fromRGB(255, 120, 80))
                    end
                end)
            end)
        end

        if obj.Name:match("BagUpgrade") then
            local cd = Instance.new("ClickDetector")
            cd.MaxActivationDistance = 12
            cd.Parent = obj
            cd.MouseClick:Connect(function()
                local prevBagLvl = localData.bagLevel or 0
                BuyUpgradeRemote:FireServer("bag")
                task.delay(0.2, function()
                    if localData.bagLevel > prevBagLvl then
                        screenFlash(Color3.fromRGB(80, 130, 255), 0.3)
                        showWorldFloatingText(obj.Position, "BAG UP!", Color3.fromRGB(100, 160, 255))
                    end
                end)
            end)
        end

        if obj.Name:match("^EggZone_") then
            local eggNum = tonumber(obj.Name:match("%d+")) or 1
            local cd = Instance.new("ClickDetector")
            cd.MaxActivationDistance = 12
            cd.Parent = obj
            cd.MouseClick:Connect(function()
                HatchEggRemote:FireServer(eggNum)
            end)
        end

        if obj.Name == "AutoCollect" then
            local cd = Instance.new("ClickDetector")
            cd.MaxActivationDistance = 12
            cd.Parent = obj
            cd.MouseClick:Connect(function()
                if localData.hasAutoCollect then return end
                BuyUpgradeRemote:FireServer("autoCollect")
                task.delay(0.2, function()
                    if localData.hasAutoCollect then
                        screenFlash(Color3.fromRGB(80, 200, 100), 0.3)
                        showWorldFloatingText(obj.Position, "AUTO COLLECT!", Color3.fromRGB(100, 230, 120))
                    end
                end)
            end)
        end

        if obj.Name == "SpeedBoost" then
            local cd = Instance.new("ClickDetector")
            cd.MaxActivationDistance = 12
            cd.Parent = obj
            cd.MouseClick:Connect(function()
                BuyUpgradeRemote:FireServer("speedBoost")
                task.delay(0.2, function()
                    if localData.hasSpeedBoost then
                        screenFlash(Color3.fromRGB(220, 180, 50), 0.3)
                        showWorldFloatingText(obj.Position, "SPEED!", Color3.fromRGB(255, 200, 60))
                    end
                end)
            end)
        end

        if obj.Name:match("Rebirth") and obj.Name:match("Button") then
            local cd = Instance.new("ClickDetector")
            cd.MaxActivationDistance = 12
            cd.Parent = obj
            cd.MouseClick:Connect(function()
                local prevRebirth = localData.rebirthCount or 0
                RebirthRemote:FireServer()
                task.delay(0.3, function()
                    if localData.rebirthCount > prevRebirth then
                        rebirthScreenShake()
                    end
                end)
            end)
        end

        -- Multi-Hatch x3
        if obj.Name:match("^MultiHatch_3_") then
            local eggNum = tonumber(obj.Name:match("MultiHatch_3_(%d+)")) or 1
            local cd = Instance.new("ClickDetector")
            cd.MaxActivationDistance = 12
            cd.Parent = obj
            cd.MouseClick:Connect(function()
                MultiHatchRemote:FireServer(eggNum, 3)
                screenFlash(Color3.fromRGB(200, 255, 100), 0.2)
            end)
        end

        -- Multi-Hatch x5
        if obj.Name:match("^MultiHatch_5_") then
            local eggNum = tonumber(obj.Name:match("MultiHatch_5_(%d+)")) or 1
            local cd = Instance.new("ClickDetector")
            cd.MaxActivationDistance = 12
            cd.Parent = obj
            cd.MouseClick:Connect(function()
                MultiHatchRemote:FireServer(eggNum, 5)
                screenFlash(Color3.fromRGB(255, 150, 255), 0.2)
            end)
        end

        -- Fuse Station
        if obj.Name == "FuseStation" then
            local cd = Instance.new("ClickDetector")
            cd.MaxActivationDistance = 12
            cd.Parent = obj
            cd.MouseClick:Connect(function()
                toggleFuseUI()
            end)
        end

        -- Luck Upgrade
        if obj.Name == "LuckUpgrade" then
            local cd = Instance.new("ClickDetector")
            cd.MaxActivationDistance = 12
            cd.Parent = obj
            cd.MouseClick:Connect(function()
                local prevLuck = localData.luckLevel or 0
                BuyUpgradeRemote:FireServer("luck")
                task.delay(0.2, function()
                    if (localData.luckLevel or 0) > prevLuck then
                        screenFlash(Color3.fromRGB(100, 255, 200), 0.3)
                        showWorldFloatingText(obj.Position, "LUCK UP!", Color3.fromRGB(80, 255, 180))
                    end
                end)
            end)
        end
    end
end

-- ══════════════════════════════════════════════
-- ██ PET RENDERING (Client-Side)
-- ══════════════════════════════════════════════

local RARITY_COLORS = {
    Common = Color3.fromRGB(150, 150, 150),
    Uncommon = Color3.fromRGB(80, 230, 80),
    Rare = Color3.fromRGB(80, 130, 255),
    Legendary = Color3.fromRGB(255, 190, 50),
    Mythic = Color3.fromRGB(230, 80, 255),
}

local function clearPets()
    for _, part in petParts do
        if part and part.Parent then part:Destroy() end
    end
    petParts = {}
end

-- Species detection from pet name
local SPECIES_KEYWORDS = {
    cat = {"cat", "kitten", "feline", "kitty", "tabby", "calico", "siamese", "panther", "leopard", "cheetah", "lynx", "jaguar"},
    dog = {"dog", "puppy", "pup", "hound", "retriever", "shepherd", "corgi", "terrier", "bulldog", "husky", "collie", "beagle", "spaniel", "mastiff"},
    dragon = {"dragon", "drake", "wyrm", "wyvern", "serpent", "hydra", "dino", "dinosaur", "rex"},
    bunny = {"bunny", "rabbit", "hare", "cottontail"},
    fox = {"fox", "vixen", "fennec", "kitsune", "raccoon"},
    bird = {"bird", "phoenix", "eagle", "hawk", "owl", "parrot", "falcon", "raven", "crow", "robin", "penguin", "duck", "dove"},
    bear = {"bear", "panda", "grizzly", "polar", "teddy", "koala"},
    wolf = {"wolf", "wolves", "coyote", "dire"},
    unicorn = {"unicorn", "pony", "horse", "stallion", "mare", "pegasus", "alicorn", "deer", "stag", "moose", "elk"},
    turtle = {"turtle", "tortoise", "frog", "toad", "lizard", "gecko", "chameleon", "iguana", "croc", "alligator"},
    fish = {"fish", "shark", "whale", "dolphin", "jellyfish", "octopus", "squid", "crab", "lobster", "seahorse"},
}

local function detectSpecies(petName)
    local lower = string.lower(petName)
    for species, keywords in SPECIES_KEYWORDS do
        for _, kw in keywords do
            if lower:find(kw) then return species end
        end
    end
    return "cat"
end

-- Species-specific body shapes
local SPECIES_SHAPES = {
    cat =     { bodyW=2.16, bodyH=1.68, bodyD=2.88, headS=1.92, earW=0.48, earH=0.96, earD=0.3, earAngle=25,  earShape="triangle", tailLen=2.4, tailThick=0.36, hasWings=false, bodyType="Ball", bodyMat="Fabric", hasLegs=true },
    dog =     { bodyW=2.4,  bodyH=1.92, bodyD=3.12, headS=2.16, earW=0.6,  earH=1.08, earD=0.24, earAngle=-20, earShape="floppy",   tailLen=0.96, tailThick=0.48, hasWings=false, bodyType="Ball", bodyMat="Fabric", hasLegs=true },
    dragon =  { bodyW=2.64, bodyH=2.16, bodyD=3.6,  headS=2.04, earW=0.36, earH=1.2,  earD=0.36, earAngle=35,  earShape="horn",     tailLen=3.36, tailThick=0.42, hasWings=true, bodyType="Block", bodyMat="Granite", hasLegs=true },
    bunny =   { bodyW=1.92, bodyH=1.68, bodyD=2.4,  headS=2.04, earW=0.36, earH=2.16, earD=0.24, earAngle=5,   earShape="long",     tailLen=0.36, tailThick=0.6, hasWings=false, bodyType="Ball", bodyMat="Fabric", hasLegs=true },
    fox =     { bodyW=2.04, bodyH=1.56, bodyD=3.0,  headS=1.8,  earW=0.54, earH=1.08, earD=0.3, earAngle=30,  earShape="triangle", tailLen=2.88, tailThick=0.6, hasWings=false, bodyType="Ball", bodyMat="Fabric", hasLegs=true },
    bird =    { bodyW=1.68, bodyH=1.44, bodyD=2.16, headS=1.68, earW=0,    earH=0,    earD=0,   earAngle=0,   earShape="none",     tailLen=1.44, tailThick=0.36, hasWings=true, bodyType="Ball", bodyMat="SmoothPlastic", hasLegs=false },
    bear =    { bodyW=2.88, bodyH=2.4,  bodyD=3.36, headS=2.4,  earW=0.6,  earH=0.6,  earD=0.36, earAngle=0,   earShape="round",    tailLen=0.36, tailThick=0.48, hasWings=false, bodyType="Ball", bodyMat="Fabric", hasLegs=true },
    wolf =    { bodyW=2.4,  bodyH=1.8,  bodyD=3.36, headS=2.04, earW=0.48, earH=1.08, earD=0.3, earAngle=28,  earShape="triangle", tailLen=2.4, tailThick=0.48, hasWings=false, bodyType="Block", bodyMat="SmoothPlastic", hasLegs=true },
    unicorn = { bodyW=2.4,  bodyH=2.16, bodyD=3.84, headS=1.92, earW=0.42, earH=0.84, earD=0.24, earAngle=20,  earShape="triangle", tailLen=3.0, tailThick=0.36, hasWings=false, bodyType="Block", bodyMat="SmoothPlastic", hasLegs=true },
    turtle =  { bodyW=2.88, bodyH=1.2,  bodyD=2.88, headS=1.44, earW=0,    earH=0,    earD=0,   earAngle=0,   earShape="none",     tailLen=0.6, tailThick=0.24, hasWings=false, bodyType="Block", bodyMat="Granite", hasLegs=true },
    fish =    { bodyW=1.92, bodyH=1.68, bodyD=3.36, headS=1.8,  earW=0.72, earH=0.96, earD=0.12, earAngle=40,  earShape="fin",      tailLen=1.68, tailThick=0.72, hasWings=false, bodyType="Ball", bodyMat="Glass", hasLegs=false },
}

local function spawnPetPart(petInfo, index)
    local character = player.Character
    if not character then return nil end
    local root = character:FindFirstChild("HumanoidRootPart")
    if not root then return nil end

    local petColor = RARITY_COLORS[petInfo.rarity] or Color3.new(1, 1, 1)
    local species = detectSpecies(petInfo.name)
    local shape = SPECIES_SHAPES[species] or SPECIES_SHAPES.cat

    local model = Instance.new("Model")
    model.Name = "ClientPet_" .. index

    local function makePart(name, size, shapeType, material, color)
        local p = Instance.new("Part")
        p.Size = size
        p.Shape = shapeType
        p.Material = material
        p.Anchored = true
        p.CanCollide = false
        p.Color = color
        p.Name = name
        p.Parent = model
        return p
    end

    -- Body (species-specific shape and material)
    local bodyPartType = Enum.PartType[shape.bodyType or "Block"]
    local bodyMaterial = Enum.Material[shape.bodyMat or "SmoothPlastic"]
    local body = makePart("Body", Vector3.new(shape.bodyW, shape.bodyH, shape.bodyD), bodyPartType, bodyMaterial, petColor)

    -- Head
    local head = makePart("Head", Vector3.new(shape.headS, shape.headS, shape.headS), Enum.PartType.Ball, bodyMaterial, petColor)

    -- Eyes (white sclera + dark pupil)
    local pupilColor = Color3.new(0.08, 0.08, 0.08)
    local scleraScale = 1.0
    if species == "dragon" then pupilColor = Color3.fromRGB(255, 180, 30) end
    if species == "fish" then scleraScale = 1.3 end
    local scleraSize = Vector3.new(0.4 * scleraScale, 0.45 * scleraScale, 0.2)
    local pupilSize = Vector3.new(0.2 * scleraScale, 0.22 * scleraScale, 0.12)
    local scleraL = makePart("ScleraL", scleraSize, Enum.PartType.Ball, Enum.Material.SmoothPlastic, Color3.new(0.95, 0.95, 0.95))
    local scleraR = scleraL:Clone(); scleraR.Name = "ScleraR"; scleraR.Parent = model
    local eyeL = makePart("EyeL", pupilSize, Enum.PartType.Ball, Enum.Material.Neon, pupilColor)
    local eyeR = eyeL:Clone(); eyeR.Name = "EyeR"; eyeR.Parent = model

    -- Ears (species-dependent)
    if shape.earShape ~= "none" then
        local earMat = Enum.Material.SmoothPlastic
        local earColor = petColor
        if shape.earShape == "horn" then earMat = Enum.Material.Neon; earColor = Color3.new(math.min(petColor.R + 0.2, 1), petColor.G, petColor.B) end

        local earL = makePart("EarL", Vector3.new(shape.earW, shape.earH, shape.earD), Enum.PartType.Block, earMat, earColor)
        local earR = earL:Clone(); earR.Name = "EarR"; earR.Parent = model
    end

    -- Wings (dragon, bird)
    if shape.hasWings then
        local wingColor = Color3.new(math.min(petColor.R + 0.1, 1), math.min(petColor.G + 0.1, 1), math.min(petColor.B + 0.15, 1))
        local wingL = makePart("WingL", Vector3.new(0.15, 1.2, 1.8), Enum.PartType.Block, Enum.Material.SmoothPlastic, wingColor)
        local wingR = wingL:Clone(); wingR.Name = "WingR"; wingR.Parent = model
    end

    -- Tail
    local tail = makePart("Tail", Vector3.new(shape.tailThick, shape.tailThick, shape.tailLen), Enum.PartType.Cylinder, Enum.Material.SmoothPlastic, petColor)

    -- Horn for unicorn
    if species == "unicorn" then
        makePart("Horn", Vector3.new(0.2, 1.2, 0.2), Enum.PartType.Block, Enum.Material.Neon, Color3.fromRGB(255, 220, 100))
    end

    -- Shell for turtle
    if species == "turtle" then
        makePart("Shell", Vector3.new(shape.bodyW + 0.4, shape.bodyH + 0.5, shape.bodyD + 0.2), Enum.PartType.Ball, Enum.Material.Granite, Color3.new(math.max(petColor.R - 0.15, 0), math.max(petColor.G - 0.1, 0), math.max(petColor.B - 0.05, 0)))
    end

    -- Nose/Snout for dog, bear, wolf
    if species == "dog" or species == "bear" or species == "wolf" then
        makePart("Nose", Vector3.new(0.4, 0.35, 0.3), Enum.PartType.Ball, Enum.Material.SmoothPlastic, Color3.new(0.15, 0.1, 0.1))
    end

    -- Beak for bird
    if species == "bird" then
        makePart("Beak", Vector3.new(0.25, 0.2, 0.5), Enum.PartType.Block, Enum.Material.SmoothPlastic, Color3.fromRGB(255, 180, 50))
    end

    -- Legs (4 short cylinders under body)
    if shape.hasLegs ~= false then
        local legH = shape.bodyH * 0.7
        local legW = math.max(shape.bodyW * 0.18, 0.3)
        local legColor = Color3.new(math.max(petColor.R - 0.06, 0), math.max(petColor.G - 0.06, 0), math.max(petColor.B - 0.06, 0))
        makePart("LegFL", Vector3.new(legW, legH, legW), Enum.PartType.Cylinder, bodyMaterial, legColor)
        makePart("LegFR", Vector3.new(legW, legH, legW), Enum.PartType.Cylinder, bodyMaterial, legColor)
        makePart("LegBL", Vector3.new(legW, legH, legW), Enum.PartType.Cylinder, bodyMaterial, legColor)
        makePart("LegBR", Vector3.new(legW, legH, legW), Enum.PartType.Cylinder, bodyMaterial, legColor)
    end

    -- Whiskers for cats
    if species == "cat" then
        local wColor = Color3.new(0.85, 0.85, 0.85)
        makePart("WhiskerL1", Vector3.new(0.04, 0.04, 0.7), Enum.PartType.Block, Enum.Material.Neon, wColor)
        makePart("WhiskerL2", Vector3.new(0.04, 0.04, 0.7), Enum.PartType.Block, Enum.Material.Neon, wColor)
        makePart("WhiskerR1", Vector3.new(0.04, 0.04, 0.7), Enum.PartType.Block, Enum.Material.Neon, wColor)
        makePart("WhiskerR2", Vector3.new(0.04, 0.04, 0.7), Enum.PartType.Block, Enum.Material.Neon, wColor)
    end

    model.PrimaryPart = body

    -- Variant visual effects
    local variant = petInfo.variant
    if variant == "golden" then
        -- Golden tint: shift all parts toward gold
        for _, p in model:GetChildren() do
            if p:IsA("BasePart") and p.Name ~= "EyeL" and p.Name ~= "EyeR" then
                p.Color = Color3.new(math.min(p.Color.R + 0.25, 1), math.min(p.Color.G + 0.15, 0.95), math.max(p.Color.B - 0.1, 0.05))
            end
        end
        local glow = Instance.new("PointLight")
        glow.Color = Color3.fromRGB(255, 215, 80)
        glow.Brightness = 0.8
        glow.Range = 6
        glow.Parent = body
    elseif variant == "rainbow" then
        -- Rainbow: mark for Heartbeat color cycling
        model:SetAttribute("Rainbow", true)
    end

    -- Name tag billboard on head
    local bb = Instance.new("BillboardGui")
    bb.Size = UDim2.new(0, 120, 0, 35)
    bb.StudsOffset = Vector3.new(0, 2.5, 0)
    bb.AlwaysOnTop = true
    bb.Parent = head

    local nameBg = Instance.new("Frame")
    nameBg.Size = UDim2.new(1, 0, 1, 0)
    nameBg.BackgroundColor3 = BG_COLOR
    nameBg.BackgroundTransparency = 0.4
    nameBg.BorderSizePixel = 0
    nameBg.Parent = bb

    local nameCorner = Instance.new("UICorner")
    nameCorner.CornerRadius = UDim.new(0, 8)
    nameCorner.Parent = nameBg

    local nameStroke = Instance.new("UIStroke")
    nameStroke.Color = petColor
    nameStroke.Thickness = 1.5
    nameStroke.Transparency = 0.2
    nameStroke.Parent = nameBg

    local label = Instance.new("TextLabel")
    label.Size = UDim2.new(1, -6, 1, -4)
    label.Position = UDim2.new(0, 3, 0, 2)
    label.BackgroundTransparency = 1
    local displayName = petInfo.name
    local displayColor = petColor
    if variant == "golden" then displayName = "⭐ " .. displayName; displayColor = Color3.fromRGB(255, 215, 80) end
    if variant == "rainbow" then displayName = "🌈 " .. displayName; displayColor = Color3.fromRGB(255, 100, 200) end
    label.Text = displayName
    label.TextColor3 = displayColor
    label.TextStrokeTransparency = 0.4
    label.TextScaled = true
    label.Font = Enum.Font.GothamBold
    label.Parent = nameBg

    -- Sparkle trail on body (subtle, not bright)
    local trail = Instance.new("ParticleEmitter")
    trail.Rate = 3
    trail.Lifetime = NumberRange.new(0.6, 1.2)
    trail.Speed = NumberRange.new(0, 0.3)
    trail.Size = NumberSequence.new(0.25, 0)
    trail.Color = ColorSequence.new(petColor)
    trail.LightEmission = 0.5
    trail.Parent = body

    model.Parent = workspace.GeneratedContent
    model:SetAttribute("PetIndex", index)
    model:SetAttribute("Species", species)

    return model
end

local function renderPets()
    clearPets()
    if not localData.equippedPets then return end
    for i, petIdx in localData.equippedPets do
        local petInfo = localData.pets and localData.pets[petIdx]
        if petInfo then
            local part = spawnPetPart(petInfo, i)
            if part then table.insert(petParts, part) end
        end
    end
end

DataSyncRemote.OnClientEvent:Connect(function()
    task.defer(renderPets)
end)

RunService.Heartbeat:Connect(function()
    local character = player.Character
    if not character then return end
    local root = character:FindFirstChild("HumanoidRootPart")
    if not root then return end
    local t = tick()

    for i, petModel in petParts do
        if petModel and petModel.Parent and petModel:IsA("Model") then
            local primary = petModel.PrimaryPart
            if not primary then continue end

            local species = petModel:GetAttribute("Species") or "cat"
            local shape = SPECIES_SHAPES[species] or SPECIES_SHAPES.cat

            local angle = i * 2.1 + t * 1.5
            local bobble = math.sin(t * 2.5 + i) * 0.4
            local targetPos = root.Position + Vector3.new(
                math.cos(angle) * 5.5,
                2.8 + bobble,
                math.sin(angle) * 5.5
            )
            local currentPos = primary.Position
            local newPos = currentPos:Lerp(targetPos, 0.08)

            local lookDir = (root.Position - newPos) * Vector3.new(1, 0, 1)
            if lookDir.Magnitude > 0.1 then lookDir = lookDir.Unit
            else lookDir = Vector3.new(0, 0, -1) end

            local faceCF = CFrame.lookAt(newPos, newPos + lookDir)
            local headOff = Vector3.new(0, shape.bodyH * 0.35, -shape.bodyD * 0.5)
            local headCF = faceCF * CFrame.new(headOff)

            -- Body
            primary.CFrame = faceCF

            -- Head
            local head = petModel:FindFirstChild("Head")
            if head then head.CFrame = headCF end

            -- Eyes (sclera + pupil)
            local headR = shape.headS * 0.5
            local scleraL = petModel:FindFirstChild("ScleraL")
            local scleraR = petModel:FindFirstChild("ScleraR")
            local eyeL = petModel:FindFirstChild("EyeL")
            local eyeR = petModel:FindFirstChild("EyeR")
            if scleraL then scleraL.CFrame = headCF * CFrame.new(-headR * 0.42, headR * 0.2, -headR * 0.82) end
            if scleraR then scleraR.CFrame = headCF * CFrame.new(headR * 0.42, headR * 0.2, -headR * 0.82) end
            if eyeL then eyeL.CFrame = headCF * CFrame.new(-headR * 0.42, headR * 0.2, -headR * 0.92) end
            if eyeR then eyeR.CFrame = headCF * CFrame.new(headR * 0.42, headR * 0.2, -headR * 0.92) end

            -- Ears
            local earL = petModel:FindFirstChild("EarL")
            local earR = petModel:FindFirstChild("EarR")
            if earL and earR then
                local earRad = math.rad(shape.earAngle)
                if shape.earShape == "floppy" then
                    earL.CFrame = headCF * CFrame.new(-headR * 0.6, headR * 0.3, 0) * CFrame.Angles(0, 0, earRad)
                    earR.CFrame = headCF * CFrame.new(headR * 0.6, headR * 0.3, 0) * CFrame.Angles(0, 0, -earRad)
                elseif shape.earShape == "long" then
                    earL.CFrame = headCF * CFrame.new(-headR * 0.35, headR + shape.earH * 0.4, 0) * CFrame.Angles(math.rad(earRad * 0.3), 0, math.rad(-5))
                    earR.CFrame = headCF * CFrame.new(headR * 0.35, headR + shape.earH * 0.4, 0) * CFrame.Angles(math.rad(earRad * 0.3), 0, math.rad(5))
                elseif shape.earShape == "round" then
                    earL.CFrame = headCF * CFrame.new(-headR * 0.6, headR * 0.8, 0)
                    earR.CFrame = headCF * CFrame.new(headR * 0.6, headR * 0.8, 0)
                elseif shape.earShape == "fin" then
                    earL.CFrame = headCF * CFrame.new(-headR * 0.7, headR * 0.1, 0) * CFrame.Angles(0, 0, math.rad(40))
                    earR.CFrame = headCF * CFrame.new(headR * 0.7, headR * 0.1, 0) * CFrame.Angles(0, 0, math.rad(-40))
                else
                    earL.CFrame = headCF * CFrame.new(-headR * 0.5, headR * 0.85, 0) * CFrame.Angles(0, 0, math.rad(-earRad))
                    earR.CFrame = headCF * CFrame.new(headR * 0.5, headR * 0.85, 0) * CFrame.Angles(0, 0, math.rad(earRad))
                end
            end

            -- Tail
            local tailP = petModel:FindFirstChild("Tail")
            if tailP then
                local tailWag = math.sin(t * 5 + i) * 0.3
                tailP.CFrame = faceCF * CFrame.new(0, shape.bodyH * 0.1, shape.bodyD * 0.5 + shape.tailLen * 0.3) * CFrame.Angles(0, tailWag, math.rad(90))
            end

            -- Wings (flap animation)
            local wingL = petModel:FindFirstChild("WingL")
            local wingR = petModel:FindFirstChild("WingR")
            if wingL and wingR then
                local flap = math.sin(t * 4 + i) * 0.4
                wingL.CFrame = faceCF * CFrame.new(-shape.bodyW * 0.55, shape.bodyH * 0.3, 0) * CFrame.Angles(0, 0, math.rad(-35) + flap)
                wingR.CFrame = faceCF * CFrame.new(shape.bodyW * 0.55, shape.bodyH * 0.3, 0) * CFrame.Angles(0, 0, math.rad(35) - flap)
            end

            -- Horn (unicorn)
            local horn = petModel:FindFirstChild("Horn")
            if horn then horn.CFrame = headCF * CFrame.new(0, headR + 0.5, -headR * 0.3) * CFrame.Angles(math.rad(-15), 0, 0) end

            -- Shell (turtle)
            local shell = petModel:FindFirstChild("Shell")
            if shell then shell.CFrame = faceCF * CFrame.new(0, shape.bodyH * 0.3, 0) end

            -- Nose (dog/bear/wolf)
            local nose = petModel:FindFirstChild("Nose")
            if nose then nose.CFrame = headCF * CFrame.new(0, -headR * 0.15, -headR * 0.9) end

            -- Beak (bird)
            local beak = petModel:FindFirstChild("Beak")
            if beak then beak.CFrame = headCF * CFrame.new(0, -headR * 0.1, -headR * 0.85) end

            -- Legs (4 short cylinders under body)
            local legFL = petModel:FindFirstChild("LegFL")
            if legFL then
                local legH = shape.bodyH * 0.7
                local halfW = shape.bodyW * 0.32
                local halfD = shape.bodyD * 0.32
                local walkBob = math.sin(t * 6 + i) * 0.12
                legFL.CFrame = faceCF * CFrame.new(-halfW, -shape.bodyH * 0.5 - legH * 0.35, -halfD) * CFrame.Angles(walkBob, 0, math.rad(90))
                local legFR = petModel:FindFirstChild("LegFR")
                if legFR then legFR.CFrame = faceCF * CFrame.new(halfW, -shape.bodyH * 0.5 - legH * 0.35, -halfD) * CFrame.Angles(-walkBob, 0, math.rad(90)) end
                local legBL = petModel:FindFirstChild("LegBL")
                if legBL then legBL.CFrame = faceCF * CFrame.new(-halfW, -shape.bodyH * 0.5 - legH * 0.35, halfD) * CFrame.Angles(-walkBob, 0, math.rad(90)) end
                local legBR = petModel:FindFirstChild("LegBR")
                if legBR then legBR.CFrame = faceCF * CFrame.new(halfW, -shape.bodyH * 0.5 - legH * 0.35, halfD) * CFrame.Angles(walkBob, 0, math.rad(90)) end
            end

            -- Whiskers (cat)
            local wL1 = petModel:FindFirstChild("WhiskerL1")
            if wL1 then
                local wOff = headR * 0.5
                wL1.CFrame = headCF * CFrame.new(-wOff, -headR * 0.1, -headR * 0.7) * CFrame.Angles(0, math.rad(-25), math.rad(-10))
                local wL2 = petModel:FindFirstChild("WhiskerL2")
                if wL2 then wL2.CFrame = headCF * CFrame.new(-wOff, -headR * 0.25, -headR * 0.7) * CFrame.Angles(0, math.rad(-25), math.rad(10)) end
                local wR1 = petModel:FindFirstChild("WhiskerR1")
                if wR1 then wR1.CFrame = headCF * CFrame.new(wOff, -headR * 0.1, -headR * 0.7) * CFrame.Angles(0, math.rad(25), math.rad(10)) end
                local wR2 = petModel:FindFirstChild("WhiskerR2")
                if wR2 then wR2.CFrame = headCF * CFrame.new(wOff, -headR * 0.25, -headR * 0.7) * CFrame.Angles(0, math.rad(25), math.rad(-10)) end
            end

            -- Rainbow color cycling
            if petModel:GetAttribute("Rainbow") then
                local hue = (t * 0.5 + i * 0.2) % 1
                local rainbowColor = Color3.fromHSV(hue, 0.75, 0.95)
                for _, p in petModel:GetChildren() do
                    if p:IsA("BasePart") and p.Name ~= "EyeL" and p.Name ~= "EyeR" and p.Name ~= "ScleraL" and p.Name ~= "ScleraR" and p.Name ~= "Horn" and p.Name ~= "Beak" and p.Name ~= "Nose" then
                        p.Color = rainbowColor
                    end
                end
            end
        end
    end
end)

-- ══════════════════════════════════════════════
-- ██ QUEST TRACKER UI
-- ══════════════════════════════════════════════

local questPanel = nil

local function updateQuestUI()
    if questPanel then questPanel:Destroy() end
    if not questData or #questData == 0 then return end

    questPanel = glassFrame(hud, UDim2.new(0, 220, 0, 30 + #questData * 58), UDim2.new(1, -230, 0, 80), "QuestPanel")

    local qTitle = Instance.new("TextLabel")
    qTitle.Size = UDim2.new(1, 0, 0, 24)
    qTitle.BackgroundTransparency = 1
    qTitle.Text = "QUESTS"
    qTitle.TextColor3 = ACCENT
    qTitle.TextScaled = true
    qTitle.Font = Enum.Font.GothamBold
    qTitle.Parent = questPanel

    for i, quest in questData do
        local card = Instance.new("Frame")
        card.Size = UDim2.new(1, -8, 0, 52)
        card.Position = UDim2.new(0, 4, 0, 24 + (i - 1) * 56)
        card.BackgroundColor3 = Color3.fromRGB(30, 30, 50)
        card.BackgroundTransparency = 0.3
        card.BorderSizePixel = 0
        card.Parent = questPanel
        addCorner(card, 8)

        local desc = Instance.new("TextLabel")
        desc.Size = UDim2.new(1, -8, 0, 18)
        desc.Position = UDim2.new(0, 4, 0, 2)
        desc.BackgroundTransparency = 1
        desc.Text = quest.desc or "Quest"
        desc.TextColor3 = TEXT_COLOR
        desc.TextScaled = true
        desc.TextXAlignment = Enum.TextXAlignment.Left
        desc.Font = Enum.Font.GothamMedium
        desc.Parent = card

        -- Progress bar
        local barBg = Instance.new("Frame")
        barBg.Size = UDim2.new(1, -8, 0, 10)
        barBg.Position = UDim2.new(0, 4, 0, 22)
        barBg.BackgroundColor3 = Color3.fromRGB(40, 40, 60)
        barBg.BorderSizePixel = 0
        barBg.Parent = card
        addCorner(barBg, 5)

        local progress = math.min((quest.progress or 0) / math.max(quest.target or 1, 1), 1)
        local barFill = Instance.new("Frame")
        barFill.Size = UDim2.new(progress, 0, 1, 0)
        barFill.BackgroundColor3 = quest.claimed and Color3.fromRGB(100, 100, 100) or (progress >= 1 and Color3.fromRGB(80, 255, 120) or ACCENT)
        barFill.BorderSizePixel = 0
        barFill.Parent = barBg
        addCorner(barFill, 5)

        local progLabel = Instance.new("TextLabel")
        progLabel.Size = UDim2.new(0.5, 0, 0, 14)
        progLabel.Position = UDim2.new(0, 4, 0, 34)
        progLabel.BackgroundTransparency = 1
        progLabel.Text = (quest.progress or 0) .. "/" .. (quest.target or 0)
        progLabel.TextColor3 = Color3.fromRGB(180, 180, 200)
        progLabel.TextScaled = true
        progLabel.TextXAlignment = Enum.TextXAlignment.Left
        progLabel.Font = Enum.Font.Gotham
        progLabel.Parent = card

        if progress >= 1 and not quest.claimed then
            local claimBtn = Instance.new("TextButton")
            claimBtn.Size = UDim2.new(0, 60, 0, 18)
            claimBtn.Position = UDim2.new(1, -64, 0, 32)
            claimBtn.BackgroundColor3 = Color3.fromRGB(80, 255, 120)
            claimBtn.Text = "Claim +" .. (quest.reward or 0)
            claimBtn.TextColor3 = Color3.fromRGB(10, 10, 10)
            claimBtn.TextScaled = true
            claimBtn.Font = Enum.Font.GothamBold
            claimBtn.Parent = card
            addCorner(claimBtn, 6)
            claimBtn.Activated:Connect(function()
                QuestClaimRemote:FireServer(i)
                claimBtn.Text = "..."
            end)
        elseif quest.claimed then
            local doneLabel = Instance.new("TextLabel")
            doneLabel.Size = UDim2.new(0, 60, 0, 14)
            doneLabel.Position = UDim2.new(1, -64, 0, 34)
            doneLabel.BackgroundTransparency = 1
            doneLabel.Text = "Done"
            doneLabel.TextColor3 = Color3.fromRGB(120, 120, 140)
            doneLabel.TextScaled = true
            doneLabel.Font = Enum.Font.Gotham
            doneLabel.Parent = card
        end
    end
end

-- ══════════════════════════════════════════════
-- ██ FUSE UI
-- ══════════════════════════════════════════════

local fusePanel = nil
local fuseOpen = false
local fuseSelected = {}

local function toggleFuseUI()
    if fuseOpen and fusePanel then
        fusePanel:Destroy()
        fusePanel = nil
        fuseOpen = false
        fuseSelected = {}
        return
    end
    if (localData.rebirthCount or 0) < CONFIG.FUSE_UNLOCK_REBIRTH then
        popupNumber(player, "Need Rebirth " .. CONFIG.FUSE_UNLOCK_REBIRTH .. " to Fuse!", Color3.fromRGB(255, 80, 80))
        return
    end

    fuseOpen = true
    fuseSelected = {}
    fusePanel = glassFrame(hud, UDim2.new(0, 300, 0, 360), UDim2.new(0.5, -150, 0.5, -180), "FusePanel")

    local fTitle = Instance.new("TextLabel")
    fTitle.Size = UDim2.new(1, 0, 0, 30)
    fTitle.BackgroundTransparency = 1
    fTitle.Text = "FUSE PETS (Select 3 same rarity)"
    fTitle.TextColor3 = ACCENT2
    fTitle.TextScaled = true
    fTitle.Font = Enum.Font.GothamBold
    fTitle.Parent = fusePanel

    local closeBtn = Instance.new("TextButton")
    closeBtn.Size = UDim2.new(0, 30, 0, 30)
    closeBtn.Position = UDim2.new(1, -35, 0, 0)
    closeBtn.BackgroundColor3 = Color3.fromRGB(200, 50, 50)
    closeBtn.Text = "X"
    closeBtn.TextColor3 = TEXT_COLOR
    closeBtn.TextScaled = true
    closeBtn.Font = Enum.Font.GothamBold
    closeBtn.Parent = fusePanel
    addCorner(closeBtn, 6)
    closeBtn.Activated:Connect(toggleFuseUI)

    local scroll = Instance.new("ScrollingFrame")
    scroll.Size = UDim2.new(1, -12, 1, -80)
    scroll.Position = UDim2.new(0, 6, 0, 34)
    scroll.BackgroundTransparency = 1
    scroll.ScrollBarThickness = 4
    scroll.CanvasSize = UDim2.new(0, 0, 0, 0)
    scroll.Parent = fusePanel

    local grid = Instance.new("UIGridLayout")
    grid.CellSize = UDim2.new(0, 82, 0, 40)
    grid.CellPadding = UDim2.new(0, 4, 0, 4)
    grid.Parent = scroll

    if localData.pets then
        for idx, pet in localData.pets do
            -- Skip equipped pets
            local isEquipped = false
            for _, eqIdx in localData.equippedPets or {} do
                if eqIdx == idx then isEquipped = true; break end
            end
            if isEquipped then continue end

            local btn = Instance.new("TextButton")
            btn.Size = UDim2.new(0, 80, 0, 38)
            btn.BackgroundColor3 = RARITY_COLORS[pet.rarity] or Color3.new(0.5, 0.5, 0.5)
            btn.BackgroundTransparency = 0.4
            btn.Text = pet.name
            btn.TextColor3 = TEXT_COLOR
            btn.TextScaled = true
            btn.Font = Enum.Font.GothamMedium
            btn.Parent = scroll
            addCorner(btn, 6)

            btn.Activated:Connect(function()
                -- Toggle selection
                local found = false
                for si, sIdx in fuseSelected do
                    if sIdx == idx then
                        table.remove(fuseSelected, si)
                        btn.BackgroundTransparency = 0.4
                        found = true
                        break
                    end
                end
                if not found and #fuseSelected < 3 then
                    table.insert(fuseSelected, idx)
                    btn.BackgroundTransparency = 0
                end
            end)
        end
        scroll.CanvasSize = UDim2.new(0, 0, 0, grid.AbsoluteContentSize.Y + 8)
    end

    -- Fuse button
    local fuseBtn = Instance.new("TextButton")
    fuseBtn.Size = UDim2.new(0.8, 0, 0, 36)
    fuseBtn.Position = UDim2.new(0.1, 0, 1, -42)
    fuseBtn.BackgroundColor3 = ACCENT2
    fuseBtn.Text = "FUSE (3 selected)"
    fuseBtn.TextColor3 = TEXT_COLOR
    fuseBtn.TextScaled = true
    fuseBtn.Font = Enum.Font.GothamBold
    fuseBtn.Parent = fusePanel
    addCorner(fuseBtn, 10)

    fuseBtn.Activated:Connect(function()
        if #fuseSelected ~= 3 then
            popupNumber(player, "Select exactly 3 pets!", Color3.fromRGB(255, 80, 80))
            return
        end
        FusePetsRemote:FireServer(fuseSelected)
        toggleFuseUI()
    end)
end

-- ══════════════════════════════════════════════
-- ██ INIT
-- ══════════════════════════════════════════════

task.wait(1)
setupClickDetectors()
renderPets()
updateHUD()
updateUpgradeBillboards()

player.CharacterAdded:Connect(function()
    task.wait(1)
    renderPets()
end)

-- Intro tween: slide top bar in
topBar.Position = UDim2.new(0.5, -260, 0, -70)
TweenService:Create(topBar, TweenInfo.new(0.8, Enum.EasingStyle.Back, Enum.EasingDirection.Out), {
    Position = UDim2.new(0.5, -260, 0, 10)
}):Play()

petPanel.Position = UDim2.new(0, -150, 1, -46)
TweenService:Create(petPanel, TweenInfo.new(0.6, Enum.EasingStyle.Back, Enum.EasingDirection.Out, 0, false, 0.3), {
    Position = UDim2.new(0, 10, 1, -46)
}):Play()

print("[Simulator] Client initialized for " .. player.Name)
`;
}

function buildSimulatorScript(params: GameTemplateParams): MultiScriptResult {
  return {
    serverScript: buildSimulatorServerScript(params),
    additionalScripts: [
      {
        name: 'SimulatorConfig',
        scriptType: 'ModuleScript',
        container: 'ReplicatedStorage',
        source: buildSimulatorConfigModule(params),
      },
      {
        name: 'SimulatorClient',
        scriptType: 'LocalScript',
        container: 'StarterPlayerScripts',
        source: buildSimulatorClientScript(params),
      },
    ],
  };
}

function safeLuaString(value: unknown, fallback: string): string {
  return JSON.stringify(typeof value === 'string' && value.trim() ? value.trim().slice(0, 80) : fallback);
}

// Session 414f: reusable PROVEN 3D meme-figure prelude (extracted from the obby
// builder's memeHelperLua). Builds real volumetric meme characters from
// primitives — Tralalero shark, Skibidi toilet, Bombardiro crocodile, Sigma —
// instead of cheap flat decal billboards. Pure Lua → guaranteed visible, free,
// no asset upload/moderation risk. Caller must define `local container` (parent
// Folder/Model) and `local RunService = game:GetService("RunService")` before
// emitting this, then call `buildMeme3dFigure(key, position, idx)`
// (key = "tralalero"|"skibidi"|"bombardiro"|"sigma").
function meme3dPreludeLua(): string {
  return `
local MEME_NPC_FALLBACK_SCALE = 2.6
local _MEME3D_NO_IDLE = false
local function _memeNpcIdle(model, primary)
    if _MEME3D_NO_IDLE then return end
    if not model or not primary then return end
    local baseCF = primary.CFrame; local t0 = tick()
    task.spawn(function()
        while model.Parent do
            local dt = tick() - t0; local bob = math.sin(dt * 1.5) * 0.3
            model:PivotTo(baseCF * CFrame.new(0, bob, 0))
            RunService.Heartbeat:Wait()
        end
    end)
end
local function _memeMakeDecor(parent, shape, color, size, offset, material)
    local p = Instance.new("Part"); p.Shape = shape or Enum.PartType.Block; p.Color = color; p.Size = size
    p.Material = material or Enum.Material.SmoothPlastic; p.Anchored = true; p.CanCollide = false; p.CastShadow = false
    p.Position = offset; p.Parent = parent; return p
end
local function _memeFinalizeNpc(model, primary)
    if not model or not primary then return end
    for _, d in ipairs(model:GetDescendants()) do
        if d:IsA("BasePart") and d ~= primary then
            d.Anchored = false; local w = Instance.new("WeldConstraint"); w.Part0 = primary; w.Part1 = d; w.Parent = primary
        end
    end
    primary.Anchored = true
    pcall(function() model:ScaleTo(MEME_NPC_FALLBACK_SCALE) end)
end
local function buildSkibidiNpc(position, idx)
    local m = Instance.new("Model"); m.Name = "SkibidiNpc_" .. idx
    local bowl = _memeMakeDecor(m, Enum.PartType.Cylinder, Color3.fromRGB(245,245,250), Vector3.new(1.6,2.2,2.2), position, Enum.Material.SmoothPlastic); bowl.Orientation = Vector3.new(0,0,90); m.PrimaryPart = bowl
    for i = 1, 8 do local a = (i-1)*(math.pi*2/8); _memeMakeDecor(m, Enum.PartType.Block, Color3.fromRGB(235,235,240), Vector3.new(0.35,0.2,0.35), position + Vector3.new(math.cos(a)*1.3,1.0,math.sin(a)*1.3), Enum.Material.SmoothPlastic) end
    _memeMakeDecor(m, Enum.PartType.Ball, Color3.fromRGB(255,215,175), Vector3.new(1.8,1.8,1.8), position + Vector3.new(0,1.9,0), Enum.Material.SmoothPlastic)
    _memeMakeDecor(m, Enum.PartType.Ball, Color3.fromRGB(80,200,255), Vector3.new(0.35,0.35,0.35), position + Vector3.new(0.35,2.1,0.75), Enum.Material.Neon)
    _memeMakeDecor(m, Enum.PartType.Ball, Color3.fromRGB(80,200,255), Vector3.new(0.35,0.35,0.35), position + Vector3.new(-0.35,2.1,0.75), Enum.Material.Neon)
    _memeMakeDecor(m, Enum.PartType.Block, Color3.fromRGB(30,20,20), Vector3.new(0.7,0.35,0.2), position + Vector3.new(0,1.55,0.85), Enum.Material.SmoothPlastic)
    m.Parent = container; _memeFinalizeNpc(m, bowl); _memeNpcIdle(m, bowl); return m
end
local function buildBombardiroNpc(position, idx)
    local m = Instance.new("Model"); m.Name = "BombardiroNpc_" .. idx
    local body = _memeMakeDecor(m, Enum.PartType.Block, Color3.fromRGB(85,200,90), Vector3.new(1.4,1.2,4.5), position, Enum.Material.Neon); m.PrimaryPart = body
    _memeMakeDecor(m, Enum.PartType.Cylinder, Color3.fromRGB(45,140,60), Vector3.new(1.6,1.1,1.1), position + Vector3.new(0,0,-2.8), Enum.Material.Neon)
    _memeMakeDecor(m, Enum.PartType.Block, Color3.fromRGB(120,120,130), Vector3.new(3.8,0.2,1.6), position + Vector3.new(-2.5,0,0), Enum.Material.Metal)
    _memeMakeDecor(m, Enum.PartType.Block, Color3.fromRGB(120,120,130), Vector3.new(3.8,0.2,1.6), position + Vector3.new(2.5,0,0), Enum.Material.Metal)
    _memeMakeDecor(m, Enum.PartType.Block, Color3.fromRGB(45,140,60), Vector3.new(0.3,1.2,1.2), position + Vector3.new(0,0.8,2.2), Enum.Material.Neon)
    m.Parent = container; _memeFinalizeNpc(m, body); _memeNpcIdle(m, body); return m
end
local function buildTralaleroNpc(position, idx)
    local m = Instance.new("Model"); m.Name = "TralaleroNpc_" .. idx
    local body = _memeMakeDecor(m, Enum.PartType.Block, Color3.fromRGB(60,120,220), Vector3.new(4.2,1.6,1.6), position, Enum.Material.SmoothPlastic); m.PrimaryPart = body
    _memeMakeDecor(m, Enum.PartType.Block, Color3.fromRGB(40,90,180), Vector3.new(0.5,1.2,0.9), position + Vector3.new(0,1.2,0), Enum.Material.SmoothPlastic)
    _memeMakeDecor(m, Enum.PartType.Block, Color3.fromRGB(240,240,240), Vector3.new(1,0.5,1.6), position + Vector3.new(-1.1,-1.1,0), Enum.Material.SmoothPlastic)
    _memeMakeDecor(m, Enum.PartType.Block, Color3.fromRGB(240,240,240), Vector3.new(1,0.5,1.6), position + Vector3.new(1.1,-1.1,0), Enum.Material.SmoothPlastic)
    _memeMakeDecor(m, Enum.PartType.Ball, Color3.fromRGB(255,255,255), Vector3.new(0.4,0.4,0.4), position + Vector3.new(1.8,0.4,0.6), Enum.Material.SmoothPlastic)
    m.Parent = container; _memeFinalizeNpc(m, body); _memeNpcIdle(m, body); return m
end
local function buildSigmaNpc(position, idx)
    local m = Instance.new("Model"); m.Name = "SigmaNpc_" .. idx
    local head = _memeMakeDecor(m, Enum.PartType.Ball, Color3.fromRGB(255,210,80), Vector3.new(2.5,2.5,2.5), position, Enum.Material.Neon); m.PrimaryPart = head
    _memeMakeDecor(m, Enum.PartType.Block, Color3.fromRGB(20,20,20), Vector3.new(0.35,0.55,0.9), position + Vector3.new(0.5,0.25,1.1), Enum.Material.SmoothPlastic)
    _memeMakeDecor(m, Enum.PartType.Block, Color3.fromRGB(20,20,20), Vector3.new(0.35,0.55,0.9), position + Vector3.new(-0.5,0.25,1.1), Enum.Material.SmoothPlastic)
    _memeMakeDecor(m, Enum.PartType.Cylinder, Color3.fromRGB(255,220,60), Vector3.new(0.5,2.2,2.2), position + Vector3.new(0,1.6,0), Enum.Material.Metal)
    for i = 1, 4 do local a = (i-1)*(math.pi*2/4); _memeMakeDecor(m, Enum.PartType.Block, Color3.fromRGB(255,220,60), Vector3.new(0.25,0.7,0.25), position + Vector3.new(math.cos(a)*0.9,2.1,math.sin(a)*0.9), Enum.Material.Metal) end
    m.Parent = container; _memeFinalizeNpc(m, head); _memeNpcIdle(m, head); return m
end
local _meme3dBuilders = {skibidi=buildSkibidiNpc, bombardiro=buildBombardiroNpc, tralalero=buildTralaleroNpc, sigma=buildSigmaNpc}
local _meme3dOrder = {"tralalero","bombardiro","skibidi","sigma"}
local function buildMeme3dFigure(key, position, idx)
    local b = _meme3dBuilders[key] or _meme3dBuilders[_meme3dOrder[((idx - 1) % 4) + 1]]
    return b(position, idx)
end
-- Session 417b: moving variant for TD enemies. Same geometry, but the idle bob
-- loop is suppressed (the wave loop pivots the figure along its lane) and every
-- part is anchored so the rigid PivotTo never jitters. Returns model + PrimaryPart.
local function buildMeme3dFigureMoving(key, position, idx)
    _MEME3D_NO_IDLE = true
    local ok, m = pcall(buildMeme3dFigure, key, position, idx)
    _MEME3D_NO_IDLE = false
    if not ok or not m or not m.PrimaryPart then return nil end
    for _, d in ipairs(m:GetDescendants()) do if d:IsA("BasePart") then d.Anchored = true; d.CanCollide = false; d.CastShadow = false end end
    return m, m.PrimaryPart
end
`;
}

// Session 414g: reusable real R15 humanoid NPC builder (extracted from the
// survival builder). Creates a proper Roblox character rig (not a block stack),
// recolours it, optional glowing eyes. Returns npc, humanoid, root (or nil on
// engine failure). Caller anchors the root for a static town NPC.
function humanoidNpcPreludeLua(): string {
  return `
local function makeHumanoidNpc(parent, cframe, opts)
    opts = opts or {}
    local ok, npc = pcall(function()
        return game:GetService("Players"):CreateHumanoidModelFromDescription(Instance.new("HumanoidDescription"), Enum.HumanoidRigType.R15)
    end)
    if not ok or not npc then return nil end
    npc.Name = opts.name or "NPC"
    local hum = npc:FindFirstChildOfClass("Humanoid")
    local hrp = npc:FindFirstChild("HumanoidRootPart")
    for _, pt in ipairs(npc:GetDescendants()) do
        if pt:IsA("Shirt") or pt:IsA("Pants") or pt:IsA("ShirtGraphic") or pt:IsA("Decal") or pt:IsA("Accessory") or pt:IsA("BodyColors") then pt:Destroy()
        elseif pt:IsA("BasePart") and opts.color then pt.Color = opts.color; pt.Material = opts.material or Enum.Material.SmoothPlastic end
    end
    if hum then
        hum.WalkSpeed = opts.walkSpeed or 0
        hum.DisplayDistanceType = Enum.HumanoidDisplayDistanceType.None
        hum.HealthDisplayType = Enum.HumanoidHealthDisplayType.AlwaysOff
        if opts.health then hum.MaxHealth = opts.health; hum.Health = opts.health end
    end
    if opts.eyes and npc:FindFirstChild("Head") then
        local head = npc.Head
        for _, sx in ipairs({-0.32, 0.32}) do
            local eye = Instance.new("Part"); eye.Size = Vector3.new(0.26, 0.26, 0.18); eye.Color = Color3.fromRGB(255, 60, 40); eye.Material = Enum.Material.Neon; eye.CanCollide = false; eye.Massless = true
            local w = Instance.new("Weld"); w.Part0 = head; w.Part1 = eye; w.C0 = CFrame.new(sx, 0.15, -0.58); w.Parent = eye
            eye.Parent = npc
        end
    end
    if cframe then npc:PivotTo(cframe) end
    npc.Parent = parent or workspace
    return npc, hum, hrp
end
`;
}

// Session 414e: reusable themed marker above a builder's `spawnLoc` — shows the
// theme's signature meme face (decal) + the game title. Safe (attached to the
// spawn pad, no world placement). Assumes `spawnLoc` and `Config.Title` are in
// scope (true for all genre builders). Empty for absent/neutral spec.
function themedSpawnBillboardLua(spec: GameVisualSpec | undefined): string {
  if (!spec || spec.vibe === 'neutral') return '';
  const decal = Math.max(0, Math.floor(Number(spec.heroDecalId) || 0));
  const h = decal > 0 ? 220 : 60;
  const imgPart = decal > 0
    ? `local _hi = Instance.new("ImageLabel"); _hi.Size = UDim2.new(1, 0, 0.74, 0); _hi.BackgroundTransparency = 1; _hi.Image = "rbxthumb://type=Asset&id=${decal}&w=420&h=420"; _hi.Parent = _hb; `
    : '';
  const txtH = decal > 0 ? '0.26' : '1';
  const txtY = decal > 0 ? '0.74' : '0';
  return `
do local _hb = Instance.new("BillboardGui"); _hb.Size = UDim2.new(0, 200, 0, ${h}); _hb.StudsOffset = Vector3.new(0, 14, 0); _hb.AlwaysOnTop = true; _hb.Parent = spawnLoc; ${imgPart}local _ht = Instance.new("TextLabel"); _ht.Size = UDim2.new(1, 0, ${txtH}, 0); _ht.Position = UDim2.new(0, 0, ${txtY}, 0); _ht.BackgroundTransparency = 1; _ht.TextColor3 = Color3.fromRGB(255, 255, 255); _ht.TextStrokeTransparency = 0.3; _ht.TextScaled = true; _ht.Font = Enum.Font.GothamBlack; _ht.Text = Config.Title; _ht.Parent = _hb end`;
}

function buildRpgAdventureScript(params: GameTemplateParams): MultiScriptResult {
  const titleLua = safeLuaString(params.title, 'Quest Realm RPG');
  const enemyLua = safeLuaString(params.enemyFamily, 'Slimes');
  const bossLua = safeLuaString(params.bossName, 'Ancient Guardian');
  const lootLua = safeLuaString(params.lootTheme || params.currencyName, 'Gold');
  const questCount = Math.max(3, Math.min(5, Math.floor(params.questCount || 3)));
  const classLua = safeLuaString(params.playerClass, 'warrior');
  const serverScript = `local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local DataStoreService = game:GetService("DataStoreService")
local Debris = game:GetService("Debris")

local Config = {
    Title = ${titleLua},
    EnemyFamily = ${enemyLua},
    BossName = ${bossLua},
    LootName = ${lootLua},
    QuestCount = ${questCount},
    PlayerClass = ${classLua},
}

local dataStore
local okStore, storeErr = pcall(function()
    dataStore = DataStoreService:GetDataStore("PlayableRPG_v1")
end)
if not okStore then warn("[RPG] DataStore unavailable: " .. tostring(storeErr)) end

local remotes = Instance.new("Folder")
remotes.Name = "RPGRemotes"
remotes.Parent = ReplicatedStorage
local QuestRemote = Instance.new("RemoteEvent"); QuestRemote.Name = "QuestRemote"; QuestRemote.Parent = remotes
local CombatRemote = Instance.new("RemoteEvent"); CombatRemote.Name = "CombatRemote"; CombatRemote.Parent = remotes

local data = {}
local enemies = {}

local function makePart(name, size, pos, color, mat, parent)
    local p = Instance.new("Part")
    p.Name = name; p.Size = size; p.Position = pos; p.Anchored = true
    p.Color = color; p.Material = mat; p.TopSurface = Enum.SurfaceType.Smooth; p.BottomSurface = Enum.SurfaceType.Smooth
    p.Parent = parent or workspace
    return p
end

local world = Instance.new("Folder"); world.Name = "GeneratedRPGWorld"; world.Parent = workspace
makePart("TownSquare", Vector3.new(90, 1, 90), Vector3.new(0, 0, 0), Color3.fromRGB(95, 145, 90), Enum.Material.Grass, world)
makePart("QuestPath", Vector3.new(12, 0.4, 150), Vector3.new(0, 0.3, 35), Color3.fromRGB(125, 105, 80), Enum.Material.Cobblestone, world)
makePart("DungeonFloor", Vector3.new(70, 1, 70), Vector3.new(0, 0, 115), Color3.fromRGB(70, 65, 75), Enum.Material.Slate, world)
makePart("BossGate", Vector3.new(30, 16, 2), Vector3.new(0, 8, 78), Color3.fromRGB(130, 70, 170), Enum.Material.Neon, world)
for i = 1, 8 do
    local angle = (i / 8) * math.pi * 2
    makePart("Torch_" .. i, Vector3.new(2, 14, 2), Vector3.new(math.cos(angle) * 42, 7, math.sin(angle) * 42), Color3.fromRGB(90, 60, 35), Enum.Material.Wood, world)
    makePart("TorchGlow_" .. i, Vector3.new(4, 4, 4), Vector3.new(math.cos(angle) * 42, 15, math.sin(angle) * 42), Color3.fromRGB(255, 165, 70), Enum.Material.Neon, world)
end
local spawn = Instance.new("SpawnLocation")
spawn.Name = "RPGSpawn"; spawn.Size = Vector3.new(14, 1, 14); spawn.Position = Vector3.new(0, 2, -32); spawn.Anchored = true
spawn.Color = Color3.fromRGB(90, 180, 255); spawn.Material = Enum.Material.Neon; spawn.Parent = world

${worldVisualsLua()}
setupAtmosphere({atmoColor = Color3.fromRGB(196, 184, 150), tint = Color3.fromRGB(252, 250, 244), haze = 1.6, fx = "fireflies"})
for i = 1, 16 do
    local a = math.rad(i * 22.5 + 11); local r = 52 + (i % 3) * 10
    local p = Vector3.new(math.cos(a) * r, 0.5, math.sin(a) * r)
    if p.Z < 16 then
        if i % 4 == 0 then makeRock(world, p, 0.7, Color3.fromRGB(128, 124, 120)) else makeTree(world, p, 0.9, "round", Color3.fromRGB(110, 78, 50), Color3.fromRGB(78, 140, 70)) end
    end
end

local questNpc = makePart("QuestGiver", Vector3.new(4, 7, 4), Vector3.new(-15, 4, -18), Color3.fromRGB(245, 210, 120), Enum.Material.SmoothPlastic, world)
local questPrompt = Instance.new("ProximityPrompt")
questPrompt.ActionText = "Talk"; questPrompt.ObjectText = "Quest Giver"; questPrompt.MaxActivationDistance = 14; questPrompt.Parent = questNpc

local function defaultData()
    return {level = 1, xp = 0, gold = 0, quest = 0, kills = 0}
end

local function sync(player)
    local d = data[player.UserId]; if not d then return end
    local ls = player:FindFirstChild("leaderstats")
    if ls then
        local loot = ls:FindFirstChild(Config.LootName)
        ls.Level.Value = d.level; ls.XP.Value = d.xp; if loot then loot.Value = d.gold end; ls.Quest.Value = d.quest
    end
    QuestRemote:FireClient(player, {kind="sync", data=d, title=Config.Title, loot=Config.LootName})
end

local function award(player, xp, gold)
    local d = data[player.UserId]; if not d then return end
    d.xp += xp; d.gold += gold; d.kills += 1
    while d.xp >= d.level * 100 do
        d.xp -= d.level * 100
        d.level += 1
    end
    if d.quest < Config.QuestCount and d.kills >= (d.quest + 1) * 2 then
        d.quest += 1
        QuestRemote:FireClient(player, {kind="quest", text="Quest " .. d.quest .. " complete. Return for the next hunt."})
    end
    sync(player)
end

local function makeEnemy(name, pos, hp, rewardXp, rewardGold, boss)
    local model = Instance.new("Model"); model.Name = name
    local root = Instance.new("Part"); root.Name = "HumanoidRootPart"; root.Size = boss and Vector3.new(7, 9, 7) or Vector3.new(4, 5, 4)
    root.Position = pos; root.Anchored = false; root.Color = boss and Color3.fromRGB(160, 70, 210) or Color3.fromRGB(90, 210, 120); root.Material = boss and Enum.Material.Neon or Enum.Material.SmoothPlastic; root.Parent = model
    local hum = Instance.new("Humanoid"); hum.MaxHealth = hp; hum.Health = hp; hum.WalkSpeed = boss and 10 or 8; hum.Parent = model
    local weldFloor = makePart(name .. "_Pad", Vector3.new(10, 1, 10), Vector3.new(pos.X, 0.5, pos.Z), Color3.fromRGB(80, 75, 85), Enum.Material.Slate, world)
    model.PrimaryPart = root; model.Parent = world
    enemies[root] = {hum = hum, xp = rewardXp, gold = rewardGold, pad = weldFloor}
    hum.Died:Connect(function()
        local killer = hum:FindFirstChild("LastHitBy")
        if killer and killer.Value and killer.Value:IsA("Player") then award(killer.Value, rewardXp, rewardGold) end
        enemies[root] = nil
        Debris:AddItem(model, 4)
    end)
    return model
end

for i = 1, 8 do
    makeEnemy(Config.EnemyFamily .. "_" .. i, Vector3.new((i % 4) * 14 - 21, 5, 42 + math.floor((i - 1) / 4) * 18), 60, 35, 15, false)
end
makeEnemy(Config.BossName, Vector3.new(0, 8, 120), 350, 220, 150, true)

local function nearestEnemy(root)
    local best, bestDist
    for part, info in pairs(enemies) do
        if part.Parent and info.hum.Health > 0 then
            local dist = (part.Position - root.Position).Magnitude
            if dist < 14 and (not bestDist or dist < bestDist) then best, bestDist = info, dist end
        end
    end
    return best
end

local function giveTool(player)
    local tool = Instance.new("Tool"); tool.Name = Config.PlayerClass == "mage" and "Spell Wand" or (Config.PlayerClass == "archer" and "Ranger Bow" or "Quest Sword")
    tool.RequiresHandle = true; tool.CanBeDropped = false
    local handle = Instance.new("Part"); handle.Name = "Handle"; handle.Size = Vector3.new(1, 1, 4); handle.Color = Color3.fromRGB(230, 210, 120); handle.Material = Enum.Material.Metal; handle.Parent = tool
    tool.Activated:Connect(function()
        local char = player.Character; local root = char and char:FindFirstChild("HumanoidRootPart"); if not root then return end
        local target = nearestEnemy(root); if not target then CombatRemote:FireClient(player, {kind="miss"}); return end
        local marker = target.hum:FindFirstChild("LastHitBy") or Instance.new("ObjectValue")
        marker.Name = "LastHitBy"; marker.Value = player; marker.Parent = target.hum
        target.hum:TakeDamage(20 + (data[player.UserId] and data[player.UserId].level or 1) * 4)
        CombatRemote:FireClient(player, {kind="hit"})
    end)
    tool.Parent = player:WaitForChild("Backpack")
end

local function setupPlayer(player)
    local loaded = nil
    if dataStore then pcall(function() loaded = dataStore:GetAsync("rpg_" .. player.UserId) end) end
    data[player.UserId] = typeof(loaded) == "table" and loaded or defaultData()
    local ls = Instance.new("Folder"); ls.Name = "leaderstats"; ls.Parent = player
    local level = Instance.new("IntValue"); level.Name = "Level"; level.Parent = ls
    local xp = Instance.new("IntValue"); xp.Name = "XP"; xp.Parent = ls
    local gold = Instance.new("IntValue"); gold.Name = Config.LootName; gold.Parent = ls
    local quest = Instance.new("IntValue"); quest.Name = "Quest"; quest.Parent = ls
    player.CharacterAdded:Connect(function() task.wait(0.5); giveTool(player); sync(player) end)
    task.defer(function() giveTool(player); sync(player) end)
end

questPrompt.Triggered:Connect(function(player)
    local d = data[player.UserId] or defaultData()
    QuestRemote:FireClient(player, {kind="quest", text="Defeat " .. Config.EnemyFamily .. " and clear quest " .. math.min(d.quest + 1, Config.QuestCount) .. "/" .. Config.QuestCount .. "."})
end)

Players.PlayerAdded:Connect(setupPlayer)
Players.PlayerRemoving:Connect(function(player)
    if dataStore and data[player.UserId] then pcall(function() dataStore:SetAsync("rpg_" .. player.UserId, data[player.UserId]) end) end
    data[player.UserId] = nil
end)
for _, player in Players:GetPlayers() do setupPlayer(player) end
print("[RPG] " .. Config.Title .. " initialized with leaderstats, quests, combat, loot, and boss dungeon")
`;
  const clientScript = `local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local player = Players.LocalPlayer
local remotes = ReplicatedStorage:WaitForChild("RPGRemotes")
local QuestRemote = remotes:WaitForChild("QuestRemote")
local gui = Instance.new("ScreenGui"); gui.Name = "RPGHUD"; gui.ResetOnSpawn = false; gui.Parent = player:WaitForChild("PlayerGui")
local label = Instance.new("TextLabel"); label.Size = UDim2.new(0, 360, 0, 76); label.Position = UDim2.new(0, 16, 0, 16)
label.BackgroundColor3 = Color3.fromRGB(20, 22, 28); label.BackgroundTransparency = 0.18; label.TextColor3 = Color3.fromRGB(245, 235, 180); label.TextScaled = true; label.Font = Enum.Font.GothamBold; label.Parent = gui
local corner = Instance.new("UICorner"); corner.CornerRadius = UDim.new(0, 10); corner.Parent = label
QuestRemote.OnClientEvent:Connect(function(payload)
    if payload.kind == "sync" and payload.data then
        label.Text = payload.title .. "\\nLevel " .. payload.data.level .. " | XP " .. payload.data.xp .. " | " .. payload.loot .. " " .. payload.data.gold .. " | Quest " .. payload.data.quest
    elseif payload.text then
        label.Text = payload.text
    end
end)
`;
  return {
    serverScript,
    additionalScripts: [{ name: 'RPGHudClient', scriptType: 'LocalScript', container: 'StarterPlayerScripts', source: clientScript }],
  };
}

function buildHorrorEscapeScript(params: GameTemplateParams): MultiScriptResult {
  const titleLua = safeLuaString(params.title, 'Midnight Escape');
  const monsterLua = safeLuaString(params.monsterName, 'The Watcher');
  const keyCount = Math.max(3, Math.min(5, Math.floor(params.keyCount || 3)));
  const doorCount = Math.max(2, Math.min(5, Math.floor(params.doorCount || keyCount)));
  const serverScript = `local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local DataStoreService = game:GetService("DataStoreService")
local PathfindingService = game:GetService("PathfindingService")

local Config = {Title=${titleLua}, MonsterName=${monsterLua}, KeyCount=${keyCount}, DoorCount=${doorCount}}
local dataStore
local okStore, storeErr = pcall(function()
    dataStore = DataStoreService:GetDataStore("PlayableHorror_v1")
end)
if not okStore then warn("[Horror] DataStore unavailable: " .. tostring(storeErr)) end
local remotes = Instance.new("Folder"); remotes.Name = "HorrorRemotes"; remotes.Parent = ReplicatedStorage
local HorrorEvent = Instance.new("RemoteEvent"); HorrorEvent.Name = "HorrorEvent"; HorrorEvent.Parent = remotes
local world = Instance.new("Folder"); world.Name = "GeneratedHorrorWorld"; world.Parent = workspace
local playerKeys = {}

local function part(name, size, pos, color, mat, collide)
    local p = Instance.new("Part"); p.Name = name; p.Size = size; p.Position = pos; p.Anchored = true; p.Color = color; p.Material = mat; p.CanCollide = collide ~= false; p.Parent = world; return p
end
part("HorrorGround", Vector3.new(170, 1, 170), Vector3.new(0, 0, 20), Color3.fromRGB(28, 25, 32), Enum.Material.Slate)
${worldVisualsLua()}
setupAtmosphere({clockTime = 0, brightness = 0.9, ambient = Color3.fromRGB(30, 30, 40), outdoor = Color3.fromRGB(34, 36, 48), atmoColor = Color3.fromRGB(44, 46, 60), tint = Color3.fromRGB(152, 164, 190), haze = 3.5, density = 0.5, bloom = 0.35, cloudCover = 0.85})
do local _L = game:GetService("Lighting"); _L.FogEnd = 175; _L.FogColor = Color3.fromRGB(20, 20, 28) end
for i = 1, Config.DoorCount do
    part("Hall_" .. i, Vector3.new(26, 1, 38), Vector3.new((i - 3) * 30, 1, i * 24 - 45), Color3.fromRGB(45, 42, 50), Enum.Material.Concrete)
    part("WallA_" .. i, Vector3.new(28, 14, 2), Vector3.new((i - 3) * 30, 7, i * 24 - 26), Color3.fromRGB(25, 23, 28), Enum.Material.Brick)
    part("WallB_" .. i, Vector3.new(28, 14, 2), Vector3.new((i - 3) * 30, 7, i * 24 - 64), Color3.fromRGB(25, 23, 28), Enum.Material.Brick)
end
local spawn = Instance.new("SpawnLocation"); spawn.Name = "HorrorSpawn"; spawn.Size = Vector3.new(12, 1, 12); spawn.Position = Vector3.new(0, 2, -70); spawn.Anchored = true; spawn.Color = Color3.fromRGB(75, 95, 130); spawn.Material = Enum.Material.Neon; spawn.Parent = world
for i = 1, Config.KeyCount do
    local key = part("EscapeKey_" .. i, Vector3.new(3, 1, 3), Vector3.new((i - 3) * 22, 2.2, -20 + i * 24), Color3.fromRGB(230, 210, 80), Enum.Material.Neon, false)
    local pr = Instance.new("ProximityPrompt"); pr.ActionText = "Collect Key"; pr.ObjectText = "Key " .. i; pr.MaxActivationDistance = 10; pr.Parent = key
    pr.Triggered:Connect(function(player)
        playerKeys[player.UserId] = math.min((playerKeys[player.UserId] or 0) + 1, Config.KeyCount)
        key.Transparency = 1; key.CanTouch = false; pr.Enabled = false
        HorrorEvent:FireClient(player, {kind="keys", keys=playerKeys[player.UserId], total=Config.KeyCount})
    end)
end
local escapeDoor = part("EscapeDoor", Vector3.new(22, 18, 3), Vector3.new(0, 9, 78), Color3.fromRGB(130, 30, 45), Enum.Material.Neon)
local escapePrompt = Instance.new("ProximityPrompt"); escapePrompt.ActionText = "Escape"; escapePrompt.ObjectText = "Locked Exit"; escapePrompt.HoldDuration = 1; escapePrompt.MaxActivationDistance = 14; escapePrompt.Parent = escapeDoor
escapePrompt.Triggered:Connect(function(player)
    if (playerKeys[player.UserId] or 0) >= Config.KeyCount then
        local ls = player:FindFirstChild("leaderstats"); if ls then ls.Escapes.Value += 1 end
        HorrorEvent:FireClient(player, {kind="escape"})
    else
        HorrorEvent:FireClient(player, {kind="locked", keys=playerKeys[player.UserId] or 0, total=Config.KeyCount})
    end
end)

local monster = Instance.new("Model"); monster.Name = Config.MonsterName
local root = Instance.new("Part"); root.Name = "HumanoidRootPart"; root.Size = Vector3.new(5, 8, 5); root.Position = Vector3.new(0, 5, 35); root.Color = Color3.fromRGB(95, 25, 110); root.Material = Enum.Material.Neon; root.Parent = monster
local hum = Instance.new("Humanoid"); hum.WalkSpeed = 13; hum.MaxHealth = 999; hum.Health = 999; hum.Parent = monster
monster.PrimaryPart = root; monster.Parent = world

local function giveFlashlight(player)
    local tool = Instance.new("Tool"); tool.Name = "Flashlight"; tool.RequiresHandle = true; tool.CanBeDropped = false
    local h = Instance.new("Part"); h.Name = "Handle"; h.Size = Vector3.new(1, 1, 3); h.Color = Color3.fromRGB(230, 230, 210); h.Material = Enum.Material.Metal; h.Parent = tool
    local light = Instance.new("SpotLight"); light.Range = 42; light.Angle = 70; light.Brightness = 3; light.Parent = h
    tool.Parent = player:WaitForChild("Backpack")
end
local function setupPlayer(player)
    playerKeys[player.UserId] = 0
    local loadedEscapes = 0
    if dataStore then pcall(function() loadedEscapes = dataStore:GetAsync("horror_" .. player.UserId) or 0 end) end
    local ls = Instance.new("Folder"); ls.Name = "leaderstats"; ls.Parent = player
    local k = Instance.new("IntValue"); k.Name = "Keys"; k.Parent = ls
    local e = Instance.new("IntValue"); e.Name = "Escapes"; e.Value = typeof(loadedEscapes) == "number" and loadedEscapes or 0; e.Parent = ls
    player.CharacterAdded:Connect(function() task.wait(0.5); giveFlashlight(player); HorrorEvent:FireClient(player, {kind="keys", keys=0, total=Config.KeyCount}) end)
    task.defer(function() giveFlashlight(player) end)
end
Players.PlayerAdded:Connect(setupPlayer)
Players.PlayerRemoving:Connect(function(player)
    local ls = player:FindFirstChild("leaderstats")
    local escapes = ls and ls:FindFirstChild("Escapes")
    if dataStore and escapes then pcall(function() dataStore:SetAsync("horror_" .. player.UserId, escapes.Value) end) end
    playerKeys[player.UserId] = nil
end)
for _, p in Players:GetPlayers() do setupPlayer(p) end
task.spawn(function()
    while monster.Parent do
        task.wait(1.2)
        local target, dist
        for _, player in Players:GetPlayers() do
            local char = player.Character; local prt = char and char:FindFirstChild("HumanoidRootPart")
            if prt then
                local d = (prt.Position - root.Position).Magnitude
                if d < 90 and (not dist or d < dist) then target, dist = prt, d end
            end
        end
        if target then
            local path = PathfindingService:CreatePath({AgentRadius=3, AgentHeight=7, AgentCanJump=false})
            local ok = pcall(function() path:ComputeAsync(root.Position, target.Position) end)
            if ok and path.Status == Enum.PathStatus.Success then
                local wp = path:GetWaypoints()[2]
                if wp then hum:MoveTo(wp.Position) end
            else
                hum:MoveTo(target.Position)
            end
            if dist and dist < 8 then
                local plr = Players:GetPlayerFromCharacter(target.Parent)
                if plr then HorrorEvent:FireClient(plr, {kind="scare"}); local h = target.Parent:FindFirstChildOfClass("Humanoid"); if h then h.Health = 0 end end
            end
        end
    end
end)
print("[Horror] " .. Config.Title .. " initialized with flashlight, keys, locked doors, PathfindingService chase")
`;
  const clientScript = `local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local player = Players.LocalPlayer
local event = ReplicatedStorage:WaitForChild("HorrorRemotes"):WaitForChild("HorrorEvent")
local gui = Instance.new("ScreenGui"); gui.Name = "HorrorHUD"; gui.ResetOnSpawn = false; gui.Parent = player:WaitForChild("PlayerGui")
local label = Instance.new("TextLabel"); label.Size = UDim2.new(0, 330, 0, 54); label.Position = UDim2.new(0.5, -165, 0, 18); label.BackgroundColor3 = Color3.fromRGB(8, 8, 12); label.BackgroundTransparency = 0.1; label.TextColor3 = Color3.fromRGB(230, 230, 240); label.TextScaled = true; label.Font = Enum.Font.GothamBold; label.Parent = gui
local flash = Instance.new("TextLabel"); flash.Size = UDim2.fromScale(1, 1); flash.BackgroundColor3 = Color3.fromRGB(120, 0, 0); flash.BackgroundTransparency = 1; flash.Text = "RUN"; flash.TextScaled = true; flash.TextColor3 = Color3.new(1,1,1); flash.Font = Enum.Font.GothamBlack; flash.Parent = gui
event.OnClientEvent:Connect(function(p)
    if p.kind == "keys" then label.Text = "Keys " .. p.keys .. "/" .. p.total .. " | Find the exit"
    elseif p.kind == "locked" then label.Text = "Door locked: " .. p.keys .. "/" .. p.total .. " keys"
    elseif p.kind == "escape" then label.Text = "ESCAPED"
    elseif p.kind == "scare" then flash.BackgroundTransparency = 0.15; task.wait(0.35); flash.BackgroundTransparency = 1 end
end)
`;
  return {
    serverScript,
    additionalScripts: [{ name: 'HorrorHudClient', scriptType: 'LocalScript', container: 'StarterPlayerScripts', source: clientScript }],
  };
}

function buildPvpArenaScript(params: GameTemplateParams): MultiScriptResult {
  const titleLua = safeLuaString(params.title, 'Battle Arena');
  const roundSeconds = params.roundSeconds === 300 ? 300 : 180;
  const spawnCount = params.spawnCount === 12 ? 12 : 8;
  const weaponSetLua = safeLuaString(params.weaponSet, 'sword_bow');
  const serverScript = `local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local DataStoreService = game:GetService("DataStoreService")
local Debris = game:GetService("Debris")

local Config = {Title=${titleLua}, RoundSeconds=${roundSeconds}, SpawnCount=${spawnCount}, WeaponSet=${weaponSetLua}}
local dataStore
local okStore, storeErr = pcall(function()
    dataStore = DataStoreService:GetDataStore("PvPArenaStats_v1")
end)
if not okStore then warn("[PvPArena] DataStore unavailable: " .. tostring(storeErr)) end
local remotes = Instance.new("Folder"); remotes.Name = "ArenaRemotes"; remotes.Parent = ReplicatedStorage
local ArenaEvent = Instance.new("RemoteEvent"); ArenaEvent.Name = "ArenaEvent"; ArenaEvent.Parent = remotes
local world = Instance.new("Folder"); world.Name = "GeneratedPvPArena"; world.Parent = workspace
local roundActive = false
local timeLeft = Config.RoundSeconds

local function part(name, size, pos, color, mat)
    local p = Instance.new("Part"); p.Name = name; p.Size = size; p.Position = pos; p.Anchored = true; p.Color = color; p.Material = mat; p.Parent = world; return p
end
part("ArenaFloor", Vector3.new(130, 1, 130), Vector3.new(0, 0, 0), Color3.fromRGB(55, 58, 66), Enum.Material.Slate)
${worldVisualsLua()}
setupAtmosphere({atmoColor = Color3.fromRGB(150, 158, 178), tint = Color3.fromRGB(250, 250, 252), haze = 1.5, bloom = 0.7, fx = "embers"})
for i = 1, 12 do
    local a = i / 12 * math.pi * 2
    part("ArenaPillar_" .. i, Vector3.new(4, 18, 4), Vector3.new(math.cos(a) * 58, 9, math.sin(a) * 58), Color3.fromRGB(110, 105, 95), Enum.Material.Concrete)
end
for i = 1, 8 do
    local a = i / 8 * math.pi * 2
    part("ArenaCover_" .. i, Vector3.new(10, 7, 10), Vector3.new(math.cos(a) * 28, 3.5, math.sin(a) * 28), Color3.fromRGB(70, 75, 86), Enum.Material.Metal)
end
local spawnPositions = {}
for i = 1, Config.SpawnCount do
    local a = i / Config.SpawnCount * math.pi * 2
    local s = Instance.new("SpawnLocation"); s.Name = "ArenaSpawn_" .. i; s.Size = Vector3.new(10, 1, 10); s.Position = Vector3.new(math.cos(a) * 48, 2, math.sin(a) * 48); s.Anchored = true; s.Color = Color3.fromRGB(70, 180, 255); s.Material = Enum.Material.Neon; s.Parent = world
    table.insert(spawnPositions, s.Position)
end

local function stat(player, name)
    local ls = player:FindFirstChild("leaderstats"); return ls and ls:FindFirstChild(name)
end
local function nearestOpponent(player, range)
    local char = player.Character; local root = char and char:FindFirstChild("HumanoidRootPart"); if not root then return nil end
    local best, bestDist
    for _, other in Players:GetPlayers() do
        if other ~= player and other.Character then
            local oroot = other.Character:FindFirstChild("HumanoidRootPart")
            local ohum = other.Character:FindFirstChildOfClass("Humanoid")
            if oroot and ohum and ohum.Health > 0 then
                local d = (oroot.Position - root.Position).Magnitude
                if d <= range and (not bestDist or d < bestDist) then best, bestDist = ohum, d end
            end
        end
    end
    return best
end
local function makeTool(player, name, damage, range, color)
    local tool = Instance.new("Tool"); tool.Name = name; tool.RequiresHandle = true; tool.CanBeDropped = false
    local h = Instance.new("Part"); h.Name = "Handle"; h.Size = Vector3.new(1, 1, name == "Blaster" and 3 or 4); h.Color = color; h.Material = Enum.Material.Metal; h.Parent = tool
    tool.Activated:Connect(function()
        if not roundActive then return end
        local target = nearestOpponent(player, range)
        if target then
            local before = target.Health
            target:TakeDamage(damage)
            if before > 0 and target.Health <= 0 then local k = stat(player, "Kills"); if k then k.Value += 1 end end
        end
    end)
    tool.Parent = player:WaitForChild("Backpack")
end
local function giveLoadout(player)
    makeTool(player, "Arena Sword", 28, 10, Color3.fromRGB(230, 230, 240))
    if Config.WeaponSet == "magic" then makeTool(player, "Magic Staff", 22, 45, Color3.fromRGB(160, 90, 255))
    elseif Config.WeaponSet == "sword_blaster" then makeTool(player, "Blaster", 18, 55, Color3.fromRGB(80, 200, 255))
    else makeTool(player, "Bow", 20, 45, Color3.fromRGB(160, 100, 55)) end
end
local function setupPlayer(player)
    local loaded = nil
    if dataStore then pcall(function() loaded = dataStore:GetAsync("pvp_" .. player.UserId) end) end
    local ls = Instance.new("Folder"); ls.Name = "leaderstats"; ls.Parent = player
    local k = Instance.new("IntValue"); k.Name = "Kills"; k.Value = typeof(loaded) == "table" and tonumber(loaded.kills) or 0; k.Parent = ls
    local d = Instance.new("IntValue"); d.Name = "Deaths"; d.Value = typeof(loaded) == "table" and tonumber(loaded.deaths) or 0; d.Parent = ls
    player.CharacterAdded:Connect(function(char)
        task.wait(0.4); giveLoadout(player)
        local hum = char:FindFirstChildOfClass("Humanoid")
        if hum then hum.Died:Connect(function() local ds = stat(player, "Deaths"); if ds then ds.Value += 1 end end) end
    end)
end
Players.PlayerAdded:Connect(setupPlayer)
Players.PlayerRemoving:Connect(function(player)
    local kills = stat(player, "Kills")
    local deaths = stat(player, "Deaths")
    if dataStore and kills and deaths then pcall(function() dataStore:SetAsync("pvp_" .. player.UserId, {kills=kills.Value, deaths=deaths.Value}) end) end
end)
for _, p in Players:GetPlayers() do setupPlayer(p) end
task.spawn(function()
    while true do
        roundActive = false; timeLeft = 15; ArenaEvent:FireAllClients({kind="intermission", time=timeLeft, title=Config.Title})
        task.wait(15)
        roundActive = true; timeLeft = Config.RoundSeconds
        for _, p in Players:GetPlayers() do p:LoadCharacter() end
        while timeLeft > 0 do
            ArenaEvent:FireAllClients({kind="round", time=timeLeft, title=Config.Title})
            task.wait(1); timeLeft -= 1
        end
        roundActive = false
        local winner, top = "No one", -1
        for _, p in Players:GetPlayers() do local k = stat(p, "Kills"); if k and k.Value > top then winner, top = p.Name, k.Value end end
        ArenaEvent:FireAllClients({kind="winner", winner=winner, kills=top})
        task.wait(6)
    end
end)
print("[PvPArena] " .. Config.Title .. " initialized with RemoteEvent, server damage, respawns, K/D leaderstats")
`;
  const clientScript = `local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local event = ReplicatedStorage:WaitForChild("ArenaRemotes"):WaitForChild("ArenaEvent")
local gui = Instance.new("ScreenGui"); gui.Name = "ArenaHUD"; gui.ResetOnSpawn = false; gui.Parent = Players.LocalPlayer:WaitForChild("PlayerGui")
local label = Instance.new("TextLabel"); label.Size = UDim2.new(0, 360, 0, 58); label.Position = UDim2.new(0.5, -180, 0, 16); label.BackgroundColor3 = Color3.fromRGB(18, 20, 28); label.BackgroundTransparency = 0.12; label.TextColor3 = Color3.fromRGB(220, 240, 255); label.TextScaled = true; label.Font = Enum.Font.GothamBlack; label.Parent = gui
event.OnClientEvent:Connect(function(p)
    if p.kind == "round" then label.Text = p.title .. " | " .. p.time .. "s"
    elseif p.kind == "intermission" then label.Text = "Intermission"
    elseif p.kind == "winner" then label.Text = "Winner: " .. p.winner .. " (" .. p.kills .. " KOs)" end
end)
`;
  return {
    serverScript,
    additionalScripts: [{ name: 'ArenaHudClient', scriptType: 'LocalScript', container: 'StarterPlayerScripts', source: clientScript }],
  };
}

function buildTowerDefenseScript(params: GameTemplateParams): MultiScriptResult {
  const titleLua = safeLuaString(params.title, 'Tower Defense');
  const waveCount = Math.max(5, Math.min(40, Math.round(Number(params.waveCount) || 15)));
  const towerSlots = Math.max(4, Math.min(10, Math.round(Number(params.towerSlots) || 8)));
  const startingCash = Math.max(50, Math.min(500, Math.round(Number(params.startingCash) || 150)));
  const baseHealth = Math.max(5, Math.min(60, Math.round(Number(params.baseHealth) || 20)));
  const themeRaw = String(params.mapTheme || '').toLowerCase();
  const mapTheme = ['meadow', 'desert', 'candy', 'scifi'].find((t) => themeRaw.includes(t))
    || (/grass|forest|green|meadow|farm/.test(themeRaw) ? 'meadow'
      : /sand|desert|egypt|dune/.test(themeRaw) ? 'desert'
      : /candy|sweet|sugar|dessert/.test(themeRaw) ? 'candy'
      : /space|neon|cyber|sci|tech|robot/.test(themeRaw) ? 'scifi'
      : 'meadow');
  const diffRaw = String(params.difficulty || '').toLowerCase();
  const difficulty = /hard|insane|brutal|nightmare/.test(diffRaw) ? 'hard'
    : /casual|easy|chill|relax/.test(diffRaw) ? 'casual'
    : 'normal';
  const mapThemeLua = safeLuaString(mapTheme, 'meadow');
  const difficultyLua = safeLuaString(difficulty, 'normal');

  // Session 414: per-preset palette override for recognizability. Absent spec →
  // the original meadow/desert/candy/scifi enum themes (no regression).
  const spec = params.gameVisualSpec;
  const specThemeLua = (spec && spec.vibe !== 'neutral')
    ? `{ground=${rgbLua(spec.palette.ground)}, groundMat=Enum.Material.${spec.palette.groundMaterial}, path=${rgbLua(spec.palette.road)}, pathMat=Enum.Material.Ground, base=${rgbLua(spec.palette.wall)}, accent=${rgbLua(spec.palette.accent)}}`
    : 'nil';
  // Session 414b: sky/foliage/centerpiece so a themed preset reads as its theme
  // (99 Nights = dark pine forest at night + campfire), not a sunny meadow.
  const specAtmoLua = spec ? atmosphereOptsLua(spec) : '';
  const tdAtmo = (spec && spec.vibe !== 'neutral') ? spec.atmosphere : undefined;
  const tdTreeKindLua = safeLuaString(tdAtmo?.treeKind || 'round', 'round');
  const tdTreeTrunkLua = tdAtmo ? rgbLua(tdAtmo.treeTrunk) : 'Color3.fromRGB(112, 80, 52)';
  const tdTreeLeafLua = tdAtmo ? rgbLua(tdAtmo.treeLeaf) : 'Color3.fromRGB(78, 142, 70)';

  // Session 417: per-preset enemy pack (3 mobs + boss + silhouette kind + base
  // landmark) + a chosen map layout (разные карты). Brief = title + theme name so
  // the IP is detected even when the GDD omits mapTheme. The meme face decal is
  // WRAPPED on the enemy body surface (SurfaceGui), never a floating billboard.
  const tdBrief = `${params.title || ''} ${spec ? spec.themeName : ''}`;
  const tdVibe = spec ? spec.vibe : 'neutral';
  const tdPack = deriveTdPack(tdBrief, tdVibe);
  const tdMap = deriveTdMap(tdVibe, String(params.title || 'Tower Defense'));
  const tdMapLuaBlock = tdMapLua(tdMap);
  const tdKindLua = safeLuaString(tdPack.kind, 'blob');
  // Session 417b: map a meme enemy name to a real 3D figure builder key so TD
  // enemies become actual creatures (Tralalero shark / Bombardiro croc-plane /
  // Skibidi) instead of a flat box with a face picture. Empty → composite body.
  const tdFigForName = (name: string): string => {
    const n = String(name).toLowerCase();
    if (/tralalero|shark|maw/.test(n)) return 'tralalero';
    if (/bombardiro|crocodil/.test(n)) return 'bombardiro';
    if (/skibidi|toilet/.test(n)) return 'skibidi';
    if (/sigma/.test(n)) return 'sigma';
    return '';
  };
  const tdRosterEntryLua = (e: { name: string; color: number[]; decalId?: number }) =>
    `{name=${safeLuaString(e.name, 'Enemy')}, r=${Math.round(e.color[0])}, g=${Math.round(e.color[1])}, b=${Math.round(e.color[2])}, face=${Math.max(0, Math.floor(Number(e.decalId) || 0))}, fig=${safeLuaString(tdFigForName(e.name), '')}}`;
  const tdPackRosterLua = `{ ${tdPack.enemies.map(tdRosterEntryLua).join(', ')} }`;
  const tdBossLua = tdRosterEntryLua(tdPack.boss);
  // Session 417c: optional real Creator Store brainrot model packs (third-party,
  // public-domain). Used as the PRIMARY enemy source for meme presets when the
  // experience setting "Allow Loading Third Party Assets" is enabled; the
  // composite 3D figures remain the automatic fallback. Only emitted for `meme`.
  const tdMemeAssetsLua = tdPack.kind === 'meme'
    ? '{ 112586636995159, 122979917244614, 108399116162473, 107158060686382, 72466520546640, 84968460904245, 129736155547573, 131938063150331, 132474197060148 }'
    : 'nil';
  // Themed base landmark — pure 3D geometry near `LM` (a point just behind the
  // base). Recognizable silhouette per preset; no floating labels.
  const tdLandmarkLua = ((key: string): string => {
    switch (key) {
      case 'showstage': return `
part("Stage", Vector3.new(28, 2, 16), LM + Vector3.new(0, 1, 0), Color3.fromRGB(58, 30, 32), Enum.Material.WoodPlanks)
part("CurtainL", Vector3.new(2, 17, 15), LM + Vector3.new(-13, 9, 0), Color3.fromRGB(120, 22, 32), Enum.Material.Fabric)
part("CurtainR", Vector3.new(2, 17, 15), LM + Vector3.new(13, 9, 0), Color3.fromRGB(120, 22, 32), Enum.Material.Fabric)
part("Freddy", Vector3.new(5, 7, 4), LM + Vector3.new(0, 5.5, 0), Color3.fromRGB(120, 78, 50), Enum.Material.SmoothPlastic)
part("FreddyHead", Vector3.new(4, 3.4, 3.6), LM + Vector3.new(0, 10.6, 0), Color3.fromRGB(120, 78, 50), Enum.Material.SmoothPlastic)
part("FreddyHat", Vector3.new(4.4, 1.6, 4.4), LM + Vector3.new(0, 12.8, 0), Color3.fromRGB(24, 22, 28), Enum.Material.SmoothPlastic)`;
      case 'warhq': return `
part("HQTower", Vector3.new(16, 30, 16), LM + Vector3.new(0, 15, 0), Color3.fromRGB(96, 100, 110), Enum.Material.Concrete)
for i = 1, 10 do part("HQWin_" .. i, Vector3.new(2.4, 2.4, 0.4), LM + Vector3.new(((i % 2) * 2 - 1) * 4, 6 + math.floor(i / 2) * 5, -8.2), Color3.fromRGB(90, 200, 255), Enum.Material.Neon) end
part("HQAntenna", Vector3.new(0.8, 14, 0.8), LM + Vector3.new(0, 37, 0), Color3.fromRGB(210, 60, 60), Enum.Material.Neon)`;
      case 'schoolhouse': return `
part("SchoolGrass", Vector3.new(26, 1, 22), LM + Vector3.new(0, 0.5, 0), Color3.fromRGB(96, 160, 80), Enum.Material.Grass)
part("School", Vector3.new(22, 14, 18), LM + Vector3.new(0, 7.5, 0), Color3.fromRGB(150, 110, 86), Enum.Material.WoodPlanks)
part("SchoolRoof", Vector3.new(24, 2, 20), LM + Vector3.new(0, 15.5, 0), Color3.fromRGB(120, 60, 50), Enum.Material.SmoothPlastic)
part("Chalkboard", Vector3.new(12, 6, 0.5), LM + Vector3.new(0, 8.5, -9.2), Color3.fromRGB(40, 70, 50), Enum.Material.Slate)`;
      case 'factory': return `
part("FactoryWall", Vector3.new(26, 16, 3), LM + Vector3.new(0, 8, -8), Color3.fromRGB(150, 80, 70), Enum.Material.Brick)
part("FactoryGate", Vector3.new(12, 12, 1), LM + Vector3.new(0, 6, -6.4), Color3.fromRGB(60, 60, 70), Enum.Material.DiamondPlate)
part("HandLogo", Vector3.new(6, 6, 0.6), LM + Vector3.new(0, 13, -6.2), Color3.fromRGB(70, 140, 230), Enum.Material.Neon)
for i = 1, 5 do part("Conveyor_" .. i, Vector3.new(4, 0.6, 3), LM + Vector3.new(-10 + i * 4, 1, 4), Color3.fromRGB(50, 52, 60), Enum.Material.Metal) end`;
      case 'boardwalk': return `
for i = 1, 6 do part("Pier_" .. i, Vector3.new(20, 0.8, 3.4), LM + Vector3.new(0, 1, -10 + i * 4), Color3.fromRGB(150, 110, 70), Enum.Material.WoodPlanks) end
part("PalmTrunk", Vector3.new(1.6, 16, 1.6), LM + Vector3.new(-8, 8, 0), Color3.fromRGB(120, 86, 54), Enum.Material.Wood)
for i = 1, 5 do local a = math.rad(i * 72); part("PalmLeaf_" .. i, Vector3.new(8, 0.6, 2.6), LM + Vector3.new(-8 + math.cos(a) * 4, 16, math.sin(a) * 4), Color3.fromRGB(86, 170, 80), Enum.Material.Grass) end
part("Surfboard", Vector3.new(2.2, 7, 0.6), LM + Vector3.new(8, 4, 0), Color3.fromRGB(240, 90, 120), Enum.Material.SmoothPlastic)`;
      case 'tikihut': return `
part("HutRoof", Vector3.new(18, 3, 18), LM + Vector3.new(0, 11, 0), Color3.fromRGB(150, 120, 70), Enum.Material.Grass)
for _, cx in ipairs({-7, 7}) do for _, cz in ipairs({-7, 7}) do part("HutPole", Vector3.new(1.4, 11, 1.4), LM + Vector3.new(cx, 5.5, cz), Color3.fromRGB(120, 84, 52), Enum.Material.Wood) end end
for _, tx in ipairs({-9, 9}) do part("Torch", Vector3.new(1, 6, 1), LM + Vector3.new(tx, 3, 9), Color3.fromRGB(110, 76, 46), Enum.Material.Wood); local fl = part("TorchFire", Vector3.new(1.4, 1.4, 1.4), LM + Vector3.new(tx, 6.5, 9), Color3.fromRGB(255, 140, 50), Enum.Material.Neon); local f = Instance.new("Fire"); f.Size = 4; f.Parent = fl end`;
      case 'pinethrone': return `
for i = 1, 3 do part("Step_" .. i, Vector3.new(18 - i * 3, 2, 12 - i * 2), LM + Vector3.new(0, i * 2 - 1, 0), Color3.fromRGB(150, 140, 120), Enum.Material.Slate) end
part("Throne", Vector3.new(7, 9, 6), LM + Vector3.new(0, 9.5, 0), Color3.fromRGB(240, 200, 60), Enum.Material.SmoothPlastic)
for i = 1, 5 do local a = math.rad(i * 72); part("ThroneCrown_" .. i, Vector3.new(1.4, 4, 1.4), LM + Vector3.new(math.cos(a) * 2.4, 15, math.sin(a) * 2.4), Color3.fromRGB(90, 170, 80), Enum.Material.Grass) end`;
      case 'campfire': return `
for i = 1, 6 do local a = math.rad(i * 60); local lg = part("CampLog_" .. i, Vector3.new(7, 1.5, 1.5), LM + Vector3.new(math.cos(a) * 2.6, 1, math.sin(a) * 2.6), Color3.fromRGB(86, 58, 38), Enum.Material.Wood); lg.CFrame = CFrame.new(lg.Position) * CFrame.Angles(0, a, math.rad(22)) end
local em = part("CampEmbers", Vector3.new(4.4, 2.4, 4.4), LM + Vector3.new(0, 1.7, 0), Color3.fromRGB(255, 130, 45), Enum.Material.Neon); em.Shape = Enum.PartType.Ball
local pl = Instance.new("PointLight"); pl.Color = Color3.fromRGB(255, 150, 70); pl.Brightness = 4; pl.Range = 40; pl.Parent = em
local fr = Instance.new("Fire"); fr.Heat = 12; fr.Size = 9; fr.Color = Color3.fromRGB(255, 150, 60); fr.SecondaryColor = Color3.fromRGB(255, 88, 30); fr.Parent = em
part("Cabin", Vector3.new(12, 8, 10), LM + Vector3.new(-16, 4, -6), Color3.fromRGB(96, 66, 44), Enum.Material.Wood)`;
      case 'vault': return `
part("VaultBox", Vector3.new(18, 14, 12), LM + Vector3.new(0, 7, 0), Color3.fromRGB(70, 80, 72), Enum.Material.DiamondPlate)
part("VaultDial", Vector3.new(3, 5, 5), LM + Vector3.new(9.5, 7, 0), Color3.fromRGB(230, 190, 70), Enum.Material.Metal)
part("ArchL", Vector3.new(2.4, 14, 2.4), LM + Vector3.new(-12, 7, 8), Color3.fromRGB(70, 132, 232), Enum.Material.Neon)
part("ArchR", Vector3.new(2.4, 14, 2.4), LM + Vector3.new(12, 7, 8), Color3.fromRGB(70, 132, 232), Enum.Material.Neon)
part("ArchTop", Vector3.new(26, 2.4, 2.4), LM + Vector3.new(0, 14, 8), Color3.fromRGB(255, 90, 180), Enum.Material.Neon)`;
      case 'piazza': return `
part("Fountain", Vector3.new(16, 3, 16), LM + Vector3.new(0, 1.5, 0), Color3.fromRGB(170, 160, 140), Enum.Material.Marble)
part("FountainWater", Vector3.new(12, 1, 12), LM + Vector3.new(0, 3.2, 0), Color3.fromRGB(90, 170, 220), Enum.Material.Glass)
part("FountainPillar", Vector3.new(2.4, 8, 2.4), LM + Vector3.new(0, 6, 0), Color3.fromRGB(180, 170, 150), Enum.Material.Marble)
local porb = part("PiazzaOrb", Vector3.new(3.4, 3.4, 3.4), LM + Vector3.new(0, 11, 0), Color3.fromRGB(150, 70, 190), Enum.Material.Neon); porb.Shape = Enum.PartType.Ball`;
      default: return '';
    }
  })(tdPack.landmark);

  const serverScript = `local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local DataStoreService = game:GetService("DataStoreService")
local RunService = game:GetService("RunService")
local Debris = game:GetService("Debris")

local Config = {Title=${titleLua}, WaveCount=${waveCount}, TowerSlots=${towerSlots}, MapTheme=${mapThemeLua}, StartingCash=${startingCash}, BaseHealth=${baseHealth}, Difficulty=${difficultyLua}}

local THEMES = {
    meadow = {ground=Color3.fromRGB(86,150,70), groundMat=Enum.Material.Grass, path=Color3.fromRGB(150,120,80), pathMat=Enum.Material.Ground, base=Color3.fromRGB(70,130,220), accent=Color3.fromRGB(240,230,120)},
    desert = {ground=Color3.fromRGB(214,184,120), groundMat=Enum.Material.Sand, path=Color3.fromRGB(170,140,95), pathMat=Enum.Material.Slate, base=Color3.fromRGB(200,110,60), accent=Color3.fromRGB(120,190,210)},
    candy = {ground=Color3.fromRGB(245,170,205), groundMat=Enum.Material.SmoothPlastic, path=Color3.fromRGB(150,90,200), pathMat=Enum.Material.SmoothPlastic, base=Color3.fromRGB(120,210,255), accent=Color3.fromRGB(255,245,120)},
    scifi = {ground=Color3.fromRGB(40,46,60), groundMat=Enum.Material.Metal, path=Color3.fromRGB(60,70,90), pathMat=Enum.Material.DiamondPlate, base=Color3.fromRGB(60,220,200), accent=Color3.fromRGB(120,160,255)},
}
local theme = THEMES[Config.MapTheme] or THEMES.meadow
local SPEC_THEME = ${specThemeLua}
if SPEC_THEME then theme = SPEC_THEME end
local ENEMY_ROSTER = ${tdPackRosterLua}
local ENEMY_BOSS = ${tdBossLua}
local ENEMY_KIND = ${tdKindLua}
local diffMult = Config.Difficulty == "hard" and 1.5 or (Config.Difficulty == "casual" and 0.7 or 1.0)

local dataStore
local okStore, storeErr = pcall(function() dataStore = DataStoreService:GetDataStore("TowerDefenseStats_v1") end)
if not okStore then warn("[TowerDefense] DataStore unavailable: " .. tostring(storeErr)) end

local remotes = Instance.new("Folder"); remotes.Name = "TdRemotes"; remotes.Parent = ReplicatedStorage
local TdEvent = Instance.new("RemoteEvent"); TdEvent.Name = "TdEvent"; TdEvent.Parent = remotes
local TdBuild = Instance.new("RemoteEvent"); TdBuild.Name = "TdBuild"; TdBuild.Parent = remotes
local world = Instance.new("Folder"); world.Name = "GeneratedTowerDefense"; world.Parent = workspace

local function part(name, size, pos, color, mat, parent)
    local p = Instance.new("Part"); p.Name = name; p.Size = size; p.Position = pos; p.Anchored = true; p.Color = color; p.Material = mat or Enum.Material.SmoothPlastic; p.Parent = parent or world; return p
end

part("TdGround", Vector3.new(280, 1, 210), Vector3.new(0, 0, 0), theme.ground, theme.groundMat)
${worldVisualsLua()}
setupAtmosphere({${specAtmoLua || `atmoColor = theme.accent:Lerp(Color3.fromRGB(205, 205, 210), 0.6), tint = Color3.fromRGB(252, 250, 248), haze = 1.5`}})
for i = 1, 16 do
    local a = math.rad(i * 22.5); local p = Vector3.new(math.cos(a) * (96 + (i % 3) * 10), 0.5, math.sin(a) * (74 + (i % 3) * 8))
    if i % 4 == 0 then makeRock(world, p, 0.7, theme.path) else makeTree(world, p, 0.9, ${tdTreeKindLua}, ${tdTreeTrunkLua}, ${tdTreeLeafLua}) end
end

${tdMapLuaBlock}
local baseCenter = BASE_POS

-- Session 417: build each lane's road (multi-lane maps supported).
for li, lane in ipairs(LANES) do
    for i = 1, #lane - 1 do
        local a = Vector3.new(lane[i].X, 1.5, lane[i].Z)
        local b = Vector3.new(lane[i + 1].X, 1.5, lane[i + 1].Z)
        local seg = Instance.new("Part"); seg.Name = "Road_" .. li .. "_" .. i; seg.Anchored = true; seg.Color = theme.path; seg.Material = theme.pathMat
        seg.Size = Vector3.new(11, 1, (b - a).Magnitude + 9)
        seg.CFrame = CFrame.lookAt((a + b) / 2, b)
        seg.Parent = world
    end
end

local baseCore = part("BaseCore", Vector3.new(18, 18, 18), Vector3.new(baseCenter.X, 9, baseCenter.Z), theme.base, Enum.Material.Neon)
local baseBb = Instance.new("BillboardGui"); baseBb.Size = UDim2.new(0, 170, 0, 42); baseBb.StudsOffset = Vector3.new(0, 13, 0); baseBb.AlwaysOnTop = true; baseBb.Parent = baseCore
local baseLabel = Instance.new("TextLabel"); baseLabel.Size = UDim2.new(1, 0, 1, 0); baseLabel.BackgroundTransparency = 1; baseLabel.TextColor3 = Color3.fromRGB(255, 255, 255); baseLabel.TextStrokeTransparency = 0.3; baseLabel.TextScaled = true; baseLabel.Font = Enum.Font.GothamBlack; baseLabel.Text = "BASE"; baseLabel.Parent = baseBb
local spawnLoc = Instance.new("SpawnLocation"); spawnLoc.Name = "TdSpawn"; spawnLoc.Size = Vector3.new(14, 1, 14); spawnLoc.Position = SPAWN_POS; spawnLoc.Anchored = true; spawnLoc.Color = theme.accent; spawnLoc.Material = Enum.Material.Neon; spawnLoc.Parent = world

-- Session 417: themed base landmark just behind the base (recognizable silhouette per preset).
local LM = Vector3.new(baseCenter.X, 0, baseCenter.Z)
do local d = Vector3.new(baseCenter.X, 0, baseCenter.Z); if d.Magnitude < 1 then d = Vector3.new(0, 0, 1) else d = d.Unit end; LM = Vector3.new(baseCenter.X, 0, baseCenter.Z) + d * 26 end
do
${tdLandmarkLua}
end

-- Session 417: tower slots auto-generated beside every lane segment so any map
-- layout (serpentine / dual / spiral / gauntlet) is automatically playable.
local slotPositions = {}
do
    local seen = {}
    for _, lane in ipairs(LANES) do
        for i = 1, #lane - 1 do
            local a, b = lane[i], lane[i + 1]
            local dir = Vector3.new(b.X - a.X, 0, b.Z - a.Z)
            if dir.Magnitude > 1 then
                dir = dir.Unit
                local perp = Vector3.new(-dir.Z, 0, dir.X)
                local mid = Vector3.new((a.X + b.X) / 2, 3.5, (a.Z + b.Z) / 2)
                for _, s in ipairs({1, -1}) do
                    local sp = mid + perp * (13 * s)
                    if math.abs(sp.X) < 136 and math.abs(sp.Z) < 101 and (sp - Vector3.new(baseCenter.X, 3.5, baseCenter.Z)).Magnitude > 16 then
                        local key = math.floor(sp.X / 7) .. "_" .. math.floor(sp.Z / 7)
                        if not seen[key] then seen[key] = true; slotPositions[#slotPositions + 1] = Vector3.new(sp.X, 3.5, sp.Z) end
                    end
                end
            end
        end
    end
end

local container = world
${meme3dPreludeLua()}

-- Session 417c: optional real Creator Store brainrot models (third-party,
-- public-domain). Needs the experience setting "Allow Loading Third Party
-- Assets". Loaded ONCE at startup into a server-side template pool; cloned per
-- enemy. Scripts are stripped for safety. Falls back to composite 3D figures.
local MEME_ASSET_IDS = ${tdMemeAssetsLua}
local MEME_POOL = {}
local MEME_POOL_BY_NAME = {}
local memePoolReady = false
local function _ensurePrimary(m)
    if m.PrimaryPart and m.PrimaryPart.Parent then return m.PrimaryPart end
    local hrp = m:FindFirstChild("HumanoidRootPart", true)
    if hrp and hrp:IsA("BasePart") then m.PrimaryPart = hrp; return hrp end
    local best, bestVol = nil, -1
    for _, d in ipairs(m:GetDescendants()) do
        if d:IsA("BasePart") then local v = d.Size.X * d.Size.Y * d.Size.Z; if v > bestVol then best, bestVol = d, v end end
    end
    if best then m.PrimaryPart = best end
    return m.PrimaryPart
end
local function _pickMemeTemplate(figKey, ename, idx)
    if #MEME_POOL == 0 then return nil end
    if figKey ~= "" and MEME_POOL_BY_NAME[figKey] then return MEME_POOL_BY_NAME[figKey] end
    local keys = {}
    if figKey ~= "" then keys[#keys + 1] = figKey end
    if ename and ename ~= "" then keys[#keys + 1] = string.lower(ename) end
    for _, key in ipairs(keys) do
        for _, e in ipairs(MEME_POOL) do
            if string.find(e.name, key, 1, true) then return e.model end
        end
    end
    return MEME_POOL[((idx - 1) % #MEME_POOL) + 1].model
end
if MEME_ASSET_IDS then
    task.spawn(function()
        local AssetService = game:GetService("AssetService")
        local ServerStorage = game:GetService("ServerStorage")
        local hold = Instance.new("Folder"); hold.Name = "TdMemeTemplates"; hold.Parent = ServerStorage
        local CAP = 24
        local function addTemplate(m)
            if #MEME_POOL >= CAP or not m or not m:IsA("Model") then return end
            if not _ensurePrimary(m) then return end
            for _, d in ipairs(m:GetDescendants()) do if d:IsA("BaseScript") or d:IsA("ModuleScript") then d:Destroy() end end
            m.Parent = hold
            local nm = string.lower(m.Name)
            MEME_POOL[#MEME_POOL + 1] = {name = nm, model = m}
            if not MEME_POOL_BY_NAME[nm] then MEME_POOL_BY_NAME[nm] = m end
        end
        for _, id in ipairs(MEME_ASSET_IDS) do
            if #MEME_POOL >= CAP then break end
            local ok, container2 = pcall(function() return AssetService:LoadAssetAsync(id) end)
            if ok and container2 then
                local any = false
                for _, k in ipairs(container2:GetChildren()) do if k:IsA("Model") then addTemplate(k); any = true end end
                if not any then addTemplate(container2) end
                if container2.Parent == nil then container2:Destroy() end
            else
                warn("[TowerDefense] LoadAssetAsync " .. tostring(id) .. " failed (third-party asset setting off or asset unavailable)")
            end
            task.wait()
        end
        memePoolReady = #MEME_POOL > 0
        print("[TowerDefense] brainrot asset pool: " .. #MEME_POOL .. " models")
    end)
end

-- Session 417: themed enemy assembly — a multi-part 3D silhouette per "kind".
-- The meme face decal is WRAPPED on the body via a SurfaceGui (never a floating
-- billboard, per user requirement). All parts anchored; the round loop pivots the
-- whole model along its lane.
local function _eAcc(model, core, size, off, color, mat, shape)
    local p = Instance.new("Part"); p.Size = size; p.Color = color; p.Material = mat or Enum.Material.SmoothPlastic
    p.Anchored = true; p.CanCollide = false; p.CastShadow = false
    if shape then p.Shape = shape end
    p.CFrame = core.CFrame * CFrame.new(off)
    p.Parent = model
    return p
end
local function _eFace(core, faceId, faces)
    if not faceId or faceId <= 0 then return end
    for _, nf in ipairs(faces) do
        local sg = Instance.new("SurfaceGui"); sg.Face = nf; sg.CanvasSize = Vector2.new(220, 220); sg.LightInfluence = 0; sg.Parent = core
        local img = Instance.new("ImageLabel"); img.Size = UDim2.new(1, 0, 1, 0); img.BackgroundTransparency = 1
        img.Image = "rbxthumb://type=Asset&id=" .. faceId .. "&w=420&h=420"; img.Parent = sg
    end
end
local function spawnEnemyAssembly(kind, color, faceId, scale, pos, figKey, idx, ename)
    scale = scale or 1
    local model = Instance.new("Model"); model.Name = "Enemy"
    local core = Instance.new("Part"); core.Anchored = true; core.CanCollide = false; core.CastShadow = false
    core.Material = Enum.Material.SmoothPlastic; core.Color = color; core.CFrame = CFrame.new(pos)
    local accent = color:Lerp(Color3.fromRGB(255, 255, 255), 0.25)
    local dark = color:Lerp(Color3.fromRGB(0, 0, 0), 0.4)
    local eye = Color3.fromRGB(255, 70, 50)
    local faces = {Enum.NormalId.Front}
    if kind == "animatronic" then
        core.Size = Vector3.new(4.4, 5.0, 3.2) * scale
        _eAcc(model, core, Vector3.new(1.0, 1.9, 1.0) * scale, Vector3.new(-1.1, 3.0, 0) * scale, color)
        _eAcc(model, core, Vector3.new(1.0, 1.9, 1.0) * scale, Vector3.new(1.1, 3.0, 0) * scale, color)
        _eAcc(model, core, Vector3.new(2.4, 1.4, 0.8) * scale, Vector3.new(0, -0.6, -1.7) * scale, accent)
        _eAcc(model, core, Vector3.new(0.55, 0.55, 0.4) * scale, Vector3.new(-0.7, 1.0, -1.75) * scale, eye, Enum.Material.Neon, Enum.PartType.Ball)
        _eAcc(model, core, Vector3.new(0.55, 0.55, 0.4) * scale, Vector3.new(0.7, 1.0, -1.75) * scale, eye, Enum.Material.Neon, Enum.PartType.Ball)
    elseif kind == "titan" then
        core.Size = Vector3.new(4.2, 9.0, 3.4) * scale
        _eAcc(model, core, Vector3.new(3.0, 3.0, 3.0) * scale, Vector3.new(0, 5.6, 0) * scale, accent)
        _eAcc(model, core, Vector3.new(0.6, 0.6, 0.4) * scale, Vector3.new(-0.7, 6.0, -1.6) * scale, Color3.fromRGB(80, 200, 255), Enum.Material.Neon, Enum.PartType.Ball)
        _eAcc(model, core, Vector3.new(0.6, 0.6, 0.4) * scale, Vector3.new(0.7, 6.0, -1.6) * scale, Color3.fromRGB(80, 200, 255), Enum.Material.Neon, Enum.PartType.Ball)
        _eAcc(model, core, Vector3.new(2.2, 2.2, 1.0) * scale, Vector3.new(0, 1.6, -1.8) * scale, Color3.fromRGB(80, 200, 255), Enum.Material.Neon)
    elseif kind == "voxel" then
        core.Size = Vector3.new(4.0, 4.6, 4.0) * scale
        _eAcc(model, core, Vector3.new(3.4, 3.4, 3.4) * scale, Vector3.new(0, 4.0, 0) * scale, accent)
        _eAcc(model, core, Vector3.new(1.2, 3.6, 1.2) * scale, Vector3.new(-2.6, 0.4, 0) * scale, color)
        _eAcc(model, core, Vector3.new(1.2, 3.6, 1.2) * scale, Vector3.new(2.6, 0.4, 0) * scale, color)
        _eAcc(model, core, Vector3.new(0.5, 0.5, 0.4) * scale, Vector3.new(-0.8, 4.4, -1.75) * scale, Color3.fromRGB(120, 240, 255), Enum.Material.Neon)
        _eAcc(model, core, Vector3.new(0.5, 0.5, 0.4) * scale, Vector3.new(0.8, 4.4, -1.75) * scale, Color3.fromRGB(120, 240, 255), Enum.Material.Neon)
    elseif kind == "toy" then
        core.Size = Vector3.new(2.8, 7.0, 2.8) * scale
        _eAcc(model, core, Vector3.new(2.6, 2.6, 2.6) * scale, Vector3.new(0, 4.3, 0) * scale, accent)
        _eAcc(model, core, Vector3.new(0.7, 0.7, 0.5) * scale, Vector3.new(-0.6, 4.7, -1.3) * scale, eye, Enum.Material.Neon, Enum.PartType.Ball)
        _eAcc(model, core, Vector3.new(0.7, 0.7, 0.5) * scale, Vector3.new(0.6, 4.7, -1.3) * scale, eye, Enum.Material.Neon, Enum.PartType.Ball)
        _eAcc(model, core, Vector3.new(0.7, 5.2, 0.7) * scale, Vector3.new(-2.0, 0.6, 0) * scale, color)
        _eAcc(model, core, Vector3.new(0.7, 5.2, 0.7) * scale, Vector3.new(2.0, 0.6, 0) * scale, color)
    elseif kind == "wolf" then
        core.Size = Vector3.new(2.8, 2.6, 6.0) * scale
        _eAcc(model, core, Vector3.new(2.4, 2.2, 2.2) * scale, Vector3.new(0, 0.8, -3.4) * scale, accent)
        _eAcc(model, core, Vector3.new(0.5, 0.5, 0.4) * scale, Vector3.new(-0.6, 1.4, -4.4) * scale, Color3.fromRGB(255, 220, 60), Enum.Material.Neon, Enum.PartType.Ball)
        _eAcc(model, core, Vector3.new(0.5, 0.5, 0.4) * scale, Vector3.new(0.6, 1.4, -4.4) * scale, Color3.fromRGB(255, 220, 60), Enum.Material.Neon, Enum.PartType.Ball)
        _eAcc(model, core, Vector3.new(0.8, 2.4, 0.8) * scale, Vector3.new(-1.0, -2.2, -2.0) * scale, dark)
        _eAcc(model, core, Vector3.new(0.8, 2.4, 0.8) * scale, Vector3.new(1.0, -2.2, -2.0) * scale, dark)
        _eAcc(model, core, Vector3.new(0.8, 2.4, 0.8) * scale, Vector3.new(-1.0, -2.2, 2.0) * scale, dark)
        _eAcc(model, core, Vector3.new(0.8, 2.4, 0.8) * scale, Vector3.new(1.0, -2.2, 2.0) * scale, dark)
    elseif kind == "fruit" then
        core.Size = Vector3.new(3.0, 4.4, 3.0) * scale
        _eAcc(model, core, Vector3.new(1.4, 1.8, 1.4) * scale, Vector3.new(0, 2.8, 0) * scale, Color3.fromRGB(90, 170, 80))
        _eAcc(model, core, Vector3.new(0.5, 0.5, 0.4) * scale, Vector3.new(-0.7, 0.6, -1.5) * scale, Color3.fromRGB(30, 30, 35), Enum.Material.SmoothPlastic, Enum.PartType.Ball)
        _eAcc(model, core, Vector3.new(0.5, 0.5, 0.4) * scale, Vector3.new(0.7, 0.6, -1.5) * scale, Color3.fromRGB(30, 30, 35), Enum.Material.SmoothPlastic, Enum.PartType.Ball)
    elseif kind == "challenger" then
        core.Size = Vector3.new(3.0, 5.0, 2.2) * scale
        _eAcc(model, core, Vector3.new(2.2, 2.2, 2.2) * scale, Vector3.new(0, 3.6, 0) * scale, accent)
        _eAcc(model, core, Vector3.new(1.6, 1.6, 0.4) * scale, Vector3.new(0, 0.4, -1.2) * scale, Color3.fromRGB(70, 210, 90), Enum.Material.Neon)
    elseif kind == "meme" then
        -- (1) real Creator Store brainrot model from the loaded pool;
        -- (2) composite 3D figure (shark/croc/skibidi); (3) composite box.
        if memePoolReady then
            local tmpl = _pickMemeTemplate(figKey, ename, idx or 1)
            if tmpl then
                local clone = tmpl:Clone()
                local prim = clone.PrimaryPart or _ensurePrimary(clone)
                if prim then
                    pcall(function()
                        local _, bsz = clone:GetBoundingBox()
                        local sf = (bsz.Y > 0.1) and math.clamp((7 * scale) / bsz.Y, 0.15, 6) or 1
                        clone:ScaleTo(sf)
                    end)
                    for _, d in ipairs(clone:GetDescendants()) do
                        if d:IsA("BasePart") then d.Anchored = true; d.CanCollide = false; d.CastShadow = false
                        elseif d:IsA("Humanoid") then d.EvaluateStateMachine = false end
                    end
                    clone:PivotTo(CFrame.new(pos))
                    clone.Parent = world
                    model:Destroy(); core:Destroy()
                    return clone, prim, true
                end
                clone:Destroy()
            end
        end
        if figKey and figKey ~= "" then
            local fm, fcore = buildMeme3dFigureMoving(figKey, pos, idx or 1)
            if fm and fcore then
                pcall(function() fm:ScaleTo(scale * 1.45) end)
                model:Destroy()
                return fm, fcore, true
            end
        end
        core.Size = Vector3.new(3.0, 2.8, 6.2) * scale
        _eAcc(model, core, Vector3.new(1.2, 2.2, 2.2) * scale, Vector3.new(0, 2.0, 0.6) * scale, color)
        _eAcc(model, core, Vector3.new(1.0, 0.6, 1.8) * scale, Vector3.new(-1.0, -1.4, 2.6) * scale, Color3.fromRGB(240, 240, 240))
        _eAcc(model, core, Vector3.new(1.0, 0.6, 1.8) * scale, Vector3.new(1.0, -1.4, 2.6) * scale, Color3.fromRGB(240, 240, 240))
        faces = {Enum.NormalId.Front, Enum.NormalId.Back}
    else
        core.Size = Vector3.new(4, 4, 4) * scale
    end
    core.Parent = model
    model.PrimaryPart = core
    _eFace(core, faceId, faces)
    model.Parent = world
    return model, core
end

local baseHealth = Config.BaseHealth
local currentWave = 0
local phase = "idle"
local gameOver = false
local coopScale = 1
local enemySpawnCount = 0
local enemies = {}
local towers = {}
local slots = {}
local selectedType = {}
local TOWER_TYPES = {
    cannon = {cost=50, damage=12, range=28, fireRate=0.7, color=Color3.fromRGB(90,150,230), label="Cannon"},
    sniper = {cost=120, damage=42, range=64, fireRate=1.6, color=Color3.fromRGB(80,210,140), label="Sniper"},
    splash = {cost=200, damage=18, range=30, fireRate=1.1, splash=12, color=Color3.fromRGB(240,150,70), label="Splash"},
    frost = {cost=160, damage=6, range=34, fireRate=1.0, slow=0.5, slowDur=1.5, color=Color3.fromRGB(120,210,255), label="Frost"},
}
local MAX_TOWER_LEVEL = 5

local function getCash(player)
    local ls = player:FindFirstChild("leaderstats"); local c = ls and ls:FindFirstChild("Cash"); return c and c.Value or 0
end
local function addCash(player, amount)
    local ls = player:FindFirstChild("leaderstats"); local c = ls and ls:FindFirstChild("Cash"); if c then c.Value = math.max(0, c.Value + amount) end
end
local function fireBeam(from, to, color)
    local b = Instance.new("Part"); b.Anchored = true; b.CanCollide = false; b.Material = Enum.Material.Neon; b.Color = color
    b.Size = Vector3.new(0.4, 0.4, (to - from).Magnitude); b.CFrame = CFrame.lookAt((from + to) / 2, to); b.Parent = world
    Debris:AddItem(b, 0.08)
end
local function buildTowerVisual(slot, def)
    -- Session 417b: a proper turret silhouette — dark pedestal + metal column +
    -- glowing dome housing (lit) + a long neon barrel that aims at the target.
    -- Decoration parented to the base so a round reset (base:Destroy()) cascades.
    local p = slot.part.Position
    local base = part("TowerBase_" .. slot.index, Vector3.new(5.6, 3, 5.6), p + Vector3.new(0, 2, 0), def.color:Lerp(Color3.fromRGB(0, 0, 0), 0.42), Enum.Material.Metal)
    local col = part("TowerCol_" .. slot.index, Vector3.new(3.2, 3, 3.2), p + Vector3.new(0, 4.6, 0), def.color:Lerp(Color3.fromRGB(0, 0, 0), 0.12), Enum.Material.Metal); col.Parent = base
    local dome = part("TowerDome_" .. slot.index, Vector3.new(4.4, 4, 4.4), p + Vector3.new(0, 6.4, 0), def.color, Enum.Material.SmoothPlastic); dome.Shape = Enum.PartType.Ball; dome.Parent = base
    local pl = Instance.new("PointLight"); pl.Color = def.color; pl.Brightness = 1.6; pl.Range = 16; pl.Parent = dome
    local fin = part("TowerFin_" .. slot.index, Vector3.new(5.8, 0.6, 1.4), p + Vector3.new(0, 3.7, 0), def.color, Enum.Material.Neon); fin.Parent = base
    local turret = part("TowerGun_" .. slot.index, Vector3.new(1.8, 1.8, 8), p + Vector3.new(0, 6.6, 3.6), def.color:Lerp(Color3.new(1, 1, 1), 0.45), Enum.Material.Neon)
    turret.CanCollide = false
    return base, turret
end
local function handleSlotTrigger(player, slot)
    if gameOver then return end
    if slot.tower then
        local t = slot.tower
        if t.level >= MAX_TOWER_LEVEL then
            TdEvent:FireClient(player, {kind="toast", text=t.def.label .. " is MAX (Lv" .. t.level .. ")"})
            return
        end
        local upCost = t.def.cost * (t.level + 1)
        if getCash(player) >= upCost then
            addCash(player, -upCost)
            t.level += 1
            t.damage = t.def.damage * (1 + 0.6 * (t.level - 1))
            t.range = t.def.range * (1 + 0.1 * (t.level - 1))
            -- Session 417: visual upgrade tier — grow the turret + stack a glowing plate.
            t.turret.Size = t.turret.Size + Vector3.new(0.3, 0.3, 0.6)
            local plate = part("TowerTier_" .. slot.index .. "_" .. t.level, Vector3.new(6.4, 0.4, 6.4), t.base.Position + Vector3.new(0, -2.8 + (t.level - 1) * 0.5, 0), t.def.color:Lerp(Color3.fromRGB(255, 255, 255), 0.4), Enum.Material.Neon)
            plate.CanCollide = false
            slot.prompt.ActionText = (t.level >= MAX_TOWER_LEVEL) and "MAX" or ("Upgrade Lv" .. (t.level + 1))
            slot.prompt.ObjectText = t.def.label .. " Lv" .. t.level
        else
            TdEvent:FireClient(player, {kind="toast", text="Need $" .. upCost .. " to upgrade"})
        end
        return
    end
    local typeName = selectedType[player] or "cannon"
    local def = TOWER_TYPES[typeName]
    if not def then return end
    if getCash(player) < def.cost then
        TdEvent:FireClient(player, {kind="toast", text="Not enough cash for " .. def.label})
        return
    end
    addCash(player, -def.cost)
    local base, turret = buildTowerVisual(slot, def)
    slot.tower = {def=def, type=typeName, level=1, damage=def.damage, range=def.range, fireRate=def.fireRate, splash=def.splash, slow=def.slow, slowDur=def.slowDur, cooldown=0, owner=player, base=base, turret=turret}
    table.insert(towers, slot.tower)
    slot.prompt.ActionText = "Upgrade Lv2"
    slot.prompt.ObjectText = def.label .. " Lv1"
end

for i = 1, math.min(Config.TowerSlots, #slotPositions) do
    local pad = part("TowerSlot_" .. i, Vector3.new(8, 1, 8), slotPositions[i], theme.accent, Enum.Material.Metal)
    pad.Transparency = 0.35
    local ring = Instance.new("SelectionBox"); ring.Adornee = pad; ring.Color3 = theme.accent; ring.LineThickness = 0.05; ring.Parent = pad
    local prompt = Instance.new("ProximityPrompt"); prompt.ActionText = "Build Tower"; prompt.ObjectText = "Empty Slot"; prompt.HoldDuration = 0.15; prompt.MaxActivationDistance = 16; prompt.RequiresLineOfSight = false; prompt.Parent = pad
    local slot = {part=pad, prompt=prompt, tower=nil, index=i}
    slots[i] = slot
    prompt.Triggered:Connect(function(player) handleSlotTrigger(player, slot) end)
end

TdBuild.OnServerEvent:Connect(function(player, payload)
    if typeof(payload) ~= "table" then return end
    if payload.action == "select" and TOWER_TYPES[payload.tower] then selectedType[player] = payload.tower end
end)

local function killEnemy(e, idx, killer)
    if killer then addCash(killer, e.reward) end
    if e.model then e.model:Destroy() end
    table.remove(enemies, idx)
end
local function spawnEnemy(wave, isBoss, laneIdx)
    laneIdx = laneIdx or 1
    local lane = LANES[laneIdx] or LANES[1]
    local hp = math.floor((38 + wave * 14) * diffMult * coopScale * (isBoss and 6 or 1))
    local speed = math.min(26, 13 + wave * 0.4) * (isBoss and 0.6 or 1)
    local reward = math.floor((10 + wave * 1.5) * (isBoss and 8 or 1))
    local dmg = isBoss and 5 or 1
    local scale = isBoss and 2.6 or 1.0
    local ec = isBoss and ENEMY_BOSS or (ENEMY_ROSTER[((wave - 1) % #ENEMY_ROSTER) + 1] or ENEMY_BOSS)
    local ecol = Color3.fromRGB(ec.r, ec.g, ec.b)
    enemySpawnCount += 1
    local model, core, isFigure = spawnEnemyAssembly(ENEMY_KIND, ecol, ec.face or 0, scale, lane[1] + Vector3.new(0, scale * 2, 0), ec.fig or "", enemySpawnCount, ec.name or "")
    local footOffset, topY
    if isFigure then
        local bcf, bsz = model:GetBoundingBox()
        local primY = model.PrimaryPart.Position.Y
        footOffset = primY - (bcf.Position.Y - bsz.Y / 2)
        topY = (bcf.Position.Y + bsz.Y / 2) - primY + 1.2
    else
        footOffset = core.Size.Y / 2
        topY = core.Size.Y / 2 + 1.6
    end
    local bb = Instance.new("BillboardGui"); bb.Size = UDim2.new(0, 58, 0, 8); bb.StudsOffset = Vector3.new(0, topY, 0); bb.AlwaysOnTop = true; bb.Parent = core
    local bg = Instance.new("Frame"); bg.Size = UDim2.new(1, 0, 1, 0); bg.BackgroundColor3 = Color3.fromRGB(25, 25, 30); bg.BorderSizePixel = 0; bg.Parent = bb
    local fill = Instance.new("Frame"); fill.Size = UDim2.new(1, 0, 1, 0); fill.BackgroundColor3 = isBoss and Color3.fromRGB(255, 90, 90) or Color3.fromRGB(90, 220, 90); fill.BorderSizePixel = 0; fill.Parent = bg
    if isBoss then
        local nb = Instance.new("BillboardGui"); nb.Size = UDim2.new(0, 160, 0, 24); nb.StudsOffset = Vector3.new(0, topY + 2.6, 0); nb.AlwaysOnTop = true; nb.Parent = core
        local nt = Instance.new("TextLabel"); nt.Size = UDim2.new(1, 0, 1, 0); nt.BackgroundTransparency = 1; nt.TextColor3 = Color3.fromRGB(255, 210, 120); nt.TextStrokeTransparency = 0.3; nt.TextScaled = true; nt.Font = Enum.Font.GothamBlack; nt.Text = "★ " .. (ec.name or "BOSS"); nt.Parent = nb
    end
    table.insert(enemies, {model=model, core=core, health=hp, maxHealth=hp, lane=laneIdx, segment=1, t=0, speed=speed, baseSpeed=speed, reward=reward, damage=dmg, fill=fill, boss=isBoss, slowUntil=0, slowMul=1, footOffset=footOffset, noFaceTravel=isFigure})
end

local function broadcast(phaseName, timeLeft)
    baseLabel.Text = "BASE " .. math.max(0, baseHealth) .. "/" .. Config.BaseHealth
    TdEvent:FireAllClients({kind="state", wave=currentWave, total=Config.WaveCount, baseHp=math.max(0, baseHealth), baseMax=Config.BaseHealth, phase=phaseName, time=timeLeft or 0, title=Config.Title, players=#Players:GetPlayers()})
end

local function saveBest(player)
    local ls = player:FindFirstChild("leaderstats"); local bw = ls and ls:FindFirstChild("Best Wave")
    if dataStore and bw then pcall(function() dataStore:SetAsync("td_" .. player.UserId, bw.Value) end) end
end
local function setupPlayer(player)
    selectedType[player] = "cannon"
    local best = 0
    if dataStore then pcall(function() local v = dataStore:GetAsync("td_" .. player.UserId); if typeof(v) == "number" then best = v end end) end
    local ls = Instance.new("Folder"); ls.Name = "leaderstats"; ls.Parent = player
    local cash = Instance.new("IntValue"); cash.Name = "Cash"; cash.Value = Config.StartingCash; cash.Parent = ls
    local bw = Instance.new("IntValue"); bw.Name = "Best Wave"; bw.Value = best; bw.Parent = ls
end
Players.PlayerAdded:Connect(setupPlayer)
Players.PlayerRemoving:Connect(function(player) saveBest(player); selectedType[player] = nil end)
for _, p in Players:GetPlayers() do setupPlayer(p) end

RunService.Heartbeat:Connect(function(dt)
    local nowC = os.clock()
    for i = #enemies, 1, -1 do
        local e = enemies[i]
        local lane = LANES[e.lane] or LANES[1]
        local a = lane[e.segment]
        local b = lane[e.segment + 1]
        if not b then
            baseHealth = math.max(0, baseHealth - e.damage)
            if e.model then e.model:Destroy() end
            table.remove(enemies, i)
        else
            local sp = e.speed
            if e.slowUntil > nowC then sp = sp * e.slowMul end
            e.t += (dt * sp) / math.max(1, (b - a).Magnitude)
            if e.t >= 1 then e.segment += 1; e.t = 0 end
            if e.model and e.model.PrimaryPart then
                local pos = a:Lerp(b, math.clamp(e.t, 0, 1)) + Vector3.new(0, e.footOffset or 2, 0)
                local dir = Vector3.new(b.X - a.X, 0, b.Z - a.Z)
                if e.noFaceTravel or dir.Magnitude <= 0.05 then e.model:PivotTo(CFrame.new(pos)) else e.model:PivotTo(CFrame.lookAt(pos, pos + dir)) end
            end
        end
    end
    for _, t in ipairs(towers) do
        t.cooldown = math.max(0, t.cooldown - dt)
        if t.cooldown <= 0 and #enemies > 0 then
            local target, tIdx, bestDist
            local origin = t.base.Position
            for i, e in ipairs(enemies) do
                if e.core then
                    local d = (e.core.Position - origin).Magnitude
                    if d <= t.range and (not bestDist or d < bestDist) then target, tIdx, bestDist = e, i, d end
                end
            end
            if target then
                t.cooldown = t.fireRate
                t.turret.CFrame = CFrame.lookAt(t.turret.Position, target.core.Position)
                fireBeam(origin + Vector3.new(0, 4, 0), target.core.Position, t.def.color)
                local function applyHit(e2, i2)
                    e2.health -= t.damage
                    e2.fill.Size = UDim2.new(math.clamp(e2.health / e2.maxHealth, 0, 1), 0, 1, 0)
                    if t.slow and not e2.boss then e2.slowUntil = nowC + (t.slowDur or 1.2); e2.slowMul = t.slow end
                    if e2.health <= 0 then killEnemy(e2, i2, t.owner) end
                end
                if t.splash then
                    local center = target.core.Position
                    applyHit(target, tIdx)
                    for i = #enemies, 1, -1 do
                        local e2 = enemies[i]
                        if e2 ~= target and e2.core and (e2.core.Position - center).Magnitude <= t.splash then applyHit(e2, i) end
                    end
                else
                    applyHit(target, tIdx)
                end
            end
        end
    end
end)

task.spawn(function()
    while true do
        baseHealth = Config.BaseHealth; currentWave = 0; gameOver = false
        for _, e in ipairs(enemies) do if e.model then e.model:Destroy() end end
        table.clear(enemies)
        for _, t in ipairs(towers) do if t.base then t.base:Destroy() end; if t.turret then t.turret:Destroy() end end
        table.clear(towers)
        for _, s in ipairs(slots) do s.tower = nil; s.prompt.ActionText = "Build Tower"; s.prompt.ObjectText = "Empty Slot" end
        for _, p in Players:GetPlayers() do local ls = p:FindFirstChild("leaderstats"); local c = ls and ls:FindFirstChild("Cash"); if c then c.Value = Config.StartingCash end end
        phase = "intermission"; broadcast("intermission", 3); task.wait(3)
        while currentWave < Config.WaveCount and not gameOver do
            currentWave += 1
            coopScale = 1 + 0.45 * math.max(0, #Players:GetPlayers() - 1)
            phase = "intermission"
            for t = 8, 1, -1 do if gameOver then break end; broadcast("intermission", t); task.wait(1) end
            phase = "wave"; broadcast("wave", 0)
            local isBossWave = (currentWave % 5 == 0)
            local count = 6 + currentWave * 2
            for n = 1, count do
                if gameOver or baseHealth <= 0 then break end
                spawnEnemy(currentWave, false, ((n - 1) % #LANES) + 1)
                task.wait(math.max(0.3, 1.0 - currentWave * 0.03))
            end
            if isBossWave and not gameOver and baseHealth > 0 then
                TdEvent:FireAllClients({kind="boss", name=ENEMY_BOSS.name or "BOSS", wave=currentWave})
                spawnEnemy(currentWave, true, 1)
            end
            while #enemies > 0 and baseHealth > 0 do broadcast("wave", 0); task.wait(0.4) end
            if baseHealth <= 0 then gameOver = true; break end
            for _, p in Players:GetPlayers() do
                addCash(p, 40 + currentWave * 5)
                local ls = p:FindFirstChild("leaderstats"); local bw = ls and ls:FindFirstChild("Best Wave")
                if bw and currentWave > bw.Value then bw.Value = currentWave end
            end
        end
        if not gameOver and baseHealth > 0 then
            phase = "victory"; broadcast("victory", 0)
            for _, p in Players:GetPlayers() do local ls = p:FindFirstChild("leaderstats"); local bw = ls and ls:FindFirstChild("Best Wave"); if bw and Config.WaveCount > bw.Value then bw.Value = Config.WaveCount end; saveBest(p) end
            task.wait(10)
        else
            phase = "gameover"; broadcast("gameover", 0)
            for _, p in Players:GetPlayers() do saveBest(p) end
            task.wait(8)
        end
    end
end)
print("[TowerDefense] " .. Config.Title .. " ready: " .. Config.WaveCount .. " waves, " .. Config.TowerSlots .. " tower slots, theme=" .. Config.MapTheme)
`;
  const clientScript = `local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local player = Players.LocalPlayer
local remotes = ReplicatedStorage:WaitForChild("TdRemotes")
local TdEvent = remotes:WaitForChild("TdEvent")
local TdBuild = remotes:WaitForChild("TdBuild")

local gui = Instance.new("ScreenGui"); gui.Name = "TowerDefenseHUD"; gui.ResetOnSpawn = false; gui.IgnoreGuiInset = true; gui.Parent = player:WaitForChild("PlayerGui")
local top = Instance.new("TextLabel"); top.Size = UDim2.new(0, 460, 0, 54); top.Position = UDim2.new(0.5, -230, 0, 12); top.BackgroundColor3 = Color3.fromRGB(16, 18, 26); top.BackgroundTransparency = 0.1; top.TextColor3 = Color3.fromRGB(225, 240, 255); top.TextScaled = true; top.Font = Enum.Font.GothamBlack; top.Text = "Tower Defense"; top.Parent = gui
local topCorner = Instance.new("UICorner"); topCorner.CornerRadius = UDim.new(0, 10); topCorner.Parent = top
local cashLabel = Instance.new("TextLabel"); cashLabel.Size = UDim2.new(0, 170, 0, 40); cashLabel.Position = UDim2.new(1, -186, 0, 12); cashLabel.BackgroundColor3 = Color3.fromRGB(20, 40, 28); cashLabel.BackgroundTransparency = 0.1; cashLabel.TextColor3 = Color3.fromRGB(140, 255, 170); cashLabel.TextScaled = true; cashLabel.Font = Enum.Font.GothamBold; cashLabel.Text = "$0"; cashLabel.Parent = gui
local cashCorner = Instance.new("UICorner"); cashCorner.CornerRadius = UDim.new(0, 10); cashCorner.Parent = cashLabel
local toast = Instance.new("TextLabel"); toast.Size = UDim2.new(0, 380, 0, 36); toast.Position = UDim2.new(0.5, -190, 0, 74); toast.BackgroundColor3 = Color3.fromRGB(60, 22, 22); toast.BackgroundTransparency = 0.12; toast.TextColor3 = Color3.fromRGB(255, 205, 205); toast.TextScaled = true; toast.Font = Enum.Font.GothamBold; toast.Visible = false; toast.Parent = gui
local toastCorner = Instance.new("UICorner"); toastCorner.CornerRadius = UDim.new(0, 8); toastCorner.Parent = toast
local coopLabel = Instance.new("TextLabel"); coopLabel.Size = UDim2.new(0, 150, 0, 30); coopLabel.Position = UDim2.new(0, 12, 0, 12); coopLabel.BackgroundColor3 = Color3.fromRGB(22, 30, 44); coopLabel.BackgroundTransparency = 0.15; coopLabel.TextColor3 = Color3.fromRGB(150, 200, 255); coopLabel.TextScaled = true; coopLabel.Font = Enum.Font.GothamBold; coopLabel.Text = "Co-op: 1"; coopLabel.Parent = gui
local coopCorner = Instance.new("UICorner"); coopCorner.CornerRadius = UDim.new(0, 8); coopCorner.Parent = coopLabel

local towerDefs = {{id="cannon", label="Cannon $50", color=Color3.fromRGB(90,150,230)}, {id="sniper", label="Sniper $120", color=Color3.fromRGB(80,210,140)}, {id="splash", label="Splash $200", color=Color3.fromRGB(240,150,70)}, {id="frost", label="Frost $160", color=Color3.fromRGB(120,210,255)}}
local strokes = {}
for i, def in ipairs(towerDefs) do
    local b = Instance.new("TextButton"); b.Size = UDim2.new(0, 140, 0, 50); b.Position = UDim2.new(0.5, -296 + (i - 1) * 148, 1, -66); b.BackgroundColor3 = def.color; b.TextColor3 = Color3.fromRGB(18, 20, 30); b.TextScaled = true; b.Font = Enum.Font.GothamBold; b.Text = def.label; b.Parent = gui
    local bc = Instance.new("UICorner"); bc.CornerRadius = UDim.new(0, 8); bc.Parent = b
    local stroke = Instance.new("UIStroke"); stroke.Thickness = (def.id == "cannon") and 3 or 0; stroke.Color = Color3.fromRGB(255, 255, 255); stroke.Parent = b
    strokes[def.id] = stroke
    b.Activated:Connect(function()
        TdBuild:FireServer({action="select", tower=def.id})
        for id, s in pairs(strokes) do s.Thickness = (id == def.id) and 3 or 0 end
    end)
end
local hint = Instance.new("TextLabel"); hint.Size = UDim2.new(0, 500, 0, 22); hint.Position = UDim2.new(0.5, -250, 1, -92); hint.BackgroundTransparency = 1; hint.TextColor3 = Color3.fromRGB(205, 218, 235); hint.TextScaled = true; hint.Font = Enum.Font.Gotham; hint.Text = "Pick a tower, walk to a glowing slot, hold the prompt. Re-trigger to upgrade."; hint.Parent = gui
TdBuild:FireServer({action="select", tower="cannon"})

task.spawn(function()
    while not player:FindFirstChild("leaderstats") do task.wait(0.2) end
    local c = player.leaderstats:WaitForChild("Cash")
    local function render() cashLabel.Text = "$" .. c.Value end
    render(); c.Changed:Connect(render)
end)

TdEvent.OnClientEvent:Connect(function(p)
    if p.kind == "state" then
        if p.players then coopLabel.Text = (p.players > 1) and ("Co-op: " .. p.players) or "Solo" end
        if p.phase == "intermission" then top.Text = "Wave " .. p.wave .. "/" .. p.total .. " | Build! " .. p.time .. "s | Base " .. p.baseHp .. "/" .. p.baseMax
        elseif p.phase == "wave" then top.Text = "Wave " .. p.wave .. "/" .. p.total .. " | Base HP " .. p.baseHp .. "/" .. p.baseMax
        elseif p.phase == "victory" then top.Text = "VICTORY! Defended all " .. p.total .. " waves!"
        elseif p.phase == "gameover" then top.Text = "BASE DESTROYED - reached wave " .. p.wave .. ". Restarting..." end
    elseif p.kind == "boss" then
        toast.Text = "BOSS INCOMING: " .. (p.name or "Boss") .. "!"; toast.Visible = true
        task.delay(3, function() toast.Visible = false end)
    elseif p.kind == "toast" then
        toast.Text = p.text; toast.Visible = true
        task.delay(2, function() toast.Visible = false end)
    end
end)
`;
  return {
    serverScript,
    additionalScripts: [{ name: 'TowerDefenseHudClient', scriptType: 'LocalScript', container: 'StarterPlayerScripts', source: clientScript }],
  };
}

// Session 399 (cont.): Roleplay / Town — persistent social world. Deterministic
// town (plaza + roads + 6 named buildings), job pads that pay cash on a shift,
// a role shop (Citizen/VIP/Tycoon/Legend), flavor NPCs, day/night cycle, and
// leaderstats Cash+Role persisted via DataStore. No round loop — it's a hangout.
function buildRoleplayTownScript(params: GameTemplateParams): MultiScriptResult {
  const titleLua = safeLuaString(params.title, 'Town RP');
  const startingCash = Math.max(0, Math.min(5000, Math.round(Number(params.startingCash) || 150)));
  const jobCount = Math.max(2, Math.min(6, Math.round(Number(params.jobCount) || 4)));
  const themeRaw = String(params.mapTheme || '').toLowerCase();
  const townTheme = ['suburb', 'city', 'medieval', 'modern'].find((t) => themeRaw.includes(t))
    || (/medieval|castle|fantasy|village|old/.test(themeRaw) ? 'medieval'
      : /city|urban|downtown|metro|skyscraper/.test(themeRaw) ? 'city'
      : /modern|future|neon|tech|sleek/.test(themeRaw) ? 'modern'
      : 'suburb');
  const themeLua = safeLuaString(townTheme, 'suburb');

  // Session 414: per-preset recognizability. When a derived visual spec is
  // present, override palette + building names/signs + job names + NPC lines +
  // hub label with theme-specific values so a "Millionaire School" no longer
  // looks identical to a "Monster Neighborhood". Absent → original hardcoded
  // suburb/city/medieval/modern behaviour (no regression).
  const spec = params.gameVisualSpec;
  const specThemeLua = spec
    ? `{ground=${rgbLua(spec.palette.ground)}, groundMat=Enum.Material.${spec.palette.groundMaterial}, road=${rgbLua(spec.palette.road)}, plaza=${rgbLua(spec.palette.plaza)}, wall=${rgbLua(spec.palette.wall)}, roof=${rgbLua(spec.palette.roof)}, accent=${rgbLua(spec.palette.accent)}}`
    : 'nil';
  const specAtmoLua = spec ? atmosphereOptsLua(spec) : '';
  const hubLua = safeLuaString(spec ? spec.hubName : '', '');

  const buildingSlots = [
    { pos: 'Vector3.new(0, 0, -130)', size: 'Vector3.new(56, 34, 44)' },
    { pos: 'Vector3.new(-120, 0, -70)', size: 'Vector3.new(42, 26, 38)' },
    { pos: 'Vector3.new(120, 0, -70)', size: 'Vector3.new(42, 24, 38)' },
    { pos: 'Vector3.new(-120, 0, 70)', size: 'Vector3.new(40, 22, 36)' },
    { pos: 'Vector3.new(120, 0, 70)', size: 'Vector3.new(42, 24, 38)' },
    { pos: 'Vector3.new(0, 0, 130)', size: 'Vector3.new(46, 24, 40)' },
  ];
  const defaultBuildings = [
    { name: 'TownHall', sign: 'Town Hall' }, { name: 'Bank', sign: 'Bank' },
    { name: 'Shop', sign: 'Shop' }, { name: 'Cafe', sign: 'Cafe' },
    { name: 'Police', sign: 'Police Station' }, { name: 'House', sign: 'Apartments' },
  ];
  const buildings = (spec ? spec.structures : defaultBuildings).slice(0, 6);
  const buildingDefsLua = buildings
    .map((b, i) => `    {name=${safeLuaString(b.name, 'Building' + (i + 1))}, pos=${buildingSlots[i].pos}, size=${buildingSlots[i].size}, sign=${safeLuaString(b.sign, b.name || 'Shop')}},`)
    .join('\n');

  const jobSlots = [
    'Vector3.new(120, 1.2, -44)', 'Vector3.new(-120, 1.2, 44)', 'Vector3.new(120, 1.2, 44)',
    'Vector3.new(-120, 1.2, -44)', 'Vector3.new(0, 1.2, -104)', 'Vector3.new(0, 1.2, 104)',
  ];
  const defaultJobs = [
    { name: 'Cashier', pay: 35 }, { name: 'Barista', pay: 30 }, { name: 'Officer', pay: 48 },
    { name: 'Teller', pay: 42 }, { name: 'Mayor', pay: 65 }, { name: 'Janitor', pay: 26 },
  ];
  const jobs = (spec ? spec.jobs : defaultJobs).slice(0, 6);
  const jobsLua = jobs
    .map((j, i) => `    {name=${safeLuaString(j.name, 'Worker')}, pay=${Math.max(5, Math.min(200, Math.round(Number(j.pay) || 25)))}, pos=${jobSlots[i]}},`)
    .join('\n');

  const npcSlots = [
    { name: 'Mira', pos: 'Vector3.new(-28, 0, -16)', color: 'Color3.fromRGB(230, 180, 150)' },
    { name: 'Theo', pos: 'Vector3.new(30, 0, 14)', color: 'Color3.fromRGB(170, 200, 235)' },
    { name: 'Ada', pos: 'Vector3.new(12, 0, -32)', color: 'Color3.fromRGB(210, 200, 160)' },
  ];
  // Session 414h: NPCs whose character IS a meme become the actual 3D creature
  // (Tralalero shark, Bombardiro croc, Skibidi) — not a humanoid with a floating
  // face banner. Non-meme characters (The Host, Survivor...) stay R15 humanoids.
  const memeFigForName = (name: string): string => {
    const n = String(name).toLowerCase();
    return n.includes('tralalero') ? 'tralalero' : n.includes('bombardiro') ? 'bombardiro' : n.includes('skibidi') ? 'skibidi' : n.includes('sigma') ? 'sigma' : '';
  };
  const npcFigs = spec ? spec.characters.slice(0, 3).map((c) => memeFigForName(c.name)) : [];
  const npcsLua = spec
    ? spec.characters
        .slice(0, 3)
        .map((c, i) => `    {name=${safeLuaString(c.name, 'NPC')}, pos=${npcSlots[i].pos}, color=${rgbLua(c.color)}, line=${safeLuaString(c.line, 'Welcome!')}, fig=${safeLuaString(memeFigForName(c.name), '')}},`)
        .join('\n')
    : `    {name="Mira", pos=Vector3.new(-28, 0, -16), color=Color3.fromRGB(230, 180, 150), line="Welcome to " .. Config.Title .. "! Grab a job pad to earn cash.", fig=""},
    {name="Theo", pos=Vector3.new(30, 0, 14), color=Color3.fromRGB(170, 200, 235), line="Buy a role at the Shop desk to flex your status.", fig=""},
    {name="Ada", pos=Vector3.new(12, 0, -32), color=Color3.fromRGB(210, 200, 160), line="The Mayor job pays the most. Good luck out there!", fig=""},`;

  // Session 414d: themed hero centerpiece at the plaza — a lit pedestal showing
  // the theme's signature meme face (decal) + the game title. This is the free
  // "hero asset"; the Meshy 3D mesh upgrades the orb later.
  // Session 414f: real 3D hero centerpiece (no cheap flat decal). Meme vibes get
  // a volumetric meme figure (Tralalero shark / Sigma / Bombardiro croc); other
  // vibes get a clean 3D glowing spire. Title stays as a text label only.
  const heroMemeKey = !spec ? ''
    : (spec.vibe === 'brainrot' || spec.vibe === 'tropical') ? 'tralalero'
    : spec.vibe === 'monster' ? 'bombardiro'
    : (spec.vibe === 'money' || spec.vibe === 'hero') ? 'sigma'
    : '';
  // Emit the 3D meme prelude ONCE at top-level (not inside the hero do-block) so
  // both the hero centerpiece AND the NPC loop can build meme figures.
  const useMemePrelude = !!spec && (!!heroMemeKey || npcFigs.some((f) => f));
  const memePreludeTopLua = useMemePrelude
    ? `
local container = world
local RunService = game:GetService("RunService")
${meme3dPreludeLua()}`
    : '';
  const heroCenterLua = !spec
    ? ''
    : heroMemeKey
      ? `
do
    local hp = Vector3.new(28, 0, 28)
    local ped = part("HeroPedestal", Vector3.new(16, 9, 16), hp + Vector3.new(0, 4.5, 0), theme.wall, Enum.Material.Marble)
    local hpl = Instance.new("PointLight"); hpl.Color = theme.accent; hpl.Brightness = 2.2; hpl.Range = 30; hpl.Parent = ped
    local heroFig = buildMeme3dFigure("${heroMemeKey}", hp + Vector3.new(0, 13, 0), 1); pcall(function() heroFig:ScaleTo(1.7) end)
    local hbb = Instance.new("BillboardGui"); hbb.Size = UDim2.new(0, 200, 0, 40); hbb.StudsOffset = Vector3.new(0, 6, 0); hbb.AlwaysOnTop = true; hbb.Parent = ped
    local hTxt = Instance.new("TextLabel"); hTxt.Size = UDim2.new(1, 0, 1, 0); hTxt.BackgroundTransparency = 1; hTxt.TextColor3 = Color3.fromRGB(255, 255, 255); hTxt.TextStrokeTransparency = 0.3; hTxt.TextScaled = true; hTxt.Font = Enum.Font.GothamBlack; hTxt.Text = Config.Title; hTxt.Parent = hbb
end`
      : `
do
    local hp = Vector3.new(28, 0, 28)
    part("HeroPedestal", Vector3.new(16, 9, 16), hp + Vector3.new(0, 4.5, 0), theme.wall, Enum.Material.Marble)
    part("HeroSpire", Vector3.new(3, 18, 3), hp + Vector3.new(0, 18, 0), theme.accent, Enum.Material.Neon)
    local orb = part("HeroOrb", Vector3.new(5.5, 5.5, 5.5), hp + Vector3.new(0, 28, 0), theme.accent, Enum.Material.Neon); orb.Shape = Enum.PartType.Ball
    local hpl = Instance.new("PointLight"); hpl.Color = theme.accent; hpl.Brightness = 2.6; hpl.Range = 32; hpl.Parent = orb
    local hbb = Instance.new("BillboardGui"); hbb.Size = UDim2.new(0, 200, 0, 40); hbb.StudsOffset = Vector3.new(0, 5, 0); hbb.AlwaysOnTop = true; hbb.Parent = orb
    local hTxt = Instance.new("TextLabel"); hTxt.Size = UDim2.new(1, 0, 1, 0); hTxt.BackgroundTransparency = 1; hTxt.TextColor3 = Color3.fromRGB(255, 255, 255); hTxt.TextStrokeTransparency = 0.3; hTxt.TextScaled = true; hTxt.Font = Enum.Font.GothamBlack; hTxt.Text = Config.Title; hTxt.Parent = hbb
end`;

  // Session 414d: per-theme signature props at the plaza corners (PA/PB), matching
  // the user's preset descriptions: MrBeast vault+challenge gate, 99 Nights camp,
  // monster graveyard, spy antenna+tunnel, pet dragon egg, bananita stand, lab
  // containment, brainrot meme statues. Placed off-roads/off-spawn. neutral → none.
  const sigVibe = (spec && spec.vibe !== 'neutral') ? spec.vibe : '';
  const PA = 'Vector3.new(-30, 0, -30)';
  const PB = 'Vector3.new(30, 0, -30)';
  const signaturePropsLua = sigVibe === 'money'
    ? `
do local v = part("MoneyVault", Vector3.new(15, 12, 11), ${PA} + Vector3.new(0, 6, 0), Color3.fromRGB(74, 84, 74), Enum.Material.DiamondPlate); part("VaultDial", Vector3.new(2, 5, 5), ${PA} + Vector3.new(8, 6, 0), Color3.fromRGB(225, 185, 70), Enum.Material.Metal); label3d(v, "Money Vault", 8, Color3.fromRGB(255, 220, 90)) end
do local lp = part("ChalL", Vector3.new(3, 16, 3), ${PB} + Vector3.new(-8, 8, 0), Color3.fromRGB(60, 200, 90), Enum.Material.Neon); part("ChalR", Vector3.new(3, 16, 3), ${PB} + Vector3.new(8, 8, 0), Color3.fromRGB(60, 200, 90), Enum.Material.Neon); local bar = part("ChalBar", Vector3.new(19, 3, 3), ${PB} + Vector3.new(0, 16, 0), Color3.fromRGB(255, 210, 70), Enum.Material.Neon); label3d(bar, "CHALLENGE", 3, Color3.fromRGB(255, 255, 255)) end`
    : sigVibe === 'night'
    ? `
do local cf = ${PA} for i = 1, 5 do local a = math.rad(i * 72); local lg = part("CampLog_" .. i, Vector3.new(6, 1.3, 1.3), cf + Vector3.new(math.cos(a) * 2.2, 1, math.sin(a) * 2.2), Color3.fromRGB(86, 58, 38), Enum.Material.Wood); lg.CFrame = CFrame.new(lg.Position) * CFrame.Angles(0, a, math.rad(22)) end local em = part("CampEmbers", Vector3.new(4, 2.2, 4), cf + Vector3.new(0, 1.6, 0), Color3.fromRGB(255, 130, 45), Enum.Material.Neon); em.Shape = Enum.PartType.Ball; local pl = Instance.new("PointLight"); pl.Color = Color3.fromRGB(255, 150, 70); pl.Brightness = 4; pl.Range = 30; pl.Parent = em; local fr = Instance.new("Fire"); fr.Size = 7; fr.Parent = em end
do local t = part("Tent", Vector3.new(14, 9, 11), ${PB} + Vector3.new(0, 4.5, 0), Color3.fromRGB(90, 110, 80), Enum.Material.Fabric); label3d(t, "Camp", 6, Color3.fromRGB(200, 220, 180)) end`
    : sigVibe === 'monster'
    ? `
do for i = 1, 4 do local g = part("Grave_" .. i, Vector3.new(4, 6, 1.4), ${PA} + Vector3.new((i - 2) * 6, 3, 0), Color3.fromRGB(96, 96, 104), Enum.Material.Concrete); g.CFrame = CFrame.new(g.Position) * CFrame.Angles(math.rad(math.random(-6, 6)), 0, 0) end label3d(part("GraveSign", Vector3.new(2, 1, 2), ${PA} + Vector3.new(0, 8, -3), Color3.fromRGB(60, 54, 60), Enum.Material.Slate), "Graveyard", 2, Color3.fromRGB(190, 130, 200)) end`
    : sigVibe === 'spy'
    ? `
do local dish = part("SatBase", Vector3.new(4, 12, 4), ${PA} + Vector3.new(0, 6, 0), Color3.fromRGB(80, 86, 96), Enum.Material.Metal); local d = part("SatDish", Vector3.new(12, 2, 12), ${PA} + Vector3.new(0, 13, 0), Color3.fromRGB(190, 196, 205), Enum.Material.DiamondPlate); d.Shape = Enum.PartType.Ball; d.CFrame = CFrame.new(d.Position) * CFrame.Angles(math.rad(40), 0, 0); label3d(dish, "HQ Antenna", 9, Color3.fromRGB(230, 70, 70)) end
do local tun = part("Tunnel", Vector3.new(12, 8, 3), ${PB} + Vector3.new(0, 4, 0), Color3.fromRGB(40, 42, 48), Enum.Material.Slate); part("TunnelHole", Vector3.new(8, 6, 1), ${PB} + Vector3.new(0, 3.5, 1.5), Color3.fromRGB(8, 8, 10), Enum.Material.SmoothPlastic); label3d(tun, "Secret Tunnel", 6, Color3.fromRGB(230, 70, 70)) end`
    : sigVibe === 'hero'
    ? `
do for i = 1, 3 do part("Dummy_" .. i, Vector3.new(3, 7, 2), ${PA} + Vector3.new((i - 2) * 7, 4, 0), Color3.fromRGB(180, 90, 90), Enum.Material.SmoothPlastic); part("DummyHead_" .. i, Vector3.new(2, 2, 2), ${PA} + Vector3.new((i - 2) * 7, 8.5, 0), Color3.fromRGB(210, 120, 120), Enum.Material.SmoothPlastic) end label3d(part("TrainSign", Vector3.new(2, 1, 2), ${PA} + Vector3.new(0, 11, 0), Color3.fromRGB(255, 80, 90), Enum.Material.Neon), "Training Arena", 2, Color3.fromRGB(255, 255, 255)) end`
    : sigVibe === 'pets'
    ? `
do local egg = part("DragonEgg", Vector3.new(8, 11, 8), ${PA} + Vector3.new(0, 5.5, 0), Color3.fromRGB(120, 200, 140), Enum.Material.Marble); egg.Shape = Enum.PartType.Ball; for i = 1, 5 do part("Spot_" .. i, Vector3.new(2, 1, 2), ${PA} + Vector3.new(math.cos(i) * 3, 7 + i, math.sin(i) * 3), Color3.fromRGB(90, 160, 110), Enum.Material.SmoothPlastic) end label3d(egg, "Dragon Egg", 8, Color3.fromRGB(150, 255, 180)) end
do local bone = part("GiantBone", Vector3.new(16, 2.4, 2.4), ${PB} + Vector3.new(0, 2, 0), Color3.fromRGB(240, 235, 220), Enum.Material.SmoothPlastic); label3d(bone, "Pet Park", 4, Color3.fromRGB(255, 200, 230)) end`
    : sigVibe === 'tropical'
    ? `
do local bs = part("BananaStand", Vector3.new(12, 8, 9), ${PA} + Vector3.new(0, 4, 0), Color3.fromRGB(255, 210, 60), Enum.Material.SmoothPlastic); part("StandRoof", Vector3.new(15, 1.5, 12), ${PA} + Vector3.new(0, 8.5, 0), Color3.fromRGB(90, 170, 80), Enum.Material.Grass); label3d(bs, "Banana Stand", 7, Color3.fromRGB(255, 240, 120)) end
do for i = 1, 2 do part("Tiki_" .. i, Vector3.new(2.4, 9, 2.4), ${PB} + Vector3.new((i - 1.5) * 8, 4.5, 0), Color3.fromRGB(120, 80, 50), Enum.Material.Wood); local fl = part("TikiFlame_" .. i, Vector3.new(2, 2, 2), ${PB} + Vector3.new((i - 1.5) * 8, 9.5, 0), Color3.fromRGB(255, 140, 50), Enum.Material.Neon); local f = Instance.new("Fire"); f.Size = 4; f.Parent = fl end end`
    : sigVibe === 'lab'
    ? `
do for i = 1, 3 do local tube = part("Tube_" .. i, Vector3.new(12, 5, 5), ${PA} + Vector3.new((i - 2) * 8, 6, 0), Color3.fromRGB(150, 230, 220), Enum.Material.Glass); tube.Shape = Enum.PartType.Cylinder; tube.CFrame = CFrame.new(tube.Position) * CFrame.Angles(0, 0, math.rad(90)); tube.Transparency = 0.5; local g = part("Goo_" .. i, Vector3.new(4, 9, 4), ${PA} + Vector3.new((i - 2) * 8, 5, 0), Color3.fromRGB(120, 255, 160), Enum.Material.Neon); g.Transparency = 0.3 end label3d(part("LabSign", Vector3.new(2, 1, 2), ${PA} + Vector3.new(0, 14, 0), Color3.fromRGB(120, 255, 210), Enum.Material.Neon), "Containment", 2, Color3.fromRGB(255, 255, 255)) end`
    : sigVibe === 'brainrot'
    ? `
do local p1 = part("MemePed1", Vector3.new(7, 6, 7), ${PA} + Vector3.new(0, 3, 0), Color3.fromRGB(150, 70, 190), Enum.Material.Marble); local b1 = Instance.new("BillboardGui"); b1.Size = UDim2.new(0, 130, 0, 130); b1.StudsOffset = Vector3.new(0, 7, 0); b1.AlwaysOnTop = true; b1.Parent = p1; local i1 = Instance.new("ImageLabel"); i1.Size = UDim2.new(1, 0, 1, 0); i1.BackgroundTransparency = 1; i1.Image = "rbxthumb://type=Asset&id=98664340093672&w=420&h=420"; i1.Parent = b1 end
do local p2 = part("MemePed2", Vector3.new(7, 6, 7), ${PB} + Vector3.new(0, 3, 0), Color3.fromRGB(90, 220, 230), Enum.Material.Marble); local b2 = Instance.new("BillboardGui"); b2.Size = UDim2.new(0, 130, 0, 130); b2.StudsOffset = Vector3.new(0, 7, 0); b2.AlwaysOnTop = true; b2.Parent = p2; local i2 = Instance.new("ImageLabel"); i2.Size = UDim2.new(1, 0, 1, 0); i2.BackgroundTransparency = 1; i2.Image = "rbxthumb://type=Asset&id=14595650130&w=420&h=420"; i2.Parent = b2 end`
    : '';

  const serverScript = `local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local DataStoreService = game:GetService("DataStoreService")
local Lighting = game:GetService("Lighting")

local Config = {Title=${titleLua}, Theme=${themeLua}, StartingCash=${startingCash}, JobCount=${jobCount}, HubName=${hubLua}}

local THEMES = {
    suburb = {ground=Color3.fromRGB(120,170,95), groundMat=Enum.Material.Grass, road=Color3.fromRGB(70,72,78), plaza=Color3.fromRGB(180,170,150), wall=Color3.fromRGB(225,210,180), roof=Color3.fromRGB(170,80,70), accent=Color3.fromRGB(250,210,90)},
    city = {ground=Color3.fromRGB(90,92,98), groundMat=Enum.Material.Concrete, road=Color3.fromRGB(45,46,52), plaza=Color3.fromRGB(120,124,132), wall=Color3.fromRGB(150,165,185), roof=Color3.fromRGB(70,78,92), accent=Color3.fromRGB(90,200,255)},
    medieval = {ground=Color3.fromRGB(96,140,80), groundMat=Enum.Material.Grass, road=Color3.fromRGB(120,105,85), plaza=Color3.fromRGB(150,135,110), wall=Color3.fromRGB(205,185,150), roof=Color3.fromRGB(120,60,50), accent=Color3.fromRGB(220,180,90)},
    modern = {ground=Color3.fromRGB(70,74,82), groundMat=Enum.Material.Slate, road=Color3.fromRGB(40,42,48), plaza=Color3.fromRGB(120,130,140), wall=Color3.fromRGB(210,225,240), roof=Color3.fromRGB(90,150,200), accent=Color3.fromRGB(120,255,210)},
}
local theme = THEMES[Config.Theme] or THEMES.suburb
local SPEC_THEME = ${specThemeLua}
if SPEC_THEME then theme = SPEC_THEME end

local dataStore
local okStore, storeErr = pcall(function() dataStore = DataStoreService:GetDataStore("TownRpStats_v1") end)
if not okStore then warn("[TownRP] DataStore unavailable: " .. tostring(storeErr)) end

local remotes = Instance.new("Folder"); remotes.Name = "RpRemotes"; remotes.Parent = ReplicatedStorage
local RpEvent = Instance.new("RemoteEvent"); RpEvent.Name = "RpEvent"; RpEvent.Parent = remotes
local RpAction = Instance.new("RemoteEvent"); RpAction.Name = "RpAction"; RpAction.Parent = remotes
local world = Instance.new("Folder"); world.Name = "GeneratedTown"; world.Parent = workspace

local function part(name, size, pos, color, mat, parent)
    local p = Instance.new("Part"); p.Name = name; p.Size = size; p.Position = pos; p.Anchored = true; p.Color = color; p.Material = mat or Enum.Material.SmoothPlastic; p.Parent = parent or world; return p
end
local function label3d(adornee, text, offsetY, color)
    -- Session 414g: declutter — labels are NOT AlwaysOnTop (so they sit in 3D and
    -- occlude behind walls instead of overlaying everything) and vanish past 90
    -- studs (MaxDistance) so the screen isn't a wall of floating text.
    local bb = Instance.new("BillboardGui"); bb.Size = UDim2.new(0, 190, 0, 34); bb.StudsOffset = Vector3.new(0, offsetY, 0); bb.AlwaysOnTop = false; bb.MaxDistance = 90; bb.LightInfluence = 0; bb.Parent = adornee
    local t = Instance.new("TextLabel"); t.Size = UDim2.new(1, 0, 1, 0); t.BackgroundTransparency = 1; t.TextColor3 = color or Color3.fromRGB(255, 255, 255); t.TextStrokeTransparency = 0.3; t.TextScaled = true; t.Font = Enum.Font.GothamBold; t.Text = text; t.Parent = bb
    return t
end
${memePreludeTopLua}
part("TownGround", Vector3.new(380, 1, 380), Vector3.new(0, 0, 0), theme.ground, theme.groundMat)
${worldVisualsLua()}
setupAtmosphere({${specAtmoLua || `atmoColor = theme.accent:Lerp(Color3.fromRGB(205, 205, 210), 0.62), tint = Color3.fromRGB(252, 250, 248), haze = 1.5`}})
-- Session 414h: trees only in the 4 diagonal corners (away from the building ring
-- on the axes) so they never spawn inside/through houses.
for i = 1, 12 do
    local corner = math.rad(45 + math.floor((i - 1) / 3) * 90)
    local a = corner + math.rad(((i - 1) % 3 - 1) * 11)
    local r = 160 + ((i - 1) % 3) * 9
    local p = Vector3.new(math.cos(a) * r, 0.5, math.sin(a) * r)
    if i % 4 == 0 then makeRock(world, p, 0.85, theme.roof) else makeTree(world, p, 1.0, "round", Color3.fromRGB(112, 80, 52), Color3.fromRGB(80, 148, 74)) end
end
local plaza = part("Plaza", Vector3.new(86, 1, 86), Vector3.new(0, 0.6, 0), theme.plaza, Enum.Material.Pavement)
if Config.HubName and Config.HubName ~= "" then label3d(plaza, Config.HubName, 3, theme.accent) end
${heroCenterLua}
part("RoadNS", Vector3.new(20, 1, 380), Vector3.new(0, 0.7, 0), theme.road, Enum.Material.Asphalt)
part("RoadEW", Vector3.new(380, 1, 20), Vector3.new(0, 0.7, 0), theme.road, Enum.Material.Asphalt)

local spawnLoc = Instance.new("SpawnLocation"); spawnLoc.Name = "TownSpawn"; spawnLoc.Size = Vector3.new(16, 1, 16); spawnLoc.Position = Vector3.new(0, 1.2, 0); spawnLoc.Anchored = true; spawnLoc.Color = theme.accent; spawnLoc.Material = Enum.Material.Neon; spawnLoc.Parent = world
label3d(spawnLoc, Config.Title, 7, theme.accent)

-- Session 414g: ENTERABLE hollow house — 4 collidable walls + a doorway gap in
-- the front + floor + roof + an interior lamp, instead of one solid block. Sign
-- is a banner stuck on the front wall above the door (not a floating billboard).
local function buildHouse(name, pos, size, color, sign)
    local hx, hy, hz = size.X, size.Y, size.Z
    local base, cx, cz = pos.Y, pos.X, pos.Z
    local wallT = 1.4
    part(name .. "_Floor", Vector3.new(hx, 1, hz), Vector3.new(cx, base + 0.5, cz), color:Lerp(Color3.fromRGB(0, 0, 0), 0.25), Enum.Material.WoodPlanks)
    part(name .. "_Roof", Vector3.new(hx + 5, 4, hz + 5), Vector3.new(cx, base + hy + 2, cz), theme.roof, Enum.Material.Slate)
    part(name .. "_WallB", Vector3.new(hx, hy, wallT), Vector3.new(cx, base + hy / 2, cz - hz / 2), color, Enum.Material.Brick)
    part(name .. "_WallL", Vector3.new(wallT, hy, hz), Vector3.new(cx - hx / 2, base + hy / 2, cz), color, Enum.Material.Brick)
    part(name .. "_WallR", Vector3.new(wallT, hy, hz), Vector3.new(cx + hx / 2, base + hy / 2, cz), color, Enum.Material.Brick)
    local doorW, doorH = 12, 15
    local segW = (hx - doorW) / 2
    part(name .. "_WallF1", Vector3.new(segW, hy, wallT), Vector3.new(cx - (doorW / 2 + segW / 2), base + hy / 2, cz + hz / 2), color, Enum.Material.Brick)
    part(name .. "_WallF2", Vector3.new(segW, hy, wallT), Vector3.new(cx + (doorW / 2 + segW / 2), base + hy / 2, cz + hz / 2), color, Enum.Material.Brick)
    part(name .. "_Lintel", Vector3.new(doorW + 1, hy - doorH, wallT), Vector3.new(cx, base + doorH + (hy - doorH) / 2, cz + hz / 2), color, Enum.Material.Brick)
    local lamp = part(name .. "_Lamp", Vector3.new(2.2, 2.2, 2.2), Vector3.new(cx, base + hy - 4, cz), theme.accent, Enum.Material.Neon); lamp.Shape = Enum.PartType.Ball; lamp.CanCollide = false
    local pl = Instance.new("PointLight"); pl.Color = theme.accent; pl.Brightness = 1.6; pl.Range = math.max(hx, hz); pl.Parent = lamp
    -- interior furniture so the house isn't empty
    part(name .. "_Counter", Vector3.new(hx * 0.55, 4, 3.5), Vector3.new(cx, base + 2.5, cz - hz / 3.2), color:Lerp(Color3.fromRGB(0, 0, 0), 0.4), Enum.Material.Wood)
    part(name .. "_Shelf", Vector3.new(hx * 0.6, 5, 2.5), Vector3.new(cx - hx / 4, base + hy * 0.42, cz - hz / 2 + 1.8), Color3.fromRGB(120, 86, 54), Enum.Material.Wood)
    local rug = part(name .. "_Rug", Vector3.new(hx * 0.5, 0.2, hz * 0.45), Vector3.new(cx, base + 1.1, cz + hz / 6), theme.accent, Enum.Material.Fabric); rug.CanCollide = false
    local board = part(name .. "_Sign", Vector3.new(hx * 0.7, 4, 0.5), Vector3.new(cx, base + hy + 0.5, cz + hz / 2 + 0.4), theme.accent, Enum.Material.SmoothPlastic); board.CanCollide = false
    local sg = Instance.new("SurfaceGui"); sg.Face = Enum.NormalId.Back; sg.Adornee = board; sg.LightInfluence = 0; sg.PixelsPerStud = 50; sg.Parent = board
    local st = Instance.new("TextLabel"); st.Size = UDim2.new(1, 0, 1, 0); st.BackgroundTransparency = 1; st.TextColor3 = Color3.fromRGB(25, 25, 32); st.TextScaled = true; st.Font = Enum.Font.GothamBlack; st.Text = sign; st.Parent = sg
end

local buildingDefs = {
${buildingDefsLua}
}
for _, d in ipairs(buildingDefs) do buildHouse(d.name, d.pos, d.size, theme.wall, d.sign) end
${signaturePropsLua}

-- Session 414i: parked cars along the main street (RP "город с машинами").
local function buildCar(cn, cp, cc)
    part(cn, Vector3.new(8, 3, 16), cp + Vector3.new(0, 3, 0), cc, Enum.Material.SmoothPlastic)
    part(cn .. "_Cab", Vector3.new(7, 3, 7.5), cp + Vector3.new(0, 6, -0.5), cc:Lerp(Color3.fromRGB(255, 255, 255), 0.12), Enum.Material.SmoothPlastic)
    part(cn .. "_Glass", Vector3.new(7.3, 2.3, 6.8), cp + Vector3.new(0, 6.2, -0.5), Color3.fromRGB(120, 180, 220), Enum.Material.Glass)
    for _, wx in ipairs({-4, 4}) do for _, wz in ipairs({-5, 5}) do
        local w = part(cn .. "_W", Vector3.new(1.8, 3, 3), cp + Vector3.new(wx, 1.5, wz), Color3.fromRGB(28, 28, 32), Enum.Material.SmoothPlastic); w.Shape = Enum.PartType.Cylinder
    end end
    part(cn .. "_HL1", Vector3.new(1.3, 1, 0.4), cp + Vector3.new(-2.4, 3, 8), Color3.fromRGB(255, 248, 200), Enum.Material.Neon)
    part(cn .. "_HL2", Vector3.new(1.3, 1, 0.4), cp + Vector3.new(2.4, 3, 8), Color3.fromRGB(255, 248, 200), Enum.Material.Neon)
end
buildCar("Car1", Vector3.new(20, 0, -62), Color3.fromRGB(210, 70, 70))
buildCar("Car2", Vector3.new(-20, 0, 62), Color3.fromRGB(70, 120, 210))
buildCar("Car3", Vector3.new(20, 0, 98), Color3.fromRGB(240, 200, 70))
buildCar("Car4", Vector3.new(-20, 0, -98), Color3.fromRGB(90, 200, 130))

local function getCash(player) local ls = player:FindFirstChild("leaderstats"); local c = ls and ls:FindFirstChild("Cash"); return c and c.Value or 0 end
local function addCash(player, amount) local ls = player:FindFirstChild("leaderstats"); local c = ls and ls:FindFirstChild("Cash"); if c then c.Value = math.max(0, c.Value + amount) end end
local roleColors = {Citizen=Color3.fromRGB(200,200,200), VIP=Color3.fromRGB(255,210,90), Tycoon=Color3.fromRGB(120,230,160), Legend=Color3.fromRGB(190,130,255)}
local function updateRoleTag(player)
    local char = player.Character; local head = char and char:FindFirstChild("Head"); if not head then return end
    local ls = player:FindFirstChild("leaderstats"); local role = ls and ls:FindFirstChild("Role"); local roleName = role and role.Value or "Citizen"
    local old = head:FindFirstChild("RpRoleTag"); if old then old:Destroy() end
    local bb = Instance.new("BillboardGui"); bb.Name = "RpRoleTag"; bb.Size = UDim2.new(0, 170, 0, 30); bb.StudsOffset = Vector3.new(0, 3.4, 0); bb.AlwaysOnTop = true; bb.Parent = head
    local t = Instance.new("TextLabel"); t.Size = UDim2.new(1, 0, 1, 0); t.BackgroundTransparency = 1; t.TextColor3 = roleColors[roleName] or Color3.fromRGB(220, 220, 220); t.TextStrokeTransparency = 0.3; t.TextScaled = true; t.Font = Enum.Font.GothamBold; t.Text = "[" .. roleName .. "] " .. player.DisplayName; t.Parent = bb
end
local function setRole(player, roleName)
    local ls = player:FindFirstChild("leaderstats"); local role = ls and ls:FindFirstChild("Role"); if role then role.Value = roleName end
    updateRoleTag(player)
end

local JOBS = {
${jobsLua}
}
local working = {}
local employed = {}
for i = 1, math.min(Config.JobCount, #JOBS) do
    local job = JOBS[i]
    local pad = part("Job_" .. job.name, Vector3.new(9, 1, 9), job.pos, theme.accent, Enum.Material.Neon); pad.Transparency = 0.35
    label3d(pad, job.name .. " (+$" .. job.pay .. ")", 4, theme.accent)
    local prompt = Instance.new("ProximityPrompt"); prompt.ActionText = "Work"; prompt.ObjectText = job.name; prompt.HoldDuration = 0.5; prompt.MaxActivationDistance = 14; prompt.RequiresLineOfSight = false; prompt.Parent = pad
    prompt.Triggered:Connect(function(player)
        if working[player] then return end
        working[player] = true
        employed[player] = job.name
        setRole(player, job.name)
        RpEvent:FireClient(player, {kind="toast", text="On shift as " .. job.name .. "..."})
        task.delay(2.5, function()
            if player and player.Parent then addCash(player, job.pay); RpEvent:FireClient(player, {kind="toast", text="Paycheck +$" .. job.pay}) end
            working[player] = false
        end)
    end)
end

local ROLES = {
    {name="Citizen", cost=0}, {name="VIP", cost=300}, {name="Tycoon", cost=1200}, {name="Legend", cost=4000},
}
local shopPad = part("RoleShopDesk", Vector3.new(11, 5, 4), Vector3.new(120, 2.5, -47), theme.accent, Enum.Material.Neon)
label3d(shopPad, "Role Shop", 5, theme.accent)
local shopPrompt = Instance.new("ProximityPrompt"); shopPrompt.ActionText = "Open Role Shop"; shopPrompt.ObjectText = "Buy a status role"; shopPrompt.HoldDuration = 0.2; shopPrompt.MaxActivationDistance = 16; shopPrompt.RequiresLineOfSight = false; shopPrompt.Parent = shopPad
shopPrompt.Triggered:Connect(function(player) RpEvent:FireClient(player, {kind="openShop", roles=ROLES, cash=getCash(player)}) end)

RpAction.OnServerEvent:Connect(function(player, payload)
    if typeof(payload) ~= "table" then return end
    if payload.action == "buyRole" then
        local pick
        for _, r in ipairs(ROLES) do if r.name == payload.role then pick = r; break end end
        if not pick then return end
        if getCash(player) >= pick.cost then
            if pick.cost > 0 then addCash(player, -pick.cost) end
            setRole(player, pick.name)
            RpEvent:FireClient(player, {kind="toast", text="You are now " .. pick.name .. "!"})
        else
            RpEvent:FireClient(player, {kind="toast", text="Need $" .. pick.cost .. " for " .. pick.name})
        end
    end
end)

${humanoidNpcPreludeLua()}
local NPCS = {
${npcsLua}
}
for idx, n in ipairs(NPCS) do
    -- Session 414h: meme characters spawn as the actual 3D creature (shark/croc/
    -- skibidi); everyone else is a real R15 humanoid. No floating face banners.
    local anchor
    if n.fig and n.fig ~= "" then
        local fig = buildMeme3dFigure(n.fig, n.pos + Vector3.new(0, 3.5, 0), idx)
        anchor = fig and fig.PrimaryPart
    else
        local npc, hum, hrp = makeHumanoidNpc(world, CFrame.new(n.pos + Vector3.new(0, 3.5, 0)), {name = n.name, color = n.color, health = 100})
        if npc and hrp then hrp.Anchored = true; anchor = npc:FindFirstChild("Head") or hrp end
    end
    if anchor then
        label3d(anchor, n.name, 5, Color3.fromRGB(255, 255, 255))
        local pr = Instance.new("ProximityPrompt"); pr.ActionText = "Talk"; pr.ObjectText = n.name; pr.HoldDuration = 0; pr.MaxActivationDistance = 14; pr.RequiresLineOfSight = false; pr.Parent = anchor
        pr.Triggered:Connect(function(player) RpEvent:FireClient(player, {kind="toast", text=n.name .. ": " .. n.line}) end)
    end
end

-- Session 414i: pet adoption — walk to the Pet Shop pad, adopt a pet that follows you.
local petPad = part("PetPad", Vector3.new(11, 1, 11), Vector3.new(-50, 1.1, 50), theme.accent, Enum.Material.Neon); petPad.Transparency = 0.4
label3d(petPad, "Adopt a Pet", 4, theme.accent)
do
    local petPrompt = Instance.new("ProximityPrompt"); petPrompt.ActionText = "Adopt a Pet"; petPrompt.ObjectText = "Pet Shop"; petPrompt.HoldDuration = 0.3; petPrompt.MaxActivationDistance = 14; petPrompt.RequiresLineOfSight = false; petPrompt.Parent = petPad
    local PETS = {}
    local petColors = {Color3.fromRGB(120, 200, 140), Color3.fromRGB(255, 170, 120), Color3.fromRGB(150, 180, 255)}
    local petCount = 0
    petPrompt.Triggered:Connect(function(player)
        if PETS[player] then PETS[player]:Destroy(); PETS[player] = nil end
        local char = player.Character; local root = char and char:FindFirstChild("HumanoidRootPart"); if not root then return end
        petCount = petCount + 1
        local pc = petColors[(petCount % 3) + 1]
        local m = Instance.new("Model"); m.Name = "Pet_" .. player.Name
        local pbody = part("PetBody", Vector3.new(3.4, 2.8, 4.4), root.Position + Vector3.new(4, -1, 4), pc, Enum.Material.SmoothPlastic, m); pbody.Shape = Enum.PartType.Ball; m.PrimaryPart = pbody
        local ph = part("PetHead", Vector3.new(2.6, 2.6, 2.6), pbody.Position + Vector3.new(0, 1.4, 1.7), pc:Lerp(Color3.fromRGB(255, 255, 255), 0.15), Enum.Material.SmoothPlastic, m); ph.Shape = Enum.PartType.Ball
        part("PetEarL", Vector3.new(0.8, 1.5, 0.6), pbody.Position + Vector3.new(-0.8, 2.7, 1.7), pc, Enum.Material.SmoothPlastic, m)
        part("PetEarR", Vector3.new(0.8, 1.5, 0.6), pbody.Position + Vector3.new(0.8, 2.7, 1.7), pc, Enum.Material.SmoothPlastic, m)
        local el = part("PetEyeL", Vector3.new(0.5, 0.5, 0.5), pbody.Position + Vector3.new(-0.55, 1.6, 2.9), Color3.fromRGB(20, 20, 25), Enum.Material.Neon, m); el.Shape = Enum.PartType.Ball
        local er = part("PetEyeR", Vector3.new(0.5, 0.5, 0.5), pbody.Position + Vector3.new(0.55, 1.6, 2.9), Color3.fromRGB(20, 20, 25), Enum.Material.Neon, m); er.Shape = Enum.PartType.Ball
        for _, d in ipairs(m:GetDescendants()) do
            if d:IsA("BasePart") then d.CanCollide = false; if d ~= pbody then d.Anchored = false; local wd = Instance.new("WeldConstraint"); wd.Part0 = pbody; wd.Part1 = d; wd.Parent = pbody end end
        end
        pbody.Anchored = true
        m.Parent = world
        PETS[player] = m
        RpEvent:FireClient(player, {kind="toast", text="You adopted a pet! It follows you."})
        task.spawn(function()
            while m.Parent and player.Parent and PETS[player] == m do
                local r = player.Character and player.Character:FindFirstChild("HumanoidRootPart")
                if r then pbody.Position = pbody.Position:Lerp(r.Position + Vector3.new(4, -1.4, 4), 0.12) end
                task.wait(0.06)
            end
        end)
    end)
    Players.PlayerRemoving:Connect(function(player) if PETS[player] then PETS[player]:Destroy(); PETS[player] = nil end end)
end

local function saveData(player)
    if not dataStore then return end
    local ls = player:FindFirstChild("leaderstats"); if not ls then return end
    local c = ls:FindFirstChild("Cash"); local r = ls:FindFirstChild("Role")
    pcall(function() dataStore:SetAsync("rp_" .. player.UserId, {cash = c and c.Value or Config.StartingCash, role = r and r.Value or "Citizen"}) end)
end
local function setupPlayer(player)
    local cash = Config.StartingCash; local role = "Citizen"
    if dataStore then pcall(function() local v = dataStore:GetAsync("rp_" .. player.UserId); if typeof(v) == "table" then cash = tonumber(v.cash) or cash; role = tostring(v.role or role) end end) end
    local ls = Instance.new("Folder"); ls.Name = "leaderstats"; ls.Parent = player
    local c = Instance.new("IntValue"); c.Name = "Cash"; c.Value = cash; c.Parent = ls
    local r = Instance.new("StringValue"); r.Name = "Role"; r.Value = role; r.Parent = ls
    player.CharacterAdded:Connect(function() task.wait(0.6); updateRoleTag(player) end)
    if player.Character then task.delay(0.3, function() updateRoleTag(player) end) end
end
Players.PlayerAdded:Connect(setupPlayer)
Players.PlayerRemoving:Connect(function(player) saveData(player); working[player] = nil; employed[player] = nil end)
for _, p in Players:GetPlayers() do setupPlayer(p) end

task.spawn(function()
    while true do
        task.wait(45)
        for _, p in Players:GetPlayers() do
            if employed[p] then addCash(p, 15); RpEvent:FireClient(p, {kind="toast", text="Salary +$15 (" .. employed[p] .. ")"}) end
        end
    end
end)
task.spawn(function() while true do task.wait(60); for _, p in Players:GetPlayers() do saveData(p) end end end)
task.spawn(function()
    Lighting.ClockTime = 14
    while true do Lighting.ClockTime = (Lighting.ClockTime + 0.05) % 24; task.wait(0.5) end
end)

print("[TownRP] " .. Config.Title .. " ready - theme=" .. Config.Theme .. ", jobs=" .. Config.JobCount)
`;
  const clientScript = `local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local player = Players.LocalPlayer
local remotes = ReplicatedStorage:WaitForChild("RpRemotes")
local RpEvent = remotes:WaitForChild("RpEvent")
local RpAction = remotes:WaitForChild("RpAction")

local gui = Instance.new("ScreenGui"); gui.Name = "TownRpHUD"; gui.ResetOnSpawn = false; gui.IgnoreGuiInset = true; gui.Parent = player:WaitForChild("PlayerGui")
local cashLabel = Instance.new("TextLabel"); cashLabel.Size = UDim2.new(0, 170, 0, 42); cashLabel.Position = UDim2.new(1, -186, 0, 14); cashLabel.BackgroundColor3 = Color3.fromRGB(18, 40, 26); cashLabel.BackgroundTransparency = 0.1; cashLabel.TextColor3 = Color3.fromRGB(150, 255, 180); cashLabel.TextScaled = true; cashLabel.Font = Enum.Font.GothamBold; cashLabel.Text = "$0"; cashLabel.Parent = gui
local cc = Instance.new("UICorner"); cc.CornerRadius = UDim.new(0, 10); cc.Parent = cashLabel
local roleLabel = Instance.new("TextLabel"); roleLabel.Size = UDim2.new(0, 210, 0, 42); roleLabel.Position = UDim2.new(0, 14, 0, 14); roleLabel.BackgroundColor3 = Color3.fromRGB(24, 26, 40); roleLabel.BackgroundTransparency = 0.1; roleLabel.TextColor3 = Color3.fromRGB(225, 225, 255); roleLabel.TextScaled = true; roleLabel.Font = Enum.Font.GothamBold; roleLabel.Text = "Citizen"; roleLabel.Parent = gui
local rcn = Instance.new("UICorner"); rcn.CornerRadius = UDim.new(0, 10); rcn.Parent = roleLabel
local toast = Instance.new("TextLabel"); toast.Size = UDim2.new(0, 460, 0, 40); toast.Position = UDim2.new(0.5, -230, 0, 70); toast.BackgroundColor3 = Color3.fromRGB(20, 24, 34); toast.BackgroundTransparency = 0.12; toast.TextColor3 = Color3.fromRGB(235, 235, 245); toast.TextScaled = true; toast.Font = Enum.Font.GothamBold; toast.Visible = false; toast.Parent = gui
local tcn = Instance.new("UICorner"); tcn.CornerRadius = UDim.new(0, 8); tcn.Parent = toast

local shop = Instance.new("Frame"); shop.Size = UDim2.new(0, 330, 0, 380); shop.Position = UDim2.new(0.5, -165, 0.5, -190); shop.BackgroundColor3 = Color3.fromRGB(22, 24, 34); shop.BackgroundTransparency = 0.05; shop.Visible = false; shop.Parent = gui
local scn = Instance.new("UICorner"); scn.CornerRadius = UDim.new(0, 12); scn.Parent = shop
local shopTitle = Instance.new("TextLabel"); shopTitle.Size = UDim2.new(1, 0, 0, 48); shopTitle.BackgroundTransparency = 1; shopTitle.TextColor3 = Color3.fromRGB(255, 255, 255); shopTitle.TextScaled = true; shopTitle.Font = Enum.Font.GothamBlack; shopTitle.Text = "Role Shop"; shopTitle.Parent = shop
local list = Instance.new("Frame"); list.Size = UDim2.new(1, -24, 1, -112); list.Position = UDim2.new(0, 12, 0, 54); list.BackgroundTransparency = 1; list.Parent = shop
local layout = Instance.new("UIListLayout"); layout.Padding = UDim.new(0, 8); layout.Parent = list
local closeBtn = Instance.new("TextButton"); closeBtn.Size = UDim2.new(1, -24, 0, 40); closeBtn.Position = UDim2.new(0, 12, 1, -50); closeBtn.BackgroundColor3 = Color3.fromRGB(60, 40, 40); closeBtn.TextColor3 = Color3.fromRGB(255, 220, 220); closeBtn.TextScaled = true; closeBtn.Font = Enum.Font.GothamBold; closeBtn.Text = "Close"; closeBtn.Parent = shop
local clc = Instance.new("UICorner"); clc.CornerRadius = UDim.new(0, 8); clc.Parent = closeBtn
closeBtn.Activated:Connect(function() shop.Visible = false end)

local function showToast(text)
    toast.Text = text; toast.Visible = true
    task.delay(2.4, function() if toast.Text == text then toast.Visible = false end end)
end
local function buildShop(roles)
    for _, c in ipairs(list:GetChildren()) do if c:IsA("TextButton") then c:Destroy() end end
    for _, r in ipairs(roles) do
        local b = Instance.new("TextButton"); b.Size = UDim2.new(1, 0, 0, 54); b.BackgroundColor3 = Color3.fromRGB(40, 44, 60); b.TextColor3 = Color3.fromRGB(240, 240, 250); b.TextScaled = true; b.Font = Enum.Font.GothamBold
        b.Text = r.name .. (r.cost > 0 and ("   $" .. r.cost) or "   Free"); b.Parent = list
        local bc = Instance.new("UICorner"); bc.CornerRadius = UDim.new(0, 8); bc.Parent = b
        b.Activated:Connect(function() RpAction:FireServer({action="buyRole", role=r.name}); shop.Visible = false end)
    end
    shop.Visible = true
end

task.spawn(function()
    local ls = player:WaitForChild("leaderstats")
    local c = ls:WaitForChild("Cash"); local r = ls:WaitForChild("Role")
    local function rc() cashLabel.Text = "$" .. c.Value end
    local function rr() roleLabel.Text = r.Value end
    rc(); rr(); c.Changed:Connect(rc); r.Changed:Connect(rr)
end)

RpEvent.OnClientEvent:Connect(function(p)
    if typeof(p) ~= "table" then return end
    if p.kind == "toast" then showToast(p.text)
    elseif p.kind == "openShop" then buildShop(p.roles) end
end)
`;
  return {
    serverScript,
    additionalScripts: [{ name: 'TownRpHudClient', scriptType: 'LocalScript', container: 'StarterPlayerScripts', source: clientScript }],
  };
}

// Session 399 (cont.): Racing — on-foot lap race on a closed oval track. We use
// a foot race (WalkSpeed boost) + ordered checkpoint Touched detection rather
// than vehicle physics, which is unreliable in generated games. Round loop:
// countdown -> race -> results -> restart. leaderstats Wins + Best Time.
function buildRacingScript(params: GameTemplateParams): MultiScriptResult {
  const titleLua = safeLuaString(params.title, 'Speed Circuit');
  const lapCount = Math.max(1, Math.min(5, Math.round(Number(params.lapCount) || 3)));
  const themeRaw = String(params.mapTheme || '').toLowerCase();
  const trackTheme = ['city', 'desert', 'winter', 'space'].find((t) => themeRaw.includes(t))
    || (/desert|sand|dune|canyon/.test(themeRaw) ? 'desert'
      : /winter|snow|ice|frozen/.test(themeRaw) ? 'winter'
      : /space|neon|cyber|sci|galaxy/.test(themeRaw) ? 'space'
      : 'city');
  const diffRaw = String(params.difficulty || '').toLowerCase();
  const difficulty = /hard|insane|pro/.test(diffRaw) ? 'hard' : /casual|easy|chill/.test(diffRaw) ? 'casual' : 'normal';
  const themeLua = safeLuaString(trackTheme, 'city');
  const difficultyLua = safeLuaString(difficulty, 'normal');

  // Session 414: per-preset palette override for recognizability.
  const spec = params.gameVisualSpec;
  const specThemeLua = (spec && spec.vibe !== 'neutral')
    ? `{ground=${rgbLua(spec.palette.ground)}, groundMat=Enum.Material.${spec.palette.groundMaterial}, road=${rgbLua(spec.palette.road)}, accent=${rgbLua(spec.palette.accent)}}`
    : 'nil';
  const specAtmoLua = spec ? atmosphereOptsLua(spec) : '';
  // Session 414c: themed environmental CONTENT (not just colour). "Lava City" was
  // missing lava + city — add glowing lava pools + a volcanic skyline for inferno,
  // city towers for urban vibes, palms for tropical, themed trees otherwise.
  const racingAtmo = (spec && spec.vibe !== 'neutral') ? spec.atmosphere : undefined;
  const racingVibe = (spec && spec.vibe !== 'neutral') ? spec.vibe : '';
  const racingTreeKindLua = safeLuaString(racingAtmo?.treeKind || 'pine', 'pine');
  const racingTreeTrunkLua = racingAtmo ? rgbLua(racingAtmo.treeTrunk) : 'Color3.fromRGB(96, 66, 42)';
  const racingTreeLeafLua = racingAtmo ? rgbLua(racingAtmo.treeLeaf) : 'Color3.fromRGB(64, 124, 64)';
  const racingRockLua = (racingAtmo && spec) ? rgbLua(spec.palette.wall) : 'Color3.fromRGB(132, 128, 120)';
  const racingDecorLua = racingVibe === 'inferno'
    ? `
for i = 1, 8 do
    local a = math.rad(i * 45); local r = 30 + (i % 2) * 18
    local lp = part("LavaPool_" .. i, Vector3.new(18 + (i % 3) * 6, 0.6, 14 + (i % 2) * 6), Vector3.new(math.cos(a) * r, 0.7, math.sin(a) * r * 0.6), Color3.fromRGB(255, 110, 30), Enum.Material.Neon)
    lp.CanCollide = false
    local ll = Instance.new("PointLight"); ll.Color = Color3.fromRGB(255, 120, 40); ll.Brightness = 2.6; ll.Range = 28; ll.Parent = lp
end
for i = 1, 10 do
    local a = math.rad(i * 36); local hh = 34 + (i % 4) * 16
    local bld = part("CityTower_" .. i, Vector3.new(20, hh, 20), Vector3.new(math.cos(a) * 198, hh / 2, math.sin(a) * 198 * 0.78), Color3.fromRGB(46, 38, 40), Enum.Material.Slate)
    local win = part("CityWin_" .. i, Vector3.new(21, hh * 0.78, 21), bld.Position, Color3.fromRGB(255, 120, 50), Enum.Material.Neon)
    win.Transparency = 0.72; win.CanCollide = false
end`
    : racingVibe === 'money'
      ? `
-- MONEY (MrBeast "Race for a Billion"): giant $ signs on posts + gold-bar stacks
-- + glowing coins + a $ VAULT. Gold = money — recognizable, no generic towers.
for i = 1, 6 do
    local a = math.rad(i * 60); local px, pz = math.cos(a) * 205, math.sin(a) * 205 * 0.8
    part("DollarPost_" .. i, Vector3.new(3, 34, 3), Vector3.new(px, 17, pz), Color3.fromRGB(92, 78, 42), Enum.Material.Metal)
    local board = part("DollarSign_" .. i, Vector3.new(20, 20, 1.2), Vector3.new(px, 38, pz), Color3.fromRGB(26, 96, 52), Enum.Material.Metal)
    for _, fc in ipairs({Enum.NormalId.Front, Enum.NormalId.Back}) do
        local sg = Instance.new("SurfaceGui"); sg.Adornee = board; sg.Face = fc; sg.LightInfluence = 0; sg.Parent = board
        local t = Instance.new("TextLabel"); t.Size = UDim2.new(1, 0, 1, 0); t.BackgroundTransparency = 1; t.TextColor3 = Color3.fromRGB(140, 255, 150); t.TextScaled = true; t.Font = Enum.Font.GothamBlack; t.Text = "$"; t.Parent = sg
    end
end
for i = 1, 10 do
    local a = math.rad(i * 36); local gx, gz = math.cos(a) * 66, math.sin(a) * 66 * 0.7
    for k = 0, 2 do part("GoldBar_" .. i .. "_" .. k, Vector3.new(7, 2, 3.4), Vector3.new(gx, 1.6 + k * 2.1, gz), Color3.fromRGB(255, 205, 64), Enum.Material.Metal) end
    local coin = part("Coin_" .. i, Vector3.new(0.5, 4.4, 4.4), Vector3.new(gx + 7, 2.6, gz), Color3.fromRGB(255, 222, 84), Enum.Material.Metal); coin.Shape = Enum.PartType.Cylinder
    local cl = Instance.new("PointLight"); cl.Color = Color3.fromRGB(255, 222, 120); cl.Brightness = 1.1; cl.Range = 12; cl.Parent = coin
end
do
    local vault = part("MoneyVault", Vector3.new(26, 18, 18), Vector3.new(0, 9, 66), Color3.fromRGB(72, 66, 46), Enum.Material.Metal)
    local sg = Instance.new("SurfaceGui"); sg.Adornee = vault; sg.Face = Enum.NormalId.Front; sg.LightInfluence = 0; sg.Parent = vault
    ${spec && Number(spec.heroDecalId) > 0 ? `local vimg = Instance.new("ImageLabel"); vimg.Size = UDim2.new(1, 0, 0.66, 0); vimg.BackgroundTransparency = 1; vimg.Image = "rbxthumb://type=Asset&id=${Math.floor(Number(spec.heroDecalId))}&w=420&h=420"; vimg.Parent = sg
    local vt = Instance.new("TextLabel"); vt.Size = UDim2.new(1, 0, 0.34, 0); vt.Position = UDim2.new(0, 0, 0.66, 0)` : `local vt = Instance.new("TextLabel"); vt.Size = UDim2.new(1, 0, 1, 0)`}
    vt.BackgroundTransparency = 1; vt.TextColor3 = Color3.fromRGB(255, 222, 90); vt.TextScaled = true; vt.Font = Enum.Font.GothamBlack; vt.Text = "$ VAULT"; vt.Parent = sg
    for k = 0, 3 do part("VaultGold_" .. k, Vector3.new(8, 2, 4), Vector3.new(-9 + k * 6, 1.5, 54), Color3.fromRGB(255, 205, 64), Enum.Material.Metal) end
end`
    : (racingVibe === 'spy' || racingVibe === 'lab' || racingVibe === 'brainrot' || racingVibe === 'hero')
      ? `
for i = 1, 10 do
    local a = math.rad(i * 36); local hh = 32 + (i % 4) * 16
    local bld = part("CityTower_" .. i, Vector3.new(20, hh, 20), Vector3.new(math.cos(a) * 198, hh / 2, math.sin(a) * 198 * 0.78), theme.road, Enum.Material.Concrete)
    local win = part("CityWin_" .. i, Vector3.new(21, hh * 0.78, 21), bld.Position, theme.accent, Enum.Material.Neon)
    win.Transparency = 0.74; win.CanCollide = false
end`
      : racingVibe === 'tropical'
        ? `
for i = 1, 10 do
    local a = math.rad(i * 36)
    makeTree(world, Vector3.new(math.cos(a) * 188, 0.5, math.sin(a) * 188 * 0.78), 1.1, "palm", Color3.fromRGB(122, 86, 54), Color3.fromRGB(86, 170, 80))
end`
        : (racingVibe === 'night' || racingVibe === 'monster' || racingVibe === 'pets')
        ? `
for i = 1, 12 do local a = math.rad(i * 30); makeTree(world, Vector3.new(math.cos(a) * 188, 0.5, math.sin(a) * 188 * 0.78), 1.0, "pine", Color3.fromRGB(58, 46, 38), Color3.fromRGB(40, 72, 56)) end
do local cf = Vector3.new(0, 0, 58) for i = 1, 5 do local a = math.rad(i * 72); local lg = part("CampLog_" .. i, Vector3.new(6, 1.3, 1.3), cf + Vector3.new(math.cos(a) * 2.2, 1, math.sin(a) * 2.2), Color3.fromRGB(86, 58, 38), Enum.Material.Wood); lg.CFrame = CFrame.new(lg.Position) * CFrame.Angles(0, a, math.rad(22)) end local em = part("CampEmbers", Vector3.new(4, 2.2, 4), cf + Vector3.new(0, 1.6, 0), Color3.fromRGB(255, 130, 45), Enum.Material.Neon); em.Shape = Enum.PartType.Ball; local pl = Instance.new("PointLight"); pl.Color = Color3.fromRGB(255, 150, 70); pl.Brightness = 4; pl.Range = 30; pl.Parent = em; local fr = Instance.new("Fire"); fr.Size = 7; fr.Parent = em end`
        : '';

  const heroDecal = spec ? Math.max(0, Math.floor(Number(spec.heroDecalId) || 0)) : 0;
  const bannerLua = heroDecal > 0
    ? `local img = Instance.new("ImageLabel"); img.Size = UDim2.new(0.26, 0, 1, 0); img.BackgroundTransparency = 1; img.Image = "rbxthumb://type=Asset&id=${heroDecal}&w=420&h=420"; img.Parent = sg
    local titleLbl = Instance.new("TextLabel"); titleLbl.Size = UDim2.new(0.72, 0, 1, 0); titleLbl.Position = UDim2.new(0.27, 0, 0, 0)`
    : `local titleLbl = Instance.new("TextLabel"); titleLbl.Size = UDim2.new(1, 0, 1, 0)`;
  // Session 418: sky/dragon presets (e.g. "Drive the Dragon Highway") resolve to
  // a neutral vibe, so add a local "race above the clouds" decor set — floating
  // islands + cloud puffs + a stylized dragon arc (all CanCollide=false, clear of
  // the track). Sky elements ARE meant to be elevated; this is not the floating
  // decal-banner anti-pattern.
  const titleLow = String(params.title || '').toLowerCase();
  const isSky = /dragon|sky|cloud|above the clouds|heaven|aero|wing/.test(titleLow);
  const racingSkyDecorLua = isSky
    ? `
for i = 1, 16 do
    local a = math.rad(i * 22.5); local r = 235 + (i % 3) * 26
    local cl = part("Cloud_" .. i, Vector3.new(34 + (i % 4) * 8, 8, 26), Vector3.new(math.cos(a) * r, 40 + (i % 5) * 9, math.sin(a) * r * 0.8), Color3.fromRGB(245, 248, 255), Enum.Material.SmoothPlastic)
    cl.Transparency = 0.25; cl.CanCollide = false
end
for i = 1, 7 do
    local a = math.rad(i * 51); local r = 212
    local isl = part("SkyIsland_" .. i, Vector3.new(40, 10, 40), Vector3.new(math.cos(a) * r, 22, math.sin(a) * r * 0.8), Color3.fromRGB(96, 78, 60), Enum.Material.Rock); isl.CanCollide = false
    local grass = part("SkyIslandTop_" .. i, Vector3.new(42, 3, 42), isl.Position + Vector3.new(0, 6, 0), Color3.fromRGB(86, 168, 92), Enum.Material.Grass); grass.CanCollide = false
    makeTree(world, isl.Position + Vector3.new(0, 8, 0), 1.0, "round", Color3.fromRGB(110, 78, 50), Color3.fromRGB(78, 150, 86))
end
do
    local segs = 9
    for i = 0, segs - 1 do
        local t = i / (segs - 1)
        local s = 7 - t * 4
        local d = part("Dragon_" .. i, Vector3.new(s, s, s + 3), Vector3.new(math.cos(t * math.pi * 1.4) * 120, 58 + math.sin(t * math.pi) * 26, math.sin(t * math.pi * 1.4) * 80), Color3.fromRGB(120, 60, 160), Enum.Material.SmoothPlastic); d.CanCollide = false
        if i == 0 then local eye = part("DragonEye", Vector3.new(2, 2, 2), d.Position + Vector3.new(0, 2, -3), Color3.fromRGB(255, 220, 80), Enum.Material.Neon); eye.CanCollide = false; eye.Shape = Enum.PartType.Ball end
    end
end`
    : '';
  const serverScript = `local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local DataStoreService = game:GetService("DataStoreService")

local Config = {Title=${titleLua}, Theme=${themeLua}, Laps=${lapCount}, Difficulty=${difficultyLua}}

local THEMES = {
    city = {ground=Color3.fromRGB(80,84,92), groundMat=Enum.Material.Concrete, road=Color3.fromRGB(48,50,56), accent=Color3.fromRGB(90,200,255)},
    desert = {ground=Color3.fromRGB(216,186,124), groundMat=Enum.Material.Sand, road=Color3.fromRGB(120,96,64), accent=Color3.fromRGB(255,170,70)},
    winter = {ground=Color3.fromRGB(228,236,244), groundMat=Enum.Material.Snow, road=Color3.fromRGB(120,135,150), accent=Color3.fromRGB(120,220,255)},
    space = {ground=Color3.fromRGB(30,34,48), groundMat=Enum.Material.Metal, road=Color3.fromRGB(46,52,72), accent=Color3.fromRGB(150,255,210)},
}
local theme = THEMES[Config.Theme] or THEMES.city
local SPEC_THEME = ${specThemeLua}
if SPEC_THEME then theme = SPEC_THEME end
local tireColor = Color3.fromRGB(26, 26, 30)

-- car roster: distinct stats so the 3 garage choices feel different.
local CARS = {
    cruiser = {label="Cruiser", maxSpeed=92,  accel=46, grip=0.82, turn=2.7, body=Vector3.new(7.0, 2.2, 13.0)},
    bolt    = {label="Bolt",    maxSpeed=128, accel=62, grip=0.66, turn=2.3, body=Vector3.new(6.4, 1.9, 13.6)},
    drifter = {label="Drifter", maxSpeed=104, accel=54, grip=0.50, turn=3.3, body=Vector3.new(7.0, 2.0, 12.6)},
}
local CAR_ORDER = {"cruiser", "bolt", "drifter"}

local dataStore
local okStore, storeErr = pcall(function() dataStore = DataStoreService:GetDataStore("RacingStats_v2") end)
if not okStore then warn("[Racing] DataStore unavailable: " .. tostring(storeErr)) end

local remotes = Instance.new("Folder"); remotes.Name = "RaceRemotes"; remotes.Parent = ReplicatedStorage
local RaceEvent = Instance.new("RemoteEvent"); RaceEvent.Name = "RaceEvent"; RaceEvent.Parent = remotes
local SelectCar = Instance.new("RemoteEvent"); SelectCar.Name = "SelectCar"; SelectCar.Parent = remotes
local BoostEvent = Instance.new("RemoteEvent"); BoostEvent.Name = "BoostEvent"; BoostEvent.Parent = remotes
local world = Instance.new("Folder"); world.Name = "GeneratedRace"; world.Parent = workspace

local function part(name, size, pos, color, mat, parent)
    local p = Instance.new("Part"); p.Name = name; p.Size = size; p.Position = pos; p.Anchored = true; p.Color = color; p.Material = mat or Enum.Material.SmoothPlastic; p.Parent = parent or world; return p
end

part("RaceGround", Vector3.new(470, 1, 370), Vector3.new(0, 0, 0), theme.ground, theme.groundMat)
${worldVisualsLua()}
setupAtmosphere({${specAtmoLua || `atmoColor = theme.accent:Lerp(Color3.fromRGB(205, 205, 210), 0.6), tint = Color3.fromRGB(252, 250, 248), haze = 1.5`}})
for i = 1, 14 do
    local a = math.rad(i * 26); local r = 20 + (i % 3) * 14
    local p = Vector3.new(math.cos(a) * r, 0.5, math.sin(a) * r * 0.7)
    if i % 4 == 0 then makeRock(world, p, 0.7, ${racingRockLua}) else makeTree(world, p, 0.9, ${racingTreeKindLua}, ${racingTreeTrunkLua}, ${racingTreeLeafLua}) end
end
${racingDecorLua}
${racingSkyDecorLua}

-- ===== TRACK (oval circuit with curbs) =====
local waypoints = {}
local rx, rz = 165, 108
for i = 0, 11 do local a = math.rad(i * 30); table.insert(waypoints, Vector3.new(math.cos(a) * rx, 2, math.sin(a) * rz)) end
local N = #waypoints
for i = 1, N do
    local a = waypoints[i]; local b = waypoints[(i % N) + 1]
    local mid = Vector3.new((a.X + b.X) / 2, 1, (a.Z + b.Z) / 2)
    local len = (b - a).Magnitude + 12
    local cf = CFrame.lookAt(mid, Vector3.new(b.X, 1, b.Z))
    local seg = Instance.new("Part"); seg.Name = "Track_" .. i; seg.Anchored = true; seg.Color = theme.road; seg.Material = Enum.Material.Asphalt
    seg.Size = Vector3.new(60, 1, len); seg.CFrame = cf; seg.Parent = world
    local curbColor = (i % 2 == 0) and Color3.fromRGB(228, 228, 232) or theme.accent
    for _, sgn in ipairs({1, -1}) do
        local curb = Instance.new("Part"); curb.Anchored = true; curb.CanCollide = false; curb.Name = "Curb_" .. i .. "_" .. sgn; curb.Size = Vector3.new(2, 0.6, len)
        curb.CFrame = cf * CFrame.new(sgn * 30, 0.3, 0); curb.Color = curbColor; curb.Material = Enum.Material.SmoothPlastic; curb.Parent = world
    end
end

-- start tangent + helpers (used by gantry, grid, boost pads)
local startCenter = Vector3.new(waypoints[1].X, 0, waypoints[1].Z)
local fwd = (Vector3.new(waypoints[2].X, 0, waypoints[2].Z) - startCenter)
if fwd.Magnitude < 0.1 then fwd = Vector3.new(0, 0, 1) end
fwd = fwd.Unit
local right = Vector3.new(0, 1, 0):Cross(fwd).Unit
local startYaw = math.atan2(-fwd.X, -fwd.Z)
local function yawToLook(y) return Vector3.new(-math.sin(y), 0, -math.cos(y)) end

-- checkpoints (sequential gates)
local checkpoints = {}
for i = 1, N do
    local a = waypoints[i]; local b = waypoints[(i % N) + 1]
    local cp = Instance.new("Part"); cp.Name = "CP_" .. i; cp.Anchored = true; cp.CanCollide = false; cp.Transparency = 0.62
    cp.Size = Vector3.new(64, 18, 3); cp.CFrame = CFrame.lookAt(Vector3.new(a.X, 9, a.Z), Vector3.new(b.X, 9, b.Z))
    cp.Color = (i == 1) and Color3.fromRGB(255, 255, 255) or theme.accent; cp.Material = Enum.Material.ForceField; cp.Parent = world
    checkpoints[i] = cp
end

-- ===== START / FINISH GANTRY (grounded — banner wraps the structure, not floating) =====
do
    local pL = part("StartPillarL", Vector3.new(3, 28, 3), startCenter + right * 34 + Vector3.new(0, 14, 0), theme.accent, Enum.Material.Metal)
    local pR = part("StartPillarR", Vector3.new(3, 28, 3), startCenter - right * 34 + Vector3.new(0, 14, 0), theme.accent, Enum.Material.Metal)
    local beam = Instance.new("Part"); beam.Name = "StartBeam"; beam.Anchored = true; beam.Size = Vector3.new(74, 5, 4)
    beam.CFrame = CFrame.lookAt(startCenter + Vector3.new(0, 28, 0), startCenter + Vector3.new(0, 28, 0) + fwd); beam.Color = Color3.fromRGB(22, 24, 32); beam.Material = Enum.Material.Metal; beam.Parent = world
    local board = Instance.new("Part"); board.Name = "StartBanner"; board.Anchored = true; board.Size = Vector3.new(68, 9, 1)
    board.CFrame = beam.CFrame * CFrame.new(0, 0, 1.6); board.Color = Color3.fromRGB(16, 18, 26); board.Material = Enum.Material.SmoothPlastic; board.Parent = world
    local sg = Instance.new("SurfaceGui"); sg.Adornee = board; sg.Face = Enum.NormalId.Back; sg.CanvasSize = Vector2.new(900, 200); sg.LightInfluence = 0; sg.Parent = board
    ${bannerLua}
    titleLbl.BackgroundTransparency = 1; titleLbl.TextColor3 = Color3.fromRGB(255, 255, 255); titleLbl.TextStrokeTransparency = 0.35; titleLbl.TextScaled = true; titleLbl.Font = Enum.Font.GothamBlack; titleLbl.Text = Config.Title; titleLbl.Parent = sg
    -- checkered start line on the ground
    for k = -4, 4 do
        local sq = Instance.new("Part"); sq.Anchored = true; sq.Name = "Grid_" .. k; sq.Size = Vector3.new(6, 1.05, 6)
        sq.CFrame = CFrame.new(startCenter) * CFrame.lookAt(Vector3.zero, fwd).Rotation * CFrame.new(k * 6, 0.55, 0)
        sq.Color = (k % 2 == 0) and Color3.fromRGB(245, 245, 245) or Color3.fromRGB(28, 28, 32); sq.Material = Enum.Material.SmoothPlastic; sq.Parent = world
    end
end

local spawnLoc = Instance.new("SpawnLocation"); spawnLoc.Name = "RaceSpawn"; spawnLoc.Size = Vector3.new(40, 1, 18); spawnLoc.Position = startCenter - fwd * 30 + Vector3.new(0, 1.2, 0); spawnLoc.Anchored = true; spawnLoc.Color = theme.accent; spawnLoc.Material = Enum.Material.Neon; spawnLoc.Parent = world

-- ===== BOOST PADS (free timed speed boost on the straights) =====
local boostPads = {}
for _, wi in ipairs({2, 5, 8, 11}) do
    local a = waypoints[wi]; local b = waypoints[(wi % N) + 1]
    local mid = Vector3.new((a.X + b.X) / 2, 1.1, (a.Z + b.Z) / 2)
    local pad = Instance.new("Part"); pad.Name = "BoostPad_" .. wi; pad.Anchored = true; pad.CanCollide = false; pad.Size = Vector3.new(20, 0.4, 14)
    pad.CFrame = CFrame.lookAt(mid, Vector3.new(b.X, 1.1, b.Z)); pad.Color = Color3.fromRGB(255, 220, 70); pad.Material = Enum.Material.Neon; pad.Parent = world
    local arrow = Instance.new("Part"); arrow.Anchored = true; arrow.CanCollide = false; arrow.Size = Vector3.new(8, 0.5, 8); arrow.CFrame = pad.CFrame * CFrame.new(0, 0.05, 0) * CFrame.Angles(0, math.rad(45), 0)
    arrow.Color = Color3.fromRGB(255, 255, 255); arrow.Material = Enum.Material.Neon; arrow.Transparency = 0.2; arrow.Parent = world
    table.insert(boostPads, pad)
end

${(() => {
  // Session 418b: recognizable roadside crowd — real 3D meme figures (Tralalero
  // shark, Bombardiro croc, Skibidi, Sigma) on stands ringing the track, so a
  // "Race Through Brainrot" actually shows brainrot. Meme vibes only; pure Lua.
  const keys = (!spec || spec.vibe === 'neutral') ? []
    : spec.vibe === 'brainrot' ? ['tralalero', 'bombardiro', 'skibidi']
    : spec.vibe === 'monster' ? ['bombardiro', 'skibidi']
    : (spec.vibe === 'money' || spec.vibe === 'hero') ? ['sigma']
    : [];
  if (!keys.length) return '';
  return `-- ===== THEMED ROADSIDE CROWD (3D meme figures — per-preset recognizability) =====
do
    local container = world
${meme3dPreludeLua()}
    local crowdKeys = {${keys.map((k) => `"${k}"`).join(', ')}}
    for i = 1, 8 do
        local a = math.rad(i * 45)
        local px, pz = math.cos(a) * (rx + 50), math.sin(a) * (rz + 50) * 0.9
        part("CrowdStand_" .. i, Vector3.new(15, 6, 15), Vector3.new(px, 3, pz), theme.accent:Lerp(Color3.fromRGB(22, 22, 30), 0.35), Enum.Material.SmoothPlastic)
        buildMeme3dFigure(crowdKeys[((i - 1) % #crowdKeys) + 1], Vector3.new(px, 9, pz), i)
    end
end
`;
})()}
-- ===== ARCADE CAR BUILDER (pure parts, no upload — guaranteed visible) =====
local function weld(a, b) local w = Instance.new("WeldConstraint"); w.Part0 = a; w.Part1 = b; w.Parent = a end
local function buildRaceCar(cfg, cf)
    local stat = CARS[cfg.car] or CARS.cruiser
    local bs = stat.body
    local model = Instance.new("Model"); model.Name = "RaceCar_" .. tostring(cfg.userId)
    local chassis = Instance.new("Part"); chassis.Name = "Chassis"; chassis.Size = bs; chassis.CFrame = cf; chassis.Anchored = true; chassis.CanCollide = true
    chassis.Color = cfg.primary; chassis.Material = Enum.Material.Metal; chassis.Parent = model; model.PrimaryPart = chassis
    local cabin = Instance.new("Part"); cabin.Name = "Cabin"; cabin.Size = Vector3.new(bs.X * 0.78, 2.2, bs.Z * 0.4); cabin.CFrame = cf * CFrame.new(0, bs.Y * 0.5 + 1.1, -bs.Z * 0.06)
    cabin.Color = cfg.primary:Lerp(Color3.fromRGB(0, 0, 0), 0.2); cabin.Material = Enum.Material.SmoothPlastic; cabin.CanCollide = false; cabin.Anchored = true; cabin.Parent = model
    local glass = Instance.new("Part"); glass.Name = "Windshield"; glass.Size = Vector3.new(bs.X * 0.7, 1.8, 0.4); glass.CFrame = cf * CFrame.new(0, bs.Y * 0.5 + 1.2, -bs.Z * 0.26)
    glass.Color = Color3.fromRGB(150, 210, 235); glass.Material = Enum.Material.Glass; glass.Transparency = 0.45; glass.CanCollide = false; glass.Anchored = true; glass.Parent = model
    local spoiler = Instance.new("Part"); spoiler.Name = "Spoiler"; spoiler.Size = Vector3.new(bs.X * 0.9, 0.5, 2); spoiler.CFrame = cf * CFrame.new(0, bs.Y * 0.5 + 1.6, bs.Z * 0.46)
    spoiler.Color = cfg.accent; spoiler.Material = Enum.Material.SmoothPlastic; spoiler.CanCollide = false; spoiler.Anchored = true; spoiler.Parent = model
    for _, hx in ipairs({-1, 1}) do
        local hl = Instance.new("Part"); hl.Name = "Head"; hl.Size = Vector3.new(1.4, 1, 0.6); hl.CFrame = cf * CFrame.new(hx * bs.X * 0.32, 0, -bs.Z * 0.5)
        hl.Color = Color3.fromRGB(255, 250, 210); hl.Material = Enum.Material.Neon; hl.CanCollide = false; hl.Anchored = true; hl.Parent = model
    end
    local rearSmoke = {}
    local wheelDefs = {{-1, -1}, {1, -1}, {-1, 1}, {1, 1}}
    for _, wd in ipairs(wheelDefs) do
        local wpos = cf * CFrame.new(wd[1] * (bs.X * 0.5 - 0.2), -bs.Y * 0.5, wd[2] * (bs.Z * 0.34))
        local wheel = Instance.new("Part"); wheel.Name = "Wheel"; wheel.Shape = Enum.PartType.Cylinder; wheel.Size = Vector3.new(1.4, 3.2, 3.2)
        wheel.CFrame = wpos; wheel.Color = tireColor; wheel.Material = Enum.Material.SmoothPlastic; wheel.CanCollide = false; wheel.Anchored = true; wheel.Parent = model
        local rim = Instance.new("Part"); rim.Name = "Rim"; rim.Shape = Enum.PartType.Cylinder; rim.Size = Vector3.new(1.5, 1.5, 1.5); rim.CFrame = wheel.CFrame
        rim.Color = cfg.accent; rim.Material = Enum.Material.Metal; rim.CanCollide = false; rim.Anchored = true; rim.Parent = model
        if wd[2] > 0 then
            local em = Instance.new("ParticleEmitter"); em.Name = "Drift"; em.Texture = "rbxassetid://243660364"; em.Rate = 0; em.Enabled = false; em.Lifetime = NumberRange.new(0.5, 0.9)
            em.Size = NumberSequence.new(2.4); em.Speed = NumberRange.new(2, 5); em.Transparency = NumberSequence.new(0.35); em.Color = ColorSequence.new(Color3.fromRGB(225, 225, 230)); em.Parent = wheel
            table.insert(rearSmoke, em)
        end
    end
    local seat = Instance.new("VehicleSeat"); seat.Name = "DriveSeat"; seat.Size = Vector3.new(bs.X * 0.5, 1, 3.2); seat.CFrame = cf * CFrame.new(0, bs.Y * 0.5 + 0.6, bs.Z * 0.04)
    seat.Color = cfg.accent; seat.Material = Enum.Material.Fabric; seat.MaxSpeed = 0; seat.Torque = 0; seat.TurnSpeed = 0; seat.HeadsUpDisplay = false; seat.Anchored = true; seat.Parent = model
    local flame = Instance.new("ParticleEmitter"); flame.Name = "Boost"; flame.Texture = "rbxassetid://243664672"; flame.Rate = 0; flame.Enabled = false; flame.Lifetime = NumberRange.new(0.3, 0.5)
    flame.Size = NumberSequence.new(3); flame.Speed = NumberRange.new(6, 10); flame.Color = ColorSequence.new(Color3.fromRGB(255, 170, 60), Color3.fromRGB(255, 80, 30)); flame.Parent = spoiler
    local att = Instance.new("Attachment"); att.Name = "Drive"; att.Parent = chassis
    local lv = Instance.new("LinearVelocity"); lv.Name = "DriveLV"; lv.Attachment0 = att; lv.RelativeTo = Enum.ActuatorRelativeTo.World; lv.MaxForce = 1e6; lv.VectorVelocity = Vector3.zero; lv.Parent = chassis
    local ao = Instance.new("AlignOrientation"); ao.Name = "DriveAO"; ao.Mode = Enum.OrientationAlignmentMode.OneAttachment; ao.Attachment0 = att; ao.RigidityEnabled = true; ao.CFrame = CFrame.Angles(0, startYaw, 0); ao.Parent = chassis
    -- Cosmetics stay anchored (welded to chassis); the car is released to physics
    -- only at race start (releaseCar). This keeps seating rock-solid (no jitter-out).
    for _, p in ipairs(model:GetDescendants()) do if p:IsA("BasePart") and p ~= chassis then p.Massless = true; weld(chassis, p) end end
    model:SetAttribute("OwnerUserId", cfg.userId)
    model.Parent = world
    return {model = model, seat = seat, chassis = chassis, lv = lv, ao = ao, flame = flame, smoke = rearSmoke, stat = stat}
end

-- ===== PER-PLAYER STATE =====
local cars = {}
local prefs = {}
local slotOf = {}
local nextSlot = 0
local raceState = {}
local raceActive = false
local finishOrder = 0

local function anchorCar(car)
    if not (car and car.model and car.model.Parent) then return end
    if car.chassis then car.chassis.AssemblyLinearVelocity = Vector3.zero; car.chassis.AssemblyAngularVelocity = Vector3.zero end
    for _, p in ipairs(car.model:GetDescendants()) do if p:IsA("BasePart") then p.Anchored = true end end
end
local function releaseCar(car)
    if not (car and car.model and car.model.Parent and car.chassis) then return end
    for _, p in ipairs(car.model:GetDescendants()) do if p:IsA("BasePart") then p.Anchored = false end end
    pcall(function() car.chassis:SetNetworkOwner(nil) end)
end

local function gridCFrame(slot)
    local row = math.floor(slot / 2)
    local col = (slot % 2 == 0) and 1 or -1
    local base = startCenter - fwd * (16 + row * 16) + right * (col * 9) + Vector3.new(0, 3.4, 0)
    return CFrame.lookAt(base, base + fwd)
end

local function defPrefs() return {car = "cruiser", primary = theme.accent, accent = Color3.fromRGB(24, 24, 30)} end

local function seatPlayer(player, car)
    local char = player.Character; if not char then return end
    local hum = char:FindFirstChildOfClass("Humanoid"); local hrp = char:FindFirstChild("HumanoidRootPart")
    if not (hum and hrp and car and car.seat and car.seat.Parent) then return end
    if car.seat.Occupant then return end
    -- car is anchored while seating (spawnCarFor/resetToGrid keep it anchored until
    -- race start) so the player can't be jittered out; drop them on the seat + Sit.
    char:PivotTo(car.seat.CFrame * CFrame.new(0, 2.6, 0))
    pcall(function() car.seat:Sit(hum) end)
    -- one retry if Sit didn't take (character still loading on first try)
    task.delay(0.35, function()
        if car.seat and car.seat.Parent and not car.seat.Occupant and char.Parent and hum.Health > 0 then
            char:PivotTo(car.seat.CFrame * CFrame.new(0, 2.4, 0)); pcall(function() car.seat:Sit(hum) end)
        end
    end)
end

local function spawnCarFor(player)
    local pref = prefs[player.UserId] or defPrefs()
    local old = cars[player.UserId]; if old and old.model then old.model:Destroy() end
    local slot = slotOf[player.UserId]; if not slot then slot = nextSlot; slotOf[player.UserId] = slot; nextSlot = nextSlot + 1 end
    local cf = gridCFrame(slot)
    local car = buildRaceCar({userId = player.UserId, car = pref.car, primary = pref.primary, accent = pref.accent}, cf)
    car.yaw = startYaw; car.speed = 0; car.drift = 0; car.boost = 40; car.boostUntil = 0; car.player = player
    cars[player.UserId] = car
    -- manual-entry fallback prompt (auto-seat + native touch-to-sit are primary).
    local prompt = Instance.new("ProximityPrompt"); prompt.ActionText = "Drive"; prompt.ObjectText = car.stat.label; prompt.HoldDuration = 0; prompt.MaxActivationDistance = 18; prompt.RequiresLineOfSight = false; prompt.Parent = car.chassis
    prompt.Triggered:Connect(function(plr) if plr == player then seatPlayer(player, car) end end)
    if raceActive then releaseCar(car) end
    task.spawn(function() task.wait(0.25); seatPlayer(player, car) end)
    RaceEvent:FireClient(player, {kind = "car", name = car.stat.label, maxSpeed = car.stat.maxSpeed})
end

local function resetToGrid(player)
    local car = cars[player.UserId]; if not car or not car.model or not car.model.Parent then spawnCarFor(player); return end
    local slot = slotOf[player.UserId] or 0
    car.lv.VectorVelocity = Vector3.zero; car.ao.CFrame = CFrame.Angles(0, startYaw, 0)
    car.model:PivotTo(gridCFrame(slot))
    anchorCar(car)
    car.yaw = startYaw; car.speed = 0; car.drift = 0
    task.spawn(function() task.wait(0.1); seatPlayer(player, car) end)
end

-- ===== REWARDS =====
local function addCoins(player, n)
    local ls = player:FindFirstChild("leaderstats"); local c = ls and ls:FindFirstChild("Coins"); if c then c.Value += n end
    RaceEvent:FireClient(player, {kind = "coins", amount = (c and c.Value) or 0, gain = n})
end
local function addWin(player)
    local ls = player:FindFirstChild("leaderstats"); local w = ls and ls:FindFirstChild("Wins"); if w then w.Value += 1 end
end
local function recordBest(player, t)
    local ls = player:FindFirstChild("leaderstats"); local bt = ls and ls:FindFirstChild("Best Time"); if not bt then return end
    local secs = math.floor(t)
    if bt.Value == 0 or secs < bt.Value then bt.Value = secs; if dataStore then pcall(function() dataStore:SetAsync("rb_" .. player.UserId, secs) end) end end
end
local function fmt(t) return string.format("%.1f", t) end

-- ===== CHECKPOINT / LAP LOGIC =====
local function ownerOf(hit)
    local m = hit; while m and m ~= workspace do local uid = m:GetAttribute("OwnerUserId"); if uid then return uid end; m = m.Parent end
    return nil
end
for i = 1, N do
    checkpoints[i].Touched:Connect(function(hit)
        local uid = ownerOf(hit); if not uid then return end
        local player = Players:GetPlayerByUserId(uid); if not player then return end
        local st = raceState[player]; if not st or st.finished or not raceActive then return end
        if st.nextCp ~= i then return end
        if i == 1 then
            st.lap += 1
            if st.lap >= Config.Laps then
                st.finished = true; finishOrder += 1; st.place = finishOrder
                local elapsed = os.clock() - st.startTime
                addWin(player); recordBest(player, elapsed)
                local prize = (finishOrder == 1) and 250 or (finishOrder == 2) and 150 or (finishOrder == 3) and 100 or 50
                addCoins(player, prize)
                RaceEvent:FireClient(player, {kind = "finish", place = finishOrder, time = fmt(elapsed), prize = prize})
            else
                st.nextCp = 2; addCoins(player, 25)
                RaceEvent:FireClient(player, {kind = "lap", lap = st.lap, total = Config.Laps})
            end
        else
            st.nextCp = i + 1; if st.nextCp > N then st.nextCp = 1 end
        end
    end)
end

-- boost pads
for _, pad in ipairs(boostPads) do
    pad.Touched:Connect(function(hit)
        local uid = ownerOf(hit); if not uid then return end
        local car = cars[uid]; if car and raceActive then car.boostUntil = os.clock() + 1.8 end
    end)
end

-- ===== DRIVE CONTROLLER (server-authoritative; VehicleSeat input replicates) =====
RunService.Heartbeat:Connect(function(dt)
    for uid, car in pairs(cars) do
        local chassis = car.chassis
        if chassis and chassis.Parent then
            local seat = car.seat
            local throttle = (raceActive and seat.Occupant) and (seat.ThrottleFloat or 0) or 0
            local steer = (raceActive and seat.Occupant) and (seat.SteerFloat or 0) or 0
            local boosting = os.clock() < (car.boostUntil or 0)
            local mult = boosting and 1.6 or 1
            local target = throttle * car.stat.maxSpeed * mult
            car.speed = car.speed + (target - car.speed) * math.clamp(dt * (car.stat.accel / 18), 0, 1)
            local fast = math.abs(car.speed) > car.stat.maxSpeed * 0.5
            local drifting = math.abs(steer) > 0.6 and fast
            local turnAmt = steer * car.stat.turn * math.clamp(math.abs(car.speed) / car.stat.maxSpeed, 0, 1)
            if drifting then turnAmt = turnAmt * 1.5 end
            car.yaw = car.yaw - turnAmt * dt
            car.ao.CFrame = CFrame.Angles(0, car.yaw, 0)
            local look = yawToLook(car.yaw)
            local desired = look * car.speed
            local cur = chassis.AssemblyLinearVelocity
            local grip = drifting and (car.stat.grip * 0.4) or car.stat.grip
            local nx = cur.X + (desired.X - cur.X) * math.clamp(grip, 0, 1)
            local nz = cur.Z + (desired.Z - cur.Z) * math.clamp(grip, 0, 1)
            car.lv.VectorVelocity = Vector3.new(nx, cur.Y, nz)
            if drifting then
                car.drift = (car.drift or 0) + dt
                for _, em in ipairs(car.smoke) do em.Enabled = true; em.Rate = 40 end
            else
                if (car.drift or 0) > 0.5 then
                    local pts = math.floor(car.drift * 14)
                    car.boost = math.min(100, (car.boost or 0) + pts)
                    if car.player then addCoins(car.player, pts); RaceEvent:FireClient(car.player, {kind = "boostmeter", value = car.boost}) end
                end
                car.drift = 0
                for _, em in ipairs(car.smoke) do em.Enabled = false; em.Rate = 0 end
            end
            car.flame.Enabled = boosting; car.flame.Rate = boosting and 60 or 0
        end
    end
end)

-- ===== REMOTES: garage select + boost button =====
SelectCar.OnServerEvent:Connect(function(player, payload)
    if typeof(payload) ~= "table" then return end
    local pref = prefs[player.UserId] or defPrefs()
    if type(payload.car) == "string" and CARS[payload.car] then pref.car = payload.car end
    if typeof(payload.color) == "Color3" then pref.primary = payload.color end
    prefs[player.UserId] = pref
    -- always rebuild so the garage choice is visibly applied (+ re-seats the player).
    spawnCarFor(player)
end)
BoostEvent.OnServerEvent:Connect(function(player)
    local car = cars[player.UserId]; if not car or not raceActive then return end
    if (car.boost or 0) >= 35 then car.boost -= 35; car.boostUntil = os.clock() + 2.0; RaceEvent:FireClient(player, {kind = "boostmeter", value = car.boost}) end
end)

-- ===== PLAYER LIFECYCLE =====
local function setupPlayer(player)
    local best = 0
    if dataStore then pcall(function() local v = dataStore:GetAsync("rb_" .. player.UserId); if typeof(v) == "number" then best = v end end) end
    local ls = Instance.new("Folder"); ls.Name = "leaderstats"; ls.Parent = player
    local w = Instance.new("IntValue"); w.Name = "Wins"; w.Value = 0; w.Parent = ls
    local bt = Instance.new("IntValue"); bt.Name = "Best Time"; bt.Value = best; bt.Parent = ls
    local co = Instance.new("IntValue"); co.Name = "Coins"; co.Value = 0; co.Parent = ls
    prefs[player.UserId] = defPrefs(); raceState[player] = {nextCp = 1, lap = 0, startTime = 0, finished = false, place = nil}
    player.CharacterAdded:Connect(function() task.wait(0.4); spawnCarFor(player) end)
    if player.Character then spawnCarFor(player) end
end
Players.PlayerAdded:Connect(setupPlayer)
Players.PlayerRemoving:Connect(function(player)
    raceState[player] = nil
    local car = cars[player.UserId]; if car and car.model then car.model:Destroy() end
    cars[player.UserId] = nil
end)
for _, p in Players:GetPlayers() do setupPlayer(p) end

-- auto-reseat: recover any player who isn't in their car between races (covers a
-- failed/late Sit and players who hopped out). Never yanks someone mid-race.
task.spawn(function()
    while true do
        task.wait(1.5)
        if not raceActive then
            for _, car in pairs(cars) do
                if car.player and car.seat and car.seat.Parent and not car.seat.Occupant then
                    local ch = car.player.Character; local hh = ch and ch:FindFirstChildOfClass("Humanoid")
                    if hh and hh.Health > 0 then seatPlayer(car.player, car) end
                end
            end
        end
    end
end)

local function broadcast(phase, info)
    RaceEvent:FireAllClients({kind = "state", phase = phase, info = info or 0, laps = Config.Laps, title = Config.Title})
end

-- ===== RACE ROUND LOOP =====
task.spawn(function()
    while true do
        raceActive = false; finishOrder = 0
        for _, p in Players:GetPlayers() do
            local st = raceState[p]; if st then st.nextCp = 1; st.lap = 0; st.finished = false; st.place = nil end
            resetToGrid(p)
        end
        for t = 5, 1, -1 do broadcast("countdown", t); task.wait(1) end
        raceActive = true
        for _, p in Players:GetPlayers() do
            local st = raceState[p]; if st then st.nextCp = 2; st.lap = 0; st.finished = false; st.startTime = os.clock() end
            local car = cars[p.UserId]; if car then releaseCar(car) end
        end
        broadcast("race", 0)
        local elapsed = 0; local maxTime = 180
        while raceActive and elapsed < maxTime do
            local players = Players:GetPlayers(); local allDone = #players > 0
            for _, p in players do if raceState[p] and not raceState[p].finished then allDone = false; break end end
            if allDone then break end
            broadcast("race", elapsed); task.wait(0.5); elapsed += 0.5
        end
        raceActive = false
        broadcast("results", 0)
        task.wait(8)
    end
end)
print("[Racing] " .. Config.Title .. " ready - " .. Config.Laps .. " laps, theme=" .. Config.Theme)
`;
  const clientScript = `local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local UserInputService = game:GetService("UserInputService")
local player = Players.LocalPlayer
local remotes = ReplicatedStorage:WaitForChild("RaceRemotes")
local RaceEvent = remotes:WaitForChild("RaceEvent")
local SelectCar = remotes:WaitForChild("SelectCar")
local BoostEvent = remotes:WaitForChild("BoostEvent")

local gui = Instance.new("ScreenGui"); gui.Name = "RacingHUD"; gui.ResetOnSpawn = false; gui.IgnoreGuiInset = true; gui.Parent = player:WaitForChild("PlayerGui")
local function corner(o, r) local c = Instance.new("UICorner"); c.CornerRadius = UDim.new(0, r or 10); c.Parent = o end

local top = Instance.new("TextLabel"); top.Size = UDim2.new(0, 500, 0, 50); top.Position = UDim2.new(0.5, -250, 0, 10); top.BackgroundColor3 = Color3.fromRGB(16, 18, 26); top.BackgroundTransparency = 0.1; top.TextColor3 = Color3.fromRGB(225, 240, 255); top.TextScaled = true; top.Font = Enum.Font.GothamBlack; top.Text = "Racing"; top.Parent = gui; corner(top)
local lap = Instance.new("TextLabel"); lap.Size = UDim2.new(0, 150, 0, 40); lap.Position = UDim2.new(0, 14, 0, 10); lap.BackgroundColor3 = Color3.fromRGB(22, 30, 44); lap.BackgroundTransparency = 0.1; lap.TextColor3 = Color3.fromRGB(160, 220, 255); lap.TextScaled = true; lap.Font = Enum.Font.GothamBold; lap.Text = "Lap 0"; lap.Parent = gui; corner(lap)
local place = Instance.new("TextLabel"); place.Size = UDim2.new(0, 150, 0, 40); place.Position = UDim2.new(0, 14, 0, 56); place.BackgroundColor3 = Color3.fromRGB(22, 30, 44); place.BackgroundTransparency = 0.1; place.TextColor3 = Color3.fromRGB(255, 225, 120); place.TextScaled = true; place.Font = Enum.Font.GothamBold; place.Text = ""; place.Parent = gui; corner(place)
local speedo = Instance.new("TextLabel"); speedo.Size = UDim2.new(0, 170, 0, 56); speedo.Position = UDim2.new(1, -184, 1, -150); speedo.BackgroundColor3 = Color3.fromRGB(16, 18, 26); speedo.BackgroundTransparency = 0.1; speedo.TextColor3 = Color3.fromRGB(235, 245, 255); speedo.TextScaled = true; speedo.Font = Enum.Font.GothamBlack; speedo.Text = "0"; speedo.Parent = gui; corner(speedo)
local coins = Instance.new("TextLabel"); coins.Size = UDim2.new(0, 170, 0, 36); coins.Position = UDim2.new(1, -184, 0, 10); coins.BackgroundColor3 = Color3.fromRGB(28, 26, 14); coins.BackgroundTransparency = 0.1; coins.TextColor3 = Color3.fromRGB(255, 220, 90); coins.TextScaled = true; coins.Font = Enum.Font.GothamBold; coins.Text = "Coins 0"; coins.Parent = gui; corner(coins)
local meterBg = Instance.new("Frame"); meterBg.Size = UDim2.new(0, 170, 0, 16); meterBg.Position = UDim2.new(1, -184, 1, -86); meterBg.BackgroundColor3 = Color3.fromRGB(30, 32, 40); meterBg.Parent = gui; corner(meterBg, 8)
local meterFill = Instance.new("Frame"); meterFill.Size = UDim2.new(0.4, 0, 1, 0); meterFill.BackgroundColor3 = Color3.fromRGB(255, 180, 60); meterFill.Parent = meterBg; corner(meterFill, 8)
local big = Instance.new("TextLabel"); big.Size = UDim2.new(0, 460, 0, 90); big.Position = UDim2.new(0.5, -230, 0.36, 0); big.BackgroundTransparency = 1; big.TextColor3 = Color3.fromRGB(255, 255, 255); big.TextStrokeTransparency = 0.2; big.TextScaled = true; big.Font = Enum.Font.GothamBlack; big.Text = ""; big.Parent = gui
local drift = Instance.new("TextLabel"); drift.Size = UDim2.new(0, 300, 0, 50); drift.Position = UDim2.new(0.5, -150, 0.6, 0); drift.BackgroundTransparency = 1; drift.TextColor3 = Color3.fromRGB(255, 210, 90); drift.TextStrokeTransparency = 0.3; drift.TextScaled = true; drift.Font = Enum.Font.GothamBlack; drift.Text = ""; drift.Parent = gui

local boostBtn = Instance.new("TextButton"); boostBtn.Size = UDim2.new(0, 150, 0, 60); boostBtn.Position = UDim2.new(0.5, -75, 1, -78); boostBtn.BackgroundColor3 = Color3.fromRGB(255, 140, 40); boostBtn.TextColor3 = Color3.fromRGB(20, 14, 6); boostBtn.TextScaled = true; boostBtn.Font = Enum.Font.GothamBlack; boostBtn.Text = "BOOST"; boostBtn.Parent = gui; corner(boostBtn, 12)
boostBtn.Activated:Connect(function() BoostEvent:FireServer() end)
UserInputService.InputBegan:Connect(function(input, gp) if gp then return end if input.KeyCode == Enum.KeyCode.LeftShift then BoostEvent:FireServer() end end)

-- garage panel
local garage = Instance.new("Frame"); garage.Size = UDim2.new(0, 380, 0, 220); garage.Position = UDim2.new(0.5, -190, 0.5, -130); garage.BackgroundColor3 = Color3.fromRGB(18, 20, 30); garage.BackgroundTransparency = 0.04; garage.Visible = false; garage.Parent = gui; corner(garage, 14)
local gtitle = Instance.new("TextLabel"); gtitle.Size = UDim2.new(1, -56, 0, 30); gtitle.Position = UDim2.new(0, 10, 0, 8); gtitle.BackgroundTransparency = 1; gtitle.TextColor3 = Color3.fromRGB(230, 238, 255); gtitle.TextScaled = true; gtitle.Font = Enum.Font.GothamBold; gtitle.Text = "Garage — pick your ride"; gtitle.Parent = garage
local cars3 = {{key = "cruiser", label = "Cruiser"}, {key = "bolt", label = "Bolt"}, {key = "drifter", label = "Drifter"}}
for i, c in ipairs(cars3) do
    local b = Instance.new("TextButton"); b.Size = UDim2.new(0, 108, 0, 56); b.Position = UDim2.new(0, 8 + (i - 1) * 116, 0, 44); b.BackgroundColor3 = Color3.fromRGB(40, 46, 64); b.TextColor3 = Color3.fromRGB(235, 240, 255); b.TextScaled = true; b.Font = Enum.Font.GothamBold; b.Text = c.label; b.Parent = garage; corner(b, 10)
    b.Activated:Connect(function() SelectCar:FireServer({car = c.key}) end)
end
local swatches = {Color3.fromRGB(235, 70, 70), Color3.fromRGB(70, 150, 255), Color3.fromRGB(90, 220, 130), Color3.fromRGB(245, 210, 70), Color3.fromRGB(180, 90, 235), Color3.fromRGB(245, 245, 245)}
for i, col in ipairs(swatches) do
    local b = Instance.new("TextButton"); b.Size = UDim2.new(0, 48, 0, 48); b.Position = UDim2.new(0, 8 + (i - 1) * 56, 0, 110); b.BackgroundColor3 = col; b.Text = ""; b.Parent = garage; corner(b, 10)
    b.Activated:Connect(function() SelectCar:FireServer({color = col}) end)
end
local hint = Instance.new("TextLabel"); hint.Size = UDim2.new(1, -20, 0, 24); hint.Position = UDim2.new(0, 10, 0, 168); hint.BackgroundTransparency = 1; hint.TextColor3 = Color3.fromRGB(150, 160, 180); hint.TextScaled = true; hint.Font = Enum.Font.Gotham; hint.Text = "Pick a car + colour. Drift hard turns + yellow pads to BOOST."; hint.Parent = garage
-- close button (top-right of the panel)
local closeBtn = Instance.new("TextButton"); closeBtn.Size = UDim2.new(0, 34, 0, 30); closeBtn.Position = UDim2.new(1, -42, 0, 8); closeBtn.BackgroundColor3 = Color3.fromRGB(120, 44, 54); closeBtn.TextColor3 = Color3.fromRGB(255, 235, 235); closeBtn.TextScaled = true; closeBtn.Font = Enum.Font.GothamBold; closeBtn.Text = "X"; closeBtn.Parent = garage; corner(closeBtn, 8)
closeBtn.Activated:Connect(function() garage.Visible = false end)
-- always-visible GARAGE toggle so customization is reachable any time
local garageBtn = Instance.new("TextButton"); garageBtn.Size = UDim2.new(0, 150, 0, 46); garageBtn.Position = UDim2.new(0, 14, 1, -62); garageBtn.BackgroundColor3 = Color3.fromRGB(54, 60, 86); garageBtn.TextColor3 = Color3.fromRGB(235, 240, 255); garageBtn.TextScaled = true; garageBtn.Font = Enum.Font.GothamBold; garageBtn.Text = "🔧 GARAGE"; garageBtn.Parent = gui; corner(garageBtn, 10)
garageBtn.Activated:Connect(function() garage.Visible = not garage.Visible end)

RunService.RenderStepped:Connect(function()
    local char = player.Character; local hum = char and char:FindFirstChildOfClass("Humanoid")
    local seat = hum and hum.SeatPart
    if seat and seat.Name == "DriveSeat" and seat.Parent and seat.Parent:FindFirstChild("Chassis") then
        local v = seat.Parent.Chassis.AssemblyLinearVelocity
        speedo.Text = tostring(math.floor(Vector3.new(v.X, 0, v.Z).Magnitude)) .. " spd"
    end
end)

RaceEvent.OnClientEvent:Connect(function(p)
    if typeof(p) ~= "table" then return end
    if p.kind == "state" then
        if p.phase == "countdown" then big.Text = tostring(p.info); top.Text = "Get ready... " .. p.info; garage.Visible = false
        elseif p.phase == "race" then big.Text = ""; top.Text = p.title .. "  |  " .. string.format("%.1f", p.info) .. "s"
        elseif p.phase == "results" then big.Text = "Race over - restarting"; top.Text = "Results"; garage.Visible = true; place.Text = "" end
    elseif p.kind == "lap" then lap.Text = "Lap " .. p.lap .. "/" .. p.total
    elseif p.kind == "coins" then coins.Text = "Coins " .. p.amount
    elseif p.kind == "boostmeter" then meterFill.Size = UDim2.new(math.clamp(p.value / 100, 0, 1), 0, 1, 0)
    elseif p.kind == "car" then top.Text = p.name .. " ready"
    elseif p.kind == "finish" then big.Text = "FINISH #" .. p.place; place.Text = "Place #" .. p.place; lap.Text = "+" .. p.prize .. " coins"; task.delay(2.5, function() big.Text = "" end) end
end)
`;
  return {
    serverScript,
    additionalScripts: [{ name: 'RacingHudClient', scriptType: 'LocalScript', container: 'StarterPlayerScripts', source: clientScript }],
  };
}

// Session 419: real, user-verified "99 Nights in the Forest" catalog Models
// (all confirmed renderable via the thumbnails API) keyed by spec vibe so only
// the night/99-Nights parkour preset gets bears/owl/deer/ram + the Fire Morsel
// campfire. Other vibes fall back to procedural trees. Every load is pcall'd and
// runs in task.spawn, so a restricted/removed asset never breaks the course.
const PARKOUR_VIBE_ASSETS: Record<string, { fire?: number; creatures: number[]; sign?: number }> = {
  night: {
    fire: 82051509034737, // 99 Nights — Initial Fire Morsel (campfire)
    creatures: [
      136689985623077, // Bear
      112465932068951, // Polar bear
      82325268253970,  // Owl
      89097886898916,  // Ram Monster
      105990008575555, // Deer rig
      113480154894240, // forest creature
    ],
    sign: 136689985623077, // Bear thumbnail for the start banner
  },
};

// Session 419: themed base environment spliced into the parkour serverScript
// after the start banner. Builds (a) a dark forest ring of procedural trees
// outside the jump radius, (b) a watchtower beacon flanking the start, (c) an
// always-on part campfire at the clearing centre (guaranteed light), then (d)
// async-loads the real 99 Nights Models around the clearing with a rbxthumb
// totem fallback. Lua scope at the splice point already has world/part/makeTree/
// theme/radius (worldVisualsLua + the course header run earlier).
function parkourThemeEnvLua(spec: GameVisualSpec | undefined): string {
  if (!spec || spec.vibe === 'neutral') return '';
  const a = spec.atmosphere;
  const treeKind = safeLuaString(a.treeKind || 'pine', 'pine');
  const leaf = rgbLua(a.treeLeaf);
  const trunk = rgbLua(a.treeTrunk);
  const assets = PARKOUR_VIBE_ASSETS[spec.vibe];
  const creaturesLua = assets ? `{${assets.creatures.join(', ')}}` : '{}';
  const fireLua = assets && assets.fire ? String(assets.fire) : '0';
  return `
-- ===== Session 419: themed base environment (recognizability) =====
do
    -- (a) procedural dark forest ringing the base, outside the jump radius
    for i = 1, 16 do
        local ang = (i / 16) * math.pi * 2 + 0.4
        local r = 58 + (i % 4) * 14
        pcall(function() makeTree(world, Vector3.new(math.cos(ang) * r, 0.5, math.sin(ang) * r), 1.0 + (i % 3) * 0.35, "${treeKind}", ${trunk}, ${leaf}) end)
    end
    -- (b) watchtower silhouette flanking the start (iconic 99 Nights landmark)
    do
        local lp = Vector3.new(-radius - 8, 0, 0)
        for _, o in ipairs({Vector3.new(-3, 0, -3), Vector3.new(3, 0, -3), Vector3.new(-3, 0, 3), Vector3.new(3, 0, 3)}) do
            part("TowerLeg", Vector3.new(1.4, 30, 1.4), lp + o + Vector3.new(0, 15, 0), theme.platform, Enum.Material.Wood)
        end
        part("TowerDeck", Vector3.new(11, 1.2, 11), lp + Vector3.new(0, 30, 0), theme.platform, Enum.Material.WoodPlanks)
        local beacon = part("TowerBeacon", Vector3.new(3.5, 3.5, 3.5), lp + Vector3.new(0, 33, 0), theme.checkpoint, Enum.Material.Neon); beacon.Shape = Enum.PartType.Ball
        local bl = Instance.new("PointLight"); bl.Color = theme.checkpoint; bl.Brightness = 3; bl.Range = 60; bl.Parent = beacon
    end
    -- (c) always-on part campfire at the clearing centre (guaranteed light)
    local function buildPartCampfire(pos)
        for i = 1, 5 do local ang = math.rad(i * 72); local lg = part("CampLog_" .. i, Vector3.new(5, 1.2, 1.2), pos + Vector3.new(math.cos(ang) * 2, 0.6, math.sin(ang) * 2), Color3.fromRGB(86, 58, 38), Enum.Material.Wood); lg.CFrame = CFrame.new(lg.Position) * CFrame.Angles(0, ang, math.rad(24)) end
        local em = part("CampEmbers", Vector3.new(3.4, 2, 3.4), pos + Vector3.new(0, 1.4, 0), Color3.fromRGB(255, 130, 45), Enum.Material.Neon); em.Shape = Enum.PartType.Ball
        local fr = Instance.new("Fire"); fr.Size = 9; fr.Heat = 14; fr.Parent = em
        local pl = Instance.new("PointLight"); pl.Color = Color3.fromRGB(255, 150, 70); pl.Brightness = 4.5; pl.Range = 74; pl.Parent = em
    end
    buildPartCampfire(Vector3.new(0, 1, 0))
    -- (d) real 99 Nights Models, async + non-blocking, with rbxthumb fallback
    local CREATURES = ${creaturesLua}
    local FIRE_ID = ${fireLua}
    task.spawn(function()
        local InsertService = game:GetService("InsertService")
        local function loadModel(assetId, pos, targetH)
            local ok, container = pcall(function() return InsertService:LoadAsset(assetId) end)
            if not ok or not container then return nil end
            local wrap = Instance.new("Model"); wrap.Name = "Asset_" .. assetId; wrap.Parent = world
            for _, c in ipairs(container:GetChildren()) do c.Parent = wrap end
            container:Destroy()
            local hasPart = false
            for _, d in ipairs(wrap:GetDescendants()) do if d:IsA("BasePart") then d.Anchored = true; d.CanCollide = false; hasPart = true end end
            if not hasPart then wrap:Destroy(); return nil end
            local oks, sz = pcall(function() return wrap:GetExtentsSize() end)
            if oks and sz and sz.Y > 0.1 then pcall(function() wrap:ScaleTo(math.clamp((targetH or 9) / sz.Y, 0.04, 16)) end) end
            pcall(function() wrap:PivotTo(CFrame.new(pos) * CFrame.Angles(0, math.random() * 6.283, 0)) end)
            return wrap
        end
        if FIRE_ID > 0 then loadModel(FIRE_ID, Vector3.new(0, 0.5, 0), 7) end
        for idx, id in ipairs(CREATURES) do
            local ang = (idx / math.max(1, #CREATURES)) * math.pi * 2
            local r = 30 + (idx % 3) * 9
            local pos = Vector3.new(math.cos(ang) * r, 1.5, math.sin(ang) * r)
            if not loadModel(id, pos, 9) then
                local post = part("CreaturePost", Vector3.new(1.5, 9, 1.5), pos + Vector3.new(0, 4.5, 0), theme.platform, Enum.Material.Wood)
                local bb = Instance.new("BillboardGui"); bb.Size = UDim2.new(0, 90, 0, 90); bb.StudsOffset = Vector3.new(0, 6, 0); bb.Adornee = post; bb.Parent = post
                local img = Instance.new("ImageLabel"); img.Size = UDim2.new(1, 0, 1, 0); img.BackgroundTransparency = 1; img.Image = "rbxthumb://type=Asset&id=" .. id .. "&w=150&h=150"; img.Parent = bb
            end
        end
    end)
end`;
}

// Session 399 (cont.): Parkour — ascending spiral of floating platforms with
// checkpoints every 5 stages, a void floor that respawns you at your last
// checkpoint (no death), and a finish pad that records Best Time + Wins.
// Difficulty tunes jump gap (angle step) and platform size.
function buildParkourScript(params: GameTemplateParams): MultiScriptResult {
  const titleLua = safeLuaString(params.title, 'Parkour Rush');
  const stageCount = Math.max(5, Math.min(24, Math.round(Number(params.stageCount) || 12)));
  const themeRaw = String(params.mapTheme || '').toLowerCase();
  const parkourTheme = ['neon', 'jungle', 'lava', 'ice'].find((t) => themeRaw.includes(t))
    || (/jungle|forest|tree|green/.test(themeRaw) ? 'jungle'
      : /lava|volcano|fire|magma/.test(themeRaw) ? 'lava'
      : /ice|snow|winter|frost/.test(themeRaw) ? 'ice'
      : 'neon');
  const diffRaw = String(params.difficulty || '').toLowerCase();
  const difficulty = /hard|insane|pro/.test(diffRaw) ? 'hard' : /casual|easy|chill/.test(diffRaw) ? 'casual' : 'normal';
  const themeLua = safeLuaString(parkourTheme, 'neon');
  const difficultyLua = safeLuaString(difficulty, 'normal');

  // Session 414: per-preset palette override for recognizability.
  const spec = params.gameVisualSpec;
  const specThemeLua = (spec && spec.vibe !== 'neutral')
    ? `{platform=${rgbLua(spec.palette.wall)}, platMat=Enum.Material.SmoothPlastic, checkpoint=${rgbLua(spec.palette.accent)}, void=${rgbLua(spec.palette.road)}, voidMat=Enum.Material.Neon}`
    : 'nil';
  const specAtmoLua = spec ? atmosphereOptsLua(spec) : '';

  const serverScript = `local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local DataStoreService = game:GetService("DataStoreService")

local Config = {Title=${titleLua}, Theme=${themeLua}, Stages=${stageCount}, Difficulty=${difficultyLua}}

local THEMES = {
    neon = {platform=Color3.fromRGB(40,150,235), platMat=Enum.Material.SmoothPlastic, checkpoint=Color3.fromRGB(120,255,180), void=Color3.fromRGB(28,20,46), voidMat=Enum.Material.Neon},
    jungle = {platform=Color3.fromRGB(120,90,60), platMat=Enum.Material.Wood, checkpoint=Color3.fromRGB(240,220,120), void=Color3.fromRGB(40,70,45), voidMat=Enum.Material.Grass},
    lava = {platform=Color3.fromRGB(80,72,72), platMat=Enum.Material.Basalt, checkpoint=Color3.fromRGB(255,200,90), void=Color3.fromRGB(225,90,30), voidMat=Enum.Material.Neon},
    ice = {platform=Color3.fromRGB(205,228,246), platMat=Enum.Material.Ice, checkpoint=Color3.fromRGB(120,220,255), void=Color3.fromRGB(110,150,195), voidMat=Enum.Material.Glass},
}
local theme = THEMES[Config.Theme] or THEMES.neon
local SPEC_THEME = ${specThemeLua}
if SPEC_THEME then theme = SPEC_THEME end
local angleStep = Config.Difficulty == "hard" and 0.63 or (Config.Difficulty == "casual" and 0.46 or 0.55)
local platSize = Config.Difficulty == "hard" and 6.5 or (Config.Difficulty == "casual" and 10 or 8)

local dataStore
local okStore, storeErr = pcall(function() dataStore = DataStoreService:GetDataStore("ParkourStats_v1") end)
if not okStore then warn("[Parkour] DataStore unavailable: " .. tostring(storeErr)) end

local remotes = Instance.new("Folder"); remotes.Name = "PkRemotes"; remotes.Parent = ReplicatedStorage
local PkEvent = Instance.new("RemoteEvent"); PkEvent.Name = "PkEvent"; PkEvent.Parent = remotes
local PkAction = Instance.new("RemoteEvent"); PkAction.Name = "PkAction"; PkAction.Parent = remotes
local world = Instance.new("Folder"); world.Name = "GeneratedParkour"; world.Parent = workspace

local function part(name, size, pos, color, mat, parent)
    local p = Instance.new("Part"); p.Name = name; p.Size = size; p.Position = pos; p.Anchored = true; p.Color = color; p.Material = mat or Enum.Material.SmoothPlastic; p.Parent = parent or world; return p
end
local function label3d(adornee, text, offsetY, color)
    local bb = Instance.new("BillboardGui"); bb.Size = UDim2.new(0, 180, 0, 36); bb.StudsOffset = Vector3.new(0, offsetY, 0); bb.AlwaysOnTop = true; bb.Parent = adornee
    local t = Instance.new("TextLabel"); t.Size = UDim2.new(1, 0, 1, 0); t.BackgroundTransparency = 1; t.TextColor3 = color or Color3.fromRGB(255, 255, 255); t.TextStrokeTransparency = 0.3; t.TextScaled = true; t.Font = Enum.Font.GothamBold; t.Text = text; t.Parent = bb
end

local floor = part("VoidFloor", Vector3.new(440, 1, 440), Vector3.new(0, 0, 0), theme.void, theme.voidMat)
${worldVisualsLua()}
setupAtmosphere({${specAtmoLua || `atmoColor = theme.checkpoint:Lerp(Color3.fromRGB(205, 205, 210), 0.55), tint = Color3.fromRGB(252, 250, 248), haze = 2.0, cloudCover = 0.7`}})
-- Session 419: parkour visibility floor. The course is floating platforms high in
-- the air, so a ground "night" mood (brightness 0.55) leaves the next jump
-- invisible. Keep the dark/moody sky but lift the floor; glowing platforms + the
-- campfire carry local visibility.
do
    local L = game:GetService("Lighting")
    if L.Brightness < 1.55 then L.Brightness = 1.55 end
    L.ExposureCompensation = math.max(L.ExposureCompensation, 0.35)
    local function _lift(c, r, g, b) return Color3.new(math.max(c.R, r / 255), math.max(c.G, g / 255), math.max(c.B, b / 255)) end
    L.Ambient = _lift(L.Ambient, 64, 70, 88)
    L.OutdoorAmbient = _lift(L.OutdoorAmbient, 92, 100, 118)
    local _atmo = L:FindFirstChildOfClass("Atmosphere"); if _atmo and _atmo.Haze > 2.0 then _atmo.Haze = 2.0 end
end

local radius = 26
local startPos = Vector3.new(radius, 6, 0)
local startPad = part("StartPad", Vector3.new(18, 1, 18), startPos, theme.checkpoint, Enum.Material.Neon)
local _sl = Instance.new("PointLight"); _sl.Color = theme.checkpoint; _sl.Brightness = 3.2; _sl.Range = 32; _sl.Parent = startPad
label3d(startPad, "START", 4, theme.checkpoint)
local spawnLoc = Instance.new("SpawnLocation"); spawnLoc.Name = "ParkourSpawn"; spawnLoc.Size = Vector3.new(14, 1, 14); spawnLoc.Position = startPos + Vector3.new(0, 1, 0); spawnLoc.Anchored = true; spawnLoc.Color = theme.checkpoint; spawnLoc.Material = Enum.Material.Neon; spawnLoc.Parent = world
${(() => {
  // Session 418: grounded start banner (posts + board) instead of a floating
  // AlwaysOnTop billboard — the hero decal/title wraps a real structure.
  if (!spec || spec.vibe === 'neutral') return '';
  const d = Math.max(0, Math.floor(Number((PARKOUR_VIBE_ASSETS[spec.vibe] && PARKOUR_VIBE_ASSETS[spec.vibe].sign) || spec.heroDecalId) || 0));
  const img = d > 0
    ? `local img = Instance.new("ImageLabel"); img.Size = UDim2.new(0.3, 0, 1, 0); img.BackgroundTransparency = 1; img.Image = "rbxthumb://type=Asset&id=${d}&w=420&h=420"; img.Parent = sg
        local tl = Instance.new("TextLabel"); tl.Size = UDim2.new(0.67, 0, 1, 0); tl.Position = UDim2.new(0.32, 0, 0, 0)`
    : `local tl = Instance.new("TextLabel"); tl.Size = UDim2.new(1, 0, 1, 0)`;
  return `
do
    local bx = startPos
    part("StartSignL", Vector3.new(2, 13, 2), bx + Vector3.new(-12, 6.5, 0), theme.checkpoint, Enum.Material.Metal)
    part("StartSignR", Vector3.new(2, 13, 2), bx + Vector3.new(12, 6.5, 0), theme.checkpoint, Enum.Material.Metal)
    local board = part("StartSignBoard", Vector3.new(26, 7, 1), bx + Vector3.new(0, 13, 0), Color3.fromRGB(16, 18, 26), Enum.Material.SmoothPlastic)
    for _, fc in ipairs({Enum.NormalId.Front, Enum.NormalId.Back}) do
        local sg = Instance.new("SurfaceGui"); sg.Adornee = board; sg.Face = fc; sg.CanvasSize = Vector2.new(780, 200); sg.LightInfluence = 0; sg.Parent = board
        ${img}
        tl.BackgroundTransparency = 1; tl.TextColor3 = Color3.fromRGB(255, 255, 255); tl.TextStrokeTransparency = 0.35; tl.TextScaled = true; tl.Font = Enum.Font.GothamBlack; tl.Text = Config.Title; tl.Parent = sg
    end
end`;
})()}
${parkourThemeEnvLua(spec)}

local checkpointPos = {}
local runState = {}
local function getCp(player) return checkpointPos[player] or (startPos + Vector3.new(0, 4, 0)) end
local function fmt(t) return string.format("%.1f", t) end

local lastPos = startPos
for i = 1, Config.Stages do
    local ang = i * angleStep
    local pos = Vector3.new(math.cos(ang) * radius, 6 + i * 3.0, math.sin(ang) * radius)
    local isCp = (i % 5 == 0)
    local sz = isCp and Vector3.new(12, 1, 12) or Vector3.new(platSize, 1, platSize)
    local plat = part("Stage_" .. i, sz, pos, isCp and theme.checkpoint or theme.platform, isCp and Enum.Material.Neon or theme.platMat)
    local gl = Instance.new("PointLight"); gl.Color = (isCp and theme.checkpoint or theme.platform):Lerp(Color3.fromRGB(255, 255, 255), 0.3); gl.Brightness = isCp and 3.4 or 1.7; gl.Range = isCp and 30 or 16; gl.Parent = plat
    if isCp then
        label3d(plat, "Checkpoint " .. i, 4, theme.checkpoint)
        local beam = part("CpBeacon_" .. i, Vector3.new(1.6, 16, 1.6), pos + Vector3.new(0, 8.5, 0), theme.checkpoint, Enum.Material.Neon); beam.CanCollide = false
    end
    local stageIndex = i
    plat.Touched:Connect(function(hit)
        local player = Players:GetPlayerFromCharacter(hit.Parent); if not player then return end
        local ls = player:FindFirstChild("leaderstats"); local s = ls and ls:FindFirstChild("Stage")
        if s and stageIndex > s.Value then s.Value = stageIndex; PkEvent:FireClient(player, {kind="stage", stage=stageIndex, total=Config.Stages}) end
        if isCp then checkpointPos[player] = pos + Vector3.new(0, 4, 0) end
    end)
    lastPos = pos
end

local fang = (Config.Stages + 1) * angleStep
local finishPos = Vector3.new(math.cos(fang) * radius, 6 + (Config.Stages + 1) * 3.0, math.sin(fang) * radius)
local finish = part("Finish", Vector3.new(20, 1, 20), finishPos, Color3.fromRGB(255, 215, 90), Enum.Material.Neon)
local _fl = Instance.new("PointLight"); _fl.Color = Color3.fromRGB(255, 220, 120); _fl.Brightness = 3.6; _fl.Range = 34; _fl.Parent = finish
label3d(finish, "FINISH", 5, Color3.fromRGB(255, 225, 120))
finish.Touched:Connect(function(hit)
    local player = Players:GetPlayerFromCharacter(hit.Parent); if not player then return end
    local st = runState[player]; if not st or st.done then return end
    st.done = true
    local elapsed = os.clock() - st.start
    local ls = player:FindFirstChild("leaderstats")
    if ls then
        local w = ls:FindFirstChild("Wins"); if w then w.Value += 1 end
        local s = ls:FindFirstChild("Stage"); if s and Config.Stages + 1 > s.Value then s.Value = Config.Stages + 1 end
        local bt = ls:FindFirstChild("Best Time"); local secs = math.floor(elapsed)
        if bt and (bt.Value == 0 or secs < bt.Value) then bt.Value = secs; if dataStore then pcall(function() dataStore:SetAsync("pk_" .. player.UserId, secs) end) end end
    end
    PkEvent:FireClient(player, {kind="finish", time=fmt(elapsed)})
end)

startPad.Touched:Connect(function(hit)
    local player = Players:GetPlayerFromCharacter(hit.Parent); if not player then return end
    local st = runState[player]; if not st then return end
    st.start = os.clock(); st.done = false
    checkpointPos[player] = startPos + Vector3.new(0, 4, 0)
    PkEvent:FireClient(player, {kind="begin"})
end)

floor.Touched:Connect(function(hit)
    local player = Players:GetPlayerFromCharacter(hit.Parent); if not player then return end
    local root = hit.Parent:FindFirstChild("HumanoidRootPart"); if root then root.CFrame = CFrame.new(getCp(player)) end
end)

PkAction.OnServerEvent:Connect(function(player, payload)
    if typeof(payload) == "table" and payload.action == "reset" then
        local root = player.Character and player.Character:FindFirstChild("HumanoidRootPart"); if root then root.CFrame = CFrame.new(getCp(player)) end
    end
end)

local function setupPlayer(player)
    local best = 0
    if dataStore then pcall(function() local v = dataStore:GetAsync("pk_" .. player.UserId); if typeof(v) == "number" then best = v end end) end
    local ls = Instance.new("Folder"); ls.Name = "leaderstats"; ls.Parent = player
    local s = Instance.new("IntValue"); s.Name = "Stage"; s.Value = 0; s.Parent = ls
    local w = Instance.new("IntValue"); w.Name = "Wins"; w.Value = 0; w.Parent = ls
    local bt = Instance.new("IntValue"); bt.Name = "Best Time"; bt.Value = best; bt.Parent = ls
    runState[player] = {start = os.clock(), done = false}
    player.CharacterAdded:Connect(function() local st = runState[player]; if st then st.start = os.clock(); st.done = false end end)
end
Players.PlayerAdded:Connect(setupPlayer)
Players.PlayerRemoving:Connect(function(player) runState[player] = nil; checkpointPos[player] = nil end)
for _, p in Players:GetPlayers() do setupPlayer(p) end

print("[Parkour] " .. Config.Title .. " ready - " .. Config.Stages .. " stages, theme=" .. Config.Theme)
`;
  const clientScript = `local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local player = Players.LocalPlayer
local remotes = ReplicatedStorage:WaitForChild("PkRemotes")
local PkEvent = remotes:WaitForChild("PkEvent")
local PkAction = remotes:WaitForChild("PkAction")

local gui = Instance.new("ScreenGui"); gui.Name = "ParkourHUD"; gui.ResetOnSpawn = false; gui.IgnoreGuiInset = true; gui.Parent = player:WaitForChild("PlayerGui")
local stageLabel = Instance.new("TextLabel"); stageLabel.Size = UDim2.new(0, 220, 0, 48); stageLabel.Position = UDim2.new(0.5, -110, 0, 12); stageLabel.BackgroundColor3 = Color3.fromRGB(16, 18, 26); stageLabel.BackgroundTransparency = 0.1; stageLabel.TextColor3 = Color3.fromRGB(225, 240, 255); stageLabel.TextScaled = true; stageLabel.Font = Enum.Font.GothamBlack; stageLabel.Text = "Stage 0"; stageLabel.Parent = gui
local sc = Instance.new("UICorner"); sc.CornerRadius = UDim.new(0, 10); sc.Parent = stageLabel
local timeLabel = Instance.new("TextLabel"); timeLabel.Size = UDim2.new(0, 150, 0, 40); timeLabel.Position = UDim2.new(0, 14, 0, 12); timeLabel.BackgroundColor3 = Color3.fromRGB(22, 30, 44); timeLabel.BackgroundTransparency = 0.1; timeLabel.TextColor3 = Color3.fromRGB(160, 220, 255); timeLabel.TextScaled = true; timeLabel.Font = Enum.Font.GothamBold; timeLabel.Text = "0.0s"; timeLabel.Parent = gui
local tc = Instance.new("UICorner"); tc.CornerRadius = UDim.new(0, 10); tc.Parent = timeLabel
local resetBtn = Instance.new("TextButton"); resetBtn.Size = UDim2.new(0, 200, 0, 46); resetBtn.Position = UDim2.new(0.5, -100, 1, -64); resetBtn.BackgroundColor3 = Color3.fromRGB(60, 50, 70); resetBtn.TextColor3 = Color3.fromRGB(235, 230, 250); resetBtn.TextScaled = true; resetBtn.Font = Enum.Font.GothamBold; resetBtn.Text = "Reset to checkpoint"; resetBtn.Parent = gui
local rbc = Instance.new("UICorner"); rbc.CornerRadius = UDim.new(0, 10); rbc.Parent = resetBtn
resetBtn.Activated:Connect(function() PkAction:FireServer({action="reset"}) end)
local banner = Instance.new("TextLabel"); banner.Size = UDim2.new(0, 420, 0, 60); banner.Position = UDim2.new(0.5, -210, 0.42, 0); banner.BackgroundTransparency = 1; banner.TextColor3 = Color3.fromRGB(255, 235, 130); banner.TextStrokeTransparency = 0.2; banner.TextScaled = true; banner.Font = Enum.Font.GothamBlack; banner.Text = ""; banner.Parent = gui

local running = true
local elapsed = 0
RunService.Heartbeat:Connect(function(dt) if running then elapsed += dt; timeLabel.Text = string.format("%.1f", elapsed) .. "s" end end)

PkEvent.OnClientEvent:Connect(function(p)
    if typeof(p) ~= "table" then return end
    if p.kind == "begin" then running = true; elapsed = 0; banner.Text = ""
    elseif p.kind == "stage" then stageLabel.Text = "Stage " .. p.stage .. "/" .. p.total
    elseif p.kind == "finish" then running = false; banner.Text = "FINISH! " .. p.time .. "s"; stageLabel.Text = "Complete!" end
end)
`;
  return {
    serverScript,
    additionalScripts: [{ name: 'ParkourHudClient', scriptType: 'LocalScript', container: 'StarterPlayerScripts', source: clientScript }],
  };
}

// Session 399 (cont.): Story Game — a linear narrative walk. Themed chapter
// zones along a path; entering the next zone advances the story and reveals a
// narrative beat. Narrator NPCs replay beats. leaderstats Chapter. Beats are
// deterministic per theme (fantasy/scifi/mystery/horror).
function buildStoryGameScript(params: GameTemplateParams): MultiScriptResult {
  const titleLua = safeLuaString(params.title, 'Untold Story');
  const chapterCount = Math.max(3, Math.min(8, Math.round(Number(params.chapterCount) || 6)));
  const themeRaw = String(params.mapTheme || '').toLowerCase();
  const storyTheme = ['fantasy', 'scifi', 'mystery', 'horror'].find((t) => themeRaw.includes(t))
    || (/sci|space|robot|cyber|future/.test(themeRaw) ? 'scifi'
      : /mystery|detective|crime|noir/.test(themeRaw) ? 'mystery'
      : /horror|scary|dark|haunt/.test(themeRaw) ? 'horror'
      : 'fantasy');
  const themeLua = safeLuaString(storyTheme, 'fantasy');

  // Session 414: per-preset palette override for recognizability. clock follows
  // the vibe so a monster/night story is dark, a lab story is dim.
  const spec = params.gameVisualSpec;
  const specClock = spec ? (spec.vibe === 'monster' || spec.vibe === 'night' ? 2 : spec.vibe === 'lab' ? 8 : 14) : 14;
  const specThemeLua = (spec && spec.vibe !== 'neutral')
    ? `{floor=${rgbLua(spec.palette.ground)}, floorMat=Enum.Material.${spec.palette.groundMaterial}, gate=${rgbLua(spec.palette.roof)}, decor=${rgbLua(spec.palette.accent)}, accent=${rgbLua(spec.palette.accent)}, clock=${specClock}}`
    : 'nil';
  const specAtmoLua = spec ? atmosphereOptsLua(spec) : '';

  const serverScript = `local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Lighting = game:GetService("Lighting")

local Config = {Title=${titleLua}, Theme=${themeLua}, Chapters=${chapterCount}}

local THEMES = {
    fantasy = {floor=Color3.fromRGB(110,150,90), floorMat=Enum.Material.Grass, gate=Color3.fromRGB(150,120,80), decor=Color3.fromRGB(90,200,150), accent=Color3.fromRGB(255,230,140), clock=14},
    scifi = {floor=Color3.fromRGB(54,60,78), floorMat=Enum.Material.Metal, gate=Color3.fromRGB(70,80,110), decor=Color3.fromRGB(90,220,255), accent=Color3.fromRGB(150,255,210), clock=10},
    mystery = {floor=Color3.fromRGB(70,72,82), floorMat=Enum.Material.Slate, gate=Color3.fromRGB(96,90,80), decor=Color3.fromRGB(200,180,120), accent=Color3.fromRGB(230,200,120), clock=2},
    horror = {floor=Color3.fromRGB(44,42,48), floorMat=Enum.Material.Concrete, gate=Color3.fromRGB(60,54,54), decor=Color3.fromRGB(150,40,50), accent=Color3.fromRGB(200,60,70), clock=0},
}
local theme = THEMES[Config.Theme] or THEMES.fantasy
local SPEC_THEME = ${specThemeLua}
if SPEC_THEME then theme = SPEC_THEME end
Lighting.ClockTime = theme.clock

local BEATS = {
    fantasy = {"You awaken at the edge of the Kingdom of Aethel. A voice calls you north.", "The Whispering Woods part before you. Something watches from the leaves.", "A ruined bridge. You leap across and find an old knight's blade.", "The Crystal Caverns glow. You hear the dragon stir below.", "A village begs for help. You vow to end the curse.", "The Dark Tower looms. Its gate creaks open for you alone.", "Face to face with the Shadow King. Steel your heart.", "The curse breaks. Dawn returns to Aethel. You are the hero."},
    scifi = {"Your cryo-pod opens aboard the derelict Station Vega. Alarms blare.", "The corridors are dark. A rogue AI reroutes the doors.", "You reach the reactor. Coolant is failing fast.", "An escape bay - but the AI locked the launch codes.", "You splice the mainframe and learn the truth about the crew.", "The AI core chamber. It pleads, then attacks.", "Override accepted. The station's fate is in your hands.", "You launch free as Vega burns. Stars stretch ahead."},
    mystery = {"Rain on Blackwood Manor. A guest is dead. You are the detective.", "The study holds a torn letter and a missing key.", "The maid lies - her alibi doesn't match the clock.", "A hidden passage behind the bookshelf. Footprints lead down.", "The cellar reveals the stolen inheritance.", "You gather the suspects in the drawing room.", "The truth: it was the one no one suspected.", "Case closed. The rain finally stops over Blackwood."},
    horror = {"The asylum gate locks behind you. The lights flicker out.", "Wet footsteps echo. They aren't yours.", "Ward C. The walls are scratched from the inside.", "You find a tape recorder. The voice begs you to run.", "The thing in the dark knows your name.", "The chapel. Candles relight themselves one by one.", "You face it. Do not blink.", "Sunrise. You walk out alive - but it followed."},
}
local beats = BEATS[Config.Theme] or BEATS.fantasy

local remotes = Instance.new("Folder"); remotes.Name = "StRemotes"; remotes.Parent = ReplicatedStorage
local StEvent = Instance.new("RemoteEvent"); StEvent.Name = "StEvent"; StEvent.Parent = remotes
local world = Instance.new("Folder"); world.Name = "GeneratedStory"; world.Parent = workspace

local function part(name, size, pos, color, mat, parent)
    local p = Instance.new("Part"); p.Name = name; p.Size = size; p.Position = pos; p.Anchored = true; p.Color = color; p.Material = mat or Enum.Material.SmoothPlastic; p.Parent = parent or world; return p
end
local function label3d(adornee, text, offsetY, color)
    local bb = Instance.new("BillboardGui"); bb.Size = UDim2.new(0, 200, 0, 38); bb.StudsOffset = Vector3.new(0, offsetY, 0); bb.AlwaysOnTop = true; bb.Parent = adornee
    local t = Instance.new("TextLabel"); t.Size = UDim2.new(1, 0, 1, 0); t.BackgroundTransparency = 1; t.TextColor3 = color or Color3.fromRGB(255, 255, 255); t.TextStrokeTransparency = 0.3; t.TextScaled = true; t.Font = Enum.Font.GothamBold; t.Text = text; t.Parent = bb
end

local spawnLoc = Instance.new("SpawnLocation"); spawnLoc.Name = "StorySpawn"; spawnLoc.Size = Vector3.new(20, 1, 16); spawnLoc.Position = Vector3.new(0, 1, -8); spawnLoc.Anchored = true; spawnLoc.Color = theme.accent; spawnLoc.Material = Enum.Material.Neon; spawnLoc.Parent = world
${themedSpawnBillboardLua(spec)}
label3d(spawnLoc, Config.Title, 7, theme.accent)
part("PathStart", Vector3.new(40, 1, 24), Vector3.new(0, 0, -8), theme.floor, theme.floorMat)
${worldVisualsLua()}
setupAtmosphere({${specAtmoLua || `atmoColor = theme.accent:Lerp(Color3.fromRGB(150, 150, 160), 0.45), tint = Color3.fromRGB(250, 248, 246), brightness = 2.0, haze = 2.2`}})

local function buildChapter(i)
    local z = i * 60
    part("Floor_" .. i, Vector3.new(44, 1, 56), Vector3.new(0, 0, z), theme.floor, theme.floorMat)
    part("PillarL_" .. i, Vector3.new(4, 26, 4), Vector3.new(-20, 13, z - 26), theme.gate, Enum.Material.Concrete)
    part("PillarR_" .. i, Vector3.new(4, 26, 4), Vector3.new(20, 13, z - 26), theme.gate, Enum.Material.Concrete)
    local lintel = part("Lintel_" .. i, Vector3.new(46, 5, 4), Vector3.new(0, 24, z - 26), theme.gate, Enum.Material.Concrete)
    label3d(lintel, "Chapter " .. i, 4, theme.accent)
    part("Glow_" .. i, Vector3.new(8, 8, 8), Vector3.new(-14, 5, z + 8), theme.decor, Enum.Material.Neon)
    part("Glow2_" .. i, Vector3.new(6, 6, 6), Vector3.new(15, 4, z + 12), theme.decor, Enum.Material.Neon)
    -- narrator NPC
    local body = part("Narrator_" .. i, Vector3.new(3, 7, 2), Vector3.new(12, 4, z), Color3.fromRGB(220, 210, 190), Enum.Material.SmoothPlastic)
    local head = part("NarratorHead_" .. i, Vector3.new(2, 2, 2), Vector3.new(12, 8.5, z), Color3.fromRGB(235, 225, 205), Enum.Material.SmoothPlastic); head.CanCollide = false
    label3d(head, "Narrator", 2.2, theme.accent)
    local talk = Instance.new("ProximityPrompt"); talk.ActionText = "Talk"; talk.ObjectText = "Chapter " .. i; talk.HoldDuration = 0; talk.MaxActivationDistance = 12; talk.RequiresLineOfSight = false; talk.Parent = body
    talk.Triggered:Connect(function(player) StEvent:FireClient(player, {kind="beat", chapter=i, total=Config.Chapters, text=beats[i] or "..."}) end)
    -- advance trigger
    local trig = Instance.new("Part"); trig.Name = "Trigger_" .. i; trig.Anchored = true; trig.CanCollide = false; trig.Transparency = 1; trig.Size = Vector3.new(44, 22, 6); trig.Position = Vector3.new(0, 11, z); trig.Parent = world
    trig.Touched:Connect(function(hit)
        local player = Players:GetPlayerFromCharacter(hit.Parent); if not player then return end
        local ls = player:FindFirstChild("leaderstats"); local ch = ls and ls:FindFirstChild("Chapter"); if not ch then return end
        if ch.Value == i - 1 then
            ch.Value = i
            StEvent:FireClient(player, {kind="beat", chapter=i, total=Config.Chapters, text=beats[i] or "..."})
            if i >= Config.Chapters then StEvent:FireClient(player, {kind="end", title=Config.Title}) end
        end
    end)
end
for i = 1, Config.Chapters do buildChapter(i) end

local function setupPlayer(player)
    local ls = Instance.new("Folder"); ls.Name = "leaderstats"; ls.Parent = player
    local ch = Instance.new("IntValue"); ch.Name = "Chapter"; ch.Value = 0; ch.Parent = ls
end
Players.PlayerAdded:Connect(setupPlayer)
for _, p in Players:GetPlayers() do setupPlayer(p) end

print("[Story] " .. Config.Title .. " ready - " .. Config.Chapters .. " chapters, theme=" .. Config.Theme)
`;
  const clientScript = `local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local player = Players.LocalPlayer
local remotes = ReplicatedStorage:WaitForChild("StRemotes")
local StEvent = remotes:WaitForChild("StEvent")

local gui = Instance.new("ScreenGui"); gui.Name = "StoryHUD"; gui.ResetOnSpawn = false; gui.IgnoreGuiInset = true; gui.Parent = player:WaitForChild("PlayerGui")
local chapterLabel = Instance.new("TextLabel"); chapterLabel.Size = UDim2.new(0, 300, 0, 46); chapterLabel.Position = UDim2.new(0.5, -150, 0, 12); chapterLabel.BackgroundColor3 = Color3.fromRGB(16, 18, 26); chapterLabel.BackgroundTransparency = 0.15; chapterLabel.TextColor3 = Color3.fromRGB(235, 225, 200); chapterLabel.TextScaled = true; chapterLabel.Font = Enum.Font.GothamBlack; chapterLabel.Text = "Walk forward to begin"; chapterLabel.Parent = gui
local cc = Instance.new("UICorner"); cc.CornerRadius = UDim.new(0, 10); cc.Parent = chapterLabel
local box = Instance.new("TextLabel"); box.Size = UDim2.new(0, 720, 0, 96); box.Position = UDim2.new(0.5, -360, 1, -120); box.BackgroundColor3 = Color3.fromRGB(12, 14, 20); box.BackgroundTransparency = 0.12; box.TextColor3 = Color3.fromRGB(240, 238, 230); box.TextScaled = true; box.Font = Enum.Font.Gotham; box.TextWrapped = true; box.Text = ""; box.Visible = false; box.Parent = gui
local bc = Instance.new("UICorner"); bc.CornerRadius = UDim.new(0, 12); bc.Parent = box
local pad = Instance.new("UIPadding"); pad.PaddingLeft = UDim.new(0, 16); pad.PaddingRight = UDim.new(0, 16); pad.Parent = box

local function showBeat(text)
    box.Text = text; box.Visible = true
    task.delay(7, function() if box.Text == text then box.Visible = false end end)
end
StEvent.OnClientEvent:Connect(function(p)
    if typeof(p) ~= "table" then return end
    if p.kind == "beat" then chapterLabel.Text = "Chapter " .. p.chapter .. "/" .. p.total; showBeat(p.text)
    elseif p.kind == "end" then chapterLabel.Text = "THE END"; showBeat("THE END - thanks for playing " .. p.title .. "!") end
end)
`;
  return {
    serverScript,
    additionalScripts: [{ name: 'StoryHudClient', scriptType: 'LocalScript', container: 'StarterPlayerScripts', source: clientScript }],
  };
}

/**
 * Session 399 ("wow" pass): shared visual-quality Lua layer for generated
 * worlds. Cinematic atmosphere/lighting/clouds + procedural nature (multi-part
 * trees, rock clusters, grass tufts) + Terrain ground/water — no external asset
 * IDs (moderation-safe). Any genre builder can splice this into its serverScript
 * (it defines `local function`s in scope) and then call setupAtmosphere{...},
 * buildTerrainGround{...}, makeTree(...), makeRock(...), makeGrassTuft(...).
 */
function worldVisualsLua(): string {
  return `
-- ===== Generated Visual Layer (Session 399) =====
local _Lighting = game:GetService("Lighting")
local _Terrain = workspace.Terrain
local ambientEmitter

local function _vpart(parent, name, shape, size, cframe, color, material, collide)
    local p = Instance.new("Part"); p.Name = name; p.Anchored = true; p.CanCollide = collide or false
    p.Size = size; p.CFrame = cframe; p.Color = color; p.Material = material or Enum.Material.SmoothPlastic
    if shape then p.Shape = shape end
    p.Parent = parent; return p
end

local function setupAtmosphere(opts)
    opts = opts or {}
    _Lighting.Brightness = opts.brightness or 2.6
    _Lighting.ExposureCompensation = opts.exposure or 0.2
    _Lighting.Ambient = opts.ambient or Color3.fromRGB(70, 80, 95)
    _Lighting.OutdoorAmbient = opts.outdoor or Color3.fromRGB(150, 158, 172)
    _Lighting.EnvironmentDiffuseScale = 0.65
    _Lighting.EnvironmentSpecularScale = 0.7
    _Lighting.GlobalShadows = true
    if opts.clockTime then _Lighting.ClockTime = opts.clockTime end
    pcall(function() _Lighting.Technology = Enum.Technology.Future end)
    local function ensure(cls)
        local e = _Lighting:FindFirstChildOfClass(cls); if not e then e = Instance.new(cls); e.Parent = _Lighting end; return e
    end
    local atmo = ensure("Atmosphere"); atmo.Density = opts.density or 0.34; atmo.Offset = 0.1; atmo.Color = opts.atmoColor or Color3.fromRGB(199, 175, 130); atmo.Decay = opts.decay or Color3.fromRGB(104, 112, 128); atmo.Glare = 0.4; atmo.Haze = opts.haze or 1.8
    local bloom = ensure("BloomEffect"); bloom.Intensity = opts.bloom or 0.6; bloom.Size = 24; bloom.Threshold = 0.85
    local cc = ensure("ColorCorrectionEffect"); cc.Brightness = 0; cc.Contrast = opts.contrast or 0.14; cc.Saturation = opts.saturation or 0.2; cc.TintColor = opts.tint or Color3.fromRGB(255, 250, 244)
    local sun = ensure("SunRaysEffect"); sun.Intensity = 0.16; sun.Spread = 0.82
    if _Terrain then
        local clouds = _Terrain:FindFirstChildOfClass("Clouds"); if not clouds then clouds = Instance.new("Clouds"); clouds.Parent = _Terrain end
        clouds.Cover = opts.cloudCover or 0.6; clouds.Density = opts.cloudDensity or 0.45; clouds.Color = Color3.fromRGB(245, 248, 255)
    end
    if ambientEmitter then ambientEmitter(workspace, opts.fx or "motes", opts.fxColor) end
end

-- kind: "palm" | "pine" | "round" | "dead"
local function makeTree(parent, pos, scale, kind, trunkColor, leafColor)
    scale = scale or 1
    trunkColor = trunkColor or Color3.fromRGB(104, 74, 48)
    leafColor = leafColor or Color3.fromRGB(74, 134, 70)
    local m = Instance.new("Model"); m.Name = "Tree"; m.Parent = parent
    local th = 12 * scale
    -- Roblox Cylinder length runs along its LOCAL X axis, so we size X = height
    -- and rotate X->Y (Z by 90deg) to stand the trunk upright. (Bug fix: trunk
    -- was a flat disc, leaving foliage floating above a stump.)
    local trunk = _vpart(m, "Trunk", Enum.PartType.Cylinder, Vector3.new(th, 2.6 * scale, 2.6 * scale), CFrame.new(pos + Vector3.new(0, th / 2, 0)) * CFrame.Angles(0, 0, math.rad(90)), trunkColor, Enum.Material.Wood, true)
    if kind == "palm" then
        for i = 1, 7 do
            local a = math.rad(i * (360 / 7))
            _vpart(m, "Frond" .. i, nil, Vector3.new(12 * scale, 0.8 * scale, 3.4 * scale), CFrame.new(pos + Vector3.new(0, th, 0)) * CFrame.Angles(0, a, math.rad(-26)) * CFrame.new(5.6 * scale, 0, 0), leafColor, Enum.Material.Grass)
        end
        for i = 1, 3 do
            _vpart(m, "Coco" .. i, Enum.PartType.Ball, Vector3.new(1.8 * scale, 1.8 * scale, 1.8 * scale), CFrame.new(pos + Vector3.new(math.cos(i * 2.1) * 1.4 * scale, th - 1.6 * scale, math.sin(i * 2.1) * 1.4 * scale)), Color3.fromRGB(96, 64, 40), Enum.Material.SmoothPlastic)
        end
    elseif kind == "pine" then
        for i = 0, 3 do
            local s = (11 - i * 2.3) * scale
            _vpart(m, "Canopy" .. i, nil, Vector3.new(s, 4.6 * scale, s), CFrame.new(pos + Vector3.new(0, th - 2 * scale + i * 3 * scale, 0)) * CFrame.Angles(0, math.rad(45), 0), leafColor:Lerp(Color3.new(0, 0, 0), i * 0.05), Enum.Material.Grass)
        end
    elseif kind == "dead" then
        for i = 1, 4 do
            _vpart(m, "Branch" .. i, Enum.PartType.Cylinder, Vector3.new(6 * scale, 0.9 * scale, 0.9 * scale), CFrame.new(pos + Vector3.new(0, th - 1.5 * scale - i * 0.8, 0)) * CFrame.Angles(0, math.rad(i * 95), math.rad(46)) * CFrame.new(3 * scale, 0, 0), trunkColor, Enum.Material.Wood)
        end
    else
        for i = 1, 5 do
            local a = math.rad(i * 72)
            local off = Vector3.new(math.cos(a) * 3 * scale, th + math.sin(i) * 2 * scale, math.sin(a) * 3 * scale)
            _vpart(m, "Leaf" .. i, Enum.PartType.Ball, Vector3.new(8.6 * scale, 8 * scale, 8.6 * scale), CFrame.new(pos + off), leafColor:Lerp(Color3.new(1, 1, 1), (i % 2) * 0.06), Enum.Material.Grass)
        end
        _vpart(m, "LeafTop", Enum.PartType.Ball, Vector3.new(7 * scale, 7 * scale, 7 * scale), CFrame.new(pos + Vector3.new(0, th + 4 * scale, 0)), leafColor, Enum.Material.Grass)
    end
    return m, trunk
end

local function makeRock(parent, pos, scale, color)
    scale = scale or 1
    color = color or Color3.fromRGB(128, 128, 134)
    local m = Instance.new("Model"); m.Name = "Rock"; m.Parent = parent
    local main = _vpart(m, "Rock", Enum.PartType.Ball, Vector3.new(7 * scale, 5.5 * scale, 7 * scale), CFrame.new(pos + Vector3.new(0, 2 * scale, 0)) * CFrame.Angles(math.rad(math.random(0, 35)), math.rad(math.random(0, 360)), math.rad(math.random(0, 35))), color, Enum.Material.Rock, true)
    for i = 1, 3 do
        local off = Vector3.new(math.random(-4, 4) * scale, 0, math.random(-4, 4) * scale)
        _vpart(m, "Chunk" .. i, Enum.PartType.Ball, Vector3.new((3 + math.random(0, 3)) * scale, (2 + math.random(0, 2)) * scale, (3 + math.random(0, 3)) * scale), CFrame.new(pos + off + Vector3.new(0, 1.5 * scale, 0)) * CFrame.Angles(math.rad(math.random(0, 360)), math.rad(math.random(0, 360)), 0), color:Lerp(Color3.new(0, 0, 0), 0.14), Enum.Material.Slate)
    end
    return m, main
end

local function makeGrassTuft(parent, pos, color)
    color = color or Color3.fromRGB(86, 150, 70)
    for i = 1, 4 do
        local a = math.rad(i * 90 + math.random(0, 50))
        _vpart(parent, "Blade", nil, Vector3.new(0.4, 2.4, 0.4), CFrame.new(pos + Vector3.new(math.cos(a) * 1.1, 1.2, math.sin(a) * 1.1)) * CFrame.Angles(math.rad(math.random(-14, 14)), a, 0), color, Enum.Material.Grass)
    end
end

-- Real Roblox character NPC: a proper R15 Humanoid rig via the engine
-- (CreateHumanoidModelFromDescription) so it actually WALKS/RUNS with the
-- default Roblox animation and can chase + attack via Humanoid:MoveTo.
-- Asset-safe (engine rig + Roblox's own free default animation, no Toolbox IDs).
-- Returns model, humanoid, rootPart (or nil on failure -> caller can skip).
local function makeHumanoidNpc(parent, cframe, opts)
    opts = opts or {}
    local ok, npc = pcall(function()
        return game:GetService("Players"):CreateHumanoidModelFromDescription(Instance.new("HumanoidDescription"), Enum.HumanoidRigType.R15)
    end)
    if not ok or not npc then return nil end
    npc.Name = opts.name or "NPC"
    local hum = npc:FindFirstChildOfClass("Humanoid")
    local hrp = npc:FindFirstChild("HumanoidRootPart")
    for _, pt in ipairs(npc:GetDescendants()) do
        if pt:IsA("Shirt") or pt:IsA("Pants") or pt:IsA("ShirtGraphic") or pt:IsA("Decal") or pt:IsA("Accessory") or pt:IsA("BodyColors") then pt:Destroy()
        elseif pt:IsA("BasePart") and opts.color then pt.Color = opts.color; pt.Material = opts.material or Enum.Material.SmoothPlastic end
    end
    if hum then
        hum.WalkSpeed = opts.walkSpeed or 12
        hum.DisplayDistanceType = Enum.HumanoidDisplayDistanceType.None
        hum.HealthDisplayType = Enum.HumanoidHealthDisplayType.AlwaysOff
        if opts.health then hum.MaxHealth = opts.health; hum.Health = opts.health end
        local animate = npc:FindFirstChild("Animate"); if animate then animate:Destroy() end
        local animator = hum:FindFirstChildOfClass("Animator"); if not animator then animator = Instance.new("Animator"); animator.Parent = hum end
        local anim = Instance.new("Animation"); anim.AnimationId = "rbxassetid://" .. (opts.walkAnim or 2510202577)
        local ok2, track = pcall(function() return animator:LoadAnimation(anim) end)
        if ok2 and track then
            track.Looped = true
            hum.Running:Connect(function(spd)
                if spd > 0.5 then if not track.IsPlaying then track:Play(0.1) end; track:AdjustSpeed(math.clamp(spd / 11, 0.7, 1.9)) else track:Stop(0.1) end
            end)
        end
    end
    if opts.eyes and npc:FindFirstChild("Head") then
        local head = npc.Head
        for _, sx in ipairs({-0.32, 0.32}) do
            local eye = Instance.new("Part"); eye.Size = Vector3.new(0.26, 0.26, 0.18); eye.Color = Color3.fromRGB(255, 60, 40); eye.Material = Enum.Material.Neon; eye.CanCollide = false; eye.Massless = true
            local w = Instance.new("Weld"); w.Part0 = head; w.Part1 = eye; w.C0 = CFrame.new(sx, 0.15, -0.58); w.Parent = eye
            eye.Parent = npc
        end
    end
    if cframe then npc:PivotTo(cframe) end
    npc.Parent = parent or workspace
    return npc, hum, hrp
end

-- Flat island plateau (top ~y=1) with optional surrounding Terrain water + beach.
local function buildTerrainGround(opts)
    opts = opts or {}
    if not _Terrain then return end
    pcall(function() _Terrain:Clear() end)
    local size = opts.size or 280
    local mat = opts.material or Enum.Material.Grass
    if opts.water then
        _Terrain:FillBlock(CFrame.new(0, -10, 0), Vector3.new(size * 2.6, 20, size * 2.6), Enum.Material.Water)
        _Terrain.WaterColor = opts.waterColor or Color3.fromRGB(24, 112, 142)
        _Terrain.WaterWaveSize = 0.18; _Terrain.WaterWaveSpeed = 12; _Terrain.WaterTransparency = 0.55; _Terrain.WaterReflectance = 0.9
        if opts.beach then _Terrain:FillBlock(CFrame.new(0, -8.5, 0), Vector3.new(size + 56, 18, size + 56), opts.beach) end
    end
    _Terrain:FillBlock(CFrame.new(0, -9, 0), Vector3.new(size, 20, size), mat)
end

-- ===== Juice layer (game feel) =====
local _Debris = game:GetService("Debris")
local _Tween = game:GetService("TweenService")

-- Floating fade-up feedback text (e.g. "+2 Wood", damage, rewards).
local function floatText(pos, text, color)
    local p = Instance.new("Part"); p.Anchored = true; p.CanCollide = false; p.Transparency = 1; p.Size = Vector3.new(1, 1, 1); p.CFrame = CFrame.new(pos); p.Parent = workspace
    local bb = Instance.new("BillboardGui"); bb.Size = UDim2.new(0, 130, 0, 42); bb.AlwaysOnTop = true; bb.Parent = p
    local t = Instance.new("TextLabel"); t.Size = UDim2.new(1, 0, 1, 0); t.BackgroundTransparency = 1; t.TextColor3 = color or Color3.fromRGB(255, 255, 255); t.TextStrokeTransparency = 0.2; t.TextScaled = true; t.Font = Enum.Font.GothamBlack; t.Text = text; t.Parent = bb
    _Tween:Create(p, TweenInfo.new(1.1, Enum.EasingStyle.Quad), {CFrame = CFrame.new(pos + Vector3.new(0, 6.5, 0))}):Play()
    _Tween:Create(t, TweenInfo.new(1.0), {TextTransparency = 1, TextStrokeTransparency = 1}):Play()
    _Debris:AddItem(p, 1.25)
end

-- One-shot particle burst (gather/hit/build feedback).
local function vfxBurst(pos, color, amount)
    local p = Instance.new("Part"); p.Anchored = true; p.CanCollide = false; p.Transparency = 1; p.Size = Vector3.new(1, 1, 1); p.CFrame = CFrame.new(pos); p.Parent = workspace
    local e = Instance.new("ParticleEmitter"); e.Color = ColorSequence.new(color or Color3.fromRGB(255, 240, 180)); e.Size = NumberSequence.new(1.4, 0); e.Lifetime = NumberRange.new(0.4, 0.75); e.Speed = NumberRange.new(8, 18); e.SpreadAngle = Vector2.new(180, 180); e.Rate = 0; e.Rotation = NumberRange.new(0, 360); e.LightEmission = 0.5; e.Parent = p
    e:Emit(amount or 16)
    _Debris:AddItem(p, 1.0)
end

-- Set-and-forget themed ambient particles over the map. kind: snow|embers|fireflies|motes
ambientEmitter = function(parent, kind, color)
    local p = Instance.new("Part"); p.Name = "AmbientFX"; p.Anchored = true; p.CanCollide = false; p.Transparency = 1; p.Size = Vector3.new(340, 1, 340); p.CFrame = CFrame.new(0, 26, 0); p.Parent = parent or workspace
    local e = Instance.new("ParticleEmitter"); e.LightEmission = 0.6; e.SpreadAngle = Vector2.new(180, 180); e.Parent = p
    e.Color = ColorSequence.new(color or Color3.fromRGB(255, 250, 210))
    if kind == "snow" then e.Color = ColorSequence.new(Color3.fromRGB(245, 250, 255)); e.Size = NumberSequence.new(0.6); e.Lifetime = NumberRange.new(7, 11); e.Speed = NumberRange.new(2, 5); e.Rate = 45; e.Acceleration = Vector3.new(2, -7, 0)
    elseif kind == "embers" then e.Color = ColorSequence.new(Color3.fromRGB(255, 150, 60)); e.Size = NumberSequence.new(0.45, 0); e.Lifetime = NumberRange.new(2, 4); e.Speed = NumberRange.new(1, 4); e.Rate = 16; e.Acceleration = Vector3.new(0, 5, 0)
    elseif kind == "fireflies" then e.Color = ColorSequence.new(Color3.fromRGB(180, 255, 140)); e.Size = NumberSequence.new(0.4); e.Lifetime = NumberRange.new(3, 6); e.Speed = NumberRange.new(0.5, 2); e.Rate = 14
    else e.Size = NumberSequence.new(0.45, 0); e.Lifetime = NumberRange.new(4, 8); e.Speed = NumberRange.new(0.5, 2); e.Rate = 16 end
    return e
end
`;
}

// Session 399 (cont.): Survival — gather wood/stone from nodes, heal at the
// campfire, survive nights when chasing enemies spawn and attack your Humanoid.
// Day/night cycle increments Days survived. leaderstats Days + Wood + Stone.
// Session 399 ("wow" pass): Terrain island + water, cinematic atmosphere,
// procedural trees/rocks, styled enemy creatures, and a crafting bench (wood+
// stone -> defensive walls) so gathered resources have a purpose.
function buildSurvivalScript(params: GameTemplateParams): MultiScriptResult {
  const titleLua = safeLuaString(params.title, 'Last Survivor');
  const dayLength = Math.max(20, Math.min(120, Math.round(Number(params.dayLength) || 45)));
  const startHealth = Math.max(50, Math.min(250, Math.round(Number(params.baseHealth) || 100)));
  const themeRaw = String(params.mapTheme || '').toLowerCase();
  const survivalTheme = ['island', 'forest', 'winter', 'zombie'].find((t) => themeRaw.includes(t))
    || (/forest|jungle|wood|tree/.test(themeRaw) ? 'forest'
      : /winter|snow|ice|arctic/.test(themeRaw) ? 'winter'
      : /zombie|undead|apocalypse|horror/.test(themeRaw) ? 'zombie'
      : 'island');
  const diffRaw = String(params.difficulty || '').toLowerCase();
  const difficulty = /hard|insane|brutal/.test(diffRaw) ? 'hard' : /casual|easy|chill/.test(diffRaw) ? 'casual' : 'normal';
  const themeLua = safeLuaString(survivalTheme, 'island');
  const difficultyLua = safeLuaString(difficulty, 'normal');

  // Session 414: per-preset recognizability. Survival's theme table carries
  // non-color fields (water/treeKind/clock), so merge ONLY the safe color fields
  // (mood/atmosphere/ground) instead of a full replace.
  const spec = params.gameVisualSpec;
  const specMergeLua = (spec && spec.vibe !== 'neutral')
    ? `{groundMat=Enum.Material.${spec.palette.groundMaterial}, atmo=${rgbLua(spec.palette.accent)}, ambient=${rgbLua(spec.palette.road)}, rock=${rgbLua(spec.palette.wall)}}`
    : 'nil';
  const svEnemyRosterLua = (spec && spec.vibe !== 'neutral' && spec.enemies && spec.enemies.length)
    ? `{ ${spec.enemies.map((e) => `{name=${safeLuaString(e.name, 'Enemy')}, r=${Math.round(e.color[0])}, g=${Math.round(e.color[1])}, b=${Math.round(e.color[2])}, face=${Math.max(0, Math.floor(Number(e.decalId) || 0))}}`).join(', ')} }`
    : 'nil';

  const serverScript = `local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local Lighting = game:GetService("Lighting")

local Config = {Title=${titleLua}, Theme=${themeLua}, DayLength=${dayLength}, StartHealth=${startHealth}, Difficulty=${difficultyLua}}

local THEMES = {
    island = {groundMat=Enum.Material.Grass, water=true, beach=Enum.Material.Sand, waterColor=Color3.fromRGB(28,124,150), treeKind="palm", trunk=Color3.fromRGB(122,86,54), leaf=Color3.fromRGB(86,162,72), rock=Color3.fromRGB(150,140,120), enemy=Color3.fromRGB(120,90,160), atmo=Color3.fromRGB(205,180,135), ambient=Color3.fromRGB(96,102,114), tint=Color3.fromRGB(255,250,238), clock=14},
    forest = {groundMat=Enum.Material.Grass, water=false, treeKind="pine", trunk=Color3.fromRGB(96,66,42), leaf=Color3.fromRGB(58,112,56), rock=Color3.fromRGB(120,122,128), enemy=Color3.fromRGB(90,70,120), atmo=Color3.fromRGB(158,176,156), ambient=Color3.fromRGB(74,86,76), tint=Color3.fromRGB(244,250,242), clock=15},
    winter = {groundMat=Enum.Material.Snow, water=false, treeKind="pine", trunk=Color3.fromRGB(110,96,84), leaf=Color3.fromRGB(150,180,165), rock=Color3.fromRGB(160,170,185), enemy=Color3.fromRGB(120,150,200), atmo=Color3.fromRGB(212,224,238), ambient=Color3.fromRGB(124,136,154), tint=Color3.fromRGB(238,246,255), clock=9},
    zombie = {groundMat=Enum.Material.Ground, water=false, treeKind="dead", trunk=Color3.fromRGB(70,60,48), leaf=Color3.fromRGB(86,96,64), rock=Color3.fromRGB(96,96,100), enemy=Color3.fromRGB(110,150,80), atmo=Color3.fromRGB(122,122,112), ambient=Color3.fromRGB(60,62,60), tint=Color3.fromRGB(228,226,214), clock=6},
}
local theme = THEMES[Config.Theme] or THEMES.island
local SPEC_MERGE = ${specMergeLua}
if SPEC_MERGE then local t = {} for k, v in pairs(theme) do t[k] = v end for k, v in pairs(SPEC_MERGE) do t[k] = v end theme = t end
local diffMult = Config.Difficulty == "hard" and 1.5 or (Config.Difficulty == "casual" and 0.6 or 1.0)
local enemySpeed = 10 * (Config.Difficulty == "hard" and 1.25 or 1)
local enemyDmg = math.floor(6 * diffMult)
local SV_ENEMY_ROSTER = ${svEnemyRosterLua}

local remotes = Instance.new("Folder"); remotes.Name = "SvRemotes"; remotes.Parent = ReplicatedStorage
local SvEvent = Instance.new("RemoteEvent"); SvEvent.Name = "SvEvent"; SvEvent.Parent = remotes
local world = Instance.new("Folder"); world.Name = "GeneratedSurvival"; world.Parent = workspace

local function part(name, size, pos, color, mat, parent)
    local p = Instance.new("Part"); p.Name = name; p.Size = size; p.Position = pos; p.Anchored = true; p.Color = color; p.Material = mat or Enum.Material.SmoothPlastic; p.Parent = parent or world; return p
end
local function label3d(adornee, text, offsetY, color)
    local bb = Instance.new("BillboardGui"); bb.Size = UDim2.new(0, 170, 0, 34); bb.StudsOffset = Vector3.new(0, offsetY, 0); bb.AlwaysOnTop = true; bb.Parent = adornee
    local t = Instance.new("TextLabel"); t.Size = UDim2.new(1, 0, 1, 0); t.BackgroundTransparency = 1; t.TextColor3 = color or Color3.fromRGB(255, 255, 255); t.TextStrokeTransparency = 0.3; t.TextScaled = true; t.Font = Enum.Font.GothamBold; t.Text = text; t.Parent = bb
end

${worldVisualsLua()}

buildTerrainGround({size = 300, material = theme.groundMat, water = theme.water, waterColor = theme.waterColor, beach = theme.beach})
setupAtmosphere({clockTime = theme.clock, ambient = theme.ambient, atmoColor = theme.atmo, tint = theme.tint, haze = theme.water and 2.2 or 1.6, cloudCover = theme.water and 0.55 or 0.45, fx = (Config.Theme == "winter" and "snow") or (Config.Theme == "forest" and "fireflies") or "motes"})

-- Cozy campfire (logs + real Fire + warm light) as the safe heal zone.
part("CampStones", Vector3.new(9, 1, 9), Vector3.new(0, 1.1, 0), Color3.fromRGB(120, 116, 110), Enum.Material.Rock)
part("CampLogs", Vector3.new(5.5, 2, 5.5), Vector3.new(0, 2, 0), Color3.fromRGB(92, 62, 40), Enum.Material.Wood)
local flame = part("CampFlame", Vector3.new(3, 4, 3), Vector3.new(0, 4, 0), Color3.fromRGB(255, 140, 40), Enum.Material.Neon); flame.Shape = Enum.PartType.Ball; flame.CanCollide = false
local fire = Instance.new("Fire"); fire.Size = 14; fire.Heat = 14; fire.Color = Color3.fromRGB(255, 150, 45); fire.SecondaryColor = Color3.fromRGB(255, 92, 24); fire.Parent = flame
local campLight = Instance.new("PointLight"); campLight.Range = 44; campLight.Brightness = 3; campLight.Color = Color3.fromRGB(255, 172, 96); campLight.Parent = flame
label3d(flame, "Campfire (safe zone)", 5, Color3.fromRGB(255, 192, 112))
local campfirePos = Vector3.new(0, 3, 0)
task.spawn(function() while flame and flame.Parent do campLight.Brightness = 2.6 + math.random() * 1.3; task.wait(0.12) end end)
local spawnLoc = Instance.new("SpawnLocation"); spawnLoc.Name = "SurvivalSpawn"; spawnLoc.Size = Vector3.new(16, 1, 16); spawnLoc.Position = Vector3.new(0, 2, 24); spawnLoc.Anchored = true; spawnLoc.Color = Color3.fromRGB(240, 200, 130); spawnLoc.Material = Enum.Material.Neon; spawnLoc.Transparency = 0.4; spawnLoc.Parent = world

-- Decorative nature scatter for a lush, full world (non-harvestable).
for i = 1, 30 do
    local a = math.rad(math.random(0, 360)); local r = 34 + math.random(0, 118)
    local p = Vector3.new(math.cos(a) * r, 1, math.sin(a) * r)
    local roll = math.random(1, 10)
    if roll <= 5 then makeTree(world, p, 0.8 + math.random() * 0.7, theme.treeKind, theme.trunk, theme.leaf)
    elseif roll <= 7 then makeRock(world, p, 0.6 + math.random() * 0.7, theme.rock)
    else makeGrassTuft(world, p, theme.leaf) end
end

local function addResource(player, kind, amount)
    local ls = player:FindFirstChild("leaderstats"); local v = ls and ls:FindFirstChild(kind); if v then v.Value += amount end
end
local function spawnNode(kind, pos)
    local isWood = kind == "Wood"
    local model, main
    if isWood then model, main = makeTree(world, pos, 1.3, theme.treeKind, theme.trunk, theme.leaf)
    else model, main = makeRock(world, pos, 1.2, theme.rock) end
    label3d(main, kind .. " (gather)", isWood and 10 or 6, Color3.fromRGB(255, 255, 255))
    local prompt = Instance.new("ProximityPrompt"); prompt.ActionText = "Gather"; prompt.ObjectText = kind; prompt.HoldDuration = 0.6; prompt.MaxActivationDistance = 14; prompt.RequiresLineOfSight = false; prompt.Parent = main
    prompt.Triggered:Connect(function(player)
        if not prompt.Enabled then return end
        addResource(player, kind, isWood and 2 or 1)
        SvEvent:FireClient(player, {kind="toast", text="+" .. (isWood and 2 or 1) .. " " .. kind})
        vfxBurst(main.Position + Vector3.new(0, 3, 0), isWood and theme.leaf or theme.rock, 14)
        floatText(main.Position + Vector3.new(0, isWood and 13 or 6, 0), "+" .. (isWood and 2 or 1) .. " " .. kind, isWood and Color3.fromRGB(150, 255, 150) or Color3.fromRGB(205, 205, 215))
        prompt.Enabled = false
        for _, pt in ipairs(model:GetDescendants()) do if pt:IsA("BasePart") then pt.Transparency = 0.75 end end
        task.delay(8, function() if model and model.Parent then prompt.Enabled = true; for _, pt in ipairs(model:GetDescendants()) do if pt:IsA("BasePart") then pt.Transparency = 0 end end end end)
    end)
end
for i = 1, 14 do
    local a = math.rad(i * 26); local r = 56 + (i % 3) * 20
    spawnNode((i % 2 == 0) and "Wood" or "Stone", Vector3.new(math.cos(a) * r, 1, math.sin(a) * r))
end

local enemies = {}
local isNight = false
local function spawnEnemy()
    local a = math.random() * math.pi * 2
    local pos = Vector3.new(math.cos(a) * 150, 5, math.sin(a) * 150)
    local ecol, ename, eface = theme.enemy, "Enemy", 0
    if SV_ENEMY_ROSTER then local ec = SV_ENEMY_ROSTER[math.random(#SV_ENEMY_ROSTER)]; if ec then ecol = Color3.fromRGB(ec.r, ec.g, ec.b); ename = ec.name; eface = ec.face or 0 end end
    local npc, hum, hrp = makeHumanoidNpc(world, CFrame.new(pos), {name = ename, color = ecol, walkSpeed = enemySpeed, eyes = true, health = math.floor(60 * diffMult)})
    if not npc or not hum or not hrp then if npc then npc:Destroy() end return end
    local _eh = npc:FindFirstChild("Head")
    if _eh then
        local eb = Instance.new("BillboardGui"); eb.Size = UDim2.new(0, eface > 0 and 80 or 110, 0, eface > 0 and 90 or 24); eb.StudsOffset = Vector3.new(0, eface > 0 and 2.6 or 1.9, 0); eb.AlwaysOnTop = true; eb.Parent = _eh
        if eface > 0 then local ei = Instance.new("ImageLabel"); ei.Size = UDim2.new(1, 0, 1, 0); ei.BackgroundTransparency = 1; ei.Image = "rbxthumb://type=Asset&id=" .. eface .. "&w=420&h=420"; ei.Parent = eb
        else local et = Instance.new("TextLabel"); et.Size = UDim2.new(1, 0, 1, 0); et.BackgroundTransparency = 1; et.TextColor3 = Color3.fromRGB(255, 120, 110); et.TextStrokeTransparency = 0.3; et.TextScaled = true; et.Font = Enum.Font.GothamBold; et.Text = ename; et.Parent = eb end
    end
    local e = {npc = npc, hum = hum, hrp = hrp}
    table.insert(enemies, e)
    -- per-enemy AI: chase the nearest player (real walking via Humanoid:MoveTo) and bite when close.
    task.spawn(function()
        while e.npc and e.npc.Parent and e.hum and e.hum.Health > 0 do
            local nearest, nd, nroot
            for _, p in Players:GetPlayers() do
                local root = p.Character and p.Character:FindFirstChild("HumanoidRootPart")
                if root then local d = (root.Position - e.hrp.Position).Magnitude; if not nd or d < nd then nearest, nd, nroot = p, d, root end end
            end
            if nroot then
                e.hum:MoveTo(nroot.Position)
                if nd and nd < 6 then
                    local h = nearest.Character:FindFirstChildOfClass("Humanoid")
                    if h and h.Health > 0 then h:TakeDamage(enemyDmg); floatText(nroot.Position + Vector3.new(0, 4, 0), "-" .. enemyDmg, Color3.fromRGB(255, 90, 80)) end
                end
            end
            task.wait(0.4)
        end
    end)
end
local function clearEnemies()
    for _, e in ipairs(enemies) do if e.npc then e.npc:Destroy() end end
    table.clear(enemies)
end

-- Crafting bench: turn gathered resources into a defensive wall (resource sink + night defense).
local bench = part("CraftBench", Vector3.new(8, 3, 5), Vector3.new(16, 2.5, 18), Color3.fromRGB(120, 86, 54), Enum.Material.WoodPlanks)
label3d(bench, "Craft: Build Wall (4 Wood, 2 Stone)", 5, Color3.fromRGB(255, 235, 170))
local craftPrompt = Instance.new("ProximityPrompt"); craftPrompt.ActionText = "Build Wall"; craftPrompt.ObjectText = "4 Wood + 2 Stone"; craftPrompt.HoldDuration = 0.4; craftPrompt.MaxActivationDistance = 14; craftPrompt.RequiresLineOfSight = false; craftPrompt.Parent = bench
craftPrompt.Triggered:Connect(function(player)
    local ls = player:FindFirstChild("leaderstats"); local wd = ls and ls:FindFirstChild("Wood"); local st = ls and ls:FindFirstChild("Stone")
    if not (wd and st) then return end
    if wd.Value >= 4 and st.Value >= 2 then
        wd.Value -= 4; st.Value -= 2
        local root = player.Character and player.Character:FindFirstChild("HumanoidRootPart")
        if root then
            local f = root.CFrame.LookVector; local fp = Vector3.new(f.X, 0, f.Z); if fp.Magnitude < 0.1 then fp = Vector3.new(0, 0, 1) end
            local wallPos = root.Position + fp.Unit * 7
            local wall = part("Wall", Vector3.new(12, 9, 1.6), Vector3.new(wallPos.X, 4.5, wallPos.Z), theme.rock, Enum.Material.Brick)
            wall.CanCollide = true; wall.CFrame = CFrame.lookAt(Vector3.new(wallPos.X, 4.5, wallPos.Z), Vector3.new(root.Position.X, 4.5, root.Position.Z))
            vfxBurst(wall.Position, theme.rock, 24)
            floatText(wall.Position + Vector3.new(0, 7, 0), "Wall built!", Color3.fromRGB(255, 235, 170))
        end
        SvEvent:FireClient(player, {kind="toast", text="Built a defensive wall!"})
    else
        SvEvent:FireClient(player, {kind="toast", text="Need 4 Wood + 2 Stone"})
    end
end)

RunService.Heartbeat:Connect(function(dt)
    for _, p in Players:GetPlayers() do
        local char = p.Character; local root = char and char:FindFirstChild("HumanoidRootPart"); local hum = char and char:FindFirstChildOfClass("Humanoid")
        if root and hum and (root.Position - campfirePos).Magnitude < 22 then hum.Health = math.min(hum.MaxHealth, hum.Health + 14 * dt) end
    end
end)

local function setupPlayer(player)
    local ls = Instance.new("Folder"); ls.Name = "leaderstats"; ls.Parent = player
    local d = Instance.new("IntValue"); d.Name = "Days"; d.Value = 0; d.Parent = ls
    local wd = Instance.new("IntValue"); wd.Name = "Wood"; wd.Value = 0; wd.Parent = ls
    local st = Instance.new("IntValue"); st.Name = "Stone"; st.Value = 0; st.Parent = ls
    player.CharacterAdded:Connect(function(char)
        local hum = char:WaitForChild("Humanoid"); hum.MaxHealth = Config.StartHealth; hum.Health = Config.StartHealth
    end)
end
Players.PlayerAdded:Connect(setupPlayer)
for _, p in Players:GetPlayers() do setupPlayer(p) end

task.spawn(function()
    local day = 0
    while true do
        isNight = false; Lighting.ClockTime = 14; clearEnemies()
        SvEvent:FireAllClients({kind="phase", phase="day", day=day, title=Config.Title})
        task.wait(Config.DayLength)
        isNight = true; Lighting.ClockTime = 0
        SvEvent:FireAllClients({kind="phase", phase="night", day=day, title=Config.Title})
        local count = math.floor((4 + day * 1.5) * diffMult); count = math.min(count, 30)
        for i = 1, count do if not isNight then break end spawnEnemy(); task.wait(0.6) end
        task.wait(Config.DayLength)
        day += 1
        for _, p in Players:GetPlayers() do local ls = p:FindFirstChild("leaderstats"); local dv = ls and ls:FindFirstChild("Days"); if dv then dv.Value = day end end
        clearEnemies()
    end
end)
print("[Survival] " .. Config.Title .. " ready - dayLength=" .. Config.DayLength .. ", theme=" .. Config.Theme)
`;
  const clientScript = `local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local player = Players.LocalPlayer
local remotes = ReplicatedStorage:WaitForChild("SvRemotes")
local SvEvent = remotes:WaitForChild("SvEvent")

local gui = Instance.new("ScreenGui"); gui.Name = "SurvivalHUD"; gui.ResetOnSpawn = false; gui.IgnoreGuiInset = true; gui.Parent = player:WaitForChild("PlayerGui")
local top = Instance.new("TextLabel"); top.Size = UDim2.new(0, 360, 0, 50); top.Position = UDim2.new(0.5, -180, 0, 12); top.BackgroundColor3 = Color3.fromRGB(16, 18, 26); top.BackgroundTransparency = 0.12; top.TextColor3 = Color3.fromRGB(230, 235, 245); top.TextScaled = true; top.Font = Enum.Font.GothamBlack; top.Text = "Day 0 - prepare"; top.Parent = gui
local tc = Instance.new("UICorner"); tc.CornerRadius = UDim.new(0, 10); tc.Parent = top
local res = Instance.new("TextLabel"); res.Size = UDim2.new(0, 220, 0, 40); res.Position = UDim2.new(0, 14, 0, 12); res.BackgroundColor3 = Color3.fromRGB(28, 30, 24); res.BackgroundTransparency = 0.12; res.TextColor3 = Color3.fromRGB(210, 230, 170); res.TextScaled = true; res.Font = Enum.Font.GothamBold; res.Text = "Wood 0  Stone 0"; res.Parent = gui
local rc = Instance.new("UICorner"); rc.CornerRadius = UDim.new(0, 10); rc.Parent = res
local toast = Instance.new("TextLabel"); toast.Size = UDim2.new(0, 320, 0, 36); toast.Position = UDim2.new(0.5, -160, 0, 70); toast.BackgroundColor3 = Color3.fromRGB(24, 30, 22); toast.BackgroundTransparency = 0.15; toast.TextColor3 = Color3.fromRGB(215, 240, 180); toast.TextScaled = true; toast.Font = Enum.Font.GothamBold; toast.Visible = false; toast.Parent = gui
local toc = Instance.new("UICorner"); toc.CornerRadius = UDim.new(0, 8); toc.Parent = toast

task.spawn(function()
    local ls = player:WaitForChild("leaderstats")
    local wd = ls:WaitForChild("Wood"); local st = ls:WaitForChild("Stone")
    local function r() res.Text = "Wood " .. wd.Value .. "   Stone " .. st.Value end
    r(); wd.Changed:Connect(r); st.Changed:Connect(r)
end)
SvEvent.OnClientEvent:Connect(function(p)
    if typeof(p) ~= "table" then return end
    if p.kind == "phase" then
        if p.phase == "day" then top.Text = "DAY " .. (p.day + 1) .. " - gather and heal"; top.TextColor3 = Color3.fromRGB(230, 235, 245)
        else top.Text = "NIGHT " .. (p.day + 1) .. " - survive!"; top.TextColor3 = Color3.fromRGB(255, 170, 170) end
    elseif p.kind == "toast" then toast.Text = p.text; toast.Visible = true; task.delay(1.6, function() if toast.Text == p.text then toast.Visible = false end end) end
end)
`;
  return {
    serverScript,
    additionalScripts: [{ name: 'SurvivalHudClient', scriptType: 'LocalScript', container: 'StarterPlayerScripts', source: clientScript }],
  };
}

// Session 399 (cont.): Mini-games Hub — lobby + a shared tile-grid arena that
// rotates 3 elimination modes (Tile Drop / Color Call / Edge Collapse). Fall =
// out (teleport to a spectate pad). Survivors score Points; a lone survivor
// gets a Win. Round loop is endless. leaderstats Points + Wins.
function buildMinigameHubScript(params: GameTemplateParams): MultiScriptResult {
  const titleLua = safeLuaString(params.title, 'Mini Games');
  const themeRaw = String(params.mapTheme || '').toLowerCase();
  const hubTheme = ['party', 'neon', 'classic'].find((t) => themeRaw.includes(t))
    || (/neon|cyber|glow|future/.test(themeRaw) ? 'neon'
      : /classic|retro|simple|grass/.test(themeRaw) ? 'classic'
      : 'party');
  const themeLua = safeLuaString(hubTheme, 'party');

  // Session 414: per-preset palette override for recognizability.
  const spec = params.gameVisualSpec;
  const specThemeLua = (spec && spec.vibe !== 'neutral')
    ? `{lobby=${rgbLua(spec.palette.plaza)}, lobbyMat=Enum.Material.${spec.palette.groundMaterial}, accent=${rgbLua(spec.palette.accent)}}`
    : 'nil';
  const specAtmoLua = spec ? atmosphereOptsLua(spec) : '';

  const serverScript = `local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = {Title=${titleLua}, Theme=${themeLua}}

local THEMES = {
    party = {lobby=Color3.fromRGB(120,90,200), lobbyMat=Enum.Material.SmoothPlastic, accent=Color3.fromRGB(255,200,90)},
    neon = {lobby=Color3.fromRGB(30,34,52), lobbyMat=Enum.Material.Metal, accent=Color3.fromRGB(90,255,210)},
    classic = {lobby=Color3.fromRGB(120,170,95), lobbyMat=Enum.Material.Grass, accent=Color3.fromRGB(255,230,120)},
}
local theme = THEMES[Config.Theme] or THEMES.party
local SPEC_THEME = ${specThemeLua}
if SPEC_THEME then theme = SPEC_THEME end
local COLORS = {Color3.fromRGB(235,90,90), Color3.fromRGB(90,150,235), Color3.fromRGB(110,210,120)}
local CNAMES = {"RED", "BLUE", "GREEN"}

local remotes = Instance.new("Folder"); remotes.Name = "MgRemotes"; remotes.Parent = ReplicatedStorage
local MgEvent = Instance.new("RemoteEvent"); MgEvent.Name = "MgEvent"; MgEvent.Parent = remotes
local world = Instance.new("Folder"); world.Name = "GeneratedHub"; world.Parent = workspace

local function part(name, size, pos, color, mat, parent)
    local p = Instance.new("Part"); p.Name = name; p.Size = size; p.Position = pos; p.Anchored = true; p.Color = color; p.Material = mat or Enum.Material.SmoothPlastic; p.Parent = parent or world; return p
end
local function label3d(adornee, text, offsetY, color)
    local bb = Instance.new("BillboardGui"); bb.Size = UDim2.new(0, 200, 0, 38); bb.StudsOffset = Vector3.new(0, offsetY, 0); bb.AlwaysOnTop = true; bb.Parent = adornee
    local t = Instance.new("TextLabel"); t.Size = UDim2.new(1, 0, 1, 0); t.BackgroundTransparency = 1; t.TextColor3 = color or Color3.fromRGB(255, 255, 255); t.TextStrokeTransparency = 0.3; t.TextScaled = true; t.Font = Enum.Font.GothamBold; t.Text = text; t.Parent = bb
end

local lobby = part("Lobby", Vector3.new(90, 2, 90), Vector3.new(0, 0, 0), theme.lobby, theme.lobbyMat)
${worldVisualsLua()}
setupAtmosphere({${specAtmoLua || `atmoColor = theme.accent:Lerp(Color3.fromRGB(208, 208, 214), 0.55), tint = Color3.fromRGB(253, 251, 250), haze = 1.4, bloom = 0.8`}})
label3d(lobby, Config.Title, 9, theme.accent)
local spawnLoc = Instance.new("SpawnLocation"); spawnLoc.Name = "HubSpawn"; spawnLoc.Size = Vector3.new(20, 1, 20); spawnLoc.Position = Vector3.new(0, 1.5, 0); spawnLoc.Anchored = true; spawnLoc.Color = theme.accent; spawnLoc.Material = Enum.Material.Neon; spawnLoc.Parent = world
${themedSpawnBillboardLua(spec)}
local lobbyPos = Vector3.new(0, 5, 0)

local GRID, TS = 8, 13
local acx, acy, acz = 240, 46, 0
local tiles = {}
for gx = 0, GRID - 1 do
    for gz = 0, GRID - 1 do
        local pos = Vector3.new(acx + (gx - (GRID - 1) / 2) * TS, acy, acz + (gz - (GRID - 1) / 2) * TS)
        local g = ((gx + gz) % 3) + 1
        local tile = part("Tile_" .. gx .. "_" .. gz, Vector3.new(TS - 1, 2, TS - 1), pos, COLORS[g], Enum.Material.SmoothPlastic)
        table.insert(tiles, {part = tile, group = g, pos = pos, dist = math.abs(gx - (GRID - 1) / 2) + math.abs(gz - (GRID - 1) / 2)})
    end
end
part("DeathPlane", Vector3.new(GRID * TS + 160, 1, GRID * TS + 160), Vector3.new(acx, acy - 30, acz), Color3.fromRGB(220, 80, 40), Enum.Material.Neon)
local deathPlane = world:FindFirstChild("DeathPlane")
local specPlatform = part("Spectate", Vector3.new(34, 2, 20), Vector3.new(acx, acy + 4, acz + (GRID * TS) / 2 + 44), theme.lobby, theme.lobbyMat)
label3d(specPlatform, "Spectators", 5, theme.accent)
local spectate = specPlatform.Position + Vector3.new(0, 4, 0)

local inRound = false
local eliminated = {}
local function resetTiles() for _, t in ipairs(tiles) do t.part.CanCollide = true; t.part.Transparency = 0 end end
local function dropTile(t) t.part.CanCollide = false; t.part.Transparency = 0.75 end
local function alivePlayers() local n = 0; for _, p in Players:GetPlayers() do if not eliminated[p] then n += 1 end end; return n end
local function teleport(player, pos) local r = player.Character and player.Character:FindFirstChild("HumanoidRootPart"); if r then r.CFrame = CFrame.new(pos) end end
local function teleportAll(pos) for _, p in Players:GetPlayers() do teleport(p, pos) end end

deathPlane.Touched:Connect(function(hit)
    local player = Players:GetPlayerFromCharacter(hit.Parent); if not player then return end
    if inRound and not eliminated[player] then eliminated[player] = true; teleport(player, spectate); MgEvent:FireClient(player, {kind="out"}) end
end)

local function award(points, winner)
    for _, p in Players:GetPlayers() do
        if not eliminated[p] then local ls = p:FindFirstChild("leaderstats"); local pts = ls and ls:FindFirstChild("Points"); if pts then pts.Value += points end end
    end
    if winner then local ls = winner:FindFirstChild("leaderstats"); local w = ls and ls:FindFirstChild("Wins"); if w then w.Value += 1 end end
end
local function broadcast(phase, text, mode)
    MgEvent:FireAllClients({kind="state", phase=phase, text=text, alive=alivePlayers(), mode=mode or "", title=Config.Title})
end

local function setupPlayer(player)
    local ls = Instance.new("Folder"); ls.Name = "leaderstats"; ls.Parent = player
    local pts = Instance.new("IntValue"); pts.Name = "Points"; pts.Value = 0; pts.Parent = ls
    local w = Instance.new("IntValue"); w.Name = "Wins"; w.Value = 0; w.Parent = ls
end
Players.PlayerAdded:Connect(setupPlayer)
for _, p in Players:GetPlayers() do setupPlayer(p) end

task.spawn(function()
    local round = 0
    while true do
        round += 1
        inRound = false; resetTiles(); table.clear(eliminated)
        teleportAll(lobbyPos)
        local mode = ((round - 1) % 3) + 1
        local modeName = (mode == 1 and "Tile Drop") or (mode == 2 and "Color Call") or "Edge Collapse"
        for t = 5, 1, -1 do broadcast("lobby", modeName .. " in " .. t .. "s", modeName); task.wait(1) end
        for _, p in Players:GetPlayers() do eliminated[p] = false; teleport(p, tiles[math.random(1, #tiles)].pos + Vector3.new(0, 4, 0)) end
        inRound = true; broadcast("arena", modeName .. "!", modeName); task.wait(2)
        if mode == 1 then
            local order = {}; for i = 1, #tiles do order[i] = i end
            for i = #order, 2, -1 do local j = math.random(1, i); order[i], order[j] = order[j], order[i] end
            local interval = math.max(0.3, 1.3 - round * 0.04)
            for _, idx in ipairs(order) do
                if not inRound then break end
                if alivePlayers() <= 1 and #Players:GetPlayers() > 1 then break end
                dropTile(tiles[idx]); broadcast("arena", "Don't fall!", modeName); task.wait(interval)
            end
        elseif mode == 2 then
            for callN = 1, 8 do
                if not inRound then break end
                if alivePlayers() <= 1 and #Players:GetPlayers() > 1 then break end
                local cg = math.random(1, 3)
                broadcast("arena", "Stand on " .. CNAMES[cg] .. "!", modeName); task.wait(2.4)
                for _, t in ipairs(tiles) do if t.group ~= cg then dropTile(t) end end
                task.wait(1.0); resetTiles()
            end
        else
            local order = {}; for i = 1, #tiles do order[i] = i end
            table.sort(order, function(a, b) return tiles[a].dist > tiles[b].dist end)
            local interval = math.max(0.25, 0.9 - round * 0.02)
            for _, idx in ipairs(order) do
                if not inRound then break end
                if alivePlayers() <= 1 and #Players:GetPlayers() > 1 then break end
                dropTile(tiles[idx]); broadcast("arena", "Floor collapsing inward!", modeName); task.wait(interval)
            end
        end
        inRound = false
        local survivors = alivePlayers()
        local winner = nil
        if survivors == 1 then for _, p in Players:GetPlayers() do if not eliminated[p] then winner = p end end end
        award(10, winner)
        broadcast("result", survivors == 0 and "Everyone fell! Next round..." or (survivors .. " survived! +10 pts"), modeName)
        task.wait(5)
    end
end)
print("[Hub] " .. Config.Title .. " ready - theme=" .. Config.Theme)
`;
  const clientScript = `local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local player = Players.LocalPlayer
local remotes = ReplicatedStorage:WaitForChild("MgRemotes")
local MgEvent = remotes:WaitForChild("MgEvent")

local gui = Instance.new("ScreenGui"); gui.Name = "HubHUD"; gui.ResetOnSpawn = false; gui.IgnoreGuiInset = true; gui.Parent = player:WaitForChild("PlayerGui")
local top = Instance.new("TextLabel"); top.Size = UDim2.new(0, 480, 0, 52); top.Position = UDim2.new(0.5, -240, 0, 12); top.BackgroundColor3 = Color3.fromRGB(16, 18, 26); top.BackgroundTransparency = 0.12; top.TextColor3 = Color3.fromRGB(230, 235, 250); top.TextScaled = true; top.Font = Enum.Font.GothamBlack; top.Text = "Welcome to the hub"; top.Parent = gui
local tc = Instance.new("UICorner"); tc.CornerRadius = UDim.new(0, 10); tc.Parent = top
local sub = Instance.new("TextLabel"); sub.Size = UDim2.new(0, 320, 0, 38); sub.Position = UDim2.new(0.5, -160, 0, 68); sub.BackgroundColor3 = Color3.fromRGB(22, 26, 38); sub.BackgroundTransparency = 0.15; sub.TextColor3 = Color3.fromRGB(180, 220, 255); sub.TextScaled = true; sub.Font = Enum.Font.GothamBold; sub.Text = "Points 0   Alive 0"; sub.Parent = gui
local sc = Instance.new("UICorner"); sc.CornerRadius = UDim.new(0, 8); sc.Parent = sub
local banner = Instance.new("TextLabel"); banner.Size = UDim2.new(0, 420, 0, 70); banner.Position = UDim2.new(0.5, -210, 0.42, 0); banner.BackgroundTransparency = 1; banner.TextColor3 = Color3.fromRGB(255, 120, 120); banner.TextStrokeTransparency = 0.2; banner.TextScaled = true; banner.Font = Enum.Font.GothamBlack; banner.Text = ""; banner.Parent = gui

local myPoints = 0
task.spawn(function()
    local ls = player:WaitForChild("leaderstats"); local pts = ls:WaitForChild("Points")
    local function r() myPoints = pts.Value end
    r(); pts.Changed:Connect(r)
end)
MgEvent.OnClientEvent:Connect(function(p)
    if typeof(p) ~= "table" then return end
    if p.kind == "state" then
        top.Text = p.text; sub.Text = "Points " .. myPoints .. "   Alive " .. p.alive
        if p.phase == "lobby" then banner.Text = "" end
    elseif p.kind == "out" then banner.Text = "OUT! Spectating..."; task.delay(2.5, function() if banner.Text == "OUT! Spectating..." then banner.Text = "" end end) end
end)
`;
  return {
    serverScript,
    additionalScripts: [{ name: 'HubHudClient', scriptType: 'LocalScript', container: 'StarterPlayerScripts', source: clientScript }],
  };
}

// Session 399 (cont.): Fighting — raised ring with melee punches (server-
// authoritative damage + knockback), ring-outs, and KO elimination. Round loop:
// countdown -> fight -> last standing (or most health at time-up) wins a round.
// leaderstats Wins + KOs.
function buildFightingScript(params: GameTemplateParams): MultiScriptResult {
  const titleLua = safeLuaString(params.title, 'Arena Brawl');
  const roundTime = Math.max(20, Math.min(90, Math.round(Number(params.roundTime) || 45)));
  const themeRaw = String(params.mapTheme || '').toLowerCase();
  const arenaTheme = ['dojo', 'street', 'arena', 'space'].find((t) => themeRaw.includes(t))
    || (/street|city|urban/.test(themeRaw) ? 'street'
      : /space|neon|cyber|sci/.test(themeRaw) ? 'space'
      : /dojo|temple|japan|ninja/.test(themeRaw) ? 'dojo'
      : 'arena');
  const diffRaw = String(params.difficulty || '').toLowerCase();
  const difficulty = /hard|insane|pro/.test(diffRaw) ? 'hard' : /casual|easy|chill/.test(diffRaw) ? 'casual' : 'normal';
  const themeLua = safeLuaString(arenaTheme, 'arena');
  const difficultyLua = safeLuaString(difficulty, 'normal');

  // Session 414: per-preset palette override for recognizability.
  const spec = params.gameVisualSpec;
  const specThemeLua = (spec && spec.vibe !== 'neutral')
    ? `{floor=${rgbLua(spec.palette.ground)}, floorMat=Enum.Material.${spec.palette.groundMaterial}, kerb=${rgbLua(spec.palette.roof)}, accent=${rgbLua(spec.palette.accent)}}`
    : 'nil';
  const specAtmoLua = spec ? atmosphereOptsLua(spec) : '';

  const serverScript = `local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = {Title=${titleLua}, Theme=${themeLua}, RoundTime=${roundTime}, Difficulty=${difficultyLua}}

local THEMES = {
    dojo = {floor=Color3.fromRGB(180,140,90), floorMat=Enum.Material.WoodPlanks, kerb=Color3.fromRGB(120,60,50), accent=Color3.fromRGB(230,90,80)},
    street = {floor=Color3.fromRGB(80,82,88), floorMat=Enum.Material.Concrete, kerb=Color3.fromRGB(50,52,58), accent=Color3.fromRGB(255,170,70)},
    arena = {floor=Color3.fromRGB(150,150,160), floorMat=Enum.Material.Slate, kerb=Color3.fromRGB(90,92,100), accent=Color3.fromRGB(255,210,90)},
    space = {floor=Color3.fromRGB(36,40,58), floorMat=Enum.Material.Metal, kerb=Color3.fromRGB(60,68,96), accent=Color3.fromRGB(150,255,210)},
}
local theme = THEMES[Config.Theme] or THEMES.arena
local SPEC_THEME = ${specThemeLua}
if SPEC_THEME then theme = SPEC_THEME end
local punchDmg = Config.Difficulty == "hard" and 24 or (Config.Difficulty == "casual" and 12 or 17)

local remotes = Instance.new("Folder"); remotes.Name = "FtRemotes"; remotes.Parent = ReplicatedStorage
local FtEvent = Instance.new("RemoteEvent"); FtEvent.Name = "FtEvent"; FtEvent.Parent = remotes
local FtAction = Instance.new("RemoteEvent"); FtAction.Name = "FtAction"; FtAction.Parent = remotes
local world = Instance.new("Folder"); world.Name = "GeneratedArena"; world.Parent = workspace

local function part(name, size, pos, color, mat, parent)
    local p = Instance.new("Part"); p.Name = name; p.Size = size; p.Position = pos; p.Anchored = true; p.Color = color; p.Material = mat or Enum.Material.SmoothPlastic; p.Parent = parent or world; return p
end
local function label3d(adornee, text, offsetY, color)
    local bb = Instance.new("BillboardGui"); bb.Size = UDim2.new(0, 200, 0, 38); bb.StudsOffset = Vector3.new(0, offsetY, 0); bb.AlwaysOnTop = true; bb.Parent = adornee
    local t = Instance.new("TextLabel"); t.Size = UDim2.new(1, 0, 1, 0); t.BackgroundTransparency = 1; t.TextColor3 = color or Color3.fromRGB(255, 255, 255); t.TextStrokeTransparency = 0.3; t.TextScaled = true; t.Font = Enum.Font.GothamBold; t.Text = text; t.Parent = bb
end

local ring = part("Ring", Vector3.new(64, 2, 64), Vector3.new(0, 20, 0), theme.floor, theme.floorMat)
${worldVisualsLua()}
setupAtmosphere({${specAtmoLua || `atmoColor = theme.accent:Lerp(Color3.fromRGB(205, 205, 210), 0.55), tint = Color3.fromRGB(252, 250, 248), haze = 1.6, fx = "embers"`}})
label3d(ring, Config.Title, 18, theme.accent)
local kerbs = {{Vector3.new(64, 3, 3), Vector3.new(0, 22, 32)}, {Vector3.new(64, 3, 3), Vector3.new(0, 22, -32)}, {Vector3.new(3, 3, 64), Vector3.new(32, 22, 0)}, {Vector3.new(3, 3, 64), Vector3.new(-32, 22, 0)}}
for i, k in ipairs(kerbs) do part("Kerb_" .. i, k[1], k[2], theme.kerb, Enum.Material.Metal) end
part("RingOut", Vector3.new(280, 1, 280), Vector3.new(0, 4, 0), Color3.fromRGB(40, 44, 60), Enum.Material.SmoothPlastic)
local ringOut = world:FindFirstChild("RingOut")
local spawnLoc = Instance.new("SpawnLocation"); spawnLoc.Name = "ArenaSpawn"; spawnLoc.Size = Vector3.new(10, 1, 10); spawnLoc.Position = Vector3.new(0, 21.5, 0); spawnLoc.Anchored = true; spawnLoc.Color = theme.accent; spawnLoc.Material = Enum.Material.Neon; spawnLoc.Parent = world
${themedSpawnBillboardLua(spec)}
local specPad = part("Corner", Vector3.new(30, 2, 14), Vector3.new(0, 22, 70), theme.kerb, theme.floorMat)
label3d(specPad, "KO Corner", 5, theme.accent)
local spectate = specPad.Position + Vector3.new(0, 4, 0)
local pads = {Vector3.new(22, 23, 22), Vector3.new(-22, 23, 22), Vector3.new(22, 23, -22), Vector3.new(-22, 23, -22)}

local fighting = false
local eliminated = {}
local lastHitBy = {}
local punchCd = {}
local function alivePlayers() local n = 0; for _, p in Players:GetPlayers() do if not eliminated[p] then n += 1 end end; return n end
local function teleport(player, pos) local r = player.Character and player.Character:FindFirstChild("HumanoidRootPart"); if r then r.CFrame = CFrame.new(pos) end end
local function setSpeed(player, s) local hum = player.Character and player.Character:FindFirstChildOfClass("Humanoid"); if hum then hum.WalkSpeed = s end end
local function koPlayer(player, attacker)
    if eliminated[player] then return end
    eliminated[player] = true
    if attacker and attacker ~= player then local ls = attacker:FindFirstChild("leaderstats"); local k = ls and ls:FindFirstChild("KOs"); if k then k.Value += 1 end end
    local hum = player.Character and player.Character:FindFirstChildOfClass("Humanoid"); if hum then hum.Health = hum.MaxHealth end
    setSpeed(player, 0); teleport(player, spectate)
    FtEvent:FireClient(player, {kind="ko"})
end

ringOut.Touched:Connect(function(hit)
    local player = Players:GetPlayerFromCharacter(hit.Parent); if not player then return end
    if fighting and not eliminated[player] then koPlayer(player, lastHitBy[player]) end
end)

FtAction.OnServerEvent:Connect(function(player, payload)
    if not fighting or eliminated[player] then return end
    if typeof(payload) ~= "table" or payload.action ~= "punch" then return end
    local now = os.clock()
    if punchCd[player] and now - punchCd[player] < 0.55 then return end
    punchCd[player] = now
    local char = player.Character; local root = char and char:FindFirstChild("HumanoidRootPart"); if not root then return end
    FtEvent:FireAllClients({kind="swing", who=player.UserId})
    for _, other in Players:GetPlayers() do
        if other ~= player and not eliminated[other] then
            local r2 = other.Character and other.Character:FindFirstChild("HumanoidRootPart")
            local hum2 = other.Character and other.Character:FindFirstChildOfClass("Humanoid")
            if r2 and hum2 then
                local to = r2.Position - root.Position; local d = to.Magnitude
                if d <= 10 then
                    lastHitBy[other] = player
                    local dir = (d > 0.1) and to.Unit or root.CFrame.LookVector
                    r2.AssemblyLinearVelocity = dir * 58 + Vector3.new(0, 30, 0)
                    if hum2.Health <= punchDmg then koPlayer(other, player) else hum2:TakeDamage(punchDmg) end
                end
            end
        end
    end
end)

local function setupPlayer(player)
    local ls = Instance.new("Folder"); ls.Name = "leaderstats"; ls.Parent = player
    local w = Instance.new("IntValue"); w.Name = "Wins"; w.Value = 0; w.Parent = ls
    local k = Instance.new("IntValue"); k.Name = "KOs"; k.Value = 0; k.Parent = ls
    player.CharacterAdded:Connect(function() if fighting and eliminated[player] then task.wait(0.4); setSpeed(player, 0); teleport(player, spectate) end end)
end
Players.PlayerAdded:Connect(setupPlayer)
Players.PlayerRemoving:Connect(function(player) eliminated[player] = nil; lastHitBy[player] = nil; punchCd[player] = nil end)
for _, p in Players:GetPlayers() do setupPlayer(p) end

local function broadcast(phase, text, timeLeft)
    FtEvent:FireAllClients({kind="state", phase=phase, text=text, time=timeLeft or 0, alive=alivePlayers(), title=Config.Title})
end

task.spawn(function()
    while true do
        fighting = false; table.clear(eliminated); table.clear(lastHitBy)
        local i = 0
        for _, p in Players:GetPlayers() do
            i += 1; eliminated[p] = false; setSpeed(p, 16)
            local hum = p.Character and p.Character:FindFirstChildOfClass("Humanoid"); if hum then hum.Health = hum.MaxHealth end
            teleport(p, pads[((i - 1) % #pads) + 1])
        end
        for t = 4, 1, -1 do broadcast("countdown", "Fight in " .. t .. "...", t); task.wait(1) end
        fighting = true
        local timeLeft = Config.RoundTime
        while fighting and timeLeft > 0 do
            if alivePlayers() <= 1 and #Players:GetPlayers() > 1 then break end
            broadcast("fight", "FIGHT! Punch nearby foes", timeLeft); task.wait(1); timeLeft -= 1
        end
        fighting = false
        local winner, bestHp
        for _, p in Players:GetPlayers() do
            if not eliminated[p] then
                local hum = p.Character and p.Character:FindFirstChildOfClass("Humanoid"); local hp = hum and hum.Health or 0
                if not bestHp or hp > bestHp then winner, bestHp = p, hp end
            end
        end
        if winner then local ls = winner:FindFirstChild("leaderstats"); local w = ls and ls:FindFirstChild("Wins"); if w then w.Value += 1 end end
        for _, p in Players:GetPlayers() do setSpeed(p, 16) end
        broadcast("result", winner and (winner.DisplayName .. " wins the round!") or "Draw - next round...", 0)
        task.wait(6)
    end
end)
print("[Fighting] " .. Config.Title .. " ready - roundTime=" .. Config.RoundTime .. ", theme=" .. Config.Theme)
`;
  const clientScript = `local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local UserInputService = game:GetService("UserInputService")
local RunService = game:GetService("RunService")
local player = Players.LocalPlayer
local remotes = ReplicatedStorage:WaitForChild("FtRemotes")
local FtEvent = remotes:WaitForChild("FtEvent")
local FtAction = remotes:WaitForChild("FtAction")

local gui = Instance.new("ScreenGui"); gui.Name = "FightingHUD"; gui.ResetOnSpawn = false; gui.IgnoreGuiInset = true; gui.Parent = player:WaitForChild("PlayerGui")
local top = Instance.new("TextLabel"); top.Size = UDim2.new(0, 460, 0, 50); top.Position = UDim2.new(0.5, -230, 0, 12); top.BackgroundColor3 = Color3.fromRGB(16, 18, 26); top.BackgroundTransparency = 0.12; top.TextColor3 = Color3.fromRGB(235, 225, 225); top.TextScaled = true; top.Font = Enum.Font.GothamBlack; top.Text = "Get ready"; top.Parent = gui
local tc = Instance.new("UICorner"); tc.CornerRadius = UDim.new(0, 10); tc.Parent = top
local hpBack = Instance.new("Frame"); hpBack.Size = UDim2.new(0, 320, 0, 26); hpBack.Position = UDim2.new(0.5, -160, 0, 70); hpBack.BackgroundColor3 = Color3.fromRGB(30, 20, 20); hpBack.Parent = gui
local hpc = Instance.new("UICorner"); hpc.CornerRadius = UDim.new(0, 8); hpc.Parent = hpBack
local hpFill = Instance.new("Frame"); hpFill.Size = UDim2.new(1, 0, 1, 0); hpFill.BackgroundColor3 = Color3.fromRGB(90, 220, 90); hpFill.BorderSizePixel = 0; hpFill.Parent = hpBack
local hfc = Instance.new("UICorner"); hfc.CornerRadius = UDim.new(0, 8); hfc.Parent = hpFill
local punchBtn = Instance.new("TextButton"); punchBtn.Size = UDim2.new(0, 220, 0, 80); punchBtn.Position = UDim2.new(0.5, -110, 1, -100); punchBtn.BackgroundColor3 = Color3.fromRGB(220, 80, 70); punchBtn.TextColor3 = Color3.fromRGB(255, 255, 255); punchBtn.TextScaled = true; punchBtn.Font = Enum.Font.GothamBlack; punchBtn.Text = "PUNCH (F)"; punchBtn.Parent = gui
local pbc = Instance.new("UICorner"); pbc.CornerRadius = UDim.new(0, 14); pbc.Parent = punchBtn
local banner = Instance.new("TextLabel"); banner.Size = UDim2.new(0, 440, 0, 70); banner.Position = UDim2.new(0.5, -220, 0.4, 0); banner.BackgroundTransparency = 1; banner.TextColor3 = Color3.fromRGB(255, 230, 120); banner.TextStrokeTransparency = 0.2; banner.TextScaled = true; banner.Font = Enum.Font.GothamBlack; banner.Text = ""; banner.Parent = gui

local function punch() FtAction:FireServer({action="punch"}) end
punchBtn.Activated:Connect(punch)
UserInputService.InputBegan:Connect(function(input, gp) if gp then return end if input.KeyCode == Enum.KeyCode.F then punch() end end)

RunService.Heartbeat:Connect(function()
    local char = player.Character; local hum = char and char:FindFirstChildOfClass("Humanoid")
    if hum then local f = math.clamp(hum.Health / math.max(1, hum.MaxHealth), 0, 1); hpFill.Size = UDim2.new(f, 0, 1, 0); hpFill.BackgroundColor3 = Color3.fromRGB(math.floor(230 * (1 - f) + 60), math.floor(90 + 130 * f), 80) end
end)
FtEvent.OnClientEvent:Connect(function(p)
    if typeof(p) ~= "table" then return end
    if p.kind == "state" then
        top.Text = p.text .. "  |  Alive " .. p.alive .. (p.phase == "fight" and ("  |  " .. p.time .. "s") or "")
        if p.phase ~= "result" then banner.Text = "" end
        if p.phase == "result" then banner.Text = p.text end
    elseif p.kind == "ko" then banner.Text = "KO! You're out this round"; task.delay(2.5, function() if banner.Text == "KO! You're out this round" then banner.Text = "" end end) end
end)
`;
  return {
    serverScript,
    additionalScripts: [{ name: 'FightingHudClient', scriptType: 'LocalScript', container: 'StarterPlayerScripts', source: clientScript }],
  };
}

// Session 399 (cont.): Custom — a flexible playable sandbox for "any genre by
// description". Title monument + summary, a coin-collection economy, Speed/Jump
// upgrade pads, floating platforms, and a guide NPC. Always produces a playable
// game even when the brief is open-ended. leaderstats Cash + Speed + Jump.
function buildCustomGameScript(params: GameTemplateParams): MultiScriptResult {
  const titleLua = safeLuaString(params.title, 'Custom Game');
  const summaryLua = safeLuaString(String(params.summary || 'Your custom Roblox experience.').slice(0, 140), 'Your custom Roblox experience.');
  const themeRaw = String(params.mapTheme || '').toLowerCase();
  const customTheme = ['neon', 'grass', 'space'].find((t) => themeRaw.includes(t))
    || (/space|galaxy|cyber|sci|star/.test(themeRaw) ? 'space'
      : /grass|nature|park|green|forest/.test(themeRaw) ? 'grass'
      : 'neon');
  const themeLua = safeLuaString(customTheme, 'neon');

  // Session 414: per-preset palette override for recognizability.
  const spec = params.gameVisualSpec;
  const specThemeLua = (spec && spec.vibe !== 'neutral')
    ? `{ground=${rgbLua(spec.palette.ground)}, groundMat=Enum.Material.${spec.palette.groundMaterial}, plaza=${rgbLua(spec.palette.plaza)}, accent=${rgbLua(spec.palette.accent)}, coin=${rgbLua(spec.palette.accent)}}`
    : 'nil';
  const specAtmoLua = spec ? atmosphereOptsLua(spec) : '';

  const serverScript = `local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = {Title=${titleLua}, Theme=${themeLua}, Summary=${summaryLua}}

local THEMES = {
    neon = {ground=Color3.fromRGB(34,36,52), groundMat=Enum.Material.Metal, plaza=Color3.fromRGB(54,58,82), accent=Color3.fromRGB(90,255,210), coin=Color3.fromRGB(255,215,90)},
    grass = {ground=Color3.fromRGB(110,165,90), groundMat=Enum.Material.Grass, plaza=Color3.fromRGB(170,160,140), accent=Color3.fromRGB(255,210,100), coin=Color3.fromRGB(255,225,110)},
    space = {ground=Color3.fromRGB(24,26,40), groundMat=Enum.Material.Slate, plaza=Color3.fromRGB(44,50,76), accent=Color3.fromRGB(150,200,255), coin=Color3.fromRGB(180,230,255)},
}
local theme = THEMES[Config.Theme] or THEMES.neon
local SPEC_THEME = ${specThemeLua}
if SPEC_THEME then theme = SPEC_THEME end

local remotes = Instance.new("Folder"); remotes.Name = "CtRemotes"; remotes.Parent = ReplicatedStorage
local CtEvent = Instance.new("RemoteEvent"); CtEvent.Name = "CtEvent"; CtEvent.Parent = remotes
local world = Instance.new("Folder"); world.Name = "GeneratedCustom"; world.Parent = workspace

local function part(name, size, pos, color, mat, parent)
    local p = Instance.new("Part"); p.Name = name; p.Size = size; p.Position = pos; p.Anchored = true; p.Color = color; p.Material = mat or Enum.Material.SmoothPlastic; p.Parent = parent or world; return p
end
local function label3d(adornee, text, offsetY, color, width)
    local bb = Instance.new("BillboardGui"); bb.Size = UDim2.new(0, width or 220, 0, 40); bb.StudsOffset = Vector3.new(0, offsetY, 0); bb.AlwaysOnTop = true; bb.Parent = adornee
    local t = Instance.new("TextLabel"); t.Size = UDim2.new(1, 0, 1, 0); t.BackgroundTransparency = 1; t.TextColor3 = color or Color3.fromRGB(255, 255, 255); t.TextStrokeTransparency = 0.3; t.TextScaled = true; t.Font = Enum.Font.GothamBold; t.Text = text; t.Parent = bb
end

part("CustomGround", Vector3.new(320, 1, 320), Vector3.new(0, 0, 0), theme.ground, theme.groundMat)
${worldVisualsLua()}
setupAtmosphere({${specAtmoLua || `atmoColor = theme.accent:Lerp(Color3.fromRGB(206, 206, 212), 0.58), tint = Color3.fromRGB(253, 251, 249), haze = 1.5`}})
for i = 1, 16 do
    local a = math.rad(i * 22.5 + 11); local r = 104 + (i % 3) * 12
    local p = Vector3.new(math.cos(a) * r, 0.5, math.sin(a) * r)
    if i % 4 == 0 then makeRock(world, p, 0.7, theme.plaza) else makeTree(world, p, 0.9, "round", Color3.fromRGB(112, 80, 52), Color3.fromRGB(82, 150, 76)) end
end
part("Plaza", Vector3.new(90, 1, 90), Vector3.new(0, 0.6, 0), theme.plaza, Enum.Material.Pavement)
local monument = part("Monument", Vector3.new(8, 30, 8), Vector3.new(0, 15, -36), theme.accent, Enum.Material.Neon)
label3d(monument, Config.Title, 18, theme.accent, 280)
label3d(monument, Config.Summary, 13, Color3.fromRGB(225, 230, 240), 320)
local spawnLoc = Instance.new("SpawnLocation"); spawnLoc.Name = "CustomSpawn"; spawnLoc.Size = Vector3.new(16, 1, 16); spawnLoc.Position = Vector3.new(0, 1.2, 0); spawnLoc.Anchored = true; spawnLoc.Color = theme.accent; spawnLoc.Material = Enum.Material.Neon; spawnLoc.Parent = world
${themedSpawnBillboardLua(spec)}

local function getCash(player) local ls = player:FindFirstChild("leaderstats"); local c = ls and ls:FindFirstChild("Cash"); return c and c.Value or 0 end
local function addCash(player, amount) local ls = player:FindFirstChild("leaderstats"); local c = ls and ls:FindFirstChild("Cash"); if c then c.Value = math.max(0, c.Value + amount) end end

local coinActive = {}
local function makeCoin(pos)
    local coin = part("Coin_" .. math.random(1, 99999), Vector3.new(0.5, 3, 3), pos, theme.coin, Enum.Material.Neon)
    coin.Shape = Enum.PartType.Cylinder; coin.CanCollide = false; coin.Orientation = Vector3.new(0, 0, 90)
    coinActive[coin] = true
    coin.Touched:Connect(function(hit)
        local player = Players:GetPlayerFromCharacter(hit.Parent); if not player then return end
        if not coinActive[coin] then return end
        coinActive[coin] = false; coin.Transparency = 1
        addCash(player, 5); CtEvent:FireClient(player, {kind="toast", text="+5 coins"})
        task.delay(6, function() if coin and coin.Parent then coinActive[coin] = true; coin.Transparency = 0 end end)
    end)
end
for i = 1, 16 do local a = math.rad(i * 22.5); local r = 50 + (i % 3) * 14; makeCoin(Vector3.new(math.cos(a) * r, 3, math.sin(a) * r)) end

local platforms = {Vector3.new(70, 6, 0), Vector3.new(86, 11, 14), Vector3.new(100, 16, 0), Vector3.new(86, 21, -14)}
for i, p in ipairs(platforms) do part("Platform_" .. i, Vector3.new(12, 1, 12), p, theme.plaza, Enum.Material.SmoothPlastic) end
local topCoin = part("TopCoin", Vector3.new(0.5, 4, 4), Vector3.new(86, 25, -14), theme.coin, Enum.Material.Neon); topCoin.Shape = Enum.PartType.Cylinder; topCoin.CanCollide = false; topCoin.Orientation = Vector3.new(0, 0, 90)
coinActive[topCoin] = true
label3d(topCoin, "+25 climb reward", 3, theme.coin, 200)
topCoin.Touched:Connect(function(hit)
    local player = Players:GetPlayerFromCharacter(hit.Parent); if not player then return end
    if not coinActive[topCoin] then return end
    coinActive[topCoin] = false; topCoin.Transparency = 1
    addCash(player, 25); CtEvent:FireClient(player, {kind="toast", text="+25 climb bonus!"})
    task.delay(10, function() if topCoin and topCoin.Parent then coinActive[topCoin] = true; topCoin.Transparency = 0 end end)
end)

local function applyUpgrades(player)
    local char = player.Character; local hum = char and char:FindFirstChildOfClass("Humanoid"); if not hum then return end
    local ls = player:FindFirstChild("leaderstats")
    local sp = ls and ls:FindFirstChild("Speed"); local jp = ls and ls:FindFirstChild("Jump")
    hum.WalkSpeed = 16 + 2 * (sp and sp.Value or 0)
    hum.UseJumpPower = true; hum.JumpPower = 50 + 6 * (jp and jp.Value or 0)
end
local function makeUpgrade(name, statName, pos, baseCost)
    local pad = part("Upg_" .. name, Vector3.new(10, 4, 10), pos, theme.accent, Enum.Material.Neon); pad.Transparency = 0.2
    local prompt = Instance.new("ProximityPrompt"); prompt.ActionText = "Buy " .. name; prompt.ObjectText = name .. " upgrade"; prompt.HoldDuration = 0.3; prompt.MaxActivationDistance = 14; prompt.RequiresLineOfSight = false; prompt.Parent = pad
    local function refresh(player)
        local ls = player:FindFirstChild("leaderstats"); local s = ls and ls:FindFirstChild(statName); local lv = s and s.Value or 0
        prompt.ObjectText = name .. " Lv" .. lv .. " ($" .. (baseCost * (lv + 1)) .. ")"
    end
    label3d(pad, name .. " upgrade", 4, theme.accent)
    prompt.Triggered:Connect(function(player)
        local ls = player:FindFirstChild("leaderstats"); local s = ls and ls:FindFirstChild(statName); if not s then return end
        local cost = baseCost * (s.Value + 1)
        if getCash(player) >= cost then
            addCash(player, -cost); s.Value += 1; applyUpgrades(player)
            CtEvent:FireClient(player, {kind="toast", text=name .. " is now Lv" .. s.Value .. "!"}); refresh(player)
        else
            CtEvent:FireClient(player, {kind="toast", text="Need $" .. cost .. " for " .. name})
        end
    end)
    prompt.PromptShown:Connect(function() for _, pl in Players:GetPlayers() do refresh(pl) end end)
end
makeUpgrade("Speed", "Speed", Vector3.new(-28, 2, 26), 20)
makeUpgrade("Jump", "Jump", Vector3.new(28, 2, 26), 20)

local guide = part("Guide", Vector3.new(3, 7, 2), Vector3.new(0, 4, 22), Color3.fromRGB(220, 210, 190), Enum.Material.SmoothPlastic)
local guideHead = part("GuideHead", Vector3.new(2, 2, 2), Vector3.new(0, 8.5, 22), Color3.fromRGB(235, 225, 205), Enum.Material.SmoothPlastic); guideHead.CanCollide = false
label3d(guideHead, "Guide", 2.2, theme.accent)
local gp = Instance.new("ProximityPrompt"); gp.ActionText = "Talk"; gp.ObjectText = "Guide"; gp.HoldDuration = 0; gp.MaxActivationDistance = 12; gp.RequiresLineOfSight = false; gp.Parent = guide
gp.Triggered:Connect(function(player) CtEvent:FireClient(player, {kind="toast", text="Collect coins, climb for the bonus, and buy Speed/Jump upgrades!"}) end)

local function setupPlayer(player)
    local ls = Instance.new("Folder"); ls.Name = "leaderstats"; ls.Parent = player
    local c = Instance.new("IntValue"); c.Name = "Cash"; c.Value = 0; c.Parent = ls
    local sp = Instance.new("IntValue"); sp.Name = "Speed"; sp.Value = 0; sp.Parent = ls
    local jp = Instance.new("IntValue"); jp.Name = "Jump"; jp.Value = 0; jp.Parent = ls
    player.CharacterAdded:Connect(function() task.wait(0.4); applyUpgrades(player) end)
end
Players.PlayerAdded:Connect(setupPlayer)
for _, p in Players:GetPlayers() do setupPlayer(p) end

print("[Custom] " .. Config.Title .. " ready - theme=" .. Config.Theme)
`;
  const clientScript = `local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local player = Players.LocalPlayer
local remotes = ReplicatedStorage:WaitForChild("CtRemotes")
local CtEvent = remotes:WaitForChild("CtEvent")

local gui = Instance.new("ScreenGui"); gui.Name = "CustomHUD"; gui.ResetOnSpawn = false; gui.IgnoreGuiInset = true; gui.Parent = player:WaitForChild("PlayerGui")
local cashLabel = Instance.new("TextLabel"); cashLabel.Size = UDim2.new(0, 200, 0, 46); cashLabel.Position = UDim2.new(0.5, -100, 0, 12); cashLabel.BackgroundColor3 = Color3.fromRGB(16, 18, 26); cashLabel.BackgroundTransparency = 0.12; cashLabel.TextColor3 = Color3.fromRGB(255, 225, 130); cashLabel.TextScaled = true; cashLabel.Font = Enum.Font.GothamBlack; cashLabel.Text = "0 coins"; cashLabel.Parent = gui
local cc = Instance.new("UICorner"); cc.CornerRadius = UDim.new(0, 10); cc.Parent = cashLabel
local toast = Instance.new("TextLabel"); toast.Size = UDim2.new(0, 440, 0, 38); toast.Position = UDim2.new(0.5, -220, 0, 66); toast.BackgroundColor3 = Color3.fromRGB(20, 24, 34); toast.BackgroundTransparency = 0.15; toast.TextColor3 = Color3.fromRGB(235, 235, 245); toast.TextScaled = true; toast.Font = Enum.Font.GothamBold; toast.Visible = false; toast.Parent = gui
local toc = Instance.new("UICorner"); toc.CornerRadius = UDim.new(0, 8); toc.Parent = toast

task.spawn(function()
    local ls = player:WaitForChild("leaderstats"); local c = ls:WaitForChild("Cash")
    local function r() cashLabel.Text = c.Value .. " coins" end
    r(); c.Changed:Connect(r)
end)
CtEvent.OnClientEvent:Connect(function(p)
    if typeof(p) ~= "table" then return end
    if p.kind == "toast" then toast.Text = p.text; toast.Visible = true; task.delay(2, function() if toast.Text == p.text then toast.Visible = false end end) end
end)
`;
  return {
    serverScript,
    additionalScripts: [{ name: 'CustomHudClient', scriptType: 'LocalScript', container: 'StarterPlayerScripts', source: clientScript }],
  };
}

function buildTrainingSimulatorScript(params: GameTemplateParams): MultiScriptResult {
  const simulatorKind = ['mining', 'fighting', 'muscle', 'clicker'].includes(String(params.simulatorKind)) ? String(params.simulatorKind) : 'mining';
  const titleLua = safeLuaString(params.title, simulatorKind === 'fighting' ? 'Fighting Simulator' : simulatorKind === 'muscle' ? 'Muscle Simulator' : simulatorKind === 'clicker' ? 'Clicker Simulator' : 'Mining Simulator');
  const currencyLua = safeLuaString(params.currencyName, simulatorKind === 'mining' ? 'Ore' : 'Coins');
  const actionName = simulatorKind === 'mining' ? 'Mine' : simulatorKind === 'fighting' ? 'Punch' : simulatorKind === 'muscle' ? 'Lift' : 'Click';
  const serverScript = `local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local DataStoreService = game:GetService("DataStoreService")

local Config = {Title=${titleLua}, Kind="${simulatorKind}", Currency=${currencyLua}, Action="${actionName}"}
local dataStore
local okStore, storeErr = pcall(function()
    dataStore = DataStoreService:GetDataStore("TrainingSimulator_v1")
end)
if not okStore then warn("[TrainingSim] DataStore unavailable: " .. tostring(storeErr)) end
local remotes = Instance.new("Folder"); remotes.Name = "TrainingSimRemotes"; remotes.Parent = ReplicatedStorage
local SyncRemote = Instance.new("RemoteEvent"); SyncRemote.Name = "SyncRemote"; SyncRemote.Parent = remotes
local data = {}
local world = Instance.new("Folder"); world.Name = "GeneratedTrainingSimulator"; world.Parent = workspace
local function part(name, size, pos, color, mat)
    local p = Instance.new("Part"); p.Name = name; p.Size = size; p.Position = pos; p.Anchored = true; p.Color = color; p.Material = mat; p.Parent = world; return p
end
part("SimulatorBase", Vector3.new(170, 1, 130), Vector3.new(0, 0, 10), Color3.fromRGB(60, 90, 75), Enum.Material.Grass)
${worldVisualsLua()}
setupAtmosphere({atmoColor = Color3.fromRGB(198, 188, 158), tint = Color3.fromRGB(252, 250, 246), haze = 1.5})
for i = 1, 12 do
    local a = math.rad(i * 30 + 15); local p = Vector3.new(math.cos(a) * (74 + (i % 2) * 8), 0.5, 10 + math.sin(a) * (58 + (i % 2) * 6))
    if i % 4 == 0 then makeRock(world, p, 0.7, Color3.fromRGB(126, 122, 118)) else makeTree(world, p, 0.85, "round", Color3.fromRGB(110, 78, 50), Color3.fromRGB(78, 140, 70)) end
end
local spawn = Instance.new("SpawnLocation"); spawn.Name = "SimulatorSpawn"; spawn.Size = Vector3.new(14, 1, 14); spawn.Position = Vector3.new(0, 2, -48); spawn.Anchored = true; spawn.Color = Color3.fromRGB(80, 180, 255); spawn.Material = Enum.Material.Neon; spawn.Parent = world
for i = 1, 4 do
    local z = -10 + i * 24
    local zone = part("TrainZone_" .. i, Vector3.new(28, 1, 22), Vector3.new((i - 2.5) * 30, 0.6, z), Color3.fromRGB(70 + i * 25, 90 + i * 18, 120 + i * 20), Enum.Material.SmoothPlastic)
    local pr = Instance.new("ProximityPrompt"); pr.ActionText = Config.Action; pr.ObjectText = "Tier " .. i; pr.MaxActivationDistance = 12; pr.Parent = zone
    pr.Triggered:Connect(function(player)
        local d = data[player.UserId]; if not d then return end
        d.bag = math.min(d.bag + (i * d.power * (1 + d.rebirths)), d.bagMax)
        SyncRemote:FireClient(player, d)
    end)
end
local sell = part("SellZone", Vector3.new(20, 1, 20), Vector3.new(-52, 0.6, -34), Color3.fromRGB(240, 190, 70), Enum.Material.Neon)
local sellPr = Instance.new("ProximityPrompt"); sellPr.ActionText = "Sell"; sellPr.ObjectText = Config.Currency; sellPr.MaxActivationDistance = 12; sellPr.Parent = sell
local upgrade = part("UpgradeZone", Vector3.new(18, 1, 18), Vector3.new(52, 0.6, -34), Color3.fromRGB(90, 220, 120), Enum.Material.Neon)
local upPr = Instance.new("ProximityPrompt"); upPr.ActionText = "Upgrade"; upPr.ObjectText = "Power"; upPr.MaxActivationDistance = 12; upPr.Parent = upgrade
local rebirth = part("RebirthButton", Vector3.new(18, 8, 18), Vector3.new(0, 4, 66), Color3.fromRGB(240, 210, 70), Enum.Material.Neon)
local rbPr = Instance.new("ProximityPrompt"); rbPr.ActionText = "Rebirth"; rbPr.ObjectText = "Reset for multiplier"; rbPr.HoldDuration = 1.5; rbPr.MaxActivationDistance = 14; rbPr.Parent = rebirth
for i = 1, 12 do part("Decor_" .. i, Vector3.new(4 + i % 3, 5 + i % 5, 4 + i % 2), Vector3.new((i % 6 - 3) * 22, 3, 10 + math.floor(i / 6) * 28), Color3.fromRGB(90, 110 + i * 6, 120), i % 2 == 0 and Enum.Material.Slate or Enum.Material.Metal) end
local function defaultData() return {currency=0, bag=0, bagMax=50, power=1, rebirths=0} end
local function sync(player)
    local d = data[player.UserId]; if not d then return end
    local ls = player:FindFirstChild("leaderstats")
    if ls then
        local currency = ls:FindFirstChild(Config.Currency)
        if currency then currency.Value = math.floor(d.currency) end
        ls.Power.Value = d.power; ls.Rebirths.Value = d.rebirths
    end
    SyncRemote:FireClient(player, d)
end
local function giveTool(player)
    local tool = Instance.new("Tool"); tool.Name = Config.Action .. " Tool"; tool.RequiresHandle = true; tool.CanBeDropped = false
    local h = Instance.new("Part"); h.Name = "Handle"; h.Size = Vector3.new(1, 1, 3); h.Color = Color3.fromRGB(230, 230, 220); h.Material = Enum.Material.Metal; h.Parent = tool
    tool.Activated:Connect(function()
        local d = data[player.UserId]; if not d then return end
        d.bag = math.min(d.bag + d.power * (1 + d.rebirths), d.bagMax)
        sync(player)
    end)
    tool.Parent = player:WaitForChild("Backpack")
end
sellPr.Triggered:Connect(function(player)
    local d = data[player.UserId]; if not d then return end
    d.currency += d.bag; d.bag = 0; sync(player)
end)
upPr.Triggered:Connect(function(player)
    local d = data[player.UserId]; if not d then return end
    local cost = d.power * 75
    if d.currency >= cost then d.currency -= cost; d.power += 1; d.bagMax += 25; sync(player) end
end)
rbPr.Triggered:Connect(function(player)
    local d = data[player.UserId]; if not d then return end
    local cost = 1000 * (d.rebirths + 1)
    if d.currency >= cost then d.currency = 0; d.bag = 0; d.power = 1 + d.rebirths; d.rebirths += 1; sync(player) end
end)
local function setupPlayer(player)
    local loaded
    if dataStore then pcall(function() loaded = dataStore:GetAsync("sim_" .. Config.Kind .. "_" .. player.UserId) end) end
    data[player.UserId] = typeof(loaded) == "table" and loaded or defaultData()
    local ls = Instance.new("Folder"); ls.Name = "leaderstats"; ls.Parent = player
    local c = Instance.new("IntValue"); c.Name = Config.Currency; c.Parent = ls
    local p = Instance.new("IntValue"); p.Name = "Power"; p.Parent = ls
    local r = Instance.new("IntValue"); r.Name = "Rebirths"; r.Parent = ls
    player.CharacterAdded:Connect(function() task.wait(0.4); giveTool(player); sync(player) end)
    task.defer(function() giveTool(player); sync(player) end)
end
Players.PlayerAdded:Connect(setupPlayer)
Players.PlayerRemoving:Connect(function(player)
    if dataStore and data[player.UserId] then pcall(function() dataStore:SetAsync("sim_" .. Config.Kind .. "_" .. player.UserId, data[player.UserId]) end) end
    data[player.UserId] = nil
end)
for _, p in Players:GetPlayers() do setupPlayer(p) end
print("[TrainingSimulator] " .. Config.Title .. " initialized kind=" .. Config.Kind .. " with DataStoreService pcall, leaderstats, RemoteEvent, upgrades, rebirth")
`;
  const clientScript = `local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local player = Players.LocalPlayer
local event = ReplicatedStorage:WaitForChild("TrainingSimRemotes"):WaitForChild("SyncRemote")
local gui = Instance.new("ScreenGui"); gui.Name = "TrainingSimulatorHUD"; gui.ResetOnSpawn = false; gui.Parent = player:WaitForChild("PlayerGui")
local label = Instance.new("TextLabel"); label.Size = UDim2.new(0, 360, 0, 66); label.Position = UDim2.new(0, 16, 0, 18); label.BackgroundColor3 = Color3.fromRGB(18, 22, 24); label.BackgroundTransparency = 0.12; label.TextColor3 = Color3.fromRGB(220, 255, 220); label.TextScaled = true; label.Font = Enum.Font.GothamBold; label.Parent = gui
event.OnClientEvent:Connect(function(d)
    label.Text = "Bag " .. math.floor(d.bag) .. "/" .. d.bagMax .. " | Currency " .. math.floor(d.currency) .. "\\nPower " .. d.power .. " | Rebirths " .. d.rebirths
end)
`;
  return {
    serverScript,
    additionalScripts: [{ name: 'TrainingSimulatorHudClient', scriptType: 'LocalScript', container: 'StarterPlayerScripts', source: clientScript }],
  };
}

function buildDefaultScript(params: GameTemplateParams): string {
  return `local Players = game:GetService("Players")

local function setupNPCDialogs()
    for _, obj in workspace.GeneratedContent:GetDescendants() do
        if obj:IsA("BasePart") and obj:FindFirstChild("Humanoid") then
            local prompt = Instance.new("ProximityPrompt")
            prompt.ActionText = "Talk to " .. obj.Name
            prompt.HoldDuration = 0.3
            prompt.Parent = obj
            prompt.Triggered:Connect(function(player)
                print(player.Name .. " talks to " .. obj.Name)
            end)
        end
    end
end

local function setupPlayer(player)
    local leaderstats = Instance.new("Folder")
    leaderstats.Name = "leaderstats"
    leaderstats.Parent = player
    local score = Instance.new("IntValue")
    score.Name = "Score"
    score.Value = 0
    score.Parent = leaderstats
    player.CharacterAdded:Connect(function()
        task.wait(1)
        local gui = player.PlayerGui:FindFirstChild("GeneratedHud")
        if gui then
            local title = gui:FindFirstChild("GeneratedTitle")
            if title then title.Text = ${JSON.stringify(params.title)} end
        end
    end)
end

Players.PlayerAdded:Connect(setupPlayer)
task.wait(1)
setupNPCDialogs()
print("[Game] ${params.title} initialized")
`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Session #149: AI Brainrot & Meme Simulator Engine — Steal-a-Brainrot conveyor.
// Generates a complete game with: rolling conveyor spawning meme-NPC pets,
// per-player plots assigned on join, ProximityPrompt purchases, CPS Heartbeat
// loop, optional PvP stealing + cooldown invincibility, slap tool defense,
// rebirth multiplier, BrainrotConfig ModuleScript exporting LLM-tuned pool.
// Reuses _memeNpcIdle / _memeMakeDecor / _memeFinalizeNpc + Skibidi/Bombardiro/
// Tralalero/Sigma/Generic builders as inline Lua (same shape as buildObbyScript
// memeHelperLua starting at gameTemplates.ts:209).
// ─────────────────────────────────────────────────────────────────────────────

// Session #149 visual upgrade — verified Roblox catalog asset IDs (April 2026)
// rendered via rbxthumb:// in BillboardGui ImageLabel. IDs picked from public
// catalog search: decals + UGC accessories + bundles. Each is a real meme
// sticker visible to players instead of composite primitive blocks.
const ASSET_SKIBIDI_TOILET   = 14595650130;     // Skibidi Toilet (decal)
const ASSET_SKIBIDI_61_HQ    = 15007388516;     // Skibidi Toilet 61 HQ
const ASSET_SKIBIDI_65       = 15007397982;     // Skibidi Toilet 65 Premiere
const ASSET_SKIBIDI_73       = 17197349791;     // Skibidi Toilet 73 Fake Leak
const ASSET_TUNG_TUNG_SAHUR  = 77173967880518;  // Tung Tung Tung Sahur (verified decal)
const ASSET_BOMBARDIRO_FACE  = 98664340093672;  // Bombardino Crocodilo face accessory
const ASSET_BOMBARDIRO_BACK  = 108760689575385; // Bombardiro Crocodilo back accessory
const ASSET_BOMBARDILO_HAT   = 106056377575439; // Bombardilo Crocodilo hat
const ASSET_TRALALERO_FACE   = 74641532426859;  // Tralalero Tralala SHARK PFP
const ASSET_TRALALERO_BACK   = 113348941373785; // Tralalero Tralala back
const ASSET_TRALALERO_TEXT   = 92852767359447;  // Tralalero Tralala text
const ASSET_TRALALERO_BUNDLE = 73586347408508;  // Tralalero Tralala bundle
const ASSET_TRALALERO_RP     = 81971262868056;  // Tralalero Tralala Brainrot RP Meme
const ASSET_CAPPUCCINO_BUNDLE     = 87754574114012;  // Cappuccino Assassino bundle
const ASSET_CAPPUCCINO_SHOULDER   = 129517548928613; // Cappuccino Assassino shoulder
const ASSET_CAPPUCCINO_BACK_SAB   = 77415614201657;  // Cappuccino (Steal A Brainrot)
const ASSET_CAPPUCCINO_TORSO      = 89199392426766;  // Mini Cappuccino torso
const ASSET_CAPPUCCINO_HAT        = 124240028018204; // Cappuccino hat
const ASSET_CAPPUCCINO_ANIME      = 122658845541693; // Cappuccino anime style

const DEFAULT_BRAINROT_POOL: Record<MemeSubTheme, BrainrotPoolEntry[]> = {
  skibidi: [
    { name: 'Skibidi Toilet G1', memeSubTheme: 'skibidi', rarity: 'common',     baseCps: 4,    priceCash: 200,    spawnWeight: 50, primaryColor: [245, 245, 250], accentColor: [80, 200, 255], decalAssetId: ASSET_SKIBIDI_TOILET },
    { name: 'Speakerhead Recruit', memeSubTheme: 'skibidi', rarity: 'common',   baseCps: 7,    priceCash: 350,    spawnWeight: 45, primaryColor: [220, 220, 225], accentColor: [255, 80, 100], decalAssetId: ASSET_SKIBIDI_61_HQ },
    { name: 'Cameraman Scout', memeSubTheme: 'skibidi',     rarity: 'rare',     baseCps: 22,   priceCash: 1200,   spawnWeight: 25, primaryColor: [60, 60, 70],    accentColor: [220, 200, 60], decalAssetId: ASSET_SKIBIDI_65 },
    { name: 'TV Speakerhead Boss', memeSubTheme: 'skibidi', rarity: 'rare',     baseCps: 35,   priceCash: 2000,   spawnWeight: 22, primaryColor: [110, 110, 115], accentColor: [80, 200, 255], decalAssetId: ASSET_SKIBIDI_73 },
    { name: 'Skibidi G-Toilet 9000', memeSubTheme: 'skibidi', rarity: 'legendary', baseCps: 110, priceCash: 7000, spawnWeight: 12, primaryColor: [250, 250, 255], accentColor: [255, 215, 175], decalAssetId: ASSET_SKIBIDI_TOILET },
    { name: 'Cameraman Titan', memeSubTheme: 'skibidi',     rarity: 'legendary', baseCps: 180, priceCash: 12000, spawnWeight: 10, primaryColor: [40, 40, 50],    accentColor: [255, 60, 80], decalAssetId: ASSET_SKIBIDI_65 },
    { name: 'Skibidi Mythical Council', memeSubTheme: 'skibidi', rarity: 'mythic', baseCps: 500, priceCash: 35000, spawnWeight: 7, primaryColor: [255, 240, 100], accentColor: [50, 150, 255], decalAssetId: ASSET_SKIBIDI_61_HQ },
    { name: 'OHIO Boss', memeSubTheme: 'skibidi',           rarity: 'secret',   baseCps: 2400, priceCash: 180000, spawnWeight: 3,  primaryColor: [255, 60, 60],   accentColor: [40, 0, 0], decalAssetId: ASSET_SKIBIDI_73 },
    { name: 'Galactic Skibidi Sigma', memeSubTheme: 'skibidi', rarity: 'galactic', baseCps: 95000, priceCash: 7500000, spawnWeight: 1, primaryColor: [180, 60, 255], accentColor: [255, 240, 80], decalAssetId: ASSET_SKIBIDI_TOILET },
  ],
  bombardir: [
    { name: 'Bombardiro Crocodilo', memeSubTheme: 'bombardir', rarity: 'common', baseCps: 5,   priceCash: 250,   spawnWeight: 50, primaryColor: [85, 200, 90],   accentColor: [120, 120, 130], decalAssetId: ASSET_BOMBARDIRO_FACE },
    { name: 'Tung Tung Tung Sahur', memeSubTheme: 'bombardir', rarity: 'common', baseCps: 8,   priceCash: 400,   spawnWeight: 45, primaryColor: [180, 130, 80],  accentColor: [40, 30, 20], decalAssetId: ASSET_TUNG_TUNG_SAHUR },
    { name: 'Lirili Larila',         memeSubTheme: 'bombardir', rarity: 'rare',  baseCps: 25,  priceCash: 1400,  spawnWeight: 25, primaryColor: [180, 200, 120], accentColor: [120, 80, 40], decalAssetId: ASSET_TUNG_TUNG_SAHUR },
    { name: 'Trippi Troppi',         memeSubTheme: 'bombardir', rarity: 'rare',  baseCps: 40,  priceCash: 2400,  spawnWeight: 22, primaryColor: [60, 120, 180],  accentColor: [240, 160, 80], decalAssetId: ASSET_BOMBARDILO_HAT },
    { name: 'Bombardiro Maximus',    memeSubTheme: 'bombardir', rarity: 'legendary', baseCps: 130, priceCash: 8500, spawnWeight: 12, primaryColor: [60, 140, 60], accentColor: [220, 60, 60], decalAssetId: ASSET_BOMBARDIRO_BACK },
    { name: 'Brr Brr Patapim',       memeSubTheme: 'bombardir', rarity: 'legendary', baseCps: 200, priceCash: 14000, spawnWeight: 10, primaryColor: [120, 200, 80], accentColor: [80, 50, 30], decalAssetId: ASSET_TUNG_TUNG_SAHUR },
    { name: 'Cappuccino Assassino', memeSubTheme: 'bombardir', rarity: 'mythic', baseCps: 600, priceCash: 42000, spawnWeight: 7, primaryColor: [110, 70, 40], accentColor: [240, 230, 200], decalAssetId: ASSET_CAPPUCCINO_BUNDLE },
    { name: 'Italian Brainrot Council', memeSubTheme: 'bombardir', rarity: 'secret', baseCps: 3000, priceCash: 220000, spawnWeight: 3, primaryColor: [220, 60, 60], accentColor: [60, 220, 100], decalAssetId: ASSET_CAPPUCCINO_ANIME },
    { name: 'Tralalero Galactico',   memeSubTheme: 'bombardir', rarity: 'galactic', baseCps: 110000, priceCash: 9000000, spawnWeight: 1, primaryColor: [60, 240, 200], accentColor: [255, 100, 60], decalAssetId: ASSET_CAPPUCCINO_BACK_SAB },
  ],
  tralalero: [
    { name: 'Tralalero Tralala', memeSubTheme: 'tralalero', rarity: 'common',   baseCps: 5,    priceCash: 280,    spawnWeight: 50, primaryColor: [60, 120, 220],  accentColor: [240, 240, 240], decalAssetId: ASSET_TRALALERO_FACE },
    { name: 'Sneaker Shark Pup', memeSubTheme: 'tralalero', rarity: 'common',   baseCps: 8,    priceCash: 420,    spawnWeight: 45, primaryColor: [80, 160, 240],  accentColor: [255, 200, 60], decalAssetId: ASSET_TRALALERO_BACK },
    { name: 'Beach Tralalero',   memeSubTheme: 'tralalero', rarity: 'rare',     baseCps: 28,   priceCash: 1500,   spawnWeight: 25, primaryColor: [40, 100, 200],  accentColor: [255, 240, 200], decalAssetId: ASSET_TRALALERO_BUNDLE },
    { name: 'Coral Tralalero',   memeSubTheme: 'tralalero', rarity: 'rare',     baseCps: 42,   priceCash: 2500,   spawnWeight: 22, primaryColor: [80, 180, 220],  accentColor: [240, 100, 140], decalAssetId: ASSET_TRALALERO_RP },
    { name: 'Tralalero Megaforme', memeSubTheme: 'tralalero', rarity: 'legendary', baseCps: 140, priceCash: 9000, spawnWeight: 12, primaryColor: [40, 90, 180],   accentColor: [255, 80, 120], decalAssetId: ASSET_TRALALERO_FACE },
    { name: 'Sneakerwave Boss',  memeSubTheme: 'tralalero', rarity: 'legendary', baseCps: 220, priceCash: 15000, spawnWeight: 10, primaryColor: [60, 220, 220],  accentColor: [255, 255, 255], decalAssetId: ASSET_TRALALERO_BACK },
    { name: 'Tralalero Mythos',  memeSubTheme: 'tralalero', rarity: 'mythic',   baseCps: 700,  priceCash: 50000,  spawnWeight: 7,  primaryColor: [40, 200, 240],  accentColor: [255, 100, 80], decalAssetId: ASSET_TRALALERO_BUNDLE },
    { name: 'Tung Tung Apex',    memeSubTheme: 'tralalero', rarity: 'secret',   baseCps: 3500, priceCash: 260000, spawnWeight: 3,  primaryColor: [200, 140, 80],  accentColor: [40, 30, 20], decalAssetId: ASSET_TUNG_TUNG_SAHUR },
    { name: 'Galactic Tralalero', memeSubTheme: 'tralalero', rarity: 'galactic', baseCps: 130000, priceCash: 10500000, spawnWeight: 1, primaryColor: [80, 220, 240], accentColor: [255, 200, 60], decalAssetId: ASSET_TRALALERO_TEXT },
  ],
  sigma: [
    // Sigma family: no verified meme decal IDs found — fallback chain uses Cappuccino/Skibidi assets as anime-sigma stand-ins, which look closer to TikTok sigma vibe than blocks.
    { name: 'Sigma Recruit',    memeSubTheme: 'sigma', rarity: 'common',    baseCps: 6,     priceCash: 320,    spawnWeight: 50, primaryColor: [255, 210, 80],  accentColor: [20, 20, 20], decalAssetId: ASSET_CAPPUCCINO_ANIME },
    { name: 'Mewing Apprentice', memeSubTheme: 'sigma', rarity: 'common',   baseCps: 9,     priceCash: 480,    spawnWeight: 45, primaryColor: [255, 180, 60],  accentColor: [40, 40, 40], decalAssetId: ASSET_CAPPUCCINO_HAT },
    { name: 'Looksmaxxer',      memeSubTheme: 'sigma', rarity: 'rare',      baseCps: 30,    priceCash: 1700,   spawnWeight: 25, primaryColor: [220, 180, 60],  accentColor: [200, 60, 60], decalAssetId: ASSET_CAPPUCCINO_SHOULDER },
    { name: 'Gigachad Hamster', memeSubTheme: 'sigma', rarity: 'rare',      baseCps: 48,    priceCash: 2800,   spawnWeight: 22, primaryColor: [240, 200, 80],  accentColor: [80, 60, 40], decalAssetId: ASSET_CAPPUCCINO_TORSO },
    { name: 'Sigma Boss',       memeSubTheme: 'sigma', rarity: 'legendary', baseCps: 160,   priceCash: 10000,  spawnWeight: 12, primaryColor: [255, 220, 60],  accentColor: [200, 0, 0], decalAssetId: ASSET_CAPPUCCINO_BUNDLE },
    { name: 'Phonk Sigma Lord', memeSubTheme: 'sigma', rarity: 'legendary', baseCps: 240,   priceCash: 17000,  spawnWeight: 10, primaryColor: [200, 60, 60],   accentColor: [255, 220, 60], decalAssetId: ASSET_CAPPUCCINO_BACK_SAB },
    { name: 'Sigma Council',    memeSubTheme: 'sigma', rarity: 'mythic',    baseCps: 800,   priceCash: 60000,  spawnWeight: 7,  primaryColor: [255, 240, 80],  accentColor: [60, 60, 60], decalAssetId: ASSET_SKIBIDI_61_HQ },
    { name: 'OHIO Sigma King',  memeSubTheme: 'sigma', rarity: 'secret',    baseCps: 4000,  priceCash: 300000, spawnWeight: 3,  primaryColor: [255, 60, 60],   accentColor: [255, 240, 80], decalAssetId: ASSET_SKIBIDI_73 },
    { name: 'Galactic Sigma',   memeSubTheme: 'sigma', rarity: 'galactic',  baseCps: 150000, priceCash: 12000000, spawnWeight: 1, primaryColor: [255, 240, 80], accentColor: [180, 60, 240], decalAssetId: ASSET_CAPPUCCINO_ANIME },
  ],
  generic: [
    { name: 'Skibidi Toilet G1',     memeSubTheme: 'skibidi',   rarity: 'common',    baseCps: 4,     priceCash: 200,    spawnWeight: 50, primaryColor: [245, 245, 250], accentColor: [80, 200, 255], decalAssetId: ASSET_SKIBIDI_TOILET },
    { name: 'Bombardiro Crocodilo',  memeSubTheme: 'bombardir', rarity: 'common',    baseCps: 5,     priceCash: 250,    spawnWeight: 45, primaryColor: [85, 200, 90],   accentColor: [120, 120, 130], decalAssetId: ASSET_BOMBARDIRO_FACE },
    { name: 'Tralalero Tralala',     memeSubTheme: 'tralalero', rarity: 'common',    baseCps: 5,     priceCash: 280,    spawnWeight: 50, primaryColor: [60, 120, 220],  accentColor: [240, 240, 240], decalAssetId: ASSET_TRALALERO_FACE },
    { name: 'Sigma Recruit',         memeSubTheme: 'sigma',     rarity: 'common',    baseCps: 6,     priceCash: 320,    spawnWeight: 50, primaryColor: [255, 210, 80],  accentColor: [20, 20, 20], decalAssetId: ASSET_CAPPUCCINO_ANIME },
    { name: 'Tung Tung Tung Sahur',  memeSubTheme: 'bombardir', rarity: 'rare',      baseCps: 25,    priceCash: 1400,   spawnWeight: 25, primaryColor: [180, 130, 80],  accentColor: [40, 30, 20], decalAssetId: ASSET_TUNG_TUNG_SAHUR },
    { name: 'Lirili Larila',         memeSubTheme: 'bombardir', rarity: 'rare',      baseCps: 28,    priceCash: 1500,   spawnWeight: 25, primaryColor: [180, 200, 120], accentColor: [120, 80, 40], decalAssetId: ASSET_TUNG_TUNG_SAHUR },
    { name: 'Cameraman Titan',       memeSubTheme: 'skibidi',   rarity: 'rare',      baseCps: 35,    priceCash: 2000,   spawnWeight: 22, primaryColor: [60, 60, 70],    accentColor: [220, 200, 60], decalAssetId: ASSET_SKIBIDI_65 },
    { name: 'Looksmaxxer',           memeSubTheme: 'sigma',     rarity: 'rare',      baseCps: 30,    priceCash: 1700,   spawnWeight: 25, primaryColor: [220, 180, 60],  accentColor: [200, 60, 60], decalAssetId: ASSET_CAPPUCCINO_SHOULDER },
    { name: 'Brr Brr Patapim',       memeSubTheme: 'bombardir', rarity: 'legendary', baseCps: 130,   priceCash: 8500,   spawnWeight: 12, primaryColor: [120, 200, 80],  accentColor: [80, 50, 30], decalAssetId: ASSET_TUNG_TUNG_SAHUR },
    { name: 'Cappuccino Assassino',  memeSubTheme: 'bombardir', rarity: 'legendary', baseCps: 180,   priceCash: 12000,  spawnWeight: 10, primaryColor: [110, 70, 40],   accentColor: [240, 230, 200], decalAssetId: ASSET_CAPPUCCINO_BUNDLE },
    { name: 'Sigma Boss',            memeSubTheme: 'sigma',     rarity: 'legendary', baseCps: 160,   priceCash: 10000,  spawnWeight: 12, primaryColor: [255, 220, 60],  accentColor: [200, 0, 0], decalAssetId: ASSET_CAPPUCCINO_BUNDLE },
    { name: 'OHIO Mythical',         memeSubTheme: 'skibidi',   rarity: 'mythic',    baseCps: 600,   priceCash: 42000,  spawnWeight: 7,  primaryColor: [255, 60, 60],   accentColor: [40, 0, 0], decalAssetId: ASSET_SKIBIDI_73 },
    { name: 'Italian Brainrot Apex', memeSubTheme: 'bombardir', rarity: 'secret',    baseCps: 3000,  priceCash: 220000, spawnWeight: 3,  primaryColor: [220, 60, 60],   accentColor: [60, 220, 100], decalAssetId: ASSET_CAPPUCCINO_ANIME },
    { name: 'Galactic Sixseven 67',  memeSubTheme: 'sigma',     rarity: 'galactic',  baseCps: 100000, priceCash: 8000000, spawnWeight: 1, primaryColor: [180, 60, 255], accentColor: [255, 240, 80], decalAssetId: ASSET_CAPPUCCINO_ANIME },
    { name: 'Skibidi Sigma Apex',    memeSubTheme: 'skibidi',   rarity: 'galactic',  baseCps: 110000, priceCash: 9000000, spawnWeight: 1, primaryColor: [255, 240, 80], accentColor: [60, 200, 255], decalAssetId: ASSET_SKIBIDI_TOILET },
  ],
};

function sanitizeBrainrotPool(pool: BrainrotPoolEntry[] | undefined, fallback: MemeSubTheme): BrainrotPoolEntry[] {
  const validSubThemes: MemeSubTheme[] = ['skibidi', 'bombardir', 'tralalero', 'sigma', 'generic'];
  const cleanColor = (c: unknown, dft: [number, number, number]): [number, number, number] => {
    if (!Array.isArray(c) || c.length !== 3) return dft;
    return [
      Math.max(0, Math.min(255, Math.round(Number(c[0]) || dft[0]))),
      Math.max(0, Math.min(255, Math.round(Number(c[1]) || dft[1]))),
      Math.max(0, Math.min(255, Math.round(Number(c[2]) || dft[2]))),
    ];
  };
  if (!pool || !Array.isArray(pool) || pool.length === 0) {
    return DEFAULT_BRAINROT_POOL[fallback] ?? DEFAULT_BRAINROT_POOL.generic;
  }
  return pool.map((entry, idx) => {
    const subTheme = (validSubThemes.includes(entry?.memeSubTheme as MemeSubTheme) ? entry.memeSubTheme : 'generic') as MemeSubTheme;
    const rawDecal = (entry as { decalAssetId?: unknown })?.decalAssetId;
    const decalAssetId = typeof rawDecal === 'number' && Number.isFinite(rawDecal) && rawDecal > 0 ? Math.floor(rawDecal) : undefined;
    return {
      name: typeof entry?.name === 'string' && entry.name.trim() ? entry.name.replace(/"/g, "'").slice(0, 40) : `Brainrot ${idx + 1}`,
      memeSubTheme: subTheme,
      rarity: ['common','rare','legendary','mythic','secret','brainrot','galactic'].includes(entry?.rarity as string) ? entry.rarity : 'common',
      baseCps: Math.max(1, Math.round(Number(entry?.baseCps) || 1)),
      priceCash: Math.max(10, Math.round(Number(entry?.priceCash) || 100)),
      spawnWeight: Math.max(1, Math.min(100, Math.round(Number(entry?.spawnWeight) || 25))),
      primaryColor: cleanColor(entry?.primaryColor, [200, 200, 200]),
      accentColor: cleanColor(entry?.accentColor, [120, 120, 120]),
      decalAssetId,
    };
  });
}

/** Lookup default decalAssetId for an LLM-supplied brainrot by name+sub-theme.
 * LLM rarely emits asset IDs — we fill them in from DEFAULT_BRAINROT_POOL by
 * fuzzy name match within the same sub-theme so the game still gets real
 * meme stickers even if the prompt response only had names + stats. */
function fillDecalAssetIdsFromDefaults(pool: BrainrotPoolEntry[]): BrainrotPoolEntry[] {
  return pool.map((entry) => {
    if (entry.decalAssetId) return entry;
    const themePool = DEFAULT_BRAINROT_POOL[entry.memeSubTheme] ?? DEFAULT_BRAINROT_POOL.generic;
    const lowerName = entry.name.toLowerCase();
    const exact = themePool.find((d) => d.name.toLowerCase() === lowerName);
    if (exact?.decalAssetId) return { ...entry, decalAssetId: exact.decalAssetId };
    const partial = themePool.find((d) => {
      const dn = d.name.toLowerCase();
      return dn.includes(lowerName.split(' ')[0]) || lowerName.includes(dn.split(' ')[0]);
    });
    if (partial?.decalAssetId) return { ...entry, decalAssetId: partial.decalAssetId };
    const anyWithDecal = themePool.find((d) => d.decalAssetId);
    if (anyWithDecal?.decalAssetId) return { ...entry, decalAssetId: anyWithDecal.decalAssetId };
    return entry;
  });
}

/**
 * Phase D (session 225): prefer LIVE Roblox Decal IDs scraped at job-create
 * time, fall back to hardcoded `DEFAULT_BRAINROT_POOL` IDs only when no live
 * data is available for that sub-theme. Each pool entry gets a deterministic
 * live ID via `(entryIndex % liveIdsForSubTheme.length)` round-robin so two
 * entries with the same sub-theme don't collapse to identical PNG.
 */
function fillDecalAssetIdsFromLiveOrDefaults(
  pool: BrainrotPoolEntry[],
  liveBySubTheme: Record<string, number[]> | undefined,
): BrainrotPoolEntry[] {
  if (!liveBySubTheme) return fillDecalAssetIdsFromDefaults(pool);
  // Per-sub-theme cursor for round-robin live ID assignment.
  const cursors: Record<string, number> = {};
  const withLive = pool.map((entry) => {
    if (entry.decalAssetId) return entry;
    const live = liveBySubTheme[entry.memeSubTheme] ?? liveBySubTheme.generic;
    if (!Array.isArray(live) || live.length === 0) return entry;
    const cursor = cursors[entry.memeSubTheme] ?? 0;
    const liveId = live[cursor % live.length];
    cursors[entry.memeSubTheme] = cursor + 1;
    if (typeof liveId === 'number' && liveId > 0) return { ...entry, decalAssetId: liveId };
    return entry;
  });
  // Anything still without decalAssetId — fall through to hardcoded DEFAULT_BRAINROT_POOL.
  return fillDecalAssetIdsFromDefaults(withLive);
}

function buildBrainrotConveyorScript(params: GameTemplateParams): MultiScriptResult {
  const memeSubTheme: MemeSubTheme = params.memeSubTheme || 'generic';
  const sanitized = sanitizeBrainrotPool(params.brainrotPool, memeSubTheme);
  // Phase D (session 225): prefer LIVE decals over 18 hardcoded IDs.
  const brainrotPool = fillDecalAssetIdsFromLiveOrDefaults(sanitized, params.brainrotLiveDecalsBySubTheme);
  const stealingEnabled = params.stealingEnabled !== false;
  const basePlotCount = Math.max(2, Math.min(16, params.basePlotCount || 8));
  const seedSource = `${params.title || 'brainrot'}|${memeSubTheme}|${params.jobId || ''}`;
  const seed = hashStringToInt(seedSource);
  const titleLua = JSON.stringify(params.title || 'Steal a Brainrot');

  const poolLua = brainrotPool
    .map((e) =>
      `    { name = ${JSON.stringify(e.name)}, memeSubTheme = "${e.memeSubTheme}", rarity = "${e.rarity}", baseCps = ${e.baseCps}, priceCash = ${e.priceCash}, spawnWeight = ${e.spawnWeight}, primaryColor = Color3.fromRGB(${e.primaryColor.join(', ')}), accentColor = Color3.fromRGB(${e.accentColor.join(', ')}), decalAssetId = ${e.decalAssetId ?? 0} },`
    )
    .join('\n');

  const brainrotConfig = `--!strict
-- AUTO-GENERATED by buildBrainrotConveyorScript (session #149)
-- Brainrot pool tuned by smartInterviewBrainrotSim → generateBrainrotSimGdd.
local Config = {}

Config.GameTitle      = ${titleLua}
Config.MemeSubTheme   = "${memeSubTheme}"
Config.RarityTiers    = ${params.rarityTiers || 5}
Config.StealingEnabled = ${stealingEnabled}
Config.BasePlotCount  = ${basePlotCount}
Config.PlotSize       = 30      -- session #149 HOTFIX2: smaller plots for clean grid
Config.StandPerPlot   = 6
Config.ConveyorLength = 120     -- HOTFIX2: shorter (was 200) so it doesn't overlap with spawn/plots
Config.ConveyorWidth  = 10      -- HOTFIX2: thicker so brainrots have wider stage
Config.ConveyorSpeed  = 6        -- studs / second
Config.SpawnInterval  = 6        -- seconds between brainrot spawns
Config.MaxActiveOnConveyor = 30  -- cap to avoid lag
Config.UnsoldBrainrotLifetime = 30 -- seconds before despawn
Config.StartingCash = 100        -- lets new players buy the first cheap brainrot immediately
Config.JoinProtectionSeconds = 30
Config.BaseLockSeconds = 60
Config.StealHoldDuration = 2.6

Config.Pool = {
${poolLua}
}

-- Rarity colours used for ProximityPrompt + BillboardGui labels.
Config.RarityColors = {
    common    = Color3.fromRGB(180, 180, 180),
    rare      = Color3.fromRGB(80, 160, 255),
    legendary = Color3.fromRGB(255, 200, 80),
    mythic    = Color3.fromRGB(220, 80, 220),
    secret    = Color3.fromRGB(255, 60, 60),
    brainrot  = Color3.fromRGB(120, 255, 120),
    galactic  = Color3.fromRGB(180, 80, 255),
}

function Config.RollWeighted(rng)
    local total = 0
    for _, e in ipairs(Config.Pool) do total = total + e.spawnWeight end
    -- Session #149 HOTFIX: original code did "(rng or math.random) * total"
    -- which multiplied a function by a number when rng was nil → silent
    -- pcall-eaten error → no brainrots ever spawned. Always CALL the picker.
    local picker = rng or math.random
    if type(picker) ~= "function" then picker = math.random end
    local pick = picker() * total
    if type(pick) ~= "number" then pick = math.random() * total end
    local acc = 0
    for _, e in ipairs(Config.Pool) do
        acc = acc + e.spawnWeight
        if pick <= acc then return e end
    end
    return Config.Pool[1]
end

return Config`;

  // Lua server script — full conveyor + plots + CPS + stealing + slap.
  const serverScript = `-- AUTO-GENERATED brainrot_sim conveyor server (session #149)
-- Title: ${(params.title || '').replace(/[\r\n]/g, ' ').slice(0, 80)}
-- Theme: ${memeSubTheme} | Plots: ${basePlotCount} | Stealing: ${stealingEnabled}

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local Workspace = game:GetService("Workspace")
local TweenService = game:GetService("TweenService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Debris = game:GetService("Debris")

math.randomseed(${seed})

local Config = require(ReplicatedStorage:WaitForChild("BrainrotConfig"))
local feedEvent = ReplicatedStorage:FindFirstChild("BrainrotFeed")
if not feedEvent then
    feedEvent = Instance.new("RemoteEvent")
    feedEvent.Name = "BrainrotFeed"
    feedEvent.Parent = ReplicatedStorage
end

local function broadcastFeed(text, color)
    print("[BrainrotFeed] " .. tostring(text))
    if feedEvent and feedEvent:IsA("RemoteEvent") then
        feedEvent:FireAllClients(tostring(text), color or Color3.fromRGB(255, 220, 80))
    end
end

local function sendFeed(player, text, color)
    if feedEvent and feedEvent:IsA("RemoteEvent") and player then
        feedEvent:FireClient(player, tostring(text), color or Color3.fromRGB(255, 220, 80))
    end
end

local hypeRarities = {
    legendary = true,
    mythic = true,
    secret = true,
    brainrot = true,
    galactic = true,
}

local memeCallouts = {
    skibidi = { "SKIBIDI TAX", "CAMERA RAID", "TOILET ECONOMY", "RIZZ LOCK" },
    bombardir = { "BOMBARDIRO DROP", "ITALIAN CHAOS", "CAPPUCCINO HEIST", "TUNG TUNG ZONE" },
    tralalero = { "TRALALERO BEACH", "SNEAKER SHARK", "STEAL THE DRIP", "WAVE RAID" },
    sigma = { "SIGMA GRINDSET", "MEWING ZONE", "PHONK REBIRTH", "LOCK IN" },
    generic = { "BRAINROT MARKET", "RARE SPAWN SOON", "LOCK BASE", "STEAL FAST" },
}

local function themeAccent()
    if Config.MemeSubTheme == "skibidi" then return Color3.fromRGB(80, 200, 255) end
    if Config.MemeSubTheme == "bombardir" then return Color3.fromRGB(80, 255, 120) end
    if Config.MemeSubTheme == "tralalero" then return Color3.fromRGB(80, 220, 255) end
    if Config.MemeSubTheme == "sigma" then return Color3.fromRGB(255, 220, 80) end
    return Color3.fromRGB(255, 80, 180)
end

local function flashAt(position, color, labelText)
    local burst = Instance.new("Part")
    burst.Name = "BrainrotBurst"
    burst.Size = Vector3.new(1, 1, 1)
    burst.Position = position
    burst.Anchored = true
    burst.CanCollide = false
    burst.Transparency = 1
    burst.Parent = container
    local light = Instance.new("PointLight")
    light.Brightness = 5
    light.Range = 34
    light.Color = color or themeAccent()
    light.Parent = burst
    local pe = Instance.new("ParticleEmitter")
    pe.Texture = "rbxassetid://241876451"
    pe.Color = ColorSequence.new(color or themeAccent())
    pe.LightEmission = 0.8
    pe.Rate = 0
    pe.Lifetime = NumberRange.new(0.5, 1.1)
    pe.Speed = NumberRange.new(10, 18)
    pe.SpreadAngle = Vector2.new(360, 360)
    pe.Parent = burst
    pe:Emit(42)
    if labelText and labelText ~= "" then
        local bb = Instance.new("BillboardGui")
        bb.Size = UDim2.new(0, 180, 0, 42)
        bb.StudsOffset = Vector3.new(0, 5, 0)
        bb.AlwaysOnTop = true
        bb.MaxDistance = 130
        bb.Adornee = burst
        bb.Parent = burst
        local tl = Instance.new("TextLabel")
        tl.Size = UDim2.new(1, 0, 1, 0)
        tl.BackgroundTransparency = 1
        tl.TextColor3 = color or themeAccent()
        tl.TextStrokeTransparency = 0
        tl.TextSize = 22
        tl.Font = Enum.Font.GothamBlack
        tl.Text = labelText
        tl.Parent = bb
    end
    Debris:AddItem(burst, 1.6)
end

-- ──────────────────────────────────────────────────────────────────────
-- World container
local container = Workspace:FindFirstChild("GeneratedContent") or Instance.new("Folder")
container.Name = "GeneratedContent"
container.Parent = Workspace

-- Idle bob + slow yaw helper shared by every brainrot model. Mirrors the
-- _memeNpcIdle pattern used by the obby builder so meme brainrots feel alive.
local function _memeNpcIdle(model, primary)
    if not model or not primary then return end
    local baseCF = primary.CFrame
    local t0 = tick()
    task.spawn(function()
        while model.Parent do
            local dt = tick() - t0
            local bob = math.sin(dt * 1.5) * 0.35
            primary.CFrame = baseCF * CFrame.new(0, bob, 0) * CFrame.Angles(0, math.rad((dt * 25) % 360), 0)
            RunService.Heartbeat:Wait()
        end
    end)
end

local function _memeMakeDecor(parent, shape, color, size, offset, material)
    local p = Instance.new("Part")
    p.Shape = shape or Enum.PartType.Block
    p.Color = color
    p.Size = size
    p.Material = material or Enum.Material.SmoothPlastic
    p.Anchored = true
    p.CanCollide = false
    p.CastShadow = false
    p.Position = offset
    p.Parent = parent
    return p
end

local MEME_NPC_FALLBACK_SCALE = 1.0
local function _memeFinalizeNpc(model, primary)
    if not model or not primary then return end
    for _, d in ipairs(model:GetDescendants()) do
        if d:IsA("BasePart") and d ~= primary then
            d.Anchored = false
            local w = Instance.new("WeldConstraint")
            w.Part0 = primary
            w.Part1 = d
            w.Parent = primary
        end
    end
    primary.Anchored = true
    pcall(function() model:ScaleTo(MEME_NPC_FALLBACK_SCALE) end)
end

-- ──────────────────────────────────────────────────────────────────────
-- INLINE NPC BUILDERS (parity with obby template, gameTemplates.ts:278+)
local function buildSkibidiNpc(parentFolder, position, idx, tint)
    local m = Instance.new("Model"); m.Name = "SkibidiNpc_" .. idx
    local bowl = _memeMakeDecor(m, Enum.PartType.Cylinder, tint or Color3.fromRGB(245, 245, 250), Vector3.new(1.6, 2.2, 2.2), position, Enum.Material.SmoothPlastic)
    bowl.Orientation = Vector3.new(0, 0, 90); m.PrimaryPart = bowl
    for i = 1, 8 do
        local a = (i - 1) * (math.pi * 2 / 8)
        _memeMakeDecor(m, Enum.PartType.Block, Color3.fromRGB(235, 235, 240), Vector3.new(0.35, 0.2, 0.35), position + Vector3.new(math.cos(a) * 1.3, 1.0, math.sin(a) * 1.3), Enum.Material.SmoothPlastic)
    end
    _memeMakeDecor(m, Enum.PartType.Ball, Color3.fromRGB(255, 215, 175), Vector3.new(1.8, 1.8, 1.8), position + Vector3.new(0, 1.9, 0), Enum.Material.SmoothPlastic)
    _memeMakeDecor(m, Enum.PartType.Ball, Color3.fromRGB(80, 200, 255), Vector3.new(0.35, 0.35, 0.35), position + Vector3.new(0.35, 2.1, 0.75), Enum.Material.Neon)
    _memeMakeDecor(m, Enum.PartType.Ball, Color3.fromRGB(80, 200, 255), Vector3.new(0.35, 0.35, 0.35), position + Vector3.new(-0.35, 2.1, 0.75), Enum.Material.Neon)
    _memeMakeDecor(m, Enum.PartType.Block, Color3.fromRGB(30, 20, 20), Vector3.new(0.7, 0.35, 0.2), position + Vector3.new(0, 1.55, 0.85), Enum.Material.SmoothPlastic)
    m.Parent = parentFolder; _memeFinalizeNpc(m, bowl); return m
end

local function buildBombardiroNpc(parentFolder, position, idx, tint)
    local m = Instance.new("Model"); m.Name = "BombardiroNpc_" .. idx
    local body = _memeMakeDecor(m, Enum.PartType.Block, tint or Color3.fromRGB(85, 200, 90), Vector3.new(1.4, 1.2, 4.5), position, Enum.Material.Neon)
    m.PrimaryPart = body
    _memeMakeDecor(m, Enum.PartType.Cylinder, Color3.fromRGB(45, 140, 60), Vector3.new(1.6, 1.1, 1.1), position + Vector3.new(0, 0, -2.8), Enum.Material.Neon)
    _memeMakeDecor(m, Enum.PartType.Block, Color3.fromRGB(120, 120, 130), Vector3.new(3.8, 0.2, 1.6), position + Vector3.new(-2.5, 0, 0), Enum.Material.Metal)
    _memeMakeDecor(m, Enum.PartType.Block, Color3.fromRGB(120, 120, 130), Vector3.new(3.8, 0.2, 1.6), position + Vector3.new(2.5, 0, 0), Enum.Material.Metal)
    _memeMakeDecor(m, Enum.PartType.Block, Color3.fromRGB(45, 140, 60), Vector3.new(0.3, 1.2, 1.2), position + Vector3.new(0, 0.8, 2.2), Enum.Material.Neon)
    m.Parent = parentFolder; _memeFinalizeNpc(m, body); return m
end

local function buildTralaleroNpc(parentFolder, position, idx, tint)
    local m = Instance.new("Model"); m.Name = "TralaleroNpc_" .. idx
    local body = _memeMakeDecor(m, Enum.PartType.Block, tint or Color3.fromRGB(60, 120, 220), Vector3.new(4.2, 1.6, 1.6), position, Enum.Material.SmoothPlastic)
    m.PrimaryPart = body
    _memeMakeDecor(m, Enum.PartType.Block, Color3.fromRGB(40, 90, 180), Vector3.new(0.5, 1.2, 0.9), position + Vector3.new(0, 1.2, 0), Enum.Material.SmoothPlastic)
    _memeMakeDecor(m, Enum.PartType.Block, Color3.fromRGB(240, 240, 240), Vector3.new(1, 0.5, 1.6), position + Vector3.new(-1.1, -1.1, 0), Enum.Material.SmoothPlastic)
    _memeMakeDecor(m, Enum.PartType.Block, Color3.fromRGB(240, 240, 240), Vector3.new(1, 0.5, 1.6), position + Vector3.new(1.1, -1.1, 0), Enum.Material.SmoothPlastic)
    _memeMakeDecor(m, Enum.PartType.Ball, Color3.fromRGB(255, 255, 255), Vector3.new(0.4, 0.4, 0.4), position + Vector3.new(1.8, 0.4, 0.6), Enum.Material.SmoothPlastic)
    m.Parent = parentFolder; _memeFinalizeNpc(m, body); return m
end

local function buildSigmaNpc(parentFolder, position, idx, tint)
    local m = Instance.new("Model"); m.Name = "SigmaNpc_" .. idx
    local head = _memeMakeDecor(m, Enum.PartType.Ball, tint or Color3.fromRGB(255, 210, 80), Vector3.new(2.5, 2.5, 2.5), position, Enum.Material.Neon)
    m.PrimaryPart = head
    _memeMakeDecor(m, Enum.PartType.Block, Color3.fromRGB(20, 20, 20), Vector3.new(0.35, 0.55, 0.9), position + Vector3.new(0.5, 0.25, 1.1), Enum.Material.SmoothPlastic)
    _memeMakeDecor(m, Enum.PartType.Block, Color3.fromRGB(20, 20, 20), Vector3.new(0.35, 0.55, 0.9), position + Vector3.new(-0.5, 0.25, 1.1), Enum.Material.SmoothPlastic)
    _memeMakeDecor(m, Enum.PartType.Cylinder, Color3.fromRGB(255, 220, 60), Vector3.new(0.5, 2.2, 2.2), position + Vector3.new(0, 1.6, 0), Enum.Material.Metal)
    for i = 1, 4 do
        local a = (i - 1) * (math.pi * 2 / 4)
        _memeMakeDecor(m, Enum.PartType.Block, Color3.fromRGB(255, 220, 60), Vector3.new(0.25, 0.7, 0.25), position + Vector3.new(math.cos(a) * 0.9, 2.1, math.sin(a) * 0.9), Enum.Material.Metal)
    end
    m.Parent = parentFolder; _memeFinalizeNpc(m, head); return m
end

local _genericBuilders = { buildSkibidiNpc, buildBombardiroNpc, buildTralaleroNpc, buildSigmaNpc }
local _genericIdx = 0
local function buildGenericMemeNpc(parentFolder, position, idx, tint)
    _genericIdx = _genericIdx + 1
    local builder = _genericBuilders[((_genericIdx - 1) % #_genericBuilders) + 1]
    return builder(parentFolder, position, idx, tint)
end

-- Session #149 visual upgrade: render brainrots as floating BillboardGui meme
-- stickers (real Roblox catalog assets via rbxthumb://) on a tiny invisible
-- physics anchor. Falls back to composite block builder when no decalAssetId
-- is present so the loop always produces something visible.
local function buildBrainrotStickerModel(parentFolder, position, idx, entry)
    local model = Instance.new("Model"); model.Name = "Brainrot_" .. idx
    -- Tiny invisible anchor for tween + ProximityPrompt + welds.
    local anchor = Instance.new("Part")
    anchor.Name = "Anchor"
    anchor.Size = Vector3.new(3, 3, 3)
    anchor.Position = position
    anchor.Anchored = true
    anchor.CanCollide = false
    anchor.Transparency = 1
    anchor.Massless = true
    anchor.Parent = model
    model.PrimaryPart = anchor
    -- Glowing pedestal disc beneath the sticker — gives the floating image
    -- a "stage" so it reads as a brainrot, not a free-floating UI element.
    local pedestal = Instance.new("Part")
    pedestal.Name = "Pedestal"
    pedestal.Shape = Enum.PartType.Cylinder
    pedestal.Size = Vector3.new(0.6, 7, 7)
    pedestal.Orientation = Vector3.new(0, 0, 90)
    pedestal.Position = position - Vector3.new(0, 3, 0)
    pedestal.Anchored = false
    pedestal.CanCollide = false
    pedestal.Material = Enum.Material.Neon
    pedestal.Color = entry.accentColor or Color3.fromRGB(120, 120, 120)
    pedestal.Parent = model
    local pWeld = Instance.new("WeldConstraint"); pWeld.Part0 = anchor; pWeld.Part1 = pedestal; pWeld.Parent = anchor
    -- Halo light so the sticker pops in dark sky.
    local light = Instance.new("PointLight"); light.Brightness = 1.5; light.Range = 14
    light.Color = entry.primaryColor or Color3.fromRGB(255, 255, 255); light.Parent = anchor
    -- BillboardGui with the meme thumbnail. rbxthumb auto-resolves any asset
    -- (decal/accessory/bundle/face) to a 420×420 PNG — no LoadAsset needed.
    local billboard = Instance.new("BillboardGui")
    billboard.Name = "MemeSticker"
    billboard.Adornee = anchor
    billboard.Size = UDim2.new(0, 220, 0, 280)
    billboard.StudsOffset = Vector3.new(0, 4, 0)
    billboard.AlwaysOnTop = false
    billboard.LightInfluence = 0
    billboard.MaxDistance = 250
    billboard.Parent = anchor
    if entry.decalAssetId and entry.decalAssetId > 0 then
        local img = Instance.new("ImageLabel")
        img.Size = UDim2.new(1, 0, 1, 0)
        img.BackgroundTransparency = 1
        img.Image = "rbxthumb://type=Asset&id=" .. tostring(entry.decalAssetId) .. "&w=420&h=420"
        img.ScaleType = Enum.ScaleType.Fit
        img.Parent = billboard
        local stroke = Instance.new("UIStroke")
        stroke.Color = entry.primaryColor or Color3.fromRGB(255, 255, 255)
        stroke.Thickness = 3; stroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
        stroke.Parent = img
    else
        -- No decal — render a colored solid placeholder card with the name
        local card = Instance.new("Frame")
        card.Size = UDim2.new(1, 0, 1, 0)
        card.BackgroundColor3 = entry.primaryColor or Color3.fromRGB(120, 120, 120)
        card.BorderSizePixel = 0
        card.Parent = billboard
        local cardCorner = Instance.new("UICorner"); cardCorner.CornerRadius = UDim.new(0, 16); cardCorner.Parent = card
        local cardLabel = Instance.new("TextLabel")
        cardLabel.Size = UDim2.new(1, -20, 1, -20)
        cardLabel.Position = UDim2.new(0, 10, 0, 10)
        cardLabel.BackgroundTransparency = 1
        cardLabel.TextColor3 = Color3.new(1, 1, 1)
        cardLabel.TextStrokeTransparency = 0
        cardLabel.Font = Enum.Font.GothamBlack
        cardLabel.TextScaled = true
        cardLabel.Text = entry.name or "Brainrot"
        cardLabel.Parent = card
    end
    -- Idle bob so the sticker breathes/floats. Uses pedestal so weld carries the model.
    _memeNpcIdle(model, anchor)
    model.Parent = parentFolder
    return model
end

local function buildBrainrotModel(parentFolder, position, idx, entry)
    -- Always prefer the meme sticker visual; the legacy composite NPCs only
    -- run if rbxthumb is somehow disabled (no asset id resolved at all).
    if entry.decalAssetId and entry.decalAssetId > 0 then
        return buildBrainrotStickerModel(parentFolder, position, idx, entry)
    end
    local tint = entry.primaryColor
    if entry.memeSubTheme == "skibidi" then
        return buildSkibidiNpc(parentFolder, position, idx, tint)
    elseif entry.memeSubTheme == "bombardir" then
        return buildBombardiroNpc(parentFolder, position, idx, tint)
    elseif entry.memeSubTheme == "tralalero" then
        return buildTralaleroNpc(parentFolder, position, idx, tint)
    elseif entry.memeSubTheme == "sigma" then
        return buildSigmaNpc(parentFolder, position, idx, tint)
    else
        return buildGenericMemeNpc(parentFolder, position, idx, tint)
    end
end

-- ──────────────────────────────────────────────────────────────────────
-- WORLD LAYOUT: spawn pad + conveyor + radial plots + stands
local conveyorFolder = Instance.new("Folder"); conveyorFolder.Name = "Conveyor"; conveyorFolder.Parent = container
local plotsFolder = Instance.new("Folder"); plotsFolder.Name = "Plots"; plotsFolder.Parent = container
local activeFolder = Instance.new("Folder"); activeFolder.Name = "ActiveBrainrots"; activeFolder.Parent = container

-- ─────────────────────────────────────────────────────────────────────
-- LAYOUT v2 (session #149 HOTFIX2): cleanly separated zones
--   Conveyor — long along X axis, length 120, at z=30 (north of plots)
--   Plots    — 4×2 grid, row1 z=-30, row2 z=-80 (south of conveyor)
--   Spawn    — at z=-130 (far south, clear walk-in area)
--   Rebirth  — at z=-100 (between spawn and plots)
-- ─────────────────────────────────────────────────────────────────────

-- Floor under everything so brainrots/players don't fall into the void.
local floor = Instance.new("Part")
floor.Name = "ArenaFloor"
floor.Size = Vector3.new(360, 1, 280)
floor.Position = Vector3.new(0, 0, -50)
floor.Anchored = true
floor.Material = Enum.Material.Sand
floor.Color = Color3.fromRGB(232, 210, 170)
floor.TopSurface = Enum.SurfaceType.Smooth
floor.Parent = container

local spawnPart = Instance.new("SpawnLocation")
spawnPart.Name = "SpawnPlatform"
spawnPart.Size = Vector3.new(24, 1, 24)
spawnPart.Position = Vector3.new(0, 5, -130)
spawnPart.Anchored = true
spawnPart.Material = Enum.Material.Neon
spawnPart.Color = Color3.fromRGB(80, 200, 255)
spawnPart.TopSurface = Enum.SurfaceType.Smooth
spawnPart.Parent = container

-- Welcome sign on the spawn pad — tells the player where to go.
do
    local welcome = Instance.new("Part")
    welcome.Name = "WelcomeSign"
    welcome.Size = Vector3.new(14, 8, 0.5)
    welcome.Position = Vector3.new(0, 11, -118)
    welcome.Anchored = true; welcome.CanCollide = false
    welcome.Material = Enum.Material.Neon
    welcome.Color = Color3.fromRGB(180, 80, 255)
    welcome.Parent = container
    local wgui = Instance.new("BillboardGui"); wgui.Adornee = welcome
    wgui.Size = UDim2.new(0, 260, 0, 72)
    wgui.AlwaysOnTop = false; wgui.MaxDistance = 90; wgui.StudsOffset = Vector3.new(0, 4, 0); wgui.Parent = welcome
    local wlabel = Instance.new("TextLabel"); wlabel.Size = UDim2.new(1, 0, 1, 0)
    wlabel.BackgroundTransparency = 1; wlabel.TextColor3 = Color3.new(1, 1, 1)
    wlabel.TextStrokeTransparency = 0; wlabel.TextScaled = false; wlabel.TextSize = 22
    wlabel.Font = Enum.Font.GothamBlack
    wlabel.Text = "BUY FROM CONVEYOR\\nTHEN LOCK BASE"
    wlabel.Parent = wgui
end

	-- Conveyor along X axis (east-west). Brainrots spawn at +X end, travel to -X end.
	local conveyor = Instance.new("Part")
conveyor.Name = "BrainrotConveyor"
conveyor.Size = Vector3.new(Config.ConveyorLength, 2, Config.ConveyorWidth)
conveyor.Position = Vector3.new(0, 4, 30)
conveyor.Anchored = true
conveyor.Material = Enum.Material.Metal
conveyor.Color = Color3.fromRGB(70, 70, 80)
conveyor.TopSurface = Enum.SurfaceType.Smooth
conveyor.Parent = conveyorFolder

local stripe = Instance.new("Part")
stripe.Name = "ConveyorStripe"
stripe.Size = Vector3.new(Config.ConveyorLength - 2, 0.1, Config.ConveyorWidth - 2)
stripe.Position = Vector3.new(0, 5.06, 30)
stripe.Anchored = true; stripe.CanCollide = false
stripe.Material = Enum.Material.Neon
	stripe.Color = Color3.fromRGB(255, 220, 80)
	stripe.Parent = conveyorFolder

-- Meme billboards around the arena. Small, punchy signs make the scene read
-- as brainrot content without covering the playable conveyor/plots.
do
    local signs = memeCallouts[Config.MemeSubTheme] or memeCallouts.generic
    local positions = {
        Vector3.new(-78, 9, 50),
        Vector3.new(78, 9, 50),
        Vector3.new(-95, 9, -42),
        Vector3.new(95, 9, -42),
    }
    for i, text in ipairs(signs) do
        local post = Instance.new("Part")
        post.Name = "MemeCallout_" .. i
        post.Size = Vector3.new(16, 7, 0.5)
        post.Position = positions[i] or Vector3.new((i - 2.5) * 35, 9, 55)
        post.Anchored = true
        post.CanCollide = false
        post.Material = Enum.Material.Neon
        post.Color = i % 2 == 0 and Color3.fromRGB(255, 80, 180) or themeAccent()
        post.Parent = container
        local bb = Instance.new("BillboardGui")
        bb.Adornee = post
        bb.Size = UDim2.new(0, 180, 0, 58)
        bb.AlwaysOnTop = false
        bb.MaxDistance = 120
        bb.Parent = post
        local tl = Instance.new("TextLabel")
        tl.Size = UDim2.new(1, 0, 1, 0)
        tl.BackgroundTransparency = 1
        tl.TextColor3 = Color3.new(1, 1, 1)
        tl.TextStrokeTransparency = 0
        tl.TextSize = 21
        tl.Font = Enum.Font.GothamBlack
        tl.Text = text
        tl.Parent = bb
    end
end

-- 4x2 plot grid south of conveyor. Row 1 closer (z=-30), Row 2 back (z=-80).
local plotCenters = {}
local plotsPerRow = 4
local plotSpacing = 60
do
    local rowZs = { -30, -80 }
    local idx = 0
    for rowIdx, plotZ in ipairs(rowZs) do
        for col = 1, plotsPerRow do
            idx = idx + 1
            if idx > Config.BasePlotCount then break end
            local px = (col - (plotsPerRow + 1) / 2) * plotSpacing
            local pz = plotZ
            local plot = Instance.new("Part")
            plot.Name = "Plot_" .. idx
            plot.Size = Vector3.new(Config.PlotSize, 1, Config.PlotSize)
            plot.Position = Vector3.new(px, 0.5, pz)
            plot.Anchored = true
            plot.Material = Enum.Material.SmoothPlastic
            plot.Color = Color3.fromRGB(110 + math.random(-20, 20), 110 + math.random(-20, 20), 130 + math.random(-20, 20))
            plot.TopSurface = Enum.SurfaceType.Smooth
            plot.Parent = plotsFolder

            local owner = Instance.new("StringValue")
            owner.Name = "OwnerUserId"
            owner.Value = ""
            owner.Parent = plot

            local lockedUntil = Instance.new("NumberValue")
            lockedUntil.Name = "LockedUntil"
            lockedUntil.Value = 0
            lockedUntil.Parent = plot

            local gate = Instance.new("Part")
            gate.Name = "LaserGate"
            gate.Size = Vector3.new(Config.PlotSize - 2, 8, 0.35)
            gate.Position = plot.Position + Vector3.new(0, 4.5, -Config.PlotSize / 2 - 0.5)
            gate.Anchored = true; gate.CanCollide = false
            gate.Material = Enum.Material.Neon
            gate.Color = Color3.fromRGB(255, 70, 90)
            gate.Transparency = 0.82
            gate.Parent = plot

            local lockButton = Instance.new("Part")
            lockButton.Name = "LockButton"
            lockButton.Size = Vector3.new(5, 1, 5)
            lockButton.Position = plot.Position + Vector3.new(Config.PlotSize / 2 - 4, 1.5, -Config.PlotSize / 2 + 4)
            lockButton.Anchored = true; lockButton.CanCollide = false
            lockButton.Material = Enum.Material.Neon
            lockButton.Color = Color3.fromRGB(255, 80, 120)
            lockButton.Parent = plot

            local lockPrompt = Instance.new("ProximityPrompt")
            lockPrompt.Name = "LockBasePrompt"
            lockPrompt.ActionText = "Lock Base"
            lockPrompt.ObjectText = "60s anti-steal"
            lockPrompt.HoldDuration = 0.35
            lockPrompt.MaxActivationDistance = 10
            lockPrompt.RequiresLineOfSight = false
            lockPrompt.Parent = lockButton

            local sign = Instance.new("Part")
            sign.Name = "PlotSign"
            sign.Size = Vector3.new(4, 5, 0.5)
            -- Sign on the FRONT edge of the plot (toward spawn) so player sees it walking in.
            sign.Position = plot.Position + Vector3.new(0, 4, (rowIdx == 1 and -Config.PlotSize / 2 - 1 or Config.PlotSize / 2 + 1))
            sign.Anchored = true; sign.CanCollide = false
            sign.Material = Enum.Material.Neon
            sign.Color = Color3.fromRGB(80, 200, 255)
            sign.Parent = plot

            local gui = Instance.new("BillboardGui"); gui.Adornee = sign; gui.Size = UDim2.new(0, 120, 0, 36)
            gui.AlwaysOnTop = false; gui.MaxDistance = 55; gui.StudsOffset = Vector3.new(0, 2.2, 0); gui.Parent = sign
            local label = Instance.new("TextLabel"); label.Size = UDim2.new(1, 0, 1, 0); label.BackgroundTransparency = 1
            label.TextColor3 = Color3.new(1, 1, 1); label.TextStrokeTransparency = 0; label.TextScaled = false; label.TextSize = 15
            label.Font = Enum.Font.GothamBlack; label.Text = "OPEN"
            label.Parent = gui

            local stands = Instance.new("Folder"); stands.Name = "Stands"; stands.Parent = plot
            for s = 1, Config.StandPerPlot do
                local sRow = math.floor((s - 1) / 3); local sCol = (s - 1) % 3
                local sx = (sCol - 1) * 9
                local sz = (sRow - 0.5) * 9
                local stand = Instance.new("Part")
                stand.Name = "Stand_" .. s
                stand.Size = Vector3.new(5, 1, 5)
                stand.Position = plot.Position + Vector3.new(sx, 1.5, sz)
                stand.Anchored = true; stand.CanCollide = false
                stand.Material = Enum.Material.Neon
                stand.Color = Color3.fromRGB(60, 60, 80)
                stand.Transparency = 0.4
                stand.Parent = stands
                local occ = Instance.new("StringValue"); occ.Name = "OccupantId"; occ.Value = ""; occ.Parent = stand
            end

            table.insert(plotCenters, plot)
        end
    end
end

-- ──────────────────────────────────────────────────────────────────────
-- PLOT SERVICE: assign a free plot when a player joins. In-memory only.
local function isPlotLocked(plot)
    local lockedUntil = plot and plot:FindFirstChild("LockedUntil")
    return lockedUntil and lockedUntil.Value > os.clock()
end

local function secondsLeftLocked(plot)
    local lockedUntil = plot and plot:FindFirstChild("LockedUntil")
    if not lockedUntil then return 0 end
    return math.max(0, math.ceil(lockedUntil.Value - os.clock()))
end

local function updatePlotLockVisual(plot)
    local locked = isPlotLocked(plot)
    local gate = plot:FindFirstChild("LaserGate")
    if gate and gate:IsA("BasePart") then
        gate.Transparency = locked and 0.18 or 0.82
        gate.Color = locked and Color3.fromRGB(255, 40, 80) or Color3.fromRGB(80, 80, 90)
    end
    local button = plot:FindFirstChild("LockButton")
    if button and button:IsA("BasePart") then
        button.Color = locked and Color3.fromRGB(255, 220, 80) or Color3.fromRGB(255, 80, 120)
    end
    local sign = plot:FindFirstChild("PlotSign")
    local gui = sign and sign:FindFirstChildOfClass("BillboardGui")
    local label = gui and gui:FindFirstChildOfClass("TextLabel")
    local owner = plot:FindFirstChild("OwnerUserId")
    if label then
        local ownerText = owner and owner.Value ~= "" and "BASE" or "OPEN"
        if owner and owner.Value ~= "" then
            local player = Players:GetPlayerByUserId(tonumber(owner.Value) or 0)
            ownerText = player and (player.Name .. "'s BASE") or "BASE"
        end
        if locked then
            label.Text = "LOCKED " .. tostring(secondsLeftLocked(plot)) .. "s"
        else
            label.Text = ownerText
        end
    end
end

local function lockPlot(plot, seconds)
    local lockedUntil = plot and plot:FindFirstChild("LockedUntil")
    if not lockedUntil then return end
    lockedUntil.Value = math.max(lockedUntil.Value, os.clock() + seconds)
    updatePlotLockVisual(plot)
end

local function wireLockPrompt(plot)
    local button = plot:FindFirstChild("LockButton")
    local prompt = button and button:FindFirstChild("LockBasePrompt")
    if not prompt or not prompt:IsA("ProximityPrompt") then return end
    prompt.Triggered:Connect(function(player)
        local owner = plot:FindFirstChild("OwnerUserId")
        if not owner or owner.Value ~= tostring(player.UserId) then
            sendFeed(player, "This is not your base.", Color3.fromRGB(255, 90, 90))
            return
        end
        if isPlotLocked(plot) then
            sendFeed(player, "Base already locked: " .. tostring(secondsLeftLocked(plot)) .. "s", Color3.fromRGB(255, 220, 80))
            return
        end
        local stats = player:FindFirstChild("leaderstats")
        local rebirths = stats and stats:FindFirstChild("Rebirths")
        local lockSeconds = Config.BaseLockSeconds + ((rebirths and rebirths.Value or 0) * 10)
        lockPlot(plot, lockSeconds)
        broadcastFeed(player.Name .. " locked their base for " .. tostring(lockSeconds) .. "s", Color3.fromRGB(255, 220, 80))
    end)
end

for _, plot in ipairs(plotCenters) do
    wireLockPrompt(plot)
end

task.spawn(function()
    while task.wait(1) do
        for _, plot in ipairs(plotCenters) do
            updatePlotLockVisual(plot)
        end
    end
end)

local function assignPlot(player)
    for _, plot in ipairs(plotCenters) do
        local owner = plot:FindFirstChild("OwnerUserId")
        if owner and owner.Value == "" then
            owner.Value = tostring(player.UserId)
            lockPlot(plot, Config.JoinProtectionSeconds)
            sendFeed(player, "Your base is locked for " .. tostring(Config.JoinProtectionSeconds) .. "s. Buy from conveyor, then defend.", Color3.fromRGB(80, 220, 255))
            return plot
        end
    end
    return nil
end

local function releasePlot(player)
    for _, plot in ipairs(plotCenters) do
        local owner = plot:FindFirstChild("OwnerUserId")
        if owner and owner.Value == tostring(player.UserId) then
            owner.Value = ""
            local lockedUntil = plot:FindFirstChild("LockedUntil")
            if lockedUntil then lockedUntil.Value = 0 end
            -- Despawn brainrots welded to this plot
            for _, stand in ipairs(plot.Stands:GetChildren()) do
                local occ = stand:FindFirstChild("OccupantId")
                if occ then occ.Value = "" end
                for _, child in ipairs(stand:GetChildren()) do
                    if child:IsA("Model") then child:Destroy() end
                end
            end
            for _, m in ipairs(activeFolder:GetChildren()) do
                if m:GetAttribute("OwnerUserId") == tostring(player.UserId) then
                    m:Destroy()
                end
            end
            local sign = plot:FindFirstChild("PlotSign")
            if sign then
                local label = sign:FindFirstChildOfClass("BillboardGui") and sign:FindFirstChildOfClass("BillboardGui"):FindFirstChildOfClass("TextLabel")
                if label then label.Text = "OPEN" end
            end
            updatePlotLockVisual(plot)
            return
        end
    end
end

-- ──────────────────────────────────────────────────────────────────────
-- LEADERSTATS: Cash + CPS for the HUD client.
local function setupLeaderstats(player)
    local ls = Instance.new("Folder"); ls.Name = "leaderstats"; ls.Parent = player
    local cash = Instance.new("IntValue"); cash.Name = "Cash"; cash.Value = Config.StartingCash; cash.Parent = ls
    local cps = Instance.new("IntValue"); cps.Name = "CPS"; cps.Value = 0; cps.Parent = ls
    local rebirths = Instance.new("IntValue"); rebirths.Name = "Rebirths"; rebirths.Value = 0; rebirths.Parent = ls
end

-- ──────────────────────────────────────────────────────────────────────
-- SLAP TOOL (HOTFIX2 session #149): create real Tool instance per player.
-- Previously a flat Script in StarterPack tried Tool.Activated:Connect
-- where script.Parent was StarterPack itself, throwing nil index error
-- at line 48. Tool now an Instance.new('Tool') with a Handle and
-- Activated wired server-side.
local slapDebounce = {}
local function onSlapActivated(player)
    local char = player.Character
    if not char then return end
    local userHum = char:FindFirstChildOfClass("Humanoid")
    local userRoot = char:FindFirstChild("HumanoidRootPart")
    if not userHum or not userRoot then return end
    local now = tick()
    if slapDebounce[player.UserId] and (now - slapDebounce[player.UserId]) < 0.6 then return end
    slapDebounce[player.UserId] = now
    local params = OverlapParams.new()
    params.FilterType = Enum.RaycastFilterType.Exclude
    params.FilterDescendantsInstances = { char }
    local hits = workspace:GetPartBoundsInRadius(userRoot.Position + userRoot.CFrame.LookVector * 4, 5, params)
    local seen = {}
    for _, part in ipairs(hits) do
        local model = part:FindFirstAncestorOfClass("Model")
        if model and not seen[model] then
            seen[model] = true
            local hum = model:FindFirstChildOfClass("Humanoid")
            local root = model:FindFirstChild("HumanoidRootPart")
            if hum and root and hum.Health > 0 and model ~= char then
                pcall(function() hum:TakeDamage(2) end)
                local attach = Instance.new("Attachment", root)
                local lv = Instance.new("LinearVelocity")
                lv.Attachment0 = attach
                lv.MaxForce = math.huge
                lv.VectorVelocity = (root.Position - userRoot.Position).Unit * 80 + Vector3.new(0, 40, 0)
                lv.Parent = root
                Debris:AddItem(lv, 0.25)
                Debris:AddItem(attach, 0.3)
            end
        end
    end
end

local function setupSlapTool(player)
    -- Remove any old tool from a previous spawn.
    local backpack = player:FindFirstChildOfClass("Backpack")
    if backpack then
        local existing = backpack:FindFirstChild("Slap Tool")
        if existing then existing:Destroy() end
    end
    local tool = Instance.new("Tool")
    tool.Name = "Slap Tool"
    tool.RequiresHandle = true
    tool.CanBeDropped = false
    tool.ToolTip = "Slap a thief to knock them back"
    local handle = Instance.new("Part")
    handle.Name = "Handle"
    handle.Size = Vector3.new(1, 0.4, 4)
    handle.Color = Color3.fromRGB(245, 200, 160)
    handle.Material = Enum.Material.SmoothPlastic
    handle.Parent = tool
    tool.Activated:Connect(function() onSlapActivated(player) end)
    if backpack then
        tool.Parent = backpack
    else
        tool.Parent = player:WaitForChild("Backpack")
    end
end

Players.PlayerAdded:Connect(function(player)
    setupLeaderstats(player)
    player.CharacterAdded:Connect(function(char)
        task.wait(0.5)
        assignPlot(player)
        setupSlapTool(player)  -- HOTFIX2: rearm slap tool after every respawn
    end)
end)
Players.PlayerRemoving:Connect(function(player)
    slapDebounce[player.UserId] = nil
    releasePlot(player)
end)

-- ──────────────────────────────────────────────────────────────────────
-- CONVEYOR SERVICE: spawn brainrots at the far end, tween to spawn end.
local activeBrainrotCount = 0

local function makeBuyPrompt(model, entry)
    local prompt = Instance.new("ProximityPrompt")
    prompt.ActionText = "Buy " .. entry.name
    prompt.ObjectText = string.format("%d Cash | %d CPS", entry.priceCash, entry.baseCps)
    prompt.HoldDuration = 0.6
    prompt.MaxActivationDistance = 14
    prompt.RequiresLineOfSight = false
    prompt.Style = Enum.ProximityPromptStyle.Default
    prompt.Parent = model.PrimaryPart or model:FindFirstChildWhichIsA("BasePart")
    return prompt
end

local function makeRarityBadge(model, entry)
    local badge = Instance.new("BillboardGui")
    badge.Name = "RarityBadge"
    badge.Adornee = model.PrimaryPart
    badge.Size = UDim2.new(0, 128, 0, 34)
    badge.AlwaysOnTop = false
    badge.MaxDistance = 45
    badge.StudsOffset = Vector3.new(0, 3.1, 0)
    badge.Parent = model.PrimaryPart
    local lbl = Instance.new("TextLabel")
    lbl.Size = UDim2.new(1, 0, 1, 0); lbl.BackgroundTransparency = 1
    lbl.TextColor3 = Config.RarityColors[entry.rarity] or Color3.new(1, 1, 1)
    lbl.TextStrokeTransparency = 0; lbl.TextStrokeColor3 = Color3.new(0, 0, 0)
    lbl.TextScaled = false; lbl.TextSize = 14; lbl.Font = Enum.Font.GothamBlack
    lbl.Text = string.upper(entry.rarity) .. " | " .. tostring(entry.baseCps) .. "/s"
    lbl.Parent = badge
end

local function findFreeStand(plot)
    for _, stand in ipairs(plot.Stands:GetChildren()) do
        local occ = stand:FindFirstChild("OccupantId")
        if occ and occ.Value == "" then return stand end
    end
    return nil
end

local function findOwnerPlot(player)
    for _, plot in ipairs(plotCenters) do
        local owner = plot:FindFirstChild("OwnerUserId")
        if owner and owner.Value == tostring(player.UserId) then return plot end
    end
    return nil
end

local function attachCpsTag(model, entry, ownerUserId)
    model:SetAttribute("BaseCps", entry.baseCps)
    model:SetAttribute("OwnerUserId", ownerUserId)
    model:SetAttribute("Rarity", entry.rarity)
    model:SetAttribute("BrainrotName", entry.name)
end

local function placeOnStand(model, plot, ownerUserId, entry)
    local stand = findFreeStand(plot)
    if not stand then return false end
    local occ = stand:FindFirstChild("OccupantId")
    if occ then occ.Value = tostring(model:GetAttribute("BrainrotId")) end
    local primary = model.PrimaryPart
    if not primary then return false end
    local target = stand.Position + Vector3.new(0, 4, 0)
    local goal = { Position = target }
    local tween = TweenService:Create(primary, TweenInfo.new(0.4, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), goal)
    tween:Play()
    tween.Completed:Connect(function()
        attachCpsTag(model, entry, ownerUserId)
        model.Parent = stand
        _memeNpcIdle(model, primary)
        local existingPrompt = primary:FindFirstChildOfClass("ProximityPrompt")
        if existingPrompt then existingPrompt:Destroy() end
        if Config.StealingEnabled then
            local steal = Instance.new("ProximityPrompt")
            steal.ActionText = "Steal " .. entry.name
            steal.ObjectText = "Raid risk | hold"
            steal.HoldDuration = Config.StealHoldDuration
            steal.MaxActivationDistance = 8
            steal.RequiresLineOfSight = false
            steal.Parent = primary
            steal.Triggered:Connect(function(stealer)
                if tostring(stealer.UserId) == ownerUserId then return end
                if isPlotLocked(plot) then
                    sendFeed(stealer, "Base locked. Wait " .. tostring(secondsLeftLocked(plot)) .. "s or raid later.", Color3.fromRGB(255, 90, 90))
                    local ownerPlayer = Players:GetPlayerByUserId(tonumber(ownerUserId) or 0)
                    if ownerPlayer then
                        sendFeed(ownerPlayer, stealer.Name .. " tried to steal " .. entry.name .. " from your locked base.", Color3.fromRGB(255, 180, 80))
                    end
                    return
                end
                local stealerPlot = findOwnerPlot(stealer)
                if not stealerPlot then return end
                local newStand = findFreeStand(stealerPlot)
                if not newStand then return end
                if occ then occ.Value = "" end
                local ownerPlayer = Players:GetPlayerByUserId(tonumber(ownerUserId) or 0)
                if ownerPlayer then
                    sendFeed(ownerPlayer, "RAID ALERT: " .. stealer.Name .. " stole " .. entry.name .. "!", Color3.fromRGB(255, 70, 90))
                end
                broadcastFeed(stealer.Name .. " stole " .. entry.name .. "!", Color3.fromRGB(255, 70, 90))
                flashAt(primary.Position, Color3.fromRGB(255, 70, 90), "STOLEN!")
                local stealerRoot = stealer.Character and stealer.Character:FindFirstChild("HumanoidRootPart")
                if stealerRoot and stealerRoot:IsA("BasePart") then
                    local a0 = Instance.new("Attachment")
                    a0.Parent = primary
                    local a1 = Instance.new("Attachment")
                    a1.Parent = stealerRoot
                    local beam = Instance.new("Beam")
                    beam.Name = "StealBeam"
                    beam.Attachment0 = a0
                    beam.Attachment1 = a1
                    beam.Color = ColorSequence.new(Color3.fromRGB(255, 70, 90), Color3.fromRGB(255, 220, 80))
                    beam.Width0 = 0.55
                    beam.Width1 = 0.15
                    beam.FaceCamera = true
                    beam.LightEmission = 1
                    beam.Parent = primary
                    Debris:AddItem(beam, 1.2)
                    Debris:AddItem(a0, 1.3)
                    Debris:AddItem(a1, 1.3)
                end
                model:SetAttribute("OwnerUserId", tostring(stealer.UserId))
                placeOnStand(model, stealerPlot, tostring(stealer.UserId), entry)
                -- 10s steal cooldown / invincibility highlight
                local hl = Instance.new("Highlight")
                hl.FillColor = Color3.fromRGB(80, 255, 120); hl.OutlineColor = Color3.fromRGB(255, 255, 255)
                hl.FillTransparency = 0.5; hl.OutlineTransparency = 0; hl.Adornee = model
                hl.Parent = model
                Debris:AddItem(hl, 10)
            end)
        end
    end)
    return true
end

local function spawnBrainrotOnConveyor()
    if activeBrainrotCount >= Config.MaxActiveOnConveyor then return end
    local entry = Config.RollWeighted()  -- HOTFIX session #149: no arg, picker uses math.random internally
    if not entry then return end
    -- HOTFIX2 session #149: conveyor now along X axis. Brainrots spawn at +X end (east),
    -- travel to -X end (west). Y=8 keeps them floating above the conveyor surface.
    local startPos = Vector3.new(Config.ConveyorLength / 2 - 6, 8, 30)
    activeBrainrotCount += 1
    local idx = math.random(1000, 99999)
    local model = buildBrainrotModel(activeFolder, startPos, idx, entry)
    if not model then activeBrainrotCount -= 1; return end
    model:SetAttribute("BrainrotId", idx)
    model:SetAttribute("Entry", entry.name)
    makeRarityBadge(model, entry)
    if hypeRarities[entry.rarity] then
        local rarityColor = Config.RarityColors[entry.rarity] or Color3.fromRGB(255, 220, 80)
        broadcastFeed(string.upper(entry.rarity) .. " SPAWN: " .. entry.name .. " on the conveyor!", rarityColor)
        flashAt(startPos + Vector3.new(0, 2, 0), rarityColor, string.upper(entry.rarity) .. "!")
    end
    print("[BrainrotConveyor] Spawned brainrot:", entry.name, "rarity:", entry.rarity, "decalAssetId:", entry.decalAssetId or 0)

    -- Tween down the conveyor (along X axis) over (length / speed) seconds.
    local primary = model.PrimaryPart
    if not primary then activeBrainrotCount -= 1; return end
    local endPos = Vector3.new(-(Config.ConveyorLength / 2) + 6, 8, 30)
    local duration = Config.ConveyorLength / Config.ConveyorSpeed
    local tween = TweenService:Create(primary, TweenInfo.new(duration, Enum.EasingStyle.Linear), { Position = endPos })

    local prompt = makeBuyPrompt(model, entry)
    local currentPrice = entry.priceCash
    local function updateBuyPrompt()
        if prompt and prompt.Parent then
            prompt.ActionText = "Buy " .. entry.name
            prompt.ObjectText = string.format("%d Cash | %d CPS", currentPrice, entry.baseCps)
        end
    end
    updateBuyPrompt()
    local sold = false
    prompt.Triggered:Connect(function(buyer)
        if sold or not buyer then return end
        local stats = buyer:FindFirstChild("leaderstats")
        local cash = stats and stats:FindFirstChild("Cash")
        if not cash or cash.Value < currentPrice then
            -- Flash the prompt red briefly.
            prompt.ActionText = "Need " .. currentPrice .. " cash"
            currentPrice = math.floor(currentPrice * 1.08 + 0.5)
            task.delay(1.2, updateBuyPrompt)
            return
        end
        local ownerPlot = findOwnerPlot(buyer)
        if not ownerPlot then return end
        local stand = findFreeStand(ownerPlot)
        if not stand then
            prompt.ActionText = "Plot full!"
            currentPrice = math.floor(currentPrice * 1.04 + 0.5)
            task.delay(1.2, updateBuyPrompt)
            return
        end
        sold = true
        cash.Value = cash.Value - currentPrice
        sendFeed(buyer, "Bought " .. entry.name .. " for " .. tostring(currentPrice) .. " cash.", Color3.fromRGB(80, 255, 160))
        flashAt(primary.Position, Color3.fromRGB(80, 255, 160), "+CPS")
        prompt:Destroy()
        tween:Cancel()
        placeOnStand(model, ownerPlot, tostring(buyer.UserId), entry)
    end)

    tween:Play()
    tween.Completed:Connect(function()
        if not sold and model.Parent then
            -- Unsold at end of conveyor — auto-despawn after a grace period.
            task.delay(Config.UnsoldBrainrotLifetime, function()
                if not sold and model.Parent then
                    model:Destroy()
                    activeBrainrotCount = math.max(0, activeBrainrotCount - 1)
                end
            end)
        end
        if sold then
            activeBrainrotCount = math.max(0, activeBrainrotCount - 1)
        end
    end)
end

task.spawn(function()
    while task.wait(Config.SpawnInterval) do
        pcall(spawnBrainrotOnConveyor)
    end
end)

-- ──────────────────────────────────────────────────────────────────────
-- CPS SERVICE: 1 Hz tick that sums every brainrot's BaseCps onto its owner.
task.spawn(function()
    while task.wait(1) do
        local perPlayerCps = {}
        for _, plot in ipairs(plotCenters) do
            local ownerVal = plot:FindFirstChild("OwnerUserId")
            local ownerId = ownerVal and ownerVal.Value or ""
            if ownerId ~= "" then
                local total = 0
                for _, stand in ipairs(plot.Stands:GetChildren()) do
                    for _, m in ipairs(stand:GetChildren()) do
                        if m:IsA("Model") and m:GetAttribute("BaseCps") then
                            total = total + (m:GetAttribute("BaseCps") or 0)
                        end
                    end
                end
                perPlayerCps[ownerId] = total
            end
        end
        for _, player in ipairs(Players:GetPlayers()) do
            local stats = player:FindFirstChild("leaderstats")
            if stats then
                local cps = stats:FindFirstChild("CPS")
                local cash = stats:FindFirstChild("Cash")
                local rebirths = stats:FindFirstChild("Rebirths")
                local total = perPlayerCps[tostring(player.UserId)] or 0
                local mult = 1 + ((rebirths and rebirths.Value or 0) * 0.25)
                local final = math.floor(total * mult + 0.5)
                if cps then cps.Value = final end
                if cash then cash.Value = cash.Value + final end
            end
        end
    end
end)

-- ──────────────────────────────────────────────────────────────────────
-- REBIRTH PORTAL — central pillar between spawn and plots (HOTFIX2 layout v2).
local rebirthPart = Instance.new("Part")
rebirthPart.Name = "RebirthPortal"
rebirthPart.Size = Vector3.new(6, 12, 6)
rebirthPart.Position = Vector3.new(0, 6, -100)
rebirthPart.Anchored = true
rebirthPart.Material = Enum.Material.Neon
rebirthPart.Color = Color3.fromRGB(180, 80, 255)
rebirthPart.Shape = Enum.PartType.Cylinder
rebirthPart.Orientation = Vector3.new(0, 0, 90)
rebirthPart.CanCollide = false
rebirthPart.Parent = container

local rebirthPrompt = Instance.new("ProximityPrompt")
rebirthPrompt.ActionText = "Rebirth (+25% CPS)"
rebirthPrompt.ObjectText = "Resets Cash"
rebirthPrompt.HoldDuration = 1.5
rebirthPrompt.MaxActivationDistance = 12
rebirthPrompt.Parent = rebirthPart
rebirthPrompt.Triggered:Connect(function(player)
    local stats = player:FindFirstChild("leaderstats")
    if not stats then return end
    local cash = stats:FindFirstChild("Cash")
    local rebirths = stats:FindFirstChild("Rebirths")
    local minCash = 50000 * (1 + (rebirths and rebirths.Value or 0))
    if cash and cash.Value >= minCash and rebirths then
        cash.Value = 0
        rebirths.Value = rebirths.Value + 1
        broadcastFeed(player.Name .. " rebirthed. CPS multiplier upgraded!", Color3.fromRGB(180, 80, 255))
        flashAt(rebirthPart.Position + Vector3.new(0, 7, 0), Color3.fromRGB(180, 80, 255), "REBIRTH!")
    end
end)

print("[BrainrotConveyor] " .. ${titleLua} .. " online — " .. #plotCenters .. " plots, " .. #Config.Pool .. " brainrots in pool, stealing=" .. tostring(Config.StealingEnabled))
`;

  // HUD client — Cash + CPS + Rebirth counter overlay.
  const hudClient = `--!strict
-- AUTO-GENERATED brainrot HUD client (session #149)
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")

local stats = player:WaitForChild("leaderstats", 10)
local cash = stats and stats:WaitForChild("Cash", 5)
local cps = stats and stats:WaitForChild("CPS", 5)
local rebirths = stats and stats:WaitForChild("Rebirths", 5)

local gui = Instance.new("ScreenGui"); gui.Name = "BrainrotHud"; gui.ResetOnSpawn = false; gui.Parent = playerGui
local feedEvent = ReplicatedStorage:WaitForChild("BrainrotFeed", 10)

local frame = Instance.new("Frame")
frame.Size = UDim2.new(0, 280, 0, 130)
frame.Position = UDim2.new(0, 16, 0, 16)
frame.BackgroundColor3 = Color3.fromRGB(15, 15, 25)
frame.BackgroundTransparency = 0.15
frame.BorderSizePixel = 0
frame.Parent = gui

local stroke = Instance.new("UIStroke"); stroke.Color = Color3.fromRGB(180, 80, 255); stroke.Thickness = 2; stroke.Parent = frame
local corner = Instance.new("UICorner"); corner.CornerRadius = UDim.new(0, 12); corner.Parent = frame

local function makeRow(name, position, color)
    local lbl = Instance.new("TextLabel")
    lbl.Name = name
    lbl.Size = UDim2.new(1, -20, 0, 38)
    lbl.Position = position
    lbl.BackgroundTransparency = 1
    lbl.TextColor3 = color
    lbl.TextStrokeTransparency = 0
    lbl.Font = Enum.Font.GothamBlack
    lbl.TextScaled = true
    lbl.TextXAlignment = Enum.TextXAlignment.Left
    lbl.Parent = frame
    return lbl
end

local cashLabel = makeRow("Cash", UDim2.new(0, 10, 0, 4), Color3.fromRGB(255, 220, 80))
local cpsLabel = makeRow("Cps", UDim2.new(0, 10, 0, 44), Color3.fromRGB(80, 220, 180))
local rebirthLabel = makeRow("Rb", UDim2.new(0, 10, 0, 84), Color3.fromRGB(180, 80, 255))

local guide = Instance.new("Frame")
guide.Name = "BrainrotGuide"
guide.Size = UDim2.new(0, 280, 0, 104)
guide.Position = UDim2.new(0, 16, 0, 154)
guide.BackgroundColor3 = Color3.fromRGB(15, 15, 25)
guide.BackgroundTransparency = 0.22
guide.BorderSizePixel = 0
guide.Parent = gui
local guideCorner = Instance.new("UICorner"); guideCorner.CornerRadius = UDim.new(0, 12); guideCorner.Parent = guide
local guideStroke = Instance.new("UIStroke"); guideStroke.Color = Color3.fromRGB(80, 220, 255); guideStroke.Thickness = 1; guideStroke.Parent = guide

local guideLabel = Instance.new("TextLabel")
guideLabel.Size = UDim2.new(1, -18, 1, -14)
guideLabel.Position = UDim2.new(0, 9, 0, 7)
guideLabel.BackgroundTransparency = 1
guideLabel.TextColor3 = Color3.fromRGB(235, 245, 255)
guideLabel.TextStrokeTransparency = 0.55
guideLabel.TextSize = 15
guideLabel.TextWrapped = true
guideLabel.TextXAlignment = Enum.TextXAlignment.Left
guideLabel.TextYAlignment = Enum.TextYAlignment.Top
guideLabel.Font = Enum.Font.GothamBold
guideLabel.Text = "WHAT TO DO\\n1. Walk to conveyor\\n2. Hold E to buy\\n3. Fill your base\\n4. Lock base / steal"
guideLabel.Parent = guide

local toast = Instance.new("TextLabel")
toast.Name = "BrainrotToast"
toast.Size = UDim2.new(0, 520, 0, 48)
toast.Position = UDim2.new(0.5, -260, 0, 18)
toast.BackgroundColor3 = Color3.fromRGB(15, 15, 25)
toast.BackgroundTransparency = 0.12
toast.TextColor3 = Color3.fromRGB(255, 220, 80)
toast.TextStrokeTransparency = 0
toast.TextScaled = true
toast.Font = Enum.Font.GothamBlack
toast.Visible = false
toast.Parent = gui
local toastCorner = Instance.new("UICorner"); toastCorner.CornerRadius = UDim.new(0, 12); toastCorner.Parent = toast
local toastStroke = Instance.new("UIStroke"); toastStroke.Color = Color3.fromRGB(255, 220, 80); toastStroke.Thickness = 2; toastStroke.Parent = toast

local function fmt(n)
    if not n then return "0" end
    if n >= 1e9 then return string.format("%.1fB", n / 1e9) end
    if n >= 1e6 then return string.format("%.1fM", n / 1e6) end
    if n >= 1e3 then return string.format("%.1fK", n / 1e3) end
    return tostring(n)
end

local function refresh()
    cashLabel.Text = "💰 Cash: " .. fmt(cash and cash.Value or 0)
    cpsLabel.Text = "⚡ " .. fmt(cps and cps.Value or 0) .. "/sec"
    rebirthLabel.Text = "🔄 Rebirths: " .. fmt(rebirths and rebirths.Value or 0)
end

if cash then cash.Changed:Connect(refresh) end
if cps then cps.Changed:Connect(refresh) end
if rebirths then rebirths.Changed:Connect(refresh) end
refresh()

if feedEvent and feedEvent:IsA("RemoteEvent") then
    feedEvent.OnClientEvent:Connect(function(text, color)
        toast.Text = tostring(text)
        if typeof(color) == "Color3" then
            toast.TextColor3 = color
            toastStroke.Color = color
        end
        toast.Visible = true
        task.delay(3, function()
            if toast.Text == tostring(text) then toast.Visible = false end
        end)
    end)
end
	`;

  // HOTFIX2 session #149: SlapTool moved inline into the main server script
  // as setupSlapTool() — flat Script in StarterPack tried Tool.Activated:Connect
  // where script.Parent was StarterPack itself, throwing "attempt to index nil".
  // Tool is now an actual Tool instance created server-side per player.

  return {
    serverScript,
    additionalScripts: [
      { name: 'BrainrotConfig', scriptType: 'ModuleScript', container: 'ReplicatedStorage', source: brainrotConfig },
      { name: 'BrainrotHud',    scriptType: 'LocalScript',  container: 'StarterPlayerScripts', source: hudClient },
    ],
  };
}

// ── Session #175: Obby Troll & Trap Maker ─────────────────────────────────
// Self-contained server Lua that materializes a troll-obby map from params.trolls[]
// (parsed from generateObbyTrollGdd JSON). 6 trap types: invisible_kill,
// fake_checkpoint, disappear, launcher, decoy, reverse. Real checkpoints emit
// per-player SpawnLocation every params.checkpointEvery stages. Pattern mirrors
// buildBrainrotConveyorScript (session #149).
function buildTrollObbyScript(params: GameTemplateParams): MultiScriptResult {
  const themeKey = (params.obbyThemeKey && OBBY_THEMES[params.obbyThemeKey])
    ? params.obbyThemeKey
    : (params.gameKind === 'obby_troll' && params.memeSubTheme ? 'meme' : 'default');
  const theme = OBBY_THEMES[themeKey] || OBBY_THEMES['default'];
  const totalLevels = Math.min(Math.max(params.totalLevels || 15, 8), 30);
  const checkpointEvery = Math.min(Math.max(params.checkpointEvery || 3, 2), 6);
  const savagery = (params.savagery === 'lite' || params.savagery === 'savage' || params.savagery === 'medium')
    ? params.savagery
    : 'medium';
  const gotchaText = (params.signatureGotchaText || '💀 GOTCHA').slice(0, 24);
  const titleClean = (params.title || 'Troll Obby').replace(/[\r\n]/g, ' ').slice(0, 60);
  const seedSource = `${titleClean}|${themeKey}|${params.jobId || ''}|${totalLevels}|${savagery}`;
  const seed = hashStringToInt(seedSource);
  const rng = makeSeededRng(seed);

  // Build / sanitize troll map. If params.trolls is missing or undersized,
  // synthesise a fallback distribution from savagery so the game is still playable.
  const trapDensityBySavagery: Record<'lite' | 'medium' | 'savage', number> = {
    lite: 0.20,
    medium: 0.45,
    savage: 0.70,
  };
  const trapTypes: TrollObbyTrap['type'][] = ['invisible_kill', 'fake_checkpoint', 'disappear', 'launcher', 'decoy', 'reverse'];
  const focusedTrapTypes = Array.isArray(params.trollTrapFocus)
    ? params.trollTrapFocus.filter((type, index, all) => trapTypes.includes(type) && all.indexOf(type) === index)
    : [];
  const fillTrapTypes = focusedTrapTypes.length > 0 ? focusedTrapTypes : trapTypes;
  const incomingTrolls = Array.isArray(params.trolls) ? params.trolls.filter((t) => t && typeof t.level === 'number' && trapTypes.includes(t.type)) : [];
  const trollByLevel = new Map<number, TrollObbyTrap>();
  for (const t of incomingTrolls) {
    if (t.level <= 1 || t.level > totalLevels) continue; // level 1 is always warm-up
    const focusedIndex = Math.abs(Math.floor(t.level)) % fillTrapTypes.length;
    const type = focusedTrapTypes.length > 0 && !focusedTrapTypes.includes(t.type)
      ? fillTrapTypes[focusedIndex]
      : t.type;
    if (t.level % checkpointEvery === 0 && type === 'fake_checkpoint') continue; // never on real checkpoint slot
    if (!trollByLevel.has(t.level)) trollByLevel.set(t.level, { ...t, type });
  }
  // Fill to target density if LLM under-supplied.
  const targetTrapCount = Math.round((totalLevels - 1) * trapDensityBySavagery[savagery]);
  let attempts = 0;
  while (trollByLevel.size < targetTrapCount && attempts < 200) {
    attempts++;
    const lvl = 2 + Math.floor(rng() * (totalLevels - 1));
    if (lvl > totalLevels) continue;
    if (trollByLevel.has(lvl)) continue;
    if (lvl % checkpointEvery === 0) continue; // protect real checkpoints
    const type = fillTrapTypes[Math.floor(rng() * fillTrapTypes.length)];
    if (type === 'fake_checkpoint' && lvl % checkpointEvery === 0) continue;
    const intensity: 'soft' | 'medium' | 'hard' =
      savagery === 'lite' ? 'soft' :
      savagery === 'savage' ? (rng() < 0.6 ? 'hard' : 'medium') :
      (rng() < 0.5 ? 'medium' : 'soft');
    trollByLevel.set(lvl, { level: lvl, type, intensity });
  }

  // Sort and emit Lua array.
  const trollEntries = Array.from(trollByLevel.values()).sort((a, b) => a.level - b.level);
  const trollsLua = trollEntries
    .map((t) => `    { level = ${t.level}, type = "${t.type}", intensity = "${t.intensity || 'medium'}" },`)
    .join('\n');

  const rgb = (c: [number, number, number]) => `Color3.fromRGB(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)})`;
  const platformColorLua = rgb(theme.platform);
  const accent1Lua = rgb(theme.accent1);
  const accent2Lua = rgb(theme.accent2);
  const winColorLua = rgb(theme.win || [0.2, 0.9, 0.4]);
  const checkpointColorLua = rgb(theme.checkpoint || [0.3, 0.9, 0.5]);
  const skyMaterial = themeKey === 'space' ? 'Neon' : (themeKey === 'lava' ? 'CrackedLava' : (themeKey === 'horror' ? 'Slate' : 'Plastic'));

  const titleLua = JSON.stringify(titleClean);
  const gotchaLua = JSON.stringify(gotchaText);

  const trollConfig = `--!strict
-- AUTO-GENERATED by buildTrollObbyScript (session #175) — Obby Troll & Trap Maker.
-- Owns the level layout: ${totalLevels} stages, savagery=${savagery}, checkpoints every ${checkpointEvery}.
local Config = {}

Config.GameTitle        = ${titleLua}
Config.ThemeKey         = "${themeKey}"
Config.TotalLevels      = ${totalLevels}
Config.CheckpointEvery  = ${checkpointEvery}
Config.Savagery         = "${savagery}"
Config.SignatureGotcha  = ${gotchaLua}
Config.Seed             = ${seed}

-- World layout constants (studs)
Config.SpawnY           = 5
Config.StageGap         = 14    -- distance between stage start and next stage start (Z+); tuned for default JumpPower=50
Config.StageDepth       = 8     -- canonical platform Z size; individual shapes scale this down
Config.StageWidth       = 12    -- canonical platform X size; individual shapes scale this down
Config.StageHeight      = 1     -- platform Y size
Config.KillFloorY       = -45   -- below all stages, anything falling past gets respawned
Config.RespawnTime      = 2

Config.PlatformColor    = ${platformColorLua}
Config.Accent1Color     = ${accent1Lua}
Config.Accent2Color     = ${accent2Lua}
Config.WinColor         = ${winColorLua}
Config.CheckpointColor  = ${checkpointColorLua}
Config.PlatformMaterial = Enum.Material.${skyMaterial}

Config.Trolls = {
${trollsLua}
}

function Config.GetTroll(level)
    for _, entry in ipairs(Config.Trolls) do
        if entry.level == level then return entry end
    end
    return nil
end

function Config.IsRealCheckpoint(level)
    return level > 0 and level < Config.TotalLevels and (level % Config.CheckpointEvery) == 0
end

return Config
`;

  const serverScript = `-- AUTO-GENERATED Obby Troll & Trap Maker server (session #175)
-- Title: ${titleClean}
-- Theme: ${themeKey} | Levels: ${totalLevels} | Savagery: ${savagery} | Checkpoint every: ${checkpointEvery}

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local Workspace = game:GetService("Workspace")
local TweenService = game:GetService("TweenService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Teams = game:GetService("Teams")
local Debris = game:GetService("Debris")

math.randomseed(${seed})

Players.RespawnTime = 2

local Config = require(ReplicatedStorage:WaitForChild("TrollObbyConfig"))

-- RemoteEvent for client-side GOTCHA banner + camera shake.
local gotchaEvent = ReplicatedStorage:FindFirstChild("TrollGotcha")
if not gotchaEvent then
    gotchaEvent = Instance.new("RemoteEvent")
    gotchaEvent.Name = "TrollGotcha"
    gotchaEvent.Parent = ReplicatedStorage
end

local function fireGotcha(player, trapType)
    if gotchaEvent and player then
        gotchaEvent:FireClient(player, tostring(trapType or "trap"), Config.SignatureGotcha)
    end
end

-- World folder.
local world = Workspace:FindFirstChild("TrollObbyWorld")
if world then world:Destroy() end
world = Instance.new("Folder")
world.Name = "TrollObbyWorld"
world.Parent = Workspace

-- ── World scaffolding ────────────────────────────────────────────────────
-- Kill floor: anything that falls past Y=KillFloorY gets killed instantly.
local killFloor = Instance.new("Part")
killFloor.Name = "TrollKillFloor"
killFloor.Anchored = true
killFloor.CanCollide = false
killFloor.CanTouch = true
killFloor.Transparency = 1
killFloor.Size = Vector3.new(2000, 4, 2000 + Config.StageGap * Config.TotalLevels)
killFloor.Position = Vector3.new(0, Config.KillFloorY, Config.StageGap * Config.TotalLevels * 0.5)
killFloor.Parent = world
killFloor.Touched:Connect(function(hit)
    local hum = hit.Parent and hit.Parent:FindFirstChildOfClass("Humanoid")
    if hum and hum.Health > 0 then hum.Health = 0 end
end)

-- Helpers ────────────────────────────────────────────────────────────────
local function makePlatform(name, position, size, color, material, parent)
    local p = Instance.new("Part")
    p.Name = name
    p.Anchored = true
    p.CanCollide = true
    p.Size = size or Vector3.new(Config.StageWidth, Config.StageHeight, Config.StageDepth)
    p.Position = position
    p.Color = color or Config.PlatformColor
    p.Material = material or Config.PlatformMaterial
    p.TopSurface = Enum.SurfaceType.Smooth
    p.BottomSurface = Enum.SurfaceType.Smooth
    p.Parent = parent or world
    return p
end

local function makeBillboard(parent, text, color, height, scale)
    local bb = Instance.new("BillboardGui")
    bb.Adornee = parent
    bb.Size = UDim2.new(scale or 6, 0, (scale or 6) * 0.4, 0)
    bb.StudsOffset = Vector3.new(0, height or 4, 0)
    bb.AlwaysOnTop = true
    bb.LightInfluence = 0
    bb.Parent = parent
    local label = Instance.new("TextLabel")
    label.BackgroundTransparency = 1
    label.Size = UDim2.fromScale(1, 1)
    label.Text = text or ""
    label.TextScaled = true
    label.TextColor3 = color or Color3.fromRGB(255, 255, 255)
    label.Font = Enum.Font.GothamBlack
    label.TextStrokeTransparency = 0
    label.TextStrokeColor3 = Color3.fromRGB(0, 0, 0)
    label.Parent = bb
    return label
end

local function addPlayPolishSparkles(parent, rate)
    if not parent then return nil end
    local emitter = Instance.new("ParticleEmitter")
    emitter.Name = "PlayPolishSparkles"
    emitter.Enabled = true
    emitter.Rate = rate or 3
    emitter.Lifetime = NumberRange.new(0.55, 1.2)
    emitter.Speed = NumberRange.new(0.25, 1.1)
    emitter.SpreadAngle = Vector2.new(180, 180)
    emitter.LightEmission = 1
    emitter.LightInfluence = 0
    emitter.Color = ColorSequence.new(Config.Accent1Color, Config.Accent2Color)
    emitter.Size = NumberSequence.new({
        NumberSequenceKeypoint.new(0, 0.24),
        NumberSequenceKeypoint.new(0.65, 0.12),
        NumberSequenceKeypoint.new(1, 0),
    })
    emitter.Transparency = NumberSequence.new({
        NumberSequenceKeypoint.new(0, 0.35),
        NumberSequenceKeypoint.new(1, 1),
    })
    emitter.Parent = parent
    return emitter
end

local function pulseTransparency(part, low, high, period)
    if not part then return end
    task.spawn(function()
        while part.Parent do
            local fadeOut = TweenService:Create(part, TweenInfo.new(period or 0.8, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut), { Transparency = high or 0.75 })
            fadeOut:Play()
            fadeOut.Completed:Wait()
            if not part.Parent then break end
            local fadeIn = TweenService:Create(part, TweenInfo.new(period or 0.8, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut), { Transparency = low or 0.25 })
            fadeIn:Play()
            fadeIn.Completed:Wait()
        end
    end)
end

-- ── Per-player checkpoint tracking ───────────────────────────────────────
local playerStage = {} -- userId → highest reached level (max 0..TotalLevels)
local playerSpawn = {} -- userId → SpawnLocation reference
local realCheckpoints = {} -- level → SpawnLocation

local function markCheckpointReached(player, level)
    local prev = playerStage[player.UserId] or 0
    if level > prev then
        playerStage[player.UserId] = level
        local stats = player:FindFirstChild("leaderstats")
        if stats then
            local stage = stats:FindFirstChild("Stage")
            if stage then stage.Value = level end
        end
    end
    if realCheckpoints[level] then
        playerSpawn[player.UserId] = realCheckpoints[level]
        player.RespawnLocation = realCheckpoints[level]
    end
end

local function incrementDeaths(player)
    local stats = player:FindFirstChild("leaderstats")
    if stats then
        local deaths = stats:FindFirstChild("Deaths")
        if deaths then deaths.Value = deaths.Value + 1 end
    end
end

-- ── Stage builders ───────────────────────────────────────────────────────
-- Session #175 follow-up: variety system. 6 shape variants for normal stages,
-- lateral X zigzag, and shape-aware trap zones (read platform.Size dynamically).
local STAGE_SHAPES = { "wide", "narrow", "thin_walkway", "small_hop", "double_pillar", "staircase" }

local function shapeForLevel(level)
    -- Real checkpoints + level 1 always get the safest "wide" shape so the
    -- player has a reliable landing surface (no surprise narrow pillar).
    if Config.IsRealCheckpoint(level) or level <= 1 then return "wide" end
    local h = (level * 2654435761) % 1000
    return STAGE_SHAPES[(h % #STAGE_SHAPES) + 1]
end

local function lateralOffset(level)
    -- Real checkpoints always centered (X=0) so respawn position is predictable.
    if Config.IsRealCheckpoint(level) or level <= 1 then return 0 end
    local h = (level * 1597463007) % 100
    if level % 4 == 0 then return 0 end
    return ((h % 3) - 1) * 3 -- -3 / 0 / +3 stud
end

local function stageCenter(level)
    return Vector3.new(lateralOffset(level), Config.SpawnY, level * Config.StageGap)
end

local function stageCenterFlat(level)
    -- For traps that must be predictable (fake_checkpoint mimics real), ignore lateral zigzag.
    return Vector3.new(0, Config.SpawnY, level * Config.StageGap)
end

-- Tracks active disappear-tweens per part so we can cancel on player death.
local activeTweens = {}

-- Primary landing part per level (used by trap builders to read actual Size/Position).
local stagePrimary = {}

local function fairRouteSide(level)
    return (level % 2 == 0) and 1 or -1
end

local function addStagePlayPolish(level, platform, mode)
    if not platform then return end
    if level == 1 then
        addPlayPolishSparkles(platform, 5)
        makeBillboard(platform, "RUN →", Color3.fromRGB(210, 255, 255), 5.5, 5)
    elseif mode == "checkpoint" then
        addPlayPolishSparkles(platform, 4)
    elseif level % 5 == 0 then
        addPlayPolishSparkles(platform, 2)
    end
end

local function addInvisibleSpikePolish(level, platform)
    if not platform then return end
    local side = fairRouteSide(level)
    local tell = makePlatform(
        "InvisibleSpikeGlitch_" .. level,
        platform.Position + Vector3.new(side * platform.Size.X * 0.42, platform.Size.Y * 0.5 + 0.3, 0),
        Vector3.new(0.35, 0.35, math.max(2, platform.Size.Z * 0.85)),
        Config.Accent2Color,
        Enum.Material.Neon,
        world
    )
    tell.CanCollide = false
    tell.CanTouch = false
    tell.Transparency = 0.62
    tell:SetAttribute("InvisibleSpikeTell", true)
    tell:SetAttribute("TrapLevel", level)
    addPlayPolishSparkles(tell, 2)
    pulseTransparency(tell, 0.45, 0.86, 0.65)
    if level <= 5 then
        makeBillboard(tell, "???", Color3.fromRGB(255, 120, 255), 3.5, 2.5)
    end
end

local function buildFairRoute(level, reason)
    local side = fairRouteSide(level)
    local pos = stageCenterFlat(level)
    local railX = side * (Config.StageWidth * 0.62)
    local railColor = (level % 2 == 0) and Config.Accent2Color or Config.Accent1Color
    local padColor = (level % 2 == 0) and Config.Accent1Color or Config.Accent2Color

    local rail = makePlatform(
        "FairRoute_" .. level .. "_" .. tostring(reason or "trap"),
        Vector3.new(railX, Config.SpawnY + 0.14, pos.Z),
        Vector3.new(2.4, 0.45, Config.StageGap + Config.StageDepth + 2),
        railColor,
        Enum.Material.SmoothPlastic,
        world
    )
    rail.Transparency = 0.08
    rail.CanTouch = false
    rail:SetAttribute("FairRoute", true)
    rail:SetAttribute("TrapLevel", level)

    local startPad = makePlatform(
        "FairRouteStart_" .. level,
        Vector3.new(railX, Config.SpawnY + 0.18, pos.Z - Config.StageGap * 0.5),
        Vector3.new(4.8, 0.35, 4.4),
        padColor,
        Enum.Material.Neon,
        world
    )
    startPad.Transparency = 0.12
    startPad.CanTouch = false
    startPad:SetAttribute("FairRoute", true)

    local endPad = makePlatform(
        "FairRouteEnd_" .. level,
        Vector3.new(railX, Config.SpawnY + 0.18, pos.Z + Config.StageGap * 0.5),
        Vector3.new(4.8, 0.35, 4.4),
        padColor,
        Enum.Material.Neon,
        world
    )
    endPad.Transparency = 0.12
    endPad.CanTouch = false
    endPad:SetAttribute("FairRoute", true)

    makeBillboard(startPad, "↗", Color3.fromRGB(210, 255, 210), 3.2, 3)
    addPlayPolishSparkles(startPad, 3)
    addPlayPolishSparkles(endPad, 3)
    pulseTransparency(startPad, 0.08, 0.32, 0.9)
    pulseTransparency(endPad, 0.08, 0.32, 0.9)
    return rail
end

local function buildNormalStage(level)
    local pos = stageCenter(level)
    local accent = (level % 2 == 0) and Config.Accent1Color or Config.Accent2Color
    local shape = shapeForLevel(level)
    local primary

    if shape == "wide" then
        primary = makePlatform("Stage_" .. level, pos, Vector3.new(Config.StageWidth, Config.StageHeight, Config.StageDepth), Config.PlatformColor, Config.PlatformMaterial, world)
    elseif shape == "narrow" then
        primary = makePlatform("Stage_" .. level, pos, Vector3.new(Config.StageWidth * 0.55, Config.StageHeight, Config.StageDepth), Config.PlatformColor, Config.PlatformMaterial, world)
    elseif shape == "thin_walkway" then
        -- Skinny strip aligned along Z; player must walk a tightrope across the platform's full length.
        primary = makePlatform("Stage_" .. level, pos, Vector3.new(Config.StageWidth * 0.30, Config.StageHeight, Config.StageDepth), Config.PlatformColor, Config.PlatformMaterial, world)
    elseif shape == "small_hop" then
        primary = makePlatform("Stage_" .. level, pos, Vector3.new(Config.StageWidth * 0.45, Config.StageHeight, Config.StageDepth * 0.55), Config.PlatformColor, Config.PlatformMaterial, world)
    elseif shape == "double_pillar" then
        -- Two narrow square pillars at left/right; primary = first one player typically lands on.
        local pillarSize = Vector3.new(Config.StageWidth * 0.30, Config.StageHeight, Config.StageDepth * 0.65)
        primary = makePlatform("Stage_" .. level, pos + Vector3.new(-Config.StageWidth * 0.28, 0, 0), pillarSize, Config.PlatformColor, Config.PlatformMaterial, world)
        local secondary = makePlatform("Stage_" .. level .. "_b", pos + Vector3.new(Config.StageWidth * 0.28, 0, 0), pillarSize, Config.PlatformColor, Config.PlatformMaterial, world)
        local accentB = makePlatform("Stripe_" .. level .. "_b", secondary.Position + Vector3.new(0, secondary.Size.Y * 0.5 + 0.05, 0), Vector3.new(secondary.Size.X * 0.6, 0.2, secondary.Size.Z * 0.4), accent, Enum.Material.Neon, secondary)
        accentB.CanCollide = false
    elseif shape == "staircase" then
        -- 3 small steps going up; primary = first (lowest) step.
        local stepSize = Vector3.new(Config.StageWidth * 0.55, Config.StageHeight, Config.StageDepth * 0.32)
        for i = 0, 2 do
            local stepPos = pos + Vector3.new(0, i * 1.2, (i - 1) * stepSize.Z)
            local step = makePlatform("Stage_" .. level .. "_step" .. i, stepPos, stepSize, Config.PlatformColor, Config.PlatformMaterial, world)
            if i == 0 then primary = step end
        end
    else
        primary = makePlatform("Stage_" .. level, pos, Vector3.new(Config.StageWidth, Config.StageHeight, Config.StageDepth), Config.PlatformColor, Config.PlatformMaterial, world)
    end

    if primary then
        local stripe = makePlatform("Stripe_" .. level, primary.Position + Vector3.new(0, primary.Size.Y * 0.5 + 0.05, 0), Vector3.new(primary.Size.X * 0.6, 0.2, primary.Size.Z * 0.4), accent, Enum.Material.Neon, primary)
        stripe.CanCollide = false
        pulseTransparency(stripe, 0, 0.18, 1.1)
        addStagePlayPolish(level, primary, "normal")
    end

    stagePrimary[level] = primary
    return primary
end

local function buildRealCheckpoint(level)
    local pos = stageCenterFlat(level)
    local sl = Instance.new("SpawnLocation")
    sl.Name = "Checkpoint_" .. level
    sl.Anchored = true
    sl.Size = Vector3.new(Config.StageWidth, 1, Config.StageDepth)
    sl.Position = pos
    sl.Color = Config.CheckpointColor
    sl.Material = Enum.Material.Neon
    sl.TopSurface = Enum.SurfaceType.Smooth
    sl.BottomSurface = Enum.SurfaceType.Smooth
    sl.Neutral = false
    sl.AllowTeamChangeOnTouch = false
    sl.Enabled = false -- runtime switches RespawnLocation per-player; engine fallback off
    sl.Parent = world
    realCheckpoints[level] = sl
    stagePrimary[level] = sl
    -- Beacon
    local beacon = makePlatform("Beacon_" .. level, pos + Vector3.new(0, 5, 0), Vector3.new(0.6, 8, 0.6), Config.CheckpointColor, Enum.Material.Neon, sl)
    beacon.CanCollide = false
    makeBillboard(sl, "✅ CHECKPOINT " .. level, Color3.fromRGB(120, 255, 120), 9, 8)
    addStagePlayPolish(level, sl, "checkpoint")
    pulseTransparency(beacon, 0, 0.3, 0.8)
    sl.Touched:Connect(function(hit)
        local player = Players:GetPlayerFromCharacter(hit.Parent)
        if player then markCheckpointReached(player, level) end
    end)
    return sl
end

-- TRAP BUILDERS ──────────────────────────────────────────────────────────
local function buildTrap_invisibleKill(level, intensity)
    local platform = buildNormalStage(level)
    if not platform then return end
    buildFairRoute(level, "invisible_kill")
    -- Invisible kill zone covering all (hard) / half (medium) / small patch (soft).
    -- Reads platform.Size so the zone fits the current shape (thin walkway, pillar, etc.).
    local side = fairRouteSide(level)
    local coverage = (intensity == "hard") and 0.62 or (intensity == "soft" and 0.35 or 0.52)
    local trap = Instance.new("Part")
    trap.Name = "InvisibleTrap_" .. level
    trap.Anchored = true
    trap.CanCollide = false
    trap.CanTouch = true
    trap.Transparency = 1
    trap.Size = Vector3.new(platform.Size.X * coverage, 4, platform.Size.Z * coverage)
    trap.Position = platform.Position + Vector3.new(-side * platform.Size.X * 0.18, platform.Size.Y * 0.5 + 2, 0)
    trap.Material = Enum.Material.ForceField
    trap.Parent = world
    addInvisibleSpikePolish(level, platform)
    trap.Touched:Connect(function(hit)
        local hum = hit.Parent and hit.Parent:FindFirstChildOfClass("Humanoid")
        local player = Players:GetPlayerFromCharacter(hit.Parent)
        if hum and hum.Health > 0 and player then
            fireGotcha(player, "invisible_kill")
            hum.Health = 0
        end
    end)
end

local function buildTrap_fakeCheckpoint(level, intensity)
    -- Mimics the shape/position of a real checkpoint so the player can't tell them apart.
    local pos = stageCenterFlat(level)
    buildFairRoute(level, "fake_checkpoint")
    -- Visually identical to a real checkpoint, but kills on touch.
    local fake = Instance.new("Part")
    fake.Name = "FakeCheckpoint_" .. level
    fake.Anchored = true
    fake.CanCollide = true
    fake.Size = Vector3.new(Config.StageWidth, Config.StageHeight, Config.StageDepth)
    fake.Position = pos
    fake.Color = Config.CheckpointColor
    fake.Material = Enum.Material.Neon
    fake.TopSurface = Enum.SurfaceType.Smooth
    fake.BottomSurface = Enum.SurfaceType.Smooth
    fake.Parent = world
    -- Beacon (matches real one).
    local beacon = makePlatform("FakeBeacon_" .. level, pos + Vector3.new(0, 5, 0), Vector3.new(0.6, 8, 0.6), Config.CheckpointColor, Enum.Material.Neon, fake)
    beacon.CanCollide = false
    makeBillboard(fake, "✅ CHECKPOINT " .. level, Color3.fromRGB(120, 255, 120), 9, 8)
    -- Kill trigger on the surface.
    local killZone = Instance.new("Part")
    killZone.Name = "FakeKillZone_" .. level
    killZone.Anchored = true
    killZone.CanCollide = false
    killZone.CanTouch = true
    killZone.Transparency = 1
    killZone.Size = Vector3.new(Config.StageWidth, 1, Config.StageDepth)
    killZone.Position = pos + Vector3.new(0, Config.StageHeight, 0)
    killZone.Parent = fake
    killZone.Touched:Connect(function(hit)
        local hum = hit.Parent and hit.Parent:FindFirstChildOfClass("Humanoid")
        local player = Players:GetPlayerFromCharacter(hit.Parent)
        if hum and hum.Health > 0 and player then
            fireGotcha(player, "fake_checkpoint")
            hum.Health = 0
        end
    end)
end

local function buildTrap_disappear(level, intensity)
    local pos = stageCenter(level)
    -- Disappear traps always use the wide canonical platform — the surprise is the fade-out, not the shape.
    local platform = makePlatform("DisappearStage_" .. level, pos, Vector3.new(Config.StageWidth, Config.StageHeight, Config.StageDepth), Config.PlatformColor, Config.PlatformMaterial, world)
    stagePrimary[level] = platform
    buildFairRoute(level, "disappear")
    local fadeTime = (intensity == "hard") and 0.35 or (intensity == "soft" and 0.85 or 0.55)
    local respawnDelay = 2.2
    local triggered = false
    platform.Touched:Connect(function(hit)
        if triggered then return end
        local hum = hit.Parent and hit.Parent:FindFirstChildOfClass("Humanoid")
        if not hum then return end
        triggered = true
        local player = Players:GetPlayerFromCharacter(hit.Parent)
        if player then fireGotcha(player, "disappear") end
        local tweenInfo = TweenInfo.new(fadeTime, Enum.EasingStyle.Linear)
        local tween = TweenService:Create(platform, tweenInfo, { Transparency = 1 })
        activeTweens[platform] = tween
        tween:Play()
        tween.Completed:Connect(function()
            if not platform.Parent then return end
            platform.CanCollide = false
            task.wait(respawnDelay)
            if platform.Parent then
                platform.Transparency = 0
                platform.CanCollide = true
                triggered = false
            end
        end)
    end)
end

local function buildTrap_launcher(level, intensity)
    local platform = buildNormalStage(level)
    if not platform then return end
    buildFairRoute(level, "launcher")
    local strength = (intensity == "hard") and 220 or (intensity == "soft" and 90 or 150)
    local side = fairRouteSide(level)
    -- Hidden trigger zone right above the platform; sized to the actual platform shape.
    local trigger = Instance.new("Part")
    trigger.Name = "LauncherTrigger_" .. level
    trigger.Anchored = true
    trigger.CanCollide = false
    trigger.CanTouch = true
    trigger.Transparency = 1
    trigger.Size = Vector3.new(platform.Size.X * 0.55, 4, platform.Size.Z * 0.75)
    trigger.Position = platform.Position + Vector3.new(-side * platform.Size.X * 0.18, platform.Size.Y * 0.5 + 2.5, 0)
    trigger.Parent = world
    local cooldown = {}
    trigger.Touched:Connect(function(hit)
        local hum = hit.Parent and hit.Parent:FindFirstChildOfClass("Humanoid")
        local root = hit.Parent and hit.Parent:FindFirstChild("HumanoidRootPart")
        local player = Players:GetPlayerFromCharacter(hit.Parent)
        if not (hum and root and player) or hum.Health <= 0 then return end
        if cooldown[player.UserId] then return end
        cooldown[player.UserId] = true
        task.delay(2, function() cooldown[player.UserId] = nil end)
        fireGotcha(player, "launcher")
        local sideX = (math.random() - 0.5) * 2
        local sideZ = (math.random() - 0.5) * 2
        root.AssemblyLinearVelocity = Vector3.new(sideX * strength, strength, sideZ * strength)
    end)
end

local function buildTrap_decoy(level, intensity)
    -- One real platform + 2-3 decoy platforms. Real platform's X-offset is reachable
    -- from the previous stage's center so the player always has a path; decoys cluster
    -- around the same center but fall through.
    local pos = stageCenterFlat(level)
    local realOffsetX = (math.random() < 0.5 and -1 or 1) * (Config.StageWidth * 0.45) -- ±5.4 stud, reachable from any prev stage
    local realPos = pos + Vector3.new(realOffsetX, 0, 0)
    local real = makePlatform("DecoyReal_" .. level, realPos, Vector3.new(Config.StageWidth * 0.55, Config.StageHeight, Config.StageDepth * 0.7), Config.PlatformColor, Config.PlatformMaterial, world)
    stagePrimary[level] = real
    -- Decoys (look identical, but Transparency=0.05 + CanCollide=false → fall through).
    local decoyCount = (intensity == "hard") and 3 or 2
    for i = 1, decoyCount do
        local angle = math.pi * 2 * (i / decoyCount)
        local dx = math.cos(angle) * (Config.StageWidth * 0.40)
        local dz = math.sin(angle) * (Config.StageDepth * 0.30)
        if math.abs((pos.X + dx) - realPos.X) < 2 then dx = -dx end -- never overlap with real
        local decoy = makePlatform("Decoy_" .. level .. "_" .. i, pos + Vector3.new(dx, 0, dz), Vector3.new(Config.StageWidth * 0.55, Config.StageHeight, Config.StageDepth * 0.7), Config.PlatformColor, Config.PlatformMaterial, world)
        decoy.Transparency = 0.05
        decoy.CanCollide = false
        decoy.CanTouch = true
        decoy.Touched:Connect(function(hit)
            local player = Players:GetPlayerFromCharacter(hit.Parent)
            if player then fireGotcha(player, "decoy") end
        end)
    end
end

local function buildTrap_reverse(level, intensity)
    local platform = buildNormalStage(level)
    if not platform then return end
    buildFairRoute(level, "reverse")
    local strength = (intensity == "hard") and 80 or (intensity == "soft" and 35 or 55)
    local side = fairRouteSide(level)
    -- Invisible push-back zone that throws player toward previous checkpoint.
    local zone = Instance.new("Part")
    zone.Name = "ReverseZone_" .. level
    zone.Anchored = true
    zone.CanCollide = false
    zone.CanTouch = true
    zone.Transparency = 1
    zone.Size = Vector3.new(platform.Size.X * 0.58, 6, platform.Size.Z * 0.55)
    zone.Position = platform.Position + Vector3.new(-side * platform.Size.X * 0.18, platform.Size.Y * 0.5 + 3, platform.Size.Z * 0.2)
    zone.Parent = world
    local cooldown = {}
    zone.Touched:Connect(function(hit)
        local hum = hit.Parent and hit.Parent:FindFirstChildOfClass("Humanoid")
        local root = hit.Parent and hit.Parent:FindFirstChild("HumanoidRootPart")
        local player = Players:GetPlayerFromCharacter(hit.Parent)
        if not (hum and root and player) or hum.Health <= 0 then return end
        if cooldown[player.UserId] then return end
        cooldown[player.UserId] = true
        task.delay(1.5, function() cooldown[player.UserId] = nil end)
        fireGotcha(player, "reverse")
        root.AssemblyLinearVelocity = Vector3.new(0, 35, -strength)
    end)
end

local trapDispatch = {
    invisible_kill = buildTrap_invisibleKill,
    fake_checkpoint = buildTrap_fakeCheckpoint,
    disappear = buildTrap_disappear,
    launcher = buildTrap_launcher,
    decoy = buildTrap_decoy,
    reverse = buildTrap_reverse,
}

-- ── Build the world ──────────────────────────────────────────────────────
-- Spawn (level 0): real SpawnLocation. Sits adjacent to level 1 (Z = 0, level 1 at Z = StageGap)
-- so the first jump is trivial; player gets a confidence-builder before the trap stages.
local mainSpawn = Instance.new("SpawnLocation")
mainSpawn.Name = "TrollSpawn"
mainSpawn.Anchored = true
mainSpawn.Size = Vector3.new(16, 1, 16)
mainSpawn.Position = Vector3.new(0, Config.SpawnY, 0)
mainSpawn.Color = Config.CheckpointColor
mainSpawn.Material = Enum.Material.Neon
mainSpawn.Neutral = true
mainSpawn.TopSurface = Enum.SurfaceType.Smooth
mainSpawn.BottomSurface = Enum.SurfaceType.Smooth
mainSpawn.Parent = world
realCheckpoints[0] = mainSpawn
makeBillboard(mainSpawn, "🪤 " .. Config.GameTitle, Color3.fromRGB(255, 255, 255), 12, 14)
makeBillboard(mainSpawn, "Theme: " .. Config.ThemeKey .. "  •  Levels: " .. Config.TotalLevels, Color3.fromRGB(255, 220, 80), 7, 12)
addPlayPolishSparkles(mainSpawn, 7)

-- Stages 1..TotalLevels-1
for level = 1, Config.TotalLevels - 1 do
    if Config.IsRealCheckpoint(level) then
        buildRealCheckpoint(level)
    else
        local troll = Config.GetTroll(level)
        if troll and trapDispatch[troll.type] then
            trapDispatch[troll.type](level, troll.intensity or "medium")
        else
            buildNormalStage(level)
        end
    end
end

-- Win platform.
local winPlatform = Instance.new("Part")
winPlatform.Name = "WinPlatform"
winPlatform.Anchored = true
winPlatform.CanCollide = true
winPlatform.Size = Vector3.new(20, 1, 20)
winPlatform.Position = stageCenter(Config.TotalLevels)
winPlatform.Color = Config.WinColor
winPlatform.Material = Enum.Material.Neon
winPlatform.TopSurface = Enum.SurfaceType.Smooth
winPlatform.BottomSurface = Enum.SurfaceType.Smooth
winPlatform.Parent = world
makeBillboard(winPlatform, "🏆 YOU WIN", Color3.fromRGB(255, 215, 60), 12, 14)
winPlatform.Touched:Connect(function(hit)
    local player = Players:GetPlayerFromCharacter(hit.Parent)
    if player then
        markCheckpointReached(player, Config.TotalLevels)
        fireGotcha(player, "win")
    end
end)

-- ── Player lifecycle ─────────────────────────────────────────────────────
local function setupLeaderstats(player)
    local stats = Instance.new("Folder")
    stats.Name = "leaderstats"
    local stage = Instance.new("IntValue")
    stage.Name = "Stage"
    stage.Value = 0
    stage.Parent = stats
    local deaths = Instance.new("IntValue")
    deaths.Name = "Deaths"
    deaths.Value = 0
    deaths.Parent = stats
    stats.Parent = player
end

local function setupCharacter(player, character)
    local hum = character:WaitForChild("Humanoid", 5)
    if not hum then return end
    -- Anti-cheat lite: lock walkspeed/jumppower to defaults.
    hum.WalkSpeed = 16
    hum.JumpPower = 50
    hum.Died:Connect(function()
        incrementDeaths(player)
        -- Cancel any active disappear-tweens for parts the player triggered.
        for part, tween in pairs(activeTweens) do
            if tween then tween:Cancel() end
            if part and part.Parent then
                part.Transparency = 0
                part.CanCollide = true
            end
            activeTweens[part] = nil
        end
    end)
end

Players.PlayerAdded:Connect(function(player)
    setupLeaderstats(player)
    playerStage[player.UserId] = 0
    playerSpawn[player.UserId] = mainSpawn
    player.RespawnLocation = mainSpawn
    player.CharacterAdded:Connect(function(c) setupCharacter(player, c) end)
    if player.Character then setupCharacter(player, player.Character) end
end)

Players.PlayerRemoving:Connect(function(player)
    playerStage[player.UserId] = nil
    playerSpawn[player.UserId] = nil
end)

-- Anti-cheat heartbeat: catch teleports/exploit walkspeed.
local lastCheck = 0
RunService.Heartbeat:Connect(function()
    local now = tick()
    if now - lastCheck < 1 then return end
    lastCheck = now
    for _, player in ipairs(Players:GetPlayers()) do
        local char = player.Character
        local root = char and char:FindFirstChild("HumanoidRootPart")
        local hum = char and char:FindFirstChildOfClass("Humanoid")
        if root and hum and hum.Health > 0 then
            if hum.WalkSpeed > 24 then hum.WalkSpeed = 16 end
            if hum.JumpPower > 65 then hum.JumpPower = 50 end
            if root.Position.Y < Config.KillFloorY - 10 then
                hum.Health = 0
            end
        end
    end
end)

print("[TrollObby] world built — " .. Config.TotalLevels .. " stages, " .. #Config.Trolls .. " traps, savagery=" .. Config.Savagery)
`;

  const gotchaClient = `-- AUTO-GENERATED Troll Obby GOTCHA UI client (session #175)
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")
local RunService = game:GetService("RunService")

local localPlayer = Players.LocalPlayer
local playerGui = localPlayer:WaitForChild("PlayerGui")

local screen = Instance.new("ScreenGui")
screen.Name = "TrollGotchaScreen"
screen.ResetOnSpawn = false
screen.IgnoreGuiInset = true
screen.Parent = playerGui

local frame = Instance.new("Frame")
frame.Size = UDim2.fromScale(1, 1)
frame.BackgroundTransparency = 1
frame.Visible = false
frame.Parent = screen

local label = Instance.new("TextLabel")
label.Size = UDim2.fromScale(1, 0.4)
label.Position = UDim2.fromScale(0, 0.3)
label.BackgroundColor3 = Color3.fromRGB(0, 0, 0)
label.BackgroundTransparency = 0.25
label.TextColor3 = Color3.fromRGB(255, 60, 60)
label.Font = Enum.Font.GothamBlack
label.TextScaled = true
label.TextStrokeTransparency = 0
label.TextStrokeColor3 = Color3.fromRGB(0, 0, 0)
label.Text = ""
label.Parent = frame

local subtitle = Instance.new("TextLabel")
subtitle.Size = UDim2.fromScale(1, 0.08)
subtitle.Position = UDim2.fromScale(0, 0.7)
subtitle.BackgroundTransparency = 1
subtitle.TextColor3 = Color3.fromRGB(255, 220, 80)
subtitle.Font = Enum.Font.GothamBold
subtitle.TextScaled = true
subtitle.Text = ""
subtitle.Parent = frame

local trapTypeText = {
    invisible_kill = "невидимый трап",
    fake_checkpoint = "ФЕЙКОВЫЙ чекпоинт!",
    disappear = "пол исчез под ногами",
    launcher = "тебя выкинуло",
    decoy = "ложная платформа",
    reverse = "обратный поток",
    win = "🏆 ПРОШЁЛ ВСЁ",
    trap = "GOTCHA",
}

local gotcha = ReplicatedStorage:WaitForChild("TrollGotcha")
gotcha.OnClientEvent:Connect(function(trapType, signature)
    label.Text = tostring(signature or "💀 GOTCHA")
    subtitle.Text = trapTypeText[tostring(trapType)] or tostring(trapType)
    if tostring(trapType) == "win" then
        label.TextColor3 = Color3.fromRGB(120, 255, 140)
    else
        label.TextColor3 = Color3.fromRGB(255, 60, 60)
    end
    frame.Visible = true
    label.TextTransparency = 0
    subtitle.TextTransparency = 0
    -- Camera shake 0.4s
    local camera = Workspace.CurrentCamera
    if camera then
        local original = camera.CFrame
        local shakeStart = tick()
        local conn
        conn = RunService.RenderStepped:Connect(function()
            local elapsed = tick() - shakeStart
            if elapsed > 0.4 or not camera then
                if conn then conn:Disconnect() end
                return
            end
            local mag = (1 - elapsed / 0.4) * 0.6
            camera.CFrame = original * CFrame.new((math.random() - 0.5) * mag, (math.random() - 0.5) * mag, 0)
        end)
    end
    task.wait(2.0)
    -- Fade out.
    local fade = TweenService:Create(label, TweenInfo.new(0.6, Enum.EasingStyle.Linear), { TextTransparency = 1, TextStrokeTransparency = 1 })
    local fade2 = TweenService:Create(subtitle, TweenInfo.new(0.6, Enum.EasingStyle.Linear), { TextTransparency = 1 })
    fade:Play()
    fade2:Play()
    fade.Completed:Connect(function()
        frame.Visible = false
    end)
end)

print("[TrollObby] gotcha UI ready")
`;

  return {
    serverScript,
    additionalScripts: [
      { name: 'TrollObbyConfig', scriptType: 'ModuleScript', container: 'ReplicatedStorage', source: trollConfig },
      { name: 'TrollObbyHud',    scriptType: 'LocalScript',  container: 'StarterPlayerScripts', source: gotchaClient },
    ],
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Master Plan Phase 0+A (session 219): Trending Roblox Catalog Showcase
// Server-only Lua helper. Emits a Folder of N anchored Parts, each carrying
// a BillboardGui with rbxthumb:// ImageLabel + name/price/❤ labels and a
// ProximityPrompt → MarketplaceService:PromptPurchase handler. Works for
// any game genre — caller controls layout (linear/arc/wall) via opts.
// rbxthumb:// works for ANY public asset id, no permissions, no LoadAsset.
// ──────────────────────────────────────────────────────────────────────────

export interface TrendingShowcaseOpts {
  /** Display name shown above the row (e.g. "🔥 TRENDING IN ROBLOX"). */
  heading: string;
  /** Center anchor in studs for the showcase row (Vector3-style). */
  origin: { x: number; y: number; z: number };
  /** Linear: row of boards along +X. Arc: gentle curve. Wall: 2-row grid. */
  layout: 'linear' | 'arc' | 'wall';
  /** Spacing between boards in studs. Default 14. */
  spacing?: number;
  /** Each board's anchor part size in studs. Default 6×8×0.5. */
  boardSize?: { x: number; y: number; z: number };
  /** Theme color for stroke/labels [r,g,b] 0-255. Default Roblox-orange. */
  accentColor?: [number, number, number];
  /** Folder name in Workspace. Default "TrendingShowcase". */
  folderName?: string;
  /** Marker attribute for diagnostic grep — e.g. "TrendingShowcase_obby_v1". */
  marker: string;
  /** Phase H (session 219): catalog category passed through to the runtime
   * HTTP-pull URL so live data matches the embedded snapshot. Default 'Featured'. */
  category?: 'Featured' | 'Decals' | 'Animations' | 'Collectibles';
}

function escapeLuaStr(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '');
}

export function buildTrendingShowcaseLua(
  items: TrendingShowcaseItem[] | undefined,
  opts: TrendingShowcaseOpts,
): string {
  if (!items || items.length === 0) {
    return `-- TrendingShowcase skipped (no live items available; ${opts.marker})\n`;
  }
  const spacing = opts.spacing ?? 14;
  const boardSize = opts.boardSize ?? { x: 6, y: 8, z: 0.5 };
  const accent = opts.accentColor ?? [255, 130, 60];
  const folderName = opts.folderName ?? 'TrendingShowcase';

  const itemsLua = items.slice(0, 10).map((item, idx) => {
    const i = idx;
    let dx = 0, dy = 0, dz = 0;
    if (opts.layout === 'linear') {
      dx = (i - (items.length - 1) / 2) * spacing;
    } else if (opts.layout === 'arc') {
      const angle = ((i - (items.length - 1) / 2) / items.length) * Math.PI * 0.6;
      dx = Math.sin(angle) * spacing * 1.2 * items.length / 2;
      dz = -Math.abs(Math.cos(angle) - 1) * spacing * 0.6;
    } else {
      // wall: 2-row grid
      const perRow = Math.ceil(items.length / 2);
      const col = i % perRow;
      const row = Math.floor(i / perRow);
      dx = (col - (perRow - 1) / 2) * spacing;
      dy = (1 - row) * (boardSize.y + 2);
    }
    const isBundle = item.itemType === 'Bundle';
    // Phase B (session 219): correct rbxthumb type per itemType. Bundles need
    // type=BundleThumbnail to render the bundle's outfit preview, not Asset.
    const thumbType = isBundle ? 'BundleThumbnail' : 'Asset';
    // Phase B: registry key — Asset and Bundle IDs are namespaced separately
    // because PromptPurchaseFinished and PromptBundlePurchaseFinished are
    // distinct events and could collide if we used a single map.
    const registry = isBundle ? 'boardsByBundleId' : 'boardsByAssetId';
    return `
  do
    local board = Instance.new("Part")
    board.Name = "TrendingBoard_${i + 1}_${isBundle ? 'B' : 'A'}${item.id}"
    board.Size = Vector3.new(${boardSize.x}, ${boardSize.y}, ${boardSize.z})
    board.Anchored = true
    board.CanCollide = false
    board.CastShadow = false
    board.Material = Enum.Material.SmoothPlastic
    board.Color = Color3.fromRGB(28, 28, 36)
    board.CFrame = originCF * CFrame.new(${dx.toFixed(2)}, ${dy.toFixed(2)}, ${dz.toFixed(2)})
    board.Parent = folder

    local stroke = Instance.new("SelectionBox")
    stroke.Adornee = board
    stroke.Color3 = accentColor
    stroke.LineThickness = 0.06
    stroke.Transparency = 0.2
    stroke.Parent = board

    local gui = Instance.new("SurfaceGui")
    gui.Face = Enum.NormalId.Front
    gui.LightInfluence = 0
    gui.AlwaysOnTop = false
    gui.PixelsPerStud = 50
    gui.Parent = board

    local thumb = Instance.new("ImageLabel")
    thumb.Size = UDim2.fromScale(1, 0.72)
    thumb.Position = UDim2.fromScale(0, 0)
    thumb.BackgroundColor3 = Color3.fromRGB(20, 20, 26)
    thumb.BackgroundTransparency = 0.1
    thumb.Image = "rbxthumb://type=${thumbType}&id=${item.id}&w=420&h=420"
    thumb.ScaleType = Enum.ScaleType.Fit
    thumb.Parent = gui

    local nameLabel = Instance.new("TextLabel")
    nameLabel.Size = UDim2.fromScale(1, 0.16)
    nameLabel.Position = UDim2.fromScale(0, 0.72)
    nameLabel.BackgroundTransparency = 1
    nameLabel.Text = "${escapeLuaStr(item.name)}"
    nameLabel.TextColor3 = Color3.fromRGB(255, 255, 255)
    nameLabel.TextSize = 24
    nameLabel.Font = Enum.Font.GothamBold
    nameLabel.TextXAlignment = Enum.TextXAlignment.Center
    nameLabel.TextScaled = true
    nameLabel.Parent = gui

    local meta = Instance.new("TextLabel")
    meta.Size = UDim2.fromScale(1, 0.12)
    meta.Position = UDim2.fromScale(0, 0.88)
    meta.BackgroundTransparency = 1
    meta.Text = "${item.price === null || item.price === 0 ? 'FREE' : item.price + ' R$'}  ❤ ${item.favoriteCount > 1000 ? Math.round(item.favoriteCount / 100) / 10 + 'K' : String(item.favoriteCount)}"
    meta.TextColor3 = accentColor
    meta.TextSize = 18
    meta.Font = Enum.Font.GothamMedium
    meta.TextXAlignment = Enum.TextXAlignment.Center
    meta.Parent = gui

    -- Phase B: register board for post-purchase ✓ OWNED label flip.
    ${registry}[${item.id}] = { board = board, gui = gui, name = "${escapeLuaStr(item.name)}" }

    local prompt = Instance.new("ProximityPrompt")
    prompt.ObjectText = "${escapeLuaStr(item.name)}"
    prompt.ActionText = "${isBundle ? 'Get Bundle' : 'Open in Catalog'}"
    prompt.HoldDuration = 0.1
    prompt.MaxActivationDistance = 14
    prompt.RequiresLineOfSight = false
    prompt.Parent = board

    prompt.Triggered:Connect(function(player)
      print(string.format("[TrendingShowcase][%s] prompt triggered by %s for %s id=%d", "${opts.marker}", player.Name, "${isBundle ? 'Bundle' : 'Asset'}", ${item.id}))
      local ok, err = pcall(function()
        ${isBundle
          ? `MarketplaceService:PromptBundlePurchase(player, ${item.id})`
          : `MarketplaceService:PromptPurchase(player, ${item.id})`}
      end)
      if not ok then
        warn(string.format("[TrendingShowcase][%s] prompt failed for id=%d — %s (probably offsale or restricted)", "${opts.marker}", ${item.id}, tostring(err)))
      end
    end)
  end`;
  }).join('\n');

  return `
-- TrendingShowcase ${opts.marker} — ${items.length} live Roblox catalog items
do
  local MarketplaceService = game:GetService("MarketplaceService")
  local Workspace = game:GetService("Workspace")
  local existing = Workspace:FindFirstChild("${folderName}")
  if existing then existing:Destroy() end
  local folder = Instance.new("Folder")
  folder.Name = "${folderName}"
  folder:SetAttribute("ShowcaseMarker", "${opts.marker}")
  folder.Parent = Workspace

  local accentColor = Color3.fromRGB(${accent[0]}, ${accent[1]}, ${accent[2]})
  local originCF = CFrame.new(${opts.origin.x}, ${opts.origin.y}, ${opts.origin.z})

  -- Phase B (session 219): post-purchase ✓ OWNED label flip. Registry maps
  -- assetId/bundleId → { board, gui, name } for each rendered showcase board.
  local boardsByAssetId = {}
  local boardsByBundleId = {}

  -- Idempotent helper that overlays a green "✓ OWNED" badge on the gui.
  local function flipOwnedLabel(entry)
    if not entry or not entry.gui then return end
    if entry.gui:FindFirstChild("OwnedBadge") then return end
    local badge = Instance.new("TextLabel")
    badge.Name = "OwnedBadge"
    badge.Size = UDim2.fromScale(0.46, 0.13)
    badge.Position = UDim2.fromScale(0.27, 0.02)
    badge.BackgroundColor3 = Color3.fromRGB(40, 200, 100)
    badge.BackgroundTransparency = 0.05
    badge.Text = "✓ OWNED"
    badge.TextColor3 = Color3.fromRGB(255, 255, 255)
    badge.TextScaled = true
    badge.Font = Enum.Font.GothamBold
    badge.Parent = entry.gui
    local round = Instance.new("UICorner")
    round.CornerRadius = UDim.new(0, 8)
    round.Parent = badge
  end

  local heading = Instance.new("Part")
  heading.Name = "TrendingHeading"
  heading.Size = Vector3.new(${(boardSize.x * 2).toFixed(1)}, 1.5, 0.4)
  heading.Anchored = true
  heading.CanCollide = false
  heading.Material = Enum.Material.Neon
  heading.Color = accentColor
  heading.CFrame = originCF * CFrame.new(0, ${(boardSize.y / 2 + 2).toFixed(1)}, 0)
  heading.Parent = folder

  local headingGui = Instance.new("SurfaceGui")
  headingGui.Face = Enum.NormalId.Front
  headingGui.PixelsPerStud = 50
  headingGui.Parent = heading
  local headingLabel = Instance.new("TextLabel")
  headingLabel.Size = UDim2.fromScale(1, 1)
  headingLabel.BackgroundTransparency = 1
  headingLabel.Text = "${escapeLuaStr(opts.heading)}"
  headingLabel.TextColor3 = Color3.fromRGB(20, 20, 26)
  headingLabel.TextScaled = true
  headingLabel.Font = Enum.Font.GothamBlack
  headingLabel.Parent = headingGui

  ${itemsLua}

  -- Phase B (session 219): listen for purchase completion and flip label.
  -- Both events fire on the server when MarketplaceService:PromptXxxPurchase
  -- is invoked from the server thread (which is what our prompt does).
  MarketplaceService.PromptPurchaseFinished:Connect(function(player, assetId, wasPurchased)
    print(string.format("[TrendingShowcase][%s] PromptPurchaseFinished player=%s assetId=%d wasPurchased=%s", "${opts.marker}", player and player.Name or "nil", assetId, tostring(wasPurchased)))
    if wasPurchased then
      flipOwnedLabel(boardsByAssetId[assetId])
    end
  end)
  MarketplaceService.PromptBundlePurchaseFinished:Connect(function(player, bundleId, wasPurchased)
    print(string.format("[TrendingShowcase][%s] PromptBundlePurchaseFinished player=%s bundleId=%d wasPurchased=%s", "${opts.marker}", player and player.Name or "nil", bundleId, tostring(wasPurchased)))
    if wasPurchased then
      flipOwnedLabel(boardsByBundleId[bundleId])
    end
  end)

  print("[TrendingShowcase] ${opts.marker} mounted with ${items.length} items (purchase listeners active)")

  -- Phase H (session 219): once mounted with embedded snapshot, async-pull
  -- the latest live trends from the public endpoint and refresh the boards
  -- in place. If HttpService:GetAsync fails (e.g. "Allow HTTP Requests"
  -- toggle is OFF in Game Settings, or the endpoint is unreachable), the
  -- embedded snapshot remains — players still see live-trending content,
  -- just frozen to the day this game was generated.
  task.spawn(function()
    local HttpService = game:GetService("HttpService")
    local ok, body = pcall(function()
      return HttpService:GetAsync("https://api-z4yzt6dhjq-uc.a.run.app/api/roblox/trending-public?category=${escapeLuaStr(opts.category ?? 'Featured')}&limit=${items.length}")
    end)
    if not ok or not body then
      print(string.format("[TrendingShowcase][%s] live HTTP pull skipped (HttpEnabled? endpoint reachable?) — using embedded snapshot", "${opts.marker}"))
      return
    end
    local parsed
    local okParse, parseErr = pcall(function() parsed = HttpService:JSONDecode(body) end)
    if not okParse or type(parsed) ~= "table" or type(parsed.items) ~= "table" or #parsed.items == 0 then
      print(string.format("[TrendingShowcase][%s] live HTTP pull returned no items — keeping embedded", "${opts.marker}"))
      return
    end

    -- Refresh existing boards in-place. We have ${items.length} boards already
    -- mounted; replace their thumbnail/name/meta to point at fresh items.
    -- Folder structure: folder.TrendingBoard_<idx>_<A|B><id>
    local existingBoards = {}
    for _, child in ipairs(folder:GetChildren()) do
      if child:IsA("Part") and child.Name:match("^TrendingBoard_") then
        table.insert(existingBoards, child)
      end
    end
    table.sort(existingBoards, function(a, b)
      local ai = tonumber(a.Name:match("^TrendingBoard_(%d+)")) or 0
      local bi = tonumber(b.Name:match("^TrendingBoard_(%d+)")) or 0
      return ai < bi
    end)

    -- Reset registries — old IDs may differ from new ones.
    for k in pairs(boardsByAssetId) do boardsByAssetId[k] = nil end
    for k in pairs(boardsByBundleId) do boardsByBundleId[k] = nil end

    local refreshed = 0
    for i, board in ipairs(existingBoards) do
      local item = parsed.items[i]
      if item and type(item.id) == "number" then
        local isBundle = item.itemType == "Bundle"
        local thumbType = isBundle and "BundleThumbnail" or "Asset"
        local gui = board:FindFirstChildOfClass("SurfaceGui")
        if gui then
          local thumb = gui:FindFirstChildOfClass("ImageLabel")
          if thumb then thumb.Image = "rbxthumb://type=" .. thumbType .. "&id=" .. tostring(item.id) .. "&w=420&h=420" end
          local labels = {}
          for _, c in ipairs(gui:GetChildren()) do if c:IsA("TextLabel") and c.Name ~= "OwnedBadge" then table.insert(labels, c) end end
          if labels[1] then labels[1].Text = tostring(item.name or "") end
          if labels[2] then
            local price = item.price
            local priceStr = (price == nil or price == 0) and "FREE" or tostring(price) .. " R$"
            local fav = item.favoriteCount or 0
            local favStr = fav >= 1000 and (string.format("%.1fK", fav / 1000)) or tostring(fav)
            labels[2].Text = priceStr .. "  ❤ " .. favStr
          end
        end
        local prompt = board:FindFirstChildOfClass("ProximityPrompt")
        if prompt then
          prompt.ObjectText = tostring(item.name or "")
          prompt.ActionText = isBundle and "Get Bundle" or "Open in Catalog"
          -- Re-bind trigger handler with fresh asset/bundle id.
          for _, conn in ipairs(getmetatable(prompt) and {} or {}) do conn:Disconnect() end
          prompt.Triggered:Connect(function(player)
            print(string.format("[TrendingShowcase][%s] (live) prompt by %s for %s id=%d", "${opts.marker}", player.Name, isBundle and "Bundle" or "Asset", item.id))
            local okP, errP = pcall(function()
              if isBundle then
                MarketplaceService:PromptBundlePurchase(player, item.id)
              else
                MarketplaceService:PromptPurchase(player, item.id)
              end
            end)
            if not okP then
              warn(string.format("[TrendingShowcase][%s] live prompt failed id=%d — %s", "${opts.marker}", item.id, tostring(errP)))
            end
          end)
        end
        if isBundle then boardsByBundleId[item.id] = { board = board, gui = gui, name = tostring(item.name or "") }
        else boardsByAssetId[item.id] = { board = board, gui = gui, name = tostring(item.name or "") } end
        -- Remove old OwnedBadge if any — new item, ownership unknown.
        if gui then
          local oldBadge = gui:FindFirstChild("OwnedBadge")
          if oldBadge then oldBadge:Destroy() end
        end
        board.Name = "TrendingBoard_" .. i .. "_" .. (isBundle and "B" or "A") .. tostring(item.id)
        refreshed = refreshed + 1
      end
    end
    folder:SetAttribute("LastLiveRefresh", os.time())
    folder:SetAttribute("LiveSource", tostring(parsed.source or "unknown"))
    print(string.format("[TrendingShowcase][%s] live refresh complete — %d boards updated from %s (fetchedAt=%s)", "${opts.marker}", refreshed, tostring(parsed.source), tostring(parsed.fetchedAt)))
  end)
end
`;
}

/**
 * Wraps a builder's result (MultiScriptResult OR plain string) by prepending
 * the TrendingShowcase Lua to the server script. No-op if `params.trendingItems`
 * is empty. Per-genre `opts` controls layout/origin/heading/marker.
 */
function withTrendingShowcase<T extends MultiScriptResult | string>(
  result: T,
  params: GameTemplateParams,
  opts: TrendingShowcaseOpts,
): T {
  if (!params.trendingItems || params.trendingItems.length === 0) {
    return result;
  }
  const showcaseLua = buildTrendingShowcaseLua(params.trendingItems, opts);
  if (typeof result === 'string') {
    return (showcaseLua + '\n' + result) as T;
  }
  const multi = result as MultiScriptResult;
  return { ...multi, serverScript: showcaseLua + '\n' + multi.serverScript } as T;
}

/**
 * Per-genre TrendingShowcase opts — origin/layout/heading/marker tuned to
 * fit each genre's typical world layout. All in studs, relative to (0,0,0)
 * which is the SpawnLocation for runtime-owned genre builders.
 */
function trendingShowcaseOptsFor(genreKey: string): TrendingShowcaseOpts {
  // Per-genre category — must match Phase E selection in index.ts so the
  // embedded snapshot and the runtime HTTP-pull use the same Roblox category.
  switch (genreKey) {
    case 'obby':
    case 'obby_troll':
      return { heading: '🔥 TRENDING WALL', origin: { x: 0, y: 10, z: 30 }, layout: 'wall', marker: `TrendingShowcase_${genreKey}_v1`, category: 'Featured' };
    case 'tycoon':
      return { heading: "🛒 WHAT'S HOT NOW", origin: { x: -25, y: 8, z: 5 }, layout: 'linear', marker: 'TrendingShowcase_tycoon_v1', category: 'Featured' };
    case 'simulator':
    case 'pet_sim':
    case 'mining_sim':
    case 'fighting_sim':
    case 'muscle_sim':
    case 'clicker_sim':
      return { heading: '🌟 TOP IN ROBLOX', origin: { x: 0, y: 12, z: 40 }, layout: 'arc', marker: `TrendingShowcase_${genreKey}_v1`, category: 'Featured' };
    case 'rpg_adventure':
      return { heading: '📜 TRENDING SCROLLS', origin: { x: 0, y: 12, z: 35 }, layout: 'linear', marker: 'TrendingShowcase_rpg_v1', category: 'Featured' };
    case 'horror_escape':
      return { heading: '📰 NEWS BOARD', origin: { x: -30, y: 8, z: 0 }, layout: 'wall', marker: 'TrendingShowcase_horror_v1', accentColor: [200, 50, 60], category: 'Decals' };
    case 'pvp_arena':
      return { heading: '🏆 SPONSOR BANNERS', origin: { x: 0, y: 28, z: -45 }, layout: 'arc', marker: 'TrendingShowcase_pvp_v1', category: 'Animations' };
    case 'tower_defense':
      return { heading: '🏰 TOP DEFENSE GAMES', origin: { x: 118, y: 22, z: 12 }, layout: 'arc', marker: 'TrendingShowcase_td_v1', category: 'Featured' };
    case 'roleplay_town':
      return { heading: '🏙️ TOP ROLEPLAY GAMES', origin: { x: 0, y: 16, z: 48 }, layout: 'arc', marker: 'TrendingShowcase_rp_v1', category: 'Featured' };
    case 'racing':
      return { heading: '🏁 TOP RACING GAMES', origin: { x: 155, y: 16, z: -34 }, layout: 'wall', marker: 'TrendingShowcase_race_v1', category: 'Featured' };
    case 'parkour':
      return { heading: '🧗 TOP PARKOUR GAMES', origin: { x: 38, y: 14, z: -22 }, layout: 'wall', marker: 'TrendingShowcase_pk_v1', category: 'Featured' };
    case 'story_game':
      return { heading: '📖 TOP STORY GAMES', origin: { x: -30, y: 10, z: -8 }, layout: 'wall', marker: 'TrendingShowcase_story_v1', category: 'Featured' };
    case 'survival':
      return { heading: '🏕️ TOP SURVIVAL GAMES', origin: { x: 0, y: 14, z: 40 }, layout: 'arc', marker: 'TrendingShowcase_surv_v1', category: 'Featured' };
    case 'minigame_hub':
      return { heading: '🎉 TOP PARTY GAMES', origin: { x: 0, y: 14, z: 42 }, layout: 'arc', marker: 'TrendingShowcase_hub_v1', category: 'Featured' };
    case 'fighting_arena':
      return { heading: '🥊 TOP FIGHTING GAMES', origin: { x: 0, y: 34, z: -44 }, layout: 'arc', marker: 'TrendingShowcase_fight_v1', category: 'Animations' };
    case 'custom_game':
      return { heading: '✨ TRENDING IN ROBLOX', origin: { x: 0, y: 14, z: 44 }, layout: 'arc', marker: 'TrendingShowcase_custom_v1', category: 'Featured' };
    case 'brainrot_sim':
      return { heading: '💯 LIVE TRENDS', origin: { x: 0, y: 14, z: -55 }, layout: 'wall', marker: 'TrendingShowcase_brainrot_v1', accentColor: [255, 220, 80], category: 'Decals' };
    default:
      return { heading: '✨ TRENDING IN ROBLOX', origin: { x: 0, y: 10, z: 30 }, layout: 'linear', marker: 'TrendingShowcase_generic_v1', category: 'Featured' };
  }
}

export function buildGameplayScript(params: GameTemplateParams): string | MultiScriptResult {
  // Session #179: every generated game ships with CinematicCameraController so
  // any player can toggle 9:16 letterbox + REC HUD for One-Tap TikTok capture.
  // withCinematicCamera() is idempotent and safe to wrap any return path.
  // Session #149: brainrot_sim Steal-a-Brainrot conveyor takes precedence over genre-based dispatch.
  if (params.gameKind === 'brainrot_sim' || (params.systems && params.systems.includes('conveyor') && params.brainrotPool)) {
    return withCinematicCamera(withTrendingShowcase(buildBrainrotConveyorScript(params), params, trendingShowcaseOptsFor('brainrot_sim')));
  }
  // Session #175: obby_troll Trap Maker — fully owns layout via runtime Lua.
  // Session 223 (revised): TrendingShowcase отключён для obby_troll — path-based
  // жанры с per-stage decorations конкурируют с trending wall, юзер путается
  // что gameplay vs декор. Tycoon/sim/RPG/PvP/generic — wall остаётся.
  if (params.gameKind === 'obby_troll') {
    return withCinematicCamera(buildTrollObbyScript(params));
  }
  // Session #185: new playable genres are runtime-owned templates like
  // brainrot_sim/obby_troll, not generic scene overlays.
  if (params.gameKind === 'rpg_adventure') {
    return withCinematicCamera(withTrendingShowcase(buildRpgAdventureScript(params), params, trendingShowcaseOptsFor('rpg_adventure')));
  }
  // Session 223 (revised): horror_escape — same reason as obby_troll.
  if (params.gameKind === 'horror_escape') {
    return withCinematicCamera(buildHorrorEscapeScript(params));
  }
  if (params.gameKind === 'pvp_arena') {
    return withCinematicCamera(withTrendingShowcase(buildPvpArenaScript(params), params, trendingShowcaseOptsFor('pvp_arena')));
  }
  // Session 399: tower_defense — runtime-owned wave/tower world (like rpg/pvp).
  if (params.gameKind === 'tower_defense') {
    return withCinematicCamera(buildTowerDefenseScript(params));
  }
  // Session 399 (cont.): roleplay_town — persistent social town world.
  if (params.gameKind === 'roleplay_town') {
    return withCinematicCamera(buildRoleplayTownScript(params));
  }
  // Session 399 (cont.): racing — closed-loop foot race with laps + round loop.
  if (params.gameKind === 'racing') {
    return withCinematicCamera(buildRacingScript(params));
  }
  // Session 399 (cont.): parkour — ascending spiral course with checkpoints.
  if (params.gameKind === 'parkour') {
    return withCinematicCamera(buildParkourScript(params));
  }
  // Session 399 (cont.): story_game — linear narrative chapter walk.
  if (params.gameKind === 'story_game') {
    return withCinematicCamera(buildStoryGameScript(params));
  }
  // Session 399 (cont.): survival — resource gathering + day/night enemy nights.
  if (params.gameKind === 'survival') {
    return withCinematicCamera(buildSurvivalScript(params));
  }
  // Session 399 (cont.): minigame_hub — lobby + rotating tile-arena minigames.
  if (params.gameKind === 'minigame_hub') {
    return withCinematicCamera(buildMinigameHubScript(params));
  }
  // Session 399 (cont.): fighting_arena — melee ring brawl with rounds.
  if (params.gameKind === 'fighting_arena') {
    return withCinematicCamera(buildFightingScript(params));
  }
  // Session 399 (cont.): custom_game — flexible playable sandbox scaffold.
  if (params.gameKind === 'custom_game') {
    return withCinematicCamera(buildCustomGameScript(params));
  }
  const simulatorKind = String(params.simulatorKind || '').toLowerCase();
  if (
    params.gameKind === 'mining_sim' ||
    params.gameKind === 'fighting_sim' ||
    params.gameKind === 'muscle_sim' ||
    params.gameKind === 'clicker_sim' ||
    (params.gameKind === 'simulator' && ['mining', 'fighting', 'muscle', 'clicker'].includes(simulatorKind))
  ) {
    return withCinematicCamera(withTrendingShowcase(buildTrainingSimulatorScript(params), params, trendingShowcaseOptsFor(params.gameKind || 'simulator')));
  }
  const genre = (params.genre || '').toLowerCase();
  if (genre.includes('obby') || genre.includes('parkour') || genre.includes('obstacle')) {
    const briefText = `${params.summary || ''} ${params.title || ''} ${(params.systems || []).join(' ')}`;
    const obbyKey = params.obbyThemeKey || detectObbyThemeKey(briefText);
    const hasObbyShop = params.hasObbyShop === true;
    // When theme bucket is 'meme', resolve the specific sub-theme so the obby
    // script can pick the right NPC/collectible/sticker/text pack. Harmless
    // for non-meme themes — field is optional and ignored downstream.
    const memeSubTheme = obbyKey === 'meme'
      ? (params.memeSubTheme || detectMemeSubTheme(briefText))
      : params.memeSubTheme;
    // Session 223 (revised): TrendingShowcase отключён для obby — фиксированные
    // showcase-coordinates попадали в середину пути obby, billboards конкурировали
    // с per-stage decorations (NPC'ами/decals/табличками), юзер не понимал
    // что gameplay vs декор. Tycoon/sim/RPG/PvP/generic — wall остаётся, у них
    // статичный мир и trending billboard органично вписывается.
    return withCinematicCamera(buildObbyScript({ ...params, obbyThemeKey: obbyKey, memeSubTheme, hasObbyShop }));
  }
  if (genre.includes('tycoon') || genre.includes('factory') || genre.includes('business')) {
    const themeKey = params.tycoonThemeKey || detectTycoonThemeKey(`${params.summary || ''} ${params.title || ''}`);
    return withCinematicCamera(withTrendingShowcase(buildTycoonScript({ ...params, tycoonThemeKey: themeKey }), params, trendingShowcaseOptsFor('tycoon')));
  }
  if (genre.includes('simulator') || genre.includes('collect') || genre.includes('clicker')) {
    return withCinematicCamera(withTrendingShowcase(buildSimulatorScript(params), params, trendingShowcaseOptsFor('simulator')));
  }
  return withCinematicCamera(withTrendingShowcase(buildDefaultScript(params), params, trendingShowcaseOptsFor('default')));
}

// ── Deterministic Scene Templates for Tycoon & Simulator ──
// LLM scene generation is unreliable for these genres (generates obby layouts).
// These templates guarantee correct functional parts with proper layout.

interface ScenePart {
  name: string;
  size: [number, number, number];
  position: [number, number, number];
  rotation?: [number, number, number];
  color: [number, number, number];
  material: string;
  anchored: boolean;
  canCollide: boolean;
  transparency?: number;
  shape?: string;
  className?: string;
  particles?: { rate: number; lifetime: number; speed: number; color: [number, number, number]; size: number; spread: number };
  billboard?: { text: string; color?: [number, number, number]; size?: number; offset?: [number, number, number] };
  prompt?: { actionText: string; objectText?: string; holdDuration?: number; maxDistance?: number };
}

interface SceneTemplate {
  parts: ScenePart[];
  spawns: { name: string; position: [number, number, number] }[];
  npcs?: { name: string; position: [number, number, number]; role?: string; dialog?: string }[];
  terrain?: { biome: string; seed: number; amplitude: number; baseHeight: number; features: string[]; range: number };
  lighting: {
    clockTime: number; ambient: [number, number, number]; brightness: number; fogEnd: number;
    fogColor: [number, number, number]; outdoorAmbient: [number, number, number];
    atmosphere: { density: number; offset: number; color: [number, number, number]; decay: [number, number, number]; haze: number };
    postEffects: { bloomIntensity: number; bloomSize: number; bloomThreshold: number; ccBrightness: number; ccContrast: number; ccSaturation: number; ccTintColor: [number, number, number] };
  };
}

function p(name: string, size: [number, number, number], pos: [number, number, number], color: [number, number, number], material: string, extra?: Partial<ScenePart>): ScenePart {
  return { name, size, position: pos, color, material, anchored: true, canCollide: true, ...extra };
}

/** WedgePart — triangle shape for roofs */
function w(name: string, size: [number, number, number], pos: [number, number, number], color: [number, number, number], material: string, rot?: [number, number, number], extra?: Partial<ScenePart>): ScenePart {
  return { name, size, position: pos, color, material, anchored: true, canCollide: true, className: 'WedgePart', rotation: rot, ...extra };
}

/** Compound structure builder — creates themed multi-part "buildings" */
function compound(prefix: string, baseParts: Omit<ScenePart, 'anchored' | 'canCollide'>[]): ScenePart[] {
  return baseParts.map((bp, i) => ({ anchored: true, canCollide: true, ...bp, name: prefix + '_' + i }));
}

// ── Tycoon Theme System ──

interface TycoonTheme {
  name: string;
  base: [number, number, number]; baseMat: string;
  walls: [number, number, number]; wallsMat: string;
  fences: [number, number, number]; fencesMat: string;
  machines: [number, number, number]; machinesMat: string;
  paths: [number, number, number];
  factory: [number, number, number]; factoryMat: string;
  lights: [number, number, number];
  sign: [number, number, number];
  dropParticle: [number, number, number];
  biome: string;
  clockTime: number; ambient: [number, number, number]; brightness: number;
  fogEnd: number; fogColor: [number, number, number]; outdoorAmbient: [number, number, number];
  atmoD: number; atmoOff: number; atmoColor: [number, number, number]; atmoDecay: [number, number, number]; atmoHaze: number;
  bloomI: number; bloomS: number; bloomT: number;
  ccB: number; ccC: number; ccS: number; ccTint: [number, number, number];
  purchaseLabels: string[];
  dropperTiers: string[];
  factorySign: string;
  decorParts: { name: string; size: [number, number, number]; pos: [number, number, number]; color: [number, number, number]; mat: string; extra?: Partial<ScenePart> }[];
  layout: 'symmetric' | 'left-heavy' | 'corridor' | 'scattered';
  npcNames: [string, string, string, string];
  toolName: string;
}

const TYCOON_THEMES: Record<string, TycoonTheme> = {
  default: { name:'Default', base:[0.45,0.45,0.5], baseMat:'Concrete', walls:[0.4,0.4,0.43], wallsMat:'Metal', fences:[0.5,0.35,0.2], fencesMat:'Wood', machines:[0.5,0.5,0.55], machinesMat:'Metal', paths:[0.6,0.55,0.45], factory:[0.35,0.35,0.38], factoryMat:'Metal', lights:[1,0.95,0.7], sign:[0.9,0.3,0.3], dropParticle:[1,0.5,0.1], biome:'grass', clockTime:14, ambient:[0.35,0.35,0.4], brightness:2.5, fogEnd:800, fogColor:[0.7,0.75,0.85], outdoorAmbient:[0.45,0.45,0.5], atmoD:0.25, atmoOff:0.2, atmoColor:[0.85,0.9,1], atmoDecay:[0.9,0.85,0.7], atmoHaze:0.8, bloomI:0.35, bloomS:20, bloomT:0.85, ccB:0.03, ccC:0.08, ccS:0.1, ccTint:[1,0.97,0.9], purchaseLabels:['Speed Boost','Belt Extension','Value Boost','Crate Storage','Workshop Walls','Workshop Roof','Tier Station','Capacity Boost','Dropper 2','Upgrader x1.5','Factory Walls','Factory Roof','Lighting','Machine Room','Conveyor 3','Neon Sign','Dropper 3','Upgrader x2','Area 1','Trophy Display','Warehouse','Auto Collector','Garden','Rebirth Altar','Upgrader x3','Area 2','Dropper 4','Golden Monument','Area 3','Victory Crown'], dropperTiers:['Basic','Silver','Gold','Diamond','Mythic','Legendary','Cosmic'], factorySign:'FACTORY', decorParts:[], layout:'symmetric', npcNames:['Manager','Worker','Cashier','Inspector'], toolName:'Hammer' },
  food: { name:'Food', base:[0.6,0.45,0.35], baseMat:'Brick', walls:[0.65,0.4,0.3], wallsMat:'Brick', fences:[0.55,0.35,0.2], fencesMat:'Wood', machines:[0.7,0.5,0.35], machinesMat:'Metal', paths:[0.7,0.6,0.45], factory:[0.6,0.35,0.25], factoryMat:'Brick', lights:[1,0.9,0.6], sign:[0.9,0.2,0.15], dropParticle:[1,0.6,0.2], biome:'grass', clockTime:12, ambient:[0.4,0.35,0.3], brightness:2.8, fogEnd:900, fogColor:[0.8,0.75,0.7], outdoorAmbient:[0.5,0.45,0.4], atmoD:0.2, atmoOff:0.15, atmoColor:[0.9,0.85,0.8], atmoDecay:[0.9,0.85,0.75], atmoHaze:0.6, bloomI:0.3, bloomS:18, bloomT:0.9, ccB:0.05, ccC:0.1, ccS:0.15, ccTint:[1,0.95,0.85], purchaseLabels:['Turbo Oven','Serving Belt','Spice Rack','Ingredient Box','Kitchen Walls','Kitchen Roof','Recipe Book','Fridge Upgrade','Pizza Oven 2','Flavor Mixer','Bakery Walls','Bakery Roof','Heat Lamps','Dough Station','Hot Belt','Menu Board','Grill Station','Sauce Blender','Dining Hall','Trophy Plate','Cold Storage','Express Counter','Herb Garden','VIP Kitchen','Gold Fryer','Banquet Hall','Master Oven','Golden Fork','Food Court','Chef Crown'], dropperTiers:['Raw','Seasoned','Cooked','Gourmet','Master Chef','5-Star','Michelin'], factorySign:'KITCHEN', decorParts:[{name:'Deco_Oven',size:[8,10,8],pos:[45,5,5],color:[0.6,0.35,0.2],mat:'Brick',extra:{particles:{rate:5,lifetime:2,speed:1,color:[0.8,0.8,0.8],size:0.4,spread:20}}},{name:'Deco_Counter',size:[14,3,6],pos:[-45,1.5,5],color:[0.7,0.5,0.35],mat:'Wood'},{name:'Deco_Table',size:[8,2,8],pos:[45,1,25],color:[0.55,0.35,0.2],mat:'Wood'},{name:'Deco_Pot',size:[4,5,4],pos:[-45,2.5,25],color:[0.5,0.5,0.55],mat:'Metal',extra:{shape:'Cylinder',particles:{rate:8,lifetime:2,speed:1.5,color:[1,0.95,0.9],size:0.3,spread:30}}}], layout:'left-heavy', npcNames:['Chef Mario','Baker Lisa','Waiter Tom','Food Critic'], toolName:'Spatula' },
  meme: { name:'Meme', base:[0.12,0.1,0.18], baseMat:'SmoothPlastic', walls:[0.15,0.12,0.2], wallsMat:'SmoothPlastic', fences:[0,0.9,0.9], fencesMat:'Neon', machines:[0.8,0.1,0.8], machinesMat:'Neon', paths:[0.1,0.1,0.15], factory:[0.1,0.1,0.15], factoryMat:'SmoothPlastic', lights:[0,1,1], sign:[1,0,0.8], dropParticle:[0,1,1], biome:'arctic', clockTime:0, ambient:[0.08,0.05,0.15], brightness:1.5, fogEnd:500, fogColor:[0.05,0.02,0.1], outdoorAmbient:[0.1,0.08,0.18], atmoD:0.4, atmoOff:0.3, atmoColor:[0.2,0.1,0.3], atmoDecay:[0.8,0.6,0.9], atmoHaze:1.5, bloomI:0.8, bloomS:30, bloomT:0.5, ccB:0.05, ccC:0.15, ccS:0.3, ccTint:[0.9,0.8,1], purchaseLabels:['Brain Boost','Meme Stream','Rizz Amplifier','Cringe Crate','Ohio Walls','Ohio Roof','Sigma Station','Cap Upgrade','Skibidi Dropper','Brainrot Mixer','TikTok Walls','TikTok Roof','Neon Glow','Vine Machine','Dank Belt','Meme Board','Amogus Dropper','Sus Blender','Sigma Hall','W Trophy','Copium Vault','Speed Runner','Touch Grass','Giga Altar','Gold Ratio','Drip Zone','GOAT Dropper','Diamond Rizz','Final Boss','Victory Royale'], dropperTiers:['NPC','Sigma','Skibidi','Ohio','Rizz','Goated','GOAT'], factorySign:'MEME HQ', decorParts:[{name:'Deco_Screen',size:[12,8,4],pos:[45,5,5],color:[0,1,1],mat:'Neon'},{name:'Deco_Speaker',size:[6,8,6],pos:[-45,4,5],color:[0.8,0.1,0.8],mat:'Neon',extra:{shape:'Cylinder'}},{name:'Deco_Cube',size:[6,6,6],pos:[45,4,25],color:[1,0,0.8],mat:'Neon',extra:{shape:'Ball',particles:{rate:15,lifetime:2,speed:2,color:[0,1,1],size:0.5,spread:50}}},{name:'Deco_Arrow',size:[4,12,4],pos:[-45,6,25],color:[1,1,0],mat:'Neon'}], layout:'scattered', npcNames:['Sigma Boss','Content Creator','Merch Seller','Meme Lord'], toolName:'Selfie Stick' },
  military: { name:'Military', base:[0.35,0.38,0.3], baseMat:'Concrete', walls:[0.3,0.33,0.28], wallsMat:'Concrete', fences:[0.2,0.22,0.18], fencesMat:'Metal', machines:[0.32,0.35,0.28], machinesMat:'Metal', paths:[0.4,0.38,0.32], factory:[0.28,0.3,0.25], factoryMat:'Concrete', lights:[0.9,0.85,0.7], sign:[0.5,0.2,0.15], dropParticle:[0.3,0.5,0.2], biome:'grass', clockTime:10, ambient:[0.3,0.32,0.28], brightness:2.2, fogEnd:600, fogColor:[0.5,0.52,0.48], outdoorAmbient:[0.35,0.38,0.33], atmoD:0.35, atmoOff:0.25, atmoColor:[0.6,0.62,0.58], atmoDecay:[0.8,0.8,0.75], atmoHaze:1.2, bloomI:0.2, bloomS:15, bloomT:0.9, ccB:0, ccC:0.05, ccS:-0.1, ccTint:[0.95,0.98,0.9], purchaseLabels:['Rapid Deploy','Supply Line','Intel Upgrade','Ammo Crate','Bunker Walls','Bunker Roof','Command Post','Armor Boost','Artillery 2','Targeting System','Barracks Walls','Barracks Roof','Searchlights','Weapons Lab','Supply Belt','Comm Tower','Mortar 3','Strike System','East Base','Medal Display','Arms Depot','Auto Turret','Camo Garden','War Room','Gold Cannon','West Base','Heavy Artillery','Victory Banner','South Base','General Star'], dropperTiers:['Recruit','Private','Sergeant','Captain','Colonel','General','Commander'], factorySign:'BASE OPS', decorParts:[{name:'Deco_Tower',size:[6,16,6],pos:[45,8,5],color:[0.3,0.33,0.28],mat:'Concrete'},{name:'Deco_Sandbag',size:[14,3,4],pos:[-45,1.5,5],color:[0.4,0.38,0.3],mat:'Slate'},{name:'Deco_Radar',size:[6,4,6],pos:[45,3,25],color:[0.32,0.35,0.28],mat:'Metal',extra:{shape:'Cylinder'}},{name:'Deco_Flag',size:[1,14,4],pos:[-45,7,25],color:[0.5,0.2,0.15],mat:'SmoothPlastic'}], layout:'corridor', npcNames:['Sergeant','Mechanic','Quartermaster','Scout'], toolName:'Rifle' },
  candy: { name:'Candy', base:[0.95,0.7,0.8], baseMat:'SmoothPlastic', walls:[0.9,0.65,0.75], wallsMat:'SmoothPlastic', fences:[0.6,0.85,0.95], fencesMat:'SmoothPlastic', machines:[0.95,0.5,0.7], machinesMat:'SmoothPlastic', paths:[1,0.85,0.9], factory:[0.85,0.6,0.7], factoryMat:'SmoothPlastic', lights:[1,0.8,0.9], sign:[1,0.4,0.6], dropParticle:[1,0.6,0.8], biome:'grass', clockTime:13, ambient:[0.45,0.4,0.45], brightness:3, fogEnd:1000, fogColor:[0.9,0.85,0.9], outdoorAmbient:[0.5,0.48,0.52], atmoD:0.2, atmoOff:0.15, atmoColor:[0.95,0.9,0.95], atmoDecay:[0.95,0.9,0.95], atmoHaze:0.5, bloomI:0.4, bloomS:22, bloomT:0.8, ccB:0.05, ccC:0.05, ccS:0.2, ccTint:[1,0.95,0.98], purchaseLabels:['Sugar Rush','Candy Conveyor','Flavor Boost','Sweet Storage','Chocolate Walls','Chocolate Roof','Recipe Stand','Freezer','Candy Press 2','Caramel Mixer','Fondant Walls','Fondant Roof','Glow Lights','Taffy Puller','Frosting Belt','Candy Sign','Lollipop Machine','Syrup Blender','Candy Kingdom','Crystal Trophy','Sugar Vault','Quick Wrapper','Gummy Garden','Rainbow Altar','Gold Glazer','Marshmallow Land','Mega Dispenser','Golden Wrapper','Chocolate River','Diamond Crown'], dropperTiers:['Plain','Sugared','Frosted','Glazed','Caramel','Rainbow','Crystal'], factorySign:'SWEET SHOP', decorParts:[{name:'Deco_Lollipop',size:[4,14,4],pos:[45,7,5],color:[1,0.4,0.6],mat:'SmoothPlastic',extra:{shape:'Cylinder'}},{name:'Deco_LolliTop',size:[6,6,6],pos:[45,15,5],color:[1,0.3,0.5],mat:'SmoothPlastic',extra:{shape:'Ball'}},{name:'Deco_Fountain',size:[8,6,8],pos:[-45,3,5],color:[0.4,0.2,0.1],mat:'SmoothPlastic',extra:{shape:'Cylinder',particles:{rate:10,lifetime:2,speed:2,color:[0.5,0.3,0.15],size:0.4,spread:40}}},{name:'Deco_Cupcake',size:[6,4,6],pos:[45,2,25],color:[0.95,0.7,0.8],mat:'SmoothPlastic',extra:{shape:'Cylinder'}}], layout:'scattered', npcNames:['Sugar Fairy','Chocolatier','Candy Seller','Sweet Tester'], toolName:'Candy Wand' },
  space: { name:'Space', base:[0.12,0.1,0.2], baseMat:'Metal', walls:[0.15,0.12,0.25], wallsMat:'Metal', fences:[0.2,0.15,0.35], fencesMat:'Metal', machines:[0.25,0.2,0.4], machinesMat:'DiamondPlate', paths:[0.15,0.12,0.22], factory:[0.1,0.1,0.2], factoryMat:'Metal', lights:[0.5,0.4,1], sign:[0.3,0.2,0.9], dropParticle:[0.4,0.3,1], biome:'arctic', clockTime:0, ambient:[0.08,0.06,0.15], brightness:1.8, fogEnd:400, fogColor:[0.05,0.03,0.1], outdoorAmbient:[0.1,0.08,0.2], atmoD:0.45, atmoOff:0.35, atmoColor:[0.15,0.1,0.25], atmoDecay:[0.7,0.6,0.9], atmoHaze:1.8, bloomI:0.6, bloomS:25, bloomT:0.6, ccB:0.02, ccC:0.1, ccS:0.2, ccTint:[0.85,0.8,1], purchaseLabels:['Ion Thrusters','Astro Belt','Quantum Core','Cargo Pod','Station Walls','Station Roof','Nav Computer','Shield Boost','Laser Drill 2','Plasma Mixer','Lab Walls','Lab Roof','Star Lights','Reactor Unit','Hyper Belt','Holo Sign','Ion Cannon','Warp Drive','Sector Alpha','Star Trophy','Cargo Bay','Auto Probe','Bio Dome','Rebirth Core','Dark Matter','Sector Beta','Mega Drill','Gold Beacon','Sector Gamma','Star Crown'], dropperTiers:['Scrap','Alloy','Plasma','Quantum','Dark Matter','Nebula','Cosmic'], factorySign:'COMMAND CENTER', decorParts:[{name:'Deco_Antenna',size:[2,18,2],pos:[45,9,5],color:[0.25,0.2,0.4],mat:'Metal'},{name:'Deco_Dish',size:[10,2,10],pos:[45,19,5],color:[0.3,0.25,0.45],mat:'Metal',extra:{shape:'Cylinder'}},{name:'Deco_Reactor',size:[8,8,8],pos:[-45,5,5],color:[0.5,0.4,1],mat:'Neon',extra:{shape:'Ball',particles:{rate:12,lifetime:3,speed:1,color:[0.4,0.3,1],size:0.5,spread:50}}},{name:'Deco_Console',size:[10,4,4],pos:[-45,2,25],color:[0.15,0.12,0.25],mat:'Metal'}], layout:'corridor', npcNames:['Commander','Engineer','Trader','Scientist'], toolName:'Laser Gun' },
  nature: { name:'Nature', base:[0.35,0.5,0.25], baseMat:'Grass', walls:[0.45,0.35,0.2], wallsMat:'Wood', fences:[0.4,0.3,0.18], fencesMat:'Wood', machines:[0.4,0.5,0.3], machinesMat:'Wood', paths:[0.55,0.45,0.3], factory:[0.35,0.28,0.15], factoryMat:'Wood', lights:[0.9,1,0.7], sign:[0.2,0.7,0.2], dropParticle:[0.5,0.9,0.3], biome:'grass', clockTime:11, ambient:[0.35,0.4,0.3], brightness:2.8, fogEnd:1000, fogColor:[0.75,0.8,0.7], outdoorAmbient:[0.45,0.5,0.4], atmoD:0.2, atmoOff:0.15, atmoColor:[0.8,0.9,0.75], atmoDecay:[0.85,0.9,0.8], atmoHaze:0.6, bloomI:0.3, bloomS:18, bloomT:0.85, ccB:0.02, ccC:0.05, ccS:0.15, ccTint:[0.95,1,0.92], purchaseLabels:['Wind Boost','River Path','Fertilizer','Seed Storage','Greenhouse Walls','Greenhouse Roof','Almanac','Compost Bin','Watermill 2','Bee Hive','Barn Walls','Barn Roof','Lanterns','Harvest Table','Stream Belt','Farm Sign','Windmill 3','Rain Caller','East Field','Golden Scarecrow','Root Cellar','Auto Harvester','Flower Patch','Nature Altar','Gold Sprinkler','West Field','Mega Windmill','Golden Tree','South Field','Earth Crown'], dropperTiers:['Seed','Sprout','Bloom','Harvest','Ancient','Enchanted','Eternal'], factorySign:'FARMSTEAD', decorParts:[{name:'Deco_Tree',size:[4,14,4],pos:[45,7,5],color:[0.3,0.5,0.2],mat:'Wood'},{name:'Deco_TreeTop',size:[10,8,10],pos:[45,15,5],color:[0.2,0.6,0.15],mat:'Grass',extra:{shape:'Ball'}},{name:'Deco_Pond',size:[12,1,12],pos:[-45,0.5,5],color:[0.3,0.5,0.7],mat:'SmoothPlastic',extra:{particles:{rate:5,lifetime:3,speed:0.5,color:[0.5,0.7,1],size:0.3,spread:30}}},{name:'Deco_Hay',size:[6,4,6],pos:[45,2,25],color:[0.7,0.6,0.3],mat:'Grass'}], layout:'left-heavy', npcNames:['Farmer','Beekeeper','Herbalist','Druid'], toolName:'Watering Can' },
  medieval: { name:'Medieval', base:[0.4,0.38,0.35], baseMat:'Cobblestone', walls:[0.45,0.4,0.35], wallsMat:'Brick', fences:[0.35,0.3,0.22], fencesMat:'Wood', machines:[0.5,0.45,0.35], machinesMat:'Slate', paths:[0.5,0.45,0.38], factory:[0.4,0.35,0.28], factoryMat:'Brick', lights:[1,0.8,0.4], sign:[0.7,0.55,0.2], dropParticle:[1,0.75,0.3], biome:'grass', clockTime:16, ambient:[0.35,0.3,0.25], brightness:2.2, fogEnd:700, fogColor:[0.65,0.6,0.55], outdoorAmbient:[0.4,0.38,0.32], atmoD:0.3, atmoOff:0.2, atmoColor:[0.8,0.75,0.65], atmoDecay:[0.85,0.8,0.7], atmoHaze:1, bloomI:0.25, bloomS:18, bloomT:0.88, ccB:0.02, ccC:0.08, ccS:0.05, ccTint:[1,0.95,0.85], purchaseLabels:['Swift Steed','Castle Bridge','Enchantment','Treasure Chest','Fortress Walls','Fortress Roof','Spell Book','Shield Rack','Catapult 2','Alchemy Table','Tower Walls','Tower Roof','Torch Lights','Forge','Stone Path','Royal Banner','Ballista 3','Mystic Rune','East Wing','Golden Grail','Armory','Auto Guard','Royal Garden','Rebirth Throne','Gold Anvil','West Wing','Mega Catapult','Crown Jewel','South Gate','Emperor Crown'], dropperTiers:['Peasant','Squire','Knight','Baron','Duke','King','Emperor'], factorySign:'CASTLE', decorParts:[{name:'Deco_Tower',size:[6,18,6],pos:[45,9,5],color:[0.45,0.4,0.35],mat:'Brick'},{name:'Deco_Well',size:[6,4,6],pos:[-45,2,5],color:[0.4,0.38,0.35],mat:'Cobblestone',extra:{shape:'Cylinder',particles:{rate:5,lifetime:2,speed:1,color:[0.5,0.6,0.8],size:0.3,spread:20}}},{name:'Deco_Flag',size:[1,14,6],pos:[45,18,5],color:[0.7,0.15,0.15],mat:'SmoothPlastic'},{name:'Deco_Throne',size:[6,8,4],pos:[-45,4,25],color:[0.7,0.55,0.2],mat:'Marble'}], layout:'symmetric', npcNames:['King','Blacksmith','Merchant','Wizard'], toolName:'Royal Sword' },
  tech: { name:'Tech', base:[0.25,0.28,0.35], baseMat:'DiamondPlate', walls:[0.3,0.33,0.4], wallsMat:'Metal', fences:[0.35,0.4,0.5], fencesMat:'Metal', machines:[0.6,0.65,0.75], machinesMat:'DiamondPlate', paths:[0.3,0.32,0.38], factory:[0.2,0.22,0.3], factoryMat:'Metal', lights:[0.5,0.7,1], sign:[0.2,0.5,1], dropParticle:[0.3,0.6,1], biome:'grass', clockTime:14, ambient:[0.3,0.32,0.38], brightness:2.8, fogEnd:900, fogColor:[0.6,0.65,0.75], outdoorAmbient:[0.4,0.42,0.5], atmoD:0.2, atmoOff:0.15, atmoColor:[0.75,0.8,0.9], atmoDecay:[0.85,0.88,0.95], atmoHaze:0.6, bloomI:0.35, bloomS:20, bloomT:0.82, ccB:0.03, ccC:0.1, ccS:0.05, ccTint:[0.92,0.95,1], purchaseLabels:['Overclock','Data Pipeline','Code Optimizer','Server Rack','Firewall Walls','Firewall Roof','Debug Console','RAM Boost','GPU Cluster 2','Neural Network','Cloud Walls','Cloud Roof','LED Array','Processor Unit','Fiber Belt','Holo Display','Quantum Core 3','AI Engine','Server Farm','Crypto Trophy','Data Vault','Auto Bot','Circuit Garden','Reboot Core','Gold Chip','AI Hub','Mega GPU','Diamond Drive','Quantum Lab','Singularity'], dropperTiers:['v0.1','v1.0','Pro','Ultra','Quantum','Neural','Singularity'], factorySign:'TECH LAB', decorParts:[{name:'Deco_Server',size:[6,12,6],pos:[45,6,5],color:[0.3,0.33,0.4],mat:'Metal'},{name:'Deco_Screen',size:[12,8,2],pos:[-45,5,5],color:[0.2,0.5,1],mat:'Neon'},{name:'Deco_Bot',size:[6,8,6],pos:[45,4,25],color:[0.6,0.65,0.75],mat:'DiamondPlate',extra:{shape:'Cylinder'}},{name:'Deco_Antenna',size:[2,16,2],pos:[-45,8,25],color:[0.35,0.4,0.5],mat:'Metal'}], layout:'corridor', npcNames:['CTO','Developer','Support Bot','Hacker'], toolName:'Data Pad' },
  mining: { name:'Mining', base:[0.3,0.25,0.2], baseMat:'Slate', walls:[0.28,0.22,0.18], wallsMat:'Granite', fences:[0.25,0.2,0.15], fencesMat:'Wood', machines:[0.4,0.35,0.25], machinesMat:'Metal', paths:[0.35,0.3,0.22], factory:[0.25,0.2,0.15], factoryMat:'Granite', lights:[1,0.8,0.4], sign:[0.9,0.6,0.15], dropParticle:[0.9,0.65,0.2], biome:'arctic', clockTime:8, ambient:[0.25,0.2,0.15], brightness:1.8, fogEnd:500, fogColor:[0.35,0.3,0.25], outdoorAmbient:[0.3,0.25,0.2], atmoD:0.4, atmoOff:0.3, atmoColor:[0.45,0.38,0.3], atmoDecay:[0.8,0.7,0.6], atmoHaze:1.5, bloomI:0.2, bloomS:15, bloomT:0.9, ccB:0, ccC:0.05, ccS:-0.05, ccTint:[1,0.92,0.82], purchaseLabels:['Minecart Rails','Ore Conveyor','Ore Refiner','Rock Storage','Tunnel Walls','Tunnel Roof','Mine Map','Pickaxe Rack','Deep Drill 2','Gem Polisher','Cavern Walls','Cavern Roof','Mine Lamps','Smelter','Lava Belt','Mine Sign','Core Drill 3','Crystal Forge','East Shaft','Gold Nugget','Ore Vault','Auto Miner','Crystal Garden','Rebirth Anvil','Diamond Drill','West Shaft','Mega Excavator','Golden Ingot','Deep Shaft','Mythril Crown'], dropperTiers:['Dirt','Copper','Iron','Gold','Diamond','Obsidian','Mythril'], factorySign:'MINE SHAFT', decorParts:[{name:'Deco_Crystals',size:[6,10,6],pos:[45,5,5],color:[0.9,0.6,0.15],mat:'Neon',extra:{particles:{rate:5,lifetime:3,speed:0.5,color:[0.9,0.65,0.2],size:0.3,spread:20}}},{name:'Deco_Cart',size:[6,4,8],pos:[-45,2,5],color:[0.4,0.35,0.25],mat:'Metal'},{name:'Deco_Tracks',size:[4,0.5,30],pos:[-45,0.25,20],color:[0.35,0.3,0.22],mat:'Metal'},{name:'Deco_Boulder',size:[8,6,8],pos:[45,3,25],color:[0.3,0.25,0.2],mat:'Granite',extra:{shape:'Ball'}}], layout:'left-heavy', npcNames:['Foreman','Geologist','Ore Trader','Explorer'], toolName:'Pickaxe' },
};

// ── Obby Theme System ──

interface ObbyTheme {
  name: string;
  platform: [number, number, number]; platformMat: string;
  checkpoint: [number, number, number]; checkpointMat: string;
  kill: [number, number, number]; killMat: string;
  accent1: [number, number, number]; accent2: [number, number, number];
  decoration: [number, number, number]; decorationMat: string;
  win: [number, number, number];
  biome: string;
  clockTime: number; ambient: [number, number, number]; brightness: number;
  fogEnd: number; fogColor: [number, number, number]; outdoorAmbient: [number, number, number];
  atmoD: number; atmoOff: number; atmoColor: [number, number, number]; atmoDecay: [number, number, number]; atmoHaze: number;
  bloomI: number; bloomS: number; bloomT: number;
  ccB: number; ccC: number; ccS: number; ccTint: [number, number, number];
}

const OBBY_THEMES: Record<string, ObbyTheme> = {
  default: { name:'Default', platform:[0.45,0.7,0.95], platformMat:'SmoothPlastic', checkpoint:[0.2,0.9,0.2], checkpointMat:'SmoothPlastic', kill:[1,0,0], killMat:'Neon', accent1:[1,0.85,0.3], accent2:[0.5,0.8,1], decoration:[0.6,0.6,0.65], decorationMat:'Concrete', win:[1,0.85,0.3], biome:'grass', clockTime:14, ambient:[0.35,0.35,0.4], brightness:2.5, fogEnd:800, fogColor:[0.7,0.75,0.85], outdoorAmbient:[0.45,0.45,0.5], atmoD:0.25, atmoOff:0.2, atmoColor:[0.85,0.9,1], atmoDecay:[0.9,0.85,0.7], atmoHaze:0.8, bloomI:0.35, bloomS:20, bloomT:0.85, ccB:0.03, ccC:0.08, ccS:0.1, ccTint:[1,0.97,0.9] },
  meme: { name:'Meme', platform:[1,0.2,0.85], platformMat:'SmoothPlastic', checkpoint:[0.4,1,0.4], checkpointMat:'Neon', kill:[1,0.1,0.3], killMat:'Neon', accent1:[0.2,1,1], accent2:[1,1,0.2], decoration:[1,0.3,0.9], decorationMat:'SmoothPlastic', win:[1,0.9,0.15], biome:'grass', clockTime:14, ambient:[0.5,0.35,0.55], brightness:3.5, fogEnd:1400, fogColor:[0.9,0.7,1], outdoorAmbient:[0.55,0.4,0.6], atmoD:0.12, atmoOff:0.08, atmoColor:[1,0.85,1], atmoDecay:[1,0.9,1], atmoHaze:0.3, bloomI:0.35, bloomS:24, bloomT:0.75, ccB:0.05, ccC:0.08, ccS:0.25, ccTint:[1,0.95,1] },
  hospital_horror: { name:'Hospital Horror', platform:[0.68,0.72,0.68], platformMat:'Concrete', checkpoint:[0.25,0.95,0.45], checkpointMat:'Neon', kill:[0.12,1,0.25], killMat:'Neon', accent1:[0.25,0.75,0.85], accent2:[0.85,0.08,0.08], decoration:[0.78,0.80,0.76], decorationMat:'Concrete', win:[0.85,1,0.85], biome:'arctic', clockTime:0, ambient:[0.05,0.08,0.075], brightness:1.45, fogEnd:280, fogColor:[0.06,0.12,0.1], outdoorAmbient:[0.08,0.12,0.11], atmoD:0.52, atmoOff:0.38, atmoColor:[0.12,0.22,0.18], atmoDecay:[0.28,0.55,0.48], atmoHaze:2.2, bloomI:0.22, bloomS:16, bloomT:0.82, ccB:-0.02, ccC:0.14, ccS:-0.08, ccTint:[0.82,1,0.9] },
  school_horror: { name:'Haunted School', platform:[0.54,0.58,0.50], platformMat:'Concrete', checkpoint:[0.32,0.95,0.58], checkpointMat:'Neon', kill:[0.86,0.12,0.10], killMat:'Neon', accent1:[0.18,0.55,0.36], accent2:[0.86,0.74,0.28], decoration:[0.34,0.42,0.46], decorationMat:'Concrete', win:[0.95,0.82,0.35], biome:'arctic', clockTime:0, ambient:[0.05,0.075,0.07], brightness:1.35, fogEnd:320, fogColor:[0.055,0.08,0.075], outdoorAmbient:[0.08,0.105,0.10], atmoD:0.50, atmoOff:0.34, atmoColor:[0.12,0.18,0.14], atmoDecay:[0.30,0.48,0.42], atmoHaze:2.0, bloomI:0.24, bloomS:18, bloomT:0.80, ccB:-0.015, ccC:0.13, ccS:-0.06, ccTint:[0.86,1,0.90] },
  lab_horror: { name:'Abandoned Lab Horror', platform:[0.14,0.18,0.18], platformMat:'Metal', checkpoint:[0.20,0.78,0.88], checkpointMat:'Neon', kill:[0.10,0.82,0.26], killMat:'Neon', accent1:[0.92,0.66,0.16], accent2:[0.32,0.72,0.80], decoration:[0.22,0.27,0.28], decorationMat:'Metal', win:[0.84,0.92,0.78], biome:'arctic', clockTime:0, ambient:[0.055,0.075,0.075], brightness:1.5, fogEnd:360, fogColor:[0.04,0.065,0.065], outdoorAmbient:[0.08,0.105,0.105], atmoD:0.42, atmoOff:0.30, atmoColor:[0.08,0.14,0.14], atmoDecay:[0.14,0.32,0.32], atmoHaze:1.35, bloomI:0.24, bloomS:17, bloomT:0.82, ccB:0.0, ccC:0.11, ccS:-0.12, ccTint:[0.90,1,0.98] },
  slime_horror: { name:'Horror Slime Chase', platform:[0.10,0.16,0.10], platformMat:'Slate', checkpoint:[0.30,1.00,0.25], checkpointMat:'Neon', kill:[0.05,0.95,0.16], killMat:'Neon', accent1:[0.48,1.00,0.25], accent2:[0.16,0.72,0.10], decoration:[0.08,0.24,0.08], decorationMat:'SmoothPlastic', win:[0.84,1.00,0.36], biome:'arctic', clockTime:0, ambient:[0.06,0.10,0.06], brightness:1.75, fogEnd:500, fogColor:[0.04,0.08,0.04], outdoorAmbient:[0.10,0.15,0.08], atmoD:0.34, atmoOff:0.22, atmoColor:[0.08,0.18,0.08], atmoDecay:[0.18,0.50,0.16], atmoHaze:1.20, bloomI:0.36, bloomS:20, bloomT:0.76, ccB:0.005, ccC:0.13, ccS:0.02, ccTint:[0.88,1,0.82] },
  candy: { name:'Candy', platform:[0.95,0.6,0.75], platformMat:'SmoothPlastic', checkpoint:[0.5,0.95,0.5], checkpointMat:'SmoothPlastic', kill:[1,0.2,0.2], killMat:'Neon', accent1:[0.6,0.85,0.95], accent2:[1,0.85,0.9], decoration:[0.95,0.7,0.8], decorationMat:'SmoothPlastic', win:[1,0.85,0.3], biome:'grass', clockTime:13, ambient:[0.45,0.4,0.45], brightness:3, fogEnd:1000, fogColor:[0.9,0.85,0.9], outdoorAmbient:[0.5,0.48,0.52], atmoD:0.2, atmoOff:0.15, atmoColor:[0.95,0.9,0.95], atmoDecay:[0.95,0.9,0.95], atmoHaze:0.5, bloomI:0.4, bloomS:22, bloomT:0.8, ccB:0.05, ccC:0.05, ccS:0.2, ccTint:[1,0.95,0.98] },
  horror: { name:'Horror', platform:[0.25,0.15,0.2], platformMat:'Slate', checkpoint:[0.6,0.1,0.1], checkpointMat:'Neon', kill:[0.8,0,0], killMat:'Neon', accent1:[0.5,0,0], accent2:[0.3,0.1,0.4], decoration:[0.2,0.15,0.18], decorationMat:'Granite', win:[0.9,0.2,0.2], biome:'arctic', clockTime:0, ambient:[0.06,0.04,0.08], brightness:1.2, fogEnd:300, fogColor:[0.08,0.05,0.1], outdoorAmbient:[0.08,0.06,0.1], atmoD:0.5, atmoOff:0.4, atmoColor:[0.15,0.08,0.15], atmoDecay:[0.6,0.4,0.5], atmoHaze:2, bloomI:0.15, bloomS:12, bloomT:0.95, ccB:-0.03, ccC:0.12, ccS:-0.15, ccTint:[0.9,0.8,0.85] },
  space: { name:'Space', platform:[0.15,0.2,0.4], platformMat:'Metal', checkpoint:[0.2,0.8,0.4], checkpointMat:'Neon', kill:[1,0.2,0], killMat:'Neon', accent1:[0.4,0.3,1], accent2:[0.2,0.8,1], decoration:[0.2,0.2,0.3], decorationMat:'Metal', win:[1,0.85,0.3], biome:'arctic', clockTime:0, ambient:[0.08,0.06,0.15], brightness:1.8, fogEnd:400, fogColor:[0.05,0.03,0.1], outdoorAmbient:[0.1,0.08,0.2], atmoD:0.45, atmoOff:0.35, atmoColor:[0.15,0.1,0.25], atmoDecay:[0.7,0.6,0.9], atmoHaze:1.8, bloomI:0.6, bloomS:25, bloomT:0.6, ccB:0.02, ccC:0.1, ccS:0.2, ccTint:[0.85,0.8,1] },
  nature: { name:'Nature', platform:[0.4,0.6,0.3], platformMat:'Grass', checkpoint:[0.3,0.8,0.2], checkpointMat:'SmoothPlastic', kill:[0.8,0.2,0.1], killMat:'Neon', accent1:[0.55,0.35,0.2], accent2:[0.3,0.7,0.4], decoration:[0.45,0.35,0.2], decorationMat:'Wood', win:[1,0.85,0.3], biome:'grass', clockTime:11, ambient:[0.35,0.4,0.3], brightness:2.8, fogEnd:1000, fogColor:[0.75,0.8,0.7], outdoorAmbient:[0.45,0.5,0.4], atmoD:0.2, atmoOff:0.15, atmoColor:[0.8,0.9,0.75], atmoDecay:[0.85,0.9,0.8], atmoHaze:0.6, bloomI:0.3, bloomS:18, bloomT:0.85, ccB:0.02, ccC:0.05, ccS:0.15, ccTint:[0.95,1,0.92] },
  lava: { name:'Lava', platform:[0.3,0.25,0.2], platformMat:'Slate', checkpoint:[0.9,0.5,0.1], checkpointMat:'Neon', kill:[1,0.3,0], killMat:'Neon', accent1:[1,0.5,0.1], accent2:[1,0.2,0], decoration:[0.35,0.25,0.2], decorationMat:'Granite', win:[1,0.85,0.3], biome:'arctic', clockTime:18, ambient:[0.2,0.1,0.08], brightness:2, fogEnd:500, fogColor:[0.3,0.15,0.1], outdoorAmbient:[0.25,0.15,0.1], atmoD:0.35, atmoOff:0.25, atmoColor:[0.5,0.25,0.15], atmoDecay:[0.9,0.6,0.4], atmoHaze:1.2, bloomI:0.5, bloomS:22, bloomT:0.7, ccB:0.03, ccC:0.1, ccS:0.1, ccTint:[1,0.9,0.8] },
  medieval: { name:'Medieval', platform:[0.45,0.4,0.35], platformMat:'Cobblestone', checkpoint:[0.3,0.7,0.3], checkpointMat:'SmoothPlastic', kill:[0.8,0.15,0.1], killMat:'Neon', accent1:[0.7,0.55,0.2], accent2:[0.5,0.4,0.3], decoration:[0.4,0.35,0.28], decorationMat:'Brick', win:[1,0.85,0.3], biome:'grass', clockTime:16, ambient:[0.35,0.3,0.25], brightness:2.2, fogEnd:700, fogColor:[0.65,0.6,0.55], outdoorAmbient:[0.4,0.38,0.32], atmoD:0.3, atmoOff:0.2, atmoColor:[0.8,0.75,0.65], atmoDecay:[0.85,0.8,0.7], atmoHaze:1, bloomI:0.25, bloomS:18, bloomT:0.88, ccB:0.02, ccC:0.08, ccS:0.05, ccTint:[1,0.95,0.85] },
  neon: { name:'Neon', platform:[0.1,0.1,0.12], platformMat:'SmoothPlastic', checkpoint:[0,1,0.5], checkpointMat:'Neon', kill:[1,0,0], killMat:'Neon', accent1:[1,0,0.5], accent2:[0,0.5,1], decoration:[0.08,0.08,0.1], decorationMat:'SmoothPlastic', win:[1,0.85,0.3], biome:'arctic', clockTime:0, ambient:[0.05,0.05,0.08], brightness:1.5, fogEnd:450, fogColor:[0.03,0.03,0.06], outdoorAmbient:[0.08,0.08,0.12], atmoD:0.35, atmoOff:0.25, atmoColor:[0.1,0.1,0.15], atmoDecay:[0.7,0.7,0.8], atmoHaze:1.2, bloomI:0.4, bloomS:20, bloomT:0.7, ccB:0.03, ccC:0.12, ccS:0.25, ccTint:[0.95,0.9,1] },
};

const OBBY_THEME_KEYWORDS: [string[], string][] = [
  [['meme', 'viral', 'brainrot', 'tralalero', 'tralala', 'bombardir', 'tiktok', 'skibidi', 'ohio', 'rizz', 'sigma', 'мем', 'вирус', 'тралал', 'бомбард', 'скибиди'], 'meme'],
  [['slime', 'goo', 'ooze', 'toxic goo', 'slime monster', 'slime chase', 'слиз', 'слизь', 'жиж', 'слизн'], 'slime_horror'],
  [['hospital', 'clinic', 'medical', 'infirmary', 'medbay', 'sickbay', 'emergency room', 'больниц', 'госпитал', 'клиник', 'медицин'], 'hospital_horror'],
  [['school', 'classroom', 'locker', 'blackboard', 'chalkboard', 'teacher', 'student', 'principal', 'detention', 'cafeteria', 'library', 'школ', 'класс', 'раздевалк', 'шкафчик', 'доска', 'учител', 'ученик', 'директор', 'столов', 'библиотек'], 'school_horror'],
  [['lab', 'laboratory', 'science facility', 'research facility', 'experiment', 'chemical', 'biohazard', 'hazmat', 'specimen', 'containment', 'лаборатор', 'эксперимент', 'химик', 'биоопас', 'образец', 'карантин'], 'lab_horror'],
  [['candy', 'sweet', 'ice cream', 'chocolate', 'cupcake', 'sugar', 'gummy', 'конфет', 'сладк'], 'candy'],
  [['horror', 'scary', 'dark', 'zombie', 'ghost', 'haunted', 'creepy', 'blood', 'ужас', 'страш', 'зомби', 'тёмн'], 'horror'],
  [['space', 'sci-fi', 'alien', 'galaxy', 'rocket', 'planet', 'star', 'cyber', 'космос', 'галактик', 'планет'], 'space'],
  [['nature', 'forest', 'jungle', 'tree', 'garden', 'animal', 'лес', 'природ', 'джунгл'], 'nature'],
  [['lava', 'volcano', 'fire', 'magma', 'inferno', 'hell', 'лава', 'вулкан', 'огон'], 'lava'],
  [['medieval', 'castle', 'knight', 'dragon', 'dungeon', 'fantasy', 'magic', 'замок', 'рыцар', 'дракон', 'фэнтези', 'магия'], 'medieval'],
  [['neon', 'glow', 'cyberpunk', 'synthwave', 'retro', 'неон', 'свечен'], 'neon'],
];

export function detectObbyThemeKey(gameBrief: string): string {
  const b = (gameBrief || '').toLowerCase();
  for (const [keywords, themeName] of OBBY_THEME_KEYWORDS) {
    for (const k of keywords) {
      if (b.includes(k)) return themeName;
    }
  }
  return 'default';
}

/**
 * Sub-theme discriminator for `'meme'` obbies. `detectObbyThemeKey` collapses
 * all brainrot variants (skibidi/bombardir/tralalero/sigma/ohio/rizz) into a
 * single `'meme'` bucket, erasing which specific meme the user asked for.
 * This splits them back apart so `buildObbyScript` can spawn sub-theme-specific
 * NPCs, collectibles, stickers, and meme-text pools.
 */
export function detectMemeSubTheme(text: string): MemeSubTheme {
  const s = (text || '').toLowerCase();
  if (/skibid|скибид|туалет|toilet/.test(s)) return 'skibidi';
  if (/bombard|бомбард|crocodil|крокод/.test(s)) return 'bombardir';
  if (/tralal|тралал|shark|акул/.test(s)) return 'tralalero';
  if (/sigma|сигма|ohio|охайо|rizz|ризз/.test(s)) return 'sigma';
  // Session #073: default to 'skibidi' instead of 'generic' — Skibidi is the
  // most recognizable meme character. The pink cube fallback was confusing.
  return 'skibidi';
}

export function detectObbyTheme(gameBrief: string): ObbyTheme {
  return OBBY_THEMES[detectObbyThemeKey(gameBrief)] ?? OBBY_THEMES.default;
}

const TYCOON_THEME_KEYWORDS: [string[], string][] = [
  [['pizza', 'food', 'restaurant', 'bakery', 'burger', 'kitchen', 'cafe', 'cook', 'sushi', 'taco', 'пицц', 'еда', 'ресторан', 'кухн', 'бургер', 'кафе', 'повар', 'суши', 'кулинар'], 'food'],
  [['meme', 'viral', 'brainrot', 'tralalero', 'tiktok', 'skibidi', 'ohio', 'rizz', 'sigma', 'мем', 'тикток', 'сигма'], 'meme'],
  [['military', 'army', 'war', 'soldier', 'tank', 'weapon', 'base defense', 'bunker', 'военн', 'арми', 'войн', 'солдат', 'танк', 'оруж', 'бункер'], 'military'],
  [['candy', 'sweet', 'ice cream', 'chocolate', 'cupcake', 'dessert', 'sugar', 'gummy', 'конфет', 'шоколад', 'сладк', 'мороженое', 'карамел', 'десерт', 'сахар'], 'candy'],
  [['space', 'sci-fi', 'alien', 'galaxy', 'rocket', 'planet', 'star', 'cyber', 'cyberpunk', 'neon', 'futur', 'космос', 'ракет', 'планет', 'звезд', 'кибер', 'будущ'], 'space'],
  [['nature', 'farm', 'garden', 'plant', 'eco', 'flower', 'tree', 'animal', 'zoo', 'ферм', 'сад', 'растен', 'цветок', 'дерев', 'животн', 'зоопарк'], 'nature'],
  [['medieval', 'castle', 'kingdom', 'knight', 'dragon', 'dungeon', 'fantasy', 'magic', 'замок', 'рыцар', 'королевств', 'дракон', 'подземель', 'фантази', 'маги'], 'medieval'],
  [['tech', 'computer', 'robot', 'hacker', 'digital', 'ai ', 'data', 'server', 'code', 'компьютер', 'робот', 'хакер', 'сервер', 'код', 'данны'], 'tech'],
  [['mining', 'mine', 'ore', 'gem', 'crystal', 'cave', 'dig', 'quarry', 'diamond', 'шахт', 'руд', 'кристалл', 'пещер', 'алмаз', 'копа'], 'mining'],
];

export function detectTycoonThemeKey(gameBrief: string): string {
  const b = (gameBrief || '').toLowerCase();
  for (const [keywords, themeName] of TYCOON_THEME_KEYWORDS) {
    for (const k of keywords) {
      if (b.includes(k)) return themeName;
    }
  }
  return 'default';
}

function detectTycoonTheme(gameBrief: string): TycoonTheme {
  return TYCOON_THEMES[detectTycoonThemeKey(gameBrief)];
}

// ── Deterministic Obby Scene Template ──

type ObbyStageType = 'standard' | 'thin_walkway' | 'small_hop' | 'zigzag' | 'staircase' | 'L_shaped';

interface ObbyStageDef {
  type: ObbyStageType;
  /** Sub-parts relative to stage anchor position */
  parts: Array<{ relOffset: [number, number, number]; size: [number, number, number] }>;
  difficulty: number;
}

const OBBY_STAGE_POOL: Record<number, ObbyStageDef[]> = {
  // Tier 1 (stages 1-5): Easy — large platforms
  1: [
    { type: 'standard', difficulty: 1, parts: [{ relOffset: [0, 0, 0], size: [10, 2, 10] }] },
    { type: 'standard', difficulty: 1, parts: [{ relOffset: [0, 0, 0], size: [12, 2, 8] }] },
    { type: 'standard', difficulty: 1, parts: [{ relOffset: [0, 0, 0], size: [8, 2, 14] }] },
  ],
  // Tier 2 (stages 6-10): Medium — standard + thin walkways
  2: [
    { type: 'standard', difficulty: 2, parts: [{ relOffset: [0, 0, 0], size: [8, 2, 8] }] },
    { type: 'thin_walkway', difficulty: 2, parts: [{ relOffset: [0, 0, 0], size: [3, 2, 14] }] },
    { type: 'standard', difficulty: 2, parts: [{ relOffset: [0, 0, 0], size: [7, 2, 7] }] },
    { type: 'thin_walkway', difficulty: 2, parts: [{ relOffset: [0, 0, 0], size: [4, 2, 12] }] },
  ],
  // Tier 3 (stages 11-15): Medium-Hard — small hops, zigzag
  3: [
    { type: 'small_hop', difficulty: 3, parts: [{ relOffset: [0, 0, 0], size: [6, 2, 6] }] },
    { type: 'zigzag', difficulty: 3, parts: [
      { relOffset: [-4, 0, 0], size: [4, 2, 4] },
      { relOffset: [4, 2, -6], size: [4, 2, 4] },
    ]},
    { type: 'small_hop', difficulty: 3, parts: [{ relOffset: [0, 0, 0], size: [5, 2, 5] }] },
    { type: 'staircase', difficulty: 3, parts: [
      { relOffset: [0, 0, 0], size: [6, 1, 4] },
      { relOffset: [0, 2, -5], size: [6, 1, 4] },
      { relOffset: [0, 4, -10], size: [6, 1, 4] },
    ]},
  ],
  // Tier 4 (stages 16-20): Hard — thin walkways, small platforms
  4: [
    { type: 'thin_walkway', difficulty: 4, parts: [{ relOffset: [0, 0, 0], size: [2, 2, 12] }] },
    { type: 'small_hop', difficulty: 4, parts: [{ relOffset: [0, 0, 0], size: [4, 2, 4] }] },
    { type: 'L_shaped', difficulty: 4, parts: [
      { relOffset: [0, 0, 0], size: [3, 2, 8] },
      { relOffset: [4, 0, -5], size: [8, 2, 3] },
    ]},
    { type: 'thin_walkway', difficulty: 4, parts: [{ relOffset: [0, 0, 0], size: [2, 2, 14] }] },
  ],
  // Tier 5 (stages 21-25): Expert — tiny precision platforms
  5: [
    { type: 'small_hop', difficulty: 5, parts: [{ relOffset: [0, 0, 0], size: [3, 2, 3] }] },
    { type: 'zigzag', difficulty: 5, parts: [
      { relOffset: [-3, 0, 0], size: [3, 2, 3] },
      { relOffset: [3, 2, -5], size: [3, 2, 3] },
    ]},
    { type: 'thin_walkway', difficulty: 5, parts: [{ relOffset: [0, 0, 0], size: [2, 2, 10] }] },
    { type: 'small_hop', difficulty: 5, parts: [{ relOffset: [0, 0, 0], size: [4, 2, 3] }] },
  ],
};

function simpleHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function buildObbySceneTemplate(theme?: ObbyTheme, gameName?: string, stageCount?: number): SceneTemplate {
  const t = theme || OBBY_THEMES.default;
  const seed = simpleHash(gameName || 'obby');

  // Obby is now fully self-contained in buildObbyScript() — this template
  // provides ONLY terrain, lighting, and a spawn location.
  // The script creates all platforms, checkpoints, kill zones, and win platforms via Instance.new().

  const parts: ScenePart[] = [];

  // Large ground plane for visual reference (players start above it)
  parts.push(p('GroundPlane', [600, 1, 2000], [0, -20, -500], t.decoration, t.decorationMat, { canCollide: false, transparency: 0.6 }));

  // Kill floor below the entire course (safety net)
  parts.push(p('KillFloor', [600, 1, 2000], [0, -50, -500], t.kill, t.killMat, { canCollide: false }));

  return {
    parts,
    spawns: [{ name: 'SpawnLocation', position: [0, 3.5, 5] }],
    terrain: { biome: t.biome, seed: seed % 9999, amplitude: 4, baseHeight: -20, features: ['rocks', 'bushes'], range: 200 },
    lighting: {
      clockTime: t.clockTime, ambient: t.ambient, brightness: t.brightness,
      fogEnd: t.fogEnd, fogColor: t.fogColor, outdoorAmbient: t.outdoorAmbient,
      atmosphere: { density: t.atmoD, offset: t.atmoOff, color: t.atmoColor, decay: t.atmoDecay, haze: t.atmoHaze },
      postEffects: { bloomIntensity: t.bloomI, bloomSize: t.bloomS, bloomThreshold: t.bloomT, ccBrightness: t.ccB, ccContrast: t.ccC, ccSaturation: t.ccS, ccTintColor: t.ccTint },
    },
  };
}

// ── Seed-based procedural generation utilities ──
function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; }
  return Math.abs(h) || 1;
}
function seedRandom(seed: number) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) & 0x7fffffff; return s / 0x7fffffff; };
}

export function buildTycoonSceneTemplate(theme?: TycoonTheme, gameName?: string): SceneTemplate {
  const t = theme || TYCOON_THEMES.default;
  const signText = gameName ? gameName.toUpperCase().replace(/\s*tycoon\s*/i, '').trim() || 'TYCOON' : 'TYCOON';
  const hidden = { transparency: 0.99 as number, canCollide: false };

  // ── Procedural seed from gameName ──
  const seed = hashCode((gameName || '') + String(Date.now()));
  const rng = seedRandom(seed);
  const spineX = Math.floor(rng() * 30) - 15;  // spine offset: -15 to +15
  const mirror = rng() > 0.5 ? -1 : 1;          // 50% chance mirror
  const hScale = 0.8 + rng() * 0.5;              // building height: 0.8x to 1.3x
  const jitter = () => Math.floor(rng() * 8) - 4; // pad jitter: ±4

  // Random layout (not tied to theme)
  const layoutOptions = ['symmetric', 'left-heavy', 'corridor', 'scattered'] as const;
  const layout = layoutOptions[Math.floor(rng() * layoutOptions.length)];

  // Helper: apply spine offset + mirror to a position
  const sx = (x: number) => x + spineX;          // spine parts (X near 0)
  const mx = (x: number) => x * mirror;           // mirrored parts (X far from 0)
  const msx = (x: number) => x * mirror + spineX; // both mirror + spine offset

  // 30 BuyPad colors: Tier1=green, Tier2=yellow/orange, Tier3=red/pink, Tier4=purple/gold
  const padColors: [number, number, number][] = [
    // Tier 1 (1-8): greens
    [0.1, 0.9, 0.2], [0.15, 0.85, 0.25], [0.2, 0.8, 0.2], [0.25, 0.85, 0.15],
    [0.3, 0.9, 0.1], [0.2, 0.75, 0.3], [0.15, 0.8, 0.35], [0.1, 0.85, 0.4],
    // Tier 2 (9-16): yellows/oranges
    [0.95, 0.85, 0.1], [0.95, 0.75, 0.1], [1, 0.65, 0.1], [1, 0.55, 0.1],
    [1, 0.45, 0.1], [0.95, 0.4, 0.1], [0.9, 0.35, 0.1], [0.85, 0.3, 0.15],
    // Tier 3 (17-24): reds/pinks
    [1, 0.25, 0.2], [0.95, 0.2, 0.3], [0.9, 0.15, 0.4], [0.85, 0.15, 0.5],
    [0.8, 0.2, 0.55], [0.75, 0.15, 0.6], [0.7, 0.1, 0.65], [0.65, 0.1, 0.7],
    // Tier 4 (25-30): purples/golds
    [0.6, 0.1, 0.9], [0.7, 0.3, 0.9], [0.8, 0.5, 0.9], [1, 0.85, 0.2],
    [1, 0.75, 0.15], [1, 0.9, 0.3],
  ];

  // Layout-dependent pad positions — each layout places pads differently
  const padLayouts: Record<string, [number, number][]> = {
    symmetric: [ // balanced left-right
      [30,-10],[8,-48],[30,-25],[-20,15],[-40,-20],[-40,-30],[-30,-10],[30,-40],
      [15,-15],[8,-38],[-42,-45],[-42,-55],[20,20],[35,-50],[8,-62],[-35,-55],
      [-15,-15],[8,-52],[50,0],[40,25],[40,-30],[8,-72],[-25,30],[0,40],
      [8,-58],[-50,0],[-15,-25],[0,25],[0,-82],[0,15],
    ],
    'left-heavy': [ // most buildings on left, pads clustered west
      [-30,-10],[-25,-48],[-35,-25],[-40,15],[-50,-20],[-50,-30],[-45,-10],[-30,-40],
      [-20,-15],[-25,-38],[-55,-45],[-55,-55],[-35,20],[-45,-50],[-25,-62],[-50,-55],
      [25,-15],[8,-52],[55,0],[45,25],[45,-30],[8,-72],[30,30],[0,40],
      [8,-58],[55,10],[25,-25],[0,25],[0,-82],[0,15],
    ],
    corridor: [ // long narrow — pads along the sides in rows
      [22,-5],[-22,-5],[22,-15],[-22,-15],[22,-25],[-22,-25],[22,-35],[-22,-35],
      [22,-45],[-22,-45],[22,-55],[-22,-55],[22,-65],[-22,-65],[22,-75],[-22,-75],
      [30,10],[-30,10],[30,20],[-30,20],[30,30],[-30,30],[30,40],[-30,40],
      [30,-85],[-30,-85],[30,50],[-30,50],[0,-90],[0,50],
    ],
    scattered: [ // asymmetric, pads everywhere at odd angles
      [35,5],[-15,-48],[45,-20],[-30,25],[-55,-15],[25,-35],[-45,10],[50,-45],
      [-35,-10],[15,-42],[-50,-40],[35,-60],[40,30],[-40,-50],[20,-65],[-55,-60],
      [30,-20],[-20,-52],[55,5],[-45,20],[50,-35],[-10,-72],[35,35],[10,45],
      [-25,-58],[55,-10],[-35,-30],[15,30],[-15,-85],[5,20],
    ],
  };

  const padXZ = (padLayouts[layout] || padLayouts.symmetric).map(([x, z]: [number, number]) => [x * mirror + jitter(), z + jitter()] as [number, number]);
  const prices = [50,150,300,500,800,1200,1800,2500,4000,6000,9000,13000,18000,25000,35000,50000,75000,100000,150000,200000,300000,450000,600000,800000,1200000,1800000,2500000,3500000,5000000,8000000];
  const buyPadDefs: [number, number, number, number][] = prices.map((price, i) => [i + 1, price, padXZ[i][0], padXZ[i][1]]);

  const parts: ScenePart[] = [
    // ══════════════════════════════════════════
    // ALWAYS VISIBLE — base infrastructure
    // ══════════════════════════════════════════

    // Base + Spawn
    p('TycoonBase',
      t.layout === 'corridor' ? [80, 1, 220] : t.layout === 'left-heavy' ? [160, 1, 180] : t.layout === 'scattered' ? [160, 1, 200] : [140, 1, 180],
      [0, 0, -10], t.base, t.baseMat),
    p('SpawnPlatform', [16, 1, 16], [0, 0.5, 70], t.paths, 'SmoothPlastic'),
    p('SpawnRamp', [8, 1, 12], [0, 0.25, 62], t.paths, 'SmoothPlastic'),

    // Dropper 1 (always visible) — themed
    p('Dropper', [14, 10, 14], [sx(0), 10, -20], t.machines, t.machinesMat, { particles: { rate: 12, lifetime: 1.5, speed: 3, color: t.dropParticle, size: 0.5, spread: 25 } }),
    p('DropperPipe', [4, 6, 4], [sx(0), 4, -20], t.factory, t.factoryMat),
    p('DropperBase', [18, 2, 18], [sx(0), 1, -20], t.factory, t.factoryMat),

    // Conveyor_1 — themed with rails
    p('Conveyor_1', [6, 1, 50], [sx(0), 1, -50], t.machines, t.machinesMat),
    p('ConveyorSupport_1', [4, 4, 4], [sx(-4), 2, -28], t.factory, t.factoryMat),
    p('ConveyorSupport_2', [4, 4, 4], [sx(4), 2, -28], t.factory, t.factoryMat),
    p('ConveyorRail_L', [1, 2, 50], [sx(-3.5), 1.5, -50], t.fences, t.fencesMat),
    p('ConveyorRail_R', [1, 2, 50], [sx(3.5), 1.5, -50], t.fences, t.fencesMat),

    // Collector — themed
    p('Collector', [16, 6, 16], [sx(0), 3, -80], t.sign, 'SmoothPlastic', { particles: { rate: 10, lifetime: 2, speed: 1.5, color: [1, 1, 0.4], size: 0.4, spread: 40 } }),
    p('CollectorBase', [20, 1, 20], [sx(0), 0.5, -80], t.factory, t.factoryMat),

    // Fences — match layout base size
    ...((): ScenePart[] => {
      const bw = t.layout === 'corridor' ? 40 : t.layout === 'left-heavy' ? 80 : t.layout === 'scattered' ? 80 : 70;
      const bh = t.layout === 'corridor' ? 110 : t.layout === 'scattered' ? 100 : 90;
      return [
        p('Fence_1', [4, 6, bh * 2], [bw, 3, -10], t.fences, t.fencesMat),
        p('Fence_2', [4, 6, bh * 2], [-bw, 3, -10], t.fences, t.fencesMat),
        p('Fence_3', [bw * 2, 6, 4], [0, 3, bh - 10], t.fences, t.fencesMat),
        p('Fence_4', [bw * 2, 6, 4], [0, 3, -bh - 10], t.fences, t.fencesMat),
        p('FenceCorner_1', [6, 8, 6], [bw, 4, bh - 10], t.fences, t.fencesMat),
        p('FenceCorner_2', [6, 8, 6], [-bw, 4, bh - 10], t.fences, t.fencesMat),
        p('FenceCorner_3', [6, 8, 6], [bw, 4, -bh - 10], t.fences, t.fencesMat),
        p('FenceCorner_4', [6, 8, 6], [-bw, 4, -bh - 10], t.fences, t.fencesMat),
      ];
    })(),

    // Wider paths
    p('Path_1', [10, 0.3, 60], [0, 0.15, 25], t.paths, 'SmoothPlastic'),
    p('Path_2', [60, 0.3, 10], [0, 0.15, -10], t.paths, 'SmoothPlastic'),
    p('Path_3', [10, 0.3, 40], [0, 0.15, -60], t.paths, 'SmoothPlastic'),
    p('Path_4', [30, 0.3, 10], [-30, 0.15, -20], t.paths, 'SmoothPlastic'),
    p('Path_5', [30, 0.3, 10], [30, 0.15, -30], t.paths, 'SmoothPlastic'),

    // Welcome arch + sign
    p('WelcomeSign', [16, 10, 4], [0, 6, 65], t.sign, 'Neon', { billboard: { text: signText, color: [1, 1, 1], size: 10, offset: [0, 5, 0] } }),
    p('WelcomeArch_L', [4, 14, 4], [-10, 7, 65], t.walls, t.wallsMat),
    p('WelcomeArch_R', [4, 14, 4], [10, 7, 65], t.walls, t.wallsMat),
    p('WelcomeArch_Top', [24, 4, 4], [0, 14, 65], t.sign, 'Neon'),

    // Decorative — pillars, lights, benches, platforms
    p('MoneyPile_1', [4, 2, 4], [18, 1, 10], [1, 0.85, 0.2], 'Neon', { shape: 'Ball' }),
    p('MoneyPile_2', [4, 2, 4], [-18, 1, 5], [1, 0.85, 0.2], 'Neon', { shape: 'Ball' }),
    p('Pillar_1', [4, 10, 4], [mx(30), 5, 40], t.walls, t.wallsMat),
    p('Pillar_2', [4, 10, 4], [mx(-30), 5, 40], t.walls, t.wallsMat),
    p('PillarLight_1', [4, 4, 4], [30, 11, 40], t.lights, 'Neon', { shape: 'Ball' }),
    p('PillarLight_2', [4, 4, 4], [-30, 11, 40], t.lights, 'Neon', { shape: 'Ball' }),
    p('Bench_1', [8, 2, 4], [20, 1, 50], t.fences, t.fencesMat),
    p('Bench_2', [8, 2, 4], [-20, 1, 50], t.fences, t.fencesMat),
    p('DecoPlatform_1', [20, 1, 20], [35, 0.5, 10], t.factory, t.factoryMat),
    p('DecoPlatform_2', [20, 1, 20], [-35, 0.5, 10], t.factory, t.factoryMat),
    p('StarterWall_1', [4, 8, 20], [mx(20), 4, -10], t.walls, t.wallsMat),
    p('StarterWall_2', [4, 8, 20], [mx(-20), 4, -10], t.walls, t.wallsMat),

    // Elevated viewing platforms (always visible)
    p('ViewPlatform_L', [16, 4, 16], [mx(-45), 2, 40], t.factory, t.factoryMat),
    p('ViewRailing_L', [16, 2, 1], [-45, 5, 32], t.fences, t.fencesMat),
    p('ViewStair_L', [6, 2, 6], [-37, 1, 40], t.paths, 'SmoothPlastic'),
    p('ViewPlatform_R', [16, 4, 16], [mx(45), 2, 40], t.factory, t.factoryMat),
    p('ViewRailing_R', [16, 2, 1], [45, 5, 32], t.fences, t.fencesMat),
    p('ViewStair_R', [6, 2, 6], [37, 1, 40], t.paths, 'SmoothPlastic'),

    // Decorative floor tiles (colored pattern around dropper area)
    p('FloorTile_1', [12, 0.2, 12], [15, 0.1, -10], t.factory, t.factoryMat),
    p('FloorTile_2', [12, 0.2, 12], [-15, 0.1, -10], t.factory, t.factoryMat),
    p('FloorTile_3', [8, 0.2, 8], [25, 0.1, 0], t.walls, t.wallsMat),
    p('FloorTile_4', [8, 0.2, 8], [-25, 0.1, 0], t.walls, t.wallsMat),
    p('FloorAccent_1', [4, 0.2, 30], [12, 0.1, -50], t.sign, 'Neon'),
    p('FloorAccent_2', [4, 0.2, 30], [-12, 0.1, -50], t.sign, 'Neon'),

    // Side buildings (always visible backdrop)
    p('SideBuilding_L', [18, Math.round(12 * hScale), 18], [mx(-50), Math.round(6 * hScale), 20], t.walls, t.wallsMat),
    p('SideBuildRoof_L', [20, 1, 20], [mx(-50), Math.round(12.5 * hScale), 20], t.factory, t.factoryMat),
    p('SideBuilding_R', [18, Math.round(14 * hScale), 18], [mx(50), Math.round(7 * hScale), 20], t.walls, t.wallsMat),
    p('SideBuildRoof_R', [20, 1, 20], [mx(50), Math.round(14.5 * hScale), 20], t.factory, t.factoryMat),

    // Ambient lights on sides
    p('AmbientLight_1', [4, 12, 4], [-55, 6, 0], t.fences, t.fencesMat),
    p('AmbientLightBall_1', [4, 4, 4], [-55, 13, 0], t.lights, 'Neon', { shape: 'Ball' }),
    p('AmbientLight_2', [4, 12, 4], [55, 6, 0], t.fences, t.fencesMat),
    p('AmbientLightBall_2', [4, 4, 4], [55, 13, 0], t.lights, 'Neon', { shape: 'Ball' }),
    p('AmbientLight_3', [4, 12, 4], [-55, 6, -50], t.fences, t.fencesMat),
    p('AmbientLightBall_3', [4, 4, 4], [-55, 13, -50], t.lights, 'Neon', { shape: 'Ball' }),
    p('AmbientLight_4', [4, 12, 4], [55, 6, -50], t.fences, t.fencesMat),
    p('AmbientLightBall_4', [4, 4, 4], [55, 13, -50], t.lights, 'Neon', { shape: 'Ball' }),

    // Gate frames — themed
    p('GateFrame_1a', [4, 16, 4], [65, 8, -12], t.machines, t.machinesMat),
    p('GateFrame_1b', [4, 16, 4], [65, 8, 12], t.machines, t.machinesMat),
    p('GateFrame_2a', [4, 16, 4], [-65, 8, -12], t.machines, t.machinesMat),
    p('GateFrame_2b', [4, 16, 4], [-65, 8, 12], t.machines, t.machinesMat),
    p('GateFrame_3a', [4, 16, 4], [-12, 8, -96], t.machines, t.machinesMat),
    p('GateFrame_3b', [4, 16, 4], [12, 8, -96], t.machines, t.machinesMat),

    // ══════════════════════════════════════════
    // TIER 1 HIDDEN — Startup ($50-$2500)
    // ══════════════════════════════════════════

    // #1: Speed Boost
    p('Upgrade_1', [6, 6, 6], [38, 3, -10], [0.15, 0.9, 0.15], 'Neon', { ...hidden, particles: { rate: 4, lifetime: 2, speed: 0.5, color: [0.2, 1, 0.2], size: 0.3, spread: 30 } }),
    p('UpgradeLabel_1', [6, 4, 4], [38, 7, -10], [0.1, 0.7, 0.1], 'SmoothPlastic', { ...hidden, billboard: { text: 'SPEED', color: [0.2, 1, 0.2], size: 5 } }),

    // #2: Belt Extension
    p('Conveyor_2', [6, 1, 20], [sx(0), 1, -55], [0.55, 0.55, 0.6], 'Metal', hidden),
    p('ConveyorSupport_3', [4, 4, 4], [-4, 2, -50], [0.35, 0.35, 0.38], 'Metal', hidden),
    p('ConveyorSupport_4', [4, 4, 4], [4, 2, -50], [0.35, 0.35, 0.38], 'Metal', hidden),

    // #3: Value Boost
    p('Upgrade_2', [6, 6, 6], [38, 3, -25], [0.15, 0.35, 1], 'Neon', { ...hidden, particles: { rate: 4, lifetime: 2, speed: 0.5, color: [0.2, 0.4, 1], size: 0.3, spread: 30 } }),
    p('UpgradeLabel_2', [6, 4, 4], [38, 7, -25], [0.1, 0.25, 0.8], 'SmoothPlastic', { ...hidden, billboard: { text: 'VALUE', color: [0.2, 0.4, 1], size: 5 } }),

    // #4: Crate Storage
    p('Crate_1', [5, 5, 5], [-25, 2.5, 15], [0.5, 0.35, 0.15], 'Wood', hidden),
    p('Crate_2', [5, 5, 5], [-20, 2.5, 18], [0.55, 0.38, 0.18], 'Wood', hidden),
    p('Crate_3', [4, 4, 4], [-22, 7, 16], [0.48, 0.33, 0.14], 'Wood', hidden),

    // #5: Workshop Walls
    p('WorkshopWall_1', [4, 10, 24], [-50, 5, -22], t.walls, t.wallsMat, hidden),
    p('WorkshopWall_2', [24, 10, 4], [-38, 5, -34], t.walls, t.wallsMat, hidden),

    // #6: Workshop Roof + Floor
    p('WorkshopRoof', [28, 1, 28], [-38, 10.5, -22], t.factory, t.factoryMat, hidden),
    p('WorkshopFloor', [24, 1, 24], [-38, 0.5, -22], t.factory, t.factoryMat, hidden),

    // #7: Tier Station
    p('Button_1', [6, 5, 6], [-35, 2.5, -10], [1, 0.85, 0.15], 'Neon', { ...hidden, particles: { rate: 5, lifetime: 2, speed: 0.8, color: [1, 0.9, 0.3], size: 0.35, spread: 35 } }),
    p('ButtonPedestal_1', [8, 1, 8], [-35, 0.5, -10], [0.4, 0.4, 0.42], 'Concrete', hidden),

    // #8: Capacity Boost
    p('Upgrade_3', [6, 6, 6], [38, 3, -40], [0.65, 0.15, 1], 'Neon', { ...hidden, particles: { rate: 4, lifetime: 2, speed: 0.5, color: [0.7, 0.2, 1], size: 0.3, spread: 30 } }),
    p('UpgradeLabel_3', [6, 4, 4], [38, 7, -40], [0.5, 0.1, 0.8], 'SmoothPlastic', { ...hidden, billboard: { text: 'CAPACITY', color: [0.7, 0.2, 1], size: 5 } }),

    // ══════════════════════════════════════════
    // TIER 2 HIDDEN — Factory ($4K-$50K)
    // ══════════════════════════════════════════

    // #9: Dropper 2
    p('Dropper_2', [10, 8, 10], [sx(15), 9, -20], [0.6, 0.55, 0.65], 'Metal', { ...hidden, particles: { rate: 8, lifetime: 1.5, speed: 2, color: t.dropParticle, size: 0.4, spread: 20 } }),
    p('DropperPipe_2', [4, 5, 4], [sx(15), 4, -20], [0.45, 0.4, 0.5], 'Metal', hidden),

    // #10: Upgrader x1.5
    p('Upgrader_1', [6, 4, 6], [sx(0), 2, -40], [0.3, 0.9, 0.5], 'Neon', { ...hidden, billboard: { text: 'x1.5', color: [0.3, 1, 0.5], size: 5, offset: [0, 4, 0] } }),
    p('UpgraderLabel_1', [6, 4, 4], [0, 5, -40], [0.2, 0.7, 0.4], 'SmoothPlastic', hidden),

    // #11: Factory Walls
    p('FactoryWall_1', [4, 14, 28], [-52, 7, -48], t.walls, t.wallsMat, hidden),
    p('FactoryWall_2', [30, 14, 4], [-36, 7, -62], t.walls, t.wallsMat, hidden),

    // #12: Factory Roof + Floor
    p('FactoryRoof', [34, 1, 32], [-36, 14.5, -48], t.factory, t.factoryMat, hidden),
    p('FactoryFloor', [30, 1, 28], [-36, 0.5, -48], t.factory, t.factoryMat, hidden),

    // #13: Lighting
    p('LightPost_1', [4, 16, 4], [28, 8, 20], [0.3, 0.3, 0.35], 'Metal', hidden),
    p('LightBall_1', [4, 4, 4], [28, 17, 20], t.lights, 'Neon', { ...hidden, shape: 'Ball' }),
    p('LightPost_2', [4, 16, 4], [-28, 8, 20], [0.3, 0.3, 0.35], 'Metal', hidden),
    p('LightBall_2', [4, 4, 4], [-28, 17, 20], t.lights, 'Neon', { ...hidden, shape: 'Ball' }),

    // #14: Machine Room
    p('Machine_1', [6, 8, 6], [38, 4, -52], t.machines, t.machinesMat, { ...hidden, particles: { rate: 3, lifetime: 2, speed: 0.5, color: [0.5, 0.5, 0.6], size: 0.3, spread: 20 } }),
    p('Machine_2', [6, 8, 6], [45, 4, -48], t.machines, t.machinesMat, hidden),
    p('MachinePedestal', [18, 1, 12], [42, 0.5, -50], [0.4, 0.4, 0.42], 'Concrete', hidden),

    // #15: Conveyor 3
    p('Conveyor_3', [6, 1, 14], [sx(0), 1, -70], [0.55, 0.55, 0.6], 'Metal', hidden),
    p('ConveyorSupport_5', [4, 4, 4], [-4, 2, -68], [0.35, 0.35, 0.38], 'Metal', hidden),
    p('ConveyorSupport_6', [4, 4, 4], [4, 2, -68], [0.35, 0.35, 0.38], 'Metal', hidden),

    // #16: Neon Sign
    p('NeonSign_1', [14, 8, 4], [-38, 16, -62], t.sign, 'Neon', { ...hidden, billboard: { text: t.factorySign, color: [1, 1, 1], size: 6, offset: [0, 4, 0] } }),

    // ══════════════════════════════════════════
    // TIER 3 HIDDEN — Empire ($75K-$800K)
    // ══════════════════════════════════════════

    // #17: Dropper 3
    p('Dropper_3', [10, 8, 10], [sx(-15), 9, -20], [0.65, 0.55, 0.7], 'Metal', { ...hidden, particles: { rate: 8, lifetime: 1.5, speed: 2, color: t.dropParticle, size: 0.4, spread: 20 } }),
    p('DropperPipe_3', [4, 5, 4], [sx(-15), 4, -20], [0.5, 0.4, 0.55], 'Metal', hidden),

    // #18: Upgrader x2
    p('Upgrader_2', [6, 4, 6], [sx(0), 2, -54], [0.9, 0.6, 0.1], 'Neon', { ...hidden, billboard: { text: 'x2.0', color: [1, 0.7, 0.1], size: 5, offset: [0, 4, 0] } }),
    p('UpgraderLabel_2', [6, 4, 4], [0, 5, -54], [0.7, 0.5, 0.1], 'SmoothPlastic', hidden),

    // #19: Area 1 Gate
    p('Gate_1', [4, 14, 28], [65, 7, 0], [0.5, 0.2, 0.2], 'Metal', hidden),
    p('ExpansionPlot_1', [60, 1, 60], [100, 0, 0], [0.5, 0.5, 0.55], 'Concrete', hidden),

    // #20: Trophy Display
    p('Trophy_1', [4, 10, 4], [45, 5, 25], [1, 0.85, 0.2], 'Neon', { ...hidden, shape: 'Ball', particles: { rate: 6, lifetime: 2, speed: 0.5, color: [1, 0.9, 0.3], size: 0.3, spread: 30 } }),
    p('TrophyPedestal_1', [8, 2, 8], [45, 1, 25], [0.4, 0.35, 0.3], 'Marble', hidden),

    // #21: Warehouse
    p('WarehouseWall_1', [4, 12, 24], [50, 6, -30], t.walls, t.wallsMat, hidden),
    p('WarehouseWall_2', [24, 12, 4], [38, 6, -42], t.walls, t.wallsMat, hidden),
    p('WarehouseRoof', [28, 1, 28], [38, 12.5, -30], t.factory, t.factoryMat, hidden),
    p('WarehouseFloor', [24, 1, 24], [38, 0.5, -30], t.factory, t.factoryMat, hidden),

    // #22: Auto Collector 2
    p('Collector_2', [12, 5, 12], [sx(0), 2.5, -90], [0.2, 0.8, 0.3], 'SmoothPlastic', { ...hidden, particles: { rate: 8, lifetime: 2, speed: 1, color: [0.5, 1, 0.5], size: 0.35, spread: 35 } }),

    // #23: Garden
    p('Plant_1', [5, 8, 5], [-28, 4, 32], [0.2, 0.7, 0.15], 'Grass', { ...hidden, shape: 'Ball' }),
    p('Plant_2', [4, 6, 4], [-22, 3, 28], [0.25, 0.65, 0.2], 'Grass', { ...hidden, shape: 'Ball' }),
    p('Fountain', [8, 4, 8], [-25, 2, 35], [0.4, 0.6, 0.8], 'Marble', { ...hidden, particles: { rate: 15, lifetime: 2, speed: 3, color: [0.5, 0.7, 1], size: 0.3, spread: 40 } }),

    // #24: Rebirth Altar
    p('RebirthPlatform', [16, 2, 16], [0, 1, 45], [0.5, 0.4, 0.15], 'Marble', hidden),
    p('RebirthButton', [8, 8, 8], [0, 6, 45], [1, 0.85, 0.25], 'Neon', { ...hidden, particles: { rate: 10, lifetime: 3, speed: 1, color: [1, 0.9, 0.3], size: 0.5, spread: 50 } }),

    // ══════════════════════════════════════════
    // TIER 4 HIDDEN — Endgame ($1.2M-$8M)
    // ══════════════════════════════════════════

    // #25: Upgrader x3
    p('Upgrader_3', [6, 4, 6], [sx(0), 2, -62], [1, 0.2, 0.2], 'Neon', { ...hidden, billboard: { text: 'x3.0', color: [1, 0.3, 0.3], size: 5, offset: [0, 4, 0] } }),
    p('UpgraderLabel_3', [6, 4, 4], [0, 5, -62], [0.8, 0.15, 0.15], 'SmoothPlastic', hidden),

    // #26: Area 2 Gate
    p('Gate_2', [4, 14, 28], [-65, 7, 0], [0.5, 0.2, 0.2], 'Metal', hidden),
    p('ExpansionPlot_2', [60, 1, 60], [-100, 0, 0], [0.5, 0.5, 0.55], 'Concrete', hidden),

    // #27: Dropper 4
    p('Dropper_4', [10, 8, 10], [sx(-15), 9, -30], [0.7, 0.6, 0.75], 'Metal', { ...hidden, particles: { rate: 10, lifetime: 1.5, speed: 3, color: [1, 1, 1], size: 0.5, spread: 25 } }),
    p('DropperPipe_4', [4, 5, 4], [sx(-15), 4, -30], [0.55, 0.45, 0.6], 'Metal', hidden),

    // #28: Golden Monument
    p('Monument', [6, 16, 6], [0, 8, 25], [1, 0.85, 0.15], 'Neon', { ...hidden, particles: { rate: 15, lifetime: 3, speed: 1.5, color: [1, 0.9, 0.3], size: 0.5, spread: 40 } }),
    p('MonumentBase', [12, 2, 12], [0, 1, 25], [0.45, 0.4, 0.3], 'Marble', hidden),

    // #29: Area 3 Gate
    p('Gate_3', [28, 14, 4], [0, 7, -96], [0.5, 0.2, 0.2], 'Metal', hidden),
    p('ExpansionPlot_3', [60, 1, 60], [0, 0, -130], [0.5, 0.5, 0.55], 'Concrete', hidden),

    // #30: Victory Crown
    p('Crown', [6, 6, 6], [0, 10, 15], [1, 0.9, 0.2], 'Neon', { ...hidden, shape: 'Ball', particles: { rate: 20, lifetime: 3, speed: 2, color: [1, 1, 0.5], size: 0.5, spread: 50 } }),
    p('CrownPedestal', [10, 4, 10], [0, 2, 15], [0.5, 0.45, 0.35], 'Marble', hidden),

    // Shop sign (always visible)
    p('ShopSign', [12, 8, 4], [-36, 16, -62], t.sign, 'Neon'),
  ];

  // ── Add 30 BuyPads ──
  for (const [order, price, x, z] of buyPadDefs) {
    const color = padColors[order - 1] || padColors[0];
    const label = t.purchaseLabels[order - 1] || `Item ${order}`;
    parts.push(p(
      `BuyPad_${String(order).padStart(2, '0')}_${price}`,
      [8, 1, 8], [x, 0.25, z], color, 'Neon',
      { ...hidden, canCollide: false, billboard: { text: `${label} - $${price.toLocaleString()}`, color: [1, 1, 1], size: 5, offset: [0, 3, 0] } }
    ));
  }

  // Inject theme-specific decorative parts
  for (const dp of t.decorParts) {
    parts.push(p(dp.name, dp.size, dp.pos, dp.color, dp.mat, dp.extra));
  }

  // ── Compound themed structures (always visible) ──
  // Each theme gets rich multi-part buildings, rivers, trees etc.
  const C = t.name.toLowerCase();
  if (C === 'food') {
    // Pizza oven (box + chimney cylinder + smoke particles + door)
    parts.push(p('Oven_Base', [12, 8, 10], [mx(48), 4, -15], [0.6, 0.35, 0.2], 'Brick'));
    parts.push(p('Oven_Chimney', [4, 10, 4], [mx(50), 13, -15], [0.5, 0.3, 0.18], 'Brick', { shape: 'Cylinder', particles: { rate: 8, lifetime: 3, speed: 2, color: [0.7, 0.7, 0.7], size: 0.6, spread: 15 } }));
    parts.push(p('Oven_Door', [6, 5, 1], [mx(42), 2.5, -15], [0.2, 0.2, 0.2], 'Metal'));
    parts.push(p('Oven_Fire', [8, 1, 6], [mx(48), 0.5, -15], [1, 0.4, 0.1], 'Neon', { particles: { rate: 12, lifetime: 1, speed: 1.5, color: [1, 0.5, 0.1], size: 0.4, spread: 20 } }));
    // Kitchen counter with plates
    parts.push(p('Counter_1', [16, 4, 6], [mx(-48), 2, 30], [0.7, 0.5, 0.35], 'Wood'));
    parts.push(p('Counter_Top', [16, 0.5, 6], [mx(-48), 4.25, 30], [0.9, 0.85, 0.8], 'Marble'));
    parts.push(p('Plate_1', [2, 0.3, 2], [mx(-45), 4.5, 30], [0.95, 0.95, 0.95], 'SmoothPlastic', { shape: 'Cylinder' }));
    parts.push(p('Plate_2', [2, 0.3, 2], [mx(-51), 4.5, 30], [0.95, 0.95, 0.95], 'SmoothPlastic', { shape: 'Cylinder' }));
    // Dining table
    parts.push(p('Table_1', [10, 3, 8], [mx(48), 1.5, 35], [0.55, 0.35, 0.2], 'Wood'));
    parts.push(p('Table_Top1', [12, 0.5, 10], [mx(48), 3.25, 35], [0.65, 0.45, 0.25], 'Wood'));
  } else if (C === 'candy') {
    // Chocolate river (flat brown parts + particles)
    parts.push(p('River_1', [8, 0.5, 50], [mx(30), 0.25, -30], [0.35, 0.18, 0.08], 'SmoothPlastic', { transparency: 0.3 as number, particles: { rate: 10, lifetime: 2, speed: 0.5, color: [0.4, 0.2, 0.1], size: 0.3, spread: 10 } }));
    parts.push(p('River_2', [8, 0.5, 30], [mx(35), 0.25, 10], [0.38, 0.2, 0.1], 'SmoothPlastic', { transparency: 0.3 as number }));
    // Lollipop trees (cylinder + ball top)
    parts.push(p('Lolli_Stem1', [2, 12, 2], [mx(-48), 6, -20], [0.9, 0.3, 0.5], 'SmoothPlastic', { shape: 'Cylinder' }));
    parts.push(p('Lolli_Top1', [6, 6, 6], [mx(-48), 13, -20], [1, 0.4, 0.6], 'SmoothPlastic', { shape: 'Ball' }));
    parts.push(p('Lolli_Stem2', [2, 10, 2], [mx(-42), 5, 15], [0.3, 0.9, 0.5], 'SmoothPlastic', { shape: 'Cylinder' }));
    parts.push(p('Lolli_Top2', [5, 5, 5], [mx(-42), 11, 15], [0.4, 1, 0.6], 'SmoothPlastic', { shape: 'Ball' }));
    // Cupcake tower (cylinder + ball frosting)
    parts.push(p('Cupcake_Base', [8, 6, 8], [mx(48), 3, 25], [0.7, 0.5, 0.3], 'SmoothPlastic', { shape: 'Cylinder' }));
    parts.push(p('Cupcake_Frost', [9, 5, 9], [mx(48), 8, 25], [1, 0.7, 0.8], 'SmoothPlastic', { shape: 'Ball' }));
    parts.push(p('Cupcake_Cherry', [3, 3, 3], [mx(48), 11, 25], [0.9, 0.15, 0.15], 'SmoothPlastic', { shape: 'Ball' }));
    // Candy cane pole
    parts.push(p('CandyCane_1', [2, 16, 2], [mx(48), 8, -30], [0.9, 0.2, 0.2], 'SmoothPlastic', { shape: 'Cylinder' }));
    parts.push(p('CandyCane_Top', [4, 4, 4], [mx(48), 17, -30], [1, 1, 1], 'SmoothPlastic', { shape: 'Ball' }));
  } else if (C === 'space') {
    // Satellite dish (flat cylinder on tall pole)
    parts.push(p('Sat_Pole', [2, 20, 2], [mx(48), 10, -10], [0.25, 0.2, 0.4], 'Metal', { shape: 'Cylinder' }));
    parts.push(p('Sat_Dish', [14, 1, 14], [mx(48), 21, -10], [0.3, 0.25, 0.45], 'Metal', { shape: 'Cylinder' }));
    // Reactor core (glowing ball + ring + particles)
    parts.push(p('Reactor_Core', [8, 8, 8], [mx(-48), 8, 0], [0.5, 0.4, 1], 'Neon', { shape: 'Ball', particles: { rate: 15, lifetime: 3, speed: 1, color: [0.4, 0.3, 1], size: 0.5, spread: 50 } }));
    parts.push(p('Reactor_Ring', [14, 1, 14], [mx(-48), 8, 0], [0.3, 0.2, 0.8], 'Neon', { shape: 'Cylinder' }));
    parts.push(p('Reactor_Base', [10, 4, 10], [mx(-48), 2, 0], [0.15, 0.12, 0.25], 'Metal'));
    // Solar panels
    parts.push(p('Solar_1', [12, 0.5, 8], [mx(-40), 10, 30], [0.15, 0.15, 0.5], 'SmoothPlastic'));
    parts.push(p('Solar_Pole1', [2, 10, 2], [mx(-40), 5, 30], [0.3, 0.3, 0.35], 'Metal'));
    parts.push(p('Solar_2', [12, 0.5, 8], [mx(40), 12, 30], [0.15, 0.15, 0.5], 'SmoothPlastic'));
    parts.push(p('Solar_Pole2', [2, 12, 2], [mx(40), 6, 30], [0.3, 0.3, 0.35], 'Metal'));
  } else if (C === 'military') {
    // Watch tower (4 legs + platform + roof)
    parts.push(p('Tower_Leg1', [2, 18, 2], [mx(46), 9, -8], [0.3, 0.33, 0.28], 'Metal'));
    parts.push(p('Tower_Leg2', [2, 18, 2], [mx(50), 9, -8], [0.3, 0.33, 0.28], 'Metal'));
    parts.push(p('Tower_Leg3', [2, 18, 2], [mx(46), 9, -12], [0.3, 0.33, 0.28], 'Metal'));
    parts.push(p('Tower_Leg4', [2, 18, 2], [mx(50), 9, -12], [0.3, 0.33, 0.28], 'Metal'));
    parts.push(p('Tower_Platform', [8, 1, 8], [mx(48), 18, -10], [0.35, 0.38, 0.3], 'Metal'));
    parts.push(p('Tower_Railing', [8, 2, 1], [mx(48), 19.5, -6], [0.3, 0.33, 0.28], 'Metal'));
    // Sandbag walls
    parts.push(p('Sandbag_1', [16, 3, 4], [mx(-48), 1.5, -10], [0.45, 0.4, 0.3], 'Slate'));
    parts.push(p('Sandbag_2', [4, 3, 12], [mx(-40), 1.5, -16], [0.45, 0.4, 0.3], 'Slate'));
    // Radar
    parts.push(p('Radar_Base', [6, 8, 6], [mx(-48), 4, 20], [0.32, 0.35, 0.28], 'Metal'));
    parts.push(p('Radar_Dish', [10, 1, 10], [mx(-48), 9, 20], [0.35, 0.38, 0.3], 'Metal', { shape: 'Cylinder' }));
  } else if (C === 'nature') {
    // Trees (cylinder trunk + ball crown)
    parts.push(p('Tree_Trunk1', [2, 12, 2], [mx(48), 6, -10], [0.4, 0.3, 0.18], 'Wood', { shape: 'Cylinder' }));
    parts.push(p('Tree_Crown1', [10, 8, 10], [mx(48), 14, -10], [0.2, 0.65, 0.15], 'Grass', { shape: 'Ball' }));
    parts.push(p('Tree_Trunk2', [2, 10, 2], [mx(42), 5, 20], [0.38, 0.28, 0.16], 'Wood', { shape: 'Cylinder' }));
    parts.push(p('Tree_Crown2', [8, 7, 8], [mx(42), 12, 20], [0.25, 0.6, 0.2], 'Grass', { shape: 'Ball' }));
    // Pond
    parts.push(p('Pond', [16, 0.5, 12], [mx(-48), 0.25, 10], [0.3, 0.5, 0.7], 'SmoothPlastic', { transparency: 0.4 as number, particles: { rate: 5, lifetime: 3, speed: 0.3, color: [0.5, 0.7, 1], size: 0.3, spread: 20 } }));
    // Flower bed
    parts.push(p('FlowerBed', [12, 1, 8], [mx(-48), 0.5, 30], [0.35, 0.5, 0.25], 'Grass'));
    parts.push(p('Flower_1', [2, 3, 2], [mx(-45), 2, 30], [1, 0.4, 0.5], 'SmoothPlastic', { shape: 'Ball' }));
    parts.push(p('Flower_2', [2, 3, 2], [mx(-51), 2, 30], [1, 0.9, 0.3], 'SmoothPlastic', { shape: 'Ball' }));
    parts.push(p('Flower_3', [2, 3, 2], [mx(-48), 2, 33], [0.6, 0.3, 1], 'SmoothPlastic', { shape: 'Ball' }));
  } else if (C === 'medieval') {
    // Castle tower with battlements
    parts.push(p('CastleTower', [8, 22, 8], [mx(48), 11, -10], [0.45, 0.4, 0.35], 'Brick'));
    parts.push(p('Tower_Top', [10, 2, 10], [mx(48), 22, -10], [0.45, 0.4, 0.35], 'Brick'));
    parts.push(p('Battlement1', [2, 3, 2], [mx(45), 24, -7], [0.45, 0.4, 0.35], 'Brick'));
    parts.push(p('Battlement2', [2, 3, 2], [mx(51), 24, -7], [0.45, 0.4, 0.35], 'Brick'));
    parts.push(p('Battlement3', [2, 3, 2], [mx(45), 24, -13], [0.45, 0.4, 0.35], 'Brick'));
    parts.push(p('Battlement4', [2, 3, 2], [mx(51), 24, -13], [0.45, 0.4, 0.35], 'Brick'));
    // Well
    parts.push(p('Well_Base', [6, 3, 6], [mx(-48), 1.5, 15], [0.4, 0.38, 0.35], 'Cobblestone', { shape: 'Cylinder' }));
    parts.push(p('Well_Water', [4, 0.5, 4], [mx(-48), 1, 15], [0.3, 0.5, 0.8], 'SmoothPlastic', { shape: 'Cylinder', transparency: 0.3 as number, particles: { rate: 3, lifetime: 2, speed: 0.5, color: [0.5, 0.7, 1], size: 0.2, spread: 10 } }));
    // Torch poles
    parts.push(p('Torch_Pole1', [1, 8, 1], [mx(-42), 4, -20], [0.3, 0.25, 0.18], 'Wood'));
    parts.push(p('Torch_Fire1', [2, 2, 2], [mx(-42), 9, -20], [1, 0.6, 0.1], 'Neon', { shape: 'Ball', particles: { rate: 8, lifetime: 1, speed: 1.5, color: [1, 0.5, 0.1], size: 0.3, spread: 15 } }));
    parts.push(p('Torch_Pole2', [1, 8, 1], [mx(-54), 4, -20], [0.3, 0.25, 0.18], 'Wood'));
    parts.push(p('Torch_Fire2', [2, 2, 2], [mx(-54), 9, -20], [1, 0.6, 0.1], 'Neon', { shape: 'Ball', particles: { rate: 8, lifetime: 1, speed: 1.5, color: [1, 0.5, 0.1], size: 0.3, spread: 15 } }));
  } else if (C === 'tech') {
    // Server rack room
    parts.push(p('Server_1', [4, 12, 6], [mx(46), 6, -10], [0.25, 0.28, 0.35], 'Metal'));
    parts.push(p('Server_2', [4, 12, 6], [mx(51), 6, -10], [0.28, 0.3, 0.38], 'Metal'));
    parts.push(p('Server_LED1', [3, 1, 1], [mx(44), 10, -7], [0, 1, 0.5], 'Neon'));
    parts.push(p('Server_LED2', [3, 1, 1], [mx(49), 8, -7], [0, 0.8, 1], 'Neon'));
    // Holographic display
    parts.push(p('Holo_Base', [8, 2, 8], [mx(-48), 1, 10], [0.3, 0.33, 0.4], 'Metal'));
    parts.push(p('Holo_Screen', [10, 8, 1], [mx(-48), 7, 10], [0.2, 0.5, 1], 'Neon', { transparency: 0.4 as number }));
    // Data cables (colored lines)
    parts.push(p('Cable_1', [1, 1, 40], [mx(44), 0.5, -30], [0, 0.8, 1], 'Neon'));
    parts.push(p('Cable_2', [1, 1, 40], [mx(52), 0.5, -30], [0, 1, 0.5], 'Neon'));
  } else if (C === 'mining') {
    // Crystal cluster
    parts.push(p('Crystal_1', [4, 14, 4], [mx(48), 7, -10], [0.9, 0.6, 0.15], 'Neon', { shape: 'Cylinder', particles: { rate: 5, lifetime: 3, speed: 0.3, color: [0.9, 0.65, 0.2], size: 0.3, spread: 15 } }));
    parts.push(p('Crystal_2', [3, 10, 3], [mx(45), 5, -8], [0.8, 0.5, 0.9], 'Neon', { shape: 'Cylinder' }));
    parts.push(p('Crystal_3', [3, 8, 3], [mx(51), 4, -12], [0.4, 0.85, 1], 'Neon', { shape: 'Cylinder' }));
    // Mine cart on tracks
    parts.push(p('Track_1', [2, 0.5, 30], [mx(-47), 0.25, -15], [0.35, 0.3, 0.22], 'Metal'));
    parts.push(p('Track_2', [2, 0.5, 30], [mx(-51), 0.25, -15], [0.35, 0.3, 0.22], 'Metal'));
    parts.push(p('Cart_Body', [6, 3, 4], [mx(-49), 2, -5], [0.4, 0.35, 0.25], 'Metal'));
    parts.push(p('Cart_Wheel1', [1, 2, 2], [mx(-47), 1, -5], [0.3, 0.3, 0.3], 'Metal', { shape: 'Cylinder' }));
    parts.push(p('Cart_Wheel2', [1, 2, 2], [mx(-51), 1, -5], [0.3, 0.3, 0.3], 'Metal', { shape: 'Cylinder' }));
    // Boulder pile
    parts.push(p('Boulder_1', [8, 6, 8], [mx(48), 3, 25], [0.3, 0.25, 0.2], 'Granite', { shape: 'Ball' }));
    parts.push(p('Boulder_2', [5, 4, 5], [mx(44), 2, 28], [0.35, 0.28, 0.22], 'Granite', { shape: 'Ball' }));
  } else if (C === 'meme') {
    // Giant neon screen
    parts.push(p('Screen', [16, 10, 1], [mx(48), 8, -10], [0, 1, 1], 'Neon', { transparency: 0.2 as number }));
    parts.push(p('Screen_Frame', [18, 12, 2], [mx(48), 8, -11], [0.12, 0.1, 0.18], 'SmoothPlastic'));
    // Speaker towers
    parts.push(p('Speaker_1', [6, 10, 6], [mx(-48), 5, -10], [0.8, 0.1, 0.8], 'Neon', { shape: 'Cylinder', particles: { rate: 10, lifetime: 1, speed: 3, color: [1, 0, 1], size: 0.5, spread: 50 } }));
    parts.push(p('Speaker_2', [6, 8, 6], [mx(-42), 4, 10], [0, 1, 1], 'Neon', { shape: 'Cylinder' }));
    // Neon rings
    parts.push(p('Ring_1', [12, 1, 12], [mx(48), 15, -10], [1, 0, 0.8], 'Neon', { shape: 'Cylinder' }));
    parts.push(p('Ring_2', [8, 1, 8], [mx(-48), 12, -10], [1, 1, 0], 'Neon', { shape: 'Cylinder' }));
    // Dance floor
    parts.push(p('DanceFloor', [20, 0.3, 20], [mx(0), 0.15, 35], [0.1, 0.1, 0.15], 'SmoothPlastic'));
    parts.push(p('DanceNeon1', [4, 0.2, 20], [mx(-6), 0.2, 35], [1, 0, 1], 'Neon'));
    parts.push(p('DanceNeon2', [4, 0.2, 20], [mx(6), 0.2, 35], [0, 1, 1], 'Neon'));
  }
  // Default theme gets no extra compounds (already has generic buildings)

  // ── Interactive stations with ProximityPrompt ──
  parts.push(p('Station_Speed', [6, 4, 6], [mx(25), 2, 50], t.lights, 'Neon', {
    billboard: { text: 'SPEED BOOST', color: [0.2, 1, 0.2], size: 4, offset: [0, 4, 0] },
    prompt: { actionText: 'Boost Speed', objectText: 'Speed Station', holdDuration: 0.5, maxDistance: 10 },
  }));
  parts.push(p('Station_Bonus', [6, 4, 6], [sx(0), 2, -88], t.lights, 'Neon', {
    billboard: { text: 'BONUS $$$', color: [1, 0.9, 0.2], size: 4, offset: [0, 4, 0] },
    prompt: { actionText: 'Collect Bonus', objectText: 'Bonus Station', holdDuration: 1, maxDistance: 10 },
  }));
  parts.push(p('Station_Info', [8, 5, 4], [mx(-25), 2.5, 55], t.sign, 'Neon', {
    billboard: { text: 'INFO', color: [1, 1, 1], size: 4, offset: [0, 4, 0] },
    prompt: { actionText: 'View Stats', objectText: 'Info Board', holdDuration: 0, maxDistance: 12 },
  }));

  // ── NPCs ──
  // Y=4: R15 HumanoidRootPart pivot ~2.5 studs above feet → feet land at ~Y=1.5,
  // safely above TycoonBase top (Y=0.5). Y=0 caused "partially underground" NPCs.
  const npcPositions: [number, number, number][] = [
    [5, 4, 60],          // NPC 1 near spawn
    [mx(40), 4, -20],    // NPC 2 near factory
    [mx(-40), 4, 10],    // NPC 3 near shop area
    [mx(30), 4, 30],     // NPC 4 quest giver
  ];
  const npcs = t.npcNames.map((name, i) => ({
    name: 'NPC_' + name.replace(/\s+/g, '_'),
    position: npcPositions[i] || [0, 4, 0],
    role: i === 3 ? 'quest' : i === 2 ? 'shop' : 'worker',
    dialog: i === 3 ? 'I have a task for you!' : i === 2 ? 'Need supplies?' : 'Welcome!',
  }));

  return {
    parts,
    spawns: [{ name: 'MainSpawn', position: [0, 2, 70] }],
    npcs,
    // NOTE: no `terrain` field — runtime TerrainGenerator would fill Workspace.Terrain
    // with grass at Y≥1 and visually cover TycoonBase (top at Y=0.5). The TycoonBase
    // part IS the floor of the tycoon. Biome color/mood is conveyed via theme.baseMat/base.
    lighting: {
      clockTime: t.clockTime, ambient: t.ambient, brightness: t.brightness, fogEnd: t.fogEnd,
      fogColor: t.fogColor, outdoorAmbient: t.outdoorAmbient,
      atmosphere: { density: t.atmoD, offset: t.atmoOff, color: t.atmoColor, decay: t.atmoDecay, haze: t.atmoHaze },
      postEffects: { bloomIntensity: t.bloomI, bloomSize: t.bloomS, bloomThreshold: t.bloomT, ccBrightness: t.ccB, ccContrast: t.ccC, ccSaturation: t.ccS, ccTintColor: t.ccTint },
    },
  };
}

export function buildSimulatorSceneTemplate(): SceneTemplate {
  const parts: ScenePart[] = [
    // ═══════════════════════════════════════
    // BASE WORLD — large green island
    // ═══════════════════════════════════════
    p('WorldBase', [250, 2, 250], [0, -1, 30], [0.3, 0.6, 0.25], 'Grass'),
    p('WorldEdge_N', [254, 6, 2], [0, 2, -96], [0.45, 0.35, 0.2], 'Wood'),
    p('WorldEdge_S', [254, 6, 2], [0, 2, 156], [0.45, 0.35, 0.2], 'Wood'),
    p('WorldEdge_W', [2, 6, 254], [-127, 2, 30], [0.45, 0.35, 0.2], 'Wood'),
    p('WorldEdge_E', [2, 6, 254], [127, 2, 30], [0.45, 0.35, 0.2], 'Wood'),

    // ═══════════════════════════════════════
    // SPAWN AREA — welcome plaza
    // ═══════════════════════════════════════
    p('SpawnPlatform', [24, 1, 24], [0, 0, -50], [0.9, 0.9, 0.95], 'Marble'),
    p('SpawnSign', [1, 8, 14], [0, 5, -63], [0.2, 0.5, 1], 'Neon', {
      billboard: { text: 'PET SIMULATOR', color: [1, 1, 1], size: 8, offset: [0, 4, 0] },
    }),
    p('SpawnSign_Sub', [1, 4, 10], [0, 1, -63], [0.15, 0.4, 0.85], 'SmoothPlastic', {
      billboard: { text: 'Tap zones to collect! Sell for coins!', color: [1, 1, 0.7], size: 6, offset: [0, 2, 0] },
    }),

    // ═══════════════════════════════════════
    // ZONE 1 — Meadow (starter, easy)
    // ═══════════════════════════════════════
    p('CollectZone_1', [50, 0.5, 50], [0, 0, 20], [0.35, 0.75, 0.3], 'Grass', {
      billboard: { text: 'MEADOW ZONE', color: [0.5, 1, 0.5], size: 6, offset: [0, 8, 0] },
      prompt: { actionText: 'Collect', objectText: 'Meadow Zone', maxDistance: 15 },
      particles: { rate: 8, lifetime: 3, speed: 0.5, color: [1, 1, 0.5], size: 0.4, spread: 50 },
    }),
    // Zone 1 resources — collectible-looking objects
    p('Z1_Coin_1', [2, 2, 2], [-12, 1.5, 15], [1, 0.85, 0], 'Neon', { shape: 'Cylinder', particles: { rate: 3, lifetime: 1.5, speed: 0.3, color: [1, 1, 0.5], size: 0.2, spread: 20 } }),
    p('Z1_Coin_2', [2, 2, 2], [8, 1.5, 28], [1, 0.85, 0], 'Neon', { shape: 'Cylinder', particles: { rate: 3, lifetime: 1.5, speed: 0.3, color: [1, 1, 0.5], size: 0.2, spread: 20 } }),
    p('Z1_Coin_3', [2, 2, 2], [-5, 1.5, 35], [1, 0.85, 0], 'Neon', { shape: 'Cylinder', particles: { rate: 3, lifetime: 1.5, speed: 0.3, color: [1, 1, 0.5], size: 0.2, spread: 20 } }),
    p('Z1_Coin_4', [2, 2, 2], [15, 1.5, 10], [1, 0.85, 0], 'Neon', { shape: 'Cylinder', particles: { rate: 3, lifetime: 1.5, speed: 0.3, color: [1, 1, 0.5], size: 0.2, spread: 20 } }),
    p('Z1_Gem_1', [3, 3, 3], [0, 2, 22], [0.3, 1, 0.5], 'Neon', { shape: 'Ball', particles: { rate: 4, lifetime: 2, speed: 0.4, color: [0.5, 1, 0.7], size: 0.25, spread: 25 } }),
    // Zone 1 trees
    p('Z1_Tree_1', [3, 14, 3], [18, 7, 32], [0.4, 0.28, 0.12], 'Wood'),
    p('Z1_Canopy_1', [10, 8, 10], [18, 15, 32], [0.2, 0.6, 0.18], 'Grass', { shape: 'Ball' }),
    p('Z1_Tree_2', [3, 12, 3], [-15, 6, 10], [0.4, 0.28, 0.12], 'Wood'),
    p('Z1_Canopy_2', [9, 7, 9], [-15, 13, 10], [0.22, 0.62, 0.2], 'Grass', { shape: 'Ball' }),
    p('Z1_Tree_3', [3, 11, 3], [10, 5.5, 42], [0.4, 0.28, 0.12], 'Wood'),
    p('Z1_Canopy_3', [8, 7, 8], [10, 12, 42], [0.25, 0.65, 0.22], 'Grass', { shape: 'Ball' }),
    p('Z1_Rock_1', [6, 4, 5], [-18, 2, 30], [0.5, 0.48, 0.45], 'Slate', { shape: 'Ball' }),
    p('Z1_Rock_2', [4, 3, 5], [20, 1.5, 18], [0.55, 0.5, 0.48], 'Slate', { shape: 'Ball' }),
    // Zone 1 border flowers
    p('Z1_Flower_1', [2, 1.5, 2], [-22, 0.75, 20], [1, 0.4, 0.6], 'SmoothPlastic', { shape: 'Ball' }),
    p('Z1_Flower_2', [2, 1.5, 2], [22, 0.75, 35], [1, 0.8, 0.3], 'SmoothPlastic', { shape: 'Ball' }),
    p('Z1_Flower_3', [2, 1.5, 2], [5, 0.75, 44], [0.6, 0.4, 1], 'SmoothPlastic', { shape: 'Ball' }),

    // ═══════════════════════════════════════
    // ZONE 2 — Crystal Cave (medium)
    // ═══════════════════════════════════════
    // Gate/arch entrance
    p('Z2_Gate_L', [4, 16, 4], [55, 8, 10], [0.3, 0.45, 0.7], 'Concrete'),
    p('Z2_Gate_R', [4, 16, 4], [55, 8, 30], [0.3, 0.45, 0.7], 'Concrete'),
    p('Z2_Gate_Top', [4, 4, 24], [55, 18, 20], [0.35, 0.5, 0.75], 'Concrete', {
      billboard: { text: 'CRYSTAL CAVE', color: [0.6, 0.8, 1], size: 5, offset: [0, 4, 0] },
    }),

    p('CollectZone_2', [45, 0.5, 45], [80, 0, 20], [0.25, 0.35, 0.55], 'Slate', {
      prompt: { actionText: 'Collect', objectText: 'Crystal Cave', maxDistance: 15 },
      particles: { rate: 10, lifetime: 3, speed: 0.8, color: [0.5, 0.7, 1], size: 0.35, spread: 45 },
    }),
    // Crystal resources
    p('Z2_Crystal_1', [3, 8, 3], [72, 4, 15], [0.4, 0.6, 1], 'Neon', { particles: { rate: 5, lifetime: 2, speed: 0.3, color: [0.5, 0.7, 1], size: 0.3, spread: 20 } }),
    p('Z2_Crystal_2', [2, 6, 2], [88, 3, 25], [0.5, 0.4, 1], 'Neon', { particles: { rate: 4, lifetime: 2, speed: 0.3, color: [0.6, 0.5, 1], size: 0.25, spread: 20 } }),
    p('Z2_Crystal_3', [4, 10, 4], [75, 5, 35], [0.35, 0.55, 0.95], 'Neon', { particles: { rate: 6, lifetime: 2, speed: 0.4, color: [0.4, 0.6, 1], size: 0.3, spread: 25 } }),
    p('Z2_Crystal_4', [2, 5, 2], [90, 2.5, 12], [0.6, 0.7, 1], 'Neon', { particles: { rate: 3, lifetime: 1.5, speed: 0.3, color: [0.7, 0.8, 1], size: 0.2, spread: 15 } }),
    p('Z2_Crystal_5', [3, 7, 3], [65, 3.5, 28], [0.3, 0.5, 0.9], 'Neon', { particles: { rate: 4, lifetime: 2, speed: 0.3, color: [0.4, 0.6, 1], size: 0.25, spread: 20 } }),
    // Cave walls
    p('Z2_Wall_1', [2, 12, 45], [57, 6, 20], [0.3, 0.3, 0.4], 'Slate'),
    p('Z2_Wall_2', [2, 12, 45], [103, 6, 20], [0.3, 0.3, 0.4], 'Slate'),
    p('Z2_Stalagmite_1', [4, 8, 4], [95, 4, 38], [0.35, 0.35, 0.42], 'Slate', { shape: 'Ball' }),
    p('Z2_Stalagmite_2', [3, 6, 3], [68, 3, 8], [0.32, 0.32, 0.4], 'Slate', { shape: 'Ball' }),

    // ═══════════════════════════════════════
    // ZONE 3 — Lava Islands (hard)
    // ═══════════════════════════════════════
    p('Z3_Gate_L', [4, 18, 4], [118, 9, 10], [0.6, 0.2, 0.1], 'Concrete'),
    p('Z3_Gate_R', [4, 18, 4], [118, 9, 30], [0.6, 0.2, 0.1], 'Concrete'),
    p('Z3_Gate_Top', [4, 4, 24], [118, 20, 20], [0.7, 0.25, 0.1], 'Concrete', {
      billboard: { text: 'LAVA ISLANDS', color: [1, 0.5, 0.2], size: 5, offset: [0, 4, 0] },
    }),

    p('CollectZone_3', [45, 0.5, 45], [145, 0, 20], [0.45, 0.2, 0.1], 'Slate', {
      prompt: { actionText: 'Collect', objectText: 'Lava Islands', maxDistance: 15 },
      particles: { rate: 12, lifetime: 3, speed: 1, color: [1, 0.5, 0.2], size: 0.4, spread: 50 },
    }),
    // Lava resources
    p('Z3_LavaGem_1', [3, 6, 3], [138, 3, 15], [1, 0.3, 0.05], 'Neon', { particles: { rate: 6, lifetime: 2, speed: 0.5, color: [1, 0.4, 0.1], size: 0.3, spread: 25 } }),
    p('Z3_LavaGem_2', [4, 8, 4], [152, 4, 30], [1, 0.5, 0], 'Neon', { particles: { rate: 7, lifetime: 2, speed: 0.5, color: [1, 0.6, 0.1], size: 0.35, spread: 30 } }),
    p('Z3_LavaGem_3', [3, 5, 3], [140, 2.5, 35], [0.9, 0.2, 0], 'Neon', { particles: { rate: 5, lifetime: 2, speed: 0.4, color: [1, 0.3, 0], size: 0.25, spread: 20 } }),
    p('Z3_LavaGem_4', [2, 4, 2], [160, 2, 18], [1, 0.6, 0.1], 'Neon', { particles: { rate: 4, lifetime: 1.5, speed: 0.3, color: [1, 0.5, 0.1], size: 0.2, spread: 15 } }),
    // Lava pools (transparent orange)
    p('Z3_Lava_1', [12, 0.5, 8], [150, 0.3, 22], [1, 0.4, 0], 'Neon', { transparency: 0.3, canCollide: false, particles: { rate: 3, lifetime: 4, speed: 0.2, color: [1, 0.5, 0.1], size: 0.5, spread: 10 } }),
    p('Z3_Lava_2', [8, 0.5, 10], [135, 0.3, 32], [1, 0.35, 0], 'Neon', { transparency: 0.3, canCollide: false, particles: { rate: 3, lifetime: 4, speed: 0.2, color: [1, 0.4, 0], size: 0.5, spread: 10 } }),
    // Volcanic rocks
    p('Z3_Rock_1', [6, 10, 6], [160, 5, 38], [0.3, 0.15, 0.1], 'Basalt', { shape: 'Ball' }),
    p('Z3_Rock_2', [5, 7, 5], [132, 3.5, 10], [0.35, 0.18, 0.1], 'Basalt', { shape: 'Ball' }),

    // ═══════════════════════════════════════
    // SELL ZONE — golden marketplace
    // ═══════════════════════════════════════
    p('SellZone', [22, 0.5, 22], [-40, 0, -20], [1, 0.85, 0.2], 'Marble', {
      billboard: { text: 'SELL HERE', color: [1, 1, 0.3], size: 6, offset: [0, 6, 0] },
      prompt: { actionText: 'Sell All', objectText: 'Marketplace', maxDistance: 15 },
      particles: { rate: 10, lifetime: 2, speed: 1.5, color: [1, 0.9, 0.3], size: 0.4, spread: 40 },
    }),
    p('SellCounter', [16, 4, 2], [-40, 2.5, -30], [0.6, 0.5, 0.3], 'Wood'),
    p('SellCounter_Top', [18, 0.5, 4], [-40, 4.5, -30], [0.85, 0.75, 0.5], 'Marble'),
    p('SellSign_Glow', [12, 6, 1], [-40, 8, -31], [1, 0.8, 0.1], 'Neon'),
    // Coin stacks decoration
    p('Sell_CoinStack_1', [3, 5, 3], [-48, 2.5, -25], [1, 0.85, 0], 'Neon', { shape: 'Cylinder' }),
    p('Sell_CoinStack_2', [3, 3, 3], [-32, 1.5, -25], [1, 0.85, 0], 'Neon', { shape: 'Cylinder' }),
    p('Sell_CoinStack_3', [2, 4, 2], [-44, 2, -15], [1, 0.9, 0.2], 'Neon', { shape: 'Cylinder' }),

    // ═══════════════════════════════════════
    // UPGRADE SHOP — power & bag
    // ═══════════════════════════════════════
    // Shop building
    p('ShopFloor', [30, 1, 20], [-55, 0, 20], [0.75, 0.7, 0.6], 'Marble'),
    p('ShopWall_Back', [30, 12, 2], [-55, 6, 10], [0.7, 0.65, 0.55], 'Brick'),
    p('ShopWall_L', [2, 12, 20], [-70, 6, 20], [0.7, 0.65, 0.55], 'Brick'),
    p('ShopWall_R', [2, 12, 20], [-40, 6, 20], [0.7, 0.65, 0.55], 'Brick'),
    p('ShopRoof', [32, 1, 22], [-55, 12, 20], [0.5, 0.3, 0.2], 'Wood'),
    p('ShopSign', [20, 4, 1], [-55, 14, 10], [0.1, 0.8, 0.3], 'Neon', {
      billboard: { text: 'UPGRADE SHOP', color: [0.3, 1, 0.5], size: 6, offset: [0, 4, 0] },
    }),

    // Power upgrade
    p('PowerUp_1', [6, 7, 6], [-62, 4, 22], [0.9, 0.2, 0.2], 'Neon', {
      billboard: { text: 'POWER UP', color: [1, 0.4, 0.3], size: 4 },
      prompt: { actionText: 'Upgrade Power', objectText: 'Power', maxDistance: 10 },
      particles: { rate: 5, lifetime: 2, speed: 0.5, color: [1, 0.3, 0.2], size: 0.3, spread: 30 },
    }),
    p('PowerUpPedestal_1', [8, 1, 8], [-62, 0.5, 22], [0.4, 0.4, 0.42], 'Concrete'),

    // Power upgrade 2
    p('PowerUp_2', [6, 7, 6], [-55, 4, 22], [1, 0.5, 0.1], 'Neon', {
      billboard: { text: 'SUPER POWER', color: [1, 0.6, 0.2], size: 4 },
      prompt: { actionText: 'Upgrade Power II', objectText: 'Super Power', maxDistance: 10 },
      particles: { rate: 5, lifetime: 2, speed: 0.5, color: [1, 0.6, 0.2], size: 0.3, spread: 30 },
    }),
    p('PowerUpPedestal_2', [8, 1, 8], [-55, 0.5, 22], [0.4, 0.4, 0.42], 'Concrete'),

    // Bag upgrade
    p('BagUpgrade', [6, 7, 6], [-48, 4, 22], [0.2, 0.4, 1], 'Neon', {
      billboard: { text: 'BAG SIZE UP', color: [0.4, 0.6, 1], size: 4 },
      prompt: { actionText: 'Upgrade Bag', objectText: 'Backpack', maxDistance: 10 },
      particles: { rate: 4, lifetime: 2, speed: 0.5, color: [0.3, 0.5, 1], size: 0.3, spread: 30 },
    }),
    p('BagPedestal', [8, 1, 8], [-48, 0.5, 22], [0.4, 0.4, 0.42], 'Concrete'),

    // ═══════════════════════════════════════
    // EGG HATCHERY — three tiers
    // ═══════════════════════════════════════
    p('HatcheryFloor', [36, 1, 26], [0, 0, 80], [0.85, 0.8, 0.7], 'Marble'),
    p('HatcheryWall_B', [38, 12, 2], [0, 6, 93], [0.75, 0.7, 0.6], 'Brick'),
    p('HatcheryWall_L', [2, 12, 26], [-18, 6, 80], [0.75, 0.7, 0.6], 'Brick'),
    p('HatcheryWall_R', [2, 12, 26], [18, 6, 80], [0.75, 0.7, 0.6], 'Brick'),
    p('HatcheryRoof', [40, 1, 28], [0, 12, 80], [0.55, 0.45, 0.35], 'Wood'),
    p('HatcherySign', [24, 4, 1], [0, 14, 67], [0.9, 0.7, 1], 'Neon', {
      billboard: { text: 'EGG HATCHERY', color: [1, 0.85, 1], size: 6, offset: [0, 4, 0] },
    }),

    // Egg tier 1 — Common
    p('EggZone_1', [4, 7, 4], [-8, 4, 80], [0.95, 0.95, 0.95], 'Neon', {
      shape: 'Ball',
      billboard: { text: 'Common Egg\n100 Coins', color: [0.9, 0.9, 0.9], size: 3.5 },
      prompt: { actionText: 'Hatch!', objectText: 'Common Egg', maxDistance: 10 },
      particles: { rate: 6, lifetime: 2, speed: 0.5, color: [1, 1, 1], size: 0.3, spread: 25 },
    }),
    p('EggPedestal_1', [6, 1, 6], [-8, 0.5, 80], [0.7, 0.7, 0.72], 'Marble'),

    // Egg tier 2 — Rare
    p('EggZone_2', [5, 8, 5], [0, 4.5, 80], [1, 0.85, 0.2], 'Neon', {
      shape: 'Ball',
      billboard: { text: 'Rare Egg\n1,000 Coins', color: [1, 0.9, 0.3], size: 3.5 },
      prompt: { actionText: 'Hatch!', objectText: 'Rare Egg', maxDistance: 10 },
      particles: { rate: 8, lifetime: 2, speed: 0.6, color: [1, 0.9, 0.3], size: 0.35, spread: 30 },
    }),
    p('EggPedestal_2', [7, 1, 7], [0, 0.5, 80], [0.7, 0.7, 0.72], 'Marble'),

    // Egg tier 3 — Legendary
    p('EggZone_3', [6, 9, 6], [8, 5, 80], [0.75, 0.3, 1], 'Neon', {
      shape: 'Ball',
      billboard: { text: 'Legendary Egg\n10,000 Coins', color: [0.85, 0.5, 1], size: 3.5 },
      prompt: { actionText: 'Hatch!', objectText: 'Legendary Egg', maxDistance: 10 },
      particles: { rate: 10, lifetime: 2.5, speed: 0.7, color: [0.8, 0.4, 1], size: 0.4, spread: 35 },
    }),
    p('EggPedestal_3', [8, 1, 8], [8, 0.5, 80], [0.7, 0.7, 0.72], 'Marble'),

    // ═══════════════════════════════════════
    // PET AREA — fenced pen with display
    // ═══════════════════════════════════════
    p('PetArea', [36, 0.3, 36], [0, 0.15, 120], [0.4, 0.7, 0.35], 'Grass', {
      billboard: { text: 'PET PLAYGROUND', color: [0.5, 1, 0.6], size: 6, offset: [0, 12, 0] },
    }),
    p('PetFence_N', [36, 4, 1], [0, 2, 138], [0.5, 0.35, 0.2], 'Wood'),
    p('PetFence_S', [36, 4, 1], [0, 2, 102], [0.5, 0.35, 0.2], 'Wood'),
    p('PetFence_W', [1, 4, 36], [-18, 2, 120], [0.5, 0.35, 0.2], 'Wood'),
    p('PetFence_E', [1, 4, 36], [18, 2, 120], [0.5, 0.35, 0.2], 'Wood'),
    // Pet food bowl decorations
    p('PetBowl_1', [3, 1.5, 3], [-8, 0.75, 115], [0.85, 0.3, 0.3], 'SmoothPlastic', { shape: 'Cylinder' }),
    p('PetBowl_2', [3, 1.5, 3], [8, 0.75, 125], [0.3, 0.5, 0.85], 'SmoothPlastic', { shape: 'Cylinder' }),
    // Pet house decorations
    p('PetHouse_Base', [8, 5, 6], [0, 2.5, 132], [0.6, 0.45, 0.25], 'Wood'),
    p('PetHouse_Roof', [10, 2, 8], [0, 6, 132], [0.7, 0.25, 0.2], 'SmoothPlastic'),

    // ═══════════════════════════════════════
    // REBIRTH — epic golden portal
    // ═══════════════════════════════════════
    p('RebirthPlatform', [20, 2, 20], [80, 1, 80], [0.5, 0.4, 0.15], 'Marble'),
    p('RebirthPortal_Ring', [14, 14, 2], [80, 10, 80], [1, 0.85, 0.2], 'Neon', {
      shape: 'Cylinder',
      transparency: 0.3,
      billboard: { text: 'REBIRTH PORTAL', color: [1, 0.9, 0.3], size: 6, offset: [0, 10, 0] },
      prompt: { actionText: 'Rebirth!', objectText: 'Reset progress for multiplier', holdDuration: 2, maxDistance: 12 },
      particles: { rate: 15, lifetime: 3, speed: 1.5, color: [1, 0.9, 0.3], size: 0.5, spread: 60 },
    }),
    p('RebirthPillar_L', [4, 18, 4], [72, 9, 80], [0.45, 0.35, 0.15], 'Marble'),
    p('RebirthPillar_R', [4, 18, 4], [88, 9, 80], [0.45, 0.35, 0.15], 'Marble'),
    p('RebirthButton', [8, 4, 8], [80, 3, 80], [1, 0.8, 0.1], 'Neon', {
      particles: { rate: 8, lifetime: 2, speed: 0.8, color: [1, 0.85, 0.2], size: 0.4, spread: 40 },
    }),

    // ═══════════════════════════════════════
    // ZONE GATES — locked until rebirth
    // ═══════════════════════════════════════
    p('ZoneGate_1', [4, 16, 24], [55, 8, 20], [0.8, 0.2, 0.2], 'ForceField', {
      transparency: 0.5,
      billboard: { text: 'LOCKED\nRebirth 1 Required', color: [1, 0.3, 0.3], size: 5, offset: [0, 4, 0] },
      prompt: { actionText: 'Unlock Zone 2', objectText: 'Requires Rebirth 1', holdDuration: 1, maxDistance: 15 },
    }),
    p('ZoneGate_2', [4, 18, 24], [118, 9, 20], [0.6, 0.1, 0.1], 'ForceField', {
      transparency: 0.5,
      billboard: { text: 'LOCKED\nRebirth 2 Required', color: [1, 0.2, 0.2], size: 5, offset: [0, 5, 0] },
      prompt: { actionText: 'Unlock Zone 3', objectText: 'Requires Rebirth 2', holdDuration: 1, maxDistance: 15 },
    }),

    // ═══════════════════════════════════════
    // PATHS — connecting everything
    // ═══════════════════════════════════════
    p('Path_SpawnToZone1', [8, 0.2, 25], [0, 0.1, -10], [0.65, 0.6, 0.5], 'Cobblestone'),
    p('Path_Zone1ToShop', [20, 0.2, 8], [-30, 0.1, 20], [0.65, 0.6, 0.5], 'Cobblestone'),
    p('Path_Zone1ToSell', [30, 0.2, 8], [-20, 0.1, -20], [0.65, 0.6, 0.5], 'Cobblestone'),
    p('Path_Zone1ToZone2', [20, 0.2, 8], [35, 0.1, 20], [0.65, 0.6, 0.5], 'Cobblestone'),
    p('Path_Zone2ToZone3', [15, 0.2, 8], [110, 0.1, 20], [0.65, 0.6, 0.5], 'Cobblestone'),
    p('Path_ToEggs', [8, 0.2, 20], [0, 0.1, 60], [0.65, 0.6, 0.5], 'Cobblestone'),
    p('Path_ToPets', [8, 0.2, 15], [0, 0.1, 95], [0.65, 0.6, 0.5], 'Cobblestone'),
    p('Path_ToRebirth', [40, 0.2, 8], [50, 0.1, 80], [0.65, 0.6, 0.5], 'Cobblestone'),

    // ═══════════════════════════════════════
    // DECORATIONS — world feels alive
    // ═══════════════════════════════════════
    // Light posts along paths
    p('LightPost_1', [1.5, 14, 1.5], [25, 7, -20], [0.3, 0.3, 0.35], 'Metal'),
    p('LightGlow_1', [3.5, 3.5, 3.5], [25, 15, -20], [1, 0.95, 0.7], 'Neon', { shape: 'Ball' }),
    p('LightPost_2', [1.5, 14, 1.5], [-25, 7, 0], [0.3, 0.3, 0.35], 'Metal'),
    p('LightGlow_2', [3.5, 3.5, 3.5], [-25, 15, 0], [1, 0.95, 0.7], 'Neon', { shape: 'Ball' }),
    p('LightPost_3', [1.5, 14, 1.5], [30, 7, 50], [0.3, 0.3, 0.35], 'Metal'),
    p('LightGlow_3', [3.5, 3.5, 3.5], [30, 15, 50], [1, 0.95, 0.7], 'Neon', { shape: 'Ball' }),
    p('LightPost_4', [1.5, 14, 1.5], [-30, 7, 50], [0.3, 0.3, 0.35], 'Metal'),
    p('LightGlow_4', [3.5, 3.5, 3.5], [-30, 15, 50], [1, 0.95, 0.7], 'Neon', { shape: 'Ball' }),

    // Fountain at spawn
    p('Fountain_Base', [10, 2, 10], [0, 1, -40], [0.7, 0.7, 0.75], 'Marble', { shape: 'Cylinder' }),
    p('Fountain_Water', [6, 3, 6], [0, 3, -40], [0.3, 0.5, 0.9], 'Neon', { shape: 'Cylinder', transparency: 0.4, particles: { rate: 8, lifetime: 2, speed: 2, color: [0.5, 0.7, 1], size: 0.3, spread: 15 } }),

    // Benches
    p('Bench_1', [5, 2, 2], [15, 1, -30], [0.5, 0.35, 0.2], 'Wood'),
    p('Bench_2', [5, 2, 2], [-15, 1, -30], [0.5, 0.35, 0.2], 'Wood'),
    p('Bench_3', [5, 2, 2], [30, 1, 60], [0.5, 0.35, 0.2], 'Wood'),

    // Scattered trees around world
    p('Tree_D1', [3, 15, 3], [40, 7.5, -40], [0.4, 0.28, 0.12], 'Wood'),
    p('Canopy_D1', [11, 9, 11], [40, 17, -40], [0.2, 0.6, 0.18], 'Grass', { shape: 'Ball' }),
    p('Tree_D2', [3, 12, 3], [-50, 6, -40], [0.4, 0.28, 0.12], 'Wood'),
    p('Canopy_D2', [9, 7, 9], [-50, 13, -40], [0.22, 0.62, 0.2], 'Grass', { shape: 'Ball' }),
    p('Tree_D3', [4, 16, 4], [-60, 8, 60], [0.4, 0.28, 0.12], 'Wood'),
    p('Canopy_D3', [12, 10, 12], [-60, 18, 60], [0.18, 0.55, 0.15], 'Grass', { shape: 'Ball' }),
    p('Tree_D4', [3, 13, 3], [50, 6.5, 100], [0.4, 0.28, 0.12], 'Wood'),
    p('Canopy_D4', [10, 8, 10], [50, 14.5, 100], [0.2, 0.58, 0.17], 'Grass', { shape: 'Ball' }),

    // DevProduct booth (buy coins)
    p('BoothFloor', [12, 1, 8], [40, 0, -40], [0.8, 0.75, 0.6], 'Wood'),
    p('BoothCounter', [12, 4, 2], [40, 2.5, -44], [0.6, 0.5, 0.35], 'Wood'),
    p('BoothSign', [10, 4, 1], [40, 7, -45], [0.2, 0.8, 0.2], 'Neon', {
      billboard: { text: 'COIN SHOP\nBuy 100 Coins!', color: [0.3, 1, 0.4], size: 5, offset: [0, 4, 0] },
      prompt: { actionText: 'Buy Coins', objectText: '100 Coins', maxDistance: 12 },
    }),
  ];

  return {
    parts,
    spawns: [{ name: 'MainSpawn', position: [0, 2, -50] }],
    terrain: { biome: 'grass', seed: 88, amplitude: 6, baseHeight: -5, features: ['flat', 'hills'], range: 250 },
    lighting: {
      clockTime: 14, ambient: [0.42, 0.42, 0.4], brightness: 2.8, fogEnd: 1000,
      fogColor: [0.72, 0.82, 0.72], outdoorAmbient: [0.52, 0.52, 0.48],
      atmosphere: { density: 0.18, offset: 0.2, color: [0.82, 0.92, 0.87], decay: [0.87, 0.92, 0.77], haze: 0.5 },
      postEffects: { bloomIntensity: 0.35, bloomSize: 20, bloomThreshold: 0.82, ccBrightness: 0.04, ccContrast: 0.06, ccSaturation: 0.15, ccTintColor: [0.98, 1, 0.96] },
    },
  };
}

// ---------- Dynamic Simulator Scene from LLM spec ----------

/** Validate LLM-generated SimulatorSceneSpec. Returns null if valid, error string if not. */
export function validateSimulatorSpec(spec: unknown): string | null {
  if (!spec || typeof spec !== 'object') return 'spec is not an object';
  const s = spec as Record<string, unknown>;
  if (!s.theme || typeof s.theme !== 'object') return 'missing theme';
  if (!Array.isArray(s.zones) || s.zones.length < 3) return 'need at least 3 zones';
  if (!s.sellZone || typeof s.sellZone !== 'object') return 'missing sellZone';
  if (!s.eggHatchery || typeof s.eggHatchery !== 'object') return 'missing eggHatchery';
  const hatchery = s.eggHatchery as Record<string, unknown>;
  if (!Array.isArray(hatchery.eggs) || hatchery.eggs.length < 3) return 'need 3 eggs';
  if (!s.upgradeShop || typeof s.upgradeShop !== 'object') return 'missing upgradeShop';
  if (!s.petArea || typeof s.petArea !== 'object') return 'missing petArea';
  if (!s.rebirthPortal || typeof s.rebirthPortal !== 'object') return 'missing rebirthPortal';
  if (!s.spawn || typeof s.spawn !== 'object') return 'missing spawn';
  if (!s.currency || typeof s.currency !== 'string') return 'missing currency';
  if (!s.pets || typeof s.pets !== 'object') return 'missing pets';
  const pets = s.pets as Record<string, unknown>;
  if (!Array.isArray(pets.common) || pets.common.length < 5) return 'need 5 common pets';
  if (!Array.isArray(pets.golden) || pets.golden.length < 5) return 'need 5 golden pets';
  if (!Array.isArray(pets.legendary) || pets.legendary.length < 5) return 'need 5 legendary pets';
  return null;
}

/** Build a SceneTemplate from an LLM-generated SimulatorSceneSpec. */
export function buildDynamicSimulatorScene(spec: SimulatorSceneSpec): SceneTemplate {
  const parts: ScenePart[] = [];
  const theme = spec.theme;

  // Desaturate/clamp all LLM colors to prevent eye-burning neon
  const clampColor = (rgb: [number, number, number]): [number, number, number] =>
    rgb.map(c => Math.max(0.15, Math.min(0.86, c))) as [number, number, number];
  const clampGround = (rgb: [number, number, number]): [number, number, number] =>
    rgb.map(c => Math.max(0.12, Math.min(0.65, c))) as [number, number, number];

  // Pre-clamp theme colors
  theme.groundColor = clampGround(theme.groundColor);
  theme.palette = theme.palette.map(clampColor) as typeof theme.palette;
  for (const zone of spec.zones) {
    zone.color = clampColor(zone.color);
    if (zone.decorations) {
      for (const dec of zone.decorations) {
        if (dec.color) dec.color = clampColor(dec.color);
      }
    }
  }
  if (spec.sellZone.color) spec.sellZone.color = clampColor(spec.sellZone.color);
  if (spec.upgradeShop.color) spec.upgradeShop.color = clampColor(spec.upgradeShop.color);
  if (spec.petArea.color) spec.petArea.color = clampColor(spec.petArea.color);
  if (spec.rebirthPortal.color) spec.rebirthPortal.color = clampColor(spec.rebirthPortal.color);
  for (const egg of spec.eggHatchery.eggs) {
    if (egg.color) egg.color = clampColor(egg.color);
  }
  if (spec.worldDecorations) {
    for (const dec of spec.worldDecorations) {
      if (dec.color) dec.color = clampColor(dec.color);
    }
  }

  // Helper
  const add = (name: string, size: [number, number, number], pos: [number, number, number], color: [number, number, number], material: string, extra?: Partial<ScenePart>) => {
    parts.push({ name, size, position: pos, color, material, anchored: true, canCollide: true, ...extra });
  };

  // World base (use Grass or appropriate ground — not SmoothPlastic)
  const groundMat = ['Grass', 'Sand', 'Snow', 'Ice', 'Slate', 'Marble'].includes(theme.groundMaterial) ? theme.groundMaterial : 'Grass';
  add('WorldBase', [350, 2, 350], [0, -1, 30], theme.groundColor, groundMat);
  // World edges
  add('WorldEdge_N', [350, 12, 4], [0, 5, 205], theme.palette[0] || theme.groundColor, 'Wood');
  add('WorldEdge_S', [350, 12, 4], [0, 5, -145], theme.palette[0] || theme.groundColor, 'Wood');
  add('WorldEdge_W', [4, 12, 350], [-177, 5, 30], theme.palette[0] || theme.groundColor, 'Wood');
  add('WorldEdge_E', [4, 12, 350], [247, 5, 30], theme.palette[0] || theme.groundColor, 'Wood');

  // Spawn — premium platform with fencing and welcome arch
  const spawnPos = spec.spawn.position || [0, 2, -50];
  add('SpawnPlatform', [28, 1, 28], [spawnPos[0], 0, spawnPos[2]], theme.palette[1] || [0.6, 0.6, 0.7], 'Marble');
  // Decorative edge trim
  add('SpawnTrimN', [28, 0.5, 0.5], [spawnPos[0], 0.7, spawnPos[2] + 14], theme.palette[2] || [0.7, 0.7, 0.75], 'Neon');
  add('SpawnTrimS', [28, 0.5, 0.5], [spawnPos[0], 0.7, spawnPos[2] - 14], theme.palette[2] || [0.7, 0.7, 0.75], 'Neon');
  add('SpawnTrimW', [0.5, 0.5, 28], [spawnPos[0] - 14, 0.7, spawnPos[2]], theme.palette[2] || [0.7, 0.7, 0.75], 'Neon');
  add('SpawnTrimE', [0.5, 0.5, 28], [spawnPos[0] + 14, 0.7, spawnPos[2]], theme.palette[2] || [0.7, 0.7, 0.75], 'Neon');
  // Welcome arch
  add('SpawnArchL', [2, 12, 2], [spawnPos[0] - 8, 6, spawnPos[2] + 14], theme.palette[0] || [0.5, 0.5, 0.55], 'Marble');
  add('SpawnArchR', [2, 12, 2], [spawnPos[0] + 8, 6, spawnPos[2] + 14], theme.palette[0] || [0.5, 0.5, 0.55], 'Marble');
  add('SpawnArchTop', [18, 2, 3], [spawnPos[0], 12.5, spawnPos[2] + 14], theme.palette[0] || [0.5, 0.5, 0.55], 'Marble');
  add('SpawnSign', [1, 4, 14], [spawnPos[0], 14, spawnPos[2] + 14], theme.palette[2] || [1, 1, 1], 'Neon', {
    billboard: { text: theme.name.toUpperCase(), color: theme.palette[3] || [1, 1, 1], size: 7, offset: [0, 2, 0] },
  });

  // ---- COLLECT ZONES ----
  for (const zone of spec.zones.slice(0, 7)) {
    const zoneId = zone.id;
    const zPos = zone.position;
    const zSize = zone.size || [45, 0.5, 45];
    const zoneMat = ['Grass', 'Sand', 'Snow', 'Marble', 'Granite', 'Cobblestone', 'Slate', 'Fabric'].includes(zone.material) ? zone.material : 'Marble';
    add(`CollectZone_${zoneId}`, zSize as [number, number, number], zPos, zone.color, zoneMat, {
      billboard: { text: zone.name.toUpperCase(), color: zone.color, size: 6, offset: [0, 8, 0] },
      prompt: { actionText: 'Collect', objectText: zone.name, maxDistance: 15 },
      particles: { rate: 3, lifetime: 3, speed: 0.2, color: zone.color, size: 0.25, spread: 50 },
    });

    // Zone decorations
    if (Array.isArray(zone.decorations)) {
      for (const dec of zone.decorations.slice(0, 10)) {
        add(
          `Z${zoneId}_${dec.name}`,
          dec.size || [3, 5, 3],
          [zPos[0] + (dec.relPos?.[0] || 0), (dec.relPos?.[1] || 2), zPos[2] + (dec.relPos?.[2] || 0)],
          dec.color || zone.color,
          dec.material || zone.material,
          dec.shape ? { shape: dec.shape } : undefined,
        );
      }
    }

    // Zone edge trim (neon strips) and corner pillars
    const halfW = (zSize[0] as number) / 2;
    const halfD = (zSize[2] as number) / 2;
    add(`Z${zoneId}_TrimN`, [zSize[0] as number, 0.4, 0.4], [zPos[0], 0.5, zPos[2] + halfD], zone.color, 'Neon');
    add(`Z${zoneId}_TrimS`, [zSize[0] as number, 0.4, 0.4], [zPos[0], 0.5, zPos[2] - halfD], zone.color, 'Neon');
    add(`Z${zoneId}_TrimW`, [0.4, 0.4, zSize[2] as number], [zPos[0] - halfW, 0.5, zPos[2]], zone.color, 'Neon');
    add(`Z${zoneId}_TrimE`, [0.4, 0.4, zSize[2] as number], [zPos[0] + halfW, 0.5, zPos[2]], zone.color, 'Neon');
    add(`Z${zoneId}_PillarNW`, [2, 6, 2], [zPos[0] - halfW, 3, zPos[2] + halfD], zone.color, 'Marble');
    add(`Z${zoneId}_PillarNE`, [2, 6, 2], [zPos[0] + halfW, 3, zPos[2] + halfD], zone.color, 'Marble');
    add(`Z${zoneId}_PillarSW`, [2, 6, 2], [zPos[0] - halfW, 3, zPos[2] - halfD], zone.color, 'Marble');
    add(`Z${zoneId}_PillarSE`, [2, 6, 2], [zPos[0] + halfW, 3, zPos[2] - halfD], zone.color, 'Marble');

    // Zone gate — with glowing pillars
    if (zoneId >= 2) {
      const gateX = zPos[0] - (zSize[0] as number) / 2 - 5;
      const gateZ = zPos[2];
      add(`ZoneGate_${zoneId - 1}`, [4, 12, 16], [gateX, 6, gateZ], [0.8, 0.2, 0.2], 'ForceField', {
        transparency: 0.4,
        billboard: { text: `REBIRTH ${zoneId - 1} REQUIRED`, color: [1, 0.3, 0.3], size: 5, offset: [0, 4, 0] },
      });
      // Gate pillars with neon trim
      add(`GatePillarL_${zoneId - 1}`, [2, 14, 2], [gateX, 7, gateZ - 8], theme.palette[1] || [0.5, 0.5, 0.55], 'Marble');
      add(`GatePillarR_${zoneId - 1}`, [2, 14, 2], [gateX, 7, gateZ + 8], theme.palette[1] || [0.5, 0.5, 0.55], 'Marble');
      add(`GateTrimL_${zoneId - 1}`, [0.5, 14, 0.5], [gateX, 7, gateZ - 9.2], [0.85, 0.25, 0.25], 'Neon');
      add(`GateTrimR_${zoneId - 1}`, [0.5, 14, 0.5], [gateX, 7, gateZ + 9.2], [0.85, 0.25, 0.25], 'Neon');
      add(`GateArch_${zoneId - 1}`, [2, 2, 18], [gateX, 13, gateZ], theme.palette[1] || [0.5, 0.5, 0.55], 'Marble');
    }
  }

  // ---- SELL ZONE ----
  const sellPos = spec.sellZone.position;
  const sellColor = spec.sellZone.color || theme.palette[3] || [1, 0.85, 0];
  add('SellZone', [22, 0.5, 22], sellPos, sellColor, 'Marble', {
    billboard: { text: 'SELL', color: sellColor, size: 7, offset: [0, 6, 0] },
    prompt: { actionText: 'Sell All', objectText: 'Marketplace', maxDistance: 12 },
    particles: { rate: 5, lifetime: 2, speed: 0.3, color: sellColor, size: 0.35, spread: 40 },
  });
  // Sell counter
  add('SellCounter', [10, 3, 3], [sellPos[0], 1.5, sellPos[2] - 8], sellColor, 'SmoothPlastic');

  // ---- EGG HATCHERY ----
  const eggPos = spec.eggHatchery.position;
  const eggs = spec.eggHatchery.eggs;
  // Hatchery building
  add('EggBuilding_Floor', [30, 1, 20], [eggPos[0], 0, eggPos[2]], theme.palette[1] || [0.5, 0.5, 0.55], 'SmoothPlastic');
  add('EggBuilding_Roof', [32, 1, 22], [eggPos[0], 12, eggPos[2]], theme.palette[0] || [0.4, 0.4, 0.45], 'SmoothPlastic');
  add('EggBuilding_Sign', [1, 4, 12], [eggPos[0], 14, eggPos[2] - 10], theme.palette[2] || [1, 1, 1], 'Neon', {
    billboard: { text: 'EGG HATCHERY', color: [1, 1, 1], size: 5, offset: [0, 2, 0] },
  });

  const eggSizes: [number, number, number][] = [[4, 7, 4], [5, 8, 5], [6, 9, 6]];
  const eggCosts = [100, 1000, 10000];
  const eggLabels = ['Common', 'Rare', 'Legendary'];
  for (let i = 0; i < 3; i++) {
    const ex = eggPos[0] - 8 + i * 8;
    const ec = eggs[i]?.color || [1, 1, 1];
    add(`EggZone_${i + 1}`, eggSizes[i], [ex, eggSizes[i][1] / 2, eggPos[2]], ec, 'Neon', {
      shape: 'Ball',
      billboard: { text: `${eggs[i]?.name || eggLabels[i] + ' Egg'}\n${eggCosts[i].toLocaleString()} ${spec.currency}`, color: ec, size: 4, offset: [0, 5, 0] },
      prompt: { actionText: 'Hatch!', objectText: eggs[i]?.name || eggLabels[i] + ' Egg', maxDistance: 10 },
      particles: { rate: 6, lifetime: 2.5, speed: 0.4, color: ec, size: 0.3, spread: 60 },
    });
    // Pedestal
    add(`EggPedestal_${i + 1}`, [6, 1, 6], [ex, 0.5, eggPos[2]], theme.palette[1] || [0.5, 0.5, 0.55], 'Marble');
    // Glow ring under egg
    add(`EggGlow_${i + 1}`, [8, 0.3, 8], [ex, 0.2, eggPos[2]], ec, 'Neon', {
      shape: 'Cylinder', transparency: 0.4,
      particles: { rate: 4, lifetime: 2, speed: 0.3, color: ec, size: 0.25, spread: 30 },
    });
    // Multi-Hatch x3 button (left of egg) — cylinder with pedestal
    add(`MultiHatch_3_${i + 1}`, [5, 4, 5], [ex - 6, 2, eggPos[2]], [0.4, 0.85, 0.3], 'Neon', {
      shape: 'Cylinder',
      billboard: { text: `HATCH x3\n${(eggCosts[i] * 3).toLocaleString()}`, color: [0.5, 0.9, 0.4], size: 4, offset: [0, 4, 0] },
    });
    add(`MultiHatch_3_${i + 1}_Base`, [6, 0.5, 6], [ex - 6, 0.3, eggPos[2]], [0.3, 0.7, 0.25], 'Marble');
    // Multi-Hatch x5 button (right of egg) — cylinder with pedestal
    add(`MultiHatch_5_${i + 1}`, [5, 4, 5], [ex + 6, 2, eggPos[2]], [0.7, 0.3, 0.85], 'Neon', {
      shape: 'Cylinder',
      billboard: { text: `HATCH x5\nRebirth 2+`, color: [0.8, 0.4, 0.9], size: 4, offset: [0, 4, 0] },
    });
    add(`MultiHatch_5_${i + 1}_Base`, [6, 0.5, 6], [ex + 6, 0.3, eggPos[2]], [0.6, 0.25, 0.7], 'Marble');
  }

  // ---- UPGRADE SHOP ----
  const shopPos = spec.upgradeShop.position;
  const shopColor = spec.upgradeShop.color || theme.palette[2] || [0.5, 0.5, 0.7];
  add('UpgradeShop_Floor', [24, 1, 18], [shopPos[0], 0, shopPos[2]], shopColor, 'Granite');
  add('UpgradeShop_Roof', [26, 1, 20], [shopPos[0], 10, shopPos[2]], shopColor, 'Slate');
  // Shop walls for structure
  add('UpgradeShop_WallL', [1, 10, 18], [shopPos[0] - 12, 5, shopPos[2]], shopColor, 'SmoothPlastic', { transparency: 0.6 });
  add('UpgradeShop_WallR', [1, 10, 18], [shopPos[0] + 12, 5, shopPos[2]], shopColor, 'SmoothPlastic', { transparency: 0.6 });
  add('UpgradeShop_WallB', [24, 10, 1], [shopPos[0], 5, shopPos[2] + 9], shopColor, 'SmoothPlastic', { transparency: 0.6 });
  // PowerUp — tall sword shape
  add('PowerUp_1', [2, 10, 2], [shopPos[0] - 7, 5, shopPos[2]], [0.9, 0.2, 0.2], 'Neon', {
    billboard: { text: 'POWER UP ⚔️', color: [1, 0.3, 0.3], size: 4, offset: [0, 6, 0] },
    prompt: { actionText: 'Upgrade Power', objectText: 'Power Boost', maxDistance: 10 },
  });
  add('PowerUp_1_Guard', [5, 1, 1.5], [shopPos[0] - 7, 2, shopPos[2]], [0.8, 0.15, 0.15], 'Neon');
  add('PowerUp_1_Pedestal', [8, 1, 8], [shopPos[0] - 7, 0.5, shopPos[2]], shopColor, 'Marble');
  // SpeedUp — cylinder wheel
  add('PowerUp_2', [6, 2, 6], [shopPos[0], 3, shopPos[2]], [1, 0.6, 0.1], 'Neon', {
    shape: 'Cylinder',
    billboard: { text: 'SPEED UP 👟', color: [1, 0.7, 0.2], size: 4, offset: [0, 4, 0] },
    prompt: { actionText: 'Upgrade Speed', objectText: 'Speed Boost', maxDistance: 10 },
  });
  add('PowerUp_2_Pedestal', [8, 1, 8], [shopPos[0], 0.5, shopPos[2]], shopColor, 'Marble');
  // BagUpgrade — chest shape (Wood)
  add('BagUpgrade', [5, 5, 6], [shopPos[0] + 7, 2.5, shopPos[2]], [0.55, 0.38, 0.2], 'Wood', {
    billboard: { text: 'BAG UPGRADE 🎒', color: [0.4, 0.6, 1], size: 4, offset: [0, 5, 0] },
    prompt: { actionText: 'Upgrade Bag', objectText: 'Bigger Bag', maxDistance: 10 },
  });
  add('BagUpgrade_Lid', [5.2, 0.8, 6.2], [shopPos[0] + 7, 5.4, shopPos[2]], [0.3, 0.5, 1], 'Neon');
  add('BagUpgrade_Pedestal', [8, 1, 8], [shopPos[0] + 7, 0.5, shopPos[2]], shopColor, 'Marble');
  // AutoCollect — magnet cylinder
  add('AutoCollect', [4, 6, 4], [shopPos[0] - 7, 3, shopPos[2] - 10], [0.2, 0.7, 0.3], 'Neon', {
    shape: 'Cylinder',
    billboard: { text: `AUTO COLLECT 🧲\n${spec.currency} 500`, color: [0.3, 0.85, 0.4], size: 4, offset: [0, 5, 0] },
    prompt: { actionText: 'Buy Auto-Collect', objectText: 'Auto-Collect', maxDistance: 10 },
  });
  add('AutoCollect_Pedestal', [8, 1, 8], [shopPos[0] - 7, 0.5, shopPos[2] - 10], shopColor, 'Marble');
  // SpeedBoost — flat speed disc
  add('SpeedBoost', [6, 2, 6], [shopPos[0] + 7, 2, shopPos[2] - 10], [0.8, 0.6, 0.15], 'Neon', {
    shape: 'Cylinder',
    billboard: { text: `SPEED BOOST ⚡\n${spec.currency} 300`, color: [0.9, 0.7, 0.2], size: 4, offset: [0, 4, 0] },
    prompt: { actionText: 'Buy Speed Boost', objectText: 'Speed Boost', maxDistance: 10 },
    particles: { rate: 3, lifetime: 1, speed: 0.5, color: [0.9, 0.7, 0.2], size: 0.2, spread: 30 },
  });
  add('SpeedBoost_Pedestal', [8, 1, 8], [shopPos[0] + 7, 0.5, shopPos[2] - 10], shopColor, 'Marble');
  // LuckUpgrade — glowing orb
  add('LuckUpgrade', [5, 5, 5], [shopPos[0], 3.5, shopPos[2] - 10], [0.2, 0.8, 0.6], 'Neon', {
    shape: 'Ball',
    billboard: { text: `LUCK UP 🍀\n${spec.currency} 2000`, color: [0.3, 0.9, 0.7], size: 4, offset: [0, 5, 0] },
    prompt: { actionText: 'Upgrade Luck', objectText: 'Better Variants', maxDistance: 10 },
    particles: { rate: 3, lifetime: 2, speed: 0.2, color: [0.3, 0.9, 0.7], size: 0.2, spread: 20 },
  });
  add('LuckUpgrade_Pedestal', [8, 1, 8], [shopPos[0], 0.5, shopPos[2] - 10], shopColor, 'Marble');

  // ---- PET AREA ----
  const petPos = spec.petArea.position;
  const petColor = spec.petArea.color || theme.palette[0] || [0.3, 0.6, 0.25];
  add('PetArea', [36, 0.3, 36], [petPos[0], 0.15, petPos[2]], petColor, 'Grass');
  // Fences
  add('PetFence_N', [36, 3, 1], [petPos[0], 1.5, petPos[2] + 18], theme.palette[0] || [0.4, 0.28, 0.15], 'Wood');
  add('PetFence_S', [36, 3, 1], [petPos[0], 1.5, petPos[2] - 18], theme.palette[0] || [0.4, 0.28, 0.15], 'Wood');
  add('PetFence_W', [1, 3, 36], [petPos[0] - 18, 1.5, petPos[2]], theme.palette[0] || [0.4, 0.28, 0.15], 'Wood');
  add('PetFence_E', [1, 3, 36], [petPos[0] + 18, 1.5, petPos[2]], theme.palette[0] || [0.4, 0.28, 0.15], 'Wood');
  // Pet house
  add('PetHouse', [8, 5, 6], [petPos[0], 2.5, petPos[2] + 12], theme.palette[1] || [0.6, 0.4, 0.25], 'Wood');
  add('PetHouse_Roof', [10, 1, 8], [petPos[0], 5.5, petPos[2] + 12], theme.palette[2] || [0.7, 0.3, 0.2], 'Wood', { rotation: [15, 0, 0] });

  // Fuse Station (near pet area) — dramatic design with 3 input pedestals
  const fuseX = petPos[0] - 14;
  const fuseZ = petPos[2] - 14;
  add('FuseStation_Base', [12, 0.5, 12], [fuseX, 0.25, fuseZ], [0.5, 0.15, 0.7], 'Neon', { transparency: 0.3 });
  add('FuseStation', [6, 8, 6], [fuseX, 4, fuseZ], [0.6, 0.2, 0.8], 'Neon', {
    shape: 'Ball',
    billboard: { text: 'FUSE PETS\nRebirth 3+', color: [0.7, 0.3, 0.9], size: 5, offset: [0, 6, 0] },
    prompt: { actionText: 'Fuse Pets', objectText: 'Merge 3 → 1', maxDistance: 10 },
    particles: { rate: 6, lifetime: 2, speed: 0.4, color: [0.6, 0.2, 0.8], size: 0.3, spread: 40 },
  });
  // 3 input pedestals in triangle
  add('FuseInput_1', [3, 4, 3], [fuseX - 4, 2, fuseZ + 3], [0.7, 0.3, 0.9], 'Neon', { shape: 'Cylinder' });
  add('FuseInput_2', [3, 4, 3], [fuseX + 4, 2, fuseZ + 3], [0.7, 0.3, 0.9], 'Neon', { shape: 'Cylinder' });
  add('FuseInput_3', [3, 4, 3], [fuseX, 2, fuseZ - 4], [0.7, 0.3, 0.9], 'Neon', { shape: 'Cylinder' });
  // Corner pillars
  add('FusePillar_L', [1.5, 10, 1.5], [fuseX - 6, 5, fuseZ - 6], [0.5, 0.2, 0.7], 'Marble');
  add('FusePillar_R', [1.5, 10, 1.5], [fuseX + 6, 5, fuseZ - 6], [0.5, 0.2, 0.7], 'Marble');

  // ---- REBIRTH PORTAL ----
  const rbPos = spec.rebirthPortal.position;
  const rbColor = spec.rebirthPortal.color || [1, 0.85, 0.3];
  add('RebirthPlatform', [20, 2, 20], [rbPos[0], 1, rbPos[2]], theme.palette[1] || [0.5, 0.5, 0.55], 'Marble');
  add('RebirthPortal_Ring', [14, 14, 2], [rbPos[0], 9, rbPos[2]], rbColor, 'Neon', { shape: 'Cylinder', transparency: 0.3 });
  add('RebirthButton', [8, 4, 8], [rbPos[0], 4, rbPos[2]], rbColor, 'Neon', {
    billboard: { text: 'REBIRTH', color: rbColor, size: 6, offset: [0, 6, 0] },
    prompt: { actionText: 'Rebirth!', objectText: 'Reset & Multiply', holdDuration: 2, maxDistance: 12 },
    particles: { rate: 12, lifetime: 3, speed: 1, color: rbColor, size: 0.5, spread: 60 },
  });
  add('RebirthPillar_L', [4, 16, 4], [rbPos[0] - 10, 8, rbPos[2]], theme.palette[1] || [0.6, 0.6, 0.65], 'Marble');
  add('RebirthPillar_R', [4, 16, 4], [rbPos[0] + 10, 8, rbPos[2]], theme.palette[1] || [0.6, 0.6, 0.65], 'Marble');

  // ---- PATHS ----
  if (Array.isArray(spec.paths)) {
    const posMap: Record<string, [number, number, number]> = {
      spawn: [spawnPos[0], 0, spawnPos[2]],
      zone1: spec.zones[0]?.position || [0, 0, 20],
      zone2: spec.zones[1]?.position || [80, 0, 20],
      zone3: spec.zones[2]?.position || [145, 0, 20],
      zone4: spec.zones[3]?.position || [0, 0, 100],
      zone5: spec.zones[4]?.position || [80, 0, 100],
      zone6: spec.zones[5]?.position || [145, 0, 100],
      zone7: spec.zones[6]?.position || [220, 0, 100],
      sellZone: sellPos,
      eggHatchery: eggPos,
      upgradeShop: shopPos,
      petArea: petPos,
      rebirthPortal: rbPos,
    };
    for (let pi = 0; pi < spec.paths.length; pi++) {
      const path = spec.paths[pi];
      const fromP = posMap[path.from] || [0, 0, 0];
      const toP = posMap[path.to] || [0, 0, 0];
      const midX = (fromP[0] + toP[0]) / 2;
      const midZ = (fromP[2] + toP[2]) / 2;
      const dx = toP[0] - fromP[0];
      const dz = toP[2] - fromP[2];
      const len = Math.sqrt(dx * dx + dz * dz);
      const angle = Math.atan2(dx, dz) * (180 / Math.PI);
      add(`Path_${pi + 1}`, [6, 0.2, Math.max(len, 4)], [midX, 0.1, midZ], path.color || theme.palette[4] || [0.5, 0.5, 0.45], path.material || 'Cobblestone', {
        rotation: [0, angle, 0],
      });
    }
  }

  // ---- WORLD DECORATIONS (LLM-generated) ----
  if (Array.isArray(spec.worldDecorations)) {
    for (const dec of spec.worldDecorations.slice(0, 30)) {
      add(
        `Deco_${dec.name}`,
        dec.size || [4, 6, 4],
        dec.position || [0, 3, 0],
        dec.color || theme.palette[0] || [0.5, 0.5, 0.5],
        dec.material || 'SmoothPlastic',
        dec.shape ? { shape: dec.shape } : undefined,
      );
    }
  }

  // ---- GUARANTEED ENVIRONMENT DECORATIONS ----

  // Trees (8 around the map — trunk + canopy)
  const treePositions: [number, number, number][] = [
    [spawnPos[0] - 25, 0, spawnPos[2] + 20],
    [spawnPos[0] + 25, 0, spawnPos[2] + 20],
    [sellPos[0] - 15, 0, sellPos[2] + 15],
    [sellPos[0] + 15, 0, sellPos[2] - 15],
    [eggPos[0] + 20, 0, eggPos[2] + 10],
    [eggPos[0] - 20, 0, eggPos[2] - 10],
    [petPos[0] + 25, 0, petPos[2]],
    [rbPos[0] - 15, 0, rbPos[2] + 15],
  ];
  for (let ti = 0; ti < treePositions.length; ti++) {
    const tp = treePositions[ti];
    const trunkH = 12 + (ti % 3) * 3; // vary height 12-18
    add(`EnvTree_${ti}_Trunk`, [2.5, trunkH, 2.5], [tp[0], trunkH / 2, tp[2]], [0.4, 0.28, 0.12], 'Wood', { shape: 'Cylinder' });
    add(`EnvTree_${ti}_Canopy`, [9, 7, 9], [tp[0], trunkH + 3, tp[2]], [0.2, 0.52 + (ti % 3) * 0.05, 0.18], 'Grass', { shape: 'Ball' });
  }

  // Pond near spawn (flat blue transparent part with sparkle particles)
  add('EnvPond', [14, 0.3, 10], [spawnPos[0] - 20, 0.15, spawnPos[2] - 20], [0.25, 0.45, 0.75], 'Neon', {
    transparency: 0.35,
    particles: { rate: 2, lifetime: 3, speed: 0.1, color: [0.4, 0.6, 0.9], size: 0.2, spread: 10 },
  });
  // Pond edge rocks
  add('EnvPondRock_1', [3, 1.5, 2], [spawnPos[0] - 27, 0.7, spawnPos[2] - 22], [0.4, 0.38, 0.35], 'Slate', { shape: 'Ball' });
  add('EnvPondRock_2', [2.5, 1.2, 2.5], [spawnPos[0] - 14, 0.6, spawnPos[2] - 18], [0.42, 0.4, 0.37], 'Slate', { shape: 'Ball' });

  // Bushes (6 scattered around)
  const bushPositions: [number, number, number][] = [
    [spawnPos[0] - 12, 0.6, spawnPos[2] + 10],
    [spawnPos[0] + 12, 0.6, spawnPos[2] + 10],
    [sellPos[0] + 8, 0.6, sellPos[2] + 5],
    [eggPos[0] - 12, 0.6, eggPos[2] + 8],
    [petPos[0] + 10, 0.6, petPos[2] - 10],
    [shopPos[0] + 15, 0.6, shopPos[2]],
  ];
  for (let bi = 0; bi < bushPositions.length; bi++) {
    const bp = bushPositions[bi];
    const bw = 3 + (bi % 2);
    add(`EnvBush_${bi}`, [bw, 2, bw], bp, [0.22, 0.5 + (bi % 3) * 0.04, 0.2], 'Grass', { shape: 'Ball' });
  }

  // Benches (3 near spawn and egg hatchery)
  add('EnvBench_1', [4, 1.8, 1.5], [spawnPos[0] + 10, 0.9, spawnPos[2] - 8], [0.5, 0.35, 0.2], 'Wood');
  add('EnvBench_2', [4, 1.8, 1.5], [spawnPos[0] - 10, 0.9, spawnPos[2] - 8], [0.5, 0.35, 0.2], 'Wood');
  add('EnvBench_3', [4, 1.8, 1.5], [eggPos[0] + 15, 0.9, eggPos[2]], [0.5, 0.35, 0.2], 'Wood');

  // Flower patches (4 small colorful clusters)
  add('EnvFlowers_1', [3, 0.6, 3], [spawnPos[0] - 8, 0.3, spawnPos[2] + 5], [0.75, 0.35, 0.45], 'Fabric', { shape: 'Ball' });
  add('EnvFlowers_2', [2.5, 0.5, 2.5], [sellPos[0] - 6, 0.3, sellPos[2] - 6], [0.8, 0.7, 0.35], 'Fabric', { shape: 'Ball' });
  add('EnvFlowers_3', [3, 0.6, 3], [petPos[0] - 8, 0.3, petPos[2] + 8], [0.45, 0.35, 0.7], 'Fabric', { shape: 'Ball' });
  add('EnvFlowers_4', [2.5, 0.5, 2.5], [eggPos[0] + 8, 0.3, eggPos[2] - 8], [0.75, 0.5, 0.35], 'Fabric', { shape: 'Ball' });

  // ---- LIGHT POSTS (8 around the map) ----
  const lightPositions: [number, number, number][] = [
    [spawnPos[0] - 15, 0, spawnPos[2] + 5],
    [spawnPos[0] + 15, 0, spawnPos[2] + 5],
    [sellPos[0] + 12, 0, sellPos[2]],
    [eggPos[0] - 16, 0, eggPos[2]],
    [petPos[0] - 20, 0, petPos[2]],
    [petPos[0] + 20, 0, petPos[2]],
    [rbPos[0] - 12, 0, rbPos[2] - 12],
    [shopPos[0] + 14, 0, shopPos[2]],
  ];
  for (let li = 0; li < lightPositions.length; li++) {
    const lp = lightPositions[li];
    add(`LightPost_${li + 1}`, [1, 15, 1], [lp[0], 7.5, lp[2]], theme.palette[4] || [0.5, 0.5, 0.5], 'Metal');
    add(`LightOrb_${li + 1}`, [3, 3, 3], [lp[0], 16, lp[2]], theme.palette[3] || [1, 0.95, 0.7], 'Neon', { shape: 'Ball' });
  }

  // Dev product booth
  add('CoinShop', [6, 8, 6], [spawnPos[0] + 18, 4, spawnPos[2] - 5], theme.palette[3] || [1, 0.85, 0], 'SmoothPlastic', {
    billboard: { text: `BUY ${spec.currency.toUpperCase()}`, color: theme.palette[3] || [1, 0.9, 0.3], size: 4, offset: [0, 5, 0] },
    prompt: { actionText: 'Buy', objectText: `${spec.currency} Shop`, maxDistance: 10 },
  });

  // ---- LIGHTING ----
  const lit = spec.lighting || {};
  const atmo = lit.atmosphere || {};
  const fx = lit.postEffects || {};

  return {
    parts,
    spawns: [{ name: 'MainSpawn', position: [spawnPos[0], spawnPos[1] || 2, spawnPos[2]] }],
    terrain: {
      biome: theme.groundMaterial === 'Sand' ? 'sand' : theme.groundMaterial === 'Snow' || theme.groundMaterial === 'Ice' ? 'snow' : 'grass',
      seed: Math.floor(Math.random() * 999),
      amplitude: 6,
      baseHeight: -5,
      features: ['flat', 'hills'],
      range: 250,
    },
    lighting: {
      clockTime: Math.min(Math.max(lit.clockTime ?? 14, 6), 22),
      ambient: lit.ambient || [0.42, 0.42, 0.4],
      brightness: Math.min(lit.brightness ?? 2.5, 3),
      fogEnd: Math.max(lit.fogEnd ?? 1000, 400),
      fogColor: lit.fogColor || [0.72, 0.82, 0.72],
      outdoorAmbient: lit.outdoorAmbient || [0.52, 0.52, 0.48],
      atmosphere: {
        density: Math.min(atmo.density ?? 0.18, 0.35),
        offset: Math.min(atmo.offset ?? 0.2, 0.3),
        color: atmo.color || [0.82, 0.92, 0.87],
        decay: atmo.decay || [0.87, 0.92, 0.77],
        haze: Math.min(atmo.haze ?? 0.5, 1.2),
      },
      postEffects: {
        bloomIntensity: Math.min(fx.bloomIntensity ?? 0.2, 0.3),
        bloomSize: Math.min(fx.bloomSize ?? 16, 20),
        bloomThreshold: Math.max(fx.bloomThreshold ?? 0.88, 0.85),
        ccBrightness: Math.min(fx.ccBrightness ?? 0.02, 0.04),
        ccContrast: Math.min(fx.ccContrast ?? 0.05, 0.1),
        ccSaturation: Math.min(fx.ccSaturation ?? 0.05, 0.15),
        ccTintColor: fx.ccTintColor || [0.98, 1, 0.96],
      },
    },
  };
}

/** Returns a deterministic scene template if genre is tycoon/simulator, null otherwise. */
export function getGenreSceneTemplate(genre: string, gameBrief?: string): SceneTemplate | null {
  const g = (genre || '').toLowerCase();
  if (g.includes('tycoon') || g.includes('factory') || g.includes('business')) {
    const theme = detectTycoonTheme(gameBrief || '');
    return buildTycoonSceneTemplate(theme, gameBrief);
  }
  if (g.includes('simulator') || g.includes('collect') || g.includes('clicker') || g.includes('pet sim') || g.includes('mining')) {
    return buildSimulatorSceneTemplate();
  }
  if (g.includes('obby') || g.includes('parkour') || g.includes('obstacle')) {
    const theme = detectObbyTheme(gameBrief || '');
    return buildObbySceneTemplate(theme, gameBrief);
  }
  return null;
}
