/**
 * Firestore Seed Script — Mock Social Data
 *
 * Creates 100 bot profiles, initial posts, comments, likes, and follows.
 * Avatars use DiceBear pixel-art (free, no API key).
 *
 * Usage:
 *   cd apps/functions
 *   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json
 *   npm run seed
 */

import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// ---------- Init ----------

// Lazy Firestore getter — works both as CLI script and as imported module
function db() {
  return getFirestore();
}

// ---------- Helpers ----------

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickN<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(randomInt(0, 23), randomInt(0, 59), randomInt(0, 59));
  return d.toISOString();
}

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** DiceBear pixel-art avatar — free, no key, stable per seed.
 *  Uses PNG (not SVG) because iOS UIImage(data:) cannot decode SVG. */
function dicebearAvatar(seed: string): string {
  return `https://api.dicebear.com/7.x/pixel-art/png?seed=${encodeURIComponent(seed)}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf&size=128`;
}

// ---------- Bot Profile Data ----------

const USERNAMES = [
  'PixelCrafter', 'NeonBuilder', 'ObbyStar42', 'TycoonMaster', 'LuaDev_Pro',
  'AvatarQueen', 'MapMakerMax', 'SoundWave_RBX', 'GlitchHunter', 'BuilderBot3000',
  'CosmicRBX', 'RetroGamer_Dev', 'AnimateThis', 'TexturePack_Pro', 'SimDevStudio',
  'ObbyKing99', 'PixelSword88', 'NeonObby_Dev', 'MapCreator99', 'LuaScripter',
  'RobloxPro_X', 'StudioMaster', 'GameDevRBX', 'UGCDesigner', 'TycoonPro',
  'SpeedRunner42', 'QuestBuilder', 'RpgCreator', 'HorrorMapDev', 'PetSimFan',
  'BuildingGuru', 'AnimeMaster', 'TowerDefPro', 'JailbreakFan', 'AdoptMeDev',
  'BladeballPro', 'NaturalDev', 'VehicleModder', 'IslandBuilder', 'MurderFan99',
  'ArsenalScript', 'DoorsDev_X', 'KingLegacyFan', 'BoatBuilder', 'NinjaLegends',
  'MegaNoobDev', 'BrookhavenFan', 'AnimeBattler', 'BloxFruitsDev', 'PiggyFanRBX',
  'ToiletTDPro', 'VolcanoMap', 'StronganDev', 'RoyaleHigh', 'ElementalDev',
  'ScriptKing_X', 'UiDesigner42', 'MeshpackPro', 'TerrrainExpert', 'LowPolyDev',
  'SmoothAnim', 'DataSavePro', 'GamepassDev', 'SoundFxPro', 'CafeBuilder',
  'DungeonMapper', 'CityBuilder88', 'SpaceMapDev', 'PixelArtRBX', 'RetroMapPro',
  'HarborBuilder', 'JungleMapper', 'DesertMapPro', 'SnowMapDev', 'FantasyBuilder',
  'SciFiMapPro', 'WesternDev', 'PirateMapFan', 'VikingBuilder', 'SamuraiDev',
  'ZombieMapPro', 'HauntedDev', 'MedievalMap', 'ModernCityDev', 'FutureCityPro',
  'UnderwaterMap', 'SkyIslandDev', 'LavaMapPro', 'IceMapDev', 'ForestMapper',
  'SwampBuilder', 'RooftopDev', 'SubwayMapper', 'AirportBuilder', 'SchoolMapDev',
  'HospitalDev', 'MallMapPro', 'StadiumBuilder', 'ParkMapDev', 'MuseumMapper',
];

const ROBLOX_SUFFIXES = ['99', '_X', '42', '_Dev', '_Pro', '2025', '_RBX', '88', '_Studio', '_Games'];

const HEADLINES = [
  'Game Developer', 'UI Designer', 'Obby Creator', 'Tycoon Expert', 'Scripter',
  'UGC Creator', 'Map Designer', 'Audio Creator', 'QA Tester', 'Builder',
  'Space Enthusiast', 'Retro Dev', 'Animator', 'Texture Artist', 'Sim Developer',
  'Lua Wizard', 'Low-Poly Artist', 'Terrain Expert', 'Character Designer', 'Level Designer',
  'Game Scripter', 'Visual Designer', 'Asset Creator', 'Effect Artist', 'Story Creator',
];

