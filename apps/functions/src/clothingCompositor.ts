import sharp from 'sharp';

export interface TextureRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ShirtTemplatePatches {
  // 2026-05-20 quality refactor: only the front-torso patch is required.
  // Pro UGC shirts put a bold focal design on the front, leave the back
  // clean, and use a solid accent color on the sleeves. Undefined patches
  // fall back to primaryColorHex (torso) or secondaryColorHex (sleeves).
  frontTorso: Buffer;
  backTorso?: Buffer;
  leftSleeve?: Buffer;
  rightSleeve?: Buffer;
  primaryColorHex: string;
  secondaryColorHex?: string;
}

export interface PantsTemplatePatches {
  // Same recipe for pants: front legs get the design, back/sides solid.
  frontTorso?: Buffer;
  backTorso?: Buffer;
  leftLeg: Buffer;
  rightLeg?: Buffer;
  primaryColorHex: string;
  secondaryColorHex?: string;
}

const TEMPLATE_WIDTH = 585;
const TEMPLATE_HEIGHT = 559;

const S = TEMPLATE_WIDTH / 585;

function r(x: number, y: number, w: number, h: number): TextureRegion {
  return {
    x: Math.round(x * S),
    y: Math.round(y * S),
    w: Math.round(w * S),
    h: Math.round(h * S),
  };
}

const SHIRT_REGIONS: Record<string, TextureRegion> = {
  torsoFront: r(64, 44, 128, 128),
  torsoBack:  r(256, 44, 128, 128),
  torsoRight: r(192, 44, 64, 128),
  torsoLeft:  r(0, 44, 64, 128),
  torsoUp:    r(64, 0, 128, 44),
  torsoDown:  r(64, 172, 128, 44),
  leftArmLeft:   r(0, 284, 64, 128),
  leftArmFront:  r(64, 284, 64, 128),
  leftArmRight:  r(128, 284, 64, 128),
  leftArmBack:   r(192, 284, 64, 128),
  leftArmUp:     r(64, 240, 64, 44),
  leftArmDown:   r(64, 412, 64, 44),
  rightArmLeft:  r(320, 284, 64, 128),
  rightArmFront: r(384, 284, 64, 128),
  rightArmRight: r(448, 284, 64, 128),
  rightArmBack:  r(512, 284, 64, 128),
  rightArmUp:    r(384, 240, 64, 44),
  rightArmDown:  r(384, 412, 64, 44),
};

const PANTS_REGIONS: Record<string, TextureRegion> = {
  torsoFront: r(64, 44, 128, 128),
  torsoBack:  r(256, 44, 128, 128),
  torsoRight: r(192, 44, 64, 128),
  torsoLeft:  r(0, 44, 64, 128),
  leftLegLeft:   r(0, 284, 64, 128),
  leftLegFront:  r(64, 284, 64, 128),
  leftLegRight:  r(128, 284, 64, 128),
  leftLegBack:   r(192, 284, 64, 128),
  leftLegUp:     r(64, 240, 64, 44),
  leftLegDown:   r(64, 412, 64, 44),
  rightLegLeft:  r(320, 284, 64, 128),
  rightLegFront: r(384, 284, 64, 128),
  rightLegRight: r(448, 284, 64, 128),
  rightLegBack:  r(512, 284, 64, 128),
  rightLegUp:    r(384, 240, 64, 44),
  rightLegDown:  r(384, 412, 64, 44),
};

function assertRegionBounds(regions: Record<string, TextureRegion>, label: string): void {
  for (const [name, region] of Object.entries(regions)) {
    if (region.x < 0 || region.y < 0 || region.w <= 0 || region.h <= 0) {
      throw new Error(`Invalid ${label} region "${name}"`);
    }
    if (region.x + region.w > TEMPLATE_WIDTH || region.y + region.h > TEMPLATE_HEIGHT) {
      throw new Error(`Out-of-bounds ${label} region "${name}"`);
    }
  }
}

function hexToRgba(hex: string): { r: number; g: number; b: number; alpha: number } {
  const clean = hex.replace('#', '').trim();
  const normalized = clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean;
  const n = Number.parseInt(normalized, 16);
  if (!Number.isFinite(n) || normalized.length !== 6) {
    return { r: 128, g: 128, b: 128, alpha: 1 };
  }
  return {
    r: (n >> 16) & 255,
    g: (n >> 8) & 255,
    b: n & 255,
    alpha: 1,
  };
}

async function solidRegion(region: TextureRegion, hex: string): Promise<Buffer> {
  return sharp({
    create: {
      width: region.w,
      height: region.h,
      channels: 4,
      background: hexToRgba(hex),
    },
  }).png().toBuffer();
}

