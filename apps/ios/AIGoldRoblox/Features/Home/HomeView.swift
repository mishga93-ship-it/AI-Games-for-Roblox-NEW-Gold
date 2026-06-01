import SwiftUI
import UIKit

private func iconForPost(category: String?, projectKind: String) -> String {
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

struct HomeView: View {
    @EnvironmentObject private var appState: AppState
    @StateObject private var store = HomeStore()

    @State private var dropboxSections: [String: [ContentItem]] = [:]
    @State private var isLoadingDropbox = true
    @State private var hasFinishedDropboxLoad = false
    @State private var activeChallenge: AIWorkspaceAPI.Challenge?
    @State private var remixTarget: AIWorkspaceAPI.SocialPost?

    private let preferredSectionOrder = ["Skins", "Codes", "Mods", "Categories Cover"]

    private var allContentItems: [ContentItem] {
        dropboxSections.values.flatMap { $0 }
    }

    private var favoriteItems: [ContentItem] {
        allContentItems
            .filter { appState.isFavorite(contentID: $0.id) }
            .sorted { $0.title.localizedCaseInsensitiveCompare($1.title) == .orderedAscending }
    }

    private var visibleSectionOrder: [String] {
        preferredSectionOrder.filter { !(dropboxSections[$0] ?? []).isEmpty }
    }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 20) {
                ScreenBrandHeader(
                    eyebrow: "Kami Home",
                    title: "Create with Kami",
                    subtitle: "Creator trends, saved work, and fast jumps into your next build."
                )
                .padding(.top, 4)

                HomeHeroCard {
                    appState.setSelectedRootTab(.create)
                }

                if let activeChallenge {
                    ChallengeBannerView(challenge: activeChallenge)
                }

                NavigationLink(destination: TopChartsView()) {
                    HStack(spacing: 12) {
                        Image(systemName: "chart.bar.fill")
                            .font(.system(size: 20, weight: .bold))
                            .foregroundColor(.accentOrange)
                            .frame(width: 40, height: 40)
                            .background(Color.accentOrange.opacity(0.12))
                            .clipShape(RoundedRectangle(cornerRadius: 12))

                        VStack(alignment: .leading, spacing: 2) {
                            Text("Top Charts")
                                .font(.system(size: 16, weight: .bold, design: .rounded))
                                .foregroundColor(.textPrimary)
                            Text("See who's trending")
                                .font(.system(size: 12, weight: .medium, design: .rounded))
                                .foregroundColor(.textSecondary)
                        }

                        Spacer()

                        Image(systemName: "chevron.right")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundColor(.accentPrimary)
                    }
                    .padding(14)
                    .background(Color.cardBackground)
                    .clipShape(RoundedRectangle(cornerRadius: 18))
                    .overlay(
                        RoundedRectangle(cornerRadius: 18)
                            .stroke(Color.accentPrimary.opacity(0.1), lineWidth: 1)
                    )
                }
                .buttonStyle(.plain)

                TrendingRobloxStrip(category: "Featured", title: "🔥 Trending Assets · Featured", limit: 10)

                TrendingRobloxGamesStrip(title: "🎮 Top Games This Week", limit: 20)

                feedTabPicker

                if !store.featuredPosts.isEmpty {
                    FeaturedBannerStrip(posts: store.featuredPosts)
                }

                ForEach(HomeFeedSection.allCases) { section in
                    let posts = store.sectionPosts[section] ?? []
                    let loading = store.sectionLoadingStates[section] ?? false
                    if loading {
                        FeedSectionPlaceholder(title: section.rawValue)
                    } else if !posts.isEmpty {
                        FeedSection(title: section.rawValue, posts: posts, onRemix: { remixTarget = $0 })
                    }
                }

                if let error = store.errorMessage {
                    Text(error)
                        .font(.appCaption)
                        .foregroundColor(.accentSecondary)
                        .padding(.top, 4)
                }

                if !appState.projectSummaries.isEmpty {
                    ResumeProjectsSection(projects: appState.projectSummaries) { project in
                        appState.resumeProject(project)
                    }
                }

                if !favoriteItems.isEmpty {
                    FavoritesSection(items: allContentItems)
                }

                if !visibleSectionOrder.isEmpty {
                    VStack(alignment: .leading, spacing: 6) {
                        sectionHeader("BROWSE")
                            .padding(.top, 8)
                    }
                }

                ForEach(visibleSectionOrder, id: \.self) { name in
                    if let items = dropboxSections[name], !items.isEmpty {
                        HomeSection(title: name, items: items)
                    }
                }

                if isLoadingDropbox && !hasFinishedDropboxLoad {
                    ProgressView("Loading content...")
                        .foregroundColor(.textSecondary)
                        .padding(.top, 8)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .padding(.bottom, LayoutMetrics.floatingTabBarClearance)
        }
        .refreshable { await store.refresh() }
        .background(
            LinearGradient(colors: [.gradientTop, .gradientBottom], startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()
        )
        .navigationTitle(AppBrand.name)
        .navigationBarTitleDisplayMode(.inline)
        .task { await hydrateAndRefreshDropboxContent() }
        .task(id: store.selectedTab) { await store.loadIfNeeded() }
        .task { await loadActiveChallenge() }
        .dismissKeyboardOnTap()
        .fullScreenCover(item: $remixTarget) { post in
            NavigationStack {
                ChatView(
                    projectKind: .clone,
                    preferredFlow: .smartInterview,
                    entryMode: .text,
                    welcomeContext: "'\(post.title)' by \(post.authorName)" + (post.description.isEmpty ? "" : " — \(post.description.prefix(240))"),
                    title: "Remix: \(post.title)"
                )
            }
        }
    }

    // MARK: - Tab Picker

    private var feedTabPicker: some View {
        Picker("Feed", selection: $store.selectedTab) {
            ForEach(HomeFeedTab.allCases) { tab in
                Text(tab.rawValue).tag(tab)
            }
        }
        .pickerStyle(.segmented)
        .padding(.vertical, 4)
    }

    // MARK: - Dropbox hydration (kept from original)

    private func hydrateAndRefreshDropboxContent() async {
        let cached = await DropboxService.shared.cachedSectionsSnapshot(includeStaleDisk: true)
        if !cached.isEmpty {
            dropboxSections = cached
            hasFinishedDropboxLoad = true
            await prefetchDropboxImages(from: cached)
        }
        await loadDropboxContent()
    }

    private func loadDropboxContent() async {
        isLoadingDropbox = true
        var result = await DropboxService.shared.loadAllSections()
        if result.values.reduce(0, { $0 + $1.count }) == 0 {
            result = await DropboxService.shared.loadAllSections(forceRefresh: true)
        }
        dropboxSections = result
        await prefetchDropboxImages(from: result)
        isLoadingDropbox = false
        hasFinishedDropboxLoad = true
    }

    private func prefetchDropboxImages(from sections: [String: [ContentItem]]) async {
        let orderedItems = preferredSectionOrder.flatMap { sections[$0] ?? [] }
        await ImageCacheManager.shared.prefetch(
            orderedItems.map(\.imageUrl),
            maxCount: 6
        )
    }

    private func loadActiveChallenge() async {
        do {
            let all = try await AIWorkspaceAPI.fetchChallenges()
            activeChallenge = all.first(where: { $0.isActive || $0.isVoting })
        } catch {}
    }
}

// MARK: - Featured Banner Strip

private struct FeaturedBannerStrip: View {
    let posts: [AIWorkspaceAPI.SocialPost]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionHeader("FEATURED")

            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(spacing: 14) {
                    ForEach(posts) { post in
                        NavigationLink(destination: CommunityPostDetailView(post: post, onRefresh: {})) {
                            FeaturedBannerCard(post: post)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }
}

private struct FeaturedBannerCard: View {
    let post: AIWorkspaceAPI.SocialPost
    @State private var image: UIImage?

    init(post: AIWorkspaceAPI.SocialPost) {
        self.post = post
        if let urlString = post.previewUrls.first {
            _image = State(initialValue: ImageCacheManager.cachedImage(for: urlString))
        }
    }

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            RoundedRectangle(cornerRadius: 20)
                .fill(Color.cardBackground)
                .frame(width: 280, height: 160)

            if let img = image {
                Image(uiImage: img)
                    .resizable()
                    .scaledToFill()
                    .frame(width: 280, height: 160)
                    .clipped()
                    .clipShape(RoundedRectangle(cornerRadius: 20))
            } else {
                ZStack {
                    LinearGradient(
                        colors: [Color.accentPrimary.opacity(0.18), Color.accentPrimary.opacity(0.05)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                    Image(systemName: iconForPost(category: post.category, projectKind: post.projectKind))
                        .font(.system(size: 38))
                        .foregroundColor(.accentPrimary.opacity(0.25))
                }
                .frame(width: 280, height: 160)
                .clipShape(RoundedRectangle(cornerRadius: 20))
            }

            LinearGradient(
                colors: [.black.opacity(0.6), .clear],
                startPoint: .bottom,
                endPoint: .center
            )
            .clipShape(RoundedRectangle(cornerRadius: 20))

            VStack(alignment: .leading, spacing: 4) {
                Text(post.title)
                    .font(.system(size: 16, weight: .bold, design: .rounded))
                    .foregroundColor(.white)
                    .lineLimit(2)
                Text(post.authorName)
                    .font(.system(size: 12, weight: .medium, design: .rounded))
                    .foregroundColor(.white.opacity(0.8))
            }
            .padding(14)
        }
        .frame(width: 280, height: 160)
        .clipShape(RoundedRectangle(cornerRadius: 20))
        .overlay(
            RoundedRectangle(cornerRadius: 20)
                .stroke(Color.accentPrimary.opacity(0.12), lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.08), radius: 8, y: 4)
        .task(id: post.id) {
            guard let url = post.previewUrls.first else { return }
            if image == nil {
                image = await ImageCacheManager.shared.image(for: url)
            }
        }
    }
}

// MARK: - Feed Section (horizontal scroll of social posts)

private struct FeedSection: View {
    let title: String
    let posts: [AIWorkspaceAPI.SocialPost]
    let onRemix: (AIWorkspaceAPI.SocialPost) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title.uppercased())
                .font(.system(size: 18, weight: .black, design: .rounded))
                .foregroundColor(.textPrimary)

            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(spacing: 12) {
                    ForEach(posts) { post in
                        ZStack(alignment: .topTrailing) {
                            NavigationLink(destination: CommunityPostDetailView(post: post, onRefresh: {})) {
                                FeedPostCard(post: post)
                            }
                            .buttonStyle(.plain)

                            Button {
                                onRemix(post)
                            } label: {
                                HStack(spacing: 4) {
                                    Image(systemName: "shuffle")
                                    Text("Remix")
                                }
                                .font(.system(size: 11, weight: .bold, design: .rounded))
                                .foregroundColor(.white)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 6)
                                .background(
                                    LinearGradient(colors: [.accentTeal, .brandElectricBlue], startPoint: .leading, endPoint: .trailing)
                                )
                                .clipShape(Capsule())
                                .shadow(color: .black.opacity(0.25), radius: 3, y: 1)
                            }
                            .buttonStyle(.plain)
                            .padding(8)
                        }
                    }
                }
            }
        }
    }
}

