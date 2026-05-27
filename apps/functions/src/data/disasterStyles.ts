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
    '2) Use ONLY: workspace, Instance.new (Part / MeshPart / Folder / PointLight / ParticleEmitter / Trail), CFrame, Vector3, Color3.fromRGB, BrickColor, BasePart.Touched, task.wait, task.spawn, table, math.random, Workspace:WaitForChild, game:GetService("Players"), Debris service for cleanup, RunService for tick.',
    '3) BANNED — never use: HttpService, MarketplaceService, MessagingService, DataStoreService, RemoteEvent, RemoteFunction, BindableEvent (for cross-script comm), loadstring, require by assetId, game:HttpGet, os.execute, exploit hooks.',
    '4) POPULATION CAP — track spawned instances in a local table. BEFORE spawning a new entity, if `#spawned >= 30`, DESTROY the oldest one. Hard cap MAX_ALIVE = 30.',
    '5) AUTO-CLEANUP — every spawned entity must have a Debris:AddItem(entity, lifetime) call with lifetime ≤ 90 seconds.',
    '6) BOUNDED LOOP — main loop is `while true do … task.wait(intervalSeconds) end`. intervalSeconds must be between 5 and 20 (NOT 30-60 — players quit before they see anything). No `while true do … end` without a wait. No spawning more than 10 entities per tick.',
    '7) FIRST SPAWN IS IMMEDIATE — call the spawn function(s) ONCE before the main loop starts, AND/OR put the `task.wait` at the END of the loop body so iteration 1 spawns at t≈0. Players must see something within 3 seconds of pressing Play, otherwise it feels broken.',
    '8) SPAWN NEAR PLAYERS — for the spawn anchor, iterate `game:GetService("Players"):GetPlayers()` and use a random player\'s `Character.HumanoidRootPart.Position + Vector3.new(rx, 80, rz)` (rx/rz random in [-40,40]). If no players are connected, fall back to `Vector3.new(math.random(-50,50), 80, math.random(-50,50))`. Spawning at a fixed (0,100,0) misses players standing on the far side of the map.',
    '9) DIAGNOSTIC PRINTS — print `"[DisasterSpawner] running — first event in <N>s"` at script top, and `"[DisasterSpawner] spawning <type> @ <pos>"` on each spawn. The user reads the Output panel to confirm it loaded.',
    '10) Entities are simple Roblox Parts (Instance.new("Part")) — NO game.ServerStorage references (asset may not exist for the user). Style them via Size + Color3 + BrickColor + Material + Shape. Optionally attach a ParticleEmitter for cosmetic flair.',
    '11) Add 3-5 inline comments in English explaining the disaster + spawn logic + cleanup (beginner-friendly).',
    '12) Keep total script ≤ 120 lines.',
    '13) NO outside imports.',
    '',
    'Output ONLY the ```lua code block. No prose.',
  ].join('\n');
}
