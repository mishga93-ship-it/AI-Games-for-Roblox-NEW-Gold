// Session 387 smoke test — exercise the modular AI router locally without
// going through a full Cloud Functions job. Imports the router directly
// (Node ESM, after tsc build).
//
// Run: node smoke-vehicle-modular.mjs
import { execSync } from 'node:child_process';

// Read GEMINI_API_KEY from gcloud secrets so we don't hardcode anything.
const GEMINI_KEY = execSync(
  'PATH=/Users/test/.gcloud-sdk/bin:$PATH gcloud secrets versions access latest --secret=GEMINI_API_KEY --project roblox-ai-generator-v2-2-ios',
  { encoding: 'utf8' },
).trim();
process.env.GEMINI_API_KEY = GEMINI_KEY;

// Stub firebase-functions/params so defineSecret returns a value() backed by env.
// We import after the env is set so the secret read works.
const dist = '/Users/test/Downloads/AI Games for Roblox NEW Gold/apps/functions/dist';
const { routeVehicleConfig } = await import(`${dist}/vehicleModular.router.js`);
const { prepareModularVehicle } = await import(`${dist}/vehicleModular.builder.js`);
const { buildAddonsLuaBlock } = await import(`${dist}/vehicleModular.library.js`);

const TESTS = [
  { prompt: 'yellow nyc taxi cab', title: 'NYC Taxi' },
  { prompt: 'cyberpunk neon sports car with underglow', title: 'Cyber Racer' },
  { prompt: 'monster truck for mud', title: 'Mud Beast' },
  { prompt: 'apocalypse pickup with antenna and roof rack', title: 'Wasteland Truck' },
  { prompt: 'police sedan', title: 'Cop Cruiser' },
];

for (const t of TESTS) {
  console.log(`\n=== ${t.title} (${t.prompt}) ===`);
  try {
    const t0 = Date.now();
    const prep = await prepareModularVehicle({ prompt: t.prompt, title: t.title });
    const dt = Date.now() - t0;
    console.log(`  router latency: ${dt}ms`);
    console.log(`  preset: ${prep.config.preset}`);
    console.log(`  style: ${prep.config.style}`);
    console.log(`  primary: ${prep.config.primaryColor} / accent: ${prep.config.accentColor}`);
    console.log(`  addons: ${prep.config.addons.join(', ') || '(none)'}`);
    console.log(`  drive: ${prep.config.driveStats.maxSpeed}sps drift=${prep.config.driveStats.drift} boost=${prep.config.driveStats.boost || 'none'} susp=${prep.config.driveStats.suspension}`);
    console.log(`  plate: "${prep.config.plateText || '(none)'}"`);
    console.log(`  rationale: ${prep.config.rationale}`);
    console.log(`  templateMetadata.vehicleTemplateRbxmFilename = ${prep.templateMetadata.vehicleTemplateRbxmFilename}`);
    console.log(`  templateMetadata.vehicleTemplatePrimaryHex = ${prep.templateMetadata.vehicleTemplatePrimaryHex}`);
    console.log(`  modularMetadata.vehicleAddonsLuaBlock = ${prep.modularMetadata.vehicleAddonsLuaBlock.length} chars`);
  } catch (err) {
    console.error(`  ✗ FAILED: ${err.message ?? err}`);
  }
}

console.log('\n✓ smoke done');
