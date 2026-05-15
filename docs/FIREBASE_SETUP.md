# Firebase Setup Guide — для маркетинга

> **Для кого эта инструкция**: для человека без опыта разработки, который настраивает новый Firebase-проект перед выкладкой iOS-приложения в App Store. Всё делается руками через веб-консоли (Firebase / Apple Developer / Google Cloud). Код трогать не нужно — пункты, где нужна помощь разработчика, помечены `[DEV]`.
>
> **Итог**: к концу этого гайда у вас будет новый Firebase-проект, готовый принимать релизную сборку iOS-приложения.

---

## 0. Перед началом

### Что это вообще такое
Firebase — это платформа от Google, которая закрывает сразу несколько задач нашего приложения:
- **Authentication** — логин пользователей (Google, Apple, Email)
- **Firestore Database** — база данных, где хранятся чаты, посты, задачи генерации
- **Cloud Storage** — хранилище файлов (картинки, аудио, `.rbxm` артефакты)
- **Cloud Functions** — серверный код, который принимает запросы от iOS и обращается к OpenAI/Anthropic/и т.д.
- **Secret Manager** — безопасное хранилище API-ключей (OpenAI key, Anthropic key, ...)
- **Cloud Messaging (FCM)** — push-уведомления

### Что понадобится ДО старта
- [ ] Google-аккаунт с правами **Owner** на новый Firebase-проект (лучше корпоративный, не личный)
- [ ] Банковская карта (для тарифного плана **Blaze** — без него Cloud Functions не работают)
- [ ] Доступ к **Apple Developer Program** (роль Admin или Account Holder — нужен будет Team ID, bundle ID, создание Service ID и ключей)
- [ ] 19 API-ключей от внешних сервисов (OpenAI, Anthropic, Gemini, Algolia, Suno, ElevenLabs, Replicate, Fal, Deepgram, ModelsLab, Apify, Roblox Open Cloud) — подробный список и где их брать — в §7
- [ ] Контакт разработчика — на случай пунктов `[DEV]` (правки в коде/Xcode)

### Обозначения
- **[DEV]** — этот пункт выполняет разработчик, не маркетинг. Просто отметьте его в чеклисте и передайте разработчику.
- **[BLOCKER for DEV]** — задача, без которой нельзя выкладываться в стор. У разработчика должна быть оформлена отдельно.

---

## 1. Создание нового Firebase-проекта

1. Откройте https://console.firebase.google.com
2. Нажмите **Add project** (или **Create a project**)
3. Имя проекта: например `ai-roblox-prod` (или согласованное с командой). Firebase автоматически сгенерирует уникальный **Project ID** — запишите его, он потребуется разработчику
4. **Enable Google Analytics** — да (нажмите **Continue**). Выберите существующий Analytics account или создайте новый `Default Account for Firebase`
5. Нажмите **Create project**, подождите 30–60 секунд, нажмите **Continue**
6. В правом верхнем углу шестерёнка → **Project settings** → скопируйте поле **Project ID**

#### [DEV] — передать разработчику
- Новый **Project ID**
- Разработчик поменяет значение `projects.default` в файле `.firebaserc` на новый ID

---

## 2. Переход на тарифный план Blaze (обязательно)

> **Почему обязательно**: бесплатный план **Spark** не разрешает Cloud Functions делать исходящие запросы к сторонним API (OpenAI, Anthropic и т.д.), не поддерживает Secret Manager и scheduled functions. Без Blaze приложение работать не будет.

1. В Firebase Console в левом нижнем углу нажмите **Upgrade** (или иконка шестерёнки → **Usage and billing** → **Details & settings** → **Modify plan**)
2. Выберите **Blaze — Pay as you go**
3. Привяжите **Google Cloud Billing Account**:
   - Если биллинг-аккаунта ещё нет — **Create billing account** → ввести данные карты
   - Если есть — выбрать существующий
4. Подтвердите переход → появится подтверждение "Your project is now on the Blaze plan"

### Настройте budget alert (ОЧЕНЬ рекомендуется)
Чтобы не получить сюрприз в виде счёта на сотни долларов от неконтролируемой генерации:

1. Откройте https://console.cloud.google.com/billing
2. Выберите биллинг-аккаунт → слева **Budgets & alerts** → **Create budget**
3. Назовите: `AI Roblox Prod — monthly`
4. Amount: например **$200** (первый месяц, потом подстроите)
5. Alert thresholds: **50%**, **90%**, **100%**, **120%** (на 120% придёт письмо когда вы уже в перерасходе)
6. Email recipients: добавьте себя и CTO

---

## 3. Регистрация iOS-приложения в проекте

1. В Firebase Console на главной странице проекта нажмите иконку **iOS+** (кнопка **Add app → iOS**)
2. **Apple bundle ID** — спросите у разработчика. Это что-то вроде `com.company.aigoldroblox`. ⚠️ Для нового релиза в сторе он может отличаться от текущего
3. **App nickname** — например `AI Roblox iOS Prod`
4. **App Store ID** — если приложение уже создано в App Store Connect, скопируйте оттуда. Если ещё нет — оставьте пустым, заполните позже
5. Нажмите **Register app**
6. Нажмите **Download GoogleService-Info.plist** — скачается файл на компьютер
7. Нажмите **Next** → **Next** → **Next** → **Continue to console** (пропустите шаги установки SDK — в коде уже всё настроено)

#### [DEV] — передать разработчику
- Скачанный файл **`GoogleService-Info.plist`**
- Разработчик положит его по пути `apps/ios/AIGoldRoblox/Resources/GoogleService-Info.plist` (заменит существующий)
- Разработчик проверит, что `REVERSED_CLIENT_ID` из нового plist прописан в `apps/ios/AIGoldRoblox/App/Info.plist` в разделе **URL Types** (иначе Google Sign-In сломается)
- Разработчик обновит **Bundle Identifier** в Xcode project, если он отличается от текущего

---

## 4. Authentication — подключение методов входа

Приложение использует три способа логина. Надо включить все три.

Откройте в левой панели **Build → Authentication → Get started**.

### 4.1 Email/Password
1. Вкладка **Sign-in method**
2. Нажмите на строку **Email/Password** → переключатель **Enable** → **Save**

### 4.2 Google Sign-In
1. В той же вкладке **Sign-in method** → **Add new provider** → **Google**
2. Переключатель **Enable**
3. **Public-facing name for project** — название, которое увидят пользователи в окошке логина (например `AI Roblox`)
4. **Project support email** — выбрать ваш email из списка
5. **Save**

После сохранения провайдер создаст **Web client ID** и **Web client secret** — они автоматически попадают в `GoogleService-Info.plist`. Делать ничего не нужно.

### 4.3 Sign in with Apple
Это самый сложный метод. Делается в **двух** консолях: Apple Developer и Firebase.

#### Шаг 4.3.1 — в Apple Developer (https://developer.apple.com/account)
1. **Certificates, Identifiers & Profiles → Identifiers**
2. Найдите ваш App ID (совпадает с bundle ID) → кликните → во вкладке **Capabilities** найдите **Sign In with Apple** → поставьте галочку → **Save** → **Confirm**
3. Вернитесь в **Identifiers** → нажмите **+** → выберите **Services IDs** → **Continue**
4. **Description**: например `AI Roblox Sign In`
5. **Identifier**: reverse bundle id + `.signin`, например `com.company.aigoldroblox.signin` (это НЕ bundle ID — это отдельный идентификатор для OAuth-редиректа)
6. **Continue** → **Register**
7. Кликните на только что созданный Service ID → поставьте галочку **Sign In with Apple** → **Configure**
8. **Primary App ID** — выберите ваш App ID из шага 2
9. **Website URLs**:
   - **Domains and subdomains**: `<PROJECT_ID>.firebaseapp.com` (замените на ваш Project ID из §1)
   - **Return URLs**: `https://<PROJECT_ID>.firebaseapp.com/__/auth/handler`
10. **Save** → **Continue** → **Save**

#### Шаг 4.3.2 — создайте Key for Sign in with Apple
1. Там же в Apple Developer → **Keys → +**
2. **Key Name**: `Sign in with Apple Key — AI Roblox`
3. Поставьте галочку **Sign in with Apple** → **Configure** → выберите ваш Primary App ID → **Save**
4. **Continue** → **Register**
5. Нажмите **Download** — скачается файл `AuthKey_XXXXXXXXXX.p8`. ⚠️ **Скачать можно только один раз!** Сохраните в надёжное место
6. Запишите **Key ID** (10 символов в названии файла) и **Team ID** (виден справа вверху Apple Developer)

