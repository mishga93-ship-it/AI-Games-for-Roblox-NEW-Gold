import { Router } from 'express';
import crypto from 'crypto';

export const socialRouter = Router();

socialRouter.get('/catalog', (_req, res) => {
  res.json({ items: [] });
});

// Session #179: One-Tap TikTok Gameplay Exporter referral deeplink generator.
// Returns a short ai.gold/r/<hash> link plus a UTM-tagged Roblox URL the iOS
// client bakes into the clip watermark. The redirector at ai.gold/r/<hash> is
// not yet implemented — for MVP the iOS client uses the `roblox` field directly,
// and a future tracker service will resolve `<hash>` → roblox URL via Firestore.
const ALLOWED_SOURCES = ['tiktok', 'reels', 'shorts', 'youtube', 'instagram'] as const;
type ClipSource = typeof ALLOWED_SOURCES[number];

socialRouter.post('/clips/deeplink', (req, res) => {
  const body = (req.body ?? {}) as { gameId?: unknown; placeId?: unknown; source?: unknown };
  const gameId = typeof body.gameId === 'string' ? body.gameId.trim() : '';
  const placeId = typeof body.placeId === 'string' ? body.placeId.trim() : gameId;
  const source = typeof body.source === 'string' && (ALLOWED_SOURCES as readonly string[]).includes(body.source)
    ? (body.source as ClipSource)
    : 'tiktok';

  if (!gameId) {
    res.status(400).json({ error: 'gameId required' });
    return;
  }

  const hash = crypto.createHash('sha1').update(`${gameId}|${source}`).digest('base64url').slice(0, 8);
  const robloxBase = placeId
    ? `https://www.roblox.com/games/${encodeURIComponent(placeId)}`
    : 'https://www.roblox.com/discover';
  const robloxUrl = `${robloxBase}?utm_source=${source}&utm_campaign=ugc&utm_medium=clip&utm_content=${hash}`;

  res.json({
    url: `https://ai.gold/r/${hash}`,
    roblox: robloxUrl,
    short: hash,
    source,
  });
});
