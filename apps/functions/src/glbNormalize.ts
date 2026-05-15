/**
 * Pure-TypeScript GLB scale normalizer for Cloud Functions.
 * Rescales a GLB so its Y-axis height equals TARGET_HEIGHT_STUDS.
 * Accounts for existing root node transforms to compute world-space height.
 */

const TARGET_HEIGHT_STUDS = 5.5;
const SCALE_TOLERANCE = 0.15;

interface GltfAccessor {
  bufferView?: number;
  byteOffset?: number;
  componentType: number;
  count: number;
  type: string;
  min?: number[];
  max?: number[];
}

interface GltfBufferView {
  buffer: number;
  byteOffset?: number;
  byteLength: number;
  byteStride?: number;
}

interface GltfNode {
  mesh?: number;
  children?: number[];
  scale?: number[];
  translation?: number[];
  rotation?: number[];
  matrix?: number[];
  name?: string;
}

interface GltfMeshPrimitive {
  attributes: Record<string, number>;
}

interface GltfJson {
  scene?: number;
  scenes?: Array<{ nodes?: number[] }>;
  nodes?: GltfNode[];
  meshes?: Array<{ primitives: GltfMeshPrimitive[] }>;
  accessors?: GltfAccessor[];
  bufferViews?: GltfBufferView[];
}

export function normalizeGlbScale(glbBytes: Buffer): Buffer {
  if (glbBytes.length < 20) return glbBytes;

  const magic = glbBytes.readUInt32LE(0);
  if (magic !== 0x46546C67) return glbBytes;

  const jsonChunkLength = glbBytes.readUInt32LE(12);
  const jsonChunkType = glbBytes.readUInt32LE(16);
  if (jsonChunkType !== 0x4E4F534A) return glbBytes;

  const jsonStart = 20;
  const jsonEnd = jsonStart + jsonChunkLength;
  const jsonStr = glbBytes.subarray(jsonStart, jsonEnd).toString('utf8');

  let gltf: GltfJson;
  try {
    gltf = JSON.parse(jsonStr);
  } catch {
    return glbBytes;
  }

  const binChunkHeaderOffset = jsonEnd;
  if (glbBytes.length < binChunkHeaderOffset + 8) return glbBytes;
  const binChunkLength = glbBytes.readUInt32LE(binChunkHeaderOffset);
  const binDataOffset = binChunkHeaderOffset + 8;
  const binChunk = glbBytes.length >= binDataOffset + binChunkLength
    ? Buffer.from(glbBytes.subarray(binDataOffset, binDataOffset + binChunkLength))
    : undefined;

  const bbox = computeBoundingBox(gltf, binChunk);
  if (!bbox) return glbBytes;

  const localHeight = bbox.max[1] - bbox.min[1];
  if (localHeight <= 0.001) return glbBytes;

  const sceneIndex = gltf.scene ?? 0;
  const scene = gltf.scenes?.[sceneIndex];
  if (!scene?.nodes?.length) return glbBytes;

  let rootScaleY = 1;
  for (const nodeIdx of scene.nodes) {
    const node = gltf.nodes?.[nodeIdx];
    if (node?.scale) {
      rootScaleY = node.scale[1];
      break;
    }
  }
  const worldHeight = localHeight * Math.abs(rootScaleY);
  if (worldHeight <= 0.001) return glbBytes;

  const scaleFactor = TARGET_HEIGHT_STUDS / worldHeight;
  if (Math.abs(scaleFactor - 1.0) < SCALE_TOLERANCE) return glbBytes;

  if (!binChunk) return glbBytes;

  const combinedScale = scaleFactor * rootScaleY;
  const meshes = gltf.meshes ?? [];
  const accessors = gltf.accessors ?? [];
  const bufferViews = gltf.bufferViews ?? [];

  for (const mesh of meshes) {
    for (const prim of mesh.primitives) {
      const posIdx = prim.attributes.POSITION;
      if (posIdx == null) continue;
      const acc = accessors[posIdx];
      if (!acc || acc.type !== 'VEC3' || acc.componentType !== 5126) continue;
      if (acc.bufferView == null) continue;
      const bv = bufferViews[acc.bufferView];
      if (!bv) continue;

      const bvByteOffset = bv.byteOffset ?? 0;
      const accByteOffset = acc.byteOffset ?? 0;
      const baseOffset = bvByteOffset + accByteOffset;
      const byteStride = bv.byteStride ?? 12;

      for (let j = 0; j < acc.count; j++) {
        const pos = baseOffset + j * byteStride;
        if (pos + 12 > binChunk.length) break;
        const x = binChunk.readFloatLE(pos);
        const y = binChunk.readFloatLE(pos + 4);
        const z = binChunk.readFloatLE(pos + 8);
        binChunk.writeFloatLE(x * combinedScale, pos);
        binChunk.writeFloatLE(y * combinedScale, pos + 4);
        binChunk.writeFloatLE(z * combinedScale, pos + 8);
      }

      if (acc.min && acc.max) {
        for (let i = 0; i < 3; i++) {
          acc.min[i] *= combinedScale;
          acc.max[i] *= combinedScale;
        }
      }
    }
  }

  // Also scale translation components of node transforms
  if (gltf.nodes) {
    for (const node of gltf.nodes) {
      if (node.translation) {
        node.translation[0] *= combinedScale;
        node.translation[1] *= combinedScale;
        node.translation[2] *= combinedScale;
      }
    }
  }

  // Reset root node scales to [1,1,1] since scale is now baked into vertices
  for (const nodeIdx of scene.nodes) {
    const node = gltf.nodes?.[nodeIdx];
    if (node?.scale) {
      node.scale = [1, 1, 1];
    }
  }

  const newJsonStr = JSON.stringify(gltf);
  let paddedJson = newJsonStr;
  while (paddedJson.length % 4 !== 0) paddedJson += ' ';
  const newJsonBuf = Buffer.from(paddedJson, 'utf8');

  const totalLength = 12 + 8 + newJsonBuf.length + 8 + binChunk.length;
  const result = Buffer.alloc(totalLength);

  result.writeUInt32LE(0x46546C67, 0);  // magic
  result.writeUInt32LE(2, 4);            // version
  result.writeUInt32LE(totalLength, 8);  // total length

  // JSON chunk
  result.writeUInt32LE(newJsonBuf.length, 12);
  result.writeUInt32LE(0x4E4F534A, 16);
  newJsonBuf.copy(result, 20);

  // BIN chunk
  const binOffset = 20 + newJsonBuf.length;
  result.writeUInt32LE(binChunk.length, binOffset);
  result.writeUInt32LE(0x004E4942, binOffset + 4);
  binChunk.copy(result, binOffset + 8);

  return result;
}

