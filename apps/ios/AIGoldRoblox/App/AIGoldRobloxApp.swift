//
//  AIGoldRobloxApp.swift
//  AIGoldRoblox
//
//  AI Voice to Games & Mods for Roblox
//

import SwiftUI
import UIKit
import UserNotifications
import os
#if canImport(FirebaseCore)
import FirebaseCore
#endif
#if canImport(FirebaseMessaging)
import FirebaseMessaging
#endif
#if canImport(GoogleSignIn)
import GoogleSignIn
#endif
#if canImport(TikTokOpenSDKCore)
import TikTokOpenSDKCore
#endif

final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        FirebaseBootstrap.configureIfNeeded()
        UITabBar.appearance().isHidden = true

        UNUserNotificationCenter.current().delegate = self
        registerNotificationCategories()
        removeQueuedGenerationStageNotifications()
        #if canImport(FirebaseMessaging)
        Messaging.messaging().delegate = self
        #endif
        application.registerForRemoteNotifications()

        // Session 338 round 10: re-assert our UNUserNotificationCenter delegate
        // whenever the app comes back to foreground. Some integrations (older
        // Firebase swizzling paths, GoogleSignIn, etc.) can silently overwrite
        // the delegate, which causes `willPresent` to never be called — pushes
        // then arrive only into Notification Center and no banner / overlay
        // shows up while the app is open.
        NotificationCenter.default.addObserver(
            forName: UIApplication.didBecomeActiveNotification,
            object: nil,
            queue: .main
        ) { _ in
            let center = UNUserNotificationCenter.current()
            if center.delegate !== self {
                print("[PUSH][didBecomeActive] UNUserNotificationCenter delegate was reset (was: \(String(describing: center.delegate))) — re-asserting")
                center.delegate = self
            }
            #if canImport(FirebaseMessaging)
            if Messaging.messaging().delegate !== self {
                print("[PUSH][didBecomeActive] Messaging delegate was reset — re-asserting")
                Messaging.messaging().delegate = self
            }
            #endif
        }

        return true
    }

    func application(
        _ app: UIApplication,
        open url: URL,
        options: [UIApplication.OpenURLOptionsKey: Any] = [:]
    ) -> Bool {
        // Session #179: TikTok Share Kit callback (`tiktok<CLIENT_KEY>://share?...`).
        // Routed before Google so SDK can mark the share request as completed.
        #if canImport(TikTokOpenSDKCore)
        if url.scheme?.hasPrefix("tiktok") == true,
           TikTokURLHandler.handleOpenURL(url) {
            Task { @MainActor in TikTokShareService.clearActiveShareRequest() }
            return true
        }
        #endif
        #if canImport(GoogleSignIn)
        return GIDSignIn.sharedInstance.handle(url)
        #else
        return false
        #endif
    }

    func application(
        _ application: UIApplication,
        continue userActivity: NSUserActivity,
        restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
    ) -> Bool {
        #if canImport(TikTokOpenSDKCore)
        if let url = userActivity.webpageURL,
           TikTokURLHandler.handleOpenURL(url) {
            Task { @MainActor in TikTokShareService.clearActiveShareRequest() }
            return true
        }
        #endif
        return false
    }

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        print("[PUSH][didRegisterForRemoteNotifications] APNs token registered, length=\(deviceToken.count)")
        #if canImport(FirebaseMessaging)
        Messaging.messaging().apnsToken = deviceToken
        Messaging.messaging().token { token, error in
            if let error {
                PushNotificationRegistrar.logTokenRefreshFailure(error)
                return
            }
            guard let token else { return }
            PushNotificationRegistrar.storeAndRegister(token)
            Messaging.messaging().subscribe(toTopic: "challenges")
        }
        #endif
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        PushNotificationRegistrar.logAPNsRegistrationFailure(error)
    }

    // Foreground notifications should surface only meaningful user actions.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        let userInfo = notification.request.content.userInfo
        // Session 338 round 9: diagnostic logging to figure out why
        // foreground pushes sometimes don't render any UI.
        print("[PUSH][willPresent] fired; userInfo=\(userInfo)")
        let generationNotification = normalizedGenerationNotificationUserInfo(
            from: userInfo,
            fallbackTitle: notification.request.content.title,
            fallbackCategory: notification.request.content.categoryIdentifier
        )
        print("[PUSH][willPresent] normalizedType=\(generationNotification?.type ?? "nil")")
        #if canImport(FirebaseMessaging)
        Messaging.messaging().appDidReceiveMessage(userInfo)
        #endif
        if generationNotification?.type == "generation_stage_completed" {
            completionHandler([.badge])
            return
        }
        if let generationNotification {
            let jobId = Self.cleanNotificationString(generationNotification.userInfo["jobId"])
            if generationNotification.type == "generation_review_needed",
               let jobId,
               GenerationPushSuppression.isApproved(jobId: jobId) {
                print("[PUSH][willPresent] suppressed review for approved jobId=\(jobId)")
                GenerationPushSuppression.removeDeliveredNotifications(for: jobId)
                completionHandler([])
                return
            }
            print("[PUSH][willPresent] posting foreground alert + returning [.banner,.list,.sound,.badge]")
            postForegroundGenerationAlert(generationNotification)
            completionHandler([.banner, .list, .sound, .badge])
            return
        }
        print("[PUSH][willPresent] no generation type detected; returning full options")

        completionHandler([.banner, .list, .badge, .sound])
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let rawUserInfo = response.notification.request.content.userInfo
        let generationNotification = normalizedGenerationNotificationUserInfo(
            from: rawUserInfo,
            fallbackTitle: response.notification.request.content.title,
            fallbackCategory: response.notification.request.content.categoryIdentifier
        )
        let userInfo = generationNotification?.userInfo ?? rawUserInfo
        #if canImport(FirebaseMessaging)
        Messaging.messaging().appDidReceiveMessage(userInfo)
        #endif
        if ChallengeRetentionNotifications.handleNotificationTap(userInfo) {
            completionHandler()
            return
        }
        // Session 338: drop stale `generation_review_needed` taps for jobs the
        // user has already approved locally — they should not re-open the
        // review screen.
        if generationNotification?.type == "generation_review_needed",
           let jobId = Self.cleanNotificationString(userInfo["jobId"]),
           GenerationPushSuppression.isApproved(jobId: jobId) {
            GenerationPushSuppression.removeDeliveredNotifications(for: jobId)
            completionHandler()
            return
        }
        if let type = generationNotification?.type ?? Self.cleanNotificationString(userInfo["type"]),
           type.hasPrefix("generation_") {
            UserDefaults.standard.set(userInfo["jobId"] as? String, forKey: "pendingGenerationNotification.jobId")
            UserDefaults.standard.set(userInfo["threadId"] as? String, forKey: "pendingGenerationNotification.threadId")
            UserDefaults.standard.set(userInfo["projectKind"] as? String, forKey: "pendingGenerationNotification.projectKind")
            UserDefaults.standard.set(userInfo["contentSubcategory"] as? String, forKey: "pendingGenerationNotification.contentSubcategory")
            UserDefaults.standard.set(userInfo["title"] as? String, forKey: "pendingGenerationNotification.title")
            UserDefaults.standard.set(type, forKey: "pendingGenerationNotification.type")
            UserDefaults.standard.set(userInfo["route"] as? String, forKey: "pendingGenerationNotification.route")
            UserDefaults.standard.set(userInfo["screen"] as? String, forKey: "pendingGenerationNotification.screen")
            UserDefaults.standard.set(userInfo["action"] as? String, forKey: "pendingGenerationNotification.action")
            UserDefaults.standard.set(userInfo["status"] as? String, forKey: "pendingGenerationNotification.status")

            let postRoute = {
                NotificationCenter.default.post(name: .openGenerationChat, object: nil, userInfo: userInfo)
            }
            if Thread.isMainThread {
                postRoute()
            } else {
                DispatchQueue.main.async(execute: postRoute)
            }
        }
        completionHandler()
    }

    func application(
        _ application: UIApplication,
        didReceiveRemoteNotification userInfo: [AnyHashable: Any],
        fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void
    ) {
        print("[PUSH][didReceiveRemoteNotification] fired; appState=\(UIApplication.shared.applicationState.rawValue) userInfo=\(userInfo)")
        #if canImport(FirebaseMessaging)
        Messaging.messaging().appDidReceiveMessage(userInfo)
        #endif
        let didPostForegroundAlert = postForegroundGenerationAlertIfActive(userInfo)
        print("[PUSH][didReceiveRemoteNotification] didPostForegroundAlert=\(didPostForegroundAlert)")
        completionHandler(didPostForegroundAlert ? .newData : .noData)
    }

    @discardableResult
    private func postForegroundGenerationAlertIfActive(
        _ userInfo: [AnyHashable: Any],
        fallbackTitle: String? = nil,
        fallbackCategory: String? = nil
    ) -> Bool {
        guard UIApplication.shared.applicationState == .active,
              let notification = normalizedGenerationNotificationUserInfo(
                from: userInfo,
                fallbackTitle: fallbackTitle,
                fallbackCategory: fallbackCategory
              ),
              notification.type != "generation_stage_completed"
        else { return false }

        if notification.type == "generation_review_needed",
           let jobId = Self.cleanNotificationString(notification.userInfo["jobId"]),
           GenerationPushSuppression.isApproved(jobId: jobId) {
            GenerationPushSuppression.removeDeliveredNotifications(for: jobId)
            return false
        }

        postForegroundGenerationAlert(notification)
        return true
    }

    private func postForegroundGenerationAlert(_ notification: NormalizedGenerationNotification) {
        let postForegroundAlert = {
            NotificationCenter.default.post(
                name: .foregroundGenerationNotification,
                object: nil,
                userInfo: notification.userInfo
            )
        }
        if Thread.isMainThread {
            postForegroundAlert()
        } else {
            DispatchQueue.main.async(execute: postForegroundAlert)
        }
    }

    private struct NormalizedGenerationNotification {
        let type: String
        let userInfo: [AnyHashable: Any]
    }

    private func normalizedGenerationNotificationUserInfo(
        from userInfo: [AnyHashable: Any],
        fallbackTitle: String? = nil,
        fallbackCategory: String? = nil
    ) -> NormalizedGenerationNotification? {
        guard let type = Self.generationNotificationType(
            from: userInfo,
            fallbackCategory: fallbackCategory
        ) else { return nil }

        var normalized = userInfo
        normalized["type"] = type
        if Self.cleanNotificationString(normalized["title"]) == nil,
           let fallbackTitle = Self.cleanNotificationString(fallbackTitle) {
            normalized["title"] = fallbackTitle
        }
        if Self.cleanNotificationString(normalized["chatTitle"]) == nil,
           let title = Self.cleanNotificationString(normalized["title"]) {
            normalized["chatTitle"] = title
        }

        return NormalizedGenerationNotification(type: type, userInfo: normalized)
    }

    private static func generationNotificationType(
        from userInfo: [AnyHashable: Any],
        fallbackCategory: String? = nil
    ) -> String? {
        if let explicitType = payloadString(userInfo, keys: ["type"]),
           explicitType.hasPrefix("generation_") {
            return explicitType
        }

        let category = payloadString(userInfo, keys: ["category", "gcm.notification.category"])
            ?? apsString(userInfo, key: "category")
            ?? cleanNotificationString(fallbackCategory)
        if let category = category?.uppercased() {
            if category.contains("GENERATION_REVIEW") { return "generation_review_needed" }
            if category.contains("GENERATION_READY") { return "generation_completed" }
            if category.contains("GENERATION_FAILED") { return "generation_failed" }
            if category.contains("GENERATION_PROGRESS") { return "generation_stage_completed" }
        }

        let action = payloadString(userInfo, keys: ["action"])?.lowercased()
        if action == "open_review" || action == "open_approval" {
            return "generation_review_needed"
        }
        if action == "open_retry" {
            return "generation_failed"
        }

        let status = payloadString(userInfo, keys: ["status", "generationStatus"])?.lowercased()
        switch status {
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

    private static func payloadString(_ userInfo: [AnyHashable: Any], keys: [String]) -> String? {
        for key in keys {
            if let value = cleanNotificationString(userInfo[key]) {
                return value
            }
        }
        return nil
    }

    private static func apsString(_ userInfo: [AnyHashable: Any], key: String) -> String? {
        guard let aps = dictionary(from: userInfo["aps"]) else { return nil }
        return cleanNotificationString(aps[key])
    }

    private static func dictionary(from value: Any?) -> [AnyHashable: Any]? {
        if let dictionary = value as? [AnyHashable: Any] {
            return dictionary
        }
        if let dictionary = value as? [String: Any] {
            return Dictionary(uniqueKeysWithValues: dictionary.map { (AnyHashable($0.key), $0.value) })
        }
        return nil
    }

    private static func cleanNotificationString(_ value: Any?) -> String? {
        if let string = value as? String {
            let trimmed = string.trimmingCharacters(in: .whitespacesAndNewlines)
            return trimmed.isEmpty ? nil : trimmed
        }
        if let number = value as? NSNumber {
            return number.stringValue
        }
        return nil
    }

    private func registerNotificationCategories() {
        let openGenerationEN = UNNotificationAction(
            identifier: "OPEN_GENERATION_CHAT",
            title: "Open generation",
            options: [.foreground]
        )
        let openGenerationRU = UNNotificationAction(
            identifier: "OPEN_GENERATION_CHAT",
            title: "Открыть генерацию",
            options: [.foreground]
        )
        let openApprovalEN = UNNotificationAction(
            identifier: "OPEN_GENERATION_APPROVAL",
            title: "Open approval",
            options: [.foreground]
        )
        let openApprovalRU = UNNotificationAction(
            identifier: "OPEN_GENERATION_APPROVAL",
            title: "Открыть апрув",
            options: [.foreground]
        )
        let openIssueEN = UNNotificationAction(
            identifier: "OPEN_GENERATION_ISSUE",
            title: "Open issue",
            options: [.foreground]
        )
        let openIssueRU = UNNotificationAction(
            identifier: "OPEN_GENERATION_ISSUE",
            title: "Открыть ошибку",
            options: [.foreground]
        )
        let openChallengeEN = UNNotificationAction(
            identifier: "OPEN_CHALLENGES",
            title: "Open challenge",
            options: [.foreground]
        )
        let openChallengeRU = UNNotificationAction(
            identifier: "OPEN_CHALLENGES",
            title: "Открыть челлендж",
            options: [.foreground]
        )
        let categories: Set<UNNotificationCategory> = [
            UNNotificationCategory(identifier: "GENERATION_PROGRESS_EN", actions: [openGenerationEN], intentIdentifiers: [], options: []),
            UNNotificationCategory(identifier: "GENERATION_PROGRESS_RU", actions: [openGenerationRU], intentIdentifiers: [], options: []),
            UNNotificationCategory(identifier: "GENERATION_REVIEW_EN", actions: [openApprovalEN], intentIdentifiers: [], options: []),
            UNNotificationCategory(identifier: "GENERATION_REVIEW_RU", actions: [openApprovalRU], intentIdentifiers: [], options: []),
            UNNotificationCategory(identifier: "GENERATION_READY_EN", actions: [openGenerationEN], intentIdentifiers: [], options: []),
            UNNotificationCategory(identifier: "GENERATION_READY_RU", actions: [openGenerationRU], intentIdentifiers: [], options: []),
            UNNotificationCategory(identifier: "GENERATION_FAILED_EN", actions: [openIssueEN], intentIdentifiers: [], options: []),
            UNNotificationCategory(identifier: "GENERATION_FAILED_RU", actions: [openIssueRU], intentIdentifiers: [], options: []),
            UNNotificationCategory(identifier: "CHALLENGE_RETENTION_EN", actions: [openChallengeEN], intentIdentifiers: [], options: []),
            UNNotificationCategory(identifier: "CHALLENGE_RETENTION_RU", actions: [openChallengeRU], intentIdentifiers: [], options: []),
        ]
        UNUserNotificationCenter.current().setNotificationCategories(categories)
    }

    private func removeQueuedGenerationStageNotifications() {
        let center = UNUserNotificationCenter.current()
        center.getPendingNotificationRequests { requests in
            let identifiers = requests.compactMap { request -> String? in
                request.content.userInfo["type"] as? String == "generation_stage_completed" ? request.identifier : nil
            }
            if !identifiers.isEmpty {
                center.removePendingNotificationRequests(withIdentifiers: identifiers)
            }
        }
        center.getDeliveredNotifications { notifications in
            let identifiers = notifications.compactMap { notification -> String? in
                notification.request.content.userInfo["type"] as? String == "generation_stage_completed"
                    ? notification.request.identifier
                    : nil
            }
            if !identifiers.isEmpty {
                center.removeDeliveredNotifications(withIdentifiers: identifiers)
            }
        }
    }
}

enum ChallengeRetentionNotifications {
    private static let reminderIdentifier = "challenge-retention-inactive-3h"
    private static let pendingTypeKey = "pendingChallengeNotification.type"
    private static let pendingChallengeIdKey = "pendingChallengeNotification.challengeId"
    private static let pendingTitleKey = "pendingChallengeNotification.title"
    private static let lastAppOpenKey = "challengeRetention.lastAppOpenAt"
    private static let lastGenerationKey = "challengeRetention.lastGenerationAt"
    private static let notificationDelay: TimeInterval = 3 * 60 * 60

    static var hasPendingChallengeRoute: Bool {
        UserDefaults.standard.string(forKey: pendingTypeKey) != nil
    }

    static func recordAppOpened() {
        UserDefaults.standard.set(Date(), forKey: lastAppOpenKey)
        cancelInactiveChallengeReminder(removeDelivered: true)
    }

    static func recordGenerationStarted() {
        UserDefaults.standard.set(Date(), forKey: lastGenerationKey)
        cancelInactiveChallengeReminder(removeDelivered: false)
    }

    static func scheduleInactiveChallengeReminder() {
        guard challengeNotificationsEnabled else {
            cancelInactiveChallengeReminder(removeDelivered: false)
            return
        }

        UNUserNotificationCenter.current().getNotificationSettings { settings in
            let allowed: Bool
            switch settings.authorizationStatus {
            case .authorized, .provisional, .ephemeral:
                allowed = true
            default:
                allowed = false
            }
            guard allowed else { return }

            let isRu = preferredLanguageCode() == "ru"
            let content = UNMutableNotificationContent()
            content.title = isRu ? "Новый челлендж ждёт" : "New challenge waiting"
            content.body = isRu
                ? "Не заходили уже 3 часа. Вернитесь и соберите проект для еженедельного челленджа."
                : "You have been away for 3 hours. Jump back in and build something for the weekly challenge."
            content.sound = .default
            content.categoryIdentifier = isRu ? "CHALLENGE_RETENTION_RU" : "CHALLENGE_RETENTION_EN"
            content.userInfo = [
                "type": "challenge_retention",
                "route": "challenges",
                "screen": "challenges",
                "action": "open_challenges",
                "lastAppOpenAt": isoString(for: UserDefaults.standard.object(forKey: lastAppOpenKey) as? Date),
                "lastGenerationAt": isoString(for: UserDefaults.standard.object(forKey: lastGenerationKey) as? Date),
            ]

            let request = UNNotificationRequest(
                identifier: reminderIdentifier,
                content: content,
                trigger: UNTimeIntervalNotificationTrigger(timeInterval: notificationDelay, repeats: false)
            )
            let center = UNUserNotificationCenter.current()
            center.removePendingNotificationRequests(withIdentifiers: [reminderIdentifier])
            center.add(request)
        }
    }

    static func handleNotificationTap(_ userInfo: [AnyHashable: Any]) -> Bool {
        guard isChallengeNotification(userInfo) else { return false }
        persistPendingChallengeRoute(userInfo)
        let postRoute = {
            NotificationCenter.default.post(name: .openChallenges, object: nil, userInfo: userInfo)
        }
        if Thread.isMainThread {
            postRoute()
        } else {
            DispatchQueue.main.async(execute: postRoute)
        }
        return true
    }

    static func clearPendingChallengeRoute() {
        let defaults = UserDefaults.standard
        defaults.removeObject(forKey: pendingTypeKey)
        defaults.removeObject(forKey: pendingChallengeIdKey)
        defaults.removeObject(forKey: pendingTitleKey)
    }

    private static var challengeNotificationsEnabled: Bool {
        let defaults = UserDefaults.standard
        guard defaults.object(forKey: "notifyChallenges") != nil else { return true }
        return defaults.bool(forKey: "notifyChallenges")
    }

    private static func cancelInactiveChallengeReminder(removeDelivered: Bool) {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [reminderIdentifier])
        if removeDelivered {
            center.removeDeliveredNotifications(withIdentifiers: [reminderIdentifier])
        }
    }

    private static func isChallengeNotification(_ userInfo: [AnyHashable: Any]) -> Bool {
        let type = userInfo["type"] as? String ?? ""
        let route = userInfo["route"] as? String ?? ""
        return route == "challenges"
            || type == "new_challenge"
            || type.hasPrefix("challenge_")
    }

    private static func persistPendingChallengeRoute(_ userInfo: [AnyHashable: Any]) {
        let defaults = UserDefaults.standard
        defaults.set(userInfo["type"] as? String ?? "challenge_notification", forKey: pendingTypeKey)
        if let challengeId = userInfo["challengeId"] as? String {
            defaults.set(challengeId, forKey: pendingChallengeIdKey)
        }
        if let title = userInfo["title"] as? String {
            defaults.set(title, forKey: pendingTitleKey)
        }
    }

    private static func preferredLanguageCode() -> String {
        if let appLanguage = UserDefaults.standard.string(forKey: "appLanguage")?.lowercased(),
           appLanguage.hasPrefix("ru") {
            return "ru"
        }
        if let deviceLanguage = Locale.preferredLanguages.first?.lowercased(),
           deviceLanguage.hasPrefix("ru") {
            return "ru"
        }
        return "en"
    }

    private static func isoString(for date: Date?) -> String {
        guard let date else { return "" }
        return ISO8601DateFormatter().string(from: date)
    }
}

