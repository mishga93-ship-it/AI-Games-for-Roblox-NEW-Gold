export interface GlbMeshInfo {
  totalTriangles: number;
  totalVertices: number;
  meshCount: number;
  primitiveCount: number;
  valid: true;
}

export interface GlbParseError {
  valid: false;
  reason: string;
}

export type GlbParseResult = GlbMeshInfo | GlbParseError;

const GLB_MAGIC = 0x46546C67; // 'glTF'
const JSON_CHUNK_TYPE = 0x4E4F534A; // 'JSON'

/**
 * Parse GLB binary to extract mesh statistics without full scene
 * deserialization.  Handles glTF 2.0 only.
 */
export function parseGlbStats(buffer: Buffer): GlbParseResult {
  if (buffer.byteLength < 20) {
    return { valid: false, reason: 'Buffer too small for GLB header' };
  }

  const magic = buffer.readUInt32LE(0);
  if (magic !== GLB_MAGIC) {
    return { valid: false, reason: 'Not a valid GLB file (bad magic bytes)' };
  }

  const version = buffer.readUInt32LE(4);
  if (version !== 2) {
    return { valid: false, reason: `Unsupported glTF version: ${version}` };
  }

  const jsonChunkLength = buffer.readUInt32LE(12);
  const jsonChunkType = buffer.readUInt32LE(16);
  if (jsonChunkType !== JSON_CHUNK_TYPE) {
    return { valid: false, reason: 'Expected JSON chunk as first chunk' };
  }

  let gltf: Record<string, unknown>;
  try {
    const jsonStr = buffer.subarray(20, 20 + jsonChunkLength).toString('utf8');
    gltf = JSON.parse(jsonStr) as Record<string, unknown>;
  } catch {
    return { valid: false, reason: 'Failed to parse glTF JSON chunk' };
  }

  const accessors = (gltf.accessors ?? []) as Array<{ count: number }>;
  const meshes = (gltf.meshes ?? []) as Array<{
    primitives: Array<{
      mode?: number;
      indices?: number;
      attributes?: Record<string, number>;
    }>;
  }>;

  let totalTriangles = 0;
  let totalVertices = 0;
  let primitiveCount = 0;

  for (const mesh of meshes) {
    for (const primitive of mesh.primitives ?? []) {
      primitiveCount++;
      const mode = primitive.mode ?? 4; // 4 = TRIANGLES

      if (primitive.indices !== undefined) {
        const accessor = accessors[primitive.indices];
        if (accessor) {
          if (mode === 4) totalTriangles += Math.floor(accessor.count / 3);
          else if (mode === 5 || mode === 6) totalTriangles += Math.max(0, accessor.count - 2);
        }
      }

      const posIdx = primitive.attributes?.POSITION;
      if (posIdx !== undefined) {
        const posAccessor = accessors[posIdx];
        if (posAccessor) {
          totalVertices += posAccessor.count;
          if (primitive.indices === undefined && mode === 4) {
            totalTriangles += Math.floor(posAccessor.count / 3);
          }
        }
      }
    }
  }

  return {
    valid: true,
    totalTriangles,
    totalVertices,
    meshCount: meshes.length,
    primitiveCount,
  };
}

/**
 * Rough triangle estimate for non-GLB formats based on file size.
 * FBX/OBJ files average ~80-120 bytes per triangle with normals+UVs.
 */
export function estimateTrianglesFromSize(byteLength: number): number {
  return Math.ceil(byteLength / 100);
}
