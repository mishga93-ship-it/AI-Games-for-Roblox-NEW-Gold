// Session 387 R10 — Style Packs polished (decals/lights/trails/particles).
//
// Old approach (R3): swap entire body Material to Neon/ForceField/Wood.
// Result: machines looked like cheap shader spam, not "Roblox premium".
//
// New approach: accent through:
//   - PointLight glow ambience
//   - Trail behind chassis
//   - ParticleEmitter ambient sparkles/exhaust
//   - SurfaceGui logo decals on small body panels
//   - Subtle accent retint for small parts only (no whole-body recolor)
//
// Material swaps are kept ONLY when stylistically essential (cyberpunk Neon
// trim, sigma matte trim), and applied to ≤ 4 small parts, not the whole body.

import type { VehicleAddonId, VehicleStyleId } from './vehicleModular.types.js';

export interface VehicleStylePack {
  id: VehicleStyleId;
  label: string;
  description: string;
  paletteHint: { primary: string; accent: string };
  addonBiases: ReadonlyArray<VehicleAddonId>;
  ambientLuaBlock: (ctx: { primaryHex: string; accentHex: string }) => string;
}

const hexToRgbLua = (hex: string): string => {
  const h = hex.replace('#', '');
  return `Color3.fromRGB(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`;
};

/** Gentle accent helper — attach a colored ambient PointLight to the
 *  chassis center. No Material changes, no body recolor. */
const ambientGlowLua = (colorLua: string, brightness = 2, range = 18) => `
local cf, _ = vehicleModel:GetBoundingBox()
local glow = Instance.new("Part")
glow.Name = "StyleAmbientGlow"
glow.Size = Vector3.new(0.3, 0.3, 0.3)
glow.Transparency = 1; glow.CanCollide = false; glow.Anchored = false; glow.Massless = true
glow.CFrame = cf
glow.Parent = vehicleModel
local pl = Instance.new("PointLight", glow)
pl.Color = ${colorLua}; pl.Brightness = ${brightness}; pl.Range = ${range}
local seat = vehicleModel:FindFirstChildWhichIsA("VehicleSeat", true)
if seat then
  local w = Instance.new("WeldConstraint"); w.Part0 = glow; w.Part1 = seat; w.Parent = glow
end
`.trim();

/** Chassis trail — colored streak behind the rear of the vehicle. */
const trailLua = (colorLua: string, lifetime = 0.7, name = 'StyleTrail') => `
local cf, size = vehicleModel:GetBoundingBox()
local seat = vehicleModel:FindFirstChildWhichIsA("VehicleSeat", true)
if seat then
  local trailHost = Instance.new("Part")
  trailHost.Name = "${name}Host"
  trailHost.Size = Vector3.new(0.2, 0.2, 0.2)
  trailHost.Transparency = 1; trailHost.CanCollide = false; trailHost.Anchored = false; trailHost.Massless = true
  trailHost.CFrame = seat.CFrame
  trailHost.Parent = vehicleModel
  local w = Instance.new("WeldConstraint"); w.Part0 = trailHost; w.Part1 = seat; w.Parent = trailHost
  local att0 = Instance.new("Attachment", trailHost); att0.Position = Vector3.new(-size.X * 0.35, -size.Y * 0.3, size.Z * 0.45)
  local att1 = Instance.new("Attachment", trailHost); att1.Position = Vector3.new( size.X * 0.35, -size.Y * 0.3, size.Z * 0.45)
  local trail = Instance.new("Trail", trailHost)
  trail.Attachment0 = att0; trail.Attachment1 = att1
  trail.Color = ColorSequence.new(${colorLua})
  trail.Lifetime = ${lifetime}; trail.MinLength = 0.5
  trail.LightEmission = 0.8; trail.LightInfluence = 0
  trail.Transparency = NumberSequence.new({
    NumberSequenceKeypoint.new(0, 0.15),
    NumberSequenceKeypoint.new(1, 1),
  })
end
`.trim();

/** Continuous ambient particle emitter from a roof point. */
const ambientParticleLua = (texture: string, colorLua: string, rate = 6, lifetime = 1.5, size = 0.6) => `
local seat = vehicleModel:FindFirstChildWhichIsA("VehicleSeat", true)
if seat then
  local att = Instance.new("Attachment", seat)
  att.Name = "StyleAmbientFXAtt"
  att.Position = Vector3.new(0, 1.2, 0)
  local p = Instance.new("ParticleEmitter", att)
  p.Name = "StyleAmbientFX"
  p.Color = ColorSequence.new(${colorLua})
  p.Texture = "${texture}"
  p.Rate = ${rate}; p.Lifetime = NumberRange.new(${lifetime * 0.7}, ${lifetime * 1.3})
  p.Size = NumberSequence.new(${size})
  p.Speed = NumberRange.new(1, 3); p.SpreadAngle = Vector2.new(180, 180)
  p.LightEmission = 0.6; p.LightInfluence = 0
  p.Transparency = NumberSequence.new({
    NumberSequenceKeypoint.new(0, 0.25),
    NumberSequenceKeypoint.new(1, 1),
  })
end
`.trim();

