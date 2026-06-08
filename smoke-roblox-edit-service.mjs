// Session 430 (Release 4 wiring) smoke: orchestration in robloxEditService.ts
// with MOCK deps (no worker, no LLM, no network). Proves the wiring glue:
//   - orchestrateEdit (model): analyze deep -> LLM ops -> apply.
//   - orchestrateEdit (place, no scope): outline -> heuristic scope -> deep -> apply.
//   - orchestrateAnalyst: heuristics baseline + LLM expansion (and LLM fallback).
//   - orchestrateMonetize: heuristic plan + LLM expansion.
// Run: node smoke-roblox-edit-service.mjs
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'editsvc-'));
let fails = 0;
function check(label, cond, detail) {
  if (cond) console.log(`  PASS ${label}`);
  else { console.log(`  FAIL ${label}${detail ? ' :: ' + detail : ''}`); fails++; }
}

// compile robloxEditService.ts (+ its imports) -> tmp ESM
const pdir = join(dir, 'pkg');
mkdirSync(pdir, { recursive: true });
writeFileSync(join(pdir, 'package.json'), JSON.stringify({ type: 'module' }));
let S = null;
try {
  execFileSync(
    'npx',
    ['--no-install', 'tsc', '--module', 'nodenext', '--moduleResolution', 'nodenext', '--target', 'es2022', '--skipLibCheck', '--outDir', pdir, 'src/robloxEditService.ts'],
    { cwd: join(process.cwd(), 'apps/functions'), encoding: 'utf8' },
  );
  S = await import(pathToFileURL(join(pdir, 'robloxEditService.js')).href);
  check('robloxEditService compiles + imports', !!S && typeof S.orchestrateEdit === 'function');
} catch (e) {
  check('robloxEditService compiles + imports', false, `${e.stdout || ''}${e.stderr || ''}${e.message || ''}`);
  console.log('\n1 FAIL');
  process.exit(1);
}

// ── Mock deps ────────────────────────────────────────────────────────────────
const deepModel = {
  target: 'model',
  totalInstances: 4,
  mode: 'deep',
  classCounts: { Part: 2, Script: 1 },
  tree: [
    { ref: 1, name: 'Root', className: 'Folder', path: '/Root' },
    { ref: 2, name: 'House', className: 'Part', path: '/Root/House', props: { Color: { __type: 'Color3', r: 0.5, g: 0.5, b: 0.5 } } },
    { ref: 3, name: 'Main', className: 'Script', path: '/Root/Main', source: 'print(1)' },
  ],
};
const outlinePlace = {
  target: 'place',
  totalInstances: 6,
  mode: 'outline',
  outline: [
    { ref: 1, name: 'game', className: 'DataModel', path: '/game' },
    { ref: 2, name: 'Workspace', className: 'Workspace', path: '/game/Workspace' },
    { ref: 3, name: 'Town', className: 'Model', path: '/game/Workspace/Town', childCount: 2 },
    { ref: 6, name: 'Arena', className: 'Model', path: '/game/Workspace/Arena', childCount: 1 },
  ],
};
const deepPlaceTown = {
  target: 'place',
  totalInstances: 6,
  mode: 'deep',
  scope: { kind: 'ref', value: 'ref:3', matched: 2 },
  classCounts: { Part: 2, Model: 1 },
  tree: [
    { ref: 3, name: 'Town', className: 'Model', path: '/game/Workspace/Town' },
    { ref: 4, name: 'House', className: 'Part', path: '/game/Workspace/Town/House', props: { Color: { __type: 'Color3', r: 0.6, g: 0.4, b: 0.2 } } },
  ],
};
const deepBareGame = {
  target: 'place',
  totalInstances: 30,
  mode: 'deep',
  classCounts: { Part: 25, SpawnLocation: 1, Script: 1 },
  tree: [
    { ref: 1, name: 'Spawn', className: 'SpawnLocation' },
    { ref: 2, name: 'K', className: 'Script', source: 'h.Parent.Humanoid.Health = 0' },
  ],
};

