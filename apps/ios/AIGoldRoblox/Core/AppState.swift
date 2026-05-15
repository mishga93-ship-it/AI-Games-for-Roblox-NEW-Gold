//
//  AppState.swift
//  AIGoldRoblox
//

import SwiftUI
#if canImport(FirebaseAuth)
import FirebaseAuth
#endif

struct ForegroundGenerationNotification: Identifiable {
    let id = UUID()
    let type: String
    let title: String
    let subtitle: String
    let actionTitle: String
    let systemImage: String
    let userInfo: [AnyHashable: Any]

    var isSticky: Bool {
        type == "generation_review_needed" || type == "generation_completed"
    }

    var status: String {
        Self.cleanString(userInfo["status"])?.lowercased() ?? ""
    }

    var isPartial: Bool {
        type == "generation_completed" && status == "partial"
    }

    static func make(from userInfo: [AnyHashable: Any], isRu: Bool) -> ForegroundGenerationNotification? {
        guard let type = userInfo["type"] as? String,
              type.hasPrefix("generation_"),
              type != "generation_stage_completed"
        else { return nil }

        let generationTitle = cleanString(userInfo["title"])
            ?? cleanString(userInfo["chatTitle"])
            ?? (isRu ? "Генерация" : "Generation")
        let status = cleanString(userInfo["status"])?.lowercased()
        let title: String
        let actionTitle: String
        let systemImage: String
        switch type {
        case "generation_review_needed":
            title = isRu ? "Нужен апрув" : "Review needed"
            actionTitle = isRu ? "Открыть апрув" : "Open review"
            systemImage = "hand.tap.fill"
        case "generation_completed" where status == "partial":
            title = isRu ? "Частичный экспорт" : "Partial export"
            actionTitle = isRu ? "Открыть превью" : "Open preview"
            systemImage = "exclamationmark.circle.fill"
        case "generation_completed":
            title = isRu ? "Готово к экспорту" : "Ready to export"
            actionTitle = isRu ? "Открыть результат" : "Open result"
            systemImage = "checkmark.seal.fill"
        case "generation_failed", "generation_status_check_failed":
            title = isRu ? "Нужна проверка" : "Needs attention"
            actionTitle = isRu ? "Открыть" : "Open"
            systemImage = "exclamationmark.triangle.fill"
        default:
            title = isRu ? "Генерация обновилась" : "Generation updated"
            actionTitle = isRu ? "Открыть" : "Open"
            systemImage = "sparkles"
        }

        return ForegroundGenerationNotification(
            type: type,
            title: title,
            subtitle: generationTitle,
            actionTitle: actionTitle,
            systemImage: systemImage,
            userInfo: userInfo
        )
    }

    private static func cleanString(_ value: Any?) -> String? {
        guard let string = value as? String else { return nil }
        let trimmed = string.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}

final class AppState: ObservableObject {
    @Published var hasCompletedOnboarding: Bool
    @Published var currentUser: User?
    @Published var selectedRootTab: RootTab
    @Published var isTabBarHidden = false
    @Published var isShowingLaunchScreen = true
    @Published var isRoutingGenerationNotification = false
    @Published var foregroundGenerationNotification: ForegroundGenerationNotification?
    @Published var activeBan: BanInfo?
    @Published private(set) var favoriteContentIDs: Set<String>
    @Published var creationFocus: CreationFocus
    @Published var expertiseLevel: ExpertiseLevel
    @Published var creatorInterests: [CreatorInterest]
    @Published var robloxUsername: String
    @Published var projectSummaries: [ProjectSummary]
    @Published var exportRecords: [ExportRecord]
    @Published var savedAvatarLooks: [SavedAvatarLook]
    @Published var appLanguage: AppLanguage
    @Published var pendingDeepLink: DeepLink?

