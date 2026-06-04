// Session 421 smoke: Story Game narrative adventure.
// (1) every emitted Lua (server + client) compiles (Lune luau.compile),
// (2) all 6 narrative features present per theme (intro cutscene, NPC dialogue,
//     branching choices, puzzle, multi-endings, ProximityPrompt NPCs),
// (3) theme-asset scatter for story lays props ALONG the corridor (x=±16), ≤8/game,
// (4) audit which story presets have NO theme-asset coverage (report gaps to user).
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deriveGameVisualSpec } from './apps/functions/dist/gameThemeSpec.js';
import { buildGameplayScript } from './apps/functions/dist/gameTemplates.js';
import { themeAssetScatterLua, pickThemeAssets } from './apps/functions/dist/data/themeAssetPacks.js';

const LUNE = './.local-tools/lune/lune';
const CHECK = './.local-tools/check-luau.luau';
const dir = mkdtempSync(join(tmpdir(), 'story-'));
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

console.log('=== Story Game: compile + feature wiring (4 themes) ===');
const THEMES = ['fantasy', 'scifi', 'mystery', 'horror'];
for (const mt of THEMES) {
  const title = `${mt} story`;
  const spec = deriveGameVisualSpec('story_game', title, title);
  const r = buildGameplayScript({ title, genre: 'story', gameKind: 'story_game', mapTheme: mt, systems: ['leaderstats'], jobId: 'smoke', gameVisualSpec: spec });
  const scripts = scriptsOf(r);
  let compileErr = null;
  for (const [name, src] of scripts) {
    const e = compileOk(`story_${mt}_${name}`, src);
    if (e) { compileErr = `${name}: ${e}`; break; }
  }
  const srv = scripts.find(([n]) => n === 'server')?.[1] || '';
  const cli = scripts.find(([n]) => n !== 'server')?.[1] || '';
  // feature checks
  const hasIntroCutscene = cli.includes('letterbox(true)') && cli.includes('CameraType = Enum.CameraType.Scriptable') && srv.includes('kind = "intro"');
  const hasDialogue = srv.includes('kind = "dialogue"') && cli.includes('typeInto(body');
  const hasChoices = srv.includes('kind == "choose"') && cli.includes('StAction:FireServer("choose"') && /choiceA\s*=/.test(srv);
  const hasKarma = srv.includes('s.karma = s.karma + 1') && srv.includes('pickEnding');
  const hasEndings = (srv.match(/title=/g) || []).length >= 3 && srv.includes('kind = "ending"');
  const hasPuzzle = srv.includes('STORY.puzzle.order') && srv.includes('openBarrier') && srv.includes('ProximityPrompt');
  const hasNpcPrompt = srv.includes('prompt.ActionText = "Talk"');
  const ok = !compileErr && hasIntroCutscene && hasDialogue && hasChoices && hasKarma && hasEndings && hasPuzzle && hasNpcPrompt;
  if (!ok) fails++;
  console.log(`${ok ? 'OK ' : '***'} ${mt.padEnd(8)} compile=${compileErr ? 'FAIL ' + compileErr : 'ok'} intro=${hasIntroCutscene} dialogue=${hasDialogue} choices=${hasChoices} karma=${hasKarma} endings=${hasEndings} puzzle=${hasPuzzle} npc=${hasNpcPrompt}`);
}

console.log('\n=== Story theme-asset scatter: corridor placement + cap ===');
{
  const brief = 'Lost in 99 Nights forest survival';
  const scatter = themeAssetScatterLua(brief, 'story_game');
  const compileErr = scatter ? compileOk('story_scatter', scatter) : 'no-scatter';
  const idsList = pickThemeAssets(brief, 8);
  const onCorridor = scatter.includes('Vector3.new(-16, 6,') && scatter.includes('Vector3.new(16, 6,');
  const capOk = idsList.length <= 10;
  const ok = !compileErr && onCorridor && capOk && idsList.length > 0;
  if (!ok) fails++;
  console.log(`${ok ? 'OK ' : '***'} compile=${compileErr ? 'FAIL ' + compileErr : 'ok'} corridor=${onCorridor} ids=${idsList.length} (cap≤10)`);
}

console.log('\n=== Story preset → theme-asset coverage audit ===');
const STORY_PRESETS = [
  ['Trapped With Prototype', 'Escape before it is too late'],
  ['The Last Night Guard', 'Survive until 6 AM'],
  ['Lost in 99 Nights', 'Nobody survived before'],
  ['Brainrot Apocalypse', 'The memes became real'],
  ["MrBeast's Final Challenge", 'Only one player wins'],
  ['The Secret Rich Kid School', 'Something is hidden here'],
  ['Escape Bananita Island', 'Paradise turned dangerous'],
  ["Orangutini's Kingdom", 'Save the pineapple throne'],
  ['Monster School Detention', 'Never stay after class'],
  ['The Haunted Sleepover', 'Your friends vanished overnight'],
];
const gaps = [];
for (const [t, s] of STORY_PRESETS) {
  const brief = `${t} ${s}`;
  const n = pickThemeAssets(brief, 8).length;
  if (n === 0) gaps.push(t);
  console.log(`${n > 0 ? 'OK ' : 'GAP'} ${String(n).padStart(2)} assets  "${t}"`);
}
console.log(gaps.length ? `\n>>> ${gaps.length} preset(s) have NO catalog assets (user must supply links): ${gaps.join(' | ')}` : '\n>>> every story preset has assets');

console.log(fails === 0 ? '\n=== ALL CHECKS PASSED ===' : `\n=== ${fails} FAILURES ===`);
process.exit(fails === 0 ? 0 : 1);
