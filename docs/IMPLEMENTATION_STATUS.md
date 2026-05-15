# Implementation Status — AI Voice to Games & Mods for Roblox

**Дата ревизии:** 2026-04-06
**Основа:** ТЗ "AI Roblox NEW Gold.md"

Обозначения:
- [x] — Реализовано
- [~] — Частично реализовано
- [ ] — Не реализовано

---

## 1. Концепция продукта

- [x] Мобильное приложение iOS (SwiftUI)
- [ ] Android-приложение
- [x] Направление 1 — Генерация целых игр (.rbxl)
- [x] Направление 2 — Генерация отдельного контента (ассеты, скрипты, UI, анимации и т.д.)

---

## 2. AI Smart Interview — система умного интервью

### 2.1–2.2 Два режима работы
- [x] Quick Generate — быстрая генерация при полном описании
- [x] Smart Interview — серия вопросов при неполном запросе
- [x] AI сам определяет какой режим использовать

### 2.3 Smart Interview для игр
- [x] Вопросы по жанру и механикам
- [x] Вопросы по персонажам/контенту
- [x] Вопросы по масштабу
- [x] Вопросы по визуальному стилю
- [x] Вопросы по монетизации
- [x] Вопросы по дополнительным системам
- [x] Финальное подтверждение (GDD)

### 2.4 Smart Interview для контента
- [x] Интервью для оружия (4-ходовое: тип → визуал → боевые свойства → brief)
- [x] Интервью для скриптов (3-турнирное: категория → архитектура → генерация)
- [x] Интервью для анимаций
- [x] Интервью для персонажей
- [x] Интервью для UI
- [x] Интервью для аудио

### 2.5 Адаптивность интервью
- [x] Группировка вопросов (1–2 за сообщение)
- [x] Предложения по умолчанию (рекомендации AI)
- [x] Quick Reply кнопки (QuickReplyChips.swift)
- [~] Кнопка «Реши за меня» — AI выбирает автоматически (частично через quick replies)
- [x] Ветвление вопросов по контексту
- [x] Голосовые ответы (Deepgram STT)

### 2.6 Game Design Document (GDD)
- [x] Формирование GDD после сбора ответов
- [x] Отображение GDD в чате (GDDCard.swift)
- [x] Возможность внести правки перед генерацией

### 2.7 Smart Interview для редактирования существующего
- [ ] Загрузка .rbxl и анализ структуры
- [ ] Предложения улучшений
- [ ] План изменений перед применением

### 2.8 Уровни экспертизы
- [ ] Автоопределение уровня пользователя
- [ ] Адаптация сложности вопросов (новичок / продвинутый / разработчик)
- [ ] Выбор уровня в настройках

### 2.9 AI отвечает на вопросы
- [x] Вопросы о разработке Roblox
- [x] Консультации по монетизации и трендам
- [x] Дебаг и помощь с кодом
- [x] Идеи и вдохновение

### 2.10 Контекст и память в рамках чата
- [x] Полная история чата
- [x] Продолжение разработки в рамках одного чата
- [x] Один чат = один проект

### 2.11 Технические требования
- [x] Quick Reply кнопки (2–6 вариантов)
- [x] Поддержка голоса для вопросов и ответов
- [~] Мультиязычность (Deepgram поддерживает, но UI пока EN)
- [ ] Кнопка «Начать сначала» — сброс интервью

---

## 3. Категории контента — генерация

### 3.1 Игры (Experiences) — генерация целиком
- [x] Базовая генерация .rbxl
- [x] Генерация скриптов на Luau
- [x] Генерация UI/GUI
- [x] Генерация систем (DataStore, Leaderboard, GamePasses)
- [~] Terrain и 3D-окружение (шаблонное, без AI-terrain)
- [ ] Звуки и эффекты в составе игры

Поддерживаемые жанры (через шаблоны и LLM):
- [x] Obby
- [x] Tycoon
- [x] Simulator
- [x] RPG
- [x] Horror
- [x] Roleplay / Town
- [x] PvP Arena
- [x] Tower Defense
- [x] Racing
- [x] Parkour
- [x] Story Game
- [x] Mini-games Hub
- [x] Survival
- [x] Fighting
- [x] Custom (любой жанр по описанию)

### 3.2 Контент — отдельные ассеты

