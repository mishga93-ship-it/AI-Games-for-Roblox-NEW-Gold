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
import { generatePreviewTexture } from './providers.js';
import { compositeShirtTemplate, compositePantsTemplate } from './clothingCompositor.js';
import { downloadAvatarThumbnailBuffer } from './robloxUserLookup.js';
import { getGlowupVibe, summarizeVibe, type GlowupVibe, type GlowupVibeId, type GlowupGender, type GlowupIntensity } from './data/glowupVibes.js';

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
  disclaimer: string;
}

export interface GlowupGenerateInput {
  vibeId: GlowupVibeId;
  gender: GlowupGender;
  intensity: GlowupIntensity;
  robloxUserId?: string;          // when present, use real avatar in preview
  firebaseUid: string;            // for storage path scoping
}

const DISCLAIMER = 'Это креативная иллюзия из официальных бесплатных и дешёвых Catalog-аксессуаров. Это не настоящие Headless Horseman или Korblox Deathspeaker, и мы не обходим платёжную систему Roblox.';

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
  const [signedUrl] = await file.getSignedUrl({
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
 * Build a composite preview PNG (768×1024). When robloxUserId is provided,
 * we download their current Roblox avatar thumbnail and paste it onto a
 * vibe-tinted background; otherwise we generate a generic vibe scene.
 */
async function buildPreviewPNG(vibe: GlowupVibe, robloxUserId?: string): Promise<{ buffer: Buffer; fitOnUser: boolean }> {
  const bg = await sharp({
    create: {
      width: PREVIEW_W,
      height: PREVIEW_H,
      channels: 4,
      background: hexToRgba(vibe.palette.skinHex),
    },
  }).png().toBuffer();

  let avatarBuf: Buffer | null = null;
  let fitOnUser = false;
  if (robloxUserId) {
    avatarBuf = await downloadAvatarThumbnailBuffer({ robloxUserId, size: '720x720', kind: 'full_body' });
    if (avatarBuf) fitOnUser = true;
  }

  // Watermark SVG: small bottom-right "Kami Gold ✨"
  const watermarkSvg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="220" height="36">
      <style>
        .wm { font: bold 18px -apple-system, system-ui, sans-serif; fill: #ffffff; opacity: 0.85; }
        .wm-shadow { font: bold 18px -apple-system, system-ui, sans-serif; fill: #000000; opacity: 0.5; }
      </style>
      <text x="3" y="26" class="wm-shadow">✨ Kami Gold</text>
      <text x="2" y="25" class="wm">✨ Kami Gold</text>
    </svg>
  `);

  // Vibe-id banner SVG: top centered
  const titleSvg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${PREVIEW_W}" height="60">
      <style>
        .t { font: bold 28px -apple-system, system-ui, sans-serif; fill: #ffffff; text-anchor: middle; }
        .s { font: bold 28px -apple-system, system-ui, sans-serif; fill: #000000; text-anchor: middle; opacity: 0.6; }
      </style>
      <text x="${PREVIEW_W / 2 + 1}" y="40" class="s">${vibe.title}</text>
      <text x="${PREVIEW_W / 2}" y="39" class="t">${vibe.title}</text>
    </svg>
  `);

  const overlays: sharp.OverlayOptions[] = [];
  overlays.push({ input: titleSvg, top: 20, left: 0 });
  if (avatarBuf) {
    // Resize Roblox avatar (720×720 typical) to fit centered in preview.
    const sized = await sharp(avatarBuf).resize(640, 640, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    overlays.push({ input: sized, top: 120, left: Math.floor((PREVIEW_W - 640) / 2) });
  }
  overlays.push({ input: watermarkSvg, top: PREVIEW_H - 45, left: PREVIEW_W - 230 });

  const buffer = await sharp(bg).composite(overlays).png().toBuffer();
  return { buffer, fitOnUser };
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
      () => buildPreviewPNG(vibe, input.robloxUserId),
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
    pitch: vibe.pitch,
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
    disclaimer: DISCLAIMER,
  };
}
