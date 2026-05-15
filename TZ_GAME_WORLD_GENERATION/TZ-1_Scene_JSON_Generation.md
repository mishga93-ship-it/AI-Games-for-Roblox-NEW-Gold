# ТЗ-1: Генерация Scene JSON из GDD (второй вызов LLM)

## Цель
После того как LLM генерирует текстовый GDD (Game Design Document), сделать **второй вызов LLM**, который превращает GDD в структурированный JSON описания игрового мира: части, спавны, NPC, освещение, параметры террейна.

## Контекст
Сейчас функция `buildGamePackageArtifacts` (файл `apps/functions/src/index.ts`, строка 4415) получает от LLM только текст `gameBrief`, который никак не используется для построения геометрии. Манифест создаётся с ~7 минимальными нодами (пустая платформа + пустые папки).

## Файлы для изменения

### 1. `apps/functions/src/types.ts`

Добавить новый интерфейс `GameSceneSpec` после строки 261 (после `RobloxBuildManifest`):

```typescript
export interface GameSceneSpecPart {
  name: string;
  className?: string;      // default: "Part"
  size: [number, number, number];
  position: [number, number, number];
  rotation?: [number, number, number]; // degrees
  color?: [number, number, number];    // 0-1 RGB
  material?: string;       // "Grass" | "Plastic" | "Neon" | "SmoothPlastic" | etc.
  anchored?: boolean;      // default: true
  canCollide?: boolean;    // default: true
  transparency?: number;   // 0-1
  shape?: string;          // "Block" | "Ball" | "Cylinder"
}

export interface GameSceneSpecSpawn {
  name?: string;
  position: [number, number, number];
  teamColor?: string;
}

export interface GameSceneSpecNPC {
  name: string;
  position: [number, number, number];
  role?: string;          // "shop" | "quest" | "dialog" | "enemy"
  dialog?: string;
}

export interface GameSceneSpecTerrain {
  biome: string;          // "grass" | "sand" | "snow" | "lava" | "rock"
  seed?: number;
  amplitude?: number;     // height multiplier
  baseHeight?: number;
  features?: string[];    // ["hills", "river", "cave", "flat"]
  range?: number;         // studs from center, default 256
}

export interface GameSceneSpecLighting {
  clockTime?: number;     // 0-24
  ambient?: [number, number, number];
  brightness?: number;
  fogEnd?: number;
  fogColor?: [number, number, number];
  outdoorAmbient?: [number, number, number];
}

export interface GameSceneSpec {
  terrain?: GameSceneSpecTerrain;
  parts: GameSceneSpecPart[];
  spawns?: GameSceneSpecSpawn[];
  npcs?: GameSceneSpecNPC[];
  lighting?: GameSceneSpecLighting;
}
```

### 2. `apps/functions/src/promptCatalog.ts`

Добавить новый промпт `generateSceneJSON` в объект `PROMPT_CATALOG` (после строки 210, после `generateGameGdd`):

```typescript
generateSceneJSON: `
You are a Roblox level designer AI. Convert the game design document below into a structured JSON scene specification.

OUTPUT ONLY VALID JSON. No markdown, no code fences, no explanation, no comments.

Schema:
{
  "terrain": {
    "biome": "grass|sand|snow|lava|rock",
    "seed": <integer>,
    "amplitude": <number 4-20>,
    "baseHeight": <number>,
    "features": ["hills", "river", "cave", "flat"],
    "range": <number, studs from center, default 256>
  },
  "parts": [
    {
      "name": "<unique_name>",
      "className": "Part",
      "size": [x, y, z],
      "position": [x, y, z],
      "rotation": [rx, ry, rz],
      "color": [r, g, b],
      "material": "<Roblox material name>",
      "anchored": true,
      "canCollide": true,
      "transparency": 0,
      "shape": "Block|Ball|Cylinder"
    }
  ],
  "spawns": [{"name": "MainSpawn", "position": [x, y, z]}],
  "npcs": [{"name": "ShopKeeper", "position": [x, y, z], "role": "shop"}],
  "lighting": {
    "clockTime": 14,
    "ambient": [r, g, b],
    "brightness": 2,
    "fogEnd": 500
  }
}

GENRE-SPECIFIC RULES:

OBBY:
- Generate 20-40 platforms at increasing heights with gaps between them
- Add kill zones (Parts with material "Neon", color [1,0,0], with names containing "Kill" or "Lava")
- Add checkpoint platforms every 5 stages (larger, green, named "Checkpoint_N")
- Final platform should be the largest (named "WinPlatform")
- Spawns at the beginning
- Vertical progression: each platform ~3-8 studs higher and 10-30 studs forward

