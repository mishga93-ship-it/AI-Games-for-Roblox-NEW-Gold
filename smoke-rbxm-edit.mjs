// Session 427 (Release 4 / Phase 1) smoke: round-trip edit of an existing .rbxm.
// Proves the new edit pipeline end-to-end with the REAL Lune scripts:
//   (1) analyze_roblox.luau --deep and apply_edits.luau both compile.
//   (2) build a fixture model -> analyze --deep -> apply 5 edit-ops
//       (setProperties, rename, setScriptSource, delete, addInstance)
//       -> re-analyze -> assert every change took.
// Run: node smoke-rbxm-edit.mjs
import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const LUNE = './.local-tools/lune/lune';
const CHECK = './.local-tools/check-luau.luau';
const ANALYZE = './apps/worker-service/runtime/lune/analyze_roblox.luau';
const APPLY = './apps/worker-service/runtime/lune/apply_edits.luau';

const dir = mkdtempSync(join(tmpdir(), 'rbxmedit-'));
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

// ── 2. build a fixture .rbxm (Folder Root > Part Body + Script Main + Part ToDelete) ──
const fixtureScript = join(dir, 'fixture.luau');
writeFileSync(fixtureScript, `
local fs = require("@lune/fs")
local process = require("@lune/process")
local roblox = require("@lune/roblox")
local Vector3 = (roblox :: any).Vector3
local Color3 = (roblox :: any).Color3
local outPath = process.args[1]
local root = roblox.Instance.new("Folder")
root.Name = "Root"
local body = roblox.Instance.new("Part")
body.Name = "Body"
body.Size = Vector3.new(4, 1, 2)
body.Color = Color3.new(0.5, 0.5, 0.5)
body.Anchored = true
body.Parent = root
local main = roblox.Instance.new("Script")
main.Name = "Main"
main.Source = "print('hello original')"
main.Parent = root
local extra = roblox.Instance.new("Part")
extra.Name = "ToDelete"
extra.Parent = root
fs.writeFile(outPath, roblox.serializeModel({ root }))
print("FIXTURE_OK")
`);
const fixture = join(dir, 'fixture.rbxm');
const fxRes = runLune([fixtureScript, fixture]);
check('fixture built', fxRes.ok && fxRes.out.includes('FIXTURE_OK'), fxRes.out.trim());

// ── 3. analyze --deep helper ─────────────────────────────────────────────────
function analyzeDeep(input) {
  const out = join(dir, `a-${Math.random().toString(36).slice(2)}.json`);
  const res = runLune([ANALYZE, input, out, 'model', 'deep']);
  if (!res.ok) {
    return { __error: res.out };
  }
  return JSON.parse(readFileSync(out, 'utf8'));
}
const byName = (t, n) => (t.tree || []).find((e) => e.name === n);

const before = analyzeDeep(fixture);
check('deep analyze ok', !before.__error, before.__error);
check('deep tree present', Array.isArray(before.tree) && before.tree.length >= 4, `len=${(before.tree || []).length}`);
const body = byName(before, 'Body');
const main = byName(before, 'Main');
const toDelete = byName(before, 'ToDelete');
check('body props read (Size+Color)', !!(body && body.props && body.props.Size && body.props.Color), JSON.stringify(body && body.props));
check('script source read', !!(main && typeof main.source === 'string' && main.source.includes('hello original')), main && main.source);
check('stable refs assigned', !!(body && body.ref && main && main.ref), JSON.stringify({ body: body && body.ref, main: main && main.ref }));

// ── 4. build edit-ops ────────────────────────────────────────────────────────
const ops = [
  { op: 'setProperties', ref: body?.ref, properties: { Color: { __type: 'Color3', r: 1, g: 0, b: 0 }, Size: { __type: 'Vector3', x: 9, y: 9, z: 9 } } },
  { op: 'rename', ref: body?.ref, name: 'Chassis' },
  { op: 'setScriptSource', ref: main?.ref, source: "print('edited by phase1')" },
  { op: 'delete', ref: toDelete?.ref },
  { op: 'addInstance', parentRef: 1, className: 'Part', name: 'AddedByPhase1', properties: { Anchored: true } },
];
const opsPath = join(dir, 'ops.json');
writeFileSync(opsPath, JSON.stringify({ ops }, null, 2));

// ── 5. apply edits ───────────────────────────────────────────────────────────
const edited = join(dir, 'edited.rbxm');
const resultsPath = join(dir, 'results.json');
const applyRes = runLune([APPLY, fixture, opsPath, edited, 'model', resultsPath]);
check('apply ran', applyRes.ok, applyRes.out.trim());
let results = {};
try {
  results = JSON.parse(readFileSync(resultsPath, 'utf8'));
} catch (e) {
  results = { __error: String(e) };
}
check('all 5 ops applied, 0 failed', results.applied === 5 && results.failed === 0, JSON.stringify(results));

// ── 6. re-analyze edited, assert each change ─────────────────────────────────
const after = analyzeDeep(edited);
check('re-analyze ok', !after.__error, after.__error);
const chassis = byName(after, 'Chassis');
const main2 = byName(after, 'Main');
const added = byName(after, 'AddedByPhase1');
const stillDeleted = byName(after, 'ToDelete');
check('renamed Body -> Chassis', !!chassis && !byName(after, 'Body'));
check('Color now red', !!(chassis && chassis.props && chassis.props.Color && Math.abs(chassis.props.Color.r - 1) < 0.02 && chassis.props.Color.g < 0.02 && chassis.props.Color.b < 0.02), JSON.stringify(chassis && chassis.props && chassis.props.Color));
check('Size now 9x9x9', !!(chassis && chassis.props && chassis.props.Size && Math.abs(chassis.props.Size.x - 9) < 0.02 && Math.abs(chassis.props.Size.y - 9) < 0.02), JSON.stringify(chassis && chassis.props && chassis.props.Size));
check('script source edited', !!(main2 && typeof main2.source === 'string' && main2.source.includes('edited by phase1')), main2 && main2.source);
check('addInstance present', !!added);
check('delete removed ToDelete', !stillDeleted);

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAIL`);
process.exit(fails === 0 ? 0 : 1);
