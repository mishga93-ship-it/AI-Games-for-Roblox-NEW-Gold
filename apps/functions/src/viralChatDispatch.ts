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
