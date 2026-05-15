# ТЗ-4: Жанровые шаблоны геймплея

## Цель
Заменить заглушку `buildStarterLuau` (которая только делает `print` при PlayerAdded) на **жанрово-специфичные геймплейные скрипты** с реальной игровой логикой: чекпоинты для Obby, экономика для Tycoon, сбор для Simulator.

## Контекст
Текущий `buildStarterLuau` (`apps/functions/src/index.ts`, строка 4490) генерирует ~20 строк Lua, которые:
- Создают таблицу `GameConfig` с Prompt и Summary
- Подключают `bootstrapPlayer` к `Players.PlayerAdded`
- `bootstrapPlayer` просто делает `print`

Это не даёт никакого геймплея. Нужны шаблоны для основных жанров.

## Файлы для изменения

### 1. Создать новый файл `apps/functions/src/gameTemplates.ts`

Файл экспортирует функции-генераторы Lua-кода для каждого жанра:

```typescript
export interface GameTemplateParams {
  title: string;
  genre: string;
  systems: string[];
  stageCount?: number;
  currencyName?: string;
  npcNames?: string[];
  summary?: string;
}

export function buildObbyScript(params: GameTemplateParams): string {
  const stages = params.stageCount || 20;
  return `-- Obby Game System for "${params.title}"
-- Auto-generated checkpoint and kill zone system

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local TOTAL_STAGES = ${stages}
local playerStages = {}

local function getCheckpoints()
    local checkpoints = {}
    for _, obj in workspace.GeneratedContent:GetDescendants() do
        if obj:IsA("BasePart") and obj.Name:match("Checkpoint") then
            local num = tonumber(obj.Name:match("%d+")) or 0
            checkpoints[num] = obj
        end
    end
    return checkpoints
end

local function getKillParts()
    local parts = {}
    for _, obj in workspace.GeneratedContent:GetDescendants() do
        if obj:IsA("BasePart") and (obj.Name:match("Kill") or obj.Name:match("Lava")) then
            table.insert(parts, obj)
        end
    end
    return parts
end

local function setupPlayer(player)
    playerStages[player.UserId] = 0

    player.CharacterAdded:Connect(function(character)
        local humanoid = character:WaitForChild("Humanoid")
        local rootPart = character:WaitForChild("HumanoidRootPart")

        task.wait(0.5)
        local stage = playerStages[player.UserId] or 0
        local checkpoints = getCheckpoints()
        if stage > 0 and checkpoints[stage] then
            rootPart.CFrame = checkpoints[stage].CFrame + Vector3.new(0, 5, 0)
        end

        for _, killPart in getKillParts() do
            killPart.Touched:Connect(function(hit)
                local hitPlayer = Players:GetPlayerFromCharacter(hit.Parent)
                if hitPlayer == player then
                    humanoid.Health = 0
                end
            end)
        end
    end)
end

local function setupCheckpoints()
    local checkpoints = getCheckpoints()
    for num, checkpoint in checkpoints do
        checkpoint.Touched:Connect(function(hit)
            local player = Players:GetPlayerFromCharacter(hit.Parent)
            if player and (playerStages[player.UserId] or 0) < num then
                playerStages[player.UserId] = num
                -- Simple notification
                local gui = player.PlayerGui:FindFirstChild("GeneratedHud")
                if gui then
                    local title = gui:FindFirstChild("GeneratedTitle")
                    if title then
                        title.Text = "Stage " .. num .. " / " .. TOTAL_STAGES
                    end
                end
            end
        end)
    end
end

local function setupWinPlatform()
    local winPart = workspace.GeneratedContent:FindFirstChild("WinPlatform", true)
    if winPart then
        winPart.Touched:Connect(function(hit)
            local player = Players:GetPlayerFromCharacter(hit.Parent)
            if player then
                local gui = player.PlayerGui:FindFirstChild("GeneratedHud")
                if gui then
                    local title = gui:FindFirstChild("GeneratedTitle")
                    if title then
                        title.Text = "YOU WIN! Congratulations!"
                    end
                end
            end
        end)
    end
end

Players.PlayerAdded:Connect(setupPlayer)
task.wait(1)
setupCheckpoints()
setupWinPlatform()
print("[Obby] System initialized with " .. TOTAL_STAGES .. " stages")
`;
}

export function buildTycoonScript(params: GameTemplateParams): string {
  const currency = params.currencyName || 'Coins';
  return `-- Tycoon Game System for "${params.title}"
-- Auto-generated dropper/collector economy

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local CURRENCY_NAME = "${currency}"
local DROP_INTERVAL = 2
local DROP_VALUE = 5
local playerData = {}

local function setupPlayer(player)
    playerData[player.UserId] = {
        currency = 0,
        multiplier = 1,
    }

    local leaderstats = Instance.new("Folder")
    leaderstats.Name = "leaderstats"
    leaderstats.Parent = player

    local currencyStat = Instance.new("IntValue")
    currencyStat.Name = CURRENCY_NAME
    currencyStat.Value = 0
    currencyStat.Parent = leaderstats
