// auraGenerator.ts — Voice-to-Aura particle engine pipeline (session 385).
//
// Per request, fires (parallel):
//   1. Main concept image via flux text-to-image.
//   2. "OP" variation image via flux.
//   3. "Cursed" variation image via flux.
//   4. Anthropic call → safe Roblox Lua particle script.
//   5. Anthropic call → metadata (title, share caption, difficulty,
//      rarity vibe).
//
// Lua is sanitized post-generation: banned identifiers stripped (defense
// in depth against LLM-emitted exploit hooks).

import { logger } from 'firebase-functions/v2';
import { getStorage } from 'firebase-admin/storage';
import { generatePreviewTexture, runChatProvider } from './providers.js';
import { wrapGenericScriptAsRbxmx } from './uiTemplates.js';
import {
  buildAuraImagePrompt,
  buildAuraLuaPrompt,
  AURA_STYLES,
  type AuraStyleId,
  type AuraIntensity,
  type AuraSize,
  type AuraTone,
} from './data/auraStyles.js';

// ─── Storage helpers (mirror Glow-Up / Cursed UGC pattern) ──────

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT ?? 'roblox-ai-generator-v2-2-ios';
const BUCKETS = [
  'roblox-ai-gen-v2-artifacts',
  `${PROJECT_ID}.firebasestorage.app`,
  `${PROJECT_ID}.appspot.com`,
];
let _bucket: ReturnType<ReturnType<typeof getStorage>['bucket']> | null = null;
async function bucket() {
  if (_bucket) return _bucket;
  for (const name of BUCKETS) {
    try { const c = getStorage().bucket(name); const [ok] = await c.exists(); if (ok) { _bucket = c; return c; } } catch { /* try next */ }
  }
  _bucket = getStorage().bucket(BUCKETS[0]);
  return _bucket;
}

async function uploadSigned(args: { firebaseUid: string; filename: string; buf: Buffer; contentType?: string }): Promise<string> {
  const b = await bucket();
  const path = `voice-aura/${args.firebaseUid}/${Date.now()}-${args.filename}`;
  const file = b.file(path);
  await file.save(args.buf, { contentType: args.contentType ?? 'image/png', resumable: false });
  const [url] = await file.getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
  });
  return url;
}

/**
 * Wrap the Lua source in a .rbxmx model file (Server Script targeting
 * ServerScriptService) and upload it. User drag-and-drops the file into
 * Roblox Studio — Script appears auto-parented, no copy-paste needed.
 */
async function uploadRbxmx(args: { firebaseUid: string; lua: string; title: string }): Promise<string | undefined> {
  try {
    const scriptName = args.title.replace(/[^A-Za-z0-9_]/g, '').slice(0, 32) || 'AuraScript';
    const rbxmxXml = wrapGenericScriptAsRbxmx(args.lua, scriptName, 'ServerScriptService', 'Script');
    const buf = Buffer.from(rbxmxXml, 'utf8');
    return await uploadSigned({
      firebaseUid: args.firebaseUid,
      filename: `${scriptName}.rbxmx`,
      buf,
      contentType: 'application/xml',
    });
  } catch (err) {
    logger.warn('[auraGenerator] rbxmx upload failed', { err: err instanceof Error ? err.message : String(err) });
    return undefined;
  }
}

async function fluxToSignedUrl(args: { prompt: string; firebaseUid: string; filename: string }): Promise<string | undefined> {
  try {
    const url = await generatePreviewTexture(args.prompt, 'roblox', 'character');
    if (!url) return undefined;
    const r = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!r.ok) return undefined;
    const buf = Buffer.from(await r.arrayBuffer());
    return await uploadSigned({ ...args, buf });
  } catch (err) {
    logger.warn('[auraGenerator] flux step failed', { filename: args.filename, err: err instanceof Error ? err.message : String(err) });
    return undefined;
  }
}

// ─── Lua generation + post-sanitization ────────────────────────

const LUA_BANNED_PATTERNS: RegExp[] = [
  /HttpService/i,
  /MarketplaceService/i,
  /MessagingService/i,
  /DataStoreService/i,
  /loadstring/i,
  /HttpGet/i,
  /os\.execute/i,
  /RemoteEvent/i,
  /RemoteFunction/i,
  /while\s+true\s+do[\s\S]{0,40}end\s*\)\s*$/m,  // bare loop at end
  /require\s*\(\s*\d+/,  // require by assetId
];

function sanitizeLua(lua: string): { lua: string; rejected: string[] } {
  const rejected: string[] = [];
  for (const re of LUA_BANNED_PATTERNS) {
    if (re.test(lua)) rejected.push(re.toString());
  }
  // Don't auto-edit — if banned terms slipped through, we re-prompt.
  return { lua, rejected };
}

function extractLuaFromMarkdown(text: string): string | undefined {
  const m = text.match(/```lua\s*([\s\S]*?)```/i);
  if (m && m[1]) return m[1].trim();
  // Fallback: if entire response looks Lua-ish, return it stripped.
  const trimmed = text.trim();
  if (trimmed.includes('Instance.new(') || trimmed.includes('Players.PlayerAdded')) {
    return trimmed;
  }
  return undefined;
}