#### Шаг 4.3.3 — в Firebase Console
1. **Authentication → Sign-in method → Add new provider → Apple**
2. Переключатель **Enable**
3. **Services ID**: вставьте идентификатор из шага 4.3.1 (например `com.company.aigoldroblox.signin`)
4. **Apple Team ID**: вставьте Team ID из шага 4.3.2
5. **Key ID**: вставьте Key ID
6. **Private key**: откройте скачанный `.p8` файл в текстовом редакторе, скопируйте всё содержимое и вставьте в поле (включая строки `-----BEGIN PRIVATE KEY-----` и `-----END PRIVATE KEY-----`)
7. **Save**

### 4.4 Authorized domains
Вкладка **Settings → Authorized domains**. Должны быть:
- `localhost`
- `<PROJECT_ID>.firebaseapp.com`
- `<PROJECT_ID>.web.app`

Обычно они добавлены автоматически. Если какого-то нет — добавьте через **Add domain**.

---

## 5. Cloud Firestore — база данных

1. Левая панель → **Build → Firestore Database → Create database**
2. Выберите режим **Start in production mode** (НЕ test mode — это дыра в безопасности) → **Next**
3. **Cloud Firestore location**: `us-central1` (обязательно — совпадает с регионом Cloud Functions в коде)
4. **Enable**

Подождите 30 секунд — база создана.

#### [DEV] — разработчик сделает после §8
- `firebase deploy --only firestore:indexes` — зальёт индексы из [firestore.indexes.json](../firestore.indexes.json) (4 составных индекса для threads, challenges, submissions, socialPosts)

#### [BLOCKER for DEV] — файл `firestore.rules` ОТСУТСТВУЕТ в репозитории
Без rules-файла Firestore в production mode блокирует любые чтения/записи. Разработчик должен:
1. Написать `firestore.rules` (правила: авторизованные пользователи пишут только в свои треды/посты, публичные коллекции доступны на чтение всем залогиненным)
2. Добавить в `firebase.json` секцию `"firestore": { "rules": "firestore.rules", "indexes": "firestore.indexes.json" }`
3. Задеплоить: `firebase deploy --only firestore:rules`

**До этого момента приложение НЕ будет работать.**

---

## 6. Cloud Storage — хранилище файлов

1. Левая панель → **Build → Storage → Get started**
2. **Start in production mode** → **Next**
3. **Cloud Storage location**: выберите тот же регион, что и Firestore (`us-central1` или `nam5`)
4. **Done**

Имя bucket по умолчанию: `<PROJECT_ID>.firebasestorage.app` — запомните, пригодится для health-check.

#### [BLOCKER for DEV] — файл `storage.rules` ОТСУТСТВУЕТ в репозитории
Аналогично Firestore rules. Разработчик должен написать и задеплоить:
```
firebase deploy --only storage:rules
```

---

## 7. Secrets — загрузка 19 API-ключей

Cloud Functions обращаются к внешним сервисам (OpenAI, Anthropic, Algolia и т.д.). Ключи хранятся в **Google Cloud Secret Manager** — это более безопасно, чем `.env` файл.

### Где создавать секреты
Два способа:
- **Вариант A**: Firebase Console → Functions раздел (появляется после первого деплоя §8). Если Functions ещё не задеплоены — используйте вариант B
- **Вариант B (универсальный)**: https://console.cloud.google.com/security/secret-manager — выбрать проект вверху → **Create secret**

Для каждого секрета:
1. **Name** — точно как в таблице ниже (регистр важен)
2. **Secret value** — сам ключ
3. **Replication policy** — Automatic
4. **Create secret**

### Список 19 обязательных секретов

