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
    id: 'sedan',
    label: 'Sedan',
    templateRbxmFilename: 'Sedan-6418239833.rbxm',
    assetId: 6418239833,
    bodyOriginalHex: '#F3F3F3',
    defaultStyle: 'default',
    baselineStats: {
      maxSpeed: 90, drift: false, boost: '', suspension: 'standard',
      passengerSeats: 3, destruction: false,
    },
  },
  sports_car: {
    id: 'sports_car',
    label: 'Sports Car',
    templateRbxmFilename: 'SportsCar-6433323089.rbxm',
    assetId: 6433323089,
    bodyOriginalHex: '#F8F8F8',
    defaultStyle: 'default',
    baselineStats: {
      maxSpeed: 140, drift: true, boost: 'flame', suspension: 'stiff',
      passengerSeats: 1, destruction: false,
    },
  },
  supercar: {
    id: 'supercar',
    label: 'Supercar',
    templateRbxmFilename: 'Supercar-6433330180.rbxm',
    assetId: 6433330180,
    bodyOriginalHex: '#FFB000',
    defaultStyle: 'luxury',
    baselineStats: {
      maxSpeed: 170, drift: true, boost: 'neon', suspension: 'stiff',
      passengerSeats: 1, destruction: false,
    },
  },
  suv: {
    id: 'suv',
    label: 'SUV',
    templateRbxmFilename: 'SUV-6418234850.rbxm',
    assetId: 6418234850,
    bodyOriginalHex: '#E7E7EC',
    defaultStyle: 'default',
    baselineStats: {
      maxSpeed: 100, drift: false, boost: '', suspension: 'soft',
      passengerSeats: 4, destruction: false,
    },
  },
  pickup_truck: {
    id: 'pickup_truck',
    label: 'Pickup Truck',
    templateRbxmFilename: 'PickupTruck-6418225759.rbxm',
    assetId: 6418225759,
    bodyOriginalHex: '#F8F8F8',
    defaultStyle: 'default',
    baselineStats: {
      maxSpeed: 95, drift: false, boost: 'smoke', suspension: 'soft',
      passengerSeats: 1, destruction: true,
    },
  },
  van: {
    id: 'van',
    label: 'Van',
    templateRbxmFilename: 'Van-6433316269.rbxm',
    assetId: 6433316269,
    bodyOriginalHex: '#E7E7EC',
    defaultStyle: 'default',
    baselineStats: {
      maxSpeed: 80, drift: false, boost: '', suspension: 'soft',
      passengerSeats: 6, destruction: false,
    },
  },
  dune_buggy: {
    id: 'dune_buggy',
    label: 'Dune Buggy',
    templateRbxmFilename: 'DuneBuggy-6433272094.rbxm',
    assetId: 6433272094,
    bodyOriginalHex: '#D1BEA6',
    defaultStyle: 'apocalypse',
    baselineStats: {
      maxSpeed: 110, drift: true, boost: 'smoke', suspension: 'soft',
      passengerSeats: 1, destruction: true,
    },
  },
  light_utility_vehicle: {
    id: 'light_utility_vehicle',
    label: 'Light Utility Vehicle',
    templateRbxmFilename: 'LightUtilityVehicle-6418221666.rbxm',
    assetId: 6418221666,
    bodyOriginalHex: '#202020',
    defaultStyle: 'military',
    baselineStats: {
      maxSpeed: 90, drift: false, boost: '', suspension: 'standard',
      passengerSeats: 3, destruction: true,
    },
  },
  police_car: {
    id: 'police_car',
    label: 'Police Car',
    templateRbxmFilename: 'PoliceCar-6418230807.rbxm',
    assetId: 6418230807,
    bodyOriginalHex: '#FFFFFF',
    defaultStyle: 'default',
    baselineStats: {
      maxSpeed: 130, drift: false, boost: '', suspension: 'standard',
      passengerSeats: 1, destruction: false,
    },
  },
  motorcycle: {
    id: 'motorcycle',
    label: 'Motorcycle',
    templateRbxmFilename: 'Motorcycle-17388481396.rbxm',
    assetId: 17388481396,
    bodyOriginalHex: '#111111',
    defaultStyle: 'default',
    baselineStats: {
      maxSpeed: 130, drift: false, boost: 'flame', suspension: 'stiff',
      passengerSeats: 0, destruction: false,
    },
  },
  boat: {
    id: 'boat',
    label: 'Speedboat',
    templateRbxmFilename: 'Boat-30309891.rbxm',
    assetId: 30309891,
    bodyOriginalHex: '#FFCC99',
    defaultStyle: 'default',
    baselineStats: {
      maxSpeed: 100, drift: false, boost: '', suspension: 'standard',
      passengerSeats: 3, destruction: false,
    },
  },
  plane: {
    id: 'plane',
    label: 'Embraer Phenom 100',
    templateRbxmFilename: 'Phenom100-PlaneKit.rbxm',
    assetId: 0,
    bodyOriginalHex: '#F8F8F8',
    defaultStyle: 'default',
    baselineStats: {
      maxSpeed: 200, drift: false, boost: '', suspension: 'standard',
      passengerSeats: 5, destruction: false,
    },
  },
  tank: {
    id: 'tank',
    label: 'Tank',
    templateRbxmFilename: 'Tank-101512952.rbxm',
    assetId: 101512952,
    bodyOriginalHex: '#F2F3F3',
    defaultStyle: 'military',
    baselineStats: {
      maxSpeed: 50, drift: false, boost: '', suspension: 'monster',
      passengerSeats: 1, destruction: true,
    },
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

/** Each generator returns one self-contained Lua block. The builder
 *  concatenates the blocks and appends to the loader script. */
export const ADDON_LUA_GENERATORS: Record<VehicleAddonId, (ctx: LuaAddonContext) => string> = {
  taxi_sign: () => `
do
  local root = vehicleModel:FindFirstChild("Body", true) or vehicleModel
  local cf, size = vehicleModel:GetBoundingBox()
  local sign = Instance.new("Part")
  sign.Name = "TaxiSign"
  sign.Size = Vector3.new(3.5, 0.9, 1.4)
  sign.Color = Color3.fromRGB(242, 184, 7)
  sign.Material = Enum.Material.Neon
  sign.Anchored = false
  sign.CanCollide = false
  sign.Massless = true
  sign.CFrame = cf * CFrame.new(0, size.Y/2 + 0.45, 0)
  sign.Parent = vehicleModel
  local text = Instance.new("SurfaceGui")
  text.Face = Enum.NormalId.Front
  text.Parent = sign
  text.CanvasSize = Vector2.new(350, 90)
  local label = Instance.new("TextLabel")
  label.Size = UDim2.fromScale(1, 1)
  label.BackgroundTransparency = 1
  label.Text = "TAXI"
  label.Font = Enum.Font.GothamBlack
  label.TextScaled = true
  label.TextColor3 = Color3.fromRGB(0, 0, 0)
  label.Parent = text
  local weld = Instance.new("WeldConstraint")
  weld.Part0 = sign
  weld.Part1 = root:IsA("Model") and (root:FindFirstChildOfClass("Part") or root:FindFirstChildWhichIsA("BasePart")) or root
  if weld.Part1 then weld.Parent = sign else sign:Destroy() end
end`.trim(),

  police_lightbar: () => `
do
  local cf, size = vehicleModel:GetBoundingBox()
  local bar = Instance.new("Part")
  bar.Name = "PoliceLightBar"
  bar.Size = Vector3.new(3.2, 0.5, 1.2)
  bar.Color = Color3.fromRGB(30, 30, 30)
  bar.Anchored = false; bar.CanCollide = false; bar.Massless = true
  bar.CFrame = cf * CFrame.new(0, size.Y/2 + 0.25, 0)
  bar.Parent = vehicleModel
  for i, side in ipairs({-1, 1}) do
    local light = Instance.new("Part")
    light.Name = i == 1 and "LightRed" or "LightBlue"
    light.Size = Vector3.new(1.4, 0.4, 1.1)
    light.Color = i == 1 and Color3.fromRGB(255, 30, 30) or Color3.fromRGB(30, 80, 255)
    light.Material = Enum.Material.Neon
    light.Anchored = false; light.CanCollide = false; light.Massless = true
    light.CFrame = bar.CFrame * CFrame.new(side * 0.9, 0, 0)
    light.Parent = vehicleModel
    local w = Instance.new("WeldConstraint"); w.Part0 = bar; w.Part1 = light; w.Parent = light
    local pl = Instance.new("PointLight", light)
    pl.Color = light.Color; pl.Brightness = 3; pl.Range = 12
  end
  local rootPart = vehicleModel:FindFirstChildWhichIsA("BasePart", true)
  if rootPart then
    local w = Instance.new("WeldConstraint"); w.Part0 = bar; w.Part1 = rootPart; w.Parent = bar
  end
end`.trim(),

  roof_rack: () => `
do
  local cf, size = vehicleModel:GetBoundingBox()
  local frame = Instance.new("Part")
  frame.Name = "RoofRack"
  frame.Size = Vector3.new(size.X * 0.85, 0.15, size.Z * 0.55)
  frame.Color = Color3.fromRGB(40, 40, 40)
  frame.Material = Enum.Material.Metal
  frame.Anchored = false; frame.CanCollide = false; frame.Massless = true
  frame.CFrame = cf * CFrame.new(0, size.Y/2 + 0.12, 0)
  frame.Parent = vehicleModel
  for i = -1, 1 do
    local bar = Instance.new("Part")
    bar.Name = "RoofRackBar" .. i
    bar.Size = Vector3.new(size.X * 0.85, 0.12, 0.12)
    bar.Color = Color3.fromRGB(40, 40, 40)
    bar.Material = Enum.Material.Metal
    bar.Anchored = false; bar.CanCollide = false; bar.Massless = true
    bar.CFrame = frame.CFrame * CFrame.new(0, 0.2, i * size.Z * 0.18)
    bar.Parent = vehicleModel
    local w = Instance.new("WeldConstraint"); w.Part0 = frame; w.Part1 = bar; w.Parent = bar
  end
  local rootPart = vehicleModel:FindFirstChildWhichIsA("BasePart", true)
  if rootPart then
    local w = Instance.new("WeldConstraint"); w.Part0 = frame; w.Part1 = rootPart; w.Parent = frame
  end
end`.trim(),

  underglow: (ctx) => `
do
  local cf, size = vehicleModel:GetBoundingBox()
  local glow = Instance.new("Part")
  glow.Name = "Underglow"
  glow.Size = Vector3.new(size.X * 0.9, 0.12, size.Z * 0.85)
  glow.Color = ${hexToColor3Lua(ctx.accentHex || ctx.primaryHex)}
  glow.Material = Enum.Material.Neon
  glow.Transparency = 0.15
  glow.Anchored = false; glow.CanCollide = false; glow.Massless = true
  glow.CFrame = cf * CFrame.new(0, -size.Y/2 + 0.05, 0)
  glow.Parent = vehicleModel
  local light = Instance.new("PointLight", glow)
  light.Color = glow.Color; light.Brightness = 2; light.Range = 20
  local rootPart = vehicleModel:FindFirstChildWhichIsA("BasePart", true)
  if rootPart then
    local w = Instance.new("WeldConstraint"); w.Part0 = glow; w.Part1 = rootPart; w.Parent = glow
  end
end`.trim(),

  racing_stripe: (ctx) => `
do
  local cf, size = vehicleModel:GetBoundingBox()
  for i, offX in ipairs({-0.35, 0.35}) do
    local stripe = Instance.new("Part")
    stripe.Name = "RacingStripe" .. i
    stripe.Size = Vector3.new(0.55, 0.06, size.Z * 0.95)
    stripe.Color = ${hexToColor3Lua(ctx.accentHex || '#FFFFFF')}
    stripe.Material = Enum.Material.SmoothPlastic
    stripe.Anchored = false; stripe.CanCollide = false; stripe.Massless = true
    stripe.CFrame = cf * CFrame.new(offX, size.Y/2 + 0.03, 0)
    stripe.Parent = vehicleModel
    local rootPart = vehicleModel:FindFirstChildWhichIsA("BasePart", true)
    if rootPart then
      local w = Instance.new("WeldConstraint"); w.Part0 = stripe; w.Part1 = rootPart; w.Parent = stripe
    end
  end
end`.trim(),

  rear_spoiler_low: (ctx) => `
do
  local cf, size = vehicleModel:GetBoundingBox()
  local spoiler = Instance.new("Part")
  spoiler.Name = "RearSpoilerLow"
  spoiler.Size = Vector3.new(size.X * 0.7, 0.18, 0.5)
  spoiler.Color = ${hexToColor3Lua(ctx.accentHex || '#1A1A1A')}
  spoiler.Material = Enum.Material.SmoothPlastic
  spoiler.Anchored = false; spoiler.CanCollide = false; spoiler.Massless = true
  spoiler.CFrame = cf * CFrame.new(0, size.Y * 0.2, size.Z * 0.45)
  spoiler.Parent = vehicleModel
  local rootPart = vehicleModel:FindFirstChildWhichIsA("BasePart", true)
  if rootPart then
    local w = Instance.new("WeldConstraint"); w.Part0 = spoiler; w.Part1 = rootPart; w.Parent = spoiler
  end
end`.trim(),

  rear_spoiler_high: (ctx) => `
do
  local cf, size = vehicleModel:GetBoundingBox()
  local mast = Instance.new("Part")
  mast.Name = "SpoilerMastL"
  mast.Size = Vector3.new(0.18, 1.0, 0.6)
  mast.Color = ${hexToColor3Lua(ctx.accentHex || '#1A1A1A')}
  mast.Material = Enum.Material.SmoothPlastic
  mast.Anchored = false; mast.CanCollide = false; mast.Massless = true
  mast.CFrame = cf * CFrame.new(-size.X * 0.3, size.Y * 0.35, size.Z * 0.45)
  mast.Parent = vehicleModel
  local mastR = mast:Clone(); mastR.Name = "SpoilerMastR"
  mastR.CFrame = cf * CFrame.new(size.X * 0.3, size.Y * 0.35, size.Z * 0.45)
  mastR.Parent = vehicleModel
  local wing = Instance.new("Part")
  wing.Name = "SpoilerWing"
  wing.Size = Vector3.new(size.X * 0.75, 0.15, 0.95)
  wing.Color = ${hexToColor3Lua(ctx.accentHex || '#1A1A1A')}
  wing.Material = Enum.Material.SmoothPlastic
  wing.Anchored = false; wing.CanCollide = false; wing.Massless = true
  wing.CFrame = cf * CFrame.new(0, size.Y * 0.85, size.Z * 0.45)
  wing.Parent = vehicleModel
  local rootPart = vehicleModel:FindFirstChildWhichIsA("BasePart", true)
  if rootPart then
    for _, p in ipairs({mast, mastR, wing}) do
      local w = Instance.new("WeldConstraint"); w.Part0 = p; w.Part1 = rootPart; w.Parent = p
    end
    local wW = Instance.new("WeldConstraint"); wW.Part0 = wing; wW.Part1 = mast; wW.Parent = wing
  end
end`.trim(),

  exhaust_dual: () => `
do
  local cf, size = vehicleModel:GetBoundingBox()
  for i, offX in ipairs({-0.6, 0.6}) do
    local pipe = Instance.new("Part")
    pipe.Name = "Exhaust" .. i
    pipe.Shape = Enum.PartType.Cylinder
    pipe.Size = Vector3.new(0.8, 0.45, 0.45)
    pipe.Color = Color3.fromRGB(180, 180, 185)
    pipe.Material = Enum.Material.Metal
    pipe.Anchored = false; pipe.CanCollide = false; pipe.Massless = true
    pipe.CFrame = cf * CFrame.new(offX, -size.Y * 0.3, size.Z * 0.5) * CFrame.Angles(0, math.pi/2, 0)
    pipe.Parent = vehicleModel
    local rootPart = vehicleModel:FindFirstChildWhichIsA("BasePart", true)
    if rootPart then
      local w = Instance.new("WeldConstraint"); w.Part0 = pipe; w.Part1 = rootPart; w.Parent = pipe
    end
  end
end`.trim(),

  roof_antenna: () => `
do
  local cf, size = vehicleModel:GetBoundingBox()
  local ant = Instance.new("Part")
  ant.Name = "RoofAntenna"
  ant.Shape = Enum.PartType.Cylinder
  ant.Size = Vector3.new(2.5, 0.08, 0.08)
  ant.Color = Color3.fromRGB(20, 20, 20)
  ant.Material = Enum.Material.Metal
  ant.Anchored = false; ant.CanCollide = false; ant.Massless = true
  ant.CFrame = cf * CFrame.new(-size.X * 0.35, size.Y/2 + 1.2, size.Z * 0.3) * CFrame.Angles(0, 0, math.pi/2)
  ant.Parent = vehicleModel
  local rootPart = vehicleModel:FindFirstChildWhichIsA("BasePart", true)
  if rootPart then
    local w = Instance.new("WeldConstraint"); w.Part0 = ant; w.Part1 = rootPart; w.Parent = ant
  end
end`.trim(),

  fire_dept_ladder: () => `
do
  local cf, size = vehicleModel:GetBoundingBox()
  local ladder = Instance.new("Part")
  ladder.Name = "FireLadder"
  ladder.Size = Vector3.new(0.4, 0.3, size.Z * 1.1)
  ladder.Color = Color3.fromRGB(200, 30, 30)
  ladder.Material = Enum.Material.Metal
  ladder.Anchored = false; ladder.CanCollide = false; ladder.Massless = true
  ladder.CFrame = cf * CFrame.new(0, size.Y/2 + 0.2, 0)
  ladder.Parent = vehicleModel
  local rootPart = vehicleModel:FindFirstChildWhichIsA("BasePart", true)
  if rootPart then
    local w = Instance.new("WeldConstraint"); w.Part0 = ladder; w.Part1 = rootPart; w.Parent = ladder
  end
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
};

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
