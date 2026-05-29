// cursedUgcGenerator.ts — AI meme/cursed UGC concept generator (session 384).
//
// Pipeline:
//   1. Build flux prompts for: main image + cuter variation + more-cursed variation.
//   2. Fire 3 flux text-to-image calls in parallel (schnell-class for speed).
//   3. Upload all 3 to Firebase Storage with v4 signed URLs (mirror Glow-Up).
//   4. Single Anthropic call generates ALL metadata: title, description,
//      tags, share caption, rarity vibe, fake price, fake stats.
//   5. Return composed result. ~6-10s total (flux dominates).

import { logger } from 'firebase-functions/v2';
import { getStorage } from 'firebase-admin/storage';
import { generatePreviewTexture, runChatProvider, runMeshy } from './providers.js';
import {
  buildCursedUGCPrompt,
  CURSED_UGC_CATEGORIES,
  CURSED_UGC_STYLES,
  type CursedUGCCategoryId,
  type CursedUGCStyleId,
  type CursedUGCIntensity,
} from './data/cursedUgcCategories.js';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT ?? 'roblox-ai-generator-v2-2-ios';
const BUCKETS = [
  'roblox-ai-gen-v2-artifacts',
  `${PROJECT_ID}.firebasestorage.app`,
  `${PROJECT_ID}.appspot.com`,
];
let _bucket: ReturnType<ReturnType<typeof getStorage>['bucket']> | null = null;
async function bucket() {
  if (_bucket) return _bucket;
  for (const name of BUCKETS) {
    try {
      const c = getStorage().bucket(name);
      const [ok] = await c.exists();
      if (ok) { _bucket = c; return c; }
    } catch { /* try next */ }
  }
  _bucket = getStorage().bucket(BUCKETS[0]);
  return _bucket;
}

async function uploadSigned(args: {
  firebaseUid: string;
  filename: string;
  buf: Buffer;
}): Promise<string> {
  const b = await bucket();
  const path = `cursed-ugc/${args.firebaseUid}/${Date.now()}-${args.filename}`;
  const file = b.file(path);
  await file.save(args.buf, { contentType: 'image/png', resumable: false });
  const [url] = await file.getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
  });
  return url;
}

