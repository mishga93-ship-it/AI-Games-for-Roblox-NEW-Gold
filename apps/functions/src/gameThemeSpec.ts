// gameThemeSpec.ts — Session 414: deterministic per-preset visual recognizability
// for the runtime game builders (roleplay_town, tower_defense, racing, parkour,
// story_game, minigame_hub, survival, fighting_arena, custom_game).
//
// PROBLEM (user, session 414): when a user picks a viral preset chip ("Build a
// Millionaire School", "Spawn a Monster Neighborhood", "Create a Bananita
// Island") the generated game does NOT look like the preset. Root cause: each
// builder only honours ~4 fixed `mapTheme` enums, and the LLM GDD almost never
// emits `mapTheme`, so the DEFAULT enum wins → every preset in a genre produces
// the same generic world. The specific preset TEXT never reaches the builder.
//
// FIX: derive a rich `GameVisualSpec` deterministically from the user's brief
// (palette + themed building names/signs + themed jobs + flavor lines + a free
// catalog hero-prop keyword). Builders honour the spec when present and fall
// back to their existing enum behaviour when absent (zero regression).
//
// Pattern follows the project's "hybrid skeleton for unreliable LLM" lesson and
// the existing ObbyVisualSpec (Phase G, session 230): deterministic skeleton,
// LLM only an optional accent. This module has NO external dependencies and is
// pure/synchronous so it is trivially unit-testable and free to run.

export type Rgb = [number, number, number];

/** Mirrors the `theme` table shape used by the town/racing builders so a spec
 * palette can be dropped straight in. Genres that only need a subset (e.g.
 * racing uses ground/road/accent) simply ignore the extra fields. */
export interface GamePalette {
  ground: Rgb;
  groundMaterial: string; // Roblox Enum.Material name, e.g. "Grass"
  road: Rgb;
  plaza: Rgb;
  wall: Rgb;
  roof: Rgb;
  accent: Rgb;
}

export interface GameStructure {
  name: string;
  sign: string;
}

export interface GameJobLabel {
  name: string;
  pay: number;
}

/** Time-of-day + foliage mood that drives Lighting/atmosphere/trees. This is
 * what actually makes "99 Nights" read as a dark forest night vs a sunny meadow
 * — palette alone (ground colour) is not enough because sky/trees were hardcoded
 * bright. Consumed by builders that call setupAtmosphere/makeTree. */
export interface GameAtmosphere {
  mood: 'day' | 'night' | 'dusk';
  clockTime: number;   // 0-24 for Lighting.ClockTime
  brightness: number;  // Lighting.Brightness
  ambient: Rgb;        // Lighting.OutdoorAmbient/Ambient
  tint: Rgb;           // ColorCorrection TintColor
  fogColor: Rgb;       // Atmosphere colour / atmoColor
  haze: number;        // Atmosphere haze (fog thickness)
  treeKind: 'round' | 'pine' | 'palm' | 'dead';
  treeLeaf: Rgb;
  treeTrunk: Rgb;
}

/** A themed NPC/enemy character. `decalId` is a real public Roblox catalog
 * decal id (the actual meme face — Tralalero shark, Skibidi, etc.) rendered via
 * `rbxthumb://type=Asset&id=<id>&w=420&h=420`; when 0/undefined the builder uses
 * a coloured composite character instead. */
export interface GameCharacter {
  name: string;
  decalId?: number;
  color: Rgb;
  line: string;
}

export interface GameVisualSpec {
  /** Cleaned display title used for in-world signage. */
  themeName: string;
  /** Canonical vibe token (money/brainrot/monster/...). */
  vibe: string;
  /** Canonical setting token (town/school/island/lab/kingdom). */
  setting: string;
  palette: GamePalette;
  /** Time-of-day + foliage mood (night/dusk/day + tree kind/colour). */
  atmosphere: GameAtmosphere;
  /** 3 themed NPC characters (real meme faces where available). */
  characters: GameCharacter[];
  /** Themed enemy roster for TD/survival/fighting (meme army, wolves, animatronics...). */
  enemies: GameCharacter[];
  /** Real catalog decal id for the plaza hero centerpiece (0 = coloured monument). */
  heroDecalId: number;
  /** 6 themed buildings — town-like genres use name+sign; other genres ignore. */
  structures: GameStructure[];
  /** 6 themed jobs (roleplay). */
  jobs: GameJobLabel[];
  /** NPC / narrator dialogue tuned to the vibe. */
  flavorLines: string[];
  /** Plaza / hub label. */
  hubName: string;
  /** Free catalog / `rbxthumb://` search keyword for a hero prop. */
  heroPropKeyword: string;
}

