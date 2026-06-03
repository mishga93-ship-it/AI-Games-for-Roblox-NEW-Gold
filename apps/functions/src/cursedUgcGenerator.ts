// cursedUgcGenerator.ts — AI meme/cursed UGC concept generator (session 384).
//
// Pipeline:
//   1. Build flux prompts for: main image + cuter variation + more-cursed variation.
//   2. Fire 3 flux text-to-image calls in parallel (schnell-class for speed).
//   3. Upload all 3 to Firebase Storage with v4 signed URLs (mirror Glow-Up).
//   4. Single Anthropic call generates ALL metadata: title, description,
//      tags, share caption, rarity vibe, fake price, fake stats.
//   5. Return composed result. ~6-10s total (flux dominates).

import { logger } from 'firebase-functions/v2';
import { getStorage } from 'firebase-admin/storage';
import { v4 as uuidv4 } from 'uuid';
import { generatePreviewTexture, runChatProvider, runMeshy } from './providers.js';
import { getRobloxOpenCloudApiKey, getRobloxCreatorId } from './config.js';
import { extractMeshIdFromModel } from './extractMeshIdFromModel.js';
import type { RobloxBuildManifest } from './types.js';
// Session 390 round 11 — Blender mesh re-export. Raw Meshy v6 GLBs don't
// load in iOS MDLAsset (asset.count=0 → empty SCN viewer). NPC chats render
// fine because character_3d pipeline runs the mesh through the Cloud Run
// worker's /optimize-mesh endpoint, which re-exports via Blender's glTF
// exporter (export_materials='EXPORT') into a clean MDLAsset-compatible GLB
// with textures embedded. We reuse that exact step for cursed UGC.
import {
  optimizeMeshAsset,
  uploadAssetToRoblox,
  pollRobloxOperation,
  maybeBuildRobloxBinary,
  convertToFbx,
} from './robloxWorker.js';
import {
  buildCursedUGCPrompt,
  CURSED_UGC_CATEGORIES,
  CURSED_UGC_STYLES,
  type CursedUGCCategoryId,
  type CursedUGCStyleId,
  type CursedUGCIntensity,
} from './data/cursedUgcCategories.js';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT ?? 'roblox-ai-generator-v2-2-ios';
const BUCKETS = [
  'roblox-ai-gen-v2-artifacts',
  `${PROJECT_ID}.firebasestorage.app`,
  `${PROJECT_ID}.appspot.com`,
];
let _bucket: ReturnType<ReturnType<typeof getStorage>['bucket']> | null = null;
async function bucket() {
  if (_bucket) return _bucket;
  for (const name of BUCKETS) {
    try {
      const c = getStorage().bucket(name);
      const [ok] = await c.exists();
      if (ok) { _bucket = c; return c; }
    } catch { /* try next */ }
  }
  _bucket = getStorage().bucket(BUCKETS[0]);
  return _bucket;
}

async function uploadSigned(args: {
  firebaseUid: string;
  filename: string;
  buf: Buffer;
  contentType?: string;
  /** Session 390 round 13 — mesh re-host passes false to MATCH the NPC
   * pipeline's copyExternalArtifact signing (which omits `version` →
   * library default, NOT v4). NPC GLBs render in iOS SceneKit; cursed
   * ones (structurally identical Blender GLBs) didn't — the only
   * remaining backend difference was this v4 vs default signed-URL form.
   * PNG callers keep v4 (default true) — they already work via AsyncImage. */
  useV4?: boolean;
}): Promise<string> {
  const b = await bucket();
  const path = `cursed-ugc/${args.firebaseUid}/${Date.now()}-${args.filename}`;
  const file = b.file(path);
  await file.save(args.buf, { contentType: args.contentType ?? 'image/png', resumable: false });
  const [url] = await file.getSignedUrl(
    (args.useV4 ?? true)
      ? { version: 'v4', action: 'read', expires: Date.now() + 7 * 24 * 60 * 60 * 1000 }
      : { action: 'read', expires: Date.now() + 7 * 24 * 60 * 60 * 1000 },
  );
  return url;
}

