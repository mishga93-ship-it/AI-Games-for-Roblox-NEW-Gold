export interface UITemplateParams {
  title: string;
  uiType: string;        // 'hud' | 'shop' | 'inventory' | 'dialogue' | 'leaderboard' | 'notification' | 'main_menu'
  visualStyle: string;   // 'modern' | 'fantasy' | 'sci-fi' | 'cute' | 'minimal'
  currencyName?: string;
  dataFields?: string[];
  itemSlots?: number;
  summary?: string;
}

// ---------------------------------------------------------------------------
// Color palettes per visual style
// ---------------------------------------------------------------------------

function colorPalette(style: string): { bg: string; accent: string; text: string; panel: string } {
  const s = style.toLowerCase();
  if (s.includes('fantasy') || s.includes('medieval')) {
    return {
      bg:     'Color3.fromRGB(44, 22, 84)',
      accent: 'Color3.fromRGB(244, 197, 66)',
      text:   'Color3.fromRGB(240, 230, 211)',
      panel:  'Color3.fromRGB(60, 35, 100)',
    };
  }
  if (s.includes('sci') || s.includes('neon') || s.includes('space')) {
    return {
      bg:     'Color3.fromRGB(10, 14, 39)',
      accent: 'Color3.fromRGB(0, 212, 255)',
      text:   'Color3.fromRGB(176, 196, 222)',
      panel:  'Color3.fromRGB(20, 25, 60)',
    };
  }
  if (s.includes('cute') || s.includes('pastel')) {
    return {
      bg:     'Color3.fromRGB(255, 228, 240)',
      accent: 'Color3.fromRGB(255, 105, 180)',
      text:   'Color3.fromRGB(92, 58, 107)',
      panel:  'Color3.fromRGB(255, 200, 220)',
    };
  }
  if (s.includes('minimal') || s.includes('dark')) {
    return {
      bg:     'Color3.fromRGB(18, 18, 18)',
      accent: 'Color3.fromRGB(200, 200, 200)',
      text:   'Color3.fromRGB(240, 240, 240)',
      panel:  'Color3.fromRGB(30, 30, 30)',
    };
  }
  // Default: modern
  return {
    bg:     'Color3.fromRGB(26, 26, 46)',
    accent: 'Color3.fromRGB(233, 69, 96)',
    text:   'Color3.fromRGB(255, 255, 255)',
    panel:  'Color3.fromRGB(35, 35, 60)',
  };
}

// ---------------------------------------------------------------------------
// HUD — health bar, coins, XP
// ---------------------------------------------------------------------------

function buildHudScript(params: UITemplateParams): string {
  const c = colorPalette(params.visualStyle);
  const currency = params.currencyName ?? 'Coins';
  return `-- Placement: StarterGui → LocalScript
-- Generated for: ${params.title}
-- Style: ${params.visualStyle}

local Players      = game:GetService("Players")
local TweenService = game:GetService("TweenService")

local player    = Players.LocalPlayer
local character = player.Character or player.CharacterAdded:Wait()

-- ScreenGui (reuse parent if inside .rbxmx ScreenGui, otherwise create new)
local screenGui
if script.Parent and script.Parent:IsA("ScreenGui") then
    screenGui = script.Parent
else
    screenGui = Instance.new("ScreenGui")
    screenGui.Name             = "HUD"
    screenGui.ResetOnSpawn     = false
    screenGui.IgnoreGuiInset   = true
    screenGui.ZIndexBehavior   = Enum.ZIndexBehavior.Sibling
    screenGui.Parent           = player.PlayerGui
end

-- ── Top-left panel ──────────────────────────────────────────────────────────
local topPanel = Instance.new("Frame")
topPanel.Name                  = "TopPanel"
topPanel.Size                  = UDim2.fromScale(0.38, 0.10)
topPanel.Position              = UDim2.fromScale(0.01, 0.02)
topPanel.BackgroundColor3      = ${c.panel}
topPanel.BackgroundTransparency = 0.15
topPanel.BorderSizePixel       = 0
topPanel.Parent                = screenGui

local corner = Instance.new("UICorner")
corner.CornerRadius = UDim.new(0, 12)
corner.Parent = topPanel

local padding = Instance.new("UIPadding")
padding.PaddingLeft   = UDim.new(0, 10)
padding.PaddingRight  = UDim.new(0, 10)
padding.PaddingTop    = UDim.new(0, 6)
padding.PaddingBottom = UDim.new(0, 6)
padding.Parent = topPanel

local layout = Instance.new("UIListLayout")
layout.SortOrder       = Enum.SortOrder.LayoutOrder
layout.FillDirection   = Enum.FillDirection.Vertical
layout.Padding         = UDim.new(0, 4)
layout.Parent          = topPanel

-- Health bar
local hpLabel = Instance.new("TextLabel")
hpLabel.Name             = "HpLabel"
hpLabel.Text             = "❤  HP"
hpLabel.Size             = UDim2.new(1, 0, 0, 16)
hpLabel.BackgroundTransparency = 1
hpLabel.TextColor3       = ${c.text}
hpLabel.Font             = Enum.Font.GothamBold
hpLabel.TextSize         = 13
hpLabel.TextXAlignment   = Enum.TextXAlignment.Left
hpLabel.LayoutOrder      = 1
hpLabel.Parent           = topPanel

local hpBarBg = Instance.new("Frame")
hpBarBg.Name             = "HpBarBg"
hpBarBg.Size             = UDim2.new(1, 0, 0, 10)
hpBarBg.BackgroundColor3 = ${c.bg}
hpBarBg.BorderSizePixel  = 0
hpBarBg.LayoutOrder      = 2
hpBarBg.Parent           = topPanel

local hpCorner = Instance.new("UICorner")
hpCorner.CornerRadius = UDim.new(0, 5)
hpCorner.Parent = hpBarBg

local hpFill = Instance.new("Frame")
hpFill.Name             = "HpFill"
hpFill.Size             = UDim2.fromScale(1, 1)
hpFill.BackgroundColor3 = Color3.fromRGB(220, 60, 60)
hpFill.BorderSizePixel  = 0
hpFill.Parent           = hpBarBg

local hpFillCorner = Instance.new("UICorner")
hpFillCorner.CornerRadius = UDim.new(0, 5)
hpFillCorner.Parent = hpFill

-- Coins counter
local coinsLabel = Instance.new("TextLabel")
coinsLabel.Name             = "CoinsLabel"
coinsLabel.Text             = "💰  ${currency}: 0"
coinsLabel.Size             = UDim2.new(1, 0, 0, 16)
coinsLabel.BackgroundTransparency = 1
coinsLabel.TextColor3       = ${c.accent}
coinsLabel.Font             = Enum.Font.GothamBold
coinsLabel.TextSize         = 14
coinsLabel.TextXAlignment   = Enum.TextXAlignment.Left
coinsLabel.LayoutOrder      = 3
coinsLabel.Parent           = topPanel

-- XP bar
local xpLabel = Instance.new("TextLabel")
xpLabel.Name             = "XpLabel"
xpLabel.Text             = "⭐  XP"
xpLabel.Size             = UDim2.new(1, 0, 0, 14)
xpLabel.BackgroundTransparency = 1
xpLabel.TextColor3       = ${c.text}
xpLabel.Font             = Enum.Font.Gotham
xpLabel.TextSize         = 12
xpLabel.TextXAlignment   = Enum.TextXAlignment.Left
xpLabel.LayoutOrder      = 4
xpLabel.Parent           = topPanel

local xpBarBg = Instance.new("Frame")
xpBarBg.Name             = "XpBarBg"
xpBarBg.Size             = UDim2.new(1, 0, 0, 7)
xpBarBg.BackgroundColor3 = ${c.bg}
xpBarBg.BorderSizePixel  = 0
xpBarBg.LayoutOrder      = 5
xpBarBg.Parent           = topPanel

local xpCorner = Instance.new("UICorner")
xpCorner.CornerRadius = UDim.new(0, 4)
xpCorner.Parent = xpBarBg

local xpFill = Instance.new("Frame")
xpFill.Name             = "XpFill"
xpFill.Size             = UDim2.fromScale(0.1, 1)
xpFill.BackgroundColor3 = ${c.accent}
xpFill.BorderSizePixel  = 0
xpFill.Parent           = xpBarBg

local xpFillCorner = Instance.new("UICorner")
xpFillCorner.CornerRadius = UDim.new(0, 4)
xpFillCorner.Parent = xpFill

-- ── Connect to character ────────────────────────────────────────────────────
local function connectCharacter(char)
  local humanoid = char:WaitForChild("Humanoid")

  local function updateHp(hp)
    local ratio = math.clamp(hp / humanoid.MaxHealth, 0, 1)
    TweenService:Create(hpFill, TweenInfo.new(0.3), {
      Size = UDim2.fromScale(ratio, 1)
    }):Play()
    hpLabel.Text = string.format("❤  HP  %d / %d", math.floor(hp), humanoid.MaxHealth)
  end

  humanoid.HealthChanged:Connect(updateHp)
  updateHp(humanoid.Health)
end

connectCharacter(character)
player.CharacterAdded:Connect(connectCharacter)

-- ── Connect to leaderstats ──────────────────────────────────────────────────
local function connectStats()
  local stats = player:WaitForChild("leaderstats", 5)
  if not stats then return end

  local coins = stats:FindFirstChild("${currency}") or stats:FindFirstChild("Coins") or stats:FindFirstChild("Cash")
  if coins then
    local function updateCoins()
      coinsLabel.Text = "💰  ${currency}: " .. tostring(coins.Value)
    end
    coins.Changed:Connect(updateCoins)
    updateCoins()
  end

  local xp = stats:FindFirstChild("XP") or stats:FindFirstChild("Experience") or stats:FindFirstChild("Level")
  if xp then
    local function updateXp()
      xpLabel.Text = "⭐  XP: " .. tostring(xp.Value)
    end
    xp.Changed:Connect(updateXp)
    updateXp()
  end
end

task.spawn(connectStats)
`;
}

// ---------------------------------------------------------------------------
// Shop — modal window with item grid
// ---------------------------------------------------------------------------

function buildShopScript(params: UITemplateParams): string {
  const c = colorPalette(params.visualStyle);
  const currency = params.currencyName ?? 'Coins';
  return `-- Placement: StarterGui → LocalScript
-- Generated for: ${params.title}
-- Style: ${params.visualStyle}
-- Opens when player touches a "Shop" part or clicks a toolbar button.

local Players            = game:GetService("Players")
local ReplicatedStorage  = game:GetService("ReplicatedStorage")
local TweenService       = game:GetService("TweenService")

local player = Players.LocalPlayer

-- ── RemoteEvent for purchases (create matching server script) ───────────────
-- Server must have: ReplicatedStorage.Remotes.BuyItem (RemoteEvent)
-- Server handler validates price and deducts from leaderstats.${currency}
local remotes = ReplicatedStorage:WaitForChild("Remotes", 5)
local buyEvent = remotes and remotes:FindFirstChild("BuyItem")

-- ── Sample shop items — replace with your own ──────────────────────────────
local ITEMS = {
  { id = "sword",   name = "Iron Sword",    price = 50,  emoji = "⚔️"  },
  { id = "shield",  name = "Oak Shield",    price = 30,  emoji = "🛡️"  },
  { id = "potion",  name = "Health Potion", price = 15,  emoji = "🧪"  },
  { id = "boots",   name = "Speed Boots",   price = 75,  emoji = "👟"  },
  { id = "bow",     name = "Longbow",       price = 60,  emoji = "🏹"  },
  { id = "gem",     name = "Magic Gem",     price = 100, emoji = "💎"  },
}

-- ── Build GUI ───────────────────────────────────────────────────────────────
local screenGui
if script.Parent and script.Parent:IsA("ScreenGui") then
    screenGui = script.Parent
else
    screenGui = Instance.new("ScreenGui")
    screenGui.Name           = "ShopGui"
    screenGui.ResetOnSpawn   = false
    screenGui.IgnoreGuiInset = true
    screenGui.Parent         = player.PlayerGui
end
screenGui.Enabled = false

-- Backdrop
local backdrop = Instance.new("Frame")
backdrop.Name                  = "Backdrop"
backdrop.Size                  = UDim2.fromScale(1, 1)
backdrop.BackgroundColor3      = Color3.fromRGB(0, 0, 0)
backdrop.BackgroundTransparency = 0.45
backdrop.BorderSizePixel       = 0
backdrop.Parent                = screenGui

-- Main panel
local panel = Instance.new("Frame")
panel.Name                  = "ShopPanel"
panel.Size                  = UDim2.fromScale(0.82, 0.78)
panel.Position              = UDim2.fromScale(0.09, 0.11)
panel.BackgroundColor3      = ${c.panel}
panel.BorderSizePixel       = 0
panel.Parent                = screenGui

local panelCorner = Instance.new("UICorner")
panelCorner.CornerRadius = UDim.new(0, 16)
panelCorner.Parent = panel

-- Title bar
local titleBar = Instance.new("Frame")
titleBar.Name             = "TitleBar"
titleBar.Size             = UDim2.new(1, 0, 0, 48)
titleBar.BackgroundColor3 = ${c.accent}
titleBar.BorderSizePixel  = 0
titleBar.Parent           = panel

local titleCorner = Instance.new("UICorner")
titleCorner.CornerRadius = UDim.new(0, 16)
titleCorner.Parent = titleBar

-- Fix bottom corners of title bar
local titleFix = Instance.new("Frame")
titleFix.Size             = UDim2.new(1, 0, 0.5, 0)
titleFix.Position         = UDim2.fromScale(0, 0.5)
titleFix.BackgroundColor3 = ${c.accent}
titleFix.BorderSizePixel  = 0
titleFix.Parent           = titleBar

local titleLabel = Instance.new("TextLabel")
titleLabel.Text           = "🛒  Shop"
titleLabel.Size           = UDim2.fromScale(1, 1)
titleLabel.BackgroundTransparency = 1
titleLabel.TextColor3     = Color3.fromRGB(255, 255, 255)
titleLabel.Font           = Enum.Font.GothamBold
titleLabel.TextSize       = 20
titleLabel.Parent         = titleBar

-- Close button
local closeBtn = Instance.new("TextButton")
closeBtn.Text             = "✕"
closeBtn.Size             = UDim2.new(0, 40, 0, 40)
closeBtn.Position         = UDim2.new(1, -44, 0, 4)
closeBtn.BackgroundColor3 = Color3.fromRGB(200, 60, 60)
closeBtn.TextColor3       = Color3.fromRGB(255, 255, 255)
closeBtn.Font             = Enum.Font.GothamBold
closeBtn.TextSize         = 16
closeBtn.BorderSizePixel  = 0
closeBtn.Parent           = titleBar

local closeBtnCorner = Instance.new("UICorner")
closeBtnCorner.CornerRadius = UDim.new(0, 8)
closeBtnCorner.Parent = closeBtn

-- Scroll frame for items
local scroll = Instance.new("ScrollingFrame")
scroll.Name             = "ItemScroll"
scroll.Size             = UDim2.new(1, -16, 1, -56)
scroll.Position         = UDim2.new(0, 8, 0, 52)
scroll.BackgroundTransparency = 1
scroll.ScrollBarThickness = 4
scroll.BorderSizePixel  = 0
scroll.Parent           = panel

local grid = Instance.new("UIGridLayout")
grid.CellSize     = UDim2.new(0, 130, 0, 140)
grid.CellPadding  = UDim2.new(0, 10, 0, 10)
grid.SortOrder    = Enum.SortOrder.LayoutOrder
grid.Parent       = scroll

local gridPadding = Instance.new("UIPadding")
gridPadding.PaddingTop  = UDim.new(0, 8)
gridPadding.PaddingLeft = UDim.new(0, 8)
gridPadding.Parent      = scroll

-- Populate items
for i, item in ipairs(ITEMS) do
  local card = Instance.new("Frame")
  card.Name             = "Item_" .. item.id
  card.BackgroundColor3 = ${c.bg}
  card.BorderSizePixel  = 0
  card.LayoutOrder      = i
  card.Parent           = scroll

  local cardCorner = Instance.new("UICorner")
  cardCorner.CornerRadius = UDim.new(0, 10)
  cardCorner.Parent = card

  local emoji = Instance.new("TextLabel")
  emoji.Text           = item.emoji
  emoji.Size           = UDim2.new(1, 0, 0, 56)
  emoji.Position       = UDim2.new(0, 0, 0, 8)
  emoji.BackgroundTransparency = 1
  emoji.TextColor3     = ${c.text}
  emoji.Font           = Enum.Font.Gotham
  emoji.TextSize       = 36
  emoji.Parent         = card

  local nameLabel = Instance.new("TextLabel")
  nameLabel.Text       = item.name
  nameLabel.Size       = UDim2.new(1, -8, 0, 28)
  nameLabel.Position   = UDim2.new(0, 4, 0, 66)
  nameLabel.BackgroundTransparency = 1
  nameLabel.TextColor3 = ${c.text}
  nameLabel.Font       = Enum.Font.GothamBold
  nameLabel.TextSize   = 13
  nameLabel.TextWrapped = true
  nameLabel.Parent     = card

  local buyBtn = Instance.new("TextButton")
  buyBtn.Text           = "💰 " .. item.price
  buyBtn.Size           = UDim2.new(1, -12, 0, 32)
  buyBtn.Position       = UDim2.new(0, 6, 1, -38)
  buyBtn.BackgroundColor3 = ${c.accent}
  buyBtn.TextColor3     = Color3.fromRGB(255, 255, 255)
  buyBtn.Font           = Enum.Font.GothamBold
  buyBtn.TextSize       = 13
  buyBtn.BorderSizePixel = 0
  buyBtn.Parent         = card

  local buyCorner = Instance.new("UICorner")
  buyCorner.CornerRadius = UDim.new(0, 8)
  buyCorner.Parent = buyBtn

  buyBtn.MouseButton1Click:Connect(function()
    if buyEvent then
      buyEvent:FireServer(item.id, item.price)
    end
  end)
end

-- Update canvas size when grid changes
grid:GetPropertyChangedSignal("AbsoluteContentSize"):Connect(function()
  scroll.CanvasSize = UDim2.new(0, 0, 0, grid.AbsoluteContentSize.Y + 16)
end)

-- ── Open/close helpers ──────────────────────────────────────────────────────
local function openShop()
  screenGui.Enabled = true
  panel.Size        = UDim2.fromScale(0, 0)
  panel.Position    = UDim2.fromScale(0.5, 0.5)
  panel.AnchorPoint = Vector2.new(0.5, 0.5)
  TweenService:Create(panel, TweenInfo.new(0.25, Enum.EasingStyle.Back), {
    Size     = UDim2.fromScale(0.82, 0.78),
    Position = UDim2.fromScale(0.5, 0.5),
  }):Play()
end

local function closeShop()
  TweenService:Create(panel, TweenInfo.new(0.2), {
    Size = UDim2.fromScale(0, 0),
  }):Play()
  task.delay(0.22, function() screenGui.Enabled = false end)
end

closeBtn.MouseButton1Click:Connect(closeShop)
backdrop.InputBegan:Connect(function(input)
  if input.UserInputType == Enum.UserInputType.MouseButton1 or
     input.UserInputType == Enum.UserInputType.Touch then
    closeShop()
  end
end)

-- ── Trigger: touch a Part named "ShopTrigger" ──────────────────────────────
task.spawn(function()
  local shopPart = workspace:FindFirstChild("ShopTrigger", true)
  if shopPart and shopPart:IsA("BasePart") then
    shopPart.Touched:Connect(function(hit)
      local char = player.Character
      if char and hit:IsDescendantOf(char) then
        openShop()
      end
    end)
  end
end)

-- Expose openShop so other scripts can call it via bindable or direct require
-- To open programmatically: require(script).open()
return { open = openShop, close = closeShop }
`;
}

// ---------------------------------------------------------------------------
// Inventory — item slot grid
// ---------------------------------------------------------------------------

