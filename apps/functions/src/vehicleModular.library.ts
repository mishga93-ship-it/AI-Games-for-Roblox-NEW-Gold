// Session 387 — preset catalog + addon prefab generators.
// All addons are generated PROGRAMMATICALLY (no external .rbxm needed)
// so we can ship the MVP without manual Studio work for each prefab.
// Each addon emits a Lua block that the loader script eval's to spawn
// + weld the addon Model onto the running vehicle at runtime.

import type {
  VehicleAddonId,
  VehicleAddonSpec,
  VehiclePreset,
  VehiclePresetId,
} from './vehicleModular.types.js';

// ─── PRESETS ────────────────────────────────────────────────────────────
// Each preset re-uses one of the existing 13 bundled .rbxm templates so
// the modular builder gets the loader/recolor/preview for free.

export const VEHICLE_PRESETS: Record<VehiclePresetId, VehiclePreset> = {
  sedan: {
    id: 'sedan', label: 'Sedan',
    templateRbxmFilename: 'Sedan-6418239833.rbxm', assetId: 6418239833,
    bodyOriginalHex: '#F3F3F3',
    preferredVariant: 'Sedan (white)',
    variantFallbacks: ['Sedan (aqua)', 'Sedan (orange)', 'Sedan (red)', 'Sedan (black)'],
    defaultStyle: 'default',
    baselineStats: { maxSpeed: 90, drift: false, boost: '', suspension: 'standard', passengerSeats: 3, destruction: false },
  },
  sports_car: {
    id: 'sports_car', label: 'Sports Car',
    templateRbxmFilename: 'SportsCar-6433323089.rbxm', assetId: 6433323089,
    bodyOriginalHex: '#F8F8F8',
    preferredVariant: 'Sports Car (white)',
    variantFallbacks: ['Sports Car (red)', 'Sports Car (blue)'],
    defaultStyle: 'default',
    baselineStats: { maxSpeed: 140, drift: true, boost: 'flame', suspension: 'stiff', passengerSeats: 1, destruction: false },
  },
  supercar: {
    id: 'supercar', label: 'Supercar',
    templateRbxmFilename: 'Supercar-6433330180.rbxm', assetId: 6433330180,
    bodyOriginalHex: '#FFB000',
    preferredVariant: 'Supercar (yellow)',
    variantFallbacks: ['Supercar (green)', 'Supercar (blue)'],
    defaultStyle: 'luxury',
    baselineStats: { maxSpeed: 170, drift: true, boost: 'neon', suspension: 'stiff', passengerSeats: 1, destruction: false },
  },
  suv: {
    id: 'suv', label: 'SUV',
    templateRbxmFilename: 'SUV-6418234850.rbxm', assetId: 6418234850,
    bodyOriginalHex: '#E7E7EC',
    preferredVariant: 'SUV (white)',
    variantFallbacks: ['SUV (blue)', 'SUV (black)'],
    defaultStyle: 'default',
    baselineStats: { maxSpeed: 100, drift: false, boost: '', suspension: 'soft', passengerSeats: 4, destruction: false },
  },
  pickup_truck: {
    id: 'pickup_truck', label: 'Pickup Truck',
    templateRbxmFilename: 'PickupTruck-6418225759.rbxm', assetId: 6418225759,
    bodyOriginalHex: '#F8F8F8',
    preferredVariant: 'Pickup Truck (white)',
    variantFallbacks: ['Pickup Truck (blue)', 'Pickup Truck (bronze)'],
    defaultStyle: 'default',
    baselineStats: { maxSpeed: 95, drift: false, boost: 'smoke', suspension: 'soft', passengerSeats: 1, destruction: true },
  },
  van: {
    id: 'van', label: 'Van',
    templateRbxmFilename: 'Van-6433316269.rbxm', assetId: 6433316269,
    bodyOriginalHex: '#E7E7EC',
    preferredVariant: 'Van (white)',
    variantFallbacks: ['Van (pro)', 'Van (1970)'],
    defaultStyle: 'default',
    baselineStats: { maxSpeed: 80, drift: false, boost: '', suspension: 'soft', passengerSeats: 6, destruction: false },
  },
  dune_buggy: {
    id: 'dune_buggy', label: 'Dune Buggy',
    templateRbxmFilename: 'DuneBuggy-6433272094.rbxm', assetId: 6433272094,
    bodyOriginalHex: '#D1BEA6',
    preferredVariant: 'Dune Buggy (beige)',
    variantFallbacks: ['Dune Buggy (blue)', 'Dune Buggy (orange)'],
    defaultStyle: 'apocalypse',
    baselineStats: { maxSpeed: 110, drift: true, boost: 'smoke', suspension: 'soft', passengerSeats: 1, destruction: true },
  },
  light_utility_vehicle: {
    id: 'light_utility_vehicle', label: 'Light Utility Vehicle',
    templateRbxmFilename: 'LightUtilityVehicle-6418221666.rbxm', assetId: 6418221666,
    bodyOriginalHex: '#202020',
    preferredVariant: 'Light Utility Vehicle (black)',
    variantFallbacks: ['Light Utility Vehicle (pink)', 'Light Utility Vehicle (white camo)'],
    defaultStyle: 'military',
    baselineStats: { maxSpeed: 90, drift: false, boost: '', suspension: 'standard', passengerSeats: 3, destruction: true },
  },
  police_car: {
    id: 'police_car', label: 'Police Car',
    templateRbxmFilename: 'PoliceCar-6418230807.rbxm', assetId: 6418230807,
    bodyOriginalHex: '#FFFFFF',
    preferredVariant: 'Police Car',
    variantFallbacks: [],
    defaultStyle: 'default',
    baselineStats: { maxSpeed: 130, drift: false, boost: '', suspension: 'standard', passengerSeats: 1, destruction: false },
  },
  motorcycle: {
    id: 'motorcycle', label: 'Motorcycle',
    templateRbxmFilename: 'Motorcycle-17388481396.rbxm', assetId: 17388481396,
    bodyOriginalHex: '#111111',
    preferredVariant: 'Dirt bike.',
    variantFallbacks: [],
    defaultStyle: 'default',
    baselineStats: { maxSpeed: 130, drift: false, boost: 'flame', suspension: 'stiff', passengerSeats: 0, destruction: false },
  },
  boat: {
    id: 'boat', label: 'Speedboat',
    templateRbxmFilename: 'Boat-30309891.rbxm', assetId: 30309891,
    bodyOriginalHex: '#FFCC99',
    preferredVariant: 'Model',
    variantFallbacks: [],
    defaultStyle: 'default',
    baselineStats: { maxSpeed: 100, drift: false, boost: '', suspension: 'standard', passengerSeats: 3, destruction: false },
  },
  plane: {
    id: 'plane', label: 'Embraer Phenom 100',
    // R14: was assetId=0 (local-only), now 15683356413 (the marketplace ID for
    // Phenom 100 PlaneKit). Local file Phenom100-PlaneKit.rbxm still bundled
    // and takes precedence for build-time embed; the assetId now also enables
    // Roblox Thumbnail API for chat preview (was blank for plane before).
    templateRbxmFilename: 'Phenom100-PlaneKit.rbxm', assetId: 15683356413,
    bodyOriginalHex: '#F8F8F8',
    preferredVariant: 'Embraer Phenom 100',
    variantFallbacks: ['Plane', 'Embraer'],
    defaultStyle: 'default',
    baselineStats: { maxSpeed: 200, drift: false, boost: '', suspension: 'standard', passengerSeats: 5, destruction: false },
  },
  tank: {
    id: 'tank', label: 'Tank',
    templateRbxmFilename: 'Tank-101512952.rbxm', assetId: 101512952,
    bodyOriginalHex: '#F2F3F3',
    preferredVariant: 'DrivableTank',
    variantFallbacks: [],
    defaultStyle: 'military',
    baselineStats: { maxSpeed: 50, drift: false, boost: '', suspension: 'monster', passengerSeats: 1, destruction: true },
  },
  // R14: fills 2 empty iOS picker slots (helicopter / spaceship). No local
  // .rbxm bundled — Studio fetches via InsertService:LoadAsset at Play time
  // (existing runtime loader fallback in robloxWorker.ts). User-side cost:
  // ~1-3s extra at first Play to download. After-cost: zero.
  helicopter: {
    id: 'helicopter', label: 'Helicopter',
    templateRbxmFilename: '', assetId: 6719732199,
    bodyOriginalHex: '#222222',
    preferredVariant: 'Helicopter',
    variantFallbacks: ['Heli', 'Model'],
    defaultStyle: 'military',
    baselineStats: { maxSpeed: 120, drift: false, boost: '', suspension: 'standard', passengerSeats: 2, destruction: false },
  },
  spaceship: {
    id: 'spaceship', label: 'Alien Ship',
    templateRbxmFilename: '', assetId: 6695306993,
    bodyOriginalHex: '#888888',
    preferredVariant: 'Alien Ship',
    variantFallbacks: ['UFO', 'Spaceship', 'Model'],
    defaultStyle: 'cyberpunk',
    baselineStats: { maxSpeed: 180, drift: false, boost: 'neon', suspension: 'standard', passengerSeats: 1, destruction: false },
  },
};

