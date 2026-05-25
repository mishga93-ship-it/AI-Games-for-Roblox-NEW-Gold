// Round 20L (session 381) — smoke: rebuild Tank + Plane + Boat + Moto rbxm
// via Lune with bbox-normalize + outlier-filter, verify centred at origin.
//
// Usage: node smoke-vehicle-bbox-normalize.mjs
//
// IMPORTANT: builds as `model` target (not `place`) so the output rbxm
// can be drag-and-dropped into Studio Workspace. With `place` target
// Studio's drag-and-drop prompts "Insert→Service" because root is
// DataModel — see session 381 (user reported this on first round of
// round-20L-*.rbxm).
//
// What this guards:
//   - build_roblox.luau:493+ vehicle_template branch must:
//     1. center every variant at (X=0, Z=0, Y_bottom=0)
//     2. drop creator world-props (Regen Button) and far decorations
//        (RocketLaunchers at 90+ studs from fuselage)
//   - Regression triggers: PASS → FAIL means user gets back the
//     "tank invisible / plane scattered" symptom from Round 20J/20K.
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const LUNE = join(ROOT, '.local-tools/lune/lune');
const BUILD = join(ROOT, 'apps/worker-service/runtime/lune/build_roblox.luau');
const INSPECT = join(ROOT, 'apps/worker-service/runtime/lune/inspect_vehicle_visual.luau');
const TPL = join(ROOT, 'apps/functions/templates');
const OUT_DIR = '/tmp/smoke-vehicle-bbox';

const SCENARIOS = [
  { name: 'tank',  template: 'Tank-101512952.rbxm',         preferredVariant: 'DrivableTank',  bodyOriginalHex: '#F2F3F3', primaryHex: '#2C3E16' },
  { name: 'plane', template: 'Plane-81606616.rbxm',         preferredVariant: 'regening plane', bodyOriginalHex: '#3A7D15', primaryHex: '#FFFFFF' },
  { name: 'boat',  template: 'Boat-30309891.rbxm',          preferredVariant: 'Model',         bodyOriginalHex: '#FFCC99', primaryHex: '#F2B807' },
  { name: 'moto',  template: 'Motorcycle-17388481396.rbxm', preferredVariant: 'Dirt bike.',    bodyOriginalHex: '#111111', primaryHex: '#1A1A1A' },
];

mkdirSync(OUT_DIR, { recursive: true });

let allOk = true;
for (const s of SCENARIOS) {
  const manifest = {
    target: 'place',
    scene: [],
    scripts: [],
    workspaceProps: {},
    folders: [],
    parts: [],
    decals: [],
    embeddedModels: [{
      id: `tpl-${s.name}`,
      name: s.name,
      parentId: 'WorkspaceRoot',
      contentPath: join(TPL, s.template),
      mode: 'vehicle_template',
      preferredVariant: s.preferredVariant,
      variantFallbacks: [],
      bodyOriginalHex: s.bodyOriginalHex,
      primaryHex: s.primaryHex,
    }],
  };
  const mfPath = join(OUT_DIR, `${s.name}-manifest.json`);
  const outPath = join(OUT_DIR, `${s.name}.rbxm`);
  const inspPath = join(OUT_DIR, `${s.name}-inspect.json`);
  writeFileSync(mfPath, JSON.stringify(manifest, null, 2));
  try {
    execSync(`"${LUNE}" run "${BUILD}" "${mfPath}" "${outPath}" model`, { cwd: ROOT, encoding: 'utf8' });
    if (!existsSync(outPath)) throw new Error('no output rbxm');
    execSync(`"${LUNE}" run "${INSPECT}" "${outPath}" "${inspPath}"`, { cwd: ROOT, encoding: 'utf8' });
    const insp = JSON.parse(execSync(`cat "${inspPath}"`, { encoding: 'utf8' }));
    const parts = insp.parts.filter(p => p.position);
    if (parts.length === 0) throw new Error('0 parts after build');
    const xs = parts.map(p => p.position.x);
    const zs = parts.map(p => p.position.z);
    const minY = parts.reduce((m, p) => Math.min(m, p.position.y - p.size.y / 2), Infinity);
    const ctrX = (Math.min(...xs) + Math.max(...xs)) / 2;
    const ctrZ = (Math.min(...zs) + Math.max(...zs)) / 2;
    const spreadX = Math.max(...xs) - Math.min(...xs);
    const spreadZ = Math.max(...zs) - Math.min(...zs);

    // assertions
    const tol = 5;
    const okX = Math.abs(ctrX) < tol;
    const okZ = Math.abs(ctrZ) < tol;
    const okY = Math.abs(minY) < 2;
    // largest legitimate vehicle bbox dimension: 60 studs (boat). > 80 means scattered survivors.
    const okSpreadX = spreadX < 80;
    const okSpreadZ = spreadZ < 80;
    const ok = okX && okZ && okY && okSpreadX && okSpreadZ;

    console.log(`[${s.name}] parts=${parts.length}  ctrX=${ctrX.toFixed(2)}${okX?'✓':'✗'}  ctrZ=${ctrZ.toFixed(2)}${okZ?'✓':'✗'}  minY=${minY.toFixed(2)}${okY?'✓':'✗'}  spread=${spreadX.toFixed(0)}×${spreadZ.toFixed(0)}${okSpreadX&&okSpreadZ?'✓':'✗'}  ${ok ? '✅' : '❌'}`);
    if (!ok) allOk = false;
  } catch (e) {
    console.error(`[${s.name}] FAIL:`, e.message.slice(0, 300));
    allOk = false;
  }
}

if (!allOk) {
  console.error('\n❌ at least one vehicle failed bbox-normalize/outlier-filter');
  process.exit(1);
}
console.log('\n✅ all 4 vehicles normalized to origin & spread within bounds');