| # | Secret | Где взять | Последствия отсутствия |
|---|---|---|---|
| 1 | `OPENAI_API_KEY` | https://platform.openai.com/api-keys → **Create new secret key** | Не работает GPT-генерация (чат, smart interview) |
| 2 | `ANTHROPIC_API_KEY` | https://console.anthropic.com → **API Keys** → **Create Key** | Не работает Claude-генерация (fallback в коде) |
| 3 | `GEMINI_API_KEY` | https://aistudio.google.com/app/apikey → **Create API key** | Не работает Gemini (основной провайдер чата по умолчанию) |
| 4 | `MODELSLAB_API_KEY` | https://modelslab.com → Profile → API Key | Не генерируются некоторые 3D-ассеты |
| 5 | `APIFY_API_TOKEN` | https://console.apify.com/account/integrations → **API token** | Не работает парсинг данных / data pipeline |
| 6 | `ALGOLIA_APP_ID` | https://dashboard.algolia.com → **API Keys** → Application ID | Не работает поиск каталога контента |
| 7 | `ALGOLIA_SEARCH_API_KEY` | Там же → Search-Only API Key | Тоже поиск |
| 8 | `ALGOLIA_WRITE_API_KEY` | Там же → Write API Key (в разделе **All API Keys**, создать с правами addObject/deleteObject) | Не индексируются новые посты/шаблоны |
| 9 | `ALGOLIA_ADMIN_API_KEY` | Там же → Admin API Key | Админские операции с индексом |
| 10 | `ALGOLIA_USAGE_API_KEY` | Там же → Usage API Key | Метрики использования |
| 11 | `ALGOLIA_MONITORING_API_KEY` | Там же → Monitoring API Key | Мониторинг |
| 12 | `SUNO_API_KEY` | Suno API провайдер (например https://sunoapi.org) | Не генерируется музыка |
| 13 | `ELEVENLABS_API_KEY` | https://elevenlabs.io → Profile → **API Key** | Не генерируется озвучка голосом |
| 14 | `REPLICATE_API_TOKEN` | https://replicate.com/account/api-tokens | Не работают некоторые ML-модели (image-to-3D, и т.п.) |
| 15 | `FAL_API_KEY` | https://fal.ai/dashboard/keys | Не работают быстрые image-модели |
| 16 | `DEEPGRAM_API_KEY` | https://console.deepgram.com → **API Keys** → **Create a New API Key** | Не работает распознавание голоса (Voice-First UX сломан) |
| 17 | `ROBLOX_WORKER_TOKEN` | **Сгенерируйте сами** — любая случайная строка 32+ символов (можно через `openssl rand -hex 32` или онлайн random string generator). Тот же токен передайте разработчику для настройки worker-service | Worker-service не принимает задачи → не собираются `.rbxm`/`.rbxl` |
| 18 | `ROBLOX_OPEN_CLOUD_API_KEY` | https://create.roblox.com → **Creator Hub → Open Cloud → API Keys → Create API Key**. Permissions: Asset (Read+Write) и Place (Read+Write) | Не загружаются ассеты в Roblox (пользователь не получит `rbxassetid://`) |
| 19 | `ROBLOX_OAUTH_CLIENT_SECRET` | https://create.roblox.com → **Creator Hub → Open Cloud → OAuth 2.0 Apps → Create App** → поле **Client Secret** (показывается один раз!) | Не работает привязка Roblox-аккаунта в iOS |

### 7 не-секретных string-параметров (не Secret Manager!)
Их разработчик установит отдельно через CLI или `.env`-файл при деплое Functions. Маркетинг просто собирает **значения** и передаёт разработчику:

| Параметр | Значение |
|---|---|
| `ROBLOX_WORKER_URL` | URL Cloud Run воркер-сервиса (спросить у разработчика) |
| `ROBLOX_WORKER_COMMAND` | обычно `http` |
| `ROBLOX_WORKER_ARGS` | обычно пусто |
| `ROBLOX_CREATOR_ID` | ID создателя/группы на Roblox (число из URL профиля: `roblox.com/users/XXXXXXX/profile`) |
| `ROBLOX_OAUTH_CLIENT_ID` | Client ID из того же OAuth-приложения что и секрет #19 |
| `JOB_DISPATCH_MODE` | `embedded` или `worker` (спросить у разработчика) |
| `ALLOW_UNAUTHENTICATED_REQUESTS` | `false` для прода (⚠️ НИКОГДА не ставьте `true` в релизе!) |

---

## 8. Деплой Cloud Functions — [DEV]

Этот шаг целиком делает разработчик. Маркетинг просто сообщает:
> "Все 19 секретов залиты в Secret Manager, проект на Blaze, всё готово к деплою."

Разработчик выполнит (из корня репозитория):
```bash
firebase login
firebase use <NEW_PROJECT_ID>
npm install
firebase deploy --only functions
```

После деплоя в Firebase Console появятся **4 функции**:
- `api` — главный REST endpoint (обрабатывает чат, генерацию, челленджи, соцсеть, модерацию, голос)
- `weeklyChallenge` — scheduled (раз в неделю создаёт новый челлендж)
- `tallyChallengeVotes` — scheduled (подсчёт голосов)
- `runDailySimulation` — scheduled (имитация активности в социальной ленте)

### Проверка — health-check
В браузере откройте:
```
https://us-central1-<PROJECT_ID>.cloudfunctions.net/api/health
```
Ожидаемый ответ: HTTP 200 и JSON вроде `{"status":"ok"}`. Если 500 — смотрите Functions → Logs, скорее всего какой-то секрет не залит.

---

## 9. Push-уведомления (FCM + APNs)

### Шаг 9.1 — создайте APNs Authentication Key в Apple Developer
Если у вас уже есть APNs key для этого Team — можно переиспользовать. Иначе:

1. https://developer.apple.com/account → **Keys → +**
2. **Key Name**: `APNs Auth Key — AI Roblox`
3. Поставьте галочку **Apple Push Notifications service (APNs)** → **Configure** → оставьте "All Topics (Sandbox & Production)" → **Save**
4. **Continue → Register**
5. **Download** — скачается `AuthKey_YYYYYYYYYY.p8`. Сохраните
6. Запишите **Key ID** (10 символов в имени файла) и **Team ID** (справа сверху на сайте)

### Шаг 9.2 — загрузите ключ в Firebase
1. Firebase Console → шестерёнка → **Project settings → Cloud Messaging**
2. В разделе **Apple app configuration** найдите ваш iOS app
3. **APNs Authentication Key → Upload**
4. Загрузите `.p8` файл, введите Key ID и Team ID → **Upload**

#### [DEV]
- Разработчик проверит в iOS что `FirebaseMessaging` подключён (он уже в коде), что есть разрешение `aps-environment` в entitlements и вызывается `UIApplication.shared.registerForRemoteNotifications()`

---

## 10. Crashlytics / Analytics — опционально

> **Текущее состояние**: в iOS-коде ни Crashlytics, ни Analytics НЕ подключены. Это задача разработчика — если хотите включить, это **[DEV]**-работа.

Если решили подключать:
1. Firebase Console → **Build → Crashlytics → Get started** (в Console ничего не надо кроме включения продукта)
2. **[DEV]**: разработчик добавит Firebase Crashlytics SDK в iOS-проект, подключит dSYM upload script в Xcode Build Phases

**Analytics** — по умолчанию включён при создании проекта (см. §1). Для event-логирования тоже нужна работа разработчика.

---

## 11. App Check — сильно рекомендуется перед релизом

> **Зачем**: каждый вызов Cloud Functions тратит деньги на LLM-ключи. Без App Check любой может нагрузить ваш endpoint и слить бюджет. App Check проверяет, что запрос действительно пришёл из вашего iOS-приложения.

**Текущее состояние**: не настроено. Это **[DEV]**-задача.

Что делает маркетинг:
1. Firebase Console → **Build → App Check → Get started**
2. Выберите iOS app → **Register → App Attest (Apple)** → **Save**

Что делает разработчик:
- Добавляет App Check SDK в iOS
- Инициализирует `AppAttestProvider` в app startup
- В Cloud Functions включает проверку App Check tokens на endpoints

---

## 12. Финальный чеклист перед выкладкой в стор

Пройдитесь сверху вниз перед тем как нажать Submit в App Store Connect:

- [ ] **Firebase проект создан**, Project ID записан и передан разработчику
- [ ] **Blaze-план включён**, budget alerts настроены ($50/$100/$200)
- [ ] **iOS app зарегистрирован** в Firebase проекте
- [ ] **`GoogleService-Info.plist`** скачан и передан разработчику → [DEV] подменил в Xcode
- [ ] **`.firebaserc`** обновлён на новый Project ID — [DEV]
- [ ] **Authentication**: Email/Password, Google, Apple — все три Enabled
- [ ] **Apple Sign In**: Service ID создан, Key загружен в Firebase, Return URL прописан
- [ ] **Firestore** создан в `us-central1`
- [ ] **Firestore indexes** задеплоены — [DEV]
- [ ] **`firestore.rules`** написаны и задеплоены — [BLOCKER for DEV]
- [ ] **Storage** создан в том же регионе
- [ ] **`storage.rules`** написаны и задеплоены — [BLOCKER for DEV]
- [ ] **19 секретов** залиты в Secret Manager
- [ ] **7 string-параметров** настроены разработчиком — [DEV]
- [ ] **Cloud Functions** задеплоены (4 штуки) — [DEV]
- [ ] **Health-check** `/api/health` возвращает 200
- [ ] **APNs key** загружен в Firebase Cloud Messaging
- [ ] **(Опционально)** App Check настроен
- [ ] **Bundle ID** в Xcode обновлён если поменялся — [DEV]
- [ ] **Smoke-test на iOS билде** от разработчика:
  - [ ] Логин через Email — success
  - [ ] Логин через Google — success
  - [ ] Логин через Apple — success
  - [ ] Создать чат, отправить сообщение — AI отвечает
  - [ ] В Firestore Console видно документ в `threads/{id}/messages`
  - [ ] Запустить генерацию (например генерация иконки) — артефакт появляется в Storage
  - [ ] В Firestore видно документ в `generationJobs`
  - [ ] Push-уведомление на реальном девайсе — приходит

---

## 13. Troubleshooting — топ-10 частых ошибок

| Симптом | Причина | Что делать |
|---|---|---|
| `firebase deploy` падает с "Project must be on the Blaze plan" | Забыли перейти на Blaze | §2 — апгрейд плана |
| iOS-приложение получает `PERMISSION_DENIED` в любых запросах к Firestore | `firestore.rules` не задеплоены или слишком строгие | [DEV] — написать/проверить rules, задеплоить |
| Apple Sign In возвращает `invalid_client` | В Service ID не добавлен правильный Return URL `https://<PROJECT_ID>.firebaseapp.com/__/auth/handler` | §4.3.1 шаг 9 — проверить Website URLs |
| Google Sign In валится с `redirect_uri_mismatch` | `REVERSED_CLIENT_ID` в iOS `Info.plist` → URL Types не соответствует новому `GoogleService-Info.plist` | [DEV] — обновить URL Types в Xcode |
| Push-уведомления не приходят | Неверный Key ID/Team ID или key истёк | §9.2 — перезалить `.p8` с правильными ID |
| Cloud Functions логи: `Secret X is required` | Секрет с таким именем не создан в Secret Manager | §7 — создать недостающий секрет, перезадеплоить Functions |
| Budget alert пришёл после релиза | Кто-то абьюзит endpoint или обычный трафик | Проверить Functions → Logs, увидеть какой LLM-ключ активнее всего расходуется. Рассмотреть §11 App Check |
| Логин работает, но приложение сразу разлогинивается | `GoogleService-Info.plist` не от того Firebase-проекта | [DEV] — проверить что plist из нового проекта, а не из старого |
| Storage возвращает `403` при загрузке файлов | `storage.rules` не задеплоены | [BLOCKER for DEV] |
| Health-check `/api/health` возвращает 500 | Как правило, не хватает секрета или string-параметра | Functions → Logs → смотрим точное сообщение |

---

## 14. Если что-то пошло не так

- **Маркетинг не понимает шаг** — задайте вопрос в чате команды с отсылкой на номер раздела (`§4.3.2`), разработчик подключится
- **Разработчик нашёл баг в инструкции** — отредактируйте этот документ и добавьте запись в `cursor/changelog-NNN.md` по правилам [CLAUDE.md](../CLAUDE.md)
- **Нужен гайд на английском для зарубежного подрядчика** — переведите по разделам, структура та же

---

**Версия документа**: 1.0 (2026-04-17, сессия 090)
**Ответственный**: маркетинг + разработчик (смотри `[DEV]` пометки)
