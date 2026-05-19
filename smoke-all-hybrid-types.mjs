// Smoke for session 358 — hybrid skeleton for ALL load-bearing furniture types.
// Feeds a worst-case LLM scene for each type (with mislabeled-role structural parts)
// through the deployed buildRobloxManifest and asserts:
//   1. The deterministic skeleton fired (Fallback... parts emitted).
//   2. Mislabeled structural parts (role=post/leg/body/etc.) were filtered out.
//   3. BuilderVersion StringValue with v2 marker is present.

import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dist = await import('./apps/functions/dist/robloxWorker.js');

const cases = [
  {
    label: 'CHAIR',
    type: 'chair',
    // LLM emits a bad chair: BadLeg=horizontal block, BadSeat=role=body.
    // Builder should ignore both and emit FallbackChairSeat + 4 FallbackChairLegs + ChairBack.
    parts: [
      { name: 'BadLeg', role: 'leg', shape: 'Block', position: [0, 0.4, 0], size: [2.0, 0.3, 0.3], color: '#6B4423', material: 'Wood' },
      { name: 'BadSeatBody', role: 'body', shape: 'Block', position: [0, 2.0, 0], size: [2.0, 0.4, 2.0], color: '#8B5A2B', material: 'Wood' },
      { name: 'BackPillow', role: 'decor', shape: 'Block', position: [0, 1.9, 0.7], size: [1.6, 0.2, 0.15], color: '#FF8888', material: 'Fabric' },
    ],
    expectFallbackPrefix: ['FallbackChairSeat', 'FallbackChairBack', 'FallbackChairLeg'],
    expectFiltered: ['BadLeg', 'BadSeatBody'],
    expectKept: ['BackPillow'],
  },
  {
    label: 'TABLE',
    type: 'table',
    // LLM emits "decorative legs above the tabletop" (user's actual complaint).
    parts: [
      { name: 'BadTopColumn1', role: 'post', shape: 'Block', position: [-1.5, 3.0, -1.0], size: [0.3, 1.5, 0.3], color: '#8B5A2B', material: 'Wood' },
      { name: 'BadTopColumn2', role: 'support', shape: 'Block', position: [1.5, 3.0, -1.0], size: [0.3, 1.5, 0.3], color: '#8B5A2B', material: 'Wood' },
      { name: 'BadCenterPost', role: 'leg', shape: 'Cylinder', position: [0, 3.0, 0], size: [0.3, 1.8, 0.3], color: '#6B4423', material: 'Wood' },
      { name: 'TableRunner', role: 'trim', shape: 'Block', position: [0, 2.0, 0], size: [3.0, 0.04, 0.8], color: '#D9C39C', material: 'Fabric' },
      { name: 'CenterVase', role: 'decor', shape: 'Cylinder', position: [0, 2.3, 0], size: [0.5, 0.5, 0.5], color: '#3B2F2F', material: 'Metal' },
    ],
    expectFallbackPrefix: ['FallbackTableTop', 'FallbackTableLeg'],
    expectFiltered: ['BadTopColumn1', 'BadTopColumn2', 'BadCenterPost'],
    expectKept: ['TableRunner', 'CenterVase'],
  },
  {
    label: 'SHELF',
    type: 'shelf',
    parts: [
      { name: 'BadVerticalPole', role: 'post', shape: 'Cylinder', position: [0, 2.0, 0], size: [0.3, 4.0, 0.3], color: '#6B4423', material: 'Wood' },
      { name: 'Book1', role: 'decor', shape: 'Block', position: [-1.0, 0.6, 0], size: [0.30, 0.20, 0.15], color: '#5C4033', material: 'WoodPlanks' },
      { name: 'Vase', role: 'decor', shape: 'Ball', position: [0.8, 3.8, 0], size: [0.35, 0.35, 0.35], color: '#5C4033', material: 'Marble' },
    ],
    expectFallbackPrefix: ['FallbackShelfBack', 'FallbackShelfLeftSide', 'FallbackShelfRightSide', 'FallbackShelfBoard'],
    expectFiltered: ['BadVerticalPole'],
    expectKept: ['Book1', 'Vase'],
  },
  {
    label: 'BED',
    type: 'bed',
    parts: [
      { name: 'BadLeg1', role: 'leg', shape: 'Block', position: [2.0, 0.2, 0], size: [0.3, 0.4, 0.3], color: '#3B2F2F', material: 'Wood' },
      { name: 'BadMattressBody', role: 'body', shape: 'Block', position: [0, 1.2, 0], size: [4.5, 0.5, 2.6], color: '#E8D9B0', material: 'Fabric' },
      { name: 'Blanket', role: 'trim', shape: 'Block', position: [0, 1.55, 0.4], size: [4.0, 0.05, 1.8], color: '#8B0000', material: 'Fabric' },
      { name: 'ExtraPillow', role: 'decor', shape: 'Block', position: [0.8, 1.7, -1.2], size: [0.9, 0.18, 0.5], color: '#FFF8DC', material: 'Fabric' },
    ],
    expectFallbackPrefix: ['FallbackBedLeg', 'FallbackBedFrame', 'FallbackBedMattress', 'FallbackBedPillow', 'FallbackBedHeadboard', 'FallbackBedFootboard'],
    expectFiltered: ['BadLeg1', 'BadMattressBody'],
    expectKept: ['Blanket', 'ExtraPillow'],
  },
];