const BIOS = [
  'Building worlds one pixel at a time. 3 years on Roblox Studio',
  'Neon aesthetics & futuristic builds. UI/UX for Roblox games',
  'Obby enthusiast. 200+ obbies completed. Building my own now!',
  'Tycoon games are my passion. 5 published tycoons on Roblox',
  'Lua scripting since 2019. Open source Roblox modules on GitHub',
  'Fashion & avatar design. UGC creator with 10K+ sales',
  'Terrain & environment specialist. Realistic Roblox worlds',
  'Music producer & sound designer. Custom audio for Roblox games',
  'Finding bugs so you don\'t have to. QA for top Roblox studios',
  'Pro builder. Specializing in low-poly Roblox environments',
  'Space-themed Roblox games & experiences. 50K+ visits',
  'Bringing retro 8-bit vibes to Roblox. Pixel art lover',
  'Smooth R15 animations for your Roblox characters. Commission open',
  'High quality decals & textures for Roblox Studio. Free packs weekly',
  'Simulator games done right. Pet systems, rebirths, hatching',
  'Roblox developer since 2018. Specializing in horror maps and atmosphere',
  'Making the best dungeon experiences on Roblox. D&D inspired builds',
  'City builder enthusiast. Modern architecture in Roblox Studio',
  'Fantasy world builder — elves, dragons, magic. Full RPG experiences',
  'Sci-fi and futurism. Space stations, alien worlds, neon cities in Roblox',
  'Medieval castle builder. Knights, dragons, and epic quests on Roblox',
  'Tropical island vibes. Beach resorts and paradise maps for Roblox',
  'Horror game specialist. Jumpscare mechanics, fog effects, ambient sounds',
  'Roblox vehicle modder. Cars, planes, boats — all with custom physics',
  'Parkour and speed run maps. Precision platforming in Roblox Studio',
  'Pet system developer. Custom hatching, evolution, trading systems',
  'Multiplayer RPG builder. Quest systems, inventory, dialogue trees',
  'Roblox UI/UX nerd. Clean interfaces for tycoons and simulators',
  'Underwater map creator. Ocean biomes, coral reefs, deep sea in Roblox',
  'Seasonal map maker. Winter, Halloween, summer events for Roblox',
];

const EMAIL_DOMAINS = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com'];

// ---------- Content Data ----------

const GAME_TITLES = [
  'Blox Fruits Training Obby',
  'Pet Simulator X: Reborn',
  'Brookhaven RP Remake',
  'Adopt Me Tycoon Edition',
  'Tower Defense Simulator Pro',
  'Murder Mystery: Neon Map',
  'Roblox Obby: 100 Stages',
  'Anime Battlegrounds Simulator',
  'Natural Disaster Survival 2',
  'Jailbreak City Tycoon',
  'Bee Swarm Simulator Clone',
  'Piggy: Chapter 13 Fan Game',
  'Arsenal Training Obby',
  'Doors Horror Experience',
  'King Legacy Simulator',
  'Build A Boat Tycoon',
  'Roblox Ninja Legends Obby',
  'Mega Noob Simulator',
  'Brookhaven Hospital RP',
  'Anime Tycoon: Shindo Life',
  'Toilet Tower Defense',
  'Speed Run Obby 4',
  'Strongman Simulator Rebirth',
  'Roblox Island Royale',
  'Vehicle Simulator Deluxe',
  'Blade Ball Training Arena',
  'Volcano Escape Obby',
  'MM2 Trading Hub',
  'Roblox Theme Park Tycoon',
  'Elemental Battlegrounds',
  'Dragon Ball Z Simulator',
  'One Piece Adventure RP',
  'Scary Maze: Roblox Edition',
  'Clicker Champion Simulator',
  'Fantasy Quest RPG',
  'Space Pirates Tycoon',
  'Zombie Survival Wave Defense',
  'Racing League Championship',
  'Underwater Explorer Sim',
  'Sky Castle Adventure',
  'Haunted Hotel Experience',
  'Medieval Kingdom Builder',
  'Ninja Parkour Course',
  'Fishing Simulator Pro',
  'Mining Simulator 3D',
  'Superhero Training Obby',
  'Monster Catching Simulator',
  'Battle Royale: Island Map',
  'Car Dealer Tycoon',
  'Military Base Simulator',
];

