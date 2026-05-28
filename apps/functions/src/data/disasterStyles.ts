// disasterStyles.ts — Voice-Controlled Survival Disaster Spawner presets
// (session 387). Mirrors Voice-to-Aura's safety pattern but for disaster
// SERVER SCRIPTS that spawn entities on a timer.
//
// CRITICAL SAFETY: disaster Lua spawns things. To prevent lag-bomb scripts:
//   • Population cap (MAX_ALIVE = 30) — script tracks spawned instances,
//     destroys oldest before spawning new.
//   • Auto-cleanup TTL (default 60s) — each spawn self-destructs.
//   • Bounded loop (task.wait minimum 0.5s).
//   • No HttpService / RemoteEvent abuse / loadstring (same as aura).
//   • Only built-in Instance.new() shapes (Part/Model/MeshPart) — no
//     game.ServerStorage references that may not exist.

export type DisasterModeId = 'funny' | 'horror' | 'meme' | 'sigma';

export type DisasterChaosLevel = 'balanced' | 'chaotic' | 'impossible';
export type DisasterSize       = 'small' | 'normal' | 'massive';
export type DisasterFrequency  = 'rare' | 'normal' | 'constant';

export interface DisasterMode {
  id: DisasterModeId;
  titleEN: string;
  titleRU: string;
  emoji: string;
  accentHex: string;
  imageStyle: string;
  /** Hint for the LLM about what KIND of disaster fits this mode. */
  themeHint: string;
}

export const DISASTER_MODES: Record<DisasterModeId, DisasterMode> = {
  funny: {
    id: 'funny',
    titleEN: 'Funny',
    titleRU: 'Funny',
    emoji: '😂',
    accentHex: 'FFD93D',
    imageStyle: 'absurd cartoon disaster scene with comically oversized props, bright primary colors, Saturday-morning chaos',
    themeHint: 'Light absurd comedy — giant rubber ducks, exploding toilets, flying refrigerators. Cartoon physics.',
  },
  horror: {
    id: 'horror',
    titleEN: 'Horror',
    titleRU: 'Horror',
    emoji: '💀',
    accentHex: '8B0000',
    imageStyle: 'stylized cartoon-horror disaster — dark moody atmosphere, dramatic lighting, edge of unsettling but NOT real gore (Roblox-friendly cartoon-spooky only)',
    themeHint: 'Cartoon-spooky — cursed shadows, ghost waves, dark fog. Family-friendly meme-horror, NOT real horror.',
  },
  meme: {
    id: 'meme',
    titleEN: 'Brainrot',
    titleRU: 'Brainrot',
    emoji: '🧠',
    accentHex: '39FF14',
    imageStyle: 'Steal-a-Brainrot aesthetic — chaotic neon, absurd combinations (cat-bananas, shark-toilets), maximum visual noise',
    themeHint: 'Steal-a-Brainrot energy — random unrelated absurd creature spawns. Chaotic.',
  },
  sigma: {
    id: 'sigma',
    titleEN: 'Sigma Event',
    titleRU: 'Sigma Event',
    emoji: '🗿',
    accentHex: '1F2530',
    imageStyle: 'cold dramatic sigma-male disaster — suit-and-sunglasses bosses raining from the sky, gold chains, monochrome with gold accents',
    themeHint: 'Sigma Chads and Giga Bosses — stoic suited NPCs falling like meteors, gold chain rain.',
  },
};

export const CHAOS_GUIDANCE: Record<DisasterChaosLevel, string> = {
  balanced:   'Spawn 1-3 entities per event, 30-60s between events. Players can recover.',
  chaotic:    'Spawn 3-6 entities per event, 15-30s between events. Hectic but survivable.',
  impossible: 'Spawn 5-10 entities per event, 5-15s between events. Survival is barely possible. MAX_ALIVE cap absolutely enforced.',
};

export const SIZE_GUIDANCE: Record<DisasterSize, string> = {
  small:   'Spawn size 2-4 stud.',
  normal:  'Spawn size 5-10 stud.',
  massive: 'Spawn size 12-24 stud (player-dwarfing scale).',
};

export const FREQUENCY_GUIDANCE: Record<DisasterFrequency, string> = {
  rare:     'Event interval 60-120s. Suspenseful waiting.',
  normal:   'Event interval 30-60s. Steady tension.',
  constant: 'Event interval 8-20s. Non-stop chaos.',
};

