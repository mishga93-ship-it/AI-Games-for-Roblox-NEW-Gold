//
//  ProfileView.swift
//  AIGoldRoblox
//

import AuthenticationServices
import PhotosUI
import SwiftUI
import UIKit
import UserNotifications

private func iconForPortfolioPost(category: String?, projectKind: String) -> String {
    switch category {
    case "script", "game_system": return "chevron.left.forwardslash.chevron.right"
    case "ui": return "rectangle.3.group"
    case "character", "avatar_body": return "person.fill"
    case "weapon": return "shield.fill"
    case "vehicle": return "car.fill"
    case "building", "map": return "building.2.fill"
    case "pet": return "pawprint.fill"
    case "ugc_clothing", "ugc_accessory": return "tshirt.fill"
    case "furniture_prop", "item_tool": return "shippingbox.fill"
    case "decal_texture": return "photo.artframe"
    case "animation", "effect": return "sparkles"
    case "audio": return "waveform"
    case "plugin": return "puzzlepiece.extension.fill"
    default: return projectKind == "game" ? "gamecontroller.fill" : "cube.fill"
    }
}

struct ProfileView: View {
    @EnvironmentObject var appState: AppState
    @State private var isShowingProfileEditor = false
    @State private var isShowingSocialLinksEditor = false
    @State private var remoteProfile: AIWorkspaceAPI.SocialProfile?
    @State private var remoteProfileError: String?
    @State private var portfolioPosts: [AIWorkspaceAPI.SocialPost] = []
    @State private var isLoadingPortfolio = false

    // MARK: - Game Account
    @State private var robloxUsername = ""
    @StateObject private var robloxAuth = RobloxAuthService.shared

    // MARK: - Delete Account
    @State private var showDeleteConfirmation = false
    @State private var isDeletingAccount = false
    @State private var deleteError: String?
    /// Bug 19: When Firebase demands recent auth, show a provider-specific
    /// reauth UI before retrying the delete.
    @State private var reauthProvider: AuthProviderKind?
    @State private var reauthPassword: String = ""
    @State private var reauthAppleNonce: String = ""

    // MARK: - Notification preferences
    @AppStorage("notifyComments") private var notifyComments = true
    @AppStorage("notifyLikes") private var notifyLikes = true
    @AppStorage("notifyFollowers") private var notifyFollowers = true
    @AppStorage("notifyGenerations") private var notifyGenerations = true
    @AppStorage("notifyChallenges") private var notifyChallenges = true
    @State private var pushPermissionGranted = false

