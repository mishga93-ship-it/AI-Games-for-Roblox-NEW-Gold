//
//  ChatHistoryStore.swift
//  AIGoldRoblox
//

import Foundation
import SwiftUI
#if canImport(UIKit)
import UIKit
#endif
#if canImport(FirebaseAuth)
import FirebaseAuth
#endif

@MainActor
final class ChatHistoryStore: ObservableObject {
    static let shared = ChatHistoryStore()

    @Published private(set) var sessions: [ChatSession] = []
    @Published var sessionToDelete: ChatSession?
    @Published private(set) var archivedIds: Set<String> = []
    @Published private(set) var isSyncingRemote = false

    private static let storageKeyPrefix = "chatHistory.sessions"
    private static let archivedIdsKey = "chatHistory.archivedIds"
    /// Session 338 round 2: previously a Set without TTL — once an alert was
    /// posted for `<jobId>:<event>`, the same event would never re-fire even
    /// after the user dismissed the overlay or relaunched. Switched to a
    /// timestamped dict so missed alerts can re-surface after 30s.
    private var foregroundAlertedGenerationEventKeys: [String: Date] = [:]
    private static let foregroundAlertDedupeWindow: TimeInterval = 30

    private var currentUserId: String? {
        #if canImport(FirebaseAuth)
        return Auth.auth().currentUser?.uid
        #else
        return nil
        #endif
    }

    private var storageKey: String {
        if let uid = currentUserId { return "\(Self.storageKeyPrefix).\(uid)" }
        return Self.storageKeyPrefix
    }

    struct ChatSession: Identifiable, Codable {
        let id: String
        var title: String
        let category: String
        let projectKind: String
        let chatMode: String
        let createdAt: Date
        var updatedAt: Date
        var isStarred: Bool
        var messageCount: Int
        var lastMessagePreview: String
        var lastJobId: String?
        var contentSubcategory: String?
        var generationStatus: GenerationStatus?
    }

    struct GenerationStatus: Codable, Equatable {
        let jobId: String
        let title: String
        let status: String
        let statusLabel: String
        let detailLabel: String
        let iconName: String
        let completedStageCount: Int
        let totalStageCount: Int
        let updatedAt: Date

        var isActive: Bool {
            !["completed", "partial", "awaiting_review", "failed", "watcher_error"].contains(status)
        }

        var isReady: Bool {
            status == "completed"
        }

        var isPartial: Bool {
            status == "partial"
        }

        var needsReview: Bool {
            status == "awaiting_review"
        }

        var needsAttention: Bool {
            status == "failed" || status == "watcher_error"
        }

        var progressLabel: String? {
            guard totalStageCount > 0 else { return nil }
            // Session 391 round 7 — a "Ready to export" (completed) row must
            // read N/N even if the persisted completedStageCount is 0. Viral
            // chat handlers finish the job without marking their stages
            // complete, and old rows were persisted as 0/1. Render-side clamp
            // so both new and already-saved completed rows show full progress.
            let shown = (status == "completed") ? totalStageCount : min(completedStageCount, totalStageCount)
            return "\(shown)/\(totalStageCount)"
        }

        var digest: String {
            [
                jobId,
                status,
                statusLabel,
                detailLabel,
                "\(completedStageCount)",
                "\(totalStageCount)"
            ].joined(separator: "|")
        }
    }

    init() {
        sessions = Self.deduplicated(loadSessionsForCurrentUser())
        archivedIds = loadArchivedIds()
    }

    func reloadForCurrentUser() {
        sessions = Self.deduplicated(loadSessionsForCurrentUser())
        foregroundAlertedGenerationEventKeys.removeAll()
        if sessions.isEmpty && currentUserId != nil {
            Task { await syncFromRemote() }
        }
    }

