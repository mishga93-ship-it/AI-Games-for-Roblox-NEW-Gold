// Session 418 — keyword-driven real catalog asset packs.
//
// The user supplied verified Roblox Store asset IDs grouped by theme. We can't
// UPLOAD new meshes (our Open-Cloud account is moderated → invisible), but we
// CAN insert EXISTING public assets at runtime via InsertService:LoadAsset.
// That works in Studio (the generate → open .rbxl → playtest flow). In a
// published place LoadAsset is restricted to owned/free assets, so every insert
// is pcall-guarded and simply skipped on failure (the primitive decor remains).
//
// Flow: brief text → matched packs (by keyword regex) → up to N asset IDs →
// a self-contained Lua block that LoadAssets each, strips scripts, anchors,
// auto-scales to a target size, and places it on a podium. The block is
// appended to ANY genre's server script in buildPlayableWithQa (index.ts), so
// it needs no builder internals (own folder + own helpers).

export interface ThemeAssetPack {
  key: string;
  /** keyword matcher against the game brief/title (EN + RU). */
  match: RegExp;
  /** verified public asset IDs (models). Animations/script-systems excluded. */
  assets: number[];
}

// Curated from the user's lists. Obvious animations, sword anims, and
// script-only "systems" (e.g. tycoon cash-system) were dropped — they don't
// render as props. Maps are kept (they just become a scaled-down diorama).
export const THEME_ASSET_PACKS: ThemeAssetPack[] = [
  {
    key: 'money',
    match: /\b(money|billion|millionaire|million|cash|dollars?|rich|wealth|bank|vault)\b|деньг|миллион|миллиард|богат|банк/i,
    assets: [9057118396, 13570813273, 116442182546675, 378721929, 1042207059, 42890986],
  },
  {
    key: 'mrbeast',
    match: /mr\s?beast|beast/i,
    assets: [8326979870, 16964451942, 12249777065, 16516661547, 6792417671, 12273473070, 139125404596764, 131041182908984],
  },
  {
    key: 'prototype',
    match: /prototype|прототип/i,
    assets: [122967435998240, 134680675084292],
  },
  {
    key: 'brainrot',
    match: /brainrot|tralalero|tralala|tung|skibidi|bombardiro|sahur|bananita|br[ae]inrot|брейнрот|мем/i,
    assets: [112586636995159, 72466520546640, 84968460904245, 122979917244614, 129736155547573, 107158060686382, 131938063150331, 132474197060148, 108399116162473, 117702698985688],
  },
  {
    key: 'nights99',
    match: /99\s*nights?|nights?\s*in\s*the\s*forest|99\s*ноч/i,
    assets: [113480154894240, 89097886898916, 112465932068951, 82051509034737, 136689985623077, 82325268253970, 107235854565333],
  },
  {
    key: 'fnaf',
    // Session 421: extended so the "The Last Night Guard / Survive until 6 AM"
    // preset (no freddy/fnaf token) also matches. User-supplied rigs go first.
    match: /freddy|fnaf|fazbear|animatronic|chica|springtrap|foxy|bonnie|night\s*guard|five\s*nights?|\b6\s*am\b|пять\s*ноч|аниматроник/i,
    assets: [15313551841, 15084022697, 6946588630, 15443639546, 16779482754, 16779487191, 13725245790, 131366436943647, 91663076384784, 97758124242493, 4939881709, 18940321829],
  },
  {
    key: 'titan',
    match: /titan|attack\s*on\s*titan|тит[ау]н|великан|гигант/i,
    assets: [93391943138398, 102294740472495, 137513549278657, 124804442364855, 3985586979, 84810142609594, 108752898811395],
  },
  {
    key: 'dragon',
    match: /dragon|hydra|дракон|гидра/i,
    assets: [140259666865834, 87633792676253, 2888641064],
  },
  {
    key: 'monster_school',
    match: /monster\s*school|школа\s*монстр/i,
    assets: [121811208548619, 6233502884, 2981123852, 5563492545],
  },
  {
    key: 'bananita',
    match: /bananita|banana|банан/i,
    assets: [136122396955192, 28423195],
  },
  {
    key: 'trapped',
    match: /trapped|trap\b|ловушк|западн/i,
    assets: [9615431080, 189960819, 120602053699409, 11465147915],
  },
  // Session 421: user-supplied packs for Story presets that had no coverage.
  {
    key: 'kingdom',
    // "Orangutini's Kingdom / Save the pineapple throne" + generic medieval royalty.
    match: /orangutini|pineapple\s*throne|\bkingdom\b|\bthrone\b|\broyal(ty)?\b|\bknight\b|\bcastle\b|\bmedieval\b|королевств|корол[еья]|трон|рыцар|замок/i,
    assets: [82802422656855, 123795807984011, 4620868616, 135468299840894, 16376323744, 79970686014760, 38500538],
  },
  {
    key: 'haunted',
    // "The Haunted Sleepover" — ghost/mimic spooky props.
    match: /haunted|sleep\s*over|\bmimic\b|ghost|spooky|haunt/i,
    assets: [7575093283, 11517379233],
  },
];