export function isDisasterMode(v: unknown): v is DisasterModeId {
  return v === 'funny' || v === 'horror' || v === 'meme' || v === 'sigma';
}
export function parseDisasterChaos(v: unknown): DisasterChaosLevel {
  return v === 'balanced' || v === 'chaotic' || v === 'impossible' ? v : 'chaotic';
}
export function parseDisasterSize(v: unknown): DisasterSize {
  return v === 'small' || v === 'normal' || v === 'massive' ? v : 'normal';
}
export function parseDisasterFrequency(v: unknown): DisasterFrequency {
  return v === 'rare' || v === 'normal' || v === 'constant' ? v : 'normal';
}

export function listDisasterModes(): DisasterMode[] {
  return Object.values(DISASTER_MODES);
}

// ─── Prompt builders ────────────────────────────────────────────

export interface DisasterPromptInput {
  userPrompt: string;
  mode: DisasterModeId;
  chaos: DisasterChaosLevel;
  size: DisasterSize;
  frequency: DisasterFrequency;
  /** Optional event title from metadata pass (e.g. "Banana Rain Apocalypse").
   * When present, the Lua prompt requires spawn entities to LITERALLY match
   * the nouns in the title — otherwise the LLM picks generic "Brainrot
   * Approved" objects (ducks/toilets/fridges) that don't match the concept
   * art or the shareable title the user sees in the UI. */
  title?: string;
  /** Optional curated Roblox Marketplace asset bundle resolved from the
   * title/prompt by findDisasterBundle. When non-empty, the Lua emitter
   * spawns via AssetService:CreateMeshPartAsync per entry. */
  assetEntries?: Array<{
    name: string;
    assetId: number;
    /** Longest-edge target size in studs. The Lua emit scales the mesh
     * UNIFORMLY so the longest natural axis = preferredScale (preserves
     * aspect ratio — banana stays banana-shaped, not crushed into a cube). */
    preferredScale: number;
    /** Optional colour override (most callers leave undefined to keep
     * the baked PBR texture). */
    colorRGB?: [number, number, number];
    /** Inner Texture asset id, when the source .glb shipped a baked PBR
     * texture. The Lua emit wires SurfaceAppearance.ColorMap to it so the
     * MeshPart renders coloured. Without this, MeshPart shows white. */
    textureAssetId?: number;
    /** Natural bounding box of the mesh at upload time (studs). Lua uses
     * this to compute uniform scale instead of forcing a cubic Size. */
    naturalSize?: { x: number; y: number; z: number };
  }>;
  /** Lowercase object keyword extracted from title/prompt (banana, toilet,
   * duck, fridge, meteor, shark, moai, couch, pizza, crocodile, ...).
   * Drives branded-primitive composition when assetEntries is empty. */
  objectKeyword?: string;
}

export function buildDisasterImagePrompt(input: DisasterPromptInput, variation?: 'balanced' | 'extreme' | 'cursed'): string {
  const mode = DISASTER_MODES[input.mode];
  const userClause = input.userPrompt.trim()
    ? ` Concept: "${input.userPrompt.trim().slice(0, 200)}".`
    : '';
  const variationClause = variation === 'extreme'
    ? ' MAXIMUM CHAOS variant — screen-filling pandemonium.'
    : variation === 'cursed'
      ? ' CURSED variant — extra absurd meme energy.'
      : variation === 'balanced'
        ? ' BALANCED variant — readable composition with clear focal disaster.'
        : '';
  return [
    `A Roblox survival-game disaster scene in the "${mode.titleEN}" mode.${userClause}`,
    mode.imageStyle,
    CHAOS_GUIDANCE[input.chaos],
    SIZE_GUIDANCE[input.size],
    variationClause,
    'Top-down or 3/4 angle of a Roblox map with disaster currently happening — players running, entities falling/spawning, dramatic action moment.',
    'Stylized 3D cartoon render, R15 Roblox proportions, dramatic studio lighting.',
    'Family-friendly meme content only. NO real horror, NO gore, NO blood, NO weapons-of-war, NO text, NO logos.',
  ].join(' ');
}

/**
 * Anthropic prompt that generates a SAFE Roblox disaster Lua script.
 * Strict pool of allowed APIs, hard caps on population + lifetime.
 */