    /// Fetches threads from the server and populates local sessions when empty.
    func syncFromRemote() async {
        guard currentUserId != nil, !isSyncingRemote else { return }
        isSyncingRemote = true
        defer { isSyncingRemote = false }
        do {
            let remoteThreads = try await AIWorkspaceAPI.fetchThreads()
            guard !remoteThreads.isEmpty else { return }
            let existingIds = Set(sessions.map(\.id))
            let formatter = ISO8601DateFormatter()
            var added = false
            for thread in remoteThreads {
                let date = formatter.date(from: thread.updatedAt) ?? Date()
                let session = ChatSession(
                    id: thread.id,
                    title: thread.title,
                    category: thread.promptHint,
                    projectKind: thread.projectKind ?? ProjectKind.game.rawValue,
                    chatMode: "text",
                    createdAt: date,
                    updatedAt: date,
                    isStarred: false,
                    messageCount: 0,
                    lastMessagePreview: thread.title,
                    lastJobId: thread.projectMemory?.latestJobId ?? thread.latestJobId,
                    contentSubcategory: thread.projectMemory?.contentSubcategory ?? thread.contentSubcategory,
                    generationStatus: nil
                )
                if let idx = sessions.firstIndex(where: { $0.id == thread.id }) {
                    sessions[idx] = Self.merged(primary: sessions[idx], secondary: session)
                } else if let idx = Self.duplicateIndex(for: session, in: sessions) {
                    sessions[idx] = Self.merged(primary: session, secondary: sessions[idx])
                } else if !existingIds.contains(thread.id) {
                    sessions.append(session)
                }
                added = true
            }
            if added {
                persist()
            }
        } catch {
            // Server unreachable; local-only until next attempt
        }
    }

    // MARK: - Public API

    func saveSession(
        id: String,
        title: String,
        category: String,
        projectKind: ProjectKind,
        chatMode: ChatView.EntryChatMode,
        messageCount: Int,
        lastMessagePreview: String,
        lastJobId: String? = nil,
        contentSubcategory: String? = nil,
        generationStatus: GenerationStatus? = nil
    ) {
        let incoming = ChatSession(
            id: id,
            title: title,
            category: category,
            projectKind: projectKind.rawValue,
            chatMode: chatMode == .voice ? "voice" : "text",
            createdAt: Date(),
            updatedAt: Date(),
            isStarred: false,
            messageCount: messageCount,
            lastMessagePreview: String(lastMessagePreview.prefix(120)),
            lastJobId: lastJobId,
            contentSubcategory: contentSubcategory,
            generationStatus: generationStatus
        )
        let existingIndex = sessions.firstIndex(where: { $0.id == id })
            ?? Self.duplicateIndex(for: incoming, in: sessions)
        let previousStatus = existingIndex.flatMap { sessions[$0].generationStatus }
        let updatedSession: ChatSession
        if let idx = existingIndex {
            sessions[idx] = Self.merged(primary: incoming, secondary: sessions[idx])
            updatedSession = sessions[idx]
        } else {
            sessions.insert(incoming, at: 0)
            updatedSession = incoming
        }
        if existingIndex != nil {
            postForegroundGenerationAlertIfNeeded(for: updatedSession, previousStatus: previousStatus)
        }
        persist()
    }

    func updateGenerationStatus(
        sessionId: String,
        status: GenerationStatus?,
        lastJobId: String? = nil,
        contentSubcategory: String? = nil
    ) {
        let candidate = ChatSession(
            id: sessionId,
            title: status?.title ?? "",
            category: "",
            projectKind: ProjectKind.game.rawValue,
            chatMode: "text",
            createdAt: Date(),
            updatedAt: Date(),
            isStarred: false,
            messageCount: 0,
            lastMessagePreview: status?.detailLabel ?? "",
            lastJobId: lastJobId ?? status?.jobId,
            contentSubcategory: contentSubcategory,
            generationStatus: status
        )
        guard let idx = sessions.firstIndex(where: { $0.id == sessionId })
            ?? Self.duplicateIndex(for: candidate, in: sessions) else {
            print("[UpdateGenStatus] SKIP — no matching session id=\(sessionId) jobId=\(lastJobId ?? "nil") sessionsCount=\(sessions.count)")
            return
        }
        let previousStatus = sessions[idx].generationStatus
        sessions[idx].updatedAt = Date()
        sessions[idx].generationStatus = status
        if let lastJobId { sessions[idx].lastJobId = lastJobId }
        if let contentSubcategory { sessions[idx].contentSubcategory = contentSubcategory }
        print("[UpdateGenStatus] OK id=\(sessions[idx].id) requestedId=\(sessionId) jobId=\(sessions[idx].lastJobId ?? "nil") status=\(status?.status ?? "nil") foundByDup=\(sessions[idx].id != sessionId)")
        postForegroundGenerationAlertIfNeeded(for: sessions[idx], previousStatus: previousStatus)
        persist()
    }

