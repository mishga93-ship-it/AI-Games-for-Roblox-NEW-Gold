// Smoke test for Layer 1 family-sedan visual differentiation.
// Builds a car manifest, dumps it to /tmp, and asserts the new visual properties.
import { buildRobloxManifest } from './apps/functions/dist/robloxWorker.js';
import fs from 'node:fs';

const manifest = buildRobloxManifest({
  title: 'Layer 1 Smoke Family Sedan',
  summary: 'Family sedan smoke test for Layer 1 visual differentiation',
  target: 'model',
  prompt: 'Make me a family sedan',
  starterScript: '-- smoke',
  metadata: {
    requestedKind: 'vehicle_3d',
    vehicleType: 'car',
    contentCategory: 'vehicle',
    contentSubcategory: 'vehicles',
  },
});

const outPath = '/tmp/vehicle-layer1-manifest.json';
fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2));
console.log(`Manifest dumped: ${outPath}`);

const partByName = (n) => manifest.scene.find((s) => s.name === n);

function expectColor(name, expectedRoleHex, props) {
  const c = props?.Color ?? props?.color ?? null;
  const r = c?.r ?? null;
  const g = c?.g ?? null;
  const b = c?.b ?? null;
  console.log(`  ${name} color: r=${r}, g=${g}, b=${b}`);
  return { r, g, b };
}

function colorMostlyEqual(a, b, eps = 0.05) {
  if (!a || !b) return false;
  return Math.abs(a.r - b.r) < eps && Math.abs(a.g - b.g) < eps && Math.abs(a.b - b.b) < eps;
}

let fails = 0;

// Check 1: RoofPanel exists and is NOT same color as BodyShell
const body = partByName('FamilyCarBodyShell');
const roof = partByName('FamilyCarRoofPanel');
if (!body || !roof) {
  console.log('FAIL — missing body or roof part');
  fails += 1;
} else {
  const bodyColor = expectColor('Body', '', body.properties);
  const roofColor = expectColor('Roof', '', roof.properties);
  if (colorMostlyEqual(bodyColor, roofColor)) {
    console.log('FAIL — Roof color equals Body color (visual sliab risk)');
    fails += 1;
  } else {
    console.log('PASS — Roof color differs from Body color');
  }
}

// Check 2: Windshield transparency >= 0.35
const ws = partByName('FamilyCarWindshieldLarge');
const wsT = ws?.properties?.Transparency ?? ws?.properties?.transparency ?? null;
console.log(`  Windshield Transparency = ${wsT}`);
if (wsT === null || wsT < 0.35) {
  console.log('FAIL — Windshield transparency below 0.35');
  fails += 1;
} else {
  console.log('PASS — Windshield transparency >= 0.35');
}

// Check 3: SteeringWheelVisible diameter >= 1.2 stud
const sw = partByName('FamilyCarSteeringWheelVisible');
const swSize = sw?.properties?.Size ?? sw?.properties?.size ?? null;
console.log(`  SteeringWheel size = ${JSON.stringify(swSize)}`);
const diam = swSize && typeof swSize === 'object' ? Math.max(swSize.y ?? 0, swSize.z ?? 0) : null;
if (diam === null || diam < 1.2) {
  console.log(`FAIL — Steering wheel diameter ${diam} below 1.2`);
  fails += 1;
} else {
  console.log(`PASS — Steering wheel diameter ${diam} >= 1.2`);
}

// Check 4: New trim parts exist
const newParts = [
  'FamilyCarHoodToWindshieldTrim',
  'FamilyCarCargoToRearGlassTrim',
  'FamilyCarRoofEdgeTrim',
  'FamilyCarFrontBeltLineSegment',
  'FamilyCarRearBeltLineSegment',
];
for (const n of newParts) {
  if (!partByName(n)) {
    console.log(`FAIL — missing new part ${n}`);
    fails += 1;
  } else {
    console.log(`PASS — new part ${n} present`);
  }
}

// Check 5: Total part count
const partCount = manifest.scene.filter((n) => n.className === 'Part' || n.className === 'VehicleSeat' || n.className === 'Seat').length;
console.log(`  Total part count: ${partCount}`);
if (partCount < 105) {
  console.log(`FAIL — part count ${partCount} below required 105`);
  fails += 1;
} else {
  console.log(`PASS — part count ${partCount} >= 105 (QA min)`);
}

if (fails === 0) {
  console.log('\nLAYER 1 SMOKE: PASS');
  process.exit(0);
} else {
  console.log(`\nLAYER 1 SMOKE: ${fails} FAILURE(S)`);
  process.exit(1);
}
