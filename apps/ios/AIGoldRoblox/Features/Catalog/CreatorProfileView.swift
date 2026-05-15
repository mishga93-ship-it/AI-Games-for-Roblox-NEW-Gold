import SwiftUI

struct CreatorProfileView: View {
    let profileId: String
    var initialName: String = "Creator"

    @State private var profile: AIWorkspaceAPI.SocialProfile?
    @State private var posts: [AIWorkspaceAPI.SocialPost] = []
    @State private var isLoading = true
    @State private var isFollowing = false
    @State private var followerCount = 0
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 20) {
                if isLoading {
                    ProgressView("Loading profile...")
                        .tint(.accentPrimary)
                        .padding(.top, 60)
                } else if let profile {
                    profileHeader(profile)
                    statsRow(profile)
                    if !posts.isEmpty {
                        postsSection
                    } else {
                        ContentUnavailableView(
                            "No Posts Yet",
                            systemImage: "square.grid.2x2",
                            description: Text("This creator hasn't published anything yet.")
                        )
                        .padding(.top, 20)
                    }
                } else {
                    ContentUnavailableView(
                        "Profile Not Found",
                        systemImage: "person.crop.circle.badge.exclamationmark",
                        description: Text("Could not load this profile.")
                    )
                    .padding(.top, 60)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .padding(.bottom, LayoutMetrics.floatingTabBarClearance)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(
            LinearGradient(colors: [.gradientTop, .gradientBottom], startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()
        )
        .navigationTitle(profile?.displayName ?? initialName)
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadProfile() }
    }

    // MARK: - Header

    private func profileHeader(_ profile: AIWorkspaceAPI.SocialProfile) -> some View {
        VStack(spacing: 14) {
            AvatarView(url: profile.avatarUrl, name: profile.displayName, size: 80)

            VStack(spacing: 4) {
                Text(profile.displayName)
                    .font(.system(size: 22, weight: .bold, design: .rounded))
                    .foregroundColor(.textPrimary)

                if let headline = profile.headline, !headline.isEmpty {
                    Text(headline)
                        .font(.system(size: 14, weight: .medium, design: .rounded))
                        .foregroundColor(.accentPrimary)
                }

                if let roblox = profile.robloxUsername, !roblox.isEmpty {
                    HStack(spacing: 4) {
                        Image(systemName: "gamecontroller.fill")
                            .font(.system(size: 11))
                        Text(roblox)
                            .font(.system(size: 12, weight: .semibold, design: .rounded))
                    }
                    .foregroundColor(.textSecondary)
                }
            }

            if let bio = profile.bio, !bio.isEmpty {
                Text(bio)
                    .font(.system(size: 13, weight: .regular, design: .rounded))
                    .foregroundColor(.textPrimary.opacity(0.85))
                    .multilineTextAlignment(.center)
                    .lineLimit(3)
                    .padding(.horizontal, 16)
            }

            Button {
                Task { await toggleFollow() }
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: isFollowing ? "checkmark" : "plus")
                        .font(.system(size: 12, weight: .bold))
                    Text(isFollowing ? "Following" : "Follow")
                        .font(.system(size: 14, weight: .bold, design: .rounded))
                }
                .foregroundColor(isFollowing ? .accentPrimary : .white)
                .padding(.horizontal, 24)
                .padding(.vertical, 10)
                .background(isFollowing ? Color.accentPrimary.opacity(0.15) : Color.accentPrimary)
                .clipShape(Capsule())
            }
            .buttonStyle(.plain)
        }
        .padding(.vertical, 16)
        .frame(maxWidth: .infinity)
        .background(Color.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 20))
        .overlay(
            RoundedRectangle(cornerRadius: 20)
                .stroke(Color.accentPrimary.opacity(0.1), lineWidth: 1)
        )
    }

    // MARK: - Stats

    private func statsRow(_ profile: AIWorkspaceAPI.SocialProfile) -> some View {
        HStack(spacing: 0) {
            NavigationLink {
                FollowListView(profileId: profileId, kind: .followers, initialTitle: "Followers")
            } label: {
                statItem(value: followerCount, label: "Followers")
            }
            .buttonStyle(.plain)

            NavigationLink {
                FollowListView(profileId: profileId, kind: .following, initialTitle: "Following")
            } label: {
                statItem(value: profile.followingCount, label: "Following")
            }
            .buttonStyle(.plain)

            statItem(value: profile.publishedProjectCount, label: "Published")
            statItem(value: profile.totalLikes, label: "Likes")
            statItem(value: profile.totalDownloads, label: "Downloads")
        }
        .padding(.vertical, 14)
        .background(Color.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(Color.accentPrimary.opacity(0.1), lineWidth: 1)
        )
    }

    private func statItem(value: Int, label: String) -> some View {
        VStack(spacing: 3) {
            Text("\(value)")
                .font(.system(size: 16, weight: .bold, design: .rounded))
                .foregroundColor(.accentPrimary)
            Text(label)
                .font(.system(size: 10, weight: .medium, design: .rounded))
                .foregroundColor(.textSecondary)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Posts

    private var postsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("PUBLISHED")
                .font(.system(size: 14, weight: .black, design: .rounded))
                .foregroundColor(.textSecondary)

            LazyVStack(spacing: 12) {
                ForEach(posts) { post in
                    NavigationLink(destination: CommunityPostDetailView(post: post, onRefresh: { await loadProfile() })) {
                        creatorPostCard(post)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func creatorPostCard(_ post: AIWorkspaceAPI.SocialPost) -> some View {
        HStack(spacing: 12) {
            // Thumbnail
            if let urlStr = post.previewUrls.first, let url = URL(string: urlStr) {
                PostThumbnailView(url: url)
                    .frame(width: 70, height: 70)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            } else {
                RoundedRectangle(cornerRadius: 12)
                    .fill(Color.accentPrimary.opacity(0.1))
                    .frame(width: 70, height: 70)
                    .overlay(
                        Image(systemName: "cube.fill")
                            .foregroundColor(.accentPrimary.opacity(0.3))
                    )
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(post.title)
                    .font(.system(size: 14, weight: .semibold, design: .rounded))
                    .foregroundColor(.textPrimary)
                    .lineLimit(2)

                Text(post.projectKind.capitalized)
                    .font(.system(size: 11, weight: .bold, design: .rounded))
                    .foregroundColor(.accentPrimary)

                HStack(spacing: 10) {
                    Label("\(post.likes)", systemImage: "heart.fill")
                    Label("\(post.downloadCount)", systemImage: "arrow.down.circle.fill")
                    Label("\(post.commentCount)", systemImage: "bubble.left.fill")
                }
                .font(.system(size: 11, weight: .medium, design: .rounded))
                .foregroundColor(.textSecondary)
            }

            Spacer()

            Image(systemName: "chevron.right")
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(.textTertiary)
        }
        .padding(12)
        .background(Color.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(Color.accentPrimary.opacity(0.08), lineWidth: 1)
        )
    }

    // MARK: - Data

    @MainActor
    private func loadProfile() async {
        isLoading = true
        defer { isLoading = false }
        // Bug 17: restore follow state from local cache on view (re)appear.
        // Server does not return `isFollowing` in portfolio/profile responses,
        // so without this the button resets to "Follow" every time the user
        // navigates back to the profile. Cache is updated from server response
        // in `toggleFollow`, so it stays accurate within the app session.
        isFollowing = FollowStateCache.isFollowing(profileId: profileId)
        do {
            let portfolio = try await AIWorkspaceAPI.fetchPortfolio(profileId: profileId)
            profile = portfolio.profile
            posts = portfolio.publishedPosts
            followerCount = portfolio.profile.followerCount
        } catch {
            // Fallback: try profile only
            profile = try? await AIWorkspaceAPI.fetchRemoteProfile(profileId: profileId)
            followerCount = profile?.followerCount ?? 0
            // Try to load posts via feed
            if let feedResponse = try? await AIWorkspaceAPI.fetchSocialFeed(authorId: profileId) {
                posts = feedResponse.posts
            }
        }
    }

    @MainActor
    private func toggleFollow() async {
        do {
            let response = try await AIWorkspaceAPI.followProfile(profileId: profileId)
            isFollowing = response.following
            followerCount = response.followerCount
            FollowStateCache.setFollowing(response.following, profileId: profileId)
        } catch {}
    }
}

/// Local cache of the viewer's follow state per-profile. Backed by
/// UserDefaults — survives view recreation and app restart. Kept in sync
/// with server via the `followProfile` API response (server is source of
/// truth; cache just mirrors the last confirmed state).
///
/// NOTE: does not reflect changes made on other devices. For full
/// cross-device consistency, add `isFollowing` to the server portfolio
/// endpoint (requires `firebase deploy --only functions`).
private enum FollowStateCache {
    private static let keyPrefix = "follow.state."

    static func isFollowing(profileId: String) -> Bool {
        UserDefaults.standard.bool(forKey: keyPrefix + profileId)
    }

    static func setFollowing(_ value: Bool, profileId: String) {
        UserDefaults.standard.set(value, forKey: keyPrefix + profileId)
    }
}

// MARK: - Post Thumbnail

private struct PostThumbnailView: View {
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
                        .scaleEffect(0.7)
                }
            }
        }
        .task {
            image = await ImageCacheManager.shared.image(for: url.absoluteString)
        }
    }
}
