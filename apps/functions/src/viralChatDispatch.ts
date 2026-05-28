// viralChatDispatch.ts — bridge between the standard ChatView generation
// endpoint (`POST /api/content/generate` → `processGenerationJob`) and the
// fire-and-forget viral generators (Disaster Spawner, Fitting Room,
// Voice-to-Aura; extendable to Cursed UGC, Outfit, Glowup).
//
// User feedback (sessions 385/388/389):
//   «его надо по флоу сделать как остальные чаты с интервью»
//   «чат войс ту аура надо сделать как все остальные чаты с интервью»
//
// Before this module, each viral feature had its own dedicated full-screen
// sheet (DisasterSpawnerStudio, FittingRoomStudio, VoiceAuraStudio) driven
// by `POST /api/disaster-spawner/generate` etc. The chat flow had no entry
// point — opening from Forge short-circuited into the dedicated sheet.
//
// This module exposes a single entry the regular game-pipeline dispatcher
// can call BEFORE it kicks off the standard 9-14 stage pipeline:
//
//   const handled = await tryHandleViralChatGeneration({ job, prompt });
//   if (handled) return; // job has been marked completed with artifacts
//   // ... fall through to game_package / rbxl_build / etc.
//
// Currently routes:
//   contentSubcategory === 'disaster_spawner'  →  generateDisaster()
//   contentSubcategory === 'fitting_room'      →  startFittingRoomJob()
//   contentSubcategory === 'voice_aura'        →  generateAura()
//
// Adding more (cursed_ugc, outfit, glowup) is a matter of importing the
// generator + extracting params from the prompt the same way.

import { logger } from 'firebase-functions/v2';
import { v4 as uuidv4 } from 'uuid';

import { generateDisaster } from './disasterGenerator.js';
import {
  type DisasterModeId,
  type DisasterChaosLevel,
  type DisasterSize,
  type DisasterFrequency,
  parseDisasterChaos,
  parseDisasterSize,
  parseDisasterFrequency,
  DISASTER_MODES,
} from './data/disasterStyles.js';
import { runChatProvider } from './providers.js';
import { recordViralGeneration } from './viralGenerations.js';
import type { GenerationArtifact, GenerationJob } from './types.js';

// Session 389 — Fitting Room chat dispatch (mirror Disaster Spawner pattern).
// Imports lazy-resolved inside the handler so any future provider changes
// don't bloat module init for jobs that never touch Fitting Room.
import { startFittingRoomJob, fetchFittingRoomDoc } from './fittingRoomRenderer.js';
import {
  OUTFIT_AESTHETICS,
  isOutfitAestheticId,
  type OutfitAestheticId,
  type OutfitGender,
  type OutfitStyleMode,
} from './data/outfitAesthetics.js';

// Session 388 — Voice-to-Aura chat dispatch (mirror Disaster Spawner pattern).
import { generateAura } from './auraGenerator.js';
import {
  AURA_STYLES,
  type AuraStyleId,
  type AuraIntensity,
  type AuraSize as AuraGenSize,
  type AuraTone,
} from './data/auraStyles.js';

// ─── Param extraction ──────────────────────────────────────────

/**
 * Heuristic + LLM-assisted extraction of disaster parameters from a free-form
 * chat prompt. Pulls keywords first (cheap, deterministic) and only falls
 * back to a one-shot LLM call when the prompt is ambiguous.
 */