const FALLBACK_LUA = `-- Safe fallback aura (used when LLM generation failed)
-- ServerScriptService → new Script → paste this → Play.
local Players = game:GetService("Players")

local function attachAura(character)
\tlocal hrp = character:WaitForChild("HumanoidRootPart")
\tlocal a = Instance.new("Attachment", hrp)
\ta.Name = "AuraAttachment"
\tlocal p = Instance.new("ParticleEmitter", a)
\tp.Texture = "rbxassetid://243660364"
\tp.Rate = 60
\tp.Lifetime = NumberRange.new(1.0, 2.0)
\tp.Size = NumberSequence.new(1.2)
\tp.Transparency = NumberSequence.new(0.2)
\tp.Speed = NumberRange.new(3, 6)
\tp.Color = ColorSequence.new(Color3.fromRGB(180, 80, 255))
end

Players.PlayerAdded:Connect(function(player)
\tplayer.CharacterAdded:Connect(attachAura)
\tif player.Character then attachAura(player.Character) end
end)
`;

async function generateLuaScript(input: {
  userPrompt: string;
  style: AuraStyleId;
  intensity: AuraIntensity;
  size: AuraSize;
  tone: AuraTone;
}): Promise<{ lua: string; safeUsedFallback: boolean }> {
  const prompt = buildAuraLuaPrompt(input);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await runChatProvider('anthropic', prompt, undefined, { timeoutMs: 20_000 });
      const text = (r.text ?? '').trim();
      const lua = extractLuaFromMarkdown(text);
      if (!lua) {
        logger.warn('[auraGenerator] no Lua block in LLM output, retrying');
        continue;
      }
      const { rejected } = sanitizeLua(lua);
      if (rejected.length > 0) {
        logger.warn('[auraGenerator] sanitize rejected', { rejected, attempt });
        continue;
      }
      return { lua, safeUsedFallback: false };
    } catch (err) {
      logger.warn('[auraGenerator] LLM call failed', { attempt, err: err instanceof Error ? err.message : String(err) });
    }
  }
  return { lua: FALLBACK_LUA, safeUsedFallback: true };
}

// ─── Metadata via single LLM call ──────────────────────────────

export interface AuraMetadata {
  titleEN: string;
  titleRU: string;
  shareCaption: string;
  rarityVibeEN: string;
  rarityVibeRU: string;
  difficulty: 'Easy' | 'Medium' | 'Advanced';
}

async function generateMetadata(args: {
  userPrompt: string;
  styleId: AuraStyleId;
  intensity: AuraIntensity;
}): Promise<AuraMetadata> {
  const style = AURA_STYLES[args.styleId];
  const prompt = [
    'You are writing metadata for an AI-generated Roblox aura/particle effect.',
    `Style: ${style.titleEN}. Intensity: ${args.intensity}.`,
    args.userPrompt.trim() ? `User brief: "${args.userPrompt.trim().slice(0, 120)}".` : '',
    'Return ONE JSON object with EXACTLY these keys, no markdown:',
    '{',
    '  "titleEN": "Void Lightning Aura" (3-5 word power-fantasy name),',
    '  "titleRU": "RU version, 3-5 words",',
    '  "shareCaption": "bro this aura is insane 🔥" (short TikTok caption),',
    '  "rarityVibeEN": "Mythic" (fake rarity tier — Legendary/Mythic/Forbidden/Cursed Tier),',
    '  "rarityVibeRU": "RU version",',
    '  "difficulty": "Easy" (or "Medium"/"Advanced" — how hard to drop into Studio)',
    '}',
    'Output JSON ONLY.',
  ].filter(Boolean).join('\n');
  try {
    const r = await runChatProvider('anthropic', prompt, undefined, { timeoutMs: 12_000 });
    const text = (r.text ?? '').trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('no JSON');
    const parsed = JSON.parse(match[0]) as Partial<AuraMetadata>;
    return {
      titleEN: typeof parsed.titleEN === 'string' ? parsed.titleEN : `${style.titleEN} Aura`,
      titleRU: typeof parsed.titleRU === 'string' ? parsed.titleRU : `${style.titleEN} Aura`,
      shareCaption: typeof parsed.shareCaption === 'string' ? parsed.shareCaption : 'bro this aura is insane 🔥',
      rarityVibeEN: typeof parsed.rarityVibeEN === 'string' ? parsed.rarityVibeEN : 'Mythic',
      rarityVibeRU: typeof parsed.rarityVibeRU === 'string' ? parsed.rarityVibeRU : 'Мифический',
      difficulty: (parsed.difficulty === 'Easy' || parsed.difficulty === 'Medium' || parsed.difficulty === 'Advanced')
        ? parsed.difficulty
        : 'Easy',
    };
  } catch (err) {
    logger.warn('[auraGenerator] metadata fallback', { err: err instanceof Error ? err.message : String(err) });
    return {
      titleEN: `${style.titleEN} Aura`,
      titleRU: `${style.titleEN} Aura`,
      shareCaption: 'bro this aura is insane 🔥',
      rarityVibeEN: 'Mythic',
      rarityVibeRU: 'Мифический',
      difficulty: 'Easy',
    };
  }
}

