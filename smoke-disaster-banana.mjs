// smoke-disaster-banana.mjs — run the actual Disaster Spawner Lua prompt
// against Anthropic and dump the resulting .rbxmx to ~/Downloads so the
// user can drag-drop into Studio and see if InsertService:LoadAsset
// branches actually emit (vs. the old Instance.new("Part") yellow ball).
//
// Mirrors disasterGenerator.generateLuaScript():
//   1. lookup bundle for "banana rain apocalypse"
//   2. build prompt with curated assetEntries
//   3. anthropic call (max_tokens 4096)
//   4. extractLuaBlock + sanitize
//   5. wrapGenericScriptAsRbxmx
//
// Standalone — runs locally with the secret pulled via
// `firebase functions:secrets:access`. Does NOT round-trip through the
// production endpoint (no auth needed).

import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

import { buildDisasterLuaPrompt } from './apps/functions/dist/data/disasterStyles.js';
import { findDisasterBundle, bundleHasAssets } from './apps/functions/dist/data/disasterAssetCatalog.js';
import { wrapGenericScriptAsRbxmx } from './apps/functions/dist/uiTemplates.js';

// --- Pull Anthropic key from Firebase secrets ---
const apiKey = execSync(
  'PATH=.local-tools/node-v20.19.2-darwin-arm64/bin:$PATH firebase functions:secrets:access ANTHROPIC_API_KEY --project roblox-ai-generator-v2-2-ios 2>/dev/null',
  { shell: '/bin/bash' }
).toString().trim();
if (!apiKey.startsWith('sk-ant-')) {
  console.error('Failed to fetch ANTHROPIC_API_KEY from Firebase secrets');
  process.exit(1);
}

// --- Build prompt for "banana rain apocalypse" ---
const userPrompt = 'banana rain apocalypse';
const title = 'Banana Rain Apocalypse';
const lookupText = `${title} ${userPrompt}`;
const bundle = findDisasterBundle(lookupText);
const assetEntries = bundleHasAssets(bundle) ? bundle.entries : undefined;
const objectKeyword = bundle?.keyword;

console.log('[smoke] bundle lookup:', {
  matched: !!bundle,
  keyword: objectKeyword,
  curatedAssetCount: assetEntries?.length ?? 0,
  assetIds: assetEntries?.map(e => e.assetId),
});

const prompt = buildDisasterLuaPrompt({
  userPrompt,
  mode: 'meme',
  chaos: 'chaotic',
  size: 'normal',
  frequency: 'normal',
  title,
  assetEntries,
  objectKeyword,
});

console.log('[smoke] prompt length:', prompt.length, 'chars');

// --- Anthropic call (matches runAnthropic in providers.ts) ---
const t0 = Date.now();
const resp = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
  },
  body: JSON.stringify({
    model: 'claude-opus-4-1-20250805',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  }),
});
const json = await resp.json();
console.log('[smoke] anthropic latency:', Date.now() - t0, 'ms');

if (!resp.ok) {
  console.error('[smoke] anthropic error:', json);
  process.exit(2);
}

const text = json.content?.[0]?.text ?? '';
console.log('[smoke] response chars:', text.length);

// --- Extract Lua (mirror disasterGenerator.extractLuaBlock) ---
function extractLuaBlock(t) {
  const m = t.match(/```lua\s*([\s\S]*?)```/i);
  if (m && m[1]) return m[1].trim();
  let s = t.trim().replace(/^```lua\s*\n?/i, '').replace(/^```\s*\n?/, '').replace(/\n?\s*```\s*$/, '').trim();
  if (s.includes('Instance.new(') && s.includes('task.wait')) return s;
  return undefined;
}
const lua = extractLuaBlock(text);
if (!lua) {
  console.error('[smoke] no Lua block extracted — raw response saved');
  writeFileSync('/tmp/disaster-raw.txt', text);
  process.exit(3);
}

// --- Quick verification: does it use InsertService:LoadAsset? ---
const usesInsertService = /InsertService\s*:\s*LoadAsset/.test(lua);
const usesStripScripts = /BaseScript|ModuleScript/.test(lua) && /:Destroy\(\)/.test(lua);
const usesAssetIds = (bundle?.entries ?? []).some(e => lua.includes(String(e.assetId)));
console.log('[smoke] Lua verification:');
console.log('  uses InsertService:LoadAsset →', usesInsertService);
console.log('  strips embedded scripts     →', usesStripScripts);
console.log('  contains curated asset ids  →', usesAssetIds);
console.log('  total lines                 →', lua.split('\n').length);

// --- Wrap as .rbxmx and save to Downloads ---
const scriptName = 'BananaRainApocalypseSmoke';
const rbxmx = wrapGenericScriptAsRbxmx(lua, scriptName, 'ServerScriptService', 'Script');
const outPath = join(homedir(), 'Downloads', `${Date.now()}-${scriptName}.rbxmx`);
writeFileSync(outPath, rbxmx, 'utf8');

const luaPath = join(homedir(), 'Downloads', `${Date.now()}-${scriptName}.lua`);
writeFileSync(luaPath, lua, 'utf8');

console.log('');
console.log('[smoke] saved:');
console.log('  →', outPath);
console.log('  →', luaPath);
