import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseGlbStats, estimateTrianglesFromSize, type GlbMeshInfo } from './glb-parser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const blenderScriptsDir = path.resolve(__dirname, '../runtime/blender');
const blenderBinary = process.env.BLENDER_BIN?.trim() || 'blender';

const MAX_INPUT_BYTES = 100 * 1024 * 1024; // 100 MB hard cap
const DEFAULT_MAX_TRIANGLES = Number(process.env.MESH_MAX_TRIANGLES ?? '100000');
const DEFAULT_TARGET_RATIO = Number(process.env.MESH_TARGET_RATIO ?? '0.9');

export interface MeshOptimizeInput {
  bytes: Buffer;
  mimeType: string;
  extension: string;
  title: string;
  maxTriangles?: number;
  targetRatio?: number;
}

export interface MeshOptimizeResult {
  outputBytes: Buffer;
  outputExtension: string;
  outputMimeType: string;
  stats: {
    originalTriangles: number;
    finalTriangles: number;
    ratioApplied: number;
    meshCount: number;
    method: 'blender' | 'passthrough-validated';
  };
}

/**
 * Validate mesh constraints and optimise via Blender decimation when available.
 * Falls back to validated passthrough when Blender is not installed.
 */
export async function optimizeMesh(input: MeshOptimizeInput): Promise<MeshOptimizeResult> {
  const { bytes, extension, title } = input;
  const maxTris = input.maxTriangles ?? DEFAULT_MAX_TRIANGLES;
  const ratio = input.targetRatio ?? DEFAULT_TARGET_RATIO;

  if (bytes.byteLength > MAX_INPUT_BYTES) {
    throw new Error(`Mesh file too large: ${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB exceeds ${MAX_INPUT_BYTES / 1024 / 1024} MB limit`);
  }

  const meshInfo = getMeshStats(bytes, extension);

  if (meshInfo && meshInfo.totalTriangles > maxTris * 10) {
    throw new Error(
      `Mesh far too heavy: ${meshInfo.totalTriangles} triangles (hard limit: ${maxTris * 10}). ` +
      'Please provide a lower-poly source mesh.',
    );
  }

  const blenderAvailable = await isBlenderAvailable();

  if (blenderAvailable) {
    return runBlenderOptimize(bytes, extension, title, ratio, maxTris);
  }

  const triCount = meshInfo?.totalTriangles ?? estimateTrianglesFromSize(bytes.byteLength);
  if (triCount > maxTris) {
    throw new Error(
      `Mesh has ~${triCount} triangles (limit: ${maxTris}). ` +
      'Blender is not available for decimation. Provide a pre-optimised mesh or deploy with Blender.',
    );
  }

  return {
    outputBytes: bytes,
    outputExtension: extension,
    outputMimeType: input.mimeType,
    stats: {
      originalTriangles: triCount,
      finalTriangles: triCount,
      ratioApplied: 1,
      meshCount: meshInfo?.meshCount ?? 1,
      method: 'passthrough-validated',
    },
  };
}

function getMeshStats(bytes: Buffer, extension: string): GlbMeshInfo | null {
  if (extension === 'glb') {
    const result = parseGlbStats(bytes);
    if (result.valid) return result;
  }
  return null;
}

async function isBlenderAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(blenderBinary, ['--version'], { stdio: 'ignore' });
    child.on('error', () => resolve(false));
    child.on('close', (code) => resolve(code === 0));
  });
}

async function runBlenderOptimize(
  bytes: Buffer,
  extension: string,
  title: string,
  ratio: number,
  maxTriangles: number,
): Promise<MeshOptimizeResult> {
  const tempDir = makeTempDir();
  await mkdir(tempDir, { recursive: true });

  const inputExt = extension || 'glb';
  const inputPath = path.join(tempDir, `input.${inputExt}`);
  const outputPath = path.join(tempDir, `output.${inputExt}`);
  const scriptPath = path.join(blenderScriptsDir, 'optimize_mesh.py');

  try {
    await writeFile(inputPath, bytes);

    const result = await runBlender(scriptPath, [
      inputPath,
      outputPath,
      String(ratio),
      String(maxTriangles),
    ]);

    const outputBytes = await readFile(outputPath);
    const blenderResult = parseBlenderResult(result.stdout);

    return {
      outputBytes,
      outputExtension: inputExt,
      outputMimeType: mimeForExt(inputExt),
      stats: {
        originalTriangles: blenderResult?.original_triangles ?? 0,
        finalTriangles: blenderResult?.final_triangles ?? 0,
        ratioApplied: blenderResult?.ratio_applied ?? ratio,
        meshCount: blenderResult?.mesh_count ?? 1,
        method: 'blender',
      },
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

interface BlenderChildResult {
  stdout: string;
  stderr: string;
}

function runBlender(scriptPath: string, args: string[]): Promise<BlenderChildResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      blenderBinary,
      ['--background', '--python', scriptPath, '--', ...args],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`Blender exited with code ${code}: ${stderr.slice(-500)}`));
    });
  });
}

function parseBlenderResult(stdout: string): Record<string, number> | null {
  const marker = 'BLENDER_RESULT:';
  const idx = stdout.lastIndexOf(marker);
  if (idx === -1) return null;
  const jsonStr = stdout.slice(idx + marker.length).split('\n')[0];
  try {
    return JSON.parse(jsonStr) as Record<string, number>;
  } catch {
    return null;
  }
}

function makeTempDir(): string {
  return path.resolve(
    process.cwd(),
    '.worker-tmp',
    `mesh-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
}

function mimeForExt(ext: string): string {
  if (ext === 'glb') return 'model/gltf-binary';
  if (ext === 'fbx') return 'model/fbx';
  if (ext === 'obj') return 'model/obj';
  return 'application/octet-stream';
}
