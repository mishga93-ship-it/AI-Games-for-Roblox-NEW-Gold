// Standalone modular-vehicle .rbxm builder — bypasses Cloud Functions
// auth so the user can grab a real .rbxm without iOS or chat.
//
// What it does for each prompt:
//   1. Reads GEMINI_API_KEY from gcloud secrets.
//   2. Calls prepareModularVehicle() (same code Cloud Functions runs).
//   3. Builds a Lune-compatible manifest manually with:
//        - wrapper Model
//        - embedded vehicle template (mode: vehicle_template)
//        - 3 injector scripts (addons + tuning + style)
//   4. Runs build_roblox.luau via Lune → .rbxm bytes
//   5. Writes ~/Downloads/modular-<title>-<ts>.rbxm
//
// Run: node smoke-vehicle-modular-build.mjs
import { execSync } from 'node:child_process';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import crypto from 'node:crypto';

const ROOT = '/Users/test/Downloads/AI Games for Roblox NEW Gold';
const LUNE = `${ROOT}/.local-tools/lune/lune`;
const BUILDER = `${ROOT}/apps/worker-service/runtime/lune/build_roblox.luau`;
const DIST = `${ROOT}/apps/functions/dist`;
const TEMPLATES = `${ROOT}/apps/functions/templates`;
const DOWNLOADS = join(homedir(), 'Downloads');

// Load secret + run.
const GEMINI_KEY = execSync(
  'PATH=/Users/test/.gcloud-sdk/bin:$PATH gcloud secrets versions access latest --secret=GEMINI_API_KEY --project roblox-ai-generator-v2-2-ios',
  { encoding: 'utf8' },
).trim();
process.env.GEMINI_API_KEY = GEMINI_KEY;

const { prepareModularVehicle } = await import(`${DIST}/vehicleModular.builder.js`);

const uuid = () => crypto.randomUUID();

const TESTS = [
  { title: 'NYC Yellow Taxi',     prompt: 'yellow nyc taxi cab' },
  { title: 'Cyberpunk Drift Car', prompt: 'cyberpunk neon drift sports car with underglow and big wing' },
  { title: 'Mud Monster Truck',   prompt: 'apocalypse monster truck for mud with antenna and rust' },
];

// ─── Inline wrappers (mirror robloxWorker.ts injector builders) ─────────

