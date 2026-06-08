local fs = require("@lune/fs")
local process = require("@lune/process")
local roblox = require("@lune/roblox")
local serde = require("@lune/serde")

local args = process.args
local inputPath = args[1]
local outputPath = args[2]
local target = args[3] or "place"
-- Session 427: "deep" turns on the rich, edit-ready dump (stable refs +
-- properties in applyProperties() JSON convention + script sources).
-- Session 428: "outline" = a cheap whole-tree map (slim fields, depth-capped)
-- for choosing an edit scope on a large place; deep mode gained an optional
-- `scope` so a big .rbxl can be dumped one subtree at a time (refs stay GLOBAL
-- pre-order so they remain valid for apply_edits over the whole place).
-- Default "summary" keeps the byte-for-byte legacy output that the existing
-- /analyze-roblox consumer (robloxWorker.maybeAnalyzeRobloxAsset) depends on.
local mode = args[4] or "summary"
local scope = args[5] or "" -- deep only: "" | "ref:N" | "path:/Workspace/Town"
local nodeBudget = tonumber(args[6]) or 2000
local sourceBudget = tonumber(args[7]) or 200000
local depthCap = tonumber(args[8]) or 6 -- outline only

assert(inputPath ~= nil and outputPath ~= nil, "Expected inputPath and outputPath")

local deep = mode == "deep"
local outlineMode = mode == "outline"

-- Parse scope spec (deep only).
local scopeKind = nil
local scopeRef = nil
local scopePath = nil
if scope ~= "" then
	local k, v = string.match(scope, "^(%a+):(.+)$")
	if k == "ref" then
		scopeKind = "ref"
		scopeRef = tonumber(v)
	elseif k == "path" then
		scopeKind = "path"
		scopePath = v
	end
end

local contents = fs.readFile(inputPath)

-- ── Legacy summary state (unchanged shape) ──────────────────────────────────
local nodes = {}
local total = 0
local classCounts = {}

-- ── Deep / outline state ─────────────────────────────────────────────────────
local tree = {}
local outline = {}
local refCounter = 0
local sourceUsed = 0
local truncatedTree = false
local truncatedSource = false
local truncatedOutline = false
local scopeMatched = 0

-- Property read helpers: emit values in the SAME JSON convention that
-- build_roblox.luau / apply_edits.luau resolvePropertyValue() consumes, so a
-- prop read here can be fed straight back as a setProperties op.
local function vec3(v)
	return { __type = "Vector3", x = v.X, y = v.Y, z = v.Z }
end

local function color3(c)
	return { __type = "Color3", r = c.R, g = c.G, b = c.B }
end

local function enumValue(enumType, v)
	local s = tostring(v)
	local name = string.match(s, "([^.]+)$") or s
	return { __type = "Enum", enumType = enumType, enumName = name }
end

local function cframeValue(cf)
	local entry = { __type = "CFrame", position = { x = cf.Position.X, y = cf.Position.Y, z = cf.Position.Z } }
	local ok, comps = pcall(function()
		return { cf:GetComponents() }
	end)
	if ok and type(comps) == "table" and #comps >= 12 then
		entry.rotation = {
			comps[4], comps[5], comps[6],
			comps[7], comps[8], comps[9],
			comps[10], comps[11], comps[12],
		}
	end
	return entry
end

local function readProps(instance)
	local props = {}

	if instance:IsA("BasePart") then
		pcall(function() props.Size = vec3(instance.Size) end)
		pcall(function() props.CFrame = cframeValue(instance.CFrame) end)
		pcall(function() props.Color = color3(instance.Color) end)
		pcall(function() props.Material = enumValue("Material", instance.Material) end)
		pcall(function() props.Transparency = instance.Transparency end)
		pcall(function() props.Reflectance = instance.Reflectance end)
		pcall(function() props.Anchored = instance.Anchored end)
		pcall(function() props.CanCollide = instance.CanCollide end)
		if instance:IsA("Part") then
			pcall(function() props.Shape = enumValue("PartType", instance.Shape) end)
		end
	end

	if instance:IsA("MeshPart") then
		pcall(function() if instance.MeshId and instance.MeshId ~= "" then props.MeshId = instance.MeshId end end)
		pcall(function() if instance.TextureID and instance.TextureID ~= "" then props.TextureID = instance.TextureID end end)
	end
	if instance:IsA("Decal") or instance:IsA("Texture") then
		pcall(function() if instance.Texture and instance.Texture ~= "" then props.Texture = instance.Texture end end)
	end
	if instance.ClassName == "ImageLabel" or instance.ClassName == "ImageButton" then
		pcall(function() if instance.Image and instance.Image ~= "" then props.Image = instance.Image end end)
	end
	if instance:IsA("Sound") then
		pcall(function() if instance.SoundId and instance.SoundId ~= "" then props.SoundId = instance.SoundId end end)
	end
	if instance.ClassName == "TextLabel" or instance.ClassName == "TextButton" or instance.ClassName == "TextBox" then
		pcall(function() props.Text = instance.Text end)
	end

	return props
