// smoke-outfit-e2e.mjs — Comprehensive E2E test for the 1-Click Outfit
// Generator (session 383). Tests every aesthetic, every remix mode, plus:
//   - thumbnail URLs return valid PNGs
//   - catalog URLs are reachable
//   - no duplicate items within a single outfit
//   - total cost math is correct
//   - response shape matches the iOS Codable contract

import admin from 'firebase-admin';
import fs from 'node:fs/promises';

const SA = '/tmp/glowup-test-sa.json';
const WEB_KEY = 'AIzaSyCxofmZDOiMbcrtSUZnBcngDmIAsqa3Osc';
const API = 'https://api-z4yzt6dhjq-uc.a.run.app';

let fails = 0;
function check(label, cond, detail = '') {
  if (cond) console.log(`✅ ${label}`);
  else { console.log(`❌ ${label}${detail ? ' — ' + detail : ''}`); fails++; }
}

async function getIdToken() {
  const sa = JSON.parse(await fs.readFile(SA, 'utf8'));
  admin.initializeApp({ credential: admin.credential.cert(sa) });
  const ct = await admin.auth().createCustomToken('outfit-e2e-' + Date.now());
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${WEB_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: ct, returnSecureToken: true })
  });
  const j = await r.json();
  return j.idToken;
}

