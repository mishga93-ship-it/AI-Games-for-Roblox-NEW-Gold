# AIGoldRoblox (iOS)

SwiftUI app — AI Voice to Games & Mods for Roblox. Voice First + Neon Studio design.

## Open in Xcode

1. Open **`AIGoldRoblox.xcodeproj`** in Xcode (в репозитории нет `.xcworkspace`).
2. Target **AIGoldRoblox** → **Signing & Capabilities**: включите **Automatically manage signing** и выберите **свою** команду (Team). Иначе на физический iPhone приложение не установится.
3. Подключите iPhone по USB, разблокируйте телефон, при запросе нажмите **Trust** на устройстве и доверьте компьютеру в macOS.
4. Вверху Xcode выберите схему **AIGoldRoblox** и ваше устройство, затем **Run** (⌘R).

### Физический iPhone и API

По умолчанию приложение теперь смотрит на задеплоенный HTTP endpoint функции:

`https://api-z4yzt6dhjq-uc.a.run.app/`

Для локального тестирования через эмуляторы используйте:

`http://127.0.0.1:5001/roblox-ai-generator-v2-2-ios/us-central1/api/`

### Если не собирается или не ставится на устройство

- Ошибки подписи: смените **Bundle Identifier** на уникальный (например `com.вашеимя.aigoldroblox`) в настройках таргета.
- «Untrusted Developer»: на iPhone — **Настройки → Основные → VPN и управление устройством** → доверьте сертификат разработчика.

### В списке destination только «My Mac», iPhone не виден

Так бывает, если таргет настроен как **macOS**, а не как **iOS**.

1. Откройте именно **`apps/ios/AIGoldRoblox.xcodeproj`** из этого репозитория (не другую копию проекта).
2. Слева нажмите синюю иконку проекта → в центре выберите таргет **AIGoldRoblox**.
3. Вкладка **General**: блок **Supported Destinations** (или **Minimum Deployments**) — включите **iPhone** (и при необходимости **iPad**), **отключите Mac**, если приложение должно идти только на телефон.
4. Альтернатива: вкладка **Build Settings** → найдите **Supported Platforms** → должно быть **`iOS`** (или `iphoneos iphonesimulator`), не macOS.
5. Перезапустите Xcode, снова откройте проект. Подключите iPhone по кабелю, разблокируйте его. В панели сверху (рядом с ▶ Run) откройте список **destination** — должен появиться ваш iPhone. Если нет: **Window → Devices and Simulators** — убедитесь, что устройство без жёлтых предупреждений (Trust, обновление iOS и т.д.).

## Firebase setup

В проекте уже подготовлена безопасная инициализация Firebase для SwiftUI и авторизация через **Firebase Auth** с fallback на текущий backend. Чтобы включить Firebase полностью:

1. В Firebase Console откройте проект `roblox-ai-generator-v2-2-ios`.
2. Добавьте **iOS app** с bundle id **`com.build.play.win`**. Если в Xcode поменяете bundle id, в Firebase нужно зарегистрировать именно новый id.
3. Скачайте **`GoogleService-Info.plist`** и добавьте файл в корень группы `AIGoldRoblox` в Xcode, включив target **AIGoldRoblox**.
4. В Xcode откройте **File -> Add Packages...** и добавьте репозиторий:

```text
https://github.com/firebase/firebase-ios-sdk.git
```

5. Подключите пакеты **`FirebaseAuth`** и **`FirebaseCore`**.
6. В Firebase Console откройте **Authentication -> Sign-in method** и включите **Email/Password**.
7. Соберите приложение заново. После этого экран `AuthView` будет использовать Firebase Auth.

Если `GoogleService-Info.plist` или Firebase SDK ещё не добавлены, приложение не должно падать: авторизация останется на временном backend-fallback.

## Create Xcode project (if missing)

If `AIGoldRoblox.xcodeproj` is not present:

1. In Xcode: File → New → Project → App (iOS, SwiftUI, Swift).
2. Product Name: **AIGoldRoblox**, Organization Identifier: your bundle id.
3. Save in `apps/ios/` (so the project is next to the `AIGoldRoblox` source folder).
4. Delete the default SwiftUI view Xcode created.
5. File → Add Files to "AIGoldRoblox" → select the `AIGoldRoblox` folder (Create groups, Copy items if needed, Add to target AIGoldRoblox).
6. Ensure `AIGoldRobloxApp.swift` is set as the app entry point (no second `@main`).
7. Set minimum deployment target iOS 16+.

## Backend / Functions

AI chat and generation now go through Firebase Functions with Firebase Auth ID tokens.

For local Firebase emulators:

```bash
cd ../..
npm install
npm run functions:emulators
```

Set the in-app Base URL to:

`http://127.0.0.1:5001/roblox-ai-generator-v2-2-ios/us-central1/api/`

For deployed cloud functions keep the default production URL.

## Structure

- **App/** — `@main`, RootView.
- **Core/** — AppState, API, Auth, Extensions.
- **DesignSystem/** — Colors, Typography, Components (PrimaryButton, MicButton, QuickReplyChips, GDDCard).
- **Features/** — Onboarding, Auth, **Home** (grid: Codes, Avatars, Avatar Editor, Clothes Editor, Packs, Items), Chat, MainTabView, Generation, Export, Catalog, Profile, Settings.

## Design variants

See **[DESIGN.md](DESIGN.md)** for the four design options (Neon Studio, Light Clarity, Card Social, Voice First) and which one is currently applied (hybrid Voice First + Neon Studio).
