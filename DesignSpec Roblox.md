# Design Manifest: Washi Ink

> Дизайн вдохновлён японским искусством бумаги (和紙, washi) и каллиграфии (書道, shodō). Интерфейс — как пространство мастерской каллиграфа: тёплые текстуры рисовой бумаги, решительные мазки туши, мерцание золотой фольги на акцентах. Каждый экран — свиток, который разворачивается перед пользователем, открывая слои контента. UI ощущается тактильно, как прикосновение к ручной бумаге — тёплый, весомый, намеренный. Создание Roblox-контента становится актом ремесленного мастерства, а не утилитарной операцией. Light-тема — студия при дневном свете с васи-бумагой и чернильными акцентами. Dark-тема — мастерская при свечах: глубокий индиго-фон с хурмой и лунным золотом.

**Mood:** artisan, meditative, precise, warm, crafted, intentional, zen
**Category:** Games / Creative Tools
**Min iOS:** 18.0
**Framework:** SwiftUI

---

## 0. App Identity

### 0.1 Название приложения

Новое название приложения (ренейминг): **Kami**

Происхождение: 紙 (kami) — «бумага» по-японски, основа оригами и каллиграфии. Также созвучно с 神 (kami) — «дух/божество», что символизирует силу создания. Название ОБЯЗАТЕЛЬНО используется одинаково на ВСЕХ экранах: splash, навбар, настройки, about, onboarding — всегда **Kami**, без вариаций, сокращений или альтернативных написаний.

### 0.2 App Icon

> "A premium app icon featuring a single elegant origami crane (paper bird) rendered in vermillion red (#E85D3A) with subtle gold leaf (#C9A84C) accent on folded edges, placed on a warm washi-paper cream (#F5F0E8) to deep indigo (#1B2838) diagonal gradient background. Style: minimalist Japanese craft aesthetic with clean geometric folds. The crane should feel precise, warm, and artisanal — instantly recognizable at small sizes. No text."

- **Цвета фона**: diagonal gradient от #F5F0E8 (warm cream, верхний левый) к #1B2838 (deep indigo, нижний правый)
- **Центральный элемент**: стилизованный оригами-журавль (鶴) — символ создания и мастерства
- **Стиль**: минималистичный, геометрические грани оригами, тёплые тона с золотыми рёбрами
- **Технические требования**: 1024x1024 px, без прозрачности, без закруглённых углов, высокая детализация

### 0.3 Глобальный словарь иконок

| Действие / Контекст | SF Symbol | Отображаемое название |
|---|---|---|
| Назад | `chevron.left` | Back |
| Закрыть | `xmark` | Close |
| Настройки | `gearshape` | Settings |
| Поделиться | `square.and.arrow.up` | Share |
| Удалить | `trash` | Delete |
| Сохранить | `arrow.down.to.line` | Save |
| Редактировать | `pencil` | Edit |
| Фильтры | `line.3.horizontal.decrease` | Filter |
| Экспорт | `arrow.up.forward.square` | Export |
| Избранное (неактивное) | `heart` | Favorite |
| Избранное (активное) | `heart.fill` | Favorite |
| Поиск | `magnifyingglass` | Search |
| Создать / Добавить | `plus` | Create |
| Отменить (undo) | `arrow.uturn.backward` | Undo |
| Повторить (redo) | `arrow.uturn.forward` | Redo |
| Информация | `info.circle` | Info |
| Копировать | `doc.on.doc` | Copy |
| Скачать | `arrow.down.circle` | Download |
| Обновить | `arrow.clockwise` | Refresh |
| Голосовой ввод | `mic` | Voice |
| Голосовой ввод (стоп) | `stop.fill` | Stop |
| Отправить | `paperplane` | Send |
| Прикрепить файл | `paperclip` | Attach |
| Home (tab) | `house` | Home |
| Forge / Create (tab) | `sparkles` | Forge |
| Library (tab) | `archivebox` | Library |
| Community (tab) | `globe` | Community |
| Profile (tab) | `person.crop.circle` | Profile |
| Лайк | `heart` | Like |
| Комментарий | `bubble.right` | Comment |
| Подписаться | `person.badge.plus` | Follow |
| Закладка | `bookmark` | Bookmark |
| Игра | `gamecontroller` | Game |
| Персонаж / NPC | `figure.stand` | Character |
| Оружие | `shield` | Weapon |
| Анимация | `figure.run` | Animation |
| Скрипт / Код | `chevron.left.forwardslash.chevron.right` | Script |
| UI / GUI | `rectangle.3.group` | Interface |
| Текстура / Декаль | `paintpalette` | Texture |
| Одежда | `tshirt` | Clothing |
| Камера | `camera` | Camera |
| Фото / Изображение | `photo` | Photo |
| Уведомления | `bell` | Alerts |
| Ещё / Меню | `ellipsis` | More |
| Микрофон (запись) | `waveform` | Recording |
| Логаут | `rectangle.portrait.and.arrow.right` | Log Out |

---

## 1. Color System

**ВАЖНО:** Каждый токен определяется в двух вариантах — Light и Dark.

### 1.1 Backgrounds

| Token | lightHex | darkHex | Назначение |
|---|---|---|---|
| `bgPrimary` | `#F5F0E8` | `#0D1520` | Основной фон экранов (тёплый васи-крем / полуночный индиго) |
| `bgSecondary` | `#EDE6D8` | `#15202E` | Фон вложенных секций, группировка контента |
| `bgTertiary` | `#E3DAC9` | `#1D2B3A` | Фон третьего уровня, вложенные панели |

### 1.2 Surfaces

| Token | lightHex | darkHex | Opacity (L/D) | Назначение |
|---|---|---|---|---|
| `surfaceDefault` | `#FFFCF5` | `#1A2535` | 1.0 / 1.0 | Основная поверхность карточек (рисовая бумага / тёмный васи) |
| `surfaceElevated` | `#FFFFFF` | `#223344` | 0.92 / 1.0 | Приподнятые элементы, dropdown, popover |
| `surfaceOverlay` | `#1B2838` | `#000000` | 0.35 / 0.50 | Оверлей для модальных окон, dimming |

### 1.3 Text

| Token | lightHex | darkHex | Назначение |
|---|---|---|---|
| `textPrimary` | `#1B2838` | `#E8DFD0` | Основной текст (глубокий индиго тушь / состаренная бумага) |
| `textSecondary` | `#5A6B7D` | `#A0947F` | Вспомогательный текст, подписи, метаданные |
| `textTertiary` | `#8E9BAA` | `#6E6355` | Disabled, placeholder, третичные подсказки |

### 1.4 Accents

| Token | lightHex | darkHex | Назначение |
|---|---|---|---|
| `accentPrimary` | `#E85D3A` | `#FF6B40` | Главный акцент — вермильон/хурма (朱色). CTA, активные элементы |
| `accentSecondary` | `#2E6B9E` | `#4A9ED6` | Вторичный акцент — индиго-синий (藍色). Ссылки, info |
| `accentTertiary` | `#C9A84C` | `#E8D5A3` | Третичный акцент — золотая фольга (金箔). Premium, badge, highlight |

### 1.5 Semantic

| Token | lightHex | darkHex | Назначение |
|---|---|---|---|
| `success` | `#4A8B5C` | `#5CA86E` | Успешное действие (бамбуковый зелёный) |
| `warning` | `#D4A030` | `#E8B840` | Предупреждение (шафрановый) |
| `error` | `#C44D3F` | `#E05A4C` | Ошибка (киноварь) |
| `info` | `#4A7FB5` | `#5C94CC` | Информация (утренняя слава) |

### 1.6 Named Gradients

Каждый градиент в двух вариантах (light + dark):