end

-- Single pre-order DFS. Refs are assigned for EVERY instance regardless of mode
-- or scope, so a `ref` is the same global index in analyze, outline and
-- apply_edits. `inScopeAncestor` carries deep-scope membership down the subtree.
local function walk(instance, prefix, parentRef, depth, inScopeAncestor)
	total += 1
	refCounter += 1
	local myRef = refCounter
	classCounts[instance.ClassName] = (classCounts[instance.ClassName] or 0) + 1

	local nodePath = prefix .. "/" .. instance.Name

	-- Legacy summary node (cap 200 — unchanged behavior).
	if #nodes < 200 then
		table.insert(nodes, {
			name = instance.Name,
			className = instance.ClassName,
			path = nodePath,
			childCount = #instance:GetChildren(),
		})
	end

	-- Deep-scope membership.
	local inScope
	if scopeKind == nil then
		inScope = true
	elseif inScopeAncestor then
		inScope = true
	elseif scopeKind == "ref" then
		inScope = myRef == scopeRef
	elseif scopeKind == "path" then
		inScope = nodePath == scopePath or string.sub(nodePath, 1, #scopePath + 1) == scopePath .. "/"
	else
		inScope = true
	end

	if outlineMode then
		if depth <= depthCap then
			if #outline < nodeBudget then
				table.insert(outline, {
					ref = myRef,
					parentRef = parentRef,
					name = instance.Name,
					className = instance.ClassName,
					path = nodePath,
					childCount = #instance:GetChildren(),
				})
			else
				truncatedOutline = true
			end
		end
	elseif deep and inScope then
		scopeMatched += 1
		if not truncatedTree then
			if #tree >= nodeBudget then
				truncatedTree = true
			else
				local entry = {
					ref = myRef,
					parentRef = parentRef,
					name = instance.Name,
					className = instance.ClassName,
					path = nodePath,
					childCount = #instance:GetChildren(),
					props = readProps(instance),
				}
				if instance:IsA("LuaSourceContainer") then
					local ok, src = pcall(function() return instance.Source end)
					if ok and type(src) == "string" then
						if sourceUsed + #src <= sourceBudget then
							entry.source = src
							sourceUsed += #src
						else
							entry.sourceTruncated = true
							truncatedSource = true
						end
					end
				end
				table.insert(tree, entry)
			end
		end
	end

	for _, child in instance:GetChildren() do
		walk(child, nodePath, myRef, depth + 1, inScope)
	end
end

-- Defensive deserialize: a real-world place may use properties/enums newer than
-- this Lune's reflection DB (lune issue #266). Surface a clear error instead of
-- a raw crash so the caller can tell the user "can't parse this file yet".
local okDeser, derr = pcall(function()
	if target == "model" then
		local instances = roblox.deserializeModel(contents)
		for _, instance in instances do
			walk(instance, "", nil, 0, false)
		end
	else
		local game = roblox.deserializePlace(contents)
		walk(game, "", nil, 0, false)
	end
end)
if not okDeser then
	error("analyze: failed to deserialize " .. target .. ": " .. tostring(derr))
end

local summary = {
	target = target,
	totalInstances = total,
	nodes = nodes,
	classCounts = classCounts,
	rigSummary = {
		hasHumanoid = (classCounts["Humanoid"] or 0) > 0,
		motor6DCount = classCounts["Motor6D"] or 0,
		meshPartCount = classCounts["MeshPart"] or 0,
		partCount = classCounts["Part"] or 0,
	},
}

if deep then
	summary.mode = "deep"
	summary.tree = tree
	summary.truncated = {
		tree = truncatedTree,
		source = truncatedSource,
	}
	if scopeKind ~= nil then
		summary.scope = { kind = scopeKind, value = scope, matched = scopeMatched }
	end
elseif outlineMode then
	summary.mode = "outline"
	summary.outline = outline
	summary.depthCap = depthCap
	summary.truncated = { outline = truncatedOutline }
end

fs.writeFile(outputPath, serde.encode("json", summary, true))