    // MARK: - Compact layout sheets
    @State private var isShowingGameAccountSheet = false
    @State private var isShowingCreatorSetupSheet = false
    @State private var isShowingPublishedWorkSheet = false

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 18) {
                ProfileHeroCard(user: appState.currentUser) {
                    isShowingProfileEditor = true
                }

                quickStatsStrip
                actionsGrid

                badgesCard

                VStack(spacing: 12) {
                    PrimaryButton(title: "Open Kami Studio") {
                        appState.setSelectedRootTab(.create)
                    }
                    PrimaryButton(title: "Sign Out", action: { appState.signOut() }, style: .outline)

                    Button {
                        showDeleteConfirmation = true
                    } label: {
                        Text("Delete Account")
                            .font(.system(size: 14, weight: .medium, design: .rounded))
                            .foregroundColor(.red.opacity(0.8))
                    }
                    .padding(.top, 8)
                }
            }
            .padding(16)
            .padding(.bottom, LayoutMetrics.floatingTabBarClearance)
        }
        .background(
            LinearGradient(colors: [.gradientTop, .gradientBottom], startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()
        )
        .dismissKeyboardOnTap()
        .navigationTitle("Profile")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                if let userId = appState.currentUser?.id {
                    ShareLink(
                        item: DeepLinkManager.shareURL(for: .profile(id: userId)),
                        subject: Text(appState.currentUser?.displayName ?? "Profile"),
                        message: Text("\(appState.currentUser?.displayName ?? "Player") on Kami")
                    ) {
                        Image(systemName: "square.and.arrow.up")
                            .foregroundColor(.accentPrimary)
                    }
                }
            }
        }
        .sheet(isPresented: $isShowingProfileEditor) {
            ProfileEditorSheet(user: appState.currentUser) { displayName, gender, age, avatarImageData in
                appState.updateCurrentUser(
                    displayName: displayName,
                    gender: gender,
                    age: age,
                    avatarImageData: avatarImageData
                )
                Task {
                    remoteProfile = try? await AIWorkspaceAPI.updateSocialProfile(
                        displayName: displayName,
                        bio: remoteProfile?.bio,
                        robloxUsername: appState.robloxUsername,
                        headline: remoteProfile?.headline,
                        websiteUrl: remoteProfile?.websiteUrl
                    )
                }
            }
        }
        .sheet(isPresented: $isShowingGameAccountSheet) {
            NavigationStack {
                ScrollView(showsIndicators: false) {
                    gameAccountCard
                        .padding(20)
                }
                .background(
                    LinearGradient(colors: [.gradientTop, .gradientBottom], startPoint: .topLeading, endPoint: .bottomTrailing)
                        .ignoresSafeArea()
                )
                .navigationTitle("Game Account")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("Done") { isShowingGameAccountSheet = false }
                    }
                }
            }
        }
        .sheet(isPresented: $isShowingCreatorSetupSheet) {
            NavigationStack {
                ScrollView(showsIndicators: false) {
                    VStack(spacing: 16) {
                        creatorSetupEditorCard
                        if remoteProfile?.headline?.isEmpty == false {
                            VStack(alignment: .leading, spacing: 8) {
                                Text("Headline")
                                    .font(.appHeadline)
                                    .foregroundColor(.textPrimary)
                                Text(remoteProfile?.headline ?? "")
                                    .font(.appCallout)
                                    .foregroundColor(.textSecondary)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(18)
                            .background(Color.cardBackground)
                            .clipShape(RoundedRectangle(cornerRadius: 18))
                        }
                    }
                    .padding(20)
                }
                .background(
                    LinearGradient(colors: [.gradientTop, .gradientBottom], startPoint: .topLeading, endPoint: .bottomTrailing)
                        .ignoresSafeArea()
                )
                .navigationTitle("Creator Setup")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("Done") { isShowingCreatorSetupSheet = false }
                    }
                }
            }
        }
        .sheet(isPresented: $isShowingPublishedWorkSheet) {
            NavigationStack {
                ScrollView(showsIndicators: false) {
                    portfolioCard
                        .padding(20)
                }
                .background(
                    LinearGradient(colors: [.gradientTop, .gradientBottom], startPoint: .topLeading, endPoint: .bottomTrailing)
                        .ignoresSafeArea()
                )
                .navigationTitle("Published Work")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("Done") { isShowingPublishedWorkSheet = false }
                    }
                }
            }
        }
        .sheet(isPresented: $isShowingSocialLinksEditor) {
            SocialLinksEditorSheet(
                existingLinks: remoteProfile?.socialLinks ?? [],
                robloxUsername: appState.robloxUsername,
                websiteUrl: remoteProfile?.websiteUrl ?? ""
            ) { links, robloxUser, website in
                appState.robloxUsername = robloxUser
                Task {
                    remoteProfile = try? await AIWorkspaceAPI.updateSocialProfile(
                        displayName: nil,
                        bio: nil,
                        robloxUsername: robloxUser,
                        headline: nil,
                        websiteUrl: website.isEmpty ? nil : website,
                        socialLinks: links
                    )
                }
            }
        }
        .task {
            await loadRemoteProfile()
            await loadPortfolio()
            robloxUsername = appState.robloxUsername
            checkNotificationPermission()
        }
        .alert("Delete Account", isPresented: $showDeleteConfirmation) {
            Button("Cancel", role: .cancel) {}
            Button("Delete", role: .destructive) {
                Task { await attemptDelete() }
            }
        } message: {
            Text("Are you sure? This will permanently delete your account and all associated data. This action cannot be undone.")
        }
        .alert("Delete Failed", isPresented: .init(get: { deleteError != nil }, set: { if !$0 { deleteError = nil } })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(deleteError ?? "")
        }
        // Bug 19: password prompt when user signed in with email/password and
        // Firebase requires recent auth before the destructive delete.
        .alert(
            "Confirm Your Password",
            isPresented: .init(
                get: { reauthProvider == .email },
                set: { if !$0 { reauthProvider = nil; reauthPassword = "" } }
            )
        ) {
            SecureField("Password", text: $reauthPassword)
            Button("Cancel", role: .cancel) {
                reauthProvider = nil
                reauthPassword = ""
            }
            Button("Delete", role: .destructive) {
                let pwd = reauthPassword
                reauthPassword = ""
                reauthProvider = nil
                Task { await performReauthAndDelete(.email, password: pwd) }
            }
        } message: {
            Text("For your security, enter your password to confirm account deletion.")
        }
        // Google / Apple: confirm, then trigger the fresh sign-in flow to
        // reauthenticate before deleting.
        .sheet(
            isPresented: .init(
                get: { reauthProvider == .google || reauthProvider == .apple },
                set: { if !$0 { reauthProvider = nil } }
            )
        ) {
            reauthSsoSheet
        }
        .overlay {
            if isDeletingAccount {
                Color.black.opacity(0.4).ignoresSafeArea()
                ProgressView("Deleting account...")
                    .tint(.white)
                    .foregroundColor(.white)
            }
        }
    }

    // MARK: - Bug 19: Delete Account with reauth

    private func attemptDelete() async {
        isDeletingAccount = true
        deleteError = nil
        defer { isDeletingAccount = false }
        do {
            try await appState.deleteAccount()
        } catch let error as AuthError {
            if case .requiresRecentLogin(let provider) = error {
                // Drive the provider-specific reauth UI; deletion will retry
                // from there on success.
                reauthProvider = provider
                return
            }
            deleteError = error.localizedDescription
        } catch {
            deleteError = error.localizedDescription
        }
    }

    private func performReauthAndDelete(_ provider: AuthProviderKind, password: String? = nil) async {
        isDeletingAccount = true
        deleteError = nil
        defer { isDeletingAccount = false }
        do {
            switch provider {
            case .email:
                guard let password, !password.isEmpty else {
                    deleteError = "Password required to confirm deletion."
                    return
                }
                try await appState.reauthenticateAndDeleteAccount(password: password)
            case .google:
                try await appState.reauthenticateWithGoogleAndDeleteAccount()
            case .apple:
                // Apple branch is triggered via SignInWithAppleButton callback
                // which calls this with pre-obtained credentials. We shouldn't
                // reach here without them.
                deleteError = "Apple reauthentication did not return credentials."
            }
        } catch {
            deleteError = error.localizedDescription
        }
    }

    private func performAppleReauthAndDelete(idToken: String, rawNonce: String, fullName: PersonNameComponents?) async {
        isDeletingAccount = true
        deleteError = nil
        defer { isDeletingAccount = false }
        do {
            try await appState.reauthenticateWithAppleAndDeleteAccount(
                idToken: idToken,
                rawNonce: rawNonce,
                fullName: fullName
            )
        } catch {
            deleteError = error.localizedDescription
        }
    }

    @ViewBuilder
    private var reauthSsoSheet: some View {
        ZStack {
            Color.appBackground.ignoresSafeArea()
            VStack(spacing: 20) {
                Text("Confirm Account Deletion")
                    .font(.appTitle)
                    .foregroundColor(.textPrimary)
                Text("For your security, sign in again to permanently delete your account.")
                    .font(.appBody)
                    .foregroundColor(.textSecondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 8)

                if reauthProvider == .google {
                    Button {
                        reauthProvider = nil
                        Task { await performReauthAndDelete(.google) }
                    } label: {
                        HStack(spacing: 12) {
                            Image(systemName: "globe")
                                .font(.headline)
                            Text("Confirm with Google")
                                .font(.appCallout.weight(.semibold))
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                        .background(Color.white)
                        .foregroundColor(.black)
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                    }
                }

                if reauthProvider == .apple {
                    SignInWithAppleButton(.continue) { request in
                        let nonce = AuthService.randomNonceString()
                        reauthAppleNonce = nonce
                        request.requestedScopes = [.fullName, .email]
                        request.nonce = AuthService.sha256(nonce)
                    } onCompletion: { result in
                        let raw = reauthAppleNonce
                        reauthAppleNonce = ""
                        reauthProvider = nil
                        switch result {
                        case .success(let authorization):
                            guard let cred = authorization.credential as? ASAuthorizationAppleIDCredential,
                                  let tokenData = cred.identityToken,
                                  let idToken = String(data: tokenData, encoding: .utf8) else {
                                deleteError = "Apple Sign-In did not return a valid identity token."
                                return
                            }
                            Task {
                                await performAppleReauthAndDelete(idToken: idToken, rawNonce: raw, fullName: cred.fullName)
                            }
                        case .failure(let error):
                            deleteError = error.localizedDescription
                        }
                    }
                    .signInWithAppleButtonStyle(.white)
                    .frame(height: 54)
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                }

                Button("Cancel", role: .cancel) {
                    reauthProvider = nil
                }
                .foregroundColor(.textSecondary)
            }
            .padding(24)
        }
        .presentationDetents([.medium])
    }

    // MARK: - Compact layout — Quick stats + Actions grid

    private var quickStatsStrip: some View {
        HStack(spacing: 10) {
            if let userId = appState.currentUser?.id {
                NavigationLink {
                    FollowListView(profileId: userId, kind: .followers, initialTitle: "Followers")
                } label: {
                    StatPill(
                        value: remoteProfile.map { "\($0.followerCount)" } ?? "—",
                        title: "Followers",
                        color: .accentPrimary
                    )
                }
                .buttonStyle(.plain)

                NavigationLink {
                    FollowListView(profileId: userId, kind: .following, initialTitle: "Following")
                } label: {
                    StatPill(
                        value: remoteProfile.map { "\($0.followingCount)" } ?? "—",
                        title: "Following",
                        color: .accentSecondary
                    )
                }
                .buttonStyle(.plain)
            } else {
                StatPill(value: "—", title: "Followers", color: .accentPrimary)
                StatPill(value: "—", title: "Following", color: .accentSecondary)
            }

            StatPill(
                value: remoteProfile.map { "\($0.publishedProjectCount)" } ?? "—",
                title: "Published",
                color: .accentTeal
            )
            StatPill(
                value: remoteProfile.map { "\($0.totalDownloads)" } ?? "—",
                title: "Downloads",
                color: .accentOrange
            )
        }
    }

    private var actionsGrid: some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
            ActionTile(title: "Social Links", icon: "link", color: .accentSecondary) {
                isShowingSocialLinksEditor = true
            }
            ActionTile(title: "Game Account", icon: "gamecontroller.fill", color: .accentTeal) {
                isShowingGameAccountSheet = true
            }
            ActionTile(title: "Creator Setup", icon: "slider.horizontal.3", color: .accentOrange) {
                isShowingCreatorSetupSheet = true
            }
            ActionTile(title: "Published Work", icon: "shippingbox.fill", color: .accentPrimary) {
                isShowingPublishedWorkSheet = true
            }
        }
    }

    private var creatorSetupEditorCard: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 10) {
                Label("Focus", systemImage: "sparkles")
                    .font(.appHeadline)
                    .foregroundColor(.textPrimary)
                Picker("Focus", selection: Binding(
                    get: { appState.creationFocus },
                    set: { appState.creationFocus = $0 }
                )) {
                    ForEach(CreationFocus.allCases) { focus in
                        Text(focus.rawValue).tag(focus)
                    }
                }
                .pickerStyle(.segmented)
            }

            VStack(alignment: .leading, spacing: 10) {
                Label("Expertise", systemImage: "slider.horizontal.3")
                    .font(.appHeadline)
                    .foregroundColor(.textPrimary)
                Picker("Expertise", selection: Binding(
                    get: { appState.expertiseLevel },
                    set: { appState.expertiseLevel = $0 }
                )) {
                    ForEach(ExpertiseLevel.allCases) { level in
                        Text(level.rawValue).tag(level)
                    }
                }
                .pickerStyle(.segmented)
                Text(appState.expertiseLevel.detail)
                    .font(.appCaption)
                    .foregroundColor(.textSecondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(Color.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 18))
        .overlay(
            RoundedRectangle(cornerRadius: 18)
                .stroke(Color.accentPrimary.opacity(0.18), lineWidth: 1)
        )
    }

    private var badgesCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Badges & Achievements")
                .font(.appHeadline)
                .foregroundColor(.textPrimary)

            if appState.creatorBadges.isEmpty {
                Text("Complete milestones to earn badges — publish games, grow downloads, and more")
                    .font(.appCaption)
                    .foregroundColor(.textSecondary)
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    LazyHStack(spacing: 10) {
                        ForEach(appState.creatorBadges, id: \.self) { badge in
                            BadgeView(badgeId: badge)
                        }
                    }
                }
            }

            if let rating = remoteProfile?.rating, rating > 0 {
                HStack(spacing: 4) {
                    ForEach(0..<5, id: \.self) { i in
                        Image(systemName: Double(i) < rating ? "star.fill" : "star")
                            .font(.system(size: 14))
                            .foregroundColor(.accentOrange)
                    }
                    Text(String(format: "%.1f", rating))
                        .font(.appCaption)
                        .foregroundColor(.textSecondary)
                }
            }

            WrapProfileBadges(items: appState.creatorInterests.map(\.rawValue))
        }
        .padding(18)
        .background(Color.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 18))
    }

    private var portfolioCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Published Work")
                    .font(.appHeadline)
                    .foregroundColor(.textPrimary)
                Spacer()
                if let count = remoteProfile?.publishedProjectCount, count > 0 {
                    Text("\(count) total")
                        .font(.appCaption)
                        .foregroundColor(.textSecondary)
                }
            }

            if isLoadingPortfolio {
                ProgressView("Loading portfolio...")
                    .tint(.accentPrimary)
            } else if portfolioPosts.isEmpty {
                Text("Your published projects will appear here")
                    .font(.appCaption)
                    .foregroundColor(.textSecondary)
            } else {
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                    ForEach(portfolioPosts) { post in
                        NavigationLink(destination: CommunityPostDetailView(post: post, onRefresh: { await loadPortfolio() })) {
                            PortfolioItemView(post: post)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .padding(18)
        .background(Color.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 18))
    }

    @MainActor
    // MARK: - Game Account Card

    private var gameAccountCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Game Account")
                .font(.appHeadline)
                .foregroundColor(.textPrimary)

            TextField("Game Username", text: $robloxUsername)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .foregroundColor(.textPrimary)
                .onSubmit { persistRobloxUsername() }
                .padding(12)
                .background(Color.cardBackground)
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .overlay(
                    RoundedRectangle(cornerRadius: 10)
                        .stroke(Color.accentPrimary.opacity(0.2), lineWidth: 1)
                )

            if !robloxUsername.trimmingCharacters(in: .whitespaces).isEmpty,
               let url = robloxProfileURL {
                Link(destination: url) {
                    Label("View Profile", systemImage: "arrow.up.right.square")
                        .font(.appCaption)
                        .foregroundColor(.accentPrimary)
                }
            }

            if robloxAuth.isConnected {
                HStack {
                    Label("Account Connected", systemImage: "checkmark.circle.fill")
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(.green)
                    Spacer()
                    if let uid = robloxAuth.robloxUserId {
                        Text("ID: \(uid)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                Button(role: .destructive) {
                    Task { await robloxAuth.disconnect() }
                } label: {
                    Label("Disconnect Account", systemImage: "xmark.circle")
                        .font(.subheadline)
                }
                .disabled(robloxAuth.isLoading)
            } else {
                Button {
                    robloxAuth.startOAuthFlow()
                } label: {
                    HStack {
                        Label("Connect Game Account", systemImage: "link.badge.plus")
                            .font(.subheadline.weight(.medium))
                        Spacer()
                        if robloxAuth.isLoading {
                            ProgressView()
                        }
                    }
                }
                .disabled(robloxAuth.isLoading)
            }

            if robloxAuth.isConnected {
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text("Universe ID")
                            .font(.subheadline.weight(.medium))
                        Spacer()
                        if let uid = robloxAuth.universeId, !uid.isEmpty {
                            Label("Set", systemImage: "checkmark.circle.fill")
                                .font(.caption.weight(.medium))
                                .foregroundStyle(.green)
                        } else {
                            Label("Required for Game Passes", systemImage: "exclamationmark.triangle.fill")
                                .font(.caption.weight(.medium))
                                .foregroundStyle(Color.accentPink)
                        }
                    }
                    TextField("e.g. 1234567890", text: Binding(
                        get: { robloxAuth.universeId ?? "" },
                        set: { robloxAuth.setUniverseId($0) }
                    ))
                    .font(.subheadline.monospaced())
                    .textFieldStyle(.roundedBorder)
                    .keyboardType(.numberPad)
                    Text("Creator Dashboard → Your Experience → Overview → Copy Universe ID")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
                .padding(.vertical, 4)
            }

            if let error = robloxAuth.errorMessage {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red)
            }

            Text(robloxAuth.isConnected
                 ? "Your game account is connected. Generated 3D models will be uploaded to your account."
                 : "Connect your game account so generated 3D characters appear correctly in-game.")
                .font(.appCaption)
                .foregroundColor(.textSecondary)
        }
        .padding(18)
        .background(Color.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 18))
        .overlay(
            RoundedRectangle(cornerRadius: 18)
                .stroke(Color.accentPrimary.opacity(0.18), lineWidth: 1)
        )
    }

    // MARK: - Notifications Card

    private var notificationsCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Push Notifications")
                .font(.appHeadline)
                .foregroundColor(.textPrimary)

            if !pushPermissionGranted {
                Button {
                    requestNotificationPermission()
                } label: {
                    Label("Enable Push Notifications", systemImage: "bell.badge")
                        .font(.subheadline.weight(.medium))
                        .foregroundColor(.accentPrimary)
                }
            }

            Toggle("New Comments", isOn: $notifyComments)
                .foregroundColor(.textPrimary)
                .onChange(of: notifyComments) { _, _ in syncNotificationPreferences() }
            Toggle("Likes", isOn: $notifyLikes)
                .foregroundColor(.textPrimary)
                .onChange(of: notifyLikes) { _, _ in syncNotificationPreferences() }
            Toggle("New Followers", isOn: $notifyFollowers)
                .foregroundColor(.textPrimary)
                .onChange(of: notifyFollowers) { _, _ in syncNotificationPreferences() }
            Toggle("Generation Ready", isOn: $notifyGenerations)
                .foregroundColor(.textPrimary)
                .onChange(of: notifyGenerations) { _, _ in syncNotificationPreferences() }
            Toggle("Challenges", isOn: $notifyChallenges)
                .foregroundColor(.textPrimary)
                .onChange(of: notifyChallenges) { _, _ in syncNotificationPreferences() }
        }
        .tint(.accentPrimary)
        .padding(18)
        .background(Color.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 18))
        .overlay(
            RoundedRectangle(cornerRadius: 18)
                .stroke(Color.accentPrimary.opacity(0.18), lineWidth: 1)
        )
    }

    // MARK: - Game Account Helpers

    private var robloxProfileURL: URL? {
        let trimmed = robloxUsername
            .trimmingCharacters(in: .whitespaces)
            .addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        return URL(string: "https://www.roblox.com/search/users?keyword=\(trimmed)")
    }

    private func persistRobloxUsername() {
        let trimmed = robloxUsername.trimmingCharacters(in: .whitespacesAndNewlines)
        appState.robloxUsername = trimmed
        UserDefaults.standard.set(trimmed, forKey: "robloxUsername")
    }

    // MARK: - Notification Helpers

    private func requestNotificationPermission() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { granted, _ in
            DispatchQueue.main.async {
                pushPermissionGranted = granted
                if granted {
                    UIApplication.shared.registerForRemoteNotifications()
                }
            }
        }
    }

    private func syncNotificationPreferences() {
        Task {
            try? await AIWorkspaceAPI.updateNotificationPreferences(
                likes: notifyLikes,
                comments: notifyComments,
                followers: notifyFollowers,
                generations: notifyGenerations,
                challenges: notifyChallenges
            )
        }
    }

    private func checkNotificationPermission() {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            DispatchQueue.main.async {
                pushPermissionGranted = settings.authorizationStatus == .authorized
            }
        }
    }

    // MARK: - Remote Data

    private func loadRemoteProfile() async {
        do {
            let profile = try await AIWorkspaceAPI.fetchSocialProfile()
            remoteProfile = profile
            remoteProfileError = nil
            appState.creatorBadges = profile.badges
        } catch {
            remoteProfileError = "Community profile is not available yet. Sign in and make sure the backend is reachable."
        }
    }

    @MainActor
    private func loadPortfolio() async {
        guard let userId = appState.currentUser?.id else { return }
        isLoadingPortfolio = true
        defer { isLoadingPortfolio = false }
        do {
            let portfolio = try await AIWorkspaceAPI.fetchPortfolio(profileId: userId)
            portfolioPosts = portfolio.publishedPosts
            await ImageCacheManager.shared.prefetch(
                portfolioPosts.compactMap { $0.previewUrls.first },
                maxCount: 5
            )
        } catch {
            portfolioPosts = []
        }
    }
}