export function buildDisasterLuaPrompt(input: DisasterPromptInput): string {
  const mode = DISASTER_MODES[input.mode];
  const userClause = input.userPrompt.trim()
    ? `\nUser brief: "${input.userPrompt.trim().slice(0, 240)}"`
    : '';
  const titleClause = input.title && input.title.trim()
    ? `\nEvent title (shown to the user in the app): "${input.title.trim()}"\n→ THIS IS THE CONTRACT. The spawned objects MUST be literally what the title describes. If the title is "Banana Rain Apocalypse", you spawn yellow banana-shaped Parts. If it is "Giant Spider Invasion", you spawn spider-shaped Parts. NEVER ship a script with rubber ducks when the title says bananas — the user will see a mismatch between the concept art and the actual game.`
    : '';
  return [
    'You are a SAFE Roblox Lua disaster-spawner generator. Output ONLY a complete Lua script wrapped in ```lua ... ``` — no preamble.',
    '',
    `Generate a server Script that spawns a recurring disaster event on a Roblox survival map.`,
    `Mode: ${mode.titleEN}. Theme hint: ${mode.themeHint}`,
    `Chaos level: ${input.chaos}. ${CHAOS_GUIDANCE[input.chaos]}`,
    `Size: ${input.size}. ${SIZE_GUIDANCE[input.size]}`,
    `Frequency: ${input.frequency}. ${FREQUENCY_GUIDANCE[input.frequency]}${titleClause}${userClause}`,
    '',
    'STRICT RULES (the script will be deployed by a beginner — must be safe):',
    '1) Place the Script in ServerScriptService. Single file.',
    '2) Use ONLY: workspace, Instance.new (Part / MeshPart / WedgePart / CornerWedgePart / Folder / Model / Weld / WeldConstraint / PointLight / ParticleEmitter / Trail), CFrame, Vector3, Color3.fromRGB, BrickColor, BasePart.Touched, task.wait, task.spawn, table, math.random, Workspace:WaitForChild, game:GetService("Players"), Debris service for cleanup, RunService for tick.',
    '3) BANNED — never use: HttpService, MarketplaceService, MessagingService, DataStoreService, RemoteEvent, RemoteFunction, BindableEvent (for cross-script comm), loadstring, require by assetId, game:HttpGet, os.execute, exploit hooks.',
    '4) POPULATION CAP — track spawned instances in a local table. BEFORE spawning a new entity, if `#spawned >= 30`, DESTROY the oldest one. Hard cap MAX_ALIVE = 30.',
    '5) AUTO-CLEANUP — every spawned entity must have a Debris:AddItem(entity, lifetime) call with lifetime ≤ 90 seconds. For multi-Part entities, wrap them in a Model and call Debris:AddItem(model, lifetime) — that destroys all child Parts too.',
    '6) BOUNDED LOOP — main loop is `while true do … task.wait(intervalSeconds) end`. intervalSeconds must be between 5 and 20 (NOT 30-60 — players quit before they see anything). No `while true do … end` without a wait. No spawning more than 10 entities per tick.',
    '7) FIRST SPAWN IS IMMEDIATE — call the spawn function(s) ONCE before the main loop starts, AND/OR put the `task.wait` at the END of the loop body so iteration 1 spawns at t≈0. Players must see something within 3 seconds of pressing Play, otherwise it feels broken.',
    '8) SPAWN NEAR PLAYERS — for the spawn anchor, iterate `game:GetService("Players"):GetPlayers()` and use a random player\'s `Character.HumanoidRootPart.Position + Vector3.new(rx, 80, rz)` (rx/rz random in [-40,40]). If no players are connected, fall back to `Vector3.new(math.random(-50,50), 80, math.random(-50,50))`. Spawning at a fixed (0,100,0) misses players standing on the far side of the map.',
    '9) DIAGNOSTIC PRINTS — print `"[DisasterSpawner] running — first event in <N>s"` at script top, and `"[DisasterSpawner] spawning <type> @ <pos>"` on each spawn. The user reads the Output panel to confirm it loaded.',
    ...buildEntityShapeGuidance(input),
    '12) Add 3-5 inline comments in English explaining the disaster + spawn logic + cleanup (beginner-friendly).',
    '13) Keep total script ≤ 320 lines (the verbatim disaster-system block is ~220 lines; main loop adds ~30).',
    '14) NO outside imports.',
    '',
    'Output ONLY the ```lua code block. No prose.',
  ].join('\n');
}

// ─── Branded-entity shape guidance ───────────────────────────────
//
// Rules 10-11 of the Lua prompt — appended dynamically so the LLM gets
// concrete, on-topic geometry recipes for the named object instead of the
// previous "Entities are simple Roblox Parts" instruction (which produced
// yellow Balls regardless of what the title promised).
//
// Decision tree:
//   1. assetEntries non-empty  →  emit MeshPart-with-MeshId guidance
//   2. objectKeyword known     →  emit branded multi-Part recipe for it
//   3. otherwise              →  generic multi-Part recipe (still better
//                                than a monolithic Ball)

