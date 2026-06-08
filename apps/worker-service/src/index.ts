import { createServer } from 'node:http';
import type { IncomingMessage } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { optimizeMesh } from './mesh-optimizer.js';
import { autoRigR15 } from './auto-rigger.js';
import { exportCharacter } from './rbxm-exporter.js';
import type { ExportCharacterInput } from './rbxm-exporter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const luneScriptsDir = path.resolve(__dirname, '../runtime/lune');
const luneBinary = process.env.LUNE_BIN?.trim() || 'lune';
const workerToken = process.env.ROBLOX_WORKER_TOKEN?.trim();

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args[0] === 'build-roblox') {
    await buildRoblox(args[1], args[2], args[3] === 'model' ? 'model' : 'place');
    return;
  }
  if (args[0] === 'analyze-roblox') {
    await analyzeRoblox(
      args[1],
      args[2],
      args[3] === 'model' ? 'model' : 'place',
      args[4] === 'deep' ? 'deep' : 'summary',
    );
    return;
  }
  if (args[0] === 'apply-edits') {
    await applyEdits(
      args[1],
      args[2],
      args[3],
      args[4] === 'place' ? 'place' : 'model',
      args[5],
    );
    return;
  }
  if (args[0] === 'build-animation') {
    await buildAnimation(args[1], args[2]);
    return;
  }

  const port = Number(process.env.WORKER_PORT ?? '8787');
  const server = createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, service: 'worker-service' }));
      return;
    }
    if (!authorize(req)) {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized worker request' }));
      return;
    }
    if (req.method === 'POST' && req.url === '/build-roblox') {
      try {
        const body = await readJsonBody(req);
        const manifest = body.manifest as Record<string, unknown> | undefined;
        if (!manifest) {
          throw new Error('manifest is required');
        }
        const target = manifest.target === 'model' ? 'model' : 'place';
        const result = await buildRobloxFromManifest(manifest, target);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (error) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
      }
      return;
    }
    if (req.method === 'POST' && req.url === '/analyze-roblox') {
      try {
        const body = await readJsonBody(req);
        const inputBase64 = typeof body.inputBase64 === 'string' ? body.inputBase64 : '';
        const target = body.target === 'model' ? 'model' : 'place';
        const deep = body.deep === true || body.mode === 'deep';
        if (!inputBase64) {
          throw new Error('inputBase64 is required');
        }
        const result = await analyzeRobloxBase64(inputBase64, target, deep);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (error) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
      }
      return;
    }
    if (req.method === 'POST' && req.url === '/apply-edits') {
      try {
        const body = await readJsonBody(req);
        const inputBase64 = typeof body.inputBase64 === 'string' ? body.inputBase64 : '';
        const target = body.target === 'place' ? 'place' : 'model';
        const opsDoc = body.opsDoc as Record<string, unknown> | undefined;
        const ops = Array.isArray(body.ops)
          ? (body.ops as unknown[])
          : Array.isArray(opsDoc?.ops)
            ? (opsDoc!.ops as unknown[])
            : [];
        if (!inputBase64) {
          throw new Error('inputBase64 is required');
        }
        if (!Array.isArray(ops) || ops.length === 0) {
          throw new Error('ops[] is required');
        }
        const result = await applyEditsBase64(inputBase64, ops, target);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (error) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
      }
      return;
    }
    if (req.method === 'POST' && req.url === '/optimize-mesh') {
      try {
        const body = await readJsonBody(req);
        const result = await handleOptimizeMesh(body);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (error) {
        const status = isValidationError(error) ? 422 : 500;
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
      }
      return;
    }
    if (req.method === 'POST' && req.url === '/auto-rig-r15') {
      try {
        const body = await readJsonBody(req);
        const result = await handleAutoRigR15(body);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (error) {
        const status = isValidationError(error) ? 422 : 500;
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
      }
      return;
    }
    if (req.method === 'POST' && req.url === '/build-animation') {
      try {
        const body = await readJsonBody(req);
        const keyframes = body.keyframes as Record<string, unknown> | undefined;
        if (!keyframes) {
          throw new Error('keyframes is required');
        }
        const result = await buildAnimationFromKeyframes(keyframes);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (error) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
      }
      return;
    }
    if (req.method === 'POST' && req.url === '/build-decal') {
      try {
        const body = await readJsonBody(req);
        const decal = body.decal as Record<string, unknown> | undefined;
        if (!decal) {
          throw new Error('decal is required');
        }
        const result = await buildDecalFromSpec(decal);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (error) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
      }
      return;
    }
    if (req.method === 'POST' && req.url === '/build-script') {
      try {
        const body = await readJsonBody(req);
        const script = body.script as Record<string, unknown> | undefined;
        if (!script) {
          throw new Error('script is required');
        }
        const result = await buildScriptFromSource(script);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (error) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
      }
      return;
    }
    if (req.method === 'POST' && req.url === '/export-character') {
      try {
        const body = await readJsonBody(req);
        const result = await handleExportCharacter(body);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (error) {
        const status = isValidationError(error) ? 422 : 500;
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
      }
      return;
    }
    if (req.method === 'POST' && req.url === '/build-animation-fbx') {
      try {
        const body = await readJsonBody(req);
        const keyframes = body.keyframes as Record<string, unknown> | undefined;
        if (!keyframes) {
          throw new Error('keyframes is required');
        }
        const result = await buildAnimationFbxFromKeyframes(keyframes);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (error) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
      }
      return;
    }
    if (req.method === 'POST' && req.url === '/render-animation-preview') {
      try {
        const body = await readJsonBody(req);
        const keyframes = body.keyframes as Record<string, unknown> | undefined;
        if (!keyframes) {
          throw new Error('keyframes is required');
        }
        const result = await renderAnimationPreviewGif(keyframes);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (error) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
      }
      return;
    }
    if (req.method === 'POST' && req.url === '/convert-to-fbx') {
      try {
        const body = await readJsonBody(req);
        const result = await handleConvertToFbx(body);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (error) {
        const status = isValidationError(error) ? 422 : 500;
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
      }
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });
  server.listen(port);
}

async function buildAnimation(inputPath: string, outputPath: string): Promise<void> {
  if (!inputPath || !outputPath) {
    throw new Error('build-animation requires inputPath and outputPath');
  }
  await mkdir(path.dirname(outputPath), { recursive: true });
  await runLune('build_animation', [inputPath, outputPath]);
}

async function buildAnimationFromKeyframes(
  keyframes: Record<string, unknown>,
): Promise<{ outputBase64: string; summary: string }> {
  const tempDir = path.resolve(process.cwd(), '.worker-tmp', `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(tempDir, { recursive: true });
  const inputPath = path.join(tempDir, 'keyframes.json');
  const outputPath = path.join(tempDir, 'animation.rbxm');
  const fs = await import('node:fs/promises');
  try {
    await fs.writeFile(inputPath, JSON.stringify(keyframes, null, 2), 'utf8');
    await buildAnimation(inputPath, outputPath);
    const bytes = await fs.readFile(outputPath);
    const kfCount = Array.isArray(keyframes.keyframes) ? keyframes.keyframes.length : 0;
    return {
      outputBase64: bytes.toString('base64'),
      summary: `KeyframeSequence "${keyframes.name || 'Animation'}" with ${kfCount} keyframe(s) serialized as .rbxm.`,
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function buildDecal(inputPath: string, outputPath: string): Promise<void> {
  if (!inputPath || !outputPath) {
    throw new Error('build-decal requires inputPath and outputPath');
  }
  await mkdir(path.dirname(outputPath), { recursive: true });
  await runLune('build_decal', [inputPath, outputPath]);
}

async function buildDecalFromSpec(
  decal: Record<string, unknown>,
): Promise<{ outputBase64: string; summary: string }> {
  const tempDir = path.resolve(process.cwd(), '.worker-tmp', `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(tempDir, { recursive: true });
  const inputPath = path.join(tempDir, 'decal.json');
  const outputPath = path.join(tempDir, 'decal.rbxm');
  const fs = await import('node:fs/promises');
  try {
    await fs.writeFile(inputPath, JSON.stringify(decal, null, 2), 'utf8');
    await buildDecal(inputPath, outputPath);
    const bytes = await fs.readFile(outputPath);
    const name = typeof decal.name === 'string' ? decal.name : 'Decal';
    return {
      outputBase64: bytes.toString('base64'),
      summary: `Decal "${name}" with texture on all 6 faces serialized as .rbxm.`,
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function buildScriptFromSource(
  script: Record<string, unknown>,
): Promise<{ outputBase64: string; summary: string }> {
  const tempDir = path.resolve(process.cwd(), '.worker-tmp', `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(tempDir, { recursive: true });
  const inputPath = path.join(tempDir, 'script.json');
  const outputPath = path.join(tempDir, 'script.rbxm');
  const fs = await import('node:fs/promises');
  try {
    await fs.writeFile(inputPath, JSON.stringify(script, null, 2), 'utf8');
    await runLune('build_script', [inputPath, outputPath]);
    const bytes = await fs.readFile(outputPath);
    const name = typeof script.name === 'string' ? script.name : 'Script';
    return {
      outputBase64: bytes.toString('base64'),
      summary: `Script "${name}" packed as .rbxm — drag into Roblox Studio Explorer.`,
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function buildAnimationFbxFromKeyframes(
  keyframes: Record<string, unknown>,
): Promise<{ outputBase64: string; summary: string; appliedPoses?: number; skippedJoints?: string[] }> {
  const blenderBin = process.env.BLENDER_BIN?.trim() || 'blender';
  const blenderScripts = path.resolve(__dirname, '../runtime/blender');
  const scriptPath = path.join(blenderScripts, 'keyframes_to_fbx.py');

  const tempDir = path.resolve(process.cwd(), '.worker-tmp', `fbx-anim-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(tempDir, { recursive: true });
  const inputPath = path.join(tempDir, 'keyframes.json');
  const outputPath = path.join(tempDir, 'animation.fbx');
  const fs = await import('node:fs/promises');

  try {
    await fs.writeFile(inputPath, JSON.stringify(keyframes, null, 2), 'utf8');

    let blenderStdout = '';
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        blenderBin,
        ['--background', '--python', scriptPath, '--', inputPath, outputPath],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      );
      let stderr = '';
      child.stdout.on('data', (chunk: Buffer) => { blenderStdout += chunk.toString(); });
      child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Blender keyframes-to-FBX exited with code ${code}: ${stderr.slice(-500)}`));
      });
    });

    // Parse BLENDER_RESULT from stdout for diagnostics
    let blenderMeta: Record<string, unknown> = {};
    const marker = blenderStdout.indexOf('BLENDER_RESULT:');
    if (marker !== -1) {
      try {
        blenderMeta = JSON.parse(blenderStdout.slice(marker + 'BLENDER_RESULT:'.length)) as Record<string, unknown>;
      } catch { /* ignore parse errors */ }
    }

    const bytes = await fs.readFile(outputPath);
    const kfCount = Array.isArray(keyframes.keyframes) ? keyframes.keyframes.length : 0;
    const appliedPoses = typeof blenderMeta.appliedPoses === 'number' ? blenderMeta.appliedPoses : undefined;
    const skippedJoints = Array.isArray(blenderMeta.skippedJoints) ? blenderMeta.skippedJoints as string[] : undefined;
    const summaryParts = [`FBX animation "${keyframes.name || 'Animation'}" with ${kfCount} keyframe(s)`];
    if (appliedPoses !== undefined) summaryParts.push(`${appliedPoses} pose(s) applied`);
    if (skippedJoints?.length) summaryParts.push(`skipped joints: ${skippedJoints.join(', ')}`);

    return {
      outputBase64: bytes.toString('base64'),
      summary: summaryParts.join('. ') + '.',
      appliedPoses,
      skippedJoints,
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function renderAnimationPreviewGif(
  keyframes: Record<string, unknown>,
): Promise<{ outputBase64: string; summary: string }> {
  const blenderScripts = path.resolve(__dirname, '../runtime/blender');
  const pilScript = path.join(blenderScripts, 'render_animation_preview_pil.py');

  const tempDir = path.resolve(process.cwd(), '.worker-tmp', `gif-preview-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(tempDir, { recursive: true });
  const inputPath = path.join(tempDir, 'keyframes.json');
  const outputGifPath = path.join(tempDir, 'preview.gif');
  const fs = await import('node:fs/promises');

  try {
    await fs.writeFile(inputPath, JSON.stringify(keyframes, null, 2), 'utf8');

    let blenderStdout = '';
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        'python3',
        [pilScript, inputPath, outputGifPath],
        { stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000 },
      );
      let stderr = '';
      child.stdout.on('data', (chunk: Buffer) => { blenderStdout += chunk.toString(); });
      child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`PIL render-preview exited with code ${code}: ${stderr.slice(-500)}`));
      });
    });

    // Parse BLENDER_RESULT
    let blenderMeta: Record<string, unknown> = {};
    const marker = blenderStdout.indexOf('BLENDER_RESULT:');
    if (marker !== -1) {
      try {
        blenderMeta = JSON.parse(blenderStdout.slice(marker + 'BLENDER_RESULT:'.length)) as Record<string, unknown>;
      } catch { /* ignore */ }
    }

    // Validate GIF creation succeeded
    if (blenderMeta.success === false) {
      throw new Error('Blender GIF creation failed: imageio/PIL unavailable or frames empty');
    }
    const bytes = await fs.readFile(outputGifPath);
    if (bytes.length === 0) {
      throw new Error('GIF file is empty (0 bytes)');
    }
    const kfCount = Array.isArray(keyframes.keyframes) ? keyframes.keyframes.length : 0;
    return {
      outputBase64: bytes.toString('base64'),
      summary: `GIF preview "${keyframes.name || 'Animation'}" — ${blenderMeta.framesRendered || '?'} frames, ${Math.round((bytes.length / 1024))}KB.`,
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function buildRoblox(manifestPath: string, outputPath: string, target: 'place' | 'model'): Promise<void> {
  if (!manifestPath || !outputPath) {
    throw new Error('build-roblox requires manifestPath and outputPath');
  }
  await mkdir(path.dirname(outputPath), { recursive: true });
  await runLune('build_roblox', [manifestPath, outputPath, target]);
}

async function analyzeRoblox(
  inputPath: string,
  outputPath: string,
  target: 'place' | 'model',
  mode: 'summary' | 'deep' = 'summary',
): Promise<void> {
  if (!inputPath || !outputPath) {
    throw new Error('analyze-roblox requires inputPath and outputPath');
  }
  await mkdir(path.dirname(outputPath), { recursive: true });
  await runLune('analyze_roblox', [inputPath, outputPath, target, mode]);
}

// Session 427 (Release 4 / Phase 1): inverse of build_roblox — apply structured
// edit-ops to an existing .rbxm/.rbxl and re-serialize. Lune deserializes the
// binary, mutates by `ref` (analyze --deep pre-order index), re-serializes.
async function applyEdits(
  inputPath: string,
  opsPath: string,
  outputPath: string,
  target: 'place' | 'model',
  resultsPath?: string,
): Promise<void> {
  if (!inputPath || !opsPath || !outputPath) {
    throw new Error('apply-edits requires inputPath, opsPath and outputPath');
  }
  await mkdir(path.dirname(outputPath), { recursive: true });
  const luneArgs = [inputPath, opsPath, outputPath, target];
  if (resultsPath) {
    luneArgs.push(resultsPath);
  }
  await runLune('apply_edits', luneArgs);
}

async function buildRobloxFromManifest(
  manifest: Record<string, unknown>,
  target: 'place' | 'model',
): Promise<{ outputBase64: string; target: 'place' | 'model' }> {
  validateManifestShape(manifest);
  const tempDir = path.resolve(process.cwd(), '.worker-tmp', `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(tempDir, { recursive: true });
  const manifestPath = path.join(tempDir, 'manifest.json');
  const outputPath = path.join(tempDir, target === 'place' ? 'output.rbxl' : 'output.rbxm');
  const fs = await import('node:fs/promises');
  try {
    const manifestForLune = { ...manifest };
    const embeddedModels = Array.isArray(manifest.embeddedModels)
      ? manifest.embeddedModels as Array<Record<string, unknown>>
      : [];
    if (embeddedModels.length > 0) {
      manifestForLune.embeddedModels = await Promise.all(embeddedModels.map(async (model, index) => {
        const contentBase64 = typeof model.contentBase64 === 'string' ? model.contentBase64 : '';
        if (!contentBase64) return model;
        const bytes = Buffer.from(contentBase64, 'base64');
        const contentPath = path.join(tempDir, `embedded-model-${index}.rbxm`);
        await fs.writeFile(contentPath, bytes);
        const clone: Record<string, unknown> = { ...model, contentPath };
        delete clone.contentBase64;
        return clone;
      }));
    }
    await fs.writeFile(manifestPath, JSON.stringify(manifestForLune, null, 2), 'utf8');
    await buildRoblox(manifestPath, outputPath, target);
    const bytes = await fs.readFile(outputPath);
    return {
      outputBase64: bytes.toString('base64'),
      target,
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function analyzeRobloxBase64(
  inputBase64: string,
  target: 'place' | 'model',
  deep = false,
): Promise<Record<string, unknown>> {
  const tempDir = path.resolve(process.cwd(), '.worker-tmp', `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(tempDir, { recursive: true });
  const inputPath = path.join(tempDir, target === 'place' ? 'input.rbxl' : 'input.rbxm');
  const outputPath = path.join(tempDir, 'analysis.json');
  const fs = await import('node:fs/promises');
  try {
    await fs.writeFile(inputPath, Buffer.from(inputBase64, 'base64'));
    await analyzeRoblox(inputPath, outputPath, target, deep ? 'deep' : 'summary');
    return JSON.parse(await fs.readFile(outputPath, 'utf8')) as Record<string, unknown>;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function applyEditsBase64(
  inputBase64: string,
  ops: unknown[],
  target: 'place' | 'model',
): Promise<{ outputBase64: string; target: 'place' | 'model'; results: Record<string, unknown> }> {
  const tempDir = path.resolve(process.cwd(), '.worker-tmp', `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(tempDir, { recursive: true });
  const inputPath = path.join(tempDir, target === 'place' ? 'input.rbxl' : 'input.rbxm');
  const opsPath = path.join(tempDir, 'ops.json');
  const outputPath = path.join(tempDir, target === 'place' ? 'output.rbxl' : 'output.rbxm');
  const resultsPath = path.join(tempDir, 'results.json');
  const fs = await import('node:fs/promises');
  try {
    await fs.writeFile(inputPath, Buffer.from(inputBase64, 'base64'));
    await fs.writeFile(opsPath, JSON.stringify({ ops }, null, 2), 'utf8');
    await applyEdits(inputPath, opsPath, outputPath, target, resultsPath);
    const bytes = await fs.readFile(outputPath);
    let results: Record<string, unknown> = {};
    try {
      results = JSON.parse(await fs.readFile(resultsPath, 'utf8')) as Record<string, unknown>;
    } catch {
      // results sidecar is best-effort; binary output is the source of truth.
    }
    return { outputBase64: bytes.toString('base64'), target, results };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

function parseStageBody(body: Record<string, unknown>): {
  title: string;
  sourceUrl: string;
  inputBase64: string;
  mimeType: string;
  extension: string;
  options: Record<string, unknown>;
} {
  const bodyOptions = typeof body.options === 'object' && body.options !== null
    ? body.options as Record<string, unknown>
    : {};
  const bodyMetadata = typeof body.metadata === 'object' && body.metadata !== null
    ? body.metadata as Record<string, unknown>
    : {};
  return {
    title: typeof body.title === 'string' && body.title.trim() ? body.title.trim() : 'character',
    sourceUrl: typeof body.sourceUrl === 'string' ? body.sourceUrl : '',
    inputBase64: typeof body.inputBase64 === 'string' ? body.inputBase64 : '',
    mimeType: typeof body.mimeType === 'string' ? body.mimeType : 'application/octet-stream',
    extension: typeof body.extension === 'string' ? body.extension : 'bin',
    options: {
      meshAssetId: bodyMetadata.meshAssetId ?? bodyOptions.meshAssetId,
      bodyColors: bodyMetadata.bodyColors ?? bodyOptions.bodyColors,
      shirtTextureUrl: bodyMetadata.shirtTextureUrl ?? bodyOptions.shirtTextureUrl,
      pantsTextureUrl: bodyMetadata.pantsTextureUrl ?? bodyOptions.pantsTextureUrl,
      textureAssetId: bodyMetadata.textureAssetId ?? bodyOptions.textureAssetId,
      // Skinned R15 pipeline: outputFormat tells auto_rig_r15.py to emit FBX
      // (with R15 bones + skinning weights) instead of the default GLB, and
      // skinnedMeshAssetId carries the Open Cloud asset ID through to the
      // Lune export script which builds the skinned MeshPart "Body".
      outputFormat: bodyMetadata.outputFormat ?? bodyOptions.outputFormat,
      skinnedMeshAssetId: bodyMetadata.skinnedMeshAssetId ?? bodyOptions.skinnedMeshAssetId,
      ...bodyOptions,
    },
  };
}

async function resolveInputBytes(body: Record<string, unknown>): Promise<{
  bytes: Buffer;
  mimeType: string;
  extension: string;
}> {
  const { sourceUrl, inputBase64, mimeType, extension } = parseStageBody(body);
  if (!sourceUrl && !inputBase64) {
    throw new Error('sourceUrl or inputBase64 is required');
  }
  return sourceUrl
    ? downloadSourceAsset(sourceUrl)
    : { bytes: Buffer.from(inputBase64, 'base64'), mimeType, extension };
}

async function handleOptimizeMesh(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { title, options } = parseStageBody(body);
  const { bytes, mimeType, extension } = await resolveInputBytes(body);
  const safeTitle = title.replace(/[^A-Za-z0-9_]/g, '_') || 'character';

  const result = await optimizeMesh({
    bytes,
    mimeType,
    extension,
    title: safeTitle,
    maxTriangles: typeof options.maxTriangles === 'number' ? options.maxTriangles : undefined,
    targetRatio: typeof options.targetRatio === 'number' ? options.targetRatio : undefined,
  });

  return {
    outputBase64: result.outputBytes.toString('base64'),
    outputMimeType: result.outputMimeType,
    outputExtension: result.outputExtension,
    outputFileName: `${safeTitle}-optimized.${result.outputExtension}`,
    summary: `Mesh optimized: ${result.stats.originalTriangles} → ${result.stats.finalTriangles} triangles (${result.stats.method}).`,
    notes: [
      `Method: ${result.stats.method}`,
      `Decimation ratio applied: ${result.stats.ratioApplied}`,
      `Meshes processed: ${result.stats.meshCount}`,
    ],
    metadata: {
      stage: 'optimize-mesh',
      byteLength: result.outputBytes.byteLength,
      mimeType: result.outputMimeType,
      extension: result.outputExtension,
      stats: result.stats,
    },
  };
}

async function handleAutoRigR15(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { title, options } = parseStageBody(body);
  const { bytes, mimeType, extension } = await resolveInputBytes(body);
  const safeTitle = title.replace(/[^A-Za-z0-9_]/g, '_') || 'character';
  const requestedFormat = typeof options.outputFormat === 'string' && options.outputFormat.toLowerCase() === 'fbx'
    ? 'fbx' as const
    : (typeof options.outputFormat === 'string' && options.outputFormat.toLowerCase() === 'glb' ? 'glb' as const : undefined);

  const result = await autoRigR15({ bytes, mimeType, extension, title: safeTitle, outputFormat: requestedFormat });

  return {
    outputBase64: result.outputBytes.toString('base64'),
    outputMimeType: result.outputMimeType,
    outputExtension: result.outputExtension,
    outputFileName: `${safeTitle}-rigged.${result.outputExtension}`,
    summary: `R15 rig applied: ${result.stats.boneCount} bones via ${result.stats.method}.`,
    notes: [
      `Method: ${result.stats.method}`,
      `Bones: ${result.stats.bones.join(', ')}`,
      `Mesh height: ${result.stats.height}, width: ${result.stats.width}`,
      ...(result.stats.skinQuality ? [`Skin quality: ${result.stats.skinQuality} (${result.stats.weightMethod ?? 'n/a'})`] : []),
    ],
    metadata: {
      stage: 'auto-rig-r15',
      byteLength: result.outputBytes.byteLength,
      mimeType: result.outputMimeType,
      extension: result.outputExtension,
      stats: result.stats,
    },
  };
}

async function handleExportCharacter(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { title, options } = parseStageBody(body);
  const { bytes, mimeType, extension } = await resolveInputBytes(body);
  const safeTitle = title.replace(/[^A-Za-z0-9_]/g, '_') || 'character';

  const bodyColors = typeof options.bodyColors === 'object' && options.bodyColors !== null
    ? options.bodyColors as Record<string, unknown>
    : undefined;

  const result = await exportCharacter({
    bytes,
    mimeType,
    extension,
    title: safeTitle,
    meshAssetId: typeof options.meshAssetId === 'string' ? options.meshAssetId : undefined,
    bodyColors: bodyColors as ExportCharacterInput['bodyColors'],
    shirtTextureUrl: typeof options.shirtTextureUrl === 'string' ? options.shirtTextureUrl : undefined,
    pantsTextureUrl: typeof options.pantsTextureUrl === 'string' ? options.pantsTextureUrl : undefined,
    textureAssetId: typeof options.textureAssetId === 'string' ? options.textureAssetId : undefined,
    skinnedMeshAssetId: typeof options.skinnedMeshAssetId === 'string' ? options.skinnedMeshAssetId : undefined,
  });

  return {
    outputBase64: result.outputBytes.toString('base64'),
    outputMimeType: result.outputMimeType,
    outputExtension: result.outputExtension,
    outputFileName: `${safeTitle}.rbxm`,
    summary: `R15 character exported as .rbxm: ${result.stats.partCount} parts, ${result.stats.jointCount} Motor6D joints.`,
    notes: [
      `Method: ${result.stats.method}`,
      `Character: ${result.stats.title}`,
      `Parts: ${result.stats.partCount}, Joints: ${result.stats.jointCount}`,
    ],
    metadata: {
      stage: 'export-character',
      byteLength: result.outputBytes.byteLength,
      mimeType: result.outputMimeType,
      extension: result.outputExtension,
      stats: result.stats,
    },
  };
}

async function handleConvertToFbx(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { title } = parseStageBody(body);
  const { bytes, extension } = await resolveInputBytes(body);
  const safeTitle = title.replace(/[^A-Za-z0-9_]/g, '_') || 'model';

  const blenderBin = process.env.BLENDER_BIN?.trim() || 'blender';
  const blenderScripts = path.resolve(__dirname, '../runtime/blender');
  const scriptPath = path.join(blenderScripts, 'glb_to_fbx.py');

  const tempDir = path.resolve(
    process.cwd(),
    '.worker-tmp',
    `fbx-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  await mkdir(tempDir, { recursive: true });

  const inputExt = extension || 'glb';
  const inputPath = path.join(tempDir, `input.${inputExt}`);
  const outputPath = path.join(tempDir, 'output.fbx');

  try {
    const { writeFile: wf, readFile: rf, rm: rmDir } = await import('node:fs/promises');
    await wf(inputPath, bytes);

    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        blenderBin,
        ['--background', '--python', scriptPath, '--', inputPath, outputPath],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      );
      let stderr = '';
      child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Blender GLB-to-FBX exited with code ${code}: ${stderr.slice(-500)}`));
      });
    });

    const outputBytes = await rf(outputPath);
    await rmDir(tempDir, { recursive: true, force: true }).catch(() => {});

    return {
      outputBase64: outputBytes.toString('base64'),
      outputFileName: `${safeTitle}.fbx`,
      outputExtension: 'fbx',
      outputMimeType: 'model/fbx',
      summary: `Converted ${inputExt.toUpperCase()} to FBX for Roblox Studio Avatar Auto Setup.`,
      notes: [
        'Import this FBX in Roblox Studio via Avatar > Import 3D.',
        'Enable Auto Rigging and Auto Skinning for R15.',
      ],
      metadata: {
        stage: 'convert-to-fbx',
        byteLength: outputBytes.byteLength,
        inputExtension: inputExt,
      },
    };
  } catch (error) {
    await import('node:fs/promises').then((fs) => fs.rm(tempDir, { recursive: true, force: true })).catch(() => {});
    throw error;
  }
}

async function runLune(scriptName: string, args: string[]): Promise<void> {
  const scriptPath = path.join(luneScriptsDir, `${scriptName}.luau`);
  await ensureFile(scriptPath);
  return new Promise((resolve, reject) => {
    const child = spawn(luneBinary, ['run', scriptPath, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderr.trim() || `Lune exited with code ${code}`));
      }
    });
  });
}

async function ensureFile(filePath: string): Promise<void> {
  const contents = await readFile(filePath, 'utf8');
  if (!contents.trim()) {
    throw new Error(`Worker script is empty: ${filePath}`);
  }
}

async function downloadSourceAsset(sourceUrl: string): Promise<{ bytes: Buffer; mimeType: string; extension: string }> {
  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch source asset: ${response.status}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const mimeType = response.headers.get('content-type')?.split(';')[0] || inferMimeType(sourceUrl);
  return {
    bytes,
    mimeType,
    extension: extensionFromMimeType(mimeType, sourceUrl),
  };
}

function authorize(req: IncomingMessage): boolean {
  if (!workerToken) {
    return true;
  }
  return req.headers.authorization === `Bearer ${workerToken}`;
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) as Record<string, unknown> : {};
}

function validateManifestShape(manifest: Record<string, unknown>): void {
  const title = manifest.title;
  const scene = manifest.scene;
  const scripts = manifest.scripts;

  if (typeof title !== 'string' || !title.trim()) {
    throw new Error('manifest.title must be a non-empty string');
  }
  if (!Array.isArray(scene)) {
    throw new Error('manifest.scene must be an array');
  }
  if (!Array.isArray(scripts)) {
    throw new Error('manifest.scripts must be an array');
  }
  if (scene.length > 5000) {
    throw new Error('manifest.scene too large');
  }
  if (scripts.length > 1000) {
    throw new Error('manifest.scripts too large');
  }
  if (manifest.embeddedModels !== undefined) {
    if (!Array.isArray(manifest.embeddedModels)) {
      throw new Error('manifest.embeddedModels must be an array');
    }
    if (manifest.embeddedModels.length > 8) {
      throw new Error('manifest.embeddedModels too large');
    }
    for (const [index, model] of manifest.embeddedModels.entries()) {
      if (!model || typeof model !== 'object') {
        throw new Error(`manifest.embeddedModels[${index}] must be an object`);
      }
      const contentBase64 = (model as Record<string, unknown>).contentBase64;
      if (contentBase64 !== undefined && typeof contentBase64 !== 'string') {
        throw new Error(`manifest.embeddedModels[${index}].contentBase64 must be a string`);
      }
      if (typeof contentBase64 === 'string' && contentBase64.length > 16 * 1024 * 1024) {
        throw new Error(`manifest.embeddedModels[${index}].contentBase64 too large`);
      }
    }
  }
}

function inferMimeType(sourceUrl: string): string {
  const lower = sourceUrl.toLowerCase();
  if (lower.includes('.fbx')) return 'model/fbx';
  if (lower.includes('.obj')) return 'model/obj';
  if (lower.includes('.glb')) return 'model/gltf-binary';
  return 'application/octet-stream';
}

function isValidationError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return msg.includes('too large') || msg.includes('too heavy') || msg.includes('limit')
    || msg.includes('required') || msg.includes('unsupported');
}

function extensionFromMimeType(mimeType: string, sourceUrl: string): string {
  if (mimeType.includes('fbx')) return 'fbx';
  if (mimeType.includes('obj')) return 'obj';
  if (mimeType.includes('gltf') || mimeType.includes('glb')) return 'glb';
  const lower = sourceUrl.toLowerCase();
  if (lower.includes('.fbx')) return 'fbx';
  if (lower.includes('.obj')) return 'obj';
  if (lower.includes('.glb')) return 'glb';
  return 'bin';
}

void main().catch(async (error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
