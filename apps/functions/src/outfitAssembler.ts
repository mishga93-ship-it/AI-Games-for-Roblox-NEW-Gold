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
import { createRequire } from 'node:module';
import { fetchCatalogByKeyword, type RobloxCatalogItem } from './robloxCatalog.js';
import { runChatProvider, generatePreviewTexture } from './providers.js';
// Session 390 round 16 — optional 3D mesh of the outfit avatar, via the
// shared bake helper (Meshy v6 → Blender re-export → hosted GLB). iOS
// renders it with WebGLBViewer (<model-viewer>), same as Cursed UGC.
import { renderOutfit3D, type RobloxOutfit3DUrls } from './robloxAvatar3D.js';

// Static catalog pool — pre-fetched on dev machine via scripts/prefetch-outfit-pool.mjs.
// Roblox catalog API is blocked from Cloud Run egress; this JSON is the source
// of truth at runtime. Refresh weekly by re-running the prefetch script.
const require = createRequire(import.meta.url);
const STATIC_POOL: Record<string, Record<string, RobloxCatalogItem[]>> = require('./data/outfitCatalogPool.json');
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
  /** AI-rendered preview of an avatar wearing this outfit (~3-5s, optional). */
  heroPreviewUrl?: string;
  /** Session 411 — REAL Roblox-composited 3D avatar wearing the EXACT picked
   *  catalog items (POST /v1/avatar/render → OBJ+MTL+textures, ~15-20s). This
   *  is the definitive 3D: it matches the item list 1:1 (no AI guesswork).
   *  Only rendered when input.renderAvatar3D is set. nil on render failure or
   *  missing ROBLOX_SERVICE_COOKIE → client falls back to heroPreviewUrl. */
  render3d?: RobloxOutfit3DUrls;
  /** Deprecated (session 411): Meshy text-to-3D GLB no longer produced — it
   *  invented its own avatar that didn't match the items. Field kept for wire
   *  compatibility; always undefined now. iOS prefers render3d. */
  meshUrl?: string;
  /** Deprecated (session 411) — always undefined now. */
  meshThumbnailUrl?: string;
}

