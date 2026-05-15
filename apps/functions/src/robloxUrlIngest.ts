// Roblox URL ingestion (Master Plan Phase C, session 227).
// Parses Roblox URLs (game/catalog/bundle/user/group) into structured meta.
// Game/user/group → fetch + OG meta tags (~300ms, no auth).
// Catalog/bundle → Apify lexis-solutions actor with startUrls (~7s, paid).
// Non-Roblox URLs → caller falls through to existing fetchUrlPreview.

import { logger } from 'firebase-functions';
import { APIFY_API_TOKEN } from './config.js';

const ROBLOX_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const FETCH_TIMEOUT_MS = 8_000;
const APIFY_TIMEOUT_MS = 60_000;
const APIFY_ACTOR_ID = 'lexis-solutions/roblox-marketplace-scraper';

export type RobloxUrlType = 'game' | 'catalog' | 'bundle' | 'user' | 'group' | 'unknown';

export interface RobloxUrlMeta {
  type: RobloxUrlType;
  url: string;
  /** Numeric ID extracted from path (placeId / assetId / bundleId / userId / groupId). */
  id?: number;
  title?: string;
  description?: string;
  imageUrl?: string;
  /** For catalog items: { creatorName, price, favoriteCount, itemType }. */
  catalogDetails?: {
    creatorName?: string;
    price?: number | null;
    favoriteCount?: number;
    itemType?: 'Asset' | 'Bundle';
  };
  source: 'og-meta' | 'apify' | 'unavailable';
}

/** Decode common HTML entities found in OG meta (Roblox uses &#xN; numeric refs). */
function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

