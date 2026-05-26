// glowupIpRateLimit.ts — per-IP cooldown for the heavy Glow-Up endpoints
// (session 382 Phase 2).
//
// The existing per-firebaseUid limit in glowupRateLimit.ts catches a
// signed-in user mashing the button. This module catches the OTHER vector:
//   • a TikTok raid pointing 10000 IPs at /api/glowup/generate
//   • a bot trying to scrape signed Storage URLs by spamming variations
//   • a single rogue IP cycling stolen Firebase tokens
//
// In-memory ringbuffer (matches the per-IP middleware pattern already in
// index.ts at line ~261). Process-local — survives function warm restarts
// but resets on cold start. Good enough for cooldown; Firestore-level
// abuse tracking is the user-level guard.
//
// Cap: 10 requests per 60-second window per IP per endpoint key.

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 10;

interface BucketState {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, BucketState>();

export interface IpRateLimitVerdict {
  allowed: boolean;
  retryAfterMs?: number;
  remaining: number;
}

/**
 * Check + consume one slot for (ip, endpointKey). endpointKey lets us
 * keep distinct buckets per endpoint ("/glowup/generate", "/glowup/upload",
 * "/glowup/event") so an analytics-event flood doesn't lock out generation
 * for the same IP.
 */
export function checkIpRateLimit(ip: string, endpointKey: string): IpRateLimitVerdict {
  const now = Date.now();
  const key = `${endpointKey}|${ip}`;
  const current = buckets.get(key);

  if (!current || now >= current.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, remaining: MAX_REQUESTS - 1 };
  }
  if (current.count >= MAX_REQUESTS) {
    return {
      allowed: false,
      retryAfterMs: Math.max(0, current.resetAt - now),
      remaining: 0,
    };
  }
  current.count += 1;
  return { allowed: true, remaining: MAX_REQUESTS - current.count };
}

/**
 * Best-effort IP extraction. Cloud Run sets x-forwarded-for; first hop is
 * the original client IP. Falls back to req.ip if forwarded-for missing.
 */
export function extractClientIp(req: { headers: Record<string, string | string[] | undefined>; ip?: string }): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) {
    const first = fwd.split(',')[0].trim();
    if (first) return first;
  }
  return req.ip ?? 'unknown';
}
