//
//  ChatView.swift
//  AIGoldRoblox
//
//  Voice First: dominant mic button + Neon Studio bubbles
//

import SwiftUI
import PhotosUI
import UniformTypeIdentifiers
import AVFoundation
import Combine
import UIKit

struct ChatView: View {
    enum EntryChatMode {
        case voice
        case text
    }

    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var appState: AppState
    @StateObject private var chatStore: ChatStore
    private let entryMode: EntryChatMode
    private let welcomeContext: String?
    private let customTitle: String
    private let sessionId: String
    private let isResuming: Bool
    @State private var inputText = ""
    @State private var linkInput = ""
    @State private var universeIdInput = ""
    @State private var exportGuide: ExportGuide?
    @State private var isShowingLinkPrompt = false
    @State private var isImportingFile = false
    @State private var isShowingFixDiff = false
    @State private var selectedPhoto: PhotosPickerItem?
    // Bug 16: PhotosPicker нельзя размещать напрямую в Menu { } — Menu закрывается
    // раньше, чем PhotosPicker успевает презентовать sheet, и тап уходит в никуда.
    // Паттерн: Button в меню → @State флаг → .photosPicker(isPresented:) на root view.
    @State private var isShowingPhotoPicker = false
    @State private var didInjectWelcome = false
    @State private var didAutoSelectResumedThread = false
    @State private var threadToRename: ChatStore.ChatThread?
    @State private var threadRenameText = ""
    @State private var searchText = ""
    @State private var isShowingSidebar = false
    @State private var isShowingProviderSheet = false
    @State private var fileImportError: String?
    @State private var showVoiceTranscriptToast = false
    @State private var generationTipIndex = 0
    @State private var isTipPanelVisible = false
    @State private var didPickFlowInline = false
    @State private var liveTrendingNames: [String] = []
    // Voice-first overlay: shown when user enters a fresh voice thread.
    // Auto-sends the first transcript and then collapses to reveal the chat.
    // Dismissed manually via "Type instead". Stays dismissed for the session.
    @State private var voiceOverlayActive = false
    @FocusState private var isInputFocused: Bool

    /// True while any generation stage is still in flight. Drives the blur
    /// overlay and rotating tip plate during game-package generation.
    private var isStillGenerating: Bool {
        chatStore.isGenerationTipsActive
    }

    private static let generationTipsEN: [String] = [
        "💡 Use DataStores to save player progress between sessions.",
        "🎮 Keep game loops under 60ms to maintain smooth performance.",
        "🏆 Leaderboards drive longer repeat sessions.",
        "🔊 Ambient audio increases immersion — even subtle wind sounds help.",
        "💎 Game Passes with permanent perks convert better than consumables.",
        "🎨 Use neon and bright colors — they read well in real-time lighting.",
        "🤝 Social mechanics (teams, trading) multiply viral reach organically.",
        "⚡ Stream assets with ContentProvider to reduce initial load time.",
        "🛡️ Always validate inputs server-side — clients can be exploited.",
        "📦 Group related parts into Models to keep the Explorer tree clean.",
        "🌟 Trending genres in 2025: anime, brainrot memes, horror, tycoon.",
        "🔁 Use RunService.Heartbeat for smooth animation, not loops with wait().",
    ]

    private static let generationTipsRU: [String] = [
        "💡 Используй DataStore, чтобы сохранять прогресс игрока между сессиями.",
        "🎮 Держи игровые циклы в пределах 60 мс для плавного фреймрейта.",
        "🏆 Лидерборды увеличивают повторные игровые сессии.",
        "🔊 Фоновый звук усиливает погружение — даже тихий ветер работает.",
        "💎 Game Pass с постоянными бонусами конвертят лучше расходников.",
        "🎨 Неон и яркие цвета лучше всего читаются в игровом освещении.",
        "🤝 Социальные механики (команды, трейд) органично множат вирусность.",
        "⚡ Предзагружай ассеты через ContentProvider, чтобы ускорить старт.",
        "🛡️ Всегда валидируй ввод на сервере — клиент могут взломать.",
        "📦 Группируй связанные Part'ы в Model, чтобы дерево Explorer не разрасталось.",
        "🌟 Трендовые жанры 2025: аниме, brainrot-мемы, хоррор, тайкун.",
        "🔁 Для плавной анимации используй RunService.Heartbeat, а не wait() в цикле.",
    ]

    // Voice-composer + transcript-toast strings translated for the 9 STT
    // languages backend's mapLocaleToDeepgramLanguage explicitly supports
    // (ru/en/es/pt/de/fr/zh/ja/ko). Unknown language codes fall through to en.
    private static let voiceUIStrings: [String: [String: String]] = [
        "voiceChat": [
            "en": "Voice Chat",
            "ru": "Голосовой чат",
            "es": "Chat de voz",
            "pt": "Chat de voz",
            "de": "Sprach-Chat",
            "fr": "Chat vocal",
            "zh": "语音聊天",
            "ja": "ボイスチャット",
            "ko": "음성 채팅",
        ],
        "whatToChange": [
            "en": "What would you like to change?",
            "ru": "Что нужно изменить?",
            "es": "¿Qué quieres cambiar?",
            "pt": "O que você quer mudar?",
            "de": "Was möchtest du ändern?",
            "fr": "Que voulez-vous changer ?",
            "zh": "你想改什么?",
            "ja": "何を変更しますか？",
            "ko": "무엇을 바꿀까요?",
        ],
        "addDetailsInText": [
            "en": "You can add extra details in text...",
            "ru": "Можно дописать детали текстом...",
            "es": "Puedes añadir detalles por texto...",
            "pt": "Você pode adicionar detalhes por texto...",
            "de": "Du kannst Details als Text ergänzen...",
            "fr": "Vous pouvez ajouter des détails par texte...",
            "zh": "可以用文字补充细节...",
            "ja": "詳細をテキストで追加できます...",
            "ko": "텍스트로 세부 사항을 추가할 수 있어요...",
        ],
        "transcribedEditOrSend": [
            "en": "Transcribed — edit or tap Send",
            "ru": "Готово — отредактируй или отправь",
            "es": "Transcrito — edita o envía",
            "pt": "Transcrito — edite ou envie",
            "de": "Erkannt — bearbeite oder sende",
            "fr": "Transcrit — modifie ou envoie",
            "zh": "已识别 — 编辑或发送",
            "ja": "認識完了 — 編集または送信",
            "ko": "인식 완료 — 편집하거나 전송",
        ],
        "startRecording": [
            "en": "Start recording",
            "ru": "Начать запись",
            "es": "Iniciar grabación",
            "pt": "Iniciar gravação",
            "de": "Aufnahme starten",
            "fr": "Démarrer l'enregistrement",
            "zh": "开始录音",
            "ja": "録音を開始",
            "ko": "녹음 시작",
        ],
    ]

    fileprivate static func localized(_ key: String, lang: String) -> String {
        voiceUIStrings[key]?[lang] ?? voiceUIStrings[key]?["en"] ?? key
    }

    private var generationTips: [String] {
        let isRu = chatStore.preferredResponseLanguageCode() == "ru"
        var tips = isRu ? Self.generationTipsRU : Self.generationTipsEN
        // Replace the static "trending genres" tip (index 10) with a live one
        // if /api/roblox/trending returned anything. Falls back silently.
        if !liveTrendingNames.isEmpty, tips.indices.contains(10) {
            let names = liveTrendingNames.prefix(3).joined(separator: ", ")
            tips[10] = isRu
                ? "🌟 Сейчас в creator catalog трендят: \(names)."
                : "🌟 Trending in the creator catalog right now: \(names)."
        }
        return tips
    }

    private func loadLiveTrendingNames() async {
        guard liveTrendingNames.isEmpty else { return }
        do {
            let resp = try await AIWorkspaceAPI.fetchRobloxTrending(category: "Featured", limit: 5)
            liveTrendingNames = resp.items.map { $0.name }
        } catch {
            // Silent fallback: static tip stays.
        }
    }

    private let template: AIWorkspaceAPI.GameTemplate?
    private let resumeJobId: String?
    private let openGenerationOnLaunch: Bool

    private var effectiveHistorySessionId: String {
        let threadId = chatStore.currentThread?.id.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return threadId.isEmpty ? sessionId : threadId
    }

    private var navigationDisplayTitle: String {
        switch chatStore.contentSubcategory {
        case "npcs": return "Smart NPC"
        case "roast_npc": return "Roast NPC"
        case "anime_skills": return "Anime Skill"
        case "brainrot_sim": return "Brainrot Sim"
        case "obby_troll": return "Troll Obby"
        case "pvp": return "PvP Arena"
        case "tower_defense": return "Tower Defense"
        case "roleplay_town": return "Roleplay / Town"
        case "racing": return "Racing"
        case "parkour": return "Parkour"
        case "story_game": return "Story Game"
        case "minigame_hub": return "Mini-games Hub"
        case "survival": return "Survival"
        case "fighting": return "Fighting"
        case "custom": return "Custom"
        case "items": return "Items"
        case "weapons": return "Weapons"
        case "buildings": return "Buildings"
        case "furniture": return "Furniture"
        case "maps": return "Maps"
        case "characters": return "Characters"
        case "scripts": return "Scripts"
        case "ui": return "UI"
        case "audio": return "Audio"
        case "animations": return "Animations"
        case "decals": return "Decals"
        case "passes": return "Passes"
        default:
            let baseTitle = customTitle
                .replacingOccurrences(of: " — Voice", with: "")
                .replacingOccurrences(of: " — Text", with: "")
                .trimmingCharacters(in: .whitespacesAndNewlines)
            return baseTitle.isEmpty ? "AI Chat" : baseTitle
        }
    }

    private var navigationTitleLabel: some View {
        Text(navigationDisplayTitle)
            .font(.system(size: 17, weight: .bold, design: .rounded))
            .foregroundColor(.textPrimary)
            .lineLimit(1)
            .minimumScaleFactor(0.72)
            .truncationMode(.tail)
            .frame(maxWidth: 160)
            .accessibilityAddTraits(.isHeader)
    }

    init(
        projectKind: ProjectKind = .game,
        preferredFlow: ChatStore.WorkspaceFlow = .smartInterview,
        entryMode: EntryChatMode = .voice,
        welcomeContext: String? = nil,
        title: String = "AI Chat",
        sessionId: String? = nil,
        template: AIWorkspaceAPI.GameTemplate? = nil,
        contentSubcategory: String? = nil,
        lastJobId: String? = nil,
        openGenerationOnLaunch: Bool = false
    ) {
        _chatStore = StateObject(wrappedValue: ChatStore(projectKind: projectKind, preferredFlow: preferredFlow, template: template, contentSubcategory: contentSubcategory))
        self.entryMode = entryMode
        self.welcomeContext = welcomeContext
        self.customTitle = title
        self.isResuming = sessionId != nil
        self.sessionId = sessionId ?? UUID().uuidString
        self.template = template
        self.resumeJobId = lastJobId
        self.openGenerationOnLaunch = openGenerationOnLaunch
    }

    var body: some View {
        bodyWithFinalModifiers
    }

    // MARK: - Body Stages (split to help Swift type-checker)
    // Each computed property creates a `some View` type-erasure boundary,
    // preventing the type-checker from exploding on a single giant expression.

    private var bodyWithNavigationChrome: some View {
        mainContent
            .navigationTitle(navigationDisplayTitle)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                chatToolbarContent
            }
            .toolbarBackground(Color.gradientTop.opacity(0.98), for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarColorScheme(.light, for: .navigationBar)
            .tint(.textPrimary)
            .sheet(isPresented: $isShowingFixDiff) {
                LuauDiffView(
                    original: chatStore.fixDiffOriginal ?? "",
                    fixed: chatStore.fixDiffFixed ?? ""
                )
            }
    }

