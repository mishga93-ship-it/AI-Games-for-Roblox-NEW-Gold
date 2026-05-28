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
   * uses InsertService:LoadAsset(id) for each spawn (with embedded
   * Script-stripping), instead of branded primitive composition.
   * Shape: { name, assetId, preferredScale, colorRGB? }. */
  assetEntries?: Array<{
    name: string;
    assetId: number;
    preferredScale: number;
    colorRGB?: [number, number, number];
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
    '13) Keep total script ≤ 180 lines (multi-Part shapes need a bit more room).',
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
  // Path 1 — curated Marketplace asset bundle (preferred when whitelist
  // has verified ids). Emit a complete InsertService:LoadAsset block with
  // Script-stripping (toolbox-malware defence) + clone cache + bounding-box
  // normalisation, then instruct the LLM to USE that block instead of
  // Instance.new("Part"). User feedback session 385 round 8: «НЕ
  // Instance.new("Part"). А InsertService:LoadAsset».
  if (input.assetEntries && input.assetEntries.length > 0) {
    const ids = input.assetEntries.slice(0, 6).map((e) => e.assetId);
    const idList = ids.join(', ');
    const preferredScale = input.assetEntries[0]?.preferredScale ?? 5;
    // The Lua block below is what we want the LLM to literally embed. We
    // ship it as a copy-paste template inside the rule so the model doesn't
    // have to reinvent InsertService boilerplate (security-critical: the
    // strip-scripts loop MUST run before parenting to workspace).
    const luaTemplate = [
      '```lua',
      `local InsertService = game:GetService("InsertService")`,
      `local ASSET_IDS = { ${idList} }   -- ${input.objectKeyword ?? 'curated'} pack`,
      `local TARGET_SCALE = ${preferredScale}     -- studs along the longest bounding-box edge`,
      `local cache = {}`,
      ``,
      `local function loadSafe(id)`,
      `\tif cache[id] then return cache[id]:Clone() end`,
      `\tlocal ok, asset = pcall(function() return InsertService:LoadAsset(id) end)`,
      `\tif not ok or not asset then return nil end`,
      `\t-- SECURITY: strip ALL embedded scripts (toolbox-malware defence)`,
      `\tfor _, d in ipairs(asset:GetDescendants()) do`,
      `\t\tif d:IsA("BaseScript") or d:IsA("ModuleScript") then d:Destroy() end`,
      `\tend`,
      `\tlocal model = asset:GetChildren()[1]`,
      `\tif not model then asset:Destroy(); return nil end`,
      `\tmodel.Parent = nil`,
      `\tasset:Destroy()`,
      `\t-- normalise scale: shrink/grow so the longest bbox edge ≈ TARGET_SCALE`,
      `\tlocal cf, sz = model:GetBoundingBox()`,
      `\tlocal longest = math.max(sz.X, sz.Y, sz.Z)`,
      `\tif longest > 0 then`,
      `\t\tlocal s = TARGET_SCALE / longest`,
      `\t\tfor _, p in ipairs(model:GetDescendants()) do`,
      `\t\t\tif p:IsA("BasePart") then`,
      `\t\t\t\tp.Size = p.Size * s`,
      `\t\t\t\tp.CFrame = CFrame.new((p.Position - cf.Position) * s) + cf.Position`,
      `\t\t\tend`,
      `\t\tend`,
      `\tend`,
      `\tcache[id] = model`,
      `\treturn model:Clone()`,
      `end`,
      ``,
      `local function spawnEntity(pos)`,
      `\tlocal id = ASSET_IDS[math.random(1, #ASSET_IDS)]`,
      `\tlocal model = loadSafe(id)`,
      `\tif not model then return nil end`,
      `\tmodel:PivotTo(CFrame.new(pos))`,
      `\tmodel.Parent = workspace`,
      `\tfor _, p in ipairs(model:GetDescendants()) do`,
      `\t\tif p:IsA("BasePart") then p.Anchored = false end`,
      `\tend`,
      `\treturn model`,
      `end`,
      '```',
    ].join('\n');
    return [
      `10) SPAWN VIA InsertService:LoadAsset — DO NOT use Instance.new("Part") for the entity. The user just gave us a verified whitelist of free Roblox Marketplace ids for "${input.objectKeyword ?? 'this disaster'}". Embed the following helper block VERBATIM near the top of your script (security-critical: it strips embedded Scripts BEFORE parenting to workspace, the standard toolbox-malware defence). Then call \`spawnEntity(position)\` from your main loop to create one falling Model per spawn — track returned Models in your \`spawned\` table for the population cap and Debris cleanup.`,
      luaTemplate,
      `11) Cosmetic flair (ParticleEmitter / PointLight / Sound) is fine, but attach it to the loaded Model's primary part — NOT as a standalone Part. Strip-scripts defence still applies if you re-load anything else.`,
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