```swift
// MARK: - gradientPrimary (CTA кнопки)
// Light:
LinearGradient(
    colors: [Color(hex: "E85D3A"), Color(hex: "D44520")],
    startPoint: .leading, endPoint: .trailing
)
// Dark:
LinearGradient(
    colors: [Color(hex: "FF6B40"), Color(hex: "E84830")],
    startPoint: .leading, endPoint: .trailing
)

// MARK: - gradientAmbient (фоновая глубина)
// Light:
LinearGradient(
    colors: [Color(hex: "F5F0E8"), Color(hex: "EDE6D8")],
    startPoint: .top, endPoint: .bottom
)
// Dark:
LinearGradient(
    colors: [Color(hex: "0D1520"), Color(hex: "15202E")],
    startPoint: .top, endPoint: .bottom
)

// MARK: - gradientSurface (карточки)
// Light:
LinearGradient(
    colors: [Color(hex: "FFFCF5"), Color(hex: "F5F0E8")],
    startPoint: .top, endPoint: .bottom
)
// Dark:
LinearGradient(
    colors: [Color(hex: "1A2535"), Color(hex: "15202E")],
    startPoint: .top, endPoint: .bottom
)

// MARK: - gradientGlow (свечение активных элементов)
// Light:
RadialGradient(
    colors: [Color(hex: "C9A84C").opacity(0.4), Color(hex: "C9A84C").opacity(0)],
    center: .center, startRadius: 0, endRadius: 80
)
// Dark:
RadialGradient(
    colors: [Color(hex: "E8D5A3").opacity(0.35), Color(hex: "E8D5A3").opacity(0)],
    center: .center, startRadius: 0, endRadius: 80
)
```

Адаптивный хелпер:

```swift
struct AdaptiveGradientView<Light: ShapeStyle, Dark: ShapeStyle>: View {
    @Environment(\.colorScheme) var colorScheme
    let light: Light
    let dark: Dark

    var body: some View {
        Rectangle()
            .fill(colorScheme == .dark ? AnyShapeStyle(dark) : AnyShapeStyle(light))
    }
}
```

### 1.7 MeshGradient (iOS 18)

**Light вариант** — тёплые чернильно-бумажные тона для hero-секций:

```swift
struct WashiMeshLight: View {
    var body: some View {
        MeshGradient(
            width: 3, height: 3,
            points: [
                .init(0.0, 0.0), .init(0.5, 0.0), .init(1.0, 0.0),
                .init(0.0, 0.5), .init(0.5, 0.5), .init(1.0, 0.5),
                .init(0.0, 1.0), .init(0.5, 1.0), .init(1.0, 1.0)
            ],
            colors: [
                Color(hex: "F5F0E8"), Color(hex: "EDE6D8"), Color(hex: "F5F0E8"),
                Color(hex: "EDE6D8"), Color(hex: "E85D3A").opacity(0.15), Color(hex: "C9A84C").opacity(0.2),
                Color(hex: "F5F0E8"), Color(hex: "C9A84C").opacity(0.1), Color(hex: "EDE6D8")
            ]
        )
    }
}
```

**Dark вариант** — глубокий индиго с хурмой и лунным золотом:

```swift
struct WashiMeshDark: View {
    var body: some View {
        MeshGradient(
            width: 3, height: 3,
            points: [
                .init(0.0, 0.0), .init(0.5, 0.0), .init(1.0, 0.0),
                .init(0.0, 0.5), .init(0.5, 0.5), .init(1.0, 0.5),
                .init(0.0, 1.0), .init(0.5, 1.0), .init(1.0, 1.0)
            ],
            colors: [
                Color(hex: "0D1520"), Color(hex: "15202E"), Color(hex: "0D1520"),
                Color(hex: "15202E"), Color(hex: "FF6B40").opacity(0.12), Color(hex: "E8D5A3").opacity(0.15),
                Color(hex: "0D1520"), Color(hex: "E8D5A3").opacity(0.08), Color(hex: "15202E")
            ]
        )
    }
}
```

**Обёртка-View:**

```swift
struct WashiMeshGradient: View {
    @Environment(\.colorScheme) var colorScheme

    var body: some View {
        Group {
            if colorScheme == .dark {
                WashiMeshDark()
            } else {
                WashiMeshLight()
            }
        }
        .ignoresSafeArea()
    }
}
```

### 1.8 Adaptive Color Helper

```swift
import SwiftUI

// MARK: - 1. Color(hex:) Extension

extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 6:
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8:
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (255, 0, 0, 0)
        }
        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue: Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}

// MARK: - 2. AdaptiveColor helper

func adaptiveColor(light: String, dark: String) -> Color {
    Color(UIColor { traitCollection in
        traitCollection.userInterfaceStyle == .dark
            ? UIColor(Color(hex: dark))
            : UIColor(Color(hex: light))
    })
}

// MARK: - 3. AppColors — ВСЕ токены

struct AppColors {
    // Backgrounds
    static let bgPrimary = adaptiveColor(light: "F5F0E8", dark: "0D1520")
    static let bgSecondary = adaptiveColor(light: "EDE6D8", dark: "15202E")
    static let bgTertiary = adaptiveColor(light: "E3DAC9", dark: "1D2B3A")

    // Surfaces
    static let surfaceDefault = adaptiveColor(light: "FFFCF5", dark: "1A2535")
    static let surfaceElevated = adaptiveColor(light: "FFFFFF", dark: "223344")
    static let surfaceOverlay = Color(UIColor { t in
        t.userInterfaceStyle == .dark
            ? UIColor(Color(hex: "000000").opacity(0.5))
            : UIColor(Color(hex: "1B2838").opacity(0.35))
    })

    // Text
    static let textPrimary = adaptiveColor(light: "1B2838", dark: "E8DFD0")
    static let textSecondary = adaptiveColor(light: "5A6B7D", dark: "A0947F")
    static let textTertiary = adaptiveColor(light: "8E9BAA", dark: "6E6355")

    // Accents
    static let accentPrimary = adaptiveColor(light: "E85D3A", dark: "FF6B40")
    static let accentSecondary = adaptiveColor(light: "2E6B9E", dark: "4A9ED6")
    static let accentTertiary = adaptiveColor(light: "C9A84C", dark: "E8D5A3")

    // Semantic
    static let success = adaptiveColor(light: "4A8B5C", dark: "5CA86E")
    static let warning = adaptiveColor(light: "D4A030", dark: "E8B840")
    static let error = adaptiveColor(light: "C44D3F", dark: "E05A4C")
    static let info = adaptiveColor(light: "4A7FB5", dark: "5C94CC")
}
```

---

## 2. Typography

| Token | Size (pt) | Weight | Design | Назначение |
|---|---|---|---|---|
| `displayLarge` | 34 | `.bold` | `.serif` | Hero-заголовки экранов, splash title |
| `displayMedium` | 28 | `.bold` | `.serif` | Заголовки основных секций |
| `titleLarge` | 22 | `.semibold` | `.default` | Заголовки карточек, панелей |
| `titleMedium` | 18 | `.semibold` | `.default` | Заголовки подсекций |
| `titleSmall` | 16 | `.semibold` | `.default` | Section headers, category titles |
| `bodyLarge` | 17 | `.regular` | `.default` | Основной текст, описания |
| `bodyMedium` | 15 | `.regular` | `.default` | Вторичный текст, параграфы |
| `bodySmall` | 13 | `.regular` | `.default` | Мелкий текст, footnotes |
| `labelLarge` | 15 | `.medium` | `.default` | Кнопки, активные label |
| `labelMedium` | 13 | `.medium` | `.default` | Теги, badge, chip text |
| `labelSmall` | 11 | `.medium` | `.default` | Микро-подписи, timestamp |
| `mono` | 13 | `.regular` | `.monospaced` | Код, технические значения |

