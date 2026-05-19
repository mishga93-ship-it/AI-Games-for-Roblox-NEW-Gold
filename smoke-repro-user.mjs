// Repro user's job 9891932c with the EXACT LLM scene from production logs.
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dist = await import('./apps/functions/dist/robloxWorker.js');

const llmScene = {
  title: 'Stylized Bright Floor Lamp',
  furnitureType: 'lamp',
  boundingBox: [1.4, 4.5, 1.4],
  parts: [
    { name: 'BasePlate',        kind: 'Part', role: 'body',    shape: 'Block',
      position: [0, 0.15, 0], size: [1.20, 0.30, 1.20], color: '#8B5A2B', material: 'Wood' },
    { name: 'CenterPost',       kind: 'Part', role: 'post',    shape: 'Cylinder',
      position: [0, 1.85, 0], size: [0.22, 3.40, 0.22], color: '#3B2F2F', material: 'Metal' },
    { name: 'LowerAccentRing',  kind: 'Part', role: 'trim',    shape: 'Cylinder',
      position: [0, 0.52, 0], size: [0.38, 0.16, 0.38], color: '#3B2F2F', material: 'Metal' },
    { name: 'UpperAccentRing',  kind: 'Part', role: 'trim',    shape: 'Cylinder',
      position: [0, 3.18, 0], size: [0.42, 0.16, 0.42], color: '#3B2F2F', material: 'Metal' },
    { name: 'ShadeBody',        kind: 'Part', role: 'shade',   shape: 'Cylinder',
      position: [0, 3.70, 0], size: [1.05, 1.00, 1.05], color: '#E8D9B0', material: 'Fabric' },
    { name: 'ShadeTopCap',      kind: 'Part', role: 'trim',    shape: 'Cylinder',
      position: [0, 4.26, 0], size: [0.50, 0.15, 0.50], color: '#3B2F2F', material: 'Metal' },
    { name: 'BulbCore',         kind: 'Part', role: 'light',   shape: 'Ball',
      position: [0, 3.72, 0.08], size: [0.42, 0.42, 0.42], color: '#FFE89A', material: 'Neon' },
    { name: 'DecorBandFront',   kind: 'Part', role: 'detail',  shape: 'Block',
      position: [0, 3.70, 0.54], size: [0.60, 0.18, 0.15], color: '#FFE89A', material: 'Neon' },
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
  title: 'Stylized Bright Floor Lamp',
  contentCategory: 'furniture_prop',
  requestedKind: 'furniture_3d',
};

const manifest = dist.buildRobloxManifest({
  title: 'Stylized Bright Floor Lamp',
  summary: 'Repro user job 9891932c',
  target: 'model',
  prompt: 'stylized bright floor lamp',
  starterScript: '',
  metadata,
});

console.log('=== Manifest scene names ===');
const names = manifest.scene
  .filter(n => n.className === 'Part' || n.className === 'Seat')
  .map(n => `${n.name} [${n.className}] shape=${n.properties?.Shape?.enumName ?? '?'}`);
for (const n of names) console.log('  ' + n);

console.log('\n=== Has Fallback* parts? ===');
const fallbacks = names.filter(n => n.startsWith('Fallback'));
console.log(`Fallback parts: ${fallbacks.length}`);
fallbacks.forEach(n => console.log('  ' + n));

console.log('\n=== Has LLM body/post parts? ===');
const llmStructural = names.filter(n => n.startsWith('BasePlate') || n.startsWith('CenterPost'));
console.log(`Structural LLM parts: ${llmStructural.length}`);
llmStructural.forEach(n => console.log('  ' + n));

if (fallbacks.length === 0) {
  console.log('\n!!! HYBRID SKELETON DID NOT FIRE !!!');
  process.exit(1);
}
if (llmStructural.length > 0) {
  console.log('\n!!! LLM structural parts NOT FILTERED !!!');
  process.exit(2);
}
console.log('\n=== OK: hybrid skeleton emitted, LLM structural parts filtered ===');