private struct FeedPostCard: View {
    let post: AIWorkspaceAPI.SocialPost
    @State private var image: UIImage?

    init(post: AIWorkspaceAPI.SocialPost) {
        self.post = post
        // Warm-start from in-memory cache so recycled LazyVStack cells render the image immediately
        // instead of flashing a placeholder until the async task fires.
        if let urlString = post.previewUrls.first {
            _image = State(initialValue: ImageCacheManager.cachedImage(for: urlString))
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ZStack {
                RoundedRectangle(cornerRadius: 14)
                    .fill(Color.cardBackground)
                    .frame(width: 160, height: 120)

                if let img = image {
                    Image(uiImage: img)
                        .resizable()
                        .scaledToFill()
                        .frame(width: 160, height: 120)
                        .clipped()
                } else {
                    ZStack {
                        LinearGradient(
                            colors: [Color.accentPrimary.opacity(0.15), Color.accentPrimary.opacity(0.04)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                        Image(systemName: iconForPost(category: post.category, projectKind: post.projectKind))
                            .font(.system(size: 30))
                            .foregroundColor(.accentPrimary.opacity(0.25))
                    }
                    .frame(width: 160, height: 120)
                }
            }
            .frame(width: 160, height: 120)
            .clipShape(RoundedRectangle(cornerRadius: 14))

            VStack(alignment: .leading, spacing: 3) {
                Text(post.title)
                    .font(.system(size: 13, weight: .semibold, design: .rounded))
                    .foregroundColor(.textPrimary)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)

                Text(post.authorName)
                    .font(.system(size: 11, weight: .medium, design: .rounded))
                    .foregroundColor(.textSecondary)
                    .lineLimit(1)

                HStack(spacing: 8) {
                    Label("\(post.likes)", systemImage: "heart.fill")
                    Label("\(post.downloadCount)", systemImage: "arrow.down.circle.fill")
                }
                .font(.system(size: 10, weight: .semibold, design: .rounded))
                .foregroundColor(.textTertiary)
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 8)
        }
        .frame(width: 160)
        .background(Color.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(Color.accentPrimary.opacity(0.12), lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.04), radius: 6, y: 3)
        .task(id: post.id) {
            guard let url = post.previewUrls.first else { return }
            if image == nil {
                image = await ImageCacheManager.shared.image(for: url)
            }
        }
    }
}

private struct FeedSectionPlaceholder: View {
    let title: String

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title.uppercased())
                .font(.system(size: 18, weight: .black, design: .rounded))
                .foregroundColor(.textPrimary)

            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(spacing: 12) {
                    ForEach(0..<3, id: \.self) { _ in
                        VStack(alignment: .leading, spacing: 8) {
                            RoundedRectangle(cornerRadius: 14)
                                .fill(Color.cardBackground)
                                .frame(width: 160, height: 120)
                            RoundedRectangle(cornerRadius: 6)
                                .fill(Color.cardBackground)
                                .frame(width: 120, height: 12)
                            RoundedRectangle(cornerRadius: 6)
                                .fill(Color.cardBackground)
                                .frame(width: 80, height: 10)
                        }
                        .redacted(reason: .placeholder)
                    }
                }
            }
        }
    }
}

