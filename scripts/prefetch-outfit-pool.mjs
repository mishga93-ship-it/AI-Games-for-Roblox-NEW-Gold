// scripts/prefetch-outfit-pool.mjs
//
// Roblox Catalog API works from a normal residential IP but is blocked
// from Cloud Run (verified May 2026). So we pre-fetch the catalog pool on
// a dev machine and ship it as a static JSON snapshot used by the outfit
// assembler instead of live calls.
//
// Run periodically (~weekly) to refresh trends.
//
// Output: apps/functions/src/data/outfitCatalogPool.json
//
// Usage:  node scripts/prefetch-outfit-pool.mjs

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, '..', 'apps/functions/src/data/outfitCatalogPool.json');

// ─── Aesthetic → slot → keywords (mirrors data/outfitAesthetics.ts) ────
// Cap per slot: 8 items. Total ≤ 60 per aesthetic = ~540 across 9 aesthetics.

const POOL_SPEC = {
  sigma: {
    hair: ['sigma slick hair', 'clean black hair'],
    face: ['black sunglasses', 'stoic face'],
    shirt: ['black suit', 'dark blazer shirt'],
    pants: ['black slacks', 'dark trousers'],
    neck: ['gold chain', 'silver chain'],
    accessory: ['watch sigma', 'pocket square'],
  },
  baddie: {
    hair: ['long wavy hair', 'baddie hair'],
    face: ['baddie makeup face', 'glossy lips face'],
    shirt: ['crop top baddie', 'pink crop top'],
    pants: ['high waist jeans', 'baddie pants'],
    accessory: ['hoop earrings gold', 'chain belt'],
    neck: ['gold chain', 'choker'],
  },
  y2k: {
    hair: ['y2k hair', 'pink streak hair'],
    face: ['y2k face', 'pink lips face'],
    shirt: ['y2k crop top', 'pink top'],
    pants: ['low rise jeans', 'y2k pants'],
    accessory: ['butterfly clip', 'y2k accessory'],
    neck: ['butterfly necklace', 'choker pink'],
  },
  goth: {
    hair: ['black goth hair', 'long black hair'],
    face: ['goth makeup', 'dark eye makeup'],
    shirt: ['black corset', 'goth shirt'],
    pants: ['black goth pants', 'black skirt'],
    accessory: ['cross necklace', 'goth chain'],
    back: ['black wings', 'goth wings'],
  },
  rich_emo: {
    hair: ['emo hair', 'side bangs hair'],
    face: ['emo makeup', 'eyeliner face'],
    shirt: ['chain shirt', 'emo top'],
    pants: ['skinny jeans', 'emo pants'],
    neck: ['silver chain', 'cross necklace'],
    accessory: ['chain belt', 'studs accessory'],
  },
  slender: {
    hair: ['plain black hair', 'slim hair'],
    face: ['blank face', 'plain face'],
    shirt: ['black formal shirt', 'black blazer'],
    pants: ['black slim pants', 'black trousers'],
    accessory: ['black tie', 'simple tie'],
  },
  softie: {
    hair: ['soft hair pastel', 'pink hair'],
    face: ['soft makeup', 'blush face'],
    shirt: ['pastel cardigan', 'soft top'],
    pants: ['pastel skirt', 'soft pants'],
    accessory: ['heart accessory', 'bow accessory'],
    back: ['fairy wings', 'pastel wings'],
  },
  cyber: {
    hair: ['cyber hair', 'neon hair'],
    face: ['cyber visor', 'neon glasses'],
    shirt: ['cyberpunk jacket', 'tech shirt'],
    pants: ['tech pants', 'cyber pants'],
    accessory: ['cyber headset', 'tech accessory'],
    back: ['mech wings', 'tech wings'],
    aura: ['neon aura', 'cyber aura'],
  },
  anime_demon: {
    hair: ['anime demon hair', 'long anime hair'],
    face: ['demon eyes', 'anime face'],
    shirt: ['anime jacket', 'demon haori'],
    pants: ['anime pants', 'samurai pants'],
    accessory: ['anime mask', 'demon horns'],
    back: ['demon wings', 'anime aura'],
    aura: ['red aura', 'flame aura'],
  },
};

const NAME_BLACKLIST = [
  /\b(nsfw|18\+|porn|xxx|sex)\b/i,
  /\b(scam|free\s*robux|generator)\b/i,
  /^test\b/i,
  /^untitled\b/i,
];

function isAllowed(item) {
  if (!item.name || !item.name.trim()) return false;
  if (item.price != null && item.price > 500) return false;
  for (const re of NAME_BLACKLIST) if (re.test(item.name)) return false;
  return true;
}