const CONTENT_TITLES = [
  'R15 Ninja Character Rig',
  'Roblox Studio UI Kit v2',
  'Lua Script: Pet Follow System',
  'Low-Poly Roblox Town Map',
  'Katana Mesh Pack for Studio',
  'R6 Walk Animation Override',
  'Roblox Game Pass Shop GUI',
  'Neon Cyberpunk Decal Set',
  'Anime Hair Accessory Bundle',
  'Roblox Tycoon Dropper Kit',
  'Studio Terrain: Fantasy Island',
  'Obby Checkpoint System Script',
  'Roblox Battle Royale Map',
  'Custom Emote Animation Pack',
  'Horror Ambience Sound Pack',
  'Roblox Cafe Interior Map',
  'Smooth Dance Animation R15',
  'Leaderstats & Data Save Script',
  'Roblox Vehicle Chassis Kit',
  'Victory Sound FX Collection',
  'Dungeon Map Tileset Pack',
  'City Block Environment Pack',
  'Space Station Interior Map',
  'Medieval Castle Map Assets',
  'Tropical Island Terrain Kit',
  'Winter Wonderland Map Pack',
  'Industrial Factory Map',
  'School Building Interior',
  'Hospital Environment Kit',
  'Airport Terminal Map',
  'Shopping Mall Interior Pack',
  'Stadium Environment Assets',
  'Zombie Spawn Trigger Script',
  'Pet Evolution GUI System',
  'Custom Inventory UI Pack',
  'NPC Dialogue System Script',
  'Day/Night Cycle Module',
  'Weather System Lua Script',
  'Leaderboard GUI Template',
  'Trading System Script Module',
  'Lava Floor Effect Script',
  'Portal Teleport System',
  'Tycoon Money Dropper Script',
  'Sword Combat Animation Pack',
  'Shield Block Animation Set',
  'Magic Spell VFX Pack',
  'Running Parkour Animation',
  'Swimming Animation Override',
  'Sitting/Idle Animation Pack',
  'Wings Accessory Mesh Kit',
];

const GAME_DESCRIPTIONS = [
  'Built in Roblox Studio with custom Lua scripts and smooth gameplay. Try it out!',
  'A Roblox experience with rebirth system, pets, and leaderboards. Generated with Kami AI.',
  'Full Roblox obby with 100 stages, checkpoints, and kill parts. Lua-powered!',
  'Roblox tycoon with droppers, conveyors, and upgrades. Created in Roblox Studio.',
  'Multiplayer Roblox game with custom GUI, data saving, and trading system.',
  'Roblox simulator with auto-collect, pet hatching, and daily quests. Made with Kami.',
  'Complete Roblox experience — published to Roblox with game passes and dev products.',
  'Open-world Roblox RPG with quests, inventory system, and NPC dialogue. Lua scripted.',
  'Roblox horror game with jump scares, darkness mechanics, and chapter progression.',
  'Tower defense with 20 waves, multiple unit types, and upgrade paths. Lua scripted.',
  'Racing game with custom vehicle physics, lap tracking, and leaderboard. Roblox Studio.',
  'Roblox survival game — collect resources, craft tools, build shelter. Fully scripted.',
  'RPG experience with class system, skills, and dungeon boss encounters in Roblox.',
  'Parkour game with timer system, ghost replays, and leaderboard. Smooth Roblox controls.',
  'Simulator with prestige system, 50 upgrades, and pet companions. Roblox Studio build.',
];