    func rename(_ session: ChatSession, to newTitle: String) {
        guard let idx = sessions.firstIndex(where: { $0.id == session.id }) else { return }
        sessions[idx].title = newTitle
        persist()
    }

    func toggleStar(_ session: ChatSession) {
        guard let idx = sessions.firstIndex(where: { $0.id == session.id }) else { return }
        sessions[idx].isStarred.toggle()
        persist()
    }

    func archiveThread(id: String) {
        archivedIds.insert(id)
        persistArchivedIds()
    }

    func unarchiveThread(id: String) {
        archivedIds.remove(id)
        persistArchivedIds()
    }

    func delete(_ session: ChatSession) {
        sessions.removeAll { $0.id == session.id }
        archivedIds.remove(session.id)
        deleteMessages(for: session.id)
        persist()
        persistArchivedIds()
        Self.deleteRemote(ids: [session.id])
    }

    /// Session 391 round 8 — bulk delete for multi-select in the Forge chat
    /// history list. Removes all sessions whose id is in `ids`, wipes their
    /// per-session message files + archived flags, then persists once (not
    /// per-row) so the list updates in a single pass.
    func delete(ids: Set<String>) {
        guard !ids.isEmpty else { return }
        sessions.removeAll { ids.contains($0.id) }
        for id in ids {
            archivedIds.remove(id)
            deleteMessages(for: id)
        }
        persist()
        persistArchivedIds()
        Self.deleteRemote(ids: ids)
    }

    /// Fire-and-forget server-side deletion so a deleted chat can't resurrect
    /// from `syncFromRemote()` after the local store empties (e.g. a reinstall
    /// wipes UserDefaults, then the empty-store path re-fetches threads). The
    /// local removal above is the source of truth.
    ///
    /// Sends the whole batch in ONE bulk request. The previous per-id loop fired
    /// a burst of DELETEs that tripped the server's 30-req/60s rate limiter —
    /// the 429'd ones silently survived and reappeared on reinstall. One request
    /// also completes faster, which matters because users often delete-then-
    /// reinstall before slow background traffic finishes.
    private static func deleteRemote(ids: Set<String>) {
        let ids = Array(ids).filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        guard !ids.isEmpty else { return }
        print("[ChatHistoryStore][deleteRemote] bulk-deleting \(ids.count) thread(s)")
        Task.detached {
            do {
                try await AIWorkspaceAPI.deleteThreads(ids: ids)
                print("[ChatHistoryStore][deleteRemote] bulk OK (\(ids.count))")
            } catch {
                print("[ChatHistoryStore][deleteRemote] bulk FAIL error=\(error)")
            }
        }
    }

    // MARK: - Message persistence (file-based)

    func saveMessages(_ messages: [ChatMessage], for sessionId: String) {
        let url = messagesFileURL(for: sessionId)
        do {
            let data = try JSONEncoder().encode(messages)
            try data.write(to: url, options: .atomic)
            print("[ChatHistoryStore] saveMessages OK id=\(sessionId) count=\(messages.count) bytes=\(data.count) path=\(url.path)")
        } catch {
            print("[ChatHistoryStore] saveMessages FAILED id=\(sessionId) error=\(error)")
        }
    }

    func loadMessages(for sessionId: String) -> [ChatMessage] {
        let url = messagesFileURL(for: sessionId)
        let exists = FileManager.default.fileExists(atPath: url.path)
        guard let data = try? Data(contentsOf: url) else {
            print("[ChatHistoryStore] loadMessages MISS id=\(sessionId) exists=\(exists) path=\(url.path)")
            return []
        }
        do {
            let decoded = try JSONDecoder().decode([ChatMessage].self, from: data)
            print("[ChatHistoryStore] loadMessages OK id=\(sessionId) count=\(decoded.count) bytes=\(data.count)")
            return decoded
        } catch {
            print("[ChatHistoryStore] loadMessages DECODE FAIL id=\(sessionId) bytes=\(data.count) error=\(error)")
            return []
        }
    }

    private func deleteMessages(for sessionId: String) {
        let url = messagesFileURL(for: sessionId)
        try? FileManager.default.removeItem(at: url)
    }

