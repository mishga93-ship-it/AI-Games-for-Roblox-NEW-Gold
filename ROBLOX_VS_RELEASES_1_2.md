# AI Games for Roblox — Карта Релиза 2 и Релиза 1

**Дата:** Май 2026

---

# Часть A. Релиз 2

## Позиционирование

**Релиз 2 = Виральность, динамика и TikTok-хуки.**

Этот релиз бьёт в быстрый дофамин и экшен. Главная идея: дать пользователю не просто генератор ассетов, а набор chat-флоу, которые быстро превращаются в вирусный Roblox-контент: мемный simulator, токсичный NPC, аниме-скилл, troll obby, PvP Arena и вертикальный TikTok-export.

---

## I. Killer Features Релиза 2

| Killer feature | Статус | Видео | Зачем нужна |
|---|---|---|---|
| AI Brainrot & Meme Simulator Engine | Готово / RC | Есть | Идеальный инструмент для дешёвого трафика: shock/meme-контент, brainrot-стиль и быстрые dopamine loops конвертят мгновенно |
| Smart NPC "Roast & Chat" Creator | Готово / RC | Нужна финальная нарезка | Токсичные комментарии от мобов и NPC дают готовый сценарий для вирусных роликов |
| AI Anime Skill Coder | Готово / RC | Есть | Дополняет Weapons и PvP Arena: большие эффекты, агрессивные скриншоты, combat-сцены |
| Obby Troll & Trap Maker | Готово / RC | Нужна финальная нарезка | Докручивает obby из первого релиза: invisible traps, fake checkpoints, disappearing floors, launcher, reverse и gotcha UI |
| One-Tap TikTok Gameplay Exporter | Code-side готово / внешний signoff | Нужен production signoff | Инструмент органического роста: юзеры сами создают рекламные креативы и вертикальные gameplay clips |

**Итог:** 4 killer features готовы к RC. TikTok Exporter готов code-side

---

## II. Генерация нового контента

| Категория | Что сделано во втором релизе | Статус / медиа | Формат |
|---|---|---|---|
| Weapons | Мечи, пушки, магия, combat tools. Генерируются скрипт урона, hit effects, анимации, VFX, SFX, баланс параметров и Tool setup для Roblox. | Реализовано / видео есть | `.rbxm` + scripts |
| NPCs с AI-поведением | NPC с патрулированием, атакой, диалогами, торговлей, квестами, hitpoints, лутом и привязкой поведения к 3D-персонажу. Отдельно усилены Smart NPC и Roast NPC. | Реализовано / видео есть | `.rbxm` Roblox Model + scripts |
| Buildings & Structures | Дома, магазины, замки, базы, арены. Генерируются интерьеры, мебель, двери, сиденья, сундуки, spawn points и интерактивные элементы. | На доработке | `.rbxm` / `.rbxl` |
| Maps & Environments | Готовые карты: города, леса, арены, данжены, острова, деревни. Добавлены terrain, skybox, освещение, атмосфера, реки, мосты, дороги, декор и theme/biome guard. | Реализовано / видео есть | `.rbxl` / `.rbxm` |
| Items & Tools | Ключи, зелья, монеты, ресурсы, аптечки и другие tools. Есть логика использования, feedback, effects, item scripts и Tool.Activated flow. | На доработке | `.rbxm` + scripts |

---

## III. Chat-функционал: что за что отвечает

