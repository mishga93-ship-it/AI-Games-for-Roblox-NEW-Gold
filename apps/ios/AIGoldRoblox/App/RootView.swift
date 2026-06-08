//
//  RootView.swift
//  AIGoldRoblox
//

import SwiftUI

struct RootView: View {
    @EnvironmentObject var appState: AppState
    @EnvironmentObject var themeManager: ThemeManager
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        Group {
            if appState.isShowingLaunchScreen {
                LaunchLoadingView()
            } else if let ban = appState.activeBan {
                BanView(ban: ban) {
                    appState.signOut()
                }
            } else if appState.hasCompletedOnboarding, let user = appState.currentUser {
                MainTabView()
                    // Theme suffix forces a clean re-theme of the whole tab tree
                    // on switch; selected tab lives in AppState so it survives.
                    .id("\(user.id)#\(themeManager.theme.rawValue)")
            } else {
                OnboardingFlowView()
            }
        }
        // Session 371: in-app banner overlay disabled — iOS system banner
        // (returned via `willPresent`) is the single visual channel for
        // generation pushes. Previously both showed at once and felt like
        // duplicate notifications. State (`foregroundGenerationNotification`)
        // is still posted so dedupe/route plumbing keeps working.
        .animation(.easeInOut(duration: 0.25), value: appState.hasCompletedOnboarding)
        .animation(.easeInOut(duration: 0.25), value: appState.currentUser?.id)
        .animation(.easeInOut(duration: 0.25), value: appState.activeBan?.banned)
        // Bug 22: attach a window-level tap gesture that dismisses the keyboard on
        // every screen/sheet/modal. Idempotent — no duplicate recognizers.
        .installGlobalKeyboardDismiss()
        // Follow the selected theme so system chrome (status bar, keyboard,
        // default text) matches. Light themes → .light; dark skins → .dark.
        .preferredColorScheme(themeManager.colorScheme)
        .task {
            ChallengeRetentionNotifications.recordAppOpened()
            appState.startLaunchFlowIfNeeded()
            appState.preparePendingGenerationNotificationRouteIfNeeded()
            appState.preparePendingChallengeNotificationRouteIfNeeded()
            replayPendingDeliveredGenerationNotifications()
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                ChallengeRetentionNotifications.recordAppOpened()
                appState.preparePendingGenerationNotificationRouteIfNeeded()
                appState.preparePendingChallengeNotificationRouteIfNeeded()
                replayPendingDeliveredGenerationNotifications()
            } else if phase == .background {
                ChallengeRetentionNotifications.scheduleInactiveChallengeReminder()
            }
        }
    }

    // Session 338 round 9: when a push arrives while the app is in
    // background/locked, iOS delivers it (lock-screen, Notification Center)
    // but `willPresent` is never called — so the user opens the app and sees
    // nothing. Pull delivered generation pushes from the last 10 minutes and
    // re-post them as foreground in-app alerts so the sticky overlay appears
    // for the most recent one. Deduped + sticky-aware via AppState.
    private func replayPendingDeliveredGenerationNotifications() {
        UNUserNotificationCenter.current().getDeliveredNotifications { notifications in
            let cutoff = Date().addingTimeInterval(-10 * 60)
            let candidates = notifications
                .filter { notification in
                    let userInfo = notification.request.content.userInfo
                    guard let type = userInfo["type"] as? String,
                          type.hasPrefix("generation_"),
                          type != "generation_stage_completed"
                    else { return false }
                    return notification.date >= cutoff
                }
                .sorted { $0.date > $1.date }

            guard let latest = candidates.first else { return }
            let userInfo = latest.request.content.userInfo
            DispatchQueue.main.async {
                NotificationCenter.default.post(
                    name: .foregroundGenerationNotification,
                    object: nil,
                    userInfo: userInfo
                )
            }
        }
    }
}

// Session 338 round 4: dropped `private` so AlertOverlayWindow (defined in
// AIGoldRobloxApp.swift) can render the same banner UI inside its
// PassthroughWindow.
struct ForegroundGenerationNotificationBanner: View {
    let notification: ForegroundGenerationNotification
    let onOpen: () -> Void
    let onDismiss: () -> Void

