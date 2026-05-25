local fs = require("@lune/fs")
local process = require("@lune/process")
local roblox = require("@lune/roblox")
local serde = require("@lune/serde")

local _Vector3 = (roblox :: any).Vector3 or Vector3
local _Color3 = (roblox :: any).Color3 or Color3
local _CFrame = (roblox :: any).CFrame or CFrame
local _BrickColor = (roblox :: any).BrickColor or BrickColor
local _UDim = (roblox :: any).UDim
local _UDim2 = (roblox :: any).UDim2
local _NumberSequence = (roblox :: any).NumberSequence
local _NumberSequenceKeypoint = (roblox :: any).NumberSequenceKeypoint
local _ColorSequence = (roblox :: any).ColorSequence
local _ColorSequenceKeypoint = (roblox :: any).ColorSequenceKeypoint
local _NumberRange = (roblox :: any).NumberRange
local _Vector2 = (roblox :: any).Vector2
local _Enum = (roblox :: any).Enum
local _Font = (roblox :: any).Font

local args = process.args
local manifestPath = args[1]
local outputPath = args[2]
local target = args[3] or "place"

assert(manifestPath ~= nil and outputPath ~= nil, "Expected manifestPath and outputPath")

local manifest = serde.decode("json", fs.readFile(manifestPath))
local instanceMap = {}
local pendingProperties = {}


local function resolvePropertyValue(value)
	if type(value) ~= "table" then
		return value
	end
	if value.__type == "Vector3" then
		if _Vector3 then
			return _Vector3.new(value.x or 0, value.y or 0, value.z or 0)
		end
		return nil
	end
	if value.__type == "Color3" then
		if _Color3 then
			return _Color3.new(value.r or 0, value.g or 0, value.b or 0)
		end
		return nil
	end
	if value.__type == "CFrame" then
		if _CFrame then
			local pos = value.position or value
			local x = pos.x or 0
			local y = pos.y or 0
			local z = pos.z or 0
			local rot = value.rotation
			if type(rot) == "table" then
				if #rot == 9 then
					return _CFrame.new(
						x, y, z,
						rot[1], rot[2], rot[3],
						rot[4], rot[5], rot[6],
						rot[7], rot[8], rot[9]
					)
				elseif #rot == 3 then
					local rx = math.rad(rot[1] or 0)
					local ry = math.rad(rot[2] or 0)
					local rz = math.rad(rot[3] or 0)
					return _CFrame.new(x, y, z) * _CFrame.Angles(rx, ry, rz)
				end
			end
			return _CFrame.new(x, y, z)
		end
		return nil
	end
	if value.__type == "BrickColor" then
		if _BrickColor then
			return _BrickColor.new(value.name or "Medium stone grey")
		end
		return nil
	end
	if value.__type == "Enum" then
		if value.enumType and value.enumName and _Enum then
			local ok, result = pcall(function()
				return (_Enum :: any)[value.enumType][value.enumName]
			end)
			if ok then
				return result
			end
		end
		if value.value ~= nil then
			return value.value
		end
		return nil
	end
	if value.__type == "NumberRange" then
		if _NumberRange then
			local ok, result = pcall(function()
				return _NumberRange.new(value.min or 0, value.max or (value.min or 0))
			end)
			if ok then return result end
		end
		return nil
	end
	if value.__type == "Vector2" then
		if _Vector2 then
			local ok, result = pcall(function()
				return _Vector2.new(value.x or 0, value.y or 0)
			end)
			if ok then return result end
		end
		return nil
	end
	if value.__type == "UDim" then
		if _UDim then
			return _UDim.new(value.scale or 0, value.offset or 0)
		end
		return nil
	end
	if value.__type == "UDim2" then
		if _UDim2 then
			return _UDim2.new(
				value.XScale or value.xScale or 0, value.XOffset or value.xOffset or 0,
				value.YScale or value.yScale or 0, value.YOffset or value.yOffset or 0
			)
		end
		return nil
	end
	if value.__type == "NumberSequence" then
		if _NumberSequence and _NumberSequenceKeypoint and type(value.keypoints) == "table" then
			local keypoints = {}
			for _, kp in value.keypoints do
				table.insert(keypoints, _NumberSequenceKeypoint.new(
					kp.time or 0, kp.value or 0, kp.envelope or 0
				))
			end
			if #keypoints >= 2 then
				return _NumberSequence.new(keypoints)
			end
		end
		return nil
	end
	if value.__type == "ColorSequence" then
		if _ColorSequence and _ColorSequenceKeypoint and _Color3 and type(value.keypoints) == "table" then
			local keypoints = {}
			for _, kp in value.keypoints do
				table.insert(keypoints, _ColorSequenceKeypoint.new(
					kp.time or 0,
					_Color3.new(kp.r or 0, kp.g or 0, kp.b or 0)
				))
			end
			if #keypoints >= 2 then
				return _ColorSequence.new(keypoints)
			end
		end
		return nil
	end
	if value.__type == "Font" then
		if _Font then
			local weight = value.weight or "Regular"
			local style = value.style or "Normal"
			local family = value.family or "rbxasset://fonts/families/GothamSSm.json"
			local ok, result = pcall(function()
				return _Font.new(family, _Enum.FontWeight[weight], _Enum.FontStyle[style])
			end)
			if ok then return result end
		end
		return nil
	end
	if value.__type == "Content" or value.__type == "AssetId" then
		return value.uri or value.value or ""
	end
	if value.__type == "Ref" and value.id ~= nil then
		return instanceMap[value.id]
	end
	return value
