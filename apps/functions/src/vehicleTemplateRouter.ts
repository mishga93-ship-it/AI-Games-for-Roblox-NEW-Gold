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
import { readFileSync } from 'node:fs';
import { resolve as resolvePath, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

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
  /**
   * Round 20 v3: filename inside apps/functions/templates/ that contains
   * the pre-downloaded template rbxm bytes. Used at pick_vehicle_template
   * stage to read bytes + base64-encode for embedded model so the user
   * sees the actual Roblox-endorsed vehicle in Edit Mode (not just at Play).
   */
  templateRbxmFilename: string;
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
    templateRbxmFilename: 'Sedan-6418239833.rbxm',
  },
  SportsCar: {
    assetId: 6433323089,
    preferredVariant: 'Sports Car (white)',
    variantFallbacks: ['Sports Car (red)', 'Sports Car (blue)'],
    bodyOriginalHex: '#F8F8F8',
    label: 'Sports Car',
    templateRbxmFilename: 'SportsCar-6433323089.rbxm',
  },
  Supercar: {
    assetId: 6433330180,
    preferredVariant: 'Supercar (yellow)',
    variantFallbacks: ['Supercar (green)', 'Supercar (blue)'],
    bodyOriginalHex: '#FFB000',
    label: 'Supercar',
    templateRbxmFilename: 'Supercar-6433330180.rbxm',
  },
  SUV: {
    assetId: 6418234850,
    preferredVariant: 'SUV (white)',
    variantFallbacks: ['SUV (blue)', 'SUV (black)'],
    bodyOriginalHex: '#E7E7EC',
    label: 'SUV',
    templateRbxmFilename: 'SUV-6418234850.rbxm',
  },
  PickupTruck: {
    assetId: 6418225759,
    preferredVariant: 'Pickup Truck (white)',
    variantFallbacks: ['Pickup Truck (blue)', 'Pickup Truck (bronze)'],
    bodyOriginalHex: '#F8F8F8',
    label: 'Pickup Truck',
    templateRbxmFilename: 'PickupTruck-6418225759.rbxm',
  },
  Van: {
    assetId: 6433316269,
    preferredVariant: 'Van (white)',
    variantFallbacks: ['Van (pro)', 'Van (1970)'],
    bodyOriginalHex: '#E7E7EC',
    label: 'Van',
    templateRbxmFilename: 'Van-6433316269.rbxm',
  },
  DuneBuggy: {
    assetId: 6433272094,
    preferredVariant: 'Dune Buggy (beige)',
    variantFallbacks: ['Dune Buggy (blue)', 'Dune Buggy (orange)'],
    bodyOriginalHex: '#D1BEA6',
    label: 'Dune Buggy',
    templateRbxmFilename: 'DuneBuggy-6433272094.rbxm',
  },
  LightUtilityVehicle: {
    assetId: 6418221666,
    preferredVariant: 'Light Utility Vehicle (black)',
    variantFallbacks: ['Light Utility Vehicle (pink)', 'Light Utility Vehicle (white camo)'],
    bodyOriginalHex: '#202020',
    label: 'Light Utility Vehicle',
    templateRbxmFilename: 'LightUtilityVehicle-6418221666.rbxm',
  },
  PoliceCar: {
    assetId: 6418230807,
    preferredVariant: 'Police Car',
    variantFallbacks: [],
    bodyOriginalHex: '#FFFFFF',
    label: 'Police Car',
    templateRbxmFilename: 'PoliceCar-6418230807.rbxm',
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
  /** Round 20D accessories: small text-on-part additions that personalise the template. */
  accessories: VehicleAccessories;
}

export interface VehicleAccessories {
  /** Rear license plate text (max 8 chars). Empty = no plate added. */
  plateText: string;
  /** Roof sign text (iconic NYC-cab-style sign on top). Empty = no roof sign. */
  roofSignText: string;
  /** Roof sign neon color hex (background colour, usually matches primaryHex). */
  roofSignColorHex: string;
}

/**
 * Round 20E: Per-prompt Flux decal briefs.
 *
 * Each brief is a short text prompt fed to flux-pro/v1.1 to generate a
 * PNG that gets uploaded to Roblox as an Image asset and applied as a
 * Decal on the corresponding body part(s). Empty = skip that decal.
 *
 * Body part naming conventions in Roblox endorsed templates:
 *   - Side stripe: LF/LR/RF/RR_door (4 parts; Decal Face = Left for L_*, Right for R_*)
 *   - Hood: hood / F_bumper / roof_hood front
 *   - Trunk: bumper_back top face
 */
