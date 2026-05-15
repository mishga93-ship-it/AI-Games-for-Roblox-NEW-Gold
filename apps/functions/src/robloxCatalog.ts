// Roblox catalog trends fetcher.
// Primary: public Roblox APIs (catalog/items/details + thumbnails).
// Fallback: Apify actor lexis-solutions/roblox-marketplace-scraper.
// Caches results in Firestore (collection `robloxTrends`, 30-min TTL).

import { logger } from 'firebase-functions';
import { getFirestore } from 'firebase-admin/firestore';
import { APIFY_API_TOKEN } from './config.js';

export type CatalogPeriod = 'PastDay' | 'PastWeek' | 'PastMonth' | 'AllTime';
export type CatalogSort = 'Sales' | 'MostFavorited' | 'RecentlyCreated' | 'Relevance';
// Empirically verified to return distinct data via catalog.roblox.com/v1/search/items.
// Other Category values (Clothing/BodyParts/Faces) require an unsupported Subcategory
// or silently return the same dataset as Featured — dropped from v1 whitelist.
export type CatalogCategory =
  | 'Featured'
  | 'Collectibles'
  | 'Decals'
  | 'Animations';

export interface RobloxCatalogItem {
  id: number;
  name: string;
  itemType: 'Asset' | 'Bundle';
  assetType?: number;
  creatorName: string;
  creatorType: string;
  price: number | null;
  favoriteCount: number;
  thumbnailUrl: string | null;
  url: string;
}

export interface TrendingResult {
  source: 'roblox' | 'apify';
  fetchedAt: number;
  items: RobloxCatalogItem[];
}

interface FetchOpts {
  category?: CatalogCategory;
  sort?: CatalogSort;
  period?: CatalogPeriod;
  limit?: number;
}

const CACHE_TTL_MS = 30 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5_000;
const MAX_LIMIT = 20;

const CATEGORY_ENUM: Record<CatalogCategory, number> = {
  Featured: 1,
  Collectibles: 3,
  Decals: 11,
  Animations: 12,
};

const SORT_ENUM: Record<CatalogSort, number> = {
  Relevance: 0,
  MostFavorited: 1,
  Sales: 2,
  RecentlyCreated: 3,
};

const AGGREGATION_ENUM: Record<CatalogPeriod, number> = {
  PastDay: 1,
  PastWeek: 3,
  PastMonth: 4,
  AllTime: 5,
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function cacheKey(category: CatalogCategory, sort: CatalogSort, period: CatalogPeriod, limit: number): string {
  return `${category}_${sort}_${period}_${limit}`.toLowerCase();
}

// Browser-like UA — Cloud Functions default fetch UA is rate-limited harder by Roblox.
const ROBLOX_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function fetchJsonWithTimeout(url: string, init?: RequestInit): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const headers = { 'User-Agent': ROBLOX_UA, ...(init?.headers as Record<string, string> | undefined) };
    const resp = await fetch(url, { ...init, headers, signal: ctrl.signal });
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status} for ${url}`);
    }
    return await resp.json();
  } finally {
    clearTimeout(timer);
  }
}

// Roblox catalog/items/details requires X-CSRF-TOKEN. The first POST returns 403
// with the token in the response headers; retry once with that token.
async function fetchWithCsrfRetry(url: string, body: string): Promise<unknown> {
  const doFetch = async (token: string | null): Promise<Response> => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json', 'User-Agent': ROBLOX_UA };
      if (token) headers['X-CSRF-TOKEN'] = token;
      return await fetch(url, { method: 'POST', headers, body, signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
  };

  let resp = await doFetch(null);
  if (resp.status === 403) {
    const csrf = resp.headers.get('x-csrf-token');
    if (csrf) {
      resp = await doFetch(csrf);
    }
  }
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} for ${url}`);
  }
  return await resp.json();
}