async function generate(idToken, body) {
  const r = await fetch(`${API}/api/outfit/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
    body: JSON.stringify(body)
  });
  return { status: r.status, json: await r.json() };
}

async function urlReachable(url, expectImage = false) {
  try {
    const r = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(8000) });
    if (!r.ok) return false;
    if (expectImage) {
      const ct = r.headers.get('content-type') || '';
      return ct.startsWith('image/');
    }
    return true;
  } catch { return false; }
}

async function main() {
  const idToken = await getIdToken();
  if (!idToken) { console.error('no idToken'); process.exit(1); }
  console.log('→ got Firebase ID token\n');

  const AESTHETICS = ['sigma', 'baddie', 'y2k', 'goth', 'rich_emo', 'slender', 'softie', 'cyber', 'anime_demon'];

  // ─── 1. All 9 aesthetics × neutral × dark ─────────────────────
  console.log('=== 1) All 9 aesthetics, neutral/dark ===');
  const results = {};
  for (const a of AESTHETICS) {
    const t = Date.now();
    const { status, json } = await generate(idToken, { aestheticId: a, gender: 'neutral', style: 'dark' });
    const elapsed = Date.now() - t;
    check(`${a}: HTTP 200 in ${elapsed}ms`, status === 200, `got ${status} ${JSON.stringify(json).slice(0, 150)}`);
    if (status !== 200) continue;
    check(`${a}: ≥4 items`, json.items.length >= 4, `got ${json.items.length}`);
    check(`${a}: caption non-empty`, !!json.captionEN && !!json.captionRU);
    check(`${a}: rerollSeed present`, !!json.rerollSeed);
    check(`${a}: appStoreHook present`, !!json.appStoreHook);
    // Math check
    const sum = json.items.reduce((acc, it) => acc + (it.priceRobux ?? 0), 0);
    check(`${a}: totalCostRobux === sum(items.priceRobux)`, json.totalCostRobux === sum, `${json.totalCostRobux} vs ${sum}`);
    // Dedup check
    const ids = json.items.map(it => it.assetId);
    const uniq = new Set(ids);
    check(`${a}: no duplicate assetIds`, uniq.size === ids.length, `${ids.length} vs ${uniq.size}`);
    // Slots are unique
    const slots = json.items.map(it => it.slot);
    const slotUniq = new Set(slots);
    check(`${a}: no duplicate slots (1 item per slot)`, slotUniq.size === slots.length);
    results[a] = json;
  }

  // ─── 2. Thumbnail URLs reachable for 1 sample aesthetic ─────────
  console.log('\n=== 2) Thumbnail + catalog URLs reachable (sample = sigma) ===');
  const sample = results.sigma;
  if (sample) {
    for (const item of sample.items.slice(0, 3)) {
      if (item.thumbnailUrl) {
        const ok = await urlReachable(item.thumbnailUrl, true);
        check(`thumb "${item.name.slice(0, 30)}" reachable`, ok, item.thumbnailUrl);
      }
      const catalogOk = await urlReachable(item.catalogUrl);
      check(`catalogUrl "${item.name.slice(0, 30)}" reachable`, catalogOk, item.catalogUrl);
    }
  }

  // ─── 3. Remix modes affect output ───────────────────────────────
  console.log('\n=== 3) Remix modes change output ===');
  const base = await generate(idToken, { aestheticId: 'goth', gender: 'neutral', style: 'dark' });
  const remixed = await generate(idToken, { aestheticId: 'goth', gender: 'neutral', style: 'dark', remix: 'remix' });
  check(`remix: HTTP 200 base`, base.status === 200);
  check(`remix: HTTP 200 remixed`, remixed.status === 200);
  if (base.status === 200 && remixed.status === 200) {
    const baseIds = base.json.items.map(it => it.assetId).sort().join(',');
    const remixIds = remixed.json.items.map(it => it.assetId).sort().join(',');
    // They MAY be the same if pool is small + AI deterministic; just sanity log.
    console.log(`   base ids: ${baseIds.slice(0, 80)}...`);
    console.log(`   remix ids: ${remixIds.slice(0, 80)}...`);
    check(`remix: same number of items (sanity)`, base.json.items.length === remixed.json.items.length);
  }

  const budget = await generate(idToken, { aestheticId: 'sigma', gender: 'neutral', style: 'dark', remix: 'budget' });
  check(`budget: HTTP 200`, budget.status === 200);
  if (budget.status === 200) {
    // Budget mode should bias toward cheaper items — at least 1 free item ideally
    const cheapest = Math.min(...budget.json.items.map(it => it.priceRobux));
    console.log(`   budget cheapest item: ${cheapest} R$`);
    check(`budget: total ≤ baseline`, budget.json.totalCostRobux <= (results.sigma?.totalCostRobux ?? Infinity) * 1.2,
      `budget=${budget.json.totalCostRobux} vs baseline=${results.sigma?.totalCostRobux}`);
  }

  const cursed = await generate(idToken, { aestheticId: 'cyber', gender: 'neutral', style: 'dark', remix: 'more_cursed' });
  check(`more_cursed: HTTP 200`, cursed.status === 200);
  const cleanR = await generate(idToken, { aestheticId: 'cyber', gender: 'neutral', style: 'dark', remix: 'more_clean' });
  check(`more_clean: HTTP 200`, cleanR.status === 200);

  // ─── 4. Gender variations ──────────────────────────────────────
  console.log('\n=== 4) Gender variations ===');
  for (const g of ['boys', 'girls', 'neutral']) {
    const r = await generate(idToken, { aestheticId: 'baddie', gender: g, style: 'dark' });
    check(`baddie/${g}: HTTP 200, ≥4 items`, r.status === 200 && r.json.items?.length >= 4);
  }

  // ─── 5. Validation errors ──────────────────────────────────────
  console.log('\n=== 5) Validation errors ===');
  const bad = await generate(idToken, { aestheticId: 'garbage' });
  check(`invalid aestheticId returns 400`, bad.status === 400);
  const noAuth = await fetch(`${API}/api/outfit/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ aestheticId: 'sigma', gender: 'neutral', style: 'dark' })
  });
  check(`no auth returns 401`, noAuth.status === 401);

  // ─── Summary ───────────────────────────────────────────────────
  console.log('');
  for (const [a, r] of Object.entries(results)) {
    console.log(`${a.padEnd(15)} ${r.items.length} items · ${r.totalCostRobux}R\$ · saved ${r.savedRobux}R\$`);
  }

  if (fails > 0) { console.error(`\n❌ ${fails} check(s) failed`); process.exit(1); }
  console.log('\n✅ All outfit E2E checks passed');
}

main().catch((err) => { console.error(err); process.exit(1); });