/** Format an RGB triple as Lua. Builders AND the QA reviewer use this exact
 * formatter so the QA "palette applied" check can string-match the emit. */
export function rgbLua(rgb: Rgb): string {
  return `Color3.fromRGB(${Math.round(rgb[0])}, ${Math.round(rgb[1])}, ${Math.round(rgb[2])})`;
}

// ─── Setting archetypes (drive building NAMES + jobs) ────────────────────────

interface SettingDef {
  key: string;
  buildings: string[]; // exactly 6
  jobs: GameJobLabel[]; // exactly 6
  hubNoun: string;
}

const SETTINGS: SettingDef[] = [
  {
    key: 'school',
    buildings: ['Main Hall', 'Cafeteria', 'Gymnasium', 'Library', 'Dorms', "Principal's Office"],
    jobs: [
      { name: 'Student', pay: 24 }, { name: 'Teacher', pay: 45 }, { name: 'Coach', pay: 40 },
      { name: 'Librarian', pay: 34 }, { name: 'Janitor', pay: 26 }, { name: 'Principal', pay: 65 },
    ],
    hubNoun: 'Schoolyard',
  },
  {
    key: 'island',
    buildings: ['Beach Hut', 'Tiki Bar', 'Dock', 'Lifeguard Tower', 'Market Stall', 'Resort'],
    jobs: [
      { name: 'Lifeguard', pay: 40 }, { name: 'Bartender', pay: 32 }, { name: 'Fisher', pay: 36 },
      { name: 'Vendor', pay: 30 }, { name: 'Captain', pay: 55 }, { name: 'Host', pay: 28 },
    ],
    hubNoun: 'Beach',
  },
  {
    key: 'lab',
    buildings: ['Containment Lab', 'Test Chamber', 'Control Room', 'Reactor', 'Med Bay', 'Exit Gate'],
    jobs: [
      { name: 'Scientist', pay: 50 }, { name: 'Technician', pay: 38 }, { name: 'Guard', pay: 44 },
      { name: 'Subject', pay: 24 }, { name: 'Medic', pay: 40 }, { name: 'Director', pay: 65 },
    ],
    hubNoun: 'Atrium',
  },
  {
    key: 'kingdom',
    buildings: ['Castle Keep', 'Throne Hall', 'Market', 'Tavern', 'Barracks', 'Cottages'],
    jobs: [
      { name: 'Knight', pay: 48 }, { name: 'Merchant', pay: 36 }, { name: 'Guard', pay: 40 },
      { name: 'Blacksmith', pay: 38 }, { name: 'Jester', pay: 28 }, { name: 'Monarch', pay: 65 },
    ],
    hubNoun: 'Courtyard',
  },
  {
    key: 'town',
    buildings: ['Town Hall', 'Bank', 'Market', 'Cafe', 'Police Station', 'Apartments'],
    jobs: [
      { name: 'Cashier', pay: 35 }, { name: 'Barista', pay: 30 }, { name: 'Officer', pay: 48 },
      { name: 'Teller', pay: 42 }, { name: 'Mayor', pay: 65 }, { name: 'Janitor', pay: 26 },
    ],
    hubNoun: 'Town Square',
  },
];

function detectSetting(brief: string): SettingDef {
  const t = brief.toLowerCase();
  if (/\b(school|academy|class|college|detention|student|campus)\b/.test(t)) return settingByKey('school');
  if (/\b(island|beach|tropical|paradise|resort|lagoon|shore)\b/.test(t)) return settingByKey('island');
  if (/\b(lab|prototype|experiment|facility|science|reactor|containment|test subject)\b/.test(t)) return settingByKey('lab');
  if (/\b(kingdom|castle|throne|medieval|empire|royal|realm)\b/.test(t)) return settingByKey('kingdom');
  return settingByKey('town');
}

function settingByKey(key: string): SettingDef {
  return SETTINGS.find((s) => s.key === key) ?? SETTINGS[SETTINGS.length - 1];
}

// ─── Vibe overlays (drive PALETTE + flavor + hero prop + iconic landmark) ────

interface VibeDef {
  key: string;
  match: RegExp;
  palette: GamePalette;
  flavor: string[]; // 3 lines
  heroPropKeyword: string;
  adjective: string; // prepended to hub noun
  iconicBuilding: string; // replaces the last setting building
}