end

local CONTENT_PROPERTIES = {
	MeshId = true,
	MeshContent = true,        -- 2024+ replacement for MeshId on MeshPart (Content type)
	TextureID = true,
	TextureId = true,
	TextureContent = true,     -- 2024+ replacement for TextureID on MeshPart (Content type)
	SoundId = true,
	Texture = true,
	Image = true,
	ColorMap = true,
	MetalnessMap = true,
	NormalMap = true,
	RoughnessMap = true,
	ShirtTemplate = true,
	PantsTemplate = true,
}

local function resolveContentString(value)
	if type(value) == "string" then
		return value
	end
	if type(value) == "table" then
		if value.__type == "Content" or value.__type == "AssetId" then
			return value.uri or value.value or ""
		end
		if value.uri then
			return value.uri
		end
	end
	return nil
end

-- Map legacy Font enum names to FontFace font families
local FONT_FAMILY_MAP = {
	GothamBold = { family = "rbxasset://fonts/families/GothamSSm.json", weight = "Bold" },
	GothamBlack = { family = "rbxasset://fonts/families/GothamSSm.json", weight = "Heavy" },
	GothamMedium = { family = "rbxasset://fonts/families/GothamSSm.json", weight = "Medium" },
	Gotham = { family = "rbxasset://fonts/families/GothamSSm.json", weight = "Regular" },
	SourceSansBold = { family = "rbxasset://fonts/families/SourceSansPro.json", weight = "Bold" },
	SourceSans = { family = "rbxasset://fonts/families/SourceSansPro.json", weight = "Regular" },
	FredokaOne = { family = "rbxasset://fonts/families/FredokaOne.json", weight = "Regular" },
	Bangers = { family = "rbxasset://fonts/families/Bangers.json", weight = "Regular" },
}

local function applyProperties(instance, properties)
	if properties == nil then
		return
	end

	for key, value in properties do
		-- Convert Font Enum to FontFace Font type to avoid serialization crash
		if key == "Font" and type(value) == "table" and value.__type == "Enum" and value.enumType == "Font" and _Font then
			local mapped = FONT_FAMILY_MAP[value.enumName]
			if mapped then
				local ok, fontResult = pcall(function()
					return _Font.new(mapped.family, _Enum.FontWeight[mapped.weight], _Enum.FontStyle.Normal)
				end)
				if ok then
					pcall(function() instance.FontFace = fontResult end)
				end
			end
		elseif CONTENT_PROPERTIES[key] then
			local contentStr = resolveContentString(value)
			if contentStr ~= nil and contentStr ~= "" then
				local ok, err = pcall(function()
					instance[key] = contentStr
				end)
				if not ok then
					warn("[build_roblox] Failed to set content property " .. key .. " on " .. instance.Name .. ": " .. tostring(err))
				end
			end
		else
			local resolved = resolvePropertyValue(value)
			if resolved ~= nil then
				local ok, err = pcall(function()
					instance[key] = resolved
				end)
				if not ok then
					warn("[build_roblox] Failed to set property " .. key .. " on " .. instance.Name .. ": " .. tostring(err))
				end
			end
		end
	end
end