// Roblox catalog/v1/search/items requires Limit ∈ {10,28,30,50,60,100,120}.
// Snap requested limit upward to the smallest allowed value, then slice client-side.
const ALLOWED_ROBLOX_LIMITS = [10, 28, 30, 50, 60, 100, 120];
function snapLimit(requested: number): number {
  for (const v of ALLOWED_ROBLOX_LIMITS) {
    if (v >= requested) return v;
  }
  return ALLOWED_ROBLOX_LIMITS[ALLOWED_ROBLOX_LIMITS.length - 1];
}

interface CatalogSearchEntry {
  id: number;
  itemType: 'Asset' | 'Bundle';
}

async function searchItems(
  category: CatalogCategory,
  sort: CatalogSort,
  period: CatalogPeriod,
  limit: number,
): Promise<CatalogSearchEntry[]> {
  const url = new URL('https://catalog.roblox.com/v1/search/items');
  url.searchParams.set('Category', String(CATEGORY_ENUM[category]));
  url.searchParams.set('SortType', String(SORT_ENUM[sort]));
  if (sort === 'Sales' || sort === 'MostFavorited') {
    url.searchParams.set('SortAggregation', String(AGGREGATION_ENUM[period]));
  }
  url.searchParams.set('Limit', String(snapLimit(clamp(limit, 1, 30))));

  const json = await fetchJsonWithTimeout(url.toString());
  const data = (json as { data?: unknown[] })?.data;
  if (!Array.isArray(data)) return [];
  return data
    .map((row): CatalogSearchEntry | null => {
      const r = row as { id?: unknown; itemType?: unknown };
      const id = typeof r.id === 'number' ? r.id : Number(r.id);
      const itemType = r.itemType === 'Bundle' ? 'Bundle' : 'Asset';
      return Number.isFinite(id) && id > 0 ? { id, itemType } : null;
    })
    .filter((row): row is CatalogSearchEntry => row !== null)
    .slice(0, limit);
}

interface CatalogDetailEntry {
  id: number;
  itemType: 'Asset' | 'Bundle';
  name: string;
  assetType?: number;
  creatorName: string;
  creatorType: string;
  price: number | null;
  favoriteCount: number;
}

async function fetchDetails(entries: CatalogSearchEntry[]): Promise<CatalogDetailEntry[]> {
  if (entries.length === 0) return [];
  const body = JSON.stringify({ items: entries.map((e) => ({ itemType: e.itemType, id: e.id })) });
  const json = await fetchWithCsrfRetry('https://catalog.roblox.com/v1/catalog/items/details', body);
  const data = (json as { data?: unknown[] })?.data;
  if (!Array.isArray(data)) return [];
  return data
    .map((row): CatalogDetailEntry | null => {
      const r = row as Record<string, unknown>;
      const id = typeof r.id === 'number' ? r.id : Number(r.id);
      if (!Number.isFinite(id) || id <= 0) return null;
      const itemType = r.itemType === 'Bundle' ? 'Bundle' : 'Asset';
      const name = typeof r.name === 'string' && r.name.trim() ? r.name.trim() : `Asset ${id}`;
      const assetType = typeof r.assetType === 'number' ? r.assetType : undefined;
      const creatorName = typeof r.creatorName === 'string' ? r.creatorName : 'Unknown';
      const creatorType = typeof r.creatorType === 'string' ? r.creatorType : 'User';
      const priceRaw = r.price;
      const price = typeof priceRaw === 'number' && Number.isFinite(priceRaw) ? priceRaw : null;
      const favoriteCount = typeof r.favoriteCount === 'number' ? r.favoriteCount : 0;
      return { id, itemType, name, assetType, creatorName, creatorType, price, favoriteCount };
    })
    .filter((row): row is CatalogDetailEntry => row !== null);
}

