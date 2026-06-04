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
    assets: [112586636995159, 72466520546640, 84968460904245, 122979917244614, 129736155547573, 107158060686382, 131938063150331, 108399116162473, 117702698985688, 101873079352198],
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
  const target = pl.target;
  const pad = target;
  const half = (target / 2 + 1).toFixed(1);
  return `
-- ===== REAL CATALOG THEME ASSETS (keyword-matched, InsertService, scaled) =====
do
    local _af = Instance.new("Folder"); _af.Name = "ThemeAssets"; _af.Parent = workspace
    local _ip = game:GetService("InsertService")
    local function _scaleTo(m, t)
        local ok, _cf, sz = pcall(function() return m:GetBoundingBox() end)
        if ok and sz then local d = math.max(sz.X, sz.Y, sz.Z); if d > 0.1 then pcall(function() m:ScaleTo(t / d) end) end end
    end
    local function _insert(id, cf, t)
        task.spawn(function()
            local ok, m = pcall(function() return _ip:LoadAsset(id) end)
            if not ok or typeof(m) ~= "Instance" then return end
            for _, d in ipairs(m:GetDescendants()) do if d:IsA("LuaSourceContainer") then pcall(function() d:Destroy() end) end end
            if not m:FindFirstChildWhichIsA("BasePart", true) then pcall(function() m:Destroy() end); return end
            if not m.PrimaryPart then local bp = m:FindFirstChildWhichIsA("BasePart", true); if bp then m.PrimaryPart = bp end end
            for _, d in ipairs(m:GetDescendants()) do if d:IsA("BasePart") then d.Anchored = true; d.CanCollide = false end end
            _scaleTo(m, t)
            pcall(function() m:PivotTo(cf) end)
            m.Parent = _af
        end)
    end
    local function _stand(name, size, pos)
        local p = Instance.new("Part"); p.Name = name; p.Size = size; p.Position = pos; p.Anchored = true; p.CanCollide = false
        p.Color = Color3.fromRGB(56, 56, 68); p.Material = Enum.Material.SmoothPlastic; p.Parent = _af; return p
    end
    local _ids = {${ids.join(', ')}}
    local _pts = ${ptsLua}
    for i = 1, math.min(#_ids, #_pts) do
        local p = _pts[i]
        _stand("ThemeStand_" .. i, Vector3.new(${pad}, 2, ${pad}), p - Vector3.new(0, ${half}, 0))
        _insert(_ids[i], CFrame.new(p), ${target})
    end
end`;
}