    private let onboardingKey = "hasCompletedOnboarding"
    private let userKey = "currentUserId"
    private let userProfileKey = "currentUserProfile"
    private let favoriteContentKey = "favoriteContentIDs"
    private let creationFocusKey = "creationFocus"
    private let expertiseLevelKey = "expertiseLevel"
    private let creatorInterestsKey = "creatorInterests"
    private let robloxUsernameKey = "robloxUsername"
    private let exportRecordsKey = "exportRecords"
    private let savedAvatarLooksKey = "savedAvatarLooks"
    private let appLanguageKey = "appLanguage"
    private let hasLaunchedBeforeKey = "hasLaunchedBefore"
    private var hasStartedLaunchFlow = false
    private var tabBarHideDepth = 0
    #if canImport(FirebaseAuth)
    private var authStateHandle: AuthStateDidChangeListenerHandle?
    #endif
    private var banObserver: Any?
    private var stubNavObserver: Any?
    private var generationChatObserver: Any?
    private var generationRouteReadyObserver: Any?
    private var foregroundGenerationObserver: Any?
    private var clearForegroundGenerationObserver: Any?
    private var challengeObserver: Any?
    private var generationRouteResetWorkItem: DispatchWorkItem?
    private var foregroundGenerationResetWorkItem: DispatchWorkItem?
    private var foregroundGenerationAlertedEventKeys: [String: Date] = [:]
    private var suppressAuthListener = false

    init() {
        self.hasCompletedOnboarding = UserDefaults.standard.bool(forKey: onboardingKey)
        if Self.hasPendingGenerationNotification() {
            self.selectedRootTab = .create
        } else if ChallengeRetentionNotifications.hasPendingChallengeRoute {
            self.selectedRootTab = .community
        } else {
            self.selectedRootTab = .home
        }
        self.favoriteContentIDs = Set(UserDefaults.standard.stringArray(forKey: favoriteContentKey) ?? [])
        self.creationFocus = CreationFocus(rawValue: UserDefaults.standard.string(forKey: creationFocusKey) ?? "") ?? .both
        self.expertiseLevel = ExpertiseLevel(rawValue: UserDefaults.standard.string(forKey: expertiseLevelKey) ?? "") ?? .beginner
        self.creatorInterests = (UserDefaults.standard.stringArray(forKey: creatorInterestsKey) ?? [])
            .compactMap(CreatorInterest.init(rawValue:))
        self.robloxUsername = UserDefaults.standard.string(forKey: robloxUsernameKey) ?? ""
        self.appLanguage = AppLanguage(rawValue: UserDefaults.standard.string(forKey: appLanguageKey) ?? "") ?? .en
        self.projectSummaries = []
        self.exportRecords = Self.loadStoredValue(forKey: exportRecordsKey) ?? []
        self.savedAvatarLooks = Self.loadStoredValue(forKey: savedAvatarLooksKey) ?? []
        clearStaleKeychainSessionIfNeeded()
        restoreCurrentUserSession()
        observeAuthStateIfAvailable()
        observeBanNotifications()
        observeStubNavigation()
        observeGenerationChatNavigation()
        observeForegroundGenerationNotifications()
        observeClearForegroundGenerationNotifications()
        observeChallengeNavigation()
    }

    deinit {
        #if canImport(FirebaseAuth)
        if let authStateHandle {
            Auth.auth().removeStateDidChangeListener(authStateHandle)
        }
        #endif
        if let banObserver {
            NotificationCenter.default.removeObserver(banObserver)
        }
        if let stubNavObserver {
            NotificationCenter.default.removeObserver(stubNavObserver)
        }
        if let generationChatObserver {
            NotificationCenter.default.removeObserver(generationChatObserver)
        }
        if let generationRouteReadyObserver {
            NotificationCenter.default.removeObserver(generationRouteReadyObserver)
        }
        if let foregroundGenerationObserver {
            NotificationCenter.default.removeObserver(foregroundGenerationObserver)
        }
        if let clearForegroundGenerationObserver {
            NotificationCenter.default.removeObserver(clearForegroundGenerationObserver)
        }
        if let challengeObserver {
            NotificationCenter.default.removeObserver(challengeObserver)
        }
        generationRouteResetWorkItem?.cancel()
        foregroundGenerationResetWorkItem?.cancel()
    }

    func completeOnboarding() {
        completeOnboarding(
            displayName: currentUser?.displayName ?? "Player",
            gender: currentUser?.gender ?? .preferNotToSay,
            age: currentUser?.age,
            avatarImageData: currentUser?.avatarImageData,
            focus: creationFocus,
            expertise: expertiseLevel,
            interests: creatorInterests.isEmpty ? [.obby, .ugc, .scripts] : creatorInterests,
            robloxUsername: robloxUsername
        )
    }

