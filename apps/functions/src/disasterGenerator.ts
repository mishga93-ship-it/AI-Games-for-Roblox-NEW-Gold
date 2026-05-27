// disasterGenerator.ts — Voice-Controlled Survival Disaster Spawner pipeline
// (session 387). Mirrors auraGenerator pattern: flux image + safe Lua +
// metadata + .rbxmx wrapper.

import { logger } from 'firebase-functions/v2';
import { getStorage } from 'firebase-admin/storage';
import { generatePreviewTexture, runChatProvider } from './providers.js';
import { wrapGenericScriptAsRbxmx } from './uiTemplates.js';
import {
  buildDisasterImagePrompt,
  buildDisasterLuaPrompt,
  DISASTER_MODES,
  type DisasterModeId,
  type DisasterChaosLevel,
  type DisasterSize,
  type DisasterFrequency,
} from './data/disasterStyles.js';

// ─── Storage helpers ───────────────────────────────────────────

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
  const path = `disaster-spawner/${args.firebaseUid}/${Date.now()}-${args.filename}`;
  const file = b.file(path);
  await file.save(args.buf, { contentType: args.contentType ?? 'image/png', resumable: false });
  const [url] = await file.getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
  });
  return url;
}

async function fluxToSignedUrl(args: { prompt: string; firebaseUid: string; filename: string }): Promise<string | undefined> {
  try {
    const url = await generatePreviewTexture(args.prompt, 'roblox', 'game');
    if (!url) return undefined;
    const r = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!r.ok) return undefined;
    const buf = Buffer.from(await r.arrayBuffer());
    return await uploadSigned({ ...args, buf });
  } catch (err) {
    logger.warn('[disasterGenerator] flux step failed', { filename: args.filename, err: err instanceof Error ? err.message : String(err) });
    return undefined;
  }
}

async function uploadRbxmx(args: { firebaseUid: string; lua: string; title: string }): Promise<string | undefined> {
  try {
    const scriptName = args.title.replace(/[^A-Za-z0-9_]/g, '').slice(0, 32) || 'DisasterScript';
    const rbxmx = wrapGenericScriptAsRbxmx(args.lua, scriptName, 'ServerScriptService', 'Script');
    return await uploadSigned({
      firebaseUid: args.firebaseUid,
      filename: `${scriptName}.rbxmx`,
      buf: Buffer.from(rbxmx, 'utf8'),
      contentType: 'application/xml',
    });
  } catch (err) {
    logger.warn('[disasterGenerator] rbxmx upload failed', { err: err instanceof Error ? err.message : String(err) });
    return undefined;
  }
}

// ─── Lua generation + sanitization ─────────────────────────────

const LUA_BANNED: RegExp[] = [
  /HttpService/i,
  /MarketplaceService/i,
  /MessagingService/i,
  /DataStoreService/i,
  /loadstring/i,
  /HttpGet/i,
  /os\.execute/i,
  /\bRemoteEvent\b/i,
  /\bRemoteFunction\b/i,
  /\bBindableEvent\b/i,
  /require\s*\(\s*\d+/,                       // require by assetId
  /while\s+true\s+do\s*end/,                  // bare infinite loop
  /while\s+true\s+do[\s\S]{0,30}end\s*\)/,    // task.spawn(function() while true do … end end)
];

function sanitizeLua(lua: string): { ok: boolean; rejected: string[] } {
  const rejected = LUA_BANNED.filter((re) => re.test(lua)).map((re) => re.toString());
  return { ok: rejected.length === 0, rejected };
}