async function normalizedPatch(input: Buffer, region: TextureRegion): Promise<Buffer> {
  return sharp(input).resize(region.w, region.h, { fit: 'cover' }).png().toBuffer();
}

async function patchForRegion(source: Buffer, region: TextureRegion): Promise<{ input: Buffer; left: number; top: number }> {
  return {
    input: await normalizedPatch(source, region),
    left: region.x,
    top: region.y,
  };
}

export async function compositeShirtTemplate(patches: ShirtTemplatePatches): Promise<Buffer> {
  assertRegionBounds(SHIRT_REGIONS, 'shirt');

  // 2026-05-20 quality refactor (research-backed: Roblox DevForum, UGCraft,
  // mydesigns.io, JetLearn 2026 guides — "negative space + bold silhouette
  // beats maximum coverage every time"):
  //
  //   - frontTorso  → AI design, big and bold (this is the only face the
  //                   player ever sees from camera default)
  //   - backTorso   → solid primaryColor (clean back, like real UGC shirts)
  //   - torsoUp/Down/Left/Right → solid primaryColor (these are 44-64px
  //                   wrap-edge strips — design here just creates visible
  //                   seams along the collar/waist/sides)
  //   - left/right sleeves (ALL 6 faces each) → solid secondaryColor (accent
  //                   contrast color, like a "sleeve band" on athletic
  //                   shirts — looks intentional and clean)
  //
  // The old code stamped the SAME AI design into all 18 UV regions, which
  // is what produced the "tiled repeating logo everywhere" look the user
  // complained about.
  const accent = patches.secondaryColorHex ?? patches.primaryColorHex;
  const overlays = await Promise.all([
    patchForRegion(patches.frontTorso, SHIRT_REGIONS.torsoFront),
    patches.backTorso
      ? patchForRegion(patches.backTorso, SHIRT_REGIONS.torsoBack)
      : { input: await solidRegion(SHIRT_REGIONS.torsoBack, patches.primaryColorHex), left: SHIRT_REGIONS.torsoBack.x, top: SHIRT_REGIONS.torsoBack.y },
    // Sleeves: solid accent color across every face.
    { input: await solidRegion(SHIRT_REGIONS.leftArmLeft, accent),   left: SHIRT_REGIONS.leftArmLeft.x,   top: SHIRT_REGIONS.leftArmLeft.y },
    { input: await solidRegion(SHIRT_REGIONS.leftArmFront, accent),  left: SHIRT_REGIONS.leftArmFront.x,  top: SHIRT_REGIONS.leftArmFront.y },
    { input: await solidRegion(SHIRT_REGIONS.leftArmRight, accent),  left: SHIRT_REGIONS.leftArmRight.x,  top: SHIRT_REGIONS.leftArmRight.y },
    { input: await solidRegion(SHIRT_REGIONS.leftArmBack, accent),   left: SHIRT_REGIONS.leftArmBack.x,   top: SHIRT_REGIONS.leftArmBack.y },
    { input: await solidRegion(SHIRT_REGIONS.leftArmUp, accent),     left: SHIRT_REGIONS.leftArmUp.x,     top: SHIRT_REGIONS.leftArmUp.y },
    { input: await solidRegion(SHIRT_REGIONS.leftArmDown, accent),   left: SHIRT_REGIONS.leftArmDown.x,   top: SHIRT_REGIONS.leftArmDown.y },
    { input: await solidRegion(SHIRT_REGIONS.rightArmLeft, accent),  left: SHIRT_REGIONS.rightArmLeft.x,  top: SHIRT_REGIONS.rightArmLeft.y },
    { input: await solidRegion(SHIRT_REGIONS.rightArmFront, accent), left: SHIRT_REGIONS.rightArmFront.x, top: SHIRT_REGIONS.rightArmFront.y },
    { input: await solidRegion(SHIRT_REGIONS.rightArmRight, accent), left: SHIRT_REGIONS.rightArmRight.x, top: SHIRT_REGIONS.rightArmRight.y },
    { input: await solidRegion(SHIRT_REGIONS.rightArmBack, accent),  left: SHIRT_REGIONS.rightArmBack.x,  top: SHIRT_REGIONS.rightArmBack.y },
    { input: await solidRegion(SHIRT_REGIONS.rightArmUp, accent),    left: SHIRT_REGIONS.rightArmUp.x,    top: SHIRT_REGIONS.rightArmUp.y },
    { input: await solidRegion(SHIRT_REGIONS.rightArmDown, accent),  left: SHIRT_REGIONS.rightArmDown.x,  top: SHIRT_REGIONS.rightArmDown.y },
    // torsoUp/Down/Left/Right are intentionally NOT overlaid — the base
    // canvas (primaryColorHex) shows through cleanly on those strips.
  ]);

  return sharp({
    create: {
      width: TEMPLATE_WIDTH,
      height: TEMPLATE_HEIGHT,
      channels: 4,
      background: hexToRgba(patches.primaryColorHex),
    },
  }).composite(overlays).png().toBuffer();
}