// ─── ADDON CATALOG ──────────────────────────────────────────────────────
// Compatibility matrix: each addon declares which presets it fits on.
// "all_cars" = sedan/sports/supercar/suv/pickup/van/dune_buggy/LUV/police.

const ALL_CARS: ReadonlyArray<VehiclePresetId> = [
  'sedan', 'sports_car', 'supercar', 'suv', 'pickup_truck',
  'van', 'dune_buggy', 'light_utility_vehicle', 'police_car',
];

export const VEHICLE_ADDONS: Record<VehicleAddonId, VehicleAddonSpec> = {
  taxi_sign: {
    id: 'taxi_sign',
    label: 'TAXI roof sign',
    fitsPresets: ['sedan', 'suv', 'van'],
    mount: 'roof',
    description: 'Classic NYC-style illuminated TAXI sign on roof',
  },
  police_lightbar: {
    id: 'police_lightbar',
    label: 'Police light bar',
    fitsPresets: ['sedan', 'sports_car', 'suv', 'pickup_truck', 'police_car'],
    mount: 'roof',
    description: 'Red/blue strobe police lightbar on roof',
  },
  roof_rack: {
    id: 'roof_rack',
    label: 'Roof cargo rack',
    fitsPresets: ['sedan', 'suv', 'pickup_truck', 'van', 'dune_buggy'],
    mount: 'roof',
    description: 'Black metal cargo rack frame on roof',
  },
  underglow: {
    id: 'underglow',
    label: 'Neon underglow',
    fitsPresets: ALL_CARS,
    mount: 'underbody',
    description: 'Neon strip glowing under chassis (color matches accent)',
  },
  racing_stripe: {
    id: 'racing_stripe',
    label: 'Racing stripe',
    fitsPresets: ['sedan', 'sports_car', 'supercar', 'pickup_truck'],
    mount: 'roof',
    description: 'Vertical dual racing stripes hood→roof→trunk',
  },
  rear_spoiler_low: {
    id: 'rear_spoiler_low',
    label: 'Low rear spoiler',
    fitsPresets: ['sedan', 'sports_car', 'supercar'],
    mount: 'roof_back',
    description: 'Subtle low-profile rear lip spoiler',
  },
  rear_spoiler_high: {
    id: 'rear_spoiler_high',
    label: 'High rear wing',
    fitsPresets: ['sports_car', 'supercar'],
    mount: 'roof_back',
    description: 'Tall racing wing on rear deck',
  },
  exhaust_dual: {
    id: 'exhaust_dual',
    label: 'Dual chrome exhaust',
    fitsPresets: ['sports_car', 'supercar', 'pickup_truck'],
    mount: 'rear_bumper',
    description: 'Twin chrome exhaust pipes from rear bumper',
  },
  roof_antenna: {
    id: 'roof_antenna',
    label: 'Tall antenna',
    fitsPresets: ['sedan', 'suv', 'van', 'pickup_truck', 'light_utility_vehicle'],
    mount: 'roof',
    description: 'Tall whip antenna on roof',
  },
  fire_dept_ladder: {
    id: 'fire_dept_ladder',
    label: 'Fire dept ladder',
    fitsPresets: ['pickup_truck', 'van'],
    mount: 'roof',
    description: 'Extending fire truck ladder on roof',
  },
  monster_truck_tires: {
    id: 'monster_truck_tires',
    label: 'Monster truck tires',
    fitsPresets: ['pickup_truck', 'suv', 'dune_buggy', 'light_utility_vehicle'],
    mount: 'wheels',
    description: 'Oversized off-road tires replacing wheel meshes',
  },
  // ─── Round 6: extra addons for more variety ────────────────────────
  headlight_bar: {
    id: 'headlight_bar', label: 'LED light bar',
    fitsPresets: ALL_CARS,
    mount: 'rear_bumper', // mounted on front, but body offset uses front face
    description: 'Bright off-road LED light bar across the front bumper',
  },
  bull_bar: {
    id: 'bull_bar', label: 'Bull bar / kangaroo guard',
    fitsPresets: ['pickup_truck', 'suv', 'dune_buggy', 'light_utility_vehicle', 'van'],
    mount: 'rear_bumper',
    description: 'Chunky steel kangaroo-bar guard on the front bumper',
  },
  side_skirts: {
    id: 'side_skirts', label: 'Racing side skirts',
    fitsPresets: ['sedan', 'sports_car', 'supercar'],
    mount: 'doors_side',
    description: 'Low racing side skirt panels along the doors',
  },
  hood_scoop: {
    id: 'hood_scoop', label: 'Hood air scoop',
    fitsPresets: ['sedan', 'sports_car', 'supercar', 'pickup_truck'],
    mount: 'roof', // top of hood
    description: 'Aggressive air intake scoop on the hood',
  },
  subwoofer_trunk: {
    id: 'subwoofer_trunk', label: 'Trunk subwoofer rig',
    fitsPresets: ['sedan', 'suv', 'pickup_truck', 'van'],
    mount: 'rear_bumper',
    description: 'Big boombox-style subwoofer box mounted on rear deck',
  },
  tow_hitch: {
    id: 'tow_hitch', label: 'Tow ball hitch',
    fitsPresets: ['pickup_truck', 'suv', 'van', 'sedan'],
    mount: 'rear_bumper',
    description: 'Sturdy rear tow ball + hitch under the bumper',
  },
  roof_camera_pod: {
    id: 'roof_camera_pod', label: 'Roof camera pod',
    fitsPresets: ALL_CARS,
    mount: 'roof',
    description: 'Surveillance / dashcam pod on the roof',
  },
  disco_ball: {
    id: 'disco_ball', label: 'Roof disco ball',
    fitsPresets: ALL_CARS,
    mount: 'roof',
    description: 'Mirrored disco ball on roof — party/cursed vibes',
  },
  flag_pole: {
    id: 'flag_pole', label: 'Roof flag pole',
    fitsPresets: ['pickup_truck', 'suv', 'dune_buggy', 'light_utility_vehicle'],
    mount: 'roof',
    description: 'Tall pole with a colored flag waving from the roof',
  },
  smoke_stack: {
    id: 'smoke_stack', label: 'Upward smoke stack',
    fitsPresets: ['pickup_truck', 'light_utility_vehicle', 'dune_buggy'],
    mount: 'roof',
    description: 'Tall vertical exhaust chimney spewing black smoke',
  },
  jet_engine_rear: {
    id: 'jet_engine_rear', label: 'Rear jet engine',
    fitsPresets: ['sports_car', 'supercar', 'sedan', 'pickup_truck'],
    mount: 'rear_bumper',
    description: 'Cartoon jet engine mounted to the back bumper',
  },
  mud_flaps: {
    id: 'mud_flaps', label: 'Rubber mud flaps',
    fitsPresets: ['pickup_truck', 'suv', 'van', 'dune_buggy', 'light_utility_vehicle'],
    mount: 'wheels',
    description: 'Black rubber mud flaps behind each rear wheel',
  },
};