const BRANDED_SHAPES: Record<string, string> = {
  banana:
    'Banana = Model of 3 Parts welded together: (1) main body — yellow (255,224,40) Cylinder, Size (5,1.5,1.5), tilted CFrame.Angles(0, 0, math.rad(20)) so it curves; (2) tip stem — dark green (50,90,30) Block, Size (0.6,0.6,0.6), welded at one end; (3) brown spot — small (90,55,30) Block Size (0.4,0.4,0.4) randomly placed on body for texture. Material "Plastic".',
  toilet:
    'Toilet = Model of 4 Parts: (1) bowl — white SmoothPlastic Cylinder Size (4,2.5,4); (2) tank — white Block Size (3,3,1.5) welded behind+up; (3) seat — black SmoothPlastic Cylinder Size (4.2,0.4,4.2) welded on top of bowl; (4) flush lever — silver Metal Cylinder Size (0.4,0.4,0.4) welded to tank.',
  duck:
    'Duck = Model of 5 Parts: (1) body — yellow (255,220,0) Ball Size (3,2.5,4); (2) head — yellow Ball Size (1.8,1.8,1.8) welded forward+up; (3) beak — orange (255,140,0) Wedge Size (1,0.6,1.2) welded to head front; (4-5) two black (10,10,10) tiny Balls Size (0.3,0.3,0.3) welded to head as eyes. Material "Plastic".',
  fridge:
    'Fridge = Model of 4 Parts: (1) body — white (230,230,230) Metal Block Size (3.5,7,3); (2) door — white Block Size (3.5,4.5,0.3) welded on front; (3) handle — silver Metal Cylinder Size (0.3,0.3,1.5) welded to door; (4) bottom freezer line — grey Metal Block Size (3.5,0.15,3) welded across door at 60% height.',
  meteor:
    'Meteor = Model of 1 rough Ball + glow: (1) body — dark grey (60,60,60) Slate Ball Size (4,4,4) with Material "Slate" or "Rock"; (2) attached ParticleEmitter with bright orange fire colour, Rate 100, Lifetime NumberRange.new(0.4, 0.9), Speed NumberRange.new(8,15); (3) attached PointLight orange, Brightness 2, Range 12.',
  shark:
    'Shark = Model of 4 Parts: (1) body — grey (90,110,130) Block Size (1.8,1.6,6) (long along Z); (2) dorsal fin — same grey Wedge Size (0.4,1.5,1.2) welded on top; (3) tail fin — Wedge Size (0.5,2,1) welded at back; (4) tiny black (10,10,10) Ball Size (0.3,0.3,0.3) welded as eye on side.',
  moai:
    'Moai (Easter Island head) = Model of 3 Parts: (1) head — dark stone (90,90,90) Slate Block Size (3,5,2.5); (2) protruding brow ridge — same stone Block Size (3.1,0.6,2.6) welded across upper third; (3) heavy chin — same stone Block Size (3.1,1.2,2.6) welded on lower third sticking forward. Material "Slate", roughness via BrickColor.',
  couch:
    'Couch = Model of 5 Parts: (1) base — brown (90,55,30) SmoothPlastic Block Size (5,1.5,2.5); (2) seat cushion — beige (200,170,130) Block Size (4.8,0.6,2.4) welded on top; (3) backrest — brown Block Size (5,2.5,0.5) welded standing up at back; (4-5) two armrests — brown Block Size (0.5,1.8,2.5) welded at each side.',
  pizza:
    'Pizza slice = Model of 3 Parts: (1) crust — Wedge Size (0.4,4,3) tan (240,200,140) SmoothPlastic; (2) cheese top — yellow (250,210,90) Block Size (0.3,3.6,2.6) welded on top of wedge; (3-5) pepperoni spots — three small red (200,40,40) Cylinders Size (0.2,0.6,0.6) welded on cheese.',
  crocodile:
    'Crocodile = Model of 4 Parts: (1) body — green (60,130,60) SmoothPlastic Block Size (1.5,1.2,5); (2) head — green Block Size (1.4,1,2) welded forward; (3) tail — green Wedge Size (1.4,1,2) welded back; (4) jaw line — pink (200,80,80) thin Block Size (1.3,0.15,1.8) welded as mouth seam. Optional small white Block teeth (3-4 in a row, Size (0.15,0.3,0.15)).',
};

const GENERIC_MULTIPART = [
  'Compose each entity from 3-5 welded Parts so it reads as a recognisable object, not a single sphere/cube. Use WedgePart for slopes, Cylinder for rounded body sections, Block for boxy sections. Wrap children in a Model.',
  'Colour ALL Parts with the same theme palette so they read as one entity (e.g. two yellows + a black accent, NOT random rainbow Parts).',
  'Material variety helps: combine "Plastic" body + "SmoothPlastic" highlight + "Neon" glow accent.',
];

