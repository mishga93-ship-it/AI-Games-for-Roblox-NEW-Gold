# ТЗ-5: Обновления Lune Builder

## Цель
Обновить `build_roblox.luau` для корректной обработки новых типов свойств и Lighting-конфига, которые приходят из расширенного манифеста (ТЗ-2).

## Контекст
Файл `apps/worker-service/runtime/lune/build_roblox.luau` — Luau-скрипт, который запускается через Lune и конвертирует JSON-манифест в `.rbxl` файл.

Текущий `resolvePropertyValue` (строки 28-128) **уже поддерживает**:
- `Vector3` (строка 32)
- `Color3` (строка 38)
- `CFrame` (строка 44) — но только с rotation matrix (9 чисел)
- `BrickColor` (строка 63)
- `Enum` (строка 69)
- `UDim2`, `NumberSequence`, `ColorSequence`, `Content`/`AssetId`, `Ref`

**Нужно добавить:**
1. Euler-angle rotation в CFrame (массив из 3 чисел = градусы)
2. Обработку `__LightingConfig` — псевдо-ноды для настройки Lighting сервиса
3. Пропуск `__LightingConfig` при создании Instance

## Файл для изменения

### `apps/worker-service/runtime/lune/build_roblox.luau`

**Шаг A:** Обновить CFrame обработку (строки 44-61)

Текущий код:
```lua
if value.__type == "CFrame" then
    if _CFrame then
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
    return nil
end
```

Заменить на:
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
                return _CFrame.new(
                    x, y, z,
                    rot[1], rot[2], rot[3],
                    rot[4], rot[5], rot[6],
                    rot[7], rot[8], rot[9]
                )
            elseif #rot == 3 then
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

**Шаг B:** Пропускать `__LightingConfig` при создании Instance (строка 250)

Текущий код:
```lua
for _, node in manifest.scene do
    local instance = roblox.Instance.new(node.className)
    instance.Name = node.name
    pendingProperties[node.id] = node.properties
    instanceMap[node.id] = instance
end
```

Заменить на:
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

**Шаг C:** Обработать `__LightingConfig` после scene nodes (после строки 268)

Добавить после `end` на строке 268:
```lua
-- Apply lighting configuration from __LightingConfig pseudo-nodes
for _, node in manifest.scene do
    if node.className == "__LightingConfig" and node.properties then
        local lighting = instanceMap["Lighting"]
        if lighting then
            applyProperties(lighting, node.properties)
        end
    end
end
```

**Шаг D:** Также при parenting (строка 257-261) — пропускать `__LightingConfig`:

Текущий код:
```lua
for _, node in manifest.scene do
    local instance = instanceMap[node.id]
    local parent = instanceMap[node.parentId or "WorkspaceRoot"] or instanceMap["WorkspaceRoot"]
    instance.Parent = parent
end
```

Заменить на:
```lua
for _, node in manifest.scene do
    if node.className ~= "__LightingConfig" then
        local instance = instanceMap[node.id]
        local parent = instanceMap[node.parentId or "WorkspaceRoot"] or instanceMap["WorkspaceRoot"]
        if instance then
            instance.Parent = parent
        end
    end
end
```

## Проверка
1. Создать тестовый JSON-манифест с:
   - Part с `Size: {__type: "Vector3", x: 10, y: 5, z: 10}`
   - Part с `CFrame: {__type: "CFrame", position: {x: 0, y: 10, z: 50}, rotation: [0, 45, 0]}`
   - Part с `Color: {__type: "Color3", r: 1, g: 0, b: 0}`
   - Part с `Material: {__type: "Enum", enumType: "Material", enumName: "Neon"}`
   - `__LightingConfig` с `ClockTime: 18, Brightness: 3`
2. Запустить `lune run build_roblox.luau manifest.json output.rbxl place`
3. Открыть `output.rbxl` в Roblox Studio:
   - Part должен быть размером 10x5x10
   - Part повёрнут на 45° по Y
   - Part красный
   - Part с материалом Neon
   - Lighting.ClockTime = 18

Тестовый манифест для проверки:
```json
{
  "id": "test-123",
  "title": "TestLevel",
  "summary": "Test",
  "target": "place",
  "scene": [
    {
      "id": "part-1",
      "className": "Part",
      "name": "RedNeonPart",
      "parentId": "WorkspaceRoot",
      "properties": {
        "Anchored": true,
        "Size": {"__type": "Vector3", "x": 10, "y": 5, "z": 10},
        "CFrame": {"__type": "CFrame", "position": {"x": 0, "y": 10, "z": 50}, "rotation": [0, 45, 0]},
        "Color": {"__type": "Color3", "r": 1, "g": 0, "b": 0},
        "Material": {"__type": "Enum", "enumType": "Material", "enumName": "Neon"}
      }
    },
    {
      "id": "spawn-1",
      "className": "SpawnLocation",
      "name": "Spawn",
      "parentId": "WorkspaceRoot",
      "properties": {
        "Anchored": true,
        "Size": {"__type": "Vector3", "x": 6, "y": 1, "z": 6}
      }
    },
    {
      "id": "lighting-cfg",
      "className": "__LightingConfig",
      "name": "__LightingConfig",
      "parentId": "Lighting",
      "properties": {
        "ClockTime": 18,
        "Brightness": 3,
        "Ambient": {"__type": "Color3", "r": 0.4, "g": 0.4, "b": 0.5}
      }
    }
  ],
  "scripts": [
    {
      "id": "script-1",
      "name": "TestScript.server.lua",
      "scriptType": "Script",
      "container": "ServerScriptService",
      "source": "print('hello')"
    }
  ]
}
```

## Зависимости
- ТЗ-2 (генерирует manifest с новыми типами свойств и `__LightingConfig`)
- Должно быть задеплоено на worker-service ДО деплоя Functions (чтобы при вызове worker уже понимал новые типы)