/** Filter addons to those compatible with a preset (for AI router prompt). */
export function addonsForPreset(presetId: VehiclePresetId): VehicleAddonSpec[] {
  return Object.values(VEHICLE_ADDONS).filter((a) => a.fitsPresets.includes(presetId));
}

// ─── LUA GENERATORS ─────────────────────────────────────────────────────
// Each addon spec → a Lua block that the loader script runs after the
// chassis is in workspace. Blocks are self-contained: find chassis root,
// compute mount offset, create + weld + position the addon Model.
//
// All Lua here is sandboxed by Roblox runtime — no PluginOrOpenCloud needed.

interface LuaAddonContext {
  /** Accent color hex (#RRGGBB), used for underglow tint, decals. */
  accentHex: string;
  /** Primary color hex (for fallback tints). */
  primaryHex: string;
  /** Optional plate text (used only by some addons). */
  plateText?: string;
}

const hexToColor3Lua = (hex: string): string => {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return `Color3.new(${r.toFixed(3)}, ${g.toFixed(3)}, ${b.toFixed(3)})`;
};

/** Session 387 R5: shared prologue — anchors all addons to the VehicleSeat
 *  (always present, always at chassis center). Uses bbox offset relative to
 *  the seat so positioning is robust to wrapper nesting. Calls `mount(part)`
 *  to weld+parent each new Part to the seat. */
const PROLOGUE_LUA = `
local seat = vehicleModel:FindFirstChildWhichIsA("VehicleSeat", true)
if not seat then warn("[addon] no VehicleSeat in", vehicleModel:GetFullName()); return end
local seatCF = seat.CFrame
local bbCF, bbSize = vehicleModel:GetBoundingBox()
local bbLocal = seatCF:ToObjectSpace(bbCF)
local function mount(part)
  part.Anchored = false; part.CanCollide = false; part.Massless = true
  part.Parent = vehicleModel
  local w = Instance.new("WeldConstraint"); w.Part0 = part; w.Part1 = seat; w.Parent = part
end
`.trim();

/** Each generator returns one self-contained Lua block. The builder
 *  concatenates the blocks and appends to the loader script. */
