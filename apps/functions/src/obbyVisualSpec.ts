// Obby Theme-from-Brief (Phase G, session 230).
// LLM generates an ObbyVisualSpec from user brief — palette, atmosphere,
// decoration concepts, decal search terms — instead of regex-matching one
// of 11 hardcoded OBBY_THEMES slots. Apify keyword-search hydrates each
// decoration concept with live Roblox decal IDs so generated obbies show
// real on-theme images (e.g. "creepy circus" → real clown face decals on
// platforms instead of a generic yellow-walls obby).
//
// Failure mode: any error → returns null → caller falls back to existing
// OBBY_THEMES regex-detection flow (no regression for working cases).

import { logger } from 'firebase-functions';
import { runSingleChatProvider } from './providers.js';
import { defaults } from './config.js';
import { fetchCatalogByKeyword, type CatalogCategory } from './robloxCatalog.js';

/** RGB triplet, each component 0..1. */
export type Rgb = [number, number, number];

export interface ObbyVisualSpec {
  themeName: string;
  layoutStyle: 'corridor' | 'zigzag' | 'islands' | 'tower' | 'loop' | 'gauntlet';
  palette: {
    platform: Rgb;
    checkpoint: Rgb;
    kill: Rgb;
    win: Rgb;
    accent1: Rgb;
    accent2: Rgb;
    decoration: Rgb;
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
    fogColor: Rgb;
    ambient: Rgb;
    outdoorAmbient: Rgb;
  };
  /** 3-6 short decoration descriptions ("funhouse mirror", "broken clown mask"). */
  decorationConcepts: string[];
  /** 3-5 search keywords for live Roblox decals ("clown face", "circus tent"). */
  decalSearchTerms: string[];
  /** Hydrated by hydrateVisualSpecWithLiveAssets — live Roblox decal IDs per term. */
  liveDecalsByTerm?: Record<string, number[]>;
  /** Source: 'llm' (full pipeline ok) or 'fallback-merge' (partial — caller decides). */
  source: 'llm' | 'fallback-merge';
}

const ALLOWED_MATERIALS = new Set([
  'SmoothPlastic', 'Plastic', 'Concrete', 'Slate', 'Granite', 'Metal',
  'Neon', 'Wood', 'Brick', 'Cobblestone', 'Grass', 'Sand', 'Glass', 'Marble',
  'Ice', 'Foil', 'CorrodedMetal', 'DiamondPlate', 'Pebble',
]);

const ALLOWED_LAYOUT_STYLES = new Set<ObbyVisualSpec['layoutStyle']>([
  'corridor',
  'zigzag',
  'islands',
  'tower',
  'loop',
  'gauntlet',
]);

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Parse a colour spec — accepts `[r,g,b]` (0..1 or 0..255), `"#rrggbb"`. */
function parseColor(value: unknown): Rgb | null {
  if (Array.isArray(value) && value.length === 3 && value.every((v) => typeof v === 'number' && Number.isFinite(v))) {
    const max = Math.max(...(value as number[]));
    const scale = max > 1.0001 ? 1 / 255 : 1;
    return [
      clamp01((value[0] as number) * scale),
      clamp01((value[1] as number) * scale),
      clamp01((value[2] as number) * scale),
    ];
  }
  if (typeof value === 'string') {
    const hex = value.trim().replace(/^#/, '');
    if (/^[0-9a-fA-F]{6}$/.test(hex)) {
      return [
        clamp01(parseInt(hex.slice(0, 2), 16) / 255),
        clamp01(parseInt(hex.slice(2, 4), 16) / 255),
        clamp01(parseInt(hex.slice(4, 6), 16) / 255),
      ];
    }
    if (/^[0-9a-fA-F]{3}$/.test(hex)) {
      return [
        clamp01(parseInt(hex[0] + hex[0], 16) / 255),
        clamp01(parseInt(hex[1] + hex[1], 16) / 255),
        clamp01(parseInt(hex[2] + hex[2], 16) / 255),
      ];
    }
  }
  return null;
}

function parseMaterial(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const found = Array.from(ALLOWED_MATERIALS).find((m) => m.toLowerCase() === value.toLowerCase());
  return found ?? fallback;
}

function parseLayoutStyle(value: unknown): ObbyVisualSpec['layoutStyle'] {
  if (typeof value !== 'string') return 'zigzag';
  const normalized = value.trim().toLowerCase();
  return ALLOWED_LAYOUT_STYLES.has(normalized as ObbyVisualSpec['layoutStyle'])
    ? normalized as ObbyVisualSpec['layoutStyle']
    : 'zigzag';
}

function parseStringArray(value: unknown, min: number, max: number): string[] {
  if (!Array.isArray(value)) return [];
  const out = value
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .map((v) => v.trim().slice(0, 60));
  if (out.length < min) return [];
  return out.slice(0, max);
}

function extractJsonBlock(raw: string): string | null {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first === -1 || last <= first) return null;
  return cleaned.slice(first, last + 1);
}