async function fetchAssetThumbnails(assetIds: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  if (assetIds.length === 0) return out;
  const ids = assetIds.slice(0, 20).join(',');
  const url = `https://thumbnails.roblox.com/v1/assets?assetIds=${ids}&size=420x420&format=Png&isCircular=false`;
  try {
    const json = await fetchJsonWithTimeout(url);
    const data = (json as { data?: unknown[] })?.data;
    if (!Array.isArray(data)) return out;
    for (const row of data) {
      const r = row as { targetId?: unknown; imageUrl?: unknown; state?: unknown };
      const targetId = typeof r.targetId === 'number' ? r.targetId : Number(r.targetId);
      const imageUrl = typeof r.imageUrl === 'string' ? r.imageUrl : '';
      if (Number.isFinite(targetId) && targetId > 0 && imageUrl.startsWith('https://') && r.state === 'Completed') {
        out.set(targetId, imageUrl);
      }
    }
  } catch (err) {
    logger.warn('thumbnails.roblox.com failed; thumbnails will be null', err);
  }
  return out;
}

function buildItemUrl(entry: CatalogDetailEntry): string {
  const slug = entry.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
  return entry.itemType === 'Bundle'
    ? `https://www.roblox.com/bundles/${entry.id}/${slug}`
    : `https://www.roblox.com/catalog/${entry.id}/${slug}`;
}

async function fetchFromRoblox(
  category: CatalogCategory,
  sort: CatalogSort,
  period: CatalogPeriod,
  limit: number,
): Promise<RobloxCatalogItem[]> {
  const entries = await searchItems(category, sort, period, limit);
  if (entries.length === 0) return [];

  const details = await fetchDetails(entries);
  const detailMap = new Map(details.map((d) => [d.id, d]));

  const assetIds = entries.filter((e) => e.itemType === 'Asset').map((e) => e.id);
  const thumbs = await fetchAssetThumbnails(assetIds);

  return entries
    .map((entry): RobloxCatalogItem | null => {
      const d = detailMap.get(entry.id);
      if (!d) return null;
      return {
        id: d.id,
        name: d.name,
        itemType: d.itemType,
        assetType: d.assetType,
        creatorName: d.creatorName,
        creatorType: d.creatorType,
        price: d.price,
        favoriteCount: d.favoriteCount,
        thumbnailUrl: thumbs.get(d.id) ?? null,
        url: buildItemUrl(d),
      };
    })
    .filter((row): row is RobloxCatalogItem => row !== null);
}

// ── Apify fallback ─────────────────────────────────────────────────────────

const APIFY_ACTOR_ID = 'lexis-solutions/roblox-marketplace-scraper';
const APIFY_TIMEOUT_MS = 60_000;
const APIFY_CATEGORY_MAP: Record<CatalogCategory, string> = {
  Featured: 'characters',
  Collectibles: 'accessories',
  Decals: 'accessories',
  Animations: 'avataranimations',
};
const APIFY_SORT_MAP: Record<CatalogSort, string> = {
  Sales: 'bestselling',
  MostFavorited: 'mostfavorited',
  RecentlyCreated: 'recentlypublished',
  Relevance: 'relevance',
};

function apifyCatalogStartUrl(category: CatalogCategory, sort: CatalogSort): string {
  const url = new URL('https://www.roblox.com/catalog');
  url.searchParams.set('Category', String(CATEGORY_ENUM[category]));
  url.searchParams.set('salesTypeFilter', '1');
  url.searchParams.set('SortType', String(SORT_ENUM[sort]));
  return url.toString();
}

