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
import { cacheRobloxCdnFile } from './robloxCdnCache.js';

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
  // Roblox's CDN sharding (verified empirically 2026-05-28 against both
  // 30DAY and 180DAY hashes): start i=31, XOR ALL chars of the hash
  // INCLUDING any prefix, no 38-char cap. The legacy algorithm capped
  // at 38 chars but only worked for 32-char hashes. For new prefixed
  // hashes (39 chars for `180DAY-…`, 38 for `30DAY-…`) the cap dropped
  // a trailing char and shifted the bucket — that's why earlier
  // «HTTP 403 for t0.rbxcdn.com/30DAY-…» errors showed up.
  // Verified buckets:
  //   30DAY-68275d6f5bff3955d67fd7a1dc718393 → t2 ✓
  //   180DAY-b6df2de0f63112ed8faaf7fe2086eadb → t0 ✓
  //   180DAY-67f2e56b10e0dd94447ce6ae749cc015 → t2 ✓
  //   180DAY-80f5427163db185b58e681441091b9a7 → t2 ✓
  let i = 31;
  for (let t = 0; t < hash.length; t++) {
    i ^= hash.charCodeAt(t);
  }
  const bucket = (i % 8 + 8) % 8;  // guard against negative modulo
  return `https://t${bucket}.rbxcdn.com/${hash}`;
}

/**
 * Shared: given a Completed render manifest URL (the `imageUrl` returned by
 * users/avatar-3d OR POST /v1/avatar/render), fetch the manifest JSON,
 * resolve each CDN hash, and mirror obj/mtl/textures into our GCS cache.
 * Returns stable HTTPS URLs + camera/aabb, or null on any failure.
 */
