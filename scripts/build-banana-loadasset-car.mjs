// Session 425 — build a drivable car whose BODY is the user's own banana asset
// (loaded at runtime via InsertService:LoadAsset). Output: ~/Downloads/BANANA-CAR-FIXED-*.rbxm
//   node scripts/build-banana-loadasset-car.mjs
import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const ROOT = '/Users/test/Downloads/AI Games for Roblox NEW Gold';
const LUNE = `${ROOT}/.local-tools/lune/lune`;
const BUILDER = `${ROOT}/apps/worker-service/runtime/lune/build_roblox.luau`;
const DIST = `${ROOT}/apps/functions/dist`;
const DOWNLOADS = join(homedir(), 'Downloads');

const ASSET_ID = 125046486429412; // user's banana Model (uploaded under their account)

const { buildBrainrotLuaBlock } = await import(`${DIST}/vehicleModular.library.js`);
const { buildRobloxManifest } = await import(`${DIST}/robloxWorker.js`);

const rainbow = buildBrainrotLuaBlock({ head: '', engine: 'normal', wheels: 'normal', effects: ['rainbow'], sizeMultiplier: 1 });
const title = 'Banana Car';
const metadata = {
  requestedKind: 'vehicle_3d',
  contentCategory: 'vehicle',
  title,
  vehicleType: 'car',
  primaryColor: '#F2D21E',
  accentColor: '#7A4B12',
  vehicleTemplateRbxmFilename: '',
  vehicleBodyLoadAssetId: ASSET_ID,
  vehicleAddonsLuaBlock: rainbow,
  vehicleBrainrotName: title,
};

const manifest = buildRobloxManifest({
  title, summary: 'Banana car (your asset as the body)', target: 'model',
  prompt: 'banana car', starterScript: '', metadata,
});
console.log(`manifest: ${manifest.scene.length} scene nodes, ${manifest.scripts.length} scripts`);
console.log('scripts:', manifest.scripts.map((s) => s.name).join(', '));

mkdirSync('/tmp/brainrot-build', { recursive: true });
const mfPath = '/tmp/brainrot-build/manifest-banana-car.json';
const outPath = join(DOWNLOADS, `BANANA-CAR-FIXED-${Date.now()}.rbxm`);
writeFileSync(mfPath, JSON.stringify(manifest));
execSync(`"${LUNE}" run "${BUILDER}" "${mfPath}" "${outPath}" model`, { cwd: ROOT, stdio: 'pipe' });
console.log(`\n✓ wrote ${outPath}`);
