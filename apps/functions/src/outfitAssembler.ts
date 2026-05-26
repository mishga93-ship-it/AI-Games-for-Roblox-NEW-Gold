// outfitAssembler.ts — Phase 3 1-Click Outfit Generator (session 383).
//
// Hybrid pipeline:
//   1. Start with the aesthetic's curatedCore[] (hand-verified items).
//   2. For each unfilled slot, search Roblox catalog by aesthetic keywords.
//   3. Blacklist + dedup the candidate pool.
//   4. Anthropic ranks candidates per slot, picks the best 1.
//   5. Compute total cost, attach caption, return cohesive outfit.
//
// NOT generating any new assets. NOT touching flux/sharp/img2img. Strictly
// a catalog-curator + LLM ranker.

import { logger } from 'firebase-functions/v2';
import { fetchCatalogByKeyword, type RobloxCatalogItem } from './robloxCatalog.js';
import { runChatProvider } from './providers.js';
import {
  getOutfitAesthetic,
  OUTFIT_SLOT_ORDER,
  type CuratedItem,
  type OutfitAesthetic,
  type OutfitAestheticId,
  type OutfitGender,
  type OutfitRemixMode,
  type OutfitSlot,
  type OutfitStyleMode,
} from './data/outfitAesthetics.js';

// ─── Public types ────────────────────────────────────────────────

export interface OutfitItem {
  assetId: string;
  name: string;
  slot: OutfitSlot;
  priceRobux: number;
  thumbnailUrl: string | null;
  catalogUrl: string;
  creatorName?: string;
  favoriteCount?: number;
  isCurated: boolean;       // came from curatedCore vs live search
}

export interface OutfitAssembleResult {
  aestheticId: OutfitAestheticId;
  title: string;
  pitchEN: string;
  pitchRU: string;
  appStoreHook: string;
  captionEN: string;
  captionRU: string;
  styleTagsEN: string[];
  items: OutfitItem[];                  // ordered by OUTFIT_SLOT_ORDER
  totalCostRobux: number;
  savedRobux: number;
  rerollSeed: string;                   // pass back to /generate to get a different selection
}

export interface OutfitAssembleInput {
  aestheticId: OutfitAestheticId;
  gender: OutfitGender;
  style: OutfitStyleMode;
  remix?: OutfitRemixMode;              // pushes selection toward variant
  /** Optional seed to deterministically vary live-search picks. */
  seed?: string;
}

// ─── Blacklist & filters ─────────────────────────────────────────

/** Banned keywords in item names (NSFW / spam / known broken). */
const NAME_BLACKLIST_PATTERNS: RegExp[] = [
  /\b(nsfw|18\+|porn|xxx|sex)\b/i,
  /\b(scam|free\s*robux|generator)\b/i,
  /^test\b/i,
  /^untitled\b/i,
];

/** Reject items priced above this (in Robux) — outfits are budget-friendly. */
const MAX_ITEM_PRICE_ROBUX = 500;

function isItemAllowed(item: RobloxCatalogItem): boolean {
  if (!item.name?.trim()) return false;
  if (item.price != null && item.price > MAX_ITEM_PRICE_ROBUX) return false;
  for (const re of NAME_BLACKLIST_PATTERNS) {
    if (re.test(item.name)) return false;
  }
  return true;
}

// ─── Live catalog search per slot ────────────────────────────────

async function searchSlotCandidates(args: {
  aesthetic: OutfitAesthetic;
  slot: OutfitSlot;
  gender: OutfitGender;
  style: OutfitStyleMode;
  remix?: OutfitRemixMode;
}): Promise<RobloxCatalogItem[]> {
  const keywords = args.aesthetic.liveKeywords[args.slot] ?? [];
  if (keywords.length === 0) return [];
  const styleHint = args.style === 'colorful' ? '' : ' dark';
  const genderHint = args.gender === 'girls' ? ' girl'
    : args.gender === 'boys' ? ' boy'
    : '';
  const remixHint = args.remix === 'more_cursed' ? ' dark'
    : args.remix === 'more_clean' ? ' clean'
    : '';

  const pool: RobloxCatalogItem[] = [];
  const seenIds = new Set<number>();
  for (const kw of keywords) {
    const q = `${kw}${styleHint}${genderHint}${remixHint}`.trim().toLowerCase();
    try {
      const result = await fetchCatalogByKeyword({ keyword: q, limit: 10 });
      for (const item of result.items) {
        if (seenIds.has(item.id)) continue;
        if (!isItemAllowed(item)) continue;
        seenIds.add(item.id);
        pool.push(item);
      }
    } catch (err) {
      logger.warn('[outfitAssembler] catalog search failed', { slot: args.slot, kw, err });
    }
    if (pool.length >= 8) break;       // enough candidates
  }
  return pool;
}