private struct PortfolioItemView: View {
    let post: AIWorkspaceAPI.SocialPost
    @State private var image: UIImage?

    init(post: AIWorkspaceAPI.SocialPost) {
        self.post = post
        if let url = post.previewUrls.first {
            _image = State(initialValue: ImageCacheManager.cachedImage(for: url))
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                    .frame(height: 80)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
            } else {
                ZStack {
                    RoundedRectangle(cornerRadius: 10)
                        .fill(Color.accentPrimary.opacity(0.1))
                    Image(systemName: iconForPortfolioPost(category: post.category, projectKind: post.projectKind))
                        .foregroundColor(.textTertiary)
                }
                .frame(height: 80)
            }

            Text(post.title)
                .font(.appCaption)
                .foregroundColor(.textPrimary)
                .lineLimit(1)

            HStack(spacing: 6) {
                Label("\(post.likes)", systemImage: "heart.fill")
                Label("\(post.downloadCount)", systemImage: "arrow.down.circle.fill")
            }
            .font(.system(size: 10))
            .foregroundColor(.textSecondary)
        }
        .padding(8)
        .background(Color.white.opacity(0.06))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .task(id: post.id) {
            guard let url = post.previewUrls.first, image == nil else { return }
            image = await ImageCacheManager.shared.image(for: url)
        }
    }
}

