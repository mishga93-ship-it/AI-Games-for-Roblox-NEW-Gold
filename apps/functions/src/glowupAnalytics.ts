// glowupAnalytics.ts — fire-and-forget event log for the Avatar Glow-Up
// Studio (session 382 Phase 2). Saves growth analytics when traffic ramps.
//
// Event types tracked (per user brief):
//   vibe_selected      — user tapped a vibe card in the picker (client)
//   generation_started — backend kicked off /api/glowup/generate
//   generation_success — full asset pack returned to client
//   generation_cached  — hit the cache (no flux-pro spend)
//   generation_failed  — error before returning result
//   upload_clicked     — user tapped "Auto-upload Decal" (client)
//   upload_success     — Open Cloud /assets returned an assetId
//   upload_failed      — Open Cloud or auth failed
//   share_clicked      — user tapped "Share to TikTok" (client)
//
// Stored in collection `glowupEvents` with TTL via Firestore lifecycle
// (set up separately if needed — for now we just log forever, ~100 bytes
// per event so cheap until major scale).

import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';

const COLLECTION = 'glowupEvents';

export type GlowupEventType =
  | 'vibe_selected'
  | 'generation_started'
  | 'generation_success'
  | 'generation_cached'
  | 'generation_failed'
  | 'upload_clicked'
  | 'upload_success'
  | 'upload_failed'
  | 'share_clicked';

export interface GlowupEvent {
  type: GlowupEventType;
  firebaseUid: string;
  vibeId?: string;
  gender?: string;
  intensity?: string;
  fitOnUser?: boolean;
  errorCode?: string;
  // free-form blob for client-passed payload (limit to ~1 KB).
  meta?: Record<string, string | number | boolean | null>;
}

/**
 * Fire-and-forget event recording. Never throws to the caller — the cost
 * of dropping an analytics row is always less than failing a generate
 * because Firestore was slow.
 */
export function recordGlowupEvent(event: GlowupEvent): void {
  void (async () => {
    try {
      const db = getFirestore();
      await db.collection(COLLECTION).add({
        ...event,
        createdAt: FieldValue.serverTimestamp(),
      });
    } catch (err) {
      logger.warn('[glowupAnalytics] event write failed (non-fatal)', { type: event.type, err });
    }
  })();
}

const VALID_TYPES: ReadonlySet<GlowupEventType> = new Set([
  'vibe_selected',
  'generation_started',
  'generation_success',
  'generation_cached',
  'generation_failed',
  'upload_clicked',
  'upload_success',
  'upload_failed',
  'share_clicked',
]);

export function parseGlowupEventType(raw: unknown): GlowupEventType | null {
  return typeof raw === 'string' && VALID_TYPES.has(raw as GlowupEventType)
    ? raw as GlowupEventType
    : null;
}
