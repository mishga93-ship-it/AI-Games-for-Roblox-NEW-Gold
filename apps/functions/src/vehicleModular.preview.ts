// Session 387 R10 — Composited preview overlay.
//
// User feedback: "preview shows generic Roblox template, doesn't reflect
// addons/style/rarity/underglow — looks nothing like the export."
//
// Fix: take the already-recolored Roblox Thumbnail PNG and composit on top:
//   - Rarity badge (top-right, colored pill with white text)
//   - Personality caption (bottom, dark gradient strip with white text)
//   - Addon icon glyphs (top-left, small badges per picked addon)
//   - Optional accent-color underglow halo (bottom ellipse, soft glow)
//
// All done with Sharp + SVG composit. No external font files needed —
// SVG uses system-safe font-family. Result: preview = recognisable as
// the specific vehicle the user configured, not generic template stock.

import sharp from 'sharp';

interface RarityBadge {
  label: string;        // "LEGENDARY DRIFT"
  colorHex: string;     // "#FF6F00"
}

interface PreviewOverlay {
  rarity?: RarityBadge;
  caption?: string;
  addonIds?: ReadonlyArray<string>;
  /** Hex of the user's accent color — drives the underglow halo at bottom. */
  accentHex?: string;
  /** Set true to skip the accent halo (e.g. for plane/boat where it looks weird). */
  skipUnderglow?: boolean;
}

const ICON_MAP: Record<string, string> = {
  taxi_sign: '🚕',
  police_lightbar: '🚓',
  roof_rack: '📦',
  underglow: '💜',
  racing_stripe: '🏁',
  rear_spoiler_low: '◾',
  rear_spoiler_high: '🛩',
  exhaust_dual: '💨',
  roof_antenna: '📡',
  fire_dept_ladder: '🚒',
  monster_truck_tires: '🛞',
  headlight_bar: '💡',
  bull_bar: '🛡',
  side_skirts: '➖',
  hood_scoop: '🌀',
  subwoofer_trunk: '🔊',
  tow_hitch: '⚓',
  roof_camera_pod: '📹',
  disco_ball: '🪩',
  flag_pole: '🚩',
  smoke_stack: '🏭',
  jet_engine_rear: '🚀',
  mud_flaps: '⬛',
};

/** Build an SVG overlay (same size as base PNG) with badge, caption, icons. */
function buildOverlaySvg(args: PreviewOverlay & { width: number; height: number }): string {
  const { width, height } = args;
  const parts: string[] = [`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`];

  // Defs: drop-shadow filter for text
  parts.push(`<defs>
    <filter id="ds" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#000" flood-opacity="0.6"/>
    </filter>
    <linearGradient id="capBg" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stop-color="#000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.75"/>
    </linearGradient>
    <radialGradient id="underglow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0%" stop-color="${args.accentHex ?? '#FFFFFF'}" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="${args.accentHex ?? '#FFFFFF'}" stop-opacity="0"/>
    </radialGradient>
  </defs>`);

  // 1. Accent underglow halo (bottom ellipse) — anchors the car visually
  if (!args.skipUnderglow && args.accentHex) {
    const cx = width / 2;
    const cy = height * 0.72;
    const rx = width * 0.38;
    const ry = height * 0.07;
    parts.push(`<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#underglow)"/>`);
  }

  // 2. Rarity badge (top-right pill)
  if (args.rarity) {
    const label = args.rarity.label;
    const badgeFontSize = Math.round(height * 0.045);
    const padX = badgeFontSize * 0.7;
    const padY = badgeFontSize * 0.35;
    const charW = badgeFontSize * 0.58;
    const badgeW = label.length * charW + padX * 2;
    const badgeH = badgeFontSize + padY * 2;
    const bx = width - badgeW - height * 0.025;
    const by = height * 0.025;
    parts.push(`<rect x="${bx}" y="${by}" width="${badgeW}" height="${badgeH}" rx="${badgeH / 2}" fill="${args.rarity.colorHex}" opacity="0.95" filter="url(#ds)"/>`);
    parts.push(`<text x="${bx + badgeW / 2}" y="${by + badgeH / 2 + badgeFontSize * 0.34}" font-family="Helvetica, Arial, sans-serif" font-weight="900" font-size="${badgeFontSize}" fill="#FFFFFF" text-anchor="middle" letter-spacing="1">${escapeSvg(label)}</text>`);
  }

  // 3. Addon icon row (top-left, small chips)
  if (args.addonIds && args.addonIds.length > 0) {
    const iconSize = Math.round(height * 0.06);
    let x = height * 0.025;
    const y = height * 0.025;
    for (const id of args.addonIds.slice(0, 5)) {
      const glyph = ICON_MAP[id] ?? '✦';
      const w = iconSize * 1.05;
      parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${iconSize * 1.1}" rx="${iconSize * 0.25}" fill="#000" opacity="0.55"/>`);
      parts.push(`<text x="${x + w / 2}" y="${y + iconSize * 0.85}" font-size="${iconSize * 0.85}" text-anchor="middle">${escapeSvg(glyph)}</text>`);
      x += w + iconSize * 0.15;
    }
  }

  // 4. Caption strip (bottom)
  if (args.caption && args.caption.length > 0) {
    const stripH = Math.round(height * 0.20);
    const stripY = height - stripH;
    parts.push(`<rect x="0" y="${stripY}" width="${width}" height="${stripH}" fill="url(#capBg)"/>`);
    const fontSize = Math.round(height * 0.038);
    const maxChars = Math.floor(width / (fontSize * 0.55));
    const trimmed = args.caption.length > maxChars
      ? args.caption.slice(0, maxChars - 1) + '…'
      : args.caption;
    parts.push(`<text x="${width / 2}" y="${stripY + stripH * 0.62}" font-family="Helvetica, Arial, sans-serif" font-style="italic" font-size="${fontSize}" fill="#FFFFFF" text-anchor="middle" filter="url(#ds)">${escapeSvg(trimmed)}</text>`);
    parts.push(`<text x="${width / 2}" y="${stripY + stripH * 0.93}" font-family="Helvetica, Arial, sans-serif" font-size="${Math.round(fontSize * 0.55)}" fill="#FFFFFF" text-anchor="middle" opacity="0.7">AI-built · drag .rbxm into Studio</text>`);
  }

  parts.push('</svg>');
  return parts.join('');
}

function escapeSvg(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Composit overlay on top of a base PNG. Returns the new PNG buffer.
 * Safe to call when overlay fields are all empty — returns base unchanged.
 */
export async function compositePreviewOverlay(
  baseBuf: Buffer,
  overlay: PreviewOverlay,
): Promise<Buffer> {
  try {
    const meta = await sharp(baseBuf).metadata();
    const width = meta.width ?? 420;
    const height = meta.height ?? 420;
    const svg = buildOverlaySvg({ ...overlay, width, height });
    const out = await sharp(baseBuf)
      .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
      .png()
      .toBuffer();
    return out;
  } catch {
    // On any failure, return the base unchanged — preview is non-critical.
    return baseBuf;
  }
}
