import Foundation
import Combine

enum HomeFeedTab: String, CaseIterable, Identifiable {
    case games = "Games"
    case content = "Content"

    var id: String { rawValue }

    var projectKindFilter: String {
        switch self {
        case .games: return "game"
        case .content: return "content"
        }
    }
}

enum HomeFeedSection: String, CaseIterable, Identifiable {
    case trending = "Trending"
    case new = "New"
    case following = "Following"
    case recommended = "Recommended for you"

    var id: String { rawValue }

    var apiMode: String {
        switch self {
        case .trending: return "trending"
        case .new: return "new"
        case .following: return "following"
        case .recommended: return "recommended"
        }
    }
}

@MainActor
final class HomeStore: ObservableObject {
    @Published var selectedTab: HomeFeedTab = .games
    @Published var featuredPosts: [AIWorkspaceAPI.SocialPost] = []
    @Published var sectionPosts: [HomeFeedSection: [AIWorkspaceAPI.SocialPost]] = [:]
    @Published var isLoadingFeatured = false
    @Published var sectionLoadingStates: [HomeFeedSection: Bool] = [:]
    @Published var errorMessage: String?

    private var loadedTab: HomeFeedTab?

    var isAnySectionLoading: Bool {
        sectionLoadingStates.values.contains(true) || isLoadingFeatured
    }

    func loadIfNeeded() async {
        guard loadedTab != selectedTab else { return }
        await loadAll()
    }

    func loadAll() async {
        let tab = selectedTab
        loadedTab = tab
        errorMessage = nil

        await withTaskGroup(of: Void.self) { group in
            group.addTask { await self.loadFeatured(tab: tab) }
            for section in HomeFeedSection.allCases {
                group.addTask { await self.loadSection(section, tab: tab) }
            }
        }
    }

    func refresh() async {
        loadedTab = nil
        await loadAll()
    }

    private func loadFeatured(tab: HomeFeedTab) async {
        isLoadingFeatured = true
        defer { isLoadingFeatured = false }
        do {
            let response = try await AIWorkspaceAPI.fetchSocialFeed(
                mode: "trending",
                contentType: tab.projectKindFilter
            )
            guard selectedTab == tab else { return }
            featuredPosts = Array(response.posts.prefix(5))
            await ImageCacheManager.shared.prefetch(
                featuredPosts.compactMap { $0.previewUrls.first },
                maxCount: 3
            )
        } catch {
            featuredPosts = []
        }
    }

    private func loadSection(_ section: HomeFeedSection, tab: HomeFeedTab) async {
        sectionLoadingStates[section] = true
        defer { sectionLoadingStates[section] = false }
        do {
            let response = try await AIWorkspaceAPI.fetchSocialFeed(
                mode: section.apiMode,
                contentType: tab.projectKindFilter
            )
            guard selectedTab == tab else { return }
            sectionPosts[section] = response.posts
            await ImageCacheManager.shared.prefetch(
                response.posts.compactMap { $0.previewUrls.first },
                maxCount: 4
            )
        } catch {
            if sectionPosts[section] == nil {
                sectionPosts[section] = []
            }
            if errorMessage == nil {
                errorMessage = "Could not load feed. Check your connection."
            }
        }
    }
}
