// smoke-glowup-e2e.mjs — End-to-end real backend test (session 382 Phase 2).
//
// Mints a Firebase custom token via firebase-admin, exchanges it for an
// ID token via Identity Toolkit, then hits the deployed /api/glowup/generate
// in prod. Validates the response shape + downloads every URL in the asset
// pack + asserts they're valid PNGs.

import admin from 'firebase-admin';
import fs from 'node:fs/promises';

const SA_PATH = '/tmp/glowup-test-sa.json';
const WEB_API_KEY = 'AIzaSyCxofmZDOiMbcrtSUZnBcngDmIAsqa3Osc';
const API_BASE = 'https://api-z4yzt6dhjq-uc.a.run.app';
const TEST_UID = `glowup-e2e-${Date.now()}`;
const SAVE_DIR = '/tmp/glowup-e2e';

let fails = 0;
function check(label, cond, detail = '') {
  if (cond) console.log(`✅ ${label}`);
  else { console.log(`❌ ${label}${detail ? ' — ' + detail : ''}`); fails++; }
}

async function main() {
  await fs.mkdir(SAVE_DIR, { recursive: true });

  // 1. Init Firebase admin + mint custom token
  const sa = JSON.parse(await fs.readFile(SA_PATH, 'utf8'));
  admin.initializeApp({ credential: admin.credential.cert(sa) });
  const customToken = await admin.auth().createCustomToken(TEST_UID);
  console.log(`→ minted custom token for uid=${TEST_UID}`);

  // 2. Exchange for ID token
  const exchangeResp = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${WEB_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    }
  );
  const exchangeJson = await exchangeResp.json();
  check('identityToolkit exchange returned idToken', !!exchangeJson.idToken, JSON.stringify(exchangeJson).slice(0, 200));
  const idToken = exchangeJson.idToken;
  if (!idToken) { console.error('cannot continue without ID token'); process.exit(1); }
  console.log(`→ got ID token (${idToken.length} chars)`);

  // 3. Hit /api/glowup/generate for each of 4 vibes
  const vibes = ['headless_shadow', 'korblox_style', 'void', 'sigma'];
  const results = {};

  for (const vibeId of vibes) {
    console.log(`\n=== Vibe: ${vibeId} ===`);
    const started = Date.now();
    const resp = await fetch(`${API_BASE}/api/glowup/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        vibeId,
        gender: 'neutral',
        intensity: 'clean',
        // Unique per-run username to bust the 6-day Firestore cache (we
        // want REAL generation paths exercised, not last-week's cached URLs).
        robloxUsername: `E2E_${Date.now()}_${vibeId}`,
        autoUploadDecal: false,
      }),
    });
    const elapsed = Date.now() - started;
    const text = await resp.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { _raw: text.slice(0, 500) }; }

    check(`${vibeId}: HTTP 200 (got ${resp.status} in ${elapsed}ms)`, resp.status === 200, text.slice(0, 200));
    if (resp.status !== 200) continue;

    check(`${vibeId}: generationId starts with "glowup_"`, /^glowup_[0-9a-z]{8}$/.test(json.generationId), json.generationId);
    check(`${vibeId}: generationStatus = "ready"`, json.generationStatus === 'ready');
    check(`${vibeId}: vibeId in response matches`, json.vibeId === vibeId);
    check(`${vibeId}: title non-empty`, typeof json.title === 'string' && json.title.length > 0);
    check(`${vibeId}: pitch non-empty`, typeof json.pitch === 'string' && json.pitch.length > 0);
    check(`${vibeId}: assetPack has shirtUrl/pantsUrl/decalUrl`,
      typeof json.assetPack?.shirtUrl === 'string' &&
      typeof json.assetPack?.pantsUrl === 'string' &&
      typeof json.assetPack?.decalUrl === 'string');
    check(`${vibeId}: previewUrl non-empty`, typeof json.previewUrl === 'string' && json.previewUrl.length > 0);
    check(`${vibeId}: fitOnUser is boolean`, typeof json.fitOnUser === 'boolean');
    check(`${vibeId}: cost.savedRobux > 0`, json.cost?.savedRobux > 0, `got ${json.cost?.savedRobux}`);
    check(`${vibeId}: instructionsRU >= 4`, Array.isArray(json.instructionsRU) && json.instructionsRU.length >= 4);
    check(`${vibeId}: catalogItems >= 1`, Array.isArray(json.catalogItems) && json.catalogItems.length >= 1);
    check(`${vibeId}: rateLimit present`, json.rateLimit?.hourlyRemaining >= 0);
    check(`${vibeId}: cached field is boolean`, typeof json.cached === 'boolean');

    // 4. Download all 4 PNGs + verify magic bytes
    const urls = {
      preview: json.previewUrl,
      shirt: json.assetPack.shirtUrl,
      pants: json.assetPack.pantsUrl,
      decal: json.assetPack.decalUrl,
    };
    for (const [kind, url] of Object.entries(urls)) {
      try {
        const dl = await fetch(url, { signal: AbortSignal.timeout(20000) });
        check(`${vibeId} ${kind}: download HTTP 200`, dl.ok, `HTTP ${dl.status}`);
        if (!dl.ok) continue;
        const buf = Buffer.from(await dl.arrayBuffer());
        const isPng = buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
        check(`${vibeId} ${kind}: valid PNG magic bytes (${buf.length} bytes)`, isPng);
        const savePath = `${SAVE_DIR}/${vibeId}-${kind}.png`;
        await fs.writeFile(savePath, buf);
        console.log(`   saved → ${savePath} (${(buf.length / 1024).toFixed(1)} KB)`);
      } catch (err) {
        check(`${vibeId} ${kind}: download succeeded`, false, err.message);
      }
    }

    results[vibeId] = json;
  }

  // 5. Cache hit test — request the same vibe again, expect cached=true
  console.log('\n=== Cache hit test ===');
  // First, prime the cache with a known input
  const cacheUsername = `CacheTest_${Date.now()}`;
  await fetch(`${API_BASE}/api/glowup/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
    body: JSON.stringify({ vibeId: 'headless_shadow', gender: 'neutral', intensity: 'clean', robloxUsername: cacheUsername }),
  });
  // Now hit it again — expect cached=true
  const cacheResp = await fetch(`${API_BASE}/api/glowup/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      vibeId: 'headless_shadow',
      gender: 'neutral',
      intensity: 'clean',
      robloxUsername: cacheUsername,
    }),
  });
  const cacheJson = await cacheResp.json();
  check('cache 2nd request returns cached=true', cacheJson.cached === true);
  check('cache 2nd request returns same generationId domain', /^glowup_[0-9a-z]{8}$/.test(cacheJson.generationId));

  // 6. Validation error test
  console.log('\n=== Validation test ===');
  const badResp = await fetch(`${API_BASE}/api/glowup/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
    body: JSON.stringify({ vibeId: 'made_up' }),
  });
  check('invalid vibeId returns 400', badResp.status === 400, `got ${badResp.status}`);

  // Summary
  console.log(`\nSaved all PNGs to ${SAVE_DIR}/`);
  if (fails > 0) { console.error(`\n❌ ${fails} check(s) failed`); process.exit(1); }
  console.log('\n✅ E2E all checks passed');
  process.exit(0);
}

main().catch((err) => {
  console.error('e2e test threw:', err);
  process.exit(1);
});
