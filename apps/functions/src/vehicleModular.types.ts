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
  | 'tank'
  | 'helicopter'
  | 'spaceship';

/** Single addon = a small Model the builder generates programmatically
 *  and attaches to the preset at a known body offset. No external .rbxm
 *  files needed for the MVP — pure Lua-built parts. */
export type VehicleAddonId =
  // Round 1 (original 11)
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
  | 'monster_truck_tires'
  // Round 6 — wider addon library for AI variety
  | 'headlight_bar'         // bright LED bar across front
  | 'bull_bar'              // chunky front bumper guard
  | 'side_skirts'           // low side panels for sporty look
  | 'hood_scoop'            // air intake on hood
  | 'subwoofer_trunk'       // big back speaker box (boombox energy)
  | 'tow_hitch'             // rear truck hitch ball
  | 'roof_camera_pod'       // small surveillance camera pod on roof
  | 'disco_ball'            // mirrored disco ball on roof (party/cursed)
  | 'flag_pole'             // tall pole with flag on roof
  | 'smoke_stack'           // upward exhaust chimney (apocalypse)
  | 'jet_engine_rear'       // back jet booster
  | 'mud_flaps';            // rubber flaps behind wheels

/** Drive stats the loader Lua reads to tune the chassis. All optional —
 *  preset has sensible defaults. */
export interface VehicleDriveStats {
  /** studs/sec max forward speed. Default per preset (~80 sedan, ~140 sports). */
  maxSpeed?: number;
  /** Whether the loader enables the drift assist (rear-wheel power bias). */
  drift?: boolean;
  /** Boost particle style — '' / 'flame' / 'neon' / 'smoke' / 'nitro'. */
  boost?: '' | 'flame' | 'neon' | 'smoke' | 'nitro';
  /** Suspension stiffness — softer = monster truck bounce, stiffer = race. */
  suspension?: 'soft' | 'standard' | 'stiff' | 'monster';
  /** Number of passenger seats (in addition to DriveSeat). */
  passengerSeats?: number;
  /** Whether the vehicle takes damage / has destruction VFX. */
  destruction?: boolean;
}

/** Session 387 Round 4: rarity tier derived from style + driveStats.
 *  Shown as a badge in chat preview ("LEGENDARY DRIFT", "SIGMA SPEC", …). */
export type VehicleRarityTier =
  | 'common'
  | 'rare'
  | 'epic'
  | 'legendary_drift'
  | 'sigma_spec'
  | 'military_tier'
  | 'chaos_vehicle'
  | 'cyber_elite'
  | 'mythic';

export interface VehicleRarity {
  tier: VehicleRarityTier;
  /** Display label shown in iOS preview badge. */
  label: string;
  /** Hex color for the badge background. */
  colorHex: string;
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
  /** Session 387 Round 4 — derived rarity badge (computed post-router). */
  rarity?: VehicleRarity;
  /** Session 387 Round 4 — viral one-liner for share UX. AI-generated. */
  personalityCaption?: string;
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
  /** Session 387 R5: exact Model name to pick from inside the .rbxm
   *  (Roblox marketplace packs ship 1-5 colour variants per file —
   *  we want a specific one whose bodyOriginalHex matches). */
  preferredVariant: string;
  /** Fallback variant names if preferred is missing. */
  variantFallbacks: ReadonlyArray<string>;
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