async function extractDisasterParams(prompt: string): Promise<{
  mode: DisasterModeId;
  chaos: DisasterChaosLevel;
  size: DisasterSize;
  frequency: DisasterFrequency;
}> {
  const lc = prompt.toLowerCase();

  // Deterministic mode pick — match obvious keyword clusters first.
  let mode: DisasterModeId = 'meme'; // brainrot is the safest default for the viral product
  if (/\b(horror|scary|cursed|nightmare|dark|ghost|zombie|haunt|demon|blood)\b/.test(lc)) {
    mode = 'horror';
  } else if (/\b(funny|silly|goofy|ridiculous|absurd|wacky|comedy)\b/.test(lc)) {
    mode = 'funny';
  } else if (/\b(sigma|chad|alpha|grindset|stoic|moai|stone)\b/.test(lc)) {
    mode = 'sigma';
  } else if (/\b(brainrot|skibidi|tralalero|bombardiro|sahur|meme|italian|cappuccino|crocodilo)\b/.test(lc)) {
    mode = 'meme';
  }

  // Deterministic chaos guess — explicit words override anything else.
  let chaos: DisasterChaosLevel = 'chaotic';
  if (/\b(impossible|insane|nightmare|apocalypse|hardcore|max(imum)?\s*chaos|9000)\b/.test(lc)) {
    chaos = 'impossible';
  } else if (/\b(balanced|fair|chill|easy|gentle|mild)\b/.test(lc)) {
    chaos = 'balanced';
  }

  let size: DisasterSize = 'normal';
  if (/\b(massive|huge|giant|enormous|titanic|colossal)\b/.test(lc)) {
    size = 'massive';
  } else if (/\b(small|tiny|mini|cute)\b/.test(lc)) {
    size = 'small';
  }

  let frequency: DisasterFrequency = 'normal';
  if (/\b(constant|nonstop|endless|continuous|spam|every\s*(second|few\s*sec))\b/.test(lc)) {
    frequency = 'constant';
  } else if (/\b(rare|occasional|once|seldom)\b/.test(lc)) {
    frequency = 'rare';
  }

  // If keyword detection picked 'meme' AND the prompt is short / vague, ask
  // the LLM to confirm — cheap insurance for the auto-detected mode. Cap
  // total latency so chat generation stays snappy.
  if (mode === 'meme' && prompt.trim().split(/\s+/).length < 8) {
    try {
      const r = await runChatProvider('openai',
        `Classify this Roblox disaster prompt into one mode: funny | horror | meme | sigma.\n` +
        `Reply with ONLY the single word. Prompt: "${prompt.trim().slice(0, 300)}"`,
        undefined,
        { timeoutMs: 8_000 },
      );
      const guess = (r.text ?? '').trim().toLowerCase();
      if (['funny', 'horror', 'meme', 'sigma'].includes(guess)) {
        mode = guess as DisasterModeId;
      }
    } catch (err) {
      logger.warn('[viralChatDispatch] LLM mode classification failed (non-fatal)',
        { err: err instanceof Error ? err.message : String(err) });
    }
  }

  return {
    mode,
    chaos: parseDisasterChaos(chaos),
    size: parseDisasterSize(size),
    frequency: parseDisasterFrequency(frequency),
  };
}

// ─── Disaster Spawner handler ──────────────────────────────────

