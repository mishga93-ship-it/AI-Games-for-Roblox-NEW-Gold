// glowupVibes.ts — Phase 2 Avatar Glow-Up vibe presets (session 382 Phase 2).
//
// Each vibe is a complete recipe: marketing hook + decal generation prompt
// (for flux-pro) + shirt/pants color composition recipe (for sharp) + body
// settings + curated catalog items + step-by-step Avatar Editor instructions.
//
// 4 vibes shipped in this session (Headless Shadow, Korblox Style, Void,
// Sigma). 4 more (Rich Emo, Cursed, Anime Demon, Goth Baddie) come in
// Session C.
//
// IMPORTANT: AI does NOT generate from scratch. We mix templates, tweak
// colors, layer decals, add catalog items. The vibe spec is the "recipe"
// — AI only fills in stylized texture details via decalPrompt.

import { HEADLESS_ITEMS, KORBLOX_ITEMS, type FakeLimitedItem } from '../fakeLimitedCatalog.js';

export type GlowupVibeId =
  | 'headless_shadow'
  | 'korblox_style'
  | 'void'
  | 'sigma';

export type GlowupGender = 'boys' | 'girls' | 'neutral';
export type GlowupIntensity = 'clean' | 'scary';

export interface GlowupColorPalette {
  /** RGB triple in 0..255 for skin tone instruction. */
  skinHex: string;
  /** Primary shirt fill color. */
  shirtPrimaryHex: string;
  /** Optional accent stripe / collar / inner overlay color on shirt. */
  shirtAccentHex?: string;
  /** Primary pants fill color. */
  pantsPrimaryHex: string;
  /** Optional accent for pants (e.g. right-leg differential for Korblox). */
  pantsAccentHex?: string;
}

export interface GlowupBodySettings {
  /** Recommended Avatar Editor body type. */
  bodyType: 'Default' | 'Man' | 'Woman';
  /** Body Scale → Width slider %, 0..100. */
  widthPercent: number;
  /** Body Scale → Height slider %, 0..100. */
  heightPercent: number;
  /** Head scale 0..100. Used by Headless to shrink head to ~5%. */
  headPercent: number;
}

export interface GlowupVibe {
  id: GlowupVibeId;
  title: string;
  pitch: string;                  // one-liner shown on result screen
  appStoreHook: string;           // TikTok-bait phrase for share/caption
  /** Flux-pro prompt for the face/aura decal PNG (1024×1024, transparent). */
  decalPrompt: string;
  palette: GlowupColorPalette;
  body: GlowupBodySettings;
  /** Pre-curated catalog accessories that finish the look. */
  catalogAccessories: FakeLimitedItem[];
  /**
   * Step-by-step instructions for Avatar Editor (RU+EN). Returned to iOS,
   * each step is a single sentence the user follows in order.
   */
  instructionsRU: string[];
  instructionsEN: string[];
  /** Marketing share-sheet caption (Russian). */
  shareCaptionRU: string;
  shareCaptionEN: string;
  /** Retail R$ price of the limited this vibe imitates (used for "Saved" badge). */
  imitatedRetailRobux: number;
}