function buildInventoryScript(params: UITemplateParams): string {
  const c = colorPalette(params.visualStyle);
  const slots = params.itemSlots ?? 16;
  return `-- Placement: StarterGui → LocalScript
-- Generated for: ${params.title}
-- Style: ${params.visualStyle}
-- Reads items from ReplicatedStorage.PlayerInventory.<username> folder.

local Players           = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService      = game:GetService("TweenService")

local player    = Players.LocalPlayer
local MAX_SLOTS = ${slots}

-- ── GUI Setup ───────────────────────────────────────────────────────────────
local screenGui
if script.Parent and script.Parent:IsA("ScreenGui") then
    screenGui = script.Parent
else
    screenGui = Instance.new("ScreenGui")
    screenGui.Name           = "InventoryGui"
    screenGui.ResetOnSpawn   = false
    screenGui.IgnoreGuiInset = true
    screenGui.Parent         = player.PlayerGui
end
screenGui.Enabled = false

local panel = Instance.new("Frame")
panel.Name                  = "InventoryPanel"
panel.AnchorPoint           = Vector2.new(0.5, 0.5)
panel.Size                  = UDim2.fromScale(0.88, 0.70)
panel.Position              = UDim2.fromScale(0.5, 0.5)
panel.BackgroundColor3      = ${c.panel}
panel.BorderSizePixel       = 0
panel.Parent                = screenGui

local corner = Instance.new("UICorner")
corner.CornerRadius = UDim.new(0, 16)
corner.Parent = panel

-- Title
local title = Instance.new("TextLabel")
title.Text           = "🎒  Inventory"
title.Size           = UDim2.new(1, 0, 0, 44)
title.BackgroundColor3 = ${c.accent}
title.TextColor3     = Color3.fromRGB(255, 255, 255)
title.Font           = Enum.Font.GothamBold
title.TextSize       = 20
title.BorderSizePixel = 0
title.Parent         = panel

local titleCorner = Instance.new("UICorner")
titleCorner.CornerRadius = UDim.new(0, 16)
titleCorner.Parent = title

local titleFix = Instance.new("Frame")
titleFix.Size = UDim2.new(1, 0, 0.5, 0)
titleFix.Position = UDim2.fromScale(0, 0.5)
titleFix.BackgroundColor3 = ${c.accent}
titleFix.BorderSizePixel = 0
titleFix.Parent = title

local closeBtn = Instance.new("TextButton")
closeBtn.Text = "✕"
closeBtn.Size = UDim2.new(0, 36, 0, 36)
closeBtn.Position = UDim2.new(1, -40, 0, 4)
closeBtn.BackgroundColor3 = Color3.fromRGB(200, 60, 60)
closeBtn.TextColor3 = Color3.fromRGB(255, 255, 255)
closeBtn.Font = Enum.Font.GothamBold
closeBtn.TextSize = 14
closeBtn.BorderSizePixel = 0
closeBtn.Parent = title

local closeBtnCorner = Instance.new("UICorner")
closeBtnCorner.CornerRadius = UDim.new(0, 6)
closeBtnCorner.Parent = closeBtn

-- Scroll frame
local scroll = Instance.new("ScrollingFrame")
scroll.Size             = UDim2.new(1, -12, 1, -52)
scroll.Position         = UDim2.new(0, 6, 0, 48)
scroll.BackgroundTransparency = 1
scroll.ScrollBarThickness = 4
scroll.BorderSizePixel  = 0
scroll.Parent           = panel

local grid = Instance.new("UIGridLayout")
grid.CellSize    = UDim2.new(0, 72, 0, 80)
grid.CellPadding = UDim2.new(0, 8, 0, 8)
grid.SortOrder   = Enum.SortOrder.LayoutOrder
grid.Parent      = scroll

local gridPad = Instance.new("UIPadding")
gridPad.PaddingTop = UDim.new(0, 8)
gridPad.PaddingLeft = UDim.new(0, 8)
gridPad.Parent = scroll

-- Create empty slot frames
local slotFrames = {}
for i = 1, MAX_SLOTS do
  local slot = Instance.new("Frame")
  slot.Name             = "Slot_" .. i
  slot.BackgroundColor3 = ${c.bg}
  slot.BorderSizePixel  = 0
  slot.LayoutOrder      = i
  slot.Parent           = scroll

  local slotCorner = Instance.new("UICorner")
  slotCorner.CornerRadius = UDim.new(0, 8)
  slotCorner.Parent = slot

  local icon = Instance.new("TextLabel")
  icon.Name  = "Icon"
  icon.Text  = ""
  icon.Size  = UDim2.new(1, 0, 0, 44)
  icon.Position = UDim2.new(0, 0, 0, 4)
  icon.BackgroundTransparency = 1
  icon.TextColor3 = ${c.text}
  icon.Font = Enum.Font.Gotham
  icon.TextSize = 28
  icon.Parent = slot

  local nameTag = Instance.new("TextLabel")
  nameTag.Name  = "NameTag"
  nameTag.Text  = ""
  nameTag.Size  = UDim2.new(1, -4, 0, 18)
  nameTag.Position = UDim2.new(0, 2, 1, -22)
  nameTag.BackgroundTransparency = 1
  nameTag.TextColor3 = ${c.text}
  nameTag.Font = Enum.Font.Gotham
  nameTag.TextSize = 10
  nameTag.TextWrapped = true
  nameTag.Parent = slot

  local qty = Instance.new("TextLabel")
  qty.Name  = "Qty"
  qty.Text  = ""
  qty.Size  = UDim2.new(0, 20, 0, 20)
  qty.Position = UDim2.new(1, -22, 0, 2)
  qty.BackgroundColor3 = ${c.accent}
  qty.TextColor3 = Color3.fromRGB(255, 255, 255)
  qty.Font = Enum.Font.GothamBold
  qty.TextSize = 10
  qty.BorderSizePixel = 0
  qty.Visible = false
  qty.Parent = slot

  local qtyCorner = Instance.new("UICorner")
  qtyCorner.CornerRadius = UDim.new(0, 4)
  qtyCorner.Parent = qty

  slotFrames[i] = slot
end

grid:GetPropertyChangedSignal("AbsoluteContentSize"):Connect(function()
  scroll.CanvasSize = UDim2.new(0, 0, 0, grid.AbsoluteContentSize.Y + 16)
end)

-- ── Populate from inventory folder ─────────────────────────────────────────
local function refreshInventory()
  local invFolder = ReplicatedStorage:FindFirstChild("PlayerInventory")
  if not invFolder then return end
  local playerFolder = invFolder:FindFirstChild(player.Name)
  if not playerFolder then return end

  local items = playerFolder:GetChildren()
  for i, slot in ipairs(slotFrames) do
    local item = items[i]
    if item then
      slot.Icon.Text    = item:GetAttribute("Emoji") or "📦"
      slot.NameTag.Text = item.Name
      local q = item:GetAttribute("Quantity") or 1
      if q > 1 then
        slot.Qty.Text    = tostring(q)
        slot.Qty.Visible = true
      else
        slot.Qty.Visible = false
      end
      slot.BackgroundColor3 = ${c.bg}
    else
      slot.Icon.Text    = ""
      slot.NameTag.Text = ""
      slot.Qty.Visible  = false
      slot.BackgroundColor3 = Color3.fromRGB(20, 20, 35)
    end
  end
end

-- ── Toggle open/close with I key or toolbar button ─────────────────────────
local function toggleInventory()
  screenGui.Enabled = not screenGui.Enabled
  if screenGui.Enabled then refreshInventory() end
end

closeBtn.MouseButton1Click:Connect(function()
  screenGui.Enabled = false
end)

-- Toolbar button (create a TextButton in a second ScreenGui for the toolbar)
task.spawn(function()
  local toolbarGui = player.PlayerGui:FindFirstChild("Toolbar")
  if toolbarGui then
    local invBtn = toolbarGui:FindFirstChild("InventoryBtn", true)
    if invBtn and invBtn:IsA("TextButton") then
      invBtn.MouseButton1Click:Connect(toggleInventory)
    end
  end
end)

-- Keyboard shortcut: I
local UIS = game:GetService("UserInputService")
UIS.InputBegan:Connect(function(input, processed)
  if not processed and input.KeyCode == Enum.KeyCode.I then
    toggleInventory()
  end
end)
`;
}

// ---------------------------------------------------------------------------
// Dialogue — NPC speech with typewriter effect
// ---------------------------------------------------------------------------

function buildDialogueScript(params: UITemplateParams): string {
  const c = colorPalette(params.visualStyle);
  return `-- Placement: StarterGui → LocalScript
-- Generated for: ${params.title}
-- Style: ${params.visualStyle}
-- Attach ProximityPrompt to NPC parts to trigger dialogue.

local Players    = game:GetService("Players")
local TweenService = game:GetService("TweenService")

local player = Players.LocalPlayer

-- ── Sample dialogue tree — replace with your own ───────────────────────────
-- Each node: { text, speaker, choices = { { text, next } } }
-- Set next = nil to end conversation.
local DIALOGUE = {
  [1] = {
    speaker = "Merchant",
    text    = "Welcome, traveler! I've been waiting for someone like you.",
    choices = {
      { text = "What do you sell?",   next = 2 },
      { text = "Tell me about quests", next = 3 },
      { text = "Goodbye",             next = nil },
    }
  },
  [2] = {
    speaker = "Merchant",
    text    = "I sell the finest wares in the land! Check the shop nearby.",
    choices = {
      { text = "Thanks!",   next = nil },
      { text = "Go back",   next = 1  },
    }
  },
  [3] = {
    speaker = "Merchant",
    text    = "Rumor has it there's treasure hidden in the caves to the north...",
    choices = {
      { text = "I'll check it out!", next = nil },
      { text = "Go back",            next = 1   },
    }
  },
}

-- ── Build GUI ───────────────────────────────────────────────────────────────
local screenGui
if script.Parent and script.Parent:IsA("ScreenGui") then
    screenGui = script.Parent
else
    screenGui = Instance.new("ScreenGui")
    screenGui.Name           = "DialogueGui"
    screenGui.ResetOnSpawn   = false
    screenGui.IgnoreGuiInset = true
    screenGui.Parent         = player.PlayerGui
end
screenGui.Enabled = false

local panel = Instance.new("Frame")
panel.Name                  = "DialoguePanel"
panel.AnchorPoint           = Vector2.new(0.5, 1)
panel.Size                  = UDim2.fromScale(0.88, 0.28)
panel.Position              = UDim2.fromScale(0.5, 0.96)
panel.BackgroundColor3      = ${c.panel}
panel.BackgroundTransparency = 0.08
panel.BorderSizePixel       = 0
panel.Parent                = screenGui

local panelCorner = Instance.new("UICorner")
panelCorner.CornerRadius = UDim.new(0, 14)
panelCorner.Parent = panel

local panelPad = Instance.new("UIPadding")
panelPad.PaddingLeft   = UDim.new(0, 14)
panelPad.PaddingRight  = UDim.new(0, 14)
panelPad.PaddingTop    = UDim.new(0, 10)
panelPad.PaddingBottom = UDim.new(0, 10)
panelPad.Parent = panel

local speakerLabel = Instance.new("TextLabel")
speakerLabel.Name        = "Speaker"
speakerLabel.Text        = "NPC"
speakerLabel.Size        = UDim2.new(1, 0, 0, 22)
speakerLabel.BackgroundTransparency = 1
speakerLabel.TextColor3  = ${c.accent}
speakerLabel.Font        = Enum.Font.GothamBold
speakerLabel.TextSize    = 16
speakerLabel.TextXAlignment = Enum.TextXAlignment.Left
speakerLabel.Parent      = panel

local dialogueLabel = Instance.new("TextLabel")
dialogueLabel.Name       = "DialogueText"
dialogueLabel.Text       = ""
dialogueLabel.Size       = UDim2.new(1, 0, 0, 50)
dialogueLabel.Position   = UDim2.new(0, 0, 0, 26)
dialogueLabel.BackgroundTransparency = 1
dialogueLabel.TextColor3 = ${c.text}
dialogueLabel.Font       = Enum.Font.Gotham
dialogueLabel.TextSize   = 15
dialogueLabel.TextWrapped = true
dialogueLabel.TextXAlignment = Enum.TextXAlignment.Left
dialogueLabel.TextYAlignment = Enum.TextYAlignment.Top
dialogueLabel.Parent     = panel

-- Choice buttons
local choiceHolder = Instance.new("Frame")
choiceHolder.Name             = "Choices"
choiceHolder.Size             = UDim2.new(1, 0, 0, 44)
choiceHolder.Position         = UDim2.new(0, 0, 1, -48)
choiceHolder.BackgroundTransparency = 1
choiceHolder.Parent           = panel

local choiceLayout = Instance.new("UIListLayout")
choiceLayout.FillDirection = Enum.FillDirection.Horizontal
choiceLayout.Padding       = UDim.new(0, 8)
choiceLayout.VerticalAlignment = Enum.VerticalAlignment.Center
choiceLayout.Parent        = choiceHolder

-- ── Typewriter effect ───────────────────────────────────────────────────────
local typewriterThread
local function typewrite(label, text)
  if typewriterThread then task.cancel(typewriterThread) end
  label.Text = ""
  typewriterThread = task.spawn(function()
    for i = 1, #text do
      label.Text = string.sub(text, 1, i)
      task.wait(0.03)
    end
  end)
end

-- ── Show a dialogue node ────────────────────────────────────────────────────
local function showNode(nodeId)
  local node = DIALOGUE[nodeId]
  if not node then
    screenGui.Enabled = false
    return
  end

  screenGui.Enabled    = true
  speakerLabel.Text    = node.speaker or "NPC"
  typewrite(dialogueLabel, node.text)

  -- Clear old buttons
  for _, child in ipairs(choiceHolder:GetChildren()) do
    if child:IsA("TextButton") then child:Destroy() end
  end

  -- Create choice buttons
  for _, choice in ipairs(node.choices or {}) do
    local btn = Instance.new("TextButton")
    btn.Text              = choice.text
    btn.Size              = UDim2.new(0, 0, 1, 0)
    btn.AutomaticSize     = Enum.AutomaticSize.X
    btn.BackgroundColor3  = ${c.accent}
    btn.TextColor3        = Color3.fromRGB(255, 255, 255)
    btn.Font              = Enum.Font.GothamBold
    btn.TextSize          = 13
    btn.BorderSizePixel   = 0
    btn.Parent            = choiceHolder

    local btnCorner = Instance.new("UICorner")
    btnCorner.CornerRadius = UDim.new(0, 8)
    btnCorner.Parent = btn

    local btnPad = Instance.new("UIPadding")
    btnPad.PaddingLeft  = UDim.new(0, 10)
    btnPad.PaddingRight = UDim.new(0, 10)
    btnPad.Parent = btn

    local nextNode = choice.next
    btn.MouseButton1Click:Connect(function()
      if nextNode then
        showNode(nextNode)
      else
        screenGui.Enabled = false
      end
    end)
  end
end

-- ── Connect ProximityPrompts on NPCs ────────────────────────────────────────
local function connectNPC(npc)
  local prompt = npc:FindFirstChildWhichIsA("ProximityPrompt", true)
  if prompt then
    prompt.Triggered:Connect(function(trigPlayer)
      if trigPlayer == player then
        showNode(1)
      end
    end)
  end
end

task.spawn(function()
  for _, obj in ipairs(workspace:GetDescendants()) do
    if obj:IsA("Model") and obj:FindFirstChildWhichIsA("ProximityPrompt", true) then
      connectNPC(obj)
    end
  end
  workspace.DescendantAdded:Connect(function(obj)
    if obj:IsA("ProximityPrompt") and obj.Parent then
      connectNPC(obj.Parent)
    end
  end)
end)
`;
}

// ---------------------------------------------------------------------------
// Leaderboard — top 10 sorted by leaderstats
// ---------------------------------------------------------------------------

function buildLeaderboardScript(params: UITemplateParams): string {
  const c = colorPalette(params.visualStyle);
  return `-- Placement: StarterGui → LocalScript
-- Generated for: ${params.title}
-- Style: ${params.visualStyle}

local Players = game:GetService("Players")

local player = Players.LocalPlayer

-- ── GUI ──────────────────────────────────────────────────────────────────────
local screenGui
if script.Parent and script.Parent:IsA("ScreenGui") then
    screenGui = script.Parent
else
    screenGui = Instance.new("ScreenGui")
    screenGui.Name           = "LeaderboardGui"
    screenGui.ResetOnSpawn   = false
    screenGui.IgnoreGuiInset = true
    screenGui.Parent         = player.PlayerGui
end

local panel = Instance.new("Frame")
panel.Name                  = "LeaderboardPanel"
panel.AnchorPoint           = Vector2.new(1, 0)
panel.Size                  = UDim2.fromScale(0.26, 0.55)
panel.Position              = UDim2.fromScale(0.99, 0.04)
panel.BackgroundColor3      = ${c.panel}
panel.BackgroundTransparency = 0.10
panel.BorderSizePixel       = 0
panel.Parent                = screenGui

local corner = Instance.new("UICorner")
corner.CornerRadius = UDim.new(0, 12)
corner.Parent = panel

local titleLabel = Instance.new("TextLabel")
titleLabel.Text           = "🏆  Leaderboard"
titleLabel.Size           = UDim2.new(1, 0, 0, 36)
titleLabel.BackgroundColor3 = ${c.accent}
titleLabel.TextColor3     = Color3.fromRGB(255, 255, 255)
titleLabel.Font           = Enum.Font.GothamBold
titleLabel.TextSize       = 14
titleLabel.BorderSizePixel = 0
titleLabel.Parent         = panel

local titleCorner = Instance.new("UICorner")
titleCorner.CornerRadius = UDim.new(0, 12)
titleCorner.Parent = titleLabel

local titleFix = Instance.new("Frame")
titleFix.Size = UDim2.new(1, 0, 0.5, 0)
titleFix.Position = UDim2.fromScale(0, 0.5)
titleFix.BackgroundColor3 = ${c.accent}
titleFix.BorderSizePixel = 0
titleFix.Parent = titleLabel

local rowHolder = Instance.new("Frame")
rowHolder.Name             = "Rows"
rowHolder.Size             = UDim2.new(1, 0, 1, -40)
rowHolder.Position         = UDim2.new(0, 0, 0, 38)
rowHolder.BackgroundTransparency = 1
rowHolder.ClipDescendants  = true
rowHolder.Parent           = panel

local rowLayout = Instance.new("UIListLayout")
rowLayout.SortOrder        = Enum.SortOrder.LayoutOrder
rowLayout.Padding          = UDim.new(0, 2)
rowLayout.Parent           = rowHolder

local rowPad = Instance.new("UIPadding")
rowPad.PaddingLeft  = UDim.new(0, 6)
rowPad.PaddingRight = UDim.new(0, 6)
rowPad.PaddingTop   = UDim.new(0, 4)
rowPad.Parent       = rowHolder

-- Pre-create 10 row frames
local rows = {}
for i = 1, 10 do
  local row = Instance.new("Frame")
  row.Name             = "Row" .. i
  row.Size             = UDim2.new(1, 0, 0, 28)
  row.BackgroundColor3 = i % 2 == 0 and ${c.bg} or ${c.panel}
  row.BorderSizePixel  = 0
  row.LayoutOrder      = i
  row.Visible          = false
  row.Parent           = rowHolder

  local rowCorner = Instance.new("UICorner")
  rowCorner.CornerRadius = UDim.new(0, 6)
  rowCorner.Parent = row

  local rankLabel = Instance.new("TextLabel")
  rankLabel.Name        = "Rank"
  rankLabel.Text        = "#" .. i
  rankLabel.Size        = UDim2.new(0, 28, 1, 0)
  rankLabel.BackgroundTransparency = 1
  rankLabel.TextColor3  = ${c.accent}
  rankLabel.Font        = Enum.Font.GothamBold
  rankLabel.TextSize    = 12
  rankLabel.Parent      = row

  local nameLabel = Instance.new("TextLabel")
  nameLabel.Name        = "Name"
  nameLabel.Text        = ""
  nameLabel.Size        = UDim2.new(0.6, 0, 1, 0)
  nameLabel.Position    = UDim2.new(0, 30, 0, 0)
  nameLabel.BackgroundTransparency = 1
  nameLabel.TextColor3  = ${c.text}
  nameLabel.Font        = Enum.Font.Gotham
  nameLabel.TextSize    = 12
  nameLabel.TextXAlignment = Enum.TextXAlignment.Left
  nameLabel.TextTruncate = Enum.TextTruncate.AtEnd
  nameLabel.Parent      = row

  local scoreLabel = Instance.new("TextLabel")
  scoreLabel.Name       = "Score"
  scoreLabel.Text       = "0"
  scoreLabel.Size       = UDim2.new(0, 50, 1, 0)
  scoreLabel.Position   = UDim2.new(1, -54, 0, 0)
  scoreLabel.BackgroundTransparency = 1
  scoreLabel.TextColor3 = ${c.text}
  scoreLabel.Font       = Enum.Font.GothamBold
  scoreLabel.TextSize   = 12
  scoreLabel.TextXAlignment = Enum.TextXAlignment.Right
  scoreLabel.Parent     = row

  rows[i] = row
end

-- ── Refresh logic ────────────────────────────────────────────────────────────
local STAT_NAME = "Score" -- change to your leaderstats key

local function getScore(p)
  local stats = p:FindFirstChild("leaderstats")
  if stats then
    local stat = stats:FindFirstChild(STAT_NAME)
    if stat then return tonumber(stat.Value) or 0 end
  end
  return 0
end

local function refreshLeaderboard()
  local list = Players:GetPlayers()
  table.sort(list, function(a, b) return getScore(a) > getScore(b) end)

  for i, row in ipairs(rows) do
    local p = list[i]
    if p then
      row.Name.Text  = p.DisplayName
      row.Score.Text = tostring(getScore(p))
      row.Visible    = true
      -- Highlight viewer's own row
      if p == player then
        row.BackgroundColor3 = ${c.accent}
        row.BackgroundTransparency = 0.6
      else
        row.BackgroundColor3 = i % 2 == 0 and ${c.bg} or ${c.panel}
        row.BackgroundTransparency = 0
      end
    else
      row.Visible = false
    end
  end
end

-- Refresh every 5 seconds
task.spawn(function()
  while true do
    refreshLeaderboard()
    task.wait(5)
  end
end)
`;
}