export const ADDON_LUA_GENERATORS: Record<VehicleAddonId, (ctx: LuaAddonContext) => string> = {
  taxi_sign: () => `
do
${PROLOGUE_LUA}
  -- Roof TAXI sign: bright yellow box with TAXI text on all 4 sides
  -- so it reads from every angle. Positioned on top of the body.
  local sign = Instance.new("Part")
  sign.Name = "TaxiSign"
  sign.Size = Vector3.new(2.8, 0.7, 1.1)
  sign.Color = Color3.fromRGB(242, 184, 7)
  sign.Material = Enum.Material.Neon
  sign.CFrame = seatCF * (bbLocal * CFrame.new(0, bbSize.Y/2 + 0.4, 0))
  mount(sign)
  for _, face in ipairs({Enum.NormalId.Front, Enum.NormalId.Back, Enum.NormalId.Left, Enum.NormalId.Right}) do
    local gui = Instance.new("SurfaceGui", sign)
    gui.Face = face
    gui.CanvasSize = Vector2.new(400, 100)
    gui.LightInfluence = 0
    local label = Instance.new("TextLabel")
    label.Size = UDim2.fromScale(1, 1)
    label.BackgroundTransparency = 1
    label.Text = "TAXI"
    label.Font = Enum.Font.GothamBlack
    label.TextScaled = true
    label.TextColor3 = Color3.fromRGB(0, 0, 0)
    label.Parent = gui
  end
end`.trim(),

  police_lightbar: () => `
do
${PROLOGUE_LUA}
  -- Bigger, more recognizable police bar with flashing red/blue strobes.
  local bar = Instance.new("Part")
  bar.Name = "PoliceLightBar"
  bar.Size = Vector3.new(bbSize.X * 0.55, 0.55, 1.3)
  bar.Color = Color3.fromRGB(25, 25, 25)
  bar.Material = Enum.Material.SmoothPlastic
  bar.CFrame = seatCF * (bbLocal * CFrame.new(0, bbSize.Y/2 + 0.32, 0))
  mount(bar)
  local lights = {}
  for i, side in ipairs({-1, 1}) do
    local light = Instance.new("Part")
    light.Name = i == 1 and "LightRed" or "LightBlue"
    light.Size = Vector3.new(bbSize.X * 0.24, 0.48, 1.18)
    light.Color = i == 1 and Color3.fromRGB(255, 20, 20) or Color3.fromRGB(30, 80, 255)
    light.Material = Enum.Material.Neon
    light.CFrame = bar.CFrame * CFrame.new(side * bbSize.X * 0.16, 0, 0)
    mount(light)
    local pl = Instance.new("PointLight", light)
    pl.Color = light.Color; pl.Brightness = 4; pl.Range = 20
    table.insert(lights, { part = light, pl = pl, base = light.Color })
  end
  -- Strobe animation: alternate red/blue at 4Hz
  task.spawn(function()
    local t = 0
    while bar.Parent do
      task.wait(0.25)
      t = t + 1
      for i, L in ipairs(lights) do
        local on = ((t + i) % 2) == 0
        L.part.Material = on and Enum.Material.Neon or Enum.Material.SmoothPlastic
        L.pl.Brightness = on and 5 or 0.3
      end
    end
  end)
end`.trim(),

  roof_rack: () => `
do
${PROLOGUE_LUA}
  local frame = Instance.new("Part")
  frame.Name = "RoofRack"
  frame.Size = Vector3.new(bbSize.X * 0.7, 0.15, bbSize.Z * 0.5)
  frame.Color = Color3.fromRGB(40, 40, 40)
  frame.Material = Enum.Material.Metal
  frame.CFrame = seatCF * (bbLocal * CFrame.new(0, bbSize.Y/2 + 0.12, 0))
  mount(frame)
  for i = -1, 1 do
    local bar = Instance.new("Part")
    bar.Name = "RoofRackBar" .. i
    bar.Size = Vector3.new(bbSize.X * 0.7, 0.12, 0.12)
    bar.Color = Color3.fromRGB(40, 40, 40)
    bar.Material = Enum.Material.Metal
    bar.CFrame = frame.CFrame * CFrame.new(0, 0.18, i * bbSize.Z * 0.16)
    mount(bar)
  end
end`.trim(),

  underglow: (ctx) => `
do
${PROLOGUE_LUA}
  local glow = Instance.new("Part")
  glow.Name = "Underglow"
  glow.Size = Vector3.new(bbSize.X * 0.85, 0.1, bbSize.Z * 0.8)
  glow.Color = ${hexToColor3Lua(ctx.accentHex || ctx.primaryHex)}
  glow.Material = Enum.Material.Neon
  glow.Transparency = 0.1
  glow.CFrame = seatCF * (bbLocal * CFrame.new(0, -bbSize.Y/2 + 0.05, 0))
  mount(glow)
  local light = Instance.new("PointLight", glow)
  light.Color = glow.Color; light.Brightness = 2.5; light.Range = 22
end`.trim(),

  racing_stripe: (ctx) => `
do
${PROLOGUE_LUA}
  for i, offX in ipairs({-0.35, 0.35}) do
    local stripe = Instance.new("Part")
    stripe.Name = "RacingStripe" .. i
    stripe.Size = Vector3.new(0.5, 0.06, bbSize.Z * 0.9)
    stripe.Color = ${hexToColor3Lua(ctx.accentHex || '#FFFFFF')}
    stripe.Material = Enum.Material.SmoothPlastic
    stripe.CFrame = seatCF * (bbLocal * CFrame.new(offX, bbSize.Y/2 + 0.03, 0))
    mount(stripe)
  end
end`.trim(),

  rear_spoiler_low: (ctx) => `
do
${PROLOGUE_LUA}
  local spoiler = Instance.new("Part")
  spoiler.Name = "RearSpoilerLow"
  spoiler.Size = Vector3.new(bbSize.X * 0.7, 0.18, 0.5)
  spoiler.Color = ${hexToColor3Lua(ctx.accentHex || '#1A1A1A')}
  spoiler.Material = Enum.Material.SmoothPlastic
  spoiler.CFrame = seatCF * (bbLocal * CFrame.new(0, bbSize.Y * 0.2, bbSize.Z * 0.42))
  mount(spoiler)
end`.trim(),

  rear_spoiler_high: (ctx) => `
do
${PROLOGUE_LUA}
  local mastL = Instance.new("Part"); mastL.Name = "SpoilerMastL"
  mastL.Size = Vector3.new(0.18, 0.9, 0.55)
  mastL.Color = ${hexToColor3Lua(ctx.accentHex || '#1A1A1A')}
  mastL.Material = Enum.Material.SmoothPlastic
  mastL.CFrame = seatCF * (bbLocal * CFrame.new(-bbSize.X * 0.3, bbSize.Y * 0.4, bbSize.Z * 0.42))
  mount(mastL)
  local mastR = mastL:Clone(); mastR.Name = "SpoilerMastR"
  mastR.CFrame = seatCF * (bbLocal * CFrame.new(bbSize.X * 0.3, bbSize.Y * 0.4, bbSize.Z * 0.42))
  mount(mastR)
  local wing = Instance.new("Part"); wing.Name = "SpoilerWing"
  wing.Size = Vector3.new(bbSize.X * 0.75, 0.15, 0.9)
  wing.Color = mastL.Color; wing.Material = Enum.Material.SmoothPlastic
  wing.CFrame = seatCF * (bbLocal * CFrame.new(0, bbSize.Y * 0.85, bbSize.Z * 0.42))
  mount(wing)
end`.trim(),

  exhaust_dual: () => `
do
${PROLOGUE_LUA}
  for i, offX in ipairs({-0.55, 0.55}) do
    local pipe = Instance.new("Part")
    pipe.Name = "Exhaust" .. i
    pipe.Shape = Enum.PartType.Cylinder
    pipe.Size = Vector3.new(0.8, 0.4, 0.4)
    pipe.Color = Color3.fromRGB(180, 180, 185)
    pipe.Material = Enum.Material.Metal
    pipe.CFrame = seatCF * (bbLocal * CFrame.new(offX, -bbSize.Y * 0.3, bbSize.Z * 0.48)) * CFrame.Angles(0, math.pi/2, 0)
    mount(pipe)
  end
end`.trim(),

  roof_antenna: () => `
do
${PROLOGUE_LUA}
  -- Box (not Cylinder) avoids the Roblox X-axis orientation quirk.
  -- Tall thin vertical part standing on the roof.
  local ant = Instance.new("Part")
  ant.Name = "RoofAntenna"
  ant.Size = Vector3.new(0.1, 1.6, 0.1)
  ant.Color = Color3.fromRGB(20, 20, 20)
  ant.Material = Enum.Material.Metal
  ant.CFrame = seatCF * (bbLocal * CFrame.new(-bbSize.X * 0.3, bbSize.Y/2 + 0.8, bbSize.Z * 0.25))
  mount(ant)
  -- Small red blinker tip at the top
  local tip = Instance.new("Part")
  tip.Name = "RoofAntennaTip"
  tip.Size = Vector3.new(0.18, 0.18, 0.18)
  tip.Color = Color3.fromRGB(255, 30, 30)
  tip.Material = Enum.Material.Neon
  tip.CFrame = ant.CFrame * CFrame.new(0, 0.85, 0)
  mount(tip)
end`.trim(),

  fire_dept_ladder: () => `
do
${PROLOGUE_LUA}
  local ladder = Instance.new("Part")
  ladder.Name = "FireLadder"
  ladder.Size = Vector3.new(0.4, 0.3, bbSize.Z * 1.0)
  ladder.Color = Color3.fromRGB(200, 30, 30)
  ladder.Material = Enum.Material.Metal
  ladder.CFrame = seatCF * (bbLocal * CFrame.new(0, bbSize.Y/2 + 0.2, 0))
  mount(ladder)
end`.trim(),

  monster_truck_tires: () => `
-- Monster tire upgrade: scan vehicle for wheel-ish Parts (small cylinders
-- mounted as Hinge/Motor6D joints) and increase their Size + tag the body
-- with a higher Y so the chassis sits up on big tires.
do
  for _, d in ipairs(vehicleModel:GetDescendants()) do
    if d:IsA("BasePart") and (d:IsA("Part") and d.Shape == Enum.PartType.Cylinder) then
      local s = d.Size
      if s.Y >= 1 and s.Z >= 1 and s.Y <= 3.5 and s.Z <= 3.5 then
        -- looks like a wheel (cylinder mounted with Y/Z ≈ tire diameter)
        d.Size = Vector3.new(s.X * 1.4, s.Y * 1.6, s.Z * 1.6)
        d.Color = Color3.fromRGB(20, 20, 20)
      end
    end
  end
end`.trim(),

  // ─── Round 6 generators ──────────────────────────────────────────
  headlight_bar: () => `
do
${PROLOGUE_LUA}
  local bar = Instance.new("Part")
  bar.Name = "HeadlightBar"
  bar.Size = Vector3.new(bbSize.X * 0.65, 0.25, 0.3)
  bar.Color = Color3.fromRGB(240, 240, 220)
  bar.Material = Enum.Material.Neon
  bar.CFrame = seatCF * (bbLocal * CFrame.new(0, bbSize.Y * 0.15, -bbSize.Z * 0.48))
  mount(bar)
  for i = -2, 2 do
    local pl = Instance.new("PointLight", bar)
    pl.Color = Color3.fromRGB(255, 255, 220)
    pl.Brightness = 2.5
    pl.Range = 18
    pl.Position = bar.CFrame.Position + Vector3.new(i * 0.6, 0, 0)
  end
end`.trim(),

  bull_bar: () => `
do
${PROLOGUE_LUA}
  local guard = Instance.new("Part")
  guard.Name = "BullBar"
  guard.Size = Vector3.new(bbSize.X * 0.85, 0.6, 0.35)
  guard.Color = Color3.fromRGB(100, 100, 105)
  guard.Material = Enum.Material.Metal
  guard.CFrame = seatCF * (bbLocal * CFrame.new(0, -bbSize.Y * 0.15, -bbSize.Z * 0.52))
  mount(guard)
  -- Vertical guard bars across grille
  for i = -1, 1 do
    local v = Instance.new("Part")
    v.Name = "BullBarV" .. i
    v.Size = Vector3.new(0.18, 1.0, 0.18)
    v.Color = guard.Color; v.Material = Enum.Material.Metal
    v.CFrame = guard.CFrame * CFrame.new(i * bbSize.X * 0.25, 0, -0.05)
    mount(v)
  end
end`.trim(),

  side_skirts: (ctx) => `
do
${PROLOGUE_LUA}
  for i, side in ipairs({-1, 1}) do
    local skirt = Instance.new("Part")
    skirt.Name = "SideSkirt" .. i
    skirt.Size = Vector3.new(0.2, 0.35, bbSize.Z * 0.7)
    skirt.Color = ${hexToColor3Lua(ctx.accentHex || '#1A1A1A')}
    skirt.Material = Enum.Material.SmoothPlastic
    skirt.CFrame = seatCF * (bbLocal * CFrame.new(side * bbSize.X * 0.45, -bbSize.Y * 0.32, 0))
    mount(skirt)
  end
end`.trim(),

  hood_scoop: () => `
do
${PROLOGUE_LUA}
  local scoop = Instance.new("Part")
  scoop.Name = "HoodScoop"
  scoop.Size = Vector3.new(1.4, 0.45, 1.2)
  scoop.Color = Color3.fromRGB(25, 25, 30)
  scoop.Material = Enum.Material.SmoothPlastic
  scoop.CFrame = seatCF * (bbLocal * CFrame.new(0, bbSize.Y * 0.35, -bbSize.Z * 0.2))
  mount(scoop)
  -- Hole face (black gloss insert)
  local hole = Instance.new("Part")
  hole.Name = "HoodScoopHole"
  hole.Size = Vector3.new(1.1, 0.25, 0.1)
  hole.Color = Color3.fromRGB(0, 0, 0)
  hole.Material = Enum.Material.SmoothPlastic
  hole.CFrame = scoop.CFrame * CFrame.new(0, 0.05, -0.55)
  mount(hole)
end`.trim(),

  subwoofer_trunk: (ctx) => `
do
${PROLOGUE_LUA}
  local box = Instance.new("Part")
  box.Name = "SubwooferBox"
  box.Size = Vector3.new(bbSize.X * 0.55, 0.9, 1.2)
  box.Color = Color3.fromRGB(15, 15, 15)
  box.Material = Enum.Material.SmoothPlastic
  box.CFrame = seatCF * (bbLocal * CFrame.new(0, bbSize.Y * 0.45, bbSize.Z * 0.42))
  mount(box)
  -- 2 speaker cones
  for i, off in ipairs({-0.5, 0.5}) do
    local cone = Instance.new("Part")
    cone.Name = "Speaker" .. i
    cone.Shape = Enum.PartType.Cylinder
    cone.Size = Vector3.new(0.18, 0.7, 0.7)
    cone.Color = ${hexToColor3Lua(ctx.accentHex || '#444444')}
    cone.Material = Enum.Material.Metal
    cone.CFrame = box.CFrame * CFrame.new(off, 0, -0.45) * CFrame.Angles(0, math.pi/2, 0)
    mount(cone)
  end
end`.trim(),

  tow_hitch: () => `
do
${PROLOGUE_LUA}
  local arm = Instance.new("Part")
  arm.Name = "TowHitchArm"
  arm.Size = Vector3.new(0.4, 0.25, 0.9)
  arm.Color = Color3.fromRGB(60, 60, 65)
  arm.Material = Enum.Material.Metal
  arm.CFrame = seatCF * (bbLocal * CFrame.new(0, -bbSize.Y * 0.3, bbSize.Z * 0.55))
  mount(arm)
  local ball = Instance.new("Part")
  ball.Name = "TowHitchBall"
  ball.Shape = Enum.PartType.Ball
  ball.Size = Vector3.new(0.5, 0.5, 0.5)
  ball.Color = Color3.fromRGB(120, 120, 125)
  ball.Material = Enum.Material.Metal
  ball.CFrame = arm.CFrame * CFrame.new(0, 0, 0.55)
  mount(ball)
end`.trim(),

  roof_camera_pod: () => `
do
${PROLOGUE_LUA}
  local pod = Instance.new("Part")
  pod.Name = "RoofCameraPod"
  pod.Size = Vector3.new(0.6, 0.5, 0.55)
  pod.Color = Color3.fromRGB(30, 30, 35)
  pod.Material = Enum.Material.SmoothPlastic
  pod.CFrame = seatCF * (bbLocal * CFrame.new(0, bbSize.Y/2 + 0.3, -bbSize.Z * 0.15))
  mount(pod)
  local lens = Instance.new("Part")
  lens.Name = "CamLens"
  lens.Shape = Enum.PartType.Cylinder
  lens.Size = Vector3.new(0.18, 0.35, 0.35)
  lens.Color = Color3.fromRGB(10, 10, 15)
  lens.Material = Enum.Material.Glass
  lens.CFrame = pod.CFrame * CFrame.new(0, 0, -0.4) * CFrame.Angles(0, math.pi/2, 0)
  mount(lens)
end`.trim(),

  disco_ball: () => `
do
${PROLOGUE_LUA}
  local pole = Instance.new("Part")
  pole.Name = "DiscoBallPole"
  pole.Size = Vector3.new(0.08, 0.6, 0.08)
  pole.Color = Color3.fromRGB(60, 60, 60)
  pole.Material = Enum.Material.Metal
  pole.CFrame = seatCF * (bbLocal * CFrame.new(0, bbSize.Y/2 + 0.3, 0))
  mount(pole)
  local ball = Instance.new("Part")
  ball.Name = "DiscoBall"
  ball.Shape = Enum.PartType.Ball
  ball.Size = Vector3.new(0.95, 0.95, 0.95)
  ball.Color = Color3.fromRGB(220, 220, 230)
  ball.Material = Enum.Material.Foil
  ball.Reflectance = 0.7
  ball.CFrame = pole.CFrame * CFrame.new(0, 0.7, 0)
  mount(ball)
  local pl = Instance.new("PointLight", ball)
  pl.Color = Color3.fromRGB(255, 180, 255); pl.Brightness = 2.5; pl.Range = 25
end`.trim(),

  flag_pole: (ctx) => `
do
${PROLOGUE_LUA}
  local pole = Instance.new("Part")
  pole.Name = "FlagPole"
  pole.Size = Vector3.new(0.12, 2.0, 0.12)
  pole.Color = Color3.fromRGB(80, 80, 80)
  pole.Material = Enum.Material.Metal
  pole.CFrame = seatCF * (bbLocal * CFrame.new(bbSize.X * 0.3, bbSize.Y/2 + 1.0, bbSize.Z * 0.3))
  mount(pole)
  local flag = Instance.new("Part")
  flag.Name = "Flag"
  flag.Size = Vector3.new(0.05, 0.8, 1.3)
  flag.Color = ${hexToColor3Lua(ctx.accentHex || ctx.primaryHex || '#FF0000')}
  flag.Material = Enum.Material.Fabric
  flag.CFrame = pole.CFrame * CFrame.new(0, 0.55, 0.7)
  mount(flag)
end`.trim(),

  smoke_stack: () => `
do
${PROLOGUE_LUA}
  local pipe = Instance.new("Part")
  pipe.Name = "SmokeStack"
  pipe.Shape = Enum.PartType.Cylinder
  pipe.Size = Vector3.new(1.8, 0.5, 0.5)
  pipe.Color = Color3.fromRGB(50, 50, 55)
  pipe.Material = Enum.Material.Metal
  pipe.CFrame = seatCF * (bbLocal * CFrame.new(-bbSize.X * 0.25, bbSize.Y/2 + 0.6, bbSize.Z * 0.1)) * CFrame.Angles(0, 0, math.pi/2)
  mount(pipe)
  -- Black smoke emitter at top
  local att = Instance.new("Attachment", pipe)
  att.Position = Vector3.new(0.9, 0, 0)
  local p = Instance.new("ParticleEmitter", att)
  p.Color = ColorSequence.new(Color3.fromRGB(35, 32, 30))
  p.Texture = "rbxasset://textures/particles/smoke_main.dds"
  p.Rate = 12
  p.Lifetime = NumberRange.new(2, 3.5)
  p.Size = NumberSequence.new(1.4)
  p.Speed = NumberRange.new(2, 5)
  p.Transparency = NumberSequence.new({
    NumberSequenceKeypoint.new(0, 0.25),
    NumberSequenceKeypoint.new(1, 1),
  })
end`.trim(),

  jet_engine_rear: () => `
do
${PROLOGUE_LUA}
  local engine = Instance.new("Part")
  engine.Name = "RearJetEngine"
  engine.Shape = Enum.PartType.Cylinder
  engine.Size = Vector3.new(1.6, 1.1, 1.1)
  engine.Color = Color3.fromRGB(80, 80, 85)
  engine.Material = Enum.Material.Metal
  engine.CFrame = seatCF * (bbLocal * CFrame.new(0, -bbSize.Y * 0.1, bbSize.Z * 0.55)) * CFrame.Angles(0, math.pi/2, 0)
  mount(engine)
  -- Glowing rear opening
  local ring = Instance.new("Part")
  ring.Name = "JetRing"
  ring.Shape = Enum.PartType.Cylinder
  ring.Size = Vector3.new(0.15, 1.0, 1.0)
  ring.Color = Color3.fromRGB(255, 120, 30)
  ring.Material = Enum.Material.Neon
  ring.CFrame = engine.CFrame * CFrame.new(0.7, 0, 0)
  mount(ring)
end`.trim(),

  mud_flaps: () => `
do
${PROLOGUE_LUA}
  -- Find rear wheels (cylinder parts behind seat) and add flap behind each
  local rear = {}
  for _, d in ipairs(vehicleModel:GetDescendants()) do
    if d:IsA("Part") and d.Shape == Enum.PartType.Cylinder then
      local s = d.Size
      if s.Y >= 1 and s.Y <= 4 and s.Z >= 1 and s.Z <= 4 then
        table.insert(rear, d)
      end
    end
  end
  for _, w in ipairs(rear) do
    local flap = Instance.new("Part")
    flap.Name = "MudFlap"
    flap.Size = Vector3.new(0.1, 1.0, 1.0)
    flap.Color = Color3.fromRGB(15, 15, 15)
    flap.Material = Enum.Material.SmoothPlastic
    flap.CFrame = w.CFrame * CFrame.new(0, -0.3, 0)
    mount(flap)
  end
end`.trim(),
};

