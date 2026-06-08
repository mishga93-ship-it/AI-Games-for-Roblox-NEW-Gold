// Session 418: validate keyword asset packs — matching, cap, and Lune compile.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { pickThemeAssets, themeAssetScatterLua } from './apps/functions/dist/data/themeAssetPacks.js';

const PRES = [
  ['parkour', 'Escape the Prototype'],
  ['racing', 'Race Through Brainrot'],
  ['parkour', 'Survive 99 Nights Run'],
  ['parkour', "Escape Freddy's Factory"],
  ['racing', 'Race for a Billion Dollars MrBeast'],
  ['parkour', 'Climb the Giant Titan'],
  ['racing', 'Drive the Dragon Highway'],
  ['parkour', 'Escape the Brainrot School'],
  ['racing', 'Race Across Lava City'],
  ['parkour', 'Parkour in MrBeast Tower'],
];

let fails = 0;
for (const [g, t] of PRES) {
  const ids = pickThemeAssets(t, 6);
  const lua = themeAssetScatterLua(t, g);
  let compile = '(empty - no theme match)';
  if (lua) {
    const f = '/tmp/scatter_' + t.replace(/[^a-z0-9]/gi, '_') + '.luau';
    writeFileSync(f, lua);
    const r = execFileSync('./.local-tools/lune/lune', ['run', './.local-tools/check-luau.luau', f], { encoding: 'utf8' }).trim();
    compile = r.startsWith('COMPILE_OK') ? 'ok' : 'FAIL ' + r;
    if (!r.startsWith('COMPILE_OK')) fails++;
  }
  if (ids.length > 6) fails++;
  const ok = compile === 'ok' || compile.startsWith('(empty');
  console.log(`${ok ? 'OK ' : '***'} ${g.padEnd(8)} "${t}" -> ${ids.length} assets [${ids.join(',')}] compile=${compile}`);
}
console.log(fails === 0 ? '\n=== ALL OK ===' : `\n=== ${fails} FAIL ===`);
process.exit(fails ? 1 : 0);
