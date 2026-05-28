//
//  ForgeView.swift
//  AIGoldRoblox
//

import SwiftUI

struct ForgeView: View {
    enum ProjectGroup: String, CaseIterable, Identifiable {
        case games = "Games"
        case content = "Content"
        case viral = "🔥 Viral"

        var id: String { rawValue }
    }

    struct ProjectOption: Identifiable, Hashable {
        let id: String
        let title: String
        let details: String
        let kind: ProjectKind
        let tags: Set<String>

        init(id: String, title: String, details: String, kind: ProjectKind, tags: Set<String> = []) {
            self.id = id
            self.title = title
            self.details = details
            self.kind = kind
            self.tags = tags
        }

        func hash(into hasher: inout Hasher) { hasher.combine(id) }
        static func == (lhs: ProjectOption, rhs: ProjectOption) -> Bool { lhs.id == rhs.id }
    }

    struct ProjectChip: Identifiable, Hashable {
        let id: String
        let label: String
    }

    struct ChatLaunchConfig: Identifiable {
        let id = UUID()
        let title: String
        let entryMode: ChatView.EntryChatMode
        let projectKind: ProjectKind
        let welcomeContext: String
        let resumeSessionId: String?
        let template: AIWorkspaceAPI.GameTemplate?
        let contentSubcategory: String?
        let lastJobId: String?
        let openGenerationOnLaunch: Bool

        init(title: String, entryMode: ChatView.EntryChatMode, projectKind: ProjectKind, welcomeContext: String, resumeSessionId: String?, template: AIWorkspaceAPI.GameTemplate? = nil, contentSubcategory: String? = nil, lastJobId: String? = nil, openGenerationOnLaunch: Bool = false) {
            self.title = title
            self.entryMode = entryMode
            self.projectKind = projectKind
            self.welcomeContext = welcomeContext
            self.resumeSessionId = resumeSessionId
            self.template = template
            self.contentSubcategory = contentSubcategory
            self.lastJobId = lastJobId
            self.openGenerationOnLaunch = openGenerationOnLaunch
        }
    }

    enum ChatGrouping: String, CaseIterable {
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

    enum TypeGroup: String, CaseIterable {
        case game = "Game"
        case content = "Content"
        case other = "Other"

        var sortOrder: Int {
            switch self {
            case .game: return 0
            case .content: return 1
            case .other: return 2
            }
        }
    }

    @StateObject private var history = ChatHistoryStore.shared
    @State private var isShowingProjectPicker = false
    @State private var isShowingChatPicker = false
    @State private var selectedGroup: ProjectGroup = .games
    @State private var selectedOption: ProjectOption?
    @State private var selectedChipByGroup: [String: String] = [:]
    @State private var launchConfig: ChatLaunchConfig?
    @State private var renameTarget: ChatHistoryStore.ChatSession?
    @State private var renameText = ""
    @State private var exportShareItem: String?
    @State private var isShowingTikTokStudio = false
    // Session 382 Phase 2 — fakeLimited tile no longer opens chat; it now
    // pivots into the dedicated GlowupStudioView SwiftUI pipeline.
    @State private var isShowingGlowupStudio = false
    // Session 383 — Outfit Generator (separate product from Glow-Up).
    @State private var isShowingOutfitStudio = false
    // Session 384 — Cursed UGC Modeler.
    @State private var isShowingCursedUGCStudio = false
    // Session 385 — Voice-to-Aura.
    @State private var isShowingVoiceAuraStudio = false
    // Session 386 — Zero-Robux Fitting Room.
    @State private var isShowingFittingRoom = false
    // Session 387 — Disaster Spawner.
    @State private var isShowingDisasterSpawner = false
    // Session 385 round 6 — Recents/Library for fire-and-forget viral
    // generations (Outfit, Glowup, CursedUGC, VoiceAura, DisasterSpawner,
    // FittingRoom). Backend persists each into `viralGenerations` collection.
    @State private var isShowingViralLibrary = false
    @State private var chatGrouping: ChatGrouping = .date
    @State private var chatSearchQuery = ""
    @State private var templates: [AIWorkspaceAPI.GameTemplate] = []
    @State private var isLoadingTemplates = false
    @State private var hasCompletedInitialHistoryCheck = false

