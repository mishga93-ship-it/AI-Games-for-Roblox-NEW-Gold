# TЗ Audit Matrix — Полный аудит проекта

Источник требований: `AI Roblox NEW Gold.md`
Дата аудита: 25.03.2026

Статусы:
- `Implemented` — есть рабочая реализация в текущем коде
- `Partial` — есть базовая опора, но не весь объем ТЗ
- `Missing` — в коде нет реализации под требование

---

## Раздел 1. КОНЦЕПЦИЯ ПРОДУКТА

| Требование | Статус | Детали |
| --- | --- | --- |
| iOS-приложение | Implemented | SwiftUI, iOS 16+, полноценный клиент в `apps/ios/` |
| Android-приложение | Missing | Нет Android-клиента в репозитории |
| Направление 1 — генерация целых игр | Partial | Pipeline существует (prompt → GDD → manifest → Lune → .rbxl), но сборка .rbxl зависит от worker-сервиса и ограничена JSON-манифестом (только базовые Part/Script, нет мешей/текстур/аудио в binary) |
| Направление 2 — генерация отдельного контента | Partial | Маршрутизация по видам контента есть, 3D через Meshy/Hunyuan3D (Fal), аудио через ElevenLabs, код через LLM; но не все категории из ТЗ покрыты |
| Социальная платформа | Partial | Есть базовый backend (Firestore), лента, лайки, комментарии, follow; нет полноценного каталога, топов, рейтингов |

---

## Раздел 2. AI SMART INTERVIEW

| Требование | Статус | Детали |
| --- | --- | --- |
| 2.1 Quick Generate (развёрнутый запрос → сразу генерация) | Partial | Тип `WorkspaceFlow = 'quick_generate'` существует и передаётся в prompt; но флаг `skipInterview` в `ChatTurnRequest` **не читается** в `buildChatPrompt` — фактически не используется |
| 2.2 Smart Interview (3-8 адаптивных вопросов) | Implemented | `promptCatalog.ts` содержит явные `GAME_GENRE_BRANCHES` для 15 игровых жанров, 3-5 turn flows, genre-specific required rows/defaults/quick replies и отдельный interview kind для game/content/playable flows; отдельной hard state machine пока нет, но backend prompt contract теперь детерминирован по жанру |
| 2.3 Интервью для игр (жанр, персонажи, масштаб, визуал, монетизация) | Implemented | Game interview branch table покрывает жанр, core loop, карту/уровни, прогрессию, экономику/монетизацию, social systems, Roblox services, technical/safety notes и expertise-specific подсказки |
| 2.4 Интервью для контента (тип, стиль, назначение, параметры) | Partial | Аналогично — через промпт, без жёсткой структуры |
| 2.5 Адаптивность (группировка, Quick Replies, "Реши за меня") | Partial | `quickReplies` поддержаны в типах и iOS UI (`QuickReplyChips`); "Реши за меня" — нет явной кнопки в iOS; группировка 1-2 вопроса — только через промпт |
| 2.6 GDD — финальное подтверждение | Implemented | `GameDesignDoc` расширен до полной таблицы; backend `normalizeGdd/gddToRows` сохраняет новые поля и отдаёт localized `message.gddRows`; iOS `GDDCard` показывает 15-18 строк с раскрытием длинных rows |
| 2.7 Интервью для редактирования существующего контента | Partial | Промпты `editExistingProject` и `analyzeExistingProject` есть; реальный парсинг .rbxl — только через worker (shallow analysis) |
| 2.8 Уровни экспертизы (новичок/продвинутый/разработчик) | Implemented | `ExpertiseLevel` выбирается в профильном Creator Setup и прямо в Smart Interview chat picker; значение пишется в `UserDefaults.expertiseLevel`, отправляется в metadata и влияет на backend prompts/GDD rows. Автоопределение намеренно не включено, чтобы не перетирать явный выбор пользователя |
| 2.9 AI отвечает на вопросы (Roblox-эксперт) | Implemented | Промпт `coreRobloxCopilot` включает роль Roblox-эксперта, обработка через `general_chat` intent |
| 2.10 Контекст и память в рамках чата | Partial | Firestore threads/messages сохраняются; но iOS-клиент **не загружает полную историю** треда для контекста |
| 2.11 Технические требования (< 2с, Quick Reply 2-6, мультиязычность) | Partial | Quick Replies — 2-6 в промпте; мультиязычность — промпт на языке пользователя; кнопка "Начать сначала" — **нет**; "Сгенерируй сам" — **нет явной кнопки** |

