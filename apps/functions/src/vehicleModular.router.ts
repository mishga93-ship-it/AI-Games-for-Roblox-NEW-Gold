// Session 387 — AI router: prompt → VehicleConfig JSON.
//
// Gemini Flash takes the user's vehicle prompt + title + style hints,
// returns a fully-specified VehicleConfig (preset chassis + addons +
// drive stats + colors + style). If the LLM fails or returns garbage,
// falls back to deterministic keyword router (re-uses pickVehicleTemplate
// + sensible defaults).

import { logger } from 'firebase-functions/v2';
import { defineSecret } from 'firebase-functions/params';
import type {
  BrainrotSlots,
  BrainrotEffectId,
  BrainrotEngineStyle,
  BrainrotSoundId,
  BrainrotWheelStyle,
  VehicleAddonId,
  VehicleConfig,
  VehiclePresetId,
  VehicleStyleId,
} from './vehicleModular.types.js';
import { BRAINROT_PROCEDURAL_BODIES, BRAINROT_PROCEDURAL_HEADS } from './vehicleModular.types.js';
import { VEHICLE_PRESETS, addonsForPreset, VEHICLE_ADDONS } from './vehicleModular.library.js';
import { pickVehicleTemplate } from './vehicleTemplateRouter.js';

const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');

const VALID_PRESETS = new Set<string>(Object.keys(VEHICLE_PRESETS));
const VALID_STYLES: ReadonlyArray<VehicleStyleId> = [
  'default', 'cyberpunk', 'sigma', 'military', 'anime',
  'cursed', 'luxury', 'apocalypse', 'retro',
];
const VALID_STYLES_SET = new Set<string>(VALID_STYLES);

const HEX_RE = /^#?[0-9a-fA-F]{6}$/;

function normalizeHex(s: unknown, fallback: string): string {
  if (typeof s !== 'string' || !HEX_RE.test(s)) return fallback;
  return s.startsWith('#') ? s.toUpperCase() : `#${s.toUpperCase()}`;
}

function clamp(n: unknown, lo: number, hi: number, fallback: number): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, n));
}

function buildRouterPrompt(args: {
  userPrompt: string;
  title: string;
  primaryHexHint?: string;
  accentHexHint?: string;
}): string {
  const presetMenu = Object.values(VEHICLE_PRESETS)
    .map((p) => `- "${p.id}": ${p.label}`)
    .join('\n');
  const styleMenu = VALID_STYLES.map((s) => `- "${s}"`).join('\n');
  const addonMenu = Object.values(VEHICLE_ADDONS)
    .map((a) => `- "${a.id}" (${a.mount}): ${a.description}. Fits: ${a.fitsPresets.join(', ')}`)
    .join('\n');

  return `You are a Roblox vehicle stylist. Given a user's prompt, you choose:
1. A preset chassis (one of the 13 below).
2. A style pack (palette + decal feel).
3. 0-4 addons that fit the chosen preset (only ones with fitsPresets including your choice).
4. Drive stats appropriate for the vehicle (speeds in studs/sec).
5. Primary + accent colors (hex).
6. Optional 8-char license plate text.

USER PROMPT: "${args.userPrompt}"
USER TITLE: "${args.title || '(none)'}"
USER COLOR HINTS: primary=${args.primaryHexHint || '(none)'} accent=${args.accentHexHint || '(none)'}

PRESETS:
${presetMenu}

STYLES:
${styleMenu}

ADDONS:
${addonMenu}

OUTPUT — JSON only, no markdown:
{
  "preset": "<one of preset ids>",
  "style": "<one of style ids>",
  "primaryColor": "#RRGGBB",
  "accentColor": "#RRGGBB",
  "addons": ["<addonId>", ...],   // 0-4, only those whose fitsPresets includes preset
  "driveStats": {
    "maxSpeed": <50-200>,
    "drift": <true|false>,
    "boost": "<'' | 'flame' | 'neon' | 'smoke'>",
    "suspension": "<'soft'|'standard'|'stiff'|'monster'>",
    "passengerSeats": <0-6>,
    "destruction": <true|false>
  },
  "plateText": "<≤8 chars or empty>",
  "rationale": "<1 sentence why these choices fit the prompt>"
}`;
}