local function makeServicesRoot()
	local game = roblox.Instance.new("DataModel")
	local workspace = roblox.Instance.new("Workspace")
	workspace.Name = "Workspace"
	workspace.Parent = game

	local serverScriptService = roblox.Instance.new("ServerScriptService")
	serverScriptService.Name = "ServerScriptService"
	serverScriptService.Parent = game

	local replicatedStorage = roblox.Instance.new("ReplicatedStorage")
	replicatedStorage.Name = "ReplicatedStorage"
	replicatedStorage.Parent = game

	local starterGui = roblox.Instance.new("StarterGui")
	starterGui.Name = "StarterGui"
	starterGui.Parent = game

	local starterPlayer = roblox.Instance.new("StarterPlayer")
	starterPlayer.Name = "StarterPlayer"
	starterPlayer.Parent = game

	local starterPlayerScripts = roblox.Instance.new("StarterPlayerScripts")
	starterPlayerScripts.Name = "StarterPlayerScripts"
	starterPlayerScripts.Parent = starterPlayer

	local starterPack = roblox.Instance.new("StarterPack")
	starterPack.Name = "StarterPack"
	starterPack.Parent = game

	local serverStorage = roblox.Instance.new("ServerStorage")
	serverStorage.Name = "ServerStorage"
	serverStorage.Parent = game

	local replicatedFirst = roblox.Instance.new("ReplicatedFirst")
	replicatedFirst.Name = "ReplicatedFirst"
	replicatedFirst.Parent = game

	local lighting = roblox.Instance.new("Lighting")
	lighting.Name = "Lighting"
	lighting.Parent = game

	local materialService = roblox.Instance.new("MaterialService")
	materialService.Name = "MaterialService"
	materialService.Parent = game

	instanceMap["WorkspaceRoot"] = workspace
	instanceMap["ServerScriptService"] = serverScriptService
	instanceMap["ReplicatedStorage"] = replicatedStorage
	instanceMap["StarterGui"] = starterGui
	instanceMap["StarterPlayerScripts"] = starterPlayerScripts
	instanceMap["StarterPack"] = starterPack
	instanceMap["ServerStorage"] = serverStorage
	instanceMap["ReplicatedFirst"] = replicatedFirst
	instanceMap["Lighting"] = lighting
	instanceMap["MaterialService"] = materialService

	return game
end

local dataRoot
if target == "model" then
	-- rootClassName allows the manifest to specify the root instance type.
	-- Weapons use "Tool" so the RBXM root IS the Tool (not wrapped in Model).
	local rootClass = manifest.rootClassName or "Model"
	local rootModel = roblox.Instance.new(rootClass)
	rootModel.Name = manifest.title or "GeneratedModel"
	-- Apply rootProperties if provided (e.g. Tool GripPos, CanBeDropped, etc.)
	if manifest.rootProperties then
		applyProperties(rootModel, manifest.rootProperties)
	end
	instanceMap["WorkspaceRoot"] = rootModel
	instanceMap["ServerScriptService"] = rootModel
	instanceMap["ReplicatedStorage"] = rootModel
	instanceMap["StarterGui"] = rootModel
	instanceMap["StarterPlayerScripts"] = rootModel
	instanceMap["StarterPack"] = rootModel
	dataRoot = rootModel
else
	dataRoot = makeServicesRoot()
end

for _, node in manifest.scene do
	if node.className ~= "__LightingConfig" then
		local instance = roblox.Instance.new(node.className)
		instance.Name = node.name
		pendingProperties[node.id] = node.properties
		instanceMap[node.id] = instance
	end
end

for _, node in manifest.scene do
	if node.className ~= "__LightingConfig" then
		local instance = instanceMap[node.id]
		local parent = instanceMap[node.parentId or "WorkspaceRoot"] or instanceMap["WorkspaceRoot"]
		if instance and parent then
			instance.Parent = parent
		end
	end
end

for nodeId, properties in pendingProperties do
	local instance = instanceMap[nodeId]
	if instance ~= nil then
		applyProperties(instance, properties)
	end
end

for _, node in manifest.scene do
	if node.className == "__LightingConfig" and node.properties then
		local lighting = instanceMap["Lighting"]
		if lighting then
			applyProperties(lighting, node.properties)
		end
	end
end

if manifest.ui ~= nil then
	local pendingUiProperties = {}
	for _, node in manifest.ui do
		local instance = roblox.Instance.new(node.className)
		instance.Name = node.name
		pendingUiProperties[node.id] = node.properties
		instanceMap[node.id] = instance
	end
	for _, node in manifest.ui do
		local instance = instanceMap[node.id]
		local parent = instanceMap[node.parentId or "StarterGui"] or instanceMap["StarterGui"]
		instance.Parent = parent
	end
	for nodeId, properties in pendingUiProperties do
		local instance = instanceMap[nodeId]
		if instance ~= nil then
			applyProperties(instance, properties)
		end
	end
end

