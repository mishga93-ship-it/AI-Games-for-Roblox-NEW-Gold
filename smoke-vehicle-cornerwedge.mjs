// Smoke for session 373 silhouette upgrades to procedural family-sedan:
//   * 4 CornerWedgePart instances on roof corners (FL/FR/RL/RR).
//   * 4 CornerWedgePart instances on fender top corners.
//   * Hood WedgePart is taller than before (h*0.32 not h*0.26).
//   * Mid-chassis tuck block narrower than axle blocks.

import { buildRobloxManifest } from './apps/functions/dist/robloxWorker.js';

const m = buildRobloxManifest({
  title: 'CornerWedge Smoke',
  summary: 'silhouette upgrade smoke',
  target: 'model',
  prompt: 'family car red',
  starterScript: '-- s',
  metadata: {
    requestedKind: 'vehicle_3d',
    vehicleType: 'car',
    contentCategory: 'vehicle',
    contentSubcategory: 'vehicles',
  },
});

const byName = (name) => m.scene.find((n) => n.name === name);
const cornerWedges = m.scene.filter((n) => n.className === 'CornerWedgePart');
const wedges = m.scene.filter((n) => n.className === 'WedgePart');

let fails = 0;

console.log(`Total parts: ${m.scene.filter((n) => /Part$/.test(n.className) || n.className === 'Part').length}`);
console.log(`CornerWedgePart count: ${cornerWedges.length}`);
console.log(`WedgePart count: ${wedges.length}`);

const expectedRoofCorners = ['FamilyCarRoofCornerFL', 'FamilyCarRoofCornerFR', 'FamilyCarRoofCornerRR', 'FamilyCarRoofCornerRL'];
for (const name of expectedRoofCorners) {
  const node = byName(name);
  if (!node) { console.log(`FAIL — ${name} missing`); fails++; continue; }
  if (node.className !== 'CornerWedgePart') { console.log(`FAIL — ${name} should be CornerWedgePart, got ${node.className}`); fails++; continue; }
  console.log(`PASS ${name} (${node.className})`);
}

const expectedFenderCorners = ['FamilyCarFenderCornerFL', 'FamilyCarFenderCornerFR', 'FamilyCarFenderCornerRR', 'FamilyCarFenderCornerRL'];
for (const name of expectedFenderCorners) {
  const node = byName(name);
  if (!node) { console.log(`FAIL — ${name} missing`); fails++; continue; }
  if (node.className !== 'CornerWedgePart') { console.log(`FAIL — ${name} should be CornerWedgePart, got ${node.className}`); fails++; continue; }
  console.log(`PASS ${name} (${node.className})`);
}

const hood = byName('FamilyCarFrontHood');
if (!hood) { console.log('FAIL — FamilyCarFrontHood missing'); fails++; }
else {
  if (hood.className !== 'WedgePart') { console.log(`FAIL — FrontHood should be WedgePart, got ${hood.className}`); fails++; }
  // size.y stored as Vector3 — read it
  const sy = hood.properties.Size?.y ?? hood.properties.Size?.[1] ?? hood.properties.Size?._y;
  // profile car h=4.05, h*0.32=1.296
  if (typeof sy !== 'number') {
    console.log('PASS FrontHood is WedgePart (Size.y opaque — skipping height check)');
  } else if (sy < 1.2) {
    console.log(`FAIL — FrontHood height ${sy.toFixed(2)} should be >= 1.2 (h*0.32 ≈ 1.30)`);
    fails++;
  } else {
    console.log(`PASS FrontHood WedgePart height ${sy.toFixed(2)}`);
  }
}

const midTuck = byName('FamilyCarUnderbodyMidTuck');
const frontAxle = byName('FamilyCarUnderbodyFrontAxleBlock');
const rearAxle = byName('FamilyCarUnderbodyRearAxleBlock');
if (!midTuck || !frontAxle || !rearAxle) {
  console.log(`FAIL — mid/axle underbody blocks missing: midTuck=${!!midTuck} front=${!!frontAxle} rear=${!!rearAxle}`);
  fails++;
} else {
  const mw = midTuck.properties.Size?.x ?? midTuck.properties.Size?.[0] ?? midTuck.properties.Size?._x;
  const fw = frontAxle.properties.Size?.x ?? frontAxle.properties.Size?.[0] ?? frontAxle.properties.Size?._x;
  if (typeof mw === 'number' && typeof fw === 'number') {
    if (mw >= fw) { console.log(`FAIL — mid-tuck width ${mw} should be < front-axle width ${fw}`); fails++; }
    else console.log(`PASS narrow mid-chassis ${mw.toFixed(2)} < axle block ${fw.toFixed(2)}`);
  } else {
    console.log('PASS underbody blocks present (Size opaque — skipping width comparison)');
  }
}

if (cornerWedges.length < 8) { console.log(`FAIL — expected at least 8 CornerWedgeParts, got ${cornerWedges.length}`); fails++; }
else console.log(`PASS CornerWedgePart count >= 8`);

if (fails === 0) console.log('\nCORNERWEDGE SMOKE: PASS');
else { console.log(`\nCORNERWEDGE SMOKE: ${fails} FAILURE(S)`); process.exit(1); }