private struct BadgeView: View {
    let badgeId: String

    var body: some View {
        VStack(spacing: 4) {
            Image(systemName: badgeIcon)
                .font(.system(size: 20))
                .foregroundColor(badgeColor)
            Text(badgeLabel)
                .font(.system(size: 9, weight: .bold, design: .rounded))
                .foregroundColor(.textPrimary)
                .multilineTextAlignment(.center)
                .lineLimit(2)
        }
        .frame(width: 70, height: 70)
        .background(badgeColor.opacity(0.12))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(badgeColor.opacity(0.25), lineWidth: 1)
        )
    }

    private var badgeIcon: String {
        switch badgeId {
        case "top_creator": return "crown.fill"
        case "game_developer": return "gamecontroller.fill"
        case "script_master": return "chevron.left.forwardslash.chevron.right"
        case "1k_downloads": return "arrow.down.circle.fill"
        case "verified_author": return "checkmark.seal.fill"
        case "rising_star": return "star.fill"
        case "challenge_winner": return "trophy.fill"
        case "ugc_designer": return "sparkles.rectangle.stack"
        default: return "shield.fill"
        }
    }

    private var badgeLabel: String {
        switch badgeId {
        case "top_creator": return "Top Creator"
        case "game_developer": return "Game Dev"
        case "script_master": return "Script Master"
        case "1k_downloads": return "1K Downloads"
        case "verified_author": return "Verified Author"
        case "rising_star": return "Rising Star"
        case "challenge_winner": return "Challenge Winner"
        case "ugc_designer": return "UGC Designer"
        default: return badgeId.replacingOccurrences(of: "_", with: " ").capitalized
        }
    }

    private var badgeColor: Color {
        switch badgeId {
        case "top_creator": return .accentOrange
        case "game_developer": return .accentPrimary
        case "script_master": return .accentTeal
        case "1k_downloads": return .accentSecondary
        case "verified_author": return .blue
        case "rising_star": return .yellow
        case "challenge_winner": return .accentOrange
        case "ugc_designer": return .purple
        default: return .accentPrimary
        }
    }
}