---

## Раздел 3. ПОЛНЫЙ СПИСОК КАТЕГОРИЙ КОНТЕНТА

| Требование | Статус | Детали |
| --- | --- | --- |
| 3.1 Жанры игр (15 жанров: Obby, Tycoon, Simulator, RPG, Horror, Roleplay, PvP Arena, Tower Defense, Racing, Parkour, Story, Mini-games Hub, Survival, Fighting, Custom) | Implemented | Все 15 жанров в `GAME_GENRES` константе (`packages/shared/src/constants.ts`) |
| 3.2 Категории контента (19 категорий по ТЗ) | Partial | В `CONTENT_CATEGORIES` — 14 категорий. **Отсутствуют 5**: Avatar Bodies & Heads, Furniture & Props, Items & Tools, Decals & Textures, Plugins |
| 3.3 Загрузка и редактирование (.rbxl/.rbxm/.lua/PNG/ссылки) | Partial | Endpoint ingestion есть; .lua анализ через regex; .rbxl/.rbxm — только shallow analysis через worker (если настроен); PNG — без глубокого parsing; ссылки — Apify для scraping |

---

## Раздел 4. ФУНКЦИОНАЛЬНЫЕ МОДУЛИ

### 4.1 AI Chat Engine

| Требование | Статус | Детали |
| --- | --- | --- |
| Мультичат-система | Implemented | Firestore threads, CRUD операции, iOS ChatView с боковым списком |
| Автоименование чатов | Partial | `threadTitle` возвращается в ответе AI, но автоименование не всегда срабатывает |
| Ручное переименование | Missing | Нет UI для переименования чата |
| Архивирование, удаление | Partial | Удаление есть; архивирования нет |
| Полнотекстовый поиск | Missing | Нет поиска по чатам ни в backend, ни в iOS |
| Группировка (по дате, типу, проекту) | Missing | Нет группировки в iOS |
| Шаринг чата | Missing | Нет функции "поделиться чатом" |
| Выбор AI-модели | Implemented | iOS: Gemini/Claude/OpenAI picker; Backend: fallback chain gemini → anthropic → openai |
| Open-source модели (Llama, Mistral) — P2 | Missing | Не интегрированы |

### 4.2 Способы ввода

| Требование | Статус | Детали |
| --- | --- | --- |
| Голосовой ввод (главный) | Implemented | AVAudioRecorder → Backend → Deepgram STT; большая кнопка микрофона в iOS |
| Текстовый ввод | Implemented | Многострочное поле в ChatView |
| Ввод картинкой | Partial | Кнопка "Attach file" есть; `PhotosPicker` **не привязан** (dead wiring); image ingestion на backend есть |
| Ввод ссылкой | Implemented | "Attach link" alert в iOS, Apify scraping на backend |
| Комбинация способов ввода | Partial | `InputMode = 'mixed'` определён, но UI не поддерживает одновременный ввод нескольких типов |
| Поддержка 2-3 минут речи | Implemented | Voice sessions с chunk upload |
| Редактирование транскрипции перед отправкой | Partial | Текст транскрипции показывается, но нет явного UI для редактирования |
| Многоязыковой STT (EN, RU, ES, PT, DE, FR, ZH, JA, KO) | Partial | Deepgram поддерживает языки, `locale` передаётся в session; но в iOS нет выбора языка STT |

### 4.3 Пайплайн генерации игры

