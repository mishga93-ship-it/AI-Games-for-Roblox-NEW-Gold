# ТЗ-2: Конвертер Scene JSON в manifest nodes

## Цель
Превратить `GameSceneSpec` (JSON от LLM из ТЗ-1) в массив `RobloxBuildSceneNode[]` с реальными свойствами (Size, Position, Color3, Material), чтобы Lune-билдер мог создать полноценный RBXL с десятками объектов.

## Контекст
Сейчас `buildRobloxManifest` в `apps/functions/src/robloxWorker.ts` (строка 44) для игровых проектов создаёт всего ~7 нод:
- `GeneratedContent` (пустой Folder)
- `SpawnPlatform` (Part, только `Anchored: true`, без Size/Position)
- `Spawn` (SpawnLocation)
- `Systems` (Folder с пустыми подпапками)
- `Config` (StringValues)

После этого ТЗ манифест будет содержать 30-100+ нод с полными свойствами.

## Файлы для изменения

### 1. `apps/functions/src/robloxWorker.ts`

**Шаг A:** Добавить функцию `buildSceneNodesFromSpec` (после `deriveRequestedSystems`, строка ~442):

```typescript
import type { GameSceneSpec, GameSceneSpecPart } from './types.js';

function buildSceneNodesFromSpec(
  spec: GameSceneSpec,
  generatedContentFolderId: string,
): RobloxBuildSceneNode[] {
  const nodes: RobloxBuildSceneNode[] = [];

  // Parts
  for (let i = 0; i < spec.parts.length; i++) {
    const part = spec.parts[i];
    const properties: Record<string, unknown> = {
      Anchored: part.anchored ?? true,
      CanCollide: part.canCollide ?? true,
    };

    if (part.size) {
      properties.Size = {
        __type: 'Vector3',
        x: part.size[0],
        y: part.size[1],
        z: part.size[2],
      };
    }

    if (part.position) {
      properties.CFrame = {
        __type: 'CFrame',
        position: { x: part.position[0], y: part.position[1], z: part.position[2] },
      };
    }

    if (part.rotation) {
      properties.CFrame = {
        __type: 'CFrame',
        position: {
          x: part.position?.[0] ?? 0,
          y: part.position?.[1] ?? 0,
          z: part.position?.[2] ?? 0,
        },
        rotation: part.rotation,
      };
    }

    if (part.color) {
      properties.Color = {
        __type: 'Color3',
        r: part.color[0],
        g: part.color[1],
        b: part.color[2],
      };
    }

    if (part.material) {
      properties.Material = {
        __type: 'Enum',
        enumType: 'Material',
        enumName: part.material,
      };
    }

    if (part.transparency !== undefined && part.transparency > 0) {
      properties.Transparency = part.transparency;
    }

    if (part.shape && part.shape !== 'Block') {
      properties.Shape = {
        __type: 'Enum',
        enumType: 'PartType',
        enumName: part.shape,
      };
    }

    nodes.push({
      id: uuidv4(),
      className: part.className || 'Part',
      name: part.name || `Part_${i}`,
      parentId: generatedContentFolderId,
      properties,
    });
  }

  // Spawns
  if (spec.spawns) {
    for (let i = 0; i < spec.spawns.length; i++) {
      const spawn = spec.spawns[i];
      nodes.push({
        id: uuidv4(),
        className: 'SpawnLocation',
        name: spawn.name || `Spawn_${i}`,
        parentId: generatedContentFolderId,
        properties: {
          Anchored: true,
          Neutral: true,
          CFrame: {
            __type: 'CFrame',
            position: {
              x: spawn.position[0],
              y: spawn.position[1],
              z: spawn.position[2],
            },
          },
          Size: { __type: 'Vector3', x: 6, y: 1, z: 6 },
        },
      });
    }
  }

  // NPCs (as Part placeholders with BillboardGui)
  if (spec.npcs) {
    for (let i = 0; i < spec.npcs.length; i++) {
      const npc = spec.npcs[i];
      const npcId = uuidv4();
      nodes.push({
        id: npcId,
        className: 'Part',
        name: npc.name || `NPC_${i}`,
        parentId: generatedContentFolderId,
        properties: {
          Anchored: true,
          CanCollide: true,
          Size: { __type: 'Vector3', x: 2, y: 5, z: 2 },
          CFrame: {
            __type: 'CFrame',
            position: {
              x: npc.position[0],
              y: npc.position[1] + 2.5,
              z: npc.position[2],
            },
          },
          Color: { __type: 'Color3', r: 1, g: 0.8, b: 0.2 },
          Material: { __type: 'Enum', enumType: 'Material', enumName: 'SmoothPlastic' },
        },
      });

      // Humanoid inside NPC part
      nodes.push({
        id: uuidv4(),
        className: 'Humanoid',
        name: 'Humanoid',
        parentId: npcId,
      });
    }
  }

  return nodes;
}
```