    func completeOnboarding(
        displayName: String,
        gender: ProfileGender,
        age: Int?,
        avatarImageData: Data?,
        focus: CreationFocus,
        expertise: ExpertiseLevel,
        interests: [CreatorInterest],
        robloxUsername: String
    ) {
        hasCompletedOnboarding = true
        creationFocus = focus
        expertiseLevel = expertise
        creatorInterests = interests
        self.robloxUsername = robloxUsername.trimmingCharacters(in: .whitespacesAndNewlines)

        UserDefaults.standard.set(true, forKey: onboardingKey)
        UserDefaults.standard.set(focus.rawValue, forKey: creationFocusKey)
        UserDefaults.standard.set(expertise.rawValue, forKey: expertiseLevelKey)
        UserDefaults.standard.set(interests.map(\.rawValue), forKey: creatorInterestsKey)
        UserDefaults.standard.set(self.robloxUsername, forKey: robloxUsernameKey)

        updateCurrentUser(
            displayName: displayName,
            gender: gender,
            age: age,
            avatarImageData: avatarImageData
        )
    }

    func setUser(_ user: User) {
        let mergedUser = mergeWithStoredProfile(user)
        currentUser = mergedUser
        saveUser(mergedUser)
        PushNotificationRegistrar.registerStoredTokenIfPossible()
        Task { @MainActor in ChatHistoryStore.shared.reloadForCurrentUser() }
    }

    func updateCurrentUser(
        displayName: String,
        gender: ProfileGender,
        age: Int?,
        avatarImageData: Data?
    ) {
        guard var user = currentUser else { return }
        let trimmedDisplayName = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        let finalName = trimmedDisplayName.isEmpty ? "Player" : trimmedDisplayName
        user.displayName = finalName
        user.gender = gender
        user.age = age
        user.avatarImageData = avatarImageData

        suppressAuthListener = true
        // Save directly — bypass mergeWithStoredProfile which would overwrite with old stored name
        currentUser = user
        saveUser(user)

        #if canImport(FirebaseAuth)
        if FirebaseBootstrap.configureIfNeeded(), let firebaseUser = Auth.auth().currentUser {
            let changeRequest = firebaseUser.createProfileChangeRequest()
            changeRequest.displayName = finalName
            Task {
                try? await changeRequest.commitChanges()
                await MainActor.run { self.suppressAuthListener = false }
            }
        } else {
            suppressAuthListener = false
        }
        #else
        suppressAuthListener = false
        #endif
    }

    func signOut() {
        try? AuthService().signOut()
        clearStoredUser()
        currentUser = nil
        activeBan = nil
        Task { @MainActor in ChatHistoryStore.shared.reloadForCurrentUser() }
    }

    func deleteAccount() async throws {
        try await AuthService().deleteAccount()
        await clearLocalStateAfterDelete()
    }

    /// Bug 19: Retry path when Firebase required a fresh session. The caller
    /// has already prompted the user for the email password, so we can
    /// reauthenticate and delete in one shot.
    func reauthenticateAndDeleteAccount(password: String) async throws {
        try await AuthService().reauthenticateAndDelete(password: password)
        await clearLocalStateAfterDelete()
    }

    @MainActor
    func reauthenticateWithGoogleAndDeleteAccount() async throws {
        try await AuthService().reauthenticateWithGoogleAndDelete()
        await clearLocalStateAfterDelete()
    }

    func reauthenticateWithAppleAndDeleteAccount(idToken: String, rawNonce: String, fullName: PersonNameComponents?) async throws {
        try await AuthService().reauthenticateWithAppleAndDelete(idToken: idToken, rawNonce: rawNonce, fullName: fullName)
        await clearLocalStateAfterDelete()
    }

    @MainActor
    private func clearLocalStateAfterDelete() {
        clearStoredUser()
        currentUser = nil
        activeBan = nil
        hasCompletedOnboarding = false
        UserDefaults.standard.removeObject(forKey: onboardingKey)
        ChatHistoryStore.shared.reloadForCurrentUser()
    }

    func handleBan(_ ban: BanInfo) {
        activeBan = ban
    }

    func clearBanIfExpired() {
        guard let ban = activeBan else { return }
        if !ban.permanent, let until = ban.bannedUntilDate, until <= Date() {
            activeBan = nil
        }
    }

    func isFavorite(contentID: String) -> Bool {
        favoriteContentIDs.contains(contentID)
    }

    func toggleFavorite(contentID: String) {
        if favoriteContentIDs.contains(contentID) {
            favoriteContentIDs.remove(contentID)
        } else {
            favoriteContentIDs.insert(contentID)
        }
        UserDefaults.standard.set(Array(favoriteContentIDs).sorted(), forKey: favoriteContentKey)
    }

    func setSelectedRootTab(_ tab: RootTab) {
        selectedRootTab = tab
    }

