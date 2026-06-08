// Session 428 (Release 4 / Phase 2) smoke: scoped round-trip edit of a .rbxl PLACE.
// Proves the place flow end-to-end with the REAL Lune scripts + the REAL
// rbxmEditPipeline helpers (compiled on the fly):
//   (1) analyze_roblox.luau and apply_edits.luau compile.
//   (2) build a fixture PLACE (Workspace > Town{House,Road} + Arena{ArenaFloor};
//       ServerScriptService > TownManager script).
//   (3) analyze `outline` -> pickScopeHeuristic("...town...") picks the Town model.
//   (4) analyze `deep scope:ref:<Town>` -> ONLY the Town subtree (Arena excluded).
//   (5) apply ops over the WHOLE place (global refs): recolor House, resize Road,
//       rewrite TownManager (ref from outline), add a Part to Town.
//   (6) re-analyze deep (whole place) -> assert Town changed, Arena untouched,
//       script rewritten, new part present, place still round-trips.
// Run: node smoke-rbxl-edit.mjs
import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const LUNE = './.local-tools/lune/lune';
const CHECK = './.local-tools/check-luau.luau';
const ANALYZE = './apps/worker-service/runtime/lune/analyze_roblox.luau';
const APPLY = './apps/worker-service/runtime/lune/apply_edits.luau';

const dir = mkdtempSync(join(tmpdir(), 'rbxledit-'));
let fails = 0;
function check(label, cond, detail) {
  if (cond) {
    console.log(`  PASS ${label}`);
  } else {
    console.log(`  FAIL ${label}${detail ? ' :: ' + detail : ''}`);
    fails++;
  }
}
function runLune(args) {
  try {
    return { ok: true, out: execFileSync(LUNE, ['run', ...args], { encoding: 'utf8' }) };
  } catch (e) {
    return { ok: false, out: `${e.stdout || ''}${e.stderr || ''}${e.message || ''}` };
  }
}

// ── 1. compile checks ────────────────────────────────────────────────────────
console.log('=== compile checks ===');
for (const [name, p] of [['analyze_roblox', ANALYZE], ['apply_edits', APPLY]]) {
  const res = runLune([CHECK, p]);
  check(`compile ${name}`, res.ok && res.out.includes('COMPILE_OK'), res.out.trim());
}

// ── 2. compile rbxmEditPipeline.ts -> tmp ESM, import the real helpers ────────
const pdir = join(dir, 'pkg');
mkdirSync(pdir, { recursive: true });
writeFileSync(join(pdir, 'package.json'), JSON.stringify({ type: 'module' }));
let pipe = null;
try {
  execFileSync(
    'npx',
    ['--no-install', 'tsc', '--module', 'nodenext', '--moduleResolution', 'nodenext', '--target', 'es2022', '--skipLibCheck', '--outDir', pdir, 'src/rbxmEditPipeline.ts'],
    { cwd: join(process.cwd(), 'apps/functions'), encoding: 'utf8' },
  );
  pipe = await import(pathToFileURL(join(pdir, 'rbxmEditPipeline.js')).href);
  check('pipeline compiles + imports', !!pipe && typeof pipe.pickScopeHeuristic === 'function');
} catch (e) {
  check('pipeline compiles + imports', false, `${e.stdout || ''}${e.stderr || ''}${e.message || ''}`);
}

// pure-function unit asserts
if (pipe) {
  check('parseScopeSelectionResponse strips fences', pipe.parseScopeSelectionResponse('```json\n{"scope":"ref:5"}\n```') === 'ref:5');
  check('parseEditOpsResponse parses ops', pipe.parseEditOpsResponse('{"ops":[{"op":"delete","ref":3}]}').ops.length === 1);
  check('parseEditOpsResponse drops bad ops', pipe.parseEditOpsResponse('{"ops":[{"op":"rename","ref":1},{"op":"delete","ref":2}]}').dropped.length === 1);
}

// ── 3. build a fixture PLACE ─────────────────────────────────────────────────
const fixtureScript = join(dir, 'place.luau');
writeFileSync(fixtureScript, `
local fs = require("@lune/fs")
local process = require("@lune/process")
local roblox = require("@lune/roblox")
local Vector3 = (roblox :: any).Vector3
local Color3 = (roblox :: any).Color3
local outPath = process.args[1]
local game = roblox.Instance.new("DataModel")
local ws = roblox.Instance.new("Workspace"); ws.Parent = game
local sss = roblox.Instance.new("ServerScriptService"); sss.Parent = game
local town = roblox.Instance.new("Model"); town.Name = "Town"; town.Parent = ws
local house = roblox.Instance.new("Part"); house.Name = "House"
house.Size = Vector3.new(10, 8, 10); house.Color = Color3.new(0.6, 0.4, 0.2); house.Anchored = true; house.Parent = town
local road = roblox.Instance.new("Part"); road.Name = "Road"
road.Size = Vector3.new(40, 1, 8); road.Color = Color3.new(0.2, 0.2, 0.2); road.Anchored = true; road.Parent = town
local arena = roblox.Instance.new("Model"); arena.Name = "Arena"; arena.Parent = ws
local floor = roblox.Instance.new("Part"); floor.Name = "ArenaFloor"
floor.Size = Vector3.new(20, 1, 20); floor.Color = Color3.new(0.1, 0.5, 0.1); floor.Anchored = true; floor.Parent = arena
local main = roblox.Instance.new("Script"); main.Name = "TownManager"; main.Source = "print('town v1')"; main.Parent = sss
fs.writeFile(outPath, roblox.serializePlace(game))
print("PLACE_FIXTURE_OK")
`);
const place = join(dir, 'place.rbxl');
const fx = runLune([fixtureScript, place]);
check('place fixture built', fx.ok && fx.out.includes('PLACE_FIXTURE_OK'), fx.out.trim());