end

local function updateCurrency(player, amount)
    local data = playerData[player.UserId]
    if not data then return end
    data.currency = data.currency + amount
    local stat = player:FindFirstChild("leaderstats")
    if stat then
        local cv = stat:FindFirstChild(CURRENCY_NAME)
        if cv then cv.Value = data.currency end
    end
end

local function setupDropper()
    local droppers = {}
    for _, obj in workspace.GeneratedContent:GetDescendants() do
        if obj:IsA("BasePart") and obj.Name:match("Drop") then
            table.insert(droppers, obj)
        end
    end

    task.spawn(function()
        while true do
            task.wait(DROP_INTERVAL)
            for _, dropper in droppers do
                local drop = Instance.new("Part")
                drop.Size = Vector3.new(1, 1, 1)
                drop.Position = dropper.Position - Vector3.new(0, 2, 0)
                drop.Color = Color3.new(1, 0.85, 0)
                drop.Material = Enum.Material.Neon
                drop.Anchored = false
                drop.Parent = workspace.GeneratedContent
                game.Debris:AddItem(drop, 15)
            end
        end
    end)
end

local function setupCollector()
    for _, obj in workspace.GeneratedContent:GetDescendants() do
        if obj:IsA("BasePart") and (obj.Name:match("Collect") or obj.Name:match("Sell")) then
            obj.Touched:Connect(function(hit)
                if hit.Parent == workspace.GeneratedContent and hit.Size.X <= 2 then
                    hit:Destroy()
                    for _, player in Players:GetPlayers() do
                        local data = playerData[player.UserId]
                        if data then
                            updateCurrency(player, DROP_VALUE * data.multiplier)
                        end
                    end
                end
            end)
        end
    end
end

local function setupUpgrades()
    for _, obj in workspace.GeneratedContent:GetDescendants() do
        if obj:IsA("BasePart") and obj.Name:match("Upgrade") then
            local prompt = Instance.new("ProximityPrompt")
            prompt.ActionText = "Upgrade (50 " .. CURRENCY_NAME .. ")"
            prompt.HoldDuration = 0.5
            prompt.Parent = obj

            prompt.Triggered:Connect(function(player)
                local data = playerData[player.UserId]
                if data and data.currency >= 50 then
                    updateCurrency(player, -50)
                    data.multiplier = data.multiplier + 1
                end
            end)
        end
    end
end

Players.PlayerAdded:Connect(setupPlayer)
Players.PlayerRemoving:Connect(function(player)
    playerData[player.UserId] = nil
end)
task.wait(1)
setupDropper()
setupCollector()
setupUpgrades()
print("[Tycoon] System initialized: " .. CURRENCY_NAME)
`;
}

export function buildSimulatorScript(params: GameTemplateParams): string {
  const currency = params.currencyName || 'Gems';
  return `-- Simulator Game System for "${params.title}"
-- Auto-generated collection and sell system

local Players = game:GetService("Players")
local CURRENCY_NAME = "${currency}"
local COLLECT_VALUE = 1
local playerData = {}

local function setupPlayer(player)
    playerData[player.UserId] = {
        currency = 0,
        bag = 0,
        bagMax = 20,
        power = 1,
    }

    local leaderstats = Instance.new("Folder")
    leaderstats.Name = "leaderstats"
    leaderstats.Parent = player

    local currencyStat = Instance.new("IntValue")
    currencyStat.Name = CURRENCY_NAME
    currencyStat.Value = 0
    currencyStat.Parent = leaderstats

    local bagStat = Instance.new("IntValue")
    bagStat.Name = "Bag"
    bagStat.Value = 0
    bagStat.Parent = leaderstats
end

local function setupCollectionZones()
    local tool = Instance.new("Tool")
    tool.Name = "Collector"
    tool.RequiresHandle = false

    for _, player in Players:GetPlayers() do
        local clone = tool:Clone()
        clone.Parent = player.Backpack

        clone.Activated:Connect(function()
            local character = player.Character
            if not character then return end
            local rootPart = character:FindFirstChild("HumanoidRootPart")
            if not rootPart then return end

            local data = playerData[player.UserId]
            if not data or data.bag >= data.bagMax then return end

            for _, obj in workspace.GeneratedContent:GetDescendants() do
                if obj:IsA("BasePart") and obj.Name:match("Collect") then
                    if (obj.Position - rootPart.Position).Magnitude < 15 then
                        data.bag = data.bag + COLLECT_VALUE * data.power
                        local stat = player:FindFirstChild("leaderstats")
                        if stat then
                            local bv = stat:FindFirstChild("Bag")
                            if bv then bv.Value = data.bag end
                        end
                        break
                    end
                end
            end
        end)
    end
