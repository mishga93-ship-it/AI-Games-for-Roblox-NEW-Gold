// robloxAssetAttachments.ts — Phase O2-P2 (session 389+7).
//
// Parse Roblox classic accessory binary RBXM to extract its Attachment
// instances. Each Attachment names the BODY-PART attachment point it
// snaps to on a worn avatar (e.g., HatAttachment, FaceFrontAttachment,
// LeftGripAttachment) and carries a CFrame relative to the Handle Part.
//
// Returned data lets iOS place each accessory mesh ACCURATELY on the
// mannequin instead of falling back to bbox-center empirical offsets
// (which user feedback 2026-05-28 «hat сбоку, sunglasses на груди»
// proved to be unreliable across asset types).
//
// We also include the Handle's world Position from the standalone
// preview render, so iOS can compute the attachment's world-space
// position in the OBJ vertex frame:
//   attachmentWorld = handleWorld + attachment.localPosition
// Then iOS shifts the asset mesh so this world point ends up at the
// avatar's matching body attachment in scene space.

import { logger } from 'firebase-functions/v2';
import { gunzipSync } from 'node:zlib';
import { createRequire } from 'node:module';

// rbxm-parser pulls in `lz4`, which is a native node-addon. Importing
// it at MODULE LOAD time triggers a native dlopen that breaks the
// firebase deploy analyzer when the local Node ABI doesn't match the
// platform the .node binary was compiled for (e.g., dev on Node 18,
// package built for Node 22). Defer the require to first runtime call
// so deploy-time analysis never touches lz4 — Cloud Run rebuilds the
// binding for the target Node 22 environment during install anyway.
let _robloxFileClass: any | null = null;
function getRobloxFile(): any {
  if (_robloxFileClass) return _robloxFileClass;
  const require_ = createRequire(import.meta.url);
  _robloxFileClass = require_('rbxm-parser').RobloxFile;
  return _robloxFileClass;
}

const ASSET_DELIVERY = 'https://assetdelivery.roblox.com/v1/asset';

export interface AssetAttachmentRef {
  /// Roblox attachment instance name (e.g., "HatAttachment",
  /// "FaceFrontAttachment", "LeftGripAttachment"). iOS uses this to
  /// look up the corresponding body-part attachment on the mannequin.
  name: string;
  /// Attachment position in Handle-local coordinates (3 floats).
  localPosition: { x: number; y: number; z: number };
  /// Attachment rotation 3×3 matrix in Handle-local coordinates,
  /// ROW-MAJOR ([R00 R01 R02 R10 R11 R12 R20 R21 R22]). Falls back to
  /// identity if the CFrame doesn't expose Orientation.
  localOrientation: number[];
  /// Parent Handle's world position (3 floats).
  handleWorld: { x: number; y: number; z: number };
  /// Parent Handle's world orientation 3×3 (row-major). Many
  /// accessories have a 90° pre-rotation on the Handle — without
  /// applying it, hats/glasses render sideways.
  handleOrientation: number[];
}

export interface AssetAttachmentsResult {
  assetId: string;
  attachments: AssetAttachmentRef[];
}