    func pushTabBarHidden() {
        tabBarHideDepth += 1
        isTabBarHidden = tabBarHideDepth > 0
    }

    func popTabBarHidden() {
        tabBarHideDepth = max(0, tabBarHideDepth - 1)
        isTabBarHidden = tabBarHideDepth > 0
    }

    func resumeProject(_ project: ProjectSummary) {
        selectedRootTab = .create
        if let idx = projectSummaries.firstIndex(where: { $0.id == project.id }) {
            projectSummaries[idx].updatedAt = Date()
        }
    }

    @discardableResult
    func saveAvatarLook(
        previewPNGData: Data,
        rigType: AvatarRigType,
        bodyType: AvatarBodyType
    ) throws -> SavedAvatarLook {
        let id = UUID().uuidString
        let fileName = "saved-avatar-\(id).png"
        let destination = avatarLooksDirectory().appendingPathComponent(fileName)
        try previewPNGData.write(to: destination, options: .atomic)

        let look = SavedAvatarLook(
            id: id,
            name: "\(rigType.displayName) \(bodyType.displayName)",
            createdAt: Date(),
            previewFileName: fileName,
            rigType: rigType.displayName,
            bodyType: bodyType.displayName
        )

        savedAvatarLooks.insert(look, at: 0)
        persistSavedAvatarLooks()
        return look
    }

    func previewURL(for look: SavedAvatarLook) -> URL {
        avatarLooksDirectory().appendingPathComponent(look.previewFileName)
    }

    func handleIncomingURL(_ url: URL) {
        if url.scheme == "aigoldroblox" { return }
        guard let deepLink = DeepLinkManager.parse(url: url) else { return }
        pendingDeepLink = deepLink
    }

    func addExportRecord(title: String, format: String, destination: String) {
        exportRecords.insert(
            ExportRecord(title: title, format: format, destination: destination),
            at: 0
        )
        persistExportRecords()
    }

    @Published var creatorBadges: [String] = []

    var creatorStats: [CreatorStat] {
        [
            CreatorStat(title: "Projects", value: "\(projectSummaries.count)", color: .accentPrimary),
            CreatorStat(title: "Active", value: "\(activeProjectCount)", color: .accentSecondary),
            CreatorStat(title: "Ready", value: "\(readyProjectCount)", color: .accentOrange),
            CreatorStat(title: "Avg Progress", value: "\(averageProjectProgress)%", color: .accentTeal),
            CreatorStat(title: "Exports", value: "\(exportRecords.count)", color: .accentPrimary),
            CreatorStat(title: "Favorites", value: "\(favoriteContentIDs.count)", color: .accentSecondary),
            CreatorStat(title: "Interests", value: "\(creatorInterests.count)", color: .accentOrange),
            CreatorStat(title: "Profile", value: "\(profileCompletionScore)%", color: .accentTeal)
        ]
    }

    private var activeProjectCount: Int {
        projectSummaries.filter { $0.progress < 1 && !$0.status.localizedCaseInsensitiveContains("ready") }.count
    }

    private var readyProjectCount: Int {
        projectSummaries.filter { $0.status.localizedCaseInsensitiveContains("ready") || $0.progress >= 0.85 }.count
    }

    private var averageProjectProgress: Int {
        guard !projectSummaries.isEmpty else { return 0 }
        let total = projectSummaries.reduce(0) { $0 + $1.progress }
        return Int((total / Double(projectSummaries.count) * 100).rounded())
    }

    private var profileCompletionScore: Int {
        guard let user = currentUser else { return 0 }
        let completedItems = [
            !user.displayName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
            user.avatarImageData != nil,
            user.gender != .preferNotToSay,
            user.age != nil,
            !robloxUsername.isEmpty
        ]
        let completedCount = completedItems.filter { $0 }.count
        return Int((Double(completedCount) / Double(completedItems.count) * 100).rounded())
    }