/**
 * Validates LLM JSON output. On any structural failure returns null —
 * caller falls back to existing OBBY_THEMES flow.
 */
export function tryParseObbyVisualSpec(raw: string): ObbyVisualSpec | null {
  const block = extractJsonBlock(raw);
  if (!block) return null;
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(block) as Record<string, unknown>;
  } catch {
    return null;
  }
  const themeName = typeof json.themeName === 'string' && json.themeName.trim().length > 0
    ? json.themeName.trim().slice(0, 80)
    : null;
  if (!themeName) return null;
  const layoutStyle = parseLayoutStyle(json.layoutStyle);

  const paletteRaw = (json.palette ?? {}) as Record<string, unknown>;
  const platform = parseColor(paletteRaw.platform);
  const checkpoint = parseColor(paletteRaw.checkpoint);
  const kill = parseColor(paletteRaw.kill);
  const win = parseColor(paletteRaw.win);
  const accent1 = parseColor(paletteRaw.accent1);
  const accent2 = parseColor(paletteRaw.accent2);
  const decoration = parseColor(paletteRaw.decoration);
  if (!platform || !checkpoint || !kill || !win || !accent1 || !accent2 || !decoration) return null;

  const matRaw = (json.materials ?? {}) as Record<string, unknown>;
  const materials = {
    platform: parseMaterial(matRaw.platform, 'SmoothPlastic'),
    checkpoint: parseMaterial(matRaw.checkpoint, 'SmoothPlastic'),
    kill: parseMaterial(matRaw.kill, 'Neon'),
    decoration: parseMaterial(matRaw.decoration, 'Concrete'),
  };

  const atmoRaw = (json.atmosphere ?? {}) as Record<string, unknown>;
  const fogColor = parseColor(atmoRaw.fogColor);
  const ambient = parseColor(atmoRaw.ambient);
  const outdoorAmbient = parseColor(atmoRaw.outdoorAmbient);
  if (!fogColor || !ambient || !outdoorAmbient) return null;
  const atmosphere = {
    clockTime: clamp(typeof atmoRaw.clockTime === 'number' ? atmoRaw.clockTime : 14, 0, 24),
    brightness: clamp(typeof atmoRaw.brightness === 'number' ? atmoRaw.brightness : 2, 0.5, 4),
    fogEnd: clamp(typeof atmoRaw.fogEnd === 'number' ? atmoRaw.fogEnd : 600, 100, 2000),
    fogColor,
    ambient,
    outdoorAmbient,
  };

  const decorationConcepts = parseStringArray(json.decorationConcepts, 1, 6);
  const decalSearchTerms = parseStringArray(json.decalSearchTerms, 1, 5);
  if (decorationConcepts.length === 0 || decalSearchTerms.length === 0) return null;

  return {
    themeName,
    layoutStyle,
    palette: { platform, checkpoint, kill, win, accent1, accent2, decoration },
    materials,
    atmosphere,
    decorationConcepts,
    decalSearchTerms,
    source: 'llm',
  };
}

