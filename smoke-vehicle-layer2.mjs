// Smoke test for Layer 2 visual heuristics in deterministicVehicleReview.
// Builds the post-Layer-1 manifest and runs the QA gate through the compiled functions module.
// Then mocks a degenerate "all-red slab" manifest to ensure new checks REJECT it.

import { buildRobloxManifest } from './apps/functions/dist/robloxWorker.js';
import fs from 'node:fs';

// We need to test computeVehicleVisualFacts indirectly via deterministicVehicleReview,
// but that function isn't exported. Instead, we reimplement the visual checks here in JS
// using the SAME thresholds and verify they would fire on the right manifests.

const BODY_NAME_RX = /(BodyShell|CabinShell|RoofPanel|Hood|CargoBlock|SidePanel|Fender|Underbody|Bumper|Hull|Fuselage|Cabin)/i;
const GLASS_NAME_RX = /(Windshield|RearGlass|FrontWindow|RearWindow|Glass|CockpitGlass|WindDeflector)/i;
const SKIP_RX = /(QARepair|Trim|Light|Tail|Spoke|Hub|Mirror|Plate|Stripe|Handle|Seam|Slat|Skirt|Rack)/i;
const HIDDEN_RX = /(Root|Chassis|Collider|Attach|Constraint)/i;

function visualFacts(manifest) {
  const parts = manifest.scene.filter((n) => n.className === 'Part');
  const boxes = parts.map((p) => {
    const props = p.properties ?? {};
    const size = props.Size ?? { x: 0, y: 0, z: 0 };
    const pos = (props.CFrame ?? {}).position ?? { x: 0, y: 0, z: 0 };
    const col = props.Color ?? { r: 0, g: 0, b: 0 };
    const mat = String(props.Material ?? '');
    const transparency = Number(props.Transparency ?? 0);
    const sx = +size.x, sy = +size.y, sz = +size.z;
    const isHiddenHelper = HIDDEN_RX.test(p.name) || transparency >= 0.95;
    const isGlass = !isHiddenHelper && (mat === 'Glass' || (transparency >= 0.3 && transparency < 0.95)) && !SKIP_RX.test(p.name);
    const isBody = !isGlass && !isHiddenHelper && !SKIP_RX.test(p.name) && BODY_NAME_RX.test(p.name);
    const colorKey = `${Math.round((+col.r) * 20)}_${Math.round((+col.g) * 20)}_${Math.round((+col.b) * 20)}`;
    return { name: p.name, cy: +pos.y, cz: +pos.z, sx, sy, sz, volume: sx*sy*sz, transparency, isGlass, isBody, colorKey };
  });
  const bodyBoxes = boxes.filter((b) => b.isBody);
  const totalBody = bodyBoxes.reduce((a,b)=>a+b.volume,0);
  const byColor = new Map();
  for (const b of bodyBoxes) byColor.set(b.colorKey, (byColor.get(b.colorKey)||0)+b.volume);
  const dominant = Math.max(0, ...Array.from(byColor.values()));
  const monochromeBodyShare = totalBody > 0 ? dominant/totalBody : 0;

  const layerNames = ['FamilyCarUnderbody','FamilyCarBodyShell','FamilyCarCabinShell','FamilyCarRoofPanel'];
  const ys = boxes.filter((b) => layerNames.includes(b.name)).map(b=>b.cy);
  const bodyVerticalLayerRange = ys.length >= 2 ? Math.max(...ys) - Math.min(...ys) : 0;

  const sideArea = (b) => b.sx*b.sy;
  const glassArea = boxes.filter(b=>b.isGlass).reduce((a,b)=>a+sideArea(b),0);
  const bodyArea = bodyBoxes.reduce((a,b)=>a+sideArea(b),0);
  const glassToBodyAreaRatio = bodyArea > 0 ? glassArea/bodyArea : 0;

  const sw = boxes.find(b=>b.name==='FamilyCarSteeringWheelVisible');
  const cabin = boxes.find(b=>b.name==='FamilyCarCabinShell');
  const roof = boxes.find(b=>b.name==='FamilyCarRoofPanel');
  const windshield = boxes.find(b=>b.name==='FamilyCarWindshieldLarge');
  let steeringWheelVisibleThroughWindshield = false;
  if (sw && cabin && roof && windshield) {
    const cabinTop = cabin.cy + cabin.sy/2;
    const cabinBottom = cabin.cy - cabin.sy/2;
    const inCabin = sw.cy >= cabinBottom && sw.cy <= roof.cy + roof.sy/2;
    const inFront = windshield.cz < sw.cz;
    const transparentEnough = windshield.transparency >= 0.3;
    const swBand = sw.cy >= cabinTop - cabin.sy*0.5 && sw.cy <= cabinTop + 0.6;
    steeringWheelVisibleThroughWindshield = inCabin && inFront && transparentEnough && swBand;
  }
  return { monochromeBodyShare, bodyVerticalLayerRange, glassToBodyAreaRatio, steeringWheelVisibleThroughWindshield };
}