    func startLaunchFlowIfNeeded() {
        guard !hasStartedLaunchFlow else { return }
        hasStartedLaunchFlow = true

        Task {
            let startedAt = Date()
            let preloadTask = Task(priority: .userInitiated) {
                await DropboxService.shared.loadAllSections()
            }

            let _ = await withTaskGroup(of: Bool.self) { group in
                group.addTask {
                    _ = await preloadTask.value
                    return true
                }
                group.addTask {
                    try? await Task.sleep(nanoseconds: 5_000_000_000)
                    return false
                }

                let result = await group.next() ?? false
                group.cancelAll()
                return result
            }

            let minimumAnimationDuration: TimeInterval = 1.4
            let elapsed = Date().timeIntervalSince(startedAt)
            if elapsed < minimumAnimationDuration {
                let remaining = minimumAnimationDuration - elapsed
                try? await Task.sleep(nanoseconds: UInt64(remaining * 1_000_000_000))
            }

            await MainActor.run {
                if Self.hasPendingGenerationNotification() {
                    self.selectedRootTab = .create
                } else if ChallengeRetentionNotifications.hasPendingChallengeRoute {
                    self.selectedRootTab = .community
                }
                withAnimation(.easeInOut(duration: 0.35)) {
                    self.isShowingLaunchScreen = false
                }
            }
        }
    }

    private static func hasPendingGenerationNotification() -> Bool {
        let defaults = UserDefaults.standard
        return defaults.string(forKey: "pendingGenerationNotification.jobId") != nil
            || defaults.string(forKey: "pendingGenerationNotification.threadId") != nil
    }

    func preparePendingGenerationNotificationRouteIfNeeded() {
        guard Self.hasPendingGenerationNotification() else { return }
        beginGenerationNotificationRoute()
    }

    func preparePendingChallengeNotificationRouteIfNeeded() {
        guard ChallengeRetentionNotifications.hasPendingChallengeRoute else { return }
        openChallengesFromNotification()
    }

    private static func loadStoredValue<T: Decodable>(forKey key: String) -> T? {
        guard let data = UserDefaults.standard.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }

    private func loadStoredUser() -> User? {
        guard let data = UserDefaults.standard.data(forKey: userProfileKey) else { return nil }
        return try? JSONDecoder().decode(User.self, from: data)
    }

    /// iOS Keychain persists across app uninstall/reinstall, but UserDefaults does not.
    /// If UserDefaults flag is missing but Firebase has a cached user, this is a fresh install
    /// with a stale Keychain session — sign out to force re-authentication.
    private func clearStaleKeychainSessionIfNeeded() {
        let hasLaunchedBefore = UserDefaults.standard.bool(forKey: hasLaunchedBeforeKey)
        if !hasLaunchedBefore {
            #if canImport(FirebaseAuth)
            if FirebaseBootstrap.configureIfNeeded() {
                try? Auth.auth().signOut()
            }
            #endif
            UserDefaults.standard.removeObject(forKey: userKey)
            UserDefaults.standard.removeObject(forKey: userProfileKey)
            UserDefaults.standard.removeObject(forKey: onboardingKey)
            UserDefaults.standard.set(true, forKey: hasLaunchedBeforeKey)
        }
    }

    private func restoreCurrentUserSession() {
        #if canImport(FirebaseAuth)
        if FirebaseBootstrap.configureIfNeeded(), let firebaseUser = Auth.auth().currentUser {
            setUser(firebaseBackedUser(from: firebaseUser))
            return
        }
        #endif

        clearStoredUser()
        currentUser = nil
    }

    private func clearStoredUser() {
        UserDefaults.standard.removeObject(forKey: userKey)
        UserDefaults.standard.removeObject(forKey: userProfileKey)
    }

    private func saveUser(_ user: User) {
        currentUser = user
        UserDefaults.standard.set(user.id, forKey: userKey)
        if let data = try? JSONEncoder().encode(user) {
            UserDefaults.standard.set(data, forKey: userProfileKey)
        }
    }

    private func observeBanNotifications() {
        banObserver = NotificationCenter.default.addObserver(
            forName: .userBanned, object: nil, queue: .main
        ) { [weak self] notification in
            guard let self, let ban = notification.object as? BanInfo else { return }
            self.activeBan = ban
        }
    }

    private func observeStubNavigation() {
        stubNavObserver = NotificationCenter.default.addObserver(
            forName: .smartStubNavigate, object: nil, queue: .main
        ) { [weak self] notification in
            guard let self else { return }
            if let rawTab = notification.userInfo?["tab"] as? Int,
               let tab = RootTab(rawValue: rawTab) {
                self.selectedRootTab = tab
            }
        }
    }

    private func observeGenerationChatNavigation() {
        generationChatObserver = NotificationCenter.default.addObserver(
            forName: .openGenerationChat, object: nil, queue: .main
        ) { [weak self] _ in
            self?.beginGenerationNotificationRoute()
        }

        generationRouteReadyObserver = NotificationCenter.default.addObserver(
            forName: .generationNotificationRouteReady, object: nil, queue: .main
        ) { [weak self] _ in
            self?.finishGenerationNotificationRoute()
        }
    }

