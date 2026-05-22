// Stage B (changelog-312, plan: magical-churning-token.md Update 2026-05-12).
//
// Roblox Open Cloud uploads our skinned FBX as `assetType: 'Model'`. The returned
// `assetId` points at a Model wrapper, NOT the inner Mesh asset that
// `MeshPart.MeshId = "rbxassetid://<id>"` actually needs. In Play mode Roblox
// auto-resolves the wrapper sometimes (and our LoadSkinnedBody runtime Script
// works around the rest), but in Studio Edit mode the wrapper is just a "grey
// block" — Studio doesn't render the inner mesh until a Script runs.
//
// The Roblox-staff-recommended fix (devforum 3226166) is to use the Open Cloud
// "Engine API for Executing Luau" endpoint: post a small Luau snippet to the
// Engine API which runs inside our own Roblox place, calls
// `AssetService:LoadAssetAsync(MODEL_ID)`, descends into the loaded Model to
// find the inner MeshPart, and returns the *numeric* MeshId / TextureID. We
// then write those numeric IDs straight into the static MeshPart in our RBXM —
// no runtime Script needed, visible in Edit mode immediately.
//
// API reference (from the Roblox/open-cloud-execution-binary-payloads-example
// repo's DemoSDK.luau, plus the Engine API docs):
//   POST https://apis.roblox.com/cloud/v2/universes/{universeId}/places/{placeId}/luau-execution-session-tasks
//   Headers: x-api-key, content-type: application/json
//   Body: { script: "<luau source>", timeout: "30s" }
//   Response: {
//     path: "universes/.../places/.../luau-execution-sessions/.../tasks/...",
//     state: "QUEUED" | "PROCESSING" | "COMPLETE" | "FAILED" | "CANCELLED",
//     output: { results: [<return values from the script>] },
//     error?: { message: string }
//   }
//   Poll: GET https://apis.roblox.com/cloud/v2/<path>
//
// The required API key scope is `universe-place.luau-execution-session:write`,
// granted on the Roblox Creator Dashboard for an existing universe + place.
// That place can be empty — Engine API just needs a valid runtime container.

import { logger } from 'firebase-functions/v2';
import {
  getRobloxOpenCloudApiKey,
  getRobloxUniverseId,
  getRobloxPlaceId,
} from './config.js';

export interface ExtractMeshIdResult {
  /** Numeric MeshId of the inner skinned MeshPart inside the Model wrapper. */
  meshId?: number;
  /** Numeric TextureID of the same MeshPart, if any (Meshy bakes one). */
  textureId?: number;
  /** Snapshot of skinned MeshPart properties for diagnostics. */
  hasSkinnedMesh?: boolean;
  /** Vector3 size of the inner MeshPart (XYZ in studs). */
  meshSize?: { x: number; y: number; z: number };
  /** Diagnostic — engine-side error message if Luau task failed. */
  error?: string;
  /** Total wall time spent (submit + poll) in milliseconds. */
  durationMs: number;
  /** Final state of the task (`COMPLETE` on success). */
  state: string;
}

interface SubmitTaskResponse {
  path?: string;
  state?: string;
  error?: { message?: string };
}

interface PollTaskResponse {
  path?: string;
  state?: string;
  output?: {
    results?: unknown[];
  };
  error?: { message?: string };
}

const ENGINE_API_BASE = 'https://apis.roblox.com/cloud/v2';

/**
 * Build the Luau snippet that the Engine API will execute. It loads the
 * uploaded Model wrapper, finds the first MeshPart descendant (the skinned
 * body that the FBX importer produced), and returns the inner MeshId +
 * TextureID as numeric strings.
 *
 * Notes on the snippet:
 * - `AssetService:LoadAssetAsync(modelId)` requires the calling place's
 *   creator to be allowed to load the asset. Since both the FBX upload and
 *   the place are owned by `ROBLOX_CREATOR_ID`, ownership is satisfied.
 * - `MeshPart.MeshId` and `MeshPart.TextureID` come back as
 *   "rbxassetid://<digits>" strings; we strip the prefix in the TS layer.
 * - The script returns multiple values (Roblox serializes them into
 *   `output.results` as an array). We always return exactly 4 values for a
 *   stable shape, falling back to `nil` when a field is missing.
 */
