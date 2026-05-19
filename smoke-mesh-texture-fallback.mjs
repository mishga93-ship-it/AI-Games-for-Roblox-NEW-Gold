// Session 359 smoke — verify TextureID fallback chain in buildFurnitureModelManifest.
//   Case 1: real Engine API textureId set → TextureID = real
//   Case 2: only metadata.textureDecalAssetId → TextureID = decal
//   Case 3: only metadata.textureAssetId → TextureID = textureAsset
//   Case 4: NONE set → no TextureID, Color3 = primaryColor3
// Also: when TextureID present, Color3 should be white (1,1,1) so PBR texture
// passes through uncolored.

const dist = await import('./apps/functions/dist/robloxWorker.js');

function build(extra) {
  const metadata = {
    furnitureType: 'plant',
    furnitureBuildMode: 'mesh',
    furnitureResolvedBuildMode: 'mesh',
    furnitureUsesExternalMesh: true,
    primaryColor: '#338822',   // green tint
    accentColor: '#5C4033',
    glowColor: '#B0FFB0',
    requestedKind: 'furniture_3d',
    meshAssetId: '999999999',
    furnitureRealMeshId: '111111111',
    furnitureRealMeshSizeY: 5,
    furnitureRealMeshSizeX: 2,
    furnitureRealMeshSizeZ: 2,
    ...extra,
  };
  return dist.buildRobloxManifest({
    title: 'Test Plant Mesh',
    summary: 'Smoke',
    target: 'model',
    prompt: 'plant',
    starterScript: '',
    metadata,
  });
}

function findAIMeshBody(manifest) {
  return manifest.scene.find(n => n.className === 'MeshPart' && n.name === 'AIMeshBody');
}

let fails = 0;
const expect = (cond, label) => { if (cond) console.log('  PASS:', label); else { console.log('  FAIL:', label); fails++; } };

console.log('=== Case 1: real Engine API textureId ===');
{
  const m = build({ furnitureRealTextureId: '222222222' });
  const ai = findAIMeshBody(m);
  expect(ai, 'AIMeshBody present');
  expect(ai?.properties?.TextureID === 'rbxassetid://222222222', `TextureID = rbxassetid://222222222 (got: ${ai?.properties?.TextureID})`);
  const c = ai?.properties?.Color;
  expect(c && c.r === 1 && c.g === 1 && c.b === 1, `Color3 = white when TextureID set (got: r=${c?.r}, g=${c?.g}, b=${c?.b})`);
}

console.log('\n=== Case 2: only textureDecalAssetId fallback ===');
{
  const m = build({ textureDecalAssetId: '333333333' });
  const ai = findAIMeshBody(m);
  expect(ai?.properties?.TextureID === 'rbxassetid://333333333', `TextureID = rbxassetid://333333333 (got: ${ai?.properties?.TextureID})`);
  const c = ai?.properties?.Color;
  expect(c && c.r === 1 && c.g === 1 && c.b === 1, `Color3 = white when fallback TextureID set`);
}

console.log('\n=== Case 3: only textureAssetId fallback ===');
{
  const m = build({ textureAssetId: '444444444' });
  const ai = findAIMeshBody(m);
  expect(ai?.properties?.TextureID === 'rbxassetid://444444444', `TextureID = rbxassetid://444444444 (got: ${ai?.properties?.TextureID})`);
}

console.log('\n=== Case 4: NO TextureID anywhere ===');
{
  const m = build({});
  const ai = findAIMeshBody(m);
  expect(ai?.properties?.TextureID === undefined, `No TextureID property (got: ${ai?.properties?.TextureID})`);
  const c = ai?.properties?.Color;
  // primaryColor 338822 = (51/255, 136/255, 34/255) ≈ (0.2, 0.533, 0.133)
  expect(c && Math.abs(c.r - 51/255) < 0.01 && Math.abs(c.g - 136/255) < 0.01 && Math.abs(c.b - 34/255) < 0.01,
    `Color3 = primaryColor #338822 fallback (got: r=${c?.r?.toFixed(3)}, g=${c?.g?.toFixed(3)}, b=${c?.b?.toFixed(3)})`);
}

console.log('\n=== Case 5: priority — real > decal > textureAsset ===');
{
  const m = build({ furnitureRealTextureId: '111', textureDecalAssetId: '222', textureAssetId: '333' });
  const ai = findAIMeshBody(m);
  expect(ai?.properties?.TextureID === 'rbxassetid://111', `Engine API ID wins (got: ${ai?.properties?.TextureID})`);
}

console.log('\n=== Case 6: BuilderVersion StringValue is v3 ===');
{
  const m = build({ furnitureRealTextureId: '777' });
  const bv = m.scene.find(n => n.className === 'StringValue' && n.name === 'BuilderVersion');
  expect(String(bv?.properties?.Value || '').includes('v3'), `BuilderVersion = v3 (got: ${bv?.properties?.Value})`);
}

console.log(`\n=== ${fails === 0 ? 'ALL PASSED' : `${fails} FAILED`} ===`);
process.exit(fails === 0 ? 0 : 1);