    private func observeForegroundGenerationNotifications() {
        foregroundGenerationObserver = NotificationCenter.default.addObserver(
            forName: .foregroundGenerationNotification, object: nil, queue: .main
        ) { [weak self] notification in
            guard let self,
                  let userInfo = notification.userInfo,
                  let foregroundNotification = ForegroundGenerationNotification.make(
                    from: userInfo,
                    isRu: self.appLanguage == .ru
                  )
            else { return }
            // Session 338 round 2: TTL was 120s which felt like alerts were
            // "lost" — a retry from backend or status refresh from history
            // store was silently dropped for up to two minutes. 30s is still
            // enough to swallow concurrent posts from FCM + history sync, but
            // lets a fresh notification through if the user actually missed
            // the first one.
            let eventKey = Self.foregroundGenerationAlertKey(for: userInfo, type: foregroundNotification.type)
            let dedupeWindow: TimeInterval = 30
            let now = Date()
            self.foregroundGenerationAlertedEventKeys = self.foregroundGenerationAlertedEventKeys.filter {
                now.timeIntervalSince($0.value) < dedupeWindow
            }
            if let previousAlertedAt = self.foregroundGenerationAlertedEventKeys[eventKey],
               now.timeIntervalSince(previousAlertedAt) < dedupeWindow {
                return
            }
            self.foregroundGenerationAlertedEventKeys[eventKey] = now
            self.foregroundGenerationResetWorkItem?.cancel()
            self.foregroundGenerationResetWorkItem = nil
            self.foregroundGenerationNotification = foregroundNotification
            if !foregroundNotification.isSticky {
                self.scheduleForegroundGenerationReset(after: 9)
            }
        }
    }

    /// Session 338: removes the sticky `Needs approval` overlay when the user
    /// has acted on the concept locally (and any stale system banner).
    private func observeClearForegroundGenerationNotifications() {
        clearForegroundGenerationObserver = NotificationCenter.default.addObserver(
            forName: .clearForegroundGenerationAlert, object: nil, queue: .main
        ) { [weak self] notification in
            guard let self else { return }
            let userInfo = notification.userInfo ?? [:]
            let targetJobId = Self.cleanNotificationString(userInfo["jobId"]) ?? ""
            let targetType = Self.cleanNotificationString(userInfo["type"]) ?? ""

            if let active = self.foregroundGenerationNotification {
                let activeJobId = Self.cleanNotificationString(active.userInfo["jobId"]) ?? ""
                let typeMatches = targetType.isEmpty || active.type == targetType
                let jobMatches = !targetJobId.isEmpty && activeJobId == targetJobId
                if jobMatches && typeMatches {
                    self.clearForegroundGenerationNotification()
                }
            }

            if !targetJobId.isEmpty,
               targetType == "generation_review_needed" || targetType.isEmpty {
                let jobPrefix = "job:\(targetJobId):"
                self.foregroundGenerationAlertedEventKeys = self.foregroundGenerationAlertedEventKeys.filter { key, _ in
                    !key.hasPrefix(jobPrefix)
                }
            }
        }
    }

    private func observeChallengeNavigation() {
        challengeObserver = NotificationCenter.default.addObserver(
            forName: .openChallenges, object: nil, queue: .main
        ) { [weak self] _ in
            self?.openChallengesFromNotification()
        }
    }

    private func beginGenerationNotificationRoute() {
        selectedRootTab = .create
        isRoutingGenerationNotification = true
        // Session 338: previously 5 sec, which felt like a UI hang when the
        // target chat couldn't post `.generationNotificationRouteReady` (e.g.
        // session not in ChatHistory yet). 1.8 sec is enough for the tab
        // switch + ChatView mount, and the explicit ready signal still wins
        // when it arrives sooner.
        scheduleGenerationRouteReset(after: 1.8)
    }

    private func finishGenerationNotificationRoute() {
        scheduleGenerationRouteReset(after: 0.25)
    }

    private func scheduleGenerationRouteReset(after delay: TimeInterval) {
        generationRouteResetWorkItem?.cancel()
        let workItem = DispatchWorkItem { [weak self] in
            self?.isRoutingGenerationNotification = false
            self?.generationRouteResetWorkItem = nil
        }
        generationRouteResetWorkItem = workItem
        DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: workItem)
    }

    func openForegroundGenerationNotification(_ notification: ForegroundGenerationNotification) {
        clearForegroundGenerationNotification()
        NotificationCenter.default.post(
            name: .openGenerationChat,
            object: nil,
            userInfo: notification.userInfo
        )
    }

