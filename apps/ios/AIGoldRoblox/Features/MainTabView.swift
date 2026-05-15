import SwiftUI
import UIKit

struct MainTabView: View {
    @EnvironmentObject private var appState: AppState
    @StateObject private var keyboardObserver = KeyboardObserver()
    @StateObject private var network = NetworkMonitor.shared
    @State private var showOfflineAlert = false
    @State private var showOnlineToast = false

    var body: some View {
        ZStack {
            TabView(selection: $appState.selectedRootTab) {
                NavigationStack { HomeView() }
                    .tag(RootTab.home)
                NavigationStack { ForgeView() }
                    .tag(RootTab.create)
                NavigationStack { CatalogView() }
                    .tag(RootTab.community)
                NavigationStack { ProfileView() }
                    .tag(RootTab.profile)
            }
            .toolbar(.hidden, for: .tabBar)
            // Kill any implicit animation SwiftUI might apply to TabView on
            // selectedRootTab change — content swap must be instant. The tab
            // button bounce (on isSelected) still animates independently
            // because it's outside the TabView in `safeAreaInset`.
            .animation(nil, value: appState.selectedRootTab)
            .sheet(item: $appState.pendingDeepLink) { link in
                NavigationStack {
                    DeepLinkDestinationView(link: link)
                }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                // Tab bar stays visible across push/pop — content already reserves
                // `floatingTabBarClearance` space at the bottom. Hiding it during
                // navigation caused the animation fight with NavigationStack's
                // push/pop, producing the "lag" the user reported. Only hide on
                // keyboard appearance (iOS handles that transition natively).
                if !keyboardObserver.isVisible {
                    customTabBar
                }
            }

            // Network offline alert (custom SwiftUI overlay)
            if showOfflineAlert {
                OfflineAlertOverlay(onDismiss: { showOfflineAlert = false })
                    .transition(.opacity.combined(with: .scale(scale: 0.94)))
                    .zIndex(100)
            }

            // "Connected" toast when network restores
            if showOnlineToast {
                VStack {
                    OnlineToast()
                        .padding(.top, 8)
                    Spacer()
                }
                .transition(.move(edge: .top).combined(with: .opacity))
                .zIndex(99)
            }
        }
        .onChange(of: network.isOnline) { _, isOnline in
            if !isOnline {
                withAnimation(.easeInOut(duration: 0.25)) { showOfflineAlert = true }
            } else {
                withAnimation(.easeInOut(duration: 0.25)) {
                    showOfflineAlert = false
                    showOnlineToast = true
                }
                Task {
                    try? await Task.sleep(for: .seconds(2))
                    await MainActor.run {
                        withAnimation(.easeInOut(duration: 0.25)) { showOnlineToast = false }
                    }
                }
            }
        }
    }

    private var customTabBar: some View {
        HStack(spacing: 0) {
            ForEach(RootTab.allCases, id: \.self) { tab in
                tabButton(tab)
            }
        }
        .padding(.horizontal, 12)
        .padding(.top, 10)
        .padding(.bottom, 6)
        .background(
            Color.cardBackground
                .clipShape(RoundedRectangle(cornerRadius: 24))
                .shadow(color: Color.accentPrimary.opacity(0.12), radius: 10, y: -2)
        )
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, 6)
        .background(Color.clear)
    }

    @ViewBuilder
    private func tabButton(_ tab: RootTab) -> some View {
        let isSelected = appState.selectedRootTab == tab
        let size: CGFloat = tab == .create ? (isSelected ? 54 : 48) : (isSelected ? 46 : 40)

        Button {
            // Single state mutation — no post-delayed reset, no stacked animations.
            // Scale/bounce is derived from `isSelected` and animated via .animation modifier below.
            appState.selectedRootTab = tab
        } label: {
            VStack(spacing: 4) {
                ZStack {
                    Circle()
                        .fill(
                            RadialGradient(
                                colors: [tab.color.opacity(isSelected ? 1 : 0.6), tab.color.opacity(isSelected ? 0.7 : 0.3)],
                                center: .init(x: 0.35, y: 0.3),
                                startRadius: 0,
                                endRadius: size * 0.6
                            )
                        )
                        .frame(width: size, height: size)
                        .overlay(Circle().stroke(Color.white.opacity(0.3), lineWidth: 1))
                        .shadow(color: isSelected ? tab.color.opacity(0.5) : .clear, radius: 6, y: 2)

                    Image(systemName: tab.icon)
                        .font(.system(size: size * 0.38, weight: .semibold))
                        .foregroundColor(.white)
                }
                .scaleEffect(isSelected ? 1.08 : 1.0)
                .animation(.spring(response: 0.22, dampingFraction: 0.7), value: isSelected)

                Text(tab.label)
                    .font(.system(size: 10, weight: isSelected ? .bold : .regular, design: .rounded))
                    .foregroundColor(isSelected ? tab.color : .textSecondary)
            }
            .frame(maxWidth: .infinity)
            .contentShape(Rectangle())
        }
        .buttonStyle(TabButtonStyle())
    }
}