export interface OutfitAssembleInput {
  aestheticId: OutfitAestheticId;
  gender: OutfitGender;
  style: OutfitStyleMode;
  remix?: OutfitRemixMode;              // pushes selection toward variant
  /** Optional seed to deterministically vary live-search picks. */
  seed?: string;
  /** Carried for analytics/back-compat; no longer gates 3D (session 411). */
  firebaseUid?: string;
  /** Session 411 — when true, render the REAL Roblox-composited 3D avatar
   *  (renderOutfit3D) wearing the picked items. Set by /api/outfit/generate
   *  and the chat-flow; left false by fittingRoomRenderer (which runs its own
   *  renderOutfit3D / renderOutfitOnUser3D, so it must NOT double-render). */
  renderAvatar3D?: boolean;
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

// ─── Classic-clothing slot guard (session 394) ───────────────────
//
// The Fitting Room mannequin renders a garment by painting its 2D
// template PNG onto the R-15 body parts. Only a classic Shirt
// (assetType 11 → ShirtTemplate, wraps torso+arms) or classic Pants
// (assetType 12 → PantsTemplate, legs) HAS such a full template.
// Layered-clothing accessories (64-72), effects/auras (44) and
// mis-slotted items carry NO 2D template — the texture route returns
// 502 and the mannequin shows no clothing at all (user report «нет
// одежды», 2026-05-29). T-Shirts (assetType 2) only have a tiny chest
// decal, which the user explicitly rejected («мелкий принт нам не
// катит»). So for clothing slots we keep ONLY the classic type that
// yields a real, full garment; if a slot somehow has none, fall back
// to the unfiltered pool rather than dropping the slot entirely.
const CLASSIC_CLOTHING_TYPE: Partial<Record<OutfitSlot, number>> = {
  shirt: 11,
  jacket: 11,
  pants: 12,
};

function filterClassicClothing(items: RobloxCatalogItem[], slot: OutfitSlot): RobloxCatalogItem[] {
  const want = CLASSIC_CLOTHING_TYPE[slot];
  if (want == null) return items;            // non-clothing slot — untouched
  const classic = items.filter((it) => it.assetType === want);
  return classic.length > 0 ? classic : items;
}

// ─── Live catalog search per slot ────────────────────────────────

async function searchSlotCandidates(args: {
  aesthetic: OutfitAesthetic;
  slot: OutfitSlot;
  gender: OutfitGender;
  style: OutfitStyleMode;
  remix?: OutfitRemixMode;
}): Promise<RobloxCatalogItem[]> {
  // Primary: static pre-fetched pool (works even when Cloud Run egress is
  // blocked from Roblox catalog). Cap 8 items per slot.
  const staticPool = STATIC_POOL[args.aesthetic.id]?.[args.slot] ?? [];
  if (staticPool.length > 0) {
    return filterClassicClothing(staticPool.filter(isItemAllowed), args.slot);
  }

  // Fallback: live API (rarely succeeds from Cloud Run, but kept for
  // resilience if Roblox eventually unblocks our IP range).
  const keywords = args.aesthetic.liveKeywords[args.slot] ?? [];
  if (keywords.length === 0) return [];
  const styleHint = args.style === 'colorful' ? '' : ' dark';
  const genderHint = args.gender === 'girls' ? ' girl'
    : args.gender === 'boys' ? ' boy'
    : '';
  const pool: RobloxCatalogItem[] = [];
  const seenIds = new Set<number>();
  for (const kw of keywords) {
    const q = `${kw}${styleHint}${genderHint}`.trim().toLowerCase();
    try {
      const result = await fetchCatalogByKeyword({ keyword: q, limit: 10 });
      for (const item of result.items) {
        if (seenIds.has(item.id)) continue;
        if (!isItemAllowed(item)) continue;
        seenIds.add(item.id);
        pool.push(item);
      }
    } catch (err) {
      logger.warn('[outfitAssembler] live catalog fallback failed', { slot: args.slot, kw, err: err instanceof Error ? err.message : String(err) });
    }
    if (pool.length >= 8) break;
  }
  return pool;
}

// ─── Slot alternatives (Phase C2 — interactive try-on) ──────────
//
// For the Fitting Room dress-up grid: when a user taps "Swap" on a
// specific slot, we need a candidate list of OTHER items they could
// equip in that slot — same aesthetic / gender / style, but different
// asset IDs. Returns up to `limit` items, with optional `excludeAssetIds`
// filter so we don't show the user the item they're already wearing.
//
// Reuses the same static pool + live fallback as the main assembler so
// the alternatives feel cohesive with the original outfit.

export async function getSlotAlternatives(args: {
  aestheticId: OutfitAestheticId;
  slot: OutfitSlot;
  gender: OutfitGender;
  style: OutfitStyleMode;
  excludeAssetIds?: string[];
  limit?: number;
}): Promise<OutfitItem[]> {
  const aesthetic = getOutfitAesthetic(args.aestheticId);
  const excludeSet = new Set((args.excludeAssetIds ?? []).map(String));
  const limit = Math.max(1, Math.min(args.limit ?? 12, 24));

  const pool = await searchSlotCandidates({
    aesthetic,
    slot: args.slot,
    gender: args.gender,
    style: args.style,
  });
  const filtered = pool.filter((it) => !excludeSet.has(String(it.id)));

  // Curated items mixed in for aesthetic coherence (they take priority
  // since they're hand-verified).
  const curatedForSlot = aesthetic.curatedCore
    .filter((c) => c.slot === args.slot)
    .filter((c) => !excludeSet.has(c.assetId));

  const curatedItems = curatedForSlot.map(curatedToOutfitItem);
  const liveItems = filtered.map((it) => liveToOutfitItem(it, args.slot));

  // De-dupe by assetId — curated takes precedence.
  const byId = new Map<string, OutfitItem>();
  for (const it of curatedItems) byId.set(it.assetId, it);
  for (const it of liveItems) if (!byId.has(it.assetId)) byId.set(it.assetId, it);

  // Sort: curated first, then by favoriteCount desc (popularity proxy),
  // then by price asc (budget-friendly).
  const all = Array.from(byId.values()).sort((a, b) => {
    if (a.isCurated !== b.isCurated) return a.isCurated ? -1 : 1;
    const favA = a.favoriteCount ?? 0;
    const favB = b.favoriteCount ?? 0;
    if (favA !== favB) return favB - favA;
    return (a.priceRobux ?? 0) - (b.priceRobux ?? 0);
  });

  return all.slice(0, limit);
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

// ─── Hero avatar visualization via flux text-to-image ────────────

/**
 * Render a single "AI made me this fit" hero image showing a Roblox avatar
 * in the assembled outfit. This is what makes the feature feel like an
 * outfit (vs. a list of items). Falls back to undefined on any failure —
 * client renders the item grid alone.
 */
function buildOutfitHeroPrompt(args: {
  aesthetic: OutfitAesthetic;
  items: OutfitItem[];
  gender: OutfitGender;
  style: OutfitStyleMode;
}): string {
  // Build a tight prompt from the actual picked items.
  const itemNamesByCategory: Record<string, string> = {};
  for (const it of args.items) {
    // De-aestheticize the name so flux doesn't echo "y2k vamp emo vintage baddie crop top".
    const cleaned = it.name
      .replace(/[♡♥★☆†♪]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60);
    if (!itemNamesByCategory[it.slot]) itemNamesByCategory[it.slot] = cleaned;
  }
  const wearing = Object.entries(itemNamesByCategory)
    .map(([slot, name]) => `${slot}: ${name}`)
    .join(', ');

  const genderClause = args.gender === 'girls'
    ? ' Female Roblox character with feminine proportions.'
    : args.gender === 'boys'
      ? ' Male Roblox character with masculine proportions.'
      : ' Roblox character.';

  const styleClause = args.style === 'dark'
    ? ' Dark, dramatic studio lighting.'
    : ' Bright, colorful pop lighting.';

  return [
    `A Roblox blocky avatar in the "${args.aesthetic.title}" aesthetic.`,
    args.aesthetic.pitchEN,
    `The avatar is wearing: ${wearing}.`,
    genderClause + styleClause,
    'Full body 3/4 view, plain pure white background, soft studio lighting, sharp clean stylized 3D cartoon render. Family-friendly, no horror, no gore, no text, no logos.',
  ].join(' ');
}

async function generateOutfitHeroPreview(args: {
  aesthetic: OutfitAesthetic;
  items: OutfitItem[];
  gender: OutfitGender;
  style: OutfitStyleMode;
}): Promise<string | undefined> {
  const prompt = buildOutfitHeroPrompt(args);
  try {
    const url = await generatePreviewTexture(prompt, 'roblox', 'character');
    return url;
  } catch (err) {
    logger.warn('[outfitAssembler] hero render failed', { aestheticId: args.aesthetic.id, err: err instanceof Error ? err.message : String(err) });
    return undefined;
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

  // Caption + flux hero + REAL 3D render in parallel. Hero is flux (~3-5s,
  // the 2D fallback). render3d (session 411) is the Roblox server-side
  // composited avatar wearing the EXACT picked items (~15-20s) — it replaces
  // the old Meshy text-to-3D GLB, which invented an avatar that didn't match
  // the item list. renderOutfit3D needs ROBLOX_SERVICE_COOKIE (env), not a
  // firebaseUid. Both tolerate failure → client falls back (render3d →
  // heroPreviewUrl → item grid). Gated by renderAvatar3D so fittingRoomRenderer
  // (which runs its own renderOutfit3D) doesn't double-render.
  const [caption, heroPreviewUrl, render3d] = await Promise.all([
    pickCaption(aesthetic, input.remix),
    generateOutfitHeroPreview({ aesthetic, items, gender: input.gender, style: input.style }),
    input.renderAvatar3D
      ? renderOutfit3D({ assetIds: items.map((it) => it.assetId) })
      : Promise.resolve(null),
  ]);

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
    heroPreviewUrl,
    render3d: render3d ?? undefined,
  };
}
