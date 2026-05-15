//
//  EditorState.swift
//  AIGoldRoblox
//

import SwiftUI
import SceneKit

enum ClothTarget: String, CaseIterable {
    case shirt = "SHIRTS"
    case pants = "PANTS"
    case tshirt = "T-SHIRT"
}

enum EditorSection: String, CaseIterable {
    case textures = "TEXTURES"
    case stickers = "STICKERS"
    case clothes = "CLOTH"
    case colors = "COLOR"
    case loops = "LOOPS"
}

enum AccessorySlot: String {
    case hat, face, neck, back
}

enum EditorEditArea: String, CaseIterable {
    case head = "Head"
    case torso = "Torso"
    case legs = "Legs"
}

struct StickerState: Identifiable {
    let id = UUID()
    var imageURL: String
    var targetArea: EditorEditArea
    var position: CGPoint = .zero
    var scale: CGFloat = 1.0
    var rotation: Angle = .zero
    var isConfirmed: Bool = false
}

struct LoopState {
    var imageURL: String
    var slot: AccessorySlot
    var offset: CGSize = .zero
}

enum AvatarBodyType: String, CaseIterable, Identifiable {
    case neutrally = "classic"
    case woman = "female"
    case man = "male"
    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .neutrally: return "Classic"
        case .woman: return "Woman"
        case .man: return "Man"
        }
    }
}

enum AvatarRigType: String, CaseIterable, Identifiable {
    case r6 = "r6"
    case r15 = "r15"

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .r6: return "R6"
        case .r15: return "R15"
        }
    }
}

final class EditorState: ObservableObject {
    private static let defaultBodyColor = Color(red: 0.95, green: 0.97, blue: 0.94)

    private func log(_ message: String) {
        let formatted = "[EditorState] \(message)"
        print(formatted)
        NSLog("%@", formatted)
    }

    // Paint layer
    @Published var paintColor: Color = defaultBodyColor
    @Published var paintOpacity: Double = 1.0
    @Published var paintTextureURL: String?

    // Cloth layer
    @Published var clothTextureURL: String?
    @Published var clothTranslucence: Double = 1.0
    @Published var clothTarget: ClothTarget = .shirt {
        didSet { refreshVisibleContent() }
    }

    // Stickers
    @Published var stickers: [StickerState] = []
    @Published var stickerAlpha: Double = 1.0
    @Published var activeEditingSticker: StickerState?

    // Loops
    @Published var loopTextureURL: String?
    @Published var loopSlot: AccessorySlot = .hat
    @Published var loopOffset: CGSize = .zero
    @Published var loopAlpha: Double = 1.0
    @Published var activeEditingLoop: LoopState?

    // Accessories
    @Published var accessories: [AccessorySlot: String] = [:]

    // Avatar body type
    @Published var currentBodyType: AvatarBodyType = .neutrally {
        didSet {
            guard oldValue != currentBodyType else { return }
            log("Body type changed \(oldValue.displayName) -> \(currentBodyType.displayName)")
            debugDumpToConsole(reason: "currentBodyType changed")
        }
    }
    @Published var currentRigType: AvatarRigType = .r15 {
        didSet {
            guard oldValue != currentRigType else { return }
            log("Rig type changed \(oldValue.displayName) -> \(currentRigType.displayName)")
            debugDumpToConsole(reason: "currentRigType changed")
        }
    }

    // UI state
    @Published var selectedSection: EditorSection = .textures {
        didSet {
            if !availableSections.contains(selectedSection) {
                selectedSection = availableSections.first ?? .textures
                return
            }
            refreshVisibleContent()
        }
    }
    @Published var isFullView: Bool = false
    @Published var modelRotation: Double = 0
    @Published var isPartByPartMode: Bool = false
    @Published var selectedEditArea: EditorEditArea = .legs {
        didSet {
            switch selectedEditArea {
            case .head:
                loopSlot = .hat
            case .torso:
                loopSlot = .back
                if clothTarget == .pants {
                    clothTarget = .shirt
                }
            case .legs:
                loopSlot = .back
                clothTarget = .pants
            }
            if !availableSections.contains(selectedSection) {
                selectedSection = defaultSection(for: selectedEditArea)
            }
            refreshVisibleContent()
        }
    }

