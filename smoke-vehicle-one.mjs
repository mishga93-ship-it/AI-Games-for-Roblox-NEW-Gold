// One-off: build a single modular vehicle from a prompt + title and drop
// the .rbxm in ~/Downloads/. Usage:
//   node smoke-vehicle-one.mjs "prompt..." "title..."
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

const PROMPT = process.argv[2] || 'yellow nyc taxi cab';
const TITLE = process.argv[3] || 'NYC Taxi';

const GEMINI_KEY = execSync(
  'PATH=/Users/test/.gcloud-sdk/bin:$PATH gcloud secrets versions access latest --secret=GEMINI_API_KEY --project roblox-ai-generator-v2-2-ios',
  { encoding: 'utf8' },
).trim();
process.env.GEMINI_API_KEY = GEMINI_KEY;

const { prepareModularVehicle } = await import(`${DIST}/vehicleModular.builder.js`);
const uuid = () => crypto.randomUUID();
const SMOKE_TEMP = '/tmp/modular-smoke';
mkdirSync(SMOKE_TEMP, { recursive: true });

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
-- Robust vehicle finder: walks up from script.Parent, then scans workspace,
-- looking for any Model that contains a VehicleSeat descendant (or specific
-- WRAPPER_NAME match as fallback). Robust to wrapper renaming by Lune.
local WRAPPER_NAME = "${safeName}"

local function hasVehicleSeat(m)
\tif not m or not m:IsA("Model") then return false end
\treturn m:FindFirstChildWhichIsA("VehicleSeat", true) ~= nil
end

local function findVehicle()
\t-- 1. Walk up from script.Parent — find closest Model with VehicleSeat.
\tlocal up = script.Parent
\twhile up do
\t\tif hasVehicleSeat(up) then return up end
\t\tup = up.Parent
\tend
\t-- 2. Scan workspace top-level for any Model with VehicleSeat
\t--    matching the wrapper name as a tie-breaker.
\tlocal byName = nil
\tlocal anySeated = nil
\tfor _, c in workspace:GetChildren() do
\t\tif c:IsA("Model") and hasVehicleSeat(c) then
\t\t\tif c.Name == WRAPPER_NAME then byName = c end
\t\t\tif anySeated == nil then anySeated = c end
\t\tend
\tend
\treturn byName or anySeated
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

console.log(`\n▶ ${TITLE}  ("${PROMPT}")`);
const t0 = Date.now();
const prep = await prepareModularVehicle({ prompt: PROMPT, title: TITLE });
console.log(`  router: ${Date.now() - t0}ms`);
console.log(`  preset:        ${prep.config.preset}`);
console.log(`  style:         ${prep.config.style}`);
console.log(`  rarity:        🏆 ${prep.config.rarity.label}  (${prep.config.rarity.colorHex})`);
console.log(`  caption:       "${prep.config.personalityCaption}"`);
console.log(`  primary/accent: ${prep.config.primaryColor} / ${prep.config.accentColor}`);
console.log(`  addons:        ${prep.config.addons.join(', ') || '(none)'}`);
console.log(`  drive:         max=${prep.config.driveStats.maxSpeed}sps drift=${prep.config.driveStats.drift} boost=${prep.config.driveStats.boost || 'none'} susp=${prep.config.driveStats.suspension}`);
console.log(`  rationale:     ${prep.config.rationale}`);

const tplFilename = prep.templateMetadata.vehicleTemplateRbxmFilename;
const tplCopyPath = join(SMOKE_TEMP, `template-${prep.config.preset}.rbxm`);
writeFileSync(tplCopyPath, readFileSync(resolve(TEMPLATES, tplFilename)));
const tplLabel = prep.templateMetadata.vehicleTemplateLabel;
const wrapperId = uuid();
const chassisId = uuid();
const scripts = [
  injectorWrapper('ModularAddonsInjector', 2.5, prep.modularMetadata.vehicleAddonsLuaBlock, tplLabel),
  injectorWrapper('ModularTuningInjector', 3.5, prep.modularMetadata.vehicleTuningLuaBlock, tplLabel),
  injectorWrapper('ModularStyleInjector',  4.5, prep.modularMetadata.vehicleStyleLuaBlock,  tplLabel),
].filter(Boolean);

const manifest = {
  id: uuid(), title: TITLE,
  summary: `${prep.config.preset} — ${prep.config.style} — ${prep.config.rarity.label}`,
  target: 'model', rootClassName: 'Model',
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
  embeddedModels: [{
    id: uuid(), name: tplLabel, parentId: wrapperId,
    contentPath: tplCopyPath, mode: 'vehicle_template',
    preferredVariant: prep.templateMetadata.vehicleTemplatePreferredVariant,
    variantFallbacks: prep.templateMetadata.vehicleTemplateVariantFallbacks ?? [],
    bodyOriginalHex: prep.templateMetadata.vehicleTemplateBodyOriginalHex,
    primaryHex: prep.templateMetadata.vehicleTemplatePrimaryHex,
  }],
  folders: [], parts: [], decals: [], workspaceProps: {},
  metadata: {
    vehicleType: prep.config.preset, vehiclePipeline: 'modular_builder',
    vehicleRarityLabel: prep.config.rarity.label,
    vehiclePersonalityCaption: prep.config.personalityCaption,
  },
};

const safeTitle = TITLE.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const mfPath = `${SMOKE_TEMP}/manifest-${safeTitle}.json`;
const outPath = join(DOWNLOADS, `taxi-${safeTitle}-${Date.now()}.rbxm`);
writeFileSync(mfPath, JSON.stringify(manifest, null, 2));
execSync(`"${LUNE}" run "${BUILDER}" "${mfPath}" "${outPath}" model`, { cwd: ROOT, stdio: 'pipe' });
const sz = execSync(`wc -c < "${outPath}"`, { encoding: 'utf8' }).trim();
console.log(`\n✓ ${outPath}  (${sz} bytes)`);