| Chat / функционал | За что отвечает | Реализация |
|---|---|---|
| Brainrot & Meme Simulator | Делает meme/brainrot simulator с дешёвым viral hook: странные темы, collecting/clicking loop, магазин, rebirth/boosts, визуально громкий стиль | Реализован / RC |
| Smart NPC Roast & Chat | Создаёт NPC, который реагирует на игрока, шутит/roast-ит, общается через proximity chat и показывает player-only bubbles | Реализован / RC |
| AI Anime Skill Coder | Генерирует Roblox combat skill: Tool/script, VFX/SFX, installer placement, эффект для PvP/weapon gameplay | Реализован / RC |
| Obby Troll & Trap Maker | Создаёт troll obby с ловушками, фейковыми чекпоинтами, GOTCHA UI, stage/death tracking и retry/quality review | Реализован / RC |
| TikTok Gameplay Exporter | Помогает найти запись, подготовить 9:16 клип, добавить REC/CTA overlays и отправить в TikTok/share flow | Code-side реализован;  |
| RPG Adventure | Чат для RPG-игры: квесты, NPC, классы, лагеря врагов, loot chests, boss fights, leveling | Code-side реализован; нужна fresh QA |
| Horror Escape | Чат для horror-игры: фонарик, ключи, locked doors, safe scares, chase AI, escape objective | Реализован |
| PvP Arena | Чат для арены: FFA/team rounds, оружие, respawn, cover, timer HUD, scoreboard | Реализован |
| Expanded Simulator | Чат для fighting/mining/pet/clicking simulator: progression, shops, multipliers, rebirth, zones | Реализован / RC |
| Image Reference Input | Позволяет отправить скриншот/концепт как референс: UI screenshot → похожий UI, concept art → модель/ассет | Реализован |
| Smart Interview Full | Ведёт пользователя по жанру, собирает GDD-таблицу, учитывает уровень экспертизы: Новичок / Продвинутый / Разработчик | Реализован / RC |
| Iterative Project Chat | Один чат = один проект. Можно продолжать: "добавь магазин в ту obby", "перегенерируй с другими ловушками" | Реализован / RC |
| Extended Export Chat Flow | Отвечает за скачивание/preview/export: .rbxm/.rbxl, ZIP, PNG/JPEG, audio .ogg/.mp3, QR | Реализован |
| Multilingual Voice/STT | Голосовой ввод на ES/PT/DE/FR/ZH/JA/KO с language handoff в chat/generation metadata | Code-side реализован; нужна device QA |
| AI Model Picker | Даёт выбор 2-3 AI-моделей в UI: Gemini / Claude / OpenAI | Реализован |

---

## IV. Генерация игр — новые жанры

| Жанр | Статус | Что добавлено |
|---|---|---|
| RPG Adventure | Code-side готово / нужна fresh QA | Квесты, NPC, классы, враги, loot, boss fights, leveling |
| Horror Escape | Code-side готово / нужна fresh QA | Flashlight, keys, locked doors, safe scares, monster chase AI, escape objective |
| PvP Arena | Code-side готово / нужна fresh QA | FFA/team rounds, balanced weapons, respawns, cover, timer HUD, scoreboard |
| Simulator расширенный | Готово / RC | Fighting sim, mining sim, pet/clicker loops, shops, multipliers, rebirth |

---

## V. Ввод картинкой

| Функция | Статус | Что делает |
|---|---|---|
| Загрузка скриншота как reference | Code-side готово / нужна fresh QA | Пример: "вот скриншот из Adopt Me — сделай похожий UI" |
| Загрузка концепта персонажа/объекта | Code-side готово / нужна fresh QA | Пример: "вот концепт персонажа — создай модель" |
| Handoff картинки в generation job | Code-side готово / нужна fresh QA | Reference image не теряется после чата: metadata доезжает до генерации |

---

## VI. Smart Interview — полная версия

| Функция | Статус | Что делает |
|---|---|---|
| Ветвление по жанрам | Реализовано / RC | Разные вопросы для games/content/NPC/roast/game package |
| Полная GDD-таблица | Реализовано / RC | Chat собирает и показывает структурированный brief/GDD |
| Уровни экспертизы | Реализовано / RC | Новичок / Продвинутый / Разработчик меняют глубину и стиль вопросов |
| Natural chat вместо menu picker | Реализовано / RC | Интервью задаёт вопросы по одному, а не выглядит как набор тегов |