| Требование | Статус | Детали |
| --- | --- | --- |
| Шаг 1-2 (идея + уточнение) | Implemented | Smart Interview flow через prompts + `GAME_GENRE_BRANCHES` для 15 игровых жанров |
| Шаг 3 (GDD генерация) | Implemented | Промпт `generateGameGdd`, расширенный тип `GameDesignDoc`, backend `gddRows` для полной GDD-таблицы |
| Шаг 4 (подтверждение / правки) | Partial | GDDCard в iOS показывает GDD; но нет явной кнопки "Всё супер, генерируй!" vs "Хочу изменить..." |
| Шаг 5 (генерация: 3D, скрипты, UI, звуки, эффекты) | Partial | LLM генерирует Luau-код и манифест; 3D-окружение — через JSON-манифест (CSG из базовых частей); звуки/эффекты — **не генерируются автоматически** |
| Шаг 6 (сборка .rbxl) | Partial | Lune `build_roblox.luau` может собрать binary .rbxl из манифеста; ограничен: только базовые типы (Part, Script), минимальные CFrame, нет мешей/текстур/аудио в binary |
| Шаг 7 (превью: скриншоты, список фич, структура файлов) | Partial | `GenerationPreviewView` показывает GDD, код, 3D-превью (SceneKit); но нет реальных скриншотов карты |
| Шаг 8 (экспорт .rbxl) | Partial | ExportView с инструкциями, signed URL для скачивания; зависит от успешной сборки worker'ом |
| Визуальный прогресс-индикатор генерации | Implemented | `GenerationProgressRail` в iOS показывает стадии: «Генерирую карту → Пишу скрипты → Собираю UI → Упаковываю .rbxl» |

### 4.4 Пайплайн генерации контента

| Требование | Статус | Детали |
| --- | --- | --- |
| 3D-модели (персонажи, оружие, здания и т.д.) | Implemented | Meshy/Hunyuan3D через Fal; `character_3d` pipeline с stages (concept → mesh → optimize → rig → export) |
| Скрипты на Luau | Implemented | LLM через `runChatProvider`, промпт `generateLuauSystem` |
| UI/GUI генерация | Implemented | Промпт `generateUiGui`, intent `ui_generation` |
| Аудио/музыка | Partial | ElevenLabs интегрирован для TTS; Suno интегрирован; но нет полноценного SFX pipeline |
| Текстуры, декали | Missing | Нет генерации PNG текстур/декалей |
| Анимации | Missing | Нет генерации Roblox-анимаций (.rbxanim / KeyframeSequence) |
| Particles & Effects | Partial | Prompt-level описание есть; нет реальной генерации ParticleEmitter конфигов |
| 3D-вьюер для моделей | Implemented | SceneKit: `GenerationModelPreview`, `RealModel3DPreview` (GLB/OBJ) |
| Подсветка кода для скриптов | Implemented | Monospaced scroll view для Lua кода |

### 4.5 Итеративная разработка

| Требование | Статус | Детали |
| --- | --- | --- |
| Пользователь строит игру итеративно через чат | Partial | Chat context сохраняется; LLM получает историю; но нет diff/apply workflow для итеративных правок |
| AI помнит весь контекст проекта | Partial | Firestore хранит историю; но iOS-клиент не загружает полную историю при открытии треда |

### 4.6 Редактирование существующего контента

| Требование | Статус | Детали |
| --- | --- | --- |
| Загрузка .rbxl → AI парсит → показывает структуру | Partial | Ingestion endpoint есть; worker может сделать shallow analysis (count instances, rig summary); нет глубокого парсинга скриптов/UI/систем |
| Описание изменений → AI вносит правки | Partial | `edit-preview` и `apply` endpoints есть; для текстовых файлов (.lua) реально переписывает через LLM; для бинарных .rbxl/.rbxm — **не реализовано** |
| Превью diff → подтверждение → экспорт | Partial | `ProjectDiffPreview` тип есть; UI для diff preview **не реализован** в iOS |

---

## Раздел 5. СОЦИАЛЬНАЯ ПЛАТФОРМА

### 5.1 Профиль автора

