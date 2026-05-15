// Roblox catalog analytics (Master Plan Phase F, session 228).
// Computes aggregate stats over a TrendingResult (price/favorites distribution,
// top creators, item-type mix) and persists hourly snapshots to Firestore for
// future timeseries velocity analysis.

import { logger } from 'firebase-functions';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import type { CatalogCategory, CatalogPeriod, CatalogSort, RobloxCatalogItem, TrendingResult } from './robloxCatalog.js';

export interface PriceStats {
  count: number;
  freeCount: number;
  paidCount: number;
  min: number | null;
  max: number | null;
  median: number | null;
  p25: number | null;
  p75: number | null;
  mean: number | null;
}

export interface FavoriteStats {
  count: number;
  min: number;
  max: number;
  median: number;
  sum: number;
}

export interface ItemTypeMix {
  assetCount: number;
  bundleCount: number;
}

export interface CreatorBreakdown {
  name: string;
  itemCount: number;
}

export interface AnalyticsSummary {
  category: CatalogCategory;
  sort: CatalogSort;
  period: CatalogPeriod;
  itemCount: number;
  priceStats: PriceStats;
  favoriteStats: FavoriteStats;
  topCreators: CreatorBreakdown[];
  itemTypeMix: ItemTypeMix;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

export function computePriceStats(items: RobloxCatalogItem[]): PriceStats {
  const paid: number[] = [];
  let freeCount = 0;
  for (const it of items) {
    if (it.price === null || it.price === 0) freeCount += 1;
    else if (typeof it.price === 'number' && it.price > 0) paid.push(it.price);
  }
  paid.sort((a, b) => a - b);
  if (paid.length === 0) {
    return {
      count: items.length, freeCount, paidCount: 0,
      min: null, max: null, median: null, p25: null, p75: null, mean: null,
    };
  }
  const sum = paid.reduce((a, b) => a + b, 0);
  return {
    count: items.length,
    freeCount,
    paidCount: paid.length,
    min: paid[0],
    max: paid[paid.length - 1],
    median: Math.round(quantile(paid, 0.5)),
    p25: Math.round(quantile(paid, 0.25)),
    p75: Math.round(quantile(paid, 0.75)),
    mean: Math.round(sum / paid.length),
  };
}

export function computeFavoriteStats(items: RobloxCatalogItem[]): FavoriteStats {
  const favs = items
    .map((it) => (typeof it.favoriteCount === 'number' ? it.favoriteCount : 0))
    .sort((a, b) => a - b);
  if (favs.length === 0) {
    return { count: 0, min: 0, max: 0, median: 0, sum: 0 };
  }
  const sum = favs.reduce((a, b) => a + b, 0);
  return {
    count: favs.length,
    min: favs[0],
    max: favs[favs.length - 1],
    median: Math.round(quantile(favs, 0.5)),
    sum,
  };
}

export function computeTopCreators(items: RobloxCatalogItem[], topN = 3): CreatorBreakdown[] {
  const counts = new Map<string, number>();
  for (const it of items) {
    const name = (it.creatorName || '').trim();
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([name, itemCount]) => ({ name, itemCount }));
}

export function computeItemTypeMix(items: RobloxCatalogItem[]): ItemTypeMix {
  let assetCount = 0;
  let bundleCount = 0;
  for (const it of items) {
    if (it.itemType === 'Bundle') bundleCount += 1;
    else assetCount += 1;
  }
  return { assetCount, bundleCount };
}

export function buildAnalyticsSummary(
  result: TrendingResult,
  query: { category: CatalogCategory; sort: CatalogSort; period: CatalogPeriod },
): AnalyticsSummary {
  return {
    category: query.category,
    sort: query.sort,
    period: query.period,
    itemCount: result.items.length,
    priceStats: computePriceStats(result.items),
    favoriteStats: computeFavoriteStats(result.items),
    topCreators: computeTopCreators(result.items, 3),
    itemTypeMix: computeItemTypeMix(result.items),
  };
}

/** Format analytics into a compact LLM-context block (~400 chars). */
export function formatAnalyticsForPrompt(summary: AnalyticsSummary): string {
  const ps = summary.priceStats;
  const fs = summary.favoriteStats;
  const lines: string[] = [];
  lines.push(`[Roblox catalog analytics — ${summary.category}/${summary.sort}/${summary.period}, sample n=${summary.itemCount}]`);
  if (ps.paidCount > 0) {
    lines.push(`Price (R$): median ${ps.median}, p25 ${ps.p25}, p75 ${ps.p75}, range ${ps.min}-${ps.max}, mean ${ps.mean}. Free items: ${ps.freeCount}/${ps.count}.`);
  } else {
    lines.push(`Price: all ${ps.freeCount} sampled items are Free.`);
  }
  lines.push(`Favorites: median ${fs.median}, max ${fs.max}, total ${fs.sum}.`);
  if (summary.itemTypeMix.bundleCount > 0) {
    lines.push(`Mix: ${summary.itemTypeMix.assetCount} Assets / ${summary.itemTypeMix.bundleCount} Bundles.`);
  }
  if (summary.topCreators.length > 0) {
    const tc = summary.topCreators.map((c) => `${c.name} (${c.itemCount})`).join(', ');
    lines.push(`Top creators: ${tc}.`);
  }
  return lines.join('\n');
}

// ──────────────────────────────────────────────
// Snapshot persistance (timeseries seeding)
// ──────────────────────────────────────────────

const SNAPSHOT_TTL_DAYS = 30;
const SNAPSHOT_TTL_MS = SNAPSHOT_TTL_DAYS * 24 * 60 * 60 * 1000;

export interface SnapshotItem {
  id: number;
  name: string;
  price: number | null;
  favoriteCount: number;
  creatorName: string;
  itemType: 'Asset' | 'Bundle';
}

interface SnapshotDoc {
  category: CatalogCategory;
  sort: CatalogSort;
  period: CatalogPeriod;
  limit: number;
  source: 'roblox' | 'apify';
  fetchedAt: number;
  hourBucket: number;
  items: SnapshotItem[];
  priceStats: PriceStats;
  favoriteStats: FavoriteStats;
  itemTypeMix: ItemTypeMix;
  topCreators: CreatorBreakdown[];
  expiresAt: number;
  createdAt: FirebaseFirestore.FieldValue;
}

function snapshotDocId(category: CatalogCategory, sort: CatalogSort, period: CatalogPeriod, limit: number, hourBucket: number): string {
  return `${category}_${sort}_${period}_${limit}_${hourBucket}`.toLowerCase();
}

function trimSnapshotItem(it: RobloxCatalogItem): SnapshotItem {
  return {
    id: it.id,
    name: (it.name || '').slice(0, 200),
    price: it.price ?? null,
    favoriteCount: typeof it.favoriteCount === 'number' ? it.favoriteCount : 0,
    creatorName: (it.creatorName || '').slice(0, 80),
    itemType: it.itemType,
  };
}

/**
 * Persists an hourly snapshot (idempotent within the hour: same hourBucket
 * doc-ID → overwrite). Used by warmupRobloxTrends. Failures are swallowed
 * — snapshot persistance must NEVER block the warmup path.
 */
export async function persistTrendsSnapshot(
  result: TrendingResult,
  query: { category: CatalogCategory; sort: CatalogSort; period: CatalogPeriod; limit: number },
): Promise<{ persisted: boolean; docId?: string; error?: string }> {
  if (!result.items.length) return { persisted: false, error: 'no items' };
  try {
    const fetchedAt = result.fetchedAt ?? Date.now();
    const hourBucket = Math.floor(fetchedAt / (60 * 60 * 1000));
    const docId = snapshotDocId(query.category, query.sort, query.period, query.limit, hourBucket);
    const summary = buildAnalyticsSummary(result, query);
    const doc: SnapshotDoc = {
      category: query.category,
      sort: query.sort,
      period: query.period,
      limit: query.limit,
      source: result.source,
      fetchedAt,
      hourBucket,
      items: result.items.map(trimSnapshotItem),
      priceStats: summary.priceStats,
      favoriteStats: summary.favoriteStats,
      itemTypeMix: summary.itemTypeMix,
      topCreators: summary.topCreators,
      expiresAt: fetchedAt + SNAPSHOT_TTL_MS,
      createdAt: FieldValue.serverTimestamp(),
    };
    const db = getFirestore();
    await db.collection('robloxTrendsSnapshots').doc(docId).set(doc, { merge: false });
    return { persisted: true, docId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn('persistTrendsSnapshot failed', {
      category: query.category, sort: query.sort, period: query.period, limit: query.limit, error: message,
    });
    return { persisted: false, error: message };
  }
}

export interface VelocityDelta {
  available: false;
  reason: string;
}
export interface VelocityResult {
  available: true;
  fromHourBucket: number;
  toHourBucket: number;
  deltaHours: number;
  newEntries: SnapshotItem[];          // in latest, not in previous
  droppedEntries: SnapshotItem[];      // in previous, not in latest
  priceMedianDelta: number | null;
  favoriteSumDelta: number;
}

function formatSnapshotItems(items: SnapshotItem[], max = 4): string {
  return items.slice(0, max).map((item) => {
    const price = item.price === null || item.price === 0 ? 'free' : `${item.price} R$`;
    return `${item.name} (${price}, fav ${item.favoriteCount})`;
  }).join('; ');
}

export function formatVelocityForPrompt(
  velocity: VelocityDelta | VelocityResult,
  query: { category: CatalogCategory; sort: CatalogSort; period: CatalogPeriod; limit: number },
): string {
  if (!velocity.available) return '';
  const lines: string[] = [];
  lines.push(`[Roblox catalog velocity — ${query.category}/${query.sort}/${query.period}, ${velocity.deltaHours}h window]`);
  if (velocity.newEntries.length > 0) {
    lines.push(`New/rising entries: ${formatSnapshotItems(velocity.newEntries)}.`);
  }
  if (velocity.droppedEntries.length > 0) {
    lines.push(`Dropped entries: ${formatSnapshotItems(velocity.droppedEntries, 3)}.`);
  }
  const priceDelta = velocity.priceMedianDelta === null
    ? 'n/a'
    : `${velocity.priceMedianDelta >= 0 ? '+' : ''}${velocity.priceMedianDelta} R$`;
  const favDelta = `${velocity.favoriteSumDelta >= 0 ? '+' : ''}${velocity.favoriteSumDelta}`;
  lines.push(`Aggregate movement: favorite sum ${favDelta}, median price delta ${priceDelta}.`);
  return lines.join('\n');
}

/**
 * Reads the two most recent snapshots for a query and computes velocity.
 * Returns `{available: false, reason}` if fewer than two snapshots exist
 * (e.g. first warmup run after deploy). Hooked for future use; not yet
 * wired into LLM context-injection.
 */
export async function computeVelocity(
  query: { category: CatalogCategory; sort: CatalogSort; period: CatalogPeriod; limit: number },
): Promise<VelocityDelta | VelocityResult> {
  try {
    const db = getFirestore();
    const prefix = `${query.category}_${query.sort}_${query.period}_${query.limit}_`.toLowerCase();
    // Avoid Firestore composite/index requirements during deploy/runtime by
    // directly reading the deterministic hourly document ids.
    const currentHourBucket = Math.floor(Date.now() / (60 * 60 * 1000));
    const refs = Array.from({ length: 72 }, (_unused, idx) =>
      db.collection('robloxTrendsSnapshots').doc(`${prefix}${currentHourBucket - idx}`));
    const snaps = await db.getAll(...refs);
    const docs = snaps
      .filter((snap) => snap.exists)
      .map((snap) => snap.data() as SnapshotDoc)
      .sort((a, b) => b.hourBucket - a.hourBucket)
      .slice(0, 2);
    if (docs.length < 2) {
      return { available: false, reason: `only ${docs.length} snapshot(s) found for ${prefix}` };
    }
    const latest = docs[0];
    const previous = docs[1];
    const prevIds = new Set(previous.items.map((it) => it.id));
    const latestIds = new Set(latest.items.map((it) => it.id));
    const newEntries = latest.items.filter((it) => !prevIds.has(it.id));
    const droppedEntries = previous.items.filter((it) => !latestIds.has(it.id));
    const priceMedianDelta = (latest.priceStats.median !== null && previous.priceStats.median !== null)
      ? latest.priceStats.median - previous.priceStats.median
      : null;
    const favoriteSumDelta = latest.favoriteStats.sum - previous.favoriteStats.sum;
    return {
      available: true,
      fromHourBucket: previous.hourBucket,
      toHourBucket: latest.hourBucket,
      deltaHours: latest.hourBucket - previous.hourBucket,
      newEntries,
      droppedEntries,
      priceMedianDelta,
      favoriteSumDelta,
    };
  } catch (err) {
    return { available: false, reason: err instanceof Error ? err.message : String(err) };
  }
}