// ---------------------------------------------------------------------------
// Notification toast system
// ---------------------------------------------------------------------------

function buildNotificationScript(params: UITemplateParams): string {
  const c = colorPalette(params.visualStyle);
  return `-- Placement: ReplicatedStorage → ModuleScript
-- Usage from any LocalScript: require(path).Notify("You got 50 coins!", 3)
-- Generated for: ${params.title}
-- Style: ${params.visualStyle}

local Players      = game:GetService("Players")
local TweenService = game:GetService("TweenService")

local player = Players.LocalPlayer

local screenGui
if script.Parent and script.Parent:IsA("ScreenGui") then
    screenGui = script.Parent
else
    screenGui = Instance.new("ScreenGui")
    screenGui.Name           = "NotificationGui"
    screenGui.ResetOnSpawn   = false
    screenGui.IgnoreGuiInset = true
    screenGui.Parent         = player.PlayerGui
end

local holder = Instance.new("Frame")
holder.Name             = "NotifHolder"
holder.AnchorPoint      = Vector2.new(0.5, 0)
holder.Size             = UDim2.fromScale(0.55, 0.35)
holder.Position         = UDim2.fromScale(0.5, 0.04)
holder.BackgroundTransparency = 1
holder.Parent           = screenGui

local holderLayout = Instance.new("UIListLayout")
holderLayout.SortOrder  = Enum.SortOrder.LayoutOrder
holderLayout.Padding    = UDim.new(0, 6)
holderLayout.HorizontalAlignment = Enum.HorizontalAlignment.Center
holderLayout.Parent     = holder

local queue = {}
local processing = false

local function processQueue()
  if processing then return end
  processing = true
  task.spawn(function()
    while #queue > 0 do
      local item = table.remove(queue, 1)

      local toast = Instance.new("Frame")
      toast.Name                  = "Toast"
      toast.Size                  = UDim2.new(1, 0, 0, 44)
      toast.BackgroundColor3      = ${c.panel}
      toast.BackgroundTransparency = 0.05
      toast.BorderSizePixel       = 0
      toast.AnchorPoint           = Vector2.new(0.5, 0)
      toast.Position              = UDim2.new(0.5, 0, 0, -54)
      toast.Parent                = holder

      local toastCorner = Instance.new("UICorner")
      toastCorner.CornerRadius = UDim.new(0, 10)
      toastCorner.Parent = toast

      local toastStroke = Instance.new("UIStroke")
      toastStroke.Color     = ${c.accent}
      toastStroke.Thickness = 1.5
      toastStroke.Parent    = toast

      local toastPad = Instance.new("UIPadding")
      toastPad.PaddingLeft  = UDim.new(0, 12)
      toastPad.PaddingRight = UDim.new(0, 12)
      toastPad.Parent       = toast

      local label = Instance.new("TextLabel")
      label.Text           = item.message
      label.Size           = UDim2.fromScale(1, 1)
      label.BackgroundTransparency = 1
      label.TextColor3     = ${c.text}
      label.Font           = Enum.Font.GothamBold
      label.TextSize       = 14
      label.TextWrapped    = true
      label.Parent         = toast

      -- Slide in
      TweenService:Create(toast, TweenInfo.new(0.3, Enum.EasingStyle.Back), {
        Position = UDim2.new(0.5, 0, 0, 0),
      }):Play()

      task.wait(item.duration or 3)

      -- Slide out
      local out = TweenService:Create(toast, TweenInfo.new(0.25), {
        Position = UDim2.new(0.5, 0, 0, -54),
        BackgroundTransparency = 1,
      })
      out:Play()
      out.Completed:Wait()
      toast:Destroy()
    end
    processing = false
  end)
end

local module = {}

function module.Notify(message: string, duration: number?)
  table.insert(queue, { message = message, duration = duration or 3 })
  processQueue()
end

return module
`;
}

// ---------------------------------------------------------------------------
// Main Menu
// ---------------------------------------------------------------------------

function buildMainMenuScript(params: UITemplateParams): string {
  const c = colorPalette(params.visualStyle);
  return `-- Placement: StarterGui → LocalScript
-- Generated for: ${params.title}
-- Style: ${params.visualStyle}
-- Hides automatically when character first spawns.

local Players      = game:GetService("Players")
local TweenService = game:GetService("TweenService")

local player = Players.LocalPlayer

-- ── GUI ──────────────────────────────────────────────────────────────────────
local screenGui
if script.Parent and script.Parent:IsA("ScreenGui") then
    screenGui = script.Parent
else
    screenGui = Instance.new("ScreenGui")
    screenGui.Name           = "MainMenuGui"
    screenGui.ResetOnSpawn   = false
    screenGui.IgnoreGuiInset = true
    screenGui.Parent         = player.PlayerGui
end
screenGui.DisplayOrder = 10

-- Background
local bg = Instance.new("Frame")
bg.Name             = "Background"
bg.Size             = UDim2.fromScale(1, 1)
bg.BackgroundColor3 = ${c.bg}
bg.BorderSizePixel  = 0
bg.Parent           = screenGui

-- Gradient overlay
local grad = Instance.new("UIGradient")
grad.Color    = ColorSequence.new({
  ColorSequenceKeypoint.new(0, ${c.bg}),
  ColorSequenceKeypoint.new(1, ${c.panel}),
})
grad.Rotation = 135
grad.Parent   = bg

-- Game title
local titleLabel = Instance.new("TextLabel")
titleLabel.Text           = "${params.title}"
titleLabel.AnchorPoint    = Vector2.new(0.5, 0)
titleLabel.Size           = UDim2.fromScale(0.8, 0.12)
titleLabel.Position       = UDim2.fromScale(0.5, 0.12)
titleLabel.BackgroundTransparency = 1
titleLabel.TextColor3     = ${c.accent}
titleLabel.Font           = Enum.Font.GothamBold
titleLabel.TextScaled     = true
titleLabel.Parent         = bg

-- Sub-title
local subLabel = Instance.new("TextLabel")
subLabel.Text           = "Ready to play?"
subLabel.AnchorPoint    = Vector2.new(0.5, 0)
subLabel.Size           = UDim2.fromScale(0.6, 0.05)
subLabel.Position       = UDim2.fromScale(0.5, 0.26)
subLabel.BackgroundTransparency = 1
subLabel.TextColor3     = ${c.text}
subLabel.Font           = Enum.Font.Gotham
subLabel.TextScaled     = true
subLabel.Parent         = bg

-- Button helper
local function makeButton(text, yPos, color)
  local btn = Instance.new("TextButton")
  btn.Text            = text
  btn.AnchorPoint     = Vector2.new(0.5, 0)
  btn.Size            = UDim2.fromScale(0.50, 0.075)
  btn.Position        = UDim2.fromScale(0.5, yPos)
  btn.BackgroundColor3 = color or ${c.accent}
  btn.TextColor3      = Color3.fromRGB(255, 255, 255)
  btn.Font            = Enum.Font.GothamBold
  btn.TextScaled      = true
  btn.BorderSizePixel = 0
  btn.Parent          = bg

  local btnCorner = Instance.new("UICorner")
  btnCorner.CornerRadius = UDim.new(0, 14)
  btnCorner.Parent = btn

  local btnStroke = Instance.new("UIStroke")
  btnStroke.Color     = Color3.fromRGB(255, 255, 255)
  btnStroke.Thickness = 1
  btnStroke.Transparency = 0.7
  btnStroke.Parent    = btn

  -- Hover effect
  btn.MouseEnter:Connect(function()
    TweenService:Create(btn, TweenInfo.new(0.15), {
      Size = UDim2.fromScale(0.53, 0.08),
    }):Play()
  end)
  btn.MouseLeave:Connect(function()
    TweenService:Create(btn, TweenInfo.new(0.15), {
      Size = UDim2.fromScale(0.50, 0.075),
    }):Play()
  end)

  return btn
end

local playBtn     = makeButton("▶  Play",     0.38)
local settingsBtn = makeButton("⚙  Settings", 0.48, ${c.panel})
local creditsBtn  = makeButton("★  Credits",  0.58, ${c.panel})

-- Settings panel
local settingsPanel = Instance.new("Frame")
settingsPanel.Name             = "SettingsPanel"
settingsPanel.AnchorPoint      = Vector2.new(0.5, 0.5)
settingsPanel.Size             = UDim2.fromScale(0.72, 0.55)
settingsPanel.Position         = UDim2.fromScale(0.5, 0.5)
settingsPanel.BackgroundColor3 = ${c.panel}
settingsPanel.BorderSizePixel  = 0
settingsPanel.Visible          = false
settingsPanel.Parent           = bg

local settingsCorner = Instance.new("UICorner")
settingsCorner.CornerRadius = UDim.new(0, 16)
settingsCorner.Parent = settingsPanel

local settingsTitle = Instance.new("TextLabel")
settingsTitle.Text       = "⚙  Settings"
settingsTitle.Size       = UDim2.new(1, 0, 0, 48)
settingsTitle.BackgroundColor3 = ${c.accent}
settingsTitle.TextColor3 = Color3.fromRGB(255, 255, 255)
settingsTitle.Font       = Enum.Font.GothamBold
settingsTitle.TextSize   = 20
settingsTitle.BorderSizePixel = 0
settingsTitle.Parent     = settingsPanel

local stCorner = Instance.new("UICorner")
stCorner.CornerRadius = UDim.new(0, 16)
stCorner.Parent = settingsTitle

local stFix = Instance.new("Frame")
stFix.Size = UDim2.new(1, 0, 0.5, 0)
stFix.Position = UDim2.fromScale(0, 0.5)
stFix.BackgroundColor3 = ${c.accent}
stFix.BorderSizePixel = 0
stFix.Parent = settingsTitle

local settingsNote = Instance.new("TextLabel")
settingsNote.Text = "Music and SFX settings go here."
settingsNote.Size = UDim2.new(1, -24, 1, -56)
settingsNote.Position = UDim2.new(0, 12, 0, 52)
settingsNote.BackgroundTransparency = 1
settingsNote.TextColor3 = ${c.text}
settingsNote.Font = Enum.Font.Gotham
settingsNote.TextSize = 15
settingsNote.TextWrapped = true
settingsNote.Parent = settingsPanel

local closeSettings = makeButton("✕  Close", 0, Color3.fromRGB(180, 60, 60))
closeSettings.AnchorPoint = Vector2.new(0.5, 1)
closeSettings.Position    = UDim2.fromScale(0.5, 0.94)
closeSettings.Parent      = settingsPanel
closeSettings.MouseButton1Click:Connect(function() settingsPanel.Visible = false end)

settingsBtn.MouseButton1Click:Connect(function() settingsPanel.Visible = true  end)

-- Credits panel (simple)
local creditsPanel = Instance.new("Frame")
creditsPanel.Name             = "CreditsPanel"
creditsPanel.AnchorPoint      = Vector2.new(0.5, 0.5)
creditsPanel.Size             = UDim2.fromScale(0.62, 0.40)
creditsPanel.Position         = UDim2.fromScale(0.5, 0.5)
creditsPanel.BackgroundColor3 = ${c.panel}
creditsPanel.BorderSizePixel  = 0
creditsPanel.Visible          = false
creditsPanel.Parent           = bg

local creditsCorner = Instance.new("UICorner")
creditsCorner.CornerRadius = UDim.new(0, 16)
creditsCorner.Parent = creditsPanel

local creditsLabel = Instance.new("TextLabel")
creditsLabel.Text = "Built with ❤ using AI Games for Roblox\n\nDesign & Development: You!"
creditsLabel.Size = UDim2.new(1, -24, 1, -60)
creditsLabel.Position = UDim2.new(0, 12, 0, 12)
creditsLabel.BackgroundTransparency = 1
creditsLabel.TextColor3 = ${c.text}
creditsLabel.Font = Enum.Font.Gotham
creditsLabel.TextSize = 15
creditsLabel.TextWrapped = true
creditsLabel.Parent = creditsPanel

local closeCredits = makeButton("✕  Close", 0, Color3.fromRGB(180, 60, 60))
closeCredits.AnchorPoint = Vector2.new(0.5, 1)
closeCredits.Position    = UDim2.fromScale(0.5, 0.93)
closeCredits.Parent      = creditsPanel
closeCredits.MouseButton1Click:Connect(function() creditsPanel.Visible = false end)

creditsBtn.MouseButton1Click:Connect(function() creditsPanel.Visible = true end)

-- ── Play button — hide menu when character spawns ────────────────────────────
local function hideMenu()
  TweenService:Create(bg, TweenInfo.new(0.5), {
    BackgroundTransparency = 1,
  }):Play()
  task.delay(0.5, function()
    screenGui.Enabled = false
  end)
end

playBtn.MouseButton1Click:Connect(function()
  -- Spawn the character (if not already spawned by auto-spawn)
  hideMenu()
end)

-- Auto-hide when character loads
player.CharacterAdded:Connect(function()
  task.wait(0.5)
  if screenGui.Enabled then
    hideMenu()
  end
end)
`;
}

// ---------------------------------------------------------------------------
// Game Pass Shop — Client LocalScript (.rbxmx → StarterGui)
// Creates full shop GUI with Buy buttons for Game Passes and Dev Products.
// Buttons work because this is a LocalScript running in client context.
// ---------------------------------------------------------------------------

export interface GamepassConfig {
  gamePasses: Array<{ name: string; description: string; id?: number }>;
  devProducts: Array<{ name: string; description: string; amount?: number; id?: number }>;
}

