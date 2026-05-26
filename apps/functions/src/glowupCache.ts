// glowupCache.ts — Firestore-backed cache for Avatar Glow-Up Studio results
// (session 382 Phase 2).
//
// Generations involve a flux-pro call (~$0.005-0.02), sharp compositing,
// and 4× Firebase Storage uploads. Re-running the same vibe+gender+
// intensity+robloxUserId combo within minutes is pure waste. Cache key
// is deterministic over those 4 fields → if the user re-taps the same
// vibe, they get back the same signed URLs instantly.
//
// TTL: 6 days (signed URLs expire at 7 days; we leave 1-day buffer so a
// cache-served URL isn't already 5-min-from-dead).
//
// Mirrors the pattern in robloxCatalog.ts (collection `robloxTrends`).

import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { createHash } from 'node:crypto';
import type { GlowupGenerateResult } from './glowupCompositor.js';
import type { GlowupGender, GlowupIntensity, GlowupVibeId } from './data/glowupVibes.js';

const CACHE_COLLECTION = 'glowupCache';
const CACHE_TTL_MS = 6 * 24 * 60 * 60 * 1000;

export interface GlowupCacheKeyInput {
  vibeId: GlowupVibeId;
  gender: GlowupGender;
  intensity: GlowupIntensity;
  robloxUserId?: string;
}

export function computeGlowupCacheKey(input: GlowupCacheKeyInput): string {
  const raw = `${input.vibeId}|${input.gender}|${input.intensity}|${input.robloxUserId ?? '-'}`;
  return createHash('sha1').update(raw).digest('hex').slice(0, 24);
}

interface CacheDoc {
  result: GlowupGenerateResult;
  createdAt: number;
  firebaseUid: string;
  vibeId: GlowupVibeId;
}

export async function getCachedGlowup(key: string): Promise<GlowupGenerateResult | null> {
  try {
    const db = getFirestore();
    const snap = await db.collection(CACHE_COLLECTION).doc(key).get();
    if (!snap.exists) return null;
    const data = snap.data() as CacheDoc | undefined;
    if (!data) return null;
    const age = Date.now() - (data.createdAt ?? 0);
    if (age > CACHE_TTL_MS) {
      logger.info('[glowupCache] stale entry, ignoring', { key, ageHours: Math.round(age / 3.6e6) });
      return null;
    }
    return data.result;
  } catch (err) {
    logger.warn('[glowupCache] read failed (non-fatal)', err);
    return null;
  }
}

export async function setCachedGlowup(args: {
  key: string;
  result: GlowupGenerateResult;
  firebaseUid: string;
  vibeId: GlowupVibeId;
}): Promise<void> {
  try {
    const db = getFirestore();
    await db.collection(CACHE_COLLECTION).doc(args.key).set({
      result: args.result,
      createdAt: Date.now(),
      firebaseUid: args.firebaseUid,
      vibeId: args.vibeId,
    } satisfies CacheDoc);
  } catch (err) {
    logger.warn('[glowupCache] write failed (non-fatal)', err);
  }
}
