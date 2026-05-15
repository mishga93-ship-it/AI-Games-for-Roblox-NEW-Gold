--[[
	Test: CFrame schema formats through resolvePropertyValue logic.

	Verifies CFrame parsing in three formats:
	  1. New format: { __type="CFrame", position={x,y,z}, rotation=[9] }
	  2. New format without rotation: { __type="CFrame", position={x,y,z} }
	  3. Legacy flat format: { __type="CFrame", x=, y=, z= }
	  4. Exact TS cframe() output match

	Usage:  lune run test_cframe_build
]]

local roblox = require("@lune/roblox")
local process = require("@lune/process")

local _CFrame = (roblox :: any).CFrame or CFrame

local passed = 0
local failed = 0

local function approxEq(a: number, b: number, eps: number?): boolean
	return math.abs(a - b) < (eps or 0.001)
end

local function assertPos(label: string, cf: any, ex: number, ey: number, ez: number)
	local px, py, pz = cf.X, cf.Y, cf.Z
	if approxEq(px, ex) and approxEq(py, ey) and approxEq(pz, ez) then
		passed += 1
		print(`  PASS [{label}] position ({px},{py},{pz}) == expected ({ex},{ey},{ez})`)
	else
		failed += 1
		print(`  FAIL [{label}] position ({px},{py},{pz}) ~= expected ({ex},{ey},{ez})`)
	end
end

local function assertRotRow(label: string, cf: any, row: number, e1: number, e2: number, e3: number)
	local components = { cf:GetComponents() }
	local idx = 3 + (row - 1) * 3
	local r1, r2, r3 = components[idx + 1], components[idx + 2], components[idx + 3]
	if approxEq(r1, e1) and approxEq(r2, e2) and approxEq(r3, e3) then
		passed += 1
		print(`  PASS [{label}] rotation row {row} ({r1},{r2},{r3}) == expected ({e1},{e2},{e3})`)
	else
		failed += 1
		print(`  FAIL [{label}] rotation row {row} ({r1},{r2},{r3}) ~= expected ({e1},{e2},{e3})`)
	end
end

-- Mirror of resolvePropertyValue from build_roblox.luau (CFrame branch only)
local function resolveCFrame(value: any): any
	if type(value) ~= "table" or value.__type ~= "CFrame" then
		return nil
	end
	local pos = value.position or value
	local x = pos.x or 0
	local y = pos.y or 0
	local z = pos.z or 0
	local rot = value.rotation
	if type(rot) == "table" and #rot == 9 then
		return _CFrame.new(
			x, y, z,
			rot[1], rot[2], rot[3],
			rot[4], rot[5], rot[6],
			rot[7], rot[8], rot[9]
		)
	end
	return _CFrame.new(x, y, z)
end

-- Test 1: position + rotation (canonical TS format)
print("\n=== Test 1: CFrame with position + rotation (new format) ===")
do
	local cf = resolveCFrame({
		__type = "CFrame",
		position = { x = 10, y = 20, z = 30 },
		rotation = { 0, 0, 1, 1, 0, 0, 0, 1, 0 },
	})
	assert(cf ~= nil, "resolveCFrame returned nil for format 1")
	assertPos("format1", cf, 10, 20, 30)
	assertRotRow("format1", cf, 1, 0, 0, 1)
	assertRotRow("format1", cf, 2, 1, 0, 0)
	assertRotRow("format1", cf, 3, 0, 1, 0)
end

-- Test 2: position without rotation (identity rotation expected)
print("\n=== Test 2: CFrame with position only (no rotation) ===")
do
	local cf = resolveCFrame({
		__type = "CFrame",
		position = { x = -5, y = 100, z = 0.5 },
	})
	assert(cf ~= nil, "resolveCFrame returned nil for format 2")
	assertPos("format2", cf, -5, 100, 0.5)
	assertRotRow("format2-identity", cf, 1, 1, 0, 0)
	assertRotRow("format2-identity", cf, 2, 0, 1, 0)
	assertRotRow("format2-identity", cf, 3, 0, 0, 1)
end

-- Test 3: legacy flat { x, y, z } (backward compatibility)
print("\n=== Test 3: CFrame with flat x/y/z (legacy format) ===")
do
	local cf = resolveCFrame({
		__type = "CFrame",
		x = 42,
		y = -7,
		z = 99,
	})
	assert(cf ~= nil, "resolveCFrame returned nil for format 3")
	assertPos("format3-legacy", cf, 42, -7, 99)
	assertRotRow("format3-legacy-identity", cf, 1, 1, 0, 0)
	assertRotRow("format3-legacy-identity", cf, 2, 0, 1, 0)
	assertRotRow("format3-legacy-identity", cf, 3, 0, 0, 1)
end

-- Test 4: exact TS cframe() output
print("\n=== Test 4: Exact TS cframe() output format ===")
do
	local cf = resolveCFrame({
		__type = "CFrame",
		position = { x = 0, y = 3, z = 0 },
		rotation = { 1, 0, 0, 0, 1, 0, 0, 0, 1 },
	})
	assert(cf ~= nil, "resolveCFrame returned nil for format 4")
	assertPos("format4-ts", cf, 0, 3, 0)
	assertRotRow("format4-ts-identity", cf, 1, 1, 0, 0)
	assertRotRow("format4-ts-identity", cf, 2, 0, 1, 0)
	assertRotRow("format4-ts-identity", cf, 3, 0, 0, 1)
end

-- Test 5: verify that the OLD broken code would fail (regression guard)
-- Old code: _CFrame.new(value.x, value.y, value.z) on new format -> (0,0,0)
print("\n=== Test 5: Regression — new format must NOT resolve to origin ===")
do
	local cf = resolveCFrame({
		__type = "CFrame",
		position = { x = 7, y = 14, z = 21 },
		rotation = { 1, 0, 0, 0, 1, 0, 0, 0, 1 },
	})
	assert(cf ~= nil, "resolveCFrame returned nil for format 5")
	local isOrigin = approxEq(cf.X, 0) and approxEq(cf.Y, 0) and approxEq(cf.Z, 0)
	if not isOrigin then
		passed += 1
		print(`  PASS [regression] CFrame is NOT at origin: ({cf.X},{cf.Y},{cf.Z})`)
	else
		failed += 1
		print(`  FAIL [regression] CFrame is at origin — old bug still present!`)
	end
	assertPos("regression-exact", cf, 7, 14, 21)
end

print(`\n=============================`)
print(`Results: {passed} passed, {failed} failed`)
print(`=============================`)

if failed > 0 then
	process.exit(1)
end
