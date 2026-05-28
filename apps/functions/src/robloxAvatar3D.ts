// robloxAvatar3D.ts — Phase A (session 389+1): fetch a Roblox user's
// rendered 3D avatar (OBJ + MTL + PNG textures) for the iOS Fitting Room
// SceneKit viewer.
//
// Roblox web APIs (BOTH endpoints now require ROBLOSECURITY cookie auth
// — Roblox tightened access on users/avatar-3d in 2026, was public before):
//   1. POST/GET https://thumbnails.roblox.com/v1/users/avatar-3d?userId=N
//        → { targetId, state: 'Completed'|'Pending'|'Error', imageUrl }
//      `imageUrl` is the URL to a CDN-hosted JSON manifest (NOT a PNG).
//   2. GET <imageUrl>  (no auth needed — public CDN)
//        → { obj: <hash>, mtl: <hash>, textures: [<hash>...], camera, aabb }
//   3. Each hash → CDN URL via the standard t0-t7.rbxcdn.com bucket selection
//      (Roblox shards their CDN by an XOR over the hash's first 38 chars).
//
// Why the indirection: Roblox returns hashes, not URLs, so the manifest can
// be cached/CDN-routed independent of where the file actually lives. Final
// URLs are of the form `https://t{0..7}.rbxcdn.com/<hash>`.
//
// The OBJ file does NOT contain a `mtllib` directive — clients must prepend
// `mtllib avatar.mtl\n` (or load the MTL separately and bind to materials).
//
// We return only stable HTTPS URLs to iOS — iOS downloads each file, writes
// to a temp dir, prepends mtllib, and hands the OBJ to SceneKit.

import { logger } from 'firebase-functions/v2';

const AVATAR_3D_ENDPOINT = 'https://thumbnails.roblox.com/v1/users/avatar-3d';

export interface RobloxAvatar3DUrls {
  /** Roblox userId echoed back for safety. */
  userId: string;
  /** Stable HTTPS URL to the OBJ geometry. */
  objUrl: string;
  /** Stable HTTPS URL to the MTL material file. */
  mtlUrl: string;
  /** Stable HTTPS URLs for each texture PNG. Order matches OBJ material refs. */
  textureUrls: string[];
  /** Roblox camera framing — useful for setting initial SceneKit camera. */
  camera: {
    position: { x: number; y: number; z: number };
    direction: { x: number; y: number; z: number };
    fov: number;
  };
  /** Axis-aligned bounding box — useful for auto-zoom. */
  aabb: {
    min: { x: number; y: number; z: number };
    max: { x: number; y: number; z: number };
  };
}

/**
 * Convert a CDN hash into the actual rbxcdn URL. Roblox shards their CDN
 * across 8 servers (t0..t7); the server is picked by XORing the first 38
 * characters of the hash, mod 8.
 *
 * Known hash formats (XOR uses the hex suffix only — strip any prefix):
 *   • Legacy: 32-char hex (avatar-3d, pre-2026).
 *   • TN3 asset-3d: `180DAY-<32-char-hex>` (assets-thumbnail-3d, 2025+).
 *   • TN3 avatar-3d: `30DAY-<32-char-hex>` or
 *     `30DAY-Avatar-<32-char-hex>-Obj` (users/avatar-3d, 2026+ — Roblox
 *     started prefixing avatar manifests as well after they cookie-gated
 *     the endpoint).
 *   Verified empirically against asset 10927612825 (bucket 0 / 2 / 7
 *   for obj / mtl / texture respectively).
 *
 * Reference: https://devforum.roblox.com/t/.../2432524
 */
export function hashToCdnUrl(hash: string): string {
  if (!hash || typeof hash !== 'string' || hash.length < 32) {
    throw new Error(`invalid CDN hash: ${hash}`);
  }
  // Strip any of Roblox's variable-length time-windowed prefixes
  // (`180DAY-`, `30DAY-`, `30DAY-Avatar-…-Obj`, etc.) so the XOR sees
  // only the actual hex hash. The bucket is determined by the hex; the
  // download URL keeps the original prefix.
  const hex = hash.match(/[0-9a-fA-F]{32,}/)?.[0] ?? hash;
  let i = 31;
  for (let t = 0; t < 38 && t < hex.length; t++) {
    i ^= hex.charCodeAt(t);
  }
  const bucket = (i % 8 + 8) % 8;  // guard against negative modulo
  return `https://t${bucket}.rbxcdn.com/${hash}`;
}

/**
 * Fetch a user's rendered 3D avatar manifest and resolve all CDN URLs.
 *
 * The first call to /avatar-3d for a fresh user can return state='Pending'
 * (Roblox is still rendering the model). We poll up to `maxAttempts` times
 * with `pollDelayMs` between attempts.
 */