async function handleDisasterSpawner(args: {
  firebaseUid: string;
  jobId: string;
  prompt: string;
}): Promise<{ artifacts: GenerationArtifact[]; status: 'completed' | 'failed'; errorMessage?: string }> {
  const { firebaseUid, jobId, prompt } = args;

  // 1) Decode params from the free-form chat prompt.
  const params = await extractDisasterParams(prompt);

  // 2) Reuse the existing generator (image + safe Lua + metadata + rbxmx).
  let result: Awaited<ReturnType<typeof generateDisaster>>;
  try {
    result = await generateDisaster({
      userPrompt: prompt,
      mode: params.mode,
      chaos: params.chaos,
      size: params.size,
      frequency: params.frequency,
      inputMode: 'text',
      firebaseUid,
    });
  } catch (err) {
    logger.error('[viralChatDispatch] generateDisaster failed', { jobId, err });
    return {
      artifacts: [],
      status: 'failed',
      errorMessage: err instanceof Error ? err.message : 'Disaster generation failed',
    };
  }

  // 3) Translate the bundle into standard chat artifacts (so ChatView's
  //    existing artifact-card renderer just picks them up — no new UI).
  const artifacts: GenerationArtifact[] = [];
  const baseName = result.titleEN.replace(/[^A-Za-z0-9_]/g, '').slice(0, 32) || 'Disaster';

  if (result.previewUrl) {
    artifacts.push({
      id: uuidv4(),
      type: 'png',
      name: `${baseName}-poster.png`,
      url: result.previewUrl,
      artifactRole: 'thumbnail',
      metadata: {
        generationId: result.generationId,
        mode: result.mode,
        chaos: result.chaos,
        kind: 'disaster_spawner',
      },
    });
  }

  if (result.rbxmxUrl) {
    artifacts.push({
      id: uuidv4(),
      type: 'rbxm',
      extension: 'rbxmx',
      name: `${baseName}.rbxmx`,
      url: result.rbxmxUrl,
      artifactRole: 'export_binary',
      previewText: `Drop into ServerScriptService → press Play. ${result.shareCaption}`,
      metadata: {
        generationId: result.generationId,
        mode: result.mode,
        chaos: result.chaos,
        size: result.size,
        frequency: result.frequency,
        difficulty: result.difficulty,
        rarityVibeEN: result.rarityVibeEN,
        recommendedPlayers: result.recommendedPlayers,
        usedFallback: result.usedFallback,
        kind: 'disaster_spawner',
      },
    });
  }

  // Inline Lua so the user can see it without downloading.
  if (result.luaScript) {
    artifacts.push({
      id: uuidv4(),
      type: 'lua',
      extension: 'lua',
      name: `${baseName}.server.lua`,
      code: result.luaScript,
      previewText: result.luaScript.slice(0, 200),
      artifactRole: 'script',
      metadata: {
        generationId: result.generationId,
        kind: 'disaster_spawner',
      },
    });
  }

  // 4) Mirror into the unified Recents collection so My Creations sees it.
  void recordViralGeneration({
    firebaseUid,
    kind: 'disaster_spawner',
    generationId: result.generationId,
    title: result.titleEN,
    subtitle: result.shareCaption,
    thumbnailUrl: result.previewUrl,
    accentHex: DISASTER_MODES[result.mode]?.accentHex,
    payload: {
      // Full DisasterGenerationResponse-compatible shape so iOS can
      // reconstruct the rich result view (DisasterSpawnerResultView) from
      // GET /api/viral-generations/:id without re-running the pipeline.
      mode: result.mode,
      chaos: result.chaos,
      size: result.size,
      frequency: result.frequency,
      previewUrl: result.previewUrl,
      rbxmxUrl: result.rbxmxUrl,
      titleEN: result.titleEN,
      titleRU: result.titleRU,
      shareCaption: result.shareCaption,
      rarityVibeEN: result.rarityVibeEN,
      rarityVibeRU: result.rarityVibeRU,
      difficulty: result.difficulty,
      variations: result.variations,
      instructionsEN: result.instructionsEN,
      instructionsRU: result.instructionsRU,
      generationStatus: result.generationStatus,
      usedFallback: result.usedFallback,
      recommendedPlayers: result.recommendedPlayers,
      luaScript: result.luaScript,
      jobId,
    },
  });

  return { artifacts, status: 'completed' };
}

// ─── Fitting Room handler ──────────────────────────────────────

/**
 * Heuristic + LLM-assisted extraction of fitting-room params from a free-form
 * chat prompt. Keyword match first (cheap, deterministic). LLM only fires
 * when the prompt is very short or doesn't match any of the 9 aesthetics.
 */