| Требование | Статус | Детали |
| --- | --- | --- |
| Аватар, никнейм, био | Implemented | `SocialProfile` в типах; iOS `ProfileView` с `ProfileAvatarView` |
| Ссылка на Roblox-профиль, соцсети | Partial | `robloxUsername`, `websiteUrl` в типах; нет UI в iOS для их ввода (только `SettingsView` — API URL) |
| Портфолио — все опубликованные работы | Partial | "Recent Exports" в ProfileView; нет полного портфолио-грида |
| Статистика (скачивания, лайки, рейтинг, подписчики) | Partial | `SocialProfile` имеет `totalLikes`, `totalDownloads`, `followerCount`; iOS показывает `creatorStats`; нет рейтинга |
| Бейджи (Top Creator, Game Developer, Script Master и др.) | Partial | `badges: string[]` в типах; iOS UI показывает секцию; но **badges всегда пустые** — нет логики присвоения |
| Подписка (follow) | Implemented | Backend follow/unfollow с Firestore subcollections + count updates |

### 5.2 Публикация контента

| Требование | Статус | Детали |
| --- | --- | --- |
| Публикация с названием, описанием, категорией | Implemented | Backend `POST /api/social/projects/publish`; iOS "Publish to Community" на GenerationPreviewView |
| Скриншоты/превью (1-5) | Partial | `previewUrls` в типах; нет UI для загрузки скриншотов при публикации |
| Теги, changelog | Partial | `tags` в типах; changelog **отсутствует** |
| Обновление с сохранением статистики | Missing | Нет endpoint/UI для обновления публикации |
| Типы: игры, ассеты, скрипты, UI-киты, UGC-шаблоны, пак-наборы | Partial | `projectKind` + `artifactTypes` покрывают основные типы; нет выделенных UI-китов и пак-наборов как категорий |

### 5.3 Оценки и взаимодействие

| Требование | Статус | Детали |
| --- | --- | --- |
| Лайки | Implemented | Backend like/unlike + count |
| Дизлайки | Missing | Нет реализации дизлайков |
| Древовидные комментарии с лайками | Partial | `SocialComment` имеет `parentCommentId` и `likeCount`; backend поддерживает; iOS UI — нет tree-rendering |
| Счётчик скачиваний | Implemented | `downloadCount` в `SocialPost` / `SocialProject` |
| Избранное | Implemented | Save/unsave endpoint + "Saved" tab в каталоге |
| Шаринг (deeplink + ссылка) | Missing | Нет deeplink генерации и шаринга |
| Репорты | Implemented | Backend report endpoint с Firestore |

### 5.4 Каталог и навигация

| Требование | Статус | Детали |
| --- | --- | --- |
| Главная лента: популярное, новое, рекомендации | Partial | `SocialFeedMode`: new/top/trending/following/recommended/saved; но iOS CatalogView показывает только New/Top/Following/Saved |
| Разделение каталога: Игры vs Контент | Missing | Нет двухуровневого разделения; единая лента |
| Фильтры (тип, жанр, рейтинг, дата, популярность) | Missing | Нет фильтров в iOS; backend поддерживает `tag` и `search` в запросе, но не жанр/рейтинг |
| Поиск по названию, тегам, автору | Partial | Backend `search` параметр в `SocialFeedRequest`; но **нет UI поиска** в iOS CatalogView |
| Кураторские коллекции | Missing | Нет реализации |

### 5.5 Топы и рейтинги

| Требование | Статус | Детали |
| --- | --- | --- |
| Топ авторов (по скачиваниям, лайкам, работам) | Missing | Нет endpoint и UI |
| Топ контента по категориям (день/неделя/месяц/всё время) | Missing | Backend `computeFeedScore` есть, но нет отдельных топ-чартов с периодами |
| Rising Stars, Staff Picks, Hall of Fame | Missing | Нет реализации |

---

## Раздел 6. СИСТЕМА МОДЕРАЦИИ