function buildEntityShapeGuidance(input: DisasterPromptInput): string[] {
  // Path 1 — Mesh asset ids resolved (either curated whitelist or freshly
  // generated by disasterMeshFactory on demand). Emit a MeshPart.MeshContent
  // spawn — Mesh assets are PUBLIC by default (unlike Model assets which
  // require "trust" per place), so this renders in any user's Studio drag-
  // drop flow without permission setup.
  //
  // User feedback session 385 round 8: «InsertService:LoadAsset → "Asset
  // is not trusted for this place"». MeshPart.MeshContent bypasses that
  // check entirely because Mesh AssetTypeId=4 is read-public.
  if (input.assetEntries && input.assetEntries.length > 0) {
    const first = input.assetEntries[0]!;
    const ids = input.assetEntries.slice(0, 6).map((e) => e.assetId);
    const idList = ids.join(', ');
    const textureIds = input.assetEntries.slice(0, 6).map((e) => e.textureAssetId ?? 0);
    const textureIdList = textureIds.join(', ');
    const preferredScale = first.preferredScale ?? 6;
    const color = first.colorRGB ?? [255, 220, 40];
    const colorTuple = color.join(',');
    // Tune AoE / warning / boss cadence by chaos so balanced is forgiving
    // and impossible is deadly. Numbers chosen so a casual room sees one
    // disaster wave every ~12-15 seconds with ~10-15 HP loss, an impossible
    // room sees waves every ~6-8s with ~25 HP and bosses every 3rd wave.
    const chaosTuning: Record<DisasterChaosLevel, { warn: number; aoe: number; dmgMin: number; dmgMax: number; bossEvery: number; peelTTL: number }> = {
      balanced:   { warn: 2.5, aoe: 7,  dmgMin: 6,  dmgMax: 12, bossEvery: 10, peelTTL: 15 },
      chaotic:    { warn: 1.5, aoe: 9,  dmgMin: 10, dmgMax: 20, bossEvery: 5,  peelTTL: 20 },
      impossible: { warn: 0.6, aoe: 12, dmgMin: 18, dmgMax: 30, bossEvery: 3,  peelTTL: 30 },
    };
    const tune = chaosTuning[input.chaos] ?? chaosTuning.chaotic;
    // ─────────────────────────────────────────────────────────────────────
    // BIG VERBATIM HELPER — keeps the LLM's main loop tiny + predictable.
    // Provides spawnWave(), and game systems: leaderstats, AoE damage,
    // particle splash, sound, trail, point light, pre-spawn warning marker,
    // banana-peel ground hazard, boss waves, difficulty ramp.
    // ─────────────────────────────────────────────────────────────────────
    const luaTemplate = [
      '```lua',
      `-- ===== DISASTER PACK CONFIG (auto-tuned for this generation) =====`,
      `local MESH_IDS       = { ${idList} }`,
      `local TEXTURE_IDS    = { ${textureIdList} }   -- 0 = no texture for that slot`,
      `local TARGET_LONGEST = ${preferredScale}`,
      `local KEYWORD_COLOR  = Color3.fromRGB(${colorTuple})`,
      `local AOE_RADIUS     = ${tune.aoe}`,
      `local AOE_DMG_MIN    = ${tune.dmgMin}`,
      `local AOE_DMG_MAX    = ${tune.dmgMax}`,
      `local WARNING_SECS   = ${tune.warn}     -- pre-spawn red marker dwell time`,
      `local BOSS_EVERY     = ${tune.bossEvery}     -- every Nth wave is a 3x-size BOSS`,
      `local PEEL_TTL       = ${tune.peelTTL}    -- ground-hazard lifetime`,
      ``,
      `local AssetService = game:GetService("AssetService")`,
      `local Players      = game:GetService("Players")`,
      `local Debris       = game:GetService("Debris")`,
      `local TweenService = game:GetService("TweenService")`,
      ``,
      `local spawned = {}`,
      `local MAX_ALIVE = 30`,
      `local waveCounter = 0`,
      ``,
      `-- ===== LEADERSTATS — "Waves Survived" in the player list =====`,
      `local function setupStats(player)`,
      `\tlocal ls = player:FindFirstChild("leaderstats") or Instance.new("Folder")`,
      `\tls.Name = "leaderstats"; ls.Parent = player`,
      `\tlocal dodged = ls:FindFirstChild("Waves Survived") or Instance.new("IntValue")`,
      `\tdodged.Name = "Waves Survived"; dodged.Value = 0; dodged.Parent = ls`,
      `end`,
      `Players.PlayerAdded:Connect(setupStats)`,
      `for _, p in ipairs(Players:GetPlayers()) do setupStats(p) end`,
      ``,
      `local function bumpScores()`,
      `\tfor _, p in ipairs(Players:GetPlayers()) do`,
      `\t\tlocal ls = p:FindFirstChild("leaderstats")`,
      `\t\tlocal d = ls and ls:FindFirstChild("Waves Survived")`,
      `\t\tif d and p.Character and p.Character:FindFirstChildOfClass("Humanoid") then`,
      `\t\t\tlocal hum = p.Character:FindFirstChildOfClass("Humanoid")`,
      `\t\t\tif hum.Health > 0 then d.Value = d.Value + 1 end`,
      `\t\tend`,
      `\tend`,
      `end`,
      ``,
      `-- ===== SPAWN ANCHOR (random player + jitter, fallback to origin) =====`,
      `local function spawnAnchor()`,
      `\tlocal players = Players:GetPlayers()`,
      `\tif #players > 0 then`,
      `\t\tlocal p = players[math.random(1, #players)]`,
      `\t\tlocal hrp = p.Character and p.Character:FindFirstChild("HumanoidRootPart")`,
      `\t\tif hrp then`,
      `\t\t\treturn hrp.Position + Vector3.new(math.random(-40, 40), 80, math.random(-40, 40))`,
      `\t\tend`,
      `\tend`,
      `\treturn Vector3.new(math.random(-50, 50), 80, math.random(-50, 50))`,
      `end`,
      ``,
      `-- ===== PRE-SPAWN WARNING MARKER (red circle on ground) =====`,
      `local function dropWarningMarker(skyPos)`,
      `\tlocal m = Instance.new("Part")`,
      `\tm.Shape = Enum.PartType.Cylinder`,
      `\tm.Size = Vector3.new(0.2, AOE_RADIUS * 2, AOE_RADIUS * 2)`,
      `\tm.Anchored = true; m.CanCollide = false; m.CastShadow = false`,
      `\tm.Color = Color3.fromRGB(255, 60, 60)`,
      `\tm.Material = Enum.Material.Neon`,
      `\tm.Transparency = 0.55`,
      `\tm.CFrame = CFrame.new(skyPos.X, 0.5, skyPos.Z) * CFrame.Angles(0, 0, math.rad(90))`,
      `\tm.Parent = workspace`,
      `\t-- Pulse alpha so the marker reads as a countdown.`,
      `\tTweenService:Create(m, TweenInfo.new(WARNING_SECS, Enum.EasingStyle.Quad, Enum.EasingDirection.Out, 0, true), { Transparency = 0.15, Size = Vector3.new(0.2, AOE_RADIUS * 2.2, AOE_RADIUS * 2.2) }):Play()`,
      `\tDebris:AddItem(m, WARNING_SECS + 0.2)`,
      `end`,
      ``,
      `-- ===== GROUND HAZARD (banana peel — slip on touch) =====`,
      `local function dropPeel(pos)`,
      `\tlocal peel = Instance.new("Part")`,
      `\tpeel.Shape = Enum.PartType.Cylinder`,
      `\tpeel.Size = Vector3.new(0.25, AOE_RADIUS * 1.2, AOE_RADIUS * 1.2)`,
      `\tpeel.Anchored = true; peel.CanCollide = false`,
      `\tpeel.Color = KEYWORD_COLOR`,
      `\tpeel.Material = Enum.Material.SmoothPlastic`,
      `\tpeel.Transparency = 0.45`,
      `\tpeel.CFrame = CFrame.new(pos.X, 0.3, pos.Z) * CFrame.Angles(0, 0, math.rad(90))`,
      `\tpeel.Parent = workspace`,
      `\tDebris:AddItem(peel, PEEL_TTL)`,
      `\tpeel.Touched:Connect(function(hit)`,
      `\t\tif not hit or not hit.Parent then return end`,
      `\t\tlocal hum = hit.Parent:FindFirstChildOfClass("Humanoid")`,
      `\t\tif hum and hum.Health > 0 and not hum:GetAttribute("DisasterSlipped") then`,
      `\t\t\thum:SetAttribute("DisasterSlipped", true)`,
      `\t\t\thum.PlatformStand = true`,
      `\t\t\ttask.delay(1.2, function() if hum.Parent then hum.PlatformStand = false; hum:SetAttribute("DisasterSlipped", false) end end)`,
      `\t\tend`,
      `\tend)`,
      `end`,
      ``,
      `-- ===== SPAWN ONE ENTITY (mesh + trail + light + AoE on impact) =====`,
      `local function spawnEntity(pos, isBoss)`,
      `\tif #spawned >= MAX_ALIVE then`,
      `\t\tlocal oldest = table.remove(spawned, 1)`,
      `\t\tif oldest and oldest.Parent then oldest:Destroy() end`,
      `\tend`,
      `\tlocal idx = math.random(1, #MESH_IDS)`,
      `\tlocal meshId = MESH_IDS[idx]`,
      `\tlocal ok, mp = pcall(function()`,
      `\t\treturn AssetService:CreateMeshPartAsync(Content.fromAssetId(meshId))`,
      `\tend)`,
      `\tif not ok or not mp then`,
      `\t\twarn("[DisasterSpawner] CreateMeshPartAsync failed for " .. tostring(meshId) .. ": " .. tostring(mp))`,
      `\t\treturn nil`,
      `\tend`,
      `\t-- Uniform aspect-preserving scale; bosses are 3x.`,
      `\tlocal sz = mp.Size`,
      `\tlocal longest = math.max(sz.X, sz.Y, sz.Z)`,
      `\tlocal targetEdge = isBoss and (TARGET_LONGEST * 3) or TARGET_LONGEST`,
      `\tif longest > 0 then`,
      `\t\tlocal k = targetEdge / longest`,
      `\t\tmp.Size = Vector3.new(sz.X * k, sz.Y * k, sz.Z * k)`,
      `\tend`,
      `\t-- Texture / colour (pcall texture — capability-gated, fall back to Color).`,
      `\tlocal texId = TEXTURE_IDS[idx]`,
      `\tif texId and texId > 0 then pcall(function() mp.TextureID = "rbxassetid://" .. texId end) end`,
      `\tmp.Color = KEYWORD_COLOR`,
      `\t-- Trail behind the falling mesh.`,
      `\tlocal a0 = Instance.new("Attachment"); a0.Position = Vector3.new(0,  mp.Size.Y / 2, 0); a0.Parent = mp`,
      `\tlocal a1 = Instance.new("Attachment"); a1.Position = Vector3.new(0, -mp.Size.Y / 2, 0); a1.Parent = mp`,
      `\tlocal trail = Instance.new("Trail")`,
      `\ttrail.Attachment0 = a0; trail.Attachment1 = a1`,
      `\ttrail.Color = ColorSequence.new(KEYWORD_COLOR)`,
      `\ttrail.Transparency = NumberSequence.new({NumberSequenceKeypoint.new(0, 0.2), NumberSequenceKeypoint.new(1, 1)})`,
      `\ttrail.Lifetime = 0.35`,
      `\ttrail.Parent = mp`,
      `\t-- Glow.`,
      `\tlocal light = Instance.new("PointLight")`,
      `\tlight.Color = KEYWORD_COLOR`,
      `\tlight.Brightness = isBoss and 4 or 2`,
      `\tlight.Range = isBoss and 24 or 12`,
      `\tlight.Parent = mp`,
      `\tmp.CFrame = CFrame.new(pos)`,
      `\tmp.Anchored = false`,
      `\tmp.Parent = workspace`,
      `\ttable.insert(spawned, mp)`,
      `\tDebris:AddItem(mp, 30)`,
      `\t-- On-impact: AoE damage + splash + sound + peel hazard.`,
      `\tlocal exploded = false`,
      `\tmp.Touched:Connect(function(other)`,
      `\t\tif exploded or not other then return end`,
      `\t\tif other.Parent == mp or other == mp then return end`,
      `\t\texploded = true`,
      `\t\tlocal impact = mp.Position`,
      `\t\tlocal radius = isBoss and (AOE_RADIUS * 1.8) or AOE_RADIUS`,
      `\t\t-- Splash particles.`,
      `\t\tlocal emitter = Instance.new("ParticleEmitter")`,
      `\t\temitter.Color = ColorSequence.new(KEYWORD_COLOR)`,
      `\t\temitter.Texture = "rbxasset://textures/particles/sparkles_main.dds"`,
      `\t\temitter.Rate = 0`,
      `\t\temitter.Lifetime = NumberRange.new(0.5, 1.1)`,
      `\t\temitter.Speed = NumberRange.new(12, 22)`,
      `\t\temitter.Acceleration = Vector3.new(0, -30, 0)`,
      `\t\temitter.SpreadAngle = Vector2.new(70, 70)`,
      `\t\temitter.Size = NumberSequence.new(isBoss and 2 or 1.1)`,
      `\t\temitter.Parent = mp`,
      `\t\temitter:Emit(isBoss and 80 or 35)`,
      `\t\t-- Impact sound.`,
      `\t\tlocal s = Instance.new("Sound")`,
      `\t\ts.SoundId = "rbxasset://sounds/electronicpingshort.wav"`,
      `\t\ts.Volume = isBoss and 1 or 0.6`,
      `\t\ts.PlaybackSpeed = isBoss and 0.55 or 1.2`,
      `\t\ts.Parent = mp`,
      `\t\ts:Play()`,
      `\t\t-- AoE damage to Humanoids within radius (falloff by distance).`,
      `\t\tfor _, char in ipairs(workspace:GetChildren()) do`,
      `\t\t\tlocal hum = char:FindFirstChildOfClass("Humanoid")`,
      `\t\t\tlocal hrp = char:FindFirstChild("HumanoidRootPart")`,
      `\t\t\tif hum and hrp and hum.Health > 0 then`,
      `\t\t\t\tlocal dist = (hrp.Position - impact).Magnitude`,
      `\t\t\t\tif dist <= radius then`,
      `\t\t\t\t\tlocal falloff = 1 - (dist / radius)`,
      `\t\t\t\t\tlocal dmg = math.random(AOE_DMG_MIN, AOE_DMG_MAX) * falloff * (isBoss and 2.2 or 1)`,
      `\t\t\t\t\thum:TakeDamage(dmg)`,
      `\t\t\t\tend`,
      `\t\t\tend`,
      `\t\tend`,
      `\t\tdropPeel(impact)`,
      `\t\ttask.delay(0.3, function() if mp.Parent then mp:Destroy() end end)`,
      `\tend)`,
      `\treturn mp`,
      `end`,
      ``,
      `-- ===== ONE WAVE: warning markers → wait → drop entities =====`,
      `local function spawnWave(count)`,
      `\twaveCounter += 1`,
      `\tlocal isBossWave = (waveCounter % BOSS_EVERY) == 0`,
      `\tlocal positions = {}`,
      `\tfor i = 1, count do positions[i] = spawnAnchor() end`,
      `\tif WARNING_SECS > 0 then`,
      `\t\tfor _, p in ipairs(positions) do dropWarningMarker(p) end`,
      `\t\ttask.wait(WARNING_SECS)`,
      `\tend`,
      `\tif isBossWave then print("[DisasterSpawner] ⚠ BOSS WAVE #" .. waveCounter) end`,
      `\tfor _, p in ipairs(positions) do`,
      `\t\tspawnEntity(p, isBossWave)`,
      `\t\ttask.wait(0.08)`,
      `\tend`,
      `\tbumpScores()`,
      `end`,
      '```',
    ].join('\n');
    return [
      `10) EMBED THE FOLLOWING DISASTER-SYSTEM BLOCK VERBATIM at the TOP of your script. It already provides spawnWave(count), pre-spawn warning markers, AoE damage on impact, particle splash, sound, trail, point light, slippery peel ground hazard, BOSS waves every Nth wave, and a leaderstats counter ("Waves Survived"). The constants at the top are pre-tuned to mode/chaos/size/frequency for THIS generation — DO NOT change them.`,
      luaTemplate,
      `11) MAIN LOOP — write ONLY a thin while-true loop under the embedded block. The loop should: (a) print "[DisasterSpawner] running — first event in <N>s" with N matching the first wait; (b) for the FIRST wave, call spawnWave(math.random(3, 6)) IMMEDIATELY (instant feedback rule); (c) then loop with task.wait(math.random(8, 15)) between waves, each calling spawnWave(math.random(3, 8)). Add 1-2 light inline comments explaining the cadence. DO NOT redefine spawnEntity / spawnAnchor / dropWarningMarker / dropPeel / bumpScores — they're already in the embedded block.`,
    ];
  }
  // Path 2 — branded primitive recipe for a known keyword.
  const kw = (input.objectKeyword ?? '').toLowerCase();
  if (kw && BRANDED_SHAPES[kw]) {
    return [
      `10) BUILD A RECOGNISABLE "${kw.toUpperCase()}" SHAPE (not a generic ball/cube). RECIPE:`,
      `    ${BRANDED_SHAPES[kw]}`,
      `    Wrap all child Parts in a `+'`Model`'+`, weld them with `+'`WeldConstraint`'+` (PartA = body, PartB = each child), set Model.PrimaryPart = body so the whole rig falls together. Spawn anchor sets body.Position, children inherit via welds.`,
      `11) Use ParticleEmitter or PointLight as cosmetic flair if it fits (fire trail for meteor, splash for toilet). One emitter max per entity.`,
    ];
  }
  // Path 3 — generic multi-Part composition (still better than a monolith).
  return [
    `10) ${GENERIC_MULTIPART[0]}`,
    `11) ${GENERIC_MULTIPART[1]} ${GENERIC_MULTIPART[2]}`,
  ];
}
