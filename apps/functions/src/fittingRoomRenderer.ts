// fittingRoomRenderer.ts — Zero-Robux UGC Fitting Room (session 386).
//
// Pseudo-3D fitting room. Reuses Outfit Generator's 9 aesthetics (no
// duplicate prompt design) + the Glow-Up img2img pipeline (real user
// avatar via Roblox thumbnail API).
//
// Progressive-loading architecture:
//   POST /start → mints generationId, persists initial doc to Firestore,
//                 spawns async render job in the background, returns immediately.
//   GET /status/:id → reads current Firestore doc.
//                     Renders appear one-by-one as flux completes per angle.
//
// Reuses Outfit Generator metadata (items, cost) by calling assembleOutfit
// directly — fitting room IS a visualization layer over outfits, not a new
// product per user's spec.

import { logger } from 'firebase-functions/v2';
import { getStorage } from 'firebase-admin/storage';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { runFal, generatePreviewTexture } from './providers.js';
import { downloadAvatarThumbnailBuffer, resolveRobloxUsername } from './robloxUserLookup.js';
import { getRobloxUserToken } from './robloxOAuth.js';
import { assembleOutfit, type OutfitItem } from './outfitAssembler.js';
import { CURSED_UGC_STYLES } from './data/cursedUgcCategories.js';  // unused but reserved for later
import { AURA_STYLES } from './data/auraStyles.js';                // unused but reserved for later
import {
  OUTFIT_AESTHETICS,
  type OutfitAestheticId,
  type OutfitGender,
  type OutfitStyleMode,
  type OutfitRemixMode,
} from './data/outfitAesthetics.js';
import {
  FITTING_ANGLES,
  FITTING_ANGLE_ORDER,
  buildFittingPrompt,
  type FittingAngle,
} from './data/fittingRoomAngles.js';

// Silence "unused imports" — CURSED_UGC_STYLES / AURA_STYLES are intentionally
// imported so future revisions can extend fitting room to those vibe pools
// without re-touching outer code.
void CURSED_UGC_STYLES; void AURA_STYLES;

// ─── Storage helpers ───────────────────────────────────────────

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
    try { const c = getStorage().bucket(name); const [ok] = await c.exists(); if (ok) { _bucket = c; return c; } } catch { /* try next */ }
  }
  _bucket = getStorage().bucket(BUCKETS[0]);
  return _bucket;
}

async function uploadSignedPNG(args: { firebaseUid: string; generationId: string; filename: string; buf: Buffer }): Promise<string> {
  const b = await bucket();
  const path = `fitting-room/${args.firebaseUid}/${args.generationId}/${args.filename}`;
  const file = b.file(path);
  await file.save(args.buf, { contentType: 'image/png', resumable: false });
  const [url] = await file.getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
  });
  return url;
}

// ─── Firestore doc ─────────────────────────────────────────────

const COLLECTION = 'fittingRoomGenerations';

interface FittingRoomDoc {
  generationId: string;
  firebaseUid: string;
  aestheticId: OutfitAestheticId;
  gender: OutfitGender;
  style: OutfitStyleMode;
  remix?: OutfitRemixMode;
  robloxUserId?: string;
  fitOnUser: boolean;
  renders: { front?: string; three_quarter?: string; back?: string };
  items: OutfitItem[];
  totalCostRobux: number;
  savedRobux: number;
  title: string;
  pitchEN: string;
  pitchRU: string;
  shareCaption: string;
  appStoreHook: string;
  status: 'pending' | 'partial' | 'ready' | 'failed';
  done: boolean;
  errorCode?: string;
  startedAtMs: number;
  updatedAtMs: number;
}