**Шаг B:** Изменить основную ветку `buildRobloxManifest` (строки 62-123) — когда `sceneSpec` передан, использовать его вместо минимальных нод:

Текущий код (строки 62-123) создаёт `const scene: RobloxBuildSceneNode[] = [...]`.

Заменить на логику:

```typescript
  const generatedContentId = uuidv4();
  const spawnPlateId = uuidv4();
  const systemsFolderId = uuidv4();
  const configFolderId = uuidv4();
  const uiRootId = uuidv4();
  const requestedSystems = deriveRequestedSystems(args.summary, metadata);

  // Base scene: always present
  const scene: RobloxBuildSceneNode[] = [
    {
      id: generatedContentId,
      className: 'Folder',
      name: 'GeneratedContent',
      parentId: 'WorkspaceRoot',
    },
    {
      id: systemsFolderId,
      className: 'Folder',
      name: 'Systems',
      parentId: 'ReplicatedStorage',
    },
    {
      id: configFolderId,
      className: 'Folder',
      name: 'Config',
      parentId: 'ReplicatedStorage',
    },
    {
      id: uuidv4(),
      className: 'StringValue',
      name: 'ProjectTitle',
      parentId: configFolderId,
      properties: { Value: args.title },
    },
    {
      id: uuidv4(),
      className: 'StringValue',
      name: 'Summary',
      parentId: configFolderId,
      properties: { Value: args.summary.slice(0, 250) },
    },
  ];

  // If we have scene spec from LLM, use it for rich world
  if (args.sceneSpec && args.sceneSpec.parts.length > 0) {
    const sceneNodes = buildSceneNodesFromSpec(args.sceneSpec, generatedContentId);
    scene.push(...sceneNodes);
  } else {
    // Fallback: minimal spawn platform (current behavior)
    scene.push(
      {
        id: spawnPlateId,
        className: 'Part',
        name: 'SpawnPlatform',
        parentId: 'WorkspaceRoot',
        properties: {
          Anchored: true,
          Size: { __type: 'Vector3', x: 20, y: 1, z: 20 },
        },
      },
      {
        id: uuidv4(),
        className: 'SpawnLocation',
        name: 'Spawn',
        parentId: spawnPlateId,
        properties: { Anchored: true, Neutral: true },
      },
    );
  }

  for (const systemName of requestedSystems) {
    scene.push({
      id: uuidv4(),
      className: 'Folder',
      name: sanitizeSystemName(systemName),
      parentId: systemsFolderId,
    });
  }
```

**Шаг C:** Добавить Lighting ноду в scene когда есть `sceneSpec.lighting`:

```typescript
  // Lighting properties (applied to the Lighting service in Lune)
  if (args.sceneSpec?.lighting) {
    const lt = args.sceneSpec.lighting;
    const lightingProps: Record<string, unknown> = {};
    if (lt.clockTime !== undefined) lightingProps.ClockTime = lt.clockTime;
    if (lt.brightness !== undefined) lightingProps.Brightness = lt.brightness;
    if (lt.fogEnd !== undefined) lightingProps.FogEnd = lt.fogEnd;
    if (lt.ambient) {
      lightingProps.Ambient = { __type: 'Color3', r: lt.ambient[0], g: lt.ambient[1], b: lt.ambient[2] };
    }
    if (lt.fogColor) {
      lightingProps.FogColor = { __type: 'Color3', r: lt.fogColor[0], g: lt.fogColor[1], b: lt.fogColor[2] };
    }
    if (lt.outdoorAmbient) {
      lightingProps.OutdoorAmbient = { __type: 'Color3', r: lt.outdoorAmbient[0], g: lt.outdoorAmbient[1], b: lt.outdoorAmbient[2] };
    }
    scene.push({
      id: uuidv4(),
      className: '__LightingConfig',
      name: '__LightingConfig',
      parentId: 'Lighting',
      properties: lightingProps,
    });
  }
```

### 2. `apps/worker-service/runtime/lune/build_roblox.luau`