async function resolveManifest3D(
  imageUrl: string,
  logCtx: Record<string, unknown>,
): Promise<{
  objUrl: string;
  mtlUrl: string;
  textureUrls: string[];
  camera: RobloxAvatar3DUrls['camera'];
  aabb: RobloxAvatar3DUrls['aabb'];
} | null> {
  let manifest: { obj: string; mtl: string; textures: string[]; camera: unknown; aabb: unknown };
  try {
    const resp = await fetch(imageUrl, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(8_000),
    });
    if (!resp.ok) {
      logger.warn('[robloxAvatar3D] manifest non-200', { ...logCtx, status: resp.status });
      return null;
    }
    manifest = await resp.json();
  } catch (err) {
    logger.warn('[robloxAvatar3D] manifest fetch failed', {
      ...logCtx, err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  if (!manifest?.obj || !manifest?.mtl || !Array.isArray(manifest?.textures)) {
    logger.warn('[robloxAvatar3D] manifest missing required fields', logCtx);
    return null;
  }

  // Resolve CDN URLs (rbxcdn) — these are FRAGILE (S3 access rotates), so we
  // immediately mirror each to our GCS cache. Object keys use the ORIGINAL
  // Roblox hash so the signed URL's last path component matches what the MTL
  // references (`map_Kd <hash>`) — iOS extracts the path component as a
  // filename and SceneKit's material lookup just works.
  let objSrc: string, mtlSrc: string, texSrcs: string[];
  try {
    objSrc = hashToCdnUrl(manifest.obj);
    mtlSrc = hashToCdnUrl(manifest.mtl);
    texSrcs = manifest.textures.map((h) => hashToCdnUrl(h));
  } catch (err) {
    logger.warn('[robloxAvatar3D] hash→URL conversion failed', {
      ...logCtx, err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  let objUrl: string, mtlUrl: string, textureUrls: string[];
  try {
    [objUrl, mtlUrl] = await Promise.all([
      cacheRobloxCdnFile({ sourceUrl: objSrc, contentType: 'text/plain', objectKey: manifest.obj }),
      cacheRobloxCdnFile({ sourceUrl: mtlSrc, contentType: 'text/plain', objectKey: manifest.mtl }),
    ]);
    textureUrls = await Promise.all(
      manifest.textures.map((h, i) => cacheRobloxCdnFile({
        sourceUrl: texSrcs[i],
        contentType: 'image/png',
        objectKey: h,
      }))
    );
  } catch (err) {
    logger.warn('[robloxAvatar3D] CDN cache mirror failed', {
      ...logCtx, err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  return {
    objUrl,
    mtlUrl,
    textureUrls,
    camera: parseCamera(manifest.camera),
    aabb: parseAabb(manifest.aabb),
  };
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

  // Steps 2-5: fetch manifest, resolve hashes, mirror to GCS, shape camera.
  const resolved = await resolveManifest3D(imageUrl, { userId });
  if (!resolved) return null;
  return { userId: String(userId), ...resolved };
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

  // Step 3: resolve rbxcdn URLs, then mirror through GCS cache (same
  // 403-flake protection as the avatar path — see fetchRobloxAvatar3D).
  let objSrc: string, mtlSrc: string, texSrcs: string[];
  try {
    objSrc = hashToCdnUrl(manifest.obj);
    mtlSrc = hashToCdnUrl(manifest.mtl);
    texSrcs = manifest.textures.map((h) => hashToCdnUrl(h));
  } catch (err) {
    logger.warn('[robloxAsset3D] hash→URL conversion failed', {
      assetId, err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  let objUrl: string, mtlUrl: string, textureUrls: string[];
  try {
    [objUrl, mtlUrl] = await Promise.all([
      cacheRobloxCdnFile({ sourceUrl: objSrc, contentType: 'text/plain', objectKey: manifest.obj }),
      cacheRobloxCdnFile({ sourceUrl: mtlSrc, contentType: 'text/plain', objectKey: manifest.mtl }),
    ]);
    textureUrls = await Promise.all(
      manifest.textures.map((h, i) => cacheRobloxCdnFile({
        sourceUrl: texSrcs[i],
        contentType: 'image/png',
        objectKey: h,
      }))
    );
  } catch (err) {
    logger.warn('[robloxAsset3D] CDN cache mirror failed', {
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

// ─── Phase C: composited outfit 3D render (try-on, no ownership) ──────
//
// POST https://avatar.roblox.com/v1/avatar/render renders an ARBITRARY
// asset list onto a base avatar WITHOUT requiring the authenticated bot
// to own those assets (the same path the web "Try On" button uses). The
// response shape matches users/avatar-3d:
//   { state: 'Completed'|'Pending'|'Error', imageUrl }
// where imageUrl → the same JSON manifest { obj, mtl, textures[], … }.
//
// This is how the Fitting Room shows REAL classic clothing (shirt+pants)
// on the mannequin: Roblox composites the UVs server-side, we mirror the
// resulting OBJ+textures and hand them to SceneKit — exactly like the
// .realUser avatar path. No bot-avatar mutation, no ownership requirement,
// no staleness, no concurrency lock.

const AVATAR_RENDER_ENDPOINT = 'https://avatar.roblox.com/v1/avatar/render';

export type RobloxOutfit3DUrls = Omit<RobloxAvatar3DUrls, 'userId'>;

/**
 * Cosmetic base avatar for the render — neutral grey body ("Medium stone
 * grey" #a3a2a5), R15, default scales. The clothing/accessories come
 * entirely from the `assets` list; this is just the body underneath.
 *
 * NOTE: /v1/avatar/render expects bodyColors as HEX STRINGS (`headColor:
 * "#rrggbb"`), NOT BrickColor ids — passing `*ColorId` integers returns
 * HTTP 500 InternalServerError (verified empirically 2026-05-29).
 */
const BASE_AVATAR_DEFINITION = {
  bodyColors: {
    headColor: '#a3a2a5',
    torsoColor: '#a3a2a5',
    rightArmColor: '#a3a2a5',
    leftArmColor: '#a3a2a5',
    rightLegColor: '#a3a2a5',
    leftLegColor: '#a3a2a5',
  },
  scales: { height: 1, width: 1, head: 1, depth: 1, proportion: 0, bodyType: 0 },
  playerAvatarType: { playerAvatarType: 'R15' },
};

/**
 * Fetch a fresh X-CSRF-TOKEN for authenticated Roblox POSTs. Roblox returns
 * the token in the `x-csrf-token` response header of any state-changing
 * request — we hit a harmless endpoint (accountsettings email, empty body)
 * to read it. Same pattern as uploadClassicClothing in robloxWorker.ts.
 */
async function getRobloxCsrfToken(cookieHeader: string): Promise<string | null> {
  try {
    const resp = await fetch('https://accountsettings.roblox.com/v1/email', {
      method: 'POST',
      headers: { 'Cookie': cookieHeader, 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(8_000),
    });
    const token = resp.headers.get('x-csrf-token');
    return token && token.length > 0 ? token : null;
  } catch (err) {
    logger.warn('[renderOutfit3D] csrf fetch failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Render a composited 3D model wearing the given asset list (shirt, pants,
 * hats, hair, accessories…) and return stable HTTPS URLs for the OBJ + MTL
 * + textures, same shape as fetchRobloxAvatar3D. Does NOT require the bot
 * to own the assets (try-on render). Returns null on any failure.
 */
export async function renderOutfit3D(args: {
  assetIds: Array<string | number>;
  maxAttempts?: number;
  pollDelayMs?: number;
}): Promise<RobloxOutfit3DUrls | null> {
  const ids = sanitizeAssetIds(args.assetIds);
  if (ids.length === 0) {
    logger.warn('[renderOutfit3D] no valid asset ids', { raw: args.assetIds });
    return null;
  }
  return renderAvatarDefinition3D({
    avatarDefinition: { ...BASE_AVATAR_DEFINITION, assets: ids.map((id) => ({ id })) },
    logLabel: 'renderOutfit3D',
    assetCount: ids.length,
    maxAttempts: args.maxAttempts ?? 10,
    pollDelayMs: args.pollDelayMs ?? 2_000,
  });
}

/**
 * Phase O2-P (session 394) — personalized "Your Avatar" render. Same fit
 * asset list as renderOutfit3D, but composited onto the CALLER'S avatar
 * (their body parts, skin tone, scales, head/face) instead of the neutral
 * grey body. We fetch the user's avatar definition, keep only their
 * physical body/face assets, drop all their own cosmetics (clothing, hats,
 * hair, accessories) and add the fit — so the Mannequin and Your-Avatar
 * toggle show the IDENTICAL fit, differing only in the body underneath.
 * Returns null on any failure (caller falls back to the grey render).
 */
export async function renderOutfitOnUser3D(args: {
  userId: string | number;
  assetIds: Array<string | number>;
  maxAttempts?: number;
  pollDelayMs?: number;
}): Promise<RobloxOutfit3DUrls | null> {
  const ids = sanitizeAssetIds(args.assetIds);
  if (ids.length === 0) {
    logger.warn('[renderOutfitOnUser3D] no valid asset ids', { raw: args.assetIds });
    return null;
  }
  const userDef = await fetchUserAvatarDefinition(args.userId);
  if (!userDef) return null;   // could not read the user's avatar → caller falls back
  const avatarDefinition = await buildPersonalizedDefinition(userDef, ids);
  return renderAvatarDefinition3D({
    avatarDefinition,
    logLabel: 'renderOutfitOnUser3D',
    assetCount: ids.length,
    maxAttempts: args.maxAttempts ?? 10,
    pollDelayMs: args.pollDelayMs ?? 2_000,
  });
}

/** Dedupe + validate asset ids → positive integers. */
function sanitizeAssetIds(raw: Array<string | number> | undefined): number[] {
  return Array.from(new Set(
    (raw ?? [])
      .map((x) => Number(x))
      .filter((n) => Number.isInteger(n) && n > 0)
  ));
}

/**
 * Core render: POST an arbitrary avatarDefinition to /v1/avatar/render,
 * poll the (idempotent) request until state=Completed, then resolve the
 * manifest → stable OBJ/MTL/texture URLs. Shared by renderOutfit3D (grey
 * body) and renderOutfitOnUser3D (the user's own body). Returns null on
 * any failure.
 */
async function renderAvatarDefinition3D(args: {
  avatarDefinition: Record<string, unknown>;
  logLabel: string;
  assetCount: number;
  maxAttempts: number;
  pollDelayMs: number;
}): Promise<RobloxOutfit3DUrls | null> {
  const { avatarDefinition, logLabel, assetCount, maxAttempts, pollDelayMs } = args;

  const cookie = process.env.ROBLOX_SERVICE_COOKIE ?? '';
  if (!cookie) {
    logger.warn(`[${logLabel}] ROBLOX_SERVICE_COOKIE not set — render requires auth`);
    return null;
  }
  const cookieHeader = `.ROBLOSECURITY=${cookie}`;

  let csrf = await getRobloxCsrfToken(cookieHeader);
  if (!csrf) {
    logger.warn(`[${logLabel}] could not obtain csrf token`);
    return null;
  }

  const body = JSON.stringify({
    thumbnailConfig: { thumbnailId: 1, size: '420x420', thumbnailType: '3d' },
    avatarDefinition,
  });

  // POST the render request. On a 403 with a stale token, refresh once.
  const postRender = async (): Promise<Response | null> => {
    for (let csrfTry = 0; csrfTry < 2; csrfTry++) {
      const resp = await fetch(AVATAR_RENDER_ENDPOINT, {
        method: 'POST',
        headers: {
          'Cookie': cookieHeader,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-CSRF-TOKEN': csrf as string,
        },
        body,
        signal: AbortSignal.timeout(12_000),
      });
      if (resp.status === 403 && csrfTry === 0) {
        const fresh = resp.headers.get('x-csrf-token') || await getRobloxCsrfToken(cookieHeader);
        if (fresh) { csrf = fresh; continue; }
      }
      return resp;
    }
    return null;
  };

  // Poll: re-POST the (idempotent) render until state=Completed. Roblox
  // keys the render by the avatar definition, so a repeat POST returns the
  // progressing/cached render rather than starting a fresh one.
  let imageUrl: string | null = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let resp: Response | null = null;
    try {
      resp = await postRender();
    } catch (err) {
      logger.warn(`[${logLabel}] render POST failed`, {
        attempt, err: err instanceof Error ? err.message : String(err),
      });
    }
    if (resp && !resp.ok) {
      // Log the full body so we can diagnose the exact rejection in prod
      // (local cookie is empty — prod logs are the only way to see the shape).
      let errBody = '';
      try { errBody = (await resp.text()).slice(0, 600); } catch { /* ignore */ }
      logger.warn(`[${logLabel}] render non-200`, {
        attempt, status: resp.status, body: errBody, assetCount,
      });
      return null;
    }
    if (resp && resp.ok) {
      let json: { state?: string; imageUrl?: string; data?: Array<{ state?: string; imageUrl?: string }> };
      try {
        json = await resp.json();
      } catch (err) {
        logger.warn(`[${logLabel}] render body parse failed`, {
          attempt, err: err instanceof Error ? err.message : String(err),
        });
        return null;
      }
      const entry = ('data' in json && Array.isArray(json.data)) ? json.data[0] : json;
      if (entry?.state === 'Completed' && typeof entry.imageUrl === 'string' && entry.imageUrl.length > 0) {
        imageUrl = entry.imageUrl;
        break;
      }
      if (entry?.state === 'Error') {
        logger.warn(`[${logLabel}] render state=Error`, { attempt, assetCount });
        return null;
      }
      // Pending / unknown → wait and re-POST.
    }
    if (attempt < maxAttempts - 1) {
      await new Promise((r) => setTimeout(r, pollDelayMs));
    }
  }
  if (!imageUrl) {
    logger.warn(`[${logLabel}] render never reached Completed`, { maxAttempts, assetCount });
    return null;
  }

  const resolved = await resolveManifest3D(imageUrl, { source: 'render', assetCount });
  if (!resolved) return null;
  logger.info(`[${logLabel}] success`, {
    assetCount,
    textureCount: resolved.textureUrls.length,
  });
  return resolved;
}

// ─── Personalized "Your Avatar" helpers (session 394) ────────────

interface RobloxUserAvatarDefinition {
  bodyColors?: Record<string, number | string>;
  scales?: Record<string, number>;
  playerAvatarType?: string | { playerAvatarType?: string };
  assets?: Array<{ id: number; assetType?: { id?: number; name?: string } }>;
}

/**
 * Fetch a user's avatar definition (public endpoint, no auth). Shape:
 * bodyColors as ColorId ints (`headColorId`…), playerAvatarType as a bare
 * string ("R15"), assets[] each with `assetType.id`. Returns null on any
 * failure.
 */
async function fetchUserAvatarDefinition(
  userId: string | number,
): Promise<RobloxUserAvatarDefinition | null> {
  try {
    const resp = await fetch(`https://avatar.roblox.com/v1/users/${userId}/avatar`, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) {
      logger.warn('[renderOutfitOnUser3D] user avatar fetch non-200', {
        userId: String(userId), status: resp.status,
      });
      return null;
    }
    return await resp.json() as RobloxUserAvatarDefinition;
  } catch (err) {
    logger.warn('[renderOutfitOnUser3D] user avatar fetch failed', {
      userId: String(userId), err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

// GET /v1/users/{id}/avatar returns bodyColors as BrickColor ids, but
// /v1/avatar/render requires hex strings (ColorId ints → HTTP 500, see
// BASE_AVATAR_DEFINITION note). avatar-rules.bodyColorsPalette is the
// ColorId→hex map. Cached process-wide (it is static Roblox data).
const AVATAR_RULES_ENDPOINT = 'https://avatar.roblox.com/v1/avatar-rules';
let bodyColorHexCache: Record<number, string> | null = null;

async function getBodyColorHexMap(): Promise<Record<number, string>> {
  if (bodyColorHexCache) return bodyColorHexCache;
  const map: Record<number, string> = {};
  try {
    const resp = await fetch(AVATAR_RULES_ENDPOINT, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (resp.ok) {
      const j = await resp.json() as { bodyColorsPalette?: Array<{ brickColorId?: number; hexColor?: string }> };
      for (const p of j.bodyColorsPalette ?? []) {
        if (typeof p.brickColorId === 'number' && typeof p.hexColor === 'string') {
          map[p.brickColorId] = p.hexColor.startsWith('#') ? p.hexColor : `#${p.hexColor}`;
        }
      }
    } else {
      logger.warn('[renderOutfitOnUser3D] avatar-rules non-200', { status: resp.status });
    }
  } catch (err) {
    logger.warn('[renderOutfitOnUser3D] avatar-rules fetch failed', {
      err: err instanceof Error ? err.message : String(err),
    });
  }
  if (Object.keys(map).length > 0) bodyColorHexCache = map;   // cache only on success
  return map;
}

// Asset types that ARE the user's physical body/face — kept so the render
// shows THEIR avatar. Everything else (clothing 2/11/12, hats/hair/
// accessories 8/41-47/57-67, animations 78…) is dropped and replaced by
// the fit, so the two toggle modes show the identical fit.
const PHYSICAL_BODY_ASSET_TYPES = new Set<number>([
  17, // Head (classic)
  18, // Face
  27, // Torso (R15)
  28, // RightArm
  29, // LeftArm
  30, // LeftLeg
  31, // RightLeg
  79, // DynamicHead
]);

const BODY_COLOR_SLOTS = ['head', 'torso', 'rightArm', 'leftArm', 'rightLeg', 'leftLeg'] as const;

/**
 * Build a /v1/avatar/render avatarDefinition that puts the FIT onto the
 * USER's body: their hex body colors + scales + physical body/face assets,
 * plus the fit's asset ids. Drops the user's own cosmetics so nothing
 * double-stacks.
 */
async function buildPersonalizedDefinition(
  userDef: RobloxUserAvatarDefinition,
  fitAssetIds: number[],
): Promise<Record<string, unknown>> {
  // bodyColors: ColorId ints → hex (render rejects ints). Tolerate a hex
  // response too, in case Roblox ever changes the shape.
  const hexMap = await getBodyColorHexMap();
  const rawColors = userDef.bodyColors ?? {};
  const bodyColors: Record<string, string> = {};
  for (const slot of BODY_COLOR_SLOTS) {
    const hexVal = rawColors[`${slot}Color`];
    const idVal = rawColors[`${slot}ColorId`];
    if (typeof hexVal === 'string' && hexVal.startsWith('#')) {
      bodyColors[`${slot}Color`] = hexVal;
    } else if (typeof idVal === 'number' && hexMap[idVal]) {
      bodyColors[`${slot}Color`] = hexMap[idVal];
    } else {
      bodyColors[`${slot}Color`] = '#a3a2a5';   // medium stone grey fallback
    }
  }

  // playerAvatarType: GET returns a bare string ("R15"); render needs an obj.
  const patRaw = userDef.playerAvatarType;
  const playerAvatarType = typeof patRaw === 'string'
    ? { playerAvatarType: patRaw }
    : (patRaw && typeof patRaw.playerAvatarType === 'string'
        ? { playerAvatarType: patRaw.playerAvatarType }
        : { playerAvatarType: 'R15' });

  // Keep the user's physical body/face; drop their cosmetics; add the fit.
  const keptBody = (userDef.assets ?? [])
    .filter((a) => PHYSICAL_BODY_ASSET_TYPES.has(Number(a?.assetType?.id)))
    .map((a) => a.id);

  const seen = new Set<number>();
  const assets: Array<{ id: number }> = [];
  for (const raw of [...keptBody, ...fitAssetIds]) {
    const n = Number(raw);
    if (Number.isInteger(n) && n > 0 && !seen.has(n)) { seen.add(n); assets.push({ id: n }); }
  }

  return {
    bodyColors,
    scales: userDef.scales ?? BASE_AVATAR_DEFINITION.scales,
    playerAvatarType,
    assets,
  };
}