const SYSTEM_PROMPT = `You are a Roblox visual director for obby (obstacle course) games. Given a user brief and game title, output a JSON object describing the visual theme. Output ONLY raw JSON — no prose, no markdown fences.

The schema is strict:
{
  "themeName": string (≤80 chars, e.g. "Creepy Circus Escape"),
  "layoutStyle": one of "corridor" | "zigzag" | "islands" | "tower" | "loop" | "gauntlet",
  "palette": {
    "platform":  [r,g,b] OR "#rrggbb",  // main walkable platform color
    "checkpoint":[r,g,b] OR "#rrggbb",  // checkpoint glow color (vivid)
    "kill":      [r,g,b] OR "#rrggbb",  // lava/danger surface color (often red)
    "win":       [r,g,b] OR "#rrggbb",  // finish-line color (vivid/celebratory)
    "accent1":   [r,g,b] OR "#rrggbb",  // primary thematic accent
    "accent2":   [r,g,b] OR "#rrggbb",  // secondary thematic accent
    "decoration":[r,g,b] OR "#rrggbb"   // ambient decoration / wall color
  },
  "materials": {
    "platform":  one of: SmoothPlastic | Plastic | Concrete | Slate | Granite | Metal | Wood | Brick | Cobblestone | Grass | Sand | Glass | Marble | Ice | Foil | CorrodedMetal | DiamondPlate | Pebble,
    "checkpoint":one of the same list (Neon allowed too),
    "kill":      one of the same list (Neon recommended),
    "decoration":one of the same list
  },
  "atmosphere": {
    "clockTime": number 0..24    (0=midnight, 12=noon),
    "brightness":number 0.5..4   (1.0..1.5 horror; 2.5..3.5 cheery),
    "fogEnd":    number 100..2000 (smaller = thicker fog; horror 200-400; cheery 800+),
    "fogColor":  [r,g,b] OR "#rrggbb",
    "ambient":   [r,g,b] OR "#rrggbb",
    "outdoorAmbient":[r,g,b] OR "#rrggbb"
  },
  "decorationConcepts": [3-6 short noun phrases describing physical decorations to place around the obby — e.g. "funhouse mirror", "broken clown mask", "ring of fire", "popcorn stand"],
  "decalSearchTerms": [3-5 short keywords to search for matching decals on the Roblox catalog — e.g. "clown face", "circus tent", "carnival poster"]
}

Rules:
- All RGB component values: 0..1 floats OR 0..255 ints OR hex strings. Mix is allowed.
- Pick palette + atmosphere + decoration concepts that match the user's brief and title precisely. A "creepy circus" must be dark/red/black with circus-specific decorations, NOT generic horror.
- decorationConcepts and decalSearchTerms must be on-theme, search-friendly Roblox catalog terms (avoid copyrighted franchise names — say "knight in armor" not "Iron Man").
- layoutStyle must change the actual obby silhouette, not just decoration:
  - corridor: only for explicit hallway/hospital/school/lab corridor briefs.
  - zigzag: factory, circus, city, toy, carnival, sewer, castle escapes.
  - islands: forest, swamp, floating, cave, dream, space rocks.
  - tower: vertical climb, elevator shaft, treehouse, castle tower, mountain.
  - loop: arena, carnival ring, circular ritual, boss arena.
  - gauntlet: trap-heavy, speedrun, lava run, factory conveyor.
- If the brief does not clearly request a corridor, DO NOT choose corridor. The generated map must not look like one straight strip.

PALETTE DISCIPLINE (CRITICAL — your output is rendered as the actual obby colors):
- HORROR / CREEPY / SCARY / ABANDONED / NIGHTMARE / HAUNTED / DARK briefs:
  - Platform color: any RGB component must NOT exceed 0.40. Examples: dark red [0.45,0.08,0.08], rusted brown [0.30,0.18,0.12], slate grey [0.18,0.20,0.22], bloodied black [0.12,0.04,0.04]. NEVER use pastels, bright cyan, lime green, light blue, sky blue, sunny yellow, hot pink. NO baseline "default" Roblox obby colors.
  - atmosphere.brightness: 0.8..1.4 ONLY. NEVER above 1.6.
  - atmosphere.clockTime: 0..2 OR 22..24 (midnight territory). NEVER 12 (noon).
  - atmosphere.fogEnd: 200..400 (thick fog). NEVER above 600.
  - atmosphere.fogColor + ambient + outdoorAmbient: all components < 0.20 each.
- CHEERY / KID-FRIENDLY / CANDY / RAINBOW / PARTY briefs:
  - brightness 2.5..3.5, clockTime 12..14, fogEnd 1000+, vibrant saturated palette.
- THEME-SPECIFIC ANCHORS:
  - circus → red/black/white (broken big-top), reject any green-blue
  - forest/woods → mossy green/deep brown/shadow, reject bright sky-blue
  - toy factory → rusted yellow/oil-grey/blood-red on dark concrete, reject pastels
  - hospital → sickly green/white/dried-blood, reject candy colors
  - abandoned lab / laboratory → gunmetal, dark concrete, glass cyan, toxic green chemical glow, warning yellow; reject candy spirals, circus swirls, pastel stickers, toy/carnival motifs
  - slime / goo / ooze chase → black-green floor, glowing toxic goo, lime route arrows, dark tunnel walls; use gauntlet layout; reject laboratory containment doors unless the user explicitly asked for a lab
  - space/cosmic → deep navy/violet/star-white, reject grass-green
  - cyberpunk/neon → black base + saturated magenta/cyan accents
- decorationConcepts MUST reference physical objects from the brief's setting (a forest brief gets "twisted oak", "moss-covered totem", "haunted lantern" — NOT "popcorn stand" or "gym equipment"). On-theme integrity > generic horror tropes.

- No commentary. JSON only.`;

