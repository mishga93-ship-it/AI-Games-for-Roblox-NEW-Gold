// Session 387 Round 4 — Rarity tiers + personality captions.
// Boosts "AI built this unique vehicle" perception via:
//   1. Computed rarity badge based on style + driveStats combos
//   2. Single-shot Gemini caption ("Built for escaping emotional damage…")

import { logger } from 'firebase-functions/v2';
import { defineSecret } from 'firebase-functions/params';
import type { VehicleConfig, VehicleRarity, VehicleRarityTier } from './vehicleModular.types.js';

const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');

/** Compute rarity from style + driveStats combinations.
 *  Specific style+stat combos trigger themed tiers; otherwise fall back
 *  to speed-based generic tiers (common/rare/epic/mythic). */
export function computeRarity(config: VehicleConfig): VehicleRarity {
  const { style, driveStats, addons } = config;
  const speed = driveStats.maxSpeed ?? 80;
  const hasDrift = driveStats.drift === true;
  const hasMonster = driveStats.suspension === 'monster';
  const hasDestruction = driveStats.destruction === true;
  const hasBoost = typeof driveStats.boost === 'string' && driveStats.boost.length > 0;

  // Themed combos take priority over speed tiers.
  if (style === 'cyberpunk' && hasBoost && (addons.includes('underglow') || addons.includes('rear_spoiler_high'))) {
    return { tier: 'cyber_elite', label: 'CYBER ELITE', colorHex: '#00FFFF' };
  }
  if (style === 'sigma' && speed >= 130) {
    return { tier: 'sigma_spec', label: 'SIGMA SPEC', colorHex: '#C9A227' };
  }
  if (style === 'military' && hasMonster) {
    return { tier: 'military_tier', label: 'MILITARY TIER', colorHex: '#4A5D3A' };
  }
  if (style === 'apocalypse' && (hasDestruction || hasMonster)) {
    return { tier: 'chaos_vehicle', label: 'CHAOS VEHICLE', colorHex: '#9B5D34' };
  }
  if (hasDrift && speed >= 130) {
    return { tier: 'legendary_drift', label: 'LEGENDARY DRIFT', colorHex: '#FF6F00' };
  }

  // Speed-based fallback.
  if (speed >= 170) return { tier: 'mythic', label: 'MYTHIC', colorHex: '#E040FB' };
  if (speed >= 140) return { tier: 'epic', label: 'EPIC', colorHex: '#9C27B0' };
  if (speed >= 100) return { tier: 'rare', label: 'RARE', colorHex: '#2196F3' };
  return { tier: 'common', label: 'COMMON', colorHex: '#9E9E9E' };
}

function captionFallback(config: VehicleConfig): string {
  const examples = [
    `Built for escaping emotional damage at ${config.driveStats.maxSpeed ?? 80} mph.`,
    `When "fast" isn't enough.`,
    `Approved by zero cities.`,
    `Tax-deductible if you survive.`,
    `Insurance company won't return your calls.`,
    `Tested in places that don't exist anymore.`,
  ];
  const idx = Math.abs(
    [...config.preset + (config.plateText ?? '')].reduce((s, c) => (s * 31 + c.charCodeAt(0)) | 0, 7),
  ) % examples.length;
  return examples[idx];
}

interface GeminiResp {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

/** Generate a viral one-liner for the assembled vehicle. Single Gemini
 *  Flash call (~200ms). Falls back to deterministic templates on failure. */
export async function generatePersonalityCaption(config: VehicleConfig): Promise<string> {
  const apiKey = GEMINI_API_KEY.value();
  if (!apiKey) return captionFallback(config);
  const prompt = `Write ONE short, dark-humour viral caption for a Roblox vehicle.
Vehicle spec:
- chassis: ${config.preset}
- style: ${config.style}
- max speed: ${config.driveStats.maxSpeed} studs/s
- drift: ${config.driveStats.drift ? 'yes' : 'no'}
- boost: ${config.driveStats.boost || 'none'}
- suspension: ${config.driveStats.suspension}
- addons: ${config.addons.join(', ') || 'none'}
- colors: primary ${config.primaryColor}, accent ${config.accentColor}

Rules:
- 1 sentence, ≤ 90 chars
- TikTok/Twitter-friendly dark humour
- No emojis
- No quotation marks around the output
- Examples: "Built for escaping emotional damage at 220 mph." / "Tax-deductible if you survive." / "Approved by zero cities."

Output JUST the caption.`;
  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 1.1, maxOutputTokens: 60 },
        }),
      },
    );
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json() as GeminiResp;
    let text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    text = text.trim().replace(/^["']+|["']+$/g, '').replace(/\s+/g, ' ').trim();
    if (text.length < 8) return captionFallback(config);
    return text.slice(0, 100);
  } catch (err) {
    logger.warn('[ModularCaption] Gemini failed, using fallback', {
      error: err instanceof Error ? err.message : String(err),
    });
    return captionFallback(config);
  }
}

/** Map rarity tier to a one-line summary the iOS preview shows under the badge. */
export function describeRarity(rarity: VehicleRarity): string {
  switch (rarity.tier) {
    case 'cyber_elite':     return 'Neon-tier high-performance build with night-city aesthetic.';
    case 'sigma_spec':      return 'Matte luxury with sub-2s response.';
    case 'military_tier':   return 'Combat-grade chassis, monster suspension.';
    case 'chaos_vehicle':   return 'Field-rebuilt from scrap, runs on spite.';
    case 'legendary_drift': return 'Tires are an exhaust system at this point.';
    case 'mythic':          return 'Faster than the laws that apply to it.';
    case 'epic':            return 'High-speed coupe with serious presence.';
    case 'rare':            return 'Above-spec build for daily heroics.';
    case 'common':          return 'Solid, dependable, surprises nobody.';
  }
}

export const VEHICLE_MODULAR_RARITY_SECRETS = [GEMINI_API_KEY];