    private func messagesFileURL(for sessionId: String) -> URL {
        let dir = messagesDirectory()
        return dir.appendingPathComponent("chat-\(sessionId).json")
    }

    private func messagesDirectory() -> URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
        let subfolder = currentUserId.map { "ChatMessages/\($0)" } ?? "ChatMessages"
        let dir = base.appendingPathComponent(subfolder, isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    func exportText(for session: ChatSession) -> String {
        var lines: [String] = []
        lines.append("Chat: \(session.title)")
        lines.append("Category: \(session.category)")
        lines.append("Mode: \(session.chatMode)")
        lines.append("Created: \(Self.dateFormatter.string(from: session.createdAt))")
        lines.append("Updated: \(Self.dateFormatter.string(from: session.updatedAt))")
        lines.append("Messages: \(session.messageCount)")
        lines.append("")

        let messages = loadMessages(for: session.id)
        if messages.isEmpty {
            lines.append("Last message preview:")
            lines.append(session.lastMessagePreview)
        } else {
            for msg in messages {
                let role = msg.role == .user ? "You" : "AI"
                lines.append("[\(role)] \(msg.content)")
            }
        }
        return lines.joined(separator: "\n")
    }

    var sortedSessions: [ChatSession] {
        sessions.sorted { lhs, rhs in
            if lhs.isStarred != rhs.isStarred { return lhs.isStarred }
            return lhs.updatedAt > rhs.updatedAt
        }
    }

    private static func deduplicated(_ source: [ChatSession]) -> [ChatSession] {
        var result: [ChatSession] = []
        for session in source.sorted(by: { $0.updatedAt > $1.updatedAt }) {
            if let index = duplicateIndex(for: session, in: result) {
                result[index] = merged(primary: result[index], secondary: session)
            } else {
                result.append(session)
            }
        }
        return result.sorted { lhs, rhs in
            if lhs.isStarred != rhs.isStarred { return lhs.isStarred }
            return lhs.updatedAt > rhs.updatedAt
        }
    }

    private static func duplicateIndex(for session: ChatSession, in sessions: [ChatSession]) -> Int? {
        if let key = jobIdentityKey(for: session) {
            return sessions.firstIndex { jobIdentityKey(for: $0) == key }
        }

        guard hasGenerationMarker(session) else { return nil }
        let signature = fallbackSignature(for: session)
        guard !signature.isEmpty else { return nil }
        return sessions.firstIndex { candidate in
            guard hasGenerationMarker(candidate),
                  fallbackSignature(for: candidate) == signature else { return false }
            return abs(candidate.updatedAt.timeIntervalSince(session.updatedAt)) < 120
        }
    }

    private static func merged(primary: ChatSession, secondary: ChatSession) -> ChatSession {
        let primaryIsNewer = primary.updatedAt >= secondary.updatedAt
        let title = primary.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? secondary.title : primary.title
        let preview = primary.lastMessagePreview.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? secondary.lastMessagePreview
            : primary.lastMessagePreview
        let status = newestStatus(primary.generationStatus, secondary.generationStatus)

        return ChatSession(
            id: primary.id,
            title: title,
            category: primary.category,
            projectKind: primary.projectKind,
            chatMode: primary.chatMode,
            createdAt: min(primary.createdAt, secondary.createdAt),
            updatedAt: max(primary.updatedAt, secondary.updatedAt),
            isStarred: primary.isStarred || secondary.isStarred,
            messageCount: max(primary.messageCount, secondary.messageCount),
            lastMessagePreview: primaryIsNewer ? preview : secondary.lastMessagePreview,
            lastJobId: normalizedJobId(primary.lastJobId)
                ?? normalizedJobId(primary.generationStatus?.jobId)
                ?? normalizedJobId(secondary.lastJobId)
                ?? normalizedJobId(secondary.generationStatus?.jobId),
            contentSubcategory: primary.contentSubcategory ?? secondary.contentSubcategory,
            generationStatus: status
        )
    }

    private static func newestStatus(_ lhs: GenerationStatus?, _ rhs: GenerationStatus?) -> GenerationStatus? {
        guard let lhs else { return rhs }
        guard let rhs else { return lhs }
        return lhs.updatedAt >= rhs.updatedAt ? lhs : rhs
    }

    private static func jobIdentityKey(for session: ChatSession) -> String? {
        guard let jobId = normalizedJobId(session.generationStatus?.jobId)
            ?? normalizedJobId(session.lastJobId) else { return nil }
        return "job:\(jobId)"
    }

    private static func normalizedJobId(_ value: String?) -> String? {
        let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? nil : trimmed
    }

    private static func hasGenerationMarker(_ session: ChatSession) -> Bool {
        session.generationStatus != nil || normalizedJobId(session.lastJobId) != nil
    }

    private static func fallbackSignature(for session: ChatSession) -> String {
        [
            normalizedText(session.title),
            normalizedText(session.lastMessagePreview),
            normalizedText(session.generationStatus?.statusLabel ?? "")
        ].joined(separator: "|")
    }

    private static func normalizedText(_ text: String) -> String {
        text
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
            .components(separatedBy: .whitespacesAndNewlines)
            .filter { !$0.isEmpty }
            .joined(separator: " ")
    }

    private func postForegroundGenerationAlertIfNeeded(
        for session: ChatSession,
        previousStatus: GenerationStatus?
    ) {
        guard let status = session.generationStatus,
              let event = Self.foregroundGenerationEvent(for: status)
        else { return }
        guard previousStatus?.jobId != status.jobId || previousStatus?.status != status.status else { return }

        let eventKey = "\(status.jobId):\(event)"
        let now = Date()
        foregroundAlertedGenerationEventKeys = foregroundAlertedGenerationEventKeys.filter {
            now.timeIntervalSince($0.value) < Self.foregroundAlertDedupeWindow
        }
        if let previousPostedAt = foregroundAlertedGenerationEventKeys[eventKey],
           now.timeIntervalSince(previousPostedAt) < Self.foregroundAlertDedupeWindow {
            return
        }
        #if canImport(UIKit)
        guard UIApplication.shared.applicationState == .active else { return }
        #endif

        foregroundAlertedGenerationEventKeys[eventKey] = now
        let title = Self.cleanNotificationString(session.title)
            ?? Self.cleanNotificationString(status.title)
            ?? "Generation"
        var userInfo: [String: Any] = [
            "type": event,
            "jobId": status.jobId,
            "threadId": session.id,
            "title": title,
            "chatTitle": title,
            "projectKind": session.projectKind,
            "route": "generation",
            "screen": "generation_preview",
            "action": Self.foregroundGenerationAction(for: event),
            "status": status.status,
        ]
        if let contentSubcategory = Self.cleanNotificationString(session.contentSubcategory) {
            userInfo["contentSubcategory"] = contentSubcategory
        }
        NotificationCenter.default.post(
            name: .foregroundGenerationNotification,
            object: nil,
            userInfo: userInfo
        )
    }

    private static func foregroundGenerationEvent(for status: GenerationStatus) -> String? {
        switch status.status {
        case "awaiting_review":
            return "generation_review_needed"
        case "completed", "partial":
            return "generation_completed"
        case "failed":
            return "generation_failed"
        case "watcher_error":
            return "generation_status_check_failed"
        default:
            return nil
        }
    }

    private static func foregroundGenerationAction(for event: String) -> String {
        switch event {
        case "generation_review_needed":
            return "open_review"
        case "generation_failed", "generation_status_check_failed":
            return "open_retry"
        default:
            return "open_preview"
        }
    }

    private static func cleanNotificationString(_ value: String?) -> String? {
        let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? nil : trimmed
    }

    // MARK: - Persistence

    private func persist() {
        sessions = Self.deduplicated(sessions)
        guard let data = try? JSONEncoder().encode(sessions) else { return }
        UserDefaults.standard.set(data, forKey: storageKey)
    }

    private func loadSessionsForCurrentUser() -> [ChatSession] {
        guard let data = UserDefaults.standard.data(forKey: storageKey) else { return [] }
        return (try? JSONDecoder().decode([ChatSession].self, from: data)) ?? []
    }

    private func persistArchivedIds() {
        let arr = Array(archivedIds)
        UserDefaults.standard.set(arr, forKey: Self.archivedIdsKey)
    }

    private func loadArchivedIds() -> Set<String> {
        let arr = UserDefaults.standard.stringArray(forKey: Self.archivedIdsKey) ?? []
        return Set(arr)
    }

    private static let dateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateStyle = .medium
        f.timeStyle = .short
        return f
    }()
}