export async function compositePantsTemplate(patches: PantsTemplatePatches): Promise<Buffer> {
  assertRegionBounds(PANTS_REGIONS, 'pants');

  // 2026-05-20 quality refactor — same recipe as shirts:
  //   - leftLeg front face  → AI design (the leg face that's visible from the
  //                           camera default — front of thighs/knees)
  //   - rightLeg front face → same AI design (mirrored visually because both
  //                           legs look the same on real pants)
  //   - all other leg faces → solid accent color
  //   - hip/waist torso strip → solid primaryColor
  const accent = patches.secondaryColorHex ?? patches.primaryColorHex;
  const designFront = patches.leftLeg;
  const overlays = await Promise.all([
    // Pants cover hip/waist with the SAME design on front (visible under
    // a tucked-in shirt), accent on back/sides.
    { input: await solidRegion(PANTS_REGIONS.torsoFront, patches.primaryColorHex), left: PANTS_REGIONS.torsoFront.x, top: PANTS_REGIONS.torsoFront.y },
    { input: await solidRegion(PANTS_REGIONS.torsoBack, patches.primaryColorHex),  left: PANTS_REGIONS.torsoBack.x,  top: PANTS_REGIONS.torsoBack.y },
    { input: await solidRegion(PANTS_REGIONS.torsoLeft, patches.primaryColorHex),  left: PANTS_REGIONS.torsoLeft.x,  top: PANTS_REGIONS.torsoLeft.y },
    { input: await solidRegion(PANTS_REGIONS.torsoRight, patches.primaryColorHex), left: PANTS_REGIONS.torsoRight.x, top: PANTS_REGIONS.torsoRight.y },
    // Left leg: design on the FRONT face only, accent everywhere else.
    patchForRegion(designFront, PANTS_REGIONS.leftLegFront),
    { input: await solidRegion(PANTS_REGIONS.leftLegLeft, accent),  left: PANTS_REGIONS.leftLegLeft.x,  top: PANTS_REGIONS.leftLegLeft.y },
    { input: await solidRegion(PANTS_REGIONS.leftLegRight, accent), left: PANTS_REGIONS.leftLegRight.x, top: PANTS_REGIONS.leftLegRight.y },
    { input: await solidRegion(PANTS_REGIONS.leftLegBack, accent),  left: PANTS_REGIONS.leftLegBack.x,  top: PANTS_REGIONS.leftLegBack.y },
    { input: await solidRegion(PANTS_REGIONS.leftLegUp, accent),    left: PANTS_REGIONS.leftLegUp.x,    top: PANTS_REGIONS.leftLegUp.y },
    { input: await solidRegion(PANTS_REGIONS.leftLegDown, accent),  left: PANTS_REGIONS.leftLegDown.x,  top: PANTS_REGIONS.leftLegDown.y },
    // Right leg: same — design on front face, accent elsewhere.
    patchForRegion(patches.rightLeg ?? designFront, PANTS_REGIONS.rightLegFront),
    { input: await solidRegion(PANTS_REGIONS.rightLegLeft, accent),  left: PANTS_REGIONS.rightLegLeft.x,  top: PANTS_REGIONS.rightLegLeft.y },
    { input: await solidRegion(PANTS_REGIONS.rightLegRight, accent), left: PANTS_REGIONS.rightLegRight.x, top: PANTS_REGIONS.rightLegRight.y },
    { input: await solidRegion(PANTS_REGIONS.rightLegBack, accent),  left: PANTS_REGIONS.rightLegBack.x,  top: PANTS_REGIONS.rightLegBack.y },
    { input: await solidRegion(PANTS_REGIONS.rightLegUp, accent),    left: PANTS_REGIONS.rightLegUp.x,    top: PANTS_REGIONS.rightLegUp.y },
    { input: await solidRegion(PANTS_REGIONS.rightLegDown, accent),  left: PANTS_REGIONS.rightLegDown.x,  top: PANTS_REGIONS.rightLegDown.y },
  ]);

  return sharp({
    create: {
      width: TEMPLATE_WIDTH,
      height: TEMPLATE_HEIGHT,
      channels: 4,
      background: hexToRgba(patches.primaryColorHex),
    },
  }).composite(overlays).png().toBuffer();
}

/**
 * Generate a front-view R15 avatar preview with clothing textures applied.
 * Extracts the front-facing regions from composed 585x559 templates
 * so the preview matches exactly what appears in-game.
 */
