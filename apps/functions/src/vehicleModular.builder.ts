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
import { VEHICLE_PRESETS, buildAddonsLuaBlock, resolveAddons } from './vehicleModular.library.js';
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
  const stageNotes = [
    `Modular pipeline: preset=${config.preset} (${VEHICLE_PRESETS[config.preset].label})`,
    `Style: ${config.style}`,
    `Primary color: ${config.primaryColor} | accent: ${config.accentColor}`,
    `Addons (${config.addons.length}): ${config.addons.join(', ') || 'none'}`,
    `Drive stats: ${config.driveStats.maxSpeed} studs/s, drift=${config.driveStats.drift}, boost=${config.driveStats.boost || 'none'}, susp=${config.driveStats.suspension}, seats=${config.driveStats.passengerSeats}`,
    `Rationale: ${config.rationale}`,
    `Lua addon block: ${addonsLuaBlock.length} chars`,
  ];
  return {
    config,
    templateMetadata,
    modularMetadata: {
      vehiclePipeline: 'modular_builder',
      vehicleConfig: config,
      vehicleAddonsLuaBlock: addonsLuaBlock,
      vehicleAddonIds: [...config.addons],
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
