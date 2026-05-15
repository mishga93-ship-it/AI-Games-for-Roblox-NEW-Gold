//
//  PostInteractionCache.swift
//  AIGoldRoblox
//
//  In-memory cache of the current user's like/save overrides for community posts.
//  Bridges the race condition between optimistic UI (detail view) and backend commit
//  (toggleLike/toggleSave POST): when the user likes a post, quickly dismisses the
//  detail sheet and immediately re-opens it, the GET /posts/:id can fire before the
//  POST write commits → server returns `likedByViewer=false` and the "Liked" button
//  resets. Applying this cache over the server response on reload keeps the UI
//  consistent with the user's last action. Also used as override for the
//  `SocialPostDetail(fromPost:)` fallback so stale feed cards don't leak through.
//

import Foundation

@MainActor
final class PostInteractionCache: ObservableObject {
    static let shared = PostInteractionCache()
    private init() {}

    // @Published so SwiftUI re-renders feed cards when user toggles like/save inside
    // the detail view — the feed card observer receives the objectWillChange signal
    // and re-computes its view body, applying the override via `apply(to:)`.
    @Published private var likedByViewer: [String: Bool] = [:]
    @Published private var savedByViewer: [String: Bool] = [:]
    // Bug 24: session-scoped comment count delta per post. Populated by
    // `submitComment` on the detail view; consumed by feed cards via `apply(to:)`
    // so the comment-bubble counter stays in sync without refetching the feed.
    @Published private var commentDeltas: [String: Int] = [:]

    func setLiked(postId: String, liked: Bool) {
        likedByViewer[postId] = liked
    }

    func setSaved(postId: String, saved: Bool) {
        savedByViewer[postId] = saved
    }

    func liked(postId: String) -> Bool? { likedByViewer[postId] }
    func saved(postId: String) -> Bool? { savedByViewer[postId] }

    /// Clears a specific entry — called when an optimistic mutation rolls back on API failure.
    func clearLiked(postId: String) {
        likedByViewer.removeValue(forKey: postId)
    }

    func clearSaved(postId: String) {
        savedByViewer.removeValue(forKey: postId)
    }

    // MARK: - Comment count deltas (Bug 24)

    /// Adjusts the cached comment-count delta for a post. Positive on new comment,
    /// negative on deletion (if/when an iOS delete UI lands). The delta is summed
    /// onto the server-provided `commentCount` inside `apply(to:)`.
    func bumpCommentCount(postId: String, delta: Int) {
        commentDeltas[postId] = (commentDeltas[postId] ?? 0) + delta
    }

    func commentDelta(postId: String) -> Int {
        commentDeltas[postId] ?? 0
    }

    /// Clears the comment-count delta for a post — to be called after a feed refresh
    /// returns an authoritative count that already includes the session's comments.
    func clearCommentDelta(postId: String) {
        commentDeltas.removeValue(forKey: postId)
    }

    /// Projects the cache overrides onto a post struct. If the cache disagrees with the
    /// server-provided `likedByViewer`/`savedByViewer`, we also adjust the counts by ±1
    /// so feed cards stay consistent until the feed is re-fetched. When the cache agrees
    /// with the server (e.g. after feed refresh following a commit), no count adjustment
    /// is needed — the server response already reflects the user's action.
    func apply(to post: AIWorkspaceAPI.SocialPost) -> AIWorkspaceAPI.SocialPost {
        var p = post
        if let cachedLiked = likedByViewer[post.id] {
            let serverLiked = post.likedByViewer == true
            if cachedLiked != serverLiked {
                p.likedByViewer = cachedLiked
                p.likes = max(0, p.likes + (cachedLiked ? 1 : -1))
            }
        }
        if let cachedSaved = savedByViewer[post.id] {
            p.savedByViewer = cachedSaved
        }
        // Bug 24: overlay comment-count delta (comments posted this session).
        let delta = commentDeltas[post.id] ?? 0
        if delta != 0 {
            p.commentCount = max(0, p.commentCount + delta)
        }
        return p
    }
}