#if canImport(FirebaseMessaging)
extension AppDelegate: MessagingDelegate {
    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        guard let token = fcmToken else { return }
        PushNotificationRegistrar.storeAndRegister(token)

        // Subscribe to challenges topic for broadcast notifications
        Messaging.messaging().subscribe(toTopic: "challenges")
    }
}
#endif

/// Session 338: tracks generation jobs the user has already actioned (concept
/// approve / hero approve) so subsequent stale `generation_review_needed`
/// pushes are dropped and old banners are cleared from Notification Center.
enum GenerationPushSuppression {
    private static let approvedJobIdsKey = "pushSuppression.approvedGenerationJobIds"
    private static let maxStoredIds = 64

    static func markApproved(jobId: String) {
        let trimmed = jobId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        var current = UserDefaults.standard.stringArray(forKey: approvedJobIdsKey) ?? []
        current.removeAll { $0 == trimmed }
        current.append(trimmed)
        if current.count > maxStoredIds {
            current = Array(current.suffix(maxStoredIds))
        }
        UserDefaults.standard.set(current, forKey: approvedJobIdsKey)
        removeDeliveredNotifications(for: trimmed)
    }

    static func isApproved(jobId: String) -> Bool {
        let trimmed = jobId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return false }
        let stored = UserDefaults.standard.stringArray(forKey: approvedJobIdsKey) ?? []
        return stored.contains(trimmed)
    }

    static func removeDeliveredNotifications(for jobId: String) {
        let trimmed = jobId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        let center = UNUserNotificationCenter.current()

        center.getDeliveredNotifications { notifications in
            let identifiers = notifications.compactMap { notification -> String? in
                let userInfo = notification.request.content.userInfo
                guard let deliveredJobId = userInfo["jobId"] as? String,
                      deliveredJobId == trimmed,
                      let type = userInfo["type"] as? String,
                      type == "generation_review_needed"
                else { return nil }
                return notification.request.identifier
            }
            if !identifiers.isEmpty {
                center.removeDeliveredNotifications(withIdentifiers: identifiers)
            }
        }

        center.getPendingNotificationRequests { requests in
            let identifiers = requests.compactMap { request -> String? in
                let userInfo = request.content.userInfo
                guard let pendingJobId = userInfo["jobId"] as? String,
                      pendingJobId == trimmed,
                      let type = userInfo["type"] as? String,
                      type == "generation_review_needed"
                else { return nil }
                return request.identifier
            }
            if !identifiers.isEmpty {
                center.removePendingNotificationRequests(withIdentifiers: identifiers)
            }
        }
    }
}