/** Tint ONLY trim parts (small accent panels) — preserves overall body
 *  color the user picked. Identifies parts by Material=Plastic+small size. */
const trimAccentLua = (colorLua: string, maxParts = 6) => `
local n = 0
for _, d in ipairs(vehicleModel:GetDescendants()) do
  if n >= ${maxParts} then break end
  if d:IsA("BasePart") and d.Material == Enum.Material.Plastic then
    local v = d.Size.X * d.Size.Y * d.Size.Z
    if v > 0.05 and v < 1.2 then
      d.Color = ${colorLua}
      n = n + 1
    end
  end
end
`.trim();

export const VEHICLE_STYLES: Record<VehicleStyleId, VehicleStylePack> = {
  default: {
    id: 'default', label: 'Default',
    description: 'Clean stock Roblox look. No extra effects.',
    paletteHint: { primary: '#E03A2E', accent: '#1A1A1A' },
    addonBiases: [],
    ambientLuaBlock: () => '',
  },

  cyberpunk: {
    id: 'cyberpunk', label: 'Cyberpunk',
    description: 'Neon glow trail + magenta/cyan ambient light. Night City vibe.',
    paletteHint: { primary: '#9C27B0', accent: '#00FFFF' },
    addonBiases: ['underglow', 'rear_spoiler_high', 'exhaust_dual'],
    ambientLuaBlock: (ctx) => `
do
${ambientGlowLua(hexToRgbLua(ctx.accentHex), 2.5, 22)}
${trailLua(hexToRgbLua(ctx.accentHex), 0.8, 'CyberTrail')}
${trimAccentLua(hexToRgbLua(ctx.accentHex), 4)}
end`.trim(),
  },

  sigma: {
    id: 'sigma', label: 'Sigma',
    description: 'Subtle gold trim retint + warm ambient. Minimalist luxury.',
    paletteHint: { primary: '#0A0A0A', accent: '#C9A227' },
    addonBiases: ['exhaust_dual', 'rear_spoiler_low'],
    ambientLuaBlock: (ctx) => `
do
${ambientGlowLua(hexToRgbLua(ctx.accentHex), 1.5, 14)}
${trimAccentLua(hexToRgbLua(ctx.accentHex), 6)}
end`.trim(),
  },

  military: {
    id: 'military', label: 'Military',
    description: 'Desaturate accent parts to olive. No body material swap.',
    paletteHint: { primary: '#4A5D3A', accent: '#3A2E1F' },
    addonBiases: ['roof_antenna', 'monster_truck_tires', 'roof_rack'],
    ambientLuaBlock: () => `
do
  -- Olive-bias trim parts (no neon ambient — military = matte)
  local n = 0
  for _, d in ipairs(vehicleModel:GetDescendants()) do
    if n >= 6 then break end
    if d:IsA("BasePart") and d.Material == Enum.Material.Plastic then
      local v = d.Size.X * d.Size.Y * d.Size.Z
      if v > 0.05 and v < 1.5 then
        local c = d.Color
        local max = math.max(c.R, c.G, c.B)
        d.Color = Color3.new(
          (c.R * 0.4 + 0.29) * (max + 0.5) * 0.6,
          (c.G * 0.4 + 0.36) * (max + 0.5) * 0.6,
          (c.B * 0.4 + 0.23) * (max + 0.5) * 0.6
        )
        n = n + 1
      end
    end
  end
end`.trim(),
  },

  apocalypse: {
    id: 'apocalypse', label: 'Apocalypse',
    description: 'Rust patches on roof + slow engine smoke from rear. No body swap.',
    paletteHint: { primary: '#5B3A1E', accent: '#9B5D34' },
    addonBiases: ['monster_truck_tires', 'roof_rack', 'roof_antenna', 'exhaust_dual'],
    ambientLuaBlock: () => `
do
  local cf, size = vehicleModel:GetBoundingBox()
  local seat = vehicleModel:FindFirstChildWhichIsA("VehicleSeat", true)
  if seat then
    -- 6 rust patches on roof
    for i = 1, 6 do
      local rust = Instance.new("Part")
      rust.Name = "RustPatch" .. i
      rust.Size = Vector3.new(0.4 + math.random() * 0.5, 0.05, 0.4 + math.random() * 0.5)
      rust.Color = Color3.fromRGB(110 + math.random(0, 40), 55 + math.random(0, 30), 25)
      rust.Material = Enum.Material.Concrete
      rust.Anchored = false; rust.CanCollide = false; rust.Massless = true
      local sx = (math.random() - 0.5) * size.X * 0.65
      local sz = (math.random() - 0.5) * size.Z * 0.65
      rust.CFrame = cf * CFrame.new(sx, size.Y / 2 + 0.03, sz)
      rust.Parent = vehicleModel
      local w = Instance.new("WeldConstraint"); w.Part0 = rust; w.Part1 = seat; w.Parent = rust
    end
    -- engine smoke from rear
    local att = Instance.new("Attachment", seat)
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
    id: 'anime', label: 'Anime',
    description: 'Bright primary glow + ambient pink sparkles + trail.',
    paletteHint: { primary: '#FF4FB5', accent: '#42E0FF' },
    addonBiases: ['racing_stripe', 'underglow', 'rear_spoiler_high'],
    ambientLuaBlock: (ctx) => `
do
${ambientGlowLua(hexToRgbLua(ctx.primaryHex), 3, 24)}
${ambientParticleLua('rbxasset://textures/particles/sparkles_main.dds', hexToRgbLua(ctx.accentHex), 8, 1.2, 0.4)}
${trailLua(hexToRgbLua(ctx.primaryHex), 0.6, 'AnimeTrail')}
end`.trim(),
  },

  cursed: {
    id: 'cursed', label: 'Cursed',
    description: 'Magenta glow + erratic flickering sparkles. Memey.',
    paletteHint: { primary: '#1A001A', accent: '#FF00FF' },
    addonBiases: ['roof_antenna', 'fire_dept_ladder', 'monster_truck_tires'],
    ambientLuaBlock: (ctx) => `
do
${ambientGlowLua(hexToRgbLua(ctx.accentHex), 2.5, 20)}
${ambientParticleLua('rbxasset://textures/particles/sparkles_main.dds', hexToRgbLua(ctx.accentHex), 12, 0.8, 0.5)}
-- Cursed: flicker the ambient glow randomly
task.spawn(function()
  local glow = vehicleModel:FindFirstChild("StyleAmbientGlow", true)
  if not glow then return end
  local pl = glow:FindFirstChildWhichIsA("PointLight")
  if not pl then return end
  while glow.Parent do
    task.wait(0.1 + math.random() * 0.3)
    pl.Brightness = math.random() < 0.25 and 0 or (1.5 + math.random() * 2)
  end
end)
end`.trim(),
  },

  luxury: {
    id: 'luxury', label: 'Luxury',
    description: 'Warm gold ambient + subtle trim retint. Polished.',
    paletteHint: { primary: '#1A1A6E', accent: '#D4AF37' },
    addonBiases: ['rear_spoiler_low', 'exhaust_dual'],
    ambientLuaBlock: (ctx) => `
do
${ambientGlowLua(hexToRgbLua(ctx.accentHex), 1.8, 16)}
${trimAccentLua(hexToRgbLua(ctx.accentHex), 5)}
end`.trim(),
  },

  retro: {
    id: 'retro', label: 'Retro',
    description: 'Pastel ambient + dual-tone trail. 80s synthwave.',
    paletteHint: { primary: '#FFA9DA', accent: '#33D9FF' },
    addonBiases: ['rear_spoiler_low', 'racing_stripe'],
    ambientLuaBlock: (ctx) => `
do
${ambientGlowLua(hexToRgbLua(ctx.accentHex), 2.2, 18)}
${trailLua(hexToRgbLua(ctx.accentHex), 0.7, 'RetroTrail')}
${trimAccentLua(hexToRgbLua(ctx.primaryHex), 3)}
end`.trim(),
  },
};

export function buildStyleAmbientLuaBlock(style: VehicleStyleId, ctx: { primaryHex: string; accentHex: string }): string {
  const pack = VEHICLE_STYLES[style];
  if (!pack) return '';
  const body = pack.ambientLuaBlock(ctx);
  if (!body || body.trim().length === 0) return '';
  return `-- Style pack: ${pack.label} (session 387 R10 — gentle accents)\n${body}`;
}

export function biasedAddonsForStyle(style: VehicleStyleId): ReadonlyArray<VehicleAddonId> {
  return VEHICLE_STYLES[style]?.addonBiases ?? [];
}

export function stylePaletteHint(style: VehicleStyleId): { primary: string; accent: string } {
  return VEHICLE_STYLES[style]?.paletteHint ?? { primary: '#E03A2E', accent: '#1A1A1A' };
}
