-- Session 425 — Luau syntax check for emitted brainrot vehicle Lua.
-- Usage: lune run scripts/smoke-brainrot.luau <path-to-luau-file>
-- Prints LUAU_OK on success, LUAU_ERR: <msg> + exit 1 on syntax error.
local luau = require("@lune/luau")
local fs = require("@lune/fs")
local process = require("@lune/process")

local path = process.args[1]
if not path then
	print("LUAU_ERR: no file path argument")
	process.exit(1)
end

local src = fs.readFile(path)
local ok, err = pcall(function()
	return luau.compile(src)
end)

if ok then
	print("LUAU_OK")
else
	print("LUAU_ERR: " .. tostring(err))
	process.exit(1)
end
