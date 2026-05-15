import { logger } from 'firebase-functions';
import type { GenerationKind, PromptContextMetadata } from './types.js';
import {
  fetchCatalogByKeyword,
  fetchTrendingCatalog,
  formatTrendsContextForPrompt,
  type CatalogCategory,
  type CatalogPeriod,
  type CatalogSort,
  type RobloxCatalogItem,
  type TrendingResult,
} from './robloxCatalog.js';
import { buildAnalyticsSummary, computeVelocity, formatAnalyticsForPrompt, formatVelocityForPrompt } from './robloxAnalytics.js';
import { fetchMemeTrendFeed, formatMemeTrendFeedForPrompt } from './robloxMemeTrends.js';

/** Structured item shape used by in-game `buildTrendingShowcaseLua` (Phase 0+A, session 219). */
export interface TrendingShowcaseItem {
  id: number;
  name: string;
  itemType: 'Asset' | 'Bundle';
  creatorName: string;
  price: number | null;
  favoriteCount: number;
  thumbnailUrl: string | null;
  url: string;
}

function toShowcaseItem(item: RobloxCatalogItem): TrendingShowcaseItem {
  return {
    id: item.id, name: item.name, itemType: item.itemType,
    creatorName: item.creatorName, price: item.price,
    favoriteCount: item.favoriteCount,
    thumbnailUrl: item.thumbnailUrl, url: item.url,
  };
}

/**
 * Phase A (session 225): extract a Roblox-catalog-friendly keyword from the
 * user's prompt + metadata. Used to make TrendingShowcase thematically tied
 * to the game (e.g. "сделай зомби-обби" → keyword "zombie", showcase wall
 * shows zombie-themed catalog items). Returns null if no clear keyword.
 *
 * Strategy: scan haystack against curated theme map (genre-aware). Keep it
 * conservative — false-positives cause off-theme showcases. We only return
 * a keyword when there's a strong signal.
 */
const KEYWORD_SIGNALS: Array<{ keyword: string; patterns: RegExp }> = [
  { keyword: 'zombie',     patterns: /\bzombie|зомби|undead|нежить/i },
  { keyword: 'ninja',      patterns: /\bninja|ниндзя|shinobi|шиноби/i },
  { keyword: 'pirate',     patterns: /\bpirate|пират|sailor|caribbean/i },
  { keyword: 'space',      patterns: /\bspace|космос|astronaut|астронавт|galaxy|галактик/i },
  { keyword: 'horror',     patterns: /\bhorror|хоррор|scary|страшн|спавн|хосп|ghost|призрак/i },
  { keyword: 'medieval',   patterns: /\bmedieval|средневеков|knight|рыцарь|castle|замок/i },
  { keyword: 'cyberpunk',  patterns: /\bcyber|киберп|neon|неон|futuristic|футурист/i },
  { keyword: 'anime',      patterns: /\banime|аниме|manga|манга|otaku/i },
  { keyword: 'skibidi',    patterns: /\bskibidi|скибиди/i },
  { keyword: 'tralalero',  patterns: /\btralalero|тралалеро|shark|акула/i },
  { keyword: 'bombardiro', patterns: /\bbombardiro|бомбардиро|crocodilo/i },
  { keyword: 'cappuccino', patterns: /\bcappuccino|капучино|assassino/i },
  { keyword: 'tung tung',  patterns: /\btung\s*tung|тунг\s*тунг|sahur/i },
  { keyword: 'sigma',      patterns: /\bsigma|сигма|alpha|альфа/i },
  { keyword: 'gym',        patterns: /\bgym|качал|fitness|muscle|мускул/i },
  { keyword: 'dragon',     patterns: /\bdragon|дракон|flame/i },
  { keyword: 'racing',     patterns: /\bracing|гонк|nascar|drift|дрифт/i },
  { keyword: 'pet',        patterns: /\bpet\b|питомец|dog|собак|cat\b|кот\b|кошк/i },
];

export function extractKeywordFromBrief(brief: string, metadata?: Record<string, unknown>): string | null {
  const haystackParts: string[] = [brief];
  if (metadata) {
    for (const k of ['contentSubcategory', 'genre', 'theme', 'title', 'style', 'memeSubTheme']) {
      const v = (metadata as Record<string, unknown>)[k];
      if (typeof v === 'string') haystackParts.push(v);
    }
  }
  const haystack = haystackParts.join(' ').slice(0, 1500);
  for (const signal of KEYWORD_SIGNALS) {
    if (signal.patterns.test(haystack)) return signal.keyword;
  }
  return null;
}