TYCOON:
- Generate a flat base plot (large Part, 100x1x100)
- Dropper machine area (elevated Part)
- Conveyor belt (series of thin Parts in a line)
- Collector/sell area (Part with distinct color)
- Upgrade button locations (small Parts with Neon material)
- Spawns inside the plot

SIMULATOR:
- Generate collection zones (groups of colored Parts scattered in areas)
- Central sell area
- Shop area with NPC positions
- Pet zone
- Open terrain with grass biome

RPG/ADVENTURE:
- Generate buildings (groups of Parts forming walls + roof)
- Paths between areas (thin flat Parts)
- Quest NPC positions
- Treasure chest locations (small golden Parts)
- Varied terrain

GENERAL:
- Coordinates in Roblox studs (1 stud ≈ 0.28m)
- All parts should be Anchored
- Use diverse materials: Grass, SmoothPlastic, Neon, Wood, Concrete, Brick, Metal, Sand
- Use diverse colors (0-1 range RGB)
- Minimum 30 parts, maximum 100
- SpawnLocation at safe starting position
- Keep everything within -300 to 300 studs on X and Z
- Y=0 is ground level
`.trim(),
```

### 3. `apps/functions/src/index.ts`

**Шаг A:** Добавить импорт нового типа в начале файла:
```typescript
import type { GameSceneSpec } from './types.js';
```

**Шаг B:** Добавить новую функцию `generateSceneFromGDD` рядом с `buildStarterLuau` (после строки 4512):

```typescript
async function generateSceneFromGDD(
  gameBrief: string,
  metadata?: Record<string, unknown>,
): Promise<GameSceneSpec | null> {
  try {
    const genre = typeof metadata?.genre === 'string' ? metadata.genre : '';
    const genreHint = genre ? `\nThe game genre is: ${genre}. Follow the genre-specific rules above.\n` : '';

    const prompt = `${PROMPT_CATALOG.generateSceneJSON}\n${genreHint}\n--- GAME DESIGN DOCUMENT ---\n${gameBrief.slice(0, 3000)}`;

    const result = await runChatProvider('gemini', {
      system: 'You output only valid JSON. No markdown.',
      user: prompt,
    });

    const text = result.text?.trim();
    if (!text) return null;

    // Strip markdown fences if present
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const spec = JSON.parse(cleaned) as GameSceneSpec;

    // Basic validation
    if (!Array.isArray(spec.parts) || spec.parts.length === 0) {
      console.warn('generateSceneFromGDD: no parts in scene spec');
      return null;
    }

    return spec;
  } catch (error) {
    console.error('generateSceneFromGDD failed:', error);
    return null;
  }
}
```

**Шаг C:** Изменить `buildGamePackageArtifacts` (строка 4415) — добавить вызов `generateSceneFromGDD` и передать результат в `buildRobloxManifest`:

```typescript
async function buildGamePackageArtifacts(
  job: GenerationJob,
  result: Awaited<ReturnType<typeof executeProvider>>,
): Promise<GenerationArtifact[]> {
  const gameBrief = result.text?.trim() || 'Roblox project bundle generated.';

  // NEW: Generate scene specification from GDD
  const sceneSpec = await generateSceneFromGDD(gameBrief, job.metadata);

  const starterScript = buildStarterLuau(job, gameBrief);
  const target = resolveRobloxBuildTarget(job);
  const manifest = buildRobloxManifest({
    title: summarizeTitle(job.prompt),
    summary: gameBrief.slice(0, 600),
    target,
    prompt: job.prompt,
    starterScript,
    metadata: job.metadata,
    sceneSpec,  // NEW: pass scene spec
  });
  // ... rest stays the same
```

### 4. `apps/functions/src/robloxWorker.ts`

Изменить сигнатуру `buildRobloxManifest` (строка 44) — добавить опциональный параметр `sceneSpec`:

```typescript
export function buildRobloxManifest(args: {
  title: string;
  summary: string;
  target: RobloxBuildTarget;
  prompt: string;
  starterScript: string;
  metadata?: Record<string, unknown>;
  sceneSpec?: GameSceneSpec | null;  // NEW
}): RobloxBuildManifest {
```

Добавить импорт `GameSceneSpec` из `./types.js`.

(Конвертация sceneSpec в scene nodes — это ТЗ-2)

## Проверка
1. Запустить генерацию Obby-игры
2. В логах должен появиться второй вызов LLM
3. JSON должен содержать 30+ частей с корректными координатами
4. При ошибке парсинга — fallback к текущему минимальному манифесту (обратная совместимость)

## Зависимости
- Нужен доступ к `runChatProvider` из index.ts (уже есть)
- Результат используется в ТЗ-2 (конвертация в manifest nodes)