let failures = 0;
for (const c of cases) {
  console.log(`\n=== Smoke: ${c.label} ===`);
  const llmScene = {
    title: `Test ${c.label}`,
    furnitureType: c.type,
    boundingBox: [4, 4, 3],
    parts: c.parts.map(p => ({ kind: 'Part', material: 'SmoothPlastic', ...p })),
  };
  const metadata = {
    furnitureType: c.type,
    furnitureBuildMode: 'parts',
    furnitureResolvedBuildMode: 'parts',
    furnitureLLMScene: JSON.stringify(llmScene),
    requestedKind: 'furniture_3d',
  };
  const manifest = dist.buildRobloxManifest({
    title: `Test ${c.label}`,
    summary: 'smoke',
    target: 'model',
    prompt: `${c.type} test`,
    starterScript: '',
    metadata,
  });
  const names = manifest.scene
    .filter(n => n.className === 'Part' || n.className === 'Seat')
    .map(n => n.name);
  const stringValues = manifest.scene
    .filter(n => n.className === 'StringValue')
    .map(n => ({ name: n.name, value: n.properties?.Value }));

  // Assert: all expected Fallback* prefixes appear
  for (const prefix of c.expectFallbackPrefix) {
    const matched = names.filter(n => n.startsWith(prefix));
    if (matched.length === 0) {
      console.log(`  FAIL: missing skeleton part with prefix "${prefix}"`);
      failures++;
    } else {
      console.log(`  PASS: skeleton "${prefix}" → ${matched.join(', ')}`);
    }
  }
  // Assert: filtered parts are NOT in manifest
  for (const filteredName of c.expectFiltered) {
    if (names.includes(filteredName)) {
      console.log(`  FAIL: filtered part "${filteredName}" leaked into manifest`);
      failures++;
    } else {
      console.log(`  PASS: filtered "${filteredName}" — correctly dropped`);
    }
  }
  // Assert: kept accents are in manifest
  for (const keptName of c.expectKept) {
    if (!names.includes(keptName)) {
      console.log(`  FAIL: accent "${keptName}" missing from manifest`);
      failures++;
    } else {
      console.log(`  PASS: accent "${keptName}" preserved`);
    }
  }
  // Assert: BuilderVersion StringValue present with v2
  const bv = stringValues.find(s => s.name === 'BuilderVersion');
  if (!bv) {
    console.log(`  FAIL: BuilderVersion StringValue missing`);
    failures++;
  } else if (!String(bv.value).startsWith('hybrid-skeleton-v')) {
    console.log(`  FAIL: BuilderVersion "${bv.value}" doesn't match "hybrid-skeleton-v*"`);
    failures++;
  } else {
    console.log(`  PASS: BuilderVersion = "${bv.value}"`);
  }
}

console.log(`\n=== ${failures === 0 ? 'ALL ASSERTIONS PASSED' : `${failures} ASSERTIONS FAILED`} ===`);
process.exit(failures === 0 ? 0 : 1);
