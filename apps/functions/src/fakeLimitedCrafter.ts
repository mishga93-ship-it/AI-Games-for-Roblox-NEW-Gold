// fakeLimitedCrafter.ts — Phase 1 MVP for the "Fake Headless & Korblox" AI
// Crafter (session 382). Composes a recipe of free / cheap Roblox catalog
// items that visually imitate the expensive limited cosmetics (Headless
// Horseman ~31k R$, Korblox Deathspeaker ~17k R$). Optionally generates a
// preview render via the existing flux-pro pipeline.
//
// This module is intentionally standalone: it does NOT plug into the heavy
// generationJobs pipeline. The iOS app calls `/api/fake-limited/recipe`
// directly (see endpoint wiring in index.ts).

import { logger } from 'firebase-functions/v2';
import { generatePreviewTexture, runChatProvider } from './providers.js';
import {
  RECIPE_CATALOG,
  summarizeRecipe,
  type FakeLimitedItem,
  type FakeLimitedKind,
} from './fakeLimitedCatalog.js';

export interface FakeLimitedRecipeResponse {
  kind: FakeLimitedKind;
  title: string;
  pitch: string;
  items: FakeLimitedItem[];
  totalCostRobux: number;
  savedRobux: number;
  steps: string[];
  previewImageUrl?: string;
  disclaimer: string;
}

const RETAIL_COST_ROBUX: Record<FakeLimitedKind, number> = {
  headless: 31_000,
  korblox: 17_000,
  combo: 48_000,
};

const DISCLAIMER_EN = 'These are creative illusions assembled from free or low-cost official Roblox catalog items. They are not the real Headless Horseman or Korblox Deathspeaker, and we do not bypass Roblox payment systems.';

function isFakeLimitedKind(value: unknown): value is FakeLimitedKind {
  return value === 'headless' || value === 'korblox' || value === 'combo';
}

export function parseFakeLimitedKind(raw: unknown): FakeLimitedKind {
  if (typeof raw === 'string') {
    const lower = raw.toLowerCase().trim();
    if (isFakeLimitedKind(lower)) return lower;
  }
  return 'headless';
}

function buildSteps(kind: FakeLimitedKind, items: FakeLimitedItem[]): string[] {
  const lines: string[] = [];
  lines.push('Open Roblox Avatar Editor on your account.');
  if (kind === 'headless' || kind === 'combo') {
    lines.push('Body Scale → Head: drag slider to minimum (0.95 → 0.05) to shrink the head.');
  }
  if (kind === 'korblox' || kind === 'combo') {
    lines.push('Body Colors → Right Leg: set RGB to near-black (12, 12, 12) to emulate the bone shade.');
  }
  items.forEach((it, idx) => {
    const verb = it.category === 'shirt' || it.category === 'pants' || it.category === 'layered'
      ? 'Wear'
      : 'Equip';
    lines.push(`${idx + 3}. ${verb} "${it.name}" (asset ${it.assetId}${it.pricedRobux === 0 ? ', Free' : `, ${it.pricedRobux} R$`}).`);
  });
  lines.push('Save the outfit and join a game to verify the illusion holds in third-person view.');
  return lines;
}

function buildLLMPolishPrompt(kind: FakeLimitedKind, items: FakeLimitedItem[]): string {
  const retail = RETAIL_COST_ROBUX[kind].toLocaleString('en-US');
  const total = summarizeRecipe(kind).totalCostRobux;
  const itemList = items.map((it) => `- ${it.name} (${it.assetId}, ${it.pricedRobux === 0 ? 'Free' : `${it.pricedRobux} R$`}) — ${it.notes}`).join('\n');
  return [
    `You are writing a one-sentence marketing pitch (max 22 words) for an AI tool that recreates the Roblox "${kind}" limited look using free/cheap catalog items.`,
    `Retail price of the real limited: ${retail} Robux. Recipe total: ${total} Robux.`,
    `The recipe uses these items:`,
    itemList,
    `Constraints: NO claims of getting the real item for free. NO mention of exploits, hacks, or bypassing payments. Emphasize "looks like" / "illusion" / "for the cost of zero Robux". Output ONLY the sentence, no quotes, no preamble.`,
  ].join('\n');
}

async function safePolishPitch(kind: FakeLimitedKind, items: FakeLimitedItem[]): Promise<string> {
  try {
    const prompt = buildLLMPolishPrompt(kind, items);
    const result = await runChatProvider('anthropic', prompt, undefined, { timeoutMs: 15_000 });
    const text = (result.text ?? '').trim();
    if (text.length > 0 && text.length <= 280) return text;
  } catch (err) {
    logger.warn('fake-limited pitch LLM polish failed; using fallback', err);
  }
  if (kind === 'headless') return 'Get the headless illusion for 0 Robux — free catalog items only, no exploits.';
  if (kind === 'korblox') return 'Skeleton-leg silhouette without the 17k Robux Korblox price tag.';
  return 'Headless + Korblox combo illusion built entirely from free/cheap official catalog items.';
}

function buildPreviewPrompt(kind: FakeLimitedKind): string {
  if (kind === 'headless') {
    return 'A Roblox blocky avatar standing on plain white background, R15 rig, full body 3/4 view. The character appears headless — head is reduced to a tiny dark void with no visible face, black turtleneck collar masks the neck stump. No floating items, no text, no logos. Family-friendly, no gore.';
  }
  if (kind === 'korblox') {
    return 'A Roblox blocky avatar full body 3/4 view on plain white background, R15 rig. The right leg is dark grey-black with a faintly visible skeleton bone overlay, left leg normal skin tone. Casual outfit, regular head. No text, no logos. Family-friendly.';
  }
  return 'A Roblox blocky avatar standing on plain white background, R15 rig, full body 3/4 view. The character appears headless (tiny dark void where head should be) AND has a dark skeleton-styled right leg. No text, no logos. Family-friendly, no gore.';
}

export async function generateFakeLimitedRecipe(input: {
  kind: FakeLimitedKind;
  includePreview?: boolean;
}): Promise<FakeLimitedRecipeResponse> {
  const items = RECIPE_CATALOG[input.kind];
  const summary = summarizeRecipe(input.kind);
  const retail = RETAIL_COST_ROBUX[input.kind];
  const [pitch, previewImageUrl] = await Promise.all([
    safePolishPitch(input.kind, items),
    input.includePreview === false
      ? Promise.resolve(undefined)
      : generatePreviewTexture(buildPreviewPrompt(input.kind), 'roblox', 'character').catch((err: unknown) => {
          logger.warn('fake-limited preview render failed; recipe returned without image', err);
          return undefined;
        }),
  ]);
  const title = input.kind === 'headless'
    ? 'Fake Headless — 0 Robux look'
    : input.kind === 'korblox'
      ? 'Fake Korblox — skeleton-leg illusion'
      : 'Fake Headless + Korblox combo';
  return {
    kind: input.kind,
    title,
    pitch,
    items,
    totalCostRobux: summary.totalCostRobux,
    savedRobux: Math.max(0, retail - summary.totalCostRobux),
    steps: buildSteps(input.kind, items),
    previewImageUrl,
    disclaimer: DISCLAIMER_EN,
  };
}
