// Session 387 — Modular Vehicle Builder pipeline.
//
// Called from index.ts when metadata.vehiclePipeline === 'modular_builder'.
// Strategy: this is a thin "prep" stage that runs the AI router, picks a
// preset chassis, and pre-populates the SAME metadata fields that the
// existing pick_vehicle_template stage would set. The rest of the
// pipeline (decals, recolor, loader script, preview, export) is then
// reused untouched.
//
// Extras the modular flow adds on top:
//   - metadata.vehicleConfig  (full VehicleConfig for debug + UI)
//   - metadata.vehicleAddonsLuaBlock  (Lua appended to loader script)
//
// Existing template-embed callers that don't set vehiclePipeline are
// completely unaffected.

import { logger } from 'firebase-functions/v2';
import type { VehicleConfig, VehiclePresetId } from './vehicleModular.types.js';
import { VEHICLE_PRESETS, buildAddonsLuaBlock, buildTuningLuaBlock, resolveAddons } from './vehicleModular.library.js';
import { buildStyleAmbientLuaBlock, stylePaletteHint } from './vehicleModular.styles.js';
import { computeRarity, describeRarity, generatePersonalityCaption } from './vehicleModular.rarity.js';
import { routeVehicleConfig } from './vehicleModular.router.js';

/** Result of the prep stage. Caller stuffs these into job metadata. */
export interface ModularPrepResult {
  config: VehicleConfig;
  /** Metadata fields to merge into job.metadata (same shape as
   *  pick_vehicle_template would write, so downstream stages work). */
  templateMetadata: {
    vehicleTemplateAssetId: number;
    vehicleTemplateName: string;
    vehicleTemplateLabel: string;
    vehicleTemplatePreferredVariant: string;
    vehicleTemplateVariantFallbacks: string[];
    vehicleTemplateBodyOriginalHex: string;
    vehicleTemplatePrimaryHex: string;
    vehicleTemplateAccentHex: string;
    vehicleTemplateRouterSource: 'modular';
    vehicleTemplateRouterReason: string;
    vehicleTemplateRbxmFilename: string;
    vehicleTemplatePlateText: string;
    vehicleTemplateRoofSignText: string;
    vehicleTemplateRoofSignColorHex: string;
    vehicleTemplateUnderglowColorHex: string;
  };
  /** Modular-specific metadata fields. */
  modularMetadata: {
    vehiclePipeline: 'modular_builder';
    vehicleConfig: VehicleConfig;
    vehicleAddonsLuaBlock: string;
    vehicleAddonIds: string[];
    /** Session 387 Round 2: per-config drive-stats Lua patches
     *  (boost/drift/suspension/maxSpeed). Emitted as separate Script. */
    vehicleTuningLuaBlock: string;
    /** Session 387 Round 3: ambient style Lua (cyberpunk neon trail,
     *  apocalypse rust, sigma matte metal, etc). Empty for style=default. */
    vehicleStyleLuaBlock: string;
    /** Session 387 Round 4: flattened rarity badge for fast iOS read.
     *  Same data is also inside vehicleConfig.rarity. */
    vehicleRarityLabel: string;
    vehicleRarityColorHex: string;
    /** Session 387 Round 4: viral personality caption (AI single-shot). */
    vehiclePersonalityCaption: string;
  };
  /** Notes for the stage log (shown in iOS pipeline UI). */
  stageNotes: string[];
}

/** preset → template metadata snapshot. Maps to one of the existing
 *  bundled .rbxm files so the template-embed loader/recolor works. */
function templateMetadataFromPreset(presetId: VehiclePresetId, config: VehicleConfig): ModularPrepResult['templateMetadata'] {
  const preset = VEHICLE_PRESETS[presetId];
  // Plate / roof-sign: derive from style + addons.
  const hasTaxi = config.addons.includes('taxi_sign');
  const hasPolice = config.addons.includes('police_lightbar');
  return {
    vehicleTemplateAssetId: preset.assetId,
    vehicleTemplateName: presetId,
    vehicleTemplateLabel: preset.label,
    vehicleTemplatePreferredVariant: preset.preferredVariant,
    vehicleTemplateVariantFallbacks: [...preset.variantFallbacks],
    vehicleTemplateBodyOriginalHex: preset.bodyOriginalHex,
    vehicleTemplatePrimaryHex: config.primaryColor,
    vehicleTemplateAccentHex: config.accentColor,
    vehicleTemplateRouterSource: 'modular',
    vehicleTemplateRouterReason: `Modular: preset=${presetId}, style=${config.style}, addons=[${config.addons.join(',')}]`,
    vehicleTemplateRbxmFilename: preset.templateRbxmFilename,
    vehicleTemplatePlateText: config.plateText ?? '',
    vehicleTemplateRoofSignText: hasTaxi ? 'TAXI' : hasPolice ? 'POLICE' : '',
    vehicleTemplateRoofSignColorHex: hasTaxi ? '#F2B807' : hasPolice ? '#0055FF' : '',
    vehicleTemplateUnderglowColorHex: config.addons.includes('underglow')
      ? (config.accentColor || config.primaryColor) : '',
  };
}