async function fetchFromApify(
  category: CatalogCategory,
  sort: CatalogSort,
  limit: number,
): Promise<RobloxCatalogItem[]> {
  const token = APIFY_API_TOKEN.value();
  if (!token) {
    throw new Error('APIFY_API_TOKEN unavailable; cannot use fallback');
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), APIFY_TIMEOUT_MS);
  try {
    const url = `https://api.apify.com/v2/acts/${APIFY_ACTOR_ID.replace('/', '~')}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      // Schema: actor input has `topic` enum constrained to ['ninja','martial arts',
      // 'bundle','futuristic','scifi','robot','weapon','ranged','metal'] — NOT 'all'.
      // Sending an off-enum value returns HTTP 400. We omit `topic` entirely so the
      // actor scrapes without a topic filter. `category` enum: ['all','characters',
      // 'clothing','accessories','heads','avataranimations']. `salesType` enum:
      // ['all','limited']. `sortType` enum: ['relevance','mostfavorited','bestselling',
      // 'recentlypublished','pricelowhigh','pricehighlow']. `maxItems` (not `limit`).
      body: JSON.stringify({
        startUrls: [{ url: apifyCatalogStartUrl(category, sort) }],
        category: APIFY_CATEGORY_MAP[category],
        sortType: APIFY_SORT_MAP[sort],
        includeUnavailableItems: false,
        salesType: 'all',
        maxItems: limit,
        proxyConfiguration: { useApifyProxy: true },
      }),
    });
    if (!resp.ok) {
      throw new Error(`Apify HTTP ${resp.status}`);
    }
    const rows = (await resp.json()) as unknown;
    if (!Array.isArray(rows)) return [];
    return rows
      .map((row): RobloxCatalogItem | null => {
        const r = row as Record<string, unknown>;
        const id = typeof r.id === 'number' ? r.id : Number(r.id);
        if (!Number.isFinite(id) || id <= 0) return null;
        const itemType = r.itemType === 'Bundle' ? 'Bundle' : 'Asset';
        const name = typeof r.name === 'string' ? r.name : `Asset ${id}`;
        const creatorName = typeof r.creatorName === 'string' ? r.creatorName : 'Unknown';
        const price = typeof r.price === 'number' ? r.price : null;
        const favoriteCount = typeof r.favoriteCount === 'number' ? r.favoriteCount : 0;
        const mainImage = typeof r.mainImage === 'string' ? r.mainImage : null;
        const itemUrl = typeof r.url === 'string' ? r.url : `https://www.roblox.com/catalog/${id}`;
        return {
          id,
          name,
          itemType,
          creatorName,
          creatorType: 'User',
          price,
          favoriteCount,
          thumbnailUrl: mainImage,
          url: itemUrl,
        };
      })
      .filter((row): row is RobloxCatalogItem => row !== null)
      .slice(0, limit);
  } finally {
    clearTimeout(timer);
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

export async function fetchTrendingCatalog(opts: FetchOpts = {}): Promise<TrendingResult & { cached: boolean }> {
  const category: CatalogCategory = opts.category ?? 'Featured';
  const sort: CatalogSort = opts.sort ?? 'Sales';
  const period: CatalogPeriod = opts.period ?? 'PastWeek';
  const limit = clamp(opts.limit ?? 20, 1, MAX_LIMIT);

  const startedAt = Date.now();
  const key = cacheKey(category, sort, period, limit);
  const db = getFirestore();
  const docRef = db.collection('robloxTrends').doc(key);

  // 1. Cache lookup. Keep stale entry in scope for fallback if both Roblox + Apify fail.
  let staleData: TrendingResult | null = null;
  try {
    const snap = await docRef.get();
    if (snap.exists) {
      const cached = snap.data() as { data?: TrendingResult; expiresAt?: number } | undefined;
      if (cached?.data?.items?.length) {
        if (typeof cached.expiresAt === 'number' && cached.expiresAt > Date.now()) {
          logger.info('roblox-trends cache hit', {
            category, sort, period, limit, source: cached.data.source, items: cached.data.items.length,
            ms: Date.now() - startedAt, cacheHit: true,
          });
          return { ...cached.data, cached: true };
        }
        staleData = cached.data;
      }
    }
  } catch (err) {
    logger.warn('roblox-trends cache read failed', err);
  }

  // 2. Primary: direct Roblox APIs
  let items: RobloxCatalogItem[] = [];
  let source: 'roblox' | 'apify' = 'roblox';
  try {
    items = await fetchFromRoblox(category, sort, period, limit);
    if (items.length === 0) {
      throw new Error('Roblox API returned 0 items');
    }
  } catch (err) {
    const robloxErrMsg = err instanceof Error ? err.message : String(err);
    logger.warn('roblox-trends primary failed; falling back to Apify', {
      category, sort, period, error: robloxErrMsg,
    });
    try {
      items = await fetchFromApify(category, sort, limit);
      source = 'apify';
    } catch (apifyErr) {
      const apifyErrMsg = apifyErr instanceof Error ? apifyErr.message : String(apifyErr);
      logger.error('roblox-trends Apify fallback also failed', { roblox: robloxErrMsg, apify: apifyErrMsg });
      // Stale-cache fallback: better to return slightly outdated data than 502.
      if (staleData) {
        logger.info('roblox-trends serving stale cache after both providers failed', {
          category, sort, period, source: staleData.source, items: staleData.items.length, age_ms: Date.now() - staleData.fetchedAt,
        });
        return { ...staleData, cached: true };
      }
      throw new Error(`Roblox: ${robloxErrMsg} | Apify: ${apifyErrMsg}`);
    }
  }

  const result: TrendingResult = { source, fetchedAt: Date.now(), items };

  // 3. Cache write
  try {
    await docRef.set({ data: result, expiresAt: Date.now() + CACHE_TTL_MS }, { merge: true });
  } catch (err) {
    logger.warn('roblox-trends cache write failed', err);
  }

  logger.info('roblox-trends fetched', {
    category, sort, period, limit, source, items: items.length,
    ms: Date.now() - startedAt, cacheHit: false,
  });

  return { ...result, cached: false };
}

// ── Keyword catalog search (Phase A, session 225) ────────────────────────
// `fetchTrendingCatalog` returns sales/favorited top-N items. This adds
// keyword-based search — for «зомби-обби» / «ninja game» / «skibidi» etc.
// Same Roblox primary + Apify fallback + Firestore cache pattern. Cache key
// namespace prefixed with `keyword_` so trending and keyword caches don't
// stomp each other.

const KEYWORD_CACHE_TTL_MS = 15 * 60 * 1000; // shorter than trending; keyword data turns over faster

interface KeywordFetchOpts {
  keyword: string;
  category?: CatalogCategory;
  limit?: number;
}

async function searchItemsByKeyword(
  keyword: string,
  category: CatalogCategory,
  limit: number,
): Promise<CatalogSearchEntry[]> {
  const url = new URL('https://catalog.roblox.com/v1/search/items');
  url.searchParams.set('Category', String(CATEGORY_ENUM[category]));
  url.searchParams.set('Keyword', keyword);
  url.searchParams.set('SortType', String(SORT_ENUM.MostFavorited));
  url.searchParams.set('Limit', String(snapLimit(clamp(limit, 1, 30))));

  const json = await fetchJsonWithTimeout(url.toString());
  const data = (json as { data?: unknown[] })?.data;
  if (!Array.isArray(data)) return [];
  return data
    .map((row): CatalogSearchEntry | null => {
      const r = row as { id?: unknown; itemType?: unknown };
      const id = typeof r.id === 'number' ? r.id : Number(r.id);
      const itemType = r.itemType === 'Bundle' ? 'Bundle' : 'Asset';
      return Number.isFinite(id) && id > 0 ? { id, itemType } : null;
    })
    .filter((row): row is CatalogSearchEntry => row !== null)
    .slice(0, limit);
}

async function fetchKeywordFromRoblox(
  keyword: string,
  category: CatalogCategory,
  limit: number,
): Promise<RobloxCatalogItem[]> {
  const entries = await searchItemsByKeyword(keyword, category, limit);
  if (entries.length === 0) return [];
  const details = await fetchDetails(entries);
  const detailMap = new Map(details.map((d) => [d.id, d]));
  const assetIds = entries.filter((e) => e.itemType === 'Asset').map((e) => e.id);
  const thumbs = await fetchAssetThumbnails(assetIds);
  return entries
    .map((entry): RobloxCatalogItem | null => {
      const d = detailMap.get(entry.id);
      if (!d) return null;
      return {
        id: d.id, name: d.name, itemType: d.itemType, assetType: d.assetType,
        creatorName: d.creatorName, creatorType: d.creatorType,
        price: d.price, favoriteCount: d.favoriteCount,
        thumbnailUrl: thumbs.get(d.id) ?? null, url: buildItemUrl(d),
      };
    })
    .filter((row): row is RobloxCatalogItem => row !== null);
}

async function fetchKeywordFromApify(
  keyword: string,
  category: CatalogCategory,
  limit: number,
): Promise<RobloxCatalogItem[]> {
  const token = APIFY_API_TOKEN.value();
  if (!token) throw new Error('APIFY_API_TOKEN unavailable; cannot use fallback');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), APIFY_TIMEOUT_MS);
  try {
    const url = `https://api.apify.com/v2/acts/${APIFY_ACTOR_ID.replace('/', '~')}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;
    const startUrl = new URL('https://www.roblox.com/catalog');
    startUrl.searchParams.set('Keyword', keyword);
    startUrl.searchParams.set('Category', String(CATEGORY_ENUM[category]));
    startUrl.searchParams.set('SortType', String(SORT_ENUM.MostFavorited));
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({
        startUrls: [{ url: startUrl.toString() }],
        keyword,
        category: APIFY_CATEGORY_MAP[category],
        sortType: 'mostfavorited',
        includeUnavailableItems: false,
        salesType: 'all',
        maxItems: limit,
        proxyConfiguration: { useApifyProxy: true },
      }),
    });
    if (!resp.ok) throw new Error(`Apify HTTP ${resp.status}`);
    const rows = (await resp.json()) as unknown;
    if (!Array.isArray(rows)) return [];
    return rows
      .map((row): RobloxCatalogItem | null => {
        const r = row as Record<string, unknown>;
        const id = typeof r.id === 'number' ? r.id : Number(r.id);
        if (!Number.isFinite(id) || id <= 0) return null;
        const itemType = r.itemType === 'Bundle' ? 'Bundle' : 'Asset';
        const name = typeof r.name === 'string' ? r.name : `Asset ${id}`;
        const creatorName = typeof r.creatorName === 'string' ? r.creatorName : 'Unknown';
        const price = typeof r.price === 'number' ? r.price : null;
        const favoriteCount = typeof r.favoriteCount === 'number' ? r.favoriteCount : 0;
        const mainImage = typeof r.mainImage === 'string' ? r.mainImage : null;
        const itemUrl = typeof r.url === 'string' ? r.url : `https://www.roblox.com/catalog/${id}`;
        return {
          id, name, itemType, creatorName, creatorType: 'User',
          price, favoriteCount, thumbnailUrl: mainImage, url: itemUrl,
        };
      })
      .filter((row): row is RobloxCatalogItem => row !== null)
      .slice(0, limit);
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchCatalogByKeyword(opts: KeywordFetchOpts): Promise<TrendingResult & { cached: boolean }> {
  const keyword = opts.keyword.trim().toLowerCase();
  if (!keyword) {
    return { source: 'roblox', fetchedAt: Date.now(), items: [], cached: false };
  }
  const category: CatalogCategory = opts.category ?? 'Featured';
  const limit = clamp(opts.limit ?? 10, 1, MAX_LIMIT);
  const startedAt = Date.now();
  const cacheKeyStr = `keyword_${keyword.replace(/[^a-z0-9]+/g, '_').slice(0, 40)}_${category}_${limit}`;
  const db = getFirestore();
  const docRef = db.collection('robloxTrends').doc(cacheKeyStr);

  let staleData: TrendingResult | null = null;
  try {
    const snap = await docRef.get();
    if (snap.exists) {
      const cached = snap.data() as { data?: TrendingResult; expiresAt?: number } | undefined;
      if (cached?.data?.items?.length) {
        if (typeof cached.expiresAt === 'number' && cached.expiresAt > Date.now()) {
          logger.info('roblox-keyword cache hit', {
            keyword, category, items: cached.data.items.length, ms: Date.now() - startedAt,
          });
          return { ...cached.data, cached: true };
        }
        staleData = cached.data;
      }
    }
  } catch (err) {
    logger.warn('roblox-keyword cache read failed', err);
  }

  let items: RobloxCatalogItem[] = [];
  let source: 'roblox' | 'apify' = 'roblox';
  try {
    items = await fetchKeywordFromRoblox(keyword, category, limit);
    if (items.length === 0) throw new Error('Roblox keyword returned 0 items');
  } catch (err) {
    const robloxErrMsg = err instanceof Error ? err.message : String(err);
    logger.warn('roblox-keyword primary failed; falling back to Apify', { keyword, category, error: robloxErrMsg });
    try {
      items = await fetchKeywordFromApify(keyword, category, limit);
      source = 'apify';
    } catch (apifyErr) {
      const apifyErrMsg = apifyErr instanceof Error ? apifyErr.message : String(apifyErr);
      logger.error('roblox-keyword Apify fallback also failed', { roblox: robloxErrMsg, apify: apifyErrMsg });
      if (staleData) {
        logger.info('roblox-keyword serving stale cache', { keyword, age_ms: Date.now() - staleData.fetchedAt });
        return { ...staleData, cached: true };
      }
      // For keyword search, empty result is OK — caller falls back to non-keyword logic.
      return { source: 'roblox', fetchedAt: Date.now(), items: [], cached: false };
    }
  }

  const result: TrendingResult = { source, fetchedAt: Date.now(), items };
  try {
    await docRef.set({ data: result, expiresAt: Date.now() + KEYWORD_CACHE_TTL_MS }, { merge: true });
  } catch (err) {
    logger.warn('roblox-keyword cache write failed', err);
  }
  logger.info('roblox-keyword fetched', {
    keyword, category, source, items: items.length, ms: Date.now() - startedAt, cacheHit: false,
  });
  return { ...result, cached: false };
}

