// robloxCdnCache.ts — durable cache for Roblox CDN files (Fix #4 of
// session 389+5).
//
// User report: iOS 3D viewer kept hitting «HTTP 403 for t2.rbxcdn.com/
// 30DAY-…». Investigation showed Roblox S3 buckets revoke read access
// to OBJ/MTL/PNG files after a short and unpredictable window — the
// hash returned by `users/avatar-3d` is stable, but the underlying
// file can become AccessDenied minutes later.
//
// Fix: backend mirrors any CDN file we touch into OUR GCS bucket
// (`avatar-3d-cache/<sha-of-source-url>`). iOS receives signed URLs
// to OUR bucket — totally insulated from Roblox CDN rotation.
//
// Cache key = SHA-1 of the source URL (stable; same input always
// resolves to the same cached object). Content lives forever in our
// bucket; only the signed URL has a TTL (we use 7 days, the GCS v4
// signed-URL max).

import { logger } from 'firebase-functions/v2';
import { getStorage } from 'firebase-admin/storage';
import { createHash } from 'node:crypto';

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

const SIGNED_URL_TTL_MS = 7 * 24 * 60 * 60 * 1000;  // 7 days (GCS v4 max)

/**
 * Download a file from rbxcdn (or any URL), upload to our GCS bucket if
 * not already cached, and return a signed URL valid for SIGNED_URL_TTL_MS.
 *
 * `objectKey` (when supplied) becomes the GCS object name verbatim. We
 * use this so the signed URL's last path component is the ORIGINAL
 * Roblox hash — iOS extracts filenames from the URL and writes textures
 * to a temp dir using that name, then SceneKit's `map_Kd <hash>` MTL
 * lookup finds the file. Without an explicit objectKey we fall back to
 * `sha1(sourceUrl)` for a stable but opaque path.
 */
export async function cacheRobloxCdnFile(args: {
  sourceUrl: string;
  contentType: string;
  /** Optional logical name suffix (`.obj`, `.mtl`, `.png`) for storage
   *  readability — doesn't affect cache key when objectKey is set. */
  outputExtension?: string;
  /** Optional explicit GCS object name (e.g., the Roblox hash). When
   *  provided, the signed URL's last path component is this name. */
  objectKey?: string;
}): Promise<string> {
  const { sourceUrl, contentType, outputExtension, objectKey } = args;
  const key = objectKey ?? createHash('sha1').update(sourceUrl).digest('hex');
  const objectPath = outputExtension
    ? `avatar-3d-cache/${key}${outputExtension}`
    : `avatar-3d-cache/${key}`;

  const b = await bucket();
  const file = b.file(objectPath);

  // Re-use the cached object when it exists (idempotent + cheap).
  let alreadyCached = false;
  try {
    const [exists] = await file.exists();
    if (exists) alreadyCached = true;
  } catch (err) {
    logger.warn('[robloxCdnCache] exists() check failed', { sourceUrl, err: err instanceof Error ? err.message : String(err) });
  }

  if (!alreadyCached) {
    let bytes: Buffer;
    try {
      // `compress: true` (default for undici/node fetch) gives us
      // auto-decompressed body when Roblox CDN sets Content-Encoding:
      // gzip. Without this we'd cache the gzipped bytes and iOS would
      // need to decompress them — works for SceneKit OBJ readers but
      // breaks for PNG (binary expectation).
      const resp = await fetch(sourceUrl, {
        method: 'GET',
        headers: { 'Accept-Encoding': 'gzip, deflate' },
        signal: AbortSignal.timeout(15_000),
      });
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status} from ${sourceUrl}`);
      }
      bytes = Buffer.from(await resp.arrayBuffer());
    } catch (err) {
      logger.warn('[robloxCdnCache] source download failed', {
        sourceUrl,
        err: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
    try {
      await file.save(bytes, {
        contentType,
        resumable: false,
        // Long browser cache so iOS keeps the file on-device too.
        metadata: { cacheControl: 'public, max-age=2592000' },  // 30 days
      });
    } catch (err) {
      logger.warn('[robloxCdnCache] GCS upload failed', {
        sourceUrl, objectPath,
        err: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  const [signedUrl] = await file.getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + SIGNED_URL_TTL_MS,
  });
  return signedUrl;
}