// ─── DRIVE-STATS TUNING LUA ────────────────────────────────────────────
// Session 387 Round 2: per-config gameplay wiring. Each function emits a
// Lua block that mutates the live vehicle Model — patches VehicleSeat
// properties, wires boost particles, drift smoke, suspension stiffness.
// Runs from the same ModularTuningInjector Script after the vehicle is in
// workspace. Empty block ('') when the tuning is at default values.

interface TuningContext {
  maxSpeed: number;
  drift: boolean;
  boost: '' | 'flame' | 'neon' | 'smoke' | 'nitro';
  suspension: 'soft' | 'standard' | 'stiff' | 'monster';
  passengerSeats: number;
  destruction: boolean;
  accentHex: string;
  primaryHex: string;
}

const BOOST_PALETTES: Record<'flame' | 'neon' | 'smoke' | 'nitro', { r: number; g: number; b: number; material: string; sparkle: boolean }> = {
  flame:  { r: 255, g: 100, b: 20,  material: 'Neon',         sparkle: true  },
  neon:   { r: 200, g: 60,  b: 255, material: 'ForceField',   sparkle: true  },
  smoke:  { r: 60,  g: 60,  b: 60,  material: 'SmoothPlastic', sparkle: false },
  nitro:  { r: 100, g: 200, b: 255, material: 'Neon',         sparkle: true  },
};