| Требование | Статус | Детали |
| --- | --- | --- |
| 6.1 AI-модерация промтов (ДО обработки) | Implemented | `heuristicModeration` (keyword lists) + conditional AI review через `runChatProvider`; `runModerationPipeline` вызывается перед обработкой chat turn |
| Roblox-специфичные правила (violence, gambling, IP, scam) | Implemented | Промпты модерации включают Roblox Community Standards, IP-ограничения; heuristic filter |
| 6.2 Модерация публикаций — текст (названия, описания, теги) | Implemented | `publicationModeration` промпт; `stage: 'publication'` в `ModerationCheckRequest` |
| 6.2 Модерация публикаций — Vision AI для скриншотов | Missing | Нет Vision AI pipeline для изображений |
| 6.2 Модерация публикаций — проверка скриптов на вредоносный код | Implemented | `scriptSafety.ts`: блокирует `loadstring`, `getfenv`, `setfenv`, обфускацию, remote asset loading; `moderateLuaSource` → block/review/allow |
| 6.3 Модерация комментариев (< 500мс) | Partial | Heuristic filter применим; но нет явного пайплайна < 500мс для комментариев |
| 6.4 Система наказаний (предупреждение → 24ч → 7 дней → перм) | Partial | `ModerationCase` + `ModerationDecision` + `ModerationAppeal` типы + Firestore хранение; но **автоматическая эскалация** (1st → 2nd → 3rd offense) **не реализована** |
| Апелляция через support | Implemented | `ModerationAppeal` с endpoint `POST /api/moderation/cases/:caseId/appeals` |

---

## Раздел 7. ЭКСПОРТ И ИНТЕГРАЦИЯ С ROBLOX

| Требование | Статус | Детали |
| --- | --- | --- |
| 7.1 Экспорт .rbxl | Partial | Worker может собрать .rbxl через Lune, signed URL для скачивания; но ограниченный манифест (нет мешей, текстур, аудио в binary); зависит от `ROBLOX_WORKER_URL` конфигурации |
| 7.2 Экспорт .rbxm / .lua | Implemented | Артефакты типа lua, rbxm генерируются и доступны для скачивания через signed URL |
| 7.3 Экспорт UGC (.fbx для layered, PNG для classic) | Partial | 3D pipeline через Fal может выдать FBX/GLB; PNG-шаблоны для classic clothing — **не реализованы** |
| 7.4 Сохранение в Files / Downloads | Implemented | iOS ExportView открывает URL в Safari для скачивания |
| 7.4 QR-код для передачи между устройствами | Missing | Не реализован |
| 7.4 Облачная синхронизация | Missing | Не реализована |
| 7.4 Шаринг через мессенджеры | Missing | Не реализован |
| 7.5 Все форматы (.rbxl, .rbxm, .lua, .fbx, PNG, .ogg/.mp3) | Partial | `ArtifactType` включает все; реально генерируются: lua, json, rbxl (worker), glb/obj/fbx (3D); **не генерируются**: .ogg/.mp3 аудио-файлы, PNG clothing шаблоны |
| Пошаговая инструкция по публикации на Roblox | Implemented | ExportView содержит инструкции для каждого типа файла |

---

## Раздел 8. ДОПОЛНИТЕЛЬНЫЕ ФИЧИ

