import SwiftUI

struct TopChartsView: View {
    @State private var selectedTab = "authors"
    @State private var selectedPeriod = "all"
    @State private var entries: [AIWorkspaceAPI.LeaderboardEntry] = []
    @State private var risingStars: [AIWorkspaceAPI.LeaderboardEntry] = []
    @State private var staffPicks: [AIWorkspaceAPI.SocialPost] = []
    @State private var isLoading = false
    @State private var errorText: String?

    private let tabs = [("authors", "Authors"), ("games", "Games"), ("content", "Content")]
    private let periods = [("all", "All Time"), ("month", "Month"), ("week", "Week"), ("day", "Today")]

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 20) {
                tabPicker
                periodPicker

                if !staffPicks.isEmpty {
                    staffPicksSection
                }

                if !risingStars.isEmpty && selectedTab == "authors" {
                    risingStarsSection
                }

                if isLoading {
                    ProgressView("Loading leaderboards...")
                        .tint(.accentPrimary)
                        .padding(.top, 40)
                } else if let errorText {
                    ContentUnavailableView(
                        "Leaderboards Unavailable",
                        systemImage: "chart.bar.xaxis",
                        description: Text(errorText)
                    )
                    .padding(24)
                    .frame(maxWidth: .infinity, minHeight: 240)
                } else if entries.isEmpty {
                    ContentUnavailableView(
                        "No Data Yet",
                        systemImage: "chart.bar.xaxis",
                        description: Text("Rankings will appear once there is community activity.")
                    )
                    .padding(24)
                    .frame(maxWidth: .infinity, minHeight: 240)
                } else {
                    leaderboardList
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .padding(.bottom, LayoutMetrics.floatingTabBarClearance)
        }
        .background(
            LinearGradient(colors: [.gradientTop, .gradientBottom], startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()
        )
        .navigationTitle("Top Charts")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadAll() }
        .onChange(of: selectedTab) { _, _ in Task { await loadLeaderboards() } }
        .onChange(of: selectedPeriod) { _, _ in Task { await loadLeaderboards() } }
    }

    // MARK: - Tab Picker

    private var tabPicker: some View {
        HStack(spacing: 0) {
            ForEach(tabs, id: \.0) { value, label in
                Button {
                    withAnimation(.easeInOut(duration: 0.2)) { selectedTab = value }
                } label: {
                    Text(label)
                        .font(.system(size: 14, weight: .bold, design: .rounded))
                        .foregroundColor(selectedTab == value ? .white : .textPrimary)
                        .frame(maxWidth: .infinity, minHeight: 40)
                        .background(selectedTab == value ? Color.accentPrimary : Color.clear)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(4)
        .background(Color.white.opacity(0.6))
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    // MARK: - Period Picker

    private var periodPicker: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            LazyHStack(spacing: 8) {
                ForEach(periods, id: \.0) { value, label in
                    Button {
                        withAnimation(.easeInOut(duration: 0.2)) { selectedPeriod = value }
                    } label: {
                        Text(label)
                            .font(.system(size: 13, weight: .semibold, design: .rounded))
                            .foregroundColor(selectedPeriod == value ? .white : .accentPrimary)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 10)
                            .background(selectedPeriod == value ? Color.accentPrimary : Color.pillBackground)
                            .clipShape(Capsule())
                            .overlay(
                                Capsule().stroke(
                                    selectedPeriod == value ? Color.clear : Color.pillBorder,
                                    lineWidth: 1
                                )
                            )
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    // MARK: - Leaderboard List

    private var leaderboardList: some View {
        VStack(spacing: 0) {
            ForEach(Array(entries.enumerated()), id: \.element.id) { index, entry in
                if selectedTab == "authors", let profile = entry.profile {
                    NavigationLink(destination: CreatorProfileView(profileId: profile.id, initialName: profile.displayName)) {
                        AuthorRankRow(rank: entry.rank, profile: profile, score: Int(entry.score))
                    }
                    .buttonStyle(.plain)
                } else if let post = entry.post {
                    NavigationLink(destination: CommunityPostDetailView(post: post, onRefresh: {})) {
                        ContentRankRow(rank: entry.rank, post: post, score: entry.score)
                    }
                    .buttonStyle(.plain)
                }
                if index < entries.count - 1 {
                    Divider()
                        .padding(.leading, 56)
                }
            }
        }
        .background(Color.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 20))
        .overlay(
            RoundedRectangle(cornerRadius: 20)
                .stroke(Color.accentPrimary.opacity(0.1), lineWidth: 1)
        )
    }

    // MARK: - Staff Picks Section

    private var staffPicksSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: "star.fill")
                    .foregroundColor(.accentOrange)
                Text("STAFF PICKS")
                    .font(.system(size: 16, weight: .black, design: .rounded))
                    .foregroundColor(.textPrimary)
            }

            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(spacing: 12) {
                    ForEach(staffPicks) { post in
                        NavigationLink(destination: CommunityPostDetailView(post: post, onRefresh: {})) {
                            StaffPickCard(post: post)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    // MARK: - Rising Stars Section

    private var risingStarsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: "sparkles")
                    .foregroundColor(.accentPink)
                Text("RISING STARS")
                    .font(.system(size: 16, weight: .black, design: .rounded))
                    .foregroundColor(.textPrimary)
            }

            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(spacing: 12) {
                    ForEach(risingStars) { entry in
                        if let profile = entry.profile {
                            NavigationLink(destination: CreatorProfileView(profileId: profile.id, initialName: profile.displayName)) {
                                RisingStarCard(profile: profile, rank: entry.rank)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
        }
    }

    // MARK: - Data Loading

    @MainActor
    private func loadAll() async {
        async let leaderboardTask: () = loadLeaderboards()
        async let staffTask: () = loadStaffPicks()
        _ = await (leaderboardTask, staffTask)
    }

    @MainActor
    private func loadLeaderboards() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let response = try await AIWorkspaceAPI.fetchLeaderboards(
                type: selectedTab,
                period: selectedPeriod
            )
            entries = response.entries ?? []
            risingStars = response.risingStars ?? []
            await ImageCacheManager.shared.prefetch(
                entries.compactMap { $0.post?.previewUrls.first },
                maxCount: 5
            )
            errorText = nil
        } catch {
            errorText = "Could not load leaderboards. Check your connection."
        }
    }

    @MainActor
    private func loadStaffPicks() async {
        do {
            let response = try await AIWorkspaceAPI.fetchStaffPicks(limit: 10)
            staffPicks = response.posts
            await ImageCacheManager.shared.prefetch(
                staffPicks.compactMap { $0.previewUrls.first },
                maxCount: 5
            )
        } catch {
            staffPicks = []
        }
    }
}

// MARK: - Author Rank Row

private struct AuthorRankRow: View {
    let rank: Int
    let profile: AIWorkspaceAPI.SocialProfile
    let score: Int

    private var rankColor: Color {
        switch rank {
        case 1: return .accentOrange
        case 2: return Color(red: 0.75, green: 0.75, blue: 0.78)
        case 3: return Color(red: 0.8, green: 0.5, blue: 0.2)
        default: return .textSecondary
        }
    }

    var body: some View {
        HStack(spacing: 14) {
            Text("\(rank)")
                .font(.system(size: rank <= 3 ? 22 : 17, weight: .black, design: .rounded))
                .foregroundColor(rankColor)
                .frame(width: 36, alignment: .center)

            AvatarView(url: profile.avatarUrl, name: profile.displayName, size: 44)

            VStack(alignment: .leading, spacing: 3) {
                Text(profile.displayName)
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                    .foregroundColor(.textPrimary)
                    .lineLimit(1)

                HStack(spacing: 10) {
                    Label("\(profile.totalLikes)", systemImage: "heart.fill")
                    Label("\(profile.totalDownloads)", systemImage: "arrow.down.circle.fill")
                    Label("\(profile.followerCount)", systemImage: "person.2.fill")
                }
                .font(.system(size: 11, weight: .medium, design: .rounded))
                .foregroundColor(.textSecondary)
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 2) {
                Text("\(score)")
                    .font(.system(size: 16, weight: .bold, design: .rounded))
                    .foregroundColor(.accentPrimary)
                Text("pts")
                    .font(.system(size: 10, weight: .medium, design: .rounded))
                    .foregroundColor(.textTertiary)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }
}

// MARK: - Content Rank Row

private struct ContentRankRow: View {
    let rank: Int
    let post: AIWorkspaceAPI.SocialPost
    let score: Double

    @State private var image: UIImage?

    init(rank: Int, post: AIWorkspaceAPI.SocialPost, score: Double) {
        self.rank = rank
        self.post = post
        self.score = score
        if let urlString = post.previewUrls.first {
            _image = State(initialValue: ImageCacheManager.cachedImage(for: urlString))
        }
    }

    private var rankColor: Color {
        switch rank {
        case 1: return .accentOrange
        case 2: return Color(red: 0.75, green: 0.75, blue: 0.78)
        case 3: return Color(red: 0.8, green: 0.5, blue: 0.2)
        default: return .textSecondary
        }
    }

    var body: some View {
        HStack(spacing: 14) {
            Text("\(rank)")
                .font(.system(size: rank <= 3 ? 22 : 17, weight: .black, design: .rounded))
                .foregroundColor(rankColor)
                .frame(width: 36, alignment: .center)

            ZStack {
                RoundedRectangle(cornerRadius: 10)
                    .fill(Color.accentPrimary.opacity(0.1))
                if let img = image {
                    Image(uiImage: img)
                        .resizable()
                        .scaledToFill()
                        .frame(width: 50, height: 50)
                        .clipped()
                } else {
                    Image(systemName: post.projectKind == "game" || post.projectKind == "clone" ? "gamecontroller.fill" : "cube.fill")
                        .font(.system(size: 20))
                        .foregroundColor(.accentPrimary)
                }
            }
            .frame(width: 50, height: 50)
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .task(id: post.id) {
                guard let urlStr = post.previewUrls.first else { return }
                if image == nil {
                    image = await ImageCacheManager.shared.image(for: urlStr)
                }
            }

            VStack(alignment: .leading, spacing: 3) {
                Text(post.title)
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                    .foregroundColor(.textPrimary)
                    .lineLimit(1)

                Text("by \(post.authorName)")
                    .font(.system(size: 12, weight: .medium, design: .rounded))
                    .foregroundColor(.textSecondary)
                    .lineLimit(1)

                HStack(spacing: 10) {
                    Label("\(post.likes)", systemImage: "heart.fill")
                    Label("\(post.downloadCount)", systemImage: "arrow.down.circle.fill")
                    Label("\(post.commentCount)", systemImage: "bubble.left.fill")
                }
                .font(.system(size: 11, weight: .medium, design: .rounded))
                .foregroundColor(.textSecondary)
            }

            Spacer()

            Text(String(format: "%.0f", score))
                .font(.system(size: 14, weight: .bold, design: .rounded))
                .foregroundColor(.accentPrimary)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }
}

// MARK: - Staff Pick Card

private struct StaffPickCard: View {
    let post: AIWorkspaceAPI.SocialPost

    @State private var image: UIImage?

    init(post: AIWorkspaceAPI.SocialPost) {
        self.post = post
        if let urlString = post.previewUrls.first {
            _image = State(initialValue: ImageCacheManager.cachedImage(for: urlString))
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ZStack {
                if let img = image {
                    Image(uiImage: img)
                        .resizable()
                        .scaledToFill()
                        .frame(width: 180, height: 100)
                        .clipped()
                } else {
                    LinearGradient(
                        colors: [Color.accentOrange.opacity(0.15), Color.accentPrimary.opacity(0.1)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                    VStack(spacing: 6) {
                        Image(systemName: "star.fill")
                            .font(.system(size: 24))
                            .foregroundColor(.accentOrange)
                        Text(post.projectKind.capitalized)
                            .font(.system(size: 11, weight: .bold, design: .rounded))
                            .foregroundColor(.accentPrimary)
                    }
                }
            }
            .frame(width: 180, height: 100)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .task(id: post.id) {
                guard let urlStr = post.previewUrls.first else { return }
                if image == nil {
                    image = await ImageCacheManager.shared.image(for: urlStr)
                }
            }

            Text(post.title)
                .font(.system(size: 14, weight: .semibold, design: .rounded))
                .foregroundColor(.textPrimary)
                .lineLimit(2)
                .frame(width: 180, alignment: .leading)

            Text("by \(post.authorName)")
                .font(.system(size: 11, weight: .medium, design: .rounded))
                .foregroundColor(.textSecondary)
                .lineLimit(1)

            HStack(spacing: 8) {
                Label("\(post.likes)", systemImage: "heart.fill")
                Label("\(post.downloadCount)", systemImage: "arrow.down")
            }
            .font(.system(size: 11, weight: .medium, design: .rounded))
            .foregroundColor(.accentPrimary)
        }
        .padding(14)
        .frame(width: 208)
        .background(Color.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 18))
        .overlay(
            RoundedRectangle(cornerRadius: 18)
                .stroke(Color.accentOrange.opacity(0.2), lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.04), radius: 6, y: 3)
    }
}

// MARK: - Rising Star Card

private struct RisingStarCard: View {
    let profile: AIWorkspaceAPI.SocialProfile
    let rank: Int

    var body: some View {
        VStack(spacing: 10) {
            ZStack(alignment: .topTrailing) {
                AvatarView(url: profile.avatarUrl, name: profile.displayName, size: 64)

                Text("#\(rank)")
                    .font(.system(size: 10, weight: .black, design: .rounded))
                    .foregroundColor(.white)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Color.accentPink)
                    .clipShape(Capsule())
                    .offset(x: 4, y: -4)
            }

            Text(profile.displayName)
                .font(.system(size: 13, weight: .semibold, design: .rounded))
                .foregroundColor(.textPrimary)
                .lineLimit(1)

            HStack(spacing: 4) {
                Image(systemName: "sparkles")
                    .font(.system(size: 10))
                Text("New Creator")
                    .font(.system(size: 10, weight: .medium, design: .rounded))
            }
            .foregroundColor(.accentPink)
        }
        .frame(width: 100)
        .padding(.vertical, 14)
        .padding(.horizontal, 8)
        .background(Color.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 18))
        .overlay(
            RoundedRectangle(cornerRadius: 18)
                .stroke(Color.accentPink.opacity(0.15), lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.03), radius: 4, y: 2)
    }
}