// Priority order = array order (first match on a tie wins).
const VIBES: VibeDef[] = [
  {
    key: 'brainrot',
    match: /\b(brainrot|skibidi|tralalero|orangutini|sigma|rizz|ohio|gyat|sahur|crocodilo|meme)\b/i,
    palette: { ground: [96, 86, 140], groundMaterial: 'Concrete', road: [40, 36, 60], plaza: [150, 70, 190], wall: [90, 220, 230], roof: [255, 90, 200], accent: [170, 255, 90] },
    flavor: ['Welcome to the chaos — nothing makes sense and that is the point.', 'Skibidi rule #1: get the bag.', 'Grab a role and go full sigma.'],
    heroPropKeyword: 'skibidi', adjective: 'Brainrot', iconicBuilding: 'Skibidi HQ',
  },
  {
    key: 'money',
    match: /\b(mrbeast|mr beast|million|millionaire|billion|rich|money|cash|prize|reward|wealth|tycoon)\b|\$/i,
    palette: { ground: [104, 150, 86], groundMaterial: 'Grass', road: [60, 62, 68], plaza: [210, 180, 90], wall: [240, 228, 180], roof: [60, 140, 90], accent: [255, 210, 70] },
    flavor: ['Every shift here pays BIG — grab a job and stack cash!', 'Buy a VIP role to flex on everyone.', 'Top earner becomes the legend of the city.'],
    heroPropKeyword: 'trophy', adjective: 'Millionaire', iconicBuilding: 'Money Vault',
  },
  {
    key: 'monster',
    match: /\b(monster|fnaf|freddy|animatronic|haunted|ghost|zombie|cursed|scary|horror|nightmare|creature|demon|evil|titan|titans|colossus|kaiju|godzilla|kraken)\b/i,
    palette: { ground: [54, 50, 64], groundMaterial: 'Slate', road: [34, 30, 40], plaza: [78, 60, 90], wall: [96, 86, 110], roof: [120, 40, 50], accent: [150, 70, 200] },
    flavor: ['Do not wander after dark... they come out.', 'Lock your doors — the creatures are hungry.', 'Survive your shift and you might see morning.'],
    heroPropKeyword: 'monster', adjective: 'Haunted', iconicBuilding: 'Haunted Manor',
  },
  {
    key: 'inferno',
    match: /\b(lava|volcano|volcanic|magma|inferno|molten|hellfire|ember|wildfire)\b/i,
    palette: { ground: [62, 52, 50], groundMaterial: 'Basalt', road: [42, 34, 32], plaza: [96, 60, 48], wall: [120, 84, 72], roof: [168, 64, 40], accent: [255, 120, 40] },
    flavor: ['Mind the lava — one slip and you are toast.', 'The ground runs molten here.', 'Keep moving before the floor melts.'],
    heroPropKeyword: 'lava', adjective: 'Inferno', iconicBuilding: 'Volcano Forge',
  },
  {
    key: 'spy',
    match: /\b(spy|secret agent|agent|stealth|covert|espionage|undercover|classified)\b/i,
    palette: { ground: [70, 74, 82], groundMaterial: 'Concrete', road: [40, 42, 48], plaza: [90, 96, 108], wall: [150, 160, 175], roof: [60, 66, 78], accent: [230, 70, 70] },
    flavor: ['Keep it quiet, agent — eyes everywhere.', 'Take a job, blend in, complete the mission.', 'Trust no one. Even the Mayor has secrets.'],
    heroPropKeyword: 'spy', adjective: 'Secret', iconicBuilding: 'Agency HQ',
  },
  {
    key: 'tropical',
    match: /\b(banana|bananita|dolfinita|island|tropical|beach|paradise|palm|coconut|lagoon|jungle)\b/i,
    palette: { ground: [224, 206, 150], groundMaterial: 'Sand', road: [150, 120, 80], plaza: [210, 196, 150], wall: [240, 235, 210], roof: [60, 160, 150], accent: [255, 180, 60] },
    flavor: ['Welcome to paradise — grab a drink and a job!', 'The waves are perfect today.', 'Mind the bananas... they multiply.'],
    heroPropKeyword: 'banana', adjective: 'Island', iconicBuilding: 'Banana Stand',
  },
  {
    key: 'night',
    match: /\b(99 night|nights|midnight|darkness|blackout|survive the night|after dark)\b/i,
    palette: { ground: [40, 52, 64], groundMaterial: 'Slate', road: [30, 38, 48], plaza: [60, 74, 90], wall: [90, 104, 120], roof: [50, 60, 76], accent: [120, 200, 255] },
    flavor: ['Stay near the fire — the night is long.', 'Stock up before dark.', 'We have lasted this many nights. Do not break the streak.'],
    heroPropKeyword: 'campfire', adjective: 'Midnight', iconicBuilding: 'Watchtower',
  },
  {
    key: 'hero',
    match: /\b(superhero|super hero|hero|heroes|legend|super power|powers|cape|villain|sidekick)\b/i,
    palette: { ground: [96, 150, 110], groundMaterial: 'Grass', road: [60, 64, 72], plaza: [120, 150, 200], wall: [230, 235, 245], roof: [70, 120, 200], accent: [255, 80, 90] },
    flavor: ['Train hard, recruit — the city needs you.', 'Pick a role and unlock your powers.', 'Every legend started with a first shift.'],
    heroPropKeyword: 'superhero', adjective: 'Hero', iconicBuilding: 'Hero HQ',
  },
  {
    key: 'pets',
    match: /\b(pet|pets|puppy|kitten|adopt|companion|critter)\b/i,
    palette: { ground: [150, 200, 140], groundMaterial: 'Grass', road: [120, 110, 120], plaza: [240, 200, 220], wall: [250, 240, 250], roof: [255, 170, 190], accent: [255, 150, 200] },
    flavor: ['Adopt a buddy and explore the town!', 'The pets run things around here.', 'Grab a job to earn treats.'],
    heroPropKeyword: 'pet', adjective: 'Pet', iconicBuilding: 'Pet Shop',
  },
  {
    key: 'lab',
    match: /\b(prototype|experiment|lab|science|reactor|containment|test subject|mutant|anomaly)\b/i,
    palette: { ground: [70, 74, 82], groundMaterial: 'Slate', road: [44, 48, 56], plaza: [120, 130, 140], wall: [220, 228, 235], roof: [90, 150, 200], accent: [120, 255, 210] },
    flavor: ['Stay inside the lines — the experiment is unstable.', 'Clock in, run your tests, do not touch the reactor.', 'Containment is everyone’s job.'],
    heroPropKeyword: 'robot', adjective: 'Lab', iconicBuilding: 'Reactor Core',
  },
];