// MARK: - Hero Card (kept from original)

private struct HomeHeroCard: View {
    let openCreate: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            BrandLockup(markSize: 34, showsSubtitle: false)

            Text("Game ideas, ready to build.")
                .font(.appLargeTitle)
                .foregroundColor(.textPrimary)

            Text("Turn prompts into games, NPCs, maps, scripts, and UGC-ready assets with a workspace that remembers your flow.")
                .font(.appBody)
                .foregroundColor(.textSecondary)

            Button(action: openCreate) {
                HStack {
                    Label("Open Kami Forge", systemImage: "sparkles")
                    Spacer()
                    Image(systemName: "arrow.right.circle.fill")
                }
                .font(.appHeadline)
                .foregroundColor(.black)
                .padding()
                .background(Color.accentPrimary)
                .clipShape(RoundedRectangle(cornerRadius: 16))
            }
            .buttonStyle(.plain)
        }
        .padding(22)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            LinearGradient(colors: [Color.white.opacity(0.98), Color.cardBackground], startPoint: .topLeading, endPoint: .bottomTrailing)
        )
        .clipShape(RoundedRectangle(cornerRadius: 28))
        .overlay(
            RoundedRectangle(cornerRadius: 28)
                .stroke(Color.accentPrimary.opacity(0.14), lineWidth: 1)
        )
    }
}