async function extractFittingRoomParams(prompt: string): Promise<{
  aestheticId: OutfitAestheticId;
  gender: OutfitGender;
  style: OutfitStyleMode;
}> {
  const lc = prompt.toLowerCase();

  // Aesthetic detection — keyword clusters per OUTFIT_AESTHETICS id.
  let aestheticId: OutfitAestheticId = 'sigma';
  if (/\b(baddie|bad\s*girl|tiktok\s*baddie|slay|boss\s*girl|boss\s*mode|confident\s*girl)\b/.test(lc)) {
    aestheticId = 'baddie';
  } else if (/\b(y2k|mall\s*princess|butterflies|low[-\s]?rise|early\s*2000s|jojo\s*siwa)\b/.test(lc)) {
    aestheticId = 'y2k';
  } else if (/\b(goth|cathedral|gothic|vampire|coffin|black\s*lace|dark\s*dramatic)\b/.test(lc)) {
    aestheticId = 'goth';
  } else if (/\b(rich\s*emo|designer\s*emo|chains\s*layered|intentional\s*sadness|luxury\s*emo)\b/.test(lc)) {
    aestheticId = 'rich_emo';
  } else if (/\b(slender|slim\s*silhouette|tall\s*narrow|mysterious\s*silhouette|liminal)\b/.test(lc)) {
    aestheticId = 'slender';
  } else if (/\b(softie|soft\s*girl|pastel|baby\s*pink|cottagecore|kawaii|coquette)\b/.test(lc)) {
    aestheticId = 'softie';
  } else if (/\b(cyber|cyberpunk|neon\s*hacker|matrix|holo|glitch|rainbow\s*holo|tron)\b/.test(lc)) {
    aestheticId = 'cyber';
  } else if (/\b(anime\s*demon|sukuna|jujutsu|demon\s*slayer|jjk|black\s*hair\s*red\s*eyes)\b/.test(lc)) {
    aestheticId = 'anime_demon';
  } else if (/\b(sigma|stoic|1%\s*mindset|alpha|grindset|moai)\b/.test(lc)) {
    aestheticId = 'sigma';
  }

  // Gender detection.
  let gender: OutfitGender = 'neutral';
  if (/\b(girl|girls|female|she|her|baddie|princess)\b/.test(lc)) {
    gender = 'girls';
  } else if (/\b(guy|guys|boy|boys|male|he|him|sigma|chad|alpha)\b/.test(lc)) {
    gender = 'boys';
  }

  // Style detection.
  let style: OutfitStyleMode = 'dark';
  if (/\b(colorful|color|rainbow|bright|neon|pastel|pink|orange|yellow)\b/.test(lc)) {
    style = 'colorful';
  } else if (/\b(dark|black|gothic|shadow|noir|monochrome)\b/.test(lc)) {
    style = 'dark';
  }

  // If still on the 'sigma' default AND the prompt is short/vague, ask the
  // LLM to pick from the 9 ids. Caps at ~8s so chat stays snappy.
  if (aestheticId === 'sigma' && prompt.trim().split(/\s+/).length < 6) {
    try {
      const r = await runChatProvider('openai',
        `Classify this Roblox fitting-room prompt into ONE id: ` +
        `sigma | baddie | y2k | goth | rich_emo | slender | softie | cyber | anime_demon.\n` +
        `Reply with ONLY the single id. Prompt: "${prompt.trim().slice(0, 300)}"`,
        undefined,
        { timeoutMs: 8_000 },
      );
      const guess = (r.text ?? '').trim().toLowerCase();
      if (isOutfitAestheticId(guess)) {
        aestheticId = guess;
      }
    } catch (err) {
      logger.warn('[viralChatDispatch] LLM aesthetic classification failed (non-fatal)',
        { err: err instanceof Error ? err.message : String(err) });
    }
  }

  return { aestheticId, gender, style };
}