const CONTENT_DESCRIPTIONS = [
  'Ready-to-import .rbxm assets for Roblox Studio. Drag and drop into your place!',
  'Optimized MeshParts for low-poly Roblox builds. Under 500 parts total.',
  'Plug-and-play Lua module for Roblox Studio. Works with R15 and R6 rigs.',
  'Professional Roblox Studio GUI templates. Customize colors and layout easily.',
  'High-quality Roblox animations tested on R15 rig. Smooth 30 FPS.',
  'Created with Kami AI and polished in Roblox Studio. Free to use in your game!',
  'Full environment kit — terrain, props, lighting setup. Drop into any Roblox place.',
  'Modular map tiles — mix and match to build unique Roblox worlds fast.',
  'Script module with full documentation. Easy to integrate into any Roblox game.',
  'Tested on 50+ active players. No lag, optimized for Roblox performance limits.',
  'UGC-ready mesh with LODs. Under 2K triangles, Roblox upload compliant.',
  'Animation set tested across R15 rigs. Smooth blending and IK support.',
];

const GAME_TAGS = ['obby', 'tycoon', 'simulator', 'adventure', 'survival', 'racing', 'rpg', 'puzzle', 'horror', 'fighting', 'fps'];
const CONTENT_TAGS = ['characters', 'maps', 'ui', 'animations', 'audio', 'decals', 'gamepasses', 'textures', 'scripts', 'meshes', 'gui', 'terrain'];

const CONTENT_CATEGORIES = [
  'map', 'script', 'ui', 'character', 'animation', 'audio', 'decal_texture',
  'building', 'weapon', 'vehicle', 'game_system',
];

const COMMENTS = [
  'Imported into Roblox Studio, works perfectly!',
  'How did you make this in Kami? Tutorial please!',
  'Love the Lua scripts, very clean code',
  'Downloaded the .rbxm, using it in my Roblox game!',
  'Super clean GUI design, fits my Roblox game perfectly',
  'This is exactly what I needed for my obby!',
  'Wow, the MeshParts look amazing in Studio',
  'Can you make a tycoon version of this?',
  'Been looking for a good pet system script for weeks',
  'The R15 animations are so smooth!',
  'My favorite Roblox creation on the platform',
  'This inspired me to start building in Studio too',
  'Perfect for my new Roblox tycoon, thanks!',
  'The walk animation works great on R15 rig',
  'Great concept, the Lua code is well-structured',
  'Keep making Roblox content, you\'re amazing!',
  'This deserves way more likes, great Studio work',
  'Shared this with my Roblox dev team',
  'How many parts does this have? Runs smooth!',
  'Works in my Roblox game, no lag at all!',
  'Any plans for a Roblox Studio update?',
  'Best Roblox asset I\'ve seen this week',
  'Really professional, looks like a real Roblox game',
  'The sound effects fit my Roblox horror game perfectly',
  'Can you share the Lua source code?',
  'Bro this map is insane, how long did it take?',
  'Used this in my game, players love it!',
  'Clean hitbox, no lag, 10/10 from me',
  'The terrain blending is chef\'s kiss 👌',
  'Finally a good dropper kit that actually works',
  'Just what my roleplay game needed, tysm!',
  'Lowpoly style is so underrated, love this',
  'NPC dialogue works out of the box, no bugs',
  'Added to my game last night, already 500 visits!',
  'The lighting setup is incredible in this map',
  'W creator, always delivers quality content',
  'This script saved me like 3 weeks of work fr',
  'The mesh is under 500 tris, perfect for mobile!',
  'How did you get the terrain to look so natural?',
  'Checkpoint system is super clean, no exploits',
  'My whole dev team is using this now lol',
  'Free AND this quality? You\'re crazy bro',
  'Tested on 50 players, zero desync issues',
  'Bro dropped another banger fr fr',
  'The UI scales perfectly on mobile too',
  'I\'ve been looking for exactly this for my RP game',
  'Saw this trending, downloaded instantly',
  'Please make a sequel or expanded version!',
  'The color palette is so satisfying in Studio',
  'Collision boxes are perfect, no clipping at all',
  'What model/tool did you use to generate this?',
  'This is better than half the stuff on the toolbox',
  'Just showed this to my dev friends, they loved it',
  'The animation loops perfectly, no jitter',
  'Can this run on a low-end PC Roblox client?',
  'Added the sound pack to my horror game, so good',
  'The GUI adapts to screen size perfectly',
  'This should be on the front page honestly',
  'The vehicle physics feel super realistic',
  'First time trying Kami generated content, impressed!',
];