// ── analyze helpers ──────────────────────────────────────────────────────────
function analyze(input, mode, scope) {
  const out = join(dir, `a-${Math.random().toString(36).slice(2)}.json`);
  const args = [ANALYZE, input, out, 'place', mode];
  if (scope !== undefined) args.push(scope);
  const res = runLune(args);
  if (!res.ok) return { __error: res.out };
  return JSON.parse(readFileSync(out, 'utf8'));
}

// ── 4. outline -> scope pick ─────────────────────────────────────────────────
const outline = analyze(place, 'outline');
check('outline ok', !outline.__error, outline.__error);
check('outline has nodes', Array.isArray(outline.outline) && outline.outline.length >= 6, `len=${(outline.outline || []).length}`);
const outlineByName = (n) => (outline.outline || []).find((e) => e.name === n);
const townOutline = outlineByName('Town');
const scriptOutline = outlineByName('TownManager');
check('outline contains Town + TownManager (global refs)', !!(townOutline && scriptOutline && townOutline.ref && scriptOutline.ref));

let scope = pipe ? pipe.pickScopeHeuristic(outline, 'repaint the town houses red') : `ref:${townOutline?.ref}`;
check('heuristic picked the Town subtree', scope === `ref:${townOutline?.ref}`, `got ${scope}, want ref:${townOutline?.ref}`);

// ── 5. deep-scoped analyze: only Town subtree ────────────────────────────────
const deepTown = analyze(place, 'deep', scope);
check('deep-scope ok', !deepTown.__error, deepTown.__error);
const deepByName = (n) => (deepTown.tree || []).find((e) => e.name === n);
const house = deepByName('House');
const road = deepByName('Road');
check('scope includes Town parts (House+Road)', !!(house && road && house.props && house.props.Color));
check('scope EXCLUDES Arena subtree', !deepByName('ArenaFloor') && !deepByName('Arena'), `tree names: ${(deepTown.tree || []).map((e) => e.name).join(',')}`);
check('scope report present', !!(deepTown.scope && deepTown.scope.matched >= 3), JSON.stringify(deepTown.scope));

// ── 6. apply ops over the WHOLE place (global refs) ──────────────────────────
const ops = [
  { op: 'setProperties', ref: house?.ref, properties: { Color: { __type: 'Color3', r: 1, g: 0, b: 0 } } },
  { op: 'setProperties', ref: road?.ref, properties: { Size: { __type: 'Vector3', x: 60, y: 1, z: 8 } } },
  { op: 'setScriptSource', ref: scriptOutline?.ref, source: "print('town v2')" },
  { op: 'addInstance', parentRef: townOutline?.ref, className: 'Part', name: 'Fountain', properties: { Anchored: true } },
];
const opsPath = join(dir, 'ops.json');
writeFileSync(opsPath, JSON.stringify({ ops }, null, 2));
const edited = join(dir, 'edited.rbxl');
const resultsPath = join(dir, 'results.json');
const applyRes = runLune([APPLY, place, opsPath, edited, 'place', resultsPath]);
check('apply ran on place', applyRes.ok, applyRes.out.trim());
let results = {};
try {
  results = JSON.parse(readFileSync(resultsPath, 'utf8'));
} catch (e) {
  results = { __error: String(e) };
}
check('all 4 ops applied, 0 failed', results.applied === 4 && results.failed === 0, JSON.stringify(results));

// ── 7. re-analyze whole place, assert ────────────────────────────────────────
const after = analyze(edited, 'deep', '');
check('re-analyze ok', !after.__error, after.__error);
const a = (n) => (after.tree || []).find((e) => e.name === n);
const house2 = a('House');
const road2 = a('Road');
const script2 = a('TownManager');
const fountain = a('Fountain');
const arenaFloor2 = a('ArenaFloor');
check('House now red', !!(house2 && house2.props && house2.props.Color && Math.abs(house2.props.Color.r - 1) < 0.02 && house2.props.Color.g < 0.02), JSON.stringify(house2 && house2.props && house2.props.Color));
check('Road resized to 60', !!(road2 && road2.props && road2.props.Size && Math.abs(road2.props.Size.x - 60) < 0.02), JSON.stringify(road2 && road2.props && road2.props.Size));
check('TownManager rewritten', !!(script2 && typeof script2.source === 'string' && script2.source.includes('town v2')), script2 && script2.source);
check('Fountain added to Town', !!fountain);
check('Arena untouched (still green, present)', !!(arenaFloor2 && arenaFloor2.props && arenaFloor2.props.Color && arenaFloor2.props.Color.g > 0.4 && arenaFloor2.props.Color.r < 0.2), JSON.stringify(arenaFloor2 && arenaFloor2.props && arenaFloor2.props.Color));

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAIL`);
process.exit(fails === 0 ? 0 : 1);