    // Content
    @Published var contentItems: [ContentItem] = []
    @Published var isLoading: Bool = false
    private var loadedSections: [String: [ContentItem]] = [:]
    private var hasHydratedFromCache = false

    private func sampleItemsDescription(_ items: [ContentItem], limit: Int = 4) -> String {
        guard !items.isEmpty else { return "[]" }
        return items.prefix(limit).map {
            let imageSource = $0.dropboxImagePath.isEmpty ? $0.imageUrl : $0.dropboxImagePath
            return "{title=\"\($0.title)\", subtitle=\"\($0.subtitle)\", image=\"\(imageSource)\"}"
        }.joined(separator: ", ")
    }

    func debugDumpToConsole(reason: String) {
        let sectionSummary = loadedSections
            .map { "\($0.key)=\($0.value.count)" }
            .sorted()
            .joined(separator: ", ")
        log("DEBUG \(reason)")
        log("DEBUG selection area=\(selectedEditArea.rawValue) section=\(selectedSection.rawValue) clothTarget=\(clothTarget.rawValue) rig=\(currentRigType.displayName) body=\(currentBodyType.displayName)")
        log("DEBUG availableSections=\(availableSections.map(\.rawValue).joined(separator: ", ")) isLoading=\(isLoading)")
        log("DEBUG loadedSections=\(sectionSummary)")
        log("DEBUG visibleItems=\(contentItems.count) samples=\(sampleItemsDescription(contentItems))")
    }

    var availableSections: [EditorSection] {
        switch selectedEditArea {
        case .head:
            return [.stickers, .colors, .loops]
        case .torso:
            return [.textures, .stickers, .clothes, .colors]
        case .legs:
            return [.textures, .stickers, .colors]
        }
    }

    // MARK: - Content loading from Dropbox

    func loadContent() {
        if !hasHydratedFromCache {
            hydrateFromCachedContent()
        }
        guard !isLoading else { return }
        isLoading = true
        log("Starting editor content load")
        debugDumpToConsole(reason: "before Dropbox load")
        Task { @MainActor in
            var sections = await DropboxService.shared.loadAllSections()
            let totalItems = sections.values.reduce(0) { $0 + $1.count }
            if totalItems == 0 {
                log("Initial load returned 0 items, forcing Dropbox refresh")
                sections = await DropboxService.shared.loadAllSections(forceRefresh: true)
            }
            self.loadedSections = sections
            self.refreshVisibleContent()
            self.isLoading = false
            self.log("Loaded sections: \(sections.map { "\($0.key)=\($0.value.count)" }.sorted().joined(separator: ", "))")
            self.log("Visible editor items after refresh: \(self.contentItems.count)")
            self.debugDumpToConsole(reason: "after Dropbox load")
        }
    }

    private func hydrateFromCachedContent() {
        hasHydratedFromCache = true
        Task { @MainActor in
            let cachedSections = await DropboxService.shared.cachedSectionsSnapshot()
            guard !cachedSections.isEmpty else { return }
            self.loadedSections = cachedSections
            self.refreshVisibleContent()
            self.log("Hydrated from cached Dropbox snapshot: \(cachedSections.map { "\($0.key)=\($0.value.count)" }.sorted().joined(separator: ", "))")
            self.debugDumpToConsole(reason: "after cache hydration")
        }
    }