private struct SocialLinksEditorSheet: View {
    @Environment(\.dismiss) private var dismiss

    @State private var robloxUsername: String
    @State private var websiteUrl: String
    @State private var youtubeUrl: String
    @State private var twitterUrl: String
    @State private var discordUrl: String
    @State private var tiktokUrl: String

    let onSave: ([AIWorkspaceAPI.SocialLink], String, String) -> Void

    init(existingLinks: [AIWorkspaceAPI.SocialLink], robloxUsername: String, websiteUrl: String, onSave: @escaping ([AIWorkspaceAPI.SocialLink], String, String) -> Void) {
        self.onSave = onSave
        _robloxUsername = State(initialValue: robloxUsername)
        _websiteUrl = State(initialValue: websiteUrl)
        _youtubeUrl = State(initialValue: existingLinks.first(where: { $0.platform == "youtube" })?.url ?? "")
        _twitterUrl = State(initialValue: existingLinks.first(where: { $0.platform == "twitter" })?.url ?? "")
        _discordUrl = State(initialValue: existingLinks.first(where: { $0.platform == "discord" })?.url ?? "")
        _tiktokUrl = State(initialValue: existingLinks.first(where: { $0.platform == "tiktok" })?.url ?? "")
    }

    var body: some View {
        NavigationStack {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 16) {
                    linkField(title: "Game Username", icon: "gamecontroller.fill", text: $robloxUsername, placeholder: "YourGameName")
                    linkField(title: "Website", icon: "globe", text: $websiteUrl, placeholder: "https://yoursite.com")
                    linkField(title: "YouTube", icon: "play.rectangle.fill", text: $youtubeUrl, placeholder: "https://youtube.com/@channel")
                    linkField(title: "Twitter / X", icon: "at", text: $twitterUrl, placeholder: "https://twitter.com/handle")
                    linkField(title: "Discord", icon: "bubble.left.and.bubble.right.fill", text: $discordUrl, placeholder: "https://discord.gg/invite")
                    linkField(title: "TikTok", icon: "music.note", text: $tiktokUrl, placeholder: "https://tiktok.com/@handle")
                }
                .padding(20)
            }
            // Bug 22: свайп по списку также сбрасывает клавиатуру — дополнительно
            // к window-level tap gesture в RootView.
            .scrollDismissesKeyboard(.interactively)
            .dismissKeyboardOnTap()
            .background(
                LinearGradient(colors: [.gradientTop, .gradientBottom], startPoint: .topLeading, endPoint: .bottomTrailing)
                    .ignoresSafeArea()
            )
            .navigationTitle("Social Links")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Save") {
                        var links: [AIWorkspaceAPI.SocialLink] = []
                        if !youtubeUrl.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                            links.append(.init(platform: "youtube", url: youtubeUrl.trimmingCharacters(in: .whitespacesAndNewlines), label: "YouTube"))
                        }
                        if !twitterUrl.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                            links.append(.init(platform: "twitter", url: twitterUrl.trimmingCharacters(in: .whitespacesAndNewlines), label: "Twitter"))
                        }
                        if !discordUrl.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                            links.append(.init(platform: "discord", url: discordUrl.trimmingCharacters(in: .whitespacesAndNewlines), label: "Discord"))
                        }
                        if !tiktokUrl.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                            links.append(.init(platform: "tiktok", url: tiktokUrl.trimmingCharacters(in: .whitespacesAndNewlines), label: "TikTok"))
                        }
                        onSave(links, robloxUsername.trimmingCharacters(in: .whitespacesAndNewlines), websiteUrl.trimmingCharacters(in: .whitespacesAndNewlines))
                        dismiss()
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func linkField(title: String, icon: String, text: Binding<String>, placeholder: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(title, systemImage: icon)
                .font(.appHeadline)
                .foregroundColor(.textPrimary)
            TextField(placeholder, text: text, prompt: Text(placeholder).foregroundColor(.textSecondary))
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .foregroundColor(.textPrimary)
                .tint(.accentPrimary)
                .padding(16)
                .background(Color.white.opacity(0.92))
                .clipShape(RoundedRectangle(cornerRadius: 18))
        }
    }
}