| Категория | Статус | Детали |
|-----------|--------|--------|
| Characters / NPCs | [x] | character_3d pipeline: concept → mesh → optimize → R15 rig → .rbxm |
| Clothing & Outfits | [x] | clothing_3d pipeline + clothingCompositor.ts |
| Accessories | [~] | Частично через character pipeline, нет отдельного accessory flow |
| Avatar Bodies & Heads | [ ] | Не реализовано |
| Weapons | [x] | Полный pipeline: interview → concept → mesh → scripts → Tool .rbxm |
| Vehicles | [ ] | Не реализовано |
| Buildings & Structures | [ ] | Не реализовано как отдельный pipeline |
| Furniture & Props | [~] | Phase 1 code-side: Auto / Fast Parts / AI Mesh choice, fast Parts RBXM, AI mesh + typed fallback; нужна fresh Studio QA |
| Maps & Environments | [~] | Через генерацию игр, не как отдельный ассет |
| Items & Tools | [~] | Частично через weapon pipeline |
| Pets | [ ] | Не реализовано как отдельный pipeline |
| Scripts / Systems | [x] | LLM Lua генерация + smart interview |
| UI / GUI | [x] | JSON → Roblox UI instances + WebView preview + 7 типов + 5 палитр |
| Game Passes & Products | [~] | Генерируются как часть игры, не отдельно |
| Animations | [x] | JSON keyframes → FBX (Blender) → .rbxm + GIF preview |
| Audio & Music | [x] | Suno + ElevenLabs интеграции |
| Particles & Effects | [ ] | Не реализовано как отдельный pipeline |
| Decals & Textures | [x] | Полный pipeline: generate image → build decal binary → .rbxm |
| Plugins | [ ] | Не реализовано |

### 3.3 Загрузка и редактирование существующего контента
- [ ] Загрузка .rbxl — анализ и модификация
- [ ] Загрузка .rbxm — разбор и редактирование модели
- [~] Загрузка .lua скриптов — анализ и фикс (есть intent fix/analyze в чате)
- [~] Ввод картинкой как референс (поддержка в чате, но не полный pipeline)
- [~] Ввод ссылкой (Apify интеграция есть, но pipeline не полный)

---

## 4. Функциональные модули

### 4.1 AI Chat Engine
- [x] Мультичат-система с историей
- [x] Автоименование чатов
- [ ] Ручное переименование чатов
- [ ] Архивирование чатов
- [ ] Полнотекстовый поиск по чатам
- [ ] Группировка чатов (по дате, типу, проекту)
- [ ] Шаринг чата

Выбор AI-модели:
- [x] OpenAI GPT
- [x] Anthropic Claude
- [x] Google Gemini
- [ ] Open-source (Llama, Mistral)

### 4.2 Способы ввода
- [x] Голосовой ввод (Deepgram STT, кнопка микрофона MicButton.swift)
- [x] Текстовый ввод (многострочное поле)
- [~] Ввод картинкой (базовая поддержка)
- [~] Ввод ссылкой (Apify для парсинга)
- [ ] Комбинированный ввод (голос + ссылка + картинка в одном сообщении)

Голосовой ввод — детали:
- [x] STT через Deepgram
- [x] Валидация аудио (длительность ≥ 0.5s, размер > 1KB)
- [x] iOS 17+ API для разрешений
- [x] Очистка temp файлов
- [~] Мультиязычность (Deepgram поддерживает, UI на EN)
- [ ] До 2–3 минут непрерывной речи (не тестировалось)
- [ ] Редактирование транскрипции перед отправкой (транскрипт вставляется в поле)

### 4.3 Pipeline генерации игры
- [x] Шаг 1 — описание идеи (голос/текст)
- [x] Шаг 2 — Smart Interview (уточнение)
- [x] Шаг 3 — Game Design Document
- [x] Шаг 4 — подтверждение / правки
- [x] Шаг 5 — LLM генерация (скрипты, UI)
- [x] Шаг 6 — сборка .rbxl (Lune)
- [~] Шаг 7 — превью (скриншоты, список систем)
- [x] Шаг 8 — экспорт .rbxl

### 4.4 Pipeline генерации контента
- [x] Шаг 1 — описание контента
- [x] Шаг 2 — Smart Interview
- [x] Шаг 3 — AI генерация ассета
- [x] Шаг 4 — превью (3D viewer, code preview, WebView UI, GIF animation)
- [x] Шаг 5 — экспорт (.rbxm / .lua / .fbx / .png)

### 4.5 Итеративная разработка
- [x] Итеративная доработка через чат
- [x] Контекст проекта сохраняется в чате

### 4.6 Редактирование существующего контента
- [ ] Загрузка .rbxl/.rbxm/.lua → парсинг → показ структуры
- [ ] Описание изменений → AI вносит правки
- [ ] Превью diff → подтверждение → экспорт

---

## 5. Социальная платформа