export function buildGamepassShopClient(config?: GamepassConfig): string {
  const passes = config?.gamePasses ?? [
    { name: 'VIP', description: '2x coins multiplier + VIP area access' },
    { name: 'Speed Boost', description: 'Permanent 2x walk speed' },
    { name: 'Auto Farm', description: 'Auto-collect resources while AFK' },
  ];
  const products = config?.devProducts ?? [
    { name: '100 Coins', description: 'Instant 100 coins', amount: 100 },
    { name: '500 Coins', description: 'Instant 500 coins', amount: 500 },
    { name: 'Starter Pack', description: '200 coins + speed boost for 10 min', amount: 200 },
  ];

  const passLines = passes.map((p, i) =>
    `  { name = "${p.name}", description = "${p.description}", id = ${(p as { id?: number }).id ?? 0}, order = ${i + 1} }`
  ).join(',\n');
  const prodLines = products.map((p, i) =>
    `  { name = "${p.name}", description = "${p.description}", id = ${(p as { id?: number }).id ?? 0}, amount = ${(p as { amount?: number }).amount ?? 100}, order = ${i + 1} }`
  ).join(',\n');

  return `-- Placement: StarterGui → LocalScript
-- Game Pass & Developer Product Shop
-- Drag this .rbxmx into StarterGui → Press Play → Shop works!
-- Buy buttons call MarketplaceService directly (standard Roblox pattern)

local Players = game:GetService("Players")
local MarketplaceService = game:GetService("MarketplaceService")
local TweenService = game:GetService("TweenService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")

-- Try to find server RemoteEvent (for purchase confirmations, non-blocking)
local remoteEvent = ReplicatedStorage:FindFirstChild("MonetizationEvent")
if not remoteEvent then
    task.spawn(function()
        remoteEvent = ReplicatedStorage:WaitForChild("MonetizationEvent", 15)
    end)
end

-- ==========================================
-- CONFIG — Replace id = 0 with real IDs from Creator Dashboard
-- Game Passes: https://create.roblox.com → Your Game → Monetization → Passes
-- Dev Products: https://create.roblox.com → Your Game → Monetization → Developer Products
-- ==========================================

local GAME_PASSES = {
${passLines}
}

local DEV_PRODUCTS = {
${prodLines}
}

-- ==========================================
-- COLORS
-- ==========================================

local ACCENT = Color3.fromRGB(0, 180, 255)
local BG_COLOR = Color3.fromRGB(18, 18, 32)
local CARD_COLOR = Color3.fromRGB(28, 28, 48)
local TEXT_COLOR = Color3.fromRGB(240, 240, 255)
local GREEN = Color3.fromRGB(40, 180, 80)

-- ==========================================
-- BUILD GUI
-- ==========================================

local screenGui
if script.Parent and script.Parent:IsA("ScreenGui") then
    screenGui = script.Parent
else
    screenGui = Instance.new("ScreenGui")
    screenGui.Name = "GamePassShop"
    screenGui.ResetOnSpawn = false
    screenGui.IgnoreGuiInset = true
    screenGui.Parent = playerGui
end

-- Shop Frame
local shopFrame = Instance.new("Frame")
shopFrame.Name = "ShopFrame"
shopFrame.Size = UDim2.new(0.72, 0, 0.78, 0)
shopFrame.Position = UDim2.new(0.14, 0, 0.11, 0)
shopFrame.BackgroundColor3 = BG_COLOR
shopFrame.BackgroundTransparency = 0.05
shopFrame.Visible = false
shopFrame.Parent = screenGui

Instance.new("UICorner", shopFrame).CornerRadius = UDim.new(0, 14)
local stroke = Instance.new("UIStroke", shopFrame)
stroke.Color = ACCENT
stroke.Thickness = 1.5
stroke.Transparency = 0.6

-- Header
local header = Instance.new("Frame")
header.Size = UDim2.new(1, 0, 0, 44)
header.BackgroundColor3 = Color3.fromRGB(12, 12, 24)
header.BackgroundTransparency = 0.3
header.BorderSizePixel = 0
header.Parent = shopFrame
Instance.new("UICorner", header).CornerRadius = UDim.new(0, 14)

local titleLabel = Instance.new("TextLabel")
titleLabel.Text = "SHOP"
titleLabel.Size = UDim2.new(0.5, 0, 1, 0)
titleLabel.Position = UDim2.new(0, 16, 0, 0)
titleLabel.BackgroundTransparency = 1
titleLabel.TextColor3 = ACCENT
titleLabel.TextSize = 18
titleLabel.Font = Enum.Font.GothamBold
titleLabel.TextXAlignment = Enum.TextXAlignment.Left
titleLabel.Parent = header

local closeBtn = Instance.new("TextButton")
closeBtn.Text = "X"
closeBtn.Size = UDim2.new(0, 36, 0, 36)
closeBtn.Position = UDim2.new(1, -42, 0, 4)
closeBtn.BackgroundTransparency = 1
closeBtn.TextColor3 = TEXT_COLOR
closeBtn.TextSize = 18
closeBtn.Font = Enum.Font.GothamBold
closeBtn.Parent = header

-- Scroll
local scroll = Instance.new("ScrollingFrame")
scroll.Size = UDim2.new(1, -24, 1, -54)
scroll.Position = UDim2.new(0, 12, 0, 50)
scroll.BackgroundTransparency = 1
scroll.ScrollBarThickness = 4
scroll.ScrollBarImageColor3 = ACCENT
scroll.CanvasSize = UDim2.new(0, 0, 0, 0)
scroll.AutomaticCanvasSize = Enum.AutomaticSize.Y
scroll.Parent = shopFrame

local layout = Instance.new("UIListLayout")
layout.Padding = UDim.new(0, 8)
layout.SortOrder = Enum.SortOrder.LayoutOrder
layout.Parent = scroll

-- ==========================================
-- HELPERS
-- ==========================================

local function addSectionHeader(text, order)
    local label = Instance.new("TextLabel")
    label.Text = text
    label.Size = UDim2.new(1, 0, 0, 28)
    label.BackgroundTransparency = 1
    label.TextColor3 = ACCENT
    label.TextSize = 14
    label.Font = Enum.Font.GothamBold
    label.TextXAlignment = Enum.TextXAlignment.Left
    label.LayoutOrder = order
    label.Parent = scroll
end

local function addCard(itemName, description, cardType, itemId, itemOrder)
    local card = Instance.new("Frame")
    card.Size = UDim2.new(1, 0, 0, 72)
    card.BackgroundColor3 = CARD_COLOR
    card.BackgroundTransparency = 0.1
    card.LayoutOrder = itemOrder
    card.Parent = scroll
    Instance.new("UICorner", card).CornerRadius = UDim.new(0, 10)

    local cs = Instance.new("UIStroke", card)
    cs.Color = ACCENT
    cs.Thickness = 1
    cs.Transparency = 0.75

    local nameL = Instance.new("TextLabel")
    nameL.Name = "ItemName"
    nameL.Text = itemName
    nameL.Size = UDim2.new(0.55, 0, 0, 22)
    nameL.Position = UDim2.new(0, 14, 0, 10)
    nameL.BackgroundTransparency = 1
    nameL.TextColor3 = TEXT_COLOR
    nameL.TextSize = 15
    nameL.Font = Enum.Font.GothamBold
    nameL.TextXAlignment = Enum.TextXAlignment.Left
    nameL.Parent = card

    local descL = Instance.new("TextLabel")
    descL.Text = description
    descL.Size = UDim2.new(0.55, 0, 0, 16)
    descL.Position = UDim2.new(0, 14, 0, 34)
    descL.BackgroundTransparency = 1
    descL.TextColor3 = Color3.fromRGB(160, 160, 180)
    descL.TextSize = 11
    descL.Font = Enum.Font.Gotham
    descL.TextXAlignment = Enum.TextXAlignment.Left
    descL.TextTruncate = Enum.TextTruncate.AtEnd
    descL.Parent = card

    local priceL = Instance.new("TextLabel")
    priceL.Name = "PriceLabel"
    priceL.Text = "R$ ..."
    priceL.Size = UDim2.new(0, 80, 0, 20)
    priceL.Position = UDim2.new(0, 14, 0, 52)
    priceL.BackgroundTransparency = 1
    priceL.TextColor3 = ACCENT
    priceL.TextSize = 12
    priceL.Font = Enum.Font.GothamBold
    priceL.TextXAlignment = Enum.TextXAlignment.Left
    priceL.Parent = card

    local buyBtn = Instance.new("TextButton")
    buyBtn.Name = "BuyBtn"
    buyBtn.Size = UDim2.new(0, 90, 0, 34)
    buyBtn.Position = UDim2.new(1, -104, 0.5, -17)
    buyBtn.BackgroundColor3 = ACCENT
    buyBtn.TextColor3 = BG_COLOR
    buyBtn.Text = "Buy"
    buyBtn.TextSize = 14
    buyBtn.Font = Enum.Font.GothamBold
    buyBtn.AutoButtonColor = true
    buyBtn.Active = true
    buyBtn.ZIndex = 10
    buyBtn.Parent = card

    -- Ensure card does not absorb input from buttons
    card.Active = false

    Instance.new("UICorner", buyBtn).CornerRadius = UDim.new(0, 8)

    buyBtn.Activated:Connect(function()
        print("[Shop] Buy clicked: " .. itemName .. " (id=" .. tostring(itemId) .. ")")
        buyBtn.Text = "..."
        -- Call MarketplaceService directly from client (standard Roblox pattern)
        if itemId ~= 0 then
            local ok, err = pcall(function()
                if cardType == "BuyPass" then
                    MarketplaceService:PromptGamePassPurchase(player, itemId)
                else
                    MarketplaceService:PromptProductPurchase(player, itemId)
                end
            end)
            if not ok then
                warn("[Shop] Purchase error: " .. tostring(err))
                buyBtn.Text = "Error"
                task.wait(2)
            end
        else
            buyBtn.BackgroundColor3 = Color3.fromRGB(255, 100, 0)
            buyBtn.Text = "Set ID!"
            warn("[Shop] Replace id = 0 with real ID for: " .. itemName)
            task.wait(2)
            buyBtn.BackgroundColor3 = ACCENT
        end
        buyBtn.Text = "Buy"
    end)

    return buyBtn, priceL, card
end

-- ==========================================
-- POPULATE
-- ==========================================

addSectionHeader("Game Passes", 0)
local passOrder = 1
for _, passData in ipairs(GAME_PASSES) do
    addCard(passData.name, passData.description, "BuyPass", passData.id or 0, passOrder)
    passOrder = passOrder + 1
end

addSectionHeader("Developer Products", 100)
local prodOrder = 101
for _, prodData in ipairs(DEV_PRODUCTS) do
    addCard(prodData.name, prodData.description, "BuyProduct", prodData.id or 0, prodOrder)
    prodOrder = prodOrder + 1
end

-- ==========================================
-- TOGGLE BUTTON (floating)
-- ==========================================

local toggleBtn = Instance.new("TextButton")
toggleBtn.Name = "ShopToggle"
toggleBtn.Size = UDim2.new(0, 50, 0, 50)
toggleBtn.Position = UDim2.new(1, -64, 1, -64)
toggleBtn.BackgroundColor3 = ACCENT
toggleBtn.Text = "Shop"
toggleBtn.TextSize = 12
toggleBtn.Font = Enum.Font.GothamBold
toggleBtn.TextColor3 = BG_COLOR
toggleBtn.Parent = screenGui
Instance.new("UICorner", toggleBtn).CornerRadius = UDim.new(0, 25)

local isOpen = false
local function toggleShop()
    isOpen = not isOpen
    if isOpen then
        shopFrame.Visible = true
        shopFrame.Size = UDim2.new(0, 0, 0, 0)
        shopFrame.Position = UDim2.new(0.5, 0, 0.5, 0)
        TweenService:Create(shopFrame, TweenInfo.new(0.35, Enum.EasingStyle.Back), {
            Size = UDim2.new(0.72, 0, 0.78, 0),
            Position = UDim2.new(0.14, 0, 0.11, 0)
        }):Play()
    else
        local closeTween = TweenService:Create(shopFrame, TweenInfo.new(0.2, Enum.EasingStyle.Quad), {
            Size = UDim2.new(0, 0, 0, 0),
            Position = UDim2.new(0.5, 0, 0.5, 0)
        })
        closeTween:Play()
        closeTween.Completed:Wait()
        shopFrame.Visible = false
    end
end

toggleBtn.Activated:Connect(toggleShop)
closeBtn.Activated:Connect(function()
    if isOpen then toggleShop() end
end)

-- ==========================================
-- SERVER EVENTS (purchase confirmations)
-- ==========================================

if remoteEvent then
    remoteEvent.OnClientEvent:Connect(function(action, itemName, amount)
        if action == "PassOwned" or action == "PassGranted" then
            for _, child in ipairs(scroll:GetChildren()) do
                if child:IsA("Frame") then
                    local nameL = child:FindFirstChild("ItemName")
                    if nameL and nameL:IsA("TextLabel") and nameL.Text == itemName then
                        local btn = child:FindFirstChild("BuyBtn")
                        if btn then
                            btn.Text = "Owned"
                            btn.BackgroundColor3 = GREEN
                        end
                    end
                end
            end
        elseif action == "ProductGranted" then
            print("[Shop] Purchased: " .. tostring(itemName) .. " (+" .. tostring(amount) .. ")")
        end
    end)
end

print("[GamePassShop] Shop ready for " .. player.Name)
`;
}

// ---------------------------------------------------------------------------
// Game Pass Server — Script (.rbxmx → ServerScriptService)
// Handles MarketplaceService, ProcessReceipt, DataStore, RemoteEvent.
// ---------------------------------------------------------------------------

export function buildGamepassServer(config?: GamepassConfig): string {
  const passes = config?.gamePasses ?? [
    { name: 'VIP', description: '2x coins multiplier + VIP area access' },
    { name: 'Speed Boost', description: 'Permanent 2x walk speed' },
    { name: 'Auto Farm', description: 'Auto-collect resources while AFK' },
  ];
  const products = config?.devProducts ?? [
    { name: '100 Coins', description: 'Instant 100 coins', amount: 100 },
    { name: '500 Coins', description: 'Instant 500 coins', amount: 500 },
    { name: 'Starter Pack', description: '200 coins + speed boost for 10 min', amount: 200 },
  ];

  const passLines = passes.map((p, i) =>
    `    ["${p.name}"] = { id = ${(p as { id?: number }).id ?? 0}, description = "${p.description}", order = ${i + 1} }`
  ).join(',\n');
  const prodLines = products.map((p, i) =>
    `    ["${p.name}"] = { id = ${(p as { id?: number }).id ?? 0}, description = "${p.description}", amount = ${(p as { amount?: number }).amount ?? 100}, order = ${i + 1} }`
  ).join(',\n');

  return `-- Placement: ServerScriptService → Script
-- Game Pass & Developer Product Server Handler
-- RunContext=Server: runs from any container, auto-relocates to ServerScriptService

-- ==========================================
-- AUTO-RELOCATE: move to ServerScriptService if not already there
-- (allows single-file .rbxmx drag into StarterGui)
-- ==========================================

local SSS = game:GetService("ServerScriptService")
if script.Parent ~= SSS then
    if SSS:FindFirstChild("MonetizationServer") then
        script:Destroy()
        return
    end
    script.Parent = SSS
end

-- ==========================================
-- CONFIG — Replace id = 0 with your real IDs
-- ==========================================

local GAME_PASSES = {
${passLines}
}

local DEV_PRODUCTS = {
${prodLines}
}

-- ==========================================
-- SERVICES
-- ==========================================

local MarketplaceService = game:GetService("MarketplaceService")
local Players = game:GetService("Players")
local DataStoreService = game:GetService("DataStoreService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

-- Create RemoteEvent for client-server communication
local remoteEvent = Instance.new("RemoteEvent")
remoteEvent.Name = "MonetizationEvent"
remoteEvent.Parent = ReplicatedStorage

-- Receipt DataStore to prevent double-processing
local receiptStore = DataStoreService:GetDataStore("PurchaseReceipts")

-- ==========================================
-- GRANT BENEFITS
-- ==========================================

local function grantPassBenefits(player, passName)
    if passName == "VIP" then
        player:SetAttribute("VIP", true)
        player:SetAttribute("CoinMultiplier", 2)
    elseif passName:find("Speed") then
        player:SetAttribute("SpeedBoost", true)
        if player.Character and player.Character:FindFirstChild("Humanoid") then
            player.Character.Humanoid.WalkSpeed = 32
        end
    elseif passName:find("Auto") or passName:find("Farm") then
        player:SetAttribute("AutoFarm", true)
    else
        player:SetAttribute(passName:gsub("%s+", ""), true)
    end
    print("[Shop] " .. player.Name .. " granted: " .. passName)
end

-- ==========================================
-- GAME PASS OWNERSHIP CHECK
-- ==========================================

local function checkGamePasses(player)
    for passName, passData in pairs(GAME_PASSES) do
        if passData.id ~= 0 then
            local success, owns = pcall(function()
                return MarketplaceService:UserOwnsGamePassAsync(player.UserId, passData.id)
            end)
            if success and owns then
                grantPassBenefits(player, passName)
                remoteEvent:FireClient(player, "PassOwned", passName)
            end
        end
    end
end

-- ==========================================
-- PURCHASE HANDLERS
-- ==========================================

MarketplaceService.PromptGamePassPurchaseFinished:Connect(function(player, passId, purchased)
    if not purchased then return end
    for passName, passData in pairs(GAME_PASSES) do
        if passData.id == passId then
            grantPassBenefits(player, passName)
            remoteEvent:FireClient(player, "PassGranted", passName)
            break
        end
    end
end)

MarketplaceService.ProcessReceipt = function(receiptInfo)
    local player = Players:GetPlayerByUserId(receiptInfo.PlayerId)
    if not player then return Enum.ProductPurchaseDecision.NotProcessedYet end

    local receiptKey = tostring(receiptInfo.PurchaseId)
    local success, alreadyProcessed = pcall(function()
        return receiptStore:GetAsync(receiptKey)
    end)
    if success and alreadyProcessed then
        return Enum.ProductPurchaseDecision.PurchaseGranted
    end

    local granted = false
    for productName, productData in pairs(DEV_PRODUCTS) do
        if productData.id == receiptInfo.ProductId then
            local leaderstats = player:FindFirstChild("leaderstats")
            if leaderstats and leaderstats:FindFirstChild("Coins") then
                leaderstats.Coins.Value = leaderstats.Coins.Value + (productData.amount or 100)
            end
            remoteEvent:FireClient(player, "ProductGranted", productName, productData.amount or 100)
            granted = true
            print("[Shop] " .. player.Name .. " purchased: " .. productName)
            break
        end
    end

    if not granted then
        return Enum.ProductPurchaseDecision.NotProcessedYet
    end

    pcall(function()
        receiptStore:SetAsync(receiptKey, true)
    end)
    return Enum.ProductPurchaseDecision.PurchaseGranted
end

-- ==========================================
-- PLAYER SETUP
-- ==========================================

Players.PlayerAdded:Connect(function(player)
    local leaderstats = Instance.new("Folder")
    leaderstats.Name = "leaderstats"
    leaderstats.Parent = player

    local coins = Instance.new("IntValue")
    coins.Name = "Coins"
    coins.Value = 0
    coins.Parent = leaderstats

    checkGamePasses(player)

    player.CharacterAdded:Connect(function(char)
        if player:GetAttribute("SpeedBoost") then
            local humanoid = char:WaitForChild("Humanoid", 5)
            if humanoid then humanoid.WalkSpeed = 32 end
        end
    end)
end)

-- Handle buy requests from ShopClient
remoteEvent.OnServerEvent:Connect(function(player, action, itemName)
    if action == "BuyPass" then
        local passData = GAME_PASSES[itemName]
        if passData and passData.id ~= 0 then
            MarketplaceService:PromptGamePassPurchase(player, passData.id)
        else
            warn("[Shop] Pass not configured: " .. tostring(itemName))
        end
    elseif action == "BuyProduct" then
        local prodData = DEV_PRODUCTS[itemName]
        if prodData and prodData.id ~= 0 then
            MarketplaceService:PromptProductPurchase(player, prodData.id)
        else
            warn("[Shop] Product not configured: " .. tostring(itemName))
        end
    end
end)

-- Late joiners
for _, player in ipairs(Players:GetPlayers()) do
    task.spawn(function()
        checkGamePasses(player)
    end)
end

print("[MonetizationServer] Server ready!")
`;
}

// ---------------------------------------------------------------------------
// Combined .rbxmx — ScreenGui (root) containing LocalScript + Script
// Single file: drag into StarterGui → Script auto-moves to ServerScriptService
// ScreenGui is direct child of StarterGui → renders correctly
// ---------------------------------------------------------------------------

