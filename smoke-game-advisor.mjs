// Session 429 (Release 4 / Phase 3) smoke: advisors over structure-JSON.
// Compiles gameAdvisor.ts on the fly and exercises the REAL helpers:
//   (1) template library lookups
//   (2) summarizeGameStructure on synthetic inputs (signal detection)
//   (3) analyzeGameHeuristics contrast (bare obby vs monetized sim)
//   (4) adviseMonetizationHeuristic (genre plan + signal-aware notes + clamps)
//   (5) prompt builders produce grounded strings
//   (6) parsers: fenced JSON, drop-bad, price clamp
//   (7) INTEGRATION: build a real .rbxl with DataStore/Marketplace/leaderstats
//       in a script -> analyze --deep -> summarizeGameStructure detects signals.
// Run: node smoke-game-advisor.mjs
import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const LUNE = './.local-tools/lune/lune';
const ANALYZE = './apps/worker-service/runtime/lune/analyze_roblox.luau';
const dir = mkdtempSync(join(tmpdir(), 'advisor-'));
let fails = 0;
function check(label, cond, detail) {
  if (cond) {
    console.log(`  PASS ${label}`);
  } else {
    console.log(`  FAIL ${label}${detail ? ' :: ' + detail : ''}`);
    fails++;
  }
}

// ── compile gameAdvisor.ts -> tmp ESM ────────────────────────────────────────
const pdir = join(dir, 'pkg');
mkdirSync(pdir, { recursive: true });
writeFileSync(join(pdir, 'package.json'), JSON.stringify({ type: 'module' }));
let A = null;
try {
  execFileSync(
    'npx',
    ['--no-install', 'tsc', '--module', 'nodenext', '--moduleResolution', 'nodenext', '--target', 'es2022', '--skipLibCheck', '--outDir', pdir, 'src/gameAdvisor.ts'],
    { cwd: join(process.cwd(), 'apps/functions'), encoding: 'utf8' },
  );
  A = await import(pathToFileURL(join(pdir, 'gameAdvisor.js')).href);
  check('gameAdvisor compiles + imports', !!A && typeof A.summarizeGameStructure === 'function');
} catch (e) {
  check('gameAdvisor compiles + imports', false, `${e.stdout || ''}${e.stderr || ''}${e.message || ''}`);
  console.log('\n1 FAIL');
  process.exit(1);
}

// ── 1. template library ──────────────────────────────────────────────────────
console.log('=== template library ===');
check('lists 4 starters', A.listStarterTemplates().length === 4);
check('filters by genre', A.listStarterTemplates('obby').some((t) => t.id === 'obby_starter'));
check('getStarterTemplate(rpg)', A.getStarterTemplate('rpg_starter')?.genre === 'rpg');

// ── 2-4. structure summary + heuristics ──────────────────────────────────────
console.log('=== structure summary + heuristics ===');
const bareObby = {
  totalInstances: 30,
  classCounts: { Part: 25, SpawnLocation: 1, Script: 1 },
  tree: [
    { className: 'SpawnLocation', name: 'Spawn' },
    { className: 'Script', name: 'Killer', source: 'local p = workspace.Lava\np.Touched:Connect(function(h) h.Parent.Humanoid.Health = 0 end)' },
    { className: 'Part', name: 'Lava' },
  ],
};
const monetizedSim = {
  totalInstances: 120,
  classCounts: { Part: 80, Script: 2, Humanoid: 3, SpawnLocation: 1, ProximityPrompt: 2 },
  tree: [
    { className: 'SpawnLocation', name: 'Spawn' },
    { className: 'Script', name: 'Economy', source: "local DataStoreService = game:GetService('DataStoreService')\nlocal mps = game:GetService('MarketplaceService')\n-- leaderstats setup\nmps.ProcessReceipt = function(i) end\nlocal owns = mps:UserOwnsGamePassAsync(0, 0)" },
  ],
};