// MARK: - Resume Projects (kept from original)

private struct ResumeProjectsSection: View {
    let projects: [ProjectSummary]
    let onOpen: (ProjectSummary) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader("Resume")

            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(spacing: 12) {
                    ForEach(projects) { project in
                        Button {
                            onOpen(project)
                        } label: {
                            VStack(alignment: .leading, spacing: 12) {
                                Label(project.kind.rawValue, systemImage: project.kind.icon)
                                    .font(.appCaption)
                                    .foregroundColor(project.accentColor)
                                Text(project.title)
                                    .font(.appHeadline)
                                    .foregroundColor(.textPrimary)
                                    .multilineTextAlignment(.leading)
                                Text(project.subtitle)
                                    .font(.appCaption)
                                    .foregroundColor(.textSecondary)
                                    .multilineTextAlignment(.leading)
                                ProgressView(value: project.progress)
                                    .tint(project.accentColor)
                            }
                            .frame(width: 220, alignment: .leading)
                            .padding(18)
                            .background(Color.cardBackground)
                            .clipShape(RoundedRectangle(cornerRadius: 22))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }
}

private func sectionHeader(_ title: String) -> some View {
    Text(title.uppercased())
        .font(.system(size: 18, weight: .black, design: .rounded))
        .foregroundColor(.textPrimary)
}

// MARK: - Dropbox Home Section (horizontal scroll — kept from original)

private struct HomeSection: View {
    let title: String
    let items: [ContentItem]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(title.uppercased())
                    .font(.system(size: 18, weight: .black, design: .rounded))
                    .foregroundColor(.textPrimary)

                Spacer()

                NavigationLink(destination: SectionItemsView(title: title, items: items)) {
                    HStack(spacing: 6) {
                        Text("Open")
                            .font(.system(size: 13, weight: .semibold, design: .rounded))
                        Image(systemName: "arrow.right.circle.fill")
                            .font(.system(size: 14))
                    }
                    .foregroundColor(.accentPrimary)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .frame(minWidth: 44, minHeight: 44)
                    .background(Color.pillBackground)
                    .clipShape(Capsule())
                    .overlay(Capsule().stroke(Color.pillBorder, lineWidth: 1))
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }

            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(spacing: 12) {
                    ForEach(items) { item in
                        NavigationLink(destination: ContentDetailView(item: item)) {
                            ContentCardFromDropbox(item: item)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }
}

// MARK: - Content Card from Dropbox (kept from original)

private struct ContentCardFromDropbox: View {
    let item: ContentItem
    @State private var image: UIImage?

    init(item: ContentItem) {
        self.item = item
        _image = State(initialValue: ImageCacheManager.cachedImage(for: item.imageUrl))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ZStack {
                RoundedRectangle(cornerRadius: 12)
                    .fill(Color.cardBackground)
                    .frame(width: 120, height: 120)

                if let img = image {
                    Image(uiImage: img)
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                        .frame(width: 120, height: 120)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                } else {
                    ProgressView()
                }
            }
            .shadow(color: Color.accentPrimary.opacity(0.1), radius: 6, y: 3)

            Text(item.title)
                .font(.system(size: 12, weight: .medium, design: .rounded))
                .foregroundColor(.textSecondary)
                .lineLimit(1)
                .frame(width: 120)
        }
        .task(id: item.imageUrl) {
            guard image == nil else { return }
            image = await ImageCacheManager.shared.image(for: item.imageUrl)
        }
    }
}

// MARK: - Favorites Section (kept from original)

private struct FavoritesSection: View {
    @EnvironmentObject private var appState: AppState
    let items: [ContentItem]

    private var favoriteItems: [ContentItem] {
        items
            .filter { appState.isFavorite(contentID: $0.id) }
            .sorted { $0.title.localizedCaseInsensitiveCompare($1.title) == .orderedAscending }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("FAVORITES")
                    .font(.system(size: 18, weight: .black, design: .rounded))
                    .foregroundColor(.textPrimary)

                Spacer()

                NavigationLink(destination: FavoritesView(items: items)) {
                    HStack(spacing: 6) {
                        Text("Open")
                            .font(.system(size: 13, weight: .semibold, design: .rounded))
                        Image(systemName: "arrow.right.circle.fill")
                            .font(.system(size: 14))
                    }
                    .foregroundColor(.accentPrimary)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .frame(minWidth: 44, minHeight: 44)
                    .background(Color.pillBackground)
                    .clipShape(Capsule())
                    .overlay(Capsule().stroke(Color.pillBorder, lineWidth: 1))
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }

            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(spacing: 12) {
                    ForEach(favoriteItems) { item in
                        NavigationLink(destination: ContentDetailView(item: item)) {
                            ContentCardFromDropbox(item: item)
                        }
                        .buttonStyle(.plain)
                        .overlay(alignment: .topTrailing) {
                            FavoriteToggleBadge(contentID: item.id)
                                .offset(x: 4, y: -4)
                        }
                    }
                }
            }
        }
    }
}

// MARK: - Section Items Grid View (kept from original)

private struct SectionItemsView: View {
    let title: String
    let items: [ContentItem]
    @State private var searchText = ""