export function buildGamepassCombinedRbxmx(config?: GamepassConfig, title?: string): string {
  const shopCode = buildGamepassShopClient(config);
  const serverCode = buildGamepassServer(config);
  const guiName = title || 'ShopGui';

  return `<roblox xmlns:xmime="http://www.w3.org/2005/05/xmlmime" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://www.roblox.com/roblox.xsd" version="4">
\t<Item class="ScreenGui" referent="RBX0001">
\t\t<Properties>
\t\t\t<string name="Name">${escapeXml(guiName)}</string>
\t\t\t<bool name="ResetOnSpawn">false</bool>
\t\t\t<bool name="IgnoreGuiInset">true</bool>
\t\t\t<token name="ZIndexBehavior">1</token>
\t\t\t<int name="DisplayOrder">10</int>
\t\t</Properties>
\t\t<Item class="LocalScript" referent="RBX0002">
\t\t\t<Properties>
\t\t\t\t<string name="Name">GamePassShop</string>
\t\t\t\t<ProtectedString name="Source"><![CDATA[${shopCode}]]></ProtectedString>
\t\t\t\t<bool name="Disabled">false</bool>
\t\t\t</Properties>
\t\t</Item>
\t\t<Item class="Script" referent="RBX0003">
\t\t\t<Properties>
\t\t\t\t<string name="Name">MonetizationServer</string>
\t\t\t\t<ProtectedString name="Source"><![CDATA[${serverCode}]]></ProtectedString>
\t\t\t\t<token name="RunContext">1</token>
\t\t\t</Properties>
\t\t</Item>
\t</Item>
</roblox>`;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export function buildUIScript(params: UITemplateParams): string {
  const type = (params.uiType || '').toLowerCase();
  if (type.includes('shop'))                               return buildShopScript(params);
  if (type.includes('inventory') || type.includes('inv')) return buildInventoryScript(params);
  if (type.includes('dialogue') || type.includes('dialog') || type.includes('npc')) return buildDialogueScript(params);
  if (type.includes('leaderboard') || type.includes('rank')) return buildLeaderboardScript(params);
  if (type.includes('notification') || type.includes('toast') || type.includes('notif')) return buildNotificationScript(params);
  if (type.includes('menu') || type.includes('main'))     return buildMainMenuScript(params);
  // Default: HUD
  return buildHudScript(params);
}

// ---------------------------------------------------------------------------
// Standalone Luau Script Systems (multi-file, production-ready)
// Each function returns multi-file Luau separated by -- FILE: markers
// ---------------------------------------------------------------------------

function buildPetSystemScript(): string {
  return `-- FILE: PetConfig.lua (place in ReplicatedStorage)
-- System: Pet System — Config
-- Placement: ReplicatedStorage
local PetConfig = {}

PetConfig.PETS = {
    ["Common Cat"]   = { rarity = "Common",    weight = 60, coinBonus = 1.05 },
    ["Blue Bunny"]   = { rarity = "Uncommon",  weight = 25, coinBonus = 1.15 },
    ["Fire Fox"]     = { rarity = "Rare",       weight = 10, coinBonus = 1.30 },
    ["Golden Dragon"]= { rarity = "Epic",       weight = 4,  coinBonus = 1.60 },
    ["Shadow Wolf"]  = { rarity = "Legendary",  weight = 1,  coinBonus = 2.00 },
}

PetConfig.EGG_COST = 100          -- TODO: adjust to your economy
PetConfig.MAX_EQUIPPED_PETS = 3
PetConfig.ORBIT_RADIUS = 4
PetConfig.ORBIT_SPEED = 0.3       -- revolutions per second (1 full circle ~3.3s)

return PetConfig

-- FILE: PetServer.lua (place in ServerScriptService)
-- System: Pet System — Server
-- Placement: ServerScriptService
-- Services used: Players, ReplicatedStorage, RunService, DataStoreService (optional)
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

-- Create RemoteEvent FIRST so the client can connect even if DataStore is unavailable
-- (DataStore APIs throw in unpublished Studio places unless "Studio Access to API Services" is on).
local remote = Instance.new("RemoteEvent"); remote.Name = "PetRemote"; remote.Parent = ReplicatedStorage

local PetConfig = require(ReplicatedStorage:WaitForChild("PetConfig"))

-- DataStore is OPTIONAL — pet ownership persists across sessions if available,
-- otherwise it lives in memory only (perfectly fine for Studio testing).
local DataStoreService = game:GetService("DataStoreService")
local petStore
do
    local ok, storeOrErr = pcall(function() return DataStoreService:GetDataStore("PetData_v1") end)
    if ok then
        petStore = storeOrErr
    else
        warn("[PetServer] DataStore unavailable (Studio without API Services?): " .. tostring(storeOrErr))
    end
end

local playerPets = {}  -- [userId] = { equipped = {petName,...}, owned = {petName,...} }

local function loadData(player)
    if not petStore then
        playerPets[player.UserId] = { equipped = {}, owned = {} }
        return
    end
    local ok, data = pcall(function() return petStore:GetAsync(tostring(player.UserId)) end)
    playerPets[player.UserId] = (ok and data) or { equipped = {}, owned = {} }
end

local function saveData(player)
    if not petStore then return end
    local data = playerPets[player.UserId]
    if not data then return end
    for attempt = 1, 3 do
        local ok = pcall(function() petStore:SetAsync(tostring(player.UserId), data) end)
        if ok then break end
        task.wait(1)
    end
end

local function rollPet()
    local totalWeight = 0
    for _, v in pairs(PetConfig.PETS) do totalWeight += v.weight end
    local roll = math.random(1, totalWeight)
    local acc = 0
    for name, v in pairs(PetConfig.PETS) do
        acc += v.weight
        if roll <= acc then return name end
    end
end

-- Visual palette: pet name → body BrickColor. Keeps pets visually distinct
-- without pulling in MeshPart asset IDs (which require a Roblox upload).
local PET_COLORS = {
    ["Common Cat"]    = BrickColor.new("Medium stone grey"),
    ["Blue Bunny"]    = BrickColor.new("Bright blue"),
    ["Fire Fox"]      = BrickColor.new("Bright orange"),
    ["Golden Dragon"] = BrickColor.new("Bright yellow"),
    ["Shadow Wolf"]   = BrickColor.new("Really black"),
}

-- Build a simple anchored creature Model from primitive parts.
-- All parts are Anchored = true; positioning is handled by Model:PivotTo()
-- in the Heartbeat loop — no WeldConstraint, no physics, no dragging the
-- player assembly around. Head faces -Z so CFrame.lookAt works.
local function createPetModel(petName)
    local color = PET_COLORS[petName] or BrickColor.new("Medium stone grey")
    local earColor = BrickColor.new("Pink")
    local model = Instance.new("Model")
    model.Name = "Pet_" .. petName

    local function newPart(name, shape, size, offset, brickColor)
        local p = Instance.new("Part")
        p.Name = name
        if shape then p.Shape = shape end
        p.Size = size
        p.Anchored = true
        p.CanCollide = false
        p.Massless = true
        p.BrickColor = brickColor or color
        p.Material = Enum.Material.SmoothPlastic
        p.CFrame = offset
        p.Parent = model
        return p
    end

    -- Body (primary part — pivot/driver)
    local body = newPart("Body", Enum.PartType.Ball, Vector3.new(2.2, 2.0, 2.2), CFrame.new(0, 0, 0))
    model.PrimaryPart = body

    -- Head (forward + slightly up)
    newPart("Head", Enum.PartType.Ball, Vector3.new(1.6, 1.6, 1.6), CFrame.new(0, 0.6, -1.4))
    -- Eyes
    newPart("EyeL", Enum.PartType.Ball, Vector3.new(0.35, 0.35, 0.35), CFrame.new(-0.4, 0.8, -2.05), BrickColor.new("Really black"))
    newPart("EyeR", Enum.PartType.Ball, Vector3.new(0.35, 0.35, 0.35), CFrame.new( 0.4, 0.8, -2.05), BrickColor.new("Really black"))
    -- Nose
    newPart("Nose", Enum.PartType.Ball, Vector3.new(0.25, 0.25, 0.25), CFrame.new(0, 0.45, -2.15), BrickColor.new("Pink"))
    -- Ears (tilted block wedges)
    newPart("EarL", nil, Vector3.new(0.55, 0.9, 0.55), CFrame.new(-0.55, 1.5, -1.2) * CFrame.Angles(0, 0, math.rad(-12)), earColor)
    newPart("EarR", nil, Vector3.new(0.55, 0.9, 0.55), CFrame.new( 0.55, 1.5, -1.2) * CFrame.Angles(0, 0, math.rad( 12)), earColor)
    -- Tail (thin cylinder, tilted up)
    newPart("Tail", Enum.PartType.Cylinder, Vector3.new(1.8, 0.35, 0.35), CFrame.new(0, 0.4, 1.6) * CFrame.Angles(0, 0, math.rad(35)))
    -- Legs (4 small blocks underneath)
    newPart("LegFL", nil, Vector3.new(0.4, 0.6, 0.4), CFrame.new(-0.7, -1.1, -0.7))
    newPart("LegFR", nil, Vector3.new(0.4, 0.6, 0.4), CFrame.new( 0.7, -1.1, -0.7))
    newPart("LegBL", nil, Vector3.new(0.4, 0.6, 0.4), CFrame.new(-0.7, -1.1,  0.7))
    newPart("LegBR", nil, Vector3.new(0.4, 0.6, 0.4), CFrame.new( 0.7, -1.1,  0.7))

    -- Name tag on body
    local tag = Instance.new("BillboardGui")
    tag.Size = UDim2.new(0, 80, 0, 20)
    tag.StudsOffset = Vector3.new(0, 2.6, 0)
    tag.AlwaysOnTop = true
    tag.Parent = body
    local lbl = Instance.new("TextLabel")
    lbl.Size = UDim2.fromScale(1, 1)
    lbl.BackgroundTransparency = 1
    lbl.Text = petName
    lbl.TextColor3 = Color3.new(1, 1, 1)
    lbl.TextStrokeTransparency = 0
    lbl.TextScaled = true
    lbl.Parent = tag

    return model
end

local function spawnPetModel(player, petName, index)
    local char = player.Character
    if not char then return end
    local hrp = char:FindFirstChild("HumanoidRootPart")
    if not hrp then return end
    local model = createPetModel(petName)
    model.Name = "Pet_" .. index .. "_" .. petName
    model.Parent = workspace
    local conn
    conn = RunService.Heartbeat:Connect(function()
        if not model.Parent or not hrp.Parent then
            conn:Disconnect()
            if model.Parent then model:Destroy() end
            return
        end
        local angle = tick() * PetConfig.ORBIT_SPEED * 2 * math.pi + (index - 1) * (2 * math.pi / PetConfig.MAX_EQUIPPED_PETS)
        local petPos = hrp.Position + Vector3.new(math.cos(angle) * PetConfig.ORBIT_RADIUS, 1, math.sin(angle) * PetConfig.ORBIT_RADIUS)
        -- Face the player so head (built at -Z) points at them
        model:PivotTo(CFrame.lookAt(petPos, hrp.Position))
    end)
end

remote.OnServerEvent:Connect(function(player, action, data)
    local pd = playerPets[player.UserId]
    if not pd then return end
    if action == "HatchEgg" then
        local leaderstats = player:FindFirstChild("leaderstats")
        local coins = leaderstats and leaderstats:FindFirstChild("Coins")
        if not coins or coins.Value < PetConfig.EGG_COST then
            remote:FireClient(player, "HatchResult", nil, "NotEnoughCoins"); return
        end
        coins.Value -= PetConfig.EGG_COST
        local petName = rollPet()
        table.insert(pd.owned, petName)
        -- Auto-equip if there's room (demo convenience — replace with real equip UI later)
        if #pd.equipped < PetConfig.MAX_EQUIPPED_PETS then
            table.insert(pd.equipped, petName)
            spawnPetModel(player, petName, #pd.equipped)
        end
        saveData(player)
        remote:FireClient(player, "HatchResult", petName, "OK")
    elseif action == "EquipPet" and type(data) == "string" then
        if #pd.equipped >= PetConfig.MAX_EQUIPPED_PETS then
            remote:FireClient(player, "EquipResult", false, "MaxPets"); return
        end
        local found = table.find(pd.owned, data)
        if found then
            table.insert(pd.equipped, data)
            spawnPetModel(player, data, #pd.equipped)
            saveData(player)
            remote:FireClient(player, "EquipResult", true, data)
        end
    elseif action == "GetPets" then
        remote:FireClient(player, "PetsData", pd)
    end
end)

-- Spawn a visible demo egg near the origin so the hatch loop is testable
-- out of the box. PetClient auto-wires any ProximityPrompt named "HatchPrompt".
local function spawnDemoEgg()
    if workspace:FindFirstChild("DemoHatchEgg") then return end
    local egg = Instance.new("Part")
    egg.Name = "DemoHatchEgg"
    egg.Shape = Enum.PartType.Ball
    egg.Size = Vector3.new(4, 5, 4)
    egg.Position = Vector3.new(0, 5, 10)
    egg.Anchored = true
    egg.CanCollide = true
    egg.BrickColor = BrickColor.new("Bright yellow")
    egg.Material = Enum.Material.Neon
    egg.Parent = workspace
    local prompt = Instance.new("ProximityPrompt")
    prompt.Name = "HatchPrompt"
    prompt.ActionText = "Hatch Egg (" .. tostring(PetConfig.EGG_COST) .. " Coins)"
    prompt.ObjectText = "Pet Egg"
    prompt.HoldDuration = 0.5
    prompt.MaxActivationDistance = 10
    prompt.Parent = egg
end
spawnDemoEgg()

Players.PlayerAdded:Connect(function(player)
    -- leaderstats so HatchEgg can succeed and Coins display in the player list
    local leaderstats = Instance.new("Folder")
    leaderstats.Name = "leaderstats"
    leaderstats.Parent = player
    local coins = Instance.new("IntValue")
    coins.Name = "Coins"
    coins.Value = 500  -- starter coins = 5 hatches at default EGG_COST
    coins.Parent = leaderstats

    loadData(player)
    local pd = playerPets[player.UserId]
    -- First-time demo: grant a starter pet so player sees the system work immediately
    if pd and #pd.owned == 0 then
        table.insert(pd.owned, "Common Cat")
        table.insert(pd.equipped, "Common Cat")
        saveData(player)
    end

    player.CharacterAdded:Connect(function()
        task.wait(1)
        local pd2 = playerPets[player.UserId]
        if pd2 then
            for i, petName in ipairs(pd2.equipped) do spawnPetModel(player, petName, i) end
        end
    end)
end)

Players.PlayerRemoving:Connect(function(player)
    saveData(player)
    playerPets[player.UserId] = nil
end)

print("[PetServer] Ready!")

-- FILE: PetClient.lua (place in StarterPlayerScripts)
-- System: Pet System — Client
-- Placement: StarterPlayerScripts
-- Services used: Players, ReplicatedStorage
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local remote = ReplicatedStorage:WaitForChild("PetRemote")
local player = Players.LocalPlayer

-- Request current pet data on join
remote:FireServer("GetPets")

remote.OnClientEvent:Connect(function(action, data, extra)
    if action == "HatchResult" then
        if data then
            print("[PetClient] Hatched: " .. tostring(data))
            -- TODO: show hatch animation/popup here
        else
            print("[PetClient] Hatch failed: " .. tostring(extra))
        end
    elseif action == "EquipResult" then
        print("[PetClient] Equip: " .. tostring(data) .. " | " .. tostring(extra))
    elseif action == "PetsData" then
        -- TODO: populate pet inventory UI with data.owned / data.equipped
    end
end)

-- Example: hatch on proximity prompt (wire to an egg Part with ProximityPrompt named "HatchPrompt")
local function wireEggs()
    for _, obj in ipairs(workspace:GetDescendants()) do
        if obj:IsA("ProximityPrompt") and obj.Name == "HatchPrompt" then
            obj.Triggered:Connect(function() remote:FireServer("HatchEgg") end)
        end
    end
end
workspace.DescendantAdded:Connect(function(obj)
    if obj:IsA("ProximityPrompt") and obj.Name == "HatchPrompt" then
        obj.Triggered:Connect(function() remote:FireServer("HatchEgg") end)
    end
end)
wireEggs()`;
}

function buildDailyRewardsScript(): string {
  return `-- FILE: DailyRewardsServer.lua (place in ServerScriptService)
-- System: Daily Rewards — Server
-- Placement: ServerScriptService
-- Services used: Players, DataStoreService, ReplicatedStorage
local Players = game:GetService("Players")
local DataStoreService = game:GetService("DataStoreService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local rewardStore = DataStoreService:GetDataStore("DailyRewards_v1")
local remote = Instance.new("RemoteEvent"); remote.Name = "DailyRewardRemote"; remote.Parent = ReplicatedStorage

-- TODO: customise reward table for your economy
local REWARDS = {
    { label = "Day 1",  coins = 50,  bonus = "" },
    { label = "Day 2",  coins = 75,  bonus = "" },
    { label = "Day 3",  coins = 100, bonus = "Speed Boost" },
    { label = "Day 4",  coins = 125, bonus = "" },
    { label = "Day 5",  coins = 150, bonus = "" },
    { label = "Day 6",  coins = 200, bonus = "XP Boost" },
    { label = "Day 7",  coins = 300, bonus = "VIP Badge" },
}
local SECONDS_PER_DAY = 86400

local function getToday() return math.floor(os.time() / SECONDS_PER_DAY) end

local function loadRewardData(userId)
    local ok, data = pcall(function() return rewardStore:GetAsync(tostring(userId)) end)
    return (ok and data) or { lastDay = 0, streak = 0 }
end

local function saveRewardData(userId, data)
    for i = 1, 3 do
        local ok = pcall(function() rewardStore:SetAsync(tostring(userId), data) end)
        if ok then return end
        task.wait(1)
    end
end

Players.PlayerAdded:Connect(function(player)
    task.wait(1)  -- wait for character
    local data = loadRewardData(player.UserId)
    local today = getToday()

    if data.lastDay == today then
        remote:FireClient(player, "AlreadyClaimed", data.streak)
        return
    end

    -- Reset streak if missed a day
    if today - data.lastDay > 1 then data.streak = 0 end
    data.streak = math.min(data.streak + 1, #REWARDS)
    data.lastDay = today

    local reward = REWARDS[data.streak]
    saveRewardData(player.UserId, data)

    -- Grant coins
    local leaderstats = player:FindFirstChild("leaderstats")
    local coins = leaderstats and leaderstats:FindFirstChild("Coins")
    if coins then coins.Value += reward.coins end

    remote:FireClient(player, "ShowReward", reward, data.streak)
    print("[DailyRewards] " .. player.Name .. " claimed day " .. data.streak .. ": " .. reward.coins .. " coins")
end)

-- FILE: DailyRewardsGui.lua (place in StarterGui)
-- System: Daily Rewards — Client GUI
-- Placement: StarterGui
-- Services used: Players, ReplicatedStorage, TweenService
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")
local remote = ReplicatedStorage:WaitForChild("DailyRewardRemote")
local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")

local function buildGui(reward, streak)
    local screenGui = Instance.new("ScreenGui")
    screenGui.Name = "DailyRewardGui"
    screenGui.ResetOnSpawn = false
    screenGui.IgnoreGuiInset = true
    screenGui.Parent = playerGui

    local overlay = Instance.new("Frame", screenGui)
    overlay.Size = UDim2.fromScale(1, 1)
    overlay.BackgroundColor3 = Color3.new(0, 0, 0)
    overlay.BackgroundTransparency = 0.5
    overlay.ZIndex = 10

    local card = Instance.new("Frame", overlay)
    card.Size = UDim2.fromOffset(340, 220)
    card.Position = UDim2.fromScale(0.5, 0.5)
    card.AnchorPoint = Vector2.new(0.5, 0.5)
    card.BackgroundColor3 = Color3.fromRGB(30, 30, 50)
    card.ZIndex = 11
    Instance.new("UICorner", card).CornerRadius = UDim.new(0, 16)

    local title = Instance.new("TextLabel", card)
    title.Size = UDim2.new(1, 0, 0, 40)
    title.Position = UDim2.fromOffset(0, 12)
    title.BackgroundTransparency = 1
    title.Text = "🎁  Daily Reward — Day " .. streak
    title.TextColor3 = Color3.fromRGB(255, 220, 60)
    title.TextScaled = true
    title.Font = Enum.Font.GothamBold
    title.ZIndex = 12

    local coinsLbl = Instance.new("TextLabel", card)
    coinsLbl.Size = UDim2.new(1, 0, 0, 50)
    coinsLbl.Position = UDim2.fromOffset(0, 70)
    coinsLbl.BackgroundTransparency = 1
    coinsLbl.Text = "+" .. reward.coins .. " Coins"
    coinsLbl.TextColor3 = Color3.fromRGB(80, 255, 120)
    coinsLbl.TextScaled = true
    coinsLbl.Font = Enum.Font.GothamBold
    coinsLbl.ZIndex = 12

    if reward.bonus ~= "" then
        local bonusLbl = Instance.new("TextLabel", card)
        bonusLbl.Size = UDim2.new(1, 0, 0, 30)
        bonusLbl.Position = UDim2.fromOffset(0, 128)
        bonusLbl.BackgroundTransparency = 1
        bonusLbl.Text = "Bonus: " .. reward.bonus
        bonusLbl.TextColor3 = Color3.fromRGB(200, 160, 255)
        bonusLbl.TextScaled = true
        bonusLbl.ZIndex = 12
    end

    local claimBtn = Instance.new("TextButton", card)
    claimBtn.Size = UDim2.fromOffset(160, 44)
    claimBtn.Position = UDim2.new(0.5, -80, 1, -56)
    claimBtn.BackgroundColor3 = Color3.fromRGB(80, 180, 255)
    claimBtn.Text = "Claim!"
    claimBtn.TextColor3 = Color3.new(1, 1, 1)
    claimBtn.TextScaled = true
    claimBtn.Font = Enum.Font.GothamBold
    claimBtn.ZIndex = 12
    Instance.new("UICorner", claimBtn).CornerRadius = UDim.new(0, 10)

    claimBtn.MouseButton1Click:Connect(function()
        TweenService:Create(card, TweenInfo.new(0.25), { Size = UDim2.fromOffset(0, 0) }):Play()
        task.wait(0.3)
        screenGui:Destroy()
    end)
end

remote.OnClientEvent:Connect(function(action, reward, streak)
    if action == "ShowReward" then
        buildGui(reward, streak)
    end
end)`;
}

function buildDayNightCycleScript(): string {
  return `-- FILE: DayNightCycle.lua (place in ServerScriptService)
-- System: Day/Night Cycle
-- Placement: ServerScriptService
-- Services used: Lighting, ReplicatedStorage, RunService
local Lighting = game:GetService("Lighting")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

-- TODO: tune these values for your game
local CYCLE_MINUTES = 10     -- real minutes per full day/night cycle
local DAY_START    = 8       -- clock hour when "day" event fires
local NIGHT_START  = 20      -- clock hour when "night" event fires
local CYCLE_SPEED  = 24 / (CYCLE_MINUTES * 60)  -- clock hours per second

-- RemoteEvents so clients can react (e.g. play ambient sounds)
local dayEvent = Instance.new("RemoteEvent"); dayEvent.Name = "DayStarted"; dayEvent.Parent = ReplicatedStorage
local nightEvent = Instance.new("RemoteEvent"); nightEvent.Name = "NightStarted"; nightEvent.Parent = ReplicatedStorage

local prevHour = Lighting.ClockTime
local sentDayEvent = false
local sentNightEvent = false

-- Atmosphere settings per time of day
local function applyTimeOfDay(hour)
    if hour >= DAY_START and hour < NIGHT_START then
        -- Daytime
        Lighting.Ambient = Color3.fromRGB(120, 120, 130)
        Lighting.OutdoorAmbient = Color3.fromRGB(180, 180, 190)
        Lighting.Brightness = 2
        Lighting.FogEnd = 1200
    else
        -- Nighttime
        Lighting.Ambient = Color3.fromRGB(30, 30, 60)
        Lighting.OutdoorAmbient = Color3.fromRGB(40, 40, 80)
        Lighting.Brightness = 0.4
        Lighting.FogEnd = 600
    end
end

RunService.Heartbeat:Connect(function(dt)
    local newTime = (Lighting.ClockTime + CYCLE_SPEED * dt) % 24
    Lighting.ClockTime = newTime
    applyTimeOfDay(newTime)

    -- Fire day/night transition events once per transition
    if newTime >= DAY_START and prevHour < DAY_START and not sentDayEvent then
        sentDayEvent = true
        sentNightEvent = false
        dayEvent:FireAllClients()
        print("[DayNightCycle] Daytime")
    end
    if newTime >= NIGHT_START and prevHour < NIGHT_START and not sentNightEvent then
        sentNightEvent = true
        sentDayEvent = false
        nightEvent:FireAllClients()
        print("[DayNightCycle] Nighttime")
    end
    prevHour = newTime
end)

print("[DayNightCycle] Running — " .. CYCLE_MINUTES .. " min cycle")`;
}

function buildTeleportationScript(): string {
  return `-- FILE: TeleportConfig.lua (place in ReplicatedStorage)
-- System: Teleportation — Config
-- Placement: ReplicatedStorage
local TeleportConfig = {}

-- TODO: replace placeId values with your actual Roblox Place IDs
TeleportConfig.ZONES = {
    { name = "Forest Zone",  placeId = 0, padColor = Color3.fromRGB(60, 180, 80)  },
    { name = "Desert Zone",  placeId = 0, padColor = Color3.fromRGB(220, 180, 60) },
    { name = "Snow Zone",    placeId = 0, padColor = Color3.fromRGB(180, 220, 255) },
    { name = "Lava Zone",    placeId = 0, padColor = Color3.fromRGB(255, 80, 40)  },
}

TeleportConfig.PAD_SIZE   = Vector3.new(8, 0.4, 8)
TeleportConfig.COOLDOWN   = 5   -- seconds before player can re-trigger
TeleportConfig.SPAWN_Y    = 5   -- Y offset above pad for pad placement

return TeleportConfig

-- FILE: TeleportServer.lua (place in ServerScriptService)
-- System: Teleportation — Server
-- Placement: ServerScriptService
-- Services used: Players, TeleportService, ReplicatedStorage
local Players = game:GetService("Players")
local TeleportService = game:GetService("TeleportService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local TeleportConfig = require(ReplicatedStorage:WaitForChild("TeleportConfig"))
local remote = Instance.new("RemoteEvent"); remote.Name = "TeleportRemote"; remote.Parent = ReplicatedStorage
local cooldowns = {}  -- [userId] = os.clock()

-- Build teleport pads at origin positions
local function buildPad(zone, position)
    local pad = Instance.new("Part", workspace)
    pad.Name = "TeleportPad_" .. zone.name
    pad.Size = TeleportConfig.PAD_SIZE
    pad.Anchored = true
    pad.BrickColor = BrickColor.new(zone.padColor)
    pad.Material = Enum.Material.Neon
    pad.CFrame = CFrame.new(position)

    local billboard = Instance.new("BillboardGui", pad)
    billboard.Size = UDim2.fromOffset(160, 36)
    billboard.StudsOffset = Vector3.new(0, 3, 0)
    billboard.AlwaysOnTop = false
    local lbl = Instance.new("TextLabel", billboard)
    lbl.Size = UDim2.fromScale(1, 1)
    lbl.BackgroundTransparency = 1
    lbl.Text = "→ " .. zone.name
    lbl.TextColor3 = Color3.new(1, 1, 1)
    lbl.TextScaled = true
    lbl.Font = Enum.Font.GothamBold

    local prompt = Instance.new("ProximityPrompt", pad)
    prompt.ObjectText = zone.name
    prompt.ActionText = "Teleport"
    prompt.HoldDuration = 0.5
    prompt.MaxActivationDistance = 10

    prompt.Triggered:Connect(function(player)
        local now = os.clock()
        if cooldowns[player.UserId] and now - cooldowns[player.UserId] < TeleportConfig.COOLDOWN then
            remote:FireClient(player, "Cooldown"); return
        end
        if zone.placeId == 0 then
            -- Same-place teleport (no placeId set): send to a spawn location by name
            local spawnName = zone.name:gsub(" ", "_") .. "_Spawn"
            local spawnPart = workspace:FindFirstChild(spawnName)
            if spawnPart and player.Character then
                local hrp = player.Character:FindFirstChild("HumanoidRootPart")
                if hrp then hrp.CFrame = spawnPart.CFrame + Vector3.new(0, 3, 0) end
            end
            remote:FireClient(player, "TeleportLocal", zone.name)
            return
        end
        cooldowns[player.UserId] = now
        remote:FireClient(player, "TeleportStart", zone.name)
        local options = TeleportService:SetTeleportGui(nil)
        local ok, err = pcall(function()
            TeleportService:TeleportAsync(zone.placeId, { player })
        end)
        if not ok then
            warn("[Teleport] Failed: " .. tostring(err))
            remote:FireClient(player, "TeleportFailed", zone.name)
        end
    end)
end

-- TODO: place pads in your world — replace Vector3 positions below
for i, zone in ipairs(TeleportConfig.ZONES) do
    buildPad(zone, Vector3.new((i - 1) * 20, TeleportConfig.SPAWN_Y, 0))
end

remote.OnServerEvent:Connect(function(_player, _action) end)  -- placeholder for future client→server calls
print("[TeleportServer] " .. #TeleportConfig.ZONES .. " zones loaded")`;
}

function buildRebirthScript(): string {
  return `-- FILE: RebirthServer.lua (place in ServerScriptService)
-- System: Rebirth / Prestige — Server
-- Placement: ServerScriptService
-- Services used: Players, DataStoreService, ReplicatedStorage
local Players = game:GetService("Players")
local DataStoreService = game:GetService("DataStoreService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local rebirthStore = DataStoreService:GetDataStore("RebirthData_v1")
local remote = Instance.new("RemoteEvent"); remote.Name = "RebirthRemote"; remote.Parent = ReplicatedStorage

-- TODO: set rebirth cost in your currency
local BASE_REBIRTH_COST = 1000000
local REBIRTH_COST_SCALE = 2  -- each rebirth costs 2× more

local playerData = {}

local function rebirthCost(count) return BASE_REBIRTH_COST * math.pow(REBIRTH_COST_SCALE, count) end

local function loadData(player)
    local ok, data = pcall(function() return rebirthStore:GetAsync(tostring(player.UserId)) end)
    playerData[player.UserId] = (ok and data) or { rebirths = 0, multiplier = 1 }
end

local function saveData(player)
    local data = playerData[player.UserId]
    if not data then return end
    for i = 1, 3 do
        local ok = pcall(function() rebirthStore:SetAsync(tostring(player.UserId), data) end)
        if ok then return end
        task.wait(1)
    end
end

local function syncLeaderstats(player)
    local data = playerData[player.UserId]
    if not data then return end
    local ls = player:FindFirstChild("leaderstats")
    if not ls then return end
    local rv = ls:FindFirstChild("Rebirths") or Instance.new("IntValue", ls)
    rv.Name = "Rebirths"; rv.Value = data.rebirths
    local mv = ls:FindFirstChild("Multiplier") or Instance.new("NumberValue", ls)
    mv.Name = "Multiplier"; mv.Value = data.multiplier
end

remote.OnServerEvent:Connect(function(player, action)
    local data = playerData[player.UserId]
    if not data then return end

    if action == "Rebirth" then
        local ls = player:FindFirstChild("leaderstats")
        local coins = ls and ls:FindFirstChild("Coins")
        local cost = rebirthCost(data.rebirths)
        if not coins or coins.Value < cost then
            remote:FireClient(player, "RebirthFailed", "NotEnoughCoins", cost); return
        end
        -- Reset economy stats
        coins.Value = 0
        -- Grant permanent multiplier (10% per rebirth)
        data.rebirths += 1
        data.multiplier = 1 + 0.10 * data.rebirths
        saveData(player)
        syncLeaderstats(player)
        remote:FireClient(player, "RebirthSuccess", data.rebirths, data.multiplier, rebirthCost(data.rebirths))
        print("[Rebirth] " .. player.Name .. " rebirthed → #" .. data.rebirths .. " (×" .. data.multiplier .. ")")
    elseif action == "GetData" then
        local cost = rebirthCost(data.rebirths)
        remote:FireClient(player, "RebirthData", data.rebirths, data.multiplier, cost)
    end
end)

Players.PlayerAdded:Connect(function(player)
    loadData(player)
    player.CharacterAdded:Connect(function() task.wait(0.5); syncLeaderstats(player) end)
    remote:FireClient(player, "RebirthData", playerData[player.UserId].rebirths, playerData[player.UserId].multiplier, rebirthCost(playerData[player.UserId].rebirths))
end)
Players.PlayerRemoving:Connect(function(player)
    saveData(player); playerData[player.UserId] = nil
end)
print("[RebirthServer] Ready!")

-- FILE: RebirthGui.lua (place in StarterGui)
-- System: Rebirth / Prestige — Client GUI
-- Placement: StarterGui
-- Services used: Players, ReplicatedStorage
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local remote = ReplicatedStorage:WaitForChild("RebirthRemote")
local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")

local screenGui = Instance.new("ScreenGui", playerGui)
screenGui.Name = "RebirthGui"; screenGui.ResetOnSpawn = false

local btn = Instance.new("TextButton", screenGui)
btn.Size = UDim2.fromOffset(180, 50)
btn.Position = UDim2.new(0.5, -90, 1, -70)
btn.BackgroundColor3 = Color3.fromRGB(255, 180, 0)
btn.Text = "⭐ Rebirth"
btn.TextScaled = true
btn.Font = Enum.Font.GothamBold
btn.TextColor3 = Color3.new(0, 0, 0)
Instance.new("UICorner", btn).CornerRadius = UDim.new(0, 12)

local infoLbl = Instance.new("TextLabel", screenGui)
infoLbl.Size = UDim2.fromOffset(260, 30)
infoLbl.Position = UDim2.new(0.5, -130, 1, -105)
infoLbl.BackgroundTransparency = 1
infoLbl.Text = "Cost: ?"
infoLbl.TextColor3 = Color3.fromRGB(255, 220, 100)
infoLbl.TextScaled = true
infoLbl.Font = Enum.Font.Gotham

btn.MouseButton1Click:Connect(function()
    remote:FireServer("Rebirth")
end)

remote.OnClientEvent:Connect(function(action, a, b, c)
    if action == "RebirthData" then
        infoLbl.Text = "Rebirths: " .. tostring(a) .. "  Cost: " .. tostring(math.floor(c))
    elseif action == "RebirthSuccess" then
        btn.Text = "⭐ Rebirth #" .. tostring(a) .. " (×" .. string.format("%.1f", b) .. ")"
        infoLbl.Text = "Cost: " .. tostring(math.floor(c))
    elseif action == "RebirthFailed" then
        infoLbl.Text = "Need " .. tostring(math.floor(c)) .. " coins!"
    end
end)

remote:FireServer("GetData")`;
}

function buildQuestScript(): string {
  return `-- FILE: QuestServer.lua (place in ServerScriptService)
-- System: Quest System — Server
-- Placement: ServerScriptService
-- Services used: Players, DataStoreService, ReplicatedStorage
local Players = game:GetService("Players")
local DataStoreService = game:GetService("DataStoreService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local questStore = DataStoreService:GetDataStore("QuestData_v1")
local remote = Instance.new("RemoteEvent"); remote.Name = "QuestRemote"; remote.Parent = ReplicatedStorage

-- TODO: define your quests here
local QUESTS = {
    { id = "collect_10_coins", title = "Coin Collector",   desc = "Collect 10 coins.",      goal = 10,  reward = 50  },
    { id = "kill_5_enemies",   title = "Warrior",          desc = "Defeat 5 enemies.",       goal = 5,   reward = 150 },
    { id = "reach_stage_5",    title = "Adventurer",       desc = "Reach stage 5.",          goal = 5,   reward = 200 },
    { id = "play_30min",       title = "Dedicated",        desc = "Play for 30 minutes.",    goal = 30,  reward = 300 },
}

local playerData = {}  -- [userId] = { [questId] = { progress, completed } }

local function loadData(player)
    local ok, data = pcall(function() return questStore:GetAsync(tostring(player.UserId)) end)
    playerData[player.UserId] = (ok and data) or {}
end

local function saveData(player)
    local data = playerData[player.UserId]
    if not data then return end
    for i = 1, 3 do
        local ok = pcall(function() questStore:SetAsync(tostring(player.UserId), data) end)
        if ok then return end
        task.wait(1)
    end
end

local function getOrInitQuest(userId, questId)
    local data = playerData[userId]
    if not data[questId] then data[questId] = { progress = 0, completed = false } end
    return data[questId]
end

-- Call this from other server scripts to advance quest progress
-- e.g. QuestServer:AdvanceQuest(player, "collect_10_coins", 1)
local QuestServer = {}
function QuestServer:AdvanceQuest(player, questId, amount)
    local data = playerData[player.UserId]
    if not data then return end
    local qData = getOrInitQuest(player.UserId, questId)
    if qData.completed then return end
    local quest = nil
    for _, q in ipairs(QUESTS) do if q.id == questId then quest = q; break end end
    if not quest then return end
    qData.progress = math.min(qData.progress + (amount or 1), quest.goal)
    if qData.progress >= quest.goal then
        qData.completed = true
        local ls = player:FindFirstChild("leaderstats")
        local coins = ls and ls:FindFirstChild("Coins")
        if coins then coins.Value += quest.reward end
        remote:FireClient(player, "QuestCompleted", quest)
        print("[Quest] " .. player.Name .. " completed: " .. quest.title)
    end
    saveData(player)
    remote:FireClient(player, "QuestProgress", questId, qData.progress, quest.goal)
end
_G.QuestServer = QuestServer  -- expose globally so other scripts can call it

remote.OnServerEvent:Connect(function(player, action, questId)
    if action == "GetQuests" then
        local allData = {}
        for _, q in ipairs(QUESTS) do
            local qd = getOrInitQuest(player.UserId, q.id)
            allData[q.id] = { title = q.title, desc = q.desc, goal = q.goal, progress = qd.progress, completed = qd.completed, reward = q.reward }
        end
        remote:FireClient(player, "QuestsData", allData)
    end
end)

Players.PlayerAdded:Connect(function(player)
    loadData(player)
    task.wait(1)
    remote:FireClient(player, "QuestsInit", QUESTS)
end)
Players.PlayerRemoving:Connect(function(player)
    saveData(player); playerData[player.UserId] = nil
end)
print("[QuestServer] " .. #QUESTS .. " quests loaded")

-- FILE: QuestGui.lua (place in StarterGui)
-- System: Quest System — Client GUI
-- Placement: StarterGui
-- Services used: Players, ReplicatedStorage
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local remote = ReplicatedStorage:WaitForChild("QuestRemote")
local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")

local gui = Instance.new("ScreenGui", playerGui)
gui.Name = "QuestGui"; gui.ResetOnSpawn = false

-- Toggle button
local toggleBtn = Instance.new("TextButton", gui)
toggleBtn.Size = UDim2.fromOffset(100, 36)
toggleBtn.Position = UDim2.new(0, 12, 0.5, -18)
toggleBtn.BackgroundColor3 = Color3.fromRGB(50, 120, 220)
toggleBtn.Text = "📋 Quests"
toggleBtn.TextScaled = true
toggleBtn.Font = Enum.Font.GothamBold
toggleBtn.TextColor3 = Color3.new(1, 1, 1)
Instance.new("UICorner", toggleBtn).CornerRadius = UDim.new(0, 8)

-- Quest panel
local panel = Instance.new("Frame", gui)
panel.Size = UDim2.fromOffset(280, 360)
panel.Position = UDim2.new(0, 120, 0.5, -180)
panel.BackgroundColor3 = Color3.fromRGB(20, 20, 40)
panel.Visible = false
Instance.new("UICorner", panel).CornerRadius = UDim.new(0, 12)

local title = Instance.new("TextLabel", panel)
title.Size = UDim2.new(1, 0, 0, 36)
title.BackgroundTransparency = 1
title.Text = "Active Quests"
title.TextColor3 = Color3.fromRGB(255, 220, 60)
title.TextScaled = true
title.Font = Enum.Font.GothamBold

local list = Instance.new("ScrollingFrame", panel)
list.Size = UDim2.new(1, -8, 1, -44)
list.Position = UDim2.fromOffset(4, 40)
list.BackgroundTransparency = 1
list.ScrollBarThickness = 4
list.CanvasSize = UDim2.new(0, 0, 0, 0)
local layout = Instance.new("UIListLayout", list)
layout.Padding = UDim.new(0, 6)

toggleBtn.MouseButton1Click:Connect(function() panel.Visible = not panel.Visible end)

local function rebuildQuestList(questsData)
    for _, c in ipairs(list:GetChildren()) do
        if c:IsA("Frame") then c:Destroy() end
    end
    for id, q in pairs(questsData) do
        local row = Instance.new("Frame", list)
        row.Size = UDim2.new(1, 0, 0, 70)
        row.BackgroundColor3 = q.completed and Color3.fromRGB(30, 80, 30) or Color3.fromRGB(35, 35, 60)
        Instance.new("UICorner", row).CornerRadius = UDim.new(0, 8)
        local t = Instance.new("TextLabel", row)
        t.Size = UDim2.new(1, -8, 0, 22); t.Position = UDim2.fromOffset(6, 4)
        t.BackgroundTransparency = 1; t.Text = q.title; t.TextColor3 = Color3.new(1,1,1)
        t.TextScaled = true; t.Font = Enum.Font.GothamBold
        local d = Instance.new("TextLabel", row)
        d.Size = UDim2.new(1, -8, 0, 18); d.Position = UDim2.fromOffset(6, 26)
        d.BackgroundTransparency = 1; d.Text = q.desc; d.TextColor3 = Color3.fromRGB(180,180,180)
        d.TextScaled = true; d.Font = Enum.Font.Gotham
        local prog = Instance.new("TextLabel", row)
        prog.Size = UDim2.new(1, -8, 0, 18); prog.Position = UDim2.fromOffset(6, 46)
        prog.BackgroundTransparency = 1
        prog.Text = q.completed and "✅ Complete! +" .. q.reward .. " coins" or (tostring(q.progress) .. " / " .. tostring(q.goal) .. "  Reward: " .. q.reward)
        prog.TextColor3 = q.completed and Color3.fromRGB(80, 255, 80) or Color3.fromRGB(220, 220, 80)
        prog.TextScaled = true; prog.Font = Enum.Font.Gotham
    end
    list.CanvasSize = UDim2.new(0, 0, 0, layout.AbsoluteContentSize.Y + 10)
end

remote.OnClientEvent:Connect(function(action, data, b, c)
    if action == "QuestsData" then rebuildQuestList(data)
    elseif action == "QuestCompleted" then
        -- TODO: show completion popup
        print("[QuestGui] Completed: " .. tostring(data.title))
        remote:FireServer("GetQuests")
    elseif action == "QuestProgress" then
        remote:FireServer("GetQuests")
    end
end)

remote:FireServer("GetQuests")`;
}

function buildDataStoreScript(): string {
  return `-- FILE: DataConfig.lua (place in ReplicatedStorage)
-- System: DataStore Manager — Config
-- Placement: ReplicatedStorage
local DataConfig = {}

-- TODO: add/remove fields to match your game's economy
DataConfig.DEFAULTS = {
    coins      = 0,
    xp         = 0,
    level      = 1,
    rebirths   = 0,
    inventory  = {},   -- array of item names
    settings   = { music = true, sfx = true },
}

DataConfig.STORE_NAME   = "PlayerData_v1"
DataConfig.AUTOSAVE_SEC = 60   -- auto-save interval
DataConfig.MAX_RETRIES  = 3
DataConfig.RETRY_DELAY  = 1

return DataConfig

-- FILE: DataManager.lua (place in ServerScriptService)
-- System: DataStore Manager — Server
-- Placement: ServerScriptService
-- Services used: Players, DataStoreService, ReplicatedStorage
local Players = game:GetService("Players")
local DataStoreService = game:GetService("DataStoreService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local DataConfig = require(ReplicatedStorage:WaitForChild("DataConfig"))
local store = DataStoreService:GetDataStore(DataConfig.STORE_NAME)
local remote = Instance.new("RemoteEvent"); remote.Name = "DataRemote"; remote.Parent = ReplicatedStorage

local cache = {}  -- [userId] = data table (deep copy of defaults + saved values)

local function deepCopy(t)
    local copy = {}
    for k, v in pairs(t) do
        copy[k] = type(v) == "table" and deepCopy(v) or v
    end
    return copy
end

local function loadData(userId)
    local defaults = deepCopy(DataConfig.DEFAULTS)
    for attempt = 1, DataConfig.MAX_RETRIES do
        local ok, saved = pcall(function() return store:GetAsync(tostring(userId)) end)
        if ok then
            if saved then
                for k, v in pairs(saved) do defaults[k] = v end
            end
            return defaults
        end
        warn("[DataManager] Load attempt " .. attempt .. " failed for " .. userId)
        task.wait(DataConfig.RETRY_DELAY)
    end
    warn("[DataManager] Using default data for " .. userId)
    return defaults
end

local function saveData(userId)
    local data = cache[userId]
    if not data then return end
    for attempt = 1, DataConfig.MAX_RETRIES do
        local ok, err = pcall(function() store:SetAsync(tostring(userId), data) end)
        if ok then return end
        warn("[DataManager] Save attempt " .. attempt .. " failed: " .. tostring(err))
        task.wait(DataConfig.RETRY_DELAY)
    end
    warn("[DataManager] All save attempts failed for " .. userId)
end

local function syncLeaderstats(player)
    local data = cache[player.UserId]
    if not data then return end
    local ls = player:FindFirstChild("leaderstats")
    if not ls then
        ls = Instance.new("Folder", player); ls.Name = "leaderstats"
    end
    local function syncValue(name, class, val)
        local v = ls:FindFirstChild(name)
        if not v then v = Instance.new(class, ls); v.Name = name end
        v.Value = val
    end
    syncValue("Coins",    "IntValue",    data.coins)
    syncValue("XP",       "IntValue",    data.xp)
    syncValue("Level",    "IntValue",    data.level)
    syncValue("Rebirths", "IntValue",    data.rebirths)
end

-- Expose DataManager so other scripts can read/write player data
local DataManager = {}
function DataManager:Get(player)   return cache[player.UserId] end
function DataManager:Save(player)  saveData(player.UserId) end
function DataManager:Set(player, key, value)
    if cache[player.UserId] then
        cache[player.UserId][key] = value
        syncLeaderstats(player)
    end
end
_G.DataManager = DataManager  -- global access: _G.DataManager:Set(player, "coins", 100)

Players.PlayerAdded:Connect(function(player)
    cache[player.UserId] = loadData(player.UserId)
    syncLeaderstats(player)
    remote:FireClient(player, "DataLoaded", cache[player.UserId])
    print("[DataManager] Loaded data for " .. player.Name)
end)

Players.PlayerRemoving:Connect(function(player)
    saveData(player.UserId)
    cache[player.UserId] = nil
    print("[DataManager] Saved and unloaded " .. player.Name)
end)

-- Auto-save loop
task.spawn(function()
    while true do
        task.wait(DataConfig.AUTOSAVE_SEC)
        for _, player in ipairs(Players:GetPlayers()) do
            task.spawn(function() saveData(player.UserId) end)
        end
        print("[DataManager] Auto-save complete (" .. #Players:GetPlayers() .. " players)")
    end
end)

print("[DataManager] Ready — store: " .. DataConfig.STORE_NAME)`;
}

function buildCombatScript(): string {
  return `-- FILE: CombatConfig.lua (place in ReplicatedStorage)
-- System: Combat — Config
-- Placement: ReplicatedStorage
local CombatConfig = {}

CombatConfig.SWING_COOLDOWN   = 0.5   -- seconds between attacks
CombatConfig.HIT_RANGE        = 6     -- studs
CombatConfig.HIT_ANGLE        = 90    -- degrees in front of player
CombatConfig.BASE_DAMAGE       = 15
CombatConfig.CRIT_CHANCE       = 0.10  -- 10%
CombatConfig.CRIT_MULTIPLIER   = 2.0
CombatConfig.KNOCKBACK_FORCE   = 30
CombatConfig.RESPAWN_WAIT      = 4    -- seconds
CombatConfig.DAMAGE_COLOR      = Color3.fromRGB(255, 60, 60)
CombatConfig.CRIT_COLOR        = Color3.fromRGB(255, 200, 0)

return CombatConfig

-- FILE: CombatServer.lua (place in ServerScriptService)
-- System: Combat — Server (authoritative hit validation)
-- Placement: ServerScriptService
-- Services used: Players, ReplicatedStorage
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Debris = game:GetService("Debris")

local CombatConfig = require(ReplicatedStorage:WaitForChild("CombatConfig"))
local remote = Instance.new("RemoteEvent"); remote.Name = "CombatRemote"; remote.Parent = ReplicatedStorage

local cooldowns = {}  -- [userId] = last attack time

local function showDamageNumber(position, amount, isCrit)
    local part = Instance.new("Part", workspace)
    part.Anchored = true; part.CanCollide = false; part.Transparency = 1
    part.Size = Vector3.one; part.CFrame = CFrame.new(position + Vector3.new(0, 3, 0))
    local billboard = Instance.new("BillboardGui", part)
    billboard.Size = UDim2.fromOffset(80, 30); billboard.StudsOffset = Vector3.new(0, 2, 0)
    billboard.AlwaysOnTop = true
    local label = Instance.new("TextLabel", billboard)
    label.Size = UDim2.fromScale(1, 1); label.BackgroundTransparency = 1
    label.Text = (isCrit and "💥 " or "-") .. tostring(amount)
    label.TextColor3 = isCrit and CombatConfig.CRIT_COLOR or CombatConfig.DAMAGE_COLOR
    label.TextScaled = true; label.Font = Enum.Font.GothamBold
    Debris:AddItem(part, 1.5)
end

remote.OnServerEvent:Connect(function(attacker, action, targetName)
    if action ~= "Swing" then return end

    local now = tick()
    if cooldowns[attacker.UserId] and now - cooldowns[attacker.UserId] < CombatConfig.SWING_COOLDOWN then return end
    cooldowns[attacker.UserId] = now

    local attackerChar = attacker.Character
    if not attackerChar then return end
    local attackerHrp = attackerChar:FindFirstChild("HumanoidRootPart")
    if not attackerHrp then return end

    -- Validate target by name
    local targetChar = workspace:FindFirstChild(targetName)
    if not targetChar then return end
    local targetHrp = targetChar:FindFirstChild("HumanoidRootPart")
    local targetHumanoid = targetChar:FindFirstChild("Humanoid")
    if not targetHrp or not targetHumanoid or targetHumanoid.Health <= 0 then return end

    -- Range check
    local dist = (attackerHrp.Position - targetHrp.Position).Magnitude
    if dist > CombatConfig.HIT_RANGE then return end

    -- Angle check (must be in front of attacker)
    local toTarget = (targetHrp.Position - attackerHrp.Position).Unit
    local lookVector = attackerHrp.CFrame.LookVector
    local dotProduct = toTarget:Dot(lookVector)
    local angleLimit = math.cos(math.rad(CombatConfig.HIT_ANGLE / 2))
    if dotProduct < angleLimit then return end

    -- Don't let players hit themselves
    local targetPlayer = Players:GetPlayerFromCharacter(targetChar)
    if targetPlayer and targetPlayer == attacker then return end

    -- Calculate damage
    local isCrit = math.random() < CombatConfig.CRIT_CHANCE
    local damage = CombatConfig.BASE_DAMAGE * (isCrit and CombatConfig.CRIT_MULTIPLIER or 1)
    damage = math.round(damage)

    -- Apply damage
    targetHumanoid:TakeDamage(damage)
    showDamageNumber(targetHrp.Position, damage, isCrit)
    remote:FireAllClients("HitEffect", targetHrp.Position, damage, isCrit)

    -- Knockback
    if targetHrp:FindFirstChild("VectorForce") then targetHrp:FindFirstChild("VectorForce"):Destroy() end
    local att = Instance.new("Attachment", targetHrp)
    local force = Instance.new("VectorForce", targetHrp)
    force.Attachment0 = att
    force.Force = (targetHrp.Position - attackerHrp.Position).Unit * CombatConfig.KNOCKBACK_FORCE * 1000
    Debris:AddItem(att, 0.1); Debris:AddItem(force, 0.1)

    if targetHumanoid.Health <= 0 then
        remote:FireClient(attacker, "Kill", targetName)
        -- Auto-respawn
        if targetPlayer then
            task.delay(CombatConfig.RESPAWN_WAIT, function()
                if targetPlayer and targetPlayer.Character then
                    targetPlayer:LoadCharacter()
                end
            end)
        end
    end
end)
print("[CombatServer] Ready!")

-- FILE: CombatClient.lua (place in StarterPlayerScripts)
-- System: Combat — Client (tool swing trigger)
-- Placement: StarterPlayerScripts
-- Services used: Players, ReplicatedStorage
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local remote = ReplicatedStorage:WaitForChild("CombatRemote")
local player = Players.LocalPlayer
local character = player.Character or player.CharacterAdded:Wait()

-- Wire up the tool swing — assumes a Tool in StarterPack with an Activated event
-- TODO: adjust "CombatTool" to your tool's name
local function wireTools()
    for _, tool in ipairs(player.Backpack:GetChildren()) do
        if tool:IsA("Tool") then
            tool.Activated:Connect(function()
                local char = player.Character
                if not char then return end
                -- Find nearest target
                local hrp = char:FindFirstChild("HumanoidRootPart")
                if not hrp then return end
                local best, bestDist = nil, math.huge
                for _, model in ipairs(workspace:GetChildren()) do
                    if model ~= char and model:FindFirstChild("HumanoidRootPart") and model:FindFirstChild("Humanoid") then
                        local d = (model.HumanoidRootPart.Position - hrp.Position).Magnitude
                        if d < bestDist then best = model; bestDist = d end
                    end
                end
                if best then remote:FireServer("Swing", best.Name) end
            end)
        end
    end
end

player.Backpack.ChildAdded:Connect(function(tool) if tool:IsA("Tool") then wireTools() end end)
player.CharacterAdded:Connect(function(char) character = char; task.wait(0.5); wireTools() end)
wireTools()

remote.OnClientEvent:Connect(function(action, pos, damage, isCrit)
    if action == "HitEffect" then
        -- TODO: play hit sound or screen shake
    elseif action == "Kill" then
        print("[CombatClient] You got a kill!")
    end
end)`;
}

// ---------------------------------------------------------------------------
// Track 3 (Pet 3D pipeline) — generic follow + leveling scripts injected into
// the .rbxm of an AI-generated 3D pet. Independent of buildPetSystemScript()
// above, which is the legacy procedural-primitives "Pet System" chip.
// ---------------------------------------------------------------------------

/**
 * PetFollowScript — generic Script that lives inside a Pet model and drives:
 *   • follow behaviour via AlignPosition + AlignOrientation (rigidity off to
 *     avoid jittering; per DevForum 2025 best-practice).
 *   • idle ↔ walk ↔ fly animation switching based on player velocity.
 *   • flying offset (extra Y) for IsFlying=true pets.
 *
 * Expects the pet model layout produced by buildPetEvolutionManifest():
 *   Pet (Model)
 *     PetConfig (Configuration with IsFlying BoolValue + Level/XP IntValues)
 *     Stages.Stage1 (Model — direct child once active, has HumanoidRootPart,
 *                    AnimationController{Idle,Walk[,Fly]}, AlignPosition,
 *                    AlignOrientation, Attachment "FollowAnchor")
 *     Stages.Stage2, Stage3 (idle stage children inside Folder; swapped in
 *                            by PetLevelingModule:Evolve()).
 */
export function buildPetFollowScript(): string {
  return `-- AUTO-GENERATED by buildPetFollowScript (Track 3, 3D Pet)
-- Placement: child Script of the Pet model
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")

local pet = script.Parent
local cfg = pet:WaitForChild("PetConfig")
local stagesFolder = pet:WaitForChild("Stages")

local function pickActiveStage()
    for _, child in ipairs(pet:GetChildren()) do
        if child:IsA("Model") and child.Name:match("^Stage%d+$") then
            return child
        end
    end
    return stagesFolder:FindFirstChild("Stage1")
end

local activeStage = pickActiveStage()
if not activeStage then
    warn("[PetFollowScript] No Stage model found under " .. pet:GetFullName())
    return
end

local hrp = activeStage:FindFirstChild("HumanoidRootPart")
local mesh = activeStage:FindFirstChild("Body")
if not hrp or not mesh then
    warn("[PetFollowScript] Stage is missing HumanoidRootPart or Body MeshPart")
    return
end

-- Warn if user forgot to paste the real MeshId after Studio 3D Importer import.
if mesh:IsA("MeshPart") and (mesh.MeshId == "" or mesh.MeshId == "rbxassetid://0") then
    warn(string.format(
        "[PetFollowScript] %s.MeshId is a placeholder. Open in Studio 3D Importer to upload the bundled .fbx and paste the asset id.",
        mesh:GetFullName()
    ))
end

local alignPos = activeStage:FindFirstChild("FollowPos")
local alignRot = activeStage:FindFirstChild("FollowRot")
local anchorAttach = activeStage:FindFirstChild("FollowAnchor")

if alignPos then
    alignPos.MaxForce = 10000
    alignPos.Responsiveness = 50
    alignPos.RigidityEnabled = false
    alignPos.Attachment0 = anchorAttach
end
if alignRot then
    alignRot.Responsiveness = 30
    alignRot.Attachment0 = anchorAttach
end

local function loadStageTrack(stage, name)
    local ac = stage:FindFirstChild("AnimationController")
    local anim = ac and ac:FindFirstChild(name)
    if ac and anim and anim:IsA("Animation") then
        local ok, track = pcall(function() return ac:LoadAnimation(anim) end)
        if ok then return track end
    end
    return nil
end

local idleTrack = loadStageTrack(activeStage, "Idle")
local walkTrack = loadStageTrack(activeStage, "Walk")
local flyTrack = cfg:FindFirstChild("IsFlying") and cfg.IsFlying.Value and loadStageTrack(activeStage, "Fly") or nil

if idleTrack then idleTrack:Play() end

local function bindToCharacter(char)
    local rp = char:WaitForChild("HumanoidRootPart")
    local existing = rp:FindFirstChild("PetTarget_" .. pet.Name)
    if existing then existing:Destroy() end
    local target = Instance.new("Attachment")
    target.Name = "PetTarget_" .. pet.Name
    local isFlying = cfg:FindFirstChild("IsFlying") and cfg.IsFlying.Value
    target.Position = Vector3.new(3, isFlying and 4 or 0, 2)
    target.Parent = rp
    if alignPos then alignPos.Attachment1 = target end
    if alignRot then alignRot.Attachment1 = target end
end

local function watchPlayer(player)
    if player.Character then bindToCharacter(player.Character) end
    player.CharacterAdded:Connect(bindToCharacter)
end

local lp = Players.LocalPlayer
if lp then
    watchPlayer(lp)
else
    -- Server context (rare for follow scripts but supported): bind to first player.
    Players.PlayerAdded:Connect(watchPlayer)
    for _, p in ipairs(Players:GetPlayers()) do watchPlayer(p) end
end

RunService.Heartbeat:Connect(function()
    local owner = lp or Players:GetPlayers()[1]
    local char = owner and owner.Character
    local hum = char and char:FindFirstChild("HumanoidRootPart")
    if not hum then return end
    local v = hum.Velocity.Magnitude
    local isFlying = cfg:FindFirstChild("IsFlying") and cfg.IsFlying.Value
    if isFlying and flyTrack then
        if not flyTrack.IsPlaying then flyTrack:Play() end
        if idleTrack and idleTrack.IsPlaying then idleTrack:Stop() end
        if walkTrack and walkTrack.IsPlaying then walkTrack:Stop() end
        return
    end
    local moving = v > 2
    if moving then
        if walkTrack and not walkTrack.IsPlaying then walkTrack:Play() end
        if idleTrack and idleTrack.IsPlaying then idleTrack:Stop() end
    else
        if idleTrack and not idleTrack.IsPlaying then idleTrack:Play() end
        if walkTrack and walkTrack.IsPlaying then walkTrack:Stop() end
    end
end)
`;
}

/**
 * PetLevelingModule — ModuleScript exposing GainXP / Evolve / GetCoinMultiplier.
 * XP curve: 100 × 1.15^(level-1) (≈88k XP at level 50).
 * Evolution triggers: level 25 → Stage2, level 50 → Stage3.
 * Stage swap = moving the target Stage to be a direct child of the pet model
 * (active), and other stages back into the Stages folder (inactive). Missing
 * stages no-op silently so the module is robust to partial generation.
 */
export function buildPetLevelingModule(): string {
  return `-- AUTO-GENERATED by buildPetLevelingModule (Track 3, 3D Pet)
-- Placement: ModuleScript child of the Pet model
local PetLeveling = {}

local pet = script.Parent
local cfg = pet:WaitForChild("PetConfig")
local stagesFolder = pet:WaitForChild("Stages")

local LEVEL_CAP = 50
local STAGE2_AT = 25
local STAGE3_AT = 50

function PetLeveling:XPRequired(level)
    return math.floor(100 * 1.15 ^ (level - 1))
end

function PetLeveling:GetLevel()
    return cfg.Level.Value
end

function PetLeveling:GetStage()
    return cfg.EvolutionStage.Value
end

function PetLeveling:GetCoinMultiplier()
    local base = cfg:FindFirstChild("CoinBonusBase")
    local b = base and base.Value or 1
    return b * (1 + cfg.Level.Value * 0.02)
end

function PetLeveling:Evolve(stage)
    local target = stagesFolder:FindFirstChild("Stage" .. stage)
    if not target then
        warn(string.format("[PetLeveling] Stage%d missing — Evolve is a no-op.", stage))
        return false
    end
    cfg.EvolutionStage.Value = stage
    for _, child in ipairs(pet:GetChildren()) do
        if child:IsA("Model") and child.Name:match("^Stage%d+$") and child ~= target then
            child.Parent = stagesFolder
        end
    end
    for _, child in ipairs(stagesFolder:GetChildren()) do
        if child == target then child.Parent = pet end
    end
    return true
end

function PetLeveling:CheckEvolution()
    local lvl = cfg.Level.Value
    local stage = cfg.EvolutionStage.Value
    if lvl >= STAGE3_AT and stage < 3 then
        self:Evolve(3)
    elseif lvl >= STAGE2_AT and stage < 2 then
        self:Evolve(2)
    end
end

function PetLeveling:GainXP(amount)
    if typeof(amount) ~= "number" or amount <= 0 then return end
    cfg.XP.Value = cfg.XP.Value + amount
    while cfg.XP.Value >= self:XPRequired(cfg.Level.Value) and cfg.Level.Value < LEVEL_CAP do
        cfg.XP.Value = cfg.XP.Value - self:XPRequired(cfg.Level.Value)
        cfg.Level.Value = cfg.Level.Value + 1
        self:CheckEvolution()
    end
end

-- Auto-bootstrap: ensure Level/XP/EvolutionStage IntValues exist with sane defaults.
local function ensureInt(name, default)
    local v = cfg:FindFirstChild(name)
    if not v then
        v = Instance.new("IntValue")
        v.Name = name
        v.Value = default
        v.Parent = cfg
    end
end
ensureInt("Level", 1)
ensureInt("XP", 0)
ensureInt("EvolutionStage", 1)

return PetLeveling
`;
}

/**
 * Track 3 Phase 2 (Blocky Pet) — follow + animation Script for a primitive-
 * Part pet rigged with Motor6D. Loads KeyframeSequence-based animations from
 * Animation children of an AnimationController under the model. Drives
 * position via HumanoidRootPart velocity (AlignPosition + AlignOrientation,
 * RigidityEnabled=false to avoid jittering — DevForum 2025 best-practice).
 *
 * Differences vs buildPetFollowScript (3D mesh path):
 *   - No Stages folder (single rig; evolution = swap Color/Material/Size on
 *     existing parts via PetLevelingModule, no mesh replacement needed).
 *   - AnimationController lives directly under the pet model, not per-stage.
 *   - The pet model is its own primary frame — no separate Body MeshPart.
 */
export function buildBlockyPetFollowScript(): string {
  return `-- AUTO-GENERATED by buildBlockyPetFollowScript (Track 3 Phase 2, Blocky Pet)
-- Placement: child Script of the Pet model
--
-- Pet model is built with HumanoidRootPart Anchored=true. All other Parts are
-- welded to it via Motor6D. We drive the WHOLE assembly via Model:PivotTo()
-- on Heartbeat — no AlignPosition (which fails for Massless welded assemblies
-- and flings them off into space).
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")

local pet = script.Parent
local cfg = pet:WaitForChild("PetConfig")
local hrp = pet:FindFirstChild("HumanoidRootPart")
if not hrp then
    warn("[BlockyPetFollow] No HumanoidRootPart on " .. pet:GetFullName())
    return
end

-- Ensure HRP is the PrimaryPart so :PivotTo() works.
if not pet.PrimaryPart then
    pet.PrimaryPart = hrp
end

local ac = pet:FindFirstChild("AnimationController")
local idleTrack, walkTrack, flyTrack
if ac then
    local function loadTrack(name)
        local a = ac:FindFirstChild(name)
        if a and a:IsA("Animation") then
            local ok, track = pcall(function() return ac:LoadAnimation(a) end)
            if ok then return track end
        end
        return nil
    end
    idleTrack = loadTrack("Idle")
    walkTrack = loadTrack("Walk")
    if cfg:FindFirstChild("IsFlying") and cfg.IsFlying.Value then
        flyTrack = loadTrack("Fly")
    end
end

-- Configurable follow geometry.
local FOLLOW_RADIUS = 6
local ORBIT_SPEED = 0.25         -- revolutions per second
local FLY_HEIGHT_OFFSET = 4
local STAND_HEIGHT_OFFSET = 2    -- 2 studs above player feet (visible in 3rd-person)
local LERP_ALPHA = 0.20          -- smoothing factor per Heartbeat
local DEBUG = true               -- toggle to silence diagnostic prints

print(string.format("[BlockyPetFollow] Script started for %s. HRP at %s. Waiting for player...",
    pet.Name,
    tostring(hrp.Position)))

local function followPositionFor(charHrp)
    local angle = tick() * ORBIT_SPEED * 2 * math.pi
    local isFlying = cfg:FindFirstChild("IsFlying") and cfg.IsFlying.Value
    local heightOffset = isFlying and FLY_HEIGHT_OFFSET or STAND_HEIGHT_OFFSET
    local offset = Vector3.new(
        math.cos(angle) * FOLLOW_RADIUS,
        heightOffset,
        math.sin(angle) * FOLLOW_RADIUS
    )
    local desiredPos = charHrp.Position + offset
    -- Face the player so head (built at -Z) points at them.
    return CFrame.lookAt(desiredPos, charHrp.Position)
end

-- Targeting state. snapped=false until we've teleported to player on first
-- frame so the pet appears next to the player and only orbits gently after.
local targetCFrame = pet:GetPivot()
local snapped = false
local lastDebugT = 0

if idleTrack then idleTrack:Play() end

RunService.Heartbeat:Connect(function()
    -- Owner = LocalPlayer when running on client, first player on server.
    local owner = Players.LocalPlayer or Players:GetPlayers()[1]
    local char = owner and owner.Character
    local hum = char and char:FindFirstChild("HumanoidRootPart")
    if not hum then return end

    local desired = followPositionFor(hum)
    if not snapped then
        -- First time we see the player: teleport pet next to them so user
        -- sees it immediately rather than watching it lerp across the map.
        targetCFrame = desired
        snapped = true
        if DEBUG then
            print(string.format("[BlockyPetFollow] Player found (%s). Snapping pet to %s",
                tostring(hum.Position),
                tostring(desired.Position)))
        end
    else
        targetCFrame = targetCFrame:Lerp(desired, LERP_ALPHA)
    end
    pet:PivotTo(targetCFrame)

    -- Debug print every 2 seconds so user can see pet is alive.
    if DEBUG and tick() - lastDebugT > 2 then
        lastDebugT = tick()
        print(string.format("[BlockyPetFollow] pet=%s player=%s",
            tostring(targetCFrame.Position),
            tostring(hum.Position)))
    end

    -- Animation track switching by player velocity.
    local v = hum.Velocity.Magnitude
    local isFlying = cfg:FindFirstChild("IsFlying") and cfg.IsFlying.Value
    if isFlying and flyTrack then
        if not flyTrack.IsPlaying then flyTrack:Play() end
        if idleTrack and idleTrack.IsPlaying then idleTrack:Stop() end
        if walkTrack and walkTrack.IsPlaying then walkTrack:Stop() end
        return
    end
    local moving = v > 2
    if moving then
        if walkTrack and not walkTrack.IsPlaying then walkTrack:Play() end
        if idleTrack and idleTrack.IsPlaying then idleTrack:Stop() end
    else
        if idleTrack and not idleTrack.IsPlaying then idleTrack:Play() end
        if walkTrack and walkTrack.IsPlaying then walkTrack:Stop() end
    end
end)
`;
}

/**
 * Parse multi-file Luau output into individual file records.
 * Supports two formats:
 *   -- FILE: FileName.lua (place in Container)
 *   -- FILE: FileName|Container|ScriptType
 */
export interface ScriptFile {
  name: string;
  container: string;
  scriptType: 'Script' | 'LocalScript' | 'ModuleScript';
  source: string;
}

export function parseScriptFiles(raw: string): ScriptFile[] {
  const lines = raw.split('\n');
  const files: ScriptFile[] = [];
  let current: ScriptFile | null = null;
  let currentExplicitType = false;
  const sourceLines: string[] = [];

  const flush = () => {
    if (current && sourceLines.length > 0) {
      current.source = sourceLines.join('\n').trim();
      // If type was inferred only from name (no explicit `as <Type>`), re-run inference
      // with the actual source code as the strongest signal (top-level `return X` → ModuleScript).
      if (!currentExplicitType) {
        current.scriptType = inferScriptType(current.name, current.container, current.source);
      }
      files.push(current);
    }
    sourceLines.length = 0;
    currentExplicitType = false;
  };

  for (const line of lines) {
    const m = line.match(/^--\s*FILE:\s*(.+)$/);
    if (m) {
      flush();
      const spec = m[1].trim();
      // Format A: "Name.lua (place in Container)" with optional "as <Type>" suffix
      // e.g. "SkillRemotes.lua (place in ReplicatedStorage as ModuleScript)"
      const formatA = spec.match(/^(.+?)\.lua\s+\(place in\s+([A-Za-z][A-Za-z0-9 ]*?)(?:\s+as\s+(Script|LocalScript|ModuleScript))?\s*\)/i);
      // Format B: "Name|Container|Type"
      const formatB = spec.match(/^([^|]+)\|([^|]+)\|([^|]+)/);
      if (formatA) {
        const name = formatA[1].trim();
        const container = formatA[2].trim();
        const explicitType = formatA[3]?.trim() as 'Script' | 'LocalScript' | 'ModuleScript' | undefined;
        currentExplicitType = !!explicitType;
        current = {
          name,
          container,
          scriptType: explicitType ?? inferScriptType(name, container),
          source: '',
        };
      } else if (formatB) {
        const name = formatB[1].trim().replace(/\.lua$/i, '');
        const container = formatB[2].trim();
        const rawType = formatB[3].trim();
        currentExplicitType = true;
        current = {
          name,
          container,
          scriptType: rawType === 'LocalScript' ? 'LocalScript' : rawType === 'ModuleScript' ? 'ModuleScript' : 'Script',
          source: '',
        };
      } else {
        // Fallback: treat whole spec as name (no explicit type, will re-infer in flush())
        currentExplicitType = false;
        current = { name: spec.replace(/\.lua$/i, ''), container: 'ServerScriptService', scriptType: 'Script', source: '' };
      }
    } else {
      sourceLines.push(line);
    }
  }
  flush();

  // If no FILE markers found, treat entire input as a single server script
  if (files.length === 0 && raw.trim().length > 0) {
    const container = inferContainerFromPlacement(raw);
    files.push({
      name: 'GameScript',
      container,
      scriptType: inferScriptType('GameScript', container),
      source: raw.trim(),
    });
  }
  return files;
}

/**
 * JSON-format parser for the new strict LLM prompt.
 * Expects a JSON array of {name, type, parent, code} objects.
 * Tolerates leading/trailing prose, markdown fences, and trailing build-instruction blocks.
 * Returns null if no usable JSON array is found — caller should fall back to parseScriptFiles().
 */
export function parseScriptFilesJSON(raw: string): ScriptFile[] | null {
  if (!raw || typeof raw !== 'string') return null;
  // Strip code fences
  const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  // Find first JSON array (greedy: first '[' to last ']' to handle trailing blocks)
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start < 0 || end <= start) return null;
  const candidate = cleaned.slice(start, end + 1);

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    // Try narrower slice: first '[' to first ']' that produces valid JSON
    let depth = 0;
    let firstClose = -1;
    for (let i = start; i < cleaned.length; i++) {
      if (cleaned[i] === '[') depth++;
      else if (cleaned[i] === ']') {
        depth--;
        if (depth === 0) { firstClose = i; break; }
      }
    }
    if (firstClose < 0) return null;
    try { parsed = JSON.parse(cleaned.slice(start, firstClose + 1)); }
    catch { return null; }
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return null;

  const files: ScriptFile[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const rawName = typeof obj.name === 'string' ? obj.name : null;
    if (!rawName) continue;
    const name = rawName.replace(/\.lua$/i, '').replace(/[^a-zA-Z0-9_\-]/g, '') || 'Script';

    const code = typeof obj.code === 'string'
      ? obj.code
      : (typeof obj.source === 'string' ? obj.source : null);
    if (!code || code.trim().length === 0) continue;

    const rawType = typeof obj.type === 'string' ? obj.type : '';
    const rawParent = typeof obj.parent === 'string' ? obj.parent : '';
    // Strip subfolder paths like "ReplicatedStorage/PetSystem" → "ReplicatedStorage"
    const containerRaw = rawParent.split(/[\/\\]/)[0] || 'ServerScriptService';
    // Normalize known container names
    const container = normalizeContainer(containerRaw);

    const scriptType: 'Script' | 'LocalScript' | 'ModuleScript' =
      rawType === 'LocalScript' ? 'LocalScript' :
      rawType === 'ModuleScript' ? 'ModuleScript' :
      rawType === 'Script' ? 'Script' :
      inferScriptType(name, container);

    files.push({ name, container, scriptType, source: code });
  }
  return files.length > 0 ? files : null;
}