export async function fetchRobloxAvatar3D(args: {
  userId: string;
  maxAttempts?: number;
  pollDelayMs?: number;
}): Promise<RobloxAvatar3DUrls | null> {
  const { userId } = args;
  const maxAttempts = args.maxAttempts ?? 8;
  const pollDelayMs = args.pollDelayMs ?? 1_500;

  if (!/^\d{1,15}$/.test(String(userId))) {
    logger.warn('[robloxAvatar3D] invalid userId', { userId });
    return null;
  }

  const cookie = process.env.ROBLOX_SERVICE_COOKIE ?? '';
  if (!cookie) {
    logger.warn('[robloxAvatar3D] ROBLOX_SERVICE_COOKIE not set — users/avatar-3d requires auth as of 2026');
    return null;
  }
  const cookieHeader = `.ROBLOSECURITY=${cookie}`;

  // Step 1: poll the avatar-3d endpoint until state='Completed'.
  let imageUrl: string | null = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const resp = await fetch(`${AVATAR_3D_ENDPOINT}?userId=${userId}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json', 'Cookie': cookieHeader },
        signal: AbortSignal.timeout(8_000),
      });
      if (!resp.ok) {
        logger.warn('[robloxAvatar3D] avatar-3d non-200', { userId, status: resp.status, attempt });
        return null;
      }
      const raw = await resp.json() as
        | { data?: Array<{ targetId: number; state: string; imageUrl?: string }> }
        | { targetId?: number; state?: string; imageUrl?: string };
      // Roblox returns BOTH shapes in the wild — wrapped {data:[entry]}
      // for some user IDs / cookies, flat {targetId,state,imageUrl} for
      // others (observed 2026-05 — different shape than Phase A shipped).
      const entry = ('data' in raw && Array.isArray(raw.data))
        ? raw.data[0]
        : (raw as { targetId?: number; state?: string; imageUrl?: string });
      if (!entry || typeof entry.state !== 'string') {
        logger.warn('[robloxAvatar3D] avatar-3d returned no entry', { userId, attempt });
        return null;
      }
      if (entry.state === 'Completed' && typeof entry.imageUrl === 'string' && entry.imageUrl.length > 0) {
        imageUrl = entry.imageUrl;
        break;
      }
      if (entry.state === 'Error') {
        logger.warn('[robloxAvatar3D] avatar-3d state=Error', { userId, attempt });
        return null;
      }
      // state === 'Pending' (or unknown) — wait and retry.
    } catch (err) {
      logger.warn('[robloxAvatar3D] avatar-3d fetch failed', {
        userId, attempt, err: err instanceof Error ? err.message : String(err),
      });
    }
    if (attempt < maxAttempts - 1) {
      await new Promise((r) => setTimeout(r, pollDelayMs));
    }
  }
  if (!imageUrl) {
    logger.warn('[robloxAvatar3D] avatar-3d never reached Completed', { userId, maxAttempts });
    return null;
  }

  // Step 2: fetch the JSON manifest at imageUrl (hashes + camera).
  let manifest: { obj: string; mtl: string; textures: string[]; camera: unknown; aabb: unknown };
  try {
    const resp = await fetch(imageUrl, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(8_000),
    });
    if (!resp.ok) {
      logger.warn('[robloxAvatar3D] manifest non-200', { userId, status: resp.status });
      return null;
    }
    manifest = await resp.json();
  } catch (err) {
    logger.warn('[robloxAvatar3D] manifest fetch failed', {
      userId, err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  if (!manifest?.obj || !manifest?.mtl || !Array.isArray(manifest?.textures)) {
    logger.warn('[robloxAvatar3D] manifest missing required fields', { userId });
    return null;
  }

  // Step 3: resolve CDN URLs.
  let objUrl: string;
  let mtlUrl: string;
  let textureUrls: string[];
  try {
    objUrl = hashToCdnUrl(manifest.obj);
    mtlUrl = hashToCdnUrl(manifest.mtl);
    textureUrls = manifest.textures.map((h) => hashToCdnUrl(h));
  } catch (err) {
    logger.warn('[robloxAvatar3D] hash→URL conversion failed', {
      userId, err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  // Step 4: shape camera/aabb into typed structures (best-effort — Roblox
  // sometimes nests these inconsistently; missing fields → safe defaults).
  const camera = parseCamera(manifest.camera);
  const aabb = parseAabb(manifest.aabb);

  return {
    userId: String(userId),
    objUrl,
    mtlUrl,
    textureUrls,
    camera,
    aabb,
  };
}

function parseCamera(raw: unknown): RobloxAvatar3DUrls['camera'] {
  const c = raw as Record<string, unknown> | null;
  return {
    position: parseVec3((c?.position as unknown) ?? null, { x: 0, y: 0, z: 6 }),
    direction: parseVec3((c?.direction as unknown) ?? null, { x: 0, y: 0, z: -1 }),
    fov: typeof c?.fov === 'number' ? (c.fov as number) : 28.36,
  };
}

function parseAabb(raw: unknown): RobloxAvatar3DUrls['aabb'] {
  const a = raw as Record<string, unknown> | null;
  return {
    min: parseVec3((a?.min as unknown) ?? null, { x: -2, y: 0, z: -2 }),
    max: parseVec3((a?.max as unknown) ?? null, { x: 2, y: 5, z: 2 }),
  };
}

function parseVec3(raw: unknown, fallback: { x: number; y: number; z: number }) {
  const v = raw as Record<string, unknown> | null;
  return {
    x: typeof v?.x === 'number' ? (v.x as number) : fallback.x,
    y: typeof v?.y === 'number' ? (v.y as number) : fallback.y,
    z: typeof v?.z === 'number' ? (v.z as number) : fallback.z,
  };
}

// ─── Phase B: per-asset 3D mesh ─────────────────────────────────
//
// Same JSON shape as avatar-3d, but the endpoint REQUIRES authenticated
// session cookie (`.ROBLOSECURITY`). The cookie is set in env as
// ROBLOX_SERVICE_COOKIE. Once we have a manifest, the hash→CDN trick is
// the same as for avatars (after stripping the `180DAY-` prefix).
//
// Works for catalog items that have an Avatar Asset 3D thumbnail —
// primarily Accessory, Hat, Hair, Face, ClassicShirt, ClassicPants.

const ASSET_3D_ENDPOINT = 'https://thumbnails.roblox.com/v1/assets-thumbnail-3d';

export interface RobloxAsset3DUrls extends Omit<RobloxAvatar3DUrls, 'userId'> {
  assetId: string;
}

export async function fetchRobloxAsset3D(args: {
  assetId: string;
  maxAttempts?: number;
  pollDelayMs?: number;
}): Promise<RobloxAsset3DUrls | null> {
  const { assetId } = args;
  const maxAttempts = args.maxAttempts ?? 6;
  const pollDelayMs = args.pollDelayMs ?? 1_500;

  if (!/^\d{1,15}$/.test(String(assetId))) {
    logger.warn('[robloxAsset3D] invalid assetId', { assetId });
    return null;
  }

  const cookie = process.env.ROBLOX_SERVICE_COOKIE ?? '';
  if (!cookie) {
    logger.warn('[robloxAsset3D] ROBLOX_SERVICE_COOKIE not set — asset-3d requires auth');
    return null;
  }
  const cookieHeader = `.ROBLOSECURITY=${cookie}`;

  // Step 1: poll until state='Completed'.
  let imageUrl: string | null = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const resp = await fetch(`${ASSET_3D_ENDPOINT}?assetId=${assetId}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json', 'Cookie': cookieHeader },
        signal: AbortSignal.timeout(8_000),
      });
      if (resp.status === 401 || resp.status === 403) {
        logger.warn('[robloxAsset3D] cookie rejected', { assetId, status: resp.status });
        return null;
      }
      if (!resp.ok) {
        logger.warn('[robloxAsset3D] non-200', { assetId, status: resp.status, attempt });
        return null;
      }
      const json = await resp.json() as { targetId?: number; state?: string; imageUrl?: string };
      if (json.state === 'Completed' && typeof json.imageUrl === 'string' && json.imageUrl.length > 0) {
        imageUrl = json.imageUrl;
        break;
      }
      if (json.state === 'Error') {
        logger.warn('[robloxAsset3D] state=Error', { assetId, attempt });
        return null;
      }
      // 'Pending' or unknown — wait and retry.
    } catch (err) {
      logger.warn('[robloxAsset3D] fetch failed', {
        assetId, attempt, err: err instanceof Error ? err.message : String(err),
      });
    }
    if (attempt < maxAttempts - 1) {
      await new Promise((r) => setTimeout(r, pollDelayMs));
    }
  }
  if (!imageUrl) return null;

  // Step 2: fetch manifest.
  let manifest: { obj: string; mtl: string; textures: string[]; camera: unknown; aabb: unknown };
  try {
    const resp = await fetch(imageUrl, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(8_000),
    });
    if (!resp.ok) return null;
    manifest = await resp.json();
  } catch (err) {
    logger.warn('[robloxAsset3D] manifest fetch failed', {
      assetId, err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
  if (!manifest?.obj || !manifest?.mtl || !Array.isArray(manifest?.textures)) {
    logger.warn('[robloxAsset3D] manifest missing fields', { assetId });
    return null;
  }

  // Step 3: resolve CDN URLs (handles 180DAY- prefix).
  let objUrl: string, mtlUrl: string, textureUrls: string[];
  try {
    objUrl = hashToCdnUrl(manifest.obj);
    mtlUrl = hashToCdnUrl(manifest.mtl);
    textureUrls = manifest.textures.map((h) => hashToCdnUrl(h));
  } catch (err) {
    logger.warn('[robloxAsset3D] hash→URL conversion failed', {
      assetId, err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  return {
    assetId: String(assetId),
    objUrl,
    mtlUrl,
    textureUrls,
    camera: parseCamera(manifest.camera),
    aabb: parseAabb(manifest.aabb),
  };
}