const sObby = A.summarizeGameStructure(bareObby);
const sSim = A.summarizeGameStructure(monetizedSim);
check('obby: spawn detected', sObby.signals.hasSpawnLocation === true);
check('obby: killbrick detected', sObby.signals.hasKillBrick === true);
check('obby: no datastore/leaderstats/marketplace', !sObby.signals.hasDataStore && !sObby.signals.hasLeaderstats && !sObby.signals.hasMarketplace);
check('sim: datastore detected', sSim.signals.hasDataStore === true);
check('sim: marketplace + devproduct + gamepass detected', sSim.signals.hasMarketplace && sSim.signals.hasDevProduct && sSim.signals.hasGamepassCheck);
check('sim: leaderstats detected (from source comment)', sSim.signals.hasLeaderstats === true);
check('sim: npcCount=3', sSim.npcCount === 3);

const hObby = A.analyzeGameHeuristics(sObby);
const hSim = A.analyzeGameHeuristics(sSim);
const hasHigh = (list, kw) => list.some((x) => x.severity === 'high' && (x.title + x.detail).toLowerCase().includes(kw));
check('obby: high "no monetization surface"', hasHigh(hObby, 'monetization'));
check('obby: high "no data persistence"', hasHigh(hObby, 'persistence') || hasHigh(hObby, 'datastore'));
check('sim: NO high monetization-surface item', !hasHigh(hSim, 'no monetization surface'.toLowerCase()) && !hSim.some((x) => x.severity === 'high' && x.category === 'monetization'));

// ── monetization advisor ─────────────────────────────────────────────────────
console.log('=== monetization advisor ===');
const planSim = A.adviseMonetizationHeuristic(sSim, 'simulator');
const planObby = A.adviseMonetizationHeuristic(sObby, 'obby');
check('sim plan has gamepass + devproduct', planSim.items.some((i) => i.kind === 'gamepass') && planSim.items.some((i) => i.kind === 'devproduct'));
check('all prices within [25,1500]', [...planSim.items, ...planObby.items].every((i) => i.priceRobux >= 25 && i.priceRobux <= 1500));
check('obby (no datastore) -> CRITICAL persist note', planObby.notes.some((n) => n.toLowerCase().includes('datastore')));
check('sim (has datastore) -> no CRITICAL persist note', !planSim.notes.some((n) => n.startsWith('CRITICAL')));

// ── prompt builders ──────────────────────────────────────────────────────────
console.log('=== prompts ===');
const analystPrompt = A.buildGameAnalystPrompt(sObby, 'My first obby, want more players');
check('analyst prompt embeds heuristics + goals', analystPrompt.includes('HEURISTIC FINDINGS') && analystPrompt.includes('first obby'));
const monPrompt = A.buildMonetizationPrompt(sSim, 'simulator');
check('monetization prompt embeds baseline + genre', monPrompt.includes('HEURISTIC BASELINE') && monPrompt.toLowerCase().includes('simulator'));

// ── parsers ──────────────────────────────────────────────────────────────────
console.log('=== parsers ===');
const sugg = A.parseSuggestionsResponse('```json\n{"suggestions":[{"category":"economy","severity":"medium","title":"t","detail":"d"},{"category":"BAD","severity":"low","title":"x","detail":"y"}]}\n```');
check('suggestions: 1 kept, 1 dropped', sugg.suggestions.length === 1 && sugg.dropped.length === 1);
const mon = A.parseMonetizationResponse('{"items":[{"kind":"gamepass","name":"Cheap","priceRobux":5},{"kind":"bad","name":"X","priceRobux":50}],"notes":["hi"]}');
check('monetization parse: bad kind dropped, price clamped to 25', mon.items.length === 1 && mon.items[0].priceRobux === 25);

