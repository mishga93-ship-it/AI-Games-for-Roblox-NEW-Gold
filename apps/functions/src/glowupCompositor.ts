// glowupCompositor.ts — Phase 2 Avatar Glow-Up generator (session 382).
//
// Pipeline per request:
//   1. Generate Decal PNG (1024×1024)  ← flux-pro w/ vibe.decalPrompt
//   2. Generate Shirt PNG  (585×559)   ← clothingCompositor solid-color
//   3. Generate Pants PNG  (585×559)   ← clothingCompositor solid-color
//   4. Generate Preview PNG (768×1024) ← composite: optional user avatar +
//                                        vibe tint + watermark
//   5. Upload all 4 to Firebase Storage → return signed URLs (7-day TTL)
//
// AI is used ONLY for the Decal (flux-pro). Shirt/Pants are pure
// sharp-composite (solid color blocks per UV region), giving us pixel-
// perfect color matches to the vibe palette without any LLM jank.

import { logger } from 'firebase-functions/v2';
import sharp from 'sharp';
import { getStorage } from 'firebase-admin/storage';
import { generatePreviewTexture, runFal } from './providers.js';
import { compositeShirtTemplate, compositePantsTemplate } from './clothingCompositor.js';
import { downloadAvatarThumbnailBuffer } from './robloxUserLookup.js';
import { getGlowupVibe, summarizeVibe, avatarRestylePromptFor, type GlowupVibe, type GlowupVibeId, type GlowupGender, type GlowupIntensity } from './data/glowupVibes.js';

const PREVIEW_W = 768;
const PREVIEW_H = 1024;
const DECAL_SIZE = 1024;

export interface GlowupAssetPack {
  shirtUrl: string;       // 585×559 PNG, Roblox Classic Shirt template
  pantsUrl: string;       // 585×559 PNG, Roblox Classic Pants template
  decalUrl: string;       // 1024×1024 PNG, face/aura decal
}

export interface GlowupGenerateResult {
  vibeId: GlowupVibeId;
  title: string;
  /** Localized pitch one-liner (RU+EN, client picks). */
  pitchEN: string;
  pitchRU: string;
  /** Backward-compat field: same value as pitchRU. */
  pitch: string;
  appStoreHook: string;
  previewUrl: string;
  fitOnUser: boolean;
  assetPack: GlowupAssetPack;
  catalogItems: GlowupVibe['catalogAccessories'];
  instructionsRU: string[];
  instructionsEN: string[];
  shareCaptionRU: string;
  shareCaptionEN: string;
  cost: ReturnType<typeof summarizeVibe>;
  /** Localized disclaimer (RU+EN, client picks). */
  disclaimerEN: string;
  disclaimerRU: string;
  /** Backward-compat field: same value as disclaimerRU. */
  disclaimer: string;
}

export interface GlowupGenerateInput {
  vibeId: GlowupVibeId;
  gender: GlowupGender;
  intensity: GlowupIntensity;
  robloxUserId?: string;          // when present, use real avatar in preview
  firebaseUid: string;            // for storage path scoping
}

const DISCLAIMER_RU = 'Это креативная иллюзия из официальных бесплатных и дешёвых Catalog-аксессуаров. Это не настоящие Headless Horseman или Korblox Deathspeaker, и мы не обходим платёжную систему Roblox.';
const DISCLAIMER_EN = 'A creative illusion built from official free and low-cost Catalog accessories. NOT the real Headless Horseman or Korblox Deathspeaker — we do not bypass any Roblox payment system.';

function hexToRgba(hex: string): { r: number; g: number; b: number; alpha: number } {
  const h = hex.replace(/^#/, '');
  const n = Number.parseInt(h, 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff, alpha: 1 };
}

async function solidBuffer(width: number, height: number, hex: string): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 4, background: hexToRgba(hex) } }).png().toBuffer();
}