function buildGoodManifest() {
  return buildRobloxManifest({
    title: 'L2 Good Smoke',
    summary: 'Layer 2 good family sedan smoke',
    target: 'model',
    prompt: 'Make me a family sedan',
    starterScript: '-- smoke',
    metadata: { requestedKind: 'vehicle_3d', vehicleType: 'car', contentCategory: 'vehicle', contentSubcategory: 'vehicles' },
  });
}

// Construct a degenerate slab manifest to confirm Layer 2 would REJECT it.
function buildSlabManifest() {
  const m = buildGoodManifest();
  const red = { __type: 'Color3', r: 0.88, g: 0.1, b: 0.12 };
  // Force every body part to the same red color and collapse Y so no vertical separation.
  for (const node of m.scene) {
    if (node.className !== 'Part') continue;
    const p = node.properties;
    if (!p || !p.Color) continue;
    if (BODY_NAME_RX.test(node.name) && !GLASS_NAME_RX.test(node.name)) {
      p.Color = { ...red };
    }
    if (['FamilyCarUnderbody','FamilyCarBodyShell','FamilyCarCabinShell','FamilyCarRoofPanel'].includes(node.name)) {
      if (p.CFrame?.position) p.CFrame.position.y = 2.0; // collapse to one plane
    }
    // Shrink windows to almost nothing & make them opaque (so they no longer count as glass)
    if (String(p.Material ?? '') === 'Glass' || GLASS_NAME_RX.test(node.name)) {
      if (p.Size) { p.Size.x = 0.1; p.Size.y = 0.05; p.Size.z = 0.05; }
      p.Material = 'SmoothPlastic';
      p.Transparency = 0.05;
    }
    // Hide steering wheel below cabin
    if (node.name === 'FamilyCarSteeringWheelVisible') {
      if (p.CFrame?.position) p.CFrame.position.y = 0.5;
    }
  }
  return m;
}

let fails = 0;

const good = buildGoodManifest();
const goodFacts = visualFacts(good);
console.log('GOOD manifest facts:', JSON.stringify(goodFacts, null, 2));

if (goodFacts.monochromeBodyShare >= 0.8) { console.log('FAIL — good manifest flagged as monochrome'); fails += 1; }
else console.log(`PASS — monochromeBodyShare=${goodFacts.monochromeBodyShare.toFixed(3)} < 0.8`);

if (goodFacts.bodyVerticalLayerRange < 1.2) { console.log(`FAIL — good manifest layer range ${goodFacts.bodyVerticalLayerRange} < 1.2`); fails += 1; }
else console.log(`PASS — bodyVerticalLayerRange=${goodFacts.bodyVerticalLayerRange.toFixed(2)} >= 1.2`);

if (goodFacts.glassToBodyAreaRatio < 0.08) { console.log(`FAIL — good manifest glass ratio ${goodFacts.glassToBodyAreaRatio} < 0.08`); fails += 1; }
else console.log(`PASS — glassToBodyAreaRatio=${goodFacts.glassToBodyAreaRatio.toFixed(3)} >= 0.08`);

if (!goodFacts.steeringWheelVisibleThroughWindshield) { console.log('FAIL — steering wheel not visible through windshield in good manifest'); fails += 1; }
else console.log('PASS — steering wheel visible through windshield');

console.log('\n--- SLAB regression ---');
const slab = buildSlabManifest();
fs.writeFileSync('/tmp/vehicle-layer2-slab-manifest.json', JSON.stringify(slab, null, 2));
const slabFacts = visualFacts(slab);
console.log('SLAB manifest facts:', JSON.stringify(slabFacts, null, 2));

// Debug: which parts still count as glass in the slab?
const slabParts = slab.scene.filter((n) => n.className === 'Part');
const stillGlass = slabParts.filter((p) => {
  const props = p.properties ?? {};
  const mat = String(props.Material ?? '');
  const t = Number(props.Transparency ?? 0);
  return (mat === 'Glass' || t >= 0.3) && !SKIP_RX.test(p.name);
});
console.log('  Slab parts still counted as glass:', stillGlass.map((p) => `${p.name}(t=${p.properties?.Transparency},mat=${p.properties?.Material},size=${p.properties?.Size?.x}x${p.properties?.Size?.y})`).slice(0, 20));

if (slabFacts.monochromeBodyShare < 0.8) { console.log('FAIL — slab should be flagged monochrome'); fails += 1; }
else console.log('PASS — slab caught as monochrome');

if (slabFacts.bodyVerticalLayerRange >= 1.2) { console.log('FAIL — slab should have collapsed layers'); fails += 1; }
else console.log('PASS — slab caught as flat layers');

if (slabFacts.glassToBodyAreaRatio >= 0.08) { console.log('FAIL — slab should have low glass ratio'); fails += 1; }
else console.log('PASS — slab caught as low glass area');

if (slabFacts.steeringWheelVisibleThroughWindshield) { console.log('FAIL — slab should have hidden steering wheel'); fails += 1; }
else console.log('PASS — slab caught as steering hidden');

if (fails === 0) { console.log('\nLAYER 2 SMOKE: PASS'); process.exit(0); }
console.log(`\nLAYER 2 SMOKE: ${fails} FAILURE(S)`); process.exit(1);
