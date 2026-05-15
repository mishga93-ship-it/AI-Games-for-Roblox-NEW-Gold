local fs = require("@lune/fs")
local process = require("@lune/process")
local roblox = require("@lune/roblox")
local serde = require("@lune/serde")

local args = process.args
local inputPath = args[1]
local outputPath = args[2]

assert(inputPath ~= nil and outputPath ~= nil, "Expected inputPath and outputPath")

local data = serde.decode("json", fs.readFile(inputPath))

-- Map Roblox container name → Luau Instance class name
local function scriptTypeForPlacement(placement: string?): string
	if not placement then return "Script" end
	local p = string.lower(placement)
	if string.find(p, "starterplayerscripts") or string.find(p, "startergui") then
		return "LocalScript"
	end
	if string.find(p, "replicatedstorage") then
		return "ModuleScript"
	end
	return "Script"
end

-- Parse -- Placement: X from source header
local function parsePlacement(source: string): string?
	for line in string.gmatch(source, "[^\n]+") do
		local placement = string.match(line, "^%-%-%s*Placement:%s*(.+)$")
		if placement then
			return string.match(placement, "^%s*(.-)%s*$") -- trim
		end
		-- Stop scanning after the header block (first non-comment line)
		if not string.match(line, "^%-%-") and string.len(string.match(line, "^%s*(.-)%s*$") or "") > 0 then
			break
		end
	end
	return nil
end

-- Parse -- System: X from source header
local function parseSystemName(source: string): string?
	for line in string.gmatch(source, "[^\n]+") do
		local name = string.match(line, "^%-%-%s*System:%s*(.+)$")
		if name then
			return string.match(name, "^%s*(.-)%s*$")
		end
		if not string.match(line, "^%-%-") and string.len(string.match(line, "^%s*(.-)%s*$") or "") > 0 then
			break
		end
	end
	return nil
end

-- Split multi-file source by -- FILE: markers
local function splitFiles(source: string): { { name: string, source: string } }
	local files: { { name: string, source: string } } = {}
	local currentName: string? = nil
	local currentLines: { string } = {}

	for line in string.gmatch(source .. "\n", "([^\n]*)\n") do
		local fileName = string.match(line, "^%-%-%s*FILE:%s*(.+)$")
		if fileName then
			-- Save previous file if any
			if currentName then
				table.insert(files, { name = currentName, source = table.concat(currentLines, "\n") })
			end
			-- Strip .lua extension for instance name
			currentName = string.match(fileName, "^(.-)%.lua") or fileName
			currentName = string.match(currentName :: string, "^%s*(.-)%s*$")
			currentLines = {}
		else
			table.insert(currentLines, line)
		end
	end

	-- Save last file
	if currentName then
		table.insert(files, { name = currentName, source = table.concat(currentLines, "\n") })
	end

	return files
end

local modelName: string = data.name or "GeneratedScript"
local model = roblox.Instance.new("Model")
model.Name = modelName

-- Check for multi-file format (files array in JSON)
if type(data.files) == "table" then
	-- Multi-file: each entry has { name, scriptType, source }
	for _, fileData in ipairs(data.files) do
		local scriptType: string = fileData.scriptType or "Script"
		local instance = roblox.Instance.new(scriptType)
		instance.Name = fileData.name or "Script"
		instance.Source = fileData.source or ""
		instance.Parent = model
	end
else
	-- Single-file: parse placement from source header
	local source: string = data.source or ""

	-- Check for -- FILE: markers within single source
	local files = splitFiles(source)

	if #files > 1 then
		-- Multiple files embedded in one source string
		for _, f in ipairs(files) do
			-- Determine script type from each file's placement header
			local placement = parsePlacement(f.source)
			local scriptType = data.scriptType or scriptTypeForPlacement(placement)
			local instance = roblox.Instance.new(scriptType)
			instance.Name = f.name
			instance.Source = f.source
			instance.Parent = model
		end
	else
		-- True single file
		local placement = parsePlacement(source)
		local scriptType: string = data.scriptType or scriptTypeForPlacement(placement)
		local systemName = parseSystemName(source) or modelName

		local instance = roblox.Instance.new(scriptType)
		instance.Name = systemName
		instance.Source = source
		instance.Parent = model
	end
end

local output = roblox.serializeModel({ model })
fs.writeFile(outputPath, output)