    func clearForegroundGenerationNotification() {
        foregroundGenerationResetWorkItem?.cancel()
        foregroundGenerationResetWorkItem = nil
        foregroundGenerationNotification = nil
    }

    private func scheduleForegroundGenerationReset(after delay: TimeInterval) {
        foregroundGenerationResetWorkItem?.cancel()
        let workItem = DispatchWorkItem { [weak self] in
            self?.foregroundGenerationNotification = nil
            self?.foregroundGenerationResetWorkItem = nil
        }
        foregroundGenerationResetWorkItem = workItem
        DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: workItem)
    }

    private static func foregroundGenerationAlertKey(for userInfo: [AnyHashable: Any], type: String) -> String {
        let jobId = cleanNotificationString(userInfo["jobId"])
            ?? cleanNotificationString(userInfo["generationJobId"])
            ?? ""
        let threadId = cleanNotificationString(userInfo["threadId"]) ?? ""
        let status = cleanNotificationString(userInfo["status"])?.lowercased() ?? ""
        if !jobId.isEmpty {
            return "job:\(jobId):\(type):\(status)"
        }
        if !threadId.isEmpty {
            return "thread:\(threadId):\(type):\(status)"
        }
        let title = cleanNotificationString(userInfo["title"])
            ?? cleanNotificationString(userInfo["chatTitle"])
            ?? ""
        return "fallback:\(type):\(status):\(title)"
    }

    private static func cleanNotificationString(_ value: Any?) -> String? {
        guard let string = value as? String else { return nil }
        let trimmed = string.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    private func openChallengesFromNotification() {
        selectedRootTab = .community
        pendingDeepLink = .challenges
        ChallengeRetentionNotifications.clearPendingChallengeRoute()
    }

    #if canImport(FirebaseAuth)
    private func observeAuthStateIfAvailable() {
        guard FirebaseBootstrap.configureIfNeeded() else { return }
        authStateHandle = Auth.auth().addStateDidChangeListener { [weak self] _, user in
            guard let self else { return }
            DispatchQueue.main.async {
                guard !self.suppressAuthListener else { return }
                if let user {
                    self.setUser(self.firebaseBackedUser(from: user))
                } else {
                    self.clearStoredUser()
                    self.currentUser = nil
                }
            }
        }
    }

    private func firebaseBackedUser(from user: FirebaseAuth.User) -> User {
        let trimmedName = user.displayName?.trimmingCharacters(in: .whitespacesAndNewlines)
        return User(
            id: user.uid,
            displayName: (trimmedName?.isEmpty == false ? trimmedName! : "User"),
            email: user.email
        )
    }
    #else
    private func observeAuthStateIfAvailable() {}
    #endif

    private func mergeWithStoredProfile(_ user: User) -> User {
        guard let storedUser = loadStoredUser(), storedUser.id == user.id else {
            return user
        }

        var mergedUser = user
        let storedDisplayName = storedUser.displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        if !storedDisplayName.isEmpty, storedDisplayName != "Player" {
            mergedUser.displayName = storedDisplayName
        }
        if mergedUser.email == nil {
            mergedUser.email = storedUser.email
        }
        if let avatarUrl = storedUser.avatarUrl {
            mergedUser.avatarUrl = avatarUrl
        }
        if let avatarImageData = storedUser.avatarImageData {
            mergedUser.avatarImageData = avatarImageData
        }
        if storedUser.gender != .preferNotToSay {
            mergedUser.gender = storedUser.gender
        }
        if let age = storedUser.age {
            mergedUser.age = age
        }
        if let bio = storedUser.bio, !bio.isEmpty {
            mergedUser.bio = bio
        }

        return mergedUser
    }

    private func persistExportRecords() {
        if let data = try? JSONEncoder().encode(exportRecords) {
            UserDefaults.standard.set(data, forKey: exportRecordsKey)
        }
    }

    private func persistSavedAvatarLooks() {
        if let data = try? JSONEncoder().encode(savedAvatarLooks) {
            UserDefaults.standard.set(data, forKey: savedAvatarLooksKey)
        }
    }

    private func avatarLooksDirectory() -> URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
        let directory = base.appendingPathComponent("SavedAvatarLooks", isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory
    }
}

struct User: Identifiable, Codable {
    let id: String
    var displayName: String
    var email: String?
    var avatarUrl: String?
    var avatarImageData: Data?
    var gender: ProfileGender
    var age: Int?
    var bio: String?

