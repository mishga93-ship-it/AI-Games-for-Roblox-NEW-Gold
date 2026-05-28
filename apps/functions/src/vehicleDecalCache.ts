// Session 387 R10 — Vehicle decal cache layer.
//
// Why: Flux text-to-image is ~$0.01 + 2-4s latency per decal. Many vehicles
// share semantic decal needs (every taxi gets the same checkered stripe,
// every cyberpunk car gets a similar neon stripe, etc). Re-running Flux
// for those is wasted budget + slows the pipeline.
//
// Strategy: Firestore-backed key-value cache keyed on a normalized hash
// of (templateName, style, brief, accentHex). On hit → return cached
// Roblox assetId directly, skip Flux + Open Cloud upload entirely.
//
// Brief normalization rules:
//   - lowercase
//   - strip everything inside parentheses (often AI-injected per-prompt fluff)
//   - collapse whitespace
//   - take first 200 chars
//
// Cache TTL: indefinite. Roblox Open Cloud assets persist forever once
// granted openUse; the cached assetId is valid as long as no one deletes
// the asset.
//
// Cache hit metrics are logged so we can monitor effectiveness.

import { logger } from 'firebase-functions/v2';
import { createHash } from 'node:crypto';
import { getFirestore } from 'firebase-admin/firestore';

const COLLECTION = 'vehicleDecalCache';

export interface DecalCacheKey {
  templateName: string;
  style: string;
  brief: string;
  accentHex: string;
  // Optional discriminator (e.g. 'door' vs 'hood') — same brief can land
  // on different body parts, but currently we cache per-brief regardless
  // of part so identical briefs across slots reuse.
}

export interface DecalCacheEntry {
  assetId: number;
  createdAt: string;
  templateName: string;
  style: string;
  briefHash: string;
  /** Original brief, for debug. */
  briefPreview: string;
  /** How many times this asset has been reused. */
  reuseCount: number;
}

function normalizeBrief(brief: string): string {
  return brief
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')        // strip parentheticals
    .replace(/[\s,;]+/g, ' ')          // collapse whitespace + punctuation
    .replace(/[^a-z0-9 #-]/g, '')      // keep alphanumeric, hex digits, space, hash
    .trim()
    .slice(0, 200);
}

function cacheDocId(key: DecalCacheKey): string {
  const normalized = [
    key.templateName.toLowerCase(),
    key.style.toLowerCase(),
    key.accentHex.toLowerCase().replace('#', ''),
    normalizeBrief(key.brief),
  ].join('|');
  return createHash('sha256').update(normalized).digest('hex').slice(0, 24);
}

/** Look up a cached decal assetId. Returns null on miss. */
export async function lookupDecalCache(key: DecalCacheKey): Promise<number | null> {
  if (!key.brief || key.brief.trim().length === 0) return null;
  try {
    const id = cacheDocId(key);
    const db = getFirestore();
    const doc = await db.collection(COLLECTION).doc(id).get();
    if (!doc.exists) return null;
    const data = doc.data() as DecalCacheEntry | undefined;
    if (!data || typeof data.assetId !== 'number' || data.assetId <= 0) return null;
    // Bump reuseCount async (don't block).
    db.collection(COLLECTION).doc(id).update({
      reuseCount: (data.reuseCount ?? 0) + 1,
      lastReusedAt: new Date().toISOString(),
    }).catch(() => { /* non-fatal */ });
    logger.info('[DecalCache] HIT', {
      docId: id, assetId: data.assetId, reuseCount: data.reuseCount,
      templateName: key.templateName, style: key.style,
      briefPreview: data.briefPreview?.slice(0, 60),
    });
    return data.assetId;
  } catch (err) {
    logger.warn('[DecalCache] lookup threw', { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

/** Store a new decal assetId in cache. Idempotent (safe to call on hit). */
export async function storeDecalCache(key: DecalCacheKey, assetId: number): Promise<void> {
  if (!Number.isInteger(assetId) || assetId <= 0) return;
  if (!key.brief || key.brief.trim().length === 0) return;
  try {
    const id = cacheDocId(key);
    const db = getFirestore();
    const entry: DecalCacheEntry = {
      assetId,
      createdAt: new Date().toISOString(),
      templateName: key.templateName,
      style: key.style,
      briefHash: id,
      briefPreview: key.brief.slice(0, 200),
      reuseCount: 0,
    };
    await db.collection(COLLECTION).doc(id).set(entry, { merge: true });
    logger.info('[DecalCache] STORED', {
      docId: id, assetId, templateName: key.templateName, style: key.style,
    });
  } catch (err) {
    logger.warn('[DecalCache] store threw', { error: err instanceof Error ? err.message : String(err) });
    // non-fatal — caching is best-effort
  }
}

/** Convenience: lookup or compute. Calls `compute()` only on cache miss
 *  and stores the result for future hits. */
export async function withDecalCache(
  key: DecalCacheKey,
  compute: () => Promise<number | undefined>,
): Promise<number | undefined> {
  const cached = await lookupDecalCache(key);
  if (cached !== null) return cached;
  const fresh = await compute();
  if (typeof fresh === 'number' && fresh > 0) {
    await storeDecalCache(key, fresh);
  }
  return fresh;
}
