// Smoke for Layer 3 ASCII silhouette: same manifest as Layer 1 should produce
// a side view where R (roof) is at the top, C (cabin) and G (glass) in the middle,
// B (body) below, S (steering) inside cabin band, W (wheels) at the bottom edges.

import { buildRobloxManifest } from './apps/functions/dist/robloxWorker.js';

function ROLE(name) {
  if (/SteeringWheelVisible/i.test(name)) return 'S';
  if (/^Wheel\d+$|ChromeOuterRim|VisibleRim|TireSidewallStripe|BrakeDisc/i.test(name)) return 'W';
  if (/Windshield|RearGlass|FrontWindow|RearWindow|Glass(?!.*Trim)|CockpitGlass/i.test(name)) return 'G';
  if (/Roof(Panel|Edge)/i.test(name)) return 'R';
  if (/CabinShell|CabinBackPanel|InteriorFloor|Dashboard/i.test(name)) return 'C';
  if (/BodyShell|Hood|CargoBlock|Fender|Bumper|SidePanel|Underbody|Hull|Fuselage/i.test(name)) return 'B';
  return '';
}

function silhouette(manifest) {
  const COLS = 24, ROWS = 12;
  const parts = manifest.scene.filter((n) => n.className === 'Part');
  const boxes = parts.map((p) => {
    const props = p.properties ?? {};
    const size = props.Size ?? { x: 0, y: 0, z: 0 };
    const pos = (props.CFrame ?? {}).position ?? { x: 0, y: 0, z: 0 };
    const transparency = Number(props.Transparency ?? 0);
    return { name: p.name, cy: +pos.y, cz: +pos.z, sy: +size.y, sz: +size.z, transparency };
  });
  const visible = boxes.filter((b) => b.transparency < 0.95);
  if (!visible.length) return '(empty)';
  const yLo = Math.min(...visible.map((b) => b.cy - b.sy/2));
  const yHi = Math.max(...visible.map((b) => b.cy + b.sy/2));
  const zLo = Math.min(...visible.map((b) => b.cz - b.sz/2));
  const zHi = Math.max(...visible.map((b) => b.cz + b.sz/2));
  const yRange = Math.max(yHi - yLo, 0.0001);
  const zRange = Math.max(zHi - zLo, 0.0001);
  const grid = Array.from({length:ROWS},()=>Array.from({length:COLS},()=>'.'));
  const PRI = { '.':0,B:1,C:2,R:3,W:4,G:5,S:6 };
  for (const b of visible) {
    const role = ROLE(b.name);
    if (!role) continue;
    const zCol0 = Math.max(0, Math.floor(((b.cz - b.sz/2) - zLo) / zRange * COLS));
    const zCol1 = Math.min(COLS-1, Math.floor(((b.cz + b.sz/2) - zLo) / zRange * COLS));
    const yRow0 = Math.max(0, Math.floor(((b.cy - b.sy/2) - yLo) / yRange * ROWS));
    const yRow1 = Math.min(ROWS-1, Math.floor(((b.cy + b.sy/2) - yLo) / yRange * ROWS));
    for (let yRow = yRow0; yRow <= yRow1; yRow++) {
      for (let zCol = zCol0; zCol <= zCol1; zCol++) {
        const yIdx = ROWS-1-yRow;
        if ((PRI[role]||0) > (PRI[grid[yIdx][zCol]]||0)) grid[yIdx][zCol] = role;
      }
    }
  }
  return grid.map(r=>r.join('')).join('\n');
}

const good = buildRobloxManifest({
  title: 'L3 ASCII Good',
  summary: 'L3 good',
  target: 'model',
  prompt: 'Family sedan',
  starterScript: '-- s',
  metadata: { requestedKind: 'vehicle_3d', vehicleType: 'car', contentCategory: 'vehicle', contentSubcategory: 'vehicles' },
});

const ascii = silhouette(good);
console.log('GOOD silhouette:');
console.log(ascii);
console.log();

let fails = 0;
const rows = ascii.split('\n');
// Top rows should mention R; middle should have C/G; bottom should have W
const topRows = rows.slice(0, 4).join('');
const midRows = rows.slice(3, 8).join('');
const bottomRows = rows.slice(8).join('');
if (!topRows.includes('R')) { console.log('FAIL — no R in top 4 rows'); fails++; } else console.log('PASS — R found in top band');
if (!midRows.includes('C')) { console.log('FAIL — no C in middle band'); fails++; } else console.log('PASS — C found in middle band');
if (!midRows.includes('G')) { console.log('FAIL — no G in middle band'); fails++; } else console.log('PASS — G found in middle band');
if (!midRows.includes('S')) { console.log('FAIL — no S in middle band'); fails++; } else console.log('PASS — S found in middle band (steering visible)');
if (!bottomRows.includes('W')) { console.log('FAIL — no W in bottom band'); fails++; } else console.log('PASS — W found in bottom band');
if (!bottomRows.includes('B') && !midRows.includes('B')) { console.log('FAIL — no B at all'); fails++; } else console.log('PASS — B (body) visible');

if (fails === 0) { console.log('\nLAYER 3 SMOKE: PASS'); process.exit(0); }
console.log(`\nLAYER 3 SMOKE: ${fails} FAILURE(S)`); process.exit(1);