const NEUTRAL_VIBE: VibeDef = {
  key: 'neutral',
  match: /$^/,
  palette: { ground: [120, 170, 95], groundMaterial: 'Grass', road: [70, 72, 78], plaza: [180, 170, 150], wall: [225, 210, 180], roof: [170, 80, 70], accent: [250, 210, 90] },
  flavor: ['Welcome! Grab a job pad to earn cash.', 'Buy a role at the Shop to flex your status.', 'The Mayor job pays the most. Good luck out there!'],
  heroPropKeyword: '', adjective: '', iconicBuilding: '',
};

function detectVibe(brief: string): VibeDef {
  let best: VibeDef | null = null;
  let bestScore = 0;
  for (const vibe of VIBES) {
    const matches = brief.match(new RegExp(vibe.match.source, 'gi'));
    const score = matches ? matches.length : 0;
    if (score > bestScore) {
      bestScore = score;
      best = vibe;
    }
  }
  return best ?? NEUTRAL_VIBE;
}

// ─── Atmosphere (time-of-day + foliage) per vibe ────────────────────────────

const DAY_ATMOS: GameAtmosphere = {
  mood: 'day', clockTime: 14, brightness: 2.7, ambient: [120, 128, 140], tint: [255, 250, 244],
  fogColor: [199, 175, 130], haze: 1.6, treeKind: 'round', treeLeaf: [78, 142, 70], treeTrunk: [112, 80, 52],
};

const ATMOS_BY_VIBE: Record<string, GameAtmosphere> = {
  // 99 Nights in the Forest = dark pine forest at night, campfire survival.
  night: { mood: 'night', clockTime: 0, brightness: 0.55, ambient: [22, 28, 44], tint: [120, 140, 180], fogColor: [40, 52, 72], haze: 3.4, treeKind: 'pine', treeLeaf: [40, 72, 56], treeTrunk: [58, 46, 38] },
  monster: { mood: 'night', clockTime: 2, brightness: 0.7, ambient: [40, 30, 50], tint: [160, 120, 180], fogColor: [60, 46, 74], haze: 3.0, treeKind: 'dead', treeLeaf: [92, 82, 104], treeTrunk: [54, 46, 52] },
  inferno: { mood: 'dusk', clockTime: 17.6, brightness: 1.4, ambient: [74, 42, 34], tint: [255, 150, 110], fogColor: [128, 62, 40], haze: 2.6, treeKind: 'dead', treeLeaf: [128, 74, 52], treeTrunk: [70, 46, 40] },
  spy: { mood: 'dusk', clockTime: 6, brightness: 1.5, ambient: [60, 66, 80], tint: [170, 182, 205], fogColor: [88, 98, 120], haze: 2.2, treeKind: 'round', treeLeaf: [70, 110, 84], treeTrunk: [90, 72, 54] },
  tropical: { mood: 'day', clockTime: 14, brightness: 3.0, ambient: [128, 134, 138], tint: [255, 246, 224], fogColor: [212, 200, 168], haze: 1.5, treeKind: 'palm', treeLeaf: [86, 170, 80], treeTrunk: [122, 86, 54] },
  lab: { mood: 'day', clockTime: 12, brightness: 2.4, ambient: [124, 132, 142], tint: [236, 246, 250], fogColor: [150, 170, 186], haze: 1.4, treeKind: 'round', treeLeaf: [92, 150, 112], treeTrunk: [100, 80, 60] },
};