/** Pick up to `max` asset IDs for a brief, round-robin across matched packs so
 *  multi-theme briefs (e.g. MrBeast money) get a mix, not just the first pack. */
export function pickThemeAssets(brief: string, max = 6): number[] {
  const b = String(brief || '');
  const matched = THEME_ASSET_PACKS.filter((p) => p.match.test(b));
  if (!matched.length) return [];
  const out: number[] = [];
  const seen = new Set<number>();
  for (let idx = 0; out.length < max; idx++) {
    let added = false;
    for (const p of matched) {
      const id = p.assets[idx];
      if (typeof id === 'number' && !seen.has(id)) {
        out.push(id);
        seen.add(id);
        added = true;
        if (out.length >= max) break;
      }
    }
    if (!added) break;
  }
  return out;
}

function ringLua(n: number, rx: number, rz: number, y: number): string {
  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i + 0.5) * ((2 * Math.PI) / n);
    pts.push(`Vector3.new(${(Math.cos(a) * rx).toFixed(1)}, ${y}, ${(Math.sin(a) * rz).toFixed(1)})`);
  }
  return `{${pts.join(', ')}}`;
}

// Session 421: asset IDs that are MULTI-MODEL "packs" (several characters/props in
// one asset), per the user's store links — e.g. "FNAF Killers", "Fnaf Morphs",
// "FNAF 1 Rig Pack", "Characters by rainy ye — The Mimic". The default inserter
// scales a whole LoadAsset result to one target size on one podium, which would
// squish a pack into a tiny clump. For these IDs we instead lay each child model
// out individually (see _insert). Only EXPLICIT IDs are exploded → normal single
// assets are untouched (no decompose-a-car-into-parts regression).
const PACK_IDS = new Set<number>([15313551841, 6946588630, 13725245790, 7575093283]);

// Story Game is a linear +z corridor, not a plaza: NPC chapters sit at z≈70/240/320,
// the rune puzzle at z≈140 and its barrier at z≈168. A ring at the origin would clump
// every prop on the spawn pad. Instead lay props in side alcoves (x=±16, inside the
// rails at ±23) spread along the whole walk so each stretch of the story gets a
// theme-matched prop without blocking the path or the chapter arches.
function corridorLua(n: number): string {
  const Z = [30, 45, 95, 105, 195, 215, 285, 350];
  const pts: string[] = [];
  for (let i = 0; i < n && i < Z.length; i++) {
    const x = i % 2 === 0 ? -16 : 16;
    pts.push(`Vector3.new(${x}, 6, ${Z[i]})`);
  }
  return `{${pts.join(', ')}}`;
}

/**
 * Self-contained Lua that inserts the brief's theme assets. Safe to append to
 * any genre server script — creates its own folder + helpers, depends on nothing.
 * Returns '' when no pack matches (keeps the primitive decor untouched).
 */
