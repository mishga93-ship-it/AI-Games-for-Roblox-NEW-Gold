local fs = require("@lune/fs")
local process = require("@lune/process")
local roblox = require("@lune/roblox")
local serde = require("@lune/serde")

local args = process.args
local inputPath = args[1]
local outputPath = args[2]
local target = args[3] or "place"

assert(inputPath ~= nil and outputPath ~= nil, "Expected inputPath and outputPath")

local contents = fs.readFile(inputPath)
local nodes = {}
local total = 0
local classCounts = {}

local function walk(instance, prefix)
	total += 1
	classCounts[instance.ClassName] = (classCounts[instance.ClassName] or 0) + 1
	if #nodes < 200 then
		table.insert(nodes, {
			name = instance.Name,
			className = instance.ClassName,
			path = prefix .. "/" .. instance.Name,
			childCount = #instance:GetChildren(),
		})
	end
	for _, child in instance:GetChildren() do
		walk(child, prefix .. "/" .. instance.Name)
	end
end

if target == "model" then
	local instances = roblox.deserializeModel(contents)
	for _, instance in instances do
		walk(instance, "")
	end
else
	local game = roblox.deserializePlace(contents)
	walk(game, "")
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

fs.writeFile(outputPath, serde.encode("json", summary, true))