// Mirrors index.ts resolvedBucket pattern — firebase-admin initializeApp()
// was called without a storageBucket option, so getStorage().bucket() with
// no name returns a phantom bucket that 404s. Try the real candidates.
const PROJECT_ID = process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT ?? 'roblox-ai-generator-v2-2-ios';
const BUCKET_CANDIDATES = [
  'roblox-ai-gen-v2-artifacts',
  `${PROJECT_ID}.firebasestorage.app`,
  `${PROJECT_ID}.appspot.com`,
];

let _resolvedBucket: ReturnType<ReturnType<typeof getStorage>['bucket']> | null = null;

async function getStorageBucket(): Promise<ReturnType<ReturnType<typeof getStorage>['bucket']>> {
  if (_resolvedBucket) return _resolvedBucket;
  for (const name of BUCKET_CANDIDATES) {
    try {
      const candidate = getStorage().bucket(name);
      const [exists] = await candidate.exists();
      if (exists) {
        _resolvedBucket = candidate;
        logger.info(`[glowupCompositor] resolved Storage bucket: ${name}`);
        return candidate;
      }
    } catch {
      logger.warn(`[glowupCompositor] bucket ${name} not reachable, trying next`);
    }
  }
  _resolvedBucket = getStorage().bucket(BUCKET_CANDIDATES[0]);
  return _resolvedBucket;
}

async function uploadAndSign(args: {
  firebaseUid: string;
  vibeId: GlowupVibeId;
  filename: string;
  contentType: string;
  data: Buffer;
}): Promise<string> {
  const bucket = await getStorageBucket();
  const path = `glowup/${args.firebaseUid}/${args.vibeId}/${Date.now()}-${args.filename}`;
  const file = bucket.file(path);
  await file.save(args.data, { contentType: args.contentType, resumable: false });
  // v4 signing uses IAM SignBlob API (no local private key needed) — works
  // out of the box on Cloud Run/Functions with the default compute SA.
  // v2 signing requires the SA's private key to be embedded in admin SDK
  // creds, which it isn't when initializeApp() runs with ADC. v2 produced
  // SignatureDoesNotMatch 403 in prod (verified May 2026 e2e test).
  const [signedUrl] = await file.getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
  });
  return signedUrl;
}

/**
 * Generate Shirt.png — solid primary color across torso, secondary color
 * across sleeves. Pure deterministic (no AI), exact vibe-palette colors.
 */
async function buildShirtPNG(vibe: GlowupVibe): Promise<Buffer> {
  const frontTorso = await solidBuffer(128, 128, vibe.palette.shirtPrimaryHex);
  return compositeShirtTemplate({
    frontTorso,
    primaryColorHex: vibe.palette.shirtPrimaryHex,
    secondaryColorHex: vibe.palette.shirtAccentHex ?? vibe.palette.shirtPrimaryHex,
  });
}

async function buildPantsPNG(vibe: GlowupVibe): Promise<Buffer> {
  const leftLeg = await solidBuffer(64, 128, vibe.palette.pantsPrimaryHex);
  return compositePantsTemplate({
    leftLeg,
    primaryColorHex: vibe.palette.pantsPrimaryHex,
    secondaryColorHex: vibe.palette.pantsAccentHex ?? vibe.palette.pantsPrimaryHex,
  });
}

/**
 * Generate Decal PNG via flux-pro. Fall back to a solid-color buffer if
 * the upstream image gen fails (so the asset pack still ships something).
 */
async function buildDecalPNG(vibe: GlowupVibe, intensity: GlowupIntensity): Promise<Buffer> {
  const promptSuffix = intensity === 'scary'
    ? ' Slightly darker mood, more dramatic shadows. Family-friendly, no gore.'
    : ' Clean, minimalist, low contrast. Family-friendly.';
  const url = await generatePreviewTexture(vibe.decalPrompt + promptSuffix, 'roblox', 'prop').catch((err: unknown) => {
    logger.warn('[glowupCompositor] decal flux failed; using solid fallback', err);
    return undefined;
  });
  if (url) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      if (resp.ok) {
        const ab = await resp.arrayBuffer();
        // Normalize to 1024×1024 PNG with transparent edges preserved.
        return await sharp(Buffer.from(ab)).resize(DECAL_SIZE, DECAL_SIZE, { fit: 'cover' }).png().toBuffer();
      }
    } catch (err) {
      logger.warn('[glowupCompositor] decal download/resize failed', err);
    }
  }
  // Fallback: solid skin-tone block with a faint vibe-accent tint.
  return solidBuffer(DECAL_SIZE, DECAL_SIZE, vibe.palette.skinHex);
}