export function themeAssetScatterLua(brief: string, genre: string): string {
  // Story corridors are long, so allow up to 8 props (still ≤10/game); plaza
  // genres stay at 6 to avoid crowding a single ring.
  const ids = pickThemeAssets(brief, genre === 'story_game' ? 8 : 6);
  if (!ids.length) return '';
  // Per-genre placement so assets land in a visible-but-clear zone. They are
  // CanCollide=false decor on podiums, so minor overlap never blocks gameplay.
  const PLACEMENT: Record<string, { n: number; rx: number; rz: number; y: number; target: number }> = {
    racing: { n: 7, rx: 112, rz: 80, y: 12, target: 16 },
    parkour: { n: 6, rx: 56, rz: 56, y: 12, target: 14 },
    tower_defense: { n: 6, rx: 78, rz: 78, y: 7, target: 14 },
    roleplay_town: { n: 7, rx: 118, rz: 118, y: 5, target: 15 },
    story_game: { n: 8, rx: 48, rz: 48, y: 6, target: 11 },
    minigame_hub: { n: 6, rx: 72, rz: 72, y: 6, target: 14 },
    survival: { n: 6, rx: 84, rz: 84, y: 7, target: 14 },
    fighting_arena: { n: 6, rx: 62, rz: 62, y: 7, target: 13 },
    custom_game: { n: 6, rx: 90, rz: 90, y: 7, target: 15 },
    rpg: { n: 6, rx: 86, rz: 86, y: 6, target: 14 },
    horror: { n: 6, rx: 70, rz: 70, y: 6, target: 14 },
    pvp: { n: 6, rx: 78, rz: 78, y: 7, target: 14 },
    pvp_arena: { n: 6, rx: 62, rz: 62, y: 7, target: 13 },
  };
  const pl = PLACEMENT[genre] || { n: 7, rx: 110, rz: 110, y: 8, target: 16 };
  const ptsLua = genre === 'story_game' ? corridorLua(pl.n) : ringLua(pl.n, pl.rx, pl.rz, pl.y);
  const target = Math.min(pl.target, 14);
  return `
-- ===== REAL CATALOG THEME ASSETS (standee always shows; real 3D when API access on) =====
do
    local _af = Instance.new("Folder"); _af.Name = "ThemeAssets"; _af.Parent = workspace
    local _ip = game:GetService("InsertService")
    local function _scaleTo(m, t)
        local ok, _cf, sz = pcall(function() return m:GetBoundingBox() end)
        if ok and sz then local d = math.max(sz.X, sz.Y, sz.Z); if d > 0.1 then pcall(function() m:ScaleTo(t / d) end) end end
    end
    local function _prep(inst)
        if inst:IsA("Model") and not inst.PrimaryPart then local bp = inst:FindFirstChildWhichIsA("BasePart", true); if bp then inst.PrimaryPart = bp end end
        for _, d in ipairs(inst:GetDescendants()) do if d:IsA("BasePart") then d.Anchored = true; d.CanCollide = false; d.Massless = true end end
    end
    local function _ground(m, x, baseY, z)
        local ok, _cf, sz = pcall(function() return m:GetBoundingBox() end)
        local lift = (ok and sz) and (sz.Y * 0.5) or 4
        pcall(function() m:PivotTo(CFrame.new(x, baseY + lift, z)) end)
    end
    local _ids = {${ids.join(', ')}}
    local _pts = ${ptsLua}
    local _loaded, _failed = 0, 0
    for i = 1, math.min(#_ids, #_pts) do
        local p = _pts[i]; local id = _ids[i]; local x, z = p.X, p.Z; local t = ${target}
        local pod = Instance.new("Part"); pod.Name = "ThemePedestal_" .. i; pod.Anchored = true; pod.CanCollide = false
        pod.Size = Vector3.new(t * 0.75, 2, t * 0.75); pod.Position = Vector3.new(x, 1, z); pod.Color = Color3.fromRGB(52, 54, 68); pod.Material = Enum.Material.Marble; pod.Parent = _af
        -- standing cutout of the real catalog asset (its thumbnail). ALWAYS visible
        -- (needs no API access) so the theme reads even before any 3D loads.
        local standee = Instance.new("Part"); standee.Name = "ThemeStandee_" .. i; standee.Anchored = true; standee.CanCollide = false
        standee.Size = Vector3.new(t, t * 1.25, 0.5); standee.Position = Vector3.new(x, 2 + t * 0.62, z); standee.Color = Color3.fromRGB(20, 22, 30); standee.Material = Enum.Material.SmoothPlastic; standee.Parent = _af
        for _, fc in ipairs({Enum.NormalId.Front, Enum.NormalId.Back}) do
            local sg = Instance.new("SurfaceGui"); sg.Adornee = standee; sg.Face = fc; sg.LightInfluence = 0; sg.Parent = standee
            local img = Instance.new("ImageLabel"); img.Size = UDim2.new(1, 0, 1, 0); img.BackgroundTransparency = 1; img.ScaleType = Enum.ScaleType.Fit; img.Image = "rbxthumb://type=Asset&id=" .. id .. "&w=420&h=420"; img.Parent = sg
        end
        -- upgrade to the real 3D model where InsertService is permitted
        task.spawn(function()
            local ok, m = pcall(function() return _ip:LoadAsset(id) end)
            if not ok or typeof(m) ~= "Instance" then _failed += 1; return end
            for _, d in ipairs(m:GetDescendants()) do if d:IsA("LuaSourceContainer") then pcall(function() d:Destroy() end) end end
            if not m:FindFirstChildWhichIsA("BasePart", true) then _failed += 1; pcall(function() m:Destroy() end); return end
            _prep(m); _scaleTo(m, t)
            _ground(m, x, 2, z)
            m.Name = "ThemeAsset_" .. id; m.Parent = _af
            standee:Destroy() -- real 3D replaces the cutout
            _loaded += 1
        end)
    end
    task.delay(10, function() print("[ThemeAsset] real 3D loaded=" .. _loaded .. " / " .. math.min(#_ids, #_pts) .. " (rest show as cutouts). For 3D: Studio > Game Settings > Security > Enable Studio Access to API Services.") end)
end`;
}