function normalizeContainer(raw: string): string {
  const r = raw.toLowerCase().replace(/\s+/g, '');
  if (r.includes('replicatedstorage')) return 'ReplicatedStorage';
  if (r.includes('serverscriptservice')) return 'ServerScriptService';
  if (r.includes('serverstorage')) return 'ServerStorage';
  if (r.includes('starterplayerscripts') || r === 'starterplayer') return 'StarterPlayerScripts';
  if (r.includes('startercharacterscripts')) return 'StarterCharacterScripts';
  if (r.includes('startergui')) return 'StarterGui';
  if (r.includes('starterpack')) return 'StarterPack';
  if (r.includes('workspace')) return 'Workspace';
  if (r.includes('lighting')) return 'Lighting';
  return 'ServerScriptService';
}

export function inferScriptType(name: string, container: string, source?: string): 'Script' | 'LocalScript' | 'ModuleScript' {
  // Strongest signal: source code ends with `return <identifier>` or `return {` at top level → ModuleScript
  if (source && source.trim().length > 0) {
    const trimmed = source.trim();
    // Look at last ~3 lines for top-level `return X` (not indented = top level)
    const tail = trimmed.split('\n').slice(-5).join('\n');
    if (/(^|\n)return\s+[A-Za-z_][A-Za-z0-9_]*\s*$/.test(tail) || /(^|\n)return\s+\{/.test(tail)) {
      return 'ModuleScript';
    }
  }
  // Name-based heuristics
  if (/module|config|remotes?|vfx|util|helper|effects?|state|store|data|constants?|shared|library/i.test(name)) return 'ModuleScript';
  if (/client|local|gui|hud|input|camera/i.test(name) || /StarterGui|StarterPlayerScripts|StarterCharacterScripts/i.test(container)) return 'LocalScript';
  return 'Script';
}

function inferContainerFromPlacement(source: string): string {
  const line = source.split('\n').slice(0, 8).find(l => /Placement:/i.test(l));
  if (!line) return 'ServerScriptService';
  if (/StarterGui/i.test(line)) return 'StarterGui';
  if (/StarterPlayerScripts/i.test(line)) return 'StarterPlayerScripts';
  if (/ReplicatedStorage/i.test(line)) return 'ReplicatedStorage';
  if (/Workspace/i.test(line)) return 'Workspace';
  return 'ServerScriptService';
}

/**
 * Wrap a single Luau file as a .rbxmx XML string.
 * Handles Script / LocalScript / ModuleScript and their containers.
 */
export function wrapGenericScriptAsRbxmx(source: string, name: string, container: string, scriptType: 'Script' | 'LocalScript' | 'ModuleScript'): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const runContext = scriptType === 'Script' ? '\n\t\t\t<token name="RunContext">1</token>' : '';
  return `<roblox xmlns:xmime="http://www.w3.org/2005/05/xmlmime" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://www.roblox.com/roblox.xsd" version="4">
\t<Item class="${scriptType}" referent="RBX0001">
\t\t<Properties>
\t\t\t<string name="Name">${esc(name)}</string>
\t\t\t<ProtectedString name="Source"><![CDATA[${source}]]></ProtectedString>
\t\t\t<bool name="Disabled">false</bool>${runContext}
\t\t</Properties>
\t</Item>
</roblox>`;
}

