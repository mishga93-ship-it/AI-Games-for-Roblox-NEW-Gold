// glowupRateLimit.ts — per-user Firestore-backed rate limit for the Glow-Up
// Studio (session 382 Phase 2).
//
// Glow-up generation involves paid flux-pro calls + Firebase Storage writes
// — must guard against accidental loops or abuse. In-memory per-IP limit
// from index.ts catches scrapers, but we need a per-user limit too so a
// single signed-in user can't burn $20 in flux calls by mashing the button.
//
// Two windows: 10/hour and 50/day. First failed window blocks.
//
// Storage: collection `glowupRateLimits/{firebaseUid}` — single doc per
// user with two sliding counters. Cheap: 1 read + 1 write per generate.

import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';

const COLLECTION = 'glowupRateLimits';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const RATE_HOURLY_MAX = 10;
export const RATE_DAILY_MAX = 50;

interface RateLimitDoc {
  hourlyCount: number;
  hourlyResetAt: number;
  dailyCount: number;
  dailyResetAt: number;
}

export interface RateLimitVerdict {
  allowed: boolean;
  reason?: 'hourly' | 'daily';
  retryAfterMs?: number;
  hourlyRemaining: number;
  dailyRemaining: number;
}

export async function checkAndConsumeGlowupRateLimit(firebaseUid: string): Promise<RateLimitVerdict> {
  const db = getFirestore();
  const ref = db.collection(COLLECTION).doc(firebaseUid);
  const now = Date.now();

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    let doc: RateLimitDoc = snap.exists
      ? (snap.data() as RateLimitDoc)
      : { hourlyCount: 0, hourlyResetAt: now + HOUR_MS, dailyCount: 0, dailyResetAt: now + DAY_MS };

    // Reset expired windows.
    if (now >= doc.hourlyResetAt) {
      doc.hourlyCount = 0;
      doc.hourlyResetAt = now + HOUR_MS;
    }
    if (now >= doc.dailyResetAt) {
      doc.dailyCount = 0;
      doc.dailyResetAt = now + DAY_MS;
    }

    // Check caps BEFORE incrementing.
    if (doc.hourlyCount >= RATE_HOURLY_MAX) {
      return {
        allowed: false,
        reason: 'hourly',
        retryAfterMs: Math.max(0, doc.hourlyResetAt - now),
        hourlyRemaining: 0,
        dailyRemaining: Math.max(0, RATE_DAILY_MAX - doc.dailyCount),
      } satisfies RateLimitVerdict;
    }
    if (doc.dailyCount >= RATE_DAILY_MAX) {
      return {
        allowed: false,
        reason: 'daily',
        retryAfterMs: Math.max(0, doc.dailyResetAt - now),
        hourlyRemaining: Math.max(0, RATE_HOURLY_MAX - doc.hourlyCount),
        dailyRemaining: 0,
      } satisfies RateLimitVerdict;
    }

    // Consume.
    doc.hourlyCount += 1;
    doc.dailyCount += 1;
    tx.set(ref, doc);

    return {
      allowed: true,
      hourlyRemaining: RATE_HOURLY_MAX - doc.hourlyCount,
      dailyRemaining: RATE_DAILY_MAX - doc.dailyCount,
    } satisfies RateLimitVerdict;
  }).catch((err) => {
    // On Firestore error, fail open (allow) — we'd rather over-serve than
    // 500 on every glow-up because of a Firestore hiccup. Logged for ops.
    logger.warn('[glowupRateLimit] transaction failed; failing open', err);
    return {
      allowed: true,
      hourlyRemaining: RATE_HOURLY_MAX,
      dailyRemaining: RATE_DAILY_MAX,
    } satisfies RateLimitVerdict;
  });
}
