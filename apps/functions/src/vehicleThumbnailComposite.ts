// Session 387 R12 — shared Thumbnail API fetch + recolor + composit helper.
//
// Why: Thumbnail+composit logic was inlined inside the keyword-router branch
// of pick_vehicle_template. Modular pipeline (which is now the default)
// skipped that branch → no preview ever uploaded → iOS card empty.
//
// Now: this helper is called from BOTH paths (after modular prep, OR
// after keyword router) using metadata fields that both populate:
//   - vehicleTemplateAssetId, vehicleTemplateName, vehicleTemplateLabel
//   - vehicleTemplatePrimaryHex, vehicleTemplateAccentHex
//   - (modular-only) vehicleRarityLabel, vehiclePersonalityCaption, vehicleAddonIds
//
// Returns the new preview URL or null on any failure.

import { logger } from 'firebase-functions/v2';

interface JobLike {
  metadata?: Record<string, unknown>;
  artifacts: Array<unknown>;
}

interface FetchAndCompositArgs {
  jobId: string;
  currentJob: JobLike;
  /** Helper to write a binary artifact and return the artifact object. */
  uploadBinaryArtifact: (
    job: unknown,
    buf: Buffer,
    opts: Record<string, unknown>,
  ) => Promise<{ id: string; downloadUrl?: string; url?: string }>;
}

interface CompositResult {
  previewImageUrl: string;
  recoloredPixels: number;
  thumbnailState: string;
}