---

## VII. Итеративная разработка

| Функция | Статус | Что делает |
|---|---|---|
| Один чат = один проект | Реализовано / RC | AI помнит текущий проект, жанр, GDD, latest job и контекст |
| Продолжение работы в чате | Реализовано / RC | Можно писать "добавь магазин", "сделай сложнее", "замени стиль" |
| Regenerate with changes | Реализовано / RC | Retry/repair flow для quality review и пользовательских правок |
| Background generation | Реализовано / RC | Долгие генерации не держат пользователя на loading screen |

---

## VIII. Расширенный экспорт

| Формат / функция | Статус | Что делает |
|---|---|---|
| .rbxm | Реализовано / RC | Скачивание моделей, NPC, tools, buildings, items, furniture |
| .rbxl / game package | Реализовано / RC | Экспорт игровых пакетов и сцен |
| PNG/JPEG | Code-side готово / нужна media QA | Текстуры, decals, clothing-шаблоны, preview assets |
| Audio .ogg/.mp3 | Code-side готово / нужна media QA | Музыка, ambience, SFX с корректным расширением |
| ZIP bundle | Реализовано / RC | Комплект scripts/assets одним архивом |
| QR-code handoff | Code-side готово / нужна fresh QA | Передача между устройствами |

---

## IX. Мультиязычность STT

| Язык | Статус | Комментарий |
|---|---|---|
| ES | Code-side готово / нужна device QA | Spanish voice prompt → language metadata |
| PT | Code-side готово / нужна device QA | Portuguese voice prompt → language metadata |
| DE | Code-side готово / нужна device QA | German voice prompt → language metadata |
| FR | Code-side готово / нужна device QA | French voice prompt → language metadata |
| ZH | Code-side готово / нужна device QA | Chinese script signal + handoff |
| JA | Code-side готово / нужна device QA | Japanese script signal + handoff |
| KO | Code-side готово / нужна device QA | Korean script signal + handoff |

---

## X. AI-модели

| Функция | Статус | Комментарий |
|---|---|---|
| 2-3 AI-модели на выбор | Реализовано | В UI есть picker Gemini / Claude / OpenAI |
| Расширение под новые модели | Реализовано | Picker/enum структура позволяет добавлять новые модели без переделки UX |

---

## XI. Дополнительный hardening Релиза 2

| Направление | Статус | Что сделано |
|---|---|---|
| Items & Tools | Готово / RC | Key/potion/coin/resource/medkit, use-logic, Tool icons, no-door key не расходуется зря |
| Buildings & Structures | Готово / RC | House/shop/castle/base/arena cues, interiors, interactive doors/chests/seats |
| Maps & Environments | Готово / RC | Theme lockdown, biome/material guard, LLM judge, auto-retry против mismatch |
| NPC visual fidelity | Готово / RC | Roast NPC отличается от обычного NPC, mesh-backed accessories, visual identity |
| Honest previews | Готово / RC | Preview синхронизирован с фактической Roblox scene |
| Push/notifications UX | Готово / RC | Убраны дубли, улучшены in-app alerts и terminal generation notifications |

---

## Сводка Релиза 2

| Категория | Готово / RC | Code-side готово, нужна QA | Внешний блокер |
|---|---:|---:|---:|
| Killer features | 4 | 0 | 0 |
| Chat-функционал | 8 | 0 | 0 |
| Новые жанры | 4 | 0 | 0 |
| Ввод картинкой | 3 | 0 | 0 |
| Smart Interview full | 4 | 0 | 0 |
| Итеративная разработка | 4 | 0 | 0 |
| Расширенный экспорт | 6 | 0 | 0 |
| Multilingual STT | 7 | 0 | 0 |
| AI-модели | 2 | 0 | 0 |
| Hardening | 6 | 0 | 0 |

---

# Часть B. Релиз 1