/**
 * Wrap multi-file script output as a SINGLE installer .rbxmx.
 *
 * UX rationale: Roblox's "Insert from File" only inserts into ONE location at a time —
 * giving the user 3 separate .rbxmx files for 3 different containers is the worst-case UX.
 * Instead we ship one Folder containing sub-folders per container + a bootstrap Script
 * that re-parents children to their target services on first Play, then self-destructs.
 *
 * Pattern modeled on Adonis/HD Admin community kits.
 *
 * Workflow for the user:
 *   1. Drag the single .rbxmx into Workspace
 *   2. Press Play (F5)
 *   3. Bootstrap moves PetConfig → ReplicatedStorage, PetServer → ServerScriptService, etc.
 *   4. Bootstrap deletes itself and the wrapper Folder
 *
 * Important: Scripts and LocalScripts inside the wrapper are initially Disabled to prevent
 * them executing while still parented to Workspace (where they'd error trying to find each other).
 * The bootstrap re-enables them after re-parenting.
 */
export function buildInstallerRbxmx(files: ScriptFile[], systemTitle: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const safeTitle = (systemTitle || 'AISystem').replace(/[^a-zA-Z0-9_\-]/g, '') || 'AISystem';

  // Group files by their target container
  const byContainer = new Map<string, ScriptFile[]>();
  for (const f of files) {
    const arr = byContainer.get(f.container) ?? [];
    arr.push(f);
    byContainer.set(f.container, arr);
  }

  let referentCounter = 100;
  const nextRef = () => `RBX${(referentCounter++).toString().padStart(4, '0')}`;

  // Bootstrap installer Lua source — runs once on Play, moves children, self-destructs
  const installerLua = `-- Auto-installer for ${safeTitle}
-- Generated by AI Games for Roblox
-- This script runs once on Play, distributes child scripts to their target services, then deletes itself.

local function getStarterPlayerScripts()
\tlocal sp = game:GetService("StarterPlayer")
\treturn sp:WaitForChild("StarterPlayerScripts")
end

local CONTAINERS = {
\t["_ReplicatedStorage"]    = game:GetService("ReplicatedStorage"),
\t["_ServerScriptService"]  = game:GetService("ServerScriptService"),
\t["_ServerStorage"]        = game:GetService("ServerStorage"),
\t["_StarterPlayerScripts"] = getStarterPlayerScripts(),
\t["_StarterGui"]           = game:GetService("StarterGui"),
\t["_StarterPack"]          = game:GetService("StarterPack"),
\t["_Workspace"]            = workspace,
\t["_Lighting"]             = game:GetService("Lighting"),
}

local root = script.Parent
if not root then
\twarn("[${safeTitle} Installer] No parent folder found, aborting")
\treturn
end

-- Two-pass install:
-- Pass 1: re-parent every child (still Disabled) to its target service.
--         We MUST move first, otherwise enabling a Server Script while still parented
--         under Workspace causes it to start running prematurely and hang on
--         WaitForChild() for siblings that haven't been moved yet.
-- Pass 2: after ALL moves are complete, re-enable BaseScripts so Server/Client
--         scripts can find each other across services.
local moved = {}
local installed = 0
for folderName, target in pairs(CONTAINERS) do
\tlocal folder = root:FindFirstChild(folderName)
\tif folder then
\t\tfor _, child in ipairs(folder:GetChildren()) do
\t\t\tchild.Parent = target
\t\t\ttable.insert(moved, child)
\t\t\tinstalled = installed + 1
\t\tend
\t\tfolder:Destroy()
\tend
end

-- Pass 2: enable scripts now that everything is in place
for _, child in ipairs(moved) do
\tif child:IsA("BaseScript") then
\t\tchild.Disabled = false
\tend
end

print(string.format("[${safeTitle} Installer] Installed %d script(s). Removing installer wrapper.", installed))
root:Destroy()`;

  let xml = `<roblox xmlns:xmime="http://www.w3.org/2005/05/xmlmime" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://www.roblox.com/roblox.xsd" version="4">
\t<Item class="Folder" referent="${nextRef()}">
\t\t<Properties>
\t\t\t<string name="Name">${esc(safeTitle)}_Installer</string>
\t\t</Properties>
\t\t<Item class="Script" referent="${nextRef()}">
\t\t\t<Properties>
\t\t\t\t<string name="Name">_Installer</string>
\t\t\t\t<ProtectedString name="Source"><![CDATA[${installerLua}]]></ProtectedString>
\t\t\t\t<bool name="Disabled">false</bool>
\t\t\t\t<token name="RunContext">1</token>
\t\t\t</Properties>
\t\t</Item>`;

  for (const [container, containerFiles] of byContainer) {
    const folderName = `_${container}`;
    xml += `
\t\t<Item class="Folder" referent="${nextRef()}">
\t\t\t<Properties>
\t\t\t\t<string name="Name">${esc(folderName)}</string>
\t\t\t</Properties>`;
    for (const f of containerFiles) {
      // ModuleScripts don't run on their own (only when required) — leave enabled.
      // Scripts and LocalScripts must be Disabled while parked in Workspace, otherwise
      // the Server Script would start executing before the installer re-parents it.
      const isModule = f.scriptType === 'ModuleScript';
      const disabled = isModule ? 'false' : 'true';
      const runContext = f.scriptType === 'Script' ? '\n\t\t\t\t\t<token name="RunContext">1</token>' : '';
      xml += `
\t\t\t<Item class="${f.scriptType}" referent="${nextRef()}">
\t\t\t\t<Properties>
\t\t\t\t\t<string name="Name">${esc(f.name)}</string>
\t\t\t\t\t<ProtectedString name="Source"><![CDATA[${f.source}]]></ProtectedString>
\t\t\t\t\t<bool name="Disabled">${disabled}</bool>${runContext}
\t\t\t\t</Properties>
\t\t\t</Item>`;
    }
    xml += `
\t\t</Item>`;
  }

  xml += `
\t</Item>
</roblox>`;

  return xml;
}