export async function fetchAndCompositVehiclePreview(
  args: FetchAndCompositArgs,
): Promise<CompositResult | null> {
  const meta = args.currentJob.metadata ?? {};
  const assetId = typeof meta.vehicleTemplateAssetId === 'number' ? meta.vehicleTemplateAssetId : 0;
  if (!assetId || assetId <= 0) {
    logger.info('[VehiclePreview] assetId=0, skipping Thumbnail API', { jobId: args.jobId });
    return null;
  }
  const tplName = typeof meta.vehicleTemplateName === 'string' ? meta.vehicleTemplateName : '';
  const tplLabel = typeof meta.vehicleTemplateLabel === 'string' ? meta.vehicleTemplateLabel : 'Vehicle';
  const primaryHex = typeof meta.vehicleTemplatePrimaryHex === 'string'
    ? meta.vehicleTemplatePrimaryHex : '#E03A2E';
  const accentHex = typeof meta.vehicleTemplateAccentHex === 'string'
    ? meta.vehicleTemplateAccentHex : '#FFFFFF';
  const titleForThumb = typeof meta.title === 'string' ? meta.title : tplLabel;

  // Step 1: fetch thumbnail URL from Roblox API (3 retries for transient
  // "Pending" state when cache is cold).
  let thumbImageUrl = '';
  let thumbState = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const thumbJson = await fetch(
        `https://thumbnails.roblox.com/v1/assets?assetIds=${assetId}&size=420x420&format=Png&isCircular=false`,
      ).then((r) => r.json() as Promise<{ data: Array<{ state: string; imageUrl?: string }> }>);
      const entry = Array.isArray(thumbJson.data) && thumbJson.data.length > 0 ? thumbJson.data[0] : undefined;
      thumbState = entry?.state ?? '';
      if (entry && typeof entry.imageUrl === 'string' && entry.imageUrl) {
        thumbImageUrl = entry.imageUrl;
        if (entry.state === 'Completed') break;
      }
      if (attempt < 3) await new Promise((r) => setTimeout(r, 2500));
    } catch (e) {
      logger.warn('[VehiclePreview] Thumbnail API fetch attempt failed', {
        jobId: args.jobId, attempt, error: e instanceof Error ? e.message : String(e),
      });
      if (attempt < 3) await new Promise((r) => setTimeout(r, 2500));
    }
  }
  if (!thumbImageUrl) {
    logger.warn('[VehiclePreview] Thumbnail API exhausted retries — no preview', {
      jobId: args.jobId, assetId, lastState: thumbState,
    });
    return null;
  }

  // Step 2: download + dominant-hue recolor to primaryHex.
  try {
    const pngResp = await fetch(thumbImageUrl);
    if (!pngResp.ok) throw new Error(`thumbnail PNG fetch ${pngResp.status}`);
    const originalPngBuf = Buffer.from(await pngResp.arrayBuffer());
    const sharp = (await import('sharp')).default;
    const { data: rawPixels, info } = await sharp(originalPngBuf)
      .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const targetHex = primaryHex.replace('#', '');
    const tR = parseInt(targetHex.slice(0, 2), 16);
    const tG = parseInt(targetHex.slice(2, 4), 16);
    const tB = parseInt(targetHex.slice(4, 6), 16);

    const hueOf = (r: number, g: number, b: number): number => {
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const d = max - min;
      if (d === 0) return -1;
      let h: number;
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
      return h;
    };

    // Detect dominant body color from saturated mid-lightness pixels.
    const buckets = new Map<string, number>();
    for (let i = 0; i < rawPixels.length; i += info.channels) {
      const r = rawPixels[i], g = rawPixels[i + 1], b = rawPixels[i + 2];
      const a = info.channels === 4 ? rawPixels[i + 3] : 255;
      if (a === 0) continue;
      if (r >= 240 && g >= 240 && b >= 240) continue;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const lightness = (max + min) / 510;
      const sat = max === 0 ? 0 : (max - min) / max;
      if (lightness < 0.18 || lightness > 0.95) continue;
      if (sat < 0.10) continue;
      const key = `${r >> 5}_${g >> 5}_${b >> 5}`;
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    let dominantHue = -1;
    if (buckets.size > 0) {
      const top = [...buckets.entries()].sort((a, b) => b[1] - a[1])[0][0];
      const [dR, dG, dB] = top.split('_').map((x) => parseInt(x) * 32 + 16);
      dominantHue = hueOf(dR, dG, dB);
    }

    // Recolor pixels within ±30° hue of dominant.
    let recoloredCount = 0;
    if (dominantHue >= 0) {
      for (let i = 0; i < rawPixels.length; i += info.channels) {
        const r = rawPixels[i], g = rawPixels[i + 1], b = rawPixels[i + 2];
        const a = info.channels === 4 ? rawPixels[i + 3] : 255;
        if (a === 0) continue;
        if (r >= 245 && g >= 245 && b >= 245) continue;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const lightness = (max + min) / 510;
        const sat = max === 0 ? 0 : (max - min) / max;
        if (lightness < 0.15) continue;
        if (sat < 0.05) continue;
        const pixHue = hueOf(r, g, b);
        if (pixHue < 0) continue;
        let hueDist = Math.abs(pixHue - dominantHue);
        if (hueDist > 180) hueDist = 360 - hueDist;
        if (hueDist > 30) continue;
        const scale = lightness * 1.45;
        rawPixels[i]     = Math.max(0, Math.min(255, Math.round(tR * scale)));
        rawPixels[i + 1] = Math.max(0, Math.min(255, Math.round(tG * scale)));
        rawPixels[i + 2] = Math.max(0, Math.min(255, Math.round(tB * scale)));
        recoloredCount++;
      }
    }
    const recoloredBuf = await sharp(rawPixels, {
      raw: { width: info.width, height: info.height, channels: info.channels },
    }).png().toBuffer();

    // Step 3: composit rarity/caption/icons/halo overlay.
    const { compositePreviewOverlay } = await import('./vehicleModular.preview.js');
    const rarityLabel = typeof meta.vehicleRarityLabel === 'string' ? meta.vehicleRarityLabel : '';
    const rarityColor = typeof meta.vehicleRarityColorHex === 'string'
      ? meta.vehicleRarityColorHex : '#888888';
    const caption = typeof meta.vehiclePersonalityCaption === 'string'
      ? meta.vehiclePersonalityCaption : '';
    const addonIds = Array.isArray(meta.vehicleAddonIds) ? (meta.vehicleAddonIds as string[]) : [];
    const finalBuf = await compositePreviewOverlay(recoloredBuf, {
      rarity: rarityLabel ? { label: rarityLabel, colorHex: rarityColor } : undefined,
      caption,
      addonIds,
      accentHex,
      skipUnderglow: ['Plane', 'Boat', 'Tank'].includes(tplName),
    });

    // Step 4: upload as preview artifact.
    const artifact = await args.uploadBinaryArtifact(args.currentJob, finalBuf, {
      type: 'png', extension: 'png', mimeType: 'image/png',
      name: `${titleForThumb}-template-preview.png`,
      previewText: `Roblox preview of ${tplLabel}${rarityLabel ? ` — ${rarityLabel}` : ''}`,
      stageId: 'pick_vehicle_template',
      artifactRole: 'preview_texture',
      metadata: {
        isPreviewTexture: true,
        vehicleTemplateName: tplName,
        vehicleTemplateAssetId: assetId,
        thumbnailSource: 'roblox_thumbnails_v1_recolored_composit',
        thumbnailFinalState: thumbState,
        recoloredPixels: recoloredCount,
        bodyHexTarget: primaryHex,
        hasRarityOverlay: !!rarityLabel,
        hasCaptionOverlay: !!caption,
        addonIconCount: Math.min(addonIds.length, 5),
      },
    });
    const url = artifact.downloadUrl ?? artifact.url ?? '';
    logger.info('[VehiclePreview] composit preview uploaded', {
      jobId: args.jobId, assetId, recoloredCount, url, rarityLabel, caption: caption.slice(0, 40),
    });
    return { previewImageUrl: url, recoloredPixels: recoloredCount, thumbnailState: thumbState };
  } catch (err) {
    logger.warn('[VehiclePreview] composit failed', {
      jobId: args.jobId, error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
