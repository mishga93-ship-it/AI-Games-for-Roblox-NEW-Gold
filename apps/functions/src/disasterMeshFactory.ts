// disasterMeshFactory.ts — on-demand 3D Mesh generation for Disaster Spawner.
//
// User feedback (session 385 round 8, after InsertService blocked):
//   «а если добавить просто шаг в генерацию — зер пишет хочу банановый дождь
//    → идём генерить 3д → берем айди модели → вставляем в скрипт».
//
// Pipeline:
//   1. Lookup Firestore cache `disasterMeshes/{keyword}` — if hit, return.
//   2. Meshy v6 text-to-3d via Fal.ai (~30-60s).
//   3. Upload .glb to Roblox via Open Cloud as assetType=Model under our
//      company creator account (ROBLOX_CREATOR_ID).
//   4. extractMeshIdFromModel runs an Engine API Luau task that loads the
//      Model and reads back the inner Mesh asset id (AssetTypeId=4).
//   5. Save {modelAssetId, meshAssetId} to Firestore (cache forever — meshes
//      don't expire).
//
// Why inner Mesh id and not the Model id?
//   - InsertService:LoadAsset(<Model>) is gated by Roblox "trust check" —
//     fails with "Asset is not trusted for this place" in random places.
//   - MeshPart.MeshContent = "rbxassetid://<Mesh>" is PUBLIC for any Mesh
//     asset — renders in any place, no trust check, no ownership required.
//   - Net: spawned MeshParts work in the user's Studio drag-drop flow with
//     zero permission setup.
//
// Cost: ~$0.80 per UNIQUE keyword via Meshy. Firestore cache means all
// subsequent users requesting the same keyword reuse the same mesh. 20-30
// keywords amortise to a one-time $16-24 across the whole user base.

import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

import { runMeshy } from './providers.js';
import { uploadAssetToRoblox } from './robloxWorker.js';
import { extractMeshIdFromModel } from './extractMeshIdFromModel.js';
import { getRobloxOpenCloudApiKey, getRobloxCreatorId } from './config.js';

const COLLECTION = 'disasterMeshes';

export interface CachedDisasterMesh {
  keyword: string;
  prompt: string;
  modelAssetId: number;
  meshAssetId: number;
  createdAtMs: number;
}

/** Build a Meshy text-to-3d prompt biased toward isolated game-ready props.
 * The disaster spawner expects a single graspable object — we explicitly
 * exclude "scene background", "shadow", "ground plane" which Meshy otherwise
 * happily adds and which would crash visual readability when 30 of them are
 * falling from the sky. */
export function buildMeshyPrompt(keyword: string, userBrief?: string): string {
  const seed = keyword.replace(/_/g, ' ');
  const briefClause = userBrief && userBrief.trim().length > 0
    ? ` ${userBrief.trim().slice(0, 120)}.`
    : '';
  return [
    `Low-poly stylized 3D ${seed}, single isolated object, game asset,`,
    'simple cartoon shape, bright readable colors, no background, no ground plane,',
    'no shadow, no scene, centered, optimized for Roblox.',
    briefClause,
  ].join(' ');
}

/** Returns cached or freshly generated `{ modelAssetId, meshAssetId }` for a
 * keyword. Returns `null` if any step in the pipeline fails — caller should
 * fall back to branded primitive composition. */