```swift
struct AppTypography {
    static let displayLarge = Font.system(size: 34, weight: .bold, design: .serif)
    static let displayMedium = Font.system(size: 28, weight: .bold, design: .serif)
    static let titleLarge = Font.system(size: 22, weight: .semibold)
    static let titleMedium = Font.system(size: 18, weight: .semibold)
    static let titleSmall = Font.system(size: 16, weight: .semibold)
    static let bodyLarge = Font.system(size: 17)
    static let bodyMedium = Font.system(size: 15)
    static let bodySmall = Font.system(size: 13)
    static let labelLarge = Font.system(size: 15, weight: .medium)
    static let labelMedium = Font.system(size: 13, weight: .medium)
    static let labelSmall = Font.system(size: 11, weight: .medium)
    static let mono = Font.system(size: 13, design: .monospaced)
}
```

---

## 3. Spacing

| Token | Value (pt) | Назначение |
|---|---|---|
| `xxxs` | 2 | Микро-отступ (между иконкой и числом) |
| `xxs` | 4 | Минимальный (между элементами inline-группы) |
| `xs` | 8 | Малый (padding внутри badge, между chip'ами) |
| `sm` | 12 | Средне-малый (padding внутри компактных карточек) |
| `md` | 16 | Базовый (padding экрана от краёв, между элементами) |
| `lg` | 24 | Большой (между секциями внутри карточки) |
| `xl` | 32 | Крупный (между секциями экрана) |
| `xxl` | 48 | Массивный (hero-зона верхний padding) |
| `xxxl` | 64 | Максимальный (отступ splash/onboarding) |

**Стандартные паддинги:**
- Экран (горизонтальный): `md` (16pt)
- Карточка (внутренний): `sm` (12pt) — `md` (16pt)
- Панель / Sheet: `md` (16pt) — `lg` (24pt)
- Между секциями: `xl` (32pt)
- Между элементами в секции: `sm` (12pt)

```swift
struct AppSpacing {
    static let xxxs: CGFloat = 2
    static let xxs: CGFloat = 4
    static let xs: CGFloat = 8
    static let sm: CGFloat = 12
    static let md: CGFloat = 16
    static let lg: CGFloat = 24
    static let xl: CGFloat = 32
    static let xxl: CGFloat = 48
    static let xxxl: CGFloat = 64
}
```

---

## 4. Corner Radius

| Token | Value (pt) | Назначение |
|---|---|---|
| `radiusXs` | 4 | Мини-элементы (inline badge, code snippet) |
| `radiusSm` | 8 | Мелкие элементы (tag, chip, toggle) |
| `radiusMd` | 12 | Кнопки, input field, compact card |
| `radiusLg` | 16 | Основные карточки, preview images |
| `radiusXl` | 24 | Модальные панели, hero-images |
| `radiusFull` | 9999 | Capsule (pill button, avatar circle, tab indicator) |

```swift
struct AppRadius {
    static let xs: CGFloat = 4
    static let sm: CGFloat = 8
    static let md: CGFloat = 12
    static let lg: CGFloat = 16
    static let xl: CGFloat = 24
    static let full: CGFloat = 9999
}
```

---

## 5. Shadows and Elevation

4 конфигурации в двух вариантах (light: тёплые тени чернильного тона, dark: мягкое свечение золота/хурмы):

```swift
struct AppShadows {
    // shadowSubtle — карточки, поверхности
    static func subtle(_ scheme: ColorScheme) -> some ViewModifier {
        ShadowModifier(
            color: scheme == .dark
                ? Color(hex: "E8D5A3").opacity(0.06)
                : Color(hex: "1B2838").opacity(0.08),
            radius: 4, x: 0, y: 2
        )
    }

    // shadowMedium — приподнятые элементы, floating buttons
    static func medium(_ scheme: ColorScheme) -> some ViewModifier {
        ShadowModifier(
            color: scheme == .dark
                ? Color(hex: "E8D5A3").opacity(0.10)
                : Color(hex: "1B2838").opacity(0.12),
            radius: 8, x: 0, y: 4
        )
    }

    // shadowPronounced — модальные окна, dropdown
    static func pronounced(_ scheme: ColorScheme) -> some ViewModifier {
        ShadowModifier(
            color: scheme == .dark
                ? Color(hex: "000000").opacity(0.30)
                : Color(hex: "1B2838").opacity(0.18),
            radius: 16, x: 0, y: 8
        )
    }

    // glowAccent — активные элементы, CTA hover
    static func glowAccent(_ scheme: ColorScheme) -> some ViewModifier {
        ShadowModifier(
            color: scheme == .dark
                ? Color(hex: "FF6B40").opacity(0.25)
                : Color(hex: "E85D3A").opacity(0.20),
            radius: 12, x: 0, y: 0
        )
    }
}

struct ShadowModifier: ViewModifier {
    let color: Color
    let radius: CGFloat
    let x: CGFloat
    let y: CGFloat

    func body(content: Content) -> some View {
        content.shadow(color: color, radius: radius, x: x, y: y)
    }
}
```

---

## 6. Animation System

### 6.1 Duration Scale

| Token | Value | Назначение |
|---|---|---|
| `instant` | 0.1s | Micro-feedback (tap highlight, icon swap) |
| `fast` | 0.2s | Quick transitions (toggle, chip select) |
| `normal` | 0.35s | Standard transitions (page, card expand) |
| `slow` | 0.5s | Emphasis (sheet present, scroll snap) |
| `dramatic` | 0.8s | Hero animations (unfold, ink spread) |

### 6.2 Spring Configurations

```swift
struct AppSprings {
    /// Быстрый отклик, минимальный overshoot — кнопки, toggles
    static let snappy = Animation.spring(response: 0.3, dampingFraction: 0.75)

    /// Плавный и элегантный — навигация, переходы экранов
    static let smooth = Animation.spring(response: 0.5, dampingFraction: 0.85)

    /// Заметный bounce — раскрытие карточек, accordion
    static let bouncy = Animation.spring(response: 0.4, dampingFraction: 0.6)

    /// Медленный и спокойный — hero-анимации, фоновые эффекты
    static let gentle = Animation.spring(response: 0.7, dampingFraction: 0.9)
}
```

### 6.3 Named Transitions

```swift
struct AppTransitions {
    /// Появление элемента — "разворачивание свитка" справа
    static let appear = AnyTransition
        .asymmetric(
            insertion: .move(edge: .trailing).combined(with: .opacity),
            removal: .move(edge: .leading).combined(with: .opacity)
        )

    /// Исчезновение — "сворачивание" влево
    static let disappear = AnyTransition
        .move(edge: .leading)
        .combined(with: .opacity)

    /// Переключение контента — cross-dissolve с масштабом
    static let switchContent = AnyTransition
        .opacity
        .combined(with: .scale(scale: 0.95))

    /// Панель снизу — "лист бумаги падает сверху"
    static let panel = AnyTransition
        .asymmetric(
            insertion: .move(edge: .bottom).combined(with: .opacity),
            removal: .move(edge: .bottom).combined(with: .opacity)
        )
}
```

### 6.4 iOS 18 Обязательные анимации

```swift
// contentTransition — для всех динамических чисел
Text("\(count)")
    .contentTransition(.numericText())

// symbolEffect — bounce при нажатии
Image(systemName: "heart.fill")
    .symbolEffect(.bounce, value: isFavorited)

// symbolEffect — pulse для ожидания
Image(systemName: "waveform")
    .symbolEffect(.pulse)

// sensoryFeedback — тактильный отклик при выборе
Toggle("Option", isOn: $value)
    .sensoryFeedback(.selection, trigger: value)

// sensoryFeedback — impact при CTA
Button("Create") { tapCount += 1 }
    .sensoryFeedback(.impact(weight: .medium), trigger: tapCount)
```

---

## 7. Icon System

### 7.1 Размеры и вес по контексту

| Контекст | Size (pt) | Weight | Примечание |
|---|---|---|---|
| Toolbar | 20 | `.medium` | Верхняя панель навигации |
| Tab bar | 24 | `.regular` | Нижняя навигация |
| Card | 18 | `.regular` | Иконки внутри карточек |
| Badge | 12 | `.semibold` | Внутри badge/pill |
| Hero | 36 | `.light` | Крупные декоративные иконки |
| Inline | 16 | `.regular` | Рядом с текстом, в строке |

**Правило стилизации:**
- Активные/интерактивные иконки: `.foregroundStyle(AppColors.accentPrimary)` или градиент через `.foregroundStyle(gradientPrimary)`
- Неактивные иконки: `.foregroundStyle(AppColors.textTertiary)`
- Все интерактивные иконки ОБЯЗАНЫ иметь `.symbolEffect(.bounce, value: trigger)` при нажатии

### 7.2 Глобальный словарь иконок (обязательная таблица)

Полная таблица — см. секцию **0.3**. Та же таблица является единственным источником истины для ВСЕХ экранов. Одно действие = одна иконка + одно название. Разночтения между экранами ЗАПРЕЩЕНЫ.

---

## 8. Component Catalog

### 8.1 ManifestPrimaryButton

Градиентная CTA кнопка вермильон — основной призыв к действию.

```swift
struct ManifestPrimaryButton: View {
    let title: String
    let action: () -> Void
    @State private var tapCount = 0
    @Environment(\.colorScheme) var colorScheme

    var body: some View {
        Button {
            tapCount += 1
            action()
        } label: {
            Text(title)
                .font(AppTypography.labelLarge)
                .foregroundStyle(.white)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(
                    colorScheme == .dark
                        ? LinearGradient(colors: [Color(hex: "FF6B40"), Color(hex: "E84830")], startPoint: .leading, endPoint: .trailing)
                        : LinearGradient(colors: [Color(hex: "E85D3A"), Color(hex: "D44520")], startPoint: .leading, endPoint: .trailing)
                )
                .clipShape(RoundedRectangle(cornerRadius: AppRadius.md))
        }
        .sensoryFeedback(.impact(weight: .medium), trigger: tapCount)
    }
}
```

### 8.2 ManifestSecondaryButton

Полупрозрачная кнопка с чернильной обводкой.

```swift
struct ManifestSecondaryButton: View {
    let title: String
    let action: () -> Void
    @State private var tapCount = 0

    var body: some View {
        Button {
            tapCount += 1
            action()
        } label: {
            Text(title)
                .font(AppTypography.labelLarge)
                .foregroundStyle(AppColors.accentPrimary)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(AppColors.accentPrimary.opacity(0.08))
                .clipShape(RoundedRectangle(cornerRadius: AppRadius.md))
                .overlay(
                    RoundedRectangle(cornerRadius: AppRadius.md)
                        .stroke(AppColors.accentPrimary.opacity(0.3), lineWidth: 1)
                )
        }
        .sensoryFeedback(.selection, trigger: tapCount)
    }
}
```

### 8.3 ManifestGhostButton

Текстовая кнопка без фона — для третичных действий.

```swift
struct ManifestGhostButton: View {
    let title: String
    let icon: String?
    let action: () -> Void
    @State private var tapCount = 0

    init(title: String, icon: String? = nil, action: @escaping () -> Void) {
        self.title = title
        self.icon = icon
        self.action = action
    }

    var body: some View {
        Button {
            tapCount += 1
            action()
        } label: {
            HStack(spacing: AppSpacing.xxs) {
                if let icon {
                    Image(systemName: icon)
                        .symbolEffect(.bounce, value: tapCount)
                }
                Text(title)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .font(AppTypography.labelMedium)
            .foregroundStyle(AppColors.accentSecondary)
            .padding(.horizontal, AppSpacing.sm)
            .padding(.vertical, AppSpacing.xs)
        }
        .sensoryFeedback(.selection, trigger: tapCount)
    }
}
```

### 8.4 ManifestCard

Карточка «лист бумаги» с surface-фоном, тонкой обводкой и тёплой тенью.

```swift
struct ManifestCard<Content: View>: View {
    let content: () -> Content
    @Environment(\.colorScheme) var colorScheme

    init(@ViewBuilder content: @escaping () -> Content) {
        self.content = content
    }

    var body: some View {
        content()
            .padding(AppSpacing.md)
            .background(AppColors.surfaceDefault)
            .clipShape(RoundedRectangle(cornerRadius: AppRadius.lg))
            .overlay(
                RoundedRectangle(cornerRadius: AppRadius.lg)
                    .stroke(AppColors.bgTertiary.opacity(0.5), lineWidth: 0.5)
            )
            .modifier(AppShadows.subtle(colorScheme))
    }
}
```

### 8.5 ManifestSlider

Кастомный слайдер с иконкой, градиентным треком, светящимся thumb, contentTransition на значении.

```swift
struct ManifestSlider: View {
    let icon: String
    let label: String
    @Binding var value: Double
    let range: ClosedRange<Double>
    @Environment(\.colorScheme) var colorScheme
    @State private var displayValue: Int = 0

    var body: some View {
        VStack(alignment: .leading, spacing: AppSpacing.xs) {
            HStack {
                Image(systemName: icon)
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(AppColors.accentPrimary)
                Text(label)
                    .font(AppTypography.labelMedium)
                    .foregroundStyle(AppColors.textPrimary)
                    .lineLimit(1)
                Spacer()
                Text("\(displayValue)")
                    .font(AppTypography.mono)
                    .foregroundStyle(AppColors.accentTertiary)
                    .contentTransition(.numericText())
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    // Track background
                    Capsule()
                        .fill(AppColors.bgTertiary)
                        .frame(height: 6)
                    // Filled track
                    Capsule()
                        .fill(
                            colorScheme == .dark
                                ? LinearGradient(colors: [Color(hex: "FF6B40"), Color(hex: "E8D5A3")], startPoint: .leading, endPoint: .trailing)
                                : LinearGradient(colors: [Color(hex: "E85D3A"), Color(hex: "C9A84C")], startPoint: .leading, endPoint: .trailing)
                        )
                        .frame(width: max(0, geo.size.width * progress), height: 6)
                    // Thumb
                    Circle()
                        .fill(AppColors.surfaceElevated)
                        .frame(width: 22, height: 22)
                        .shadow(color: AppColors.accentPrimary.opacity(0.3), radius: 6)
                        .offset(x: max(0, geo.size.width * progress - 11))
                        .gesture(
                            DragGesture(minimumDistance: 0)
                                .onChanged { drag in
                                    let pct = min(max(0, drag.location.x / geo.size.width), 1)
                                    value = range.lowerBound + Double(pct) * (range.upperBound - range.lowerBound)
                                    withAnimation(.snappy) { displayValue = Int(value) }
                                }
                        )
                }
            }
            .frame(height: 22)
        }
        .sensoryFeedback(.selection, trigger: displayValue)
        .onAppear { displayValue = Int(value) }
    }

    private var progress: CGFloat {
        let span = range.upperBound - range.lowerBound
        guard span > 0 else { return 0 }
        return CGFloat((value - range.lowerBound) / span)
    }
}
```

### 8.6 ManifestSegmentedControl

Табы-капсулы с градиентным выделением и sensoryFeedback.

```swift
struct ManifestSegmentedControl: View {
    let items: [String]
    @Binding var selected: Int
    @Environment(\.colorScheme) var colorScheme
    @Namespace private var ns

    var body: some View {
        HStack(spacing: AppSpacing.xxs) {
            ForEach(Array(items.enumerated()), id: \.offset) { index, item in
                Button {
                    withAnimation(AppSprings.snappy) { selected = index }
                } label: {
                    Text(item)
                        .font(AppTypography.labelMedium)
                        .foregroundStyle(selected == index ? .white : AppColors.textSecondary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                        .padding(.horizontal, AppSpacing.sm)
                        .padding(.vertical, AppSpacing.xs)
                        .background {
                            if selected == index {
                                Capsule()
                                    .fill(
                                        colorScheme == .dark
                                            ? LinearGradient(colors: [Color(hex: "FF6B40"), Color(hex: "E84830")], startPoint: .leading, endPoint: .trailing)
                                            : LinearGradient(colors: [Color(hex: "E85D3A"), Color(hex: "D44520")], startPoint: .leading, endPoint: .trailing)
                                    )
                                    .matchedGeometryEffect(id: "seg", in: ns)
                            }
                        }
                }
            }
        }
        .padding(AppSpacing.xxxs)
        .background(AppColors.bgSecondary)
        .clipShape(Capsule())
        .sensoryFeedback(.selection, trigger: selected)
    }
}
```

### 8.7 ManifestToolbarButton

Кнопка тулбара с symbolEffect и scale-анимацией.

```swift
struct ManifestToolbarButton: View {
    let icon: String
    let label: String
    let action: () -> Void
    @State private var tapCount = 0

    var body: some View {
        Button {
            tapCount += 1
            action()
        } label: {
            VStack(spacing: AppSpacing.xxxs) {
                Image(systemName: icon)
                    .font(.system(size: 20, weight: .medium))
                    .symbolEffect(.bounce, value: tapCount)
                Text(label)
                    .font(AppTypography.labelSmall)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .foregroundStyle(AppColors.textPrimary)
            .frame(minWidth: 44, minHeight: 44)
        }
        .sensoryFeedback(.selection, trigger: tapCount)
    }
}
```

### 8.8 ManifestBadge

Бейдж/тег в трёх вариантах: accent, subtle, semantic.

```swift
struct ManifestBadge: View {
    enum Style { case accent, subtle, semantic(Color) }

    let text: String
    let style: Style

    var body: some View {
        Text(text)
            .font(AppTypography.labelSmall)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            .padding(.horizontal, AppSpacing.xs)
            .padding(.vertical, AppSpacing.xxxs + 2)
            .foregroundStyle(foregroundColor)
            .background(backgroundColor)
            .clipShape(Capsule())
    }

    private var foregroundColor: Color {
        switch style {
        case .accent: return .white
        case .subtle: return AppColors.textSecondary
        case .semantic(let c): return c
        }
    }

    private var backgroundColor: Color {
        switch style {
        case .accent: return AppColors.accentPrimary
        case .subtle: return AppColors.bgTertiary
        case .semantic(let c): return c.opacity(0.12)
        }
    }
}
```

### 8.9 ManifestSheetHeader

Заголовок панели с индикатором и кнопкой закрытия.

```swift
struct ManifestSheetHeader: View {
    let title: String
    let onClose: () -> Void
    @State private var closeTap = 0

    var body: some View {
        VStack(spacing: AppSpacing.sm) {
            // Drag indicator — "чернильная капля"
            Capsule()
                .fill(AppColors.textTertiary.opacity(0.4))
                .frame(width: 36, height: 4)
                .padding(.top, AppSpacing.xs)

            HStack {
                Text(title)
                    .font(AppTypography.titleMedium)
                    .foregroundStyle(AppColors.textPrimary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                Spacer()
                Button {
                    closeTap += 1
                    onClose()
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(AppColors.textSecondary)
                        .frame(width: 30, height: 30)
                        .background(AppColors.bgTertiary)
                        .clipShape(Circle())
                        .symbolEffect(.bounce, value: closeTap)
                }
                .sensoryFeedback(.selection, trigger: closeTap)
            }
            .padding(.horizontal, AppSpacing.md)
        }
    }
}
```

### 8.10 ManifestEmptyState

Пустое состояние с symbolEffect(.pulse) и CTA.

```swift
struct ManifestEmptyState: View {
    let icon: String
    let title: String
    let subtitle: String
    let actionTitle: String?
    let action: (() -> Void)?

    init(icon: String, title: String, subtitle: String, actionTitle: String? = nil, action: (() -> Void)? = nil) {
        self.icon = icon
        self.title = title
        self.subtitle = subtitle
        self.actionTitle = actionTitle
        self.action = action
    }

    var body: some View {
        VStack(spacing: AppSpacing.md) {
            Image(systemName: icon)
                .font(.system(size: 48, weight: .light))
                .foregroundStyle(AppColors.accentTertiary)
                .symbolEffect(.pulse)

            Text(title)
                .font(AppTypography.titleMedium)
                .foregroundStyle(AppColors.textPrimary)
                .lineLimit(2)
                .minimumScaleFactor(0.8)
                .multilineTextAlignment(.center)

            Text(subtitle)
                .font(AppTypography.bodyMedium)
                .foregroundStyle(AppColors.textSecondary)
                .lineLimit(3)
                .minimumScaleFactor(0.8)
                .multilineTextAlignment(.center)

            if let actionTitle, let action {
                ManifestPrimaryButton(title: actionTitle, action: action)
                    .frame(maxWidth: 220)
            }
        }
        .padding(AppSpacing.xl)
    }
}
```

---

### Concept-Specific компоненты (уникальные для Washi Ink):

### 8.11 OriCreaseCard

Карточка с эффектом «складки оригами» — диагональный загиб угла, создающий иллюзию сложенной бумаги. Использует кастомный Path вместо RoundedRectangle.

```swift
struct OriCreaseCard<Content: View>: View {
    let creaseSize: CGFloat
    let content: () -> Content
    @Environment(\.colorScheme) var colorScheme

    init(creaseSize: CGFloat = 24, @ViewBuilder content: @escaping () -> Content) {
        self.creaseSize = creaseSize
        self.content = content
    }

    var body: some View {
        content()
            .padding(AppSpacing.md)
            .background(
                ZStack {
                    // Основная форма — прямоугольник с "отрезанным" верхним правым углом
                    CreasedPaperShape(creaseSize: creaseSize)
                        .fill(AppColors.surfaceDefault)
                    // Линия складки
                    CreasedPaperShape(creaseSize: creaseSize)
                        .stroke(AppColors.bgTertiary.opacity(0.5), lineWidth: 0.5)
                    // Треугольник-загиб (fold)
                    FoldTriangle(creaseSize: creaseSize)
                        .fill(AppColors.bgSecondary)
                    FoldTriangle(creaseSize: creaseSize)
                        .stroke(AppColors.bgTertiary.opacity(0.5), lineWidth: 0.5)
                }
            )
            .modifier(AppShadows.subtle(colorScheme))
    }
}

struct CreasedPaperShape: Shape {
    let creaseSize: CGFloat
    func path(in rect: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: 0, y: AppRadius.lg))
        p.addQuadCurve(to: CGPoint(x: AppRadius.lg, y: 0), control: .zero)
        p.addLine(to: CGPoint(x: rect.maxX - creaseSize, y: 0))
        p.addLine(to: CGPoint(x: rect.maxX, y: creaseSize))
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - AppRadius.lg))
        p.addQuadCurve(to: CGPoint(x: rect.maxX - AppRadius.lg, y: rect.maxY), control: CGPoint(x: rect.maxX, y: rect.maxY))
        p.addLine(to: CGPoint(x: AppRadius.lg, y: rect.maxY))
        p.addQuadCurve(to: CGPoint(x: 0, y: rect.maxY - AppRadius.lg), control: CGPoint(x: 0, y: rect.maxY))
        p.closeSubpath()
        return p
    }
}

struct FoldTriangle: Shape {
    let creaseSize: CGFloat
    func path(in rect: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: rect.maxX - creaseSize, y: 0))
        p.addLine(to: CGPoint(x: rect.maxX - creaseSize, y: creaseSize))
        p.addLine(to: CGPoint(x: rect.maxX, y: creaseSize))
        p.closeSubpath()
        return p
    }
}
```

### 8.12 InkBrushDivider

Разделитель секций в виде мазка кисти (筆). Органическая форма через Bézier-кривые — НЕ прямая линия.

```swift
struct InkBrushDivider: View {
    var thickness: CGFloat = 3
    var color: Color = AppColors.accentPrimary

    var body: some View {
        InkBrushStroke()
            .fill(color.opacity(0.6))
            .frame(height: thickness * 4)
            .padding(.horizontal, AppSpacing.md)
    }
}

struct InkBrushStroke: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        let midY = rect.midY
        // Начинаем тонко, утолщаемся к центру, снова утончаемся
        p.move(to: CGPoint(x: 0, y: midY))
        p.addCurve(
            to: CGPoint(x: rect.width * 0.35, y: midY - rect.height * 0.4),
            control1: CGPoint(x: rect.width * 0.08, y: midY - rect.height * 0.1),
            control2: CGPoint(x: rect.width * 0.2, y: midY - rect.height * 0.45)
        )
        p.addCurve(
            to: CGPoint(x: rect.width * 0.7, y: midY + rect.height * 0.1),
            control1: CGPoint(x: rect.width * 0.5, y: midY - rect.height * 0.3),
            control2: CGPoint(x: rect.width * 0.6, y: midY + rect.height * 0.2)
        )
        p.addCurve(
            to: CGPoint(x: rect.width, y: midY),
            control1: CGPoint(x: rect.width * 0.85, y: midY - rect.height * 0.05),
            control2: CGPoint(x: rect.width * 0.95, y: midY + rect.height * 0.05)
        )
        // Обратный путь (нижняя граница мазка)
        p.addCurve(
            to: CGPoint(x: rect.width * 0.7, y: midY + rect.height * 0.35),
            control1: CGPoint(x: rect.width * 0.92, y: midY + rect.height * 0.2),
            control2: CGPoint(x: rect.width * 0.8, y: midY + rect.height * 0.4)
        )
        p.addCurve(
            to: CGPoint(x: rect.width * 0.35, y: midY + rect.height * 0.05),
            control1: CGPoint(x: rect.width * 0.55, y: midY + rect.height * 0.35),
            control2: CGPoint(x: rect.width * 0.45, y: midY + rect.height * 0.1)
        )
        p.addCurve(
            to: CGPoint(x: 0, y: midY),
            control1: CGPoint(x: rect.width * 0.15, y: midY + rect.height * 0.1),
            control2: CGPoint(x: rect.width * 0.05, y: midY + rect.height * 0.05)
        )
        p.closeSubpath()
        return p
    }
}
```

### 8.13 EnsoProgressRing

Круговой индикатор прогресса в стиле энсо (円相) — незамкнутый круг кисти. Прогресс заполняется как мазок тушью, а не геометрическая дуга.

```swift
struct EnsoProgressRing: View {
    let progress: Double // 0.0 ... 1.0
    let size: CGFloat
    var lineWidth: CGFloat = 5
    @Environment(\.colorScheme) var colorScheme

    var body: some View {
        ZStack {
            // Фоновый круг (бледный след кисти)
            Circle()
                .stroke(AppColors.bgTertiary, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                .frame(width: size, height: size)

            // Прогресс — мазок тушью
            Circle()
                .trim(from: 0, to: min(progress, 0.92)) // Энсо никогда не замкнут полностью
                .stroke(
                    AngularGradient(
                        colors: colorScheme == .dark
                            ? [Color(hex: "FF6B40"), Color(hex: "E8D5A3"), Color(hex: "FF6B40")]
                            : [Color(hex: "E85D3A"), Color(hex: "C9A84C"), Color(hex: "E85D3A")],
                        center: .center
                    ),
                    style: StrokeStyle(lineWidth: lineWidth, lineCap: .round)
                )
                .frame(width: size, height: size)
                .rotationEffect(.degrees(-90))

            // Процент
            Text("\(Int(progress * 100))%")
                .font(AppTypography.labelMedium)
                .foregroundStyle(AppColors.textPrimary)
                .contentTransition(.numericText())
        }
        .animation(AppSprings.smooth, value: progress)
    }
}
```

### 8.14 KamiFoldReveal

Аккордеон-раскрытие контента — секция "разворачивается" как сложенный лист бумаги с 3D-перспективой.

```swift
struct KamiFoldReveal<Header: View, Content: View>: View {
    @Binding var isExpanded: Bool
    let header: () -> Header
    let content: () -> Content
    @State private var toggleCount = 0

    init(isExpanded: Binding<Bool>, @ViewBuilder header: @escaping () -> Header, @ViewBuilder content: @escaping () -> Content) {
        self._isExpanded = isExpanded
        self.header = header
        self.content = content
    }

    var body: some View {
        VStack(spacing: 0) {
            // Header — всегда видим
            Button {
                withAnimation(AppSprings.bouncy) {
                    isExpanded.toggle()
                    toggleCount += 1
                }
            } label: {
                HStack {
                    header()
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(AppColors.textTertiary)
                        .rotationEffect(.degrees(isExpanded ? 90 : 0))
                        .symbolEffect(.bounce, value: toggleCount)
                }
                .padding(AppSpacing.md)
                .background(AppColors.surfaceDefault)
            }
            .sensoryFeedback(.selection, trigger: toggleCount)

            // Content — "разворачивается" с 3D-эффектом складки
            if isExpanded {
                content()
                    .padding(.horizontal, AppSpacing.md)
                    .padding(.bottom, AppSpacing.md)
                    .background(AppColors.surfaceDefault)
                    .transition(
                        .asymmetric(
                            insertion: .modifier(
                                active: FoldModifier(foldFraction: 1),
                                identity: FoldModifier(foldFraction: 0)
                            ),
                            removal: .modifier(
                                active: FoldModifier(foldFraction: 1),
                                identity: FoldModifier(foldFraction: 0)
                            )
                        )
                    )
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: AppRadius.lg))
        .overlay(
            RoundedRectangle(cornerRadius: AppRadius.lg)
                .stroke(AppColors.bgTertiary.opacity(0.5), lineWidth: 0.5)
        )
    }
}

struct FoldModifier: ViewModifier {
    let foldFraction: Double

    func body(content: Content) -> some View {
        content
            .opacity(1 - foldFraction * 0.7)
            .scaleEffect(y: 1 - foldFraction * 0.8, anchor: .top)
            .rotation3DEffect(
                .degrees(foldFraction * -60),
                axis: (x: 1, y: 0, z: 0),
                anchor: .top,
                perspective: 0.5
            )
    }
}
```

---

## 9. iOS 18 Features

| Feature | Где использовать | Пример кода |
|---|---|---|
| `symbolEffect(.bounce)` | ВСЕ интерактивные иконки при нажатии | `Image(systemName: "heart.fill").symbolEffect(.bounce, value: tapCount)` |
| `symbolEffect(.pulse)` | Иконки в состоянии ожидания/загрузки | `Image(systemName: "waveform").symbolEffect(.pulse)` |
| `contentTransition(.numericText())` | Все динамические числа (счётчики, прогресс, статистика) | `Text("\(count)").contentTransition(.numericText())` |
| `sensoryFeedback(.selection)` | Переключение табов, сегментов, toggle | `.sensoryFeedback(.selection, trigger: selectedTab)` |
| `sensoryFeedback(.impact)` | CTA кнопки, отправка формы | `.sensoryFeedback(.impact(weight: .medium), trigger: submitCount)` |
| `MeshGradient` | Hero-секции основных экранов (Home, Profile), splash | `WashiMeshGradient()` (см. секцию 1.7) |
| `ScrollTransition` | Карточки в scroll view — fade + scale при входе/выходе из viewport | `.scrollTransition { c, p in c.opacity(p.isIdentity ? 1 : 0.6).scaleEffect(p.isIdentity ? 1 : 0.92) }` |
| `.scrollTargetBehavior(.viewAligned)` | Горизонтальные scroll-секции (категории, featured) — snap к элементам | `ScrollView(.horizontal) { ... }.scrollTargetBehavior(.viewAligned)` |

---

## 10. Navigation Patterns

### Bottom Navigation (кастомный tab bar)

Плавающий tab bar в стиле «полоска васи-бумаги»:
- Фон: `surfaceDefault` с `shadowSubtle`
- Форма: `Capsule()` с горизонтальным padding от краёв экрана (16pt)
- Позиция: `safeAreaInset(edge: .bottom)`
- Активный таб: иконка + label в `accentPrimary`, mini-dot индикатор под label
- Неактивный таб: иконка в `textTertiary`, без label
- Анимация переключения: `springSnappy` + `.symbolEffect(.bounce)` на иконке
- Разделитель сверху: `InkBrushDivider` (тонкая линия, 1pt, `bgTertiary`)
- При >5 элементов: ScrollView(.horizontal) внутри tab bar
- Tab bar скрывается при фокусе на клавиатуре

### Верхний бар (кастомный header)

«Печать мастера» (落款, rakkan) — стилизованный header:
- Фон: прозрачный с `.ultraThinMaterial` на scroll
- Leading: кнопка «назад» (chevron.left) в круге `bgSecondary`, 36pt
- Center: название экрана в `titleMedium`, `textPrimary`
- Trailing: 1-2 action кнопки (ManifestToolbarButton)
- Появление material-фона: при scroll offset > 20pt, с `springSmooth`
- Высота: 56pt

### Модальные окна

- `.presentationDetents([.medium, .large])` — два размера
- `.presentationDragIndicator(.hidden)` — скрыт, используем ManifestSheetHeader
- Фон: `bgSecondary` (НЕ системный белый)
- `presentationCornerRadius`: `AppRadius.xl` (24pt)
- Анимация: `springSmooth`

### Переходы между экранами

- Push: `withAnimation(AppSprings.smooth) { path.append(...) }`
- Pop: стандартный swipe-back с кастомным header
- Sheet present: `.transition(.panel)` с `springSmooth`
- Все переходы — ТОЛЬКО spring, никогда linear или easeInOut

---

## 11. Anti-patterns — ЗАПРЕЩЕНО

### Системные iOS anti-patterns:

1. Стандартный `TabView` с `.tabItem` — используется только кастомный floating tab bar
2. Стандартный `.navigationTitle` — используется кастомный header (секция 10)
3. Системный `Slider()` — используется `ManifestSlider`
4. `Color.accentColor` / `.tint(.blue)` — используются только токены из `AppColors`
5. `Color.black` / `Color.white` напрямую — запрещено, используй `textPrimary`/`surfaceDefault`
6. Системный `.alert()` — кастомные overlay-алерты с `surfaceElevated` фоном
7. Text truncation (три точки) без `.minimumScaleFactor` — всегда `.lineLimit(N)` + `.minimumScaleFactor(0.8)`
8. Word wrap в кнопках без `.lineLimit(1)` — обязательно `.lineLimit(1)` в каждой кнопке
9. Анимации без spring — все анимации из `AppSprings`, никогда `.linear` или `.easeInOut`
10. Цвета не из манифеста — каждый цвет из `AppColors`, `AppGradients` или адаптивной палитры
11. Захардкоженные `Color(hex: "...")` вместо `AppColors.*` — все цвета ТОЛЬКО через адаптивные токены
12. Одинаковый вид в light и dark — light = тёплый васи-крем с индиго тушью, dark = полуночный индиго с хурмой и золотом

### AI-structural anti-patterns:

13. Горизонтальный scroll одинаковых карточек фиксированной ширины — каждый scroll-контейнер содержит визуально различимые элементы (разная высота, чередование `OriCreaseCard` и `ManifestCard`, разная плотность)
14. Hero header = `VStack(ManifestBadge, Text.displayMedium, Text.bodyMedium)` + иконка справа — использовать layout из секции 13 (асимметричный hero на MeshGradient, заголовок на 60% ширины)
15. Staggered appear (одинаковые `.opacity` + `.offset(y:)` + `.delay(N)`) — каждый экран имеет свой appear-паттерн из секции 13.5
16. Stat strip из 3 одинаковых metric-карточек фиксированной ширины — статистику показывать через `EnsoProgressRing` или вертикальный layout с `InkBrushDivider`
17. Однотипные секции (`Text.titleSmall` + контент с одинаковым gap) — секции чередуются по правилу heavy/light/accent из секции 13.4, разделяются `InkBrushDivider`
18. `RoundedRectangle` как единственная форма — чередовать с `OriCreaseCard` (складка), `InkBrushDivider` (мазок), `EnsoProgressRing` (энсо), кастомными `CreasedPaperShape`

---

## 12. Validation Checklist

### Дизайн-токены:
- [ ] Все цвета из `AppColors` (ни одного захардкоженного hex в View-коде)
- [ ] Все typography из `AppTypography`
- [ ] Все spacing из `AppSpacing`
- [ ] Все radius из `AppRadius`

### iOS 18 и анимации:
- [ ] `symbolEffect` на всех интерактивных иконках
- [ ] `contentTransition(.numericText())` на всех динамических числах
- [ ] `sensoryFeedback` на всех переключениях и CTA
- [ ] 2+ iOS 18 анимации на каждом экране

### Текст и accessibility:
- [ ] Нет truncation — `.lineLimit()` + `.minimumScaleFactor(0.8)` на всех текстах
- [ ] Нет word wrap в кнопках — `.lineLimit(1)` обязательно
- [ ] Контрастность текста WCAG AA (4.5:1 для body, 3:1 для large) в обеих темах

### Навигация и компоненты:
- [ ] Кастомная навигация (из секции 10), нет стандартных элементов
- [ ] Используются компоненты из каталога (секция 8)
- [ ] Как минимум 1 concept-specific компонент (8.11-8.14) на экране

### Консистентность:
- [ ] Название приложения **Kami** совпадает с секцией 0.1 (без вариаций)
- [ ] Все иконки и подписи совпадают с глобальным словарём 0.3 / 7.2
- [ ] Экран корректно и красиво выглядит в Light mode
- [ ] Экран корректно и красиво выглядит в Dark mode

### Layout-уникальность:
- [ ] Layout экрана соответствует принципам из секции 13 "Layout DNA"
- [ ] НЕ использован шаблонный hero header (badge + title + subtitle VStack)
- [ ] НЕ использован horizontal scroll одинаковых карточек как основной layout
- [ ] Appear-анимация экрана уникальна (не staggered opacity+offset+delay)
- [ ] Секции экрана визуально различаются между собой (разная форма, фон, плотность)
- [ ] Присутствует хотя бы одна нестандартная Shape (не RoundedRectangle)

### Целостность:
- [ ] Радикальное визуальное отличие от текущего дизайна (лавандово-персиковый) и от стандартного iOS
- [ ] Весь функционал приложения полностью сохранён
- [ ] Если есть splash/launch — иконка сгенерирована по секции 0.2

---

## 13. Layout DNA — Пространственная идентичность

**НАЗНАЧЕНИЕ:** Эта секция — главная защита от AI-шаблонности. Washi Ink — это не просто палитра, а пространственный язык. Каждый агент ОБЯЗАН соблюдать эти правила при редизайне своего экрана.

### 13.1 Принцип композиции — «Наслоённые свитки» (重ね巻き, Kasane-maki)

Контент организован как перекрывающиеся листы бумаги, уложенные друг на друга с лёгким смещением. Каждая секция — отдельный "лист", который визуально приподнят над предыдущим.

**Геометрическая метафора:** Z-stack перекрывающихся бумажных листов. Нижний лист — фон (MeshGradient васи), средние листы — контент-секции, верхний лист — интерактивные элементы.

**Пространственные отношения:** Элементы перекрывают друг друга на 8-12pt, создавая глубину. Секции имеют разную ширину (полная / с отступами / узкая accent-полоса), что создаёт ритм.

```
┌───────────────────────────┐
│ ░░░ WashiMeshGradient ░░░ │  ← Фоновый слой (hero)
│ ░░░░░░░░░░░░░░░░░░░░░░░░░ │
│ ┌─╮────────────────────── │  ← Лист 1: OriCreaseCard
│ │╱│  Title (serif, 60%)   │     (загнутый угол)
│ │ │  + subtle controls    │
│ └─────────────────────┘   │
│   ┌─────────────────────┐ │  ← Лист 2: ManifestCard
│   │  Content section     │ │     (перекрывает Лист 1 на 8pt)
│   │  ╌╌╌ InkBrush ╌╌╌   │ │     (разделитель-мазок внутри)
│   │  Sub-content         │ │
│   └─────────────────────┘ │
│ ╍╍╍╍ accent strip ╍╍╍╍╍╍ │  ← Accent-полоса (vermillion, узкая)
│ ┌─────────────────────┐   │  ← Лист 3
│ │  Additional content  │   │
│ └─────────────────────┘   │
└───────────────────────────┘
```

### 13.2 Hero-зона (альтернатива стандартному hero header)

Hero-зона на основных экранах — это «плавающий лист васи» с MeshGradient фоном, НЕ стандартный badge + title + subtitle.

**Компоновка:**
- Фон: `WashiMeshGradient()` (секция 1.7) — тёплое переливание бумажных тонов
- Заголовок: `displayLarge` (serif) — расположен **асимметрично** (left-aligned, max width 60% экрана)
- Подзаголовок (если есть): `bodyMedium`, `textSecondary`, ниже заголовка на `xs`
- Navigation controls: маленькие круглые кнопки (`bgSecondary` circle, 36pt) в верхнем правом углу — как «печати» (落款, rakkan)
- Декоративный элемент: тонкий `InkBrushDivider` в нижней части hero, отделяющий от контента

```
┌───────────────────────────┐
│               ○ ○         │  ← Кнопки-печати (settings, search)
│                           │
│  大きなタイトル             │  ← Title (serif, 60% width, left)
│  Small subtitle text       │
│                           │
│  ╌╌╌ ink brush ╌╌╌╌╌╌╌╌  │  ← InkBrushDivider
└───────────────────────────┘
```

### 13.3 Навигация между контентом — «Аккордеон-фолд» (蛇腹折り, Jabara-ori)

Группы контента внутри экрана раскрываются как аккордеон (гармошка), НЕ горизонтальный scroll одинаковых карточек.

**Паттерн:** `KamiFoldReveal` (секция 8.14) — тап на header разворачивает секцию с 3D-эффектом складки. Соседние секции сжимаются/отодвигаются.

**Связь с концепцией:** Оригами аккордеон-книга (蛇腹折り) — последовательность сложенных листов, где каждый разворачивается по очереди.

**Когда использовать:** категории контента (Game, Character, Weapon...), настройки, FAQ, длинные списки options.

```
┌───────────────────────┐
│ ▸ Games               │  ← Сложен (закрыт)
├───────────────────────┤
│ ▾ Characters          │  ← Развёрнут (открыт)
│ ╭─────────────────╮   │
│ │ Character cards  │   │    3D fold-in анимация
│ │ with varied      │   │
│ │ heights           │   │
│ ╰─────────────────╯   │
├───────────────────────┤
│ ▸ Weapons             │  ← Сложен
├───────────────────────┤
│ ▸ Scripts             │  ← Сложен
└───────────────────────┘
```

### 13.4 Ритм и контраст секций

Правило чередования «тяжёлых» и «лёгких» секций, чтобы экран не выглядел как однородный VStack:

**Цикл:** Heavy → Light → Accent → Light → Heavy → ...

| Тип секции | Характеристика | Пример |
|---|---|---|
| **Heavy** (重い) | Тёмный/акцентный фон (`bgTertiary` или subtle MeshGradient), крупный шрифт, `OriCreaseCard` | Hero-зона, featured content, CTA-блок |
| **Light** (軽い) | Максимум воздуха, `bgPrimary` фон, мелкий текст, простые `ManifestCard` | Список элементов, metadata, описание |
| **Accent** (朱) | Узкая горизонтальная полоса `accentPrimary` или `accentTertiary` фон, `InkBrushDivider` | Stat highlight, promotion banner, divider |

**Правила:**
- Две Heavy секции НИКОГДА не идут подряд
- Accent-полоса занимает max 60pt высоты
- Каждый экран содержит минимум 1 Heavy + 1 Light + 1 Accent
- Секции имеют РАЗНУЮ ширину: Heavy = full-width, Light = с padding `md`, Accent = полная ширина без padding

### 13.5 Appear-паттерны (альтернатива staggered opacity+offset)

3 РАЗНЫХ appear-анимации для разных типов экранов:

**Главный экран — «Разворот свитка» (巻物, Makimono):**
Контент "разворачивается" сверху вниз, как свиток. Hero-зона появляется первой с `scale(0.95→1.0)` + `opacity(0→1)`. Затем каждая секция-лист "выскальзывает" из-под предыдущей с `offset(y: 20→0)` + лёгким `rotation3DEffect` (5°→0° по оси X). Интервал между секциями: 0.06s (НЕ одинаковый delay — каждая следующая секция появляется чуть быстрее: 0.06, 0.05, 0.04...).

```swift
.opacity(appeared ? 1 : 0)
.offset(y: appeared ? 0 : 20)
.rotation3DEffect(.degrees(appeared ? 0 : 5), axis: (x: 1, y: 0, z: 0), perspective: 0.3)
.animation(AppSprings.smooth.delay(0.06 * Double(max(0, 3 - index))), value: appeared)
```

**Второстепенные экраны — «Чернильное проявление» (墨流し, Suminagashi):**
Контент проявляется из центра наружу, как чернила расплываются по мокрой бумаге. Начинается с центрального элемента (scale 0.8→1.0, opacity 0→1), затем периферия "проявляется" с `scaleEffect` от центра.

```swift
.scaleEffect(appeared ? 1 : 0.85)
.opacity(appeared ? 1 : 0)
.animation(AppSprings.gentle.delay(0.08), value: appeared)
```

**Модальные панели — «Падение листа» (紙落とし, Kami-otoshi):**
Sheet "падает" сверху как лист бумаги — с лёгким flutter-эффектом (rotation по Z на 1-2° → 0°, bounce в spring). Не стандартный slide-from-bottom.

```swift
.offset(y: appeared ? 0 : -40)
.rotationEffect(.degrees(appeared ? 0 : -2))
.opacity(appeared ? 1 : 0)
.animation(AppSprings.bouncy, value: appeared)
```