private struct ProfileHeroCard: View {
    let user: User?
    let onEdit: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            BrandLockup(markSize: 32, showsSubtitle: false)
                .frame(maxWidth: .infinity, alignment: .leading)

            Image("ProfileCreatorHero")
                .resizable()
                .scaledToFill()
                .frame(height: 170)
                .clipShape(RoundedRectangle(cornerRadius: 20))

            HStack {
                Spacer()
                Button("Edit Profile", action: onEdit)
                    .font(.appCaption)
                    .foregroundColor(.accentPrimary)
            }

            ProfileAvatarView(
                avatarData: user?.avatarImageData,
                name: user?.displayName,
                size: 104
            )

            VStack(spacing: 6) {
                Text(user?.displayName ?? "Player")
                    .font(.appTitle)
                    .foregroundColor(.textPrimary)

                Text(profileSummary)
                    .font(.appCallout)
                    .foregroundColor(.textSecondary)
                    .multilineTextAlignment(.center)
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity)
        .background(
            LinearGradient(colors: [Color.white.opacity(0.96), Color.cardBackground], startPoint: .topLeading, endPoint: .bottomTrailing)
        )
        .clipShape(RoundedRectangle(cornerRadius: 22))
        .overlay(
            RoundedRectangle(cornerRadius: 22)
                .stroke(Color.accentPrimary.opacity(0.18), lineWidth: 1)
        )
        .shadow(color: Color.accentPrimary.opacity(0.12), radius: 12, y: 8)
    }

    private var profileSummary: String {
        let gender = user?.gender.rawValue ?? ProfileGender.preferNotToSay.rawValue
        let age = user?.age.map { "\($0) yrs" } ?? "Age not set"
        let fallback = user?.email ?? "Kami creator profile"
        return [gender, age, fallback]
            .filter { !$0.isEmpty }
            .joined(separator: " | ")
    }
}

