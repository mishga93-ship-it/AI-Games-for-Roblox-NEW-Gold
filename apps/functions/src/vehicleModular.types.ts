// Session 387 — Modular Vehicle Builder schemas.
//
// New alternative pipeline (feature-flagged via metadata.vehiclePipeline ===
// 'modular_builder'). Lets the AI assemble a vehicle from a preset chassis +
// modular addons + tuned drive stats + styling palette, instead of just
// picking 1-of-13 baked Roblox templates.
//
// IMPORTANT: nothing in this file is referenced unless the user explicitly
// opts into the modular pipeline via the iOS picker. Existing template-embed
// jobs (the vast majority) are unaffected.

/** Style packs that color/decal the whole assembly. */
export type VehicleStyleId =
  | 'default'
  | 'cyberpunk'
  | 'sigma'
  | 'military'
  | 'anime'
  | 'cursed'
  | 'luxury'
  | 'apocalypse'
  | 'retro';

/** Preset chassis the modular builder can layer addons onto. Each preset
 *  re-uses one of our existing 13 bundled .rbxm templates so the loader
 *  already knows how to drive it. */
export type VehiclePresetId =
  | 'sedan'
  | 'sports_car'
  | 'supercar'
  | 'suv'
  | 'pickup_truck'
  | 'van'
  | 'dune_buggy'
  | 'light_utility_vehicle'
  | 'police_car'
  | 'motorcycle'
  | 'boat'
  | 'plane'
  | 'tank';

/** Single addon = a small Model the builder generates programmatically
 *  and attaches to the preset at a known body offset. No external .rbxm
 *  files needed for the MVP — pure Lua-built parts. */
export type VehicleAddonId =
  | 'taxi_sign'
  | 'police_lightbar'
  | 'roof_rack'
  | 'underglow'
  | 'racing_stripe'
  | 'rear_spoiler_low'
  | 'rear_spoiler_high'
  | 'exhaust_dual'
  | 'roof_antenna'
  | 'fire_dept_ladder'
  | 'monster_truck_tires';

/** Drive stats the loader Lua reads to tune the chassis. All optional —
 *  preset has sensible defaults. */
export interface VehicleDriveStats {
  /** studs/sec max forward speed. Default per preset (~80 sedan, ~140 sports). */
  maxSpeed?: number;
  /** Whether the loader enables the drift assist (rear-wheel power bias). */
  drift?: boolean;
  /** Boost particle style — '' / 'flame' / 'neon' / 'smoke'. */
  boost?: '' | 'flame' | 'neon' | 'smoke';
  /** Suspension stiffness — softer = monster truck bounce, stiffer = race. */
  suspension?: 'soft' | 'standard' | 'stiff' | 'monster';
  /** Number of passenger seats (in addition to DriveSeat). */
  passengerSeats?: number;
  /** Whether the vehicle takes damage / has destruction VFX. */
  destruction?: boolean;
}

/** Full config emitted by the AI router, consumed by the modular builder. */
export interface VehicleConfig {
  /** Which preset chassis to base the assembly on. */
  preset: VehiclePresetId;
  /** Style pack (palette + decal bias + addon bias). */
  style: VehicleStyleId;
  /** Body primary color hex (#RRGGBB). */
  primaryColor: string;
  /** Accent / trim color hex. */
  accentColor: string;
  /** Selected addons. AI picks 0-4 based on prompt. */
  addons: VehicleAddonId[];
  /** Drive stats. */
  driveStats: VehicleDriveStats;
  /** Optional license-plate text (≤8 chars), placed on rear bumper. */
  plateText?: string;
  /** Human-readable rationale from the router (for debug logs + UI hint). */
  rationale: string;
}

/** Preset → underlying .rbxm template mapping. Lets the modular builder
 *  reuse all the loader/recolor work the template-embed path already does. */
export interface VehiclePreset {
  id: VehiclePresetId;
  label: string;
  /** Existing template filename in apps/functions/templates/ (reused). */
  templateRbxmFilename: string;
  /** Roblox marketplace assetId (0 for local-only like Phenom 100). */
  assetId: number;
  /** Body hex of the preferred variant — recolor source. */
  bodyOriginalHex: string;
  /** Default style ID for this preset. */
  defaultStyle: VehicleStyleId;
  /** Default drive stats baseline. */
  baselineStats: Required<VehicleDriveStats>;
}

/** Addon descriptor — how the builder generates + welds the addon model. */
export interface VehicleAddonSpec {
  id: VehicleAddonId;
  label: string;
  /** Whether the addon is compatible with this preset category. */
  fitsPresets: ReadonlyArray<VehiclePresetId>;
  /** How the loader Lua should mount it — anchor + offset hint. */
  mount: 'roof' | 'rear_bumper' | 'underbody' | 'roof_back' | 'doors_side' | 'wheels';
  /** Short description fed to the AI router as part of menu of options. */
  description: string;
}

/** Result of building a modular vehicle — shipped back to the caller so the
 *  job pipeline knows what artifacts/Lua to attach. */
export interface ModularBuildResult {
  /** The selected preset (so the rest of the existing pipeline can recolor + preview). */
  preset: VehiclePreset;
  /** The AI-emitted config (stored in metadata for debug + iOS UI). */
  config: VehicleConfig;
  /** Extra Lua block to append into the loader script — toggles addons. */
  addonsLuaBlock: string;
  /** Lookup: addonId -> spec, for the builder to know mount info. */
  resolvedAddons: VehicleAddonSpec[];
}