let lastEditInput = null;
let lastApplyOps = null;
function makeDeps({ analystThrows = false } = {}) {
  return {
    analyze: async (_input, target, mode) => {
      if (mode === 'outline') return outlinePlace;
      if (target === 'place') return deepPlaceTown;
      return deepModel;
    },
    applyEdits: async (input, ops) => {
      lastApplyOps = ops;
      lastEditInput = input;
      return { outputBase64: Buffer.from('EDITED-BINARY').toString('base64'), results: { applied: ops.length, failed: 0 } };
    },
    runChat: async (system) => {
      if (system.includes('edit-ops')) {
        return '{"ops":[{"op":"setProperties","ref":4,"properties":{"Color":{"__type":"Color3","r":1,"g":0,"b":0}}}]}';
      }
      if (system.includes('game designer')) {
        if (analystThrows) throw new Error('LLM down');
        return '```json\n{"suggestions":[{"category":"monetization","severity":"high","title":"Add a gamepass","detail":"Sell a VIP gamepass."}]}\n```';
      }
      if (system.includes('monetization strategist')) {
        return '{"items":[{"kind":"gamepass","name":"VIP","priceRobux":199,"rationale":"perks"}],"notes":["grounded"]}';
      }
      return '{}';
    },
  };
}

// ── orchestrateEdit (model) ──────────────────────────────────────────────────
console.log('=== orchestrateEdit (model) ===');
const editModel = await S.orchestrateEdit(
  { input: Buffer.from('rbxm-bytes'), target: 'model', request: 'make the house red' },
  makeDeps(),
);
check('model: 1 op applied', editModel.opsApplied === undefined ? editModel.ops.length === 1 : editModel.ops.length === 1);
check('model: output is edited binary', Buffer.from(editModel.outputBase64, 'base64').toString() === 'EDITED-BINARY');
check('model: results.applied=1', editModel.results && editModel.results.applied === 1, JSON.stringify(editModel.results));
check('model: no scope used', editModel.scopeUsed === '');

// ── orchestrateEdit (place, auto-scope) ──────────────────────────────────────
console.log('=== orchestrateEdit (place, auto-scope) ===');
const editPlace = await S.orchestrateEdit(
  { input: Buffer.from('rbxl-bytes'), target: 'place', request: 'repaint the town houses' },
  makeDeps(),
);
check('place: heuristic auto-picked Town (ref:3)', editPlace.scopeUsed === 'ref:3', editPlace.scopeUsed);
check('place: op applied + edited binary', editPlace.ops.length === 1 && Buffer.from(editPlace.outputBase64, 'base64').toString() === 'EDITED-BINARY');

// ── orchestrateAnalyst ───────────────────────────────────────────────────────
console.log('=== orchestrateAnalyst ===');
const analyst = await S.orchestrateAnalyst({ input: Buffer.from('x'), target: 'place', description: 'my game' }, makeDeps());
check('analyst: heuristics present', Array.isArray(analyst.heuristics) && analyst.heuristics.length > 0);
check('analyst: LLM suggestions used', analyst.usedLlm === true && analyst.suggestions.some((s) => s.title.includes('gamepass')));
const analystFallback = await S.orchestrateAnalyst({ input: Buffer.from('x'), target: 'place' }, makeDeps({ analystThrows: true }));
check('analyst: falls back to heuristics on LLM failure', analystFallback.usedLlm === false && analystFallback.suggestions === analystFallback.heuristics);

// ── orchestrateMonetize ──────────────────────────────────────────────────────
console.log('=== orchestrateMonetize ===');
const mon = await S.orchestrateMonetize({ input: Buffer.from('x'), target: 'place', genre: 'simulator' }, makeDeps());
check('monetize: heuristic plan present', mon.heuristicPlan && mon.heuristicPlan.items.length > 0);
check('monetize: LLM plan used', mon.usedLlm === true && mon.plan.items.some((i) => i.name === 'VIP' && i.priceRobux === 199));

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAIL`);
process.exit(fails === 0 ? 0 : 1);