    @ToolbarContentBuilder
    private var chatToolbarContent: some ToolbarContent {
        ToolbarItem(placement: .topBarLeading) {
            Button {
                saveToHistory()
                dismiss()
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 24))
                    .foregroundColor(.textSecondary)
            }
        }
        ToolbarItem(placement: .principal) {
            navigationTitleLabel
        }
        if chatStore.canShowFixDiff {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    isShowingFixDiff = true
                } label: {
                    Image(systemName: "chevron.left.forwardslash.chevron.right")
                }
                .accessibilityLabel("Red to green diff")
            }
        }
        ToolbarItem(placement: .topBarTrailing) {
            trailingToolbarContent
        }
    }

    private var bodyWithLifecycle: some View {
        bodyWithNavigationChrome
            .onChange(of: searchText) {
                chatStore.searchThreads(query: searchText)
            }
            .onAppear {
                handleOnAppear()
            }
            .onChange(of: chatStore.historyGenerationStatusDigest) {
                saveToHistory()
            }
            .onChange(of: chatStore.currentThread?.id) {
                chatStore.bindHistorySession(
                    id: effectiveHistorySessionId,
                    title: customTitle,
                    category: welcomeContext ?? customTitle,
                    chatMode: entryMode
                )
                saveToHistory()
            }
            .task {
                await loadLiveTrendingNames()
            }
            .onChange(of: chatStore.threads.count) {
                handleThreadsLoaded()
            }
            .onChange(of: chatStore.backgroundGenerationJobs.count) {
                saveToHistory()
            }
            .onChange(of: chatStore.readyBackgroundGenerationCount) {
                saveToHistory()
            }
            .onDisappear {
                saveToHistory()
            }
            .onReceive(NotificationCenter.default.publisher(for: .smartStubNavigate)) { _ in
                saveToHistory()
                dismiss()
            }
            .onReceive(NotificationCenter.default.publisher(for: .openGenerationChat)) { notification in
                guard let jobId = notification.userInfo?["jobId"] as? String else { return }
                let threadId = notification.userInfo?["threadId"] as? String
                if threadId == nil || threadId == chatStore.currentThread?.id || jobId == chatStore.lastJobId {
                    chatStore.openBackgroundGeneration(jobId)
                }
            }
    }

    private var bodyWithSheetsAndLinkAlert: some View {
        bodyWithLifecycle
            .sheet(item: $chatStore.activePreview) { preview in
                previewSheetContent(for: preview)
            }
            .alert("Paste Link", isPresented: $isShowingLinkPrompt) {
                TextField("https://...", text: $linkInput)
                Button("Cancel", role: .cancel) {
                    linkInput = ""
                }
                Button("Ingest") {
                    let link = linkInput
                    linkInput = ""
                    chatStore.ingestLink(link)
                }
            } message: {
                Text("Paste a reference URL to analyze the real page content.")
            }
    }

    private var bodyWithVoiceAndRenameAlerts: some View {
        bodyWithSheetsAndLinkAlert
            .alert("Connect your Roblox account", isPresented: $chatStore.showRobloxConnectAlert) {
                Button("Connect") {
                    RobloxAuthService.shared.startOAuthFlow()
                }
                Button("Cancel", role: .cancel) { }
            } message: {
                Text("Your generated creations upload to your own Roblox account. Connect it to start generating.")
            }
            .alert("Set your Game Universe ID", isPresented: $chatStore.showUniverseIdPrompt) {
                TextField("e.g. 1234567890", text: $universeIdInput)
                Button("Cancel", role: .cancel) {
                    universeIdInput = ""
                }
                Button("Save") {
                    let id = universeIdInput
                    universeIdInput = ""
                    RobloxAuthService.shared.setUniverseId(id)
                    chatStore.generateFromCurrentPlan()
                }
            } message: {
                Text("Game Passes attach to a specific game. Paste your game's Universe ID (Creator Dashboard → your Experience → Overview).")
            }
            .alert("Voice Input Error", isPresented: Binding<Bool>(
                get: { chatStore.voiceErrorAlert != nil },
                set: { if !$0 { chatStore.voiceErrorAlert = nil } }
            )) {
                Button("OK", role: .cancel) {
                    chatStore.voiceErrorAlert = nil
                }
                if chatStore.voiceErrorAlert?.contains("Settings") == true {
                    Button("Open Settings") {
                        chatStore.voiceErrorAlert = nil
                        if let url = URL(string: UIApplication.openSettingsURLString) {
                            UIApplication.shared.open(url)
                        }
                    }
                }
            } message: {
                Text(chatStore.voiceErrorAlert ?? "")
            }
            .alert("Rename Chat", isPresented: Binding<Bool>(
                get: { threadToRename != nil },
                set: { if !$0 { threadToRename = nil } }
            )) {
                TextField("New name", text: $threadRenameText)
                Button("Cancel", role: .cancel) { threadToRename = nil }
                Button("Save") {
                    if let t = threadToRename {
                        chatStore.renameThread(t, to: threadRenameText)
                    }
                    threadToRename = nil
                }
            }
    }

    private var bodyWithSidebarAndFileImport: some View {
        bodyWithVoiceAndRenameAlerts
            .sheet(isPresented: $isShowingSidebar) {
                ChatThreadSidebar(
                    threads: chatStore.threads,
                    currentThread: chatStore.currentThread,
                    archivedIds: ChatHistoryStore.shared.archivedIds,
                    onSelect: { thread in
                        chatStore.selectThread(thread)
                        isShowingSidebar = false
                    },
                    onRename: { thread in
                        isShowingSidebar = false
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                            threadRenameText = thread.title
                            threadToRename = thread
                        }
                    },
                    onSearch: { query in
                        chatStore.searchThreads(query: query)
                    },
                    onArchive: { id in
                        ChatHistoryStore.shared.archiveThread(id: id)
                    },
                    onUnarchive: { id in
                        ChatHistoryStore.shared.unarchiveThread(id: id)
                    }
                )
            }
            .fileImporter(
                isPresented: $isImportingFile,
                allowedContentTypes: fileImportContentTypes,
                allowsMultipleSelection: false
            ) { result in
                handleFileImport(result)
            }
            // Bug 16: root-level PhotosPicker (triggered from Menu button flag).
            .photosPicker(
                isPresented: $isShowingPhotoPicker,
                selection: $selectedPhoto,
                matching: .images
            )
            .alert("File Import Error", isPresented: Binding<Bool>(
                get: { fileImportError != nil },
                set: { if !$0 { fileImportError = nil } }
            )) {
                Button("OK", role: .cancel) { fileImportError = nil }
            } message: {
                Text(fileImportError ?? "")
            }
    }

    private var bodyWithFinalModifiers: some View {
        bodyWithSidebarAndFileImport
            .onChange(of: chatStore.pendingVoiceTranscript) { _, transcript in
                handleVoiceTranscriptChange(transcript)
            }
            .onChange(of: selectedPhoto) {
                handleSelectedPhotoChange()
            }
            .onChange(of: chatStore.systemToast?.id) { _, toastId in
                guard let toastId else { return }
                Task {
                    try? await Task.sleep(for: .seconds(2.4))
                    await MainActor.run {
                        withAnimation(.easeInOut(duration: 0.22)) {
                            chatStore.clearSystemToast(id: toastId)
                        }
                    }
                }
            }
            // Session 371: in-app generation alert overlay disabled here too
            // (see RootView.swift comment). iOS system banner remains the
            // single visual surface for generation pushes.
            .hideCustomTabBarOnPush()
    }

    private func handleOnAppear() {
        chatStore.bindHistorySession(
            id: effectiveHistorySessionId,
            title: customTitle,
            category: welcomeContext ?? customTitle,
            chatMode: entryMode
        )
        chatStore.loadThreads()
        if chatStore.currentThread == nil && !chatStore.threads.isEmpty {
            chatStore.selectThread(chatStore.threads.first!)
        }
        if !didInjectWelcome {
            didInjectWelcome = true
            if let template {
                chatStore.preloadTemplate(template)
            } else if isResuming {
                // Session 391 — pin currentThread to sessionId BEFORE restore
                // work. See ChatStore.attachResumedThread doc-comment for the
                // three race conditions this guards against (orphaned saves
                // via new defaultThreads UUID + selectThread clobber on
                // title-mismatch in handleThreadsLoaded).
                chatStore.attachResumedThread(threadId: sessionId, title: customTitle)
                let saved = ChatHistoryStore.shared.loadMessages(for: sessionId)
                print("[ResumeChat] sessionId=\(sessionId) localSaved=\(saved.count) lastJobId=\(resumeJobId ?? "nil") contentSub=\(chatStore.contentSubcategory ?? "nil")")
                if !saved.isEmpty {
                    chatStore.restoreMessages(saved)
                    // Session 391 round 5 — the local file may be stale (the
                    // user closed the chat before the background generation
                    // finished, so the "ready" message + lastJobId never got
                    // saved). The backend ALWAYS records latestJobId in the
                    // thread's projectMemory when a viral job finishes, so
                    // pull it and restore the result preview. Without this the
                    // reopened chat stops at "Locked. I'm generating…".
                    chatStore.hydrateLatestJobFromRemoteThread(
                        threadId: sessionId,
                        openWhenReady: openGenerationOnLaunch
                    )
                } else {
                    chatStore.resumeFromRemoteThread(threadId: sessionId, title: customTitle)
                }
            } else if let ctx = welcomeContext, !ctx.isEmpty {
                chatStore.replaceWelcome(context: ctx, isVoice: entryMode == .voice)
            }
            if let jobId = resumeJobId {
                chatStore.restorePreviewFromJob(jobId: jobId, openWhenReady: openGenerationOnLaunch)
            }
            // Voice-first overlay only opens on fresh voice threads. Resuming a
            // saved voice thread (template/remote) drops the user back into the
            // chat view so they can continue reviewing prior messages.
            voiceOverlayActive = (entryMode == .voice) && !isResuming && (template == nil)
        }
    }

    /// Bug 15: After `loadThreads()` async-populates `chatStore.threads`, the local
    /// `sessionId` (forge session UUID) does not match any server-side threadId —
    /// so the initial `resumeFromRemoteThread(threadId: sessionId, ...)` fetches
    /// nothing and the old history stays invisible until the user manually picks
    /// a thread from the sidebar. This handler reacts once, finds the thread
    /// whose id matches `sessionId` (preferred) or `customTitle` (fallback),
    /// and selects it so `loadRemoteMessages(for: realThreadId)` fetches the
    /// actual history. Skipped when the local message cache already restored
    /// the conversation (to avoid the welcome-flash caused by `selectThread`
    /// resetting messages).
    ///
    /// Session 391 — two hardening changes:
    /// 1. Prefer matching by `sessionId` over title. Title-only matching could
    ///    pick the wrong thread when the user has several "Voice-Controlled
    ///    Disaster Spawner — …" rows in their backend thread list. `sessionId`
    ///    is the stable identifier that `attachResumedThread` already pinned
    ///    currentThread to.
    /// 2. If `attachResumedThread` already set currentThread to a thread that
    ///    is now present in the loaded `threads` list, bail out without ever
    ///    calling `selectThread`. `selectThread` is destructive — it wipes
    ///    `messages`, `activePreview`, and `lastPreview` — so any accidental
    ///    invocation during resume erases the state we just restored.
    private func handleThreadsLoaded() {
        guard isResuming,
              !didAutoSelectResumedThread,
              !chatStore.threads.isEmpty else { return }
        didAutoSelectResumedThread = true

        // If the pre-attached currentThread is in the loaded list, the resume
        // flow already wired the right thread — nothing to do.
        if let current = chatStore.currentThread,
           chatStore.threads.contains(where: { $0.id == current.id }) {
            return
        }

        // Only auto-select when the view is still showing just the welcome
        // message — i.e., local cache was empty and server fetch under the
        // wrong threadId returned nothing. Otherwise selectThread would
        // wipe the restored messages.
        let showsOnlyWelcome = chatStore.messages.count == 1
            && chatStore.messages.first?.id == "welcome"
        guard showsOnlyWelcome else { return }

        let target = chatStore.threads.first(where: { $0.id == sessionId })
            ?? chatStore.threads.first(where: { $0.title == customTitle })
            ?? chatStore.threads.first
        if let t = target, chatStore.currentThread?.id != t.id {
            chatStore.selectThread(t)
        }
    }

    private func handleVoiceTranscriptChange(_ transcript: String?) {
        guard let transcript, !transcript.isEmpty else { return }
        chatStore.pendingVoiceTranscript = nil
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        // Both overlay and compact paths now drop the transcript into the
        // input field so the user can review/edit before tapping Send. Voice
        // recognition can mis-hear small but load-bearing words ("warrior" vs
        // "sorcerer") that completely change the generated prompt, so a
        // confirmation step is safer than ChatGPT-style auto-send.
        inputText = transcript
        if voiceOverlayActive {
            withAnimation(.easeInOut(duration: 0.35)) {
                voiceOverlayActive = false
            }
            // Wait for the overlay collapse animation before focusing the
            // text field — otherwise the keyboard races the overlay dismiss
            // and the layout flickers.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.38) {
                isInputFocused = true
            }
        } else {
            isInputFocused = true
        }
        withAnimation { showVoiceTranscriptToast = true }
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) {
            withAnimation { showVoiceTranscriptToast = false }
        }
    }

    private func handleSelectedPhotoChange() {
        guard let photo = selectedPhoto else { return }
        // Reset picker state SYNCHRONOUSLY so the paperclip button stays tappable
        // for re-selection while the background pipeline runs.
        self.selectedPhoto = nil
        self.isShowingPhotoPicker = false

        // Session 187: full pipeline runs OFF the main actor — load → downsample
        // (ImageIO thumbnail, no full-res decode) → JPEG-encode → cache → kick
        // background upload. The user sees the chip within ~100 ms and can keep
        // typing. UI never freezes; previously base64 of a 24MP photo on
        // MainActor blocked for 1–3 s before send() even started.
        Task.detached(priority: .userInitiated) {
            guard let originalData = try? await photo.loadTransferable(type: Data.self),
                  let pair = ImageDownsampler.downsampleAndEncode(
                      data: originalData,
                      maxPixel: 1024,
                      quality: 0.8
                  ) else {
                await MainActor.run {
                    chatStore.presentAttachmentError("I couldn't read that photo. Try another image (PNG/JPEG/HEIC).")
                }
                return
            }
            let (downsizedImage, jpegData) = pair
            let key = UUID().uuidString
            ChatImageCache.shared.set(downsizedImage, for: key)
            await MainActor.run {
                chatStore.attachImageReference(
                    data: jpegData,
                    fileName: "reference.jpg",
                    mimeType: "image/jpeg",
                    localImageKey: key
                )
            }
        }
    }

    // MARK: - Extracted Sub-Expressions (to help Swift type-checker)

    private var mainContent: some View {
        ZStack {
            LinearGradient(colors: [.gradientTop, .gradientBottom], startPoint: .topLeading, endPoint: .bottomTrailing)
                .ignoresSafeArea()

            VStack(spacing: 0) {
                chatTopSurface

                messageList
                    .blur(radius: (isStillGenerating && isTipPanelVisible) ? 6 : 0)
                    .overlay {
                        if isStillGenerating && isTipPanelVisible {
                            Color.black.opacity(0.18)
                                .allowsHitTesting(false)
                                .transition(.opacity)
                        }
                    }
                    .overlay(alignment: .top) {
                        if isStillGenerating && isTipPanelVisible {
                            generationTipPlate
                                .transition(.move(edge: .top).combined(with: .opacity))
                        }
                    }
                    .overlay(alignment: .topTrailing) {
                        if isStillGenerating && !isTipPanelVisible {
                            generationTipReopenPill
                                .transition(.scale.combined(with: .opacity))
                        }
                    }
                    .animation(.easeInOut(duration: 0.25), value: isStillGenerating)
                    .animation(.easeInOut(duration: 0.25), value: isTipPanelVisible)
                    .onChange(of: isStillGenerating) { _, newValue in
                        if newValue {
                            generationTipIndex = 0
                            isTipPanelVisible = true
                        } else {
                            isTipPanelVisible = false
                        }
                    }
                    .onAppear {
                        if isStillGenerating {
                            isTipPanelVisible = true
                        }
                    }
                    .onReceive(Timer.publish(every: 4, on: .main, in: .common).autoconnect()) { _ in
                        if isStillGenerating {
                            generationTipIndex += 1
                        }
                    }

                composer
            }
            .overlay {
                if !searchText.isEmpty, let results = chatStore.searchResults {
                    SearchResultsOverlay(
                        results: results,
                        query: searchText,
                        onSelect: { thread in
                            searchText = ""
                            chatStore.searchResults = nil
                            chatStore.selectThread(thread)
                        }
                    )
                }
            }

            // Voice transcript ready toast
            if showVoiceTranscriptToast {
                VStack {
                    Spacer()
                    HStack(spacing: 8) {
                        Image(systemName: "mic.fill")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundColor(.accentPrimary)
                        Text(Self.localized("transcribedEditOrSend", lang: chatStore.preferredResponseLanguageCode()))
                            .font(.system(size: 13, weight: .semibold, design: .rounded))
                            .foregroundColor(.textPrimary)
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(.ultraThinMaterial)
                    .clipShape(Capsule())
                    .shadow(color: .black.opacity(0.12), radius: 8, x: 0, y: 4)
                    .padding(.bottom, 100)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }

            if let toast = chatStore.systemToast {
                VStack {
                    SystemStatusToast(message: toast.message)
                        .padding(.top, 10)
                    Spacer()
                }
                .transition(.move(edge: .top).combined(with: .opacity))
                .zIndex(20)
            }

            if voiceOverlayActive {
                VoiceFirstOverlay(
                    phase: chatStore.voicePhase,
                    isRecording: chatStore.isRecording,
                    languageCode: chatStore.preferredResponseLanguageCode(),
                    onMicTap: { chatStore.toggleRecording() },
                    onTypeInstead: {
                        if chatStore.isRecording {
                            chatStore.toggleRecording()
                        }
                        withAnimation(.easeInOut(duration: 0.25)) {
                            voiceOverlayActive = false
                        }
                    }
                )
                .transition(.opacity)
                .zIndex(50)
            }
        }
    }

    private var chatTopSurface: some View {
        VStack(spacing: 0) {
            if shouldShowInlineFlowPicker {
                initialFlowPicker
                    .transition(.move(edge: .top).combined(with: .opacity))
            }

            generationStatusDock
        }
        .background(topSurfaceHasContent ? Color.dockSurface : Color.clear)
        .overlay(alignment: .bottom) {
            if topSurfaceHasContent {
                Rectangle()
                    .fill(Color.bubbleBorder.opacity(0.16))
                    .frame(height: 1)
            }
        }
        .animation(.easeInOut(duration: 0.22), value: shouldShowInlineFlowPicker)
        .animation(.easeInOut(duration: 0.22), value: generationStatusSummary?.title)
    }

    private var topSurfaceHasContent: Bool {
        shouldShowInlineFlowPicker || generationStatusSummary != nil
    }

    private var shouldShowInlineFlowPicker: Bool {
        !didPickFlowInline && !hasStartedChat && !isResuming
    }

    private var hasStartedChat: Bool {
        chatStore.messages.contains(where: { $0.role == .user })
            || chatStore.messages.count > 1
            || !chatStore.generationStages.isEmpty
            || chatStore.backgroundGenerationSnapshot != nil
    }

    private var initialFlowPicker: some View {
        let isRu = chatStore.preferredResponseLanguageCode() == "ru"
        return VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Text(isRu ? "Режим генерации" : "Generation mode")
                    .font(.system(size: 13, weight: .bold, design: .rounded))
                    .foregroundColor(.textPrimary)
                Spacer(minLength: 8)
                Text(isRu ? "выберите один раз" : "choose once")
                    .font(.system(size: 11, weight: .semibold, design: .rounded))
                    .foregroundColor(.textTertiary)
            }
            .padding(.horizontal, 2)

            FlowModePicker(
                languageCode: chatStore.preferredResponseLanguageCode(),
                selectedFlow: Binding(
                    get: { chatStore.preferredFlow },
                    set: { flow in
                        chatStore.setFlow(flow)
                        withAnimation(.easeInOut(duration: 0.2)) {
                            didPickFlowInline = true
                        }
                    }
                )
            )
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, 10)
    }

    private var generationStatusDock: some View {
        Group {
            if let summary = generationStatusSummary {
                Button {
                    openGenerationStatusDetails()
                } label: {
                    HStack(spacing: 11) {
                        ZStack {
                            Circle()
                                .fill(Color.white.opacity(0.16))
                            Image(systemName: summary.iconName)
                                .font(.system(size: 15, weight: .bold))
                                .foregroundColor(.white)
                        }
                        .frame(width: 34, height: 34)

                        VStack(alignment: .leading, spacing: 3) {
                            Text(summary.title)
                                .font(.system(size: 14, weight: .bold, design: .rounded))
                                .foregroundColor(.white)
                                .lineLimit(1)
                                .minimumScaleFactor(0.82)

                            Text(summary.subtitle)
                                .font(.system(size: 12, weight: .semibold, design: .rounded))
                                .foregroundColor(.white.opacity(0.72))
                                .lineLimit(1)
                                .minimumScaleFactor(0.82)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .layoutPriority(1)

                        if summary.showsProgress {
                            ProgressView()
                                .controlSize(.small)
                                .tint(.white)
                        }

                        if let actionTitle = summary.actionTitle {
                            Text(actionTitle)
                                .font(.system(size: 12, weight: .bold, design: .rounded))
                                .foregroundColor(summary.tint)
                                .lineLimit(1)
                                .padding(.horizontal, 11)
                                .padding(.vertical, 7)
                                .background(Color.white.opacity(0.92), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                        }

                        Image(systemName: "chevron.right")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(.white.opacity(0.72))
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 12)
                    .background(
                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .fill(
                                LinearGradient(
                                    colors: [
                                        Color.brandNight.opacity(0.92),
                                        summary.tint.opacity(0.72)
                                    ],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                    )
                    .shadow(color: summary.tint.opacity(0.20), radius: 12, x: 0, y: 7)
                    .contentShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                }
                .buttonStyle(.plain)
                .padding(.horizontal, 16)
                .padding(.top, shouldShowInlineFlowPicker ? 0 : 8)
                .padding(.bottom, 10)
                .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
    }

    private var generationStatusSummary: (iconName: String, title: String, subtitle: String, tint: Color, actionTitle: String?, showsProgress: Bool)? {
        let isRu = chatStore.preferredResponseLanguageCode() == "ru"

        if let stage = currentGenerationStage, stage.status == "processing" || stage.status == "pending" {
            let total = max(chatStore.generationStages.count, 1)
            let completed = chatStore.generationStages.filter { $0.isComplete }.count
            let position = min(max(completed + 1, 1), total)
            let subtitle = isRu
                ? "Шаг \(position)/\(total)"
                : "Step \(position)/\(total)"
            let iconName = stage.status == "processing" ? "arrow.triangle.2.circlepath.circle.fill" : "circle.dotted"
            return (iconName, stage.title, subtitle, .accentPrimary, nil, true)
        }

        if chatStore.backgroundGenerationJobs.isEmpty,
           let snapshot = chatStore.backgroundGenerationSnapshot {
            let tint = statusTint(for: snapshot)
            let subtitle = snapshot.title
            let actionTitle: String
            if snapshot.needsReview {
                actionTitle = isRu ? "Проверить" : "Review"
            } else if snapshot.isReady {
                actionTitle = isRu ? "Открыть" : "Open"
            } else {
                actionTitle = isRu ? "Детали" : "Details"
            }
            return (snapshot.iconName, snapshot.statusLabel, subtitle, tint, snapshot.isActive ? nil : actionTitle, snapshot.isActive)
        }

        if let job = chatStore.backgroundGenerationJobs.sorted(by: { $0.updatedAt > $1.updatedAt }).first {
            let tint: Color
            let title: String
            let iconName: String
            let actionTitle: String
            // Session 391 round 3 — also show "Step N/M" subtitle for background
            // jobs (viral chats / detached 3D). Before this, only foreground
            // pipeline jobs showed step info; user couldn't see what stage of
            // cursed_ugc / disaster_spawner / vehicles was running.
            let subtitle: String
            if !job.isTerminal && job.stages.count > 0 {
                let total = job.stages.count
                let completed = job.stages.filter { $0.isComplete }.count
                let position = min(max(completed + 1, 1), total)
                subtitle = isRu
                    ? "Шаг \(position)/\(total) · \(job.title)"
                    : "Step \(position)/\(total) · \(job.title)"
            } else {
                subtitle = job.title
            }
            if job.needsReview {
                tint = ChatStatusPalette.review
                title = isRu ? "Нужен апрув" : "Needs review"
                iconName = "hand.tap.fill"
                actionTitle = isRu ? "Проверить" : "Review"
            } else if job.isPartial {
                tint = .accentOrange
                title = isRu ? "Частичный экспорт" : "Partial export"
                iconName = "exclamationmark.circle.fill"
                actionTitle = isRu ? "Открыть" : "Open"
            } else if job.isReady {
                tint = ChatStatusPalette.ready
                title = isRu ? "Готово к экспорту" : "Ready to export"
                iconName = "checkmark.seal.fill"
                actionTitle = isRu ? "Открыть" : "Open"
            } else if job.needsAttention {
                tint = .red
                title = job.status == "watcher_error"
                    ? (isRu ? "Проверьте статус" : "Check status")
                    : (isRu ? "Нужен фикс" : "Needs fix")
                iconName = job.status == "watcher_error" ? "exclamationmark.triangle.fill" : "xmark.circle.fill"
                actionTitle = isRu ? "Детали" : "Details"
            } else {
                tint = .accentPrimary
                title = job.currentStageTitle ?? (isRu ? "Рендерится в фоне" : job.statusLabel)
                iconName = "clock.arrow.circlepath"
                actionTitle = isRu ? "Детали" : "Details"
            }
            return (iconName, title, subtitle, tint, job.isTerminal ? actionTitle : nil, !job.isTerminal)
        }

        guard let stage = currentGenerationStage else { return nil }
        let tint: Color = stage.isFailed ? .red : (stage.isComplete ? ChatStatusPalette.ready : .accentPrimary)
        let iconName: String
        if stage.isFailed {
            iconName = "xmark.circle.fill"
        } else if stage.isComplete {
            iconName = "checkmark.circle.fill"
        } else {
            iconName = "circle.dotted"
        }
        let subtitle = isRu ? "Генерация" : "Generation"
        return (iconName, stage.title, subtitle, tint, isRu ? "Открыть" : "Open", false)
    }

    private var currentGenerationStage: ChatStore.GenerationStage? {
        chatStore.generationStages.first(where: { $0.status == "processing" })
            ?? chatStore.generationStages.first(where: { $0.status == "pending" })
            ?? chatStore.generationStages.last
    }

    private func statusTint(for snapshot: ChatStore.GenerationStatusSnapshot) -> Color {
        if snapshot.needsReview {
            return ChatStatusPalette.review
        } else if snapshot.isPartial {
            return .accentOrange
        } else if snapshot.isReady {
            return ChatStatusPalette.ready
        } else if snapshot.isFailed {
            return .red
        } else {
            return .accentPrimary
        }
    }

    private func openGenerationStatusDetails() {
        if let jobId = chatStore.backgroundGenerationSnapshot?.jobId {
            chatStore.openBackgroundGeneration(jobId)
        } else if chatStore.canShowLivePreview {
            chatStore.openLivePipelinePreview()
        } else if chatStore.hasLastPreview {
            chatStore.reopenLastPreview()
        } else {
            chatStore.openLatestBackgroundGeneration()
        }
    }

    // MARK: - Generation tip plate (shown over blurred chat during generation)

    private var generationTipPlate: some View {
        let isRu = chatStore.preferredResponseLanguageCode() == "ru"
        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 9) {
                Image(systemName: "lightbulb.fill")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundColor(.accentPrimary)
                    .shadow(color: .accentPrimary.opacity(0.45), radius: 8, x: 0, y: 0)
                Text(isRu ? "Совет" : "Tip")
                    .font(.system(size: 14, weight: .bold, design: .rounded))
                    .foregroundColor(.white.opacity(0.82))
                Spacer(minLength: 8)
                Button {
                    withAnimation(.easeInOut(duration: 0.25)) {
                        isTipPanelVisible = false
                    }
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(.white.opacity(0.62))
                        .padding(6)
                        .background(Color.white.opacity(0.001)) // enlarge hit area
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Hide tips")
            }
            Text(generationTips[generationTipIndex % generationTips.count])
                .font(.system(size: 15, weight: .semibold, design: .rounded))
                .foregroundColor(.white)
                .lineLimit(3)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
                .transition(.opacity.combined(with: .move(edge: .trailing)))
                .id(generationTipIndex)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [
                            Color.brandNight.opacity(0.88),
                            Color.brandViolet.opacity(0.70),
                            Color.brandNight.opacity(0.82)
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
        )
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .strokeBorder(Color.white.opacity(0.18), lineWidth: 1)
        )
        .shadow(color: .accentPrimary.opacity(0.16), radius: 18, x: 0, y: 8)
        .shadow(color: .black.opacity(0.20), radius: 14, x: 0, y: 8)
        .padding(.horizontal, 16)
        .padding(.top, 10)
        .animation(.easeInOut(duration: 0.4), value: generationTipIndex)
    }

    private var generationTipReopenPill: some View {
        Button {
            withAnimation(.easeInOut(duration: 0.25)) {
                isTipPanelVisible = true
            }
        } label: {
            HStack(spacing: 4) {
                Image(systemName: "lightbulb.fill")
                    .font(.system(size: 11, weight: .semibold))
                Text(chatStore.preferredResponseLanguageCode() == "ru" ? "Советы" : "Tips")
                    .font(.system(size: 12, weight: .semibold, design: .rounded))
            }
            .foregroundColor(.white)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(
                Capsule()
                    .fill(
                        LinearGradient(
                            colors: [Color.brandNight.opacity(0.82), Color.brandViolet.opacity(0.62)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
            )
            .background(.ultraThinMaterial, in: Capsule())
            .overlay(Capsule().strokeBorder(Color.white.opacity(0.18), lineWidth: 1))
            .shadow(color: .black.opacity(0.18), radius: 8, x: 0, y: 4)
        }
        .buttonStyle(.plain)
        .padding(.top, 10)
        .padding(.trailing, 16)
        .accessibilityLabel("Show tips")
    }

    private var messageList: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 14) {
                    if chatStore.isLoadingOlderMessages {
                        ProgressView()
                            .tint(.accentPrimary)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 8)
                    } else if chatStore.hasMoreMessages {
                        Color.clear
                            .frame(height: 1)
                            .onAppear { chatStore.loadOlderMessages() }
                    }

                    ForEach(chatStore.messages) { msg in
                        MessageBubble(
                            message: msg,
                            contentSubcategory: chatStore.contentSubcategory,
                            presets: msg.id == "welcome" ? chatStore.welcomePresets : nil,
                            showsExpertisePicker: msg.id == "welcome" && chatStore.preferredFlow == .smartInterview,
                            onQuickReply: { chatStore.sendQuickReply($0) },
                            onPresetSelect: { chatStore.sendPreset($0) },
                            onExpertiseSelect: { chatStore.selectExpertiseLevelFromChat($0) },
                            onGenerate: { chatStore.confirmGeneration() },
                            onChangePlan: {
                                inputText = ""
                                isInputFocused = true
                            },
                            onExportBrief: { chatStore.exportBrief() },
                            onConvertToTasks: { chatStore.convertToTaskList() },
                            onConfirmWeaponColors: { p, a, g in
                                chatStore.confirmWeaponColors(primary: p, accent: a, glow: g)
                            },
                            onLinkAction: { chatStore.handleLinkAction($0) },
                            showsPlanActions: chatStore.shouldShowPlanActions,
                            languageCode: chatStore.preferredResponseLanguageCode()
                        )
                        .id(msg.id)
                    }

                    if chatStore.isLoading {
                        HStack(spacing: 10) {
                            ProgressView()
                                .tint(.accentPrimary)
                            Text("Thinking through the next step...")
                                .font(.appCaption)
                                .foregroundColor(.textSecondary)
                        }
                        .padding(14)
                        .background(Color.cardBackground)
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                    }
                }
                .padding(16)
            }
            // Bug: `.interactively` on a ScrollView with many chat messages causes main-thread
            // contention during keyboard animation → visible freeze on input focus.
            // `.immediately` keeps the "dismiss keyboard on scroll" UX without the interactive
            // tracking that triggers the hang.
            .scrollDismissesKeyboard(.immediately)
            .onTapGesture { dismissKeyboard() }
            .onChange(of: chatStore.messages.count) {
                if let last = chatStore.messages.last {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        proxy.scrollTo(last.id, anchor: .bottom)
                    }
                }
            }
        }
    }

    private var trailingToolbarContent: some View {
        HStack(spacing: 8) {
            HStack(spacing: 4) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 12))
                    .foregroundColor(.textTertiary)
                TextField(chatStore.preferredResponseLanguageCode() == "ru" ? "Поиск..." : "Search...", text: $searchText)
                    .font(.system(size: 13))
                    .frame(width: 80)
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 5)
            .background(Color.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: 10))

            Menu {
                // Bug 16: НЕ размещаем PhotosPicker внутри Menu напрямую — Menu закрывается
                // раньше, чем PhotosPicker успевает открыть sheet. Вместо этого — Button,
                // который выставляет флаг, а сам PhotosPicker цепляется модификатором
                // .photosPicker(isPresented:) на root view (см. ниже возле .fileImporter).
                Button { isShowingPhotoPicker = true } label: {
                    Label("Choose Photo", systemImage: "photo")
                }
                Button { isImportingFile = true } label: {
                    Label("Attach File", systemImage: "doc")
                }
                Button { isShowingLinkPrompt = true } label: {
                    Label("Attach Link", systemImage: "link")
                }
            } label: {
                Image(systemName: "paperclip.circle.fill")
                    .font(.system(size: 24))
                    .foregroundColor(.accentPrimary)
            }
        }
    }

    @ViewBuilder
    private func previewSheetContent(for preview: ChatStore.PreviewPayload) -> some View {
        // Session 389 — viralChatDispatch (fitting_room) emits PNG artifacts
        // tagged with metadata.kind="fitting_room" + metadata.generationId.
        // ChatStore.makePreviewPayload routes those into preview.viralKind /
        // preview.viralGenerationId. Open the dress-up bridge instead of the
        // generic pipeline preview.
        if preview.viralKind == "fitting_room", let genId = preview.viralGenerationId, !genId.isEmpty {
            NavigationStack {
                FittingRoomChatBridge(generationId: genId)
            }
        } else if preview.viralKind == "disaster_spawner", let genId = preview.viralGenerationId, !genId.isEmpty {
            // Session 385 round 7 — Disaster Spawner chat-flow result.
            // Bridge fetches the persisted DisasterGenerationDoc via
            // /api/viral-generations/:id, drives DisasterSpawnerStudio
            // into .result, renders DisasterSpawnerResultView (poster +
            // rarity/difficulty/players badges + Lua viewer + share-poster)
            // instead of the generic Content Project Pipeline preview.
            NavigationStack {
                DisasterSpawnerChatBridge(generationId: genId)
            }
        } else if preview.viralKind == "voice_aura", let genId = preview.viralGenerationId, !genId.isEmpty {
            // Session 388 round 2 — voice_aura routes to the polished
            // VoiceAuraResultView via VoiceAuraChatBridge instead of the
            // generic GenerationPreviewView (which would show 9 empty
            // pipeline stages and no aura preview).
            NavigationStack {
                VoiceAuraChatBridge(generationId: genId)
            }
        } else if preview.viralKind == "cursed_ugc", let genId = preview.viralGenerationId, !genId.isEmpty {
            // Session 390 round 2 — cursed_ugc routes to the rich
            // CursedUGCResultView via CursedUGCChatBridge instead of the
            // generic 9-stage Content Project Pipeline preview. Bridge
            // fetches the persisted CursedUGCGenerationDoc via
            // /api/viral-generations/:id, drives CursedUGCStudio into
            // .result, renders the marketplace card with 3D mesh viewer.
            NavigationStack {
                CursedUGCChatBridge(generationId: genId)
            }
        } else if preview.viralKind == "glowup", let genId = preview.viralGenerationId, !genId.isEmpty {
            // Session 395 — Avatar Glow-Up routes to the rich GlowupResultView
            // (preview render + shirt/pants/decal asset pack + catalog items +
            // upload steps + share) via GlowupChatBridge instead of the generic
            // 9-stage Content Project Pipeline preview. Bridge fetches the
            // persisted GlowupGenerationDoc via /api/viral-generations/:id and
            // drives GlowupStudio into .result. (Bridge inlined in
            // GlowupStudioView.swift.)
            NavigationStack {
                GlowupChatBridge(generationId: genId)
            }
        } else if preview.viralKind == "outfit", let genId = preview.viralGenerationId, !genId.isEmpty {
            // Session 395 — 1-Click Outfit Generator routes to the rich
            // OutfitResultView (hero render + slot cards + total cost + savings
            // + catalog deep-links + share) via OutfitChatBridge instead of the
            // generic pipeline preview. Bridge fetches the persisted
            // OutfitGenerationDoc via /api/viral-generations/:id and drives
            // OutfitStudio into .result. (Bridge inlined in OutfitStudioView.swift.)
            NavigationStack {
                OutfitChatBridge(generationId: genId)
            }
        } else {
            defaultPreviewSheetContent(for: preview)
        }
    }

    private func defaultPreviewSheetContent(for preview: ChatStore.PreviewPayload) -> some View {
        NavigationStack {
            GenerationPreviewView(
                title: preview.title,
                artifactType: preview.artifactType,
                onExport: {
                    exportGuide = exportGuide(for: preview)
                },
                onExportGLB: preview.glbDownloadURL != nil ? {
                    exportGuide = ExportGuide(
                        fileName: preview.title.replacingOccurrences(of: " ", with: "-").lowercased(),
                        fileType: "glb",
                        downloadURL: preview.glbDownloadURL,
                        jobId: chatStore.lastJobId
                    )
                } : nil,
                onExportRBXM: preview.rbxmDownloadURL != nil ? {
                    exportGuide = ExportGuide(
                        fileName: preview.title.replacingOccurrences(of: " ", with: "-").lowercased(),
                        fileType: preview.exportFileType,
                        downloadURL: preview.rbxmDownloadURL,
                        clothingTexturePngURL: preview.clothingTexturePngURL,
                        isAnimation: chatStore.contentSubcategory == "animations",
                        jobId: chatStore.lastJobId
                    )
                } : nil,
                onExportFBX: preview.fbxDownloadURL != nil ? {
                    exportGuide = ExportGuide(
                        fileName: preview.title.replacingOccurrences(of: " ", with: "-").lowercased(),
                        fileType: "fbx",
                        downloadURL: preview.fbxDownloadURL,
                        jobId: chatStore.lastJobId
                    )
                } : nil,
                isGeneratingContent: chatStore.canShowLivePreview,
                publishContext: preview.artifactIds.isEmpty ? nil : .init(
                    description: preview.shareDescription,
                    artifactIds: preview.artifactIds,
                    projectKind: chatStore.projectKind.rawValue.lowercased(),
                    existingProjectId: chatStore.lastPublishedProjectId,
                    previewImageURLs: preview.artifactType.previewImageURLs,
                    onPublished: { projectId in
                        chatStore.onProjectPublished(projectId: projectId)
                    }
                ),
                onApproveConcept: chatStore.isAwaitingConceptApproval ? {
                    chatStore.approveConcept()
                } : nil,
                onRegenerateConcept: chatStore.isAwaitingConceptApproval ? { feedback in
                    chatStore.regenerateConcept(feedback: feedback)
                } : nil,
                isProcessingConceptAction: chatStore.isProcessingConceptAction,
                approveConceptButtonLabel: chatStore.conceptApproveButtonLabel,
                heroConcepts: chatStore.heroConcepts,
                onToggleHeroConcept: chatStore.isAwaitingHeroApproval ? { index in
                    chatStore.toggleHeroConceptApproval(at: index)
                } : nil,
                onApproveHeroConcepts: chatStore.isAwaitingHeroApproval ? {
                    chatStore.approveAllHeroConcepts()
                } : nil,
                onRegenerateHeroConcept: chatStore.isAwaitingHeroApproval ? { index, feedback in
                    chatStore.regenerateHeroConcept(at: index, feedback: feedback)
                } : nil,
                trendingShowcaseItems: preview.trendingShowcaseItems,
                trendingShowcaseCategory: preview.trendingShowcaseCategory,
                decalCandidates: chatStore.pendingDecalCandidates,
                onApproveDecals: chatStore.pendingDecalCandidates.isEmpty ? nil : { approvedSlotIds in
                    chatStore.submitDecalApproval(approvedSlotIds: approvedSlotIds)
                },
                isSubmittingDecalApproval: chatStore.isSubmittingDecalApproval
            )
            .sheet(item: $exportGuide) { guide in
                ExportView(
                    fileName: guide.fileName,
                    fileType: guide.fileType,
                    downloadURL: guide.downloadURL,
                    clothingTexturePngURL: guide.clothingTexturePngURL,
                    isAnimation: guide.isAnimation,
                    jobId: guide.jobId,
                    generatedSystems: guide.generatedSystems,
                    isLayeredClothing: guide.isLayeredClothing,
                    onDismiss: { exportGuide = nil }
                )
            }
        }
    }

    private var fileImportContentTypes: [UTType] {
        [
            .text, .json, .image, .audio,
            UTType(filenameExtension: "lua") ?? .sourceCode,
            UTType(filenameExtension: "glb") ?? .data,
            UTType(filenameExtension: "obj") ?? .data,
            UTType(filenameExtension: "fbx") ?? .data,
            UTType(filenameExtension: "rbxm") ?? .data,
            UTType(filenameExtension: "rbxl") ?? .data,
            UTType(filenameExtension: "mp3") ?? .audio,
            UTType(filenameExtension: "ogg") ?? .audio,
            UTType(filenameExtension: "wav") ?? .audio,
            UTType(filenameExtension: "m4a") ?? .audio,
            UTType(filenameExtension: "aac") ?? .audio,
            UTType(filenameExtension: "flac") ?? .audio,
            UTType(filenameExtension: "mid") ?? .audio,
        ]
    }

    private func handleFileImport(_ result: Result<[URL], Error>) {
        switch result {
        case .success(let urls):
            guard let url = urls.first else { return }
            do {
                let didAccess = url.startAccessingSecurityScopedResource()
                defer {
                    if didAccess {
                        url.stopAccessingSecurityScopedResource()
                    }
                }
                let data = try Data(contentsOf: url)
                let ext = url.pathExtension.lowercased()
                if ["png", "jpg", "jpeg", "heic"].contains(ext) {
                    // Session 187: route Attach File → image through the same off-main
                    // downsample + pending-chip pipeline used by PhotosPicker.
                    let originalData = data
                    let originalExt = ext
                    Task.detached(priority: .userInitiated) {
                        guard let pair = ImageDownsampler.downsampleAndEncode(
                            data: originalData, maxPixel: 1024, quality: 0.8
                        ) else {
                            await MainActor.run {
                                chatStore.presentAttachmentError("I couldn't read that image file.")
                            }
                            return
                        }
                        let (image, jpeg) = pair
                        let key = UUID().uuidString
                        ChatImageCache.shared.set(image, for: key)
                        await MainActor.run {
                            chatStore.attachImageReference(
                                data: jpeg,
                                fileName: url.lastPathComponent,
                                mimeType: originalExt == "png" ? "image/jpeg" : "image/jpeg",
                                localImageKey: key
                            )
                        }
                    }
                } else if let audioMime = audioMimeType(for: ext) {
                    chatStore.ingestFile(data: data, fileName: url.lastPathComponent, mimeType: audioMime)
                } else {
                    chatStore.ingestFile(data: data, fileName: url.lastPathComponent, mimeType: ext == "json" ? "application/json" : "text/plain")
                }
            } catch {
                fileImportError = "Could not read file: \(error.localizedDescription)"
            }
        case .failure:
            break
        }
    }

    private func audioMimeType(for ext: String) -> String? {
        switch ext {
        case "mp3": return "audio/mpeg"
        case "wav": return "audio/wav"
        case "ogg": return "audio/ogg"
        case "m4a": return "audio/mp4"
        case "aac": return "audio/aac"
        case "flac": return "audio/flac"
        case "mid", "midi": return "audio/midi"
        default: return nil
        }
    }

    private var composer: some View {
        VStack(spacing: 12) {
            if entryMode == .voice {
                voiceComposer
            } else {
                textComposer
            }

            if let voiceStatusText = chatStore.voiceStatusText, !voiceStatusText.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    if voiceStatusText.hasPrefix("Transcribing: ") {
                        let transcribedText = String(voiceStatusText.dropFirst("Transcribing: ".count))
                        HStack(spacing: 6) {
                            ProgressView()
                                .scaleEffect(0.7)
                            Text("Transcribing...")
                                .font(.appCaption)
                                .foregroundColor(.textSecondary)
                        }
                        Text(transcribedText)
                            .font(.appBody)
                            .foregroundColor(.textPrimary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(10)
                            .background(Color.accentPrimary.opacity(0.08))
                            .cornerRadius(10)
                    } else {
                        HStack {
                            Text(voiceStatusText)
                                .font(.appCaption)
                                .foregroundColor(.textSecondary)
                            Spacer()
                            if chatStore.voicePhase == .failed {
                                Button("Retry") {
                                    chatStore.retryPendingVoiceTranscription()
                                }
                                .font(.appCaption)
                                .foregroundColor(.accentPrimary)
                            }
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 10)
        .padding(.bottom, 10)
        .background(Color.dockSurface)
    }

    private var voiceComposer: some View {
        let lang = chatStore.preferredResponseLanguageCode()
        return VStack(spacing: 10) {
            HStack(spacing: 8) {
                Text(Self.localized("voiceChat", lang: lang))
                    .font(.appHeadline)
                    .foregroundColor(.textPrimary)
                Spacer()
                aiSettingsButton
            }

            pendingAttachmentChip

            // Single chat input row: text field, prominent mic CTA, send.
            // Mic stays primary (44pt gradient circle with glow — same visual
            // language as the overlay's big mic, but inline-sized) so the
            // user sees a clear "tap to speak" affordance without dead
            // vertical space around it. Send is the smaller secondary action.
            HStack(spacing: 10) {
                TextField(
                    isInputFocused
                        ? Self.localized("whatToChange", lang: lang)
                        : Self.localized("addDetailsInText", lang: lang),
                    text: $inputText,
                    axis: .vertical
                )
                    .focused($isInputFocused)
                    .lineLimit(1...5)
                    .font(.appBody)
                    .padding(14)
                    .background(Color.cardBackground)
                    .clipShape(RoundedRectangle(cornerRadius: 20))
                    .foregroundColor(.textPrimary)
                    .submitLabel(.send)
                    .onSubmit { sendIfNeeded() }

                inlineMicButton(lang: lang)

                Button(action: sendIfNeeded) {
                    Image(systemName: "paperplane.circle.fill")
                        .font(.system(size: 30))
                        .foregroundColor(sendButtonEnabled ? .textSecondary : .textSecondary.opacity(0.35))
                }
                .disabled(!sendButtonEnabled)
            }

            generateForMeButton
        }
    }

    private func inlineMicButton(lang: String) -> some View {
        Button {
            isInputFocused = false
            withAnimation(.easeInOut(duration: 0.25)) {
                voiceOverlayActive = true
            }
        } label: {
            ZStack {
                Circle()
                    .fill(Color.micButtonGlow)
                    .frame(width: 52, height: 52)
                    .blur(radius: 8)
                    .opacity(0.7)
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [Color.accentPrimary, Color.brandElectricBlue],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 44, height: 44)
                    .shadow(color: .accentPrimary.opacity(0.45), radius: 6, x: 0, y: 3)
                Image(systemName: "mic.fill")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundColor(.white)
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(Self.localized("startRecording", lang: lang)))
    }

    private var textComposer: some View {
        let isRu = chatStore.preferredResponseLanguageCode() == "ru"
        return VStack(spacing: 10) {
            HStack(spacing: 8) {
                Text(isRu ? "Текстовый чат" : "Text Chat")
                    .font(.appHeadline)
                    .foregroundColor(.textPrimary)
                Spacer()
                aiSettingsButton
            }

            pendingAttachmentChip

            HStack(spacing: 12) {
                TextField(
                    isInputFocused
                        ? (isRu ? "Что нужно изменить?" : "What would you like to change?")
                        : (isRu ? "Опишите, что нужно сгенерировать..." : "Describe what you want to generate..."),
                    text: $inputText,
                    axis: .vertical
                )
                    .focused($isInputFocused)
                    .lineLimit(1...5)
                    .font(.appBody)
                    .padding(14)
                    .background(Color.cardBackground)
                    .clipShape(RoundedRectangle(cornerRadius: 20))
                    .foregroundColor(.textPrimary)
                    .submitLabel(.send)
                    .onSubmit { sendIfNeeded() }

                Button(action: sendIfNeeded) {
                    Image(systemName: "paperplane.circle.fill")
                        .font(.system(size: 33))
                        .foregroundColor(sendButtonEnabled ? .textSecondary : .textSecondary.opacity(0.35))
                }
                .disabled(!sendButtonEnabled)
            }

            generateForMeButton
        }
    }

    /// Send button is enabled when:
    /// - text is non-empty, OR
    /// - a ready image is attached (it can be sent solo with a generated brief).
    /// While an image upload is in flight (`.uploading`) Send stays disabled even
    /// if text is typed — otherwise the message would arrive without the image URL.
    private var sendButtonEnabled: Bool {
        if let pending = chatStore.pendingAttachment {
            return pending.uploadState == .ready
        }
        return !inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    /// Chip shown above the input bar while an image is staged. Three states:
    /// uploading (spinner), ready (✓), failed (warning). × always cancels.
    @ViewBuilder
    private var pendingAttachmentChip: some View {
        if let pending = chatStore.pendingAttachment {
            HStack(spacing: 10) {
                Group {
                    if let image = ChatImageCache.shared.image(for: pending.localImageKey) {
                        Image(uiImage: image)
                            .resizable()
                            .scaledToFill()
                    } else {
                        Color.cardBackground
                    }
                }
                .frame(width: 44, height: 44)
                .clipShape(RoundedRectangle(cornerRadius: 8))

                VStack(alignment: .leading, spacing: 2) {
                    Text(pending.fileName)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(.textPrimary)
                        .lineLimit(1)
                    switch pending.uploadState {
                    case .uploading:
                        HStack(spacing: 6) {
                            ProgressView().scaleEffect(0.7)
                            Text("Uploading reference…")
                                .font(.system(size: 12))
                                .foregroundColor(.textSecondary)
                        }
                    case .ready:
                        Text("Reference attached. Type your prompt and send.")
                            .font(.system(size: 12))
                            .foregroundColor(.textSecondary)
                            .lineLimit(2)
                    case .failed(let message):
                        Text(message)
                            .font(.system(size: 12))
                            .foregroundColor(.red)
                            .lineLimit(2)
                    }
                }

                Spacer(minLength: 0)

                Button {
                    chatStore.clearPendingAttachment()
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 20))
                        .foregroundColor(.textSecondary)
                }
                .buttonStyle(.plain)
            }
            .padding(8)
            .background(Color.cardBackground.opacity(0.7))
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }

    private var aiSettingsButton: some View {
        Button {
            isShowingProviderSheet = true
        } label: {
            HStack(spacing: 4) {
                Image(systemName: "cpu")
                    .font(.system(size: 11, weight: .semibold))
                Text(chatStore.selectedLLMProvider.title)
                    .font(.system(size: 12, weight: .semibold, design: .rounded))
                if let assetGeneratorTitle = chatStore.selectedAssetGeneratorTitle {
                    Text("+ \(assetGeneratorTitle)")
                        .font(.system(size: 11, weight: .medium, design: .rounded))
                        .foregroundColor(.textSecondary)
                }
                Image(systemName: "chevron.down")
                    .font(.system(size: 9, weight: .bold))
            }
            .foregroundColor(.accentPrimary)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(Color.accentPrimary.opacity(0.1))
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .sheet(isPresented: $isShowingProviderSheet) {
            providerSelectionSheet
        }
        // Session 001 (Track 1) — Marketplace handoff sheet for completed classic
        // clothing generations. Triggered by ChatStore.openMarketplaceHandoff()
        // (called from the "📦 Publish to Marketplace" quick reply).
        .sheet(item: $chatStore.marketplaceHandoffContext) { ctx in
            MarketplaceHandoffView(context: ctx) {
                chatStore.marketplaceHandoffContext = nil
            }
        }
    }

    private var providerSelectionSheet: some View {
        VStack(spacing: 0) {
            ZStack {
                Text("AI Settings")
                    .font(.system(size: 22, weight: .black, design: .rounded))
                    .foregroundColor(.white)
                    .shadow(color: .black.opacity(0.22), radius: 8, x: 0, y: 3)

                HStack {
                    Spacer()
                    Button {
                        isShowingProviderSheet = false
                    } label: {
                        Text("Done")
                            .font(.system(size: 16, weight: .black, design: .rounded))
                            .foregroundColor(.white)
                            .padding(.horizontal, 20)
                            .padding(.vertical, 12)
                            .background(.ultraThinMaterial, in: Capsule())
                            .overlay(Capsule().strokeBorder(Color.white.opacity(0.18), lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 24)
            .padding(.top, 20)
            .padding(.bottom, 18)

            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 18) {
                    providerSettingsSection(title: "AI Chat Model") {
                        VStack(spacing: 0) {
                            ForEach(ChatStore.LLMProvider.allCases) { provider in
                                providerOptionRow(
                                    title: provider.title,
                                    subtitle: llmSubtitle(provider),
                                    isSelected: chatStore.selectedLLMProvider == provider
                                ) {
                                    chatStore.setLLMProvider(provider)
                                }
                            }
                        }
                    }

                    if chatStore.contentSubcategory == "audio" {
                        providerSettingsSection(title: "Audio Generator") {
                            VStack(spacing: 0) {
                                ForEach(ChatStore.AudioProvider.allCases) { provider in
                                    providerOptionRow(
                                        title: provider.title,
                                        subtitle: audioSubtitle(provider),
                                        isSelected: chatStore.selectedAudioProvider == provider
                                    ) {
                                        chatStore.setAudioProvider(provider)
                                    }
                                }
                            }
                        }
                    } else if chatStore.projectKind == .content || chatStore.projectKind == .ugc {
                        providerSettingsSection(title: "3D Model Generator") {
                            VStack(spacing: 0) {
                                ForEach(ChatStore.MeshProvider.allCases) { provider in
                                    providerOptionRow(
                                        title: provider.title,
                                        subtitle: meshSubtitle(provider),
                                        isSelected: chatStore.selected3DProvider == provider
                                    ) {
                                        chatStore.set3DProvider(provider)
                                    }
                                }
                            }
                        }
                    }
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 34)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(providerSheetBackground.ignoresSafeArea())
        .presentationDetents([.medium])
        .presentationDragIndicator(.visible)
    }

    private var providerSheetBackground: some View {
        ZStack {
            LinearGradient(
                colors: [
                    Color.brandNight.opacity(0.98),
                    Color.brandViolet.opacity(0.88),
                    Color.brandNight.opacity(0.96)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            Circle()
                .fill(Color.accentPrimary.opacity(0.30))
                .frame(width: 260, height: 260)
                .blur(radius: 56)
                .offset(x: -150, y: 260)
            Circle()
                .fill(Color.accentPink.opacity(0.22))
                .frame(width: 220, height: 220)
                .blur(radius: 60)
                .offset(x: 160, y: -170)
            Rectangle()
                .fill(.ultraThinMaterial)
                .opacity(0.30)
        }
    }

    private func providerSettingsSection<Content: View>(
        title: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(.system(size: 15, weight: .black, design: .rounded))
                .foregroundColor(.white.opacity(0.70))
                .padding(.horizontal, 6)

            VStack(spacing: 0) {
                content()
            }
            .background(
                RoundedRectangle(cornerRadius: 26, style: .continuous)
                    .fill(Color.white.opacity(0.10))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 26, style: .continuous)
                    .strokeBorder(Color.white.opacity(0.14), lineWidth: 1)
            )
            .shadow(color: .black.opacity(0.18), radius: 18, x: 0, y: 10)
        }
    }

    private func providerOptionRow(
        title: String,
        subtitle: String,
        isSelected: Bool,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 14) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(title)
                        .font(.system(size: 17, weight: .black, design: .rounded))
                        .foregroundColor(.white)
                    Text(subtitle)
                        .font(.system(size: 13, weight: .semibold, design: .rounded))
                        .foregroundColor(.white.opacity(0.58))
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                ZStack {
                    Circle()
                        .fill(isSelected ? Color.accentPrimary : Color.white.opacity(0.10))
                    if isSelected {
                        Image(systemName: "checkmark")
                            .font(.system(size: 13, weight: .black))
                            .foregroundColor(.brandNight)
                    }
                }
                .frame(width: 30, height: 30)
                .overlay(
                    Circle()
                        .strokeBorder(isSelected ? Color.white.opacity(0.30) : Color.white.opacity(0.14), lineWidth: 1)
                )
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 15)
            .contentShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
            .background(
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .fill(isSelected ? Color.accentPrimary.opacity(0.16) : Color.clear)
            )
        }
        .buttonStyle(.plain)
    }

    private func llmSubtitle(_ provider: ChatStore.LLMProvider) -> String {
        switch provider {
        case .gemini: return "Google — fast, multimodal"
        case .anthropic: return "Anthropic — precise reasoning"
        case .openai: return "OpenAI — versatile, popular"
        }
    }

    private func audioSubtitle(_ provider: ChatStore.AudioProvider) -> String {
        switch provider {
        case .fal: return "Stable Audio — sound effects & ambience"
        case .suno: return "Suno — AI music tracks"
        }
    }

    private func meshSubtitle(_ provider: ChatStore.MeshProvider) -> String {
        switch provider {
        case .meshy: return "Meshy v6 — fast text-to-3D"
        case .hunyuan3d: return "Hunyuan3D v3 — high detail"
        }
    }

    @ViewBuilder
    private var generateForMeButton: some View {
        // Hidden for Voice-to-Fix / Analyze — those are conversational, nothing to "generate".
        if chatStore.projectKind != .fix && chatStore.projectKind != .analyze {
            let isRu = chatStore.preferredResponseLanguageCode() == "ru"
            Button {
                let text = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
                let prompt = text.isEmpty
                    ? (isRu ? "Сгенерируй лучший вариант с учётом текущих игровых трендов и лучших практик" : "Generate the best version using current gaming trends and best practices")
                    : text
                chatStore.sendSkipInterview(prompt)
                inputText = ""
                dismissKeyboard()
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "bolt.fill")
                        .font(.system(size: 12, weight: .bold))
                    Text(isRu ? "Быстрая генерация" : "Quick Generate")
                        .font(.system(size: 13, weight: .bold, design: .rounded))
                }
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
                .background(
                    LinearGradient(
                        colors: [.accentPrimary, .accentPrimary.opacity(0.8)],
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                )
                .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            .buttonStyle(.plain)
            .disabled(chatStore.isLoading)
            .opacity(chatStore.isLoading ? 0.5 : 1.0)
        }
    }

    private func sendIfNeeded() {
        let text = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        // Session 187: when an image is attached and ready, send IT (with the
        // typed text as the visual brief). Empty text is OK in that case —
        // sendWithPendingAttachment provides a generic fallback prompt.
        if let pending = chatStore.pendingAttachment, pending.uploadState == .ready {
            chatStore.sendWithPendingAttachment(text)
            inputText = ""
            dismissKeyboard()
            return
        }
        guard !text.isEmpty else { return }
        chatStore.sendText(text)
        inputText = ""
        dismissKeyboard()
    }

    private func dismissKeyboard() {
        isInputFocused = false
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    }

    private func saveToHistory() {
        guard chatStore.messages.count > 1 else {
            print("[SaveChat] SKIP — messages.count=\(chatStore.messages.count) sessionId=\(sessionId) currentThread=\(chatStore.currentThread?.id ?? "nil")")
            return
        }
        let lastPreview = chatStore.messages.last(where: { $0.role == .user })?.content
            ?? chatStore.messages.last?.content
            ?? ""
        let store = ChatHistoryStore.shared
        let historySessionId = effectiveHistorySessionId
        print("[SaveChat] writing id=\(historySessionId) messages=\(chatStore.messages.count) lastJobId=\(chatStore.lastJobId ?? "nil") sessionId=\(sessionId) currentThread=\(chatStore.currentThread?.id ?? "nil")")
        store.saveSession(
            id: historySessionId,
            title: customTitle,
            category: welcomeContext ?? chatStore.projectKind.rawValue,
            projectKind: chatStore.projectKind,
            chatMode: entryMode,
            messageCount: chatStore.messages.count,
            lastMessagePreview: lastPreview,
            lastJobId: chatStore.lastJobId,
            contentSubcategory: chatStore.contentSubcategory,
            generationStatus: chatStore.historyGenerationStatus
        )
        store.saveMessages(chatStore.messages, for: historySessionId)
    }

    private func exportGuide(for preview: ChatStore.PreviewPayload) -> ExportGuide {
        let isAnim = chatStore.contentSubcategory == "animations"
        return ExportGuide(
            fileName: preview.title.replacingOccurrences(of: " ", with: "-").lowercased(),
            fileType: preview.exportFileType,
            downloadURL: preview.downloadURL,
            isAnimation: isAnim,
            jobId: chatStore.lastJobId,
            generatedSystems: preview.notes,
            isLayeredClothing: chatStore.isLayeredClothingResult
        )
    }
}

private struct MessageBubble: View {
    let message: ChatMessage
    let contentSubcategory: String?
    let presets: [ChatPreset]?
    let showsExpertisePicker: Bool
    let onQuickReply: (String) -> Void
    let onPresetSelect: (ChatPreset) -> Void
    let onExpertiseSelect: (ExpertiseLevel) -> Void
    let onGenerate: () -> Void
    let onChangePlan: () -> Void
    let onExportBrief: () -> Void
    let onConvertToTasks: () -> Void
    var onConfirmWeaponColors: ((String, String, String) -> Void)? = nil
    /// Session 382 Variant 2 — taps on native action buttons rendered below
    /// the bubble (Fake Headless & Korblox: per-item "Open in Roblox" + Save
    /// Preview + Share Look). Routed back to ChatStore.handleLinkAction.
    var onLinkAction: ((ChatMessage.LinkAction) -> Void)? = nil
    var showsPlanActions: Bool = true
    var languageCode: String = "en"

    private static let audioExcludedKeys: Set<String> = [
        // English
        "Monetization", "Visual Style", "Scale", "Mechanics", "Systems", "Characters", "Data Store", "Theme",
        // Russian (GDDCard labels are localized — keep filter in sync)
        "Монетизация", "Визуальный стиль", "Масштаб", "Механики", "Системы", "Персонажи", "Хранилище данных", "Тема",
    ]

    var body: some View {
        VStack(alignment: message.role == .user ? .trailing : .leading, spacing: 8) {
            HStack(alignment: .top) {
                if message.role == .user { Spacer(minLength: 48) }

                VStack(alignment: .leading, spacing: 8) {
                    if isSystemAssistantMessage {
                        systemMessageBadge
                    }

                    // Bug 17 (v2): Prefer locally-cached UIImage (PhotosPicker flow)
                    // over remote AsyncImage — the latter was failing intermittently
                    // on Firebase Storage signed URLs.
                    if let key = message.localImageKey, let cached = ChatImageCache.shared.image(for: key) {
                        Image(uiImage: cached)
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                            .frame(maxWidth: 240, maxHeight: 240)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                    } else if let imageURL = message.imageURL {
                        // Fallback for restored sessions where the local cache is empty
                        // (cache is in-memory only; survives view transitions but not app restarts).
                        AsyncImage(url: imageURL) { phase in
                            switch phase {
                            case .success(let image):
                                image
                                    .resizable()
                                    .aspectRatio(contentMode: .fill)
                            case .failure:
                                ZStack {
                                    Color.cardBackground
                                    Image(systemName: "photo")
                                        .font(.system(size: 28))
                                        .foregroundColor(.textTertiary)
                                }
                            case .empty:
                                ZStack {
                                    Color.cardBackground
                                    ProgressView()
                                }
                            @unknown default:
                                Color.cardBackground
                            }
                        }
                        .frame(maxWidth: 240, maxHeight: 240)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                    TechnicalText(message.content, baseFont: .appBody, technicalFont: .appTechnical(size: 16, weight: .semibold))
                        .foregroundColor(.textPrimary)
                }
                .padding(14)
                .background(bubbleBackground)
                .clipShape(RoundedRectangle(cornerRadius: 18))
                .overlay(
                    RoundedRectangle(cornerRadius: 18)
                        .stroke(bubbleBorderColor, lineWidth: isSystemAssistantMessage ? 1.4 : 1)
                )
                .overlay(alignment: .leading) {
                    if isSystemAssistantMessage {
                        RoundedRectangle(cornerRadius: 2, style: .continuous)
                            .fill(Color.accentPrimary.opacity(0.76))
                            .frame(width: 3)
                            .padding(.vertical, 14)
                    }
                }

                if message.role == .assistant { Spacer(minLength: 48) }
            }

            if showsExpertisePicker {
                ExpertisePickerBubble(languageCode: languageCode, onSelect: onExpertiseSelect)
                    .padding(.horizontal, 4)
            }

            if let presetList = presets, !presetList.isEmpty {
                PresetCardsView(presets: presetList, onSelect: onPresetSelect)
            } else if let replies = message.quickReplies, !replies.isEmpty {
                QuickReplyChips(
                    options: replies,
                    languageCode: languageCode,
                    style: isSystemAssistantMessage ? .actionButtons : .chips,
                    onSelect: onQuickReply
                )
            }

            if let colors = message.weaponColors {
                WeaponColorPickerBubble(payload: colors) { p, a, g in
                    onConfirmWeaponColors?(p, a, g)
                }
                .padding(.horizontal, 4)
            }

            // Session 382 Variant 2 — native action buttons (per-item "Open
            // in Roblox", Save Preview, Share Look). Tap-routed back into
            // ChatStore.handleLinkAction via the onLinkAction callback.
            if let actions = message.linkActions, !actions.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(actions, id: \.self) { action in
                        Button {
                            onLinkAction?(action)
                        } label: {
                            HStack(spacing: 6) {
                                if let icon = action.systemIcon {
                                    Image(systemName: icon)
                                }
                                Text(action.label)
                                    .font(.appBody)
                                    .lineLimit(1)
                                Spacer()
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .modifier(LinkActionButtonStyleModifier(style: action.style))
                    }
                }
                .padding(.horizontal, 4)
            }

            if let rawRows = message.gddRowTuples {
                let isAudio = contentSubcategory == "audio"
                let lang = languageCode
                let isRu = lang == "ru"
                let rows = isAudio
                    ? rawRows.filter { !Self.audioExcludedKeys.contains($0.0) }
                    : rawRows
                let gddTitle: String = isAudio
                    ? (isRu ? "Аудио-бриф" : "Audio Brief")
                    : contentSubcategory == "npcs"
                        ? (isRu ? "Бриф NPC" : "NPC Brief")
                        : (isRu ? "Документ гейм-дизайна" : "Game Design Document")
                GDDCard(
                    title: gddTitle,
                    rows: rows,
                    onConfirm: onGenerate,
                    onChange: onChangePlan,
                    showsActions: showsPlanActions,
                    language: lang
                )

                // Session 382 — fakeLimited recipes don't have an exportable
                // brief / task-list (it's a one-shot catalog recipe, not a
                // multi-stage GDD). Hide both shortcuts so the bubble stays
                // focused on the per-item Open buttons + Save/Share.
                if showsPlanActions {
                    HStack(spacing: 10) {
                        Button(isRu ? "Экспорт брифа" : "Export Brief", action: onExportBrief)
                        Button(isRu ? "Превратить в задачи" : "Convert to Tasks", action: onConvertToTasks)
                    }
                    .font(.appCaption)
                    .foregroundColor(.accentPrimary)
                }
            }

            if let audioURL = message.audioURL {
                ChatAudioPlayerCard(url: audioURL)
                    .padding(.top, 4)
            }
        }
    }

    private var isSystemAssistantMessage: Bool {
        guard message.role == .assistant,
              message.id != "welcome",
              presets == nil,
              message.gddRowTuples == nil,
              message.weaponColors == nil else {
            return false
        }

        let lower = message.content.lowercased()
        let systemMarkers = [
            "locked.", "i’m generating", "i'm generating", "generating your", "started rendering",
            "needs your review", "render continues", "still rendering", "ready to export",
            "generation stopped", "status check", "connection error", "failed", "open the preview",
            "зафиксировал", "генерирую", "запустил рендер", "ждёт апрув", "ждет апрув",
            "ждёт апрува", "ждет апрува", "рендерится", "готово к экспорту", "нужен фикс",
            "ошибка", "откройте превью"
        ]
        if systemMarkers.contains(where: { lower.contains($0) }) {
            return true
        }

        guard let replies = message.quickReplies, replies.contains(where: isSystemActionReply) else {
            return false
        }
        return [
            "preview", "render", "generation", "export", "jobs",
            "превью", "рендер", "генерац", "экспорт", "задач"
        ].contains(where: { lower.contains($0) })
    }

    private func isSystemActionReply(_ reply: String) -> Bool {
        switch reply.lowercased().trimmingCharacters(in: .whitespacesAndNewlines) {
        case "open preview", "open approval", "view jobs", "open jobs", "retry", "retry generation",
             "start another", "export brief", "regenerate with changes", "open community",
             "открыть превью", "открыть апрув", "открыть задачи", "повторить",
             "повторить генерацию", "начать ещё", "экспорт брифа",
             "перегенерировать с правками", "открыть комьюнити":
            return true
        default:
            return false
        }
    }

    private var systemMessageBadge: some View {
        HStack(spacing: 6) {
            Image(systemName: "info.circle.fill")
                .font(.system(size: 11, weight: .bold))
            Text(languageCode == "ru" ? "Системное сообщение" : "System update")
                .font(.system(size: 11, weight: .bold, design: .rounded))
        }
        .foregroundColor(.accentPrimary)
        .padding(.horizontal, 9)
        .padding(.vertical, 5)
        .background(Color.accentPrimary.opacity(0.11), in: Capsule())
    }

    private var bubbleBackground: Color {
        if message.role == .user {
            return .userBubble
        }
        return isSystemAssistantMessage ? Color.accentPrimary.opacity(0.07) : .assistantBubble
    }

    private var bubbleBorderColor: Color {
        if message.role == .user {
            return Color.bubbleBorder.opacity(0.5)
        }
        return isSystemAssistantMessage ? Color.accentPrimary.opacity(0.36) : Color.bubbleBorder.opacity(0.25)
    }
}

// Session 382 Variant 2 — picks one of three SwiftUI button styles by name
// (avoids running afoul of the ButtonStyle generic system at the call site).
private struct LinkActionButtonStyleModifier: ViewModifier {
    let style: ChatMessage.ButtonStyleKind

    func body(content: Content) -> some View {
        switch style {
        case .prominent: AnyView(content.buttonStyle(.borderedProminent))
        case .bordered:  AnyView(content.buttonStyle(.bordered))
        case .plain:     AnyView(content.buttonStyle(.plain))
        }
    }
}

private struct ExpertisePickerBubble: View {
    let languageCode: String
    let onSelect: (ExpertiseLevel) -> Void
    @AppStorage("expertiseLevel") private var storedExpertise = ExpertiseLevel.beginner.rawValue

    private var isRu: Bool { languageCode == "ru" }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(isRu ? "Уровень интервью" : "Interview level")
                .font(.system(size: 12, weight: .semibold, design: .rounded))
                .foregroundColor(.textTertiary)

            HStack(spacing: 8) {
                ForEach(ExpertiseLevel.allCases) { level in
                    Button {
                        storedExpertise = level.rawValue
                        onSelect(level)
                    } label: {
                        Text(label(for: level))
                            .font(.system(size: 12, weight: .bold, design: .rounded))
                            .foregroundColor(isSelected(level) ? .white : .textPrimary)
                            .lineLimit(1)
                            .minimumScaleFactor(0.75)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 9)
                            .background(isSelected(level) ? Color.accentPrimary : Color.elevatedBackground)
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                            .overlay(
                                RoundedRectangle(cornerRadius: 8)
                                    .stroke(Color.bubbleBorder.opacity(isSelected(level) ? 0 : 0.35), lineWidth: 1)
                            )
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(12)
        .background(Color.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color.accentPrimary.opacity(0.18), lineWidth: 1)
        )
    }

    private func isSelected(_ level: ExpertiseLevel) -> Bool {
        (ExpertiseLevel(rawValue: storedExpertise) ?? .beginner) == level
    }

    private func label(for level: ExpertiseLevel) -> String {
        switch level {
        case .beginner: return isRu ? "Новичок" : "Beginner"
        case .advanced: return isRu ? "Продвинутый" : "Advanced"
        case .developer: return isRu ? "Разработчик" : "Developer"
        }
    }
}

// MARK: - Inline Chat Audio Player

private final class ChatAudioVM: ObservableObject {
    let player: AVPlayer
    @Published var isPlaying = false
    @Published var currentTime: TimeInterval = 0
    @Published var duration: TimeInterval = 0
    @Published var isReady = false
    private var timeObserver: Any?
    private var cancellables = Set<AnyCancellable>()

    init(url: URL) {
        let item = AVPlayerItem(url: url)
        self.player = AVPlayer(playerItem: item)
        item.publisher(for: \.status)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] status in
                guard let self, status == .readyToPlay else { return }
                let dur = item.duration
                if dur.isNumeric && !dur.isIndefinite { self.duration = CMTimeGetSeconds(dur) }
                self.isReady = true
            }.store(in: &cancellables)
        timeObserver = player.addPeriodicTimeObserver(
            forInterval: CMTime(seconds: 0.25, preferredTimescale: 600), queue: .main
        ) { [weak self] time in
            guard let self else { return }
            self.currentTime = CMTimeGetSeconds(time)
            if self.duration > 0, self.currentTime >= self.duration - 0.1 { self.isPlaying = false }
        }
        NotificationCenter.default.publisher(for: .AVPlayerItemDidPlayToEndTime, object: item)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                self?.isPlaying = false; self?.player.seek(to: .zero); self?.currentTime = 0
            }.store(in: &cancellables)
    }

    func togglePlayPause() {
        if isPlaying { player.pause() } else {
            if currentTime >= duration - 0.1 { player.seek(to: .zero); currentTime = 0 }
            player.play()
        }
        isPlaying.toggle()
    }

    deinit {
        if let t = timeObserver { player.removeTimeObserver(t) }
        player.pause()
    }
}

private struct ChatAudioPlayerCard: View {
    let url: URL
    @StateObject private var vm: ChatAudioVM

    init(url: URL) {
        self.url = url
        _vm = StateObject(wrappedValue: ChatAudioVM(url: url))
    }

    var body: some View {
        HStack(spacing: 12) {
            Button { vm.togglePlayPause() } label: {
                Image(systemName: vm.isPlaying ? "pause.circle.fill" : "play.circle.fill")
                    .font(.system(size: 36))
                    .foregroundColor(.accentPrimary)
                    .contentTransition(.symbolEffect(.replace))
            }
            .disabled(!vm.isReady)
            .opacity(vm.isReady ? 1 : 0.45)

            VStack(alignment: .leading, spacing: 4) {
                if vm.isReady {
                    Slider(
                        value: Binding(get: { vm.currentTime }, set: { vm.player.seek(to: CMTime(seconds: $0, preferredTimescale: 600)); vm.currentTime = $0 }),
                        in: 0...max(vm.duration, 1)
                    ).tint(.accentPrimary)
                    HStack {
                        Text(formatTime(vm.currentTime))
                        Spacer()
                        Text(formatTime(vm.duration))
                    }
                    .font(.system(.caption2, design: .monospaced))
                    .foregroundColor(.textTertiary)
                } else {
                    HStack(spacing: 6) {
                        ProgressView().scaleEffect(0.65)
                        Text("Loading audio…")
                            .font(.appCaption)
                            .foregroundColor(.textSecondary)
                    }
                }
            }
        }
        .padding(12)
        .background(Color.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.accentPrimary.opacity(0.18), lineWidth: 1))
    }

    private func formatTime(_ t: TimeInterval) -> String {
        let m = Int(t) / 60, s = Int(t) % 60
        return String(format: "%d:%02d", m, s)
    }
}

private struct ChatThreadSidebar: View {
    let threads: [ChatStore.ChatThread]
    let currentThread: ChatStore.ChatThread?
    let archivedIds: Set<String>
    let onSelect: (ChatStore.ChatThread) -> Void
    let onRename: (ChatStore.ChatThread) -> Void
    let onSearch: (String) -> Void
    let onArchive: (String) -> Void
    let onUnarchive: (String) -> Void

    enum Grouping: String, CaseIterable {
        case date = "Date"
        case type = "Type"
    }

    enum DateGroup: String, CaseIterable {
        case today = "Today"
        case yesterday = "Yesterday"
        case thisWeek = "This Week"
        case thisMonth = "This Month"
        case older = "Older"

        var sortOrder: Int {
            switch self {
            case .today: return 0
            case .yesterday: return 1
            case .thisWeek: return 2
            case .thisMonth: return 3
            case .older: return 4
            }
        }
    }

    @State private var grouping: Grouping = .date
    @State private var sidebarSearch = ""

    private var activeThreads: [ChatStore.ChatThread] {
        threads.filter { !archivedIds.contains($0.id) }
    }

    private var archivedThreads: [ChatStore.ChatThread] {
        threads.filter { archivedIds.contains($0.id) }
    }

    private var displayedThreads: [ChatStore.ChatThread] {
        let q = sidebarSearch.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !q.isEmpty else { return activeThreads }
        return activeThreads.filter { $0.title.lowercased().contains(q) || $0.promptHint.lowercased().contains(q) }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 4) {
                    // Search field
                    HStack(spacing: 8) {
                        Image(systemName: "magnifyingglass")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundColor(.textSecondary)
                        TextField("Search chats…", text: $sidebarSearch)
                            .font(.system(size: 14, weight: .medium, design: .rounded))
                            .foregroundColor(.textPrimary)
                            .autocorrectionDisabled()
                        if !sidebarSearch.isEmpty {
                            Button { sidebarSearch = "" } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .font(.system(size: 14))
                                    .foregroundColor(.textTertiary)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .background(Color.cardBackground)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .padding(.horizontal, 16)
                    .padding(.bottom, 4)
                    .onChange(of: sidebarSearch) { _, q in onSearch(q) }

                    if sidebarSearch.isEmpty {
                        Picker("Group by", selection: $grouping) {
                            ForEach(Grouping.allCases, id: \.rawValue) { mode in
                                Text(mode.rawValue).tag(mode)
                            }
                        }
                        .pickerStyle(.segmented)
                        .padding(.horizontal, 16)
                        .padding(.bottom, 8)
                    }

                    if !sidebarSearch.isEmpty {
                        // Flat filtered list when searching
                        if displayedThreads.isEmpty {
                            VStack(spacing: 8) {
                                Image(systemName: "magnifyingglass")
                                    .font(.system(size: 28, weight: .light))
                                    .foregroundColor(.textTertiary)
                                Text("No chats matching \"\(sidebarSearch)\"")
                                    .font(.system(size: 14, weight: .medium, design: .rounded))
                                    .foregroundColor(.textSecondary)
                                    .multilineTextAlignment(.center)
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.top, 40)
                        } else {
                            ForEach(displayedThreads) { thread in
                                threadRow(thread)
                            }
                        }
                    } else {
                        switch grouping {
                        case .date:
                            dateGroupedList
                        case .type:
                            typeGroupedList
                        }

                        // Archived section
                        if !archivedThreads.isEmpty {
                            archivedSection
                        }
                    }
                }
                .padding(.top, 8)
            }
            .background(
                LinearGradient(colors: [.gradientTop, .gradientBottom], startPoint: .topLeading, endPoint: .bottomTrailing)
                    .ignoresSafeArea()
            )
            .navigationTitle("Chats")
            .navigationBarTitleDisplayMode(.inline)
        }
        .presentationDetents([.medium, .large])
    }

    private var dateGroupedList: some View {
        let grouped = groupedByDate(activeThreads)
        return ForEach(grouped, id: \.0) { group, items in
            sectionView(title: group.rawValue, threads: items)
        }
    }

    private var typeGroupedList: some View {
        let grouped = groupedByType(activeThreads)
        return ForEach(grouped, id: \.0) { group, items in
            sectionView(title: group.rawValue, threads: items)
        }
    }

    private func sectionView(title: String, threads: [ChatStore.ChatThread]) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title.uppercased())
                .font(.system(size: 12, weight: .bold, design: .rounded))
                .foregroundColor(.textTertiary)
                .padding(.horizontal, 16)
                .padding(.top, 12)

            ForEach(threads) { thread in
                threadRow(thread)
            }
        }
    }

    private func threadRow(_ thread: ChatStore.ChatThread) -> some View {
        Button { onSelect(thread) } label: {
            HStack(spacing: 12) {
                Image(systemName: threadIcon(for: thread.type))
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(currentThread?.id == thread.id ? .white : .accentPrimary)
                    .frame(width: 32, height: 32)

                VStack(alignment: .leading, spacing: 3) {
                    Text(thread.title)
                        .font(.system(size: 14, weight: .bold, design: .rounded))
                        .foregroundColor(currentThread?.id == thread.id ? .white : .textPrimary)
                        .lineLimit(1)
                    HStack(spacing: 6) {
                        Text(thread.promptHint)
                            .font(.system(size: 11, weight: .medium, design: .rounded))
                            .foregroundColor(currentThread?.id == thread.id ? Color.white.opacity(0.78) : .textSecondary)
                            .lineLimit(1)
                        if thread.hasGenerationJob {
                            HStack(spacing: 3) {
                                Image(systemName: "cube.transparent.fill")
                                    .font(.system(size: 8, weight: .bold))
                                Text("Job")
                                    .font(.system(size: 9, weight: .bold, design: .rounded))
                            }
                            .foregroundColor(currentThread?.id == thread.id ? Color.white.opacity(0.92) : ChatStatusPalette.job)
                            .padding(.horizontal, 5)
                            .padding(.vertical, 2)
                            .background((currentThread?.id == thread.id ? Color.white : ChatStatusPalette.job).opacity(0.12), in: Capsule())
                        }
                        Text(thread.updatedAt, style: .relative)
                            .font(.system(size: 11))
                            .foregroundColor(currentThread?.id == thread.id ? Color.white.opacity(0.6) : .textTertiary)
                    }
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(currentThread?.id == thread.id ? Color.white.opacity(0.6) : .textTertiary)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(currentThread?.id == thread.id ? Color.accentPrimary : Color.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .padding(.horizontal, 16)
        }
        .buttonStyle(.plain)
        .contextMenu {
            Button {
                onRename(thread)
            } label: {
                Label("Rename", systemImage: "pencil")
            }
            if archivedIds.contains(thread.id) {
                Button {
                    onUnarchive(thread.id)
                } label: {
                    Label("Unarchive", systemImage: "tray.and.arrow.up")
                }
            } else {
                Button {
                    onArchive(thread.id)
                } label: {
                    Label("Archive", systemImage: "archivebox")
                }
            }
        }
    }

    @State private var showArchived = false

    private var archivedSection: some View {
        VStack(alignment: .leading, spacing: 6) {
            Button {
                withAnimation(.easeInOut(duration: 0.2)) { showArchived.toggle() }
            } label: {
                HStack(spacing: 6) {
                    Text("ARCHIVED".uppercased())
                        .font(.system(size: 12, weight: .bold, design: .rounded))
                        .foregroundColor(.textTertiary)
                    Text("(\(archivedThreads.count))")
                        .font(.system(size: 11, weight: .semibold, design: .rounded))
                        .foregroundColor(.textTertiary)
                    Spacer()
                    Image(systemName: showArchived ? "chevron.up" : "chevron.down")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(.textTertiary)
                }
                .padding(.horizontal, 16)
                .padding(.top, 16)
            }
            .buttonStyle(.plain)

            if showArchived {
                ForEach(archivedThreads) { thread in
                    threadRow(thread)
                        .opacity(0.65)
                }
            }
        }
    }

    private func threadIcon(for type: ChatStore.ThreadType) -> String {
        switch type {
        case .game: return "gamecontroller.fill"
        case .content: return "shippingbox.fill"
        case .other: return "wrench.and.screwdriver.fill"
        }
    }

    // MARK: - Grouping

    private func dateGroup(for date: Date) -> DateGroup {
        let calendar = Calendar.current
        if calendar.isDateInToday(date) { return .today }
        if calendar.isDateInYesterday(date) { return .yesterday }
        let weekAgo = calendar.date(byAdding: .day, value: -7, to: calendar.startOfDay(for: Date()))!
        if date >= weekAgo { return .thisWeek }
        let monthAgo = calendar.date(byAdding: .month, value: -1, to: calendar.startOfDay(for: Date()))!
        if date >= monthAgo { return .thisMonth }
        return .older
    }

    private func groupedByDate(_ threads: [ChatStore.ChatThread]) -> [(DateGroup, [ChatStore.ChatThread])] {
        let dict = Dictionary(grouping: threads) { dateGroup(for: $0.updatedAt) }
        return dict
            .map { ($0.key, $0.value.sorted { $0.updatedAt > $1.updatedAt }) }
            .sorted { $0.0.sortOrder < $1.0.sortOrder }
    }

    private func groupedByType(_ threads: [ChatStore.ChatThread]) -> [(ChatStore.ThreadType, [ChatStore.ChatThread])] {
        let order: [ChatStore.ThreadType] = [.game, .content, .other]
        let dict = Dictionary(grouping: threads) { $0.type }
        return dict
            .map { ($0.key, $0.value.sorted { $0.updatedAt > $1.updatedAt }) }
            .sorted { order.firstIndex(of: $0.0) ?? 99 < order.firstIndex(of: $1.0) ?? 99 }
    }
}

private struct AttachmentButton: View {
    let title: String
    let icon: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Image(systemName: icon)
                Text(title)
            }
            .font(.system(size: 12, weight: .bold, design: .rounded))
            .foregroundColor(.accentPrimary)
            .padding(.horizontal, 12)
            .padding(.vertical, 9)
            .background(Color.cardBackground)
            .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

private struct SystemStatusToast: View {
    let message: String

    var body: some View {
        HStack(spacing: 9) {
            Image(systemName: "wifi.slash")
                .font(.system(size: 13, weight: .bold))
                .foregroundColor(.white)
            Text(message)
                .font(.system(size: 13, weight: .bold, design: .rounded))
                .foregroundColor(.white)
                .lineLimit(2)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(
            Capsule()
                .fill(Color.red.opacity(0.94))
                .shadow(color: .black.opacity(0.18), radius: 10, x: 0, y: 4)
        )
        .padding(.horizontal, 16)
    }
}

private enum ChatStatusPalette {
    static let review = Color.brandViolet
    static let reviewFill = Color.brandViolet.opacity(0.10)
    static let reviewBorder = Color.brandViolet.opacity(0.22)
    static let ready = Color.accentPrimary
    static let readyFill = Color.accentPrimary.opacity(0.10)
    static let job = Color.accentPrimary
}

private struct ThreadGenerationPill: View {
    let snapshot: ChatStore.GenerationStatusSnapshot

    private var tint: Color {
        if snapshot.needsReview { return ChatStatusPalette.review }
        if snapshot.isPartial { return .accentOrange }
        if snapshot.isReady { return ChatStatusPalette.ready }
        if snapshot.isFailed { return .red }
        return .accentPrimary
    }

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: snapshot.iconName)
                .font(.system(size: 9, weight: .bold))
            Text(snapshot.statusLabel)
                .font(.system(size: 10, weight: .bold, design: .rounded))
                .lineLimit(1)
                .minimumScaleFactor(0.78)
        }
        .foregroundColor(tint)
        .padding(.horizontal, 7)
        .padding(.vertical, 4)
        .background(tint.opacity(0.12), in: Capsule())
    }
}

