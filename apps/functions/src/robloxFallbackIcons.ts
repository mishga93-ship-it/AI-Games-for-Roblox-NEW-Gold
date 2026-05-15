import {
  fetchCatalogByKeyword,
  type CatalogCategory,
  type RobloxCatalogItem,
} from './robloxCatalog.js';

export type FallbackIconType =
  | 'weapon'
  | 'sword'
  | 'gun'
  | 'tool'
  | 'pet'
  | 'coin'
  | 'gem'
  | 'potion'
  | 'food'
  | 'vehicle'
  | 'shop'
  | 'inventory'
  | 'badge'
  | 'ui'
  | 'decal'
  | 'npc'
  | 'avatar'
  | 'animation'
  | 'brainrot';

export interface FallbackIcon {
  type: FallbackIconType;
  id: number;
  assetId: number;
  name: string;
  icon: string;
  robloxAssetUri: string;
  thumbnailUri: string;
  thumbnailUrl: string | null;
  url: string;
  itemType: 'Asset' | 'Bundle';
  creatorName: string;
  price: number | null;
  favoriteCount: number;
  tags: string[];
}

export interface FallbackIconPack {
  type: FallbackIconType;
  keyword: string;
  category: CatalogCategory;
  source: 'roblox' | 'apify';
  cached: boolean;
  fetchedAt: number;
  items: FallbackIcon[];
}

interface IconConfig {
  category: CatalogCategory;
  keywords: string[];
  tags: string[];
}

export const FALLBACK_ICON_TYPES: readonly FallbackIconType[] = [
  'weapon',
  'sword',
  'gun',
  'tool',
  'pet',
  'coin',
  'gem',
  'potion',
  'food',
  'vehicle',
  'shop',
  'inventory',
  'badge',
  'ui',
  'decal',
  'npc',
  'avatar',
  'animation',
  'brainrot',
];

export const DEFAULT_FALLBACK_ICON_TYPES: readonly FallbackIconType[] = [
  'weapon',
  'sword',
  'pet',
  'coin',
  'gem',
  'potion',
  'shop',
  'inventory',
  'badge',
  'ui',
  'npc',
  'animation',
  'brainrot',
];

const ICON_CONFIG: Record<FallbackIconType, IconConfig> = {
  weapon: {
    category: 'Collectibles',
    keywords: ['sword', 'weapon'],
    tags: ['weapon', 'combat', 'item'],
  },
  sword: {
    category: 'Collectibles',
    keywords: ['sword', 'blade'],
    tags: ['weapon', 'melee', 'sword'],
  },
  gun: {
    category: 'Collectibles',
    keywords: ['blaster', 'laser gun'],
    tags: ['weapon', 'ranged', 'gun'],
  },
  tool: {
    category: 'Collectibles',
    keywords: ['tool', 'hammer'],
    tags: ['tool', 'item', 'utility'],
  },
  pet: {
    category: 'Featured',
    keywords: ['pet', 'dog'],
    tags: ['pet', 'companion', 'simulator'],
  },
  coin: {
    category: 'Decals',
    keywords: ['coin', '8-bit coin'],
    tags: ['currency', 'coin', 'ui'],
  },
  gem: {
    category: 'Decals',
    keywords: ['gem', 'crystal'],
    tags: ['currency', 'gem', 'ui'],
  },
  potion: {
    category: 'Decals',
    keywords: ['potion', 'magic potion'],
    tags: ['consumable', 'potion', 'ui'],
  },
  food: {
    category: 'Decals',
    keywords: ['burger', 'food'],
    tags: ['food', 'consumable', 'ui'],
  },
  vehicle: {
    category: 'Featured',
    keywords: ['car', 'vehicle'],
    tags: ['vehicle', 'racing', 'item'],
  },
  shop: {
    category: 'Decals',
    keywords: ['shop', 'store'],
    tags: ['shop', 'ui', 'store'],
  },
  inventory: {
    category: 'Decals',
    keywords: ['backpack', 'inventory'],
    tags: ['inventory', 'ui', 'backpack'],
  },
  badge: {
    category: 'Decals',
    keywords: ['badge', 'achievement'],
    tags: ['badge', 'achievement', 'ui'],
  },
  ui: {
    category: 'Decals',
    keywords: ['button', 'menu'],
    tags: ['ui', 'icon', 'interface'],
  },
  decal: {
    category: 'Decals',
    keywords: ['sticker', 'decal'],
    tags: ['decal', 'sticker', 'icon'],
  },
  npc: {
    category: 'Collectibles',
    keywords: ['npc', 'character'],
    tags: ['npc', 'character', 'avatar'],
  },
  avatar: {
    category: 'Collectibles',
    keywords: ['avatar', 'character'],
    tags: ['avatar', 'character', 'outfit'],
  },
  animation: {
    category: 'Animations',
    keywords: ['emote', 'dance'],
    tags: ['animation', 'emote', 'movement'],
  },
  brainrot: {
    category: 'Decals',
    keywords: ['italian brainrot', 'skibidi'],
    tags: ['brainrot', 'meme', 'viral'],
  },
};

