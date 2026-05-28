// robloxAvatar3D.ts — Phase A (session 389+1): fetch a Roblox user's
// rendered 3D avatar (OBJ + MTL + PNG textures) for the iOS Fitting Room
// SceneKit viewer.
//
// Public Roblox web APIs — NO auth required:
//   1. POST/GET https://thumbnails.roblox.com/v1/users/avatar-3d?userId=N
//        → { targetId, state: 'Completed'|'Pending'|'Error', imageUrl }
//      `imageUrl` is the URL to a CDN-hosted JSON manifest (NOT a PNG).
//   2. GET <imageUrl>
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
 * Reference: https://devforum.roblox.com/t/.../2432524
 */
function hashToCdnUrl(hash: string): string {
  if (!hash || typeof hash !== 'string' || hash.length < 32) {
    throw new Error(`invalid CDN hash: ${hash}`);
  }
  let i = 31;
  for (let t = 0; t < 38 && t < hash.length; t++) {
    i ^= hash.charCodeAt(t);
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

  // Step 1: poll the avatar-3d endpoint until state='Completed'.
  let imageUrl: string | null = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const resp = await fetch(`${AVATAR_3D_ENDPOINT}?userId=${userId}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(8_000),
      });
      if (!resp.ok) {
        logger.warn('[robloxAvatar3D] avatar-3d non-200', { userId, status: resp.status, attempt });
        return null;
      }
      const json = await resp.json() as { data?: Array<{ targetId: number; state: string; imageUrl?: string }> };
      const entry = json.data?.[0];
      if (!entry) {
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