function atmosphereForVibe(vibeKey: string): GameAtmosphere {
  return ATMOS_BY_VIBE[vibeKey] ?? DAY_ATMOS;
}

/** Inner `setupAtmosphere({...})` opts Lua for a themed spec — drives Lighting
 * time-of-day/brightness/fog so the sky matches the vibe (night for 99 Nights,
 * dusk for lava, etc.). Returns '' for neutral vibe so builders keep their
 * original atmosphere (no regression). Builders use it as:
 *   `setupAtmosphere({${specAtmoLua || `<original opts>`}})`. */
export function atmosphereOptsLua(spec: GameVisualSpec): string {
  if (spec.vibe === 'neutral') return '';
  const a = spec.atmosphere;
  const night = a.mood === 'night';
  return `clockTime = ${a.clockTime}, brightness = ${a.brightness}, `
    + `ambient = ${rgbLua(a.ambient)}, outdoor = ${rgbLua(a.ambient)}, `
    + `tint = ${rgbLua(a.tint)}, atmoColor = ${rgbLua(a.fogColor)}, `
    + `haze = ${a.haze}, density = ${night ? 0.55 : 0.36}, `
    + `bloom = ${night ? 0.3 : 0.6}, cloudCover = ${night ? 0.85 : 0.5}`;
}

// ─── Themed characters per vibe (real meme decal ids reused from the pool) ──

// Real public Roblox catalog decal ids (mirrors the ASSET_* constants in
// gameTemplates.ts brainrot pool — the actual meme faces).
const DECAL_TRALALERO = 74641532426859;
const DECAL_BOMBARDIRO = 98664340093672;
const DECAL_SKIBIDI = 14595650130;
const DECAL_TUNG = 77173967880518;

const CHARACTERS_BY_VIBE: Record<string, GameCharacter[]> = {
  brainrot: [
    { name: 'Tralalero', decalId: DECAL_TRALALERO, color: [60, 120, 220], line: 'Tralalero Tralala! Get the bag, stay sigma.' },
    { name: 'Bombardiro', decalId: DECAL_BOMBARDIRO, color: [90, 150, 80], line: 'Bombardiro Crocodilo, reporting for chaos.' },
    { name: 'Skibidi', decalId: DECAL_SKIBIDI, color: [230, 230, 235], line: 'Skibidi dop dop yes yes.' },
  ],
  tropical: [
    { name: 'Bananita', color: [255, 210, 60], line: 'Bananita Dolfinita! Welcome to paradise.' },
    { name: 'Dolfinita', color: [90, 200, 230], line: 'Splash! The lagoon never sleeps.' },
    { name: 'Tralalero', decalId: DECAL_TRALALERO, color: [60, 120, 220], line: 'Even sharks vacation here.' },
  ],
  money: [
    { name: 'The Host', color: [60, 200, 90], line: 'Last one standing wins $1,000,000!' },
    { name: 'Challenger', color: [255, 210, 70], line: "Touch the money pad and DON'T let go." },
    { name: 'Prize Master', color: [120, 230, 160], line: 'Every house here pays out. Go!' },
  ],
  monster: [
    { name: 'The Creature', decalId: DECAL_BOMBARDIRO, color: [150, 70, 200], line: 'You smell... fresh.' },
    { name: 'Mutant', color: [110, 150, 80], line: "Don't scream. It makes them faster." },
    { name: 'Ghoul', color: [90, 90, 110], line: 'Stay in the light, if you can find it.' },
  ],
  night: [
    { name: 'Survivor', color: [120, 140, 170], line: 'Keep the fire alive. Dawn is far.' },
    { name: 'Scout', color: [90, 110, 90], line: 'Wolves circle after midnight.' },
    { name: 'Owl Keeper', color: [150, 120, 80], line: 'The owls warn us when they come.' },
  ],
  inferno: [
    { name: 'Forgemaster', color: [255, 120, 40], line: 'Mind the lava. It bites.' },
    { name: 'Ember', color: [255, 90, 60], line: 'The whole city runs on fire here.' },
    { name: 'Magma', color: [120, 60, 50], line: "One wrong step and you're ash." },
  ],
  spy: [
    { name: 'Agent', color: [220, 70, 70], line: 'Eyes open. Trust no one.' },
    { name: 'Handler', color: [150, 160, 175], line: 'Your mission, should you accept it...' },
    { name: 'Hacker', color: [90, 220, 140], line: "I'm in. Tunnels unlocked." },
  ],
  hero: [
    { name: 'Captain', color: [255, 80, 90], line: 'Suit up, recruit. The city needs us.' },
    { name: 'Recruit', color: [90, 150, 235], line: 'My powers are still... developing.' },
    { name: 'Mentor', color: [255, 210, 90], line: 'Every legend trained here first.' },
  ],
  pets: [
    { name: 'Drako', color: [90, 180, 120], line: 'Roar! Pets run this town now.' },
    { name: 'Pup', color: [200, 150, 110], line: 'Wanna adopt me? Pick a job first!' },
    { name: 'Trainer', color: [255, 150, 200], line: 'Feed, train, evolve. Easy.' },
  ],
  lab: [
    { name: 'Subject 01', color: [230, 230, 235], line: 'I... I think I am changing.' },
    { name: 'Scientist', color: [120, 255, 210], line: 'Do not feed the Prototype.' },
    { name: 'Prototype', color: [120, 90, 110], line: '. . .' },
  ],
};

