// robloxClothingTexture.ts — Phase O2-P4 (session 389+6).
//
// Resolves the actual PNG TEMPLATE for a Roblox classic clothing asset
// (Shirt / Pants / T-Shirt). The catalog asset itself is a tiny RBXM
// XML pointing to an INNER image asset; we have to fetch the wrapper,
// parse out `<Content name="ShirtTemplate"><url>…?id=N</url></Content>`,
// then fetch that inner asset (which is a gzipped PNG).
//
// Final PNG is mirrored into our GCS bucket via robloxCdnCache so iOS
// gets a stable signed URL even when Roblox CDN rotates access. Output
// is normalised to a plain PNG (decompressed if Roblox served gzip).
//
// Used by the iOS Fitting Room SceneKit mannequin to apply a shirt /
// pants texture as the diffuse map on the corresponding R-15 body
// parts (torso + arms for Shirt, legs for Pants).

import { logger } from 'firebase-functions/v2';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { getStorage } from 'firebase-admin/storage';

const ASSET_DELIVERY = 'https://assetdelivery.roblox.com/v1/asset';

export type ClothingTextureType = 'shirt' | 'pants' | 'tshirt';

export interface ClothingTextureResult {
  /// Original catalog item assetId (the Shirt/Pants RBXM wrapper).
  assetId: string;
  /// Inner template asset (the actual PNG).
  innerAssetId: string;
  /// Signed URL to our GCS-cached PNG.
  pngUrl: string;
  /// Detected clothing type.
  type: ClothingTextureType;
}

// Inner Roblox class names + corresponding template field names. Order
// matches `type` because the iOS caller already knows what slot it asked
// for (shirt / pants / tshirt) — we just match the XML accordingly.
const TEMPLATE_FIELDS: Record<ClothingTextureType, string[]> = {
  shirt:  ['ShirtTemplate'],
  pants:  ['PantsTemplate'],
  tshirt: ['Graphic', 'TShirtTemplate'],
};

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

export async function fetchClothingTexture(args: {
  assetId: string;
  type: ClothingTextureType;
}): Promise<ClothingTextureResult | null> {
  const { assetId, type } = args;
  if (!/^\d{1,15}$/.test(String(assetId))) {
    logger.warn('[clothingTexture] invalid assetId', { assetId });
    return null;
  }
  const cookie = process.env.ROBLOX_SERVICE_COOKIE ?? '';
  if (!cookie) {
    logger.warn('[clothingTexture] ROBLOX_SERVICE_COOKIE missing — assetdelivery requires auth');
    return null;
  }
  const cookieHeader = `.ROBLOSECURITY=${cookie}`;

  // Step 1: fetch wrapper RBXM (XML) for the catalog item.
  let xml: string;
  try {
    const resp = await fetch(`${ASSET_DELIVERY}?id=${assetId}`, {
      method: 'GET',
      headers: { 'Cookie': cookieHeader, 'Accept-Encoding': 'identity' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) {
      logger.warn('[clothingTexture] wrapper fetch non-200', { assetId, status: resp.status });
      return null;
    }
    xml = await resp.text();
  } catch (err) {
    logger.warn('[clothingTexture] wrapper fetch failed', {
      assetId, err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  // Step 2: regex out the inner template asset id. Roblox XML stores
  // `<Content name="ShirtTemplate"><url>http://www.roblox.com/asset/?id=N</url>`.
  const fields = TEMPLATE_FIELDS[type];
  let innerAssetId: string | null = null;
  for (const fieldName of fields) {
    const re = new RegExp(
      `<Content\\s+name="${fieldName}">\\s*<url>[^<]*[?&]id=(\\d+)`, 'i'
    );
    const m = xml.match(re);
    if (m && m[1]) { innerAssetId = m[1]; break; }
  }
  if (!innerAssetId) {
    logger.warn('[clothingTexture] no template URL in XML', {
      assetId, type, snippet: xml.slice(0, 400),
    });
    return null;
  }

  // Step 3: fetch the inner asset (PNG, possibly gzipped).
  let rawBytes: Buffer;
  try {
    const resp = await fetch(`${ASSET_DELIVERY}?id=${innerAssetId}`, {
      method: 'GET',
      headers: { 'Cookie': cookieHeader },
      signal: AbortSignal.timeout(15_000),
    });
    if (!resp.ok) {
      logger.warn('[clothingTexture] inner fetch non-200', {
        assetId, innerAssetId, status: resp.status,
      });
      return null;
    }
    rawBytes = Buffer.from(await resp.arrayBuffer());
  } catch (err) {
    logger.warn('[clothingTexture] inner fetch failed', {
      assetId, innerAssetId, err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  // Step 4: gunzip if Roblox returned gzip-encoded bytes (their CDN often
  // does for clothing template PNGs).
  const png = isGzip(rawBytes) ? gunzipSync(rawBytes) : rawBytes;
  if (!isPng(png)) {
    logger.warn('[clothingTexture] inner bytes are not PNG', {
      assetId, innerAssetId, first8: png.slice(0, 8).toString('hex'),
    });
    return null;
  }

  // Step 5: cache to GCS — key by inner asset id (the PNG itself, not
  // the wrapper) so all variants of the same template share storage.
  const objectKey = `clothing-template-${innerAssetId}.png`;
  const objectPath = `avatar-3d-cache/${objectKey}`;
  let pngUrl: string;
  try {
    const b = await bucket();
    const file = b.file(objectPath);
    let exists = false;
    try { [exists] = await file.exists(); } catch { /* ignore */ }
    if (!exists) {
      await file.save(png, {
        contentType: 'image/png',
        resumable: false,
        metadata: { cacheControl: 'public, max-age=2592000' },
      });
    }
    const [url] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + SIGNED_URL_TTL_MS,
    });
    pngUrl = url;
  } catch (err) {
    logger.warn('[clothingTexture] GCS cache failed', {
      assetId, innerAssetId,
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  return {
    assetId: String(assetId),
    innerAssetId,
    pngUrl,
    type,
  };
}

function isGzip(b: Buffer): boolean {
  return b.length >= 2 && b[0] === 0x1f && b[1] === 0x8b;
}

function isPng(b: Buffer): boolean {
  return b.length >= 8 &&
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
    b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a;
}

// Re-export the SHA-1 helper isn't needed here; just suppress unused.
void createHash;