async function fluxOnceToSignedUrl(args: {
  prompt: string;
  firebaseUid: string;
  filename: string;
}): Promise<string | undefined> {
  try {
    const fluxUrl = await generatePreviewTexture(args.prompt, 'roblox', 'character');
    if (!fluxUrl) return undefined;
    const resp = await fetch(fluxUrl, { signal: AbortSignal.timeout(20_000) });
    if (!resp.ok) return undefined;
    const buf = Buffer.from(await resp.arrayBuffer());
    return await uploadSigned({ ...args, buf });
  } catch (err) {
    logger.warn('[cursedUgcGenerator] flux step failed', {
      filename: args.filename,
      err: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
}

// ─── AI metadata via Anthropic (single JSON call) ───────────────

export interface CursedUGCMetadata {
  titleEN: string;
  titleRU: string;
  descriptionEN: string;
  descriptionRU: string;
  tags: string[];
  shareCaption: string;
  rarityVibeEN: string;
  rarityVibeRU: string;
  fakePriceRobux: number;
  fakeStats: {
    wishlistedBy: string;     // "42K", "999K", "1.2M"
    trendingRank: number;     // 1-15
    bannedInCountries: number; // 0-7
    daysLeft: string;          // "Limited 2d", "Forever", "Expired"
  };
}

async function generateMetadata(args: {
  categoryId: CursedUGCCategoryId;
  styleId: CursedUGCStyleId;
  intensity: CursedUGCIntensity;
  userPrompt?: string;
}): Promise<CursedUGCMetadata> {
  const cat = CURSED_UGC_CATEGORIES[args.categoryId];
  const sty = CURSED_UGC_STYLES[args.styleId];
  const userClause = args.userPrompt?.trim() ? ` User idea: "${args.userPrompt.trim().slice(0, 80)}".` : '';

  const prompt = [
    'You are writing FAKE Roblox UGC item metadata for an absurd cursed-meme generator (NOT a real Roblox marketplace listing — this is a meme).',
    `Category: ${cat.titleEN} (${cat.pitchEN})`,
    `Style: ${sty.titleEN}`,
    `Intensity: ${args.intensity}.${userClause}`,
    'Return ONE JSON object with EXACTLY these keys, no markdown:',
    '{',
    '  "titleEN": "Cursed Sigma Hamster Backpack" (4-7 words, absurd-funny),',
    '  "titleRU": "Куршед Сигма Хомяк Рюкзак" (RU version of the same item),',
    '  "descriptionEN": "Looks emotionally unstable but premium." (1 sentence, meme),',
    '  "descriptionRU": "RU version, 1 sentence",',
    '  "tags": ["cursed","brainrot","sigma","limited","meme"] (5-7 lowercase tags),',
    '  "shareCaption": "bro Roblox needs to add this 💀" (short TikTok-friendly),',
    '  "rarityVibeEN": "Legendary Meme" (cursed marketplace tier — e.g. "Mythic Cursed", "Brainrot Tier", "Limited Cringe"),',
    '  "rarityVibeRU": "RU version",',
    '  "fakePriceRobux": 75000 (absurdly high or weirdly low: pick from [99, 666, 999, 4200, 13337, 31337, 69420, 75000, 99999, 250000, 666666, 999999]),',
    '  "fakeStats": {',
    '     "wishlistedBy": "42K" (random K/M number, formatted),',
    '     "trendingRank": 3 (1-15),',
    '     "bannedInCountries": 2 (0-7),',
    '     "daysLeft": "Limited 2d" (or "Forever", "Expired", "Limited 13h")',
    '   }',
    '}',
    'Output JSON ONLY, no preamble, no markdown, no comments.',
  ].join('\n');

  try {
    const result = await runChatProvider('anthropic', prompt, undefined, { timeoutMs: 15_000 });
    const text = (result.text ?? '').trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('no JSON in LLM response');
    const parsed = JSON.parse(match[0]) as Partial<CursedUGCMetadata>;
    // Validate + coerce.
    return {
      titleEN: typeof parsed.titleEN === 'string' ? parsed.titleEN : `Cursed ${cat.titleEN}`,
      titleRU: typeof parsed.titleRU === 'string' ? parsed.titleRU : `Куршед ${cat.titleRU}`,
      descriptionEN: typeof parsed.descriptionEN === 'string' ? parsed.descriptionEN : 'Cursed energy, premium price.',
      descriptionRU: typeof parsed.descriptionRU === 'string' ? parsed.descriptionRU : 'Куршед энергия, премиум прайс.',
      tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 7).map((t) => String(t).toLowerCase()) : ['cursed', 'meme'],
      shareCaption: typeof parsed.shareCaption === 'string' ? parsed.shareCaption : 'bro Roblox needs to add this 💀',
      rarityVibeEN: typeof parsed.rarityVibeEN === 'string' ? parsed.rarityVibeEN : 'Legendary Meme',
      rarityVibeRU: typeof parsed.rarityVibeRU === 'string' ? parsed.rarityVibeRU : 'Легендарный Мем',
      fakePriceRobux: typeof parsed.fakePriceRobux === 'number' ? parsed.fakePriceRobux : 75000,
      fakeStats: {
        wishlistedBy: typeof parsed.fakeStats?.wishlistedBy === 'string' ? parsed.fakeStats.wishlistedBy : '42K',
        trendingRank: typeof parsed.fakeStats?.trendingRank === 'number' ? parsed.fakeStats.trendingRank : 3,
        bannedInCountries: typeof parsed.fakeStats?.bannedInCountries === 'number' ? parsed.fakeStats.bannedInCountries : 2,
        daysLeft: typeof parsed.fakeStats?.daysLeft === 'string' ? parsed.fakeStats.daysLeft : 'Limited 2d',
      },
    };
  } catch (err) {
    logger.warn('[cursedUgcGenerator] metadata LLM failed; using fallback', { err: err instanceof Error ? err.message : String(err) });
    return {
      titleEN: `Cursed ${cat.titleEN}`,
      titleRU: `Куршед ${cat.titleRU}`,
      descriptionEN: 'Cursed energy, premium price.',
      descriptionRU: 'Куршед энергия, премиум прайс.',
      tags: ['cursed', 'meme', sty.id],
      shareCaption: 'bro Roblox needs to add this 💀',
      rarityVibeEN: 'Legendary Meme',
      rarityVibeRU: 'Легендарный Мем',
      fakePriceRobux: 75000,
      fakeStats: { wishlistedBy: '42K', trendingRank: 3, bannedInCountries: 2, daysLeft: 'Limited 2d' },
    };
  }
}

// ─── Public entry ───────────────────────────────────────────────

export interface CursedUGCInput {
  categoryId: CursedUGCCategoryId;
  styleId: CursedUGCStyleId;
  intensity: CursedUGCIntensity;
  userPrompt?: string;
  firebaseUid: string;
}

export interface CursedUGCResult extends CursedUGCMetadata {
  generationId: string;
  categoryId: CursedUGCCategoryId;
  styleId: CursedUGCStyleId;
  intensity: CursedUGCIntensity;
  mainImageUrl?: string;
  /**
   * Session 390 — Meshy v6 GLB URL for the 3D mesh of the cursed item, so the
   * iOS result screen can render a rotatable SceneKit viewer instead of the
   * 2D flux concept. Optional: if Meshy times out or fails, the UI falls
   * back to mainImageUrl (2D PNG).
   */
  meshUrl?: string;
  /** Meshy v6 PNG thumbnail of the rendered 3D model (different from the
   *  flux 2D concept — this one actually represents the mesh that ships). */
  meshThumbnailUrl?: string;
  variations: Array<{ label: string; imageUrl?: string }>;
  generationStatus: 'ready' | 'partial' | 'failed';
}

// Session 390 — Meshy v6 text-to-3D wrapper for cursed UGC. Returns undefined
// on any failure / timeout so the main flow keeps going on 2D images alone.
//
// Round 3 (session 390 round 3) — bumped timeout 75s → 180s after prod logs
// showed real Meshy completions for cursed UGC items run ~90-130s wall-clock
// (28+ polling attempts × 5s = ~140s). At 75s the timeout fired BEFORE
// Meshy actually finished, the generator silently fell back to 2D-only, and
// the user saw flat flux concepts despite Meshy having succeeded ~50-60s
// later in the background (wasted spend). 180s comfortably covers the long
// tail without blowing through Cloud Run's 300s function timeout.
async function meshyOnceFor(args: {
  prompt: string;
  contentSubcategory?: string;
}): Promise<{ meshUrl?: string; thumbnailUrl?: string } | undefined> {
  try {
    const meshyPromise = runMeshy(args.prompt, {
      // Session 390 round 5 — switched from 'character' → 'item_tool'.
      //
      // 'character' triggers runMeshy's `isCharacterContent` branch, which
      // makes build3DPrompt rewrite the prompt to demand a humanoid
      // standing in T-pose ("Stylized low-poly 3D game character standing
      // upright in a neutral resting pose: arms hanging straight down..."),
      // discarding the original cursed-item description entirely. Prod
      // logs from 2026-05-28T13:37:09 and 2026-05-29T03:35:51 showed the
      // ORIGINAL prompt was «A massively oversized Roblox UGC backpack
      // that is comically larger than the avatar wearing it» and the
      // CLEAN prompt sent to Meshy was «Cursed UGC Item. Stylized low-
      // poly 3D game character. Standing upright in a neutral resting
      // pose...» — Meshy then generated a full sigma chad with a
      // backpack baked onto his torso instead of a standalone backpack.
      // The resulting GLB was multi-MB of character mesh, which the iOS
      // viewer struggled to load → empty 3D preview.
      //
      // 'item_tool' keeps the original item-centric prompt intact AND
      // bolts on a strong negative prompt ('human body, person,
      // character, hands holding, body, face, mannequin, background
      // scene...') so Meshy renders the cursed accessory alone on a
      // clean background, matching the flux 2D concepts the user sees
      // alongside it.
      contentCategory: 'item_tool',
      contentSubcategory: args.contentSubcategory ?? 'cursed_ugc',
      title: 'Cursed UGC Item',
    });
    const timeoutPromise = new Promise<undefined>((resolve) =>
      setTimeout(() => resolve(undefined), 180_000),
    );
    const winner = await Promise.race([meshyPromise, timeoutPromise]);
    if (!winner) {
      logger.warn('[cursedUgcGenerator] Meshy timed out at 180s — falling back to 2D-only result');
      return undefined;
    }
    const raw = winner.raw as Record<string, unknown> | undefined;
    const meshUrl = winner.outputUrl
      ?? (typeof raw?.modelUrl === 'string' ? (raw.modelUrl as string) : undefined);
    const thumbnailUrl = typeof raw?.thumbnailUrl === 'string'
      ? (raw.thumbnailUrl as string)
      : undefined;
    return { meshUrl, thumbnailUrl };
  } catch (err) {
    logger.warn('[cursedUgcGenerator] Meshy 3D step failed (non-fatal)', {
      err: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
}

export async function generateCursedUGC(input: CursedUGCInput): Promise<CursedUGCResult> {
  const generationId = `cugc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  // 3 flux calls + 1 LLM metadata call + 1 Meshy 3D call — all in parallel.
  // Meshy is the slowest (~30-60s); flux is ~6-10s; LLM is ~3-6s. With
  // Promise.all the total wall-clock is the max of these. The Meshy call
  // wraps a 75s soft timeout so a stuck mesh stage can't block the result.
  const mainPrompt = buildCursedUGCPrompt({ category: input.categoryId, style: input.styleId, intensity: input.intensity, userPrompt: input.userPrompt });
  const cuterPrompt = buildCursedUGCPrompt({ category: input.categoryId, style: input.styleId, intensity: input.intensity, userPrompt: input.userPrompt, variationOverride: 'cuter' });
  const cursedPrompt = buildCursedUGCPrompt({ category: input.categoryId, style: input.styleId, intensity: input.intensity, userPrompt: input.userPrompt, variationOverride: 'more_cursed' });

  const [mainImageUrl, cuterUrl, cursedUrl, metadata, mesh] = await Promise.all([
    fluxOnceToSignedUrl({ prompt: mainPrompt, firebaseUid: input.firebaseUid, filename: 'main.png' }),
    fluxOnceToSignedUrl({ prompt: cuterPrompt, firebaseUid: input.firebaseUid, filename: 'cuter.png' }),
    fluxOnceToSignedUrl({ prompt: cursedPrompt, firebaseUid: input.firebaseUid, filename: 'cursed.png' }),
    generateMetadata({
      categoryId: input.categoryId,
      styleId: input.styleId,
      intensity: input.intensity,
      userPrompt: input.userPrompt,
    }),
    meshyOnceFor({ prompt: mainPrompt, contentSubcategory: 'cursed_ugc' }),
  ]);

  const variations: Array<{ label: string; imageUrl?: string }> = [
    { label: 'cuter',       imageUrl: cuterUrl },
    { label: 'more_cursed', imageUrl: cursedUrl },
  ];

  const generationStatus: 'ready' | 'partial' | 'failed' =
    mainImageUrl ? (cuterUrl && cursedUrl ? 'ready' : 'partial') : 'failed';

  return {
    generationId,
    categoryId: input.categoryId,
    styleId: input.styleId,
    intensity: input.intensity,
    mainImageUrl,
    meshUrl: mesh?.meshUrl,
    meshThumbnailUrl: mesh?.thumbnailUrl,
    variations,
    generationStatus,
    ...metadata,
  };
}