enum PushNotificationRegistrar {
    private static let logger = Logger(subsystem: "com.aigoldroblox.app", category: "push")
    private static let tokenKey = "pushNotification.fcmToken"

    static func storeAndRegister(_ token: String) {
        let trimmed = token.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        UserDefaults.standard.set(trimmed, forKey: tokenKey)
        registerStoredTokenIfPossible()
    }

    static func registerStoredTokenIfPossible() {
        guard let token = UserDefaults.standard.string(forKey: tokenKey)?
            .trimmingCharacters(in: .whitespacesAndNewlines),
            !token.isEmpty else { return }

        Task {
            do {
                try await AIWorkspaceAPI.registerDeviceToken(token)
                logger.info("FCM token registered with workspace API")
            } catch {
                logger.warning("FCM token registration will retry later: \(String(describing: error), privacy: .public)")
            }
        }
    }

    static func logTokenRefreshFailure(_ error: Error) {
        logger.warning("FCM token refresh failed after APNs registration: \(String(describing: error), privacy: .public)")
    }

    static func logAPNsRegistrationFailure(_ error: Error) {
        logger.warning("APNs registration failed: \(String(describing: error), privacy: .public)")
    }
}

enum FirebaseBootstrap {
    private static let logger = Logger(subsystem: "com.aigoldroblox.app", category: "firebase")
    private static var didConfigureDefaultApp = false

