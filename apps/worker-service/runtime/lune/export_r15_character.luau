--[[
  export_r15_character.luau

  Builds a Roblox R15 character Model and serialises it as .rbxm.

  Usage:
    lune run export_r15_character.luau <metadataPath> <outputPath>

  metadataPath — JSON file with at least { "title": "..." }.
                 Optional "meshAssetId" to set MeshId on parts.
  outputPath   — destination .rbxm file path.
]]

local fs = require("@lune/fs")
local process = require("@lune/process")
local roblox = require("@lune/roblox")
local serde = require("@lune/serde")

local _Vector3 = (roblox :: any).Vector3 or Vector3
local _CFrame = (roblox :: any).CFrame or CFrame

local args = process.args
local metadataPath = args[1]
local outputPath = args[2]

assert(metadataPath ~= nil and outputPath ~= nil, "Expected metadataPath and outputPath")

local metadata = serde.decode("json", fs.readFile(metadataPath))
local title = metadata.title or "Character"

-- R15 part definitions: { name, size={x,y,z}, position={x,y,z} }
local R15_PARTS = {
	{ name = "HumanoidRootPart", size = { 2, 2, 1 }, position = { 0, 3.5, 0 }, transparency = 1 },
	{ name = "LowerTorso", size = { 2, 0.4, 1 }, position = { 0, 2.8, 0 } },
	{ name = "UpperTorso", size = { 2, 1.6, 1 }, position = { 0, 3.8, 0 } },
	{ name = "Head", size = { 2, 1, 1 }, position = { 0, 5.1, 0 } },
	{ name = "LeftUpperArm", size = { 1, 1.2, 1 }, position = { -1.5, 4.1, 0 } },
	{ name = "LeftLowerArm", size = { 1, 1.2, 1 }, position = { -1.5, 2.9, 0 } },
	{ name = "LeftHand", size = { 1, 0.6, 1 }, position = { -1.5, 2.0, 0 } },
	{ name = "RightUpperArm", size = { 1, 1.2, 1 }, position = { 1.5, 4.1, 0 } },
	{ name = "RightLowerArm", size = { 1, 1.2, 1 }, position = { 1.5, 2.9, 0 } },
	{ name = "RightHand", size = { 1, 0.6, 1 }, position = { 1.5, 2.0, 0 } },
	{ name = "LeftUpperLeg", size = { 1, 1.2, 1 }, position = { -0.5, 2.1, 0 } },
	{ name = "LeftLowerLeg", size = { 1, 1.2, 1 }, position = { -0.5, 0.9, 0 } },
	{ name = "LeftFoot", size = { 1, 0.4, 1 }, position = { -0.5, 0.0, 0 } },
	{ name = "RightUpperLeg", size = { 1, 1.2, 1 }, position = { 0.5, 2.1, 0 } },
	{ name = "RightLowerLeg", size = { 1, 1.2, 1 }, position = { 0.5, 0.9, 0 } },
	{ name = "RightFoot", size = { 1, 0.4, 1 }, position = { 0.5, 0.0, 0 } },
}

