import { logger } from 'firebase-functions';
import { getFirestore } from 'firebase-admin/firestore';
import { fetchCatalogByKeyword, type RobloxCatalogItem } from './robloxCatalog.js';

export interface MemeTrendSeed {
  keyword: string;
  aliases: string[];
  category: 'brainrot' | 'classic_meme' | 'slang' | 'ugc_style';
}

export interface MemeTrendSignal {
  keyword: string;
  aliases: string[];
  category: MemeTrendSeed['category'];
  score: number;
  source: 'roblox' | 'apify';
  cached: boolean;
  itemCount: number;
  totalFavorites: number;
  topItemName: string | null;
  sampleItems: Array<{
    id: number;
    name: string;
    favoriteCount: number;
    url: string;
    thumbnailUrl: string | null;
  }>;
}

export interface MemeTrendFeed {
  source: 'roblox' | 'apify' | 'mixed';
  cached: boolean;
  fetchedAt: number;
  signals: MemeTrendSignal[];
}

const MEME_FEED_CACHE_TTL_MS = 15 * 60 * 1000;
const DEFAULT_MAX_KEYWORDS = 8;
const DEFAULT_LIMIT = 8;

export const MEME_TREND_SEEDS: readonly MemeTrendSeed[] = [
  { keyword: 'italian brainrot', aliases: ['brainrot', 'meme animal'], category: 'brainrot' },
  { keyword: 'skibidi', aliases: ['skibidi toilet'], category: 'brainrot' },
  { keyword: 'tralalero tralala', aliases: ['tralalero', 'shark meme'], category: 'brainrot' },
  { keyword: 'bombardiro crocodilo', aliases: ['bombardiro', 'crocodilo'], category: 'brainrot' },
  { keyword: 'tung tung sahur', aliases: ['tung tung', 'sahur'], category: 'brainrot' },
  { keyword: 'cappuccino assassino', aliases: ['cappuccino', 'assassino'], category: 'brainrot' },
  { keyword: 'sigma', aliases: ['sigma face', 'alpha'], category: 'slang' },
  { keyword: 'rizz', aliases: ['rizz face'], category: 'slang' },
  { keyword: 'ohio', aliases: ['ohio meme'], category: 'classic_meme' },
  { keyword: 'aura', aliases: ['aura meme'], category: 'slang' },
  { keyword: 'npc meme', aliases: ['npc'], category: 'classic_meme' },
  { keyword: 'meme face', aliases: ['funny face'], category: 'ugc_style' },
];

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function scoreSignal(seed: MemeTrendSeed, items: RobloxCatalogItem[]): number {
  const totalFavorites = items.reduce((sum, item) => sum + Math.max(0, item.favoriteCount || 0), 0);
  const exactHits = items.filter((item) => {
    const name = item.name.toLowerCase();
    return name.includes(seed.keyword.toLowerCase())
      || seed.aliases.some((alias) => name.includes(alias.toLowerCase()));
  }).length;
  return Math.round(Math.log10(1 + totalFavorites) * 120 + items.length * 12 + exactHits * 35);
}

function toSignal(
  seed: MemeTrendSeed,
  result: { source: 'roblox' | 'apify'; cached: boolean; items: RobloxCatalogItem[] },
): MemeTrendSignal {
  const items = result.items.slice(0, 4);
  const totalFavorites = items.reduce((sum, item) => sum + Math.max(0, item.favoriteCount || 0), 0);
  return {
    keyword: seed.keyword,
    aliases: seed.aliases,
    category: seed.category,
    score: scoreSignal(seed, items),
    source: result.source,
    cached: result.cached,
    itemCount: items.length,
    totalFavorites,
    topItemName: items[0]?.name ?? null,
    sampleItems: items.map((item) => ({
      id: item.id,
      name: item.name,
      favoriteCount: item.favoriteCount,
      url: item.url,
      thumbnailUrl: item.thumbnailUrl,
    })),
  };
}

function feedCacheKey(limit: number, maxKeywords: number): string {
  return `safe_v1_${limit}_${maxKeywords}`;
}

async function readCachedFeed(key: string): Promise<MemeTrendFeed | null> {
  try {
    const snap = await getFirestore().collection('robloxMemeTrendFeeds').doc(key).get();
    if (!snap.exists) return null;
    const data = snap.data() as { feed?: MemeTrendFeed; expiresAt?: number } | undefined;
    if (data?.feed?.signals?.length && typeof data.expiresAt === 'number' && data.expiresAt > Date.now()) {
      return { ...data.feed, cached: true };
    }
  } catch (err) {
    logger.warn('meme-trend-feed cache read failed', err);
  }
  return null;
}

async function writeCachedFeed(key: string, feed: MemeTrendFeed): Promise<void> {
  try {
    await getFirestore().collection('robloxMemeTrendFeeds').doc(key).set({
      feed,
      expiresAt: Date.now() + MEME_FEED_CACHE_TTL_MS,
    }, { merge: true });
  } catch (err) {
    logger.warn('meme-trend-feed cache write failed', err);
  }
}

export async function fetchMemeTrendFeed(opts: {
  limit?: number;
  maxKeywords?: number;
} = {}): Promise<MemeTrendFeed> {
  const limit = clamp(opts.limit ?? DEFAULT_LIMIT, 1, 20);
  const maxKeywords = clamp(opts.maxKeywords ?? DEFAULT_MAX_KEYWORDS, 1, MEME_TREND_SEEDS.length);
  const key = feedCacheKey(limit, maxKeywords);
  const cached = await readCachedFeed(key);
  if (cached) return cached;

  const seeds = MEME_TREND_SEEDS.slice(0, maxKeywords);
  const rows = await Promise.all(seeds.map(async (seed): Promise<MemeTrendSignal | null> => {
    try {
      const result = await fetchCatalogByKeyword({
        keyword: seed.keyword,
        category: 'Decals',
        limit: 4,
      });
      if (!result.items.length) return null;
      return toSignal(seed, result);
    } catch (err) {
      logger.warn('meme-trend-feed keyword failed', {
        keyword: seed.keyword,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }));

  const signals = rows
    .filter((row): row is MemeTrendSignal => row !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const sourceSet = new Set(signals.map((signal) => signal.source));
  const source: MemeTrendFeed['source'] = sourceSet.size > 1
    ? 'mixed'
    : sourceSet.has('apify') ? 'apify' : 'roblox';
  const feed: MemeTrendFeed = {
    source,
    cached: false,
    fetchedAt: Date.now(),
    signals,
  };
  if (signals.length > 0) {
    await writeCachedFeed(key, feed);
  }
  return feed;
}

export function formatMemeTrendFeedForPrompt(feed: MemeTrendFeed): string {
  if (!feed.signals.length) return '';
  const lines = feed.signals.slice(0, 6).map((signal, idx) => {
    const top = signal.topItemName ? `; sample: ${signal.topItemName}` : '';
    return `${idx + 1}. ${signal.keyword} (${signal.category}, score ${signal.score}, fav ${signal.totalFavorites}${top})`;
  });
  return [
    `[Roblox meme trend feed — keyword-level signals only, source=${feed.source}${feed.cached ? ', cache' : ''}]`,
    ...lines,
  ].join('\n');
}