function buildExtractScript(modelId: number): string {
  return `
local AssetService = game:GetService("AssetService")
local ok, model = pcall(function()
  return AssetService:LoadAssetAsync(${modelId})
end)
if not ok or not model then
  error("LoadAssetAsync failed for model ${modelId}: " .. tostring(model))
end

-- Walk the loaded Model to find the first MeshPart (skinned body).
local meshPart
for _, descendant in ipairs(model:GetDescendants()) do
  if descendant:IsA("MeshPart") then
    meshPart = descendant
    break
  end
end
if not meshPart then
  error("no MeshPart descendant inside loaded Model ${modelId}")
end

local meshIdStr = meshPart.MeshId or ""
local textureIdStr = meshPart.TextureID or ""
local size = meshPart.Size
local hasSkinned = false
pcall(function() hasSkinned = meshPart.HasSkinnedMesh end)

-- Return as a single table so the SDK serializes one well-typed result.
return {
  meshId = meshIdStr,
  textureId = textureIdStr,
  sizeX = size.X,
  sizeY = size.Y,
  sizeZ = size.Z,
  hasSkinnedMesh = hasSkinned,
}
`.trim();
}

function parseRbxAssetIdString(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  // Roblox returns "rbxassetid://12345" — strip the scheme.
  const match = trimmed.match(/(?:rbxassetid:\/\/)?(\d+)/);
  if (!match) return undefined;
  const num = parseInt(match[1], 10);
  return Number.isFinite(num) && num > 0 ? num : undefined;
}