| Требование | Статус | Детали |
| --- | --- | --- |
| 8.1 AI Game Remixer | Implemented | Промпт `remixMode` в каталоге, intent `remix` |
| 8.2 AI Script Doctor | Implemented | Промпт `scriptDoctor`, intent `script_doctor`, flow `fix` |
| 8.3 AI Game Analyst | Implemented | Промпт `gameAnalyst`, intent `game_analyst` |
| 8.4 AI UGC Designer | Implemented | Промпт `generateUgcAsset`, intent `ugc_designer` |
| 8.5 AI Obby Level Generator | Partial | Обрабатывается через game generation с жанром Obby; **нет отдельного специализированного генератора** |
| 8.6 AI NPC Dialogue Writer | Implemented | Промпт `generateNpcDialogue`, intent `npc_dialogue` |
| 8.7 Weekly AI Challenges | Missing | Нет реализации челленджей, голосования, призов, фичеринга |
| 8.8 AI Monetization Advisor | Implemented | Промпт `monetizationAdvisor`, intent `monetization` |
| 8.9 Game Template Library | Missing | Нет библиотеки стартовых шаблонов |
| 8.10 Collaborative Creation | Missing | Нет совместной разработки / мульти-пользовательских чатов |
| 8.11 AI Asset Pack Creator | Implemented | Промпт `assetPackCreator`, intent `asset_pack` |
| 8.12 Roblox Trends Tracker | Implemented | Промпт `trendsIdeaGenerator`, intent `trends_idea` |
| AI Game Cloner (Remix Mode) — новая фича | Implemented | Тот же `remixMode` — дубль 8.1 |
| Voice-to-Fix (AI Luau Doctor) — новая фича | Implemented | Voice → STT → Script Doctor flow |
| Trend-Catcher UGC Generator — новая фича | Partial | Trends prompt есть; **автоматический парсинг TikTok-трендов** не реализован |

---

## Раздел 9. UX/UI — КЛЮЧЕВЫЕ ЭКРАНЫ

| Требование | Статус | Детали |
| --- | --- | --- |
| Онбординг — выбор "Игра"/"Контент"/"Оба" | Implemented | `CreationFocus` enum: Games, Content, Both в `OnboardingFlowView.swift` |
| Онбординг — выбор интересов (жанры, типы контента) | Implemented | Грид из 8 `CreatorInterest`: Obby, Tycoon, UGC, Scripts, NPCs, Effects, Horror, Simulator |
| Онбординг — регистрация (email / Apple / Google) | Partial | Регистрация **отделена** в AuthView, не часть онбординга; AuthView поддерживает Email, Apple, Google |
| Главная лента — два таба: "Игры" и "Контент" | Missing | Вместо двух табов — единый HomeView с Dropbox-секциями (Skins, Codes, Mods) и "Open Workspace" |
| Главная лента — популярное, новое, рекомендации | Missing | HomeView: resume projects, favorites, Dropbox-контент; нет trending/popular/recommendations |
| Главная лента — баннеры челленджей, кураторские коллекции | Missing | Нет баннеров и коллекций |
| AI Chat — БОЛЬШАЯ кнопка микрофона | Implemented | `MicButton` в voice composer |
| AI Chat — текстовое поле | Implemented | Многострочное поле + send |
| AI Chat — кнопка прикрепления (файл/картинка/ссылка) | Partial | "Attach file" (fileImporter) и "Attach link" работают; PhotosPicker **не привязан** (dead wiring) |
| AI Chat — выбор AI-модели | Implemented | Picker: Gemini / Claude / OpenAI |
| AI Chat — тип проекта (игра/контент) | Partial | `projectKind` фиксирован при инициализации ChatView; нет переключения в рамках чата; есть FlowModePicker (Quick/Smart) |
| AI Chat — прогресс генерации | Implemented | `GenerationProgressRail` при наличии `generationStages` |
| Результат генерации (игра) — скриншоты карты | Missing | Нет реальных скриншотов сгенерированной карты |
| Результат генерации (игра) — список фич/систем | Partial | GDD rows в preview; нет карточек по системам |
| Результат генерации (игра) — структура файлов, размер | Partial | Артефакты со `sizeBytes`; нет дерева файлов |
| Результат генерации (игра) — кнопки: Скачать, Опубликовать, Доработать, Инструкция | Implemented | Export + Publish + "Continue" + Instructions в GenerationPreviewView / ExportView |
| Результат генерации (контент) — 3D-вьюер | Implemented | SceneKit `GenerationModelPreview` / `RealModel3DPreview` |
| Результат генерации (контент) — код с подсветкой | Implemented | Monospaced scroll view |
| Страница контента в каталоге | Partial | Базовый вид поста: превью, лайки, комментарии; нет полного вида как в ТЗ (фрагмент кода, ссылка на experience) |
| Профиль автора — аватар, статистика, бейджи, работы | Partial | Аватар + статистика есть; бейджи всегда пустые; портфолио — только Recent Exports |
| Топы — табы: игры по жанрам, контент по категориям | Missing | Нет экрана топов |
| Настройки — профиль | Missing | Нет редактирования профиля в Settings |
| Настройки — язык | Missing | Нет выбора языка |
| Настройки — уведомления | Missing | Нет настройки уведомлений |
| Настройки — привязка Roblox-аккаунта | Missing | Нет привязки Roblox-аккаунта |

