// Session 418 smoke: validate Racing rebuild + Parkour across all 10 user presets.
// (1) Lune luau.compile passes for every emitted script (server + client + extras).
// (2) Racing carries real driveable cars / boost / drift / customization / rewards.
// (3) No floating spawn billboard (grounded gantry banner instead).
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deriveGameVisualSpec } from './apps/functions/dist/gameThemeSpec.js';
import { buildGameplayScript } from './apps/functions/dist/gameTemplates.js';

const LUNE = './.local-tools/lune/lune';
const CHECK = './.local-tools/check-luau.luau';
const dir = mkdtempSync(join(tmpdir(), 'racepk-'));
let fails = 0;

const PRESETS = [
  ['parkour', 'Escape the Prototype'],
  ['racing', 'Race Through Brainrot'],
  ['parkour', 'Survive 99 Nights Run'],
  ['parkour', "Escape Freddy's Factory"],
  ['racing', 'Race for a Billion Dollars'],
  ['parkour', 'Climb the Giant Titan'],
  ['racing', 'Drive the Dragon Highway'],
  ['parkour', 'Escape the Brainrot School'],
  ['racing', 'Race Across Lava City'],
  ['parkour', 'Parkour in MrBeast Tower'],
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

console.log('=== Lune compile + structural checks (10 presets) ===');
for (const [gameKind, title] of PRESETS) {
  const spec = deriveGameVisualSpec(gameKind, title, title);
  const r = buildGameplayScript({ title, genre: gameKind, gameKind, systems: ['leaderstats'], jobId: 'smoke', gameVisualSpec: spec });
  const scripts = scriptsOf(r);
  const server = (typeof r === 'string' ? r : r.serverScript) || '';

  let compileErr = null;
  for (const [name, src] of scripts) {
    const e = compileOk(`${gameKind}_${title}_${name}`, src);
    if (e) { compileErr = `${name}: ${e}`; break; }
  }

  let structOk = true;
  const detail = [];
  if (gameKind === 'racing') {
    const need = ['VehicleSeat', 'buildRaceCar', 'LinearVelocity', 'AlignOrientation', 'CARS = {', 'BoostPad_', 'SelectCar', 'StartBanner', 'Coins'];
    for (const n of need) if (!server.includes(n)) { structOk = false; detail.push('missing:' + n); }
    // drift smoke + boost flame present
    if (!/drifting/.test(server)) { structOk = false; detail.push('missing:drift'); }
    // NO floating spawn billboard (old themedSpawnBillboard used AlwaysOnTop=true at StudsOffset 14)
    if (/StudsOffset = Vector3\.new\(0, 14, 0\); _hb\.AlwaysOnTop = true/.test(server)) { structOk = false; detail.push('floating-banner-present'); }
  } else {
    // parkour: still builds, themed palette applied
    const accentApplied = server.includes('SPEC_THEME') || server.includes('theme.checkpoint');
    if (!accentApplied) { structOk = false; detail.push('parkour-theme-missing'); }
  }

  const ok = !compileErr && structOk;
  if (!ok) fails++;
  console.log(`${ok ? 'OK ' : '***'} ${gameKind.padEnd(8)} "${title}" vibe=${spec.vibe} scripts=${scripts.length} compile=${compileErr ? 'FAIL ' + compileErr : 'ok'} ${detail.join(' ')}`);
}

console.log(fails === 0 ? '\n=== ALL CHECKS PASSED ===' : `\n=== ${fails} FAILURES ===`);
process.exit(fails === 0 ? 0 : 1);