if manifest.assets ~= nil then
	for _, asset in manifest.assets do
		local folderId = asset.folderId or "ServerStorage"
		local folder = instanceMap[folderId]
		if folder == nil then
			local sstorage = instanceMap["ServerStorage"]
			if sstorage then
				local assetsFolder = sstorage:FindFirstChild("Assets")
				if not assetsFolder then
					assetsFolder = roblox.Instance.new("Folder")
					assetsFolder.Name = "Assets"
					assetsFolder.Parent = sstorage
				end
				folder = assetsFolder
			end
		end

		if asset.assetType == "mesh" then
			local holder = roblox.Instance.new("MeshPart")
			holder.Name = asset.name or "Mesh"
			if asset.meshId then
				pcall(function() holder.MeshId = asset.meshId end)
			end
			if asset.textureId then
				pcall(function() holder.TextureID = asset.textureId end)
			end
			if folder then holder.Parent = folder end
			if asset.id then instanceMap[asset.id] = holder end
		elseif asset.assetType == "audio" then
			local holder = roblox.Instance.new("Sound")
			holder.Name = asset.name or "Sound"
			if asset.soundId then
				pcall(function() holder.SoundId = asset.soundId end)
			end
			if folder then holder.Parent = folder end
			if asset.id then instanceMap[asset.id] = holder end
		elseif asset.assetType == "texture" then
			local holder = roblox.Instance.new("Decal")
			holder.Name = asset.name or "Texture"
			if asset.textureId then
				pcall(function() holder.Texture = asset.textureId end)
			end
			if folder then holder.Parent = folder end
			if asset.id then instanceMap[asset.id] = holder end
		end
	end
end

