// Smoke for LLM-scene composer path (session 373 contract):
//   * Procedural family-sedan baseline ALWAYS emits structural parts.
//   * LLM scene contributes ACCENT roles only (trim/spoiler/mirror/
//     headlight/taillight) prefixed with `LLMAccent_`.
//   * Structural LLM roles (body/hood/cabin/roof/etc.) are silently dropped.

import { buildRobloxManifest } from './apps/functions/dist/robloxWorker.js';

function buildCar(extraMeta = {}) {
  return buildRobloxManifest({
    title: 'LLM Scene Smoke Car',
    summary: 'llm scene smoke',
    target: 'model',
    prompt: 'A bright neon sports car with glowing trim',
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

// A) no vehicleScene → fallback procedural
const a = buildCar();
const aParts = a.scene.filter((n) => n.className === 'Part').map((n) => n.name);
console.log(`A) no scene → ${aParts.length} parts`);
const hasFamilyBody = aParts.includes('FamilyCarBodyShell');
const hasSceneRoot = a.scene.some((n) => /VehicleSceneRoot/.test(n.name));
if (!hasFamilyBody) { console.log('   FAIL — fallback should emit FamilyCarBodyShell'); fails++; }
if (hasSceneRoot) { console.log('   FAIL — fallback should NOT emit VehicleSceneRoot marker'); fails++; }
if (hasFamilyBody && !hasSceneRoot) console.log('   PASS fallback');

// B) with vehicleScene JSON
const fakeScene = {
  vehicleType: 'car',
  bodyStyle: 'sports_coupe',
  parts: [
    { name: 'BodyShell', role: 'body', shape: 'Block', size: [5.9, 1.4, 6.6], position: [0, 2.7, 0], color: '#FF00FF', material: 'SmoothPlastic' },
    { name: 'HoodWedge', role: 'hood', shape: 'Wedge', size: [5.5, 0.7, 2.5], position: [0, 3.0, -3.0], rotation: [8, 0, 0], color: '#FF00FF', material: 'SmoothPlastic' },
    { name: 'CabinShell', role: 'cabin', shape: 'Block', size: [4.8, 1.8, 3.8], position: [0, 4.5, -0.2], color: '#15161A', material: 'SmoothPlastic' },
    { name: 'RoofPanel', role: 'roof', shape: 'Block', size: [5.0, 0.5, 4.4], position: [0, 5.6, -0.1], color: '#15161A', material: 'Metal' },
    { name: 'WindshieldFront', role: 'windshield', shape: 'Block', size: [3.7, 1.4, 0.15], position: [0, 4.7, -2.3], rotation: [18, 0, 0], color: '#7FC8FF', material: 'Glass', transparency: 0.45 },
    { name: 'LeftHeadlight', role: 'headlight', shape: 'Ball', size: [0.5, 0.5, 0.5], position: [-1.5, 2.9, -3.3], color: '#FFEE88', material: 'Neon' },
    { name: 'RightHeadlight', role: 'headlight', shape: 'Ball', size: [0.5, 0.5, 0.5], position: [1.5, 2.9, -3.3], color: '#FFEE88', material: 'Neon' },
  ],
};

const b = buildCar({ vehicleScene: JSON.stringify(fakeScene) });
const bParts = b.scene.filter((n) => n.className === 'Part' || n.className === 'WedgePart' || n.className === 'CornerWedgePart').map((n) => n.name);
console.log(`\nB) with LLM scene (additive) → ${bParts.length} parts`);
const familyShellAlsoPresent = bParts.includes('FamilyCarBodyShell');
const accentLeftHeadlight = bParts.includes('LLMAccent_LeftHeadlight');
const accentRightHeadlight = bParts.includes('LLMAccent_RightHeadlight');
const structuralBodyDropped = !bParts.includes('BodyShell') && !bParts.includes('LLMAccent_BodyShell');
const structuralCabinDropped = !bParts.includes('CabinShell') && !bParts.includes('LLMAccent_CabinShell');
const structuralHoodDropped = !bParts.includes('HoodWedge') && !bParts.includes('LLMAccent_HoodWedge');
const structuralWindshieldDropped = !bParts.includes('WindshieldFront') && !bParts.includes('LLMAccent_WindshieldFront');
const hasSceneMarker = b.scene.some((n) => /VehicleSceneRoot/.test(n.name));
const wheels = b.scene.filter((n) => /^Wheel[1-4]$/.test(n.name)).length;
const hasDriveSeat = b.scene.some((n) => n.className === 'VehicleSeat' && n.name === 'DriveSeat');

if (!familyShellAlsoPresent) { console.log('   FAIL — baseline FamilyCarBodyShell should still emit alongside LLM accents'); fails++; } else console.log('   PASS baseline FamilyCarBodyShell present');
if (!accentLeftHeadlight) { console.log('   FAIL — LLMAccent_LeftHeadlight missing'); fails++; } else console.log('   PASS LLMAccent_LeftHeadlight present');
if (!accentRightHeadlight) { console.log('   FAIL — LLMAccent_RightHeadlight missing'); fails++; } else console.log('   PASS LLMAccent_RightHeadlight present');
if (!structuralBodyDropped) { console.log('   FAIL — LLM body role should be dropped'); fails++; } else console.log('   PASS LLM body role dropped');
if (!structuralCabinDropped) { console.log('   FAIL — LLM cabin role should be dropped'); fails++; } else console.log('   PASS LLM cabin role dropped');
if (!structuralHoodDropped) { console.log('   FAIL — LLM hood role should be dropped'); fails++; } else console.log('   PASS LLM hood role dropped');
if (!structuralWindshieldDropped) { console.log('   FAIL — LLM windshield role should be dropped'); fails++; } else console.log('   PASS LLM windshield role dropped');
if (!hasSceneMarker) { console.log('   FAIL — VehicleSceneRoot marker missing'); fails++; } else console.log('   PASS scene marker present');
if (wheels !== 4) { console.log(`   FAIL — expected 4 wheels, got ${wheels}`); fails++; } else console.log('   PASS chassis: 4 wheels');
if (!hasDriveSeat) { console.log('   FAIL — DriveSeat missing'); fails++; } else console.log('   PASS chassis: DriveSeat');

if (fails === 0) console.log('\nLLM SCENE SMOKE: PASS');
else { console.log(`\nLLM SCENE SMOKE: ${fails} FAILURE(S)`); process.exit(1); }