async function handleFittingRoom(args: {
  firebaseUid: string;
  jobId: string;
  prompt: string;
}): Promise<{ artifacts: GenerationArtifact[]; status: 'completed' | 'failed'; errorMessage?: string }> {
  const { firebaseUid, jobId, prompt } = args;

  // 1) Extract params.
  const params = await extractFittingRoomParams(prompt);
  const aesthetic = OUTFIT_AESTHETICS[params.aestheticId];

  // 2) Kick off async render job (returns generationId immediately; render
  //    happens in the background and patches the Firestore doc).
  let generationId: string;
  try {
    const r = await startFittingRoomJob({
      aestheticId: params.aestheticId,
      gender: params.gender,
      style: params.style,
      firebaseUid,
    });
    generationId = r.generationId;
  } catch (err) {
    logger.error('[viralChatDispatch] startFittingRoomJob failed', { jobId, err });
    return {
      artifacts: [],
      status: 'failed',
      errorMessage: err instanceof Error ? err.message : 'Fitting Room start failed',
    };
  }

  // 3) Poll the Firestore doc until status='ready' or hard 75s cap. Each
  //    angle takes ~5-12s (img2img flux); 3 angles = ~30-40s in the happy
  //    path, with retries inside fittingRoomRenderer the cap is generous.
  const deadline = Date.now() + 75_000;
  let finalDoc: Awaited<ReturnType<typeof fetchFittingRoomDoc>> | null = null;
  while (Date.now() < deadline) {
    const doc = await fetchFittingRoomDoc(generationId);
    if (doc && (doc.done || doc.status === 'ready' || doc.status === 'failed')) {
      finalDoc = doc;
      break;
    }
    await new Promise((r) => setTimeout(r, 1_500));
  }
  if (!finalDoc) {
    finalDoc = await fetchFittingRoomDoc(generationId);
  }

  if (!finalDoc || finalDoc.status === 'failed') {
    return {
      artifacts: [],
      status: 'failed',
      errorMessage: finalDoc?.errorCode ?? 'Fitting Room render timed out',
    };
  }

  // 4) Translate renders + items into standard chat artifacts. The chat
  //    artifact card renders PNGs inline; the items list is included as a
  //    JSON-encoded blob with previewText so users see cost + names.
  const baseName = aesthetic.title.replace(/[^A-Za-z0-9_]/g, '').slice(0, 32) || 'Fit';
  const artifacts: GenerationArtifact[] = [];

  const pushRender = (url: string | undefined, suffix: string) => {
    if (!url) return;
    artifacts.push({
      id: uuidv4(),
      type: 'png',
      name: `${baseName}-${suffix}.png`,
      url,
      artifactRole: 'thumbnail',
      metadata: {
        generationId,
        aestheticId: params.aestheticId,
        kind: 'fitting_room',
        angle: suffix,
      },
    });
  };
  pushRender(finalDoc.renders.front,         'front');
  pushRender(finalDoc.renders.three_quarter, 'three-quarter');
  pushRender(finalDoc.renders.back,          'back');

  // Items summary as previewText (so users see fit cost without tapping).
  if (Array.isArray(finalDoc.items) && finalDoc.items.length > 0) {
    const lines = finalDoc.items.slice(0, 12).map((it) => {
      const price = it.priceRobux === 0 ? 'FREE' : `${it.priceRobux} R$`;
      return `• [${it.slot}] ${it.name} — ${price}`;
    });
    const summary = [
      `${finalDoc.title} — ${finalDoc.totalCostRobux} R$ total` +
        (finalDoc.savedRobux > 0 ? ` (saved ${finalDoc.savedRobux.toLocaleString()} R$)` : ''),
      '',
      ...lines,
      '',
      finalDoc.shareCaption,
    ].join('\n');
    artifacts.push({
      id: uuidv4(),
      type: 'lua',                  // chat already renders code-block previews
      extension: 'txt',
      name: `${baseName}-items.txt`,
      code: summary,
      previewText: summary.slice(0, 200),
      artifactRole: 'script',       // shown inline; reuses existing card
      metadata: {
        generationId,
        aestheticId: params.aestheticId,
        kind: 'fitting_room',
        totalCostRobux: finalDoc.totalCostRobux,
        savedRobux: finalDoc.savedRobux,
      },
    });
  }

  // 5) Mirror into Recents so My Creations / ViralLibrary sees it.
  void recordViralGeneration({
    firebaseUid,
    kind: 'fitting_room',
    generationId,
    title: finalDoc.title,
    subtitle: finalDoc.shareCaption,
    thumbnailUrl: finalDoc.renders.front ?? finalDoc.renders.three_quarter,
    accentHex: aesthetic.accentHex,
    payload: {
      aestheticId: params.aestheticId,
      gender: params.gender,
      style: params.style,
      renders: finalDoc.renders,
      totalCostRobux: finalDoc.totalCostRobux,
      savedRobux: finalDoc.savedRobux,
      title: finalDoc.title,
      shareCaption: finalDoc.shareCaption,
      jobId,
    },
  });

  return { artifacts, status: 'completed' };
}