export interface VehicleDecalBriefs {
  /** Side stripe / livery applied to all 4 door parts. */
  doorStripeBrief: string;
  /** Logo / text applied to top of hood. */
  hoodLogoBrief: string;
  /** Optional rear logo / sign applied to trunk top. */
  trunkLogoBrief: string;
}

/**
 * Round 20E: derive Flux briefs per prompt+template+colour.
 *
 * For each known vehicle role we hand-craft brief templates that read
 * naturally to flux-pro and produce iconic, instantly recognisable
 * liveries. Generic vehicles fall through to a single brief based on
 * primary colour + title.
 *
 * All briefs ask for "transparent background" so the Decal blends over
 * the body's actual colour (not a white square stuck on the door).
 */
export function deriveVehicleDecalBriefs(args: {
  prompt: string;
  title: string;
  templateName: VehicleTemplateName;
  primaryHex: string;
  accentHex: string;
}): VehicleDecalBriefs {
  const txt = `${args.prompt} ${args.title}`.toLowerCase();
  const isTaxi = /\b(taxi|cab|такси)\b/i.test(txt);
  const isPolice = /\b(police|cop|cruiser|patrol|sheriff)\b/i.test(txt);
  const isFire = /\b(fire\s*truck|пожар)\b/i.test(txt);
  const isSports = args.templateName === 'SportsCar' || args.templateName === 'Supercar'
    || /\b(race\s*car|racing|mustang|ferrari|lambo|drift)\b/i.test(txt);

  if (isTaxi) {
    return {
      doorStripeBrief: 'horizontal NYC taxi cab checkered stripe pattern, alternating black and yellow squares, classic livery, sharp graphic design, no text, transparent background, no shadows',
      hoodLogoBrief: 'bold black "TAXI" text in classic sans-serif on transparent background, no shadows, no background, isolated text',
      trunkLogoBrief: 'small black "TAXI" text plate with medallion number, transparent background, classic NYC cab graphic',
    };
  }
  if (isPolice) {
    return {
      doorStripeBrief: 'classic American police cruiser door decal, bold "POLICE" text in white on dark blue stripe, sheriff star badge, professional law enforcement graphic, transparent background, no shadows',
      hoodLogoBrief: 'subtle thin blue stripe along the hood, minimal police livery accent, transparent background',
      trunkLogoBrief: 'classic black "POLICE" text on transparent background, bold sans-serif, no shadows',
    };
  }
  if (isFire) {
    return {
      doorStripeBrief: 'fire department door decal, bold white "FIRE DEPT" text on transparent background, classic firetruck graphics, golden maltese cross badge, no shadows',
      hoodLogoBrief: 'thin white horizontal stripe, classic fire truck reflective trim accent, transparent background',
      trunkLogoBrief: 'small "FIRE" text white on transparent background, classic firetruck rear marker',
    };
  }
  if (isSports) {
    const colorWord = args.accentHex || '#FFFFFF';
    return {
      doorStripeBrief: `bold racing number "${(Math.floor(Math.random() * 89) + 10)}" in white circle with thin ${colorWord} accent border, classic motorsport livery side panel decal, transparent background, no shadows`,
      hoodLogoBrief: `dual racing stripes vertical white running down the hood with thin ${colorWord} accent borders, classic muscle car graphic, transparent background`,
      trunkLogoBrief: '',
    };
  }
  // Generic: brand-style livery derived from title + primary colour.
  const cleanedTitle = (args.title || '').replace(/[^A-Za-z0-9 ]/g, '').trim().slice(0, 24);
  const company = cleanedTitle || 'COMPANY';
  return {
    doorStripeBrief: `clean modern company car door decal, "${company}" wordmark in bold sans-serif, contemporary corporate fleet livery, transparent background, no shadows`,
    hoodLogoBrief: '',
    trunkLogoBrief: '',
  };
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

export function pickVehicleTemplateStatic(prompt: string, title?: string): Omit<VehicleTemplatePick, 'accessories'> | null {
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
/**
 * Round 20D: derive plate text + optional roof sign per prompt + template.
 *
 * Goal: make each generated vehicle visibly recognisable for its role
 * without paying for AI. Pure deterministic.
 *
 * Rules:
 *   - Taxi prompt → plate "TAXI", roof sign "TAXI" in yellow neon.
 *   - Police prompt → plate "POLICE", no roof sign (template has light bar).
 *   - Sports / Supercar / Race → plate "SPORT" (short, fits).
 *   - Fire truck → plate "FIRE".
 *   - Generic → first 3-5 alphanumeric chars of title, uppercased; no sign.
 *   - Empty title → "RBX" + last 3 digits of timestamp.
 */
export function deriveVehicleAccessories(args: {
  prompt: string;
  title: string;
  templateName: VehicleTemplateName;
  primaryHex: string;
}): VehicleAccessories {
  const txt = `${args.prompt} ${args.title}`.toLowerCase();
  const isTaxi = /\b(taxi|cab|такси)\b/i.test(txt);
  const isPolice = /\b(police|cop|cruiser|patrol|sheriff)\b/i.test(txt);
  const isFire = /\b(fire\s*truck|пожар)\b/i.test(txt);
  const isSports = args.templateName === 'SportsCar' || args.templateName === 'Supercar'
    || /\b(race\s*car|racing|mustang|ferrari|lambo)\b/i.test(txt);

  // Round 20D-final: dropped license plates entirely. They couldn't be
  // mounted cleanly on the endorsed Sedan's huge bumper_front/bumper_back
  // parts (which span the whole front/rear quarter and curve visibly).
  // Roof sign IS the iconic "taxi плашка" the user originally asked for,
  // and it renders cleanly on top of roof_hood. Plates can return later
  // via a Decal-on-body-face approach (option B with Flux-generated images).
  if (isTaxi) {
    return {
      plateText: '',  // disabled
      roofSignText: 'TAXI',
      roofSignColorHex: '#F2B807',
    };
  }
  if (isPolice) {
    return { plateText: '', roofSignText: 'POLICE', roofSignColorHex: '#0055FF' };
  }
  if (isFire) {
    return { plateText: '', roofSignText: 'FIRE', roofSignColorHex: '#FF0000' };
  }
  if (isSports) {
    return { plateText: '', roofSignText: '', roofSignColorHex: '' };
  }
  // Generic: no roof sign, no plate. Body recolor alone is the personalisation.
  return { plateText: '', roofSignText: '', roofSignColorHex: '' };
}

/**
 * Read the on-disk template rbxm bytes + base64-encode for inline embed.
 * Templates live under apps/functions/templates/ (bundled with the function
 * deploy). Returns null if file missing — caller falls back to runtime
 * InsertService:LoadAsset path (the v1/v2 loader script).
 *
 * Path resolution: dist/vehicleTemplateRouter.js compiles to
 * apps/functions/dist/, so templates/ is at ../templates/ relative to it.
 */
export function readVehicleTemplateBase64(filename: string): string | null {
  try {
    // After tsc compile, __dirname = apps/functions/dist
    // Templates dir = apps/functions/templates → ../templates
    const candidatePaths = [
      resolvePath(__dirname, '..', 'templates', filename),
      resolvePath(__dirname, 'templates', filename),  // in case tsc keeps flat layout
    ];
    for (const p of candidatePaths) {
      try {
        const bytes = readFileSync(p);
        logger.info('[vehicleTemplateRouter] read template bytes', {
          filename, path: p, bytes: bytes.length,
        });
        return bytes.toString('base64');
      } catch {
        // try next path
      }
    }
    logger.warn('[vehicleTemplateRouter] template file not found in any candidate path', {
      filename, tried: candidatePaths,
    });
    return null;
  } catch (err) {
    logger.warn('[vehicleTemplateRouter] failed to read template bytes', {
      filename, error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export function pickVehicleTemplate(args: {
  prompt: string;
  title?: string;
  primaryHexFromMetadata?: string;
}): VehicleTemplatePick {
  const staticPick = pickVehicleTemplateStatic(args.prompt, args.title);
  if (staticPick) {
    const primaryHex = (args.primaryHexFromMetadata?.trim()) || staticPick.primaryHex || '#E03A2E';
    const accessories = deriveVehicleAccessories({
      prompt: args.prompt, title: args.title ?? '', templateName: staticPick.templateName, primaryHex,
    });
    return { ...staticPick, primaryHex, accessories };
  }
  // No static match → default to Sedan (most generic, looks like a car).
  // (LLM-fallback layer can be added later if static rules prove too narrow;
  // for v1 the keyword set covers the common asks and Sedan is a safe default.)
  const sedan = VEHICLE_TEMPLATE_CATALOG.Sedan;
  const primaryHex = args.primaryHexFromMetadata?.trim() || '#E03A2E';
  logger.info('[vehicleTemplateRouter] no keyword match, defaulting to Sedan', {
    promptPreview: args.prompt.slice(0, 80),
  });
  const accessories = deriveVehicleAccessories({
    prompt: args.prompt, title: args.title ?? '', templateName: 'Sedan', primaryHex,
  });
  return {
    templateName: 'Sedan',
    config: sedan,
    primaryHex,
    source: 'default',
    reason: 'no keyword match, default Sedan',
    accessories,
  };
}