/** maxSpeed patch — overrides VehicleSeat.MaxSpeed + Torque scale. */
export function buildMaxSpeedTuningLua(ctx: TuningContext): string {
  return `
do
  for _, d in ipairs(vehicleModel:GetDescendants()) do
    if d:IsA("VehicleSeat") then
      d.MaxSpeed = ${ctx.maxSpeed}
      d.Torque = math.max(d.Torque, ${Math.round(ctx.maxSpeed * 0.35)})
    end
  end
  print("[ModularTuning] MaxSpeed=${ctx.maxSpeed}")
end`.trim();
}

/** Boost — particle trail behind each wheel that activates on full throttle. */
export function buildBoostTuningLua(ctx: TuningContext): string {
  if (!ctx.boost) return '';
  const p = BOOST_PALETTES[ctx.boost];
  return `
do
  local seat = vehicleModel:FindFirstChildWhichIsA("VehicleSeat", true)
  if not seat then return end
  local wheels = {}
  for _, d in ipairs(vehicleModel:GetDescendants()) do
    if d:IsA("BasePart") and d:IsA("Part") and d.Shape == Enum.PartType.Cylinder then
      local s = d.Size
      if s.Y >= 1 and s.Y <= 4 and s.Z >= 1 and s.Z <= 4 then table.insert(wheels, d) end
    end
  end
  if #wheels == 0 then return end
  local function emit()
    for _, w in ipairs(wheels) do
      local att = Instance.new("Attachment", w)
      att.Name = "BoostFXAtt"
      local p = Instance.new("ParticleEmitter", att)
      p.Name = "BoostFX_${ctx.boost}"
      p.Color = ColorSequence.new(Color3.fromRGB(${p.r}, ${p.g}, ${p.b}))
      p.LightEmission = 0.9
      p.LightInfluence = 0
      p.Texture = "${p.material === 'SmoothPlastic' ? 'rbxasset://textures/particles/smoke_main.dds' : 'rbxasset://textures/particles/sparkles_main.dds'}"
      p.Rate = 0
      p.Lifetime = NumberRange.new(0.4, 0.8)
      p.Size = NumberSequence.new({
        NumberSequenceKeypoint.new(0, ${ctx.boost === 'smoke' ? 1.4 : 0.7}),
        NumberSequenceKeypoint.new(1, 0.1)
      })
      p.Speed = NumberRange.new(8, 14)
      p.SpreadAngle = Vector2.new(20, 20)
      p.Transparency = NumberSequence.new({
        NumberSequenceKeypoint.new(0, 0.2),
        NumberSequenceKeypoint.new(1, 1),
      })
      p.Acceleration = Vector3.new(0, 5, 0)
    end
  end
  emit()
  -- Activate on full throttle, deactivate on release.
  seat:GetPropertyChangedSignal("Throttle"):Connect(function()
    local rate = (seat.Throttle > 0.85) and ${ctx.boost === 'smoke' ? 30 : 60} or 0
    for _, w in ipairs(wheels) do
      for _, ch in ipairs(w:GetChildren()) do
        if ch:IsA("Attachment") and ch.Name == "BoostFXAtt" then
          for _, fx in ipairs(ch:GetChildren()) do
            if fx:IsA("ParticleEmitter") then fx.Rate = rate end
          end
        end
      end
    end
  end)
  print("[ModularTuning] boost wired: ${ctx.boost}")
end`.trim();
}