// ─── Voice-to-Aura handler ─────────────────────────────────────

/**
 * Heuristic + LLM-assisted extraction of aura parameters from a free-form
 * chat prompt. Keyword match first (cheap, deterministic). LLM only fires
 * when the prompt is short and didn't match any concrete style cluster.
 */
async function extractAuraParams(prompt: string): Promise<{
  style: AuraStyleId;
  intensity: AuraIntensity;
  size: AuraGenSize;
  tone: AuraTone;
}> {
  const lc = prompt.toLowerCase();

  // Style detection — match keyword clusters per AuraStyleId. Default is
  // 'anime' to mirror the iOS picker default.
  let style: AuraStyleId = 'anime';
  let styleMatched = false;
  if (/\b(realistic|photoreal|real\s*fire|smoke|cinematic|physical|embers)\b/.test(lc)) {
    style = 'realistic'; styleMatched = true;
  } else if (/\b(sigma|chad|alpha|grindset|stoic|moai|stone|gigachad)\b/.test(lc)) {
    style = 'sigma'; styleMatched = true;
  } else if (/\b(demon|devil|hellfire|sukuna|crimson|blood|cursed\s*demon|jujutsu)\b/.test(lc)) {
    style = 'demon'; styleMatched = true;
  } else if (/\b(cyber|cyberpunk|neon|hacker|matrix|glitch|electric|lightning|tech|2077)\b/.test(lc)) {
    style = 'cyber'; styleMatched = true;
  } else if (/\b(void|black\s*hole|shadow|abyss|dark\s*aura|indigo\s*void)\b/.test(lc)) {
    style = 'void'; styleMatched = true;
  } else if (/\b(cosmic|galaxy|nebula|stardust|star\s*dust|universe|space|cosmos|ultra\s*instinct)\b/.test(lc)) {
    style = 'cosmic'; styleMatched = true;
  } else if (/\b(skibidi|brainrot|tralalero|bombardiro|italian\s*meme|cursed\s*meme|absurd|ohio)\b/.test(lc)) {
    style = 'meme'; styleMatched = true;
  } else if (/\b(anime|shounen|naruto|dragon\s*ball|goku|itadori|kakashi|manga|otaku)\b/.test(lc)) {
    style = 'anime'; styleMatched = true;
  }

  // Intensity — aggressive is the default (matches iOS picker default).
  let intensity: AuraIntensity = 'aggressive';
  if (/\b(calm|gentle|soft|chill|peaceful|subtle|quiet|slow)\b/.test(lc)) {
    intensity = 'calm';
  } else if (/\b(extreme|overpowered|op|insane|godlike|maxxed|unhinged|ultimate|ultra|nuclear|god\s*tier)\b/.test(lc)) {
    intensity = 'extreme';
  }

  // Size — default 'normal'.
  let size: AuraGenSize = 'normal';
  if (/\b(small|tiny|minimal|subtle\s*size|close)\b/.test(lc)) {
    size = 'small';
  } else if (/\b(massive|huge|giant|arena|screen|enormous|colossal|oversized)\b/.test(lc)) {
    size = 'massive';
  }

  // Tone — default 'clean'.
  let tone: AuraTone = 'clean';
  if (/\b(cursed|brainrot|absurd|chaotic|weird|cringe|meme|broken)\b/.test(lc)) {
    tone = 'cursed';
  }

  // If nothing matched and the prompt is short / vague, ask the LLM once.
  if (!styleMatched && prompt.trim().split(/\s+/).length < 6) {
    try {
      const r = await runChatProvider('openai',
        `Classify this Roblox aura prompt into one style: anime | realistic | sigma | demon | cyber | void | cosmic | meme.\n` +
        `Reply with ONLY the single word. Prompt: "${prompt.trim().slice(0, 300)}"`,
        undefined,
        { timeoutMs: 8_000 },
      );
      const guess = (r.text ?? '').trim().toLowerCase();
      if (['anime', 'realistic', 'sigma', 'demon', 'cyber', 'void', 'cosmic', 'meme'].includes(guess)) {
        style = guess as AuraStyleId;
      }
    } catch (err) {
      logger.warn('[viralChatDispatch] LLM aura style classification failed (non-fatal)',
        { err: err instanceof Error ? err.message : String(err) });
    }
  }

  return { style, intensity, size, tone };
}