-- Motor6D joints: { name, part0, part1, c0={x,y,z}, c1={x,y,z} }
local R15_JOINTS = {
	{ name = "Root", part0 = "HumanoidRootPart", part1 = "LowerTorso", c0 = { 0, -0.7, 0 }, c1 = { 0, 0, 0 } },
	{ name = "Waist", part0 = "LowerTorso", part1 = "UpperTorso", c0 = { 0, 0.2, 0 }, c1 = { 0, -0.8, 0 } },
	{ name = "Neck", part0 = "UpperTorso", part1 = "Head", c0 = { 0, 0.8, 0 }, c1 = { 0, -0.5, 0 } },
	{ name = "LeftShoulder", part0 = "UpperTorso", part1 = "LeftUpperArm", c0 = { -1, 0.5, 0 }, c1 = { 0.5, 0.5, 0 } },
	{ name = "LeftElbow", part0 = "LeftUpperArm", part1 = "LeftLowerArm", c0 = { 0, -0.6, 0 }, c1 = { 0, 0.6, 0 } },
	{ name = "LeftWrist", part0 = "LeftLowerArm", part1 = "LeftHand", c0 = { 0, -0.6, 0 }, c1 = { 0, 0.3, 0 } },
	{ name = "RightShoulder", part0 = "UpperTorso", part1 = "RightUpperArm", c0 = { 1, 0.5, 0 }, c1 = { -0.5, 0.5, 0 } },
	{ name = "RightElbow", part0 = "RightUpperArm", part1 = "RightLowerArm", c0 = { 0, -0.6, 0 }, c1 = { 0, 0.6, 0 } },
	{ name = "RightWrist", part0 = "RightLowerArm", part1 = "RightHand", c0 = { 0, -0.6, 0 }, c1 = { 0, 0.3, 0 } },
	{ name = "LeftHip", part0 = "LowerTorso", part1 = "LeftUpperLeg", c0 = { -0.5, -0.2, 0 }, c1 = { 0, 0.6, 0 } },
	{ name = "LeftKnee", part0 = "LeftUpperLeg", part1 = "LeftLowerLeg", c0 = { 0, -0.6, 0 }, c1 = { 0, 0.6, 0 } },
	{ name = "LeftAnkle", part0 = "LeftLowerLeg", part1 = "LeftFoot", c0 = { 0, -0.6, 0 }, c1 = { 0, 0.2, 0 } },
	{ name = "RightHip", part0 = "LowerTorso", part1 = "RightUpperLeg", c0 = { 0.5, -0.2, 0 }, c1 = { 0, 0.6, 0 } },
	{ name = "RightKnee", part0 = "RightUpperLeg", part1 = "RightLowerLeg", c0 = { 0, -0.6, 0 }, c1 = { 0, 0.6, 0 } },
	{ name = "RightAnkle", part0 = "RightLowerLeg", part1 = "RightFoot", c0 = { 0, -0.6, 0 }, c1 = { 0, 0.2, 0 } },
}

-- ── Build the character Model ────────────────────────────────────────

local model = roblox.Instance.new("Model")
model.Name = title

local humanoid = roblox.Instance.new("Humanoid")
humanoid.Name = "Humanoid"
pcall(function()
	(humanoid :: any).RigType = (Enum :: any).HumanoidRigType.R15
end)
humanoid.Parent = model

-- Track the HumanoidRootPart reference for PrimaryPart assignment
local partsByName: { [string]: any } = {}

-- ── Skinned R15 mesh path ────────────────────────────────────────────
-- When the upstream pipeline (prepareSkinnedMeshFromSource) succeeds, the
-- caller passes `skinnedMeshAssetId` — a Roblox asset ID for an FBX-imported
-- skinned MeshPart with R15-named Bone children. We construct a thin Model
-- containing that single MeshPart + an invisible HumanoidRootPart driver,
-- so catalog R15 animations (via the standard Animate script) deform the
-- mesh's bones directly. No 16-part placeholder rig is needed.
local skinnedAssetId = metadata.skinnedMeshAssetId
local useSkinnedPath = skinnedAssetId ~= nil and skinnedAssetId ~= ""

