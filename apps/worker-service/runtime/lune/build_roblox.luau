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
										p.Anchored = false
										p.CanCollide = false
										p.Massless = true
										p.Color = color
										p.Material = material
										p.Parent = pickedVariant
										local weld = roblox.Instance.new("WeldConstraint")
										weld.Name = name .. "Weld"
										weld.Part0 = anchorPart
										weld.Part1 = p
										weld.Parent = p
										return p
									end

									local function addSurfaceGuiText(parentPart, face, text, textColor, bgColor)
										local sg = roblox.Instance.new("SurfaceGui")
										sg.Name = "TextSurface_" .. tostring(face)
										sg.Face = face
										sg.CanvasSize = _Vector2.new(256, 96)
										sg.LightInfluence = 0
										sg.Parent = parentPart
										if bgColor then
											local bgFrame = roblox.Instance.new("Frame")
											bgFrame.Name = "Bg"
											bgFrame.Size = _UDim2.new(1, 0, 1, 0)
											bgFrame.BackgroundColor3 = bgColor
											bgFrame.BorderSizePixel = 0
											bgFrame.Parent = sg
										end
										local label = roblox.Instance.new("TextLabel")
										label.Name = "Label"
										label.Size = _UDim2.new(1, 0, 1, 0)
										label.BackgroundTransparency = 1
										label.Text = text
										label.TextColor3 = textColor
										-- Modern Roblox uses FontFace (Font type), not Font (EnumItem).
										-- Setting Font property in newer Roblox builds throws type-mismatch
										-- during serializeModel — use FontFace directly.
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
										label.Parent = sg
									end

									local plateText = embedded.plateText
									if type(plateText) == "string" and #plateText > 0 then
										local plateSize = _Vector3.new(1.8, 0.45, 0.06)
										local rearY = centerPos.Y - halfY * 0.55
										local rearZ = centerPos.Z + halfZ + 0.05
										local platePart = addAccessoryPart(
											"LicensePlate_Rear",
											plateSize,
											_Vector3.new(centerPos.X, rearY, rearZ),
											_Color3.new(1, 1, 1),
											_Enum.Material.SmoothPlastic
										)
										addSurfaceGuiText(platePart, _Enum.NormalId.Back,
											plateText, _Color3.new(0, 0, 0), _Color3.new(1, 1, 1))
										local frontZ = centerPos.Z - halfZ - 0.05
										local frontPlate = addAccessoryPart(
											"LicensePlate_Front",
											plateSize,
											_Vector3.new(centerPos.X, rearY, frontZ),
											_Color3.new(1, 1, 1),
											_Enum.Material.SmoothPlastic
										)
										addSurfaceGuiText(frontPlate, _Enum.NormalId.Front,
											plateText, _Color3.new(0, 0, 0), _Color3.new(1, 1, 1))
										print("[build_roblox] vehicle_template: added plate", plateText)
									end

									local signText = embedded.roofSignText
									local signColorHex = embedded.roofSignColorHex or "#F2B807"
									if type(signText) == "string" and #signText > 0 then
										local sgnR, sgnG, sgnB = hexToRgb01(signColorHex)
										local signSize = _Vector3.new(2.4, 0.55, 1.0)
										local roofY = centerPos.Y + halfY + 0.35
										local signPart = addAccessoryPart(
											"RoofSign",
											signSize,
											_Vector3.new(centerPos.X, roofY, centerPos.Z),
											_Color3.new(sgnR, sgnG, sgnB),
											_Enum.Material.Neon
										)
										addSurfaceGuiText(signPart, _Enum.NormalId.Front,
											signText, _Color3.new(0, 0, 0), nil)
										addSurfaceGuiText(signPart, _Enum.NormalId.Back,
											signText, _Color3.new(0, 0, 0), nil)
										print("[build_roblox] vehicle_template: added roof sign", signText)
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
