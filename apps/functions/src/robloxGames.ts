// Roblox trending games fetcher (Master Plan Phase B, session 226).
// Source: Rolimons community tracker API (api.rolimons.com/games/v1/gamelist).
// Free, no auth, requires browser User-Agent. Cached 30 min in Firestore.

import { logger } from 'firebase-functions';
import { getFirestore } from 'firebase-admin/firestore';

const ROLIMONS_URL = 'https://api.rolimons.com/games/v1/gamelist';
const ROLIMONS_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const FETCH_TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_RETURN = 100;

export interface TrendingGame {
  placeId: number;
  name: string;
  activeUsers: number;
  iconUrl: string | null;
  /** Roblox game URL — direct deep-link players can tap to launch. */
  gameUrl: string;
}

export interface TrendingGamesResult {
  source: 'rolimons' | 'cache-stale';
  fetchedAt: number;
  games: TrendingGame[];
}

interface RolimonsRow {
  0: string;          // name
  1: number;          // activeUsers
  2: string;          // iconUrl
}

async function fetchFromRolimons(limit: number): Promise<TrendingGame[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(ROLIMONS_URL, {
      headers: { 'User-Agent': ROLIMONS_UA, 'Accept': 'application/json' },
      signal: ctrl.signal,
    });
    if (!resp.ok) {
      throw new Error(`Rolimons HTTP ${resp.status}`);
    }
    const json = (await resp.json()) as { success?: boolean; games?: Record<string, RolimonsRow> };
    if (!json.success || !json.games || typeof json.games !== 'object') {
      throw new Error('Rolimons returned malformed payload');
    }
    const all: TrendingGame[] = [];
    for (const [placeIdStr, row] of Object.entries(json.games)) {
      const placeId = Number(placeIdStr);
      if (!Number.isFinite(placeId) || placeId <= 0) continue;
      if (!Array.isArray(row) || row.length < 3) continue;
      const name = typeof row[0] === 'string' ? row[0] : `Game ${placeId}`;
      const activeUsers = typeof row[1] === 'number' ? row[1] : 0;
      const iconUrl = typeof row[2] === 'string' && row[2].startsWith('https://') ? row[2] : null;
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'game';
      all.push({
        placeId, name, activeUsers, iconUrl,
        gameUrl: `https://www.roblox.com/games/${placeId}/${slug}`,
      });
    }
    // Sort by active users desc — Rolimons returns by placeId order, not activity.
    all.sort((a, b) => b.activeUsers - a.activeUsers);
    return all.slice(0, Math.max(1, Math.min(MAX_RETURN, limit)));
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Top trending games from Rolimons. Cached 30 min in Firestore.
 * Returns up to `limit` games sorted by active concurrent users.
 * On Rolimons failure, returns stale cache if available, else empty.
 */
export async function fetchTrendingGames(limit: number = 50): Promise<TrendingGamesResult & { cached: boolean }> {
  const safeLimit = Math.max(1, Math.min(MAX_RETURN, Math.floor(limit)));
  const startedAt = Date.now();
  const cacheKey = `trending_games_top${safeLimit}`;
  const db = getFirestore();
  const docRef = db.collection('robloxTrends').doc(cacheKey);

  // Cache lookup with stale fallback
  let staleData: TrendingGamesResult | null = null;
  try {
    const snap = await docRef.get();
    if (snap.exists) {
      const cached = snap.data() as { data?: TrendingGamesResult; expiresAt?: number } | undefined;
      if (cached?.data?.games?.length) {
        if (typeof cached.expiresAt === 'number' && cached.expiresAt > Date.now()) {
          logger.info('roblox-games cache hit', {
            limit: safeLimit, games: cached.data.games.length, ms: Date.now() - startedAt,
          });
          return { ...cached.data, cached: true };
        }
        staleData = cached.data;
      }
    }
  } catch (err) {
    logger.warn('roblox-games cache read failed', err);
  }

  try {
    const games = await fetchFromRolimons(safeLimit);
    if (games.length === 0) throw new Error('Rolimons returned 0 games');
    const result: TrendingGamesResult = { source: 'rolimons', fetchedAt: Date.now(), games };
    try {
      await docRef.set({ data: result, expiresAt: Date.now() + CACHE_TTL_MS }, { merge: true });
    } catch (err) {
      logger.warn('roblox-games cache write failed', err);
    }
    logger.info('roblox-games fetched', {
      limit: safeLimit, games: games.length, ms: Date.now() - startedAt, cacheHit: false, source: 'rolimons',
    });
    return { ...result, cached: false };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.warn('roblox-games primary failed', { error: errMsg });
    if (staleData) {
      logger.info('roblox-games serving stale cache', {
        limit: safeLimit, games: staleData.games.length, age_ms: Date.now() - staleData.fetchedAt,
      });
      return { source: 'cache-stale', fetchedAt: staleData.fetchedAt, games: staleData.games, cached: true };
    }
    throw new Error(`Roblox trending games unavailable: ${errMsg}`);
  }
}
