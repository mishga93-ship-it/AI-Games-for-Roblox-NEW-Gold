import SwiftUI

private func iconForSocialPost(category: String?, projectKind: String) -> String {
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

private let gameGenres = [
    "Obby", "Tycoon", "Simulator", "RPG", "Horror", "Roleplay",
    "PvP Arena", "Tower Defense", "Racing", "Parkour", "Story",
    "Mini-games Hub", "Survival", "Fighting",
]

private let contentCategories = [
    "Characters/NPCs", "Clothing & Outfits", "Accessories",
    "Avatar Bodies & Heads", "Weapons", "Vehicles", "Buildings",
    "Furniture & Props", "Maps & Environments", "Items & Tools",
    "Scripts/Systems", "UI/GUI", "Animations", "Audio & Music",
    "Particles & Effects", "Decals & Textures", "Plugins",
]

struct CatalogView: View {
    @State private var posts: [AIWorkspaceAPI.SocialPost] = []
    @State private var profile: AIWorkspaceAPI.SocialProfile?
    @State private var isLoading = false
    @State private var isLoadingMore = false
    @State private var nextCursor: String?
    @State private var errorText: String?
    @State private var feedMode = "new"
    @State private var selectedPost: AIWorkspaceAPI.SocialPost?
    @State private var searchText = ""
    @State private var selectedTag: String?
    @State private var contentSegment: ContentSegment = .all
    @State private var searchDebounceTask: Task<Void, Never>?
    @State private var showLiveTrendsSheet = false
    // Bug 19 follow-up: observe session interaction cache so feed cards re-render
    // their like/save chips the moment the user toggles them inside the detail view.
    @StateObject private var interactionCache = PostInteractionCache.shared
    @FocusState private var isSearchFocused: Bool

    private enum ContentSegment: String, CaseIterable {
        case all = "All"
        case games = "Games"
        case content = "Content"
    }

    private var activeFilters: [String] {
        contentSegment == .games ? gameGenres : contentSegment == .content ? contentCategories : gameGenres + contentCategories
    }

    var body: some View {
        VStack(spacing: 8) {
            // Header — pinned above the scrollable feed. User request: only the
            // card list scrolls; Top Charts banner, segment pickers and filter
            // chips remain sticky at the top of the Community tab.
            VStack(spacing: 8) {
                HStack(spacing: 8) {
                    compactSearchField
                    topChartsCompactButton
                    liveTrendsButton
                }
                contentSegmentPicker
                feedModePicker
                filterChips
            }
            .padding(.horizontal, 16)
            .padding(.top, 4)

            ScrollView(showsIndicators: false) {
                LazyVStack(spacing: 16) {
                    feedSection

                    // Bottom spacer so the last card isn't clipped by the floating tab bar
                    Color.clear.frame(height: 80)
                }
                .padding(.horizontal, 16)
                .padding(.top, 4)
            }
            // iOS default for ScrollView in NavigationStack is `.interactively`, which causes
            // the main thread to contend with keyboard animation geometry on large LazyVStacks
            // — the app visibly freezes when the `.searchable` keyboard appears. Force `.immediately`.
            .scrollDismissesKeyboard(.immediately)
        }
        .background(
            LinearGradient(colors: [.gradientTop, .gradientBottom], startPoint: .topLeading, endPoint: .bottomTrailing)
                .ignoresSafeArea()
        )
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .navigationBar)
        .task {
            await loadAll()
        }
        .onChange(of: feedMode) { _, _ in
            Task { await loadFeed() }
        }
        .onChange(of: contentSegment) { _, _ in
            selectedTag = nil
            Task { await loadFeed() }
        }
        .onChange(of: selectedTag) { _, _ in
            Task { await loadFeed() }
        }
        .onChange(of: searchText) { _, _ in
            // Debounce ~300ms so the "No Results" empty state can surface
            // for invalid queries without waiting for explicit onSubmit.
            searchDebounceTask?.cancel()
            searchDebounceTask = Task { @MainActor in
                try? await Task.sleep(for: .milliseconds(300))
                if !Task.isCancelled {
                    await loadFeed()
                }
            }
        }
        .sheet(item: $selectedPost) { post in
            NavigationStack {
                // Silent refresh callback is a no-op now: optimistic updates in
                // CommunityPostDetailView keep state in sync without re-fetching
                // the whole feed (which used to reset LazyVStack scroll position).
                CommunityPostDetailView(post: post) { }
            }
            .presentationDetents([.large])
        }
        .sheet(isPresented: $showLiveTrendsSheet) {
            NavigationStack {
                ScrollView(showsIndicators: false) {
                    VStack(spacing: 24) {
                        TrendingRobloxStrip(category: "Featured", title: "Featured", limit: 10)
                        TrendingRobloxStrip(category: "Animations", title: "Animations / Emotes", limit: 10)
                        TrendingRobloxStrip(category: "Decals", title: "Decals & Accessories", limit: 10)
                        TrendingRobloxStrip(category: "Collectibles", title: "Collectibles", limit: 10)
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                }
                .background(
                    LinearGradient(colors: [.gradientTop, .gradientBottom], startPoint: .topLeading, endPoint: .bottomTrailing)
                        .ignoresSafeArea()
                )
                .navigationTitle("Live Creator Trends")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .navigationBarTrailing) {
                        Button("Close") { showLiveTrendsSheet = false }
                    }
                }
            }
            .presentationDetents([.large])
        }
    }

    // MARK: - Subviews

    private var compactSearchField: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(.textSecondary)
            TextField("Search games, content, creators", text: $searchText)
                .font(.system(size: 14, weight: .regular, design: .rounded))
                .foregroundColor(.textPrimary)
                .focused($isSearchFocused)
                .submitLabel(.search)
                .onSubmit {
                    Task { await loadFeed() }
                }
            if !searchText.isEmpty {
                Button {
                    searchText = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 14))
                        .foregroundColor(.textSecondary)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Color.white.opacity(0.08))
        .clipShape(Capsule())
        .overlay(
            Capsule()
                .stroke(Color.accentPrimary.opacity(isSearchFocused ? 0.5 : 0.12), lineWidth: 1)
        )
    }

    private var topChartsCompactButton: some View {
        NavigationLink(destination: TopChartsView()) {
            Image(systemName: "chart.bar.fill")
                .font(.system(size: 15, weight: .bold))
                .foregroundColor(.accentPrimary)
                .frame(width: 36, height: 36)
                .background(
                    LinearGradient(
                        colors: [Color.accentOrange.opacity(0.2), Color.accentPrimary.opacity(0.15)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .overlay(
                    RoundedRectangle(cornerRadius: 10)
                        .stroke(Color.accentPrimary.opacity(0.25), lineWidth: 1)
                )
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Top Charts")
    }

    private var liveTrendsButton: some View {
        Button {
            showLiveTrendsSheet = true
        } label: {
            Image(systemName: "flame.fill")
                .font(.system(size: 15, weight: .bold))
                .foregroundColor(.accentOrange)
                .frame(width: 36, height: 36)
                .background(
                    LinearGradient(
                        colors: [Color.accentOrange.opacity(0.22), Color.accentSecondary.opacity(0.15)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .overlay(
                    RoundedRectangle(cornerRadius: 10)
                        .stroke(Color.accentOrange.opacity(0.3), lineWidth: 1)
                )
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Live Creator Trends")
    }

    private var contentSegmentPicker: some View {
        Picker("Type", selection: $contentSegment) {
            ForEach(ContentSegment.allCases, id: \.self) { segment in
                Text(segment.rawValue).tag(segment)
            }
        }
        .pickerStyle(.segmented)
    }

    private var feedModePicker: some View {
        Picker("Feed", selection: $feedMode) {
            Text("New").tag("new")
            Text("Top").tag("top")
            Text("Following").tag("following")
            Text("Saved").tag("saved")
        }
        .pickerStyle(.segmented)
    }

    private var filterChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(activeFilters, id: \.self) { filter in
                    let isSelected = selectedTag == filter
                    Button {
                        selectedTag = isSelected ? nil : filter
                    } label: {
                        Text(filter)
                            .font(.system(size: 12, weight: .medium, design: .rounded))
                            .foregroundColor(isSelected ? .white : .textSecondary)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 5)
                            .background(isSelected ? Color.accentPrimary : Color.white.opacity(0.08))
                            .clipShape(Capsule())
                            .contentShape(Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 2)
        }
    }

    @ViewBuilder
    private var feedSection: some View {
        if isLoading {
            ProgressView("Loading community...")
                .tint(.accentPrimary)
                .padding(.top, 40)
        } else if let errorText {
            VStack(spacing: 16) {
                ContentUnavailableView(
                    "Community Feed Unavailable",
                    systemImage: "person.3.sequence.fill",
                    description: Text(errorText)
                )
                Button {
                    Task { await loadFeed() }
                } label: {
                    Label("Retry", systemImage: "arrow.clockwise")
                        .font(.system(size: 14, weight: .bold, design: .rounded))
                        .foregroundColor(.white)
                        .padding(.horizontal, 22)
                        .padding(.vertical, 12)
                        .background(Color.accentPrimary)
                        .clipShape(Capsule())
                }
                .buttonStyle(.plain)
            }
            .padding(24)
            .frame(maxWidth: .infinity, minHeight: 320)
        } else if posts.isEmpty {
            ContentUnavailableView(
                searchText.isEmpty && selectedTag == nil
                    ? "No Community Posts Yet"
                    : "No Results",
                systemImage: searchText.isEmpty && selectedTag == nil
                    ? "person.3.sequence.fill"
                    : "magnifyingglass",
                description: Text(
                    searchText.isEmpty && selectedTag == nil
                        ? "Publish a generated project to seed the feed."
                        : "Try a different search or filter."
                )
            )
            .padding(24)
            .frame(maxWidth: .infinity, minHeight: 320)
        } else {
            ForEach(posts) { post in
                // Overlay session-level interaction cache so like/save state set inside
                // CommunityPostDetailView propagates back to the feed card when the sheet
                // dismisses (cache is @Published → triggers re-render).
                let displayedPost = interactionCache.apply(to: post)
                CommunityPostCard(post: displayedPost, onOpen: {
                    selectedPost = post
                }, onLike: {
                    if let idx = posts.firstIndex(where: { $0.id == post.id }) {
                        let wasLiked = posts[idx].likedByViewer == true
                        posts[idx].likedByViewer = !wasLiked
                        posts[idx].likes += wasLiked ? -1 : 1
                        if !wasLiked && posts[idx].dislikedByViewer == true {
                            posts[idx].dislikedByViewer = false
                            posts[idx].dislikes = max(0, (posts[idx].dislikes ?? 0) - 1)
                        }
                        // Mirror to shared cache so detail view + other cards stay in sync.
                        interactionCache.setLiked(postId: post.id, liked: !wasLiked)
                    }
                    Task { _ = try? await AIWorkspaceAPI.toggleLike(postId: post.id) }
                }, onDislike: {
                    if let idx = posts.firstIndex(where: { $0.id == post.id }) {
                        let wasDisliked = posts[idx].dislikedByViewer == true
                        posts[idx].dislikedByViewer = !wasDisliked
                        posts[idx].dislikes = (posts[idx].dislikes ?? 0) + (wasDisliked ? -1 : 1)
                        if !wasDisliked && posts[idx].likedByViewer == true {
                            posts[idx].likedByViewer = false
                            posts[idx].likes = max(0, posts[idx].likes - 1)
                            interactionCache.setLiked(postId: post.id, liked: false)
                        }
                    }
                    Task { _ = try? await AIWorkspaceAPI.toggleDislike(postId: post.id) }
                }, onSave: {
                    if let idx = posts.firstIndex(where: { $0.id == post.id }) {
                        let wasSaved = posts[idx].savedByViewer == true
                        posts[idx].savedByViewer = !wasSaved
                        interactionCache.setSaved(postId: post.id, saved: !wasSaved)
                    }
                    Task { _ = try? await AIWorkspaceAPI.toggleSave(postId: post.id) }
                }, onReport: {
                    Task {
                        _ = try? await AIWorkspaceAPI.reportPost(postId: post.id, reason: "User report from app")
                    }
                })
                .onAppear {
                    if post.id == posts.last?.id {
                        Task { await loadMore() }
                    }
                }
            }

            if isLoadingMore {
                ProgressView()
                    .tint(.accentPrimary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
            }
        }
    }

    // MARK: - Data

    @MainActor
    private func loadAll() async {
        await loadFeed()
    }

    private var contentTypeParam: String? {
        switch contentSegment {
        case .all: nil
        case .games: "game"
        case .content: "content"
        }
    }

    @MainActor
    private func loadFeed() async {
        isLoading = true
        nextCursor = nil
        defer { isLoading = false }
        do {
            // Normalize tag — API uses lowercase canonical values; UI shows title-case labels.
            // Without this, tags like "Obby"/"Tycoon"/"RPG" caused the feed request to fail.
            let normalizedTag = selectedTag?.lowercased()
            async let remoteFeed = AIWorkspaceAPI.fetchSocialFeed(
                mode: feedMode,
                contentType: contentTypeParam,
                search: searchText.isEmpty ? nil : searchText,
                tag: normalizedTag
            )
            async let remoteProfile = AIWorkspaceAPI.fetchSocialProfile()
            let response = try await remoteFeed
            posts = response.posts
            nextCursor = response.nextCursor
            profile = try? await remoteProfile
            errorText = nil
        } catch {
            print("[CatalogView.loadFeed] error: \(error) — tag=\(selectedTag ?? "nil") search=\(searchText) mode=\(feedMode)")
            errorText = "Sign in with Firebase and make sure the Functions backend is reachable."
        }
    }

    @MainActor
    private func loadMore() async {
        guard !isLoadingMore, let cursor = nextCursor else { return }
        isLoadingMore = true
        defer { isLoadingMore = false }
        do {
            let response = try await AIWorkspaceAPI.fetchSocialFeed(
                mode: feedMode,
                contentType: contentTypeParam,
                search: searchText.isEmpty ? nil : searchText,
                tag: selectedTag,
                cursor: cursor
            )
            let existingIds = Set(posts.map(\.id))
            let newPosts = response.posts.filter { !existingIds.contains($0.id) }
            posts.append(contentsOf: newPosts)
            nextCursor = response.nextCursor
        } catch {
            // Silently ignore pagination errors — current page stays visible
        }
    }

}

// MARK: - Post Card

private struct CommunityPostCard: View {
    let post: AIWorkspaceAPI.SocialPost
    let onOpen: () -> Void
    let onLike: () -> Void
    let onDislike: () -> Void
    let onSave: () -> Void
    let onReport: () -> Void

    @State private var image: UIImage?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Hero image
            ZStack(alignment: .topTrailing) {
                if let img = image {
                    Image(uiImage: img)
                        .resizable()
                        .scaledToFill()
                        .frame(height: 180)
                        .clipped()
                } else {
                    ZStack {
                        LinearGradient(
                            colors: [Color.accentPrimary.opacity(0.15), Color.accentPrimary.opacity(0.04)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                        Image(systemName: iconForSocialPost(category: post.category, projectKind: post.projectKind))
                            .font(.system(size: 40))
                            .foregroundColor(.accentPrimary.opacity(0.2))
                    }
                    .frame(height: 180)
                }

                // Badge overlay
                HStack(spacing: 6) {
                    Text(post.projectKind.capitalized)
                        .font(.system(size: 10, weight: .bold, design: .rounded))
                        .foregroundColor(.white)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(.ultraThinMaterial.opacity(0.9))
                        .background(Color.accentPrimary.opacity(0.6))
                        .clipShape(Capsule())
                }
                .padding(10)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 180)
            .clipShape(UnevenRoundedRectangle(topLeadingRadius: 20, bottomLeadingRadius: 0, bottomTrailingRadius: 0, topTrailingRadius: 20))

            VStack(alignment: .leading, spacing: 10) {
                // Title + author
                VStack(alignment: .leading, spacing: 3) {
                    Text(post.title)
                        .font(.system(size: 16, weight: .bold, design: .rounded))
                        .foregroundColor(.textPrimary)
                        .lineLimit(2)
                    NavigationLink(destination: CreatorProfileView(profileId: post.authorId, initialName: post.authorName)) {
                        HStack(spacing: 5) {
                            AvatarView(url: post.authorAvatarUrl, name: post.authorName, size: 18)
                            Text(post.authorName)
                                .font(.system(size: 12, weight: .semibold, design: .rounded))
                                .foregroundColor(.accentPrimary)
                        }
                    }
                    .buttonStyle(.plain)
                }

                // Description (skip if raw code/JSON)
                if !post.description.isEmpty && !post.description.hasPrefix("```") && !post.description.hasPrefix("{") {
                    Text(post.description)
                        .font(.system(size: 13, weight: .regular, design: .rounded))
                        .foregroundColor(.textPrimary.opacity(0.85))
                        .lineLimit(2)
                }

                // Tags (max 3)
                if !post.tags.isEmpty {
                    HStack(spacing: 5) {
                        ForEach(post.tags.prefix(3), id: \.self) { tag in
                            Text("#\(tag)")
                                .font(.system(size: 10, weight: .semibold, design: .rounded))
                                .foregroundColor(.accentPrimary)
                                .padding(.horizontal, 7)
                                .padding(.vertical, 4)
                                .background(Color.accentPrimary.opacity(0.08))
                                .clipShape(Capsule())
                        }
                        if post.tags.count > 3 {
                            Text("+\(post.tags.count - 3)")
                                .font(.system(size: 10, weight: .bold, design: .rounded))
                                .foregroundColor(.textTertiary)
                        }
                    }
                }

                // Bottom action row
                HStack(spacing: 0) {
                    // Engagement stats
                    HStack(spacing: 12) {
                        HStack(spacing: 3) {
                            Image(systemName: post.likedByViewer == true ? "heart.fill" : "heart")
                                .foregroundColor(post.likedByViewer == true ? .pink : .textTertiary)
                            Text("\(post.likes)")
                        }
                        .onTapGesture(perform: onLike)

                        HStack(spacing: 3) {
                            Image(systemName: "bubble")
                                .foregroundColor(.textTertiary)
                            Text("\(post.commentCount)")
                        }

                        HStack(spacing: 3) {
                            Image(systemName: "arrow.down.circle")
                                .foregroundColor(.textTertiary)
                            Text("\(post.downloadCount)")
                        }
                    }
                    .font(.system(size: 12, weight: .semibold, design: .rounded))
                    .foregroundColor(.textSecondary)

                    Spacer()

                    Button {
                        onSave()
                    } label: {
                        Image(systemName: post.savedByViewer == true ? "bookmark.fill" : "bookmark")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(post.savedByViewer == true ? .accentPrimary : .textTertiary)
                            .frame(width: 44, height: 44, alignment: .trailing)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.borderless)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
        }
        .background(Color.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 20))
        .overlay(
            RoundedRectangle(cornerRadius: 20)
                .stroke(Color.white.opacity(0.06), lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.08), radius: 6, y: 3)
        .contentShape(Rectangle())
        .onTapGesture(perform: onOpen)
        .task {
            // Find first URL that is an actual image (skip JSON/FBX/RBXM etc.)
            let imageExts: Set<String> = ["png", "jpg", "jpeg", "gif", "webp", "mp4", "mov"]
            guard let urlStr = post.previewUrls.first(where: { str in
                guard let url = URL(string: str) else { return false }
                let ext = url.pathExtension.lowercased()
                return ext.isEmpty || imageExts.contains(ext)
            }) else { return }
            image = await ImageCacheManager.shared.image(for: urlStr)
        }
    }
}

// MARK: - Profile Summary

private struct CommunityProfileSummaryCard: View {
    let profile: AIWorkspaceAPI.SocialProfile

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(profile.displayName)
                        .font(.appHeadline)
                        .foregroundColor(.textPrimary)
                    Text(profile.headline ?? "Creator profile")
                        .font(.appCaption)
                        .foregroundColor(.textSecondary)
                }
                Spacer()
                Text("\(profile.publishedProjectCount) published")
                    .font(.appCaption)
                    .foregroundColor(.accentPrimary)
            }

            Text(profile.bio?.isEmpty == false ? profile.bio! : "Update your creator profile to make your community presence stronger.")
                .font(.appBody)
                .foregroundColor(.textPrimary)

            HStack(spacing: 14) {
                CommunityMetric(title: "Followers", value: "\(profile.followerCount)")
                CommunityMetric(title: "Following", value: "\(profile.followingCount)")
                CommunityMetric(title: "Saved", value: "\(profile.savedCount)")
                CommunityMetric(title: "Likes", value: "\(profile.totalLikes)")
            }
        }
        .padding(18)
        .background(Color.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 20))
    }
}

private struct CommunityMetric: View {
    let title: String
    let value: String

    var body: some View {
        VStack(spacing: 4) {
            Text(value)
                .font(.appHeadline)
                .foregroundColor(.accentPrimary)
            Text(title)
                .font(.appCaption)
                .foregroundColor(.textSecondary)
        }
    }
}

// MARK: - Post Detail

struct CommunityPostDetailView: View {
    let post: AIWorkspaceAPI.SocialPost
    let onRefresh: @MainActor () async -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var detail: AIWorkspaceAPI.SocialPostDetail?
    @State private var commentDraft = ""
    @State private var isLoading = false
    @State private var errorText: String?
    @State private var isSubmitting = false
    @State private var replyingTo: AIWorkspaceAPI.SocialComment?
    @State private var showDownloads = false
    @State private var selectedImageIndex = 0
    @State private var downloadingArtifactId: String?
    // Trigger for focusing the extracted composer (see PostCommentComposer).
    // Parent only flips this to `true`; the composer's internal @FocusState picks
    // it up via onChange and resets it back to `false`. Keeping @FocusState OUT of
    // this parent is the core keyboard-lag fix — focus changes no longer invalidate
    // CommunityPostDetailView.body (hero gallery + engagement + actions + downloads
    // + tags + comment tree).
    @State private var shouldFocusComposer: Bool = false

    var body: some View {
        // ScrollViewReader wraps the ScrollView so that when the composer's
        // TextField becomes focused, we can scroll the ScrollView to reveal the
        // Post Comment button too. iOS's built-in first-responder auto-scroll
        // only reveals the TextField itself; without this, the button below the
        // field stays hidden under the keyboard.
        ScrollViewReader { proxy in
        ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 0) {
                    if isLoading {
                        ProgressView("Loading post...")
                            .tint(.accentPrimary)
                            .frame(maxWidth: .infinity)
                            .padding(.top, 60)
                    } else if let detail {
                        // MARK: Hero image gallery
                        heroImageGallery(detail: detail)

                        VStack(alignment: .leading, spacing: 16) {
                            // Bug 19: inline error banner — shows real backend error when
                            // detail fell back to fromPost OR comment POST failed. Before,
                            // failures were silently masked so the user saw "no comments"
                            // for posts that actually had comments on the server.
                            if let errorText {
                                HStack(alignment: .top, spacing: 8) {
                                    Image(systemName: "exclamationmark.triangle.fill")
                                        .font(.system(size: 14, weight: .bold))
                                        .foregroundColor(.accentPink)
                                    Text(errorText)
                                        .font(.appCaption)
                                        .foregroundColor(.textPrimary)
                                        .fixedSize(horizontal: false, vertical: true)
                                    Spacer()
                                }
                                .padding(10)
                                .background(Color.accentPink.opacity(0.12))
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                            }

                            // Title + kind badge
                            HStack(alignment: .top, spacing: 10) {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(detail.title)
                                        .font(.system(size: 22, weight: .bold, design: .rounded))
                                        .foregroundColor(.textPrimary)
                                    NavigationLink(destination: CreatorProfileView(profileId: detail.authorId, initialName: detail.authorName)) {
                                        HStack(spacing: 6) {
                                            AvatarView(url: detail.authorAvatarUrl, name: detail.authorName, size: 20)
                                            Text(detail.authorName)
                                                .font(.system(size: 13, weight: .semibold, design: .rounded))
                                                .foregroundColor(.accentPrimary)
                                        }
                                    }
                                    .buttonStyle(.plain)
                                }
                                Spacer()
                                Text(detail.projectKind.capitalized)
                                    .font(.system(size: 11, weight: .bold, design: .rounded))
                                    .foregroundColor(.white)
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 5)
                                    .background(Color.accentPrimary)
                                    .clipShape(Capsule())
                            }

                            // Engagement stats row
                            HStack(spacing: 16) {
                                engagementStat(icon: "heart.fill", value: detail.likes, tint: .pink)
                                engagementStat(icon: "bubble.fill", value: detail.comments?.count ?? detail.commentCount, tint: .accentPrimary)
                                engagementStat(icon: "arrow.down.circle.fill", value: detail.downloadCount, tint: .green)
                            }

                            // Action buttons
                            HStack(spacing: 8) {
                                actionButton(
                                    icon: detail.likedByViewer == true ? "heart.fill" : "heart",
                                    label: detail.likedByViewer == true ? "Liked" : "Like",
                                    isActive: detail.likedByViewer == true,
                                    tint: .pink
                                ) {
                                    toggleLikeOptimistic()
                                }

                                actionButton(
                                    icon: detail.savedByViewer == true ? "bookmark.fill" : "bookmark",
                                    label: detail.savedByViewer == true ? "Saved" : "Save",
                                    isActive: detail.savedByViewer == true,
                                    tint: .accentPrimary
                                ) {
                                    toggleSaveOptimistic()
                                }

                                if let author = detail.author, author.id != detail.authorId {
                                    actionButton(
                                        icon: "person.badge.plus",
                                        label: "Follow",
                                        isActive: false,
                                        tint: .accentPrimary
                                    ) {
                                        Task {
                                            _ = try? await AIWorkspaceAPI.followProfile(profileId: author.id)
                                            // Follow doesn't affect the detail view content — silent refresh only.
                                            await silentRefresh()
                                        }
                                    }
                                }
                            }

                            // Description (skip if raw code/JSON)
                            if !detail.description.isEmpty && !detail.description.hasPrefix("```") && !detail.description.hasPrefix("{") {
                                Text(detail.description)
                                    .font(.appBody)
                                    .foregroundColor(.textPrimary)
                                    .padding(14)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .background(Color.cardBackground)
                                    .clipShape(RoundedRectangle(cornerRadius: 14))
                            }

                            // Tags
                            if !detail.tags.isEmpty {
                                ScrollView(.horizontal, showsIndicators: false) {
                                    HStack(spacing: 6) {
                                        ForEach(detail.tags, id: \.self) { tag in
                                            Text("#\(tag)")
                                                .font(.system(size: 12, weight: .semibold, design: .rounded))
                                                .foregroundColor(.accentPrimary)
                                                .padding(.horizontal, 10)
                                                .padding(.vertical, 6)
                                                .background(Color.accentPrimary.opacity(0.1))
                                                .clipShape(Capsule())
                                        }
                                    }
                                }
                            }

                            // Download Files section
                            downloadSection(detail: detail)

                            // Author card
                            if let author = detail.author {
                                authorCard(author: author, authorId: detail.authorId)
                            }

                            // Comments
                            CommentTreeView(
                                comments: detail.comments ?? [],
                                onReply: { comment in
                                    replyingTo = comment
                                    commentDraft = "@\(comment.authorName) "
                                    // Ask the extracted composer to focus its field.
                                    // iOS auto-scrolls ScrollView to bring the first
                                    // responder into view — no manual scrollTo needed.
                                    shouldFocusComposer = true
                                },
                                onLike: { comment in
                                    likeCommentOptimistic(commentId: comment.id)
                                }
                            )

                            // Inline composer — extracted to its own View struct so
                            // @FocusState flips invalidate only the composer, not this
                            // entire huge body. Avoids the multi-second keyboard-open
                            // lag seen when @FocusState lived on the parent.
                            PostCommentComposer(
                                draft: $commentDraft,
                                replyingTo: $replyingTo,
                                shouldFocus: $shouldFocusComposer,
                                isSubmitting: isSubmitting,
                                onSubmit: { await submitComment() },
                                onFocusChange: { focused in
                                    // iOS auto-scrolls only the TextField into view;
                                    // the Post Comment button below stays hidden under
                                    // the keyboard. Bring the submit button into view
                                    // explicitly on focus.
                                    guard focused else { return }
                                    withAnimation(.easeOut(duration: 0.25)) {
                                        proxy.scrollTo("composerBottom", anchor: .bottom)
                                    }
                                }
                            )
                        }
                        .padding(16)
                        // Clearance for the floating tab bar (this sheet renders
                        // under it). Last inline element is the composer, so the
                        // clearance lives on the scroll content — no safeAreaInset.
                        .padding(.bottom, LayoutMetrics.floatingTabBarClearance)
                    } else if let errorText {
                        ContentUnavailableView("Post Unavailable", systemImage: "exclamationmark.bubble", description: Text(errorText))
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            // Bug: `.interactively` on a large ScrollView (many comments/downloads/tags) causes
            // main-thread contention during keyboard animation → the app visibly freezes for a
            // beat when the comment field is focused. `.immediately` removes the interactive
            // tracking and keeps keyboard dismissal on scroll.
        .scrollDismissesKeyboard(.immediately)
        .background(
            LinearGradient(colors: [.gradientTop, .gradientBottom], startPoint: .topLeading, endPoint: .bottomTrailing)
                .ignoresSafeArea()
        )
        // NOTE: `.dismissKeyboardOnTap()` removed here — it's redundant with
        // `.scrollDismissesKeyboard(.immediately)` on the inner ScrollView, and its
        // UITapGestureRecognizer on a background passthrough view was suspected of
        // contributing to first-responder churn during keyboard open/close.
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                ShareLink(
                    item: DeepLinkManager.shareURL(for: .post(id: post.id)),
                    subject: Text(post.title),
                    message: Text(post.description)
                ) {
                    Image(systemName: "square.and.arrow.up")
                        .foregroundColor(.accentPrimary)
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button("Done") { dismiss() }
            }
        }
        .task {
            await reload(initial: true)
        }
        } // close ScrollViewReader
    }

    // MARK: - Hero Image Gallery

    /// Extensions that are actual displayable images/video
    private static let imageExtensions: Set<String> = ["png", "jpg", "jpeg", "gif", "webp", "mp4", "mov"]

    private func filteredPreviewURLs(from previewUrls: [String]) -> [URL] {
        previewUrls
            .compactMap(URL.init(string:))
            .filter { url in
                let ext = url.pathExtension.lowercased()
                return ext.isEmpty || Self.imageExtensions.contains(ext)
            }
    }

    @ViewBuilder
    private func heroImageGallery(detail: AIWorkspaceAPI.SocialPostDetail) -> some View {
        let urls = filteredPreviewURLs(from: detail.previewUrls)
        if urls.isEmpty {
            ZStack {
                LinearGradient(
                    colors: [Color.accentPrimary.opacity(0.3), Color.accentPrimary.opacity(0.08)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                Image(systemName: iconForSocialPost(category: detail.category, projectKind: detail.projectKind))
                    .font(.system(size: 48))
                    .foregroundColor(.accentPrimary.opacity(0.4))
            }
            .frame(height: 240)
        } else if urls.count == 1 {
            PostImageView(url: urls[0])
                .frame(height: 260)
                .clipped()
        } else {
            TabView(selection: $selectedImageIndex) {
                ForEach(Array(urls.enumerated()), id: \.offset) { index, url in
                    PostImageView(url: url)
                        .tag(index)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .always))
            .frame(height: 260)
        }
    }

    // MARK: - Download Section

    @ViewBuilder
    private func downloadSection(detail: AIWorkspaceAPI.SocialPostDetail) -> some View {
        let artifacts = detail.downloadableArtifacts ?? []
        let downloadableFiles = artifacts.filter { !$0.isPreviewMedia }
        let allFiles = downloadableFiles.isEmpty ? artifacts : downloadableFiles

        if !allFiles.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                Button {
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                        showDownloads.toggle()
                    }
                } label: {
                    HStack(spacing: 10) {
                        Image(systemName: "arrow.down.doc.fill")
                            .font(.system(size: 16, weight: .bold))
                            .foregroundColor(.white)
                            .frame(width: 36, height: 36)
                            .background(
                                LinearGradient(colors: [.accentPrimary, .accentPrimary.opacity(0.7)], startPoint: .top, endPoint: .bottom)
                            )
                            .clipShape(RoundedRectangle(cornerRadius: 10))

                        VStack(alignment: .leading, spacing: 2) {
                            Text("Download Files")
                                .font(.system(size: 15, weight: .bold, design: .rounded))
                                .foregroundColor(.textPrimary)
                            Text("\(allFiles.count) file\(allFiles.count == 1 ? "" : "s") available")
                                .font(.system(size: 12, weight: .medium, design: .rounded))
                                .foregroundColor(.textSecondary)
                        }

                        Spacer()

                        Image(systemName: showDownloads ? "chevron.up" : "chevron.down")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundColor(.textSecondary)
                    }
                    .padding(14)
                    .background(Color.cardBackground)
                    .clipShape(RoundedRectangle(cornerRadius: 16))
                    .overlay(
                        RoundedRectangle(cornerRadius: 16)
                            .stroke(Color.accentPrimary.opacity(0.15), lineWidth: 1)
                    )
                }
                .buttonStyle(.plain)

                if showDownloads {
                    VStack(spacing: 6) {
                        ForEach(allFiles) { artifact in
                            artifactDownloadRow(artifact: artifact)
                        }
                    }
                    .transition(.opacity.combined(with: .move(edge: .top)))
                }
            }
        }
    }

    private func artifactDownloadRow(artifact: AIWorkspaceAPI.DownloadableArtifact) -> some View {
        HStack(spacing: 12) {
            Image(systemName: artifact.iconSystemName)
                .font(.system(size: 14, weight: .bold))
                .foregroundColor(.accentPrimary)
                .frame(width: 32, height: 32)
                .background(Color.accentPrimary.opacity(0.1))
                .clipShape(RoundedRectangle(cornerRadius: 8))

            VStack(alignment: .leading, spacing: 2) {
                Text(artifact.name)
                    .font(.system(size: 13, weight: .semibold, design: .rounded))
                    .foregroundColor(.textPrimary)
                    .lineLimit(1)
                HStack(spacing: 6) {
                    Text(artifact.displayExtension)
                        .font(.system(size: 10, weight: .bold, design: .rounded))
                        .foregroundColor(.accentPrimary)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color.accentPrimary.opacity(0.1))
                        .clipShape(Capsule())
                    if let size = artifact.sizeBytes {
                        Text(ByteCountFormatter.string(fromByteCount: Int64(size), countStyle: .file))
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(.textTertiary)
                    }
                }
            }

            Spacer()

            if downloadingArtifactId == artifact.id {
                ProgressView()
                    .tint(.accentPrimary)
                    .scaleEffect(0.8)
            } else if let url = artifact.bestURL {
                ShareLink(item: url) {
                    Image(systemName: "square.and.arrow.down")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(.white)
                        .frame(width: 32, height: 32)
                        .background(Color.accentPrimary)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                }
                .simultaneousGesture(TapGesture().onEnded {
                    Task { try? await AIWorkspaceAPI.trackDownload(postId: post.id) }
                })
            }
        }
        .padding(10)
        .background(Color.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    // MARK: - Author Card

    private func authorCard(author: AIWorkspaceAPI.SocialProfile, authorId: String) -> some View {
        NavigationLink(destination: CreatorProfileView(profileId: authorId, initialName: author.displayName)) {
            HStack(spacing: 14) {
                AvatarView(url: author.avatarUrl, name: author.displayName, size: 48)

                VStack(alignment: .leading, spacing: 3) {
                    Text(author.displayName)
                        .font(.system(size: 15, weight: .bold, design: .rounded))
                        .foregroundColor(.textPrimary)
                    Text(author.headline ?? author.bio ?? "Creator")
                        .font(.system(size: 12, weight: .medium, design: .rounded))
                        .foregroundColor(.textSecondary)
                        .lineLimit(1)
                    HStack(spacing: 10) {
                        Text("\(author.followerCount) followers")
                        Text("\(author.publishedProjectCount) projects")
                    }
                    .font(.system(size: 11, weight: .semibold, design: .rounded))
                    .foregroundColor(.accentPrimary.opacity(0.8))
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(.textTertiary)
            }
            .padding(14)
            .background(Color.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(Color.accentPrimary.opacity(0.1), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Helper views

    private func engagementStat(icon: String, value: Int, tint: Color) -> some View {
        HStack(spacing: 5) {
            Image(systemName: icon)
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(tint)
            Text("\(value)")
                .font(.system(size: 13, weight: .bold, design: .rounded))
                .foregroundColor(.textPrimary)
        }
    }

    private func actionButton(icon: String, label: String, isActive: Bool, tint: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 5) {
                Image(systemName: icon)
                    .font(.system(size: 13, weight: .bold))
                Text(label)
                    .font(.system(size: 12, weight: .semibold, design: .rounded))
            }
            .foregroundColor(isActive ? .white : tint)
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(isActive ? tint : tint.opacity(0.1))
            .clipShape(Capsule())
            // Expand hit area to match the capsule shape — without this, taps outside the text
            // but inside the capsule background were not registering consistently.
            .contentShape(Capsule())
        }
        .buttonStyle(.borderless)
    }

    // MARK: - Data

    /// Loads the post detail.
    /// - Parameter initial: when `true`, shows the full-screen ProgressView (first load).
    ///   Subsequent silent refreshes (after like/save/comment) MUST NOT toggle `isLoading`,
    ///   otherwise the detail screen flashes a loader and scrolls to top on every action.
    @MainActor
    private func reload(initial: Bool) async {
        if initial && detail == nil {
            isLoading = true
        }
        defer { if initial { isLoading = false } }
        do {
            var fresh = try await AIWorkspaceAPI.fetchPostDetail(postId: post.id)
            // Race-condition fix: if the user liked/saved this post in a previous visit
            // and the toggleLike/toggleSave POST hasn't committed by the time we re-fetch,
            // the server returns stale `likedByViewer=false`. Apply the local interaction
            // cache as the source of truth within the session.
            applyInteractionOverrides(to: &fresh)
            detail = fresh
            errorText = nil
        } catch {
            print("[CommunityPostDetailView.reload] error: \(error) — postId=\(post.id) initial=\(initial)")
            // Graceful fallback — render whatever we already have from the feed card
            // instead of showing an empty "Post Unavailable" screen. The user sees
            // title/image/description/tags/stats immediately; comments and download
            // files simply won't appear until the API recovers.
            if detail == nil {
                var fallback = AIWorkspaceAPI.SocialPostDetail(fromPost: post)
                applyInteractionOverrides(to: &fallback)
                detail = fallback
            }
            // Bug 19: DON'T silently mask the backend failure. Surface the real reason so
            // the user knows why the comment list is empty / post fails (auth lapse, 500,
            // offline). Before, errorText=nil + fallback detail made it look like the post
            // genuinely had no comments, which is misleading when commentCount>0.
            let reason = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
            errorText = "Couldn't refresh this post: \(reason). Pull to retry."
        }
    }

    /// Overlays the in-memory like/save cache on top of a fresh (or fallback) detail.
    /// Ensures the UI reflects the user's last action regardless of whether the backend
    /// commit has propagated or the feed card is stale.
    @MainActor
    private func applyInteractionOverrides(to detail: inout AIWorkspaceAPI.SocialPostDetail) {
        // Bug 21: also reconcile `likes` count, not just the boolean flag.
        // Otherwise: feed unlike → cache stores liked=false → detail fetched from
        // server still reports likedByViewer=true + likes=N → heart empties but
        // count stays at N. Mirrors PostInteractionCache.apply(to:) for post cards.
        if let cachedLiked = PostInteractionCache.shared.liked(postId: detail.id) {
            let serverLiked = detail.likedByViewer == true
            if cachedLiked != serverLiked {
                detail.likedByViewer = cachedLiked
                detail.likes = max(0, detail.likes + (cachedLiked ? 1 : -1))
            }
        }
        if let cachedSaved = PostInteractionCache.shared.saved(postId: detail.id) {
            detail.savedByViewer = cachedSaved
        }
        // Bug 24: also overlay comment-count delta so reopening the sheet before
        // silentRefresh returns still shows the user's just-posted comment count.
        let commentDelta = PostInteractionCache.shared.commentDelta(postId: detail.id)
        if commentDelta != 0 {
            detail.commentCount = max(0, detail.commentCount + commentDelta)
        }
    }

    /// Silent refresh — fetches detail in the background and updates state without touching
    /// `isLoading`. Called by action handlers that have already applied an optimistic mutation.
    @MainActor
    private func silentRefresh() async {
        do {
            var fresh = try await AIWorkspaceAPI.fetchPostDetail(postId: post.id)
            applyInteractionOverrides(to: &fresh)
            detail = fresh
            errorText = nil
        } catch {
            print("[CommunityPostDetailView.silentRefresh] error: \(error) — postId=\(post.id)")
            // Keep existing optimistic state on failure; don't wipe the view.
        }
    }

    @MainActor
    private func submitComment() async {
        let trimmed = commentDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        // Dismiss keyboard immediately — don't wait for the network round-trip.
        // @FocusState now lives inside the extracted PostCommentComposer; calling
        // UIKit's resignFirstResponder is enough to drop the keyboard (SwiftUI's
        // @FocusState observes first-responder changes and syncs back).
        UIApplication.shared.sendAction(
            #selector(UIResponder.resignFirstResponder),
            to: nil, from: nil, for: nil
        )
        isSubmitting = true
        defer { isSubmitting = false }
        do {
            let posted = try await AIWorkspaceAPI.addComment(
                postId: post.id,
                content: trimmed,
                parentCommentId: replyingTo?.id
            )
            // Bug 19: оптимистичная вставка — даже если silentRefresh ниже упадёт
            // (backend flaky), только что запощенный комментарий сразу появляется в UI.
            if var current = detail {
                var list = current.comments ?? []
                list.append(posted)
                current.comments = list
                current.commentCount = max(current.commentCount, list.count)
                detail = current
            }
            // Bug 24: broadcast to the feed via PostInteractionCache so that
            // SocialPost cards update their 💬 count without a feed refetch.
            PostInteractionCache.shared.bumpCommentCount(postId: post.id, delta: 1)
            commentDraft = ""
            replyingTo = nil
            errorText = nil
            // Silent refresh so the server-side state (likes/moderation) is reconciled.
            await silentRefresh()
        } catch {
            // Bug 19: показываем конкретную причину, чтобы юзер понимал — auth/сеть/500.
            let reason = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
            errorText = "Comment couldn't be posted: \(reason)"
        }
    }

    // MARK: - Optimistic action handlers

    /// Instantly flips the "liked" state and adjusts the like count, then fires the API call
    /// in the background. Rolls back on failure. Prevents the detail view from flashing a
    /// ProgressView and scrolling to top on every tap (bugs 14/18).
    @MainActor
    private func toggleLikeOptimistic() {
        guard var updated = detail else { return }
        let wasLiked = updated.likedByViewer == true
        updated.likedByViewer = !wasLiked
        updated.likes = max(0, updated.likes + (wasLiked ? -1 : 1))
        detail = updated
        // Mirror to the session cache so re-opening the card (or a fallback detail) shows
        // the correct "Liked" state even if the backend commit hasn't propagated yet.
        PostInteractionCache.shared.setLiked(postId: updated.id, liked: !wasLiked)
        let postId = updated.id
        Task {
            do {
                _ = try await AIWorkspaceAPI.toggleLike(postId: postId)
            } catch {
                print("[CommunityPostDetailView.toggleLike] error: \(error)")
                // Roll back UI + cache
                if var rollback = detail {
                    rollback.likedByViewer = wasLiked
                    rollback.likes = max(0, rollback.likes + (wasLiked ? 1 : -1))
                    detail = rollback
                }
                PostInteractionCache.shared.setLiked(postId: postId, liked: wasLiked)
            }
        }
    }

    /// Optimistically toggles the "saved" state (bug 15) — same pattern as like.
    @MainActor
    private func toggleSaveOptimistic() {
        guard var updated = detail else { return }
        let wasSaved = updated.savedByViewer == true
        updated.savedByViewer = !wasSaved
        detail = updated
        PostInteractionCache.shared.setSaved(postId: updated.id, saved: !wasSaved)
        let postId = updated.id
        Task {
            do {
                _ = try await AIWorkspaceAPI.toggleSave(postId: postId)
            } catch {
                print("[CommunityPostDetailView.toggleSave] error: \(error)")
                if var rollback = detail {
                    rollback.savedByViewer = wasSaved
                    detail = rollback
                }
                PostInteractionCache.shared.setSaved(postId: postId, saved: wasSaved)
            }
        }
    }

    /// Bug 20: toggles a comment's like state per-viewer.
    /// Previously this blindly incremented likeCount on every tap — user could rack up
    /// infinite likes. Now flips `likedByViewer` optimistically and reconciles with server.
    @MainActor
    private func likeCommentOptimistic(commentId: String) {
        guard var updated = detail, var comments = updated.comments,
              let idx = comments.firstIndex(where: { $0.id == commentId }) else { return }

        let wasLiked = comments[idx].likedByViewer == true
        let willLike = !wasLiked
        comments[idx].likedByViewer = willLike
        comments[idx].likeCount = max(0, comments[idx].likeCount + (willLike ? 1 : -1))
        updated.comments = comments
        detail = updated

        let postId = post.id
        Task {
            do {
                let response = try await AIWorkspaceAPI.likeComment(postId: postId, commentId: commentId)
                // Reconcile with authoritative server state.
                if var reconciled = detail, var c = reconciled.comments,
                   let j = c.firstIndex(where: { $0.id == commentId }) {
                    c[j].likedByViewer = response.liked
                    c[j].likeCount = response.likeCount
                    reconciled.comments = c
                    detail = reconciled
                }
            } catch {
                print("[CommunityPostDetailView.likeComment] error: \(error)")
                // Roll back on failure.
                if var rollback = detail, var c = rollback.comments,
                   let j = c.firstIndex(where: { $0.id == commentId }) {
                    c[j].likedByViewer = wasLiked
                    c[j].likeCount = max(0, c[j].likeCount + (willLike ? -1 : 1))
                    rollback.comments = c
                    detail = rollback
                }
            }
        }
    }
}

// MARK: - Async Post Image

private struct PostImageView: View {
    let url: URL
    @State private var image: UIImage?

    var body: some View {
        Group {
            if let img = image {
                Image(uiImage: img)
                    .resizable()
                    .scaledToFill()
            } else {
                ZStack {
                    Color.accentPrimary.opacity(0.06)
                    ProgressView()
                        .tint(.accentPrimary)
                }
            }
        }
        .task {
            image = await ImageCacheManager.shared.image(for: url.absoluteString)
        }
    }
}

// MARK: - SocialPostDetail fallback from SocialPost
//
// When `fetchPostDetail` fails (404 / decoding / network), `CommunityPostDetailView`
// synthesizes a `SocialPostDetail` from the `SocialPost` already in memory (the
// card the user tapped). This keeps the detail screen populated with title/image/
// description/tags/stats instead of showing a blank "Post Unavailable" screen —
// comments, downloads, and author card stay empty until the API recovers.
extension AIWorkspaceAPI.SocialPostDetail {
    init(fromPost post: AIWorkspaceAPI.SocialPost) {
        self.id = post.id
        self.projectId = post.projectId
        self.authorId = post.authorId
        self.authorName = post.authorName
        self.authorAvatarUrl = post.authorAvatarUrl
        self.title = post.title
        self.description = post.description
        self.projectKind = post.projectKind
        self.category = post.category
        self.tags = post.tags
        self.previewUrls = post.previewUrls
        self.artifactSummary = post.artifactSummary
        self.moderationStatus = post.moderationStatus
        self.publicationState = post.publicationState
        self.likes = post.likes
        self.dislikes = post.dislikes
        self.likedByViewer = post.likedByViewer
        self.dislikedByViewer = post.dislikedByViewer
        self.savedByViewer = post.savedByViewer
        self.commentCount = post.commentCount
        self.downloadCount = post.downloadCount
        self.score = post.score
        self.authorHeadline = post.authorHeadline
        self.artifactTypes = post.artifactTypes
        self.createdAt = post.createdAt
        self.project = nil
        self.comments = nil
        self.author = nil
        self.downloadableArtifacts = nil
    }
}

// MARK: - PostCommentComposer
//
// Extracted from `CommunityPostDetailView` as a child struct so that `@FocusState`
// flips invalidate ONLY this tiny body — not the huge parent (hero gallery,
// engagement, actions, description, tags, downloads, author card, comment tree).
// Parent-owned `@FocusState` was the root cause of multi-second keyboard-open
// lag in earlier iterations (see cursor/changelog-087.md Tasks 8–12).
//
// Parent triggers focus via `shouldFocus` binding (flip to `true` → child auto-
// focuses and resets the binding). `onFocusChange` fires back to the parent on
// every focus flip — the parent uses it to drive a ScrollViewReader scrollTo so
// that BOTH the TextField and the Post Comment button (id "composerBottom") end
// up above the keyboard. iOS's built-in first-responder auto-scroll only reveals
// the field itself, leaving the button hidden; the manual scrollTo fixes that.
private struct PostCommentComposer: View {
    @Binding var draft: String
    @Binding var replyingTo: AIWorkspaceAPI.SocialComment?
    @Binding var shouldFocus: Bool
    var isSubmitting: Bool
    var onSubmit: () async -> Void
    // Called whenever the TextField's focus state changes. Parent uses this to
    // scroll the enclosing ScrollView so that BOTH the TextField and the Post
    // Comment button are visible above the keyboard.
    var onFocusChange: (Bool) -> Void

    @FocusState private var isFocused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Add Comment")
                    .font(.appHeadline)
                    .foregroundColor(.textPrimary)
                Spacer()
                if replyingTo != nil {
                    Button {
                        replyingTo = nil
                        draft = ""
                    } label: {
                        Label("Cancel reply", systemImage: "xmark.circle.fill")
                            .font(.appCaption)
                            .foregroundColor(.textSecondary)
                    }
                    .buttonStyle(.plain)
                }
            }

            if let replying = replyingTo {
                Text("Replying to \(replying.authorName)")
                    .font(.appCaption)
                    .foregroundColor(.accentPrimary)
            }

            // Single-line TextField. `axis: .vertical` + `.lineLimit(1...4)` has a
            // known iOS 17/18 perf issue where every focus change re-computes the
            // TextField's dynamic height, cascading into a full parent re-layout.
            // Comments are typically short; Return submits.
            TextField("Write something useful...", text: $draft)
                .focused($isFocused)
                .foregroundColor(.textPrimary)
                .tint(.accentPrimary)
                .padding(12)
                .background(Color.cardBackground)
                .clipShape(RoundedRectangle(cornerRadius: 16))
                .submitLabel(.send)
                .onSubmit { Task { await onSubmit() } }

            PrimaryButton(title: isSubmitting ? "Posting..." : "Post Comment") {
                Task { await onSubmit() }
            }
            .disabled(isSubmitting || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            // Scroll-target anchor: the parent ScrollViewReader scrolls to this
            // id on focus so the full composer (field + button) is above the keyboard.
            .id("composerBottom")
        }
        .onChange(of: shouldFocus) { _, newValue in
            guard newValue else { return }
            isFocused = true
            // Reset the binding so the next reply-tap triggers focus again.
            shouldFocus = false
        }
        .onChange(of: isFocused) { _, newValue in
            onFocusChange(newValue)
        }
    }
}