private struct BackgroundGenerationStatusBanner: View {
    let snapshot: ChatStore.GenerationStatusSnapshot
    let onOpen: () -> Void

    private var tint: Color {
        if snapshot.needsReview { return ChatStatusPalette.review }
        if snapshot.isPartial { return .accentOrange }
        if snapshot.isReady { return ChatStatusPalette.ready }
        if snapshot.isFailed { return .red }
        return .accentPrimary
    }

    private var title: String {
        snapshot.statusLabel
    }

    var body: some View {
        Button(action: onOpen) {
            HStack(spacing: 10) {
                Image(systemName: snapshot.iconName)
                    .font(.system(size: 16, weight: .bold))
                    .foregroundColor(tint)
                    .frame(width: 24, height: 24)

                VStack(alignment: .leading, spacing: 3) {
                    Text(title)
                        .font(.system(size: 13, weight: .bold, design: .rounded))
                        .foregroundColor(.textPrimary)
                        .lineLimit(1)
                    Text("\(snapshot.title) · \(snapshot.statusLabel)")
                        .font(.system(size: 11, weight: .semibold, design: .rounded))
                        .foregroundColor(.textSecondary)
                        .lineLimit(1)
                }

                Spacer(minLength: 8)

                Text(snapshot.actionLabel)
                    .font(.system(size: 11, weight: .bold, design: .rounded))
                    .foregroundColor(tint)
                    .lineLimit(1)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 11)
            .background(
                LinearGradient(
                    colors: [tint.opacity(0.15), Color.cardBackground],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(tint.opacity(0.24), lineWidth: 1)
            )
            .shadow(color: tint.opacity(0.12), radius: 10, x: 0, y: 4)
            .contentShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

private struct BackgroundGenerationBanner: View {
    let jobs: [ChatStore.BackgroundGenerationJob]
    let activeCount: Int
    let readyCount: Int
    let languageCode: String
    let onOpen: (ChatStore.BackgroundGenerationJob) -> Void
    let onClearFinished: () -> Void
    private let successColor = ChatStatusPalette.ready

    private var isRu: Bool { languageCode == "ru" }

    private var visibleJobs: [ChatStore.BackgroundGenerationJob] {
        Array(jobs.sorted { $0.updatedAt > $1.updatedAt }.prefix(3))
    }

    private var hasReadyJobs: Bool {
        readyCount > 0
    }

    private var hasReviewJobs: Bool {
        jobs.contains { $0.needsReview }
    }

    private var hasFailedJobs: Bool {
        jobs.contains { $0.needsAttention }
    }

    private var hasFinishedJobs: Bool {
        jobs.contains { $0.isTerminal }
    }

    private var headerTitle: String {
        if hasReviewJobs { return isRu ? "Нужен апрув" : "Review needed" }
        if hasReadyJobs { return isRu ? "Рендер готов" : "Render ready" }
        if hasFailedJobs { return isRu ? "Нужна проверка" : "Render needs attention" }
        return isRu ? "Рендерится в фоне" : "Rendering in background"
    }

    private var headerIcon: String {
        if hasReviewJobs { return "hand.tap.fill" }
        if hasReadyJobs { return "checkmark.seal.fill" }
        if hasFailedJobs { return "xmark.circle.fill" }
        return "clock.arrow.circlepath"
    }

    private var headerColor: Color {
        if hasReviewJobs { return ChatStatusPalette.review }
        if hasReadyJobs { return successColor }
        if hasFailedJobs { return .red }
        return .accentPrimary
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Image(systemName: headerIcon)
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(headerColor)
                Text(headerTitle)
                    .font(.system(size: 13, weight: .bold, design: .rounded))
                    .foregroundColor(.textPrimary)
                if activeCount > 0 {
                    statusPill(isRu ? "\(activeCount) активно" : "\(activeCount) active", color: .accentPrimary)
                }
                if readyCount > 0 {
                    statusPill(
                        hasReviewJobs
                            ? (isRu ? "\(readyCount) апрув" : "\(readyCount) review")
                            : (isRu ? "\(readyCount) готово" : "\(readyCount) ready"),
                        color: headerColor
                    )
                }
                Spacer(minLength: 8)
                if hasFinishedJobs {
                    Button(action: onClearFinished) {
                        Image(systemName: "checkmark.circle")
                            .font(.system(size: 15, weight: .bold))
                    }
                    .buttonStyle(.plain)
                    .foregroundColor(.textTertiary)
                    .accessibilityLabel(isRu ? "Скрыть завершённые рендеры" : "Clear finished renders")
                }
            }

            ForEach(visibleJobs) { job in
                Button {
                    onOpen(job)
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: iconName(for: job))
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(color(for: job))
                            .frame(width: 18)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(job.title)
                                .font(.system(size: 12, weight: .bold, design: .rounded))
                                .foregroundColor(.textPrimary)
                                .lineLimit(1)
                            Text(statusLabel(for: job))
                                .font(.system(size: 11, weight: .semibold, design: .rounded))
                                .foregroundColor(.textSecondary)
                                .lineLimit(1)
                        }
                        Spacer(minLength: 8)
                        if !job.isTerminal {
                            ProgressView()
                                .scaleEffect(0.65)
                                .tint(.accentPrimary)
                        } else {
                            Text(job.needsReview ? (isRu ? "Апрув" : "Review") : (isRu ? "Открыть" : "Open"))
                                .font(.system(size: 11, weight: .bold, design: .rounded))
                                .foregroundColor(color(for: job))
                        }
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 8)
                    .background(rowBackground(for: job))
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                    .contentShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(
            LinearGradient(
                colors: hasReadyJobs
                    ? [headerColor.opacity(0.14), Color.cardBackground]
                    : [headerColor.opacity(0.08), Color.cardBackground],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(headerColor.opacity(0.22), lineWidth: 1)
        )
        .shadow(color: headerColor.opacity(0.12), radius: 10, x: 0, y: 4)
    }

    private func statusPill(_ text: String, color: Color) -> some View {
        Text(text)
            .font(.system(size: 10, weight: .bold, design: .rounded))
            .foregroundColor(color)
            .padding(.horizontal, 7)
            .padding(.vertical, 3)
            .background(color.opacity(0.12), in: Capsule())
    }

    private func iconName(for job: ChatStore.BackgroundGenerationJob) -> String {
        if job.needsReview { return "exclamationmark.circle.fill" }
        if job.isPartial { return "exclamationmark.circle.fill" }
        if job.isReady { return "checkmark.circle.fill" }
        if job.needsAttention { return job.status == "watcher_error" ? "exclamationmark.triangle.fill" : "xmark.circle.fill" }
        return "arrow.triangle.2.circlepath.circle.fill"
    }

    private func color(for job: ChatStore.BackgroundGenerationJob) -> Color {
        if job.needsReview { return ChatStatusPalette.review }
        if job.isPartial { return .accentOrange }
        if job.isReady { return successColor }
        if job.needsAttention { return .red }
        return .accentPrimary
    }

    private func rowBackground(for job: ChatStore.BackgroundGenerationJob) -> Color {
        if job.needsReview { return ChatStatusPalette.reviewFill }
        if job.isPartial { return Color.accentOrange.opacity(0.10) }
        if job.isReady { return ChatStatusPalette.readyFill }
        if job.needsAttention { return Color.red.opacity(0.08) }
        return Color.elevatedBackground.opacity(0.72)
    }

    private func statusLabel(for job: ChatStore.BackgroundGenerationJob) -> String {
        if job.needsReview { return isRu ? "Нужен апрув" : "Needs review" }
        if job.isPartial { return isRu ? "Частичный экспорт" : "Partial export" }
        if job.isReady { return isRu ? "Готово к экспорту" : "Ready to export" }
        if job.status == "watcher_error" { return isRu ? "Проверьте статус" : "Check status" }
        if job.status == "failed" { return isRu ? "Нужен фикс" : "Failed" }
        return job.currentStageTitle ?? (isRu ? "Рендерится в фоне" : job.statusLabel)
    }
}

private struct GenerationProgressRail: View {
    let stages: [ChatStore.GenerationStage]
    var languageCode: String = "en"
    var showPreviewButton: Bool = false
    var isLive: Bool = false
    var onPreviewTap: (() -> Void)?
    private var isRu: Bool { languageCode == "ru" }

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(stages) { stage in
                    HStack(spacing: 8) {
                        Image(systemName: stage.status == "processing" ? "arrow.triangle.2.circlepath.circle.fill" : (stage.isFailed ? "xmark.circle.fill" : (stage.isComplete ? "checkmark.circle.fill" : "circle.dotted")))
                            .foregroundColor(stage.status == "processing" ? .accentPrimary : (stage.isFailed ? .red : (stage.isComplete ? .accentPrimary : .textTertiary)))
                        Text(stage.title)
                            .font(.appCaption)
                            .foregroundColor(.textSecondary)
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .background(Color.cardBackground)
                    .clipShape(Capsule())
                }

                if showPreviewButton, let onPreviewTap {
                    Button(action: onPreviewTap) {
                        HStack(spacing: 6) {
                            if isLive {
                                ProgressView()
                                    .scaleEffect(0.6)
                                    .tint(.white)
                            } else {
                                Image(systemName: "cube.fill")
                                    .font(.system(size: 11, weight: .semibold))
                            }
                            Text(isLive ? (isRu ? "Открыть" : "View") : (isRu ? "Превью" : "Preview"))
                                .font(.appCaption.weight(.semibold))
                        }
                        .foregroundColor(.white)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 10)
                        .background(isLive ? ChatStatusPalette.job : Color.accentPrimary)
                        .clipShape(Capsule())
                    }
                }
            }
            .padding(.bottom, 8)
        }
    }
}