    private var isRussianInterface: Bool {
        let code = UserDefaults.standard.string(forKey: "appLanguage") ?? Locale.preferredLanguages.first ?? ""
        return code
            .lowercased()
            .replacingOccurrences(of: "_", with: "-")
            .split(separator: "-")
            .first == "ru"
    }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 20) {
                ScreenBrandHeader(
                    eyebrow: "Kami Forge",
                    title: "Make the next game thing",
                    subtitle: "Start from voice, chat, image references, or a ready-made template."
                )
                .padding(.top, 6)

                generateButton

                if !templates.isEmpty {
                    templateSection
                }

                if !history.sortedSessions.isEmpty {
                    chatHistorySection
                } else if history.isSyncingRemote || !hasCompletedInitialHistoryCheck {
                    chatHistoryLoadingState
                } else {
                    firstRunEmptyState
                }

                // FORGE Editor временно скрыт — будем дорабатывать.
                // forgeEditorLink
            }
            .padding(16)
            .padding(.bottom, LayoutMetrics.floatingTabBarClearance)
        }
        .background(
            LinearGradient(colors: [.gradientTop, .gradientBottom], startPoint: .topLeading, endPoint: .bottomTrailing)
                .ignoresSafeArea()
        )
        .dismissKeyboardOnTap()
        .navigationTitle("Kami Forge")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadInitialContent() }
        .sheet(isPresented: $isShowingProjectPicker) {
            projectTypeModal
        }
        .sheet(isPresented: $isShowingChatPicker) {
            chatTypeModal
        }
        .fullScreenCover(item: $launchConfig) { config in
            NavigationStack {
                ChatView(
                    projectKind: config.projectKind,
                    preferredFlow: .smartInterview,
                    entryMode: config.entryMode,
                    welcomeContext: config.welcomeContext,
                    title: config.title,
                    sessionId: config.resumeSessionId,
                    template: config.template,
                    contentSubcategory: config.contentSubcategory,
                    lastJobId: config.lastJobId,
                    openGenerationOnLaunch: config.openGenerationOnLaunch
                )
            }
        }
        .fullScreenCover(isPresented: $isShowingTikTokStudio) {
            TikTokStudioView()
        }
        .fullScreenCover(isPresented: $isShowingGlowupStudio) {
            NavigationStack { GlowupStudioView() }
        }
        .fullScreenCover(isPresented: $isShowingOutfitStudio) {
            NavigationStack { OutfitStudioView() }
        }
        .fullScreenCover(isPresented: $isShowingCursedUGCStudio) {
            NavigationStack { CursedUGCStudioView() }
        }
        .fullScreenCover(isPresented: $isShowingVoiceAuraStudio) {
            NavigationStack { VoiceAuraStudioView() }
        }
        .fullScreenCover(isPresented: $isShowingFittingRoom) {
            NavigationStack { FittingRoomStudioView() }
        }
        .fullScreenCover(isPresented: $isShowingDisasterSpawner) {
            NavigationStack { DisasterSpawnerStudioView() }
        }
        .fullScreenCover(isPresented: $isShowingViralLibrary) {
            NavigationStack { ViralLibraryView() }
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    isShowingViralLibrary = true
                } label: {
                    Image(systemName: "sparkles.rectangle.stack")
                        .font(.title3.weight(.semibold))
                        .foregroundColor(.accentPrimary)
                }
                .accessibilityLabel(Text(isRussianInterface ? "Мои генерации" : "My Creations"))
            }
        }
        .alert("Delete Chat", isPresented: Binding<Bool>(
            get: { history.sessionToDelete != nil },
            set: { if !$0 { history.sessionToDelete = nil } }
        )) {
            Button("Cancel", role: .cancel) { history.sessionToDelete = nil }
            Button("Delete", role: .destructive) {
                if let s = history.sessionToDelete { history.delete(s) }
                history.sessionToDelete = nil
            }
        } message: {
            Text("This chat will be permanently deleted.")
        }
        .alert("Rename Chat", isPresented: Binding<Bool>(
            get: { renameTarget != nil },
            set: { if !$0 { renameTarget = nil } }
        )) {
            TextField("New name", text: $renameText)
            Button("Cancel", role: .cancel) { renameTarget = nil }
            Button("Save") {
                if let t = renameTarget, !renameText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    history.rename(t, to: renameText.trimmingCharacters(in: .whitespacesAndNewlines))
                }
                renameTarget = nil
            }
        }
        .sheet(item: Binding<ShareableText?>(
            get: { exportShareItem.map { ShareableText(text: $0) } },
            set: { exportShareItem = $0?.text }
        )) { item in
            ShareSheet(text: item.text)
        }
        .onReceive(NotificationCenter.default.publisher(for: .openGenerationChat)) { notification in
            openGenerationChat(from: notification.userInfo)
        }
        .onAppear {
            openPendingGenerationNotificationIfNeeded()
        }
    }

    private var generateButton: some View {
        Button {
            isShowingProjectPicker = true
        } label: {
            HStack(spacing: 12) {
                Image(systemName: "sparkles")
                    .font(.system(size: 24, weight: .bold))
                Text("GENERATE")
                    .font(.system(size: 28, weight: .black, design: .rounded))
            }
            .foregroundColor(.black)
            .padding(.horizontal, 34)
            .padding(.vertical, 24)
            .frame(maxWidth: .infinity)
            .background(
                LinearGradient(colors: [.accentOrange, .accentPrimary], startPoint: .leading, endPoint: .trailing)
            )
            .clipShape(RoundedRectangle(cornerRadius: 28))
            .shadow(color: .accentPrimary.opacity(0.4), radius: 14, y: 10)
        }
        .buttonStyle(.plain)
    }

    private var filteredSessions: [ChatHistoryStore.ChatSession] {
        guard !chatSearchQuery.isEmpty else { return history.sortedSessions }
        return history.sortedSessions.filter {
            $0.title.localizedCaseInsensitiveContains(chatSearchQuery) ||
            $0.lastMessagePreview.localizedCaseInsensitiveContains(chatSearchQuery)
        }
    }

    private var chatHistorySection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("CHAT HISTORY")
                    .font(.system(size: 14, weight: .black, design: .rounded))
                    .foregroundColor(.textSecondary)

                Spacer()

                if chatSearchQuery.isEmpty {
                    Picker("Group by", selection: $chatGrouping) {
                        ForEach(ChatGrouping.allCases, id: \.rawValue) { mode in
                            Text(mode.rawValue).tag(mode)
                        }
                    }
                    .pickerStyle(.segmented)
                    .frame(width: 150)
                }
            }

            HStack(spacing: 10) {
                Image(systemName: "magnifyingglass")
                    .foregroundColor(.textTertiary)
                    .font(.system(size: 14))
                TextField("Search chats...", text: $chatSearchQuery)
                    .font(.system(size: 14, design: .rounded))
                    .foregroundColor(.textPrimary)
                    .tint(.accentPrimary)
                    .autocorrectionDisabled(true)
                    .textInputAutocapitalization(.never)
                if !chatSearchQuery.isEmpty {
                    Button { chatSearchQuery = "" } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundColor(.textTertiary)
                    }
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 9)
            .background(Color.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: 12))

            if chatSearchQuery.isEmpty {
                switch chatGrouping {
                case .date:
                    chatHistoryByDate
                case .type:
                    chatHistoryByType
                }
            } else if filteredSessions.isEmpty {
                VStack(spacing: 10) {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 28, weight: .light))
                        .foregroundColor(.textTertiary)
                    Text("No Results")
                        .font(.system(size: 17, weight: .bold, design: .rounded))
                        .foregroundColor(.textPrimary)
                    Text("Nothing matches \"\(chatSearchQuery)\".")
                        .font(.system(size: 13, weight: .medium, design: .rounded))
                        .foregroundColor(.textSecondary)
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 40)
            } else {
                ForEach(filteredSessions) { session in
                    chatHistoryRow(session)
                }
            }
        }
    }

    private var chatHistoryLoadingState: some View {
        VStack(spacing: 12) {
            ProgressView()
                .tint(.accentPrimary)
            Text("Loading your chats...")
                .font(.system(size: 13, weight: .semibold, design: .rounded))
                .foregroundColor(.textSecondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 38)
    }

    private var firstRunEmptyState: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(alignment: .top, spacing: 14) {
                ZStack {
                    Circle()
                        .fill(
                            LinearGradient(
                                colors: [.accentTeal.opacity(0.85), .accentPrimary.opacity(0.75)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .frame(width: 62, height: 62)
                        .shadow(color: .accentTeal.opacity(0.25), radius: 12, y: 6)

                    Image(systemName: "sparkles")
                        .font(.system(size: 25, weight: .black))
                        .foregroundColor(.white)
                }

                VStack(alignment: .leading, spacing: 6) {
                    Text("Start your first build")
                        .font(.system(size: 22, weight: .black, design: .rounded))
                        .foregroundColor(.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)

                    Text("Choose a starter below or tap Generate to make a game, NPC, weapon, map, UI, or shop system.")
                        .font(.system(size: 14, weight: .medium, design: .rounded))
                        .foregroundColor(.textSecondary)
                        .lineSpacing(2)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            VStack(spacing: 10) {
                quickStartButton(
                    icon: "figure.run.square.stack.fill",
                    title: "Make an Obby",
                    subtitle: "Checkpoints, hazards, rewards, and export-ready scripts.",
                    group: .games,
                    optionID: "obby"
                )
                quickStartButton(
                    icon: "brain.head.profile",
                    title: "Build a Brainrot Sim",
                    subtitle: "Base locks, conveyor drops, rarity hype, and rebirths.",
                    group: .viral,
                    optionID: "brainrot_sim"
                )
                quickStartButton(
                    icon: "person.wave.2.fill",
                    title: "Create an AI NPC",
                    subtitle: "Dialogue, behavior, roast lines, and Studio-ready export.",
                    group: .content,
                    optionID: "npcs"
                )
            }
        }
        .padding(.top, 4)
    }

    private func quickStartButton(
        icon: String,
        title: String,
        subtitle: String,
        group: ProjectGroup,
        optionID: String
    ) -> some View {
        Button {
            launchQuickStart(group: group, optionID: optionID)
        } label: {
            HStack(spacing: 12) {
                ZStack {
                    Circle()
                        .fill(Color.cardBackground)
                        .frame(width: 44, height: 44)
                    Image(systemName: icon)
                        .font(.system(size: 19, weight: .bold))
                        .foregroundColor(group == .viral ? .accentOrange : .accentPrimary)
                }

                VStack(alignment: .leading, spacing: 4) {
                    TechnicalText(
                        title,
                        baseFont: .system(size: 15, weight: .black, design: .rounded),
                        technicalFont: .appTechnical(size: 15, weight: .bold)
                    )
                        .foregroundColor(.textPrimary)
                        .lineLimit(1)
                    TechnicalText(
                        subtitle,
                        baseFont: .system(size: 12, weight: .medium, design: .rounded),
                        technicalFont: .appTechnical(size: 12, weight: .semibold)
                    )
                        .foregroundColor(.textSecondary)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Spacer(minLength: 8)

                Image(systemName: "arrow.right")
                    .font(.system(size: 14, weight: .black))
                    .foregroundColor(.textTertiary)
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(Color.accentPrimary.opacity(0.08), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }

    private var chatHistoryByDate: some View {
        let grouped = groupedByDate(history.sortedSessions)
        return ForEach(grouped, id: \.0) { group, sessions in
            chatGroupSection(title: group.rawValue, sessions: sessions)
        }
    }

    private var chatHistoryByType: some View {
        let grouped = groupedByType(history.sortedSessions)
        return ForEach(grouped, id: \.0) { group, sessions in
            chatGroupSection(title: group.rawValue, sessions: sessions)
        }
    }

    private func chatGroupSection(title: String, sessions: [ChatHistoryStore.ChatSession]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title.uppercased())
                .font(.system(size: 12, weight: .bold, design: .rounded))
                .foregroundColor(.textTertiary)
                .padding(.top, 6)

            ForEach(sessions) { session in
                chatHistoryRow(session)
            }
        }
    }

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

    private func typeGroup(for projectKind: String) -> TypeGroup {
        switch projectKind.lowercased() {
        case "game", "clone":
            return .game
        case "content", "ugc", "fakelimited":
            return .content
        default:
            return .other
        }
    }

    private func groupedByDate(_ sessions: [ChatHistoryStore.ChatSession]) -> [(DateGroup, [ChatHistoryStore.ChatSession])] {
        let dict = Dictionary(grouping: sessions) { dateGroup(for: $0.updatedAt) }
        return dict
            .map { ($0.key, $0.value.sorted { $0.updatedAt > $1.updatedAt }) }
            .sorted { $0.0.sortOrder < $1.0.sortOrder }
    }

    private func groupedByType(_ sessions: [ChatHistoryStore.ChatSession]) -> [(TypeGroup, [ChatHistoryStore.ChatSession])] {
        let dict = Dictionary(grouping: sessions) { typeGroup(for: $0.projectKind) }
        return dict
            .map { ($0.key, $0.value.sorted { $0.updatedAt > $1.updatedAt }) }
            .sorted { $0.0.sortOrder < $1.0.sortOrder }
    }

    private func chatHistoryRow(_ session: ChatHistoryStore.ChatSession) -> some View {
        Button {
            resumeSession(session)
        } label: {
            HStack(spacing: 12) {
                Image(systemName: session.chatMode == "voice" ? "waveform.badge.mic" : "text.bubble.fill")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundColor(session.isStarred ? .accentOrange : .accentPrimary)
                    .frame(width: 36, height: 36)

                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        if session.isStarred {
                            Image(systemName: "star.fill")
                                .font(.system(size: 10))
                                .foregroundColor(.accentOrange)
                        }
                        Text(session.title)
                            .font(.system(size: 14, weight: .bold, design: .rounded))
                            .foregroundColor(.textPrimary)
                            .lineLimit(1)
                        if let status = session.generationStatus {
                            generationStatusPill(status)
                        } else if session.lastJobId?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false {
                            fallbackJobPill
                        }
                    }
                    if let status = session.generationStatus {
                        generationProgressStrip(status)
                    } else if session.lastJobId?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false {
                        fallbackGenerationProgressStrip
                    }
                    Text(session.lastMessagePreview)
                        .font(.appCaption)
                        .foregroundColor(.textSecondary)
                        .lineLimit(session.generationStatus == nil && !hasGenerationJob(session) ? 2 : 1)
                    Text(Self.relativeDate(session.updatedAt))
                        .font(.system(size: 11, weight: .medium, design: .rounded))
                        .foregroundColor(.textTertiary)
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(.textTertiary)
            }
            .padding(14)
            .background(Color.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: 16))
        }
        .buttonStyle(.plain)
        .contextMenu {
            Button {
                renameText = session.title
                renameTarget = session
            } label: {
                Label("Rename", systemImage: "pencil")
            }

            Button {
                history.toggleStar(session)
            } label: {
                Label(session.isStarred ? "Remove from Favourites" : "Add to Favourites", systemImage: session.isStarred ? "star.slash" : "star.fill")
            }

            let isArchived = history.archivedIds.contains(session.id)
            Button {
                if isArchived {
                    history.unarchiveThread(id: session.id)
                } else {
                    history.archiveThread(id: session.id)
                }
            } label: {
                Label(isArchived ? "Unarchive" : "Archive", systemImage: isArchived ? "tray.and.arrow.up" : "archivebox")
            }

            Button {
                exportShareItem = history.exportText(for: session)
            } label: {
                Label("Export", systemImage: "square.and.arrow.up")
            }

            Divider()

            Button(role: .destructive) {
                history.sessionToDelete = session
            } label: {
                Label("Delete", systemImage: "trash")
            }
        }
    }

    private var fallbackJobPill: some View {
        HStack(spacing: 3) {
            Image(systemName: "clock.arrow.circlepath")
                .font(.system(size: 8, weight: .bold))
            Text(isRussianInterface ? "Статус" : "Status")
                .font(.system(size: 9, weight: .bold, design: .rounded))
        }
        .foregroundColor(.accentPrimary)
        .padding(.horizontal, 5)
        .padding(.vertical, 2)
        .background(Color.accentPrimary.opacity(0.12), in: Capsule())
    }

    private func generationStatusPill(_ status: ChatHistoryStore.GenerationStatus) -> some View {
        let color = generationStatusColor(status)
        return HStack(spacing: 3) {
            Image(systemName: status.iconName)
                .font(.system(size: 8, weight: .bold))
            Text(generationStatusPillText(status))
                .font(.system(size: 9, weight: .bold, design: .rounded))
                .lineLimit(1)
                .minimumScaleFactor(0.75)
        }
        .foregroundColor(color)
        .padding(.horizontal, 5)
        .padding(.vertical, 2)
        .background(color.opacity(0.12), in: Capsule())
    }

    private var fallbackGenerationProgressStrip: some View {
        HStack(spacing: 7) {
            ProgressView()
                .scaleEffect(0.62)
                .tint(.accentPrimary)
                .frame(width: 14, height: 14)
            VStack(alignment: .leading, spacing: 3) {
                Text(isRussianInterface ? "Статус обновляется" : "Updating status")
                    .font(.system(size: 12, weight: .bold, design: .rounded))
                    .foregroundColor(.accentPrimary)
                    .lineLimit(1)
                indeterminateProgressBar(color: .accentPrimary)
            }
        }
        .padding(.horizontal, 9)
        .padding(.vertical, 7)
        .background(Color.accentPrimary.opacity(0.08), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(Color.accentPrimary.opacity(0.16), lineWidth: 1)
        )
    }

    private func generationProgressStrip(_ status: ChatHistoryStore.GenerationStatus) -> some View {
        let color = generationStatusColor(status)
        return VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 7) {
                if status.isActive {
                    ProgressView()
                        .scaleEffect(0.62)
                        .tint(color)
                        .frame(width: 14, height: 14)
                } else {
                    Image(systemName: status.iconName)
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(color)
                        .frame(width: 14, height: 14)
                }
                Text(generationStatusDetail(status))
                    .font(.system(size: 12, weight: .bold, design: .rounded))
                    .foregroundColor(color)
                    .lineLimit(1)
                    .minimumScaleFactor(0.82)
                Spacer(minLength: 6)
                if let progress = status.progressLabel {
                    Text(progress)
                        .font(.system(size: 10, weight: .black, design: .rounded))
                        .foregroundColor(color)
                }
            }

            if status.totalStageCount > 0 {
                determinateProgressBar(status: status, color: color)
            } else if status.isActive {
                indeterminateProgressBar(color: color)
            }
        }
        .padding(.horizontal, 9)
        .padding(.vertical, 7)
        .background(color.opacity(status.needsAttention ? 0.10 : 0.08), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(color.opacity(status.needsAttention ? 0.28 : 0.16), lineWidth: 1)
        )
    }

    private func determinateProgressBar(status: ChatHistoryStore.GenerationStatus, color: Color) -> some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule()
                    .fill(color.opacity(0.13))
                Capsule()
                    .fill(color)
                    .frame(width: max(10, proxy.size.width * progressRatio(status)))
            }
        }
        .frame(height: 4)
    }

    private func indeterminateProgressBar(color: Color) -> some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule()
                    .fill(color.opacity(0.12))
                Capsule()
                    .fill(
                        LinearGradient(
                            colors: [color.opacity(0.28), color, color.opacity(0.28)],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .frame(width: max(28, proxy.size.width * 0.34))
            }
        }
        .frame(height: 4)
    }

    private func generationStatusPillText(_ status: ChatHistoryStore.GenerationStatus) -> String {
        if status.isActive {
            return isRussianInterface ? "В процессе" : "Running"
        }
        return status.statusLabel
    }

    private func generationStatusDetail(_ status: ChatHistoryStore.GenerationStatus) -> String {
        return status.detailLabel
    }

    private func generationStatusColor(_ status: ChatHistoryStore.GenerationStatus) -> Color {
        if status.needsAttention { return .red }
        if status.needsReview { return .brandViolet }
        if status.isPartial { return .accentOrange }
        if status.isReady { return .accentPrimary }
        return .accentPrimary
    }

    private func hasGenerationJob(_ session: ChatHistoryStore.ChatSession) -> Bool {
        session.lastJobId?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
    }

    private func progressRatio(_ status: ChatHistoryStore.GenerationStatus) -> CGFloat {
        guard status.totalStageCount > 0 else { return status.isReady ? 1 : 0 }
        let raw = CGFloat(status.completedStageCount) / CGFloat(status.totalStageCount)
        if status.needsAttention || status.isActive {
            return min(max(raw, 0.08), 0.96)
        }
        return min(max(raw, 0), 1)
    }

    private var templateSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: "square.grid.2x2.fill")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(.accentPrimary)
                Text("START FROM TEMPLATE")
                    .font(.system(size: 14, weight: .black, design: .rounded))
                    .foregroundColor(.textSecondary)
            }

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(templates) { template in
                        templateCard(template)
                    }
                }
            }
        }
    }

    private func templateCard(_ template: AIWorkspaceAPI.GameTemplate) -> some View {
        Button {
            launchFromTemplate(template)
        } label: {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 6) {
                    Image(systemName: template.genreIcon)
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(.accentPrimary)
                    Text(template.title)
                        .font(.system(size: 15, weight: .bold, design: .rounded))
                        .foregroundColor(.textPrimary)
                        .lineLimit(1)
                }

                Text(template.description)
                    .font(.system(size: 12, weight: .medium, design: .rounded))
                    .foregroundColor(.textSecondary)
                    .lineLimit(3)
                    .multilineTextAlignment(.leading)

                HStack(spacing: 4) {
                    Text(template.difficultyLabel)
                        .font(.system(size: 10, weight: .bold, design: .rounded))
                        .foregroundColor(difficultyColor(template.difficulty))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(difficultyColor(template.difficulty).opacity(0.15))
                        .clipShape(Capsule())

                    Spacer()

                    Text(template.genre.capitalized)
                        .font(.system(size: 10, weight: .bold, design: .rounded))
                        .foregroundColor(.textTertiary)
                }

                ForgeFlowLayout(spacing: 4) {
                    ForEach(template.features.prefix(3), id: \.self) { feature in
                        Text(feature)
                            .font(.system(size: 10, weight: .medium, design: .rounded))
                            .foregroundColor(.textTertiary)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color.cardBackground.opacity(0.6))
                            .clipShape(Capsule())
                    }
                    if template.features.count > 3 {
                        Text("+\(template.features.count - 3)")
                            .font(.system(size: 10, weight: .bold, design: .rounded))
                            .foregroundColor(.textTertiary)
                    }
                }
            }
            .padding(14)
            .frame(width: 220, alignment: .leading)
            .background(Color.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(Color.accentPrimary.opacity(0.1), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }

    private func difficultyColor(_ difficulty: String) -> Color {
        switch difficulty {
        case "easy": return .green
        case "medium": return .accentOrange
        case "hard": return .red
        default: return .gray
        }
    }

    private func launchFromTemplate(_ template: AIWorkspaceAPI.GameTemplate) {
        launchConfig = ChatLaunchConfig(
            title: "\(template.title) — Text",
            entryMode: .text,
            projectKind: .game,
            welcomeContext: "Games > \(template.title)",
            resumeSessionId: nil,
            template: template
        )
    }

    private func loadTemplates() async {
        guard templates.isEmpty, !isLoadingTemplates else { return }
        isLoadingTemplates = true
        defer { isLoadingTemplates = false }
        do {
            templates = try await AIWorkspaceAPI.fetchTemplates()
        } catch {
            templates = []
        }
    }

    private func loadInitialContent() async {
        if history.sortedSessions.isEmpty {
            await history.syncFromRemote()
        }
        hasCompletedInitialHistoryCheck = true
        await loadTemplates()
    }

    private var forgeEditorLink: some View {
        NavigationLink {
            EditorContentView()
        } label: {
            HStack(spacing: 10) {
                Image(systemName: "paintbrush.pointed.fill")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundColor(.accentSecondary)
                Text("FORGE Editor")
                    .font(.system(size: 15, weight: .bold, design: .rounded))
                    .foregroundColor(.textPrimary)
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(.textTertiary)
            }
            .padding(16)
            .background(Color.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: 18))
            .overlay(
                RoundedRectangle(cornerRadius: 18)
                    .stroke(Color.accentSecondary.opacity(0.14), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }

    private func resumeSession(
        _ session: ChatHistoryStore.ChatSession,
        overrideJobId: String? = nil,
        openGenerationOnLaunch: Bool = false
    ) {
        let mode: ChatView.EntryChatMode = session.chatMode == "voice" ? .voice : .text
        let kind = ProjectKind(rawValue: session.projectKind) ?? .game
        let notificationJobId = overrideJobId?.trimmingCharacters(in: .whitespacesAndNewlines)
        let launchJobId = notificationJobId?.isEmpty == false ? notificationJobId : session.lastJobId
        launchConfig = ChatLaunchConfig(
            title: session.title,
            entryMode: mode,
            projectKind: kind,
            welcomeContext: session.category,
            resumeSessionId: session.id,
            contentSubcategory: session.contentSubcategory,
            lastJobId: launchJobId,
            openGenerationOnLaunch: openGenerationOnLaunch
        )
    }

    private func openGenerationChat(from userInfo: [AnyHashable: Any]?) {
        let threadId = userInfo?["threadId"] as? String
        let jobId = userInfo?["jobId"] as? String
        guard threadId != nil || jobId != nil else { return }
        if let threadId,
           let session = history.sortedSessions.first(where: { $0.id == threadId }) {
            resumeSession(session, overrideJobId: jobId, openGenerationOnLaunch: true)
            return
        }
        let title = (userInfo?["title"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
        let rawKind = userInfo?["projectKind"] as? String
        let kind = ProjectKind(rawValue: rawKind ?? "") ?? .game
        let contentSubcategory = userInfo?["contentSubcategory"] as? String
        launchConfig = ChatLaunchConfig(
            title: title?.isEmpty == false ? title! : "Generation",
            entryMode: .text,
            projectKind: kind,
            welcomeContext: title?.isEmpty == false ? title! : "Generation",
            resumeSessionId: threadId,
            contentSubcategory: contentSubcategory,
            lastJobId: jobId,
            openGenerationOnLaunch: true
        )
    }

    private func openPendingGenerationNotificationIfNeeded() {
        let defaults = UserDefaults.standard
        let jobId = defaults.string(forKey: "pendingGenerationNotification.jobId")
        let threadId = defaults.string(forKey: "pendingGenerationNotification.threadId")
        guard jobId != nil || threadId != nil else { return }
        var userInfo: [AnyHashable: Any] = [:]
        if let jobId { userInfo["jobId"] = jobId }
        if let threadId { userInfo["threadId"] = threadId }
        if let value = defaults.string(forKey: "pendingGenerationNotification.projectKind") { userInfo["projectKind"] = value }
        if let value = defaults.string(forKey: "pendingGenerationNotification.contentSubcategory") { userInfo["contentSubcategory"] = value }
        if let value = defaults.string(forKey: "pendingGenerationNotification.title") { userInfo["title"] = value }
        if let value = defaults.string(forKey: "pendingGenerationNotification.type") { userInfo["type"] = value }
        if let value = defaults.string(forKey: "pendingGenerationNotification.route") { userInfo["route"] = value }
        if let value = defaults.string(forKey: "pendingGenerationNotification.screen") { userInfo["screen"] = value }
        if let value = defaults.string(forKey: "pendingGenerationNotification.action") { userInfo["action"] = value }
        if let value = defaults.string(forKey: "pendingGenerationNotification.status") { userInfo["status"] = value }
        [
            "pendingGenerationNotification.jobId",
            "pendingGenerationNotification.threadId",
            "pendingGenerationNotification.projectKind",
            "pendingGenerationNotification.contentSubcategory",
            "pendingGenerationNotification.title",
            "pendingGenerationNotification.type",
            "pendingGenerationNotification.route",
            "pendingGenerationNotification.screen",
            "pendingGenerationNotification.action",
            "pendingGenerationNotification.status",
        ].forEach { defaults.removeObject(forKey: $0) }
        openGenerationChat(from: userInfo)
    }

    private func launchQuickStart(group: ProjectGroup, optionID: String) {
        guard let option = options(for: group).first(where: { $0.id == optionID }) else { return }
        selectedGroup = group
        selectedOption = option
        selectedChipByGroup[group.id] = "all"
        launchNewChat(mode: .text)
    }

    private static func relativeDate(_ date: Date) -> String {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter.localizedString(for: date, relativeTo: Date())
    }
}

private extension ForgeView {
    var projectTypeModal: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Picker("Type", selection: $selectedGroup) {
                        ForEach(ProjectGroup.allCases) { group in
                            Text(group.rawValue).tag(group)
                        }
                    }
                    .pickerStyle(.segmented)

                    chipStrip

                    let options = filteredOptions(for: selectedGroup, chipID: activeChipID(for: selectedGroup))

                    if options.isEmpty {
                        chipEmptyState
                    } else {
                        VStack(alignment: .leading, spacing: 10) {
                            ForEach(options) { option in
                                optionButton(option)
                            }
                        }
                    }
                }
                .padding(16)
            }
            .background(
                LinearGradient(colors: [.gradientTop, .gradientBottom], startPoint: .topLeading, endPoint: .bottomTrailing)
                    .ignoresSafeArea()
            )
            .navigationTitle("Project Type")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") {
                        isShowingProjectPicker = false
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Next") {
                        isShowingProjectPicker = false
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                            isShowingChatPicker = true
                        }
                    }
                    .disabled(selectedOption == nil)
                    .font(.system(size: 17, weight: .bold))
                }
            }
        }
        .presentationDetents([.large])
    }

    var chatTypeModal: some View {
        NavigationStack {
            VStack(spacing: 16) {
                Text("Choose Chat Type")
                    .font(.appHeadline)
                    .foregroundColor(.textPrimary)

                Button {
                    launchChat(mode: .voice)
                } label: {
                    VStack(spacing: 8) {
                        Image(systemName: "waveform.badge.mic")
                            .font(.system(size: 30, weight: .bold))
                        Text(isRussianInterface ? "Голосовой чат" : "Voice Chat")
                            .font(.system(size: 24, weight: .black, design: .rounded))
                    }
                    .foregroundColor(.black)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 24)
                    .background(
                        LinearGradient(colors: [.accentOrange, .accentPrimary], startPoint: .leading, endPoint: .trailing)
                    )
                    .clipShape(RoundedRectangle(cornerRadius: 24))
                }
                .buttonStyle(.plain)

                Button {
                    launchChat(mode: .text)
                } label: {
                    HStack {
                        Image(systemName: "text.bubble.fill")
                        Text(isRussianInterface ? "Текстовый чат" : "Text Chat")
                            .font(.appHeadline)
                    }
                    .foregroundColor(.textSecondary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .background(Color.cardBackground)
                    .clipShape(RoundedRectangle(cornerRadius: 20))
                    .overlay(
                        RoundedRectangle(cornerRadius: 20)
                            .stroke(Color.textTertiary.opacity(0.25), lineWidth: 1)
                    )
                }
                .buttonStyle(.plain)

                Spacer()
            }
            .padding(16)
            .background(
                LinearGradient(colors: [.gradientTop, .gradientBottom], startPoint: .topLeading, endPoint: .bottomTrailing)
                    .ignoresSafeArea()
            )
            .navigationTitle("Chat Type")
        }
        .presentationDetents([.medium, .large])
    }

    func optionButton(_ option: ProjectOption) -> some View {
        Button {
            selectedOption = option
        } label: {
            HStack(alignment: .top, spacing: 8) {
                VStack(alignment: .leading, spacing: 4) {
                    TechnicalText(option.title, baseFont: .appHeadline, technicalFont: .appTechnical(size: 16, weight: .bold))
                        .foregroundColor(.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                    TechnicalText(option.details, baseFont: .appCaption, technicalFont: .appTechnical(size: 12, weight: .semibold))
                        .foregroundColor(.textSecondary)
                        .lineLimit(3)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                if option.tags.contains(where: badgeOrder.contains) {
                    BadgeStack(tags: option.tags)
                        .layoutPriority(1)
                }
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(selectedOption == option ? Color.accentPrimary.opacity(0.14) : Color.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .stroke(selectedOption == option ? Color.accentPrimary : Color.clear, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }

    var chipStrip: some View {
        let chips = chips(for: selectedGroup)
        let activeID = activeChipID(for: selectedGroup)
        return ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(chips) { chip in
                    Button {
                        selectedChipByGroup[selectedGroup.id] = chip.id
                    } label: {
                        TechnicalText(
                            chip.label,
                            baseFont: .system(size: 13, weight: .semibold, design: .rounded),
                            technicalFont: .appTechnical(size: 13, weight: .bold)
                        )
                            .foregroundColor(activeID == chip.id ? .black : .textPrimary)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 7)
                            .background(
                                Capsule().fill(activeID == chip.id ? Color.accentPrimary : Color.cardBackground)
                            )
                            .overlay(
                                Capsule().stroke(Color.textTertiary.opacity(activeID == chip.id ? 0 : 0.25), lineWidth: 1)
                            )
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.vertical, 2)
        }
    }

    var chipEmptyState: some View {
        VStack(spacing: 8) {
            Image(systemName: "line.3.horizontal.decrease.circle")
                .font(.system(size: 28, weight: .light))
                .foregroundColor(.textTertiary)
            Text("No matches")
                .font(.system(size: 15, weight: .bold, design: .rounded))
                .foregroundColor(.textPrimary)
            Text("Try the All chip to see everything in this tab.")
                .font(.system(size: 12, weight: .medium, design: .rounded))
                .foregroundColor(.textSecondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 36)
    }

    func chips(for group: ProjectGroup) -> [ProjectChip] {
        switch group {
        case .games:
            return [ProjectChip(id: "all", label: "All"),
                    ProjectChip(id: "genre", label: "🎮 Genre")]
        case .content:
            return [ProjectChip(id: "all", label: "All"),
                    ProjectChip(id: "asset", label: "🎨 Asset"),
                    ProjectChip(id: "system", label: "⚙️ System")]
        case .viral:
            return [ProjectChip(id: "all", label: "All"),
                    ProjectChip(id: "ai", label: "🤖 AI"),
                    ProjectChip(id: "tiktok", label: "⚡ TikTok-ready"),
                    ProjectChip(id: "meme", label: "😂 Meme")]
        }
    }

    func activeChipID(for group: ProjectGroup) -> String {
        selectedChipByGroup[group.id] ?? "all"
    }

    func options(for group: ProjectGroup) -> [ProjectOption] {
        switch group {
        case .games: return gameOptions
        case .content: return contentOptions
        case .viral: return viralOptions
        }
    }

    func filteredOptions(for group: ProjectGroup, chipID: String) -> [ProjectOption] {
        let all = options(for: group)
        guard chipID != "all" else { return all }
        return all.filter { $0.tags.contains(chipID) }
    }

    var badgeOrder: [String] { ["new", "viral", "ai", "tiktok", "economy", "world", "social"] }

    func launchChat(mode: ChatView.EntryChatMode) {
        launchNewChat(mode: mode)
    }

    var gameOptions: [ProjectOption] {
        [
            ProjectOption(id: "obby", title: "Obby", details: "Platform jumps, checkpoints, and progression difficulty.", kind: .game, tags: ["genre", "world"]),
            ProjectOption(id: "tycoon", title: "Tycoon", details: "Base growth, income loops, upgrades, and economy.", kind: .game, tags: ["genre", "economy"]),
            ProjectOption(id: "simulator", title: "Simulator", details: "Pet/mining/fighting/clicking loops, rebirth, multipliers, and shop.", kind: .game, tags: ["genre", "economy"]),
            ProjectOption(id: "rpg", title: "RPG Adventure", details: "NPC quests, classes, enemy camps, loot chests, boss fights, and leveling.", kind: .game, tags: ["genre", "new", "world"]),
            ProjectOption(id: "horror", title: "Horror Escape", details: "Flashlights, keys, locked doors, safe scares, monster chase AI, and escape objectives.", kind: .game, tags: ["genre", "new", "world"]),
            ProjectOption(id: "pvp", title: "PvP Arena", details: "FFA or team rounds, balanced weapons, respawns, cover, timer HUD, and scoreboard.", kind: .game, tags: ["genre", "new", "viral"]),
            // MARK: - Hidden categories (will be restored later)
            // ProjectOption(id: "roleplay", title: "Roleplay / Town", details: "City, jobs, homes, economy, and social systems.", kind: .game),
            // ProjectOption(id: "td", title: "Tower Defense", details: "Enemy waves, tower placement, upgrades, bosses, and co-op.", kind: .game),
            // ProjectOption(id: "racing", title: "Racing", details: "Tracks, vehicle stats, boosts, drift, and leaderboards.", kind: .game),
            // ProjectOption(id: "parkour", title: "Parkour", details: "Wall-run/jump, dash, tricks, rankings, and challenge levels.", kind: .game),
            // ProjectOption(id: "story", title: "Story Game", details: "Cutscenes, branching choices, consequences, and multiple endings.", kind: .game),
            // ProjectOption(id: "minigames", title: "Mini-games Hub", details: "Multiple minigames, lobby flow, and voting systems.", kind: .game),
            // ProjectOption(id: "survival", title: "Survival", details: "Crafting, resources, base building, enemies, and day/night cycle.", kind: .game),
            // ProjectOption(id: "fighting", title: "Fighting", details: "Combo combat, block/dodge, tournaments, and PvP progression.", kind: .game),
            // ProjectOption(id: "custom", title: "Custom", details: "Any genre from the user's custom description.", kind: .game)
        ]
    }

    func launchNewChat(mode: ChatView.EntryChatMode) {
        guard let selectedOption else { return }
        isShowingChatPicker = false
        // Session #179: tiktok_export pivots away from the generic chat flow
        // into the dedicated TikTok Studio screen (post-processing of an
        // OS-level screen recording → Share Kit handoff).
        if selectedOption.id == "tiktok_export" {
            isShowingProjectPicker = false
            isShowingTikTokStudio = true
            return
        }
        // Session 382 Phase 2 — fakeLimited tile pivots to GlowupStudioView
        // (vibe picker → asset pack) instead of the legacy chat flow.
        if selectedOption.id == "fake_limited" {
            isShowingProjectPicker = false
            isShowingChatPicker = false
            isShowingGlowupStudio = true
            return
        }
        if selectedOption.id == "outfit_generator" {
            isShowingProjectPicker = false
            isShowingChatPicker = false
            isShowingOutfitStudio = true
            return
        }
        if selectedOption.id == "cursed_ugc" {
            isShowingProjectPicker = false
            isShowingChatPicker = false
            isShowingCursedUGCStudio = true
            return
        }
        // Session 385 round 7 — Disaster Spawner moved off its dedicated
        // full-screen sheet (DisasterSpawnerStudioView) onto the standard
        // ChatView interview flow, on user request («его надо по флоу
        // сделать как остальные чаты с интервью»). The studio + result
        // views stay in the codebase for reference but the entry point now
        // falls through to the launchConfig path below, which opens
        // ChatView with contentSubcategory="disaster_spawner". Presets and
        // backend dispatch are wired in ChatPresets.swift / index.ts.
        //
        // Session 388 — Voice-to-Aura migrated the same way. The
        // VoiceAuraStudioView one-shot form (mic + style picker + 3
        // modifier rails + Generate button) is replaced by the standard
        // chat interview, on user request («чат войс ту аура надо сделать
        // как все остальные чаты с интервью»). VoiceAuraStudio/View/
        // ResultView files stay (referenced by ViralLibrary tile + share
        // poster), but the fullScreenCover binding becomes unused.
        //
        // Session 389 — Zero-Robux Fitting Room migrated the same way, on
        // user request («сделать чат генерации с интервью как и все чаты»).
        // The dedicated FittingRoomStudioView picker + customize + result
        // sheet is no longer the entry point. The redesigned dress-up
        // FittingRoomResultView still gets opened via the share-poster /
        // ViralLibrary deep-link path, but the Forge tile now falls
        // through to the launchConfig path with
        // contentSubcategory="fitting_room"; presets live in ChatPresets.
        let context = "\(selectedGroup.rawValue) > \(selectedOption.title)"
        launchConfig = ChatLaunchConfig(
            title: "\(selectedOption.title) — \(mode == .voice ? "Voice" : "Text")",
            entryMode: mode,
            projectKind: selectedOption.kind,
            welcomeContext: context,
            resumeSessionId: nil,
            contentSubcategory: selectedOption.id
        )
    }

    var contentOptions: [ProjectOption] {
        [
            ProjectOption(id: "characters", title: "Characters", details: "Playable characters, rigs, avatar-style models, and presentation-ready character assets.", kind: .content, tags: ["asset", "social"]),
            ProjectOption(id: "npcs", title: "NPCs with AI Behavior", details: "Patrol guards, enemies, merchants, dialogue NPCs, companions, and quest givers with scripts.", kind: .content, tags: ["asset", "system", "ai", "social"]),
            // Session 001 (Track 1) — restored after T-Shirt pipeline + subcategory picker landed.
            ProjectOption(id: "clothing", title: "Clothing & Outfits", details: "Classic 2D clothing for Roblox Marketplace: T-Shirts, Shirts, Pants, full outfits — AI-generated and ready to publish.", kind: .ugc, tags: ["asset", "marketplace"]),
            // MARK: - Hidden content categories (will be restored later)
            // ProjectOption(id: "accessories", title: "Accessories", details: "Hats, glasses, wings, backpacks, and extras.", kind: .content),
            // ProjectOption(id: "bodies", title: "Avatar Bodies & Heads", details: "Avatar body and head assets.", kind: .content),
            ProjectOption(id: "weapons", title: "Weapons", details: "Weapons with hit effects, VFX, and SFX.", kind: .content, tags: ["asset"]),
            ProjectOption(id: "vehicles", title: "Vehicles", details: "Cars, bikes, boats, planes, helicopters, tanks, spaceships, and buses with DriveSeat physics, passengers, sounds, and VFX.", kind: .content, tags: ["asset", "system", "world"]),
            ProjectOption(id: "buildings", title: "Buildings & Structures", details: "Houses, shops, castles, bases, arenas — with interiors, furniture, and interactive doors/seats/spawns.", kind: .content, tags: ["asset", "world"]),
            ProjectOption(id: "furniture", title: "Furniture & Props", details: "Chairs, tables, lamps, shelves, rugs, plants, signs — to fill buildings and maps.", kind: .content, tags: ["asset", "world"]),
            ProjectOption(id: "maps", title: "Maps & Environments", details: "Cities, forests, arenas, dungeons, terrain, lighting, rivers, bridges, and sky atmosphere.", kind: .content, tags: ["asset", "world"]),
            ProjectOption(id: "items", title: "Items & Tools", details: "Keys, potions, coins, medkits, resources — with use-logic.", kind: .content, tags: ["asset", "economy"]),
            // Track 3 — pets are back: native blocky pets (default, ~30s, free) via Parts + Motor6D + LLM keyframes;
            // optional 🐾 3D photoreal mesh path via Meshy/Tripo for premium pets.
            ProjectOption(id: "pets", title: "Pets", details: "Blocky pets with follow/leveling/rarity/animations — dog, cat, dragon, unicorn, robot, fantasy. 3D photoreal premium variant available.", kind: .content, tags: ["asset", "new", "social"]),
            ProjectOption(id: "scripts", title: "Scripts / Systems", details: "Pet System, Shop, DataStore, Leaderboard, Inventory, Combat, Daily Rewards, Rebirth, Quest, Dialogue, Day/Night Cycle, Teleportation, or any system by description.", kind: .content, tags: ["system"]),
            ProjectOption(id: "ui", title: "UI / GUI", details: "HUD, menus, windows, and interface systems.", kind: .content, tags: ["system"]),
            ProjectOption(id: "passes", title: "Game Passes & Products", details: "Monetization products and premium passes.", kind: .content, tags: ["system", "economy"]),
            ProjectOption(id: "animations", title: "Animations", details: "Character and object animation packs.", kind: .content, tags: ["asset"]),
            ProjectOption(id: "audio", title: "Audio & Music", details: "Music tracks, ambience, and sound effects.", kind: .content, tags: ["asset"]),
            // ProjectOption(id: "particles", title: "Particles & Effects", details: "VFX particles and visual effects.", kind: .content),
            ProjectOption(id: "decals", title: "Decals & Textures", details: "Decals, textures, and material sets.", kind: .content, tags: ["asset"]),
            // ProjectOption(id: "plugins", title: "Plugins", details: "Studio plugins and utility tools.", kind: .content),
        ]
    }

    var viralOptions: [ProjectOption] {
        [
            ProjectOption(
                id: "disaster_spawner",
                title: "Voice-Controlled Disaster Spawner",
                details: isRussianInterface
                    ? "Скажи или введи свой disaster — AI генерит концепт-арт + safe Roblox Lua loop с auto-cleanup. «Spawn giant ducks every 45 sec». Drop-in .rbxmx для Studio."
                    : "Say or type the disaster you want — AI cooks the concept art + a safe Roblox Lua loop with auto-cleanup. 'Spawn giant ducks every 45 sec'. Drop-in .rbxmx for Studio.",
                kind: .content,
                tags: ["new", "viral", "ai", "tiktok", "survival"]
            ),
            ProjectOption(
                id: "fitting_room",
                title: "Zero-Robux Fitting Room",
                details: isRussianInterface
                    ? "Примерь любой fit на СВОЁМ Roblox-аватаре. AI рисует 3 ракурса (спереди/3-4/сзади), swipe чтобы крутить — pseudo-3D в кармане. Cost breakdown + fake \"saved\" + share poster."
                    : "Try any fit on YOUR Roblox avatar. AI renders 3 angles (front/3-4/back), swipe to rotate — pseudo-3D in your pocket. Cost breakdown + fake 'saved' + share poster.",
                kind: .content,
                tags: ["new", "viral", "ai", "tiktok"]
            ),
            ProjectOption(
                id: "voice_aura",
                title: "Voice-to-Aura",
                details: isRussianInterface
                    ? "Скажи или введи нужную auru — AI генерит концепт-картинку + безопасный Roblox Lua скрипт для частиц. Drop-in для Roblox Studio. «Aura like Sukuna but cooler»."
                    : "Say or type the aura you want — AI generates the concept art + a safe Roblox Lua particle script. Drop-in for Roblox Studio. 'Aura like Sukuna but cooler'.",
                kind: .content,
                tags: ["new", "viral", "ai", "tiktok", "anime"]
            ),
            ProjectOption(
                id: "cursed_ugc",
                title: "Giant & Cursed UGC Modeler",
                details: isRussianInterface
                    ? "AI генерит абсурдные cursed UGC-концепты: гигантские рюкзаки, безумные маски, brainrot-питомцы. Один тап → fake marketplace card готов для TikTok-шера. «bro Roblox needs to add this 💀»."
                    : "AI cooks up absurd cursed UGC concepts: giant backpacks, weird masks, brainrot pets. One tap → fake marketplace card ready for TikTok share. 'bro Roblox needs to add this 💀'.",
                kind: .content,
                tags: ["new", "viral", "ai", "tiktok", "meme"]
            ),
            ProjectOption(
                id: "outfit_generator",
                title: "1-Click Outfit Generator",
                details: isRussianInterface
                    ? "AI собирает полный outfit под популярные эстетики: Baddie, Sigma, Y2K, Goth, Cyber, Anime Demon. Реальные Roblox-айтемы из каталога — один тап → готовый TikTok-ready fit."
                    : "AI assembles a full outfit for trending aesthetics: Baddie, Sigma, Y2K, Goth, Cyber, Anime Demon. Real Roblox catalog items — one tap → TikTok-ready fit.",
                kind: .content,
                tags: ["new", "viral", "ai", "tiktok"]
            ),
            ProjectOption(
                id: "fake_limited",
                title: "Fake Headless & Korblox",
                details: isRussianInterface
                    ? "Соберём иллюзию дорогих лимиток за 0 Robux. AI подбирает бесплатные и дешёвые Catalog-аксессуары, которые визуально имитируют Headless Horseman (31 000 R$) и Korblox Deathspeaker (17 000 R$) — рецепт, превью аватара и инструкция по сборке в Avatar Editor."
                    : "Build the illusion of expensive limiteds for 0 Robux. AI picks free + cheap Catalog accessories that mimic Headless Horseman (31,000 R$) and Korblox Deathspeaker (17,000 R$) — recipe, avatar preview, and Avatar Editor steps.",
                kind: .fakeLimited,
                tags: ["new", "viral", "ai", "tiktok", "economy"]
            ),
            ProjectOption(
                id: "brainrot_sim",
                title: "AI Brainrot & Meme Simulator",
                details: "Steal-a-Brainrot generator: conveyor drops, player bases, cash/sec, base locks, raid alerts, slap defense, rebirth, and meme rarity hype.",
                kind: .game,
                tags: ["new", "viral", "ai", "tiktok", "meme"]
            ),
            ProjectOption(
                id: "roast_npc",
                title: "Smart NPC Roast & Chat Creator",
                details: "Toxic banter, roast lines, and dynamic AI dialogue for guards, mobs, and merchants.",
                kind: .content,
                tags: ["new", "ai", "meme"]
            ),
            ProjectOption(
                id: "anime_skills",
                title: "AI Anime Skill Coder",
                details: "Domain expansions, ult abilities, screen-shaking VFX — anime-grade combat skills.",
                kind: .content,
                tags: ["new", "ai"]
            ),
            ProjectOption(
                id: "obby_troll",
                title: "Obby Troll & Trap Maker",
                details: "Fake floors, decoy checkpoints, surprise launchers — engineered for reaction clips.",
                kind: .game,
                tags: ["new", "viral", "tiktok", "meme"]
            ),
            ProjectOption(
                id: "tiktok_export",
                title: "One-Tap TikTok Gameplay Exporter",
                details: "Export portrait gameplay clips with hooks, captions, and viral overlays in one tap.",
                kind: .content,
                tags: ["tiktok", "viral"]
            )
        ]
    }
}

private struct BadgeStack: View {
    let tags: Set<String>

    var body: some View {
        VStack(alignment: .trailing, spacing: 4) {
            ForEach(visibleBadges, id: \.id) { badge in
                TechnicalText(
                    badge.label,
                    baseFont: .system(size: 10, weight: .black, design: .rounded),
                    technicalFont: .appTechnical(size: 10, weight: .bold)
                )
                    .foregroundColor(badge.foreground)
                    .lineLimit(1)
                    .fixedSize()
                    .padding(.horizontal, 7)
                    .padding(.vertical, 3)
                    .background(Capsule().fill(badge.background))
            }
        }
    }

    private var visibleBadges: [Badge] {
        let order: [String] = ["new", "viral", "ai", "tiktok", "economy", "world", "social"]
        let matched = order.compactMap { tag -> Badge? in
            guard tags.contains(tag) else { return nil }
            return Badge.make(tag: tag)
        }
        return Array(matched.prefix(2))
    }

    private struct Badge {
        let id: String
        let label: String
        let foreground: Color
        let background: Color

        static func make(tag: String) -> Badge? {
            switch tag {
            case "new":
                return Badge(id: "new", label: "🔥 NEW", foreground: .black, background: .accentOrange)
            case "viral":
                return Badge(id: "viral", label: "⚡ VIRAL", foreground: .white, background: Color(red: 0.92, green: 0.20, blue: 0.55))
            case "ai":
                return Badge(id: "ai", label: "🤖 AI", foreground: .black, background: .accentPrimary)
            case "tiktok":
                return Badge(id: "tiktok", label: "▶︎ TIKTOK", foreground: .white, background: .black)
            case "economy":
                return Badge(id: "economy", label: "💰 ECONOMY", foreground: .black, background: Color(red: 1.00, green: 0.80, blue: 0.25))
            case "world":
                return Badge(id: "world", label: "🌍 WORLD", foreground: .white, background: Color(red: 0.18, green: 0.65, blue: 0.45))
            case "social":
                return Badge(id: "social", label: "👥 SOCIAL", foreground: .white, background: Color(red: 0.55, green: 0.40, blue: 0.95))
            default:
                return nil
            }
        }
    }
}

private struct ForgeFlowLayout: Layout {
    var spacing: CGFloat = 4

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let result = arrange(proposal: proposal, subviews: subviews)
        return result.size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = arrange(proposal: proposal, subviews: subviews)
        for (index, subview) in subviews.enumerated() {
            guard index < result.origins.count else { break }
            let origin = CGPoint(x: bounds.minX + result.origins[index].x, y: bounds.minY + result.origins[index].y)
            subview.place(at: origin, proposal: .unspecified)
        }
    }

    private func arrange(proposal: ProposedViewSize, subviews: Subviews) -> (origins: [CGPoint], size: CGSize) {
        let maxWidth = proposal.width ?? .infinity
        var origins: [CGPoint] = []
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        var totalWidth: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > maxWidth, x > 0 {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            origins.append(CGPoint(x: x, y: y))
            rowHeight = max(rowHeight, size.height)
            x += size.width + spacing
            totalWidth = max(totalWidth, x - spacing)
        }
        return (origins, CGSize(width: totalWidth, height: y + rowHeight))
    }
}

private struct ShareableText: Identifiable {
    let id = UUID()
    let text: String
}

private struct ShareSheet: UIViewControllerRepresentable {
    let text: String

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: [text], applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}
