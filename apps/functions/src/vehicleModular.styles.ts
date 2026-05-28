// Session 387 Round 3 — Style Packs.
//
// Each style = palette overrides + ambient Lua effect (always-on glow,
// particles, decals) + addon biases (pre-suggested addons the AI router
// considers strongly).
//
// User priority: cyberpunk + sigma + apocalypse + military as MUST-have.
// Plus anime, cursed, luxury, retro, default for full coverage.

import type { VehicleAddonId, VehicleStyleId } from './vehicleModular.types.js';

export interface VehicleStylePack {
  id: VehicleStyleId;
  label: string;
  /** Short description fed to AI router so it picks coherent addons. */
  description: string;
  /** Primary color hint — used when AI doesn't pick / overrides muted hexes. */
  paletteHint: { primary: string; accent: string };
  /** Addons this style "really wants" — AI router gets this as preference. */
  addonBiases: ReadonlyArray<VehicleAddonId>;
  /** Lua block that runs after tuning — applies always-on aesthetic
   *  effects (body glow, particle aura, material swap). Uses local
   *  `vehicleModel` + `style` constants. Empty string = no effect. */
  ambientLuaBlock: (ctx: { primaryHex: string; accentHex: string }) => string;
}

const hexToRgbLua = (hex: string): string => {
  const h = hex.replace('#', '');
  return `Color3.fromRGB(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`;
};

// Common helper: walk body Parts, apply material + tint override.
// Pure-Lua, no external imports.
const bodyTreatmentLua = (opts: {
  material: 'Neon' | 'ForceField' | 'Metal' | 'Glass' | 'Wood' | 'Plastic';
  glowColor?: string;
  bodyOriginalHexEnv: string;
}): string => `
local TARGET_MATERIAL = Enum.Material.${opts.material}
local hitCount = 0
for _, d in ipairs(vehicleModel:GetDescendants()) do
  if d:IsA("BasePart") and d.Material == Enum.Material.SmoothPlastic then
    -- body-only heuristic: SmoothPlastic excluded wheels/glass/lights
    d.Material = TARGET_MATERIAL
    hitCount = hitCount + 1
  end
end
print("[ModularStyle] body treatment hits=", hitCount)
${opts.glowColor ? `
-- additional ambient PointLight near roof center
local cf, _ = vehicleModel:GetBoundingBox()
local glow = Instance.new("Part")
glow.Name = "StyleAmbientGlow"
glow.Size = Vector3.new(0.4, 0.4, 0.4)
glow.Transparency = 1
glow.CanCollide = false
glow.Anchored = false
glow.Massless = true
glow.CFrame = cf
glow.Parent = vehicleModel
local pl = Instance.new("PointLight", glow)
pl.Color = ${opts.glowColor}
pl.Brightness = 2
pl.Range = 18
local rootPart = vehicleModel:FindFirstChildWhichIsA("BasePart", true)
if rootPart then
  local w = Instance.new("WeldConstraint"); w.Part0 = glow; w.Part1 = rootPart; w.Parent = glow
end
` : ''}
`.trim();

