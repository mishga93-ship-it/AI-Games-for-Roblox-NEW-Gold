import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
// #region agent log
import { logger } from 'firebase-functions/v2';
// #endregion
import { v4 as uuidv4 } from 'uuid';
import type {
  BuildValidationIssue,
  GameSceneSpec,
  GameSceneSpecTerrain,
  RobloxArtifactFormat,
  RobloxAssetRef,
  RobloxAssetType,
  RobloxBuildManifest,
  RobloxBuildResult,
  RobloxBuildSceneNode,
  RobloxBuildScript,
  RobloxBuildTarget,
} from './types.js';
import {
  getRobloxWorkerArgs,
  getRobloxWorkerCommand,
  getNpcVisualPipeline,
  getRobloxWorkerToken,
  getRobloxWorkerUrl,
} from './config.js';
import { buildPetFollowScript, buildPetLevelingModule, buildBlockyPetFollowScript } from './uiTemplates.js';
import type { BlockyPetSpec } from './types.js';

export interface RobloxAssetAnalysisResult {
  target: RobloxBuildTarget;
  totalInstances: number;
  nodes: Array<{
    name: string;
    className: string;
    path: string;
    childCount?: number;
  }>;
}

export interface WorkerModelProcessResult {
  outputBase64: string;
  outputFileName: string;
  outputMimeType: string;
  outputExtension: string;
  summary: string;
  notes: string[];
  metadata?: Record<string, unknown>;
}

interface GeneratedNpcAccessoryFallbackSpec {
  key: string;
  displayName: string;
  bodyPartName: string;
  attachmentName: string;
  accessoryType: string;
  offset: [number, number, number];
  targetLongestAxis: number;
  assetId?: number;
  provider?: string;
}

interface GeneratedNpcAccessoryAsset extends GeneratedNpcAccessoryFallbackSpec {
  assetId: number;
}

const GENERATED_NPC_ACCESSORY_BODY_PARTS = new Set([
  'HumanoidRootPart', 'LowerTorso', 'UpperTorso', 'Head',
  'LeftUpperArm', 'LeftLowerArm', 'LeftHand',
  'RightUpperArm', 'RightLowerArm', 'RightHand',
  'LeftUpperLeg', 'LeftLowerLeg', 'LeftFoot',
  'RightUpperLeg', 'RightLowerLeg', 'RightFoot',
]);

const NPC_MESH_TARGET_HEIGHT_STUDS = 5.9;
const MAX_EMBEDDED_ROBLOX_MODEL_BYTES = 8 * 1024 * 1024;

function clampGeneratedNpcAccessoryNumber(value: unknown, min: number, max: number, fallback: number): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function sanitizeGeneratedNpcAccessoryName(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const cleaned = value.trim().replace(/[^A-Za-z0-9 _-]/g, '').slice(0, 64);
  return cleaned || fallback;
}

function parseGeneratedNpcAccessoryFallbackSpecs(raw: unknown): GeneratedNpcAccessoryFallbackSpec[] {
  if (!Array.isArray(raw)) return [];
  const parsed: GeneratedNpcAccessoryFallbackSpec[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < raw.slice(0, 8).length; index += 1) {
    const item = raw[index];
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const status = typeof obj.status === 'string' ? obj.status.toLowerCase() : '';
    if (status && status !== 'planned' && status !== 'generated' && status !== 'failed') continue;
    const rawAssetId = Math.trunc(Number(obj.assetId));
    const rawKey = sanitizeGeneratedNpcAccessoryName(
      obj.key,
      Number.isFinite(rawAssetId) && rawAssetId > 0 ? `asset_${rawAssetId}` : `planned_${index}`,
    );
    const key = rawKey.replace(/\s+/g, '_');
    if (seen.has(key)) continue;
    seen.add(key);
    const rawBodyPartName = typeof obj.bodyPartName === 'string' ? obj.bodyPartName : 'UpperTorso';
    const bodyPartName = GENERATED_NPC_ACCESSORY_BODY_PARTS.has(rawBodyPartName) ? rawBodyPartName : 'UpperTorso';
    const rawOffset = Array.isArray(obj.offset) ? obj.offset : [];
    parsed.push({
      key,
      displayName: sanitizeGeneratedNpcAccessoryName(obj.displayName, `Generated Accessory ${key}`),
      bodyPartName,
      attachmentName: sanitizeGeneratedNpcAccessoryName(obj.attachmentName, 'BodyFrontAttachment').replace(/\s+/g, ''),
      accessoryType: sanitizeGeneratedNpcAccessoryName(obj.accessoryType, 'Unknown'),
      offset: [
        clampGeneratedNpcAccessoryNumber(rawOffset[0], -4, 4, 0),
        clampGeneratedNpcAccessoryNumber(rawOffset[1], -4, 4, 0),
        clampGeneratedNpcAccessoryNumber(rawOffset[2], -4, 4, 0),
      ],
      targetLongestAxis: clampGeneratedNpcAccessoryNumber(obj.targetLongestAxis, 0.15, 4.0, 1.0),
      assetId: Number.isFinite(rawAssetId) && rawAssetId > 0 ? rawAssetId : undefined,
      provider: typeof obj.provider === 'string' ? obj.provider.slice(0, 32) : undefined,
    });
  }
  return parsed.slice(0, 5);
}

function parseGeneratedNpcAccessoryAssets(raw: unknown): GeneratedNpcAccessoryAsset[] {
  if (!Array.isArray(raw)) return [];
  const parsed: GeneratedNpcAccessoryAsset[] = [];
  for (const item of raw.slice(0, 8)) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const status = typeof obj.status === 'string' ? obj.status.toLowerCase() : '';
    const assetId = Math.trunc(Number(obj.assetId));
    if (status !== 'generated' || !Number.isFinite(assetId) || assetId <= 0) continue;
    const rawBodyPartName = typeof obj.bodyPartName === 'string' ? obj.bodyPartName : 'UpperTorso';
    const bodyPartName = GENERATED_NPC_ACCESSORY_BODY_PARTS.has(rawBodyPartName) ? rawBodyPartName : 'UpperTorso';
    const rawOffset = Array.isArray(obj.offset) ? obj.offset : [];
    parsed.push({
      key: sanitizeGeneratedNpcAccessoryName(obj.key, `asset_${assetId}`).replace(/\s+/g, '_'),
      displayName: sanitizeGeneratedNpcAccessoryName(obj.displayName, `Generated Accessory ${assetId}`),
      bodyPartName,
      attachmentName: sanitizeGeneratedNpcAccessoryName(obj.attachmentName, 'BodyFrontAttachment').replace(/\s+/g, ''),
      accessoryType: sanitizeGeneratedNpcAccessoryName(obj.accessoryType, 'Unknown'),
      offset: [
        clampGeneratedNpcAccessoryNumber(rawOffset[0], -4, 4, 0),
        clampGeneratedNpcAccessoryNumber(rawOffset[1], -4, 4, 0),
        clampGeneratedNpcAccessoryNumber(rawOffset[2], -4, 4, 0),
      ],
      targetLongestAxis: clampGeneratedNpcAccessoryNumber(obj.targetLongestAxis, 0.15, 4.0, 1.0),
      assetId,
      provider: typeof obj.provider === 'string' ? obj.provider.slice(0, 32) : undefined,
    });
  }
  return parsed.slice(0, 5);
}

function buildGeneratedNpcAccessoryLoaderScript(assets: GeneratedNpcAccessoryAsset[]): string {
  const payload = JSON.stringify(assets.map((asset) => ({
    key: asset.key,
    displayName: asset.displayName,
    bodyPartName: asset.bodyPartName,
    attachmentName: asset.attachmentName,
    accessoryType: asset.accessoryType,
    offset: asset.offset,
    targetLongestAxis: asset.targetLongestAxis,
    assetId: asset.assetId,
    provider: asset.provider,
  })));
  return `-- Generated NPC accessory loader v2
-- Loads uploaded accessory Model assets and welds their BaseParts to the R15 template.
-- v2: InsertService first, then AssetService fallback for shared/public model assets.
local InsertService = game:GetService("InsertService")
local AssetService = game:GetService("AssetService")
local HttpService = game:GetService("HttpService")

local npcModel = script.Parent
local ACCESSORIES = HttpService:JSONDecode(${JSON.stringify(payload)})

local function asVector3(list, fallback)
	if type(list) ~= "table" then
		return fallback
	end
	return Vector3.new(tonumber(list[1]) or fallback.X, tonumber(list[2]) or fallback.Y, tonumber(list[3]) or fallback.Z)
end

local function collectBaseParts(root)
	local parts = {}
	for _, obj in ipairs(root:GetDescendants()) do
		if obj:IsA("Script") or obj:IsA("LocalScript") or obj:IsA("ModuleScript") then
			obj:Destroy()
		elseif obj:IsA("BasePart") then
			table.insert(parts, obj)
		end
	end
	return parts
end

local function prepPart(part)
	part.Anchored = false
	part.CanCollide = false
	part.CanTouch = false
	part.CanQuery = false
	part.Massless = true
	part.CastShadow = false
end

local function largestAxis(part)
	return math.max(part.Size.X, part.Size.Y, part.Size.Z)
end

local function scaleParts(parts, scale)
	for _, part in ipairs(parts) do
		part.Size = part.Size * scale
		local mesh = part:FindFirstChildOfClass("SpecialMesh")
		if mesh then
			mesh.Scale = mesh.Scale * scale
		end
	end
end

local function loadGeneratedModel(assetId)
	local insertOk, insertAsset = pcall(function()
		return InsertService:LoadAsset(assetId)
	end)
	if insertOk and insertAsset then
		return insertAsset, "InsertService"
	end
	local insertReason = insertOk and "nil asset" or tostring(insertAsset)

	local assetOk, assetModel = pcall(function()
		return AssetService:LoadAssetAsync(assetId)
	end)
	if assetOk and assetModel then
		return assetModel, "AssetService"
	end
	local assetReason = assetOk and "nil asset" or tostring(assetModel)
	return nil, "load failed for assetId=" .. tostring(assetId) .. " (InsertService: " .. insertReason .. "; AssetService: " .. assetReason .. ")"
end

local function safeGeneratedKey(value)
	return tostring(value or ""):gsub("[^%w_]", "_")
end

local function removeFallbacksFor(spec)
	local safeKey = safeGeneratedKey(spec.key)
	if safeKey == "" then
		return 0
	end
	local needle = "GeneratedFallback_" .. safeKey
	local doomed = {}
	for _, obj in ipairs(npcModel:GetDescendants()) do
		if (obj:IsA("Accessory") or obj:IsA("Model")) and string.find(obj.Name, needle, 1, true) then
			table.insert(doomed, obj)
		end
	end
	for _, obj in ipairs(doomed) do
		obj:Destroy()
	end
	return #doomed
end

local function attachAccessory(spec)
	local assetId = tonumber(spec.assetId)
	if not assetId then
		return false, "missing asset id"
	end
	local bodyPart = npcModel:FindFirstChild(tostring(spec.bodyPartName or "UpperTorso"), true)
	if not (bodyPart and bodyPart:IsA("BasePart")) then
		return false, "missing body part"
	end

	local asset, loadModeOrReason = loadGeneratedModel(assetId)
	if not asset then
		return false, loadModeOrReason
	end

	local parts = collectBaseParts(asset)
	if #parts == 0 then
		asset:Destroy()
		return false, "no BaseParts"
	end

	local handle = parts[1]
	for _, part in ipairs(parts) do
		if largestAxis(part) > largestAxis(handle) then
			handle = part
		end
	end

	local targetLongestAxis = math.clamp(tonumber(spec.targetLongestAxis) or 1.0, 0.15, 4.0)
	local currentAxis = math.max(largestAxis(handle), 0.01)
	local scale = math.clamp(targetLongestAxis / currentAxis, 0.05, 8.0)
	scaleParts(parts, scale)

	local accessoryModel = Instance.new("Model")
	accessoryModel.Name = "GeneratedAccessory_" .. tostring(spec.key or assetId)
	accessoryModel.Parent = npcModel
	for _, part in ipairs(parts) do
		prepPart(part)
		part.Parent = accessoryModel
	end
	asset:Destroy()

	handle.Name = "Handle"
	accessoryModel.PrimaryPart = handle
	local offset = asVector3(spec.offset, Vector3.new(0, 0, 0))
	accessoryModel:PivotTo(bodyPart.CFrame * CFrame.new(offset))

	local attachment = Instance.new("Attachment")
	attachment.Name = tostring(spec.attachmentName or "BodyFrontAttachment")
	attachment.Parent = handle

	for _, part in ipairs(parts) do
		local weld = Instance.new("WeldConstraint")
		weld.Name = "GeneratedAccessoryWeld"
		weld.Part0 = bodyPart
		weld.Part1 = part
		weld.Parent = part
	end

	accessoryModel:SetAttribute("GeneratedNpcAccessory", true)
	accessoryModel:SetAttribute("AssetId", assetId)
	accessoryModel:SetAttribute("AccessoryType", tostring(spec.accessoryType or "Unknown"))
	accessoryModel:SetAttribute("LoadMode", tostring(loadModeOrReason))
	local removedFallbacks = removeFallbacksFor(spec)
	accessoryModel:SetAttribute("RemovedFallbackAccessoryCount", removedFallbacks)
	return true, loadModeOrReason, #parts, removedFallbacks
end

print("[GeneratedNpcAccessory] loader start count=" .. tostring(#ACCESSORIES))
local loaded = 0
local failures = {}
for _, spec in ipairs(ACCESSORIES) do
	local ok = false
	local success, attached, detail, partCount, removedFallbacks = pcall(function()
		local didAttach, modeOrReason, parts, fallbackCount = attachAccessory(spec)
		if not didAttach then
			warn("[GeneratedNpcAccessory] skipped " .. tostring(spec.key) .. ": " .. tostring(modeOrReason))
			table.insert(failures, tostring(spec.key) .. ": " .. tostring(modeOrReason))
		end
		return didAttach, modeOrReason, parts, fallbackCount
	end)
	ok = success and attached == true
	if ok then
		loaded += 1
		print("[GeneratedNpcAccessory] loaded " .. tostring(spec.key) .. " assetId=" .. tostring(spec.assetId) .. " mode=" .. tostring(detail) .. " parts=" .. tostring(partCount) .. " removedFallbacks=" .. tostring(removedFallbacks))
	elseif not success then
		warn("[GeneratedNpcAccessory] skipped " .. tostring(spec.key) .. ": " .. tostring(attached))
		table.insert(failures, tostring(spec.key) .. ": " .. tostring(attached))
	end
end
npcModel:SetAttribute("GeneratedNpcAccessoryCount", loaded)
npcModel:SetAttribute("GeneratedNpcAccessoryLoaderVersion", "v3_success_logging_remove_fallback")
if #failures > 0 then
	npcModel:SetAttribute("GeneratedNpcAccessoryLoadErrors", table.concat(failures, " | "))
end
print("[GeneratedNpcAccessory] loader done loaded=" .. tostring(loaded) .. " failed=" .. tostring(#failures))
`;
}

export function buildRobloxManifest(args: {
  title: string;
  summary: string;
  target: RobloxBuildTarget;
  prompt: string;
  starterScript: string;
  additionalScripts?: Array<{ name: string; scriptType: string; container: string; source: string }>;
  metadata?: Record<string, unknown>;
  sceneSpec?: GameSceneSpec | null;
}): RobloxBuildManifest {
  const metadata = args.metadata ?? {};
  const requestedKind = typeof metadata.requestedKind === 'string' ? metadata.requestedKind : undefined;
  const contentCategory = typeof metadata.contentCategory === 'string' ? metadata.contentCategory : undefined;
  const contentSubcategory = typeof metadata.contentSubcategory === 'string' ? metadata.contentSubcategory : undefined;
  const isVehicleModelRequest = requestedKind === 'vehicle_3d'
    || contentCategory === 'vehicle'
    || contentSubcategory === 'vehicles';

  if (requestedKind === 'clothing_texture' && args.target === 'model') {
    return buildClothingOnlyManifest(args, metadata);
  }

  if (requestedKind === 'clothing_tshirt' && args.target === 'model') {
    return buildTShirtManifest(args, metadata);
  }

  if (requestedKind === 'clothing_3d' && args.target === 'model') {
    return buildLayeredClothingManifest(args, metadata);
  }

  // Track 3 Phase 2 (Blocky Pet) — MUST come BEFORE the pet_3d route below.
  // When petMode==='blocky' or requestedKind==='pet_blocky', the manifest
  // builds primitive Roblox Parts + Motor6D, NOT the evolution mesh stages.
  // buildBlockyPetManifest is defined later in this file (Track 3 Phase 2).
  if ((requestedKind === 'pet_blocky' || metadata.petMode === 'blocky') && args.target === 'model') {
    return buildBlockyPetManifest(args, metadata);
  }

  if (requestedKind === 'pet_3d' && args.target === 'model') {
    return buildPetEvolutionManifest(args, metadata);
  }

  if (isVehicleModelRequest && args.target === 'model') {
    return buildVehicleModelManifest(args, metadata);
  }

  if (requestedKind === 'weapon_3d' && args.target === 'model') {
    return buildWeaponToolManifest(args, metadata);
  }

  if (requestedKind === 'item_3d' && args.target === 'model') {
    return buildItemToolManifest(args, metadata);
  }

  if (requestedKind === 'furniture_3d' && args.target === 'model') {
    return buildFurnitureModelManifest(args, metadata);
  }

  if (requestedKind === 'building_3d' && args.target === 'model') {
    return buildBuildingModelManifest(args, metadata);
  }

  if (requestedKind === 'map_environment' && args.target === 'place') {
    return buildMapEnvironmentManifest(args, metadata);
  }

  const isCharacter3D = requestedKind === 'character_3d'
    || metadata.contentCategory === 'character'
    || metadata.projectKind === 'ugc';

  if (args.target === 'model' && isCharacter3D) {
    return buildCharacterManifest(args, metadata);
  }

  const generatedContentId = uuidv4();
  const systemsFolderId = uuidv4();
  const configFolderId = uuidv4();
  const uiRootId = uuidv4();
  const requestedSystems = deriveRequestedSystems(args.summary, metadata);
  const scene: RobloxBuildSceneNode[] = [
    {
      id: generatedContentId,
      className: 'Folder',
      name: 'GeneratedContent',
      parentId: 'WorkspaceRoot',
    },
    {
      id: systemsFolderId,
      className: 'Folder',
      name: 'Systems',
      parentId: 'ReplicatedStorage',
    },
    {
      id: configFolderId,
      className: 'Folder',
      name: 'Config',
      parentId: 'ReplicatedStorage',
    },
    {
      id: uuidv4(),
      className: 'StringValue',
      name: 'ProjectTitle',
      parentId: configFolderId,
      properties: {
        Value: args.title,
      },
    },
    {
      id: uuidv4(),
      className: 'StringValue',
      name: 'Summary',
      parentId: configFolderId,
      properties: {
        Value: args.summary.slice(0, 250),
      },
    },
  ];

  if (args.sceneSpec && Array.isArray(args.sceneSpec.parts) && args.sceneSpec.parts.length > 0) {
    const sceneNodes = buildSceneNodesFromSpec(args.sceneSpec, generatedContentId);
    scene.push(...sceneNodes);

    if (args.sceneSpec.lighting) {
      const lt = args.sceneSpec.lighting;
      const lightingProps: Record<string, unknown> = {};
      if (lt.clockTime !== undefined) lightingProps.ClockTime = lt.clockTime;
      if (lt.brightness !== undefined) lightingProps.Brightness = lt.brightness;
      if (lt.fogEnd !== undefined) lightingProps.FogEnd = lt.fogEnd;
      if (lt.ambient) {
        lightingProps.Ambient = { __type: 'Color3', r: lt.ambient[0], g: lt.ambient[1], b: lt.ambient[2] };
      }
      if (lt.fogColor) {
        lightingProps.FogColor = { __type: 'Color3', r: lt.fogColor[0], g: lt.fogColor[1], b: lt.fogColor[2] };
      }
      if (lt.outdoorAmbient) {
        lightingProps.OutdoorAmbient = { __type: 'Color3', r: lt.outdoorAmbient[0], g: lt.outdoorAmbient[1], b: lt.outdoorAmbient[2] };
      }
      scene.push({
        id: uuidv4(),
        className: '__LightingConfig',
        name: '__LightingConfig',
        parentId: 'Lighting',
        properties: lightingProps,
      });

      const atm = lt.atmosphere;
      scene.push({
        id: uuidv4(),
        className: 'Atmosphere',
        name: 'Atmosphere',
        parentId: 'Lighting',
        properties: {
          Density: atm?.density ?? 0.3,
          Offset: atm?.offset ?? 0.25,
          Glare: atm?.glare ?? 0,
          Haze: atm?.haze ?? 1,
          ...(atm?.color ? { Color: { __type: 'Color3', r: atm.color[0], g: atm.color[1], b: atm.color[2] } } : {}),
          ...(atm?.decay ? { Decay: { __type: 'Color3', r: atm.decay[0], g: atm.decay[1], b: atm.decay[2] } } : {}),
        },
      });

      const fx = lt.postEffects;
      scene.push({
        id: uuidv4(),
        className: 'BloomEffect',
        name: 'Bloom',
        parentId: 'Lighting',
        properties: {
          Intensity: fx?.bloomIntensity ?? 0.4,
          Size: fx?.bloomSize ?? 24,
          Threshold: fx?.bloomThreshold ?? 0.8,
        },
      });
      scene.push({
        id: uuidv4(),
        className: 'ColorCorrectionEffect',
        name: 'ColorCorrection',
        parentId: 'Lighting',
        properties: {
          Brightness: fx?.ccBrightness ?? 0.05,
          Contrast: fx?.ccContrast ?? 0.1,
          Saturation: fx?.ccSaturation ?? 0.15,
          ...(fx?.ccTintColor ? { TintColor: { __type: 'Color3', r: fx.ccTintColor[0], g: fx.ccTintColor[1], b: fx.ccTintColor[2] } } : {}),
        },
      });
    }
  } else {
    const spawnPlateId = uuidv4();
    scene.push(
      {
        id: spawnPlateId,
        className: 'Part',
        name: 'SpawnPlatform',
        parentId: 'WorkspaceRoot',
        properties: {
          Anchored: true,
          Size: { __type: 'Vector3', x: 20, y: 1, z: 20 },
        },
      },
      {
        id: uuidv4(),
        className: 'SpawnLocation',
        name: 'Spawn',
        parentId: spawnPlateId,
        properties: {
          Anchored: true,
          Neutral: true,
        },
      },
    );
  }

  for (const systemName of requestedSystems) {
    scene.push({
      id: uuidv4(),
      className: 'Folder',
      name: sanitizeSystemName(systemName),
      parentId: systemsFolderId,
    });
  }

  return {
    id: uuidv4(),
    title: args.title,
    summary: args.summary,
    target: args.target,
    formatPreference: 'binary',
    scene,
    scripts: [
      {
        id: uuidv4(),
        name: 'GeneratedBootstrap',
        scriptType: 'Script',
        container: 'ServerScriptService',
        source: args.starterScript,
      },
      {
        id: uuidv4(),
        name: 'GeneratedSharedConfig',
        scriptType: 'ModuleScript',
        container: 'ReplicatedStorage',
        source: buildSharedConfigModule(args.title, args.summary, requestedSystems, metadata, args.sceneSpec?.terrain),
      },
      ...(args.sceneSpec?.terrain ? [{
        id: uuidv4(),
        name: 'TerrainGenerator',
        scriptType: 'Script' as const,
        container: 'ServerScriptService' as const,
        source: buildTerrainGeneratorScript(),
      }] : []),
      ...(args.additionalScripts || []).map(s => ({
        id: uuidv4(),
        name: s.name,
        scriptType: s.scriptType as 'Script' | 'LocalScript' | 'ModuleScript',
        container: s.container as RobloxBuildScript['container'],
        source: s.source,
      })),
    ],
    ui: [
      {
        id: uiRootId,
        className: 'ScreenGui',
        name: 'GeneratedHud',
        properties: {
          ResetOnSpawn: false,
        },
      },
      {
        id: uuidv4(),
        className: 'TextLabel',
        name: 'GeneratedTitle',
        parentId: uiRootId,
        properties: {
          Text: args.title,
        },
      },
      {
        id: uuidv4(),
        className: 'TextButton',
        name: 'PrimaryAction',
        parentId: uiRootId,
        properties: {
          Text: requestedSystems.includes('Shop') ? 'Open Shop' : 'Play',
        },
      },
    ],
    metadata: {
      prompt: args.prompt,
      requestedSystems,
      ...metadata,
    },
  };
}

export function validateRobloxManifest(manifest: RobloxBuildManifest): BuildValidationIssue[] {
  const issues: BuildValidationIssue[] = [];
  if (!manifest.title.trim()) {
    issues.push({ severity: 'error', code: 'missing_title', message: 'Manifest title is required.' });
  }
  if (manifest.scripts.length === 0) {
    issues.push({ severity: 'error', code: 'missing_scripts', message: 'At least one script is required.' });
  }
  if (manifest.scene.length === 0 && manifest.target === 'place') {
    issues.push({ severity: 'warning', code: 'empty_scene', message: 'Place build has no scene nodes.' });
  }
  const requestedKind = String(manifest.metadata?.requestedKind ?? '').toLowerCase();
  const contentCategory = String(manifest.metadata?.contentCategory ?? '').toLowerCase();
  const isVehicleModel = requestedKind === 'vehicle_3d' || contentCategory === 'vehicle';
  if (manifest.target === 'model' && !isVehicleModel) {
    const classNames = new Set(manifest.scene.map((node) => node.className));
    if (!classNames.has('Humanoid')) {
      issues.push({ severity: 'warning', code: 'missing_humanoid', message: 'Model build has no Humanoid node.' });
    }
    if (!classNames.has('Motor6D')) {
      issues.push({ severity: 'warning', code: 'missing_rig_joints', message: 'Model build has no Motor6D joints for rigging.' });
    }
  }

  for (const script of manifest.scripts) {
    if (script.source.includes('loadstring')) {
      issues.push({ severity: 'error', code: 'unsafe_script', message: `${script.name} contains loadstring.` });
    }
    if (script.source.length > 50_000) {
      issues.push({ severity: 'warning', code: 'large_script', message: `${script.name} is unusually large.` });
    }
  }

  return issues;
}

export async function maybeBuildRobloxBinary(manifest: RobloxBuildManifest): Promise<RobloxBuildResult | null> {
  const validationIssues = validateRobloxManifest(manifest);
  if (validationIssues.some((issue) => issue.severity === 'error')) {
    return {
      artifactType: manifest.target === 'place' ? 'rbxl' : 'rbxm',
      format: 'project_bundle_fallback',
      fileName: `${manifest.title}.${manifest.target === 'place' ? 'rbxl' : 'rbxm'}`,
      summary: 'Validation blocked native Roblox binary generation.',
      validationIssues,
      notes: ['Fix validation errors or use project bundle fallback.'],
      manifest,
    };
  }

  try {
    const buffer = await buildRobloxBinaryBytes(manifest);
    if (!buffer) {
      return null;
    }
    return {
      artifactType: manifest.target === 'place' ? 'rbxl' : 'rbxm',
      format: 'binary',
      fileName: `${manifest.title}.${manifest.target === 'place' ? 'rbxl' : 'rbxm'}`,
      bufferBase64: buffer.toString('base64'),
      summary: `Native Roblox ${manifest.target} binary generated by worker.`,
      validationIssues,
      notes: [`Worker command completed with ${buffer.byteLength} byte(s).`],
      manifest,
    };
  } catch (error) {
    return {
      artifactType: manifest.target === 'place' ? 'rbxl' : 'rbxm',
      format: 'project_bundle_fallback',
      fileName: `${manifest.title}.${manifest.target === 'place' ? 'rbxl' : 'rbxm'}`,
      summary: 'Worker binary build failed. Falling back to project bundle.',
      validationIssues,
      notes: [error instanceof Error ? error.message : String(error)],
      manifest,
    };
  }
}

export async function maybeAnalyzeRobloxAsset(
  input: Buffer,
  target: RobloxBuildTarget,
): Promise<RobloxAssetAnalysisResult | null> {
  const workerUrl = getRobloxWorkerUrl();
  if (workerUrl) {
    const response = await fetchWorkerJson(`${workerUrl.replace(/\/$/, '')}/analyze-roblox`, {
      method: 'POST',
      headers: buildWorkerHeaders(),
      body: JSON.stringify({
        inputBase64: input.toString('base64'),
        target,
      }),
    });
    return response as unknown as RobloxAssetAnalysisResult;
  }

  const command = getRobloxWorkerCommand();
  if (!command) {
    return null;
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'roblox-worker-analyze-'));
  const inputPath = path.join(tempDir, target === 'place' ? 'input.rbxl' : 'input.rbxm');
  const outputPath = path.join(tempDir, 'analysis.json');
  try {
    await writeFile(inputPath, input);
    const extraArgs = splitArgs(getRobloxWorkerArgs());
    await runCommand(command, [...extraArgs, 'analyze-roblox', inputPath, outputPath, target]);
    return JSON.parse(await readFile(outputPath, 'utf8')) as RobloxAssetAnalysisResult;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function optimizeMeshAsset(args: {
  sourceUrl: string;
  title: string;
  metadata?: Record<string, unknown>;
}): Promise<WorkerModelProcessResult> {
  return processModelAssetWithWorker('optimize-mesh', args.sourceUrl, args.title, args.metadata);
}

export async function autoRigCharacterAsset(args: {
  sourceUrl: string;
  title: string;
  metadata?: Record<string, unknown>;
}): Promise<WorkerModelProcessResult> {
  return processModelAssetWithWorker('auto-rig-r15', args.sourceUrl, args.title, args.metadata);
}

export async function exportCharacterAsset(args: {
  sourceUrl: string;
  title: string;
  metadata?: Record<string, unknown>;
}): Promise<WorkerModelProcessResult> {
  return processModelAssetWithWorker('export-character', args.sourceUrl, args.title, args.metadata);
}

export async function convertToFbx(args: {
  sourceUrl: string;
  title: string;
}): Promise<WorkerModelProcessResult> {
  return processModelAssetWithWorker('convert-to-fbx', args.sourceUrl, args.title);
}

export function describeManifest(manifest: RobloxBuildManifest): string[] {
  return [
    `target:${manifest.target}`,
    `scene:${manifest.scene.length}`,
    `scripts:${manifest.scripts.length}`,
    `ui:${manifest.ui?.length ?? 0}`,
    `assets:${manifest.assets?.length ?? 0}`,
    `embeddedModels:${manifest.embeddedModels?.length ?? 0}`,
  ];
}

function splitArgs(value: string | undefined): string[] {
  if (!value?.trim()) {
    return [];
  }
  return value.split(/\s+/).filter(Boolean);
}

function runCommand(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderr.trim() || `Worker exited with code ${code}`));
      }
    });
  });
}

export function preferredArtifactFormat(result: RobloxBuildResult | null): RobloxArtifactFormat {
  return result?.format ?? 'project_bundle_fallback';
}

async function processModelAssetWithWorker(
  endpoint: 'optimize-mesh' | 'auto-rig-r15' | 'export-character' | 'convert-to-fbx',
  sourceUrl: string,
  title: string,
  metadata?: Record<string, unknown>,
): Promise<WorkerModelProcessResult> {
  const workerUrl = getRobloxWorkerUrl();
  if (workerUrl) {
    const response = await fetchWorkerJson(`${workerUrl.replace(/\/$/, '')}/${endpoint}`, {
      method: 'POST',
      headers: buildWorkerHeaders(),
      body: JSON.stringify({
        sourceUrl,
        title,
        metadata,
      }),
    });
    return response as unknown as WorkerModelProcessResult;
  }

  const fetched = await fetch(sourceUrl);
  if (!fetched.ok) {
    throw new Error(`Failed to fetch model asset for ${endpoint}: ${fetched.status}`);
  }
  const bytes = Buffer.from(await fetched.arrayBuffer());
  const outputMimeType = fetched.headers.get('content-type')?.split(';')[0] || inferMimeType(sourceUrl);
  const outputExtension = extensionFromMimeType(outputMimeType, sourceUrl);
  return {
    outputBase64: bytes.toString('base64'),
    outputFileName: `${sanitizeSystemName(title) || 'character'}-${endpoint}.${outputExtension}`,
    outputMimeType,
    outputExtension,
    summary: `${endpoint} completed using embedded fallback flow.`,
    notes: [
      'External worker was not configured, so the asset bytes were preserved without geometric edits.',
    ],
    metadata: {
      stage: endpoint,
      embeddedFallback: true,
      ...(metadata ?? {}),
    },
  };
}

function buildSceneNodesFromSpec(
  spec: GameSceneSpec,
  generatedContentFolderId: string,
): RobloxBuildSceneNode[] {
  const nodes: RobloxBuildSceneNode[] = [];

  for (let i = 0; i < spec.parts.length; i++) {
    const part = spec.parts[i];
    const properties: Record<string, unknown> = {
      Anchored: part.anchored ?? true,
      CanCollide: part.canCollide ?? true,
    };
    if (part.size) {
      const MIN_SIZE = 4;
      const sx = Math.max(part.size[0], MIN_SIZE);
      const sy = Math.max(part.size[1], 1);
      const sz = Math.max(part.size[2], MIN_SIZE);
      properties.Size = { __type: 'Vector3', x: sx, y: sy, z: sz };
    } else {
      properties.Size = { __type: 'Vector3', x: 10, y: 2, z: 10 };
    }
    if (part.position) {
      const cfVal: Record<string, unknown> = {
        __type: 'CFrame',
        position: { x: part.position[0], y: part.position[1], z: part.position[2] },
      };
      if (part.rotation) {
        // Convert Euler degrees [rx,ry,rz] to rotation matrix [9 floats]
        if (part.rotation.length === 3) {
          const deg = Math.PI / 180;
          const [rx, ry, rz] = part.rotation as [number, number, number];
          const cx = Math.cos(rx * deg), sx = Math.sin(rx * deg);
          const cy = Math.cos(ry * deg), sy = Math.sin(ry * deg);
          const cz = Math.cos(rz * deg), sz = Math.sin(rz * deg);
          cfVal.rotation = [
            cy * cz, -cy * sz, sy,
            cx * sz + sx * sy * cz, cx * cz - sx * sy * sz, -sx * cy,
            sx * sz - cx * sy * cz, sx * cz + cx * sy * sz, cx * cy,
          ];
        } else {
          cfVal.rotation = part.rotation;
        }
      }
      properties.CFrame = cfVal;
    }
    if (part.color) {
      properties.Color = { __type: 'Color3', r: part.color[0], g: part.color[1], b: part.color[2] };
    }
    if (part.material) {
      properties.Material = { __type: 'Enum', enumType: 'Material', enumName: part.material };
    }
    if (part.transparency !== undefined && part.transparency > 0) {
      properties.Transparency = part.transparency;
    }
    if (part.shape && part.shape !== 'Block') {
      properties.Shape = { __type: 'Enum', enumType: 'PartType', enumName: part.shape };
    }
    const partNodeId = uuidv4();
    nodes.push({
      id: partNodeId,
      className: part.className || 'Part',
      name: part.name || `Part_${i}`,
      parentId: generatedContentFolderId,
      properties,
    });

    const isNeon = part.material?.toLowerCase() === 'neon';
    const hasLightName = /light|lamp|glow|lantern|torch|crystal/i.test(part.name || '');
    if (isNeon || hasLightName) {
      const lightColor = part.color
        ? { __type: 'Color3' as const, r: part.color[0], g: part.color[1], b: part.color[2] }
        : { __type: 'Color3' as const, r: 1, g: 1, b: 0.9 };
      nodes.push({
        id: uuidv4(),
        className: 'PointLight',
        name: 'Light',
        parentId: partNodeId,
        properties: { Brightness: 1, Range: 25, Color: lightColor },
      });
    }

    if (part.particles) {
      const p = part.particles;
      const pColor = p.color ?? part.color ?? [1, 1, 1];
      const partIsHidden = part.transparency !== undefined && part.transparency >= 0.95;
      const emitterProps: Record<string, unknown> = {
        Rate: p.rate ?? 8,
        Lifetime: { __type: 'NumberRange', min: p.lifetime ?? 2, max: (p.lifetime ?? 2) * 1.5 },
        Speed: { __type: 'NumberRange', min: (p.speed ?? 2) * 0.5, max: p.speed ?? 2 },
        SpreadAngle: { __type: 'Vector2', x: p.spread ?? 30, y: p.spread ?? 30 },
        ...(partIsHidden ? { Enabled: false } : {}),
        Color: {
          __type: 'ColorSequence',
          keypoints: [
            { time: 0, r: pColor[0], g: pColor[1], b: pColor[2] },
            { time: 1, r: pColor[0], g: pColor[1], b: pColor[2] },
          ],
        },
        Size: {
          __type: 'NumberSequence',
          keypoints: [
            { time: 0, value: 0 },
            { time: 0.3, value: p.size ?? 0.5 },
            { time: 1, value: 0 },
          ],
        },
        LightEmission: 0.5,
      };
      nodes.push({
        id: uuidv4(),
        className: 'ParticleEmitter',
        name: 'Particles',
        parentId: partNodeId,
        properties: emitterProps,
      });
    }

    // BillboardGui label above part
    if (part.billboard) {
      const bb = part.billboard;
      const bbId = uuidv4();
      const textColor = bb.color ?? [1, 1, 1];
      const bbSize = bb.size ?? 4;
      const offsetY = part.size ? part.size[1] + 3 : 5;
      // If part is fully transparent (hidden), disable the BillboardGui
      const isHidden = part.transparency !== undefined && part.transparency >= 0.95;
      nodes.push({
        id: bbId,
        className: 'BillboardGui',
        name: 'Label',
        parentId: partNodeId,
        properties: {
          Size: { __type: 'UDim2', XScale: bbSize, XOffset: 0, YScale: bbSize * 0.4, YOffset: 0 },
          StudsOffset: { __type: 'Vector3', x: bb.offset?.[0] ?? 0, y: bb.offset?.[1] ?? offsetY, z: bb.offset?.[2] ?? 0 },
          AlwaysOnTop: true,
          LightInfluence: 0,
          MaxDistance: 80,
          ...(isHidden ? { Enabled: false } : {}),
        },
      });
      nodes.push({
        id: uuidv4(),
        className: 'TextLabel',
        name: 'Text',
        parentId: bbId,
        properties: {
          Text: bb.text,
          Size: { __type: 'UDim2', XScale: 1, XOffset: 0, YScale: 1, YOffset: 0 },
          BackgroundTransparency: 1,
          TextColor3: { __type: 'Color3', r: textColor[0], g: textColor[1], b: textColor[2] },
          TextStrokeTransparency: 0.3,
          TextStrokeColor3: { __type: 'Color3', r: 0, g: 0, b: 0 },
          TextScaled: true,
          FontFace: { __type: 'Font', family: 'rbxasset://fonts/families/GothamSSm.json', weight: 'Bold', style: 'Normal' },
        },
      });
    }

    // ProximityPrompt for interaction
    if (part.prompt) {
      const pr = part.prompt;
      nodes.push({
        id: uuidv4(),
        className: 'ProximityPrompt',
        name: 'Prompt',
        parentId: partNodeId,
        properties: {
          ActionText: pr.actionText,
          ObjectText: pr.objectText ?? '',
          MaxActivationDistance: pr.maxDistance ?? 12,
          HoldDuration: pr.holdDuration ?? 0,
          RequiresLineOfSight: false,
        },
      });
    }

    // Sound
    if (part.sound) {
      const snd = part.sound;
      nodes.push({
        id: uuidv4(),
        className: 'Sound',
        name: 'SFX',
        parentId: partNodeId,
        properties: {
          SoundId: snd.soundId,
          Volume: snd.volume ?? 0.5,
          Looped: snd.looped ?? false,
          ...(snd.playing !== undefined ? { Playing: snd.playing } : {}),
          ...(snd.playbackSpeed !== undefined ? { PlaybackSpeed: snd.playbackSpeed } : {}),
        },
      });
    }
  }

  if (spec.spawns) {
    for (let i = 0; i < spec.spawns.length; i++) {
      const spawn = spec.spawns[i];
      nodes.push({
        id: uuidv4(),
        className: 'SpawnLocation',
        name: spawn.name || `Spawn_${i}`,
        parentId: generatedContentFolderId,
        properties: {
          Anchored: true,
          Neutral: true,
          Size: { __type: 'Vector3', x: 6, y: 1, z: 6 },
          CFrame: {
            __type: 'CFrame',
            position: { x: spawn.position[0], y: spawn.position[1], z: spawn.position[2] },
          },
        },
      });
    }
  }

  if (spec.npcs) {
    // NPC marker strategy: emit a tiny invisible Part as an anchor for each NPC
    // position + role + dialog. At runtime the tycoon server script calls
    // Players:CreateHumanoidModelFromDescriptionAsync() to replace each marker
    // with a real R15 character model (Head, Torso, Arms, Legs, Humanoid).
    // This avoids shipping a yellow box with a BillboardGui label in the rbxl.
    for (let i = 0; i < spec.npcs.length; i++) {
      const npc = spec.npcs[i];
      const npcId = uuidv4();
      nodes.push({
        id: npcId,
        className: 'Part',
        name: npc.name || `NPC_${i}`,
        parentId: generatedContentFolderId,
        properties: {
          Anchored: true,
          CanCollide: false,
          Transparency: 1,
          Size: { __type: 'Vector3', x: 1, y: 1, z: 1 },
          CFrame: {
            __type: 'CFrame',
            position: { x: npc.position[0], y: (npc.position[1] ?? 0) + 3, z: npc.position[2] },
          },
          Color: { __type: 'Color3', r: 1, g: 0.8, b: 0.2 },
          Material: { __type: 'Enum', enumType: 'Material', enumName: 'SmoothPlastic' },
        },
      });
      // NpcRole StringValue (for quest detection in server script)
      if (npc.role) {
        nodes.push({
          id: uuidv4(),
          className: 'StringValue',
          name: 'NpcRole',
          parentId: npcId,
          properties: { Value: npc.role },
        });
      }
      // NpcDialog StringValue (for server script)
      if (npc.dialog) {
        nodes.push({
          id: uuidv4(),
          className: 'StringValue',
          name: 'NpcDialog',
          parentId: npcId,
          properties: { Value: npc.dialog },
        });
      }
    }
  }

  return nodes;
}

const GENERATED_MAP_MATERIAL_VARIANTS: Array<{ name: string; baseMaterial: string; studsPerTile: number }> = [
  { name: 'GeneratedStormConcrete', baseMaterial: 'Concrete', studsPerTile: 6 },
  { name: 'GeneratedFortressStone', baseMaterial: 'Rock', studsPerTile: 5 },
  { name: 'GeneratedFortressSlate', baseMaterial: 'Slate', studsPerTile: 5 },
  { name: 'GeneratedWetGround', baseMaterial: 'Ground', studsPerTile: 9 },
  { name: 'GeneratedMudTrack', baseMaterial: 'Mud', studsPerTile: 7 },
  { name: 'GeneratedWeatheredWood', baseMaterial: 'Wood', studsPerTile: 4 },
  { name: 'GeneratedMilitaryMetal', baseMaterial: 'Metal', studsPerTile: 4 },
  { name: 'GeneratedSignalFabric', baseMaterial: 'Fabric', studsPerTile: 3 },
  { name: 'GeneratedOceanGlass', baseMaterial: 'Glass', studsPerTile: 14 },
  { name: 'GeneratedDenseGrass', baseMaterial: 'Grass', studsPerTile: 10 },
  { name: 'GeneratedBeachSand', baseMaterial: 'Sand', studsPerTile: 10 },
  { name: 'GeneratedCobblestoneRoute', baseMaterial: 'Cobblestone', studsPerTile: 5 },
];

function buildGeneratedMapMaterialVariantNodes(): RobloxBuildSceneNode[] {
  return GENERATED_MAP_MATERIAL_VARIANTS.map((variant) => ({
    id: uuidv4(),
    className: 'MaterialVariant',
    name: variant.name,
    parentId: 'MaterialService',
    properties: {
      BaseMaterial: { __type: 'Enum', enumType: 'Material', enumName: variant.baseMaterial },
      StudsPerTile: variant.studsPerTile,
    },
  }));
}

function resolveGeneratedMapMaterialVariant(partName: string, material?: string): string | undefined {
  const n = partName.toLowerCase();
  const m = (material || '').toLowerCase();
  if (/water|ocean|river|lake|stream/.test(n) || m === 'glass') return 'GeneratedOceanGlass';
  if (m === 'concrete') return 'GeneratedStormConcrete';
  if (m === 'rock') return 'GeneratedFortressStone';
  if (m === 'slate') return 'GeneratedFortressSlate';
  if (m === 'mud') return 'GeneratedMudTrack';
  if (m === 'ground') return 'GeneratedWetGround';
  if (m === 'wood' || m === 'woodplanks') return 'GeneratedWeatheredWood';
  if (m === 'metal') return 'GeneratedMilitaryMetal';
  if (m === 'fabric') return 'GeneratedSignalFabric';
  if (m === 'grass') return 'GeneratedDenseGrass';
  if (m === 'sand') return 'GeneratedBeachSand';
  if (m === 'cobblestone') return 'GeneratedCobblestoneRoute';
  if (/road|path|runway|courtyard|concrete|apron/.test(n)) return 'GeneratedStormConcrete';
  if (/roof|slate|wallwalk|platform/.test(n)) return 'GeneratedFortressSlate';
  if (/fortress|keep|tower|wall|gate|battlement|barricade|rock|cliff/.test(n)) return 'GeneratedFortressStone';
  if (/mud|trench|perimeter|track/.test(n)) return 'GeneratedMudTrack';
  if (/ground|moor/.test(n)) return 'GeneratedWetGround';
  if (/dock|bridge|crate|barrel|wood|door/.test(n)) return 'GeneratedWeatheredWood';
  if (/metal|chain|portcullis|cannon|radio|mast|rail/.test(n)) return 'GeneratedMilitaryMetal';
  if (/banner|sandbag|fabric/.test(n)) return 'GeneratedSignalFabric';
  if (/grass|tree|palm|bush/.test(n)) return 'GeneratedDenseGrass';
  if (/sand|beach|shore/.test(n)) return 'GeneratedBeachSand';
  if (/cobblestone|courtyard|road|path/.test(n)) return 'GeneratedCobblestoneRoute';
  return undefined;
}

function waterTextureFacesForMapPart(partName: string): string[] {
  const n = partName.toLowerCase();
  if (!/water|ocean|river|lake|stream|cascade/.test(n)) return [];
  return ['Top'];
}

function buildMapEnvironmentManifest(args: {
  title: string;
  summary: string;
  target: RobloxBuildTarget;
  prompt: string;
  starterScript: string;
  additionalScripts?: Array<{ name: string; scriptType: string; container: string; source: string }>;
  metadata?: Record<string, unknown>;
  sceneSpec?: GameSceneSpec | null;
}, metadata: Record<string, unknown>): RobloxBuildManifest {
  const mapRootId = uuidv4();
  const folders = {
    terrain: uuidv4(),
    paths: uuidv4(),
    structures: uuidv4(),
    nature: uuidv4(),
    details: uuidv4(),
    gameplay: uuidv4(),
  };
  const spec = args.sceneSpec ?? { parts: [] };
  const scene: RobloxBuildSceneNode[] = [
    ...buildGeneratedMapMaterialVariantNodes(),
    { id: mapRootId, className: 'Folder', name: 'GeneratedMapEnvironment', parentId: 'WorkspaceRoot' },
    { id: folders.terrain, className: 'Folder', name: 'TerrainAnchors', parentId: mapRootId },
    { id: folders.paths, className: 'Folder', name: 'PathsAndBridges', parentId: mapRootId },
    { id: folders.structures, className: 'Folder', name: 'StructuresAndLandmarks', parentId: mapRootId },
    { id: folders.nature, className: 'Folder', name: 'NatureAndProps', parentId: mapRootId },
    { id: folders.details, className: 'Folder', name: 'DetailPass', parentId: mapRootId },
    { id: folders.gameplay, className: 'Folder', name: 'Gameplay', parentId: mapRootId },
  ];

  const folderForPart = (name: string, material?: string): string => {
    const n = name.toLowerCase();
    const m = (material || '').toLowerCase();
    if (/spawn|checkpoint|flag|team|pad/.test(n)) return folders.gameplay;
    if (/road|path|bridge|walkway|dock|sidewalk|trail|stair/.test(n)) return folders.paths;
    if (/house|building|tower|wall|gate|ruin|temple|dungeon|arena|stall|shop|cabin/.test(n)) return folders.structures;
    if (/tree|rock|bush|flower|grass|log|stump|crystal|mushroom/.test(n) || /grass|rock|wood|slate|mud/.test(m)) return folders.nature;
    return folders.details;
  };

  for (let i = 0; i < spec.parts.length; i++) {
    const part = spec.parts[i];
    const partId = uuidv4();
    const materialVariant = resolveGeneratedMapMaterialVariant(part.name || '', part.material);
    const props: Record<string, unknown> = {
      Anchored: part.anchored ?? true,
      CanCollide: part.canCollide ?? true,
      Size: { __type: 'Vector3', x: part.size?.[0] ?? 4, y: part.size?.[1] ?? 1, z: part.size?.[2] ?? 4 },
      CFrame: {
        __type: 'CFrame',
        position: { x: part.position?.[0] ?? 0, y: part.position?.[1] ?? 0, z: part.position?.[2] ?? 0 },
        ...(part.rotation ? { rotation: part.rotation } : {}),
      },
      ...(part.color ? { Color: { __type: 'Color3', r: part.color[0], g: part.color[1], b: part.color[2] } } : {}),
      ...(part.material ? { Material: { __type: 'Enum', enumType: 'Material', enumName: part.material } } : {}),
      ...(materialVariant ? { MaterialVariant: materialVariant } : {}),
      ...(part.transparency !== undefined ? { Transparency: part.transparency } : {}),
      ...(part.shape && part.shape !== 'Block' ? { Shape: { __type: 'Enum', enumType: 'PartType', enumName: part.shape } } : {}),
    };
    scene.push({
      id: partId,
      className: part.className || 'Part',
      name: part.name || `MapPart_${i}`,
      parentId: folderForPart(part.name || '', part.material),
      properties: props,
    });

    for (const face of waterTextureFacesForMapPart(part.name || '')) {
      scene.push(makeTextureNode({
        name: 'GeneratedWaterTexture',
        parentId: partId,
        texture: 'rbxasset://textures/water.png',
        face,
        studPerTileU: 18,
        studPerTileV: 12,
      }));
    }

    const isLight = /light|lamp|torch|lantern|neon|glow|crystal|fire|brazier/i.test(part.name || '') || part.material === 'Neon';
    if (isLight) {
      const c = part.color ?? [1, 0.82, 0.45];
      scene.push({
        id: uuidv4(),
        className: 'PointLight',
        name: 'MapLight',
        parentId: partId,
        properties: { Brightness: 1.3, Range: 28, Color: { __type: 'Color3', r: c[0], g: c[1], b: c[2] } },
      });
    }
  }

  for (let i = 0; i < (spec.spawns ?? []).length; i++) {
    const spawn = spec.spawns![i];
    scene.push({
      id: uuidv4(),
      className: 'SpawnLocation',
      name: spawn.name || `MapSpawn_${i + 1}`,
      parentId: folders.gameplay,
      properties: {
        Anchored: true,
        Neutral: true,
        Size: { __type: 'Vector3', x: 6, y: 1, z: 6 },
        CFrame: { __type: 'CFrame', position: { x: spawn.position[0], y: spawn.position[1], z: spawn.position[2] } },
        Color: { __type: 'Color3', r: 0.2, g: 0.75, b: 0.25 },
      },
    });
  }

  const lt = spec.lighting;
  if (lt) {
    scene.push({
      id: uuidv4(),
      className: '__LightingConfig',
      name: '__LightingConfig',
      parentId: 'Lighting',
      properties: {
        ...(lt.clockTime !== undefined ? { ClockTime: lt.clockTime } : {}),
        ...(lt.brightness !== undefined ? { Brightness: lt.brightness } : {}),
        ...(lt.fogEnd !== undefined ? { FogEnd: lt.fogEnd } : {}),
        ...(lt.ambient ? { Ambient: { __type: 'Color3', r: lt.ambient[0], g: lt.ambient[1], b: lt.ambient[2] } } : {}),
        ...(lt.outdoorAmbient ? { OutdoorAmbient: { __type: 'Color3', r: lt.outdoorAmbient[0], g: lt.outdoorAmbient[1], b: lt.outdoorAmbient[2] } } : {}),
        ...(lt.fogColor ? { FogColor: { __type: 'Color3', r: lt.fogColor[0], g: lt.fogColor[1], b: lt.fogColor[2] } } : {}),
      },
    });
    const atm = lt.atmosphere;
    scene.push({
      id: uuidv4(),
      className: 'Atmosphere',
      name: 'GeneratedAtmosphere',
      parentId: 'Lighting',
      properties: {
        Density: atm?.density ?? 0.28,
        Offset: atm?.offset ?? 0.25,
        Haze: atm?.haze ?? 1.2,
        Glare: atm?.glare ?? 0.1,
        ...(atm?.color ? { Color: { __type: 'Color3', r: atm.color[0], g: atm.color[1], b: atm.color[2] } } : {}),
        ...(atm?.decay ? { Decay: { __type: 'Color3', r: atm.decay[0], g: atm.decay[1], b: atm.decay[2] } } : {}),
      },
    });
    scene.push({
      id: uuidv4(),
      className: 'Sky',
      name: 'GeneratedSky',
      parentId: 'Lighting',
      properties: { CelestialBodiesShown: true, StarCount: (lt.clockTime ?? 14) < 6 || (lt.clockTime ?? 14) > 18 ? 3000 : 300 },
    });
    const fx = lt.postEffects;
    scene.push({
      id: uuidv4(),
      className: 'BloomEffect',
      name: 'GeneratedBloom',
      parentId: 'Lighting',
      properties: { Intensity: fx?.bloomIntensity ?? 0.35, Size: fx?.bloomSize ?? 24, Threshold: fx?.bloomThreshold ?? 0.85 },
    });
    scene.push({
      id: uuidv4(),
      className: 'ColorCorrectionEffect',
      name: 'GeneratedColorGrade',
      parentId: 'Lighting',
      properties: {
        Brightness: fx?.ccBrightness ?? 0.03,
        Contrast: fx?.ccContrast ?? 0.08,
        Saturation: fx?.ccSaturation ?? 0.08,
        ...(fx?.ccTintColor ? { TintColor: { __type: 'Color3', r: fx.ccTintColor[0], g: fx.ccTintColor[1], b: fx.ccTintColor[2] } } : {}),
      },
    });
  }

  const requestedSystems = ['MapRuntime', 'Lighting', 'Terrain'];
  return {
    id: uuidv4(),
    title: args.title,
    summary: args.summary,
    target: 'place',
    formatPreference: 'binary',
    scene,
    scripts: [
      {
        id: uuidv4(),
        name: 'GeneratedSharedConfig',
        scriptType: 'ModuleScript',
        container: 'ReplicatedStorage',
        source: buildSharedConfigModule(args.title, args.summary, requestedSystems, metadata, spec.terrain),
      },
      ...(spec.terrain ? [{
        id: uuidv4(),
        name: 'TerrainGenerator',
        scriptType: 'Script' as const,
        container: 'ServerScriptService' as const,
        source: buildTerrainGeneratorScript(),
      }] : []),
      ...(args.additionalScripts || []).map(s => ({
        id: uuidv4(),
        name: s.name,
        scriptType: s.scriptType as 'Script' | 'LocalScript' | 'ModuleScript',
        container: s.container as RobloxBuildScript['container'],
        source: s.source,
      })),
    ],
  };
}

function deriveRequestedSystems(summary: string, metadata: Record<string, unknown>): string[] {
  const combined = `${summary}\n${JSON.stringify(metadata)}`.toLowerCase();
  const systems = new Set<string>();
  const candidates: Array<[string, string]> = [
    ['shop', 'Shop'],
    ['quest', 'Quests'],
    ['pet', 'Pets'],
    ['inventory', 'Inventory'],
    ['leaderboard', 'Leaderboard'],
    ['datastore', 'Data'],
    ['economy', 'Economy'],
    ['combat', 'Combat'],
    ['obby', 'Checkpoints'],
    ['npc', 'NPCs'],
  ];
  for (const [needle, name] of candidates) {
    if (combined.includes(needle)) {
      systems.add(name);
    }
  }
  if (systems.size === 0) {
    systems.add('CoreLoop');
    systems.add('UI');
  }
  return [...systems].slice(0, 6);
}

const TEXTURE_CLOTHING = /jacket|shirt|hoodie|sweater|vest|coat|dress|pants|skirt|cape|tshirt|t-shirt|fur|blouse|top|jeans|shorts|trousers|майка|футболка|куртка|кофта|худи|жилет|шуба|свитер|пальто|блузка|штаны|джинсы|шорты|юбка|брюки|платье|рубашка|толстовка|кардиган|пиджак|жакет|комбинезон|леггинсы|лосины|бомбер|ветровка|анорак|поло|топ|майку|футболку|рубашку|кофту/i;
const MESH_ACCESSORY = /hat|helmet|crown|glasses|mask|backpack|wing|shoe|boot|glove|sword|shield/i;
const IS_CHARACTER_PROMPT = /\b(npc|character|персонаж|герой|злодей|boss|босс|мафиози|торговец|воин|маг|рыцарь|warrior|mage|knight|guard|merchant|villager|zombie|skeleton|monster|robot|pirate|ninja|samurai|create\s+a\s+character|create\s+an?\s+npc)\b/i;

function isClothingRequest(prompt: string, metadata: Record<string, unknown>): boolean {
  const contentCategory = typeof metadata.contentCategory === 'string' ? metadata.contentCategory : '';
  const contentSubcategory = typeof metadata.contentSubcategory === 'string' ? metadata.contentSubcategory : '';
  if (contentCategory === 'npc_ai' || contentSubcategory === 'npcs' || contentSubcategory === 'roast_npc') {
    return false;
  }
  // Character / NPC prompts are never clothing-only, even when iOS routes UGC
  // through the `ugc_accessory` catch-all. Without this guard, requests like
  // "Bulky Gym Bro UGC Character with Workout Gear" short-circuit to a
  // body-less Shirt+AutoEquip Model. Symmetric to the same check inside
  // isTextureClothing() below.
  if (IS_CHARACTER_PROMPT.test(prompt)) return false;
  if (['ugc_clothing', 'ugc_accessory'].includes(contentCategory)) return true;
  if (TEXTURE_CLOTHING.test(prompt)) return true;
  if (MESH_ACCESSORY.test(prompt)) return true;
  return false;
}

export function isTextureClothing(prompt: string, metadata: Record<string, unknown>): boolean {
  const contentCategory = typeof metadata.contentCategory === 'string' ? metadata.contentCategory : '';
  const contentSubcategory = typeof metadata.contentSubcategory === 'string' ? metadata.contentSubcategory : '';
  // Characters/NPC chat — never route to clothing path. Smart-interview prompts
  // for NPCs frequently mention "fur", "cape", "armor", "vest", which would
  // otherwise match TEXTURE_CLOTHING below and produce an empty Shirt-only RBXM.
  if (contentSubcategory === 'characters' || contentSubcategory === 'npcs') return false;
  if (contentCategory === 'character' || contentCategory === 'npc_ai') return false;
  if (MESH_ACCESSORY.test(prompt)) return false;
  // If prompt clearly describes a character/person/NPC, don't classify as clothing
  if (IS_CHARACTER_PROMPT.test(prompt)) return false;
  if (TEXTURE_CLOTHING.test(prompt)) return true;
  if (contentCategory === 'ugc_clothing') return true;
  if (contentSubcategory === 'clothing') return true;
  return false;
}

export type ClothingType = 'shirt_only' | 'pants_only' | 'full_outfit';

const UPPER_BODY_ONLY = /shirt|tshirt|t-shirt|hoodie|sweater|vest|jacket|coat|cape|blouse|top|майка|футболка|куртка|кофта|худи|жилет|шуба|свитер|пальто|блузка|рубашка|толстовка|кардиган|пиджак|жакет|бомбер|ветровка|анорак|поло|топ|рубашку|футболку|кофту|майку/i;
const LOWER_BODY_ONLY = /pants|jeans|shorts|skirt|trousers|штаны|джинсы|шорты|юбка|брюки/i;

export function detectClothingType(prompt: string): ClothingType {
  const hasUpper = UPPER_BODY_ONLY.test(prompt);
  const hasLower = LOWER_BODY_ONLY.test(prompt);
  if (hasUpper && !hasLower) return 'shirt_only';
  if (hasLower && !hasUpper) return 'pants_only';
  return 'full_outfit';
}

function buildClothingOnlyManifest(
  args: {
    title: string;
    summary: string;
    target: RobloxBuildTarget;
    prompt: string;
    starterScript: string;
    metadata?: Record<string, unknown>;
  },
  metadata: Record<string, unknown>,
): RobloxBuildManifest {
  const shirtTextureUrl = typeof metadata.shirtTextureUrl === 'string'
    ? toRobloxTemplateUrl(metadata.shirtTextureUrl) : undefined;
  const pantsTextureUrl = typeof metadata.pantsTextureUrl === 'string'
    ? toRobloxTemplateUrl(metadata.pantsTextureUrl) : undefined;

  const scene: RobloxBuildSceneNode[] = [];

  if (shirtTextureUrl) {
    scene.push({
      id: uuidv4(),
      className: 'Shirt',
      name: 'Shirt',
      properties: { ShirtTemplate: shirtTextureUrl },
    });
  }

  if (pantsTextureUrl) {
    scene.push({
      id: uuidv4(),
      className: 'Pants',
      name: 'Pants',
      properties: { PantsTemplate: pantsTextureUrl },
    });
  }

  if (!shirtTextureUrl && !pantsTextureUrl) {
    scene.push({
      id: uuidv4(),
      className: 'Shirt',
      name: 'Shirt',
      properties: {},
    });
  }

  const autoEquipScript = buildClothingAutoEquipScript(shirtTextureUrl, pantsTextureUrl);

  return {
    id: uuidv4(),
    title: args.title,
    summary: args.summary,
    target: 'model',
    formatPreference: 'binary',
    scene,
    scripts: [
      {
        id: uuidv4(),
        name: 'AutoEquipClothing',
        scriptType: 'Script',
        container: 'ServerScriptService',
        source: autoEquipScript,
      },
    ],
    ui: [],
    metadata: {
      prompt: args.prompt,
      generatedBy: 'roblox-worker clothing-texture pipeline',
      isClothing: true,
      hasShirtTemplate: !!shirtTextureUrl,
      hasPantsTemplate: !!pantsTextureUrl,
      ...metadata,
    },
  };
}

function buildTShirtManifest(
  args: {
    title: string;
    summary: string;
    target: RobloxBuildTarget;
    prompt: string;
    starterScript: string;
    metadata?: Record<string, unknown>;
  },
  metadata: Record<string, unknown>,
): RobloxBuildManifest {
  const tshirtGraphicUrl = typeof metadata.tshirtGraphicUrl === 'string'
    ? toRobloxTemplateUrl(metadata.tshirtGraphicUrl)
    : undefined;
  const scene: RobloxBuildSceneNode[] = [];

  if (tshirtGraphicUrl) {
    scene.push({
      id: uuidv4(),
      className: 'ShirtGraphic',
      name: 'TShirtGraphic',
      properties: { Graphic: tshirtGraphicUrl },
    });
  } else {
    scene.push({
      id: uuidv4(),
      className: 'StringValue',
      name: 'ManualUploadRequired',
      properties: {
        Value: 'Upload the generated PNG to Roblox as a Classic T-Shirt, then set ShirtGraphic.Graphic to that asset id.',
      },
    });
  }

  return {
    id: uuidv4(),
    title: args.title,
    summary: args.summary,
    target: 'model',
    formatPreference: 'binary',
    scene,
    scripts: [
      {
        id: uuidv4(),
        name: 'AutoEquipTShirt',
        scriptType: 'Script',
        container: 'ServerScriptService',
        source: buildTShirtAutoEquipScript(tshirtGraphicUrl),
      },
    ],
    ui: [],
    metadata: {
      prompt: args.prompt,
      generatedBy: 'roblox-worker clothing-tshirt pipeline',
      isClothing: true,
      isTShirt: true,
      hasTShirtGraphic: !!tshirtGraphicUrl,
      ...metadata,
    },
  };
}

// Session 001 (Track 2): map iOS clothingType → Roblox AccessoryType enum value.
// Roblox enum values per https://create.roblox.com/docs/reference/engine/enums/AccessoryType.
function resolveAccessoryType(clothingType: string | undefined): string {
  switch (clothingType) {
    case 'layered_tshirt': return 'TShirt';
    case 'layered_shirt': return 'Shirt';
    case 'layered_sweater': return 'Sweater';
    case 'layered_jacket': return 'Jacket';
    case 'layered_pants': return 'Pants';
    case 'layered_shorts': return 'Shorts';
    case 'layered_dress': return 'DressSkirt';
    default: return 'Jacket'; // sensible default — first UGC layered type Roblox shipped (2022)
  }
}

function buildLayeredClothingManifest(
  args: {
    title: string;
    summary: string;
    target: RobloxBuildTarget;
    prompt: string;
    starterScript: string;
    metadata?: Record<string, unknown>;
  },
  metadata: Record<string, unknown>,
): RobloxBuildManifest {
  const clothingGlbUrl = typeof metadata.clothingGlbUrl === 'string' ? metadata.clothingGlbUrl : undefined;
  const innerCageUrl = typeof metadata.innerCageUrl === 'string' ? metadata.innerCageUrl : undefined;
  const outerCageUrl = typeof metadata.outerCageUrl === 'string' ? metadata.outerCageUrl : undefined;
  const clothingTypeRaw = typeof metadata.clothingType === 'string' ? metadata.clothingType : undefined;
  const accessoryTypeEnum = resolveAccessoryType(clothingTypeRaw);

  const accessoryId = uuidv4();
  const handleId = uuidv4();
  const wrapLayerId = uuidv4();

  const scene: RobloxBuildSceneNode[] = [
    {
      id: accessoryId,
      className: 'Accessory',
      name: `${args.title}-${accessoryTypeEnum}`,
      parentId: 'WorkspaceRoot',
      properties: {
        AccessoryType: { __type: 'EnumItem', enum: 'AccessoryType', value: accessoryTypeEnum },
      },
    },
    {
      id: handleId,
      className: 'MeshPart',
      name: 'Handle',
      parentId: accessoryId,
      properties: {
        ...(clothingGlbUrl ? { MeshId: clothingGlbUrl } : {}),
        Size: { __type: 'Vector3', x: 2, y: 2, z: 1 },
        CanCollide: false,
        Anchored: false,
      },
    },
    {
      id: wrapLayerId,
      className: 'WrapLayer',
      name: 'WrapLayer',
      parentId: handleId,
      properties: {
        Enabled: true,
        Order: 1,
        AutoSkin: { __type: 'EnumItem', enum: 'WrapLayerAutoSkin', value: 'EnabledOverride' },
        ShrinkFactor: 0,
        Puffiness: 1,
        ...(innerCageUrl ? { ReferenceMeshId: innerCageUrl } : {}),
        ...(outerCageUrl ? { CageMeshId: outerCageUrl } : {}),
      },
    },
  ];

  const autoEquipScript = buildLayeredClothingAutoEquipScript();

  return {
    id: uuidv4(),
    title: args.title,
    summary: args.summary,
    target: 'model',
    formatPreference: 'binary',
    scene,
    scripts: [
      {
        id: uuidv4(),
        name: 'AutoEquipLayeredClothing',
        scriptType: 'Script',
        container: 'ServerScriptService',
        source: autoEquipScript,
      },
    ],
    ui: [],
    metadata: {
      prompt: args.prompt,
      generatedBy: 'roblox-worker layered-clothing pipeline',
      isLayeredClothing: true,
      clothingGlbUrl,
      innerCageUrl,
      outerCageUrl,
      ...metadata,
    },
  };
}

// ---------------------------------------------------------------------------
// Track 3 (Pet 3D pipeline) — assemble an .rbxm scene for a 3-stage evolution
// pet. Each stage is a child Model under `Stages`; Stage1 is the active
// instance (direct child of the Pet model) and Stage2/Stage3 sit dormant
// inside the Folder until PetLevelingModule:Evolve(N) swaps them in.
// Pairs with apps/functions/src/uiTemplates.ts → buildPetFollowScript /
// buildPetLevelingModule (Lua sources injected via manifest.scripts).
// ---------------------------------------------------------------------------
function buildPetEvolutionManifest(
  args: {
    title: string;
    summary: string;
    target: RobloxBuildTarget;
    prompt: string;
    starterScript: string;
    metadata?: Record<string, unknown>;
  },
  metadata: Record<string, unknown>,
): RobloxBuildManifest {
  const baseName = sanitizeIdentifier(typeof metadata.petBaseName === 'string' ? metadata.petBaseName : args.title || 'Pet');
  const speciesType = typeof metadata.petSpeciesType === 'string' ? metadata.petSpeciesType : 'fantasy';
  const skeletonType = typeof metadata.petSkeletonType === 'string' ? metadata.petSkeletonType : 'quadruped';
  const rarity = typeof metadata.petRarity === 'string' ? metadata.petRarity : 'Rare';
  const element = typeof metadata.petElement === 'string' ? metadata.petElement : 'Neutral';
  const isFlying = !!metadata.petIsFlying;
  const stageMeshes = (metadata.petStageMeshes as Array<{ meshUrl?: string; fbxFileName?: string; idleAnimUrl?: string; walkAnimUrl?: string; flyAnimUrl?: string }> | undefined) ?? [];
  const coinBonusBase = rarityCoinBonus(rarity);

  const petModelId = uuidv4();
  const configId = uuidv4();
  const stagesFolderId = uuidv4();

  const scene: RobloxBuildSceneNode[] = [
    {
      id: petModelId,
      className: 'Model',
      name: `Pet_${baseName}`,
      parentId: 'WorkspaceRoot',
    },
    {
      id: configId,
      className: 'Configuration',
      name: 'PetConfig',
      parentId: petModelId,
    },
    childStringValue(configId, 'SpeciesType', speciesType),
    childStringValue(configId, 'SkeletonType', skeletonType),
    childStringValue(configId, 'Rarity', rarity),
    childStringValue(configId, 'Element', element),
    childBoolValue(configId, 'IsFlying', isFlying),
    childIntValue(configId, 'Level', 1),
    childIntValue(configId, 'XP', 0),
    childIntValue(configId, 'EvolutionStage', 1),
    childNumberValue(configId, 'CoinBonusBase', coinBonusBase),
    {
      id: stagesFolderId,
      className: 'Folder',
      name: 'Stages',
      parentId: petModelId,
    },
  ];

  for (let i = 1; i <= 3; i += 1) {
    const stageData = stageMeshes[i - 1] ?? {};
    const stageModelId = uuidv4();
    const hrpId = uuidv4();
    const bodyId = uuidv4();
    const acId = uuidv4();
    const anchorAttachId = uuidv4();
    const alignPosId = uuidv4();
    const alignRotId = uuidv4();
    // Stage 1 is the active stage — direct child of the Pet model. Later
    // stages sit inside the Stages folder until PetLevelingModule:Evolve()
    // moves them to be direct children of the Pet model.
    const stageParentId = i === 1 ? petModelId : stagesFolderId;
    scene.push(
      {
        id: stageModelId,
        className: 'Model',
        name: `Stage${i}`,
        parentId: stageParentId,
      },
      {
        id: hrpId,
        className: 'Part',
        name: 'HumanoidRootPart',
        parentId: stageModelId,
        properties: {
          Transparency: 1,
          Anchored: false,
          CanCollide: false,
          Massless: true,
          Size: { __type: 'Vector3', x: 2, y: 2, z: 2 },
        },
      },
      {
        id: bodyId,
        className: 'MeshPart',
        name: 'Body',
        parentId: stageModelId,
        properties: {
          MeshId: stageData.meshUrl ?? 'rbxassetid://0',
          Size: { __type: 'Vector3', x: 3, y: 3, z: 3 },
          CanCollide: false,
          Anchored: false,
          Massless: true,
        },
      },
      // Pending-upload sentinel for PetFollowScript to warn on.
      {
        id: uuidv4(),
        className: 'StringValue',
        name: 'PendingMeshUpload',
        parentId: bodyId,
        properties: { Value: stageData.fbxFileName ?? `stage${i}.fbx` },
      },
      {
        id: acId,
        className: 'AnimationController',
        name: 'AnimationController',
        parentId: stageModelId,
      },
      {
        id: uuidv4(),
        className: 'Animation',
        name: 'Idle',
        parentId: acId,
        properties: { AnimationId: stageData.idleAnimUrl ?? '' },
      },
      {
        id: uuidv4(),
        className: 'Animation',
        name: 'Walk',
        parentId: acId,
        properties: { AnimationId: stageData.walkAnimUrl ?? '' },
      },
    );
    if (isFlying) {
      scene.push({
        id: uuidv4(),
        className: 'Animation',
        name: 'Fly',
        parentId: acId,
        properties: { AnimationId: stageData.flyAnimUrl ?? '' },
      });
    }
    scene.push(
      {
        id: anchorAttachId,
        className: 'Attachment',
        name: 'FollowAnchor',
        parentId: hrpId,
      },
      {
        id: alignPosId,
        className: 'AlignPosition',
        name: 'FollowPos',
        parentId: stageModelId,
        properties: {
          Attachment0: { __type: 'InstanceRef', refId: anchorAttachId },
          RigidityEnabled: false,
          MaxForce: 10000,
          Responsiveness: 50,
        },
      },
      {
        id: alignRotId,
        className: 'AlignOrientation',
        name: 'FollowRot',
        parentId: stageModelId,
        properties: {
          Attachment0: { __type: 'InstanceRef', refId: anchorAttachId },
          Responsiveness: 30,
        },
      },
    );
  }

  return {
    id: uuidv4(),
    title: args.title,
    summary: args.summary,
    target: 'model',
    formatPreference: 'binary',
    scene,
    scripts: [
      {
        id: uuidv4(),
        name: 'PetFollowScript',
        scriptType: 'Script',
        container: petModelId,
        source: buildPetFollowScript(),
      },
      {
        id: uuidv4(),
        name: 'PetLevelingModule',
        scriptType: 'ModuleScript',
        container: petModelId,
        source: buildPetLevelingModule(),
      },
    ],
    ui: [],
    metadata: {
      prompt: args.prompt,
      generatedBy: 'roblox-worker pet-evolution pipeline',
      isPetEvolution: true,
      petBaseName: baseName,
      petSpeciesType: speciesType,
      petSkeletonType: skeletonType,
      petRarity: rarity,
      petElement: element,
      petIsFlying: isFlying,
      ...metadata,
    },
  };
}

function sanitizeIdentifier(raw: string): string {
  const cleaned = raw.replace(/[^A-Za-z0-9_]/g, '');
  return cleaned.length > 0 ? cleaned.slice(0, 40) : 'Pet';
}

function rarityCoinBonus(rarity: string): number {
  switch (rarity) {
    case 'Mythic': return 3.0;
    case 'Legendary': return 2.2;
    case 'Epic': return 1.6;
    case 'Rare': return 1.3;
    case 'Uncommon': return 1.15;
    case 'Common':
    default:
      return 1.05;
  }
}

function childStringValue(parentId: string, name: string, value: string): RobloxBuildSceneNode {
  return {
    id: uuidv4(),
    className: 'StringValue',
    name,
    parentId,
    properties: { Value: value },
  };
}

function childBoolValue(parentId: string, name: string, value: boolean): RobloxBuildSceneNode {
  return {
    id: uuidv4(),
    className: 'BoolValue',
    name,
    parentId,
    properties: { Value: value },
  };
}

function childIntValue(parentId: string, name: string, value: number): RobloxBuildSceneNode {
  return {
    id: uuidv4(),
    className: 'IntValue',
    name,
    parentId,
    properties: { Value: value },
  };
}

function childNumberValue(parentId: string, name: string, value: number): RobloxBuildSceneNode {
  return {
    id: uuidv4(),
    className: 'NumberValue',
    name,
    parentId,
    properties: { Value: value },
  };
}

// ---------------------------------------------------------------------------
// Vehicles — deterministic playable chassis .rbxm.
// The visual shell is Roblox Parts; physics/controller/sounds/VFX are embedded
// so the asset works in Studio immediately after import with no external mesh.
// ---------------------------------------------------------------------------
type VehicleModelType = 'car' | 'motorcycle' | 'boat' | 'plane' | 'helicopter' | 'tank' | 'spaceship' | 'bicycle' | 'bus';

interface VehicleProfile {
  type: VehicleModelType;
  driveMode: 'land_wheels' | 'watercraft' | 'aircraft' | 'rotorcraft' | 'tracked' | 'hover';
  size: [number, number, number];
  wheelCount: number;
  seatCount: number;
  topSpeed: number;
  acceleration: number;
  turnRate: number;
  wheelRadius: number;
}

function buildVehicleModelManifest(
  args: {
    title: string;
    summary: string;
    target: RobloxBuildTarget;
    prompt: string;
    starterScript: string;
    metadata?: Record<string, unknown>;
  },
  metadata: Record<string, unknown>,
): RobloxBuildManifest {
  const vehicleType = resolveVehicleModelType(args.prompt, metadata);
  const profile = resolveVehicleProfile(vehicleType, metadata);
  const baseName = sanitizeSystemName(args.title || 'Generated Vehicle') || 'GeneratedVehicle';
  const title = `Vehicle_${baseName}`;
  const primaryRgb = hexToColor3(metadata.primaryColor) ?? defaultVehiclePalette(vehicleType).primary;
  const accentRgb = hexToColor3(metadata.accentColor) ?? defaultVehiclePalette(vehicleType).accent;
  const glowRgb = hexToColor3(metadata.glowColor) ?? defaultVehiclePalette(vehicleType).glow;
  const primary = color3(primaryRgb.r, primaryRgb.g, primaryRgb.b);
  const accent = color3(accentRgb.r, accentRgb.g, accentRgb.b);
  const glow = color3(glowRgb.r, glowRgb.g, glowRgb.b);
  const dark = color3(0.04, 0.045, 0.05);
  const glass = color3(0.35, 0.75, 1.0);
  const scene: RobloxBuildSceneNode[] = [];
  const folders = {
    config: uuidv4(),
    body: uuidv4(),
    seats: uuidv4(),
    wheels: uuidv4(),
    physics: uuidv4(),
    effects: uuidv4(),
    sounds: uuidv4(),
  };
  const rootId = uuidv4();
  const rootY = Math.max(1.1, profile.wheelRadius + 0.75);
  const [width, height, length] = profile.size;

  const numberRange = (min: number, max: number): Record<string, unknown> => ({ __type: 'NumberRange', min, max });
  const numberSequence = (value: number): Record<string, unknown> => ({
    __type: 'NumberSequence',
    keypoints: [
      { time: 0, value, envelope: 0 },
      { time: 1, value, envelope: 0 },
    ],
  });
  const colorSequence = (rgb: { r: number; g: number; b: number }): Record<string, unknown> => ({
    __type: 'ColorSequence',
    keypoints: [
      { time: 0, r: rgb.r, g: rgb.g, b: rgb.b },
      { time: 1, r: rgb.r, g: rgb.g, b: rgb.b },
    ],
  });
  const cf = (x: number, y: number, z: number, rot: [number, number, number] = [0, 0, 0]) => ({
    __type: 'CFrame',
    position: { x, y, z },
    rotation: rot,
  });
  const ref = (id: string) => ({ __type: 'Ref', id });
  const addPart = (
    name: string,
    parentId: string,
    size: [number, number, number],
    pos: [number, number, number],
    color: Record<string, unknown>,
    options: {
      className?: string;
      material?: string;
      shape?: 'Block' | 'Cylinder' | 'Ball';
      rot?: [number, number, number];
      canCollide?: boolean;
      transparency?: number;
      massless?: boolean;
      anchored?: boolean;
      extra?: Record<string, unknown>;
    } = {},
  ): string => {
    const id = uuidv4();
    scene.push({
      id,
      className: options.className ?? 'Part',
      name,
      parentId,
      properties: {
        Size: vector3(size[0], size[1], size[2]),
        CFrame: cf(pos[0], pos[1], pos[2], options.rot),
        Anchored: options.anchored ?? false,
        CanCollide: options.canCollide ?? false,
        Massless: options.massless ?? true,
        Color: color,
        Material: enumValue('Material', options.material ?? 'SmoothPlastic'),
        Shape: enumValue('PartType', options.shape ?? 'Block'),
        ...(options.transparency !== undefined ? { Transparency: options.transparency } : {}),
        ...(options.extra ?? {}),
      },
    });
    return id;
  };
  const weldToRoot = (partId: string, name: string): void => {
    scene.push({
      id: uuidv4(),
      className: 'WeldConstraint',
      name,
      parentId: partId,
      properties: { Part0: ref(rootId), Part1: ref(partId) },
    });
  };
  const addBodyPart = (
    name: string,
    size: [number, number, number],
    pos: [number, number, number],
    color: Record<string, unknown>,
    options: Parameters<typeof addPart>[5] = {},
  ): string => {
    const id = addPart(name, folders.body, size, pos, color, options);
    weldToRoot(id, `${name}Weld`);
    return id;
  };

  scene.push(
    { id: folders.config, className: 'Configuration', name: 'VehicleConfig' },
    childStringValue(folders.config, 'VehicleType', profile.type),
    childStringValue(folders.config, 'DriveMode', profile.driveMode),
    childNumberValue(folders.config, 'TopSpeed', profile.topSpeed),
    childNumberValue(folders.config, 'Acceleration', profile.acceleration),
    childNumberValue(folders.config, 'TurnRate', profile.turnRate),
    childNumberValue(folders.config, 'WheelRadius', profile.wheelRadius),
    childIntValue(folders.config, 'SeatCount', profile.seatCount),
    { id: folders.body, className: 'Folder', name: 'Body' },
    { id: folders.seats, className: 'Folder', name: 'Seats' },
    { id: folders.wheels, className: 'Folder', name: 'Wheels' },
    { id: folders.physics, className: 'Folder', name: 'Physics' },
    { id: folders.effects, className: 'Folder', name: 'Effects' },
    { id: folders.sounds, className: 'Folder', name: 'Sounds' },
    {
      id: rootId,
      className: 'Part',
      name: 'ChassisRoot',
      properties: {
        Size: vector3(width * 0.82, Math.max(0.45, height * 0.24), length * 0.74),
        CFrame: cf(0, rootY, 0),
        Anchored: false,
        CanCollide: profile.driveMode !== 'land_wheels' && profile.driveMode !== 'tracked',
        Massless: false,
        Color: primary,
        Material: enumValue('Material', vehicleType === 'boat' ? 'Wood' : 'Metal'),
        Transparency: 1,
      },
    },
  );

  addVehicleBodyShell(vehicleType, profile, { addBodyPart, width, height, length, rootY, primary, accent, glow, dark, glass });
  addVehicleSeats({ scene, folders, rootId, profile, rootY, width, length, accent, cf, ref, weldToRoot });
  addVehiclePhysics({ scene, folders, rootId, profile, rootY, width, length, accent, dark, cf, ref, addPart });
  addVehicleEffects({ scene, folders, rootId, profile, rootY, width, length, glowRgb, cf, numberRange, numberSequence, colorSequence });

  scene.push(
    {
      id: uuidv4(),
      className: 'Sound',
      name: 'EngineLoop',
      parentId: rootId,
      properties: {
        SoundId: 'rbxassetid://9120386436',
        Looped: true,
        Volume: 0,
        PlaybackSpeed: 0.8,
        RollOffMinDistance: 8,
        RollOffMaxDistance: 95,
      },
    },
    {
      id: uuidv4(),
      className: 'Sound',
      name: 'BoostOrHorn',
      parentId: rootId,
      properties: {
        SoundId: 'rbxasset://sounds/electronicpingshort.mp3',
        Looped: false,
        Volume: 0.45,
        RollOffMaxDistance: 70,
      },
    },
  );

  return {
    id: uuidv4(),
    title,
    summary: args.summary,
    target: 'model',
    rootClassName: 'Model',
    rootProperties: {
      PrimaryPart: ref(rootId),
    },
    formatPreference: 'binary',
    scene,
    scripts: [
      {
        id: uuidv4(),
        name: 'VehicleController',
        scriptType: 'Script',
        container: 'WorkspaceRoot',
        source: buildVehicleControllerScript(),
      },
    ],
    ui: [],
    metadata: {
      prompt: args.prompt,
      generatedBy: 'roblox-worker vehicle_3d deterministic pipeline',
      requestedKind: 'vehicle_3d',
      vehicleType: profile.type,
      driveMode: profile.driveMode,
      seatCount: profile.seatCount,
      topSpeed: profile.topSpeed,
      acceleration: profile.acceleration,
      turnRate: profile.turnRate,
      ...metadata,
    },
  };
}

function resolveVehicleModelType(prompt: string, metadata: Record<string, unknown>): VehicleModelType {
  const raw = typeof metadata.vehicleType === 'string' ? metadata.vehicleType.toLowerCase().trim() : '';
  const known: VehicleModelType[] = ['car', 'motorcycle', 'boat', 'plane', 'helicopter', 'tank', 'spaceship', 'bicycle', 'bus'];
  if (known.includes(raw as VehicleModelType)) return raw as VehicleModelType;
  const text = `${prompt} ${metadata.title ?? ''} ${metadata.theme ?? ''}`.toLowerCase();
  if (/\b(bus|coach|shuttle)\b|автобус|маршрутк/i.test(text)) return 'bus';
  if (/\b(tank|tracked|tread)\b|танк|гусениц/i.test(text)) return 'tank';
  if (/\b(helicopter|heli|chopper|rotor)\b|вертол/i.test(text)) return 'helicopter';
  if (/\b(plane|airplane|aircraft|jet|fighter)\b|самол[её]т|истреб/i.test(text)) return 'plane';
  if (/\b(boat|ship|speedboat|yacht|submarine)\b|лодк|корабл|катер|яхт/i.test(text)) return 'boat';
  if (/\b(spaceship|space\s*ship|starfighter|ufo|rocket)\b|косми|звездол|ракета|нло/i.test(text)) return 'spaceship';
  if (/\b(motorcycle|motorbike|hoverbike)\b|мото|байк/i.test(text)) return 'motorcycle';
  if (/\b(bicycle|cycle|bmx)\b|велосип/i.test(text)) return 'bicycle';
  return 'car';
}

function resolveVehicleProfile(type: VehicleModelType, metadata: Record<string, unknown>): VehicleProfile {
  const seatCountRaw = Number(metadata.seatCount ?? metadata.passengerCount);
  const topSpeedRaw = Number(metadata.topSpeed);
  const accelerationRaw = Number(metadata.acceleration);
  const turnRateRaw = Number(metadata.turnRate);
  const defaults: Record<VehicleModelType, VehicleProfile> = {
    car: { type, driveMode: 'land_wheels', size: [6.4, 2.9, 9.6], wheelCount: 4, seatCount: 4, topSpeed: 86, acceleration: 46, turnRate: 1.55, wheelRadius: 0.9 },
    motorcycle: { type, driveMode: 'land_wheels', size: [2.4, 2.5, 6.4], wheelCount: 2, seatCount: 2, topSpeed: 78, acceleration: 38, turnRate: 2.5, wheelRadius: 0.75 },
    bicycle: { type, driveMode: 'land_wheels', size: [2.1, 2.4, 5.8], wheelCount: 2, seatCount: 1, topSpeed: 40, acceleration: 18, turnRate: 2.3, wheelRadius: 0.72 },
    bus: { type, driveMode: 'land_wheels', size: [7.8, 4.4, 14.5], wheelCount: 6, seatCount: 8, topSpeed: 58, acceleration: 24, turnRate: 1.05, wheelRadius: 0.98 },
    boat: { type, driveMode: 'watercraft', size: [7, 2.8, 12], wheelCount: 0, seatCount: 4, topSpeed: 62, acceleration: 22, turnRate: 1.6, wheelRadius: 0.6 },
    plane: { type, driveMode: 'aircraft', size: [14, 3.3, 13], wheelCount: 3, seatCount: 4, topSpeed: 92, acceleration: 24, turnRate: 1.25, wheelRadius: 0.45 },
    helicopter: { type, driveMode: 'rotorcraft', size: [9, 3.4, 11], wheelCount: 0, seatCount: 4, topSpeed: 68, acceleration: 22, turnRate: 1.9, wheelRadius: 0.5 },
    tank: { type, driveMode: 'tracked', size: [7.4, 3.4, 10], wheelCount: 8, seatCount: 4, topSpeed: 42, acceleration: 16, turnRate: 1.8, wheelRadius: 0.55 },
    spaceship: { type, driveMode: 'hover', size: [10, 3.2, 11], wheelCount: 0, seatCount: 4, topSpeed: 88, acceleration: 28, turnRate: 2.0, wheelRadius: 0.5 },
  };
  const base = defaults[type];
  return {
    ...base,
    seatCount: Number.isFinite(seatCountRaw) && seatCountRaw > 0 ? Math.max(1, Math.min(12, Math.round(seatCountRaw))) : base.seatCount,
    topSpeed: Number.isFinite(topSpeedRaw) && topSpeedRaw > 0 ? Math.max(20, Math.min(140, topSpeedRaw)) : base.topSpeed,
    acceleration: Number.isFinite(accelerationRaw) && accelerationRaw > 0 ? Math.max(8, Math.min(60, accelerationRaw)) : base.acceleration,
    turnRate: Number.isFinite(turnRateRaw) && turnRateRaw > 0 ? Math.max(0.6, Math.min(4, turnRateRaw)) : base.turnRate,
  };
}

function defaultVehiclePalette(type: VehicleModelType): {
  primary: { r: number; g: number; b: number };
  accent: { r: number; g: number; b: number };
  glow: { r: number; g: number; b: number };
} {
  switch (type) {
    case 'tank': return { primary: { r: 0.20, g: 0.33, b: 0.18 }, accent: { r: 0.08, g: 0.09, b: 0.08 }, glow: { r: 1.0, g: 0.55, b: 0.16 } };
    case 'boat': return { primary: { r: 0.08, g: 0.25, b: 0.75 }, accent: { r: 0.92, g: 0.92, b: 0.86 }, glow: { r: 0.20, g: 0.80, b: 1.0 } };
    case 'plane': return { primary: { r: 0.88, g: 0.90, b: 0.92 }, accent: { r: 0.16, g: 0.20, b: 0.28 }, glow: { r: 1.0, g: 0.35, b: 0.20 } };
    case 'helicopter': return { primary: { r: 0.15, g: 0.18, b: 0.20 }, accent: { r: 0.85, g: 0.18, b: 0.12 }, glow: { r: 1.0, g: 0.75, b: 0.20 } };
    case 'spaceship': return { primary: { r: 0.72, g: 0.75, b: 0.82 }, accent: { r: 0.08, g: 0.10, b: 0.16 }, glow: { r: 0.20, g: 0.95, b: 1.0 } };
    case 'motorcycle': return { primary: { r: 0.75, g: 0.08, b: 0.08 }, accent: { r: 0.03, g: 0.03, b: 0.035 }, glow: { r: 1.0, g: 0.45, b: 0.12 } };
    case 'bicycle': return { primary: { r: 0.10, g: 0.55, b: 0.20 }, accent: { r: 0.04, g: 0.04, b: 0.04 }, glow: { r: 0.85, g: 0.95, b: 0.35 } };
    case 'bus': return { primary: { r: 1.0, g: 0.75, b: 0.12 }, accent: { r: 0.10, g: 0.10, b: 0.12 }, glow: { r: 1.0, g: 0.25, b: 0.12 } };
    case 'car':
    default:
      return { primary: { r: 0.88, g: 0.10, b: 0.12 }, accent: { r: 0.04, g: 0.045, b: 0.05 }, glow: { r: 0.15, g: 0.75, b: 1.0 } };
  }
}

function addVehicleBodyShell(
  vehicleType: VehicleModelType,
  profile: VehicleProfile,
  ctx: {
    addBodyPart: (name: string, size: [number, number, number], pos: [number, number, number], color: Record<string, unknown>, options?: {
      className?: string; material?: string; shape?: 'Block' | 'Cylinder' | 'Ball'; rot?: [number, number, number]; canCollide?: boolean; transparency?: number; massless?: boolean; anchored?: boolean; extra?: Record<string, unknown>;
    }) => string;
    width: number; height: number; length: number; rootY: number;
    primary: Record<string, unknown>; accent: Record<string, unknown>; glow: Record<string, unknown>; dark: Record<string, unknown>; glass: Record<string, unknown>;
  },
): void {
  const { addBodyPart, width: w, height: h, length: l, rootY, primary, accent, glow, dark, glass } = ctx;
  if (vehicleType === 'boat') {
    addBodyPart('Hull', [w, h * 0.72, l], [0, rootY + 0.2, 0], primary, { material: 'SmoothPlastic' });
    addBodyPart('Cabin', [w * 0.45, h * 0.5, l * 0.24], [0, rootY + h * 0.55, -l * 0.12], glass, { material: 'Glass', transparency: 0.25 });
    addBodyPart('BowStripe', [w * 0.9, 0.18, l * 0.08], [0, rootY + h * 0.55, -l * 0.48], accent, { material: 'Neon' });
    return;
  }
  if (vehicleType === 'plane') {
    addBodyPart('Fuselage', [w * 0.24, h * 0.55, l], [0, rootY + 0.15, 0], primary, { shape: 'Cylinder', rot: [90, 0, 0], material: 'Metal' });
    addBodyPart('MainWing', [w, 0.18, l * 0.28], [0, rootY + 0.05, -l * 0.05], accent, { material: 'Metal' });
    addBodyPart('TailWing', [w * 0.45, 0.16, l * 0.18], [0, rootY + h * 0.18, l * 0.42], accent, { material: 'Metal' });
    addBodyPart('CockpitGlass', [w * 0.20, h * 0.24, l * 0.16], [0, rootY + h * 0.42, -l * 0.28], glass, { material: 'Glass', transparency: 0.22 });
    return;
  }
  if (vehicleType === 'helicopter') {
    addBodyPart('CabinBody', [w * 0.55, h * 0.62, l * 0.45], [0, rootY + 0.18, -l * 0.06], primary, { material: 'Metal' });
    addBodyPart('TailBoom', [w * 0.16, h * 0.16, l * 0.58], [0, rootY + h * 0.24, l * 0.36], accent, { material: 'Metal' });
    addBodyPart('RotorBladeA', [w * 1.05, 0.12, 0.32], [0, rootY + h * 0.75, -l * 0.04], dark, { material: 'Metal' });
    addBodyPart('RotorBladeB', [0.32, 0.12, w * 1.05], [0, rootY + h * 0.75, -l * 0.04], dark, { material: 'Metal' });
    addBodyPart('TailRotor', [0.12, h * 0.65, 0.12], [0, rootY + h * 0.28, l * 0.68], glow, { material: 'Neon' });
    return;
  }
  if (vehicleType === 'spaceship') {
    addBodyPart('CoreHull', [w * 0.62, h * 0.5, l * 0.74], [0, rootY + 0.15, 0], primary, { material: 'Metal' });
    addBodyPart('LeftWing', [w * 0.45, 0.18, l * 0.42], [-w * 0.42, rootY + 0.02, 0.08], accent, { material: 'Metal' });
    addBodyPart('RightWing', [w * 0.45, 0.18, l * 0.42], [w * 0.42, rootY + 0.02, 0.08], accent, { material: 'Metal' });
    addBodyPart('CockpitDome', [w * 0.28, h * 0.28, l * 0.22], [0, rootY + h * 0.44, -l * 0.22], glass, { shape: 'Ball', material: 'Glass', transparency: 0.18 });
    addBodyPart('ThrusterGlow', [w * 0.36, h * 0.18, 0.18], [0, rootY + 0.05, l * 0.45], glow, { material: 'Neon' });
    return;
  }
  if (vehicleType === 'tank') {
    addBodyPart('ArmoredHull', [w, h * 0.42, l * 0.72], [0, rootY + 0.18, 0], primary, { material: 'Metal' });
    addBodyPart('Turret', [w * 0.45, h * 0.28, l * 0.28], [0, rootY + h * 0.54, -l * 0.04], accent, { material: 'Metal' });
    addBodyPart('Cannon', [0.22, 0.22, l * 0.44], [0, rootY + h * 0.55, -l * 0.34], dark, { shape: 'Cylinder', rot: [90, 0, 0], material: 'Metal' });
    addBodyPart('LeftTrackGuard', [0.22, h * 0.35, l * 0.86], [-w * 0.54, rootY - 0.08, 0], dark, { material: 'Metal' });
    addBodyPart('RightTrackGuard', [0.22, h * 0.35, l * 0.86], [w * 0.54, rootY - 0.08, 0], dark, { material: 'Metal' });
    return;
  }
  if (vehicleType === 'motorcycle' || vehicleType === 'bicycle') {
    addBodyPart('FrameBar', [w * 0.38, h * 0.16, l * 0.70], [0, rootY + 0.12, 0], primary, { material: vehicleType === 'bicycle' ? 'Metal' : 'SmoothPlastic' });
    addBodyPart('SeatPad', [w * 0.55, 0.22, l * 0.24], [0, rootY + h * 0.42, l * 0.02], dark, { material: 'Fabric' });
    addBodyPart('Handlebar', [w * 1.05, 0.14, 0.14], [0, rootY + h * 0.52, -l * 0.38], accent, { material: 'Metal' });
    addBodyPart('HeadLamp', [0.38, 0.28, 0.18], [0, rootY + h * 0.38, -l * 0.48], glow, { material: 'Neon' });
    return;
  }
  if (vehicleType === 'bus') {
    addBodyPart('BusLowerBody', [w, h * 0.48, l * 0.82], [0, rootY + 0.2, 0.02], primary, { material: 'SmoothPlastic' });
    addBodyPart('BusCabinShell', [w * 0.94, h * 0.44, l * 0.68], [0, rootY + h * 0.62, -l * 0.03], primary, { material: 'SmoothPlastic' });
    addBodyPart('BusRoofCap', [w * 0.98, h * 0.08, l * 0.72], [0, rootY + h * 0.9, -l * 0.03], accent, { material: 'Metal' });
    addBodyPart('BusWindshield', [w * 0.76, h * 0.28, 0.12], [0, rootY + h * 0.66, -l * 0.39], glass, { material: 'Glass', transparency: 0.22 });
    addBodyPart('BusRearWindow', [w * 0.68, h * 0.24, 0.12], [0, rootY + h * 0.64, l * 0.36], glass, { material: 'Glass', transparency: 0.26 });
    for (const side of [-1, 1]) {
      addBodyPart(`${side < 0 ? 'Left' : 'Right'}BusWindowRow`, [0.12, h * 0.23, l * 0.48], [side * w * 0.49, rootY + h * 0.66, -l * 0.03], glass, { material: 'Glass', transparency: 0.25 });
      addBodyPart(`${side < 0 ? 'Left' : 'Right'}BusDoorPanel`, [0.13, h * 0.36, l * 0.14], [side * w * 0.5, rootY + h * 0.44, -l * 0.27], accent, { material: 'Metal' });
      addBodyPart(`${side < 0 ? 'Left' : 'Right'}BusMirror`, [0.12, h * 0.18, l * 0.08], [side * w * 0.58, rootY + h * 0.66, -l * 0.43], dark, { material: 'Metal' });
      addBodyPart(`${side < 0 ? 'Left' : 'Right'}BusSideSkirt`, [0.12, h * 0.12, l * 0.72], [side * w * 0.52, rootY - h * 0.03, 0], accent, { material: 'Metal' });
    }
    addBodyPart('BusInteriorFloor', [w * 0.72, 0.08, l * 0.56], [0, rootY + h * 0.28, 0], dark, { material: 'Fabric' });
    addBodyPart('BusDashboard', [w * 0.65, h * 0.12, l * 0.08], [0, rootY + h * 0.5, -l * 0.31], dark, { material: 'SmoothPlastic' });
    addBodyPart('BusSteeringWheel', [0.18, 0.18, 0.08], [-w * 0.22, rootY + h * 0.55, -l * 0.32], dark, { shape: 'Cylinder', rot: [0, 90, 0], material: 'Metal' });
    for (let row = 0; row < 3; row += 1) {
      for (const side of [-1, 1]) {
        const x = side * w * 0.22;
        const z = -l * 0.1 + row * l * 0.16;
        addBodyPart(`BusSeatCushion${row}_${side < 0 ? 'L' : 'R'}`, [w * 0.18, h * 0.08, l * 0.08], [x, rootY + h * 0.38, z], accent, { material: 'Fabric' });
        addBodyPart(`BusSeatBack${row}_${side < 0 ? 'L' : 'R'}`, [w * 0.18, h * 0.22, 0.08], [x, rootY + h * 0.48, z + l * 0.04], accent, { material: 'Fabric' });
      }
    }
    addBodyPart('BusFrontGrille', [w * 0.5, h * 0.16, 0.12], [0, rootY + h * 0.15, -l * 0.43], dark, { material: 'Metal' });
    addBodyPart('BusHeadlights', [w * 0.66, h * 0.08, 0.1], [0, rootY + h * 0.24, -l * 0.44], glow, { material: 'Neon' });
    addBodyPart('BusTailLights', [w * 0.64, h * 0.08, 0.1], [0, rootY + h * 0.24, l * 0.43], glow, { material: 'Neon' });
    addBodyPart('BusRearBumper', [w * 0.9, h * 0.12, 0.14], [0, rootY + h * 0.02, l * 0.45], accent, { material: 'Metal' });
    return;
  }

  addBodyPart('CarLowerBody', [w, h * 0.36, l * 0.74], [0, rootY + 0.1, 0], primary, { material: 'SmoothPlastic' });
  addBodyPart('CarFrontNose', [w * 0.76, h * 0.22, l * 0.16], [0, rootY + h * 0.12, -l * 0.42], primary, { material: 'SmoothPlastic' });
  addBodyPart('CarRearTrunkBlock', [w * 0.76, h * 0.2, l * 0.16], [0, rootY + h * 0.2, l * 0.39], primary, { material: 'SmoothPlastic' });
  addBodyPart('CarHood', [w * 0.82, h * 0.16, l * 0.24], [0, rootY + h * 0.34, -l * 0.31], primary, { material: 'SmoothPlastic' });
  addBodyPart('CarRearDeck', [w * 0.78, h * 0.16, l * 0.22], [0, rootY + h * 0.34, l * 0.28], primary, { material: 'SmoothPlastic' });
  addBodyPart('CarCabinFrame', [w * 0.74, h * 0.42, l * 0.36], [0, rootY + h * 0.58, -l * 0.02], primary, { material: 'SmoothPlastic' });
  addBodyPart('CarCabinRoof', [w * 0.62, h * 0.1, l * 0.28], [0, rootY + h * 0.82, -l * 0.02], accent, { material: 'Metal' });
  addBodyPart('RoofAirScoop', [w * 0.24, h * 0.08, l * 0.14], [0, rootY + h * 0.91, -l * 0.12], accent, { material: 'Metal' });
  addBodyPart('WindshieldGlass', [w * 0.55, h * 0.24, 0.1], [0, rootY + h * 0.58, -l * 0.22], glass, { material: 'Glass', transparency: 0.22 });
  addBodyPart('RearWindowGlass', [w * 0.5, h * 0.22, 0.1], [0, rootY + h * 0.57, l * 0.16], glass, { material: 'Glass', transparency: 0.24 });
  for (const side of [-1, 1]) {
    const sideName = side < 0 ? 'Left' : 'Right';
    addBodyPart(`${sideName}SideWindowFront`, [0.1, h * 0.2, l * 0.16], [side * w * 0.37, rootY + h * 0.58, -l * 0.08], glass, { material: 'Glass', transparency: 0.24 });
    addBodyPart(`${sideName}SideWindowRear`, [0.1, h * 0.18, l * 0.15], [side * w * 0.37, rootY + h * 0.56, l * 0.1], glass, { material: 'Glass', transparency: 0.26 });
    addBodyPart(`${sideName}DoorPanel`, [0.12, h * 0.22, l * 0.3], [side * w * 0.51, rootY + h * 0.2, -l * 0.01], primary, { material: 'SmoothPlastic' });
    addBodyPart(`${sideName}DoorHandle`, [0.08, h * 0.04, l * 0.08], [side * w * 0.57, rootY + h * 0.32, -l * 0.06], accent, { material: 'Metal' });
    addBodyPart(`${sideName}Mirror`, [0.12, h * 0.1, l * 0.07], [side * w * 0.58, rootY + h * 0.52, -l * 0.28], dark, { material: 'Metal' });
    addBodyPart(`${sideName}SideSkirt`, [0.12, h * 0.08, l * 0.56], [side * w * 0.52, rootY - h * 0.03, 0], accent, { material: 'Metal' });
    addBodyPart(`${sideName}FrontWheelArch`, [0.22, h * 0.24, l * 0.19], [side * w * 0.54, rootY + h * 0.08, -l * 0.34], accent, { material: 'Metal' });
    addBodyPart(`${sideName}RearWheelArch`, [0.22, h * 0.24, l * 0.19], [side * w * 0.54, rootY + h * 0.08, l * 0.34], accent, { material: 'Metal' });
    addBodyPart(`${sideName}WideBodyFlare`, [0.18, h * 0.12, l * 0.68], [side * w * 0.57, rootY + h * 0.16, 0], accent, { material: 'Metal' });
  }
  addBodyPart('InteriorFloor', [w * 0.62, 0.08, l * 0.36], [0, rootY + h * 0.28, -l * 0.02], dark, { material: 'Fabric' });
  addBodyPart('Dashboard', [w * 0.55, h * 0.09, l * 0.08], [0, rootY + h * 0.44, -l * 0.2], dark, { material: 'SmoothPlastic' });
  addBodyPart('CenterConsole', [w * 0.12, h * 0.08, l * 0.22], [0, rootY + h * 0.37, 0], accent, { material: 'Metal' });
  addBodyPart('SteeringWheel', [0.2, 0.2, 0.08], [-w * 0.18, rootY + h * 0.49, -l * 0.2], dark, { shape: 'Cylinder', rot: [0, 90, 0], material: 'Metal' });
  for (const [seatName, x, z] of [
    ['Driver', -w * 0.18, -l * 0.05],
    ['FrontPassenger', w * 0.18, -l * 0.05],
    ['RearLeftPassenger', -w * 0.18, l * 0.13],
    ['RearRightPassenger', w * 0.18, l * 0.13],
  ] as Array<[string, number, number]>) {
    addBodyPart(`${seatName}SeatCushion`, [w * 0.18, h * 0.07, l * 0.1], [x, rootY + h * 0.34, z], accent, { material: 'Fabric' });
    addBodyPart(`${seatName}SeatBack`, [w * 0.18, h * 0.22, 0.08], [x, rootY + h * 0.45, z + l * 0.04], accent, { material: 'Fabric' });
    addBodyPart(`${seatName}Headrest`, [w * 0.12, h * 0.08, 0.06], [x, rootY + h * 0.6, z + l * 0.055], dark, { material: 'Fabric' });
  }
  addBodyPart('FrontGrille', [w * 0.5, h * 0.14, 0.12], [0, rootY + h * 0.13, -l * 0.41], dark, { material: 'Metal' });
  addBodyPart('FrontSplitter', [w * 0.88, h * 0.06, 0.18], [0, rootY - h * 0.03, -l * 0.43], accent, { material: 'Metal' });
  addBodyPart('LeftHeadlightBlock', [w * 0.24, h * 0.09, 0.1], [-w * 0.24, rootY + h * 0.24, -l * 0.43], glow, { material: 'Neon' });
  addBodyPart('RightHeadlightBlock', [w * 0.24, h * 0.09, 0.1], [w * 0.24, rootY + h * 0.24, -l * 0.43], glow, { material: 'Neon' });
  addBodyPart('LeftTailLightBlock', [w * 0.2, h * 0.09, 0.1], [-w * 0.26, rootY + h * 0.23, l * 0.43], glow, { material: 'Neon' });
  addBodyPart('RightTailLightBlock', [w * 0.2, h * 0.09, 0.1], [w * 0.26, rootY + h * 0.23, l * 0.43], glow, { material: 'Neon' });
  addBodyPart('RearBumper', [w * 0.88, h * 0.1, 0.14], [0, rootY + h * 0.02, l * 0.43], accent, { material: 'Metal' });
  addBodyPart('RearLicensePlate', [w * 0.24, h * 0.08, 0.08], [0, rootY + h * 0.18, l * 0.455], glow, { material: 'Neon', transparency: 0.15 });
  addBodyPart('HoodAccentStripe', [w * 0.18, h * 0.04, l * 0.24], [0, rootY + h * 0.44, -l * 0.31], accent, { material: 'Metal' });
  addBodyPart('RearSpoilerDeck', [w * 0.78, h * 0.06, l * 0.08], [0, rootY + h * 0.58, l * 0.38], accent, { material: 'Metal' });
  addBodyPart('RearSpoilerLeftPost', [w * 0.05, h * 0.22, l * 0.04], [-w * 0.28, rootY + h * 0.47, l * 0.35], accent, { material: 'Metal' });
  addBodyPart('RearSpoilerRightPost', [w * 0.05, h * 0.22, l * 0.04], [w * 0.28, rootY + h * 0.47, l * 0.35], accent, { material: 'Metal' });
}

function addVehicleSeats(args: {
  scene: RobloxBuildSceneNode[]; folders: Record<string, string>; rootId: string; profile: VehicleProfile;
  rootY: number; width: number; length: number; accent: Record<string, unknown>;
  cf: (x: number, y: number, z: number, rot?: [number, number, number]) => Record<string, unknown>;
  ref: (id: string) => Record<string, unknown>;
  weldToRoot: (partId: string, name: string) => void;
}): void {
  const { scene, folders, rootId, profile, rootY, width, length, accent, cf, ref, weldToRoot } = args;
  const driveSeatId = uuidv4();
  const physicalSeatTransparency = 1;
  const seatY = profile.type === 'bus'
    ? rootY + profile.size[1] * 0.36
    : rootY + Math.min(0.62, profile.size[1] * 0.24);
  const driverX = (profile.type === 'car' || profile.type === 'bus') ? -Math.min(width * 0.18, 1.25) : 0;
  const driverZ = profile.type === 'bus' ? -length * 0.28 : -length * 0.14;
  scene.push({
    id: driveSeatId,
    className: 'VehicleSeat',
    name: 'DriveSeat',
    parentId: folders.seats,
    properties: {
      Size: vector3(1.55, 0.34, 1.55),
      CFrame: cf(driverX, seatY, driverZ),
      Anchored: false,
      CanCollide: false,
      Massless: true,
      Transparency: physicalSeatTransparency,
      Color: accent,
      MaxSpeed: profile.topSpeed,
      Torque: 45000,
      TurnSpeed: profile.turnRate,
      HeadsUpDisplay: true,
    },
  });
  weldToRoot(driveSeatId, 'DriveSeatWeld');

  const passengerSeats = Math.max(0, profile.seatCount - 1);
  const explicitPassengerPositions: Array<[number, number]> = profile.type === 'car'
    ? [
        [Math.min(width * 0.18, 1.25), driverZ],
        [-Math.min(width * 0.18, 1.25), length * 0.11],
        [Math.min(width * 0.18, 1.25), length * 0.11],
      ]
    : [];
  for (let i = 0; i < passengerSeats; i += 1) {
    const row = Math.floor(i / 2);
    const side = i % 2 === 0 ? -1 : 1;
    const singleCenter = passengerSeats === 1;
    const seatId = uuidv4();
    const explicit = explicitPassengerPositions[i];
    const x = explicit ? explicit[0] : (singleCenter ? 0 : side * Math.min(width * 0.25, 2.1));
    const z = explicit ? explicit[1] : (profile.type === 'bus'
      ? -length * 0.08 + row * 1.45
      : Math.min(length * 0.3, 0.9 + row * 1.12));
    scene.push({
      id: seatId,
      className: 'Seat',
      name: `PassengerSeat${i + 1}`,
      parentId: folders.seats,
      properties: {
        Size: vector3(1.45, 0.32, 1.45),
        CFrame: cf(x, seatY, z),
        Anchored: false,
        CanCollide: false,
        Massless: true,
        Transparency: physicalSeatTransparency,
        Color: accent,
        Disabled: false,
      },
    });
    weldToRoot(seatId, `PassengerSeat${i + 1}Weld`);
  }
}

function addVehiclePhysics(args: {
  scene: RobloxBuildSceneNode[]; folders: Record<string, string>; rootId: string; profile: VehicleProfile;
  rootY: number; width: number; length: number; accent: Record<string, unknown>; dark: Record<string, unknown>;
  cf: (x: number, y: number, z: number, rot?: [number, number, number]) => Record<string, unknown>;
  ref: (id: string) => Record<string, unknown>;
  addPart: (name: string, parentId: string, size: [number, number, number], pos: [number, number, number], color: Record<string, unknown>, options?: {
    className?: string; material?: string; shape?: 'Block' | 'Cylinder' | 'Ball'; rot?: [number, number, number]; canCollide?: boolean; transparency?: number; massless?: boolean; anchored?: boolean; extra?: Record<string, unknown>;
  }) => string;
}): void {
  const { scene, folders, rootId, profile, rootY, width, length, accent, dark, cf, ref, addPart } = args;
  const rootAttachmentId = uuidv4();
  scene.push({ id: rootAttachmentId, className: 'Attachment', name: 'VehicleRootAttachment', parentId: rootId, properties: { CFrame: cf(0, 0, 0) } });

  if (profile.wheelCount > 0) {
    const stableLandMode = profile.driveMode === 'land_wheels' || profile.driveMode === 'tracked';
    if (stableLandMode) {
      const colliderId = addPart(
        'StableGroundCollider',
        folders.physics,
        [width * 0.72, 0.26, length * 0.58],
        [0, Math.max(0.16, profile.wheelRadius * 0.18), 0],
        dark,
        { material: 'SmoothPlastic', canCollide: true, massless: false, transparency: 1 },
      );
      scene.push({
        id: uuidv4(),
        className: 'WeldConstraint',
        name: 'StableGroundColliderWeld',
        parentId: colliderId,
        properties: { Part0: ref(rootId), Part1: ref(colliderId) },
      });
    }
    const zPositions = profile.wheelCount <= 2
      ? [-length * 0.36, length * 0.34]
      : profile.wheelCount === 3
        ? [-length * 0.34, length * 0.28, 0]
        : profile.wheelCount === 6
          ? [-length * 0.34, 0, length * 0.34]
          : [-length * 0.34, length * 0.34];
    const sidePositions = profile.wheelCount === 2 || profile.wheelCount === 3 ? [0] : [-1, 1];
    let wheelIndex = 0;
    for (const z of zPositions) {
      for (const side of sidePositions) {
        if (wheelIndex >= profile.wheelCount) break;
        const x = side === 0 ? 0 : side * width * 0.48;
        const wheelY = Math.max(profile.wheelRadius, 0.45);
        const wheelId = addPart(
          `Wheel${wheelIndex + 1}`,
          folders.wheels,
          [profile.wheelRadius * 0.55, profile.wheelRadius * 2, profile.wheelRadius * 2],
          [x, wheelY, z],
          dark,
          { shape: 'Cylinder', rot: [0, 0, 90], material: 'SmoothPlastic', canCollide: !stableLandMode, massless: stableLandMode },
        );
        const rootAtt = uuidv4();
        const wheelAtt = uuidv4();
        scene.push(
          { id: rootAtt, className: 'Attachment', name: `Wheel${wheelIndex + 1}RootAttachment`, parentId: rootId, properties: { CFrame: cf(x, wheelY - rootY, z) } },
          { id: wheelAtt, className: 'Attachment', name: `Wheel${wheelIndex + 1}Attachment`, parentId: wheelId, properties: { CFrame: cf(0, 0, 0) } },
          {
            id: uuidv4(),
            className: 'HingeConstraint',
            name: `${z < 0 ? 'Steer' : 'Drive'}Wheel${wheelIndex + 1}`,
            parentId: folders.physics,
            properties: {
              Attachment0: ref(rootAtt),
              Attachment1: ref(wheelAtt),
              ActuatorType: enumValue('ActuatorType', z < 0 && profile.driveMode === 'land_wheels' ? 'Servo' : 'Motor'),
              AngularVelocity: 0,
              MotorMaxTorque: 52000,
              ServoMaxTorque: 34000,
              AngularSpeed: 12,
              TargetAngle: 0,
              LimitsEnabled: false,
            },
          },
        );
        wheelIndex += 1;
      }
    }
  }

  scene.push(
    {
      id: uuidv4(),
      className: 'LinearVelocity',
      name: 'VehicleLinearVelocityAssist',
      parentId: folders.physics,
      properties: {
        Attachment0: ref(rootAttachmentId),
        Enabled: false,
        MaxForce: 125000,
        VectorVelocity: vector3(0, 0, 0),
        RelativeTo: enumValue('ActuatorRelativeTo', 'World'),
      },
    },
    {
      id: uuidv4(),
      className: 'VectorForce',
      name: 'VehicleLiftForce',
      parentId: folders.physics,
      properties: {
        Attachment0: ref(rootAttachmentId),
        Enabled: false,
        Force: vector3(0, 0, 0),
        RelativeTo: enumValue('ActuatorRelativeTo', 'World'),
        ApplyAtCenterOfMass: true,
      },
    },
    {
      id: uuidv4(),
      className: 'AlignOrientation',
      name: 'VehicleOrientationAssist',
      parentId: folders.physics,
      properties: {
        Attachment0: ref(rootAttachmentId),
        Enabled: false,
        Responsiveness: 12,
        MaxTorque: 125000,
      },
    },
  );

  if (profile.type === 'helicopter') {
    const rotorDiscId = addPart('RotorBlurDisc', folders.physics, [width * 1.15, 0.04, width * 1.15], [0, rootY + profile.size[1] * 0.82, -length * 0.04], accent, { shape: 'Cylinder', material: 'Glass', transparency: 0.62 });
    scene.push({ id: uuidv4(), className: 'WeldConstraint', name: 'RotorBlurWeld', parentId: rotorDiscId, properties: { Part0: ref(rootId), Part1: ref(rotorDiscId) } });
  }
}

function addVehicleEffects(args: {
  scene: RobloxBuildSceneNode[]; folders: Record<string, string>; rootId: string; profile: VehicleProfile;
  rootY: number; width: number; length: number; glowRgb: { r: number; g: number; b: number };
  cf: (x: number, y: number, z: number, rot?: [number, number, number]) => Record<string, unknown>;
  numberRange: (min: number, max: number) => Record<string, unknown>;
  numberSequence: (value: number) => Record<string, unknown>;
  colorSequence: (rgb: { r: number; g: number; b: number }) => Record<string, unknown>;
}): void {
  const { scene, folders, rootId, profile, rootY, width, length, glowRgb, cf, numberRange, numberSequence, colorSequence } = args;
  const addEmitter = (attachmentName: string, name: string, pos: [number, number, number], rate: number, speed: [number, number], color = glowRgb): void => {
    const attId = uuidv4();
    scene.push(
      { id: attId, className: 'Attachment', name: attachmentName, parentId: rootId, properties: { CFrame: cf(pos[0], pos[1] - rootY, pos[2]) } },
      {
        id: uuidv4(),
        className: 'ParticleEmitter',
        name,
        parentId: attId,
        properties: {
          Enabled: false,
          Rate: rate,
          Lifetime: numberRange(0.25, 0.9),
          Speed: numberRange(speed[0], speed[1]),
          Size: numberSequence(0.55),
          Color: colorSequence(color),
          LightEmission: 0.25,
        },
      },
    );
  };
  addEmitter('ExhaustAttachmentL', 'ExhaustSmokeL', [-width * 0.22, rootY + 0.05, length * 0.46], 12, [2, 8], { r: 0.55, g: 0.55, b: 0.55 });
  addEmitter('ExhaustAttachmentR', 'ExhaustSmokeR', [width * 0.22, rootY + 0.05, length * 0.46], 12, [2, 8], { r: 0.55, g: 0.55, b: 0.55 });
  addEmitter('LeftTrailAttachment', profile.driveMode === 'watercraft' ? 'BoatWakeL' : profile.driveMode === 'hover' ? 'ThrusterTrailL' : 'WheelDustL', [-width * 0.42, 0.45, length * 0.22], 18, [4, 12]);
  addEmitter('RightTrailAttachment', profile.driveMode === 'watercraft' ? 'BoatWakeR' : profile.driveMode === 'hover' ? 'ThrusterTrailR' : 'WheelDustR', [width * 0.42, 0.45, length * 0.22], 18, [4, 12]);
  if (profile.driveMode === 'aircraft' || profile.driveMode === 'rotorcraft') {
    addEmitter('AirTrailAttachmentL', 'AirTrailL', [-width * 0.48, rootY + 0.2, length * 0.1], 10, [8, 18], { r: 0.82, g: 0.9, b: 1.0 });
    addEmitter('AirTrailAttachmentR', 'AirTrailR', [width * 0.48, rootY + 0.2, length * 0.1], 10, [8, 18], { r: 0.82, g: 0.9, b: 1.0 });
  }
  scene.push({
    id: uuidv4(),
    className: 'PointLight',
    name: 'VehicleGlow',
    parentId: rootId,
    properties: {
      Enabled: false,
      Brightness: 1.8,
      Range: 16,
      Color: color3(glowRgb.r, glowRgb.g, glowRgb.b),
    },
  });
}

function buildVehicleControllerScript(): string {
  return `
local RunService = game:GetService("RunService")
local Players = game:GetService("Players")

local Vehicle = script.Parent
local Config = Vehicle:FindFirstChild("VehicleConfig")
local Root = Vehicle:FindFirstChild("ChassisRoot")
local DriveSeat = Vehicle:FindFirstChild("DriveSeat", true)

if not Root or not DriveSeat or not DriveSeat:IsA("VehicleSeat") then
\twarn("[VehicleController] Missing ChassisRoot or DriveSeat")
\treturn
end

local function cfg(name, fallback)
\tlocal value = Config and Config:FindFirstChild(name)
\tif value and value:IsA("ValueBase") then
\t\treturn value.Value
\tend
\treturn fallback
end

local VEHICLE_TYPE = tostring(cfg("VehicleType", "car"))
local DRIVE_MODE = tostring(cfg("DriveMode", "land_wheels"))
local TOP_SPEED = tonumber(cfg("TopSpeed", 70)) or 70
local ACCEL = tonumber(cfg("Acceleration", 28)) or 28
local TURN_RATE = tonumber(cfg("TurnRate", 2.0)) or 2.0
local WHEEL_RADIUS = math.max(tonumber(cfg("WheelRadius", 0.8)) or 0.8, 0.2)
local DIRECT_WHEEL_MODE = DRIVE_MODE == "land_wheels"

local engine = Root:FindFirstChild("EngineLoop")
local boostSound = Root:FindFirstChild("BoostOrHorn")
local glow = Root:FindFirstChild("VehicleGlow")
local emitters = {}
local driveHinges = {}
local steerHinges = {}
local passengerSeats = {}
local assemblyParts = {}

for _, inst in ipairs(Vehicle:GetDescendants()) do
\tif inst:IsA("BasePart") then
\t\ttable.insert(assemblyParts, inst)
\tend
\tif inst:IsA("ParticleEmitter") then
\t\ttable.insert(emitters, inst)
\telseif inst:IsA("HingeConstraint") then
\t\tif inst.Name:find("Steer") then
\t\t\ttable.insert(steerHinges, inst)
\t\telse
\t\t\ttable.insert(driveHinges, inst)
\t\tend
\telseif inst:IsA("Seat") and not inst:IsA("VehicleSeat") then
\t\ttable.insert(passengerSeats, inst)
\tend
end

local currentDriver = nil
local function setNetworkOwnerForDriver(humanoid)
\tlocal player = nil
\tif humanoid and humanoid.Parent then
\t\tplayer = Players:GetPlayerFromCharacter(humanoid.Parent)
\tend
\tcurrentDriver = player
\tfor _, part in ipairs(assemblyParts) do
\t\tpcall(function()
\t\t\tif part:CanSetNetworkOwnership() then
\t\t\t\tif player then
\t\t\t\t\tpart:SetNetworkOwner(player)
\t\t\t\telse
\t\t\t\t\tpart:SetNetworkOwnershipAuto()
\t\t\t\tend
\t\t\tend
\t\tend)
\tend
\tpcall(function()
\t\tif Root:CanSetNetworkOwnership() then
\t\t\tif player then
\t\t\t\tRoot:SetNetworkOwner(player)
\t\t\telse
\t\t\t\tRoot:SetNetworkOwnershipAuto()
\t\t\tend
\t\tend
\tend)
\tif engine then
\t\tif player and not engine.IsPlaying then engine:Play() end
\t\tif not player then engine:Stop() end
\tend
\tVehicle:SetAttribute("DriverUserId", player and player.UserId or 0)
end

DriveSeat:GetPropertyChangedSignal("Occupant"):Connect(function()
\tsetNetworkOwnerForDriver(DriveSeat.Occupant)
end)
setNetworkOwnerForDriver(DriveSeat.Occupant)

local function flatLook(cframe)
\tlocal look = cframe.LookVector
\tlocal flat = Vector3.new(look.X, 0, look.Z)
\tif flat.Magnitude < 0.001 then return Vector3.new(0, 0, -1) end
\treturn flat.Unit
end

RunService.Heartbeat:Connect(function(dt)
\tlocal throttle = DriveSeat.ThrottleFloat
\tlocal steer = DriveSeat.SteerFloat
\tif math.abs(throttle) < 0.05 then throttle = 0 end
\tif math.abs(steer) < 0.08 then steer = 0 end
\tlocal occupied = DriveSeat.Occupant ~= nil
\tlocal current = Root.AssemblyLinearVelocity
\tlocal horizontal = Vector3.new(current.X, 0, current.Z)
\tlocal speed = horizontal.Magnitude
\tlocal speed01 = math.clamp(speed / math.max(TOP_SPEED, 1), 0, 1)
\tlocal active = occupied and (math.abs(throttle) > 0.03 or speed > 1)
\tlocal cf = Root.CFrame
\tlocal forward = flatLook(cf)

\tfor _, hinge in ipairs(driveHinges) do
\t\tif DIRECT_WHEEL_MODE then
\t\t\thinge.MotorMaxTorque = 0
\t\t\thinge.AngularVelocity = 0
\t\telse
\t\t\thinge.MotorMaxTorque = occupied and 52000 or 0
\t\t\thinge.AngularVelocity = occupied and (-throttle * TOP_SPEED / WHEEL_RADIUS) or 0
\t\tend
\tend
\tfor _, hinge in ipairs(steerHinges) do
\t\tif DIRECT_WHEEL_MODE then
\t\t\thinge.ServoMaxTorque = 0
\t\t\thinge.TargetAngle = 0
\t\telse
\t\t\thinge.ServoMaxTorque = occupied and 34000 or 0
\t\t\thinge.TargetAngle = (occupied and steer or 0) * (DRIVE_MODE == "tracked" and 30 or 24)
\t\tend
\tend

\tif occupied then
\t\tlocal target
\t\tif DRIVE_MODE == "aircraft" then
\t\t\tlocal lift = math.max(0, throttle) * TOP_SPEED * 0.22 + math.max(0, speed01 - 0.25) * 12
\t\t\ttarget = forward * (math.max(throttle, 0) * TOP_SPEED) + Vector3.new(0, lift, 0)
\t\telseif DRIVE_MODE == "rotorcraft" then
\t\t\ttarget = forward * (math.max(throttle, 0) * TOP_SPEED * 0.45) + Vector3.new(0, throttle * TOP_SPEED * 0.42, 0)
\t\telseif DRIVE_MODE == "hover" then
\t\t\ttarget = forward * (throttle * TOP_SPEED) + Vector3.new(0, math.sin(os.clock() * 2) * 1.6, 0)
\t\telseif DRIVE_MODE == "watercraft" then
\t\t\ttarget = forward * (throttle * TOP_SPEED) + Vector3.new(0, math.clamp(current.Y, -4, 4), 0)
\t\telse
\t\t\tlocal forwardSpeed = horizontal:Dot(forward)
\t\t\tlocal lateral = horizontal - forward * forwardSpeed
\t\t\tlocal desiredForwardSpeed = throttle * TOP_SPEED
\t\t\tlocal accelRate = ACCEL
\t\t\tif math.abs(throttle) < 0.03 then
\t\t\t\tdesiredForwardSpeed = 0
\t\t\t\taccelRate = ACCEL * 1.25
\t\t\telseif math.abs(desiredForwardSpeed) < math.abs(forwardSpeed) then
\t\t\t\taccelRate = ACCEL * 1.85
\t\t\tend
\t\t\tlocal delta = math.clamp(desiredForwardSpeed - forwardSpeed, -accelRate * dt, accelRate * dt)
\t\t\tlocal nextForwardSpeed = forwardSpeed + delta
\t\t\tlocal lateralKeep = lateral * math.max(0, 1 - math.clamp(dt * 9, 0, 1))
\t\t\tlocal nextHorizontal = forward * nextForwardSpeed + lateralKeep
\t\t\tlocal maxHorizontal = TOP_SPEED * 1.08
\t\t\tif nextHorizontal.Magnitude > maxHorizontal then
\t\t\t\tnextHorizontal = nextHorizontal.Unit * maxHorizontal
\t\t\tend
\t\t\ttarget = Vector3.new(nextHorizontal.X, current.Y, nextHorizontal.Z)
\t\t\tRoot.AssemblyLinearVelocity = target
\t\t\tlocal canPivot = DRIVE_MODE == "tracked" or math.abs(nextForwardSpeed) > 3
\t\t\tif canPivot and steer ~= 0 then
\t\t\t\tlocal reverseFactor = nextForwardSpeed < -1 and -1 or 1
\t\t\t\tlocal steerScale = DRIVE_MODE == "tracked" and 1.25 or math.clamp((math.abs(nextForwardSpeed) - 2) / 22, 0, 0.85)
\t\t\t\tRoot.AssemblyAngularVelocity = Vector3.new(0, -steer * TURN_RATE * steerScale * reverseFactor, 0)
\t\t\telse
\t\t\t\tRoot.AssemblyAngularVelocity = Root.AssemblyAngularVelocity:Lerp(Vector3.zero, math.clamp(dt * 12, 0, 1))
\t\t\tend
\t\t\ttarget = nil
\t\tend
\t\tif target then
\t\t\tlocal alpha = math.clamp(dt * (ACCEL / 13), 0, 0.35)
\t\t\tRoot.AssemblyLinearVelocity = current:Lerp(target, alpha)
\t\t\tif steer ~= 0 then
\t\t\t\tlocal yawBoost = DRIVE_MODE == "tracked" and 1.35 or 1.0
\t\t\t\tRoot.AssemblyAngularVelocity = Vector3.new(0, -steer * TURN_RATE * yawBoost, 0)
\t\t\telse
\t\t\t\tRoot.AssemblyAngularVelocity = Root.AssemblyAngularVelocity:Lerp(Vector3.zero, math.clamp(dt * 4, 0, 1))
\t\t\tend
\t\tend
\telse
\t\tRoot.AssemblyAngularVelocity = Root.AssemblyAngularVelocity:Lerp(Vector3.zero, math.clamp(dt * 2, 0, 1))
\tend

\tif engine then
\t\tengine.Volume = occupied and (0.18 + speed01 * 0.55 + math.abs(throttle) * 0.15) or 0
\t\tengine.PlaybackSpeed = 0.72 + speed01 * 0.85 + math.abs(throttle) * 0.15
\t\tif occupied and not engine.IsPlaying then engine:Play() end
\tend
\tif boostSound and occupied and math.abs(throttle) > 0.95 and speed01 > 0.55 and not boostSound.IsPlaying then
\t\tboostSound:Play()
\tend
\tif glow then glow.Enabled = occupied and (DRIVE_MODE == "hover" or speed01 > 0.18) end
\tfor _, emitter in ipairs(emitters) do
\t\temitter.Enabled = occupied and (active or speed01 > 0.12)
\t\temitter.Rate = (active and 10 or 0) + speed01 * 28
\tend
\tlocal passengerCount = 0
\tfor _, seat in ipairs(passengerSeats) do
\t\tif seat.Occupant then passengerCount += 1 end
\tend
\tVehicle:SetAttribute("PassengerCount", passengerCount)
\tVehicle:SetAttribute("Speed", math.floor(speed + 0.5))
\tVehicle:SetAttribute("VehicleType", VEHICLE_TYPE)
end)

print("[VehicleController] Ready:", Vehicle.Name, VEHICLE_TYPE, DRIVE_MODE)
`;
}

// ---------------------------------------------------------------------------
// Track 3 Phase 2 (Blocky Pet) — assemble an .rbxm Model from a BlockyPetSpec.
// Output structure:
//   Model "Pet_{name}"  (PrimaryPart = HumanoidRootPart)
//     Configuration "PetConfig" (Species/Rarity/Element/Level/XP/etc.)
//     Part "HumanoidRootPart" (invisible driver — anchored=false, massless=true)
//     Part "{name}" × N   (each spec.parts[i] becomes a Part child of the model)
//     Motor6D × J         (each spec.joints[j] welds part0 → part1)
//     AnimationController
//       Animation "Idle"  (Inline KeyframeSequence asset emitted by anim stage)
//       Animation "Walk"
//       [Animation "Fly"] (only if isFlying)
//     Script "PetFollowScript"
//     ModuleScript "PetLevelingModule"
//
// Animation IDs are filled by index.ts after the Lune build_animation pass
// stores each KeyframeSequence as a child of the Animation node (Studio's
// animator picks it up by descendant lookup; no external upload needed for
// offline play). If upload_roblox succeeded the Animation.AnimationId field
// gets the rbxassetid:// URL instead.
// ---------------------------------------------------------------------------
function buildBlockyPetManifest(
  args: {
    title: string;
    summary: string;
    target: RobloxBuildTarget;
    prompt: string;
    starterScript: string;
    metadata?: Record<string, unknown>;
  },
  metadata: Record<string, unknown>,
): RobloxBuildManifest {
  const specRaw = metadata.blockyPetSpec;
  if (!specRaw || typeof specRaw !== 'object') {
    throw new Error('buildBlockyPetManifest: metadata.blockyPetSpec is required');
  }
  const spec = specRaw as BlockyPetSpec;
  const baseName = sanitizeIdentifier(spec.name || args.title || 'Pet');
  const rarity = typeof metadata.petRarity === 'string' ? metadata.petRarity : 'Rare';
  const element = typeof metadata.petElement === 'string' ? metadata.petElement : 'Neutral';
  const speciesType = typeof metadata.petSpeciesType === 'string' ? metadata.petSpeciesType : 'fantasy';
  const skeletonType = typeof metadata.petSkeletonType === 'string' ? metadata.petSkeletonType : 'quadruped';
  const isFlying = !!metadata.petIsFlying;
  const coinBonusBase = rarityCoinBonus(rarity);
  const animationAssetIds = (metadata.blockyPetAnimationAssetIds as Record<string, string> | undefined) ?? {};

  const petModelId = uuidv4();
  const configId = uuidv4();
  const acId = uuidv4();
  const hrpId = uuidv4();

  const scene: RobloxBuildSceneNode[] = [
    {
      id: petModelId,
      className: 'Model',
      name: `Pet_${baseName}`,
      parentId: 'WorkspaceRoot',
    },
    {
      id: configId,
      className: 'Configuration',
      name: 'PetConfig',
      parentId: petModelId,
    },
    childStringValue(configId, 'SpeciesType', speciesType),
    childStringValue(configId, 'SkeletonType', skeletonType),
    childStringValue(configId, 'Rarity', rarity),
    childStringValue(configId, 'Element', element),
    childBoolValue(configId, 'IsFlying', isFlying),
    childIntValue(configId, 'Level', 1),
    childIntValue(configId, 'XP', 0),
    childIntValue(configId, 'EvolutionStage', 1),
    childNumberValue(configId, 'CoinBonusBase', coinBonusBase),
    childStringValue(configId, 'BlockyRig', spec.rig),
    {
      id: hrpId,
      className: 'Part',
      name: 'HumanoidRootPart',
      parentId: petModelId,
      properties: {
        Transparency: 1,
        Anchored: false,
        CanCollide: false,
        Massless: true,
        Size: { __type: 'Vector3', x: 2, y: 2, z: 2 },
      },
    },
  ];

  // Map "primary"/"secondary"/"accent"/"eye" slots → actual BrickColor names.
  const colorSlot = (slot: string): string => {
    if (slot === 'primary') return spec.colors.primary;
    if (slot === 'secondary') return spec.colors.secondary ?? spec.colors.primary;
    if (slot === 'accent') return spec.colors.accent ?? spec.colors.primary;
    if (slot === 'eye') return spec.colors.eye ?? 'Really black';
    return slot; // literal BrickColor name
  };

  // Map BlockyPartShape → Roblox Part class + Shape enum (when applicable).
  const partNameToId = new Map<string, string>();
  partNameToId.set('HumanoidRootPart', hrpId);
  for (const p of spec.parts) {
    const partId = uuidv4();
    partNameToId.set(p.name, partId);
    const isCylinder = p.shape === 'Cylinder';
    const isBall = p.shape === 'Ball';
    const isWedge = p.shape === 'Wedge' || p.shape === 'CornerWedge';
    const className = isWedge ? (p.shape === 'CornerWedge' ? 'CornerWedgePart' : 'WedgePart') : 'Part';
    const props: Record<string, unknown> = {
      Anchored: false,
      CanCollide: false,
      Massless: true,
      Size: { __type: 'Vector3', x: p.size[0], y: p.size[1], z: p.size[2] },
      BrickColor: { __type: 'BrickColor', name: colorSlot(p.color) },
      Material: { __type: 'EnumItem', enum: 'Material', value: p.material ?? spec.material },
      CFrame: {
        __type: 'CFrame',
        position: { x: p.position[0], y: p.position[1], z: p.position[2] },
        rotation: p.rotation ?? [0, 0, 0],
      },
    };
    if (!isWedge) {
      if (isBall) props.Shape = { __type: 'EnumItem', enum: 'PartType', value: 'Ball' };
      else if (isCylinder) props.Shape = { __type: 'EnumItem', enum: 'PartType', value: 'Cylinder' };
      else props.Shape = { __type: 'EnumItem', enum: 'PartType', value: 'Block' };
    }
    scene.push({
      id: partId,
      className,
      name: p.name,
      parentId: petModelId,
      properties: props,
    });

    // Attach decals if any target this part. The texture id is filled in at
    // generation time after Open Cloud upload — otherwise the Decal ships
    // with an empty Texture (Studio shows it as a placeholder).
    const decalsForPart = (spec.decals ?? []).filter((d) => d.part === p.name);
    for (const d of decalsForPart) {
      scene.push({
        id: uuidv4(),
        className: 'Decal',
        name: `${p.name}_${d.face}_Decal`,
        parentId: partId,
        properties: {
          Face: { __type: 'EnumItem', enum: 'NormalId', value: d.face },
          Texture: d.textureId ?? '',
        },
      });
    }
  }

  // PrimaryPart = HumanoidRootPart (already at scene[2] virtually — Lune
  // builder reads Model.PrimaryPart by attribute name lookup; we surface it
  // via a marker StringValue so build_roblox.luau wires it on assemble).
  scene.push({
    id: uuidv4(),
    className: 'StringValue',
    name: '_PrimaryPartName',
    parentId: petModelId,
    properties: { Value: 'HumanoidRootPart' },
  });

  // Motor6D joints. Each joint references two parts by name; the manifest
  // stores the cross-instance handles via InstanceRef property type that
  // build_roblox.luau resolves through instanceMap. C0 = at part0's pivot,
  // C1 = at part1's pivot — both default to identity (which keeps each part
  // at its authored CFrame; animations drive Motor.Transform).
  for (const j of spec.joints) {
    const part0Id = partNameToId.get(j.part0);
    const part1Id = partNameToId.get(j.part1);
    if (!part0Id || !part1Id) continue; // validated upstream — defensive
    scene.push({
      id: uuidv4(),
      className: 'Motor6D',
      name: j.name,
      parentId: part1Id, // Motor6D conventionally parented to the child Part
      properties: {
        Part0: { __type: 'InstanceRef', refId: part0Id },
        Part1: { __type: 'InstanceRef', refId: part1Id },
      },
    });
  }

  // AnimationController + Animation children for Idle / Walk / Fly. The
  // animation-stage in index.ts populates animationAssetIds (rbxassetid://
  // strings after Open Cloud upload) or attaches a KeyframeSequence as a
  // child of each Animation for offline-play fallback.
  scene.push({
    id: acId,
    className: 'AnimationController',
    name: 'AnimationController',
    parentId: petModelId,
  });
  for (const trackName of (isFlying ? ['Idle', 'Walk', 'Fly'] : ['Idle', 'Walk'])) {
    scene.push({
      id: uuidv4(),
      className: 'Animation',
      name: trackName,
      parentId: acId,
      properties: { AnimationId: animationAssetIds[trackName] ?? '' },
    });
  }

  return {
    id: uuidv4(),
    title: args.title,
    summary: args.summary,
    target: 'model',
    formatPreference: 'binary',
    scene,
    scripts: [
      {
        id: uuidv4(),
        name: 'PetFollowScript',
        scriptType: 'Script',
        container: petModelId,
        source: buildBlockyPetFollowScript(),
      },
      {
        id: uuidv4(),
        name: 'PetLevelingModule',
        scriptType: 'ModuleScript',
        container: petModelId,
        source: buildPetLevelingModule(),
      },
    ],
    ui: [],
    metadata: {
      prompt: args.prompt,
      generatedBy: 'roblox-worker blocky-pet pipeline',
      isBlockyPet: true,
      petBaseName: baseName,
      petSpeciesType: speciesType,
      petSkeletonType: skeletonType,
      petRarity: rarity,
      petElement: element,
      petIsFlying: isFlying,
      blockyRig: spec.rig,
      partCount: spec.parts.length,
      jointCount: spec.joints.length,
      ...metadata,
    },
  };
}

function buildLayeredClothingAutoEquipScript(): string {
  return `
local Players = game:GetService("Players")
local clothingModel = script.Parent

local function findAccessories()
  local accessories = {}
  for _, child in pairs(clothingModel:GetChildren()) do
    if child:IsA("Accessory") then
      table.insert(accessories, child)
    end
  end
  return accessories
end

local function applyLayeredClothing(character)
  local humanoid = character:FindFirstChildOfClass("Humanoid")
  if not humanoid then
    humanoid = character:WaitForChild("Humanoid", 5)
  end
  if not humanoid then return end

  for _, accessory in pairs(findAccessories()) do
    local existing = character:FindFirstChild(accessory.Name)
    if existing and existing:IsA("Accessory") then
      existing:Destroy()
    end
    local clone = accessory:Clone()
    humanoid:AddAccessory(clone)
  end
end

local function setupPlayer(player)
  player.CharacterAdded:Connect(applyLayeredClothing)
  if player.Character then
    applyLayeredClothing(player.Character)
  end
end

for _, player in pairs(Players:GetPlayers()) do
  setupPlayer(player)
end
Players.PlayerAdded:Connect(setupPlayer)

for _, model in pairs(game.Workspace:GetChildren()) do
  if model:IsA("Model") and model:FindFirstChildOfClass("Humanoid") and model ~= clothingModel then
    applyLayeredClothing(model)
  end
end
`.trim();
}

function buildClothingMannequin(
  scene: RobloxBuildSceneNode[],
  shirtTextureUrl: string | undefined,
  pantsTextureUrl: string | undefined,
): void {
  const modelId = uuidv4();
  const rootPartId = uuidv4();

  scene.push({
    id: modelId,
    className: 'Model',
    name: 'ClothingPreview',
    parentId: 'WorkspaceRoot',
    properties: { PrimaryPart: { __type: 'Ref', value: rootPartId } },
  });

  scene.push({
    id: uuidv4(),
    className: 'Humanoid',
    name: 'Humanoid',
    parentId: modelId,
  });

  const skinColor = color3(0.8, 0.72, 0.6);

  const parts: { name: string; size: [number, number, number]; position: [number, number, number]; transparency?: number }[] = [
    { name: 'HumanoidRootPart', size: [2, 2, 1], position: [0, 3.5, 0], transparency: 1 },
    { name: 'LowerTorso', size: [2, 0.4, 1], position: [0, 2.8, 0] },
    { name: 'UpperTorso', size: [2, 1.6, 1], position: [0, 3.8, 0] },
    { name: 'Head', size: [2, 1, 1], position: [0, 5.1, 0] },
    { name: 'LeftUpperArm', size: [1, 1.2, 1], position: [-1.5, 4.1, 0] },
    { name: 'LeftLowerArm', size: [1, 1.2, 1], position: [-1.5, 2.9, 0] },
    { name: 'LeftHand', size: [1, 0.6, 1], position: [-1.5, 2.0, 0] },
    { name: 'RightUpperArm', size: [1, 1.2, 1], position: [1.5, 4.1, 0] },
    { name: 'RightLowerArm', size: [1, 1.2, 1], position: [1.5, 2.9, 0] },
    { name: 'RightHand', size: [1, 0.6, 1], position: [1.5, 2.0, 0] },
    { name: 'LeftUpperLeg', size: [1, 1.2, 1], position: [-0.5, 2.1, 0] },
    { name: 'LeftLowerLeg', size: [1, 1.2, 1], position: [-0.5, 0.9, 0] },
    { name: 'LeftFoot', size: [1, 0.4, 1], position: [-0.5, 0.0, 0] },
    { name: 'RightUpperLeg', size: [1, 1.2, 1], position: [0.5, 2.1, 0] },
    { name: 'RightLowerLeg', size: [1, 1.2, 1], position: [0.5, 0.9, 0] },
    { name: 'RightFoot', size: [1, 0.4, 1], position: [0.5, 0.0, 0] },
  ];

  const partIdMap: Record<string, string> = {};
  for (const p of parts) {
    const pid = p.name === 'HumanoidRootPart' ? rootPartId : uuidv4();
    partIdMap[p.name] = pid;
    scene.push({
      id: pid,
      className: 'Part',
      name: p.name,
      parentId: modelId,
      properties: {
        Size: vector3(p.size[0], p.size[1], p.size[2]),
        CFrame: cframe(p.position[0], p.position[1], p.position[2]),
        Color: skinColor,
        Anchored: true,
        CanCollide: false,
        ...(p.transparency != null ? { Transparency: p.transparency } : {}),
      },
    });
  }

  const joints: { name: string; part0: string; part1: string; c0: [number, number, number]; c1: [number, number, number] }[] = [
    { name: 'Root', part0: 'HumanoidRootPart', part1: 'LowerTorso', c0: [0, -0.7, 0], c1: [0, 0, 0] },
    { name: 'Waist', part0: 'LowerTorso', part1: 'UpperTorso', c0: [0, 0.2, 0], c1: [0, -0.8, 0] },
    { name: 'Neck', part0: 'UpperTorso', part1: 'Head', c0: [0, 0.8, 0], c1: [0, -0.5, 0] },
    { name: 'LeftShoulder', part0: 'UpperTorso', part1: 'LeftUpperArm', c0: [-1, 0.5, 0], c1: [0.5, 0.5, 0] },
    { name: 'LeftElbow', part0: 'LeftUpperArm', part1: 'LeftLowerArm', c0: [0, -0.6, 0], c1: [0, 0.6, 0] },
    { name: 'LeftWrist', part0: 'LeftLowerArm', part1: 'LeftHand', c0: [0, -0.6, 0], c1: [0, 0.3, 0] },
    { name: 'RightShoulder', part0: 'UpperTorso', part1: 'RightUpperArm', c0: [1, 0.5, 0], c1: [-0.5, 0.5, 0] },
    { name: 'RightElbow', part0: 'RightUpperArm', part1: 'RightLowerArm', c0: [0, -0.6, 0], c1: [0, 0.6, 0] },
    { name: 'RightWrist', part0: 'RightLowerArm', part1: 'RightHand', c0: [0, -0.6, 0], c1: [0, 0.3, 0] },
    { name: 'LeftHip', part0: 'LowerTorso', part1: 'LeftUpperLeg', c0: [-0.5, -0.2, 0], c1: [0, 0.6, 0] },
    { name: 'LeftKnee', part0: 'LeftUpperLeg', part1: 'LeftLowerLeg', c0: [0, -0.6, 0], c1: [0, 0.6, 0] },
    { name: 'LeftAnkle', part0: 'LeftLowerLeg', part1: 'LeftFoot', c0: [0, -0.6, 0], c1: [0, 0.2, 0] },
    { name: 'RightHip', part0: 'LowerTorso', part1: 'RightUpperLeg', c0: [0.5, -0.2, 0], c1: [0, 0.6, 0] },
    { name: 'RightKnee', part0: 'RightUpperLeg', part1: 'RightLowerLeg', c0: [0, -0.6, 0], c1: [0, 0.6, 0] },
    { name: 'RightAnkle', part0: 'RightLowerLeg', part1: 'RightFoot', c0: [0, -0.6, 0], c1: [0, 0.2, 0] },
  ];

  for (const j of joints) {
    scene.push({
      id: uuidv4(),
      className: 'Motor6D',
      name: j.name,
      parentId: partIdMap[j.part0],
      properties: {
        Part0: { __type: 'Ref', value: partIdMap[j.part0] },
        Part1: { __type: 'Ref', value: partIdMap[j.part1] },
        C0: cframe(j.c0[0], j.c0[1], j.c0[2]),
        C1: cframe(j.c1[0], j.c1[1], j.c1[2]),
      },
    });
  }

  if (shirtTextureUrl) {
    scene.push({
      id: uuidv4(),
      className: 'Shirt',
      name: 'Shirt',
      parentId: modelId,
      properties: { ShirtTemplate: shirtTextureUrl },
    });
  }

  if (pantsTextureUrl) {
    scene.push({
      id: uuidv4(),
      className: 'Pants',
      name: 'Pants',
      parentId: modelId,
      properties: { PantsTemplate: pantsTextureUrl },
    });
  }
}

// ── Monetization scripts-only manifest builder ──────────────────────────

export function buildMonetizationManifest(args: {
  title: string;
  summary: string;
  scripts: Array<{ name: string; scriptType: string; container: string; source: string }>;
}): RobloxBuildManifest {
  type ScriptContainer = RobloxBuildScript['container'];
  const rootName = args.title || 'Monetization Scripts';

  // 3-file architecture: Config + Server + ShopClient all in ONE folder.
  // Server Script auto-moves ShopClient (LocalScript) to StarterPlayerScripts at runtime.
  // Config is cloned to ReplicatedStorage so client can require() it.
  // Filter out any installer/readme scripts the LLM might generate despite instructions.
  const finalScripts: RobloxBuildScript[] = [];
  for (let idx = 0; idx < args.scripts.length; idx++) {
    const s = args.scripts[idx];
    if (/install|readme/i.test(s.name)) continue;

    finalScripts.push({
      id: `monetization-script-${idx}`,
      name: s.name,
      scriptType: (s.scriptType as RobloxBuildScript['scriptType']) || 'Script',
      // ALL scripts go into the root Folder (ServerScriptService maps to root in model target).
      // Scripts execute from Workspace. ModuleScript is required via script.Parent.
      container: 'ServerScriptService' as ScriptContainer,
      source: s.source,
    });
  }

  return {
    id: uuidv4(),
    title: rootName,
    summary: args.summary || 'Game Pass and Developer Product scripts',
    target: 'model',
    rootClassName: 'Folder',
    formatPreference: 'binary',
    scene: [],
    scripts: finalScripts,
    metadata: { contentCategory: 'gamepass' },
  };
}

// ── Weapon Tool manifest builder ──────────────────────────────────────

function buildWeaponToolManifest(
  args: {
    title: string;
    summary: string;
    target: RobloxBuildTarget;
    prompt: string;
    starterScript: string;
    metadata?: Record<string, unknown>;
  },
  metadata: Record<string, unknown>,
): RobloxBuildManifest {
  const toolId = uuidv4();
  const handleId = uuidv4();
  // Truncate title for Tool.Name — iOS often sends the full description as title
  // Format is usually "Title - long description", so take the part before the dash
  const shortTitle = (() => {
    const raw = (args.title || 'Generated Weapon').trim();
    const beforeDash = raw.split(/\s[-–—]\s/)[0].trim();
    if (beforeDash && beforeDash.length < raw.length) return beforeDash.slice(0, 50);
    return raw.split(/\s+/).slice(0, 5).join(' ').slice(0, 50);
  })();
  const normalizedName = sanitizeSystemName(shortTitle) || shortTitle || 'GeneratedWeapon';
  const weaponType = typeof metadata.weaponType === 'string' ? metadata.weaponType : 'melee';
  const sourceModelUrl = typeof metadata.sourceModelUrl === 'string' ? metadata.sourceModelUrl : undefined;
  const rawMeshAssetId = typeof metadata.meshAssetId === 'string' ? metadata.meshAssetId : undefined;
  // R5.8.5.7.13: bow detection for ranged weapons. Bows need vertical Handle pose,
  // different grip matrix, and bow-release sound (not gun shot).
  const bowHaystack = `${args.prompt || ''} ${shortTitle}`.toLowerCase();
  const isBow = weaponType === 'ranged' && /\bbow\b|crossbow|longbow|recurve|лук|арбалет|рекурс/i.test(bowHaystack);

  // ── User-picked colors (session #095) ──────────────────────────────
  // Defaults per weapon type (fallback when colorPicker/metadata не заданы).
  const typeDefaults = {
    melee:    { primary: { r: 0.65, g: 0.65, b: 0.7 },  accent: { r: 0.9, g: 0.9, b: 1 },    glow: { r: 0.6, g: 0.85, b: 1 } },
    ranged:   { primary: { r: 0.3, g: 0.3, b: 0.35 },   accent: { r: 0.8, g: 0.6, b: 0.2 },  glow: { r: 1, g: 0.8, b: 0.2 } },
    magic:    { primary: { r: 0.4, g: 0.2, b: 1 },      accent: { r: 0.8, g: 0.4, b: 1 },    glow: { r: 0.5, g: 0.3, b: 1 } },
    defense:  { primary: { r: 0.55, g: 0.45, b: 0.3 },  accent: { r: 0.9, g: 0.8, b: 0.4 },  glow: { r: 1, g: 0.9, b: 0.5 } },
    throwable:{ primary: { r: 0.25, g: 0.35, b: 0.2 },  accent: { r: 0.8, g: 0.4, b: 0.2 },  glow: { r: 1, g: 0.6, b: 0.2 } },
  } as const;
  const defaults = typeDefaults[weaponType as 'melee' | 'ranged' | 'magic' | 'defense' | 'throwable'] || typeDefaults.melee;
  const primaryRgb = hexToColor3(metadata.primaryColor) ?? defaults.primary;
  const accentRgb  = hexToColor3(metadata.accentColor)  ?? defaults.accent;
  const glowRgb    = hexToColor3(metadata.glowColor)    ?? defaults.glow;
  const primaryColor3 = color3(primaryRgb.r, primaryRgb.g, primaryRgb.b);
  const accentColor3  = color3(accentRgb.r,  accentRgb.g,  accentRgb.b);
  const glowColor3    = color3(glowRgb.r,    glowRgb.g,    glowRgb.b);

  // Validate meshAssetId — Roblox asset IDs are typically 8-13 digits.
  // If the pipeline returns an invalid/too-long ID, SpecialMesh FileMesh won't load
  // and the Part becomes invisible. Use default known-working meshes as fallback.
  const defaultMeshes: Record<string, { mesh: string; texture: string }> = {
    melee:  { mesh: '94840342', texture: '94840362' },   // ClassicSword mesh + texture
    ranged: { mesh: '94219391', texture: '94219470' },   // Classic gun mesh + texture
    magic:  { mesh: '94840342', texture: '94840362' },   // Reuse sword for staff
  };
  const extractedMeshId = rawMeshAssetId?.match(/\d+/)?.[0];
  const isValidMeshId = extractedMeshId && extractedMeshId.length >= 5 && extractedMeshId.length <= 16;
  const defaultMesh = defaultMeshes[weaponType] || defaultMeshes.melee;
  const meshAssetId = isValidMeshId ? extractedMeshId : defaultMesh.mesh;
  // AI meshes have baked textures; only apply default texture for fallback meshes
  const meshTextureId = isValidMeshId ? undefined : defaultMesh.texture;

  // Default TextureId (icon) per weapon type — built-in Roblox rbxasset paths.
  // Session #095 follow-up: previous code used the same id `18662154` for all three types
  // which always resolved to a sword icon. Now: use built-in Sword128.png ONLY for melee
  // fallback; for ranged/magic and any AI-mesh path, omit TextureId so Roblox uses the
  // mesh thumbnail (or default cube) instead of showing a sword icon on a gun.
  // R4.2 + R4.4 + session 278: TextureId = backpack icon. Priority:
  //   1. metadata.iconAssetId / iconImageAssetId / toolIconAssetId (uploaded 2D preview of THIS weapon).
  //   2. Default per weaponType (HyperlaserGun icon for ranged, Sword128 for melee).
  // Without icon, Roblox falls back to raw text "WeaponName" (AI mesh is runtime-loaded,
  // not inspectable at manifest time).
  const userIconAssetId = typeof metadata.iconImageAssetId === 'string'
    ? metadata.iconImageAssetId
    : typeof metadata.toolIconAssetId === 'string'
      ? metadata.toolIconAssetId
      : typeof metadata.iconAssetId === 'string'
        ? metadata.iconAssetId
        : undefined;
  const extractedIconId = userIconAssetId?.match(/\d+/)?.[0];
  const isValidIconId = extractedIconId && extractedIconId.length >= 5 && extractedIconId.length <= 16;
  const defaultTextureIds: Record<string, string | undefined> = {
    melee:  'rbxasset://Textures/Sword128.png',
    ranged: 'http://www.roblox.com/asset/?id=130093050', // HyperlaserGun icon (public Roblox gear)
    // Stable fallback icons are preferred over fresh Decal uploads because new Decals
    // can render blank in Backpack until moderation finishes.
    magic:  'rbxasset://Textures/Sword128.png',
    defense: 'rbxasset://Textures/Sword128.png',
    throwable: 'rbxasset://Textures/Sword128.png',
  };
  // rbxassetid:// resolves newly-uploaded owned Decals in Studio BEFORE moderation
  // finishes (within the same Roblox account). http://www.roblox.com/asset/?id= returns
  // 403 until the asset is publicly approved, so the backpack icon stays blank.
  const textureId = isValidIconId ? `rbxassetid://${extractedIconId}` : defaultTextureIds[weaponType];

  // Determine handle size based on weapon type
  const handleSize: [number, number, number] =
    // R5.8.5.7.13: bow held vertically — long Y axis for limbs, thin X/Z.
    isBow ? [0.3, 4, 0.2] :
    weaponType === 'ranged' ? [0.5, 0.8, 3] :
    // R5.8.5.7.8: magic uses same Handle as melee so Grip positions it identically.
    weaponType === 'magic' ? [1, 0.9, 4] :
    // R5.8.5.7.9 Batch 1: defense = flat wide shield part; throwable = small sphere-ish.
    weaponType === 'defense' ? [3, 4, 0.5] :
    weaponType === 'throwable' ? [1, 1, 1] :
    [1, 0.9, 4]; // melee — matches ClassicSword reference [1, 0.9, 4] so Grip matrix [0,0,1, 1,0,0, 0,1,0] + pos(0,0,-1.5) places the blade forward from hand. Previously [1, 4, 0.3] made sword lie horizontally through torso.

  // Tool properties go to rootProperties — the Lune builder creates the root as Tool instead of Model
  // Use single Grip CFrame (like reference weapons) instead of separate GripPos/Forward/Right/Up
  // Grip CFrame per weapon type — rotation matrix matches ClassicSword Grips.Up / Grips.Out
  const gripCFrame = isBow
    // R5.8.5.7.13: bow held vertically — hand grips center, limbs extend up/down.
    // Rotation matrix [0,0,1, 1,0,0, 0,1,0] matches ClassicSword pattern which
    // places Handle's +Y axis (длинная ось лука) vertically in the hand. Position
    // z=0 (центр лука в ладони, не смещён вперёд как меч).
    ? { position: { x: 0, y: 0, z: 0 }, rotation: [0, 0, 1, 1, 0, 0, 0, 1, 0] }
    : weaponType === 'defense'
    // R5.8.5.7.9: shield held flat in hand, face forward. Identity rotation;
    // Handle center offset so palm grips near one edge rather than center.
    ? { position: { x: 0, y: 0, z: 0 }, rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1] }
    : weaponType === 'throwable'
    // R5.8.5.7.9: grenade held in palm, identity rotation, tight to hand.
    ? { position: { x: 0, y: 0, z: 0 }, rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1] }
    : weaponType === 'magic'
    // R5.8.5.7.8: magic uses the SAME Grip as melee (ClassicSword pattern). The previous
    // {0,-1.5,0} offset pushed the staff sideways out of the hand. Same Handle [1,0.9,4]
    // as melee + Grip z=-1.5 keeps shaft aligned with hand → тип + orientCF в runtime
    // ставят staff vertically. AI mesh визуально всё равно отличается от меча.
    ? { position: { x: 0, y: 0, z: -1.5 }, rotation: [0, 0, 1, 1, 0, 0, 0, 1, 0] }
    : weaponType === 'ranged'
      // R4.1: identity rotation. Handle sits in hand aligned with hand's default axes.
      // Handle.LookVector in world = character's forward (-Z world). The Lua orientCF
      // in index.ts ShootServer mesh loader then aligns mesh longest-axis → Handle's -Z,
      // so barrel points forward from the hand. Previous rotation [0,1,0,1,0,0,0,0,-1]
      // had LookVector=(0,0,+1) which pointed the Handle backward into the player's face.
      ? { position: { x: 0, y: 0, z: 0 }, rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1] }
      // R5.8.2: restore proven ClassicSword Grip matrix. Handle is now VISIBLE
      // (R5.8.1) with built-in rbxasset://fonts/sword.mesh — matches the reference
      // /Users/test/Downloads/меч.rbxm exactly. Row-major [0,0,1, 1,0,0, 0,1,0]
      // + position z=-1.5 positions a [1,4,0.3] Handle so hilt sits in the hand
      // and the 4-stud blade extends forward/up.
      // R5.8.5.2.3 reverted → R5.8.5.3: z=-1.5 (not -1.7 reference) because runtime mesh-swap
      // replaces Handle's visible geometry with AI mesh that has different proportions than
      // ClassicSword's built-in sword.mesh. z=-1.5 kept sword closer to hand — user confirmed
      // R5.8.5.1 positioning was acceptable; R5.8.5.2.3's -1.7 pushed blade too far forward.
      : { position: { x: 0, y: 0, z: -1.5 }, rotation: [0, 0, 1, 1, 0, 0, 0, 1, 0] };

  const rootProperties: Record<string, unknown> = {
    Grip: {
      __type: 'CFrame',
      position: gripCFrame.position,
      rotation: gripCFrame.rotation,
    },
    CanBeDropped: true,
    RequiresHandle: true,
  };
  // R4.2 + session 158: TextureId = backpack icon. Prefer stable built-in/public
  // icons so the slot is not blank while a fresh custom Decal is still moderated.
  if (textureId) {
    rootProperties.TextureId = textureId;
  }

  const scene: RobloxBuildSceneNode[] = [
    // Handle — required for Tool objects, named "Handle". Parented to root (WorkspaceRoot = Tool)
    {
      id: handleId,
      className: 'Part',
      name: 'Handle',
      properties: {
        Size: { __type: 'Vector3', x: handleSize[0], y: handleSize[1], z: handleSize[2] },
        // Keep Handle visible as a reliable fallback. Runtime AI mesh loaders may
        // hide it after welding generated MeshParts to the Tool.
        Transparency: 0,
        Anchored: false,
        CanCollide: false,
        Locked: false,
        Color: primaryColor3,
        Material: { __type: 'Enum', enumType: 'Material', enumName: weaponType === 'magic' ? 'Neon' : 'Metal', value: weaponType === 'magic' ? 288 : 1040 },
        Shape: { __type: 'Enum', enumType: 'PartType', enumName: weaponType === 'ranged' ? 'Cylinder' : 'Block', value: weaponType === 'ranged' ? 2 : 1 },
      },
    },
    // RightGripAttachment — user can adjust position in Studio to fine-tune weapon grip
    {
      id: uuidv4(),
      className: 'Attachment',
      name: 'RightGripAttachment',
      parentId: handleId,
      properties: {
        Position: { __type: 'Vector3', x: 0, y: 0, z: 0 },
      },
    },
  ];

  if (weaponType !== 'defense' && weaponType !== 'throwable') {
    scene.push({
      id: uuidv4(),
      className: 'SpecialMesh',
      name: 'Mesh',
      parentId: handleId,
      properties: {
        MeshId: weaponType === 'ranged'
          ? 'http://www.roblox.com/asset/?id=94219391'
          : 'rbxasset://fonts/sword.mesh',
        MeshType: { __type: 'Enum', enumType: 'MeshType', enumName: 'FileMesh', value: 5 },
        // Keep fallback texture only for the built-in melee mesh. Runtime AI Model
        // loading destroys this SpecialMesh and force-tints the loaded MeshParts.
        TextureId: weaponType === 'melee' ? 'rbxasset://textures/SwordTexture.png' : '',
        VertexColor: { __type: 'Vector3', x: primaryRgb.r, y: primaryRgb.g, z: primaryRgb.b },
        Scale: { __type: 'Vector3', x: 1, y: 1, z: 1 },
      },
    });
  }

  // Add Trail for melee weapons
  if (weaponType === 'melee') {
    const att0Id = uuidv4();
    const att1Id = uuidv4();
    scene.push(
      {
        id: att0Id,
        className: 'Attachment',
        name: 'TrailAttachment0',
        parentId: handleId,
        properties: {
          // Trail along blade axis — with Handle [1, 0.9, 4] blade extends along +Z.
          Position: { __type: 'Vector3', x: 0, y: 0, z: -handleSize[2] * 0.4 },
        },
      },
      {
        id: att1Id,
        className: 'Attachment',
        name: 'TrailAttachment1',
        parentId: handleId,
        properties: {
          Position: { __type: 'Vector3', x: 0, y: 0, z: handleSize[2] * 0.4 },
        },
      },
      {
        id: uuidv4(),
        className: 'Trail',
        name: 'SlashTrail',
        parentId: handleId,
        properties: {
          Attachment0: { __type: 'Ref', id: att0Id },
          Attachment1: { __type: 'Ref', id: att1Id },
          Lifetime: 0.5,
          MinLength: 0.05,
          FaceCamera: true,
          LightEmission: 0.8,
          Color: { __type: 'ColorSequence', Keypoints: [
            { Time: 0, r: primaryRgb.r, g: primaryRgb.g, b: primaryRgb.b },
            { Time: 1, r: accentRgb.r,  g: accentRgb.g,  b: accentRgb.b },
          ] },
          Transparency: { __type: 'NumberSequence', Keypoints: [
            { Time: 0, Value: 0.1 },
            { Time: 1, Value: 1 },
          ] },
          Enabled: false, // enabled on swing by client script
        },
      },
    );
  }

  // Add PointLight for glow effect — buffed (session #095) so it's visible in Studio.
  scene.push({
    id: uuidv4(),
    className: 'PointLight',
    name: 'WeaponGlow',
    parentId: handleId,
    properties: {
      Brightness: 1.5,
      Range: 12,
      Color: glowColor3,
      Enabled: true,
    },
  });

  // Add ParticleEmitter for magic weapons
  if (weaponType === 'magic') {
    scene.push({
      id: uuidv4(),
      className: 'ParticleEmitter',
      name: 'MagicParticles',
      parentId: handleId,
      properties: {
        Rate: 15,
        Lifetime: { __type: 'NumberRange', Min: 0.5, Max: 1.5 },
        Speed: { __type: 'NumberRange', Min: 1, Max: 3 },
        Size: { __type: 'NumberSequence', Keypoints: [{ Time: 0, Value: 0.3 }, { Time: 1, Value: 0 }] },
        Transparency: { __type: 'NumberSequence', Keypoints: [{ Time: 0, Value: 0 }, { Time: 1, Value: 1 }] },
        LightEmission: 1,
        Color: { __type: 'ColorSequence', Keypoints: [
          { Time: 0, r: glowRgb.r,   g: glowRgb.g,   b: glowRgb.b },
          { Time: 1, r: accentRgb.r, g: accentRgb.g, b: accentRgb.b },
        ] },
        Enabled: true,
      },
    });
  }

  // === Sound objects (equip, attack, hit) ===
  const soundConfigs: Record<string, Record<string, { id: string; volume: number }>> = {
    melee: {
      EquipSound:  { id: 'http://www.roblox.com/asset/?id=12222208', volume: 0.5 },
      AttackSound: { id: 'http://www.roblox.com/asset/?id=12222225', volume: 0.7 },
      HitSound:    { id: 'http://www.roblox.com/asset/?id=12222253', volume: 0.5 },
    },
    ranged: {
      // Session #095 follow-up: the legacy id 12222228 plays a victory-fanfare style sound
      // on some accounts (likely asset moderation changed it). Replace with a public
      // gunshot from Roblox Creator Store: asset 2811598570 ("Gun-Shot").
      // R5.8.5.7.13: for bow — switch all three sounds to bow-appropriate assets
      // at manifest build time (runtime override was unreliable).
      EquipSound:  { id: isBow ? 'rbxassetid://3744371091' : 'rbxassetid://12222200', volume: 0.4 },
      AttackSound: { id: isBow ? 'rbxassetid://3744371091' : 'rbxassetid://2811598570', volume: isBow ? 0.7 : 0.8 },
      HitSound:    { id: isBow ? 'rbxassetid://1838613989' : 'rbxassetid://12222253', volume: 0.5 },
    },
    magic: {
      EquipSound:  { id: 'http://www.roblox.com/asset/?id=12222216', volume: 0.5 },
      AttackSound: { id: 'http://www.roblox.com/asset/?id=12222242', volume: 0.7 },
      // Session 205: 12222258 returns "Asset type does not match requested type"
      // / "User is not authorized" on production accounts (asset re-uploaded as a
      // non-audio type or moderated to private). Reuse the melee HitSound (12222253)
      // which is verified working — provides a generic impact sound for magic hits
      // until a magic-specific public Creator Store sound is sourced.
      HitSound:    { id: 'http://www.roblox.com/asset/?id=12222253', volume: 0.5 },
    },
  };
  const sounds = soundConfigs[weaponType] || soundConfigs.melee;
  for (const [soundName, cfg] of Object.entries(sounds)) {
    scene.push({
      id: uuidv4(),
      className: 'Sound',
      name: soundName,
      parentId: handleId,
      properties: {
        SoundId: cfg.id,
        Volume: cfg.volume,
      },
    });
  }

  // === Animations folder with Animation instances ===
  const animFolderId = uuidv4();
  scene.push({
    id: animFolderId,
    className: 'Folder',
    name: 'Animations',
    parentId: handleId,
  });
  const animConfigs = [
    { name: 'SlashAnim', id: 'http://www.roblox.com/asset/?id=522635514' },
    { name: 'LungeAnim', id: 'http://www.roblox.com/asset/?id=522638767' },
  ];
  for (const anim of animConfigs) {
    scene.push({
      id: uuidv4(),
      className: 'Animation',
      name: anim.name,
      parentId: animFolderId,
      properties: {
        AnimationId: anim.id,
      },
    });
  }

  // === Smoke for ranged weapons (muzzle effect) ===
  if (weaponType === 'ranged') {
    scene.push({
      id: uuidv4(),
      className: 'Smoke',
      name: 'MuzzleSmoke',
      parentId: handleId,
      properties: {
        Size: 0.5,
        Opacity: 0.3,
        RiseVelocity: 3,
        Color: color3(0.6, 0.6, 0.6),
        Enabled: false,
      },
    });
  }

  // === Beam for magic weapons (glowing energy along staff) ===
  if (weaponType === 'magic') {
    const beamAtt0Id = uuidv4();
    const beamAtt1Id = uuidv4();
    scene.push(
      {
        id: beamAtt0Id, className: 'Attachment', name: 'BeamAttachment0', parentId: handleId,
        properties: { Position: { __type: 'Vector3', x: 0, y: 0, z: 0 } },
      },
      {
        id: beamAtt1Id, className: 'Attachment', name: 'BeamAttachment1', parentId: handleId,
        properties: { Position: { __type: 'Vector3', x: 0, y: 0, z: -handleSize[2] } },
      },
      {
        id: uuidv4(), className: 'Beam', name: 'MagicBeam', parentId: handleId,
        properties: {
          Attachment0: { __type: 'Ref', id: beamAtt0Id },
          Attachment1: { __type: 'Ref', id: beamAtt1Id },
          Width0: 0.5,
          Width1: 0.3,
          Color: { __type: 'ColorSequence', Keypoints: [
            { Time: 0, r: glowRgb.r,   g: glowRgb.g,   b: glowRgb.b },
            { Time: 1, r: accentRgb.r, g: accentRgb.g, b: accentRgb.b },
          ] },
          LightEmission: 1,
          FaceCamera: true,
          Transparency: { __type: 'NumberSequence', Keypoints: [
            { Time: 0, Value: 0.3 },
            { Time: 1, Value: 0.8 },
          ] },
          Enabled: true,
        },
      },
    );
  }

  // === Melee/Magic: MeleeEvent RemoteEvent for client↔server hit validation ===
  if (weaponType === 'melee' || weaponType === 'magic') {
    scene.push({
      id: uuidv4(),
      className: 'RemoteEvent',
      name: 'MeleeEvent',
      // parentId omitted = parented to root (Tool)
    });
  }

  // === Ranged-specific: Events Folder + RemoteEvents (client↔server communication) ===
  if (weaponType === 'ranged') {
    const eventsFolderId = uuidv4();
    scene.push({
      id: eventsFolderId,
      className: 'Folder',
      name: 'Events',
      // parentId omitted = parented to root (Tool)
    });
    const remoteEvents = ['Equipped', 'Fired', 'HitFired', 'Reload', 'HitTarget'];
    for (const evtName of remoteEvents) {
      scene.push({
        id: uuidv4(),
        className: 'RemoteEvent',
        name: evtName,
        parentId: eventsFolderId,
      });
    }

    // Flare — muzzle flash visual (BillboardGui parented to Handle)
    const flareId = uuidv4();
    scene.push(
      {
        id: flareId,
        className: 'BillboardGui',
        name: 'Flare',
        parentId: handleId,
        properties: {
          Size: { __type: 'UDim2', XScale: 3, XOffset: 0, YScale: 3, YOffset: 0 },
          StudsOffset: { __type: 'Vector3', x: 0, y: 0, z: -handleSize[2] * 0.5 },
          Enabled: false,
          LightInfluence: 0,
          AlwaysOnTop: false,
        },
      },
      {
        id: uuidv4(),
        className: 'ImageLabel',
        name: 'FlareImage',
        parentId: flareId,
        properties: {
          Size: { __type: 'UDim2', XScale: 1, XOffset: 0, YScale: 1, YOffset: 0 },
          BackgroundTransparency: 1,
          Image: 'rbxasset://textures/Sparkle.png',
          ImageColor3: glowColor3,
        },
      },
    );

    // WeaponHud — ScreenGui with ammo display and crosshair (parented to Tool)
    const weaponHudId = uuidv4();
    const ammoHudId = uuidv4();
    const crosshairId = uuidv4();
    scene.push(
      {
        id: weaponHudId,
        className: 'ScreenGui',
        name: 'WeaponHud',
        // parentId omitted = parented to root (Tool)
        properties: {
          ResetOnSpawn: false,
        },
      },
      {
        id: ammoHudId,
        className: 'Frame',
        name: 'AmmoHud',
        parentId: weaponHudId,
        properties: {
          Size: { __type: 'UDim2', XScale: 0.12, XOffset: 0, YScale: 0.06, YOffset: 0 },
          Position: { __type: 'UDim2', XScale: 0.85, XOffset: 0, YScale: 0.9, YOffset: 0 },
          BackgroundColor3: color3(0, 0, 0),
          BackgroundTransparency: 0.5,
          BorderSizePixel: 0,
        },
      },
      {
        id: uuidv4(),
        className: 'TextLabel',
        name: 'AmmoLabel',
        parentId: ammoHudId,
        properties: {
          Size: { __type: 'UDim2', XScale: 1, XOffset: 0, YScale: 1, YOffset: 0 },
          BackgroundTransparency: 1,
          Text: '30 / 30',
          TextColor3: color3(1, 1, 1),
          TextScaled: true,
          FontFace: { __type: 'Font', family: 'rbxasset://fonts/families/GothamSSm.json', weight: 'Bold', style: 'Normal' },
        },
      },
      {
        id: crosshairId,
        className: 'Frame',
        name: 'Crosshair',
        parentId: weaponHudId,
        properties: {
          Size: { __type: 'UDim2', XScale: 0, XOffset: 20, YScale: 0, YOffset: 20 },
          Position: { __type: 'UDim2', XScale: 0.5, XOffset: 0, YScale: 0.5, YOffset: 0 },
          AnchorPoint: { __type: 'Vector2', x: 0.5, y: 0.5 },
          BackgroundTransparency: 1,
          BorderSizePixel: 0,
        },
      },
    );

    // Recoil + Reload Animations at Tool level (like reference Handgun)
    scene.push(
      {
        id: uuidv4(),
        className: 'Animation',
        name: 'Recoil',
        // parentId omitted = parented to root (Tool)
        properties: {
          AnimationId: 'http://www.roblox.com/asset/?id=94245658',
        },
      },
      {
        id: uuidv4(),
        className: 'Animation',
        name: 'Reload',
        // parentId omitted = parented to root (Tool)
        properties: {
          AnimationId: 'http://www.roblox.com/asset/?id=94245675',
        },
      },
    );
  }

  // === ThumbnailPose — R15 skeleton for weapon preview (matches reference weapons) ===
  // This provides a proper character pose when previewing the weapon in Roblox Studio/catalog
  const thumbnailPoseId = uuidv4();
  const r15PoseNames = [
    'HumanoidRootPart', 'LowerTorso', 'UpperTorso', 'Head',
    'LeftUpperArm', 'LeftLowerArm', 'LeftHand',
    'RightUpperArm', 'RightLowerArm', 'RightHand',
    'LeftUpperLeg', 'LeftLowerLeg', 'LeftFoot',
    'RightUpperLeg', 'RightLowerLeg', 'RightFoot',
  ];
  scene.push({
    id: thumbnailPoseId,
    className: 'Keyframe',
    name: 'ThumbnailPose',
    // parentId omitted = parented to root (Tool)
    properties: {
      Time: 0,
    },
  });
  for (const poseName of r15PoseNames) {
    scene.push({
      id: uuidv4(),
      className: 'Pose',
      name: poseName,
      parentId: thumbnailPoseId,
      properties: {
        Weight: 1,
        EasingDirection: { __type: 'Enum', enumType: 'PoseEasingDirection', enumName: 'In', value: 0 },
        EasingStyle: { __type: 'Enum', enumType: 'PoseEasingStyle', enumName: 'Linear', value: 0 },
        // Default identity CFrame — Roblox uses this as base pose
        CFrame: {
          __type: 'CFrame',
          position: { x: 0, y: 0, z: 0 },
          rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1],
        },
      },
    });
  }

  // === ThumbnailCamera — camera for weapon preview rendering ===
  scene.push({
    id: uuidv4(),
    className: 'Camera',
    name: 'ThumbnailCamera',
    // parentId omitted = parented to root (Tool)
    properties: {
      FieldOfView: 70,
      CFrame: {
        __type: 'CFrame',
        position: { x: 5, y: 3, z: -3 },
        rotation: [0.5, 0.86, 0, 0, 0, 1, 0.86, -0.5, 0],
      },
    },
  });

  // === Extra particle effects per weapon type (like reference weapons) ===
  if (weaponType === 'melee') {
    // Sparkle particles on blade
    scene.push({
      id: uuidv4(),
      className: 'ParticleEmitter',
      name: 'BladeSparkle',
      parentId: handleId,
      properties: {
        Rate: 5,
        Lifetime: { __type: 'NumberRange', Min: 0.3, Max: 0.8 },
        Speed: { __type: 'NumberRange', Min: 0.5, Max: 1.5 },
        Size: { __type: 'NumberSequence', Keypoints: [{ Time: 0, Value: 0.15 }, { Time: 1, Value: 0 }] },
        Transparency: { __type: 'NumberSequence', Keypoints: [{ Time: 0, Value: 0 }, { Time: 1, Value: 1 }] },
        LightEmission: 1,
        Texture: 'rbxassetid://284205403',
        Color: { __type: 'ColorSequence', Keypoints: [
          { Time: 0, r: glowRgb.r,   g: glowRgb.g,   b: glowRgb.b },
          { Time: 1, r: accentRgb.r, g: accentRgb.g, b: accentRgb.b },
        ] },
        Enabled: true,
      },
    });
  }
  if (weaponType === 'ranged') {
    // Shell casing particles
    scene.push({
      id: uuidv4(),
      className: 'ParticleEmitter',
      name: 'ShellCasing',
      parentId: handleId,
      properties: {
        Rate: 0,
        Lifetime: { __type: 'NumberRange', Min: 1, Max: 2 },
        Speed: { __type: 'NumberRange', Min: 3, Max: 6 },
        Size: { __type: 'NumberSequence', Keypoints: [{ Time: 0, Value: 0.1 }, { Time: 1, Value: 0.1 }] },
        Transparency: { __type: 'NumberSequence', Keypoints: [{ Time: 0, Value: 0 }, { Time: 1, Value: 0 }] },
        SpreadAngle: { __type: 'Vector2', x: 30, y: 30 },
        Enabled: false,
      },
    });
  }
  if (weaponType === 'magic') {
    // Extra glow rays
    scene.push(
      {
        id: uuidv4(),
        className: 'ParticleEmitter',
        name: 'MagicRays',
        parentId: handleId,
        properties: {
          Rate: 8,
          Lifetime: { __type: 'NumberRange', Min: 0.5, Max: 1.0 },
          Speed: { __type: 'NumberRange', Min: 0, Max: 0.5 },
          Size: { __type: 'NumberSequence', Keypoints: [{ Time: 0, Value: 0.5 }, { Time: 0.5, Value: 0.8 }, { Time: 1, Value: 0 }] },
          Transparency: { __type: 'NumberSequence', Keypoints: [{ Time: 0, Value: 0.3 }, { Time: 1, Value: 1 }] },
          LightEmission: 1,
          Texture: 'rbxassetid://284205403',
          Color: { __type: 'ColorSequence', Keypoints: [
            { Time: 0, r: glowRgb.r,   g: glowRgb.g,   b: glowRgb.b },
            { Time: 1, r: primaryRgb.r, g: primaryRgb.g, b: primaryRgb.b },
          ] },
          Enabled: true,
        },
      },
      {
        id: uuidv4(),
        className: 'ParticleEmitter',
        name: 'MagicStars',
        parentId: handleId,
        properties: {
          Rate: 3,
          Lifetime: { __type: 'NumberRange', Min: 1, Max: 2 },
          Speed: { __type: 'NumberRange', Min: 1, Max: 3 },
          Size: { __type: 'NumberSequence', Keypoints: [{ Time: 0, Value: 0.2 }, { Time: 1, Value: 0 }] },
          Transparency: { __type: 'NumberSequence', Keypoints: [{ Time: 0, Value: 0 }, { Time: 1, Value: 1 }] },
          LightEmission: 1,
          Texture: 'rbxassetid://141830599',
          Color: { __type: 'ColorSequence', Keypoints: [
            { Time: 0, r: accentRgb.r, g: accentRgb.g, b: accentRgb.b },
            { Time: 1, r: glowRgb.r,   g: glowRgb.g,   b: glowRgb.b },
          ] },
          Enabled: true,
        },
      },
    );
  }

  // Build scripts from metadata.weaponScripts if available
  const weaponScripts = Array.isArray(metadata.weaponScripts) ? metadata.weaponScripts : [];
  const scripts = weaponScripts.map((ws: Record<string, unknown>, idx: number) => ({
    id: `weapon-script-${idx}`,
    name: typeof ws.name === 'string' ? ws.name : `WeaponScript${idx}`,
    scriptType: (typeof ws.scriptType === 'string' ? ws.scriptType : 'Script') as 'Script' | 'LocalScript' | 'ModuleScript',
    container: (typeof ws.container === 'string' ? ws.container : 'ServerScriptService') as
      'ServerScriptService' | 'ReplicatedStorage' | 'StarterPlayerScripts' | 'StarterGui' | 'StarterPack' | 'Workspace',
    source: typeof ws.source === 'string' ? ws.source : '',
  }));

  // If no scripts from metadata, add a starter script
  if (scripts.length === 0 && args.starterScript) {
    scripts.push({
      id: 'weapon-starter',
      name: `${normalizedName}Starter`,
      scriptType: 'Script' as const,
      container: 'ServerScriptService' as const,
      source: args.starterScript,
    });
  }

  return {
    id: uuidv4(),
    title: shortTitle,
    summary: args.summary,
    target: args.target,
    rootClassName: 'Tool',
    rootProperties,
    formatPreference: 'binary' as RobloxArtifactFormat,
    scene,
    scripts,
    assets: [],
  };
}

// ── Item & Tool manifest builder (session #096 — Release 2) ─────────
// Simpler than weapons: Tool + Handle (Part + SpecialMesh or MeshPart via mesh swap)
// + Sound (use/pickup) + PointLight for glow + optional ParticleEmitter. No R15 pose,
// no combat VFX. Scripts come from metadata.itemScripts (LLM or fallback).
function buildItemToolManifest(
  args: {
    title: string;
    summary: string;
    target: RobloxBuildTarget;
    prompt: string;
    starterScript: string;
    metadata?: Record<string, unknown>;
  },
  metadata: Record<string, unknown>,
): RobloxBuildManifest {
  const toolId = uuidv4();
  const handleId = uuidv4();
  const shortTitle = (() => {
    const raw = (args.title || 'Generated Item').trim();
    const beforeDash = raw.split(/\s[-–—]\s/)[0].trim();
    if (beforeDash && beforeDash.length < raw.length) return beforeDash.slice(0, 50);
    return raw.split(/\s+/).slice(0, 5).join(' ').slice(0, 50);
  })();
  const normalizedName = sanitizeSystemName(shortTitle) || shortTitle || 'GeneratedItem';
  const itemType = typeof metadata.itemType === 'string' ? metadata.itemType : 'other';
  const rawMeshAssetId = typeof metadata.meshAssetId === 'string' ? metadata.meshAssetId : undefined;

  // User-picked colors with per-type sensible defaults.
  const typeDefaults: Record<string, { primary: { r: number; g: number; b: number }; accent: { r: number; g: number; b: number }; glow: { r: number; g: number; b: number } }> = {
    key:      { primary: { r: 0.83, g: 0.69, b: 0.22 }, accent: { r: 1, g: 0.94, b: 0.67 },  glow: { r: 1, g: 0.84, b: 0 } },
    potion:   { primary: { r: 0.55, g: 0.12, b: 0.9 },  accent: { r: 0.12, g: 1, b: 0.52 },  glow: { r: 0.85, g: 0.15, b: 1 } },
    coin:     { primary: { r: 0.83, g: 0.69, b: 0.22 }, accent: { r: 1, g: 0.94, b: 0.67 },  glow: { r: 1, g: 0.84, b: 0 } },
    medkit:   { primary: { r: 0.95, g: 0.95, b: 0.95 }, accent: { r: 0.85, g: 0.15, b: 0.15 }, glow: { r: 1, g: 0.3, b: 0.3 } },
    resource: { primary: { r: 0.6, g: 0.45, b: 0.3 },   accent: { r: 0.85, g: 0.7, b: 0.5 }, glow: { r: 0.7, g: 0.55, b: 0.35 } },
    other:    { primary: { r: 0.65, g: 0.65, b: 0.7 },  accent: { r: 0.9, g: 0.9, b: 1 },    glow: { r: 0.6, g: 0.85, b: 1 } },
  };
  const defaults = typeDefaults[itemType] || typeDefaults.other;
  const primaryRgb = hexToColor3(metadata.primaryColor) ?? defaults.primary;
  const accentRgb  = hexToColor3(metadata.accentColor)  ?? defaults.accent;
  const glowRgb    = hexToColor3(metadata.glowColor)    ?? defaults.glow;
  const primaryColor3 = color3(primaryRgb.r, primaryRgb.g, primaryRgb.b);
  const glowColor3    = color3(glowRgb.r, glowRgb.g, glowRgb.b);
  const viralHooksEnabled = itemType === 'potion' || typeof metadata.viralStyleMode === 'string';

  // Per-type default mesh fallback (built-in Roblox assets) when AI mesh is unavailable.
  const defaultMeshes: Record<string, string> = {
    key:      'http://www.roblox.com/asset/?id=11376946',  // classic key mesh
    potion:   'http://www.roblox.com/asset/?id=10470609',  // bottle/flask mesh
    coin:     'rbxasset://fonts/torso.mesh',               // fallback — use cylinder shape below
    medkit:   'rbxasset://fonts/torso.mesh',               // fallback — use block shape
    resource: 'rbxasset://fonts/torso.mesh',
    other:    'rbxasset://fonts/torso.mesh',
  };
  const extractedMeshId = rawMeshAssetId?.match(/\d+/)?.[0];
  const isValidMeshId = extractedMeshId && extractedMeshId.length >= 5 && extractedMeshId.length <= 16;
  // When AI mesh is uploaded, runtime InsertService:LoadAsset swaps it into Handle.
  // Only key/potion have reliable built-in FileMesh fallbacks; coins/medkits/resources
  // should use their clean Part shape instead of the old torso.mesh placeholder.
  const fallbackMeshUrl = itemType === 'key' || itemType === 'potion'
    ? (defaultMeshes[itemType] || '')
    : '';

  // Handle size per item type.
  const handleSize: [number, number, number] =
    itemType === 'coin'     ? [1.2, 1.2, 0.2] :
    itemType === 'potion'   ? [0.8, 1.6, 0.8] :
    itemType === 'key'      ? [0.5, 0.5, 1.8] :
    itemType === 'medkit'   ? [1.6, 1, 1] :
    itemType === 'resource' ? [1, 1, 1] :
    [1, 1, 1];

  // Grip — most items held upright at the hand's origin (identity-ish rotation).
  const rootProperties: Record<string, unknown> = {
    Grip: {
      __type: 'CFrame',
      position: { x: 0, y: 0, z: 0 },
      rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    },
    ToolTip: `${shortTitle} — use`,
    Enabled: true,
    ManualActivationOnly: false,
    CanBeDropped: true,
    RequiresHandle: true,
  };

  // Backpack icon — prefer the generated 2D preview uploaded during the pipeline.
  const userIconAssetId = typeof metadata.iconImageAssetId === 'string'
    ? metadata.iconImageAssetId
    : typeof metadata.toolIconAssetId === 'string'
      ? metadata.toolIconAssetId
      : typeof metadata.iconAssetId === 'string'
        ? metadata.iconAssetId
        : undefined;
  const extractedIconId = userIconAssetId?.match(/\d+/)?.[0];
  if (extractedIconId && extractedIconId.length >= 5 && extractedIconId.length <= 16) {
    // rbxassetid:// works for owned, not-yet-moderated Decals in Studio.
    rootProperties.TextureId = `rbxassetid://${extractedIconId}`;
  } else {
    // Session 327 follow-up: prior fallback was `rbxasset://textures/Sword128.png`,
    // which showed a sword icon on every item (potion/coin/key/medkit) when the AI
    // icon upload failed. Per-type stable public Roblox catalog Decals are preferred;
    // for types without a vetted public icon, leave TextureId unset so the hotbar
    // shows a neutral blank slot rather than a misleading sword.
    const fallbackTextureIds: Record<string, string | undefined> = {
      // Public ROBLOX-owned classic icons (long-standing, moderated, free-to-use).
      potion:   'http://www.roblox.com/asset/?id=73232786',   // Healing Potion gear icon
      coin:     'http://www.roblox.com/asset/?id=12180108',   // Classic gold coin decal
      key:      'http://www.roblox.com/asset/?id=18207212',   // Brass key gear icon
      medkit:   'http://www.roblox.com/asset/?id=14304827',   // Health pack gear icon
      resource: undefined, // no stable thematic icon — blank slot
      other:    undefined,
    };
    const fallback = fallbackTextureIds[itemType];
    if (fallback) rootProperties.TextureId = fallback;
  }

  const scene: RobloxBuildSceneNode[] = [
    {
      id: handleId,
      className: 'Part',
      name: 'Handle',
      properties: {
        Size: { __type: 'Vector3', x: handleSize[0], y: handleSize[1], z: handleSize[2] },
        Transparency: 0,
        Anchored: false,
        CanCollide: false,
        Locked: false,
        Color: primaryColor3,
        Material: { __type: 'Enum', enumType: 'Material', enumName: itemType === 'potion' ? 'Glass' : itemType === 'coin' ? 'Metal' : 'Plastic', value: itemType === 'potion' ? 1568 : itemType === 'coin' ? 1040 : 256 },
        Shape: {
          __type: 'Enum',
          enumType: 'PartType',
          enumName: itemType === 'coin' ? 'Cylinder' : 'Block',
          value: itemType === 'coin' ? 2 : 1,
        },
      },
    },
    {
      id: uuidv4(),
      className: 'SpecialMesh',
      name: 'Mesh',
      parentId: handleId,
      properties: {
        MeshId: fallbackMeshUrl,
        MeshType: { __type: 'Enum', enumType: 'MeshType', enumName: 'FileMesh', value: 5 },
        TextureId: '',
        VertexColor: { __type: 'Vector3', x: primaryRgb.r, y: primaryRgb.g, z: primaryRgb.b },
        Scale: { __type: 'Vector3', x: 1, y: 1, z: 1 },
      },
    },
    {
      id: uuidv4(),
      className: 'Attachment',
      name: 'RightGripAttachment',
      parentId: handleId,
      properties: {
        Position: { __type: 'Vector3', x: 0, y: 0, z: 0 },
      },
    },
    // Glow — always on, gives items visible presence on ground / in hand.
    {
      id: uuidv4(),
      className: 'PointLight',
      name: 'ItemGlow',
      parentId: handleId,
      properties: {
        Brightness: 1.2,
        Range: 8,
        Color: glowColor3,
        Enabled: true,
      },
    },
    // Sparkle particles — disabled by default; client enables briefly on Activated.
    {
      id: uuidv4(),
      className: 'ParticleEmitter',
      name: 'UseSparkle',
      parentId: handleId,
      properties: {
        Rate: 30,
        Lifetime: { __type: 'NumberRange', Min: 0.3, Max: 0.8 },
        Speed: { __type: 'NumberRange', Min: 1, Max: 2 },
        Size: { __type: 'NumberSequence', Keypoints: [{ Time: 0, Value: 0.3 }, { Time: 1, Value: 0 }] },
        Transparency: { __type: 'NumberSequence', Keypoints: [{ Time: 0, Value: 0 }, { Time: 1, Value: 1 }] },
        LightEmission: 1,
        Texture: 'rbxassetid://284205403',
        Color: { __type: 'ColorSequence', Keypoints: [
          { Time: 0, r: glowRgb.r,   g: glowRgb.g,   b: glowRgb.b },
          { Time: 1, r: accentRgb.r, g: accentRgb.g, b: accentRgb.b },
        ] },
        Enabled: false,
      },
    },
  ];

  if (!fallbackMeshUrl) {
    const meshIndex = scene.findIndex((node) => node.className === 'SpecialMesh' && node.parentId === handleId);
    if (meshIndex >= 0) scene.splice(meshIndex, 1);
  }

  // Per-type accent: potions bubble ambient, coins slowly spin, keys have metallic glint (handled client-side).
  if (itemType === 'potion') {
    scene.push({
      id: uuidv4(),
      className: 'ParticleEmitter',
      name: 'BubbleFizz',
      parentId: handleId,
      properties: {
        Rate: 6,
        Lifetime: { __type: 'NumberRange', Min: 0.8, Max: 1.4 },
        Speed: { __type: 'NumberRange', Min: 0.3, Max: 0.8 },
        Size: { __type: 'NumberSequence', Keypoints: [{ Time: 0, Value: 0.1 }, { Time: 1, Value: 0 }] },
        Transparency: { __type: 'NumberSequence', Keypoints: [{ Time: 0, Value: 0.2 }, { Time: 1, Value: 1 }] },
        LightEmission: 0.6,
        Color: { __type: 'ColorSequence', Keypoints: [
          { Time: 0, r: glowRgb.r, g: glowRgb.g, b: glowRgb.b },
          { Time: 1, r: primaryRgb.r, g: primaryRgb.g, b: primaryRgb.b },
        ] },
        Enabled: true,
      },
    });
  }

  if (viralHooksEnabled) {
    const hookGuiId = uuidv4();
    scene.push({
      id: uuidv4(),
      className: 'ParticleEmitter',
      name: itemType === 'potion' ? 'BrainrotFizzAura' : 'MemeHookAura',
      parentId: handleId,
      properties: {
        Rate: itemType === 'potion' ? 14 : 8,
        Lifetime: { __type: 'NumberRange', Min: 0.45, Max: 1.1 },
        Speed: { __type: 'NumberRange', Min: 0.8, Max: 2.4 },
        SpreadAngle: { __type: 'Vector2', x: 65, y: 65 },
        Size: { __type: 'NumberSequence', Keypoints: [{ Time: 0, Value: 0.18 }, { Time: 0.6, Value: 0.55 }, { Time: 1, Value: 0 }] },
        Transparency: { __type: 'NumberSequence', Keypoints: [{ Time: 0, Value: 0.08 }, { Time: 1, Value: 1 }] },
        LightEmission: 1,
        Texture: 'rbxassetid://284205403',
        Color: { __type: 'ColorSequence', Keypoints: [
          { Time: 0, r: glowRgb.r,   g: glowRgb.g,   b: glowRgb.b },
          { Time: 1, r: accentRgb.r, g: accentRgb.g, b: accentRgb.b },
        ] },
        Enabled: itemType === 'potion',
      },
    });
    scene.push({
      id: hookGuiId,
      className: 'BillboardGui',
      name: 'ViralHookLabel',
      parentId: handleId,
      properties: {
        Size: { __type: 'UDim2', XScale: 3.2, XOffset: 0, YScale: 0.9, YOffset: 0 },
        StudsOffset: { __type: 'Vector3', x: 0, y: handleSize[1] + 1.4, z: 0 },
        AlwaysOnTop: true,
        LightInfluence: 0,
        MaxDistance: 45,
      },
    });
    scene.push({
      id: uuidv4(),
      className: 'TextLabel',
      name: 'Text',
      parentId: hookGuiId,
      properties: {
        Text: itemType === 'potion' ? 'BRAINROT BUFF' : 'MEME FX',
        Size: { __type: 'UDim2', XScale: 1, XOffset: 0, YScale: 1, YOffset: 0 },
        BackgroundTransparency: 1,
        TextColor3: { __type: 'Color3', r: glowRgb.r, g: glowRgb.g, b: glowRgb.b },
        TextStrokeTransparency: 0.2,
        TextStrokeColor3: { __type: 'Color3', r: 0, g: 0, b: 0 },
        TextScaled: true,
        FontFace: { __type: 'Font', family: 'rbxasset://fonts/families/GothamSSm.json', weight: 'Bold', style: 'Normal' },
      },
    });
  }

  // Verified built-in Roblox sounds (all .mp3, shipped with Studio — no 403, no moderation).
  // Source: https://github.com/Githolz/All-Classic-Roblox-Sound-Paths-/blob/main/README.md
  const soundIds: Record<string, string> = {
    key:      'rbxasset://sounds/switch.mp3',              // click / unlock
    potion:   'rbxasset://sounds/bass.mp3',                // bass tone — "drink" feel
    coin:     'rbxasset://sounds/electronicpingshort.mp3', // classic coin chime
    medkit:   'rbxasset://sounds/victory.mp3',             // tada — heal cue
    resource: 'rbxasset://sounds/hit.mp3',                 // pickup thud
    other:    'rbxasset://sounds/button.mp3',              // neutral UI click
  };
  scene.push({
    id: uuidv4(),
    className: 'Sound',
    name: 'UseSound',
    parentId: handleId,
    properties: {
      SoundId: soundIds[itemType] || soundIds.other,
      Volume: 0.6,
    },
  });
  if (viralHooksEnabled) {
    scene.push({
      id: uuidv4(),
      className: 'Sound',
      name: 'MemePopSound',
      parentId: handleId,
      properties: {
        SoundId: 'rbxasset://sounds/electronicpingshort.mp3',
        Volume: itemType === 'potion' ? 0.45 : 0.28,
        PlaybackSpeed: itemType === 'potion' ? 0.82 : 1.2,
      },
    });
  }

  // Build scripts from metadata.itemScripts if available.
  const itemScripts = Array.isArray(metadata.itemScripts) ? metadata.itemScripts : [];
  const scripts = itemScripts.map((s: Record<string, unknown>, idx: number) => ({
    id: `item-script-${idx}`,
    name: typeof s.name === 'string' ? s.name : `ItemScript${idx}`,
    scriptType: (typeof s.scriptType === 'string' ? s.scriptType : 'Script') as 'Script' | 'LocalScript' | 'ModuleScript',
    container: (typeof s.container === 'string' ? s.container : 'ServerScriptService') as
      'ServerScriptService' | 'ReplicatedStorage' | 'StarterPlayerScripts' | 'StarterGui' | 'StarterPack' | 'Workspace',
    source: typeof s.source === 'string' ? s.source : '',
  }));

  if (scripts.length === 0 && args.starterScript) {
    scripts.push({
      id: 'item-starter',
      name: `${normalizedName}Starter`,
      scriptType: 'Script' as const,
      container: 'ServerScriptService' as const,
      source: args.starterScript,
    });
  }

  void toolId;

  return {
    id: uuidv4(),
    title: shortTitle,
    summary: args.summary,
    target: args.target,
    rootClassName: 'Tool',
    rootProperties,
    formatPreference: 'binary' as RobloxArtifactFormat,
    scene,
    scripts,
    assets: [],
  };
}

// Session 353 — Roblox `BasePart.Shape = Cylinder` lays the cylinder horizontally:
// long axis = part-local X, circular face is perpendicular to X. So size = [W, H, D]
// is interpreted as length-W cylinder along X with diameter min(H, D). Without rotation,
// a "tall thin pole" emitted with size [0.16, 2.8, 0.16] renders as a 0.16-stud-long
// X-axis cylinder with a 0.16 diameter — a flat disc, not a pole. The fix below picks
// the intended cylinder axis (the world axis whose other two dims are most equal —
// because a cylinder has a circular cross-section) and emits a CFrame rotation so
// part-local X aligns with that axis, plus a permuted Size so the rendered world
// extents match the [W, H, D] the caller asked for.
type CylAxis = 0 | 1 | 2;
function pickCylinderAxis(size: [number, number, number]): CylAxis {
  const [sx, sy, sz] = size;
  const cand: Array<{ axis: CylAxis; ratio: number; len: number }> = [
    { axis: 0, ratio: Math.min(sy, sz) / Math.max(sy, sz), len: sx },
    { axis: 1, ratio: Math.min(sx, sz) / Math.max(sx, sz), len: sy },
    { axis: 2, ratio: Math.min(sx, sy) / Math.max(sx, sy), len: sz },
  ];
  // Best candidate = the axis whose OTHER two dims are most equal (closest to 1).
  // Tie-break: prefer the axis whose length is the longest (so a 1×4×1 pole picks Y).
  cand.sort((a, b) => (b.ratio - a.ratio) || (b.len - a.len));
  return cand[0].axis;
}
function cylinderRotationFor(axis: CylAxis): number[] {
  // Row-major 3x3 rotation matrix R such that part-local X = world axis.
  // Identity for axis=0 (default Roblox cylinder lying along X).
  if (axis === 1) return [0, -1, 0, 1, 0, 0, 0, 0, 1];      // +90° around Z: part-X → world-Y
  if (axis === 2) return [0, 0, 1, 0, 1, 0, -1, 0, 0];      // -90° around Y: part-X → world-Z
  return [1, 0, 0, 0, 1, 0, 0, 0, 1];
}
function permutedSizeForCylinder(
  size: [number, number, number],
  axis: CylAxis,
): [number, number, number] {
  // Part-local size such that, after the rotation above, the world extents match `size`.
  // axis=0: identity. axis=1: swap X/Y. axis=2: swap X/Z.
  if (axis === 1) return [size[1], size[0], size[2]];
  if (axis === 2) return [size[2], size[1], size[0]];
  return [size[0], size[1], size[2]];
}

// ── Furniture & Props manifest builder (session #108, hardened #270) ──
// Builds an anchored single-prop Model with a stable invisible Handle as PrimaryPart.
// The visible fallback is made from typed primitive Parts (chair/table/lamp/etc.)
// instead of the old torso.mesh placeholder. If an uploaded Roblox Model asset is
// available, a runtime loader swaps in the AI mesh through InsertService.
// Session 359 — AI Mesh path now mirrors NPC's TextureID fallback chain. When the
// Engine API extraction returns no inner textureId (Meshy GLBs often bake textures
// into the binary, leaving the wrapper Model's MeshPart with TextureID="") we fall
// back to metadata.textureDecalAssetId / metadata.textureAssetId set by the
// texture_upload stage. Without this, the imported .rbxm tints the entire mesh
// with BasePart.Color3=primaryColor3 (green for plant, etc.) instead of showing
// the actual AI-generated PBR texture — user complaint: "цвет фигуры не тот".
// Session 358 — hybrid skeleton covers chair/table/shelf/bed (in addition to
// lamp/plant/sign from session 357).
const FURNITURE_BUILDER_VERSION = 'hybrid-skeleton-v3-2026-05-19';

function buildFurnitureModelManifest(
  args: {
    title: string;
    summary: string;
    target: RobloxBuildTarget;
    prompt: string;
    starterScript: string;
    metadata?: Record<string, unknown>;
  },
  metadata: Record<string, unknown>,
): RobloxBuildManifest {
  // Session 357 — higher-severity entry log (warn vs info) so Firebase logs sampling
  // doesn't drop the single most diagnostic line. If this doesn't appear for a job,
  // we know production is still serving stale code from a warm instance.
  logger.warn('[buildFurnitureModelManifest] ENTRY', {
    builderVersion: FURNITURE_BUILDER_VERSION,
    title: args.title,
    furnitureBuildMode: metadata.furnitureBuildMode,
    furnitureResolvedBuildMode: metadata.furnitureResolvedBuildMode,
    hasLLMScene: typeof metadata.furnitureLLMScene === 'string' && (metadata.furnitureLLMScene as string).length > 0,
  });
  // Session 346 diag — confirm which mesh-related fields reached the builder.
  logger.info('[buildFurnitureModelManifest] entry', {
    title: args.title,
    furnitureBuildMode: metadata.furnitureBuildMode,
    furnitureResolvedBuildMode: metadata.furnitureResolvedBuildMode,
    meshAssetIdType: typeof metadata.meshAssetId,
    meshAssetId: metadata.meshAssetId,
    furnitureRealMeshIdType: typeof metadata.furnitureRealMeshId,
    furnitureRealMeshId: metadata.furnitureRealMeshId,
    furnitureRealTextureId: metadata.furnitureRealTextureId,
    hasLLMScene: typeof metadata.furnitureLLMScene === 'string' && (metadata.furnitureLLMScene as string).length > 0,
  });
  const handleId = uuidv4();
  const shortTitle = (() => {
    const raw = (args.title || 'Generated Furniture').trim();
    const beforeDash = raw.split(/\s[-–—]\s/)[0].trim();
    if (beforeDash && beforeDash.length < raw.length) return beforeDash.slice(0, 50);
    return raw.split(/\s+/).slice(0, 5).join(' ').slice(0, 50);
  })();
  const normalizedName = sanitizeSystemName(shortTitle) || shortTitle || 'GeneratedFurniture';
  // Session 358 — added 'bed' as a new structural type (frame + mattress + 4 legs + headboard).
  const knownTypes = ['chair', 'table', 'lamp', 'shelf', 'rug', 'plant', 'sign', 'bed', 'decor'] as const;
  type FurnitureType = typeof knownTypes[number];
  const rawType = typeof metadata.furnitureType === 'string'
    ? metadata.furnitureType.toLowerCase().trim()
    : '';
  const requestText = `${args.prompt} ${args.title} ${metadata.title ?? ''}`.toLowerCase();
  const typeAliases: Array<[FurnitureType, RegExp]> = [
    // 'bed' MUST come before 'chair' so "bunk bed" / "single bed" don't match the bench/sofa pattern in chair.
    ['bed', /\b(bed|bunk\s*bed|cot|mattress|berth|hammock|futon)\b|кроват|постел|спальн|матрас|гамак/i],
    ['chair', /\b(chair|seat|bench|stool|sofa|couch|throne|armchair)\b|стул|кресл|диван|трон|скам/i],
    ['table', /\b(table|desk|counter|workbench|nightstand|coffee\s*table)\b|стол|пар(т|тa)|стойк/i],
    ['lamp', /\b(lamp|lantern|torch|light|chandelier|sconce)\b|ламп|фонар|свет|факел|люстр/i],
    ['shelf', /\b(shelf|bookcase|bookshelf|rack|cabinet|server\s*rack)\b|полк|шкаф|стеллаж/i],
    ['rug', /\b(rug|carpet|mat|runner)\b|ков(е|ё)р|коврик/i],
    ['plant', /\b(plant|tree|flower|bonsai|fern|potted)\b|растен|цвет|дерев|бонсай/i],
    ['sign', /\b(sign|poster|billboard|banner|plaque|label)\b|вывес|плакат|баннер|таблич/i],
  ];
  const detectedType = typeAliases.find(([, pattern]) => pattern.test(requestText))?.[0] ?? 'decor';
  // Session 346 — when an LLM scene JSON is in metadata, the SCENE's furnitureType
  // is authoritative. We've seen production bugs where metadata.furnitureType was
  // stale ("table" from a prior chat) but the LLM correctly classified the prop as
  // "lamp" — and the builder shipped a table-shaped Handle around lamp parts.
  let llmSceneFurnitureType: string | undefined;
  if (typeof metadata.furnitureLLMScene === 'string') {
    try {
      const parsed = JSON.parse(metadata.furnitureLLMScene) as { furnitureType?: unknown };
      if (typeof parsed.furnitureType === 'string') {
        const cleaned = parsed.furnitureType.toLowerCase().trim();
        if ((knownTypes as readonly string[]).includes(cleaned)) {
          llmSceneFurnitureType = cleaned;
        }
      }
    } catch { /* ignore parse errors — caught later when emitting parts */ }
  }
  const furnitureType: FurnitureType = (llmSceneFurnitureType as FurnitureType | undefined)
    ?? ((knownTypes as readonly string[]).includes(rawType) ? (rawType as FurnitureType) : detectedType);
  const rawMeshAssetId = typeof metadata.meshAssetId === 'string' ? metadata.meshAssetId : undefined;
  const buildMode = typeof metadata.furnitureResolvedBuildMode === 'string'
    ? metadata.furnitureResolvedBuildMode
    : (typeof metadata.furnitureBuildMode === 'string' ? metadata.furnitureBuildMode : 'auto');

  // Per-type colour defaults — overridden by user-picked metadata.primaryColor / accentColor / glowColor.
  const typeDefaults: Record<FurnitureType, {
    primary: { r: number; g: number; b: number };
    accent:  { r: number; g: number; b: number };
    glow:    { r: number; g: number; b: number };
  }> = {
    chair: { primary: { r: 0.55, g: 0.38, b: 0.22 }, accent: { r: 0.78, g: 0.62, b: 0.42 }, glow: { r: 1, g: 0.95, b: 0.85 } },
    table: { primary: { r: 0.45, g: 0.30, b: 0.18 }, accent: { r: 0.70, g: 0.55, b: 0.35 }, glow: { r: 1, g: 0.95, b: 0.85 } },
    lamp:  { primary: { r: 0.85, g: 0.78, b: 0.55 }, accent: { r: 0.30, g: 0.30, b: 0.32 }, glow: { r: 1.0, g: 0.92, b: 0.65 } },
    shelf: { primary: { r: 0.50, g: 0.34, b: 0.20 }, accent: { r: 0.72, g: 0.58, b: 0.40 }, glow: { r: 1, g: 0.95, b: 0.85 } },
    rug:   { primary: { r: 0.60, g: 0.20, b: 0.20 }, accent: { r: 0.95, g: 0.85, b: 0.60 }, glow: { r: 1, g: 0.9, b: 0.7 } },
    plant: { primary: { r: 0.20, g: 0.55, b: 0.25 }, accent: { r: 0.45, g: 0.30, b: 0.18 }, glow: { r: 0.6, g: 0.95, b: 0.6 } },
    sign:  { primary: { r: 0.95, g: 0.95, b: 0.92 }, accent: { r: 0.30, g: 0.20, b: 0.15 }, glow: { r: 1.0, g: 0.95, b: 0.7 } },
    bed:   { primary: { r: 0.85, g: 0.78, b: 0.68 }, accent: { r: 0.42, g: 0.28, b: 0.18 }, glow: { r: 1, g: 0.92, b: 0.78 } },
    decor: { primary: { r: 0.75, g: 0.75, b: 0.78 }, accent: { r: 0.95, g: 0.90, b: 1.0 },  glow: { r: 0.8, g: 0.9, b: 1.0 } },
  };
  const defaults = typeDefaults[furnitureType];
  const primaryRgb = hexToColor3(metadata.primaryColor) ?? defaults.primary;
  const accentRgb  = hexToColor3(metadata.accentColor)  ?? defaults.accent;
  const glowRgb    = hexToColor3(metadata.glowColor)    ?? defaults.glow;
  const primaryColor3 = color3(primaryRgb.r, primaryRgb.g, primaryRgb.b);
  const accentColor3  = color3(accentRgb.r,  accentRgb.g,  accentRgb.b);
  const glowColor3    = color3(glowRgb.r,    glowRgb.g,    glowRgb.b);

  // Per-type bounding box (studs). User-tunable via metadata.scale = 'small'|'medium'|'large'.
  const baseSize: Record<FurnitureType, [number, number, number]> = {
    chair: [2.5, 3.0, 2.5],
    table: [4.0, 2.6, 2.5],
    lamp:  [1.4, 4.5, 1.4],
    shelf: [3.0, 4.0, 0.6],
    rug:   [6.0, 0.12, 4.0],
    plant: [1.5, 2.5, 1.5],
    sign:  [3.0, 2.0, 0.2],
    bed:   [5.0, 2.6, 3.0],
    decor: [1.5, 1.5, 1.5],
  };
  const scaleFactor = metadata.scale === 'small' ? 0.7 : metadata.scale === 'large' ? 1.4 : 1.0;
  const handleSize: [number, number, number] = [
    baseSize[furnitureType][0] * scaleFactor,
    baseSize[furnitureType][1] * scaleFactor,
    baseSize[furnitureType][2] * scaleFactor,
  ];

  // Per-type material — wood for furniture, fabric for rug, grass for plant, plastic for sign/decor, metal for lamp.
  const materialByType: Record<FurnitureType, { enumName: string; value: number }> = {
    chair: { enumName: 'Wood',         value: 512 },
    table: { enumName: 'WoodPlanks',   value: 528 },
    lamp:  { enumName: 'Metal',        value: 1088 },
    shelf: { enumName: 'Wood',         value: 512 },
    rug:   { enumName: 'Fabric',       value: 1312 },
    plant: { enumName: 'Grass',        value: 1280 },
    sign:  { enumName: 'SmoothPlastic',value: 272 },
    bed:   { enumName: 'WoodPlanks',   value: 528 },
    decor: { enumName: 'SmoothPlastic',value: 272 },
  };
  const material = materialByType[furnitureType];

  const extractedMeshId = rawMeshAssetId?.match(/\d+/)?.[0];
  const isValidMeshId = extractedMeshId && extractedMeshId.length >= 5 && extractedMeshId.length <= 16;
  const numericMeshModelId = isValidMeshId ? Number(extractedMeshId) : 0;

  // Session 346 — inner MeshId/TextureID extracted from the Model wrapper via
  // Roblox Open Cloud Engine API. When present we bake a first-class MeshPart
  // straight into the .rbxm so Studio displays the real mesh immediately on
  // import, no Play required.
  const rawFurnitureRealMeshId = typeof metadata.furnitureRealMeshId === 'string' ? metadata.furnitureRealMeshId.trim() : '';
  const realMeshIdNum = rawFurnitureRealMeshId ? Number.parseInt(rawFurnitureRealMeshId, 10) : 0;
  const hasBakedFurnitureMesh = Number.isFinite(realMeshIdNum) && realMeshIdNum > 0;
  const rawFurnitureRealTextureId = typeof metadata.furnitureRealTextureId === 'string' ? metadata.furnitureRealTextureId.trim() : '';
  const realTextureIdNum = rawFurnitureRealTextureId ? Number.parseInt(rawFurnitureRealTextureId, 10) : 0;

  // Anchored Model — furniture sits in the world, not held as a Tool.
  // PrimaryPart = invisible Handle so users can move the whole prop with PivotTo.
  // Session 346 — when an LLM scene is present, Handle is MINIMAL (0.5 stud cube
  // at y=0.25) so the model's bounding-box bottom matches the prop's actual floor-
  // touching base. With the previous big Handle (sized to the full bbox like 1.4×4.5×1.4
  // for a lamp), Studio's drop-on-surface offset moved the entire prop up by half the
  // Handle height — the lamp ended up floating ~2 studs above the baseplate.
  const hasLLMSceneForHandle = typeof metadata.furnitureLLMScene === 'string' && metadata.furnitureLLMScene.length > 10;
  const handleSizeForBuild: [number, number, number] = hasLLMSceneForHandle
    ? [0.5, 0.5, 0.5]
    : handleSize;
  const handleCFrameY = hasLLMSceneForHandle ? 0.25 : handleSize[1] / 2;
  const scene: RobloxBuildSceneNode[] = [
    {
      id: handleId,
      className: 'Part',
      name: 'Handle',
      properties: {
        Size: vector3(handleSizeForBuild[0], handleSizeForBuild[1], handleSizeForBuild[2]),
        CFrame: cframe(0, handleCFrameY, 0),
        Transparency: 1,
        Anchored: true,
        CanCollide: false,
        Locked: false,
        Color: primaryColor3,
        Material: enumValue('Material', material.enumName, material.value),
        Shape: enumValue('PartType', 'Block', 1),
      },
    },
    {
      id: uuidv4(),
      className: 'StringValue',
      name: 'FurnitureType',
      properties: { Value: furnitureType },
    },
    {
      id: uuidv4(),
      className: 'StringValue',
      name: 'FurnitureBuildMode',
      properties: { Value: buildMode },
    },
    {
      // Session 357 — forensic marker. Open the .rbxm in Studio (or read the
      // binary) and look for this StringValue: it tells you which builder
      // version assembled the model. Mismatch with the local FURNITURE_BUILDER_VERSION
      // constant means production is serving stale code.
      id: uuidv4(),
      className: 'StringValue',
      name: 'BuilderVersion',
      properties: { Value: FURNITURE_BUILDER_VERSION },
    },
  ];

  if (numericMeshModelId > 0) {
    scene.push({
      id: uuidv4(),
      className: 'StringValue',
      name: 'AIMeshModelAssetId',
      properties: { Value: String(numericMeshModelId) },
    });
  }

  // Session 346 — bake a static MeshPart with the real numeric MeshId/TextureID.
  // This lets Studio render the AI mesh the moment the user opens the .rbxm in
  // Edit mode — no need to press Play. The fallback Parts below stay anchored
  // and visible too, but we hide them when a real mesh is baked so they don't
  // overlap the proper geometry.
  if (hasBakedFurnitureMesh) {
    const meshSizeY = typeof metadata.furnitureRealMeshSizeY === 'number' && metadata.furnitureRealMeshSizeY > 0.1
      ? Number(metadata.furnitureRealMeshSizeY) : handleSize[1];
    const meshSizeX = typeof metadata.furnitureRealMeshSizeX === 'number' && metadata.furnitureRealMeshSizeX > 0.1
      ? Number(metadata.furnitureRealMeshSizeX) : handleSize[0];
    const meshSizeZ = typeof metadata.furnitureRealMeshSizeZ === 'number' && metadata.furnitureRealMeshSizeZ > 0.1
      ? Number(metadata.furnitureRealMeshSizeZ) : handleSize[2];
    // Session 359 — TextureID resolution mirroring NPC (robloxWorker.ts:6196-6203).
    // Priority: Engine API real TextureID > texture_upload's textureDecalAssetId >
    // texture_upload's textureAssetId. Meshy GLBs often bake textures into the
    // binary, leaving the inner MeshPart's TextureID empty — without the fallback
    // chain the imported .rbxm has no texture and the mesh shows pure Color3 tint.
    let resolvedTextureId = '';
    if (realTextureIdNum > 0) {
      resolvedTextureId = `rbxassetid://${realTextureIdNum}`;
    } else {
      const fallbackTexId = (typeof metadata.textureDecalAssetId === 'string' && metadata.textureDecalAssetId.trim())
        ? metadata.textureDecalAssetId.trim()
        : (typeof metadata.textureAssetId === 'string' && metadata.textureAssetId.trim())
          ? metadata.textureAssetId.trim()
          : '';
      if (fallbackTexId) {
        resolvedTextureId = `rbxassetid://${fallbackTexId}`;
      }
    }
    const meshProperties: Record<string, unknown> = {
      Size: vector3(meshSizeX, meshSizeY, meshSizeZ),
      CFrame: cframe(0, meshSizeY / 2, 0),
      Anchored: true,
      CanCollide: true,
      Locked: false,
      Transparency: 0,
      // Session 359 — when a TextureID is present, set Color3 to white so the
      // PBR texture passes through uncolored. Otherwise BasePart.Color3 multiplies
      // with the texture and the user's primaryColor (green for plant, terracotta
      // for ceramic, etc.) muddies the AI-generated colors. Without a texture,
      // fall back to primaryColor3 so the mesh shows the brief's color rather
      // than pure white-grey untextured render.
      Color: resolvedTextureId ? color3(1, 1, 1) : primaryColor3,
      Material: enumValue('Material', material.enumName, material.value),
      MeshId: `rbxassetid://${realMeshIdNum}`,
    };
    if (resolvedTextureId) {
      meshProperties.TextureID = resolvedTextureId;
    }
    logger.info('[buildFurnitureModelManifest] AIMeshBody texture resolution', {
      realTextureIdNum,
      textureDecalAssetIdPresent: typeof metadata.textureDecalAssetId === 'string' && metadata.textureDecalAssetId.trim().length > 0,
      textureAssetIdPresent: typeof metadata.textureAssetId === 'string' && metadata.textureAssetId.trim().length > 0,
      resolvedTextureId: resolvedTextureId || '(none — mesh will be tinted with primaryColor3)',
    });
    scene.push({
      id: uuidv4(),
      className: 'MeshPart',
      name: 'AIMeshBody',
      properties: meshProperties,
    });
  }

  // Roblox Enum.Material integer values. Verified against the Roblox Creator Docs.
  const materialValues: Record<string, number> = {
    Plastic: 256,
    SmoothPlastic: 272,
    Neon: 288,
    Wood: 512,
    WoodPlanks: 528,
    Marble: 784,
    Slate: 800,
    Concrete: 816,
    Granite: 832,
    Brick: 848,
    Pebble: 864,
    Cobblestone: 880,
    Metal: 1088,
    CorrodedMetal: 1040,
    DiamondPlate: 1056,
    Foil: 1072,
    Grass: 1280,
    Sand: 1296,
    Fabric: 1312,
    Ice: 1536,
    Glass: 1568,
  };

  // Session 346 — when the blocky pipeline produced an LLM scene, emit those Parts
  // directly. The deterministic fallback below is skipped because the LLM scene already
  // describes every Part with explicit role/position/size/color/material.
  type LLMScenePartShape = { name: string; kind: 'Part' | 'Seat'; role?: string; shape?: 'Block' | 'Cylinder' | 'Ball';
    position: [number, number, number]; size: [number, number, number]; color: string;
    material: string; transparency?: number; canCollide?: boolean };
  const llmSceneRaw = typeof metadata.furnitureLLMScene === 'string' ? metadata.furnitureLLMScene : '';
  let llmSceneParts: LLMScenePartShape[] = [];
  if (llmSceneRaw) {
    try {
      const parsed = JSON.parse(llmSceneRaw) as { parts?: LLMScenePartShape[] };
      if (parsed && Array.isArray(parsed.parts)) llmSceneParts = parsed.parts;
    } catch {
      llmSceneParts = [];
    }
  }
  const shapeNumByName: Record<string, number> = { Ball: 0, Block: 1, Cylinder: 2 };

  // ── Session 355 — Hybrid skeleton infrastructure ──
  // Moved out of the post-LLM-branch fall-through so both paths can call the same
  // proven-correct deterministic skeleton. The LLM-scene branch used to early-return
  // and skip this entirely; for furnitureType ∈ {lamp, plant, sign} we now ALWAYS
  // emit the skeleton (base + pole + shade / pot + stem + leaves / post + board)
  // and restrict the LLM to additive accent roles. The cylinder rotation math from
  // session 353 is reused unchanged.
  const shapeValues: Record<'Block' | 'Ball' | 'Cylinder', number> = { Ball: 0, Block: 1, Cylinder: 2 };
  const pushFallbackPart = (
    suffix: string,
    size: [number, number, number],
    position: [number, number, number],
    color: Record<string, unknown>,
    materialName: string,
    options: {
      className?: 'Part' | 'Seat';
      shape?: 'Block' | 'Ball' | 'Cylinder';
      canCollide?: boolean;
      transparency?: number;
      extra?: Record<string, unknown>;
    } = {},
  ): string => {
    const id = uuidv4();
    const shapeName = options.shape ?? 'Block';
    // Session 346 — when a baked AI MeshPart is present in the scene, the fallback
    // primitives would overlap the real mesh in Edit mode. Hide them by default
    // (transparency=1, no collision) so only the proper mesh shows.
    const hideForBakedMesh = hasBakedFurnitureMesh;
    // Session 353 — Cylinder-axis fix. Callers pass size = [W, H, D] in world axes
    // (e.g. LampPole [0.16, h*0.70, 0.16]). Without rotation, that becomes a 0.16-
    // stud horizontal cylinder along part-X. Pick the intended axis (most-equal
    // cross-section) and emit a CFrame rotation + permuted part-local Size so the
    // rendered world extents match `size`.
    let partSize: [number, number, number] = [size[0], size[1], size[2]];
    let partCFrame: Record<string, unknown> = cframe(position[0], position[1], position[2]);
    if (shapeName === 'Cylinder') {
      const axis = pickCylinderAxis(size);
      partSize = permutedSizeForCylinder(size, axis);
      const r = cylinderRotationFor(axis);
      partCFrame = {
        __type: 'CFrame',
        position: { x: position[0], y: position[1], z: position[2] },
        rotation: r,
      };
    }
    scene.push({
      id,
      className: options.className ?? 'Part',
      name: `Fallback${suffix}`,
      properties: {
        Size: vector3(partSize[0], partSize[1], partSize[2]),
        CFrame: partCFrame,
        Anchored: true,
        CanCollide: hideForBakedMesh ? false : (options.canCollide ?? true),
        Locked: false,
        Transparency: hideForBakedMesh ? 1 : (options.transparency ?? 0),
        Color: color,
        Material: enumValue('Material', materialName, materialValues[materialName]),
        Shape: enumValue('PartType', shapeName, shapeValues[shapeName]),
        ...(options.extra ?? {}),
      },
    });
    return id;
  };

  // Skeleton emitter — runs the same per-type switch we used to inline below the
  // LLM branch. Returns the part id that should host the PointLight (lamp shade /
  // sign board). For non-light types returns handleId as a safe default.
  let skeletonLightParentId = handleId;
  const emitSkeleton = (): void => {
    const [w, h, d] = handleSize;
    switch (furnitureType) {
      case 'chair': {
        pushFallbackPart('ChairSeat', [w * 0.82, 0.32, d * 0.75], [0, h * 0.34, 0], accentColor3, 'Fabric', {
          className: 'Seat',
          extra: { Disabled: false },
        });
        pushFallbackPart('ChairBack', [w * 0.85, h * 0.65, 0.22], [0, h * 0.66, d * 0.34], primaryColor3, 'Wood');
        for (const x of [-1, 1]) for (const z of [-1, 1]) {
          pushFallbackPart('ChairLeg', [0.20, h * 0.48, 0.20], [x * w * 0.33, h * 0.12, z * d * 0.28], primaryColor3, 'Wood');
        }
        break;
      }
      case 'table': {
        pushFallbackPart('TableTop', [w, 0.32, d], [0, h * 0.78, 0], primaryColor3, 'WoodPlanks');
        for (const x of [-1, 1]) for (const z of [-1, 1]) {
          pushFallbackPart('TableLeg', [0.22, h * 0.72, 0.22], [x * w * 0.39, h * 0.38, z * d * 0.36], accentColor3, 'Wood');
        }
        break;
      }
      case 'lamp': {
        pushFallbackPart('LampBase', [w * 0.85, 0.18, d * 0.85], [0, 0.09, 0], accentColor3, 'Metal', { shape: 'Cylinder' });
        pushFallbackPart('LampPole', [0.16, h * 0.70, 0.16], [0, h * 0.38, 0], accentColor3, 'Metal', { shape: 'Cylinder' });
        // Session 357 — shade as Cylinder (lying flat with axis = world Y) gives a
        // real lamp-shade look; the previous Block looked like a square box on top.
        // pickCylinderAxis picks Y because X≈Z and Y is the thin axis.
        skeletonLightParentId = pushFallbackPart('LampShade', [w * 0.92, h * 0.24, d * 0.92], [0, h * 0.78, 0], primaryColor3, 'SmoothPlastic', { shape: 'Cylinder' });
        break;
      }
      case 'shelf': {
        pushFallbackPart('ShelfBack', [w, h, 0.12], [0, h * 0.5, d * 0.18], primaryColor3, 'Wood');
        pushFallbackPart('ShelfLeftSide', [0.16, h, d], [-w * 0.48, h * 0.5, 0], primaryColor3, 'Wood');
        pushFallbackPart('ShelfRightSide', [0.16, h, d], [w * 0.48, h * 0.5, 0], primaryColor3, 'Wood');
        for (const y of [0.18, 0.42, 0.66, 0.90]) {
          pushFallbackPart('ShelfBoard', [w, 0.12, d], [0, h * y, 0], accentColor3, 'WoodPlanks');
        }
        break;
      }
      case 'rug': {
        pushFallbackPart('RugBody', [w, Math.max(0.06, h), d], [0, Math.max(0.03, h * 0.5), 0], primaryColor3, 'Fabric', { canCollide: false });
        pushFallbackPart('RugTrimFront', [w, 0.04, 0.12], [0, h + 0.03, d * 0.47], accentColor3, 'Fabric', { canCollide: false });
        pushFallbackPart('RugTrimBack', [w, 0.04, 0.12], [0, h + 0.03, -d * 0.47], accentColor3, 'Fabric', { canCollide: false });
        pushFallbackPart('RugTrimLeft', [0.12, 0.04, d], [-w * 0.47, h + 0.03, 0], accentColor3, 'Fabric', { canCollide: false });
        pushFallbackPart('RugTrimRight', [0.12, 0.04, d], [w * 0.47, h + 0.03, 0], accentColor3, 'Fabric', { canCollide: false });
        break;
      }
      case 'plant': {
        pushFallbackPart('PlantPot', [w * 0.72, h * 0.32, d * 0.72], [0, h * 0.16, 0], accentColor3, 'SmoothPlastic', { shape: 'Cylinder' });
        pushFallbackPart('PlantStem', [0.16, h * 0.42, 0.16], [0, h * 0.48, 0], accentColor3, 'Wood', { shape: 'Cylinder', canCollide: false });
        pushFallbackPart('PlantLeavesCenter', [w, h * 0.38, d], [0, h * 0.76, 0], primaryColor3, 'Grass', { shape: 'Ball', canCollide: false });
        pushFallbackPart('PlantLeavesSideA', [w * 0.70, h * 0.30, d * 0.70], [-w * 0.30, h * 0.66, 0], primaryColor3, 'Grass', { shape: 'Ball', canCollide: false });
        pushFallbackPart('PlantLeavesSideB', [w * 0.70, h * 0.30, d * 0.70], [w * 0.30, h * 0.66, 0], primaryColor3, 'Grass', { shape: 'Ball', canCollide: false });
        break;
      }
      case 'sign': {
        pushFallbackPart('SignPost', [0.18, h * 0.70, 0.18], [0, h * 0.28, 0], accentColor3, 'Wood');
        skeletonLightParentId = pushFallbackPart('SignBoard', [w, h * 0.55, Math.max(0.16, d)], [0, h * 0.74, 0], primaryColor3, 'SmoothPlastic');
        pushFallbackPart('SignTopTrim', [w, 0.10, Math.max(0.18, d)], [0, h * 1.03, 0], accentColor3, 'Wood');
        pushFallbackPart('SignBottomTrim', [w, 0.10, Math.max(0.18, d)], [0, h * 0.45, 0], accentColor3, 'Wood');
        break;
      }
      case 'bed': {
        // Bed = frame (low platform) + mattress + 4 corner legs + headboard at z=-d/2.
        // h is bed bounding height (~2.6 by default); legs are 0.30 tall, frame 0.18,
        // mattress 0.55, headboard rises to ~h.
        const legHeight = 0.30;
        const frameHeight = 0.18;
        const mattressHeight = 0.55;
        const frameY = legHeight + frameHeight / 2;
        const mattressY = legHeight + frameHeight + mattressHeight / 2;
        // 4 corner legs.
        for (const x of [-1, 1]) for (const z of [-1, 1]) {
          pushFallbackPart('BedLeg', [0.28, legHeight, 0.28],
            [x * w * 0.40, legHeight / 2, z * d * 0.42], accentColor3, 'Wood');
        }
        // Frame slab — wood color (primary).
        pushFallbackPart('BedFrame', [w * 0.96, frameHeight, d * 0.96],
          [0, frameY, 0], primaryColor3, 'WoodPlanks');
        // Mattress — fabric, accent-colored linens look pulled later by LLM trim accents.
        pushFallbackPart('BedMattress', [w * 0.92, mattressHeight, d * 0.88],
          [0, mattressY, 0], glowColor3, 'Fabric', { canCollide: true });
        // Pillow at the head end (negative Z by convention — feet point +Z).
        pushFallbackPart('BedPillow', [w * 0.40, 0.18, d * 0.18],
          [0, mattressY + mattressHeight / 2 + 0.09, -d * 0.34], primaryColor3, 'Fabric', { canCollide: false });
        // Headboard — tall flat panel at the head, on top of the frame, rising to h.
        const headboardHeight = h - (legHeight + frameHeight);
        const headboardCenterY = legHeight + frameHeight + headboardHeight / 2;
        pushFallbackPart('BedHeadboard', [w * 0.94, headboardHeight, 0.18],
          [0, headboardCenterY, -d * 0.49], primaryColor3, 'WoodPlanks');
        // Optional footboard (shorter than headboard) — gives the bed a finished read.
        pushFallbackPart('BedFootboard', [w * 0.94, headboardHeight * 0.45, 0.16],
          [0, legHeight + frameHeight + (headboardHeight * 0.45) / 2, d * 0.49], primaryColor3, 'WoodPlanks');
        break;
      }
      case 'decor':
      default: {
        pushFallbackPart('DecorBase', [w, h * 0.25, d], [0, h * 0.13, 0], accentColor3, 'SmoothPlastic');
        pushFallbackPart('DecorCore', [w * 0.82, h * 0.72, d * 0.82], [0, h * 0.58, 0], primaryColor3, 'SmoothPlastic', { shape: 'Ball' });
        break;
      }
    }
  };

  // Session 358 — hybrid skeleton now covers ALL load-bearing types: chair, table,
  // shelf, bed, lamp, plant, sign. The LLM has repeatedly produced broken structural
  // parts (sideways posts, legs above the tabletop, wrong role labels, disconnected
  // stacks) across every furniture type. Always run the deterministic skeleton for
  // these types; LLM is restricted to additive accents.
  // Only rug + decor stay LLM-first (rug is flat → hard to mess up, decor is a
  // catch-all where the LLM's creative input is the whole value).
  const HYBRID_SKELETON_TYPES = new Set<FurnitureType>([
    'chair', 'table', 'lamp', 'shelf', 'plant', 'sign', 'bed',
  ]);
  const ACCENT_ROLES = new Set<string>(['trim', 'detail', 'decor', 'light', 'leaves', 'panel', 'shade']);
  const useHybridSkeleton = HYBRID_SKELETON_TYPES.has(furnitureType);

  if (llmSceneParts.length > 0) {
    // Session 346 — auto-widen guard. LLMs keep producing realistic-but-invisible
    // 0.08-0.25 stud structural posts/stems/trunks AND thin neon "LED strip" lights
    // even after explicit prompt rules and validator rejects. From gameplay distance
    // these read as nothing, so the top/shade/leaves "float". Force their narrow
    // dims up here — last line of defense before the rbxm is written, regardless
    // of whether the validator passed or shipped a best-of-N rejected scene.
    const structuralRolesAutoWiden = new Set(['post', 'stem', 'trunk', 'support', 'light']);
    const MIN_STRUCTURAL_NARROW = 0.32;
    let widenedCount = 0;
    for (const p of llmSceneParts) {
      if (!p.role || !structuralRolesAutoWiden.has(p.role)) continue;
      // Identify the "narrow" dims as the two smallest (the third is the "long" axis).
      const dims: Array<{ idx: 0 | 1 | 2; v: number }> = [
        { idx: 0, v: p.size[0] }, { idx: 1, v: p.size[1] }, { idx: 2, v: p.size[2] },
      ].sort((a, b) => a.v - b.v) as Array<{ idx: 0 | 1 | 2; v: number }>;
      // Pad the two smallest dims if they're below the min.
      let widenedThis = false;
      for (let i = 0; i < 2; i++) {
        if (dims[i].v < MIN_STRUCTURAL_NARROW) {
          p.size[dims[i].idx] = MIN_STRUCTURAL_NARROW;
          widenedThis = true;
        }
      }
      if (widenedThis) widenedCount++;
    }
    if (widenedCount > 0) {
      logger.info('[buildFurnitureModelManifest] auto-widened structural parts', { widenedCount, min: MIN_STRUCTURAL_NARROW });
    }

    // Session 346 — universal size floor. Any dimension below 0.15 gets bumped to
    // 0.15. Catches sub-min slivers (Neon strips, trim, antennas) that snuck past
    // the validator after best-of-N retries. 0.15 matches the validator's tinyParts
    // threshold — nothing visibly thinner ever reaches Studio.
    const MIN_ANY_DIM = 0.15;
    let flooredCount = 0;
    for (const p of llmSceneParts) {
      for (let i = 0; i < 3; i++) {
        if (p.size[i] < MIN_ANY_DIM) {
          p.size[i] = MIN_ANY_DIM;
          flooredCount++;
        }
      }
    }
    if (flooredCount > 0) {
      logger.info('[buildFurnitureModelManifest] floored sub-min dimensions', { flooredCount, min: MIN_ANY_DIM });
    }

    // Session 355 — hybrid skeleton for verticals-required types. Always emit the
    // proven-correct deterministic skeleton (lamp = base+pole+shade etc.), then
    // restrict LLM parts to additive accent roles. Non-hybrid types still get
    // LLM-first behavior (chair, table, shelf, rug, decor work fine LLM-driven).
    if (useHybridSkeleton) {
      emitSkeleton();
      const before = llmSceneParts.length;
      llmSceneParts = llmSceneParts.filter((p) => ACCENT_ROLES.has((p.role ?? '').toLowerCase()));
      logger.info('[buildFurnitureModelManifest] hybrid skeleton emitted; LLM filtered to accents', {
        type: furnitureType, beforeFilter: before, afterFilter: llmSceneParts.length,
      });
    }

    for (const p of llmSceneParts) {
      const matKey = Object.prototype.hasOwnProperty.call(materialValues, p.material) ? p.material : 'SmoothPlastic';
      const shapeName: 'Block' | 'Ball' | 'Cylinder' = p.shape === 'Cylinder' || p.shape === 'Ball' ? p.shape : 'Block';
      const partRgb = hexToColor3(p.color) ?? defaults.primary;
      // BUG FIX (session 346): rbx-dom does not write the BasePart.Position property —
      // it's derived from CFrame. Using Position silently drops to (0,0,0) for every
      // part, which is what made every furniture prop collapse into the model origin
      // and look like "board + post". Emit CFrame so the binary builder actually
      // records the part's location.
      // BUG FIX (session 353): Roblox Cylinder Shape lies horizontally — long axis is
      // part-local X. The LLM emits size in WORLD axes ([W, H, D]) intending Y as
      // the vertical axis of a pole/post or as the thin axis of a flat disc base.
      // Without rotation, a [0.16, 2.8, 0.16] pole becomes a 0.16-stud horizontal
      // disc; a [1.2, 0.18, 1.2] base becomes a 1.2-stud horizontal tube. We pick
      // the cylinder's intended axis (the world axis whose other two dims are most
      // equal — that's where the circular cross-section lives) and emit a rotation
      // so part-local X aligns with that axis, plus a permuted Size so the rendered
      // world extents still match what the LLM asked for.
      let worldX = Math.max(0.1, p.size[0]) * scaleFactor;
      let worldY = Math.max(0.1, p.size[1]) * scaleFactor;
      let worldZ = Math.max(0.1, p.size[2]) * scaleFactor;
      const worldPosX = p.position[0] * scaleFactor;
      const worldPosY = p.position[1] * scaleFactor;
      const worldPosZ = p.position[2] * scaleFactor;

      // Session 355 — universal aspect-ratio safety net. If any part (Block or
      // Cylinder) is dramatically elongated (longest dim ≥ 1.8× the second-longest)
      // AND that long dim is NOT Y, the LLM almost certainly intended it to stand
      // upright. Normalize by swapping the longest dim into the Y slot. For Block
      // this is the entire fix; for Cylinder the existing role/cylinder-axis logic
      // below then sees Y as the longest and rotates correctly.
      {
        const dimsArr = [worldX, worldY, worldZ];
        const sorted = [...dimsArr].sort((a, b) => b - a);
        const longest = sorted[0];
        const secondLongest = sorted[1];
        const longestIdxAll = worldX >= worldY && worldX >= worldZ
          ? 0
          : (worldZ >= worldY ? 2 : 1);
        if (secondLongest > 0 && longest / secondLongest >= 1.8 && longestIdxAll !== 1) {
          const swapped: [number, number, number] = [worldX, worldY, worldZ];
          const tmp = swapped[1];
          swapped[1] = swapped[longestIdxAll];
          swapped[longestIdxAll] = tmp;
          worldX = swapped[0];
          worldY = swapped[1];
          worldZ = swapped[2];
        }
      }

      let partSizeArr: [number, number, number] = [worldX, worldY, worldZ];
      let rotationMatrix: number[] = [1, 0, 0, 0, 1, 0, 0, 0, 1];
      if (shapeName === 'Cylinder') {
        // Session 353 (fix 2) — role-based axis override. Some LLMs "know" the Roblox
        // cylinder-along-X quirk and pre-rotate by emitting size=[2.8, 0.3, 0.3] for
        // a vertical lamp pole. pickCylinderAxis then correctly picks axis=X (no
        // rotation) and the pole stays horizontal — same broken visual the user saw.
        // For roles that MUST stand upright (post/stem/trunk/support), force axis=Y
        // and remap whichever dim the LLM picked as longest to the Y slot.
        const verticalRoles = new Set(['post', 'stem', 'trunk', 'support']);
        const isVertical = verticalRoles.has((p.role ?? '').toLowerCase());
        let axis: CylAxis;
        let normalizedWorld: [number, number, number] = [worldX, worldY, worldZ];
        if (isVertical) {
          // Pick the longest dim and force it to be world Y.
          const dims: Array<[number, 0 | 1 | 2]> = [[worldX, 0], [worldY, 1], [worldZ, 2]];
          dims.sort((a, b) => b[0] - a[0]);
          const longestIdx = dims[0][1];
          if (longestIdx !== 1) {
            // Swap the longest-dim slot into Y; the other two stay as cross-section.
            const swapped: [number, number, number] = [worldX, worldY, worldZ];
            const tmp = swapped[1];
            swapped[1] = swapped[longestIdx];
            swapped[longestIdx] = tmp;
            normalizedWorld = swapped;
          }
          axis = 1;
        } else {
          axis = pickCylinderAxis([worldX, worldY, worldZ]);
        }
        partSizeArr = permutedSizeForCylinder(normalizedWorld, axis);
        rotationMatrix = cylinderRotationFor(axis);
      }
      scene.push({
        id: uuidv4(),
        className: p.kind === 'Seat' ? 'Seat' : 'Part',
        name: (p.name || `LLMPart${scene.length}`).slice(0, 40),
        properties: {
          Size: vector3(partSizeArr[0], partSizeArr[1], partSizeArr[2]),
          CFrame: {
            __type: 'CFrame',
            position: { x: worldPosX, y: worldPosY, z: worldPosZ },
            rotation: rotationMatrix,
          },
          Anchored: true,
          CanCollide: p.canCollide ?? true,
          Locked: false,
          Transparency: typeof p.transparency === 'number' ? Math.max(0, Math.min(1, p.transparency)) : 0,
          Color: color3(partRgb.r, partRgb.g, partRgb.b),
          Material: enumValue('Material', matKey, materialValues[matKey]),
          Shape: enumValue('PartType', shapeName, shapeNumByName[shapeName]),
          ...(p.kind === 'Seat' ? { Disabled: false } : {}),
        },
      });
    }
  } else {
    // No LLM scene parsed — fall back to deterministic skeleton only.
    emitSkeleton();
  }

  // Lamps and signs get a local light on the visible shade/board, not on the pivot shell.
  if (furnitureType === 'lamp' || furnitureType === 'sign') {
    scene.push({
      id: uuidv4(),
      className: 'PointLight',
      name: 'FurnitureGlow',
      parentId: skeletonLightParentId,
      properties: {
        Brightness: furnitureType === 'lamp' ? 2.5 : 0.8,
        Range: furnitureType === 'lamp' ? 16 : 6,
        Color: glowColor3,
        Enabled: true,
      },
    });
  }

  // Optional interaction scripts via metadata (e.g., shopkeeper sign click handler).
  const furnitureScripts = Array.isArray(metadata.furnitureScripts) ? metadata.furnitureScripts : [];
  const scripts: RobloxBuildScript[] = [];

  // Session 346 — only emit the runtime InsertService loader when we don't already
  // have a baked MeshPart. With a baked AIMeshBody MeshPart in the scene the mesh
  // is visible in Edit mode immediately; the runtime loader would be redundant and
  // might hide our baked MeshPart.
  if (numericMeshModelId > 0 && !hasBakedFurnitureMesh) {
    scripts.push({
      id: 'furniture-ai-mesh-loader',
      name: `${normalizedName}MeshLoader`,
      scriptType: 'Script',
      container: 'Workspace',
      source: `-- Runtime loader for ${shortTitle}: swaps typed primitive fallback for uploaded AI mesh.
local InsertService = game:GetService("InsertService")

local model = script.Parent
local handle = model:FindFirstChild("Handle")
local AI_MESH_MODEL_ID = ${numericMeshModelId}
local FURNITURE_TYPE = "${furnitureType}"

local function setFallbackVisible(visible)
\tfor _, desc in ipairs(model:GetDescendants()) do
\t\tif desc:IsA("BasePart") and desc.Name:sub(1, 8) == "Fallback" then
\t\t\tif desc:IsA("Seat") then
\t\t\t\tdesc.Transparency = visible and 0 or 0.65
\t\t\t\tdesc.CanCollide = true
\t\t\telse
\t\t\t\tdesc.Transparency = visible and 0 or 1
\t\t\t\tdesc.CanCollide = visible
\t\t\tend
\t\tend
\tend
end

local function loadAiMesh()
\tif not handle or AI_MESH_MODEL_ID == 0 then return end
\tlocal ok, loaded = pcall(function()
\t\treturn InsertService:LoadAsset(AI_MESH_MODEL_ID)
\tend)
\tif not (ok and loaded) then
\t\twarn("[FurnitureMeshLoader] InsertService:LoadAsset failed for " .. tostring(AI_MESH_MODEL_ID))
\t\treturn
\tend

\tlocal tmp = Instance.new("Model")
\ttmp.Name = "AIMeshTemp"
\ttmp.Parent = workspace
\tlocal parts = {}
\tfor _, desc in ipairs(loaded:GetDescendants()) do
\t\tif desc:IsA("BasePart") then
\t\t\ttable.insert(parts, desc)
\t\t\tdesc.Parent = tmp
\t\tend
\tend
\tif #parts == 0 then
\t\ttmp:Destroy()
\t\tloaded:Destroy()
\t\treturn
\tend

\tlocal primary = parts[1]
\tlocal maxVolume = 0
\tfor _, part in ipairs(parts) do
\t\tlocal volume = part.Size.X * part.Size.Y * part.Size.Z
\t\tif volume > maxVolume then
\t\t\tmaxVolume = volume
\t\t\tprimary = part
\t\tend
\tend
\ttmp.PrimaryPart = primary
\tlocal _, preSize = tmp:GetBoundingBox()
\tlocal meshLong = math.max(preSize.X, preSize.Y, preSize.Z)
\tlocal targetLong = math.max(handle.Size.X, handle.Size.Y, handle.Size.Z)
\tif FURNITURE_TYPE == "rug" then
\t\ttargetLong = math.max(handle.Size.X, handle.Size.Z)
\tend
\tif meshLong > 0.01 and targetLong > 0.01 then
\t\ttmp:ScaleTo(targetLong / meshLong)
\tend
\ttmp:PivotTo(handle.CFrame)

\tfor _, part in ipairs(tmp:GetDescendants()) do
\t\tif part:IsA("BasePart") then
\t\t\tpart.Name = "AIMesh_" .. part.Name
\t\t\tpart.Anchored = true
\t\t\tpart.CanCollide = FURNITURE_TYPE ~= "rug"
\t\t\tpart.Massless = true
\t\t\tpart.Parent = model
\t\tend
\tend

\ttmp:Destroy()
\tloaded:Destroy()
\tsetFallbackVisible(false)
\tmodel:SetAttribute("AIMeshLoaded", true)
\tmodel:SetAttribute("AIMeshModelAssetId", AI_MESH_MODEL_ID)
end

task.spawn(loadAiMesh)
`,
    });
  }

  scripts.push(...furnitureScripts.map((s: Record<string, unknown>, idx: number) => ({
    id: `furniture-script-${idx}`,
    name: typeof s.name === 'string' ? s.name : `FurnitureScript${idx}`,
    scriptType: (typeof s.scriptType === 'string' ? s.scriptType : 'Script') as 'Script' | 'LocalScript' | 'ModuleScript',
    container: (typeof s.container === 'string' ? s.container : 'Workspace') as
      'ServerScriptService' | 'ReplicatedStorage' | 'StarterPlayerScripts' | 'StarterGui' | 'StarterPack' | 'Workspace',
    source: typeof s.source === 'string' ? s.source : '',
  })));

  if (scripts.length === 0 && args.starterScript) {
    scripts.push({
      id: 'furniture-starter',
      name: `${normalizedName}Starter`,
      scriptType: 'Script' as const,
      container: 'ServerScriptService' as const,
      source: args.starterScript,
    });
  }

  return {
    id: uuidv4(),
    title: shortTitle,
    summary: args.summary,
    target: args.target,
    rootClassName: 'Model',
    rootProperties: {
      PrimaryPart: { __type: 'Ref', id: handleId },
    },
    formatPreference: 'binary' as RobloxArtifactFormat,
    scene,
    scripts,
    assets: [],
  };
}

// ── Building manifest builder (session #097 — Release 2) ────────────
// Builds a Model from a procedural/LLM Scene JSON (parts with position/size/role/tag).
// Supports interior rooms, furniture, doors/seats/spawns/shopCounters (CollectionService-tagged).
// Input: metadata.buildingScene = { model:{name}, parts:[...] }; metadata.buildingScripts = [...].
interface BuildingScenePart {
  id?: string;
  kind?: 'Part' | 'Seat' | 'SpawnLocation' | 'TrussPart' | 'MeshPart';
  name?: string;
  parent?: 'Exterior' | 'Interior' | 'Rooms' | 'Furniture' | 'Interactions' | string;
  role?: string;
  position?: [number, number, number];
  size?: [number, number, number];
  rotation?: [number, number, number];
  color?: string;
  material?: string;
  transparency?: number;
  canCollide?: boolean;
  anchored?: boolean;
  tag?: string | null;
  interactive?: { prompt?: string; holdDuration?: number; objectText?: string } | null;
}

interface BuildingSceneInput {
  model?: { name?: string };
  parts?: BuildingScenePart[];
}

const ROBLOX_MATERIAL_ENUM: Record<string, number> = {
  Plastic: 256, SmoothPlastic: 272, Wood: 512, WoodPlanks: 528,
  Slate: 800, Concrete: 816, CorrodedMetal: 1040, DiamondPlate: 1056,
  Foil: 1072, Grass: 1280, Brick: 945, Marble: 784, Granite: 832, Cobblestone: 880,
  Pebble: 784, Metal: 1088, Sand: 1296, Fabric: 1312, Glass: 1568, Ice: 1536,
};

function resolveBuildingMaterial(name?: string): { enumName: string; value: number } {
  const n = (name || 'Plastic').trim();
  if (ROBLOX_MATERIAL_ENUM[n] !== undefined) {
    return { enumName: n, value: ROBLOX_MATERIAL_ENUM[n] };
  }
  return { enumName: 'Plastic', value: 256 };
}

function hexColorOrFallback(hex: string | undefined, fallback: { r: number; g: number; b: number }): { r: number; g: number; b: number } {
  return hexToColor3(hex) ?? fallback;
}

function buildBuildingModelManifest(
  args: {
    title: string;
    summary: string;
    target: RobloxBuildTarget;
    prompt: string;
    starterScript: string;
    metadata?: Record<string, unknown>;
  },
  metadata: Record<string, unknown>,
): RobloxBuildManifest {
  const shortTitle = (args.title || 'Generated Building').trim().split(/\s+/).slice(0, 6).join(' ').slice(0, 60);
  const normalizedName = sanitizeSystemName(shortTitle) || 'GeneratedBuilding';
  const buildingType = typeof metadata.buildingType === 'string' ? metadata.buildingType : 'house';

  const primaryRgb = hexColorOrFallback(metadata.primaryColor as string | undefined, { r: 0.55, g: 0.5, b: 0.45 });
  const accentRgb = hexColorOrFallback(metadata.accentColor as string | undefined, { r: 0.35, g: 0.25, b: 0.15 });
  const glowRgb = hexColorOrFallback(metadata.glowColor as string | undefined, { r: 1, g: 0.85, b: 0.4 });

  const sceneInput: BuildingSceneInput = (metadata.buildingScene && typeof metadata.buildingScene === 'object')
    ? metadata.buildingScene as BuildingSceneInput
    : { model: { name: normalizedName }, parts: [] };

  const parts: BuildingScenePart[] = Array.isArray(sceneInput.parts) ? sceneInput.parts : [];

  // Subfolder IDs for organized hierarchy.
  const folders: Record<string, string> = {
    Exterior: uuidv4(),
    Interior: uuidv4(),
    Rooms: uuidv4(),
    Furniture: uuidv4(),
    Interactions: uuidv4(),
  };

  const scene: RobloxBuildSceneNode[] = [];

  for (const folderName of Object.keys(folders)) {
    scene.push({
      id: folders[folderName],
      className: 'Folder',
      name: folderName,
      properties: {},
    });
  }

  // Convert building parts.
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i] || {};
    const role = (p.role || 'decor').toString();
    const kind = (p.kind || 'Part').toString();
    const pos = Array.isArray(p.position) ? p.position : [0, 0, 0];
    const size = Array.isArray(p.size) ? p.size : [1, 1, 1];
    const rot = Array.isArray(p.rotation) ? p.rotation : [0, 0, 0];
    const partId = p.id || `bpart_${i}`;
    const partName = (p.name || `${role}_${i}`).toString().slice(0, 60);
    const parentFolder = (p.parent && folders[p.parent]) ? folders[p.parent]
      : role === 'spawn' || role === 'door' || role === 'shopCounter' || role === 'chest' || role === 'seat'
        ? folders.Interactions
        : role === 'furniture'
          ? folders.Furniture
          : role === 'wall' || role === 'floor' || role === 'roof' || role === 'window'
            ? folders.Exterior
            : folders.Interior;

    // Color: prefer part's hex, else role-based default.
    const defaultByRole: Record<string, { r: number; g: number; b: number }> = {
      wall: primaryRgb,
      floor: primaryRgb,
      roof: accentRgb,
      door: accentRgb,
      window: { r: 0.55, g: 0.75, b: 0.95 },
      furniture: accentRgb,
      seat: accentRgb,
      spawn: { r: 0.2, g: 0.7, b: 0.2 },
      shopCounter: accentRgb,
      chest: accentRgb,
      decor: glowRgb,
    };
    const baseColor = hexToColor3(p.color) ?? defaultByRole[role] ?? primaryRgb;

    const materialResolved = resolveBuildingMaterial(
      p.material || (role === 'roof' ? 'Wood' : role === 'door' ? 'Wood' : role === 'window' ? 'Glass' : role === 'floor' ? 'WoodPlanks' : 'Brick'),
    );

    const className = kind === 'Seat' ? 'Seat'
      : kind === 'SpawnLocation' ? 'SpawnLocation'
      : kind === 'TrussPart' ? 'TrussPart'
      : kind === 'MeshPart' ? 'MeshPart'
      : 'Part';

    const props: Record<string, unknown> = {
      Size: { __type: 'Vector3', x: Math.max(0.05, size[0]), y: Math.max(0.05, size[1]), z: Math.max(0.05, size[2]) },
      CFrame: {
        __type: 'CFrame',
        position: { x: pos[0], y: pos[1], z: pos[2] },
        orientation: { x: rot[0], y: rot[1], z: rot[2] },
      },
      Color: color3(baseColor.r, baseColor.g, baseColor.b),
      Material: { __type: 'Enum', enumType: 'Material', enumName: materialResolved.enumName, value: materialResolved.value },
      Anchored: p.anchored !== false,
      CanCollide: p.canCollide !== false,
      Transparency: typeof p.transparency === 'number' ? p.transparency : (role === 'window' ? 0.4 : 0),
      Locked: true,
    };

    scene.push({
      id: partId,
      className,
      name: partName,
      parentId: parentFolder,
      properties: props,
    });

    // Add CollectionService tag via StringValue convention (BuildingServer script reads CollectionService tags).
    // Tag attachment: use Attribute via StringValue children named "__Tag" — BuildingServer AddTag()s on Init.
    if (p.tag) {
      scene.push({
        id: uuidv4(),
        className: 'StringValue',
        name: '__BuildingTag',
        parentId: partId,
        properties: { Value: String(p.tag) },
      });
    }

    // ProximityPrompt for interactive parts.
    if (p.interactive && (role === 'door' || role === 'shopCounter' || role === 'chest')) {
      const prompt = p.interactive.prompt || (role === 'door' ? 'Open' : role === 'shopCounter' ? 'Buy' : 'Open');
      const objectText = p.interactive.objectText || (role === 'door' ? 'Door' : role === 'shopCounter' ? 'Shop' : 'Chest');
      scene.push({
        id: uuidv4(),
        className: 'ProximityPrompt',
        name: 'InteractPrompt',
        parentId: partId,
        properties: {
          ActionText: prompt,
          ObjectText: objectText,
          HoldDuration: Math.max(0, Number(p.interactive.holdDuration ?? 0)),
          MaxActivationDistance: role === 'chest' ? 6 : 10,
          RequiresLineOfSight: false,
          Enabled: true,
        },
      });
    }

    // PointLight for glow/torch decor — soft, diffused interior lighting (not harsh/blown out).
    // Also triggers if material is Neon (glow seams etc.).
    const isNeonMat = (p.material || '').toLowerCase() === 'neon';
    const hasLightName = /torch|lamp|lantern|light|glow|flame|candle|brazier|sconce|campfire|chandelier|fire/i.test(partName);
    // Exclude "sign" from light-name — too many signs become glare.
    if ((role === 'decor' || role === 'furniture') && (hasLightName || isNeonMat)) {
      scene.push({
        id: uuidv4(),
        className: 'PointLight',
        name: 'Glow',
        parentId: partId,
        properties: {
          Color: color3(glowRgb.r, glowRgb.g, glowRgb.b),
          Brightness: 1.0,
          Range: 14,
          Shadows: false,
        },
      });
    }
  }

  // Scripts from metadata.buildingScripts (LLM or fallback). If absent, include starterScript as Init.
  const buildingScripts = Array.isArray(metadata.buildingScripts) ? metadata.buildingScripts : [];
  const scripts: RobloxBuildScript[] = buildingScripts.map((s: Record<string, unknown>, idx: number) => ({
    id: `building-script-${idx}`,
    name: typeof s.name === 'string' ? s.name : `BuildingScript${idx}`,
    scriptType: ((typeof s.scriptType === 'string' ? s.scriptType : 'Script') as 'Script' | 'LocalScript' | 'ModuleScript'),
    container: ((typeof s.container === 'string' ? s.container : 'Workspace') as
      'ServerScriptService' | 'ReplicatedStorage' | 'StarterPlayerScripts' | 'StarterGui' | 'StarterPack' | 'Workspace'),
    source: typeof s.source === 'string' ? s.source : '',
  }));

  if (scripts.length === 0 && args.starterScript) {
    scripts.push({
      id: 'building-starter',
      name: `${normalizedName}Starter`,
      scriptType: 'Script',
      container: 'Workspace',
      source: args.starterScript,
    });
  }

  return {
    id: uuidv4(),
    title: shortTitle,
    summary: args.summary,
    target: args.target,
    rootClassName: 'Model',
    rootProperties: {},
    formatPreference: 'binary' as RobloxArtifactFormat,
    scene,
    scripts,
    assets: [],
  };
}

// ── Character manifest builder ───────────────────────────────────────

type NpcVisualPipelineMode = 'mesh_asset_v1' | 'asset_template_v1' | 'procedural_legacy';
type NpcMeshMotionMode = 'follow_root_visual' | 'static_visual_shell' | 'skinned_visual';

function resolveNpcVisualPipeline(metadata: Record<string, unknown>): NpcVisualPipelineMode {
  const raw = typeof metadata.npcVisualPipeline === 'string'
    ? metadata.npcVisualPipeline
    : getNpcVisualPipeline();
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'legacy' || normalized === 'procedural' || normalized === 'procedural_legacy') {
    return 'procedural_legacy';
  }
  if (normalized === 'asset_template' || normalized === 'asset_template_v1') {
    return 'asset_template_v1';
  }
  return 'mesh_asset_v1';
}

function resolveNpcMeshMotionMode(metadata: Record<string, unknown>): NpcMeshMotionMode {
  const raw = typeof metadata.npcMeshMotionMode === 'string' ? metadata.npcMeshMotionMode : '';
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'skinned' || normalized === 'skinned_visual' || normalized === 'skinned_mesh') {
    return 'skinned_visual';
  }
  if (normalized === 'static' || normalized === 'static_visual' || normalized === 'static_visual_shell') {
    return 'static_visual_shell';
  }
  return 'follow_root_visual';
}

function buildCharacterManifest(
  args: {
    title: string;
    summary: string;
    target: RobloxBuildTarget;
    prompt: string;
    starterScript: string;
    metadata?: Record<string, unknown>;
  },
  metadata: Record<string, unknown>,
): RobloxBuildManifest {
  if (isClothingRequest(args.prompt, metadata)) {
    return buildClothingOnlyManifest(args, metadata);
  }

  const rootModelId = uuidv4();
  const humanoidId = uuidv4();
  const rootPartId = uuidv4();

  const partIds: Record<string, string> = {};
  const R15_PART_NAMES = [
    'HumanoidRootPart', 'LowerTorso', 'UpperTorso', 'Head',
    'LeftUpperArm', 'LeftLowerArm', 'LeftHand',
    'RightUpperArm', 'RightLowerArm', 'RightHand',
    'LeftUpperLeg', 'LeftLowerLeg', 'LeftFoot',
    'RightUpperLeg', 'RightLowerLeg', 'RightFoot',
  ];
  for (const name of R15_PART_NAMES) {
    partIds[name] = name === 'HumanoidRootPart' ? rootPartId : uuidv4();
  }

  const isNpcFallbackModel = metadata.contentCategory === 'npc_ai'
    || metadata.contentSubcategory === 'npcs'
    || metadata.contentSubcategory === 'roast_npc';
  const npcVisualPipeline = resolveNpcVisualPipeline(metadata);
  const npcMeshMotionMode = isNpcFallbackModel ? resolveNpcMeshMotionMode(metadata) : 'static_visual_shell';
  const allowGeneratedNpcAccessories = !(
    (npcVisualPipeline === 'asset_template_v1'
      && metadata.enableR15GeneratedAccessoryMeshes !== true)
    || (npcVisualPipeline === 'mesh_asset_v1'
      && npcMeshMotionMode === 'skinned_visual')
  );
  const generatedNpcAccessoryAssets = allowGeneratedNpcAccessories
    ? parseGeneratedNpcAccessoryAssets(metadata.npcGeneratedAccessoryAssets)
    : [];
  const generatedNpcAccessoryFallbackSpecs = allowGeneratedNpcAccessories
    ? parseGeneratedNpcAccessoryFallbackSpecs(metadata.npcGeneratedAccessoryAssets)
    : [];
  const npcTemplateKind = resolveNpcTemplateKind(args.title, args.prompt, metadata);
  const npcResolvedVisualPlan = resolveNpcVisualPlan(args.title, args.prompt, metadata, npcTemplateKind);
  const npcVisualFamily = npcResolvedVisualPlan.bodyFamily;
  const usesTemplateFirstVisuals = isNpcFallbackModel && npcTemplateKind !== 'default';
  const npcVisualConfigMode = typeof metadata.npcVisualConfigMode === 'string'
    ? metadata.npcVisualConfigMode
    : undefined;
  const usesNpcAccentLayerVisuals = isNpcFallbackModel
    && (npcVisualConfigMode === 'accent_layer' || usesTemplateFirstVisuals);
  const useAssetTemplateNpcVisuals = isNpcFallbackModel && npcVisualPipeline !== 'procedural_legacy';
  const visualDnaPalette = paletteFromNpcVisualPlan(npcResolvedVisualPlan, args.prompt, metadata);
  const familyPalette = paletteFromNpcVisualFamily(npcVisualFamily);
  const templatePalette = paletteFromNpcTemplate(npcTemplateKind);
  const rolePalette = paletteFromNpcRole(args.prompt, metadata);
  const visualPalette = usesTemplateFirstVisuals ? null : paletteFromVisualConfig(metadata);
  const paletteText = `${args.title} ${args.prompt} ${JSON.stringify(metadata)}`.toLowerCase();
  const rawVisualVariantSeed = Number(metadata.visualVariantSeed ?? 0);
  const visualVariantSeed = Number.isFinite(rawVisualVariantSeed)
    ? Math.abs(Math.trunc(rawVisualVariantSeed))
    : 0;
  const visualVariantIndex = visualVariantSeed % 4;
  const shouldPreferRolePalette = usesTemplateFirstVisuals || (isNpcFallbackModel
    && /knight|guard|police|cop|officer|sheriff|security|paladin|soldier|sentinel|warrior|ghost|spirit|enemy|monster|рыцар|страж|охран|полици|полицей|офицер|шериф|солдат|воин|призрак|враг|монстр/.test(paletteText)
    && !/ranger|рейнджер|леснич|егерь|forest/.test(paletteText));
  const characterPalette = visualDnaPalette
    ?? familyPalette
    ?? templatePalette
    ?? (shouldPreferRolePalette ? rolePalette ?? visualPalette : visualPalette ?? rolePalette)
    ?? paletteFromBodyColors(metadata)
    ?? inferPalette(args.prompt, metadata);
  const scale = scaleFromNpcVisualFamily(npcVisualFamily)
    ?? scaleFromNpcTemplate(npcTemplateKind)
    ?? inferCharacterScale(args.prompt, metadata);

  const sourceModelUrl = typeof metadata.sourceModelUrl === 'string' ? metadata.sourceModelUrl : undefined;
  // Roblox Model.Name supports spaces and most punctuation. The previous
  // sanitizeSystemName() stripped EVERY non-alphanumeric, including spaces,
  // so a prompt-derived title like "Chill Gen-Alpha NPC for UGC ..."
  // collapsed to "ChillGenAlphaNPCforUGC..." in Studio's nameplate. We keep
  // letters/digits/underscores/spaces/hyphens, collapse whitespace, and cap
  // at 6 words / 60 chars so the BillboardGui above the head stays readable.
  const normalizedModelName = (() => {
    const cleaned = (args.title || '')
      .replace(/[^\p{L}\p{N}_\-\s&.]/gu, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleaned) return 'GeneratedCharacter';
    const words = cleaned.split(' ');
    const trimmed = words.length > 6 ? words.slice(0, 6).join(' ') : cleaned;
    return trimmed.length > 60 ? trimmed.slice(0, 60).trim() : trimmed;
  })();
  const meshAssetId = typeof metadata.meshAssetId === 'string' ? metadata.meshAssetId : undefined;
  const textureAssetId = typeof metadata.textureAssetId === 'string' ? metadata.textureAssetId : undefined;
  const shirtTextureUrl = typeof metadata.shirtTextureUrl === 'string'
    ? toRobloxAssetUrl(metadata.shirtTextureUrl)
    : undefined;
  const pantsTextureUrl = typeof metadata.pantsTextureUrl === 'string'
    ? toRobloxAssetUrl(metadata.pantsTextureUrl)
    : undefined;
  const hasMeshAsset = !!(meshAssetId || (typeof metadata.meshRobloxId === 'number'));
  // Skinned R15 mesh asset (FBX-imported via Open Cloud, contains R15 bones).
  // The runtime skinned Body path is opt-in because some Roblox-imported skinned
  // Model assets load with valid size logs but no visible render in Studio. By
  // default, skinned_visual NPCs use the proven static mesh visual shell and keep
  // the R15 substrate invisible.
  const skinnedMeshAssetId = typeof metadata.skinnedMeshAssetId === 'string'
    ? metadata.skinnedMeshAssetId
    : undefined;
  const hasSkinnedMeshAsset = !!skinnedMeshAssetId && npcMeshMotionMode === 'skinned_visual';
  const skinnedMeshModelRbxmBase64 = typeof metadata.skinnedMeshModelRbxmBase64 === 'string'
    && metadata.skinnedMeshModelRbxmBase64.length > 0
    ? metadata.skinnedMeshModelRbxmBase64
    : undefined;
  const hasBakedSkinnedEditModel = hasSkinnedMeshAsset && !!skinnedMeshModelRbxmBase64;
  // Stage B (changelog-312, 2026-05-12): real numeric MeshId / TextureID extracted
  // from the Model wrapper via Open Cloud Engine API. When present, we can bake a
  // first-class static MeshPart into the RBXM — visible in Studio Edit immediately,
  // no runtime LoadSkinnedBody Script needed. This resolves both "grey block in
  // Edit" and "runtime LoadAsset flake" in one shot. Falls through to the runtime
  // Script path if Engine API is unconfigured or extraction failed.
  const realMeshId = typeof metadata.realMeshId === 'string' && metadata.realMeshId.trim().length > 0
    ? metadata.realMeshId.trim()
    : undefined;
  const realTextureId = typeof metadata.realTextureId === 'string' && metadata.realTextureId.trim().length > 0
    ? metadata.realTextureId.trim()
    : undefined;
  const realMeshHasSkinnedMesh = metadata.realMeshHasSkinnedMesh === true;
  const realMeshSizeY = typeof metadata.realMeshSizeY === 'number' ? metadata.realMeshSizeY : 0;
  const useStaticBakedMeshPart = hasSkinnedMeshAsset && !!realMeshId;
  // Stage A pivot (changelog-249, 2026-05-12): enable runtime skinned body by default
  // for skinned_visual NPCs that have no inline RBXM bake. Earlier the default kept the
  // proven static visual shell (using meshAssetId Model wrapper as MeshPart.MeshId), which
  // worked when Roblox auto-resolved the wrapper to its inner Mesh — but for the skinned
  // FBX wrapper (multi-asset Model), auto-resolve fails and the spawn is invisible. The
  // runtime LoadSkinnedBody Script reliably extracts the inner MeshPart at Play time, and
  // a BodyPlaceholder Part keeps the rig visible in Edit before Play. Caller can opt out
  // by setting metadata.enableExperimentalSkinnedRuntimeBody === false.
  // Stage B final (changelog-312, test 5): with Blender pre-scaling in
  // auto_rig_r15.py the mesh now exits the worker at ~5.9 stud height. Static
  // MeshPart in RBXM displays at correct R15 size in Edit AND Play — no need
  // to swap to runtime LoadSkinnedBody version anymore. Runtime path stays as
  // graceful fallback for when Engine API extraction fails or is unconfigured.
  const useRuntimeSkinnedBody = hasSkinnedMeshAsset
    && !hasBakedSkinnedEditModel
    && !useStaticBakedMeshPart
    && metadata.enableExperimentalSkinnedRuntimeBody !== false;
  // Extract per-channel RGB body colors for the runtime MeshPart.Color fallback.
  // Defaults to medium grey if metadata.bodyColors is missing or malformed.
  const bodyColorsMeta = (typeof metadata.bodyColors === 'object' && metadata.bodyColors !== null
    ? metadata.bodyColors as Record<string, unknown>
    : {});
  const torsoColorTuple = Array.isArray(bodyColorsMeta.torsoColor)
    ? bodyColorsMeta.torsoColor as unknown[]
    : [];
  const clampByte = (n: unknown): number => {
    const v = typeof n === 'number' ? Math.round(n) : 200;
    return Math.max(0, Math.min(255, v));
  };
  const fallbackR = (clampByte(torsoColorTuple[0]) / 255).toFixed(4);
  const fallbackG = (clampByte(torsoColorTuple[1]) / 255).toFixed(4);
  const fallbackB = (clampByte(torsoColorTuple[2]) / 255).toFixed(4);
  const runtimeStaticVisualAssetId = meshAssetId
    ?? (!useRuntimeSkinnedBody && hasSkinnedMeshAsset ? skinnedMeshAssetId : undefined);
  const hasRuntimeStaticVisualAsset = typeof runtimeStaticVisualAssetId === 'string'
    && runtimeStaticVisualAssetId.trim().length > 0;
  const hasRuntimeOrBakedMeshVisual = hasBakedSkinnedEditModel
    || useRuntimeSkinnedBody
    || useStaticBakedMeshPart
    || hasRuntimeStaticVisualAsset;
  const textureRawAssetId = (typeof metadata.textureDecalAssetId === 'string' && metadata.textureDecalAssetId.trim())
    ? metadata.textureDecalAssetId
    : textureAssetId;
  const skinnedTextureUrl = textureRawAssetId ? toRobloxAssetUrl(textureRawAssetId) : '';
  // Stage A pivot (changelog-249, 2026-05-12): enable R15 catalog walk/run/idle limb
  // animations by default for runtime-skinned NPCs. Earlier this was opt-in because catalog
  // tracks can twist auto-rigged image-to-3D arms in odd ways. User explicitly asked for the
  // walk animation ("при хотьбе он не анимируется"), so we enable by default and leave a
  // metadata.enableSkinnedNpcLimbAnimations === false escape hatch if a specific NPC needs
  // to keep its rest pose.
  const enableSkinnedNpcLimbAnimations = metadata.enableSkinnedNpcLimbAnimations !== false;

  const bodyPartClass = hasMeshAsset ? 'MeshPart' : 'Part';

  function bodyPartProps(
    base: Record<string, unknown>,
    partMeshId?: string,
    partTextureId?: string,
  ): Record<string, unknown> {
    const props = { ...base };
    if (hasMeshAsset && partMeshId) {
      props.MeshId = toRobloxAssetUrl(partMeshId);
      if (partTextureId) {
        props.TextureID = toRobloxAssetUrl(partTextureId);
      }
    }
    return props;
  }

  const s = scale;
  const p = characterPalette;
  const headColor = color3(p.head.r, p.head.g, p.head.b);
  const torsoColor = color3(p.torso.r, p.torso.g, p.torso.b);
  const armColor = color3(p.limbs.r, p.limbs.g, p.limbs.b);
  const legColor = color3(p.legs.r, p.legs.g, p.legs.b);
  const npcVisualPlanText = [
    npcResolvedVisualPlan.visualSpecies,
    npcResolvedVisualPlan.role,
    npcResolvedVisualPlan.palette,
    npcResolvedVisualPlan.faceIdentity,
    ...(npcResolvedVisualPlan.styleArchetypes ?? []),
    ...(npcResolvedVisualPlan.outfitSlots ?? []),
    ...(npcResolvedVisualPlan.accessorySlots ?? []),
    ...(npcResolvedVisualPlan.props ?? []),
    ...(npcResolvedVisualPlan.sourceCues ?? []),
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(' ');
  const npcBodyBriefText = [
    args.title,
    args.prompt,
    metadata.appearance,
    metadata.visualDescription,
    metadata.npcVisualHooks,
    metadata.theme,
    metadata.npcTheme,
    metadata.npcRole,
    metadata.roastPersonality,
    npcVisualPlanText,
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(' ')
    .toLowerCase();
  const wantsGoofyOversizedHead = isNpcFallbackModel
    && /goofy\s+big\s+head|oversized\s+head|big\s+head|large\s+head|huge\s+head|больш[а-яё\s-]*голов/.test(npcBodyBriefText)
    && !/small\s+head|tiny\s+head|маленьк[а-яё\s-]*голов/.test(npcBodyBriefText);
  const npcHeadSize: [number, number, number] = wantsGoofyOversizedHead ? [2.42, 1.34, 1.22] : [2, 1, 1];
  const npcHeadPosition: [number, number, number] = wantsGoofyOversizedHead ? [0, 5.28, 0] : [0, 5.1, 0];
  const npcNeckC1: [number, number, number] = wantsGoofyOversizedHead ? [0, -0.62, 0] : [0, -0.5, 0];

  interface R15PartDef {
    name: string;
    size: [number, number, number];
    position: [number, number, number];
    color: Record<string, unknown>;
    transparency?: number;
    canCollide?: boolean;
  }

  const r15Parts: R15PartDef[] = [
    { name: 'HumanoidRootPart', size: [2, 2, 1], position: [0, 3.5, 0], color: torsoColor, transparency: 1 },
    { name: 'LowerTorso', size: [2, 0.4, 1], position: [0, 2.8, 0], color: torsoColor },
    { name: 'UpperTorso', size: [2, 1.6, 1], position: [0, 3.8, 0], color: torsoColor },
    { name: 'Head', size: npcHeadSize, position: npcHeadPosition, color: headColor },
    { name: 'LeftUpperArm', size: [1, 1.2, 1], position: [-1.5, 4.1, 0], color: armColor },
    { name: 'LeftLowerArm', size: [1, 1.2, 1], position: [-1.5, 2.9, 0], color: armColor },
    { name: 'LeftHand', size: [1, 0.6, 1], position: [-1.5, 2.0, 0], color: armColor },
    { name: 'RightUpperArm', size: [1, 1.2, 1], position: [1.5, 4.1, 0], color: armColor },
    { name: 'RightLowerArm', size: [1, 1.2, 1], position: [1.5, 2.9, 0], color: armColor },
    { name: 'RightHand', size: [1, 0.6, 1], position: [1.5, 2.0, 0], color: armColor },
    { name: 'LeftUpperLeg', size: [1, 1.2, 1], position: [-0.5, 2.1, 0], color: legColor },
    { name: 'LeftLowerLeg', size: [1, 1.2, 1], position: [-0.5, 0.9, 0], color: legColor },
    { name: 'LeftFoot', size: [1, 0.4, 1], position: [-0.5, 0.0, 0], color: legColor },
    { name: 'RightUpperLeg', size: [1, 1.2, 1], position: [0.5, 2.1, 0], color: legColor },
    { name: 'RightLowerLeg', size: [1, 1.2, 1], position: [0.5, 0.9, 0], color: legColor },
    { name: 'RightFoot', size: [1, 0.4, 1], position: [0.5, 0.0, 0], color: legColor },
  ];

  interface R15JointDef {
    name: string;
    part0: string;
    part1: string;
    c0: [number, number, number];
    c1: [number, number, number];
  }

  const r15Joints: R15JointDef[] = [
    { name: 'Root', part0: 'HumanoidRootPart', part1: 'LowerTorso', c0: [0, -0.7, 0], c1: [0, 0, 0] },
    { name: 'Waist', part0: 'LowerTorso', part1: 'UpperTorso', c0: [0, 0.2, 0], c1: [0, -0.8, 0] },
    { name: 'Neck', part0: 'UpperTorso', part1: 'Head', c0: [0, 0.8, 0], c1: npcNeckC1 },
    { name: 'LeftShoulder', part0: 'UpperTorso', part1: 'LeftUpperArm', c0: [-1, 0.5, 0], c1: [0.5, 0.5, 0] },
    { name: 'LeftElbow', part0: 'LeftUpperArm', part1: 'LeftLowerArm', c0: [0, -0.6, 0], c1: [0, 0.6, 0] },
    { name: 'LeftWrist', part0: 'LeftLowerArm', part1: 'LeftHand', c0: [0, -0.6, 0], c1: [0, 0.3, 0] },
    { name: 'RightShoulder', part0: 'UpperTorso', part1: 'RightUpperArm', c0: [1, 0.5, 0], c1: [-0.5, 0.5, 0] },
    { name: 'RightElbow', part0: 'RightUpperArm', part1: 'RightLowerArm', c0: [0, -0.6, 0], c1: [0, 0.6, 0] },
    { name: 'RightWrist', part0: 'RightLowerArm', part1: 'RightHand', c0: [0, -0.6, 0], c1: [0, 0.3, 0] },
    { name: 'LeftHip', part0: 'LowerTorso', part1: 'LeftUpperLeg', c0: [-0.5, -0.2, 0], c1: [0, 0.6, 0] },
    { name: 'LeftKnee', part0: 'LeftUpperLeg', part1: 'LeftLowerLeg', c0: [0, -0.6, 0], c1: [0, 0.6, 0] },
    { name: 'LeftAnkle', part0: 'LeftLowerLeg', part1: 'LeftFoot', c0: [0, -0.6, 0], c1: [0, 0.2, 0] },
    { name: 'RightHip', part0: 'LowerTorso', part1: 'RightUpperLeg', c0: [0.5, -0.2, 0], c1: [0, 0.6, 0] },
    { name: 'RightKnee', part0: 'RightUpperLeg', part1: 'RightLowerLeg', c0: [0, -0.6, 0], c1: [0, 0.6, 0] },
    { name: 'RightAnkle', part0: 'RightLowerLeg', part1: 'RightFoot', c0: [0, -0.6, 0], c1: [0, 0.2, 0] },
  ];

  const scene: RobloxBuildSceneNode[] = [
    {
      id: rootModelId,
      className: 'Model',
      name: normalizedModelName,
      parentId: 'WorkspaceRoot',
      properties: {
        PrimaryPart: { __type: 'Ref', id: rootPartId },
      },
    },
    {
      id: humanoidId,
      className: 'Humanoid',
      name: 'Humanoid',
      parentId: rootModelId,
      properties: {
        Health: 100,
        MaxHealth: 100,
        WalkSpeed: 16,
        JumpPower: 50,
        RigType: { __type: 'Enum', enumType: 'HumanoidRigType', enumName: 'R15', value: 1 },
        // Explicit physics anchors — prevents the «rocket NPC» bug where the
        // Humanoid solver, with default HipHeight=0 and AutomaticScalingEnabled=true,
        // fights itself trying to balance the rig and applies cumulative impulses.
        HipHeight: 2,
        AutomaticScalingEnabled: false,
        BreakJointsOnDeath: false,
        RequiresNeck: false,
        MaxSlopeAngle: 89,
        UseJumpPower: true,
      },
    },
  ];

  scene.push({
    id: uuidv4(),
    className: 'BodyColors',
    name: 'Body Colors',
    parentId: rootModelId,
    properties: {
      HeadColor3: headColor,
      TorsoColor3: torsoColor,
      LeftArmColor3: armColor,
      RightArmColor3: armColor,
      LeftLegColor3: legColor,
      RightLegColor3: legColor,
    },
  });

  const shouldUseClassicNpcOutfit = isNpcFallbackModel && npcTemplateKind === 'default';
  const npcClassicOutfit = shouldUseClassicNpcOutfit
    ? {
        shirtTemplate: 'http://www.roblox.com/asset/?id=5270451220',
        pantsTemplate: 'http://www.roblox.com/asset/?id=382538502',
        shirtAssetId: 5270451236,
        pantsAssetId: 382538503,
      }
    : undefined;
  if (npcClassicOutfit) {
    scene.push({
      id: uuidv4(),
      className: 'HumanoidDescription',
      name: 'AvatarDescription',
      parentId: humanoidId,
      properties: {
        ...(shouldUseClassicNpcOutfit ? {
          Shirt: npcClassicOutfit.shirtAssetId,
          Pants: npcClassicOutfit.pantsAssetId,
        } : {}),
        BodyTypeScale: 0,
        ProportionScale: 0,
        WidthScale: 1,
        HeightScale: 1,
        DepthScale: 1,
        HeadScale: 1,
      },
    });
    if (shouldUseClassicNpcOutfit) {
      scene.push({
        id: uuidv4(),
        className: 'Shirt',
        name: 'AvatarShirt',
        parentId: rootModelId,
        properties: { ShirtTemplate: npcClassicOutfit.shirtTemplate },
      });
      scene.push({
        id: uuidv4(),
        className: 'Pants',
        name: 'AvatarPants',
        parentId: rootModelId,
        properties: { PantsTemplate: npcClassicOutfit.pantsTemplate },
      });
    }
    scene.push({
      id: uuidv4(),
      className: 'Script',
      name: 'ApplyAvatarDescription',
      parentId: rootModelId,
      properties: {
        Source: [
          'local model = script.Parent',
          'local humanoid = model:FindFirstChildOfClass("Humanoid")',
          'local desc = humanoid and humanoid:FindFirstChild("AvatarDescription")',
          'if humanoid and desc then',
          '\tpcall(function() humanoid:ApplyDescription(desc) end)',
          'end',
          'script:Destroy()',
        ].join('\n'),
      },
    });
  }

  // LLM-driven body transparency (e.g. ghosts at 0.4-0.6). Applied to visible
  // body parts; HRP stays at 1 (always invisible).
  const canApplyFullNpcVisualConfig = !usesTemplateFirstVisuals && npcVisualConfigMode !== 'accent_layer';
  const visualConfigRaw = canApplyFullNpcVisualConfig ? metadata.npcVisualConfig as Record<string, unknown> | undefined : undefined;
  const llmBodyTransparency = (() => {
    if (!visualConfigRaw || typeof visualConfigRaw !== 'object') return undefined;
    const t = (visualConfigRaw as { bodyTransparency?: unknown }).bodyTransparency;
    if (typeof t !== 'number' || !Number.isFinite(t)) return undefined;
    return Math.min(0.9, Math.max(0, t));
  })();

  // Mesh-backed NPCs should never look like a plain R15 mannequin. We keep the
  // Humanoid/R15 substrate present for scripts/collision, hide it visually, and
  // add a small non-R15 edit preview below. If no Roblox asset id made it into
  // metadata, that preview remains visible instead of exporting an empty model.
  const hideR15Placeholder = isNpcFallbackModel && npcVisualPipeline === 'mesh_asset_v1';
  // Stage B (changelog-312, test 6): when the static baked MeshPart is the
  // visible Body, hide the R15 thin-shell substrate parts (LowerTorso, Head,
  // arms, legs) so they don't peek through the mesh as a coloured "platform"
  // beneath the NPC. The substrate stays physically present (CanCollide=true
  // on root, Motor6Ds intact) but is fully transparent.
  const editModePreviewTransparency = hasBakedSkinnedEditModel || hideR15Placeholder || useStaticBakedMeshPart ? 1 : undefined;

  for (const part of r15Parts) {
    const isRoot = part.name === 'HumanoidRootPart';
    const baseTransparency = part.transparency ?? 0;
    const templateBodyTransparency = npcTemplateKind === 'gnome'
      && !isRoot
      && part.name !== 'Head'
      && part.name !== 'LeftHand'
      && part.name !== 'RightHand'
      ? 0.42
      : 0;
    const transparency = editModePreviewTransparency !== undefined && !isRoot
      ? Math.max(baseTransparency, templateBodyTransparency, editModePreviewTransparency)
      : !isRoot && llmBodyTransparency !== undefined
      ? Math.max(baseTransparency, templateBodyTransparency, llmBodyTransparency)
      : Math.max(baseTransparency, templateBodyTransparency);
    // Mesh visual geometry is CanCollide=false (arbitrary imported shapes can
    // break physics), so keep the R15 preview/collision substrate solid.
    const canCollide = (hasSkinnedMeshAsset || hideR15Placeholder)
      ? true
      : (part.canCollide ?? isRoot);
    // R15 skeleton parts are standard Parts (no individual mesh) —
    // the full character mesh is applied to a single display MeshPart below.
    scene.push({
      id: partIds[part.name],
      className: isRoot ? 'Part' : 'Part',
      name: part.name,
      parentId: rootModelId,
      properties: {
        Anchored: false,
        CanCollide: canCollide,
        // Keep the R15 substrate available for Humanoid/Motor6D/collision, while
        // visual visibility is controlled by editModePreviewTransparency above.
        Transparency: transparency,
        Size: vector3(part.size[0] * s.w, part.size[1] * s.h, part.size[2] * s.d),
        CFrame: cframe(part.position[0] * s.w, part.position[1] * s.h, part.position[2] * s.d),
        ...(isRoot ? {} : { Color: part.color }),
      },
    });
  }

  if (hideR15Placeholder && !hasRuntimeOrBakedMeshVisual) {
    const previewParts: Array<{
      name: string;
      size: [number, number, number];
      position: [number, number, number];
      color: Record<string, unknown>;
      shape: 'Ball' | 'Cylinder';
      transparency: number;
    }> = [
      {
        name: 'Generated3DPreviewBody',
        size: [1.85, 2.75, 1.18],
        position: [0, 3.25, 0],
        color: torsoColor,
        shape: 'Ball',
        transparency: 0.08,
      },
      {
        name: 'Generated3DPreviewHead',
        size: [1.08, 1.08, 1.08],
        position: [0, 5.05, 0],
        color: headColor,
        shape: 'Ball',
        transparency: 0.04,
      },
      {
        name: 'Generated3DPreviewAccent',
        size: [1.95, 0.22, 1.28],
        position: [0, 4.05, 0],
        color: armColor,
        shape: 'Cylinder',
        transparency: 0,
      },
    ];
    for (const preview of previewParts) {
      const previewId = uuidv4();
      scene.push({
        id: previewId,
        className: 'Part',
        name: preview.name,
        parentId: rootModelId,
        properties: {
          Anchored: false,
          CanCollide: false,
          CanTouch: false,
          CanQuery: false,
          CastShadow: false,
          Massless: true,
          Shape: enumValue('PartType', preview.shape, preview.shape === 'Ball' ? 0 : 2),
          Material: enumValue('Material', 'SmoothPlastic'),
          Transparency: preview.transparency,
          Size: vector3(preview.size[0] * s.w, preview.size[1] * s.h, preview.size[2] * s.d),
          CFrame: cframe(preview.position[0] * s.w, preview.position[1] * s.h, preview.position[2] * s.d),
          Color: preview.color,
        },
      });
      scene.push({
        id: uuidv4(),
        className: 'WeldConstraint',
        name: `${preview.name}Weld`,
        parentId: previewId,
        properties: {
          Part0: { __type: 'Ref', id: previewId },
          Part1: { __type: 'Ref', id: rootPartId },
        },
      });
    }
  }

  // ── Static MeshPart "Body" baked at backend time (Stage B) ──────────────
  // Roblox Open Cloud Engine API has already given us the *real* numeric MeshId
  // (and TextureID) of the skinned MeshPart hidden inside the Model wrapper.
  // We just write a first-class MeshPart into the RBXM with those numeric IDs;
  // Studio renders it the moment the user imports the file — no Script execution
  // required, visible in Edit mode, no runtime LoadAsset flake.
  //
  // The mesh keeps its skin weights + R15 bone children inside Roblox's mesh
  // pipeline (HasSkinnedMesh=true reports back from the Engine API extraction),
  // so catalog R15 tracks animate it correctly when AnimationController fires.
  //
  // Plan B fallback (runtime LoadSkinnedBody Script + BodyPlaceholder) only
  // engages when Engine API is unconfigured or extraction fails. See the
  // useStaticBakedMeshPart guard wired through useRuntimeSkinnedBody above.
  if (useStaticBakedMeshPart && realMeshId) {
    const realMeshIdNum = parseInt(realMeshId, 10);
    const realTexIdNum = realTextureId ? parseInt(realTextureId, 10) : 0;
    if (Number.isFinite(realMeshIdNum) && realMeshIdNum > 0) {
      const skinnedBodyId = uuidv4();
      const tintR = parseFloat(fallbackR);
      const tintG = parseFloat(fallbackG);
      const tintB = parseFloat(fallbackB);
      // Aim for ~5.5 stud body height (matches default R15). If the source mesh
      // is much taller (Meshy frequently outputs at 3-5x R15 scale), we can't
      // resize a skinned MeshPart by editing Size at static time — but we keep
      // the original Size as a faithful bounding box. The Humanoid still drives
      // the rig motors; the visible mesh follows the bones inside it.
      const sizeY = realMeshSizeY > 0.01 ? realMeshSizeY : 5.5;
      const sizeXZ = Math.max(1.5, sizeY * 0.4);
      const skinnedProperties: Record<string, unknown> = {
        Anchored: false,
        CanCollide: false,
        Massless: true,
        Transparency: 0,
        Material: enumValue('Material', 'SmoothPlastic', 288),
        Size: vector3(sizeXZ, sizeY, sizeXZ),
        // Sit atop HumanoidRootPart at spawn. Catalog animations re-pose each frame.
        CFrame: cframe(0, 3, 0),
        // Color3 fallback: if TextureID silently fails on a skinned mesh, the
        // body still shows the dominant body colour rather than pure grey.
        Color: { r: tintR, g: tintG, b: tintB },
        MeshId: toRobloxAssetUrl(`${realMeshIdNum}`),
      };
      if (realTexIdNum > 0) {
        skinnedProperties.TextureID = toRobloxAssetUrl(`${realTexIdNum}`);
      } else if (textureRawAssetId) {
        // Fall back to the separately-uploaded base color texture (Decal wrapper
        // assetId from index.ts:texture_upload). Roblox auto-resolves wrappers
        // when used in MeshPart.TextureID — same trick the weapon path uses.
        skinnedProperties.TextureID = toRobloxAssetUrl(textureRawAssetId);
      }
      scene.push({
        id: skinnedBodyId,
        className: 'MeshPart',
        name: 'Body',
        parentId: rootModelId,
        properties: skinnedProperties,
      });
      // Weld the Body MeshPart to HumanoidRootPart so catalog animations driving
      // the rig's motors translate the whole skinned mesh through the world.
      scene.push({
        id: uuidv4(),
        className: 'Motor6D',
        name: 'SkinnedRoot',
        parentId: rootPartId,
        properties: {
          Part0: { __type: 'Ref', id: rootPartId },
          Part1: { __type: 'Ref', id: skinnedBodyId },
        },
      });

      // NOTE on scaling: ScaleSkinnedBody Script (previous version) was removed
      // because Model:ScaleTo only scales Bone Instances, and static MeshPart
      // (loaded from numeric MeshId, not from FBX import) doesn't get Bones
      // auto-instantiated. Result: collision shrunk but visual stayed huge.
      // The runtime LoadSkinnedBody path below now ALSO runs, destroys this
      // static Body, and loads the skinned mesh via InsertService:LoadAsset
      // which DOES create Bone children → ScaleTo works → correct visual size.
    }
  }

  // ── Skinned MeshPart "Body" (experimental runtime path, fallback) ───────
  // Open Cloud uploads our skinned FBX as `assetType: 'Model'` (it does not expose
  // a direct `Mesh` upload type). `MeshPart.MeshId = "rbxassetid://<id>"` only
  // accepts assets of type `Mesh` — pointing it at a Model asset produces
  // `MeshContentProvider failed to process ... could not fetch` in Studio and the
  // body never appears.
  //
  // Fix (changelog-249): emit a runtime LoadSkinnedBody Script that calls
  // `InsertService:LoadAsset(skinnedMeshAssetId)`, extracts the first MeshPart
  // (the FBX importer keeps the R15 bone children intact under it), reparents it
  // into our model as "Body", applies the optional texture, and welds it to
  // HumanoidRootPart via Motor6D. Limb animation is opt-in only because generic
  // R15 catalog tracks can twist auto-rigged image-to-3D arms.
  //
  // Stage B (changelog-312, test 3): this path runs ALONGSIDE the static
  // MeshPart bake when both are enabled. Static MeshPart provides Edit-mode
  // visibility (recognizable mesh, even if huge); runtime LoadSkinnedBody
  // destroys the static Body at Play and replaces it with the
  // InsertService:LoadAsset version which has Bone children → Model:ScaleTo
  // properly shrinks visual to R15 height + catalog animations work.
  if (useRuntimeSkinnedBody && skinnedMeshAssetId) {
    const skinnedAssetIdNum = parseInt(skinnedMeshAssetId, 10);
    // Use the raw uploaded asset ID directly (could be Open Cloud Decal wrapper or resolved
    // Image ID — both work with MeshPart.TextureID via Roblox auto-resolve, just like the
    // weapon path does for Tool.TextureId).
    if (Number.isFinite(skinnedAssetIdNum) && skinnedAssetIdNum > 0) {
      // Edit-mode placeholder: skip when static MeshPart is providing Edit
      // visibility (the static Body IS visible in Edit, just at huge scale).
      // When static is disabled (Engine API failed/unconfigured), fall back to
      // a plain `Part` coloured box so the user still sees something at the
      // spawn point in Edit before pressing Play.
      if (!useStaticBakedMeshPart) {
        const placeholderId = uuidv4();
        const tintR = parseFloat(fallbackR);
        const tintG = parseFloat(fallbackG);
        const tintB = parseFloat(fallbackB);
        const placeholderProperties: Record<string, unknown> = {
          Anchored: false,
          CanCollide: false,
          Massless: true,
          Transparency: 0,
          Material: enumValue('Material', 'SmoothPlastic', 288),
          Size: vector3(3, 5.5, 2),
          CFrame: cframe(0, 3, 0),
          Color: { r: tintR, g: tintG, b: tintB },
        };
        scene.push({
          id: placeholderId,
          className: 'Part',
          name: 'BodyPlaceholder',
          parentId: rootModelId,
          properties: placeholderProperties,
        });
        scene.push({
          id: uuidv4(),
          className: 'Motor6D',
          name: 'BodyPlaceholderWeld',
          parentId: rootPartId,
          properties: {
            Part0: { __type: 'Ref', id: rootPartId },
            Part1: { __type: 'Ref', id: placeholderId },
          },
        });
      }
      // No PreloadedSkinnedSurface anymore. Earlier attempt: bake a SurfaceAppearance
      // into RBXM with ColorMap pre-set, reparent to skinnedPart at runtime. Killed by:
      //   * SurfaceAppearance.ColorMap requires Image asset type, but Open Cloud uploads
      //     are always Decal wrappers (resolveImageIdFromDecal needed Open Cloud assets
      //     scope our system api-key doesn't have, kept failing with 403).
      // The weapon path proves MeshPart.TextureID = "rbxassetid://<DecalWrapperId>" works
      // because Roblox auto-resolves Decal → inner Image. We use the same trick here.
      //
      scene.push({
        id: uuidv4(),
        className: 'Script',
        name: 'LoadSkinnedBody',
        parentId: rootModelId,
        properties: {
          Source: [
            '-- Load skinned R15 MeshPart from Open Cloud Model asset and swap it into the rig.',
            '-- Open Cloud uploads FBX as assetType=Model, so MeshPart.MeshId cannot link it',
            '-- directly. We pull the MeshPart (with its R15 bone children) out of the loaded',
            '-- Model, normalize its scale + position to the rig\'s HumanoidRootPart, and hide',
            '-- the legacy R15 thin-shell parts so only the skinned MeshPart is visible.',
            'local InsertService = game:GetService("InsertService")',
            'local model = script.Parent',
            'local root = model:FindFirstChild("HumanoidRootPart")',
            'if not root then script:Destroy() return end',
            `local SKINNED_ASSET_ID = ${skinnedAssetIdNum}`,
            `local TEXTURE_URL = ${JSON.stringify(skinnedTextureUrl)}`,
            '-- Target NPC character height in studs: slightly taller than a default player.',
            `local TARGET_HEIGHT = ${NPC_MESH_TARGET_HEIGHT_STUDS.toFixed(2)}`,
            '',
            '-- Stage B (changelog-312): destroy any pre-existing static "Body" MeshPart',
            '-- + its Motor6D before loading the runtime version. The static MeshPart from',
            '-- Engine API extraction makes the mesh visible in Studio Edit (Stage B win)',
            '-- but cannot be visually scaled because Bones are not auto-instantiated.',
            '-- We swap it out at runtime for the LoadAsset version which DOES have Bones,',
            '-- so Model:ScaleTo below shrinks it correctly.',
            'local existingBody = model:FindFirstChild("Body")',
            'if existingBody then',
            '\tprint("[LoadSkinnedBody] destroying static-bake Body to swap in runtime version")',
            '\texistingBody:Destroy()',
            'end',
            'local existingMotor = root:FindFirstChild("SkinnedRoot")',
            'if existingMotor then existingMotor:Destroy() end',
            '',
            '-- Retry InsertService:LoadAsset with exponential backoff. CDN propagation',
            '-- after a fresh Open Cloud upload can take several seconds, so a single attempt',
            '-- often fails on first place-load. We DO NOT destroy the BodyPlaceholder until',
            '-- the load succeeds — if all retries fail, the translucent placeholder remains',
            '-- so the spawn is at least visible in Play.',
            'local function tryLoad()',
            '\tfor attempt = 1, 3 do',
            '\t\tlocal ok, asset = pcall(function()',
            '\t\t\treturn InsertService:LoadAsset(SKINNED_ASSET_ID)',
            '\t\tend)',
            '\t\tif ok and asset then',
            '\t\t\tprint("[LoadSkinnedBody] LoadAsset succeeded on attempt", attempt)',
            '\t\t\treturn asset',
            '\t\tend',
            '\t\twarn("[LoadSkinnedBody] LoadAsset attempt", attempt, "failed for", SKINNED_ASSET_ID)',
            '\t\tif attempt < 3 then task.wait(2 ^ (attempt - 1)) end',
            '\tend',
            '\treturn nil',
            'end',
            '',
            'local asset = tryLoad()',
            'if not asset then',
            '\twarn("[LoadSkinnedBody] all retries exhausted; keeping BodyPlaceholder as visible fallback")',
            '\tscript:Destroy() return',
            'end',
            '',
            'local skinnedPart',
            'for _, descendant in ipairs(asset:GetDescendants()) do',
            '\tif descendant:IsA("MeshPart") then',
            '\t\tskinnedPart = descendant',
            '\t\tbreak',
            '\tend',
            'end',
            'if not skinnedPart then',
            '\twarn("[LoadSkinnedBody] no MeshPart inside loaded asset", SKINNED_ASSET_ID)',
            '\tasset:Destroy()',
            '\tscript:Destroy() return',
            'end',
            '',
            '-- Detach from loaded asset and graft into our character.',
            'skinnedPart.Parent = model',
            'skinnedPart.Name = "Body"',
            'skinnedPart.Anchored = false',
            'skinnedPart.CanCollide = false',
            'skinnedPart.Massless = true',
            'pcall(function() skinnedPart.Transparency = 0 end)',
            'pcall(function() skinnedPart.LocalTransparencyModifier = 0 end)',
            'pcall(function() skinnedPart.CastShadow = true end)',
            '',
            '-- Real skinned mesh is now in place — remove the Edit-mode placeholder so it',
            '-- does not overlap the real Body. Done now (after success) instead of upfront,',
            '-- so failed loads fall back to a visible placeholder rather than empty space.',
            'local placeholder = model:FindFirstChild("BodyPlaceholder")',
            'if placeholder then placeholder:Destroy() end',
            'local placeholderWeld = root:FindFirstChild("BodyPlaceholderWeld")',
            'if placeholderWeld then placeholderWeld:Destroy() end',
            '',
            '-- Normalize scale: Meshy returns the mesh in its own units (often 3-5x R15).',
            '-- IMPORTANT: setting MeshPart.Size directly does NOT resize a skinned MeshPart',
            '-- visually — it only changes the collision box. The canonical way to scale a',
            '-- skinned mesh (preserving bones + skin weights) is to wrap it in a Model and',
            '-- call Model:ScaleTo on the wrapper. We do that here, then unwrap.',
            'local function getMeshHeight(part)',
            '\tlocal s = part.Size',
            '\treturn s, math.max(s.Y, 0.01)',
            'end',
            '',
            'local origSize, meshHeight = getMeshHeight(skinnedPart)',
            'print("[LoadSkinnedBody] originalSize=", origSize, "meshHeight=", meshHeight)',
            'if meshHeight > 0.01 then',
            '\tlocal scale = TARGET_HEIGHT / meshHeight',
            '\t-- Clamp wide enough to handle Meshy meshes that come back at 100-1000x R15.',
            '\t-- The previous lower bound of 0.05 was way too high (a 550-stud mesh would only',
            '\t-- shrink to 27 studs, still 5x too tall). 0.001 is safe — anything below means',
            '\t-- the mesh is broken.',
            '\tif scale < 0.001 then scale = 0.001 elseif scale > 50 then scale = 50 end',
            '\tprint("[LoadSkinnedBody] computed scale=", scale)',
            '\t-- Wrap skinnedPart in a temporary Model to use Model:ScaleTo, which is the',
            '\t-- only API that correctly scales a skinned mesh (mesh + bones + skin weights).',
            '\tlocal wrapper = Instance.new("Model")',
            '\twrapper.Name = "_SkinnedScaleWrapper"',
            '\tlocal originalParent = skinnedPart.Parent',
            '\tskinnedPart.Parent = wrapper',
            '\twrapper.PrimaryPart = skinnedPart',
            '\twrapper.Parent = originalParent',
            '\tlocal scaleOk, scaleErr = pcall(function() wrapper:ScaleTo(scale) end)',
            '\tprint("[LoadSkinnedBody] wrapper:ScaleTo ok=", scaleOk, "err=", scaleErr,',
            '\t\t"newSize=", skinnedPart.Size)',
            '\t-- Unwrap: move skinnedPart back under the character model and drop the wrapper.',
            '\tskinnedPart.Parent = originalParent',
            '\twrapper:Destroy()',
            'end',
            '',
            '-- Snap pivot to the HumanoidRootPart so the mesh appears at the rig\'s spawn',
            '-- position (without this it stays at the world coords baked by Meshy/FBX).',
            '-- Lift by half the body height so feet land roughly at HRP-base level (~1.5',
            '-- studs below HRP) instead of burying the feet underground.',
            'local hrpCFrame = root.CFrame',
            'local liftY = (skinnedPart.Size.Y * 0.5) - 1.5',
            'pcall(function() skinnedPart:PivotTo(hrpCFrame * CFrame.new(0, liftY, 0)) end)',
            'print("[LoadSkinnedBody] placed at", skinnedPart.Position, "liftY=", liftY)',
            '',
            '-- Texture pipeline (matches weapons): set MeshPart.TextureID with the raw',
            '-- uploaded asset URL (Decal wrapper or Image, Roblox auto-resolves). Critical:',
            '-- ALWAYS strip Meshy/FBX-imported SurfaceAppearance children first. They keep',
            '-- ColorMap pointing at Meshy CDN (inaccessible to Roblox) and override',
            '-- TextureID, leaving the body grey. We previously only stripped them when our',
            '-- own PreloadedSkinnedSurface was reparented; that conditional left greyed-out',
            '-- bodies whenever inner-image-id resolution failed.',
            'for _, child in ipairs(skinnedPart:GetChildren()) do',
            '\tif child:IsA("SurfaceAppearance") then',
            '\t\tchild:Destroy()',
            '\tend',
            'end',
            'if TEXTURE_URL ~= "" then',
            '\tlocal okTex, texErr = pcall(function() skinnedPart.TextureID = TEXTURE_URL end)',
            '\tprint("[LoadSkinnedBody] set TextureID ok=", okTex, "err=", texErr, "url=", TEXTURE_URL)',
            'else',
            '\tprint("[LoadSkinnedBody] no texture URL provided, body will use mesh default colors")',
            'end',
            '',
            '-- MeshPart.Color fallback — TextureID is often silently ignored on skinned',
            '-- MeshParts (HasSkinnedMesh=true), leaving the body grey. Setting MeshPart.Color',
            '-- to an extracted body color tints the mesh as a base layer, so even when the',
            '-- texture does not render the NPC has a recognisable colour instead of pure',
            '-- grey. iOS extracts these RGB values from the 2D concept image.',
            `local FALLBACK_R = ${fallbackR}`,
            `local FALLBACK_G = ${fallbackG}`,
            `local FALLBACK_B = ${fallbackB}`,
            'pcall(function() skinnedPart.Color = Color3.new(FALLBACK_R, FALLBACK_G, FALLBACK_B) end)',
            'print("[LoadSkinnedBody] applied MeshPart.Color fallback rgb=", FALLBACK_R, FALLBACK_G, FALLBACK_B)',
            'pcall(function() skinnedPart.Transparency = 0 end)',
            'pcall(function() skinnedPart.LocalTransparencyModifier = 0 end)',
            '',
            '-- Hide every fallback visual object so only the skinned MeshPart shows.',
            '-- Keep HumanoidRootPart and the new "Body" intact; the hidden R15 rig',
            '-- remains physically present for Humanoid/Motor6D compatibility.',
            'local hiddenFallbackParts = 0',
            'local function isSkinnedBodyDescendant(inst)',
            '\treturn inst == skinnedPart or inst:IsDescendantOf(skinnedPart)',
            'end',
            'local function hideFallbackPart(part)',
            '\tif part == root or isSkinnedBodyDescendant(part) then return end',
            '\tpcall(function() part.Transparency = 1 end)',
            '\tpcall(function() part.CanCollide = false end)',
            '\tpcall(function() part.CanTouch = false end)',
            '\tpcall(function() part.CanQuery = false end)',
            '\tpcall(function() part.CastShadow = false end)',
            '\tpcall(function() part.Massless = true end)',
            '\thiddenFallbackParts += 1',
            'end',
            'local function hideFallbackEffect(inst)',
            '\tif isSkinnedBodyDescendant(inst) then return end',
            '\tif inst:IsA("ParticleEmitter") or inst:IsA("Beam") or inst:IsA("Trail") then',
            '\t\tpcall(function() inst.Enabled = false end)',
            '\telseif inst:IsA("PointLight") or inst:IsA("SpotLight") or inst:IsA("SurfaceLight") then',
            '\t\tpcall(function() inst.Enabled = false end)',
            '\telseif inst:IsA("Decal") or inst:IsA("Texture") then',
            '\t\tpcall(function() inst.Transparency = 1 end)',
            '\tend',
            'end',
            'local function hideFallbackVisual(inst)',
            '\tif inst == root or isSkinnedBodyDescendant(inst) then return end',
            '\tif inst:IsA("BasePart") then',
            '\t\thideFallbackPart(inst)',
            '\telse',
            '\t\thideFallbackEffect(inst)',
            '\tend',
            'end',
            'for _, inst in ipairs(model:GetDescendants()) do',
            '\thideFallbackVisual(inst)',
            'end',
            'model:SetAttribute("AISkinnedBodyLoaded", true)',
            'model:SetAttribute("AISkinnedFallbackHidden", true)',
            'model:SetAttribute("AISkinnedFallbackHiddenParts", hiddenFallbackParts)',
            'local fallbackGuardConn',
            'fallbackGuardConn = model.DescendantAdded:Connect(function(inst)',
            '\ttask.defer(function()',
            '\t\tif not model.Parent then',
            '\t\t\tif fallbackGuardConn then fallbackGuardConn:Disconnect() end',
            '\t\t\treturn',
            '\t\tend',
            '\t\tif inst and inst.Parent then',
            '\t\t\thideFallbackVisual(inst)',
            '\t\t\tmodel:SetAttribute("AISkinnedFallbackHiddenParts", hiddenFallbackParts)',
            '\t\tend',
            '\tend)',
            'end)',
            '',
            '-- Weld to HumanoidRootPart so catalog animations driving the bones inside',
            '-- the skinned MeshPart move the whole body together with the rig.',
            'local motor = Instance.new("Motor6D")',
            'motor.Name = "SkinnedRoot"',
            'motor.Part0 = root',
            'motor.Part1 = skinnedPart',
            'motor.Parent = root',
            '',
            'asset:Destroy()',
            'script:Destroy()',
          ].join('\n'),
        },
      });
    }
  }

  // Load the character mesh at runtime via InsertService.
  // Open Cloud uploads GLB as "Model" asset type, but MeshPart.MeshId only accepts
  // "Mesh" (FileMesh) assets — so direct MeshId reference doesn't work.
  // Instead, a Script loads the Model asset and follows the invisible HumanoidRootPart.
  //
  // Skinned meshes from image-to-3D can have imperfect arm weights. Catalog
  // R15 limb tracks are opt-in only; default NPCs keep their generated rest pose
  // so arms do not periodically fold or twist in Play.
  // Stage B (changelog-312): also engage R15 catalog animations when the static
  // baked MeshPart path is active — bones inside the skinned mesh are still
  // named to R15 standards, so the same catalog tracks animate it.
  const wantsR15LimbAnimations = (useRuntimeSkinnedBody || useStaticBakedMeshPart)
    && npcMeshMotionMode === 'skinned_visual'
    && enableSkinnedNpcLimbAnimations;
  if (wantsR15LimbAnimations) {
    scene.push({
      id: uuidv4(),
      className: 'Script',
      name: 'PlayR15Animations',
      parentId: rootModelId,
      properties: {
        Source: [
          '-- Drive R15 catalog animations on a skinned MeshPart character',
          'local model = script.Parent',
          'local humanoid = model:FindFirstChildWhichIsA("Humanoid")',
          'if not humanoid then script:Destroy() return end',
          'local animator = humanoid:FindFirstChildOfClass("Animator")',
          'if not animator then',
          '\tanimator = Instance.new("Animator")',
          '\tanimator.Parent = humanoid',
          'end',
          '',
          '-- Roblox default-Animate IDs — these are the engine-bundled R15 bootstrap',
          '-- animations and load even in unpublished Studio places (serverplaceid=0).',
          '-- 507766388 was the Action Idle which Roblox gates by published placeId, so',
          '-- it failed in test mode (changelog-312 test 5 finding). 507766666 is the',
          '-- regular R15 Idle level 0 which is platform-bundled and always loadable.',
          'local IDLE_ID = "rbxassetid://507766666"   -- R15 idle level 0',
          'local WALK_ID = "rbxassetid://507777826"   -- R15 walk',
          'local RUN_ID  = "rbxassetid://507767714"   -- R15 run (was 913402848 — Action variant)',
          '',
          'local function loadAnim(id)',
          '\tlocal a = Instance.new("Animation")',
          '\ta.AnimationId = id',
          '\tlocal ok, track = pcall(function() return animator:LoadAnimation(a) end)',
          '\tif ok then return track end',
          '\treturn nil',
          'end',
          '',
          'local idleTrack = loadAnim(IDLE_ID)',
          'local walkTrack = loadAnim(WALK_ID)',
          'local runTrack  = loadAnim(RUN_ID)',
          '',
          '-- Procedural Motor6D fallback — runs when catalog animations fail to load',
          '-- (most common cause: unpublished Studio place + asset access gate). Without',
          '-- this the NPC is statue-still in test mode. ~10 lines of Heartbeat code that',
          '-- gently bobs the torso and rotates the neck so the NPC feels "alive".',
          'local function startProceduralIdle()',
          '\tlocal RunService = game:GetService("RunService")',
          '\tlocal upperTorso = model:FindFirstChild("UpperTorso")',
          '\tlocal head = model:FindFirstChild("Head")',
          '\tlocal waist = upperTorso and upperTorso:FindFirstChild("Waist")',
          '\tlocal neck = head and head:FindFirstChild("Neck")',
          '\tif not waist or not neck then return end',
          '\tlocal c0Waist = waist.C0',
          '\tlocal c0Neck = neck.C0',
          '\tlocal t0 = os.clock()',
          '\tRunService.Heartbeat:Connect(function()',
          '\t\tlocal t = os.clock() - t0',
          '\t\tlocal bob = math.sin(t * 1.6) * 0.04',
          '\t\tlocal turn = math.sin(t * 0.4) * math.rad(8)',
          '\t\tpcall(function() waist.C0 = c0Waist * CFrame.new(0, bob, 0) end)',
          '\t\tpcall(function() neck.C0 = c0Neck * CFrame.Angles(0, turn, 0) end)',
          '\tend)',
          '\tprint("[PlayR15Animations] catalog idle failed — using procedural Motor6D bob")',
          'end',
          '',
          'if idleTrack then',
          '\tidleTrack.Looped = true',
          '\tlocal okPlay = pcall(function() idleTrack:Play(0.2, 1, 1) end)',
          '\tif not okPlay then startProceduralIdle() end',
          'else',
          '\tstartProceduralIdle()',
          'end',
          '',
          'local current = "idle"',
          'humanoid.Running:Connect(function(speed)',
          '\tlocal target',
          '\tif speed < 0.1 then target = "idle"',
          '\telseif speed < 12 then target = "walk"',
          '\telse target = "run" end',
          '\tif target == current then return end',
          '\tcurrent = target',
          '\tif idleTrack then pcall(function() idleTrack:Stop(0.2) end) end',
          '\tif walkTrack then pcall(function() walkTrack:Stop(0.2) end) end',
          '\tif runTrack  then pcall(function() runTrack:Stop(0.2)  end) end',
          '\tlocal trk = (target == "idle") and idleTrack or (target == "walk") and walkTrack or runTrack',
          '\tif trk then pcall(function() trk.Looped = true; trk:Play(0.2, 1, 1) end) end',
          'end)',
          '',
          'humanoid.WalkSpeed = 12',
          'humanoid.AutoRotate = true',
        ].join('\n'),
      },
    });
  } else if (hasRuntimeStaticVisualAsset && runtimeStaticVisualAssetId && !(useRuntimeSkinnedBody && npcMeshMotionMode === 'skinned_visual') && !useStaticBakedMeshPart) {
    // Stage B (changelog-312, test 7): when static baked MeshPart is the visible
    // Body (emitted earlier with the correct R15 size from Blender pre-scaling),
    // the LoadCharacterMesh Script must NOT also fire — it loads meshAssetId
    // (raw GLB upload, NOT processed through auto_rig_r15.py pre-scaling) and
    // spawns a second giant body that overlaps the static one ("один в другом",
    // user report). Skipping this branch when useStaticBakedMeshPart=true.
    const assetIdNum = parseInt(runtimeStaticVisualAssetId, 10);
    if (assetIdNum > 0) {
      const fallbackMeshTextureId = textureAssetId ? toRobloxAssetUrl(textureAssetId) : '';
      const fallbackMeshTint = p.torso;
      const forceMeshTint = isNpcFallbackModel;
      const meshMotionMode = npcMeshMotionMode;
      const meshVisualTargetHeight = isNpcFallbackModel && npcVisualPipeline === 'mesh_asset_v1'
        ? NPC_MESH_TARGET_HEIGHT_STUDS
        : 5.6;
      scene.push({
        id: uuidv4(),
        className: 'Script',
        name: 'LoadCharacterMesh',
        parentId: rootModelId,
        properties: {
	          Source: [
	            '-- Auto-load and normalize character mesh from Roblox Model asset',
	            'local InsertService = game:GetService("InsertService")',
	            'local ContentProvider = game:GetService("ContentProvider")',
	            'local RunService = game:GetService("RunService")',
	            'local model = script.Parent',
	            'local root = model:FindFirstChild("HumanoidRootPart")',
	            'if not root then script:Destroy() return end',
            'local assetVisual = Instance.new("Model")',
            'assetVisual.Name = "GeneratedMeshVisual"',
            'assetVisual.Parent = model',
            'model:SetAttribute("AIGeneratedMeshFollowReady", false)',
            'local loadedParts = {}',
            'local loadedPartLookup = {}',
            'local loadedCount = 0',
            `local fallbackTextureId = ${JSON.stringify(fallbackMeshTextureId)}`,
            `local fallbackTint = Color3.new(${fallbackMeshTint.r.toFixed(3)}, ${fallbackMeshTint.g.toFixed(3)}, ${fallbackMeshTint.b.toFixed(3)})`,
            `local forceTint = ${forceMeshTint ? 'true' : 'false'}`,
            `local meshMotionMode = ${JSON.stringify(meshMotionMode)}`,
            'local isMovingVisual = meshMotionMode == "follow_root_visual" or meshMotionMode == "welded_visual"',
            '',
            'local function clampNumber(value, minValue, maxValue)',
            '\treturn math.max(minValue, math.min(maxValue, value))',
            'end',
            '',
            'local function partHasTexture(obj)',
            '\tif obj:IsA("MeshPart") and obj.TextureID ~= "" then',
            '\t\treturn true',
            '\tend',
            '\tlocal specialMesh = obj:FindFirstChildWhichIsA("SpecialMesh")',
            '\tif specialMesh and specialMesh.TextureId ~= "" then',
            '\t\treturn true',
            '\tend',
            '\tfor _, child in obj:GetChildren() do',
            '\t\tif child:IsA("SurfaceAppearance") then',
            '\t\t\tlocal hasColorMap = false',
            '\t\t\tpcall(function() hasColorMap = child.ColorMap ~= "" end)',
            '\t\t\tif hasColorMap then return true end',
            '\t\tend',
            '\tend',
            '\treturn false',
            'end',
            '',
	            'local function applyFallbackTextureOrTint(obj)',
	            '\tlocal hadTexture = partHasTexture(obj)',
	            '\tlocal usedFallbackTexture = false',
	            '\tif fallbackTextureId ~= "" then',
	            '\t\tif obj:IsA("MeshPart") and obj.TextureID == "" then',
	            '\t\t\tpcall(function() obj.TextureID = fallbackTextureId; usedFallbackTexture = true end)',
	            '\t\tend',
            '\t\tlocal specialMesh = obj:FindFirstChildWhichIsA("SpecialMesh")',
            '\t\tif specialMesh and specialMesh.TextureId == "" then',
            '\t\t\tpcall(function() specialMesh.TextureId = fallbackTextureId; usedFallbackTexture = true end)',
	            '\t\tend',
	            '\tend',
	            '\tlocal shouldUseSolidTint = (not hadTexture) and (not usedFallbackTexture)',
	            '\tif usedFallbackTexture then',
	            '\t\tpcall(function() obj.Color = Color3.new(1, 1, 1) end)',
	            '\t\tpcall(function() obj.Material = Enum.Material.SmoothPlastic end)',
	            '\telseif shouldUseSolidTint then',
	            '\t\tpcall(function() obj.Color = fallbackTint end)',
	            '\t\tpcall(function() obj.Material = Enum.Material.SmoothPlastic end)',
	            '\tend',
	            '\tif forceTint then',
	            '\t\tpcall(function() obj.Transparency = math.min(obj.Transparency, 0.05) end)',
	            '\tend',
	            '\tfor _, child in obj:GetChildren() do',
	            '\t\tif child:IsA("SurfaceAppearance") then',
	            '\t\t\tlocal hasColorMap = false',
	            '\t\t\tpcall(function() hasColorMap = child.ColorMap ~= "" end)',
	            '\t\t\tif hasColorMap then',
	            '\t\t\t\tlocal surfaceTint = shouldUseSolidTint and fallbackTint or Color3.new(1, 1, 1)',
	            '\t\t\t\tpcall(function() child.Color = surfaceTint end)',
	            '\t\t\telseif shouldUseSolidTint then',
	            '\t\t\t\tpcall(function() child:Destroy() end)',
	            '\t\t\tend',
	            '\t\tend',
            '\tend',
            'end',
            '',
            'local function rememberPart(obj)',
            '\tloadedCount += 1',
            '\tobj.Anchored = true',
            '\tobj.CanCollide = false',
            '\tobj.Massless = true',
            '\tobj.Parent = assetVisual',
            '\tloadedPartLookup[obj] = true',
            '\ttable.insert(loadedParts, obj)',
            '\tapplyFallbackTextureOrTint(obj)',
            'end',
            '',
            'local ok, asset = pcall(function()',
            `\treturn InsertService:LoadAsset(${assetIdNum})`,
            'end)',
            '',
            'if ok and asset then',
            '\tfor _, obj in asset:GetDescendants() do',
            '\t\tif obj:IsA("BasePart") then',
            '\t\t\trememberPart(obj)',
            '\t\tend',
            '\tend',
            '\tasset:Destroy()',
	            'end',
	            '',
	            'local function findGroundY()',
	            '\tlocal fallbackGroundY = root.Position.Y - 3.45',
	            '\tlocal params = RaycastParams.new()',
	            '\tparams.FilterType = Enum.RaycastFilterType.Exclude',
	            '\tparams.FilterDescendantsInstances = { model, assetVisual }',
	            '\tparams.IgnoreWater = true',
	            '\tlocal okRay, result = pcall(function()',
	            '\t\treturn workspace:Raycast(root.Position + Vector3.new(0, 8, 0), Vector3.new(0, -40, 0), params)',
	            '\tend)',
	            '\tif okRay and result then',
	            '\t\treturn result.Position.Y',
	            '\tend',
	            '\treturn fallbackGroundY',
	            'end',
	            '',
	            'local function normalizeVisual()',
	            '\tif loadedCount == 0 then return end',
            '\tlocal okBounds, _, size = pcall(function()',
            '\t\treturn assetVisual:GetBoundingBox()',
            '\tend)',
            '\tif okBounds and size and size.Y > 0.05 then',
            `\t\tlocal desiredHeight = ${meshVisualTargetHeight.toFixed(2)}`,
            '\t\tlocal scale = clampNumber(desiredHeight / size.Y, 0.15, 18)',
            '\t\tpcall(function() assetVisual:ScaleTo(scale) end)',
            '\t\tmodel:SetAttribute("AIGeneratedMeshScale", scale)',
            '\tend',
            '\tlocal okScaled, _, scaledSize = pcall(function()',
            '\t\treturn assetVisual:GetBoundingBox()',
            '\tend)',
	            '\tif okScaled and scaledSize then',
	            '\t\tlocal groundY = findGroundY()',
	            '\t\tmodel:SetAttribute("AIGeneratedMeshGroundY", groundY)',
	            '\t\tlocal targetPos = Vector3.new(root.Position.X, groundY + (scaledSize.Y * 0.5) + 0.08, root.Position.Z)',
            '\t\tlocal targetCf = CFrame.fromMatrix(targetPos, root.CFrame.XVector, root.CFrame.YVector, root.CFrame.ZVector)',
            '\t\tpcall(function() assetVisual:PivotTo(targetCf) end)',
	            '\tend',
	            'end',
	            '',
	            'local function preloadLoadedParts()',
	            '\tif loadedCount == 0 then return false end',
	            '\tlocal reportedFailure = false',
	            '\tlocal okPreload = pcall(function()',
	            '\t\tContentProvider:PreloadAsync(loadedParts, function(_, status)',
	            '\t\t\tlocal statusName = status and status.Name or tostring(status)',
	            '\t\t\tif statusName == "Failure" or statusName == "TimedOut" then',
	            '\t\t\t\treportedFailure = true',
	            '\t\t\tend',
	            '\t\tend)',
	            '\tend)',
	            '\treturn okPreload and not reportedFailure',
	            'end',
	            '',
	            'local function getLoadedVisualStats()',
	            '\tlocal visibleCount = 0',
	            '\tlocal meshLikeCount = 0',
	            '\tfor _, obj in ipairs(loadedParts) do',
	            '\t\tif obj:IsDescendantOf(assetVisual) and obj:IsA("BasePart") then',
	            '\t\t\tlocal size = obj.Size',
	            '\t\t\tif obj.Transparency < 0.97 and size.X > 0.05 and size.Y > 0.05 and size.Z > 0.05 then',
	            '\t\t\t\tvisibleCount += 1',
	            '\t\t\tend',
	            '\t\t\tif obj:IsA("MeshPart") or obj:FindFirstChildWhichIsA("SpecialMesh") then',
	            '\t\t\t\tmeshLikeCount += 1',
	            '\t\t\tend',
	            '\t\tend',
	            '\tend',
	            '\treturn visibleCount, meshLikeCount',
	            'end',
	            '',
	            'local function visualBoundsOk()',
	            '\tlocal okBounds, _, size = pcall(function()',
	            '\t\treturn assetVisual:GetBoundingBox()',
	            '\tend)',
	            '\tif not okBounds or not size then return false end',
	            '\treturn size.X >= 0.25 and size.Y >= 1.0 and size.Z >= 0.25 and size.Y <= 20',
	            'end',
	            '',
	            'normalizeVisual()',
	            '',
	            'local preloadOk = preloadLoadedParts()',
	            'local visibleLoadedCount, meshLikeCount = getLoadedVisualStats()',
	            'local boundsOk = visualBoundsOk()',
	            'local shouldUseLoadedVisual = loadedCount > 0 and preloadOk and visibleLoadedCount > 0 and meshLikeCount > 0 and boundsOk',
	            'local visualRootOffset = CFrame.new()',
	            'local visualWorldOffset = Vector3.new(0, 0, 0)',
	            'local visualRotation = CFrame.new()',
	            'local function computeFollowPivot(source)',
	            '\tlocal okPivot, pivot = pcall(function() return assetVisual:GetPivot() end)',
	            '\tif not okPivot or not pivot then return false end',
	            '\tvisualRootOffset = root.CFrame:ToObjectSpace(pivot)',
	            '\tlocal rawOffset = pivot.Position - root.Position',
	            '\tlocal safeY = clampNumber(rawOffset.Y, -2.5, 3.5)',
	            '\tvisualWorldOffset = Vector3.new(0, safeY, 0)',
	            '\tvisualRotation = pivot - pivot.Position',
	            '\tmodel:SetAttribute("AIGeneratedMeshFollowOffsetY", safeY)',
	            '\tmodel:SetAttribute("AIGeneratedMeshFollowOffsetSource", source)',
	            '\tif math.abs(rawOffset.X) > 0.15 or math.abs(rawOffset.Z) > 0.15 or math.abs(rawOffset.Y - safeY) > 0.15 then',
	            '\t\tmodel:SetAttribute("AIGeneratedMeshFollowOffsetClamped", true)',
	            '\t\tmodel:SetAttribute("AIGeneratedMeshRawOffsetMagnitude", math.floor(rawOffset.Magnitude * 100) / 100)',
	            '\tend',
	            '\treturn true',
	            'end',
	            'computeFollowPivot("post_normalize")',
	            'model:SetAttribute("AIGeneratedMeshPreloadOk", preloadOk)',
	            'model:SetAttribute("AIGeneratedMeshVisibleParts", visibleLoadedCount)',
	            'model:SetAttribute("AIGeneratedMeshMeshLikeParts", meshLikeCount)',
	            'model:SetAttribute("AIGeneratedMeshBoundsOk", boundsOk)',
	            '',
	            'if shouldUseLoadedVisual then',
	            '\tmodel:SetAttribute("AIGeneratedMeshLoaded", true)',
	            '\tmodel:SetAttribute("AIGeneratedMeshFollowMode", isMovingVisual and "follow_root_visual" or meshMotionMode)',
	            '\tmodel:SetAttribute("AIGeneratedMeshMovementDisabled", not isMovingVisual)',
	            '\tlocal hiddenFallbackParts = 0',
            '\tlocal function isLoadedVisualDescendant(inst)',
	            '\t\treturn inst == assetVisual or inst:IsDescendantOf(assetVisual)',
	            '\tend',
            '\tlocal function ensureCollisionShell()',
            '\t\tif not isMovingVisual then return end',
            '\t\tif assetVisual:FindFirstChild("GeneratedNpcCollisionShell") then return end',
            '\t\tlocal okBounds, cf, size = pcall(function()',
            '\t\t\treturn assetVisual:GetBoundingBox()',
            '\t\tend)',
            '\t\tif not okBounds or not cf or not size then return end',
            '\t\tlocal shell = Instance.new("Part")',
            '\t\tshell.Name = "GeneratedNpcCollisionShell"',
            '\t\tshell.Transparency = 1',
            '\t\tshell.Anchored = true',
            '\t\tshell.CanCollide = true',
            '\t\tshell.CanTouch = false',
            '\t\tshell.CanQuery = false',
            '\t\tshell.CastShadow = false',
            '\t\tshell.Size = Vector3.new(math.max(size.X, 2), math.max(size.Y, 4), math.max(size.Z, 1.5))',
            '\t\tshell.CFrame = cf',
            '\t\tshell.Parent = assetVisual',
            '\t\tloadedPartLookup[shell] = true',
            '\t\tmodel:SetAttribute("AIGeneratedMeshCollisionShell", true)',
            '\tend',
            '\tlocal function hidePart(part)',
            '\t\tlocal keepCollisionShell = isMovingVisual and part ~= root and not isLoadedVisualDescendant(part)',
            '\t\tpcall(function() part.Transparency = 1 end)',
            '\t\tpcall(function() part.CanCollide = keepCollisionShell end)',
            '\t\tpcall(function() part.CanTouch = false end)',
            '\t\tpcall(function() part.CanQuery = false end)',
            '\t\tpcall(function() part.CastShadow = false end)',
            '\tend',
            '\tlocal function hideFallbackEffect(effect)',
            '\t\tif isLoadedVisualDescendant(effect) then return end',
            '\t\tif effect:IsA("ParticleEmitter") or effect:IsA("Beam") or effect:IsA("Trail") then',
            '\t\t\tpcall(function() effect.Enabled = false end)',
            '\t\telseif effect:IsA("PointLight") or effect:IsA("SpotLight") or effect:IsA("SurfaceLight") then',
            '\t\t\tpcall(function() effect.Enabled = false end)',
            '\t\telseif effect:IsA("Decal") or effect:IsA("Texture") then',
            '\t\t\tpcall(function() effect.Transparency = 1 end)',
            '\t\tend',
            '\tend',
            '\tlocal function hideFallbackDescendant(child)',
            '\t\tif child:IsA("BasePart") then',
            '\t\t\tif child ~= root and not loadedPartLookup[child] and not isLoadedVisualDescendant(child) then',
            '\t\t\t\thidePart(child)',
            '\t\t\t\thiddenFallbackParts += 1',
            '\t\t\tend',
            '\t\telse',
            '\t\t\thideFallbackEffect(child)',
	            '\t\tend',
	            '\tend',
            '\tfor _, child in model:GetDescendants() do',
            '\t\thideFallbackDescendant(child)',
	            '\tend',
	            '\tmodel:SetAttribute("AIGeneratedFallbackHidden", true)',
	            '\tmodel:SetAttribute("AIGeneratedFallbackHiddenParts", hiddenFallbackParts)',
	            '\tlocal fallbackGuardConn',
	            '\tfallbackGuardConn = model.DescendantAdded:Connect(function(child)',
	            '\t\ttask.defer(function()',
	            '\t\t\tif child and child.Parent then',
	            '\t\t\t\thideFallbackDescendant(child)',
	            '\t\t\tend',
	            '\t\tend)',
	            '\tend)',
	            '\tfor _, obj in ipairs(loadedParts) do',
	            '\t\tpcall(function() obj.Anchored = true end)',
	            '\t\tpcall(function() obj.CanCollide = false end)',
	            '\t\tpcall(function() obj.CanTouch = false end)',
	            '\t\tpcall(function() obj.CanQuery = false end)',
	            '\t\tpcall(function() obj.Massless = true end)',
	            '\tend',
	            '\tensureCollisionShell()',
	            '\tcomputeFollowPivot("ready")',
	            '\tmodel:SetAttribute("AIGeneratedMeshFollowReady", true)',
	            '\tlocal humanoid = model:FindFirstChildWhichIsA("Humanoid")',
	            '\tif isMovingVisual then',
	            '\t\tpcall(function() root.Anchored = false end)',
	            '\t\tif humanoid then',
	            '\t\t\tpcall(function() humanoid.WalkSpeed = 6 end)',
	            '\t\t\tpcall(function() humanoid.JumpPower = math.max(humanoid.JumpPower, 40) end)',
	            '\t\t\tpcall(function() humanoid.AutoRotate = false end)',
	            '\t\tend',
	            '\t\tmodel:SetAttribute("AIGeneratedMeshKinematicFollow", true)',
	            '\telseif humanoid then',
	            '\t\tpcall(function() humanoid.WalkSpeed = 0 end)',
	            '\t\tpcall(function() humanoid.JumpPower = 0 end)',
	            '\t\tpcall(function() humanoid.AutoRotate = false end)',
	            '\t\tpcall(function() humanoid:Move(Vector3.new(0, 0, 0), false) end)',
	            '\t\tpcall(function() root.Anchored = true end)',
	            '\telse',
	            '\t\tpcall(function() root.Anchored = true end)',
	            '\tend',
	            '\tlocal nextRehideAt = 0',
	            '\twhile model.Parent and root.Parent and assetVisual.Parent do',
	            '\t\tlocal now = os.clock()',
	            '\t\tif now >= nextRehideAt then',
	            '\t\t\tnextRehideAt = now + 0.25',
            '\t\t\tfor _, child in model:GetDescendants() do',
            '\t\t\t\thideFallbackDescendant(child)',
	            '\t\t\tend',
	            '\t\t\tmodel:SetAttribute("AIGeneratedFallbackHiddenParts", hiddenFallbackParts)',
	            '\t\t\tif isMovingVisual then',
	            '\t\t\t\tpcall(function() root.Anchored = false end)',
	            '\t\t\t\tif humanoid then',
	            '\t\t\t\t\tpcall(function() humanoid.WalkSpeed = 6 end)',
	            '\t\t\t\t\tpcall(function() humanoid.AutoRotate = false end)',
	            '\t\t\t\tend',
	            '\t\t\telseif humanoid then',
	            '\t\t\t\tpcall(function() humanoid.WalkSpeed = 0 end)',
	            '\t\t\t\tpcall(function() humanoid:Move(Vector3.new(0, 0, 0), false) end)',
	            '\t\t\t\tpcall(function() root.Anchored = true end)',
	            '\t\t\telse',
	            '\t\t\t\tpcall(function() root.Anchored = true end)',
	            '\t\t\tend',
	            '\t\tend',
	            '\t\tif isMovingVisual then',
	            '\t\t\tensureCollisionShell()',
	            '\t\t\tlocal targetPos = Vector3.new(root.Position.X, root.Position.Y + visualWorldOffset.Y, root.Position.Z)',
	            '\t\t\tpcall(function() assetVisual:PivotTo(CFrame.new(targetPos) * visualRotation) end)',
	            '\t\telse',
	            // Idle bobble: subtle vertical sway so the static visual shell does not feel frozen.
	            '\t\t\tlocal bobble = math.sin(os.clock() * 1.5) * 0.06',
	            '\t\t\tlocal bobbleCf = visualRootOffset * CFrame.new(0, bobble, 0)',
	            '\t\t\tpcall(function() assetVisual:PivotTo(root.CFrame * bobbleCf) end)',
	            '\t\tend',
	            '\t\tRunService.Heartbeat:Wait()',
	            '\tend',
	            '\tif fallbackGuardConn then fallbackGuardConn:Disconnect() end',
	            'else',
	            '\tmodel:SetAttribute("AIGeneratedMeshLoaded", false)',
	            '\tmodel:SetAttribute("AIGeneratedMeshFallbackReason", "external_visual_not_usable")',
	            '\tassetVisual:Destroy()',
	            // Manifest sets R15 placeholder Transparency=1 by default (so the user
	            // sees only the AI mesh when it loads). If custom mesh failed to load,
	            // revert R15 body parts to visible so the user at least sees the
	            // procedural template body instead of just a Humanoid label.
	            '\tfor _, child in model:GetDescendants() do',
	            '\t\tif child:IsA("BasePart") and child.Name ~= "HumanoidRootPart" then',
	            '\t\t\tpcall(function() child.Transparency = 0 end)',
	            '\t\tend',
	            '\tend',
	            '\tmodel:SetAttribute("AIGeneratedFallbackVisualRevealed", true)',
	            'end',
            '',
            'script:Destroy()',
          ].join('\n'),
        },
      });

      scene.push({
        id: uuidv4(),
        className: 'Script',
        name: 'FollowGeneratedMeshVisual',
        parentId: rootModelId,
        properties: {
          Source: [
            '-- Watchdog follow loop for generated NPC visual shells.',
            '-- Keeps the visual mesh on the invisible HumanoidRootPart even if LoadCharacterMesh exits early.',
            'local RunService = game:GetService("RunService")',
            'local model = script.Parent',
            'local root = model:WaitForChild("HumanoidRootPart", 10)',
            `local meshMotionMode = ${JSON.stringify(meshMotionMode)}`,
            'local isMovingVisual = meshMotionMode == "follow_root_visual" or meshMotionMode == "welded_visual"',
            'if not root or not isMovingVisual then script:Destroy() return end',
            '',
            'local function countVisualParts(visual)',
            '\tlocal count = 0',
            '\tfor _, child in ipairs(visual:GetDescendants()) do',
            '\t\tif child:IsA("BasePart") and child.Name ~= "GeneratedNpcCollisionShell" then',
            '\t\t\tcount += 1',
            '\t\tend',
            '\tend',
            '\treturn count',
            'end',
            '',
            'local visual',
            'local deadline = os.clock() + 15',
            'while model.Parent do',
            '\tvisual = model:FindFirstChild("GeneratedMeshVisual")',
            '\tif visual and countVisualParts(visual) > 0 then',
            '\t\tif model:GetAttribute("AIGeneratedMeshFollowReady") == true then break end',
            '\t\tif os.clock() >= deadline then',
            '\t\t\tmodel:SetAttribute("AIGeneratedMeshFollowRescue", true)',
            '\t\t\tmodel:SetAttribute("AIGeneratedMeshFollowReady", true)',
            '\t\t\tbreak',
            '\t\tend',
            '\tend',
            '\tif os.clock() >= deadline then break end',
            '\tRunService.Heartbeat:Wait()',
            'end',
            'if not visual or countVisualParts(visual) == 0 then script:Destroy() return end',
            '',
            'local function ensureCollisionShell()',
            '\tif visual:FindFirstChild("GeneratedNpcCollisionShell") then return end',
            '\tlocal okBounds, cf, size = pcall(function()',
            '\t\treturn visual:GetBoundingBox()',
            '\tend)',
            '\tif not okBounds or not cf or not size then return end',
            '\tlocal shell = Instance.new("Part")',
            '\tshell.Name = "GeneratedNpcCollisionShell"',
            '\tshell.Transparency = 1',
            '\tshell.Anchored = true',
            '\tshell.CanCollide = true',
            '\tshell.CanTouch = false',
            '\tshell.CanQuery = false',
            '\tshell.CastShadow = false',
            '\tshell.Size = Vector3.new(math.max(size.X, 2), math.max(size.Y, 4), math.max(size.Z, 1.5))',
            '\tshell.CFrame = cf',
            '\tshell.Parent = visual',
            '\tmodel:SetAttribute("AIGeneratedMeshCollisionShell", true)',
            'end',
            '',
            'local okPivot, pivot = pcall(function() return visual:GetPivot() end)',
            'local visualRotation = okPivot and (pivot - pivot.Position) or CFrame.new()',
            'local offsetY = model:GetAttribute("AIGeneratedMeshFollowOffsetY")',
            'if type(offsetY) ~= "number" then',
            '\tlocal rawOffset = okPivot and (pivot.Position - root.Position) or Vector3.new(0, 0, 0)',
            '\toffsetY = math.max(-2.5, math.min(3.5, rawOffset.Y))',
            '\tmodel:SetAttribute("AIGeneratedMeshFollowOffsetY", offsetY)',
            '\tmodel:SetAttribute("AIGeneratedMeshFollowOffsetSource", "watchdog_fallback")',
            'end',
            'model:SetAttribute("AIGeneratedMeshFollowWatchdog", true)',
            '',
            'local function hideFallbackDescendant(inst)',
            '\tif inst == root or inst == visual or inst:IsDescendantOf(visual) then return end',
            '\tif inst:IsA("BasePart") then',
            '\t\tpcall(function() inst.Transparency = 1 end)',
            '\t\tpcall(function() inst.CanCollide = false end)',
            '\t\tpcall(function() inst.CanTouch = false end)',
            '\t\tpcall(function() inst.CanQuery = false end)',
            '\t\tpcall(function() inst.CastShadow = false end)',
            '\telseif inst:IsA("ParticleEmitter") or inst:IsA("Beam") or inst:IsA("Trail") then',
            '\t\tpcall(function() inst.Enabled = false end)',
            '\telseif inst:IsA("PointLight") or inst:IsA("SpotLight") or inst:IsA("SurfaceLight") then',
            '\t\tpcall(function() inst.Enabled = false end)',
            '\telseif inst:IsA("Decal") or inst:IsA("Texture") then',
            '\t\tpcall(function() inst.Transparency = 1 end)',
            '\tend',
            'end',
            '',
            'local nextMaintenanceAt = 0',
            'while model.Parent and root.Parent and visual.Parent do',
            '\tlocal now = os.clock()',
            '\tif now >= nextMaintenanceAt then',
            '\t\tnextMaintenanceAt = now + 0.25',
            '\t\tpcall(function() root.Anchored = false end)',
            '\t\tlocal humanoid = model:FindFirstChildWhichIsA("Humanoid")',
            '\t\tif humanoid then',
            '\t\t\tpcall(function() humanoid.WalkSpeed = 6 end)',
            '\t\t\tpcall(function() humanoid.AutoRotate = false end)',
            '\t\tend',
            '\t\tfor _, inst in ipairs(model:GetDescendants()) do',
            '\t\t\thideFallbackDescendant(inst)',
            '\t\tend',
            '\t\tfor _, part in ipairs(visual:GetDescendants()) do',
            '\t\t\tif part:IsA("BasePart") then',
            '\t\t\t\tlocal isShell = part.Name == "GeneratedNpcCollisionShell"',
            '\t\t\t\tpcall(function() part.Anchored = true end)',
            '\t\t\t\tpcall(function() part.CanCollide = isShell end)',
            '\t\t\t\tpcall(function() part.CanTouch = false end)',
            '\t\t\t\tpcall(function() part.CanQuery = false end)',
            '\t\t\tend',
            '\t\tend',
            '\t\tensureCollisionShell()',
            '\tend',
            '\tlocal targetPos = Vector3.new(root.Position.X, root.Position.Y + offsetY, root.Position.Z)',
            '\tpcall(function() visual:PivotTo(CFrame.new(targetPos) * visualRotation) end)',
            '\tRunService.Heartbeat:Wait()',
            'end',
            'script:Destroy()',
          ].join('\n'),
        },
      });

      // Store the asset ID as a StringValue for reference
      scene.push({
        id: uuidv4(),
        className: 'StringValue',
        name: 'MeshAssetId',
        parentId: rootModelId,
        properties: { Value: `${assetIdNum}` },
      });
    }
  }

  const NPC_VISUAL_REQUIRED_SLOTS = [
    'face',
    'head_identity',
    'torso_outfit',
    'shoulder_neck',
    'waist',
    'hand_back_prop',
    'legs_feet',
    'role_marker',
  ] as const;
  type NpcVisualQualitySlot = typeof NPC_VISUAL_REQUIRED_SLOTS[number];
  const npcVisualDetailNames = new Set<string>();
  const npcVisualCoveredSlots = new Set<NpcVisualQualitySlot>();
  const npcVisualIdentitySilhouetteNames = new Set<string>();
  const npcVisualFamilySignatureNames = new Set<string>();
  const npcRigidAccessoryNames = new Set<string>();
  const npcMeshAccessoryNames = new Set<string>();
  let npcLlmAccentDetailCount = 0;

  function recordNpcVisualFamilySignature(...names: string[]): void {
    for (const name of names) {
      if (name.trim().length > 0) npcVisualFamilySignatureNames.add(name);
    }
  }

  function recordNpcVisualDetail(name: string, bodyPartName: string, size?: [number, number, number]): void {
    if (!isNpcFallbackModel) return;
    npcVisualDetailNames.add(name);
    const lower = name.toLowerCase();
    if (bodyPartName === 'Head') npcVisualCoveredSlots.add('head_identity');
    if (/face|eye|brow|nose|mouth|beard|mustache|glasses|shade|mask|visor|scar|mark|smirk|mandible|fang|tusk|snout/.test(lower)) {
      npcVisualCoveredSlots.add('face');
    }
    if (/hair|hat|helmet|hood|crown|cap|halo|horn|antenna|ear|headphone|tricorn|bandana|mushroom|cap/.test(lower)) {
      npcVisualCoveredSlots.add('head_identity');
    }
    if (bodyPartName === 'UpperTorso' || /robe|shirt|tunic|armor|chest|apron|vest|coat|suit|hoodie|tank|tabard|panel|screen/.test(lower)) {
      npcVisualCoveredSlots.add('torso_outfit');
    }
    if (/shoulder|pauldron|collar|scarf|neck|sash|cape|clasp|chain|amulet|wing|bedroll|mane|vine|leaf|spine/.test(lower)) {
      npcVisualCoveredSlots.add('shoulder_neck');
    }
    if (bodyPartName === 'LowerTorso' || /belt|buckle|waist|pouch|skirt|shorts|slacks|joggers|trouser/.test(lower)) {
      npcVisualCoveredSlots.add('waist');
    }
    if (
      bodyPartName === 'LeftHand'
      || bodyPartName === 'RightHand'
      || /hand|staff|sword|shield|book|scroll|lantern|orb|glow|back|pack|quiver|weapon|club|baton|dagger|mic|phone|map|pick|scepter|satchel|cutlass|kunai|dumbbell|spatula|tail|claw|abdomen|spinner|web|crystal|core/.test(lower)
    ) {
      npcVisualCoveredSlots.add('hand_back_prop');
    }
    if (/leg|foot|boot|knee|cuff|ankle|shoe|shackle/.test(lower) || bodyPartName.includes('Leg') || bodyPartName.includes('Foot')) {
      npcVisualCoveredSlots.add('legs_feet');
    }
    if (/quest|merchant|guard|badge|aura|marker|chat|enemy|boss|roast|police|patrol|companion|hero|superhero|rune|core|siren|trade|skibidi|arachnid|spider|golem|brute|beast|winged|plant|fungal|mushroom|elemental|mutant|demon/.test(lower)) {
      npcVisualCoveredSlots.add('role_marker');
    }
    const largestAxis = Array.isArray(size) ? Math.max(...size) : 0;
    const volume = Array.isArray(size) ? size[0] * size[1] * size[2] : 0;
    const silhouetteCue = /hair|hat|helmet|hood|cowl|crown|halo|horn|ear|cape|cloak|collar|scarf|pauldron|shoulder|wing|backpack|pack|satchel|quiver|staff|sword|shield|baton|lantern|book|scroll|map|suit|armor|tabard|robe|coat|apron|vest|belt|boot|gauntlet|bracer|glove|aura|trail|arachnid|spider|backleg|abdomen|mandible|spinner|web|brute|fist|forearm|tusk|beast|snout|tail|mane|claw|golem|rock|stone|crystal|chunk|crack|plant|fungal|mushroom|vine|leaf|spore|demon|spine/.test(lower);
    if (silhouetteCue && (largestAxis >= 0.72 || volume >= 0.08)) {
      npcVisualIdentitySilhouetteNames.add(name);
    }
  }

  for (const generatedAccessory of generatedNpcAccessoryFallbackSpecs) {
    const markerName = `GeneratedMesh_${generatedAccessory.key}`;
    npcMeshAccessoryNames.add(markerName);
    recordNpcVisualDetail(
      `${markerName}_${generatedAccessory.displayName}`,
      generatedAccessory.bodyPartName,
      [generatedAccessory.targetLongestAxis, generatedAccessory.targetLongestAxis, generatedAccessory.targetLongestAxis],
    );
  }

  function buildNpcVisualQualityGate(requiredMarkers: string[]): Record<string, unknown> {
    const uniqueRequiredMarkers = Array.from(new Set(requiredMarkers));
    const missingMarkers = uniqueRequiredMarkers.filter((name) => !scene.some((node) => node.name === name));
    const slotCoverage = Array.from(npcVisualCoveredSlots);
    const missingSlots = NPC_VISUAL_REQUIRED_SLOTS.filter((slot) => !npcVisualCoveredSlots.has(slot));
    const visibleDetailCount = npcVisualDetailNames.size;
    const identitySilhouetteDetails = Array.from(npcVisualIdentitySilhouetteNames);
    const familySignatureMarkers = Array.from(npcVisualFamilySignatureNames);
    const missingFamilySignatureMarkers = familySignatureMarkers.filter((name) => !scene.some((node) => node.name === name));
    const rigidAccessoryMarkers = Array.from(npcRigidAccessoryNames);
    const meshAccessoryMarkers = Array.from(npcMeshAccessoryNames);
    const requiresFamilySignature = isNpcNonHumanoidVisualFamily(npcVisualFamily);
    const requiresMeshAccessoryLayer = isNpcFallbackModel
      && (String(metadata.npcMode || '').toLowerCase() === 'roast'
        || String(metadata.contentSubcategory || '').toLowerCase() === 'roast_npc');
    const minimumSpeciesSignatureDetails = requiresFamilySignature ? 4 : 0;
    const minimumIdentitySilhouetteDetails = usesTemplateFirstVisuals ? 4 : 2;
    const minimumMeshAccessoryCount = requiresMeshAccessoryLayer ? 6 : 0;
    const sourceCues = npcResolvedVisualPlan.sourceCues;
    const missingSourceCues = sourceCues
      .filter((cue) => ![
        npcVisualFamily,
        ...(npcResolvedVisualPlan.styleArchetypes ?? []),
        npcResolvedVisualPlan.role,
      ].includes(cue));
    const promptFidelityText = `${args.title} ${args.prompt} ${metadata.appearance ?? ''} ${metadata.visualDescription ?? ''} ${metadata.npcVisualHooks ?? ''} ${npcResolvedVisualPlan.sourceCues.join(' ')}`.toLowerCase();
    const generatedAccessoryAssetSummaries = generatedNpcAccessoryFallbackSpecs.map((asset) => ({
      key: asset.key,
      displayName: asset.displayName,
      assetId: asset.assetId,
      bodyPartName: asset.bodyPartName,
      attachmentName: asset.attachmentName,
      provider: asset.provider,
    }));
    const generatedAssetHas = (pattern: RegExp): boolean => generatedNpcAccessoryFallbackSpecs.some((asset) => (
      pattern.test(asset.key)
      || pattern.test(asset.displayName)
      || pattern.test(`GeneratedMesh_${asset.key}`)
    ));
    const sceneHas = (pattern: RegExp): boolean => scene.some((node) => pattern.test(node.name)) || generatedAssetHas(pattern);
    const explicitSkibidiBodyCue = /\bskibidi\b|\btoilet\b|скибиди|унитаз/.test(promptFidelityText);
    const requestedCueChecks = [
      {
        cue: 'broccoli_hair',
        requested: /broccoli\s*(?:hair|cut|hairstyle)|broccoli[-\s]*head|брокколи[а-яё\s-]*(?:волос|причес|прич[её]ск|голов)/.test(promptFidelityText),
        present: sceneHas(/BroccoliHair|AccentBroccoli/i),
      },
      {
        cue: 'smartphone',
        requested: /smart\s*phone|smartphone|\bphone\b|телефон|смартфон/.test(promptFidelityText),
        present: sceneHas(/Smartphone|MeshSmartphone|PhoneScreen|AlphaPhone/i),
      },
      {
        cue: 'black_tee',
        requested: /black\s+(?:graphic\s+)?tee|black\s+t-?shirt|faded\s+black|ч[её]рн[а-яё\s-]*(?:футбол|майк)/.test(promptFidelityText),
        present: sceneHas(/BlackTee|GraphicTee|TeeBody/i),
      },
      {
        cue: 'blue_cargo_pants',
        requested: /blue\s+cargo\s+pants|light[-\s]*blue\s+(?:cargo\s+)?pants|голуб[а-яё\s-]*(?:карго|штаны|брюки)/.test(promptFidelityText),
        present: sceneHas(/CargoPants|BluePants|CargoPocket/i),
      },
      {
        cue: 'chunky_sneakers',
        requested: /chunky\s+sneakers|sneakers|кроссов/.test(promptFidelityText),
        present: sceneHas(/ChunkySole|Sneaker/i),
      },
      {
        cue: 'goofy_big_head',
        requested: /goofy\s+big\s+head|oversized\s+head|big\s+head|large\s+head|huge\s+head|больш[а-яё\s-]*голов/.test(promptFidelityText),
        present: wantsGoofyOversizedHead && sceneHas(/^Head$/i),
      },
      {
        cue: 'pastel_palette',
        requested: /pastel|пастел/i.test(promptFidelityText),
        present: sceneHas(/AlphaHoodie|AlphaSleeve|AlphaCap|GenAlphaBlueCargo|GenAlphaBlackTee|GenAlphaGraphic|GenAlphaDrip|VariantSticker|VariantBackpackPatch/i),
      },
      {
        cue: 'smug_expression',
        requested: /smug|smirk|саркастич|самодоволь|ухмыл/i.test(promptFidelityText),
        present: sceneHas(/SmugMouth|AlphaSmug|GenAlphaSmug|Smirk|FaceMouth|FaceBrow/i),
      },
      {
        cue: 'meme_identity',
        requested: /gen[-\s]*alpha|meme|brainrot|roast|мем|мемн/i.test(promptFidelityText),
        present: sceneHas(/GenAlpha(?:BlackTee|BlueCargo|Broccoli|Smartphone|Chunky|Graphic|Drip|Smug)|Alpha(?:Hoodie|Phone|Shades|Smug)|Roast(?:Mic|Speech|Shades|Stage)|AiChatBadge/i),
      },
      {
        cue: 'full_body_styled',
        requested: /full[-\s]*body|outfit|fashion|trendy\s+fashion|soft\s+trendy|модн|стильн/i.test(promptFidelityText),
        present: npcVisualCoveredSlots.has('torso_outfit') && npcVisualCoveredSlots.has('legs_feet') && npcVisualCoveredSlots.has('head_identity'),
      },
      {
        cue: 'skibidi_identity',
        requested: explicitSkibidiBodyCue,
        present: sceneHas(/Skibidi(?:Mesh|Golden|Toilet|Shades|Roast|Asset|Identity)?/i),
      },
      {
        cue: 'golden_accent',
        requested: /gold|golden|золот|aurum/.test(promptFidelityText),
        present: sceneHas(/Golden|Gold|Crown|Halo|Aura/i),
      },
      {
        cue: 'gym_bro_identity',
        requested: NPC_GYM_BRO_STYLE_CUE.test(promptFidelityText),
        present: sceneHas(/Gym(?:Bro)?(?:Mesh|Tank|Bicep|Shoulder|Dumbbell|Protein|Weight|Wristband|Sweatband|Shorts|Muscle|Pecs|Lat|Quad|Calf)/i),
      },
      {
        cue: 'humanoid_kid',
        requested: hasHumanoidNpcVisualCue(promptFidelityText),
        present: npcVisualFamily === 'humanoid',
      },
    ].filter((check) => check.requested);
    const missingPromptCues = requestedCueChecks.filter((check) => !check.present).map((check) => check.cue);
    const humanoidUnsupportedForbidden = npcVisualFamily === 'humanoid';
    const explicitBoss = hasExplicitNpcStyleCue('boss', promptFidelityText, metadata.npcRole);
    const explicitQuest = hasExplicitNpcStyleCue('quest', promptFidelityText, metadata.npcRole);
    const explicitWinged = /\b(?:wing|wings|winged|demons?|dragons?)\b|крыл|демон|дракон/.test(promptFidelityText);
    const explicitTail = /tail|хвост/.test(promptFidelityText);
    const explicitClaw = /claw|когт/.test(promptFidelityText);
    const forbiddenUnsupportedCues = [
      { cue: 'winged', forbidden: humanoidUnsupportedForbidden && !explicitWinged, present: sceneHas(/Winged|Horn/i) },
      { cue: 'tail', forbidden: humanoidUnsupportedForbidden && !explicitTail, present: sceneHas(/Tail/i) },
      { cue: 'claw', forbidden: humanoidUnsupportedForbidden && !explicitClaw, present: sceneHas(/Claw/i) },
      { cue: 'boss', forbidden: !explicitBoss, present: sceneHas(/BossRole|BossCrown|BossScepter/i) },
      { cue: 'quest', forbidden: !explicitQuest, present: sceneHas(/QuestMarker|QuestScroll|QuestBook/i) },
      { cue: 'skibidi', forbidden: humanoidUnsupportedForbidden && !explicitSkibidiBodyCue, present: sceneHas(/Skibidi|Toilet/i) },
    ].filter((check) => check.forbidden && check.present).map((check) => check.cue);
    const promptFidelity = {
      requiredCues: requestedCueChecks.map((check) => check.cue),
      missingRequiredCues: missingPromptCues,
      forbiddenUnsupportedCues,
      passed: missingPromptCues.length === 0 && forbiddenUnsupportedCues.length === 0,
    };
    return {
      version: 10,
      visualFamily: npcVisualFamily,
      visualDNA: npcResolvedVisualPlan,
      promptFidelity,
      requiredMarkers: uniqueRequiredMarkers,
      missingMarkers,
      minimumVisibleDetails: 12,
      visibleDetailCount,
      minimumIdentitySilhouetteDetails,
      identitySilhouetteDetails,
      familySignatureMarkers,
      missingFamilySignatureMarkers,
      minimumSpeciesSignatureDetails,
      speciesSignatureDetailCount: familySignatureMarkers.length,
      rigidAccessoryMarkers,
      rigidAccessoryCount: rigidAccessoryMarkers.length,
      meshAccessoryMarkers,
      meshAccessoryCount: meshAccessoryMarkers.length,
      minimumMeshAccessoryCount,
      generatedAccessoryAssets: generatedAccessoryAssetSummaries,
      generatedAccessoryAssetCount: generatedAccessoryAssetSummaries.length,
      slotCoverage,
      missingSlots,
      sourceCues,
      missingSourceCues,
      llmAccentDetailCount: npcLlmAccentDetailCount,
      passed: missingMarkers.length === 0
        && missingSlots.length === 0
        && promptFidelity.passed === true
        && visibleDetailCount >= 12
        && identitySilhouetteDetails.length >= minimumIdentitySilhouetteDetails
        && meshAccessoryMarkers.length >= minimumMeshAccessoryCount
        && (!requiresFamilySignature || (
          missingFamilySignatureMarkers.length === 0
          && familySignatureMarkers.length >= minimumSpeciesSignatureDetails
        )),
    };
  }

  function addAttachedBox(
    name: string,
    bodyPartName: string,
    size: [number, number, number],
    offset: [number, number, number],
    color: Record<string, unknown>,
    material: { enumName: string; value: number },
    shape: 'Block' | 'Cylinder' | 'Sphere' = 'Block',
  ): string | undefined {
    const bodyPartId = partIds[bodyPartName];
    const bodyPart = r15Parts.find((part) => part.name === bodyPartName);
    if (!bodyPartId || !bodyPart) return undefined;
    const partId = uuidv4();
    const position: [number, number, number] = [
      bodyPart.position[0] * s.w + offset[0],
      bodyPart.position[1] * s.h + offset[1],
      bodyPart.position[2] * s.d + offset[2],
    ];
    scene.push({
      id: partId,
      className: 'Part',
      name,
      parentId: rootModelId,
      properties: {
        Anchored: false,
        CanCollide: false,
        Massless: true,
        Size: vector3(size[0] * s.w, size[1] * s.h, size[2] * s.d),
        CFrame: cframe(position[0], position[1], position[2]),
        Color: color,
        Material: { __type: 'Enum', enumType: 'Material', enumName: material.enumName, value: material.value },
      },
    });
    scene.push({
      id: uuidv4(),
      className: 'WeldConstraint',
      name: `${name}Weld`,
      parentId: partId,
      properties: {
        Part0: { __type: 'Ref', id: partId },
        Part1: { __type: 'Ref', id: bodyPartId },
      },
    });
    pushShapeMesh(partId, shape);
    recordNpcVisualDetail(name, bodyPartName, size);
    return partId;
  }

  function addPointLight(
    parentPartId: string | undefined,
    name: string,
    color: Record<string, unknown>,
    range = 10,
    brightness = 1.6,
  ): void {
    if (!parentPartId) return;
    scene.push({
      id: uuidv4(),
      className: 'PointLight',
      name,
      parentId: parentPartId,
      properties: {
        Color: color,
        Range: range,
        Brightness: brightness,
        Shadows: true,
      },
    });
  }

  // Material name → Roblox enum (covers extended set used by LLM-driven config).
  const NPC_MATERIAL_TABLE: Record<string, { enumName: string; value: number }> = {
    Plastic: { enumName: 'Plastic', value: 256 },
    SmoothPlastic: { enumName: 'SmoothPlastic', value: 272 },
    Neon: { enumName: 'Neon', value: 288 },
    Wood: { enumName: 'Wood', value: 512 },
    WoodPlanks: { enumName: 'WoodPlanks', value: 528 },
    Metal: { enumName: 'Metal', value: 1088 },
    DiamondPlate: { enumName: 'DiamondPlate', value: 1056 },
    CorrodedMetal: { enumName: 'CorrodedMetal', value: 1040 },
    Fabric: { enumName: 'Fabric', value: 1312 },
    Leather: { enumName: 'Leather', value: 848 },
    Glass: { enumName: 'Glass', value: 1568 },
    Ice: { enumName: 'Ice', value: 1536 },
    ForceField: { enumName: 'ForceField', value: 1584 },
    Sand: { enumName: 'Sand', value: 1296 },
    Slate: { enumName: 'Slate', value: 800 },
    Concrete: { enumName: 'Concrete', value: 816 },
    Marble: { enumName: 'Marble', value: 784 },
    Granite: { enumName: 'Granite', value: 832 },
    Grass: { enumName: 'Grass', value: 1280 },
  };

  // SpecialMesh enum mapping for accessory shapes. PartType (Block/Wedge etc.)
  // could be set on the BasePart directly, but SpecialMesh works on any Part and
  // gives us Cylinder/Sphere too. Values: Sphere=3, Cylinder=4, Wedge=6, Block via PartType.
  function pushShapeMesh(parentPartId: string, shape: NonNullable<unknown>): void {
    if (shape === 'Block') return; // Block = default Part shape, no mesh needed
    if (shape === 'Sphere') {
      scene.push({
        id: uuidv4(),
        className: 'SpecialMesh',
        name: 'AccessoryMesh',
        parentId: parentPartId,
        properties: {
          MeshType: { __type: 'Enum', enumType: 'MeshType', enumName: 'Sphere', value: 3 },
          Scale: vector3(1, 1, 1),
        },
      });
      return;
    }
    if (shape === 'Cylinder') {
      scene.push({
        id: uuidv4(),
        className: 'SpecialMesh',
        name: 'AccessoryMesh',
        parentId: parentPartId,
        properties: {
          MeshType: { __type: 'Enum', enumType: 'MeshType', enumName: 'Cylinder', value: 4 },
          Scale: vector3(1, 1, 1),
        },
      });
      return;
    }
    if (shape === 'Wedge') {
      // Wedge is a PartType, not a SpecialMesh — patch the parent Part's properties
      // after it's pushed. Caller handles that via patchPartType below.
      return;
    }
  }

  function sanitizeNpcAccessoryPlacement(
    name: string,
    parent: string,
    shape: 'Block' | 'Cylinder' | 'Sphere' | 'Wedge',
    size: [number, number, number],
    offset: [number, number, number],
  ): { shape: 'Block' | 'Cylinder' | 'Sphere' | 'Wedge'; size: [number, number, number]; offset: [number, number, number] } {
    if (parent !== 'Head') {
      return { shape, size, offset };
    }

    const lower = name.toLowerCase();
    const isFeather = /feather|plume|перо|перья|плюм/.test(lower);
    const isHat = /hat|cap|hood|helmet|crown|brim|шляп|колпак|капюш|шлем|корон/.test(lower);
    const isTip = /tip|cone|peak|point|horn|spike|верх|конус|остр|рог|шип/.test(lower);
    const isMaskOrVisor = /mask|visor|face|beard|eye|очк|маск|визор|бород|глаз/.test(lower);
    const safeSize: [number, number, number] = [...size];
    const safeOffset: [number, number, number] = [...offset];

    if (isFeather) {
      safeSize[0] = Math.min(safeSize[0], 0.22);
      safeSize[1] = Math.min(safeSize[1], 0.85);
      safeSize[2] = Math.min(safeSize[2], 0.14);
      safeOffset[1] = Math.min(1.30, Math.max(0.55, safeOffset[1]));
      safeOffset[2] = Math.min(0.45, Math.max(-0.65, safeOffset[2]));
      return { shape, size: safeSize, offset: safeOffset };
    }

    if (isHat || isTip) {
      safeSize[0] = Math.min(safeSize[0], isTip ? 0.85 : 2.05);
      safeSize[1] = Math.min(safeSize[1], isTip ? 0.85 : 0.48);
      safeSize[2] = Math.min(safeSize[2], isTip ? 0.85 : 1.45);
      safeOffset[1] = Math.min(isTip ? 1.55 : 0.95, Math.max(isTip ? 0.85 : 0.42, safeOffset[1]));
      safeOffset[2] = Math.min(0.45, Math.max(-0.45, safeOffset[2]));
      return { shape, size: safeSize, offset: safeOffset };
    }

    if (isMaskOrVisor) {
      safeSize[0] = Math.min(safeSize[0], 1.75);
      safeSize[1] = Math.min(safeSize[1], 0.45);
      safeSize[2] = Math.min(safeSize[2], 0.22);
      safeOffset[1] = Math.min(0.55, Math.max(-0.25, safeOffset[1]));
      safeOffset[2] = Math.min(-0.35, Math.max(-0.65, safeOffset[2]));
      return { shape, size: safeSize, offset: safeOffset };
    }

    safeSize[0] = Math.min(safeSize[0], 1.40);
    safeSize[1] = Math.min(safeSize[1], 0.45);
    safeSize[2] = Math.min(safeSize[2], 0.45);
    safeOffset[1] = Math.min(0.90, Math.max(-0.20, safeOffset[1]));
    safeOffset[2] = Math.min(0.55, Math.max(-0.55, safeOffset[2]));
    return { shape, size: safeSize, offset: safeOffset };
  }

  function sanitizeNpcAccentAccessoryPlacement(
    name: string,
    parent: string,
    shape: 'Block' | 'Cylinder' | 'Sphere' | 'Wedge',
    size: [number, number, number],
    offset: [number, number, number],
  ): { name: string; shape: 'Block' | 'Cylinder' | 'Sphere' | 'Wedge'; size: [number, number, number]; offset: [number, number, number] } | null {
    const lower = name.toLowerCase();
    const promptAllowsFaceCover = /mask|visor|маск|визор|helmet visor|masked/.test(`${args.title} ${args.prompt} ${metadata.visualDescription ?? ''} ${metadata.appearance ?? ''}`.toLowerCase());
    const smallDetailCue = /accent|badge|rune|gem|jewel|scar|mark|stripe|trim|button|seam|stitch|pin|patch|clasp|buckle|belt|pouch|coin|ring|brace|bracelet|cuff|knee|boot|charm|amulet|chain|medal|brooch|lens|glow|orb|spark|feather|plume|tuft|hair|bead|stud|earring|tattoo|symbol|sigil|vial|scroll|book/.test(lower);
    const mediumIdentityCue = /hair|tuft|hat|cap|crown|cowl|collar|scarf|capelet|cape\s*clasp|capeclasp|shoulder|pauldron|backpack|pack|satchel|quiver|buckler|smallshield|wand|shortstaff|staff charm|stafforb|book|scroll|map|lantern|prop|token/.test(lower);
    const broadReplacementCue = /full|giant|huge|massive|large|slab|plate|chestplate|body|torso|robe|cloak|cape|wing|helmet|hood|hat|sword|staff|shield|weapon|armor|shell|panel/.test(lower);
    if (usesNpcAccentLayerVisuals && broadReplacementCue && !smallDetailCue && !mediumIdentityCue) return null;
    if (usesNpcAccentLayerVisuals && /mask|visor/.test(lower) && !promptAllowsFaceCover) return null;

    const clamp = (value: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, value));
    const safe = sanitizeNpcAccessoryPlacement(name, parent, shape, size, offset);
    const maxSize: [number, number, number] = (() => {
      if (/cape|capelet/.test(lower) && parent === 'UpperTorso') return [1.96, 1.45, 0.18];
      if (/backpack|pack|satchel|quiver/.test(lower)) return [0.92, 0.92, 0.38];
      if (/smallshield|buckler|shield/.test(lower) && /hand|arm/i.test(parent)) return [0.24, 1.02, 0.78];
      if (/shortstaff|wand|staff/.test(lower) && /hand/i.test(parent)) return [0.22, 1.42, 0.22];
      if (/hat|cap|crown|cowl|helmet/.test(lower) && parent === 'Head') return [1.62, 0.58, 1.08];
      if (/collar|scarf/.test(lower)) return [2.08, 0.34, 1.18];
      if (/belt|waist/.test(lower) || parent === 'LowerTorso') return [2.18, 0.26, 1.12];
      if (/boot|knee|cuff/.test(lower) || parent.includes('Leg') || parent.includes('Foot')) return [0.92, 0.38, 0.92];
      if (/brace|ring|glow|orb/.test(lower) || parent.includes('Hand') || parent.includes('Arm')) return [0.64, 0.64, 0.64];
      if (parent === 'Head') return /hair|tuft|feather|plume/.test(lower) ? [0.90, 0.72, 0.22] : [0.86, 0.32, 0.12];
      return [1.12, 0.48, 0.16];
    })();
    const accentSize: [number, number, number] = [
      clamp(safe.size[0], 0.05, maxSize[0]),
      clamp(safe.size[1], 0.05, maxSize[1]),
      clamp(safe.size[2], 0.05, maxSize[2]),
    ];
    const accentOffset: [number, number, number] = [
      clamp(safe.offset[0], -1.35, 1.35),
      clamp(safe.offset[1], -1.15, 1.55),
      clamp(safe.offset[2], -0.84, 0.84),
    ];
    if (parent === 'Head' && !/hair|tuft|feather|plume|horn|ear/.test(lower)) {
      accentOffset[2] = clamp(accentOffset[2], -0.78, -0.58);
    }
    if ((parent === 'UpperTorso' || parent === 'LowerTorso') && !/back|pack|quiver/.test(lower)) {
      accentOffset[2] = clamp(accentOffset[2], -0.78, -0.38);
    }
    if ((parent === 'UpperTorso' || parent === 'LowerTorso') && /back|pack|quiver|cape|capelet/.test(lower)) {
      accentOffset[2] = clamp(accentOffset[2], 0.44, 0.92);
      accentOffset[1] = clamp(accentOffset[1], -0.70, 0.58);
    }
    if (/shortstaff|wand|staff/.test(lower) && /hand/i.test(parent)) {
      accentOffset[1] = clamp(accentOffset[1], 0.00, 0.92);
      accentOffset[2] = clamp(accentOffset[2], -0.28, 0.18);
    }
    const safeName = `Accent${name}`.slice(0, 54).replace(/[^A-Za-z0-9_]/g, '');
    return {
      name: safeName.length > 'Accent'.length ? safeName : `AccentNpcDetail${npcLlmAccentDetailCount + 1}`,
      shape: safe.shape,
      size: accentSize,
      offset: accentOffset,
    };
  }

  const npcVisualCfg = (!usesTemplateFirstVisuals || usesNpcAccentLayerVisuals)
    ? metadata.npcVisualConfig as { accessories?: unknown; floats?: unknown } | undefined
    : undefined;
  let npcFloatFlagAdded = false;
  function addNpcFloatFlagIfNeeded(): void {
    if (npcFloatFlagAdded || npcVisualCfg?.floats !== true) return;
    npcFloatFlagAdded = true;
    scene.push({
      id: uuidv4(),
      className: 'BoolValue',
      name: 'Floats',
      parentId: rootModelId,
      properties: { Value: true },
    });
  }

  function applyLlmAccessoriesIfPresent(): boolean {
    const cfg = npcVisualCfg;
    if (!cfg || !Array.isArray(cfg.accessories) || cfg.accessories.length === 0) return false;
    addNpcFloatFlagIfNeeded();
    let placed = 0;
    const maxAccessories = usesNpcAccentLayerVisuals ? 12 : 20;
    for (const item of cfg.accessories.slice(0, maxAccessories)) {
      if (!item || typeof item !== 'object') continue;
      const a = item as Record<string, unknown>;
      const name = typeof a.name === 'string' ? a.name : '';
      const parent = typeof a.parent === 'string' ? a.parent : '';
      const size = a.size as [number, number, number] | undefined;
      const offset = a.offset as [number, number, number] | undefined;
      const colorArr = a.color as [number, number, number] | undefined;
      const materialName = typeof a.material === 'string' ? a.material : 'Plastic';
      const rawShape = typeof a.shape === 'string' ? a.shape : 'Block';
      const shape = (rawShape === 'Cylinder' || rawShape === 'Sphere' || rawShape === 'Wedge' ? rawShape : 'Block') as 'Block' | 'Cylinder' | 'Sphere' | 'Wedge';
      if (!name || !parent || !Array.isArray(size) || !Array.isArray(offset) || !Array.isArray(colorArr)) continue;
      const material = NPC_MATERIAL_TABLE[materialName] ?? NPC_MATERIAL_TABLE.Plastic;
      const color = color3(colorArr[0] / 255, colorArr[1] / 255, colorArr[2] / 255);
      const placement = usesNpcAccentLayerVisuals
        ? sanitizeNpcAccentAccessoryPlacement(name, parent, shape, size, offset)
        : { name, ...sanitizeNpcAccessoryPlacement(name, parent, shape, size, offset) };
      if (!placement) continue;
      const partId = addAttachedBox(
        placement.name,
        parent,
        placement.size,
        placement.offset,
        color,
        material,
        placement.shape === 'Wedge' ? 'Block' : placement.shape,
      );
      // Locate the Part node we just pushed to apply transparency, shape, and mesh.
      const lastPart = partId ? scene.find((n) => n.id === partId) : undefined;
      if (lastPart) {
        const transparencyMax = usesNpcAccentLayerVisuals ? 0.6 : 0.9;
        const transparency = typeof a.transparency === 'number' ? Math.min(transparencyMax, Math.max(0, a.transparency)) : 0;
        if (transparency > 0 && lastPart.properties) {
          lastPart.properties.Transparency = transparency;
        }
        if (placement.shape === 'Wedge' && lastPart.properties) {
          // WedgePart: we can't change a Part to WedgePart in-place, but Roblox's
          // Part has a `Shape` property limited to Block/Cylinder/Ball. For Wedge
          // we'd need a separate WedgePart class. As a pragmatic approximation,
          // use Cylinder for Wedge (still better than plain Block for spikes/horns).
          scene.push({
            id: uuidv4(),
            className: 'SpecialMesh',
            name: 'AccessoryMesh',
            parentId: lastPart.id,
            properties: {
              MeshType: { __type: 'Enum', enumType: 'MeshType', enumName: 'Wedge', value: 6 },
              Scale: vector3(1, 1, 1),
            },
          });
        }
      }
      if (usesNpcAccentLayerVisuals) npcLlmAccentDetailCount += 1;
      placed += 1;
    }
    return placed > 0;
  }

  function addNpcFallbackDetails(): void {
    const metadataNpcBriefText = [
      metadata.npcRole,
      metadata.visualSpecies,
      metadata.behaviorMode,
      metadata.npcTheme,
      metadata.npcVisualHooks,
      metadata.visualDescription,
      metadata.appearance,
      metadata.npcMechanics,
      metadata.npcSystems,
      npcResolvedVisualPlan.bodyFamily,
      npcResolvedVisualPlan.visualSpecies,
      npcResolvedVisualPlan.role,
      ...npcResolvedVisualPlan.styleArchetypes,
      ...npcResolvedVisualPlan.accessorySlots,
      ...npcResolvedVisualPlan.props,
      ...npcResolvedVisualPlan.vfx,
    ]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .join(' ');
    const text = `${args.title} ${args.prompt} ${metadataNpcBriefText}`.toLowerCase();
    const promptText = `${args.title} ${args.prompt} ${metadataNpcBriefText}`.toLowerCase();
    const wantsCapAccessory = /baseball\s*cap|snapback|backwards\s*cap|\bcap\b|кепк|бейсболк/.test(text);
    const wantsHatAccessory = !wantsCapAccessory && /\bhat\b|шляп|колпак/.test(text);
    const wantsBeardAccessory = /beard|goatee|бород|борода|бородат/.test(text);
    const wantsMustacheAccessory = /mustache|moustache|усы|усат|усик/.test(text);
    const wantsGlassesAccessory = /glasses|sunglasses|shades|goggles|очки|очках|очк[аи]|солнцезащитн/.test(text);
    const wantsHairAccessory = /hair|hairstyle|mohawk|ponytail|bun|волос|причес|прич[её]ск|ирокез|хвостик|пучок/.test(text) && !/bald|лыс/.test(text);
    const wantsBackpackAccessory = /backpack|back\s*pack|рюкзак|ранец/.test(text);
    const wantsSatchelAccessory = /satchel|side\s*bag|shoulder\s*bag|сумк|сумочка|мешоч|торб/.test(text);
    const wantsCapeAccessory = /cape|cloak|плащ|мантия/.test(text);
    const roleCueText = [
      args.title,
      args.prompt,
      metadata.npcRole,
      metadata.visualSpecies,
      metadata.behaviorMode,
      metadata.npcTheme,
      metadata.npcVisualHooks,
      metadata.visualDescription,
      metadata.appearance,
      metadata.npcMechanics,
    ]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .join(' ')
      .toLowerCase();
    const npcRole = typeof metadata.npcRole === 'string' ? metadata.npcRole.toLowerCase() : '';
    const visualStyleSet = new Set(npcResolvedVisualPlan.styleArchetypes);
    const isRoastNpcMode = String(metadata.npcMode || '').toLowerCase() === 'roast'
      || String(metadata.contentSubcategory || '').toLowerCase() === 'roast_npc';
    const metal = { enumName: 'Metal', value: 1088 };
    const fabric = { enumName: 'Fabric', value: 1056 };
    const leatherMat = { enumName: 'Leather', value: 848 };
    const wood = { enumName: 'Wood', value: 512 };
    const plastic = { enumName: 'Plastic', value: 256 };
    const neon = { enumName: 'Neon', value: 288 };
    const slate = { enumName: 'Slate', value: 800 };
    const grass = { enumName: 'Grass', value: 1280 };
    const darkMetal = color3(0.11, 0.13, 0.16);
    const steel = color3(0.55, 0.58, 0.62);
    const leather = color3(0.28, 0.16, 0.08);
    const accent = color3(0.70, 0.56, 0.22);
    const gold = color3(0.92, 0.78, 0.32);
    const purple = color3(0.40, 0.16, 0.55);
    const crimson = color3(0.55, 0.10, 0.14);
    const forest = color3(0.20, 0.36, 0.20);
    const arcaneGlow = color3(0.46, 0.84, 1.0);
    const flameOrange = color3(1.0, 0.32, 0.04);
    const flameYellow = color3(1.0, 0.82, 0.16);
    const magmaDark = color3(0.18, 0.035, 0.02);
    const charred = color3(0.06, 0.035, 0.025);

    const isRanger = npcTemplateKind === 'ranger' || /ranger|forest\s*guard|woodland\s*guard|archer|bowman|рейнджер|егерь|леснич|лесн[а-яё]*\s+страж|лучник/.test(text);
    const isPolice = /police|cop|officer|sheriff|security|law\s*enforcement|полици|полицей|офицер|шериф|правоохран|\bкоп\b/.test(text);
    const isKnightOrGuard = npcTemplateKind === 'guard'
      || visualStyleSet.has('guard')
      || (npcRole === 'guard' && !isRanger)
      || isPolice
      || /knight|guard|paladin|soldier|sentinel|warrior|рыцар|страж|охран|солдат|воин/.test(text);
    const isMerchant = npcTemplateKind === 'merchant' || npcRole === 'merchant' || visualStyleSet.has('merchant') || /merchant|trader|shop|vendor|торгов|купец|лавочник/.test(text);
    const isBoss = npcTemplateKind === 'boss' || npcRole === 'boss' || visualStyleSet.has('boss') || NPC_BOSS_STYLE_CUE.test(text);
    const isVillain = npcTemplateKind === 'villain' || npcRole === 'villain' || /villain|bandit|thief|assassin|rogue|злодей|разбойник|вор|убийца/.test(text);
    const isCompanion = npcTemplateKind === 'companion' || npcRole === 'companion' || /companion|ally|sidekick|\bfriend\b|спутник|союзник|друг/.test(text);
    const isMage = npcTemplateKind === 'mage' || visualStyleSet.has('mage') || NPC_MAGE_STYLE_CUE.test(text);
    const isQuestGiver = npcTemplateKind === 'quest_giver' || npcRole === 'quest_giver' || visualStyleSet.has('quest') || NPC_QUEST_STYLE_CUE.test(roleCueText);
    const isEnemy = npcTemplateKind === 'enemy' || npcRole === 'enemy' || /enemy|monster|beast|orc|goblin|враг|монстр|чудовище|орк|гоблин/.test(text);
    const isGhost = npcTemplateKind === 'ghost' || /ghost|spirit|specter|spectre|phantom|wraith|призрак|дух|фантом|привид/.test(text);
    const isGnome = npcTemplateKind === 'gnome' || /gnome|dwarf|гном|дварф/.test(text);
    const isMiner = /\bminer\b|\bmining\b|\bmine\b|шахт|рудник|рудокоп|горняк/.test(text);
    const isPatrol = /patrol|patrolling|route|watch\s*route|дозор|патрул|маршрут|обход/.test(roleCueText);
    const hasExplicitGuardText = isPolice || /guard|security|watch|охран|страж|полици|полицей|офицер|шериф/.test(promptText);
    const isGnomePatrol = isPatrol;
    const isFireElemental = npcTemplateKind === 'fire_elemental' || hasStrongFireElementalCue(text);
    const isPointedHatRequest = npcTemplateKind === 'pointed_hat' || /point(?:ed|y)\s+hat|tall\s+hat|wizard\s+hat|witch\s+hat|cone\s+hat|остроконечн|высок[а-яё\s-]*шляп|шляп[а-яё\s-]*конус|колпак/.test(text);
    // Modern roast personality archetypes (session 126).
    const isGymBro = npcTemplateKind === 'gym_bro';
    const isGenAlpha = npcTemplateKind === 'gen_alpha';
    const isSigmaChad = npcTemplateKind === 'sigma_chad';
    const isMomFriend = npcTemplateKind === 'mom_friend';
    const isSkibidi = npcTemplateKind === 'skibidi';
    const isSuperhero = npcTemplateKind === 'superhero'
      || visualStyleSet.has('superhero')
      || /super\s*hero|superhero|superman|heroic|cape|laser\s*eyes?|eye\s*laser|flying\s*hero|супергер|супермен|герой|плащ|лазер[а-яё\s-]*из\s+глаз|парящ[а-яё\s-]*супергер/.test(text);
    const isClassicCapedHero = isSuperhero
      && /superman|classic|classic\s+hero|caped\s+hero|супермен|классическ|плащ/.test(text);
    const wantsHeroHeadCover = isSuperhero
      && !isClassicCapedHero
      && /cowl|mask|masked|helmet|hood|visor|шлем|маск|визор|капюш|закрыт[а-яё\s-]*лиц/.test(text);
    const blockRobotForGenAlphaRepair = isGenAlpha
      && npcVisualFamily === 'humanoid'
      && (
        npcResolvedVisualPlan.repairNotes.some((note) => /robot[_-]?to[_-]?humanoid|robot_descriptor/i.test(note))
        || /pastel|trendy|streetwear|smug|meme|goofy\s+big\s+head|oversized\s+head/i.test(promptText)
      );
    const isRobot = !blockRobotForGenAlphaRepair
      && (npcTemplateKind === 'robot' || visualStyleSet.has('robot') || NPC_ROBOT_STYLE_CUE.test(text));
    const isPirate = npcTemplateKind === 'pirate' || visualStyleSet.has('pirate') || /pirate|corsair|buccaneer|pirate\s+captain|captain\s+pirate|пират|корсар|пиратск[а-яё\s-]*капитан/.test(text);
    const isNinja = npcTemplateKind === 'ninja' || visualStyleSet.has('ninja') || /ninja|shinobi|assassin\s*ninja|ниндз|синоби/.test(text);
    const isUndead = npcTemplateKind === 'undead' || visualStyleSet.has('undead') || /zombie|skeleton|undead|skull|bones|зомби|скелет|нежить|череп|кости/.test(text);
    const hasCelestialText = NPC_CELESTIAL_STYLE_CUE.test(text);
    const hasAuraOnlyText = /aura|aurora|аур/.test(text);
    const isCelestial = visualStyleSet.has('celestial') || hasCelestialText || (!isSkibidi && hasAuraOnlyText);
    const isArachnidFamily = npcVisualFamily === 'arachnid';
    const isBruteFamily = npcVisualFamily === 'brute';
    const isBeastFamily = npcVisualFamily === 'beast';
    const isWingedFamily = npcVisualFamily === 'winged';
    const isGolemFamily = npcVisualFamily === 'golem';
    const isPlantFungalFamily = npcVisualFamily === 'plant_fungal';
    const isElementalFamily = npcVisualFamily === 'elemental';
    const useDeterministicHeroKit = isRanger || isKnightOrGuard || isMage || isQuestGiver || isGhost || isEnemy || isGnome || isFireElemental || isPointedHatRequest
      || isGymBro || isGenAlpha || isSigmaChad || isMomFriend || isSkibidi || isSuperhero || isRobot || isPirate || isNinja || isUndead || isCelestial
      || isArachnidFamily || isBruteFamily || isBeastFamily || isWingedFamily || isGolemFamily || isPlantFungalFamily || isElementalFamily;
    addNpcFloatFlagIfNeeded();
    const llmAccessoriesApplied = applyLlmAccessoriesIfPresent();

    let questDetailsAdded = false;
    const addQuestGiverDetails = (): void => {
      if (questDetailsAdded) return;
      questDetailsAdded = true;
      const questGlow = color3(1.0, 0.86, 0.20);
      const scrollPaper = color3(0.94, 0.84, 0.56);
      addAttachedBox('QuestMarkerStem', 'Head', [0.18, 0.62, 0.14], [0, 1.48, -0.12], questGlow, neon);
      const questDot = addAttachedBox('QuestMarkerDot', 'Head', [0.26, 0.26, 0.26], [0, 1.04, -0.12], questGlow, neon, 'Sphere');
      addPointLight(questDot, 'QuestMarkerLight', questGlow, 10, 2.0);
      addAttachedBox('QuestScrollRoll', 'LeftHand', [0.36, 0.72, 0.36], [-0.22, -0.06, -0.08], scrollPaper, fabric, 'Cylinder');
      addAttachedBox('QuestScrollRibbon', 'LeftHand', [0.42, 0.10, 0.42], [-0.22, -0.06, -0.08], crimson, fabric, 'Cylinder');
      addAttachedBox('QuestBookCover', 'LeftLowerArm', [0.56, 0.72, 0.16], [-0.36, -0.08, -0.34], color3(0.25, 0.10, 0.42), leatherMat);
      addAttachedBox('QuestBookPage', 'LeftLowerArm', [0.48, 0.62, 0.05], [-0.36, -0.08, -0.44], scrollPaper, fabric);
      addAttachedBox('QuestChestBadge', 'UpperTorso', [0.48, 0.48, 0.12], [0.58, 0.36, -0.60], questGlow, neon, 'Sphere');
      addAttachedBox('QuestRuneLeft', 'UpperTorso', [0.30, 0.14, 0.10], [-0.34, 0.18, -0.62], arcaneGlow, neon);
      addAttachedBox('QuestRuneRight', 'UpperTorso', [0.30, 0.14, 0.10], [0.34, 0.18, -0.62], arcaneGlow, neon);
    };

    type NpcVisualMode = 'ai_npc' | 'roast_npc';
    type GeneralNpcArchetype =
      | 'ranger'
      | 'guard'
      | 'merchant'
      | 'boss'
      | 'villain'
      | 'companion'
      | 'quest_giver'
      | 'ghost'
      | 'enemy'
      | 'mage'
      | 'fire_elemental'
      | 'arachnid'
      | 'brute'
      | 'beast'
      | 'winged'
      | 'golem'
      | 'plant_fungal'
      | 'elemental'
      | 'robot'
      | 'pirate'
      | 'ninja'
      | 'undead'
      | 'superhero'
      | 'pointed_hat'
      | 'gym_bro'
      | 'gen_alpha'
      | 'sigma_chad'
      | 'mom_friend'
      | 'skibidi'
      | 'default';
    type GeneralNpcTraitKit =
      | 'roast'
      | 'patrol'
      | 'guard'
      | 'merchant'
      | 'boss'
      | 'villain'
      | 'companion'
      | 'quest'
      | 'spectral'
      | 'enemy'
      | 'mage'
      | 'fire'
      | 'police'
      | 'robot'
      | 'pirate'
      | 'ninja'
      | 'undead'
      | 'superhero'
      | 'celestial'
      | 'modern_roast';
    type NpcExpression =
      | 'friendly'
      | 'stern'
      | 'evil'
      | 'sleepy'
      | 'wise'
      | 'magical'
      | 'smirk'
      | 'neutral';

    const npcVisualMode: NpcVisualMode = isRoastNpcMode ? 'roast_npc' : 'ai_npc';
    let npcVisualConfigMarkerAdded = false;
    let npcAssetTemplateLayerAdded = false;

    const writeNpcVisualConfigMarker = (value: Record<string, unknown>): void => {
      if (npcVisualConfigMarkerAdded) return;
      npcVisualConfigMarkerAdded = true;
      scene.push({
        id: uuidv4(),
        className: 'StringValue',
        name: 'NPCVisualConfig',
        parentId: rootModelId,
        properties: {
          Value: JSON.stringify({
            visualDNA: npcResolvedVisualPlan,
            ...value,
            visualVariantSeed,
            visualPipeline: npcVisualPipeline,
            meshMotionMode: npcMeshMotionMode,
            rollbackPipeline: 'procedural_legacy',
          }),
        },
      });
    };

    const prefixForGeneralNpc = (archetype: GeneralNpcArchetype, roleKit: string): string => {
      if (roleKit === 'llm_accessory') return 'LlmNpc';
      const map: Record<GeneralNpcArchetype, string> = {
        ranger: 'Ranger',
        guard: 'Guard',
        merchant: 'Merchant',
        boss: 'Boss',
        villain: 'Villain',
        companion: 'Companion',
        quest_giver: 'QuestGiver',
        ghost: 'Ghost',
        enemy: 'Enemy',
        mage: 'Mage',
        fire_elemental: 'FireElemental',
        arachnid: 'Arachnid',
        brute: 'Brute',
        beast: 'Beast',
        winged: 'Winged',
        golem: 'Golem',
        plant_fungal: 'PlantFungal',
        elemental: 'Elemental',
        robot: 'Robot',
        pirate: 'Pirate',
        ninja: 'Ninja',
        undead: 'Undead',
        superhero: 'Superhero',
        pointed_hat: 'PointedHat',
        gym_bro: 'GymBro',
        gen_alpha: 'GenAlpha',
        sigma_chad: 'Sigma',
        mom_friend: 'MomFriend',
        skibidi: 'Skibidi',
        default: 'DefaultNpc',
      };
      return map[archetype] ?? 'DefaultNpc';
    };

    const NPC_FILE_MESH_TORSO = 'rbxasset://fonts/torso.mesh';
    const NPC_FILE_MESH_SWORD = 'rbxasset://fonts/sword.mesh';

    const pushFileMeshAccessoryMesh = (
      parentPartId: string,
      meshId: string,
      textureId = '',
      scale: [number, number, number] = [1, 1, 1],
      offset: [number, number, number] = [0, 0, 0],
    ): void => {
      scene.push({
        id: uuidv4(),
        className: 'SpecialMesh',
        name: 'MeshAccessory',
        parentId: parentPartId,
        properties: {
          MeshType: { __type: 'Enum', enumType: 'MeshType', enumName: 'FileMesh', value: 5 },
          MeshId: meshId,
          TextureId: textureId,
          Scale: vector3(scale[0], scale[1], scale[2]),
          Offset: vector3(offset[0], offset[1], offset[2]),
        },
      });
    };

    const addWearableNpcAccessory = (opts: {
      name: string;
      bodyPartName: string;
      attachmentName: string;
      accessoryType: string;
      size: [number, number, number];
      offset: [number, number, number];
      color: Record<string, unknown>;
      material: { enumName: string; value: number };
      shape?: 'Block' | 'Cylinder' | 'Sphere';
      meshId?: string;
      specialMeshId?: string;
      specialMeshTextureId?: string;
      specialMeshScale?: [number, number, number];
      specialMeshOffset?: [number, number, number];
      forceMeshAccessory?: boolean;
    }): string | undefined => {
      const bodyPartId = partIds[opts.bodyPartName];
      const bodyPart = r15Parts.find((part) => part.name === opts.bodyPartName);
      if (!bodyPartId || !bodyPart) return undefined;
      const bodyAttachmentLocal = (() : [number, number, number] => {
        const table: Record<string, [number, number, number]> = {
          HatAttachment: [0, 0.5, 0],
          HairAttachment: [0, 0.5, 0],
          FaceFrontAttachment: [0, 0, -0.5],
          FaceCenterAttachment: [0, 0, 0],
          BodyFrontAttachment: [0, 0, -0.5],
          BodyBackAttachment: [0, 0, 0.5],
          WaistFrontAttachment: [0, 0, -0.5],
          WaistBackAttachment: [0, 0, 0.5],
          WaistCenterAttachment: [0, 0, 0],
          RightGripAttachment: [0, -0.2, 0],
          LeftGripAttachment: [0, -0.2, 0],
          RightShoulderAttachment: [0, 0.5, 0],
          LeftShoulderAttachment: [0, 0.5, 0],
        };
        return table[opts.attachmentName] ?? [0, 0, 0];
      })();
      const handleAttachmentOffset: [number, number, number] = [
        bodyAttachmentLocal[0] - opts.offset[0],
        bodyAttachmentLocal[1] - opts.offset[1],
        bodyAttachmentLocal[2] - opts.offset[2],
      ];
      const accessoryId = uuidv4();
      const handleId = uuidv4();
      const position: [number, number, number] = [
        bodyPart.position[0] * s.w + opts.offset[0],
        bodyPart.position[1] * s.h + opts.offset[1],
        bodyPart.position[2] * s.d + opts.offset[2],
      ];
      scene.push({
        id: accessoryId,
        className: 'Accessory',
        name: opts.name,
        parentId: rootModelId,
        properties: {
          AccessoryType: enumValue('AccessoryType', opts.accessoryType),
        },
      });
      scene.push({
        id: handleId,
        className: opts.meshId ? 'MeshPart' : 'Part',
        name: 'Handle',
        parentId: accessoryId,
        properties: {
          Anchored: false,
          CanCollide: false,
          Massless: true,
          Size: vector3(opts.size[0] * s.w, opts.size[1] * s.h, opts.size[2] * s.d),
          CFrame: cframe(position[0], position[1], position[2]),
          Color: opts.color,
          Material: { __type: 'Enum', enumType: 'Material', enumName: opts.material.enumName, value: opts.material.value },
          ...(opts.meshId ? { MeshId: opts.meshId } : {}),
        },
      });
      scene.push({
        id: uuidv4(),
        className: 'Attachment',
        name: opts.attachmentName,
        parentId: handleId,
        properties: { CFrame: cframe(handleAttachmentOffset[0], handleAttachmentOffset[1], handleAttachmentOffset[2]) },
      });
      scene.push({
        id: uuidv4(),
        className: 'WeldConstraint',
        name: `${opts.name}Weld`,
        parentId: handleId,
        properties: {
          Part0: { __type: 'Ref', id: handleId },
          Part1: { __type: 'Ref', id: bodyPartId },
        },
      });
      let meshBacked = !!opts.meshId;
      if (!opts.meshId && opts.specialMeshId) {
        pushFileMeshAccessoryMesh(
          handleId,
          opts.specialMeshId,
          opts.specialMeshTextureId ?? '',
          opts.specialMeshScale ?? [1, 1, 1],
          opts.specialMeshOffset ?? [0, 0, 0],
        );
        meshBacked = true;
      } else if (!opts.meshId && opts.shape && opts.shape !== 'Block') {
        pushShapeMesh(handleId, opts.shape);
        meshBacked = true;
      } else if (!opts.meshId && opts.forceMeshAccessory) {
        pushFileMeshAccessoryMesh(handleId, NPC_FILE_MESH_TORSO, '', opts.specialMeshScale ?? [1, 1, 1], opts.specialMeshOffset ?? [0, 0, 0]);
        meshBacked = true;
      }
      if (isNpcFallbackModel) npcRigidAccessoryNames.add(opts.name);
      if (isNpcFallbackModel && meshBacked) npcMeshAccessoryNames.add(opts.name);
      recordNpcVisualDetail(opts.name, opts.bodyPartName, opts.size);
      return handleId;
    };

    const createRigidAccessory = addWearableNpcAccessory;

    const addAssetParticleEmitter = (
      parentId: string | undefined,
      name: string,
      color: { r: number; g: number; b: number },
      rate = 9,
    ): void => {
      if (!parentId) return;
      scene.push({
        id: uuidv4(),
        className: 'ParticleEmitter',
        name,
        parentId,
        properties: {
          Texture: 'rbxasset://textures/particles/sparkles_main.dds',
          Rate: rate,
          Lifetime: { __type: 'NumberRange', min: 0.45, max: 1.15 },
          Speed: { __type: 'NumberRange', min: 0.25, max: 1.4 },
          SpreadAngle: { __type: 'Vector2', x: 35, y: 35 },
          LightEmission: 0.75,
          Color: {
            __type: 'ColorSequence',
            keypoints: [
              { time: 0, r: color.r, g: color.g, b: color.b },
              { time: 1, r: color.r * 0.35, g: color.g * 0.35, b: color.b * 0.35 },
            ],
          },
        },
      });
    };

    const addNpcAssetAnimationAndAudioPack = (prefix: string): string[] => {
      const animationFolderId = uuidv4();
      scene.push({
        id: animationFolderId,
        className: 'Folder',
        name: `${prefix}AssetAnimations`,
        parentId: rootModelId,
      });
      const clips = [
        ['Idle', 'rbxassetid://507766666'],
        ['Walk', 'rbxassetid://507777826'],
        ['AttackPose', 'rbxassetid://507765000'],
      ] as const;
      for (const [name, animationId] of clips) {
        scene.push({
          id: uuidv4(),
          className: 'Animation',
          name: `${prefix}${name}Animation`,
          parentId: animationFolderId,
          properties: { AnimationId: animationId },
        });
      }
      scene.push(makeSoundNode({
        name: `${prefix}AssetCue`,
        parentId: rootModelId,
        soundId: isRobot || isPolice ? 'rbxassetid://12222225' : isMage ? 'rbxassetid://12222216' : 'rbxassetid://12222200',
        volume: 0.22,
      }));
      return [`${prefix}AssetAnimations`, `${prefix}AssetCue`];
    };

    const addNpcAssetTemplateLayer = (
      archetype: GeneralNpcArchetype,
      prefix: string,
      expression: NpcExpression,
    ): string[] => {
      if (!useAssetTemplateNpcVisuals || npcAssetTemplateLayerAdded) return [];
      npcAssetTemplateLayerAdded = true;
      const markers: string[] = [];
      const torsoMesh = 'rbxasset://fonts/torso.mesh';
      const swordMesh = 'rbxasset://fonts/sword.mesh';
      const policeBlue = color3(0.025, 0.07, 0.26);
      const hazard = color3(0.95, 0.68, 0.08);
      const toxic = color3(0.35, 1.0, 0.28);
      const glow = isFireElemental
        ? { r: 1.0, g: 0.35, b: 0.05 }
        : isMage || expression === 'magical'
          ? { r: 0.38, g: 0.82, b: 1.0 }
          : isEnemy || expression === 'evil'
            ? { r: 0.35, g: 1.0, b: 0.28 }
            : isPolice || isRobot
              ? { r: 0.12, g: 0.56, b: 1.0 }
              : { r: 0.95, g: 0.72, b: 0.22 };
      const shellColor = isPolice ? policeBlue
        : isRobot ? color3(0.38, 0.45, 0.50)
          : isMage ? color3(0.24, 0.12, 0.42)
            : isEnemy ? color3(0.10, 0.12, 0.12)
              : isGnome ? color3(0.18, 0.36, 0.16)
                : color3(0.18, 0.20, 0.26);
      const hasDedicatedHeadKit = archetype === 'robot'
        || archetype === 'guard'
        || archetype === 'pirate'
        || archetype === 'ninja'
        || archetype === 'undead'
        || archetype === 'ghost'
        || archetype === 'superhero'
        || archetype === 'pointed_hat'
        || archetype === 'gym_bro'
        || archetype === 'gen_alpha'
        || archetype === 'sigma_chad'
        || archetype === 'mom_friend'
        || archetype === 'skibidi';
      // Disabled for production R15: this generic mesh-backed overlay created
      // billboard-like slabs (`*AssetChestRig`) over finished role kits.
      const shouldAddGenericAssetGeometry = false;
      if (shouldAddGenericAssetGeometry) {
        const chest = addWearableNpcAccessory({
          name: `${prefix}AssetChestRig`,
          bodyPartName: 'UpperTorso',
          attachmentName: 'BodyFrontAttachment',
          accessoryType: 'Front',
          size: [2.72, 1.82, 0.42],
          offset: [0, -0.02, -0.78],
          color: shellColor,
          material: isMage ? fabric : metal,
          meshId: torsoMesh,
        });
        if (chest) {
          markers.push(`${prefix}AssetChestRig`);
          addPointLight(chest, `${prefix}AssetCoreLight`, color3(glow.r, glow.g, glow.b), 10, 1.35);
          addAssetParticleEmitter(chest, `${prefix}AssetCoreEmitter`, glow, isEnemy || isMage ? 14 : 8);
        }

        const back = addWearableNpcAccessory({
          name: `${prefix}AssetBackSilhouette`,
          bodyPartName: 'UpperTorso',
          attachmentName: 'BodyBackAttachment',
          accessoryType: 'Back',
          size: [1.62, 1.18, 0.34],
          offset: [0, -0.02, 0.84],
          color: isMage ? purple : isPolice ? darkMetal : leather,
          material: isMage ? fabric : leatherMat,
          shape: 'Block',
        });
        if (back) markers.push(`${prefix}AssetBackSilhouette`);

        if (!hasDedicatedHeadKit) {
          const headShell = addWearableNpcAccessory({
            name: `${prefix}AssetHeadGear`,
            bodyPartName: 'Head',
            attachmentName: 'HatAttachment',
            accessoryType: 'Hat',
            size: isMage || isGnome ? [1.55, 1.05, 1.20] : [1.58, 0.34, 1.02],
            offset: [0, isMage || isGnome ? 0.82 : 0.62, 0],
            color: isMage ? purple : isPolice ? policeBlue : isRobot ? steel : darkMetal,
            material: isMage || isGnome ? fabric : metal,
            shape: isMage || isGnome ? 'Cylinder' : 'Block',
          });
          if (headShell) markers.push(`${prefix}AssetHeadGear`);
        }

        const shouldAddTemplateVisor = (isPolice || isRobot || isKnightOrGuard)
          && !hasDedicatedHeadKit;
        if (shouldAddTemplateVisor) {
          const visor = addWearableNpcAccessory({
            name: `${prefix}AssetVisor`,
            bodyPartName: 'Head',
            attachmentName: 'FaceFrontAttachment',
            accessoryType: 'Face',
            size: [0.96, 0.16, 0.06],
            offset: [0, 0.10, -0.64],
            color: color3(glow.r, glow.g, glow.b),
            material: neon,
            shape: 'Block',
          });
          if (visor) markers.push(`${prefix}AssetVisor`);
          const weapon = addWearableNpcAccessory({
            name: `${prefix}AssetBatonBlade`,
            bodyPartName: 'RightHand',
            attachmentName: 'RightGripAttachment',
            accessoryType: 'Unknown',
            size: [0.26, 1.62, 0.26],
            offset: [0.28, 0.26, -0.12],
            color: isPolice ? hazard : steel,
            material: metal,
            meshId: swordMesh,
          });
          if (weapon) {
            markers.push(`${prefix}AssetBatonBlade`);
            addAssetParticleEmitter(weapon, `${prefix}AssetWeaponEmitter`, glow, 6);
          }
        }

        if (isMage || isGnome || archetype === 'quest_giver') {
          const staff = addWearableNpcAccessory({
            name: `${prefix}AssetStaffMesh`,
            bodyPartName: 'RightHand',
            attachmentName: 'RightGripAttachment',
            accessoryType: 'Unknown',
            size: [0.26, 2.30, 0.26],
            offset: [0.36, 0.62, -0.06],
            color: leather,
            material: wood,
            meshId: swordMesh,
          });
          const orb = addWearableNpcAccessory({
            name: `${prefix}AssetSpellOrb`,
            bodyPartName: 'LeftHand',
            attachmentName: 'LeftGripAttachment',
            accessoryType: 'Unknown',
            size: [0.46, 0.46, 0.46],
            offset: [-0.18, 0.05, -0.16],
            color: color3(glow.r, glow.g, glow.b),
            material: neon,
            shape: 'Sphere',
          });
          if (staff) markers.push(`${prefix}AssetStaffMesh`);
          if (orb) {
            markers.push(`${prefix}AssetSpellOrb`);
            addPointLight(orb, `${prefix}AssetSpellOrbLight`, color3(glow.r, glow.g, glow.b), 9, 1.6);
            addAssetParticleEmitter(orb, `${prefix}AssetSpellOrbEmitter`, glow, 16);
          }
        }

        if (isEnemy || isVillain || isUndead) {
          for (const [side, hand, x] of [
            ['L', 'LeftHand', -0.18],
            ['R', 'RightHand', 0.18],
          ] as const) {
            const claw = addWearableNpcAccessory({
              name: `${prefix}AssetClaw${side}`,
              bodyPartName: hand,
              attachmentName: side === 'L' ? 'LeftGripAttachment' : 'RightGripAttachment',
              accessoryType: 'Unknown',
              size: [0.18, 0.78, 0.14],
              offset: [x, -0.22, -0.30],
              color: toxic,
              material: metal,
              meshId: swordMesh,
            });
            if (claw) markers.push(`${prefix}AssetClaw${side}`);
          }
        }
      }

      markers.push(...addNpcAssetAnimationAndAudioPack(prefix));
      scene.push({
        id: uuidv4(),
        className: 'StringValue',
        name: 'NPCVisualRollback',
        parentId: rootModelId,
        properties: { Value: 'Set NPC_VISUAL_PIPELINE=procedural_legacy to disable asset-backed NPC visuals.' },
      });
      return markers;
    };

    const resolveNpcExpression = (archetype: GeneralNpcArchetype): NpcExpression => {
      if (isRoastNpcMode) return 'smirk';
      if (/sleepy|tired|drowsy|сонн|устал|дрем/.test(text)) return 'sleepy';
      if (isEnemy || isVillain || /evil|angry|aggressive|hostile|sinister|wicked|злой|злобн|агрессив|враждеб|хитр|коварн/.test(text)) return 'evil';
      if (isMage || isQuestGiver || /magic|arcane|glowing\s+eyes|магическ|светящ[а-яё\s-]*глаз/.test(text)) return 'magical';
      if (/wise|elder|sage|mentor|мудрец|старейшина|наставник/.test(text)) return 'wise';
      if (isKnightOrGuard || isBoss || archetype === 'guard' || archetype === 'boss') return 'stern';
      if (isCompanion || /friendly|kind|добрый|дружелюб|милый/.test(text)) return 'friendly';
      return 'neutral';
    };

    const addGeneralFaceExpressionKit = (
      prefix: string,
      archetype: GeneralNpcArchetype,
      expression: NpcExpression,
    ): string[] => {
      const required: string[] = [];
      const masked = archetype === 'robot'
        || archetype === 'ninja'
        || archetype === 'undead'
        || archetype === 'ghost'
        || archetype === 'arachnid'
        || archetype === 'brute'
        || archetype === 'beast'
        || archetype === 'winged'
        || archetype === 'golem'
        || archetype === 'plant_fungal'
        || archetype === 'elemental';
      const eyeColor = expression === 'evil'
        ? color3(0.35, 1.0, 0.28)
        : expression === 'magical'
          ? arcaneGlow
          : expression === 'sleepy'
            ? color3(0.55, 0.62, 0.75)
            : color3(0.05, 0.05, 0.06);
      const browColor = expression === 'magical' ? purple : darkMetal;
      const mouthColor = expression === 'smirk'
        ? color3(1.0, 0.74, 0.18)
        : expression === 'evil'
          ? color3(0.35, 1.0, 0.28)
          : color3(0.08, 0.04, 0.03);
      const eyeShape: 'Block' | 'Cylinder' | 'Sphere' = expression === 'magical' || expression === 'evil' ? 'Sphere' : 'Block';
      const eyeMat = expression === 'magical' || expression === 'evil' ? neon : plastic;

      const eyeL = `${prefix}FaceEyeL`;
      const eyeR = `${prefix}FaceEyeR`;
      addAttachedBox(eyeL, 'Head', [0.24, expression === 'sleepy' ? 0.07 : 0.16, 0.07], [-0.26, 0.08, -0.72], eyeColor, eyeMat, eyeShape);
      addAttachedBox(eyeR, 'Head', [0.24, expression === 'sleepy' ? 0.07 : 0.16, 0.07], [0.26, 0.08, -0.72], eyeColor, eyeMat, eyeShape);
      required.push(eyeL, eyeR);
      if (expression === 'magical' || expression === 'evil') {
        addPointLight(partIds.Head, `${prefix}FaceEyeGlow`, eyeColor, 5, 1.0);
      }

      const browL = `${prefix}FaceBrowL`;
      const browR = `${prefix}FaceBrowR`;
      addAttachedBox(browL, 'Head', [0.46, 0.10, 0.06], [-0.28, 0.24, -0.70], browColor, metal);
      addAttachedBox(browR, 'Head', [0.46, 0.10, 0.06], [0.28, 0.24, -0.70], browColor, metal);
      required.push(browL, browR);

      if (!masked) {
        const nose = `${prefix}FaceNose`;
        addAttachedBox(nose, 'Head', [0.22, 0.22, 0.13], [0, -0.06, -0.73], color3(0.94, 0.66, 0.52), plastic, 'Sphere');
        required.push(nose);
      }

      const mouth = `${prefix}FaceMouth`;
      const mouthOffsetX = expression === 'smirk' || expression === 'evil' ? 0.12 : 0;
      const mouthWidth = expression === 'sleepy' ? 0.36 : 0.58;
      addAttachedBox(mouth, 'Head', [mouthWidth, 0.09, 0.06], [mouthOffsetX, -0.30, -0.72], mouthColor, expression === 'smirk' || expression === 'evil' ? neon : plastic);
      required.push(mouth);

      const needsBeard = archetype === 'quest_giver' || archetype === 'mage' || /beard|бород|старейшина|elder|sage/.test(text);
      const needsMustache = needsBeard || archetype === 'merchant' || archetype === 'pirate' || /mustache|усы|усат/.test(text);
      const hairColor = /ginger|red\s+beard|рыж|огненн[а-яё\s-]*бород/.test(text)
        ? color3(0.95, 0.43, 0.12)
        : needsBeard && (archetype === 'quest_giver' || /elder|sage|старейшина|мудрец/.test(text))
          ? color3(0.86, 0.86, 0.78)
          : color3(0.20, 0.12, 0.07);
      if (!masked && !/bald|лыс/.test(text)) {
        const hairTuft = `${prefix}FaceHairTuft`;
        addAttachedBox(hairTuft, 'Head', [0.82, 0.20, 0.18], [0, 0.42, -0.36], hairColor, fabric, 'Sphere');
        required.push(hairTuft);
      }
      if (needsMustache && !masked && !wantsMustacheAccessory) {
        const mustacheL = `${prefix}FaceMustacheL`;
        const mustacheR = `${prefix}FaceMustacheR`;
        addAttachedBox(mustacheL, 'Head', [0.34, 0.10, 0.08], [-0.18, -0.18, -0.70], hairColor, fabric, 'Sphere');
        addAttachedBox(mustacheR, 'Head', [0.34, 0.10, 0.08], [0.18, -0.18, -0.70], hairColor, fabric, 'Sphere');
        required.push(mustacheL, mustacheR);
      }
      if (needsBeard && !masked && !wantsBeardAccessory) {
        const beard = `${prefix}FaceBeard`;
        addAttachedBox(beard, 'Head', [0.78, 0.50, 0.12], [0, -0.48, -0.66], hairColor, fabric);
        required.push(beard);
      }
      return required;
    };

    const addModeSignatureKit = (prefix: string, archetype: GeneralNpcArchetype): string[] => {
      const required: string[] = [];
      if (isRoastNpcMode) {
        required.push(`${prefix}RoastMicHead`, `${prefix}RoastSpeechBoard`, `${prefix}RoastStageGlow`);
        return required;
      }
      if (isQuestGiver) {
        addQuestGiverDetails();
        const auraName = `${prefix}QuestAuraRing`;
        addAttachedBox(auraName, 'LowerTorso', [2.34, 0.10, 1.20], [0, -0.48, -0.02], color3(1.0, 0.86, 0.20), neon, 'Cylinder');
        addAttachedBox(`${prefix}QuestMapCase`, 'UpperTorso', [0.42, 0.92, 0.18], [-0.72, -0.10, 0.64], color3(0.42, 0.26, 0.12), leatherMat);
        required.push('QuestMarkerStem', 'QuestScrollRoll', auraName);
        return required;
      }
      if (isEnemy || archetype === 'enemy' || archetype === 'villain' || archetype === 'undead') {
        const auraName = `${prefix}ModeAura`;
        addAttachedBox(auraName, 'LowerTorso', [2.28, 0.08, 1.18], [0, -0.50, -0.02], color3(0.35, 1.0, 0.28), neon, 'Cylinder');
        required.push(auraName);
        return required;
      }
      const badge = `${prefix}AiChatBadge`;
      addAttachedBox(badge, 'UpperTorso', [0.42, 0.32, 0.10], [-0.58, 0.36, -0.66], arcaneGlow, neon);
      addAttachedBox(`${prefix}AiChatTail`, 'UpperTorso', [0.16, 0.18, 0.08], [-0.78, 0.20, -0.66], arcaneGlow, neon);
      required.push(badge);
      return required;
    };

    const addUniversalIdentityFloorKit = (
      prefix: string,
      archetype: GeneralNpcArchetype,
      expression: NpcExpression,
    ): string[] => {
      const markers: string[] = [];
      const maskedArchetype = archetype === 'robot'
        || archetype === 'ninja'
        || archetype === 'undead'
        || archetype === 'ghost'
        || archetype === 'superhero'
        || archetype === 'arachnid'
        || archetype === 'brute'
        || archetype === 'beast'
        || archetype === 'winged'
        || archetype === 'golem'
        || archetype === 'plant_fungal'
        || archetype === 'elemental';
      const floorAccent = expression === 'magical'
        ? arcaneGlow
        : expression === 'evil'
          ? color3(0.35, 1.0, 0.28)
          : isPolice
            ? color3(0.12, 0.56, 1.0)
            : gold;
      const fabricDark = expression === 'magical'
        ? purple
        : isPolice
          ? color3(0.03, 0.12, 0.42)
          : color3(0.16, 0.16, 0.20);

      if (!maskedArchetype && !/bald|лыс/.test(text)) {
        const hairName = `${prefix}IdentityHairCap`;
        const hair = addWearableNpcAccessory({
          name: hairName,
          bodyPartName: 'Head',
          attachmentName: 'HairAttachment',
          accessoryType: 'Hair',
          size: [1.34, 0.24, 0.86],
          offset: [0, 0.50, 0.08],
          color: /blond|блондин|светл/.test(text) ? color3(0.86, 0.68, 0.28) : color3(0.18, 0.10, 0.06),
          material: fabric,
          shape: 'Sphere',
        });
        if (hair) markers.push(hairName);
      }

      const collarName = `${prefix}IdentityCollar`;
      addAttachedBox(collarName, 'UpperTorso', [2.06, 0.22, 1.14], [0, 0.52, -0.02], fabricDark, fabric);
      markers.push(collarName);

      const roleBadgeName = `${prefix}IdentityRoleBadge`;
      addAttachedBox(roleBadgeName, 'UpperTorso', [0.34, 0.34, 0.12], [0.58, 0.28, -0.66], floorAccent, metal, 'Sphere');
      markers.push(roleBadgeName);

      if (!/cape|cloak|плащ|крыл/.test(text) && archetype !== 'boss' && archetype !== 'villain' && !isCelestial) {
        const packName = `${prefix}IdentityBackToken`;
        const pack = addWearableNpcAccessory({
          name: packName,
          bodyPartName: 'UpperTorso',
          attachmentName: 'BodyBackAttachment',
          accessoryType: 'Back',
          size: [0.78, 0.58, 0.30],
          offset: [0.62, -0.10, 0.72],
          color: leather,
          material: leatherMat,
          shape: 'Block',
        });
        if (pack) markers.push(packName);
      }

      const beltName = `${prefix}IdentityWaistBelt`;
      addAttachedBox(beltName, 'LowerTorso', [2.08, 0.18, 1.10], [0, 0.18, -0.02], fabricDark, fabric);
      markers.push(beltName);

      const cuffL = `${prefix}IdentityCuffL`;
      const cuffR = `${prefix}IdentityCuffR`;
      addAttachedBox(cuffL, 'LeftLowerArm', [0.82, 0.22, 0.82], [0, 0.18, -0.02], floorAccent, metal);
      addAttachedBox(cuffR, 'RightLowerArm', [0.82, 0.22, 0.82], [0, 0.18, -0.02], floorAccent, metal);
      markers.push(cuffL, cuffR);

      const bootL = `${prefix}IdentityBootTrimL`;
      const bootR = `${prefix}IdentityBootTrimR`;
      addAttachedBox(bootL, 'LeftLowerLeg', [0.86, 0.20, 0.88], [0, -0.02, -0.02], floorAccent, metal);
      addAttachedBox(bootR, 'RightLowerLeg', [0.86, 0.20, 0.88], [0, -0.02, -0.02], floorAccent, metal);
      markers.push(bootL, bootR);

      return markers;
    };

    const addRequestedAvatarAccessoryLayer = (
      prefix: string,
      archetype: GeneralNpcArchetype,
      expression: NpcExpression,
    ): string[] => {
      const markers: string[] = [];
      const hiddenFaceArchetype = archetype === 'robot'
        || archetype === 'ninja'
        || archetype === 'undead'
        || archetype === 'ghost'
        || archetype === 'arachnid'
        || archetype === 'golem'
        || archetype === 'plant_fungal'
        || archetype === 'elemental';
      const hairColor = /blond|blonde|блондин|светл/.test(text)
        ? color3(0.86, 0.68, 0.28)
        : /ginger|red\s*(?:hair|beard)|рыж|огненн[а-яё\s-]*(?:волос|бород)/.test(text)
          ? color3(0.95, 0.43, 0.12)
          : /white\s*(?:hair|beard)|gray\s*(?:hair|beard)|grey\s*(?:hair|beard)|сед|бел[а-яё\s-]*(?:волос|бород)/.test(text)
            ? color3(0.86, 0.86, 0.78)
            : color3(0.18, 0.10, 0.06);
      const capColor = /red|красн/.test(text)
        ? color3(0.72, 0.08, 0.10)
        : /blue|син|голуб/.test(text)
          ? color3(0.08, 0.18, 0.62)
          : /black|ч[её]рн|черн/.test(text)
            ? color3(0.04, 0.04, 0.05)
            : expression === 'magical'
              ? purple
              : color3(0.12, 0.18, 0.32);
      const glassColor = /neon|cyber|кибер|неон/.test(text)
        ? arcaneGlow
        : color3(0.08, 0.10, 0.14);

      if (wantsCapAccessory || wantsHatAccessory) {
        const capPrefix = wantsCapAccessory ? 'Cap' : 'Hat';
        const crownName = `${prefix}Avatar${capPrefix}CrownAccessory`;
        const crown = createRigidAccessory({
          name: crownName,
          bodyPartName: 'Head',
          attachmentName: 'HatAttachment',
          accessoryType: 'Hat',
          size: wantsCapAccessory ? [1.46, 0.36, 1.08] : [1.58, 0.40, 1.14],
          offset: [0, wantsCapAccessory ? 0.70 : 0.66, 0.04],
          color: capColor,
          material: fabric,
          shape: wantsCapAccessory ? 'Sphere' : 'Cylinder',
        });
        if (crown) markers.push(crownName);
        const brimName = `${prefix}Avatar${capPrefix}BrimAccessory`;
        const brimBackwards = /backwards|reverse|назад|задом|обратно/.test(text);
        const brim = createRigidAccessory({
          name: brimName,
          bodyPartName: 'Head',
          attachmentName: 'HatAttachment',
          accessoryType: 'Hat',
          size: [1.10, 0.12, 0.52],
          offset: [0, 0.58, brimBackwards ? 0.62 : -0.58],
          color: capColor,
          material: fabric,
          shape: 'Block',
        });
        if (brim) markers.push(brimName);
      }

      if (wantsHairAccessory && !hiddenFaceArchetype) {
        const hairName = `${prefix}AvatarHairAccessory`;
        const hair = createRigidAccessory({
          name: hairName,
          bodyPartName: 'Head',
          attachmentName: 'HairAttachment',
          accessoryType: 'Hair',
          size: /mohawk|ирокез/.test(text) ? [0.38, 0.68, 1.20] : [1.28, 0.32, 0.96],
          offset: /mohawk|ирокез/.test(text) ? [0, 0.78, 0.04] : [0, 0.54, 0.06],
          color: hairColor,
          material: fabric,
          shape: 'Sphere',
        });
        if (hair) markers.push(hairName);
      }

      if (wantsGlassesAccessory && !hiddenFaceArchetype) {
        const frameName = `${prefix}AvatarGlassesFrameAccessory`;
        const frame = createRigidAccessory({
          name: frameName,
          bodyPartName: 'Head',
          attachmentName: 'FaceFrontAttachment',
          accessoryType: 'Face',
          size: [1.34, 0.16, 0.08],
          offset: [0, 0.10, -0.66],
          color: glassColor,
          material: /gold|золот/.test(text) ? metal : plastic,
          shape: 'Block',
        });
        if (frame) markers.push(frameName);
        for (const [side, x] of [['L', -0.32], ['R', 0.32]] as const) {
          const lensName = `${prefix}AvatarGlassesLens${side}Accessory`;
          const lens = createRigidAccessory({
            name: lensName,
            bodyPartName: 'Head',
            attachmentName: 'FaceFrontAttachment',
            accessoryType: 'Face',
            size: [0.46, 0.24, 0.06],
            offset: [x, 0.10, -0.71],
            color: /clear|transparent|прозрач/.test(text) ? color3(0.72, 0.88, 1.0) : glassColor,
            material: /clear|transparent|прозрач/.test(text) ? plastic : neon,
            shape: 'Block',
          });
          if (lens) markers.push(lensName);
        }
      }

      if (wantsMustacheAccessory && !hiddenFaceArchetype) {
        for (const [side, x] of [['L', -0.20], ['R', 0.20]] as const) {
          const mustacheName = `${prefix}AvatarMustache${side}Accessory`;
          const mustache = createRigidAccessory({
            name: mustacheName,
            bodyPartName: 'Head',
            attachmentName: 'FaceFrontAttachment',
            accessoryType: 'Face',
            size: [0.38, 0.11, 0.08],
            offset: [x, -0.18, -0.70],
            color: hairColor,
            material: fabric,
            shape: 'Sphere',
          });
          if (mustache) markers.push(mustacheName);
        }
      }

      if (wantsBeardAccessory && !hiddenFaceArchetype) {
        const beardName = `${prefix}AvatarBeardAccessory`;
        const beard = createRigidAccessory({
          name: beardName,
          bodyPartName: 'Head',
          attachmentName: 'FaceFrontAttachment',
          accessoryType: 'Face',
          size: [0.86, 0.58, 0.14],
          offset: [0, -0.42, -0.66],
          color: hairColor,
          material: fabric,
          shape: 'Block',
        });
        if (beard) markers.push(beardName);
      }

      if (wantsBackpackAccessory) {
        const backpackName = `${prefix}AvatarBackpackAccessory`;
        const backpack = createRigidAccessory({
          name: backpackName,
          bodyPartName: 'UpperTorso',
          attachmentName: 'BodyBackAttachment',
          accessoryType: 'Back',
          size: [0.86, 0.94, 0.34],
          offset: [0, -0.10, 0.78],
          color: /neon|cyber|кибер|неон/.test(text) ? darkMetal : leather,
          material: leatherMat,
          shape: 'Block',
        });
        if (backpack) markers.push(backpackName);
      }

      if (wantsSatchelAccessory) {
        const satchelName = `${prefix}AvatarWaistSatchelAccessory`;
        const satchel = createRigidAccessory({
          name: satchelName,
          bodyPartName: 'LowerTorso',
          attachmentName: 'WaistFrontAttachment',
          accessoryType: 'Waist',
          size: [0.62, 0.40, 0.24],
          offset: [0.58, 0.02, -0.58],
          color: leather,
          material: leatherMat,
          shape: 'Block',
        });
        if (satchel) markers.push(satchelName);
      }

      if (wantsCapeAccessory) {
        const capeColor = /red|красн/.test(text)
          ? color3(0.70, 0.04, 0.08)
          : /purple|violet|фиолет|пурпур/.test(text)
            ? purple
            : /shadow|assassin|ninja|black|dark|тень|ассасин|ниндз|ч[её]рн|темн/.test(text)
              ? color3(0.045, 0.045, 0.065)
              : color3(0.18, 0.08, 0.22);
        const capeName = `${prefix}AvatarCapeAccessory`;
        const cape = createRigidAccessory({
          name: capeName,
          bodyPartName: 'UpperTorso',
          attachmentName: 'BodyBackAttachment',
          accessoryType: 'Back',
          size: [1.92, 1.72, 0.14],
          offset: [0, -0.30, 0.82],
          color: capeColor,
          material: fabric,
          shape: 'Block',
        });
        if (cape) markers.push(capeName);
        const collarName = `${prefix}AvatarCapeCollar`;
        if (addAttachedBox(collarName, 'UpperTorso', [2.02, 0.22, 1.12], [0, 0.50, -0.02], capeColor, fabric)) {
          markers.push(collarName);
        }
        for (const [side, x] of [['L', -0.46], ['R', 0.46]] as const) {
          const claspName = `${prefix}AvatarCapeClasp${side}`;
          if (addAttachedBox(claspName, 'UpperTorso', [0.22, 0.22, 0.10], [x, 0.44, -0.64], gold, metal, 'Sphere')) {
            markers.push(claspName);
          }
        }
      }

      return markers;
    };

    const addRoastMeshAccessoryLayer = (
      prefix: string,
      archetype: GeneralNpcArchetype,
      expression: NpcExpression,
    ): string[] => {
      if (!isRoastNpcMode) return [];
      const markers: string[] = [];
      const roastGold = color3(0.92, 0.76, 0.22);
      const roastBlack = color3(0.035, 0.035, 0.045);
      const roastChrome = color3(0.72, 0.72, 0.78);
      const roastPink = color3(1.0, 0.22, 0.68);
      const lensColor = archetype === 'sigma_chad'
        ? color3(0.06, 0.07, 0.10)
        : archetype === 'gen_alpha'
          ? color3(0.20, 0.24, 0.36)
          : color3(0.10, 0.12, 0.16);
      const hairColor = archetype === 'sigma_chad'
        ? color3(0.08, 0.06, 0.045)
        : archetype === 'gen_alpha'
          ? color3(0.24, 0.42, 0.12)
          : expression === 'magical'
            ? purple
            : color3(0.18, 0.10, 0.06);

      const addMarker = (name: string, handle?: string): void => {
        if (!handle) return;
        markers.push(name);
      };

      const hairName = `${prefix}MeshHairAccessory`;
      addMarker(hairName, createRigidAccessory({
        name: hairName,
        bodyPartName: 'Head',
        attachmentName: 'HairAttachment',
        accessoryType: 'Hair',
        size: archetype === 'gen_alpha' ? [1.48, 0.46, 1.12] : [1.32, 0.28, 0.96],
        offset: archetype === 'gen_alpha' ? [0, 0.62, 0.04] : [0, 0.56, 0.04],
        color: hairColor,
        material: fabric,
        shape: 'Sphere',
      }));

      if (archetype === 'gen_alpha') {
        const broccoliClusters: Array<[string, number, number, number, number]> = [
          ['Top', 0, 0.92, -0.02, 0.46],
          ['FrontL', -0.38, 0.72, -0.42, 0.36],
          ['FrontR', 0.38, 0.72, -0.42, 0.36],
          ['Back', 0, 0.72, 0.42, 0.38],
        ];
        for (const [suffix, x, y, z, sizeValue] of broccoliClusters) {
          const clusterName = `${prefix}MeshBroccoli${suffix}Accessory`;
          addMarker(clusterName, createRigidAccessory({
            name: clusterName,
            bodyPartName: 'Head',
            attachmentName: 'HairAttachment',
            accessoryType: 'Hair',
            size: [sizeValue, sizeValue, sizeValue],
            offset: [x, y, z],
            color: hairColor,
            material: grass,
            shape: 'Sphere',
          }));
        }
      }

      if (archetype === 'gym_bro') {
        const gymBlue = color3(0.16, 0.42, 0.92);
        const gymSkin = color3(0.92, 0.72, 0.55);
        const gymTank = color3(0.045, 0.045, 0.055);
        const gymSteel = color3(0.58, 0.60, 0.64);
        const gymRubber = color3(0.08, 0.08, 0.09);
        const tankName = `${prefix}MeshGymBroTankAccessory`;
        addMarker(tankName, createRigidAccessory({
          name: tankName,
          bodyPartName: 'UpperTorso',
          attachmentName: 'BodyFrontAttachment',
          accessoryType: 'Front',
          size: [1.56, 1.22, 0.12],
          offset: [0, -0.08, -0.78],
          color: gymTank,
          material: fabric,
          forceMeshAccessory: true,
          specialMeshScale: [1.22, 0.94, 0.10],
        }));
        const headbandName = `${prefix}MeshGymBroHeadbandAccessory`;
        addMarker(headbandName, createRigidAccessory({
          name: headbandName,
          bodyPartName: 'Head',
          attachmentName: 'HatAttachment',
          accessoryType: 'Hat',
          size: [1.48, 0.18, 1.18],
          offset: [0, 0.44, 0],
          color: gymBlue,
          material: fabric,
          forceMeshAccessory: true,
          specialMeshScale: [1.10, 0.14, 0.90],
        }));
        for (const [side, bodyPartName, attachmentName, x] of [
          ['Left', 'LeftUpperArm', 'LeftShoulderAttachment', -0.02],
          ['Right', 'RightUpperArm', 'RightShoulderAttachment', 0.02],
        ] as const) {
          const bicepName = `${prefix}MeshGymBro${side}BicepAccessory`;
          addMarker(bicepName, createRigidAccessory({
            name: bicepName,
            bodyPartName,
            attachmentName,
            accessoryType: 'Shoulder',
            size: [1.18, 0.76, 1.18],
            offset: [x, 0.06, 0],
            color: gymSkin,
            material: plastic,
            shape: 'Sphere',
          }));
        }
        for (const [side, bodyPartName, attachmentName] of [
          ['Left', 'LeftHand', 'LeftGripAttachment'],
          ['Right', 'RightHand', 'RightGripAttachment'],
        ] as const) {
          const wristName = `${prefix}MeshGymBro${side}WristbandAccessory`;
          addMarker(wristName, createRigidAccessory({
            name: wristName,
            bodyPartName,
            attachmentName,
            accessoryType: 'Unknown',
            size: [0.66, 0.22, 0.66],
            offset: [0, 0.22, 0],
            color: gymBlue,
            material: fabric,
            shape: 'Cylinder',
          }));
        }
        const beltName = `${prefix}MeshGymBroWeightBeltAccessory`;
        addMarker(beltName, createRigidAccessory({
          name: beltName,
          bodyPartName: 'LowerTorso',
          attachmentName: 'WaistFrontAttachment',
          accessoryType: 'Waist',
          size: [1.62, 0.26, 0.16],
          offset: [0, 0.28, -0.70],
          color: gymRubber,
          material: leatherMat,
          forceMeshAccessory: true,
          specialMeshScale: [1.18, 0.20, 0.12],
        }));
        const shakerName = `${prefix}MeshGymBroProteinShakerAccessory`;
        addMarker(shakerName, createRigidAccessory({
          name: shakerName,
          bodyPartName: 'LeftHand',
          attachmentName: 'LeftGripAttachment',
          accessoryType: 'Unknown',
          size: [0.42, 0.82, 0.42],
          offset: [-0.18, -0.02, -0.18],
          color: color3(0.86, 0.92, 1.0),
          material: plastic,
          shape: 'Cylinder',
        }));
        const shakerLidName = `${prefix}MeshGymBroShakerLidAccessory`;
        addMarker(shakerLidName, createRigidAccessory({
          name: shakerLidName,
          bodyPartName: 'LeftHand',
          attachmentName: 'LeftGripAttachment',
          accessoryType: 'Unknown',
          size: [0.46, 0.12, 0.46],
          offset: [-0.18, 0.42, -0.18],
          color: gymBlue,
          material: plastic,
          shape: 'Cylinder',
        }));
        const dumbbellGripName = `${prefix}MeshGymBroDumbbellGripAccessory`;
        addMarker(dumbbellGripName, createRigidAccessory({
          name: dumbbellGripName,
          bodyPartName: 'RightHand',
          attachmentName: 'RightGripAttachment',
          accessoryType: 'Unknown',
          size: [0.18, 0.96, 0.18],
          offset: [0.28, 0.10, -0.12],
          color: gymSteel,
          material: metal,
          shape: 'Cylinder',
        }));
        for (const [side, y] of [['Top', 0.62], ['Bottom', -0.42]] as const) {
          const plateName = `${prefix}MeshGymBroDumbbell${side}PlateAccessory`;
          addMarker(plateName, createRigidAccessory({
            name: plateName,
            bodyPartName: 'RightHand',
            attachmentName: 'RightGripAttachment',
            accessoryType: 'Unknown',
            size: [0.72, 0.20, 0.72],
            offset: [0.28, y, -0.12],
            color: gymRubber,
            material: metal,
            shape: 'Cylinder',
          }));
        }
      }

      if (archetype === 'skibidi') {
        const wantsGoldenSkibidi = /gold|golden|золот|aurum/.test(text);
        const toiletShell = wantsGoldenSkibidi ? color3(1.0, 0.78, 0.20) : color3(0.92, 0.96, 1.0);
        const toiletRim = wantsGoldenSkibidi ? color3(1.0, 0.90, 0.28) : color3(0.82, 0.92, 1.0);
        const waterGlow = wantsGoldenSkibidi ? color3(1.0, 0.70, 0.16) : color3(0.28, 0.86, 1.0);
        const tankName = `${prefix}MeshToiletTankAccessory`;
        addMarker(tankName, createRigidAccessory({
          name: tankName,
          bodyPartName: 'UpperTorso',
          attachmentName: 'BodyBackAttachment',
          accessoryType: 'Back',
          size: [1.42, 0.86, 0.42],
          offset: [0, 0.22, 0.78],
          color: toiletShell,
          material: plastic,
          forceMeshAccessory: true,
          specialMeshScale: [1.18, 0.68, 0.34],
        }));
        const bowlName = `${prefix}MeshToiletBowlAccessory`;
        addMarker(bowlName, createRigidAccessory({
          name: bowlName,
          bodyPartName: 'LowerTorso',
          attachmentName: 'WaistBackAttachment',
          accessoryType: 'Waist',
          size: [1.48, 0.70, 0.78],
          offset: [0, -0.10, 0.66],
          color: toiletShell,
          material: plastic,
          shape: 'Sphere',
        }));
        const seatName = `${prefix}MeshToiletSeatRingAccessory`;
        const seat = createRigidAccessory({
          name: seatName,
          bodyPartName: 'LowerTorso',
          attachmentName: 'WaistFrontAttachment',
          accessoryType: 'Waist',
          size: [1.54, 0.18, 0.90],
          offset: [0, -0.28, -0.62],
          color: toiletRim,
          material: plastic,
          shape: 'Cylinder',
        });
        addMarker(seatName, seat);
        if (seat) addPointLight(seat, `${prefix}MeshToiletWaterGlow`, waterGlow, 7, 0.9);
        const flushName = `${prefix}MeshFlushHandleAccessory`;
        addMarker(flushName, createRigidAccessory({
          name: flushName,
          bodyPartName: 'UpperTorso',
          attachmentName: 'BodyBackAttachment',
          accessoryType: 'Back',
          size: [0.38, 0.16, 0.16],
          offset: [0.66, 0.42, 0.98],
          color: wantsGoldenSkibidi ? roastGold : roastChrome,
          material: metal,
          shape: 'Cylinder',
        }));
        if (wantsGoldenSkibidi) {
          const crownName = `${prefix}MeshGoldenCrownAccessory`;
          addMarker(crownName, createRigidAccessory({
            name: crownName,
            bodyPartName: 'Head',
            attachmentName: 'HatAttachment',
            accessoryType: 'Hat',
            size: [1.18, 0.26, 1.00],
            offset: [0, 0.88, 0],
            color: roastGold,
            material: metal,
            forceMeshAccessory: true,
            specialMeshScale: [0.94, 0.22, 0.78],
          }));
          const haloName = `${prefix}MeshGoldenHaloAccessory`;
          addMarker(haloName, createRigidAccessory({
            name: haloName,
            bodyPartName: 'Head',
            attachmentName: 'HatAttachment',
            accessoryType: 'Hat',
            size: [1.74, 0.10, 1.74],
            offset: [0, 1.12, 0],
            color: color3(1.0, 0.92, 0.24),
            material: neon,
            shape: 'Cylinder',
          }));
          const medallionName = `${prefix}MeshGoldenMedallionAccessory`;
          addMarker(medallionName, createRigidAccessory({
            name: medallionName,
            bodyPartName: 'UpperTorso',
            attachmentName: 'BodyFrontAttachment',
            accessoryType: 'Front',
            size: [0.46, 0.46, 0.12],
            offset: [0, 0.18, -0.80],
            color: roastGold,
            material: metal,
            shape: 'Sphere',
          }));
        }
      }

      const shadesFrameName = `${prefix}MeshShadesFrameAccessory`;
      addMarker(shadesFrameName, createRigidAccessory({
        name: shadesFrameName,
        bodyPartName: 'Head',
        attachmentName: 'FaceFrontAttachment',
        accessoryType: 'Face',
        size: [1.42, 0.18, 0.08],
        offset: [0, 0.10, -0.72],
        color: archetype === 'sigma_chad' ? roastGold : roastBlack,
        material: metal,
        forceMeshAccessory: true,
        specialMeshScale: [1.15, 0.35, 0.15],
      }));
      for (const [side, x] of [['L', -0.33], ['R', 0.33]] as const) {
        const lensName = `${prefix}MeshShadesLens${side}Accessory`;
        addMarker(lensName, createRigidAccessory({
          name: lensName,
          bodyPartName: 'Head',
          attachmentName: 'FaceFrontAttachment',
          accessoryType: 'Face',
          size: [0.48, 0.26, 0.06],
          offset: [x, 0.10, -0.76],
          color: lensColor,
          material: neon,
          shape: 'Sphere',
        }));
      }

      if (archetype === 'sigma_chad') {
        const tieName = `${prefix}MeshTieAccessory`;
        addMarker(tieName, createRigidAccessory({
          name: tieName,
          bodyPartName: 'UpperTorso',
          attachmentName: 'BodyFrontAttachment',
          accessoryType: 'Front',
          size: [0.28, 1.22, 0.10],
          offset: [0, -0.22, -0.74],
          color: color3(0.06, 0.06, 0.08),
          material: fabric,
          specialMeshId: NPC_FILE_MESH_SWORD,
          specialMeshScale: [0.22, 0.72, 0.22],
        }));
        const watchName = `${prefix}MeshWatchAccessory`;
        addMarker(watchName, createRigidAccessory({
          name: watchName,
          bodyPartName: 'LeftHand',
          attachmentName: 'LeftGripAttachment',
          accessoryType: 'Unknown',
          size: [0.92, 0.20, 0.92],
          offset: [0, 0.28, 0],
          color: roastGold,
          material: metal,
          shape: 'Cylinder',
        }));
      }

      if (/smart\s*phone|smartphone|\bphone\b|телефон|смартфон/.test(text) || archetype === 'gen_alpha') {
        const phoneName = `${prefix}MeshSmartphoneAccessory`;
        const phone = createRigidAccessory({
          name: phoneName,
          bodyPartName: 'LeftHand',
          attachmentName: 'LeftGripAttachment',
          accessoryType: 'Unknown',
          size: [0.52, 0.94, 0.10],
          offset: [-0.18, -0.02, -0.18],
          color: color3(0.08, 0.10, 0.14),
          material: plastic,
          forceMeshAccessory: true,
          specialMeshScale: [0.42, 0.72, 0.10],
        });
        addMarker(phoneName, phone);
        if (phone) addPointLight(phone, `${prefix}MeshPhoneGlow`, color3(0.54, 0.92, 1.0), 7, 1.05);
      }

      const micHandleName = `${prefix}MeshRoastMicHandleAccessory`;
      addMarker(micHandleName, createRigidAccessory({
        name: micHandleName,
        bodyPartName: 'RightHand',
        attachmentName: 'RightGripAttachment',
        accessoryType: 'Unknown',
        size: [0.18, 0.94, 0.18],
        offset: [0.22, 0.30, -0.16],
        color: roastBlack,
        material: metal,
        shape: 'Cylinder',
      }));
      const micHeadName = `${prefix}MeshRoastMicHeadAccessory`;
      addMarker(micHeadName, createRigidAccessory({
        name: micHeadName,
        bodyPartName: 'RightHand',
        attachmentName: 'RightGripAttachment',
        accessoryType: 'Unknown',
        size: [0.34, 0.34, 0.34],
        offset: [0.22, 0.82, -0.16],
        color: roastChrome,
        material: metal,
        shape: 'Sphere',
      }));

      const speechName = `${prefix}MeshRoastSpeechBoardAccessory`;
      addMarker(speechName, createRigidAccessory({
        name: speechName,
        bodyPartName: 'UpperTorso',
        attachmentName: 'BodyFrontAttachment',
        accessoryType: 'Front',
        size: [1.24, 0.40, 0.10],
        offset: [0, 0.66, -0.78],
        color: roastBlack,
        material: plastic,
        forceMeshAccessory: true,
        specialMeshScale: [1.05, 0.34, 0.10],
      }));

      const chainName = `${prefix}MeshRoastChainAccessory`;
      addMarker(chainName, createRigidAccessory({
        name: chainName,
        bodyPartName: 'UpperTorso',
        attachmentName: 'BodyFrontAttachment',
        accessoryType: 'Front',
        size: [0.46, 0.46, 0.10],
        offset: [0, 0.22, -0.76],
        color: archetype === 'gen_alpha' ? roastPink : roastGold,
        material: metal,
        shape: 'Sphere',
      }));

      return markers;
    };

    const addGeneratedNpcAccessoryFallbackLayer = (prefix: string): string[] => {
      if (generatedNpcAccessoryFallbackSpecs.length === 0) return [];
      const markers: string[] = [];
      const addMarker = (name: string, handleId: string | undefined): void => {
        if (handleId) markers.push(name);
      };
      const fallbackPrefix = `${prefix}GeneratedFallback`;
      const brightBlue = color3(0.12, 0.42, 1.0);
      const screenCyan = color3(0.34, 0.92, 1.0);
      const matteBlack = color3(0.035, 0.035, 0.045);
      const rubberBlack = color3(0.06, 0.06, 0.065);
      const steelGrey = color3(0.60, 0.63, 0.68);
      const shakerWhite = color3(0.88, 0.94, 1.0);
      const broccoliGreen = color3(0.18, 0.46, 0.13);
      const broccoliLight = color3(0.36, 0.62, 0.20);
      const warmGold = color3(1.0, 0.76, 0.18);
      const parchment = color3(0.92, 0.80, 0.56);
      const arcaneGlow = color3(0.48, 0.82, 1.0);

      for (const asset of generatedNpcAccessoryFallbackSpecs) {
        const key = asset.key.toLowerCase();
        const safeKey = asset.key.replace(/[^A-Za-z0-9_]/g, '_');

        if (/dumbbell|weight/.test(key)) {
          const gripName = `${fallbackPrefix}_${safeKey}_DumbbellGripAccessory`;
          addMarker(gripName, createRigidAccessory({
            name: gripName,
            bodyPartName: 'RightHand',
            attachmentName: 'RightGripAttachment',
            accessoryType: 'Unknown',
            size: [0.22, 1.34, 0.22],
            offset: [0.56, 0.10, -0.54],
            color: steelGrey,
            material: metal,
            shape: 'Cylinder',
          }));
          for (const [side, y] of [['Top', 0.82], ['Bottom', -0.62]] as const) {
            const plateName = `${fallbackPrefix}_${safeKey}_Dumbbell${side}PlateAccessory`;
            addMarker(plateName, createRigidAccessory({
              name: plateName,
              bodyPartName: 'RightHand',
              attachmentName: 'RightGripAttachment',
              accessoryType: 'Unknown',
              size: [0.84, 0.28, 0.84],
              offset: [0.56, y, -0.54],
              color: rubberBlack,
              material: metal,
              shape: 'Cylinder',
            }));
          }
          continue;
        }

        if (/protein|shaker|bottle/.test(key)) {
          const bottleName = `${fallbackPrefix}_${safeKey}_ProteinShakerBottleAccessory`;
          addMarker(bottleName, createRigidAccessory({
            name: bottleName,
            bodyPartName: 'LeftHand',
            attachmentName: 'LeftGripAttachment',
            accessoryType: 'Unknown',
            size: [0.52, 1.08, 0.52],
            offset: [-0.50, 0.04, -0.54],
            color: shakerWhite,
            material: plastic,
            shape: 'Cylinder',
          }));
          const capName = `${fallbackPrefix}_${safeKey}_ProteinShakerCapAccessory`;
          addMarker(capName, createRigidAccessory({
            name: capName,
            bodyPartName: 'LeftHand',
            attachmentName: 'LeftGripAttachment',
            accessoryType: 'Unknown',
            size: [0.58, 0.18, 0.58],
            offset: [-0.50, 0.66, -0.54],
            color: brightBlue,
            material: plastic,
            shape: 'Cylinder',
          }));
          const labelName = `${fallbackPrefix}_${safeKey}_ProteinShakerLabelAccessory`;
          addMarker(labelName, createRigidAccessory({
            name: labelName,
            bodyPartName: 'LeftHand',
            attachmentName: 'LeftGripAttachment',
            accessoryType: 'Unknown',
            size: [0.44, 0.28, 0.08],
            offset: [-0.50, 0.06, -0.84],
            color: matteBlack,
            material: plastic,
            forceMeshAccessory: true,
            specialMeshScale: [0.36, 0.22, 0.06],
          }));
          continue;
        }

        if (/phone|smartphone/.test(key)) {
          const phoneName = `${fallbackPrefix}_${safeKey}_SmartphoneAccessory`;
          const phone = createRigidAccessory({
            name: phoneName,
            bodyPartName: asset.bodyPartName || 'RightHand',
            attachmentName: asset.attachmentName || 'RightGripAttachment',
            accessoryType: 'Unknown',
            size: [0.52, 0.82, 0.10],
            offset: [asset.offset[0] || 0.36, asset.offset[1] || 0.06, asset.offset[2] || -0.62],
            color: matteBlack,
            material: plastic,
            forceMeshAccessory: true,
            specialMeshScale: [0.44, 0.68, 0.08],
          });
          addMarker(phoneName, phone);
          if (phone) addPointLight(phone, `${fallbackPrefix}_${safeKey}_SmartphoneGlow`, screenCyan, 8, 1.2);
          continue;
        }

        if (/broccoli|hair/.test(key)) {
          for (const [i, x, y, z, scale, color] of [
            [0, 0.00, 0.68, 0.00, 0.58, broccoliGreen],
            [1, -0.44, 0.54, -0.06, 0.46, broccoliLight],
            [2, 0.44, 0.54, -0.06, 0.46, broccoliLight],
            [3, -0.20, 0.82, 0.18, 0.42, broccoliGreen],
            [4, 0.24, 0.82, 0.16, 0.42, broccoliGreen],
          ] as const) {
            const hairName = `${fallbackPrefix}_${safeKey}_BroccoliHairCluster${i}Accessory`;
            addMarker(hairName, createRigidAccessory({
              name: hairName,
              bodyPartName: 'Head',
              attachmentName: 'HairAttachment',
              accessoryType: 'Hair',
              size: [scale, scale, scale],
              offset: [x, y, z],
              color,
              material: grass,
              shape: 'Sphere',
            }));
          }
          continue;
        }

        if (/staff|wand|scepter|rod/.test(key)) {
          const staffName = `${fallbackPrefix}_${safeKey}_StaffShaftAccessory`;
          addMarker(staffName, createRigidAccessory({
            name: staffName,
            bodyPartName: asset.bodyPartName || 'RightHand',
            attachmentName: asset.attachmentName || 'RightGripAttachment',
            accessoryType: 'Unknown',
            size: [0.16, 1.64, 0.16],
            offset: asset.offset,
            color: color3(0.34, 0.20, 0.10),
            material: wood,
            shape: 'Cylinder',
          }));
          const orbName = `${fallbackPrefix}_${safeKey}_StaffOrbAccessory`;
          const orb = createRigidAccessory({
            name: orbName,
            bodyPartName: asset.bodyPartName || 'RightHand',
            attachmentName: asset.attachmentName || 'RightGripAttachment',
            accessoryType: 'Unknown',
            size: [0.42, 0.42, 0.42],
            offset: [asset.offset[0], asset.offset[1] + 0.86, asset.offset[2]],
            color: arcaneGlow,
            material: neon,
            shape: 'Sphere',
          });
          addMarker(orbName, orb);
          if (orb) addPointLight(orb, `${fallbackPrefix}_${safeKey}_StaffGlow`, arcaneGlow, 8, 1.2);
          continue;
        }

        if (/book|grimoire|tome|codex/.test(key)) {
          const bookName = `${fallbackPrefix}_${safeKey}_BookCoverAccessory`;
          addMarker(bookName, createRigidAccessory({
            name: bookName,
            bodyPartName: asset.bodyPartName || 'LeftHand',
            attachmentName: asset.attachmentName || 'LeftGripAttachment',
            accessoryType: 'Unknown',
            size: [0.58, 0.82, 0.18],
            offset: asset.offset,
            color: color3(0.28, 0.08, 0.16),
            material: leatherMat,
          }));
          const pageName = `${fallbackPrefix}_${safeKey}_BookPagesAccessory`;
          addMarker(pageName, createRigidAccessory({
            name: pageName,
            bodyPartName: asset.bodyPartName || 'LeftHand',
            attachmentName: asset.attachmentName || 'LeftGripAttachment',
            accessoryType: 'Unknown',
            size: [0.48, 0.66, 0.08],
            offset: [asset.offset[0], asset.offset[1], asset.offset[2] - 0.08],
            color: parchment,
            material: fabric,
          }));
          continue;
        }

        if (/scroll|map/.test(key)) {
          const scrollName = `${fallbackPrefix}_${safeKey}_ScrollRollAccessory`;
          addMarker(scrollName, createRigidAccessory({
            name: scrollName,
            bodyPartName: asset.bodyPartName || 'LeftHand',
            attachmentName: asset.attachmentName || 'LeftGripAttachment',
            accessoryType: 'Unknown',
            size: [0.28, 0.92, 0.28],
            offset: asset.offset,
            color: parchment,
            material: fabric,
            shape: 'Cylinder',
          }));
          const ribbonName = `${fallbackPrefix}_${safeKey}_ScrollRibbonAccessory`;
          addMarker(ribbonName, createRigidAccessory({
            name: ribbonName,
            bodyPartName: asset.bodyPartName || 'LeftHand',
            attachmentName: asset.attachmentName || 'LeftGripAttachment',
            accessoryType: 'Unknown',
            size: [0.34, 0.12, 0.34],
            offset: [asset.offset[0], asset.offset[1], asset.offset[2] - 0.02],
            color: brightBlue,
            material: fabric,
            shape: 'Cylinder',
          }));
          continue;
        }

        if (/lantern|lamp/.test(key)) {
          const glowName = `${fallbackPrefix}_${safeKey}_LanternGlowAccessory`;
          const glow = createRigidAccessory({
            name: glowName,
            bodyPartName: asset.bodyPartName || 'LeftHand',
            attachmentName: asset.attachmentName || 'LeftGripAttachment',
            accessoryType: 'Unknown',
            size: [0.44, 0.54, 0.34],
            offset: asset.offset,
            color: color3(1.0, 0.72, 0.22),
            material: neon,
            shape: 'Sphere',
          });
          addMarker(glowName, glow);
          addMarker(`${fallbackPrefix}_${safeKey}_LanternFrameAccessory`, createRigidAccessory({
            name: `${fallbackPrefix}_${safeKey}_LanternFrameAccessory`,
            bodyPartName: asset.bodyPartName || 'LeftHand',
            attachmentName: asset.attachmentName || 'LeftGripAttachment',
            accessoryType: 'Unknown',
            size: [0.58, 0.72, 0.42],
            offset: asset.offset,
            color: steelGrey,
            material: metal,
            forceMeshAccessory: true,
            specialMeshScale: [0.46, 0.58, 0.34],
          }));
          if (glow) addPointLight(glow, `${fallbackPrefix}_${safeKey}_LanternLight`, color3(1.0, 0.72, 0.22), 9, 1.4);
          continue;
        }

        if (/crown|tiara/.test(key)) {
          const crownBandName = `${fallbackPrefix}_${safeKey}_CrownBandAccessory`;
          addMarker(crownBandName, createRigidAccessory({
            name: crownBandName,
            bodyPartName: 'Head',
            attachmentName: 'HatAttachment',
            accessoryType: 'Hat',
            size: [1.22, 0.22, 1.02],
            offset: [0, 0.72, 0.02],
            color: warmGold,
            material: metal,
            shape: 'Cylinder',
          }));
          for (const [point, x] of [['L', -0.42], ['C', 0], ['R', 0.42]] as const) {
            const pointName = `${fallbackPrefix}_${safeKey}_CrownPoint${point}Accessory`;
            addMarker(pointName, createRigidAccessory({
              name: pointName,
              bodyPartName: 'Head',
              attachmentName: 'HatAttachment',
              accessoryType: 'Hat',
              size: [0.22, point === 'C' ? 0.42 : 0.34, 0.16],
              offset: [x, point === 'C' ? 0.96 : 0.90, -0.08],
              color: warmGold,
              material: metal,
            }));
          }
          continue;
        }

        if (/cape|cloak/.test(key)) {
          const capeName = `${fallbackPrefix}_${safeKey}_CapeAccessory`;
          addMarker(capeName, createRigidAccessory({
            name: capeName,
            bodyPartName: 'UpperTorso',
            attachmentName: 'BodyBackAttachment',
            accessoryType: 'Back',
            size: [1.78, 1.86, 0.14],
            offset: [asset.offset[0], asset.offset[1] - 0.28, asset.offset[2] || 0.72],
            color: color3(0.42, 0.08, 0.16),
            material: fabric,
          }));
          continue;
        }

        if (/shield/.test(key)) {
          const shieldName = `${fallbackPrefix}_${safeKey}_ShieldAccessory`;
          addMarker(shieldName, createRigidAccessory({
            name: shieldName,
            bodyPartName: asset.bodyPartName || 'LeftLowerArm',
            attachmentName: asset.attachmentName || 'LeftGripAttachment',
            accessoryType: 'Unknown',
            size: [0.22, 1.04, 0.82],
            offset: asset.offset,
            color: color3(0.12, 0.22, 0.42),
            material: metal,
            forceMeshAccessory: true,
            specialMeshScale: [0.18, 0.82, 0.64],
          }));
          continue;
        }

        if (/sword|blade|katana/.test(key)) {
          const bladeName = `${fallbackPrefix}_${safeKey}_SwordBladeAccessory`;
          addMarker(bladeName, createRigidAccessory({
            name: bladeName,
            bodyPartName: asset.bodyPartName || 'RightHand',
            attachmentName: asset.attachmentName || 'RightGripAttachment',
            accessoryType: 'Unknown',
            size: [0.12, 1.44, 0.08],
            offset: asset.offset,
            color: steelGrey,
            material: metal,
          }));
          const guardName = `${fallbackPrefix}_${safeKey}_SwordGuardAccessory`;
          addMarker(guardName, createRigidAccessory({
            name: guardName,
            bodyPartName: asset.bodyPartName || 'RightHand',
            attachmentName: asset.attachmentName || 'RightGripAttachment',
            accessoryType: 'Unknown',
            size: [0.58, 0.10, 0.12],
            offset: [asset.offset[0], asset.offset[1] - 0.48, asset.offset[2]],
            color: warmGold,
            material: metal,
          }));
          continue;
        }

        if (/mask|glasses|goggles|shades/.test(key)) {
          const maskName = `${fallbackPrefix}_${safeKey}_FaceAccessory`;
          addMarker(maskName, createRigidAccessory({
            name: maskName,
            bodyPartName: 'Head',
            attachmentName: 'FaceFrontAttachment',
            accessoryType: 'Face',
            size: [1.20, 0.28, 0.08],
            offset: [0, 0.08, -0.68],
            color: matteBlack,
            material: plastic,
            forceMeshAccessory: true,
            specialMeshScale: [1.02, 0.24, 0.06],
          }));
          continue;
        }

        const genericName = `${fallbackPrefix}_${safeKey}_VisiblePropAccessory`;
        addMarker(genericName, createRigidAccessory({
          name: genericName,
          bodyPartName: asset.bodyPartName,
          attachmentName: asset.attachmentName,
          accessoryType: asset.accessoryType,
          size: [0.70, 0.70, 0.70],
          offset: asset.offset,
          color: brightBlue,
          material: plastic,
          shape: 'Sphere',
        }));
      }

      return markers;
    };

    const addGeneralNpcVisualConfigMarker = (
      archetype: GeneralNpcArchetype,
      roleKit: string,
      traitKits: GeneralNpcTraitKit[] = [],
      accessories: string[] = [],
      qualityStatus = 'passed',
    ): void => {
      const prefix = prefixForGeneralNpc(archetype, roleKit);
      const expression = resolveNpcExpression(archetype);
      const assetTemplateMarkers = addNpcAssetTemplateLayer(archetype, prefix, expression);
      const identityFloorMarkers = addUniversalIdentityFloorKit(prefix, archetype, expression);
      const requestedAvatarAccessoryMarkers = addRequestedAvatarAccessoryLayer(prefix, archetype, expression);
      const roastMeshAccessoryMarkers = addRoastMeshAccessoryLayer(prefix, archetype, expression);
      const generatedAccessoryFallbackMarkers = addGeneratedNpcAccessoryFallbackLayer(prefix);
      const requiredMarkers = [
        ...assetTemplateMarkers,
        ...identityFloorMarkers,
        ...requestedAvatarAccessoryMarkers,
        ...roastMeshAccessoryMarkers,
        ...generatedAccessoryFallbackMarkers,
        ...addGeneralFaceExpressionKit(prefix, archetype, expression),
        ...addModeSignatureKit(prefix, archetype),
      ];
      const traitSet = new Set<GeneralNpcTraitKit>(traitKits);
      if (isRoastNpcMode) traitSet.add('roast');
      if (isPatrol) traitSet.add('patrol');
      if (isKnightOrGuard) traitSet.add('guard');
      if (isPolice) traitSet.add('police');
      if (isMerchant) traitSet.add('merchant');
      if (isBoss) traitSet.add('boss');
      if (isVillain) traitSet.add('villain');
      if (isCompanion) traitSet.add('companion');
      if (isQuestGiver) traitSet.add('quest');
      if (isGhost) traitSet.add('spectral');
      if (isEnemy) traitSet.add('enemy');
      if (isMage) traitSet.add('mage');
      if (isFireElemental) traitSet.add('fire');
      if (isRobot) traitSet.add('robot');
      if (isPirate) traitSet.add('pirate');
      if (isNinja) traitSet.add('ninja');
      if (isUndead) traitSet.add('undead');
      if (isSuperhero) traitSet.add('superhero');
      if (isCelestial) traitSet.add('celestial');
      const accessorySet = new Set(accessories);
      if (isRoastNpcMode) accessorySet.add('universal_roast_kit');
      if (generatedNpcAccessoryAssets.length > 0) accessorySet.add('generated_accessory_assets_v1');
      if (generatedNpcAccessoryFallbackSpecs.length > 0) accessorySet.add('generated_accessory_plan_fallback_v1');
      if (isPatrol) accessorySet.add('patrol_route_kit');
      if (isQuestGiver) accessorySet.add('quest_marker');
      if (isMerchant) accessorySet.add('merchant_trade_kit');
      if (isBoss) accessorySet.add('boss_role_kit');
      if (isKnightOrGuard) accessorySet.add('guard_authority_kit');
      if (isPolice) accessorySet.add('police_authority_kit');
      if (isMage) accessorySet.add('mage_arcane_kit');
      if (isEnemy) accessorySet.add('enemy_threat_kit');
      if (isCompanion) accessorySet.add('companion_friendly_kit');
      if (isRobot) accessorySet.add('robot_mechanical_kit');
      if (isPirate) accessorySet.add('pirate_captain_kit');
      if (isNinja) accessorySet.add('ninja_stealth_kit');
      if (isUndead) accessorySet.add('undead_bone_decay_kit');
      if (isSuperhero) accessorySet.add('superhero_power_kit');
      if (isCelestial) accessorySet.add('celestial_aura_kit');
      if (assetTemplateMarkers.length > 0) accessorySet.add('asset_template_layer_v1');
      if (identityFloorMarkers.length > 0) accessorySet.add('identity_floor_v2');
      if (requestedAvatarAccessoryMarkers.length > 0) accessorySet.add('requested_avatar_accessory_layer_v1');
      if (roastMeshAccessoryMarkers.length > 0) accessorySet.add('mesh_accessory_layer_v1');
      if (generatedAccessoryFallbackMarkers.length > 0) accessorySet.add('generated_accessory_visible_fallback_v1');
      accessorySet.add('visual_dna_v1');
      if (wantsGoofyOversizedHead) accessorySet.add('goofy_oversized_head_v1');
      if (npcRigidAccessoryNames.size > 0) accessorySet.add('rigid_accessory_layer_v1');
      if (npcMeshAccessoryNames.size > 0) accessorySet.add('mesh_backed_accessories_v1');
      if (llmAccessoriesApplied) accessorySet.add(usesNpcAccentLayerVisuals ? 'llm_safe_accent_layer' : 'llm_accessories');
      accessorySet.add('identity_face_expression_kit');
      if (isQuestGiver) accessorySet.add('quest_mode_signature');
      if (isEnemy) accessorySet.add('enemy_mode_signature');
      if (!isQuestGiver && !isEnemy && !isRoastNpcMode) accessorySet.add('ai_chat_signature');
      const visualQualityGate = buildNpcVisualQualityGate(requiredMarkers);
      const qualityGatePassed = visualQualityGate.passed === true;
      writeNpcVisualConfigMarker({
        archetype,
        visualFamily: npcVisualFamily,
        mode: npcVisualMode,
        bodyPreset: 'r15_template',
        palette: 'role_specific',
        roleKit,
        traitKits: Array.from(traitSet),
        accessories: Array.from(accessorySet),
        assetTemplateMarkers,
        expression,
        visualConfigMode: npcVisualConfigMode ?? (usesNpcAccentLayerVisuals ? 'accent_layer' : 'full_visual_config'),
        visualQualityGate,
        qualityStatus: qualityGatePassed ? qualityStatus : 'quality_gate_warning',
      });
    };

    const addSecondaryMerchantTraitKit = (prefix: string): void => {
      addAttachedBox(`${prefix}MerchantSignBoard`, 'UpperTorso', [0.96, 0.58, 0.10], [0.54, -0.14, -0.70], color3(0.40, 0.22, 0.10), wood);
      addAttachedBox(`${prefix}MerchantCoinDot`, 'UpperTorso', [0.24, 0.24, 0.08], [0.28, -0.14, -0.78], gold, metal, 'Sphere');
      addAttachedBox(`${prefix}MerchantLedger`, 'LeftHand', [0.42, 0.62, 0.14], [-0.14, -0.10, -0.06], color3(0.32, 0.17, 0.08), leatherMat);
      addAttachedBox(`${prefix}MerchantPouch`, 'LowerTorso', [0.44, 0.38, 0.28], [0.66, 0.02, -0.42], gold, fabric, 'Sphere');
    };

    const addSecondaryBossTraitKit = (prefix: string): void => {
      const bossGlow = color3(1.0, 0.16, 0.10);
      const bossGold = color3(0.96, 0.70, 0.18);
      const core = addAttachedBox(`${prefix}BossRoleCore`, 'UpperTorso', [0.62, 0.62, 0.16], [0, 0.18, -0.86], bossGlow, neon, 'Sphere');
      addAttachedBox(`${prefix}BossRoleSpikeL`, 'LeftUpperArm', [0.28, 0.88, 0.24], [0, 0.62, -0.18], bossGold, metal);
      addAttachedBox(`${prefix}BossRoleSpikeR`, 'RightUpperArm', [0.28, 0.88, 0.24], [0, 0.62, -0.18], bossGold, metal);
      addAttachedBox(`${prefix}BossRoleBackSpikeL`, 'UpperTorso', [0.22, 0.86, 0.18], [-0.62, 0.34, 0.78], bossGold, metal);
      addAttachedBox(`${prefix}BossRoleBackSpikeR`, 'UpperTorso', [0.22, 0.86, 0.18], [0.62, 0.34, 0.78], bossGold, metal);
      addAttachedBox(`${prefix}BossRoleAuraRing`, 'LowerTorso', [2.70, 0.08, 1.36], [0, -0.54, -0.02], bossGlow, neon, 'Cylinder');
      addPointLight(core, `${prefix}BossRoleCoreLight`, bossGlow, 12, 1.8);
    };

    const addSecondaryGuardTraitKit = (prefix: string): void => {
      addAttachedBox(`${prefix}GuardBadge`, 'UpperTorso', [0.38, 0.38, 0.12], [0.56, 0.34, -0.66], gold, metal, 'Sphere');
      addAttachedBox(`${prefix}GuardMiniShield`, 'LeftLowerArm', [0.18, 0.92, 0.72], [-0.48, -0.02, -0.20], color3(0.14, 0.20, 0.32), metal);
      addAttachedBox(`${prefix}GuardShieldBoss`, 'LeftLowerArm', [0.22, 0.22, 0.12], [-0.60, -0.02, -0.20], gold, metal, 'Sphere');
      addAttachedBox(`${prefix}GuardBaton`, 'RightHand', [0.14, 0.90, 0.14], [0.28, 0.10, -0.06], darkMetal, metal, 'Cylinder');
    };

    const addSecondaryPoliceTraitKit = (prefix: string): void => {
      const policeBlue = color3(0.03, 0.12, 0.42);
      const brightBlue = color3(0.12, 0.56, 1.0);
      const sirenRed = color3(1.0, 0.08, 0.08);
      addAttachedBox(`${prefix}PoliceCapBrim`, 'Head', [1.62, 0.14, 1.08], [0, 0.42, -0.08], policeBlue, fabric);
      addAttachedBox(`${prefix}PoliceCapCrown`, 'Head', [1.20, 0.34, 0.82], [0, 0.62, 0.02], policeBlue, fabric);
      addAttachedBox(`${prefix}PoliceCapBadge`, 'Head', [0.28, 0.28, 0.08], [0, 0.56, -0.62], gold, metal, 'Sphere');
      addAttachedBox(`${prefix}PoliceChestPlate`, 'UpperTorso', [2.42, 1.34, 1.18], [0, -0.06, -0.04], policeBlue, metal);
      addAttachedBox(`${prefix}PoliceBadge`, 'UpperTorso', [0.42, 0.42, 0.12], [0.58, 0.34, -0.70], gold, metal, 'Sphere');
      addAttachedBox(`${prefix}PoliceRadio`, 'UpperTorso', [0.34, 0.52, 0.16], [-0.58, 0.28, -0.70], darkMetal, metal);
      addAttachedBox(`${prefix}PoliceSirenRed`, 'UpperTorso', [0.32, 0.20, 0.12], [-0.22, 0.62, -0.72], sirenRed, neon);
      addAttachedBox(`${prefix}PoliceSirenBlue`, 'UpperTorso', [0.32, 0.20, 0.12], [0.22, 0.62, -0.72], brightBlue, neon);
      addAttachedBox(`${prefix}PoliceBaton`, 'RightHand', [0.16, 1.02, 0.16], [0.28, 0.08, -0.08], darkMetal, metal, 'Cylinder');
      addAttachedBox(`${prefix}PoliceBootL`, 'LeftLowerLeg', [0.86, 0.42, 0.88], [0, -0.34, -0.02], darkMetal, leatherMat);
      addAttachedBox(`${prefix}PoliceBootR`, 'RightLowerLeg', [0.86, 0.42, 0.88], [0, -0.34, -0.02], darkMetal, leatherMat);
    };

    const addSecondaryPatrolTraitKit = (prefix: string): void => {
      addAttachedBox(`${prefix}PatrolRouteMap`, 'UpperTorso', [0.72, 0.48, 0.10], [-0.58, -0.22, -0.70], color3(0.94, 0.84, 0.56), fabric);
      addAttachedBox(`${prefix}PatrolMapLine`, 'UpperTorso', [0.52, 0.06, 0.06], [-0.58, -0.22, -0.78], color3(0.15, 0.20, 0.28), plastic);
      addAttachedBox(`${prefix}PatrolPack`, 'UpperTorso', [0.92, 0.76, 0.32], [0, -0.04, 0.72], leather, leatherMat);
      addAttachedBox(`${prefix}PatrolBedroll`, 'UpperTorso', [1.02, 0.22, 0.22], [0, 0.52, 0.86], forest, fabric, 'Cylinder');
      const routeLamp = addAttachedBox(`${prefix}PatrolLanternGlow`, 'LeftHand', [0.28, 0.34, 0.22], [-0.18, -0.10, -0.12], color3(1.0, 0.78, 0.22), neon, 'Sphere');
      addAttachedBox(`${prefix}PatrolLanternCase`, 'LeftHand', [0.38, 0.48, 0.30], [-0.18, -0.10, -0.04], accent, metal);
      addPointLight(routeLamp, `${prefix}PatrolLanternLight`, color3(1.0, 0.72, 0.22), 8, 1.3);
    };

    const addSecondaryMageTraitKit = (prefix: string): void => {
      addAttachedBox(`${prefix}MageRuneMedallion`, 'UpperTorso', [0.44, 0.44, 0.12], [0, 0.28, -0.70], arcaneGlow, neon, 'Sphere');
      addAttachedBox(`${prefix}MageShortStaff`, 'RightHand', [0.14, 1.42, 0.14], [0.34, 0.22, -0.04], leather, wood, 'Cylinder');
      const orb = addAttachedBox(`${prefix}MageTraitOrb`, 'RightHand', [0.34, 0.34, 0.34], [0.34, 0.96, -0.04], arcaneGlow, neon, 'Sphere');
      addPointLight(orb, `${prefix}MageTraitLight`, arcaneGlow, 8, 1.4);
    };

    const addSecondaryEnemyTraitKit = (prefix: string): void => {
      const toxic = color3(0.35, 1.0, 0.28);
      addAttachedBox(`${prefix}EnemyBrow`, 'Head', [0.84, 0.12, 0.08], [0, 0.20, -0.64], darkMetal, metal);
      addAttachedBox(`${prefix}EnemyEyeL`, 'Head', [0.14, 0.10, 0.06], [-0.18, 0.06, -0.68], toxic, neon, 'Sphere');
      addAttachedBox(`${prefix}EnemyEyeR`, 'Head', [0.14, 0.10, 0.06], [0.18, 0.06, -0.68], toxic, neon, 'Sphere');
      addAttachedBox(`${prefix}EnemyClawL`, 'LeftHand', [0.18, 0.58, 0.10], [-0.12, -0.18, -0.24], steel, metal);
      addAttachedBox(`${prefix}EnemyClawR`, 'RightHand', [0.18, 0.58, 0.10], [0.12, -0.18, -0.24], steel, metal);
    };

    const addSecondaryCompanionTraitKit = (prefix: string): void => {
      addAttachedBox(`${prefix}CompanionScarf`, 'UpperTorso', [2.12, 0.28, 1.16], [0, 0.48, -0.02], color3(0.85, 0.40, 0.30), fabric);
      addAttachedBox(`${prefix}CompanionSatchel`, 'UpperTorso', [0.76, 0.64, 0.28], [-0.70, -0.20, -0.48], color3(0.42, 0.26, 0.14), leatherMat);
      addAttachedBox(`${prefix}CompanionHeartBadge`, 'UpperTorso', [0.30, 0.30, 0.10], [0.50, 0.28, -0.66], color3(0.96, 0.46, 0.52), neon, 'Sphere');
    };

    const addSecondarySuperheroTraitKit = (prefix: string): void => {
      const heroBlue = color3(0.05, 0.18, 0.78);
      const heroRed = color3(0.90, 0.05, 0.08);
      const heroGold = color3(1.0, 0.78, 0.18);
      const laserCyan = color3(0.25, 0.92, 1.0);
      let cowl: string | undefined;
      if (wantsHeroHeadCover) {
        cowl = addWearableNpcAccessory({
          name: `${prefix}HeroCowlAccessory`,
          bodyPartName: 'Head',
          attachmentName: 'HatAttachment',
          accessoryType: 'Hat',
          size: [1.18, 0.24, 0.82],
          offset: [0, 0.48, 0.04],
          color: heroBlue,
          material: fabric,
          shape: 'Sphere',
        });
      } else {
        const hair = addWearableNpcAccessory({
          name: `${prefix}HeroHairAccessory`,
          bodyPartName: 'Head',
          attachmentName: 'HairAttachment',
          accessoryType: 'Hair',
          size: [1.10, 0.24, 0.74],
          offset: [0, 0.48, 0.02],
          color: color3(0.05, 0.035, 0.025),
          material: fabric,
          shape: 'Sphere',
        });
        addAttachedBox(`${prefix}HeroForeheadCurl`, 'Head', [0.30, 0.42, 0.18], [0.18, 0.40, -0.56], color3(0.035, 0.025, 0.018), fabric, 'Sphere');
        if (hair) addPointLight(hair, `${prefix}HeroHairSoftRim`, laserCyan, 4, 0.25);
      }
      const capeAccessory = addWearableNpcAccessory({
        name: `${prefix}HeroCapeAccessory`,
        bodyPartName: 'UpperTorso',
        attachmentName: 'BodyBackAttachment',
        accessoryType: 'Back',
        size: [2.12, 1.88, 0.16],
        offset: [0, -0.30, 0.84],
        color: heroRed,
        material: fabric,
        shape: 'Block',
      });
      if (cowl) addPointLight(cowl, `${prefix}HeroCowlSoftGlow`, laserCyan, 5, 0.55);
      if (capeAccessory) addAssetParticleEmitter(capeAccessory, `${prefix}HeroCapeSparkEmitter`, { r: 1.0, g: 0.18, b: 0.10 }, 3);
      addAttachedBox(`${prefix}HeroCapeBack`, 'UpperTorso', [2.44, 2.18, 0.14], [0, -0.24, 0.72], heroRed, fabric);
      addAttachedBox(`${prefix}HeroCapeFoldL`, 'UpperTorso', [0.34, 1.92, 0.12], [-0.96, -0.26, 0.78], color3(0.68, 0.02, 0.06), fabric);
      addAttachedBox(`${prefix}HeroCapeFoldR`, 'UpperTorso', [0.34, 1.92, 0.12], [0.96, -0.26, 0.78], color3(0.68, 0.02, 0.06), fabric);
      addAttachedBox(`${prefix}HeroCapeCollar`, 'UpperTorso', [2.28, 0.28, 1.18], [0, 0.54, -0.02], heroRed, fabric);
      addAttachedBox(`${prefix}HeroCapeClaspL`, 'UpperTorso', [0.30, 0.30, 0.12], [-0.58, 0.50, -0.66], heroGold, metal, 'Sphere');
      addAttachedBox(`${prefix}HeroCapeClaspR`, 'UpperTorso', [0.30, 0.30, 0.12], [0.58, 0.50, -0.66], heroGold, metal, 'Sphere');
      addAttachedBox(`${prefix}HeroChestSuit`, 'UpperTorso', [2.40, 1.46, 1.20], [0, -0.04, -0.04], heroBlue, fabric);
      addAttachedBox(`${prefix}HeroChestPecL`, 'UpperTorso', [0.78, 0.38, 0.13], [-0.36, 0.24, -0.84], color3(0.08, 0.26, 0.92), fabric, 'Sphere');
      addAttachedBox(`${prefix}HeroChestPecR`, 'UpperTorso', [0.78, 0.38, 0.13], [0.36, 0.24, -0.84], color3(0.08, 0.26, 0.92), fabric, 'Sphere');
      addAttachedBox(`${prefix}HeroAbLineTop`, 'UpperTorso', [0.66, 0.07, 0.12], [0, -0.04, -0.86], color3(0.02, 0.10, 0.44), fabric);
      addAttachedBox(`${prefix}HeroAbLineMid`, 'UpperTorso', [0.58, 0.07, 0.12], [0, -0.24, -0.86], color3(0.02, 0.10, 0.44), fabric);
      addAttachedBox(`${prefix}HeroAbLineLow`, 'UpperTorso', [0.50, 0.07, 0.12], [0, -0.42, -0.86], color3(0.02, 0.10, 0.44), fabric);
      addAttachedBox(`${prefix}HeroChestVStripeL`, 'UpperTorso', [0.18, 1.08, 0.12], [-0.28, 0.08, -0.80], heroRed, neon);
      addAttachedBox(`${prefix}HeroChestVStripeR`, 'UpperTorso', [0.18, 1.08, 0.12], [0.28, 0.08, -0.80], heroRed, neon);
      addAttachedBox(`${prefix}HeroChestShieldBase`, 'UpperTorso', [0.96, 0.70, 0.14], [0, 0.30, -0.94], heroRed, neon);
      addAttachedBox(`${prefix}HeroChestShieldCore`, 'UpperTorso', [0.68, 0.48, 0.16], [0, 0.30, -1.04], heroGold, neon);
      addAttachedBox(`${prefix}HeroChestShieldGlyphTop`, 'UpperTorso', [0.42, 0.08, 0.18], [0.02, 0.42, -1.12], heroRed, neon);
      addAttachedBox(`${prefix}HeroChestShieldGlyphMid`, 'UpperTorso', [0.42, 0.08, 0.18], [-0.02, 0.30, -1.12], heroRed, neon);
      addAttachedBox(`${prefix}HeroChestShieldGlyphLow`, 'UpperTorso', [0.42, 0.08, 0.18], [0.02, 0.18, -1.12], heroRed, neon);
      addAttachedBox(`${prefix}HeroChestEmblem`, 'UpperTorso', [0.58, 0.58, 0.12], [0, 0.24, -0.72], heroGold, neon, 'Sphere');
      addAttachedBox(`${prefix}HeroEmblemSlash`, 'UpperTorso', [0.18, 0.78, 0.12], [0.08, 0.24, -0.80], heroRed, neon);
      addAttachedBox(`${prefix}HeroBelt`, 'LowerTorso', [2.22, 0.24, 1.14], [0, 0.18, -0.02], heroGold, metal);
      addAttachedBox(`${prefix}HeroBuckle`, 'LowerTorso', [0.42, 0.32, 0.12], [0, 0.18, -0.60], heroRed, neon, 'Sphere');
      if (wantsHeroHeadCover) {
        addAttachedBox(`${prefix}HeroCowlTop`, 'Head', [1.10, 0.18, 0.74], [0, 0.44, 0.02], heroBlue, fabric, 'Sphere');
        addAttachedBox(`${prefix}HeroCowlFinL`, 'Head', [0.14, 0.38, 0.10], [-0.42, 0.62, -0.02], heroGold, metal);
        addAttachedBox(`${prefix}HeroCowlFinR`, 'Head', [0.14, 0.38, 0.10], [0.42, 0.62, -0.02], heroGold, metal);
        addAttachedBox(`${prefix}HeroMask`, 'Head', [1.22, 0.24, 0.10], [0, 0.08, -0.66], heroBlue, fabric);
      }
      const eyeL = addAttachedBox(`${prefix}HeroLaserEyeL`, 'Head', [0.16, 0.12, 0.08], [-0.24, 0.08, -0.74], laserCyan, neon, 'Sphere');
      addAttachedBox(`${prefix}HeroLaserEyeR`, 'Head', [0.16, 0.12, 0.08], [0.24, 0.08, -0.74], laserCyan, neon, 'Sphere');
      addPointLight(eyeL, `${prefix}HeroEyeLaserLight`, laserCyan, 9, 1.45);
      addAttachedBox(`${prefix}HeroShoulderL`, 'LeftUpperArm', [1.22, 0.32, 1.22], [0, 0.44, 0], heroRed, fabric);
      addAttachedBox(`${prefix}HeroShoulderR`, 'RightUpperArm', [1.22, 0.32, 1.22], [0, 0.44, 0], heroRed, fabric);
      addAttachedBox(`${prefix}HeroBicepL`, 'LeftUpperArm', [1.02, 0.54, 1.02], [0, -0.08, -0.02], heroBlue, fabric, 'Sphere');
      addAttachedBox(`${prefix}HeroBicepR`, 'RightUpperArm', [1.02, 0.54, 1.02], [0, -0.08, -0.02], heroBlue, fabric, 'Sphere');
      addAttachedBox(`${prefix}HeroSleeveL`, 'LeftLowerArm', [0.88, 0.62, 0.88], [0, 0.16, 0], heroBlue, fabric);
      addAttachedBox(`${prefix}HeroSleeveR`, 'RightLowerArm', [0.88, 0.62, 0.88], [0, 0.16, 0], heroBlue, fabric);
      addAttachedBox(`${prefix}HeroGloveL`, 'LeftHand', [0.86, 0.46, 0.86], [0, 0.06, 0], heroRed, fabric);
      addAttachedBox(`${prefix}HeroGloveR`, 'RightHand', [0.86, 0.46, 0.86], [0, 0.06, 0], heroRed, fabric);
      addAttachedBox(`${prefix}HeroGauntletGemL`, 'LeftHand', [0.24, 0.24, 0.12], [0, 0.22, -0.42], heroGold, neon, 'Sphere');
      addAttachedBox(`${prefix}HeroGauntletGemR`, 'RightHand', [0.24, 0.24, 0.12], [0, 0.22, -0.42], heroGold, neon, 'Sphere');
      addAttachedBox(`${prefix}HeroLegSuitL`, 'LeftUpperLeg', [0.92, 0.92, 0.92], [0, -0.02, 0], heroBlue, fabric);
      addAttachedBox(`${prefix}HeroLegSuitR`, 'RightUpperLeg', [0.92, 0.92, 0.92], [0, -0.02, 0], heroBlue, fabric);
      addAttachedBox(`${prefix}HeroKneeGuardL`, 'LeftLowerLeg', [0.82, 0.24, 0.82], [0, 0.20, -0.02], heroGold, metal);
      addAttachedBox(`${prefix}HeroKneeGuardR`, 'RightLowerLeg', [0.82, 0.24, 0.82], [0, 0.20, -0.02], heroGold, metal);
      addAttachedBox(`${prefix}HeroBootL`, 'LeftLowerLeg', [0.88, 0.54, 0.90], [0, -0.30, -0.02], heroRed, fabric);
      addAttachedBox(`${prefix}HeroBootR`, 'RightLowerLeg', [0.88, 0.54, 0.90], [0, -0.30, -0.02], heroRed, fabric);
      addAttachedBox(`${prefix}HeroBootStripeL`, 'LeftLowerLeg', [0.90, 0.12, 0.92], [0, -0.02, -0.04], heroGold, metal);
      addAttachedBox(`${prefix}HeroBootStripeR`, 'RightLowerLeg', [0.90, 0.12, 0.92], [0, -0.02, -0.04], heroGold, metal);
      const flightRing = addAttachedBox(`${prefix}HeroFlightAuraRing`, 'LowerTorso', [2.34, 0.08, 1.20], [0, -0.62, -0.02], laserCyan, neon, 'Cylinder');
      addAttachedBox(`${prefix}HeroFlightTrailL`, 'LeftFoot', [0.28, 0.72, 0.28], [0, -0.34, 0], laserCyan, neon, 'Cylinder');
      addAttachedBox(`${prefix}HeroFlightTrailR`, 'RightFoot', [0.28, 0.72, 0.28], [0, -0.34, 0], laserCyan, neon, 'Cylinder');
      addPointLight(flightRing, `${prefix}HeroFlightAuraLight`, laserCyan, 11, 1.5);
    };

    const addSecondaryCelestialTraitKit = (prefix: string): void => {
      const starGold = color3(1.0, 0.82, 0.22);
      const auraBlue = color3(0.42, 0.82, 1.0);
      const auraViolet = color3(0.62, 0.44, 1.0);
      const robeWhite = color3(0.92, 0.94, 1.0);
      addAttachedBox(`${prefix}CelestialHalo`, 'Head', [1.42, 0.08, 1.42], [0, 0.92, 0], starGold, neon, 'Cylinder');
      addAttachedBox(`${prefix}CelestialCrownGem`, 'Head', [0.26, 0.26, 0.10], [0, 0.36, -0.66], auraBlue, neon, 'Sphere');
      const auraRing = addAttachedBox(`${prefix}CelestialAuraRing`, 'LowerTorso', [2.36, 0.08, 1.22], [0, -0.46, -0.02], auraBlue, neon, 'Cylinder');
      addAttachedBox(`${prefix}CelestialOrbitRing`, 'UpperTorso', [2.10, 0.08, 1.08], [0, 0.18, -0.02], auraViolet, neon, 'Cylinder');
      addAttachedBox(`${prefix}CelestialSash`, 'UpperTorso', [0.22, 1.62, 0.10], [0.48, -0.04, -0.68], starGold, fabric);
      addAttachedBox(`${prefix}CelestialRobePanel`, 'UpperTorso', [1.22, 1.28, 0.10], [0, -0.10, -0.70], robeWhite, fabric);
      addAttachedBox(`${prefix}CelestialWingL`, 'UpperTorso', [0.18, 1.16, 0.76], [-1.20, 0.10, 0.54], auraBlue, neon);
      addAttachedBox(`${prefix}CelestialWingR`, 'UpperTorso', [0.18, 1.16, 0.76], [1.20, 0.10, 0.54], auraBlue, neon);
      addAttachedBox(`${prefix}CelestialShoulderOrbL`, 'LeftUpperArm', [0.32, 0.32, 0.32], [0, 0.58, -0.18], auraViolet, neon, 'Sphere');
      addAttachedBox(`${prefix}CelestialShoulderOrbR`, 'RightUpperArm', [0.32, 0.32, 0.32], [0, 0.58, -0.18], auraViolet, neon, 'Sphere');
      addAttachedBox(`${prefix}CelestialStaffStar`, 'RightHand', [0.44, 0.44, 0.12], [0.34, 1.26, -0.04], starGold, neon, 'Sphere');
      addPointLight(auraRing, `${prefix}CelestialAuraLight`, auraBlue, 12, 1.6);
    };

    const addSecondaryNinjaTraitKit = (prefix: string): void => {
      const shadow = color3(0.035, 0.04, 0.055);
      const red = color3(0.70, 0.04, 0.06);
      createRigidAccessory({
        name: `${prefix}NinjaBackScabbardAccessory`,
        bodyPartName: 'UpperTorso',
        attachmentName: 'BodyBackAttachment',
        accessoryType: 'Back',
        size: [0.18, 1.62, 0.14],
        offset: [0.62, 0.14, 0.78],
        color: shadow,
        material: leatherMat,
        shape: 'Cylinder',
      });
      createRigidAccessory({
        name: `${prefix}NinjaSmokeBombAccessory`,
        bodyPartName: 'LowerTorso',
        attachmentName: 'WaistBackAttachment',
        accessoryType: 'Waist',
        size: [0.34, 0.34, 0.34],
        offset: [-0.58, 0.12, 0.54],
        color: color3(0.22, 0.22, 0.26),
        material: metal,
        shape: 'Sphere',
      });
      addAttachedBox(`${prefix}NinjaSash`, 'LowerTorso', [2.20, 0.18, 1.12], [0, 0.20, -0.02], red, fabric);
      addAttachedBox(`${prefix}NinjaKunaiCharm`, 'RightHand', [0.12, 0.62, 0.08], [0.18, -0.02, -0.18], steel, metal);
    };

    const addDetectedSecondaryTraitOverlays = (primary: GeneralNpcArchetype, prefix: string): void => {
      if (isPatrol) addSecondaryPatrolTraitKit(prefix);
      if (primary !== 'quest_giver' && isQuestGiver) addQuestGiverDetails();
      if (primary !== 'merchant' && isMerchant) addSecondaryMerchantTraitKit(prefix);
      if (primary !== 'boss' && isBoss) addSecondaryBossTraitKit(prefix);
      if (primary !== 'guard' && isKnightOrGuard) addSecondaryGuardTraitKit(prefix);
      if (isPolice) addSecondaryPoliceTraitKit(prefix);
      if (primary !== 'mage' && isMage) addSecondaryMageTraitKit(prefix);
      if (primary !== 'enemy' && primary !== 'villain' && isEnemy) addSecondaryEnemyTraitKit(prefix);
      if (primary !== 'companion' && isCompanion) addSecondaryCompanionTraitKit(prefix);
      if (primary !== 'superhero' && isSuperhero) addSecondarySuperheroTraitKit(prefix);
      if (primary !== 'ninja' && isNinja) addSecondaryNinjaTraitKit(prefix);
      if (isCelestial) addSecondaryCelestialTraitKit(prefix);
    };

    const nonHumanRoleKit = (family: NpcVisualFamily): string => {
      if (isBoss) return `${family}_boss`;
      if (isEnemy) return `${family}_enemy`;
      if (isVillain) return `${family}_villain`;
      if (isMerchant) return `${family}_merchant`;
      if (isQuestGiver) return `${family}_quest_giver`;
      if (isKnightOrGuard) return `${family}_guard`;
      return family;
    };

    const addArachnidFamilyTemplate = (): void => {
      const shell = color3(0.055, 0.060, 0.075);
      const chitin = color3(0.11, 0.10, 0.14);
      const purpleGlow = color3(0.62, 0.22, 0.92);
      const venom = color3(0.35, 1.0, 0.32);
      addAttachedBox('ArachnidHunchedBackShell', 'UpperTorso', [2.72, 1.08, 1.40], [0, 0.05, 0.22], chitin, leatherMat, 'Sphere');
      addAttachedBox('ArachnidAbdomenShell', 'UpperTorso', [2.26, 1.38, 1.74], [0, -0.20, 1.18], shell, leatherMat, 'Sphere');
      addAttachedBox('ArachnidAbdomenStripe', 'UpperTorso', [0.32, 1.12, 0.16], [0, -0.18, 0.34], purpleGlow, neon);
      for (const side of [-1, 1] as const) {
        const sideName = side < 0 ? 'L' : 'R';
        for (let i = 0; i < 4; i += 1) {
          const y = 0.56 - i * 0.26;
          const z = 0.42 + i * 0.18;
          addAttachedBox(`ArachnidBackLeg${sideName}${i + 1}Upper`, 'UpperTorso', [1.22, 0.18, 0.20], [side * (1.08 + i * 0.10), y, z], shell, metal);
          addAttachedBox(`ArachnidBackLeg${sideName}${i + 1}Lower`, 'UpperTorso', [0.22, 1.08, 0.18], [side * (1.78 + i * 0.13), y - 0.42, z + 0.08], shell, metal);
        }
      }
      addAttachedBox('ArachnidMandibleL', 'Head', [0.18, 0.54, 0.12], [-0.34, -0.34, -0.64], venom, metal);
      addAttachedBox('ArachnidMandibleR', 'Head', [0.18, 0.54, 0.12], [0.34, -0.34, -0.64], venom, metal);
      for (const [name, x, y] of [
        ['ArachnidEyeTopL', -0.32, 0.20],
        ['ArachnidEyeTopR', 0.32, 0.20],
        ['ArachnidEyeMidL', -0.18, 0.04],
        ['ArachnidEyeMidR', 0.18, 0.04],
        ['ArachnidEyeLowL', -0.42, -0.12],
        ['ArachnidEyeLowR', 0.42, -0.12],
      ] as const) {
        const eye = addAttachedBox(name, 'Head', [0.16, 0.16, 0.07], [x, y, -0.72], purpleGlow, neon, 'Sphere');
        if (name === 'ArachnidEyeTopL') addPointLight(eye, 'ArachnidEyeClusterLight', purpleGlow, 9, 1.4);
      }
      addAttachedBox('ArachnidWebSpinnerL', 'UpperTorso', [0.24, 0.24, 0.48], [-0.34, -0.76, 1.92], venom, neon, 'Sphere');
      addAttachedBox('ArachnidWebSpinnerR', 'UpperTorso', [0.24, 0.24, 0.48], [0.34, -0.76, 1.92], venom, neon, 'Sphere');
      addAttachedBox('ArachnidWebSigil', 'UpperTorso', [1.16, 0.08, 0.10], [0, 0.38, -0.76], purpleGlow, neon);
      addDetectedSecondaryTraitOverlays('arachnid', 'Arachnid');
      addUniversalRoastKit('Arachnid');
      recordNpcVisualFamilySignature('ArachnidAbdomenShell', 'ArachnidBackLegL1Upper', 'ArachnidBackLegR1Upper', 'ArachnidMandibleL', 'ArachnidEyeTopL', 'ArachnidWebSpinnerL');
      addGeneralNpcVisualConfigMarker('arachnid', nonHumanRoleKit('arachnid'), ['enemy'], [
        'arachnid_segmented_legs',
        'arachnid_abdomen_shell',
        'arachnid_mandibles',
        'multi_eye_cluster',
        'web_spinner',
      ]);
    };

    const addBruteFamilyTemplate = (): void => {
      const swamp = /swamp|bog|marsh|болот|трясин/.test(text);
      const skin = swamp ? color3(0.32, 0.48, 0.22) : color3(0.50, 0.38, 0.28);
      const scar = color3(0.88, 0.18, 0.12);
      addAttachedBox('BruteThickNeck', 'UpperTorso', [1.28, 0.58, 1.04], [0, 0.58, -0.02], skin, leatherMat, 'Sphere');
      addAttachedBox('BruteChestBulk', 'UpperTorso', [2.86, 1.62, 1.38], [0, -0.08, -0.04], skin, leatherMat, 'Sphere');
      addAttachedBox('BruteBellyPlate', 'LowerTorso', [2.60, 0.90, 1.32], [0, -0.10, -0.04], skin, leatherMat, 'Sphere');
      addAttachedBox('BruteShoulderMassL', 'LeftUpperArm', [1.58, 0.72, 1.46], [0, 0.36, 0], skin, leatherMat, 'Sphere');
      addAttachedBox('BruteShoulderMassR', 'RightUpperArm', [1.58, 0.72, 1.46], [0, 0.36, 0], skin, leatherMat, 'Sphere');
      addAttachedBox('BruteForearmClubL', 'LeftLowerArm', [1.22, 1.08, 1.14], [0, -0.08, -0.02], skin, leatherMat, 'Sphere');
      addAttachedBox('BruteForearmClubR', 'RightLowerArm', [1.22, 1.08, 1.14], [0, -0.08, -0.02], skin, leatherMat, 'Sphere');
      addAttachedBox('BruteHeavyFistL', 'LeftHand', [1.12, 0.74, 1.08], [0, -0.08, -0.04], skin, leatherMat, 'Sphere');
      addAttachedBox('BruteHeavyFistR', 'RightHand', [1.12, 0.74, 1.08], [0, -0.08, -0.04], skin, leatherMat, 'Sphere');
      addAttachedBox('BruteTuskL', 'Head', [0.16, 0.48, 0.12], [-0.26, -0.28, -0.68], color3(0.92, 0.88, 0.70), plastic);
      addAttachedBox('BruteTuskR', 'Head', [0.16, 0.48, 0.12], [0.26, -0.28, -0.68], color3(0.92, 0.88, 0.70), plastic);
      addAttachedBox('BruteScarSlash', 'UpperTorso', [0.18, 1.18, 0.12], [-0.32, 0.04, -0.84], scar, neon);
      addAttachedBox('BruteBrokenBelt', 'LowerTorso', [2.36, 0.24, 1.12], [0, 0.16, -0.02], leather, leatherMat);
      addDetectedSecondaryTraitOverlays('brute', 'Brute');
      addUniversalRoastKit('Brute');
      recordNpcVisualFamilySignature('BruteChestBulk', 'BruteForearmClubL', 'BruteForearmClubR', 'BruteHeavyFistL', 'BruteTuskL', 'BruteThickNeck');
      addGeneralNpcVisualConfigMarker('brute', nonHumanRoleKit('brute'), ['enemy'], [
        'brute_body_bulk',
        'oversized_forearms',
        'heavy_fists',
        'tusks',
        'scarred_skin',
      ]);
    };

    const addWingedFamilyTemplate = (): void => {
      const hide = color3(0.18, 0.06, 0.08);
      const membrane = color3(0.45, 0.04, 0.12);
      const ember = color3(1.0, 0.22, 0.06);
      addAttachedBox('WingedHornL', 'Head', [0.20, 0.68, 0.18], [-0.44, 0.52, -0.06], darkMetal, metal);
      addAttachedBox('WingedHornR', 'Head', [0.20, 0.68, 0.18], [0.44, 0.52, -0.06], darkMetal, metal);
      addAttachedBox('WingedBackWingL', 'UpperTorso', [0.22, 2.10, 1.46], [-1.22, 0.18, 0.72], membrane, fabric);
      addAttachedBox('WingedBackWingR', 'UpperTorso', [0.22, 2.10, 1.46], [1.22, 0.18, 0.72], membrane, fabric);
      addAttachedBox('WingedWingBoneL', 'UpperTorso', [0.18, 2.18, 0.16], [-0.76, 0.20, 0.80], darkMetal, metal);
      addAttachedBox('WingedWingBoneR', 'UpperTorso', [0.18, 2.18, 0.16], [0.76, 0.20, 0.80], darkMetal, metal);
      addAttachedBox('WingedTailBase', 'LowerTorso', [0.38, 0.38, 1.36], [0, -0.10, 0.86], hide, leatherMat, 'Cylinder');
      addAttachedBox('WingedTailSpike', 'LowerTorso', [0.36, 0.36, 0.36], [0, -0.20, 1.62], ember, neon, 'Sphere');
      addAttachedBox('WingedChestRune', 'UpperTorso', [0.70, 0.48, 0.12], [0, 0.18, -0.84], ember, neon, 'Sphere');
      addAttachedBox('WingedClawL', 'LeftHand', [0.20, 0.74, 0.12], [-0.16, -0.24, -0.26], darkMetal, metal);
      addAttachedBox('WingedClawR', 'RightHand', [0.20, 0.74, 0.12], [0.16, -0.24, -0.26], darkMetal, metal);
      addDetectedSecondaryTraitOverlays('winged', 'Winged');
      addUniversalRoastKit('Winged');
      recordNpcVisualFamilySignature('WingedBackWingL', 'WingedBackWingR', 'WingedHornL', 'WingedTailBase', 'WingedClawL', 'WingedChestRune');
      addGeneralNpcVisualConfigMarker('winged', nonHumanRoleKit('winged'), ['enemy'], [
        'winged_back_wings',
        'horns',
        'tail_spike',
        'claws',
        'demon_rune',
      ]);
    };

    const addGolemFamilyTemplate = (): void => {
      const rock = /crystal|кристалл/.test(text) ? color3(0.34, 0.50, 0.64) : color3(0.34, 0.32, 0.30);
      const crystal = /crystal|кристалл|ice|лед/.test(text) ? color3(0.42, 0.90, 1.0) : color3(1.0, 0.52, 0.16);
      addAttachedBox('GolemBoulderChest', 'UpperTorso', [2.76, 1.56, 1.38], [0, -0.06, -0.02], rock, slate, 'Sphere');
      addAttachedBox('GolemCoreCrystal', 'UpperTorso', [0.62, 0.62, 0.18], [0, 0.14, -0.88], crystal, neon, 'Sphere');
      addAttachedBox('GolemHeadBoulder', 'Head', [1.72, 0.78, 1.10], [0, 0.04, -0.02], rock, slate, 'Sphere');
      addAttachedBox('GolemShoulderChunkL', 'LeftUpperArm', [1.46, 0.62, 1.34], [0, 0.42, 0], rock, slate, 'Sphere');
      addAttachedBox('GolemShoulderChunkR', 'RightUpperArm', [1.22, 0.82, 1.14], [0, 0.36, 0], rock, slate, 'Sphere');
      addAttachedBox('GolemFistBoulderL', 'LeftHand', [1.08, 0.82, 1.02], [0, -0.06, -0.02], rock, slate, 'Sphere');
      addAttachedBox('GolemFistBoulderR', 'RightHand', [1.24, 0.72, 1.18], [0, -0.08, -0.02], rock, slate, 'Sphere');
      addAttachedBox('GolemKneeRockL', 'LeftLowerLeg', [0.94, 0.36, 0.90], [0, 0.18, -0.04], rock, slate, 'Sphere');
      addAttachedBox('GolemKneeRockR', 'RightLowerLeg', [0.82, 0.44, 0.84], [0, 0.16, -0.04], rock, slate, 'Sphere');
      addAttachedBox('GolemCrackTop', 'UpperTorso', [0.90, 0.08, 0.12], [0, 0.38, -0.92], crystal, neon);
      addAttachedBox('GolemCrackMid', 'UpperTorso', [0.66, 0.08, 0.12], [0.12, 0.12, -0.92], crystal, neon);
      addAttachedBox('GolemBackShard', 'UpperTorso', [0.42, 1.18, 0.22], [0, 0.48, 0.82], crystal, neon);
      addDetectedSecondaryTraitOverlays('golem', 'Golem');
      addUniversalRoastKit('Golem');
      recordNpcVisualFamilySignature('GolemBoulderChest', 'GolemCoreCrystal', 'GolemHeadBoulder', 'GolemShoulderChunkL', 'GolemFistBoulderR', 'GolemBackShard');
      addGeneralNpcVisualConfigMarker('golem', nonHumanRoleKit('golem'), ['enemy'], [
        'golem_boulder_body',
        'asymmetric_rock_chunks',
        'glowing_core',
        'surface_cracks',
        'back_crystal',
      ]);
    };

    const addBeastFamilyTemplate = (): void => {
      const fur = color3(0.34, 0.20, 0.10);
      const mane = color3(0.16, 0.10, 0.06);
      const claw = color3(0.88, 0.84, 0.68);
      addAttachedBox('BeastEarL', 'Head', [0.28, 0.64, 0.18], [-0.52, 0.42, -0.02], fur, fabric);
      addAttachedBox('BeastEarR', 'Head', [0.28, 0.64, 0.18], [0.52, 0.42, -0.02], fur, fabric);
      addAttachedBox('BeastSnout', 'Head', [0.70, 0.34, 0.34], [0, -0.08, -0.78], fur, fabric, 'Sphere');
      addAttachedBox('BeastNose', 'Head', [0.24, 0.16, 0.08], [0, -0.06, -0.98], darkMetal, plastic, 'Sphere');
      addAttachedBox('BeastManeBack', 'UpperTorso', [1.40, 1.50, 0.32], [0, 0.20, 0.76], mane, fabric);
      addAttachedBox('BeastChestFur', 'UpperTorso', [1.52, 1.12, 0.12], [0, -0.04, -0.78], mane, fabric);
      addAttachedBox('BeastTailBase', 'LowerTorso', [0.34, 0.34, 1.42], [0, -0.08, 0.86], fur, fabric, 'Cylinder');
      addAttachedBox('BeastTailTip', 'LowerTorso', [0.46, 0.46, 0.46], [0, -0.12, 1.58], mane, fabric, 'Sphere');
      addAttachedBox('BeastClawL', 'LeftHand', [0.20, 0.68, 0.12], [-0.16, -0.20, -0.26], claw, plastic);
      addAttachedBox('BeastClawR', 'RightHand', [0.20, 0.68, 0.12], [0.16, -0.20, -0.26], claw, plastic);
      addAttachedBox('BeastPawL', 'LeftFoot', [1.04, 0.24, 1.18], [0, -0.04, -0.18], fur, fabric, 'Sphere');
      addAttachedBox('BeastPawR', 'RightFoot', [1.04, 0.24, 1.18], [0, -0.04, -0.18], fur, fabric, 'Sphere');
      addDetectedSecondaryTraitOverlays('beast', 'Beast');
      addUniversalRoastKit('Beast');
      recordNpcVisualFamilySignature('BeastEarL', 'BeastSnout', 'BeastManeBack', 'BeastTailBase', 'BeastClawL', 'BeastPawL');
      addGeneralNpcVisualConfigMarker('beast', nonHumanRoleKit('beast'), ['enemy'], [
        'beast_ears',
        'snout',
        'tail',
        'mane',
        'claws',
        'paws',
      ]);
    };

    const addPlantFungalFamilyTemplate = (): void => {
      const capRed = /red|красн|мухомор/.test(text) ? color3(0.86, 0.08, 0.08) : color3(0.48, 0.18, 0.58);
      const stem = color3(0.72, 0.66, 0.48);
      const leaf = color3(0.18, 0.54, 0.20);
      const spore = color3(0.58, 1.0, 0.46);
      addAttachedBox('PlantFungalMushroomCap', 'Head', [2.34, 0.42, 1.52], [0, 0.44, 0.02], capRed, fabric, 'Sphere');
      addAttachedBox('PlantFungalCapSpotL', 'Head', [0.24, 0.10, 0.18], [-0.48, 0.56, -0.48], stem, fabric, 'Sphere');
      addAttachedBox('PlantFungalCapSpotR', 'Head', [0.24, 0.10, 0.18], [0.42, 0.56, -0.44], stem, fabric, 'Sphere');
      addAttachedBox('PlantFungalStemCollar', 'UpperTorso', [2.12, 0.28, 1.14], [0, 0.52, -0.02], stem, fabric, 'Cylinder');
      addAttachedBox('PlantFungalLeafShoulderL', 'LeftUpperArm', [1.20, 0.22, 1.02], [0, 0.48, -0.02], leaf, grass);
      addAttachedBox('PlantFungalLeafShoulderR', 'RightUpperArm', [1.20, 0.22, 1.02], [0, 0.48, -0.02], leaf, grass);
      addAttachedBox('PlantFungalVineWrapTorso', 'UpperTorso', [0.18, 1.62, 0.12], [-0.46, -0.04, -0.78], leaf, grass);
      addAttachedBox('PlantFungalVineWrapArm', 'RightLowerArm', [0.18, 0.92, 0.12], [0.30, -0.04, -0.36], leaf, grass);
      const sporeOrb = addAttachedBox('PlantFungalSporeGlow', 'LeftHand', [0.36, 0.36, 0.36], [-0.18, -0.08, -0.16], spore, neon, 'Sphere');
      addAttachedBox('PlantFungalBackSporePod', 'UpperTorso', [0.74, 0.74, 0.36], [0.64, 0.00, 0.78], capRed, fabric, 'Sphere');
      addAttachedBox('PlantFungalBootRootsL', 'LeftLowerLeg', [0.88, 0.28, 0.88], [0, -0.36, -0.02], leaf, grass);
      addAttachedBox('PlantFungalBootRootsR', 'RightLowerLeg', [0.88, 0.28, 0.88], [0, -0.36, -0.02], leaf, grass);
      addPointLight(sporeOrb, 'PlantFungalSporeLight', spore, 9, 1.4);
      addDetectedSecondaryTraitOverlays('plant_fungal', 'PlantFungal');
      addUniversalRoastKit('PlantFungal');
      recordNpcVisualFamilySignature('PlantFungalMushroomCap', 'PlantFungalStemCollar', 'PlantFungalLeafShoulderL', 'PlantFungalVineWrapTorso', 'PlantFungalSporeGlow', 'PlantFungalBackSporePod');
      addGeneralNpcVisualConfigMarker('plant_fungal', nonHumanRoleKit('plant_fungal'), [], [
        'mushroom_cap',
        'vine_wraps',
        'leaf_shoulders',
        'spore_glow',
        'root_boots',
      ]);
    };

    const addElementalFamilyTemplate = (): void => {
      const isIce = /ice|frost|snow|лед|мороз|снеж/.test(text);
      const isStorm = /storm|lightning|thunder|молни|гроз|шторм/.test(text);
      const body = isIce ? color3(0.46, 0.78, 0.96) : isStorm ? color3(0.20, 0.22, 0.40) : magmaDark;
      const glow = isIce ? color3(0.72, 0.96, 1.0) : isStorm ? color3(0.55, 0.72, 1.0) : flameOrange;
      addAttachedBox('ElementalCoreBody', 'UpperTorso', [2.48, 1.46, 1.22], [0, -0.04, -0.02], body, isIce ? { enumName: 'Ice', value: 1536 } : slate);
      const core = addAttachedBox('ElementalChestCore', 'UpperTorso', [0.62, 0.62, 0.16], [0, 0.16, -0.86], glow, neon, 'Sphere');
      addAttachedBox('ElementalCrownShardL', 'Head', [0.22, 0.82, 0.18], [-0.34, 0.62, -0.04], glow, neon);
      addAttachedBox('ElementalCrownShardR', 'Head', [0.22, 0.82, 0.18], [0.34, 0.62, -0.04], glow, neon);
      addAttachedBox('ElementalShoulderFlareL', 'LeftUpperArm', [1.12, 0.34, 1.12], [0, 0.50, 0], glow, neon, 'Cylinder');
      addAttachedBox('ElementalShoulderFlareR', 'RightUpperArm', [1.12, 0.34, 1.12], [0, 0.50, 0], glow, neon, 'Cylinder');
      addAttachedBox('ElementalHandAuraL', 'LeftHand', [0.52, 0.52, 0.52], [0, -0.04, -0.08], glow, neon, 'Sphere');
      addAttachedBox('ElementalHandAuraR', 'RightHand', [0.52, 0.52, 0.52], [0, -0.04, -0.08], glow, neon, 'Sphere');
      addAttachedBox('ElementalFootTrailL', 'LeftFoot', [0.38, 0.66, 0.38], [0, -0.28, 0], glow, neon, 'Cylinder');
      addAttachedBox('ElementalFootTrailR', 'RightFoot', [0.38, 0.66, 0.38], [0, -0.28, 0], glow, neon, 'Cylinder');
      addPointLight(core, 'ElementalCoreLight', glow, 13, 1.8);
      addDetectedSecondaryTraitOverlays('elemental', 'Elemental');
      addUniversalRoastKit('Elemental');
      recordNpcVisualFamilySignature('ElementalCoreBody', 'ElementalChestCore', 'ElementalCrownShardL', 'ElementalShoulderFlareL', 'ElementalHandAuraL', 'ElementalFootTrailL');
      addGeneralNpcVisualConfigMarker('elemental', nonHumanRoleKit('elemental'), ['enemy'], [
        'elemental_body',
        'glowing_core',
        'crown_shards',
        'hand_auras',
        'foot_trails',
      ]);
    };

    const addRobotTemplate = (): void => {
      const chrome = color3(0.48, 0.54, 0.58);
      const darkPanel = color3(0.05, 0.07, 0.09);
      const cyan = color3(0.18, 0.86, 1.0);
      addAttachedBox('RobotHelmetShell', 'Head', [1.78, 0.92, 1.14], [0, 0.08, 0], chrome, metal);
      addAttachedBox('RobotVisor', 'Head', [1.18, 0.22, 0.08], [0, 0.08, -0.64], cyan, neon);
      addAttachedBox('RobotAntennaStem', 'Head', [0.10, 0.78, 0.10], [0.46, 0.82, 0.02], chrome, metal, 'Cylinder');
      const antenna = addAttachedBox('RobotAntennaGlow', 'Head', [0.22, 0.22, 0.22], [0.46, 1.22, 0.02], cyan, neon, 'Sphere');
      addPointLight(antenna, 'RobotAntennaLight', cyan, 7, 1.2);
      addAttachedBox('RobotChestArmor', 'UpperTorso', [2.36, 1.42, 1.20], [0, -0.04, -0.04], chrome, metal);
      addAttachedBox('RobotChestScreen', 'UpperTorso', [1.10, 0.56, 0.10], [0, 0.02, -0.70], darkPanel, plastic);
      const core = addAttachedBox('RobotCoreLight', 'UpperTorso', [0.34, 0.34, 0.08], [0, 0.02, -0.78], cyan, neon, 'Sphere');
      addPointLight(core, 'RobotCorePointLight', cyan, 9, 1.4);
      addAttachedBox('RobotShoulderL', 'LeftUpperArm', [1.28, 0.38, 1.28], [0, 0.44, 0], chrome, metal);
      addAttachedBox('RobotShoulderR', 'RightUpperArm', [1.28, 0.38, 1.28], [0, 0.44, 0], chrome, metal);
      addAttachedBox('RobotWristCannonL', 'LeftLowerArm', [0.74, 0.30, 0.74], [0, -0.18, -0.28], darkPanel, metal);
      addAttachedBox('RobotWristCannonR', 'RightLowerArm', [0.74, 0.30, 0.74], [0, -0.18, -0.28], darkPanel, metal);
      addAttachedBox('RobotKneePanelL', 'LeftLowerLeg', [0.78, 0.24, 0.12], [0, 0.16, -0.46], chrome, metal);
      addAttachedBox('RobotKneePanelR', 'RightLowerLeg', [0.78, 0.24, 0.12], [0, 0.16, -0.46], chrome, metal);
      addAttachedBox('RobotBatteryPack', 'UpperTorso', [1.02, 0.86, 0.34], [0, -0.02, 0.72], darkPanel, metal);
      addDetectedSecondaryTraitOverlays('robot', 'Robot');
      addUniversalRoastKit('Robot');
      addGeneralNpcVisualConfigMarker('robot', 'robot', ['robot'], [
        'robot_helmet',
        'visor',
        'antenna',
        'chest_screen',
        'wrist_cannons',
      ]);
    };

    const addPirateTemplate = (): void => {
      const coatRed = color3(0.46, 0.08, 0.10);
      const black = color3(0.04, 0.04, 0.05);
      const brass = color3(0.88, 0.64, 0.24);
      const boneWhite = color3(0.92, 0.86, 0.72);
      addAttachedBox('PirateTricornBrim', 'Head', [2.22, 0.16, 1.46], [0, 0.36, 0], black, fabric);
      addAttachedBox('PirateTricornCrown', 'Head', [1.38, 0.46, 0.96], [0, 0.62, 0.02], black, fabric);
      addAttachedBox('PirateHatFeather', 'Head', [0.18, 0.76, 0.10], [0.62, 0.92, -0.10], color3(0.95, 0.18, 0.12), fabric, 'Cylinder');
      addAttachedBox('PirateEyePatch', 'Head', [0.42, 0.24, 0.06], [-0.22, 0.06, -0.66], black, leatherMat);
      addAttachedBox('PirateCoat', 'UpperTorso', [2.34, 1.48, 1.20], [0, -0.08, -0.04], coatRed, fabric);
      addAttachedBox('PirateVest', 'UpperTorso', [1.48, 1.06, 0.12], [0, -0.08, -0.70], color3(0.18, 0.10, 0.06), leatherMat);
      addAttachedBox('PirateSash', 'LowerTorso', [2.20, 0.28, 1.14], [0, 0.22, -0.02], brass, fabric);
      addAttachedBox('PirateBuckle', 'LowerTorso', [0.42, 0.30, 0.12], [0, 0.22, -0.60], brass, metal);
      addAttachedBox('PirateShoulderL', 'LeftUpperArm', [1.10, 0.28, 1.10], [0, 0.44, 0], brass, metal);
      addAttachedBox('PirateCutlassBlade', 'RightHand', [0.14, 1.52, 0.10], [0.34, 0.40, -0.04], steel, metal);
      addAttachedBox('PirateCutlassGuard', 'RightHand', [0.52, 0.14, 0.14], [0.34, -0.18, -0.04], brass, metal);
      addAttachedBox('PirateMapScroll', 'LeftHand', [0.36, 0.76, 0.36], [-0.16, -0.08, -0.02], boneWhite, fabric, 'Cylinder');
      addAttachedBox('PirateBootL', 'LeftLowerLeg', [0.86, 0.48, 0.88], [0, -0.34, -0.02], black, leatherMat);
      addAttachedBox('PirateBootR', 'RightLowerLeg', [0.86, 0.48, 0.88], [0, -0.34, -0.02], black, leatherMat);
      addDetectedSecondaryTraitOverlays('pirate', 'Pirate');
      addUniversalRoastKit('Pirate');
      addGeneralNpcVisualConfigMarker('pirate', 'pirate', ['pirate'], [
        'tricorn_hat',
        'eyepatch',
        'captain_coat',
        'cutlass',
        'treasure_map',
      ]);
    };

    const addNinjaTemplate = (): void => {
      const shadow = color3(0.035, 0.04, 0.055);
      const cloth = color3(0.08, 0.10, 0.13);
      const red = color3(0.70, 0.04, 0.06);
      addAttachedBox('NinjaHood', 'Head', [1.78, 0.88, 1.12], [0, 0.18, 0.05], shadow, fabric);
      addAttachedBox('NinjaFaceMask', 'Head', [1.30, 0.32, 0.10], [0, -0.08, -0.62], shadow, fabric);
      addAttachedBox('NinjaEyeSlit', 'Head', [0.96, 0.12, 0.06], [0, 0.10, -0.68], red, neon);
      addAttachedBox('NinjaWrapTorso', 'UpperTorso', [2.26, 1.42, 1.18], [0, -0.06, -0.04], cloth, fabric);
      addAttachedBox('NinjaChestStrap', 'UpperTorso', [0.22, 1.62, 0.10], [-0.42, -0.02, -0.70], red, fabric);
      addAttachedBox('NinjaBelt', 'LowerTorso', [2.20, 0.20, 1.12], [0, 0.18, -0.02], red, fabric);
      addAttachedBox('NinjaBackSword', 'UpperTorso', [0.14, 1.72, 0.12], [0.56, 0.10, 0.76], steel, metal, 'Cylinder');
      addAttachedBox('NinjaBackSwordHandle', 'UpperTorso', [0.24, 0.56, 0.16], [0.56, 0.92, 0.76], shadow, leatherMat);
      addAttachedBox('NinjaKunaiL', 'LeftHand', [0.14, 0.72, 0.10], [-0.18, -0.06, -0.16], steel, metal);
      addAttachedBox('NinjaKunaiR', 'RightHand', [0.14, 0.72, 0.10], [0.18, -0.06, -0.16], steel, metal);
      addAttachedBox('NinjaSmokeBomb', 'LeftLowerArm', [0.30, 0.30, 0.30], [0, -0.28, -0.26], color3(0.22, 0.22, 0.26), metal, 'Sphere');
      addAttachedBox('NinjaBootL', 'LeftLowerLeg', [0.82, 0.42, 0.84], [0, -0.34, -0.02], shadow, fabric);
      addAttachedBox('NinjaBootR', 'RightLowerLeg', [0.82, 0.42, 0.84], [0, -0.34, -0.02], shadow, fabric);
      addDetectedSecondaryTraitOverlays('ninja', 'Ninja');
      addUniversalRoastKit('Ninja');
      addGeneralNpcVisualConfigMarker('ninja', 'ninja', ['ninja'], [
        'hood',
        'face_mask',
        'back_sword',
        'kunai',
        'smoke_bomb',
      ]);
    };

    const addUndeadTemplate = (): void => {
      const bone = color3(0.88, 0.86, 0.74);
      const decay = color3(0.28, 0.46, 0.26);
      const rag = color3(0.18, 0.14, 0.10);
      const sickGlow = color3(0.40, 1.0, 0.30);
      addAttachedBox('UndeadSkullMask', 'Head', [1.22, 0.60, 0.14], [0, -0.04, -0.62], bone, plastic);
      const eyeL = addAttachedBox('UndeadEyeL', 'Head', [0.16, 0.14, 0.08], [-0.22, 0.06, -0.72], sickGlow, neon, 'Sphere');
      addAttachedBox('UndeadEyeR', 'Head', [0.16, 0.14, 0.08], [0.22, 0.06, -0.72], sickGlow, neon, 'Sphere');
      addPointLight(eyeL, 'UndeadEyeLight', sickGlow, 8, 1.4);
      addAttachedBox('UndeadRibCage', 'UpperTorso', [1.58, 1.06, 0.12], [0, 0.02, -0.70], bone, plastic);
      addAttachedBox('UndeadRagTunic', 'UpperTorso', [2.26, 1.44, 1.18], [0, -0.08, -0.04], rag, fabric);
      addAttachedBox('UndeadRotPatch', 'UpperTorso', [0.72, 0.52, 0.10], [0.40, -0.12, -0.74], decay, fabric);
      addAttachedBox('UndeadSpineBack', 'UpperTorso', [0.22, 1.28, 0.12], [0, 0.06, 0.70], bone, plastic);
      addAttachedBox('UndeadBoneArmL', 'LeftLowerArm', [0.42, 0.82, 0.42], [0, -0.02, -0.02], bone, plastic);
      addAttachedBox('UndeadBoneArmR', 'RightLowerArm', [0.42, 0.82, 0.42], [0, -0.02, -0.02], bone, plastic);
      addAttachedBox('UndeadClawL', 'LeftHand', [0.18, 0.62, 0.10], [-0.12, -0.18, -0.24], bone, plastic);
      addAttachedBox('UndeadClawR', 'RightHand', [0.18, 0.62, 0.10], [0.12, -0.18, -0.24], bone, plastic);
      addAttachedBox('UndeadShackle', 'RightLowerLeg', [0.88, 0.16, 0.88], [0, -0.16, 0], darkMetal, metal, 'Cylinder');
      addDetectedSecondaryTraitOverlays('undead', 'Undead');
      addUniversalRoastKit('Undead');
      addGeneralNpcVisualConfigMarker('undead', 'undead', ['undead', 'enemy'], [
        'skull_mask',
        'glowing_eyes',
        'rib_cage',
        'rag_tunic',
        'bone_claws',
      ]);
    };

    const addUniversalRoastKit = (prefix: string): void => {
      if (!isRoastNpcMode) return;
      const isGymBroRoast = prefix === 'GymBro';
      const roastPink = color3(1.0, 0.18, 0.48);
      const roastGold = color3(1.0, 0.74, 0.18);
      const roastDark = color3(0.04, 0.04, 0.055);
      const roastAccent = isGymBroRoast ? color3(0.16, 0.42, 0.92) : roastPink;
      const roastBadge = isGymBroRoast ? color3(0.62, 0.64, 0.68) : roastGold;
      const speechSize: [number, number, number] = isGymBroRoast ? [0.70, 0.38, 0.10] : [0.98, 0.60, 0.10];
      const speechOffset: [number, number, number] = isGymBroRoast ? [-0.44, 0.02, -0.18] : [-0.34, 0.10, -0.18];
      addAttachedBox(`${prefix}RoastShadesFrame`, 'Head', [1.28, 0.28, 0.10], [0, 0.08, -0.68], roastDark, plastic);
      addAttachedBox(`${prefix}RoastShadesLensL`, 'Head', [0.48, 0.22, 0.06], [-0.30, 0.08, -0.73], roastAccent, neon);
      addAttachedBox(`${prefix}RoastShadesLensR`, 'Head', [0.48, 0.22, 0.06], [0.30, 0.08, -0.73], roastAccent, neon);
      addAttachedBox(`${prefix}RoastBadge`, 'UpperTorso', [0.42, 0.42, 0.12], [-0.58, 0.34, -0.66], roastBadge, neon, 'Sphere');
      addAttachedBox(`${prefix}RoastMicHandle`, 'RightHand', [0.16, 0.76, 0.16], [0.26, 0.08, -0.04], roastDark, metal, 'Cylinder');
      addAttachedBox(`${prefix}RoastMicHead`, 'RightHand', [0.38, 0.34, 0.38], [0.26, 0.54, -0.04], roastAccent, neon, 'Sphere');
      addAttachedBox(`${prefix}RoastSpeechBoard`, 'LeftHand', speechSize, speechOffset, roastDark, plastic);
      addAttachedBox(`${prefix}RoastSpeechLine1`, 'LeftHand', [0.62, 0.08, 0.06], [speechOffset[0], speechOffset[1] + 0.12, -0.25], roastBadge, neon);
      addAttachedBox(`${prefix}RoastSpeechLine2`, 'LeftHand', [0.46, 0.08, 0.06], [speechOffset[0], speechOffset[1] - 0.08, -0.25], roastAccent, neon);
      const stageGlow = addAttachedBox(`${prefix}RoastStageGlow`, 'LowerTorso', [2.42, 0.10, 1.28], [0, -0.52, -0.02], roastAccent, neon, 'Cylinder');
      addPointLight(stageGlow, `${prefix}RoastStageLight`, roastAccent, 9, 1.5);
    };

    type NpcCatalogAccessoryId =
      | 'gnome_body_silhouette'
      | 'gnome_identity_face'
      | 'gnome_cone_cap'
      | 'gnome_miner_helmet'
      | 'gnome_guard_helmet'
      | 'gnome_outfit_earthy'
      | 'gnome_tool_pickaxe'
      | 'gnome_lantern'
      | 'gnome_patrol_kit'
      | 'gnome_guard_kit'
      | 'gnome_patrol_guard_kit'
      | 'gnome_miner_kit'
      | 'gnome_mage_kit'
      | 'gnome_enemy_kit'
      | 'gnome_glowing_eyes'
      | 'gnome_quest_kit'
      | 'gnome_roast_kit';

    type NpcCatalogTraitKit = 'patrol' | 'mage' | 'enemy' | 'glowing_eyes' | 'quest' | 'roast';

    interface NpcVisualConfig {
      archetype: 'gnome';
      mode: NpcVisualMode;
      bodyPreset: 'short_wide';
      palette: 'forest_earth' | 'miner_guard' | 'dark_arcane' | 'roast_stage';
      roleKit: 'patrol' | 'guard' | 'patrol_guard' | 'miner_guard' | 'miner' | 'mage' | 'quest' | 'enemy' | 'mage_enemy' | 'roast' | 'wanderer';
      traitKits: NpcCatalogTraitKit[];
      accessories: NpcCatalogAccessoryId[];
    }

    const addNpcVisualConfigMarker = (config: NpcVisualConfig, qualityStatus: string): void => {
      const gnomeRoastMeshMarkers = isRoastNpcMode
        ? addRoastMeshAccessoryLayer('Gnome', 'default', 'smirk')
        : [];
      const visualQualityGate = buildNpcVisualQualityGate([]);
      const qualityGatePassed = visualQualityGate.passed === true;
      writeNpcVisualConfigMarker({
        archetype: config.archetype,
        visualFamily: npcVisualFamily,
        mode: config.mode,
        bodyPreset: config.bodyPreset,
        palette: config.palette,
        roleKit: config.roleKit,
        traitKits: config.traitKits,
        accessories: [
          ...config.accessories,
          ...gnomeRoastMeshMarkers,
          'visual_dna_v1',
          ...(gnomeRoastMeshMarkers.length > 0 ? ['mesh_accessory_layer_v1', 'mesh_backed_accessories_v1'] : []),
          ...(npcRigidAccessoryNames.size > 0 ? ['rigid_accessory_layer_v1'] : []),
          ...(llmAccessoriesApplied ? [usesNpcAccentLayerVisuals ? 'llm_safe_accent_layer' : 'llm_accessories'] : []),
        ],
        visualConfigMode: npcVisualConfigMode ?? (usesNpcAccentLayerVisuals ? 'accent_layer' : 'full_visual_config'),
        visualQualityGate,
        qualityStatus: qualityGatePassed ? qualityStatus : 'quality_gate_warning',
      });
    };

    const resolveNpcCatalogVisualConfig = (): NpcVisualConfig | undefined => {
      if (!isGnome) return undefined;
      const accessorySet = new Set<NpcCatalogAccessoryId>([
        'gnome_body_silhouette',
        'gnome_identity_face',
        'gnome_outfit_earthy',
        'gnome_tool_pickaxe',
        'gnome_lantern',
      ]);
      const hasHostileCue = /aggressive|hostile|evil|dark|angry|attack|sinister|cruel|wicked|menacing|scheming|cunning|sly|агрессив|злой|злобн|злоб[а-яё]*|враждеб|атак|тёмн|темн|кoварн|коварн|хитр[а-яё]+|зло[а-яё]*\sгном/.test(text);
      const hasEnemyTrait = isEnemy || hasHostileCue;
      const hasMageTrait = isMage;
      const hasQuestTrait = isQuestGiver;
      const hasGlowingEyesTrait = /glowing\s+eyes|glow(?:ing)?\s+eye|светящ[а-яё\s-]*глаз|горящ[а-яё\s-]*глаз|сияющ[а-яё\s-]*глаз/.test(text);
      const traitKits: NpcCatalogTraitKit[] = [];
      if (isRoastNpcMode) traitKits.push('roast');
      if (isGnomePatrol) traitKits.push('patrol');
      if (hasMageTrait) traitKits.push('mage');
      if (hasQuestTrait) traitKits.push('quest');
      if (hasEnemyTrait) traitKits.push('enemy');
      if (hasGlowingEyesTrait) traitKits.push('glowing_eyes');

      const baseRoleKit: NpcVisualConfig['roleKit'] = hasMageTrait && hasEnemyTrait
        ? 'mage_enemy'
        : hasMageTrait
          ? 'mage'
          : hasQuestTrait
            ? 'quest'
            : hasEnemyTrait
            ? 'enemy'
            : isMiner && hasExplicitGuardText
              ? 'miner_guard'
              : isMiner
                ? 'miner'
                : hasExplicitGuardText && isGnomePatrol
                  ? 'patrol_guard'
                  : hasExplicitGuardText
                    ? 'guard'
                    : isGnomePatrol
                      ? 'patrol'
                      : 'wanderer';
      const roleKit: NpcVisualConfig['roleKit'] = isRoastNpcMode && baseRoleKit === 'wanderer'
        ? 'roast'
        : baseRoleKit;

      if (isMiner) {
        accessorySet.add('gnome_miner_helmet');
        accessorySet.add('gnome_miner_kit');
      } else if (roleKit === 'guard' || roleKit === 'patrol_guard' || roleKit === 'mage_enemy' || roleKit === 'enemy') {
        accessorySet.add('gnome_guard_helmet');
      } else {
        accessorySet.add('gnome_cone_cap');
      }
      if (roleKit === 'guard' || roleKit === 'patrol_guard' || roleKit === 'miner_guard') {
        accessorySet.add('gnome_guard_kit');
      }
      if (roleKit === 'patrol' || roleKit === 'patrol_guard') {
        accessorySet.add('gnome_patrol_kit');
      }
      if (isGnomePatrol) accessorySet.add('gnome_patrol_kit');
      if (roleKit === 'patrol_guard') accessorySet.add('gnome_patrol_guard_kit');
      if (hasMageTrait) accessorySet.add('gnome_mage_kit');
      if (hasQuestTrait) accessorySet.add('gnome_quest_kit');
      if (hasEnemyTrait) accessorySet.add('gnome_enemy_kit');
      if (hasGlowingEyesTrait || hasEnemyTrait) accessorySet.add('gnome_glowing_eyes');
      if (isRoastNpcMode) accessorySet.add('gnome_roast_kit');

      return {
        archetype: 'gnome',
        mode: npcVisualMode,
        bodyPreset: 'short_wide',
        palette: isRoastNpcMode ? 'roast_stage' : hasMageTrait || hasEnemyTrait ? 'dark_arcane' : isMiner || hasExplicitGuardText ? 'miner_guard' : 'forest_earth',
        roleKit,
        traitKits,
        accessories: Array.from(accessorySet),
      };
    };

    const enforceNpcCatalogQuality = (config: NpcVisualConfig | undefined): NpcVisualConfig | undefined => {
      if (!config) return undefined;
      const accessorySet = new Set(config.accessories);
      accessorySet.add('gnome_body_silhouette');
      accessorySet.add('gnome_identity_face');
      accessorySet.add('gnome_outfit_earthy');
      accessorySet.add('gnome_tool_pickaxe');
      accessorySet.add('gnome_lantern');
      if (!accessorySet.has('gnome_cone_cap') && !accessorySet.has('gnome_miner_helmet') && !accessorySet.has('gnome_guard_helmet')) {
        accessorySet.add('gnome_cone_cap');
      }
      if (config.roleKit === 'patrol' || config.roleKit === 'patrol_guard') accessorySet.add('gnome_patrol_kit');
      if (config.traitKits.includes('patrol')) accessorySet.add('gnome_patrol_kit');
      if (config.roleKit === 'guard' || config.roleKit === 'patrol_guard' || config.roleKit === 'miner_guard') accessorySet.add('gnome_guard_kit');
      if (config.roleKit === 'patrol_guard') accessorySet.add('gnome_patrol_guard_kit');
      if (config.roleKit === 'miner' || config.roleKit === 'miner_guard') accessorySet.add('gnome_miner_kit');
      if (config.traitKits.includes('mage')) accessorySet.add('gnome_mage_kit');
      if (config.traitKits.includes('quest') || config.roleKit === 'quest') accessorySet.add('gnome_quest_kit');
      if (config.traitKits.includes('enemy')) accessorySet.add('gnome_enemy_kit');
      if (config.traitKits.includes('glowing_eyes') || config.traitKits.includes('enemy')) accessorySet.add('gnome_glowing_eyes');
      if (config.traitKits.includes('roast') || config.mode === 'roast_npc') accessorySet.add('gnome_roast_kit');
      return { ...config, accessories: Array.from(accessorySet) };
    };

    const applyNpcCatalogVisualConfig = (config: NpcVisualConfig): boolean => {
      const accessories = new Set(config.accessories);
      const gnomeRed = color3(0.72, 0.06, 0.05);
      const leafGreen = color3(0.18, 0.42, 0.16);
      const barkBrown = color3(0.34, 0.20, 0.09);
      const beardWhite = color3(0.90, 0.88, 0.78);
      const beardGinger = color3(0.95, 0.43, 0.12);
      const copper = color3(0.86, 0.48, 0.18);
      const miningYellow = color3(0.95, 0.70, 0.14);
      const guardBlue = color3(0.08, 0.16, 0.30);
      const arcanePurple = color3(0.30, 0.07, 0.42);
      const shadowBlack = color3(0.035, 0.04, 0.055);
      const toxicGreen = color3(0.35, 1.0, 0.28);
      const beardColor = /ginger|red\s+beard|fiery\s+red|рыж|огненн[а-яё\s-]*бород/.test(text) ? beardGinger : beardWhite;
      const hasMinerHelmet = accessories.has('gnome_miner_helmet');
      const hasPatrolKit = accessories.has('gnome_patrol_kit');
      const hasGuardKit = accessories.has('gnome_guard_kit');
      const hasMageKit = accessories.has('gnome_mage_kit');
      const hasQuestKit = accessories.has('gnome_quest_kit');
      const hasEnemyKit = accessories.has('gnome_enemy_kit');
      const hasGlowingEyes = accessories.has('gnome_glowing_eyes');
      const hasRoastKit = accessories.has('gnome_roast_kit');
      const hasGuardHelmet = accessories.has('gnome_guard_helmet');
      const hasPatrolGuardKit = accessories.has('gnome_patrol_guard_kit');
      const roastPink = color3(1.0, 0.18, 0.48);
      const roastGold = color3(1.0, 0.74, 0.18);
      const tunicColor = config.palette === 'roast_stage' ? color3(0.08, 0.08, 0.10) : config.palette === 'dark_arcane' ? shadowBlack : config.palette === 'miner_guard' ? guardBlue : leafGreen;
      const vestColor = config.palette === 'roast_stage' ? roastPink : config.palette === 'dark_arcane' ? arcanePurple : barkBrown;
      const guardAccent = hasPatrolGuardKit ? color3(0.08, 0.22, 0.42) : steel;

      if (accessories.has('gnome_body_silhouette')) {
        addAttachedBox('GnomeCoatUpperShell', 'UpperTorso', [2.34, 1.44, 1.22], [0, -0.08, -0.04], tunicColor, fabric);
        addAttachedBox('GnomeRoundBelly', 'LowerTorso', [2.30, 0.82, 1.24], [0, 0.02, -0.03], tunicColor, fabric, 'Sphere');
        addAttachedBox('GnomeCoatHem', 'LowerTorso', [2.42, 0.26, 1.28], [0, -0.42, -0.03], vestColor, fabric, 'Cylinder');
        addAttachedBox('GnomeLeftSleeve', 'LeftUpperArm', [1.10, 1.10, 1.10], [0, 0.06, -0.02], tunicColor, fabric);
        addAttachedBox('GnomeRightSleeve', 'RightUpperArm', [1.10, 1.10, 1.10], [0, 0.06, -0.02], tunicColor, fabric);
        addAttachedBox('GnomeLeftGauntlet', 'LeftLowerArm', [0.92, 0.44, 0.92], [0, -0.14, -0.02], barkBrown, leatherMat);
        addAttachedBox('GnomeRightGauntlet', 'RightLowerArm', [0.92, 0.44, 0.92], [0, -0.14, -0.02], barkBrown, leatherMat);
        addAttachedBox('GnomeShortLeftTrouser', 'LeftUpperLeg', [0.92, 0.82, 0.92], [0, -0.14, -0.02], barkBrown, fabric);
        addAttachedBox('GnomeShortRightTrouser', 'RightUpperLeg', [0.92, 0.82, 0.92], [0, -0.14, -0.02], barkBrown, fabric);
      }

      if (hasMinerHelmet) {
        addAttachedBox('GnomeMinerHelmetBrim', 'Head', [2.04, 0.12, 1.34], [0, 0.36, 0], barkBrown, leatherMat);
        addAttachedBox('GnomeMinerHelmetDome', 'Head', [1.48, 0.34, 1.02], [0, 0.58, 0.02], miningYellow, metal, 'Cylinder');
        addAttachedBox('GnomeMinerHelmetRidge', 'Head', [0.22, 0.18, 1.00], [0, 0.82, 0.02], copper, metal);
        addAttachedBox('GnomeMinerLampCase', 'Head', [0.34, 0.26, 0.18], [0, 0.54, -0.62], darkMetal, metal);
        const helmetLamp = addAttachedBox('GnomeMinerLampGlow', 'Head', [0.22, 0.18, 0.10], [0, 0.54, -0.74], color3(1.0, 0.82, 0.20), neon, 'Sphere');
        addPointLight(helmetLamp, 'GnomeMinerHelmetLight', color3(1.0, 0.76, 0.22), 10, 1.8);
      } else if (hasGuardHelmet) {
        addAttachedBox('GnomeGuardHelmetBrim', 'Head', [2.10, 0.12, 1.38], [0, 0.36, 0], darkMetal, metal);
        addAttachedBox('GnomeGuardHelmetDome', 'Head', [1.54, 0.36, 1.02], [0, 0.58, 0.02], steel, metal, 'Cylinder');
        addAttachedBox('GnomeGuardHelmetBand', 'Head', [1.68, 0.12, 1.08], [0, 0.50, 0.00], guardAccent, metal, 'Cylinder');
        addAttachedBox('GnomeGuardCheekLeft', 'Head', [0.18, 0.42, 0.12], [-0.58, 0.10, -0.48], steel, metal);
        addAttachedBox('GnomeGuardCheekRight', 'Head', [0.18, 0.42, 0.12], [0.58, 0.10, -0.48], steel, metal);
        addAttachedBox('GnomeGuardHelmetCrest', 'Head', [0.24, 0.50, 0.16], [0, 0.90, -0.04], hasGlowingEyes ? toxicGreen : gold, hasGlowingEyes ? neon : metal);
      } else if (accessories.has('gnome_cone_cap')) {
        addAttachedBox('GnomeCapBrim', 'Head', [1.95, 0.12, 1.28], [0, 0.34, 0], barkBrown, leatherMat);
        addAttachedBox('GnomeCapConeLower', 'Head', [1.34, 0.56, 0.92], [0, 0.72, 0], hasMageKit ? arcanePurple : gnomeRed, fabric, 'Cylinder');
        addAttachedBox('GnomeCapConeMiddle', 'Head', [0.86, 0.58, 0.66], [0.04, 1.10, -0.02], hasMageKit ? arcanePurple : gnomeRed, fabric, 'Cylinder');
        addAttachedBox('GnomeCapTip', 'Head', [0.38, 0.42, 0.34], [0.12, 1.48, -0.04], hasGlowingEyes ? toxicGreen : hasMageKit ? arcaneGlow : gnomeRed, hasGlowingEyes ? neon : fabric, 'Sphere');
      }

      if (accessories.has('gnome_identity_face')) {
        if (hasGlowingEyes) {
          const leftEye = addAttachedBox('GnomeGlowingEyeLeft', 'Head', [0.16, 0.12, 0.08], [-0.18, 0.08, -0.63], toxicGreen, neon, 'Sphere');
          addAttachedBox('GnomeGlowingEyeRight', 'Head', [0.16, 0.12, 0.08], [0.18, 0.08, -0.63], toxicGreen, neon, 'Sphere');
          addPointLight(leftEye, 'GnomeEvilEyeLight', toxicGreen, 9, 1.8);
        }
        addAttachedBox('GnomeNose', 'Head', [0.24, 0.22, 0.18], [0, -0.06, -0.58], color3(0.94, 0.62, 0.48), plastic, 'Sphere');
        addAttachedBox('GnomeMustacheLeft', 'Head', [0.48, 0.16, 0.14], [-0.25, -0.18, -0.62], beardColor, fabric, 'Sphere');
        addAttachedBox('GnomeMustacheRight', 'Head', [0.48, 0.16, 0.14], [0.25, -0.18, -0.62], beardColor, fabric, 'Sphere');
        addAttachedBox('GnomeBeardWide', 'Head', [1.30, 0.82, 0.20], [0, -0.45, -0.53], beardColor, fabric);
        addAttachedBox('GnomeBeardPoint', 'Head', [0.82, 0.74, 0.18], [0, -0.92, -0.50], beardColor, fabric, 'Sphere');
        addAttachedBox('GnomeLeftEar', 'Head', [0.22, 0.30, 0.14], [-0.94, -0.04, -0.10], color3(0.94, 0.70, 0.54), plastic, 'Sphere');
        addAttachedBox('GnomeRightEar', 'Head', [0.22, 0.30, 0.14], [0.94, -0.04, -0.10], color3(0.94, 0.70, 0.54), plastic, 'Sphere');
      }

      if (accessories.has('gnome_outfit_earthy')) {
        addAttachedBox('GnomeTunic', 'UpperTorso', [2.12, 1.32, 1.12], [0, -0.06, -0.04], tunicColor, fabric);
        addAttachedBox('GnomeVest', 'UpperTorso', [1.62, 1.06, 1.16], [0, -0.02, -0.08], vestColor, leatherMat);
        addAttachedBox('GnomeBelt', 'LowerTorso', [2.12, 0.24, 1.12], [0, 0.18, -0.02], barkBrown, leatherMat);
        addAttachedBox('GnomeBeltBuckle', 'LowerTorso', [0.38, 0.28, 0.12], [0, 0.18, -0.58], hasGlowingEyes ? toxicGreen : copper, hasGlowingEyes ? neon : metal);
        addAttachedBox('GnomeLeftBoot', 'LeftLowerLeg', [0.82, 0.44, 0.86], [0, -0.34, -0.02], barkBrown, leatherMat);
        addAttachedBox('GnomeRightBoot', 'RightLowerLeg', [0.82, 0.44, 0.86], [0, -0.34, -0.02], barkBrown, leatherMat);
        addAttachedBox('GnomePouch', 'LowerTorso', [0.42, 0.38, 0.28], [0.62, 0.06, -0.40], copper, leatherMat, 'Sphere');
      }

      if (accessories.has('gnome_miner_kit')) {
        addAttachedBox('GnomeMinerSafetyStripe', 'UpperTorso', [1.70, 0.16, 0.12], [0, 0.26, -0.66], miningYellow, neon);
        addAttachedBox('GnomeMinerKneePadL', 'LeftLowerLeg', [0.78, 0.20, 0.12], [0, 0.18, -0.46], darkMetal, metal);
        addAttachedBox('GnomeMinerKneePadR', 'RightLowerLeg', [0.78, 0.20, 0.12], [0, 0.18, -0.46], darkMetal, metal);
        addAttachedBox('GnomeBackPickHandle', 'UpperTorso', [0.12, 1.34, 0.12], [-0.54, 0.02, 0.72], barkBrown, wood, 'Cylinder');
        addAttachedBox('GnomeBackPickHead', 'UpperTorso', [0.72, 0.14, 0.14], [-0.54, 0.64, 0.72], steel, metal);
      }

      if (accessories.has('gnome_tool_pickaxe')) {
        addAttachedBox('GnomePickHandle', 'RightHand', [0.14, 1.20, 0.14], [0.34, 0.10, -0.02], barkBrown, wood, 'Cylinder');
        addAttachedBox('GnomePickHead', 'RightHand', [0.82, 0.16, 0.16], [0.34, 0.72, -0.02], steel, metal);
      }
      if (accessories.has('gnome_lantern')) {
        addAttachedBox('GnomeLantern', 'LeftHand', [0.36, 0.46, 0.28], [-0.24, -0.10, -0.04], copper, metal);
        const lanternGlow = addAttachedBox('GnomeLanternGlow', 'LeftHand', [0.26, 0.30, 0.20], [-0.24, -0.10, -0.10], color3(1.0, 0.78, 0.22), neon, 'Sphere');
        addPointLight(lanternGlow, 'GnomeLanternLight', color3(1.0, 0.72, 0.22), 8, 1.3);
      }

      if (hasMageKit) {
        addAttachedBox('GnomeMageHoodShadow', 'Head', [1.62, 0.32, 1.08], [0, 0.20, 0.08], shadowBlack, fabric, 'Cylinder');
        addAttachedBox('GnomeMageCapeBack', 'UpperTorso', [2.20, 1.70, 0.16], [0, -0.18, 0.72], shadowBlack, fabric);
        addAttachedBox('GnomeMageCollar', 'UpperTorso', [2.00, 0.32, 1.18], [0, 0.54, -0.02], arcanePurple, fabric, 'Cylinder');
        addAttachedBox('GnomeMageRuneChest', 'UpperTorso', [0.46, 0.46, 0.12], [0, 0.28, -0.66], hasGlowingEyes ? toxicGreen : arcaneGlow, neon, 'Sphere');
        addAttachedBox('GnomeMageStaffShaft', 'RightHand', [0.14, 1.64, 0.14], [0.44, 0.28, -0.04], barkBrown, wood, 'Cylinder');
        addAttachedBox('GnomeMageStaffCrown', 'RightHand', [0.46, 0.22, 0.46], [0.44, 1.16, -0.04], arcanePurple, metal, 'Cylinder');
        const staffOrb = addAttachedBox('GnomeMageStaffOrb', 'RightHand', [0.34, 0.34, 0.34], [0.44, 1.34, -0.04], hasGlowingEyes ? toxicGreen : arcaneGlow, neon, 'Sphere');
        addPointLight(staffOrb, 'GnomeMageStaffLight', hasGlowingEyes ? toxicGreen : arcaneGlow, 10, 1.7);
        addAttachedBox('GnomeMageLeftSpellOrb', 'LeftHand', [0.34, 0.34, 0.34], [-0.18, -0.08, -0.18], hasGlowingEyes ? toxicGreen : arcaneGlow, neon, 'Sphere');
      }

      if (hasQuestKit) {
        addAttachedBox('GnomeQuestMarkerStem', 'Head', [0.16, 0.54, 0.12], [0, 1.30, -0.10], color3(1.0, 0.86, 0.20), neon);
        const questDot = addAttachedBox('GnomeQuestMarkerDot', 'Head', [0.24, 0.24, 0.24], [0, 0.92, -0.10], color3(1.0, 0.86, 0.20), neon, 'Sphere');
        addPointLight(questDot, 'GnomeQuestMarkerLight', color3(1.0, 0.80, 0.18), 10, 1.8);
        addAttachedBox('GnomeQuestScrollRoll', 'LeftHand', [0.32, 0.70, 0.32], [-0.22, -0.08, -0.06], color3(0.94, 0.84, 0.56), fabric, 'Cylinder');
        addAttachedBox('GnomeQuestScrollRibbon', 'LeftHand', [0.38, 0.10, 0.38], [-0.22, -0.08, -0.06], crimson, fabric, 'Cylinder');
        addAttachedBox('GnomeQuestBookCover', 'LeftLowerArm', [0.52, 0.66, 0.14], [-0.34, -0.08, -0.34], color3(0.25, 0.10, 0.42), leatherMat);
        addAttachedBox('GnomeQuestAuraRing', 'LowerTorso', [2.32, 0.10, 1.20], [0, -0.52, -0.02], color3(1.0, 0.86, 0.20), neon, 'Cylinder');
      }

      if (hasEnemyKit) {
        addAttachedBox('GnomeEnemyBrowPlate', 'Head', [0.82, 0.14, 0.12], [0, 0.22, -0.64], shadowBlack, metal);
        addAttachedBox('GnomeEnemyLeftHorn', 'Head', [0.18, 0.58, 0.18], [-0.52, 0.70, -0.10], shadowBlack, metal, 'Cylinder');
        addAttachedBox('GnomeEnemyRightHorn', 'Head', [0.18, 0.58, 0.18], [0.52, 0.70, -0.10], shadowBlack, metal, 'Cylinder');
        addAttachedBox('GnomeEnemyShoulderSpikeL', 'LeftUpperArm', [0.28, 0.70, 0.28], [0, 0.58, -0.04], shadowBlack, metal, 'Cylinder');
        addAttachedBox('GnomeEnemyShoulderSpikeR', 'RightUpperArm', [0.28, 0.70, 0.28], [0, 0.58, -0.04], shadowBlack, metal, 'Cylinder');
        addAttachedBox('GnomeEnemyClawLeft', 'LeftHand', [0.20, 0.62, 0.12], [-0.12, -0.20, -0.24], hasGlowingEyes ? toxicGreen : steel, hasGlowingEyes ? neon : metal);
        addAttachedBox('GnomeEnemyClawRight', 'RightHand', [0.20, 0.62, 0.12], [0.12, -0.20, -0.24], hasGlowingEyes ? toxicGreen : steel, hasGlowingEyes ? neon : metal);
      }

      if (hasRoastKit) {
        addAttachedBox('GnomeRoastShadesFrame', 'Head', [1.18, 0.28, 0.10], [0, 0.08, -0.68], color3(0.02, 0.02, 0.03), plastic);
        addAttachedBox('GnomeRoastShadesLensL', 'Head', [0.44, 0.22, 0.06], [-0.28, 0.08, -0.73], roastPink, neon);
        addAttachedBox('GnomeRoastShadesLensR', 'Head', [0.44, 0.22, 0.06], [0.28, 0.08, -0.73], roastPink, neon);
        addAttachedBox('GnomeRoastSmirk', 'Head', [0.54, 0.08, 0.06], [0.20, -0.24, -0.66], roastGold, neon);
        addAttachedBox('GnomeRoastBowTie', 'UpperTorso', [0.68, 0.28, 0.12], [0, 0.46, -0.68], roastPink, fabric);
        addAttachedBox('GnomeRoastBadge', 'UpperTorso', [0.42, 0.42, 0.12], [-0.54, 0.32, -0.66], roastGold, neon, 'Sphere');
        addAttachedBox('GnomeRoastMicHandle', 'RightHand', [0.16, 0.74, 0.16], [0.26, 0.08, -0.04], color3(0.05, 0.05, 0.06), metal, 'Cylinder');
        addAttachedBox('GnomeRoastMicHead', 'RightHand', [0.38, 0.34, 0.38], [0.26, 0.52, -0.04], roastPink, neon, 'Sphere');
        addAttachedBox('GnomeRoastSpeechBoard', 'LeftHand', [0.96, 0.58, 0.10], [-0.34, 0.10, -0.18], color3(0.06, 0.06, 0.08), plastic);
        addAttachedBox('GnomeRoastSpeechLine1', 'LeftHand', [0.62, 0.08, 0.06], [-0.34, 0.22, -0.25], roastGold, neon);
        addAttachedBox('GnomeRoastSpeechLine2', 'LeftHand', [0.46, 0.08, 0.06], [-0.34, 0.02, -0.25], roastPink, neon);
        const stageGlow = addAttachedBox('GnomeRoastStageGlow', 'LowerTorso', [2.44, 0.10, 1.28], [0, -0.52, -0.02], roastPink, neon, 'Cylinder');
        addPointLight(stageGlow, 'GnomeRoastStageLight', roastPink, 9, 1.5);
      }

      if (hasGuardKit) {
        addAttachedBox('GnomeGuardShoulderL', 'LeftUpperArm', [1.06, 0.26, 1.04], [0, 0.46, 0], steel, metal);
        addAttachedBox('GnomeGuardShoulderR', 'RightUpperArm', [1.06, 0.26, 1.04], [0, 0.46, 0], steel, metal);
        addAttachedBox('GnomeGuardPatrolBadge', 'UpperTorso', [0.34, 0.34, 0.12], [0.52, 0.36, -0.62], gold, metal, 'Sphere');
        addAttachedBox('GnomeGuardCrossBelt', 'UpperTorso', [0.22, 1.48, 0.12], [-0.42, -0.06, -0.66], copper, leatherMat);
        addAttachedBox('GnomeGuardBaton', 'LowerTorso', [0.14, 0.92, 0.14], [-0.72, 0.02, -0.18], darkMetal, metal, 'Cylinder');
        addAttachedBox('GnomeGuardShieldBoard', 'LeftLowerArm', [0.18, 1.20, 1.00], [-0.50, -0.02, -0.22], guardAccent, metal);
        addAttachedBox('GnomeGuardShieldRim', 'LeftLowerArm', [0.24, 1.34, 1.14], [-0.52, -0.02, -0.22], steel, metal);
        addAttachedBox('GnomeGuardShieldBoss', 'LeftLowerArm', [0.26, 0.26, 0.26], [-0.64, -0.02, -0.22], gold, metal, 'Sphere');
        addAttachedBox('GnomeGuardSpearShaft', 'RightHand', [0.12, 1.72, 0.12], [0.42, 0.38, -0.04], barkBrown, wood, 'Cylinder');
        addAttachedBox('GnomeGuardSpearTip', 'RightHand', [0.24, 0.38, 0.24], [0.42, 1.28, -0.04], steel, metal, 'Cylinder');
      }
      if (hasPatrolKit) {
        addAttachedBox('GnomePatrolBadge', 'UpperTorso', [0.34, 0.34, 0.12], [0.52, 0.34, -0.62], gold, metal, 'Sphere');
        addAttachedBox('GnomePatrolPack', 'UpperTorso', [1.10, 0.86, 0.42], [0, -0.04, 0.70], barkBrown, leatherMat);
        addAttachedBox('GnomePatrolBedroll', 'UpperTorso', [1.18, 0.24, 0.24], [0, 0.54, 0.84], leafGreen, fabric, 'Cylinder');
        if (!hasGuardKit) {
          addAttachedBox('GnomeWalkingStick', 'RightHand', [0.12, 1.48, 0.12], [0.42, 0.16, -0.02], barkBrown, wood, 'Cylinder');
        }
      }

      addAttachedBox('GnomeIdentityCollar', 'UpperTorso', [2.02, 0.22, 1.14], [0, 0.52, -0.02], hasMageKit ? arcanePurple : barkBrown, fabric);
      addAttachedBox('GnomeIdentityRoleBadge', 'UpperTorso', [0.34, 0.34, 0.12], [-0.52, 0.34, -0.62], hasGlowingEyes ? toxicGreen : gold, hasGlowingEyes ? neon : metal, 'Sphere');

      addNpcVisualConfigMarker(config, 'passed');
      return true;
    };

    const npcCatalogVisualConfig = enforceNpcCatalogQuality(resolveNpcCatalogVisualConfig());
    if (npcCatalogVisualConfig && applyNpcCatalogVisualConfig(npcCatalogVisualConfig)) {
      return;
    }

    if (isFireElemental) {
      addAttachedBox('FireElementalCharredCore', 'UpperTorso', [2.34, 1.34, 1.18], [0, -0.05, -0.05], magmaDark, metal);
      const coreGlow = addAttachedBox('FireElementalMoltenCore', 'UpperTorso', [1.22, 0.92, 0.18], [0, -0.03, -0.64], flameOrange, neon);
      addPointLight(coreGlow, 'FireElementalCoreLight', flameOrange, 14, 2.4);
      addAttachedBox('FireElementalLavaBelt', 'LowerTorso', [2.30, 0.26, 1.18], [0, 0.22, -0.04], flameYellow, neon);
      addAttachedBox('FireElementalCapeSmoke', 'UpperTorso', [2.48, 1.92, 0.20], [0, -0.20, 0.68], charred, fabric);
      addAttachedBox('FireElementalLeftHornBase', 'Head', [0.42, 0.38, 0.42], [-0.48, 0.48, -0.06], charred, metal, 'Sphere');
      addAttachedBox('FireElementalRightHornBase', 'Head', [0.42, 0.38, 0.42], [0.48, 0.48, -0.06], charred, metal, 'Sphere');
      addAttachedBox('FireElementalLeftHorn', 'Head', [0.28, 1.02, 0.28], [-0.62, 0.95, -0.12], flameOrange, neon, 'Cylinder');
      addAttachedBox('FireElementalRightHorn', 'Head', [0.28, 1.02, 0.28], [0.62, 0.95, -0.12], flameOrange, neon, 'Cylinder');
      const crownFront = addAttachedBox('FireElementalCrownFront', 'Head', [0.46, 0.72, 0.20], [0, 0.78, -0.58], flameYellow, neon);
      addAttachedBox('FireElementalCrownLeft', 'Head', [0.34, 0.58, 0.18], [-0.42, 0.66, -0.52], flameOrange, neon);
      addAttachedBox('FireElementalCrownRight', 'Head', [0.34, 0.58, 0.18], [0.42, 0.66, -0.52], flameOrange, neon);
      addPointLight(crownFront, 'FireElementalCrownLight', flameYellow, 9, 1.7);
      addAttachedBox('FireElementalLeftShoulderFlame', 'LeftUpperArm', [1.34, 0.42, 1.34], [0, 0.54, 0], flameOrange, neon, 'Cylinder');
      addAttachedBox('FireElementalRightShoulderFlame', 'RightUpperArm', [1.34, 0.42, 1.34], [0, 0.54, 0], flameOrange, neon, 'Cylinder');
      addAttachedBox('FireElementalLeftClaw', 'LeftHand', [0.22, 0.82, 0.18], [-0.12, -0.32, -0.22], flameYellow, neon);
      addAttachedBox('FireElementalRightClaw', 'RightHand', [0.22, 0.82, 0.18], [0.12, -0.32, -0.22], flameYellow, neon);
      addAttachedBox('FireElementalLeftLegMagma', 'LeftLowerLeg', [0.74, 0.22, 0.74], [0, 0.05, -0.02], flameOrange, neon, 'Cylinder');
      addAttachedBox('FireElementalRightLegMagma', 'RightLowerLeg', [0.74, 0.22, 0.74], [0, 0.05, -0.02], flameOrange, neon, 'Cylinder');
      addAttachedBox('FireElementalLeftHandOrb', 'LeftHand', [0.46, 0.46, 0.46], [-0.20, -0.08, -0.12], flameYellow, neon, 'Sphere');
      const rightOrb = addAttachedBox('FireElementalRightHandOrb', 'RightHand', [0.46, 0.46, 0.46], [0.20, -0.08, -0.12], flameOrange, neon, 'Sphere');
      addPointLight(rightOrb, 'FireElementalHandLight', flameOrange, 8, 1.4);
      addDetectedSecondaryTraitOverlays('fire_elemental', 'FireElemental');
      addUniversalRoastKit('FireElemental');
      recordNpcVisualFamilySignature('FireElementalCharredCore', 'FireElementalMoltenCore', 'FireElementalLeftHorn', 'FireElementalLeftShoulderFlame', 'FireElementalLeftClaw', 'FireElementalLeftLegMagma');
      addGeneralNpcVisualConfigMarker('fire_elemental', 'fire_elemental', ['fire'], [
        'fire_elemental_core',
        'fire_elemental_crown',
        'fire_elemental_flames',
      ]);
      return;
    }

    if (isRanger) {
      const brightLeaf = color3(0.32, 0.68, 0.28);
      const mossGreen = color3(0.17, 0.40, 0.16);
      const barkBrown = color3(0.34, 0.20, 0.09);
      const featherGold = color3(0.92, 0.68, 0.18);
      addAttachedBox('RangerCapBrim', 'Head', [2.05, 0.10, 1.35], [0, 0.38, -0.04], mossGreen, fabric);
      addAttachedBox('RangerCapTop', 'Head', [1.55, 0.24, 1.02], [0, 0.50, 0.02], brightLeaf, fabric, 'Cylinder');
      addAttachedBox('RangerHatBand', 'Head', [1.66, 0.10, 1.06], [0, 0.48, -0.01], barkBrown, leatherMat, 'Cylinder');
      addAttachedBox('RangerFeatherShaft', 'Head', [0.10, 0.68, 0.08], [0.58, 0.86, -0.12], featherGold, fabric, 'Cylinder');
      addAttachedBox('RangerFeatherTip', 'Head', [0.22, 0.20, 0.10], [0.64, 1.16, -0.18], color3(0.78, 0.12, 0.10), fabric, 'Sphere');
      addAttachedBox('RangerTunic', 'UpperTorso', [2.20, 1.36, 1.12], [0, -0.06, -0.04], mossGreen, fabric);
      addAttachedBox('RangerLeatherVest', 'UpperTorso', [1.70, 1.10, 1.16], [0, -0.05, -0.08], barkBrown, leatherMat);
      addAttachedBox('RangerBelt', 'LowerTorso', [2.10, 0.22, 1.12], [0, 0.18, -0.02], barkBrown, leatherMat);
      addAttachedBox('RangerPouch', 'LowerTorso', [0.46, 0.40, 0.30], [0.62, 0.05, -0.38], color3(0.55, 0.34, 0.14), leatherMat, 'Sphere');
      addAttachedBox('RangerBowUpper', 'UpperTorso', [0.14, 1.20, 0.14], [0.72, 0.34, 0.68], barkBrown, wood, 'Cylinder');
      addAttachedBox('RangerBowLower', 'UpperTorso', [0.14, 1.20, 0.14], [0.72, -0.46, 0.68], barkBrown, wood, 'Cylinder');
      addAttachedBox('RangerBowString', 'UpperTorso', [0.05, 1.74, 0.05], [0.92, -0.06, 0.62], color3(0.86, 0.82, 0.68), fabric, 'Cylinder');
      addAttachedBox('RangerQuiver', 'UpperTorso', [0.56, 1.18, 0.34], [-0.76, 0.02, 0.72], barkBrown, leatherMat);
      addAttachedBox('RangerArrowFeathers', 'UpperTorso', [0.48, 0.28, 0.18], [-0.76, 0.72, 0.78], featherGold, fabric);
      addAttachedBox('RangerCloakBack', 'UpperTorso', [2.20, 1.62, 0.14], [0, -0.22, 0.68], color3(0.09, 0.22, 0.10), fabric);
      addAttachedBox('RangerLeftBracer', 'LeftLowerArm', [0.82, 0.42, 0.82], [0, 0.10, -0.02], barkBrown, leatherMat);
      addAttachedBox('RangerRightBracer', 'RightLowerArm', [0.82, 0.42, 0.82], [0, 0.10, -0.02], barkBrown, leatherMat);
      addAttachedBox('RangerLeftBoot', 'LeftLowerLeg', [0.78, 0.42, 0.82], [0, -0.32, -0.02], barkBrown, leatherMat);
      addAttachedBox('RangerRightBoot', 'RightLowerLeg', [0.78, 0.42, 0.82], [0, -0.32, -0.02], barkBrown, leatherMat);
      addAttachedBox('RangerBadgeLeaf', 'UpperTorso', [0.32, 0.32, 0.12], [-0.52, 0.44, -0.58], featherGold, metal, 'Sphere');
      addDetectedSecondaryTraitOverlays('ranger', 'Ranger');
      addUniversalRoastKit('Ranger');
      addGeneralNpcVisualConfigMarker('ranger', 'ranger', ['patrol'], [
        'ranger_hat',
        'ranger_bow',
        'ranger_quiver',
        'ranger_cloak',
      ]);
      return;
    }

    if (isGnome) {
      const gnomeRed = color3(0.72, 0.06, 0.05);
      const leafGreen = color3(0.18, 0.42, 0.16);
      const barkBrown = color3(0.34, 0.20, 0.09);
      const beardWhite = color3(0.90, 0.88, 0.78);
      const beardGinger = color3(0.95, 0.43, 0.12);
      const copper = color3(0.86, 0.48, 0.18);
      const miningYellow = color3(0.95, 0.70, 0.14);
      const guardBlue = color3(0.08, 0.16, 0.30);
      const beardColor = /ginger|red\s+beard|fiery\s+red|рыж|огненн[а-яё\s-]*бород/.test(text) ? beardGinger : beardWhite;
      const isGnomeGuard = hasExplicitGuardText;

      if (isMiner) {
        addAttachedBox('GnomeMinerHelmetBrim', 'Head', [2.04, 0.12, 1.34], [0, 0.36, 0], barkBrown, leatherMat);
        addAttachedBox('GnomeMinerHelmetDome', 'Head', [1.48, 0.34, 1.02], [0, 0.58, 0.02], miningYellow, metal, 'Cylinder');
        addAttachedBox('GnomeMinerHelmetRidge', 'Head', [0.22, 0.18, 1.00], [0, 0.82, 0.02], copper, metal);
        addAttachedBox('GnomeMinerLampCase', 'Head', [0.34, 0.26, 0.18], [0, 0.54, -0.62], darkMetal, metal);
        const helmetLamp = addAttachedBox('GnomeMinerLampGlow', 'Head', [0.22, 0.18, 0.10], [0, 0.54, -0.74], color3(1.0, 0.82, 0.20), neon, 'Sphere');
        addPointLight(helmetLamp, 'GnomeMinerHelmetLight', color3(1.0, 0.76, 0.22), 10, 1.8);
      } else {
        addAttachedBox('GnomeCapBrim', 'Head', [1.95, 0.12, 1.28], [0, 0.34, 0], barkBrown, leatherMat);
        addAttachedBox('GnomeCapConeLower', 'Head', [1.34, 0.56, 0.92], [0, 0.72, 0], gnomeRed, fabric, 'Cylinder');
        addAttachedBox('GnomeCapConeMiddle', 'Head', [0.86, 0.58, 0.66], [0.04, 1.10, -0.02], gnomeRed, fabric, 'Cylinder');
        addAttachedBox('GnomeCapTip', 'Head', [0.38, 0.42, 0.34], [0.12, 1.48, -0.04], gnomeRed, fabric, 'Sphere');
      }
      addAttachedBox('GnomeNose', 'Head', [0.24, 0.22, 0.18], [0, -0.06, -0.58], color3(0.94, 0.62, 0.48), plastic, 'Sphere');
      addAttachedBox('GnomeMustacheLeft', 'Head', [0.48, 0.16, 0.14], [-0.25, -0.18, -0.62], beardColor, fabric, 'Sphere');
      addAttachedBox('GnomeMustacheRight', 'Head', [0.48, 0.16, 0.14], [0.25, -0.18, -0.62], beardColor, fabric, 'Sphere');
      addAttachedBox('GnomeBeardWide', 'Head', [1.30, 0.82, 0.20], [0, -0.45, -0.53], beardColor, fabric);
      addAttachedBox('GnomeBeardPoint', 'Head', [0.82, 0.74, 0.18], [0, -0.92, -0.50], beardColor, fabric, 'Sphere');
      addAttachedBox('GnomeLeftEar', 'Head', [0.22, 0.30, 0.14], [-0.94, -0.04, -0.10], color3(0.94, 0.70, 0.54), plastic, 'Sphere');
      addAttachedBox('GnomeRightEar', 'Head', [0.22, 0.30, 0.14], [0.94, -0.04, -0.10], color3(0.94, 0.70, 0.54), plastic, 'Sphere');
      addAttachedBox('GnomeTunic', 'UpperTorso', [2.12, 1.32, 1.12], [0, -0.06, -0.04], isMiner ? guardBlue : leafGreen, fabric);
      addAttachedBox('GnomeVest', 'UpperTorso', [1.62, 1.06, 1.16], [0, -0.02, -0.08], barkBrown, leatherMat);
      if (isMiner) {
        addAttachedBox('GnomeMinerSafetyStripe', 'UpperTorso', [1.70, 0.16, 0.12], [0, 0.26, -0.66], miningYellow, neon);
        addAttachedBox('GnomeMinerKneePadL', 'LeftLowerLeg', [0.78, 0.20, 0.12], [0, 0.18, -0.46], darkMetal, metal);
        addAttachedBox('GnomeMinerKneePadR', 'RightLowerLeg', [0.78, 0.20, 0.12], [0, 0.18, -0.46], darkMetal, metal);
      }
      addAttachedBox('GnomeBelt', 'LowerTorso', [2.12, 0.24, 1.12], [0, 0.18, -0.02], barkBrown, leatherMat);
      addAttachedBox('GnomeBeltBuckle', 'LowerTorso', [0.38, 0.28, 0.12], [0, 0.18, -0.58], copper, metal);
      addAttachedBox('GnomeLeftBoot', 'LeftLowerLeg', [0.82, 0.44, 0.86], [0, -0.34, -0.02], barkBrown, leatherMat);
      addAttachedBox('GnomeRightBoot', 'RightLowerLeg', [0.82, 0.44, 0.86], [0, -0.34, -0.02], barkBrown, leatherMat);
      addAttachedBox('GnomePouch', 'LowerTorso', [0.42, 0.38, 0.28], [0.62, 0.06, -0.40], copper, leatherMat, 'Sphere');
      addAttachedBox('GnomePickHandle', 'RightHand', [0.14, 1.20, 0.14], [0.34, 0.10, -0.02], barkBrown, wood, 'Cylinder');
      addAttachedBox('GnomePickHead', 'RightHand', [0.82, 0.16, 0.16], [0.34, 0.72, -0.02], steel, metal);
      if (isMiner) {
        addAttachedBox('GnomeBackPickHandle', 'UpperTorso', [0.12, 1.34, 0.12], [-0.54, 0.02, 0.72], barkBrown, wood, 'Cylinder');
        addAttachedBox('GnomeBackPickHead', 'UpperTorso', [0.72, 0.14, 0.14], [-0.54, 0.64, 0.72], steel, metal);
      }
      addAttachedBox('GnomeLantern', 'LeftHand', [0.36, 0.46, 0.28], [-0.24, -0.10, -0.04], copper, metal);
      const lanternGlow = addAttachedBox('GnomeLanternGlow', 'LeftHand', [0.26, 0.30, 0.20], [-0.24, -0.10, -0.10], color3(1.0, 0.78, 0.22), neon, 'Sphere');
      addPointLight(lanternGlow, 'GnomeLanternLight', color3(1.0, 0.72, 0.22), 8, 1.3);
      if (isGnomeGuard) {
        addAttachedBox('GnomeGuardShoulderL', 'LeftUpperArm', [1.06, 0.26, 1.04], [0, 0.46, 0], steel, metal);
        addAttachedBox('GnomeGuardShoulderR', 'RightUpperArm', [1.06, 0.26, 1.04], [0, 0.46, 0], steel, metal);
        addAttachedBox('GnomeGuardPatrolBadge', 'UpperTorso', [0.34, 0.34, 0.12], [0.52, 0.36, -0.62], gold, metal, 'Sphere');
        addAttachedBox('GnomeGuardCrossBelt', 'UpperTorso', [0.22, 1.48, 0.12], [-0.42, -0.06, -0.66], copper, leatherMat);
        addAttachedBox('GnomeGuardBaton', 'LowerTorso', [0.14, 0.92, 0.14], [-0.72, 0.02, -0.18], darkMetal, metal, 'Cylinder');
      } else if (isGnomePatrol) {
        addAttachedBox('GnomePatrolBadge', 'UpperTorso', [0.34, 0.34, 0.12], [0.52, 0.34, -0.62], gold, metal, 'Sphere');
        addAttachedBox('GnomePatrolPack', 'UpperTorso', [1.10, 0.86, 0.42], [0, -0.04, 0.70], barkBrown, leatherMat);
        addAttachedBox('GnomePatrolBedroll', 'UpperTorso', [1.18, 0.24, 0.24], [0, 0.54, 0.84], leafGreen, fabric, 'Cylinder');
        addAttachedBox('GnomeWalkingStick', 'RightHand', [0.12, 1.48, 0.12], [0.42, 0.16, -0.02], barkBrown, wood, 'Cylinder');
      }
      return;
    }

    if (isArachnidFamily) {
      addArachnidFamilyTemplate();
      return;
    }

    if (isBruteFamily) {
      addBruteFamilyTemplate();
      return;
    }

    if (isWingedFamily) {
      addWingedFamilyTemplate();
      return;
    }

    if (isGolemFamily) {
      addGolemFamilyTemplate();
      return;
    }

    if (isBeastFamily) {
      addBeastFamilyTemplate();
      return;
    }

    if (isPlantFungalFamily) {
      addPlantFungalFamilyTemplate();
      return;
    }

    if (isElementalFamily && !isFireElemental) {
      addElementalFamilyTemplate();
      return;
    }

    if (isRobot) {
      addRobotTemplate();
      return;
    }

    if (isPirate) {
      addPirateTemplate();
      return;
    }

    if (isNinja) {
      addNinjaTemplate();
      return;
    }

    if (isUndead) {
      addUndeadTemplate();
      return;
    }

    if (isPointedHatRequest && !isMage) {
      addAttachedBox('PointedHatBrim', 'Head', [2.24, 0.14, 1.46], [0, 0.30, 0], color3(0.10, 0.06, 0.16), fabric);
      addAttachedBox('PointedHatBand', 'Head', [1.55, 0.18, 1.02], [0, 0.45, -0.02], gold, metal);
      addAttachedBox('PointedHatConeLower', 'Head', [1.26, 0.62, 0.88], [0, 0.82, 0], purple, fabric, 'Cylinder');
      addAttachedBox('PointedHatConeMiddle', 'Head', [0.82, 0.56, 0.62], [0, 1.18, 0], color3(0.25, 0.08, 0.42), fabric, 'Cylinder');
      addAttachedBox('PointedHatConeTip', 'Head', [0.34, 0.46, 0.34], [0, 1.52, 0], color3(0.18, 0.05, 0.32), fabric, 'Sphere');
      addAttachedBox('PointedHatStarGem', 'Head', [0.24, 0.24, 0.10], [0.38, 0.56, -0.58], arcaneGlow, neon, 'Sphere');
      addDetectedSecondaryTraitOverlays('pointed_hat', 'PointedHat');
      addUniversalRoastKit('PointedHat');
      addGeneralNpcVisualConfigMarker('pointed_hat', 'pointed_hat', ['mage'], [
        'pointed_hat',
        'star_gem',
      ]);
      return;
    }

    if (isSuperhero) {
      addSecondarySuperheroTraitKit('Superhero');
      addDetectedSecondaryTraitOverlays('superhero', 'Superhero');
      addUniversalRoastKit('Superhero');
      addGeneralNpcVisualConfigMarker('superhero', isKnightOrGuard ? 'superhero_guard' : isCompanion ? 'superhero_companion' : 'superhero', [
        'superhero',
        ...(isKnightOrGuard ? ['guard' as const] : []),
        ...(isCompanion ? ['companion' as const] : []),
      ], [
        ...(wantsHeroHeadCover ? ['hero_mask'] : ['hero_hair']),
        'muscle_suit',
        'chest_shield_emblem',
        'red_cape',
        'laser_eyes',
        'flight_aura',
      ]);
      return;
    }

    if (isKnightOrGuard) {
      const patrolBlue = color3(0.08, 0.18, 0.34);
      const whiteTrim = color3(0.88, 0.92, 0.95);
      addAttachedBox('KnightHelmet', 'Head', [1.75, 0.58, 1.08], [0, 0.24, 0], steel, metal);
      addAttachedBox('KnightVisor', 'Head', [1.50, 0.18, 0.12], [0, 0.12, -0.52], darkMetal, metal);
      addAttachedBox('KnightHelmetCrest', 'Head', [0.22, 0.52, 0.92], [0, 0.64, 0.02], accent, metal);
      addAttachedBox('KnightChestPlate', 'UpperTorso', [2.22, 1.24, 1.12], [0, 0, -0.04], steel, metal);
      addAttachedBox('GuardTabardFront', 'UpperTorso', [1.18, 1.34, 0.10], [0, -0.04, -0.64], patrolBlue, fabric);
      addAttachedBox('GuardTabardTrim', 'UpperTorso', [0.20, 1.20, 0.11], [0, -0.04, -0.70], whiteTrim, fabric);
      addAttachedBox('GuardChestEmblem', 'UpperTorso', [0.38, 0.38, 0.12], [0, 0.28, -0.76], gold, metal, 'Sphere');
      addAttachedBox('GuardCrossBelt', 'UpperTorso', [0.28, 1.70, 0.12], [-0.42, -0.04, -0.72], leather, leatherMat);
      addAttachedBox('GuardBelt', 'LowerTorso', [2.10, 0.22, 1.12], [0, 0.18, -0.02], leather, leatherMat);
      addAttachedBox('GuardBeltBuckle', 'LowerTorso', [0.42, 0.28, 0.12], [0, 0.18, -0.58], gold, metal);
      addAttachedBox('LeftPauldron', 'LeftUpperArm', [1.20, 0.34, 1.20], [0, 0.42, 0], steel, metal);
      addAttachedBox('RightPauldron', 'RightUpperArm', [1.20, 0.34, 1.20], [0, 0.42, 0], steel, metal);
      addAttachedBox('LeftGuardBracer', 'LeftLowerArm', [0.86, 0.36, 0.86], [0, 0.08, -0.02], darkMetal, metal);
      addAttachedBox('RightGuardBracer', 'RightLowerArm', [0.86, 0.36, 0.86], [0, 0.08, -0.02], darkMetal, metal);
      addAttachedBox('KnightShield', 'LeftLowerArm', [0.24, 1.42, 1.10], [-0.48, -0.02, -0.20], color3(0.16, 0.22, 0.35), metal);
      addAttachedBox('KnightShieldRim', 'LeftLowerArm', [0.28, 1.56, 1.24], [-0.50, -0.02, -0.20], gold, metal);
      addAttachedBox('KnightShieldBoss', 'LeftLowerArm', [0.34, 0.34, 0.18], [-0.64, -0.02, -0.20], gold, metal, 'Sphere');
      addAttachedBox('KnightSwordBlade', 'RightLowerArm', [0.16, 2.15, 0.16], [0.48, -0.42, -0.10], steel, metal);
      addAttachedBox('KnightSwordHilt', 'RightHand', [0.52, 0.16, 0.16], [0.48, 0.10, -0.10], accent, metal);
      addAttachedBox('KnightSwordPommel', 'RightHand', [0.20, 0.20, 0.20], [0.48, -0.12, -0.10], gold, metal, 'Sphere');
      addAttachedBox('GuardLeftBoot', 'LeftLowerLeg', [0.84, 0.46, 0.88], [0, -0.34, -0.02], darkMetal, metal);
      addAttachedBox('GuardRightBoot', 'RightLowerLeg', [0.84, 0.46, 0.88], [0, -0.34, -0.02], darkMetal, metal);
      addAttachedBox('GuardCapeBack', 'UpperTorso', [2.26, 1.82, 0.14], [0, -0.28, 0.68], color3(0.04, 0.07, 0.12), fabric);
      addDetectedSecondaryTraitOverlays('guard', 'Guard');
      addUniversalRoastKit('Guard');
      addGeneralNpcVisualConfigMarker('guard', 'guard', ['guard'], [
        'guard_helmet',
        'guard_tabard',
        'shield',
        'sword',
        'cape',
      ]);
      return;
    }

    if (isMerchant) {
      addAttachedBox('MerchantHat', 'Head', [1.85, 0.30, 1.18], [0, 0.32, 0], color3(0.45, 0.22, 0.12), fabric);
      addAttachedBox('MerchantHatBrim', 'Head', [2.30, 0.10, 1.50], [0, 0.18, 0], color3(0.30, 0.14, 0.08), fabric);
      addAttachedBox('MerchantApron', 'UpperTorso', [2.18, 1.20, 1.10], [0, -0.10, -0.04], color3(0.62, 0.50, 0.32), fabric);
      addAttachedBox('CoinPouch', 'LowerTorso', [0.48, 0.42, 0.32], [0.62, 0.04, -0.42], gold, fabric);
      addAttachedBox('MerchantSash', 'UpperTorso', [2.20, 0.18, 1.12], [0, 0.30, -0.06], crimson, fabric);
      addAttachedBox('LedgerBook', 'LeftHand', [0.42, 0.62, 0.16], [-0.10, -0.10, 0], color3(0.40, 0.20, 0.10), leatherMat);
      addDetectedSecondaryTraitOverlays('merchant', 'Merchant');
      addUniversalRoastKit('Merchant');
      addGeneralNpcVisualConfigMarker('merchant', 'merchant', ['merchant'], [
        'merchant_hat',
        'merchant_apron',
        'coin_pouch',
        'ledger_book',
      ]);
      return;
    }

    if (isBoss) {
      addAttachedBox('BossCrownBase', 'Head', [1.55, 0.18, 1.02], [0, 0.42, 0], gold, metal);
      addAttachedBox('BossCrownSpike1', 'Head', [0.18, 0.36, 0.18], [0, 0.62, 0.40], gold, metal);
      addAttachedBox('BossCrownSpike2', 'Head', [0.18, 0.36, 0.18], [0, 0.62, -0.40], gold, metal);
      addAttachedBox('BossCrownSpike3', 'Head', [0.18, 0.36, 0.18], [0.40, 0.62, 0], gold, metal);
      addAttachedBox('BossCrownSpike4', 'Head', [0.18, 0.36, 0.18], [-0.40, 0.62, 0], gold, metal);
      addAttachedBox('BossCape', 'UpperTorso', [2.30, 2.20, 0.18], [0, -0.20, 0.62], purple, fabric);
      addAttachedBox('BossArmor', 'UpperTorso', [2.24, 1.30, 1.16], [0, -0.04, -0.06], darkMetal, metal);
      addAttachedBox('BossShoulderL', 'LeftUpperArm', [1.30, 0.50, 1.30], [0, 0.40, 0], gold, metal);
      addAttachedBox('BossShoulderR', 'RightUpperArm', [1.30, 0.50, 1.30], [0, 0.40, 0], gold, metal);
      addAttachedBox('BossScepter', 'RightHand', [0.20, 1.80, 0.20], [0.30, 0.30, 0], gold, metal);
      addDetectedSecondaryTraitOverlays('boss', 'Boss');
      addUniversalRoastKit('Boss');
      addGeneralNpcVisualConfigMarker('boss', 'boss', ['boss'], [
        'crown',
        'boss_cape',
        'boss_armor',
        'scepter',
      ]);
      return;
    }

    if (isVillain) {
      addAttachedBox('VillainHood', 'Head', [1.85, 0.95, 1.15], [0, 0.30, 0.10], color3(0.10, 0.10, 0.14), fabric);
      addAttachedBox('VillainMask', 'Head', [1.40, 0.30, 0.16], [0, 0.04, -0.50], darkMetal, fabric);
      addAttachedBox('VillainCloak', 'UpperTorso', [2.30, 1.80, 0.18], [0, -0.20, 0.58], color3(0.08, 0.08, 0.12), fabric);
      addAttachedBox('VillainBelt', 'LowerTorso', [2.10, 0.20, 1.12], [0, 0.16, -0.02], color3(0.18, 0.10, 0.08), leatherMat);
      addAttachedBox('VillainDagger', 'RightHand', [0.14, 0.95, 0.10], [0.30, 0.20, 0], color3(0.65, 0.65, 0.70), metal);
      addAttachedBox('VillainPoisonVial', 'LeftHand', [0.20, 0.30, 0.20], [-0.20, -0.10, 0], color3(0.30, 0.65, 0.20), plastic);
      addDetectedSecondaryTraitOverlays('villain', 'Villain');
      addUniversalRoastKit('Villain');
      addGeneralNpcVisualConfigMarker('villain', 'villain', ['villain', 'enemy'], [
        'villain_hood',
        'villain_mask',
        'cloak',
        'dagger',
        'poison_vial',
      ]);
      return;
    }

    if (isCompanion) {
      addAttachedBox('CompanionScarf', 'UpperTorso', [2.18, 0.40, 1.20], [0, 0.45, 0], color3(0.85, 0.40, 0.30), fabric);
      addAttachedBox('CompanionVest', 'UpperTorso', [2.18, 1.00, 1.12], [0, -0.10, -0.04], color3(0.40, 0.55, 0.75), fabric);
      addAttachedBox('CompanionBackpack', 'UpperTorso', [1.40, 1.00, 0.55], [0, 0, 0.62], color3(0.45, 0.30, 0.20), leatherMat);
      addAttachedBox('CompanionBadge', 'UpperTorso', [0.40, 0.40, 0.10], [0.55, 0.35, -0.55], gold, metal);
      addAttachedBox('CompanionHeadband', 'Head', [1.85, 0.18, 1.12], [0, 0.10, 0], color3(0.85, 0.40, 0.30), fabric);
      addDetectedSecondaryTraitOverlays('companion', 'Companion');
      addUniversalRoastKit('Companion');
      addGeneralNpcVisualConfigMarker('companion', 'companion', ['companion'], [
        'scarf',
        'vest',
        'backpack',
        'badge',
      ]);
      return;
    }

    if (isQuestGiver) {
      addQuestGiverDetails();
      if (!isMage) {
        addAttachedBox('SageHood', 'Head', [1.95, 0.85, 1.20], [0, 0.40, 0], color3(0.20, 0.16, 0.40), fabric);
        addAttachedBox('SageRobeUpper', 'UpperTorso', [2.30, 1.60, 1.18], [0, -0.10, -0.02], color3(0.20, 0.16, 0.40), fabric);
        addAttachedBox('SageRobeLower', 'LowerTorso', [2.30, 0.80, 1.18], [0, -0.10, -0.02], color3(0.18, 0.14, 0.36), fabric);
        addAttachedBox('SageBeard', 'Head', [0.95, 0.80, 0.20], [0, -0.50, -0.45], color3(0.85, 0.85, 0.85), fabric);
        addAttachedBox('SageStaffShaft', 'RightHand', [0.16, 2.40, 0.16], [0.30, 0.40, 0], color3(0.40, 0.25, 0.12), leatherMat, 'Cylinder');
        addAttachedBox('SageStaffOrb', 'RightHand', [0.42, 0.42, 0.42], [0.30, 1.40, 0], color3(0.40, 0.85, 0.95), plastic, 'Sphere');
        addDetectedSecondaryTraitOverlays('quest_giver', 'QuestGiver');
        addUniversalRoastKit('QuestGiver');
        addGeneralNpcVisualConfigMarker('quest_giver', 'quest_giver', ['quest'], [
          'quest_marker',
          'scroll',
          'sage_hood',
          'sage_staff',
        ]);
        return;
      }
    }

    if (isGhost) {
      const ghostGreen = color3(0.42, 1.0, 0.35);
      const ectoBlue = color3(0.55, 0.95, 1.0);
      const deepViolet = color3(0.16, 0.10, 0.32);
      const bone = color3(0.88, 0.92, 0.78);
      const hood = addAttachedBox('SpectralHood', 'Head', [1.92, 0.42, 1.18], [0, 0.50, 0.06], deepViolet, fabric, 'Cylinder');
      addAttachedBox('SpectralHoodShadow', 'Head', [1.52, 0.28, 0.14], [0, 0.04, -0.54], color3(0.04, 0.03, 0.08), fabric);
      addAttachedBox('SpectralSkullMask', 'Head', [1.08, 0.46, 0.14], [0, -0.08, -0.56], bone, plastic);
      const leftEye = addAttachedBox('SpectralLeftEye', 'Head', [0.20, 0.20, 0.08], [-0.30, 0.02, -0.64], ghostGreen, neon, 'Sphere');
      const rightEye = addAttachedBox('SpectralRightEye', 'Head', [0.20, 0.20, 0.08], [0.30, 0.02, -0.64], ghostGreen, neon, 'Sphere');
      addPointLight(leftEye, 'SpectralEyeLightL', ghostGreen, 7, 1.4);
      addPointLight(rightEye, 'SpectralEyeLightR', ghostGreen, 7, 1.4);
      addAttachedBox('SpectralCloakBack', 'UpperTorso', [2.42, 2.05, 0.18], [0, -0.20, 0.64], color3(0.10, 0.08, 0.22), fabric);
      addAttachedBox('SpectralRobeFront', 'UpperTorso', [2.22, 1.48, 0.16], [0, -0.08, -0.60], color3(0.18, 0.12, 0.36), fabric);
      addAttachedBox('SpectralRobeLower', 'LowerTorso', [2.28, 0.82, 1.16], [0, -0.16, -0.02], color3(0.12, 0.09, 0.28), fabric);
      addAttachedBox('SpectralNeckChain', 'UpperTorso', [1.76, 0.08, 1.00], [0, 0.58, -0.54], ghostGreen, neon, 'Cylinder');
      addAttachedBox('SpectralChestAmulet', 'UpperTorso', [0.42, 0.42, 0.12], [0, 0.28, -0.68], ghostGreen, neon, 'Sphere');
      addAttachedBox('SpectralLeftShoulderWisp', 'LeftUpperArm', [1.26, 0.28, 1.26], [0, 0.52, 0], ectoBlue, neon, 'Cylinder');
      addAttachedBox('SpectralRightShoulderWisp', 'RightUpperArm', [1.26, 0.28, 1.26], [0, 0.52, 0], ectoBlue, neon, 'Cylinder');
      addAttachedBox('SpectralLeftCuff', 'LeftLowerArm', [0.92, 0.16, 0.92], [0, -0.36, 0], ghostGreen, metal, 'Cylinder');
      addAttachedBox('SpectralRightCuff', 'RightLowerArm', [0.92, 0.16, 0.92], [0, -0.36, 0], ghostGreen, metal, 'Cylinder');
      addAttachedBox('SpectralLeftHandGlow', 'LeftHand', [0.42, 0.42, 0.42], [-0.04, -0.02, -0.08], ghostGreen, neon, 'Sphere');
      addAttachedBox('SpectralRightHandGlow', 'RightHand', [0.42, 0.42, 0.42], [0.04, -0.02, -0.08], ghostGreen, neon, 'Sphere');
      addAttachedBox('SpectralLeftAnkleMist', 'LeftLowerLeg', [0.92, 0.20, 0.92], [0, -0.44, 0], ectoBlue, neon, 'Cylinder');
      addAttachedBox('SpectralRightAnkleMist', 'RightLowerLeg', [0.92, 0.20, 0.92], [0, -0.44, 0], ectoBlue, neon, 'Cylinder');
      addAttachedBox('SpectralBackShardL', 'UpperTorso', [0.18, 0.72, 0.12], [-0.82, 0.36, 0.78], ghostGreen, neon);
      addAttachedBox('SpectralBackShardR', 'UpperTorso', [0.18, 0.72, 0.12], [0.82, 0.36, 0.78], ghostGreen, neon);
      if (isGnome) {
        addAttachedBox('GnomeSpecterCapBrim', 'Head', [2.05, 0.10, 1.30], [0, 0.62, 0], color3(0.05, 0.04, 0.10), fabric);
        addAttachedBox('GnomeSpecterCapTop', 'Head', [1.20, 0.34, 0.86], [0, 0.82, 0.02], deepViolet, fabric, 'Cylinder');
        addAttachedBox('GnomeSpecterBuckle', 'Head', [0.28, 0.20, 0.08], [0.44, 0.64, -0.54], ghostGreen, neon);
      }
      if (isEnemy) {
        addAttachedBox('SpectralClawLeft', 'LeftHand', [0.16, 0.72, 0.12], [-0.20, -0.18, -0.18], ghostGreen, neon);
        addAttachedBox('SpectralClawRight', 'RightHand', [0.16, 0.72, 0.12], [0.20, -0.18, -0.18], ghostGreen, neon);
      }
      addPointLight(hood, 'SpectralAuraLight', ghostGreen, 14, 1.8);
      addDetectedSecondaryTraitOverlays('ghost', 'Ghost');
      addUniversalRoastKit('Ghost');
      addGeneralNpcVisualConfigMarker('ghost', isEnemy ? 'ghost_enemy' : 'ghost', isEnemy ? ['spectral', 'enemy'] : ['spectral'], [
        'spectral_hood',
        'skull_mask',
        'glowing_eyes',
        'spectral_cloak',
        'wisps',
      ]);
      return;
    }

    if (isEnemy) {
      addAttachedBox('EnemyHorns1', 'Head', [0.20, 0.60, 0.20], [0.42, 0.50, -0.10], darkMetal, metal);
      addAttachedBox('EnemyHorns2', 'Head', [0.20, 0.60, 0.20], [-0.42, 0.50, -0.10], darkMetal, metal);
      addAttachedBox('EnemyBrowPlate', 'Head', [1.24, 0.20, 0.12], [0, 0.16, -0.58], darkMetal, metal);
      addAttachedBox('EnemyTuskL', 'Head', [0.10, 0.30, 0.10], [-0.22, -0.30, -0.50], color3(0.95, 0.92, 0.80), plastic);
      addAttachedBox('EnemyTuskR', 'Head', [0.10, 0.30, 0.10], [0.22, -0.30, -0.50], color3(0.95, 0.92, 0.80), plastic);
      addAttachedBox('EnemySpikedCollar', 'UpperTorso', [2.24, 0.22, 1.20], [0, 0.58, -0.02], darkMetal, metal, 'Cylinder');
      addAttachedBox('EnemyChestPlate', 'UpperTorso', [2.20, 1.10, 1.14], [0, -0.10, -0.04], forest, leatherMat);
      addAttachedBox('EnemyBelt', 'LowerTorso', [2.10, 0.24, 1.12], [0, 0.18, -0.02], leather, leatherMat);
      addAttachedBox('EnemyBeltSkull', 'LowerTorso', [0.34, 0.34, 0.12], [0, 0.16, -0.54], color3(0.86, 0.82, 0.70), plastic, 'Sphere');
      addAttachedBox('EnemyLeftPauldron', 'LeftUpperArm', [1.20, 0.34, 1.20], [0, 0.42, 0], darkMetal, metal);
      addAttachedBox('EnemyRightPauldron', 'RightUpperArm', [1.20, 0.34, 1.20], [0, 0.42, 0], darkMetal, metal);
      addAttachedBox('EnemyLeftBoot', 'LeftLowerLeg', [0.82, 0.42, 0.82], [0, -0.32, -0.02], leather, leatherMat);
      addAttachedBox('EnemyRightBoot', 'RightLowerLeg', [0.82, 0.42, 0.82], [0, -0.32, -0.02], leather, leatherMat);
      addAttachedBox('EnemyClub', 'RightHand', [0.40, 1.40, 0.40], [0.40, 0.40, 0], color3(0.45, 0.30, 0.18), leatherMat, 'Cylinder');
      addAttachedBox('EnemyClubSpike', 'RightHand', [0.55, 0.40, 0.55], [0.40, 1.10, 0], darkMetal, metal, 'Sphere');
      addDetectedSecondaryTraitOverlays('enemy', 'Enemy');
      addUniversalRoastKit('Enemy');
      addGeneralNpcVisualConfigMarker('enemy', 'enemy', ['enemy'], [
        'horns',
        'brow_plate',
        'tusks',
        'spiked_collar',
        'club',
      ]);
      return;
    }

    if (llmAccessoriesApplied && !isMage && !useDeterministicHeroKit) {
      addUniversalRoastKit('LlmNpc');
      addGeneralNpcVisualConfigMarker('default', 'llm_accessory', [], ['llm_accessories'], 'llm_accessory');
      return;
    }

    if (isMage) {
      addAttachedBox('MageHatBrim', 'Head', [2.25, 0.14, 1.45], [0, 0.34, 0], color3(0.10, 0.07, 0.18), fabric);
      addAttachedBox('MageHatConeLower', 'Head', [1.35, 0.55, 1.00], [0, 0.70, 0.02], purple, fabric);
      addAttachedBox('MageHatConeUpper', 'Head', [0.78, 0.62, 0.62], [0, 1.10, 0.02], color3(0.26, 0.08, 0.42), fabric);
      addAttachedBox('MageHatTipGlow', 'Head', [0.28, 0.28, 0.28], [0, 1.48, -0.02], arcaneGlow, neon, 'Sphere');
      addAttachedBox('MageHoodShadow', 'Head', [1.72, 0.34, 0.18], [0, 0.05, -0.54], color3(0.05, 0.04, 0.08), fabric);
      addAttachedBox('MageRobeUpper', 'UpperTorso', [2.36, 1.58, 1.22], [0, -0.08, -0.04], color3(0.22, 0.09, 0.36), fabric);
      addAttachedBox('MageRobeLower', 'LowerTorso', [2.42, 0.92, 1.22], [0, -0.18, -0.04], color3(0.16, 0.06, 0.28), fabric);
      addAttachedBox('MageCape', 'UpperTorso', [2.46, 2.05, 0.18], [0, -0.18, 0.66], color3(0.08, 0.04, 0.18), fabric);
      addAttachedBox('MageGoldCollar', 'UpperTorso', [2.32, 0.22, 1.24], [0, 0.58, -0.05], gold, metal);
      addAttachedBox('MageBelt', 'LowerTorso', [2.24, 0.22, 1.16], [0, 0.20, -0.04], color3(0.17, 0.09, 0.05), leatherMat);
      addAttachedBox('MageLeftRune', 'LeftUpperArm', [1.12, 0.28, 1.12], [0, 0.32, 0], arcaneGlow, neon, 'Cylinder');
      addAttachedBox('MageRightRune', 'RightUpperArm', [1.12, 0.28, 1.12], [0, 0.32, 0], arcaneGlow, neon, 'Cylinder');
      addAttachedBox('MageStaffShaft', 'RightHand', [0.16, 2.70, 0.16], [0.36, 0.56, 0], color3(0.28, 0.16, 0.08), leatherMat, 'Cylinder');
      addAttachedBox('MageStaffCrown', 'RightHand', [0.72, 0.18, 0.72], [0.36, 1.78, 0], gold, metal);
      addAttachedBox('MageStaffOrb', 'RightHand', [0.52, 0.52, 0.52], [0.36, 1.98, 0], arcaneGlow, neon, 'Sphere');
      addAttachedBox('MageSpellOrb', 'LeftHand', [0.50, 0.50, 0.50], [-0.12, 0.10, -0.08], color3(0.70, 0.28, 1.0), neon, 'Sphere');
      if (isEnemy || isVillain) {
        addAttachedBox('MageSkullMask', 'Head', [1.06, 0.28, 0.12], [0, -0.10, -0.56], color3(0.86, 0.82, 0.70), plastic);
        addAttachedBox('MageDarkShoulderL', 'LeftUpperArm', [1.26, 0.38, 1.26], [0, 0.48, 0], darkMetal, metal);
        addAttachedBox('MageDarkShoulderR', 'RightUpperArm', [1.26, 0.38, 1.26], [0, 0.48, 0], darkMetal, metal);
      }
      addDetectedSecondaryTraitOverlays('mage', 'Mage');
      addUniversalRoastKit('Mage');
      addGeneralNpcVisualConfigMarker('mage', isEnemy || isVillain ? 'mage_enemy' : isQuestGiver ? 'mage_quest_giver' : 'mage', [
        'mage',
        ...(isEnemy || isVillain ? ['enemy' as const] : []),
        ...(isQuestGiver ? ['quest' as const] : []),
      ], [
        'mage_hat',
        'mage_robe',
        'mage_staff',
        'spell_orb',
      ]);
      return;
    }

    if (isQuestGiver) {
      addAttachedBox('SageHood', 'Head', [1.95, 0.85, 1.20], [0, 0.40, 0], color3(0.20, 0.16, 0.40), fabric);
      addAttachedBox('SageRobeUpper', 'UpperTorso', [2.30, 1.60, 1.18], [0, -0.10, -0.02], color3(0.20, 0.16, 0.40), fabric);
      addAttachedBox('SageRobeLower', 'LowerTorso', [2.30, 0.80, 1.18], [0, -0.10, -0.02], color3(0.18, 0.14, 0.36), fabric);
      addAttachedBox('SageBeard', 'Head', [0.95, 0.80, 0.20], [0, -0.50, -0.45], color3(0.85, 0.85, 0.85), fabric);
      addAttachedBox('SageStaffShaft', 'RightHand', [0.16, 2.40, 0.16], [0.30, 0.40, 0], color3(0.40, 0.25, 0.12), leatherMat, 'Cylinder');
      addAttachedBox('SageStaffOrb', 'RightHand', [0.42, 0.42, 0.42], [0.30, 1.40, 0], color3(0.40, 0.85, 0.95), plastic, 'Sphere');
      addAttachedBox('SageScroll', 'LeftHand', [0.32, 0.42, 0.32], [-0.20, -0.10, 0], color3(0.92, 0.85, 0.62), fabric);
      addDetectedSecondaryTraitOverlays('quest_giver', 'QuestGiver');
      addUniversalRoastKit('QuestGiver');
      addGeneralNpcVisualConfigMarker('quest_giver', 'quest_giver', ['quest'], [
        'sage_hood',
        'sage_robe',
        'sage_staff',
        'sage_scroll',
      ]);
      return;
    }

    if (isEnemy) {
      addAttachedBox('EnemyHorns1', 'Head', [0.20, 0.60, 0.20], [0.42, 0.50, -0.10], darkMetal, metal);
      addAttachedBox('EnemyHorns2', 'Head', [0.20, 0.60, 0.20], [-0.42, 0.50, -0.10], darkMetal, metal);
      addAttachedBox('EnemyTusk', 'Head', [0.10, 0.30, 0.10], [0.20, -0.30, -0.50], color3(0.95, 0.92, 0.80), plastic);
      addAttachedBox('EnemySpikes', 'UpperTorso', [2.20, 0.20, 1.20], [0, 0.55, 0], darkMetal, metal);
      addAttachedBox('EnemyChestPlate', 'UpperTorso', [2.20, 1.10, 1.14], [0, -0.10, -0.04], forest, leatherMat);
      addAttachedBox('EnemyClub', 'RightHand', [0.40, 1.40, 0.40], [0.40, 0.40, 0], color3(0.45, 0.30, 0.18), leatherMat);
      addAttachedBox('EnemyClubSpike', 'RightHand', [0.55, 0.40, 0.55], [0.40, 1.10, 0], darkMetal, metal);
      addDetectedSecondaryTraitOverlays('enemy', 'Enemy');
      addUniversalRoastKit('Enemy');
      addGeneralNpcVisualConfigMarker('enemy', 'enemy', ['enemy'], [
        'horns',
        'tusk',
        'spikes',
        'club',
      ]);
      return;
    }

    // ===== Modern roast personality kits (session 126) =====

    if (isGymBro) {
      // Black tank top + grey shorts + visible muscle definition + sweatband + dumbbell.
      const tankBlack = color3(0.06, 0.06, 0.08);
      const shortsGrey = color3(0.40, 0.42, 0.46);
      const skin = color3(0.92, 0.72, 0.55);
      const sweatBlue = color3(0.18, 0.42, 0.92);
      addAttachedBox('GymTankTop', 'UpperTorso', [2.30, 1.40, 1.20], [0, -0.08, -0.04], tankBlack, fabric);
      addAttachedBox('GymTankStrapL', 'UpperTorso', [0.32, 0.86, 0.18], [-0.74, 0.42, -0.62], tankBlack, fabric);
      addAttachedBox('GymTankStrapR', 'UpperTorso', [0.32, 0.86, 0.18], [0.74, 0.42, -0.62], tankBlack, fabric);
      addAttachedBox('GymPecsLeft', 'UpperTorso', [0.92, 0.62, 0.18], [-0.46, 0.20, -0.62], tankBlack, fabric, 'Sphere');
      addAttachedBox('GymPecsRight', 'UpperTorso', [0.92, 0.62, 0.18], [0.46, 0.20, -0.62], tankBlack, fabric, 'Sphere');
      addAttachedBox('GymLatFlareL', 'UpperTorso', [0.52, 1.12, 0.42], [-1.08, -0.10, 0.02], skin, plastic, 'Sphere');
      addAttachedBox('GymLatFlareR', 'UpperTorso', [0.52, 1.12, 0.42], [1.08, -0.10, 0.02], skin, plastic, 'Sphere');
      addAttachedBox('GymTrapShelf', 'UpperTorso', [1.46, 0.28, 0.86], [0, 0.64, 0.02], skin, plastic, 'Sphere');
      addAttachedBox('GymShoulderL', 'LeftUpperArm', [1.42, 0.50, 1.42], [0, 0.46, 0], skin, plastic, 'Sphere');
      addAttachedBox('GymShoulderR', 'RightUpperArm', [1.42, 0.50, 1.42], [0, 0.46, 0], skin, plastic, 'Sphere');
      addAttachedBox('GymBicepL', 'LeftUpperArm', [1.30, 0.74, 1.30], [0, 0.05, 0], skin, plastic, 'Sphere');
      addAttachedBox('GymBicepR', 'RightUpperArm', [1.30, 0.74, 1.30], [0, 0.05, 0], skin, plastic, 'Sphere');
      addAttachedBox('GymForearmPumpL', 'LeftLowerArm', [1.02, 0.66, 1.02], [0, -0.04, 0], skin, plastic, 'Sphere');
      addAttachedBox('GymForearmPumpR', 'RightLowerArm', [1.02, 0.66, 1.02], [0, -0.04, 0], skin, plastic, 'Sphere');
      addAttachedBox('GymShorts', 'LowerTorso', [2.30, 0.95, 1.18], [0, -0.10, -0.02], shortsGrey, fabric);
      addAttachedBox('GymBelt', 'LowerTorso', [2.32, 0.16, 1.20], [0, 0.30, -0.02], color3(0.18, 0.18, 0.20), leatherMat);
      addAttachedBox('GymQuadL', 'LeftUpperLeg', [0.90, 0.76, 0.90], [0, 0.02, 0], skin, plastic, 'Sphere');
      addAttachedBox('GymQuadR', 'RightUpperLeg', [0.90, 0.76, 0.90], [0, 0.02, 0], skin, plastic, 'Sphere');
      addAttachedBox('GymCalfL', 'LeftLowerLeg', [0.78, 0.60, 0.78], [0, -0.08, 0], skin, plastic, 'Sphere');
      addAttachedBox('GymCalfR', 'RightLowerLeg', [0.78, 0.60, 0.78], [0, -0.08, 0], skin, plastic, 'Sphere');
      addAttachedBox('GymSweatband', 'Head', [1.40, 0.20, 1.18], [0, 0.42, 0], sweatBlue, fabric);
      addAttachedBox('GymWristbandL', 'LeftHand', [1.20, 0.30, 1.20], [0, 0.30, 0], sweatBlue, fabric);
      addAttachedBox('GymWristbandR', 'RightHand', [1.20, 0.30, 1.20], [0, 0.30, 0], sweatBlue, fabric);
      addAttachedBox('GymProteinShaker', 'LeftHand', [0.42, 0.82, 0.42], [-0.20, -0.04, -0.12], color3(0.86, 0.92, 1.0), plastic, 'Cylinder');
      addAttachedBox('GymProteinShakerLid', 'LeftHand', [0.48, 0.12, 0.48], [-0.20, 0.42, -0.12], sweatBlue, plastic, 'Cylinder');
      addAttachedBox('GymDumbbellGrip', 'RightHand', [0.18, 0.70, 0.18], [0.30, 0.10, 0], color3(0.18, 0.18, 0.20), metal, 'Cylinder');
      addAttachedBox('GymDumbbellLeft', 'RightHand', [0.55, 0.55, 0.55], [0.30, 0.50, 0], color3(0.10, 0.10, 0.10), metal, 'Sphere');
      addAttachedBox('GymDumbbellRight', 'RightHand', [0.55, 0.55, 0.55], [0.30, -0.30, 0], color3(0.10, 0.10, 0.10), metal, 'Sphere');
      addDetectedSecondaryTraitOverlays('gym_bro', 'GymBro');
      addUniversalRoastKit('GymBro');
      addGeneralNpcVisualConfigMarker('gym_bro', 'gym_bro', ['modern_roast'], [
        'gym_tank',
        'muscles',
        'sweatband',
        'dumbbell',
      ]);
      return;
    }

    if (isGenAlpha) {
      const wantsBroccoliStreetwear = /broccoli\s*(?:hair|cut|hairstyle)|broccoli[-\s]*head|smart\s*phone|smartphone|black\s+(?:graphic\s+)?tee|cargo\s+pants|chunky\s+sneakers|брокколи|смартфон|телефон/.test(text);
      if (wantsBroccoliStreetwear) {
        const hairGreens = [
          color3(0.22, 0.38, 0.10),
          color3(0.28, 0.44, 0.14),
          color3(0.18, 0.34, 0.12),
          color3(0.34, 0.48, 0.16),
        ];
        const broccoliGreen = hairGreens[visualVariantIndex] ?? hairGreens[0];
        const broccoliShadow = color3(0.12, 0.24, 0.08);
        const teeVariants = [
          color3(0.035, 0.035, 0.045),
          color3(0.08, 0.045, 0.11),
          color3(0.035, 0.08, 0.09),
          color3(0.10, 0.075, 0.035),
        ];
        const inkVariants = [
          color3(0.16, 0.16, 0.19),
          color3(0.28, 0.12, 0.28),
          color3(0.08, 0.20, 0.20),
          color3(0.22, 0.15, 0.06),
        ];
        const pantsVariants = [
          color3(0.42, 0.62, 0.72),
          color3(0.52, 0.44, 0.66),
          color3(0.34, 0.60, 0.50),
          color3(0.56, 0.50, 0.34),
        ];
        const accentVariants = [
          color3(0.54, 0.92, 1.0),
          color3(1.0, 0.42, 0.78),
          color3(0.44, 1.0, 0.52),
          color3(1.0, 0.78, 0.28),
        ];
        const teeBlack = teeVariants[visualVariantIndex] ?? teeVariants[0];
        const teeInk = inkVariants[visualVariantIndex] ?? inkVariants[0];
        const pantsBlue = pantsVariants[visualVariantIndex] ?? pantsVariants[0];
        const variantAccent = accentVariants[visualVariantIndex] ?? accentVariants[0];
        const shoeBlack = color3(0.035, 0.035, 0.04);
        const soleWhite = color3(0.92, 0.92, 0.88);
        const phoneShell = visualVariantIndex % 2 === 0 ? color3(0.10, 0.12, 0.16) : color3(0.18, 0.18, 0.22);
        const phoneGlow = variantAccent;

        addAttachedBox('GenAlphaBlackTeeBody', 'UpperTorso', [2.38, 1.46, 1.20], [0, -0.07, -0.04], teeBlack, fabric);
        addAttachedBox('GenAlphaBlackTeeSleeveL', 'LeftUpperArm', [1.20, 0.80, 1.16], [0, 0.16, 0], teeBlack, fabric);
        addAttachedBox('GenAlphaBlackTeeSleeveR', 'RightUpperArm', [1.20, 0.80, 1.16], [0, 0.16, 0], teeBlack, fabric);
        addAttachedBox('GenAlphaGraphicTeeCircle', 'UpperTorso', [0.86, 0.86, 0.10], [0, 0.08, -0.70], teeInk, plastic, 'Sphere');
        addAttachedBox('GenAlphaGraphicTeeSlash', 'UpperTorso', [0.88, 0.12, 0.08], [0.04, 0.08, -0.80], variantAccent, neon);
        addAttachedBox('GenAlphaBlueCargoPants', 'LowerTorso', [2.34, 1.02, 1.22], [0, -0.10, -0.02], pantsBlue, fabric);
        addAttachedBox('GenAlphaCargoPocketL', 'LeftUpperLeg', [0.34, 0.54, 0.14], [-0.44, -0.08, -0.45], teeInk, fabric);
        addAttachedBox('GenAlphaCargoPocketR', 'RightUpperLeg', [0.34, 0.54, 0.14], [0.44, -0.08, -0.45], teeInk, fabric);
        addAttachedBox('GenAlphaPantCuffL', 'LeftLowerLeg', [0.88, 0.18, 0.88], [0, -0.30, -0.02], teeInk, fabric);
        addAttachedBox('GenAlphaPantCuffR', 'RightLowerLeg', [0.88, 0.18, 0.88], [0, -0.30, -0.02], teeInk, fabric);
        addAttachedBox('GenAlphaChunkySneakerL', 'LeftFoot', [1.08, 0.34, 1.36], [0, -0.06, -0.18], shoeBlack, leatherMat);
        addAttachedBox('GenAlphaChunkySneakerR', 'RightFoot', [1.08, 0.34, 1.36], [0, -0.06, -0.18], shoeBlack, leatherMat);
        addAttachedBox('GenAlphaChunkySoleLeft', 'LeftFoot', [1.16, 0.18, 1.46], [0, -0.24, -0.18], soleWhite, plastic);
        addAttachedBox('GenAlphaChunkySoleRight', 'RightFoot', [1.16, 0.18, 1.46], [0, -0.24, -0.18], soleWhite, plastic);

        addAttachedBox('GenAlphaBroccoliHairBase', 'Head', [1.42, 0.34, 1.18], [0, 0.48, 0.04], broccoliShadow, grass, 'Sphere');
        const clusterOffsets: Array<[string, number, number, number, number]> = [
          ['Top', 0, 0.82, -0.02, 0.54],
          ['FrontL', -0.42, 0.62, -0.42, 0.42],
          ['FrontR', 0.42, 0.62, -0.42, 0.42],
          ['SideL', -0.66, 0.56, 0.02, 0.40],
          ['SideR', 0.66, 0.56, 0.02, 0.40],
          ['BackL', -0.36, 0.58, 0.44, 0.44],
          ['BackR', 0.36, 0.58, 0.44, 0.44],
          ['Crown', visualVariantIndex % 2 === 0 ? 0.18 : -0.18, 0.96, 0.18, 0.36],
        ];
        for (const [name, x, y, z, sizeValue] of clusterOffsets) {
          addAttachedBox(`GenAlphaBroccoliHair${name}`, 'Head', [sizeValue, sizeValue, sizeValue], [x, y, z], broccoliGreen, grass, 'Sphere');
        }

        addAttachedBox('GenAlphaSmartphone', 'LeftHand', [0.56, 0.98, 0.10], [-0.18, -0.02, -0.12], phoneShell, plastic);
        const phoneScreen = addAttachedBox('GenAlphaSmartphoneScreenGlow', 'LeftHand', [0.44, 0.74, 0.04], [-0.18, -0.02, -0.18], phoneGlow, neon);
        addPointLight(phoneScreen, 'GenAlphaPhoneScreenLight', phoneGlow, 8, 1.15);
        addAttachedBox('GenAlphaFaceScreenGlow', 'Head', [1.06, 0.08, 0.06], [0, -0.16, -0.70], phoneGlow, neon);
        addAttachedBox('GenAlphaSmugMouth', 'Head', [0.58, 0.08, 0.06], [0.16, -0.24, -0.68], color3(0.04, 0.04, 0.045), plastic);
        addAttachedBox('GenAlphaDripPendant', 'UpperTorso', [0.30, 0.30, 0.10], [0, 0.35, -0.68], variantAccent, metal, 'Sphere');
        if (visualVariantIndex === 0) {
          addAttachedBox('GenAlphaVariantStickerBadge', 'UpperTorso', [0.34, 0.34, 0.08], [0.52, 0.26, -0.72], variantAccent, neon, 'Sphere');
        } else if (visualVariantIndex === 1) {
          addAttachedBox('GenAlphaVariantCrossbodyStrap', 'UpperTorso', [0.18, 1.82, 0.10], [-0.34, -0.08, -0.72], variantAccent, fabric);
          addAttachedBox('GenAlphaVariantSidePouch', 'LowerTorso', [0.50, 0.44, 0.22], [-0.72, -0.04, -0.50], teeInk, fabric, 'Sphere');
        } else if (visualVariantIndex === 2) {
          addAttachedBox('GenAlphaVariantMiniBackpack', 'UpperTorso', [0.86, 0.82, 0.30], [0, -0.08, 0.72], teeInk, fabric);
          addAttachedBox('GenAlphaVariantBackpackGlowPatch', 'UpperTorso', [0.42, 0.26, 0.08], [0, 0.06, 0.92], variantAccent, neon);
        } else {
          addAttachedBox('GenAlphaVariantEarbudL', 'Head', [0.16, 0.16, 0.10], [-0.62, -0.04, -0.02], variantAccent, plastic, 'Sphere');
          addAttachedBox('GenAlphaVariantEarbudR', 'Head', [0.16, 0.16, 0.10], [0.62, -0.04, -0.02], variantAccent, plastic, 'Sphere');
          addAttachedBox('GenAlphaVariantWristBand', 'RightHand', [0.86, 0.18, 0.86], [0, 0.24, 0], variantAccent, fabric, 'Cylinder');
        }
        addDetectedSecondaryTraitOverlays('gen_alpha', 'GenAlpha');
        addUniversalRoastKit('GenAlpha');
        addGeneralNpcVisualConfigMarker('gen_alpha', 'gen_alpha_broccoli_streetwear', ['modern_roast'], [
          'broccoli_hair',
          'black_graphic_tee',
          'blue_cargo_pants',
          'chunky_sneakers',
          'smartphone',
          'screen_glow',
          `visual_variant_${visualVariantIndex}`,
        ]);
        return;
      }

      const hoodieVariants = [
        color3(0.78, 0.74, 0.92),
        color3(0.72, 0.90, 0.86),
        color3(0.90, 0.70, 0.76),
        color3(0.76, 0.82, 0.58),
      ];
      const sleeveVariants = [
        color3(0.78, 0.94, 0.86),
        color3(0.96, 0.82, 0.56),
        color3(0.58, 0.84, 0.96),
        color3(0.90, 0.70, 0.94),
      ];
      const capVariants = [
        color3(0.96, 0.78, 0.66),
        color3(0.42, 0.72, 0.98),
        color3(0.96, 0.54, 0.62),
        color3(0.52, 0.86, 0.52),
      ];
      const headphoneVariants = [
        color3(0.42, 0.30, 0.82),
        color3(0.16, 0.58, 0.74),
        color3(0.82, 0.22, 0.52),
        color3(0.82, 0.62, 0.18),
      ];
      const hoodieLavender = hoodieVariants[visualVariantIndex] ?? hoodieVariants[0];
      const sleevesMint = sleeveVariants[visualVariantIndex] ?? sleeveVariants[0];
      const capPeach = capVariants[visualVariantIndex] ?? capVariants[0];
      const headphonesPurple = headphoneVariants[visualVariantIndex] ?? headphoneVariants[0];
      const headphonesPad = visualVariantIndex % 2 === 0 ? color3(0.18, 0.14, 0.32) : color3(0.08, 0.12, 0.16);
      addAttachedBox('AlphaHoodieBody', 'UpperTorso', [2.42, 1.50, 1.30], [0, -0.06, -0.04], hoodieLavender, fabric);
      addAttachedBox('AlphaHoodiePocket', 'UpperTorso', [1.58, 0.50, 0.10], [0, -0.30, -0.66], color3(0.68, 0.64, 0.84), fabric);
      addAttachedBox('AlphaHoodieDrawstringL', 'UpperTorso', [0.06, 0.58, 0.06], [-0.18, 0.38, -0.66], color3(0.94, 0.94, 0.98), fabric, 'Cylinder');
      addAttachedBox('AlphaHoodieDrawstringR', 'UpperTorso', [0.06, 0.58, 0.06], [0.18, 0.38, -0.66], color3(0.94, 0.94, 0.98), fabric, 'Cylinder');
      addAttachedBox('AlphaHoodieHood', 'Head', [1.95, 0.62, 1.30], [0, -0.20, 0.55], hoodieLavender, fabric);
      addAttachedBox('AlphaSleeveL', 'LeftUpperArm', [1.32, 1.30, 1.32], [0, -0.05, 0], sleevesMint, fabric);
      addAttachedBox('AlphaSleeveR', 'RightUpperArm', [1.32, 1.30, 1.32], [0, -0.05, 0], sleevesMint, fabric);
      addAttachedBox('AlphaJoggers', 'LowerTorso', [2.32, 1.00, 1.20], [0, -0.08, -0.02], color3(0.62, 0.65, 0.78), fabric);
      addAttachedBox('AlphaHeadphonesBand', 'Head', [1.65, 0.26, 1.50], [0, 0.38, 0], headphonesPurple, plastic);
      addAttachedBox('AlphaHeadphoneCupL', 'Head', [0.42, 0.95, 0.95], [-0.94, -0.05, 0], headphonesPurple, plastic, 'Cylinder');
      addAttachedBox('AlphaHeadphoneCupR', 'Head', [0.42, 0.95, 0.95], [0.94, -0.05, 0], headphonesPurple, plastic, 'Cylinder');
      addAttachedBox('AlphaHeadphonePadL', 'Head', [0.18, 0.78, 0.78], [-1.10, -0.05, 0], headphonesPad, fabric, 'Cylinder');
      addAttachedBox('AlphaHeadphonePadR', 'Head', [0.18, 0.78, 0.78], [1.10, -0.05, 0], headphonesPad, fabric, 'Cylinder');
      addAttachedBox('AlphaCapTop', 'Head', [1.55, 0.45, 1.40], [0, 0.78, 0.05], capPeach, fabric, 'Sphere');
      addAttachedBox('AlphaCapBrim', 'Head', [1.40, 0.10, 0.90], [0, 0.62, 0.86], capPeach, fabric);
      addAttachedBox('AlphaShadesFrame', 'Head', [1.36, 0.32, 0.10], [0, 0.06, -0.66], color3(0.06, 0.06, 0.08), plastic);
      addAttachedBox('AlphaShadesLensL', 'Head', [0.50, 0.22, 0.06], [-0.32, 0.06, -0.71], color3(0.28, 0.30, 0.36), neon);
      addAttachedBox('AlphaShadesLensR', 'Head', [0.50, 0.22, 0.06], [0.32, 0.06, -0.71], color3(0.28, 0.30, 0.36), neon);
      addAttachedBox('AlphaSmugMouth', 'Head', [0.56, 0.08, 0.06], [0.14, -0.24, -0.68], color3(0.04, 0.04, 0.045), plastic);
      addAttachedBox('AlphaPhone', 'LeftHand', [0.62, 1.08, 0.10], [-0.18, -0.05, 0], color3(0.92, 0.32, 0.56), plastic);
      if (visualVariantIndex === 0) {
        addAttachedBox('AlphaVariantStickerBadge', 'UpperTorso', [0.36, 0.36, 0.08], [0.52, 0.28, -0.72], capPeach, neon, 'Sphere');
      } else if (visualVariantIndex === 1) {
        addAttachedBox('AlphaVariantCrossbodyStrap', 'UpperTorso', [0.18, 1.82, 0.10], [0.36, -0.08, -0.72], headphonesPurple, fabric);
        addAttachedBox('AlphaVariantSidePouch', 'LowerTorso', [0.52, 0.44, 0.22], [0.72, -0.04, -0.50], headphonesPad, fabric, 'Sphere');
      } else if (visualVariantIndex === 2) {
        addAttachedBox('AlphaVariantMiniBackpack', 'UpperTorso', [0.88, 0.86, 0.30], [0, -0.10, 0.74], headphonesPurple, fabric);
        addAttachedBox('AlphaVariantBackpackPatch', 'UpperTorso', [0.42, 0.26, 0.08], [0, 0.06, 0.94], capPeach, neon);
      } else {
        addAttachedBox('AlphaVariantEarbudL', 'Head', [0.16, 0.16, 0.10], [-0.62, -0.04, -0.02], capPeach, plastic, 'Sphere');
        addAttachedBox('AlphaVariantEarbudR', 'Head', [0.16, 0.16, 0.10], [0.62, -0.04, -0.02], capPeach, plastic, 'Sphere');
        addAttachedBox('AlphaVariantWristBand', 'RightHand', [0.86, 0.18, 0.86], [0, 0.24, 0], capPeach, fabric, 'Cylinder');
      }
      addDetectedSecondaryTraitOverlays('gen_alpha', 'GenAlpha');
      addUniversalRoastKit('GenAlpha');
      addGeneralNpcVisualConfigMarker('gen_alpha', 'gen_alpha', ['modern_roast'], [
        'oversized_hoodie',
        'headphones',
        'backwards_cap',
        'phone',
        `visual_variant_${visualVariantIndex}`,
      ]);
      return;
    }

    if (isSigmaChad) {
      // Crisp white shirt, dark tie, slacks, slick aviators.
      const shirtWhite = color3(0.95, 0.95, 0.97);
      const tieDark = color3(0.10, 0.10, 0.14);
      const slacks = color3(0.18, 0.18, 0.22);
      addAttachedBox('SigmaShirt', 'UpperTorso', [2.34, 1.46, 1.20], [0, -0.06, -0.04], shirtWhite, fabric);
      addAttachedBox('SigmaCollarL', 'UpperTorso', [0.34, 0.30, 0.18], [-0.30, 0.55, -0.62], shirtWhite, fabric);
      addAttachedBox('SigmaCollarR', 'UpperTorso', [0.34, 0.30, 0.18], [0.30, 0.55, -0.62], shirtWhite, fabric);
      addAttachedBox('SigmaTieKnot', 'UpperTorso', [0.30, 0.26, 0.16], [0, 0.46, -0.62], tieDark, fabric);
      addAttachedBox('SigmaTieBlade', 'UpperTorso', [0.30, 1.30, 0.10], [0, -0.30, -0.66], tieDark, fabric);
      addAttachedBox('SigmaSlacks', 'LowerTorso', [2.30, 0.95, 1.18], [0, -0.10, -0.02], slacks, fabric);
      addAttachedBox('SigmaSlicked', 'Head', [1.30, 0.30, 1.06], [0, 0.62, 0.06], color3(0.10, 0.08, 0.06), fabric);
      addAttachedBox('SigmaAviatorFrame', 'Head', [1.36, 0.30, 0.10], [0, 0.10, -0.66], color3(0.55, 0.45, 0.20), metal);
      addAttachedBox('SigmaAviatorLensL', 'Head', [0.50, 0.24, 0.06], [-0.32, 0.10, -0.71], color3(0.10, 0.10, 0.14), neon);
      addAttachedBox('SigmaAviatorLensR', 'Head', [0.50, 0.24, 0.06], [0.32, 0.10, -0.71], color3(0.10, 0.10, 0.14), neon);
      addAttachedBox('SigmaWatch', 'LeftHand', [1.20, 0.30, 1.20], [0, 0.30, 0], color3(0.78, 0.66, 0.30), metal);
      addDetectedSecondaryTraitOverlays('sigma_chad', 'Sigma');
      addUniversalRoastKit('Sigma');
      addGeneralNpcVisualConfigMarker('sigma_chad', 'sigma_chad', ['modern_roast'], [
        'dress_shirt',
        'tie',
        'aviators',
        'watch',
      ]);
      return;
    }

    if (isMomFriend) {
      // Cardigan + apron + glasses + spatula. Wholesome but judgemental.
      const cardiganRose = color3(0.86, 0.62, 0.66);
      const apronCream = color3(0.96, 0.92, 0.84);
      const apronTrim = color3(0.62, 0.42, 0.46);
      addAttachedBox('MomCardigan', 'UpperTorso', [2.40, 1.50, 1.24], [0, -0.06, -0.04], cardiganRose, fabric);
      addAttachedBox('MomApron', 'UpperTorso', [1.90, 1.60, 0.10], [0, -0.10, -0.66], apronCream, fabric);
      addAttachedBox('MomApronStrap', 'UpperTorso', [0.18, 0.40, 0.12], [0, 0.55, -0.65], apronTrim, fabric);
      addAttachedBox('MomApronTie', 'LowerTorso', [2.40, 0.18, 0.12], [0, 0.10, -0.62], apronTrim, fabric);
      addAttachedBox('MomSkirt', 'LowerTorso', [2.40, 1.05, 1.20], [0, -0.10, -0.02], color3(0.40, 0.32, 0.42), fabric);
      addAttachedBox('MomHairBun', 'Head', [1.10, 0.95, 1.10], [0, 0.85, 0.10], color3(0.55, 0.36, 0.20), fabric, 'Sphere');
      addAttachedBox('MomGlassFrame', 'Head', [1.36, 0.28, 0.10], [0, 0.10, -0.66], color3(0.40, 0.28, 0.18), plastic);
      addAttachedBox('MomGlassLensL', 'Head', [0.46, 0.24, 0.06], [-0.32, 0.10, -0.71], color3(0.85, 0.92, 0.98), neon);
      addAttachedBox('MomGlassLensR', 'Head', [0.46, 0.24, 0.06], [0.32, 0.10, -0.71], color3(0.85, 0.92, 0.98), neon);
      addAttachedBox('MomSpatulaHandle', 'RightHand', [0.16, 0.90, 0.16], [0.18, 0.35, 0], color3(0.55, 0.36, 0.20), wood, 'Cylinder');
      addAttachedBox('MomSpatulaHead', 'RightHand', [0.40, 0.45, 0.10], [0.18, 0.92, 0], color3(0.92, 0.78, 0.62), plastic);
      addDetectedSecondaryTraitOverlays('mom_friend', 'MomFriend');
      addUniversalRoastKit('MomFriend');
      addGeneralNpcVisualConfigMarker('mom_friend', 'mom_friend', ['modern_roast'], [
        'cardigan',
        'apron',
        'glasses',
        'spatula',
      ]);
      return;
    }

    if (isSkibidi) {
      // Brainrot chaos: clashing pink/yellow/cyan, mismatched accessories.
      const wantsGoldenSkibidi = /gold|golden|золот|aurum/.test(text);
      const clashPink = wantsGoldenSkibidi ? color3(0.98, 0.72, 0.16) : color3(0.92, 0.30, 0.62);
      const clashYellow = wantsGoldenSkibidi ? color3(1.0, 0.88, 0.24) : color3(0.98, 0.92, 0.40);
      const clashCyan = wantsGoldenSkibidi ? color3(0.92, 0.86, 0.62) : color3(0.30, 0.78, 0.92);
      const toiletWhite = wantsGoldenSkibidi ? color3(1.0, 0.82, 0.24) : color3(0.95, 0.95, 0.98);
      addAttachedBox('SkibidiShirtPink', 'UpperTorso', [2.34, 0.78, 1.22], [0, 0.30, -0.04], clashPink, neon);
      addAttachedBox('SkibidiShirtYellow', 'UpperTorso', [2.34, 0.78, 1.22], [0, -0.40, -0.04], clashYellow, neon);
      addAttachedBox('SkibidiShortsCyan', 'LowerTorso', [2.32, 0.95, 1.20], [0, -0.10, -0.02], clashCyan, neon);
      addAttachedBox('SkibidiCollar', 'UpperTorso', [2.20, 0.20, 1.30], [0, 0.58, -0.05], clashCyan, neon, 'Cylinder');
      addAttachedBox('SkibidiTopHatBrim', 'Head', [2.10, 0.10, 1.40], [0, 0.42, 0], clashPink, fabric);
      addAttachedBox('SkibidiTopHat', 'Head', [1.10, 1.00, 1.10], [0, 1.02, 0], clashCyan, fabric, 'Cylinder');
      addAttachedBox('SkibidiToiletEar', 'Head', [0.30, 0.90, 0.62], [0.78, 0.10, 0], toiletWhite, plastic, 'Cylinder');
      if (wantsGoldenSkibidi) {
        const goldGlow = addAttachedBox('SkibidiGoldenAuraCore', 'UpperTorso', [0.54, 0.54, 0.14], [0, 0.30, -0.78], color3(1.0, 0.78, 0.08), neon, 'Sphere');
        addPointLight(goldGlow, 'SkibidiGoldenAuraLight', color3(1.0, 0.76, 0.16), 11, 1.4);
        addAttachedBox('SkibidiGoldenBelt', 'LowerTorso', [2.24, 0.18, 1.18], [0, 0.22, -0.02], color3(1.0, 0.82, 0.12), metal);
        addAttachedBox('SkibidiGoldenCrownGem', 'Head', [0.34, 0.34, 0.12], [0, 0.68, -0.66], color3(1.0, 0.90, 0.20), neon, 'Sphere');
      }
      addAttachedBox('SkibidiBoltL', 'LeftHand', [0.50, 0.50, 0.50], [-0.20, 0.20, 0], clashYellow, neon, 'Sphere');
      addAttachedBox('SkibidiBoltR', 'RightHand', [0.50, 0.50, 0.50], [0.20, 0.20, 0], clashPink, neon, 'Sphere');
      addDetectedSecondaryTraitOverlays('skibidi', 'Skibidi');
      addUniversalRoastKit('Skibidi');
      addGeneralNpcVisualConfigMarker('skibidi', 'skibidi', ['modern_roast'], [
        'clashing_outfit',
        ...(wantsGoldenSkibidi ? ['golden_aura' as const] : []),
        'top_hat',
        'toilet_ear',
        'chaos_bolts',
      ]);
      return;
    }

    // Default (dialogue/quest_giver fallback): chest accent + shoulder badge.
    addAttachedBox('NpcChestAccent', 'UpperTorso', [2.15, 0.22, 1.14], [0, 0.24, -0.08], accent, metal);
    addAttachedBox('NpcShoulderBadge', 'RightUpperArm', [1.15, 0.28, 1.15], [0, 0.34, 0], accent, metal);
    addDetectedSecondaryTraitOverlays('default', 'DefaultNpc');
    addUniversalRoastKit('DefaultNpc');
    addGeneralNpcVisualConfigMarker('default', 'default', [], [
      'chest_accent',
      'shoulder_badge',
    ], useDeterministicHeroKit || llmAccessoriesApplied || isRoastNpcMode ? 'passed' : 'fallback_basic');
  }

  // Skip procedural template accessories (helmet/armor/coat/etc.) when the
  // user picked a 3D-mesh pipeline. These accessories are welded to R15 body
  // parts; with R15 hidden (hideR15Placeholder) they would render as
  // disembodied "ghost armor" floating next to the AI mesh. The custom mesh
  // is the only visual the user wants in this mode.
  if (isNpcFallbackModel && !hideR15Placeholder) {
    addNpcFallbackDetails();
  }

  scene.push({
    id: uuidv4(),
    className: 'SpecialMesh',
    name: 'Mesh',
    parentId: partIds['Head'],
    properties: {
      MeshType: { __type: 'Enum', value: 0 },
      Scale: vector3(1.25, 1.25, 1.25),
    },
  });

  const shouldAddReadableFaceDecal = !isNpcFallbackModel || !hideR15Placeholder;
  if (shouldAddReadableFaceDecal) {
    scene.push({
      id: uuidv4(),
      className: 'Decal',
      name: 'face',
      parentId: partIds['Head'],
      properties: {
        Texture: 'rbxasset://textures/face.png',
        Face: { __type: 'Enum', value: 5 },
      },
    });
  }

  for (const joint of r15Joints) {
    scene.push(makeMotor6D(
      joint.name,
      partIds[joint.part0],
      partIds[joint.part1],
      partIds[joint.part0],
      cframe(joint.c0[0] * s.w, joint.c0[1] * s.h, joint.c0[2] * s.d),
      cframe(joint.c1[0] * s.w, joint.c1[1] * s.h, joint.c1[2] * s.d),
    ));
  }

  // ── Standard R15 Attachments (required for Avatar validation & accessories) ──
  // Euler → rotation matrix helper (degrees, XYZ intrinsic order)
  const deg = Math.PI / 180;
  const eulerToRotation = (rx: number, ry: number, rz: number): number[] => {
    const cx = Math.cos(rx * deg), sx = Math.sin(rx * deg);
    const cy = Math.cos(ry * deg), sy = Math.sin(ry * deg);
    const cz = Math.cos(rz * deg), sz = Math.sin(rz * deg);
    return [
      cy * cz, -cy * sz, sy,
      cx * sz + sx * sy * cz, cx * cz - sx * sy * sz, -sx * cy,
      sx * sz - cx * sy * cz, sx * cz + cx * sy * sz, cx * cy,
    ];
  };
  const r15Attachments: Array<{ name: string; parent: string; pos: [number, number, number]; rot?: number[] }> = [
    // Grip attachments (required for tool holding) — orientations from Roblox spec
    { name: 'RightGripAttachment', parent: 'RightHand', pos: [0, -0.2, 0], rot: eulerToRotation(-57, -90, 90) },
    { name: 'LeftGripAttachment', parent: 'LeftHand', pos: [0, -0.2, 0], rot: eulerToRotation(-57, 90, -90) },
    // Rig attachments (match Motor6D C0/C1 positions for proper joint deformation)
    { name: 'RootRigAttachment', parent: 'HumanoidRootPart', pos: [0, -0.7, 0] },
    { name: 'WaistRigAttachment_0', parent: 'LowerTorso', pos: [0, 0.2, 0] },
    { name: 'WaistRigAttachment_1', parent: 'UpperTorso', pos: [0, -0.8, 0] },
    { name: 'NeckRigAttachment_0', parent: 'UpperTorso', pos: [0, 0.8, 0] },
    { name: 'NeckRigAttachment_1', parent: 'Head', pos: npcNeckC1 },
    { name: 'LeftShoulderRigAttachment_0', parent: 'UpperTorso', pos: [-1, 0.5, 0] },
    { name: 'LeftShoulderRigAttachment_1', parent: 'LeftUpperArm', pos: [0.5, 0.5, 0] },
    { name: 'RightShoulderRigAttachment_0', parent: 'UpperTorso', pos: [1, 0.5, 0] },
    { name: 'RightShoulderRigAttachment_1', parent: 'RightUpperArm', pos: [-0.5, 0.5, 0] },
    { name: 'LeftElbowRigAttachment_0', parent: 'LeftUpperArm', pos: [0, -0.6, 0] },
    { name: 'LeftElbowRigAttachment_1', parent: 'LeftLowerArm', pos: [0, 0.6, 0] },
    { name: 'RightElbowRigAttachment_0', parent: 'RightUpperArm', pos: [0, -0.6, 0] },
    { name: 'RightElbowRigAttachment_1', parent: 'RightLowerArm', pos: [0, 0.6, 0] },
    { name: 'LeftWristRigAttachment_0', parent: 'LeftLowerArm', pos: [0, -0.6, 0] },
    { name: 'LeftWristRigAttachment_1', parent: 'LeftHand', pos: [0, 0.3, 0] },
    { name: 'RightWristRigAttachment_0', parent: 'RightLowerArm', pos: [0, -0.6, 0] },
    { name: 'RightWristRigAttachment_1', parent: 'RightHand', pos: [0, 0.3, 0] },
    { name: 'LeftHipRigAttachment_0', parent: 'LowerTorso', pos: [-0.5, -0.2, 0] },
    { name: 'LeftHipRigAttachment_1', parent: 'LeftUpperLeg', pos: [0, 0.6, 0] },
    { name: 'RightHipRigAttachment_0', parent: 'LowerTorso', pos: [0.5, -0.2, 0] },
    { name: 'RightHipRigAttachment_1', parent: 'RightUpperLeg', pos: [0, 0.6, 0] },
    { name: 'LeftKneeRigAttachment_0', parent: 'LeftUpperLeg', pos: [0, -0.6, 0] },
    { name: 'LeftKneeRigAttachment_1', parent: 'LeftLowerLeg', pos: [0, 0.6, 0] },
    { name: 'RightKneeRigAttachment_0', parent: 'RightUpperLeg', pos: [0, -0.6, 0] },
    { name: 'RightKneeRigAttachment_1', parent: 'RightLowerLeg', pos: [0, 0.6, 0] },
    { name: 'LeftAnkleRigAttachment_0', parent: 'LeftLowerLeg', pos: [0, -0.6, 0] },
    { name: 'LeftAnkleRigAttachment_1', parent: 'LeftFoot', pos: [0, 0.2, 0] },
    { name: 'RightAnkleRigAttachment_0', parent: 'RightLowerLeg', pos: [0, -0.6, 0] },
    { name: 'RightAnkleRigAttachment_1', parent: 'RightFoot', pos: [0, 0.2, 0] },
    // Accessory attachment points
    { name: 'HatAttachment', parent: 'Head', pos: [0, 0.5, 0] },
    { name: 'HairAttachment', parent: 'Head', pos: [0, 0.5, 0] },
    { name: 'FaceFrontAttachment', parent: 'Head', pos: [0, 0, -0.5] },
    { name: 'FaceCenterAttachment', parent: 'Head', pos: [0, 0, 0] },
    { name: 'WaistFrontAttachment', parent: 'LowerTorso', pos: [0, 0, -0.5] },
    { name: 'WaistBackAttachment', parent: 'LowerTorso', pos: [0, 0, 0.5] },
    { name: 'WaistCenterAttachment', parent: 'LowerTorso', pos: [0, 0, 0] },
    { name: 'BodyFrontAttachment', parent: 'UpperTorso', pos: [0, 0, -0.5] },
    { name: 'BodyBackAttachment', parent: 'UpperTorso', pos: [0, 0, 0.5] },
    { name: 'LeftShoulderAttachment', parent: 'LeftUpperArm', pos: [0, 0.5, 0] },
    { name: 'RightShoulderAttachment', parent: 'RightUpperArm', pos: [0, 0.5, 0] },
    { name: 'LeftFootAttachment', parent: 'LeftFoot', pos: [0, -0.2, 0] },
    { name: 'RightFootAttachment', parent: 'RightFoot', pos: [0, -0.2, 0] },
  ];
  for (const att of r15Attachments) {
    const parentId = partIds[att.parent];
    if (!parentId) continue;
    const props: Record<string, unknown> = {
      CFrame: att.rot
        ? { __type: 'CFrame', position: { x: att.pos[0] * s.w, y: att.pos[1] * s.h, z: att.pos[2] * s.d }, rotation: att.rot }
        : cframe(att.pos[0] * s.w, att.pos[1] * s.h, att.pos[2] * s.d),
    };
    scene.push({ id: uuidv4(), className: 'Attachment', name: att.name, parentId, properties: props });
  }

  if (sourceModelUrl) {
    scene.push({
      id: uuidv4(),
      className: 'StringValue',
      name: 'AI_ModelURL',
      parentId: rootModelId,
      properties: { Value: sourceModelUrl },
    });
  }

  if (shirtTextureUrl) {
    scene.push({
      id: uuidv4(),
      className: 'Shirt',
      name: 'Shirt',
      parentId: rootModelId,
      properties: {
        ShirtTemplate: shirtTextureUrl,
      },
    });
  }

  if (pantsTextureUrl) {
    scene.push({
      id: uuidv4(),
      className: 'Pants',
      name: 'Pants',
      parentId: rootModelId,
      properties: {
        PantsTemplate: pantsTextureUrl,
      },
    });
  }

  if (hasMeshAsset && textureAssetId) {
    const allBodyPartIds = R15_PART_NAMES.filter((n) => n !== 'HumanoidRootPart').map((n) => partIds[n]);
    for (const partId of allBodyPartIds) {
      const normalMap = typeof metadata.normalMapAssetId === 'string' ? metadata.normalMapAssetId : undefined;
      const roughnessMap = typeof metadata.roughnessMapAssetId === 'string' ? metadata.roughnessMapAssetId : undefined;
      if (normalMap || roughnessMap) {
        scene.push(makeSurfaceAppearanceNode({
          parentId: partId,
          colorMap: toRobloxAssetUrl(textureAssetId),
          normalMap: normalMap ? toRobloxAssetUrl(normalMap) : undefined,
          roughnessMap: roughnessMap ? toRobloxAssetUrl(roughnessMap) : undefined,
        }));
      }
    }
  }

  const assets: RobloxAssetRef[] = [];
  // NOTE: Do NOT add mesh asset ref here for characters — Open Cloud uploads GLB
  // as "Model" asset type which MeshPart cannot load (MeshId only accepts "Mesh" type).
  // Character mesh is loaded at runtime via InsertService script (LoadCharacterMesh).
  // Only add texture asset ref for SurfaceAppearance.
  if (textureAssetId) {
    assets.push(buildAssetRef({
      name: 'CharacterTexture',
      assetType: 'texture',
      textureId: toRobloxAssetUrl(textureAssetId),
      robloxAssetId: typeof metadata.textureRobloxId === 'number' ? metadata.textureRobloxId as number : undefined,
    }));
  }

  const contentCategory = typeof metadata.contentCategory === 'string' ? metadata.contentCategory : '';
  const contentSubcategory = typeof metadata.contentSubcategory === 'string' ? metadata.contentSubcategory : '';
  // NPC chat (`contentSubcategory='npcs'`, `contentCategory='npc_ai'`) must always
  // be treated as character — interview prompts often mention clothing keywords
  // ("fur", "cape", "armor") that would otherwise misroute via the regex below.
  const isCharacterModel = contentSubcategory === 'characters'
    || contentSubcategory === 'npcs'
    || contentCategory === 'npc_ai'
    || IS_CHARACTER_PROMPT.test(args.prompt);
  const isClothing = !isCharacterModel
    && (['ugc_clothing', 'ugc_accessory'].includes(contentCategory)
      || /jacket|shirt|pants|dress|coat|hat|helmet|crown|cape|armor|shoe|boot|glove/i.test(args.prompt));

  if (isClothing && sourceModelUrl) {
    const accessoryFolderId = uuidv4();
    scene.push({
      id: accessoryFolderId,
      className: 'Folder',
      name: 'GeneratedClothing',
      parentId: 'ReplicatedStorage',
    });

    const accessoryId = uuidv4();
    const handleId = uuidv4();
    scene.push({
      id: accessoryId,
      className: 'Accessory',
      name: normalizedModelName,
      parentId: accessoryFolderId,
    });
    scene.push({
      id: handleId,
      className: 'MeshPart',
      name: 'Handle',
      parentId: accessoryId,
      properties: {
        Size: vector3(2 * s.w, 2 * s.h, 1 * s.d),
        CFrame: cframe(0, 0, 0),
        Anchored: false,
        CanCollide: false,
        ...(meshAssetId ? { MeshId: toRobloxAssetUrl(meshAssetId) } : {}),
        ...(textureAssetId ? { TextureID: toRobloxAssetUrl(textureAssetId) } : {}),
      },
    });
    scene.push({
      id: uuidv4(),
      className: 'Attachment',
      name: 'BodyFrontAttachment',
      parentId: handleId,
      properties: { CFrame: cframe(0, 0, 0) },
    });
    if (sourceModelUrl) {
      scene.push({
        id: uuidv4(),
        className: 'StringValue',
        name: 'AI_ModelURL',
        parentId: accessoryId,
        properties: { Value: sourceModelUrl },
      });
    }
    if (textureAssetId) {
      scene.push(makeSurfaceAppearanceNode({
        parentId: handleId,
        colorMap: toRobloxAssetUrl(textureAssetId),
      }));
    }
  }

  const autoEquipScript = buildClothingAutoEquipScript();

  const animateScript = buildR15AnimateScript();
  const meshLoaderScript = buildMeshLoaderScript(normalizedModelName, sourceModelUrl);

  // ── NPC-specific nodes ──
  const npcScriptsArray = Array.isArray(metadata.npcScripts) ? metadata.npcScripts as Array<{ name: string; scriptType: string; container: string; source: string }> : [];
  const isNpcModel = npcScriptsArray.length > 0;
  const npcRoleStr = typeof metadata.npcRole === 'string' ? metadata.npcRole : '';
  const npcExternalScripts: RobloxBuildScript[] = [];

  if (isNpcModel) {
    // Slower walk speed for NPCs
    const humanoidNode = scene.find((n) => n.className === 'Humanoid');
    if (humanoidNode) {
      humanoidNode.properties = { ...humanoidNode.properties, WalkSpeed: 8 };
    }

    // ProximityPrompt for player interaction. Keep it on a stable root
    // attachment instead of Head so external mesh scaling/visibility cannot
    // make the talk action disappear.
    const promptActionText = npcRoleStr === 'quest_giver'
      ? 'Quest'
      : npcRoleStr === 'merchant'
        ? 'Trade'
        : 'Talk';
    const promptObjectText = '';

    const talkAttachmentId = uuidv4();
    // Talk prompt sits above NPC's head — Y offset relative to HumanoidRootPart.
    // Was 2.6 → moved to 4.5 because the prompt was overlapping the NPC's torso/face
    // for static-baked skinned MeshPart NPCs (changelog-312 test feedback). Bumping
    // by ~2 stud puts the prompt cleanly above the head where it's tappable without
    // covering the figure.
    scene.push({
      id: talkAttachmentId,
      className: 'Attachment',
      name: 'TalkAttachment',
      parentId: rootPartId,
      properties: {
        CFrame: cframe(0, 4.5, -1.2),
      },
    });

    scene.push({
      id: uuidv4(),
      className: 'ProximityPrompt',
      name: 'TalkPrompt',
      parentId: talkAttachmentId,
      properties: {
        ActionText: promptActionText,
        ObjectText: promptObjectText,
        MaxActivationDistance: 14,
        MaxIndicatorDistance: 20,
        HoldDuration: 0,
        ClickablePrompt: true,
        Style: { __type: 'Enum', enumType: 'ProximityPromptStyle', enumName: 'Custom', value: 1 },
        UIOffset: { __type: 'Vector2', X: 0, Y: -80 },
        KeyboardKeyCode: { __type: 'Enum', enumType: 'KeyCode', enumName: 'E', value: 101 },
        RequiresLineOfSight: false,
      },
    });

    if (npcRoleStr === 'quest_giver') {
      const questMarkerGuiId = uuidv4();
      const questMarkerPanelId = uuidv4();
      scene.push(
        {
          id: questMarkerGuiId,
          className: 'BillboardGui',
          name: 'QuestMarker',
          parentId: partIds['Head'],
          properties: {
            Size: { __type: 'UDim2', XScale: 0, XOffset: 82, YScale: 0, YOffset: 54 },
            StudsOffset: { __type: 'Vector3', x: 0, y: 3.85, z: 0 },
            AlwaysOnTop: true,
            MaxDistance: 56,
            LightInfluence: 0,
          },
        },
        {
          id: questMarkerPanelId,
          className: 'Frame',
          name: 'QuestPanel',
          parentId: questMarkerGuiId,
          properties: {
            Size: { __type: 'UDim2', XScale: 1, XOffset: 0, YScale: 1, YOffset: 0 },
            BackgroundTransparency: 1,
            BorderSizePixel: 0,
          },
        },
        {
          id: uuidv4(),
          className: 'TextLabel',
          name: 'QuestBang',
          parentId: questMarkerPanelId,
          properties: {
            Size: { __type: 'UDim2', XScale: 1, XOffset: 0, YScale: 0.62, YOffset: 0 },
            Position: { __type: 'UDim2', XScale: 0, XOffset: 0, YScale: 0, YOffset: 0 },
            BackgroundTransparency: 1,
            Text: '!',
            TextColor3: color3(1, 0.84, 0.12),
            TextScaled: true,
            FontFace: { __type: 'Font', family: 'rbxasset://fonts/families/GothamSSm.json', weight: 'Bold', style: 'Normal' },
          },
        },
        {
          id: uuidv4(),
          className: 'TextLabel',
          name: 'QuestLabel',
          parentId: questMarkerPanelId,
          properties: {
            Size: { __type: 'UDim2', XScale: 1, XOffset: 0, YScale: 0.38, YOffset: 0 },
            Position: { __type: 'UDim2', XScale: 0, XOffset: 0, YScale: 0.62, YOffset: 0 },
            BackgroundTransparency: 1,
            Text: 'Quest',
            TextColor3: color3(1, 1, 1),
            TextScaled: true,
            FontFace: { __type: 'Font', family: 'rbxasset://fonts/families/GothamSSm.json', weight: 'Bold', style: 'Normal' },
          },
        },
      );
    }

    // Name displayed via Humanoid.DisplayName (set by NpcServer at runtime).
    // We don't add a custom BillboardGui — that would duplicate Roblox's built-in
    // nameplate above the Humanoid health bar.

    // NPC role indicator (StringValue for scripts to read)
    scene.push({
      id: uuidv4(),
      className: 'StringValue',
      name: 'NpcRole',
      parentId: rootModelId,
      properties: { Value: npcRoleStr },
    });

    if (generatedNpcAccessoryAssets.length > 0) {
      scene.push({
        id: uuidv4(),
        className: 'StringValue',
        name: 'NPCGeneratedAccessoryAssets',
        parentId: rootModelId,
        properties: {
          Value: JSON.stringify(generatedNpcAccessoryAssets.map((asset) => ({
            key: asset.key,
            displayName: asset.displayName,
            assetId: asset.assetId,
            bodyPartName: asset.bodyPartName,
            attachmentName: asset.attachmentName,
            targetLongestAxis: asset.targetLongestAxis,
            provider: asset.provider,
          }))),
        },
      });
      scene.push({
        id: uuidv4(),
        className: 'Script',
        name: 'LoadGeneratedNpcAccessories',
        parentId: rootModelId,
        properties: {
          Source: buildGeneratedNpcAccessoryLoaderScript(generatedNpcAccessoryAssets),
        },
      });
    }

    const shouldUseNpcAnimator = !(isNpcFallbackModel
      && npcVisualPipeline === 'mesh_asset_v1'
      && npcMeshMotionMode === 'skinned_visual'
      && !enableSkinnedNpcLimbAnimations);
    if (shouldUseNpcAnimator) {
      scene.push({
        id: uuidv4(),
        className: 'Script',
        name: 'NpcAnimator',
        parentId: rootModelId,
        properties: {
          Source: buildNpcAnimatorScript(),
        },
      });
    }

    // Embed all NPC scripts inside the Model so the .rbxm package is fully
    // self-contained when dragged into Workspace. LocalScripts do not run from
    // arbitrary Workspace parents in modern Roblox, so we ship them Disabled=true
    // and let `NpcClientReplicator` (server Script below) clone an enabled copy
    // into each player's PlayerGui on PlayerAdded.
    let hasBundledLocalScript = false;
    for (const ns of npcScriptsArray) {
      const scriptClass = ns.scriptType === 'ModuleScript' ? 'ModuleScript'
        : ns.scriptType === 'LocalScript' ? 'LocalScript' : 'Script';
      const isPlayerScript = scriptClass === 'LocalScript' || /StarterPlayerScripts/i.test(ns.container ?? '');
      scene.push({
        id: uuidv4(),
        className: isPlayerScript ? 'LocalScript' : scriptClass,
        name: ns.name,
        parentId: rootModelId,
        properties: isPlayerScript
          ? { Source: ns.source, Disabled: true }
          : { Source: ns.source },
      });
      if (isPlayerScript) hasBundledLocalScript = true;
    }

    if (hasBundledLocalScript) {
      scene.push({
        id: uuidv4(),
        className: 'Script',
        name: 'NpcClientReplicator',
        parentId: rootModelId,
        properties: {
          Source: buildNpcClientReplicatorScript(),
        },
      });
    }
  }

  // NPC packages exclude player-oriented scripts: the R6 auto-scaler `AI_MeshLoader`
  // moves R15 HumanoidRootPart up by +3 studs and Head to absolute +4.5, breaking
  // the Motor6D rig and shrinking the model so feet sink below the floor; the
  // `Animate` LocalScript and `AutoEquipClothing` apply only to player characters.
  // NPC animation is handled by the in-model `NpcAnimator` Script.
  // For NPCs we strip CharacterBootstrap too — it accesses `Workspace.GeneratedContent`
  // which only exists in the full character/UGC pipeline scaffolding, and throws
  // "is not a valid member of Workspace" when an NPC .rbxm is dragged into a fresh place.
  const baseScripts: RobloxBuildScript[] = [
    {
      id: uuidv4(),
      name: 'CharacterConfig',
      scriptType: 'ModuleScript',
      container: 'ReplicatedStorage',
      source: buildSharedConfigModule(args.title, args.summary, ['Character', 'Rig', 'AnimationReady', 'AI_Mesh'], metadata),
    },
    ...(isNpcModel ? [] : [
      {
        id: uuidv4(),
        name: 'CharacterBootstrap',
        scriptType: 'Script' as const,
        container: 'ServerScriptService' as const,
        source: args.starterScript,
      },
      {
        id: uuidv4(),
        name: 'Animate',
        scriptType: 'LocalScript' as const,
        container: 'StarterPlayerScripts' as const,
        source: animateScript,
      },
      {
        id: uuidv4(),
        name: 'AI_MeshLoader',
        scriptType: 'Script' as const,
        container: 'ServerScriptService' as const,
        source: meshLoaderScript,
      },
      {
        id: uuidv4(),
        name: 'AutoEquipClothing',
        scriptType: 'Script' as const,
        container: 'ServerScriptService' as const,
        source: autoEquipScript,
      },
    ]),
    ...npcExternalScripts,
  ];
  const embeddedModels = hasBakedSkinnedEditModel && skinnedMeshModelRbxmBase64
    ? [{
        id: uuidv4(),
        name: 'BakedGeneratedSkinnedBody',
        parentId: rootModelId,
        contentBase64: skinnedMeshModelRbxmBase64,
        mode: 'npc_skinned_body' as const,
        targetHeight: NPC_MESH_TARGET_HEIGHT_STUDS,
        textureId: skinnedTextureUrl,
      }]
    : undefined;

  return {
    id: uuidv4(),
    title: args.title,
    summary: args.summary,
    target: 'model',
    formatPreference: 'binary',
    scene,
    embeddedModels,
    assets: assets.length > 0 ? assets : undefined,
    scripts: baseScripts,
    ui: [],
    metadata: {
      prompt: args.prompt,
      rigType: 'R15',
      generatedBy: isNpcModel ? 'roblox-worker NPC character pipeline' : 'roblox-worker character pipeline',
      sourceModelUrl,
      isClothing,
      isNpc: isNpcModel,
      npcRole: npcRoleStr || undefined,
      // Spread metadata but exclude mesh/texture asset IDs — they cause the external
      // RBXM worker to generate a broken MeshPart (Model assets are not compatible with MeshId).
      // Character mesh is loaded at runtime via InsertService (LoadCharacterMesh script).
      ...Object.fromEntries(
        Object.entries(metadata).filter(([k]) =>
          ![
            'meshAssetId',
            'meshRobloxId',
            'textureAssetId',
            'textureRobloxId',
            'skinnedMeshModelRbxmBase64',
          ].includes(k)
        ),
      ),
      // Pass the asset ID only for the InsertService script to use
      insertServiceAssetId: meshAssetId ? parseInt(meshAssetId, 10) || undefined : undefined,
    },
  };
}

function makeMotor6D(
  name: string,
  part0Id: string,
  part1Id: string,
  parentId: string,
  c0?: Record<string, unknown>,
  c1?: Record<string, unknown>,
): RobloxBuildSceneNode {
  const properties: Record<string, unknown> = {
    Part0: { __type: 'Ref', id: part0Id },
    Part1: { __type: 'Ref', id: part1Id },
  };
  if (c0) properties.C0 = c0;
  if (c1) properties.C1 = c1;
  return {
    id: uuidv4(),
    className: 'Motor6D',
    name,
    parentId,
    properties,
  };
}

function cframe(x: number, y: number, z: number): Record<string, unknown> {
  return { __type: 'CFrame', position: { x, y, z }, rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1] };
}

function vector3(x: number, y: number, z: number): Record<string, unknown> {
  return { __type: 'Vector3', x, y, z };
}

function color3(r: number, g: number, b: number): Record<string, unknown> {
  return { __type: 'Color3', r, g, b };
}

// Parse #RRGGBB / #RGB into Color3 (0..1). Returns null on invalid input.
function hexToColor3(hex: unknown): { r: number; g: number; b: number } | null {
  if (typeof hex !== 'string') return null;
  const clean = hex.replace('#', '').trim();
  const normalized = clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean;
  if (normalized.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(normalized)) return null;
  const n = Number.parseInt(normalized, 16);
  return {
    r: ((n >> 16) & 0xff) / 255,
    g: ((n >> 8) & 0xff) / 255,
    b: (n & 0xff) / 255,
  };
}

function color3FromHex(hex: unknown, fallback: { r: number; g: number; b: number }): Record<string, unknown> {
  const parsed = hexToColor3(hex);
  const rgb = parsed ?? fallback;
  return color3(rgb.r, rgb.g, rgb.b);
}

function enumValue(enumType: string, enumName: string, fallbackValue?: number): Record<string, unknown> {
  return { __type: 'Enum', enumType, enumName, value: fallbackValue };
}

export function cframeWithRotation(
  x: number, y: number, z: number,
  r00: number, r01: number, r02: number,
  r10: number, r11: number, r12: number,
  r20: number, r21: number, r22: number,
): Record<string, unknown> {
  return {
    __type: 'CFrame',
    position: { x, y, z },
    rotation: [r00, r01, r02, r10, r11, r12, r20, r21, r22],
  };
}

function makeMeshPartNode(args: {
  name: string;
  parentId: string;
  meshId: string;
  textureId?: string;
  size?: [number, number, number];
  position?: [number, number, number];
  rotation?: number[];
  anchored?: boolean;
  color?: { r: number; g: number; b: number };
}): RobloxBuildSceneNode {
  const id = uuidv4();
  const properties: Record<string, unknown> = {
    Anchored: args.anchored ?? true,
    MeshId: args.meshId,
  };
  if (args.textureId) {
    properties.TextureID = args.textureId;
  }
  if (args.size) {
    properties.Size = vector3(...args.size);
  }
  if (args.position) {
    if (args.rotation && args.rotation.length === 9) {
      properties.CFrame = {
        __type: 'CFrame',
        position: { x: args.position[0], y: args.position[1], z: args.position[2] },
        rotation: args.rotation,
      };
    } else {
      properties.CFrame = cframe(...args.position);
    }
  }
  if (args.color) {
    properties.Color = color3(args.color.r, args.color.g, args.color.b);
  }
  return { id, className: 'MeshPart', name: args.name, parentId: args.parentId, properties };
}

function makeSoundNode(args: {
  name: string;
  parentId: string;
  soundId: string;
  volume?: number;
  looped?: boolean;
  playOnRemove?: boolean;
}): RobloxBuildSceneNode {
  const properties: Record<string, unknown> = {
    SoundId: args.soundId,
  };
  if (args.volume !== undefined) properties.Volume = args.volume;
  if (args.looped !== undefined) properties.Looped = args.looped;
  if (args.playOnRemove !== undefined) properties.PlayOnRemove = args.playOnRemove;
  return { id: uuidv4(), className: 'Sound', name: args.name, parentId: args.parentId, properties };
}

function makeDecalNode(args: {
  name: string;
  parentId: string;
  texture: string;
  face?: string;
  transparency?: number;
}): RobloxBuildSceneNode {
  const properties: Record<string, unknown> = {
    Texture: args.texture,
  };
  if (args.face) {
    const faceEnumMap: Record<string, number> = {
      Top: 1, Bottom: 4, Front: 5, Back: 2, Left: 3, Right: 0,
    };
    properties.Face = enumValue('NormalId', args.face, faceEnumMap[args.face]);
  }
  if (args.transparency !== undefined) properties.Transparency = args.transparency;
  return { id: uuidv4(), className: 'Decal', name: args.name, parentId: args.parentId, properties };
}

function makeSurfaceAppearanceNode(args: {
  name?: string;
  parentId: string;
  colorMap?: string;
  normalMap?: string;
  metalnessMap?: string;
  roughnessMap?: string;
}): RobloxBuildSceneNode {
  const properties: Record<string, unknown> = {};
  if (args.colorMap) properties.ColorMap = args.colorMap;
  if (args.normalMap) properties.NormalMap = args.normalMap;
  if (args.metalnessMap) properties.MetalnessMap = args.metalnessMap;
  if (args.roughnessMap) properties.RoughnessMap = args.roughnessMap;
  return {
    id: uuidv4(),
    className: 'SurfaceAppearance',
    name: args.name ?? 'SurfaceAppearance',
    parentId: args.parentId,
    properties,
  };
}

function makeTextureNode(args: {
  name?: string;
  parentId: string;
  texture: string;
  face?: string;
  studPerTileU?: number;
  studPerTileV?: number;
}): RobloxBuildSceneNode {
  const properties: Record<string, unknown> = {
    Texture: args.texture,
  };
  if (args.face) {
    const faceEnumMap: Record<string, number> = {
      Top: 1, Bottom: 4, Front: 5, Back: 2, Left: 3, Right: 0,
    };
    properties.Face = enumValue('NormalId', args.face, faceEnumMap[args.face]);
  }
  if (args.studPerTileU !== undefined) properties.StudsPerTileU = args.studPerTileU;
  if (args.studPerTileV !== undefined) properties.StudsPerTileV = args.studPerTileV;
  return {
    id: uuidv4(),
    className: 'Texture',
    name: args.name ?? 'Texture',
    parentId: args.parentId,
    properties,
  };
}

function toRobloxAssetUrl(idOrUrl: string): string {
  if (idOrUrl.startsWith('rbxassetid://') || idOrUrl.startsWith('rbxasset://')) {
    return idOrUrl;
  }
  if (/^\d+$/.test(idOrUrl)) {
    return `rbxassetid://${idOrUrl}`;
  }
  return idOrUrl;
}

function toRobloxTemplateUrl(idOrUrl: string): string | undefined {
  const raw = idOrUrl.trim();
  if (!raw) return undefined;
  if (raw.startsWith('rbxassetid://')) return raw;
  if (raw.startsWith('rbxasset://')) {
    return raw;
  }
  if (raw.startsWith('http://www.roblox.com/asset/?id=') || raw.startsWith('https://www.roblox.com/asset/?id=')) {
    const id = raw.split('id=').pop()?.trim() ?? '';
    if (/^\d+$/.test(id)) {
      return `rbxassetid://${id}`;
    }
    return undefined;
  }
  if (/^\d+$/.test(raw)) {
    return `rbxassetid://${raw}`;
  }
  // Block HTTP(S)/other URLs for ShirtTemplate/PantsTemplate.
  return undefined;
}

function buildAssetRef(args: {
  name: string;
  assetType: RobloxAssetType;
  meshId?: string;
  textureId?: string;
  soundId?: string;
  storageUrl?: string;
  robloxAssetId?: number;
  folderId?: string;
}): RobloxAssetRef {
  return {
    id: uuidv4(),
    name: args.name,
    assetType: args.assetType,
    meshId: args.meshId,
    textureId: args.textureId,
    soundId: args.soundId,
    storageUrl: args.storageUrl,
    robloxAssetId: args.robloxAssetId,
    folderId: args.folderId,
  };
}

function inferCharacterScale(prompt: string, metadata: Record<string, unknown>): {
  w: number; h: number; d: number;
} {
  const text = `${prompt} ${JSON.stringify(metadata)}`.toLowerCase();
  const isBig = text.includes('hulk') || text.includes('giant') || text.includes('muscular')
    || text.includes('huge') || text.includes('tank') || text.includes('golem')
    || text.includes('brute') || text.includes('ogre');
  const isSmall = text.includes('tiny') || text.includes('mini') || text.includes('fairy')
    || text.includes('chibi') || text.includes('baby')
    || /gnome|dwarf|гном|дварф/.test(text);
  if (isBig) return { w: 1.6, h: 1.5, d: 1.5 };
  if (isSmall) return { w: 0.8, h: 0.8, d: 0.8 };
  return { w: 1.0, h: 1.0, d: 1.0 };
}

function paletteFromBodyColors(metadata: Record<string, unknown>): {
  torso: { r: number; g: number; b: number };
  head: { r: number; g: number; b: number };
  limbs: { r: number; g: number; b: number };
  legs: { r: number; g: number; b: number };
} | null {
  const bc = metadata.bodyColors as Record<string, unknown> | undefined;
  if (!bc) return null;

  const toFloat = (arr: unknown): { r: number; g: number; b: number } | null => {
    if (!Array.isArray(arr) || arr.length < 3) return null;
    const [r, g, b] = arr;
    if (typeof r !== 'number' || typeof g !== 'number' || typeof b !== 'number') return null;
    return { r: r / 255, g: g / 255, b: b / 255 };
  };

  const head = toFloat(bc.headColor);
  const torso = toFloat(bc.torsoColor);
  const leftArm = toFloat(bc.leftArmColor);
  const leftLeg = toFloat(bc.leftLegColor);
  if (!head || !torso || !leftArm || !leftLeg) return null;

  return { torso, head, limbs: leftArm, legs: leftLeg };
}

type Palette = {
  torso: { r: number; g: number; b: number };
  head: { r: number; g: number; b: number };
  limbs: { r: number; g: number; b: number };
  legs: { r: number; g: number; b: number };
};

type NpcTemplateKind =
  | 'default'
  | 'gnome'
  | 'ranger'
  | 'guard'
  | 'mage'
  | 'quest_giver'
  | 'merchant'
  | 'ghost'
  | 'enemy'
  | 'boss'
  | 'villain'
  | 'companion'
  | 'fire_elemental'
  | 'robot'
  | 'pirate'
  | 'ninja'
  | 'undead'
  | 'superhero'
  | 'pointed_hat'
  // Modern/casual roast personality archetypes (session 126). Without these
  // a "Gym Bro" and a "Chill Gen-Alpha" prompt both fall to `default` and
  // emit identical mannequins, with personality only reflected in the LLM
  // chat prompt.
  | 'gym_bro'
  | 'gen_alpha'
  | 'sigma_chad'
  | 'mom_friend'
  | 'skibidi';

type NpcVisualFamily =
  | 'humanoid'
  | 'arachnid'
  | 'brute'
  | 'beast'
  | 'winged'
  | 'golem'
  | 'plant_fungal'
  | 'elemental'
  | 'robot'
  | 'undead'
  | 'ghost'
  | 'superhero'
  | 'smallfolk';

interface NpcVisualDNA {
  bodyFamily?: NpcVisualFamily;
  visualSpecies?: string;
  role?: string;
  styleArchetypes?: string[];
  palette?: string;
  faceIdentity?: string;
  outfitSlots?: string[];
  accessorySlots?: string[];
  props?: string[];
  vfx?: string[];
  sourceCues?: string[];
  repairNotes?: string[];
}

interface NpcResolvedVisualPlan {
  bodyFamily: NpcVisualFamily;
  visualSpecies: string;
  role: string;
  styleArchetypes: string[];
  palette?: string;
  faceIdentity?: string;
  outfitSlots: string[];
  accessorySlots: string[];
  props: string[];
  vfx: string[];
  sourceCues: string[];
  repairNotes: string[];
}

const NPC_BOSS_STYLE_CUE = /\b(?:boss|king|emperor|overlord|tyrant)\b|босс|король|повелитель/;
const NPC_QUEST_STYLE_CUE = /\bquest(?:\s*(?:giver|npc))?\b|\belder\b|\bsage\b|\bmentor\b|квест|задан|поручен|выдавател[ья][а-яё\s-]*квест|мудрец|наставник|старейшина/;
const NPC_GEN_ALPHA_STYLE_CUE = /gen[\s-]*alpha|genalpha|gen\s*z\s*kid|tiktok\s*kid|laid[\s-]*back|chill(?:\s+(?:guy|bro|kid|character|npc))?|streetwear|pastel\s+(?:streetwear|outfit)|oversized\s+headphones|hoodie\s+kid/;
const NPC_SIGMA_STYLE_CUE = /sigma\s*chad|sigma\s*male|chad\b|gigachad|alpha\s*male|\bsigma[\s-]+(?:roast|npc|character|guy|kid|bro)\b/;
const NPC_GYM_BRO_STYLE_CUE = /\bgym\b|gymbro|gym\s*bro|buff|swole|jacked|muscular|bodybuilder|flexing|tank\s*top|качок|накач|бодибилд/;
const NPC_MOM_FRIEND_STYLE_CUE = /mom\s*friend|mom\s+npc|momma|mum\s+friend|mommy|mama|caring\s+mom/;
const NPC_SKIBIDI_STYLE_CUE = /skibidi|brainrot|ohio\s+npc|fanum|rizz|gyatt|toilet/;
const NPC_CELESTIAL_STYLE_CUE = /celestial|angel|divine|holy|heaven|cosmic|star\s*(?:master|sage|mage|aura)|starlight|небес|ангел|божествен|свят|косми|звезд|звёзд/;
const NPC_ROBOT_STYLE_CUE = /\b(?:robot|android|cyber|cyborg|mech|mecha|droid)\b|робот|андроид|кибер|киборг|механическ|меха?\b/;
const NPC_MAGE_STYLE_CUE = /\b(?:mage|mages|wizard|wizards|sorcerer|sorcerers|sorceress|sorceresses|warlock|warlocks|necromancer|necromancers|spellcaster|spellcasters)\b|маг|волшеб|некромант|колдун|чарод/;

function resolveNpcTemplateKind(title: string, prompt: string, metadata: Record<string, unknown>): NpcTemplateKind {
  const metadataValueText = Object.entries(metadata)
    .filter(([key]) => key !== 'npcVisualFamily')
    .flatMap(([, value]) => {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return [String(value)];
      if (Array.isArray(value)) {
        return value
          .filter((item) => typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean')
          .map(String);
      }
      return [];
    })
    .join(' ');
  const visualDna = metadata.npcVisualDNA && typeof metadata.npcVisualDNA === 'object'
    ? metadata.npcVisualDNA as Record<string, unknown>
    : {};
  const acceptanceCriteria = metadata.generationAcceptanceCriteria && typeof metadata.generationAcceptanceCriteria === 'object'
    ? metadata.generationAcceptanceCriteria as Record<string, unknown>
    : {};
  const structuredCueText = [
    Array.isArray(visualDna.styleArchetypes) ? visualDna.styleArchetypes.join(' ') : '',
    Array.isArray(visualDna.sourceCues) ? visualDna.sourceCues.join(' ') : '',
    Array.isArray(visualDna.outfitSlots) ? visualDna.outfitSlots.join(' ') : '',
    Array.isArray(visualDna.accessorySlots) ? visualDna.accessorySlots.join(' ') : '',
    Array.isArray(visualDna.props) ? visualDna.props.join(' ') : '',
    Array.isArray(acceptanceCriteria.requiredVisualCues) ? acceptanceCriteria.requiredVisualCues.join(' ') : '',
  ].filter(Boolean).join(' ');
  const text = `${title} ${prompt} ${metadata.npcRole ?? ''} ${metadataValueText} ${structuredCueText}`.toLowerCase();
  const role = typeof metadata.npcRole === 'string' ? metadata.npcRole.toLowerCase() : '';
  const roastPersonality = typeof metadata.roastPersonality === 'string'
    ? metadata.roastPersonality.toLowerCase()
    : '';
  const structuredCueLower = structuredCueText.toLowerCase();
  const isNpcRoastContext = String(metadata.contentCategory || '').toLowerCase() === 'npc_ai'
    || String(metadata.contentSubcategory || '').toLowerCase() === 'roast_npc'
    || String(metadata.npcMode || '').toLowerCase() === 'roast';
  const hasStructuredGenAlphaCue = /\bgen_alpha\b|gen[-\s]*alpha/.test(structuredCueLower);

  // Direct mapping: when iOS sends `metadata.roastPersonality`, trust it as
  // the visual archetype. This bypasses prompt-keyword guessing and ensures
  // the Roast NPC's body matches the personality the user picked.
  if (roastPersonality === 'gym_bro') return 'gym_bro';
  if (roastPersonality === 'gen_alpha') return 'gen_alpha';
  if (roastPersonality === 'sigma_chad') return 'sigma_chad';
  if (roastPersonality === 'mom_friend') return 'mom_friend';
  if (roastPersonality === 'skibidi') return 'skibidi';
  if (isNpcRoastContext && hasStructuredGenAlphaCue) return 'gen_alpha';

  if (/ghost|spirit|specter|spectre|phantom|wraith|призрак|дух|фантом|привид/.test(text)) return 'ghost';
  if (/gnome|dwarf|гном|дварф/.test(text)) return 'gnome';
  if (hasStrongFireElementalCue(text)) return 'fire_elemental';
  if (/ranger|forest\s*guard|woodland\s*guard|archer|bowman|рейнджер|егерь|леснич|лесн[а-яё]*\s+страж|лучник/.test(text)) return 'ranger';
  // Modern casual / streetwear archetypes — match BEFORE generic role checks
  // so "gym bro NPC" doesn't get misclassified as `enemy`/`guard` via "bro".
  if (NPC_GYM_BRO_STYLE_CUE.test(text)) return 'gym_bro';
  if (NPC_GEN_ALPHA_STYLE_CUE.test(text)) return 'gen_alpha';
  if (NPC_SIGMA_STYLE_CUE.test(text)) return 'sigma_chad';
  if (NPC_MOM_FRIEND_STYLE_CUE.test(text)) return 'mom_friend';
  if (NPC_SKIBIDI_STYLE_CUE.test(text)) return 'skibidi';
  if (/super\s*hero|superhero|superman|heroic|flying\s*hero|cape|laser\s*eyes?|eye\s*laser|супергер|супермен|герой|плащ|лазер[а-яё\s-]*из\s+глаз|парящ[а-яё\s-]*супергер/.test(text)) return 'superhero';
  if (NPC_ROBOT_STYLE_CUE.test(text)) return 'robot';
  if (/pirate|corsair|buccaneer|pirate\s+captain|captain\s+pirate|пират|корсар|пиратск[а-яё\s-]*капитан/.test(text)) return 'pirate';
  if (/ninja|shinobi|assassin\s*ninja|ниндз|синоби/.test(text)) return 'ninja';
  if (/zombie|skeleton|undead|skull|bones|зомби|скелет|нежить|череп|кости/.test(text)) return 'undead';
  if (/police|cop|officer|sheriff|security|law\s*enforcement|полици|полицей|офицер|шериф|правоохран|\bкоп\b/.test(text)) return 'guard';
  if (role === 'merchant' || /merchant|trader|shop|vendor|торгов|купец|лавочник/.test(text)) return 'merchant';
  if (role === 'boss' || NPC_BOSS_STYLE_CUE.test(text)) return 'boss';
  if (role === 'villain' || /villain|bandit|thief|assassin|rogue|злодей|разбойник|вор|убийца/.test(text)) return 'villain';
  if (role === 'quest_giver' || NPC_QUEST_STYLE_CUE.test(text)) return 'quest_giver';
  if (role === 'enemy' || /enemy|monster|beast|orc|goblin|враг|монстр|чудовище|орк|гоблин/.test(text)) return 'enemy';
  if (role === 'companion' || /companion|ally|sidekick|\bfriend\b|спутник|союзник|друг/.test(text)) return 'companion';
  if (NPC_MAGE_STYLE_CUE.test(text)) return 'mage';
  if (role === 'guard' || /knight|guard|police|cop|officer|sheriff|security|paladin|soldier|sentinel|warrior|рыцар|страж|охран|полици|полицей|офицер|шериф|солдат|воин/.test(text)) return 'guard';
  if (/point(?:ed|y)\s+hat|tall\s+hat|wizard\s+hat|witch\s+hat|cone\s+hat|остроконечн|высок[а-яё\s-]*шляп|шляп[а-яё\s-]*конус|колпак/.test(text)) return 'pointed_hat';

  return 'default';
}

function normalizeNpcVisualFamily(raw: string): NpcVisualFamily | null {
  const value = raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
  const aliases: Record<string, NpcVisualFamily> = {
    humanoid: 'humanoid',
    human: 'humanoid',
    default: 'humanoid',
    arachnid: 'arachnid',
    spider: 'arachnid',
    spider_mutant: 'arachnid',
    spider_ninja: 'arachnid',
    spider_person: 'arachnid',
    spiderfolk: 'arachnid',
    brute: 'brute',
    mutant_brute: 'brute',
    ogre: 'brute',
    beast: 'beast',
    animal: 'beast',
    winged: 'winged',
    demon: 'winged',
    dragon: 'winged',
    golem: 'golem',
    stone_golem: 'golem',
    rock_golem: 'golem',
    plant: 'plant_fungal',
    fungal: 'plant_fungal',
    plant_fungal: 'plant_fungal',
    mushroom: 'plant_fungal',
    elemental: 'elemental',
    robot: 'robot',
    mech: 'robot',
    undead: 'undead',
    ghost: 'ghost',
    spectral: 'ghost',
    superhero: 'superhero',
    hero: 'superhero',
    smallfolk: 'smallfolk',
    gnome: 'smallfolk',
    dwarf: 'smallfolk',
  };
  return aliases[value] ?? null;
}

function npcVisualStringList(raw: unknown, max = 10): string[] {
  if (!Array.isArray(raw)) return [];
  const values: string[] = [];
  for (const item of raw.slice(0, max)) {
    if (typeof item !== 'string') continue;
    const value = item.trim().toLowerCase().replace(/[\s-]+/g, '_').slice(0, 64);
    if (value && !values.includes(value)) values.push(value);
  }
  return values;
}

function readNpcVisualDNA(metadata: Record<string, unknown>): NpcVisualDNA {
  const raw = metadata.npcVisualDNA;
  if (!raw || typeof raw !== 'object') return {};
  const obj = raw as Record<string, unknown>;
  const bodyFamily = typeof obj.bodyFamily === 'string' ? normalizeNpcVisualFamily(obj.bodyFamily) : null;
  const dna: NpcVisualDNA = {};
  if (bodyFamily) dna.bodyFamily = bodyFamily;
  if (typeof obj.visualSpecies === 'string' && obj.visualSpecies.trim()) dna.visualSpecies = obj.visualSpecies.trim().slice(0, 80);
  if (typeof obj.role === 'string' && obj.role.trim()) dna.role = obj.role.trim().toLowerCase().slice(0, 64);
  const styleArchetypes = npcVisualStringList(obj.styleArchetypes, 10);
  if (styleArchetypes.length > 0) dna.styleArchetypes = styleArchetypes;
  if (typeof obj.palette === 'string' && obj.palette.trim()) dna.palette = obj.palette.trim().slice(0, 120);
  if (typeof obj.faceIdentity === 'string' && obj.faceIdentity.trim()) dna.faceIdentity = obj.faceIdentity.trim().slice(0, 160);
  const outfitSlots = npcVisualStringList(obj.outfitSlots, 12);
  if (outfitSlots.length > 0) dna.outfitSlots = outfitSlots;
  const accessorySlots = npcVisualStringList(obj.accessorySlots, 14);
  if (accessorySlots.length > 0) dna.accessorySlots = accessorySlots;
  const props = npcVisualStringList(obj.props, 12);
  if (props.length > 0) dna.props = props;
  const vfx = npcVisualStringList(obj.vfx, 10);
  if (vfx.length > 0) dna.vfx = vfx;
  const sourceCues = npcVisualStringList(obj.sourceCues, 12);
  if (sourceCues.length > 0) dna.sourceCues = sourceCues;
  const repairNotes = npcVisualStringList(obj.repairNotes, 10);
  if (repairNotes.length > 0) dna.repairNotes = repairNotes;
  return dna;
}

function detectNpcBodyFamilyFromVisualText(text: string): NpcVisualFamily | null {
  if (/arachnid|spider|spiderling|tarantula|scorpion|web[-\s]*spinner|арахнид|паук|пауч|тарантул|скорпион|паути/.test(text)) return 'arachnid';
  if (/golem|stone\s*(?:giant|monster|boss)|rock\s*(?:giant|monster|boss)|crystal\s*(?:giant|golem)|каменн[а-яё\s-]*(?:голем|босс|монстр|гигант)|голем|скал[а-яё]*|кристалл/.test(text)) return 'golem';
  if (/\b(?:winged|wings?|demons?|dragons?|gargoyles?)\b|bat[-\s]*like|flying\s+(?:demon|monster)|крыл|демон|дракон|гаргул|летуч|летающ[а-яё\s-]*(?:демон|монстр|звер)/.test(text)) return 'winged';
  if (/mushroom|fungal|fungus|mycelium|plant[-\s]*(?:folk|monster)|vine|leafy|spore|гриб|грибн|мицел|растен|лоз[а-яё]*|лист|спор/.test(text)) return 'plant_fungal';
  if (/brute|ogre|troll|hulking|hulk|mutant|abomination|big\s+monster|swamp\s+mutant|громил|мутант|огр|тролл|бугай|здоровяк|болотн[а-яё\s-]*мутант/.test(text)) return 'brute';
  if (/beast|werewolf|wolf|bear|lizard|serpent|rat[-\s]*man|animal[-\s]*like|звер|оборот|волк|медвед|ящер|зме[йя]|крыс/.test(text)) return 'beast';
  if (hasStrongFireElementalCue(text) || /ice\s*elemental|frost\s*spirit|storm\s*elemental|lightning\s*spirit|water\s*elemental|ледян[а-яё\s-]*(?:элементал|дух)|морозн[а-яё\s-]*дух|грозов[а-яё\s-]*элементал|молни[а-яё\s-]*дух/.test(text)) return 'elemental';
  return null;
}

function detectNpcStyleArchetypesFromVisualText(text: string, templateKind: NpcTemplateKind): string[] {
  const styles = new Set<string>();
  if (templateKind !== 'default') styles.add(templateKind);
  if (/ninja|shinobi|assassin\s*ninja|ниндз|синоби/.test(text)) styles.add('ninja');
  if (/super\s*hero|superhero|superman|heroic|flying\s*hero|cape|laser\s*eyes?|eye\s*laser|супергер|супермен|герой|плащ/.test(text)) styles.add('superhero');
  if (/pirate|corsair|buccaneer|пират|корсар/.test(text)) styles.add('pirate');
  if (NPC_MAGE_STYLE_CUE.test(text)) styles.add('mage');
  if (/guard|security|police|cop|officer|sheriff|охран|страж|полици|полицей/.test(text)) styles.add('guard');
  if (/merchant|trader|shop|vendor|торгов|купец|лавочник/.test(text)) styles.add('merchant');
  if (NPC_QUEST_STYLE_CUE.test(text)) styles.add('quest');
  if (NPC_BOSS_STYLE_CUE.test(text)) styles.add('boss');
  if (NPC_CELESTIAL_STYLE_CUE.test(text)) styles.add('celestial');
  return Array.from(styles);
}

function hasHumanoidNpcVisualCue(text: string): boolean {
  return /\bkid\b|\bteen\b|teenager|boy|girl|child|person|human|humanoid|guy|dude|man|woman|student|школьник|подрост|мальчик|девочк|реб[её]нок|парень|девушка|человек|гуманоид/.test(text);
}

function hasExplicitNpcStyleCue(style: string, text: string, role?: unknown): boolean {
  const roleText = typeof role === 'string' ? role.toLowerCase() : '';
  switch (style) {
    case 'quest':
      return roleText === 'quest_giver' || NPC_QUEST_STYLE_CUE.test(text);
    case 'boss':
      return roleText === 'boss' || NPC_BOSS_STYLE_CUE.test(text);
    case 'guard':
      return roleText === 'guard' || /guard|security|police|cop|officer|sheriff|охран|страж|полици|полицей/.test(text);
    case 'merchant':
      return roleText === 'merchant' || /merchant|trader|shop|vendor|торгов|купец|лавочник/.test(text);
    case 'mage':
      return NPC_MAGE_STYLE_CUE.test(text);
    case 'ninja':
      return /ninja|shinobi|ниндз|синоби/.test(text);
    case 'superhero':
      return /super\s*hero|superhero|superman|heroic|cape|laser\s*eyes?|супергер|супермен|плащ/.test(text);
    case 'pirate':
      return /pirate|corsair|buccaneer|пират|корсар/.test(text);
    case 'robot':
      return NPC_ROBOT_STYLE_CUE.test(text);
    case 'undead':
      return /zombie|skeleton|undead|skull|bones|зомби|скелет|нежить|череп|кости/.test(text);
    case 'ghost':
      return /ghost|spirit|phantom|wraith|призрак|дух|фантом/.test(text);
    case 'ranger':
      return /ranger|forest\s*guard|archer|рейнджер|егерь|леснич|лучник/.test(text);
    case 'celestial':
      return NPC_CELESTIAL_STYLE_CUE.test(text);
    case 'gen_alpha':
      return NPC_GEN_ALPHA_STYLE_CUE.test(text);
    case 'sigma_chad':
      return NPC_SIGMA_STYLE_CUE.test(text);
    case 'gym_bro':
      return NPC_GYM_BRO_STYLE_CUE.test(text);
    case 'mom_friend':
      return NPC_MOM_FRIEND_STYLE_CUE.test(text);
    case 'skibidi':
      return NPC_SKIBIDI_STYLE_CUE.test(text);
    default:
      return true;
  }
}

function filterNpcPlanCueList(values: string[] | undefined, freshText: string, role?: unknown): string[] {
  if (!values || values.length === 0) return [];
  const forbiddenWithoutCue = /^(winged|wings?|horns?|tail|tail_spike|claws?|boss|quest|quest_marker|demon|dragon|skibidi|toilet|toilet_bowl|toilet_tank)$/;
  const styleWithoutCue = /^(gen_alpha|sigma_chad|gym_bro|mom_friend|skibidi|celestial)$/;
  return values.filter((value) => {
    const normalized = value.toLowerCase().replace(/[\s-]+/g, '_');
    if (styleWithoutCue.test(normalized)) return hasExplicitNpcStyleCue(normalized, freshText, role);
    if (!forbiddenWithoutCue.test(normalized)) return true;
    if (normalized === 'boss' || normalized === 'quest' || normalized === 'quest_marker') {
      return hasExplicitNpcStyleCue(normalized === 'boss' ? 'boss' : 'quest', freshText, role);
    }
    if (/^(?:skibidi|toilet)/.test(normalized)) {
      return /\bskibidi\b|\btoilet\b|скибиди|унитаз/.test(freshText);
    }
    return /\b(?:wing|wings|winged|horns?|tail|claws?|demons?|dragons?)\b|крыл|рог|хвост|когт|демон|дракон/.test(freshText);
  });
}

function resolveNpcVisualPlan(
  title: string,
  prompt: string,
  metadata: Record<string, unknown>,
  templateKind: NpcTemplateKind,
): NpcResolvedVisualPlan {
  const dna = readNpcVisualDNA(metadata);
  const freshText = [
    title,
    prompt,
    metadata.npcRole,
    metadata.visualSpecies,
    metadata.theme,
    metadata.npcTheme,
    metadata.appearance,
    metadata.visualDescription,
    metadata.npcVisualHooks,
    metadata.personality,
    metadata.signatureMove,
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(' ')
    .toLowerCase();
  const text = [
    freshText,
    dna.visualSpecies,
    ...filterNpcPlanCueList(dna.sourceCues, freshText, metadata.npcRole),
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(' ')
    .toLowerCase();
  const explicitFamily = typeof metadata.npcVisualFamily === 'string'
    ? normalizeNpcVisualFamily(metadata.npcVisualFamily)
    : null;
  const explicitSpecies = typeof metadata.visualSpecies === 'string'
    ? normalizeNpcVisualFamily(metadata.visualSpecies)
    : null;
  const freshDetectedBodyFamily = detectNpcBodyFamilyFromVisualText(freshText);
  const modernHumanoidTemplate = templateKind === 'gen_alpha'
    || templateKind === 'sigma_chad'
    || templateKind === 'gym_bro'
    || templateKind === 'mom_friend';
  const detectedOnlyAsBodyBulk = modernHumanoidTemplate && freshDetectedBodyFamily === 'brute';
  const forceHumanoidFromBrief = (hasHumanoidNpcVisualCue(freshText) || modernHumanoidTemplate)
    && (!freshDetectedBodyFamily || detectedOnlyAsBodyBulk);
  const detectedBodyFamily = forceHumanoidFromBrief ? null : detectNpcBodyFamilyFromVisualText(text);
  const cfg = metadata.npcVisualConfig as Record<string, unknown> | undefined;
  const cfgFamily = cfg && typeof cfg.npcVisualFamily === 'string' ? normalizeNpcVisualFamily(cfg.npcVisualFamily) : null;
  const cfgSpecies = cfg && typeof cfg.visualSpecies === 'string' ? normalizeNpcVisualFamily(cfg.visualSpecies) : null;
  const templateFamily: NpcVisualFamily | null = templateKind === 'robot'
    ? 'robot'
    : templateKind === 'undead'
      ? 'undead'
      : templateKind === 'ghost'
        ? 'ghost'
        : templateKind === 'superhero'
          ? 'superhero'
          : templateKind === 'gnome'
            ? 'smallfolk'
            : null;
  const bodyFamily: NpcVisualFamily = forceHumanoidFromBrief
    ? 'humanoid'
    : detectedBodyFamily
    ?? dna.bodyFamily
    ?? explicitSpecies
    ?? cfgSpecies
    ?? explicitFamily
    ?? cfgFamily
    ?? templateFamily
    ?? 'humanoid';
  const repairNotes = new Set(dna.repairNotes ?? []);
  if (forceHumanoidFromBrief && explicitFamily && explicitFamily !== 'humanoid') {
    repairNotes.add(`worker_body_family_repaired_from_${explicitFamily}_to_humanoid_from_human_brief`);
  }
  if (forceHumanoidFromBrief && dna.bodyFamily && dna.bodyFamily !== 'humanoid') {
    repairNotes.add(`worker_visual_dna_body_family_repaired_from_${dna.bodyFamily}_to_humanoid_from_human_brief`);
  }
  if (detectedBodyFamily && explicitFamily && explicitFamily !== detectedBodyFamily) {
    repairNotes.add(`worker_body_family_repaired_from_${explicitFamily}_to_${detectedBodyFamily}`);
  }
  const styleArchetypes = new Set<string>([
    ...filterNpcPlanCueList(dna.styleArchetypes, freshText, metadata.npcRole).filter((style) => hasExplicitNpcStyleCue(style, freshText, metadata.npcRole)),
    ...detectNpcStyleArchetypesFromVisualText(freshText, templateKind).filter((style) => hasExplicitNpcStyleCue(style, freshText, metadata.npcRole)),
  ]);
  const sourceCues = new Set<string>([
    bodyFamily,
    ...filterNpcPlanCueList(dna.sourceCues, freshText, metadata.npcRole),
    ...styleArchetypes,
  ]);
  const rawVisualSpecies = dna.visualSpecies
    ?? (typeof metadata.visualSpecies === 'string' && metadata.visualSpecies.trim() ? metadata.visualSpecies.trim().slice(0, 80) : '');
  const robotDescriptorRepairedToHumanoid = bodyFamily === 'humanoid'
    && styleArchetypes.has('gen_alpha')
    && (
      NPC_ROBOT_STYLE_CUE.test(rawVisualSpecies)
      || Array.from(repairNotes).some((note) => /robot[_-]?to[_-]?humanoid|robot_descriptor/i.test(note))
    );
  if (robotDescriptorRepairedToHumanoid) {
    styleArchetypes.delete('robot');
    sourceCues.delete('robot');
    repairNotes.add('worker_robot_descriptor_rewritten_to_gen_alpha_humanoid');
  }
  const visualSpecies = robotDescriptorRepairedToHumanoid
    ? 'Gen-Alpha meme teen'
    : rawVisualSpecies || (styleArchetypes.has('gen_alpha') ? 'Gen-Alpha meme teen' : bodyFamily);
  return {
    bodyFamily,
    visualSpecies,
    role: typeof metadata.npcRole === 'string' && metadata.npcRole.trim() ? metadata.npcRole.trim().toLowerCase() : dna.role ?? 'dialogue',
    styleArchetypes: Array.from(styleArchetypes).filter((style) => style !== 'default'),
    palette: dna.palette,
    faceIdentity: dna.faceIdentity,
    outfitSlots: filterNpcPlanCueList(dna.outfitSlots, freshText, metadata.npcRole),
    accessorySlots: filterNpcPlanCueList(dna.accessorySlots, freshText, metadata.npcRole),
    props: filterNpcPlanCueList(dna.props, freshText, metadata.npcRole),
    vfx: filterNpcPlanCueList(dna.vfx, freshText, metadata.npcRole),
    sourceCues: Array.from(sourceCues).slice(0, 16),
    repairNotes: Array.from(repairNotes),
  };
}

function resolveNpcVisualFamily(
  title: string,
  prompt: string,
  metadata: Record<string, unknown>,
  templateKind: NpcTemplateKind,
): NpcVisualFamily {
  return resolveNpcVisualPlan(title, prompt, metadata, templateKind).bodyFamily;
}

function isNpcNonHumanoidVisualFamily(family: NpcVisualFamily): boolean {
  return family === 'arachnid'
    || family === 'brute'
    || family === 'beast'
    || family === 'winged'
    || family === 'golem'
    || family === 'plant_fungal'
    || family === 'elemental';
}

function hasStrongFireElementalCue(text: string): boolean {
  const normalized = text.toLowerCase();
  if (/fire\s*(elemental|spirit|monster|mage|wizard|enemy|boss|creature)|flame\s*(elemental|spirit|monster|mage|enemy|boss)|lava|magma|molten|infernal|ember\s*(spirit|monster|mage|boss)|элементал|лава|магм|инферн|пылающ[а-яё\s-]*(монстр|враг|босс|маг)|горящ[а-яё\s-]*(монстр|враг|босс|маг)|огненн[а-яё\s-]*(элементал|монстр|враг|босс|маг)/.test(normalized)) {
    return true;
  }
  // Color/adjective cues such as "fiery red beard", "огненно-рыжая борода",
  // "lamp glow", or "фонарь" should enrich the gnome/miner kit, not replace
  // the whole NPC with a fire elemental archetype.
  return false;
}

function paletteFromNpcTemplate(kind: NpcTemplateKind): Palette | null {
  switch (kind) {
    case 'gnome':
      return {
        torso: { r: 0.20, g: 0.50, b: 0.18 },
        head: { r: 0.94, g: 0.70, b: 0.54 },
        limbs: { r: 0.94, g: 0.70, b: 0.54 },
        legs: { r: 0.24, g: 0.16, b: 0.09 },
      };
    case 'ranger':
      return {
        torso: { r: 0.17, g: 0.40, b: 0.16 },
        head: { r: 0.95, g: 0.78, b: 0.62 },
        limbs: { r: 0.55, g: 0.40, b: 0.25 },
        legs: { r: 0.24, g: 0.16, b: 0.09 },
      };
    case 'guard':
      return {
        torso: { r: 0.28, g: 0.32, b: 0.40 },
        head: { r: 0.95, g: 0.78, b: 0.62 },
        limbs: { r: 0.32, g: 0.35, b: 0.42 },
        legs: { r: 0.22, g: 0.24, b: 0.30 },
      };
    case 'mage':
    case 'quest_giver':
    case 'pointed_hat':
      return {
        torso: { r: 0.28, g: 0.20, b: 0.48 },
        head: { r: 0.95, g: 0.78, b: 0.62 },
        limbs: { r: 0.26, g: 0.18, b: 0.42 },
        legs: { r: 0.20, g: 0.14, b: 0.34 },
      };
    case 'merchant':
      return {
        torso: { r: 0.62, g: 0.45, b: 0.28 },
        head: { r: 0.95, g: 0.78, b: 0.62 },
        limbs: { r: 0.55, g: 0.40, b: 0.25 },
        legs: { r: 0.38, g: 0.28, b: 0.18 },
      };
    case 'ghost':
      return {
        torso: { r: 0.85, g: 0.92, b: 1.00 },
        head: { r: 0.92, g: 0.95, b: 1.00 },
        limbs: { r: 0.80, g: 0.88, b: 0.98 },
        legs: { r: 0.70, g: 0.80, b: 0.95 },
      };
    case 'enemy':
      return {
        torso: { r: 0.48, g: 0.20, b: 0.18 },
        head: { r: 0.55, g: 0.32, b: 0.28 },
        limbs: { r: 0.42, g: 0.18, b: 0.16 },
        legs: { r: 0.30, g: 0.12, b: 0.12 },
      };
    case 'boss':
      return {
        torso: { r: 0.16, g: 0.16, b: 0.22 },
        head: { r: 0.85, g: 0.72, b: 0.55 },
        limbs: { r: 0.18, g: 0.18, b: 0.24 },
        legs: { r: 0.10, g: 0.10, b: 0.14 },
      };
    case 'villain':
      return {
        torso: { r: 0.20, g: 0.18, b: 0.22 },
        head: { r: 0.92, g: 0.75, b: 0.58 },
        limbs: { r: 0.22, g: 0.20, b: 0.25 },
        legs: { r: 0.14, g: 0.13, b: 0.18 },
      };
    case 'companion':
      return {
        torso: { r: 0.85, g: 0.50, b: 0.35 },
        head: { r: 0.95, g: 0.80, b: 0.68 },
        limbs: { r: 0.78, g: 0.45, b: 0.30 },
        legs: { r: 0.55, g: 0.38, b: 0.28 },
      };
    case 'superhero':
      return {
        torso: { r: 0.05, g: 0.18, b: 0.78 },
        head: { r: 0.95, g: 0.80, b: 0.68 },
        limbs: { r: 0.05, g: 0.18, b: 0.78 },
        legs: { r: 0.08, g: 0.10, b: 0.55 },
      };
    case 'fire_elemental':
      return {
        torso: { r: 0.78, g: 0.22, b: 0.12 },
        head: { r: 0.92, g: 0.55, b: 0.20 },
        limbs: { r: 0.74, g: 0.20, b: 0.10 },
        legs: { r: 0.50, g: 0.12, b: 0.05 },
      };
    case 'robot':
      return {
        torso: { r: 0.28, g: 0.32, b: 0.36 },
        head: { r: 0.56, g: 0.62, b: 0.66 },
        limbs: { r: 0.42, g: 0.48, b: 0.52 },
        legs: { r: 0.18, g: 0.22, b: 0.26 },
      };
    case 'pirate':
      return {
        torso: { r: 0.46, g: 0.08, b: 0.10 },
        head: { r: 0.95, g: 0.78, b: 0.62 },
        limbs: { r: 0.18, g: 0.10, b: 0.06 },
        legs: { r: 0.08, g: 0.07, b: 0.06 },
      };
    case 'ninja':
      return {
        torso: { r: 0.08, g: 0.10, b: 0.13 },
        head: { r: 0.88, g: 0.72, b: 0.58 },
        limbs: { r: 0.04, g: 0.04, b: 0.05 },
        legs: { r: 0.03, g: 0.035, b: 0.045 },
      };
    case 'undead':
      return {
        torso: { r: 0.18, g: 0.14, b: 0.10 },
        head: { r: 0.88, g: 0.86, b: 0.74 },
        limbs: { r: 0.70, g: 0.72, b: 0.60 },
        legs: { r: 0.24, g: 0.30, b: 0.22 },
      };
    case 'gym_bro':
      // Tan skin, black tank top, grey shorts — matches the "Bulky & Strong"
      // / "Massive Buff Flexing Black Tank Top Grey Shorts" prompt family.
      return {
        torso: { r: 0.10, g: 0.10, b: 0.12 },
        head: { r: 0.92, g: 0.72, b: 0.55 },
        limbs: { r: 0.92, g: 0.72, b: 0.55 },
        legs: { r: 0.40, g: 0.42, b: 0.46 },
      };
    case 'gen_alpha':
      // Pastel streetwear — pale lavender hoodie, peach skin, mint sleeves.
      return {
        torso: { r: 0.78, g: 0.74, b: 0.92 },
        head: { r: 0.97, g: 0.84, b: 0.74 },
        limbs: { r: 0.86, g: 0.94, b: 0.82 },
        legs: { r: 0.62, g: 0.65, b: 0.78 },
      };
    case 'sigma_chad':
      // Sharp business shirt + dark slacks; cold confident palette.
      return {
        torso: { r: 0.92, g: 0.92, b: 0.94 },
        head: { r: 0.94, g: 0.78, b: 0.62 },
        limbs: { r: 0.88, g: 0.88, b: 0.90 },
        legs: { r: 0.18, g: 0.18, b: 0.22 },
      };
    case 'mom_friend':
      // Warm cardigan + apron — soft, caring colours.
      return {
        torso: { r: 0.86, g: 0.62, b: 0.66 },
        head: { r: 0.96, g: 0.82, b: 0.72 },
        limbs: { r: 0.86, g: 0.62, b: 0.66 },
        legs: { r: 0.40, g: 0.32, b: 0.42 },
      };
    case 'skibidi':
      // Chaotic clashing colours intentionally mismatched.
      return {
        torso: { r: 0.92, g: 0.30, b: 0.62 },
        head: { r: 0.98, g: 0.92, b: 0.40 },
        limbs: { r: 0.30, g: 0.78, b: 0.92 },
        legs: { r: 0.20, g: 0.20, b: 0.20 },
      };
    default:
      return null;
  }
}

function paletteFromNpcVisualFamily(family: NpcVisualFamily): Palette | null {
  switch (family) {
    case 'arachnid':
      return {
        torso: { r: 0.07, g: 0.07, b: 0.09 },
        head: { r: 0.18, g: 0.15, b: 0.12 },
        limbs: { r: 0.10, g: 0.09, b: 0.12 },
        legs: { r: 0.07, g: 0.07, b: 0.09 },
      };
    case 'brute':
      return {
        torso: { r: 0.34, g: 0.48, b: 0.22 },
        head: { r: 0.44, g: 0.56, b: 0.30 },
        limbs: { r: 0.34, g: 0.48, b: 0.22 },
        legs: { r: 0.22, g: 0.30, b: 0.16 },
      };
    case 'beast':
      return {
        torso: { r: 0.34, g: 0.20, b: 0.10 },
        head: { r: 0.42, g: 0.26, b: 0.14 },
        limbs: { r: 0.34, g: 0.20, b: 0.10 },
        legs: { r: 0.22, g: 0.13, b: 0.08 },
      };
    case 'winged':
      return {
        torso: { r: 0.22, g: 0.06, b: 0.08 },
        head: { r: 0.32, g: 0.10, b: 0.10 },
        limbs: { r: 0.22, g: 0.06, b: 0.08 },
        legs: { r: 0.12, g: 0.04, b: 0.05 },
      };
    case 'golem':
      return {
        torso: { r: 0.34, g: 0.32, b: 0.30 },
        head: { r: 0.42, g: 0.40, b: 0.36 },
        limbs: { r: 0.34, g: 0.32, b: 0.30 },
        legs: { r: 0.24, g: 0.23, b: 0.22 },
      };
    case 'plant_fungal':
      return {
        torso: { r: 0.28, g: 0.44, b: 0.20 },
        head: { r: 0.72, g: 0.66, b: 0.48 },
        limbs: { r: 0.24, g: 0.42, b: 0.18 },
        legs: { r: 0.16, g: 0.30, b: 0.12 },
      };
    case 'elemental':
      return {
        torso: { r: 0.78, g: 0.22, b: 0.12 },
        head: { r: 0.92, g: 0.55, b: 0.20 },
        limbs: { r: 0.74, g: 0.20, b: 0.10 },
        legs: { r: 0.50, g: 0.12, b: 0.05 },
      };
    default:
      return null;
  }
}

function paletteFromNpcVisualPlan(
  plan: NpcResolvedVisualPlan,
  prompt: string,
  metadata: Record<string, unknown>,
): Palette | null {
  const text = `${prompt} ${plan.palette ?? ''} ${plan.sourceCues.join(' ')} ${JSON.stringify(metadata)}`.toLowerCase();
  if (/black[-\s]*(?:and\s*)?red|red[-\s]*(?:and\s*)?black|черн[оа-яё\s-]*красн|чёрн[оа-яё\s-]*красн/.test(text)) {
    return {
      torso: { r: 0.05, g: 0.045, b: 0.055 },
      head: { r: 0.08, g: 0.06, b: 0.065 },
      limbs: { r: 0.06, g: 0.055, b: 0.065 },
      legs: { r: 0.08, g: 0.02, b: 0.025 },
    };
  }
  if (/blue[-\s]*(?:and\s*)?red|red[-\s]*(?:and\s*)?blue|син[еияа-яё\s-]*красн/.test(text)) {
    return {
      torso: { r: 0.08, g: 0.16, b: 0.82 },
      head: { r: 0.95, g: 0.80, b: 0.68 },
      limbs: { r: 0.10, g: 0.20, b: 0.88 },
      legs: { r: 0.14, g: 0.06, b: 0.62 },
    };
  }
  if (/white[-\s]*(?:and\s*)?gold|gold[-\s]*(?:and\s*)?white|бел[оа-яё\s-]*золот|золот[оа-яё\s-]*бел/.test(text)) {
    return {
      torso: { r: 0.86, g: 0.84, b: 0.74 },
      head: { r: 0.94, g: 0.82, b: 0.64 },
      limbs: { r: 0.90, g: 0.86, b: 0.76 },
      legs: { r: 0.74, g: 0.56, b: 0.22 },
    };
  }
  return null;
}

function scaleFromNpcTemplate(kind: NpcTemplateKind): { w: number; h: number; d: number } | null {
  switch (kind) {
    case 'gnome':
      return { w: 0.70, h: 0.70, d: 0.76 };
    case 'boss':
      return { w: 1.22, h: 1.18, d: 1.18 };
    case 'enemy':
    case 'fire_elemental':
      return { w: 1.08, h: 1.06, d: 1.08 };
    case 'robot':
      return { w: 1.10, h: 1.04, d: 1.10 };
    case 'superhero':
      return { w: 1.12, h: 1.08, d: 1.10 };
    case 'ninja':
      return { w: 0.92, h: 1.00, d: 0.92 };
    case 'undead':
      return { w: 0.94, h: 1.02, d: 0.92 };
    case 'gym_bro':
      // Bulky/buff prompt — wider shoulders, slightly taller.
      return { w: 1.20, h: 1.06, d: 1.18 };
    default:
      return null;
  }
}

function scaleFromNpcVisualFamily(family: NpcVisualFamily): { w: number; h: number; d: number } | null {
  switch (family) {
    case 'arachnid':
      return { w: 1.20, h: 1.02, d: 1.28 };
    case 'brute':
      return { w: 1.34, h: 1.10, d: 1.28 };
    case 'winged':
      return { w: 1.12, h: 1.08, d: 1.12 };
    case 'golem':
      return { w: 1.26, h: 1.12, d: 1.22 };
    case 'beast':
      return { w: 1.10, h: 1.02, d: 1.12 };
    case 'plant_fungal':
      return { w: 1.02, h: 0.98, d: 1.06 };
    case 'elemental':
      return { w: 1.12, h: 1.08, d: 1.10 };
    default:
      return null;
  }
}

// Top-priority palette source: LLM-driven `npcVisualConfig.bodyPalette`.
// Reads RGB tuples (0-255) and converts to the project's 0-1 float palette.
function paletteFromVisualConfig(metadata: Record<string, unknown>): Palette | null {
  const cfg = metadata.npcVisualConfig as Record<string, unknown> | undefined;
  if (!cfg || typeof cfg !== 'object') return null;
  const bp = cfg.bodyPalette as Record<string, unknown> | undefined;
  if (!bp || typeof bp !== 'object') return null;
  const toFloat = (arr: unknown): { r: number; g: number; b: number } | null => {
    if (!Array.isArray(arr) || arr.length < 3) return null;
    const [r, g, b] = arr;
    if (typeof r !== 'number' || typeof g !== 'number' || typeof b !== 'number') return null;
    return { r: r / 255, g: g / 255, b: b / 255 };
  };
  const torso = toFloat(bp.torso);
  const head = toFloat(bp.head);
  const limbs = toFloat(bp.limbs);
  const legs = toFloat(bp.legs);
  if (!torso || !head || !limbs || !legs) return null;
  return { torso, head, limbs, legs };
}

// Theme + role palettes for NPCs. Tried in order (theme overrides role).
// Returns null if NPC pipeline isn't requested or none of the keywords match.
function paletteFromNpcRole(prompt: string, metadata: Record<string, unknown>): Palette | null {
  const isNpc = metadata.contentCategory === 'npc_ai' || metadata.contentSubcategory === 'npcs';
  if (!isNpc) return null;
  const text = `${prompt} ${JSON.stringify(metadata)}`.toLowerCase();
  const npcRole = typeof metadata.npcRole === 'string' ? metadata.npcRole.toLowerCase() : '';

  // Theme keywords (override role)
  if (/ghost|spirit|spectre|specter|wraith|phantom|undead|ethereal|призрак|дух/.test(text)) {
    return {
      torso: { r: 0.85, g: 0.92, b: 1.00 }, head: { r: 0.92, g: 0.95, b: 1.00 },
      limbs: { r: 0.80, g: 0.88, b: 0.98 }, legs: { r: 0.70, g: 0.80, b: 0.95 },
    };
  }
  if (/zombie|rotten|corpse|зомби/.test(text)) {
    return {
      torso: { r: 0.42, g: 0.55, b: 0.32 }, head: { r: 0.52, g: 0.62, b: 0.40 },
      limbs: { r: 0.40, g: 0.52, b: 0.32 }, legs: { r: 0.28, g: 0.38, b: 0.22 },
    };
  }
  if (/skeleton|bone|skull|скелет/.test(text)) {
    return {
      torso: { r: 0.92, g: 0.90, b: 0.82 }, head: { r: 0.95, g: 0.93, b: 0.85 },
      limbs: { r: 0.92, g: 0.90, b: 0.82 }, legs: { r: 0.80, g: 0.78, b: 0.72 },
    };
  }
  if (/fire|flame|magma|inferno|пламя|огнен/.test(text)) {
    return {
      torso: { r: 0.78, g: 0.22, b: 0.12 }, head: { r: 0.92, g: 0.55, b: 0.20 },
      limbs: { r: 0.74, g: 0.20, b: 0.10 }, legs: { r: 0.50, g: 0.12, b: 0.05 },
    };
  }
  if (/ice|frost|snow|frozen|лед|снеж|морозн/.test(text)) {
    return {
      torso: { r: 0.55, g: 0.78, b: 0.92 }, head: { r: 0.78, g: 0.90, b: 0.98 },
      limbs: { r: 0.50, g: 0.75, b: 0.90 }, legs: { r: 0.38, g: 0.58, b: 0.78 },
    };
  }
  if (NPC_ROBOT_STYLE_CUE.test(text)) {
    return {
      torso: { r: 0.40, g: 0.42, b: 0.48 }, head: { r: 0.82, g: 0.82, b: 0.88 },
      limbs: { r: 0.35, g: 0.38, b: 0.42 }, legs: { r: 0.25, g: 0.28, b: 0.32 },
    };
  }
  if (/super\s*hero|superhero|heroic|cape|laser\s*eyes?|eye\s*laser|супергер|герой|плащ|лазер[а-яё\s-]*из\s+глаз/.test(text)) {
    return {
      torso: { r: 0.05, g: 0.18, b: 0.78 }, head: { r: 0.95, g: 0.80, b: 0.68 },
      limbs: { r: 0.05, g: 0.18, b: 0.78 }, legs: { r: 0.08, g: 0.10, b: 0.55 },
    };
  }
  if (/ogre|orc|troll|brute|гоблин|орк|тролль|огр/.test(text)) {
    return {
      torso: { r: 0.45, g: 0.58, b: 0.30 }, head: { r: 0.55, g: 0.68, b: 0.40 },
      limbs: { r: 0.42, g: 0.55, b: 0.28 }, legs: { r: 0.30, g: 0.40, b: 0.22 },
    };
  }

  // Role palettes (fallback when no theme keyword)
  if (npcRole === 'guard' || /knight|guard|police|cop|officer|sheriff|security|paladin|soldier|sentinel|warrior|рыцар|страж|охран|полици|полицей|офицер|шериф|воин/.test(text)) {
    return {
      torso: { r: 0.28, g: 0.32, b: 0.40 }, head: { r: 0.95, g: 0.78, b: 0.62 },
      limbs: { r: 0.32, g: 0.35, b: 0.42 }, legs: { r: 0.22, g: 0.24, b: 0.30 },
    };
  }
  if (npcRole === 'merchant' || /merchant|trader|shop|vendor|купец|торгов/.test(text)) {
    return {
      torso: { r: 0.62, g: 0.45, b: 0.28 }, head: { r: 0.95, g: 0.78, b: 0.62 },
      limbs: { r: 0.55, g: 0.40, b: 0.25 }, legs: { r: 0.38, g: 0.28, b: 0.18 },
    };
  }
  if (npcRole === 'boss' || /\b(?:boss|king|emperor|tyrant|warlord)\b|босс|царь/.test(text)) {
    return {
      torso: { r: 0.16, g: 0.16, b: 0.22 }, head: { r: 0.85, g: 0.72, b: 0.55 },
      limbs: { r: 0.18, g: 0.18, b: 0.24 }, legs: { r: 0.10, g: 0.10, b: 0.14 },
    };
  }
  if (npcRole === 'villain' || /villain|bandit|rogue|assassin|thief|злодей|разбойник/.test(text)) {
    return {
      torso: { r: 0.20, g: 0.18, b: 0.22 }, head: { r: 0.92, g: 0.75, b: 0.58 },
      limbs: { r: 0.22, g: 0.20, b: 0.25 }, legs: { r: 0.14, g: 0.13, b: 0.18 },
    };
  }
  if (npcRole === 'companion' || /companion|ally|sidekick|friend|спутник|союзник/.test(text)) {
    return {
      torso: { r: 0.85, g: 0.50, b: 0.35 }, head: { r: 0.95, g: 0.80, b: 0.68 },
      limbs: { r: 0.78, g: 0.45, b: 0.30 }, legs: { r: 0.55, g: 0.38, b: 0.28 },
    };
  }
  if (npcRole === 'quest_giver' || /quest|elder|sage|wizard|mentor|wise|маг|мудрец|старейшина/.test(text)) {
    return {
      torso: { r: 0.28, g: 0.20, b: 0.48 }, head: { r: 0.95, g: 0.78, b: 0.62 },
      limbs: { r: 0.26, g: 0.18, b: 0.42 }, legs: { r: 0.20, g: 0.14, b: 0.34 },
    };
  }
  if (npcRole === 'enemy' || /enemy|monster|demon|beast|враг|монстр|демон/.test(text)) {
    return {
      torso: { r: 0.48, g: 0.20, b: 0.18 }, head: { r: 0.55, g: 0.32, b: 0.28 },
      limbs: { r: 0.42, g: 0.18, b: 0.16 }, legs: { r: 0.30, g: 0.12, b: 0.12 },
    };
  }

  return null;
}

function inferPalette(prompt: string, metadata: Record<string, unknown>): Palette {
  const text = `${prompt} ${JSON.stringify(metadata)}`.toLowerCase();
  if (text.includes('hulk') || text.includes('green')) {
    return {
      torso: { r: 0.22, g: 0.58, b: 0.28 },
      head: { r: 0.52, g: 0.74, b: 0.41 },
      limbs: { r: 0.24, g: 0.62, b: 0.32 },
      legs: { r: 0.18, g: 0.24, b: 0.35 },
    };
  }
  return {
    torso: { r: 0.20, g: 0.45, b: 0.85 },
    head: { r: 0.95, g: 0.80, b: 0.68 },
    limbs: { r: 0.25, g: 0.50, b: 0.90 },
    legs: { r: 0.18, g: 0.28, b: 0.50 },
  };
}

function buildR6AnimateScript(): string {
  return [
    '-- R6 Animate Script (generated by AI pipeline)',
    'local character = script.Parent',
    'local humanoid = character:WaitForChild("Humanoid")',
    '',
    'local animations = {',
    '    idle = {',
    '        {id = "rbxassetid://180435571", weight = 9},',
    '        {id = "rbxassetid://180435792", weight = 1},',
    '    },',
    '    walk = {{id = "rbxassetid://180426354", weight = 10}},',
    '    run = {{id = "rbxassetid://180426354", weight = 10}},',
    '    jump = {{id = "rbxassetid://125750702", weight = 10}},',
    '    fall = {{id = "rbxassetid://180436148", weight = 10}},',
    '    climb = {{id = "rbxassetid://180436334", weight = 10}},',
    '}',
    '',
    'local currentTrack = nil',
    'local currentAnim = ""',
    '',
    'local function playAnimation(name)',
    '    if currentAnim == name then return end',
    '    if currentTrack then',
    '        currentTrack:Stop(0.2)',
    '    end',
    '    local animTable = animations[name]',
    '    if not animTable then return end',
    '    local chosen = animTable[1]',
    '    local anim = Instance.new("Animation")',
    '    anim.AnimationId = chosen.id',
    '    currentTrack = humanoid:LoadAnimation(anim)',
    '    currentTrack:Play(0.2)',
    '    currentAnim = name',
    'end',
    '',
    'humanoid.Running:Connect(function(speed)',
    '    if speed > 0.5 then',
    '        playAnimation("walk")',
    '    else',
    '        playAnimation("idle")',
    '    end',
    'end)',
    '',
    'humanoid.Jumping:Connect(function()',
    '    playAnimation("jump")',
    'end)',
    '',
    'humanoid.FreeFalling:Connect(function()',
    '    playAnimation("fall")',
    'end)',
    '',
    'humanoid.Climbing:Connect(function(speed)',
    '    if speed > 0 then',
    '        playAnimation("climb")',
    '    end',
    'end)',
    '',
    'playAnimation("idle")',
  ].join('\n');
}

function buildR15AnimateScript(): string {
  return [
    '-- R15 Animate Script (generated by AI pipeline)',
    'local character = script.Parent',
    'local humanoid = character:WaitForChild("Humanoid")',
    '',
    'local animations = {',
    '    idle = {',
    '        {id = "rbxassetid://507766666", weight = 9},',
    '        {id = "rbxassetid://507766951", weight = 1},',
    '    },',
    '    walk = {{id = "rbxassetid://507777826", weight = 10}},',
    '    run = {{id = "rbxassetid://507767714", weight = 10}},',
    '    jump = {{id = "rbxassetid://507765000", weight = 10}},',
    '    fall = {{id = "rbxassetid://507767968", weight = 10}},',
    '    climb = {{id = "rbxassetid://507765644", weight = 10}},',
    '    swim = {{id = "rbxassetid://507784897", weight = 10}},',
    '}',
    '',
    'local currentTrack = nil',
    'local currentAnim = ""',
    '',
    'local function playAnimation(name)',
    '    if currentAnim == name then return end',
    '    if currentTrack then',
    '        currentTrack:Stop(0.2)',
    '    end',
    '    local animTable = animations[name]',
    '    if not animTable then return end',
    '    local chosen = animTable[1]',
    '    local anim = Instance.new("Animation")',
    '    anim.AnimationId = chosen.id',
    '    currentTrack = humanoid:LoadAnimation(anim)',
    '    currentTrack:Play(0.2)',
    '    currentAnim = name',
    'end',
    '',
    'humanoid.Running:Connect(function(speed)',
    '    if speed > 0.5 then',
    '        playAnimation("walk")',
    '    else',
    '        playAnimation("idle")',
    '    end',
    'end)',
    '',
    'humanoid.Jumping:Connect(function()',
    '    playAnimation("jump")',
    'end)',
    '',
    'humanoid.FreeFalling:Connect(function()',
    '    playAnimation("fall")',
    'end)',
    '',
    'humanoid.Climbing:Connect(function(speed)',
    '    if speed > 0 then',
    '        playAnimation("climb")',
    '    end',
    'end)',
    '',
    'humanoid.Swimming:Connect(function(speed)',
    '    if speed > 0 then',
    '        playAnimation("swim")',
    '    end',
    'end)',
    '',
    'playAnimation("idle")',
  ].join('\n');
}

function buildNpcAnimatorScript(): string {
  return [
    '-- Server-side NPC animator. Workspace NPCs cannot rely on player LocalScripts.',
    'local character = script.Parent',
    'local humanoid = character:FindFirstChildWhichIsA("Humanoid")',
    'if not humanoid then return end',
    '',
    'local animator = humanoid:FindFirstChildOfClass("Animator")',
    'if not animator then',
    '    animator = Instance.new("Animator")',
    '    animator.Parent = humanoid',
    'end',
    '',
    'local animations = {',
    '    idle = { id = "rbxassetid://507766666", priority = Enum.AnimationPriority.Idle, looped = true },',
    '    walk = { id = "rbxassetid://507777826", priority = Enum.AnimationPriority.Movement, looped = true },',
    '    run = { id = "rbxassetid://507767714", priority = Enum.AnimationPriority.Movement, looped = true },',
    '    jump = { id = "rbxassetid://507765000", priority = Enum.AnimationPriority.Action, looped = false },',
    '    fall = { id = "rbxassetid://507767968", priority = Enum.AnimationPriority.Movement, looped = true },',
    '}',
    '',
    'local tracks = {}',
    'local current = nil',
    '',
    'local function getTrack(name)',
    '    if tracks[name] then return tracks[name] end',
    '    local info = animations[name]',
    '    if not info then return nil end',
    '    local anim = Instance.new("Animation")',
    '    anim.AnimationId = info.id',
    '    local ok, track = pcall(function()',
    '        return animator:LoadAnimation(anim)',
    '    end)',
    '    if not ok or not track then return nil end',
    '    track.Priority = info.priority',
    '    track.Looped = info.looped',
    '    tracks[name] = track',
    '    return track',
    'end',
    '',
    'local function play(name, fadeTime)',
    '    if current == name then return end',
    '    for trackName, track in pairs(tracks) do',
    '        if trackName ~= name and track.IsPlaying then',
    '            track:Stop(fadeTime or 0.18)',
    '        end',
    '    end',
    '    local track = getTrack(name)',
    '    if track then',
    '        track:Play(fadeTime or 0.18)',
    '        current = name',
    '    end',
    'end',
    '',
    'humanoid.Running:Connect(function(speed)',
    '    if speed > humanoid.WalkSpeed * 0.75 then',
    '        play("run")',
    '    elseif speed > 0.4 then',
    '        play("walk")',
    '    else',
    '        play("idle")',
    '    end',
    'end)',
    '',
    'humanoid.Jumping:Connect(function()',
    '    play("jump", 0.08)',
    'end)',
    '',
    'humanoid.FreeFalling:Connect(function()',
    '    play("fall", 0.12)',
    'end)',
    '',
    'humanoid.Died:Connect(function()',
    '    for _, track in pairs(tracks) do',
    '        if track.IsPlaying then track:Stop(0.1) end',
    '    end',
    'end)',
    '',
    'play("idle", 0)',
  ].join('\n');
}

function buildNpcClientReplicatorScript(): string {
  return [
    '-- NpcClientReplicator: clones every LocalScript bundled inside this NPC',
    '-- Model into each player\'s PlayerGui. LocalScripts in arbitrary Workspace',
    '-- models do not run; PlayerScripts is not server-accessible, but PlayerGui',
    '-- is replicated to the owning client and runs LocalScripts.',
    '-- We do NOT filter on `.Disabled` because some manifest serializers drop',
    '-- that property; instead we forcibly disable the original copy here.',
    'local Players = game:GetService("Players")',
    'local HttpService = game:GetService("HttpService")',
    'local model = script.Parent',
    '',
    'local function findBundledLocalScripts()',
    '    local list = {}',
    '    for _, child in ipairs(model:GetChildren()) do',
    '        if child:IsA("LocalScript") then',
    '            child.Disabled = true',
    '            table.insert(list, child)',
    '        end',
    '    end',
    '    return list',
    'end',
    '',
    "local modelTag = HttpService:GenerateGUID(false):sub(1, 8)",
    'print("[NpcClientReplicator] Started for model =", model.Name, "tag =", modelTag)',
    '',
    'local function copyToPlayer(player)',
    '    local playerGui = player:WaitForChild("PlayerGui", 10)',
    '    if not playerGui then',
    '        warn("[NpcClientReplicator] PlayerGui missing for", player.Name)',
    '        return',
    '    end',
    '    local hostName = "AI_NPC_ClientHost_" .. modelTag',
    '    local host = playerGui:FindFirstChild(hostName)',
    '    if not host then',
    '        host = Instance.new("ScreenGui")',
    '        host.Name = hostName',
    '        host.ResetOnSpawn = false',
    '        host.IgnoreGuiInset = true',
    '        host.DisplayOrder = -1000',
    '        host.Parent = playerGui',
    '    end',
    '    local scripts = findBundledLocalScripts()',
    '    print("[NpcClientReplicator] Copying", #scripts, "LocalScript(s) to PlayerGui for", player.Name)',
    '    for _, ls in ipairs(scripts) do',
    '        local copyName = ls.Name .. "_" .. modelTag',
    '        if not host:FindFirstChild(copyName) then',
    '            local clone = ls:Clone()',
    '            clone.Name = copyName',
    '            clone.Disabled = false',
    '            clone.Parent = host',
    '            print("[NpcClientReplicator]  - cloned", ls.Name, "as", copyName)',
    '        end',
    '    end',
    'end',
    '',
    'Players.PlayerAdded:Connect(copyToPlayer)',
    'for _, player in ipairs(Players:GetPlayers()) do',
    '    task.spawn(copyToPlayer, player)',
    'end',
  ].join('\n');
}

function buildClothingAutoEquipScript(
  shirtTemplateUrl?: string,
  pantsTemplateUrl?: string,
): string {
  const normalizeTemplate = (value?: string): string => {
    if (typeof value !== 'string') return '';
    const raw = value.trim();
    if (!raw) return '';
    if (raw.startsWith('rbxassetid://') || raw.startsWith('rbxasset://')) return raw;
    const idMatch = raw.match(/id=(\d+)/) ?? raw.match(/^(\d+)$/);
    if (idMatch && idMatch[1]) {
      return `rbxassetid://${idMatch[1]}`;
    }
    return '';
  };
  const safeShirt = normalizeTemplate(shirtTemplateUrl);
  const safePants = normalizeTemplate(pantsTemplateUrl);
  return [
    '-- AutoEquipClothing (clean minimal version)',
    'local Players = game:GetService("Players")',
    '',
    `local SHIRT_TEMPLATE = ${JSON.stringify(safeShirt)}`,
    `local PANTS_TEMPLATE = ${JSON.stringify(safePants)}`,
    '',
    'print("[AIClothing] Started, shirt =", SHIRT_TEMPLATE, "pants =", PANTS_TEMPLATE)',
    '',
    'local function applyClothing(character)',
    '    task.wait(1)',
    '',
    '    if SHIRT_TEMPLATE ~= "" then',
    '        for _, v in pairs(character:GetChildren()) do',
    '            if v:IsA("Shirt") then v:Destroy() end',
    '        end',
    '        local shirt = Instance.new("Shirt")',
    '        shirt.ShirtTemplate = SHIRT_TEMPLATE',
    '        shirt.Parent = character',
    '        print("[AIClothing] Shirt applied:", SHIRT_TEMPLATE)',
    '    end',
    '',
    '    if PANTS_TEMPLATE ~= "" then',
    '        for _, v in pairs(character:GetChildren()) do',
    '            if v:IsA("Pants") then v:Destroy() end',
    '        end',
    '        local pants = Instance.new("Pants")',
    '        pants.PantsTemplate = PANTS_TEMPLATE',
    '        pants.Parent = character',
    '        print("[AIClothing] Pants applied:", PANTS_TEMPLATE)',
    '    end',
    'end',
    '',
    'Players.PlayerAdded:Connect(function(player)',
    '    player.CharacterAdded:Connect(applyClothing)',
    'end)',
    '',
    'for _, player in pairs(Players:GetPlayers()) do',
    '    player.CharacterAdded:Connect(applyClothing)',
    '    if player.Character then',
    '        applyClothing(player.Character)',
    '    end',
    'end',
  ].join('\n');
}

function buildTShirtAutoEquipScript(
  graphicUrl?: string,
): string {
  const normalizeTemplate = (value?: string): string => {
    if (typeof value !== 'string') return '';
    const raw = value.trim();
    if (!raw) return '';
    if (raw.startsWith('rbxassetid://') || raw.startsWith('rbxasset://')) return raw;
    const idMatch = raw.match(/id=(\d+)/) ?? raw.match(/^(\d+)$/);
    if (idMatch && idMatch[1]) {
      return `rbxassetid://${idMatch[1]}`;
    }
    return '';
  };
  const safeGraphic = normalizeTemplate(graphicUrl);
  return [
    '-- AutoEquipTShirt',
    'local Players = game:GetService("Players")',
    '',
    `local TSHIRT_GRAPHIC = ${JSON.stringify(safeGraphic)}`,
    '',
    'print("[AITShirt] Started, graphic =", TSHIRT_GRAPHIC)',
    '',
    'local function applyTShirt(character)',
    '    task.wait(1)',
    '    if TSHIRT_GRAPHIC == "" then',
    '        warn("[AITShirt] No Roblox asset id available. Upload the generated PNG as a Classic T-Shirt first.")',
    '        return',
    '    end',
    '    for _, v in pairs(character:GetChildren()) do',
    '        if v:IsA("ShirtGraphic") then v:Destroy() end',
    '    end',
    '    local tshirt = Instance.new("ShirtGraphic")',
    '    tshirt.Graphic = TSHIRT_GRAPHIC',
    '    tshirt.Parent = character',
    '    print("[AITShirt] ShirtGraphic applied:", TSHIRT_GRAPHIC)',
    'end',
    '',
    'Players.PlayerAdded:Connect(function(player)',
    '    player.CharacterAdded:Connect(applyTShirt)',
    'end)',
    '',
    'for _, player in pairs(Players:GetPlayers()) do',
    '    player.CharacterAdded:Connect(applyTShirt)',
    '    if player.Character then',
    '        applyTShirt(player.Character)',
    '    end',
    'end',
  ].join('\n');
}

function buildMeshLoaderScript(modelName: string, modelUrl?: string): string {
  const safeTitle = modelName.replace(/"/g, '\\"');
  const safeUrl = (modelUrl ?? '').replace(/"/g, '\\"');
  return [
    '-- AI Character Auto-Scale & Setup (generated by AI pipeline)',
    '-- Ensures the character is correctly sized for Roblox',
    '',
    'local Workspace = game:GetService("Workspace")',
    '',
    `local CHARACTER_NAME = "${safeTitle}"`,
    `local AI_MODEL_URL = "${safeUrl}"`,
    'local TARGET_HEIGHT = 5.5',
    '',
    'local R6_SIZES = {',
    '    HumanoidRootPart = Vector3.new(2, 2, 1),',
    '    Torso = Vector3.new(2, 2, 1),',
    '    Head = Vector3.new(2, 1, 1),',
    '    ["Left Arm"] = Vector3.new(1, 2, 1),',
    '    ["Right Arm"] = Vector3.new(1, 2, 1),',
    '    ["Left Leg"] = Vector3.new(1, 2, 1),',
    '    ["Right Leg"] = Vector3.new(1, 2, 1),',
    '}',
    '',
    'local R6_OFFSETS = {',
    '    HumanoidRootPart = CFrame.new(0, 3, 0),',
    '    Torso = CFrame.new(0, 3, 0),',
    '    Head = CFrame.new(0, 4.5, 0),',
    '    ["Left Arm"] = CFrame.new(-1.5, 3, 0),',
    '    ["Right Arm"] = CFrame.new(1.5, 3, 0),',
    '    ["Left Leg"] = CFrame.new(-0.5, 1, 0),',
    '    ["Right Leg"] = CFrame.new(0.5, 1, 0),',
    '}',
    '',
    'local function enforceR6Sizes(model)',
    '    for partName, targetSize in pairs(R6_SIZES) do',
    '        local part = model:FindFirstChild(partName)',
    '        if part and part:IsA("BasePart") then',
    '            part.Size = targetSize',
    '        end',
    '    end',
    '    local rootPart = model:FindFirstChild("HumanoidRootPart")',
    '    if rootPart then',
    '        local spawnPos = rootPart.Position',
    '        for partName, offset in pairs(R6_OFFSETS) do',
    '            local part = model:FindFirstChild(partName)',
    '            if part and part:IsA("BasePart") then',
    '                part.CFrame = CFrame.new(spawnPos) * offset',
    '            end',
    '        end',
    '    end',
    'end',
    '',
    'local function scaleModelToHeight(model, targetH)',
    '    local _, size = model:GetBoundingBox()',
    '    local currentH = size.Y',
    '    if currentH < 0.1 then return end',
    '    local scaleFactor = targetH / currentH',
    '    if math.abs(scaleFactor - 1) < 0.05 then return end',
    '    if model.ScaleTo then',
    '        model:ScaleTo(scaleFactor)',
    '        print("[AI Character] Scaled model by " .. string.format("%.1fx", scaleFactor))',
    '    else',
    '        for _, part in ipairs(model:GetDescendants()) do',
    '            if part:IsA("BasePart") then',
    '                part.Size = part.Size * scaleFactor',
    '                local rel = part.CFrame.Position - model:GetPivot().Position',
    '                part.CFrame = CFrame.new(model:GetPivot().Position + rel * scaleFactor) * (part.CFrame - part.CFrame.Position)',
    '            end',
    '        end',
    '    end',
    'end',
    '',
    'local function setupCharacter()',
    '    for _, child in ipairs(Workspace:GetChildren()) do',
    '        if child:IsA("Model") and child.Name == CHARACTER_NAME then',
    '            enforceR6Sizes(child)',
    '            local _, size = child:GetBoundingBox()',
    '            if math.abs(size.Y - TARGET_HEIGHT) > 0.15 then',
    '                scaleModelToHeight(child, TARGET_HEIGHT)',
    '            end',
    '            local humanoid = child:FindFirstChildOfClass("Humanoid")',
    '            if humanoid then',
    '                humanoid.WalkSpeed = 16',
    '                humanoid.JumpPower = 50',
    '            end',
    '            print("[AI Character] " .. CHARACTER_NAME .. " ready! Height: " .. string.format("%.1f", size.Y) .. " studs")',
    '            if AI_MODEL_URL ~= "" then',
    '                print("[AI Character] GLB model URL: " .. AI_MODEL_URL)',
    '                print("[AI Character] To replace with AI mesh: File > Import 3D > select downloaded GLB")',
    '            end',
    '            return child',
    '        end',
    '    end',
    '    return nil',
    'end',
    '',
    'task.wait(1)',
    'local model = setupCharacter()',
    'if not model then',
    '    print("[AI Character] Model not found. Place it in Workspace first.")',
    '    Workspace.ChildAdded:Connect(function(child)',
    '        if child:IsA("Model") and child.Name == CHARACTER_NAME then',
    '            task.wait(0.5)',
    '            setupCharacter()',
    '        end',
    '    end)',
    'end',
  ].join('\n');
}

/**
 * Serializes a JS value to a Lua literal.
 * - string → "escaped"
 * - number/boolean → raw
 * - null/undefined → nil
 * - array → { v1, v2, ... }
 * - object → { ["key"] = value, ... } — bracket-key form is safest for arbitrary keys.
 * Needed because Lua tables don't share JSON's `[]` / `{"k":"v"}` syntax.
 */
function toLuaLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'nil';
  if (typeof value === 'string') {
    const escaped = value
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');
    return `"${escaped}"`;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : 'nil';
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value)) {
    if (value.length === 0) return '{}';
    const items = value.map((v) => toLuaLiteral(v)).join(', ');
    return `{ ${items} }`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return '{}';
    const pairs = entries.map(([k, v]) => `[${toLuaLiteral(k)}] = ${toLuaLiteral(v)}`).join(', ');
    return `{ ${pairs} }`;
  }
  return 'nil';
}

function buildSharedConfigModule(
  title: string,
  summary: string,
  systems: string[],
  metadata: Record<string, unknown>,
  terrainSpec?: GameSceneSpecTerrain | null,
): string {
  const lines = [
    '-- Generated shared config',
    'return {',
    `    title = ${toLuaLiteral(title)},`,
    `    summary = ${toLuaLiteral(summary.slice(0, 220))},`,
    `    systems = ${toLuaLiteral(systems)},`,
  ];
  if (terrainSpec) {
    lines.push(`    Biome = ${toLuaLiteral(terrainSpec.biome || 'Grass')},`);
    lines.push(`    TerrainSeed = ${terrainSpec.seed ?? Math.floor(Math.random() * 10000)},`);
    lines.push(`    TerrainAmplitude = ${terrainSpec.amplitude ?? 20},`);
    lines.push(`    TerrainBaseHeight = ${terrainSpec.baseHeight ?? 0},`);
    lines.push(`    TerrainRange = ${terrainSpec.range ?? 256},`);
    if (terrainSpec.features) {
      lines.push(`    TerrainFeatures = ${toLuaLiteral(terrainSpec.features)},`);
    }
  }
  lines.push(`    metadata = ${toLuaLiteral(metadata)},`);
  lines.push('}');
  return lines.join('\n');
}

function buildTerrainGeneratorScript(): string {
  return [
    'local ReplicatedStorage = game:GetService("ReplicatedStorage")',
    'local config = require(ReplicatedStorage:WaitForChild("GeneratedSharedConfig"))',
    'local Terrain = workspace.Terrain',
    '',
    'local BIOME = config.Biome or "Grass"',
    'local SEED = config.TerrainSeed or 42',
    'local AMP = config.TerrainAmplitude or 20',
    'local BASE = config.TerrainBaseHeight or 0',
    'local RANGE = config.TerrainRange or 256',
    'local FEATURES = config.TerrainFeatures or {}',
    '',
    'local MATERIAL_MAP = {',
    '    Grass = Enum.Material.Grass,',
    '    Sand = Enum.Material.Sand,',
    '    Snow = Enum.Material.Snow,',
    '    Rock = Enum.Material.Rock,',
    '    Mud = Enum.Material.Mud,',
    '    Ice = Enum.Material.Ice,',
    '    Lava = Enum.Material.CrackedLava,',
    '    Slate = Enum.Material.Slate,',
    '    Concrete = Enum.Material.Concrete,',
    '}',
    'local baseMaterial = MATERIAL_MAP[BIOME] or Enum.Material.Grass',
    '',
    'local hasFeature = {}',
    'for _, f in ipairs(FEATURES) do hasFeature[f] = true end',
    '',
    'local STEP = 3',
    'Terrain:Clear()',
    '',
    'for x = -RANGE, RANGE, STEP do',
    '    for z = -RANGE, RANGE, STEP do',
    '        local n1 = math.noise(x / 80, z / 80, SEED)',
    '        local n2 = math.noise(x / 30, z / 30, SEED + 100) * 0.3',
    '        local n3 = math.noise(x / 15, z / 15, SEED + 200) * 0.15',
    '        local height',
    '        if hasFeature["village_hills"] then',
    '            local villageMask = math.max(math.abs(x) / 125, math.abs(z) / 105)',
    '            if villageMask < 1 then',
    '                height = BASE + 2 + n1 * 1.2',
    '            else',
    '                local outer = math.min(1, (villageMask - 1) * 1.4)',
    '                height = BASE + 2 + n1 * 2 + outer * (5 + math.max(0, n1) * AMP * 1.35 + math.abs(n2) * AMP)',
    '            end',
    '        elseif hasFeature["flat"] then',
    '            height = BASE + 0.9 + n1 * 0.35',
    '        elseif hasFeature["hills"] then',
    '            height = BASE + AMP * (n1 + 0.5) + n2 * AMP * 0.3 + n3 * AMP * 0.15',
    '        else',
    '            height = BASE + AMP * 0.5 * (n1 + 0.5) + n3 * AMP * 0.1',
    '        end',
    '        if hasFeature["playable_plateau"] and not hasFeature["village_hills"] then',
    '            local plateauMask = math.max(math.abs(x) / 135, math.abs(z) / 115)',
    '            local plateauHeight = BASE + 0.9 + n1 * 0.25',
    '            if plateauMask < 1 then',
    '                height = plateauHeight',
    '            elseif plateauMask < 1.35 then',
    '                local blend = (plateauMask - 1) / 0.35',
    '                height = plateauHeight * (1 - blend) + height * blend',
    '            end',
    '        end',
    '        height = math.max(height, 0.8)',
    '',
    '        local mat = baseMaterial',
    '        local peakThreshold = AMP * 0.75',
    '        if BIOME == "Grass" then',
    '            if height > peakThreshold then',
    '                mat = Enum.Material.Rock',
    '            elseif height > peakThreshold * 0.6 then',
    '                mat = Enum.Material.Slate',
    '            end',
    '        elseif BIOME == "Snow" then',
    '            if height > peakThreshold then',
    '                mat = Enum.Material.Glacier',
    '            elseif height < peakThreshold * 0.3 then',
    '                mat = Enum.Material.Ice',
    '            end',
    '        elseif BIOME == "Sand" then',
    '            if height > peakThreshold then',
    '                mat = Enum.Material.Sandstone',
    '            end',
    '        elseif BIOME == "Lava" then',
    '            if height < peakThreshold * 0.3 then',
    '                mat = Enum.Material.CrackedLava',
    '            else',
    '                mat = Enum.Material.Basalt',
    '            end',
    '        end',
    '',
    '        Terrain:FillBlock(CFrame.new(x, height / 2, z), Vector3.new(STEP, height, STEP), mat)',
    '    end',
    '    if x % 24 == 0 then task.wait() end',
    'end',
    '',
    'if hasFeature["river"] then',
    '    for z = -RANGE, RANGE, STEP do',
    '        local riverX = math.sin(z / 50) * 25 + math.noise(z / 100, SEED + 300) * 15',
    '        local riverWidth = 14 + math.noise(z / 60, SEED + 400) * 10',
    '        -- Clear hills above the river path so the water surface is visible',
    '        Terrain:FillBlock(CFrame.new(riverX, 20, z), Vector3.new(riverWidth + 2, 40, STEP), Enum.Material.Air)',
    '        -- Carve 12-stud-deep swimmable channel with surface at Y=0',
    '        Terrain:FillBlock(CFrame.new(riverX, -6, z), Vector3.new(riverWidth, 12, STEP), Enum.Material.Water)',
    '    end',
    'end',
    '',
    'if hasFeature["lake"] then',
    '    local lakeX = math.noise(SEED * 0.01, 0) * 60',
    '    local lakeZ = math.noise(0, SEED * 0.01) * 60',
    '    for dx = -40, 40, STEP do',
    '        for dz = -40, 40, STEP do',
    '            local dist = math.sqrt(dx * dx + dz * dz)',
    '            if dist < 35 + math.noise(dx / 20, dz / 20, SEED + 500) * 10 then',
    '                Terrain:FillBlock(CFrame.new(lakeX + dx, -4, lakeZ + dz), Vector3.new(STEP, 12, STEP), Enum.Material.Water)',
    '            end',
    '        end',
    '    end',
    'end',
    '',
    '-- Convert decorative water plates (Glass, non-colliding, transparent) into real Terrain water so Humanoid can swim',
    'local mapRoot = workspace:FindFirstChild("GeneratedMapEnvironment")',
    'if mapRoot then',
    '    local toConvert = {}',
    '    for _, inst in ipairs(mapRoot:GetDescendants()) do',
    '        if inst:IsA("BasePart")',
    '            and inst.Material == Enum.Material.Glass',
    '            and inst.Transparency > 0',
    '            and inst.CanCollide == false',
    '            and inst.Anchored == true then',
    '            table.insert(toConvert, inst)',
    '        end',
    '    end',
    '    for _, part in ipairs(toConvert) do',
    '        local cf = part.CFrame',
    '        local sz = part.Size',
    '        local widthX = math.max(sz.X, 4)',
    '        local widthZ = math.max(sz.Z, 4)',
    '        local depth = 12',
    '        local topOffset = sz.Y * 0.5',
    '        -- Clear terrain above the water surface so heightmap hills do not hide the water',
    '        Terrain:FillBlock(',
    '            cf * CFrame.new(0, topOffset + 20, 0),',
    '            Vector3.new(widthX, 40, widthZ),',
    '            Enum.Material.Air',
    '        )',
    '        -- Carve swimmable water: top aligned to original plate, depth 12 studs',
    '        Terrain:FillBlock(',
    '            cf * CFrame.new(0, topOffset - depth * 0.5, 0),',
    '            Vector3.new(widthX, depth, widthZ),',
    '            Enum.Material.Water',
    '        )',
    '        part:Destroy()',
    '    end',
    '    if #toConvert > 0 then',
    '        print("[TerrainGenerator] Converted " .. #toConvert .. " decorative water plates to Terrain water")',
    '    end',
    'end',
    '',
    'print("[TerrainGenerator] Done: biome=" .. BIOME .. " range=" .. RANGE)',
  ].join('\n');
}

function sanitizeSystemName(name: string): string {
  return name.replace(/[^A-Za-z0-9_]/g, '');
}

function inferMimeType(sourceUrl: string): string {
  const lower = sourceUrl.toLowerCase();
  if (lower.includes('.fbx')) return 'model/fbx';
  if (lower.includes('.obj')) return 'model/obj';
  if (lower.includes('.glb')) return 'model/gltf-binary';
  return 'application/octet-stream';
}

function extensionFromMimeType(mimeType: string, sourceUrl: string): string {
  if (mimeType.includes('fbx')) return 'fbx';
  if (mimeType.includes('obj')) return 'obj';
  if (mimeType.includes('gltf') || mimeType.includes('glb')) return 'glb';
  const lower = sourceUrl.toLowerCase();
  if (lower.includes('.fbx')) return 'fbx';
  if (lower.includes('.obj')) return 'obj';
  if (lower.includes('.glb')) return 'glb';
  return 'bin';
}

export interface AnimationBuildResult {
  outputBase64: string;
  summary: string;
}

export async function buildAnimationBinary(
  keyframesJson: Record<string, unknown>,
): Promise<AnimationBuildResult | null> {
  const workerUrl = getRobloxWorkerUrl();
  if (workerUrl) {
    const response = await fetchWorkerJson(`${workerUrl.replace(/\/$/, '')}/build-animation`, {
      method: 'POST',
      headers: buildWorkerHeaders(),
      body: JSON.stringify({ keyframes: keyframesJson }),
    });
    const outputBase64 = typeof response.outputBase64 === 'string' ? response.outputBase64 : '';
    if (!outputBase64) {
      throw new Error('Animation worker did not return outputBase64');
    }
    return {
      outputBase64,
      summary: typeof response.summary === 'string'
        ? response.summary
        : 'Animation binary built by worker.',
    };
  }

  const command = getRobloxWorkerCommand();
  if (!command) {
    return null;
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'roblox-worker-anim-'));
  const inputPath = path.join(tempDir, 'keyframes.json');
  const outputPath = path.join(tempDir, 'animation.rbxm');
  await writeFile(inputPath, JSON.stringify(keyframesJson, null, 2), 'utf8');
  try {
    const extraArgs = splitArgs(getRobloxWorkerArgs());
    await runCommand(command, [...extraArgs, 'build-animation', inputPath, outputPath]);
    return {
      outputBase64: (await readFile(outputPath)).toString('base64'),
      summary: 'Animation KeyframeSequence built locally.',
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function buildScriptBinary(
  scriptPayload: Record<string, unknown>,
): Promise<AnimationBuildResult | null> {
  const workerUrl = getRobloxWorkerUrl();
  if (!workerUrl) {
    return null;
  }
  const response = await fetchWorkerJson(`${workerUrl.replace(/\/$/, '')}/build-script`, {
    method: 'POST',
    headers: buildWorkerHeaders(),
    body: JSON.stringify({ script: scriptPayload }),
  });
  const outputBase64 = typeof response.outputBase64 === 'string' ? response.outputBase64 : '';
  if (!outputBase64) {
    throw new Error('Script worker did not return outputBase64');
  }
  return {
    outputBase64,
    summary: typeof response.summary === 'string' ? response.summary : 'Script packed as .rbxm.',
  };
}

export async function buildDecalBinary(
  decalSpec: Record<string, unknown>,
): Promise<AnimationBuildResult | null> {
  const workerUrl = getRobloxWorkerUrl();
  if (!workerUrl) {
    return null;
  }
  const response = await fetchWorkerJson(`${workerUrl.replace(/\/$/, '')}/build-decal`, {
    method: 'POST',
    headers: buildWorkerHeaders(),
    body: JSON.stringify({ decal: decalSpec }),
  });
  const outputBase64 = typeof response.outputBase64 === 'string' ? response.outputBase64 : '';
  if (!outputBase64) {
    throw new Error('Decal worker did not return outputBase64');
  }
  return {
    outputBase64,
    summary: typeof response.summary === 'string' ? response.summary : 'Decal packed as .rbxm.',
  };
}

export async function resolveImageIdFromDecal(
  decalAssetId: number,
  bearerToken?: string,
  options?: { apiKey?: string; disableNaiveFallback?: boolean },
): Promise<number | null> {
  // assetdelivery.roblox.com refuses freshly uploaded private assets without auth (403). For
  // jobs that uploaded under a system Open Cloud key (no user OAuth), we now also accept an
  // `apiKey` and pass it as `x-api-key` so both lookup methods can authenticate.
  const apiKey = options?.apiKey;
  const disableNaiveFallback = options?.disableNaiveFallback === true;
  const buildHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = {};
    if (bearerToken) {
      headers['Authorization'] = `Bearer ${bearerToken}`;
    } else if (apiKey) {
      headers['x-api-key'] = apiKey;
    }
    return headers;
  };
  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    // Method A (modern Open Cloud, ALWAYS try first): apis.roblox.com supports x-api-key
    // and OAuth bearer. Returns the asset envelope with `backingAssetId` for Decal wrappers.
    // This used to be a fallback inside Method 1's success branch, which meant it never ran
    // when assetdelivery returned 403 (system api-key path). Promoted to first.
    try {
      const apiResponse = await fetch(
        `https://apis.roblox.com/assets/v1/assets/${decalAssetId}?readMask=*`,
        { headers: buildHeaders() },
      );
      if (apiResponse.ok) {
        const apiData = await apiResponse.json() as {
          backingAssetId?: number;
          assetType?: string;
          assetTypeId?: number;
          decalDetails?: { textureAssetId?: number };
          imageDetails?: { textureAssetId?: number };
        };
        const candidate = apiData.backingAssetId
          ?? apiData.decalDetails?.textureAssetId
          ?? apiData.imageDetails?.textureAssetId;
        if (candidate) {
          console.log(`[resolveImageIdFromDecal] Decal ${decalAssetId} → ${candidate} via Open Cloud assets API (attempt ${attempt})`);
          return candidate;
        }
        console.warn(`[resolveImageIdFromDecal] Open Cloud assets API returned 200 but no inner ID for ${decalAssetId}, body=${JSON.stringify(apiData).slice(0, 200)}`);
      } else {
        console.warn(`[resolveImageIdFromDecal] Open Cloud assets API attempt ${attempt}: ${apiResponse.status} for decal ${decalAssetId}`);
      }
    } catch (apiErr) {
      console.warn('[resolveImageIdFromDecal] Open Cloud assets API threw:', apiErr);
    }

    // Method B (legacy assetdelivery, fallback): old endpoint that auths via cookie or
    // OAuth bearer ONLY (rejects x-api-key with 403). Useful when the caller has user OAuth.
    try {
      const url = `https://assetdelivery.roblox.com/v1/asset/?id=${decalAssetId}`;
      const response = await fetch(url, { redirect: 'follow', headers: buildHeaders() });
      if (!response.ok) {
        console.warn(`[resolveImageIdFromDecal] assetdelivery attempt ${attempt}: ${response.status} for decal ${decalAssetId}`);
      } else {
        const text = await response.text();
        const match = text.match(/(?:rbxassetid:\/\/|asset\/?\?id=)(\d+)/);
        if (match) {
          const imageId = parseInt(match[1], 10);
          console.log(`[resolveImageIdFromDecal] Decal ${decalAssetId} → Image ${imageId} via assetdelivery (attempt ${attempt})`);
          return imageId;
        }
        console.warn(`[resolveImageIdFromDecal] assetdelivery returned 200 but no rbxassetid match for ${decalAssetId}`);
      }
    } catch (err) {
      console.error(`[resolveImageIdFromDecal] assetdelivery attempt ${attempt} threw:`, err);
    }

    if (attempt < maxRetries) {
      // Roblox propagation: a freshly uploaded asset's metadata may not be readable for a
      // few seconds. Backoff longer between attempts to give it time.
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }

  // Fallback: historically Image ID often = Decal ID + 1, but this is just a heuristic
  // Roblox does not guarantee. For SurfaceAppearance.ColorMap / MeshPart.TextureID a wrong
  // ID produces "Request asset was not found" in Studio (worse than no texture at all).
  // Callers that prefer a fail-loud null over a guess pass `disableNaiveFallback: true`.
  if (disableNaiveFallback) {
    console.warn(`[resolveImageIdFromDecal] All attempts failed for decal ${decalAssetId}, returning null (fallback disabled)`);
    return null;
  }
  const fallback = decalAssetId + 1;
  console.warn(`[resolveImageIdFromDecal] Using fallback: Decal ${decalAssetId} → Image ${fallback}`);
  return fallback;
}

export async function buildAnimationFbx(
  keyframesJson: Record<string, unknown>,
): Promise<AnimationBuildResult | null> {
  const workerUrl = getRobloxWorkerUrl();
  if (!workerUrl) {
    return null;
  }
  const response = await fetchWorkerJson(`${workerUrl.replace(/\/$/, '')}/build-animation-fbx`, {
    method: 'POST',
    headers: buildWorkerHeaders(),
    body: JSON.stringify({ keyframes: keyframesJson }),
  });
  const outputBase64 = typeof response.outputBase64 === 'string' ? response.outputBase64 : '';
  if (!outputBase64) {
    throw new Error('Animation FBX worker did not return outputBase64');
  }
  return {
    outputBase64,
    summary: typeof response.summary === 'string'
      ? response.summary
      : 'Animation FBX built by worker.',
  };
}

export async function renderAnimationPreview(
  keyframesJson: Record<string, unknown>,
): Promise<{ outputBase64: string; summary: string } | null> {
  const workerUrl = getRobloxWorkerUrl();
  if (!workerUrl) {
    return null;
  }
  try {
    const response = await fetchWorkerJson(`${workerUrl.replace(/\/$/, '')}/render-animation-preview`, {
      method: 'POST',
      headers: buildWorkerHeaders(),
      body: JSON.stringify({ keyframes: keyframesJson }),
    });
    const outputBase64 = typeof response.outputBase64 === 'string' ? response.outputBase64 : '';
    if (!outputBase64) {
      return null;
    }
    return {
      outputBase64,
      summary: typeof response.summary === 'string' ? response.summary : 'Animation GIF preview.',
    };
  } catch (err) {
    // Non-critical — preview failure should not block FBX pipeline
    console.warn('renderAnimationPreview failed:', err);
    return null;
  }
}

export interface AssetGenerationContext {
  meshUrl?: string;
  meshStorageUrl?: string;
  meshRobloxAssetId?: number;
  textureUrl?: string;
  textureStorageUrl?: string;
  textureRobloxAssetId?: number;
  audioUrl?: string;
  audioStorageUrl?: string;
  audioRobloxAssetId?: number;
  normalMapUrl?: string;
  roughnessMapUrl?: string;
  metalnessMapUrl?: string;
}

export function enrichManifestWithAssets(
  manifest: RobloxBuildManifest,
  context: AssetGenerationContext,
): RobloxBuildManifest {
  const assets: RobloxAssetRef[] = [...(manifest.assets ?? [])];
  const extraSceneNodes: RobloxBuildSceneNode[] = [];
  const contentFolderId = manifest.scene.find(n => n.name === 'GeneratedContent')?.id ?? 'WorkspaceRoot';

  if (context.meshUrl || context.meshRobloxAssetId) {
    const meshAssetUrl = context.meshRobloxAssetId
      ? toRobloxAssetUrl(String(context.meshRobloxAssetId))
      : (context.meshUrl ?? '');
    const textureAssetUrl = context.textureRobloxAssetId
      ? toRobloxAssetUrl(String(context.textureRobloxAssetId))
      : (context.textureUrl ?? '');

    const meshPartNode = makeMeshPartNode({
      name: 'AI_GeneratedMesh',
      parentId: contentFolderId,
      meshId: meshAssetUrl,
      textureId: textureAssetUrl || undefined,
      size: [4, 4, 4],
      position: [0, 5, 0],
      anchored: true,
    });
    extraSceneNodes.push(meshPartNode);

    if (context.normalMapUrl || context.roughnessMapUrl || context.metalnessMapUrl) {
      extraSceneNodes.push(makeSurfaceAppearanceNode({
        parentId: meshPartNode.id,
        colorMap: textureAssetUrl || undefined,
        normalMap: context.normalMapUrl,
        roughnessMap: context.roughnessMapUrl,
        metalnessMap: context.metalnessMapUrl,
      }));
    }

    assets.push(buildAssetRef({
      name: 'AI_Mesh',
      assetType: 'mesh',
      meshId: meshAssetUrl,
      textureId: textureAssetUrl || undefined,
      storageUrl: context.meshStorageUrl,
      robloxAssetId: context.meshRobloxAssetId,
    }));

    if (textureAssetUrl) {
      assets.push(buildAssetRef({
        name: 'AI_MeshTexture',
        assetType: 'texture',
        textureId: textureAssetUrl,
        storageUrl: context.textureStorageUrl,
        robloxAssetId: context.textureRobloxAssetId,
      }));
    }
  }

  if (context.audioUrl || context.audioRobloxAssetId) {
    const audioAssetUrl = context.audioRobloxAssetId
      ? toRobloxAssetUrl(String(context.audioRobloxAssetId))
      : (context.audioUrl ?? '');

    extraSceneNodes.push(makeSoundNode({
      name: 'AI_GeneratedAudio',
      parentId: contentFolderId,
      soundId: audioAssetUrl,
      volume: 0.8,
      looped: false,
    }));

    assets.push(buildAssetRef({
      name: 'AI_Audio',
      assetType: 'audio',
      soundId: audioAssetUrl,
      storageUrl: context.audioStorageUrl,
      robloxAssetId: context.audioRobloxAssetId,
    }));
  }

  return {
    ...manifest,
    scene: [...manifest.scene, ...extraSceneNodes],
    assets: assets.length > 0 ? assets : undefined,
    metadata: {
      ...manifest.metadata,
      assetEnrichment: {
        meshIncluded: !!(context.meshUrl || context.meshRobloxAssetId),
        textureIncluded: !!(context.textureUrl || context.textureRobloxAssetId),
        audioIncluded: !!(context.audioUrl || context.audioRobloxAssetId),
        pbrMaps: !!(context.normalMapUrl || context.roughnessMapUrl || context.metalnessMapUrl),
      },
    },
  };
}

/**
 * Grant "Open Use" permission on an asset (anyone can use it) via the
 * asset-permissions-api. Required because Open Cloud Assets POST creates
 * assets as Restricted by default for newly-rolled-out accounts, and the
 * `creationContext.assetPrivacy: openUse` writeOnly field is rejected for
 * Decal asset type (400 INVALID_ARGUMENT).
 *
 * Endpoint: PATCH https://apis.roblox.com/asset-permissions-api/v1/assets/permissions
 * Auth: API key only (NOT bearer / OAuth) with scope `asset-permissions:write`.
 * The API key owner must have manage rights on the asset (i.e. be the creator,
 * or member of the owning group with sufficient role).
 * Schema: Roblox/creator-docs reference/cloud/asset-permissions-api/v1.json.
 */
export async function grantAssetOpenUse(args: {
  apiKey: string;
  assetId: number;
}): Promise<boolean> {
  const url = 'https://apis.roblox.com/asset-permissions-api/v1/assets/permissions';
  const body = {
    subjectType: 'All',
    subjectId: null,
    action: 'Use',
    requests: [{ assetId: args.assetId }],
  };
  try {
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'x-api-key': args.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    if (!response.ok) {
      console.error(`[grantAssetOpenUse] ${response.status} for asset ${args.assetId}: ${text}`);
      return false;
    }
    const parsed = (() => { try { return JSON.parse(text) as { successAssetIds?: number[]; errors?: { assetId: number; code: string }[] }; } catch { return null; } })();
    const succeeded = parsed?.successAssetIds?.includes(args.assetId);
    if (!succeeded) {
      console.warn(`[grantAssetOpenUse] asset ${args.assetId} not in successAssetIds; body=${text.slice(0, 300)}`);
      return false;
    }
    console.log(`[grantAssetOpenUse] asset ${args.assetId} switched to Open Use`);
    return true;
  } catch (err) {
    console.error(`[grantAssetOpenUse] threw for asset ${args.assetId}:`, err);
    return false;
  }
}

export async function uploadAssetToRoblox(args: {
  apiKey?: string;
  bearerToken?: string;
  creatorId: string;
  creatorType?: 'User' | 'Group';
  assetType: 'Decal' | 'Image' | 'Audio' | 'Model' | 'Shirt' | 'Pants' | 'Animation';
  name: string;
  description?: string;
  fileContent: Buffer;
  contentType: string;
  // Session 327: Open Cloud writeOnly field in creationContext. Newly-created
  // Image/Mesh assets default to "restricted" on rolled-out accounts, which
  // makes them invisible to other experiences/players. Pass 'openUse' when
  // the asset must be readable by everyone. NOTE: not valid for Decal type
  // (Roblox returns 400); for Decal use grantAssetOpenUse() after upload.
  // Schema: Roblox/creator-docs reference/cloud/assets/v1.json → CreationContext.assetPrivacy.
  assetPrivacy?: 'default' | 'restricted' | 'openUse';
}): Promise<{ assetId: number; operationId?: string } | null> {
  const baseUrl = 'https://apis.roblox.com/assets/v1/assets';
  const creatorType = args.creatorType ?? 'User';
  const creationContext: Record<string, unknown> = {
    creator: {
      [`${creatorType.toLowerCase()}Id`]: args.creatorId,
    },
  };
  if (args.assetPrivacy) {
    creationContext.assetPrivacy = args.assetPrivacy;
  }
  const metadata = JSON.stringify({
    assetType: args.assetType,
    displayName: args.name.slice(0, 50),
    description: (args.description ?? '').slice(0, 1000),
    creationContext,
  });

  const boundary = `----RobloxAssetUpload${Date.now()}`;
  const bodyParts = [
    `--${boundary}\r\n`,
    'Content-Disposition: form-data; name="request"\r\n',
    'Content-Type: application/json\r\n\r\n',
    metadata,
    `\r\n--${boundary}\r\n`,
    `Content-Disposition: form-data; name="fileContent"; filename="${args.name}"\r\n`,
    `Content-Type: ${args.contentType}\r\n\r\n`,
  ];
  const prefix = Buffer.from(bodyParts.join(''));
  const suffix = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([prefix, args.fileContent, suffix]);

  const authHeaders: Record<string, string> = args.bearerToken
    ? { Authorization: `Bearer ${args.bearerToken}` }
    : args.apiKey
      ? { 'x-api-key': args.apiKey }
      : {};

  const authMode = args.bearerToken ? 'bearer' : 'api-key';
  console.log(`[uploadAssetToRoblox] Using ${authMode} auth, assetType=${args.assetType}, creatorId=${args.creatorId}, tokenPrefix=${args.bearerToken ? args.bearerToken.slice(0, 12) + '...' : 'N/A'}`);

  try {
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        ...authHeaders,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });
    if (!response.ok) {
      const errText = await response.text();
      console.error(`[uploadAssetToRoblox] ${response.status}: ${errText}`);
      return null;
    }
    const result = await response.json() as Record<string, unknown>;
    console.log(`[uploadAssetToRoblox] Success:`, JSON.stringify(result).slice(0, 300));
    const parseNumeric = (value: unknown): number | undefined => {
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
      if (typeof value === 'string' && /^\d+$/.test(value)) return parseInt(value, 10);
      return undefined;
    };
    const extractIdFromPath = (value: unknown, marker: string): number | undefined => {
      if (typeof value !== 'string') return undefined;
      const match = value.match(new RegExp(`${marker}\\/(\\d+)`));
      if (!match) return undefined;
      return parseInt(match[1], 10);
    };
    const assetId = parseNumeric(result.assetId)
      ?? extractIdFromPath(result.path, 'assets')
      ?? 0;
    const operationId = typeof result.operationId === 'string'
      ? result.operationId
      : (typeof result.path === 'string'
        ? (() => {
          const match = result.path.match(/operations\/([^/]+)$/);
          return match ? match[1] : undefined;
        })()
        : undefined);
    return {
      assetId,
      operationId,
    };
  } catch (err) {
    console.error('[uploadAssetToRoblox] Upload failed:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Game Pass & Developer Product creation via Roblox Open Cloud API
// Docs: https://create.roblox.com/docs/cloud/features/game-passes
// ---------------------------------------------------------------------------

export async function createRobloxGamePass(params: {
  bearerToken: string;
  universeId: string;
  name: string;
  description?: string;
  price?: number;
}): Promise<{ gamePassId: number } | null> {
  const url = `https://apis.roblox.com/game-passes/v1/universes/${params.universeId}/game-passes`;

  const form = new FormData();
  form.append('name', params.name.slice(0, 50));
  if (params.description) form.append('description', params.description.slice(0, 1000));
  form.append('isForSale', 'true');
  if (params.price && params.price > 0) form.append('price', params.price.toString());

  logger.info(`[createRobloxGamePass] Creating "${params.name}" for universe ${params.universeId}`);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${params.bearerToken}` },
      body: form,
    });

    if (!response.ok) {
      const errText = await response.text();
      logger.error(`[createRobloxGamePass] ${response.status}: ${errText}`);
      return null;
    }

    const result = await response.json() as Record<string, unknown>;
    logger.info(`[createRobloxGamePass] Response: ${JSON.stringify(result).slice(0, 500)}`);

    const id = typeof result.gamePassId === 'number' ? result.gamePassId
      : typeof result.id === 'number' ? result.id
      : (typeof result.gamePassId === 'string' ? parseInt(result.gamePassId, 10) : 0);

    if (!id) {
      logger.warn(`[createRobloxGamePass] Could not extract gamePassId from response`);
      return null;
    }

    logger.info(`[createRobloxGamePass] Created: "${params.name}" → id=${id}`);
    return { gamePassId: id };
  } catch (err) {
    logger.error('[createRobloxGamePass] Failed:', err);
    return null;
  }
}

export async function createRobloxDevProduct(params: {
  bearerToken: string;
  universeId: string;
  name: string;
  description?: string;
  price?: number;
}): Promise<{ productId: number } | null> {
  const url = `https://apis.roblox.com/developer-products/v2/universes/${params.universeId}/developer-products`;

  const form = new FormData();
  form.append('name', params.name.slice(0, 50));
  if (params.description) form.append('description', params.description.slice(0, 1000));
  form.append('isForSale', 'true');
  if (params.price && params.price > 0) form.append('price', params.price.toString());

  logger.info(`[createRobloxDevProduct] Creating "${params.name}" for universe ${params.universeId}`);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${params.bearerToken}` },
      body: form,
    });

    if (!response.ok) {
      const errText = await response.text();
      logger.error(`[createRobloxDevProduct] ${response.status}: ${errText}`);
      return null;
    }

    const result = await response.json() as Record<string, unknown>;
    logger.info(`[createRobloxDevProduct] Response: ${JSON.stringify(result).slice(0, 500)}`);

    const id = typeof result.productId === 'number' ? result.productId
      : typeof result.id === 'number' ? result.id
      : (typeof result.productId === 'string' ? parseInt(result.productId as string, 10) : 0);

    if (!id) {
      logger.warn(`[createRobloxDevProduct] Could not extract productId from response`);
      return null;
    }

    logger.info(`[createRobloxDevProduct] Created: "${params.name}" → id=${id}`);
    return { productId: id };
  } catch (err) {
    logger.error('[createRobloxDevProduct] Failed:', err);
    return null;
  }
}

export async function pollRobloxOperation(
  apiKeyOrToken: string,
  operationId: string,
  authMode: 'api-key' | 'bearer' = 'api-key',
  maxAttempts = 20,
  delayMs = 3000,
): Promise<number | null> {
  const url = `https://apis.roblox.com/assets/v1/operations/${encodeURIComponent(operationId)}`;
  const authHeaders: Record<string, string> = authMode === 'bearer'
    ? { Authorization: `Bearer ${apiKeyOrToken}` }
    : { 'x-api-key': apiKeyOrToken };
  const parseNumeric = (value: unknown): number | undefined => {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
    if (typeof value === 'string' && /^\d+$/.test(value)) return parseInt(value, 10);
    return undefined;
  };
  const extractIdFromPath = (value: unknown, marker: string): number | undefined => {
    if (typeof value !== 'string') return undefined;
    const match = value.match(new RegExp(`${marker}\\/(\\d+)`));
    if (!match) return undefined;
    return parseInt(match[1], 10);
  };
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    try {
      const response = await fetch(url, {
        headers: authHeaders,
      });
      if (!response.ok) {
        console.error(`[pollRobloxOperation] ${response.status}: ${await response.text()}`);
        return null;
      }
      const result = await response.json() as Record<string, unknown>;
      if (result.done === true) {
        const inner = result.response as Record<string, unknown> | undefined;
        const assetId = (inner ? (parseNumeric(inner.assetId) ?? extractIdFromPath(inner.path, 'assets')) : undefined)
          ?? extractIdFromPath(result.path, 'assets')
          ?? null;
        return assetId;
      }
    } catch (err) {
      console.error('[pollRobloxOperation] Poll error:', err);
      return null;
    }
  }
  console.error(`[pollRobloxOperation] Timed out after ${maxAttempts * delayMs / 1000}s`);
  return null;
}

/**
 * Same contract as pollRobloxOperation but emits structured Firebase logs for
 * every attempt (response status, raw body excerpt, parsed assetId, errors).
 * Used by prepareSkinnedMeshFromSource to diagnose why FBX uploads fail to
 * resolve to an assetId — the silent `console.error` path of the original
 * function does not surface in Cloud Logging.
 */
async function pollRobloxOperationVerbose(
  apiKeyOrToken: string,
  operationId: string,
  authMode: 'api-key' | 'bearer' = 'api-key',
  maxAttempts = 20,
  delayMs = 3000,
): Promise<number | null> {
  const url = `https://apis.roblox.com/assets/v1/operations/${encodeURIComponent(operationId)}`;
  const authHeaders: Record<string, string> = authMode === 'bearer'
    ? { Authorization: `Bearer ${apiKeyOrToken}` }
    : { 'x-api-key': apiKeyOrToken };
  const parseNumeric = (value: unknown): number | undefined => {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
    if (typeof value === 'string' && /^\d+$/.test(value)) return parseInt(value, 10);
    return undefined;
  };
  const extractIdFromPath = (value: unknown, marker: string): number | undefined => {
    if (typeof value !== 'string') return undefined;
    const match = value.match(new RegExp(`${marker}\\/(\\d+)`));
    if (!match) return undefined;
    return parseInt(match[1], 10);
  };
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    try {
      const response = await fetch(url, { headers: authHeaders });
      if (!response.ok) {
        const errBody = await response.text();
        logger.warn('[pollRobloxOperationVerbose] non-OK response', {
          attempt, status: response.status, body: errBody.slice(0, 400), operationId,
        });
        return null;
      }
      const result = await response.json() as Record<string, unknown>;
      logger.info('[pollRobloxOperationVerbose] attempt result', {
        attempt, operationId,
        done: result.done,
        hasResponse: result.response != null,
        hasError: result.error != null,
        body: JSON.stringify(result).slice(0, 500),
      });
      if (result.done === true) {
        const inner = result.response as Record<string, unknown> | undefined;
        const assetId = (inner ? (parseNumeric(inner.assetId) ?? extractIdFromPath(inner.path, 'assets')) : undefined)
          ?? extractIdFromPath(result.path, 'assets')
          ?? null;
        if (!assetId) {
          logger.warn('[pollRobloxOperationVerbose] done=true but no assetId found', {
            operationId, response: JSON.stringify(result).slice(0, 600),
          });
        }
        return assetId;
      }
    } catch (err) {
      logger.warn('[pollRobloxOperationVerbose] poll exception', {
        attempt, operationId,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }
  logger.warn('[pollRobloxOperationVerbose] timed out', {
    operationId, totalSeconds: maxAttempts * delayMs / 1000,
  });
  return null;
}

export interface PrepareSkinnedMeshArgs {
  /** GLB or FBX source URL (typically the Meshy/Hunyuan3D output). */
  sourceUrl: string;
  /** Display title for the asset (sanitized for Roblox). */
  title: string;
  /** Roblox creator ID (user or group). */
  creatorId: string;
  creatorType?: 'User' | 'Group';
  /** Either OAuth bearer token (preferred for user uploads) or Open Cloud API key. */
  bearerToken?: string;
  apiKey?: string;
}

export interface PrepareSkinnedMeshResult {
  skinnedMeshAssetId: number;
  skinQuality: 'good' | 'degraded' | 'broken' | 'unknown';
  weightMethod?: 'auto' | 'envelope' | 'name_only';
  unweightedBones?: string[];
  vertexCount?: number;
  bones: string[];
  uploadDurationMs: number;
}

/**
 * Pipeline: source GLB → Blender auto_rig_r15 (FBX with R15 bones + skinning weights)
 * → Open Cloud Assets API (Model asset, multipart FBX upload) → poll for assetId.
 *
 * The returned `skinnedMeshAssetId` is the Roblox asset ID of a skinned MeshPart
 * with R15-named Bone children, ready to be referenced via `MeshId="rbxassetid://X"`
 * inside an `export_r15_character.luau` model. Catalog R15 animations (Idle/Walk/Run)
 * play directly because the bone names match the standard R15 joint set.
 *
 * Returns `null` when Blender skinning is degraded beyond usability or upload fails;
 * callers should fall back to `follow_root_visual` / `static_visual_shell` paths.
 */
export async function prepareSkinnedMeshFromSource(
  args: PrepareSkinnedMeshArgs,
): Promise<PrepareSkinnedMeshResult | null> {
  const startedAt = Date.now();

  // Step 1: ask the worker to auto-rig the source mesh and emit an FBX with
  // skinning weights. The worker invokes Blender headless via auto_rig_r15.py
  // with `outputFormat: 'fbx'` so the Roblox Open Cloud importer can ingest it
  // as a skinned MeshPart (FBX path embeds Skin deformer + bone weights).
  let rigResult: WorkerModelProcessResult;
  try {
    rigResult = await autoRigCharacterAsset({
      sourceUrl: args.sourceUrl,
      title: args.title,
      metadata: { outputFormat: 'fbx' },
    });
  } catch (err) {
    logger.warn('[prepareSkinnedMeshFromSource] auto-rig failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  const stats = (rigResult.metadata?.stats ?? {}) as Record<string, unknown>;
  const skinQuality = (stats.skinQuality as PrepareSkinnedMeshResult['skinQuality']) ?? 'unknown';
  const weightMethod = (stats.weightMethod as PrepareSkinnedMeshResult['weightMethod']) ?? undefined;
  const unweightedBones = Array.isArray(stats.unweightedBones)
    ? (stats.unweightedBones as string[])
    : undefined;
  const vertexCount = typeof stats.vertexCount === 'number' ? stats.vertexCount : undefined;
  const bones = Array.isArray(stats.bones) ? (stats.bones as string[]) : [];

  if (skinQuality === 'broken') {
    logger.warn('[prepareSkinnedMeshFromSource] skinning broken, aborting upload', {
      unweightedBones, weightMethod,
    });
    return null;
  }

  if (rigResult.outputExtension !== 'fbx') {
    logger.warn('[prepareSkinnedMeshFromSource] worker did not return FBX', {
      gotExtension: rigResult.outputExtension,
    });
    return null;
  }

  // Step 2: upload the rigged FBX to Roblox Open Cloud as a Model asset.
  // The Open Cloud importer recognizes the bone hierarchy and produces a
  // skinned MeshPart server-side, addressable via rbxassetid://<assetId>.
  const fbxBytes = Buffer.from(rigResult.outputBase64, 'base64');
  const upload = await uploadAssetToRoblox({
    bearerToken: args.bearerToken,
    apiKey: args.apiKey,
    creatorId: args.creatorId,
    creatorType: args.creatorType ?? 'User',
    assetType: 'Model',
    name: (args.title || 'SkinnedCharacter').slice(0, 50),
    description: 'AI-generated R15 skinned character mesh',
    fileContent: fbxBytes,
    contentType: 'model/fbx',
  });

  if (!upload) {
    logger.warn('[prepareSkinnedMeshFromSource] Open Cloud upload returned null');
    return null;
  }

  logger.info('[prepareSkinnedMeshFromSource] upload returned', {
    assetId: upload.assetId,
    operationId: upload.operationId,
    fbxByteLength: fbxBytes.length,
  });

  let finalAssetId = upload.assetId;
  if (!finalAssetId && upload.operationId) {
    const authToken = args.bearerToken ?? args.apiKey;
    if (authToken) {
      logger.info('[prepareSkinnedMeshFromSource] polling operation', {
        operationId: upload.operationId,
        authMode: args.bearerToken ? 'bearer' : 'api-key',
      });
      const polled = await pollRobloxOperationVerbose(
        authToken,
        upload.operationId,
        args.bearerToken ? 'bearer' : 'api-key',
        40, // longer poll: skinned mesh imports can take 60-180s
        3000,
      );
      if (polled) finalAssetId = polled;
    } else {
      logger.warn('[prepareSkinnedMeshFromSource] no auth token available for polling');
    }
  }

  if (!finalAssetId) {
    logger.warn('[prepareSkinnedMeshFromSource] no asset id after upload+poll', {
      uploadAssetId: upload.assetId,
      operationId: upload.operationId,
    });
    return null;
  }

  return {
    skinnedMeshAssetId: finalAssetId,
    skinQuality,
    weightMethod,
    unweightedBones,
    vertexCount,
    bones,
    uploadDurationMs: Date.now() - startedAt,
  };
}

/**
 * After uploading a Decal via Open Cloud, Roblox creates two assets:
 * - Decal (wrapper) with the returned ID
 * - Image (actual texture) with a separate ID (often Decal ID + 1)
 *
 * ShirtTemplate / PantsTemplate need the Image ID, not the Decal ID.
 * This function tries to resolve it via the asset delivery endpoint.
 */
export async function resolveDecalImageId(
  decalId: number,
  bearerToken?: string,
): Promise<number> {
  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Method 1: Asset delivery API
      const url = `https://assetdelivery.roblox.com/v1/asset/?id=${decalId}`;
      const headers: Record<string, string> = {};
      if (bearerToken) {
        headers['Authorization'] = `Bearer ${bearerToken}`;
      }
      const response = await fetch(url, { redirect: 'follow', headers });
      if (response.ok) {
        const text = await response.text();
        // Match both rbxassetid:// and asset/?id= patterns
        const match = text.match(/(?:rbxassetid:\/\/|asset\/?\?id=)(\d+)/);
        if (match && match[1]) {
          const imageId = parseInt(match[1], 10);
          console.log(`[resolveDecalImageId] Decal ${decalId} → Image ${imageId} (attempt ${attempt})`);
          return imageId;
        }
      }

      // Method 2: Try the Roblox asset API for backingAssetId
      try {
        const apiResponse = await fetch(`https://apis.roblox.com/assets/v1/assets/${decalId}`, { headers });
        if (apiResponse.ok) {
          const apiData = await apiResponse.json() as { backingAssetId?: number; assetTypeId?: number };
          if (apiData.backingAssetId) {
            console.log(`[resolveDecalImageId] Decal ${decalId} → backingAssetId ${apiData.backingAssetId} via asset API`);
            return apiData.backingAssetId;
          }
        }
      } catch (apiErr) {
        console.warn('[resolveDecalImageId] Asset API lookup failed:', apiErr);
      }

      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    } catch (err) {
      console.warn(`[resolveDecalImageId] Attempt ${attempt} fetch failed:`, err);
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }
  }
  // Fallback: historically Image ID = Decal ID + 1 (unreliable but better than crashing)
  const fallback = decalId + 1;
  console.warn(`[resolveDecalImageId] Using fallback: Decal ${decalId} → Image ${fallback}`);
  return fallback;
}

/**
 * Upload a Classic Shirt or Pants to a Roblox Group using the user-auth API.
 * This is the ONLY way to programmatically create real Classic Clothing assets
 * that work with Shirt.ShirtTemplate / Pants.PantsTemplate.
 *
 * Requires: .ROBLOSECURITY cookie from a Premium account with Robux.
 * Costs 10 Robux per upload.
 */
// Session 001 (Track 1 + Premium activation, 2026-05-19): fetch authenticated user
// ID from the cookie via Roblox's /v1/users/authenticated endpoint. Used when we
// want to upload as the cookie owner (personal Premium balance) instead of via
// a group. Eliminates the need to fund a community with Robux.
async function fetchAuthenticatedRobloxUserId(roblosecurity: string): Promise<number | null> {
  try {
    const resp = await fetch('https://users.roblox.com/v1/users/authenticated', {
      headers: { Cookie: `.ROBLOSECURITY=${roblosecurity}` },
    });
    if (!resp.ok) {
      console.warn(`[fetchAuthenticatedRobloxUserId] HTTP ${resp.status}`);
      return null;
    }
    const json = await resp.json() as Record<string, unknown>;
    const id = typeof json.id === 'number' ? json.id : null;
    if (!id) {
      console.warn('[fetchAuthenticatedRobloxUserId] no id in response', JSON.stringify(json).slice(0, 200));
    }
    return id;
  } catch (err) {
    console.warn('[fetchAuthenticatedRobloxUserId] failed:', err);
    return null;
  }
}

export async function uploadClassicClothing(args: {
  name: string;
  description?: string;
  imageBuffer: Buffer;
  assetType: 'TShirt' | 'Shirt' | 'Pants';
  /** Optional. If provided AND non-empty, upload as the group (Robux deducted
   *  from group funds). If empty/missing, upload as the authenticated user
   *  (Robux deducted from the cookie owner's personal balance). */
  groupId?: string;
  roblosecurity: string;
}): Promise<{ assetId: number } | null> {
  const { name, description, imageBuffer, assetType, groupId, roblosecurity } = args;
  const useGroup = !!(groupId && groupId.trim());

  // Step 1: Get CSRF token
  // 2026-05-19: Roblox deprecated auth.roblox.com/ as CSRF source (returns 404 now).
  // Use accountsettings.roblox.com/v1/email — verified to return 403 + x-csrf-token
  // header. The endpoint has no relation to upload; we just need any protected POST
  // that responds with the token.
  let csrfToken = '';
  try {
    const csrfResp = await fetch('https://accountsettings.roblox.com/v1/email', {
      method: 'POST',
      headers: { Cookie: `.ROBLOSECURITY=${roblosecurity}` },
    });
    csrfToken = csrfResp.headers.get('x-csrf-token') ?? '';
    if (!csrfToken) {
      console.error('[uploadClassicClothing] Failed to get CSRF token');
      return null;
    }
    console.log('[uploadClassicClothing] CSRF token obtained');
  } catch (err) {
    console.error('[uploadClassicClothing] CSRF request failed:', err);
    return null;
  }

  // Step 2: Resolve creator — group (from env) OR authenticated user (from cookie).
  // Session 001 (2026-05-19): when ROBLOX_GROUP_ID is unset, derive userId from
  // the cookie via /v1/users/authenticated and upload under the user's personal
  // Premium balance. Removes the "fund the community with Robux" friction.
  let creator: { groupId: string } | { userId: number };
  if (useGroup) {
    creator = { groupId: groupId! };
    console.log(`[uploadClassicClothing] Uploading as GROUP ${groupId}`);
  } else {
    const userId = await fetchAuthenticatedRobloxUserId(roblosecurity);
    if (!userId) {
      console.error('[uploadClassicClothing] No groupId and could not fetch authenticated user id — cookie invalid?');
      return null;
    }
    creator = { userId };
    console.log(`[uploadClassicClothing] Uploading as USER ${userId} (personal Premium balance)`);
  }

  const requestJson = JSON.stringify({
    displayName: name.slice(0, 50),
    description: (description ?? 'AI-generated clothing').slice(0, 1000),
    assetType,
    creationContext: {
      creator,
      expectedPrice: 10,
    },
  });

  const boundary = `----ClothingUpload${Date.now()}`;
  const bodyParts = [
    `--${boundary}\r\n`,
    'Content-Disposition: form-data; name="request"\r\n',
    'Content-Type: application/json\r\n\r\n',
    requestJson,
    `\r\n--${boundary}\r\n`,
    `Content-Disposition: form-data; name="fileContent"; filename="clothing.png"\r\n`,
    'Content-Type: image/png\r\n\r\n',
  ];
  const prefix = Buffer.from(bodyParts.join(''));
  const suffix = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([prefix, imageBuffer, suffix]);

  try {
    const uploadResp = await fetch('https://apis.roblox.com/assets/user-auth/v1/assets', {
      method: 'POST',
      headers: {
        Cookie: `.ROBLOSECURITY=${roblosecurity}`,
        'X-CSRF-Token': csrfToken,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });

    if (!uploadResp.ok) {
      const errText = await uploadResp.text();
      console.error(`[uploadClassicClothing] Upload failed ${uploadResp.status}: ${errText.slice(0, 300)}`);
      return null;
    }

    const uploadResult = await uploadResp.json() as Record<string, unknown>;
    console.log('[uploadClassicClothing] Upload response:', JSON.stringify(uploadResult).slice(0, 300));

    const operationId = typeof uploadResult.operationId === 'string'
      ? uploadResult.operationId
      : undefined;

    if (!operationId) {
      console.error('[uploadClassicClothing] No operationId in response');
      return null;
    }

    // Step 3: Poll for asset ID
    const maxAttempts = 15;
    const delayMs = 4000;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
      try {
        const pollResp = await fetch(
          `https://apis.roblox.com/assets/user-auth/v1/operations/${encodeURIComponent(operationId)}`,
          {
            headers: {
              Cookie: `.ROBLOSECURITY=${roblosecurity}`,
              'X-CSRF-Token': csrfToken,
            },
          },
        );
        if (!pollResp.ok) {
          console.warn(`[uploadClassicClothing] Poll ${attempt} failed: ${pollResp.status}`);
          continue;
        }
        const pollResult = await pollResp.json() as Record<string, unknown>;
        const text = JSON.stringify(pollResult);

        const assetIdMatch = text.match(/"assetId"\s*:\s*"?(\d+)"?/);
        if (assetIdMatch && assetIdMatch[1]) {
          const assetId = parseInt(assetIdMatch[1], 10);
          console.log(`[uploadClassicClothing] ${assetType} uploaded! assetId = ${assetId}`);
          return { assetId };
        }
        console.log(`[uploadClassicClothing] Poll ${attempt}: waiting for assetId...`);
      } catch (pollErr) {
        console.warn('[uploadClassicClothing] Poll error:', pollErr);
      }
    }

    console.error('[uploadClassicClothing] Timed out waiting for assetId');
    return null;
  } catch (err) {
    console.error('[uploadClassicClothing] Upload request failed:', err);
    return null;
  }
}

export async function validateRobloxAssetId(args: {
  assetId: number;
  bearerToken?: string;
  apiKey?: string;
}): Promise<boolean> {
  const { assetId, bearerToken, apiKey } = args;
  if (!Number.isFinite(assetId) || assetId <= 0) {
    return false;
  }
  const url = `https://apis.roblox.com/assets/v1/assets/${assetId}`;
  const headers: Record<string, string> = bearerToken
    ? { Authorization: `Bearer ${bearerToken}` }
    : apiKey
      ? { 'x-api-key': apiKey }
      : {};
  if (!headers.Authorization && !headers['x-api-key']) {
    return false;
  }
  try {
    const response = await fetch(url, { method: 'GET', headers });
    if (!response.ok) {
      const body = await response.text();
      console.warn('[validateRobloxAssetId] validation failed', { assetId, status: response.status, body: body.slice(0, 180) });
      return false;
    }
    const json = await response.json() as Record<string, unknown>;
    const returnedId = typeof json.assetId === 'number'
      ? json.assetId
      : typeof json.id === 'number'
        ? json.id
        : typeof json.path === 'string'
          ? (() => {
            const match = json.path.match(/assets\/(\d+)/);
            return match ? parseInt(match[1], 10) : undefined;
          })()
          : undefined;
    return typeof returnedId === 'number' && returnedId === assetId;
  } catch (error) {
    console.warn('[validateRobloxAssetId] request failed', { assetId, error: error instanceof Error ? error.message : String(error) });
    return false;
  }
}

export async function validateRobloxAssetPublic(args: {
  assetId: number;
}): Promise<boolean> {
  const { assetId } = args;
  if (!Number.isFinite(assetId) || assetId <= 0) {
    return false;
  }
  const url = `https://assetdelivery.roblox.com/v1/asset/?id=${assetId}`;
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(7000),
    });
    // 200 = served directly, 30x = redirect to CDN; both mean readable content.
    return response.ok || (response.status >= 300 && response.status < 400);
  } catch (error) {
    console.warn('[validateRobloxAssetPublic] request failed', {
      assetId,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

async function fetchRobloxAssetBytes(
  url: string,
  headers: Record<string, string>,
  label: string,
): Promise<Buffer | null> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers,
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      console.warn('[fetchRobloxAssetBytes] request failed', {
        label,
        status: response.status,
        body: (await response.text()).slice(0, 180),
      });
      return null;
    }
    const contentType = response.headers.get('content-type') ?? '';
    const bytes = Buffer.from(await response.arrayBuffer());
    const maybeJson = contentType.includes('json') || bytes.subarray(0, 1).toString('utf8') === '{';
    if (maybeJson) {
      try {
        const json = JSON.parse(bytes.toString('utf8')) as Record<string, unknown>;
        const locations = Array.isArray(json.locations) ? json.locations as Array<Record<string, unknown>> : [];
        const location = typeof json.location === 'string'
          ? json.location
          : locations.map((item) => item.location).find((value): value is string => typeof value === 'string');
        if (location) {
          return fetchRobloxAssetBytes(location, {}, `${label}:cdn`);
        }
        return null;
      } catch {
        // Fall through and return the raw body; some Roblox asset responses are
        // binary with a generic content-type.
      }
    }
    return bytes;
  } catch (error) {
    console.warn('[fetchRobloxAssetBytes] request threw', {
      label,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function downloadRobloxModelAssetBytes(args: {
  assetId: number;
  bearerToken?: string;
  apiKey?: string;
}): Promise<Buffer | null> {
  const { assetId, bearerToken, apiKey } = args;
  if (!Number.isFinite(assetId) || assetId <= 0) {
    return null;
  }
  const authHeaders: Record<string, string> = bearerToken
    ? { Authorization: `Bearer ${bearerToken}` }
    : apiKey
      ? { 'x-api-key': apiKey }
      : {};
  const candidates: Array<{ url: string; headers: Record<string, string>; label: string }> = [];
  if (authHeaders.Authorization || authHeaders['x-api-key']) {
    candidates.push({
      url: `https://apis.roblox.com/asset-delivery-api/v1/assetId/${assetId}`,
      headers: authHeaders,
      label: 'open-cloud-asset-delivery',
    });
  }
  candidates.push({
    url: `https://assetdelivery.roblox.com/v1/asset/?id=${assetId}`,
    headers: {},
    label: 'public-asset-delivery',
  });

  for (const candidate of candidates) {
    const bytes = await fetchRobloxAssetBytes(candidate.url, candidate.headers, candidate.label);
    if (!bytes || bytes.length === 0) continue;
    if (bytes.length > MAX_EMBEDDED_ROBLOX_MODEL_BYTES) {
      console.warn('[downloadRobloxModelAssetBytes] asset too large for embedded RBXM preview', {
        assetId,
        byteLength: bytes.length,
        maxBytes: MAX_EMBEDDED_ROBLOX_MODEL_BYTES,
      });
      return null;
    }
    return bytes;
  }
  return null;
}

export async function validateRobloxTemplateCompatibility(args: {
  assetId: number;
  templateKind: 'shirt' | 'pants';
  bearerToken?: string;
  apiKey?: string;
}): Promise<boolean> {
  const { assetId, templateKind, bearerToken, apiKey } = args;
  if (!Number.isFinite(assetId) || assetId <= 0) {
    return false;
  }
  const url = `https://apis.roblox.com/assets/v1/assets/${assetId}`;
  const headers: Record<string, string> = bearerToken
    ? { Authorization: `Bearer ${bearerToken}` }
    : apiKey
      ? { 'x-api-key': apiKey }
      : {};
  if (!headers.Authorization && !headers['x-api-key']) {
    return false;
  }
  try {
    const response = await fetch(url, { method: 'GET', headers });
    if (!response.ok) {
      return false;
    }
    const json = await response.json() as Record<string, unknown>;
    const fromObject = (value: unknown): string | undefined => {
      if (!value || typeof value !== 'object') return undefined;
      const obj = value as Record<string, unknown>;
      return typeof obj.name === 'string'
        ? obj.name
        : typeof obj.displayName === 'string'
          ? obj.displayName
          : undefined;
    };
    const typeName = (
      typeof json.assetType === 'string'
        ? json.assetType
        : fromObject(json.assetType)
    ) ?? (
      typeof json.type === 'string'
        ? json.type
        : fromObject(json.type)
    ) ?? '';
    const normalized = typeName.toLowerCase();
    if (!normalized) {
      // If API omits type info, do not block valid public ids.
      return true;
    }
    if (templateKind === 'shirt') {
      return normalized.includes('shirt') || normalized.includes('image') || normalized.includes('decal');
    }
    return normalized.includes('pants') || normalized.includes('image') || normalized.includes('decal');
  } catch {
    return false;
  }
}

async function buildRobloxBinaryBytes(manifest: RobloxBuildManifest): Promise<Buffer | null> {
  const workerUrl = getRobloxWorkerUrl();
  if (workerUrl) {
    const response = await fetchWorkerJson(`${workerUrl.replace(/\/$/, '')}/build-roblox`, {
      method: 'POST',
      headers: buildWorkerHeaders(),
      body: JSON.stringify({ manifest }),
    });
    const outputBase64 = typeof response.outputBase64 === 'string' ? response.outputBase64 : '';
    if (!outputBase64) {
      throw new Error('Worker URL did not return outputBase64');
    }
    return Buffer.from(outputBase64, 'base64');
  }

  const command = getRobloxWorkerCommand();
  if (!command) {
    return null;
  }
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'roblox-worker-'));
  const manifestPath = path.join(tempDir, 'manifest.json');
  const outputPath = path.join(tempDir, manifest.target === 'place' ? 'output.rbxl' : 'output.rbxm');
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  try {
    const extraArgs = splitArgs(getRobloxWorkerArgs());
    await runCommand(command, [...extraArgs, 'build-roblox', manifestPath, outputPath, manifest.target]);
    return await readFile(outputPath);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function buildWorkerHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const token = getRobloxWorkerToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function fetchWorkerJson(url: string, init: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetch(url, init);
  const text = await response.text();
  const json = text ? JSON.parse(text) as Record<string, unknown> : {};
  if (!response.ok) {
    throw new Error(typeof json.error === 'string' ? json.error : `Worker request failed with ${response.status}`);
  }
  return json;
}