Lune builder уже поддерживает `Vector3`, `Color3`, `CFrame`, `Enum` в `resolvePropertyValue` (строки 28-128). Но нужно добавить обработку `__LightingConfig` — применение свойств напрямую к сервису Lighting.

После обработки scene nodes (строка 268), добавить:

```lua
-- Apply lighting configuration
for _, node in manifest.scene do
    if node.className == "__LightingConfig" and node.properties then
        local lighting = instanceMap["Lighting"]
        if lighting then
            applyProperties(lighting, node.properties)
        end
    end
end
```

Также в цикле создания scene instances (строка 250-255) — пропускать `__LightingConfig`:

```lua
for _, node in manifest.scene do
    if node.className ~= "__LightingConfig" then
        local instance = roblox.Instance.new(node.className)
        instance.Name = node.name
        pendingProperties[node.id] = node.properties
        instanceMap[node.id] = instance
    end
end
```

**ВАЖНО:** Lune `resolvePropertyValue` (строка 44) обрабатывает CFrame с `rotation` как массив из 9 чисел (rotation matrix). Но из LLM мы получаем rotation в градусах `[rx, ry, rz]`. Нужно добавить в `resolvePropertyValue` обработку Euler-углов:

```lua
if value.__type == "CFrame" then
    if _CFrame then
        local pos = value.position or value
        local x = pos.x or 0
        local y = pos.y or 0
        local z = pos.z or 0
        local rot = value.rotation
        if type(rot) == "table" then
            if #rot == 9 then
                -- Rotation matrix (existing behavior)
                return _CFrame.new(x, y, z, rot[1], rot[2], rot[3], rot[4], rot[5], rot[6], rot[7], rot[8], rot[9])
            elseif #rot == 3 then
                -- Euler angles in degrees (new: from LLM scene spec)
                local rx = math.rad(rot[1] or 0)
                local ry = math.rad(rot[2] or 0)
                local rz = math.rad(rot[3] or 0)
                return _CFrame.new(x, y, z) * _CFrame.Angles(rx, ry, rz)
            end
        end
        return _CFrame.new(x, y, z)
    end
    return nil
end
```

### 3. `apps/functions/src/robloxWorker.ts` — SharedConfig с terrain params

Изменить `buildSharedConfigModule` (строка 1276) для включения terrain параметров:

```typescript
function buildSharedConfigModule(
  title: string,
  summary: string,
  systems: string[],
  metadata: Record<string, unknown>,
  terrainSpec?: GameSceneSpecTerrain | null,
): string {
  const lines = [
    '-- Generated shared config',
    'return {',
    `    title = ${JSON.stringify(title)},`,
    `    summary = ${JSON.stringify(summary.slice(0, 220))},`,
    `    systems = ${JSON.stringify(systems)},`,
  ];

  if (terrainSpec) {
    lines.push(`    Biome = ${JSON.stringify(terrainSpec.biome || 'Grass')},`);
    lines.push(`    TerrainSeed = ${terrainSpec.seed ?? Math.floor(Math.random() * 10000)},`);
    lines.push(`    TerrainAmplitude = ${terrainSpec.amplitude ?? 12},`);
    lines.push(`    TerrainBaseHeight = ${terrainSpec.baseHeight ?? 0},`);
    lines.push(`    TerrainRange = ${terrainSpec.range ?? 256},`);
    if (terrainSpec.features) {
      lines.push(`    TerrainFeatures = ${JSON.stringify(terrainSpec.features)},`);
    }
  }

  lines.push(`    metadata = ${JSON.stringify(metadata)},`);
  lines.push('}');
  return lines.join('\n');
}
```

Обновить вызов `buildSharedConfigModule` в `buildRobloxManifest` (строка 154) — передавать `args.sceneSpec?.terrain`:

```typescript
source: buildSharedConfigModule(
  args.title,
  args.summary,
  requestedSystems,
  metadata,
  args.sceneSpec?.terrain,
),
```

## Проверка
1. Генерация Obby → RBXL содержит 30+ Part-ов с разными размерами, позициями и цветами
2. SpawnLocation присутствует в начале уровня
3. Lighting настроен (ClockTime, Brightness)
4. Если sceneSpec = null → fallback к старому поведению (обратная совместимость)
5. Открыть RBXL в Roblox Studio — Parts видны, расположены осмысленно

## Зависимости
- ТЗ-1 (генерация GameSceneSpec)
- Lune builder уже поддерживает нужные типы свойств