    private func refreshVisibleContent() {
        let lookBookItems = loadedSections["LookBook"] ?? []
        let editorItems = loadedSections["Editor"] ?? []
        let editorLibraryItems = loadedSections["Editor Items"] ?? []
        let allLoadedItems = loadedSections.values.flatMap { $0 }
        log("refreshVisibleContent start area=\(selectedEditArea.rawValue) section=\(selectedSection.rawValue) clothTarget=\(clothTarget.rawValue)")
        log("refreshVisibleContent source counts LookBook=\(lookBookItems.count) Editor=\(editorItems.count) EditorItems=\(editorLibraryItems.count) AllLoaded=\(allLoadedItems.count)")

        switch selectedSection {
        case .textures:
            guard selectedEditArea != .head else {
                contentItems = []
                log("refreshVisibleContent TEXTURES head: 0 items")
                return
            }
            let textureSource = lookBookItems + editorItems
            let clothing = textureSource.filter { item in
                let value = "\(item.title) \(item.subtitle)".lowercased()
                switch clothTarget {
                case .pants: return value.contains("pants")
                case .shirt: return value.contains("shirt") && !value.contains("t-shirt")
                case .tshirt: return value.contains("t-shirt")
                }
            }
            contentItems = !clothing.isEmpty ? clothing : (!textureSource.isEmpty ? textureSource : allLoadedItems)
            log("refreshVisibleContent TEXTURES \(clothTarget.rawValue): \(contentItems.count) items")
            log("refreshVisibleContent TEXTURES samples: \(sampleItemsDescription(contentItems))")

        case .stickers:
            let stickerItems = editorLibraryItems.filter {
                $0.subtitle == "Stickers" || $0.title.localizedCaseInsensitiveContains("sticker")
            }
            contentItems = !stickerItems.isEmpty ? stickerItems : (!editorLibraryItems.isEmpty ? editorLibraryItems : allLoadedItems)
            log("refreshVisibleContent STICKERS \(selectedEditArea.rawValue): \(contentItems.count) items")
            log("refreshVisibleContent STICKERS samples: \(sampleItemsDescription(contentItems))")

        case .clothes:
            guard selectedEditArea == .torso else {
                contentItems = []
                log("refreshVisibleContent CLOTH \(selectedEditArea.rawValue): 0 items")
                return
            }
            let clothItems = editorLibraryItems.filter {
                $0.subtitle == "Cloth" || $0.title.localizedCaseInsensitiveContains("cloth")
            }
            contentItems = !clothItems.isEmpty ? clothItems : (!editorLibraryItems.isEmpty ? editorLibraryItems : allLoadedItems)
            log("refreshVisibleContent CLOTH \(selectedEditArea.rawValue): \(contentItems.count) items")
            log("refreshVisibleContent CLOTH samples: \(sampleItemsDescription(contentItems))")

        case .colors:
            contentItems = []
            log("refreshVisibleContent COLOR: 0 items (palette mode)")

        case .loops:
            guard selectedEditArea == .head else {
                contentItems = []
                log("refreshVisibleContent LOOPS \(selectedEditArea.rawValue): 0 items")
                return
            }
            let accessoryItems = editorLibraryItems.filter {
                $0.subtitle == "Accessories" || $0.title.localizedCaseInsensitiveContains("accessory")
            }
            contentItems = !accessoryItems.isEmpty ? accessoryItems : (!editorLibraryItems.isEmpty ? editorLibraryItems : allLoadedItems)
            log("refreshVisibleContent LOOPS \(selectedEditArea.rawValue): \(contentItems.count) items")
            log("refreshVisibleContent LOOPS samples: \(sampleItemsDescription(contentItems))")
        }
    }

    func applyTexture(url: String) {
        paintTextureURL = url
    }

    func applyPaintColor(_ color: Color) {
        paintColor = color
        paintTextureURL = nil
    }

    func selectBodyType(_ type: AvatarBodyType) {
        currentBodyType = type
    }

    func selectRigType(_ type: AvatarRigType) {
        currentRigType = type
    }

    func applyCloth(url: String) {
        clothTextureURL = url
    }

    func addSticker(url: String) {
        let sticker = StickerState(imageURL: url, targetArea: selectedEditArea)
        stickers.append(sticker)
        activeEditingSticker = sticker
    }

    func startEditingSticker(_ url: String) {
        let sticker = StickerState(imageURL: url, targetArea: selectedEditArea)
        activeEditingSticker = sticker
    }

