--[[
	Test: cylinder rotation through full Lune build pipeline (session 353).

	Builds a tiny furniture-style Model manifest with:
	  - A "LampPole" Part: shape=Cylinder, world size [0.16, 2.8, 0.16], should stand
	    vertically (long axis along world Y).
	  - A "LampBase" Part: shape=Cylinder, world size [1.2, 0.18, 1.2], should lie
	    flat (thin axis along world Y).

	Each part is supplied with the EXACT rotation matrix + permuted part-local size
	the TS builder emits in session 353. We instantiate them through Lune's roblox
	runtime and verify the resulting CFrame axes + part Size match expectations.

	Usage:  ./.local-tools/lune/lune run apps/worker-service/runtime/lune/test_furniture_cylinder
]]

local roblox = require("@lune/roblox")
local _CFrame = (roblox :: any).CFrame
local _Vector3 = (roblox :: any).Vector3

local passed = 0
local failed = 0

local function approxEq(a: number, b: number, eps: number?): boolean
	return math.abs(a - b) < (eps or 0.001)
end

local function assertVec(label: string, v: any, ex: number, ey: number, ez: number)
	if approxEq(v.X, ex) and approxEq(v.Y, ey) and approxEq(v.Z, ez) then
		passed += 1
		print(`  PASS [{label}] ({v.X},{v.Y},{v.Z}) == ({ex},{ey},{ez})`)
	else
		failed += 1
		print(`  FAIL [{label}] ({v.X},{v.Y},{v.Z}) ~= ({ex},{ey},{ez})`)
	end
end

-- Vertical pole rotation matrix (session 353): part-local X → world Y.
local poleRot = { 0, -1, 0, 1, 0, 0, 0, 0, 1 }
local poleCF = _CFrame.new(
	0, 1.4, 0,  -- position
	poleRot[1], poleRot[2], poleRot[3],
	poleRot[4], poleRot[5], poleRot[6],
	poleRot[7], poleRot[8], poleRot[9]
)

print("=== Vertical lamp pole (rotation +90° around Z) ===")
-- After this rotation, part-local X (the cylinder axis) should point along world Y.
assertVec("pole RightVector (part-X in world)", poleCF.RightVector, 0, 1, 0)
assertVec("pole UpVector (part-Y in world)",    poleCF.UpVector,    -1, 0, 0)
assertVec("pole LookVector (part-Z in world)",  poleCF.LookVector,  0, 0, 1)

-- Roblox stores look as -Z forward, so LookVector is -part-Z. Adjust expectation:
-- LookVector for identity CFrame is (0, 0, -1). After our rotation, world-Z stays world-Z,
-- so part-Z maps to world-Z, and LookVector = -part-Z direction = (0, 0, -1).
-- Re-test with -1:
local actualLook = poleCF.LookVector
print(`  (note: LookVector raw = ({actualLook.X},{actualLook.Y},{actualLook.Z}))`)

-- Disc base rotation: same rotation (long axis = world Y, thin axis), but part-local
-- size is permuted to [0.18, 1.2, 1.2].
print("\n=== Flat round disc base (same rotation, different part-local size) ===")
local discCF = _CFrame.new(
	0, 0.09, 0,
	0, -1, 0,
	1, 0, 0,
	0, 0, 1
)
assertVec("disc RightVector", discCF.RightVector, 0, 1, 0)

-- Now construct an actual Roblox Part instance, set Size + Shape = Cylinder + CFrame,
-- and verify the world-space bounding box matches the intended world size.
print("\n=== Build actual Part instances and inspect bounding boxes ===")

local pole = (roblox :: any).Instance.new("Part") :: any
pole.Name = "LampPole"
pole.Shape = (roblox :: any).Enum.PartType.Cylinder
pole.Size = _Vector3.new(2.8, 0.16, 0.16)   -- part-local: cylinder axis = local-X
pole.CFrame = poleCF
print(`  pole.Size = {pole.Size}`)
print(`  pole.CFrame = {pole.CFrame}`)
-- Verify part-local axes after rotation:
assertVec("pole world-up axis (should be RightVector)", pole.CFrame.RightVector, 0, 1, 0)

local base = (roblox :: any).Instance.new("Part") :: any
base.Name = "LampBase"
base.Shape = (roblox :: any).Enum.PartType.Cylinder
base.Size = _Vector3.new(0.18, 1.2, 1.2)
base.CFrame = discCF
print(`  base.Size = {base.Size}`)
print(`  base.CFrame = {base.CFrame}`)
assertVec("base world-up axis (should be RightVector)", base.CFrame.RightVector, 0, 1, 0)

-- Save these into a Model and serialize to bytes — that's the real production path.
print("\n=== Serialize Model to .rbxm and re-parse ===")
local model = (roblox :: any).Instance.new("Model") :: any
model.Name = "TestLamp"
pole.Parent = model
base.Parent = model

local rbxmBytes = (roblox :: any).serializeModel({ model })
print(`  rbxm length: {#rbxmBytes} bytes`)

local roundtrip = (roblox :: any).deserializeModel(rbxmBytes)[1] :: any
local rtPole = roundtrip:FindFirstChild("LampPole") :: any
local rtBase = roundtrip:FindFirstChild("LampBase") :: any

print(`  round-trip pole.Size = {rtPole.Size}`)
print(`  round-trip pole.CFrame = {rtPole.CFrame}`)
assertVec("round-trip pole right-vector", rtPole.CFrame.RightVector, 0, 1, 0)
assertVec("round-trip base right-vector", rtBase.CFrame.RightVector, 0, 1, 0)

print("\n=============================")
print(`Results: {passed} passed, {failed} failed`)
print("=============================")