/** Hex helper: "1A2B3C" → "RGB 26, 43, 60" for instructions. */
function hexToRgbText(hex: string): string {
  const h = hex.replace(/^#/, '');
  const n = parseInt(h, 16);
  return `RGB ${(n >> 16) & 0xff}, ${(n >> 8) & 0xff}, ${n & 0xff}`;
}

const VIBES: Record<GlowupVibeId, GlowupVibe> = {
  // ─────────────────────────────────────────────────────────
  // 1. Headless Shadow — imitates Headless Horseman (31,000 R$)
  // ─────────────────────────────────────────────────────────
  headless_shadow: {
    id: 'headless_shadow',
    title: 'Headless Shadow',
    pitch: 'Тёмный void на месте головы. Дёшево, чисто, выглядит как лимитка за 31к Robux.',
    appStoreHook: 'OMG FREE HEADLESS',
    decalPrompt: 'A square dark void face accessory texture: pure black smooth gradient, faint dark blue cosmic dust, no facial features, no eyes, no mouth. Designed as a Roblox face accessory overlay. Transparent background, isolated, centered. NO text, NO logos. Family-friendly, no horror, no gore.',
    palette: {
      skinHex: '1B2A33',          // very dark grey-blue (looks like void continuing from head)
      shirtPrimaryHex: '0A0A0A',  // near-black
      shirtAccentHex: '1B2A33',   // collar same as skin to hide neck seam
      pantsPrimaryHex: '0A0A0A',
    },
    body: {
      bodyType: 'Default',
      widthPercent: 70,
      heightPercent: 50,
      headPercent: 5,              // shrink head to vanishing point
    },
    catalogAccessories: HEADLESS_ITEMS,
    instructionsRU: [
      'Avatar Editor → Body Scale → Head: тяни слайдер до минимума (примерно 5%).',
      'Body Colors → Head: установи цвет 1B2A33 (тёмный void).',
      'Body Colors → Torso: 0A0A0A (чёрный).',
      'Скачай Shirt.png и загрузи через create.roblox.com/dashboard/creations/upload (тип: Classic Shirt). 10 R$.',
      'Скачай Pants.png и загрузи там же (тип: Classic Pants). 10 R$.',
      'Equip face decal — авто-загрузил через OAuth ИЛИ загрузи Decal.png в Roblox вручную.',
      'Equip Black Turtleneck (15 R$) и Void Smooth Brain (бесплатно) из каталога.',
    ],
    instructionsEN: [
      'Avatar Editor → Body Scale → Head: drag slider to minimum (~5%).',
      'Body Colors → Head: set color to 1B2A33 (dark void).',
      'Body Colors → Torso: 0A0A0A (black).',
      'Download Shirt.png and upload at create.roblox.com/dashboard/creations/upload (Classic Shirt, 10 R$).',
      'Download Pants.png and upload there too (Classic Pants, 10 R$).',
      'Equip face decal — auto-uploaded via OAuth OR upload Decal.png manually.',
      'Equip Black Turtleneck (15 R$) and Void Smooth Brain (free) from catalog.',
    ],
    shareCaptionRU: 'Сделал FREE HEADLESS через Kami Gold AI за 0 Robux 🔥 #roblox #headless #freerobux',
    shareCaptionEN: 'Got FREE HEADLESS via Kami Gold AI for 0 Robux 🔥 #roblox #headless #freerobux',
    imitatedRetailRobux: 31_000,
  },

  // ─────────────────────────────────────────────────────────
  // 2. Korblox Style — imitates Korblox Deathspeaker (17,000 R$)
  // ─────────────────────────────────────────────────────────
  korblox_style: {
    id: 'korblox_style',
    title: 'Korblox Style',
    pitch: 'Скелетная нога-кибер. Имитация Korblox Deathspeaker за 17к Robux — без переплаты.',
    appStoreHook: 'FREE KORBLOX LEG',
    decalPrompt: 'A square dark bone/skeleton texture overlay: black background with subtle white-blue bone fragments, vertical bone segments resembling a leg skeleton in cyber-fantasy style. Designed as a Roblox right-leg decal overlay. Transparent edges, centered. NO text, NO horror, NO gore — stylized fantasy bone art only.',
    palette: {
      skinHex: '7C8A99',           // ash grey (good fallback under accessory)
      shirtPrimaryHex: '1A1A1A',
      shirtAccentHex: '2D3540',
      pantsPrimaryHex: '0A0A0A',
      pantsAccentHex: '0C0C0C',    // right leg slightly darker for skeleton effect
    },
    body: {
      bodyType: 'Man',
      widthPercent: 60,
      heightPercent: 60,
      headPercent: 100,
    },
    catalogAccessories: KORBLOX_ITEMS,
    instructionsRU: [
      'Avatar Editor → Body Type: Man, Width 60%, Height 60%.',
      'Body Colors → Right Leg: установи цвет 0C0C0C (почти чёрный — основа для bone).',
      'Body Colors → Left Leg: оставь обычный skin.',
      'Скачай Shirt.png + Pants.png, загрузи через create.roblox.com (10 R$ каждый).',
      'Equip skeleton decal — авто-загрузил на твой Roblox через OAuth, или вручную.',
      'Equip Pencil Body (бесплатно) и Skeleton Leg Accessory (25 R$).',
    ],
    instructionsEN: [
      'Avatar Editor → Body Type: Man, Width 60%, Height 60%.',
      'Body Colors → Right Leg: set color 0C0C0C (near-black, bone base).',
      'Body Colors → Left Leg: leave default skin tone.',
      'Download Shirt.png + Pants.png, upload at create.roblox.com (10 R$ each).',
      'Equip skeleton decal — auto-uploaded via OAuth or upload manually.',
      'Equip Pencil Body (free) and Skeleton Leg Accessory (25 R$).',
    ],
    shareCaptionRU: 'Получил Korblox-стайл за 25 R$ вместо 17к через Kami Gold AI 💀 #roblox #korblox #freerobux',
    shareCaptionEN: 'Got Korblox-style for 25 R$ instead of 17k via Kami Gold AI 💀 #roblox #korblox #freerobux',
    imitatedRetailRobux: 17_000,
  },

  // ─────────────────────────────────────────────────────────
  // 3. Void — full-dark cursed aesthetic
  // ─────────────────────────────────────────────────────────
  void: {
    id: 'void',
    title: 'Void',
    pitch: 'Полностью чёрный, безликий, с дымной аурой. Cursed-эстетика для TikTok-видосов.',
    appStoreHook: 'CURSED VOID AVATAR',
    decalPrompt: 'A square cursed void aesthetic decal: dark smoky aura, subtle purple-violet glow at edges, smooth gradient from pure black center to dark grey edges. Designed as a Roblox aura/back decal overlay. No facial features, no human figures, no text. Family-friendly cosmic dark art, no gore, no horror.',
    palette: {
      skinHex: '0A0A0A',           // pure black skin
      shirtPrimaryHex: '0A0A0A',
      shirtAccentHex: '2A1A3A',    // hint of dark purple at collar
      pantsPrimaryHex: '0A0A0A',
    },
    body: {
      bodyType: 'Default',
      widthPercent: 65,
      heightPercent: 55,
      headPercent: 100,
    },
    catalogAccessories: [
      {
        assetId: '7805334103',
        name: 'Glass Half Head',
        pricedRobux: 80,
        category: 'face_accessory',
        role: 'primary_illusion',
        notes: 'Прозрачная половина головы добавляет cursed-эффект.',
      },
      {
        assetId: '20577850',
        name: 'Black Turtleneck',
        pricedRobux: 15,
        category: 'shirt',
        role: 'concealer',
        notes: 'Чёрный воротник скрывает шею под void-головой.',
      },
    ],
    instructionsRU: [
      'Avatar Editor → Body Colors: ВСЕ части тела установи в 0A0A0A (полный чёрный).',
      'Body Scale: Width 65%, Height 55%.',
      'Скачай Shirt.png и Pants.png (всё чёрное с тёмным purple-акцентом). Загрузи на create.roblox.com.',
      'Equip aura decal — авто-загрузил или вручную.',
      'Equip Black Turtleneck + Glass Half Head из каталога.',
    ],
    instructionsEN: [
      'Avatar Editor → Body Colors: set ALL body parts to 0A0A0A (pure black).',
      'Body Scale: Width 65%, Height 55%.',
      'Download Shirt.png + Pants.png (all-black with dark purple accent). Upload at create.roblox.com.',
      'Equip aura decal — auto-uploaded or manual.',
      'Equip Black Turtleneck + Glass Half Head from catalog.',
    ],
    shareCaptionRU: 'Cursed Void лук через Kami Gold AI 🖤 #roblox #voidavatar #cursed',
    shareCaptionEN: 'Cursed Void look via Kami Gold AI 🖤 #roblox #voidavatar #cursed',
    imitatedRetailRobux: 25_000,
  },

  // ─────────────────────────────────────────────────────────
  // 4. Sigma — cold minimalist suit
  // ─────────────────────────────────────────────────────────
  sigma: {
    id: 'sigma',
    title: 'Sigma',
    pitch: 'Холодный, минималистичный, в костюме без улыбки. Sigma-мейл-стайл, ноль эмоций.',
    appStoreHook: 'SIGMA CHAD MODE',
    decalPrompt: 'A square blank stoic face decal for a Roblox character: minimal facial features, neutral expression, no smile, no eyes (or very subtle dark eye dots), pale skin tone, designed as a face overlay. Photorealistic style, sharp contrast. Centered, transparent edges. No text, no logos, family-friendly.',
    palette: {
      skinHex: 'CFC2A6',           // light tan
      shirtPrimaryHex: '1F2530',   // dark grey suit jacket
      shirtAccentHex: 'F2F2F2',    // white shirt collar peek
      pantsPrimaryHex: '1A1F28',   // matching trousers
    },
    body: {
      bodyType: 'Man',
      widthPercent: 50,
      heightPercent: 70,            // tall
      headPercent: 100,
    },
    catalogAccessories: [
      {
        assetId: '102611803',
        name: 'Black Sunglasses',
        pricedRobux: 25,
        category: 'face_accessory',
        role: 'accent',
        notes: 'Чёрные очки усиливают sigma-vibe.',
      },
      {
        assetId: '20577850',
        name: 'Black Turtleneck',
        pricedRobux: 15,
        category: 'shirt',
        role: 'concealer',
        notes: 'Под пиджаком — водолазка вместо рубашки.',
      },
    ],
    instructionsRU: [
      'Avatar Editor → Body Type: Man, Width 50%, Height 70% (выше среднего).',
      'Body Colors → Head + Arms: установи CFC2A6 (светлый загар).',
      'Скачай Shirt.png (тёмно-серый пиджак с белой рубашкой) и Pants.png (тёмные брюки). Загрузи.',
      'Equip stoic-face decal — авто-загрузил или вручную.',
      'Equip Black Sunglasses (25 R$) + Black Turtleneck (15 R$).',
    ],
    instructionsEN: [
      'Avatar Editor → Body Type: Man, Width 50%, Height 70% (above average).',
      'Body Colors → Head + Arms: set CFC2A6 (light tan).',
      'Download Shirt.png (dark grey suit + white collar peek) and Pants.png (dark trousers). Upload them.',
      'Equip stoic-face decal — auto-uploaded or manual.',
      'Equip Black Sunglasses (25 R$) + Black Turtleneck (15 R$).',
    ],
    shareCaptionRU: 'Sigma Chad режим активирован через Kami Gold AI 🗿 #roblox #sigma #avatar',
    shareCaptionEN: 'Sigma Chad mode activated via Kami Gold AI 🗿 #roblox #sigma #avatar',
    imitatedRetailRobux: 5_000,
  },
};

export function getGlowupVibe(id: GlowupVibeId): GlowupVibe {
  return VIBES[id];
}

export function listGlowupVibes(): GlowupVibe[] {
  return Object.values(VIBES);
}

export function isGlowupVibeId(value: unknown): value is GlowupVibeId {
  return typeof value === 'string' && value in VIBES;
}

export function summarizeVibe(vibe: GlowupVibe): {
  catalogCostRobux: number;
  uploadFeesRobux: number;
  totalCostRobux: number;
  savedRobux: number;
} {
  const catalogCostRobux = vibe.catalogAccessories.reduce((acc, it) => acc + it.pricedRobux, 0);
  // Classic Shirt + Classic Pants Roblox upload fees = 10 R$ × 2 = 20 R$.
  const uploadFeesRobux = 20;
  const totalCostRobux = catalogCostRobux + uploadFeesRobux;
  const savedRobux = Math.max(0, vibe.imitatedRetailRobux - totalCostRobux);
  return { catalogCostRobux, uploadFeesRobux, totalCostRobux, savedRobux };
}

export { hexToRgbText };