/** Drift — when steering hard at speed, spawn smoke trail under wheels. */
export function buildDriftTuningLua(ctx: TuningContext): string {
  if (!ctx.drift) return '';
  return `
do
  local seat = vehicleModel:FindFirstChildWhichIsA("VehicleSeat", true)
  if not seat then return end
  local RunService = game:GetService("RunService")
  local rearWheels = {}
  for _, d in ipairs(vehicleModel:GetDescendants()) do
    if d:IsA("BasePart") and d:IsA("Part") and d.Shape == Enum.PartType.Cylinder then
      local s = d.Size
      if s.Y >= 1 and s.Y <= 4 and s.Z >= 1 and s.Z <= 4 then table.insert(rearWheels, d) end
    end
  end
  if #rearWheels == 0 then return end
  -- Persistent smoke emitter per wheel — toggled by drift detector.
  for _, w in ipairs(rearWheels) do
    local att = Instance.new("Attachment", w)
    att.Name = "DriftFXAtt"
    local p = Instance.new("ParticleEmitter", att)
    p.Name = "DriftFX"
    p.Color = ColorSequence.new(Color3.fromRGB(220, 220, 220))
    p.Texture = "rbxasset://textures/particles/smoke_main.dds"
    p.Rate = 0
    p.Lifetime = NumberRange.new(0.8, 1.5)
    p.Size = NumberSequence.new({
      NumberSequenceKeypoint.new(0, 1.3),
      NumberSequenceKeypoint.new(1, 2.5),
    })
    p.Speed = NumberRange.new(2, 4)
    p.SpreadAngle = Vector2.new(45, 45)
    p.Transparency = NumberSequence.new({
      NumberSequenceKeypoint.new(0, 0.3),
      NumberSequenceKeypoint.new(1, 1),
    })
  end
  local conn
  conn = RunService.Heartbeat:Connect(function()
    if not seat or not seat.Parent then if conn then conn:Disconnect() end; return end
    local isDrifting = math.abs(seat.Steer) > 0.55 and seat.Throttle > 0.3
    local rate = isDrifting and 24 or 0
    for _, w in ipairs(rearWheels) do
      for _, ch in ipairs(w:GetChildren()) do
        if ch:IsA("Attachment") and ch.Name == "DriftFXAtt" then
          for _, fx in ipairs(ch:GetChildren()) do
            if fx:IsA("ParticleEmitter") then fx.Rate = rate end
          end
        end
      end
    end
  end)
  print("[ModularTuning] drift wired")
end`.trim();
}