// Roblox preview images — CDN thumbnails from popular games
const ROBLOX_PREVIEW_IMAGES = [
  'https://tr.rbxcdn.com/180DAY-ac1c764a99cfae201fd4fe916170a218/512/512/Image/Png/noFilter',
  'https://t7.rbxcdn.com/180DAY-dde6e11e92c0fe4e2179eb39843d0ec4',
  'https://t0.rbxcdn.com/180DAY-043d0624ed9f1c7e2c4f4c332f820ee8',
  'https://t4.rbxcdn.com/180DAY-3acb0f0da8433cb97bb84fe70301c78f',
  'https://t3.rbxcdn.com/180DAY-2556ccf774bda999220460aeda22dba8',
  'https://t2.rbxcdn.com/180DAY-592cff9498813006ee393de00fa697c4',
  'https://t2.rbxcdn.com/180DAY-c241e6748c4c05ea93e73916de6c0cec',
  'https://t5.rbxcdn.com/180DAY-99438a69716f3c7a4334b1d1bd26267d',
  'https://t3.rbxcdn.com/180DAY-2c1129a448e74940038294483f07d5a6',
  'https://t6.rbxcdn.com/180DAY-cc85115bb7b1a4f5a82e977de51e9c53',
  'https://t4.rbxcdn.com/180DAY-4fb716609029d3b8f6ffed5c338c713c',
  'https://t0.rbxcdn.com/180DAY-994fed900712b1e05ed1a221490df5e5',
  'https://t5.rbxcdn.com/180DAY-c239841c976f825fcf18284efdd1955a',
  'https://t7.rbxcdn.com/180DAY-57443971b3b446cb6440e98718617428',
  'https://t0.rbxcdn.com/180DAY-3ee43b8811a96790abd50ff0ada3c6de',
  'https://t6.rbxcdn.com/180DAY-3de571ed1175636497776c44426b9765',
  'https://t2.rbxcdn.com/180DAY-67b2be37ae31be00ab1319901b9d8347',
  'https://t1.rbxcdn.com/180DAY-5122734d944cbdf2dd3799d142e6ec9e',
];

// ---------- Build 100 bot profiles ----------

interface BotProfileDef {
  name: string;
  roblox: string;
  bio: string;
  headline: string;
  email: string;
}

function buildBotProfiles(): BotProfileDef[] {
  const profiles: BotProfileDef[] = [];
  for (let i = 0; i < 100; i++) {
    const baseName = USERNAMES[i % USERNAMES.length];
    const suffix = i < USERNAMES.length ? '' : ROBLOX_SUFFIXES[Math.floor(i / USERNAMES.length) % ROBLOX_SUFFIXES.length];
    const name = `${baseName}${suffix}`;
    const roblox = `${name.replace(/[^a-zA-Z0-9_]/g, '_')}`;
    const emailDomain = EMAIL_DOMAINS[i % EMAIL_DOMAINS.length];
    profiles.push({
      name,
      roblox,
      bio: BIOS[i % BIOS.length],
      headline: HEADLINES[i % HEADLINES.length],
      email: `${name.toLowerCase().replace(/[^a-z0-9]/g, '.')}@${emailDomain}`,
    });
  }
  return profiles;
}

const BOT_PROFILES = buildBotProfiles();

// ---------- Seed Functions ----------

interface BotProfile {
  id: string;
  displayName: string;
  avatarUrl: string;
  robloxUsername: string;
  bio: string;
  headline: string;
}

async function seedProfiles(): Promise<BotProfile[]> {
  console.log('Creating 100 bot profiles...');
  const bots: BotProfile[] = [];
  let batch = db().batch();
  let opsInBatch = 0;

  for (let i = 0; i < BOT_PROFILES.length; i++) {
    const bp = BOT_PROFILES[i];
    const id = `bot_${String(i + 1).padStart(3, '0')}`;
    const avatarUrl = dicebearAvatar(bp.name);

    const profile = {
      id,
      email: bp.email,
      displayName: bp.name,
      avatarUrl,
      robloxUsername: bp.roblox,
      bio: bp.bio,
      createdAt: daysAgo(randomInt(30, 180)),
      followerCount: 0,
      followingCount: 0,
      publishedProjectCount: 0,
      savedCount: 0,
      totalLikes: 0,
      totalDownloads: 0,
      headline: bp.headline,
      badges: [],
      isBot: true,
    };

    batch.set(db().collection('socialProfiles').doc(id), profile);
    bots.push({ id, displayName: bp.name, avatarUrl, robloxUsername: bp.roblox, bio: bp.bio, headline: bp.headline });
    opsInBatch++;

    if (opsInBatch >= 490) {
      await batch.commit();
      batch = db().batch();
      opsInBatch = 0;
    }
  }

  if (opsInBatch > 0) await batch.commit();
  console.log(`  ✓ ${bots.length} profiles created`);
  return bots;
}