    private var trimmedQuery: String {
        searchText.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var filteredItems: [ContentItem] {
        let query = trimmedQuery
        guard !query.isEmpty else { return items }
        return items.filter {
            $0.title.localizedCaseInsensitiveContains(query) ||
            $0.subtitle.localizedCaseInsensitiveContains(query)
        }
    }

    var body: some View {
        GeometryReader { proxy in
            let horizontalPadding: CGFloat = 16
            let gridSpacing: CGFloat = 14
            let cardWidth = (proxy.size.width - (horizontalPadding * 2) - gridSpacing) / 2

            VStack(spacing: 0) {
                HStack(spacing: 10) {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundColor(.textSecondary)

                    TextField("Search \(title)", text: $searchText)
                        .font(.system(size: 17, weight: .medium, design: .rounded))
                        .foregroundColor(.textPrimary)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }
                .padding(.horizontal, 16)
                .frame(height: 52)
                .background(Color.white.opacity(0.34))
                .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                .padding(.horizontal, horizontalPadding)
                .padding(.top, 12)
                .padding(.bottom, 8)

                if filteredItems.isEmpty && !trimmedQuery.isEmpty {
                    SearchEmptyStateView(query: trimmedQuery)
                } else {
                    ScrollView {
                        LazyVGrid(
                            columns: [
                                GridItem(.fixed(cardWidth), spacing: gridSpacing),
                                GridItem(.fixed(cardWidth), spacing: gridSpacing)
                            ],
                            spacing: 18
                        ) {
                            ForEach(filteredItems) { item in
                                NavigationLink(destination: ContentDetailView(item: item)) {
                                    SectionGridCard(item: item, width: cardWidth)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.horizontal, horizontalPadding)
                        .padding(.top, 8)
                        .padding(.bottom, 20)
                    }
                }
            }
        }
        .background(
            LinearGradient(colors: [.gradientTop, .gradientBottom], startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()
        )
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .dismissKeyboardOnTap()
    }
}

// MARK: - Favorites Full View (kept from original)

private struct FavoritesView: View {
    @EnvironmentObject private var appState: AppState
    let items: [ContentItem]
    @State private var searchText = ""

    private var trimmedQuery: String {
        searchText.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var baseFavorites: [ContentItem] {
        items
            .filter { appState.isFavorite(contentID: $0.id) }
            .sorted { $0.title.localizedCaseInsensitiveCompare($1.title) == .orderedAscending }
    }

    private var favoriteItems: [ContentItem] {
        let query = trimmedQuery
        guard !query.isEmpty else { return baseFavorites }
        return baseFavorites.filter {
            $0.title.localizedCaseInsensitiveContains(query) ||
            $0.subtitle.localizedCaseInsensitiveContains(query) ||
            $0.section.localizedCaseInsensitiveContains(query)
        }
    }

    var body: some View {
        GeometryReader { proxy in
            let horizontalPadding: CGFloat = 16
            let gridSpacing: CGFloat = 14
            let cardWidth = (proxy.size.width - (horizontalPadding * 2) - gridSpacing) / 2

            VStack(spacing: 0) {
                HStack(spacing: 10) {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundColor(.textSecondary)

                    TextField("Search Favorites", text: $searchText)
                        .font(.system(size: 17, weight: .medium, design: .rounded))
                        .foregroundColor(.textPrimary)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }
                .padding(.horizontal, 16)
                .frame(height: 52)
                .background(Color.white.opacity(0.34))
                .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                .padding(.horizontal, horizontalPadding)
                .padding(.top, 12)
                .padding(.bottom, 8)

                if favoriteItems.isEmpty && !trimmedQuery.isEmpty {
                    SearchEmptyStateView(query: trimmedQuery)
                } else if favoriteItems.isEmpty {
                    VStack(spacing: 14) {
                        Image(systemName: "heart")
                            .font(.system(size: 38, weight: .light))
                            .foregroundColor(.accentPrimary)
                        Text("No favorites yet")
                            .font(.system(size: 24, weight: .black, design: .rounded))
                            .foregroundColor(.textPrimary)
                        Text("Open any content card and tap Add to Favorites to collect it here.")
                            .font(.system(size: 15, weight: .medium, design: .rounded))
                            .foregroundColor(.textSecondary)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 30)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .padding(.bottom, 50)
                } else {
                    HStack {
                        Text("\(favoriteItems.count) saved")
                            .font(.system(size: 13, weight: .semibold, design: .rounded))
                            .foregroundColor(.textSecondary)
                        Spacer()
                    }
                    .padding(.horizontal, horizontalPadding)
                    .padding(.bottom, 6)

                    ScrollView {
                        LazyVGrid(
                            columns: [
                                GridItem(.fixed(cardWidth), spacing: gridSpacing),
                                GridItem(.fixed(cardWidth), spacing: gridSpacing)
                            ],
                            spacing: 18
                        ) {
                            ForEach(favoriteItems) { item in
                                NavigationLink(destination: ContentDetailView(item: item)) {
                                    SectionGridCard(item: item, width: cardWidth)
                                }
                                .buttonStyle(.plain)
                                .overlay(alignment: .topTrailing) {
                                    FavoriteToggleBadge(contentID: item.id)
                                        .padding(8)
                                }
                            }
                        }
                        .padding(.horizontal, horizontalPadding)
                        .padding(.top, 8)
                        .padding(.bottom, 20)
                    }
                }
            }
        }
        .background(
            LinearGradient(colors: [.gradientTop, .gradientBottom], startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()
        )
        .navigationTitle("Favorites")
        .navigationBarTitleDisplayMode(.inline)
        .dismissKeyboardOnTap()
        .hideCustomTabBarOnPush()
    }
}

// MARK: - Favorite Toggle Badge (kept from original)

private struct FavoriteToggleBadge: View {
    @EnvironmentObject private var appState: AppState
    let contentID: String

    var body: some View {
        Button {
            appState.toggleFavorite(contentID: contentID)
        } label: {
            Image(systemName: appState.isFavorite(contentID: contentID) ? "heart.fill" : "heart")
                .font(.system(size: 13, weight: .bold))
                .foregroundColor(.accentPrimary)
                .frame(width: 28, height: 28)
                .background(Color.white.opacity(0.96))
                .clipShape(Circle())
                .overlay(
                    Circle()
                        .stroke(Color.accentPrimary.opacity(0.16), lineWidth: 1)
                )
                .shadow(color: Color.black.opacity(0.06), radius: 4, y: 2)
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Section Grid Card (kept from original)

private struct SectionGridCard: View {
    let item: ContentItem
    let width: CGFloat
    @State private var image: UIImage?

    init(item: ContentItem, width: CGFloat) {
        self.item = item
        self.width = width
        _image = State(initialValue: ImageCacheManager.cachedImage(for: item.imageUrl))
    }

    var body: some View {
        VStack(spacing: 0) {
            ZStack {
                RoundedRectangle(cornerRadius: 18)
                    .fill(Color.white.opacity(0.92))

                if let image {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFill()
                        .frame(width: width, height: 170)
                        .clipped()
                } else {
                    RoundedRectangle(cornerRadius: 18)
                        .fill(Color.white.opacity(0.8))
                        .overlay(ProgressView().tint(.accentPrimary))
                }
            }
            .frame(width: width, height: 170)

            VStack(alignment: .leading, spacing: 4) {
                Text(item.title)
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                    .foregroundColor(.textPrimary)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .frame(maxWidth: .infinity, minHeight: 58, alignment: .topLeading)
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(Color.white.opacity(0.96))
        }
        .frame(width: width, height: 238, alignment: .top)
        .frame(height: 238, alignment: .top)
        .background(Color.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 18))
        .overlay(
            RoundedRectangle(cornerRadius: 18)
                .stroke(Color.accentPrimary.opacity(0.14), lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.04), radius: 6, y: 3)
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .task(id: item.imageUrl) {
            image = await ImageCacheManager.shared.image(for: item.imageUrl)
        }
    }
}

// MARK: - Content Detail View (kept from original)

private struct ContentDetailView: View {
    @EnvironmentObject private var appState: AppState
    let item: ContentItem

    @State private var image: UIImage?
    @State private var statusMessage: String?
    @State private var savedToPhotos = false

    private var descriptionText: String {
        let kind = item.section.isEmpty ? item.subtitle : item.section
        return "\(item.title) is part of the \(kind) collection. Open it to explore this content, keep it in favorites, or download the preview asset for later."
    }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 18) {
                Color.clear
                    .frame(maxWidth: .infinity)
                    .frame(height: 260)
                    .overlay {
                        if let image {
                            Image(uiImage: image)
                                .resizable()
                                .scaledToFill()
                        } else {
                            ZStack {
                                RoundedRectangle(cornerRadius: 24)
                                    .fill(Color.white.opacity(0.9))
                                ProgressView()
                                    .tint(.accentPrimary)
                            }
                        }
                    }
                    .clipped()
                    .clipShape(RoundedRectangle(cornerRadius: 24))
                    .overlay(
                        RoundedRectangle(cornerRadius: 24)
                            .stroke(Color.accentPrimary.opacity(0.12), lineWidth: 1)
                    )

                VStack(alignment: .leading, spacing: 10) {
                    Text(item.title)
                        .font(.system(size: 28, weight: .black, design: .rounded))
                        .foregroundColor(.textPrimary)
                        .lineLimit(3)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)

                    Text(item.section.uppercased())
                        .font(.system(size: 12, weight: .bold, design: .rounded))
                        .foregroundColor(.accentPrimary)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(Color.pillBackground)
                        .clipShape(Capsule())

                    Text(descriptionText)
                        .font(.system(size: 15, weight: .medium, design: .rounded))
                        .foregroundColor(.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 12) {
                        saveToPhotosButton
                        favoriteButton
                    }

                    VStack(spacing: 12) {
                        saveToPhotosButton
                        favoriteButton
                    }
                }

                if let statusMessage {
                    Text(statusMessage)
                        .font(.system(size: 13, weight: .medium, design: .rounded))
                        .foregroundColor(.accentPrimary)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .padding(.bottom, 30)
        }
        .background(
            LinearGradient(colors: [.gradientTop, .gradientBottom], startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()
        )
        .navigationTitle(item.title)
        .navigationBarTitleDisplayMode(.inline)
        .task(id: item.imageUrl) {
            image = await ImageCacheManager.shared.image(for: item.imageUrl)
        }
        .hideCustomTabBarOnPush()
    }

    private func saveToPhotos() {
        guard let image else {
            statusMessage = "Image is still loading."
            return
        }

        ImageSaver.saveToPhotos(image) { success in
            statusMessage = success.message
            if case .success = success {
                // Immediate haptic + visual confirmation on the button itself.
                UINotificationFeedbackGenerator().notificationOccurred(.success)
                withAnimation(.easeInOut(duration: 0.2)) { savedToPhotos = true }
                Task {
                    try? await Task.sleep(for: .seconds(2))
                    await MainActor.run {
                        withAnimation(.easeInOut(duration: 0.2)) { savedToPhotos = false }
                    }
                }
            }
        }
    }

    private var saveToPhotosButton: some View {
        Button {
            saveToPhotos()
        } label: {
            HStack(spacing: 8) {
                Image(systemName: savedToPhotos ? "checkmark.circle.fill" : "photo.on.rectangle.angled")
                Text(savedToPhotos ? "Saved!" : "Save to Photos")
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .font(.system(size: 15, weight: .bold, design: .rounded))
            .foregroundColor(.white)
            .frame(maxWidth: .infinity, minHeight: 52)
            .background(savedToPhotos ? Color.green : Color.accentPrimary)
            .clipShape(RoundedRectangle(cornerRadius: 16))
        }
        .disabled(savedToPhotos)
    }

    private var favoriteButton: some View {
        Button {
            appState.toggleFavorite(contentID: item.id)
        } label: {
            HStack(spacing: 8) {
                Image(systemName: appState.isFavorite(contentID: item.id) ? "heart.fill" : "heart")
                Text(appState.isFavorite(contentID: item.id) ? "In Favorites" : "Add to Favorites")
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
            }
            .font(.system(size: 15, weight: .bold, design: .rounded))
            .foregroundColor(appState.isFavorite(contentID: item.id) ? .accentPrimary : .textPrimary)
            .frame(maxWidth: .infinity, minHeight: 52)
            .background(Color.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(Color.accentPrimary.opacity(0.18), lineWidth: 1)
            )
        }
    }

}

// MARK: - Search Empty State (shared by SectionItemsView / FavoritesView)

struct SearchEmptyStateView: View {
    let query: String

    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 38, weight: .light))
                .foregroundColor(.accentPrimary)
            Text("No Results")
                .font(.system(size: 24, weight: .black, design: .rounded))
                .foregroundColor(.textPrimary)
            Text("Nothing matches \"\(query)\". Try a different query.")
                .font(.system(size: 15, weight: .medium, design: .rounded))
                .foregroundColor(.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 30)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.bottom, 50)
    }
}