### 5.1 Профиль автора
- [x] Аватар, никнейм (ProfileView.swift)
- [ ] Био, ссылка на Roblox-профиль
- [ ] Портфолио — все опубликованные работы
- [ ] Статистика (скачивания, лайки, рейтинг)
- [ ] Бейджи (Top Creator, Game Developer и т.д.)
- [ ] Подписка (follow)

### 5.2 Публикация контента
- [x] Публикация сгенерированного контента (PublishView.swift)
- [x] Название, описание, категория, теги
- [~] Скриншоты/превью (hero image)
- [ ] Changelog при обновлении
- [ ] Типизация (игра / модель / скрипт / UI / аксессуар)
- [ ] Обновление с сохранением статистики

### 5.3 Оценки и взаимодействие
- [x] Лайки
- [x] Древовидные комментарии (CommentTreeView.swift)
- [x] Счётчик скачиваний
- [ ] Дизлайки
- [ ] Избранное
- [ ] Шаринг (deeplink)
- [ ] Репорты

### 5.4 Каталог и навигация
- [x] Главная лента (CatalogView.swift)
- [x] Популярное / новое
- [ ] Рекомендации
- [~] Категории (базовая фильтрация)
- [ ] Полные фильтры (жанр, рейтинг, дата, популярность)
- [ ] Поиск по названию, тегам, автору
- [ ] Кураторские коллекции

### 5.5 Топы и рейтинги
- [x] TopChartsView.swift (базовая реализация)
- [ ] Топ авторов
- [ ] Rising Stars
- [ ] Staff Picks
- [ ] Hall of Fame
- [ ] Разделение: топ игр / топ контента

---

## 6. Система модерации

### 6.1 AI-модерация промтов
- [x] Роут модерации в backend (moderation.ts)
- [x] scriptSafety.ts — валидация скриптов
- [ ] Фильтрация нецензурной лексики на всех языках
- [ ] Фильтрация jailbreak-промтов
- [ ] Roblox-специфичная модерация (IP, gambling, exploits)

### 6.2 Модерация публикаций
- [~] Базовая модерация через backend route
- [ ] Vision AI для скриншотов
- [ ] Проверка скриптов на вредоносный код (обфускация, exploit-паттерны)
- [ ] Ручная модерация

### 6.3 Модерация комментариев
- [ ] AI-фильтр перед публикацией

### 6.4 Действия при нарушениях
- [x] Бан-система (Ban/ feature module в iOS)
- [ ] Предупреждения
- [ ] Апелляция через support

---

## 7. Экспорт и интеграция с Roblox

### 7.1 Экспорт игр (.rbxl)
- [x] Скачивание .rbxl
- [ ] Пошаговая инструкция для публикации
- [ ] QR-код для передачи на десктоп

### 7.2 Экспорт контента (.rbxm)
- [x] Скачивание .rbxm
- [x] Скачивание .lua
- [x] Скачивание .fbx (анимации)

### 7.3 Экспорт UGC-контента
- [~] .fbx для layered clothing (через pipeline)
- [ ] PNG-шаблоны для classic clothing
- [ ] Инструкция для загрузки на Creator Hub

### 7.4 Дополнительные способы экспорта
- [x] Сохранение в Files / Downloads
- [x] ShareLink в iOS (ExportView.swift)
- [ ] QR-код
- [ ] Облачная синхронизация
- [~] Dropbox интеграция (DropboxService.swift — реализовано)

### 7.5 Форматы файлов
- [x] .rbxl — Roblox Place File
- [x] .rbxm — Roblox Model File
- [x] .rbxmx — Roblox XML Model (UI)
- [x] .lua — Luau скрипты
- [x] .fbx — 3D-модели и анимации
- [x] .gif — превью анимаций
- [x] PNG/JPEG — текстуры, decals
- [ ] .ogg / .mp3 — аудио для Roblox