async function pollUntilDone(
  apiKey: string,
  taskPath: string,
  maxAttempts: number,
  intervalMs: number,
): Promise<PollTaskResponse> {
  const url = `${ENGINE_API_BASE}/${taskPath}`;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    let resp: Response;
    try {
      resp = await fetch(url, {
        method: 'GET',
        headers: { 'x-api-key': apiKey },
      });
    } catch (err) {
      logger.warn('[extractMeshIdFromModel] poll fetch threw', {
        attempt,
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      logger.warn('[extractMeshIdFromModel] poll non-OK', {
        attempt,
        status: resp.status,
        body: text.slice(0, 300),
      });
      // 404 / 5xx may be transient between submit and the task becoming
      // queryable — keep polling until maxAttempts.
      continue;
    }
    const body = await resp.json().catch(() => null) as PollTaskResponse | null;
    if (!body) continue;
    const state = (body.state ?? '').toUpperCase();
    if (state === 'COMPLETE' || state === 'FAILED' || state === 'CANCELLED') {
      return body;
    }
    // QUEUED / PROCESSING — keep waiting.
  }
  return { state: 'TIMEOUT' };
}

/**
 * Fetch the inner numeric MeshId / TextureID of a Model wrapper using the
 * Roblox Open Cloud Engine API (Luau Execution Sessions).
 *
 * Returns `null` only when the Engine API is not configured at all
 * (no API key / universe / place). For all other failures (engine error,
 * timeout, no MeshPart found) it returns an `ExtractMeshIdResult` with
 * `state` describing what went wrong, so the caller can fall back to
 * the runtime LoadSkinnedBody Script path without throwing.
 */
export async function extractMeshIdFromModel(
  modelAssetId: number,
): Promise<ExtractMeshIdResult | null> {
  const apiKey = getRobloxOpenCloudApiKey();
  const universeId = getRobloxUniverseId();
  const placeId = getRobloxPlaceId();
  if (!apiKey || !universeId || !placeId) {
    logger.warn('[extractMeshIdFromModel] Engine API not configured', {
      hasApiKey: !!apiKey,
      hasUniverseId: !!universeId,
      hasPlaceId: !!placeId,
    });
    return null;
  }
  if (!Number.isFinite(modelAssetId) || modelAssetId <= 0) {
    return {
      durationMs: 0,
      state: 'INVALID_INPUT',
      error: `invalid modelAssetId: ${modelAssetId}`,
    };
  }

  const start = Date.now();
  const submitUrl = `${ENGINE_API_BASE}/universes/${universeId}/places/${placeId}/luau-execution-session-tasks`;
  const script = buildExtractScript(modelAssetId);

  let submitResp: Response;
  try {
    submitResp = await fetch(submitUrl, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        script,
        // 30s is the Engine API hard cap. LoadAssetAsync usually returns in
        // 2-10s for a small skinned model; the cap absorbs CDN propagation.
        timeout: '30s',
      }),
    });
  } catch (err) {
    return {
      durationMs: Date.now() - start,
      state: 'SUBMIT_THREW',
      error: err instanceof Error ? err.message : String(err),
    };
  }

  if (!submitResp.ok) {
    const text = await submitResp.text().catch(() => '');
    logger.warn('[extractMeshIdFromModel] submit non-OK', {
      status: submitResp.status,
      body: text.slice(0, 500),
      universeId,
      placeId,
      modelAssetId,
    });
    return {
      durationMs: Date.now() - start,
      state: `SUBMIT_${submitResp.status}`,
      error: text.slice(0, 200),
    };
  }

  const submitBody = await submitResp.json().catch(() => null) as SubmitTaskResponse | null;
  const taskPath = submitBody?.path;
  if (!taskPath) {
    return {
      durationMs: Date.now() - start,
      state: 'NO_TASK_PATH',
      error: 'submit response had no path field',
    };
  }

  // Poll up to ~40s total (20 attempts × 2s). Engine API task cap is 30s, so
  // the longest legitimate wait is submit + 30s + small slack.
  const polled = await pollUntilDone(apiKey, taskPath, 20, 2000);
  const durationMs = Date.now() - start;
  const state = (polled.state ?? 'UNKNOWN').toUpperCase();
  if (state !== 'COMPLETE') {
    logger.warn('[extractMeshIdFromModel] task did not complete', {
      state,
      taskPath,
      durationMs,
      error: polled.error?.message,
    });
    return {
      durationMs,
      state,
      error: polled.error?.message,
    };
  }

  const results = polled.output?.results;
  if (!Array.isArray(results) || results.length === 0) {
    return {
      durationMs,
      state: 'COMPLETE_NO_RESULTS',
    };
  }
  const first = results[0] as Record<string, unknown> | null;
  if (!first || typeof first !== 'object') {
    return {
      durationMs,
      state: 'COMPLETE_BAD_SHAPE',
      error: `expected object as first result, got ${typeof first}`,
    };
  }

  const meshId = parseRbxAssetIdString(first.meshId);
  const textureId = parseRbxAssetIdString(first.textureId);
  const sizeX = typeof first.sizeX === 'number' ? first.sizeX : 0;
  const sizeY = typeof first.sizeY === 'number' ? first.sizeY : 0;
  const sizeZ = typeof first.sizeZ === 'number' ? first.sizeZ : 0;
  const hasSkinnedMesh = first.hasSkinnedMesh === true;

  logger.info('[extractMeshIdFromModel] extracted IDs', {
    modelAssetId,
    meshId,
    textureId,
    hasSkinnedMesh,
    sizeX: Number(sizeX.toFixed(2)),
    sizeY: Number(sizeY.toFixed(2)),
    sizeZ: Number(sizeZ.toFixed(2)),
    durationMs,
  });

  return {
    meshId,
    textureId,
    hasSkinnedMesh,
    meshSize: { x: sizeX, y: sizeY, z: sizeZ },
    durationMs,
    state: 'COMPLETE',
  };
}
