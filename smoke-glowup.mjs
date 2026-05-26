// Smoke test for Avatar Glow-Up Studio (session 382 Phase 2).
//
// Tests the dist modules directly — vibe data integrity, summary math,
// username resolver shape (no real Roblox API call), vibe enumeration.
//
// Does NOT call generateGlowup() because that hits Firebase Storage which
// needs proper credentials. Real e2e probe happens after deploy via curl.

import { getGlowupVibe, listGlowupVibes, isGlowupVibeId, summarizeVibe, hexToRgbText } from './apps/functions/dist/data/glowupVibes.js';
import { computeGlowupCacheKey } from './apps/functions/dist/glowupCache.js';
import { parseGlowupEventType } from './apps/functions/dist/glowupAnalytics.js';
import { mintGlowupGenerationId, isGlowupGenerationId } from './apps/functions/dist/glowupGenerationId.js';
import { checkIpRateLimit } from './apps/functions/dist/glowupIpRateLimit.js';

let failures = 0;
function check(label, cond, detail = '') {
  if (cond) console.log(`✅ ${label}`);
  else { console.log(`❌ ${label}${detail ? ` — ${detail}` : ''}`); failures++; }
}

// Vibe enumeration
const vibes = listGlowupVibes();
check(`listGlowupVibes returns 4 vibes`, vibes.length === 4, `got ${vibes.length}`);
const expectedIds = ['headless_shadow', 'korblox_style', 'void', 'sigma'];
for (const id of expectedIds) {
  check(`isGlowupVibeId("${id}") = true`, isGlowupVibeId(id));
  const v = getGlowupVibe(id);
  check(`getGlowupVibe("${id}") returns vibe with matching id`, v.id === id);
  check(`vibe "${id}" has non-empty title`, typeof v.title === 'string' && v.title.length > 0);
  check(`vibe "${id}" has non-empty pitch`, typeof v.pitch === 'string' && v.pitch.length > 0);
  check(`vibe "${id}" has appStoreHook`, typeof v.appStoreHook === 'string' && v.appStoreHook.length > 0);
  check(`vibe "${id}" has decalPrompt >= 60 chars`, v.decalPrompt.length >= 60, `got ${v.decalPrompt.length}`);
  check(`vibe "${id}" has palette.skinHex (6-char hex)`, /^[0-9A-Fa-f]{6}$/.test(v.palette.skinHex));
  check(`vibe "${id}" has palette.shirtPrimaryHex`, /^[0-9A-Fa-f]{6}$/.test(v.palette.shirtPrimaryHex));
  check(`vibe "${id}" body.headPercent in [0,100]`, v.body.headPercent >= 0 && v.body.headPercent <= 100);
  check(`vibe "${id}" has >= 1 catalogAccessory`, v.catalogAccessories.length >= 1);
  check(`vibe "${id}" has >= 4 instructionsRU`, v.instructionsRU.length >= 4);
  check(`vibe "${id}" has >= 4 instructionsEN`, v.instructionsEN.length >= 4);
  check(`vibe "${id}" instructionsRU and EN same length`, v.instructionsRU.length === v.instructionsEN.length);
  check(`vibe "${id}" shareCaptionRU non-empty`, v.shareCaptionRU.length > 0);
  check(`vibe "${id}" imitatedRetailRobux > 0`, v.imitatedRetailRobux > 0);
  const summary = summarizeVibe(v);
  check(`vibe "${id}" summary.savedRobux > 0 (positive savings)`, summary.savedRobux > 0, `got ${summary.savedRobux}`);
  check(`vibe "${id}" summary.uploadFeesRobux = 20 (shirt+pants 10R$ each)`, summary.uploadFeesRobux === 20);
}

// isGlowupVibeId negative cases
check(`isGlowupVibeId("garbage") = false`, !isGlowupVibeId('garbage'));
check(`isGlowupVibeId(null) = false`, !isGlowupVibeId(null));
check(`isGlowupVibeId(42) = false`, !isGlowupVibeId(42));

// hexToRgbText helper
check(`hexToRgbText("FF0000") = "RGB 255, 0, 0"`, hexToRgbText('FF0000') === 'RGB 255, 0, 0');
check(`hexToRgbText("000000") = "RGB 0, 0, 0"`, hexToRgbText('000000') === 'RGB 0, 0, 0');

