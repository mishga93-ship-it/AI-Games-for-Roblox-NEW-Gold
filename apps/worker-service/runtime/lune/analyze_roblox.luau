local fs = require("@lune/fs")
local process = require("@lune/process")
local roblox = require("@lune/roblox")
local serde = require("@lune/serde")

local args = process.args
local inputPath = args[1]
local outputPath = args[2]
local target = args[3] or "place"
-- Session 427: optional 4th arg "deep" turns on the rich, edit-ready dump
-- (stable refs + properties in applyProperties() JSON convention + script
-- sources). Default "summary" keeps the byte-for-byte legacy output that the
-- existing /analyze-roblox consumer (robloxWorker.maybeAnalyzeRobloxAsset)
-- depends on. New keys are ADDITIVE in deep mode — summary mode is untouched.
local mode = args[4] or "summary"
local nodeBudget = tonumber(args[5]) or 2000
local sourceBudget = tonumber(args[6]) or 200000

assert(inputPath ~= nil and outputPath ~= nil, "Expected inputPath and outputPath")

local deep = mode == "deep"

local contents = fs.readFile(inputPath)

-- ── Legacy summary state (unchanged shape) ──────────────────────────────────
local nodes = {}
local total = 0
local classCounts = {}

-- ── Deep state ──────────────────────────────────────────────────────────────
local tree = {}
local refCounter = 0
local sourceUsed = 0
local truncatedTree = false
local truncatedSource = false

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
	-- tostring(Enum.Material.Plastic) -> "Enum.Material.Plastic"
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
		-- GetComponents -> x,y,z, R00,R01,R02, R10,R11,R12, R20,R21,R22
		entry.rotation = {
			comps[4], comps[5], comps[6],
			comps[7], comps[8], comps[9],
			comps[10], comps[11], comps[12],
		}
	end
	return entry
end

-- Pull a curated, edit-relevant property set. Everything is wrapped in pcall
-- because property availability varies by ClassName.
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

	-- Content-bearing props are plain strings (applyProperties CONTENT_PROPERTIES).
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

-- Single pre-order DFS. Used for BOTH the legacy summary nodes (first 200) and
-- the deep tree (with refs/props/source). apply_edits.luau walks in the EXACT
-- same order so a `ref` here addresses the same instance there.
local function walk(instance, prefix, parentRef)
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

	-- Deep tree entry.
	if deep and not truncatedTree then
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
			-- Script source dump under a global char budget.
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

	for _, child in instance:GetChildren() do
		walk(child, nodePath, myRef)
	end
end

if target == "model" then
	local instances = roblox.deserializeModel(contents)
	for _, instance in instances do
		walk(instance, "", nil)
	end
else
	local game = roblox.deserializePlace(contents)
	walk(game, "", nil)
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
end

fs.writeFile(outputPath, serde.encode("json", summary, true))