/**
 * Run flux img2img to RESTYLE the user's Roblox avatar PNG into the chosen
 * vibe (Headless / Korblox / Void / Sigma). This is what makes the preview
 * actually visually transform the user, vs. just pasting their plain avatar
 * on a colored background.
 *
 * Returns the generated image URL on success, undefined on any failure
 * (caller falls back to plain-avatar composition).
 */
async function restyleAvatarViaImg2Img(args: {
  vibe: GlowupVibe;
  intensity: GlowupIntensity;
  gender: GlowupGender;
  avatarBuffer: Buffer;       // downloaded ahead-of-time; fal.ai can't hotlink Roblox CDN
}): Promise<string | undefined> {
  const intensitySuffix = args.intensity === 'scary'
    ? ' Darker mood, dramatic studio lighting, sharper contrast.'
    : ' Clean stylized lighting, soft shadows.';
  // avatarRestylePromptFor() weaves the gender choice into the prompt so
  // flux doesn't always default to the input avatar's silhouette.
  const prompt = avatarRestylePromptFor(args.vibe, args.gender) + intensitySuffix +
    ' Maintain the blocky Roblox character proportions and pose from the input image.';
  // fal.ai img2img wants a downloadable URL. Roblox CDN blocks their
  // downloader (hotlinking protection / UA filter), so we pass the avatar
  // as a base64 data URI instead — universally accepted, no extra upload.
  const dataUri = `data:image/png;base64,${args.avatarBuffer.toString('base64')}`;
  try {
    // runFal() already prepends 'fal-ai/' — pass operation without the
    // prefix or you get '/fal-ai/fal-ai/...' → "Application not found".
    const result = await runFal('flux/dev/image-to-image', {
      image_url: dataUri,
      prompt,
      strength: 0.85,
      num_inference_steps: 30,
      guidance_scale: 5.5,
      num_images: 1,
      enable_safety_checker: true,
    });
    return result.outputUrl;
  } catch (err) {
    const errMsg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    logger.warn('[glowupCompositor] flux img2img avatar restyle failed', {
      vibeId: args.vibe.id,
      error: errMsg,
      stack: err instanceof Error ? err.stack?.split('\n').slice(0, 3).join('\n') : undefined,
    });
    return undefined;
  }
}

/**
 * Build a composite preview PNG (768×1024).
 *
 * Path A (best): if we have a Roblox avatar URL, run flux img2img to restyle
 * it into the vibe — user sees themselves transformed. Then composite title
 * banner + watermark on top.
 *
 * Path B (fallback): generate a text-to-image preview of the vibe character
 * from scratch — user sees an example of the look.
 *
 * Path C (last resort): solid color background + title + plain avatar paste.
 */