/**
 * Run the modular preparation. Pure async function with no Firestore
 * writes — caller is responsible for persisting the returned metadata.
 */
// Round 7: deterministic overrides for ICONIC vehicle types so the AI router
// doesn't drift away from user expectation. Examples:
//   - "police" / "cop" / "siren" → must be police_car preset + white body
//   - "taxi" / "cab" → must be sedan preset + yellow body
//   - "ambulance" / "medic" → must be van preset + white body
//   - "fire truck" → must be pickup_truck preset + red body
// Applied AFTER routeVehicleConfig — patches preset + colors + ensures
// signature addons are included.
function applyIconicOverrides(config: import('./vehicleModular.types.js').VehicleConfig, prompt: string): import('./vehicleModular.types.js').VehicleConfig {
  const lc = prompt.toLowerCase();
  const isPolice = /\b(police|cop|cruiser|patrol|sheriff|interceptor|siren)\b/.test(lc);
  const isTaxi = /\b(taxi|cab|такси)\b/.test(lc);
  const isAmbulance = /\b(ambulance|medic|paramedic|emergency)\b/.test(lc);
  const isFire = /\b(fire\s*truck|firetruck|fire\s*engine|пожар)\b/.test(lc);
  if (isPolice) {
    // PoliceCar template already has a baked lightbar — don't double-stack
    // ours on top. Pick alternative cool addons instead.
    const addons = new Set(config.addons);
    addons.delete('police_lightbar');
    addons.add('headlight_bar'); addons.add('bull_bar');
    return {
      ...config,
      preset: 'police_car',
      primaryColor: '#FFFFFF', accentColor: '#000000',
      addons: [...addons].slice(0, 4) as typeof config.addons,
      driveStats: { ...config.driveStats, maxSpeed: Math.max(config.driveStats.maxSpeed ?? 130, 140) },
    };
  }
  if (isTaxi) {
    const addons = new Set(config.addons); addons.add('taxi_sign');
    return {
      ...config, preset: 'sedan',
      primaryColor: '#F2B807', accentColor: '#000000',
      addons: [...addons].slice(0, 4) as typeof config.addons,
      plateText: config.plateText || 'TAXI',
    };
  }
  if (isAmbulance) {
    const addons = new Set(config.addons); addons.add('police_lightbar');
    return {
      ...config, preset: 'van',
      primaryColor: '#FFFFFF', accentColor: '#D40000',
      addons: [...addons].slice(0, 4) as typeof config.addons,
    };
  }
  if (isFire) {
    return {
      ...config, preset: 'pickup_truck',
      primaryColor: '#CC0000', accentColor: '#FFD700',
      addons: ['fire_dept_ladder', ...config.addons].slice(0, 4) as typeof config.addons,
    };
  }
  return config;
}