/**
 * Returns up to `limit` trending items as structured objects (NOT text).
 * Used by genre game-builders to weld `rbxthumb://` BillboardGui showcases.
 * Phase A (session 225): if `keyword` provided, prefer keyword-search over
 * trending; falls back to trending if keyword search empty.
 */
export async function fetchTrendingShowcaseItems(opts: {
  category?: CatalogCategory;
  limit?: number;
  /** Phase A: prompt-derived keyword (e.g. "zombie"). Empty/null → use trending. */
  keyword?: string | null;
} = {}): Promise<TrendingShowcaseItem[] | null> {
  const category = opts.category ?? 'Featured';
  const limit = opts.limit ?? 6;
  // Phase A: keyword path — try keyword first, fall back to trending if empty.
  if (opts.keyword && opts.keyword.trim().length > 0) {
    try {
      const kwResult = await fetchCatalogByKeyword({ keyword: opts.keyword, category, limit });
      if (kwResult.items.length > 0) {
        logger.info('[GenerationEnrichment] showcase keyword path', {
          keyword: opts.keyword, category, items: kwResult.items.length, source: kwResult.source,
        });
        return kwResult.items.map(toShowcaseItem);
      }
      logger.info('[GenerationEnrichment] keyword returned 0 items, falling back to trending', {
        keyword: opts.keyword, category,
      });
    } catch (err) {
      logger.warn('[GenerationEnrichment] keyword path failed, falling back to trending', {
        keyword: opts.keyword, category, error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  // Trending path (default + keyword-fallback).
  try {
    const result = await fetchTrendingCatalog({ category, sort: 'Sales', period: 'PastWeek', limit });
    if (!result.items.length) return null;
    return result.items.map(toShowcaseItem);
  } catch (err) {
    logger.warn('[GenerationEnrichment] fetchTrendingShowcaseItems failed', {
      category, error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

interface EnrichmentArgs {
  prompt: string;
  kind?: GenerationKind;
  metadata?: PromptContextMetadata | Record<string, unknown>;
}

interface TrendQuery {
  category: CatalogCategory;
  sort: CatalogSort;
  period: CatalogPeriod;
  limit: number;
  reason: string;
}

type TrendBlock = {
  query: TrendQuery;
  result: TrendingResult & { cached: boolean };
};

export interface GenerationEnrichment {
  context: string;
  sources: string[];
  itemCount: number;
}

const ENRICHMENT_TIMEOUT_MS = 6_000;
const GAME_SUBCATEGORIES = new Set([
  'brainrot_sim',
  'obby_troll',
  'obby',
  'tycoon',
  'simulator',
  'rpg',
  'horror',
  'pvp',
  'pvp_arena',
]);

const LIVE_CONTEXT_PATTERN = /\b(trend|trending|popular|viral|meme|brainrot|roblox\s+catalog|obby|tycoon|simulator|rpg|horror|pvp|weapon|item|icon|ui|shop)\b|тренд|популярн|вирусн|мем|икон|обби|тайкун|симулятор/i;
const ICON_CONTEXT_PATTERN = /\b(icon|icons|ui|hud|shop|inventory|decal|sticker|thumbnail|weapon|sword|gun|item|tool)\b|икон|интерфейс|магазин|инвентар|оруж|меч|пистолет|предмет/i;
const AVATAR_CONTEXT_PATTERN = /\b(npc|character|avatar|accessory|skin|pet|companion|boss|enemy)\b|нпс|персонаж|аватар|аксессуар|питомец|босс|враг/i;
const ANIMATION_CONTEXT_PATTERN = /\b(animation|emote|dance|idle|walk|run|pvp|combat)\b|анимац|эмоут|танец|ходьб|бег|бой/i;
// Phase F (session 228): monetization/gamepass-aware prompts get price-stats injection.
const MONETIZATION_CONTEXT_PATTERN = /\b(gamepass|game\s*pass|monetiz|robux|developer\s*product|in[- ]game\s*purchase|microtransaction|premium|vip|paywall|currency)\b|монетиз|робукс|роблукс|игропроп|игропасс|премиум|внутриигр/i;
const MEME_CONTEXT_PATTERN = /\b(meme|brainrot|viral|skibidi|sigma|rizz|ohio|tralalero|bombardiro|cappuccino|sahur|tung\s*tung)\b|мем|брейнрот|вирусн|скибиди|сигма|тралалеро|бомбардиро|капучино/i;

function metadataText(metadata?: PromptContextMetadata | Record<string, unknown>): string {
  if (!metadata) return '';
  return [
    metadata.contentCategory,
    metadata.contentSubcategory,
    metadata.genre,
    metadata.title,
    metadata.theme,
    metadata.style,
    metadata.projectKind,
  ].filter((value): value is string => typeof value === 'string').join(' ');
}

export function shouldUseLiveGenerationEnrichment(args: EnrichmentArgs): boolean {
  const metadata = args.metadata;
  if (metadata?.disableLiveGenerationEnrichment === true) return false;
  if (metadata?.useLiveGenerationEnrichment === true || metadata?.requestTrends === true) return true;

  const haystack = `${args.prompt} ${metadataText(metadata)}`;
  const subcategory = typeof metadata?.contentSubcategory === 'string'
    ? metadata.contentSubcategory.toLowerCase()
    : '';
  const contentCategory = typeof metadata?.contentCategory === 'string'
    ? metadata.contentCategory.toLowerCase()
    : '';

  if (args.kind === 'game_package' || args.kind === 'rbxl_build' || args.kind === 'rbxm_build') return true;
  if (GAME_SUBCATEGORIES.has(subcategory)) return true;
  // Phase C (session 219): NPC and Character generation ALWAYS gets live trends.
  // Phase D (session 219): decal_texture, animation, ugc_clothing/_accessory,
  // clothing — same treatment. Live data provides direct style/name inspiration.
  if (ALWAYS_ON_CONTENT_CATEGORIES.has(contentCategory)) return true;
  // Phase F (session 228): gamepass / monetization always get live trends so
  // we can inject realistic price-stats from the catalog.
  if (contentCategory === 'gamepass') return true;
  const intent = typeof metadata?.intent === 'string' ? metadata.intent : '';
  if (intent === 'monetization' || intent === 'monetization_interview' || intent === 'monetization_generation') return true;
  if (MONETIZATION_CONTEXT_PATTERN.test(haystack)) return true;
  if (['game_system', 'weapon', 'item_tool', 'ui'].includes(contentCategory)) {
    return LIVE_CONTEXT_PATTERN.test(haystack);
  }
  return LIVE_CONTEXT_PATTERN.test(haystack);
}

const ALWAYS_ON_CONTENT_CATEGORIES = new Set([
  'npc_ai', 'character',                                    // Phase C
  'decal_texture', 'animation',                              // Phase D
  'ugc_clothing', 'ugc_accessory', 'clothing',               // Phase D
]);

function isMonetizationContext(args: EnrichmentArgs, haystack: string, contentCategory: string): boolean {
  if (contentCategory === 'gamepass') return true;
  const intent = typeof args.metadata?.intent === 'string' ? args.metadata.intent : '';
  if (intent === 'monetization' || intent === 'monetization_interview' || intent === 'monetization_generation') return true;
  return MONETIZATION_CONTEXT_PATTERN.test(haystack);
}

function isMemeContext(args: EnrichmentArgs, haystack: string, contentCategory: string): boolean {
  const subcategory = typeof args.metadata?.contentSubcategory === 'string'
    ? args.metadata.contentSubcategory.toLowerCase()
    : '';
  if (subcategory === 'brainrot_sim' || subcategory === 'obby_troll') return true;
  if (contentCategory === 'decal_texture' || contentCategory === 'npc_ai' || contentCategory === 'character') {
    return MEME_CONTEXT_PATTERN.test(haystack);
  }
  return MEME_CONTEXT_PATTERN.test(haystack);
}

function velocityQueryFor(query: TrendQuery): TrendQuery {
  return {
    ...query,
    limit: query.limit <= 6 ? 6 : 10,
  };
}

function resolveTrendQueries(args: EnrichmentArgs): TrendQuery[] {
  const haystack = `${args.prompt} ${metadataText(args.metadata)}`;
  const contentCategory = typeof args.metadata?.contentCategory === 'string'
    ? args.metadata.contentCategory.toLowerCase()
    : '';
  const queries: TrendQuery[] = [
    {
      category: 'Featured',
      sort: 'Sales',
      period: 'PastWeek',
      limit: 8,
      reason: 'current Roblox audience taste',
    },
  ];

  // Phase F (session 228): monetization/gamepass — pull Collectibles top-sales
  // for realistic price-stats (median R$, p25/p75, free%). Wins over default
  // path because Collectibles paid-rate is higher than Featured.
  if (isMonetizationContext(args, haystack, contentCategory)) {
    queries.push({
      category: 'Collectibles',
      sort: 'Sales',
      period: 'PastWeek',
      limit: 12,
      reason: 'price-stats benchmark for gamepass / monetization design',
    });
  }

  // Phase C (session 219): NPC/Character always get Collectibles + Animations
  // — outfit silhouettes for visual design, emote/dance names for dialog refs.
  if (contentCategory === 'npc_ai' || contentCategory === 'character') {
    queries.push({
      category: 'Collectibles',
      sort: 'Sales',
      period: 'PastWeek',
      limit: 6,
      reason: 'avatar/accessory silhouettes and naming cues for NPC/character outfits',
    });
    queries.push({
      category: 'Animations',
      sort: 'Sales',
      period: 'PastWeek',
      limit: 5,
      reason: 'trending emote names for NPC dialog and runtime emote pool',
    });
  }
  // Phase D (session 219): per-content-category specialized queries.
  else if (contentCategory === 'decal_texture') {
    queries.push({
      category: 'Decals',
      sort: 'MostFavorited',
      period: 'PastWeek',
      limit: 6,
      reason: 'top-favorited decal/sticker visual motifs as inspiration',
    });
  } else if (contentCategory === 'animation') {
    queries.push({
      category: 'Animations',
      sort: 'Sales',
      period: 'PastWeek',
      limit: 6,
      reason: 'top-selling emote/animation names as movement style inspiration',
    });
  } else if (contentCategory === 'ugc_clothing' || contentCategory === 'ugc_accessory' || contentCategory === 'clothing') {
    queries.push({
      category: 'Collectibles',
      sort: 'Sales',
      period: 'PastWeek',
      limit: 6,
      reason: 'top-selling outfit/accessory styles as design inspiration',
    });
  } else if (ICON_CONTEXT_PATTERN.test(haystack)) {
    queries.push({
      category: 'Decals',
      sort: 'RecentlyCreated',
      period: 'PastWeek',
      limit: 6,
      reason: 'fresh icon/decal visual motifs',
    });
  } else if (AVATAR_CONTEXT_PATTERN.test(haystack)) {
    queries.push({
      category: 'Collectibles',
      sort: 'Sales',
      period: 'PastWeek',
      limit: 6,
      reason: 'avatar/accessory silhouettes and naming cues',
    });
  } else if (ANIMATION_CONTEXT_PATTERN.test(haystack)) {
    queries.push({
      category: 'Animations',
      sort: 'Sales',
      period: 'PastWeek',
      limit: 6,
      reason: 'movement/emote trends',
    });
  }

  // Phase C (session 219): NPC/Character merit 3 queries (Featured + Collectibles
  // + Animations); other paths still capped at 2 to avoid prompt bloat.
  // Phase F (session 228): monetization/gamepass also gets 3 (Featured + Collectibles
  // + the contextual one) so analytics has 2 distinct sample populations.
  const isMonetization = isMonetizationContext(args, haystack, contentCategory);
  const cap = (contentCategory === 'npc_ai' || contentCategory === 'character' || isMonetization) ? 3 : 2;
  return queries.slice(0, cap);
}

async function fetchTrendBlock(query: TrendQuery): Promise<TrendBlock | null> {
  try {
    const result = await fetchTrendingCatalog(query);
    if (!result.items.length) return null;
    return { query, result };
  } catch (err) {
    logger.warn('[GenerationEnrichment] trend query failed', {
      category: query.category,
      sort: query.sort,
      period: query.period,
      reason: query.reason,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export async function buildLiveGenerationEnrichmentContext(args: EnrichmentArgs): Promise<GenerationEnrichment | null> {
  if (!shouldUseLiveGenerationEnrichment(args)) return null;

  const queries = resolveTrendQueries(args);
  const work = Promise.all(queries.map(fetchTrendBlock));
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), ENRICHMENT_TIMEOUT_MS));
  const blocks = await Promise.race([work, timeout]);
  if (!blocks) {
    logger.warn('[GenerationEnrichment] timed out; continuing without live context', {
      kind: args.kind,
      contentCategory: args.metadata?.contentCategory,
      contentSubcategory: args.metadata?.contentSubcategory,
    });
    return null;
  }

  const usable = blocks.filter((block): block is TrendBlock => block !== null);
  if (!usable.length) return null;

  const sections = usable.map(({ query, result }) => {
    const header = `Use-case: ${query.reason}. Cache: ${result.cached ? 'hit/stale-ok' : 'fresh'}.`;
    return `${header}\n${formatTrendsContextForPrompt(result, query)}`;
  });
  const sources = usable.map(({ query, result }) =>
    `${query.category}/${query.sort}/${query.period}:${result.source}${result.cached ? ':cache' : ':fresh'}`);
  const itemCount = usable.reduce((sum, block) => sum + block.result.items.length, 0);

  // Phase C (session 219): for NPC/Character generation, add a specific
  // usage-guidance line that lets the LLM naturally reference trends in
  // NPC speech bubbles ("Heard about the X bundle?") and outfit briefs,
  // while still treating asset names as inspiration only.
  const contentCategory = typeof args.metadata?.contentCategory === 'string'
    ? args.metadata.contentCategory.toLowerCase()
    : '';
  const isNpcOrCharacter = contentCategory === 'npc_ai' || contentCategory === 'character';
  const npcGuidance = isNpcOrCharacter
    ? 'NPC/Character usage: it is OK to reference 1-2 catalog item or emote names naturally in speech bubbles and outfit briefs (e.g. "saw someone do the Salute yesterday"). Never insert numeric asset IDs into dialog. Never promise the player an asset they will not actually receive.'
    : null;

  // Phase F (session 228): analytics block (price-stats, top creators, item-mix).
  // Always computed but only injected when monetization-relevant — for other
  // kinds the per-item formatTrendsContextForPrompt block is enough and price-
  // stats would be prompt-bloat.
  const haystack = `${args.prompt} ${metadataText(args.metadata)}`;
  const isMonetization = isMonetizationContext(args, haystack, contentCategory);
  const monetizationGuidance = isMonetization
    ? 'Monetization usage: when proposing gamepass/developer-product prices, anchor on the median and p25/p75 from the analytics block below. Stay in that band unless the design has a clear premium/budget reason. Bundles trend higher; single accessories lower.'
    : null;
  const analyticsLines: string[] = [];
  if (isMonetization) {
    for (const { query, result } of usable) {
      try {
        const summary = buildAnalyticsSummary(result, query);
        analyticsLines.push(formatAnalyticsForPrompt(summary));
      } catch (err) {
        logger.warn('[GenerationEnrichment] analytics summary failed', {
          category: query.category, sort: query.sort, period: query.period,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  const velocityWork = Promise.all(usable.slice(0, 3).map(async ({ query }) => {
    const velocityQuery = velocityQueryFor(query);
    const velocity = await computeVelocity(velocityQuery);
    return formatVelocityForPrompt(velocity, velocityQuery);
  }));
  const velocityLines = (await Promise.race([
    velocityWork,
    new Promise<string[]>((resolve) => setTimeout(() => resolve([]), 1200)),
  ])).filter(Boolean);
  if (velocityLines.length > 0) {
    sources.push('velocity:snapshots');
  }

  const memeFeedLine = isMemeContext(args, haystack, contentCategory)
    ? await Promise.race([
      fetchMemeTrendFeed({ limit: 6, maxKeywords: 8 }).then((feed) => {
        const formatted = formatMemeTrendFeedForPrompt(feed);
        if (formatted) sources.push(`meme-feed:${feed.source}${feed.cached ? ':cache' : ':fresh'}`);
        return formatted;
      }).catch((err) => {
        logger.warn('[GenerationEnrichment] meme trend feed failed', {
          error: err instanceof Error ? err.message : String(err),
        });
        return '';
      }),
      new Promise<string>((resolve) => setTimeout(() => resolve(''), 3000)),
    ])
    : '';

  const context = [
    'Live generation enrichment from public trend data. Use it to improve variety, mechanics, visual motifs, rarity language, shop/UI names, and meme freshness.',
    'Safety rules: user prompt and GDD are primary; do not copy protected brands/franchise characters; do not promise or insert external/private asset IDs; treat catalog item names as inspiration unless generic.',
    ...(npcGuidance ? [npcGuidance] : []),
    ...(monetizationGuidance ? [monetizationGuidance] : []),
    ...sections,
    ...analyticsLines,
    ...velocityLines,
    ...(memeFeedLine ? [memeFeedLine] : []),
  ].join('\n\n').slice(0, 5200);

  return { context, sources, itemCount };
}