async function handleVoiceAura(args: {
  firebaseUid: string;
  jobId: string;
  prompt: string;
}): Promise<{ artifacts: GenerationArtifact[]; status: 'completed' | 'failed'; errorMessage?: string }> {
  const { firebaseUid, jobId, prompt } = args;

  // 1) Decode params from the free-form chat prompt.
  const params = await extractAuraParams(prompt);

  // 2) Run the existing generator (4 parallel: main image + op + cursed +
  //    Lua + metadata, then rbxmx upload). Same pipeline used by the
  //    legacy /api/voice-aura/generate endpoint.
  let result: Awaited<ReturnType<typeof generateAura>>;
  try {
    result = await generateAura({
      userPrompt: prompt,
      style: params.style,
      intensity: params.intensity,
      size: params.size,
      tone: params.tone,
      inputMode: 'text',
      firebaseUid,
    });
  } catch (err) {
    logger.error('[viralChatDispatch] generateAura failed', { jobId, err });
    return {
      artifacts: [],
      status: 'failed',
      errorMessage: err instanceof Error ? err.message : 'Aura generation failed',
    };
  }

  // 3) Translate the bundle into standard chat artifacts (so ChatView's
  //    existing artifact-card renderer just picks them up — no new UI).
  const artifacts: GenerationArtifact[] = [];
  const baseName = result.titleEN.replace(/[^A-Za-z0-9_]/g, '').slice(0, 32) || 'Aura';

  if (result.previewUrl) {
    artifacts.push({
      id: uuidv4(),
      type: 'png',
      name: `${baseName}-poster.png`,
      url: result.previewUrl,
      artifactRole: 'thumbnail',
      metadata: {
        generationId: result.generationId,
        style: result.style,
        intensity: result.intensity,
        rarityVibeEN: result.rarityVibeEN,
        difficulty: result.difficulty,
        kind: 'voice_aura',
      },
    });
  }

  if (result.rbxmxUrl) {
    artifacts.push({
      id: uuidv4(),
      type: 'rbxm',
      extension: 'rbxmx',
      name: `${baseName}.rbxmx`,
      url: result.rbxmxUrl,
      artifactRole: 'export_binary',
      previewText: `Drop into ServerScriptService → press Play. ${result.shareCaption}`,
      metadata: {
        generationId: result.generationId,
        style: result.style,
        intensity: result.intensity,
        size: result.size,
        tone: result.tone,
        difficulty: result.difficulty,
        rarityVibeEN: result.rarityVibeEN,
        safeUsedFallback: result.safeUsedFallback,
        kind: 'voice_aura',
      },
    });
  }

  // Inline Lua so the user can see it without downloading.
  if (result.luaScript) {
    artifacts.push({
      id: uuidv4(),
      type: 'lua',
      extension: 'lua',
      name: `${baseName}.server.lua`,
      code: result.luaScript,
      previewText: result.luaScript.slice(0, 200),
      artifactRole: 'script',
      metadata: {
        generationId: result.generationId,
        kind: 'voice_aura',
      },
    });
  }

  // 4) Mirror into the unified Recents collection so My Creations sees it.
  void recordViralGeneration({
    firebaseUid,
    kind: 'voice_aura',
    generationId: result.generationId,
    title: result.titleEN,
    subtitle: result.shareCaption,
    thumbnailUrl: result.previewUrl,
    accentHex: AURA_STYLES[result.style]?.accentHex,
    payload: {
      style: result.style,
      intensity: result.intensity,
      size: result.size,
      tone: result.tone,
      previewUrl: result.previewUrl,
      rbxmxUrl: result.rbxmxUrl,
      luaScript: result.luaScript,
      titleEN: result.titleEN,
      titleRU: result.titleRU,
      shareCaption: result.shareCaption,
      rarityVibeEN: result.rarityVibeEN,
      rarityVibeRU: result.rarityVibeRU,
      difficulty: result.difficulty,
      variations: result.variations,
      instructionsEN: result.instructionsEN,
      instructionsRU: result.instructionsRU,
      safeUsedFallback: result.safeUsedFallback,
      generationStatus: result.generationStatus,
      jobId,
    },
  });

  return { artifacts, status: 'completed' };
}