private struct ExportGuide: Identifiable {
    let id = UUID()
    let fileName: String
    let fileType: String
    let downloadURL: URL?
    let clothingTexturePngURL: URL?
    let isAnimation: Bool
    let jobId: String?
    let generatedSystems: [String]
    let isLayeredClothing: Bool

    init(fileName: String, fileType: String, downloadURL: URL?, clothingTexturePngURL: URL? = nil, isAnimation: Bool = false, jobId: String? = nil, generatedSystems: [String] = [], isLayeredClothing: Bool = false) {
        self.fileName = fileName
        self.fileType = fileType
        self.downloadURL = downloadURL
        self.isAnimation = isAnimation
        self.clothingTexturePngURL = clothingTexturePngURL
        self.jobId = jobId
        self.generatedSystems = generatedSystems
        self.isLayeredClothing = isLayeredClothing
    }
}

// MARK: - Search Results Overlay

private struct SearchResultsOverlay: View {
    let results: [ChatStore.ChatThread]
    let query: String
    let onSelect: (ChatStore.ChatThread) -> Void

    var body: some View {
        VStack(spacing: 0) {
            if results.isEmpty {
                VStack(spacing: 12) {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 32, weight: .light))
                        .foregroundColor(.textTertiary)
                    Text("No chats matching \"\(query)\"")
                        .font(.appBody)
                        .foregroundColor(.textSecondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    LazyVStack(spacing: 2) {
                        ForEach(results) { thread in
                            Button { onSelect(thread) } label: {
                                HStack(spacing: 12) {
                                    Image(systemName: "bubble.left.fill")
                                        .font(.system(size: 14))
                                        .foregroundColor(.accentPrimary)
                                    VStack(alignment: .leading, spacing: 3) {
                                        Text(thread.title)
                                            .font(.system(size: 15, weight: .semibold))
                                            .foregroundColor(.textPrimary)
                                            .lineLimit(1)
                                        Text(thread.promptHint)
                                            .font(.system(size: 12))
                                            .foregroundColor(.textSecondary)
                                            .lineLimit(1)
                                    }
                                    Spacer()
                                    Text(thread.updatedAt, style: .relative)
                                        .font(.system(size: 11))
                                        .foregroundColor(.textTertiary)
                                }
                                .padding(.horizontal, 16)
                                .padding(.vertical, 12)
                            }
                            .buttonStyle(.plain)
                            Divider().padding(.leading, 44)
                        }
                    }
                    .padding(.top, 8)
                }
            }
        }
        .background(Color.gradientTop.opacity(0.97))
        .transition(.opacity)
        .animation(.easeInOut(duration: 0.15), value: results.map(\.id))
    }
}