### Roblox OAuth
- [x] Roblox OAuth интеграция (robloxOAuth.ts + RobloxAuthService.swift)
- [x] Загрузка анимаций в Roblox (rbxassetid://)

---

## 8. Дополнительные фичи

| Фича | Статус | Комментарий |
|-------|--------|-------------|
| 8.1 AI Game Remixer | [ ] | Не реализовано |
| 8.2 AI Script Doctor | [~] | Частично — есть fix/analyze intent в чате |
| 8.3 AI Game Analyst | [ ] | Не реализовано |
| 8.4 AI UGC Designer | [~] | Частично через clothing/accessory pipeline |
| 8.5 AI Obby Level Generator | [~] | Через генерацию игр жанра Obby |
| 8.6 AI NPC Dialogue Writer | [~] | Через script generation |
| 8.7 Weekly AI Challenges | [~] | Challenges/ feature module в iOS (базовый UI) |
| 8.8 AI Monetization Advisor | [ ] | Не реализовано как отдельная фича |
| 8.9 Game Template Library | [x] | gameTemplates.ts + seedTemplates.ts |
| 8.10 Collaborative Creation | [ ] | Не реализовано |
| 8.11 AI Asset Pack Creator | [ ] | Не реализовано |
| 8.12 Roblox Trends Tracker | [ ] | Не реализовано |
| AI Game Cloner (Remix Mode) | [ ] | Не реализовано |
| Voice-to-Fix (AI Luau Doctor) | [~] | Частично — голосовой ввод + fix intent |
| Trend-Catcher UGC Generator | [ ] | Не реализовано |

---

## 9. UX/UI — ключевые экраны

| Экран | Статус | Файл |
|-------|--------|------|
| Онбординг | [x] | Onboarding/ feature module |
| Главная лента | [x] | HomeView.swift, CatalogView.swift |
| AI Chat | [x] | ChatView.swift, ChatStore.swift |
| Результат генерации (превью) | [x] | GenerationPreviewView.swift |
| 3D Model Viewer | [x] | GenerationModelPreview.swift |
| UI/GUI Preview (WebView) | [x] | WebUIPreviewView.swift |
| Animation GIF Preview | [x] | AnimatedGifView в ChatStore |
| Code Preview | [x] | В GenerationPreviewView |
| Экспорт | [x] | ExportView.swift |
| Каталог / Feed | [x] | CatalogView.swift |
| Детальная страница контента | [x] | С hero gallery, download files, author card |
| Профиль автора | [x] | ProfileView.swift |
| Топы | [x] | TopChartsView.swift |
| Настройки | [x] | SettingsView.swift |
| Публикация | [x] | PublishView.swift |
| 3D Editor | [x] | EditorContentView.swift, PartByPartView.swift |
| Clothing Preview | [x] | ClothingPreview3DView.swift |
| Auth | [x] | Auth/ feature module |
| Бан-экран | [x] | Ban/ feature module |
| Library | [x] | Library/ feature module |
| Codes | [x] | Codes/ feature module |
| Packs | [x] | Packs/ feature module |
| Avatars / Avatar Editor | [x] | Avatars/, AvatarEditor/ feature modules |

---

## 10. Инфраструктура и бэкенд

### Серверная архитектура
- [x] Firebase Cloud Functions (генерация, оркестрация)
- [x] Express API (auth, chat, content, export, moderation, social, files)
- [x] Cloud Run Worker Service (Blender, Lune, mesh processing)
- [x] Firebase Firestore (БД)
- [x] Firebase Cloud Storage (файлы)
- [x] Firebase Auth
- [x] JWT аутентификация

### AI-провайдеры
- [x] OpenAI
- [x] Anthropic Claude
- [x] Google Gemini
- [x] Deepgram (STT)
- [x] Suno (аудио)
- [x] ElevenLabs (TTS)
- [x] Replicate
- [x] FAL
- [x] Meshy (3D)
- [x] HunYuan3D (3D)
- [x] ModelLab
- [x] Apify (web scraping)
- [x] Algolia (search)

### Worker Service
- [x] Blender auto-rig R15 (auto_rig_r15.py)
- [x] Blender keyframes → FBX (keyframes_to_fbx.py)
- [x] Blender animation GIF preview (render_animation_preview.py)
- [x] Blender GLB → FBX (glb_to_fbx.py)
- [x] Blender mesh optimization (optimize_mesh.py)
- [x] Lune .rbxm/.rbxl assembly (build_roblox.luau)
- [x] Lune animation build (build_animation.luau)
- [x] Lune decal build (build_decal.luau)
- [x] Lune script build (build_script.luau)
- [x] Lune R15 character export (export_r15_character.luau)
- [x] Docker deployment на Cloud Run
- [x] Xvfb для headless Blender rendering

---

## Сводка

| Раздел ТЗ | Реализовано | Частично | Не начато |
|------------|-------------|----------|-----------|
| 2. Smart Interview | 18 | 3 | 4 |
| 3. Категории контента | 15 | 6 | 8 |
| 4. Функциональные модули | 17 | 3 | 10 |
| 5. Соцплатформа | 6 | 2 | 13 |
| 6. Модерация | 3 | 1 | 5 |
| 7. Экспорт | 11 | 2 | 4 |
| 8. Доп. фичи | 1 | 5 | 9 |
| 9. UX/UI экраны | 23 | 0 | 0 |
| 10. Инфраструктура | 26 | 0 | 0 |
| **ИТОГО** | **120** | **22** | **53** |

**Общий прогресс: ~62% реализовано, ~11% частично, ~27% не начато**
