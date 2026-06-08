// Session 420 smoke: themed-asset scatter wired into ALL genres.
// (1) lune luau.compile passes for every emitted script of every genre.
// (2) the scatter (standee/LoadAsset) is actually present in the serverScript
//     for genres that should have it (all except tower_defense + the two that
//     use their own tuned splice still emit it: racing/parkour).
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deriveGameVisualSpec } from './apps/functions/dist/gameThemeSpec.js';
import { buildGameplayScript } from './apps/functions/dist/gameTemplates.js';

const LUNE = './.local-tools/lune/lune';
const CHECK = './.local-tools/check-luau.luau';
const dir = mkdtempSync(join(tmpdir(), 'allassets-'));
let fails = 0;

// title carries an fnaf keyword so the fnaf pack matches for every genre
const TITLE = "Escape Freddy's Factory";
const FNAF_ID = '131366436943647';

// [gameKind, genre, extra params]. tower_defense expects NO scatter (own system).
const CASES = [
  ['brainrot_sim', 'simulator', { brainrotPool: [{ name: 'Test', memeSubTheme: 'skibidi', rarity: 'common', baseCps: 1, priceCash: 10, spawnWeight: 1, primaryColor: [200, 100, 100], accentColor: [100, 100, 200] }] }],
  ['obby_troll', 'obby', {}],
  ['rpg_adventure', 'rpg', {}],
  ['horror_escape', 'horror', {}],
  ['pvp_arena', 'pvp', {}],
  ['roleplay_town', 'roleplay', {}],
  ['racing', 'racing', {}],
  ['parkour', 'parkour', {}],
  ['story_game', 'story', {}],
  ['survival', 'survival', {}],
  ['minigame_hub', 'minigames', {}],
  ['fighting_arena', 'fighting', {}],
  ['custom_game', 'custom', {}],
  ['tower_defense', 'tower defense', {}], // scatter NOT expected (own system)
  ['', 'obby', {}],       // generic obby path
  ['', 'tycoon', {}],     // generic tycoon path
  ['', 'simulator', {}],  // generic simulator path
];

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

console.log('=== Lune compile + scatter presence (all genres, fnaf title) ===');
for (const [gameKind, genre, extra] of CASES) {
  const label = gameKind || `genre:${genre}`;
  let r;
  try {
    const spec = deriveGameVisualSpec(gameKind || genre, TITLE, TITLE);
    r = buildGameplayScript({ title: TITLE, genre, gameKind, systems: ['leaderstats'], summary: TITLE, jobId: 'smoke', gameVisualSpec: spec, ...extra });
  } catch (e) {
    console.log(`ERR  ${label.padEnd(16)} build threw: ${String(e.message || e).slice(0, 80)}`);
    fails++; continue;
  }
  const scripts = scriptsOf(r);
  let compileErr = null;
  for (const [name, src] of scripts) {
    const e = compileOk(`${label}_${name}`, src);
    if (e) { compileErr = `${name}: ${e.slice(0, 90)}`; break; }
  }
  const server = (typeof r === 'string' ? r : r.serverScript) || '';
  const hasScatter = server.includes('ThemedAssets') && server.includes(FNAF_ID);
  const wantScatter = gameKind !== 'tower_defense';
  const scatterOk = hasScatter === wantScatter;
  const ok = !compileErr && scatterOk;
  if (!ok) fails++;
  console.log(`${ok ? 'OK ' : 'FAIL'} ${label.padEnd(16)} compile=${compileErr ? 'FAIL ' + compileErr : 'ok'} scatter=${hasScatter ? 'yes' : 'no'}${wantScatter ? '' : '(none expected)'}`);
}
console.log(fails === 0 ? '\n=== ALL CHECKS PASSED ===' : `\n=== ${fails} FAILED ===`);
process.exit(fails === 0 ? 0 : 1);