private struct ProfileInfoRow: View {
    let title: String
    let value: String
    let icon: String

    var body: some View {
        HStack(spacing: 10) {
            Label(title, systemImage: icon)
                .font(.appCallout)
                .foregroundColor(.textSecondary)
            Spacer()
            Text(value)
                .font(.appCaption)
                .foregroundColor(.accentPrimary)
        }
    }
}

private struct WrapProfileBadges: View {
    let items: [String]

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            LazyHStack(spacing: 8) {
                ForEach(items, id: \.self) { item in
                    Text(item)
                        .font(.system(size: 12, weight: .bold, design: .rounded))
                        .foregroundColor(.accentPrimary)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(Color.accentPrimary.opacity(0.12))
                        .clipShape(Capsule())
                }
            }
        }
    }
}

private struct StatPill: View {
    let value: String
    let title: String
    let color: Color

    var body: some View {
        VStack(spacing: 4) {
            Text(value)
                .font(.system(size: 18, weight: .black, design: .rounded))
                .foregroundColor(color)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Text(title)
                .font(.system(size: 11, weight: .semibold, design: .rounded))
                .foregroundColor(.textSecondary)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .background(Color.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(color.opacity(0.18), lineWidth: 1)
        )
    }
}

private struct ActionTile: View {
    let title: String
    let icon: String
    let color: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                RoundedRectangle(cornerRadius: 12)
                    .fill(color.opacity(0.14))
                    .frame(width: 40, height: 40)
                    .overlay(
                        Image(systemName: icon)
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundColor(color)
                    )
                Text(title)
                    .font(.system(size: 14, weight: .semibold, design: .rounded))
                    .foregroundColor(.textPrimary)
                    .lineLimit(2)
                    .minimumScaleFactor(0.85)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(color.opacity(0.15), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }
}

private struct ProfileStatCard: View {
    let title: String
    let value: String
    let color: Color

    var body: some View {
        VStack(spacing: 6) {
            Text(value)
                .font(.system(size: 22, weight: .black, design: .rounded))
                .foregroundColor(color)
            Text(title)
                .font(.appCaption)
                .foregroundColor(.textSecondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14)
        .background(Color.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(color.opacity(0.2), lineWidth: 1)
        )
    }
}

struct ProfileAvatarView: View {
    let avatarData: Data?
    let name: String?
    let size: CGFloat