export async function fetchRobloxAssetAttachments(args: {
  assetId: string;
}): Promise<AssetAttachmentsResult | null> {
  const { assetId } = args;
  if (!/^\d{1,15}$/.test(String(assetId))) {
    logger.warn('[assetAttachments] invalid assetId', { assetId });
    return null;
  }
  const cookie = process.env.ROBLOX_SERVICE_COOKIE ?? '';
  if (!cookie) {
    logger.warn('[assetAttachments] ROBLOX_SERVICE_COOKIE missing');
    return null;
  }
  const cookieHeader = `.ROBLOSECURITY=${cookie}`;

  // Step 1: fetch the RBXM bytes (probably gzipped).
  let raw: Buffer;
  try {
    const resp = await fetch(`${ASSET_DELIVERY}?id=${assetId}`, {
      method: 'GET',
      headers: { 'Cookie': cookieHeader },
      signal: AbortSignal.timeout(15_000),
    });
    if (!resp.ok) {
      logger.warn('[assetAttachments] fetch non-200', { assetId, status: resp.status });
      return null;
    }
    raw = Buffer.from(await resp.arrayBuffer());
  } catch (err) {
    logger.warn('[assetAttachments] fetch failed', {
      assetId, err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
  const bytes = isGzip(raw) ? gunzipSync(raw) : raw;

  // Step 2: parse with rbxm-parser. Some assets are tiny XML wrappers
  // (Shirt/Pants) — those throw inside the binary parser. Skip on
  // error and return an empty attachment list.
  let parsed: any;
  try {
    const RobloxFile = getRobloxFile();
    parsed = RobloxFile.ReadFromBuffer(bytes);
  } catch (err) {
    logger.info('[assetAttachments] not a binary RBXM (probably XML clothing)', {
      assetId, err: err instanceof Error ? err.message : String(err),
    });
    return { assetId: String(assetId), attachments: [] };
  }

  // Step 3: walk descendants for Attachment instances and capture the
  // local CFrame position + parent Part world position.
  let attachmentInstances: any[];
  try {
    attachmentInstances = parsed.FindDescendantsOfClass?.('Attachment') ?? [];
  } catch (err) {
    logger.warn('[assetAttachments] FindDescendantsOfClass failed', {
      assetId, err: err instanceof Error ? err.message : String(err),
    });
    return { assetId: String(assetId), attachments: [] };
  }

  const out: AssetAttachmentRef[] = [];
  const identity9 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  for (const att of attachmentInstances) {
    try {
      const name = typeof att.Name === 'string' ? att.Name : '';
      if (!name) continue;
      const cf = att.CFrame;
      const pos = cf?.Position ?? cf?.position ?? null;
      if (!pos || typeof pos.X !== 'number') continue;
      const localOrient = readOrientation9(cf) ?? identity9;

      let handlePos = { x: 0, y: 0, z: 0 };
      let handleOrient: number[] = identity9;
      const parent = att.Parent;
      if (parent && parent.ClassName === 'Part') {
        const pcf = parent.CFrame;
        const pp = pcf?.Position ?? pcf?.position ?? null;
        if (pp && typeof pp.X === 'number') {
          handlePos = { x: pp.X, y: pp.Y, z: pp.Z };
        }
        handleOrient = readOrientation9(pcf) ?? identity9;
      }

      out.push({
        name,
        localPosition: { x: pos.X, y: pos.Y, z: pos.Z },
        localOrientation: localOrient,
        handleWorld: handlePos,
        handleOrientation: handleOrient,
      });
    } catch (err) {
      logger.warn('[assetAttachments] attachment read failed', {
        assetId, err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { assetId: String(assetId), attachments: out };
}

function isGzip(b: Buffer): boolean {
  return b.length >= 2 && b[0] === 0x1f && b[1] === 0x8b;
}

/// Pull a 9-float row-major rotation matrix out of a parsed Roblox CFrame.
/// rbxm-parser exposes it as `cf.Orientation` (an array of 9 numbers) but
/// older variants stored it as nine individual R00..R22 properties. Try
/// both shapes; return null if neither is present.
function readOrientation9(cf: any): number[] | null {
  if (!cf) return null;
  const arr = cf.Orientation ?? cf.orientation;
  if (Array.isArray(arr) && arr.length === 9 && arr.every((v: any) => typeof v === 'number')) {
    return arr.slice();
  }
  const keys = ['R00', 'R01', 'R02', 'R10', 'R11', 'R12', 'R20', 'R21', 'R22'];
  if (keys.every((k) => typeof cf[k] === 'number')) {
    return keys.map((k) => cf[k] as number);
  }
  return null;
}
