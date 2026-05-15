/**
 * Seed script for the Firestore `templates` collection.
 *
 * Usage:
 *   npx ts-node --esm apps/functions/src/seedTemplates.ts
 *
 * Or from the functions directory after build:
 *   node lib/seedTemplates.js
 *
 * Requires GOOGLE_APPLICATION_CREDENTIALS or Firebase emulator.
 */

import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import type { GameTemplate } from './types.js';

if (!getApps().length) {
  initializeApp();
}

const db = getFirestore();

const templates: Omit<GameTemplate, 'createdAt' | 'updatedAt'>[] = [
  {
    id: 'obby-starter',
    title: 'Obby Starter',
    genre: 'obby',
    description:
      '10 levels of increasing difficulty with checkpoints, kill bricks, moving platforms, and a basic stage-select UI. Perfect starting point for a classic obstacle course.',
    previewUrl: '',
    features: [
      '10 themed stages',
      'Checkpoint system',
      'Kill bricks & lava',
      'Moving platforms',
      'Stage-select GUI',
      'Win celebration',
    ],
    difficulty: 'easy',
    starterPrompt:
      'Build a Roblox Obby game with 10 levels of increasing difficulty. Include a checkpoint system so players respawn at the last reached checkpoint. Add kill bricks, moving platforms, and rotating obstacles. Provide a simple stage-select UI and a win screen with confetti at the end.',
    manifestJson: {
      id: 'obby-starter',
      title: 'Obby Starter',
      summary: 'Classic 10-stage obby with checkpoints and basic UI',
      target: 'place',
      scene: [
        { id: 'spawn', className: 'SpawnLocation', name: 'SpawnLocation' },
        { id: 'stage1', className: 'Model', name: 'Stage1' },
        { id: 'stage2', className: 'Model', name: 'Stage2' },
        { id: 'stage3', className: 'Model', name: 'Stage3' },
        { id: 'checkpoint1', className: 'Part', name: 'Checkpoint1', properties: { BrickColor: 'Lime green' } },
        { id: 'killbrick1', className: 'Part', name: 'KillBrick', properties: { BrickColor: 'Really red' } },
        { id: 'winpad', className: 'Part', name: 'WinPad', properties: { BrickColor: 'Gold' } },
      ],
      scripts: [
        {
          id: 'checkpoint-server',
          name: 'CheckpointServer',
          scriptType: 'Script',
          container: 'ServerScriptService',
          source: '-- Checkpoint save logic: listens for touch on checkpoint parts and stores player stage',
        },
        {
          id: 'killbrick-server',
          name: 'KillBrickServer',
          scriptType: 'Script',
          container: 'ServerScriptService',
          source: '-- Kill brick handler: resets character on touch',
        },
        {
          id: 'stage-ui',
          name: 'StageSelectUI',
          scriptType: 'LocalScript',
          container: 'StarterGui',
          source: '-- Stage-select GUI: shows current stage, allows teleport to unlocked stages',
        },
      ],
    },
  },
  {
    id: 'tycoon-starter',
    title: 'Tycoon Starter',
    genre: 'tycoon',
    description:
      'Classic tycoon with a dropper, conveyor belt, collector, purchase buttons for upgrades, and a cash display. Includes 5 tiers of upgrades and a prestige system.',
    previewUrl: '',
    features: [
      'Dropper + conveyor + collector',
      'Purchase button pads',
      '5-tier upgrade tree',
      'Cash display HUD',
      'Prestige / rebirth',
      'Auto-save DataStore',
    ],
    difficulty: 'medium',
    starterPrompt:
      'Build a Roblox Tycoon game. Create a dropper that spawns ore on a conveyor belt leading to a collector that converts ore into cash. Add purchase button pads on the ground for upgrades: faster dropper, bigger collector, conveyor speed, auto-collector, and a prestige reset. Show a HUD with current cash. Save progress with DataStore.',
    manifestJson: {
      id: 'tycoon-starter',
      title: 'Tycoon Starter',
      summary: 'Dropper-conveyor-collector tycoon with upgrades and prestige',
      target: 'place',
      scene: [
        { id: 'spawn', className: 'SpawnLocation', name: 'SpawnLocation' },
        { id: 'base', className: 'Model', name: 'TycoonBase' },
        { id: 'dropper', className: 'Part', name: 'Dropper' },
        { id: 'conveyor', className: 'Part', name: 'Conveyor' },
        { id: 'collector', className: 'Part', name: 'Collector' },
        { id: 'buypad1', className: 'Part', name: 'BuyPad_UpgradeDropper' },
        { id: 'buypad2', className: 'Part', name: 'BuyPad_UpgradeConveyor' },
      ],
      scripts: [
        {
          id: 'tycoon-core',
          name: 'TycoonCore',
          scriptType: 'Script',
          container: 'ServerScriptService',
          source: '-- Core tycoon loop: dropper spawns, conveyor moves, collector awards cash',
        },
        {
          id: 'tycoon-upgrades',
          name: 'TycoonUpgrades',
          scriptType: 'Script',
          container: 'ServerScriptService',
          source: '-- Upgrade system: buy pads deduct cash and improve stats',
        },
        {
          id: 'tycoon-save',
          name: 'TycoonSave',
          scriptType: 'Script',
          container: 'ServerScriptService',
          source: '-- DataStore auto-save on interval and player leaving',
        },
        {
          id: 'tycoon-hud',
          name: 'TycoonHUD',
          scriptType: 'LocalScript',
          container: 'StarterGui',
          source: '-- HUD showing cash, upgrade progress, prestige count',
        },
      ],
    },
  },
  {
    id: 'simulator-starter',
    title: 'Simulator Starter',
    genre: 'simulator',
    description:
      'Click-to-earn simulator with a shop, pet system, rebirth mechanic, and leaderboard. Tap to earn currency, buy multipliers, hatch pets for passive income.',
    previewUrl: '',
    features: [
      'Click / tap mechanic',
      'Currency shop',
      'Pet hatching eggs',
      'Rebirth system',
      'Multiplier upgrades',
      'Leaderboard',
    ],
    difficulty: 'medium',
    starterPrompt:
      'Build a Roblox Simulator game. The player clicks or taps to earn coins. Add a shop where they can buy multipliers and tools. Include a pet system with eggs that hatch into pets giving passive income boosts. Add a rebirth system that resets progress but gives a permanent multiplier. Show a leaderboard for top earners.',
    manifestJson: {
      id: 'simulator-starter',
      title: 'Simulator Starter',
      summary: 'Click-to-earn simulator with pets, shop, and rebirth',
      target: 'place',
      scene: [
        { id: 'spawn', className: 'SpawnLocation', name: 'SpawnLocation' },
        { id: 'clickzone', className: 'Part', name: 'ClickZone', properties: { Size: [20, 1, 20] } },
        { id: 'shop-npc', className: 'Model', name: 'ShopNPC' },
        { id: 'egg-stand', className: 'Model', name: 'EggStand' },
        { id: 'rebirth-portal', className: 'Part', name: 'RebirthPortal' },
      ],
      scripts: [
        {
          id: 'click-handler',
          name: 'ClickHandler',
          scriptType: 'Script',
          container: 'ServerScriptService',
          source: '-- Click detection and currency award with multiplier calculation',
        },
        {
          id: 'shop-system',
          name: 'ShopSystem',
          scriptType: 'Script',
          container: 'ServerScriptService',
          source: '-- Shop: list of items with costs, purchase validation, stat upgrades',
        },
        {
          id: 'pet-system',
          name: 'PetSystem',
          scriptType: 'Script',
          container: 'ServerScriptService',
          source: '-- Pet hatching from eggs, rarity tiers, equip/unequip, passive income',
        },
        {
          id: 'rebirth-system',
          name: 'RebirthSystem',
          scriptType: 'Script',
          container: 'ServerScriptService',
          source: '-- Rebirth: reset currency, keep pets, grant permanent multiplier',
        },
        {
          id: 'simulator-hud',
          name: 'SimulatorHUD',
          scriptType: 'LocalScript',
          container: 'StarterGui',
          source: '-- HUD: currency, multiplier, pet display, rebirth count',
        },
      ],
    },
  },
  {
    id: 'rpg-starter',
    title: 'RPG Starter',
    genre: 'rpg',
    description:
      'A mini RPG with 1 quest-giving NPC, basic inventory, simple combat, and XP/leveling. Talk to the NPC, accept a quest, defeat enemies, collect loot, and level up.',
    previewUrl: '',
    features: [
      'Quest NPC with dialogue',
      'Basic combat system',
      'Inventory & loot',
      'XP & leveling',
      'Enemy spawner',
      'Health bar HUD',
    ],
    difficulty: 'hard',
    starterPrompt:
      'Build a Roblox RPG game. Create an NPC that gives the player a quest to defeat 5 slimes in a nearby field. Add a basic melee combat system with a sword tool. Enemies drop loot (coins, potions). Include an inventory system to hold items, an XP bar, leveling up to increase damage and health. Show a health bar HUD and a quest tracker.',
    manifestJson: {
      id: 'rpg-starter',
      title: 'RPG Starter',
      summary: 'Mini RPG with NPC quests, combat, inventory, and leveling',
      target: 'place',
      scene: [
        { id: 'spawn', className: 'SpawnLocation', name: 'SpawnLocation' },
        { id: 'village', className: 'Model', name: 'Village' },
        { id: 'quest-npc', className: 'Model', name: 'QuestNPC' },
        { id: 'enemy-field', className: 'Model', name: 'EnemyField' },
        { id: 'slime-spawner', className: 'Part', name: 'SlimeSpawner' },
      ],
      scripts: [
        {
          id: 'npc-dialogue',
          name: 'NPCDialogue',
          scriptType: 'Script',
          container: 'ServerScriptService',
          source: '-- NPC interaction: proximity prompt triggers dialogue, quest accept/complete',
        },
        {
          id: 'combat-system',
          name: 'CombatSystem',
          scriptType: 'Script',
          container: 'ServerScriptService',
          source: '-- Melee combat: hitbox detection, damage calculation, enemy AI',
        },
        {
          id: 'inventory-module',
          name: 'InventoryModule',
          scriptType: 'ModuleScript',
          container: 'ReplicatedStorage',
          source: '-- Inventory management: add, remove, stack items',
        },
        {
          id: 'leveling-system',
          name: 'LevelingSystem',
          scriptType: 'Script',
          container: 'ServerScriptService',
          source: '-- XP tracking, level-up thresholds, stat increases',
        },
        {
          id: 'rpg-hud',
          name: 'RPGHUD',
          scriptType: 'LocalScript',
          container: 'StarterGui',
          source: '-- HUD: health bar, XP bar, quest tracker, inventory button',
        },
      ],
    },
  },
  {
    id: 'horror-starter',
    title: 'Horror Starter',
    genre: 'horror',
    description:
      'A dark horror map with a flashlight, 1 monster with basic AI, jumpscares, locked doors, and key collectibles. Atmospheric lighting and ambient sounds.',
    previewUrl: '',
    features: [
      'Dark atmosphere',
      'Flashlight tool',
      '1 monster with chase AI',
      'Jumpscare triggers',
      'Keys & locked doors',
      'Ambient sound effects',
    ],
    difficulty: 'medium',
    starterPrompt:
      'Build a Roblox Horror game set in an abandoned building. Make the map very dark with Lighting set to night. Give the player a flashlight tool. Add 1 monster that patrols hallways and chases the player when spotted. Include jumpscare triggers, locked doors that require keys found around the map, and ambient creepy sounds. The goal is to find all 3 keys and escape.',
    manifestJson: {
      id: 'horror-starter',
      title: 'Horror Starter',
      summary: 'Dark horror map with flashlight, monster AI, and key collection',
      target: 'place',
      scene: [
        { id: 'spawn', className: 'SpawnLocation', name: 'SpawnLocation' },
        { id: 'building', className: 'Model', name: 'AbandonedBuilding' },
        { id: 'monster', className: 'Model', name: 'Monster' },
        { id: 'key1', className: 'Part', name: 'Key1', properties: { BrickColor: 'Gold' } },
        { id: 'key2', className: 'Part', name: 'Key2', properties: { BrickColor: 'Gold' } },
        { id: 'key3', className: 'Part', name: 'Key3', properties: { BrickColor: 'Gold' } },
        { id: 'exit-door', className: 'Model', name: 'ExitDoor' },
      ],
      scripts: [
        {
          id: 'monster-ai',
          name: 'MonsterAI',
          scriptType: 'Script',
          container: 'ServerScriptService',
          source: '-- Monster patrol + chase: waypoint navigation, player detection radius, chase speed',
        },
        {
          id: 'flashlight',
          name: 'FlashlightTool',
          scriptType: 'LocalScript',
          container: 'StarterPlayerScripts',
          source: '-- Flashlight toggle: SpotLight on/off, battery drain, flicker effect',
        },
        {
          id: 'key-system',
          name: 'KeySystem',
          scriptType: 'Script',
          container: 'ServerScriptService',
          source: '-- Key pickup and door unlock: collect 3 keys, unlock exit door',
        },
        {
          id: 'jumpscare',
          name: 'JumpscareSystem',
          scriptType: 'LocalScript',
          container: 'StarterGui',
          source: '-- Jumpscare triggers: proximity-based image flash with sound',
        },
        {
          id: 'atmosphere',
          name: 'AtmosphereSetup',
          scriptType: 'Script',
          container: 'ServerScriptService',
          source: '-- Lighting setup: Ambient dark, fog, ambient sound loop',
        },
      ],
    },
  },
  {
    id: 'pvp-arena-starter',
    title: 'PvP Arena Starter',
    genre: 'pvp',
    description:
      'Free-for-all PvP arena with weapon loadouts, respawn system, kill tracking, and a scoreboard. Includes 3 weapon types and a round timer.',
    previewUrl: '',
    features: [
      '3 weapon types',
      'Respawn system',
      'Kill/death tracking',
      'Round timer',
      'Scoreboard HUD',
      'Winner announcement',
    ],
    difficulty: 'medium',
    starterPrompt:
      'Build a Roblox PvP Arena game. Create a free-for-all arena with 3 weapon types: sword, bow, and magic staff. Add a respawn system that places players at random spawn points. Track kills and deaths per player. Include a round timer (3 minutes), a live scoreboard HUD, and announce the winner at the end of each round.',
    manifestJson: {
      id: 'pvp-arena-starter',
      title: 'PvP Arena Starter',
      summary: 'FFA arena with weapon loadouts, respawn, and scoreboard',
      target: 'place',
      scene: [
        { id: 'spawn1', className: 'SpawnLocation', name: 'SpawnPoint1' },
        { id: 'spawn2', className: 'SpawnLocation', name: 'SpawnPoint2' },
        { id: 'spawn3', className: 'SpawnLocation', name: 'SpawnPoint3' },
        { id: 'arena', className: 'Model', name: 'Arena' },
        { id: 'weapon-rack', className: 'Model', name: 'WeaponRack' },
      ],
      scripts: [
        {
          id: 'round-manager',
          name: 'RoundManager',
          scriptType: 'Script',
          container: 'ServerScriptService',
          source: '-- Round lifecycle: countdown, active round, end, winner calculation',
        },
        {
          id: 'weapon-system',
          name: 'WeaponSystem',
          scriptType: 'Script',
          container: 'ServerScriptService',
          source: '-- 3 weapon types: sword (melee), bow (projectile), staff (AoE), damage handling',
        },
        {
          id: 'respawn-handler',
          name: 'RespawnHandler',
          scriptType: 'Script',
          container: 'ServerScriptService',
          source: '-- Random respawn point selection, brief invulnerability after spawn',
        },
        {
          id: 'scoreboard',
          name: 'ScoreboardHUD',
          scriptType: 'LocalScript',
          container: 'StarterGui',
          source: '-- Live scoreboard: player names, kills, deaths, round timer',
        },
      ],
    },
  },
  {
    id: 'tower-defense-starter',
    title: 'Tower Defense Starter',
    genre: 'td',
    description:
      'Wave-based tower defense with 3 tower types, an enemy path, upgrade system, and wave progression. Place towers, upgrade them, and survive increasing waves.',
    previewUrl: '',
    features: [
      '3 tower types',
      'Wave spawner',
      'Enemy path system',
      'Tower placement grid',
      'Tower upgrades (3 tiers)',
      'Wave HUD & health bar',
    ],
    difficulty: 'hard',
    starterPrompt:
      'Build a Roblox Tower Defense game. Create a map with a winding enemy path from spawn to base. Add 3 tower types: archer (single target), cannon (splash), and ice (slow). Players place towers on a grid adjacent to the path. Each tower has 3 upgrade tiers. Enemies spawn in waves with increasing health and speed. Show a HUD with wave number, base health, and currency.',
    manifestJson: {
      id: 'tower-defense-starter',
      title: 'Tower Defense Starter',
      summary: 'Wave-based TD with 3 tower types and upgrade tiers',
      target: 'place',
      scene: [
        { id: 'spawn', className: 'SpawnLocation', name: 'SpawnLocation' },
        { id: 'enemy-path', className: 'Model', name: 'EnemyPath' },
        { id: 'base', className: 'Part', name: 'PlayerBase' },
        { id: 'placement-grid', className: 'Model', name: 'PlacementGrid' },
      ],
      scripts: [
        {
          id: 'wave-spawner',
          name: 'WaveSpawner',
          scriptType: 'Script',
          container: 'ServerScriptService',
          source: '-- Wave definitions, enemy spawn intervals, scaling health/speed per wave',
        },
        {
          id: 'tower-placement',
          name: 'TowerPlacement',
          scriptType: 'Script',
          container: 'ServerScriptService',
          source: '-- Grid-based placement, tower purchase validation, upgrade logic',
        },
        {
          id: 'tower-combat',
          name: 'TowerCombat',
          scriptType: 'Script',
          container: 'ServerScriptService',
          source: '-- Tower targeting, projectile, splash/slow effects, DPS calculation',
        },
        {
          id: 'enemy-pathfinding',
          name: 'EnemyPathfinding',
          scriptType: 'Script',
          container: 'ServerScriptService',
          source: '-- Enemy follows waypoints along path, applies damage to base on arrival',
        },
        {
          id: 'td-hud',
          name: 'TDHUD',
          scriptType: 'LocalScript',
          container: 'StarterGui',
          source: '-- HUD: wave counter, base health, currency, tower selection panel',
        },
      ],
    },
  },
  {
    id: 'racing-starter',
    title: 'Racing Starter',
    genre: 'racing',
    description:
      'Kart-style racing game with a looping track, vehicle physics, boost pads, lap counter, and finish-line detection. Supports up to 8 players.',
    previewUrl: '',
    features: [
      'Looping race track',
      'Vehicle seat physics',
      'Boost pads',
      'Lap counter (3 laps)',
      'Countdown start',
      'Finish leaderboard',
    ],
    difficulty: 'medium',
    starterPrompt:
      'Build a Roblox Racing game. Create a looping kart track with turns, ramps, and boost pads. Use VehicleSeat for kart controls with acceleration, braking, and steering. Add a 3-2-1 countdown before the race starts. Track laps (3 laps to win) with checkpoint detection. Show a HUD with current lap, position, and speed. Announce race results at the finish.',
    manifestJson: {
      id: 'racing-starter',
      title: 'Racing Starter',
      summary: 'Kart racing with boost pads, laps, and vehicle physics',
      target: 'place',
      scene: [
        { id: 'spawn', className: 'SpawnLocation', name: 'SpawnLocation' },
        { id: 'track', className: 'Model', name: 'RaceTrack' },
        { id: 'start-line', className: 'Part', name: 'StartLine' },
        { id: 'checkpoint1', className: 'Part', name: 'Checkpoint1' },
        { id: 'checkpoint2', className: 'Part', name: 'Checkpoint2' },
        { id: 'boost-pad', className: 'Part', name: 'BoostPad', properties: { BrickColor: 'Neon orange' } },
        { id: 'kart', className: 'Model', name: 'StarterKart' },
      ],
      scripts: [
        {
          id: 'race-manager',
          name: 'RaceManager',
          scriptType: 'Script',
          container: 'ServerScriptService',
          source: '-- Race lifecycle: lobby, countdown, active race, finish detection, results',
        },
        {
          id: 'kart-physics',
          name: 'KartPhysics',
          scriptType: 'Script',
          container: 'ServerScriptService',
          source: '-- Vehicle setup: VehicleSeat, BodyVelocity boost, drift handling',
        },
        {
          id: 'lap-tracker',
          name: 'LapTracker',
          scriptType: 'Script',
          container: 'ServerScriptService',
          source: '-- Checkpoint + finish-line detection, lap counting, position tracking',
        },
        {
          id: 'race-hud',
          name: 'RaceHUD',
          scriptType: 'LocalScript',
          container: 'StarterGui',
          source: '-- HUD: lap counter, position, speed, countdown overlay, results screen',
        },
      ],
    },
  },
];

async function seed() {
  const now = new Date().toISOString();
  const batch = db.batch();

  for (const tpl of templates) {
    const ref = db.collection('templates').doc(tpl.id);
    batch.set(ref, {
      ...tpl,
      createdAt: now,
      updatedAt: now,
    });
  }

  await batch.commit();
  console.log(`Seeded ${templates.length} templates into Firestore.`);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