export const VEHICLE_STYLES: Record<VehicleStyleId, VehicleStylePack> = {
  default: {
    id: 'default',
    label: 'Default',
    description: 'No stylistic override — standard Roblox vehicle look.',
    paletteHint: { primary: '#E03A2E', accent: '#1A1A1A' },
    addonBiases: [],
    ambientLuaBlock: () => '',
  },

  cyberpunk: {
    id: 'cyberpunk',
    label: 'Cyberpunk',
    description: 'Neon, emissive purple/cyan, glow trails — Night City vibe.',
    paletteHint: { primary: '#9C27B0', accent: '#00FFFF' },
    addonBiases: ['underglow', 'rear_spoiler_high', 'exhaust_dual'],
    ambientLuaBlock: (ctx) => `
do
${bodyTreatmentLua({ material: 'Neon', glowColor: hexToRgbLua(ctx.accentHex), bodyOriginalHexEnv: ctx.primaryHex })}

-- Cyberpunk-only: scanline trail behind the rear of the chassis
local cf, size = vehicleModel:GetBoundingBox()
local trailAtt0 = Instance.new("Attachment")
trailAtt0.Name = "StyleCyberTrailA"
local trailAtt1 = Instance.new("Attachment")
trailAtt1.Name = "StyleCyberTrailB"
local rootPart = vehicleModel:FindFirstChildWhichIsA("BasePart", true)
if rootPart then
  trailAtt0.Parent = rootPart
  trailAtt0.Position = Vector3.new(-size.X * 0.35, -size.Y * 0.3, size.Z * 0.4)
  trailAtt1.Parent = rootPart
  trailAtt1.Position = Vector3.new( size.X * 0.35, -size.Y * 0.3, size.Z * 0.4)
  local trail = Instance.new("Trail", rootPart)
  trail.Attachment0 = trailAtt0
  trail.Attachment1 = trailAtt1
  trail.Color = ColorSequence.new(${hexToRgbLua(ctx.accentHex)})
  trail.Lifetime = 0.7
  trail.MinLength = 0.5
  trail.LightEmission = 1
  trail.LightInfluence = 0
  trail.Transparency = NumberSequence.new({
    NumberSequenceKeypoint.new(0, 0.1),
    NumberSequenceKeypoint.new(1, 1),
  })
end
end`.trim(),
  },

  sigma: {
    id: 'sigma',
    label: 'Sigma',
    description: 'Matte black + gold accents — minimalist luxury aesthetic.',
    paletteHint: { primary: '#0A0A0A', accent: '#C9A227' },
    addonBiases: ['exhaust_dual', 'rear_spoiler_low'],
    ambientLuaBlock: (ctx) => `
do
${bodyTreatmentLua({ material: 'Metal', bodyOriginalHexEnv: ctx.primaryHex })}
-- Sigma signature: gold trim re-tint of accent-colored parts
for _, d in ipairs(vehicleModel:GetDescendants()) do
  if d:IsA("BasePart") and d.Material == Enum.Material.Plastic then
    -- minimal accent retint for trim parts
    d.Color = ${hexToRgbLua(ctx.accentHex)}
  end
end
end`.trim(),
  },

  military: {
    id: 'military',
    label: 'Military',
    description: 'Desaturated olive/khaki camo, matte finish, no glow.',
    paletteHint: { primary: '#4A5D3A', accent: '#3A2E1F' },
    addonBiases: ['roof_antenna', 'monster_truck_tires', 'roof_rack'],
    ambientLuaBlock: (ctx) => `
do
${bodyTreatmentLua({ material: 'Wood', bodyOriginalHexEnv: ctx.primaryHex })}
-- Military: desaturate any over-saturated parts (override neon colors)
for _, d in ipairs(vehicleModel:GetDescendants()) do
  if d:IsA("BasePart") then
    local c = d.Color
    local max = math.max(c.R, c.G, c.B)
    local min = math.min(c.R, c.G, c.B)
    if max > 0.05 and (max - min) / max > 0.6 then
      -- over-saturated → desaturate towards olive
      d.Color = Color3.new(
        c.R * 0.4 + 0.29,
        c.G * 0.4 + 0.36,
        c.B * 0.4 + 0.23
      )
    end
  end
end
end`.trim(),
  },

  apocalypse: {
    id: 'apocalypse',
    label: 'Apocalypse',
    description: 'Rust patina, scorched paint, broken hood vibes — Mad Max.',
    paletteHint: { primary: '#5B3A1E', accent: '#9B5D34' },
    addonBiases: ['monster_truck_tires', 'roof_rack', 'roof_antenna', 'exhaust_dual'],
    ambientLuaBlock: (ctx) => `
do
${bodyTreatmentLua({ material: 'Metal', bodyOriginalHexEnv: ctx.primaryHex })}
-- Apocalypse: random rust-color speckle parts on body
local cf, size = vehicleModel:GetBoundingBox()
for i = 1, 8 do
  local rust = Instance.new("Part")
  rust.Name = "RustPatch" .. i
  rust.Size = Vector3.new(0.35 + math.random() * 0.4, 0.05, 0.35 + math.random() * 0.4)
  rust.Color = Color3.fromRGB(120 + math.random(0, 40), 60 + math.random(0, 30), 30)
  rust.Material = Enum.Material.Concrete
  rust.Anchored = false; rust.CanCollide = false; rust.Massless = true
  local sx = (math.random() - 0.5) * size.X * 0.7
  local sz = (math.random() - 0.5) * size.Z * 0.7
  rust.CFrame = cf * CFrame.new(sx, size.Y / 2 + 0.03, sz)
  rust.Parent = vehicleModel
  local rootPart = vehicleModel:FindFirstChildWhichIsA("BasePart", true)
  if rootPart then
    local w = Instance.new("WeldConstraint"); w.Part0 = rust; w.Part1 = rootPart; w.Parent = rust
  end
end
-- emit slow black smoke from rear (broken engine)
local rootPart = vehicleModel:FindFirstChildWhichIsA("BasePart", true)
if rootPart then
  local att = Instance.new("Attachment", rootPart)
  att.Position = Vector3.new(0, 0, size.Z * 0.45)
  local p = Instance.new("ParticleEmitter", att)
  p.Color = ColorSequence.new(Color3.fromRGB(40, 35, 30))
  p.Texture = "rbxasset://textures/particles/smoke_main.dds"
  p.Rate = 4
  p.Lifetime = NumberRange.new(2, 3)
  p.Size = NumberSequence.new(1.5)
  p.Speed = NumberRange.new(1, 3)
  p.Transparency = NumberSequence.new({
    NumberSequenceKeypoint.new(0, 0.3),
    NumberSequenceKeypoint.new(1, 1),
  })
end
end`.trim(),
  },

  anime: {
    id: 'anime',
    label: 'Anime',
    description: 'Saturated cel-shaded palette, bright pink/blue/yellow.',
    paletteHint: { primary: '#FF4FB5', accent: '#42E0FF' },
    addonBiases: ['racing_stripe', 'underglow', 'rear_spoiler_high'],
    ambientLuaBlock: (ctx) => `
do
${bodyTreatmentLua({ material: 'Plastic', glowColor: hexToRgbLua(ctx.primaryHex), bodyOriginalHexEnv: ctx.primaryHex })}
end`.trim(),
  },

  cursed: {
    id: 'cursed',
    label: 'Cursed',
    description: 'Inverted/glitched colors, surreal asymmetry, memey.',
    paletteHint: { primary: '#1A001A', accent: '#FF00FF' },
    addonBiases: ['roof_antenna', 'fire_dept_ladder', 'monster_truck_tires'],
    ambientLuaBlock: (ctx) => `
do
${bodyTreatmentLua({ material: 'ForceField', glowColor: hexToRgbLua(ctx.accentHex), bodyOriginalHexEnv: ctx.primaryHex })}
-- Cursed: invert colours on every other body part for asymmetry
local i = 0
for _, d in ipairs(vehicleModel:GetDescendants()) do
  if d:IsA("BasePart") and d.Material == Enum.Material.ForceField then
    i = i + 1
    if i % 2 == 0 then
      local c = d.Color
      d.Color = Color3.new(1 - c.R, 1 - c.G, 1 - c.B)
    end
  end
end
end`.trim(),
  },

  luxury: {
    id: 'luxury',
    label: 'Luxury',
    description: 'Polished metallic body, deep saturated jewel tones.',
    paletteHint: { primary: '#1A1A6E', accent: '#D4AF37' },
    addonBiases: ['rear_spoiler_low', 'exhaust_dual'],
    ambientLuaBlock: (ctx) => `
do
${bodyTreatmentLua({ material: 'Metal', bodyOriginalHexEnv: ctx.primaryHex })}
end`.trim(),
  },

  retro: {
    id: 'retro',
    label: 'Retro',
    description: '80s synthwave: pastel pink + teal + chrome grill.',
    paletteHint: { primary: '#FFA9DA', accent: '#33D9FF' },
    addonBiases: ['rear_spoiler_low', 'racing_stripe'],
    ambientLuaBlock: (ctx) => `
do
${bodyTreatmentLua({ material: 'Plastic', glowColor: hexToRgbLua(ctx.accentHex), bodyOriginalHexEnv: ctx.primaryHex })}
end`.trim(),
  },
} as Record<VehicleStyleId, VehicleStylePack>;

/** Compose the ambient-style Lua block for the chosen style + colors. */
export function buildStyleAmbientLuaBlock(style: VehicleStyleId, ctx: { primaryHex: string; accentHex: string }): string {
  const pack = VEHICLE_STYLES[style];
  if (!pack) return '';
  const body = pack.ambientLuaBlock(ctx);
  if (!body || body.trim().length === 0) return '';
  return `-- Style pack: ${pack.label} (session 387 round 3)\n${body}`;
}

/** Returns the AI-router-friendly addon bias for a style. */
export function biasedAddonsForStyle(style: VehicleStyleId): ReadonlyArray<VehicleAddonId> {
  return VEHICLE_STYLES[style]?.addonBiases ?? [];
}

/** Style palette hint — used by builder when the AI returned neutral defaults
 *  and we want the style to imprint clearly. */
export function stylePaletteHint(style: VehicleStyleId): { primary: string; accent: string } {
  return VEHICLE_STYLES[style]?.paletteHint ?? { primary: '#E03A2E', accent: '#1A1A1A' };
}