// ── 7. INTEGRATION: real analyze --deep -> summarizeGameStructure ────────────
console.log('=== integration (real analyze deep) ===');
const fixtureScript = join(dir, 'place.luau');
writeFileSync(fixtureScript, `
local fs = require("@lune/fs")
local process = require("@lune/process")
local roblox = require("@lune/roblox")
local outPath = process.args[1]
local game = roblox.Instance.new("DataModel")
local ws = roblox.Instance.new("Workspace"); ws.Parent = game
local spawn = roblox.Instance.new("SpawnLocation"); spawn.Name = "Spawn"; spawn.Parent = ws
local sss = roblox.Instance.new("ServerScriptService"); sss.Parent = game
local econ = roblox.Instance.new("Script"); econ.Name = "Economy"
econ.Source = "local DataStoreService = game:GetService('DataStoreService')\\nlocal mps = game:GetService('MarketplaceService')\\nlocal leaderstats = Instance.new('Folder')\\nmps.ProcessReceipt = function(i) end"
econ.Parent = sss
fs.writeFile(outPath, roblox.serializePlace(game))
print("OK")
`);
const place = join(dir, 'place.rbxl');
let intOk = true;
try {
  execFileSync(LUNE, ['run', fixtureScript, place], { encoding: 'utf8' });
} catch (e) {
  intOk = false;
  check('place fixture built', false, `${e.stdout || ''}${e.stderr || ''}${e.message || ''}`);
}
if (intOk) {
  const outJson = join(dir, 'deep.json');
  try {
    execFileSync(LUNE, ['run', ANALYZE, place, outJson, 'place', 'deep'], { encoding: 'utf8' });
    const analysis = JSON.parse(readFileSync(outJson, 'utf8'));
    const real = A.summarizeGameStructure(analysis);
    check('real: hasDataStore', real.signals.hasDataStore === true, JSON.stringify(real.signals));
    check('real: hasMarketplace + hasDevProduct', real.signals.hasMarketplace && real.signals.hasDevProduct);
    check('real: hasLeaderstats', real.signals.hasLeaderstats === true);
    check('real: hasSpawnLocation', real.signals.hasSpawnLocation === true);
    check('real: scriptCount>=1', real.scriptCount >= 1, `scriptCount=${real.scriptCount}`);
  } catch (e) {
    check('analyze deep + summarize', false, `${e.stdout || ''}${e.stderr || ''}${e.message || ''}`);
  }
}

// ── generation manifest self-check (changelog-432) ──────────────────────────
console.log('=== generation manifest self-check ===');
const bareManifest = {
  scene: [{ className: 'SpawnLocation', name: 'Spawn' }, { className: 'Part', name: 'Lava' }],
  scripts: [{ scriptType: 'Script', name: 'Kill', source: 'x.Humanoid.Health = 0' }],
};
const richManifest = {
  scene: [{ className: 'SpawnLocation', name: 'Spawn' }, { className: 'Part', name: 'Floor' }],
  scripts: [{ scriptType: 'Script', name: 'Econ', source: "local DSS = game:GetService('DataStoreService')\nlocal mps = game:GetService('MarketplaceService')\n-- leaderstats\nmps.ProcessReceipt = function(i) end" }],
};
const qaBare = A.qaCheckGeneratedManifest(bareManifest);
const qaRich = A.qaCheckGeneratedManifest(richManifest);
check('manifest summarize: bare has spawn', qaBare.signals.hasSpawnLocation === true);
check('manifest QA: bare flags high data-persistence + monetization',
  qaBare.issues.some((i) => i.severity === 'high' && /persist|datastore/i.test(i.title + i.detail)) &&
  qaBare.issues.some((i) => i.severity === 'high' && i.category === 'monetization'));
check('manifest QA: rich detects datastore + marketplace', qaRich.signals.hasDataStore && qaRich.signals.hasMarketplace);
check('manifest QA: rich has NO high monetization-surface issue',
  !qaRich.issues.some((i) => i.severity === 'high' && i.category === 'monetization'));

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAIL`);
process.exit(fails === 0 ? 0 : 1);