private extension RootTab {
    var label: String {
        switch self {
        case .home: return "Home"
        case .create: return "Forge"
        case .community: return "Community"
        case .profile: return "Profile"
        }
    }

    var icon: String {
        switch self {
        case .home: return "house.fill"
        case .create: return "sparkles"
        case .community: return "globe"
        case .profile: return "person.crop.circle.fill"
        }
    }

    var color: Color {
        switch self {
        case .home: return .accentPrimary
        case .create: return .accentTeal
        case .community: return .accentSecondary
        case .profile: return Color(red: 0.52, green: 0.42, blue: 1.0)
        }
    }
}

private struct TabButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        // No press-scale animation: the isSelected spring already provides
        // tactile feedback. A dedicated press-down/press-up scale animation
        // adds ~200ms of visual noise that users perceive as transition delay.
        configuration.label
    }
}

// MARK: - Network connectivity UI

private struct OfflineAlertOverlay: View {
    let onDismiss: () -> Void

    var body: some View {
        ZStack {
            Color.black.opacity(0.45)
                .ignoresSafeArea()
                .onTapGesture { onDismiss() }

            VStack(spacing: 18) {
                ZStack {
                    Circle()
                        .fill(Color.accentSecondary.opacity(0.18))
                        .frame(width: 72, height: 72)
                    Image(systemName: "wifi.slash")
                        .font(.system(size: 32, weight: .bold))
                        .foregroundColor(.accentSecondary)
                }

                VStack(spacing: 6) {
                    Text("No Internet Connection")
                        .font(.system(size: 18, weight: .black, design: .rounded))
                        .foregroundColor(.textPrimary)
                    Text("Check your Wi-Fi or cellular data and try again.")
                        .font(.system(size: 14, weight: .medium, design: .rounded))
                        .foregroundColor(.textSecondary)
                        .multilineTextAlignment(.center)
                }

                Button {
                    onDismiss()
                } label: {
                    Text("OK")
                        .font(.system(size: 15, weight: .bold, design: .rounded))
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity, minHeight: 48)
                        .background(Color.accentPrimary)
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                }
                .buttonStyle(.plain)
            }
            .padding(24)
            .frame(maxWidth: 320)
            .background(Color.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: 22))
            .overlay(
                RoundedRectangle(cornerRadius: 22)
                    .stroke(Color.accentPrimary.opacity(0.2), lineWidth: 1)
            )
            .shadow(color: Color.black.opacity(0.2), radius: 18, y: 6)
        }
    }
}

private struct OnlineToast: View {
    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "checkmark.circle.fill")
                .foregroundColor(.white)
            Text("Back online")
                .font(.system(size: 14, weight: .bold, design: .rounded))
                .foregroundColor(.white)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 12)
        .background(
            Capsule()
                .fill(Color.green.opacity(0.95))
                .shadow(color: .black.opacity(0.2), radius: 10, y: 3)
        )
    }
}

struct DeepLinkDestinationView: View {
    @Environment(\.dismiss) private var dismiss
    let link: DeepLink