// ─── Curated-item → OutfitItem ────────────────────────────────────

function curatedToOutfitItem(c: CuratedItem): OutfitItem {
  return {
    assetId: c.assetId,
    name: c.name,
    slot: c.slot,
    priceRobux: c.approxRobux,
    thumbnailUrl: null,
    catalogUrl: `https://www.roblox.com/catalog/${c.assetId}`,
    isCurated: true,
  };
}

function liveToOutfitItem(item: RobloxCatalogItem, slot: OutfitSlot): OutfitItem {
  return {
    assetId: String(item.id),
    name: item.name,
    slot,
    priceRobux: item.price ?? 0,
    thumbnailUrl: item.thumbnailUrl,
    catalogUrl: item.url || `https://www.roblox.com/catalog/${item.id}`,
    creatorName: item.creatorName,
    favoriteCount: item.favoriteCount,
    isCurated: false,
  };
}

// ─── AI-ranking via Anthropic (lightweight one-shot call) ───────

/**
 * Ask the LLM to pick the best item per slot from the candidate pools.
 * Falls back to favoriteCount-sorted top pick if the LLM call fails.
 */
async function aiRankSelections(args: {
  aesthetic: OutfitAesthetic;
  gender: OutfitGender;
  style: OutfitStyleMode;
  remix?: OutfitRemixMode;
  pools: Record<OutfitSlot, RobloxCatalogItem[]>;
}): Promise<Partial<Record<OutfitSlot, string>>> {
  const slotsToRank = (Object.keys(args.pools) as OutfitSlot[]).filter((s) => args.pools[s].length > 0);
  if (slotsToRank.length === 0) return {};

  // Compact LLM payload — just id+name+price+favs, no full URLs.
  const summary: Record<string, Array<{ id: number; name: string; price: number | null; favs: number }>> = {};
  for (const slot of slotsToRank) {
    summary[slot] = args.pools[slot].slice(0, 6).map((it) => ({
      id: it.id,
      name: it.name.slice(0, 80),
      price: it.price,
      favs: it.favoriteCount,
    }));
  }

  const remixSuffix = args.remix === 'more_cursed' ? ' Push the look DARKER and more dramatic.'
    : args.remix === 'more_clean' ? ' Push the look CLEANER and more minimalist.'
    : args.remix === 'budget' ? ' Strictly prioritize the cheapest item per slot (price ASC).'
    : '';
  const prompt = [
    `You are a Roblox outfit stylist. Pick exactly ONE asset id per slot for the "${args.aesthetic.title}" aesthetic.`,
    `Gender: ${args.gender}. Style: ${args.style}.${remixSuffix}`,
    `Aesthetic vibe: ${args.aesthetic.pitchEN}`,
    `Rules:`,
    `1) Output JSON ONLY: {"slot": numericAssetId, ...} — no markdown, no comments.`,
    `2) Use ONLY ids from the provided candidate pools. Do NOT invent ids.`,
    `3) Prefer items with high favs and on-aesthetic name. Skip clearly off-vibe items.`,
    `Candidate pools:`,
    JSON.stringify(summary),
  ].join('\n');

  try {
    const result = await runChatProvider('anthropic', prompt, undefined, { timeoutMs: 15_000 });
    const text = (result.text ?? '').trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in LLM response');
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, number | string>;
    const out: Partial<Record<OutfitSlot, string>> = {};
    for (const [slot, id] of Object.entries(parsed)) {
      if (!(OUTFIT_SLOT_ORDER as string[]).includes(slot)) continue;
      const candidatePool = args.pools[slot as OutfitSlot] ?? [];
      if (!candidatePool.some((c) => c.id === Number(id))) continue;  // ai hallucinated
      out[slot as OutfitSlot] = String(id);
    }
    return out;
  } catch (err) {
    logger.warn('[outfitAssembler] AI rank failed; using favoriteCount fallback', { err: err instanceof Error ? err.message : String(err) });
    // Fallback: sort each pool by favoriteCount desc, take #0.
    const out: Partial<Record<OutfitSlot, string>> = {};
    for (const slot of slotsToRank) {
      const sorted = [...args.pools[slot]].sort((a, b) => (b.favoriteCount ?? 0) - (a.favoriteCount ?? 0));
      if (sorted[0]) out[slot] = String(sorted[0].id);
    }
    return out;
  }
}