interface PostRecord {
  id: string;
  authorId: string;
  authorName: string;
}

async function seedPosts(bots: BotProfile[]): Promise<PostRecord[]> {
  console.log('Creating initial posts (3-4 per bot)...');
  const posts: PostRecord[] = [];
  let batch = db().batch();
  let opsInBatch = 0;
  let postIndex = 0;

  for (let i = 0; i < bots.length; i++) {
    const bot = bots[i];
    const numPosts = i < 20 ? 4 : 3; // first 20 bots get 4 posts, rest get 3

    for (let j = 0; j < numPosts; j++) {
      const postId = `seed_post_${String(++postIndex).padStart(4, '0')}`;
      const roll = Math.random();
      const projectKind = roll < 0.55 ? 'game' : roll < 0.85 ? 'content' : 'ugc';
      const isGame = projectKind === 'game';
      const contentType = isGame ? 'game' : 'content';

      const title = isGame ? pick(GAME_TITLES) : pick(CONTENT_TITLES);
      const description = isGame ? pick(GAME_DESCRIPTIONS) : pick(CONTENT_DESCRIPTIONS);
      const tags = isGame ? pickN(GAME_TAGS, randomInt(1, 3)) : pickN(CONTENT_TAGS, randomInt(1, 3));
      const category = isGame ? tags[0] : pick(CONTENT_CATEGORIES);

      const post = {
        id: postId,
        projectId: `proj_${postId}`,
        authorId: bot.id,
        authorName: bot.displayName,
        authorAvatarUrl: bot.avatarUrl,
        title,
        description,
        projectKind,
        contentType,
        category,
        tags,
        previewUrls: [
          ROBLOX_PREVIEW_IMAGES[postIndex % ROBLOX_PREVIEW_IMAGES.length],
          ROBLOX_PREVIEW_IMAGES[(postIndex + 7) % ROBLOX_PREVIEW_IMAGES.length],
        ],
        artifactSummary: `Generated ${projectKind} project with Kami AI`,
        moderationStatus: 'approved',
        publicationState: 'published',
        likes: 0,
        dislikes: 0,
        commentCount: 0,
        downloadCount: randomInt(0, 800),
        createdAt: daysAgo(randomInt(0, 60)),
        staffPick: postIndex <= 5,
        featured: postIndex <= 10,
      };

      batch.set(db().collection('socialPosts').doc(postId), post);
      posts.push({ id: postId, authorId: bot.id, authorName: bot.displayName });
      opsInBatch++;

      if (opsInBatch >= 490) {
        await batch.commit();
        batch = db().batch();
        opsInBatch = 0;
      }
    }
  }

  if (opsInBatch > 0) await batch.commit();
  console.log(`  ✓ ${posts.length} posts created`);
  return posts;
}