export async function getOrCreateDisasterMesh(args: {
  keyword: string;
  userBrief?: string;
}): Promise<CachedDisasterMesh | null> {
  const keyword = args.keyword.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 32);
  if (!keyword) {
    logger.warn('[disasterMeshFactory] empty keyword after sanitize');
    return null;
  }

  const db = getFirestore();
  const docRef = db.collection(COLLECTION).doc(keyword);
  try {
    const snap = await docRef.get();
    if (snap.exists) {
      const d = snap.data();
      if (d && typeof d.meshAssetId === 'number' && d.meshAssetId > 0) {
        logger.info('[disasterMeshFactory] cache hit', {
          keyword, meshAssetId: d.meshAssetId,
        });
        return {
          keyword: d.keyword ?? keyword,
          prompt: d.prompt ?? '',
          modelAssetId: typeof d.modelAssetId === 'number' ? d.modelAssetId : 0,
          meshAssetId: d.meshAssetId,
          createdAtMs: typeof d.createdAtMs === 'number' ? d.createdAtMs : 0,
        };
      }
    }
  } catch (err) {
    logger.warn('[disasterMeshFactory] cache read failed (proceeding to gen)',
      { err: err instanceof Error ? err.message : String(err) });
  }

  const apiKey = getRobloxOpenCloudApiKey();
  const creatorId = getRobloxCreatorId();
  if (!apiKey || !creatorId) {
    logger.warn('[disasterMeshFactory] missing Open Cloud credentials — cannot generate');
    return null;
  }

  const prompt = buildMeshyPrompt(keyword, args.userBrief);
  logger.info('[disasterMeshFactory] gen start', { keyword, promptLen: prompt.length });

  // Step 1 — Meshy v6 text-to-3d.
  let meshyResult: Awaited<ReturnType<typeof runMeshy>>;
  try {
    meshyResult = await runMeshy(prompt, {
      endpoint: 'fal-ai/meshy/v6/text-to-3d',
      art_style: 'realistic',
      target_polycount: 8000,
      topology: 'triangle',
      should_remesh: true,
      should_texture: true,
      enable_pbr: true,
    });
  } catch (err) {
    logger.warn('[disasterMeshFactory] Meshy failed', {
      keyword, err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
  const glbUrl = (meshyResult as { outputUrl?: string }).outputUrl
    ?? ((meshyResult.raw as Record<string, unknown> | undefined)?.model_mesh as Record<string, unknown> | undefined)?.url as string | undefined
    ?? ((meshyResult.raw as Record<string, unknown> | undefined)?.model_glb as Record<string, unknown> | undefined)?.url as string | undefined;
  if (typeof glbUrl !== 'string' || !glbUrl.startsWith('http')) {
    logger.warn('[disasterMeshFactory] no glb URL from Meshy', { keyword });
    return null;
  }

  // Step 2 — Download .glb.
  let glbBuf: Buffer;
  try {
    const r = await fetch(glbUrl);
    if (!r.ok) throw new Error(`glb fetch HTTP ${r.status}`);
    glbBuf = Buffer.from(await r.arrayBuffer());
  } catch (err) {
    logger.warn('[disasterMeshFactory] glb download failed', {
      keyword, err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
  logger.info('[disasterMeshFactory] glb downloaded', { keyword, bytes: glbBuf.length });

  // Step 3 — Upload to Roblox as Model (Open Cloud doesn't accept Mesh assetType
  // for raw glb; it always wraps as Model — we extract the inner Mesh next).
  const upload = await uploadAssetToRoblox({
    apiKey,
    creatorId,
    creatorType: 'User',
    assetType: 'Model',
    name: `disaster-${keyword}`.slice(0, 50),
    description: `Auto-generated disaster mesh for "${keyword}" (Kami Gold)`,
    fileContent: glbBuf,
    contentType: 'model/gltf-binary',
    assetPrivacy: 'openUse',
  });
  if (!upload?.assetId) {
    logger.warn('[disasterMeshFactory] Open Cloud upload failed', {
      keyword, operationId: upload?.operationId,
    });
    return null;
  }
  const modelAssetId = upload.assetId;
  logger.info('[disasterMeshFactory] uploaded as Model', { keyword, modelAssetId });

  // Step 4 — Extract inner Mesh asset id via Engine API.
  const extract = await extractMeshIdFromModel(modelAssetId);
  if (!extract || !extract.meshId || extract.meshId <= 0) {
    logger.warn('[disasterMeshFactory] inner Mesh extraction failed', {
      keyword, modelAssetId, state: extract?.state, error: extract?.error,
    });
    // Even if extraction failed we cache the modelAssetId so subsequent
    // requests don't re-burn Meshy budget on the same keyword. The Lua
    // fallback path will pick up branded primitives when meshAssetId is 0.
    await docRef.set({
      keyword, prompt, modelAssetId, meshAssetId: 0, createdAtMs: Date.now(),
      extractFailReason: extract?.state ?? 'unknown',
    }).catch(() => {});
    return null;
  }
  const meshAssetId = extract.meshId;
  logger.info('[disasterMeshFactory] extracted inner Mesh id', {
    keyword, modelAssetId, meshAssetId,
  });

  // Step 5 — Cache.
  const cached: CachedDisasterMesh = {
    keyword, prompt, modelAssetId, meshAssetId, createdAtMs: Date.now(),
  };
  await docRef.set(cached).catch((err) => {
    logger.warn('[disasterMeshFactory] cache write failed (returning anyway)',
      { err: err instanceof Error ? err.message : String(err) });
  });

  return cached;
}