    init(
        id: String,
        displayName: String,
        email: String?,
        avatarUrl: String? = nil,
        avatarImageData: Data? = nil,
        gender: ProfileGender = .preferNotToSay,
        age: Int? = nil,
        bio: String? = nil
    ) {
        self.id = id
        self.displayName = displayName
        self.email = email
        self.avatarUrl = avatarUrl
        self.avatarImageData = avatarImageData
        self.gender = gender
        self.age = age
        self.bio = bio
    }
}

enum ProfileGender: String, CaseIterable, Identifiable, Codable {
    case male = "Male"
    case female = "Female"
    case nonBinary = "Non-binary"
    case preferNotToSay = "Prefer not to say"

    var id: String { rawValue }
}

enum RootTab: Int, CaseIterable {
    case home
    case create
    case community
    case profile
}

enum CreationFocus: String, CaseIterable, Identifiable {
    case games = "Games"
    case content = "Content"
    case both = "Both"

    var id: String { rawValue }
}

enum ExpertiseLevel: String, CaseIterable, Identifiable {
    case beginner = "Beginner"
    case advanced = "Advanced"
    case developer = "Developer"

    var id: String { rawValue }

    var detail: String {
        switch self {
        case .beginner:
            return "More guidance, defaults, and visual help."
        case .advanced:
            return "Balanced control with smarter assumptions."
        case .developer:
            return "Fast mode with technical controls."
        }
    }
}

enum AppLanguage: String, CaseIterable, Identifiable {
    case en, ru, es, pt, de, fr, zh, ja, ko

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .en: return "English"
        case .ru: return "Русский"
        case .es: return "Español"
        case .pt: return "Português"
        case .de: return "Deutsch"
        case .fr: return "Français"
        case .zh: return "中文"
        case .ja: return "日本語"
        case .ko: return "한국어"
        }
    }

    var flag: String {
        switch self {
        case .en: return "🇺🇸"
        case .ru: return "🇷🇺"
        case .es: return "🇪🇸"
        case .pt: return "🇧🇷"
        case .de: return "🇩🇪"
        case .fr: return "🇫🇷"
        case .zh: return "🇨🇳"
        case .ja: return "🇯🇵"
        case .ko: return "🇰🇷"
        }
    }
}

enum CreatorInterest: String, CaseIterable, Identifiable {
    case obby = "Obby"
    case tycoon = "Tycoon"
    case ugc = "UGC"
    case scripts = "Scripts"
    case npcs = "NPCs"
    case effects = "Effects"
    case horror = "Horror"
    case simulator = "Simulator"

    var id: String { rawValue }

    var icon: String {
        switch self {
        case .obby: return "figure.run"
        case .tycoon: return "building.2.fill"
        case .ugc: return "sparkles.rectangle.stack"
        case .scripts: return "chevron.left.forwardslash.chevron.right"
        case .npcs: return "person.3.fill"
        case .effects: return "wand.and.stars"
        case .horror: return "eye.trianglebadge.exclamationmark"
        case .simulator: return "dial.high.fill"
        }
    }
}

enum ProjectKind: String {
    case game = "Game"
    case content = "Content"
    case fix = "Fix"
    case clone = "Clone"
    case ugc = "UGC"
    case analyze = "Analyze"

    var icon: String {
        switch self {
        case .game: return "gamecontroller.fill"
        case .content: return "shippingbox.fill"
        case .fix: return "stethoscope"
        case .clone: return "square.on.square.fill"
        case .ugc: return "person.crop.rectangle.stack.fill"
        case .analyze: return "chart.xyaxis.line"
        }
    }
}

struct ProjectSummary: Identifiable {
    let id: String
    let title: String
    let subtitle: String
    let kind: ProjectKind
    var status: String
    var updatedAt: Date
    let accentColor: Color
    let tags: [String]
    let progress: Double
}

struct ExportRecord: Identifiable, Codable {
    let id: UUID
    let title: String
    let format: String
    let destination: String

    init(id: UUID = UUID(), title: String, format: String, destination: String) {
        self.id = id
        self.title = title
        self.format = format
        self.destination = destination
    }
}

struct SavedAvatarLook: Identifiable, Codable {
    let id: String
    let name: String
    let createdAt: Date
    let previewFileName: String
    let rigType: String
    let bodyType: String
}

struct CreatorStat: Identifiable {
    let id = UUID()
    let title: String
    let value: String
    let color: Color
}
