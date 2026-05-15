/**
 * Daily Social Activity Simulator
 *
 * Simulates realistic Roblox community activity for bot users:
 * - 5–10 new posts per user per day (Fal AI generated images)
 * - 3–8 comments per user on random posts
 * - 5–15 likes per user on random posts
 * - 2–5 download increments per user
 *
 * Called by the Firebase scheduled function `runDailySimulation`
 * or manually via POST /api/admin/simulate-day.
 */

import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { FAL_API_KEY, OPENAI_API_KEY } from './config.js';

// Lazy getter — avoids calling getFirestore() at module load time before initializeApp()
function db() {
  return getFirestore();
}

// ---------- Types ----------

interface BotUser {
  id: string;
  displayName: string;
  avatarUrl: string;
}

interface PostStub {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl: string;
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

/**
 * Run async tasks with a concurrency limit (worker pool).
 * Results are returned in the same order as `items`.
 */
async function processWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Realistic timestamp within past 24 h, weighted towards peak hours
 * (15:00-19:00 after school and 20:00-23:00 evening).
 */
function recentTimestamp(): string {
  const now = Date.now();
  // 70% chance within last 12 hours, 30% chance 12-24 hours ago
  const hoursAgo = Math.random() < 0.7 ? randomInt(0, 12) : randomInt(12, 24);
  const d = new Date(now - hoursAgo * 3600 * 1000);
  // Jitter by random minutes
  d.setMinutes(randomInt(0, 59));
  d.setSeconds(randomInt(0, 59));
  return d.toISOString();
}

// ---------- Content Data ----------

// Fal AI prompt templates per content category
const FAL_PROMPT_TEMPLATES: Record<string, string[]> = {
  map: [
    'roblox studio map screenshot, colorful {biome} environment, isometric view, blocky low-poly style, game asset, bright lighting',
    'top-down view of roblox {biome} map, vibrant colors, detailed terrain, roblox studio style, professional game asset',
    'roblox adventure map, {biome} theme, detailed props, smooth terrain, studio lighting, blocky art style',
    'roblox game map design, {biome} setting, modular tiles, low poly, bright saturated colors, game-ready asset',
  ],
  game: [
    'roblox game thumbnail, {genre} game, cartoon style, vibrant colors, 3-4 blocky roblox characters, epic pose, clean background',
    'roblox {genre} game cover art, professional thumbnail, bright colors, action scene, roblox characters, studio quality',
    'roblox game promotional banner, {genre} genre, cartoon characters, neon accents, dynamic composition',
  ],
  ui: [
    'roblox game UI design mockup, {theme} theme, rounded buttons, health bar HUD, inventory slots, dark background, clean modern style',
    'roblox game interface screenshot, {theme} themed GUI, shop menu, currency display, rounded cards, bright icons',
    'roblox HUD design, {theme} color scheme, minimal clean layout, health and stamina bars, skill icons',
  ],
  character: [
    'roblox {style} character design, blocky proportions, colorful outfit, white background, avatar portrait, game art',
    'custom roblox avatar, {style} theme, detailed accessories, hero pose, transparent background, cartoon style',
    'roblox UGC character, {style} aesthetic, full body view, studio lighting, vibrant colors',
  ],
  texture: [
    'seamless {material} texture for roblox studio, tileable, high contrast, game-ready, 512x512',
    'roblox decal texture, {material} surface, clean edges, bright colors, transparent background, game asset',
    'roblox studio texture pack, {material} theme, 4 variations, seamless tiling, vibrant and clear',
  ],
};

const BIOMES = ['jungle', 'desert', 'arctic', 'underwater', 'volcano', 'sky island', 'haunted forest', 'medieval castle', 'futuristic city', 'pirate cove', 'space station', 'neon cyberpunk'];
const GENRES = ['tycoon', 'obby', 'simulator', 'horror', 'racing', 'rpg', 'tower defense', 'battle royale', 'survival', 'parkour', 'fighting', 'adventure'];
const THEMES = ['dark', 'neon', 'nature', 'fire', 'ice', 'space', 'medieval', 'futuristic', 'pastel', 'pirate'];
const CHAR_STYLES = ['ninja', 'knight', 'wizard', 'robot', 'alien', 'pirate', 'samurai', 'superhero', 'vampire', 'scientist'];
const MATERIALS = ['brick', 'wood', 'stone', 'metal', 'grass', 'sand', 'ice', 'lava', 'neon grid', 'jungle foliage'];

const CATEGORY_WEIGHTS: Array<[string, number]> = [
  ['map', 35],
  ['game', 25],
  ['ui', 20],
  ['character', 10],
  ['texture', 10],
];

const GAME_TITLES = [
  'Blox Fruits Training Obby', 'Pet Simulator X: Reborn', 'Brookhaven RP Remake',
  'Adopt Me Tycoon Edition', 'Tower Defense Simulator Pro', 'Murder Mystery: Neon Map',
  'Roblox Obby: 100 Stages', 'Anime Battlegrounds Simulator', 'Natural Disaster Survival 2',
  'Jailbreak City Tycoon', 'Bee Swarm Simulator Clone', 'Piggy: Chapter 13 Fan Game',
  'Arsenal Training Obby', 'Doors Horror Experience', 'King Legacy Simulator',
  'Build A Boat Tycoon', 'Ninja Legends Obby', 'Mega Noob Simulator',
  'Brookhaven Hospital RP', 'Anime Tycoon: Shindo Life', 'Toilet Tower Defense',
  'Speed Run Obby 4', 'Strongman Simulator Rebirth', 'Island Royale Battle',
  'Vehicle Simulator Deluxe', 'Blade Ball Training Arena', 'Volcano Escape Obby',
  'MM2 Trading Hub', 'Theme Park Tycoon', 'Elemental Battlegrounds',
  'Dragon Ball Z Simulator', 'One Piece Adventure RP', 'Scary Maze: Roblox Edition',
  'Clicker Champion Simulator', 'Fantasy Quest RPG', 'Space Pirates Tycoon',
  'Zombie Survival Defense', 'Racing League Championship', 'Underwater Explorer Sim',
  'Sky Castle Adventure', 'Haunted Hotel Experience', 'Medieval Kingdom Builder',
  'Ninja Parkour Course', 'Fishing Simulator Pro', 'Mining Simulator 3D',
  'Superhero Training Obby', 'Monster Catching Simulator', 'Battle Royale: Island Map',
  'Car Dealer Tycoon', 'Military Base Simulator',
];

const CONTENT_TITLES = [
  'R15 Ninja Character Rig', 'Roblox Studio UI Kit v2', 'Lua Script: Pet Follow System',
  'Low-Poly Roblox Town Map', 'Katana Mesh Pack for Studio', 'R6 Walk Animation Override',
  'Roblox Game Pass Shop GUI', 'Neon Cyberpunk Decal Set', 'Anime Hair Accessory Bundle',
  'Roblox Tycoon Dropper Kit', 'Studio Terrain: Fantasy Island', 'Obby Checkpoint System Script',
  'Roblox Battle Royale Map', 'Custom Emote Animation Pack', 'Horror Ambience Sound Pack',
  'Roblox Cafe Interior Map', 'Smooth Dance Animation R15', 'Leaderstats & Data Save Script',
  'Roblox Vehicle Chassis Kit', 'Victory Sound FX Collection', 'Dungeon Map Tileset Pack',
  'City Block Environment Pack', 'Space Station Interior Map', 'Medieval Castle Map Assets',
  'Tropical Island Terrain Kit', 'Winter Wonderland Map Pack', 'Industrial Factory Map',
  'NPC Dialogue System Script', 'Day/Night Cycle Module', 'Trading System Script Module',
  'Portal Teleport System', 'Sword Combat Animation Pack', 'Magic Spell VFX Pack',
  'Running Parkour Animation', 'Tycoon Money Dropper Script', 'Custom Inventory UI Pack',
];

const GAME_DESCRIPTIONS = [
  'Built in Roblox Studio with custom Lua scripts and smooth gameplay. Try it out!',
  'A Roblox experience with rebirth system, pets, and leaderboards. Generated with Kami AI.',
  'Full Roblox obby with 100 stages, checkpoints, and kill parts. Lua-powered!',
  'Roblox tycoon with droppers, conveyors, and upgrades. Created in Roblox Studio.',
  'Multiplayer Roblox game with custom GUI, data saving, and trading system.',
  'Roblox simulator with auto-collect, pet hatching, and daily quests. Made with Kami.',
  'Complete Roblox experience — published with game passes and dev products.',
  'Open-world Roblox RPG with quests, inventory system, and NPC dialogue. Lua scripted.',
  'Roblox horror game with jump scares, darkness mechanics, and chapter progression.',
  'Tower defense with 20 waves, multiple unit types, and upgrade paths. Fully scripted.',
  'Racing game with custom vehicle physics, lap tracking, and leaderboard.',
  'Roblox survival game — collect resources, craft tools, build shelter.',
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
];

const COMMENTS = [
  'Imported into Roblox Studio, works perfectly!',
  'How did you make this in Kami? Tutorial please!',
  'Love the Lua scripts, very clean code',
  'Downloaded the .rbxm, using it in my Roblox game!',
  'Super clean GUI design, fits my game perfectly',
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
  'The sound effects fit my horror game perfectly',
  'Can you share the Lua source code?',
  'Bro this map is insane, how long did it take?',
  'Used this in my game, players love it!',
  'Clean hitbox, no lag, 10/10 from me',
  'The terrain blending is chef\'s kiss',
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
  'My whole dev team is using this now',
  'Free AND this quality? You\'re crazy bro',
  'Tested on 50 players, zero desync issues',
  'Please make a sequel or expanded version!',
  'The color palette is so satisfying in Studio',
  'Collision boxes are perfect, no clipping at all',
  'This is better than half the stuff on the toolbox',
  'Just showed this to my dev friends, they loved it',
  'The animation loops perfectly, no jitter',
  'The GUI adapts to screen size perfectly',
  'This should be on the front page honestly',
  'The vehicle physics feel super realistic',
  'First time trying Kami generated content, impressed!',
  'Bro dropped another banger fr fr',
  'W asset, downloading for my next project',
  'The UI scales perfectly on mobile too',
  'I\'ve been looking for exactly this for my RP game',
  'Saw this trending, downloaded instantly',
  'The day/night cycle module is insane quality',
  'I can\'t believe this is free, massive W',
];

const GAME_TAGS = ['obby', 'tycoon', 'simulator', 'adventure', 'survival', 'racing', 'rpg', 'puzzle', 'horror', 'fighting'];
const CONTENT_TAGS = ['characters', 'maps', 'ui', 'animations', 'audio', 'decals', 'textures', 'scripts', 'meshes', 'terrain'];

// ---------- Weighted category picker ----------

function pickCategory(): string {
  const total = CATEGORY_WEIGHTS.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [cat, weight] of CATEGORY_WEIGHTS) {
    r -= weight;
    if (r <= 0) return cat;
  }
  return CATEGORY_WEIGHTS[0][0];
}