end

local function setupSellZone()
    for _, obj in workspace.GeneratedContent:GetDescendants() do
        if obj:IsA("BasePart") and obj.Name:match("Sell") then
            obj.Touched:Connect(function(hit)
                local player = Players:GetPlayerFromCharacter(hit.Parent)
                if not player then return end
                local data = playerData[player.UserId]
                if not data or data.bag == 0 then return end

                data.currency = data.currency + data.bag
                data.bag = 0

                local stat = player:FindFirstChild("leaderstats")
                if stat then
                    local cv = stat:FindFirstChild(CURRENCY_NAME)
                    if cv then cv.Value = data.currency end
                    local bv = stat:FindFirstChild("Bag")
                    if bv then bv.Value = 0 end
                end
            end)
        end
    end
end

Players.PlayerAdded:Connect(setupPlayer)
Players.PlayerRemoving:Connect(function(player) playerData[player.UserId] = nil end)
task.wait(2)
setupCollectionZones()
setupSellZone()
print("[Simulator] System initialized: " .. CURRENCY_NAME)
`;
}

export function buildDefaultScript(params: GameTemplateParams): string {
  return `-- Game System for "${params.title}"
-- Auto-generated gameplay framework

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local function setupNPCDialogs()
    for _, obj in workspace.GeneratedContent:GetDescendants() do
        if obj:IsA("BasePart") and obj:FindFirstChild("Humanoid") then
            local prompt = Instance.new("ProximityPrompt")
            prompt.ActionText = "Talk to " .. obj.Name
            prompt.HoldDuration = 0.3
            prompt.Parent = obj
            prompt.Triggered:Connect(function(player)
                print(player.Name .. " talks to " .. obj.Name)
            end)
        end
    end
end

local function setupPlayer(player)
    local leaderstats = Instance.new("Folder")
    leaderstats.Name = "leaderstats"
    leaderstats.Parent = player

    local score = Instance.new("IntValue")
    score.Name = "Score"
    score.Value = 0
    score.Parent = leaderstats

    player.CharacterAdded:Connect(function()
        task.wait(1)
        local gui = player.PlayerGui:FindFirstChild("GeneratedHud")
        if gui then
            local title = gui:FindFirstChild("GeneratedTitle")
            if title then
                title.Text = "${params.title}"
            end
        end
    end)
end

Players.PlayerAdded:Connect(setupPlayer)
task.wait(1)
setupNPCDialogs()
print("[Game] ${params.title} initialized")
`;
}

export function buildGameplayScript(params: GameTemplateParams): string {
  const genre = (params.genre || '').toLowerCase();
  if (genre.includes('obby') || genre.includes('parkour') || genre.includes('obstacle')) {
    return buildObbyScript(params);
  }
  if (genre.includes('tycoon') || genre.includes('factory') || genre.includes('business')) {
    return buildTycoonScript(params);
  }
  if (genre.includes('simulator') || genre.includes('collect') || genre.includes('clicker')) {
    return buildSimulatorScript(params);
  }
  return buildDefaultScript(params);
}
```

### 2. `apps/functions/src/index.ts` — заменить `buildStarterLuau`

Изменить функцию `buildStarterLuau` (строка 4490):

```typescript
import { buildGameplayScript } from './gameTemplates.js';

function buildStarterLuau(job: GenerationJob, gameBrief: string): string {
  const genre = typeof job.metadata?.genre === 'string' ? job.metadata.genre : '';
  const systems = typeof job.metadata?.systems === 'object' ? job.metadata.systems as string[] : [];

  // Try to extract genre from GDD if not in metadata
  const detectedGenre = genre
    || (gameBrief.toLowerCase().includes('obby') ? 'obby' : '')
    || (gameBrief.toLowerCase().includes('tycoon') ? 'tycoon' : '')
    || (gameBrief.toLowerCase().includes('simulator') ? 'simulator' : '')
    || '';

  return buildGameplayScript({
    title: summarizeTitle(job.prompt),
    genre: detectedGenre,
    systems: Array.isArray(systems) ? systems : [],
    summary: gameBrief.slice(0, 300),
  });
}
```

## Проверка
1. Генерация Obby → starter script содержит checkpoint/kill zone систему
2. Генерация Tycoon → starter script содержит dropper/collector/currency
3. Генерация Simulator → starter script содержит collection/sell
4. Запуск в Roblox Studio → система работает (чекпоинты сохраняют прогресс, валюта считается)
5. HUD обновляется при прохождении этапов

## Зависимости
- ТЗ-2 (части в GeneratedContent с правильными именами — Checkpoint_N, Kill_N, WinPlatform для Obby и т.д.)
- Промпт в ТЗ-1 должен генерировать части с именами, которые скрипты ожидают (Checkpoint, Kill, Sell, Collect, Upgrade, Drop)