---

## AI Prompt Layer (дополнительно)

| Требование | Статус | Детали |
| --- | --- | --- |
| Centralized prompt catalog | Implemented | `apps/functions/src/promptCatalog.ts` |
| Core Roblox copilot persona | Implemented | `coreRobloxCopilot` |
| Smart Interview prompts (game/content) | Implemented | `smartInterviewGame`, `smartInterviewContent` |
| Edit/Analyze existing project | Implemented | `editExistingProject`, `analyzeExistingProject` |
| Specialist prompts | Implemented | remix, scriptDoctor, gameAnalyst, trends, assetPack, ugc, ui, npc, monetization, map, audio |
| Chat JSON contract | Implemented | `chatJsonContract` для structured responses |
| Context-aware prompt selection | Implemented | Через `metadata.intent` → `buildChatPrompt` → соответствующий prompt |
| Moderation prompts | Implemented | `promptModeration`, `publicationModeration`, `scriptSafetyScan` |

---

## Provider Integrations

| Provider | Статус | Использование |
| --- | --- | --- |
| Google Gemini (P0) | Implemented | Chat, moderation, generation; primary in fallback chain |
| Anthropic Claude (P0) | Implemented | Chat, moderation, generation; second in fallback |
| OpenAI GPT (P1) | Implemented | Chat, moderation, generation; third in fallback |
| Deepgram | Implemented | STT (voice transcription) |
| Meshy (via Fal) | Implemented | 3D mesh generation for characters |
| Hunyuan3D (via Fal) | Implemented | Alternative 3D generation |
| ElevenLabs | Implemented | Audio/TTS generation |
| Suno | Implemented | Music generation |
| Fal | Implemented | Image generation + 3D pipeline hub |
| Apify | Implemented | Web scraping (links) |
| Algolia | Implemented | Search (multiple indices) |
| ModelsLab | Implemented | Image generation alternative |
| Replicate | Implemented | ML model hosting fallback |
| Open-source (Llama, Mistral) — P2 | Missing | Не интегрированы |

---

## Roblox Build Pipeline

| Компонент | Статус | Детали |
| --- | --- | --- |
| Worker HTTP server (`apps/worker-service`) | Implemented | Node HTTP server; `/build-roblox`, `/analyze-roblox` endpoints; auth via Bearer token |
| Lune binary build (`build_roblox.luau`) | Implemented | Reads JSON manifest → builds instance tree → `roblox.serializePlace()` / `serializeModel()` → binary .rbxl/.rbxm |
| Lune analysis (`analyze_roblox.luau`) | Implemented | Deserializes binary → counts instances, classes, rig info → JSON summary |
| Manifest generation (`robloxWorker.ts`) | Implemented | `buildRobloxManifest()` creates scene nodes, scripts, UI from LLM output |
| Functions → Worker wiring | Implemented | HTTP POST or CLI spawn; configured via `ROBLOX_WORKER_URL` / `ROBLOX_WORKER_COMMAND` |
| Docker container | Implemented | `node:20-bookworm-slim` + Lune v0.10.4; ready for Cloud Run |
| CFrame support | Partial | Luau reads `value.x/y/z` directly; TS emits `{ position: { x, y, z } }` — **schema mismatch** |
| Mesh/texture/audio in binary | Missing | Only basic Part/Script/UI instances; no MeshPart data, no texture assets, no audio assets in binary |
| optimize-mesh / auto-rig-r15 / export-character | Stub | Passthrough — returns input bytes unchanged with placeholder text |

