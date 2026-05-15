import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const luneScriptsDir = path.resolve(__dirname, '../runtime/lune');
const luneBinary = process.env.LUNE_BIN?.trim() || 'lune';

const TARGET_HEIGHT_STUDS = 5.5;
const SCALE_TOLERANCE = 0.15;

export interface BodyColorsInput {
  headColor: [number, number, number];
  torsoColor: [number, number, number];
  leftArmColor: [number, number, number];
  rightArmColor: [number, number, number];
  leftLegColor: [number, number, number];
  rightLegColor: [number, number, number];
}

export interface ExportCharacterInput {
  bytes: Buffer;
  mimeType: string;
  extension: string;
  title: string;
  meshAssetId?: string;
  bodyColors?: BodyColorsInput;
  shirtTextureUrl?: string;
  pantsTextureUrl?: string;
  textureAssetId?: string;
  /**
   * Roblox asset ID of an FBX-imported skinned MeshPart with R15 Bone children.
   * When set, the Lune script emits a single skinned MeshPart "Body" + invisible
   * HumanoidRootPart driver instead of the 16-part placeholder rig, so catalog
   * R15 animations deform the mesh's bones directly.
   */
  skinnedMeshAssetId?: string;
}

export interface ExportCharacterResult {
  outputBytes: Buffer;
  outputExtension: string;
  outputMimeType: string;
  meshBytes?: Buffer;
  meshExtension?: string;
  meshMimeType?: string;
  stats: {
    title: string;
    partCount: number;
    jointCount: number;
    method: 'lune-r15';
    hasMeshBundle: boolean;
  };
}

const R15_PART_COUNT = 16; // 15 body parts + HumanoidRootPart
const R15_JOINT_COUNT = 15;

/**
 * Parse a GLB buffer and rescale the model so its height matches TARGET_HEIGHT_STUDS.
 * GLB = 12-byte header + JSON chunk + BIN chunk.
 * We read accessor min/max for POSITION attributes to find the bounding box,
 * then apply a uniform scale to all scene root nodes in the JSON chunk.
 */
export function normalizeGlbScale(glbBytes: Buffer): Buffer {
  if (glbBytes.length < 20) return glbBytes;

  const magic = glbBytes.readUInt32LE(0);
  if (magic !== 0x46546C67) return glbBytes; // not a valid GLB

  const jsonChunkLength = glbBytes.readUInt32LE(12);
  const jsonChunkType = glbBytes.readUInt32LE(16);
  if (jsonChunkType !== 0x4E4F534A) return glbBytes; // JSON chunk expected

  const jsonStart = 20;
  const jsonEnd = jsonStart + jsonChunkLength;
  const jsonStr = glbBytes.subarray(jsonStart, jsonEnd).toString('utf8');

  let gltf: GltfJson;
  try {
    gltf = JSON.parse(jsonStr);
  } catch {
    return glbBytes;
  }

  // BIN chunk: 4 bytes length + 4 bytes type (0x004E4942) + data
  const binDataOffset = jsonEnd + 8;
  const binChunk = glbBytes.length > binDataOffset ? glbBytes.subarray(binDataOffset) : undefined;

  const bbox = computeBoundingBox(gltf, binChunk);
  if (!bbox) return glbBytes;

  const localHeight = bbox.max[1] - bbox.min[1];
  if (localHeight <= 0.001) return glbBytes;

  const sceneIndex = gltf.scene ?? 0;
  const scene = gltf.scenes?.[sceneIndex];
  if (!scene?.nodes?.length) return glbBytes;

  // Compute the root node's existing Y-scale so we can convert local-space height
  // to world-space height. Meshy models often have a root scale of [0.01, 0.01, 0.01]
  // (centimetres → metres), which means the raw vertex height is in centimetres.
  // Multiplying by that scale gives the actual world-space height.
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

  for (const nodeIdx of scene.nodes) {
    const node = gltf.nodes?.[nodeIdx];
    if (!node) continue;
    const existing = node.scale ?? [1, 1, 1];
    node.scale = [
      existing[0] * scaleFactor,
      existing[1] * scaleFactor,
      existing[2] * scaleFactor,
    ];
  }

  const newJsonStr = JSON.stringify(gltf);
  let paddedJson = newJsonStr;
  while (paddedJson.length % 4 !== 0) paddedJson += ' ';
  const newJsonBuf = Buffer.from(paddedJson, 'utf8');

  const binChunkStart = jsonEnd;
  const binRemainder = glbBytes.subarray(binChunkStart);

  const totalLength = 12 + 8 + newJsonBuf.length + binRemainder.length;
  const result = Buffer.alloc(totalLength);

  result.writeUInt32LE(0x46546C67, 0);
  result.writeUInt32LE(2, 4);
  result.writeUInt32LE(totalLength, 8);

  result.writeUInt32LE(newJsonBuf.length, 12);
  result.writeUInt32LE(0x4E4F534A, 16);
  newJsonBuf.copy(result, 20);

  binRemainder.copy(result, 20 + newJsonBuf.length);

  return result;
}