// Session 390 round 6 — re-host Meshy GLB through Firebase Storage so iOS
// can download it cleanly. NPC pipeline (which renders 3D fine in iOS via
// the same RealModel3DPreview component) uses copyExternalArtifact for
// this — fetches Meshy's signed fal.media URL server-side, re-uploads to
// our Firebase Storage bucket, and hands iOS a Firebase Storage signed
// URL. iOS direct downloads from fal.media silently fail (CORS or
// content-disposition: attachment quirks), so the 3D preview ended up
// blank despite meshUrl being non-null.
async function rehostMeshBinary(args: {
  firebaseUid: string;
  url: string;
  filename: string;
  contentType: string;
}): Promise<string | undefined> {
  try {
    const resp = await fetch(args.url, { signal: AbortSignal.timeout(45_000) });
    if (!resp.ok) {
      logger.warn('[cursedUgcGenerator] mesh re-host fetch failed', {
        status: resp.status, filename: args.filename,
      });
      return undefined;
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    // Round 13 — mesh binaries use default (non-v4) signing to match the
    // NPC copyExternalArtifact path that renders fine in iOS SceneKit.
    const isMesh = /\.(glb|usdz|gltf|fbx|obj)$/i.test(args.filename);
    return await uploadSigned({
      firebaseUid: args.firebaseUid,
      filename: args.filename,
      buf,
      contentType: args.contentType,
      useV4: !isMesh,
    });
  } catch (err) {
    logger.warn('[cursedUgcGenerator] mesh re-host failed (non-fatal)', {
      err: err instanceof Error ? err.message : String(err),
      filename: args.filename,
    });
    return undefined;
  }
}

async function fluxOnceToSignedUrl(args: {
  prompt: string;
  firebaseUid: string;
  filename: string;
}): Promise<string | undefined> {
  try {
    // 'prop' (not 'character') — these 2D concepts are the cursed ITEM
    // (backpack / plushie / cursed face), shown alongside the item_tool
    // Meshy hero. 'character' wraps the prompt in a full-body A-pose avatar
    // template, which is why the chat was rendering people instead of items.
    // 'prop' renders "Single 3D object centered on white background ... Do
    // NOT include ... people, or characters." — matching meshyOnceFor.
    const fluxUrl = await generatePreviewTexture(args.prompt, 'roblox', 'prop');
    if (!fluxUrl) return undefined;
    const resp = await fetch(fluxUrl, { signal: AbortSignal.timeout(20_000) });
    if (!resp.ok) return undefined;
    const buf = Buffer.from(await resp.arrayBuffer());
    return await uploadSigned({ ...args, buf });
  } catch (err) {
    logger.warn('[cursedUgcGenerator] flux step failed', {
      filename: args.filename,
      err: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
}

// ─── Real .rbxm assembly (session 396) ──────────────────────────
//
// The chat already returns the optimized GLB (great for the iOS rotatable
// viewer), but the user asked for a real .rbxm of the FINISHED item that
// opens in Roblox Studio. A renderable Roblox item = a Model with a single
// static MeshPart whose MeshContent is an `rbxassetid://` — raw https GLB
// URLs do NOT render in the Roblox runtime. So we mirror the proven
// disaster/vehicle Open-Cloud path:
//   1. upload the optimized GLB to Open Cloud as a Model asset (openUse),
//   2. poll the async operation for the Model assetId,
//   3. extract the INNER mesh + texture asset ids via the Engine API,
//   4. hand-build a one-MeshPart Model manifest and let the Lune worker
//      serialize it to .rbxm bytes,
//   5. re-host the .rbxm in Firebase Storage and return its signed URL.
// Any missing credential or failed step returns undefined → the chat ships
// the GLB alone, exactly as before (no regression).
async function buildCursedItemRbxmUrl(args: {
  glbUrl: string;
  title: string;
  firebaseUid: string;
}): Promise<string | undefined> {
  const apiKey = getRobloxOpenCloudApiKey();
  const creatorId = getRobloxCreatorId();
  if (!apiKey || !creatorId) {
    logger.info('[cursedUgcGenerator] .rbxm skipped — Open Cloud not configured');
    return undefined;
  }
  try {
    // 1. Download the optimized GLB.
    const resp = await fetch(args.glbUrl, { signal: AbortSignal.timeout(45_000) });
    if (!resp.ok) {
      logger.warn('[cursedUgcGenerator] .rbxm: GLB download failed', { status: resp.status });
      return undefined;
    }
    const glbBuf = Buffer.from(await resp.arrayBuffer());

    // 2. Upload to Open Cloud as a Model (openUse so non-owner Studios load it).
    const upload = await uploadAssetToRoblox({
      apiKey,
      creatorId,
      creatorType: 'User',
      assetType: 'Model',
      name: `Cursed ${args.title}`.slice(0, 50),
      description: `AI-generated cursed UGC item — ${args.title}`.slice(0, 1000),
      fileContent: glbBuf,
      contentType: 'model/gltf-binary',
      assetPrivacy: 'openUse',
    });
    if (!upload) {
      logger.warn('[cursedUgcGenerator] .rbxm: Open Cloud upload returned null');
      return undefined;
    }
    let modelAssetId = upload.assetId;
    if ((!modelAssetId || modelAssetId <= 0) && upload.operationId) {
      const polled = await pollRobloxOperation(apiKey, upload.operationId, 'api-key', 30, 2000);
      if (polled && polled > 0) modelAssetId = polled;
    }
    if (!modelAssetId || modelAssetId <= 0) {
      logger.warn('[cursedUgcGenerator] .rbxm: no modelAssetId after poll', { operationId: upload.operationId });
      return undefined;
    }

    // 3. Extract the inner Mesh + Texture asset ids via the Engine API.
    const extract = await extractMeshIdFromModel(modelAssetId);
    if (!extract || !extract.meshId || extract.meshId <= 0) {
      logger.warn('[cursedUgcGenerator] .rbxm: inner mesh extraction failed', {
        modelAssetId, state: extract?.state, error: extract?.error,
      });
      return undefined;
    }
    const meshAssetId = extract.meshId;
    const textureAssetId = extract.textureId && extract.textureId > 0 ? extract.textureId : undefined;
    const size = extract.meshSize && extract.meshSize.x > 0 && extract.meshSize.y > 0 && extract.meshSize.z > 0
      ? extract.meshSize
      : { x: 4, y: 4, z: 4 };

    // 4. Hand-build a minimal one-MeshPart Model manifest. Static MeshContent
    //    (string rbxassetid://) renders in Studio + runtime; white Color3 is an
    //    identity tint so the baked Meshy texture shows through (mirrors the
    //    vehicle mesh-body path). The ModuleScript satisfies the manifest
    //    validator's "≥1 script" requirement and lives inside the item.
    const meshPartId = uuidv4();
    const partName = args.title.replace(/[^A-Za-z0-9_]/g, '').slice(0, 40) || 'CursedItem';
    const meshProps: Record<string, unknown> = {
      Size: { __type: 'Vector3', x: size.x, y: size.y, z: size.z },
      Anchored: true,
      CanCollide: true,
      Color: { __type: 'Color3', r: 1, g: 1, b: 1 },
      Material: { __type: 'Enum', enumType: 'Material', enumName: 'SmoothPlastic' },
      MeshContent: `rbxassetid://${meshAssetId}`,
      MeshId: `rbxassetid://${meshAssetId}`,
    };
    if (textureAssetId) {
      meshProps.TextureID = `rbxassetid://${textureAssetId}`;
      meshProps.TextureContent = `rbxassetid://${textureAssetId}`;
    }
    const manifest: RobloxBuildManifest = {
      id: uuidv4(),
      title: partName,
      summary: `Cursed UGC item — ${args.title}`,
      target: 'model',
      rootClassName: 'Model',
      formatPreference: 'binary',
      scene: [
        { id: meshPartId, className: 'MeshPart', name: partName, properties: meshProps },
      ],
      scripts: [
        {
          id: uuidv4(),
          name: 'ItemInfo',
          scriptType: 'ModuleScript',
          container: meshPartId,
          source: `-- ${args.title}\n-- AI-generated cursed UGC item.\nreturn { meshAssetId = ${meshAssetId}${textureAssetId ? `, textureAssetId = ${textureAssetId}` : ''} }\n`,
        },
      ],
      assets: [],
    };

    const built = await maybeBuildRobloxBinary(manifest);
    if (built?.format === 'binary' && built.bufferBase64) {
      const buf = Buffer.from(built.bufferBase64, 'base64');
      const url = await uploadSigned({
        firebaseUid: args.firebaseUid,
        filename: 'cursed-item.rbxm',
        buf,
        contentType: 'application/octet-stream',
        useV4: false,
      });
      logger.info('[cursedUgcGenerator] .rbxm built', { bytes: buf.length, meshAssetId, textureAssetId });
      return url;
    }
    logger.warn('[cursedUgcGenerator] .rbxm: worker did not return binary', {
      format: built?.format, notes: built?.notes,
    });
    return undefined;
  } catch (err) {
    logger.warn('[cursedUgcGenerator] .rbxm build failed (non-fatal)', {
      err: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
}

// ─── Real .fbx export (session 406) ─────────────────────────────
//
// The honest deliverable marketing asked for: a real .fbx the user imports
// into Roblox Studio (Avatar → Import 3D) to publish as their own UGC item.
//
// Source = the Blender-OPTIMIZED GLB (textures embedded), NOT Meshy's raw FBX
// (whose PBR maps live in separate files → imports textureless). We run it
// through the worker's /convert-to-fbx (glb_to_fbx.py), which embeds textures
// (embed_textures=True, path_mode='COPY') and clamps every map to ≤1024px —
// the exact fix for Studio's "Material_0 — Upload failed" on FBX import.
//
// Non-fatal + degrades cleanly: if the worker is unreachable, convertToFbx's
// fallback returns the GLB bytes unchanged (outputExtension='glb'); we only
// ship a .fbx when the worker actually produced one, so the UI never offers a
// GLB mislabeled as FBX — it falls back to .rbxm / .glb instead.
async function buildCursedItemFbxUrl(args: {
  glbUrl: string;
  title: string;
  firebaseUid: string;
}): Promise<string | undefined> {
  try {
    const result = await convertToFbx({ sourceUrl: args.glbUrl, title: `Cursed ${args.title}`.slice(0, 50) });
    if (result.outputExtension !== 'fbx' || !result.outputBase64) {
      logger.warn('[cursedUgcGenerator] .fbx skipped — worker did not return FBX', {
        ext: result.outputExtension,
      });
      return undefined;
    }
    const buf = Buffer.from(result.outputBase64, 'base64');
    const url = await uploadSigned({
      firebaseUid: args.firebaseUid,
      filename: 'cursed-item.fbx',
      buf,
      contentType: result.outputMimeType || 'model/fbx',
      useV4: false,
    });
    logger.info('[cursedUgcGenerator] .fbx built', { bytes: buf.length });
    return url;
  } catch (err) {
    logger.warn('[cursedUgcGenerator] .fbx build failed (non-fatal)', {
      err: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
}

// ─── AI metadata via Anthropic (single JSON call) ───────────────

export interface CursedUGCMetadata {
  titleEN: string;
  titleRU: string;
  descriptionEN: string;
  descriptionRU: string;
  tags: string[];
  shareCaption: string;
  rarityVibeEN: string;
  rarityVibeRU: string;
  fakePriceRobux: number;
  fakeStats: {
    wishlistedBy: string;     // "42K", "999K", "1.2M"
    trendingRank: number;     // 1-15
    bannedInCountries: number; // 0-7
    daysLeft: string;          // "Limited 2d", "Forever", "Expired"
  };
}

async function generateMetadata(args: {
  categoryId: CursedUGCCategoryId;
  styleId: CursedUGCStyleId;
  intensity: CursedUGCIntensity;
  userPrompt?: string;
}): Promise<CursedUGCMetadata> {
  const cat = CURSED_UGC_CATEGORIES[args.categoryId];
  const sty = CURSED_UGC_STYLES[args.styleId];
  const userClause = args.userPrompt?.trim() ? ` User idea: "${args.userPrompt.trim().slice(0, 80)}".` : '';

  const prompt = [
    'You are writing FAKE Roblox UGC item metadata for an absurd cursed-meme generator (NOT a real Roblox marketplace listing — this is a meme).',
    `Category: ${cat.titleEN} (${cat.pitchEN})`,
    `Style: ${sty.titleEN}`,
    `Intensity: ${args.intensity}.${userClause}`,
    'Return ONE JSON object with EXACTLY these keys, no markdown:',
    '{',
    '  "titleEN": "Cursed Sigma Hamster Backpack" (4-7 words, absurd-funny),',
    '  "titleRU": "Куршед Сигма Хомяк Рюкзак" (RU version of the same item),',
    '  "descriptionEN": "Looks emotionally unstable but premium." (1 sentence, meme),',
    '  "descriptionRU": "RU version, 1 sentence",',
    '  "tags": ["cursed","brainrot","sigma","limited","meme"] (5-7 lowercase tags),',
    '  "shareCaption": "bro Roblox needs to add this 💀" (short TikTok-friendly),',
    '  "rarityVibeEN": "Legendary Meme" (cursed marketplace tier — e.g. "Mythic Cursed", "Brainrot Tier", "Limited Cringe"),',
    '  "rarityVibeRU": "RU version",',
    '  "fakePriceRobux": 75000 (absurdly high or weirdly low: pick from [99, 666, 999, 4200, 13337, 31337, 69420, 75000, 99999, 250000, 666666, 999999]),',
    '  "fakeStats": {',
    '     "wishlistedBy": "42K" (random K/M number, formatted),',
    '     "trendingRank": 3 (1-15),',
    '     "bannedInCountries": 2 (0-7),',
    '     "daysLeft": "Limited 2d" (or "Forever", "Expired", "Limited 13h")',
    '   }',
    '}',
    'Output JSON ONLY, no preamble, no markdown, no comments.',
  ].join('\n');

  try {
    const result = await runChatProvider('anthropic', prompt, undefined, { timeoutMs: 15_000 });
    const text = (result.text ?? '').trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('no JSON in LLM response');
    const parsed = JSON.parse(match[0]) as Partial<CursedUGCMetadata>;
    // Validate + coerce.
    return {
      titleEN: typeof parsed.titleEN === 'string' ? parsed.titleEN : `Cursed ${cat.titleEN}`,
      titleRU: typeof parsed.titleRU === 'string' ? parsed.titleRU : `Куршед ${cat.titleRU}`,
      descriptionEN: typeof parsed.descriptionEN === 'string' ? parsed.descriptionEN : 'Cursed energy, premium price.',
      descriptionRU: typeof parsed.descriptionRU === 'string' ? parsed.descriptionRU : 'Куршед энергия, премиум прайс.',
      tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 7).map((t) => String(t).toLowerCase()) : ['cursed', 'meme'],
      shareCaption: typeof parsed.shareCaption === 'string' ? parsed.shareCaption : 'bro Roblox needs to add this 💀',
      rarityVibeEN: typeof parsed.rarityVibeEN === 'string' ? parsed.rarityVibeEN : 'Legendary Meme',
      rarityVibeRU: typeof parsed.rarityVibeRU === 'string' ? parsed.rarityVibeRU : 'Легендарный Мем',
      fakePriceRobux: typeof parsed.fakePriceRobux === 'number' ? parsed.fakePriceRobux : 75000,
      fakeStats: {
        wishlistedBy: typeof parsed.fakeStats?.wishlistedBy === 'string' ? parsed.fakeStats.wishlistedBy : '42K',
        trendingRank: typeof parsed.fakeStats?.trendingRank === 'number' ? parsed.fakeStats.trendingRank : 3,
        bannedInCountries: typeof parsed.fakeStats?.bannedInCountries === 'number' ? parsed.fakeStats.bannedInCountries : 2,
        daysLeft: typeof parsed.fakeStats?.daysLeft === 'string' ? parsed.fakeStats.daysLeft : 'Limited 2d',
      },
    };
  } catch (err) {
    logger.warn('[cursedUgcGenerator] metadata LLM failed; using fallback', { err: err instanceof Error ? err.message : String(err) });
    return {
      titleEN: `Cursed ${cat.titleEN}`,
      titleRU: `Куршед ${cat.titleRU}`,
      descriptionEN: 'Cursed energy, premium price.',
      descriptionRU: 'Куршед энергия, премиум прайс.',
      tags: ['cursed', 'meme', sty.id],
      shareCaption: 'bro Roblox needs to add this 💀',
      rarityVibeEN: 'Legendary Meme',
      rarityVibeRU: 'Легендарный Мем',
      fakePriceRobux: 75000,
      fakeStats: { wishlistedBy: '42K', trendingRank: 3, bannedInCountries: 2, daysLeft: 'Limited 2d' },
    };
  }
}

// ─── Public entry ───────────────────────────────────────────────

export interface CursedUGCInput {
  categoryId: CursedUGCCategoryId;
  styleId: CursedUGCStyleId;
  intensity: CursedUGCIntensity;
  userPrompt?: string;
  firebaseUid: string;
}

export interface CursedUGCResult extends CursedUGCMetadata {
  generationId: string;
  categoryId: CursedUGCCategoryId;
  styleId: CursedUGCStyleId;
  intensity: CursedUGCIntensity;
  mainImageUrl?: string;
  /**
   * Session 390 — Meshy v6 GLB URL for the 3D mesh of the cursed item, so the
   * iOS result screen can render a rotatable SceneKit viewer instead of the
   * 2D flux concept. Optional: if Meshy times out or fails, the UI falls
   * back to mainImageUrl (2D PNG).
   */
  meshUrl?: string;
  /** Meshy v6 PNG thumbnail of the rendered 3D model (different from the
   *  flux 2D concept — this one actually represents the mesh that ships). */
  meshThumbnailUrl?: string;
  /**
   * Session 396 — real Roblox .rbxm of the finished item: a single static
   * MeshPart whose MeshContent points at an rbxassetid:// (the optimized GLB
   * uploaded to Open Cloud). Opens directly in Studio and renders in-game.
   * Undefined when Open Cloud / Engine API isn't configured or any build step
   * fails — the chat then ships the GLB alone (no regression).
   */
  rbxmUrl?: string;
  /**
   * Session 406 — real textured .fbx of the finished item, built from the
   * Blender-optimized GLB via the worker's /convert-to-fbx (glb_to_fbx.py:
   * embeds textures, clamps maps to ≤1024px). This is the format the user
   * imports into Roblox Studio (Avatar → Import 3D) to publish their own UGC.
   * Undefined when the FBX worker is unreachable → UI falls back to .rbxm/.glb.
   */
  fbxUrl?: string;
  variations: Array<{ label: string; imageUrl?: string }>;
  generationStatus: 'ready' | 'partial' | 'failed';
}

// Session 390 — Meshy v6 text-to-3D wrapper for cursed UGC. Returns undefined
// on any failure / timeout so the main flow keeps going on 2D images alone.
//
// Round 3 — bumped timeout 75s → 180s after prod logs showed Meshy
// completing at ~131s.
//
// Round 7 (session 390 round 7) — bumped 180s → 250s after prod logs from
// 2026-05-29T04:25:11 showed a 37-attempt poll completing at 04:28:12
// (~181s wall-clock); the 180s timer fired 11s before COMPLETED, the
// generator fell back to 2D, but the GLB was already paid for and arrived
// 11s later — same wasted spend pattern as round 2. Cloud Run function
// timeout is 300s, so 250s leaves ~50s headroom for the recordViralGen
// Firestore write + push notification path.
async function meshyOnceFor(args: {
  prompt: string;
  contentSubcategory?: string;
  firebaseUid: string;
}): Promise<{ meshUrl?: string; thumbnailUrl?: string } | undefined> {
  try {
    const meshyPromise = runMeshy(args.prompt, {
      // Session 390 round 5 — switched from 'character' → 'item_tool'.
      //
      // 'character' triggers runMeshy's `isCharacterContent` branch, which
      // makes build3DPrompt rewrite the prompt to demand a humanoid
      // standing in T-pose ("Stylized low-poly 3D game character standing
      // upright in a neutral resting pose: arms hanging straight down..."),
      // discarding the original cursed-item description entirely. Prod
      // logs from 2026-05-28T13:37:09 and 2026-05-29T03:35:51 showed the
      // ORIGINAL prompt was «A massively oversized Roblox UGC backpack
      // that is comically larger than the avatar wearing it» and the
      // CLEAN prompt sent to Meshy was «Cursed UGC Item. Stylized low-
      // poly 3D game character. Standing upright in a neutral resting
      // pose...» — Meshy then generated a full sigma chad with a
      // backpack baked onto his torso instead of a standalone backpack.
      // The resulting GLB was multi-MB of character mesh, which the iOS
      // viewer struggled to load → empty 3D preview.
      //
      // 'item_tool' keeps the original item-centric prompt intact AND
      // bolts on a strong negative prompt ('human body, person,
      // character, hands holding, body, face, mannequin, background
      // scene...') so Meshy renders the cursed accessory alone on a
      // clean background, matching the flux 2D concepts the user sees
      // alongside it.
      contentCategory: 'item_tool',
      contentSubcategory: args.contentSubcategory ?? 'cursed_ugc',
      title: 'Cursed UGC Item',
    });
    const timeoutPromise = new Promise<undefined>((resolve) =>
      setTimeout(() => resolve(undefined), 250_000),
    );
    const winner = await Promise.race([meshyPromise, timeoutPromise]);
    if (!winner) {
      logger.warn('[cursedUgcGenerator] Meshy timed out at 250s — falling back to 2D-only result');
      return undefined;
    }
    const raw = winner.raw as Record<string, unknown> | undefined;
    // Session 390 round 10 — switched back USDZ → GLB after the round-9
    // USDZ render came up TEXTURELESS (mono-orange mesh, user: «почему
    // цвета такие странные… смотри нпс там все настроено»).
    //
    // Root cause: iOS RealModel3DPreview has two code paths —
    //   GLB:  MDLAsset(url) + asset.loadTextures() → SCNScene(mdlAsset:)
    //   USDZ: SCNScene(url:)  (no loadTextures call)
    // Meshy v6 USDZ stores its base-color map in a way SCNScene(url:)
    // doesn't apply on a re-hosted single file, so geometry renders but
    // every surface falls back to the material's baseColorFactor
    // (the orange tint). The GLB, by contrast, embeds the base-color as
    // an image/jpeg bufferView INSIDE the binary (verified:
    // images:[{mimeType:'image/jpeg',bufferView:4}], 1 texture, material
    // with baseColorTexture) — and the GLB path's asset.loadTextures()
    // pulls it in. That's exactly why NPC chats (same RealModel3DPreview,
    // GLB format) show correct textures.
    //
    // The earlier "blank GLB" rounds (4-5) were the raw fal.media URL +
    // character-mesh issues, both fixed since (item_tool prompt + Firebase
    // Storage re-host). GLB never got a fair 3D test after those fixes
    // because round 8 hid meshUrl and round 9 jumped straight to USDZ.
    const usdzUrlRaw = typeof raw?.usdzUrl === 'string'
      ? (raw.usdzUrl as string)
      : undefined;
    const glbUrlRaw = winner.outputUrl
      ?? (typeof raw?.modelUrl === 'string' ? (raw.modelUrl as string) : undefined);
    const meshUrlRaw = glbUrlRaw ?? usdzUrlRaw;  // prefer GLB (embedded textures)
    const thumbnailUrlRaw = typeof raw?.thumbnailUrl === 'string'
      ? (raw.thumbnailUrl as string)
      : undefined;

    logger.info('[cursedUgcGenerator] Meshy v6 URLs available', {
      hasGlb: !!glbUrlRaw,
      hasUsdz: !!usdzUrlRaw,
      meshFormatChosen: glbUrlRaw ? 'glb' : 'usdz',
      hasThumbnail: !!thumbnailUrlRaw,
      hasFbx: !!(raw?.fbxUrl),
      hasObj: !!(raw?.objUrl),
    });

    // Session 390 round 11 — run the GLB through the Cloud Run worker's
    // Blender /optimize-mesh re-export (export_materials='EXPORT'), the
    // SAME step the character_3d pipeline applies — which is the only
    // reason NPC GLBs load in iOS MDLAsset. Raw Meshy GLBs fail MDLAsset
    // (asset.count=0 → blank viewer); Blender re-export rewrites them into
    // a clean, MDLAsset-compatible binary with textures embedded.
    //
    // optimizeMeshAsset returns base64 of the re-exported GLB; we decode +
    // upload to Firebase Storage. On ANY failure (worker down, Blender
    // passthrough, non-200) we fall back to re-hosting the raw GLB — same
    // behavior as before, so we never regress to "no mesh at all".
    const meshUrl = await (async (): Promise<string | undefined> => {
      if (!glbUrlRaw) {
        // No GLB at all — re-host whatever mesh URL we have (likely USDZ).
        return meshUrlRaw
          ? (await rehostMeshBinary({
              firebaseUid: args.firebaseUid,
              url: meshUrlRaw,
              filename: usdzUrlRaw ? 'mesh.usdz' : 'mesh.glb',
              contentType: usdzUrlRaw ? 'model/vnd.usdz+zip' : 'model/gltf-binary',
            })) ?? meshUrlRaw
          : undefined;
      }
      try {
        const optimized = await optimizeMeshAsset({
          sourceUrl: glbUrlRaw,
          title: 'Cursed UGC Item',
          metadata: { contentCategory: 'item_tool', source: 'cursed_ugc' },
        });
        if (optimized?.outputBase64) {
          const buf = Buffer.from(optimized.outputBase64, 'base64');
          const ext = (optimized.outputExtension || 'glb').replace(/^\./, '');
          const url = await uploadSigned({
            firebaseUid: args.firebaseUid,
            filename: `mesh-optimized.${ext}`,
            buf,
            contentType: optimized.outputMimeType || 'model/gltf-binary',
            useV4: false,  // match NPC copyExternalArtifact signing (round 13)
          });
          logger.info('[cursedUgcGenerator] Blender-optimized GLB hosted', {
            method: typeof optimized.metadata?.method === 'string' ? optimized.metadata.method : 'unknown',
            bytes: buf.length,
            ext,
          });
          return url;
        }
        logger.warn('[cursedUgcGenerator] optimizeMeshAsset returned no base64 — re-hosting raw GLB');
      } catch (optErr) {
        logger.warn('[cursedUgcGenerator] Blender optimize failed — re-hosting raw GLB', {
          err: optErr instanceof Error ? optErr.message : String(optErr),
        });
      }
      // Fallback — re-host the raw Meshy GLB (may still fail MDLAsset, but
      // better than dropping the mesh entirely).
      return (await rehostMeshBinary({
        firebaseUid: args.firebaseUid,
        url: glbUrlRaw,
        filename: 'mesh.glb',
        contentType: 'model/gltf-binary',
      })) ?? glbUrlRaw;
    })();

    const thumbnailUrl = thumbnailUrlRaw
      ? (await rehostMeshBinary({
          firebaseUid: args.firebaseUid,
          url: thumbnailUrlRaw,
          filename: 'mesh-thumb.png',
          contentType: 'image/png',
        })) ?? thumbnailUrlRaw
      : undefined;

    return { meshUrl, thumbnailUrl };
  } catch (err) {
    logger.warn('[cursedUgcGenerator] Meshy 3D step failed (non-fatal)', {
      err: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
}

export async function generateCursedUGC(input: CursedUGCInput): Promise<CursedUGCResult> {
  const generationId = `cugc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  // 3 flux calls + 1 LLM metadata call + 1 Meshy 3D call — all in parallel.
  // Meshy is the slowest (~30-60s); flux is ~6-10s; LLM is ~3-6s. With
  // Promise.all the total wall-clock is the max of these. The Meshy call
  // wraps a 75s soft timeout so a stuck mesh stage can't block the result.
  const mainPrompt = buildCursedUGCPrompt({ category: input.categoryId, style: input.styleId, intensity: input.intensity, userPrompt: input.userPrompt });
  const cuterPrompt = buildCursedUGCPrompt({ category: input.categoryId, style: input.styleId, intensity: input.intensity, userPrompt: input.userPrompt, variationOverride: 'cuter' });
  const cursedPrompt = buildCursedUGCPrompt({ category: input.categoryId, style: input.styleId, intensity: input.intensity, userPrompt: input.userPrompt, variationOverride: 'more_cursed' });

  const [mainImageUrl, cuterUrl, cursedUrl, metadata, mesh] = await Promise.all([
    fluxOnceToSignedUrl({ prompt: mainPrompt, firebaseUid: input.firebaseUid, filename: 'main.png' }),
    fluxOnceToSignedUrl({ prompt: cuterPrompt, firebaseUid: input.firebaseUid, filename: 'cuter.png' }),
    fluxOnceToSignedUrl({ prompt: cursedPrompt, firebaseUid: input.firebaseUid, filename: 'cursed.png' }),
    generateMetadata({
      categoryId: input.categoryId,
      styleId: input.styleId,
      intensity: input.intensity,
      userPrompt: input.userPrompt,
    }),
    meshyOnceFor({ prompt: mainPrompt, contentSubcategory: 'cursed_ugc', firebaseUid: input.firebaseUid }),
  ]);

  const variations: Array<{ label: string; imageUrl?: string }> = [
    { label: 'cuter',       imageUrl: cuterUrl },
    { label: 'more_cursed', imageUrl: cursedUrl },
  ];

  const generationStatus: 'ready' | 'partial' | 'failed' =
    (mainImageUrl || mesh?.thumbnailUrl) ? (cuterUrl && cursedUrl ? 'ready' : 'partial') : 'failed';

  // Session 396 + 406 — assemble the finished-item exports from the optimized
  // GLB: a real .rbxm (drop straight into Studio) AND a real textured .fbx
  // (import via Avatar → Import 3D to publish as UGC). Run in parallel — both
  // consume the same hosted GLB URL — so their latencies don't stack on top of
  // Meshy inside the 300s function budget. Each is bounded + non-fatal:
  // returns undefined on failure so the GLB still ships.
  const [rbxmUrl, fbxUrl] = mesh?.meshUrl
    ? await Promise.all([
        buildCursedItemRbxmUrl({ glbUrl: mesh.meshUrl, title: metadata.titleEN, firebaseUid: input.firebaseUid }),
        buildCursedItemFbxUrl({ glbUrl: mesh.meshUrl, title: metadata.titleEN, firebaseUid: input.firebaseUid }),
      ])
    : [undefined, undefined];

  // Session 390 round 9 — keep mainImageUrl as the flux concept again.
  // With USDZ working in RealModel3DPreview, iOS shows the rotatable
  // 3D mesh as the hero (mesh.meshUrl set). mainImageUrl + meshThumbnail
  // remain available as fallbacks (when Meshy times out, when iOS opts
  // out of 3D, when the share-poster needs a static visual).
  return {
    generationId,
    categoryId: input.categoryId,
    styleId: input.styleId,
    intensity: input.intensity,
    mainImageUrl,
    meshUrl: mesh?.meshUrl,
    meshThumbnailUrl: mesh?.thumbnailUrl,
    rbxmUrl,
    fbxUrl,
    variations,
    generationStatus,
    ...metadata,
  };
}