---

## Сводка: критические пробелы

### Полностью отсутствует (Missing)

1. **Android-клиент** — ТЗ требует iOS + Android
2. **Главная лента** — нет табов Игры/Контент, нет баннеров, коллекций, trending
3. **Топы и рейтинги** — нет топ-авторов, Rising Stars, Staff Picks, Hall of Fame
4. **Настройки** — нет языка, уведомлений, привязки Roblox-аккаунта
5. **Weekly AI Challenges** — нет челленджей, голосования, призов
6. **Game Template Library** — нет библиотеки стартовых шаблонов
7. **Collaborative Creation** — нет совместной разработки
8. **QR-код и облачная синхронизация** — нет передачи между устройствами
9. **Шаринг** — нет deeplink, нет шаринга контента/чатов
10. **Дизлайки** — нет (только лайки)
11. **Vision AI модерация изображений** — нет
12. **Генерация текстур/декалей** — нет
13. **Генерация анимаций** — нет
14. **PNG-шаблоны classic clothing** — нет
15. **5 категорий контента** — Avatar Bodies & Heads, Furniture & Props, Items & Tools, Decals & Textures, Plugins

### Частично реализовано (ключевые пробелы)

1. **Сборка .rbxl** — функциональна, но только базовые Part/Script; нет мешей, текстур, аудио; CFrame schema mismatch
2. **Smart Interview** — full game interview/GDD branching реализован через deterministic prompt contract; отдельной hard state machine и `skipInterview` routing всё ещё нет
3. **Парсинг .rbxl/.rbxm** — только shallow structural analysis
4. **Ввод картинкой** — PhotosPicker dead wiring
5. **Социальная платформа** — каркас (лента, лайки, follow), но нет каталога с фильтрами, поиска, кураторских коллекций
6. **Бейджи** — типы есть, UI есть, но логика присвоения не реализована
7. **Chunk-based STT** — partial transcript placeholder
8. **Автоматическая эскалация модерации** — типы есть, автоматика нет
9. **3D mesh processing** — optimize/rig/export endpoints — passthrough stubs

---

## Main Files

- `apps/functions/src/index.ts` — главный API (маршруты, оркестрация)
- `apps/functions/src/providers.ts` — интеграции с AI-провайдерами
- `apps/functions/src/promptCatalog.ts` — каталог промптов
- `apps/functions/src/scriptSafety.ts` — анализ безопасности Luau
- `apps/functions/src/robloxWorker.ts` — взаимодействие с worker
- `apps/functions/src/config.ts` — конфигурация и секреты
- `apps/functions/src/types.ts` — типы (functions-level)
- `apps/worker-service/src/index.ts` — worker HTTP server
- `apps/worker-service/runtime/lune/build_roblox.luau` — сборка .rbxl/.rbxm
- `apps/worker-service/runtime/lune/analyze_roblox.luau` — анализ .rbxl/.rbxm
- `apps/backend/src/index.ts` — локальный dev backend (stubs)
- `apps/ios/AIGoldRoblox/App/AIGoldRobloxApp.swift` — точка входа iOS
- `apps/ios/AIGoldRoblox/Features/MainTabView.swift` — табы
- `apps/ios/AIGoldRoblox/Features/Chat/ChatView.swift` — чат
- `apps/ios/AIGoldRoblox/Features/Chat/ChatStore.swift` — состояние чата
- `apps/ios/AIGoldRoblox/Core/API/AIWorkspaceAPI.swift` — API клиент
- `apps/ios/AIGoldRoblox/Core/Auth/AuthService.swift` — аутентификация
- `apps/ios/AIGoldRoblox/Features/Generation/GenerationPreviewView.swift` — превью генерации
- `apps/ios/AIGoldRoblox/Features/Export/ExportView.swift` — экспорт
- `packages/shared/src/types.ts` — общие типы
- `packages/shared/src/constants.ts` — константы (жанры, категории)