    var body: some View {
        Group {
            if let avatarData, let image = UIImage(data: avatarData) {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
            } else {
                ZStack {
                    LinearGradient(
                        colors: [.accentPrimary.opacity(0.94), .accentSecondary.opacity(0.9), .accentOrange.opacity(0.78)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                    Text(initials)
                        .font(.system(size: size * 0.34, weight: .black, design: .rounded))
                        .foregroundColor(.white)
                }
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .overlay(Circle().stroke(Color.white.opacity(0.96), lineWidth: 4))
        .shadow(color: Color.accentPrimary.opacity(0.18), radius: 12, y: 8)
    }

    private var initials: String {
        let parts = (name ?? "Player")
            .split(separator: " ")
            .prefix(2)
        let value = parts.compactMap { $0.first }.map(String.init).joined()
        return value.isEmpty ? "P" : value.uppercased()
    }
}

private struct ProfileEditorSheet: View {
    @Environment(\.dismiss) private var dismiss

    let onSave: (String, ProfileGender, Int?, Data?) -> Void

    @State private var displayName: String
    @State private var selectedGender: ProfileGender
    @State private var ageText: String
    @State private var avatarImageData: Data?
    @State private var selectedPhotoItem: PhotosPickerItem?
    @FocusState private var ageFieldFocused: Bool

    init(user: User?, onSave: @escaping (String, ProfileGender, Int?, Data?) -> Void) {
        self.onSave = onSave
        _displayName = State(initialValue: user?.displayName ?? "")
        _selectedGender = State(initialValue: user?.gender ?? .preferNotToSay)
        _ageText = State(initialValue: user?.age.map(String.init) ?? "")
        _avatarImageData = State(initialValue: user?.avatarImageData)
    }

    var body: some View {
        NavigationStack {
            ScrollView(showsIndicators: false) {
                VStack(spacing: 20) {
                    VStack(spacing: 14) {
                        ProfileAvatarView(
                            avatarData: avatarImageData,
                            name: displayName,
                            size: 112
                        )

                        HStack(spacing: 12) {
                            PhotosPicker(selection: $selectedPhotoItem, matching: .images) {
                                Text("Choose Photo")
                                    .font(.appCallout)
                                    .foregroundColor(.white)
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 14)
                                    .background(Color.accentPrimary)
                                    .clipShape(RoundedRectangle(cornerRadius: 16))
                            }
                            .buttonStyle(.plain)

                            Button("Remove") {
                                avatarImageData = nil
                                selectedPhotoItem = nil
                            }
                            .font(.appCallout)
                            .foregroundColor(.accentPrimary)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(Color.accentPrimary.opacity(0.08))
                            .clipShape(RoundedRectangle(cornerRadius: 16))
                        }
                    }

                    VStack(alignment: .leading, spacing: 16) {
                        editorField(title: "Name") {
                            TextField("Creator name", text: $displayName, prompt: Text("Creator name").foregroundColor(.textSecondary))
                                .foregroundColor(.textPrimary)
                                .textInputAutocapitalization(.words)
                                .padding(16)
                                .background(Color.white.opacity(0.92))
                                .clipShape(RoundedRectangle(cornerRadius: 18))
                        }

                        editorField(title: "Gender") {
                            Picker("Gender", selection: $selectedGender) {
                                ForEach(ProfileGender.allCases) { option in
                                    Text(option.rawValue).tag(option)
                                }
                            }
                            .pickerStyle(.menu)
                            .tint(.textPrimary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(16)
                            .background(Color.white.opacity(0.92))
                            .clipShape(RoundedRectangle(cornerRadius: 18))
                        }

                        editorField(title: "Age") {
                            TextField("Optional", text: $ageText, prompt: Text("Optional").foregroundColor(.textSecondary))
                                .foregroundColor(.textPrimary)
                                .keyboardType(.numberPad)
                                .focused($ageFieldFocused)
                                .padding(16)
                                .background(Color.white.opacity(0.92))
                                .clipShape(RoundedRectangle(cornerRadius: 18))
                        }
                    }
                }
                .padding(20)
            }
            .background(
                LinearGradient(colors: [.gradientTop, .gradientBottom], startPoint: .topLeading, endPoint: .bottomTrailing)
                    .ignoresSafeArea()
            )
            .navigationTitle("Edit Profile")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") {
                        dismiss()
                    }
                }

                ToolbarItem(placement: .topBarTrailing) {
                    Button("Save") {
                        onSave(
                            displayName.trimmingCharacters(in: .whitespacesAndNewlines),
                            selectedGender,
                            normalizedAge,
                            avatarImageData
                        )
                        dismiss()
                    }
                    .disabled(displayName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }

                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done") { ageFieldFocused = false }
                }
            }
        }
        .onChange(of: selectedPhotoItem) { _, newItem in
            guard let newItem else { return }
            Task {
                if let data = try? await newItem.loadTransferable(type: Data.self) {
                    await MainActor.run {
                        avatarImageData = data
                    }
                }
            }
        }
    }

    private var normalizedAge: Int? {
        guard let age = Int(ageText.trimmingCharacters(in: .whitespacesAndNewlines)), (1...120).contains(age) else {
            return nil
        }
        return age
    }

    @ViewBuilder
    private func editorField<Content: View>(title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(.appHeadline)
                .foregroundColor(.textPrimary)
            content()
        }
    }
}