if useSkinnedPath then
	local hrp = roblox.Instance.new("Part")
	hrp.Name = "HumanoidRootPart"
	hrp.Size = _Vector3.new(2, 2, 1)
	hrp.Transparency = 1
	hrp.CanCollide = false
	hrp.Anchored = false
	pcall(function()
		hrp.CFrame = _CFrame.new(0, 3, 0)
	end)
	hrp.Parent = model
	partsByName["HumanoidRootPart"] = hrp

	local body = roblox.Instance.new("MeshPart")
	body.Name = "Body"
	pcall(function()
		body.MeshId = "rbxassetid://" .. tostring(skinnedAssetId)
	end)
	-- HasSkinnedMesh is read-only at runtime but is honoured when the mesh
	-- asset itself was imported with skinning data; setting it here ensures
	-- the .rbxm round-trip preserves the flag for Studio inspection.
	pcall(function()
		(body :: any).HasSkinnedMesh = true
	end)
	body.Size = _Vector3.new(2, 5, 2)
	body.Anchored = false
	body.CanCollide = false
	pcall(function()
		(body :: any).Massless = true
	end)
	pcall(function()
		body.CFrame = _CFrame.new(0, 3, 0)
	end)
	body.Parent = model
	partsByName["Body"] = body

	-- TextureID for skinned body. Previously skipped on the assumption that the
	-- FBX-imported PBR maps would render the body. In practice those maps reference
	-- the original Meshy CDN URL which Roblox CDN cannot fetch, so the body comes
	-- through grey. Roblox auto-resolves a Decal-wrapper assetId to its inner Image
	-- when the URL goes into MeshPart.TextureID (same trick the weapon path uses).
	if metadata.textureAssetId then
		pcall(function()
			(body :: any).TextureID = "rbxassetid://" .. tostring(metadata.textureAssetId)
		end)
		print("Skinned Body TextureID applied: rbxassetid://" .. tostring(metadata.textureAssetId))
	end

	-- Edit-mode placeholder. The skinned MeshPart only resolves at place load time;
	-- in Studio Edit without Play, asset resolution doesn't happen and the NPC is
	-- invisible at the spawn. A translucent block welded to the HRP gives a clear
	-- silhouette during editing. It stays in gameplay (Transparency=0.4, no collide)
	-- but is harmless and largely hidden by the resolved skinned Body.
	local placeholder = roblox.Instance.new("Part")
	placeholder.Name = "BodyPlaceholder"
	placeholder.Size = _Vector3.new(2, 5, 1)
	placeholder.Transparency = 0.4
	placeholder.CanCollide = false
	placeholder.Anchored = false
	pcall(function()
		(placeholder :: any).Massless = true
	end)
	pcall(function()
		local _Color3 = (roblox :: any).Color3 or Color3
		placeholder.Color = _Color3.new(0.65, 0.65, 0.7)
	end)
	pcall(function()
		placeholder.CFrame = _CFrame.new(0, 3, 0)
	end)
	placeholder.Parent = model

	local placeholderWeld = roblox.Instance.new("Motor6D")
	placeholderWeld.Name = "BodyPlaceholderWeld"
	pcall(function() placeholderWeld.Part0 = hrp end)
	pcall(function() placeholderWeld.Part1 = placeholder end)
	placeholderWeld.Parent = hrp

	local rootMotor = roblox.Instance.new("Motor6D")
	rootMotor.Name = "Root"
	pcall(function() rootMotor.Part0 = hrp end)
	pcall(function() rootMotor.Part1 = body end)
	pcall(function() rootMotor.C0 = _CFrame.new(0, 0, 0) end)
	pcall(function() rootMotor.C1 = _CFrame.new(0, 0, 0) end)
	rootMotor.Parent = hrp

	-- Animator instance lets the standard R15 Animate script play catalog
	-- animations through Humanoid:LoadAnimation().
	local animator = roblox.Instance.new("Animator")
	animator.Name = "Animator"
	animator.Parent = humanoid

	pcall(function()
		model.PrimaryPart = hrp
	end)

	print("Export complete (skinned): " .. title .. " → assetId=" .. tostring(skinnedAssetId))
else

for _, def in R15_PARTS do
	local part = roblox.Instance.new("MeshPart")
	part.Name = def.name
	part.Size = _Vector3.new(def.size[1], def.size[2], def.size[3])

	pcall(function()
		part.CFrame = _CFrame.new(def.position[1], def.position[2], def.position[3])
	end)

	part.Anchored = false
	part.CanCollide = (def.name == "HumanoidRootPart")

	if def.transparency then
		part.Transparency = def.transparency
	end

	-- If the caller provided a mesh asset ID, attach it
	if metadata.meshAssetId and def.name ~= "HumanoidRootPart" then
		pcall(function()
			part.MeshId = metadata.meshAssetId
		end)
	end

	part.Parent = model
	partsByName[def.name] = part
end

-- Set PrimaryPart to HumanoidRootPart
pcall(function()
	model.PrimaryPart = partsByName["HumanoidRootPart"]
end)

-- ── Create Motor6D joints ────────────────────────────────────────────

for _, jointDef in R15_JOINTS do
	local part0 = partsByName[jointDef.part0]
	local part1 = partsByName[jointDef.part1]
	if part0 == nil or part1 == nil then
		continue
	end

	local motor = roblox.Instance.new("Motor6D")
	motor.Name = jointDef.name

	pcall(function()
		motor.Part0 = part0
	end)
	pcall(function()
		motor.Part1 = part1
	end)
	pcall(function()
		motor.C0 = _CFrame.new(jointDef.c0[1], jointDef.c0[2], jointDef.c0[3])
	end)
	pcall(function()
		motor.C1 = _CFrame.new(jointDef.c1[1], jointDef.c1[2], jointDef.c1[3])
	end)

	motor.Parent = part0
end

end -- end of legacy 16-part path (else branch of useSkinnedPath)

-- ── Apply BodyColors from AI-extracted palette ───────────────────────
-- Skipped for skinned path: the body MeshPart already carries baked PBR/Texture
-- data from the FBX import, so per-region tinting would discolour the model.