/** Suspension — adjust SpringConstraint stiffness for the desired feel.
 *  Round 7: reduced multipliers because aggressive stiffness was causing
 *  camera jitter from the template's baked controller fighting our tweaks. */
export function buildSuspensionTuningLua(ctx: TuningContext): string {
  if (ctx.suspension === 'standard') return '';
  // Conservative range — multiply baseline 0.7×–1.25× only.
  const stiffness = ctx.suspension === 'soft' ? 0.75
    : ctx.suspension === 'stiff' ? 1.2
    : ctx.suspension === 'monster' ? 0.7
    : 1.0;
  const damping = ctx.suspension === 'monster' ? 0.85 : (ctx.suspension === 'stiff' ? 1.15 : 1.0);
  return `
do
  local STIFFNESS_MUL = ${stiffness}
  local DAMPING_MUL = ${damping}
  local patched = 0
  for _, d in ipairs(vehicleModel:GetDescendants()) do
    if d:IsA("SpringConstraint") then
      d.Stiffness = math.max(d.Stiffness * STIFFNESS_MUL, 100)
      d.Damping = math.max(d.Damping * DAMPING_MUL, 50)
      patched = patched + 1
    end
  end
  ${ctx.suspension === 'monster' ? `
  -- Monster also lifts the chassis by enlarging wheels (already done by
  -- monster_truck_tires addon if user chose it; here we additionally adjust
  -- the chassis Position offset so the body rides high above the new tires).
  task.wait(0.2)
  for _, d in ipairs(vehicleModel:GetDescendants()) do
    if d:IsA("BasePart") and d:IsA("Part") and d.Shape == Enum.PartType.Cylinder then
      local s = d.Size
      if s.Y >= 1 and s.Y <= 4 and s.Z >= 1 and s.Z <= 4 then
        d.Size = Vector3.new(s.X * 1.15, s.Y * 1.35, s.Z * 1.35)
      end
    end
  end` : ''}
  print("[ModularTuning] suspension=${ctx.suspension}, patched", patched, "springs")
end`.trim();
}

/** Combine all tuning Lua blocks into one script body. */
export function buildTuningLuaBlock(ctx: TuningContext): string {
  const blocks = [
    buildMaxSpeedTuningLua(ctx),
    buildBoostTuningLua(ctx),
    buildDriftTuningLua(ctx),
    buildSuspensionTuningLua(ctx),
  ].filter((b) => b.length > 0);
  if (blocks.length === 0) return '';
  return ['-- Modular drive-stats tuning (session 387 round 2)', ...blocks].join('\n\n');
}

/** Resolve a list of addon IDs into the actual specs (filters unknowns). */
export function resolveAddons(ids: ReadonlyArray<string>): VehicleAddonSpec[] {
  const out: VehicleAddonSpec[] = [];
  for (const id of ids) {
    const spec = (VEHICLE_ADDONS as Record<string, VehicleAddonSpec>)[id];
    if (spec) out.push(spec);
  }
  return out;
}

/** Build the concatenated Lua block for a set of addons. Block runs after
 *  the chassis Model is named `vehicleModel` and parented in workspace. */
export function buildAddonsLuaBlock(
  addonIds: ReadonlyArray<VehicleAddonId>,
  ctx: LuaAddonContext,
): string {
  const lines: string[] = ['-- Modular addons (session 387)'];
  for (const id of addonIds) {
    const gen = ADDON_LUA_GENERATORS[id];
    if (!gen) continue;
    lines.push(`-- [addon:${id}]`);
    lines.push(gen(ctx));
  }
  return lines.join('\n\n');
}
