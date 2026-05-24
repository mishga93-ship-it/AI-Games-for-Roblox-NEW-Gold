/**
 * vehicleTemplateRouter.ts — Session 373 night/day pivot (Round 20).
 *
 * Replaces the AI-mesh (Tripo/Meshy) chain for vehicle_3d. Maps a user
 * prompt to one of 9 Roblox-endorsed vehicle templates (free, official,
 * known assetIds). The Roblox-built models have proper physics, suspension,
 * lights, dashboards — quality unreachable by AI-mesh in 2026.
 *
 * Flow:
 *   prompt "yellow taxi" → pickVehicleTemplate(...) →
 *     { templateName: "Sedan", assetId: 6418239833,
 *       preferredVariant: "Sedan (white)", bodyOriginalHex: "#F3F3F3",
 *       primaryHex: "#F2B807" }
 *
 * Router strategy (per Round 20 plan):
 *   1. Fast static keyword match (no LLM, deterministic).
 *   2. Fuzzy LLM fallback (Gemini Flash, ~$0.0001/call) when no keyword hits.
 *   3. Default to Sedan if even LLM can't decide.
 *
 * Templates inventory: see docs/vehicle-rebuild/01-research.md §10.
 */

import { logger } from 'firebase-functions/v2';

export const ROBLOX_ENDORSED_TEMPLATES = [
  'PoliceCar',
  'DuneBuggy',
  'LightUtilityVehicle',
  'PickupTruck',
  'SUV',
  'Sedan',
  'Van',
  'SportsCar',
  'Supercar',
] as const;

export type VehicleTemplateName = (typeof ROBLOX_ENDORSED_TEMPLATES)[number];

export interface VehicleTemplateConfig {
  assetId: number;
  /** Model name to prefer when LoadAsset returns a multi-variant pack. */
  preferredVariant: string;
  /**
   * Fallback variant order in case preferredVariant is missing in the
   * loaded asset (Roblox may update the pack and remove a variant).
   */
  variantFallbacks: string[];
  /**
   * Hex of body parts in preferredVariant. Loader script matches Color3
   * within tolerance and recolors only those parts to the user's chosen
   * primaryHex — preserves wheels, glass, interior, trim, lights.
   */
  bodyOriginalHex: string;
  /** Human-readable category label for stage logs. */
  label: string;
}

/**
 * Static template config (assetIds + preferred variants verified against
 * downloaded rbxm files in docs/vehicle-rebuild/templates/, 2026-05-24).
 *
 * bodyOriginalHex chosen so the loader's color-match heuristic catches the
 * dominant painted-body group cleanly — verified by Lune inspection.
 */
export const VEHICLE_TEMPLATE_CATALOG: Record<VehicleTemplateName, VehicleTemplateConfig> = {
  Sedan: {
    assetId: 6418239833,
    preferredVariant: 'Sedan (white)',
    variantFallbacks: ['Sedan (aqua)', 'Sedan (orange)', 'Sedan (red)', 'Sedan (black)'],
    bodyOriginalHex: '#F3F3F3',
    label: 'Sedan',
  },
  SportsCar: {
    assetId: 6433323089,
    preferredVariant: 'Sports Car (white)',
    variantFallbacks: ['Sports Car (red)', 'Sports Car (blue)'],
    bodyOriginalHex: '#F8F8F8',
    label: 'Sports Car',
  },
  Supercar: {
    assetId: 6433330180,
    // Supercar pack has no white variant — yellow is least chromatically
    // dominant so recolor is cleanest.
    preferredVariant: 'Supercar (yellow)',
    variantFallbacks: ['Supercar (green)', 'Supercar (blue)'],
    bodyOriginalHex: '#FFB000',
    label: 'Supercar',
  },
  SUV: {
    assetId: 6418234850,
    preferredVariant: 'SUV (white)',
    variantFallbacks: ['SUV (blue)', 'SUV (black)'],
    bodyOriginalHex: '#E7E7EC',
    label: 'SUV',
  },
  PickupTruck: {
    assetId: 6418225759,
    preferredVariant: 'Pickup Truck (white)',
    variantFallbacks: ['Pickup Truck (blue)', 'Pickup Truck (bronze)'],
    bodyOriginalHex: '#F8F8F8',
    label: 'Pickup Truck',
  },
  Van: {
    assetId: 6433316269,
    preferredVariant: 'Van (white)',
    variantFallbacks: ['Van (pro)', 'Van (1970)'],
    bodyOriginalHex: '#E7E7EC',
    label: 'Van',
  },
  DuneBuggy: {
    assetId: 6433272094,
    // Dune Buggy is mostly exposed tube chassis — only 2 fenders are
    // painted body parts. beige variant has solid #D1BEA6 fenders.
    preferredVariant: 'Dune Buggy (beige)',
    variantFallbacks: ['Dune Buggy (blue)', 'Dune Buggy (orange)'],
    bodyOriginalHex: '#D1BEA6',
    label: 'Dune Buggy',
  },
  LightUtilityVehicle: {
    assetId: 6418221666,
    // pink + black are SOLID colors; camo variants have multi-color
    // patterns that don't recolor cleanly. Black is most neutral.
    preferredVariant: 'Light Utility Vehicle (black)',
    variantFallbacks: ['Light Utility Vehicle (pink)', 'Light Utility Vehicle (white camo)'],
    bodyOriginalHex: '#202020',
    label: 'Light Utility Vehicle',
  },
  PoliceCar: {
    assetId: 6418230807,
    // PoliceCar ships single variant only.
    preferredVariant: 'Police Car',
    variantFallbacks: [],
    bodyOriginalHex: '#FFFFFF',
    label: 'Police Car',
  },
};