/**
 * Given a user prompt, return a multi-file Luau template string if it matches a known system,
 * or null to fall through to LLM generation.
 */
export function buildScriptSystemFromPrompt(prompt: string): string | null {
  const p = prompt.toLowerCase();
  // Combat must be checked BEFORE pet — "боевых питомцев" mentions both, but combat pet system
  // is closer to a combat template than a generic pet template.
  if (/\bcombat\b|\bpvp\b|\bhitbox\b|\bfight(ing)?\b|боев|бой|драк|сражен|оружи/.test(p)) return buildCombatScript();
  if (/\bpet(s)?\b|питом(ец|цы|цев|ца|цами|цев)|зверюшк|любимц/.test(p)) return buildPetSystemScript();
  if (/\bdaily.{0,10}reward|\blogin.{0,10}reward|\bdaily.{0,10}bonus|ежедневн.{0,15}награ|ежедневн.{0,15}бонус|вход.{0,15}награ/.test(p)) return buildDailyRewardsScript();
  if (/\bday.{0,6}night\b|\bnighttime\b|\bnight.{0,6}day\b|\bclock.{0,8}cycle|день.{0,10}ночь|ночь.{0,10}день|смена.{0,15}времени|цикл.{0,10}дня/.test(p)) return buildDayNightCycleScript();
  if (/\bteleport(ation)?\b|\bportal\b|телепорт|портал/.test(p)) return buildTeleportationScript();
  if (/\brebirth\b|\bprestige\b|перерождени|престиж/.test(p)) return buildRebirthScript();
  if (/\bquest(s)?\b|квест|задани|миссия|миссии/.test(p)) return buildQuestScript();
  if (/\bdatastore\b|\bdata.store\b|\bdata.save\b|\bsave.system\b|сохранени|датастор|сейв/.test(p)) return buildDataStoreScript();
  return null;
}

// ---------------------------------------------------------------------------
// .rbxmx wrapper — generates XML that can be dragged into Roblox Studio
// ---------------------------------------------------------------------------

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function parsePlacement(luaSource: string): { container: string; scriptType: string; guiName: string } {
  let container = 'StarterGui';
  let scriptType = 'LocalScript';
  for (const line of luaSource.split('\n').slice(0, 5)) {
    const m = line.match(/^--\s*Placement:\s*(.+)$/);
    if (m) {
      const raw = m[1].trim().toLowerCase();
      if (raw.includes('replicatedstorage')) {
        container = 'ReplicatedStorage';
        scriptType = 'ModuleScript';
      } else if (raw.includes('starterplayerscripts')) {
        container = 'StarterPlayerScripts';
        scriptType = 'LocalScript';
      } else {
        container = 'StarterGui';
        scriptType = 'LocalScript';
      }
      break;
    }
  }
  const guiName = container === 'StarterGui' ? 'GeneratedUI' : '';
  return { container, scriptType, guiName };
}

/**
 * Wraps a Lua UI script in .rbxmx (Roblox XML model) format.
 * The user can drag the resulting file directly into Roblox Studio Explorer.
 *
 * For StarterGui scripts → ScreenGui > LocalScript
 * For ReplicatedStorage scripts → ModuleScript (no ScreenGui wrapper)
 */
export function wrapUIScriptAsRbxmx(luaSource: string, scriptName: string): string {
  const { container, scriptType, guiName } = parsePlacement(luaSource);

  // For StarterGui: wrap in ScreenGui so drag-and-drop into StarterGui works instantly.
  // Lua scripts detect script.Parent:IsA("ScreenGui") and reuse it instead of creating a new one.
  if (container === 'StarterGui') {
    return `<roblox xmlns:xmime="http://www.w3.org/2005/05/xmlmime" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://www.roblox.com/roblox.xsd" version="4">
	<Item class="ScreenGui" referent="RBX0001">
		<Properties>
			<string name="Name">${escapeXml(guiName || scriptName)}</string>
			<bool name="ResetOnSpawn">false</bool>
			<bool name="IgnoreGuiInset">true</bool>
			<token name="ZIndexBehavior">1</token>
			<int name="DisplayOrder">0</int>
		</Properties>
		<Item class="${scriptType}" referent="RBX0002">
			<Properties>
				<string name="Name">${escapeXml(scriptName)}</string>
				<ProtectedString name="Source"><![CDATA[${luaSource}]]></ProtectedString>
				<bool name="Disabled">false</bool>
			</Properties>
		</Item>
	</Item>
</roblox>`;
  }

  // For ReplicatedStorage/StarterPlayerScripts: just the script, no GUI wrapper
  return `<roblox xmlns:xmime="http://www.w3.org/2005/05/xmlmime" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://www.roblox.com/roblox.xsd" version="4">
	<Item class="${scriptType}" referent="RBX0001">
		<Properties>
			<string name="Name">${escapeXml(guiName || scriptName)}</string>
			<ProtectedString name="Source"><![CDATA[${luaSource}]]></ProtectedString>
			<bool name="Disabled">false</bool>
		</Properties>
	</Item>
</roblox>`;
}
