// Smoke for vehicle mesh integration (Tripo v2.5 → Roblox Open Cloud).
// (a) WITHOUT vehicleMeshAssetId: fallback to procedural family-sedan (140+ parts).
// (b) WITH vehicleMeshAssetId (number > 0): emits a MeshPart 'VehicleMeshBody'
//     with MeshContent=rbxassetid://<id>; drops procedural family-sedan parts;
//     keeps wheels/seats/physics.

import { buildRobloxManifest } from './apps/functions/dist/robloxWorker.js';
import fs from 'node:fs';

function buildCar(extraMeta = {}) {
  return buildRobloxManifest({
    title: 'Mesh Smoke Car',
    summary: 'mesh smoke',
    target: 'model',
    prompt: 'Blue and white cartoon family sedan',
    starterScript: '-- s',
    metadata: {
      requestedKind: 'vehicle_3d',
      vehicleType: 'car',
      contentCategory: 'vehicle',
      contentSubcategory: 'vehicles',
      ...extraMeta,
    },
  });
}

let fails = 0;

// ============ A: Fallback (no mesh URL) ============
const a = buildCar();
const aParts = a.scene.filter((n) => n.className === 'Part').map((n) => n.name);
const aHasFamily = aParts.includes('FamilyCarBodyShell');
const aHasMesh = a.scene.some((n) => n.className === 'MeshPart' && n.name === 'VehicleMeshBody');
console.log(`A) no mesh URL → parts=${aParts.length}`);
console.log(`   FamilyCarBodyShell present: ${aHasFamily}`);
console.log(`   VehicleMeshBody present: ${aHasMesh}`);
if (!aHasFamily) { console.log('   FAIL — fallback should emit FamilyCarBodyShell'); fails++; }
if (aHasMesh) { console.log('   FAIL — mesh body should not appear in fallback'); fails++; }
if (aParts.length < 100) { console.log('   FAIL — fallback should still have rich family-sedan parts'); fails++; }
if (aHasFamily && !aHasMesh && aParts.length >= 100) console.log('   PASS fallback');

// ============ B: With mesh asset id ============
const MESH_ASSET_ID = 1234567890;
const EXPECTED_CONTENT = `rbxassetid://${MESH_ASSET_ID}`;
const b = buildCar({ vehicleMeshAssetId: MESH_ASSET_ID });
const bMesh = b.scene.find((n) => n.className === 'MeshPart' && n.name === 'VehicleMeshBody');
const bHasFamily = b.scene.some((n) => n.name === 'FamilyCarBodyShell');
console.log(`\nB) with mesh asset id ${MESH_ASSET_ID}`);
console.log(`   VehicleMeshBody present: ${!!bMesh}`);
console.log(`   MeshContent: ${bMesh?.properties?.MeshContent}`);
console.log(`   FamilyCarBodyShell present: ${bHasFamily}`);
const hasWheels = b.scene.filter((n) => /^Wheel[1-4]$/.test(n.name)).length;
const hasDriveSeat = b.scene.some((n) => n.className === 'VehicleSeat' && n.name === 'DriveSeat');
console.log(`   Wheel count: ${hasWheels}`);
console.log(`   DriveSeat present: ${hasDriveSeat}`);

if (!bMesh) { console.log('   FAIL — mesh asset id should add VehicleMeshBody'); fails++; }
else if (bMesh.properties?.MeshContent !== EXPECTED_CONTENT) { console.log(`   FAIL — MeshContent ${bMesh.properties?.MeshContent} != ${EXPECTED_CONTENT}`); fails++; }
if (bHasFamily) { console.log('   FAIL — mesh branch must NOT also emit FamilyCarBodyShell'); fails++; }
if (hasWheels !== 4) { console.log(`   FAIL — 4 wheels expected, got ${hasWheels}`); fails++; }
if (!hasDriveSeat) { console.log('   FAIL — DriveSeat must be present in mesh branch'); fails++; }
if (bMesh && bMesh.properties?.MeshContent === EXPECTED_CONTENT && !bHasFamily && hasWheels === 4 && hasDriveSeat) {
  console.log('   PASS mesh branch');
}

fs.writeFileSync('/tmp/vehicle-mesh-fallback.json', JSON.stringify(a, null, 2));
fs.writeFileSync('/tmp/vehicle-mesh-branch.json', JSON.stringify(b, null, 2));

if (fails === 0) console.log('\nSMOKE: PASS');
else { console.log(`\nSMOKE: ${fails} FAILURE(S)`); process.exit(1); }
