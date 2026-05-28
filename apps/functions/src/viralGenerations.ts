// viralGenerations.ts — unified Firestore persistence for the fire-and-forget
// viral features (Outfit, Glowup, CursedUGC, VoiceAura, DisasterSpawner).
//
// Background: Round-5 user feedback —
//   «нельзя посмотреть историю генераций — эти генерации не попадают в общую
//    историю»
//
// Before this module, each viral endpoint returned its result JSON to the
// client and forgot about it. Close the sheet → result gone. There was no
// Library / Recent screen to come back to it, no Firestore record to fetch
// later. FittingRoom was the only one that already persisted, but in its
// own private collection.
//
// This module exposes the minimum needed to unify recents:
//
//   recordViralGeneration(args) → fire-and-forget Firestore write
//   listViralGenerations(uid, limit) → user's recent items (newest first)
//
// Each endpoint calls recordViralGeneration AFTER it has the result, so any
// failure to write Firestore does NOT block the response to the user (the
// generation already succeeded; persistence is best-effort).

import { logger } from 'firebase-functions/v2';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const COLLECTION = 'viralGenerations';

export type ViralKind =
  | 'disaster_spawner'
  | 'voice_aura'
  | 'cursed_ugc'
  | 'fitting_room'
  | 'outfit'
  | 'glowup';

export interface RecordViralGenerationArgs {
  firebaseUid: string;
  kind: ViralKind;
  /** Stable id returned to the client (e.g. `dis_xxx`, `fit_xxx`, `aura_xxx`).
   * Used as the Firestore doc id so duplicate writes from retries are idempotent. */
  generationId: string;
  /** Short display title for the list cell (e.g. "Banana Rain Apocalypse"). */
  title: string;
  /** Optional subtitle (caption, rarity, savings, etc.) shown under the title. */
  subtitle?: string;
  /** Best thumbnail URL — used in the list grid cell. */
  thumbnailUrl?: string;
  /** Optional accent hex (e.g. mode/vibe color) for cell highlight. */
  accentHex?: string;
  /** The full original result payload, so a future Detail view can re-render
   * everything without a re-generation. Keep this small (Firestore doc cap
   * 1 MiB) — strip embedded base64 before passing. */
  payload: Record<string, unknown>;
}

export async function recordViralGeneration(args: RecordViralGenerationArgs): Promise<void> {
  if (!args.firebaseUid || !args.generationId) {
    logger.warn('[viralGenerations] skip — missing uid or generationId', {
      uid: args.firebaseUid, kind: args.kind, generationId: args.generationId,
    });
    return;
  }
  try {
    const db = getFirestore();
    await db.collection(COLLECTION).doc(args.generationId).set({
      firebaseUid: args.firebaseUid,
      kind: args.kind,
      generationId: args.generationId,
      title: args.title.slice(0, 120),
      subtitle: args.subtitle ? args.subtitle.slice(0, 200) : null,
      thumbnailUrl: args.thumbnailUrl ?? null,
      accentHex: args.accentHex ?? null,
      payload: args.payload,
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: false });
  } catch (err) {
    // Best-effort — never fail the user-facing response on a persistence error.
    logger.warn('[viralGenerations] record failed', {
      kind: args.kind,
      generationId: args.generationId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export interface ViralGenerationListItem {
  generationId: string;
  kind: ViralKind;
  title: string;
  subtitle: string | null;
  thumbnailUrl: string | null;
  accentHex: string | null;
  createdAtMs: number;
}

/**
 * Newest viral generations for a user, capped at `limit` (default 50, max 200).
 * Caller already authenticated the request — we only filter by `firebaseUid`.
 */
export async function listViralGenerations(
  firebaseUid: string,
  limit = 50,
): Promise<ViralGenerationListItem[]> {
  const safeLimit = Math.max(1, Math.min(limit, 200));
  const db = getFirestore();
  const snap = await db.collection(COLLECTION)
    .where('firebaseUid', '==', firebaseUid)
    .orderBy('createdAt', 'desc')
    .limit(safeLimit)
    .get();

  return snap.docs.map((doc) => {
    const d = doc.data();
    const createdAt = d.createdAt;
    // Firestore Timestamp → ms (fall back to 0 if pending serverTimestamp).
    const createdAtMs = createdAt && typeof createdAt.toMillis === 'function'
      ? createdAt.toMillis()
      : 0;
    return {
      generationId: String(d.generationId ?? doc.id),
      kind: d.kind as ViralKind,
      title: String(d.title ?? ''),
      subtitle: typeof d.subtitle === 'string' ? d.subtitle : null,
      thumbnailUrl: typeof d.thumbnailUrl === 'string' ? d.thumbnailUrl : null,
      accentHex: typeof d.accentHex === 'string' ? d.accentHex : null,
      createdAtMs,
    };
  });
}

/** Detail fetch for a single generation, used when the user taps a cell. */
export async function fetchViralGeneration(
  firebaseUid: string,
  generationId: string,
): Promise<({ payload: Record<string, unknown> } & ViralGenerationListItem) | null> {
  const db = getFirestore();
  const snap = await db.collection(COLLECTION).doc(generationId).get();
  if (!snap.exists) return null;
  const d = snap.data() ?? {};
  if (d.firebaseUid !== firebaseUid) return null; // forbidden — pretend 404
  const createdAt = d.createdAt;
  const createdAtMs = createdAt && typeof createdAt.toMillis === 'function'
    ? createdAt.toMillis()
    : 0;
  return {
    generationId: String(d.generationId ?? snap.id),
    kind: d.kind as ViralKind,
    title: String(d.title ?? ''),
    subtitle: typeof d.subtitle === 'string' ? d.subtitle : null,
    thumbnailUrl: typeof d.thumbnailUrl === 'string' ? d.thumbnailUrl : null,
    accentHex: typeof d.accentHex === 'string' ? d.accentHex : null,
    createdAtMs,
    payload: (d.payload ?? {}) as Record<string, unknown>,
  };
}
