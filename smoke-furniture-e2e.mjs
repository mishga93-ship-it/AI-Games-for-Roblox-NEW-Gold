// End-to-end smoke for session 353 + session 355.
// Imports the deployed buildRobloxManifest from dist/, feeds it a worst-case LLM
// lamp scene (badly-labeled post + horizontal Block + accents), prints emitted
// Size+CFrame for every part, then pipes the manifest through Lune (build_roblox.luau)
// and re-parses the .rbxm to verify world-space orientation.

import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dist = await import('./apps/functions/dist/robloxWorker.js');

// Worst-case LLM lamp scene:
//   1. A "Post" Block that the LLM mis-labeled role="body" and pre-rotated horizontally
//      (size=[2.8, 0.3, 0.3]). The hybrid skeleton must filter this out (role=body is
//      not in the accent allow-list), AND the aspect-ratio safety net would normalize
//      Y as the longest dim if it were emitted.
//   2. An LLM "MainPost" with role="post" (also explicitly filtered for hybrid types).
//   3. Good LLM accents (role=light, role=trim, role=shade) — should pass.
const llmScene = {
  title: 'Tester Lamp',
  furnitureType: 'lamp',
  boundingBox: [1.4, 3.5, 1.4],
  parts: [
    { name: 'MislabeledPost', kind: 'Part', role: 'body', shape: 'Block',
      position: [0, 1.5, 0], size: [2.8, 0.3, 0.3], color: '#3B2F2F', material: 'Metal' },
    { name: 'MainPost', kind: 'Part', role: 'post', shape: 'Cylinder',
      position: [0, 1.55, 0], size: [2.6, 0.32, 0.32], color: '#3B2F2F', material: 'Metal' },
    { name: 'ShadeBody', kind: 'Part', role: 'shade', shape: 'Cylinder',
      position: [0, 3.05, 0], size: [1.0, 0.7, 1.0], color: '#E8D9B0', material: 'Fabric' },
    { name: 'LightCore', kind: 'Part', role: 'light', shape: 'Ball',
      position: [0, 2.85, 0], size: [0.4, 0.4, 0.4], color: '#FFE89A', material: 'Neon' },
    { name: 'ShadeRim', kind: 'Part', role: 'trim', shape: 'Cylinder',
      position: [0, 3.40, 0], size: [1.05, 0.06, 1.05], color: '#3B2F2F', material: 'Metal' },
  ],
};

const metadata = {
  furnitureType: 'lamp',
  furnitureBuildMode: 'parts',
  furnitureResolvedBuildMode: 'parts',
  furnitureLLMScene: JSON.stringify(llmScene),
  primaryColor: '#E8D9B0',
  accentColor: '#3B2F2F',
  glowColor: '#FFE89A',
  scale: 'medium',
  title: 'Tester Lamp',
};

const manifest = dist.buildRobloxManifest({
  title: 'Tester Lamp',
  summary: 'Smoke',
  target: 'model',
  prompt: 'A bedside reading lamp with cylindrical pole and round shade',
  starterScript: '',
  metadata: { ...metadata, requestedKind: 'furniture_3d' },
});

console.log('=== Emitted manifest scene ===');
const emittedNames = new Set();
for (const node of manifest.scene) {
  if (node.className !== 'Part' && node.className !== 'Seat' && node.className !== 'MeshPart') continue;
  emittedNames.add(node.name);
  const sz = node.properties?.Size;
  const cf = node.properties?.CFrame;
  const shape = node.properties?.Shape;
  if (!sz || !cf) continue;
  const rotation = Array.isArray(cf.rotation) ? cf.rotation : null;
  console.log(`- ${node.name} [${node.className}] shape=${shape?.enumName ?? '?'}`);
  console.log(`    Size = (${sz.x.toFixed(3)}, ${sz.y.toFixed(3)}, ${sz.z.toFixed(3)})`);
  console.log(`    Pos  = (${cf.position.x.toFixed(3)}, ${cf.position.y.toFixed(3)}, ${cf.position.z.toFixed(3)})`);
  console.log(`    Rot  = [${rotation ? rotation.join(', ') : '?'}]`);
}