function extractLuaBlock(text: string): string | undefined {
  // Prefer a complete ```lua … ``` fence pair.
  const paired = text.match(/```lua\s*([\s\S]*?)```/i);
  if (paired && paired[1]) return paired[1].trim();

  // Fallback: LLM response was truncated mid-fence (e.g. max_tokens hit
  // before closing ```). Strip any leading ```lua/``` and trailing ``` we
  // still see, so the .rbxmx CDATA doesn't end up with literal backticks
  // at the top — that's a Lua syntax error on line 1 and the script
  // silently does nothing on Play (session 385 user repro).
  let stripped = text.trim();
  stripped = stripped.replace(/^```lua\s*\n?/i, '');
  stripped = stripped.replace(/^```\s*\n?/, '');
  stripped = stripped.replace(/\n?\s*```\s*$/, '');
  stripped = stripped.trim();

  if (stripped.includes('Instance.new(') && stripped.includes('task.wait')) {
    return stripped;
  }
  return undefined;
}

// A spawner Lua that doesn't loop (no `while … do` driver) silently spawns
// nothing on Play. A Lua that ends mid-call (no terminal `end` / `)` on the
// last non-comment line) is truncated. Either case → reject so we retry or
// fall back to FALLBACK_LUA instead of shipping a dud .rbxmx.
function looksTruncatedOrEmpty(lua: string): boolean {
  if (lua.length < 200) return true;
  if (!/\bwhile\b[\s\S]+?\bdo\b/.test(lua) && !/\btask\.spawn\b/.test(lua)) return true;
  // Last non-comment, non-blank line should end with `end`, `)` or `}`.
  const lines = lua.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0 && !l.startsWith('--'));
  const last = lines[lines.length - 1] ?? '';
  if (!/[)}]\s*$/.test(last) && !/\bend\b\s*$/.test(last)) return true;
  return false;
}

const FALLBACK_LUA = `-- Safe fallback disaster (used when LLM generation didn't pass safety check)
-- ServerScriptService → new Script → paste this → Play.
local Debris = game:GetService("Debris")
local Players = game:GetService("Players")
local MAX_ALIVE = 30
local INTERVAL = 8            -- seconds between disaster ticks (short so you SEE it)
local LIFETIME = 60           -- per-spawn TTL

local alive = {}

-- Pick a spawn point near a random player, fall back to origin if empty server.
local function spawnAnchor()
\tlocal players = Players:GetPlayers()
\tfor _ = 1, #players do
\t\tlocal p = players[math.random(1, #players)]
\t\tlocal char = p and p.Character
\t\tlocal hrp = char and char:FindFirstChild("HumanoidRootPart")
\t\tif hrp then
\t\t\treturn hrp.Position + Vector3.new(math.random(-40, 40), 80, math.random(-40, 40))
\t\tend
\tend
\treturn Vector3.new(math.random(-50, 50), 80, math.random(-50, 50))
end

local function spawnEntity()
\t-- Population cap: kill oldest if at capacity.
\tif #alive >= MAX_ALIVE then
\t\tlocal old = table.remove(alive, 1)
\t\tif old and old.Parent then old:Destroy() end
\tend

\tlocal pos = spawnAnchor()
\tlocal p = Instance.new("Part")
\tp.Size = Vector3.new(6, 6, 6)
\tp.Position = pos
\tp.Color = Color3.fromRGB(255, math.random(60, 200), 60)
\tp.Material = Enum.Material.Neon
\tp.Anchored = false
\tp.Parent = workspace
\ttable.insert(alive, p)
\tprint("[DisasterSpawner] spawned @ " .. tostring(pos))

\tDebris:AddItem(p, LIFETIME)
end

print("[DisasterSpawner] fallback loaded — first event in 2s, then every " .. INTERVAL .. "s")
task.wait(2)
while true do
\tfor _ = 1, 3 do
\t\tspawnEntity()
\tend
\ttask.wait(INTERVAL)
end
`;

async function generateLuaScript(input: {
  userPrompt: string;
  mode: DisasterModeId;
  chaos: DisasterChaosLevel;
  size: DisasterSize;
  frequency: DisasterFrequency;
  title?: string;
}): Promise<{ lua: string; usedFallback: boolean }> {
  const prompt = buildDisasterLuaPrompt(input);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await runChatProvider('anthropic', prompt, undefined, { timeoutMs: 30_000 });
      const text = (r.text ?? '').trim();
      const lua = extractLuaBlock(text);
      if (!lua) { logger.warn('[disasterGenerator] no Lua block, retrying', { attempt }); continue; }
      if (looksTruncatedOrEmpty(lua)) {
        logger.warn('[disasterGenerator] Lua looks truncated or missing main loop, retrying', {
          attempt,
          length: lua.length,
          lastChars: lua.slice(-80),
        });
        continue;
      }
      const sanity = sanitizeLua(lua);
      if (!sanity.ok) {
        logger.warn('[disasterGenerator] sanitizer rejected', { rejected: sanity.rejected, attempt });
        continue;
      }
      return { lua, usedFallback: false };
    } catch (err) {
      logger.warn('[disasterGenerator] LLM call failed', { attempt, err: err instanceof Error ? err.message : String(err) });
    }
  }
  return { lua: FALLBACK_LUA, usedFallback: true };
}

// ─── Metadata via single LLM call ──────────────────────────────

export interface DisasterMetadata {
  titleEN: string;
  titleRU: string;
  shareCaption: string;
  rarityVibeEN: string;
  rarityVibeRU: string;
  difficulty: 'Easy' | 'Medium' | 'Hard' | 'Impossible';
  recommendedPlayers: string;
}

async function generateMetadata(args: {
  userPrompt: string;
  modeId: DisasterModeId;
  chaos: DisasterChaosLevel;
}): Promise<DisasterMetadata> {
  const mode = DISASTER_MODES[args.modeId];
  const prompt = [
    'You are writing metadata for an AI-generated Roblox survival-game disaster event.',
    `Mode: ${mode.titleEN}. Chaos: ${args.chaos}.`,
    args.userPrompt.trim() ? `User idea: "${args.userPrompt.trim().slice(0, 120)}".` : '',
    'Return ONE JSON object with EXACTLY these keys, no markdown:',
    '{',
    '  "titleEN": "Giant Duck Invasion" (3-6 word punchy event name),',
    '  "titleRU": "RU version, 3-6 words",',
    '  "shareCaption": "bro what is happening 💀" (short TikTok caption),',
    '  "rarityVibeEN": "Server Destroyer" (fake rarity tier — pick from: "Brainrot Approved", "Most Chaotic", "Server Destroyer", "Impossible Survival", "Sigma Event", "Cursed Tier"),',
    '  "rarityVibeRU": "RU version",',
    '  "difficulty": "Hard" (one of: Easy / Medium / Hard / Impossible),',
    '  "recommendedPlayers": "10-20" (player count range string)',
    '}',
    'Output JSON ONLY.',
  ].filter(Boolean).join('\n');
  try {
    const r = await runChatProvider('anthropic', prompt, undefined, { timeoutMs: 12_000 });
    const text = (r.text ?? '').trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('no JSON');
    const parsed = JSON.parse(match[0]) as Partial<DisasterMetadata>;
    return {
      titleEN: typeof parsed.titleEN === 'string' ? parsed.titleEN : `${mode.titleEN} Disaster`,
      titleRU: typeof parsed.titleRU === 'string' ? parsed.titleRU : `${mode.titleEN} Disaster`,
      shareCaption: typeof parsed.shareCaption === 'string' ? parsed.shareCaption : 'bro what is happening 💀',
      rarityVibeEN: typeof parsed.rarityVibeEN === 'string' ? parsed.rarityVibeEN : 'Server Destroyer',
      rarityVibeRU: typeof parsed.rarityVibeRU === 'string' ? parsed.rarityVibeRU : 'Уничтожитель серверов',
      difficulty: (['Easy', 'Medium', 'Hard', 'Impossible'] as const).includes(parsed.difficulty as never)
        ? (parsed.difficulty as DisasterMetadata['difficulty'])
        : 'Hard',
      recommendedPlayers: typeof parsed.recommendedPlayers === 'string' ? parsed.recommendedPlayers : '10-20',
    };
  } catch (err) {
    logger.warn('[disasterGenerator] metadata fallback', { err: err instanceof Error ? err.message : String(err) });
    return {
      titleEN: `${mode.titleEN} Disaster`,
      titleRU: `${mode.titleEN} Disaster`,
      shareCaption: 'bro what is happening 💀',
      rarityVibeEN: 'Server Destroyer',
      rarityVibeRU: 'Уничтожитель серверов',
      difficulty: 'Hard',
      recommendedPlayers: '10-20',
    };
  }
}

function buildSetupInstructions(en: boolean): string[] {
  if (en) {
    return [
      'FASTEST: Download the .rbxmx file → open Roblox Studio → drag the file into ServerScriptService. Script auto-parents. Press Play (▶). Disasters start spawning.',
      'OR MANUAL: Open Roblox Studio with your survival place.',
      'In Explorer panel, find ServerScriptService.',
      'Right-click → Insert Object → Script.',
      'Paste the Lua code below into that Script.',
      'Press Play (▶). The disaster event loop runs server-side, every player sees the chaos.',
      'To stop the disaster, delete the Script and restart.',
    ];
  }
  return [
    'БЫСТРО: Скачай .rbxmx файл → открой Roblox Studio → перетащи в ServerScriptService. Script появится сам. Нажми Play (▶). Катастрофы начнут спавниться.',
    'ИЛИ ВРУЧНУЮ: Открой Roblox Studio со своим survival place.',
    'В Explorer найди ServerScriptService.',
    'Правый клик → Insert Object → Script.',
    'Вставь Lua-код ниже в этот Script.',
    'Нажми Play (▶). Disaster event loop запустится на сервере — все игроки увидят хаос.',
    'Чтобы остановить — удали Script и перезапусти.',
  ];
}

// ─── Public entry ───────────────────────────────────────────────

export interface DisasterGenerateInput {
  userPrompt: string;
  mode: DisasterModeId;
  chaos: DisasterChaosLevel;
  size: DisasterSize;
  frequency: DisasterFrequency;
  inputMode: 'voice' | 'text';
  firebaseUid: string;
}

export interface DisasterGenerateResult extends DisasterMetadata {
  generationId: string;
  mode: DisasterModeId;
  chaos: DisasterChaosLevel;
  size: DisasterSize;
  frequency: DisasterFrequency;
  previewUrl?: string;
  variations: Array<{ label: 'balanced' | 'extreme' | 'cursed'; imageUrl?: string }>;
  luaScript: string;
  rbxmxUrl?: string;
  usedFallback: boolean;
  instructionsEN: string[];
  instructionsRU: string[];
  generationStatus: 'ready' | 'partial' | 'failed';
}

export async function generateDisaster(input: DisasterGenerateInput): Promise<DisasterGenerateResult> {
  const generationId = `dis_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const baseInput = { userPrompt: input.userPrompt, mode: input.mode, chaos: input.chaos, size: input.size, frequency: input.frequency };

  const mainPrompt     = buildDisasterImagePrompt(baseInput);
  const extremePrompt  = buildDisasterImagePrompt(baseInput, 'extreme');
  const cursedPrompt   = buildDisasterImagePrompt(baseInput, 'cursed');

  // PHASE 1: metadata first (short ~5s call). We need meta.titleEN before
  // generating the Lua, otherwise the spawn entities don't match the title
  // shown in the app — e.g. "Banana Rain Apocalypse" shipped a script that
  // spawned rubber ducks / toilets / fridges, because the Lua LLM never saw
  // the title. (User repro: BananaRainApocalypse.rbxmx → "по факту камни
  // падают не одного банана".)
  const meta = await generateMetadata({ userPrompt: input.userPrompt, modeId: input.mode, chaos: input.chaos });

  // PHASE 2: 3 flux images + Lua (now with title) in parallel.
  const [previewUrl, extremeUrl, cursedUrl, luaResult] = await Promise.all([
    fluxToSignedUrl({ prompt: mainPrompt,    firebaseUid: input.firebaseUid, filename: 'main.png' }),
    fluxToSignedUrl({ prompt: extremePrompt, firebaseUid: input.firebaseUid, filename: 'extreme.png' }),
    fluxToSignedUrl({ prompt: cursedPrompt,  firebaseUid: input.firebaseUid, filename: 'cursed.png' }),
    generateLuaScript({ ...baseInput, title: meta.titleEN }),
  ]);

  const rbxmxUrl = await uploadRbxmx({
    firebaseUid: input.firebaseUid,
    lua: luaResult.lua,
    title: meta.titleEN,
  });

  const status: 'ready' | 'partial' | 'failed' =
    previewUrl ? (extremeUrl && cursedUrl ? 'ready' : 'partial') : 'failed';

  return {
    generationId,
    mode: input.mode,
    chaos: input.chaos,
    size: input.size,
    frequency: input.frequency,
    previewUrl,
    variations: [
      { label: 'extreme', imageUrl: extremeUrl },
      { label: 'cursed',  imageUrl: cursedUrl },
    ],
    luaScript: luaResult.lua,
    rbxmxUrl,
    usedFallback: luaResult.usedFallback,
    instructionsEN: buildSetupInstructions(true),
    instructionsRU: buildSetupInstructions(false),
    generationStatus: status,
    ...meta,
  };
}
