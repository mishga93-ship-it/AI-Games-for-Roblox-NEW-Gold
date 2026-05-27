// smoke-disaster-spawner.mjs — End-to-end real backend test (session 387).
//
// Hits POST /api/disaster-spawner/generate in prod, validates the response
// shape, downloads every preview URL + the .rbxmx, asserts that the Lua
// script passes the safety regex (no HttpService / RemoteEvent / loadstring /
// bare while-true).
//
// Run AFTER deploy: `firebase deploy --only functions:api`.
//
// Usage: node smoke-disaster-spawner.mjs

import admin from 'firebase-admin';
import fs from 'node:fs/promises';

const SA_PATH = '/tmp/glowup-test-sa.json';
const WEB_API_KEY = 'AIzaSyCxofmZDOiMbcrtSUZnBcngDmIAsqa3Osc';
const API_BASE = 'https://api-z4yzt6dhjq-uc.a.run.app';
const TEST_UID = `disaster-e2e-${Date.now()}`;
const SAVE_DIR = '/tmp/disaster-e2e';

let fails = 0;
function check(label, cond, detail = '') {
  if (cond) console.log(`✅ ${label}`);
  else { console.log(`❌ ${label}${detail ? ' — ' + detail : ''}`); fails++; }
}

const LUA_BANNED = [
  /HttpService/i,
  /MarketplaceService/i,
  /MessagingService/i,
  /DataStoreService/i,
  /loadstring/i,
  /HttpGet/i,
  /os\.execute/i,
  /\bRemoteEvent\b/i,
  /\bRemoteFunction\b/i,
  /\bBindableEvent\b/i,
  /require\s*\(\s*\d+/,
  /while\s+true\s+do\s*end/,
];

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

  // 3. Hit /api/disaster-spawner/generate for each of 4 modes
  const cases = [
    { mode: 'funny',  prompt: 'spawn giant rubber ducks every 45 seconds', chaos: 'chaotic',    size: 'huge',   frequency: 'normal' },
    { mode: 'horror', prompt: 'shadow zombies rise from the floor at midnight', chaos: 'impossible', size: 'normal', frequency: 'constant' },
    { mode: 'meme',   prompt: 'rain skibidi toilets from the sky',           chaos: 'chaotic',    size: 'small',  frequency: 'rare' },
    { mode: 'sigma',  prompt: 'gigachad spawn drops and lifts gym weights',  chaos: 'balanced',   size: 'normal', frequency: 'normal' },
  ];

  for (const c of cases) {
    console.log(`\n=== mode=${c.mode} | chaos=${c.chaos} ===`);
    const started = Date.now();
    const resp = await fetch(`${API_BASE}/api/disaster-spawner/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify({ ...c, inputMode: 'text' }),
    });
    const elapsed = Date.now() - started;
    const text = await resp.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { _raw: text.slice(0, 500) }; }

    check(`${c.mode}: HTTP 200 (got ${resp.status} in ${elapsed}ms)`, resp.status === 200, text.slice(0, 200));
    if (resp.status !== 200) continue;

    check(`${c.mode}: generationId starts with "dis_"`, /^dis_[0-9a-z]+_[0-9a-z]+$/.test(json.generationId), json.generationId);
    check(`${c.mode}: mode echoed`, json.mode === c.mode, json.mode);
    check(`${c.mode}: difficulty is one of Easy/Medium/Hard/Impossible`, ['Easy', 'Medium', 'Hard', 'Impossible'].includes(json.difficulty), json.difficulty);
    check(`${c.mode}: titleEN non-empty`, typeof json.titleEN === 'string' && json.titleEN.length > 0, json.titleEN);
    check(`${c.mode}: titleRU non-empty`, typeof json.titleRU === 'string' && json.titleRU.length > 0, json.titleRU);
    check(`${c.mode}: rarityVibeEN non-empty`, typeof json.rarityVibeEN === 'string' && json.rarityVibeEN.length > 0, json.rarityVibeEN);
    check(`${c.mode}: recommendedPlayers non-empty`, typeof json.recommendedPlayers === 'string' && json.recommendedPlayers.length > 0, json.recommendedPlayers);

    // Safety: Lua script
    const lua = String(json.luaScript ?? '');
    check(`${c.mode}: luaScript present (${lua.length} chars)`, lua.length > 50);
    check(`${c.mode}: Lua mentions task.wait`, /task\.wait/.test(lua));
    check(`${c.mode}: Lua mentions Instance.new or workspace`, /Instance\.new|workspace\./.test(lua));
    const banned = LUA_BANNED.filter((re) => re.test(lua));
    check(`${c.mode}: Lua passes sanitizer`, banned.length === 0, `rejected: ${banned.map(String).join(', ')}`);

    // Status
    check(`${c.mode}: generationStatus is ready or partial`, ['ready', 'partial'].includes(json.generationStatus), json.generationStatus);

    // Hero preview
    if (json.previewUrl) {
      const r = await fetch(json.previewUrl, { method: 'HEAD' });
      check(`${c.mode}: previewUrl HEAD 200`, r.status === 200, `status=${r.status}`);
    } else {
      console.log(`⚠️ ${c.mode}: no previewUrl (LLM flux fail — accept if generationStatus=partial)`);
    }

    // RBXMX
    if (json.rbxmxUrl) {
      const r = await fetch(json.rbxmxUrl);
      const txt = await r.text();
      check(`${c.mode}: rbxmxUrl GET 200`, r.status === 200, `status=${r.status}`);
      check(`${c.mode}: rbxmx contains <roblox tag`, /<roblox/.test(txt));
      check(`${c.mode}: rbxmx contains Script class`, /class="Script"/i.test(txt) || /<Script>/.test(txt));
      await fs.writeFile(`${SAVE_DIR}/${c.mode}.rbxmx`, txt);
    } else {
      check(`${c.mode}: rbxmxUrl present`, false, 'rbxmxUrl missing');
    }

    // Instructions
    check(`${c.mode}: instructionsEN array non-empty`, Array.isArray(json.instructionsEN) && json.instructionsEN.length > 0);
    check(`${c.mode}: instructionsRU array non-empty`, Array.isArray(json.instructionsRU) && json.instructionsRU.length > 0);

    // Save the Lua too
    await fs.writeFile(`${SAVE_DIR}/${c.mode}.lua`, lua);
    console.log(`→ saved /tmp/disaster-e2e/${c.mode}.{lua,rbxmx}`);
  }

  console.log(`\n=== Summary: ${fails} failure(s) ===`);
  process.exit(fails > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('FATAL', err);
  process.exit(1);
});
