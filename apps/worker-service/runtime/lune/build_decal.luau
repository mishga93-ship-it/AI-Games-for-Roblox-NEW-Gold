local fs = require("@lune/fs")
local process = require("@lune/process")
local roblox = require("@lune/roblox")
local serde = require("@lune/serde")

local args = process.args
local inputPath = args[1]
local outputPath = args[2]

assert(inputPath ~= nil and outputPath ~= nil, "Expected inputPath and outputPath")

local data = serde.decode("json", fs.readFile(inputPath))

local decalName = data.name or "AI Decal"
local textureId = data.textureId or ""
local tiling = data.tiling == true
local surface = data.surface or "wall"
local w = tonumber(data.widthStuds) or 4
local d = tonumber(data.depthStuds) or 4

local model = roblox.Instance.new("Model")
model.Name = decalName

local part = roblox.Instance.new("Part")
part.Name = "DecalPart"

-- floor/ceiling/rug/carpet → flat slab (Top = w×d), wall/sign → vertical panel (Front = w×d)
local isFlat = surface == "floor" or surface == "ceiling" or surface == "rug" or surface == "carpet"
if isFlat then
	pcall(function() part.Size = Vector3.new(w, 0.2, d) end)
else
	pcall(function() part.Size = Vector3.new(w, d, 0.2) end)
end
pcall(function() part.Anchored = true end)
pcall(function() part.CanCollide = true end)
part.Parent = model

-- Enum is NOT a global in Lune — access via roblox module (same pattern as build_roblox.luau:17)
local _Enum = (roblox :: any).Enum

local FACE_ENUMS = {
	Front = _Enum.NormalId.Front,
	Back = _Enum.NormalId.Back,
	Top = _Enum.NormalId.Top,
	Bottom = _Enum.NormalId.Bottom,
	Left = _Enum.NormalId.Left,
	Right = _Enum.NormalId.Right,
}

if tiling then
	-- Texture tiles/repeats on all 6 faces
	for faceName, faceId in FACE_ENUMS do
		local tex = roblox.Instance.new("Texture")
		tex.Name = "Texture_" .. faceName
		pcall(function() tex.Face = faceId end)
		if textureId ~= "" then
			pcall(function() tex.Texture = textureId end)
		end
		pcall(function() tex.StudsPerTileU = w end)
		pcall(function() tex.StudsPerTileV = d end)
		tex.Parent = part
	end
else
	-- Decal stretches on all 6 faces
	for faceName, faceId in FACE_ENUMS do
		local decal = roblox.Instance.new("Decal")
		decal.Name = "Decal_" .. faceName
		local ok, err = pcall(function() decal.Face = faceId end)
		if not ok then
			print("WARN: Face=" .. faceName .. " failed: " .. tostring(err))
		end
		if textureId ~= "" then
			pcall(function() decal.Texture = textureId end)
		end
		decal.Parent = part
	end
end

local output = roblox.serializeModel({ model })
fs.writeFile(outputPath, output)
