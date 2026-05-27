-- Session 383: extract VISIBLE BODY parts from a vehicle template .rbxm.
-- Lives in worker-service/runtime/lune so it can be invoked manually to
-- pre-bundle parts JSON next to each template, or run from a Node helper.
--
-- Args:
--   inputPath        — path to template.rbxm
--   variantName      — preferred Model variant ("Sedan (white)" / "DrivableTank" / ...)
--   outputPath       — path to write JSON
--   maxParts         — optional cap on returned parts (default 80)
--
-- Output JSON shape (compatible with apps/ios .../FurnitureSpecPayload):
--   {
--     "variantName": "Sedan (white)",
--     "parts": [
--       { "name": "roof_hood", "kind": "Part", "shape": "Block",
--         "position": [x, y, z], "size": [x, y, z],
--         "color": "#F3F3F3", "transparency": 0, "material": "Plastic" },
--       ...
--     ]
--   }

local fs = require("@lune/fs")
local process = require("@lune/process")
local roblox = require("@lune/roblox")
local serde = require("@lune/serde")

local args = process.args
local inputPath = args[1]
local variantName = args[2]
local outputPath = args[3]
local maxParts = tonumber(args[4]) or 80

assert(inputPath ~= nil, "inputPath required")
assert(variantName ~= nil, "variantName required")
assert(outputPath ~= nil, "outputPath required")

local contents = fs.readFile(inputPath)
local instances = roblox.deserializeModel(contents)

-- Step 1: find the root Model whose Name == variantName (case-insensitive).
-- Templates with no variants (Boat "Model", Tank "DrivableTank") still match.
local root = nil
local variantLower = string.lower(variantName)
for _, inst in instances do
  if inst:IsA("Model") then
    if string.lower(inst.Name) == variantLower then
      root = inst
      break
    end
  end
end

-- Fallback: any top-level Model (when variantName doesn't match anything).
if root == nil then
  for _, inst in instances do
    if inst:IsA("Model") then root = inst; break end
  end
end

assert(root ~= nil, "No Model found in " .. inputPath)

-- Step 2: prefer the inner "Body" sub-model when present (Sedan/SUV/Truck
-- pack their body parts under Model/Body). Without this we'd pick up
-- 100+ Chassis/Suspension/Wheel parts that don't belong in a preview.
local bodyContainer = root
for _, child in root:GetChildren() do
  if child:IsA("Model") and string.lower(child.Name) == "body" then
    bodyContainer = child
    break
  end
end

-- Step 3: walk BasePart descendants, skip transparent/zero-volume parts.
local function rgbToHex(c)
  local r = math.floor(c.R * 255 + 0.5)
  local g = math.floor(c.G * 255 + 0.5)
  local b = math.floor(c.B * 255 + 0.5)
  return string.format("#%02X%02X%02X", r, g, b)
end

local parts = {}
for _, d in bodyContainer:GetDescendants() do
  if d:IsA("BasePart") then
    local size = d.Size
    local volume = size.X * size.Y * size.Z
    if d.Transparency < 1 and volume > 0.1 then
      local shape = "Block"
      if d:IsA("Part") then
        local s = tostring(d.Shape)
        if string.find(s, "Cylinder") then shape = "Cylinder"
        elseif string.find(s, "Ball") then shape = "Ball"
        elseif string.find(s, "Wedge") then shape = "Wedge"
        elseif string.find(s, "CornerWedge") then shape = "CornerWedge"
        end
      elseif d:IsA("WedgePart") then shape = "Wedge"
      elseif d:IsA("CornerWedgePart") then shape = "CornerWedge"
      elseif d:IsA("MeshPart") then shape = "Block"  -- approximate mesh as bbox
      elseif d.ClassName == "UnionOperation" then shape = "Block"  -- CSG as bbox
      end

      local cf = d.CFrame
      table.insert(parts, {
        name = d.Name,
        kind = (d:IsA("Seat") or d:IsA("VehicleSeat")) and "Seat" or "Part",
        shape = shape,
        position = { cf.Position.X, cf.Position.Y, cf.Position.Z },
        size = { size.X, size.Y, size.Z },
        color = rgbToHex(d.Color),
        transparency = d.Transparency,
        material = string.gsub(tostring(d.Material), "Enum.Material.", ""),
        volume = volume,
      })
    end
  end
end

-- Step 4: sort by volume DESC and cap at maxParts (keep biggest body shells).
table.sort(parts, function(a, b) return a.volume > b.volume end)
local capped = {}
for i, p in ipairs(parts) do
  if i > maxParts then break end
  -- Strip the volume field before output (not used by client).
  p.volume = nil
  table.insert(capped, p)
end

local out = {
  variantName = variantName,
  rootModelName = root.Name,
  bodyContainerName = bodyContainer.Name,
  partCount = #capped,
  totalPartsBeforeCap = #parts,
  parts = capped,
}

fs.writeFile(outputPath, serde.encode("json", out, true))
print(string.format("Extracted %d parts (of %d opaque) -> %s",
  #capped, #parts, outputPath))