// ---------- Image generation via Fal AI ----------

async function generateFalImage(category: string): Promise<string | null> {
  const apiKey = FAL_API_KEY.value();
  if (!apiKey) {
    logger.warn('FAL_API_KEY not set — skipping image generation');
    return null;
  }

  // Build prompt based on category
  let prompt: string;
  const templates = FAL_PROMPT_TEMPLATES[category] ?? FAL_PROMPT_TEMPLATES['map'];
  const template = pick(templates);

  prompt = template
    .replace('{biome}', pick(BIOMES))
    .replace('{genre}', pick(GENRES))
    .replace('{theme}', pick(THEMES))
    .replace('{style}', pick(CHAR_STYLES))
    .replace('{material}', pick(MATERIALS));

  try {
    const response = await fetch('https://fal.run/fal-ai/flux/schnell', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Key ${apiKey}`,
      },
      body: JSON.stringify({
        prompt,
        image_size: 'square_hd',
        num_inference_steps: 4,
        num_images: 1,
      }),
    });

    if (!response.ok) {
      logger.warn(`Fal AI image generation failed: ${response.status}`);
      return null;
    }

    const data = await response.json() as { images?: Array<{ url: string }> };
    return data.images?.[0]?.url ?? null;
  } catch (err) {
    logger.warn('Fal AI image generation error', err);
    return null;
  }
}

// Fallback CDN images for when Fal AI is unavailable
const FALLBACK_IMAGES = [
  'https://tr.rbxcdn.com/180DAY-ac1c764a99cfae201fd4fe916170a218/512/512/Image/Png/noFilter',
  'https://t7.rbxcdn.com/180DAY-dde6e11e92c0fe4e2179eb39843d0ec4',
  'https://t0.rbxcdn.com/180DAY-043d0624ed9f1c7e2c4f4c332f820ee8',
  'https://t4.rbxcdn.com/180DAY-3acb0f0da8433cb97bb84fe70301c78f',
  'https://t3.rbxcdn.com/180DAY-2556ccf774bda999220460aeda22dba8',
  'https://t2.rbxcdn.com/180DAY-592cff9498813006ee393de00fa697c4',
  'https://t2.rbxcdn.com/180DAY-c241e6748c4c05ea93e73916de6c0cec',
  'https://t5.rbxcdn.com/180DAY-99438a69716f3c7a4334b1d1bd26267d',
];

// ---------- Text generation via OpenAI ----------

interface PostMeta {
  title: string;
  description: string;
  tags: string[];
}

async function generatePostMeta(category: string, isGame: boolean): Promise<PostMeta> {
  const apiKey = OPENAI_API_KEY.value();

  if (apiKey) {
    try {
      const categoryLabel = category === 'map' ? 'map/environment'
        : category === 'ui' ? 'UI/interface'
        : category === 'character' ? 'character/avatar'
        : category === 'texture' ? 'decal/texture'
        : 'game';

      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-5.4-mini',
          input: `You are a Roblox creator sharing work on a community platform. Generate a short post title (max 8 words) and description (1-2 sentences, max 120 chars) for a Roblox ${categoryLabel} asset. Sound casual and enthusiastic like a real Roblox dev. Reply as JSON: {"title":"...","description":"..."}`,
        }),
      });

      if (response.ok) {
        const data = await response.json() as { output_text?: string };
        const text = data.output_text ?? '';
        const match = text.match(/\{[\s\S]*?\}/);
        if (match) {
          const parsed = JSON.parse(match[0]) as { title?: string; description?: string };
          if (parsed.title && parsed.description) {
            const tags = isGame ? pickN(GAME_TAGS, randomInt(1, 3)) : pickN(CONTENT_TAGS, randomInt(1, 3));
            return { title: parsed.title, description: parsed.description, tags };
          }
        }
      }
    } catch {
      // fall through to static data
    }
  }

  // Fallback to static pools
  const title = isGame ? pick(GAME_TITLES) : pick(CONTENT_TITLES);
  const description = isGame ? pick(GAME_DESCRIPTIONS) : pick(CONTENT_DESCRIPTIONS);
  const tags = isGame ? pickN(GAME_TAGS, randomInt(1, 3)) : pickN(CONTENT_TAGS, randomInt(1, 3));
  return { title, description, tags };
}

// ---------- Core simulation functions ----------

async function loadBotUsers(): Promise<BotUser[]> {
  const snap = await db().collection('socialProfiles')
    .where('isBot', '==', true)
    .get();

  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      displayName: data.displayName as string,
      avatarUrl: data.avatarUrl as string,
    };
  });
}

async function loadRecentPosts(limit = 500): Promise<PostStub[]> {
  const snap = await db().collection('socialPosts')
    .where('publicationState', '==', 'published')
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();

  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      authorId: data.authorId as string,
      authorName: data.authorName as string,
      authorAvatarUrl: data.authorAvatarUrl as string,
    };
  });
}

interface PostJob {
  user: BotUser;
  jobIndex: number;
}

/**
 * Pure builder — generates a post object (including Fal AI image + metadata).
 * Does NOT write to Firestore. Safe to call in parallel.
 */
async function buildPost(job: PostJob): Promise<Record<string, unknown> & { id: string; authorId: string }> {
  const { user, jobIndex } = job;
  const category = pickCategory();
  const isGame = category === 'game';
  const projectKind = isGame ? 'game' : category === 'character' ? 'ugc' : 'content';
  const contentType = isGame ? 'game' : 'content';

  // Run Fal AI image + OpenAI metadata in parallel for each post
  // Only ~50% of posts use Fal AI to cut costs; rest fall back to CDN images
  const useFalImage = Math.random() < 0.5;
  const [falImageUrl, meta] = await Promise.all([
    useFalImage ? generateFalImage(category) : Promise.resolve(null),
    generatePostMeta(category, isGame),
  ]);

  const primaryImage = falImageUrl ?? pick(FALLBACK_IMAGES);
  const secondaryImage = pick(FALLBACK_IMAGES);

  const postId = `sim_post_${Date.now()}_${jobIndex}_${Math.random().toString(36).slice(2, 7)}`;
  return {
    id: postId,
    projectId: `proj_${postId}`,
    authorId: user.id,
    authorName: user.displayName,
    authorAvatarUrl: user.avatarUrl,
    title: meta.title,
    description: meta.description,
    projectKind,
    contentType,
    category,
    tags: meta.tags,
    previewUrls: [primaryImage, secondaryImage],
    artifactSummary: `AI-generated ${category} project`,
    moderationStatus: 'approved',
    publicationState: 'published',
    likes: 0,
    dislikes: 0,
    commentCount: 0,
    downloadCount: randomInt(0, 50),
    createdAt: recentTimestamp(),
    staffPick: false,
    featured: false,
  };
}

/** Batch-write a pre-built list of posts to Firestore. */
async function writePostsBatch(posts: Array<Record<string, unknown> & { id: string }>): Promise<void> {
  let batch = db().batch();
  let opsInBatch = 0;

  for (const post of posts) {
    batch.set(db().collection('socialPosts').doc(post.id), post);
    opsInBatch++;
    if (opsInBatch >= 490) {
      await batch.commit();
      batch = db().batch();
      opsInBatch = 0;
    }
  }

  if (opsInBatch > 0) await batch.commit();
}

/**
 * Generate a fresh pool of ~200 varied comments via OpenAI gpt-5.4-mini.
 * Single batched call (~$0.0005 total) — gives daily variety while keeping cost negligible.
 * Falls back to the static COMMENTS array on any failure.
 */
async function generateCommentPool(): Promise<string[]> {
  const apiKey = OPENAI_API_KEY.value();
  if (!apiKey) return COMMENTS;

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-5.4-mini',
        input: `Generate 200 short, realistic comments that Roblox creators leave on each other's projects in a community feed. Mix sentiments: ~60% positive (praise, hype, emojis), ~25% questions (how-to, tools, asking for tutorial), ~15% feedback/suggestions. Keep each comment under 100 characters. Use casual, slightly slangy Roblox-dev voice. Reply ONLY as a JSON array of 200 strings, no other text. Example: ["bro this map is fire 🔥","how did you make the lighting so smooth?","clean code, used it in my tycoon!"]`,
      }),
    });

    if (!response.ok) return COMMENTS;
    const data = await response.json() as { output_text?: string };
    const text = data.output_text ?? '';
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return COMMENTS;
    const parsed = JSON.parse(match[0]) as unknown;
    if (!Array.isArray(parsed)) return COMMENTS;
    const cleaned = parsed
      .filter((s): s is string => typeof s === 'string' && s.length > 0 && s.length <= 200)
      .map((s) => s.trim());
    if (cleaned.length < 20) return COMMENTS;
    logger.info(`LLM comment pool generated: ${cleaned.length} comments`);
    return cleaned;
  } catch (err) {
    logger.warn('generateCommentPool failed, using static fallback', err);
    return COMMENTS;
  }
}