export async function generateClothingPreviewImage(
  shirtTemplate: Buffer | undefined,
  pantsTemplate: Buffer | undefined,
  skinColorHex = '#D2A572',
): Promise<Buffer> {
  const W = 400;
  const H = 560;
  const skin = hexToRgba(skinColorHex);

  const headW = 100, headH = 100;
  const torsoW = 160, torsoH = 160;
  const armW = 64, armH = 160;
  const legW = 80, legH = 160;
  const gap = 4;

  const headX = Math.round((W - headW) / 2);
  const headY = 16;
  const torsoX = Math.round((W - torsoW) / 2);
  const torsoY = headY + headH + gap;
  const leftArmX = torsoX - armW - gap;
  const rightArmX = torsoX + torsoW + gap;
  const leftLegX = torsoX + Math.round((torsoW / 2 - legW) / 2);
  const rightLegX = torsoX + Math.round(torsoW / 2) + Math.round((torsoW / 2 - legW) / 2);
  const legY = torsoY + torsoH + gap;
  const handW = armW, handH = 24;

  async function solidRect(w: number, h: number, color: { r: number; g: number; b: number; alpha: number }): Promise<Buffer> {
    return sharp({ create: { width: w, height: h, channels: 4, background: color } }).png().toBuffer();
  }

  async function regionFromTemplate(
    template: Buffer | undefined,
    region: TextureRegion,
    targetW: number,
    targetH: number,
    fallbackColor: { r: number; g: number; b: number; alpha: number },
  ): Promise<Buffer> {
    if (!template) return solidRect(targetW, targetH, fallbackColor);
    try {
      return await sharp(template)
        .extract({ left: region.x, top: region.y, width: region.w, height: region.h })
        .resize(targetW, targetH, { fit: 'fill' })
        .png()
        .toBuffer();
    } catch {
      return solidRect(targetW, targetH, fallbackColor);
    }
  }

  const shirtFallback = { r: 128, g: 128, b: 128, alpha: 255 };
  const pantsFallback = { r: 80, g: 80, b: 120, alpha: 255 };

  const overlays: Array<{ input: Buffer; left: number; top: number }> = [
    { input: await solidRect(headW, headH, skin), left: headX, top: headY },
    { input: await regionFromTemplate(shirtTemplate, SHIRT_REGIONS.torsoFront, torsoW, torsoH, shirtFallback), left: torsoX, top: torsoY },
    { input: await regionFromTemplate(shirtTemplate, SHIRT_REGIONS.leftArmFront, armW, armH, shirtFallback), left: leftArmX, top: torsoY },
    { input: await regionFromTemplate(shirtTemplate, SHIRT_REGIONS.rightArmFront, armW, armH, shirtFallback), left: rightArmX, top: torsoY },
    { input: await solidRect(handW, handH, skin), left: leftArmX, top: torsoY + armH },
    { input: await solidRect(handW, handH, skin), left: rightArmX, top: torsoY + armH },
    { input: await regionFromTemplate(pantsTemplate, PANTS_REGIONS.leftLegFront, legW, legH, pantsFallback), left: leftLegX, top: legY },
    { input: await regionFromTemplate(pantsTemplate, PANTS_REGIONS.rightLegFront, legW, legH, pantsFallback), left: rightLegX, top: legY },
  ];

  const eyeSize = 12;
  const dark = { r: 30, g: 30, b: 30, alpha: 255 };
  const eyeY = headY + Math.round(headH * 0.36);
  overlays.push(
    { input: await solidRect(eyeSize, eyeSize, dark), left: headX + Math.round(headW * 0.28), top: eyeY },
    { input: await solidRect(eyeSize, eyeSize, dark), left: headX + Math.round(headW * 0.60), top: eyeY },
  );
  const smileW = 32, smileH = 6;
  overlays.push({
    input: await solidRect(smileW, smileH, dark),
    left: headX + Math.round((headW - smileW) / 2),
    top: headY + Math.round(headH * 0.62),
  });

  return sharp({
    create: { width: W, height: H, channels: 4, background: { r: 240, g: 240, b: 248, alpha: 255 } },
  }).composite(overlays).png().toBuffer();
}

export async function buildTemplateDebugMap(kind: 'shirt' | 'pants'): Promise<Buffer> {
  const regions = kind === 'shirt' ? SHIRT_REGIONS : PANTS_REGIONS;
  assertRegionBounds(regions, kind);
  const palette = ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#00c7be', '#007aff', '#5856d6', '#ff2d55'];
  const overlays: Array<{ input: Buffer; left: number; top: number }> = [];
  let i = 0;
  for (const region of Object.values(regions)) {
    overlays.push({
      input: await solidRegion(region, palette[i % palette.length]),
      left: region.x,
      top: region.y,
    });
    i += 1;
  }
  return sharp({
    create: {
      width: TEMPLATE_WIDTH,
      height: TEMPLATE_HEIGHT,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  }).composite(overlays).png().toBuffer();
}
