# ТЗ-6: Исправить превью игр на iOS (убрать манекен)

## Цель
Для игровых проектов (`game`, `clone`) не показывать 3D-манекен в превью. Вместо него показывать текст GDD или `.robloxBinary` информацию.

## Контекст
В `apps/ios/AIGoldRoblox/Features/Chat/ChatStore.swift` функция `makePreviewPayload` (строка 1076) использует `shows3D = true` для `projectKind == .game` (строка 1123). Это приводит к тому, что когда нет pipeline stages и нет real3D артефакта, фолбэк показывает `.model3D(bodyType:, accentColor:, ...)` — SceneKit манекен (строки 1175, 1225, 1299, 1333).

Манекен уместен для `projectKind == .content` и `.ugc` (UGC-персонажи), но **не для** `.game` и `.clone` (игровые миры).

## Файл для изменения

### `apps/ios/AIGoldRoblox/Features/Chat/ChatStore.swift`

**Шаг A:** Разделить `shows3D` на два флага (строка 1123):

Текущий код:
```swift
let shows3D = projectKind == .game || projectKind == .clone || projectKind == .content || projectKind == .ugc
```

Заменить на:
```swift
let isCharacterProject = projectKind == .content || projectKind == .ugc
let isGameProject = projectKind == .game || projectKind == .clone
let shows3D = isCharacterProject || isGameProject
```

**Шаг B:** В fallback с `.model3D` для `nativeRobloxArtifact` (строка 1168-1194) — для игровых проектов использовать `.robloxBinary` вместо `.model3D`:

Текущий код:
```swift
if let nativeRobloxArtifact {
    if shows3D {
        let caption = job.resultText
            ?? primaryArtifact?.previewText
            ?? "\(nativeRobloxArtifact.type.uppercased()) artifact ready for Roblox Studio."
        return PreviewPayload(
            title: "\(draft.title) \(nativeRobloxArtifact.type.uppercased())",
            artifactType: .model3D(
                bodyType: bodyTypeForPreview,
                accentColor: accentColorForPreview,
                textureURL: nil,
                caption: caption,
                archetype: archetypeForPreview
            ),
```

Заменить на:
```swift
if let nativeRobloxArtifact {
    if isGameProject {
        let caption = job.resultText
            ?? primaryArtifact?.previewText
            ?? "\(nativeRobloxArtifact.type.uppercased()) game world ready for Roblox Studio."
        let notes = [
            "Transfer the \(nativeRobloxArtifact.type.uppercased()) file to desktop and open it in Roblox Studio.",
            "The game includes generated terrain, structures, and gameplay scripts.",
            "Press Play in Studio to test the game."
        ]
        return PreviewPayload(
            title: "\(draft.title) \(nativeRobloxArtifact.type.uppercased())",
            artifactType: .robloxBinary(kind: nativeRobloxArtifact.type, notes: notes),
            exportFileType: nativeRobloxArtifact.type,
            artifactIds: artifactIds,
            shareDescription: shareDescription,
            downloadURL: downloadURL,
            glbDownloadURL: glbDownloadURL,
            rbxmDownloadURL: rbxmDownloadURL,
            fbxDownloadURL: fbxDownloadURL,
            notes: notes
        )
    } else if isCharacterProject {
        let caption = job.resultText
            ?? primaryArtifact?.previewText
            ?? "\(nativeRobloxArtifact.type.uppercased()) artifact ready for Roblox Studio."
        return PreviewPayload(
            title: "\(draft.title) \(nativeRobloxArtifact.type.uppercased())",
            artifactType: .model3D(
                bodyType: bodyTypeForPreview,
                accentColor: accentColorForPreview,
                textureURL: nil,
                caption: caption,
                archetype: archetypeForPreview
            ),
```

**Шаг C:** То же самое для `bundleArtifact` fallback (строка 1218-1245):

Текущий код:
```swift
if let bundleArtifact {
    if shows3D {
        // ... returns .model3D
```

Заменить `shows3D` на `isCharacterProject`:
```swift
if let bundleArtifact {
    if isCharacterProject {
        // ... returns .model3D (only for character projects)
```

Для `isGameProject` добавить отдельную ветку с `.projectBundle`:
```swift
    } else if isGameProject {
        let summary = bundleArtifact.previewText ?? "Game project bundle ready for Roblox Studio."
        let fileList = job.artifacts.map(\.name).joined(separator: "\n")
        return PreviewPayload(
            title: "\(draft.title) Project Bundle",
            artifactType: .projectBundle(summary: summary, files: job.artifacts.map(\.name)),
            exportFileType: bundleArtifact.type,
            artifactIds: artifactIds,
            shareDescription: shareDescription,
            downloadURL: downloadURL,
            glbDownloadURL: glbDownloadURL,
            rbxmDownloadURL: rbxmDownloadURL,
            fbxDownloadURL: fbxDownloadURL,
            notes: ["Game project bundle includes GDD, scripts, and RBXL file."]
        )
```

**Шаг D:** Для text/GDD fallback (строки 1295-1327) — для game projects использовать `.gdd` или `.text` вместо `.model3D`:

Текущий код:
```swift
if let text = gddArtifact?.content ?? textArtifact?.content ?? primaryArtifact?.content ?? job.resultText, !text.isEmpty {
    if shows3D {
        return PreviewPayload(
            title: "\(draft.title) Preview",
            artifactType: .model3D(
```

Заменить `shows3D` на `isCharacterProject`:
```swift
if let text = gddArtifact?.content ?? textArtifact?.content ?? primaryArtifact?.content ?? job.resultText, !text.isEmpty {
    if isCharacterProject {
        return PreviewPayload(
            title: "\(draft.title) Preview",
            artifactType: .model3D(
```

**Шаг E:** Для конечный fallback (строки 1330-1349) — аналогично:

Текущий код:
```swift
if shows3D {
    return PreviewPayload(
        title: "\(draft.title) GDD",
        artifactType: .model3D(
```

Заменить на:
```swift
if isCharacterProject {
    return PreviewPayload(
        title: "\(draft.title) GDD",
        artifactType: .model3D(
```

## Итог

После изменений:
- **Персонажи** (content, ugc): по-прежнему показывают 3D манекен / реальную 3D модель
- **Игры** (game, clone): показывают:
  - Pipeline view (если есть stages)
  - `.robloxBinary` view (для RBXL)
  - `.projectBundle` view (для bundle)
  - `.gdd` text view (для GDD fallback)
  - **НИКОГДА** не показывают SceneKit манекен

## Проверка
1. Создать игровой проект (Obby) → превью НЕ показывает манекен
2. Создать UGC-персонажа → превью показывает манекен (как раньше)
3. Игровой проект с RBXL → показывает "RBXL game world ready for Roblox Studio"
4. Игровой проект без RBXL → показывает GDD текст

## Зависимости
- Нет зависимостей от других ТЗ
- Можно делать параллельно с остальными задачами