    private var style: ForegroundGenerationNotificationStyle {
        ForegroundGenerationNotificationStyle.make(for: notification)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: notification.isSticky ? 14 : 12) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: notification.systemImage)
                    .font(.system(size: notification.isSticky ? 24 : 20, weight: .black))
                    .foregroundColor(style.tint)
                    .frame(
                        width: notification.isSticky ? 48 : 40,
                        height: notification.isSticky ? 48 : 40
                    )
                    .background(style.tint.opacity(notification.isSticky ? 0.18 : 0.14))
                    .clipShape(Circle())

                VStack(alignment: .leading, spacing: 4) {
                    Text(notification.title)
                        .font(.system(size: notification.isSticky ? 22 : 17, weight: .black, design: .rounded))
                        .foregroundColor(.textPrimary)
                        .lineLimit(2)
                        .minimumScaleFactor(0.82)

                    Text(notification.subtitle)
                        .font(.system(size: notification.isSticky ? 15 : 13, weight: .semibold, design: .rounded))
                        .foregroundColor(.textSecondary)
                        .lineLimit(2)
                        .minimumScaleFactor(0.86)
                }

                Spacer(minLength: 8)

                Button(action: onDismiss) {
                    Image(systemName: "xmark")
                        .font(.system(size: 13, weight: .black))
                        .foregroundColor(.textSecondary)
                        .frame(width: 34, height: 34)
                        .background(Color.white.opacity(0.74))
                        .clipShape(Circle())
                }
                .accessibilityLabel("Dismiss")
            }

            Button(action: onOpen) {
                Label {
                    Text(notification.actionTitle)
                        .lineLimit(1)
                        .minimumScaleFactor(0.82)
                } icon: {
                    Image(systemName: style.actionSystemImage)
                }
                .font(.system(size: notification.isSticky ? 17 : 15, weight: .black, design: .rounded))
                .foregroundColor(.white)
                .frame(maxWidth: .infinity, minHeight: notification.isSticky ? 50 : 44)
                .background(
                    LinearGradient(
                        colors: [style.tint, style.secondaryTint],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
            .buttonStyle(.plain)
            .accessibilityLabel(notification.actionTitle)
        }
        .padding(.leading, notification.isSticky ? 20 : 16)
        .padding(.trailing, 14)
        .padding(.vertical, notification.isSticky ? 16 : 13)
        .background {
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(Color.elevatedBackground)
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [
                            style.tint.opacity(notification.isSticky ? 0.22 : 0.14),
                            style.secondaryTint.opacity(notification.isSticky ? 0.13 : 0.08),
                            Color.white.opacity(0.98)
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
        }
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(alignment: .leading) {
            Capsule()
                .fill(
                    LinearGradient(
                        colors: [style.tint, style.secondaryTint],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )
                .frame(width: notification.isSticky ? 6 : 4)
                .padding(.leading, 8)
                .padding(.vertical, 14)
        }
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(style.tint.opacity(notification.isSticky ? 0.34 : 0.22), lineWidth: 1.2)
        )
        .shadow(color: style.tint.opacity(notification.isSticky ? 0.22 : 0.12), radius: 24, x: 0, y: 12)
        .shadow(color: .black.opacity(0.10), radius: 18, x: 0, y: 8)
        .contentShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}

struct ForegroundGenerationNotificationStyle {
    let tint: Color
    let secondaryTint: Color
    let actionSystemImage: String

    static func make(for notification: ForegroundGenerationNotification) -> ForegroundGenerationNotificationStyle {
        if notification.isPartial {
            return ForegroundGenerationNotificationStyle(
                tint: .accentSecondary,
                secondaryTint: .accentPink,
                actionSystemImage: "exclamationmark.circle.fill"
            )
        }

        switch notification.type {
        case "generation_review_needed":
            return ForegroundGenerationNotificationStyle(
                tint: .accentPink,
                secondaryTint: .brandViolet,
                actionSystemImage: "hand.tap.fill"
            )
        case "generation_completed":
            return ForegroundGenerationNotificationStyle(
                tint: .brandElectricBlue,
                secondaryTint: .brandViolet,
                actionSystemImage: "arrow.up.forward.circle.fill"
            )
        case "generation_failed", "generation_status_check_failed":
            return ForegroundGenerationNotificationStyle(
                tint: .red,
                secondaryTint: .accentPink,
                actionSystemImage: "exclamationmark.triangle.fill"
            )
        default:
            return ForegroundGenerationNotificationStyle(
                tint: .accentPrimary,
                secondaryTint: .brandViolet,
                actionSystemImage: "arrow.up.forward.circle.fill"
            )
        }
    }
}