    @discardableResult
    static func configureIfNeeded() -> Bool {
        #if canImport(FirebaseCore)
        if didConfigureDefaultApp {
            return true
        }

        let bundledConfigURL =
            Bundle.main.url(forResource: "GoogleService-Info", withExtension: "plist") ??
            Bundle.main.url(forResource: "GoogleService-Info", withExtension: "plist", subdirectory: "Resources")

        if let bundledConfigURL,
           let options = FirebaseOptions(contentsOfFile: bundledConfigURL.path) {
            FirebaseApp.configure(options: options)
            let ok = FirebaseApp.app() != nil
            didConfigureDefaultApp = ok
            logger.info("FirebaseApp.configure(options:) called from \(bundledConfigURL.lastPathComponent, privacy: .public) — success=\(ok)")
            return ok
        }

        FirebaseApp.configure()
        let ok = FirebaseApp.app() != nil
        didConfigureDefaultApp = ok
        logger.info("FirebaseApp.configure() called without bundled options — success=\(ok)")
        return ok
        #else
        return false
        #endif
    }
}

@main
struct AIGoldRobloxApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var appState: AppState

    init() {
        _ = FirebaseBootstrap.configureIfNeeded()
        _appState = StateObject(wrappedValue: AppState())
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(appState)
                .onOpenURL { url in
                    appState.handleIncomingURL(url)
                }
        }
    }
}
