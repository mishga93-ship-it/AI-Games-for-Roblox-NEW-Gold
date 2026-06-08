// Verify the thin-post check catches the user's lamp case (CenterPost 0.22 thick).
// Re-implement validator logic inline for direct test (since validateFurnitureSceneGeometry isn't exported).
function thinPostCheck(scene) {
  const structuralRoles = new Set(['post', 'stem', 'trunk', 'support']);
  const thinStructural = scene.parts.filter((p) => {
    if (!structuralRoles.has(p.role)) return false;
    const narrowDims = [p.size[0], p.size[2]];
    return Math.min(...narrowDims) < 0.3;
  });
  return thinStructural;
}
function verticalGapCheck(scene, type) {
  const flatTypes = new Set(['rug', 'sign']);
  if (flatTypes.has(type)) return [];
  const verticalRanges = scene.parts
    .map(p => ({ name: p.name, top: p.position[1] + p.size[1]/2, bottom: p.position[1] - p.size[1]/2, x: p.position[0], z: p.position[2] }))
    .filter(p => p.bottom > 0.05)
    .sort((a, b) => a.bottom - b.bottom);
  const center = verticalRanges.filter(p => Math.abs(p.x) < 0.5 && Math.abs(p.z) < 0.5);
  const gaps = [];
  for (let i = 1; i < center.length; i++) {
    const gap = center[i].bottom - center[i-1].top;
    if (gap > 0.5) gaps.push({ between: `${center[i-1].name} -> ${center[i].name}`, gap });
  }
  return gaps;
}

// The user's actual lamp scene from logs:
const userLamp = {
  furnitureType: 'lamp',
  parts: [
    { name: 'BasePlate', role: 'body', position: [0,0.15,0], size: [1.20,0.30,1.20] },
    { name: 'BaseTrimRing', role: 'trim', position: [0,0.34,0], size: [1.00,0.16,1.00] },
    { name: 'CenterPost', role: 'post', position: [0,1.45,0], size: [0.22,2.20,0.22] }, // ← TOO THIN
    { name: 'GlassStem', role: 'detail', position: [0.18,2.18,0], size: [0.18,0.90,0.18] },
    { name: 'LowerShade', role: 'shade', position: [0,2.78,0], size: [0.95,0.70,0.95] },
    { name: 'UpperShade', role: 'shade', position: [0,3.38,0], size: [1.15,0.55,1.15] },
    { name: 'LightCore', role: 'light', position: [0,3.08,0.18], size: [0.45,0.45,0.45] },
    { name: 'TopCap', role: 'trim', position: [0,3.98,0], size: [0.36,0.16,0.36] },
  ],
};

console.log('User lamp thin-post check:');
const thins = thinPostCheck(userLamp);
console.log('  Thin structural parts:', thins.map(p => `${p.name}(${Math.min(p.size[0], p.size[2])} stud)`));
if (thins.length === 0) { console.log('  FAIL — should have rejected CenterPost'); process.exit(1); }
console.log('  PASS — caught CenterPost as too thin');

// And a properly thick post should pass:
const goodLamp = JSON.parse(JSON.stringify(userLamp));
goodLamp.parts.find(p => p.name === 'CenterPost').size = [0.32, 2.20, 0.32];
const thins2 = thinPostCheck(goodLamp);
if (thins2.length > 0) { console.log('  FAIL — falsely flagged thick post'); process.exit(1); }
console.log('  PASS — 0.32 stud post not flagged');

// And vertical-gap check on a lamp with gap between base and post:
const gappedLamp = {
  furnitureType: 'lamp',
  parts: [
    { name: 'Base', role: 'body', position: [0,0.15,0], size: [1.2,0.3,1.2] },
    { name: 'Post', role: 'post', position: [0,2.5,0], size: [0.35,1.0,0.35] },  // bottom at 2.0 — gap of 1.7 from Base top (0.3)
    { name: 'Shade', role: 'shade', position: [0,3.5,0], size: [1.0,0.6,1.0] },
  ],
};
const gaps = verticalGapCheck(gappedLamp, 'lamp');
console.log('Gap check on gapped lamp:', gaps);
if (gaps.length === 0) { console.log('  FAIL — should detect 1.7-stud gap'); process.exit(1); }
console.log('  PASS — detected vertical gap');