// ── Chat-pipeline helpers ──────────────────────────────────────────────────

// JS \b only treats ASCII as word chars, so Cyrillic patterns are matched as substrings.
const TRENDS_REGEX = /(?:\btrending\b|\bpopular\b|\btop\s+(?:items|hats|faces|bundles|catalog)\b|\bcatalog\s+trends?\b|тренд|что\s+(?:сейчас\s+)?популярн)/i;

export function detectRobloxTrendsRequest(latestMessage: string, metadata?: Record<string, unknown>): boolean {
  if (metadata && metadata.requestTrends === true) return true;
  return typeof latestMessage === 'string' && TRENDS_REGEX.test(latestMessage);
}

export function formatTrendsContextForPrompt(result: TrendingResult, opts: { category: CatalogCategory; sort: CatalogSort; period: CatalogPeriod }): string {
  if (!result.items.length) return '';
  const lines = result.items.slice(0, 10).map((item, idx) => {
    const price = item.price === null ? 'free' : `${item.price} R$`;
    return `${idx + 1}. ${item.name} — by ${item.creatorName}, ${price}, ❤ ${item.favoriteCount}, id ${item.id} (${item.url})`;
  });
  const aggregationLabel = opts.sort === 'Sales' || opts.sort === 'MostFavorited' ? ` (${opts.period.replace('Past', 'past ').toLowerCase()})` : '';
  return `[Roblox Catalog — top ${lines.length} trending ${opts.category} by ${opts.sort}${aggregationLabel}, source=${result.source}]\n${lines.join('\n')}`;
}
