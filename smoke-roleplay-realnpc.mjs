// Session 414k smoke: roleplay NPCs use REAL catalog models + wander.
// Verifies (1) every emitted Lua script compiles (Lune luau.compile),
// (2) buildRealNpc/wanderModel prelude present, (3) per-name asset IDs wired,
// (4) ambient citizens block present when the brief matches a theme pack,
// (5) NPC loop drives movement (no static-anchored block NPC left behind).
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deriveGameVisualSpec } from './apps/functions/dist/gameThemeSpec.js';
import { buildGameplayScript } from './apps/functions/dist/gameTemplates.js';

const LUNE = './.local-tools/lune/lune';
const CHECK = './.local-tools/check-luau.luau';
const dir = mkdtempSync(join(tmpdir(), 'rpnpc-'));
let fails = 0;

function scriptsOf(r) {
  const out = [];
  if (typeof r === 'string') return [['main', r]];
  if (r.serverScript) out.push(['server', r.serverScript]);
  for (const a of r.additionalScripts || []) out.push([a.name || 'extra', a.source || '']);
  return out;
}
function compileOk(label, src) {
  const f = join(dir, label.replace(/[^a-z0-9]/gi, '_') + '.luau');
  writeFileSync(f, src);
  const res = execFileSync(LUNE, ['run', CHECK, f], { encoding: 'utf8' }).trim();
  return res.startsWith('COMPILE_OK') ? null : res;
}

// title -> at least one real asset id we expect to be inserted as an NPC
const CASES = [
  ['Build a MrBeast City', /\b8326979870\b/],
  ['Spawn a Tralalero Neighborhood', /\b107158060686382\b/],
  ['Create a Bananita Island', /\b136122396955192\b/],
  ['Build a Tung Tung Town', /\b112586636995159\b/],
  ['Build a Millionaire School', /\b(9057118396|1042207059)\b/],
];

console.log('=== Roleplay real-NPC compile + wiring ===');
for (const [title, idRe] of CASES) {
  const spec = deriveGameVisualSpec('roleplay_town', title, title);
  const r = buildGameplayScript({ title, genre: 'roleplay', gameKind: 'roleplay_town', systems: ['leaderstats'], jobId: 'smoke', gameVisualSpec: spec });
  const scripts = scriptsOf(r);
  let compileErr = null;
  for (const [name, src] of scripts) {
    const e = compileOk(`rp_${title}_${name}`, src);
    if (e) { compileErr = `${name}: ${e}`; break; }
  }
  const src = scripts.find(([n]) => n === 'server')?.[1] || '';
  const hasPrelude = src.includes('local function buildRealNpc(') && src.includes('local function wanderModel(');
  const hasAmbient = src.includes('local AMBIENT_ASSETS = {');
  const hasAssetField = /\{name=.*asset=\d+\}/.test(src);
  const hasIdWired = idRe.test(src);
  // no NPC should be left static-anchored: the old "hrp.Anchored = true" path is gone
  const noStaticAnchor = !src.includes('if npc and hrp then hrp.Anchored = true; anchor');
  // all 4 activity systems present
  const activities = ['DeliveryDepot', 'Deliver Order', 'Claim House', 'Recolor Walls', 'Add Furniture', 'QuestBoard', 'CarDealership', 'Buy Car ($500)', 'ATM'];
  const missing = activities.filter((a) => !src.includes(a));
  const hasActivities = missing.length === 0;
  const ok = !compileErr && hasPrelude && hasAmbient && hasAssetField && hasIdWired && noStaticAnchor && hasActivities;
  if (!ok) fails++;
  console.log(`${ok ? 'OK ' : '***'} "${title}" compile=${compileErr ? 'FAIL ' + compileErr : 'ok'} prelude=${hasPrelude} ambient=${hasAmbient} idWired=${hasIdWired} noStatic=${noStaticAnchor} activities=${hasActivities ? 'all' : 'MISSING ' + missing.join(',')}`);
}

console.log(fails === 0 ? '=== ALL CHECKS PASSED ===' : `=== ${fails} FAILURES ===`);
process.exit(fails === 0 ? 0 : 1);