// Headless-specific: head must be tiny (≤10%)
const headless = getGlowupVibe('headless_shadow');
check(`headless_shadow body.headPercent <= 10`, headless.body.headPercent <= 10, `got ${headless.body.headPercent}`);

// Korblox-specific: pants must have differential accent color
const korblox = getGlowupVibe('korblox_style');
check(`korblox_style palette has pantsAccentHex`, typeof korblox.palette.pantsAccentHex === 'string');

// Void-specific: all body colors basically black
const voidVibe = getGlowupVibe('void');
check(`void.palette.skinHex starts with 0A or similar dark`, voidVibe.palette.skinHex.toLowerCase().startsWith('0a'));

// Cache key determinism
const k1 = computeGlowupCacheKey({ vibeId: 'headless_shadow', gender: 'boys', intensity: 'clean' });
const k2 = computeGlowupCacheKey({ vibeId: 'headless_shadow', gender: 'boys', intensity: 'clean' });
const k3 = computeGlowupCacheKey({ vibeId: 'headless_shadow', gender: 'girls', intensity: 'clean' });
const k4 = computeGlowupCacheKey({ vibeId: 'headless_shadow', gender: 'boys', intensity: 'clean', robloxUserId: '12345' });
check(`computeGlowupCacheKey deterministic (same input → same key)`, k1 === k2);
check(`computeGlowupCacheKey differs on gender`, k1 !== k3);
check(`computeGlowupCacheKey differs on robloxUserId`, k1 !== k4);
check(`computeGlowupCacheKey returns 24-char hex`, /^[0-9a-f]{24}$/.test(k1));

// Analytics event-type parser
const validEvents = ['vibe_selected', 'generation_started', 'generation_success', 'generation_cached', 'generation_failed', 'upload_clicked', 'upload_success', 'upload_failed', 'share_clicked'];
for (const t of validEvents) {
  check(`parseGlowupEventType("${t}") accepted`, parseGlowupEventType(t) === t);
}
check(`parseGlowupEventType("garbage") rejected`, parseGlowupEventType('garbage') === null);
check(`parseGlowupEventType(null) rejected`, parseGlowupEventType(null) === null);
check(`parseGlowupEventType(undefined) rejected`, parseGlowupEventType(undefined) === null);

// Generation IDs
const id1 = mintGlowupGenerationId();
const id2 = mintGlowupGenerationId();
check(`mintGlowupGenerationId returns "glowup_" prefix + 8 chars`, /^glowup_[0-9a-z]{8}$/.test(id1));
check(`mintGlowupGenerationId returns unique IDs across calls`, id1 !== id2);
check(`isGlowupGenerationId accepts minted ID`, isGlowupGenerationId(id1));
check(`isGlowupGenerationId rejects "glowup_short"`, !isGlowupGenerationId('glowup_short'));
check(`isGlowupGenerationId rejects "foo_12345678"`, !isGlowupGenerationId('foo_12345678'));
check(`isGlowupGenerationId rejects ""`, !isGlowupGenerationId(''));
check(`isGlowupGenerationId rejects null`, !isGlowupGenerationId(null));

// Per-IP rate limit
const ip = `test-${Date.now()}`;
let allowedCount = 0;
let blocked = false;
for (let i = 0; i < 12; i++) {
  const v = checkIpRateLimit(ip, '/test-endpoint');
  if (v.allowed) allowedCount++;
  else { blocked = true; break; }
}
check(`checkIpRateLimit allows first 10 requests`, allowedCount === 10, `got ${allowedCount}`);
check(`checkIpRateLimit blocks 11th request`, blocked);
// Different endpoint bucket — should still allow
const v2 = checkIpRateLimit(ip, '/different-endpoint');
check(`checkIpRateLimit isolates by endpoint key`, v2.allowed);
// Different IP, same endpoint — should allow
const v3 = checkIpRateLimit(`${ip}-other`, '/test-endpoint');
check(`checkIpRateLimit isolates by IP`, v3.allowed);

if (failures > 0) {
  console.error(`\n❌ ${failures} check(s) failed`);
  process.exit(1);
}
console.log(`\n✅ All glow-up checks passed (${vibes.length} vibes verified)`);
