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
    vehicleTemplatePreferredVariant: preset.label, // best-effort default
    vehicleTemplateVariantFallbacks: [],
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
export async function prepareModularVehicle(args: {
  prompt: string;
  title?: string;
  primaryHexHint?: string;
  accentHexHint?: string;
}): Promise<ModularPrepResult> {
  const t0 = Date.now();
  const config = await routeVehicleConfig({
    prompt: args.prompt, title: args.title,
    primaryHexHint: args.primaryHexHint, accentHexHint: args.accentHexHint,
  });
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
  const tuningLuaBlock = buildTuningLuaBlock({
    maxSpeed: config.driveStats.maxSpeed ?? preset.baselineStats.maxSpeed,
    drift: config.driveStats.drift ?? preset.baselineStats.drift,
    boost: config.driveStats.boost ?? preset.baselineStats.boost,
    suspension: config.driveStats.suspension ?? preset.baselineStats.suspension,
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
