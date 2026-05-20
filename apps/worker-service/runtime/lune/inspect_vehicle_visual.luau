local fs = require("@lune/fs")
local process = require("@lune/process")
local roblox = require("@lune/roblox")
local serde = require("@lune/serde")

local args = process.args
local inputPath = args[1]
local outputPath = args[2]

assert(inputPath ~= nil and outputPath ~= nil, "Expected inputPath and outputPath")

local contents = fs.readFile(inputPath)
local instances = roblox.deserializeModel(contents)

local parts = {}

local function walk(instance)
	if instance:IsA("BasePart") then
		local entry = {
			name = instance.Name,
			className = instance.ClassName,
			shape = (instance:IsA("Part") and tostring(instance.Shape)) or "n/a",
			material = tostring(instance.Material),
			transparency = instance.Transparency,
			size = { x = instance.Size.X, y = instance.Size.Y, z = instance.Size.Z },
		}
		local okPos, cf = pcall(function() return instance.CFrame end)
		if okPos and cf then
			entry.position = { x = cf.Position.X, y = cf.Position.Y, z = cf.Position.Z }
		end
		local ok, color = pcall(function() return instance.Color end)
		if ok and color then
			entry.color = { r = color.R, g = color.G, b = color.B }
		end
		table.insert(parts, entry)
	end
	for _, child in instance:GetChildren() do
		walk(child)
	end
end

for _, instance in instances do
	walk(instance)
end

local out = {
	inputPath = inputPath,
	partCount = #parts,
	parts = parts,
}

fs.writeFile(outputPath, serde.encode("json", out, true))
print(string.format("Inspected %d parts -> %s", #parts, outputPath))
