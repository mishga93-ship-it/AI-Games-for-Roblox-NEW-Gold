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
  /** Inner Texture asset id extracted from the Model wrapper (Meshy bakes a
   * PBR ColorMap into every .glb; without this, MeshPart renders white). */
  textureAssetId?: number;
  /** Natural bounding-box of the inner MeshPart in studs (XYZ). Used to
   * preserve the mesh aspect ratio at spawn time — without this we forced a
   * cubic Size=8×8×8 and the user saw "распидарасило", a long banana
   * crushed into a cube. */
  naturalSize?: { x: number; y: number; z: number };
  createdAtMs: number;
}

/** Build a Meshy text-to-3d prompt biased toward isolated game-ready props.
 *
 * IMPORTANT — anti-character clauses. Meshy v6 strongly biases toward humanoid
 * outputs when it sees "stylized" + "game asset" + viral nouns like banana /
 * duck / shark. Round 8 user repro: prompt "stylized 3D banana" got back a
 * banana-headed humanoid character (arms, legs, hat). For disaster spawning
 * we want the literal OBJECT, never a person. The CATEGORY-specific override
 * below pushes Meshy hard toward the actual prop. */
export function buildMeshyPrompt(args: {
  keyword: string;
  category?: 'food' | 'household' | 'animal' | 'meme' | 'natural' | 'tech' | 'horror';
  userBrief?: string;
}): string {
  const seed = args.keyword.replace(/_/g, ' ');
  const briefClause = args.userBrief && args.userBrief.trim().length > 0
    ? ` ${args.userBrief.trim().slice(0, 120)}.`
    : '';

  // Category-specific anti-character clauses. "no character / no humanoid /
  // no person / no body / no face / no arms / no legs" reliably steers Meshy
  // away from the "banana-man with hat" failure mode and toward the literal
  // prop. The keyword interpolates into a concrete description so Meshy has
  // a clear target.
  const categoryHints: Record<string, string> = {
    food: `Literal photoreal ${seed} fruit/food, single isolated piece, NOT a character, NOT a person, NOT humanoid, NO arms, NO legs, NO face, NO hat, just the food item itself in its natural shape.`,
    household: `Literal real-world ${seed} household object, isolated prop, NOT a character, NOT humanoid, NO arms, NO legs, NO face, just the object in its natural form.`,
    animal: `Literal anatomically-correct 3D ${seed}, real animal body with appropriate four legs / fins / wings, NOT humanoid, NOT a person, NO clothing, NO hat, just the animal itself.`,
    meme: `Literal 3D ${seed} object, isolated prop, NOT a humanoid character.`,
    natural: `Literal 3D ${seed} natural object/element, isolated, NOT a character, NOT a person, no humanoid form.`,
    tech: `Literal 3D ${seed} mechanical/tech object, isolated, NOT a character, NOT humanoid, NO arms, NO legs, NO face, just the device itself.`,
    horror: `Literal 3D ${seed} creature/object as the named thing, NOT a humanoid character, NOT a person in costume.`,
  };
  const categoryClause = args.category ? categoryHints[args.category] : `Literal real-world ${seed}, isolated prop, NOT a character, NOT humanoid.`;

  return [
    categoryClause,
    `Low-poly stylized 3D model, game asset, single object centered in frame,`,
    'no background, no ground plane, no shadow, no scene, no scenery, no environment,',
    'PBR baked texture, optimized for Roblox.',
    briefClause,
  ].join(' ');
}

/** Returns cached or freshly generated `{ modelAssetId, meshAssetId }` for a
 * keyword. Returns `null` if any step in the pipeline fails — caller should
 * fall back to branded primitive composition. Pass `regenerate=true` to
 * invalidate the cache for one keyword (used by admin smoke when the cached
 * mesh shape turned out wrong — e.g. banana came back as a humanoid). */