interface GeminiTextResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

async function callGeminiForConfig(prompt: string): Promise<string> {
  const apiKey = GEMINI_API_KEY.value();
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, responseMimeType: 'application/json' },
      }),
    },
  );
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Gemini HTTP ${resp.status}: ${text.slice(0, 200)}`);
  }
  const json = await resp.json() as GeminiTextResponse;
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  if (!text) throw new Error('Gemini returned empty text');
  return text;
}

/** Sanitize a raw LLM payload into a valid VehicleConfig. Tolerates extra
 *  fields, missing fields, bad enums (falls back to preset defaults). */
function sanitizeConfig(raw: unknown, fallbackPreset: VehiclePresetId): VehicleConfig {
  const o = (raw ?? {}) as Record<string, unknown>;
  const presetId = (typeof o.preset === 'string' && VALID_PRESETS.has(o.preset)
    ? o.preset : fallbackPreset) as VehiclePresetId;
  const preset = VEHICLE_PRESETS[presetId];
  const style = (typeof o.style === 'string' && VALID_STYLES_SET.has(o.style)
    ? o.style : preset.defaultStyle) as VehicleStyleId;

  // Addons: filter to ones the AI suggested AND that fit the chosen preset.
  const validForPreset = new Set(addonsForPreset(presetId).map((a) => a.id));
  const addonsRaw = Array.isArray(o.addons) ? o.addons : [];
  const addons: VehicleAddonId[] = [];
  for (const a of addonsRaw) {
    if (typeof a !== 'string') continue;
    if (!validForPreset.has(a as VehicleAddonId)) continue;
    if (addons.includes(a as VehicleAddonId)) continue;
    addons.push(a as VehicleAddonId);
    if (addons.length >= 4) break;
  }

  const ds = (o.driveStats ?? {}) as Record<string, unknown>;
  const boostRaw = typeof ds.boost === 'string' ? ds.boost : '';
  const boost = (['', 'flame', 'neon', 'smoke', 'nitro'].includes(boostRaw) ? boostRaw : preset.baselineStats.boost) as
    '' | 'flame' | 'neon' | 'smoke' | 'nitro';
  const suspensionRaw = typeof ds.suspension === 'string' ? ds.suspension : '';
  const suspension = (['soft', 'standard', 'stiff', 'monster'].includes(suspensionRaw)
    ? suspensionRaw : preset.baselineStats.suspension) as 'soft' | 'standard' | 'stiff' | 'monster';

  const driveStats = {
    maxSpeed: clamp(ds.maxSpeed, 30, 220, preset.baselineStats.maxSpeed),
    drift: typeof ds.drift === 'boolean' ? ds.drift : preset.baselineStats.drift,
    boost,
    suspension,
    passengerSeats: Math.round(clamp(ds.passengerSeats, 0, 6, preset.baselineStats.passengerSeats)),
    destruction: typeof ds.destruction === 'boolean' ? ds.destruction : preset.baselineStats.destruction,
  };

  const primaryColor = normalizeHex(o.primaryColor, '#E03A2E');
  const accentColor = normalizeHex(o.accentColor, '#1A1A1A');

  const plateText = typeof o.plateText === 'string'
    ? o.plateText.replace(/[^A-Za-z0-9 ]/g, '').slice(0, 8).toUpperCase()
    : '';

  const rationale = typeof o.rationale === 'string' && o.rationale.length > 0
    ? o.rationale.slice(0, 200)
    : `Default ${preset.label} build.`;

  return {
    preset: presetId, style, primaryColor, accentColor, addons,
    driveStats, plateText: plateText || undefined, rationale,
  };
}

/** Deterministic fallback when Gemini fails or returns nothing parseable.
 *  Re-uses pickVehicleTemplate for the chassis choice, then derives sane
 *  defaults from baseline stats. No addons (safer than guessing wrong). */
function fallbackConfig(args: { prompt: string; title: string }): VehicleConfig {
  const pick = pickVehicleTemplate({ prompt: args.prompt, title: args.title });
  // Map vehicleTemplateRouter's templateName to our preset id.
  const templateToPreset: Record<string, VehiclePresetId> = {
    Sedan: 'sedan', SportsCar: 'sports_car', Supercar: 'supercar',
    SUV: 'suv', PickupTruck: 'pickup_truck', Van: 'van',
    DuneBuggy: 'dune_buggy', LightUtilityVehicle: 'light_utility_vehicle',
    PoliceCar: 'police_car', Motorcycle: 'motorcycle', Boat: 'boat',
    Plane: 'plane', Tank: 'tank',
  };
  const presetId = templateToPreset[pick.templateName] ?? 'sedan';
  const preset = VEHICLE_PRESETS[presetId];
  return {
    preset: presetId,
    style: preset.defaultStyle,
    primaryColor: pick.primaryHex,
    accentColor: '#1A1A1A',
    addons: [],
    driveStats: { ...preset.baselineStats },
    plateText: pick.accessories?.plateText || undefined,
    rationale: `Fallback router (LLM unavailable). Static keyword match: ${pick.reason}`,
  };
}

/** Main entry — try Gemini, fall back deterministically. */
export async function routeVehicleConfig(args: {
  prompt: string;
  title?: string;
  primaryHexHint?: string;
  accentHexHint?: string;
}): Promise<VehicleConfig> {
  const promptText = args.prompt ?? '';
  const title = args.title ?? '';
  if (!promptText.trim()) {
    logger.warn('[VehicleModularRouter] empty prompt — using fallback');
    return fallbackConfig({ prompt: '', title });
  }
  try {
    const llmPrompt = buildRouterPrompt({
      userPrompt: promptText, title,
      primaryHexHint: args.primaryHexHint, accentHexHint: args.accentHexHint,
    });
    const rawJson = await callGeminiForConfig(llmPrompt);
    let parsed: unknown;
    try { parsed = JSON.parse(rawJson); }
    catch (jsonErr) {
      // Try to extract first {...} block
      const start = rawJson.indexOf('{');
      const end = rawJson.lastIndexOf('}');
      if (start >= 0 && end > start) {
        parsed = JSON.parse(rawJson.slice(start, end + 1));
      } else { throw jsonErr; }
    }
    // Determine fallback preset from prompt keywords for sanitizer.
    const fb = fallbackConfig({ prompt: promptText, title });
    const sanitized = sanitizeConfig(parsed, fb.preset);
    logger.info('[VehicleModularRouter] Gemini config OK', {
      preset: sanitized.preset, style: sanitized.style, addonCount: sanitized.addons.length,
      maxSpeed: sanitized.driveStats.maxSpeed,
    });
    return sanitized;
  } catch (err) {
    logger.warn('[VehicleModularRouter] Gemini failed — using deterministic fallback', {
      error: err instanceof Error ? err.message : String(err),
    });
    return fallbackConfig({ prompt: promptText, title });
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Session 425 — Brainrot slot router (Variant 3).
//
// When the prompt reads as absurd/brainrot/meme, this produces a BrainrotSlots
// JSON (body/head/wheels/engine/effects/sound + chaos/brainrot levels). body &
// head are free keywords (Tier-1 procedural if known, else Tier-2 Meshy-cache
// in Phase B). wheels/engine/effects/sound are strict enums — always Tier-1.
// ───────────────────────────────────────────────────────────────────────────

const BRAINROT_WHEELS: ReadonlyArray<BrainrotWheelStyle> = ['normal', 'monster_truck', 'tiny', 'tank_tracks', 'hover', 'rocket'];
const BRAINROT_ENGINES: ReadonlyArray<BrainrotEngineStyle> = ['normal', 'jet', 'rocket', 'nuclear', 'propeller'];
const BRAINROT_EFFECTS: ReadonlyArray<BrainrotEffectId> = ['rainbow', 'fire', 'lightning', 'confetti', 'sparkles', 'smoke'];
const BRAINROT_SOUNDS: ReadonlyArray<BrainrotSoundId> = ['phonk', 'brainrot', 'meme_horn', 'epic', 'chaos'];
const BRAINROT_BODY_MENU: ReadonlyArray<string> = ['car', ...BRAINROT_PROCEDURAL_BODIES];
const BRAINROT_HEAD_MENU: ReadonlyArray<string> = ['', ...BRAINROT_PROCEDURAL_HEADS];

/** Heuristic: does the user want an absurd / brainrot / meme vehicle?
 *  No \b (doesn't work across Cyrillic) — distinctive substrings only. */
export function isBrainrotIntent(prompt: string, title?: string): boolean {
  const lc = `${prompt} ${title ?? ''}`.toLowerCase();
  return /(brain ?rot|brainrot|мем|meme|absurd|абсурд|funny|смешн|весёл|весел|viral|вирус|tiktok|тикток|тик ?ток|skibidi|скибиди|sigma|сигма|rizz|gyatt|ohio|chaos|хаос|рандомн|cursed|проклят|tralalero|bombardiro|tung ?tung|капибар|capybara)/.test(lc);
}

function buildBrainrotPrompt(args: { userPrompt: string; title: string }): string {
  return `You are a Roblox TikTok Brainrot vehicle generator. Turn the user's idea into ONE absurd, funny, viral, DRIVABLE vehicle.

