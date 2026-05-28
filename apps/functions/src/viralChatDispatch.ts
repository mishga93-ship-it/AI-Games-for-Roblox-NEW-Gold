// viralChatDispatch.ts — bridge between the standard ChatView generation
// endpoint (`POST /api/content/generate` → `processGenerationJob`) and the
// fire-and-forget viral generators (currently Disaster Spawner; can be
// extended to Voice Aura, Cursed UGC, etc.).
//
// User feedback (session 385 round 7):
//   «его надо по флоу сделать как остальные чаты с интервью»
//
// Before this module, Disaster Spawner had its own DisasterSpawnerStudio
// full-screen sheet driven by `POST /api/disaster-spawner/generate`. The
// chat flow had no entry point — opening Disaster Spawner from Forge
// short-circuited into the dedicated sheet.
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
//
// Adding more (voice_aura, cursed_ugc, outfit, glowup, fitting_room) is a
// matter of importing their generator + extracting params from the prompt
// the same way.

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

  const pushRender = (url: string | undefined, suffix: string, role: string) => {
    if (!url) return;
    artifacts.push({
      id: uuidv4(),
      type: 'png',
      name: `${baseName}-${suffix}.png`,
      url,
      artifactRole: role,
      metadata: {
        generationId,
        aestheticId: params.aestheticId,
        kind: 'fitting_room',
        angle: suffix,
      },
    });
  };
  pushRender(finalDoc.renders.front,         'front',         'thumbnail');
  pushRender(finalDoc.renders.three_quarter, 'three-quarter', 'preview');
  pushRender(finalDoc.renders.back,          'back',          'preview');

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

  if (subcategory !== 'disaster_spawner') {
    return false;
  }

  const trimmed = (prompt ?? '').trim();
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
  if (handled.errorMessage) {
    job.errorMessage = handled.errorMessage;
  }
  return true;
}
