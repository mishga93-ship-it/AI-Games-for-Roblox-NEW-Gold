// Decal approval gate (session 231)
//
// Inserts a user-approval pause between Fal.ai 2D-preview generation and
// Roblox Open Cloud Decal upload. Roblox runs ML moderation on every uploaded
// Decal — Asset 99787426663910 (obby brick texture with blood splatter) was
// flagged "Violent Content and Gore" and triggered a 1-day suspension.
//
// Flow:
//  1. prepareDecalCandidates() — generate Flux images, persist to Storage,
//     return DecalApprovalCandidate[] for iOS to render.
//  2. Pipeline pauses (status='awaiting_review', metadata.approvalKind='decal_upload').
//  3. iOS DecalApprovalSheet — user unchecks risky tiles.
//  4. POST /api/content/jobs/:jobId/approve-decals — backend stores
//     approvedSlotIds, flips status to 'processing'. iOS triggers /run-phase2.
//  5. uploadApprovedDecals() — only approved buffers go to uploadAssetToRoblox.
//     Skipped slots: callsite uses default texture / falls back to no decal.

import { logger } from 'firebase-functions/v2';
import type { Bucket } from '@google-cloud/storage';
import { v4 as uuidv4 } from 'uuid';

import { generatePreviewTexture } from './providers.js';
import {
  uploadAssetToRoblox,
  pollRobloxOperation,
  resolveImageIdFromDecal,
} from './robloxWorker.js';
import type {
  ApprovedDecalAsset,
  DecalApprovalCandidate,
} from './types.js';

/**
 * Internal flavour of DecalApprovalCandidate — also carries `storagePath`
 * so the resume step can re-download the buffer for upload. Persisted in
 * Firestore under `metadata.pendingDecalApprovalsInternal` (server-side only).
 * The trimmed shape (without `storagePath`) is what we send to iOS via
 * `metadata.pendingDecalApprovals`.
 */
export interface InternalDecalCandidate extends DecalApprovalCandidate {
  storagePath: string;
}

export interface PrepareDecalCandidatesArgs {
  jobId: string;
  userId: string;
  bucket: Bucket;
  prompts: string[];
  slotPrefix: string;
  context: 'character' | 'game' | 'prop';
}

/**
 * Generate previews via Fal.ai, persist each PNG to a per-job folder in
 * Firebase Storage, return both the public-facing candidate (for iOS) and
 * the internal candidate (for resume). Failed generations are silently
 * dropped — callsite gets back fewer items than prompts.length.
 */
export async function prepareDecalCandidates(
  args: PrepareDecalCandidatesArgs,
): Promise<InternalDecalCandidate[]> {
  const { jobId, userId, bucket, prompts, slotPrefix, context } = args;
  const out: InternalDecalCandidate[] = [];

  const generated = await Promise.allSettled(
    prompts.map((p) => generatePreviewTexture(p, 'roblox', context)),
  );

  for (let index = 0; index < generated.length; index++) {
    const result = generated[index];
    if (result.status !== 'fulfilled' || !result.value) {
      logger.warn(`[DecalGate] gen failed ${slotPrefix}_${index}`, {
        jobId,
        prompt: (prompts[index] ?? '').slice(0, 120),
      });
      continue;
    }
    const falUrl = result.value;
    try {
      const resp = await fetch(falUrl);
      if (!resp.ok) throw new Error(`fal fetch ${resp.status}`);
      const buf = Buffer.from(await resp.arrayBuffer());
      const slotId = `${slotPrefix}_${index}_${uuidv4().slice(0, 8)}`;
      const storagePath = `pending-decal-approvals/${userId}/${jobId}/${slotId}.png`;
      const file = bucket.file(storagePath);
      await file.save(buf, { contentType: 'image/png', resumable: false });
      const [previewUrl] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
      });
      out.push({
        slotId,
        slotPrefix,
        previewUrl,
        prompt: prompts[index],
        index,
        storagePath,
      });
    } catch (err) {
      logger.warn(`[DecalGate] save failed ${slotPrefix}_${index}`, {
        jobId,
        error: (err as Error).message,
      });
    }
  }

  logger.info(`[DecalGate] prepared ${out.length}/${prompts.length} candidates`, {
    jobId,
    slotPrefix,
  });
  return out;
}