Rules:
- Return ONLY valid JSON. No markdown, no explanation.
- Make combinations funny and unexpected. Prioritize memes, animals, food, household objects, internet culture.
- Avoid realistic/boring designs.

USER PROMPT: "${args.userPrompt}"
USER TITLE: "${args.title || '(none)'}"

Allowed slot values (use EXACTLY these strings; lowercase):
- body: ${JSON.stringify([...BRAINROT_BODY_MENU])} — OR any other single funny object noun ("washing_machine"). "car" = plain chassis, no novelty shell.
- head: ${JSON.stringify([...BRAINROT_HEAD_MENU])} — OR any other single animal/meme noun. "" = no head.
- wheels: ${JSON.stringify([...BRAINROT_WHEELS])}
- engine: ${JSON.stringify([...BRAINROT_ENGINES])}
- effects: subset (0-4) of ${JSON.stringify([...BRAINROT_EFFECTS])}
- sound: one of ${JSON.stringify([...BRAINROT_SOUNDS])}

OUTPUT — JSON only:
{
  "vehicle_name": "<short viral name, <=40 chars>",
  "body": "<body>",
  "head": "<head or empty>",
  "wheels": "<wheels>",
  "engine": "<engine>",
  "effects": ["<effect>", ...],
  "sound": "<sound>",
  "size_multiplier": <1-5>,
  "chaos_level": <1-10>,
  "brainrot_level": <1-10>
}`;
}

function sanitizeEnumSlot<T extends string>(v: unknown, allowed: ReadonlyArray<T>, fallback: T): T {
  return typeof v === 'string' && (allowed as ReadonlyArray<string>).includes(v) ? (v as T) : fallback;
}

/** Lowercase, strip junk, snake_case, cap length. For free body/head keywords. */
function sanitizeKeyword(v: unknown, fallback: string): string {
  if (typeof v !== 'string') return fallback;
  const k = v.toLowerCase().replace(/[^a-z0-9_ ]/g, '').trim().replace(/\s+/g, '_').slice(0, 32);
  return k || fallback;
}

function sanitizeBrainrotSlots(raw: unknown): BrainrotSlots {
  const o = (raw ?? {}) as Record<string, unknown>;
  const effects: BrainrotEffectId[] = [];
  for (const e of (Array.isArray(o.effects) ? o.effects : [])) {
    if (typeof e !== 'string' || !(BRAINROT_EFFECTS as ReadonlyArray<string>).includes(e)) continue;
    const eid = e as BrainrotEffectId;
    if (!effects.includes(eid)) effects.push(eid);
    if (effects.length >= 4) break;
  }
  const headRaw = typeof o.head === 'string' ? o.head : '';
  return {
    vehicleName: typeof o.vehicle_name === 'string' && o.vehicle_name.trim().length > 0
      ? o.vehicle_name.slice(0, 40) : 'Brainrot Machine',
    body: sanitizeKeyword(o.body, 'banana'),
    head: headRaw.trim() === '' ? '' : sanitizeKeyword(headRaw, 'capybara'),
    wheels: sanitizeEnumSlot(o.wheels, BRAINROT_WHEELS, 'monster_truck'),
    engine: sanitizeEnumSlot(o.engine, BRAINROT_ENGINES, 'jet'),
    effects: effects.length > 0 ? effects : ['rainbow'],
    sound: sanitizeEnumSlot(o.sound, BRAINROT_SOUNDS, 'phonk'),
    sizeMultiplier: clamp(o.size_multiplier, 1, 5, 2),
    chaosLevel: Math.round(clamp(o.chaos_level, 1, 10, 7)),
    brainrotLevel: Math.round(clamp(o.brainrot_level, 1, 10, 8)),
  };
}

/** Deterministic fallback when Gemini is unavailable: keyword-match the menus. */
function fallbackBrainrotSlots(prompt: string): BrainrotSlots {
  const lc = prompt.toLowerCase();
  const pick = (menu: ReadonlyArray<string>, fallback: string): string => {
    for (const m of menu) { if (m && lc.includes(m.replace(/_/g, ' '))) return m; }
    return fallback;
  };
  return {
    vehicleName: 'Brainrot Machine',
    body: pick(BRAINROT_PROCEDURAL_BODIES, 'banana'),
    head: pick(BRAINROT_PROCEDURAL_HEADS, 'capybara'),
    wheels: 'monster_truck', engine: 'jet',
    effects: ['rainbow', 'confetti'], sound: 'phonk',
    sizeMultiplier: 2, chaosLevel: 8, brainrotLevel: 9,
  };
}

/** Main brainrot slot router — Gemini Flash with deterministic fallback. */
export async function routeBrainrotSlots(args: { prompt: string; title?: string }): Promise<BrainrotSlots> {
  const prompt = args.prompt ?? '';
  const title = args.title ?? '';
  if (!prompt.trim()) return fallbackBrainrotSlots('');
  try {
    const rawJson = await callGeminiForConfig(buildBrainrotPrompt({ userPrompt: prompt, title }));
    let parsed: unknown;
    try { parsed = JSON.parse(rawJson); }
    catch {
      const s = rawJson.indexOf('{');
      const e = rawJson.lastIndexOf('}');
      if (s >= 0 && e > s) parsed = JSON.parse(rawJson.slice(s, e + 1));
      else throw new Error('no JSON object in response');
    }
    const slots = sanitizeBrainrotSlots(parsed);
    logger.info('[BrainrotRouter] Gemini slots OK', {
      body: slots.body, head: slots.head, wheels: slots.wheels,
      engine: slots.engine, effects: slots.effects.length,
    });
    return slots;
  } catch (err) {
    logger.warn('[BrainrotRouter] Gemini failed — deterministic fallback', {
      error: err instanceof Error ? err.message : String(err),
    });
    return fallbackBrainrotSlots(prompt);
  }
}

/** Re-export for callers that need the secret declared (firebase function gen). */
export const VEHICLE_MODULAR_ROUTER_SECRETS = [GEMINI_API_KEY];