    func updateActiveSticker(offset: CGSize, scale: CGFloat, rotation: Angle) {
        guard var sticker = activeEditingSticker else { return }
        sticker.position = CGPoint(x: offset.width, y: offset.height)
        sticker.scale = scale
        sticker.rotation = rotation
        activeEditingSticker = sticker
    }

    func confirmSticker() {
        guard var sticker = activeEditingSticker else { return }
        sticker.isConfirmed = true
        if let idx = stickers.firstIndex(where: { $0.id == sticker.id }) {
            stickers[idx] = sticker
        } else {
            stickers.append(sticker)
        }
        activeEditingSticker = nil
    }

    func addAccessory(url: String, slot: AccessorySlot) {
        accessories[slot] = url
    }

    func applyLoop(url: String) {
        loopTextureURL = url
        loopSlot = selectedEditArea == .head ? .face : .back
        loopOffset = .zero
    }

    func startEditingLoop(_ url: String) {
        activeEditingLoop = LoopState(
            imageURL: url,
            slot: selectedEditArea == .head ? .face : .back,
            offset: loopOffset
        )
    }

    func updateActiveLoop(offset: CGSize) {
        guard var loop = activeEditingLoop else { return }
        loop.offset = offset
        activeEditingLoop = loop
    }

    func confirmLoop() {
        guard let loop = activeEditingLoop else { return }
        loopTextureURL = loop.imageURL
        loopSlot = loop.slot
        loopOffset = loop.offset
        activeEditingLoop = nil
    }

    func cancelLoopEditing() {
        activeEditingLoop = nil
    }

    func clearCurrentSection() {
        switch selectedSection {
        case .stickers:
            stickers.removeAll { $0.targetArea == selectedEditArea }
            activeEditingSticker = nil
        case .clothes:
            accessories[.back] = nil
            accessories[.neck] = nil
        case .loops:
            loopTextureURL = nil
            loopOffset = .zero
            activeEditingLoop = nil
        case .textures:
            clothTextureURL = nil
        case .colors:
            break
        }
    }

    // MARK: - Category cycling

    private static let allTargets = ClothTarget.allCases

    func nextCategory() {
        guard let idx = Self.allTargets.firstIndex(of: clothTarget) else { return }
        clothTarget = Self.allTargets[(idx + 1) % Self.allTargets.count]
        selectedEditArea = clothTarget == .pants ? .legs : .torso
    }

    func previousCategory() {
        guard let idx = Self.allTargets.firstIndex(of: clothTarget) else { return }
        clothTarget = Self.allTargets[(idx - 1 + Self.allTargets.count) % Self.allTargets.count]
        selectedEditArea = clothTarget == .pants ? .legs : .torso
    }

    func selectEditArea(_ area: EditorEditArea) {
        selectedEditArea = area
    }

    private func defaultSection(for area: EditorEditArea) -> EditorSection {
        switch area {
        case .head:
            return .loops
        case .torso:
            return .textures
        case .legs:
            return .textures
        }
    }

    func resetAll() {
        paintColor = Self.defaultBodyColor
        paintOpacity = 1.0
        paintTextureURL = nil
        clothTextureURL = nil
        clothTranslucence = 1.0
        stickers.removeAll()
        stickerAlpha = 1.0
        activeEditingSticker = nil
        loopTextureURL = nil
        loopOffset = .zero
        loopAlpha = 1.0
        activeEditingLoop = nil
        accessories.removeAll()
        currentBodyType = .neutrally
        currentRigType = .r15
        selectedEditArea = .legs
        clothTarget = .pants
        selectedSection = .textures
        refreshVisibleContent()
    }
}

struct ContentItem: Identifiable, Hashable, Codable {
    let id: String
    var title: String
    var subtitle: String
    var imageUrl: String
    var dropboxImagePath: String
    var section: String

    func hash(into hasher: inout Hasher) { hasher.combine(id) }
    static func == (lhs: ContentItem, rhs: ContentItem) -> Bool { lhs.id == rhs.id }
}
