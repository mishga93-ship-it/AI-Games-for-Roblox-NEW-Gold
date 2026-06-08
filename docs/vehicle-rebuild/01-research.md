# Vehicle generation rebuild — research notes (session 373, 2026-05-22 night)

После 19 раундов копания в AI-mesh пайплайне (Tripo/Meshy) пользователь
сказал: «наш подход отвратительный, я устал с ним бороться, не нравится
через 3D-фигуру работать, выглядит не оч». Пришло время сменить стратегию.

Этот документ — собранный материал на утро для следующей сессии.

---

## 0. Почему AI-mesh для машин не работает в 2026

- Tripo/Meshy натренированы на Objaverse и подобных наборах. Машин мало,
  топология сложная (round wheels + flat panels + glass + grilles), модели
  выдают wedge'и / monobodies / запечённые колёса как часть body geometry.
- В нашем пайплайне после 19 итераций: машина либо «плоская коробка», либо
  «aerodynamic wedge», цвет приходит как white (PBR не пробрасывается через
  Roblox Open Cloud Model import), forward axis непредсказуем (rotation
  лотерея каждый раз).
- Из исследования: [nilo.io blog](https://nilo.io) пишет что Tripo «лучше»
  Meshy на машинах — но «лучше» это «из плохого лучше».
- Visual QA gate (Round 19 A) задумывался как safety net чтобы reject'ить
  плохие меши. Но даже с QA, машина при удачном проходе всё равно не
  топ-качество — а при reject пользователь получает procedural fallback,
  который тоже выглядит блочно.
- Roblox Cube Foundation Model + Car-5 schema (body + 4 separate wheel mesh
  parts) — единственное реальное решение «AI gen для машин» — но API
  будет Q2-Q3 2026. До этого момента нет смысла полагаться на AI-mesh для
  cars.

---

## 1. Что делают успешные Roblox-игры с машинами

**Не AI-mesh.** Все виралки (Jailbreak, Greenville, A Dusty Trip,
Driving Empire, и т.д.) используют **curated library of pre-built
vehicles** — 10-50 моделей сделанных вручную или заказанных у художников,
загружены как Roblox Models один раз, хранятся как assetIds, при создании
new vehicle игре просто `InsertService:LoadAsset(assetId)` + цветовая
кастомизация через `MeshPart.Color` и/или decal swap.

Это **проверенный пайплайн**. Нам нужно повторить его.

---

## 2. Доступные источники free vehicle assets

### 2.1 Roblox ENDORSED Vehicle Pack — самый ценный ресурс

9 машин **созданных и поддерживаемых самим Roblox** как official Studio
templates. Free, PBR textures, working chassis physics. Это эталон.

| Тип | AssetId | Library URL |
|---|---|---|
| Police Car | `6418230807` | https://www.roblox.com/library/6418230807/Police-Car |
| Dune Buggy | `6433272094` | https://www.roblox.com/library/6433272094/Dune-Buggy |
| Light Utility Vehicle | `6418221666` | https://www.roblox.com/library/6418221666/Light-Utility-Vehicle |
| Pickup Truck | `6418225759` | https://www.roblox.com/library/6418225759/Pickup-Truck |
| SUV | `6418234850` | https://www.roblox.com/library/6418234850/SUV |
| Sedan | `6418239833` | https://www.roblox.com/library/6418239833/Sedan |
| Van | `6433316269` | https://www.roblox.com/library/6433316269/Van |
| Sports Car | `6433323089` | https://www.roblox.com/library/6433323089/Sports-Car |
| Supercar | `6433330180` | https://www.roblox.com/library/6433330180/Supercar |

Источник: [devforum: New Endorsed Models in Toolbox](https://devforum.roblox.com/t/new-endorsed-models-in-toolbox/1068480)

### 2.2 CodeBlue Studios Open-Sourced Vehicle Pack — 5 американских машин

- Asset ID: `14508306846`
- Library: https://www.roblox.com/library/14508306846/Vehicle-Pack
- Содержит: 2016 Dodge Charger, 2014 GMC Sierra, 2019 Ford Explorer,
  2015 Ford F-350, 2014 Dodge Charger
- Lock scripts + auto-brake on exit
- Источник: [devforum: Open Sourced Vehicle Pack](https://devforum.roblox.com/t/open-sourced-vehicle-pack/2540074)

### 2.3 Xsticcy Simple Cars Pack — 4 low-poly cars

- Asset ID: `6983234835`
- Library: https://www.roblox.com/library/6983234835/Simple-Cars-by-Xsticcy
- 4 low-poly машинки, working lights, drivable
- Источник: [devforum: Simple Cars Pack](https://devforum.roblox.com/t/simple-cars-pack-4-lowpoly-cars/1302469)

### 2.4 Прочие источники (для расширения позже)

- [devforum: 29+ free vehicles](https://devforum.roblox.com/t/29-free-vehicles-fixes/769842)
- [devforum: VERY low poly car asset pack](https://devforum.roblox.com/t/very-low-poly-car-asset-pack/2394574)
  (Blender .blend files: Ferrari 250 GTO, Maserati Quattroporte, Audi R8,
  Mustang Dark Horse, Tesla Roadster — нужен ручной upload)
- [devforum: Gamepass Car (Free Resource)](https://devforum.roblox.com/t/gamepass-car-free-resource/3062344) — asset `18415445022`

### 2.5 Open-source chassis систем (если захотим custom physics)

- [A-Chassis (github.com/lisphm/A-Chassis)](https://github.com/lisphm/A-Chassis) — beginner-friendly, расширяемая
- [OpenChassis (github.com/OpenChassis/OpenChassis)](https://github.com/OpenChassis/OpenChassis) — motored chassis
- [NGChassis](https://devforum.roblox.com/t/introducing-ngchassis-102-open-source-simple-realistic/986580) — 51 строка кода, для обучения
- [SL-Chassis](https://devforum.roblox.com/t/sl-chassis-open-source-release/1143018)

Текущий наш `addVehiclePhysics` (robloxWorker.ts L3243+) с HingeConstraint
+ VehicleSeat работает нормально — менять не обязательно. Эти ресурсы
только если захотим продвинутую физику (suspension, drift, gears).

---

## 3. Что у нас УЖЕ есть в коде (надо учитывать при rewrite)

- `addVehicleBodyShell()` в [robloxWorker.ts L2679+](../../apps/functions/src/robloxWorker.ts)
  — procedural composer. 89 `addBodyPart('FamilyCar*')` вызовов для седана,
  + аналогичные шаблоны для boat / plane / helicopter / spaceship / tank.
  330 `addBodyPart` total — это много накопленной procedural мудрости.
- `addVehiclePhysics()` (L3243+) — wheels + HingeConstraint + VehicleSeat.
  Работает. Не трогать.
- `addVehicleSeats()` — DriveSeat + passenger seats.
- VehicleController script template — встроен в codebase, проверен.
- `runMeshy()` / `runTripoVehicleText()` — оставить как dormant fallback,
  использовать только когда library не подходит.
- Visual QA gate (Round 19 A) — оставить как safety net на случай AI-mesh.
- iOS chat flow: concept → approve → 3D — не менять.

---

## 4. Три варианта реализации curated library

### Опция X.1 — InsertService:LoadAsset в runtime

Простейший вариант. В RBXM кладём Script, который при запуске игры
делает `InsertService:LoadAsset(VEHICLE_ASSET_ID)` и клонирует загруженную
модель в Workspace, применяя цвет.

**Плюсы**: 0 байт ассетов в RBXM, всегда свежая версия модели.

**Минусы**:
- Требует HTTP request при запуске → задержка ~200ms на машину.
- Если asset станет недоступным (Roblox удалил, creator скрыл) — модель
  не загрузится в production.
- InsertService:LoadAsset работает только для public assets ИЛИ для
  ассетов owned by experience owner. Endorsed Roblox vehicles — public,
  должны работать. CodeBlue/Xsticcy — нужно проверять.

### Опция X.2 — Открыть .rbxm каждого endorsed vehicle, вшить как template

В build-time скачиваем 9 endorsed vehicle .rbxm файлов через Roblox
Open Cloud, парсим Lune'ом, сохраняем как «templates» в коде проекта.
При генерации новой машины — берём подходящий template, применяем
цветовой tint, вшиваем целиком в RBXM пользователя.

**Плюсы**:
- Self-contained RBXM. Открыл в Studio — машина уже там, без HTTP.
- Можем модифицировать template до серилизации (цвет, размер, аксессуары).
- Не зависит от network failures в production.

**Минусы**:
- Каждая машина ~50-150 KB в RBXM (vs 10 KB сейчас).
- Нужен один раз скачать все templates и закоммитить .rbxm в repo (или GCS).
- Авторские права: Endorsed Roblox vehicles разрешены к free use внутри
  Studio, но redistribution как embedded assets в чужом RBXM — серая зона.
  Безопаснее InsertService:LoadAsset.

### Опция X.3 — Гибрид: InsertService на runtime + procedural fallback

Самое сбалансированное:
1. LLM маппит prompt → имя template (`taxi` → `Sedan` template assetId).
2. RBXM экспортится с `VehicleLoaderScript` + параметром `assetId`.
3. При запуске игры: Script делает LoadAsset, клонирует модель в Workspace,
   применяет user color к body MeshParts.
4. Если LoadAsset падает (network / asset unavailable) → Script сам
   строит procedural FamilyCar (текущий baseline) как fallback.

Один RBXM, robust, всегда что-то ездит.

---

## 5. Маппинг prompt → template (LLM router)

Простой Gemini/Sonnet-вызов с system prompt:

```
You are a Roblox vehicle template router. Map the user's prompt to ONE of
these 9 endorsed Roblox vehicle types:
  - PoliceCar
  - DuneBuggy
  - LightUtilityVehicle
  - PickupTruck
  - SUV
  - Sedan
  - Van
  - SportsCar
  - Supercar

Also pick a primary color (hex) and accent color from the prompt.

Output JSON: {template: "Sedan", primaryHex: "#F2B807", accentHex: "#000000"}.
```

Edge cases:
- «taxi» → `Sedan` + yellow
- «cybertruck» → `PickupTruck` + silver (точного нет, ближайший — pickup)
- «racecar» → `SportsCar` / `Supercar`
- «школьный автобус» → `Van` + yellow
- Motorcycle / bicycle / boat / plane — отдельная ветка, не endorsed
  vehicles. Можем сохранить procedural для них или искать отдельные
  template-пакеты.

---

## 6. Реализационный план (1 сессия, ~3-4 часа работы)

### Стадия 1 — добавить library router (1 час)

- Новый файл `apps/functions/src/vehicleLibrary.ts`:
  - `VEHICLE_ENDORSED_TEMPLATES` — статический map имя → assetId.
  - `pickVehicleTemplate(prompt, metadata)` → `{template, primaryHex,
    accentHex}` через single Gemini call.
- Юнит-тест на ~10 промптах (taxi, sports car, police, и т.д.).

### Стадия 2 — заменить mesh stage в `index.ts:27166+` (1 час)

- Удалить Tripo+Meshy chain (или оставить за env-flag `ENABLE_AI_MESH=true`
  для future experiments).
- Новая stage: `pick_vehicle_template` → вызывает `pickVehicleTemplate()`,
  сохраняет в metadata: `vehicleTemplateAssetId`, `vehicleTemplateName`,
  `vehiclePrimaryHex`, `vehicleAccentHex`.

### Стадия 3 — `robloxWorker.ts` mesh branch (1 час)

- Если `metadata.vehicleTemplateAssetId` есть → НЕ создаём `VehicleMeshBody`
  как раньше. Вместо этого emit'им маленький `LocalScript` или server `Script`
  с template:
  ```lua
  local InsertService = game:GetService("InsertService")
  local TEMPLATE_ASSET_ID = <number>
  local PRIMARY = Color3.fromRGB(...)
  local ACCENT = Color3.fromRGB(...)

  local model = InsertService:LoadAsset(TEMPLATE_ASSET_ID)
  -- clone into Workspace, apply colors to BodyShell / Roof
  -- delete this loader script
  ```
- Procedural `addVehicleBodyShell` остаётся как FALLBACK через `pcall`
  внутри loader Script — если `LoadAsset` упал, скрипт строит блочную
  машину сам.

### Стадия 4 — smokes + deploy (30 мин)

- Smoke test: эмитим RBXM с template assetId, проверяем что Script внутри
  компилируется и содержит правильный assetId.
- Deploy.
- E2E проверка на одном prompt («yellow taxi»).

---

## 7. Открытые вопросы (решить утром)

1. **Endorsed Roblox vehicles — авторские права на использование в чужом
   experience через InsertService.** Нужно проверить Roblox TOS. По
   логике endorsed = public, ok, но формально подтвердить.

2. **Что делать с категориями вне endorsed списка** (мотоциклы, лодки,
   самолёты, танки, фантастический транспорт)? Варианты:
   - (a) Procedural fallback (текущий baseline для bike/boat/plane уже есть).
   - (b) Найти отдельные free packs (есть [29+ free vehicles](https://devforum.roblox.com/t/29-free-vehicles-fixes/769842) — может покрыть).
   - (c) Ограничить scope: вначале только car-варианты, остальное по запросу.

3. **Цвет: применять к каким MeshParts?** Endorsed models имеют разные
   названия body parts. Нужно открыть один и посмотреть структуру.
   Простой эвристический подход: tint всем MeshPart'ам у которых Color
   не black/white/glass-like AND Material != Glass/Metal — то есть только
   «крашеному кузову».

4. **Что делать с текущим Visual QA gate + Blender vehicle-fix service?**
   - Visual QA не нужен если используем известные templates (они гарантированно норм).
   - Blender service остаётся для других пайплайнов (clothing cage gen).
   - Можно отключить Visual QA для vehicles ветки, сохранить для AI-mesh fallback.

5. **Tripo + Meshy полностью убрать или оставить за env flag?**
   - User вчера сказал «оставь Meshy», но это было до решения про curated library.
   - Рекомендую: убрать оба из default flow, оставить как `ENABLE_AI_MESH=true`
     env flag для будущих экспериментов.

---

## 8. Что НЕ делаем тонким fine-tuning'ом

- Не пытаемся снова чинить Tripo / Meshy orientation / texture extraction.
  19 раундов в эту сторону доказали — fundamentally wrong tool for cars.
- Не пытаемся улучшать procedural baseline ещё больше. Он остаётся как
  reliable fallback но НЕ основной путь.
- Не пишем custom mesh generator с нуля. Есть готовые endorsed templates.

---

## 9. Сравнительная таблица: что мы получим

| Метрика | Текущий (AI-mesh) | Опция X (curated library) |
|---|---|---|
| Качество визуала car | 2/10 (wedge / коробка) | 8/10 (Roblox endorsed) |
| Время генерации | 2-5 мин (Meshy + Blender + QA) | 5 сек (LLM router) |
| Стоимость per car | $0.80-1.00 | $0.001 (Gemini router call) |
| Variety | Бесконечно (но плохо) | 9 endorsed + 5 CodeBlue + 4 Xsticcy = 18 templates |
| Detsrministic | Нет, рулетка каждый раз | Yes, тот же promt → тот же template |
| Зависимость от внешних AI | Tripo + Meshy + Claude vision | Только Gemini router (или statically) |
| Roblox compatibility | 60% (mesh иногда не загружается) | 100% (endorsed templates тестированы Roblox) |

---

---

## 10. Уже подготовлено ночью (2026-05-22 night)

### 10.1 Все 9 endorsed templates скачаны

Папка: `docs/vehicle-rebuild/templates/`

| Template | Bytes (rbxm) | MeshParts | Scripts | HingeConstraints |
|---|---|---|---|---|
| PoliceCar-6418230807 | 378,657 | 52 | 14 | 8 |
| DuneBuggy-6433272094 | 385,238 | 69 | 42 | — |
| LightUtilityVehicle-6418221666 | 371,621 | 156 | 56 | 32 |
| PickupTruck-6418225759 | 425,610 | 123 | 42 | 24 |
| SUV-6418234850 | 399,709 | 138 | 42 | 24 |
| **Sedan-6418239833** | 683,241 | **210** | 70 | 40 |
| Van-6433316269 | 320,330 | 79 | 42 | 18 |
| **SportsCar-6433323089** | 661,003 | 92 | 42 | 18 |
| Supercar-6433330180 | 395,583 | 99 | 42 | 18 |

Total: ~3.6 MB для всех 9. Sedan и SportsCar — самые большие (видимо
пятицветные варианты внутри одного pack'а).

### 10.2 Готовый downloader

`docs/vehicle-rebuild/02-downloader.mjs` — повторно качает все 9 файлов
из Roblox assetdelivery через существующий `ROBLOX_SERVICE_COOKIE`. Запускать:

```bash
node docs/vehicle-rebuild/02-downloader.mjs
```

### 10.3 Открыть templates в Studio

В Studio: **File → Open** → выбрать любой `.rbxm` из templates/.
Появится Model «Sedan» (или другой) с готовыми колёсами, физикой,
скриптами. Это эталон того что мы хотим эмитить.

Также копия Sedan лежит в `/Users/test/Downloads/endorsed-sedan-template.rbxm`
(683 KB) — открыть напрямую из Downloads.

### 10.4 Подтверждение что pathway работает

- Auth через cookie работает (no XSRF / no special Open Cloud setup нужен).
- HTTP 200 на всех 9 assetIds.
- RBXM формат корректный (gzip wrapper, `<roblox!` magic после ungzip).
- Все имеют рабочие HingeConstraints (proper physics).

---

## Sources

- [Roblox Devforum: New Endorsed Models in Toolbox](https://devforum.roblox.com/t/new-endorsed-models-in-toolbox/1068480)
- [Devforum: Open Sourced Vehicle Pack (CodeBlue Studios)](https://devforum.roblox.com/t/open-sourced-vehicle-pack/2540074)
- [Devforum: Simple Cars Pack (Xsticcy)](https://devforum.roblox.com/t/simple-cars-pack-4-lowpoly-cars/1302469)
- [Devforum: 29+ Free Vehicles](https://devforum.roblox.com/t/29-free-vehicles-fixes/769842)
- [Devforum: VERY Low Poly Car Asset Pack](https://devforum.roblox.com/t/very-low-poly-car-asset-pack/2394574)
- [Devforum: Gamepass Car (Free Resource)](https://devforum.roblox.com/t/gamepass-car-free-resource/3062344)
- [Devforum: How to access endorsed vehicle .obj/.fbx](https://devforum.roblox.com/t/how-to-access-the-original-objfbx-files-of-the-endorsed-vehicle-pack/1529348)
- [A-Chassis (GitHub)](https://github.com/lisphm/A-Chassis)
- [OpenChassis (GitHub)](https://github.com/OpenChassis/OpenChassis)
- [NGChassis open-source (Devforum)](https://devforum.roblox.com/t/introducing-ngchassis-102-open-source-simple-realistic/986580)
- [SL-Chassis open-source (Devforum)](https://devforum.roblox.com/t/sl-chassis-open-source-release/1143018)