export async function getOrCreateDisasterMesh(args: {
  keyword: string;
  category?: 'food' | 'household' | 'animal' | 'meme' | 'natural' | 'tech' | 'horror';
  userBrief?: string;
  regenerate?: boolean;
}): Promise<CachedDisasterMesh | null> {
  const keyword = args.keyword.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 32);
  if (!keyword) {
    logger.warn('[disasterMeshFactory] empty keyword after sanitize');
    return null;
  }

  const db = getFirestore();
  const docRef = db.collection(COLLECTION).doc(keyword);
  if (!args.regenerate) {
    try {
      const snap = await docRef.get();
      if (snap.exists) {
        const d = snap.data();
        if (d && typeof d.meshAssetId === 'number' && d.meshAssetId > 0) {
          logger.info('[disasterMeshFactory] cache hit', {
            keyword, meshAssetId: d.meshAssetId,
            textureAssetId: d.textureAssetId,
          });
          const naturalSize = d.naturalSize as { x?: unknown; y?: unknown; z?: unknown } | undefined;
          return {
            keyword: d.keyword ?? keyword,
            prompt: d.prompt ?? '',
            modelAssetId: typeof d.modelAssetId === 'number' ? d.modelAssetId : 0,
            meshAssetId: d.meshAssetId,
            textureAssetId: typeof d.textureAssetId === 'number' && d.textureAssetId > 0
              ? d.textureAssetId : undefined,
            naturalSize: naturalSize
              && typeof naturalSize.x === 'number'
              && typeof naturalSize.y === 'number'
              && typeof naturalSize.z === 'number'
              ? { x: naturalSize.x, y: naturalSize.y, z: naturalSize.z }
              : undefined,
            createdAtMs: typeof d.createdAtMs === 'number' ? d.createdAtMs : 0,
          };
        }
      }
    } catch (err) {
      logger.warn('[disasterMeshFactory] cache read failed (proceeding to gen)',
        { err: err instanceof Error ? err.message : String(err) });
    }
  } else {
    logger.info('[disasterMeshFactory] regenerate flag set — bypassing cache', { keyword });
  }

  const apiKey = getRobloxOpenCloudApiKey();
  const creatorId = getRobloxCreatorId();
  if (!apiKey || !creatorId) {
    logger.warn('[disasterMeshFactory] missing Open Cloud credentials — cannot generate');
    return null;
  }

  const prompt = buildMeshyPrompt({ keyword, category: args.category, userBrief: args.userBrief });
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
  if (!upload) {
    logger.warn('[disasterMeshFactory] Open Cloud upload returned null', { keyword });
    return null;
  }

  let modelAssetId = upload.assetId;
  // Open Cloud upload is asynchronous — assetId=0 with operationId means
  // Roblox is still processing the glb. Poll the operation until done.
  if (!modelAssetId && upload.operationId) {
    logger.info('[disasterMeshFactory] polling Open Cloud operation', {
      keyword, operationId: upload.operationId,
    });
    for (let attempt = 0; attempt < 60; attempt++) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const opResp = await fetch(
          `https://apis.roblox.com/assets/v1/operations/${upload.operationId}`,
          { headers: { 'x-api-key': apiKey } },
        );
        if (!opResp.ok) {
          logger.warn('[disasterMeshFactory] operation poll non-OK', {
            keyword, attempt, status: opResp.status,
          });
          continue;
        }
        const op = await opResp.json() as { done?: boolean; response?: { assetId?: number | string } };
        if (op.done) {
          const raw = op.response?.assetId;
          if (typeof raw === 'number') {
            modelAssetId = raw;
          } else if (typeof raw === 'string' && /^\d+$/.test(raw)) {
            modelAssetId = parseInt(raw, 10);
          }
          logger.info('[disasterMeshFactory] operation done', {
            keyword, attempt, modelAssetId,
          });
          break;
        }
      } catch (err) {
        logger.warn('[disasterMeshFactory] operation poll threw', {
          keyword, attempt, err: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
  if (!modelAssetId) {
    logger.warn('[disasterMeshFactory] could not resolve modelAssetId after polling', {
      keyword, operationId: upload.operationId,
    });
    return null;
  }
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
  const textureAssetId = extract.textureId && extract.textureId > 0 ? extract.textureId : undefined;
  const naturalSize = extract.meshSize ? { x: extract.meshSize.x, y: extract.meshSize.y, z: extract.meshSize.z } : undefined;
  logger.info('[disasterMeshFactory] extracted inner Mesh id', {
    keyword, modelAssetId, meshAssetId, textureAssetId, naturalSize,
  });

  // Step 5 — Cache. Texture id + natural size both feed the Lua emit:
  // texture id → SurfaceAppearance.ColorMap so MeshPart renders coloured;
  // naturalSize → aspect-preserving scale so long meshes don't get squashed
  // into a cube (user repro round 8: banana mesh distorted into blob).
  const cached: CachedDisasterMesh = {
    keyword, prompt, modelAssetId, meshAssetId, textureAssetId, naturalSize,
    createdAtMs: Date.now(),
  };
  await docRef.set(cached).catch((err) => {
    logger.warn('[disasterMeshFactory] cache write failed (returning anyway)',
      { err: err instanceof Error ? err.message : String(err) });
  });

  return cached;
}