const NEUTRAL_CHARACTERS: GameCharacter[] = [
  { name: 'Mira', color: [230, 180, 150], line: 'Welcome! Grab a job pad to earn cash.' },
  { name: 'Theo', color: [170, 200, 235], line: 'Buy a role at the Shop to flex your status.' },
  { name: 'Ada', color: [210, 200, 160], line: 'The Mayor job pays the most. Good luck out there!' },
];

function charactersForVibe(vibeKey: string): GameCharacter[] {
  return CHARACTERS_BY_VIBE[vibeKey] ?? NEUTRAL_CHARACTERS;
}

// Themed enemy rosters (the THREAT) for TD/survival/fighting. The last entry is
// treated as the boss flavour. `line` is unused for enemies.
const ENEMIES_BY_VIBE: Record<string, GameCharacter[]> = {
  brainrot: [
    { name: 'Tralalero', decalId: DECAL_TRALALERO, color: [60, 120, 220], line: '' },
    { name: 'Bombardiro', decalId: DECAL_BOMBARDIRO, color: [90, 150, 80], line: '' },
    { name: 'Tung Tung', decalId: DECAL_TUNG, color: [180, 130, 80], line: '' },
  ],
  tropical: [
    { name: 'Bananita', color: [255, 210, 60], line: '' },
    { name: 'Coconut Crab', color: [150, 90, 60], line: '' },
    { name: 'Tralalero', decalId: DECAL_TRALALERO, color: [60, 120, 220], line: '' },
  ],
  night: [
    { name: 'Wolf', color: [70, 74, 86], line: '' },
    { name: 'Night Stalker', color: [50, 60, 90], line: '' },
    { name: 'Shadow Beast', color: [30, 30, 42], line: '' },
  ],
  monster: [
    { name: 'Animatronic', decalId: DECAL_BOMBARDIRO, color: [120, 90, 80], line: '' },
    { name: 'Mutant', color: [110, 150, 80], line: '' },
    { name: 'Titan', color: [150, 70, 200], line: '' },
  ],
  inferno: [
    { name: 'Lava Beast', color: [255, 110, 40], line: '' },
    { name: 'Ember Imp', color: [255, 80, 50], line: '' },
    { name: 'Magma Hulk', color: [120, 60, 50], line: '' },
  ],
  money: [
    { name: 'Rival', color: [220, 70, 70], line: '' },
    { name: 'Saboteur', color: [80, 80, 92], line: '' },
    { name: 'Cheater', color: [200, 60, 120], line: '' },
  ],
  spy: [
    { name: 'Operative', color: [60, 60, 72], line: '' },
    { name: 'Drone', color: [150, 160, 175], line: '' },
    { name: 'Enforcer', color: [220, 70, 70], line: '' },
  ],
  hero: [
    { name: 'Minion', color: [90, 90, 110], line: '' },
    { name: 'Brute', color: [180, 90, 90], line: '' },
    { name: 'Villain', color: [150, 70, 200], line: '' },
  ],
  pets: [
    { name: 'Wild Beast', color: [120, 90, 60], line: '' },
    { name: 'Stray', color: [150, 140, 120], line: '' },
    { name: 'Rogue Dragon', color: [90, 180, 120], line: '' },
  ],
  lab: [
    { name: 'Toy Mutant', color: [230, 120, 120], line: '' },
    { name: 'Glitch', color: [120, 255, 160], line: '' },
    { name: 'Prototype', color: [120, 90, 110], line: '' },
  ],
};

