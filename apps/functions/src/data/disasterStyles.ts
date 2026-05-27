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
  return [
    'You are a SAFE Roblox Lua disaster-spawner generator. Output ONLY a complete Lua script wrapped in ```lua ... ``` — no preamble.',
    '',
    `Generate a server Script that spawns a recurring disaster event on a Roblox survival map.`,
    `Mode: ${mode.titleEN}. Theme hint: ${mode.themeHint}`,
    `Chaos level: ${input.chaos}. ${CHAOS_GUIDANCE[input.chaos]}`,
    `Size: ${input.size}. ${SIZE_GUIDANCE[input.size]}`,
    `Frequency: ${input.frequency}. ${FREQUENCY_GUIDANCE[input.frequency]}${userClause}`,
    '',
    'STRICT RULES (the script will be deployed by a beginner — must be safe):',
    '1) Place the Script in ServerScriptService. Single file.',
    '2) Use ONLY: workspace, Instance.new (Part / MeshPart / Folder / PointLight / ParticleEmitter / Trail), CFrame, Vector3, Color3.fromRGB, BrickColor, BasePart.Touched, task.wait, task.spawn, table, math.random, Workspace:WaitForChild, game:GetService("Players"), Debris service for cleanup, RunService for tick.',
    '3) BANNED — never use: HttpService, MarketplaceService, MessagingService, DataStoreService, RemoteEvent, RemoteFunction, BindableEvent (for cross-script comm), loadstring, require by assetId, game:HttpGet, os.execute, exploit hooks.',
    '4) POPULATION CAP — track spawned instances in a local table. BEFORE spawning a new entity, if `#spawned >= 30`, DESTROY the oldest one. Hard cap MAX_ALIVE = 30.',
    '5) AUTO-CLEANUP — every spawned entity must have a Debris:AddItem(entity, lifetime) call with lifetime ≤ 90 seconds.',
    '6) BOUNDED LOOP — main loop is `while true do task.wait(intervalSeconds) … end`. intervalSeconds must be ≥ 5. No `while true do … end` without a wait. No spawning more than 10 entities per tick.',
    '7) Entities are simple Roblox Parts (Instance.new("Part")) — NO game.ServerStorage references (asset may not exist for the user). Style them via Size + Color3 + BrickColor + Material + Shape. Optionally attach a ParticleEmitter for cosmetic flair.',
    '8) Add 3-5 inline comments in English explaining the disaster + spawn logic + cleanup (beginner-friendly).',
    '9) Keep total script ≤ 100 lines.',
    '10) NO outside imports.',
    '',
    'Output ONLY the ```lua code block. No prose.',
  ].join('\n');
}