interface GenerateOpts {
  brief: string;
  title?: string;
  /** Override LLM model. */
  model?: string;
  /** Preferred provider; attempts can fall through to other providers. */
  provider?: 'anthropic' | 'gemini' | 'openai';
  /** Per-provider timeout. Defaults to 60000 ms. */
  timeoutMs?: number;
}

// Session 233 follow-up: original 8s timeout was too aggressive — Cloud Logs
// showed `[ObbyVisualSpec] LLM timeout timeoutMs=8000` for default Opus model
// runs, leaving spec=null and falling back to OBBY_THEMES generic flow.
// Session 234: user explicitly preferred slower generation over repeated
// low-quality fallback maps. Session 239 raises this again: 60s per provider
// attempt and 3 providers, so quality can spend ~3 minutes before fallback.
const DEFAULT_TIMEOUT_MS = 60_000;

async function tryOneProvider(
  provider: 'anthropic' | 'gemini' | 'openai',
  model: string,
  system: string,
  user: string,
  timeoutMs: number,
): Promise<{ spec: ObbyVisualSpec; ms: number } | { error: string; ms: number }> {
  const startedAt = Date.now();
  try {
    const work = runSingleChatProvider(provider, { system, user }, model, { timeoutMs });
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));
    const result = await Promise.race([work, timeout]);
    if (!result) return { error: 'timeout', ms: Date.now() - startedAt };
    const text = (result as { text?: string }).text ?? '';
    if (!text) return { error: 'empty-text', ms: Date.now() - startedAt };
    const spec = tryParseObbyVisualSpec(text);
    if (!spec) return { error: 'invalid-schema', ms: Date.now() - startedAt };
    return { spec, ms: Date.now() - startedAt };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : String(err),
      ms: Date.now() - startedAt,
    };
  }
}

/**
 * Asks the LLM for an ObbyVisualSpec. Strategy: try Anthropic first (best
 * structured-output quality), then Gemini, then OpenAI with a fresh budget.
 * Returns null only when every provider fails, so caller falls back to
 * OBBY_THEMES regex flow as a last resort.
 */
