-- Session 427 (Release 4 / Phase 1): apply a list of structured edit-ops to an
-- existing .rbxm (model) or .rbxl (place) and re-serialize. This is the inverse
-- of build_roblox.luau: instead of constructing a DataModel from a manifest, it
-- DESERIALIZES an existing binary, mutates it by `ref` (the stable pre-order
-- index that analyze_roblox.luau --deep assigns), and serializes it back.
--
-- Args:
--   inputPath    — path to input .rbxm / .rbxl
--   opsPath      — path to ops JSON: { "ops": [ ... ] }
--   outputPath   — path to write the edited binary
--   target       — "model" (default for .rbxm) | "place" (.rbxl)
--   resultsPath  — optional: path to write per-op results JSON
--
-- Op shapes (ref-addressed; ref matches analyze_roblox --deep):
--   { "op": "setProperties",  "ref": N, "properties": { ... } }
--   { "op": "setScriptSource","ref": N, "source": "..." }
--   { "op": "rename",         "ref": N, "name": "NewName" }
--   { "op": "delete",         "ref": N }
--   { "op": "addInstance",    "parentRef": N, "className": "Part",
--                             "name": "Extra", "properties": { ... } }
--
-- Properties use the SAME JSON convention as build_roblox.luau:
--   {__type="Vector3",x,y,z}, {__type="Color3",r,g,b},
--   {__type="CFrame",position={x,y,z},rotation={...9}}, {__type="Enum",...},
--   content props (MeshId/TextureID/Texture/Image/SoundId) as plain strings.

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
local inputPath = args[1]
local opsPath = args[2]
local outputPath = args[3]
local target = args[4] or "model"
local resultsPath = args[5]

assert(inputPath ~= nil and opsPath ~= nil and outputPath ~= nil, "Expected inputPath, opsPath, outputPath")

-- ── Datatype coercion (mirrors build_roblox.luau so edits behave identically) ─
-- instanceMap is keyed by numeric ref; a {__type="Ref", id=N} value resolves to
-- an existing instance, same as build_roblox's id-based refs.
local instanceMap = {}

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
	MeshContent = true,
	TextureID = true,
	TextureId = true,
	TextureContent = true,
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

-- Returns nil on success, or an error string for the first property that failed.
local function applyProperties(instance, properties)
	if properties == nil then
		return nil
	end
	local firstError = nil
	for key, value in properties do
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
				if not ok and firstError == nil then
					firstError = "set " .. key .. ": " .. tostring(err)
				end
			end
		else
			local resolved = resolvePropertyValue(value)
			if resolved ~= nil then
				local ok, err = pcall(function()
					instance[key] = resolved
				end)
				if not ok and firstError == nil then
					firstError = "set " .. key .. ": " .. tostring(err)
				end
			end
		end
	end
	return firstError
end

-- ── Deserialize + build the ref map (identical pre-order DFS to analyze) ──────
local contents = fs.readFile(inputPath)
local roots = {}
local isPlace = target == "place"

-- Defensive deserialize: a real-world place/model may use properties/enums newer
-- than this Lune's reflection DB (lune issue #266). Surface a clear error rather
-- than a raw crash so the caller can tell the user the file can't be parsed yet.
local okDeser, derr = pcall(function()
	if isPlace then
		local game = roblox.deserializePlace(contents)
		table.insert(roots, game)
	else
		local instances = roblox.deserializeModel(contents)
		for _, inst in instances do
			table.insert(roots, inst)
		end
	end
end)
if not okDeser then
	error("apply_edits: failed to deserialize " .. target .. ": " .. tostring(derr))
end

local refCounter = 0
local topLevelRefs = {} -- topLevelRefs[i] = global pre-order ref of roots[i]

local function indexWalk(instance)
	refCounter += 1
	instanceMap[refCounter] = instance
	for _, child in instance:GetChildren() do
		indexWalk(child)
	end
end

for i, root in roots do
	-- The next ref indexWalk assigns is this root's ref (pre-order start).
	topLevelRefs[i] = refCounter + 1
	indexWalk(root)
end

-- ── Apply ops ────────────────────────────────────────────────────────────────
local opsDoc = serde.decode("json", fs.readFile(opsPath))
local ops = opsDoc.ops or opsDoc
local results = {}
local applied = 0
local failed = 0
local deletedRefs = {}

local function record(ok, opType, detail)
	if ok then
		applied += 1
	else
		failed += 1
	end
	table.insert(results, { op = opType, ok = ok, detail = detail })
end

for _, op in ops do
	local opType = op.op
	if opType == "setProperties" then
		local inst = op.ref and instanceMap[op.ref]
		if inst == nil then
			record(false, opType, "ref " .. tostring(op.ref) .. " not found")
		else
			local err = applyProperties(inst, op.properties)
			record(err == nil, opType, err)
		end
	elseif opType == "setScriptSource" then
		local inst = op.ref and instanceMap[op.ref]
		if inst == nil then
			record(false, opType, "ref " .. tostring(op.ref) .. " not found")
		elseif not inst:IsA("LuaSourceContainer") then
			record(false, opType, "ref " .. tostring(op.ref) .. " is " .. inst.ClassName .. ", not a script")
		else
			local ok, err = pcall(function() inst.Source = tostring(op.source or "") end)
			record(ok, opType, ok and nil or tostring(err))
		end
	elseif opType == "rename" then
		local inst = op.ref and instanceMap[op.ref]
		if inst == nil then
			record(false, opType, "ref " .. tostring(op.ref) .. " not found")
		else
			local ok, err = pcall(function() inst.Name = tostring(op.name or inst.Name) end)
			record(ok, opType, ok and nil or tostring(err))
		end
	elseif opType == "delete" then
		local inst = op.ref and instanceMap[op.ref]
		if inst == nil then
			record(false, opType, "ref " .. tostring(op.ref) .. " not found")
		else
			local ok, err = pcall(function() inst.Parent = nil end)
			if ok then
				deletedRefs[op.ref] = true
			end
			record(ok, opType, ok and nil or tostring(err))
		end
	elseif opType == "addInstance" then
		local ok, err = pcall(function()
			local created = roblox.Instance.new(op.className)
			created.Name = tostring(op.name or op.className)
			if op.properties then
				applyProperties(created, op.properties)
			end
			local parent = op.parentRef and instanceMap[op.parentRef]
			if parent ~= nil then
				created.Parent = parent
			elseif not isPlace then
				-- New top-level root in a model.
				table.insert(roots, created)
			else
				error("addInstance in a place requires parentRef")
			end
		end)
		record(ok, opType, ok and nil or tostring(err))
	else
		record(false, tostring(opType), "unknown op")
	end
end

-- ── Re-serialize ─────────────────────────────────────────────────────────────
local output
if isPlace then
	output = roblox.serializePlace(roots[1])
else
	-- Drop deleted top-level roots; keep order otherwise. Appended new roots
	-- (from addInstance) have no entry in topLevelRefs -> always kept.
	local liveRoots = {}
	for i, root in roots do
		local ref = topLevelRefs[i]
		if ref == nil or not deletedRefs[ref] then
			table.insert(liveRoots, root)
		end
	end
	output = roblox.serializeModel(liveRoots)
end

fs.writeFile(outputPath, output)

local summary = {
	applied = applied,
	failed = failed,
	total = applied + failed,
	results = results,
}

if resultsPath ~= nil then
	fs.writeFile(resultsPath, serde.encode("json", summary, true))
end

print(serde.encode("json", { applied = applied, failed = failed, total = applied + failed }, false))