// MARK: - Flow Mode Picker

private struct FlowModePicker: View {
    let languageCode: String
    @Binding var selectedFlow: ChatStore.WorkspaceFlow

    var body: some View {
        HStack(spacing: 0) {
            ForEach(ChatStore.WorkspaceFlow.allCases, id: \.rawValue) { flow in
                let isSelected = selectedFlow == flow
                Button {
                    withAnimation(.spring(response: 0.3)) {
                        selectedFlow = flow
                    }
                } label: {
                    HStack(spacing: 5) {
                        Image(systemName: flow.icon)
                            .font(.system(size: 11, weight: .semibold))
                        Text(title(for: flow))
                            .font(.system(size: 12, weight: .semibold))
                    }
                    .foregroundColor(isSelected ? .white : .textSecondary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                    .background(isSelected ? Color.accentPrimary : Color.clear)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(3)
        .background(Color.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func title(for flow: ChatStore.WorkspaceFlow) -> String {
        guard languageCode == "ru" else { return flow.title }
        switch flow {
        case .quickGenerate: return "Быстро"
        case .smartInterview: return "Интервью"
        }
    }
}

// Voice-to-Fix red→green diff: unified line diff of the user's original vs the doctor's fixed Luau.
private struct LuauDiffView: View {
    let original: String
    let fixed: String
    @Environment(\.dismiss) private var dismiss

    private enum Kind { case same, removed, added }
    private struct Row { let kind: Kind; let text: String }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                        rowView(row)
                    }
                }
                .padding(.vertical, 8)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .background(Color(red: 0.07, green: 0.08, blue: 0.11).ignoresSafeArea())
            .navigationTitle("Red → Green")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        UIPasteboard.general.string = fixed
                    } label: {
                        Label("Copy fixed", systemImage: "doc.on.doc")
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    private func rowView(_ row: Row) -> some View {
        let style = style(for: row.kind)
        return Text(style.prefix + (row.text.isEmpty ? " " : row.text))
            .font(.system(size: 12, weight: .regular, design: .monospaced))
            .foregroundColor(style.fg)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 12)
            .padding(.vertical, 1)
            .background(style.bg)
            .textSelection(.enabled)
    }

    private func style(for kind: Kind) -> (bg: Color, fg: Color, prefix: String) {
        switch kind {
        case .same:    return (.clear, Color.white.opacity(0.7), "  ")
        case .removed: return (Color.red.opacity(0.22), Color(red: 1, green: 0.6, blue: 0.6), "- ")
        case .added:   return (Color.green.opacity(0.20), Color(red: 0.55, green: 1, blue: 0.7), "+ ")
        }
    }

    private var rows: [Row] {
        let a = original.components(separatedBy: "\n")
        let b = fixed.components(separatedBy: "\n")
        let diff = b.difference(from: a)
        var aRemoved = Array(repeating: false, count: a.count)
        var bInserted = Array(repeating: false, count: b.count)
        for change in diff {
            switch change {
            case let .remove(offset, _, _): if offset < aRemoved.count { aRemoved[offset] = true }
            case let .insert(offset, _, _): if offset < bInserted.count { bInserted[offset] = true }
            }
        }
        var out: [Row] = []
        var i = 0, j = 0
        while i < a.count && j < b.count {
            if aRemoved[i] {
                out.append(Row(kind: .removed, text: a[i])); i += 1
            } else if bInserted[j] {
                out.append(Row(kind: .added, text: b[j])); j += 1
            } else {
                out.append(Row(kind: .same, text: a[i])); i += 1; j += 1
            }
        }
        while i < a.count { out.append(Row(kind: .removed, text: a[i])); i += 1 }
        while j < b.count { out.append(Row(kind: .added, text: b[j])); j += 1 }
        return out
    }
}