if metadata.bodyColors and not useSkinnedPath then
	local bc = metadata.bodyColors
	local _Color3 = (roblox :: any).Color3 or Color3

	local function rgb(tbl: { number }): any
		if tbl and #tbl >= 3 then
			return _Color3.new(tbl[1] / 255, tbl[2] / 255, tbl[3] / 255)
		end
		return _Color3.new(0.639, 0.635, 0.647) -- Medium stone grey fallback
	end

	local bodyColors = roblox.Instance.new("BodyColors")
	bodyColors.Name = "Body Colors"
	bodyColors.HeadColor3 = rgb(bc.headColor)
	bodyColors.TorsoColor3 = rgb(bc.torsoColor)
	bodyColors.LeftArmColor3 = rgb(bc.leftArmColor)
	bodyColors.RightArmColor3 = rgb(bc.rightArmColor)
	bodyColors.LeftLegColor3 = rgb(bc.leftLegColor)
	bodyColors.RightLegColor3 = rgb(bc.rightLegColor)
	bodyColors.Parent = model

	-- Also tint MeshParts directly so the colour is visible even without
	-- the legacy BodyColors rendering path (R15 layered clothing pipeline).
	local regionMap: { [string]: { number } } = {
		Head = bc.headColor,
		UpperTorso = bc.torsoColor,
		LowerTorso = bc.torsoColor,
		LeftUpperArm = bc.leftArmColor,
		LeftLowerArm = bc.leftArmColor,
		LeftHand = bc.leftArmColor,
		RightUpperArm = bc.rightArmColor,
		RightLowerArm = bc.rightArmColor,
		RightHand = bc.rightArmColor,
		LeftUpperLeg = bc.leftLegColor,
		LeftLowerLeg = bc.leftLegColor,
		LeftFoot = bc.leftLegColor,
		RightUpperLeg = bc.rightLegColor,
		RightLowerLeg = bc.rightLegColor,
		RightFoot = bc.rightLegColor,
	}
	for partName, colorTbl in regionMap do
		local part = partsByName[partName]
		if part then
			pcall(function()
				part.Color = rgb(colorTbl)
			end)
		end
	end

	print("BodyColors applied from AI-extracted palette")
end

-- ── Apply TextureID from uploaded base-color texture ──────────────────
-- Skinned path: the FBX-imported body already has PBR maps embedded; applying
-- TextureID would override them with a flat texture.

if metadata.textureAssetId and not useSkinnedPath then
	local texId = "rbxassetid://" .. tostring(metadata.textureAssetId)
	for _, part in partsByName do
		pcall(function()
			(part :: any).TextureID = texId
		end)
	end
	print("TextureID applied to all MeshParts: " .. texId)
end

-- ── Apply classic clothing textures (Shirt/Pants) ─────────────────────

if metadata.shirtTextureUrl then
	local shirt = roblox.Instance.new("Shirt")
	shirt.Name = "Shirt"
	shirt.ShirtTemplate = metadata.shirtTextureUrl
	shirt.Parent = model
end

if metadata.pantsTextureUrl then
	local pants = roblox.Instance.new("Pants")
	pants.Name = "Pants"
	pants.PantsTemplate = metadata.pantsTextureUrl
	pants.Parent = model
end

-- ── Embed mesh reference if available ─────────────────────────────────

if metadata.meshFilePath then
	local ok, meshBytes = pcall(fs.readFile, metadata.meshFilePath)
	if ok and #meshBytes > 0 then
		local meshRef = roblox.Instance.new("StringValue")
		meshRef.Name = "ExternalMeshPath"
		meshRef.Value = metadata.meshExtension or "glb"
		meshRef.Parent = model

		local meshSizeRef = roblox.Instance.new("IntValue")
		meshSizeRef.Name = "ExternalMeshSizeBytes"
		meshSizeRef.Value = #meshBytes
		meshSizeRef.Parent = model

		local meshOutPath = outputPath:gsub("%.rbxm$", "." .. (metadata.meshExtension or "glb"))
		fs.writeFile(meshOutPath, meshBytes)
		print("Mesh bundle copied: " .. meshOutPath)
	end
end

-- ── Serialize ────────────────────────────────────────────────────────

local output = roblox.serializeModel({ model })
fs.writeFile(outputPath, output)

print("Export complete: " .. title .. " → " .. outputPath)