const TYPE_ALIASES: Record<string, FallbackIconType> = {
  weapons: 'weapon',
  weapon: 'weapon',
  item_weapon: 'weapon',
  oruzhie: 'weapon',
  'оружие': 'weapon',
  swords: 'sword',
  sword: 'sword',
  mech: 'sword',
  'меч': 'sword',
  guns: 'gun',
  gun: 'gun',
  blaster: 'gun',
  pistolet: 'gun',
  'пистолет': 'gun',
  tools: 'tool',
  tool: 'tool',
  instrument: 'tool',
  'инструмент': 'tool',
  pets: 'pet',
  pet: 'pet',
  pitomec: 'pet',
  'питомец': 'pet',
  coins: 'coin',
  coin: 'coin',
  money: 'coin',
  'монета': 'coin',
  gems: 'gem',
  gem: 'gem',
  crystal: 'gem',
  'кристалл': 'gem',
  potions: 'potion',
  potion: 'potion',
  'зелье': 'potion',
  food: 'food',
  eat: 'food',
  'еда': 'food',
  cars: 'vehicle',
  car: 'vehicle',
  vehicle: 'vehicle',
  racing: 'vehicle',
  'машина': 'vehicle',
  shop: 'shop',
  store: 'shop',
  market: 'shop',
  'магазин': 'shop',
  inventory: 'inventory',
  backpack: 'inventory',
  'инвентарь': 'inventory',
  badges: 'badge',
  badge: 'badge',
  achievement: 'badge',
  'значок': 'badge',
  ui: 'ui',
  hud: 'ui',
  icons: 'ui',
  icon: 'ui',
  'иконка': 'ui',
  decals: 'decal',
  decal: 'decal',
  sticker: 'decal',
  'стикер': 'decal',
  npcs: 'npc',
  npc: 'npc',
  'нпс': 'npc',
  avatar: 'avatar',
  character: 'avatar',
  'персонаж': 'avatar',
  animations: 'animation',
  animation: 'animation',
  emote: 'animation',
  dance: 'animation',
  'анимация': 'animation',
  brainrot: 'brainrot',
  meme: 'brainrot',
  skibidi: 'brainrot',
  'мем': 'brainrot',
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function sanitizeKeyword(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').slice(0, 60);
}

export function normalizeFallbackIconType(raw: unknown): FallbackIconType | null {
  if (typeof raw !== 'string') return null;
  const key = raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
  const alias = TYPE_ALIASES[key];
  if (alias) return alias;
  return (FALLBACK_ICON_TYPES as readonly string[]).includes(key) ? (key as FallbackIconType) : null;
}

export function parseFallbackIconTypes(raw: unknown, fallback: readonly FallbackIconType[] = DEFAULT_FALLBACK_ICON_TYPES): FallbackIconType[] {
  if (typeof raw !== 'string' || !raw.trim() || raw.trim().toLowerCase() === 'all') {
    return [...fallback];
  }
  const out: FallbackIconType[] = [];
  for (const part of raw.split(',')) {
    const type = normalizeFallbackIconType(part);
    if (type && !out.includes(type)) out.push(type);
  }
  return out.length ? out : [...fallback];
}

function thumbnailUri(item: RobloxCatalogItem): string {
  const thumbType = item.itemType === 'Bundle' ? 'BundleThumbnail' : 'Asset';
  return `rbxthumb://type=${thumbType}&id=${item.id}&w=420&h=420`;
}

function toFallbackIcon(item: RobloxCatalogItem, type: FallbackIconType, tags: string[]): FallbackIcon {
  const thumb = thumbnailUri(item);
  return {
    type,
    id: item.id,
    assetId: item.id,
    name: item.name,
    icon: thumb,
    robloxAssetUri: `rbxassetid://${item.id}`,
    thumbnailUri: thumb,
    thumbnailUrl: item.thumbnailUrl,
    url: item.url,
    itemType: item.itemType,
    creatorName: item.creatorName,
    price: item.price,
    favoriteCount: item.favoriteCount,
    tags,
  };
}

export async function fetchFallbackIconPack(opts: {
  type: FallbackIconType;
  keyword?: string | null;
  limit?: number;
}): Promise<FallbackIconPack> {
  const type = opts.type;
  const config = ICON_CONFIG[type];
  const limit = clamp(opts.limit ?? 8, 1, 20);
  const keywords = opts.keyword && sanitizeKeyword(opts.keyword)
    ? [sanitizeKeyword(opts.keyword)]
    : config.keywords.slice(0, 2);

  const deduped = new Map<number, FallbackIcon>();
  let source: 'roblox' | 'apify' = 'roblox';
  let cached = false;
  let fetchedAt = Date.now();
  let usedKeyword = keywords[0] ?? type;

  for (const keyword of keywords) {
    const result = await fetchCatalogByKeyword({
      keyword,
      category: config.category,
      limit,
    });
    usedKeyword = keyword;
    source = result.source === 'apify' ? 'apify' : source;
    cached = cached || result.cached;
    fetchedAt = result.fetchedAt;
    for (const item of result.items) {
      if (!deduped.has(item.id)) {
        deduped.set(item.id, toFallbackIcon(item, type, config.tags));
      }
      if (deduped.size >= limit) break;
    }
    if (deduped.size >= limit) break;
  }

  return {
    type,
    keyword: usedKeyword,
    category: config.category,
    source,
    cached,
    fetchedAt,
    items: [...deduped.values()].slice(0, limit),
  };
}

export async function fetchFallbackIconPacks(opts: {
  types?: FallbackIconType[];
  keyword?: string | null;
  limitPerType?: number;
  maxTypes?: number;
} = {}): Promise<FallbackIconPack[]> {
  const fallbackTypes = opts.types?.length ? opts.types : [...DEFAULT_FALLBACK_ICON_TYPES];
  const types = fallbackTypes.slice(0, clamp(opts.maxTypes ?? 12, 1, 20));
  const limit = clamp(opts.limitPerType ?? 6, 1, 20);
  const packs = await Promise.all(types.map((type) => fetchFallbackIconPack({
    type,
    keyword: opts.keyword,
    limit,
  })));
  return packs;
}