export async function generateObbyVisualSpec(opts: GenerateOpts): Promise<ObbyVisualSpec | null> {
  const brief = (opts.brief || '').slice(0, 1500);
  if (brief.trim().length < 4) return null;
  const title = opts.title ? opts.title.trim().slice(0, 80) : '';
  const userMessage = title
    ? `Title: ${title}\n\nBrief:\n${brief}`
    : `Brief:\n${brief}`;

  const requestedProvider = opts.provider ?? 'anthropic';
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  // Build provider chain — preferred first, then alternate on failure.
  const chain: Array<{ provider: 'anthropic' | 'gemini' | 'openai'; model: string }> = [];
  if (requestedProvider === 'anthropic') {
    chain.push({ provider: 'anthropic', model: opts.model ?? defaults.anthropicModel });
    chain.push({ provider: 'gemini', model: defaults.geminiModel });
    chain.push({ provider: 'openai', model: defaults.chatModel });
  } else if (requestedProvider === 'gemini') {
    chain.push({ provider: 'gemini', model: opts.model ?? defaults.geminiModel });
    chain.push({ provider: 'anthropic', model: defaults.anthropicModel });
    chain.push({ provider: 'openai', model: defaults.chatModel });
  } else {
    chain.push({ provider: 'openai', model: opts.model ?? defaults.chatModel });
    chain.push({ provider: 'anthropic', model: defaults.anthropicModel });
    chain.push({ provider: 'gemini', model: defaults.geminiModel });
  }

  for (const { provider, model } of chain) {
    const result = await tryOneProvider(provider, model, SYSTEM_PROMPT, userMessage, timeoutMs);
    if ('spec' in result) {
      logger.info('[ObbyVisualSpec] LLM ok', {
        themeName: result.spec.themeName,
        layoutStyle: result.spec.layoutStyle,
        decorationConcepts: result.spec.decorationConcepts.length,
        decalSearchTerms: result.spec.decalSearchTerms.length,
        ms: result.ms, provider, model,
      });
      return result.spec;
    }
    logger.warn('[ObbyVisualSpec] provider attempt failed, trying next', {
      provider, model, error: result.error, ms: result.ms,
    });
  }

  logger.warn('[ObbyVisualSpec] all providers failed; falling back to OBBY_THEMES', {
    briefLen: brief.length, attemptedProviders: chain.map((c) => c.provider),
  });
  return null;
}

// Bumped from 12s → 35s after observing real Apify keyword fetches taking
// 30-40s for unusual queries ("toy factory" took 39s in production).
// Session 239: allow 90s so cold-cache themed decal hydration has a real
// chance before falling back to no live decals. Deterministic kits (lab,
// school, hospital, slime) skip hydration entirely.
const HYDRATION_TIMEOUT_MS = 90_000;
const PER_TERM_LIMIT = 4;

/**
 * Hydrates `decalSearchTerms` with live Roblox decal IDs via Apify keyword
 * search. Sets `spec.liveDecalsByTerm` in-place AND returns the spec.
 * Failures (Apify down, rate-limited) are tolerated — terms with no hits
 * simply don't appear in the result map. The spec is always usable.
 */
export async function hydrateVisualSpecWithLiveAssets(spec: ObbyVisualSpec): Promise<ObbyVisualSpec> {
  if (!spec.decalSearchTerms.length) return spec;
  const startedAt = Date.now();
  const category: CatalogCategory = 'Decals';
  const fetches = spec.decalSearchTerms.map(async (term) => {
    try {
      const result = await fetchCatalogByKeyword({ keyword: term, category, limit: PER_TERM_LIMIT });
      const ids = result.items
        .map((it) => (typeof it.id === 'number' ? it.id : NaN))
        .filter((id) => Number.isFinite(id) && id > 0);
      return { term, ids };
    } catch (err) {
      logger.warn('[ObbyVisualSpec] hydrate term failed', {
        term, error: err instanceof Error ? err.message : String(err),
      });
      return { term, ids: [] as number[] };
    }
  });
  const timeout = new Promise<{ term: string; ids: number[] }[]>((resolve) =>
    setTimeout(() => resolve([]), HYDRATION_TIMEOUT_MS),
  );
  const results = await Promise.race([Promise.all(fetches), timeout]);

  const map: Record<string, number[]> = {};
  for (const r of results) {
    if (r.ids.length > 0) map[r.term] = r.ids;
  }
  spec.liveDecalsByTerm = map;
  logger.info('[ObbyVisualSpec] hydration done', {
    terms: spec.decalSearchTerms.length,
    hydratedTerms: Object.keys(map).length,
    totalIds: Object.values(map).reduce((acc, ids) => acc + ids.length, 0),
    ms: Date.now() - startedAt,
  });
  return spec;
}