// Assertions on the manifest.
let assertFailures = 0;
const expect = (cond, label) => {
  if (cond) console.log(`  ASSERT PASS: ${label}`);
  else { console.log(`  ASSERT FAIL: ${label}`); assertFailures++; }
};
console.log('\n=== Manifest assertions ===');
expect(emittedNames.has('FallbackLampBase'),  'Deterministic FallbackLampBase emitted');
expect(emittedNames.has('FallbackLampPole'),  'Deterministic FallbackLampPole emitted');
expect(emittedNames.has('FallbackLampShade'), 'Deterministic FallbackLampShade emitted');
expect(!emittedNames.has('MislabeledPost'),   'Mislabeled-role=body Block was filtered out');
expect(!emittedNames.has('MainPost'),         'Role=post LLM cylinder was filtered out (hybrid types)');
expect(emittedNames.has('ShadeBody'),         'role=shade accent passed through');
expect(emittedNames.has('LightCore'),         'role=light accent passed through');
expect(emittedNames.has('ShadeRim'),          'role=trim accent passed through');

// Now: build the actual .rbxm bytes via Lune and inspect them.
const tmp = mkdtempSync(join(tmpdir(), 'furniture-smoke-'));
const manifestPath = join(tmp, 'manifest.json');
const rbxmPath = join(tmp, 'out.rbxm');
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

const luneRes = spawnSync(
  './.local-tools/lune/lune',
  ['run', 'apps/worker-service/runtime/lune/build_roblox.luau', manifestPath, rbxmPath, 'model'],
  { encoding: 'utf8' },
);
if (luneRes.status !== 0) {
  console.error('\nLune build failed:', luneRes.stderr || luneRes.stdout);
  process.exit(2);
}

console.log(`\n=== Built .rbxm: ${rbxmPath} ===`);
const sz = readFileSync(rbxmPath).length;
console.log(`Size: ${sz} bytes`);

// Re-parse the .rbxm via Lune to dump per-Part CFrame as seen by Roblox runtime.
const inspectScript = `
local roblox = require("@lune/roblox")
local fs = require("@lune/fs")
local bytes = fs.readFile("${rbxmPath}")
local roots = (roblox :: any).deserializeModel(bytes)
for _, root in ipairs(roots) do
  print(string.format("Root: %s [%s]", root.Name, root.ClassName))
  for _, d in ipairs(root:GetDescendants()) do
    if d:IsA("BasePart") then
      local cf = d.CFrame
      local sz = d.Size
      local shape = nil
      pcall(function() shape = tostring(d.Shape) end)
      print(string.format("  %s shape=%s Size=(%.3f,%.3f,%.3f) RightVec=(%.2f,%.2f,%.2f) UpVec=(%.2f,%.2f,%.2f) Pos=(%.2f,%.2f,%.2f)",
        d.Name, shape or "?", sz.X, sz.Y, sz.Z,
        cf.RightVector.X, cf.RightVector.Y, cf.RightVector.Z,
        cf.UpVector.X, cf.UpVector.Y, cf.UpVector.Z,
        cf.Position.X, cf.Position.Y, cf.Position.Z))
    end
  end
end
`;
const inspectPath = join(tmp, 'inspect.luau');
writeFileSync(inspectPath, inspectScript, 'utf8');

const inspect = spawnSync('./.local-tools/lune/lune', ['run', inspectPath], { encoding: 'utf8' });
console.log('\n=== Inspected .rbxm contents ===');
console.log(inspect.stdout || inspect.stderr);

rmSync(tmp, { recursive: true, force: true });

console.log(`\n=== ${assertFailures === 0 ? 'ALL ASSERTIONS PASSED' : `${assertFailures} ASSERTIONS FAILED`} ===`);
process.exit(assertFailures === 0 ? 0 : 1);