/** Extracts Open Graph meta tags from HTML. Returns map of og:* → value. */
function extractOgMeta(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /<meta[^>]+property=["']og:([^"']+)["'][^>]+content=["']([^"']*)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const key = m[1].toLowerCase();
    const value = decodeHtmlEntities(m[2]);
    if (key && value && !out[key]) out[key] = value;
  }
  // Also try content-first ordering (some pages emit content before property).
  const reAlt = /<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:([^"']+)["']/gi;
  while ((m = reAlt.exec(html)) !== null) {
    const key = m[2].toLowerCase();
    const value = decodeHtmlEntities(m[1]);
    if (key && value && !out[key]) out[key] = value;
  }
  return out;
}

/** Detect URL type by hostname + pathname. */
export function classifyRobloxUrl(rawUrl: string): { type: RobloxUrlType; id?: number } {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { type: 'unknown' };
  }
  const host = parsed.hostname.toLowerCase();
  if (!host.endsWith('roblox.com') && !host.endsWith('rblx.co')) {
    return { type: 'unknown' };
  }
  const path = parsed.pathname;
  // /games/<placeId>/<slug>
  let m = path.match(/^\/games\/(\d+)/i);
  if (m) return { type: 'game', id: Number(m[1]) };
  // /catalog/<assetId>/<slug>
  m = path.match(/^\/catalog\/(\d+)/i);
  if (m) return { type: 'catalog', id: Number(m[1]) };
  // /bundles/<bundleId>/<slug>
  m = path.match(/^\/bundles\/(\d+)/i);
  if (m) return { type: 'bundle', id: Number(m[1]) };
  // /users/<userId>/profile
  m = path.match(/^\/users\/(\d+)/i);
  if (m) return { type: 'user', id: Number(m[1]) };
  // /groups/<groupId>/<slug>
  m = path.match(/^\/groups\/(\d+)/i);
  if (m) return { type: 'group', id: Number(m[1]) };
  return { type: 'unknown' };
}

async function fetchOgMeta(url: string): Promise<{ title?: string; description?: string; imageUrl?: string } | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url, { headers: { 'User-Agent': ROBLOX_UA }, signal: ctrl.signal });
    if (!resp.ok) return null;
    const html = await resp.text();
    const og = extractOgMeta(html);
    if (!og.title && !og.description) return null;
    return {
      title: og.title?.trim() || undefined,
      description: og.description?.trim().slice(0, 4000) || undefined,
      imageUrl: og.image?.trim() || undefined,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

interface ApifyCatalogRow {
  id?: number;
  name?: string;
  description?: string;
  creatorName?: string;
  price?: number;
  favoriteCount?: number;
  mainImage?: string;
  itemType?: 'Asset' | 'Bundle';
}

async function fetchCatalogViaApify(rawUrl: string): Promise<{
  title?: string; description?: string; imageUrl?: string;
  catalogDetails?: RobloxUrlMeta['catalogDetails'];
} | null> {
  const token = APIFY_API_TOKEN.value();
  if (!token) {
    logger.warn('Apify token unavailable; cannot ingest catalog URL');
    return null;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), APIFY_TIMEOUT_MS);
  try {
    const apifyUrl = `https://api.apify.com/v2/acts/${APIFY_ACTOR_ID.replace('/', '~')}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;
    const resp = await fetch(apifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({
        startUrls: [{ url: rawUrl }],
        maxItems: 1,
        proxyConfiguration: { useApifyProxy: true },
      }),
    });
    if (!resp.ok) {
      logger.warn('Apify catalog ingest HTTP error', { status: resp.status });
      return null;
    }
    const rows = (await resp.json()) as ApifyCatalogRow[];
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const row = rows[0];
    return {
      title: typeof row.name === 'string' ? row.name : undefined,
      description: typeof row.description === 'string' ? row.description.slice(0, 4000) : undefined,
      imageUrl: typeof row.mainImage === 'string' ? row.mainImage : undefined,
      catalogDetails: {
        creatorName: typeof row.creatorName === 'string' ? row.creatorName : undefined,
        price: typeof row.price === 'number' ? row.price : null,
        favoriteCount: typeof row.favoriteCount === 'number' ? row.favoriteCount : 0,
        itemType: row.itemType === 'Bundle' ? 'Bundle' : 'Asset',
      },
    };
  } catch (err) {
    logger.warn('Apify catalog ingest threw', { error: err instanceof Error ? err.message : String(err) });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Public entry point. Returns null when URL is not roblox.com or all sources
 * failed — caller should fall through to generic HTML-strip fetchUrlPreview.
 */
export async function parseRobloxUrl(rawUrl: string): Promise<RobloxUrlMeta | null> {
  const cls = classifyRobloxUrl(rawUrl);
  if (cls.type === 'unknown') return null;

  const startedAt = Date.now();

  // Game / user / group → OG meta from HTML page.
  if (cls.type === 'game' || cls.type === 'user' || cls.type === 'group') {
    const og = await fetchOgMeta(rawUrl);
    if (og) {
      logger.info('roblox-url-ingest og-meta ok', {
        type: cls.type, id: cls.id, ms: Date.now() - startedAt,
      });
      return {
        type: cls.type, url: rawUrl, id: cls.id,
        title: og.title, description: og.description, imageUrl: og.imageUrl,
        source: 'og-meta',
      };
    }
    return { type: cls.type, url: rawUrl, id: cls.id, source: 'unavailable' };
  }

  // Catalog / bundle → Apify lexis-solutions actor.
  if (cls.type === 'catalog' || cls.type === 'bundle') {
    const apifyResult = await fetchCatalogViaApify(rawUrl);
    if (apifyResult) {
      logger.info('roblox-url-ingest apify ok', {
        type: cls.type, id: cls.id, ms: Date.now() - startedAt,
      });
      return {
        type: cls.type, url: rawUrl, id: cls.id,
        title: apifyResult.title, description: apifyResult.description, imageUrl: apifyResult.imageUrl,
        catalogDetails: apifyResult.catalogDetails,
        source: 'apify',
      };
    }
    return { type: cls.type, url: rawUrl, id: cls.id, source: 'unavailable' };
  }

  return null;
}

/** Format meta into LLM-friendly text block. ~600 chars max. */
export function formatRobloxUrlMetaForPrompt(meta: RobloxUrlMeta): string {
  const lines: string[] = [];
  const typeLabel = ({
    game: 'Roblox game',
    catalog: 'Roblox catalog item',
    bundle: 'Roblox bundle',
    user: 'Roblox user profile',
    group: 'Roblox group',
    unknown: 'Roblox link',
  })[meta.type];
  lines.push(`[Reference ${typeLabel} (id=${meta.id ?? '?'}, source=${meta.source})]`);
  if (meta.title) lines.push(`Title: ${meta.title}`);
  if (meta.catalogDetails?.creatorName) lines.push(`Creator: ${meta.catalogDetails.creatorName}`);
  if (meta.catalogDetails?.price !== undefined) {
    const p = meta.catalogDetails.price;
    lines.push(`Price: ${p === null || p === 0 ? 'Free' : `${p} R$`}`);
  }
  if (meta.catalogDetails?.favoriteCount !== undefined) {
    lines.push(`Favorites: ${meta.catalogDetails.favoriteCount}`);
  }
  if (meta.description) {
    const desc = meta.description.replace(/\s+/g, ' ').slice(0, 500);
    lines.push(`Description: ${desc}`);
  }
  lines.push(`URL: ${meta.url}`);
  return lines.join('\n');
}
