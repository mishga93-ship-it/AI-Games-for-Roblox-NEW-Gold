// Session 425 — smoke test: emit brainrot vehicle Lua for a matrix of slot
// values and run each through lune luau.compile to catch Lua syntax errors
// (tsc cannot — the builders emit Lua as strings). Run AFTER `npm run build
// --workspace apps/functions` so dist/ is fresh.
//
//   node scripts/smoke-brainrot.mjs
//
import { buildBrainrotLuaBlock } from '../apps/functions/dist/vehicleModular.library.js';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const LUNE = process.env.LUNE_BIN
  || join(process.cwd(), '.local-tools/lune/lune');

const heads = ['capybara', 'cat', 'shark', 'doge', 'frog', 'chicken', 'gorilla', 'alien', ''];
const engines = ['jet', 'rocket', 'nuclear', 'propeller', 'normal'];
const wheels = ['hover', 'rocket', 'monster_truck', 'tank_tracks', 'tiny', 'normal'];
const effects = ['rainbow', 'fire', 'lightning', 'confetti', 'sparkles', 'smoke'];

const cases = [];
for (const h of heads) cases.push({ head: h, engine: 'jet', wheels: 'normal', effects: ['rainbow'], sizeMultiplier: 2 });
for (const e of engines) cases.push({ head: 'capybara', engine: e, wheels: 'normal', effects: [], sizeMultiplier: 3 });
for (const w of wheels) cases.push({ head: 'cat', engine: 'normal', wheels: w, effects: [], sizeMultiplier: 1 });
for (const fx of effects) cases.push({ head: '', engine: 'normal', wheels: 'normal', effects: [fx], sizeMultiplier: 5 });
// kitchen-sink: every effect + head + rocket engine + hover wheels at max size
cases.push({ head: 'shark', engine: 'rocket', wheels: 'hover', effects: [...effects], sizeMultiplier: 4 });

const dir = mkdtempSync(join(tmpdir(), 'brainrot-smoke-'));
let pass = 0;
const failures = [];

for (let i = 0; i < cases.length; i++) {
  const lua = buildBrainrotLuaBlock(cases[i]);
  if (!lua) { pass++; continue; } // empty block (e.g. all-normal) is valid
  // Provide a vehicleModel stub so the chunk mirrors the real loader context.
  // (luau.compile is syntax-only, but this keeps the test realistic.)
  const chunk = `local vehicleModel = workspace\n${lua}\n`;
  const f = join(dir, `case-${i}.luau`);
  writeFileSync(f, chunk);
  try {
    const out = execFileSync(LUNE, ['run', 'scripts/smoke-brainrot.luau', f], { encoding: 'utf8' });
    if (out.includes('LUAU_OK')) { pass++; }
    else { failures.push({ i, case: cases[i], out }); }
  } catch (err) {
    failures.push({ i, case: cases[i], out: (err.stdout || '') + (err.stderr || '') + err.message });
  }
}

console.log(`\nbrainrot Lua smoke: ${pass} ok, ${failures.length} fail (of ${cases.length} cases)`);
for (const f of failures) {
  console.error(`  FAIL case ${f.i}: ${JSON.stringify(f.case)}\n    ${String(f.out).trim().split('\n').join('\n    ')}`);
}
process.exit(failures.length > 0 ? 1 : 0);