export async function prepareModularVehicle(args: {
  prompt: string;
  title?: string;
  primaryHexHint?: string;
  accentHexHint?: string;
}): Promise<ModularPrepResult> {
  const t0 = Date.now();
  const aiConfig = await routeVehicleConfig({
    prompt: args.prompt, title: args.title,
    primaryHexHint: args.primaryHexHint, accentHexHint: args.accentHexHint,
  });
  const config = applyIconicOverrides(aiConfig, args.prompt);
  const dt = Date.now() - t0;
  logger.info('[ModularBuilder] router returned config', {
    preset: config.preset, style: config.style,
    addonCount: config.addons.length, latencyMs: dt,
  });
  const templateMetadata = templateMetadataFromPreset(config.preset, config);
  const resolvedAddons = resolveAddons(config.addons);
  const addonsLuaBlock = buildAddonsLuaBlock(config.addons, {
    accentHex: config.accentColor, primaryHex: config.primaryColor,
    plateText: config.plateText,
  });
  const preset = VEHICLE_PRESETS[config.preset];

  // Round 7 — camera-jitter fix: car-family templates ship with their own
  // baked Driver/Vehicle/Passenger Scripts that tightly couple VehicleSeat
  // to SpringConstraint suspension. Our tuning script overriding those
  // SpringConstraints causes the template's controller to fight back →
  // camera dérgaет (oscillating physics). Skip suspension tuning entirely
  // for those presets and use 'standard' baseline. Boost particles and
  // MaxSpeed override are safe (they don't touch joints).
  const carFamily: ReadonlyArray<typeof config.preset> = [
    'sedan', 'sports_car', 'supercar', 'suv', 'pickup_truck', 'van',
    'dune_buggy', 'light_utility_vehicle', 'police_car',
  ];
  const suspensionForTuning = carFamily.includes(config.preset)
    ? 'standard' as const
    : (config.driveStats.suspension ?? preset.baselineStats.suspension);

  const tuningLuaBlock = buildTuningLuaBlock({
    maxSpeed: config.driveStats.maxSpeed ?? preset.baselineStats.maxSpeed,
    drift: config.driveStats.drift ?? preset.baselineStats.drift,
    boost: config.driveStats.boost ?? preset.baselineStats.boost,
    suspension: suspensionForTuning,
    passengerSeats: config.driveStats.passengerSeats ?? preset.baselineStats.passengerSeats,
    destruction: config.driveStats.destruction ?? preset.baselineStats.destruction,
    accentHex: config.accentColor,
    primaryHex: config.primaryColor,
  });
  void resolvedAddons; // present for stageNotes if needed in future

  // Style ambient effect — applies cyberpunk neon trail / apocalypse rust /
  // etc on top of the addons. If user didn't request a strong palette and
  // the AI returned a muted default, fall back to the style's paletteHint
  // so the style imprints clearly.
  const paletteHint = stylePaletteHint(config.style);
  const effectivePrimary = config.primaryColor;
  const effectiveAccent = config.accentColor === '#1A1A1A' && config.style !== 'default'
    ? paletteHint.accent : config.accentColor;
  const styleLuaBlock = buildStyleAmbientLuaBlock(config.style, {
    primaryHex: effectivePrimary, accentHex: effectiveAccent,
  });

  // Session 387 Round 4: rarity + personality caption.
  // Both are pure metadata — iOS chat shows them in the preview card.
  config.rarity = computeRarity(config);
  config.personalityCaption = await generatePersonalityCaption(config);

  const stageNotes = [
    `Modular pipeline: preset=${config.preset} (${VEHICLE_PRESETS[config.preset].label})`,
    `Style: ${config.style}`,
    `Primary color: ${config.primaryColor} | accent: ${config.accentColor}`,
    `Addons (${config.addons.length}): ${config.addons.join(', ') || 'none'}`,
    `Drive stats: ${config.driveStats.maxSpeed} studs/s, drift=${config.driveStats.drift}, boost=${config.driveStats.boost || 'none'}, susp=${config.driveStats.suspension}, seats=${config.driveStats.passengerSeats}`,
    `Rationale: ${config.rationale}`,
    `Lua blocks — addons: ${addonsLuaBlock.length}ch | tuning: ${tuningLuaBlock.length}ch | style: ${styleLuaBlock.length}ch`,
    `Rarity: ${config.rarity?.label ?? 'COMMON'} — ${describeRarity(config.rarity!)}`,
    `Caption: ${config.personalityCaption ?? '(none)'}`,
  ];
  return {
    config,
    templateMetadata,
    modularMetadata: {
      vehiclePipeline: 'modular_builder',
      vehicleConfig: config,
      vehicleAddonsLuaBlock: addonsLuaBlock,
      vehicleAddonIds: [...config.addons],
      vehicleTuningLuaBlock: tuningLuaBlock,
      vehicleStyleLuaBlock: styleLuaBlock,
      vehicleRarityLabel: config.rarity?.label ?? 'COMMON',
      vehicleRarityColorHex: config.rarity?.colorHex ?? '#9E9E9E',
      vehiclePersonalityCaption: config.personalityCaption ?? '',
    },
    stageNotes,
  };
}

/** Helper for downstream code: extract addon Lua block from metadata if present.
 *  Returns empty string when not in modular mode — so callers can always
 *  concat without a conditional. */
export function getModularAddonsLuaBlock(metadata: Record<string, unknown> | undefined): string {
  const v = metadata?.vehicleAddonsLuaBlock;
  return typeof v === 'string' ? v : '';
}
