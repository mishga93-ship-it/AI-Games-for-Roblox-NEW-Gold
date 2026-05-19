// Smoke test for session 353 cylinder fix.
// Verifies that pickCylinderAxis + cylinderRotationFor + permutedSizeForCylinder
// produce the expected rotations for canonical furniture cases (lamp pole, lamp base,
// horizontal pipe). No backend invocation — pure math check.

function pickCylinderAxis(size) {
  const [sx, sy, sz] = size;
  const cand = [
    { axis: 0, ratio: Math.min(sy, sz) / Math.max(sy, sz), len: sx },
    { axis: 1, ratio: Math.min(sx, sz) / Math.max(sx, sz), len: sy },
    { axis: 2, ratio: Math.min(sx, sy) / Math.max(sx, sy), len: sz },
  ];
  cand.sort((a, b) => (b.ratio - a.ratio) || (b.len - a.len));
  return cand[0].axis;
}

function cylinderRotationFor(axis) {
  if (axis === 1) return [0, -1, 0, 1, 0, 0, 0, 0, 1];
  if (axis === 2) return [0, 0, 1, 0, 1, 0, -1, 0, 0];
  return [1, 0, 0, 0, 1, 0, 0, 0, 1];
}

function permutedSizeForCylinder(size, axis) {
  if (axis === 1) return [size[1], size[0], size[2]];
  if (axis === 2) return [size[2], size[1], size[0]];
  return [size[0], size[1], size[2]];
}

// Apply rotation R (row-major 3x3) to a part-local axis-aligned bbox of given size.
// Returns the world-axis extents (always non-negative).
function rotatedExtents(size, R) {
  // For axis-aligned local box with half-extents h, the world half-extent along
  // world axis i = sum_j |R[i,j]| * h[j]. Times 2 = full extent.
  const h = [size[0] / 2, size[1] / 2, size[2] / 2];
  const out = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    let s = 0;
    for (let j = 0; j < 3; j++) {
      s += Math.abs(R[i * 3 + j]) * h[j];
    }
    out[i] = s * 2;
  }
  return out;
}

const cases = [
  { label: 'Vertical lamp pole',  intentedWorldSize: [0.16, 2.8, 0.16],  expectAxis: 1 },
  { label: 'Flat round disc base', intentedWorldSize: [1.2,  0.18, 1.2], expectAxis: 1 },
  { label: 'Horizontal X-pipe',    intentedWorldSize: [4.0,  0.3,  0.3], expectAxis: 0 },
  { label: 'Horizontal Z-pipe',    intentedWorldSize: [0.3,  0.3,  4.0], expectAxis: 2 },
  { label: 'Block-like (cube)',    intentedWorldSize: [1.0,  1.0,  1.0], expectAxis: 0 },
];

let pass = 0, fail = 0;
for (const c of cases) {
  const axis = pickCylinderAxis(c.intentedWorldSize);
  const partSize = permutedSizeForCylinder(c.intentedWorldSize, axis);
  const R = cylinderRotationFor(axis);
  const worldExtents = rotatedExtents(partSize, R);
  const match = worldExtents.every((v, i) => Math.abs(v - c.intentedWorldSize[i]) < 1e-9);
  const axisOk = axis === c.expectAxis;
  const verdict = match && axisOk ? 'PASS' : 'FAIL';
  if (verdict === 'PASS') pass++; else fail++;
  console.log(`[${verdict}] ${c.label}`);
  console.log(`  intended world size: [${c.intentedWorldSize.join(', ')}]`);
  console.log(`  axis: ${axis}  (expected ${c.expectAxis})`);
  console.log(`  part-local size: [${partSize.join(', ')}]`);
  console.log(`  rotation matrix: [${R.join(', ')}]`);
  console.log(`  rendered world extents: [${worldExtents.map((n) => n.toFixed(4)).join(', ')}]`);
}
console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