async function seedComments(bots: BotProfile[], posts: PostRecord[]): Promise<Map<string, number>> {
  console.log('Creating comments...');
  const commentCounts = new Map<string, number>();
  let totalComments = 0;
  let batch = db().batch();
  let opsInBatch = 0;

  for (const post of posts) {
    const numComments = randomInt(1, 6);
    commentCounts.set(post.id, numComments);
    const otherBots = bots.filter((b) => b.id !== post.authorId);

    for (let c = 0; c < numComments; c++) {
      const commenter = pick(otherBots);
      const commentId = `seed_comment_${String(++totalComments).padStart(5, '0')}`;

      const comment = {
        id: commentId,
        postId: post.id,
        authorId: commenter.id,
        authorName: commenter.displayName,
        content: pick(COMMENTS),
        likeCount: randomInt(0, 20),
        moderationStatus: 'approved',
        createdAt: daysAgo(randomInt(0, 58)),
      };

      batch.set(
        db().collection('socialPosts').doc(post.id).collection('comments').doc(commentId),
        comment,
      );
      opsInBatch++;

      if (opsInBatch >= 490) {
        await batch.commit();
        batch = db().batch();
        opsInBatch = 0;
      }
    }
  }

  // Update commentCount on each post
  for (const [postId, count] of commentCounts) {
    batch.update(db().collection('socialPosts').doc(postId), { commentCount: count });
    opsInBatch++;
    if (opsInBatch >= 490) {
      await batch.commit();
      batch = db().batch();
      opsInBatch = 0;
    }
  }

  if (opsInBatch > 0) await batch.commit();
  console.log(`  ✓ ${totalComments} comments across ${commentCounts.size} posts`);
  return commentCounts;
}

async function seedLikes(bots: BotProfile[], posts: PostRecord[]): Promise<void> {
  console.log('Creating likes...');
  const postLikes = new Map<string, number>();
  const botTotalLikes = new Map<string, number>();
  let totalLikes = 0;
  let batch = db().batch();
  let opsInBatch = 0;

  for (const post of posts) {
    const numLikers = randomInt(2, 20);
    const likers = pickN(
      bots.filter((b) => b.id !== post.authorId),
      Math.min(numLikers, bots.length - 1),
    );

    postLikes.set(post.id, likers.length);
    botTotalLikes.set(post.authorId, (botTotalLikes.get(post.authorId) || 0) + likers.length);
    totalLikes += likers.length;

    for (const liker of likers) {
      batch.set(
        db().collection('socialProfiles').doc(liker.id).collection('likes').doc(post.id),
        { createdAt: daysAgo(randomInt(0, 58)) },
      );
      opsInBatch++;

      if (opsInBatch >= 490) {
        await batch.commit();
        batch = db().batch();
        opsInBatch = 0;
      }
    }
  }

  for (const [postId, count] of postLikes) {
    batch.update(db().collection('socialPosts').doc(postId), { likes: count });
    opsInBatch++;
    if (opsInBatch >= 490) {
      await batch.commit();
      batch = db().batch();
      opsInBatch = 0;
    }
  }

  for (const [botId, count] of botTotalLikes) {
    batch.update(db().collection('socialProfiles').doc(botId), { totalLikes: count });
    opsInBatch++;
    if (opsInBatch >= 490) {
      await batch.commit();
      batch = db().batch();
      opsInBatch = 0;
    }
  }

  if (opsInBatch > 0) await batch.commit();
  console.log(`  ✓ ${totalLikes} likes created`);
}

async function seedFollows(bots: BotProfile[]): Promise<void> {
  console.log('Creating follow relationships...');
  const followerCounts = new Map<string, number>();
  const followingCounts = new Map<string, number>();
  let totalFollows = 0;
  let batch = db().batch();
  let opsInBatch = 0;

  for (const bot of bots) {
    const numFollowing = randomInt(3, 10);
    const targets = pickN(
      bots.filter((b) => b.id !== bot.id),
      numFollowing,
    );

    followingCounts.set(bot.id, targets.length);

    for (const target of targets) {
      followerCounts.set(target.id, (followerCounts.get(target.id) || 0) + 1);
      totalFollows++;

      batch.set(
        db().collection('socialProfiles').doc(bot.id).collection('following').doc(target.id),
        { createdAt: daysAgo(randomInt(1, 60)) },
      );
      opsInBatch++;

      if (opsInBatch >= 490) {
        await batch.commit();
        batch = db().batch();
        opsInBatch = 0;
      }
    }
  }

  for (const bot of bots) {
    const fc = followerCounts.get(bot.id) || 0;
    const fgc = followingCounts.get(bot.id) || 0;
    batch.update(db().collection('socialProfiles').doc(bot.id), {
      followerCount: fc,
      followingCount: fgc,
    });
    opsInBatch++;
    if (opsInBatch >= 490) {
      await batch.commit();
      batch = db().batch();
      opsInBatch = 0;
    }
  }

  if (opsInBatch > 0) await batch.commit();
  console.log(`  ✓ ${totalFollows} follow relationships`);
}