if manifest.embeddedModels ~= nil then
	for _, embedded in manifest.embeddedModels do
		local parent = instanceMap[embedded.parentId or "WorkspaceRoot"] or instanceMap["WorkspaceRoot"]
		local contentPath = embedded.contentPath
		if parent ~= nil and type(contentPath) == "string" and contentPath ~= "" then
			local okRead, contents = pcall(function()
				return fs.readFile(contentPath)
			end)
			if okRead and contents then
				local okDeserialize, embeddedInstances = pcall(function()
					return roblox.deserializeModel(contents)
				end)
				if okDeserialize and embeddedInstances then
					-- Round 20 v3: vehicle_template mode picks ONE variant by name
					-- (Roblox endorsed packs ship 1-5 colour variants per asset)
					-- and recolours its body parts to user's primaryHex. Other
					-- variants in the same asset are dropped — user gets just
					-- the single variant they asked for.
					if embedded.mode == "vehicle_template" then
						local preferred = embedded.preferredVariant
						local fallbacks = embedded.variantFallbacks or {}
						local pickedVariant = nil
						-- Try preferred name, then each fallback
						local function findByName(name)
							for _, child in embeddedInstances do
								if child.Name == name then return child end
							end
							return nil
						end
						pickedVariant = findByName(preferred)
						if not pickedVariant then
							for _, fb in fallbacks do
								pickedVariant = findByName(fb)
								if pickedVariant then break end
							end
						end
						if not pickedVariant then pickedVariant = embeddedInstances[1] end
						if not pickedVariant then
							warn("[build_roblox] vehicle_template: no variant in embedded asset " .. tostring(embedded.name))
						else
							-- Parent the chosen variant directly to the target parent (Workspace
							-- or wrapper Model), discarding the other variants. Rename to user's
							-- title for cleaner Explorer tree.
							pickedVariant.Name = embedded.name or pickedVariant.Name
							pickedVariant.Parent = parent
							if embedded.id then instanceMap[embedded.id] = pickedVariant end

							-- Recolour body parts: match SmoothPlastic parts whose Color3 is
							-- within tolerance of the variant's known body hex, set to primary.
							local bodyHex = embedded.bodyOriginalHex or "#FFFFFF"
							local primaryHex = embedded.primaryHex or "#E03A2E"
							local function hexToRgb01(h)
								local s = string.gsub(h, "^#", "")
								local r = tonumber(string.sub(s, 1, 2), 16) or 255
								local g = tonumber(string.sub(s, 3, 4), 16) or 255
								local b = tonumber(string.sub(s, 5, 6), 16) or 255
								return r / 255, g / 255, b / 255
							end
							local br, bg, bb = hexToRgb01(bodyHex)
							local pr, pg, pb = hexToRgb01(primaryHex)
							local TOL = 10 / 255
							local recoloured = 0
							for _, descendant in pickedVariant:GetDescendants() do
								if descendant:IsA("BasePart") then
									local ok, mat = pcall(function() return descendant.Material end)
									if ok and tostring(mat) == "Enum.Material.SmoothPlastic" then
										local c = descendant.Color
										if math.abs(c.R - br) < TOL
											and math.abs(c.G - bg) < TOL
											and math.abs(c.B - bb) < TOL then
											pcall(function() descendant.Color = _Color3.new(pr, pg, pb) end)
											recoloured = recoloured + 1
										end
									end
								end
							end
							print(string.format("[build_roblox] vehicle_template: picked %s, recoloured %d body parts",
								pickedVariant.Name, recoloured))

							-- Round 20D: accessory parts (plate + optional roof sign)
							local function findPrimaryBasePart()
								if pickedVariant.PrimaryPart then return pickedVariant.PrimaryPart end
								for _, d in pickedVariant:GetDescendants() do
									if d:IsA("BasePart") then return d end
								end
								return nil
							end
							local anchorPart = findPrimaryBasePart()
							if not anchorPart then
								warn("[build_roblox] vehicle_template: no BasePart to weld accessories to, skipping")
							else
								-- Lune's Roblox lib doesn't implement Model:GetBoundingBox(),
								-- so walk all BaseParts and compute axis-aligned bbox manually.
								local minX, minY, minZ = math.huge, math.huge, math.huge
								local maxX, maxY, maxZ = -math.huge, -math.huge, -math.huge
								local partCount = 0
								for _, d in pickedVariant:GetDescendants() do
									if d:IsA("BasePart") then
										local okP, cf = pcall(function() return d.CFrame end)
										local okS, s = pcall(function() return d.Size end)
										if okP and okS and cf and s then
											local p = cf.Position
											if p.X - s.X / 2 < minX then minX = p.X - s.X / 2 end
											if p.Y - s.Y / 2 < minY then minY = p.Y - s.Y / 2 end
											if p.Z - s.Z / 2 < minZ then minZ = p.Z - s.Z / 2 end
											if p.X + s.X / 2 > maxX then maxX = p.X + s.X / 2 end
											if p.Y + s.Y / 2 > maxY then maxY = p.Y + s.Y / 2 end
											if p.Z + s.Z / 2 > maxZ then maxZ = p.Z + s.Z / 2 end
											partCount = partCount + 1
										end
									end
								end
								if partCount > 0 and (maxX - minX) > 0.1 then
									local centerPos = _Vector3.new((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2)
									local halfX = (maxX - minX) / 2
									local halfY = (maxY - minY) / 2
									local halfZ = (maxZ - minZ) / 2

									local function addAccessoryPart(name, size, worldPos, color, material)
										local p = roblox.Instance.new("Part")
										p.Name = name
										p.Size = size
										p.CFrame = _CFrame.new(worldPos)
										-- Round 20D fix: Anchored=true so accessories render
										-- predictably in Edit Mode. Without anchoring + weld combo,
										-- Studio's load step appears to snap welded-but-not-anchored
										-- parts to (0,0,0) and they end up invisible/clipped.
										-- Trade-off: at Play, accessories stay fixed at their world
										-- position while the car drives away. Acceptable for D
										-- iteration (user just wants to verify they appear).
										-- A follow-up should add a runtime LocalScript that
										-- un-anchors and welds on demand.
										p.Anchored = true
										p.CanCollide = false
										p.Massless = false
										p.Color = color
										p.Material = material
										p.Parent = pickedVariant
										return p
									end

									-- Round 20D fix #3: SurfaceGui+TextLabel via Lune doesn't render
									-- text in Studio for unclear reasons (Parts visible, SurfaceGui
									-- children missing visually). Switching to BillboardGui which
									-- floats text in 3D facing the camera — works reliably for
									-- labels like "TAXI" / "POLICE" / plate numbers regardless of
									-- viewing angle.
									local function addBillboardText(parentPart, text, sizeStud, yOffset)
										local bb = roblox.Instance.new("BillboardGui")
										bb.Name = "BillboardLabel"
										bb.Size = _UDim2.new(sizeStud, 0, sizeStud * 0.4, 0)
										bb.StudsOffset = _Vector3.new(0, yOffset or 0, 0)
										bb.AlwaysOnTop = false
										bb.LightInfluence = 0
										bb.MaxDistance = 200
										bb.Parent = parentPart
										local bg = roblox.Instance.new("Frame")
										bg.Name = "Bg"
										bg.Size = _UDim2.new(1, 0, 1, 0)
										bg.BackgroundColor3 = _Color3.new(1, 1, 1)
										bg.BorderSizePixel = 2
										bg.Parent = bb
										local label = roblox.Instance.new("TextLabel")
										label.Name = "Label"
										label.Size = _UDim2.new(1, -4, 1, -4)
										label.Position = _UDim2.new(0, 2, 0, 2)
										label.BackgroundTransparency = 1
										label.Text = text
										label.TextColor3 = _Color3.new(0, 0, 0)
										if _Font then
											pcall(function()
												label.FontFace = _Font.new(
													"rbxasset://fonts/families/GothamSSm.json",
													_Enum.FontWeight.Bold,
													_Enum.FontStyle.Normal
												)
											end)
										end
										label.TextScaled = true
										label.Parent = bg
									end

									-- Detect car's LONG axis (length axis). For Roblox endorsed
									-- vehicles, length is usually along Z (extent ~20) and width
									-- along X (extent ~8). Compute on the fly so we don't bake in
									-- a wrong assumption.
									local extentX = maxX - minX
									local extentZ = maxZ - minZ
									local lengthAlongZ = extentZ > extentX
									print(string.format("[build_roblox] vehicle_template: bbox extent X=%.1f Z=%.1f (length axis = %s)",
										extentX, extentZ, lengthAlongZ and "Z" or "X"))

									-- Round 20D fix #4: bbox includes outliers (RedressMount, etc.)
									-- that stick out far beyond the visible body. Find the actual
									-- bumper / roof / hood parts by name and use their world positions
									-- so plates and roof signs mount on actual body surfaces, not
									-- 3 studs out in empty air.
									local function findFirstByLowerName(...)
										local needles = {...}
										for _, d in pickedVariant:GetDescendants() do
											if d:IsA("BasePart") then
												local n = string.lower(d.Name)
												for _, needle in needles do
													if n == needle then return d end
												end
											end
										end
										return nil
									end
									local bumperBack = findFirstByLowerName("bumper_back", "rear_bumper", "back_bumper", "r_bumper")
									local bumperFront = findFirstByLowerName("bumper_front", "f_bumper", "front_bumper")
									local roofPart = findFirstByLowerName("roof_hood", "roof", "roof_hood1", "main_roof")

									local plateText = embedded.plateText
									if type(plateText) == "string" and #plateText > 0 then
										local plateSize = _Vector3.new(2.0, 0.55, 0.08)
										-- Mount plate AGAINST the actual bumper part if found,
										-- otherwise fall back to bbox extents.
										local function mountPlate(name, bumperPart, fallbackZ, fallbackX, isRear)
											local px, py, pz
											if bumperPart then
												local bp = bumperPart.CFrame.Position
												local bs = bumperPart.Size
												px = bp.X
												py = bp.Y
												if lengthAlongZ then
													-- offset outward along Z, plate face just outside bumper
													pz = bp.Z + (isRear and (bs.Z / 2 + plateSize.Z / 2 - 0.01) or -(bs.Z / 2 + plateSize.Z / 2 - 0.01))
												else
													pz = bp.Z
													px = bp.X + (isRear and (bs.X / 2 + plateSize.X / 2 - 0.01) or -(bs.X / 2 + plateSize.X / 2 - 0.01))
												end
											else
												px = centerPos.X
												py = minY + 2.8  -- bumper height fallback (was 1.7 — too low)
												pz = fallbackZ
											end
											local p = addAccessoryPart(name, plateSize,
												_Vector3.new(px, py, pz),
												_Color3.new(1, 1, 1), _Enum.Material.SmoothPlastic)
											addBillboardText(p, plateText, 1.6, 0)
											print(string.format("[build_roblox] %s pos=(%.1f,%.1f,%.1f) bumper=%s",
												name, px, py, pz, bumperPart and bumperPart.Name or "FALLBACK"))
										end
										if lengthAlongZ then
											mountPlate("LicensePlate_Rear", bumperBack, maxZ + plateSize.Z / 2, nil, true)
											mountPlate("LicensePlate_Front", bumperFront, minZ - plateSize.Z / 2, nil, false)
										else
											mountPlate("LicensePlate_Rear", bumperBack, nil, maxX + plateSize.X / 2, true)
											mountPlate("LicensePlate_Front", bumperFront, nil, minX - plateSize.X / 2, false)
										end
									end

									local signText = embedded.roofSignText
									local signColorHex = embedded.roofSignColorHex or "#F2B807"
									local roofSignDecalId = tonumber(embedded.roofSignDecalAssetId)
									if type(signText) == "string" and #signText > 0 then
										-- Round 20F: real 3D taxi-style roof topper made of 4 parts:
										--   1) Center bar (low-profile neon box, wordmark decal on sides)
										--   2) Left end cap (wedge for rounded look)
										--   3) Right end cap
										--   4) Two mounting feet (black) connecting to the roof
										local sgnR, sgnG, sgnB = hexToRgb01(signColorHex)
										local barSize, capSize, footSize
										if lengthAlongZ then
											-- car length along Z → topper wide across X, thin along Z
											barSize = _Vector3.new(2.4, 0.5, 1.1)
											capSize = _Vector3.new(0.5, 0.5, 1.1)
											footSize = _Vector3.new(0.15, 0.35, 0.6)
										else
											barSize = _Vector3.new(1.1, 0.5, 2.4)
											capSize = _Vector3.new(1.1, 0.5, 0.5)
											footSize = _Vector3.new(0.6, 0.35, 0.15)
										end
										local sx, sy, sz
										if roofPart then
											local rp = roofPart.CFrame.Position
											local rs = roofPart.Size
											sx = rp.X
											-- Mounting-foot height included: total Y = foot + bar
											sy = rp.Y + rs.Y / 2 + footSize.Y + barSize.Y / 2
											sz = rp.Z
										else
											sx = centerPos.X
											sy = maxY + footSize.Y + barSize.Y / 2
											sz = centerPos.Z
										end

										-- Center bar with TAXI decal on long sides
										local barColor = _Color3.new(sgnR, sgnG, sgnB)
										local centerBar = addAccessoryPart("RoofTopper_Bar", barSize,
											_Vector3.new(sx, sy, sz), barColor, _Enum.Material.Neon)
										if roofSignDecalId and roofSignDecalId > 0 then
											applyDecal(centerBar, roofSignDecalId, _Enum.NormalId.Front)
											applyDecal(centerBar, roofSignDecalId, _Enum.NormalId.Back)
										else
											-- Fallback: legacy BillboardGui label
											addBillboardText(centerBar, signText, 2.4, 0)
										end

										-- End caps (slightly smaller, also neon for glow continuity)
										if lengthAlongZ then
											local capLeftX = sx - barSize.X / 2 - capSize.X / 2 + 0.02
											local capRightX = sx + barSize.X / 2 + capSize.X / 2 - 0.02
											addAccessoryPart("RoofTopper_CapLeft", capSize,
												_Vector3.new(capLeftX, sy, sz), barColor, _Enum.Material.Neon)
											addAccessoryPart("RoofTopper_CapRight", capSize,
												_Vector3.new(capRightX, sy, sz), barColor, _Enum.Material.Neon)
										else
											local capFrontZ = sz - barSize.Z / 2 - capSize.Z / 2 + 0.02
											local capBackZ = sz + barSize.Z / 2 + capSize.Z / 2 - 0.02
											addAccessoryPart("RoofTopper_CapFront", capSize,
												_Vector3.new(sx, sy, capFrontZ), barColor, _Enum.Material.Neon)
											addAccessoryPart("RoofTopper_CapBack", capSize,
												_Vector3.new(sx, sy, capBackZ), barColor, _Enum.Material.Neon)
										end

										-- Mounting feet (dark, between bar and roof — looks structural)
										local footColor = _Color3.new(0.08, 0.08, 0.08)
										local footY = sy - barSize.Y / 2 - footSize.Y / 2
										if lengthAlongZ then
											addAccessoryPart("RoofTopper_FootL", footSize,
												_Vector3.new(sx - barSize.X * 0.35, footY, sz), footColor,
												_Enum.Material.SmoothPlastic)
											addAccessoryPart("RoofTopper_FootR", footSize,
												_Vector3.new(sx + barSize.X * 0.35, footY, sz), footColor,
												_Enum.Material.SmoothPlastic)
										else
											addAccessoryPart("RoofTopper_FootF", footSize,
												_Vector3.new(sx, footY, sz - barSize.Z * 0.35), footColor,
												_Enum.Material.SmoothPlastic)
											addAccessoryPart("RoofTopper_FootB", footSize,
												_Vector3.new(sx, footY, sz + barSize.Z * 0.35), footColor,
												_Enum.Material.SmoothPlastic)
										end

										print(string.format("[build_roblox] RoofTopper 4-part composition pos=(%.1f,%.1f,%.1f) roof=%s decal=%s",
											sx, sy, sz, roofPart and roofPart.Name or "FALLBACK",
											roofSignDecalId and tostring(roofSignDecalId) or "none"))
									end

									-- Round 20E: Decal-based per-prompt liveries. AssetIds come
									-- from the Functions stage `generate_vehicle_decals` which
									-- generated PNGs via Flux + uploaded to Roblox Open Cloud.
									-- We add Decal children on specific body parts so the graphics
									-- read AS the car body (not protruding 3D pieces).
									local function applyDecal(parentPart, assetId, face)
										local d = roblox.Instance.new("Decal")
										d.Name = "AIDecal_" .. tostring(face)
										d.Texture = "rbxassetid://" .. tostring(assetId)
										d.Face = face
										d.Parent = parentPart
									end
									local function findFirstByLowerExact(name)
										for _, d in pickedVariant:GetDescendants() do
											if d:IsA("BasePart") and string.lower(d.Name) == name then
												return d
											end
										end
										return nil
									end

									local doorDecalId = tonumber(embedded.doorDecalAssetId)
									if doorDecalId and doorDecalId > 0 then
										-- Apply same decal to all 4 side doors. Face = outward side.
										local doorMappings = {
											{ name = "lf_door", face = _Enum.NormalId.Left },
											{ name = "lr_door", face = _Enum.NormalId.Left },
											{ name = "rf_door", face = _Enum.NormalId.Right },
											{ name = "rr_door", face = _Enum.NormalId.Right },
											{ name = "l_door",  face = _Enum.NormalId.Left },
											{ name = "r_door",  face = _Enum.NormalId.Right },
										}
										local doorsDone = 0
										for _, m in doorMappings do
											local dp = findFirstByLowerExact(m.name)
											if dp then
												applyDecal(dp, doorDecalId, m.face)
												doorsDone = doorsDone + 1
											end
										end
										print(string.format("[build_roblox] vehicle_template: door decal %d applied to %d parts", doorDecalId, doorsDone))
									end

									local hoodDecalId = tonumber(embedded.hoodDecalAssetId)
									if hoodDecalId and hoodDecalId > 0 then
										-- Hood is generally a separate flat-top part — try common names.
										local hoodPart = findFirstByLowerExact("hood")
											or findFirstByLowerExact("f_bumper")
										if hoodPart then
											applyDecal(hoodPart, hoodDecalId, _Enum.NormalId.Top)
											print(string.format("[build_roblox] vehicle_template: hood decal %d applied to %s", hoodDecalId, hoodPart.Name))
										end
									end

									local trunkDecalId = tonumber(embedded.trunkDecalAssetId)
									if trunkDecalId and trunkDecalId > 0 then
										local trunkPart = findFirstByLowerExact("trunk")
											or findFirstByLowerExact("trrunk")
											or findFirstByLowerExact("bumper_back")
										if trunkPart then
											applyDecal(trunkPart, trunkDecalId, _Enum.NormalId.Top)
											print(string.format("[build_roblox] vehicle_template: trunk decal %d applied to %s", trunkDecalId, trunkPart.Name))
										end
									end
								else
									warn(string.format("[build_roblox] vehicle_template: bbox empty (parts=%d), skipping accessories", partCount))
								end
							end
						end
					else
					local wrapper = roblox.Instance.new("Model")
					wrapper.Name = embedded.name or "EmbeddedModel"
					wrapper.Parent = parent
					if embedded.id then instanceMap[embedded.id] = wrapper end

					for _, child in embeddedInstances do
						child.Parent = wrapper
					end

					if embedded.mode == "npc_skinned_body" then
						local body = nil
						for _, descendant in wrapper:GetDescendants() do
							if descendant:IsA("MeshPart") then
								body = descendant
								break
							end
						end

						for _, descendant in wrapper:GetDescendants() do
							if descendant:IsA("BasePart") then
								pcall(function() descendant.Anchored = false end)
								pcall(function() descendant.CanCollide = false end)
								pcall(function() descendant.Massless = true end)
							end
						end

						local targetHeight = tonumber(embedded.targetHeight) or 5.9
						local okBounds, _, size = pcall(function()
							return wrapper:GetBoundingBox()
						end)
						if okBounds and size and size.Y > 0.05 then
							local scale = targetHeight / size.Y
							if scale < 0.001 then scale = 0.001 elseif scale > 50 then scale = 50 end
							pcall(function() wrapper:ScaleTo(scale) end)
						end

						local root = parent:FindFirstChild("HumanoidRootPart")
						local okScaled, _, scaledSize = pcall(function()
							return wrapper:GetBoundingBox()
						end)
						if root and okScaled and scaledSize then
							local liftY = (scaledSize.Y * 0.5) - 1.5
							pcall(function() wrapper:PivotTo(root.CFrame * _CFrame.new(0, liftY, 0)) end)
						end

						if body then
							body.Name = "Body"
							pcall(function() wrapper.PrimaryPart = body end)
							if type(embedded.textureId) == "string" and embedded.textureId ~= "" then
								pcall(function() body.TextureID = embedded.textureId end)
							end
							if root then
								local motor = roblox.Instance.new("Motor6D")
								motor.Name = "SkinnedRoot"
								pcall(function() motor.Part0 = root end)
								pcall(function() motor.Part1 = body end)
								motor.Parent = root
							end
						end

						for _, descendant in parent:GetDescendants() do
							if descendant:IsA("BasePart") and descendant ~= root and not descendant:IsDescendantOf(wrapper) then
								pcall(function() descendant.Transparency = 1 end)
								pcall(function() descendant.CanCollide = false end)
							end
						end
					end
					end  -- close: if embedded.mode == "vehicle_template" then ... else ... end (Round 20 v3)
				else
					warn("[build_roblox] Failed to deserialize embedded model " .. tostring(embedded.name))
				end
			else
				warn("[build_roblox] Failed to read embedded model " .. tostring(embedded.name))
			end
		end
	end
end

for _, scriptNode in manifest.scripts do
	local scriptInstance = roblox.Instance.new(scriptNode.scriptType)
	scriptInstance.Name = scriptNode.name
	scriptInstance.Source = scriptNode.source or ""
	scriptInstance.Parent = instanceMap[scriptNode.container] or instanceMap["ServerScriptService"]
end

local output
if target == "model" then
	output = roblox.serializeModel({ dataRoot })
else
	output = roblox.serializePlace(dataRoot)
end

fs.writeFile(outputPath, output)