async function simulateComments(users: BotUser[], posts: PostStub[]): Promise<void> {
  const commentPool = await generateCommentPool();
  const commentCounts = new Map<string, number>();
  let batch = db().batch();
  let opsInBatch = 0;
  let total = 0;

  for (const user of users) {
    const numComments = randomInt(3, 8);
    const targets = pickN(
      posts.filter((p) => p.authorId !== user.id),
      Math.min(numComments, posts.length),
    );

    for (const post of targets) {
      const commentId = `sim_comment_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      batch.set(
        db().collection('socialPosts').doc(post.id).collection('comments').doc(commentId),
        {
          id: commentId,
          postId: post.id,
          authorId: user.id,
          authorName: user.displayName,
          content: pick(commentPool),
          likeCount: randomInt(0, 10),
          moderationStatus: 'approved',
          createdAt: recentTimestamp(),
        },
      );
      commentCounts.set(post.id, (commentCounts.get(post.id) ?? 0) + 1);
      total++;
      opsInBatch++;

      if (opsInBatch >= 490) {
        await batch.commit();
        batch = db().batch();
        opsInBatch = 0;
      }
    }
  }

  // Increment commentCount on each touched post
  for (const [postId, count] of commentCounts) {
    batch.update(db().collection('socialPosts').doc(postId), {
      commentCount: FieldValue.increment(count),
    });
    opsInBatch++;
    if (opsInBatch >= 490) {
      await batch.commit();
      batch = db().batch();
      opsInBatch = 0;
    }
  }

  if (opsInBatch > 0) await batch.commit();
  logger.info(`Simulated ${total} comments`);
}

async function simulateLikes(users: BotUser[], posts: PostStub[]): Promise<void> {
  const postLikeDelta = new Map<string, number>();
  const authorLikeDelta = new Map<string, number>();
  let batch = db().batch();
  let opsInBatch = 0;
  let total = 0;

  for (const user of users) {
    const numLikes = randomInt(5, 15);
    const targets = pickN(
      posts.filter((p) => p.authorId !== user.id),
      Math.min(numLikes, posts.length),
    );

    for (const post of targets) {
      // Write like record under the user's likes subcollection
      batch.set(
        db().collection('socialProfiles').doc(user.id).collection('likes').doc(post.id),
        { createdAt: recentTimestamp() },
        { merge: true }, // don't duplicate if already liked
      );
      postLikeDelta.set(post.id, (postLikeDelta.get(post.id) ?? 0) + 1);
      authorLikeDelta.set(post.authorId, (authorLikeDelta.get(post.authorId) ?? 0) + 1);
      total++;
      opsInBatch++;

      if (opsInBatch >= 490) {
        await batch.commit();
        batch = db().batch();
        opsInBatch = 0;
      }
    }
  }

  // Increment post like counts
  for (const [postId, delta] of postLikeDelta) {
    batch.update(db().collection('socialPosts').doc(postId), {
      likes: FieldValue.increment(delta),
    });
    opsInBatch++;
    if (opsInBatch >= 490) {
      await batch.commit();
      batch = db().batch();
      opsInBatch = 0;
    }
  }

  // Increment author totalLikes
  for (const [authorId, delta] of authorLikeDelta) {
    batch.update(db().collection('socialProfiles').doc(authorId), {
      totalLikes: FieldValue.increment(delta),
    });
    opsInBatch++;
    if (opsInBatch >= 490) {
      await batch.commit();
      batch = db().batch();
      opsInBatch = 0;
    }
  }

  if (opsInBatch > 0) await batch.commit();
  logger.info(`Simulated ${total} likes`);
}

async function simulateDownloads(users: BotUser[], posts: PostStub[]): Promise<void> {
  const downloadDelta = new Map<string, number>();
  const authorDelta = new Map<string, number>();

  for (const user of users) {
    const numDownloads = randomInt(2, 5);
    const targets = pickN(
      posts.filter((p) => p.authorId !== user.id),
      Math.min(numDownloads, posts.length),
    );
    for (const post of targets) {
      downloadDelta.set(post.id, (downloadDelta.get(post.id) ?? 0) + 1);
      authorDelta.set(post.authorId, (authorDelta.get(post.authorId) ?? 0) + 1);
    }
  }

  let batch = db().batch();
  let opsInBatch = 0;

  for (const [postId, delta] of downloadDelta) {
    batch.update(db().collection('socialPosts').doc(postId), {
      downloadCount: FieldValue.increment(delta),
    });
    opsInBatch++;
    if (opsInBatch >= 490) {
      await batch.commit();
      batch = db().batch();
      opsInBatch = 0;
    }
  }

  for (const [authorId, delta] of authorDelta) {
    batch.update(db().collection('socialProfiles').doc(authorId), {
      totalDownloads: FieldValue.increment(delta),
    });
    opsInBatch++;
    if (opsInBatch >= 490) {
      await batch.commit();
      batch = db().batch();
      opsInBatch = 0;
    }
  }

  if (opsInBatch > 0) await batch.commit();
  logger.info(`Simulated ${downloadDelta.size} post download increments`);
}

async function updateProfilePostCounts(newPosts: PostStub[]): Promise<void> {
  const delta = new Map<string, number>();
  for (const p of newPosts) {
    delta.set(p.authorId, (delta.get(p.authorId) ?? 0) + 1);
  }

  let batch = db().batch();
  let opsInBatch = 0;
  for (const [authorId, count] of delta) {
    batch.update(db().collection('socialProfiles').doc(authorId), {
      publishedProjectCount: FieldValue.increment(count),
    });
    opsInBatch++;
    if (opsInBatch >= 490) {
      await batch.commit();
      batch = db().batch();
      opsInBatch = 0;
    }
  }
  if (opsInBatch > 0) await batch.commit();
}

// ---------- Main exported function ----------

export async function simulateDailyActivity(): Promise<{
  users: number;
  newPosts: number;
  comments: number;
  likes: number;
}> {
  logger.info('Starting daily social activity simulation');

  const users = await loadBotUsers();
  if (users.length === 0) {
    logger.warn('No bot users found — run the seed script first');
    return { users: 0, newPosts: 0, comments: 0, likes: 0 };
  }

  logger.info(`Simulating activity for ${users.length} bot users`);

  // Phase 1: Build list of post-generation jobs (5-7 per user = 500-700 total)
  const jobs: PostJob[] = [];
  for (const user of users) {
    const numPosts = randomInt(5, 7);
    for (let j = 0; j < numPosts; j++) {
      jobs.push({ user, jobIndex: jobs.length });
    }
  }
  logger.info(`Generating ${jobs.length} posts with concurrency=25`);

  // Run Fal AI + OpenAI calls with a worker pool (25 in flight at a time).
  // ~600 posts × 3-5 sec per post / 25 workers ≈ 90-120 seconds total.
  const startTs = Date.now();
  const builtPosts = await processWithConcurrency(jobs, 25, async (job) => {
    try {
      return await buildPost(job);
    } catch (err) {
      logger.warn(`buildPost failed for user=${job.user.id}`, err);
      return null;
    }
  });
  const successfulPosts = builtPosts.filter((p): p is NonNullable<typeof p> => p !== null);
  logger.info(`Built ${successfulPosts.length}/${jobs.length} posts in ${Math.round((Date.now() - startTs) / 1000)}s`);

  // Phase 1b: Batch-write all posts
  await writePostsBatch(successfulPosts);

  const allNewPosts: PostStub[] = successfulPosts.map((p) => ({
    id: p.id as string,
    authorId: p.authorId as string,
    authorName: p.authorName as string,
    authorAvatarUrl: p.authorAvatarUrl as string,
  }));

  logger.info(`Created ${allNewPosts.length} new posts`);

  // Phase 2: Use the just-created posts as the engagement pool (500-700 is plenty).
  // Avoids an extra Firestore query that requires a composite index.
  const engagementPool: PostStub[] = allNewPosts;

  // Phase 3: Comments, likes, downloads
  await simulateComments(users, engagementPool);
  await simulateLikes(users, engagementPool);
  await simulateDownloads(users, engagementPool);

  // Phase 4: Update publishedProjectCount on profiles
  await updateProfilePostCounts(allNewPosts);

  const result = {
    users: users.length,
    newPosts: allNewPosts.length,
    comments: users.reduce((s) => s + randomInt(3, 8), 0),
    likes: users.reduce((s) => s + randomInt(5, 15), 0),
  };

  logger.info('Daily simulation complete', result);
  return result;
}