interface GltfAccessor {
  bufferView?: number;
  byteOffset?: number;
  componentType: number;
  count: number;
  type: string;
  min?: number[];
  max?: number[];
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

interface GltfBufferView {
  buffer: number;
  byteOffset?: number;
  byteLength: number;
  byteStride?: number;
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

function computeBoundingBox(
  gltf: GltfJson,
  binChunk?: Buffer,
): { min: number[]; max: number[] } | null {
  const accessors = gltf.accessors;
  const meshes = gltf.meshes;
  if (!accessors?.length || !meshes?.length) return null;

  let globalMin = [Infinity, Infinity, Infinity];
  let globalMax = [-Infinity, -Infinity, -Infinity];
  let found = false;

  for (const mesh of meshes) {
    for (const prim of mesh.primitives) {
      const posIdx = prim.attributes.POSITION;
      if (posIdx == null) continue;
      const acc = accessors[posIdx];
      if (!acc || acc.type !== 'VEC3') continue;

      if (acc.min && acc.max) {
        // Fast path: use precomputed min/max
        found = true;
        for (let i = 0; i < 3; i++) {
          globalMin[i] = Math.min(globalMin[i], acc.min[i]);
          globalMax[i] = Math.max(globalMax[i], acc.max[i]);
        }
        continue;
      }

      // Fallback: read raw float32 positions from the BIN chunk
      if (!binChunk || acc.bufferView == null) continue;
      const bv = gltf.bufferViews?.[acc.bufferView];
      if (!bv) continue;

      const bvByteOffset = bv.byteOffset ?? 0;
      const accByteOffset = acc.byteOffset ?? 0;
      const baseOffset = bvByteOffset + accByteOffset;
      // VEC3 FLOAT32: 12 bytes per element; stride may be larger if interleaved
      const byteStride = bv.byteStride ?? 12;

      let localMin = [Infinity, Infinity, Infinity];
      let localMax = [-Infinity, -Infinity, -Infinity];

      for (let j = 0; j < acc.count; j++) {
        const pos = baseOffset + j * byteStride;
        if (pos + 12 > binChunk.length) break;
        const x = binChunk.readFloatLE(pos);
        const y = binChunk.readFloatLE(pos + 4);
        const z = binChunk.readFloatLE(pos + 8);
        localMin = [Math.min(localMin[0], x), Math.min(localMin[1], y), Math.min(localMin[2], z)];
        localMax = [Math.max(localMax[0], x), Math.max(localMax[1], y), Math.max(localMax[2], z)];
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

/**
 * Export a character as .rbxm with proper R15 hierarchy:
 *   Model
 *     ├─ Humanoid
 *     ├─ HumanoidRootPart (PrimaryPart, Transparency=1)
 *     │    └─ Motor6D "Root" → LowerTorso
 *     ├─ LowerTorso
 *     │    ├─ Motor6D "Waist" → UpperTorso
 *     │    ├─ Motor6D "LeftHip" → LeftUpperLeg
 *     │    └─ Motor6D "RightHip" → RightUpperLeg
 *     ... (full R15 tree)
 *
 * Uses Lune + the export_r15_character.luau script.
 */
export async function exportCharacter(input: ExportCharacterInput): Promise<ExportCharacterResult> {
  const { title } = input;
  const tempDir = makeTempDir();
  await mkdir(tempDir, { recursive: true });

  const metadataPath = path.join(tempDir, 'metadata.json');
  const meshDataPath = path.join(tempDir, `mesh.${input.extension || 'glb'}`);
  const outputPath = path.join(tempDir, 'output.rbxm');
  const scriptPath = path.join(luneScriptsDir, 'export_r15_character.luau');

  const meshExt = input.extension || 'glb';
  const metadata: Record<string, unknown> = {
    title: title || 'Character',
    meshFilePath: meshDataPath,
    meshExtension: meshExt,
  };
  if (input.meshAssetId) {
    metadata.meshAssetId = input.meshAssetId;
  }
  if (input.bodyColors) {
    metadata.bodyColors = input.bodyColors;
  }
  if (input.shirtTextureUrl) {
    metadata.shirtTextureUrl = input.shirtTextureUrl;
  }
  if (input.pantsTextureUrl) {
    metadata.pantsTextureUrl = input.pantsTextureUrl;
  }
  if (input.textureAssetId) {
    metadata.textureAssetId = input.textureAssetId;
  }
  if (input.skinnedMeshAssetId) {
    metadata.skinnedMeshAssetId = input.skinnedMeshAssetId;
  }

  try {
    const isGlb = meshExt === 'glb' || input.mimeType === 'model/gltf-binary';
    const normalizedBytes = isGlb ? normalizeGlbScale(input.bytes) : input.bytes;

    await writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');
    await writeFile(meshDataPath, normalizedBytes);

    await runLune(scriptPath, [metadataPath, outputPath]);

    const outputBytes = await readFile(outputPath);
    const hasMeshData = normalizedBytes.length > 0;

    return {
      outputBytes,
      outputExtension: 'rbxm',
      outputMimeType: 'application/octet-stream',
      meshBytes: hasMeshData ? normalizedBytes : undefined,
      meshExtension: hasMeshData ? meshExt : undefined,
      meshMimeType: hasMeshData ? input.mimeType : undefined,
      stats: {
        title: title || 'Character',
        partCount: R15_PART_COUNT,
        jointCount: R15_JOINT_COUNT,
        method: 'lune-r15',
        hasMeshBundle: hasMeshData,
      },
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

function runLune(scriptPath: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(luneBinary, ['run', scriptPath, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on('error', (err) =>
      reject(new Error(`Failed to launch Lune: ${err.message}. Ensure lune is installed.`)),
    );
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Lune export exited with code ${code}: ${stderr.slice(-500)}`));
    });
  });
}

function makeTempDir(): string {
  return path.resolve(
    process.cwd(),
    '.worker-tmp',
    `export-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
}