// ─── Roblox API helpers ─────────────────────────────────────────────

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 KamiGoldPrefetch/1.0';

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function searchItems(keyword, category = 1, limit = 10) {
  const url = `https://catalog.roblox.com/v1/search/items?Category=${category}&Keyword=${encodeURIComponent(keyword)}&Limit=${limit}&SortType=2`;
  // Up to 4 attempts with exponential backoff for 429s.
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
    if (r.ok) {
      const j = await r.json();
      return Array.isArray(j.data) ? j.data : [];
    }
    if (r.status === 429) {
      const waitMs = 3000 * Math.pow(2, attempt);
      console.warn(`    ⏳ 429, waiting ${waitMs}ms (attempt ${attempt + 1})`);
      await sleep(waitMs);
      continue;
    }
    throw new Error(`search ${keyword} HTTP ${r.status}`);
  }
  throw new Error(`search ${keyword} exhausted retries`);
}

let csrfToken = null;
async function fetchDetails(entries) {
  if (entries.length === 0) return [];
  const body = JSON.stringify({ items: entries.map((e) => ({ itemType: e.itemType, id: e.id })) });
  const tryOnce = async () => fetch('https://catalog.roblox.com/v1/catalog/items/details', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
      ...(csrfToken ? { 'X-CSRF-TOKEN': csrfToken } : {}),
    },
    body,
  });
  for (let attempt = 0; attempt < 4; attempt++) {
    let r = await tryOnce();
    if (r.status === 403) {
      csrfToken = r.headers.get('x-csrf-token');
      if (csrfToken) r = await tryOnce();
    }
    if (r.ok) {
      const j = await r.json();
      return Array.isArray(j.data) ? j.data : [];
    }
    if (r.status === 429) {
      const waitMs = 3000 * Math.pow(2, attempt);
      console.warn(`    ⏳ details 429, waiting ${waitMs}ms (attempt ${attempt + 1})`);
      await sleep(waitMs);
      continue;
    }
    throw new Error(`details HTTP ${r.status}`);
  }
  throw new Error('details exhausted retries');
}

async function fetchThumbs(ids) {
  if (ids.length === 0) return new Map();
  const u = `https://thumbnails.roblox.com/v1/assets?assetIds=${ids.slice(0, 20).join(',')}&size=420x420&format=Png&isCircular=false`;
  const r = await fetch(u, { headers: { 'User-Agent': USER_AGENT } });
  if (!r.ok) return new Map();
  const j = await r.json();
  const out = new Map();
  for (const row of (j.data ?? [])) {
    if (row.state === 'Completed' && row.imageUrl) out.set(row.targetId, row.imageUrl);
  }
  return out;
}

// ─── Main ──────────────────────────────────────────────────────────

async function fetchSlotPool(keywords, perKeyword = 10) {
  const seen = new Set();
  const merged = [];
  for (const kw of keywords) {
    try {
      const entries = await searchItems(kw, 1, perKeyword);
      if (entries.length === 0) continue;
      const details = await fetchDetails(entries);
      const ids = entries.filter((e) => e.itemType === 'Asset').map((e) => e.id);
      const thumbs = await fetchThumbs(ids);
      for (const d of details) {
        if (seen.has(d.id)) continue;
        const item = {
          id: d.id,
          name: d.name,
          itemType: d.itemType,
          assetType: d.assetType,
          price: d.price,
          creatorName: d.creatorName,
          favoriteCount: d.favoriteCount,
          thumbnailUrl: thumbs.get(d.id) ?? null,
        };
        if (!isAllowed(item)) continue;
        seen.add(d.id);
        merged.push(item);
      }
      await sleep(1500); // be very polite — Roblox catalog rate-limits hard
    } catch (err) {
      console.warn(`  ✗ ${kw}:`, err.message);
    }
  }
  // Sort by favorites desc, take top 8.
  return merged.sort((a, b) => (b.favoriteCount ?? 0) - (a.favoriteCount ?? 0)).slice(0, 8);
}

async function main() {
  // Resume from existing JSON if present — only fill missing slots.
  let out = {};
  try {
    out = JSON.parse(await fs.readFile(OUT_PATH, 'utf8'));
    console.log('Resuming from existing pool');
  } catch { /* fresh start */ }

  for (const [aesthetic, slotMap] of Object.entries(POOL_SPEC)) {
    console.log(`\n=== ${aesthetic} ===`);
    if (!out[aesthetic]) out[aesthetic] = {};
    for (const [slot, keywords] of Object.entries(slotMap)) {
      // Skip if we already have ≥4 items for this slot.
      if (Array.isArray(out[aesthetic][slot]) && out[aesthetic][slot].length >= 4) {
        console.log(`  ${slot}: ${out[aesthetic][slot].length} items (cached, skipping)`);
        continue;
      }
      try {
        const items = await fetchSlotPool(keywords);
        console.log(`  ${slot}: ${items.length} items`);
        out[aesthetic][slot] = items;
      } catch (err) {
        console.warn(`  ${slot}: failed — ${err.message}`);
        out[aesthetic][slot] = out[aesthetic][slot] ?? [];
      }
      // Persist after every slot so partial progress is never lost.
      await fs.writeFile(OUT_PATH, JSON.stringify(out, null, 2));
    }
  }
  console.log(`\n✓ wrote ${OUT_PATH}`);
  const total = Object.values(out).reduce((acc, slots) =>
    acc + Object.values(slots).reduce((a, items) => a + (items?.length ?? 0), 0), 0);
  console.log(`  total items: ${total}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