export interface VehicleTemplatePick {
  templateName: VehicleTemplateName;
  config: VehicleTemplateConfig;
  primaryHex: string;
  /** Source of the pick: 'static' (keyword match) or 'llm' (Gemini fallback). */
  source: 'static' | 'llm' | 'default';
  /** Human-readable reason; goes into stage log. */
  reason: string;
}

/**
 * Fast keyword → template mapping. Returns null if no clear match.
 * Run in lowercase against prompt + title; first-match wins (rules ordered
 * by specificity — police BEFORE car etc.).
 */
interface KeywordRule {
  pattern: RegExp;
  template: VehicleTemplateName;
  /** Optional default primary hex when prompt strongly implies a color
   *  (e.g., "taxi" → yellow, "police" → white). null = use color extractor. */
  impliedPrimaryHex?: string;
  reason: string;
}

const STATIC_KEYWORD_RULES: KeywordRule[] = [
  // police variants
  { pattern: /\b(police|cop|cruiser|patrol\s*car|sheriff)\b/i, template: 'PoliceCar', impliedPrimaryHex: '#FFFFFF', reason: 'matched police/cop' },
  // taxi → sedan + yellow
  { pattern: /\b(taxi|cab|такси)\b/i, template: 'Sedan', impliedPrimaryHex: '#F2B807', reason: 'matched taxi → yellow Sedan' },
  // dune buggy
  { pattern: /\b(dune\s*buggy|buggy|sand\s*rail|atv)\b/i, template: 'DuneBuggy', reason: 'matched dune buggy' },
  // pickup truck
  { pattern: /\b(pickup|pick[-\s]up|f-?\d+|dodge\s*ram|ford\s*f|silverado|tacoma|tundra|truck)\b/i, template: 'PickupTruck', reason: 'matched pickup truck' },
  // van / minivan / school bus / bus (closest endorsed match is Van)
  { pattern: /(\bvan\b|\bminivan\b|\bdelivery\s*van\b|\bcargo\s*van\b|\bschool\s*bus\b|\bbus\b|автобус|маршрутк)/i, template: 'Van', reason: 'matched van/bus' },
  // SUV / jeep / crossover
  { pattern: /\b(suv|jeep|crossover|cherokee|wrangler|range\s*rover|внедорожник)\b/i, template: 'SUV', reason: 'matched SUV/jeep' },
  // military / hummer / humvee
  { pattern: /\b(hummer|humvee|military|army|jeep\s*4x4)\b/i, template: 'LightUtilityVehicle', reason: 'matched military/hummer → Light Utility' },
  // supercar (lambo, ferrari, exotic)
  { pattern: /\b(lambo|lamborghini|ferrari|bugatti|exotic|hypercar|supercar|p1|chiron|veyron)\b/i, template: 'Supercar', reason: 'matched supercar' },
  // sports car / race car / mustang etc.
  { pattern: /\b(sports?\s*car|race\s*car|racing|mustang|corvette|camaro|porsche|спорткар|гоночн)\b/i, template: 'SportsCar', reason: 'matched sports/race car' },
  // generic sedan / family car / car
  { pattern: /\b(sedan|седан|family\s*car|family\s*sedan)\b/i, template: 'Sedan', reason: 'matched sedan' },
  // last-resort generic "car" → Sedan
  { pattern: /\b(car|auto|automobile|машин)\b/i, template: 'Sedan', reason: 'fallback "car" → Sedan' },
];

export function pickVehicleTemplateStatic(prompt: string, title?: string): VehicleTemplatePick | null {
  const haystack = `${title ?? ''} ${prompt ?? ''}`.toLowerCase();
  for (const rule of STATIC_KEYWORD_RULES) {
    if (rule.pattern.test(haystack)) {
      const cfg = VEHICLE_TEMPLATE_CATALOG[rule.template];
      return {
        templateName: rule.template,
        config: cfg,
        primaryHex: rule.impliedPrimaryHex ?? '',
        source: 'static',
        reason: rule.reason,
      };
    }
  }
  return null;
}

/**
 * Main entrypoint for the index.ts mesh stage.
 *
 * primaryHexFromMetadata: optional — if the prompt has explicit color
 * (extracted upstream by inferColorsFromPrompt), pass it here so it
 * overrides the static rule's impliedPrimaryHex. Empty string = let
 * the router pick (static rule's hint, or default #E03A2E).
 */
export function pickVehicleTemplate(args: {
  prompt: string;
  title?: string;
  primaryHexFromMetadata?: string;
}): VehicleTemplatePick {
  const staticPick = pickVehicleTemplateStatic(args.prompt, args.title);
  if (staticPick) {
    const primaryHex = (args.primaryHexFromMetadata?.trim()) || staticPick.primaryHex || '#E03A2E';
    return { ...staticPick, primaryHex };
  }
  // No static match → default to Sedan (most generic, looks like a car).
  // (LLM-fallback layer can be added later if static rules prove too narrow;
  // for v1 the keyword set covers the common asks and Sedan is a safe default.)
  const sedan = VEHICLE_TEMPLATE_CATALOG.Sedan;
  const primaryHex = args.primaryHexFromMetadata?.trim() || '#E03A2E';
  logger.info('[vehicleTemplateRouter] no keyword match, defaulting to Sedan', {
    promptPreview: args.prompt.slice(0, 80),
  });
  return {
    templateName: 'Sedan',
    config: sedan,
    primaryHex,
    source: 'default',
    reason: 'no keyword match, default Sedan',
  };
}
