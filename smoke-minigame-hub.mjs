// Session 420 smoke: validate the rebuilt Mini-games Hub across ALL 10 presets.
// (1) Lune luau.compile passes for every emitted script (server + client).
// (2) Real party hub: lobby + VOTING system (podiums + vote tally + 3 options).
// (3) A library of distinct, playable minigames — incl. the 5 user-named ones
//     (Dodgeball / Hide & Seek / Sprint Race / Parkour / Musical Chairs).
// (4) Real public asset packs spliced in: 99 Nights (InsertService) for the
//     night preset, brainrot (AssetService) for the brainrot preset.
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deriveGameVisualSpec } from './apps/functions/dist/gameThemeSpec.js';
import { buildGameplayScript } from './apps/functions/dist/gameTemplates.js';

const LUNE = './.local-tools/lune/lune';
const CHECK = './.local-tools/check-luau.luau';
const dir = mkdtempSync(join(tmpdir(), 'hub-'));
let fails = 0;

// title, expected vibe, asset-check ('insert99' | 'brainrot' | null)
const PRESETS = [
  ['MrBeast Challenge Hub',    'money',    null],
  ['Brainrot Battle Games',    'brainrot', 'brainrot'],
  ['Survive 99 Nights Arena',  'night',    'insert99'],
  ["Prototype's Game Show",    'lab',      null],
  ['FNAF Party Games',         'monster',  null],
  ['No Rules Challenge',       'neutral',  null],
  ['Rich Kid Competitions',    'money',    null],
  ['Monster School Olympics',  'monster',  null],
  ['Bananita Island Games',    'tropical', null],
  ['Ultimate Obby Showdown',   'neutral',  null],
];

// the five minigames the user explicitly named + the loop/voting machinery.
const NAMED = ['mgDodgeball', 'mgHideSeek', 'mgRace', 'mgParkour', 'mgMusicalChairs'];
const ALL_MG = [...NAMED, 'mgTileDrop', 'mgLava', 'mgRedLight', 'mgGlassBridge', 'mgColorRush'];

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

console.log('=== Mini-games Hub: Lune compile + structural checks (10 presets) ===');
const vibesSeen = new Set();
for (const [title, expVibe, assetCheck] of PRESETS) {
  const spec = deriveGameVisualSpec('minigame_hub', title, title);
  vibesSeen.add(spec.vibe);
  const r = buildGameplayScript({ title, genre: 'minigame_hub', gameKind: 'minigame_hub', systems: ['leaderstats'], jobId: 'smoke', gameVisualSpec: spec });
  const scripts = scriptsOf(r);
  const s = (typeof r === 'string' ? r : r.serverScript) || '';

  let compileErr = null;
  for (const [name, src] of scripts) {
    const e = compileOk(`hub_${title}_${name}`, src);
    if (e) { compileErr = `${name}: ${e}`; break; }
  }

  const detail = [];
  let structOk = true;
  // voting system
  if (!(s.includes('Podium_') && s.includes('countVotes') && s.includes('opt1'))) { structOk = false; detail.push('no-voting'); }
  // all 10 minigames registered
  const regCount = (s.match(/reg\("/g) || []).length;
  if (regCount < 10) { structOk = false; detail.push('reg=' + regCount); }
  // the 5 user-named mechanics present
  for (const n of ALL_MG) if (!s.includes(n)) { structOk = false; detail.push('missing:' + n); }
  // leaderstats progression
  if (!s.includes('leaderstats')) { structOk = false; detail.push('no-leaderstats'); }
  // themed seeker wired from the TD pack
  if (!s.includes('makeSeeker')) { structOk = false; detail.push('no-seeker'); }
  // vibe sanity
  if (spec.vibe !== expVibe) { structOk = false; detail.push(`vibe=${spec.vibe}(exp ${expVibe})`); }
  // real asset packs
  if (assetCheck === 'insert99') {
    if (!(s.includes('InsertService') && s.includes('136689985623077') && s.includes('82051509034737'))) { structOk = false; detail.push('no-99nights-assets'); }
  } else if (assetCheck === 'brainrot') {
    if (!(s.includes('LoadAssetAsync') && s.includes('112586636995159'))) { structOk = false; detail.push('no-brainrot-assets'); }
  }

  const ok = !compileErr && structOk;
  if (!ok) fails++;
  console.log(`${ok ? 'OK ' : '***'} ${title.padEnd(26)} vibe=${spec.vibe.padEnd(8)} reg=${regCount} scripts=${scripts.length} compile=${compileErr ? 'FAIL ' + compileErr : 'ok'} ${detail.join(' ')}`);
}

console.log(`\n=== vibes exercised: ${[...vibesSeen].join(', ')} ===`);
console.log(fails === 0 ? '\n=== ALL CHECKS PASSED ===' : `\n=== ${fails} FAILURES ===`);
process.exit(fails === 0 ? 0 : 1);
