// glowupGenerationId.ts — short unique generation IDs + Firestore persistence
// for the Avatar Glow-Up Studio (session 382 Phase 2).
//
// Each call to /api/glowup/generate is stamped with a short ID
// (e.g. "glowup_3k9a7q2x"). The full result + metadata is persisted to
// Firestore collection `glowupGenerations/{generationId}` so:
//   • iOS can retry/re-fetch a known generation by ID without re-running
//     flux-pro and re-uploading 4 PNGs
//   • shares carry the generation ID — "glowup.studio/g/3k9a7q2x"
//     deep-link in TikTok captions
//   • analytics events join cleanly on generationId
//   • abuse tracking: count generations per user, per hour, per ID prefix
//   • debugging: paste the ID into ops logs and find the exact run
//
// IDs are URL-safe (base36 → 8 chars), random, NOT sequential, NOT
// guessable. 36^8 ≈ 3 trillion — collision-safe.

import { randomBytes } from 'node:crypto';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import type { GlowupGenerateResult } from './glowupCompositor.js';
import type { GlowupGender, GlowupIntensity, GlowupVibeId } from './data/glowupVibes.js';

const COLLECTION = 'glowupGenerations';
const ID_PREFIX = 'glowup_';
const ID_BODY_LEN = 8;

/** "glowup_3k9a7q2x" — 8-char base36 random. */
export function mintGlowupGenerationId(): string {
  // 6 bytes → 4.7×10^14 distinct values, encoded base36 → ~10 chars.
  // Slice to 8 for a tidy URL-friendly ID.
  const bytes = randomBytes(6);
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  const body = n.toString(36).padStart(ID_BODY_LEN, '0').slice(-ID_BODY_LEN);
  return `${ID_PREFIX}${body}`;
}

export function isGlowupGenerationId(value: unknown): value is string {
  return typeof value === 'string' && /^glowup_[0-9a-z]{8}$/.test(value);
}

export interface PersistedGeneration {
  generationId: string;
  firebaseUid: string;
  vibeId: GlowupVibeId;
  gender: GlowupGender;
  intensity: GlowupIntensity;
  robloxUserId?: string;
  fromCache: boolean;
  result: GlowupGenerateResult;
  decalAssetId?: string;
  status: 'ready' | 'failed';
  errorCode?: string;
  createdAtMs: number;
}

export async function persistGlowupGeneration(record: PersistedGeneration): Promise<void> {
  try {
    const db = getFirestore();
    // Strip the createdAtMs we set client-side; use serverTimestamp for ordering.
    const { createdAtMs: _ignored, ...rest } = record;
    await db.collection(COLLECTION).doc(record.generationId).set({
      ...rest,
      createdAt: FieldValue.serverTimestamp(),
      createdAtMs: record.createdAtMs,
    });
  } catch (err) {
    // Persistence is best-effort. Don't fail the request because Firestore
    // is slow — the generationId still exists in the response payload.
    logger.warn('[glowupGenerationId] persist failed (non-fatal)', { generationId: record.generationId, err });
  }
}

export async function fetchPersistedGeneration(generationId: string): Promise<PersistedGeneration | null> {
  try {
    const db = getFirestore();
    const snap = await db.collection(COLLECTION).doc(generationId).get();
    if (!snap.exists) return null;
    return snap.data() as PersistedGeneration;
  } catch (err) {
    logger.warn('[glowupGenerationId] fetch failed', { generationId, err });
    return null;
  }
}