function computeBoundingBox(
  gltf: GltfJson,
  binChunk?: Buffer,
): { min: number[]; max: number[] } | null {
  const accessors = gltf.accessors;
  const meshes = gltf.meshes;
  if (!accessors?.length || !meshes?.length) return null;

  const globalMin = [Infinity, Infinity, Infinity];
  const globalMax = [-Infinity, -Infinity, -Infinity];
  let found = false;

  for (const mesh of meshes) {
    for (const prim of mesh.primitives) {
      const posIdx = prim.attributes.POSITION;
      if (posIdx == null) continue;
      const acc = accessors[posIdx];
      if (!acc || acc.type !== 'VEC3') continue;

      if (acc.min && acc.max) {
        found = true;
        for (let i = 0; i < 3; i++) {
          globalMin[i] = Math.min(globalMin[i], acc.min[i]);
          globalMax[i] = Math.max(globalMax[i], acc.max[i]);
        }
        continue;
      }

      if (!binChunk || acc.bufferView == null) continue;
      const bv = gltf.bufferViews?.[acc.bufferView];
      if (!bv) continue;

      const bvByteOffset = bv.byteOffset ?? 0;
      const accByteOffset = acc.byteOffset ?? 0;
      const baseOffset = bvByteOffset + accByteOffset;
      const byteStride = bv.byteStride ?? 12;

      const localMin = [Infinity, Infinity, Infinity];
      const localMax = [-Infinity, -Infinity, -Infinity];

      for (let j = 0; j < acc.count; j++) {
        const pos = baseOffset + j * byteStride;
        if (pos + 12 > binChunk.length) break;
        const x = binChunk.readFloatLE(pos);
        const y = binChunk.readFloatLE(pos + 4);
        const z = binChunk.readFloatLE(pos + 8);
        localMin[0] = Math.min(localMin[0], x);
        localMin[1] = Math.min(localMin[1], y);
        localMin[2] = Math.min(localMin[2], z);
        localMax[0] = Math.max(localMax[0], x);
        localMax[1] = Math.max(localMax[1], y);
        localMax[2] = Math.max(localMax[2], z);
      }

      if (localMin[0] !== Infinity) {
        found = true;
        for (let i = 0; i < 3; i++) {
          globalMin[i] = Math.min(globalMin[i], localMin[i]);
          globalMax[i] = Math.max(globalMax[i], localMax[i]);
        }
      }
    }
  }

  return found ? { min: globalMin, max: globalMax } : null;
}