// ─── Public entry (called by /api/content/generate dispatcher) ─

/**
 * Try to handle the job with a viral generator. Returns `true` if the job has
 * been fully completed (artifacts + status set on the caller's `job` object)
 * and the standard game pipeline should be skipped. Returns `false` to let
 * the regular pipeline run.
 *
 * This is a side-effecting helper — it mutates `job.artifacts` / `job.status`
 * directly so the caller can keep the existing job-update plumbing.
 */
export async function tryHandleViralChatGeneration(args: {
  job: GenerationJob;
  prompt: string;
}): Promise<boolean> {
  const { job, prompt } = args;
  const subcategory = typeof job.metadata?.contentSubcategory === 'string'
    ? job.metadata.contentSubcategory.toLowerCase()
    : '';

  const trimmed = (prompt ?? '').trim();

  if (subcategory === 'disaster_spawner') {
    if (!trimmed) {
      job.status = 'failed';
      job.errorMessage = 'Empty disaster prompt';
      return true;
    }
    const handled = await handleDisasterSpawner({
      firebaseUid: job.userId,
      jobId: job.id,
      prompt: trimmed,
    });
    job.artifacts = [...(job.artifacts ?? []), ...handled.artifacts];
    job.status = handled.status;
    if (handled.errorMessage) job.errorMessage = handled.errorMessage;
    return true;
  }

  if (subcategory === 'fitting_room') {
    if (!trimmed) {
      job.status = 'failed';
      job.errorMessage = 'Empty fitting-room prompt';
      return true;
    }
    const handled = await handleFittingRoom({
      firebaseUid: job.userId,
      jobId: job.id,
      prompt: trimmed,
    });
    job.artifacts = [...(job.artifacts ?? []), ...handled.artifacts];
    job.status = handled.status;
    if (handled.errorMessage) job.errorMessage = handled.errorMessage;
    return true;
  }

  if (subcategory === 'voice_aura') {
    if (!trimmed) {
      job.status = 'failed';
      job.errorMessage = 'Empty aura prompt';
      return true;
    }
    const handled = await handleVoiceAura({
      firebaseUid: job.userId,
      jobId: job.id,
      prompt: trimmed,
    });
    job.artifacts = [...(job.artifacts ?? []), ...handled.artifacts];
    job.status = handled.status;
    if (handled.errorMessage) job.errorMessage = handled.errorMessage;
    return true;
  }

  return false;
}