async function updatePostCounts(bots: BotProfile[], posts: PostRecord[]): Promise<void> {
  console.log('Updating profile post counts and download totals...');
  const postCountByBot = new Map<string, number>();
  const downloadsByBot = new Map<string, number>();

  for (const post of posts) {
    postCountByBot.set(post.authorId, (postCountByBot.get(post.authorId) || 0) + 1);
  }

  // Read download counts in batches of 30 to avoid overloading
  for (let i = 0; i < posts.length; i += 30) {
    const slice = posts.slice(i, i + 30);
    const docs = await Promise.all(slice.map((p) => db().collection('socialPosts').doc(p.id).get()));
    for (let j = 0; j < docs.length; j++) {
      const data = docs[j].data();
      if (data) {
        downloadsByBot.set(
          slice[j].authorId,
          (downloadsByBot.get(slice[j].authorId) || 0) + (data.downloadCount || 0),
        );
      }
    }
  }

  let batch = db().batch();
  let opsInBatch = 0;
  for (const bot of bots) {
    batch.update(db().collection('socialProfiles').doc(bot.id), {
      publishedProjectCount: postCountByBot.get(bot.id) || 0,
      totalDownloads: downloadsByBot.get(bot.id) || 0,
    });
    opsInBatch++;
    if (opsInBatch >= 490) {
      await batch.commit();
      batch = db().batch();
      opsInBatch = 0;
    }
  }
  if (opsInBatch > 0) await batch.commit();
  console.log('  ✓ Profile counts updated');
}

// ---------- Main ----------

async function cleanupOldSeedData(): Promise<void> {
  console.log('Cleaning up old seed data...');

  const postsSnap = await db().collection('socialPosts')
    .where('id', '>=', 'seed_post_')
    .where('id', '<', 'seed_post_\uf8ff')
    .get();

  for (const doc of postsSnap.docs) {
    const commentsSnap = await doc.ref.collection('comments').get();
    const batch = db().batch();
    commentsSnap.docs.forEach((c) => batch.delete(c.ref));
    batch.delete(doc.ref);
    await batch.commit();
  }
  console.log(`  ✓ Deleted ${postsSnap.size} old posts`);

  const profilesSnap = await db().collection('socialProfiles')
    .where('id', '>=', 'bot_')
    .where('id', '<', 'bot_\uf8ff')
    .get();

  for (const doc of profilesSnap.docs) {
    for (const sub of ['likes', 'dislikes', 'savedPosts', 'following']) {
      const subSnap = await doc.ref.collection(sub).get();
      if (subSnap.size > 0) {
        const batch = db().batch();
        subSnap.docs.forEach((s) => batch.delete(s.ref));
        await batch.commit();
      }
    }
    await doc.ref.delete();
  }
  console.log(`  ✓ Deleted ${profilesSnap.size} old profiles`);
}

/**
 * Exported entrypoint — usable both from CLI and from Cloud Functions.
 * Returns counts of created entities.
 */
export async function seedSocialData(): Promise<{
  profiles: number;
  posts: number;
}> {
  console.log('=== Kami Social Feed Seed Script ===\n');

  await cleanupOldSeedData();

  const bots = await seedProfiles();
  const posts = await seedPosts(bots);
  await seedComments(bots, posts);
  await seedLikes(bots, posts);
  await seedFollows(bots);
  await updatePostCounts(bots, posts);

  console.log('\n=== Done! Seed data created successfully ===');
  console.log(`  Profiles: ${bots.length}`);
  console.log(`  Posts: ${posts.length}`);
  console.log('  + comments, likes, follows\n');

  return { profiles: bots.length, posts: posts.length };
}

// CLI entrypoint — only runs when executed directly, not when imported.
// Detects "node dist/seedSocialData.js" execution and initializes Firebase Admin.
const isCli =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  (process.argv[1].endsWith('seedSocialData.js') || process.argv[1].endsWith('seedSocialData.ts'));

if (isCli) {
  if (getApps().length === 0) {
    initializeApp({ credential: applicationDefault() });
  }
  seedSocialData()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}
