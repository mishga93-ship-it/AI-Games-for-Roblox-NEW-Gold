//
//  ChatStore.swift
//  AIGoldRoblox
//

import Foundation
import AVFoundation
import SwiftUI
import UserNotifications
#if canImport(UIKit)
import UIKit
#endif

@MainActor
final class ChatStore: ObservableObject {
    @Published var threads: [ChatThread] = []
    @Published var currentThread: ChatThread?
    @Published var messages: [ChatMessage] = []
    @Published var searchResults: [ChatThread]?
    private var searchTask: Task<Void, Never>?
    @Published var isRecording = false
    @Published var isLoading = false
    @Published var generationStages: [GenerationStage] = []
    @Published var backgroundGenerationJobs: [BackgroundGenerationJob] = []
    @Published var activePreview: PreviewPayload?
    private(set) var lastPreview: PreviewPayload?
    private(set) var lastJobId: String?
    private var lastFailedGenerationJob: AIWorkspaceAPI.GenerationJob?
    private var liveJobArtifacts: [AIWorkspaceAPI.GenerationArtifact] = []
    private var isGenerating = false
    private var backgroundGenerationTasks: [String: Task<Void, Never>] = [:]
    private var restoringGenerationJobIds: Set<String> = []
    private var notifiedBackgroundStageKeys: Set<String> = []
    @Published var isPublishing = false
    @Published var lastPublishedProjectId: String?
    @Published var isAwaitingConceptApproval = false
    @Published var isProcessingConceptAction = false
    @Published var isAwaitingHeroApproval = false
    @Published var heroConcepts: [AIWorkspaceAPI.HeroConcept] = []
    /// Decal approval gate (session 231) — populated when backend pushed
    /// `metadata.approvalKind == "decal_upload"` while polling. Empty during
    /// normal generation, also empty after submit while we wait for the
    /// pipeline to clear status. UI shows DecalApprovalSheet when non-empty.
    @Published var pendingDecalCandidates: [AIWorkspaceAPI.DecalCandidate] = []
    @Published var isSubmittingDecalApproval = false
    /// Session 001 (Track 1) — set when user taps "Publish to Marketplace" on a
    /// completed classic clothing generation. ChatView observes this and presents
    /// MarketplaceHandoffView as a sheet.
    @Published var marketplaceHandoffContext: MarketplaceHandoffContext?
    @Published var voiceStatusText: String?
    @Published var voicePhase: VoicePhase = .idle
    @Published var voiceErrorAlert: String?
    @Published var systemToast: SystemToast?
    @Published var pendingVoiceTranscript: String?
    /// Pending image attachment shown as a preview chip above the input bar.
    /// Session 187: replaces the old auto-send-on-pick flow that froze the UI.
    @Published var pendingAttachment: PendingAttachment?
    private var latestReferenceImageURL: URL?
    private var latestReferenceImageAssetId: String?
    @Published var selectedLLMProvider: LLMProvider
    @Published var selected3DProvider: MeshProvider
    @Published var selectedAudioProvider: AudioProvider
    @Published var isLoadingOlderMessages = false
    @Published var hasMoreMessages = false
    private var oldestMessageCursor: String?

    let projectKind: ProjectKind
    @Published private(set) var contentSubcategory: String?
    @Published var preferredFlow: WorkspaceFlow
    @Published var presetsVisible = true
    @Published var activeSmartStub: SmartStubInfo?
    @Published private var threadProjectMemory: AIWorkspaceAPI.ProjectMemory?
    private let launchContentSubcategory: String?
    private var historySessionId: String?

    private(set) var templateStarterPrompt: String?

    struct SmartStubInfo {
        let message: String
        let category: String?
        let alternativeActions: [String]
        let hardPivot: Bool
    }

    private struct GenerationPollingTimeout: LocalizedError {
        let job: AIWorkspaceAPI.GenerationJob
        let elapsedSeconds: Int

        var errorDescription: String? {
            "Generation is still processing after \(elapsedSeconds / 60) minutes."
        }
    }

    private enum BackgroundNotificationKind {
        case progress
        case review
        case ready
        case failed
    }

    private struct PendingChatRetryRequest {
        let text: String
        let quickReply: String?
        let inputMode: String
        let attachmentKind: String?
        let forceSkipInterview: Bool
        let imageURL: URL?
        let localImageKey: String?
        let attachmentAssetId: String?
        let attachmentImageURL: URL?
    }

    struct SystemToast: Identifiable, Equatable {
        let id = UUID()
        let message: String
    }

    /// Rich preset cards shown on welcome message. Nil if no presets for this category.
    var welcomePresets: [ChatPreset]? {
        guard presetsVisible else { return nil }
        // Smart Interview must start as a natural chat, not as a category card menu.
        // Presets remain available in Quick Generate, where choosing a template is expected.
        if preferredFlow == .smartInterview {
            return nil
        }
        return ChatPresetsData.presets(forSubcategory: contentSubcategory, projectKind: projectKind.rawValue)
    }

    var selectedAssetGeneratorTitle: String? {
        if contentSubcategory == "audio" {
            return selectedAudioProvider.title
        }
        if (contentSubcategory == "npcs" || contentSubcategory == "roast_npc"),
           draft.npcVisualPipeline == "asset_template_v1" {
            return "Animated R15"
        }
        if projectKind == .content || projectKind == .ugc {
            return selected3DProvider.title
        }
        return nil
    }

    func sendPreset(_ preset: ChatPreset) {
        presetsVisible = false
        let shouldSkipInterview = preferredFlow == .quickGenerate
        send(
            preset.promptText,
            quickReply: preset.title,
            inputMode: "text",
            attachmentKind: nil,
            forceSkipInterview: shouldSkipInterview
        )
    }

    // 2026-05-20: concept-approval button label must reflect what actually
    // happens after approval, not always "Start 3D". Pipeline diverges by mode:
    //   - clothing classic_2d → composite 2D templates, no Meshy
    //   - clothing layered_3d → Meshy multi-image-to-3d
    //   - t_shirt → 512×512 decal upload, no 3D
    //   - all other content kinds → 3D mesh (default)
    // User was confused why "Start 3D" appeared when they picked 2D Classic.
    var conceptApproveButtonLabel: String {
        if contentSubcategory == "clothing" {
            let ct = draft.clothingType ?? ""
            if ct == "t_shirt" { return "Looks good — Build T-Shirt" }
            switch draft.clothingMode ?? "" {
            case "classic_2d": return "Looks good — Build 2D Classic"
            case "layered_3d": return "Looks good — Start 3D Layered"
            default: break
            }
        }
        // Session 373: vehicle concept-approve flow — clarify what comes next.
        if contentSubcategory == "vehicles" {
            return "Looks good — Build 3D Vehicle"
        }
        // 2026-05-21: pet concept-approve gate. Tap after seeing the baby
        // concept image kicks off Tripo image-to-3d + rig + 3-stage evolution.
        if contentSubcategory == "pets" {
            return "Looks good — Build 3D Pet"
        }
        return "Looks good — Start 3D"
    }

    private var draft: ProjectDraft
    private let voiceRecorder = VoiceRecorder()
    private var pendingVoiceSessionID: String?
    private var pendingChatRetryRequest: PendingChatRetryRequest?
    private static let llmProviderDefaultsKey = "chat.llmProvider"
    private static let meshProviderDefaultsKey = "chat.meshProvider"
    private static let audioProviderDefaultsKey = "chat.audioProvider"
    private static let flowDefaultsKey = "chat.workspaceFlow"

    init(projectKind: ProjectKind = .game, preferredFlow: WorkspaceFlow = .smartInterview, template: AIWorkspaceAPI.GameTemplate? = nil, contentSubcategory: String? = nil) {
        self.projectKind = projectKind
        self.launchContentSubcategory = contentSubcategory
        self.contentSubcategory = contentSubcategory
        let savedFlow = UserDefaults.standard.string(forKey: Self.flowDefaultsKey)
        self.preferredFlow = savedFlow.flatMap(WorkspaceFlow.init(rawValue:)) ?? preferredFlow
        self.draft = ProjectDraft.makeDefault(for: projectKind)
        self.selectedLLMProvider = LLMProvider(
            rawValue: UserDefaults.standard.string(forKey: Self.llmProviderDefaultsKey) ?? ""
        ) ?? .gemini
        self.selected3DProvider = MeshProvider(
            rawValue: UserDefaults.standard.string(forKey: Self.meshProviderDefaultsKey) ?? ""
        ) ?? .meshy
        self.selectedAudioProvider = AudioProvider(
            rawValue: UserDefaults.standard.string(forKey: Self.audioProviderDefaultsKey) ?? ""
        ) ?? .fal

        if let template {
            templateStarterPrompt = template.starterPrompt
            draft.title = template.title
            draft.genre = template.genre
        }

        // Ensure welcome message (with presets) is shown immediately
        messages = [welcomeMessage()]
    }

    func preloadTemplate(_ template: AIWorkspaceAPI.GameTemplate) {
        templateStarterPrompt = template.starterPrompt
        draft.title = template.title
        draft.genre = template.genre

        let features = template.features.joined(separator: ", ")
        let content = "You chose the **\(template.title)** template! This includes: \(features).\n\nI've pre-loaded the starter plan. You can customize it further — tell me what you'd like to change, or tap **Generate!** to build it as-is."
        messages = [
            ChatMessage(
                id: UUID().uuidString,
                role: .assistant,
                content: content,
                quickReplies: ["Generate!", "Change theme", "Add more features", "Customize difficulty", "Start over"],
                gddRows: [
                    ("Template", template.title),
                    ("Genre", template.genre.capitalized),
                    ("Difficulty", template.difficultyLabel),
                    ("Features", features),
                ],
                createdAt: Date()
            )
        ]
    }

    enum ThreadType: String {
        case game = "Game"
        case content = "Content"
        case other = "Other"

        static func from(_ kind: ProjectKind) -> ThreadType {
            switch kind {
            case .game, .clone: return .game
            case .content, .ugc: return .content
            case .fix, .analyze: return .other
            }
        }
    }

    struct ChatThread: Identifiable {
        let id: String
        var title: String
        var updatedAt: Date
        var promptHint: String
        var type: ThreadType
        var projectKindRaw: String? = nil
        var contentSubcategory: String? = nil
        var latestJobId: String? = nil
        var projectMemory: AIWorkspaceAPI.ProjectMemory? = nil

        var hasGenerationJob: Bool {
            if let latest = projectMemory?.latestJobId ?? latestJobId {
                return !latest.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            }
            return false
        }
    }

    struct GenerationStage: Identifiable {
        let id: String
        let title: String
        var status: String

        var isComplete: Bool {
            status == "completed" || status == "skipped"
        }

        var isFailed: Bool {
            status == "failed"
        }

        var isTerminal: Bool {
            isComplete || isFailed
        }
    }

    /// Image staged in the composer (preview chip) before the user sends.
    /// `assetId`/`previewURL` populate once the background upload finishes.
    struct PendingAttachment: Equatable {
        enum UploadState: Equatable {
            case uploading
            case ready
            case failed(String)
        }
        let id: String
        let localImageKey: String
        let fileName: String
        let mimeType: String
        var assetId: String?
        var previewURL: URL?
        var uploadState: UploadState
    }

    enum VoicePhase {
        case idle
        case recording
        case uploading
        case finalizing
        case ready
        case failed
    }

    struct PreviewPayload: Identifiable {
        let id: String
        let title: String
        let artifactType: GenerationPreviewView.ArtifactType
        let exportFileType: String
        let artifactIds: [String]
        let shareDescription: String
        let downloadURL: URL?
        let glbDownloadURL: URL?
        let rbxmDownloadURL: URL?
        let fbxDownloadURL: URL?
        let clothingTexturePngURL: URL?
        let notes: [String]
        // Phase F (session 219): Roblox catalog items welded into the generated map.
        let trendingShowcaseItems: [AIWorkspaceAPI.RobloxCatalogItem]
        let trendingShowcaseCategory: String?

        init(id: String = UUID().uuidString, title: String, artifactType: GenerationPreviewView.ArtifactType, exportFileType: String, artifactIds: [String], shareDescription: String, downloadURL: URL?, glbDownloadURL: URL?, rbxmDownloadURL: URL?, fbxDownloadURL: URL?, clothingTexturePngURL: URL? = nil, notes: [String], trendingShowcaseItems: [AIWorkspaceAPI.RobloxCatalogItem] = [], trendingShowcaseCategory: String? = nil) {
            self.id = id
            self.title = title
            self.artifactType = artifactType
            self.exportFileType = exportFileType
            self.artifactIds = artifactIds
            self.shareDescription = shareDescription
            self.downloadURL = downloadURL
            self.glbDownloadURL = glbDownloadURL
            self.rbxmDownloadURL = rbxmDownloadURL
            self.fbxDownloadURL = fbxDownloadURL
            self.clothingTexturePngURL = clothingTexturePngURL
            self.notes = notes
            self.trendingShowcaseItems = trendingShowcaseItems
            self.trendingShowcaseCategory = trendingShowcaseCategory
        }

        /// Return a copy with a different id (useful for keeping SwiftUI sheet stable).
        func withId(_ newId: String) -> PreviewPayload {
            PreviewPayload(
                id: newId, title: title, artifactType: artifactType, exportFileType: exportFileType,
                artifactIds: artifactIds, shareDescription: shareDescription, downloadURL: downloadURL,
                glbDownloadURL: glbDownloadURL, rbxmDownloadURL: rbxmDownloadURL, fbxDownloadURL: fbxDownloadURL,
                clothingTexturePngURL: clothingTexturePngURL, notes: notes,
                trendingShowcaseItems: trendingShowcaseItems, trendingShowcaseCategory: trendingShowcaseCategory
            )
        }
    }

    struct BackgroundGenerationJob: Identifiable {
        let id: String
        let title: String
        var status: String
        var stages: [GenerationStage]
        var artifactCount: Int
        var preview: PreviewPayload?
        var updatedAt: Date

        var isTerminal: Bool {
            status == "completed"
                || status == "failed"
                || status == "watcher_error"
                || status == "awaiting_review"
                || status == "partial"
        }

        var needsReview: Bool {
            status == "awaiting_review"
        }

        var isReady: Bool {
            status == "completed" || status == "partial"
        }

        var isPartial: Bool {
            status == "partial"
        }

        var isFullyCompleted: Bool {
            status == "completed"
        }

        var needsAttention: Bool {
            status == "failed" || status == "watcher_error"
        }

        var statusLabel: String {
            if needsReview { return "Needs review" }
            if isPartial { return "Partial export" }
            if isReady { return "Ready to export" }
            if status == "failed" { return "Failed" }
            if status == "watcher_error" { return "Status check paused" }
            return currentStageTitle ?? "Rendering"
        }

        var currentStageTitle: String? {
            stages.first(where: { $0.status == "processing" })?.title
                ?? stages.first(where: { $0.status == "pending" })?.title
                ?? stages.last?.title
        }
    }

    struct GenerationStatusSnapshot: Equatable {
        let title: String
        let status: String
        let statusLabel: String
        let actionLabel: String
        let iconName: String
        let jobId: String?

        var isActive: Bool {
            !["completed", "partial", "awaiting_review", "failed", "watcher_error"].contains(status)
        }

        var isReady: Bool {
            status == "completed" || status == "partial"
        }

        var isPartial: Bool {
            status == "partial"
        }

        var isFullyCompleted: Bool {
            status == "completed"
        }

        var needsReview: Bool {
            status == "awaiting_review"
        }

        var isFailed: Bool {
            status == "failed" || status == "watcher_error"
        }
    }

    enum WorkspaceFlow: String, CaseIterable {
        case quickGenerate = "quick_generate"
        case smartInterview = "smart_interview"

        var title: String {
            switch self {
            case .quickGenerate: return "Quick Generate"
            case .smartInterview: return "Smart Interview"
            }
        }

        var icon: String {
            switch self {
            case .quickGenerate: return "bolt.fill"
            case .smartInterview: return "bubble.left.and.text.bubble.right.fill"
            }
        }

        var shortDescription: String {
            switch self {
            case .quickGenerate: return "Detailed prompt → instant generation"
            case .smartInterview: return "AI asks questions → perfect result"
            }
        }
    }

    enum AttachmentType: String {
        case file = ".lua"
        case image = "image reference"
        case link = "Reference link"
    }

    enum LLMProvider: String, CaseIterable, Identifiable {
        case gemini
        case anthropic
        case openai

        var id: String { rawValue }

        var title: String {
            switch self {
            case .gemini:
                return "Gemini"
            case .anthropic:
                return "Claude"
            case .openai:
                return "OpenAI"
            }
        }
    }

    enum MeshProvider: String, CaseIterable, Identifiable {
        case meshy
        case hunyuan3d

        var id: String { rawValue }

        var title: String {
            switch self {
            case .meshy: return "Meshy v6"
            case .hunyuan3d: return "Hunyuan3D"
            }
        }
    }

    enum AudioProvider: String, CaseIterable, Identifiable {
        case fal
        case suno

        var id: String { rawValue }

        var title: String {
            switch self {
            case .fal: return "Stable Audio"
            case .suno: return "Suno"
            }
        }

        var audioType: String {
            switch self {
            case .fal: return "sfx"
            case .suno: return "music"
            }
        }
    }

    func setLLMProvider(_ provider: LLMProvider) {
        selectedLLMProvider = provider
        UserDefaults.standard.set(provider.rawValue, forKey: Self.llmProviderDefaultsKey)
    }

    func set3DProvider(_ provider: MeshProvider) {
        selected3DProvider = provider
        UserDefaults.standard.set(provider.rawValue, forKey: Self.meshProviderDefaultsKey)
    }

    func setAudioProvider(_ provider: AudioProvider) {
        selectedAudioProvider = provider
        UserDefaults.standard.set(provider.rawValue, forKey: Self.audioProviderDefaultsKey)
    }

    func setFlow(_ flow: WorkspaceFlow) {
        preferredFlow = flow
        UserDefaults.standard.set(flow.rawValue, forKey: Self.flowDefaultsKey)
        presetsVisible = true
        messages = [welcomeMessage()]
    }

    private func makeThread(from dto: AIWorkspaceAPI.ThreadDTO) -> ChatThread {
        ChatThread(
            id: dto.id,
            title: dto.title,
            updatedAt: ISO8601DateFormatter().date(from: dto.updatedAt) ?? Date(),
            promptHint: dto.promptHint,
            type: threadType(from: dto.projectKind),
            projectKindRaw: dto.projectKind,
            contentSubcategory: dto.projectMemory?.contentSubcategory ?? dto.contentSubcategory,
            latestJobId: dto.projectMemory?.latestJobId ?? dto.latestJobId,
            projectMemory: dto.projectMemory
        )
    }

    private func threadType(from rawProjectKind: String?) -> ThreadType {
        switch rawProjectKind?.lowercased() {
        case "game", "clone":
            return .game
        case "content", "ugc":
            return .content
        case "fix", "analyze":
            return .other
        default:
            return ThreadType.from(projectKind)
        }
    }

    func loadThreads() {
        Task {
            do {
                let remoteThreads = try await AIWorkspaceAPI.fetchThreads()
                if remoteThreads.isEmpty {
                    self.threads = defaultThreads()
                } else {
                    self.threads = remoteThreads.map { self.makeThread(from: $0) }
                }
            } catch {
                self.threads = defaultThreads()
            }
        }
    }

    func searchThreads(query: String) {
        searchTask?.cancel()

        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            searchResults = nil
            return
        }

        searchTask = Task {
            try? await Task.sleep(nanoseconds: 300_000_000)
            guard !Task.isCancelled else { return }

            do {
                let remote = try await AIWorkspaceAPI.searchThreads(query: trimmed)
                guard !Task.isCancelled else { return }
                self.searchResults = remote.map { self.makeThread(from: $0) }
            } catch {
                guard !Task.isCancelled else { return }
                let lowered = trimmed.lowercased()
                self.searchResults = self.threads.filter { $0.title.lowercased().contains(lowered) }
            }
        }
    }

    func renameThread(_ thread: ChatThread, to newTitle: String) {
        let trimmed = newTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        if let idx = threads.firstIndex(where: { $0.id == thread.id }) {
            threads[idx].title = trimmed
        }
        if currentThread?.id == thread.id {
            currentThread?.title = trimmed
        }

        Task {
            _ = try? await AIWorkspaceAPI.renameThread(threadId: thread.id, title: trimmed)
        }
    }

    private func applyThreadContext(_ thread: ChatThread?) {
        threadProjectMemory = thread?.projectMemory
        contentSubcategory = thread?.projectMemory?.contentSubcategory
            ?? thread?.contentSubcategory
            ?? launchContentSubcategory
        lastJobId = thread?.projectMemory?.latestJobId ?? thread?.latestJobId
        if let memory = thread?.projectMemory {
            hydrateDraft(from: memory)
        }
    }

    private func applyProjectMemory(_ memory: AIWorkspaceAPI.ProjectMemory?) {
        guard let memory else { return }
        threadProjectMemory = memory
        contentSubcategory = memory.contentSubcategory ?? contentSubcategory
        if let latestJobId = memory.latestJobId {
            applyLatestJobId(latestJobId)
        }
        hydrateDraft(from: memory)

        if var thread = currentThread {
            thread.projectMemory = memory
            thread.contentSubcategory = memory.contentSubcategory ?? thread.contentSubcategory
            thread.latestJobId = memory.latestJobId ?? thread.latestJobId
            currentThread = thread
            if let index = threads.firstIndex(where: { $0.id == thread.id }) {
                threads[index] = thread
            }
        }
    }

    private func applyLatestJobId(_ jobId: String) {
        let trimmed = jobId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        lastJobId = trimmed
        if var thread = currentThread {
            thread.latestJobId = trimmed
            currentThread = thread
        }
        if let currentThread, let index = threads.firstIndex(where: { $0.id == currentThread.id }) {
            threads[index].latestJobId = trimmed
        }
    }

    private func hydrateDraft(from memory: AIWorkspaceAPI.ProjectMemory) {
        let rows = memory.latestGddRows ?? []
        if let title = memory.title ?? Self.memoryRowValue(rows, matching: ["title", "название"]) {
            draft.title = title
        }
        if let genre = memory.genre ?? Self.memoryRowValue(rows, matching: ["genre", "жанр"]) {
            draft.genre = genre
        }
        if let scale = Self.memoryRowValue(rows, matching: ["scale", "масштаб"]) {
            draft.scale = scale
        }
        if let style = Self.memoryRowValue(rows, matching: ["visual style", "style", "визуальный стиль"]) {
            draft.style = style
        } else if let theme = memory.theme {
            draft.style = theme
        }
        if let monetization = Self.memoryRowValue(rows, matching: ["monetization", "монетизация"]) {
            draft.monetization = monetization
        }
        if contentSubcategory == "npcs" || contentSubcategory == "roast_npc" {
            draft.npcTheme = memory.theme ?? draft.npcTheme
            if let mechanics = Self.memoryRowValue(rows, matching: ["mechanics", "механики"]) {
                draft.npcMechanics = mechanics.split(separator: ",").map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            }
            if let systems = Self.memoryRowValue(rows, matching: ["systems", "системы"]) {
                draft.npcSystems = systems.split(separator: ",").map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            }
        }
    }

    private static func memoryRowValue(_ rows: [AIWorkspaceAPI.RemoteGDDRow], matching needles: [String]) -> String? {
        rows.first { row in
            let key = row.key.lowercased()
            return needles.contains { key.contains($0.lowercased()) }
        }?.value
    }

    func selectThread(_ thread: ChatThread?) {
        currentThread = thread
        generationStages = []
        activePreview = nil
        lastPreview = nil
        hasMoreMessages = false
        oldestMessageCursor = nil
        presetsVisible = true
        draft = ProjectDraft.makeDefault(for: projectKind)
        applyThreadContext(thread)
        restoreLastGenerationIfAvailable()

        if let thread {
            messages = [welcomeMessage()]
            loadRemoteMessages(for: thread.id)
        } else {
            messages = []
        }
    }

    private func loadRemoteMessages(for threadId: String) {
        Task {
            do {
                let response = try await AIWorkspaceAPI.fetchThreadMessages(threadId: threadId)
                applyProjectMemory(response.projectMemory)
                guard !response.messages.isEmpty else { return }
                let restored = mapRemoteMessages(response.messages)
                // Keep welcome message at the top so presets remain visible
                let welcome = welcomeMessage()
                messages = [welcome] + restored
                restoreLastGenerationIfAvailable()
                // If chat has history, hide presets (user already interacted)
                presetsVisible = restored.allSatisfy { $0.role == .assistant }
                hasMoreMessages = response.hasMore ?? false
                oldestMessageCursor = response.oldestCursor
            } catch {
                // Local welcome message remains; server history unavailable
            }
        }
    }

    /// Resume a cloud-restored session: set thread and fetch messages from the API.
    func resumeFromRemoteThread(threadId: String, title: String) {
        let thread = ChatThread(
            id: threadId,
            title: title,
            updatedAt: Date(),
            promptHint: title,
            type: ThreadType.from(projectKind),
            projectKindRaw: promptProjectKind,
            contentSubcategory: contentSubcategory,
            latestJobId: lastJobId,
            projectMemory: threadProjectMemory
        )
        if !threads.contains(where: { $0.id == threadId }) {
            threads.insert(thread, at: 0)
        }
        currentThread = thread

        Task {
            do {
                let response = try await AIWorkspaceAPI.fetchThreadMessages(threadId: threadId)
                applyProjectMemory(response.projectMemory)
                guard !response.messages.isEmpty else { return }
                let restored = mapRemoteMessages(response.messages)
                messages = restored
                restoreLastGenerationIfAvailable()
                hasMoreMessages = response.hasMore ?? false
                oldestMessageCursor = response.oldestCursor
                ChatHistoryStore.shared.saveMessages(restored, for: threadId)
            } catch {
                // Server unreachable; keep welcome message
            }
        }
    }

    func loadOlderMessages() {
        guard !isLoadingOlderMessages, hasMoreMessages,
              let cursor = oldestMessageCursor,
              let threadId = currentThread?.id else { return }
        isLoadingOlderMessages = true
        Task {
            defer { isLoadingOlderMessages = false }
            do {
                let response = try await AIWorkspaceAPI.fetchThreadMessages(
                    threadId: threadId, before: cursor
                )
                guard !response.messages.isEmpty else {
                    hasMoreMessages = false
                    return
                }
                let older = mapRemoteMessages(response.messages)
                let existingIds = Set(messages.map(\.id))
                let unique = older.filter { !existingIds.contains($0.id) }
                messages.insert(contentsOf: unique, at: 0)
                hasMoreMessages = response.hasMore ?? false
                oldestMessageCursor = response.oldestCursor
            } catch {
                // Silently keep current messages
            }
        }
    }

    private func mapRemoteMessages(_ remote: [AIWorkspaceAPI.RemoteThreadMessage]) -> [ChatMessage] {
        let formatter = ISO8601DateFormatter()
        return remote.map { msg in
            let role: ChatMessage.Role = msg.role == "user" ? .user : .assistant
            let gddRows = msg.gddRows?.map { ($0.key, $0.value) }
            let message = ChatMessage(
                id: msg.id,
                role: role,
                content: msg.content,
                quickReplies: msg.quickReplies,
                gddRows: gddRows,
                createdAt: formatter.date(from: msg.createdAt) ?? Date()
            )
            return sanitizedChatMessageForDisplay(message)
        }
    }

    func sendText(_ text: String) {
        send(text, quickReply: nil, inputMode: "text", attachmentKind: nil)
    }

    func sendSkipInterview(_ text: String) {
        send(text, quickReply: nil, inputMode: "text", attachmentKind: nil, forceSkipInterview: true)
    }

    func restoreMessages(_ restored: [ChatMessage]) {
        guard !restored.isEmpty else { return }
        messages = restored.map(sanitizedChatMessageForDisplay)
        restoreLastGenerationIfAvailable()
    }

    func restorePreviewFromJob(jobId: String, openWhenReady: Bool = false) {
        applyLatestJobId(jobId)
        restoreGenerationJob(jobId: jobId, openWhenReady: openWhenReady)
    }

    func replaceWelcome(context: String, isVoice: Bool) {
        // Session 001 (Track 1) — clothing subcategory delegates to welcomeMessage()
        // which emits the compliance banner + T-Shirt/Classic Shirt/Classic Pants/
        // Full Outfit picker. Without this, the generic "Let's build a Content >
        // Clothing & Outfits…" welcome with Hoodie/Jacket/Dress quick-replies fires
        // on first entry and confuses the user.
        if contentSubcategory == "clothing" {
            messages = [welcomeMessage()]
            return
        }
        let content: String
        if contentSubcategory == "audio" {
            let modeHint = isVoice
                ? "Tap the mic button and describe it!"
                : "Describe the audio you want — music, sound effects, or ambient sounds for your game experience."
            content = modeHint
        } else {
            let modeHint = isVoice
                ? "Tap the mic button and tell me what you want!"
                : "Type your idea below and let's get started!"
            content = "Let's build a \(context) project together! Describe what you have in mind — style, mechanics, theme — and I'll turn it into a game-ready plan. \(modeHint)"
        }
        messages = [
            ChatMessage(
                id: "welcome",
                role: .assistant,
                content: content,
                quickReplies: starterReplies,
                gddRows: nil,
                createdAt: Date()
            )
        ]
    }

    /// Session #095 — user confirmed weapon colors in WeaponColorPickerBubble.
    /// Stores hex strings on `draft` so generationMetadata() emits primaryColor/accentColor/glowColor,
    /// then sends a short assistant-facing confirmation so the interview advances to Turn 3.
    func confirmWeaponColors(primary: String, accent: String, glow: String) {
        draft.weaponPrimaryColor = primary
        draft.weaponAccentColor = accent
        draft.weaponGlowColor = glow
        let summary = "Colors locked in — primary \(primary.uppercased()), accent \(accent.uppercased()), glow \(glow.uppercased())."
        send(summary, quickReply: nil, inputMode: "text", attachmentKind: nil)
    }

    // Session 001 (Track 1): builds the Marketplace handoff context from the most
    // recent completed clothing job. Sets @Published `marketplaceHandoffContext`
    // — ChatView's `.sheet(item:)` reacts and presents MarketplaceHandoffView.
    // Track 3: also supports pet_3d jobs — petStudioBlock takes precedence over
    // layered/classic clothing blocks when petSpeciesType is set.
    func openMarketplaceHandoff() {
        // Track 3 Phase 2 (Blocky Pet): single .rbxm with primitive Parts +
        // Motor6D rig + pre-baked animations. Simpler handoff than 3D path —
        // no FBX, no asset upload, just one .rbxm to drag into Workspace.
        if let species = draft.petSpecies, draft.petMode == "blocky" {
            let petJob = lastFailedGenerationJob
            let rbxmURL = petJob?.artifacts
                .first(where: { $0.metadata?.isBlockyPet == true && ($0.type == "rbxm" || $0.name.hasSuffix(".rbxm")) })
                .flatMap { ($0.downloadUrl ?? $0.url).flatMap(URL.init(string:)) }
                ?? petJob?.artifacts.first(where: { $0.type == "rbxm" }).flatMap { ($0.downloadUrl ?? $0.url).flatMap(URL.init(string:)) }
            let partCount = petJob?.metadata?.partCount ?? 0
            let animationCount = petJob?.artifacts.filter { $0.metadata?.isPetAnimation == true }.count ?? 0
            let rarity = petJob?.metadata?.petRarity
            marketplaceHandoffContext = MarketplaceHandoffContext(
                clothingType: "pet_\(species)",
                title: draft.title,
                suggestedDescription: "AI-generated Roblox blocky pet (\(species)) — Motor6D rig, follow/leveling/rarity built in.",
                suggestedTags: ["pet", "blocky", species, "ai", "ugc"],
                suggestedPriceRobux: 0,
                robloxAssetId: nil,
                textureDownloadURL: nil,
                meshFbxURL: nil,
                meshGlbURL: nil,
                validationWarnings: [],
                petRbxmURL: rbxmURL,
                petSpeciesType: species,
                petRarity: rarity,
                isBlockyPet: true,
                blockyPetRbxmURL: rbxmURL,
                blockyAnimationCount: animationCount,
                blockyPartCount: partCount
            )
            return
        }
        // Track 3 (3D Pet pipeline): if the user has petSpecies+petMode set,
        // route to a pet-specific handoff context with per-stage download URLs.
        if let species = draft.petSpecies, draft.petMode == "evolution_3d" {
            let petJob = lastFailedGenerationJob
            let warnings = petJob?.stages?
                .first(where: { $0.id == "validate_pet" })?
                .notes?.filter { $0.contains("MB") && ($0.lowercased().contains("exceed") || $0.lowercased().contains("decimate")) }
                ?? []
            let stageArtifacts = (petJob?.artifacts ?? []).filter { $0.metadata?.isPetMesh == true || $0.metadata?.isPetRiggedFbx == true }
            func stageURL(_ idx: Int, suffix: String) -> URL? {
                stageArtifacts
                    .first(where: { $0.metadata?.petStageIndex == idx && ($0.type.contains(suffix)) })
                    .flatMap { ($0.downloadUrl ?? $0.url).flatMap(URL.init(string:)) }
            }
            let rbxmURL = petJob?.artifacts
                .first(where: { $0.metadata?.isPetEvolution == true })
                .flatMap { ($0.downloadUrl ?? $0.url).flatMap(URL.init(string:)) }
            let rarity = petJob?.metadata?.petRarity
            marketplaceHandoffContext = MarketplaceHandoffContext(
                clothingType: "pet_\(species)",
                title: draft.title,
                suggestedDescription: "AI-generated Roblox 3D pet (\(species)) — 3 evolution stages, follow/leveling/rarity built in.",
                suggestedTags: ["pet", species, "ai", "ugc"],
                suggestedPriceRobux: 0,
                robloxAssetId: nil,
                textureDownloadURL: nil,
                meshFbxURL: nil,
                meshGlbURL: nil,
                validationWarnings: warnings,
                petStage1FbxURL: stageURL(1, suffix: "fbx"),
                petStage2FbxURL: stageURL(2, suffix: "fbx"),
                petStage3FbxURL: stageURL(3, suffix: "fbx"),
                petStage1GlbURL: stageURL(1, suffix: "glb"),
                petStage2GlbURL: stageURL(2, suffix: "glb"),
                petStage3GlbURL: stageURL(3, suffix: "glb"),
                petRbxmURL: rbxmURL,
                petSpeciesType: species,
                petRarity: rarity
            )
            return
        }
        let clothingType = draft.clothingType ?? {
            if let job = lastFailedGenerationJob, job.metadata?.isTShirt == true { return "t_shirt" }
            return "classic_shirt"
        }()
        let suggestedTags: [String] = {
            switch clothingType {
            case "t_shirt": return ["tshirt", "graphic", "ai", "ugc"]
            case "classic_shirt": return ["shirt", "fashion", "ai", "ugc"]
            case "classic_pants": return ["pants", "fashion", "ai", "ugc"]
            case "classic_outfit": return ["outfit", "shirt", "pants", "ai", "ugc"]
            default: return ["ai", "ugc"]
            }
        }()
        let description = "AI-designed Roblox \(clothingType.replacingOccurrences(of: "_", with: " ")) — generated with the Roblox Gold app. Pure original artwork, no IP."
        let recentJob = (currentThread?.id).flatMap { _ in lastFailedGenerationJob }
        let robloxAssetId: Int64? = recentJob?.metadata.flatMap { md in
            md.tshirtRobloxAssetId ?? md.shirtRobloxAssetId ?? md.pantsRobloxAssetId
        }
        let textureURL: URL? = recentJob?.artifacts
            .first(where: { $0.metadata?.isTShirtGraphic == true || $0.metadata?.isShirtTexture == true || $0.metadata?.isPantsTexture == true })
            .flatMap { ($0.downloadUrl ?? $0.url).flatMap(URL.init(string:)) }
        // Track 2 Phase 4 — pull layered mesh artifacts so the sheet can show
        // direct download buttons next to each Studio AFT step.
        let meshFbxURL: URL? = recentJob?.artifacts
            .first(where: { $0.type == "fbx" })
            .flatMap { ($0.downloadUrl ?? $0.url).flatMap(URL.init(string:)) }
        let meshGlbURL: URL? = recentJob?.artifacts
            .first(where: { $0.type == "glb" || $0.type == "model/gltf-binary" })
            .flatMap { ($0.downloadUrl ?? $0.url).flatMap(URL.init(string:)) }
        let validationWarnings = recentJob?.stages?
            .first(where: { $0.id == "validate_layered" })?
            .notes?.filter { $0.lowercased().contains("mb") && ($0.lowercased().contains("over") || $0.lowercased().contains("borderline") || $0.lowercased().contains("exceed")) }
            ?? []
        marketplaceHandoffContext = MarketplaceHandoffContext(
            clothingType: clothingType,
            title: draft.title,
            suggestedDescription: description,
            suggestedTags: suggestedTags,
            suggestedPriceRobux: clothingType == "t_shirt" ? 5 : 10,
            robloxAssetId: robloxAssetId,
            textureDownloadURL: textureURL,
            meshFbxURL: meshFbxURL,
            meshGlbURL: meshGlbURL,
            validationWarnings: validationWarnings
        )
    }

    func sendQuickReply(_ option: String) {
        presetsVisible = false
        // Smart Stub: feature vote
        if option == "🗳️ I want this feature!", let stub = activeSmartStub {
            Task {
                await AIWorkspaceAPI.voteForFeature(
                    feature: stub.category ?? "unknown",
                    prompt: messages.last(where: { $0.role == .user })?.content
                )
            }
            appendAssistantMessage("Thanks for voting! 🙏 We'll prioritize this feature. Your feedback directly shapes our roadmap!")
            activeSmartStub = nil
            return
        }
        activeSmartStub = nil

        // Smart Stub navigation buttons — close chat & switch tab
        if let navTab = Self.stubNavigationTab(for: option) {
            NotificationCenter.default.post(
                name: .smartStubNavigate,
                object: nil,
                userInfo: ["tab": navTab.rawValue, "action": option]
            )
            return
        }

        if Self.isOpenPreviewCommand(normalizedQuickReply(option)) {
            reopenLastPreview()
            return
        }
        if Self.isViewJobsCommand(normalizedQuickReply(option)) {
            openLatestBackgroundGeneration()
            return
        }
        if option == "Switch to Interview" || option == "К интервью" || option == "Перейти к интервью" {
            setFlow(.smartInterview)
            return
        }
        if option == "Switch to Quick" || option == "Switch to Quick Generate" {
            setFlow(.quickGenerate)
            return
        }
        if option == "Suggest something" {
            send("Suggest me a cool idea based on current current gaming trends", quickReply: option, inputMode: "text", attachmentKind: nil)
            return
        }
        let normalized = normalizedQuickReply(option)
        if handleFailedGenerationRepairQuickReply(option: option, normalized: normalized) {
            return
        }
        if Self.isRetryCommand(normalized) {
            if shouldRetryGenerationFromLastAssistantMessage() {
                generateFromCurrentPlan()
                return
            }
            if retryPendingChatRequest() {
                return
            }
        }
        if Self.isStartOverCommand(normalized) {
            resetInterview()
            return
        }
        if normalized == "generate yourself" || normalized == "сгенерируй сам"
            || normalized == "generate for me" || normalized == "реши за меня" {
            sendSkipInterview("Generate the best version using current current gaming trends and best practices. Fill in all missing details automatically.")
            return
        }
        if handleNpcVisualPipelineChoice(normalized) {
            return
        }
        if handleFurniturePathChoice(normalized) {
            return
        }
        if handlePetPathChoice(normalized) {
            return
        }
        if normalized == "generate!" || normalized == "generate now"
            || normalized == "генерируй!" || normalized == "генерировать"
            || normalized == "всё супер, генерируй!" || normalized == "go" || normalized == "create it" {
            // Clothing 2D/3D mode gate now lives inside generateFromCurrentPlan()
            // so every entry point (Quick Generate button, confirmGeneration,
            // retry/repair paths) routes through it. No inline check needed here.
            generateFromCurrentPlan()
            return
        }
        // Session #095 follow-up: weapon subcategory quickReply → set weaponType metadata.
        // Without this the backend defaults to "melee" → sword icon, sword sound, sword anim.
	        if contentSubcategory == "weapons" {
	            switch normalized {
	            case "melee sword":                  draft.weaponType = "melee"
	            case "gun / sci-fi", "gun/sci-fi":   draft.weaponType = "ranged"
	            case "staff / magic", "staff/magic": draft.weaponType = "magic"
	            case "shield / defense", "shield/defense": draft.weaponType = "defense"
	            case "grenade / throwable", "grenade/throwable": draft.weaponType = "throwable"
	            default: break  // "Decide for me" / free text → leave for backend to classify.
	            }
	        }
	        if contentSubcategory == "items" {
	            switch normalized {
	            case "key / unlock", "key/unlock":
	                draft.itemType = "key"; draft.itemUseMode = "permanent"; draft.itemEffect = "unlock_door"; draft.itemTagName = "LockedDoor"
	            case "potion / buff", "potion/buff", "consumable":
	                draft.itemType = "potion"; draft.itemUseMode = "consumable"; draft.itemEffect = "random_boost"; draft.itemEffectDuration = "10"; draft.itemCooldown = "1"
	            case "coin / currency", "coin/currency", "collectible":
	                draft.itemType = "coin"; draft.itemUseMode = "consumable"; draft.itemEffect = "add_currency"; draft.itemCurrencyName = "Coins"; draft.itemEffectValue = "10"
	            case "medkit / heal", "medkit/heal":
	                draft.itemType = "medkit"; draft.itemUseMode = "consumable"; draft.itemEffect = "heal_full_shield"; draft.itemEffectDuration = "5"; draft.itemCooldown = "1"
	            case "resource / material", "resource/material", "tool / pickaxe", "tool/pickaxe":
	                draft.itemType = "resource"; draft.itemUseMode = "permanent"; draft.itemEffect = "add_resource"; draft.itemResourceName = "Resource"; draft.itemEffectValue = "1"
	            case "other tool":
	                draft.itemType = "other"; draft.itemUseMode = "toggle"; draft.itemEffect = "custom"; draft.itemCooldown = "1"
	            default: break
	            }
	        }
        if contentSubcategory == "vehicles" {
            switch normalized {
            case "car", "sports car", "truck / jeep", "truck/jeep", "truck", "jeep":
                draft.vehicleType = "car"
            case "motorcycle", "motorbike":
                draft.vehicleType = "motorcycle"
            case "boat":
                draft.vehicleType = "boat"
            case "plane", "airplane":
                draft.vehicleType = "plane"
            case "helicopter", "heli":
                draft.vehicleType = "helicopter"
            case "tank":
                draft.vehicleType = "tank"
            case "spaceship", "space ship", "sci-fi hover", "sci fi hover", "hover":
                draft.vehicleType = "spaceship"
            case "bicycle", "bike":
                draft.vehicleType = "bicycle"
            case "bus":
                draft.vehicleType = "bus"
            default:
                break
            }
        }
	        if contentSubcategory == "npcs" {
            switch normalized {
            case "patrol guard":     draft.npcRole = "guard"; draft.npcBehaviorMode = "patrol"
            case "enemy attacker":   draft.npcRole = "enemy"; draft.npcBehaviorMode = "chase_attack"
            case "merchant":         draft.npcRole = "merchant"; draft.npcBehaviorMode = "stationary"
            case "quest giver":      draft.npcRole = "quest_giver"; draft.npcBehaviorMode = "stationary"
            case "dialogue npc":     draft.npcRole = "dialogue"; draft.npcBehaviorMode = "stationary"
            case "companion":        draft.npcRole = "companion"; draft.npcBehaviorMode = "follow"
            case "boss":             draft.npcRole = "boss"; draft.npcBehaviorMode = "chase_attack"
            default: break
            }
        }
        // Session 001 (Track 1): clothing-type picker. Maps welcome-message tap
        // → draft.clothingType so generationMetadata sends `clothingType` upstream
        // and backend routes to the correct manifest (T-Shirt vs Shirt vs Pants vs Outfit).
        // Also intercepts the LLM clothing_interview picker ("2D Classic (fast)" /
        // "3D Layered (premium)" / "Decide for me" from promptCatalog.ts) so a user who
        // answers the LLM still gets a proper clothingType routed to backend — otherwise
        // pipeline falls back to the 9-stage character_3d default with a full-character
        // concept image instead of a 2-3 stage clothing texture flow.
        if contentSubcategory == "clothing" {
            switch normalized {
            // 2026-05-19 UX: generic item picks set provisional clothingType WITHOUT
            // a mode — the actual mode (classic_2d vs layered_3d) is chosen at the
            // end of the interview via the "2D Classic / 3D Layered" quick-reply.
            // For T-Shirt and Pants the type is unambiguous; for Shirt/Outfit it
            // defaults to classic_shirt/classic_outfit but the mode-pick at the end
            // can promote them to layered_shirt etc.
            case "t-shirt", "tshirt":
                draft.clothingType = "t_shirt"
                draft.clothingMode = "classic_2d"
            case "classic shirt", "shirt":
                draft.clothingType = "classic_shirt"
                draft.clothingMode = nil  // let user pick mode after interview
            case "classic pants", "pants":
                draft.clothingType = "classic_pants"
                draft.clothingMode = nil
            case "full outfit", "outfit", "full outfit (shirt + pants)":
                draft.clothingType = "classic_outfit"
                draft.clothingMode = nil
            case "jacket":
                draft.clothingType = "layered_jacket"
                draft.clothingMode = nil
            case "sweater":
                draft.clothingType = "layered_sweater"
                draft.clothingMode = nil
            case "dress":
                draft.clothingType = "layered_dress"
                draft.clothingMode = nil
            // Track 2 — Layered 3D picks. Set both clothingType (for AccessoryType
            // routing) and clothingMode="layered_3d" (so backend enters mesh pipeline).
            case "🧥 3d jacket", "3d jacket", "jacket":
                draft.clothingType = "layered_jacket"
                draft.clothingMode = "layered_3d"
            case "🧶 3d sweater", "3d sweater", "sweater":
                draft.clothingType = "layered_sweater"
                draft.clothingMode = "layered_3d"
            case "👗 3d dress", "3d dress", "dress":
                draft.clothingType = "layered_dress"
                draft.clothingMode = "layered_3d"
            case "2d classic (fast)", "2d classic", "2д классик",
                 "✨ generate as 2d classic", "generate as 2d classic":
                // Final 2D pick — promote layered_* types back to classic_*.
                if let ct = draft.clothingType, ct.hasPrefix("layered_") {
                    let kind = String(ct.dropFirst("layered_".count))
                    draft.clothingType = (kind == "jacket" || kind == "sweater" || kind == "dress")
                        ? "classic_shirt"  // jackets/sweaters/dresses → fall back to closest classic
                        : "classic_\(kind)"
                }
                if draft.clothingType == nil { draft.clothingType = "classic_outfit" }
                draft.clothingMode = "classic_2d"
                generateFromCurrentPlan()
                return
            case "3d layered (premium)", "3d layered",
                 "🧥 generate as 3d layered", "generate as 3d layered":
                // Final 3D pick — promote classic_* types up to layered_*.
                if let ct = draft.clothingType, ct.hasPrefix("classic_") {
                    let kind = String(ct.dropFirst("classic_".count))
                    draft.clothingType = "layered_\(kind == "outfit" ? "shirt" : kind)"
                }
                draft.clothingMode = "layered_3d"
                generateFromCurrentPlan()
                return
            case "decide for me":
                if draft.clothingType == nil { draft.clothingType = "classic_shirt" }
                if draft.clothingMode == nil { draft.clothingMode = "classic_2d" }
                // If user has been through clothing interview, default-pick fires generation.
                if contentSubcategory == "clothing" {
                    generateFromCurrentPlan()
                    return
                }
            case "got it":
                // Compliance banner dismiss — persist so future clothing chats don't repeat it
                UserDefaults.standard.set(true, forKey: "clothing.compliance.dismissed")
                appendAssistantMessage("Got it. Pick a type to continue.")
                return
            default: break
            }
        }
        // Session 001 (Track 1) — completed clothing generation surfaces a
        // "📦 Publish to Marketplace" quick reply. Tap opens the handoff sheet.
        if normalized == "📦 publish to marketplace" || normalized == "publish to marketplace" {
            openMarketplaceHandoff()
            return
        }
        // Track 3 (Pet pipeline): pet-species picker. Default to Phase 2
        // BLOCKY mode (fast, free, native Roblox style). User can opt into
        // Phase 1 3D photoreal mesh path explicitly via "🐾 3D ..." chips.
        if contentSubcategory == "pets" {
            switch normalized {
            // Blocky (default — Phase 2)
            case "🎲 dog", "blocky dog", "🐕 dog", "dog", "🐕":
                draft.petSpecies = "dog"
                draft.petMode = "blocky"
            case "🎲 cat", "blocky cat", "🐈 cat", "cat", "🐈":
                draft.petSpecies = "cat"
                draft.petMode = "blocky"
            case "🎲 dragon", "blocky dragon", "🐉 dragon", "dragon", "🐉":
                draft.petSpecies = "dragon"
                draft.petMode = "blocky"
            case "🎲 unicorn", "blocky unicorn", "🦄 unicorn", "unicorn", "🦄":
                draft.petSpecies = "unicorn"
                draft.petMode = "blocky"
            case "🎲 robot", "blocky robot", "🤖 robot", "robot", "🤖":
                draft.petSpecies = "robot"
                draft.petMode = "blocky"
            case "🎲 custom", "blocky custom", "✨ custom", "custom", "fantasy creature", "cute companion":
                draft.petSpecies = "fantasy"
                draft.petMode = "blocky"
            case "robot pet":
                draft.petSpecies = "robot"
                draft.petMode = "blocky"
            // 3D Premium (Phase 1 — opt-in, requires TRIPO_API_KEY for quadrupeds)
            case "🐾 3d dog", "3d dog":
                draft.petSpecies = "dog"
                draft.petMode = "evolution_3d"
            case "🐾 3d cat", "3d cat":
                draft.petSpecies = "cat"
                draft.petMode = "evolution_3d"
            case "🐾 3d dragon", "3d dragon":
                draft.petSpecies = "dragon"
                draft.petMode = "evolution_3d"
            case "🐾 3d unicorn", "3d unicorn":
                draft.petSpecies = "unicorn"
                draft.petMode = "evolution_3d"
            case "🐾 3d robot", "3d robot":
                draft.petSpecies = "robot"
                draft.petMode = "evolution_3d"
            case "🐾 3d custom", "3d custom":
                draft.petSpecies = "fantasy"
                draft.petMode = "evolution_3d"
            default: break
            }
        }
        // Killer Feature #2: Smart NPC Roast & Chat — quickReply maps a personality preset
        // into draft.roastPersonality. The 6-turn smart-interview still asks role/look/etc;
        // backend reads `npcMode=roast` + `roastPersonality` and emits Config.Roast with
        // matching SystemPrompt + fallback lines. "Custom personality..." sends through as
        // free-text so the LLM asks the user to describe their own vibe.
        if contentSubcategory == "roast_npc" {
            switch normalized {
            case "sigma chad":     draft.roastPersonality = "sigma_chad"
            case "skibidi":        draft.roastPersonality = "skibidi"
            case "gen-alpha", "gen alpha", "genalpha": draft.roastPersonality = "gen_alpha"
            case "gym bro":        draft.roastPersonality = "gym_bro"
            case "mom friend":     draft.roastPersonality = "mom_friend"
            case "custom personality...", "custom personality":
                draft.roastPersonality = "custom"
            case "roast pet":         draft.npcRole = "companion"; draft.npcBehaviorMode = "follow"
            case "roast enemy":       draft.npcRole = "enemy"; draft.npcBehaviorMode = "chase_attack"
            case "roast observer":    draft.npcRole = "dialogue"; draft.npcBehaviorMode = "stationary"
            default: break
            }
        }
        send(option, quickReply: option, inputMode: "text", attachmentKind: nil)
    }

    func selectExpertiseLevelFromChat(_ level: ExpertiseLevel) {
        UserDefaults.standard.set(level.rawValue, forKey: "expertiseLevel")
        let isRu = preferredResponseLanguageCode() == "ru"
        let label: String
        switch level {
        case .beginner: label = isRu ? "Новичок" : "Beginner"
        case .advanced: label = isRu ? "Продвинутый" : "Advanced"
        case .developer: label = isRu ? "Разработчик" : "Developer"
        }
        let content = isRu
            ? "Уровень интервью: \(label). Следующие вопросы и GDD будут подстроены под этот режим."
            : "Interview level set to \(label). The next questions and GDD will adapt to this mode."
        messages.append(
            ChatMessage(
                id: UUID().uuidString,
                role: .assistant,
                content: content,
                quickReplies: nil,
                gddRows: nil,
                createdAt: Date()
            )
        )
    }

    private var needsNpcVisualPipelineChoice: Bool {
        (contentSubcategory == "npcs" || contentSubcategory == "roast_npc") && draft.npcVisualPipeline == nil
    }

    private func npcVisualPipelineChoiceReplies() -> [String] {
        ["Animated R15 NPC (Recommended)", "Static 3D Mesh NPC", "Moving 3D Mesh NPC (Experimental)"]
    }

    private func appendNpcVisualPipelineChoiceMessage() {
        let isRu = preferredResponseLanguageCode() == "ru"
        messages.append(
            ChatMessage(
                id: UUID().uuidString,
                role: .assistant,
                content: isRu
                    ? "Выберите режим сборки NPC. Анимированный R15 (рекомендовано) создаёт настоящий Humanoid rig как у импортированных NPC: виден до Play, стабильно патрулирует, преследует, дерётся, а конечности корректно сгибаются. Статичный 3D Mesh оставляет одобренный AI-меш закреплённым как стабильную витрину. Движущийся 3D Mesh экспериментальный: он следует за невидимым корнем одним куском и на некоторых ассетах всё ещё может расходиться или съезжать."
                    : "Choose the NPC build mode. Animated R15 (recommended) builds a real Humanoid rig like imported NPC models: visible before Play, stable patrol/chase/fighting, and bending limbs. Static 3D Mesh keeps the approved AI mesh anchored as a stable display shell. Moving 3D Mesh is experimental: it follows an invisible root part as one piece and can still split or drift on some assets.",
                quickReplies: npcVisualPipelineChoiceReplies(),
                gddRows: nil,
                createdAt: Date()
            )
        )
    }

    private func clearNpcVisualPipelineChoiceQuickReplies() {
        let choiceReplies = Set(npcVisualPipelineChoiceReplies().map { $0.lowercased() })
        messages = messages.map { message in
            guard
                message.role == .assistant,
                let quickReplies = message.quickReplies,
                !quickReplies.isEmpty,
                quickReplies.allSatisfy({ choiceReplies.contains($0.lowercased()) })
            else {
                return message
            }
            return ChatMessage(
                id: message.id,
                role: message.role,
                content: message.content,
                quickReplies: nil,
                gddRows: message.gddRowTuples,
                createdAt: message.createdAt,
                audioURL: message.audioURL,
                imageURL: message.imageURL,
                localImageKey: message.localImageKey,
                weaponColors: message.weaponColors
            )
        }
    }

    private func handleNpcVisualPipelineChoice(_ normalized: String) -> Bool {
        guard contentSubcategory == "npcs" || contentSubcategory == "roast_npc" else { return false }
        guard draft.npcVisualPipeline == nil else { return false }
        switch normalized {
        case "animated r15 npc (recommended)", "animated r15 npc", "r15 npc", "animated r15", "safest r15 npc", "safe r15 npc", "r15", "р15", "анимированный r15", "как нпс", "как файл нпс", "rig npc":
            draft.npcVisualPipeline = "asset_template_v1"
            draft.npcMeshMotionMode = nil
            clearNpcVisualPipelineChoiceQuickReplies()
            appendAssistantMessage(preferredResponseLanguageCode() == "ru"
                ? "Зафиксировал: анимированный R15 NPC. Финальный RBXM пойдёт по R15 rig/accessory path, не через Meshy: стабильное движение плюс аксессуары и props под роль."
                : "Locked: Animated R15 NPC. The final RBXM uses the R15 rig/accessory path, not Meshy, with stable movement plus role-specific accessories and props.")
            generateFromCurrentPlan()
            return true
        case "moving 3d mesh npc (experimental)", "moving 3d mesh npc (recommended)", "moving 3d mesh npc", "3d mesh npc", "3d mesh", "mesh npc", "best visual 3d", "лучший 3д", "3д меш", "3д mesh", "движущийся 3д", "ходящий 3д":
            draft.npcVisualPipeline = "mesh_asset_v1"
            draft.npcMeshMotionMode = "follow_root_visual"
            clearNpcVisualPipelineChoiceQuickReplies()
            appendAssistantMessage(preferredResponseLanguageCode() == "ru"
                ? "Зафиксировал: движущийся 3D Mesh NPC (экспериментально). Я снова попробую сгенерированную визуальную оболочку, но это не настоящий R15 rig и режим может быть менее стабильным, чем анимированный R15."
                : "Locked: Moving 3D Mesh NPC (experimental). I will try the generated visual shell again, but this mode is not a true R15 rig and can be less stable than Animated R15.")
            generateFromCurrentPlan()
            return true
        case "static 3d mesh npc", "static 3d mesh", "safe 3d mesh", "статичный 3д", "безопасный 3д":
            draft.npcVisualPipeline = "mesh_asset_v1"
            draft.npcMeshMotionMode = "static_visual_shell"
            clearNpcVisualPipelineChoiceQuickReplies()
            appendAssistantMessage(preferredResponseLanguageCode() == "ru"
                ? "Зафиксировал: статичный 3D Mesh NPC. Сделаю упор на стабильную детальную визуальную оболочку, которая не отделяется от скрытого rig, с лёгким idle-движением, чтобы модель не казалась замороженной."
                : "Locked: Static 3D Mesh NPC. I will prioritize a stable detailed visual shell that will not split from the hidden rig (with subtle idle bobble so it does not feel frozen).")
            generateFromCurrentPlan()
            return true
        default:
            return false
        }
    }

    // MARK: Furniture path-selector (post-Generate gate)
    //
    // After the Furniture chat hits "Generate!" (either via Smart Interview action=generating
    // or via Quick Generate / direct chip), we don't dispatch the job immediately — instead
    // the assistant posts a two-button bubble asking whether to build the prop from primitive
    // Roblox Parts (blocky, with LLM verify+retry) or via the AI mesh provider (2D concept
    // approval → mesh provider). The user's tap is routed through `handleFurniturePathChoice`,
    // which sets the explicit build mode and resumes generation.

    private var needsFurniturePathChoice: Bool {
        contentSubcategory == "furniture" && (draft.furnitureBuildMode == nil || draft.furnitureBuildMode?.isEmpty == true)
    }

    // 2026-05-20: clothing chat gate before generation — user must lock in a
    // 2D Classic vs 3D Layered mode. Items with no 2D analogue (Jacket /
    // Sweater / Dress map to layered_*) skip this picker because their mode
    // is implicit. Items WITH both modes (T-Shirt is fixed 2D, Shirt / Pants /
    // Outfit can be either) gate here.
    private var needsClothingModeChoice: Bool {
        guard contentSubcategory == "clothing" else { return false }
        guard (draft.clothingMode ?? "").isEmpty else { return false }
        let ct = draft.clothingType ?? ""
        // Only Shirt / Pants / Outfit have both 2D classic AND 3D layered
        // variants worth choosing between. T-Shirt is always classic_2d, and
        // jackets/sweaters/dresses are layered-only (Roblox has no 2D versions
        // of those AccessoryTypes).
        return ct == "classic_shirt" || ct == "classic_pants" || ct == "classic_outfit"
    }

    private func appendClothingModeChoiceMessage() {
        messages.append(
            ChatMessage(
                id: UUID().uuidString,
                role: .assistant,
                content: "How should I produce it?\n\n• **2D Classic** — flat 585×559 wrap template, uploads to Roblox in seconds via web Marketplace. Works today.\n• **3D Layered** — real 3D mesh accessory, 2-5 min via Meshy, finished in Studio Accessory Fitting Tool. Needs UGC Program approval to publish.",
                quickReplies: ["✨ Generate as 2D Classic", "🧥 Generate as 3D Layered", "Decide for me"],
                gddRows: nil,
                createdAt: Date()
            )
        )
    }

    private func furniturePathChoiceReplies() -> [String] {
        ["Blocky Parts (fast preview)", "AI 3D Mesh (detailed)"]
    }

    private func appendFurniturePathChoiceMessage() {
        let isRu = preferredResponseLanguageCode() == "ru"
        messages.append(
            ChatMessage(
                id: UUID().uuidString,
                role: .assistant,
                content: isRu
                    ? "Выберите путь сборки. Blocky Parts собирает .rbxm из примитивов Roblox: LLM сверяет результат с брифом и пересобирает при несоответствии, плюс ты получишь блочное превью один-в-один с тем, что увидишь в Studio. AI 3D Mesh идёт через 2D-апрув концепта и mesh-провайдера — медленнее, зато детальный меш с текстурами."
                    : "Choose the build path. Blocky Parts assembles the .rbxm from primitive Roblox Parts: the LLM verifies the result against your brief and re-runs on mismatch, plus you get a blocky preview that's one-to-one with what you'll see in Studio. AI 3D Mesh goes through a 2D concept approval and a mesh provider — slower, but a detailed textured mesh.",
                quickReplies: furniturePathChoiceReplies(),
                gddRows: nil,
                createdAt: Date()
            )
        )
    }

    private func clearFurniturePathChoiceQuickReplies() {
        let choiceReplies = Set(furniturePathChoiceReplies().map { $0.lowercased() })
        messages = messages.map { message in
            guard
                message.role == .assistant,
                let quickReplies = message.quickReplies,
                !quickReplies.isEmpty,
                quickReplies.allSatisfy({ choiceReplies.contains($0.lowercased()) })
            else {
                return message
            }
            return ChatMessage(
                id: message.id,
                role: message.role,
                content: message.content,
                quickReplies: nil,
                gddRows: message.gddRowTuples,
                createdAt: message.createdAt,
                audioURL: message.audioURL,
                imageURL: message.imageURL,
                localImageKey: message.localImageKey,
                weaponColors: message.weaponColors
            )
        }
    }

    // ── Pet build-path picker (Track 3) ───────────────────────────────
    // Mirrors the furniture path-choice flow. After the user finishes the
    // interview and taps Generate, we present TWO options:
    //   • Blocky Parts (fast)   — current default, primitive Roblox Parts,
    //                              ~30-60s, free, native Roblox look
    //   • 3D Mesh (Tripo)        — image-to-3d + animate_rig + retarget,
    //                              ~5-9 min, photoreal mesh + skeletal
    //                              animation (idle/walk), requires
    //                              TRIPO_API_KEY on the backend.
    // Users who picked a species chip (🎲 Dog / 🐾 3D Dog) bypass the
    // picker because petMode is already set on the draft.

    private var needsPetPathChoice: Bool {
        contentSubcategory == "pets" && (draft.petMode == nil || draft.petMode?.isEmpty == true)
    }

    private func petPathChoiceReplies() -> [String] {
        ["🎲 Blocky Parts (fast preview)", "🐾 3D Mesh (Tripo, premium)"]
    }

    private func appendPetPathChoiceMessage() {
        let isRu = preferredResponseLanguageCode() == "ru"
        messages.append(
            ChatMessage(
                id: UUID().uuidString,
                role: .assistant,
                content: isRu
                    ? "Выбери путь сборки пета.\n\n• **🎲 Blocky Parts (быстро)** — собирается из примитивов Roblox: 30-60с, бесплатно, native Roblox look, видишь интерактивное 3D-превью до экспорта.\n• **🐾 3D Mesh (Tripo)** — реальный 3D-меш с текстурами + скелетный риг от Tripo (quadruped/biped/avian/serpentine/aquatic) + запечённые анимации idle/walk: 5-9 минут, premium pipeline."
                    : "Choose the pet build path.\n\n• **🎲 Blocky Parts (fast)** — assembled from primitive Roblox Parts: 30-60s, free, native Roblox look, interactive 3D preview before export.\n• **🐾 3D Mesh (Tripo)** — real 3D mesh with PBR textures + skeletal rig from Tripo (quadruped/biped/avian/serpentine/aquatic) + baked idle/walk animations: 5-9 min, premium pipeline.",
                quickReplies: petPathChoiceReplies(),
                gddRows: nil,
                createdAt: Date()
            )
        )
    }

    private func clearPetPathChoiceQuickReplies() {
        let choiceReplies = Set(petPathChoiceReplies().map { $0.lowercased() })
        messages = messages.map { message in
            guard
                message.role == .assistant,
                let quickReplies = message.quickReplies,
                !quickReplies.isEmpty,
                quickReplies.allSatisfy({ choiceReplies.contains($0.lowercased()) })
            else {
                return message
            }
            return ChatMessage(
                id: message.id,
                role: message.role,
                content: message.content,
                quickReplies: nil,
                gddRows: message.gddRowTuples,
                createdAt: message.createdAt,
                audioURL: message.audioURL,
                imageURL: message.imageURL,
                localImageKey: message.localImageKey,
                weaponColors: message.weaponColors
            )
        }
    }

    private func handlePetPathChoice(_ normalized: String) -> Bool {
        guard contentSubcategory == "pets" else { return false }
        guard draft.petMode == nil || draft.petMode?.isEmpty == true else { return false }
        switch normalized {
        case "🎲 blocky parts (fast preview)", "🎲 blocky parts", "blocky parts (fast preview)",
             "blocky parts", "blocky", "blocky pet", "fast", "fast preview",
             "блочный", "блоки", "блочные части", "блочный путь", "быстро":
            draft.petMode = "blocky"
            clearPetPathChoiceQuickReplies()
            appendAssistantMessage(preferredResponseLanguageCode() == "ru"
                ? "Зафиксировал: Blocky Parts. Сейчас соберу пета из примитивных Roblox Parts с Motor6D-анимацией. Превью покажу через минуту."
                : "Locked: Blocky Parts. I'll assemble the pet from primitive Roblox Parts with Motor6D animation. Preview ready in a minute.")
            generateFromCurrentPlan()
            return true
        case "🐾 3d mesh (tripo, premium)", "🐾 3d mesh", "3d mesh (tripo, premium)",
             "3d mesh", "tripo", "tripo mesh", "premium", "premium pet",
             "3д меш", "меш", "трипо", "премиум":
            draft.petMode = "evolution_3d"
            clearPetPathChoiceQuickReplies()
            appendAssistantMessage(preferredResponseLanguageCode() == "ru"
                ? "Зафиксировал: 3D Mesh через Tripo. Сейчас: 1) сгенерю concept-картинку, 2) Tripo превратит её в 3D-меш, 3) добавит скелет под твой вид (quadruped/biped/avian/...), 4) запечёт idle+walk анимации, 5) соберу .rbxm. Ожидание ~5-9 минут."
                : "Locked: 3D Mesh via Tripo. Now: 1) generate concept image, 2) Tripo turns it into a 3D mesh, 3) adds a skeleton matching your species (quadruped/biped/avian/...), 4) bakes idle+walk animations, 5) assembles the .rbxm. ETA ~5-9 min.")
            generateFromCurrentPlan()
            return true
        default:
            return false
        }
    }

    private func handleFurniturePathChoice(_ normalized: String) -> Bool {
        guard contentSubcategory == "furniture" else { return false }
        guard draft.furnitureBuildMode == nil || draft.furnitureBuildMode?.isEmpty == true else { return false }
        switch normalized {
        case "blocky parts (fast preview)", "blocky parts", "blocky", "blocks", "fast parts", "parts", "fast roblox parts",
             "блочный", "блоки", "блочные части", "кубики", "блочный путь":
            draft.furnitureBuildMode = "parts"
            clearFurniturePathChoiceQuickReplies()
            appendAssistantMessage(preferredResponseLanguageCode() == "ru"
                ? "Зафиксировал: Blocky Parts. Сейчас LLM соберёт сцену из примитивов Roblox, сверит её с твоим брифом и при несоответствии перегенерирует, потом покажет блочное превью."
                : "Locked: Blocky Parts. The LLM will assemble the scene from primitive Roblox Parts, verify it against your brief, re-run on mismatch, and show a blocky preview.")
            generateFromCurrentPlan()
            return true
        case "ai 3d mesh (detailed)", "ai 3d mesh", "ai mesh", "3d mesh", "mesh", "mesh path", "detailed mesh",
             "детальный меш", "3д меш", "меш", "детальный", "3d путь":
            draft.furnitureBuildMode = "mesh"
            clearFurniturePathChoiceQuickReplies()
            appendAssistantMessage(preferredResponseLanguageCode() == "ru"
                ? "Зафиксировал: AI 3D Mesh. Сначала сгенерирую 2D-концепт на твой апрув, потом отдам в mesh-провайдер и соберу .rbxm с настоящим мешем."
                : "Locked: AI 3D Mesh. First I'll generate a 2D concept for your approval, then send it to the mesh provider and assemble a real-mesh .rbxm.")
            generateFromCurrentPlan()
            return true
        default:
            return false
        }
    }

    /// Maps Smart Stub alternative-action button text to a navigation tab.
    /// Returns nil if the button should be handled as a normal chat message.
    private static func stubNavigationTab(for option: String) -> RootTab? {
        let lower = option.lowercased()
        // Community / catalog navigation
        if lower.contains("browse community") || lower.contains("explore trending") || lower.contains("browse catalog") {
            return .community
        }
        // Home feed
        if lower.contains("explore home") || lower.contains("go home") || lower.contains("home feed") {
            return .home
        }
        // Creation actions — stay in Create tab (will restart interview)
        if lower.contains("generate 3d") || lower.contains("create ui")
            || lower.contains("create shop ui") || lower.contains("generate npc")
            || lower.contains("generate building") || lower.contains("create game ui")
            || lower.contains("generate item") || lower.contains("create inventory ui")
            || lower.contains("generate weapon") || lower.contains("create combat")
            || lower.contains("generate store") || lower.contains("quest ui") {
            return nil // let these go through as prompts — they're valid generation requests
        }
        return nil
    }

    func resetInterview() {
        isGenerating = false
        generationStages = []
        activePreview = nil
        lastPreview = nil
        lastJobId = nil
        latestReferenceImageURL = nil
        latestReferenceImageAssetId = nil
        currentThread = nil
        threadProjectMemory = nil
        contentSubcategory = launchContentSubcategory
        presetsVisible = true
        draft = ProjectDraft.makeDefault(for: projectKind)
        messages = [welcomeMessage()]
    }

    func reopenLastPreview() {
        if let saved = lastPreview {
            activePreview = saved
        } else if let lastJobId {
            restoreGenerationJob(jobId: lastJobId, openWhenReady: true)
        }
    }

    var hasLastPreview: Bool {
        lastPreview != nil
    }

    var shouldShowPlanActions: Bool {
        !isGenerating && lastJobId == nil && lastPreview == nil
    }

    var isForegroundGenerationActive: Bool {
        guard isGenerating else { return false }
        return generationStages.contains { !$0.isTerminal }
    }

    var isGenerationTipsActive: Bool {
        if isForegroundGenerationActive {
            return true
        }
        guard let lastJobId else {
            return false
        }
        return backgroundGenerationJobs.contains { job in
            job.id == lastJobId && !job.isTerminal
        }
    }

    var activeBackgroundGenerationCount: Int {
        backgroundGenerationJobs.filter { !$0.isTerminal }.count
    }

    var readyBackgroundGenerationCount: Int {
        backgroundGenerationJobs.filter { $0.isReady || $0.needsReview }.count
    }

    var backgroundGenerationSnapshot: GenerationStatusSnapshot? {
        if let job = backgroundGenerationJobs.sorted(by: { $0.updatedAt > $1.updatedAt }).first {
            return snapshot(for: job)
        }
        return inferredBackgroundGenerationSnapshot()
    }

    var historyGenerationStatus: ChatHistoryStore.GenerationStatus? {
        if let liveStatus = liveGenerationHistoryStatus {
            return liveStatus
        }
        if let job = backgroundGenerationJobs.sorted(by: { $0.updatedAt > $1.updatedAt }).first {
            return historyStatus(for: job)
        }
        guard let snapshot = inferredBackgroundGenerationSnapshot(),
              let jobId = snapshot.jobId else { return nil }
        return ChatHistoryStore.GenerationStatus(
            jobId: jobId,
            title: snapshot.title,
            status: snapshot.status,
            statusLabel: snapshot.statusLabel,
            detailLabel: snapshot.statusLabel,
            iconName: snapshot.iconName,
            completedStageCount: 0,
            totalStageCount: 0,
            updatedAt: Date()
        )
    }

    var historyGenerationStatusDigest: String {
        historyGenerationStatus?.digest ?? ""
    }

    func bindHistorySession(id: String) {
        historySessionId = id
    }

    private var liveGenerationHistoryStatus: ChatHistoryStore.GenerationStatus? {
        guard let jobId = lastJobId, !generationStages.isEmpty else { return nil }
        if let trackedJob = backgroundGenerationJobs.first(where: { $0.id == jobId }),
           trackedJob.status != "awaiting_review",
           trackedJob.isTerminal {
            return historyStatus(for: trackedJob)
        }
        let title = backgroundGenerationJobs.first(where: { $0.id == jobId })?.title ?? backgroundGenerationTitle()
        return historyStatus(
            jobId: jobId,
            title: title,
            status: liveGenerationStatusValue(),
            stages: generationStages,
            updatedAt: Date()
        )
    }

    private func liveGenerationStatusValue() -> String {
        if isAwaitingConceptApproval || isAwaitingHeroApproval || !pendingDecalCandidates.isEmpty {
            return "awaiting_review"
        }
        if generationStages.contains(where: \.isFailed) {
            return "failed"
        }
        if isGenerating || isProcessingConceptAction || generationStages.contains(where: { $0.status == "processing" || $0.status == "pending" }) {
            return "processing"
        }
        if !generationStages.isEmpty, generationStages.allSatisfy(\.isComplete) {
            return "completed"
        }
        return "processing"
    }

    private func snapshot(for job: BackgroundGenerationJob) -> GenerationStatusSnapshot {
        let isRu = preferredResponseLanguageCode() == "ru"
        let statusLabel: String
        let actionLabel: String
        let iconName: String
        if job.needsReview {
            statusLabel = isRu ? "Нужен апрув" : "Needs review"
            actionLabel = isRu ? "Открыть апрув" : "Open approval"
            iconName = "hand.tap.fill"
        } else if job.isPartial {
            statusLabel = isRu ? "Частичный экспорт" : "Partial export"
            actionLabel = isRu ? "Открыть превью" : "Open preview"
            iconName = "exclamationmark.circle.fill"
        } else if job.isReady {
            statusLabel = isRu ? "Готово к экспорту" : "Ready to export"
            actionLabel = isRu ? "Открыть превью" : "Open preview"
            iconName = "checkmark.seal.fill"
        } else if job.needsAttention {
            statusLabel = job.status == "watcher_error"
                ? (isRu ? "Проверьте статус" : "Check status")
                : (isRu ? "Нужен фикс" : "Needs fix")
            actionLabel = job.status == "watcher_error"
                ? (isRu ? "Открыть задачи" : "View jobs")
                : (isRu ? "Повторить" : "Retry")
            iconName = job.status == "watcher_error" ? "exclamationmark.triangle.fill" : "xmark.circle.fill"
        } else {
            statusLabel = job.currentStageTitle ?? (isRu ? "Рендерится в фоне" : job.statusLabel)
            actionLabel = isRu ? "Открыть задачи" : "View jobs"
            iconName = "clock.arrow.circlepath"
        }
        return GenerationStatusSnapshot(
            title: job.title,
            status: job.status,
            statusLabel: statusLabel,
            actionLabel: actionLabel,
            iconName: iconName,
            jobId: job.id
        )
    }

    private func historyStatus(for job: BackgroundGenerationJob) -> ChatHistoryStore.GenerationStatus {
        historyStatus(jobId: job.id, title: job.title, status: job.status, stages: job.stages, updatedAt: job.updatedAt)
    }

    private func historyStatus(
        jobId: String,
        title: String,
        status: String,
        stages: [GenerationStage],
        updatedAt: Date
    ) -> ChatHistoryStore.GenerationStatus {
        let isRu = preferredResponseLanguageCode() == "ru"
        let completed = stages.filter(\.isComplete).count
        let total = stages.count
        let currentStep = stages.first(where: { $0.status == "processing" })?.title
            ?? stages.first(where: { $0.status == "pending" })?.title
            ?? stages.last?.title
        let statusLabel: String
        let iconName: String
        let detail: String

        if status == "awaiting_review" {
            statusLabel = isRu ? "Нужен апрув" : "Needs review"
            iconName = "hand.tap.fill"
        } else if status == "partial" {
            statusLabel = isRu ? "Частичный экспорт" : "Partial export"
            iconName = "exclamationmark.circle.fill"
        } else if status == "completed" {
            statusLabel = isRu ? "Готово к экспорту" : "Ready to export"
            iconName = "checkmark.seal.fill"
        } else if status == "failed" {
            statusLabel = isRu ? "Нужен фикс" : "Needs fix"
            iconName = "xmark.circle.fill"
        } else if status == "watcher_error" {
            statusLabel = isRu ? "Проверьте статус" : "Check status"
            iconName = "exclamationmark.triangle.fill"
        } else {
            statusLabel = currentStep ?? (isRu ? "Рендерится в фоне" : "Rendering in background")
            iconName = "clock.arrow.circlepath"
        }

        if status == "watcher_error" {
            if let currentStep, !currentStep.isEmpty {
                detail = isRu
                    ? "Ошибка проверки на шаге: \(currentStep)"
                    : "Status check stopped at: \(currentStep)"
            } else {
                detail = isRu
                    ? "Ошибка проверки статуса. Откройте задачи или повторите."
                    : "Status check stopped. View jobs or retry."
            }
        } else if status == "failed" {
            detail = isRu ? "Генерация остановилась. Нужен фикс." : "Generation stopped. Needs a fix."
        } else if status == "awaiting_review" {
            detail = isRu ? "Ждёт апрува в превью." : "Waiting for approval in preview."
        } else if status == "partial" {
            if total > 0 {
                detail = isRu
                    ? "Часть стадий не доехала · \(completed)/\(total)"
                    : "Some stages did not finish · \(completed)/\(total)"
            } else {
                detail = isRu ? "Часть стадий не доехала." : "Some stages did not finish."
            }
        } else if status == "completed" {
            detail = isRu ? "Готово к экспорту." : "Ready to export."
        } else if let currentStep, !currentStep.isEmpty {
            detail = isRu ? "Сейчас: \(currentStep)" : "Now: \(currentStep)"
        } else {
            detail = isRu ? "Рендерится в фоне." : "Rendering in background."
        }

        return ChatHistoryStore.GenerationStatus(
            jobId: jobId,
            title: title,
            status: status,
            statusLabel: statusLabel,
            detailLabel: detail,
            iconName: iconName,
            completedStageCount: completed,
            totalStageCount: total,
            updatedAt: updatedAt
        )
    }

    private func inferredBackgroundGenerationSnapshot() -> GenerationStatusSnapshot? {
        let isRu = preferredResponseLanguageCode() == "ru"
        for message in messages.reversed() where message.role == .assistant {
            let content = message.content
            let lower = content.lowercased()
            let title = Self.firstQuotedText(in: content) ?? backgroundGenerationTitle()

            if lower.contains("needs your review") || lower.contains("waiting for approval") || lower.contains("нужна провер") {
                return GenerationStatusSnapshot(
                    title: title,
                    status: "awaiting_review",
                    statusLabel: isRu ? "Нужен апрув" : "Needs review",
                    actionLabel: isRu ? "Открыть апрув" : "Open approval",
                    iconName: "hand.tap.fill",
                    jobId: lastJobId
                )
            }
            if (lower.contains("ready") && (lower.contains("preview") || lower.contains("export") || lower.contains("result package")))
                || (lower.contains("готов") && (lower.contains("превью") || lower.contains("экспорт"))) {
                return GenerationStatusSnapshot(
                    title: title,
                    status: "completed",
                    statusLabel: isRu ? "Готово к экспорту" : "Ready to export",
                    actionLabel: isRu ? "Открыть превью" : "Open preview",
                    iconName: "checkmark.seal.fill",
                    jobId: lastJobId
                )
            }
            if lower.contains("failed") || lower.contains("stopped before export") || lower.contains("did not finish")
                || lower.contains("не заверш") || lower.contains("ошибка") {
                return GenerationStatusSnapshot(
                    title: title,
                    status: "failed",
                    statusLabel: isRu ? "Нужен фикс" : "Needs fix",
                    actionLabel: isRu ? "Повторить" : "Retry",
                    iconName: "xmark.circle.fill",
                    jobId: lastJobId
                )
            }
            if lower.contains("started rendering") || (lower.contains("rendering") && lower.contains("background"))
                || (lower.contains("рендер") && lower.contains("фон")) {
                return GenerationStatusSnapshot(
                    title: title,
                    status: "processing",
                    statusLabel: isRu ? "Рендерится в фоне" : "Rendering in background",
                    actionLabel: isRu ? "Открыть задачи" : "View jobs",
                    iconName: "clock.arrow.circlepath",
                    jobId: lastJobId
                )
            }
        }
        return nil
    }

    private static func firstQuotedText(in text: String) -> String? {
        let pairs: [(Character, Character)] = [("“", "”"), ("\"", "\""), ("«", "»")]
        for (open, close) in pairs {
            guard let start = text.firstIndex(of: open) else { continue }
            let searchStart = text.index(after: start)
            guard searchStart < text.endIndex,
                  let end = text[searchStart...].firstIndex(of: close) else { continue }
            let value = text[searchStart..<end].trimmingCharacters(in: .whitespacesAndNewlines)
            if !value.isEmpty {
                return value
            }
        }
        return nil
    }

    var canShowLivePreview: Bool {
        // Bug 11/12/13: стадии в `generationStages` могут "зависнуть" в processing/pending
        // даже после того как пайплайн фактически завершился или встал на паузу:
        //  • Bug 11 (обби hero approval): backend ставит hero_approval='processing' на паузе.
        //  • Bug 12 (scripts) / Bug 13 (ui): backend не возвращает job.stages для kind='code'
        //    → локальный scaffold с concept_image='processing' никогда не перезаписывается.
        // Решение: `isGenerating` — авторитетный флаг "пайплайн активно работает" (он сбрасывается
        // в false после выхода из polling-лупа в sendTapped). Плюс defense-in-depth guard против
        // awaiting-approval состояний, где пайплайн стоит.
        guard isGenerating else { return false }
        guard !isAwaitingHeroApproval && !isAwaitingConceptApproval else { return false }
        return !generationStages.isEmpty && generationStages.contains(where: { $0.status == "processing" || $0.status == "pending" })
    }

    func openBackgroundGeneration(_ jobId: String) {
        guard let job = backgroundGenerationJobs.first(where: { $0.id == jobId }) else {
            restoreGenerationJob(jobId: jobId, openWhenReady: true)
            return
        }
        applyLatestJobId(job.id)
        if let preview = job.preview {
            activePreview = preview
            lastPreview = preview
            notifyGenerationRouteReady()
            return
        }
        activePreview = self.makeBackgroundPipelinePreview(for: job)
        notifyGenerationRouteReady()
    }

    func openLatestBackgroundGeneration() {
        if let newest = backgroundGenerationJobs.sorted(by: { $0.updatedAt > $1.updatedAt }).first {
            openBackgroundGeneration(newest.id)
            return
        }
        guard let lastJobId else {
            showSystemToast(preferredResponseLanguageCode() == "ru" ? "Рендер не найден" : "No render found")
            // Session 338: clear the routing overlay immediately when there is
            // nothing to open — otherwise the user sees a 1.8s blocking spinner
            // for no reason.
            notifyGenerationRouteReady()
            return
        }
        restoreGenerationJob(jobId: lastJobId, openWhenReady: true)
    }

    func clearFinishedBackgroundGenerations() {
        backgroundGenerationJobs.removeAll { $0.isTerminal }
        if backgroundGenerationJobs.isEmpty {
            clearHistoryGenerationStatusIfNeeded()
        }
        self.updateApplicationBadge()
    }

    func openLivePipelinePreview() {
        let stages = generationStages.map {
            GenerationPreviewView.PipelineStagePreview(
                id: $0.id,
                title: $0.title,
                status: $0.status,
                summary: $0.title,
                artifactType: nil
            )
        }
        activePreview = PreviewPayload(
            id: "pipeline-live",
            title: "\(draft.title) Pipeline",
            artifactType: .pipeline(stages: stages),
            exportFileType: "pipeline",
            artifactIds: [],
            shareDescription: "Generation in progress...",
            downloadURL: nil,
            glbDownloadURL: nil,
            rbxmDownloadURL: nil,
            fbxDownloadURL: nil,
            notes: []
        )
    }

    func refreshLivePipelinePreview() {
        guard let current = activePreview, !generationStages.isEmpty else { return }
        if case .pipeline = current.artifactType {
            let stages = generationStages.map { stage -> GenerationPreviewView.PipelineStagePreview in
                let stageArtifacts = liveJobArtifacts.filter { $0.stageId == stage.id }
                let artifact: GenerationPreviewView.ArtifactType? = stage.status == "completed"
                    ? pipelineArtifactType(for: stage.id, artifacts: stageArtifacts, summary: stage.title)
                    : nil
                return GenerationPreviewView.PipelineStagePreview(
                    id: stage.id,
                    title: stage.title,
                    status: stage.status,
                    summary: stage.title,
                    artifactType: artifact
                )
            }
            activePreview = PreviewPayload(
                id: current.id,
                title: "\(draft.title) Pipeline",
                artifactType: .pipeline(stages: stages),
                exportFileType: "pipeline",
                artifactIds: [],
                shareDescription: "Generation in progress...",
                downloadURL: nil,
                glbDownloadURL: nil,
                rbxmDownloadURL: nil,
                fbxDownloadURL: nil,
                notes: []
            )
        }
    }

    private func makeBackgroundPipelinePreview(for job: BackgroundGenerationJob) -> PreviewPayload {
        let stages = job.stages.map {
            GenerationPreviewView.PipelineStagePreview(
                id: $0.id,
                title: $0.title,
                status: $0.status,
                summary: $0.title,
                artifactType: nil
            )
        }
        return PreviewPayload(
            id: "background-\(job.id)",
            title: "\(job.title) Pipeline",
            artifactType: .pipeline(stages: stages),
            exportFileType: "pipeline",
            artifactIds: [],
            shareDescription: "Generation in progress...",
            downloadURL: nil,
            glbDownloadURL: nil,
            rbxmDownloadURL: nil,
            fbxDownloadURL: nil,
            notes: []
        )
    }

    private var shouldRunGenerationDetached: Bool {
        switch generationKind {
        case "character_3d", "clothing_3d", "pet_3d", "vehicle_3d", "game_package", "rbxl_build", "rbxm_build", "animation":
            return true
        default:
            return false
        }
    }

    private func backgroundGenerationTitle() -> String {
        let title = draft.title.trimmingCharacters(in: .whitespacesAndNewlines)
        if !title.isEmpty { return title }
        if let subcategory = contentSubcategory, !subcategory.isEmpty {
            return subcategory.replacingOccurrences(of: "_", with: " ").capitalized
        }
        return "\(projectKind.rawValue.capitalized) Package"
    }

    private func localizedProjectPackageName() -> String {
        switch projectKind {
        case .game, .clone:
            return "пакет игры"
        case .content, .ugc:
            return "пакет контента"
        case .fix:
            return "пакет исправлений"
        case .analyze:
            return "пакет анализа"
        }
    }

    private func detachedGenerationStartedMessage(title: String) -> String {
        if preferredResponseLanguageCode() == "ru" {
            return "Запустил рендер «\(title)» в фоне. Можно закрыть окно, продолжить диалог или начать новую генерацию — я покажу бейдж и уведомление, когда результат будет готов."
        }
        return "I started rendering “\(title)” in the background. You can close this chat, keep talking, or start another generation — I’ll badge it here and notify you when it’s ready."
    }

    private func beginBackgroundGenerationMonitor(
        jobId: String,
        title: String,
        generationKind: String,
        initialStages: [GenerationStage]
    ) {
        ensureBackgroundNotificationPermissionIfNeeded()
        upsertBackgroundGenerationJob(
            id: jobId,
            title: title,
            status: "processing",
            stages: initialStages,
            artifactCount: 0,
            preview: nil
        )
        backgroundGenerationTasks[jobId]?.cancel()
        let task = Task { [self] in
            defer {
                backgroundGenerationTasks[jobId] = nil
            }
            do {
                let job = try await pollBackgroundGenerationJob(jobId: jobId, generationKind: generationKind)
                handleBackgroundGenerationTerminal(job, title: title)
            } catch is CancellationError {
                return
            } catch let timeout as GenerationPollingTimeout {
                handleBackgroundGenerationTimeout(timeout, title: title)
            } catch {
                handleBackgroundGenerationError(error, jobId: jobId, title: title)
            }
        }
        backgroundGenerationTasks[jobId] = task
    }

    private func ensureBackgroundNotificationPermissionIfNeeded() {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            guard settings.authorizationStatus == .notDetermined else { return }
            UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { _, _ in }
        }
    }

    private func pollBackgroundGenerationJob(jobId: String, generationKind: String) async throws -> AIWorkspaceAPI.GenerationJob {
        let isGamePipeline = generationKind == "game_package" || generationKind == "rbxl_build" || generationKind == "rbxm_build"
        let isAnimationPipeline = generationKind == "animation"
        let maxAttempts = isGamePipeline ? 240 : isAnimationPipeline ? 100 : 120
        let intervalNanos: UInt64 = isGamePipeline ? 4_000_000_000 : isAnimationPipeline ? 2_000_000_000 : 5_000_000_000
        var consecutiveTransientFailures = 0
        let maxConsecutiveTransientFailures = 8

        for _ in 0..<maxAttempts {
            let job: AIWorkspaceAPI.GenerationJob
            do {
                job = try await AIWorkspaceAPI.fetchJob(jobId: jobId)
                consecutiveTransientFailures = 0
            } catch {
                if Self.isTransientNetworkError(error) {
                    consecutiveTransientFailures += 1
                    if consecutiveTransientFailures >= maxConsecutiveTransientFailures {
                        throw error
                    }
                    try await Task.sleep(nanoseconds: intervalNanos)
                    continue
                }
                throw error
            }

            let stages = mapStages(from: job) ?? backgroundGenerationJobs.first(where: { $0.id == job.id })?.stages ?? []
            notifyCompletedBackgroundStages(for: job, title: self.backgroundGenerationTitle(for: job), stages: stages)
            upsertBackgroundGenerationJob(
                id: job.id,
                title: self.backgroundGenerationTitle(for: job),
                status: job.status,
                stages: stages,
                artifactCount: job.artifacts.count,
                preview: backgroundGenerationJobs.first(where: { $0.id == job.id })?.preview
            )
            if Self.isTerminalJobStatus(job.status) {
                return job
            }
            try await Task.sleep(nanoseconds: intervalNanos)
        }

        let finalJob = try await AIWorkspaceAPI.fetchJob(jobId: jobId)
        let finalStages = mapStages(from: finalJob) ?? []
        notifyCompletedBackgroundStages(for: finalJob, title: self.backgroundGenerationTitle(for: finalJob), stages: finalStages)
        upsertBackgroundGenerationJob(
            id: finalJob.id,
            title: self.backgroundGenerationTitle(for: finalJob),
            status: finalJob.status,
            stages: finalStages,
            artifactCount: finalJob.artifacts.count,
            preview: backgroundGenerationJobs.first(where: { $0.id == finalJob.id })?.preview
        )
        if Self.isTerminalJobStatus(finalJob.status) {
            return finalJob
        }
        let elapsedSeconds = Int((Double(maxAttempts) * Double(intervalNanos)) / 1_000_000_000)
        throw GenerationPollingTimeout(job: finalJob, elapsedSeconds: elapsedSeconds)
    }

    private func backgroundGenerationTitle(for job: AIWorkspaceAPI.GenerationJob) -> String {
        job.metadata?.displayTitle
            ?? job.metadata?.title
            ?? backgroundGenerationJobs.first(where: { $0.id == job.id })?.title
            ?? backgroundGenerationTitle()
    }

    private func restoreLastGenerationIfAvailable() {
        guard let lastJobId, !lastJobId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        guard !backgroundGenerationJobs.contains(where: { $0.id == lastJobId }) else { return }
        restoreGenerationJob(jobId: lastJobId, openWhenReady: false)
    }

    private func restoreGenerationJob(jobId: String, openWhenReady: Bool) {
        if restoringGenerationJobIds.contains(jobId), !openWhenReady { return }
        restoringGenerationJobIds.insert(jobId)
        Task {
            defer {
                restoringGenerationJobIds.remove(jobId)
            }
            do {
                let job = try await AIWorkspaceAPI.fetchJob(jobId: jobId)
                let stages = mapStages(from: job)
                    ?? backgroundGenerationJobs.first(where: { $0.id == job.id })?.stages
                    ?? []
                let title = backgroundGenerationTitle(for: job)
                applyLatestJobId(job.id)

                if Self.isTerminalJobStatus(job.status) {
                    let canBuildPreview = job.status != "failed" || !stages.isEmpty || !job.artifacts.isEmpty
                    let preview = canBuildPreview ? makePreviewPayload(from: job) : nil
                    if job.status == "failed" {
                        lastFailedGenerationJob = job
                    } else {
                        lastFailedGenerationJob = nil
                        handleBackgroundReviewStateIfNeeded(job)
                    }
                    if let preview {
                        lastPreview = preview
                    }
                    generationStages = []
                    upsertBackgroundGenerationJob(
                        id: job.id,
                        title: title,
                        status: job.status,
                        stages: stages,
                        artifactCount: job.artifacts.count,
                        preview: preview
                    )
                    updateApplicationBadge()
                    if openWhenReady {
                        openBackgroundGeneration(job.id)
                    }
                    return
                }

                upsertBackgroundGenerationJob(
                    id: job.id,
                    title: title,
                    status: job.status,
                    stages: stages,
                    artifactCount: job.artifacts.count,
                    preview: backgroundGenerationJobs.first(where: { $0.id == job.id })?.preview
                )
                if openWhenReady {
                    openBackgroundGeneration(job.id)
                }
                if backgroundGenerationTasks[job.id] == nil {
                    beginBackgroundGenerationMonitor(
                        jobId: job.id,
                        title: title,
                        generationKind: job.kind,
                        initialStages: stages
                    )
                }
            } catch {
                if openWhenReady {
                    showSystemToast(systemConnectionToastMessage())
                    notifyGenerationRouteReady()
                }
            }
        }
    }

    private func notifyGenerationRouteReady() {
        NotificationCenter.default.post(name: .generationNotificationRouteReady, object: nil)
    }

    /// Session 338: if the sticky in-app review alert is still on screen for
    /// the job the user just approved, clear it so we don't show a stale
    /// `Needs approval` overlay after the action completed.
    private func clearForegroundGenerationAlertIfMatchingReview(jobId: String) {
        let normalized = jobId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalized.isEmpty else { return }
        NotificationCenter.default.post(
            name: .clearForegroundGenerationAlert,
            object: nil,
            userInfo: [
                "jobId": normalized,
                "type": "generation_review_needed",
            ]
        )
    }

    private func upsertBackgroundGenerationJob(
        id: String,
        title: String,
        status: String,
        stages: [GenerationStage],
        artifactCount: Int,
        preview: PreviewPayload?
    ) {
        applyLatestJobId(id)
        let updated = BackgroundGenerationJob(
            id: id,
            title: title,
            status: status,
            stages: stages,
            artifactCount: artifactCount,
            preview: preview,
            updatedAt: Date()
        )
        if let index = backgroundGenerationJobs.firstIndex(where: { $0.id == id }) {
            backgroundGenerationJobs[index] = updated
        } else {
            backgroundGenerationJobs.insert(updated, at: 0)
        }
        persistHistoryGenerationStatus(updated)
    }

    private func persistHistoryGenerationStatus(_ job: BackgroundGenerationJob) {
        guard let historySessionId else { return }
        ChatHistoryStore.shared.updateGenerationStatus(
            sessionId: historySessionId,
            status: historyStatus(for: job),
            lastJobId: job.id,
            contentSubcategory: contentSubcategory
        )
    }

    private func persistLiveGenerationStatus(
        jobId: String,
        title: String,
        status: String,
        stages: [GenerationStage],
        updatedAt: Date = Date()
    ) {
        guard let historySessionId else { return }
        ChatHistoryStore.shared.updateGenerationStatus(
            sessionId: historySessionId,
            status: historyStatus(
                jobId: jobId,
                title: title,
                status: status,
                stages: stages,
                updatedAt: updatedAt
            ),
            lastJobId: jobId,
            contentSubcategory: contentSubcategory
        )
    }

    private func persistLiveGenerationStatus(job: AIWorkspaceAPI.GenerationJob, stages: [GenerationStage]) {
        let title = backgroundGenerationTitle(for: job)
        if backgroundGenerationJobs.contains(where: { $0.id == job.id })
            || Self.isTerminalJobStatus(job.status, includingAwaitingReview: false) {
            upsertBackgroundGenerationJob(
                id: job.id,
                title: title,
                status: job.status,
                stages: stages,
                artifactCount: job.artifacts.count,
                preview: backgroundGenerationJobs.first(where: { $0.id == job.id })?.preview
            )
            return
        }
        persistLiveGenerationStatus(jobId: job.id, title: title, status: job.status, stages: stages)
    }

    private func clearHistoryGenerationStatusIfNeeded() {
        guard let historySessionId else { return }
        ChatHistoryStore.shared.updateGenerationStatus(
            sessionId: historySessionId,
            status: nil,
            lastJobId: lastJobId,
            contentSubcategory: contentSubcategory
        )
    }

    private func notifyCompletedBackgroundStages(for job: AIWorkspaceAPI.GenerationJob, title: String, stages: [GenerationStage]) {
        let newlyCompletedStages = stages.filter { stage in
            guard stage.isComplete else { return false }
            let key = "\(job.id):\(stage.id):completed"
            return !notifiedBackgroundStageKeys.contains(key)
        }
        guard !newlyCompletedStages.isEmpty else { return }

        for stage in newlyCompletedStages {
            notifiedBackgroundStageKeys.insert("\(job.id):\(stage.id):completed")
        }

        guard !Self.isTerminalJobStatus(job.status),
              let latestStage = newlyCompletedStages.last else { return }

        let isRu = preferredResponseLanguageCode() == "ru"
        scheduleBackgroundGenerationNotification(
            title: isRu ? "Шаг генерации завершён" : "Generation step done",
            body: isRu
                ? "«\(title)»: \(latestStage.title). Нажмите, чтобы открыть экран генерации."
                : "“\(title)”: \(latestStage.title). Tap to open the generation screen.",
            jobId: job.id,
            threadId: job.threadId,
            chatTitle: title,
            event: "generation_stage_completed",
            stageId: latestStage.id,
            stageTitle: latestStage.title,
            notificationKind: .progress
        )
    }

    private func handleBackgroundGenerationTerminal(_ job: AIWorkspaceAPI.GenerationJob, title: String) {
        let stages = mapStages(from: job) ?? backgroundGenerationJobs.first(where: { $0.id == job.id })?.stages ?? []
        let preview = (job.stages?.isEmpty == false || !job.artifacts.isEmpty) ? makePreviewPayload(from: job) : nil
        applyLatestJobId(job.id)

        if job.status == "completed" || job.status == "awaiting_review" || job.status == "partial" {
            lastFailedGenerationJob = nil
            if let preview {
                lastPreview = preview
            }
            handleBackgroundReviewStateIfNeeded(job)
            appendBackgroundCompletionMessage(for: job, title: title)
            let isRu = preferredResponseLanguageCode() == "ru"
            scheduleBackgroundGenerationNotification(
                title: job.status == "awaiting_review"
                    ? (isRu ? "Нужен апрув" : "Review needed")
                    : (isRu ? "Генерация готова" : "Generation ready"),
                body: job.status == "awaiting_review"
                    ? (isRu ? "\(title) ждёт вашего апрува. Нажмите, чтобы открыть превью." : "\(title) is waiting for approval. Tap to open the preview.")
                    : (isRu ? "\(title) готов к экспорту. Нажмите, чтобы открыть экран генерации." : "\(title) is ready to export. Tap to open the generation screen."),
                jobId: job.id,
                threadId: job.threadId,
                chatTitle: title,
                event: job.status == "awaiting_review" ? "generation_review_needed" : "generation_completed",
                stageId: nil,
                stageTitle: nil,
                notificationKind: job.status == "awaiting_review" ? .review : .ready
            )
        } else {
            lastFailedGenerationJob = job
            if let preview {
                lastPreview = preview
            }
            messages.append(
                ChatMessage(
                    id: UUID().uuidString,
                    role: .assistant,
                    content: qualityFailureMessage(from: job),
                    quickReplies: failedGenerationQuickReplies(for: job),
                    gddRows: nil,
                    createdAt: Date()
                )
            )
            scheduleBackgroundGenerationNotification(
                title: preferredResponseLanguageCode() == "ru" ? "Генерация остановилась" : "Generation failed",
                body: preferredResponseLanguageCode() == "ru" ? "\(title) остановился до экспорта. Нажмите, чтобы открыть экран генерации." : "\(title) stopped before export. Tap to open the generation screen.",
                jobId: job.id,
                threadId: job.threadId,
                chatTitle: title,
                event: "generation_failed",
                stageId: nil,
                stageTitle: nil,
                notificationKind: .failed
            )
        }

        upsertBackgroundGenerationJob(
            id: job.id,
            title: self.backgroundGenerationTitle(for: job),
            status: job.status,
            stages: stages,
            artifactCount: job.artifacts.count,
            preview: preview
        )
        self.updateApplicationBadge()
    }

    private func handleBackgroundReviewStateIfNeeded(_ job: AIWorkspaceAPI.GenerationJob) {
        guard job.status == "awaiting_review", !["scripts", "decals", "passes", "ui"].contains(contentSubcategory ?? "") else { return }
        let isDecalApproval = job.metadata?.approvalKind == "decal_upload"
            && (job.metadata?.pendingDecalApprovals?.isEmpty == false)
        let isHeroApproval = job.metadata?.pipelinePhase == "hero_concepts_done"
            && job.metadata?.heroConcepts?.isEmpty == false
        if isDecalApproval {
            pendingDecalCandidates = job.metadata?.pendingDecalApprovals ?? []
        } else if isHeroApproval {
            heroConcepts = job.metadata?.heroConcepts ?? []
            isAwaitingHeroApproval = true
        } else {
            isAwaitingConceptApproval = true
        }
    }

    private func appendBackgroundCompletionMessage(for job: AIWorkspaceAPI.GenerationJob, title: String) {
        let content: String
        let replies: [String]
        let isRu = preferredResponseLanguageCode() == "ru"
        if job.status == "awaiting_review" {
            content = isRu
                ? "«\(title)» ждёт апрува перед продолжением рендера. Откройте превью, чтобы выбрать вариант."
                : "“\(title)” needs your review before the render continues. Open the preview when you’re ready."
            replies = isRu ? ["Открыть апрув", "Открыть задачи", "Начать ещё"] : ["Open preview", "View jobs", "Start another"]
        } else if contentSubcategory == "audio" {
            content = isRu
                ? "«\(title)» готов! Откройте превью и экспортируйте для Studio."
                : "“\(title)” is ready! Preview below — export to use in Studio."
            replies = isRu ? ["Открыть превью", "Экспорт брифа", "Начать ещё"] : ["Open preview", "Export brief", "Start another"]
        } else {
            content = isRu
                ? "«\(title)» готов. Откройте превью, чтобы проверить файлы и экспорт."
                : "“\(title)” is ready. Open the preview to inspect files and export."
            replies = isRu ? ["Открыть превью", "Перегенерировать с правками", "Начать ещё"] : ["Open preview", "Regenerate with changes", "Start another"]
        }
        messages.append(
            ChatMessage(
                id: UUID().uuidString,
                role: .assistant,
                content: content,
                quickReplies: replies,
                gddRows: nil,
                createdAt: Date()
            )
        )
    }

    private func handleBackgroundGenerationTimeout(_ timeout: GenerationPollingTimeout, title: String) {
        let stages = mapStages(from: timeout.job) ?? backgroundGenerationJobs.first(where: { $0.id == timeout.job.id })?.stages ?? []
        let isRu = preferredResponseLanguageCode() == "ru"
        upsertBackgroundGenerationJob(
            id: timeout.job.id,
            title: title,
            status: timeout.job.status,
            stages: stages,
            artifactCount: timeout.job.artifacts.count,
            preview: nil
        )
        messages.append(
            ChatMessage(
                id: UUID().uuidString,
                role: .assistant,
                content: isRu
                    ? "«\(title)» всё ещё рендерится в облаке после \(timeout.elapsedSeconds / 60) минут. Я остановил локальный polling, чтобы чат не зависал; серверный push сработает после настройки APNs."
                    : "“\(title)” is still rendering in the cloud after \(timeout.elapsedSeconds / 60) minutes. I stopped local polling so the chat stays free; server push will still notify you if APNs is configured.",
                quickReplies: isRu ? ["Открыть задачи", "Начать ещё"] : ["View jobs", "Start another"],
                gddRows: nil,
                createdAt: Date()
            )
        )
    }

    private func handleBackgroundGenerationError(_ error: Error, jobId: String, title: String) {
        let isRu = preferredResponseLanguageCode() == "ru"
        let existingJob = backgroundGenerationJobs.first(where: { $0.id == jobId })
        let stages = existingJob?.stages ?? []
        let currentStage = stages.first(where: { $0.status == "processing" })
            ?? stages.first(where: { $0.status == "pending" })
            ?? stages.last
        upsertBackgroundGenerationJob(
            id: jobId,
            title: title,
            status: "watcher_error",
            stages: stages,
            artifactCount: existingJob?.artifactCount ?? 0,
            preview: nil
        )
        showSystemToast(systemConnectionToastMessage())
        scheduleBackgroundGenerationNotification(
            title: isRu ? "Нужна проверка" : "Status check needed",
            body: isRu
                ? "Я остановил проверку «\(title)», чтобы вы не ждали бесконечно. Нажмите, чтобы открыть экран генерации."
                : "I paused checks for “\(title)” so you are not left waiting. Tap to open the generation screen.",
            jobId: jobId,
            threadId: currentThread?.id,
            chatTitle: title,
            event: "generation_status_check_failed",
            stageId: currentStage?.id,
            stageTitle: currentStage?.title,
            notificationKind: .failed
        )
        messages.append(
            ChatMessage(
                id: UUID().uuidString,
                role: .assistant,
                content: safeBackgroundGenerationWatcherMessage(for: error, title: title),
                quickReplies: isRu ? ["Открыть задачи", "Повторить генерацию", "Начать ещё"] : ["View jobs", "Retry generation", "Start another"],
                gddRows: nil,
                createdAt: Date()
            )
        )
    }

    private func safeBackgroundGenerationWatcherMessage(for error: Error, title: String) -> String {
        let isRu = preferredResponseLanguageCode() == "ru"
        if Self.isTransientNetworkError(error) {
            return isRu
                ? "Связь оборвалась, пока я следил за «\(title)». Облачный job ещё может завершиться; откройте задачи чуть позже или дождитесь уведомления."
                : "Connection dropped while watching “\(title)”. The cloud job can still finish; view jobs again in a bit or wait for a notification."
        }
        if case APIError.httpError(let statusCode) = error {
            if statusCode == 429 {
                return isRu
                    ? "Сервис временно ограничил частые проверки «\(title)». Я оставил рендер в задачах; откройте их чуть позже или повторите генерацию."
                    : "The service is temporarily limiting status checks for “\(title)”. I kept the render in jobs; view it again in a bit or retry generation."
            }
            if statusCode == 401 || statusCode == 403 {
                return isRu
                    ? "Сессия не смогла проверить «\(title)». Войдите снова и откройте задачи, чтобы продолжить."
                    : "Your session could not check “\(title)”. Sign in again, then view jobs to continue."
            }
            if (500...599).contains(statusCode) {
                return isRu
                    ? "Сервис временно недоступен, пока я проверял «\(title)». Рендер остался в задачах; попробуйте открыть их позже."
                    : "The service was temporarily unavailable while checking “\(title)”. The render stayed in jobs; try viewing it again later."
            }
        }
        return isRu
            ? "Я остановил локальную проверку «\(title)», чтобы чат не зависал. Рендер остался в задачах; откройте их позже или повторите генерацию."
            : "I stopped local checks for “\(title)” so the chat does not get stuck. The render stayed in jobs; view it later or retry generation."
    }

    private func scheduleBackgroundGenerationNotification(
        title: String,
        body: String,
        jobId: String,
        threadId: String?,
        chatTitle: String?,
        event: String,
        stageId: String?,
        stageTitle: String?,
        notificationKind: BackgroundNotificationKind
    ) {
        let badgeCount = max(1, readyBackgroundGenerationCount)
        let isRu = preferredResponseLanguageCode() == "ru"
        let categoryIdentifier = Self.notificationCategoryIdentifier(kind: notificationKind, isRu: isRu)
        let projectKind = promptProjectKind
        let currentContentSubcategory = contentSubcategory
        var notificationUserInfo: [String: Any] = [
            "type": event,
            "jobId": jobId,
            "title": chatTitle ?? title,
            "projectKind": projectKind,
            "route": "generation",
            "screen": "generation_preview",
            "action": Self.notificationActionValue(kind: notificationKind),
            "status": Self.notificationStatusValue(for: event),
        ]
        if let threadId { notificationUserInfo["threadId"] = threadId }
        if let stageId { notificationUserInfo["stageId"] = stageId }
        if let stageTitle { notificationUserInfo["stageTitle"] = stageTitle }
        if let currentContentSubcategory { notificationUserInfo["contentSubcategory"] = currentContentSubcategory }
        let userInfo = notificationUserInfo
        postForegroundGenerationAlertIfActive(event: event, userInfo: userInfo)

        // Session 338: when the app is active the in-app overlay alert is the
        // single source of truth — don't enqueue a duplicate local
        // UNNotificationRequest that would surface as a redundant system banner
        // (and stack with the FCM banner). Background/inactive states still
        // need the local fallback in case FCM didn't deliver.
        #if canImport(UIKit)
        let applicationState = UIApplication.shared.applicationState
        guard applicationState != .active else { return }
        #endif

        UNUserNotificationCenter.current().getNotificationSettings { settings in
            let allowed: Bool
            switch settings.authorizationStatus {
            case .authorized, .provisional, .ephemeral:
                allowed = true
            default:
                allowed = false
            }
            guard allowed else { return }

            let content = UNMutableNotificationContent()
            content.title = title
            content.body = body
            content.sound = .default
            content.badge = NSNumber(value: badgeCount)
            content.categoryIdentifier = categoryIdentifier
            content.userInfo = userInfo
            let request = UNNotificationRequest(
                identifier: stageId.map { "generation-\(jobId)-\($0)" } ?? "generation-\(jobId)-\(event)",
                content: content,
                trigger: nil
            )
            UNUserNotificationCenter.current().add(request)
        }
    }

    private func postForegroundGenerationAlertIfActive(event: String, userInfo: [String: Any]) {
        guard event.hasPrefix("generation_"),
              event != "generation_stage_completed"
        else { return }
        #if canImport(UIKit)
        guard UIApplication.shared.applicationState == .active else { return }
        #endif
        NotificationCenter.default.post(
            name: .foregroundGenerationNotification,
            object: nil,
            userInfo: userInfo
        )
    }

    private static func notificationCategoryIdentifier(kind: BackgroundNotificationKind, isRu: Bool) -> String {
        let suffix = isRu ? "RU" : "EN"
        switch kind {
        case .progress:
            return "GENERATION_PROGRESS_\(suffix)"
        case .review:
            return "GENERATION_REVIEW_\(suffix)"
        case .ready:
            return "GENERATION_READY_\(suffix)"
        case .failed:
            return "GENERATION_FAILED_\(suffix)"
        }
    }

    private static func notificationActionValue(kind: BackgroundNotificationKind) -> String {
        switch kind {
        case .progress, .ready:
            return "open_preview"
        case .review:
            return "open_review"
        case .failed:
            return "open_retry"
        }
    }

    private static func notificationStatusValue(for event: String) -> String {
        switch event {
        case "generation_review_needed":
            return "awaiting_review"
        case "generation_completed":
            return "completed"
        case "generation_failed":
            return "failed"
        case "generation_status_check_failed":
            return "watcher_error"
        default:
            return "processing"
        }
    }

    private func updateApplicationBadge() {
        let badgeCount = backgroundGenerationJobs.filter { $0.isReady || $0.needsReview || $0.needsAttention }.count
        UNUserNotificationCenter.current().setBadgeCount(badgeCount)
    }

    func toggleRecording() {
        if isRecording {
            stopVoiceCapture()
        } else {
            startVoiceCapture()
        }
    }

    func sendAttachment(_ attachment: AttachmentType) {
        switch attachment {
        case .file:
            messages.append(
                ChatMessage(
                    id: UUID().uuidString,
                    role: .assistant,
                    content: "Choose a `.lua`, `.txt`, or `.json` file from the composer controls so I can ingest and analyze the real content.",
                    quickReplies: ["Use file picker", "Paste link", "Record voice"],
                    gddRows: nil,
                    createdAt: Date()
                )
            )
        case .image:
            messages.append(
                ChatMessage(
                    id: UUID().uuidString,
                    role: .assistant,
                    content: "Pick a real image from Photos so I can ingest the asset reference and use it in the build plan.",
                    quickReplies: ["Use photo picker", "Paste link", "Record voice"],
                    gddRows: nil,
                    createdAt: Date()
                )
            )
        case .link:
            messages.append(
                ChatMessage(
                    id: UUID().uuidString,
                    role: .assistant,
                    content: "Paste a reference URL in the composer prompt, then tap the Link button so I can ingest and analyze the real page.",
                    quickReplies: ["Paste link", "Use file picker", "Record voice"],
                    gddRows: nil,
                    createdAt: Date()
                )
            )
        }
    }

    func ingestFile(data: Data, fileName: String, mimeType: String = "text/plain") {
        Task {
            do {
                let asset = try await AIWorkspaceAPI.ingestAttachment(
                    type: "file",
                    name: fileName,
                    mimeType: mimeType,
                    contentBase64: data.base64EncodedString(),
                    parseMode: "structured",
                    metadata: chatMetadata(inputMode: "file", attachmentKind: "file")
                )
                let analysis = try? await AIWorkspaceAPI.fetchAssetAnalysis(assetId: asset.id)
                let prompt = """
                Attached file: \(fileName)
                Analyze the real file content, explain the most important issues, and suggest the safest game-ready next step.

                Analysis summary:
                \(analysis?.summary ?? asset.analysisSummary ?? asset.extractedText ?? "No analysis returned.")
                """
                send(prompt, quickReply: nil, inputMode: "file", attachmentKind: "file")
            } catch {
                appendAssistantMessage("I couldn't ingest that file yet. Try a smaller `.lua`, `.txt`, or `.json` file.")
            }
        }
    }

    /// Stages an image as a pending attachment chip and starts uploading in the
    /// background. The user can keep typing — Send is gated until upload completes.
    /// Session 187: this REPLACES the old fire-and-send flow that froze the UI.
    func attachImageReference(data: Data, fileName: String = "reference.jpg", mimeType: String = "image/jpeg", localImageKey: String) {
        // Show the chip immediately. previewURL/assetId fill in when upload completes.
        let pending = PendingAttachment(
            id: UUID().uuidString,
            localImageKey: localImageKey,
            fileName: fileName,
            mimeType: mimeType,
            assetId: nil,
            previewURL: nil,
            uploadState: .uploading
        )
        pendingAttachment = pending
        let pendingId = pending.id
        // Snapshot metadata on MainActor before detaching — chatMetadata() reads
        // @Published state and shouldn't be re-entered from the background task.
        let snapshotMetadata = chatMetadata(inputMode: "image", attachmentKind: "image")

        // Encode + upload OFF the main actor. base64 of a 200–600 KB JPEG is fast
        // (<50 ms) but we still keep it detached so MainActor stays responsive.
        Task.detached(priority: .userInitiated) { [weak self] in
            let base64 = data.base64EncodedString()
            do {
                let asset = try await AIWorkspaceAPI.ingestAttachment(
                    type: "image",
                    name: fileName,
                    mimeType: mimeType,
                    contentBase64: base64,
                    parseMode: "structured",
                    metadata: snapshotMetadata
                )
                await MainActor.run {
                    guard let self, var current = self.pendingAttachment, current.id == pendingId else { return }
                    current.assetId = asset.id
                    current.previewURL = (asset.downloadUrl ?? asset.sourceUrl).flatMap(URL.init(string:))
                    current.uploadState = .ready
                    self.pendingAttachment = current
                }
            } catch {
                await MainActor.run {
                    guard let self, var current = self.pendingAttachment, current.id == pendingId else { return }
                    current.uploadState = .failed("Upload failed. Tap × to remove or try again.")
                    self.pendingAttachment = current
                }
            }
        }
    }

    /// Cancel the pending attachment chip — drops the cached UIImage too.
    func clearPendingAttachment() {
        if let key = pendingAttachment?.localImageKey {
            ChatImageCache.shared.remove(key: key)
        }
        pendingAttachment = nil
    }

    /// Send pending attachment together with the user's typed prompt.
    /// If `text` is empty, falls back to a generic "use this as a reference" line.
    func sendWithPendingAttachment(_ text: String) {
        guard let pending = pendingAttachment, pending.uploadState == .ready else { return }
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let promptText: String
        if trimmed.isEmpty {
            promptText = "Use this image as the style anchor — infer palette, silhouette, mood and treat it as the visual brief."
        } else {
            promptText = "\(trimmed)\n\n[Attached reference image — analyze it and use it as the visual brief.]"
        }
        let imageURL = pending.previewURL
        let imageKey = pending.localImageKey
        let assetId = pending.assetId
        latestReferenceImageURL = imageURL
        latestReferenceImageAssetId = assetId
        // Clear chip BEFORE sending so the UI updates synchronously.
        pendingAttachment = nil
        send(
            promptText,
            quickReply: nil,
            inputMode: "image",
            attachmentKind: "image",
            imageURL: imageURL,
            localImageKey: imageKey,
            attachmentAssetId: assetId,
            attachmentImageURL: imageURL
        )
    }

    /// Legacy entry point kept for the Attach File → image code path. Routes
    /// through the new pending-chip flow so the UX is consistent.
    func ingestImage(data: Data, fileName: String = "reference.png", mimeType: String = "image/png", localImageKey: String? = nil) {
        let key = localImageKey ?? UUID().uuidString
        attachImageReference(data: data, fileName: fileName, mimeType: mimeType, localImageKey: key)
    }

    func ingestLink(_ urlString: String) {
        let trimmed = urlString.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        Task {
            do {
                let asset = try await AIWorkspaceAPI.ingestAttachment(
                    type: "url",
                    name: "Reference Link",
                    mimeType: "text/uri-list",
                    sourceUrl: trimmed,
                    parseMode: "structured",
                    metadata: chatMetadata(inputMode: "link", attachmentKind: "link")
                )
                let prompt = """
                Attached link: \(trimmed)
                Analyze the real page content, extract the strongest mechanics or style cues, and turn it into a safer original game-ready direction.

                Extracted preview:
                \(asset.previewText ?? "No preview extracted.")
                """
                send(prompt, quickReply: nil, inputMode: "link", attachmentKind: "link")
            } catch {
                appendAssistantMessage("I couldn't ingest that link yet. Check the URL and try again.")
            }
        }
    }

    func reopenInterview() {
        generationStages = []
        activePreview = nil
        messages.append(
            ChatMessage(
                id: UUID().uuidString,
                role: .assistant,
                content: "Let’s tighten the plan again. Send a new brief or tap a quick direction below.",
                quickReplies: starterReplies,
                gddRows: nil,
                createdAt: Date()
            )
        )
    }

    func exportBrief() {
        activePreview = PreviewPayload(
            title: "\(draft.title) Brief",
            artifactType: .gdd(rows: draft.gddRows),
            exportFileType: "gdd",
            artifactIds: [],
            shareDescription: "Game brief for \(draft.title). Genre: \(draft.genre). Style: \(draft.style).",
            downloadURL: nil,
            glbDownloadURL: nil,
            rbxmDownloadURL: nil,
            fbxDownloadURL: nil,
            notes: ["Use this brief as the production checklist for systems, content, export, and publish."]
        )
    }

    func convertToTaskList() {
        let taskText = """
        1. Build the core \(draft.genre) loop.
        2. Produce the \(draft.scale.lowercased()) scope of content.
        3. Style the world with a \(draft.style.lowercased()) direction.
        4. Add \(draft.monetization.lowercased()) monetization and retention hooks.
        5. Package game-ready export files and publish notes.
        """
        messages.append(
            ChatMessage(
                id: UUID().uuidString,
                role: .assistant,
                content: taskText,
                quickReplies: ["Generate now", "Refine style", "Add more systems"],
                gddRows: nil,
                createdAt: Date()
            )
        )
    }

    func confirmGeneration() {
        generateFromCurrentPlan()
    }

    func generateFromCurrentPlan() {
        guard !isGenerating else { return }

        if needsNpcVisualPipelineChoice {
            appendNpcVisualPipelineChoiceMessage()
            return
        }

        if needsFurniturePathChoice {
            appendFurniturePathChoiceMessage()
            return
        }

        // Track 3 — pet build-path picker. Same gate as furniture: when the
        // user finishes the interview without having tapped a species chip
        // (which sets petMode directly), prompt them to choose Blocky Parts
        // vs 3D Mesh (Tripo) before kicking off generation.
        if needsPetPathChoice {
            appendPetPathChoiceMessage()
            return
        }

        // 2026-05-20: clothing chats must lock in a 2D Classic / 3D Layered mode
        // BEFORE generation kicks off. The intercept was previously only inside
        // sendQuickReply's "generate!" branch — but generateFromCurrentPlan() is
        // called from 10+ other paths (bottom "Quick Generate" button,
        // confirmGeneration(), various retry/repair paths). Move the gate here
        // so EVERY entry point routes through it.
        if needsClothingModeChoice {
            appendClothingModeChoiceMessage()
            return
        }

        // Warn user if generating game passes without Universe ID
        if contentSubcategory == "passes" {
            let hasUniverseId = !(RobloxAuthService.shared.universeId ?? "").isEmpty
            let hasRobloxAccount = RobloxAuthService.shared.isConnected
            if !hasUniverseId || !hasRobloxAccount {
                let warning = !hasRobloxAccount
                    ? "⚠️ Connect your game account and set Universe ID in Profile to auto-create Game Passes with real IDs. Without it, IDs will be 0 (placeholder)."
                    : "⚠️ Set your Universe ID in Profile → Game Account to auto-create Game Passes with real IDs. Find it in Creator Dashboard → Experience → Overview. Without it, IDs will be 0."
                messages.append(ChatMessage(
                    id: UUID().uuidString,
                    role: .assistant,
                    content: warning,
                    quickReplies: nil,
                    gddRows: nil,
                    createdAt: Date()
                ))
            }
        }

        ChallengeRetentionNotifications.recordGenerationStarted()
        isGenerating = true
        lastFailedGenerationJob = nil

        let thread = currentThread ?? defaultThreads().first!
        if currentThread == nil {
            currentThread = thread
        }

        generationStages = initialGenerationStages()
        liveJobArtifacts = []

        let generatingMessage: String
        let isRu = preferredResponseLanguageCode() == "ru"
        if contentSubcategory == "audio" {
            generatingMessage = isRu ? "Принял. Генерирую аудио." : "On it. Generating your audio now."
        } else if contentSubcategory == "animations" {
            generatingMessage = isRu ? "Генерирую ключевые кадры анимации..." : "Generating your animation keyframes now..."
        } else {
            generatingMessage = isRu
                ? "Зафиксировал. Генерирую \(localizedProjectPackageName()) сейчас."
                : "Locked. I’m generating the \(projectKind.rawValue.lowercased()) package now."
        }

        messages.append(
            ChatMessage(
                id: UUID().uuidString,
                role: .assistant,
                content: generatingMessage,
                quickReplies: nil,
                gddRows: nil,
                createdAt: Date()
            )
        )

        Task {
            do {
                if !generationStages.isEmpty {
                    generationStages[0].status = "completed"
                }
                let response = try await AIWorkspaceAPI.startGeneration(
                    prompt: buildRichGenerationPrompt(),
                    provider: preferredProvider,
                    kind: generationKind,
                    threadId: thread.id,
                    metadata: generationMetadata()
                )

                if generationStages.count > 1 {
                    generationStages[1].status = response.status == "failed" ? "failed" : "processing"
                }

                if self.shouldRunGenerationDetached {
                    applyLatestJobId(response.jobId)
                    let title = self.backgroundGenerationTitle()
                    self.beginBackgroundGenerationMonitor(
                        jobId: response.jobId,
                        title: title,
                        generationKind: generationKind,
                        initialStages: generationStages
                    )
                    generationStages = []
                    liveJobArtifacts = []
                    isGenerating = false
                    messages.append(
                        ChatMessage(
                            id: UUID().uuidString,
                            role: .assistant,
                            content: self.detachedGenerationStartedMessage(title: title),
                            quickReplies: self.preferredResponseLanguageCode() == "ru" ? ["Открыть задачи", "Начать ещё"] : ["View jobs", "Start another"],
                            gddRows: nil,
                            createdAt: Date()
                        )
                    )
                    return
                }

                let job = try await pollJob(jobId: response.jobId)
                generationStages = mapStages(from: job) ?? generationStages

                if job.status == "completed" || job.status == "awaiting_review" || job.status == "partial" {
                    let isRu = self.preferredResponseLanguageCode() == "ru"
                    lastJobId = job.id
                    lastFailedGenerationJob = nil
                    let preview = makePreviewPayload(from: job)
                    activePreview = preview
                    lastPreview = preview
                    if job.status == "awaiting_review" && !["scripts", "decals", "passes", "ui"].contains(contentSubcategory ?? "") {
                        let isDecalApproval = job.metadata?.approvalKind == "decal_upload"
                            && (job.metadata?.pendingDecalApprovals?.isEmpty == false)
                        let isHeroApproval = job.metadata?.pipelinePhase == "hero_concepts_done"
                            && job.metadata?.heroConcepts?.isEmpty == false
                        if isDecalApproval {
                            pendingDecalCandidates = job.metadata?.pendingDecalApprovals ?? []
                            messages.append(
	                                ChatMessage(
	                                    id: UUID().uuidString,
	                                    role: .assistant,
	                                    content: isRu
                                            ? "Проверьте сгенерированные изображения перед загрузкой в подключённый creator account — снимите галочки со всего рискованного."
                                            : "Review the generated images before they upload to your connected creator account — uncheck anything risky.",
	                                    quickReplies: ["Open preview"],
	                                    gddRows: nil,
	                                    createdAt: Date()
	                                )
                            )
                        } else if isHeroApproval {
                            heroConcepts = job.metadata?.heroConcepts ?? []
                            isAwaitingHeroApproval = true
                            messages.append(
	                                ChatMessage(
	                                    id: UUID().uuidString,
	                                    role: .assistant,
	                                    content: isRu
                                            ? "Концепты готовы. Откройте превью, чтобы апрувнуть или перегенерировать каждый вариант."
                                            : "Concepts ready! Open the preview to approve or regenerate each one.",
	                                    quickReplies: ["Open preview"],
	                                    gddRows: nil,
	                                    createdAt: Date()
	                                )
                            )
                        } else {
                            isAwaitingConceptApproval = true
                            messages.append(
	                                ChatMessage(
	                                    id: UUID().uuidString,
	                                    role: .assistant,
	                                    content: isRu
                                            ? "Концепт готов. Откройте превью, чтобы апрувнуть его или перегенерировать новый вариант."
                                            : "Here's your concept image! Open the preview to approve it or regenerate a new one.",
	                                    quickReplies: ["Open preview"],
	                                    gddRows: nil,
	                                    createdAt: Date()
	                                )
                            )
                        }
                    } else {
                        // Extract audio URL for inline player when it's an audio generation
                        let inlineAudioURL: URL? = contentSubcategory == "audio"
                            ? job.artifacts.first(where: { $0.type == "audio" })
                                .flatMap { ($0.downloadUrl ?? $0.url).flatMap(URL.init(string:)) }
                            : nil
                        let isGameResult = projectKind == .game || projectKind == .clone
	                        let completionText: String
	                        if inlineAudioURL != nil {
	                            completionText = isRu
	                                ? "Аудио готово. Откройте превью ниже и экспортируйте файл для Studio."
	                                : "Your audio is ready! Preview below — export to use in Studio."
	                        } else if isGameResult {
	                            let englishFallback = "\(job.metadata?.obbyDescription ?? "Your game package is ready. Review the preview and Studio export.")\n\nTell me what to change and I can regenerate a new version."
	                            completionText = isRu
	                                ? "Пакет игры готов. Проверьте превью и Studio export. Напишите, что изменить, и я перегенерирую новую версию."
	                                : englishFallback
	                        } else {
	                            completionText = isRu
	                                ? "Пакет результата готов. Проверьте превью, файлы и шаги экспорта."
	                                : "Your result package is ready. Review the preview, files and export steps."
	                        }
                        let isClothingResult = contentSubcategory == "clothing"
                            && (job.metadata?.isClothingTexture == true || job.metadata?.isTShirt == true)
                        let completionReplies: [String]
                        if inlineAudioURL != nil {
                            completionReplies = ["Open preview", "Export brief", "Start another"]
                        } else if isClothingResult {
                            completionReplies = ["Open preview", "📦 Publish to Marketplace", "Start another"]
                        } else if isGameResult {
                            completionReplies = ["Open preview", "Regenerate with changes", "Make it closer to prompt", "Start another"]
                        } else {
                            completionReplies = ["Open preview", "Export brief", "Start another"]
                        }
                        messages.append(
                            ChatMessage(
                                id: UUID().uuidString,
                                role: .assistant,
                                content: completionText,
                                quickReplies: completionReplies,
                                gddRows: nil,
                                createdAt: Date(),
                                audioURL: inlineAudioURL
                            )
                        )
                    }
                } else {
                    lastJobId = job.id
                    lastFailedGenerationJob = job
                    if job.stages?.isEmpty == false {
                        let preview = makePreviewPayload(from: job)
                        activePreview = preview
                        lastPreview = preview
                    }
                    messages.append(
                        ChatMessage(
                            id: UUID().uuidString,
                            role: .assistant,
                            content: qualityFailureMessage(from: job),
                            quickReplies: failedGenerationQuickReplies(for: job),
                            gddRows: nil,
                            createdAt: Date()
                        )
                    )
                }
                isGenerating = false
            } catch let stubError as AIWorkspaceAPI.SmartStubBlocked {
                // Smart Stub: feature not yet supported — tokens NOT charged
                isGenerating = false
                generationStages = []
                let stub = stubError.stub
                let stubMsg = stub.stub?.message ?? "This feature is coming soon! Your tokens are safe 🛡️"
                let actions = stub.stub?.alternativeActions ?? ["Generate 3D Model", "Create UI Design", "Browse Community"]
                let hardPivot = stub.hardPivot ?? false

                var replies = actions
                if !hardPivot {
                    replies.append("🗳️ I want this feature!")
                }
                replies.append("Start over")

                activeSmartStub = SmartStubInfo(
                    message: stubMsg,
                    category: stub.stub?.unsupportedCategory,
                    alternativeActions: actions,
                    hardPivot: hardPivot
                )

                messages.append(
                    ChatMessage(
                        id: UUID().uuidString,
                        role: .assistant,
                        content: stubMsg,
                        quickReplies: replies,
                        gddRows: nil,
                        createdAt: Date()
                    )
                )
            } catch let timeout as GenerationPollingTimeout {
                handleGenerationPollingTimeout(timeout)
            } catch {
                stopGenerationFlowAfterError(error)
                messages.append(
                    ChatMessage(
                        id: UUID().uuidString,
                        role: .assistant,
                        content: Self.generationErrorMessage(for: error),
                        quickReplies: ["Retry generation", "Settings", "Refine plan"],
                        gddRows: nil,
                        createdAt: Date()
                    )
                )
            }
        }
    }

    func onProjectPublished(projectId: String) {
        lastPublishedProjectId = projectId
        appendAssistantMessage("Published to Community. Your generated artifact is now available in the moderated feed.")
    }

    func approveConcept() {
        print("[APPROVE] approveConcept called. lastJobId=\(lastJobId ?? "nil"), isAwaitingConceptApproval=\(isAwaitingConceptApproval)")
        guard let jobId = lastJobId, isAwaitingConceptApproval else {
            print("[APPROVE] GUARD FAILED — skipping approve")
            return
        }
        print("[APPROVE] Calling API for jobId=\(jobId)")
        isProcessingConceptAction = true
        Task {
            do {
                let approveResp = try await AIWorkspaceAPI.approveConcept(jobId: jobId, approved: true)
                print("[APPROVE] API returned successfully. status=\(approveResp.status), message=\(approveResp.message ?? "nil")")
                isAwaitingConceptApproval = false
                isProcessingConceptAction = false
                // Session 338: cancel any stale `Needs review` push for this job
                // so it doesn't appear after the user already approved.
                GenerationPushSuppression.markApproved(jobId: jobId)
                clearForegroundGenerationAlertIfMatchingReview(jobId: jobId)
                // Don't close preview — update stages in-place so user sees progress
                ChallengeRetentionNotifications.recordGenerationStarted()
                isGenerating = true
                // Mark concept stages as done, mesh_3d as processing
                if let idx = generationStages.firstIndex(where: { $0.id == "concept_image" }) {
                    generationStages[idx].status = "completed"
                }
                if let idx = generationStages.firstIndex(where: { $0.id == "concept_approval" }) {
                    generationStages[idx].status = "completed"
                }
                if let idx = generationStages.firstIndex(where: { $0.id == "mesh_3d" }) {
                    generationStages[idx].status = "processing"
                }
                // Switch activePreview from concept image (.media) to pipeline view so
                // subsequent refreshLivePipelinePreview() calls during pollJob() update the UI.
                openLivePipelinePreview()
                persistLiveGenerationStatus(
                    jobId: jobId,
                    title: backgroundGenerationTitle(),
                    status: "processing",
                    stages: generationStages
                )
                print("[APPROVE] Stages updated, starting runPhase2 + pollJob...")

                // Launch Phase 2 via long-lived HTTP request (keeps Cloud Run CPU alive
                // for the entire 5-7 min pipeline). Runs in parallel with polling.
                Task {
                    do {
                        let phase2Resp = try await AIWorkspaceAPI.runPhase2(jobId: jobId)
                        print("[APPROVE] runPhase2 completed. status=\(phase2Resp.status)")
                    } catch {
                        print("[APPROVE] runPhase2 failed: \(error)")
                    }
                }

                let job = try await pollJob(jobId: jobId, stopOnAwaitingReview: false)
                print("[APPROVE] pollJob returned. status=\(job.status)")
                generationStages = mapStages(from: job) ?? generationStages
                if job.status == "completed" || job.status == "partial" {
                    lastJobId = job.id
                    let preview = makePreviewPayload(from: job).withId("pipeline-live")
                    activePreview = preview
                    lastPreview = preview
                    appendAssistantMessage("Your 3D model is ready! Review the preview and export.")
                } else if job.status == "failed" {
                    lastJobId = job.id
                    let preview = makePreviewPayload(from: job).withId("pipeline-live")
                    activePreview = preview
                    lastPreview = preview
                    appendAssistantMessage(qualityFailureMessage(from: job))
                }
                isGenerating = false
            } catch let timeout as GenerationPollingTimeout {
                handleGenerationPollingTimeout(timeout)
            } catch {
                print("[APPROVE] ERROR: \(error)")
                isProcessingConceptAction = false
                showSystemToast(systemConnectionToastMessage())
                appendAssistantMessage(safeActionFailureMessage("continue after approval", for: error))
            }
        }
    }

    func regenerateConcept(feedback: String? = nil) {
        guard let jobId = lastJobId, isAwaitingConceptApproval else { return }
        isProcessingConceptAction = true
        Task {
            do {
                let trimmedFeedback = feedback?.trimmingCharacters(in: .whitespacesAndNewlines)
                let response = try await AIWorkspaceAPI.approveConcept(jobId: jobId, approved: false, feedback: trimmedFeedback?.isEmpty == false ? trimmedFeedback : nil)
                isProcessingConceptAction = false
                // Update the concept image in the preview with the new URL
                if let newUrl = response.conceptUrl, URL(string: newUrl) != nil {
                    appendAssistantMessage("New concept generated! Check the preview.")
                    // Re-fetch job to get updated artifacts
                    let job = try await AIWorkspaceAPI.fetchJob(jobId: jobId)
                    generationStages = mapStages(from: job) ?? generationStages
                    let preview = makePreviewPayload(from: job)
                    activePreview = preview
                    lastPreview = preview
                } else {
                    appendAssistantMessage(response.message ?? "Concept regenerated. Open preview to review.")
                }
            } catch {
                isProcessingConceptAction = false
                showSystemToast(systemConnectionToastMessage())
                appendAssistantMessage(safeActionFailureMessage("regenerate the concept", for: error))
            }
        }
    }

    // MARK: - Decal Approval Gate (session 231)

    /// Submit which AI-generated 2D images the user kept checked. Backend
    /// uploads only those buffers as Roblox Decals. Skipped slots end up
    /// as default textures in-game. After backend resumes the pipeline,
    /// `pendingDecalCandidates` clears (next poll won't see them).
    func submitDecalApproval(approvedSlotIds: [String]) {
        guard let jobId = lastJobId else { return }
        guard !pendingDecalCandidates.isEmpty else { return }
        isSubmittingDecalApproval = true
        let candidates = pendingDecalCandidates
        Task {
            defer { isSubmittingDecalApproval = false }
            do {
                let response = try await AIWorkspaceAPI.approveDecals(
                    jobId: jobId,
                    approvedSlotIds: approvedSlotIds
                )
                let approved = response.approvedCount ?? approvedSlotIds.count
                let skipped = response.skippedCount ?? max(0, candidates.count - approvedSlotIds.count)
                appendAssistantMessage(
                    response.message
                    ?? "Approved \(approved) image\(approved == 1 ? "" : "s")"
                       + (skipped > 0 ? ", skipped \(skipped)" : "")
                       + ". Continuing build…"
                )
                pendingDecalCandidates = []
                // Trigger phase-2 resume so backend uploads the approved decals.
                _ = try? await AIWorkspaceAPI.runPhase2(jobId: jobId)
            } catch {
                showSystemToast(systemConnectionToastMessage())
                appendAssistantMessage(safeActionFailureMessage("submit approvals", for: error))
            }
        }
    }

    // MARK: - Hero Asset Approval

    func approveAllHeroConcepts() {
        print("[HERO_APPROVE] approveAllHeroConcepts called. lastJobId=\(lastJobId ?? "nil"), isAwaitingHeroApproval=\(isAwaitingHeroApproval), heroConcepts.count=\(heroConcepts.count), approvedCount=\(heroConcepts.filter(\.approved).count)")
        guard let jobId = lastJobId, isAwaitingHeroApproval else {
            print("[HERO_APPROVE] GUARD FAILED — lastJobId=\(lastJobId ?? "nil"), isAwaitingHeroApproval=\(isAwaitingHeroApproval)")
            return
        }
        let approved = heroConcepts.enumerated().filter { $0.element.approved }
        guard !approved.isEmpty else {
            appendAssistantMessage("Please approve at least one concept before continuing.")
            return
        }
        isProcessingConceptAction = true
        Task {
            do {
                // Only send approved decisions — don't send rejected ones
                // (backend would regenerate rejected ones, wasting time)
                let decisions = heroConcepts.enumerated()
                    .filter { $0.element.approved }
                    .map { (i, _) in ["index": i, "approved": true] as [String: Any] }
                print("[HERO_APPROVE] Calling API with \(decisions.count) decisions...")
                let response = try await AIWorkspaceAPI.approveHeroAssets(jobId: jobId, decisions: decisions)
                print("[HERO_APPROVE] API response: status=\(response.status), approvedCount=\(response.approvedCount ?? -1), heroConcepts=\(response.heroConcepts?.count ?? -1)")
                if response.status == "approved" {
                    isAwaitingHeroApproval = false
                    isProcessingConceptAction = false
                    // Session 338: cancel any stale `Needs review` push for this job.
                    GenerationPushSuppression.markApproved(jobId: jobId)
                    clearForegroundGenerationAlertIfMatchingReview(jobId: jobId)
                    ChallengeRetentionNotifications.recordGenerationStarted()
                    isGenerating = true
                    // Update stages
                    if let idx = generationStages.firstIndex(where: { $0.id == "hero_approval" }) {
                        generationStages[idx].status = "completed"
                    }
                    if let idx = generationStages.firstIndex(where: { $0.id == "concept_approval" }) {
                        generationStages[idx].status = "completed"
                    }
                    if let idx = generationStages.firstIndex(where: { $0.id == "generate_hero_assets" }) {
                        generationStages[idx].status = "processing"
                    }
                    if let idx = generationStages.firstIndex(where: { $0.id == "generate_npc_accessories" }) {
                        generationStages[idx].status = "processing"
                    }
                    openLivePipelinePreview()
                    persistLiveGenerationStatus(
                        jobId: jobId,
                        title: backgroundGenerationTitle(),
                        status: "processing",
                        stages: generationStages
                    )
                    // Launch Phase 2 in parallel
                    Task {
                        do {
                            let phase2Resp = try await AIWorkspaceAPI.runPhase2(jobId: jobId)
                            print("[HERO_APPROVE] runPhase2 completed. status=\(phase2Resp.status)")
                        } catch {
                            print("[HERO_APPROVE] runPhase2 failed: \(error)")
                        }
                    }
                    let job = try await pollJob(jobId: jobId, stopOnAwaitingReview: false)
                    generationStages = mapStages(from: job) ?? generationStages
                    if job.status == "completed" || job.status == "partial" {
                        lastJobId = job.id
                        let preview = makePreviewPayload(from: job).withId("pipeline-live")
                        activePreview = preview
                        lastPreview = preview
                        appendAssistantMessage("Your approved 3D assets are ready! Review the preview and export.")
                    } else if job.status == "failed" {
                        lastJobId = job.id
                        let preview = makePreviewPayload(from: job).withId("pipeline-live")
                        activePreview = preview
                        lastPreview = preview
                        appendAssistantMessage(qualityFailureMessage(from: job))
                    }
                    isGenerating = false
                } else {
                    // Still awaiting_review (regenerations happened)
                    isProcessingConceptAction = false
                    if let updated = response.heroConcepts {
                        heroConcepts = updated
                    }
                    appendAssistantMessage(response.message ?? "Updated — review remaining concepts.")
                }
            } catch let timeout as GenerationPollingTimeout {
                handleGenerationPollingTimeout(timeout)
            } catch {
                print("[HERO_APPROVE] API FAILED: \(error)")
                isProcessingConceptAction = false
                showSystemToast(systemConnectionToastMessage())
                appendAssistantMessage(safeActionFailureMessage("continue after approvals", for: error))
            }
        }
    }

    func toggleHeroConceptApproval(at index: Int) {
        guard index >= 0 && index < heroConcepts.count else { return }
        let current = heroConcepts[index]
        heroConcepts[index] = AIWorkspaceAPI.HeroConcept(
            name: current.name,
            description: current.description,
            imageUrl: current.imageUrl,
            approved: !current.approved
        )
    }

    func regenerateHeroConcept(at index: Int, feedback: String?) {
        print("[HERO_REGEN] regenerateHeroConcept called. index=\(index), lastJobId=\(lastJobId ?? "nil"), isAwaitingHeroApproval=\(isAwaitingHeroApproval)")
        guard let jobId = lastJobId, isAwaitingHeroApproval else {
            print("[HERO_REGEN] GUARD FAILED — lastJobId=\(lastJobId ?? "nil"), isAwaitingHeroApproval=\(isAwaitingHeroApproval)")
            return
        }
        guard index >= 0 && index < heroConcepts.count else { return }
        isProcessingConceptAction = true
        Task {
            do {
                let decisions: [[String: Any]] = [
                    ["index": index, "approved": false, "feedback": feedback ?? ""]
                ]
                print("[HERO_REGEN] Calling API for index=\(index)...")
                let response = try await AIWorkspaceAPI.approveHeroAssets(jobId: jobId, decisions: decisions)
                print("[HERO_REGEN] API response: status=\(response.status), heroConcepts=\(response.heroConcepts?.count ?? -1)")
                isProcessingConceptAction = false
                if let updated = response.heroConcepts {
                    heroConcepts = updated
                    appendAssistantMessage("Regenerated concept for \"\(heroConcepts[index].name)\". Check the preview.")
                } else {
                    print("[HERO_REGEN] WARNING: response.heroConcepts is nil!")
                }
            } catch {
                print("[HERO_REGEN] API FAILED: \(error)")
                isProcessingConceptAction = false
                showSystemToast(systemConnectionToastMessage())
                appendAssistantMessage(safeActionFailureMessage("regenerate the concept", for: error))
            }
        }
    }

    private func startVoiceCapture() {
        Task {
            do {
                try await voiceRecorder.start()
                isRecording = true
                voiceStatusText = "Recording voice prompt..."
                voicePhase = .recording
            } catch VoiceRecorderError.recordingFailed {
                isRecording = false
                voiceStatusText = nil
                voicePhase = .failed
                voiceErrorAlert = "Could not start recording. Please close other apps using the microphone and try again."
            } catch {
                isRecording = false
                voiceStatusText = nil
                voicePhase = .failed
                voiceErrorAlert = "Microphone access is required for voice recording. Please allow it in Settings."
            }
        }
    }

    private func stopVoiceCapture() {
        Task {
            do {
                let clip = try await voiceRecorder.stop()
                isRecording = false
                voiceStatusText = "Uploading voice chunk..."
                voicePhase = .uploading
                let session = try await AIWorkspaceAPI.createVoiceSession(
                    locale: voiceSessionLocale(),
                    metadata: chatMetadata(inputMode: "voice", attachmentKind: nil)
                )
                pendingVoiceSessionID = session.id
                let chunkResponse = try await AIWorkspaceAPI.uploadVoiceChunk(
                    sessionId: session.id,
                    audioBase64: clip.data.base64EncodedString(),
                    mimeType: clip.mimeType,
                    fileName: clip.fileName,
                    isLastChunk: true
                )
                if let partial = chunkResponse.session.partialTranscript,
                   !partial.isEmpty,
                   !partial.hasPrefix("Uploaded ") {
                    voiceStatusText = "Transcribing: \(partial)"
                } else {
                    voiceStatusText = "Finalizing transcription..."
                }
                voicePhase = .finalizing
                let transcription = try await AIWorkspaceAPI.finalizeVoiceSession(
                    sessionId: session.id,
                    metadata: chatMetadata(inputMode: "voice", attachmentKind: nil)
                )
                if transcription.status == "failed" || transcription.session.status == "failed" {
                    let backendError = transcription.session.lastError ?? "Transcription failed on server."
                    voiceStatusText = backendError
                    voicePhase = .failed
                    voiceErrorAlert = "Voice transcription error: \(backendError)"
                    return
                }
                let transcript = transcription.transcript?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                guard !transcript.isEmpty else {
                    voiceStatusText = transcription.session.partialTranscript ?? "No transcript returned."
                    voicePhase = .failed
                    voiceErrorAlert = "Speech could not be recognized. Try recording again in a quieter place and speak clearly."
                    return
                }
                voiceStatusText = nil
                voicePhase = .idle
                pendingVoiceSessionID = nil
                pendingVoiceTranscript = transcript
            } catch VoiceRecorderError.recordingTooShort {
                isRecording = false
                voiceStatusText = nil
                voicePhase = .failed
                voiceErrorAlert = "Recording was too short. Hold the mic button longer and speak clearly."
            } catch VoiceRecorderError.emptyAudioData {
                isRecording = false
                voiceStatusText = nil
                voicePhase = .failed
                voiceErrorAlert = "No audio was captured. Please try again."
            } catch VoiceRecorderError.audioTooQuiet {
                isRecording = false
                voiceStatusText = nil
                voicePhase = .failed
                voiceErrorAlert = preferredResponseLanguageCode() == "ru"
                    ? "Микрофон не услышал речь. Проверь, что не подключены наушники без микрофона, и говори громче."
                    : "We didn't pick up any speech. Check your mic isn't muted and speak closer to the device."
            } catch {
                isRecording = false
                voiceStatusText = "Voice transcription failed."
                voicePhase = .failed
                voiceErrorAlert = "Voice transcription failed. Try a shorter recording or check your internet connection."
            }
        }
    }

    func retryPendingVoiceTranscription() {
        guard let pendingVoiceSessionID else { return }
        Task {
            do {
                voiceStatusText = "Retrying final transcription..."
                voicePhase = .finalizing
                let transcription = try await AIWorkspaceAPI.finalizeVoiceSession(
                    sessionId: pendingVoiceSessionID,
                    metadata: chatMetadata(inputMode: "voice", attachmentKind: nil)
                )
                if transcription.status == "failed" || transcription.session.status == "failed" {
                    let backendError = transcription.session.lastError ?? "Transcription failed on server."
                    voiceStatusText = backendError
                    voicePhase = .failed
                    voiceErrorAlert = "Voice transcription error: \(backendError)"
                    return
                }
                let transcript = transcription.transcript?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                guard !transcript.isEmpty else {
                    voiceStatusText = transcription.session.partialTranscript ?? "Still waiting for transcript."
                    voicePhase = .failed
                    return
                }
                voiceStatusText = nil
                voicePhase = .idle
                self.pendingVoiceSessionID = nil
                pendingVoiceTranscript = transcript
            } catch {
                voiceStatusText = "Voice retry failed."
                voicePhase = .failed
                showSystemToast(systemConnectionToastMessage())
                voiceErrorAlert = safeActionFailureMessage("retry voice transcription", for: error)
            }
        }
    }

    private func send(
        _ text: String,
        quickReply: String?,
        inputMode: String = "text",
        attachmentKind: String?,
        forceSkipInterview: Bool = false,
        imageURL: URL? = nil,
        localImageKey: String? = nil,
        attachmentAssetId: String? = nil,
        attachmentImageURL: URL? = nil,
        appendUserMessage: Bool = true
    ) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        if Self.isStartOverCommand(trimmed) {
            resetInterview()
            return
        }

        if appendUserMessage {
            let userMsg = ChatMessage(
                id: UUID().uuidString,
                role: .user,
                content: trimmed,
                quickReplies: nil,
                gddRows: nil,
                createdAt: Date(),
                imageURL: imageURL,
                localImageKey: localImageKey
            )
            messages.append(userMsg)
        }

        let thread = currentThread ?? defaultThreads().first!
        if currentThread == nil {
            currentThread = thread
            if threads.isEmpty {
                threads = defaultThreads()
            }
        }

        let retryRequest = PendingChatRetryRequest(
            text: trimmed,
            quickReply: quickReply,
            inputMode: inputMode,
            attachmentKind: attachmentKind,
            forceSkipInterview: forceSkipInterview,
            imageURL: imageURL,
            localImageKey: localImageKey,
            attachmentAssetId: attachmentAssetId,
            attachmentImageURL: attachmentImageURL
        )

        isLoading = true
        Task {
            do {
                var metadata = chatMetadata(inputMode: inputMode, attachmentKind: attachmentKind)
                if let attachmentAssetId {
                    metadata["attachmentAssetId"] = attachmentAssetId
                }
                // Backend chat handler reads `attachmentImageUrl` and runs Gemini Vision
                // on it before building the prompt — see /api/chat/threads/:id/messages.
                if let urlString = attachmentImageURL?.absoluteString {
                    metadata["attachmentImageUrl"] = urlString
                }
                let response = try await AIWorkspaceAPI.sendMessage(
                    threadId: thread.id,
                    message: trimmed,
                    quickReply: quickReply,
                    provider: preferredChatProvider,
                    skipInterview: forceSkipInterview || (preferredFlow == .quickGenerate && contentSubcategory != "clothing"),
                    metadata: metadata
                )
                pendingChatRetryRequest = nil
                applyResponse(response, for: thread.id)
            } catch {
                if case APIError.banned = error {
                    isLoading = false
                    return
                }
                pendingChatRetryRequest = retryRequest
                showSystemToast(systemConnectionToastMessage())
                let backendMessage = safeChatFailureMessage(for: error)
                let replies = safeChatFailureReplies(for: error)
                messages.append(
                    ChatMessage(
                        id: UUID().uuidString,
                        role: .assistant,
                        content: backendMessage,
                        quickReplies: replies,
                        gddRows: nil,
                        createdAt: Date()
                    )
                )
            }
            isLoading = false
        }
    }

    private func retryPendingChatRequest() -> Bool {
        guard let request = pendingChatRetryRequest else { return false }
        pendingChatRetryRequest = nil
        send(
            request.text,
            quickReply: request.quickReply,
            inputMode: request.inputMode,
            attachmentKind: request.attachmentKind,
            forceSkipInterview: request.forceSkipInterview,
            imageURL: request.imageURL,
            localImageKey: request.localImageKey,
            attachmentAssetId: request.attachmentAssetId,
            attachmentImageURL: request.attachmentImageURL,
            appendUserMessage: false
        )
        return true
    }

    private static func isRetryCommand(_ normalized: String) -> Bool {
        normalized == "retry"
            || normalized == "try again"
            || normalized == "retry generation"
            || normalized == "retry export"
            || normalized == "повторить"
            || normalized == "попробовать снова"
            || normalized == "ещё раз"
            || normalized == "еще раз"
    }

    private static func isOpenPreviewCommand(_ normalized: String) -> Bool {
        normalized == "open preview"
            || normalized == "open approval"
            || normalized == "открыть превью"
            || normalized == "открыть апрув"
            || normalized == "апрув"
    }

    private static func isViewJobsCommand(_ normalized: String) -> Bool {
        normalized == "view jobs"
            || normalized == "open jobs"
            || normalized == "jobs"
            || normalized == "задачи"
            || normalized == "открыть задачи"
            || normalized == "посмотреть задачи"
    }

    private func normalizedQuickReply(_ option: String) -> String {
        option.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func shouldRetryGenerationFromLastAssistantMessage() -> Bool {
        guard let lastAssistant = messages.last(where: { $0.role == .assistant }) else { return false }
        let content = lastAssistant.content.lowercased()
        let replies = Set((lastAssistant.quickReplies ?? []).map { $0.lowercased() })
        return content.hasPrefix("generation error:")
            || content.contains("connection error")
            || content.contains("ошибка соединения")
            || content.contains("generation stopped")
            || content.contains("generation did not finish")
            || content.contains("export stayed in progress")
            || content.contains("the generation did not finish successfully")
            || (replies.contains("try again") && replies.contains("change provider"))
            || replies.contains("retry generation")
    }

    func clearSystemToast(id: UUID) {
        if systemToast?.id == id {
            systemToast = nil
        }
    }

    private func showSystemToast(_ message: String) {
        systemToast = SystemToast(message: message)
    }

    private func systemConnectionToastMessage() -> String {
        preferredResponseLanguageCode() == "ru" ? "Ошибка соединения" : "Connection error"
    }

    private func safeChatFailureMessage(for error: Error) -> String {
        let isRu = preferredResponseLanguageCode() == "ru"
        if Self.isAuthFailure(error) {
            return isRu
                ? "Сессия истекла. Войдите снова, затем нажмите Retry."
                : "Your session expired. Sign in again, then tap Retry."
        }
        if Self.isTransientNetworkError(error) {
            return isRu
                ? "Ошибка соединения. Я остановил диалог и сохранил ваш запрос — повторите, когда сеть вернётся."
                : "Connection error. I stopped the chat step and kept your request — retry when the connection is back."
        }
        return isRu
            ? "Сервис временно недоступен. Я остановил этот шаг, чтобы не продолжать фейковый диалог."
            : "The service is temporarily unavailable. I stopped this step so the chat does not continue with a fake response."
    }

    private func safeChatFailureReplies(for error: Error) -> [String] {
        if Self.isAuthFailure(error) {
            return ["Open Profile", "Retry"]
        }
        return ["Retry", "Refine plan"]
    }

    private func safeActionFailureMessage(_ action: String, for error: Error) -> String {
        let isRu = preferredResponseLanguageCode() == "ru"
        if Self.isAuthFailure(error) {
            return isRu
                ? "Сессия истекла. Войдите снова и повторите действие."
                : "Your session expired. Sign in again and retry this action."
        }
        if Self.isTransientNetworkError(error) {
            return isRu
                ? "Ошибка соединения. Я остановил действие, чтобы не продолжать flow вслепую."
                : "Connection error. I stopped the action so the flow does not continue blindly."
        }
        return isRu
            ? "Сервис временно недоступен. Повторите действие чуть позже."
            : "The service is temporarily unavailable. Try to \(action) again in a moment."
    }

    private static func isAuthFailure(_ error: Error) -> Bool {
        if case APIError.httpError(let statusCode) = error {
            return statusCode == 401 || statusCode == 403
        }
        return false
    }

    private static func generationErrorMessage(for error: Error) -> String {
        if isTransientNetworkError(error) {
            return "Connection error. I stopped generation before export, so no fake result was created. Tap Retry generation when the connection is back."
        }
        if isAuthFailure(error) {
            return "Your session expired before generation finished. Sign in again, then retry generation."
        }
        return "Generation stopped before export. I did not create a fake result. Please retry or refine the plan."
    }

    private static func isStartOverCommand(_ text: String) -> Bool {
        let normalized = text.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
        return normalized == "start over"
            || normalized == "start another"
            || normalized == "start fresh chat"
            || normalized == "начать сначала"
            || normalized == "начать заново"
            || normalized == "начать ещё"
            || normalized == "начать еще"
    }

    private func applyResponse(_ response: AIWorkspaceAPI.ChatResponse, for threadId: String) {
        let remoteGDD = response.message?.gdd ?? response.gdd
        if let remoteGDD {
            apply(remoteGDD: remoteGDD)
        }
        applyProjectMemory(response.projectMemory)

        let assistantText = sanitizedAssistantText(
            response.message?.content ?? response.question ?? "I updated your game plan."
        )
        let replies = response.message?.quickReplies ?? response.quickReplies
        let resolvedGDDRows: [(String, String)]?
        if let remoteRows = response.message?.gddRows, !remoteRows.isEmpty {
            resolvedGDDRows = sanitizedGddRows(remoteRows.map { ($0.key, $0.value) })
        } else if let remoteGDD {
            resolvedGDDRows = sanitizedGddRows(gddRows(from: remoteGDD))
        } else {
            resolvedGDDRows = nil
        }

        // Session #095 — pick up weapon color picker defaults (from weapon_interview Turn 2)
        let colorPayload: ChatMessage.WeaponColorPickerPayload? = {
            guard let cp = response.message?.colorPicker ?? response.colorPicker else { return nil }
            return ChatMessage.WeaponColorPickerPayload(
                primaryHex: cp.primary ?? "#C0C0C0",
                accentHex:  cp.accent  ?? "#1A1A1A",
                glowHex:    cp.glow    ?? "#4FC3F7"
            )
        }()

        messages.append(
            ChatMessage(
                id: response.message?.id ?? UUID().uuidString,
                role: .assistant,
                content: assistantText,
                quickReplies: replies,
                gddRows: resolvedGDDRows,
                createdAt: Date(),
                weaponColors: colorPayload
            )
        )

        if let title = response.threadTitle {
            updateThread(threadId: threadId, title: title, promptHint: draft.genre)
        }

        // Auto-trigger generation when Smart Interview says "generating"
        if response.action == "generating" {
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: 300_000_000) // 0.3s delay for UI
                if needsNpcVisualPipelineChoice {
                    appendNpcVisualPipelineChoiceMessage()
                    return
                }
                if needsFurniturePathChoice {
                    appendFurniturePathChoiceMessage()
                    return
                }
                if needsPetPathChoice {
                    appendPetPathChoiceMessage()
                    return
                }
                generateFromCurrentPlan()
            }
        }
    }

    private func apply(remoteGDD: AIWorkspaceAPI.RemoteGDD) {
        draft.title = remoteGDD.title
        draft.genre = remoteGDD.genre
        draft.scale = remoteGDD.scale.capitalized
        draft.style = remoteGDD.visualStyle ?? "Bright trending style"
        draft.monetization = (remoteGDD.monetization ?? ["VIP", "Boosts"]).joined(separator: ", ")
        // 2026-05-20: Mode source-of-truth for clothing is the iOS picker, never
        // the LLM. The Smart Interview prompt asks the LLM to write clothingMode
        // into GDD, but the model was hallucinating "layered_3d" for items the
        // user picked as 2D Classic (T-Shirt, Classic Shirt/Pants/Outfit). That
        // silently routed jobs into Meshy/3D and the user saw "I picked 2D but
        // it went 3D".
        //
        // Trust order:
        //   1. T-Shirt → always classic_2d (Roblox has no layered T-Shirt
        //      AccessoryType — non-negotiable).
        //   2. Welcome-picker locked clothingType (t_shirt / classic_* / layered_*) →
        //      ignore GDD.clothingMode entirely. Mode comes from welcome-picker
        //      (T-Shirt) or from the "Generate as 2D Classic / 3D Layered"
        //      quick-reply chat sent at end of interview.
        //   3. No clothingType set yet (raw text → LLM-driven flow) → accept
        //      GDD.clothingMode as the LLM's best guess.
        if let mode = remoteGDD.clothingMode {
            if draft.clothingType == "t_shirt" {
                draft.clothingMode = "classic_2d"
            } else if draft.clothingType == nil || (draft.clothingType?.isEmpty == true) {
                draft.clothingMode = mode
            }
            // else: clothingType was set via welcome-picker — ignore GDD.clothingMode,
            // user will pick via the mode-picker chat at end of interview.
        }
	        if contentSubcategory == "npcs" || contentSubcategory == "roast_npc" {
	            draft.npcTheme = remoteGDD.theme
	            draft.npcVisualHooks = remoteGDD.characters?.filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
	            draft.npcMechanics = remoteGDD.mechanics
            draft.npcSystems = remoteGDD.systems

            if let role = Self.valueAfterAnyPrefix(["Role:", "Роль:"], in: remoteGDD.mechanics),
               let normalized = Self.normalizedNpcRole(role) {
                draft.npcRole = normalized
            }
            if let behavior = Self.valueAfterAnyPrefix(["Behavior:", "Поведение:"], in: remoteGDD.mechanics),
               let normalized = Self.normalizedNpcBehaviorMode(behavior) {
	                draft.npcBehaviorMode = normalized
	            }
	        }
	        if contentSubcategory == "items" {
	            let itemHints = [
	                remoteGDD.mechanics,
	                remoteGDD.systems,
	                remoteGDD.technicalNotes ?? [],
	                remoteGDD.economy ?? []
	            ].flatMap { $0 }
	            draft.itemType = remoteGDD.itemType ?? Self.valueAfterAnyPrefix(["ItemType:", "Item Type:", "Тип предмета:"], in: itemHints) ?? draft.itemType
	            draft.itemUseMode = remoteGDD.useMode ?? Self.valueAfterAnyPrefix(["UseMode:", "Use Mode:", "Режим:"], in: itemHints) ?? draft.itemUseMode
	            draft.itemEffect = remoteGDD.effect ?? Self.valueAfterAnyPrefix(["Effect:", "Эффект:"], in: itemHints) ?? draft.itemEffect
	            draft.itemEffectValue = Self.numberString(remoteGDD.effectValue) ?? Self.valueAfterAnyPrefix(["EffectValue:", "Effect Value:", "Value:", "Сила:"], in: itemHints) ?? draft.itemEffectValue
	            draft.itemEffectDuration = Self.numberString(remoteGDD.effectDuration) ?? Self.valueAfterAnyPrefix(["EffectDuration:", "Duration:", "Длительность:"], in: itemHints) ?? draft.itemEffectDuration
	            draft.itemTagName = remoteGDD.tagName ?? Self.valueAfterAnyPrefix(["TagName:", "Tag:", "Тег:"], in: itemHints) ?? draft.itemTagName
	            draft.itemCurrencyName = remoteGDD.currencyName ?? Self.valueAfterAnyPrefix(["CurrencyName:", "Currency:", "Валюта:"], in: itemHints) ?? draft.itemCurrencyName
	            draft.itemResourceName = remoteGDD.resourceName ?? Self.valueAfterAnyPrefix(["ResourceName:", "Resource:", "Ресурс:"], in: itemHints) ?? draft.itemResourceName
	            draft.itemCooldown = Self.numberString(remoteGDD.cooldown) ?? Self.valueAfterAnyPrefix(["Cooldown:", "Кулдаун:"], in: itemHints) ?? draft.itemCooldown
	        }
	    }

	    private static func numberString(_ value: Double?) -> String? {
	        guard let value else { return nil }
	        if value.rounded() == value {
	            return String(Int(value))
	        }
	        return String(value)
	    }

	    private static func valueAfterAnyPrefix(_ prefixes: [String], in values: [String]) -> String? {
        for value in values {
            let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
            for prefix in prefixes {
                if trimmed.lowercased().hasPrefix(prefix.lowercased()) {
                    let suffix = trimmed.dropFirst(prefix.count)
                        .trimmingCharacters(in: .whitespacesAndNewlines)
                    if !suffix.isEmpty { return String(suffix) }
                }
            }
        }
        return nil
    }

    private static func normalizedNpcRole(_ raw: String) -> String? {
        let lower = raw.lowercased()
        if lower.contains("quest") || lower.contains("квест") || lower.contains("задани") || lower.contains("выдав") {
            return "quest_giver"
        }
        if lower.contains("merchant") || lower.contains("shop") || lower.contains("trade") || lower.contains("торгов") || lower.contains("купец") {
            return "merchant"
        }
        if lower.contains("enemy") || lower.contains("attacker") || lower.contains("враг") || lower.contains("агрессив") {
            return "enemy"
        }
        if lower.contains("boss") || lower.contains("босс") {
            return "boss"
        }
        if lower.contains("companion") || lower.contains("ally") || lower.contains("спутник") || lower.contains("союзник") {
            return "companion"
        }
        if lower.contains("villain") || lower.contains("злод") {
            return "villain"
        }
        if lower.contains("guard") || lower.contains("patrol") || lower.contains("страж") || lower.contains("охран") || lower.contains("патрул") {
            return "guard"
        }
        if lower.contains("dialog") || lower.contains("talk") || lower.contains("диалог") {
            return "dialogue"
        }
        return nil
    }

    private static func normalizedNpcBehaviorMode(_ raw: String) -> String? {
        let lower = raw.lowercased()
        if lower.contains("chase") || lower.contains("attack") || lower.contains("агрессив") || lower.contains("атак") || lower.contains("преслед") {
            return "chase_attack"
        }
        if lower.contains("patrol") || lower.contains("патрул") || lower.contains("маршрут") {
            return "patrol"
        }
        if lower.contains("wander") || lower.contains("брод") || lower.contains("ходит") {
            return "wander"
        }
        if lower.contains("follow") || lower.contains("след") || lower.contains("спутник") {
            return "follow"
        }
        if lower.contains("stationary") || lower.contains("сто") || lower.contains("мест") {
            return "stationary"
        }
        return nil
    }

    private func pollJob(jobId: String, stopOnAwaitingReview: Bool = true) async throws -> AIWorkspaceAPI.GenerationJob {
        let isAnimationPipeline = contentSubcategory == "animations"
        let isLightPipeline = contentSubcategory == "audio" || isAnimationPipeline
        let is3DPipeline = (projectKind == .content || projectKind == .ugc) && !isLightPipeline
        let isGamePipeline = projectKind == .game || projectKind == .clone
        // Game pipeline may run close to the backend 15 min budget when Meshy
        // hero assets + Roblox uploads are slow. Poll slightly past that so we
        // can surface a clear stale-processing state instead of leaving the
        // live preview spinner stranded on the last processing stage.
        let maxAttempts = is3DPipeline ? 120 : isGamePipeline ? 240 : isAnimationPipeline ? 100 : 8
        let intervalNanos: UInt64 = is3DPipeline ? 5_000_000_000 : isGamePipeline ? 4_000_000_000 : isAnimationPipeline ? 2_000_000_000 : 1_200_000_000

        var consecutiveTransientFailures = 0
        let maxConsecutiveTransientFailures = 8 // ≈ 32s @ 4s interval before giving up
        for attempt in 0..<maxAttempts {
            let job: AIWorkspaceAPI.GenerationJob
            do {
                job = try await AIWorkspaceAPI.fetchJob(jobId: jobId)
                consecutiveTransientFailures = 0
            } catch {
                // Transient network errors (connection lost, timeout, DNS flap, offline)
                // must NOT kill a long-running job that's still processing on the server.
                // Retry with the same polling cadence; only bail after many consecutive failures.
                if Self.isTransientNetworkError(error) {
                    consecutiveTransientFailures += 1
                    print("[pollJob] transient network error (\(consecutiveTransientFailures)/\(maxConsecutiveTransientFailures)): \(error.localizedDescription)")
                    if consecutiveTransientFailures >= maxConsecutiveTransientFailures {
                        throw error
                    }
                    try await Task.sleep(nanoseconds: intervalNanos)
                    continue
                }
                throw error
            }
            if !job.artifacts.isEmpty {
                liveJobArtifacts = job.artifacts
            }
            if let serverStages = mapStages(from: job) {
                if job.status != "awaiting_review" || stopOnAwaitingReview {
                    generationStages = serverStages
                    persistLiveGenerationStatus(job: job, stages: serverStages)
                    refreshLivePipelinePreview()
                }
            }
            if Self.isTerminalJobStatus(job.status, includingAwaitingReview: stopOnAwaitingReview) {
                return job
            }

            if !is3DPipeline, generationStages.indices.contains(min(attempt + 1, max(generationStages.count - 1, 0))) {
                let stageIndex = min(attempt + 1, generationStages.count - 1)
                generationStages[stageIndex].status = "processing"
            }
            try await Task.sleep(nanoseconds: intervalNanos)
        }

        let finalJob = try await AIWorkspaceAPI.fetchJob(jobId: jobId)
        if !finalJob.artifacts.isEmpty {
            liveJobArtifacts = finalJob.artifacts
        }
        if let serverStages = mapStages(from: finalJob) {
            if finalJob.status != "awaiting_review" || stopOnAwaitingReview {
                generationStages = serverStages
                persistLiveGenerationStatus(job: finalJob, stages: serverStages)
                refreshLivePipelinePreview()
            }
        }
        if Self.isTerminalJobStatus(finalJob.status, includingAwaitingReview: stopOnAwaitingReview) {
            return finalJob
        }

        let elapsedSeconds = Int((Double(maxAttempts) * Double(intervalNanos)) / 1_000_000_000)
        throw GenerationPollingTimeout(job: finalJob, elapsedSeconds: elapsedSeconds)
    }

    private static func isTerminalJobStatus(_ status: String, includingAwaitingReview: Bool = true) -> Bool {
        status == "completed" || status == "failed" || status == "partial" || (includingAwaitingReview && status == "awaiting_review")
    }

    private func stopGenerationFlowAfterError(_ error: Error) {
        markCurrentGenerationStageFailed()
        refreshLivePipelinePreview()
        isGenerating = false
        isProcessingConceptAction = false
        showSystemToast(systemConnectionToastMessage())
    }

    private func markCurrentGenerationStageFailed() {
        guard !generationStages.isEmpty else { return }
        let index = generationStages.firstIndex(where: { $0.status == "processing" })
            ?? generationStages.firstIndex(where: { $0.status == "pending" })
            ?? generationStages.indices.last
        guard let index else { return }
        let stage = generationStages[index]
        generationStages[index] = GenerationStage(
            id: stage.id,
            title: stage.title,
            status: "failed"
        )
    }

    private func handleGenerationPollingTimeout(_ timeout: GenerationPollingTimeout) {
        lastJobId = timeout.job.id
        if let serverStages = mapStages(from: timeout.job) {
            generationStages = serverStages
        }
        if let staleIndex = generationStages.firstIndex(where: { $0.status == "processing" })
            ?? generationStages.lastIndex(where: { $0.status == "pending" }) {
            let staleStage = generationStages[staleIndex]
            generationStages[staleIndex] = GenerationStage(
                id: staleStage.id,
                title: "\(staleStage.title) timed out",
                status: "failed"
            )
        }
        refreshLivePipelinePreview()
        lastPreview = activePreview ?? lastPreview
        isGenerating = false
        isProcessingConceptAction = false

        messages.append(
            ChatMessage(
                id: UUID().uuidString,
                role: .assistant,
	                content: preferredResponseLanguageCode() == "ru"
                        ? "Экспорт висел в процессе больше \(timeout.elapsedSeconds / 60) минут. Я остановил live spinner, чтобы чат не выглядел зависшим. Сервер ещё может закончить задачу — вернитесь в этот чат позже или повторите экспорт."
                        : "The export stayed in progress for more than \(timeout.elapsedSeconds / 60) minutes. I stopped the live spinner so you are not stuck. The server may still finish it; reopen this chat in a bit or retry the export.",
	                quickReplies: ["Open preview", "Retry", "Start another"],
	                gddRows: nil,
	                createdAt: Date()
	            )
        )
    }

    /// Classifies a polling error as transient (worth retrying) vs fatal.
    /// Returns true for URLError codes that indicate a temporary network blip:
    /// connection lost, timed out, offline, DNS failure, cannot connect, etc.
    /// Server-side errors (4xx/5xx) are NOT transient — they propagate.
    private static func isTransientNetworkError(_ error: Error) -> Bool {
        let nsError = error as NSError
        if nsError.domain == NSURLErrorDomain {
            switch nsError.code {
            case NSURLErrorTimedOut,
                 NSURLErrorCannotFindHost,
                 NSURLErrorCannotConnectToHost,
                 NSURLErrorNetworkConnectionLost,
                 NSURLErrorDNSLookupFailed,
                 NSURLErrorNotConnectedToInternet,
                 NSURLErrorInternationalRoamingOff,
                 NSURLErrorCallIsActive,
                 NSURLErrorDataNotAllowed,
                 NSURLErrorSecureConnectionFailed,
                 NSURLErrorCannotLoadFromNetwork:
                return true
            default:
                return false
            }
        }
        if let urlError = error as? URLError {
            switch urlError.code {
            case .timedOut, .cannotFindHost, .cannotConnectToHost,
                 .networkConnectionLost, .dnsLookupFailed, .notConnectedToInternet,
                 .internationalRoamingOff, .callIsActive, .dataNotAllowed,
                 .secureConnectionFailed, .cannotLoadFromNetwork:
                return true
            default:
                return false
            }
        }
        return false
    }

    private static let textureClothingPattern = try! NSRegularExpression(
        pattern: "jacket|shirt|hoodie|sweater|vest|coat|dress|pants|skirt|cape|tshirt|t-shirt|fur|blouse|top|jeans|shorts|trousers|майка|футболка|куртка|кофта|худи|жилет|шуба|свитер|пальто|блузка|штаны|джинсы|шорты|юбка|брюки|платье",
        options: .caseInsensitive
    )

    private static func isTextureClothing(_ text: String) -> Bool {
        let range = NSRange(text.startIndex..., in: text)
        return textureClothingPattern.firstMatch(in: text, range: range) != nil
    }

    private var looksLikeTextureClothing: Bool {
        contentSubcategory == "clothing" || Self.isTextureClothing(draft.title)
    }

    private func generationStage(id: String, title: String, status: String) -> GenerationStage {
        GenerationStage(id: id, title: localizedGenerationStageTitle(id: id, fallback: title), status: status)
    }

    private func localizedGenerationStageTitle(id: String, fallback: String) -> String {
        guard preferredResponseLanguageCode() == "ru" else { return fallback }
        let lower = fallback.lowercased()
        switch id {
        case "concept_image":
            if lower.contains("npc") { return "Концепт-изображение NPC" }
            if lower.contains("preview") { return "Превью" }
            return "Концепт-изображение"
        case "concept_approval", "hero_approval":
            return lower.contains("npc") ? "Апрув концепта NPC" : "Ожидает апрува"
        case "mesh_3d":
            return lower.contains("npc") ? "3D-меш NPC" : "3D-меш"
        case "convert_fbx":
            return lower.contains("npc") ? "Конвертация NPC-меша" : "Конвертация в FBX"
        case "upload_asset", "upload_roblox":
            return lower.contains("npc") ? "Загрузка NPC-ассета" : "Загрузка ассета"
        case "mesh_optimized":
            return "Оптимизация меша"
        case "rig_r15":
            return lower.contains("npc") ? "Подготовка R15-рига NPC" : "Auto-rig R15"
        case "export_model":
            return lower.contains("intermediate") || lower.contains("npc") ? "Промежуточная NPC-модель" : "Экспорт модели"
        case "generate_npc_behavior", "generate_character_scripts":
            return "Поведение NPC"
        case "generate_vehicle_scripts":
            return "Контроллер транспорта"
        case "quality_review":
            return "Проверка качества"
        case "export_rbxm":
            if lower.contains("npc") { return "Экспорт NPC RBXM" }
            if lower.contains("vehicle") || lower.contains("transport") { return "Экспорт Vehicle RBXM" }
            return "Сборка RBXM"
        case "generate_keyframes":
            return "Ключевые кадры"
        case "generate_cages":
            return "Генерация cage-моделей"
        case "package_accessory":
            return "Упаковка аксессуара"
        case "clothing_texture":
            return "Текстура одежды"
        case "generating":
            if lower.contains("audio") { return "Генерация аудио" }
            if lower.contains("script") { return "Генерация скриптов" }
            if lower.contains("texture") { return "Генерация текстуры" }
            if lower.contains("shop") { return "Генерация магазина" }
            if lower.contains("ui") { return "Генерация UI" }
            return "Генерация"
        case "processing":
            return lower.contains("image") ? "Обработка изображения" : "Обработка"
        case "planning":
            return "Планирование систем"
        case "provider":
            return "Запрос к провайдеру"
        case "artifacts":
            return "Сохранение файлов"
        case "export":
            return "Подготовка экспорта"
        default:
            return fallback
        }
    }

    private func initialGenerationStages() -> [GenerationStage] {
        if contentSubcategory == "audio" {
            return [
                GenerationStage(id: "generating", title: "Generating audio", status: "pending"),
                GenerationStage(id: "processing", title: "Processing", status: "pending"),
                GenerationStage(id: "export_rbxm", title: "Building .rbxm", status: "pending"),
                GenerationStage(id: "export", title: "Export", status: "pending")
            ]
        }
        if contentSubcategory == "animations" {
            return [
                GenerationStage(id: "generate_keyframes", title: "Generating keyframes", status: "pending"),
                GenerationStage(id: "convert_fbx", title: "Converting to FBX", status: "pending"),
                GenerationStage(id: "upload_asset", title: "Publishing asset", status: "pending"),
                GenerationStage(id: "export_rbxm", title: "Building .rbxm", status: "pending")
            ]
        }
        // Scripts / Systems / Anime Skills don't go through 3D modeling — short pipeline
        if contentSubcategory == "scripts" || contentSubcategory == "anime_skills" {
            return [
                GenerationStage(id: "generating", title: "Generating scripts", status: "pending"),
                GenerationStage(id: "concept_image", title: "Preview image", status: "pending"),
                GenerationStage(id: "export_rbxm", title: "Building .rbxm", status: "pending"),
            ]
        }
        // Decals / Textures — Fal.ai image generation, no 3D mesh
        if contentSubcategory == "decals" {
            return [
                GenerationStage(id: "generating", title: "Generating texture", status: "pending"),
                GenerationStage(id: "processing", title: "Processing image", status: "pending"),
                GenerationStage(id: "export_rbxm", title: "Building .rbxm", status: "pending"),
            ]
        }
        // Game Passes — Lua code generation (shop UI + server logic)
        if contentSubcategory == "passes" {
            return [
                GenerationStage(id: "generating", title: "Generating shop", status: "pending"),
                GenerationStage(id: "concept_image", title: "Preview image", status: "pending"),
                GenerationStage(id: "export_rbxm", title: "Building .rbxm", status: "pending"),
            ]
        }
        // UI / HUD — Lua code generation
        if contentSubcategory == "ui" {
            return [
                GenerationStage(id: "generating", title: "Generating UI", status: "pending"),
                GenerationStage(id: "concept_image", title: "Preview image", status: "pending"),
                GenerationStage(id: "export_rbxm", title: "Building .rbxm", status: "pending"),
            ]
        }
        if contentSubcategory == "vehicles" {
            return [
                generationStage(id: "generate_vehicle_scripts", title: "Configure vehicle controller", status: "pending"),
                generationStage(id: "quality_review", title: "Vehicle package QA", status: "pending"),
                generationStage(id: "export_rbxm", title: "Export Vehicle RBXM", status: "pending")
            ]
        }
        if contentSubcategory == "npcs" || contentSubcategory == "roast_npc" {
            if draft.npcVisualPipeline == "asset_template_v1" {
                return [
                    generationStage(id: "generate_npc_behavior", title: "Generate NPC behavior", status: "pending"),
                    generationStage(id: "concept_image", title: "NPC 2D preview", status: "pending"),
                    generationStage(id: "export_rbxm", title: "Export NPC RBXM", status: "pending")
                ]
            }
            return [
                generationStage(id: "concept_image", title: "NPC concept image", status: "pending"),
                generationStage(id: "concept_approval", title: "Approve NPC concept", status: "pending"),
                generationStage(id: "mesh_3d", title: "NPC 3D mesh", status: "pending"),
                generationStage(id: "convert_fbx", title: "Convert NPC mesh", status: "pending"),
                generationStage(id: "upload_asset", title: "Upload NPC asset", status: "pending"),
                generationStage(id: "mesh_optimized", title: "Optimize NPC mesh", status: "pending"),
                generationStage(id: "rig_r15", title: "Prepare NPC rig bridge", status: "pending"),
                generationStage(id: "export_model", title: "Intermediate NPC model", status: "pending"),
                generationStage(id: "generate_npc_behavior", title: "Generate NPC behavior", status: "pending"),
                generationStage(id: "export_rbxm", title: "Export NPC RBXM", status: "pending")
            ]
        }
        switch projectKind {
        case .content, .ugc:
            if looksLikeTextureClothing && draft.isLayered3D {
                return [
                    GenerationStage(id: "concept_image", title: "Concept image", status: "pending"),
                    GenerationStage(id: "mesh_3d", title: "3D clothing mesh", status: "pending"),
                    GenerationStage(id: "generate_cages", title: "Generate cages", status: "pending"),
                    GenerationStage(id: "package_accessory", title: "Package accessory", status: "pending"),
                    GenerationStage(id: "export_rbxm", title: "Export RBXM", status: "pending")
                ]
            }
            if looksLikeTextureClothing {
                // T-Shirt skips the concept_image stage — Flux generates the 512x512
                // graphic directly from the prompt with no avatar concept reference.
                // Auto-detect t_shirt from title if user typed instead of tapping picker.
                let titleLooksLikeTShirt = draft.title.range(of: #"\b(t[-_ ]?shirt|tshirt|футболка|майка)\b"#,
                                                              options: [.regularExpression, .caseInsensitive]) != nil
                if draft.clothingType == "t_shirt" || titleLooksLikeTShirt {
                    return [
                        GenerationStage(id: "clothing_texture", title: "T-Shirt graphic", status: "pending"),
                        GenerationStage(id: "export_rbxm", title: "Export RBXM", status: "pending")
                    ]
                }
                return [
                    GenerationStage(id: "concept_image", title: "Concept image", status: "pending"),
                    GenerationStage(id: "clothing_texture", title: "Clothing texture", status: "pending"),
                    GenerationStage(id: "export_rbxm", title: "Export RBXM", status: "pending")
                ]
            }
            return [
                GenerationStage(id: "concept_image", title: "Concept image", status: "pending"),
                GenerationStage(id: "concept_approval", title: "Awaiting approval", status: "pending"),
                GenerationStage(id: "mesh_3d", title: "3D mesh", status: "pending"),
                GenerationStage(id: "convert_fbx", title: "Convert to FBX", status: "pending"),
                GenerationStage(id: "upload_asset", title: "Uploading asset", status: "pending"),
                GenerationStage(id: "mesh_optimized", title: "Optimize mesh", status: "pending"),
                GenerationStage(id: "rig_r15", title: "Auto-rig R15", status: "pending"),
                GenerationStage(id: "export_model", title: "Export model", status: "pending"),
                GenerationStage(id: "export_rbxm", title: "Export RBXM", status: "pending")
            ]
        default:
            return [
                GenerationStage(id: "planning", title: "Planning systems", status: "pending"),
                GenerationStage(id: "provider", title: "Calling provider", status: "pending"),
                GenerationStage(id: "artifacts", title: "Saving artifacts", status: "pending"),
                GenerationStage(id: "export", title: "Preparing export", status: "pending")
            ]
        }
    }

    private func mapStages(from job: AIWorkspaceAPI.GenerationJob) -> [GenerationStage]? {
        guard let stages = job.stages, !stages.isEmpty else { return nil }
        return stages.map {
            generationStage(id: $0.id, title: $0.title, status: $0.status)
        }
    }

    private func qualityFailureMessage(from job: AIWorkspaceAPI.GenerationJob) -> String {
        let metadata = job.metadata
        let hasQualityReview = metadata?.qualityReviewStatus != nil
            || metadata?.qualityReviewMessage != nil
            || metadata?.qualityRejectionMessage != nil
        guard hasQualityReview else {
            return safeJobFailureMessage(from: job)
        }
	        let isRu = preferredResponseLanguageCode() == "ru"
	        let title = metadata?.qualityRejectionTitle
	            ?? (isRu ? "Проверка качества остановила генерацию" : "Quality review stopped this generation")
        let rawBaseMessage = metadata?.qualityRejectionMessage
            ?? metadata?.qualityReviewMessage
            ?? job.errorMessage
            ?? (isRu ? "Генерация не завершилась успешно." : "The generation did not finish successfully.")
        let baseMessage = Self.safeQualityMessage(rawBaseMessage, isRu: isRu)
        var sections: [String] = ["\(title)\n\(baseMessage)"]
	        if let score = metadata?.qualityReviewScore {
	            sections.append(isRu ? "Оценка: \(score)/100" : "Score: \(score)/100")
	        }
	        if let reasons = metadata?.qualityReviewReasons, !reasons.isEmpty {
	            let list = reasons.prefix(4).map { "- \($0)" }.joined(separator: "\n")
	            sections.append(isRu ? "Найдены проблемы:\n\(list)" : "Problems found:\n\(list)")
	        }
	        if let actions = metadata?.qualityRepairActions, !actions.isEmpty {
	            let list = actions.prefix(4).map { "- \($0)" }.joined(separator: "\n")
	            sections.append(isRu ? "Следующая регенерация должна:\n\(list)" : "Next regeneration should:\n\(list)")
	        }
	        if let apifySummary = metadata?.obbyApifyTaskSummary, !apifySummary.isEmpty {
	            let list = apifySummary.prefix(3).map { "- \($0)" }.joined(separator: "\n")
	            sections.append(isRu ? "Референс-задачи Apify:\n\(list)" : "Apify reference tasks:\n\(list)")
	        }

        let full = sections.joined(separator: "\n\n")
        if full.count > 1400 {
            return String(full.prefix(1400)) + "..."
        }
        return full
    }

    private func safeJobFailureMessage(from job: AIWorkspaceAPI.GenerationJob) -> String {
        let isRu = preferredResponseLanguageCode() == "ru"
        if let error = job.errorMessage,
           Self.looksLikeBackendDiagnostic(error) || Self.looksLikeRawStructuredPayload(error) {
            return isRu
                ? "Генерация остановилась до экспорта. Я не создал фейковый результат — попробуйте повторить или уточнить запрос."
                : "Generation stopped before export. I did not create a fake result — retry or refine the prompt."
        }
        return isRu
            ? "Генерация не завершилась. Я остановил flow до выдачи результата — попробуйте повторить или уточнить запрос."
            : "The generation did not finish. I stopped the flow before showing a result — retry or refine the prompt."
    }

	    private static func safeQualityMessage(_ raw: String, isRu: Bool) -> String {
	        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
	        if looksLikeBackendDiagnostic(trimmed) || looksLikeRawStructuredPayload(trimmed) {
	            return isRu
	                ? "Проверка качества остановила генерацию до экспорта."
	                : "The quality review stopped this generation before export."
	        }
	        return trimmed.isEmpty
	            ? (isRu ? "Генерация не завершилась успешно." : "The generation did not finish successfully.")
	            : trimmed
	    }

    private func isQualityReviewFailure(_ job: AIWorkspaceAPI.GenerationJob) -> Bool {
        job.metadata?.qualityReviewStatus == "rejected"
            || job.metadata?.qualityRejectionMessage != nil
            || job.metadata?.qualityRepairActions?.isEmpty == false
    }

    private func failedGenerationQuickReplies(for job: AIWorkspaceAPI.GenerationJob) -> [String] {
        if isQualityReviewFailure(job) {
            return ["Regenerate with changes", "Try again"]
        }
        return ["Retry generation", "Refine plan"]
    }

    private func handleFailedGenerationRepairQuickReply(option: String, normalized: String) -> Bool {
        let isRepairAction = normalized == "regenerate with changes"
            || normalized == "try again"
            || normalized == "retry generation"
        guard isRepairAction, let failedJob = lastFailedGenerationJob, isQualityReviewFailure(failedJob) else {
            return false
        }
        regenerateFromFailedQualityJob(failedJob, actionLabel: option)
        return true
    }

    private func regenerateFromFailedQualityJob(_ failedJob: AIWorkspaceAPI.GenerationJob, actionLabel: String) {
        guard !isGenerating else { return }

        let thread = currentThread ?? defaultThreads().first!
        if currentThread == nil {
            currentThread = thread
            if threads.isEmpty {
                threads = defaultThreads()
            }
        }

        messages.append(
            ChatMessage(
                id: UUID().uuidString,
                role: .user,
                content: actionLabel == "Try again" ? "Try again with the quality fixes" : actionLabel,
                quickReplies: nil,
                gddRows: nil,
                createdAt: Date()
            )
        )
        messages.append(
            ChatMessage(
                id: UUID().uuidString,
                role: .assistant,
                content: "Got it. I’m regenerating the same request with the quality-review fixes applied — no new interview.",
                quickReplies: nil,
                gddRows: nil,
                createdAt: Date()
            )
        )

        ChallengeRetentionNotifications.recordGenerationStarted()
        isGenerating = true
        generationStages = initialGenerationStages()
        liveJobArtifacts = []
        openLivePipelinePreview()

        let repairPrompt = buildRepairGenerationPrompt(from: failedJob)
        let repairMetadata = repairGenerationMetadata(from: failedJob)
        let repairThreadId = failedJob.threadId ?? thread.id

        Task {
            do {
                if !generationStages.isEmpty {
                    generationStages[0].status = "completed"
                }
                let response = try await AIWorkspaceAPI.startGeneration(
                    prompt: repairPrompt,
                    provider: failedJob.provider,
                    kind: failedJob.kind,
                    threadId: repairThreadId,
                    metadata: repairMetadata
                )
                if generationStages.count > 1 {
                    generationStages[1].status = response.status == "failed" ? "failed" : "processing"
                }

                let job = try await pollJob(jobId: response.jobId)
                generationStages = mapStages(from: job) ?? generationStages

                if job.status == "completed" || job.status == "awaiting_review" || job.status == "partial" {
                    lastJobId = job.id
                    lastFailedGenerationJob = nil
                    let preview = makePreviewPayload(from: job)
                    activePreview = preview
                    lastPreview = preview
                    messages.append(
                        ChatMessage(
                            id: UUID().uuidString,
                            role: .assistant,
	                            content: preferredResponseLanguageCode() == "ru"
                                    ? "Обновлённая версия готова. Проверьте новый Studio export."
                                    : job.metadata?.obbyDescription ?? "Regenerated version is ready. Review the updated Studio export.",
	                            quickReplies: ["Open preview", "Regenerate with changes", "Start another"],
	                            gddRows: nil,
	                            createdAt: Date()
                        )
                    )
                } else {
                    lastJobId = job.id
                    lastFailedGenerationJob = job
                    if job.stages?.isEmpty == false {
                        let preview = makePreviewPayload(from: job)
                        activePreview = preview
                        lastPreview = preview
                    }
                    messages.append(
                        ChatMessage(
                            id: UUID().uuidString,
                            role: .assistant,
                            content: qualityFailureMessage(from: job),
                            quickReplies: failedGenerationQuickReplies(for: job),
                            gddRows: nil,
                            createdAt: Date()
                        )
                    )
                }
                isGenerating = false
            } catch let timeout as GenerationPollingTimeout {
                handleGenerationPollingTimeout(timeout)
            } catch {
                stopGenerationFlowAfterError(error)
                messages.append(
                    ChatMessage(
                        id: UUID().uuidString,
                        role: .assistant,
                        content: Self.generationErrorMessage(for: error),
                        quickReplies: ["Retry generation", "Refine plan"],
                        gddRows: nil,
                        createdAt: Date()
                    )
                )
            }
        }
    }

    private func extractOriginalUserRequest(from prompt: String) -> String? {
        guard let startRange = prompt.range(of: "Original user request:", options: .caseInsensitive) else {
            return nil
        }
        let afterStart = prompt[startRange.upperBound...]
        let endMarkers = [
            "Previous generated brief:",
            "Previous quality review",
            "Quality review problems to fix:",
            "Mandatory repair actions:",
            "Live marketplace reference evidence"
        ]
        var endIndex = afterStart.endIndex
        for marker in endMarkers {
            if let range = afterStart.range(of: marker, options: .caseInsensitive), range.lowerBound < endIndex {
                endIndex = range.lowerBound
            }
        }
        let extracted = String(afterStart[..<endIndex])
        let cleaned = sanitizeForPrompt(extracted, maxLength: 900)
        return cleaned.isEmpty ? nil : cleaned
    }

    private func originalPromptForRepair(from job: AIWorkspaceAPI.GenerationJob) -> String {
        if let original = job.metadata?.originalUserPrompt, !original.isEmpty {
            if let extracted = extractOriginalUserRequest(from: original) {
                return extracted
            }
            return sanitizeForPrompt(original, maxLength: 900)
        }
        if let latest = job.metadata?.latestUserIntent, !latest.isEmpty {
            if let extracted = extractOriginalUserRequest(from: latest) {
                return extracted
            }
            return sanitizeForPrompt(latest, maxLength: 900)
        }
        if let extracted = extractOriginalUserRequest(from: job.prompt) {
            return extracted
        }
        return sanitizeForPrompt(job.prompt, maxLength: 900)
    }

    private func buildRepairGenerationPrompt(from job: AIWorkspaceAPI.GenerationJob) -> String {
        let category = job.metadata?.contentCategory ?? ""
        let subcategory = job.metadata?.contentSubcategory ?? ""
        let isBuildingRequest = category == "building" || subcategory == "buildings"
        let isMapRequest = category == "map_environment" || subcategory == "maps"
        let isVehicleRequest = category == "vehicle" || subcategory == "vehicles" || job.kind == "vehicle_3d"
        let isObbyTrollRequest = subcategory == "obby_troll"
        let isNpcRequest = category == "npc_ai"
            || subcategory == "npcs"
            || subcategory == "roast_npc"
            || (job.kind == "character_3d" && category.isEmpty && subcategory.isEmpty)
        let requestLabel: String
        let defaultProblem: String
        let defaultAction: String
        if isObbyTrollRequest {
            requestLabel = "Obby Troll & Trap Maker request"
            defaultProblem = "- Keep the original troll obby trap focus, stage count, savagery, checkpoint cadence, and theme from the user's prompt."
            defaultAction = "- Rebuild the Obby Troll GDD so the actual TrollObbyConfig traps visibly match the user's brief before export."
        } else if isNpcRequest {
            requestLabel = "NPC request"
            defaultProblem = "- Keep the NPC close to the user prompt and fix the exact acceptance gate failures before export."
            defaultAction = "- Add the missing requested visual/accessory/behavior elements to the manifest before export."
        } else if isBuildingRequest {
            requestLabel = "Building request"
            defaultProblem = "- Keep the original building type, architectural style, materials, rooms, and requested details from the user's prompt."
            defaultAction = "- Rebuild the BuildingScene so the actual parts visibly match the brief before export; do not substitute a museum/gallery unless the user asked for one."
        } else if isMapRequest {
            requestLabel = "Map environment request"
            defaultProblem = "- Keep the map environment close to the user prompt and fix the exact quality-review failures before export."
            defaultAction = "- Rebuild the map scene with the requested biome/structure cues visible and reviewable before export."
        } else if isVehicleRequest {
            requestLabel = "Vehicle request"
            defaultProblem = "- Keep the requested vehicle type, controls, passenger count, sounds, VFX, and physics behavior from the user's prompt."
            defaultAction = "- Rebuild the vehicle .rbxm so it includes a DriveSeat, passenger seats, controller script, physics constraints, sounds, and speed-based VFX before export."
        } else {
            requestLabel = "Game package request"
            defaultProblem = "- Keep the request closer to the user prompt and make the playable route obvious."
            defaultAction = "- Rebuild route clarity, readability, and prompt adherence before export."
        }
        let reasons = (job.metadata?.qualityReviewReasons ?? [])
            .prefix(6)
            .map { "- \($0)" }
            .joined(separator: "\n")
        let actions = (job.metadata?.qualityRepairActions ?? [])
            .prefix(6)
            .map { "- \($0)" }
            .joined(separator: "\n")
        let apifyTasks = (job.metadata?.obbyApifyTaskSummary ?? [])
            .prefix(6)
            .map { "- \($0)" }
            .joined(separator: "\n")
        let originalRequest = originalPromptForRepair(from: job)
        let previousBrief = job.resultText.map { sanitizeForPrompt($0, maxLength: 1200) } ?? "No previous quality review summary was saved."
        let prompt = """
        Regenerate the same \(requestLabel). Do not start a new interview and do not change the user's core theme.

        Original user request:
        \(originalRequest)

        Previous quality review summary:
        \(previousBrief)

        Quality review problems to fix:
        \(reasons.isEmpty ? defaultProblem : reasons)

        Mandatory repair actions:
        \(actions.isEmpty ? defaultAction : actions)

        Live marketplace reference evidence. Use as reference-only, not as random assets:
        \(apifyTasks.isEmpty ? "- No reference tasks were available." : apifyTasks)

        Output a corrected, production-ready generation for the same request. Prioritize quality over speed.
        """
        return sanitizeForPrompt(prompt, maxLength: 3600)
    }

    private func repairGenerationMetadata(from job: AIWorkspaceAPI.GenerationJob) -> [String: String] {
        var metadata = generationMetadata()
        metadata["inputMode"] = "quality_retry"
        metadata["repairMode"] = "quality_review_retry"
        metadata["repairSourceJobId"] = job.id
        metadata["latestJobId"] = job.id
        let originalRequest = originalPromptForRepair(from: job)
        metadata["latestUserIntent"] = sanitizeForPrompt(originalRequest, maxLength: 700)
        metadata["originalUserPrompt"] = sanitizeForPrompt(originalRequest, maxLength: 900)
        if let category = job.metadata?.contentCategory {
            metadata["contentCategory"] = category
        }
        if let subcategory = job.metadata?.contentSubcategory {
            metadata["contentSubcategory"] = subcategory
        } else if job.metadata?.contentCategory == "building" {
            metadata["contentSubcategory"] = "buildings"
        } else if job.metadata?.contentCategory == "vehicle" || job.kind == "vehicle_3d" {
            metadata["contentSubcategory"] = "vehicles"
        }
        if job.metadata?.contentCategory == "vehicle" || job.kind == "vehicle_3d" {
            metadata["requestedKind"] = "vehicle_3d"
        }
        if let vehicleType = job.metadata?.vehicleType {
            metadata["vehicleType"] = sanitizeForPrompt(vehicleType, maxLength: 40)
        }
        if let driveMode = job.metadata?.driveMode {
            metadata["driveMode"] = sanitizeForPrompt(driveMode, maxLength: 60)
        }
        if let seatCount = job.metadata?.seatCount {
            metadata["seatCount"] = "\(seatCount)"
        }
        if let title = job.metadata?.title {
            metadata["title"] = sanitizeForPrompt(title, maxLength: 120)
        }
        if let buildingType = job.metadata?.buildingType {
            metadata["buildingType"] = sanitizeForPrompt(buildingType, maxLength: 40)
        }
        if let sizeClass = job.metadata?.sizeClass {
            metadata["sizeClass"] = sanitizeForPrompt(sizeClass, maxLength: 40)
        }
        if let floors = job.metadata?.floors {
            metadata["floors"] = "\(floors)"
        }
        if let style = job.metadata?.style {
            metadata["style"] = sanitizeForPrompt(style, maxLength: 80)
        }
        if let status = job.metadata?.qualityReviewStatus {
            metadata["previousQualityReviewStatus"] = status
        }
        if let score = job.metadata?.qualityReviewScore {
            metadata["previousQualityReviewScore"] = "\(score)"
        }
        if let message = job.metadata?.qualityReviewMessage {
            metadata["previousQualityReviewMessage"] = sanitizeForPrompt(message, maxLength: 500)
        }
        if let reasons = job.metadata?.qualityReviewReasons, !reasons.isEmpty {
            metadata["previousQualityReviewReasons"] = sanitizeForPrompt(reasons.joined(separator: " | "), maxLength: 900)
        }
        if let actions = job.metadata?.qualityRepairActions, !actions.isEmpty {
            metadata["qualityRepairActions"] = sanitizeForPrompt(actions.joined(separator: " | "), maxLength: 900)
        }
        if let apify = job.metadata?.obbyApifyTaskSummary, !apify.isEmpty {
            metadata["obbyApifyTaskSummary"] = sanitizeForPrompt(apify.joined(separator: " | "), maxLength: 900)
        }
        return metadata
    }

    private func makePreviewPayload(from job: AIWorkspaceAPI.GenerationJob) -> PreviewPayload {
        // Phase F (session 219): pull live Roblox catalog showcase items from job
        // metadata so the preview chip can advertise them. Empty array → no chip.
        let trendingShowcaseItems = job.metadata?.trendingShowcaseItems ?? []
        let trendingShowcaseCategory = job.metadata?.trendingShowcaseCategory
        let primaryArtifact = job.artifacts.first
        let bundleArtifact = job.artifacts.first(where: { $0.type == "project_bundle" })
        let finalRobloxArtifact = job.artifacts.last(where: {
            ($0.type == "rbxl" || $0.type == "rbxm") && $0.stageId == "export_rbxm"
        })
        let nativeRobloxArtifact = finalRobloxArtifact
            ?? job.artifacts.last(where: { ($0.type == "rbxl" || $0.type == "rbxm") && $0.stageId != "export_model" })
            ?? job.artifacts.last(where: { $0.type == "rbxl" || $0.type == "rbxm" })
        let isVehicleProject = contentSubcategory == "vehicles"
            || job.metadata?.contentCategory == "vehicle"
            || job.metadata?.contentSubcategory == "vehicles"
            || job.kind == "vehicle_3d"
        let real3DArtifact = job.artifacts.last(where: {
            $0.is3DModel
                && $0.type != "rbxm"
                && ($0.stageId == "rig_r15" || $0.stageId == "mesh_optimized" || $0.artifactRole == "mesh_normalized")
        }) ?? job.artifacts.first(where: { $0.is3DModel && $0.type != "rbxm" })
        let glbArtifact = job.artifacts.last(where: { $0.type == "glb" })
        let thumbnailArtifact = job.artifacts.first(where: { $0.isPreviewTexture })
        let luaArtifact = job.artifacts.first(where: { $0.type == "lua" })
        let gddArtifact = job.artifacts.first(where: { $0.type == "gdd" })
        let textArtifact = job.artifacts.first(where: { $0.type == "text" || $0.type == "json" })
        let mediaArtifact = job.artifacts.first(where: { $0.type == "png" || $0.type == "jpg" || $0.type == "audio" })
        func exportExtension(for artifact: AIWorkspaceAPI.GenerationArtifact?, fallback: String) -> String {
            if let fileExtension = artifact?.fileExtension, !fileExtension.isEmpty {
                return fileExtension.lowercased()
            }
            let mimeType = artifact?.mimeType?.lowercased() ?? ""
            if mimeType.contains("ogg") { return "ogg" }
            if mimeType.contains("mpeg") || mimeType.contains("mp3") { return "mp3" }
            if mimeType.contains("wav") || mimeType.contains("wave") { return "wav" }
            if mimeType.contains("flac") { return "flac" }
            if mimeType.contains("mp4") || mimeType.contains("m4a") { return "m4a" }
            if mimeType.contains("jpeg") || mimeType.contains("jpg") { return "jpg" }
            if mimeType.contains("png") { return "png" }
            return fallback
        }
        let downloadURL: URL? = {
            let candidates: [String?] = (contentSubcategory == "npcs" || isVehicleProject)
                ? [
                    nativeRobloxArtifact?.downloadUrl,
                    glbArtifact?.downloadUrl,
                    real3DArtifact?.downloadUrl,
                    bundleArtifact?.downloadUrl,
                    primaryArtifact?.downloadUrl,
                    primaryArtifact?.url,
                ]
                : [
                    glbArtifact?.downloadUrl,
                    real3DArtifact?.downloadUrl,
                    nativeRobloxArtifact?.downloadUrl,
                    bundleArtifact?.downloadUrl,
                    primaryArtifact?.downloadUrl,
                    primaryArtifact?.url,
                ]
            guard let urlStr = candidates.compactMap({ $0 }).first else { return nil }
            return URL(string: urlStr)
        }()
        let glbDownloadURL = (glbArtifact?.downloadUrl ?? glbArtifact?.url).flatMap(URL.init(string:))
        let isGameKind = projectKind == .game || projectKind == .clone
        let rbxmDownloadURL: URL? = isGameKind ? nil : (nativeRobloxArtifact?.downloadUrl ?? nativeRobloxArtifact?.url).flatMap(URL.init(string:))
        let fbxArtifact = job.artifacts.last(where: { $0.type == "fbx" })
        let fbxDownloadURL: URL? = isGameKind ? nil : (fbxArtifact?.downloadUrl ?? fbxArtifact?.url).flatMap(URL.init(string:))
        let clothingPngArtifact = job.artifacts.first(where: { $0.metadata?.isShirtTexture == true || $0.metadata?.isPantsTexture == true })
        let clothingTexturePngURL: URL? = (clothingPngArtifact?.downloadUrl ?? clothingPngArtifact?.url).flatMap(URL.init(string:))
        let artifactIds = job.artifacts.map(\.id)
        let shareDescription = job.resultText ?? primaryArtifact?.previewText ?? draft.exportPrompt(for: projectKind, contentSubcategory: contentSubcategory)

        if contentSubcategory == "audio" {
            let audioArtifact = job.artifacts.first(where: { $0.type == "audio" }) ?? primaryArtifact
            let audioURL = (audioArtifact?.downloadUrl ?? audioArtifact?.url).flatMap(URL.init(string:))
            let audioRbxm = job.artifacts.first(where: { $0.type == "rbxm" })
            let audioRbxmURL = (audioRbxm?.downloadUrl ?? audioRbxm?.url).flatMap(URL.init(string:))
            let hasRbxm = audioRbxmURL != nil
            let rawAudioExtension = exportExtension(for: audioArtifact, fallback: "mp3")
            return PreviewPayload(
                title: draft.title.isEmpty ? "Audio" : draft.title,
                artifactType: .media(kind: "audio", remoteURL: audioURL),
                exportFileType: hasRbxm ? "rbxm" : rawAudioExtension,
                artifactIds: artifactIds,
                shareDescription: shareDescription,
                downloadURL: hasRbxm ? audioRbxmURL : audioURL,
                glbDownloadURL: nil,
                rbxmDownloadURL: audioRbxmURL,
                fbxDownloadURL: nil,
                notes: hasRbxm
                    ? [".rbxm with Sound — drag into Workspace in Studio.", "Raw \(rawAudioExtension.uppercased()) audio is included in Download All as ZIP."]
                    : ["Game-ready \(rawAudioExtension.uppercased()) audio file. Export to download for use in Studio."]
            )
        }

        if contentSubcategory == "animations" {
            let animFbx = job.artifacts.first(where: { $0.type == "fbx" })
            let animRbxm = job.artifacts.first(where: { $0.type == "rbxm" && $0.metadata?.role == "animation_binary" })
            let animJson = job.artifacts.first(where: { $0.type == "json" && $0.metadata?.role == "animation_keyframes" })
            let animPreview = job.artifacts.first(where: { $0.type == "mp4" && $0.metadata?.role == "animation_preview" })
                          ?? job.artifacts.first(where: { $0.type == "png" && $0.metadata?.role == "animation_preview" })
            let animFbxURL = (animFbx?.downloadUrl ?? animFbx?.url).flatMap(URL.init(string:))
            let animRbxmURL = (animRbxm?.downloadUrl ?? animRbxm?.url).flatMap(URL.init(string:))
            let animJsonURL = (animJson?.downloadUrl ?? animJson?.url).flatMap(URL.init(string:))
            let animPreviewURL = (animPreview?.downloadUrl ?? animPreview?.url).flatMap(URL.init(string:))
            let animPreviewIsVideo = animPreview?.type == "mp4"
            let animDownloadURL = animFbxURL ?? animRbxmURL ?? animJsonURL

            let meta = animFbx?.metadata ?? animRbxm?.metadata ?? animJson?.metadata
            let animName = meta?.animationName ?? "Animation"
            let rigType = meta?.rig ?? "R15"
            let kfCount = meta?.keyframeCount ?? 0
            let looped = meta?.looped ?? true
            let animType = meta?.animationType ?? "custom"

            var notes: [String] = []
            notes.append("Name: \(animName)")
            notes.append("Rig: \(rigType) | Type: \(animType)")
            notes.append("Keyframes: \(kfCount) | Looped: \(looped ? "Yes" : "No")")
            if animFbx != nil {
                notes.append("FBX ready — import into Studio via Avatar > Import 3D.")
            } else if animRbxm != nil {
                notes.append("Ready as .rbxm KeyframeSequence for Studio.")
            }

            return PreviewPayload(
                title: draft.title.isEmpty ? animName : draft.title,
                artifactType: .animationPreview(
                    name: animName,
                    rig: rigType,
                    keyframeCount: kfCount,
                    looped: looped,
                    animationType: animType,
                    notes: notes,
                    previewMediaURL: animPreviewURL,
                    previewIsVideo: animPreviewIsVideo
                ),
                exportFileType: animFbx != nil ? "fbx" : (animRbxm != nil ? "rbxm" : "json"),
                artifactIds: artifactIds,
                shareDescription: shareDescription,
                downloadURL: animDownloadURL,
                glbDownloadURL: nil,
                rbxmDownloadURL: animRbxmURL,
                fbxDownloadURL: animFbxURL,
                notes: notes
            )
        }

        if contentSubcategory == "decals" {
            let pngArtifact = job.artifacts.first(where: { $0.type == "png" })
            let decalRbxm = job.artifacts.first(where: { $0.type == "rbxm" })
            let previewURL = (pngArtifact?.downloadUrl ?? pngArtifact?.url
                ?? job.metadata?.previewImageUrl).flatMap(URL.init(string:))
            let decalRbxmURL = (decalRbxm?.downloadUrl ?? decalRbxm?.url).flatMap(URL.init(string:))

            return PreviewPayload(
                title: draft.title.isEmpty ? "Decal Texture" : draft.title,
                artifactType: .media(kind: "png", remoteURL: previewURL),
                exportFileType: "rbxm",
                artifactIds: artifactIds,
                shareDescription: shareDescription,
                downloadURL: decalRbxmURL ?? downloadURL,
                glbDownloadURL: nil,
                rbxmDownloadURL: decalRbxmURL,
                fbxDownloadURL: nil,
                notes: [
                    job.resultText ?? "AI-generated decal texture.",
                    "Drag the .rbxm into Studio Workspace."
                ]
            )
        }

        // UI / GUI — visual mockup + code preview
        if contentSubcategory == "ui" {
            let code = luaArtifact?.code ?? primaryArtifact?.code ?? job.resultText ?? ""
            let uiType = job.metadata?.genre ?? "hud"
            let visualStyle = job.metadata?.style ?? "modern"

            return PreviewPayload(
                title: draft.title.isEmpty ? "UI Preview" : draft.title,
                artifactType: .uiPreview(
                    code: code,
                    uiType: uiType,
                    visualStyle: visualStyle,
                    title: draft.title
                ),
                exportFileType: "rbxmx",
                artifactIds: artifactIds,
                shareDescription: shareDescription,
                downloadURL: downloadURL,
                glbDownloadURL: nil,
                rbxmDownloadURL: rbxmDownloadURL,
                fbxDownloadURL: nil,
                notes: ["Drag the .rbxmx file into StarterGui in Studio."]
            )
        }

        // Game Passes — shop UI mockup + .rbxm download (must be before pipeline check)
        if projectKind == .content && contentSubcategory == "passes" {
            let code = luaArtifact?.code ?? primaryArtifact?.code ?? job.resultText ?? ""
            let visualStyle = job.metadata?.style ?? "modern"

            return PreviewPayload(
                title: draft.title.isEmpty ? "Game Pass Preview" : draft.title,
                artifactType: .uiPreview(
                    code: code,
                    uiType: "shop",
                    visualStyle: visualStyle,
                    title: draft.title
                ),
                exportFileType: "rbxmx",
                artifactIds: artifactIds,
                shareDescription: shareDescription,
                downloadURL: downloadURL,
                glbDownloadURL: nil,
                rbxmDownloadURL: rbxmDownloadURL,
                fbxDownloadURL: nil,
                notes: {
                    var n = [
                        "① Drag .rbxmx into StarterGui",
                        "② Press Play → Shop appears!",
                        "Server script auto-moves to ServerScriptService."
                    ]
                    if (RobloxAuthService.shared.universeId ?? "").isEmpty {
                        n.append("⚠️ Set Universe ID in Profile for auto Game Pass creation. Otherwise replace 'id = 0' manually.")
                    } else {
                        n.append("✅ Game Pass IDs auto-created via connected API!")
                    }
                    return n
                }()
            )
        }

        let isScriptsContent = projectKind == .content && (contentSubcategory == "scripts" || contentSubcategory == "anime_skills")
        let isCharacterProject = (projectKind == .content || projectKind == .ugc) && !isScriptsContent && !isVehicleProject
        let isGameProject = projectKind == .game || projectKind == .clone
        let shows3D = isCharacterProject || isVehicleProject || isGameProject
        let gameWorldTitle = job.metadata?.displayTitle.map { "\($0) Game World" }
            ?? (draft.title.isEmpty ? "Game World" : "\(draft.title) Game World")
        func gamePreviewNotes(exportLine: String) -> [String] {
            [
                job.metadata?.obbyDescription ?? "AI-generated game world preview.",
                job.metadata?.regenerateHint ?? "Send what to change in chat to regenerate a new version.",
                exportLine
            ]
        }

        // After a game project completes and a 2D scene_preview artifact is attached,
        // short-circuit to the media preview so users see the rendered scene image
        // (tycoon/obby/simulator) instead of pipeline stages or a hero 3D model branch.
        let hasCompletedScenePreview = isGameProject
            && (job.status == "completed" || job.status == "partial")
            && thumbnailArtifact != nil

        if hasCompletedScenePreview,
           let previewImageURL = (thumbnailArtifact?.downloadUrl ?? thumbnailArtifact?.url).flatMap(URL.init(string:)) {
            return PreviewPayload(
                title: gameWorldTitle,
                artifactType: .media(kind: "png", remoteURL: previewImageURL),
                exportFileType: nativeRobloxArtifact?.type ?? "rbxl",
                artifactIds: artifactIds,
                shareDescription: shareDescription,
                downloadURL: downloadURL,
                glbDownloadURL: nil,
                rbxmDownloadURL: nil,
                fbxDownloadURL: nil,
                notes: gamePreviewNotes(exportLine: "Download the RBXL file and open in Studio.")
            )
        }

        // Session 346 — Furniture Blocky Parts mode: when the blocky preview PNG is ready,
        // short-circuit to a media preview so the user sees the rendered scene (matching
        // the .rbxm they'll get in Studio) instead of just stage checkmarks. The RBXM is
        // still exposed via rbxmDownloadURL for the "Export RBXM" button.
        let isFurniturePartsPreview = contentSubcategory == "furniture"
            && (job.metadata?.furnitureBuildMode == "parts" || job.metadata?.furnitureResolvedBuildMode == "parts")
            && (job.status == "completed" || job.status == "partial")
            && thumbnailArtifact != nil

        if isFurniturePartsPreview {
            let qualityScore = job.metadata?.qualityReviewScore
            let qualityMessage = job.metadata?.qualityReviewMessage
            var notes: [String] = []
            if let msg = qualityMessage, !msg.isEmpty {
                notes.append("Quality review: \(msg)")
            }
            if let score = qualityScore {
                notes.append("Score \(score)/100")
            }
            notes.append("Blocky scene built from primitive Roblox Parts — what you see is what Studio gets.")
            notes.append("Tap Export RBXM and drag the file into Workspace.")

            // 2026-05-20: Prefer interactive SceneKit 3D over the 2D PNG preview
            // when the backend attached the furnitureSpecJSON (post the deploy
            // that added it). Falls back to PNG for older jobs and jobs where
            // the LLM scene wasn't produced.
            if let rbxmArtifact = nativeRobloxArtifact,
               let furnSpecJSON = rbxmArtifact.metadata?.furnitureSpecJSON,
               let furnSpec = FurnitureSpecPayload.decode(from: furnSpecJSON) {
                let furnType = rbxmArtifact.metadata?.furnitureType ?? furnSpec.furnitureType ?? "prop"
                return PreviewPayload(
                    title: draft.title.isEmpty ? "Furniture" : "\(draft.title) — \(furnType.capitalized) Preview",
                    artifactType: .blockyFurniture3D(spec: furnSpec, furnitureType: furnType, notes: notes),
                    exportFileType: "rbxm",
                    artifactIds: artifactIds,
                    shareDescription: shareDescription,
                    downloadURL: rbxmDownloadURL ?? downloadURL,
                    glbDownloadURL: nil,
                    rbxmDownloadURL: rbxmDownloadURL,
                    fbxDownloadURL: nil,
                    notes: notes
                )
            }

            // Legacy fallback — no spec JSON in metadata (job pre-dates the
            // 2026-05-20 furnitureSpecJSON deploy). Show the PNG render the
            // backend rendered server-side.
            if let previewImageURL = (thumbnailArtifact?.downloadUrl ?? thumbnailArtifact?.url).flatMap(URL.init(string:)) {
                return PreviewPayload(
                    title: draft.title.isEmpty ? "Furniture" : draft.title,
                    artifactType: .media(kind: "png", remoteURL: previewImageURL),
                    exportFileType: "rbxm",
                    artifactIds: artifactIds,
                    shareDescription: shareDescription,
                    downloadURL: rbxmDownloadURL ?? downloadURL,
                    glbDownloadURL: nil,
                    rbxmDownloadURL: rbxmDownloadURL,
                    fbxDownloadURL: nil,
                    notes: notes
                )
            }
        }

        if isVehicleProject, let nativeRobloxArtifact {
            let vehiclePreviewArtifact = job.artifacts.first(where: {
                $0.metadata?.role == "vehicle_preview_scene_render"
                    || ($0.artifactRole == "preview_texture" && $0.stageId == "export_rbxm" && ($0.type == "png" || ($0.mimeType ?? "").contains("image")))
            }) ?? thumbnailArtifact
            let previewImageURL = (vehiclePreviewArtifact?.downloadUrl
                ?? vehiclePreviewArtifact?.url
                ?? job.metadata?.previewImageUrl).flatMap(URL.init(string:))
            if let previewImageURL {
                let vehicleType = job.metadata?.vehicleType ?? draft.vehicleType ?? "vehicle"
                let driveMode = job.metadata?.driveMode ?? "land_wheels"
                var notes: [String] = [
                    "Blocky 3D preview rendered from the exact RBXM Parts model.",
                    "Playable \(vehicleType) with DriveSeat, stabilized acceleration, passenger seats, engine sound, wheel dust, and exhaust VFX.",
                    "Interior includes cabin parts, dashboard, steering wheel, seats, mirrors, lights, and trim.",
                    "Tap Export Vehicle RBXM, drag into Workspace in Studio, press Play, and sit in DriveSeat."
                ]
                if let seatCount = job.metadata?.seatCount {
                    notes.insert("Seats: \(seatCount) | Mode: \(driveMode)", at: 1)
                }
                if let qualityMessage = job.metadata?.qualityReviewMessage, !qualityMessage.isEmpty {
                    notes.append("Quality review: \(qualityMessage)")
                }
                return PreviewPayload(
                    title: draft.title.isEmpty ? "Vehicle Preview" : "\(draft.title) Vehicle",
                    artifactType: .media(kind: "vehicle_preview", remoteURL: previewImageURL),
                    exportFileType: nativeRobloxArtifact.type,
                    artifactIds: artifactIds,
                    shareDescription: shareDescription,
                    downloadURL: rbxmDownloadURL ?? downloadURL,
                    glbDownloadURL: nil,
                    rbxmDownloadURL: rbxmDownloadURL,
                    fbxDownloadURL: nil,
                    notes: notes,
                    trendingShowcaseItems: trendingShowcaseItems,
                    trendingShowcaseCategory: trendingShowcaseCategory
                )
            }
        }

        if isVehicleProject,
           nativeRobloxArtifact == nil,
           job.status == "completed" || job.status == "partial" {
            let message = "Vehicle export is incomplete: this job produced only a preview image and no Roblox .rbxm model. Regenerate the vehicle after the latest backend build so the result includes DriveSeat physics, passengers, sounds, VFX, and the Studio-ready .rbxm file."
            return PreviewPayload(
                title: draft.title.isEmpty ? "Vehicle RBXM Missing" : "\(draft.title) Vehicle",
                artifactType: .unavailable(message),
                exportFileType: "rbxm",
                artifactIds: [],
                shareDescription: shareDescription,
                downloadURL: nil,
                glbDownloadURL: nil,
                rbxmDownloadURL: nil,
                fbxDownloadURL: nil,
                notes: [message]
            )
        }

        if isVehicleProject, let nativeRobloxArtifact {
            let vehicleType = job.metadata?.vehicleType ?? draft.vehicleType ?? "vehicle"
            let driveMode = job.metadata?.driveMode ?? "DriveSeat"
            var notes: [String] = [
                "Playable \(vehicleType) package with DriveSeat controls.",
                "Includes passenger seats, physics controller, engine sound, and speed-based VFX.",
                "Drag the .rbxm into Workspace in Studio, press Play, and sit in DriveSeat."
            ]
            if let seatCount = job.metadata?.seatCount {
                notes.insert("Seats: \(seatCount) | Mode: \(driveMode)", at: 1)
            }
            if let qualityMessage = job.metadata?.qualityReviewMessage, !qualityMessage.isEmpty {
                notes.append("Quality review: \(qualityMessage)")
            }
            return PreviewPayload(
                title: draft.title.isEmpty ? "Vehicle RBXM" : "\(draft.title) Vehicle",
                artifactType: .robloxBinary(
                    kind: nativeRobloxArtifact.type,
                    notes: notes
                ),
                exportFileType: nativeRobloxArtifact.type,
                artifactIds: artifactIds,
                shareDescription: shareDescription,
                downloadURL: rbxmDownloadURL ?? downloadURL,
                glbDownloadURL: nil,
                rbxmDownloadURL: rbxmDownloadURL,
                fbxDownloadURL: nil,
                notes: notes,
                trendingShowcaseItems: trendingShowcaseItems,
                trendingShowcaseCategory: trendingShowcaseCategory
            )
        }

        // 2026-05-20: same pattern as blocky-pet but for furniture/props.
        // The .rbxm artifact carries metadata.furnitureSpecJSON; render the
        // SceneKit 3D preview as the primary payload instead of the generic
        // pipeline or .robloxBinary text card. Caught before .pipeline so
        // furniture sessions surface the 3D model right away.
        if let nativeRobloxArtifact,
           nativeRobloxArtifact.type == "rbxm",
           let furnSpecJSON = nativeRobloxArtifact.metadata?.furnitureSpecJSON,
           let furnSpec = FurnitureSpecPayload.decode(from: furnSpecJSON) {
            let furnType = nativeRobloxArtifact.metadata?.furnitureType ?? furnSpec.furnitureType ?? "prop"
            let notes: [String] = [
                "Blocky \(furnType) — \(furnSpec.parts.count) parts assembled.",
                "Drag the .rbxm into Studio Workspace; physics + collision are already wired."
            ]
            return PreviewPayload(
                title: "\(draft.title) — \(furnType.capitalized) Preview",
                artifactType: .blockyFurniture3D(
                    spec: furnSpec,
                    furnitureType: furnType,
                    notes: notes
                ),
                exportFileType: nativeRobloxArtifact.type,
                artifactIds: artifactIds,
                shareDescription: shareDescription,
                downloadURL: downloadURL,
                glbDownloadURL: glbDownloadURL,
                rbxmDownloadURL: rbxmDownloadURL,
                fbxDownloadURL: fbxDownloadURL,
                notes: notes,
                trendingShowcaseItems: trendingShowcaseItems,
                trendingShowcaseCategory: trendingShowcaseCategory
            )
        }

        // 2026-05-20 (Track 3 Phase 2): blocky-pet projects always have the
        // .rbxm metadata.blockyPetSpecJSON. We want the user to see the
        // interactive 3D pet AS THE PRIMARY PREVIEW — not buried inside a
        // pipeline-stage list. So we intercept here, BEFORE the generic
        // .pipeline branch, and return .blockyPet3D directly. The pipeline
        // stage view (.pipeline case + pipelineArtifactType) still routes
        // blocky pets to .blockyPet3D as a fallback if anything else surfaces
        // them through that path.
        if let nativeRobloxArtifact,
           nativeRobloxArtifact.type == "rbxm",
           let specJSON = nativeRobloxArtifact.metadata?.blockyPetSpecJSON,
           let spec = BlockyPetSpecPayload.decode(from: specJSON) {
            let element = nativeRobloxArtifact.metadata?.petElement ?? "Neutral"
            let rarity = nativeRobloxArtifact.metadata?.petRarity ?? "Common"
            let species = nativeRobloxArtifact.metadata?.petSpeciesType ?? "pet"
            let isFlying = nativeRobloxArtifact.metadata?.petIsFlying ?? false
            let notes: [String] = [
                "\(rarity) \(element) \(species) — Lv 1 to start, evolves at Lv 25 and Lv 50.",
                "Drag the .rbxm into Studio Workspace and press Play. Pet follows you, F = fire attack, T = feed."
            ]
            return PreviewPayload(
                title: "\(draft.title) — Pet Preview",
                artifactType: .blockyPet3D(
                    spec: spec,
                    element: element,
                    rarity: rarity,
                    species: species,
                    isFlying: isFlying,
                    notes: notes
                ),
                exportFileType: nativeRobloxArtifact.type,
                artifactIds: artifactIds,
                shareDescription: shareDescription,
                downloadURL: downloadURL,
                glbDownloadURL: glbDownloadURL,
                rbxmDownloadURL: rbxmDownloadURL,
                fbxDownloadURL: fbxDownloadURL,
                notes: notes,
                trendingShowcaseItems: trendingShowcaseItems,
                trendingShowcaseCategory: trendingShowcaseCategory
            )
        }

        let pipelineStages = buildPipelineStages(from: job)
        if shows3D, !pipelineStages.isEmpty {
            return PreviewPayload(
                title: "\(draft.title) Pipeline",
                artifactType: .pipeline(stages: pipelineStages),
                exportFileType: nativeRobloxArtifact?.type ?? real3DArtifact?.type ?? bundleArtifact?.type ?? primaryArtifact?.type ?? "pipeline",
                artifactIds: artifactIds,
                shareDescription: shareDescription,
                downloadURL: downloadURL,
                glbDownloadURL: glbDownloadURL,
                rbxmDownloadURL: rbxmDownloadURL,
                fbxDownloadURL: fbxDownloadURL,
                clothingTexturePngURL: clothingTexturePngURL,
                notes: ["Review each pipeline step before exporting the final game package."]
            )
        }

        if let real3DArtifact, let modelURL = real3DArtifact.modelDownloadUrl {
            let thumbnailURL = (thumbnailArtifact?.downloadUrl ?? thumbnailArtifact?.url).flatMap(URL.init(string:))
            let caption = job.resultText
                ?? primaryArtifact?.previewText
                ?? "AI-generated 3D model ready for game use."
            return PreviewPayload(
                title: "\(draft.title) 3D Model",
                artifactType: .realModel3D(
                    modelURL: modelURL,
                    thumbnailURL: thumbnailURL,
                    caption: caption
                ),
                exportFileType: real3DArtifact.type,
                artifactIds: artifactIds,
                shareDescription: shareDescription,
                downloadURL: downloadURL,
                glbDownloadURL: glbDownloadURL,
                rbxmDownloadURL: rbxmDownloadURL,
                fbxDownloadURL: fbxDownloadURL,
                notes: [
                    "Real AI-generated 3D model with textures.",
                    "Import via File > Import 3D in Studio.",
                    nativeRobloxArtifact != nil ? "A native .rbxm is also available as a secondary option." : nil
                ].compactMap { $0 }
            )
        }

        if let nativeRobloxArtifact {
            // Script / System projects: show 2D concept preview (Fal.ai) instead
            // of the generic 3D character placeholder. thumbnailArtifact is the
            // isPreviewTexture artifact the backend already generates via
            // generatePreviewTexture() for projectKind === 'content'.
            if isScriptsContent {
                if let previewImageURL = (thumbnailArtifact?.downloadUrl ?? thumbnailArtifact?.url).flatMap(URL.init(string:)) {
                    let luaScripts = job.artifacts.filter { $0.type == "lua" || $0.type == "luau" }
                    let scriptList = luaScripts.isEmpty
                        ? "Script system ready for Studio."
                        : "\(luaScripts.count) script\(luaScripts.count == 1 ? "" : "s"): \(luaScripts.prefix(4).map(\.name).joined(separator: ", "))"
                    return PreviewPayload(
                        title: "\(draft.title) Script System",
                        artifactType: .media(kind: "png", remoteURL: previewImageURL),
                        exportFileType: nativeRobloxArtifact.type,
                        artifactIds: artifactIds,
                        shareDescription: shareDescription,
                        downloadURL: downloadURL,
                        glbDownloadURL: nil,
                        rbxmDownloadURL: rbxmDownloadURL,
                        fbxDownloadURL: nil,
                        notes: [
                            scriptList,
                            "Drag the .rbxm file into Workspace in Studio, then press Play."
                        ]
                    )
                }
                // No thumbnail available: fall through to robloxBinary display
            }
            if isCharacterProject {
                let caption = job.resultText
                    ?? primaryArtifact?.previewText
                    ?? "\(nativeRobloxArtifact.type.uppercased()) artifact ready for Studio."
                return PreviewPayload(
                    title: "\(draft.title) \(nativeRobloxArtifact.type.uppercased())",
                    artifactType: .model3D(
                        bodyType: bodyTypeForPreview,
                        accentColor: accentColorForPreview,
                        textureURL: nil,
                        caption: caption,
                        archetype: archetypeForPreview
                    ),
                    exportFileType: nativeRobloxArtifact.type,
                    artifactIds: artifactIds,
                    shareDescription: shareDescription,
                    downloadURL: downloadURL,
                    glbDownloadURL: glbDownloadURL,
                    rbxmDownloadURL: rbxmDownloadURL,
                    fbxDownloadURL: fbxDownloadURL,
                    notes: [
                        "Transfer the file to desktop and open it directly in Studio.",
                        "Keep the project bundle as a fallback if you need manual recovery."
                    ]
                )
            }
            if isGameProject,
               let previewImageURL = (thumbnailArtifact?.downloadUrl ?? thumbnailArtifact?.url ?? mediaArtifact?.downloadUrl ?? mediaArtifact?.url).flatMap(URL.init(string:)) {
                return PreviewPayload(
                    title: gameWorldTitle,
                    artifactType: .media(kind: "png", remoteURL: previewImageURL),
                    exportFileType: nativeRobloxArtifact.type,
                    artifactIds: artifactIds,
                    shareDescription: shareDescription,
                    downloadURL: downloadURL,
                    glbDownloadURL: nil,
                    rbxmDownloadURL: nil,
                    fbxDownloadURL: nil,
                    notes: gamePreviewNotes(exportLine: "Download the RBXL file and open in Studio.")
                )
            }
            // Build a human-readable list of what's inside the binary
            let artifactDescriptions: [String] = {
                var descriptions: [String] = []
                let luaArtifacts = job.artifacts.filter { $0.type == "lua" || $0.type == "luau" }
                let jsonArtifacts = job.artifacts.filter { $0.type == "json" }
                let mediaArtifacts = job.artifacts.filter { $0.type == "png" || $0.type == "jpg" || $0.type == "jpeg" || $0.type == "webp" }
                if !luaArtifacts.isEmpty {
                    descriptions.append("\(luaArtifacts.count) Luau script\(luaArtifacts.count == 1 ? "" : "s") — \(luaArtifacts.prefix(3).map(\.name).joined(separator: ", "))\(luaArtifacts.count > 3 ? " …" : "")")
                }
                if !jsonArtifacts.isEmpty {
                    descriptions.append("\(jsonArtifacts.count) JSON config\(jsonArtifacts.count == 1 ? "" : "s")")
                }
                if !mediaArtifacts.isEmpty {
                    descriptions.append("\(mediaArtifacts.count) texture / image\(mediaArtifacts.count == 1 ? "" : "s")")
                }
                let rbxmArtifacts = job.artifacts.filter { $0.type == "rbxm" || $0.type == "rbxmx" }
                if !rbxmArtifacts.isEmpty {
                    descriptions.append("\(rbxmArtifacts.count) model instance\(rbxmArtifacts.count == 1 ? "" : "s") (.rbxm)")
                }
                if descriptions.isEmpty {
                    descriptions.append("AI-generated Studio package — open in Studio to inspect contents.")
                }
                descriptions.append(job.status == "awaiting_review" ? "Awaiting review before publication." : "Ready for Studio validation.")
                return descriptions
            }()
            // 2026-05-20 (Track 3 Phase 2): if the .rbxm carries a serialized
            // BlockyPetSpec in its metadata, render an interactive 3D
            // SceneKit preview instead of the generic robloxBinary text card.
            // The spec was attached server-side in
            // apps/functions/src/index.ts:processBlockyPetJob.
            if let specJSON = nativeRobloxArtifact.metadata?.blockyPetSpecJSON,
               let spec = BlockyPetSpecPayload.decode(from: specJSON) {
                let element = nativeRobloxArtifact.metadata?.petElement ?? "Neutral"
                let rarity = nativeRobloxArtifact.metadata?.petRarity ?? "Common"
                let species = nativeRobloxArtifact.metadata?.petSpeciesType ?? "pet"
                let isFlying = nativeRobloxArtifact.metadata?.petIsFlying ?? false
                return PreviewPayload(
                    title: "\(draft.title) — Pet Preview",
                    artifactType: .blockyPet3D(
                        spec: spec,
                        element: element,
                        rarity: rarity,
                        species: species,
                        isFlying: isFlying,
                        notes: artifactDescriptions
                    ),
                    exportFileType: nativeRobloxArtifact.type,
                    artifactIds: artifactIds,
                    shareDescription: shareDescription,
                    downloadURL: downloadURL,
                    glbDownloadURL: glbDownloadURL,
                    rbxmDownloadURL: rbxmDownloadURL,
                    fbxDownloadURL: fbxDownloadURL,
                    notes: artifactDescriptions,
                    trendingShowcaseItems: trendingShowcaseItems,
                    trendingShowcaseCategory: trendingShowcaseCategory
                )
            }
            return PreviewPayload(
                title: "\(draft.title) \(nativeRobloxArtifact.type.uppercased())",
                artifactType: .robloxBinary(
                    kind: nativeRobloxArtifact.type,
                    notes: artifactDescriptions
                ),
                exportFileType: nativeRobloxArtifact.type,
                artifactIds: artifactIds,
                shareDescription: shareDescription,
                downloadURL: downloadURL,
                glbDownloadURL: glbDownloadURL,
                rbxmDownloadURL: rbxmDownloadURL,
                fbxDownloadURL: fbxDownloadURL,
                notes: artifactDescriptions,
                trendingShowcaseItems: trendingShowcaseItems,
                trendingShowcaseCategory: trendingShowcaseCategory
            )
        }

        if let bundleArtifact {
            if isCharacterProject {
                let summary = bundleArtifact.previewText ?? "Project bundle ready for Studio handoff."
                let fileList = job.artifacts.map(\.name).joined(separator: "\n")
                let caption = "\(summary)\n\nFiles: \(fileList)"
                return PreviewPayload(
                    title: "\(draft.title) Project Bundle",
                    artifactType: .model3D(
                        bodyType: bodyTypeForPreview,
                        accentColor: accentColorForPreview,
                        textureURL: nil,
                        caption: caption,
                        archetype: archetypeForPreview
                    ),
                    exportFileType: bundleArtifact.type,
                    artifactIds: artifactIds,
                    shareDescription: shareDescription,
                    downloadURL: downloadURL,
                    glbDownloadURL: glbDownloadURL,
                    rbxmDownloadURL: rbxmDownloadURL,
                    fbxDownloadURL: fbxDownloadURL,
                    notes: [
                        "Fallback handoff package for Studio import and manual assembly.",
                        "Use this when native binary export is unavailable or still under review."
                    ]
                )
            }
            if isGameProject,
               let previewImageURL = (thumbnailArtifact?.downloadUrl ?? thumbnailArtifact?.url ?? mediaArtifact?.downloadUrl ?? mediaArtifact?.url).flatMap(URL.init(string:)) {
                return PreviewPayload(
                    title: gameWorldTitle,
                    artifactType: .media(kind: "png", remoteURL: previewImageURL),
                    exportFileType: bundleArtifact.type,
                    artifactIds: artifactIds,
                    shareDescription: shareDescription,
                    downloadURL: downloadURL,
                    glbDownloadURL: nil,
                    rbxmDownloadURL: nil,
                    fbxDownloadURL: nil,
                    notes: gamePreviewNotes(exportLine: "Download the project bundle and import in Studio."),
                    trendingShowcaseItems: trendingShowcaseItems,
                    trendingShowcaseCategory: trendingShowcaseCategory
                )
            }
            return PreviewPayload(
                title: "\(draft.title) Project Bundle",
                artifactType: .projectBundle(
                    summary: bundleArtifact.previewText ?? "Project bundle ready for Studio handoff.",
                    files: job.artifacts.map(\.name)
                ),
                exportFileType: bundleArtifact.type,
                artifactIds: artifactIds,
                shareDescription: shareDescription,
                downloadURL: downloadURL,
                glbDownloadURL: glbDownloadURL,
                rbxmDownloadURL: rbxmDownloadURL,
                fbxDownloadURL: fbxDownloadURL,
                notes: [
                    "Fallback handoff package for Studio import and manual assembly.",
                    "Use this when native binary export is unavailable or still under review."
                ],
                trendingShowcaseItems: trendingShowcaseItems,
                trendingShowcaseCategory: trendingShowcaseCategory
            )
        }

        // isScriptsContent defined earlier (before isCharacterProject)
        if let code = luaArtifact?.code ?? primaryArtifact?.code ?? job.resultText, !code.isEmpty,
           projectKind == .fix || projectKind == .analyze || isScriptsContent {
            return PreviewPayload(
                title: "\(draft.title) Luau Preview",
                artifactType: .code(code),
                exportFileType: luaArtifact?.type ?? "lua",
                artifactIds: artifactIds,
                shareDescription: shareDescription,
                downloadURL: downloadURL,
                glbDownloadURL: glbDownloadURL,
                rbxmDownloadURL: rbxmDownloadURL,
                fbxDownloadURL: fbxDownloadURL,
                notes: isScriptsContent
                    ? ["Copy the Lua code and paste it directly into Studio."]
                    : ["Review Luau changes before merging them into a live experience."]
            )
        }

        if let mediaArtifact {
            return PreviewPayload(
                title: "\(draft.title) Asset Preview",
                artifactType: .media(kind: mediaArtifact.type, remoteURL: URL(string: mediaArtifact.downloadUrl ?? mediaArtifact.url ?? "")),
                exportFileType: mediaArtifact.type,
                artifactIds: artifactIds,
                shareDescription: shareDescription,
                downloadURL: downloadURL,
                glbDownloadURL: glbDownloadURL,
                rbxmDownloadURL: rbxmDownloadURL,
                fbxDownloadURL: fbxDownloadURL,
                notes: ["Validate generated media in the asset pipeline before publish."]
            )
        }

        if let text = gddArtifact?.content ?? textArtifact?.content ?? primaryArtifact?.content ?? job.resultText, !text.isEmpty {
            if isCharacterProject {
                return PreviewPayload(
                    title: "\(draft.title) Preview",
                    artifactType: .model3D(
                        bodyType: bodyTypeForPreview,
                        accentColor: accentColorForPreview,
                        textureURL: nil,
                        caption: text,
                        archetype: archetypeForPreview
                    ),
                    exportFileType: gddArtifact?.type ?? textArtifact?.type ?? "text",
                    artifactIds: artifactIds,
                    shareDescription: shareDescription,
                    downloadURL: downloadURL,
                    glbDownloadURL: glbDownloadURL,
                    rbxmDownloadURL: rbxmDownloadURL,
                    fbxDownloadURL: fbxDownloadURL,
                    notes: ["Use this preview as editable source material for follow-up generation."]
                )
            }
            return PreviewPayload(
                title: "\(draft.title) Preview",
                artifactType: .text(text),
                exportFileType: gddArtifact?.type ?? textArtifact?.type ?? "text",
                artifactIds: artifactIds,
                shareDescription: shareDescription,
                downloadURL: downloadURL,
                glbDownloadURL: glbDownloadURL,
                rbxmDownloadURL: rbxmDownloadURL,
                fbxDownloadURL: fbxDownloadURL,
                notes: ["Use this preview as editable source material for follow-up generation."]
            )
        }

        if isCharacterProject {
            return PreviewPayload(
                title: "\(draft.title) GDD",
                artifactType: .model3D(
                    bodyType: bodyTypeForPreview,
                    accentColor: accentColorForPreview,
                    textureURL: nil,
                    caption: draft.gddRows.map { "\($0.0): \($0.1)" }.joined(separator: "\n"),
                    archetype: archetypeForPreview
                ),
                exportFileType: "gdd",
                artifactIds: artifactIds,
                shareDescription: shareDescription,
                downloadURL: downloadURL,
                glbDownloadURL: glbDownloadURL,
                rbxmDownloadURL: rbxmDownloadURL,
                fbxDownloadURL: fbxDownloadURL,
                notes: ["Generation returned only planning data, so the brief remains the primary preview."]
            )
        }

        return PreviewPayload(
            title: "\(draft.title) GDD",
            artifactType: .gdd(rows: draft.gddRows),
            exportFileType: "gdd",
            artifactIds: artifactIds,
            shareDescription: shareDescription,
            downloadURL: downloadURL,
            glbDownloadURL: glbDownloadURL,
            rbxmDownloadURL: rbxmDownloadURL,
            fbxDownloadURL: fbxDownloadURL,
            notes: ["Generation returned only planning data, so the brief remains the primary preview."]
        )
    }

    private func safePipelineStageSummary(
        _ raw: String,
        stage: AIWorkspaceAPI.GenerationStage,
        job: AIWorkspaceAPI.GenerationJob
    ) -> String {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        let stageTitle = localizedGenerationStageTitle(id: stage.id, fallback: stage.title)
        guard !trimmed.isEmpty else { return stageTitle }
        if stage.status == "failed",
           stage.id != "quality_review",
           (Self.looksLikeBackendDiagnostic(trimmed) || Self.looksLikeRawStructuredPayload(trimmed)) {
            return safeJobFailureMessage(from: job)
        }
        if Self.looksLikeBackendDiagnostic(trimmed) || Self.looksLikeRawStructuredPayload(trimmed) {
            return stageTitle
        }
        return trimmed
    }

    private func buildPipelineStages(from job: AIWorkspaceAPI.GenerationJob) -> [GenerationPreviewView.PipelineStagePreview] {
        guard let stages = job.stages, !stages.isEmpty else { return [] }
        return stages.map { stage in
            let stageTitle = localizedGenerationStageTitle(id: stage.id, fallback: stage.title)
            let stageArtifacts = job.artifacts.filter { artifact in
                artifact.stageId == stage.id || (stage.artifactIds?.contains(artifact.id) ?? false)
            }
            let qualitySummary = stage.id == "quality_review" ? qualityFailureMessage(from: job) : nil
            let stageErrorSummary = stage.status == "failed" ? safeJobFailureMessage(from: job) : stage.errorMessage
            let rawSummary = stage.notes?.joined(separator: "\n")
                ?? qualitySummary
                ?? stageErrorSummary
                ?? stageArtifacts.first?.previewText
                ?? stageTitle
            let summary = safePipelineStageSummary(rawSummary, stage: stage, job: job)
            return GenerationPreviewView.PipelineStagePreview(
                id: stage.id,
                title: stageTitle,
                status: stage.status,
                summary: summary,
                artifactType: pipelineArtifactType(for: stage.id, artifacts: stageArtifacts, summary: summary)
            )
        }
    }

    private func pipelineArtifactType(
        for stageId: String,
        artifacts: [AIWorkspaceAPI.GenerationArtifact],
        summary: String
    ) -> GenerationPreviewView.ArtifactType? {
        if let binaryArtifact = artifacts.first(where: { $0.type == "rbxm" || $0.type == "rbxl" }) {
            let notes = artifacts.compactMap(\.previewText) + [summary]
            // 2026-05-20: blocky furniture/prop — render 3D from the LLM scene
            // JSON carried in metadata.furnitureSpecJSON.
            if let furnSpecJSON = binaryArtifact.metadata?.furnitureSpecJSON,
               let furnSpec = FurnitureSpecPayload.decode(from: furnSpecJSON) {
                let furnType = binaryArtifact.metadata?.furnitureType ?? furnSpec.furnitureType ?? "prop"
                return .blockyFurniture3D(spec: furnSpec, furnitureType: furnType, notes: notes)
            }
            // 2026-05-20 (Track 3 Phase 2): blocky-pet rbxm carries a serialized
            // BlockyPetSpec in metadata.blockyPetSpecJSON. Render the SceneKit
            // 3D preview instead of the generic .robloxBinary text card so the
            // user can rotate the pet right inside the pipeline-stage modal.
            if let specJSON = binaryArtifact.metadata?.blockyPetSpecJSON,
               let spec = BlockyPetSpecPayload.decode(from: specJSON) {
                let element = binaryArtifact.metadata?.petElement ?? "Neutral"
                let rarity = binaryArtifact.metadata?.petRarity ?? "Common"
                let species = binaryArtifact.metadata?.petSpeciesType ?? "pet"
                let isFlying = binaryArtifact.metadata?.petIsFlying ?? false
                return .blockyPet3D(
                    spec: spec,
                    element: element,
                    rarity: rarity,
                    species: species,
                    isFlying: isFlying,
                    notes: notes
                )
            }
            return .robloxBinary(kind: binaryArtifact.type, notes: notes)
        }

        if let bundleArtifact = artifacts.first(where: { $0.type == "project_bundle" }) {
            return .projectBundle(
                summary: bundleArtifact.previewText ?? summary,
                files: artifacts.map(\.name)
            )
        }

        if artifacts.contains(where: { $0.is3DModel }) {
            let glbArtifact = artifacts.first(where: { $0.is3DModel })
            let thumbArtifact = artifacts.first(where: { $0.artifactRole == "thumbnail" || ($0.isPreviewTexture && !$0.is3DModel) })
            let thumbURL = thumbArtifact.flatMap { URL(string: $0.downloadUrl ?? $0.url ?? "") }

            if let glbArtifact, let glbURL = glbArtifact.modelDownloadUrl {
                return .interactive3D(thumbnailURL: thumbURL, modelURL: glbURL)
            }
            if let thumbURL {
                return .media(kind: "png", remoteURL: thumbURL)
            }
            return .text("3D model generated (GLB) — export to Studio for preview")
        }

        if let imageArtifact = artifacts.first(where: { $0.artifactRole == "concept" || $0.type == "png" || $0.type == "jpg" || $0.type == "jpeg" }),
           imageArtifact.metadata?.isClothingPreview == true {
            let shirtURL = imageArtifact.metadata?.shirtTextureUrl.flatMap { URL(string: $0) }
            let pantsURL = imageArtifact.metadata?.pantsTextureUrl.flatMap { URL(string: $0) }
            if shirtURL == nil && pantsURL == nil {
                let remoteURL = URL(string: imageArtifact.downloadUrl ?? imageArtifact.url ?? "")
                return .media(kind: imageArtifact.type, remoteURL: remoteURL)
            }
            return .clothingPreview(shirtURL: shirtURL, pantsURL: pantsURL)
        }

        if let imageArtifact = artifacts.first(where: { $0.artifactRole == "concept" || $0.type == "png" || $0.type == "jpg" || $0.type == "jpeg" }) {
            let remoteURL = URL(string: imageArtifact.downloadUrl ?? imageArtifact.url ?? "")
            return .media(kind: imageArtifact.type, remoteURL: remoteURL)
        }

        if let textArtifact = artifacts.first(where: { $0.content != nil || $0.previewText != nil }) {
            return .text(textArtifact.content ?? textArtifact.previewText ?? summary)
        }

        if stageId == "export_rbxm" {
            return .unavailable(summary)
        }

        return nil
    }

    private func updateThread(threadId: String, title: String, promptHint: String) {
        if let index = threads.firstIndex(where: { $0.id == threadId }) {
            threads[index].title = title
            threads[index].promptHint = promptHint
            threads[index].updatedAt = Date()
            threads[index].contentSubcategory = threadProjectMemory?.contentSubcategory ?? contentSubcategory
            threads[index].latestJobId = threadProjectMemory?.latestJobId ?? lastJobId
            threads[index].projectMemory = threadProjectMemory
            currentThread = threads[index]
        } else {
            let thread = ChatThread(
                id: threadId,
                title: title,
                updatedAt: Date(),
                promptHint: promptHint,
                type: ThreadType.from(projectKind),
                projectKindRaw: promptProjectKind,
                contentSubcategory: threadProjectMemory?.contentSubcategory ?? contentSubcategory,
                latestJobId: threadProjectMemory?.latestJobId ?? lastJobId,
                projectMemory: threadProjectMemory
            )
            threads.insert(thread, at: 0)
            currentThread = thread
        }
    }

    private func appendAssistantMessage(_ content: String) {
        messages.append(
            ChatMessage(
                id: UUID().uuidString,
                role: .assistant,
                content: content,
                quickReplies: ["Retry", "Refine plan", "Open Community"],
                gddRows: nil,
                createdAt: Date()
            )
        )
    }

    /// Public-facing helper for views that need to surface a non-LLM error
    /// (e.g. picker failed to read a photo). Reuses the standard assistant bubble
    /// shape so the chat thread stays consistent.
    func presentAttachmentError(_ content: String) {
        appendAssistantMessage(content)
    }

    private func sanitizedChatMessageForDisplay(_ message: ChatMessage) -> ChatMessage {
        guard message.role == .assistant else { return message }
        let safeRows: [(String, String)]?
        if let rows = message.gddRowTuples {
            let sanitizedRows = sanitizedGddRows(rows)
            safeRows = sanitizedRows.isEmpty ? nil : sanitizedRows
        } else {
            safeRows = nil
        }

        return ChatMessage(
            id: message.id,
            role: message.role,
            content: sanitizedAssistantText(message.content),
            quickReplies: message.quickReplies,
            gddRows: safeRows,
            createdAt: message.createdAt,
            audioURL: message.audioURL,
            imageURL: message.imageURL,
            localImageKey: message.localImageKey,
            weaponColors: message.weaponColors
        )
    }

    private func sanitizedAssistantText(_ raw: String) -> String {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        let isRu = preferredResponseLanguageCode() == "ru"
        guard !trimmed.isEmpty else {
            return isRu ? "Я обновил план сборки." : "I updated your build plan."
        }
        if Self.looksLikeBackendDiagnostic(trimmed) {
            return isRu
                ? "Сервис временно недоступен. Я остановил этот шаг, чтобы не продолжать фейковый диалог."
                : "The service is temporarily unavailable. I stopped this step so the chat does not continue with a fake response."
        }
        if Self.looksLikeRawStructuredPayload(trimmed) {
            return isRu
                ? "Я обновил план сборки. Проверьте сводку ниже и запускайте генерацию, когда всё готово."
                : "I updated the build plan. Review the summary below and generate when ready."
        }
        return trimmed
    }

    private func sanitizedGddRows(_ rows: [(String, String)]) -> [(String, String)] {
        let isRu = preferredResponseLanguageCode() == "ru"
        return rows.compactMap { key, value in
            let trimmedKey = key.trimmingCharacters(in: .whitespacesAndNewlines)
            let trimmedValue = value.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmedKey.isEmpty, !trimmedValue.isEmpty else { return nil }
            // Filter checks run on the ORIGINAL English value — placeholders
            // like "none"/"default" are intentionally NOT in briefRuValueMap
            // so they still match shouldHideGddRow before translation.
            guard !Self.shouldHideGddRow(key: trimmedKey, value: trimmedValue) else { return nil }
            guard !Self.looksLikeRawStructuredPayload(trimmedValue) else { return nil }
            guard !Self.looksLikeBackendDiagnostic(trimmedValue) else { return nil }
            return (trimmedKey, isRu ? Self.localizeBriefValue(trimmedValue) : trimmedValue)
        }
    }

    // Display-only translation for tokenized GDD values that the backend / LLM
    // returns as English snake_case tokens or template-driven English phrases
    // (genre/scale/mechanics/systems/monetization/dataStore/visualStyle/...).
    // The underlying `gdd` object keeps English tokens so downstream string
    // comparisons (`gdd.genre == "npc_ai"`, category matching, etc.) stay
    // correct. Unknown free-text values (user-typed title/theme, LLM-narrated
    // descriptions in user's language) fall through unchanged.
    private static let briefRuValueMap: [String: String] = [
        // genre / category
        "map_environment": "Карта / окружение",
        "npc_ai": "NPC AI",
        "brainrot_sim": "Бредогон-симулятор",
        "obby_troll": "Обби-троллинг",
        "obby": "Обби",
        "tycoon": "Тайкун",
        "simulator": "Симулятор",
        "rpg": "РПГ",
        "horror": "Хоррор",
        "pvp": "PvP",
        "pvp_arena": "PvP-арена",
        "racing": "Гонки",
        "tower defense": "Tower Defense",
        "roleplay": "Ролевая",
        "parkour": "Паркур",
        "story": "Сюжетная",
        "mini-games": "Мини-игры",
        "survival": "Выживание",
        "fighting": "Файтинг",
        "custom": "Кастомная",
        "studio experience": "Studio-проект",
        // scale
        "small": "Маленький",
        "medium": "Средний",
        "large": "Большой",
        "tiny": "Крошечный",
        "huge": "Огромный",
        // mechanics — known tokens
        "free_exploration": "Свободное исследование",
        "spawn_point_central": "Центральная точка спавна",
        "linear_path_traversal": "Линейное прохождение",
        "player_spawn_point_at_start": "Точка спавна на старте",
        "clear_visual_guidance": "Чёткое визуальное направление",
        "fast_travel": "Быстрое перемещение",
        "checkpoint_system": "Чекпоинты",
        "respawn_system": "Респавн",
        "open_world": "Открытый мир",
        "day_night_cycle": "Цикл день/ночь",
        "weather_system": "Погодные эффекты",
        "interactive_objects": "Интерактивные объекты",
        "combat": "Бой",
        "crafting": "Крафт",
        "collection": "Сбор",
        "quests": "Квесты",
        "inventory": "Инвентарь",
        "trading": "Торговля",
        "pet_system": "Система питомцев",
        "rebirth": "Перерождение",
        // systems / UI / monetization / data store / visual style
        "ui flow": "Интерфейс",
        "economy": "Экономика",
        "retention hooks": "Удержание",
        "vip": "VIP",
        "boosts": "Бусты",
        "daily rewards": "Ежедневные награды",
        "bright trending style": "Яркий трендовый стиль",
        "player progress and rewards": "Прогресс и награды игрока",
        "beginner": "Новичок",
        "advanced": "Продвинутый",
        "developer": "Разработчик",
    ]

    private static func localizeBriefValue(_ value: String) -> String {
        guard !value.isEmpty else { return value }
        // Values may be `"; "`-joined (map/levels) or `", "`-joined (lists).
        return value.components(separatedBy: "; ").map { chunk in
            chunk.components(separatedBy: ", ").map(localizeBriefToken).joined(separator: ", ")
        }.joined(separator: "; ")
    }

    private static func localizeBriefToken(_ token: String) -> String {
        let trimmed = token.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return token }
        let lower = trimmed.lowercased()
        if let mapped = briefRuValueMap[lower] { return mapped }
        // Humanize unknown snake_case tokens so the user does not see raw
        // identifiers like `clear_visual_guidance`. Still English, but
        // readable — covers LLM-invented tokens the dict cannot enumerate.
        if trimmed.contains("_") {
            let humanized = trimmed
                .replacingOccurrences(of: "_", with: " ")
                .trimmingCharacters(in: .whitespacesAndNewlines)
            guard !humanized.isEmpty else { return token }
            return humanized.prefix(1).uppercased() + humanized.dropFirst()
        }
        return token
    }

    private static func shouldHideGddRow(key: String, value: String) -> Bool {
        let lowerKey = key.lowercased()
        let lowerValue = value
            .trimmingCharacters(in: CharacterSet(charactersIn: "\"' "))
            .lowercased()
        let placeholderValues: Set<String> = ["default", "generic", "none", "n/a", "null", "undefined"]
        if lowerKey.contains("theme") || lowerKey.contains("тема") {
            return placeholderValues.contains(lowerValue)
        }
        return false
    }

    private static func looksLikeRawStructuredPayload(_ text: String) -> Bool {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count >= 4 else { return false }
        let lower = trimmed.lowercased()
        let hasStructuredKey = lower.contains("\"assistantmessage\"")
            || lower.contains("\"quickreplies\"")
            || lower.contains("\"threadtitle\"")
            || lower.contains("\"gdd\"")
            || lower.contains("\"action\"") && lower.contains("\"generating\"")
        let hasThemePair = lower.contains("\"theme\"") && lower.contains(":")
        if hasStructuredKey || hasThemePair {
            return true
        }
        let startsAsObject = trimmed.first == "{" && trimmed.last == "}"
        let startsAsArray = trimmed.first == "[" && trimmed.last == "]"
        if (startsAsObject || startsAsArray), trimmed.contains(":"), trimmed.contains("\"") {
            return true
        }
        return false
    }

    private static func looksLikeBackendDiagnostic(_ text: String) -> Bool {
        let lower = text.lowercased()
        return lower.contains("ai backend")
            || lower.contains("functions base url")
            || lower.contains("firebase")
            || lower.contains("server error (http")
            || lower.contains("nsurlerrordomain")
            || lower.contains("localizeddescription")
            || lower.contains("unexpected server response")
    }

    private func gddRows(from gdd: AIWorkspaceAPI.RemoteGDD) -> [(String, String)] {
        // Localize labels to match the user's conversation language — prevents
        // mixed RU/EN UI when the user writes in Russian. Value translation
        // happens centrally in sanitizedGddRows so it covers backend-pre-built
        // rows too (response.message?.gddRows path).
        let lang = preferredResponseLanguageCode()
        let isRu = lang == "ru"
        func lbl(_ en: String, _ ru: String) -> String { isRu ? ru : en }
        func valueAfterPrefix(_ prefix: String, in values: [String]) -> String? {
            let lowerPrefix = prefix.lowercased()
            return values.compactMap { value in
                let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
                guard trimmed.lowercased().hasPrefix(lowerPrefix) else { return nil }
                let suffix = trimmed.dropFirst(prefix.count)
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                return suffix.isEmpty ? nil : suffix
            }.first
        }

        if contentSubcategory == "npcs" {
            let roleFromGDD = valueAfterPrefix("Role:", in: gdd.mechanics)
            let behaviorRows = gdd.mechanics.compactMap { value -> String? in
                let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
                let lower = trimmed.lowercased()
                if lower.hasPrefix("role:") { return nil }
                if lower.hasPrefix("behavior:") {
                    let suffix = trimmed.dropFirst("Behavior:".count)
                        .trimmingCharacters(in: .whitespacesAndNewlines)
                    return suffix.isEmpty ? nil : suffix
                }
                return trimmed.isEmpty ? nil : trimmed
            }
            var rows: [(String, String)] = [
                (lbl("Name", "Имя"), gdd.title),
                (lbl("NPC Role", "Роль NPC"), gdd.genre == "npc_ai" ? (draft.npcRole ?? roleFromGDD ?? "dialogue") : gdd.genre),
            ]
            if let theme = gdd.theme, !theme.isEmpty {
                rows.append((lbl("Theme", "Тема"), theme))
            }
            if !behaviorRows.isEmpty {
                rows.append((lbl("Behavior", "Поведение"), behaviorRows.joined(separator: ", ")))
            }
            if let characters = gdd.characters, !characters.isEmpty {
                rows.append((lbl("Visual hooks", "Визуальные детали"), characters.joined(separator: ", ")))
            }
            if !gdd.systems.isEmpty {
                rows.append((lbl("Systems", "Системы"), gdd.systems.joined(separator: ", ")))
            }
            if let style = gdd.visualStyle, !style.isEmpty {
                rows.append((lbl("Visual style", "Визуальный стиль"), style))
            }
            return rows
        }

        func joined(_ values: [String]?) -> String? {
            guard let values, !values.isEmpty else { return nil }
            return values.joined(separator: ", ")
        }
        func add(_ key: String, _ value: String?, to rows: inout [(String, String)]) {
            guard let value = value?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty else { return }
            rows.append((key, value))
        }
        let gameSubcategories: Set<String> = ["brainrot_sim", "obby_troll", "rpg", "horror", "pvp", "pvp_arena", "simulator"]
        let genreLower = gdd.genre.lowercased()
        let isGameBrief = projectKind == .game
            || projectKind == .clone
            || gameSubcategories.contains(contentSubcategory ?? "")
            || ["obby", "tycoon", "simulator", "rpg", "horror", "roleplay", "pvp", "tower defense", "racing", "parkour", "story", "mini-games", "survival", "fighting", "custom", "studio experience"].contains { genreLower.contains($0) }

        var rows: [(String, String)] = [
            (lbl("Title", "Название"), gdd.title),
            (lbl("Genre", "Жанр"), gdd.genre),
        ]
        if let theme = gdd.theme, !theme.isEmpty {
            rows.append((lbl("Theme", "Тема"), theme))
        }
        rows.append((lbl("Scale", "Масштаб"), gdd.scale.capitalized))

        if isGameBrief {
            add(lbl("Target Player", "Целевой игрок"), gdd.targetPlayer, to: &rows)
            add(lbl("Core Loop", "Основной цикл"), gdd.coreLoop, to: &rows)
            add(lbl("Map / Levels", "Карта / уровни"), [gdd.mapStructure, joined(gdd.levels)].compactMap { $0 }.joined(separator: "; "), to: &rows)
            add(lbl("Mechanics", "Механики"), joined(gdd.mechanics), to: &rows)
            add(lbl("Progression", "Прогрессия"), joined(gdd.progression), to: &rows)
            add(lbl("Economy", "Экономика"), joined(gdd.economy), to: &rows)
            add(lbl("Win / Lose", "Победа / поражение"), [gdd.winCondition, gdd.loseCondition].compactMap { $0 }.joined(separator: " / "), to: &rows)
            add(lbl("Characters", "Персонажи"), joined(gdd.characters), to: &rows)
            add(lbl("Systems", "Системы"), joined(gdd.systems), to: &rows)
            add(lbl("UI / HUD", "UI / HUD"), joined(gdd.uiHud), to: &rows)
            add(lbl("Audio / VFX", "Аудио / VFX"), joined(gdd.audioVfx), to: &rows)
            add(lbl("Social", "Социальные системы"), joined(gdd.socialSystems), to: &rows)
            add(lbl("Monetization", "Монетизация"), joined(gdd.monetization) ?? (isRu ? "Нет" : "None"), to: &rows)
            add(lbl("Data Store", "Хранилище данных"), joined(gdd.dataStore), to: &rows)
            add(lbl("Platform Services", "Сервисы платформы"), joined(gdd.robloxServices), to: &rows)
            add(lbl("Technical Notes", "Технические заметки"), joined(gdd.technicalNotes), to: &rows)
            add(lbl("Safety Notes", "Безопасность"), joined(gdd.safetyNotes), to: &rows)
            add(lbl("Visual Style", "Визуальный стиль"), gdd.visualStyle, to: &rows)
            add(lbl("Expertise Level", "Уровень экспертизы"), gdd.expertiseLevel, to: &rows)
            return rows
        }

        if !gdd.mechanics.isEmpty {
            rows.append((lbl("Mechanics", "Механики"), gdd.mechanics.joined(separator: ", ")))
        }
        if let characters = gdd.characters, !characters.isEmpty {
            rows.append((lbl("Characters", "Персонажи"), characters.joined(separator: ", ")))
        }
        if !gdd.systems.isEmpty {
            rows.append((lbl("Systems", "Системы"), gdd.systems.joined(separator: ", ")))
        }
        if let monetization = gdd.monetization, !monetization.isEmpty {
            rows.append((lbl("Monetization", "Монетизация"), monetization.joined(separator: ", ")))
        }
        if let style = gdd.visualStyle, !style.isEmpty {
            rows.append((lbl("Visual Style", "Визуальный стиль"), style))
        }
        if let dataStore = gdd.dataStore, !dataStore.isEmpty {
            rows.append((lbl("Data Store", "Хранилище данных"), dataStore.joined(separator: ", ")))
        }
        return rows
    }

    private func welcomeMessage() -> ChatMessage {
        let content: String
        let replies: [String]

        if contentSubcategory == "brainrot_sim" {
            switch preferredFlow {
            case .quickGenerate:
                content = "Steal-a-Brainrot generator is live. Pick a viral loop and I will build the conveyor, bases, cash/sec, base locks, slap defense, raid alerts, and rebirth economy into the new .rbxl."
                replies = ["Italian raid mode", "Skibidi base war", "Sigma whale CPS", "Custom voice idea", "Switch to Interview"]
            case .smartInterview:
                content = "I am building this as a playable meme loop, not a theme card: conveyor drops, owned bases, stealing, slap defense, rare-spawn alerts, and rebirth. What should the first viral hook be?"
                replies = compactSmartInterviewReplies(from: brainrotSimStarterReplies())
            }
            return ChatMessage(
                id: "welcome",
                role: .assistant,
                content: content,
                quickReplies: replies,
                gddRows: nil,
                createdAt: Date()
            )
        }

        if contentSubcategory == "obby_troll" {
            switch preferredFlow {
            case .quickGenerate:
                content = "Troll-обби генератор запущен. Выбирай тему и жёсткость — соберу карту с невидимыми трапами, фейковыми чекпоинтами, исчезающим полом и launcher-плитами. Каждое срабатывание — фуллскрин 💀 GOTCHA."
                replies = ["Кэнди 70% жести", "Хоррор 45%", "Лава 20 стадий", "Своя тема", "К интервью"]
            case .smartInterview:
                content = "Делаем тролль-обби как живой разговор, не меню. Какая ловушка должна стать главным приколом первого прохождения?"
                replies = compactSmartInterviewReplies(from: obbyTrollStarterReplies())
            }
            return ChatMessage(
                id: "welcome",
                role: .assistant,
                content: content,
                quickReplies: replies,
                gddRows: nil,
                createdAt: Date()
            )
        }

        if contentSubcategory == "obby" {
            switch preferredFlow {
            case .quickGenerate:
                content = "Obby generator is ready. Pick the flavor inside this obby flow: classic parkour, horror escape, RPG quest path, PvP race arena, or troll traps."
                replies = ["Classic obby", "Horror obby", "RPG quest obby", "PvP race arena", "Switch to Interview"]
            case .smartInterview:
                content = "Let's build an obby together. What should the player feel first: clean parkour, a troll surprise, or something I choose for the strongest hook?"
                replies = compactSmartInterviewReplies(from: obbyGameStarterReplies())
            }
            return ChatMessage(id: "welcome", role: .assistant, content: content, quickReplies: replies, gddRows: nil, createdAt: Date())
        }

        if contentSubcategory == "tycoon" {
            switch preferredFlow {
            case .quickGenerate:
                content = "Tycoon generator is ready. Pick the tycoon flavor: classic factory, RPG kingdom economy, horror lab, PvP base war, or rebirth-heavy upgrade loop."
                replies = ["Factory tycoon", "RPG kingdom tycoon", "Horror lab tycoon", "PvP base tycoon", "Switch to Interview"]
            case .smartInterview:
                content = "Let's shape the tycoon one decision at a time. What fantasy should the first money loop sell: factory growth, rebirth grind, or my best pick?"
                replies = compactSmartInterviewReplies(from: tycoonGameStarterReplies())
            }
            return ChatMessage(id: "welcome", role: .assistant, content: content, quickReplies: replies, gddRows: nil, createdAt: Date())
        }

        if contentSubcategory == "simulator" {
            switch preferredFlow {
            case .quickGenerate:
                content = "Simulator generator is live. Pick a variant and I will build the playable loop with currency, training or collecting, sell/reward zones, upgrades, rebirth, saving, and HUD."
                replies = ["Pet simulator", "Mining simulator", "Fighting simulator", "Muscle clicker", "Switch to Interview"]
            case .smartInterview:
                content = "Let's make the simulator feel playable from the first minute. What is the core action players repeat: collecting pets, fighting/training, or something I choose?"
                replies = compactSmartInterviewReplies(from: simulatorStarterReplies())
            }
            return ChatMessage(
                id: "welcome",
                role: .assistant,
                content: content,
                quickReplies: replies,
                gddRows: nil,
                createdAt: Date()
            )
        }

        if contentSubcategory == "rpg" {
            switch preferredFlow {
            case .quickGenerate:
                content = "RPG generator is live. Describe the class/theme, enemies, quest count, loot, and boss; I will build the town hub, quest NPC, combat, leveling, loot, and HUD."
                replies = ["Forest warrior RPG", "Mage dungeon RPG", "Archer boss hunt", "Switch to Interview"]
            case .smartInterview:
                content = "Let's build a playable RPG, not just lore. Who should the player feel like first: warrior, mage, archer, or should I pick the strongest setup?"
                replies = compactSmartInterviewReplies(from: rpgStarterReplies())
            }
            return ChatMessage(id: "welcome", role: .assistant, content: content, quickReplies: replies, gddRows: nil, createdAt: Date())
        }

        if contentSubcategory == "horror" {
            switch preferredFlow {
            case .quickGenerate:
                content = "Horror escape generator is live. Describe the setting, monster, keys, locked doors, and scare intensity; I will keep it creator-safe and playable."
                replies = ["School key escape", "Hospital chase", "Factory five keys", "Switch to Interview"]
            case .smartInterview:
                content = "Let's make this spooky but creator-safe. What should create the tension first: the setting, the monster chase, or should I choose?"
                replies = compactSmartInterviewReplies(from: horrorStarterReplies())
            }
            return ChatMessage(id: "welcome", role: .assistant, content: content, quickReplies: replies, gddRows: nil, createdAt: Date())
        }

        if contentSubcategory == "pvp" {
            switch preferredFlow {
            case .quickGenerate:
                content = "PvP Arena generator is live. Choose the arena theme, weapon set, round length, and spawn count; I will build FFA rounds with server-authoritative damage and K/D HUD."
                replies = ["Neon sword bow FFA", "Blaster arena", "Magic duel arena", "Switch to Interview"]
            case .smartInterview:
                content = "Let's build the arena around one strong combat promise. Should it feel like free-for-all chaos, team fights, or my best pick?"
                replies = compactSmartInterviewReplies(from: pvpArenaStarterReplies())
            }
            return ChatMessage(id: "welcome", role: .assistant, content: content, quickReplies: replies, gddRows: nil, createdAt: Date())
        }

        // Session 001 (Track 1): clothing subcategory opens with a clothing-type
        // picker. User picks T-Shirt / Shirt / Pants / Outfit BEFORE describing
        // the design — that routes the backend to the right pipeline (T-Shirt =
        // 512² ShirtGraphic; Shirt/Pants = 585×559 wrap-template). Quick-reply
        // tap is parsed in sendQuickReply and stashed on draft.clothingType.
        if contentSubcategory == "clothing" {
            // First-time-per-device compliance banner is prepended to the welcome
            // text. UserDefaults flag persists the dismiss so we don't repeat it.
            let dismissedKey = "clothing.compliance.dismissed"
            let alreadyDismissed = UserDefaults.standard.bool(forKey: dismissedKey)
            let banner = alreadyDismissed
                ? ""
                : "📌 Before you sell on Marketplace:\n• Roblox Premium 1000 or 2200 required (from Mar 19, 2026)\n• ID-verified account\n• 20 R$ in fees per item (10 upload + 10 on-sale)\nYou can generate & test without any of this. Tap “Got it” to hide.\n\n"
            // 2026-05-19 UX: separate WHAT (item type) from HOW (2D Classic vs
            // 3D Layered). User picks item upfront; the 2D/3D mode is asked AFTER
            // the design interview, right before generation kicks off — matches
            // the pattern of other content chats (e.g., weapon picks → interview
            // → finalize colors → generate).
            content = "\(banner)What do we make? Pick the garment type. After the interview I'll ask whether you want **2D Classic** (flat texture, fastest, web Marketplace) or **3D Layered** (real 3D mesh, premium quality, needs UGC Program approval)."
            let itemReplies = ["T-Shirt", "Shirt", "Pants", "Outfit", "Jacket", "Sweater", "Dress"]
            replies = alreadyDismissed
                ? itemReplies
                : itemReplies + ["Got it"]
            return ChatMessage(id: "welcome", role: .assistant, content: content, quickReplies: replies, gddRows: nil, createdAt: Date())
        }

        switch preferredFlow {
        case .quickGenerate:
            switch projectKind {
            case .game, .clone:
                content = "Quick Generate — describe your game in detail and I'll start building immediately. The more details (genre, mechanics, scale, style, monetization), the better!"
                replies = ["Example: Horror tycoon", "Example: RPG with quests", "Example: Tycoon with rebirth", "Switch to Interview"]
            case .content, .ugc:
                content = "Quick Generate — describe exactly what you want (type, style, colors, features) and I'll generate it right away."
                replies = quickGenerateContentReplies()
            case .fix:
                content = "Quick mode — paste your script or describe the issue, I'll fix it immediately."
                replies = ["Paste a script", "Describe the bug", "Optimize performance", "Switch to Interview"]
            case .analyze:
                content = "Quick mode — describe your game or paste a link, I'll analyze instantly."
                replies = ["Analyze retention", "Monetization review", "Trend check", "Switch to Interview"]
            }
        case .smartInterview:
            switch projectKind {
            case .game, .clone:
                content = "Hey! I'm your game designer. Tell me your idea — even a single word works. I'll ask the right questions to create something amazing. What do you want to build?"
            case .content, .ugc:
                content = smartInterviewContentWelcome()
            case .fix:
                content = "What needs fixing? Paste a script or describe the problem."
            case .analyze:
                content = "What game should I analyze? Tell me about it and I'll give targeted recommendations."
            }
            replies = compactSmartInterviewReplies(from: starterReplies)
        }

        return ChatMessage(
            id: "welcome",
            role: .assistant,
            content: content,
            quickReplies: replies,
            gddRows: nil,
            createdAt: Date()
        )
    }

    private var starterReplies: [String] {
        if contentSubcategory == "audio" {
            return ["Music Track", "Sound Effect", "Ambience", "Voice Line", "Decide for me", "Start over"]
        }
        if contentSubcategory == "brainrot_sim" {
            return brainrotSimStarterReplies()
        }
        if contentSubcategory == "obby_troll" {
            return obbyTrollStarterReplies()
        }
        if contentSubcategory == "obby" {
            return obbyGameStarterReplies()
        }
        if contentSubcategory == "tycoon" {
            return tycoonGameStarterReplies()
        }
        if contentSubcategory == "simulator" {
            return simulatorStarterReplies()
        }
        if contentSubcategory == "rpg" {
            return rpgStarterReplies()
        }
        if contentSubcategory == "horror" {
            return horrorStarterReplies()
        }
        if contentSubcategory == "pvp" {
            return pvpArenaStarterReplies()
        }
        switch projectKind {
        case .game, .clone:
            return ["Obby", "Tycoon", "Simulator", "Decide for me", "Start over"]
        case .content, .ugc:
            if let sub = contentSubcategory, let specific = contentSubcategoryStarterReplies(sub) {
                return specific
            }
            return ["Character", "Weapon", "Accessory", "Aura / Effect", "Decide for me", "Start over"]
        case .fix:
            return ["Fix script", "Refactor", "Optimize", "Explain code", "Debug crash", "Start over"]
        case .analyze:
            return ["Retention", "Monetization", "Trends", "Mobile perf", "Full audit", "Start over"]
        }
    }

    private func compactSmartInterviewReplies(from replies: [String]) -> [String] {
        let isAutoPick: (String) -> Bool = { reply in
            let lower = reply.lowercased()
            return lower.contains("decide")
                || lower.contains("surprise")
                || lower.contains("реши")
                || lower.contains("сам выбери")
        }
        let autoPick = replies.first(where: isAutoPick)
        let primary = replies
            .filter { !isAutoPick($0) }
            .filter {
                let lower = $0.lowercased()
                return !lower.contains("start over")
                    && !lower.contains("начать заново")
                    && !lower.contains("switch to interview")
                    && !lower.contains("к интервью")
            }
            .prefix(autoPick == nil ? 3 : 2)
        var compact = Array(primary)
        if let autoPick {
            compact.append(autoPick)
        }
        return Array(compact.prefix(3))
    }

    /// Matches `ProjectOption.id` in `ForgeView.contentOptions`.
    private func smartInterviewContentWelcome() -> String {
        if contentSubcategory == "audio" {
            return "Describe the audio you want — music, sound effects, or ambient sounds for your game experience."
        }
        switch contentSubcategory {
        case "clothing":
            return "Hey! I'm your clothing designer. Tell me what you want — even just \"red t-shirt\" is enough. I'll ask a few quick questions about fit, print, colors, and style so it comes out perfect!"
        case "characters":
            return "Tell me about your character — look, style, body type, outfit, and how it should feel as a game-ready model."
        case "npcs":
            return "Describe the NPC you need — patrol guard, attacker, merchant, dialogue character, companion, or quest giver. I'll build it as a separate behavior-ready NPC asset."
        case "roast_npc":
            return "Roast NPC time! Pick a vibe — Sigma Chad, Skibidi, Gen-Alpha, Gym Bro, or Mom Friend — or describe your own personality. The NPC reacts on its own to player events (took damage, died, fell, equipped a weapon, idle, got rich) AND players can walk up to the NPC and press T to chat — they'll banter back in character via TextGenerator AI. Bubbles show only to the player being roasted."
        case "accessories":
            return "Describe the accessory — hat, wings, glasses, backpack, or other extras. I'll help you refine the details."
        case "bodies":
            return "Describe the avatar body or head — proportions, style, and what should feel unique."
        case "weapons":
            return "Describe the weapon — type, theme, effects, and how it should feel in combat."
        case "anime_skills":
            return "Anime skill coder online. Tell me the move — Dash strike, AOE burst, Projectile, Beam, Buff/Aura, Domain Expansion, or a multiphase Ultimate. I'll wire up the Lua: SkillConfig + SkillRemotes + SkillVFX + SkillServer + SkillClient. Server-authoritative damage, client camera shake, RemoteEvent gating, Debris cleanup — drag the .rbxmx into Workspace, press Play, and the skill runs."
        case "vehicles":
            return "Describe the vehicle — type, style, and the vibe you want (racing, sci-fi, casual, etc.)."
        case "buildings":
            return "Describe the building or structure — scale, architectural style, and how players will use it."
        case "furniture":
            return "Describe the furniture or prop — type, style, era, material, and where it fits in your world. After you tap Generate I'll ask which build path to use: Blocky Parts or AI 3D Mesh."
        case "maps":
            return "Describe the map or environment — biome, mood, scale, and key landmarks or gameplay flow."
        case "items":
            return "Describe the item or tool — purpose, how players use it, and the feel (common, rare, mythic)."
        case "pets":
            return "Describe the pet — species, style, personality, and any animation or progression ideas."
        case "scripts":
            return "Describe the system you need — shop, inventory, quests, data, economy, etc. We'll narrow scope and structure."
        case "ui":
            return "Let's design your game UI! What do you need — a HUD with health & coins, a shop window, inventory system, NPC dialogue, leaderboard, or a main menu? A vague idea is enough to start!"
        case "passes":
            return "Describe the game pass or developer product — what players unlock and how you want it positioned."
        case "animations":
            return "Describe the animation pack — emotes, locomotion, combat, or object motion you need."
        case "particles":
            return "Describe the VFX — explosions, magic, auras, trails, or ambient effects."
        case "decals":
            return "Describe the decal or texture — subject, surface, and art style."
        case "plugins":
            return "Describe the Studio plugin or tool — workflow you want to speed up and main features."
        default:
            return "Hey! Tell me what you want to create — a character, weapon, accessory, anything. I'll ask a few questions to make sure it turns out exactly how you imagine it."
        }
    }

    private func quickGenerateContentReplies() -> [String] {
        switch contentSubcategory {
        case "clothing":
            return ["Example: Red oversized t-shirt with graphic print", "Example: Black cropped hoodie streetwear", "Example: Neon slim pants with gradient", "Switch to Interview"]
        case "characters":
            return ["Example: Stylized hero", "Example: Fantasy villager", "Example: Cyber avatar", "Switch to Interview"]
        case "npcs":
            return ["Example: Patrol guard with spear", "Example: Enemy attacker", "Example: Merchant trader", "Example: Quest giver", "Switch to Interview"]
        case "roast_npc":
            return ["Example: Sigma chad pet that mocks deaths", "Example: Skibidi toilet boss", "Example: Gym bro coach NPC", "Example: Mom-friend observer that shades you", "Switch to Interview"]
        case "accessories":
            return ["Example: Crystal crown gold", "Example: Angel wings white", "Example: Cyber glasses", "Switch to Interview"]
        case "bodies":
            return ["Example: Stylized R15 proportions", "Example: Toon head custom", "Example: Tall slender avatar", "Switch to Interview"]
        case "weapons":
            return ["Example: Neon sword sci-fi", "Example: Medieval battle axe", "Example: Magic staff glow", "Switch to Interview"]
        case "anime_skills":
            return ["Example: Crimson dash slash 30 dmg AOE", "Example: Void domain 12s slow + DOT", "Example: Lightning beam pierce", "Example: Phoenix ultimate 3-phase", "Switch to Interview"]
        case "vehicles":
            return ["Example: Low sports car", "Example: Sci-fi hover bike", "Example: Off-road jeep", "Switch to Interview"]
        case "buildings":
            return ["Example: Modular suburban house", "Example: Castle gate tower", "Example: Neon city shop", "Switch to Interview"]
        case "furniture":
            return ["Example: Velvet tavern armchair", "Example: Neon cyberpunk floor lamp", "Example: Rustic oak farmhouse table", "Switch to Interview"]
        case "maps":
            return ["Example: Forest river valley", "Example: Cyberpunk city block", "Example: Desert ruins arena", "Switch to Interview"]
        case "items":
            return ["Example: Legendary pickup glow", "Example: Mining pickaxe tool", "Example: Healing potion consumable", "Switch to Interview"]
        case "pets":
            // Track 3 — quick-generate path. Default = blocky pets (Phase 2,
            // 30-60s, free); 3D premium row is opt-in.
            return [
                "🎲 Dog", "🎲 Cat", "🎲 Dragon", "🎲 Unicorn", "🎲 Robot",
                "Example: Fluffy fox companion", "Example: Robot drone pet", "Example: Tiny dragon hatchling",
                "🐾 3D Dog (premium)", "🐾 3D Dragon (premium)",
                "Switch to Interview",
            ]
        case "scripts":
            return ["Pet System", "Shop / Economy", "DataStore / Saving", "Leaderboard", "Inventory", "Combat System", "Daily Rewards", "Rebirth / Prestige", "Quest System", "Dialogue System", "Day / Night Cycle", "Teleportation", "Custom Script…", "Switch to Interview"]
        case "ui":
            return ["Example: Health bar HUD", "Example: Shop menu frame", "Example: Leaderboard panel", "Switch to Interview"]
        case "passes":
            return ["Example: 2x coins game pass", "Example: VIP area unlock", "Example: Exclusive pet bundle", "Switch to Interview"]
        case "animations":
            return ["Example: Victory dance emote", "Example: Sword slash combo", "Example: Idle breathing loop", "Switch to Interview"]
        case "particles":
            return ["Example: Magic burst VFX", "Example: Footstep dust trail", "Example: Level-up sparkle burst", "Switch to Interview"]
        case "decals":
            return ["Example: Graffiti wall decal", "Example: Floor hazard marking", "Example: Team logo sticker", "Switch to Interview"]
        case "plugins":
            return ["Example: Part align helper", "Example: Bulk rename tool", "Example: Mesh import checker", "Switch to Interview"]
        default:
            return ["Example: Neon sword sci-fi", "Example: Green muscular hero", "Example: Angel wings white", "Switch to Interview"]
        }
    }

    private func contentSubcategoryStarterReplies(_ sub: String) -> [String]? {
        switch sub {
        case "characters":
            return ["Stylized hero", "Fantasy character", "Sci-fi avatar", "Cartoon villager", "Decide for me", "Start over"]
        case "npcs":
            return ["Patrol Guard", "Enemy Attacker", "Merchant", "Quest Giver", "Dialogue NPC", "Companion", "Boss", "Decide for me", "Start over"]
        case "roast_npc":
            return ["Sigma Chad", "Skibidi", "Gen-Alpha", "Gym Bro", "Mom Friend", "Custom personality...", "Roast pet", "Roast enemy", "Roast observer", "Try chatting: walk up + press T", "Decide for me", "Start over"]
        case "clothing":
            // Session 001 (Track 1) — classic-2D-first picker: T-Shirt (ShirtGraphic
            // 512x512 front-only), Classic Shirt/Pants (585x559 wrap), Full Outfit
            // (Shirt+Pants combo). Layered 3D (Hoodie/Jacket/Dress) is Track 2.
            return ["T-Shirt", "Classic Shirt", "Classic Pants", "Full Outfit", "Decide for me", "Start over"]
        case "accessories":
            return ["Hat / crown", "Wings / backpack", "Glasses / mask", "Decide for me", "Start over"]
        case "bodies":
            return ["R15 body tweak", "Custom head", "Toon proportions", "Decide for me", "Start over"]
        case "weapons":
            return ["Melee sword", "Gun / sci-fi", "Staff / magic", "Shield / defense", "Grenade / throwable", "Decide for me", "Start over"]
        case "anime_skills":
            return ["Dash strike", "AOE burst", "Projectile", "Beam", "Buff / aura", "Domain Expansion", "Ultimate (multiphase)", "Decide for me", "Start over"]
        case "vehicles":
            return ["Car", "Motorcycle", "Boat", "Plane", "Helicopter", "Tank", "Spaceship", "Bicycle", "Bus", "Decide for me", "Start over"]
        case "buildings":
            return ["House modular", "Tower / castle", "Shop front", "Decide for me", "Start over"]
        case "furniture":
            return ["Chair", "Table", "Lamp", "Shelf", "Rug", "Plant", "Sign", "Decor", "Decide for me", "Start over"]
        case "maps":
            return ["Forest biome", "City block", "Arena layout", "Decide for me", "Start over"]
	        case "items":
	            return ["Key / unlock", "Potion / buff", "Coin / currency", "Medkit / heal", "Resource / material", "Other tool", "Decide for me", "Start over"]
        case "pets":
            // Track 3 — pet species picker. Default = blocky (Phase 2, fast +
            // free + native Roblox style). 3D premium row is opt-in and
            // requires TRIPO_API_KEY for quadrupeds.
            return [
                "🎲 Dog", "🎲 Cat", "🎲 Dragon", "🎲 Unicorn", "🎲 Robot", "🎲 Custom",
                "🐾 3D Dog (premium)", "🐾 3D Cat (premium)", "🐾 3D Dragon (premium)",
                "Decide for me", "Start over",
            ]
        case "scripts":
            return ["Pet System", "Daily Rewards", "Day/Night Cycle", "Teleportation", "Rebirth", "Quest System", "DataStore", "Combat System", "Decide for me", "Start over"]
        case "ui":
            return ["HUD / Stats bar", "Shop window", "Inventory grid", "Dialogue system", "Leaderboard", "Main menu", "Decide for me", "Start over"]
        case "passes":
            return ["Game pass", "Dev product", "Bundle", "Decide for me", "Start over"]
        case "animations":
            return ["Locomotion", "Emote pack", "Combat moves", "Decide for me", "Start over"]
        case "particles":
            return ["Explosion", "Magic aura", "Ambient mist", "Decide for me", "Start over"]
        case "decals":
            return ["Wall art", "Ground marking", "Logo / sign", "Decide for me", "Start over"]
        case "plugins":
            return ["Build helper", "Workflow tool", "Decide for me", "Start over"]
        default:
            return nil
        }
    }

    /// 2026 TikTok brainrot trend chips for `brainrot_sim` Steal-a-Brainrot generator.
    /// Voice prompt is encouraged via the 🎤 hint — transcript flows through the existing
    /// VoiceRecorder → Deepgram → ChatStore.handleVoiceTranscriptChange pipeline.
    private func brainrotSimStarterReplies() -> [String] {
        return [
            "Italian raid mode",
            "Skibidi base war",
            "Tralalero beach heist",
            "Sigma whale CPS",
            "7-tier rare hunt",
            "Safe grind no stealing",
            "Custom voice idea",
            "Decide for me",
            "Start over"
        ]
    }

    /// Session #175: starter chips for `obby_troll` Trap Maker. Maps to the 6 trap
    /// types in `buildTrollObbyScript` (invisible_kill, fake_checkpoint, disappear,
    /// launcher, decoy, reverse) plus mixed / auto-pick controls.
    private func obbyTrollStarterReplies() -> [String] {
        return [
            "🪤 Невидимые шипы",
            "⚠️ Фейковые чекпоинты",
            "👻 Исчезающий пол",
            "🚀 Лаунчер-предатель",
            "🎭 Платформы-ловушки",
            "⏪ Reverse-троллинг",
            "Все 6 вперемешку",
            "Реши за меня",
            "Начать заново"
        ]
    }

    private func obbyGameStarterReplies() -> [String] {
        return [
            "Classic obby",
            "Horror obby",
            "RPG quest obby",
            "PvP race arena",
            "Troll obby",
            "Lava obby",
            "Neon obby",
            "Decide for me",
            "Start over"
        ]
    }

    private func tycoonGameStarterReplies() -> [String] {
        return [
            "Factory tycoon",
            "RPG kingdom tycoon",
            "Horror lab tycoon",
            "PvP base tycoon",
            "Military tycoon",
            "Candy tycoon",
            "Rebirth heavy",
            "Decide for me",
            "Start over"
        ]
    }

    private func simulatorStarterReplies() -> [String] {
        return [
            "Pet simulator",
            "Mining simulator",
            "Fighting simulator",
            "Muscle simulator",
            "Clicker simulator",
            "RPG training sim",
            "PvP fighting sim",
            "Balanced rebirth",
            "Fast rebirth",
            "Decide for me",
            "Start over"
        ]
    }

    private func rpgStarterReplies() -> [String] {
        return [
            "Warrior forest quests",
            "Mage dungeon crawl",
            "Archer boss hunt",
            "Slime camps",
            "Undead enemies",
            "3 quests",
            "5 quests",
            "Decide for me",
            "Start over"
        ]
    }

    private func horrorStarterReplies() -> [String] {
        return [
            "Abandoned school",
            "Hospital escape",
            "Factory key hunt",
            "Soft scares",
            "Medium chase",
            "Intense chase",
            "5 keys",
            "Decide for me",
            "Start over"
        ]
    }

    private func pvpArenaStarterReplies() -> [String] {
        return [
            "Neon FFA",
            "Sword + bow",
            "Sword + blaster",
            "Magic loadout",
            "180 sec rounds",
            "300 sec rounds",
            "12 spawns",
            "Decide for me",
            "Start over"
        ]
    }

    private var preferredProvider: String {
        if contentSubcategory == "audio" {
            return selectedAudioProvider.rawValue
        }
        switch projectKind {
        case .content, .ugc, .fix, .analyze, .game, .clone:
            return selectedLLMProvider.rawValue
        }
    }

    private var preferredChatProvider: String {
        selectedLLMProvider.rawValue
    }

    private var generationKind: String {
        if contentSubcategory == "audio" { return "audio" }
        if contentSubcategory == "animations" { return "animation" }
        if contentSubcategory == "scripts" { return "code" }
        if contentSubcategory == "anime_skills" { return "code" }
        if contentSubcategory == "passes" { return "code" }
        if contentSubcategory == "ui" { return "code" }
        if contentSubcategory == "decals" { return "decal_texture" }
        if contentSubcategory == "weapons" { return "character_3d" }
        if contentSubcategory == "vehicles" { return "vehicle_3d" }
        if contentSubcategory == "items" { return "character_3d" }
        if contentSubcategory == "npcs" { return "character_3d" }
        if contentSubcategory == "buildings" { return "character_3d" }
        if contentSubcategory == "furniture" { return "character_3d" }
        if contentSubcategory == "maps" { return "rbxl_build" }
        // Track 3 — pets route to dedicated pet_3d kind. Backend
        // processGenerationJob dispatches to processBlockyPetJob (when
        // metadata.petMode==='blocky') or processPet3DJob (evolution_3d).
        if contentSubcategory == "pets" { return "pet_3d" }
        switch projectKind {
        case .content, .ugc:
            if looksLikeTextureClothing {
                if draft.isLayered3D {
                    return "clothing_3d"
                }
                return "character_3d"
            }
            return "character_3d"
        case .fix, .analyze:
            return "code"
        case .game, .clone:
            return "game_package"
        }
    }

    private func projectMemorySummary(maxLength: Int = 900) -> String? {
        guard let memory = threadProjectMemory else { return nil }
        let rows = memory.latestGddRows?
            .prefix(10)
            .map { "\($0.key): \($0.value)" }
            .joined(separator: "; ")
        let summary = [
            memory.title.map { "Title: \($0)" },
            memory.contentSubcategory.map { "Subcategory: \($0)" },
            memory.genre.map { "Genre: \($0)" },
            memory.theme.map { "Theme: \($0)" },
            memory.currentBrief.map { "Brief: \($0)" },
            rows.map { "GDD: \($0)" },
            memory.latestJobId.map { "Latest job: \($0)" }
        ].compactMap { $0 }.joined(separator: "\n")
        let trimmed = summary.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        return sanitizeForPrompt(trimmed, maxLength: maxLength)
    }

    private func chatMetadata(inputMode: String, attachmentKind: String?) -> [String: String] {
        var metadata = draft.metadataDictionary
        let responseLanguage = preferredResponseLanguageCode()
        metadata["projectKind"] = promptProjectKind
        metadata["workspaceFlow"] = preferredFlow.rawValue
        metadata["expertiseLevel"] = storedExpertiseLevel
        metadata["inputMode"] = inputMode
        metadata["intent"] = chatIntent
        metadata["language"] = responseLanguage
        metadata["responseLanguage"] = responseLanguage
        if let attachmentKind {
            metadata["attachmentKind"] = attachmentKind
        }
        if let category = contentCategory {
            metadata["contentCategory"] = category
        }
        if let sub = contentSubcategory {
            metadata["contentSubcategory"] = sub
            if sub == "vehicles" {
                metadata["requestedKind"] = "vehicle_3d"
                if metadata["contentCategory"] == nil { metadata["contentCategory"] = "vehicle" }
            }
            if sub == "roast_npc" {
                metadata["npcMode"] = "roast"
            }
            if sub == "furniture" {
                let inferredMode = inferredFurnitureBuildMode()
                if inferredMode != "auto" || metadata["furnitureBuildMode"] == nil {
                    metadata["furnitureBuildMode"] = inferredMode
                }
            }
        }
        // Session 001 (Track 1) — surface clothing picks in chat metadata so the
        // backend clothing_interview LLM (promptCatalog.smartInterviewClothing)
        // can skip the redundant 2D/3D Turn 1 when iOS welcome already locked it in.
        if let ct = draft.clothingType {
            metadata["clothingType"] = ct
        }
        if let cm = draft.clothingMode {
            metadata["clothingMode"] = cm
        }
        // Track 3 (3D Pet pipeline) — surface pet picks. petMode="evolution_3d"
        // routes backend to requestedKind=pet_3d → buildPetEvolutionManifest.
        if let ps = draft.petSpecies {
            metadata["petSpecies"] = ps
        }
        if let pm = draft.petMode {
            metadata["petMode"] = pm
            // Track 3 — both blocky (Phase 2) and evolution_3d (Phase 1) route
            // through the pet_3d job kind; backend processGenerationJob dispatches
            // to processBlockyPetJob vs processPet3DJob based on metadata.petMode.
            if pm == "blocky" || pm == "evolution_3d" {
                metadata["requestedKind"] = "pet_3d"
                if metadata["contentCategory"] == nil { metadata["contentCategory"] = "pet" }
            }
        }
        if let memory = threadProjectMemory {
            metadata["hasExistingProject"] = "true"
            if let latestJobId = memory.latestJobId {
                metadata["latestJobId"] = latestJobId
            }
            if let artifactIds = memory.latestArtifactIds, !artifactIds.isEmpty {
                metadata["latestArtifactIds"] = artifactIds.joined(separator: ",")
            }
            if let summary = projectMemorySummary() {
                metadata["projectMemorySummary"] = summary
            }
        } else if let lastJobId {
            metadata["latestJobId"] = lastJobId
        }
        if let templatePrompt = templateStarterPrompt {
            metadata["templateStarterPrompt"] = templatePrompt
        }
        if let uid = RobloxAuthService.shared.universeId, !uid.isEmpty {
            metadata["universeId"] = uid
        }
        return metadata
    }

    private func buildRichGenerationPrompt() -> String {
        let basePrompt: String
        if let templatePrompt = templateStarterPrompt {
            basePrompt = templatePrompt
        } else {
            basePrompt = draft.exportPrompt(for: projectKind, contentSubcategory: contentSubcategory)
        }

        // Keep generation context compact and user-centric to avoid stale traits and provider prompt limits.
        let recentUserWants = messages
            .filter { $0.role == .user }
            .suffix(6)
            .map(\.content)
            .map { sanitizeForPrompt($0, maxLength: 240) }
            .joined(separator: "\n- ")

        let compactContext = recentUserWants.isEmpty ? "" : "- \(recentUserWants)"
        let referenceHint = latestReferenceImageURL == nil
            ? ""
            : """

        Attached reference image:
        Use the uploaded visual reference as an authoritative style/layout/silhouette source. The backend will inject vision analysis during generation.
        """
        let prompt = """
        \(basePrompt)

        Latest user intent (highest priority):
        \(compactContext)
        \(referenceHint)
        """
        let finalPrompt = sanitizeForPrompt(prompt, maxLength: 2600)

        return finalPrompt
    }

    private func generationMetadata() -> [String: String] {
        var metadata = draft.metadataDictionary
        let responseLanguage = preferredResponseLanguageCode()
        metadata["projectKind"] = promptProjectKind
        metadata["workspaceFlow"] = preferredFlow.rawValue
        metadata["expertiseLevel"] = storedExpertiseLevel
        metadata["inputMode"] = latestReferenceImageURL == nil ? "text" : "image"
        metadata["intent"] = generationIntent
        metadata["language"] = responseLanguage
        metadata["responseLanguage"] = responseLanguage
        metadata["nativeBinaryPreferred"] = "true"
        metadata["workerMode"] = "worker_service"
        metadata["meshProvider"] = selected3DProvider.rawValue
        if let latestUserMessage = messages.last(where: { $0.role == .user })?.content {
            metadata["latestUserIntent"] = sanitizeForPrompt(latestUserMessage, maxLength: 700)
        }
        if let referenceURL = latestReferenceImageURL {
            metadata["attachmentKind"] = "image"
            metadata["attachmentImageUrl"] = referenceURL.absoluteString
        }
        if let referenceAssetId = latestReferenceImageAssetId {
            metadata["attachmentAssetId"] = referenceAssetId
        }
        if let category = contentCategory {
            metadata["contentCategory"] = category
        }
        if let sub = contentSubcategory {
            metadata["contentSubcategory"] = sub
            if sub == "vehicles" {
                metadata["requestedKind"] = "vehicle_3d"
                if metadata["contentCategory"] == nil { metadata["contentCategory"] = "vehicle" }
            }
            if sub == "roast_npc" {
                metadata["npcMode"] = "roast"
            }
            if sub == "furniture" {
                let inferredMode = inferredFurnitureBuildMode()
                if inferredMode != "auto" || metadata["furnitureBuildMode"] == nil {
                    metadata["furnitureBuildMode"] = inferredMode
                }
            }
        }
        // Session 001 (Track 1) — surface clothing picks in chat metadata so the
        // backend clothing_interview LLM (promptCatalog.smartInterviewClothing)
        // can skip the redundant 2D/3D Turn 1 when iOS welcome already locked it in.
        if let ct = draft.clothingType {
            metadata["clothingType"] = ct
        }
        if let cm = draft.clothingMode {
            metadata["clothingMode"] = cm
        }
        // Track 3 (3D Pet pipeline) — surface pet picks. petMode="evolution_3d"
        // routes backend to requestedKind=pet_3d → buildPetEvolutionManifest.
        if let ps = draft.petSpecies {
            metadata["petSpecies"] = ps
        }
        if let pm = draft.petMode {
            metadata["petMode"] = pm
            // Track 3 — both blocky (Phase 2) and evolution_3d (Phase 1) route
            // through the pet_3d job kind; backend processGenerationJob dispatches
            // to processBlockyPetJob vs processPet3DJob based on metadata.petMode.
            if pm == "blocky" || pm == "evolution_3d" {
                metadata["requestedKind"] = "pet_3d"
                if metadata["contentCategory"] == nil { metadata["contentCategory"] = "pet" }
            }
        }
        if let memory = threadProjectMemory {
            metadata["hasExistingProject"] = "true"
            if let latestJobId = memory.latestJobId {
                metadata["latestJobId"] = latestJobId
            }
            if let artifactIds = memory.latestArtifactIds, !artifactIds.isEmpty {
                metadata["latestArtifactIds"] = artifactIds.joined(separator: ",")
            }
            if let summary = projectMemorySummary() {
                metadata["projectMemorySummary"] = summary
            }
        } else if let lastJobId {
            metadata["latestJobId"] = lastJobId
        }
        if contentSubcategory == "audio" {
            metadata["audioType"] = selectedAudioProvider.audioType
        }
        if let clothingMode = draft.clothingMode {
            metadata["clothingMode"] = clothingMode
        }
        if let clothingType = draft.clothingType {
            metadata["clothingType"] = clothingType
        }
        if let uid = RobloxAuthService.shared.universeId, !uid.isEmpty {
            metadata["universeId"] = uid
        }
        return metadata
    }

    private func inferredFurnitureBuildMode() -> String {
        // Explicit user choice from the post-Generate path-selector wins over keyword inference.
        if let explicit = draft.furnitureBuildMode, !explicit.isEmpty {
            return explicit
        }
        let recent = messages
            .filter { $0.role == .user }
            .suffix(6)
            .map { $0.content.lowercased() }
            .joined(separator: " ")
        let partsKeywords = [
            "fast parts", "studio parts", "parts only", "part only", "blocks", "blocky", "cubes", "no mesh", "without mesh",
            "кубик", "кубиками", "блоками", "частями", "деталями", "без mesh", "без меш", "без мэш", "без 3d", "без 3д"
        ]
        if partsKeywords.contains(where: { recent.contains($0) }) {
            return "parts"
        }
        let meshKeywords = [
            "ai mesh", "3d mesh", "mesh", "pbr", "realistic", "high detail", "ornate",
            "меш", "мэш", "реалист", "детальн", "бархат", "диван", "кресл", "трон"
        ]
        if meshKeywords.contains(where: { recent.contains($0) }) {
            return "mesh"
        }
        return "auto"
    }

    private var promptProjectKind: String {
        switch projectKind {
        case .game: return "game"
        case .content: return "content"
        case .fix: return "fix"
        case .clone: return "clone"
        case .ugc: return "ugc"
        case .analyze: return "analyze"
        }
    }

    private var chatIntent: String {
        if contentSubcategory == "audio" {
            return preferredFlow == .quickGenerate ? "audio_generation" : "audio_interview"
        }
        if contentSubcategory == "animations" {
            return preferredFlow == .quickGenerate ? "animation_generation" : "animation_interview"
        }
        if contentSubcategory == "ui" {
            return preferredFlow == .quickGenerate ? "ui_generation" : "ui_interview"
        }
        if contentSubcategory == "decals" {
            return preferredFlow == .quickGenerate ? "decal_texture_generation" : "decal_texture_generation"
        }
        if contentSubcategory == "clothing" {
            return preferredFlow == .quickGenerate ? "content_generation" : "clothing_interview"
        }
        if contentSubcategory == "scripts" {
            return preferredFlow == .quickGenerate ? "script_generation" : "script_interview"
        }
        if contentSubcategory == "anime_skills" {
            return preferredFlow == .quickGenerate ? "anime_skill_generation" : "anime_skill_interview"
        }
        if contentSubcategory == "brainrot_sim" {
            return preferredFlow == .quickGenerate ? "brainrot_sim_generation" : "brainrot_sim_interview"
        }
        if contentSubcategory == "obby_troll" {
            return preferredFlow == .quickGenerate ? "obby_troll_generation" : "obby_troll_interview"
        }
        if contentSubcategory == "rpg" {
            return preferredFlow == .quickGenerate ? "rpg_generation" : "rpg_interview"
        }
        if contentSubcategory == "horror" {
            return preferredFlow == .quickGenerate ? "horror_generation" : "horror_interview"
        }
        if contentSubcategory == "pvp" {
            return preferredFlow == .quickGenerate ? "pvp_arena_generation" : "pvp_arena_interview"
        }
        if contentSubcategory == "simulator" {
            return preferredFlow == .quickGenerate ? "simulator_generation" : "simulator_interview"
        }
        if contentSubcategory == "weapons" {
            return preferredFlow == .quickGenerate ? "weapon_generation" : "weapon_interview"
        }
        if contentSubcategory == "vehicles" {
            return preferredFlow == .quickGenerate ? "vehicle_generation" : "vehicle_interview"
        }
        if contentSubcategory == "items" {
            return preferredFlow == .quickGenerate ? "item_generation" : "item_interview"
        }
        if contentSubcategory == "buildings" {
            return preferredFlow == .quickGenerate ? "building_generation" : "building_interview"
        }
        if contentSubcategory == "furniture" {
            return preferredFlow == .quickGenerate ? "furniture_generation" : "furniture_interview"
        }
        if contentSubcategory == "maps" {
            return preferredFlow == .quickGenerate ? "map_generation" : "map_interview"
        }
        if contentSubcategory == "npcs" {
            return preferredFlow == .quickGenerate ? "npc_generation" : "npc_interview"
        }
        if contentSubcategory == "characters" {
            return preferredFlow == .quickGenerate ? "character_generation" : "character_interview"
        }
        if contentSubcategory == "passes" {
            return preferredFlow == .quickGenerate ? "monetization_generation" : "monetization_interview"
        }
        switch projectKind {
        case .game:
            return preferredFlow == .quickGenerate ? "game_generation" : "game_interview"
        case .content:
            return preferredFlow == .quickGenerate ? "content_generation" : "content_interview"
        case .fix:
            return "script_doctor"
        case .clone:
            return "remix"
        case .ugc:
            return "ugc_designer"
        case .analyze:
            return "game_analyst"
        }
    }

    private var generationIntent: String {
        if contentSubcategory == "audio" { return "audio_generation" }
        if contentSubcategory == "animations" { return "animation_generation" }
        if contentSubcategory == "decals" { return "decal_texture_generation" }
        if contentSubcategory == "scripts" { return "script_generation" }
        if contentSubcategory == "anime_skills" { return "anime_skill_generation" }
        if contentSubcategory == "brainrot_sim" { return "brainrot_sim_generation" }
        if contentSubcategory == "obby_troll" { return "obby_troll_generation" }
        if contentSubcategory == "rpg" { return "rpg_generation" }
        if contentSubcategory == "horror" { return "horror_generation" }
        if contentSubcategory == "pvp" { return "pvp_arena_generation" }
        if contentSubcategory == "simulator" { return "simulator_generation" }
        if contentSubcategory == "ui" { return "ui_generation" }
        if contentSubcategory == "weapons" { return "weapon_generation" }
        if contentSubcategory == "vehicles" { return "vehicle_generation" }
        if contentSubcategory == "items" { return "item_generation" }
        if contentSubcategory == "buildings" { return "building_generation" }
        if contentSubcategory == "furniture" { return "furniture_generation" }
        if contentSubcategory == "maps" { return "map_generation" }
        if contentSubcategory == "npcs" { return "npc_generation" }
        if contentSubcategory == "roast_npc" { return "npc_generation" }
        if contentSubcategory == "characters" { return "character_generation" }
        if contentSubcategory == "passes" { return "monetization_generation" }
        switch projectKind {
        case .game:
            return "game_generation"
        case .content:
            return "content_generation"
        case .fix:
            return "script_doctor"
        case .clone:
            return "remix"
        case .ugc:
            return "ugc_designer"
        case .analyze:
            return "game_analyst"
        }
    }

    private var storedExpertiseLevel: String {
        let stored = UserDefaults.standard.string(forKey: "expertiseLevel") ?? ""
        let level = ExpertiseLevel(rawValue: stored) ?? .beginner
        switch level {
        case .beginner: return "beginner"
        case .advanced: return "advanced"
        case .developer: return "developer"
        }
    }

    /// Detects language to use for UI copy (tips, GDD labels) based on the last user message.
    /// Exposed (non-private) so `ChatView` can localize client-side UI — tips plate, GDDCard labels.
    func preferredResponseLanguageCode() -> String {
        for message in messages.reversed().prefix(8) {
            if let detected = Self.detectSupportedResponseLanguage(in: message.content) {
                return detected
            }
        }

        if let appLang = Self.normalizedSupportedResponseLanguage(UserDefaults.standard.string(forKey: "appLanguage")) {
            return appLang
        }
        if let deviceLang = Self.normalizedSupportedResponseLanguage(Locale.preferredLanguages.first) {
            return deviceLang
        }
        return "en"
    }

    /// Locale to pass into `createVoiceSession`. Returns a code only when we have
    /// a high-confidence signal — script-detected language from prior messages
    /// or an explicit appLanguage UserDefault. Otherwise returns nil so the
    /// backend falls through to Deepgram `detect_language: true` rather than
    /// forcing the device locale (which is wrong for users speaking a language
    /// other than their phone's UI language — e.g. EN device speaking Russian).
    func voiceSessionLocale() -> String? {
        for message in messages.reversed().prefix(8) {
            if let detected = Self.detectSupportedResponseLanguage(in: message.content) {
                return detected
            }
        }
        if let appLang = Self.normalizedSupportedResponseLanguage(UserDefaults.standard.string(forKey: "appLanguage")) {
            return appLang
        }
        return nil
    }

    private static func normalizedSupportedResponseLanguage(_ code: String?) -> String? {
        guard let code else { return nil }
        let primary = code
            .lowercased()
            .replacingOccurrences(of: "_", with: "-")
            .split(separator: "-")
            .first
            .map(String.init)
        guard let primary else { return nil }
        let supported: Set<String> = ["ru", "en", "es", "pt", "de", "fr", "zh", "ja", "ko"]
        return supported.contains(primary) ? primary : nil
    }

    private static func detectSupportedResponseLanguage(in text: String) -> String? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }

        if trimmed.range(of: "\\p{Script=Cyrillic}", options: .regularExpression) != nil { return "ru" }
        if trimmed.range(of: "\\p{Script=Hiragana}|\\p{Script=Katakana}", options: .regularExpression) != nil { return "ja" }
        if trimmed.range(of: "\\p{Script=Hangul}", options: .regularExpression) != nil { return "ko" }
        if trimmed.range(of: "\\p{Script=Han}", options: .regularExpression) != nil { return "zh" }

        let lower = " \(trimmed.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: .current).lowercased()) "
        let originalLower = " \(trimmed.lowercased()) "
        var scores: [String: Int] = ["es": 0, "pt": 0, "de": 0, "fr": 0]

        let weightedSignals: [(String, String, Int)] = [
            ("es", "¿", 3), ("es", "¡", 3), ("es", "ñ", 3),
            ("pt", "ã", 3), ("pt", "õ", 3), ("pt", "ção", 3),
            ("de", "ä", 3), ("de", "ö", 3), ("de", "ß", 3),
            ("fr", "œ", 3), ("fr", "ç", 2), ("fr", "à", 2), ("fr", "è", 2)
        ]
        for (code, signal, weight) in weightedSignals where originalLower.contains(signal) {
            scores[code, default: 0] += weight
        }

        let phraseSignals: [(String, String, Int)] = [
            ("es", " quiero un ", 2), ("es", " quiero una ", 2), ("es", " haz un ", 2), ("es", " haz una ", 2), ("es", " crea un ", 2),
            ("pt", " quero um ", 2), ("pt", " quero uma ", 2), ("pt", " faca um ", 2), ("pt", " faca uma ", 2), ("pt", " faz um ", 2),
            ("de", " ich will ", 2), ("de", " ich mochte ", 2), ("de", " mach ein ", 2), ("de", " erstelle ein ", 2),
            ("fr", " je veux ", 2), ("fr", " cree un ", 2), ("fr", " cree une ", 2), ("fr", " creer un ", 2)
        ]
        for (code, signal, weight) in phraseSignals where lower.contains(signal) {
            scores[code, default: 0] += weight
        }

        let keywordSignals: [String: [String]] = [
            "es": [" quiero ", " haz ", " hacer ", " juego ", " tienda ", " monedas ", " personaje ", " crear ", " genera ", " agrega ", " mapa ", " enemigo ", " jefe "],
            "pt": [" quero ", " faca ", " faz ", " jogo ", " loja ", " moedas ", " personagem ", " criar ", " gere ", " adicione ", " mapa ", " inimigo ", " chefe "],
            "de": [" ich will ", " ich mochte ", " erstelle ", " spiel ", " laden ", " munzen ", " charakter ", " fuege ", " fuge ", " waffe ", " gegner ", " karte "],
            "fr": [" je veux ", " cree ", " creer ", " jeu ", " boutique ", " pieces ", " personnage ", " ajoute ", " mission ", " donjon ", " arme ", " ennemi ", " carte "]
        ]
        for (code, signals) in keywordSignals {
            scores[code, default: 0] += signals.filter { lower.contains($0) }.count
        }

        let best = scores.max { lhs, rhs in lhs.value < rhs.value }
        return (best?.value ?? 0) >= 2 ? best?.key : nil
    }

    private func sanitizeForPrompt(_ text: String, maxLength: Int) -> String {
        let collapsed = text
            .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if collapsed.count <= maxLength { return collapsed }
        let end = collapsed.index(collapsed.startIndex, offsetBy: maxLength)
        return String(collapsed[..<end])
    }

    private var contentCategory: String? {
        if contentSubcategory == "audio" { return "audio" }
        if contentSubcategory == "animations" { return "animation" }
        if contentSubcategory == "scripts" { return "script" }
        if contentSubcategory == "anime_skills" { return "script" }
        if contentSubcategory == "passes" { return "gamepass" }
        if contentSubcategory == "weapons" { return "weapon" }
        if contentSubcategory == "vehicles" { return "vehicle" }
        if contentSubcategory == "items" { return "item_tool" }
        if contentSubcategory == "buildings" { return "building" }
        if contentSubcategory == "furniture" { return "furniture_prop" }
        if contentSubcategory == "maps" { return "map_environment" }
        if contentSubcategory == "npcs" { return "npc_ai" }
        if contentSubcategory == "roast_npc" { return "npc_ai" }
        switch projectKind {
        case .game, .clone:
            return "map"
        case .content:
            return "character"
        case .fix, .analyze:
            return "script"
        case .ugc:
            return "ugc_accessory"
        }
    }

    private var bodyTypeForPreview: AvatarBodyType {
        let combined = contextTextForPreview.lowercased()
        let femaleKeywords = ["woman", "girl", "female", "princess", "queen", "fairy", "mermaid", "witch",
                              "принцесс", "королев", "девушк", "девочк", "фея", "русалк", "ведьм"]
        let maleKeywords = ["man", "boy", "male", "hulk", "warrior", "knight", "king", "soldier",
                            "ninja", "samurai", "orc", "robot", "mech", "pirate", "dragon",
                            "халк", "воин", "рыцарь", "король", "солдат", "ниндзя", "ниндз",
                            "самурай", "орк", "робот", "пират", "дракон"]
        if femaleKeywords.contains(where: { combined.contains($0) }) {
            return .woman
        } else if maleKeywords.contains(where: { combined.contains($0) }) {
            return .man
        }
        return .neutrally
    }

    private var accentColorForPreview: Color {
        let combined = contextTextForPreview.lowercased()

        let colorRules: [(keywords: [String], color: Color)] = [
            (["hulk", "orc", "goblin", "zombie", "swamp", "toxic", "slime", "poison",
              "халк", "орк", "гоблин", "зомби", "болото", "токсич", "слизь", "яд"],
             Color(red: 0.35, green: 0.75, blue: 0.25)),
            (["fire", "lava", "inferno", "magma", "demon", "flame", "hell", "dragon",
              "огонь", "лава", "демон", "пламя", "дракон", "ад"],
             Color(red: 0.95, green: 0.35, blue: 0.2)),
            (["ice", "frost", "frozen", "snow", "arctic", "winter", "crystal",
              "лёд", "лед", "мороз", "снег", "зима", "кристалл"],
             Color(red: 0.45, green: 0.75, blue: 0.95)),
            (["neon", "cyber", "synthwave", "futuristic", "tron", "electric",
              "неон", "кибер", "будущ", "электр"],
             Color(red: 0.2, green: 0.85, blue: 0.95)),
            (["dark", "horror", "shadow", "vampire", "night", "goth", "reaper",
              "тьма", "тёмн", "темн", "хоррор", "вампир", "ночь", "жнец"],
             Color(red: 0.45, green: 0.25, blue: 0.65)),
            (["nature", "forest", "eco", "plant", "tree", "jungle", "grass",
              "природ", "лес", "джунгл", "трав", "дерев"],
             Color(red: 0.3, green: 0.78, blue: 0.45)),
            (["gold", "royal", "king", "queen", "pirate", "treasure", "egyptian",
              "золот", "корол", "пират", "сокровищ", "египет"],
             Color(red: 0.92, green: 0.75, blue: 0.2)),
            (["ocean", "water", "sea", "aqua", "underwater", "fish", "mermaid",
              "океан", "вод", "море", "подвод", "рыб", "русалк"],
             Color(red: 0.15, green: 0.55, blue: 0.85)),
            (["pink", "cute", "kawaii", "princess", "fairy", "candy", "unicorn",
              "розов", "милый", "принцесс", "фея", "конфет", "единорог"],
             Color(red: 0.95, green: 0.5, blue: 0.7)),
            (["robot", "mech", "steel", "iron", "metal", "machine", "android",
              "робот", "мех", "сталь", "железн", "метал", "машин", "андроид"],
             Color(red: 0.6, green: 0.65, blue: 0.7)),
            (["ninja", "samurai", "assassin", "stealth", "spy",
              "ниндзя", "ниндз", "самурай", "ассасин", "шпион"],
             Color(red: 0.22, green: 0.22, blue: 0.28)),
            (["sun", "desert", "sand", "bright", "yellow", "bee",
              "солнц", "пустын", "песок", "ярк", "жёлт", "желт", "пчел"],
             Color(red: 0.95, green: 0.85, blue: 0.3)),
        ]

        for rule in colorRules {
            if rule.keywords.contains(where: { combined.contains($0) }) {
                return rule.color
            }
        }
        return Color(red: 0.4, green: 0.65, blue: 0.95)
    }

    private var contextTextForPreview: String {
        let draftText = "\(draft.title) \(draft.genre) \(draft.style)"
        let userMessages = messages
            .filter { $0.role == .user }
            .map(\.content)
            .joined(separator: " ")
        return "\(draftText) \(userMessages)"
    }

    private var archetypeForPreview: CharacterArchetype {
        CharacterArchetype.detect(from: contextTextForPreview)
    }

    private func defaultThreads() -> [ChatThread] {
        [
            ChatThread(
                id: UUID().uuidString,
                title: "\(projectKind.rawValue) Workspace",
                updatedAt: Date(),
                promptHint: "",
                type: ThreadType.from(projectKind),
                projectKindRaw: promptProjectKind,
                contentSubcategory: contentSubcategory
            )
        ]
    }
}

private struct ProjectDraft {
    var title: String
    var genre: String
    var scale: String
    var style: String
    var monetization: String
    var clothingMode: String?
    // Session 001 (Track 1): user-picked classic clothing type for UGC clothing flow.
    // Values: "t_shirt" | "classic_shirt" | "classic_pants" | "classic_outfit".
    // Used to route the backend pipeline explicitly instead of regex-guessing
    // the type from the prompt. Layered 3D variants (Jacket/Sweater/Dress/etc.)
    // stay on `clothingMode = layered_3d` until Track 2.
    var clothingType: String?
    // Track 3 (3D Pet pipeline): user-picked pet species + generation mode.
    // petSpecies: "dog" | "cat" | "dragon" | "unicorn" | "robot" | "fantasy"
    // petMode:    "evolution_3d" — triggers requestedKind=pet_3d pipeline.
    var petSpecies: String?
    var petMode: String?
    // Vehicles pipeline: user-picked chassis archetype from quick replies or
    // inferred by backend from the interview/GDD.
    var vehicleType: String?
    // Session #095: user-picked weapon colors (hex #RRGGBB). Set by WeaponColorPickerBubble.
    var weaponPrimaryColor: String?
    var weaponAccentColor: String?
    var weaponGlowColor: String?
    // Session #095 follow-up: weapon class picked by user via quickReply ("melee" | "ranged" | "magic").
	    // Drives Tool.TextureId (icon), Activation SoundId and animation set on backend.
	    var weaponType: String?
	    var itemType: String?
	    var itemUseMode: String?
	    var itemEffect: String?
	    var itemEffectValue: String?
	    var itemEffectDuration: String?
	    var itemTagName: String?
	    var itemCurrencyName: String?
	    var itemResourceName: String?
	    var itemCooldown: String?
	    var npcRole: String?
    var npcBehaviorMode: String?
    var npcTheme: String?
    var npcVisualHooks: [String]?
    var npcMechanics: [String]?
    var npcSystems: [String]?
    var npcVisualPipeline: String?
    var npcMeshMotionMode: String?
    /// Furniture build mode chosen by the user via the post-Generate path-selector bubble
    /// (`parts` = blocky Roblox Parts model with LLM verify+retry; `mesh` = 2D concept
    /// approval → AI mesh provider). nil means the user hasn't picked yet and the
    /// path-selector still needs to be shown.
    var furnitureBuildMode: String?
    // Killer Feature #2: Smart NPC Roast & Chat — preset key (sigma_chad / skibidi /
    // gen_alpha / gym_bro / mom_friend / custom). When set, ChatStore sends `npcMode=roast`
    // alongside, and backend emits a Config.Roast block in NpcConfig.lua wired to the
    // matching SystemPrompt + fallback lines.
    var roastPersonality: String?
    let kind: ProjectKind

    var isLayered3D: Bool { clothingMode == "layered_3d" }

    static func makeDefault(for kind: ProjectKind) -> ProjectDraft {
        ProjectDraft(
            title: "\(kind.rawValue) Project",
            genre: kind.rawValue,
            scale: "Mid-scale",
            style: "Bright trending style",
            monetization: "VIP + boosts + daily rewards",
            clothingMode: nil,
            clothingType: nil,
            petSpecies: nil,
            petMode: nil,
            vehicleType: nil,
	            weaponPrimaryColor: nil,
	            weaponAccentColor: nil,
	            weaponGlowColor: nil,
	            weaponType: nil,
	            itemType: nil,
	            itemUseMode: nil,
	            itemEffect: nil,
	            itemEffectValue: nil,
	            itemEffectDuration: nil,
	            itemTagName: nil,
	            itemCurrencyName: nil,
	            itemResourceName: nil,
	            itemCooldown: nil,
	            npcRole: nil,
            npcBehaviorMode: nil,
            npcTheme: nil,
            npcVisualHooks: nil,
            npcMechanics: nil,
            npcSystems: nil,
            npcVisualPipeline: nil,
            npcMeshMotionMode: nil,
            furnitureBuildMode: nil,
            roastPersonality: nil,
            kind: kind
        )
    }

    var gddRows: [(String, String)] {
        [
            ("Title", title),
            ("Type", kind.rawValue),
            ("Genre", genre),
            ("Scale", scale),
            ("Style", style),
            ("Monetization", monetization)
        ]
    }

    var metadataDictionary: [String: String] {
        var dict: [String: String] = [
            "title": title,
            "genre": genre,
            "scale": scale,
            "style": style,
            "monetization": monetization
        ]
        if let c = weaponPrimaryColor { dict["primaryColor"] = c }
        if let vehicleType { dict["vehicleType"] = vehicleType }
	        if let c = weaponAccentColor  { dict["accentColor"]  = c }
	        if let c = weaponGlowColor    { dict["glowColor"]    = c }
	        if let t = weaponType         { dict["weaponType"]   = t }
	        if let t = itemType           { dict["itemType"]     = t }
	        if let m = itemUseMode        { dict["useMode"]      = m }
	        if let e = itemEffect         { dict["effect"]       = e }
	        if let v = itemEffectValue    { dict["effectValue"]  = v }
	        if let d = itemEffectDuration { dict["effectDuration"] = d }
	        if let tag = itemTagName      { dict["tagName"]      = tag }
	        if let cur = itemCurrencyName { dict["currencyName"] = cur }
	        if let res = itemResourceName { dict["resourceName"] = res }
	        if let cd = itemCooldown      { dict["cooldown"]     = cd }
	        if let r = npcRole            { dict["npcRole"]      = r }
        if let b = npcBehaviorMode    { dict["behaviorMode"] = b }
        if let pipeline = npcVisualPipeline {
            dict["npcVisualPipeline"] = pipeline
        }
        if let motionMode = npcMeshMotionMode {
            dict["npcMeshMotionMode"] = motionMode
        }
        if let furnitureMode = furnitureBuildMode {
            dict["furnitureBuildMode"] = furnitureMode
        }
        if let theme = npcTheme, !theme.isEmpty {
            dict["npcTheme"] = theme
        }
        if let hooks = npcVisualHooks, !hooks.isEmpty {
            let joined = hooks.joined(separator: "; ")
            dict["npcVisualHooks"] = joined
            dict["visualDescription"] = joined
            dict["appearance"] = joined
        }
        if let mechanics = npcMechanics, !mechanics.isEmpty {
            dict["npcMechanics"] = mechanics.joined(separator: "; ")
        }
        if let systems = npcSystems, !systems.isEmpty {
            dict["npcSystems"] = systems.joined(separator: "; ")
        }
        if let p = roastPersonality   {
            dict["roastPersonality"] = p
            dict["npcMode"]          = "roast"
        }
        return dict
    }

    func exportPrompt(for projectKind: ProjectKind, contentSubcategory: String? = nil) -> String {
        if contentSubcategory == "audio" {
            return "Generate game-ready audio: \(title). Genre: \(genre). Style: \(style). Output as downloadable audio file."
        }
	        if contentSubcategory == "animations" {
	            return "Generate an animation keyframe sequence for \(title). Style: \(style). Output as JSON keyframes for R15 rig, ready for .rbxm export."
	        }
	        if contentSubcategory == "items" {
	            let details = [
	                itemType.map { "Item type: \($0)." },
	                itemUseMode.map { "Use mode: \($0)." },
	                itemEffect.map { "Effect: \($0)." },
	                itemEffectValue.map { "Effect value: \($0)." },
	                itemEffectDuration.map { "Effect duration: \($0) seconds." },
	                itemTagName.map { "Door/tag name: \($0)." },
	                itemCurrencyName.map { "Currency: \($0)." },
	                itemResourceName.map { "Resource: \($0)." },
	                itemCooldown.map { "Cooldown: \($0) seconds." }
	            ].compactMap { $0 }.joined(separator: " ")
	            return "Generate a Studio-ready Items & Tools package for \(title). \(details) It must export as a real Tool with Handle, readable in-hand proportions, Tool.Activated use logic, local use animation/feedback, sound, particles, and server-authoritative effects. Genre: \(genre). Style: \(style)."
	        }
        if contentSubcategory == "vehicles" {
            let typeLine = vehicleType.map { "Vehicle type: \($0)." } ?? "Vehicle type: infer from the request."
            return "Generate a Studio-ready playable Vehicles package for \(title). \(typeLine) It must export as .rbxm with a VehicleSeat/DriveSeat, passenger seats, self-contained control script, stable physics, engine sounds, exhaust/trail/wake VFX, and clear edit-mode Roblox parts. Genre: \(genre). Style: \(style)."
        }
	        if contentSubcategory == "npcs" {
            let themeLine = npcTheme.map { "Theme/archetype: \($0)." } ?? ""
            let visualLine = (npcVisualHooks?.isEmpty == false) ? "Required visual hooks: \(npcVisualHooks!.joined(separator: "; "))." : ""
            let mechanicsLine = (npcMechanics?.isEmpty == false) ? "Behavior brief: \(npcMechanics!.joined(separator: "; "))." : ""
            let systemsLine = (npcSystems?.isEmpty == false) ? "Required systems: \(npcSystems!.joined(separator: "; "))." : ""
            let modeLine: String
            if npcVisualPipeline == "asset_template_v1" {
                modeLine = "Visual mode: Animated R15 template/accessory NPC, like stable imported NPC models; prioritize movement, visible edit-mode rig parts, readable role accessories, and props."
            } else if npcMeshMotionMode == "skinned_visual" {
                modeLine = "Visual mode: Skinned 3D mesh NPC; prioritize highly-detailed mesh that bends limbs through R15 catalog animations (Idle/Walk/Run). Mesh is rigged in Blender with R15 bones + skinning weights and uploaded as a skinned MeshPart asset."
            } else if npcMeshMotionMode == "static_visual_shell" {
                modeLine = "Visual mode: Static 3D mesh visual shell; prioritize detailed approved concept fidelity and keep the shell anchored/static (with subtle idle bobble for liveness)."
            } else {
                modeLine = "Visual mode: Moving 3D mesh visual shell; prioritize detailed approved concept fidelity and keep the visual shell following HumanoidRootPart every frame for patrol movement."
            }
            return "Generate a Studio-ready NPC with AI behavior for \(title). \(themeLine) \(visualLine) \(mechanicsLine) \(systemsLine) \(modeLine) Include scripts for dialogue, ProximityPrompt interaction, patrol/wander/chase behavior when the selected visual mode supports movement, attack logic when relevant, trading or quest hooks when requested. Style: \(style)."
        }
        if contentSubcategory == "roast_npc" {
            let personality = roastPersonality ?? "sigma_chad"
            let themeLine = npcTheme.map { "Theme/archetype: \($0)." } ?? ""
            let visualLine = (npcVisualHooks?.isEmpty == false) ? "Required visual hooks: \(npcVisualHooks!.joined(separator: "; "))." : ""
            return "Generate a Studio-ready Roast NPC for \(title). Personality preset: \(personality). \(themeLine) \(visualLine) The NPC must include a 3D model plus standard NPC scripts AND a Config.Roast block with TextGenerator-driven banter on Humanoid HealthChanged/Died/StateChanged, Backpack tool equip, idle stuck, and leaderstats coin gains. Player-only chat bubbles with cooldown. Style: \(style)."
        }
        switch projectKind {
        case .fix, .analyze:
            return "Generate game-ready Luau for \(title). Genre: \(genre). Scale: \(scale). Style: \(style). Systems: \(monetization)."
        case .content, .ugc:
            return "Generate a real 3D game-style asset for \(title). Output a textured GLB model with clean silhouette, creator-ready presentation, and game-friendly proportions. Genre: \(genre). Scale: \(scale). Style: \(style)."
        case .game, .clone:
            return "Generate a game package brief for \(title). Genre: \(genre). Scale: \(scale). Style: \(style). Monetization: \(monetization)."
        }
    }
}

private final class VoiceRecorder: NSObject, AVAudioRecorderDelegate {
    struct Clip {
        let data: Data
        let fileName: String
        let mimeType: String
    }

    private var recorder: AVAudioRecorder?
    private var recordingURL: URL?
    // Track peak audio level across the recording. Polled on a timer because
    // AVAudioRecorder only updates meter values on demand. If the peak stays
    // below `silenceThresholdDb` for the whole recording we treat it as
    // silent and surface a dedicated error before uploading to Deepgram.
    private var meterTimer: Timer?
    private var peakLevelDb: Float = -160
    private let silenceThresholdDb: Float = -45

    func start() async throws {
        let granted = await requestPermission()
        guard granted else {
            throw VoiceRecorderError.permissionDenied
        }

        let session = AVAudioSession.sharedInstance()
        // `.voiceChat` mode enables AGC + noise suppression + echo cancellation,
        // which materially improves Deepgram transcription quality vs raw
        // `.default`. `.allowBluetooth` (HFP) is required to capture mic input
        // from BT headsets — `.allowBluetoothA2DP` is output-only and would
        // leave the mic on whatever the system picks, often producing near-
        // silent recordings on AirPods.
        try session.setCategory(
            .playAndRecord,
            mode: .voiceChat,
            options: [.defaultToSpeaker, .allowBluetooth, .allowBluetoothA2DP]
        )
        try session.setActive(true, options: .notifyOthersOnDeactivation)

        let fileURL = FileManager.default.temporaryDirectory.appendingPathComponent("voice-\(UUID().uuidString).m4a")
        // 16 kHz mono is the native sample rate Deepgram expects for speech.
        // Higher rates upload more bytes for no recognition benefit.
        let settings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
            AVSampleRateKey: 16_000,
            AVNumberOfChannelsKey: 1,
            AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue,
        ]

        let newRecorder = try AVAudioRecorder(url: fileURL, settings: settings)
        newRecorder.delegate = self
        newRecorder.isMeteringEnabled = true
        newRecorder.prepareToRecord()
        guard newRecorder.record() else {
            throw VoiceRecorderError.recordingFailed
        }
        recorder = newRecorder
        recordingURL = fileURL
        peakLevelDb = -160
        startMeterTimer()
    }

    func stop() async throws -> Clip {
        guard let recorder, let recordingURL else {
            throw VoiceRecorderError.noActiveRecording
        }
        stopMeterTimer()
        // One final meter read in case the timer last fired before the user
        // spoke their last word.
        recorder.updateMeters()
        peakLevelDb = max(peakLevelDb, recorder.peakPower(forChannel: 0))
        let duration = recorder.currentTime
        let capturedPeakDb = peakLevelDb
        recorder.stop()
        self.recorder = nil
        self.recordingURL = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        guard duration >= 0.5 else {
            try? FileManager.default.removeItem(at: recordingURL)
            throw VoiceRecorderError.recordingTooShort
        }
        let data = try Data(contentsOf: recordingURL)
        try? FileManager.default.removeItem(at: recordingURL)
        guard data.count > 1024 else {
            throw VoiceRecorderError.emptyAudioData
        }
        // Surface "silent recording" as a distinct error so the user is told
        // to speak louder / unmute the mic, rather than blaming Deepgram for
        // returning an empty transcript on silent input.
        if capturedPeakDb < silenceThresholdDb {
            throw VoiceRecorderError.audioTooQuiet
        }
        return Clip(data: data, fileName: recordingURL.lastPathComponent, mimeType: "audio/m4a")
    }

    private func startMeterTimer() {
        meterTimer?.invalidate()
        let timer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            guard let self, let recorder = self.recorder else { return }
            recorder.updateMeters()
            self.peakLevelDb = max(self.peakLevelDb, recorder.peakPower(forChannel: 0))
        }
        RunLoop.main.add(timer, forMode: .common)
        meterTimer = timer
    }

    private func stopMeterTimer() {
        meterTimer?.invalidate()
        meterTimer = nil
    }

    private func requestPermission() async -> Bool {
        if #available(iOS 17, *) {
            return await AVAudioApplication.requestRecordPermission()
        } else {
            return await withCheckedContinuation { continuation in
                AVAudioSession.sharedInstance().requestRecordPermission { granted in
                    continuation.resume(returning: granted)
                }
            }
        }
    }
}

private enum VoiceRecorderError: Error {
    case permissionDenied
    case noActiveRecording
    case recordingFailed
    case recordingTooShort
    case emptyAudioData
    case audioTooQuiet
}