export async function persistInitialDoc(doc: FittingRoomDoc): Promise<void> {
  try {
    const db = getFirestore();
    await db.collection(COLLECTION).doc(doc.generationId).set({
      ...doc,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    logger.warn('[fittingRoom] initial persist failed', err);
  }
}

async function patchDoc(generationId: string, patch: Partial<FittingRoomDoc>): Promise<void> {
  try {
    const db = getFirestore();
    await db.collection(COLLECTION).doc(generationId).set({
      ...patch,
      updatedAtMs: Date.now(),
    }, { merge: true });
  } catch (err) {
    logger.warn('[fittingRoom] patch failed', { generationId, err });
  }
}

export async function fetchFittingRoomDoc(generationId: string): Promise<FittingRoomDoc | null> {
  try {
    const db = getFirestore();
    const snap = await db.collection(COLLECTION).doc(generationId).get();
    if (!snap.exists) return null;
    return snap.data() as FittingRoomDoc;
  } catch (err) {
    logger.warn('[fittingRoom] fetch failed', { generationId, err });
    return null;
  }
}

// ─── Phase C2 — swap a single slot ───────────────────────────────
//
// Replace the item occupying `slot` with `newItem` in an existing
// generation doc. Recomputes totalCost (sum of remaining items + new)
// and savedRobux (assumed catalog price 8000 R$ - actual). Returns the
// updated doc. Does NOT re-run img2img — the 3D viewer attaches the new
// asset mesh live without a fresh render.

export async function swapFittingRoomSlot(args: {
  generationId: string;
  firebaseUid: string;
  slot: string;
  newItem: OutfitItem;
}): Promise<FittingRoomDoc | null> {
  const { generationId, firebaseUid, slot, newItem } = args;

  const doc = await fetchFittingRoomDoc(generationId);
  if (!doc) return null;
  if (doc.firebaseUid !== firebaseUid) {
    logger.warn('[fittingRoom] swap denied — uid mismatch', { generationId });
    return null;
  }

  const slotLower = slot.toLowerCase();
  const oldItems = Array.isArray(doc.items) ? doc.items : [];
  const updatedItems: OutfitItem[] = [];
  let replaced = false;
  for (const it of oldItems) {
    if (!replaced && it.slot?.toLowerCase() === slotLower) {
      updatedItems.push(newItem);
      replaced = true;
    } else {
      updatedItems.push(it);
    }
  }
  if (!replaced) {
    // Slot wasn't in the doc previously — append.
    updatedItems.push(newItem);
  }

  const totalCost = updatedItems.reduce((s, it) => s + (it.priceRobux ?? 0), 0);
  // Fake "saved" baseline same as initial assembleOutfit (8000 R$).
  const savedRobux = Math.max(0, 8000 - totalCost);

  await patchDoc(generationId, {
    items: updatedItems,
    totalCostRobux: totalCost,
    savedRobux,
  });

  return {
    ...doc,
    items: updatedItems,
    totalCostRobux: totalCost,
    savedRobux,
    updatedAtMs: Date.now(),
  };
}

// ─── img2img per angle ─────────────────────────────────────────

/// Stable 32-bit seed derived from a string (FNV-1a). Same generationId
/// always produces the same seed — so 3 angle renders within ONE
/// generation start from the same noise pattern, which keeps the face /
/// skin tone / body shape consistent across the angles.
function deterministicSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Map to unsigned 32-bit range, then to a safe positive int for fal.
  return (h >>> 0) % 2_147_483_647;
}

async function renderAngle(args: {
  basePrompt: string;
  avatarBuffer: Buffer | null;
  angle: FittingAngle;
  generationId: string;
  /// Per-angle strength: front uses low (0.55) to preserve face from the
  /// raw avatar; 3/4 and back use higher (0.78) because we propagate from
  /// the front render and need flux to rotate the pose.
  strength: number;
}): Promise<Buffer | undefined> {
  const finalPrompt = buildFittingPrompt({ basePrompt: args.basePrompt, angle: args.angle });

  // If we have the user's actual avatar, do img2img (preserves their face/build).
  if (args.avatarBuffer) {
    try {
      const dataUri = `data:image/png;base64,${args.avatarBuffer.toString('base64')}`;
      // Two-stage rendering (user feedback 2026-05-28: «на 3 ракурсах
      // одно и то же, просто меняется надпись на футболке»):
      //   • FRONT: img2img from raw avatar PNG, strength=0.55 → preserves
      //     face / skin / body shape from the user's actual avatar.
      //   • 3/4 + BACK: img2img from the FRONT RENDER (not raw avatar),
      //     strength=0.78 → flux starts from the already-dressed front
      //     view; higher strength + angle prompt rotates the camera.
      // Result: all 3 renders read as the same person in different poses.
      // Per-generation seed (FNV-1a of generationId) anchors the noise
      // pattern across angles for extra consistency.
      const result = await runFal('flux/dev/image-to-image', {
        image_url: dataUri,
        prompt: finalPrompt,
        strength: args.strength,
        num_inference_steps: 28,
        guidance_scale: 4.5,
        seed: deterministicSeed(args.generationId),
        num_images: 1,
        enable_safety_checker: true,
      });
      const url = result.outputUrl;
      if (!url) return undefined;
      const r = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      if (!r.ok) return undefined;
      return Buffer.from(await r.arrayBuffer());
    } catch (err) {
      logger.warn('[fittingRoom] img2img failed; falling through to t2i', { angle: args.angle, err: err instanceof Error ? err.message : String(err) });
    }
  }

  // Fallback: text-to-image (no user avatar context — generic mannequin).
  try {
    const url = await generatePreviewTexture(finalPrompt, 'roblox', 'character');
    if (!url) return undefined;
    const r = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!r.ok) return undefined;
    return Buffer.from(await r.arrayBuffer());
  } catch (err) {
    logger.warn('[fittingRoom] t2i fallback failed', { angle: args.angle, err: err instanceof Error ? err.message : String(err) });
    return undefined;
  }
}

// ─── Public entry: kick off async render job ────────────────────