async function buildPreviewPNG(
  vibe: GlowupVibe,
  intensity: GlowupIntensity,
  gender: GlowupGender,
  robloxUserId?: string,
): Promise<{ buffer: Buffer; fitOnUser: boolean }> {
  const PREVIEW_BG_HEX = 'F5F5F5'; // soft neutral so transformed avatar stands out

  let baseImage: Buffer | null = null;
  let fitOnUser = false;

  if (robloxUserId) {
    const avatarBuf = await downloadAvatarThumbnailBuffer({ robloxUserId, size: '720x720', kind: 'full_body' });
    if (avatarBuf) {
      const restyledUrl = await restyleAvatarViaImg2Img({ vibe, intensity, gender, avatarBuffer: avatarBuf });
      if (restyledUrl) {
        try {
          const resp = await fetch(restyledUrl, { signal: AbortSignal.timeout(20_000) });
          if (resp.ok) {
            const ab = await resp.arrayBuffer();
            baseImage = await sharp(Buffer.from(ab))
              .resize(PREVIEW_W, PREVIEW_H, { fit: 'cover' })
              .png()
              .toBuffer();
            fitOnUser = true;
            logger.info('[glowupCompositor] avatar restyled via img2img', { vibeId: vibe.id });
          }
        } catch (err) {
          logger.warn('[glowupCompositor] restyled image download failed', err);
        }
      }
    }
  }

  // Fallback to text-to-image: generate a fresh vibe avatar from scratch.
  if (!baseImage) {
    // Marketing 2026-06-03: the generic (no-username) preview rendered a Roblox
    // DEFAULT rainbow body — cyan/purple arms, green hands — which read as a
    // cheap "multicolored dummy". The vibe prompt only constrained the OUTFIT
    // (e.g. all-black for headless), leaving the exposed skin (arms/hands/legs)
    // to flux's default palette. Force a single uniform body color so the
    // generic preview is a clean, stylish monochrome R15. Positive prompt does
    // the work (flux ~ignores negatives at CFG≈1, see providers.ts).
    const t2iPrompt = avatarRestylePromptFor(vibe, gender) +
      ' Every body part — arms, hands, legs, torso, neck — is ONE single uniform matte color matching the outfit. Monochrome stylish R15 figure, all limbs the exact same color. NO multicolored arms, NO rainbow Roblox default body colors, NO mismatched limb colors, NO green hands, NO cyan or purple arms.';
    const t2iUrl = await generatePreviewTexture(t2iPrompt, 'roblox', 'character')
      .catch((err: unknown) => { logger.warn('[glowupCompositor] t2i fallback failed', err); return undefined; });
    if (t2iUrl) {
      try {
        const resp = await fetch(t2iUrl, { signal: AbortSignal.timeout(20_000) });
        if (resp.ok) {
          const ab = await resp.arrayBuffer();
          baseImage = await sharp(Buffer.from(ab))
            .resize(PREVIEW_W, PREVIEW_H, { fit: 'cover' })
            .png()
            .toBuffer();
        }
      } catch (err) {
        logger.warn('[glowupCompositor] t2i image download failed', err);
      }
    }
  }

  // Last resort: solid background + plain user avatar (if available).
  if (!baseImage) {
    baseImage = await sharp({
      create: { width: PREVIEW_W, height: PREVIEW_H, channels: 4, background: hexToRgba(PREVIEW_BG_HEX) },
    }).png().toBuffer();
    if (robloxUserId) {
      const avatarBuf = await downloadAvatarThumbnailBuffer({ robloxUserId, size: '720x720', kind: 'full_body' });
      if (avatarBuf) {
        const sized = await sharp(avatarBuf)
          .resize(640, 640, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .png()
          .toBuffer();
        baseImage = await sharp(baseImage)
          .composite([{ input: sized, top: 120, left: Math.floor((PREVIEW_W - 640) / 2) }])
          .png()
          .toBuffer();
      }
    }
  }

  // Title banner + watermark overlays (always added).
  const titleSvg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${PREVIEW_W}" height="60">
      <style>
        .t { font: bold 28px -apple-system, system-ui, sans-serif; fill: #ffffff; text-anchor: middle; }
        .s { font: bold 28px -apple-system, system-ui, sans-serif; fill: #000000; text-anchor: middle; opacity: 0.7; }
      </style>
      <text x="${PREVIEW_W / 2 + 2}" y="40" class="s">${vibe.title}</text>
      <text x="${PREVIEW_W / 2}" y="39" class="t">${vibe.title}</text>
    </svg>
  `);
  const watermarkSvg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="220" height="36">
      <style>
        .wm { font: bold 18px -apple-system, system-ui, sans-serif; fill: #ffffff; opacity: 0.9; }
        .wm-shadow { font: bold 18px -apple-system, system-ui, sans-serif; fill: #000000; opacity: 0.65; }
      </style>
      <text x="3" y="26" class="wm-shadow">✨ Kami Gold</text>
      <text x="2" y="25" class="wm">✨ Kami Gold</text>
    </svg>
  `);
  const finalBuffer = await sharp(baseImage)
    .composite([
      { input: titleSvg, top: 20, left: 0 },
      { input: watermarkSvg, top: PREVIEW_H - 45, left: PREVIEW_W - 230 },
    ])
    .png()
    .toBuffer();
  return { buffer: finalBuffer, fitOnUser };
}

/**
 * Safe wrappers — each individual builder/upload is isolated so a partial
 * failure (e.g. flux-pro down, Storage hiccup on one of four files) doesn't
 * cascade into a full request fail. Missing pieces become solid-color
 * fallbacks; the response always carries 4 URLs.
 */
async function safe<T>(label: string, work: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (err) {
    logger.warn(`[glowupCompositor] ${label} failed; using fallback`, err);
    return fallback();
  }
}

export async function generateGlowup(input: GlowupGenerateInput): Promise<GlowupGenerateResult> {
  const vibe = getGlowupVibe(input.vibeId);

  // Build the 4 PNG buffers in parallel — each isolated by safe() so any
  // single builder failure becomes a solid-color fallback, never throws.
  const [shirtBuf, pantsBuf, decalBuf, preview] = await Promise.all([
    safe('buildShirtPNG', () => buildShirtPNG(vibe), () => solidBuffer(585, 559, vibe.palette.shirtPrimaryHex)),
    safe('buildPantsPNG', () => buildPantsPNG(vibe), () => solidBuffer(585, 559, vibe.palette.pantsPrimaryHex)),
    safe('buildDecalPNG', () => buildDecalPNG(vibe, input.intensity), () => solidBuffer(DECAL_SIZE, DECAL_SIZE, vibe.palette.skinHex)),
    safe('buildPreviewPNG',
      () => buildPreviewPNG(vibe, input.intensity, input.gender, input.robloxUserId),
      async () => ({ buffer: await solidBuffer(PREVIEW_W, PREVIEW_H, vibe.palette.skinHex), fitOnUser: false })),
  ]);

  // Upload to Firebase Storage in parallel — each upload isolated, fallback
  // to a generic placeholder URL if Storage write fails.
  const PLACEHOLDER_URL = 'https://api-z4yzt6dhjq-uc.a.run.app/api/glowup/placeholder.png';
  const [shirtUrl, pantsUrl, decalUrl, previewUrl] = await Promise.all([
    safe('upload shirt',
      () => uploadAndSign({ firebaseUid: input.firebaseUid, vibeId: vibe.id, filename: 'shirt.png', contentType: 'image/png', data: shirtBuf }),
      async () => PLACEHOLDER_URL),
    safe('upload pants',
      () => uploadAndSign({ firebaseUid: input.firebaseUid, vibeId: vibe.id, filename: 'pants.png', contentType: 'image/png', data: pantsBuf }),
      async () => PLACEHOLDER_URL),
    safe('upload decal',
      () => uploadAndSign({ firebaseUid: input.firebaseUid, vibeId: vibe.id, filename: 'decal.png', contentType: 'image/png', data: decalBuf }),
      async () => PLACEHOLDER_URL),
    safe('upload preview',
      () => uploadAndSign({ firebaseUid: input.firebaseUid, vibeId: vibe.id, filename: 'preview.png', contentType: 'image/png', data: preview.buffer }),
      async () => PLACEHOLDER_URL),
  ]);

  return {
    vibeId: vibe.id,
    title: vibe.title,
    pitchEN: vibe.pitchEN,
    pitchRU: vibe.pitchRU,
    pitch: vibe.pitchRU,        // backward-compat: old clients read .pitch
    appStoreHook: vibe.appStoreHook,
    previewUrl,
    fitOnUser: preview.fitOnUser,
    assetPack: { shirtUrl, pantsUrl, decalUrl },
    catalogItems: vibe.catalogAccessories,
    instructionsRU: vibe.instructionsRU,
    instructionsEN: vibe.instructionsEN,
    shareCaptionRU: vibe.shareCaptionRU,
    shareCaptionEN: vibe.shareCaptionEN,
    cost: summarizeVibe(vibe),
    disclaimerEN: DISCLAIMER_EN,
    disclaimerRU: DISCLAIMER_RU,
    disclaimer: DISCLAIMER_RU,  // backward-compat
  };
}