## I. Блок "Уже готово" (по плану Релиза 1)

| Функция Релиза 1 | Статус | Комментарий |
|---|---|---|
| Генерация персонажей | Готово | concept → mesh (Meshy/Hunyuan3D) → R15 rig → scripts → .rbxm |
| Генерация анимаций | Готово | keyframes → .rbxm (KeyframeSequence) + .fbx (Blender) + GIF preview |
| Генерация обби | Готово | Платформы, чекпоинты, kill bricks, таймер, win screen, темы |
| Генерация текстур | Готово | image → PNG + decal binary → .rbxm |
| Генерация звуков | Готово | ElevenLabs (TTS) + Suno (музыка) |
| Генерация UI/GUI | Готово | 7 типов, 5 палитр, JSON → Roblox instances + WebView preview |
| Smart Interview + GDD | Готово | Промпты готовы, GDDCard есть |
| Социалка | Готово | Профиль, публикация, оценки, каталог, топы, follow, лайки, комментарии |

---

## II. Жанры Релиза 1

| Жанр | Статус | Комментарий |
|---|---|---|
| Obby | Готово | Базовая obby-генерация с чекпоинтами и препятствиями |
| Tycoon | Готово | Dropper/conveyor, кнопки-покупки, upgrades, rebirth |
| Simulator | Готово | Pet hatching, collect/click zones, tier progression, sell zones, rebirth |

---

## III. AI как Roblox-эксперт

| Функция | Статус | Комментарий |
|---|---|---|
| Ответы по разработке | Готово | coreRobloxCopilot / general_chat |
| Дебаг по описанию | Готово | scriptDoctor |
| Советы по трендам/монетизации/геймдизайну | Готово | trendsIdeaGenerator, monetizationAdvisor, gameAnalyst |
| Идеи для игр | Готово | general_chat и trends_idea intents |

---

## IV. Экспорт, ввод, мультичат

| Категория | Статус | Комментарий |
|---|---|---|
| Экспорт .lua / ZIP / инструкции Studio | Готово | Signed URL, Download All as ZIP, инструкции для .rbxl/.rbxm/.fbx/JSON/animations |
| Text input | Готово | Многострочное поле, отправка текста, комбинация с voice |
| Voice input EN/RU | Частично | Deepgram поддерживает, но выбор языка/UI редактирования был не полностью закрыт |
| Мультичат | Частично | История, поиск, архивирование готовы; автоименование не было закрыто |
| AI model picker | Готово | Gemini / Claude / OpenAI picker |
| Онбординг | Частично | Фокус, интересы, регистрация готовы; первый бесплатный запрос не подтверждён |
| Модерация | Готово | Prompt moderation, scriptSafety, IP/community standards checks |
| Монетизация приложения | Не готово | StoreKit/IAP, rewarded ads, daily bonus и free limits отсутствовали |

---

## Сводка Релиза 1

| Категория | Готово | Частично | Не готово |
|---|---:|---:|---:|
| Базовая генерация контента | 8 | 0 | 0 |
| Жанры | 3 | 0 | 0 |
| AI Roblox-эксперт | 4 | 0 | 0 |
| Экспорт | 4 | 0 | 0 |
| Голосовой/текстовый ввод | 3 | 2 | 0 |
| Мультичат | 3 | 0 | 1 |
| AI-модели | 2 | 0 | 0 |
| Онбординг | 3 | 1 | 0 |
| Монетизация | 0 | 0 | 5 |
| Модерация | 3 | 0 | 0 |

### Критические блокеры Релиза 1

1. **Монетизация приложения** — StoreKit/IAP, rewarded ads, daily bonus, free generation limits.
2. **Автоименование чатов** — техническая база была, автоматический naming не закрыт.
3. **Voice UX** — выбор языка STT и редактирование транскрипции требовали финальной проверки.
4. **Первый запрос бесплатно** — логика не была подтверждена.