    var body: some View {
        Group {
            switch link {
            case .challenges:
                ChallengesView()
            case .post(let id):
                DeepLinkPostDetailView(postId: id)
            case .profile(let id):
                DeepLinkProfileDetailView(profileId: id)
            }
        }
        .background(
            LinearGradient(colors: [.gradientTop, .gradientBottom], startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()
        )
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Done") { dismiss() }
                    .foregroundColor(.accentPrimary)
            }
        }
    }
}

private struct DeepLinkPostDetailView: View {
    let postId: String
    @State private var post: AIWorkspaceAPI.SocialPostDetail?
    @State private var isLoading = true
    @State private var heroImage: UIImage?

    var body: some View {
        Group {
            if isLoading {
                ProgressView("Loading post...")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let post {
                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 18) {
                        if let heroImage {
                            Image(uiImage: heroImage)
                                .resizable()
                                .scaledToFill()
                                .frame(maxWidth: .infinity)
                                .frame(height: 240)
                                .clipped()
                                .clipShape(RoundedRectangle(cornerRadius: 24))
                        }

                        Text(post.title)
                            .font(.system(size: 28, weight: .black, design: .rounded))
                            .foregroundColor(.textPrimary)

                        HStack(spacing: 8) {
                            Text(post.projectKind.uppercased())
                                .font(.system(size: 12, weight: .bold, design: .rounded))
                                .foregroundColor(.accentPrimary)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 6)
                                .background(Color.pillBackground)
                                .clipShape(Capsule())

                            Text("by \(post.authorName)")
                                .font(.system(size: 14, weight: .medium, design: .rounded))
                                .foregroundColor(.textSecondary)
                        }

                        if !post.description.isEmpty {
                            Text(post.description)
                                .font(.system(size: 15, weight: .medium, design: .rounded))
                                .foregroundColor(.textSecondary)
                        }

                        HStack(spacing: 20) {
                            Label("\(post.likes)", systemImage: "heart.fill")
                                .foregroundColor(.accentSecondary)
                            Label("\(post.downloadCount)", systemImage: "arrow.down.circle.fill")
                                .foregroundColor(.accentPrimary)
                            Label("\(post.commentCount)", systemImage: "bubble.right.fill")
                                .foregroundColor(.textSecondary)
                        }
                        .font(.system(size: 14, weight: .semibold, design: .rounded))

                        if !post.tags.isEmpty {
                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 8) {
                                    ForEach(post.tags, id: \.self) { tag in
                                        Text("#\(tag)")
                                            .font(.system(size: 12, weight: .semibold, design: .rounded))
                                            .foregroundColor(.accentPrimary)
                                            .padding(.horizontal, 10)
                                            .padding(.vertical, 5)
                                            .background(Color.pillBackground)
                                            .clipShape(Capsule())
                                    }
                                }
                            }
                        }

                        ShareLink(
                            item: DeepLinkManager.shareURL(for: .post(id: postId)),
                            subject: Text(post.title),
                            message: Text(post.description)
                        ) {
                            Label("Share Post", systemImage: "square.and.arrow.up")
                                .font(.system(size: 15, weight: .semibold, design: .rounded))
                                .foregroundColor(.white)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 14)
                                .background(Color.accentPrimary)
                                .clipShape(RoundedRectangle(cornerRadius: 16))
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 12)
                    .padding(.bottom, 30)
                }
                .navigationTitle(post.title)
            } else {
                ContentUnavailableView("Post Not Found", systemImage: "exclamationmark.triangle", description: Text("This post could not be loaded."))
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .task {
            isLoading = true
            defer { isLoading = false }
            do {
                let detail = try await AIWorkspaceAPI.fetchPostDetail(postId: postId)
                post = detail
                if let url = detail.previewUrls.first {
                    heroImage = await ImageCacheManager.shared.image(for: url)
                }
            } catch {}
        }
    }
}

private struct DeepLinkProfileDetailView: View {
    let profileId: String
    @State private var profile: AIWorkspaceAPI.SocialProfile?
    @State private var posts: [AIWorkspaceAPI.SocialPost] = []
    @State private var isLoading = true