// ─── Caption via AI ───────────────────────────────────────────────

async function pickCaption(aesthetic: OutfitAesthetic, remix?: OutfitRemixMode): Promise<{ en: string; ru: string }> {
  // For now just pick from seeded list with optional remix-tuned variation.
  const seedsEN = aesthetic.captionSeedsEN;
  const seedsRU = aesthetic.captionSeedsRU;
  const idx = Math.floor(Math.random() * seedsEN.length);
  let en = seedsEN[idx] ?? `${aesthetic.title} unlocked`;
  let ru = seedsRU[idx] ?? `${aesthetic.title} активирован`;
  if (remix === 'more_cursed') { en = `${en} 🖤`; ru = `${ru} 🖤`; }
  if (remix === 'more_clean')  { en = `${en} ✨`; ru = `${ru} ✨`; }
  if (remix === 'budget')      { en = `${en} (budget)`; ru = `${ru} (бюджетно)`; }
  return { en, ru };
}

// ─── Public entry ────────────────────────────────────────────────

export async function assembleOutfit(input: OutfitAssembleInput): Promise<OutfitAssembleResult> {
  const aesthetic = getOutfitAesthetic(input.aestheticId);

  // Track which slots are already filled by curated items.
  const filledSlots = new Set<OutfitSlot>();
  const items: OutfitItem[] = [];
  for (const c of aesthetic.curatedCore) {
    items.push(curatedToOutfitItem(c));
    filledSlots.add(c.slot);
  }

  // Determine slots we still need to search for.
  const slotsToSearch = OUTFIT_SLOT_ORDER.filter((s) => !filledSlots.has(s) && aesthetic.liveKeywords[s]);

  // Parallel catalog search per slot.
  const pools: Record<OutfitSlot, RobloxCatalogItem[]> = {} as Record<OutfitSlot, RobloxCatalogItem[]>;
  await Promise.all(slotsToSearch.map(async (slot) => {
    pools[slot] = await searchSlotCandidates({
      aesthetic, slot,
      gender: input.gender,
      style: input.style,
      remix: input.remix,
    });
  }));

  // AI ranks one winner per slot (with fallback to most-favorited).
  const picks = await aiRankSelections({
    aesthetic,
    gender: input.gender,
    style: input.style,
    remix: input.remix,
    pools,
  });

  for (const slot of slotsToSearch) {
    const winnerId = picks[slot];
    if (!winnerId) continue;
    const winner = pools[slot]?.find((it) => String(it.id) === winnerId);
    if (winner) items.push(liveToOutfitItem(winner, slot));
  }

  // Re-order by canonical slot order.
  items.sort((a, b) => OUTFIT_SLOT_ORDER.indexOf(a.slot) - OUTFIT_SLOT_ORDER.indexOf(b.slot));

  const totalCostRobux = items.reduce((acc, it) => acc + (it.priceRobux ?? 0), 0);
  const savedRobux = Math.max(0, aesthetic.imitatedRetailRobux - totalCostRobux);

  const caption = await pickCaption(aesthetic, input.remix);

  return {
    aestheticId: aesthetic.id,
    title: aesthetic.title,
    pitchEN: aesthetic.pitchEN,
    pitchRU: aesthetic.pitchRU,
    appStoreHook: aesthetic.appStoreHook,
    captionEN: caption.en,
    captionRU: caption.ru,
    styleTagsEN: [
      aesthetic.title,
      input.gender,
      input.style,
      ...(input.remix ? [input.remix] : []),
    ],
    items,
    totalCostRobux,
    savedRobux,
    rerollSeed: input.seed ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  };
}