export interface FittingRoomStartInput {
  aestheticId: OutfitAestheticId;
  gender: OutfitGender;
  style: OutfitStyleMode;
  remix?: OutfitRemixMode;
  robloxUsername?: string;
  firebaseUid: string;
}

export interface FittingRoomStartResult {
  generationId: string;
}

export async function startFittingRoomJob(input: FittingRoomStartInput): Promise<FittingRoomStartResult> {
  const generationId = `fit_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const aesthetic = OUTFIT_AESTHETICS[input.aestheticId];

  // Persist initial doc immediately so iOS can start polling.
  const initial: FittingRoomDoc = {
    generationId,
    firebaseUid: input.firebaseUid,
    aestheticId: input.aestheticId,
    gender: input.gender,
    style: input.style,
    remix: input.remix,
    fitOnUser: false,
    renders: {},
    items: [],
    totalCostRobux: 0,
    savedRobux: 0,
    title: aesthetic.title,
    pitchEN: aesthetic.pitchEN,
    pitchRU: aesthetic.pitchRU,
    shareCaption: aesthetic.captionSeedsEN[0] ?? `${aesthetic.title} fit`,
    appStoreHook: aesthetic.appStoreHook,
    status: 'pending',
    done: false,
    startedAtMs: Date.now(),
    updatedAtMs: Date.now(),
  };
  await persistInitialDoc(initial);

  // Fire-and-forget: kick off the actual render. We don't await this so the
  // POST handler returns immediately and iOS can begin polling.
  void runFittingRoomJob(input, generationId).catch((err) => {
    logger.error('[fittingRoom] render job threw', { generationId, err });
    void patchDoc(generationId, { status: 'failed', done: true, errorCode: err instanceof Error ? err.message.slice(0, 200) : 'unknown' });
  });

  return { generationId };
}

async function runFittingRoomJob(input: FittingRoomStartInput, generationId: string): Promise<void> {
  const aesthetic = OUTFIT_AESTHETICS[input.aestheticId];

  // 1) Resolve robloxUserId (OAuth-first, username fallback).
  let robloxUserId: string | undefined;
  try {
    const tok = await getRobloxUserToken(input.firebaseUid);
    if (tok?.robloxUserId) robloxUserId = tok.robloxUserId;
  } catch (err) {
    logger.warn('[fittingRoom] oauth lookup non-fatal', err);
  }
  if (!robloxUserId && input.robloxUsername) {
    const resolved = await resolveRobloxUsername(input.robloxUsername);
    if (resolved) robloxUserId = resolved.robloxUserId;
  }

  // 2) Download user's avatar PNG (or null → t2i fallback).
  let avatarBuffer: Buffer | null = null;
  if (robloxUserId) {
    avatarBuffer = await downloadAvatarThumbnailBuffer({ robloxUserId, size: '720x720', kind: 'full_body' });
  }
  const fitOnUser = !!avatarBuffer;

  // 3) Outfit items + cost — reuse assembleOutfit (same Outfit Generator code path).
  const outfitResultPromise = assembleOutfit({
    aestheticId: input.aestheticId,
    gender: input.gender,
    style: input.style,
    remix: input.remix,
  });

  // 4) For each angle, run img2img sequentially-but-progressively.
  // Two-stage: front from raw avatar (low strength = face preserved);
  // 3/4 and back use the FRONT render as input (higher strength rotates
  // the camera while keeping the face). See renderAngle for the why.
  const basePrompt = `A Roblox blocky avatar in the "${aesthetic.title}" aesthetic. ${aesthetic.pitchEN}`;

  let frontBuffer: Buffer | null = null;
  for (const angle of FITTING_ANGLE_ORDER) {
    const isFront = angle === 'front';
    const inputBuf = isFront ? avatarBuffer : (frontBuffer ?? avatarBuffer);
    const buf = await renderAngle({
      basePrompt,
      avatarBuffer: inputBuf,
      angle,
      generationId,
      strength: isFront ? 0.55 : 0.78,
    });
    if (!buf) continue;
    if (isFront) frontBuffer = buf;
    try {
      const url = await uploadSignedPNG({
        firebaseUid: input.firebaseUid,
        generationId,
        filename: `${angle}.png`,
        buf,
      });
      await patchDoc(generationId, {
        renders: { ...(await fetchFittingRoomDoc(generationId))?.renders, [angle]: url },
        status: 'partial',
        fitOnUser,
      });
    } catch (err) {
      logger.warn('[fittingRoom] angle upload failed', { angle, err: err instanceof Error ? err.message : String(err) });
    }
  }

  // 5) Wait for outfit items to finish + merge into final doc.
  const outfit = await outfitResultPromise;
  await patchDoc(generationId, {
    items: outfit.items,
    totalCostRobux: outfit.totalCostRobux,
    savedRobux: outfit.savedRobux,
    title: outfit.title,
    shareCaption: outfit.captionEN,
    status: 'ready',
    done: true,
    fitOnUser,
    robloxUserId,
  });
}
