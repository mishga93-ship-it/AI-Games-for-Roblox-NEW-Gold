import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const blenderScriptsDir = path.resolve(__dirname, '../runtime/blender');
const blenderBinary = process.env.BLENDER_BIN?.trim() || 'blender';

const R15_BONES = [
  'HumanoidRootPart', 'LowerTorso', 'UpperTorso', 'Head',
  'LeftUpperArm', 'LeftLowerArm', 'LeftHand',
  'RightUpperArm', 'RightLowerArm', 'RightHand',
  'LeftUpperLeg', 'LeftLowerLeg', 'LeftFoot',
  'RightUpperLeg', 'RightLowerLeg', 'RightFoot',
] as const;

export interface AutoRigInput {
  bytes: Buffer;
  mimeType: string;
  extension: string;
  title: string;
  /**
   * Override the output container format. Defaults to the input extension
   * (so GLB → GLB), but skinned-mesh consumers (Roblox Open Cloud Assets API)
   * require FBX with skin weights.
   */
  outputFormat?: 'glb' | 'fbx';
}

export interface AutoRigResult {
  outputBytes: Buffer;
  outputExtension: string;
  outputMimeType: string;
  stats: {
    bones: readonly string[];
    boneCount: number;
    meshCount: number;
    height: number;
    width: number;
    method: 'blender' | 'metadata-only';
    /** Roblox-skinning compatibility metrics (only present when Blender ran). */
    weightMethod?: 'auto' | 'envelope' | 'name_only';
    skinQuality?: 'good' | 'degraded' | 'broken';
    unweightedBones?: string[];
    vertexCount?: number;
  };
}

/**
 * Rig a mesh with an R15-compatible armature.  Uses Blender when available;
 * otherwise attaches R15 metadata to allow the export stage to build
 * the skeleton from standard proportions.
 */
export async function autoRigR15(input: AutoRigInput): Promise<AutoRigResult> {
  const blenderAvailable = await isBlenderAvailable();

  if (blenderAvailable) {
    return runBlenderRig(input);
  }

  return metadataFallback(input);
}

async function isBlenderAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(blenderBinary, ['--version'], { stdio: 'ignore' });
    child.on('error', () => resolve(false));
    child.on('close', (code) => resolve(code === 0));
  });
}

async function runBlenderRig(input: AutoRigInput): Promise<AutoRigResult> {
  const { bytes, extension, title, outputFormat } = input;
  const tempDir = makeTempDir();
  await mkdir(tempDir, { recursive: true });

  const inputExt = extension || 'glb';
  // FBX is required for Roblox skinned mesh upload via Open Cloud.
  // OBJ cannot store an armature, so always upgrade it.
  const outputExt = outputFormat === 'fbx'
    ? 'fbx'
    : (outputFormat === 'glb' ? 'glb' : (inputExt === 'obj' ? 'glb' : inputExt));
  const inputPath = path.join(tempDir, `input.${inputExt}`);
  const outputPath = path.join(tempDir, `output.${outputExt}`);
  const scriptPath = path.join(blenderScriptsDir, 'auto_rig_r15.py');

  try {
    await writeFile(inputPath, bytes);

    const result = await runBlender(scriptPath, [inputPath, outputPath]);

    try {
      await readFile(outputPath).then(() => {});
    } catch {
      const stderrTail = result.stderr?.slice(-500) ?? '';
      throw new Error(`Blender auto-rig failed: output file not created. Stderr: ${stderrTail}`);
    }
    const outputBytes = await readFile(outputPath);
    const blenderResult = parseBlenderResult(result.stdout);

    const bones = Array.isArray(blenderResult?.bones)
      ? (blenderResult.bones as string[])
      : [...R15_BONES];

    const weightMethod = (blenderResult?.weight_method as AutoRigResult['stats']['weightMethod']) ?? undefined;
    const skinQuality = (blenderResult?.skin_quality as AutoRigResult['stats']['skinQuality']) ?? undefined;
    const unweightedBones = Array.isArray(blenderResult?.unweighted_bones)
      ? (blenderResult.unweighted_bones as string[])
      : undefined;
    const vertexCount = typeof blenderResult?.vertex_count === 'number'
      ? blenderResult.vertex_count
      : undefined;

    return {
      outputBytes,
      outputExtension: outputExt,
      outputMimeType: mimeForExt(outputExt),
      stats: {
        bones,
        boneCount: typeof blenderResult?.bone_count === 'number' ? blenderResult.bone_count : R15_BONES.length,
        meshCount: typeof blenderResult?.mesh_count === 'number' ? blenderResult.mesh_count : 1,
        height: typeof blenderResult?.height === 'number' ? blenderResult.height : 0,
        width: typeof blenderResult?.width === 'number' ? blenderResult.width : 0,
        method: 'blender',
        weightMethod,
        skinQuality,
        unweightedBones,
        vertexCount,
      },
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * When Blender is not available, return the original mesh with R15
 * bone metadata embedded in the response so downstream export can
 * still construct the skeleton hierarchy.
 */
function metadataFallback(input: AutoRigInput): AutoRigResult {
  return {
    outputBytes: input.bytes,
    outputExtension: input.extension,
    outputMimeType: input.mimeType,
    stats: {
      bones: [...R15_BONES],
      boneCount: R15_BONES.length,
      meshCount: 1,
      height: 0,
      width: 0,
      method: 'metadata-only',
    },
  };
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
      else reject(new Error(`Blender auto-rig exited with code ${code}: ${stderr.slice(-500)}`));
    });
  });
}

function parseBlenderResult(stdout: string): Record<string, unknown> | null {
  const marker = 'BLENDER_RESULT:';
  const idx = stdout.lastIndexOf(marker);
  if (idx === -1) return null;
  const jsonStr = stdout.slice(idx + marker.length).split('\n')[0];
  try {
    return JSON.parse(jsonStr) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function makeTempDir(): string {
  return path.resolve(
    process.cwd(),
    '.worker-tmp',
    `rig-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
}

function mimeForExt(ext: string): string {
  if (ext === 'glb') return 'model/gltf-binary';
  if (ext === 'fbx') return 'model/fbx';
  if (ext === 'obj') return 'model/obj';
  return 'application/octet-stream';
}
