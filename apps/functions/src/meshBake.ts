// meshBake.ts — shared "prompt → iOS-renderable 3D GLB" helper.
//
// Session 390 round 16. Extracted from the Cursed UGC 3D saga so other
// viral features (Outfit Generator, Glow-Up, …) can get a rotatable 3D
// mesh with the SAME proven recipe, without each re-discovering the
// pitfalls:
//
//   1. runMeshy() — Meshy v6 text-to-3D (fal.ai). ~180-200s wall-clock for
//      these prompts, so we race a 250s soft timeout (Cloud Run fn cap is
//      300s). Returns the raw fal.media GLB URL.
//   2. optimizeMeshAsset() — Cloud Run worker /optimize-mesh, which re-
//      exports the GLB through Blender's glTF exporter. This is the ONLY
//      reason the GLB loads cleanly downstream (raw Meshy GLB has quirks).
//      It also keeps textures embedded.
//   3. Host the re-exported GLB in our Firebase Storage bucket with a
//      DEFAULT (non-v4) signed URL — matches copyExternalArtifact, the
//      path NPC chats use that renders fine.
//
// iOS renders the resulting GLB via WebGLBViewer (WKWebView + Google
// <model-viewer>), NOT MDLAsset — Apple ModelIO can't import GLB
// (canImportGLB=false on device). That's an iOS-side detail; this module
// just needs to produce a clean, hosted GLB URL.

import { logger } from 'firebase-functions/v2';
import { getStorage } from 'firebase-admin/storage';
import { runMeshy } from './providers.js';
import { optimizeMeshAsset } from './robloxWorker.js';

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

async function uploadSignedMesh(args: {
  firebaseUid: string;
  filename: string;
  buf: Buffer;
  contentType: string;
}): Promise<string> {
  const b = await bucket();
  const path = `mesh-bake/${args.firebaseUid}/${Date.now()}-${args.filename}`;
  const file = b.file(path);
  await file.save(args.buf, { contentType: args.contentType, resumable: false });
  // Default (non-v4) signing — matches copyExternalArtifact (NPC path).
  const [url] = await file.getSignedUrl({
    action: 'read',
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
  });
  return url;
}

export interface BakeMeshResult {
  /** Firebase Storage signed URL of the Blender-re-exported GLB (iOS-renderable). */
  meshUrl?: string;
  /** Meshy v6 PNG thumbnail (a render of the mesh), re-hosted. */
  thumbnailUrl?: string;
}

/**
 * Generate a clean, iOS-renderable 3D GLB from a text prompt.
 *
 * Returns `{}` (no meshUrl) on any failure / timeout so the caller falls
 * back to its 2D visual — never throws.
 *
 * @param contentCategory passed to runMeshy. Use 'character' for full
 *   avatars (Outfit / Glow-Up), 'item_tool' for standalone accessories
 *   (Cursed UGC). This controls build3DPrompt framing + negative prompt.
 */
export async function bakeMeshFromPrompt(args: {
  prompt: string;
  firebaseUid: string;
  contentCategory: string;
  contentSubcategory?: string;
  title?: string;
}): Promise<BakeMeshResult> {
  try {
    const meshyPromise = runMeshy(args.prompt, {
      contentCategory: args.contentCategory,
      contentSubcategory: args.contentSubcategory ?? '',
      title: args.title ?? '3D Model',
    });
    const timeoutPromise = new Promise<undefined>((resolve) =>
      setTimeout(() => resolve(undefined), 250_000),
    );
    const winner = await Promise.race([meshyPromise, timeoutPromise]);
    if (!winner) {
      logger.warn('[meshBake] Meshy timed out at 250s — caller falls back to 2D', {
        contentCategory: args.contentCategory,
      });
      return {};
    }
    const raw = winner.raw as Record<string, unknown> | undefined;
    const glbUrlRaw = winner.outputUrl
      ?? (typeof raw?.modelUrl === 'string' ? (raw.modelUrl as string) : undefined);
    const thumbnailUrlRaw = typeof raw?.thumbnailUrl === 'string' ? (raw.thumbnailUrl as string) : undefined;

    if (!glbUrlRaw) {
      logger.warn('[meshBake] Meshy returned no GLB URL', { contentCategory: args.contentCategory });
      return { thumbnailUrl: thumbnailUrlRaw };
    }

    // Blender re-export (the step that makes the GLB load cleanly).
    let meshUrl: string | undefined;
    try {
      const optimized = await optimizeMeshAsset({
        sourceUrl: glbUrlRaw,
        title: args.title ?? '3D Model',
        metadata: { contentCategory: args.contentCategory, source: 'mesh_bake' },
      });
      if (optimized?.outputBase64) {
        const buf = Buffer.from(optimized.outputBase64, 'base64');
        const ext = (optimized.outputExtension || 'glb').replace(/^\./, '');
        meshUrl = await uploadSignedMesh({
          firebaseUid: args.firebaseUid,
          filename: `mesh.${ext}`,
          buf,
          contentType: optimized.outputMimeType || 'model/gltf-binary',
        });
        logger.info('[meshBake] Blender-optimized GLB hosted', {
          bytes: buf.length, ext, contentCategory: args.contentCategory,
        });
      }
    } catch (optErr) {
      logger.warn('[meshBake] Blender optimize failed — re-hosting raw GLB', {
        err: optErr instanceof Error ? optErr.message : String(optErr),
      });
    }

    // Fallback: host the raw Meshy GLB (still better than nothing).
    if (!meshUrl) {
      try {
        const resp = await fetch(glbUrlRaw, { signal: AbortSignal.timeout(45_000) });
        if (resp.ok) {
          const buf = Buffer.from(await resp.arrayBuffer());
          meshUrl = await uploadSignedMesh({
            firebaseUid: args.firebaseUid,
            filename: 'mesh.glb',
            buf,
            contentType: 'model/gltf-binary',
          });
        }
      } catch (rehostErr) {
        logger.warn('[meshBake] raw GLB re-host failed', {
          err: rehostErr instanceof Error ? rehostErr.message : String(rehostErr),
        });
      }
    }

    // Re-host the thumbnail too (fal.media direct downloads are flaky on iOS).
    let thumbnailUrl: string | undefined;
    if (thumbnailUrlRaw) {
      try {
        const resp = await fetch(thumbnailUrlRaw, { signal: AbortSignal.timeout(20_000) });
        if (resp.ok) {
          const buf = Buffer.from(await resp.arrayBuffer());
          thumbnailUrl = await uploadSignedMesh({
            firebaseUid: args.firebaseUid,
            filename: 'mesh-thumb.png',
            buf,
            contentType: 'image/png',
          });
        }
      } catch { /* non-fatal */ }
    }

    return { meshUrl, thumbnailUrl: thumbnailUrl ?? thumbnailUrlRaw };
  } catch (err) {
    logger.warn('[meshBake] bakeMeshFromPrompt failed (non-fatal)', {
      err: err instanceof Error ? err.message : String(err),
    });
    return {};
  }
}