const injectorWrapper = (scriptName, waitSec, luaBlock, wrapperName) => {
  if (!luaBlock || luaBlock.trim().length === 0) return null;
  const safeName = wrapperName.replace(/"/g, '\\"');
  const indented = luaBlock.split('\n').map((l) => '\t' + l).join('\n');
  return {
    id: uuid(),
    name: scriptName,
    scriptType: 'Script',
    container: 'WorkspaceRoot',
    source: `-- ${scriptName} (auto-generated for local smoke)
local WRAPPER_NAME = "${safeName}"
local function findVehicle()
\tlocal up = script.Parent
\twhile up do
\t\tif up:IsA("Model") and up.Name == WRAPPER_NAME then return up end
\t\tup = up.Parent
\tend
\tfor _, c in workspace:GetChildren() do
\t\tif c:IsA("Model") and c.Name == WRAPPER_NAME then return c end
\tend
\treturn nil
end
task.wait(${waitSec})
local vehicleModel = findVehicle()
if not vehicleModel then warn("[${scriptName}] not found:", WRAPPER_NAME); return end
print("[${scriptName}] running on", vehicleModel:GetFullName())
local ok, err = pcall(function()
${indented}
end)
if not ok then warn("[${scriptName}] block failed:", tostring(err)) else print("[${scriptName}] done") end
`,
  };
};

function buildManifest(prep, smokeTempDir) {
  const title = `Modular ${prep.config.preset}`;
  const wrapperId = uuid();
  const chassisId = uuid();

  // Lune builder reads embedded.contentPath (NOT contentBase64).
  // In prod worker-service converts base64→tempFile before calling Lune;
  // smoke bypasses worker-service so we do it here.
  const tplFilename = prep.templateMetadata.vehicleTemplateRbxmFilename;
  const tplSourcePath = resolve(TEMPLATES, tplFilename);
  // Symlink/copy template into smoke temp dir so Lune reads it from there.
  const tplCopyPath = join(smokeTempDir, `template-${prep.config.preset}.rbxm`);
  const tplBytes = readFileSync(tplSourcePath);
  writeFileSync(tplCopyPath, tplBytes);
  const tplLabel = prep.templateMetadata.vehicleTemplateLabel;
  const tplPreferred = prep.templateMetadata.vehicleTemplatePreferredVariant;

  // Vehicle controller can't be re-emitted (template has its own).
  // We just stuff our 3 modular injector scripts as WorkspaceRoot Scripts.
  const scripts = [
    injectorWrapper('ModularAddonsInjector', 2.5, prep.modularMetadata.vehicleAddonsLuaBlock, tplLabel),
    injectorWrapper('ModularTuningInjector', 3.5, prep.modularMetadata.vehicleTuningLuaBlock, tplLabel),
    injectorWrapper('ModularStyleInjector',  4.5, prep.modularMetadata.vehicleStyleLuaBlock,  tplLabel),
  ].filter(Boolean);

  return {
    id: uuid(),
    title,
    summary: `Modular ${prep.config.preset} — ${prep.config.style} style — ${prep.config.rarity.label}`,
    target: 'model',
    rootClassName: 'Model',
    rootProperties: { PrimaryPart: { __type: 'Ref', id: chassisId } },
    scene: [
      { id: wrapperId, className: 'Model', name: tplLabel, parentId: null, properties: { Name: tplLabel } },
      { id: chassisId, className: 'Part', name: 'ChassisRoot', parentId: wrapperId, properties: {
        Size: { __type: 'Vector3', x: 8, y: 0.5, z: 14 },
        CFrame: { __type: 'CFrame', position: { x: 0, y: 4, z: 0 }, rotation: [0, 0, 0] },
        Anchored: false, CanCollide: false, Transparency: 1, Massless: true,
      }},
    ],
    scripts,
    embeddedModels: [
      {
        id: uuid(),
        name: tplLabel,
        parentId: wrapperId,
        // Lune reads contentPath (file on disk). Worker-service writes
        // base64→tempFile in prod; smoke does it inline above.
        contentPath: tplCopyPath,
        mode: 'vehicle_template',
        preferredVariant: tplPreferred,
        variantFallbacks: prep.templateMetadata.vehicleTemplateVariantFallbacks ?? [],
        bodyOriginalHex: prep.templateMetadata.vehicleTemplateBodyOriginalHex,
        primaryHex: prep.templateMetadata.vehicleTemplatePrimaryHex,
      },
    ],
    folders: [],
    parts: [],
    decals: [],
    workspaceProps: {},
    metadata: {
      vehicleType: prep.config.preset,
      vehicleTemplateLabel: tplLabel,
      vehiclePipeline: 'modular_builder',
      vehicleRarityLabel: prep.config.rarity.label,
      vehiclePersonalityCaption: prep.config.personalityCaption,
    },
  };
}

const SMOKE_TEMP = '/tmp/modular-smoke';
mkdirSync(SMOKE_TEMP, { recursive: true });

for (const t of TESTS) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`▶ ${t.title}  ("${t.prompt}")`);
  console.log('='.repeat(60));
  const t0 = Date.now();
  const prep = await prepareModularVehicle({ prompt: t.prompt, title: t.title });
  const tRouter = Date.now() - t0;
  console.log(`  router: ${tRouter}ms`);
  console.log(`  preset:        ${prep.config.preset}`);
  console.log(`  style:         ${prep.config.style}`);
  console.log(`  rarity:        🏆 ${prep.config.rarity.label}  (${prep.config.rarity.colorHex})`);
  console.log(`  caption:       "${prep.config.personalityCaption}"`);
  console.log(`  primary/accent: ${prep.config.primaryColor} / ${prep.config.accentColor}`);
  console.log(`  addons:        ${prep.config.addons.join(', ') || '(none)'}`);
  console.log(`  drive:         max=${prep.config.driveStats.maxSpeed}sps drift=${prep.config.driveStats.drift} boost=${prep.config.driveStats.boost || 'none'} susp=${prep.config.driveStats.suspension}`);
  console.log(`  lua blocks:    addons=${prep.modularMetadata.vehicleAddonsLuaBlock.length}ch | tuning=${prep.modularMetadata.vehicleTuningLuaBlock.length}ch | style=${prep.modularMetadata.vehicleStyleLuaBlock.length}ch`);

  const manifest = buildManifest(prep, SMOKE_TEMP);
  const safeTitle = t.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const mfPath = `/tmp/modular-smoke/manifest-${safeTitle}.json`;
  const outPath = join(DOWNLOADS, `modular-${safeTitle}-${Date.now()}.rbxm`);
  writeFileSync(mfPath, JSON.stringify(manifest, null, 2));

  const tBuild0 = Date.now();
  try {
    execSync(`"${LUNE}" run "${BUILDER}" "${mfPath}" "${outPath}" model`, {
      cwd: ROOT,
      stdio: 'pipe',
    });
    const tBuild = Date.now() - tBuild0;
    console.log(`  build:         ${tBuild}ms`);
    const stat = execSync(`wc -c < "${outPath}"`, { encoding: 'utf8' }).trim();
    console.log(`  ✓ wrote        ${outPath}  (${stat} bytes)`);
  } catch (err) {
    console.error(`  ✗ Lune build FAILED:`, err.message ?? err);
    if (err.stderr) console.error(err.stderr.toString().slice(0, 500));
  }
}

console.log('\n✓ done — open files in Roblox Studio (drag into Workspace, press Play).');
