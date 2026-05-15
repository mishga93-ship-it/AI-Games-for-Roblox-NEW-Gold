# Rich Game World Generation Pipeline — Сводка ТЗ

## Проблема
Текущая генерация RBXL создаёт пустой мир: одна платформа, пустые папки, скрипт-заглушка. GDD (текст от AI) не используется для построения геометрии.

## Что будет после реализации
RBXL с 30-100 частями (платформы, стены, зоны), процедурным террейном, рабочим геймплеем (чекпоинты для Obby, экономика для Tycoon), и корректным превью на iOS.

---

## Список ТЗ

| # | Название | Файлы | Сложность |
|---|----------|-------|-----------|
| 1 | Scene JSON Generation (второй вызов LLM) | `types.ts`, `promptCatalog.ts`, `index.ts` | Средняя |
| 2 | Scene-to-Manifest Converter | `robloxWorker.ts`, `build_roblox.luau` | Средняя |
| 3 | Runtime Terrain Generator Script | `robloxWorker.ts` | Лёгкая |
| 4 | Genre Gameplay Templates | новый `gameTemplates.ts`, `index.ts` | Большая |
| 5 | Lune Builder Updates | `build_roblox.luau` | Лёгкая |
| 6 | Fix Game Preview iOS | `ChatStore.swift` | Лёгкая |

---

## Порядок реализации и деплоя

```
Фаза 1 (Worker — деплой первым):
  ТЗ-5: Lune Builder Updates

Фаза 2 (Backend — деплой вторым):
  ТЗ-1: Scene JSON Generation
  ТЗ-2: Scene-to-Manifest Converter
  ТЗ-3: Runtime Terrain Generator
  ТЗ-4: Genre Gameplay Templates

Фаза 3 (iOS — параллельно):
  ТЗ-6: Fix Game Preview

Деплой:
  1. npm run build + deploy worker-service (ТЗ-5)
  2. npm run build + firebase deploy --only functions (ТЗ-1,2,3,4)
  3. Xcode rebuild + TestFlight (ТЗ-6)
```

---

## Зависимости между ТЗ

```
ТЗ-5 (Lune) ─────────────────────┐
                                   │
ТЗ-1 (Scene JSON) ──→ ТЗ-2 (Converter) ──→ [Deploy Functions]
                         │
ТЗ-3 (Terrain) ─────────┘
                         │
ТЗ-4 (Templates) ───────┘

ТЗ-6 (iOS) ──→ [Rebuild iOS] (независимо от остальных)
```

---

## Тестирование после деплоя

1. **Obby**: "Extreme Obby Challenge" → платформы с увеличением высоты, kill zones, checkpoints
2. **Tycoon**: "Pizza Factory Tycoon" → базовый плот, дроппер, конвейер, кнопки апгрейда
3. **Simulator**: "Pet Collecting Simulator" → зоны сбора, зона продажи, магазин
4. **RPG**: "Fantasy Quest Adventure" → здания, NPC с диалогами, террейн
