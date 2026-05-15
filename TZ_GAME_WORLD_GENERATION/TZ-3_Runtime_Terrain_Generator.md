# ТЗ-3: Runtime Terrain Generator Script

## Цель
Встроить в RBXL серверный скрипт, который при запуске игры генерирует процедурный террейн (холмы, реки, биомы) используя параметры из GDD.

## Контекст
Lune (офлайн-билдер) **не может** вызывать `Terrain:FillBlock` или `Terrain:WriteVoxels` — это runtime API движка Roblox. Поэтому террейн нужно генерировать через Server Script, который запускается при старте игры и использует параметры из `GeneratedSharedConfig` (куда ТЗ-2 записывает terrain params).

## Файлы для изменения

### 1. `apps/functions/src/robloxWorker.ts`

Добавить функцию `buildTerrainGeneratorScript` (рядом с `buildSharedConfigModule`, после строки ~1291):

```typescript
function buildTerrainGeneratorScript(): string {
  return `-- AI-generated terrain generator
-- Reads params from GeneratedSharedConfig and fills terrain using Perlin noise

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local config = require(ReplicatedStorage:WaitForChild("GeneratedSharedConfig"))

local Terrain = workspace.Terrain

local BIOME = config.Biome or "Grass"
local SEED = config.TerrainSeed or 42
local AMP = config.TerrainAmplitude or 12
local BASE = config.TerrainBaseHeight or 0
local RANGE = config.TerrainRange or 256
local FEATURES = config.TerrainFeatures or {}

local MATERIAL_MAP = {
    Grass = Enum.Material.Grass,
    Sand = Enum.Material.Sand,
    Snow = Enum.Material.Snow,
    Rock = Enum.Material.Rock,
    Mud = Enum.Material.Mud,
    Ice = Enum.Material.Ice,
    Slate = Enum.Material.Slate,
}
local baseMaterial = MATERIAL_MAP[BIOME] or Enum.Material.Grass

local hasFeature = {}
for _, f in ipairs(FEATURES) do
    hasFeature[f] = true
end

local STEP = 4

Terrain:Clear()

for x = -RANGE, RANGE, STEP do
    for z = -RANGE, RANGE, STEP do
        local n1 = math.noise(x / 80, z / 80, SEED)
        local n2 = math.noise(x / 30, z / 30, SEED + 100) * 0.3

        local height
        if hasFeature["flat"] then
            height = BASE + 2 + n1 * 2
        elseif hasFeature["hills"] then
            height = BASE + AMP * (n1 + 0.5) + n2 * AMP * 0.3
        else
            height = BASE + AMP * 0.5 * (n1 + 0.5)
        end

        height = math.max(height, 1)

        local mat = baseMaterial
        if height > AMP * 0.8 and BIOME == "Grass" then
            mat = Enum.Material.Rock
        end

        Terrain:FillBlock(
            CFrame.new(x, height / 2, z),
            Vector3.new(STEP, height, STEP),
            mat
        )
    end

    if x % 32 == 0 then
        task.wait()
    end
end

if hasFeature["river"] then
    for z = -RANGE, RANGE, STEP do
        local riverX = math.sin(z / 50) * 25 + math.noise(z / 100, SEED + 200) * 15
        local riverWidth = 12 + math.noise(z / 60, SEED + 300) * 8
        Terrain:FillBlock(
            CFrame.new(riverX, -1, z),
            Vector3.new(riverWidth, 6, STEP),
            Enum.Material.Water
        )
    end
end

if hasFeature["cave"] then
    for x = -RANGE / 2, RANGE / 2, STEP * 2 do
        for z = -RANGE / 2, RANGE / 2, STEP * 2 do
            local caveNoise = math.noise(x / 40, z / 40, SEED + 500)
            if caveNoise > 0.3 then
                Terrain:FillBlock(
                    CFrame.new(x, -4, z),
                    Vector3.new(STEP * 2, 8, STEP * 2),
                    Enum.Material.Air
                )
            end
        end
    end
end

print("[TerrainGenerator] Terrain generated: biome=" .. BIOME .. " range=" .. RANGE .. " seed=" .. SEED)
`;
}
```

### 2. `apps/functions/src/robloxWorker.ts` — включить скрипт в manifest

В функции `buildRobloxManifest` (строка ~141, массив `scripts`), добавить terrain generator как третий скрипт **когда sceneSpec.terrain существует**:

```typescript
scripts: [
  {
    id: uuidv4(),
    name: 'GeneratedBootstrap.server.lua',
    scriptType: 'Script',
    container: 'ServerScriptService',
    source: args.starterScript,
  },
  {
    id: uuidv4(),
    name: 'GeneratedSharedConfig.module.lua',
    scriptType: 'ModuleScript',
    container: 'ReplicatedStorage',
    source: buildSharedConfigModule(args.title, args.summary, requestedSystems, metadata, args.sceneSpec?.terrain),
  },
  // NEW: terrain generator (only when terrain spec exists)
  ...(args.sceneSpec?.terrain ? [{
    id: uuidv4(),
    name: 'TerrainGenerator.server.lua',
    scriptType: 'Script' as const,
    container: 'ServerScriptService' as const,
    source: buildTerrainGeneratorScript(),
  }] : []),
],
```

## Что получается в RBXL

При открытии в Roblox Studio и нажатии Play:
1. `TerrainGenerator.server.lua` стартует
2. Читает params из `GeneratedSharedConfig` (Biome, Seed, Amplitude, etc.)
3. Очищает текущий террейн
4. Генерирует холмы/равнины через `Terrain:FillBlock` с Perlin noise
5. Если есть feature "river" — добавляет реку
6. Если есть feature "cave" — вырезает пустоты

## Проверка
1. Сгенерировать Obby → в RBXL должен быть `TerrainGenerator.server.lua` в ServerScriptService
2. Запустить Play в Roblox Studio → террейн появляется в течение 2-5 секунд
3. Визуально соответствует biome (трава, песок, снег)
4. Река генерируется когда в features есть "river"
5. Без sceneSpec.terrain → скрипт не включается (обратная совместимость)

## Зависимости
- ТЗ-1 (GameSceneSpec содержит terrain параметры)
- ТЗ-2 (terrain params в SharedConfig)
