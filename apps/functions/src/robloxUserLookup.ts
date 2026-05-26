// robloxUserLookup.ts — Phase 2 Avatar Glow-Up helpers (session 382 Phase 2).
//
// Public Roblox web APIs (NO auth required):
//   • users.roblox.com/v1/usernames/users    — username → numeric userId
//   • thumbnails.roblox.com/v1/users/avatar  — full-body avatar PNG URL by userId
//   • thumbnails.roblox.com/v1/users/avatar-headshot — close-up bust PNG
//
// Used by the Instant Fitting Room so we can composite the user's REAL
// avatar into the vibe preview (vs. a generic AI render).

import { logger } from 'firebase-functions/v2';

export interface RobloxUserLookupResult {
  robloxUserId: string;
  displayName: string;
  username: string;
}

const USERNAMES_ENDPOINT = 'https://users.roblox.com/v1/usernames/users';
const AVATAR_THUMBNAIL_ENDPOINT = 'https://thumbnails.roblox.com/v1/users/avatar';
const HEADSHOT_THUMBNAIL_ENDPOINT = 'https://thumbnails.roblox.com/v1/users/avatar-headshot';

const VALID_USERNAME = /^[A-Za-z0-9_]{3,20}$/;

/**
 * Resolve a Roblox username to its numeric userId via the public users API.
 * Returns null when the username doesn't exist OR is malformed.
 */
export async function resolveRobloxUsername(username: string): Promise<RobloxUserLookupResult | null> {
  const trimmed = username.trim();
  if (!VALID_USERNAME.test(trimmed)) {
    return null;
  }
  try {
    const resp = await fetch(USERNAMES_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ usernames: [trimmed], excludeBannedUsers: false }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!resp.ok) {
      logger.warn('[robloxUserLookup] usernames endpoint non-200', { status: resp.status });
      return null;
    }
    const json = await resp.json() as { data?: Array<{ id: number; name: string; displayName: string }> };
    const entry = json.data?.[0];
    if (!entry || typeof entry.id !== 'number') return null;
    return {
      robloxUserId: String(entry.id),
      username: entry.name,
      displayName: entry.displayName ?? entry.name,
    };
  } catch (err) {
    logger.warn('[robloxUserLookup] resolveRobloxUsername threw', err);
    return null;
  }
}

export type AvatarThumbnailSize = '150x150' | '420x420' | '720x720';
export type AvatarThumbnailKind = 'full_body' | 'headshot';

/**
 * Fetch a signed CDN URL for the user's current full-body avatar thumbnail
 * (PNG). Roblox renders it with transparent background — perfect for sharp
 * composite under our vibe-overlay layer. Returns null if Roblox returns
 * "Blocked" / "Error" status.
 */
export async function fetchRobloxAvatarThumbnailUrl(args: {
  robloxUserId: string;
  size?: AvatarThumbnailSize;
  kind?: AvatarThumbnailKind;
}): Promise<string | null> {
  const size: AvatarThumbnailSize = args.size ?? '420x420';
  const kind: AvatarThumbnailKind = args.kind ?? 'full_body';
  const base = kind === 'headshot' ? HEADSHOT_THUMBNAIL_ENDPOINT : AVATAR_THUMBNAIL_ENDPOINT;
  const url = `${base}?userIds=${encodeURIComponent(args.robloxUserId)}&size=${size}&format=Png&isCircular=false`;
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!resp.ok) {
      logger.warn('[robloxUserLookup] avatar thumbnail non-200', { status: resp.status });
      return null;
    }
    const json = await resp.json() as { data?: Array<{ state?: string; imageUrl?: string }> };
    const entry = json.data?.[0];
    if (!entry || entry.state !== 'Completed' || !entry.imageUrl) return null;
    return entry.imageUrl;
  } catch (err) {
    logger.warn('[robloxUserLookup] fetchRobloxAvatarThumbnailUrl threw', err);
    return null;
  }
}

/**
 * Convenience: download a thumbnail URL into a Buffer for sharp compositing.
 * Returns null on any failure — caller can fall back to generic preview.
 */
export async function downloadAvatarThumbnailBuffer(args: {
  robloxUserId: string;
  size?: AvatarThumbnailSize;
  kind?: AvatarThumbnailKind;
}): Promise<Buffer | null> {
  const url = await fetchRobloxAvatarThumbnailUrl(args);
  if (!url) return null;
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!resp.ok) return null;
    const ab = await resp.arrayBuffer();
    return Buffer.from(ab);
  } catch (err) {
    logger.warn('[robloxUserLookup] downloadAvatarThumbnailBuffer threw', err);
    return null;
  }
}