    var body: some View {
        Group {
            if isLoading {
                ProgressView("Loading profile...")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let profile {
                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 18) {
                        VStack(spacing: 12) {
                            ProfileAvatarView(
                                avatarData: nil,
                                name: profile.displayName,
                                size: 88
                            )

                            Text(profile.displayName)
                                .font(.system(size: 24, weight: .black, design: .rounded))
                                .foregroundColor(.textPrimary)

                            if let headline = profile.headline, !headline.isEmpty {
                                Text(headline)
                                    .font(.system(size: 15, weight: .medium, design: .rounded))
                                    .foregroundColor(.textSecondary)
                                    .multilineTextAlignment(.center)
                            }

                            HStack(spacing: 20) {
                                VStack(spacing: 2) {
                                    Text("\(profile.followerCount)")
                                        .font(.system(size: 18, weight: .black, design: .rounded))
                                        .foregroundColor(.accentPrimary)
                                    Text("Followers")
                                        .font(.system(size: 11, weight: .medium, design: .rounded))
                                        .foregroundColor(.textSecondary)
                                }
                                VStack(spacing: 2) {
                                    Text("\(profile.publishedProjectCount)")
                                        .font(.system(size: 18, weight: .black, design: .rounded))
                                        .foregroundColor(.accentOrange)
                                    Text("Projects")
                                        .font(.system(size: 11, weight: .medium, design: .rounded))
                                        .foregroundColor(.textSecondary)
                                }
                                VStack(spacing: 2) {
                                    Text("\(profile.totalDownloads)")
                                        .font(.system(size: 18, weight: .black, design: .rounded))
                                        .foregroundColor(.accentSecondary)
                                    Text("Downloads")
                                        .font(.system(size: 11, weight: .medium, design: .rounded))
                                        .foregroundColor(.textSecondary)
                                }
                            }
                            .padding(.top, 4)
                        }
                        .frame(maxWidth: .infinity)

                        ShareLink(
                            item: DeepLinkManager.shareURL(for: .profile(id: profileId)),
                            subject: Text(profile.displayName),
                            message: Text("\(profile.displayName) on Kami")
                        ) {
                            Label("Share Profile", systemImage: "square.and.arrow.up")
                                .font(.system(size: 15, weight: .semibold, design: .rounded))
                                .foregroundColor(.white)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 14)
                                .background(Color.accentPrimary)
                                .clipShape(RoundedRectangle(cornerRadius: 16))
                        }

                        if !posts.isEmpty {
                            VStack(alignment: .leading, spacing: 12) {
                                Text("Published Work")
                                    .font(.appHeadline)
                                    .foregroundColor(.textPrimary)

                                ForEach(posts) { post in
                                    HStack(spacing: 12) {
                                        VStack(alignment: .leading, spacing: 4) {
                                            Text(post.title)
                                                .font(.appCallout)
                                                .foregroundColor(.textPrimary)
                                            Text(post.projectKind)
                                                .font(.appCaption)
                                                .foregroundColor(.accentPrimary)
                                        }
                                        Spacer()
                                        Label("\(post.likes)", systemImage: "heart.fill")
                                            .font(.appCaption)
                                            .foregroundColor(.accentSecondary)
                                    }
                                    .padding(14)
                                    .background(Color.cardBackground)
                                    .clipShape(RoundedRectangle(cornerRadius: 16))
                                }
                            }
                        }
                    }
                    .padding(16)
                    .padding(.bottom, 30)
                }
                .navigationTitle(profile.displayName)
            } else {
                ContentUnavailableView("Profile Not Found", systemImage: "person.crop.circle.badge.xmark", description: Text("This profile could not be loaded."))
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .task {
            isLoading = true
            defer { isLoading = false }
            do {
                let portfolio = try await AIWorkspaceAPI.fetchPortfolio(profileId: profileId)
                profile = portfolio.profile
                posts = portfolio.publishedPosts
            } catch {
                profile = try? await AIWorkspaceAPI.fetchRemoteProfile(profileId: profileId)
            }
        }
    }
}