// ─── Static setup instructions ─────────────────────────────────

function buildSetupInstructions(en: boolean): string[] {
  if (en) {
    return [
      'FASTEST: Download the .rbxmx file → open Roblox Studio → drag the file into ServerScriptService. The Script auto-parents. Press Play (▶). Done.',
      'OR MANUAL: Open Roblox Studio with your place.',
      'In the Explorer panel, find ServerScriptService.',
      'Right-click → Insert Object → Script.',
      'Paste the Lua code below into that Script.',
      'Press Play (▶). The aura appears around every player\'s avatar — including yours, your friends, and respawns.',
      'To remove the effect, just delete the Script and restart.',
    ];
  }
  return [
    'БЫСТРО: Скачай .rbxmx файл → открой Roblox Studio → перетащи файл в ServerScriptService. Script появится сам. Нажми Play (▶). Готово.',
    'ИЛИ ВРУЧНУЮ: Открой Roblox Studio со своим place.',
    'В Explorer найди ServerScriptService.',
    'Правый клик → Insert Object → Script.',
    'Вставь Lua-код ниже в этот Script.',
    'Нажми Play (▶). Aura появится на аватаре каждого игрока — включая тебя, друзей и при respawn.',
    'Чтобы убрать — просто удали Script и перезапусти.',
  ];
}

// ─── Public entry ───────────────────────────────────────────────

export interface AuraGenerateInput {
  userPrompt: string;
  style: AuraStyleId;
  intensity: AuraIntensity;
  size: AuraSize;
  tone: AuraTone;
  inputMode: 'voice' | 'text';
  firebaseUid: string;
}

export interface AuraGenerateResult extends AuraMetadata {
  generationId: string;
  style: AuraStyleId;
  intensity: AuraIntensity;
  size: AuraSize;
  tone: AuraTone;
  previewUrl?: string;
  variations: Array<{ label: 'op' | 'cursed'; imageUrl?: string }>;
  luaScript: string;
  /**
   * Drag-and-drop .rbxmx model wrapping the Lua as a Script targeting
   * ServerScriptService. User drops this file into Roblox Studio and the
   * Script auto-appears — no copy-paste flow needed.
   */
  rbxmxUrl?: string;
  safeUsedFallback: boolean;
  instructionsEN: string[];
  instructionsRU: string[];
  generationStatus: 'ready' | 'partial' | 'failed';
}

export async function generateAura(input: AuraGenerateInput): Promise<AuraGenerateResult> {
  const generationId = `aura_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const baseInput = { userPrompt: input.userPrompt, style: input.style, intensity: input.intensity, size: input.size, tone: input.tone };

  const mainPrompt   = buildAuraImagePrompt(baseInput);
  const opPrompt     = buildAuraImagePrompt(baseInput, 'op');
  const cursedPrompt = buildAuraImagePrompt(baseInput, 'cursed');

  const [previewUrl, opUrl, cursedUrl, luaResult, meta] = await Promise.all([
    fluxToSignedUrl({ prompt: mainPrompt,   firebaseUid: input.firebaseUid, filename: 'main.png' }),
    fluxToSignedUrl({ prompt: opPrompt,     firebaseUid: input.firebaseUid, filename: 'op.png' }),
    fluxToSignedUrl({ prompt: cursedPrompt, firebaseUid: input.firebaseUid, filename: 'cursed.png' }),
    generateLuaScript(baseInput),
    generateMetadata({ userPrompt: input.userPrompt, styleId: input.style, intensity: input.intensity }),
  ]);

  // Wrap the Lua as a drag-drop .rbxmx so the user has both flows:
  // (a) Copy Lua → paste into Roblox Studio Script, OR
  // (b) Download .rbxmx → drag into Studio → Script auto-parents.
  const rbxmxUrl = await uploadRbxmx({
    firebaseUid: input.firebaseUid,
    lua: luaResult.lua,
    title: meta.titleEN,
  });

  const status: 'ready' | 'partial' | 'failed' =
    previewUrl ? (opUrl && cursedUrl ? 'ready' : 'partial') : 'failed';

  return {
    generationId,
    style: input.style,
    intensity: input.intensity,
    size: input.size,
    tone: input.tone,
    previewUrl,
    variations: [
      { label: 'op',     imageUrl: opUrl },
      { label: 'cursed', imageUrl: cursedUrl },
    ],
    luaScript: luaResult.lua,
    rbxmxUrl,
    safeUsedFallback: luaResult.safeUsedFallback,
    instructionsEN: buildSetupInstructions(true),
    instructionsRU: buildSetupInstructions(false),
    generationStatus: status,
    ...meta,
  };
}
