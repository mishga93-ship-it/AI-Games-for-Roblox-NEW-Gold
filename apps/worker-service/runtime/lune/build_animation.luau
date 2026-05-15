local fs = require("@lune/fs")
local process = require("@lune/process")
local roblox = require("@lune/roblox")
local serde = require("@lune/serde")

local _CFrame = (roblox :: any).CFrame or CFrame

local args = process.args
local inputPath = args[1]
local outputPath = args[2]

assert(inputPath ~= nil and outputPath ~= nil, "Expected inputPath and outputPath")

local data = serde.decode("json", fs.readFile(inputPath))

local animName = data.name or "GeneratedAnimation"
local looped = data.looped
if looped == nil then
	looped = true
end
local priority = data.priority or "Action"

local priorityMap = {
	Core = 0,
	Idle = 1,
	Movement = 2,
	Action = 3,
}
local priorityValue = priorityMap[priority] or 3

local keyframeSequence = roblox.Instance.new("KeyframeSequence")
keyframeSequence.Name = animName
pcall(function()
	keyframeSequence.Loop = looped
end)
pcall(function()
	keyframeSequence.Priority = priorityValue
end)

local function makeCFrame(pose)
	if not pose or not pose.cframe then
		return _CFrame.new(0, 0, 0)
	end
	local cf = pose.cframe
	local x = cf.x or 0
	local y = cf.y or 0
	local z = cf.z or 0
	local rx = cf.rx or 0
	local ry = cf.ry or 0
	local rz = cf.rz or 0

	-- Build CFrame from position + Euler angles (XYZ order)
	local cosX = math.cos(rx)
	local sinX = math.sin(rx)
	local cosY = math.cos(ry)
	local sinY = math.sin(ry)
	local cosZ = math.cos(rz)
	local sinZ = math.sin(rz)

	-- Rotation matrix: Rz * Ry * Rx
	local r00 = cosY * cosZ
	local r01 = sinX * sinY * cosZ - cosX * sinZ
	local r02 = cosX * sinY * cosZ + sinX * sinZ
	local r10 = cosY * sinZ
	local r11 = sinX * sinY * sinZ + cosX * cosZ
	local r12 = cosX * sinY * sinZ - sinX * cosZ
	local r20 = -sinY
	local r21 = sinX * cosY
	local r22 = cosX * cosY

	return _CFrame.new(
		x, y, z,
		r00, r01, r02,
		r10, r11, r12,
		r20, r21, r22
	)
end

local keyframes = data.keyframes or {}

for _, kfData in keyframes do
	local keyframe = roblox.Instance.new("Keyframe")
	keyframe.Name = string.format("Keyframe_%.3f", kfData.time or 0)
	pcall(function()
		keyframe.Time = kfData.time or 0
	end)

	-- Root pose for the character hierarchy
	local rootPose = roblox.Instance.new("Pose")
	rootPose.Name = "HumanoidRootPart"
	pcall(function()
		rootPose.CFrame = _CFrame.new(0, 0, 0)
	end)

	local poses = kfData.poses or {}
	for _, poseData in poses do
		local pose = roblox.Instance.new("Pose")
		pose.Name = poseData.joint or "Unknown"
		pcall(function()
			pose.CFrame = makeCFrame(poseData)
		end)
		pose.Parent = rootPose
	end

	rootPose.Parent = keyframe
	keyframe.Parent = keyframeSequence
end

local model = roblox.Instance.new("Model")
model.Name = animName

keyframeSequence.Parent = model

-- Server Script: injects a LocalScript into StarterCharacterScripts so that
-- RegisterActiveKeyframeSequence (client-only API) runs on the client side.
local playScript = roblox.Instance.new("Script")
playScript.Name = "PlayAnimation"

-- Build inner LocalScript source with model/anim names baked in
local innerSource = 'local KSProvider = game:GetService("KeyframeSequenceProvider")\n'
	.. 'local model = workspace:WaitForChild("' .. animName .. '", 30)\n'
	.. "if not model then return end\n"
	.. 'local ks = model:FindFirstChildOfClass("KeyframeSequence")\n'
	.. "if not ks then return end\n"
	.. "local contentId = KSProvider:RegisterActiveKeyframeSequence(ks)\n"
	.. 'local anim = Instance.new("Animation")\n'
	.. "anim.AnimationId = contentId\n"
	.. 'local humanoid = script.Parent:WaitForChild("Humanoid", 5)\n'
	.. "if humanoid then\n"
	.. '\thumanoid:AddEmote("' .. animName .. '", anim)\n'
	.. "end"

-- Build outer server Script source
playScript.Source = '-- Drag this model into Workspace BEFORE pressing Play.\n'
	.. "-- This Script creates a LocalScript in StarterCharacterScripts automatically.\n"
	.. 'local ks = script.Parent:FindFirstChildOfClass("KeyframeSequence")\n'
	.. "if not ks then return end\n"
	.. "local animName = ks.Name\n"
	.. 'local StarterPlayer = game:GetService("StarterPlayer")\n'
	.. 'local StarterCharacterScripts = StarterPlayer:FindFirstChild("StarterCharacterScripts")\n'
	.. "if not StarterCharacterScripts then return end\n"
	.. 'if StarterCharacterScripts:FindFirstChild("PlayEmote_" .. animName) then return end\n'
	.. 'local ls = Instance.new("LocalScript")\n'
	.. 'ls.Name = "PlayEmote_" .. animName\n'
	.. "ls.Source = " .. string.format("%q", innerSource) .. "\n"
	.. "ls.Parent = StarterCharacterScripts"
playScript.Parent = model

local output = roblox.serializeModel({ model })
fs.writeFile(outputPath, output)