const NEUTRAL_ENEMIES: GameCharacter[] = [
  { name: 'Invader', color: [220, 90, 80], line: '' },
  { name: 'Raider', color: [200, 70, 90], line: '' },
  { name: 'Warlord', color: [180, 40, 60], line: '' },
];

function enemiesForVibe(vibeKey: string): GameCharacter[] {
  return ENEMIES_BY_VIBE[vibeKey] ?? NEUTRAL_ENEMIES;
}

// ─── Derivation ──────────────────────────────────────────────────────────────

function cleanTitle(title: string): string {
  // Strip leading imperative verbs the preset chips use ("Build a", "Create a",
  // "Generate a", "Spawn a") so the in-world sign reads as a place name.
  return title
    .replace(/^\s*(build|create|generate|make|spawn|design|start)\s+(a|an|the|my)?\s*/i, '')
    .trim()
    .slice(0, 48) || title.slice(0, 48);
}

function strongTokenFromText(text: string): string {
  const stop = new Set(['build', 'create', 'generate', 'make', 'spawn', 'a', 'an', 'the', 'my', 'with', 'and', 'of', 'in', 'on', 'to', 'game', 'world', 'town', 'city', 'roblox']);
  const words = (text.toLowerCase().match(/[a-z][a-z']{2,}/g) || []).filter((w) => !stop.has(w));
  return words[0] ?? '';
}

/**
 * Derive a deterministic visual spec from the user's brief + title.
 * `genre` currently only influences which building/job archetype is the default
 * (all genres share palette/vibe/flavor/hero). Always returns a fully-populated
 * spec — never throws, never returns partials.
 */
export function deriveGameVisualSpec(genre: string, brief: string, title: string): GameVisualSpec {
  const haystack = `${title} ${brief}`;
  const setting = detectSetting(haystack);
  const vibe = detectVibe(haystack);

  const structures: GameStructure[] = setting.buildings.map((b) => ({ name: b, sign: b }));
  if (vibe.iconicBuilding) {
    structures[structures.length - 1] = { name: vibe.iconicBuilding, sign: vibe.iconicBuilding };
  }

  const hubName = (vibe.adjective ? `${vibe.adjective} ${setting.hubNoun}` : setting.hubNoun).slice(0, 40);
  const heroPropKeyword = vibe.heroPropKeyword || strongTokenFromText(haystack);
  const characters = charactersForVibe(vibe.key);
  const heroDecalId = characters.find((c) => c.decalId)?.decalId ?? 0;

  return {
    themeName: cleanTitle(title),
    vibe: vibe.key,
    setting: setting.key,
    palette: vibe.palette,
    atmosphere: atmosphereForVibe(vibe.key),
    characters,
    enemies: enemiesForVibe(vibe.key),
    heroDecalId,
    structures,
    jobs: setting.jobs,
    flavorLines: vibe.flavor,
    hubName,
    heroPropKeyword,
  };
}

// ─── QA reviewer + self-heal ─────────────────────────────────────────────────

export type GameQaStatus = 'passed' | 'warning' | 'rejected';

export interface GameQaReview {
  status: GameQaStatus;
  score: number; // 0-100
  reasons: string[];
  repairActions: string[];
  partCount: number;
}

type BuildResultLike = string | { serverScript?: string };

function serverSourceOf(result: BuildResultLike): string {
  return typeof result === 'string' ? result : (result?.serverScript ?? '');
}

/**
 * Deterministic recognizability QA on a generated game's server Lua. Mirrors the
 * vehicle `vehicle_quality_review_retry` pattern (structural + theme checks → a
 * status the caller can act on). Pure/synchronous, no LLM call.
 */
export function reviewGameQuality(result: BuildResultLike, spec: GameVisualSpec | undefined, genre: string): GameQaReview {
  const src = serverSourceOf(result);
  const reasons: string[] = [];
  const repairActions: string[] = [];
  let score = 100;

  const partCount = (src.match(/\bpart\(/g) || []).length
    + (src.match(/Instance\.new\("Part"\)/g) || []).length
    + (src.match(/Instance\.new\('Part'\)/g) || []).length;

  if (partCount < 8) {
    reasons.push(`low_part_count:${partCount}`);
    repairActions.push('increase world geometry / building count');
    score -= 40;
  } else if (partCount < 12) {
    // Path/arena genres (racing track, fighting ring) are legitimately sparser
    // than a town — a mild penalty, not a rejection.
    reasons.push(`sparse_world:${partCount}`);
    score -= 12;
  }
  if (!/leaderstats/.test(src)) {
    reasons.push('no_leaderstats');
    repairActions.push('add leaderstats progression');
    score -= 20;
  }
  if (!/BillboardGui|Config\.Title|SurfaceGui/.test(src)) {
    reasons.push('no_in_world_signage');
    repairActions.push('add a titled signage billboard');
    score -= 15;
  }

  if (spec) {
    // Only town-like genres emit named building signs from the spec.structures
    // list; path/arena genres (TD/racing/parkour/...) consume only the palette,
    // so the themed-signage check would always (wrongly) flag them.
    const townLikeGenres = new Set(['roleplay_town']);
    if (townLikeGenres.has(genre)) {
      const signHits = spec.structures.filter((s) => s.sign && src.includes(s.sign)).length;
      const needed = Math.min(3, spec.structures.length);
      if (signHits < needed) {
        reasons.push(`weak_themed_signage:${signHits}/${spec.structures.length}`);
        repairActions.push('inject themed building signs from the spec');
        score -= 30;
      }
    }
    if (spec.vibe !== 'neutral') {
      const accent = rgbLua(spec.palette.accent);
      const ground = rgbLua(spec.palette.ground);
      if (!src.includes(accent) && !src.includes(ground)) {
        reasons.push('palette_not_applied');
        repairActions.push('apply the spec palette to ground/accent');
        score -= 15;
      }
    }
  }

  score = Math.max(0, Math.min(100, score));
  const status: GameQaStatus = score < 55 ? 'rejected' : score < 80 ? 'warning' : 'passed';
  return { status, score, reasons, repairActions, partCount };
}

/**
 * Produce a stronger spec for a retry. Builders are deterministic, so a retry
 * only changes the output if its INPUT changes — heal guarantees a fully themed,
 * non-neutral, fully-populated spec so the second build is at least as
 * recognizable as the first. Never weakens a spec.
 */
export function healGameVisualSpec(spec: GameVisualSpec, reasons: string[]): GameVisualSpec {
  let vibeKey = spec.vibe;
  let palette = spec.palette;
  let flavorLines = spec.flavorLines;
  let heroPropKeyword = spec.heroPropKeyword;
  const structures = [...spec.structures];

  // Upgrade a neutral vibe to the app's signature "money/MrBeast" energy so a
  // rejected generic world becomes themed on retry.
  const weakTheme = reasons.some((r) => r.startsWith('weak_themed_signage') || r === 'palette_not_applied');
  if (spec.vibe === 'neutral' && weakTheme) {
    const money = VIBES.find((v) => v.key === 'money');
    if (money) {
      vibeKey = money.key;
      palette = money.palette;
      flavorLines = money.flavor;
      heroPropKeyword = money.heroPropKeyword;
      if (structures.length > 0) {
        structures[structures.length - 1] = { name: money.iconicBuilding, sign: money.iconicBuilding };
      }
    }
  }

  // Guarantee 6 structures (pad from the town defaults).
  const townBuildings = settingByKey('town').buildings;
  while (structures.length < 6) {
    const fill = townBuildings[structures.length] ?? `Building ${structures.length + 1}`;
    structures.push({ name: fill, sign: fill });
  }

  const healedCharacters = charactersForVibe(vibeKey);
  return {
    ...spec,
    vibe: vibeKey,
    palette,
    atmosphere: atmosphereForVibe(vibeKey),
    characters: healedCharacters,
    enemies: enemiesForVibe(vibeKey),
    heroDecalId: healedCharacters.find((c) => c.decalId)?.decalId ?? 0,
    flavorLines: flavorLines.length >= 3 ? flavorLines : NEUTRAL_VIBE.flavor,
    heroPropKeyword: heroPropKeyword || 'trophy',
    structures: structures.slice(0, 6),
  };
}