export interface UploadApprovedDecalsArgs {
  jobId: string;
  bucket: Bucket;
  candidates: InternalDecalCandidate[];
  approvedSlotIds: Set<string>;
  robloxAuth: { accessToken: string; robloxUserId: string };
  themeKey?: string;
}

/**
 * Upload only the approved candidates as Roblox Decals. Returns a map
 * keyed by slotId so the callsite can rebuild ordered arrays. Rejected
 * slots are absent from the map — callsite must handle missing entries
 * (typically: leave the texture slot empty / use default).
 */
export async function uploadApprovedDecals(
  args: UploadApprovedDecalsArgs,
): Promise<Map<string, ApprovedDecalAsset>> {
  const { jobId, bucket, candidates, approvedSlotIds, robloxAuth, themeKey } = args;
  const out = new Map<string, ApprovedDecalAsset>();

  const approved = candidates.filter((c) => approvedSlotIds.has(c.slotId));
  if (approved.length === 0) {
    logger.info('[DecalGate] no approved candidates — nothing to upload', {
      jobId,
      total: candidates.length,
    });
    return out;
  }

  const results = await Promise.allSettled(
    approved.map(async (cand) => {
      try {
        const file = bucket.file(cand.storagePath);
        const [buf] = await file.download();
        const upload = await uploadAssetToRoblox({
          bearerToken: robloxAuth.accessToken,
          creatorId: robloxAuth.robloxUserId,
          assetType: 'Decal',
          name: `${cand.slotPrefix}_${themeKey ?? 'gen'}_${cand.index}`.slice(0, 50),
          description: `AI-generated ${cand.slotPrefix.toLowerCase()} (user-approved)`,
          fileContent: buf,
          contentType: 'image/png',
        });
        if (!upload) return null;
        let assetId = upload.assetId;
        if (upload.operationId) {
          const polled = await pollRobloxOperation(
            robloxAuth.accessToken,
            upload.operationId,
            'bearer',
            8,
            2000,
          );
          if (polled) assetId = polled;
        }
        if (!assetId) return null;
        const imageId = await resolveImageIdFromDecal(assetId, robloxAuth.accessToken);
        const finalImageId = imageId ?? assetId;
        return {
          slotId: cand.slotId,
          slotPrefix: cand.slotPrefix,
          index: cand.index,
          imageAssetId: finalImageId,
          rbxAssetUri: `rbxassetid://${finalImageId}`,
        } satisfies ApprovedDecalAsset;
      } catch (err) {
        logger.warn(`[DecalGate] upload failed ${cand.slotId}`, {
          jobId,
          error: (err as Error).message,
        });
        return null;
      }
    }),
  );

  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) {
      out.set(r.value.slotId, r.value);
    }
  }
  logger.info(`[DecalGate] uploaded ${out.size}/${approved.length} approved decals`, {
    jobId,
    skipped: approved.length - out.size,
  });
  return out;
}

/**
 * Strip the internal-only `storagePath` field before sending to iOS.
 */
export function toPublicCandidates(
  cands: InternalDecalCandidate[],
): DecalApprovalCandidate[] {
  return cands.map((c) => ({
    slotId: c.slotId,
    slotPrefix: c.slotPrefix,
    previewUrl: c.previewUrl,
    prompt: c.prompt,
    index: c.index,
  }));
}

/**
 * Reverse — used during resume to rehydrate from Firestore-stored internal
 * snapshot. Defensive: drops malformed entries.
 */
export function parseInternalCandidates(value: unknown): InternalDecalCandidate[] {
  if (!Array.isArray(value)) return [];
  const out: InternalDecalCandidate[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const slotId = typeof r.slotId === 'string' ? r.slotId : null;
    const slotPrefix = typeof r.slotPrefix === 'string' ? r.slotPrefix : null;
    const previewUrl = typeof r.previewUrl === 'string' ? r.previewUrl : null;
    const prompt = typeof r.prompt === 'string' ? r.prompt : '';
    const storagePath = typeof r.storagePath === 'string' ? r.storagePath : null;
    const index = typeof r.index === 'number' ? r.index : 0;
    if (!slotId || !slotPrefix || !previewUrl || !storagePath) continue;
    out.push({ slotId, slotPrefix, previewUrl, prompt, index, storagePath });
  }
  return out;
}
