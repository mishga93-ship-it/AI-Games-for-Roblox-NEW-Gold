//
//  FollowListView.swift
//  AIGoldRoblox
//
//  Followers / Following list screen. Used from own ProfileView and from
//  CreatorProfileView for public profiles. Backed by
//  GET /api/social/profiles/:id/followers|following with cursor pagination.
//

import SwiftUI

struct FollowListView: View {
    let profileId: String
    let kind: AIWorkspaceAPI.FollowListKind
    let initialTitle: String

    @State private var profiles: [AIWorkspaceAPI.FollowListProfile] = []
    @State private var nextCursor: String?
    @State private var isLoadingInitial = true
    @State private var isLoadingMore = false
    @State private var errorText: String?
    @State private var pendingFollowOps: Set<String> = []

    var body: some View {
        ScrollView(showsIndicators: false) {
            LazyVStack(alignment: .leading, spacing: 10) {
                if isLoadingInitial {
                    ProgressView("Loading…")
                        .tint(.accentPrimary)
                        .frame(maxWidth: .infinity, minHeight: 120)
                } else if let errorText {
                    Text(errorText)
                        .font(.appCaption)
                        .foregroundColor(.textSecondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(16)
                } else if profiles.isEmpty {
                    emptyStateCard
                } else {
                    ForEach(profiles) { profile in
                        NavigationLink {
                            CreatorProfileView(profileId: profile.id, initialName: profile.name)
                        } label: {
                            row(for: profile)
                        }
                        .buttonStyle(.plain)
                        .onAppear {
                            if profile.id == profiles.last?.id,
                               nextCursor != nil,
                               !isLoadingMore {
                                Task { await loadMore() }
                            }
                        }
                    }
                    if isLoadingMore {
                        ProgressView()
                            .tint(.accentPrimary)
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }
                }
            }
            .padding(16)
            .padding(.bottom, LayoutMetrics.floatingTabBarClearance)
        }
        .background(
            LinearGradient(colors: [.gradientTop, .gradientBottom], startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()
        )
        .navigationTitle(initialTitle)
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadInitial() }
    }

    // MARK: - Empty state

    private var emptyStateCard: some View {
        VStack(spacing: 14) {
            ZStack {
                Circle()
                    .fill(Color.accentPrimary.opacity(0.14))
                    .frame(width: 92, height: 92)
                Image(systemName: kind == .followers ? "person.2.fill" : "person.2.crop.square.stack.fill")
                    .font(.system(size: 38, weight: .semibold))
                    .foregroundColor(.accentPrimary)
            }

            VStack(spacing: 6) {
                Text(kind == .followers ? "No followers yet" : "Not following anyone yet")
                    .font(.system(size: 18, weight: .bold, design: .rounded))
                    .foregroundColor(.textPrimary)
                    .multilineTextAlignment(.center)
                Text(kind == .followers
                     ? "Share your profile and publish projects — new followers will appear here."
                     : "Discover creators in Community and tap Follow to see their work here.")
                    .font(.appCallout)
                    .foregroundColor(.textSecondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 12)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
        .padding(.horizontal, 20)
        .background(Color.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 20))
        .overlay(
            RoundedRectangle(cornerRadius: 20)
                .stroke(Color.accentPrimary.opacity(0.12), lineWidth: 1)
        )
    }

    // MARK: - Row

    @ViewBuilder
    private func row(for profile: AIWorkspaceAPI.FollowListProfile) -> some View {
        HStack(spacing: 12) {
            AvatarView(url: profile.avatarUrl, name: profile.name, size: 44)

            VStack(alignment: .leading, spacing: 3) {
                Text(profile.name)
                    .font(.appHeadline)
                    .foregroundColor(.textPrimary)
                    .lineLimit(1)
                if !profile.headline.isEmpty {
                    Text(profile.headline)
                        .font(.appCaption)
                        .foregroundColor(.textSecondary)
                        .lineLimit(1)
                }
            }

            Spacer(minLength: 8)

            followButton(for: profile)
        }
        .padding(12)
        .background(Color.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(Color.accentPrimary.opacity(0.1), lineWidth: 1)
        )
    }

    @ViewBuilder
    private func followButton(for profile: AIWorkspaceAPI.FollowListProfile) -> some View {
        let isPending = pendingFollowOps.contains(profile.id)
        Button {
            Task { await toggleFollow(profile) }
        } label: {
            Text(profile.isFollowedByViewer ? "Following" : "Follow")
                .font(.system(size: 13, weight: .bold, design: .rounded))
                .foregroundColor(profile.isFollowedByViewer ? .accentPrimary : .white)
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(profile.isFollowedByViewer
                            ? Color.accentPrimary.opacity(0.15)
                            : Color.accentPrimary)
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
        .disabled(isPending)
        .opacity(isPending ? 0.6 : 1.0)
    }

    // MARK: - Data

    private func loadInitial() async {
        guard profiles.isEmpty else { return }
        isLoadingInitial = true
        defer { isLoadingInitial = false }
        do {
            let response = try await AIWorkspaceAPI.fetchFollowList(
                profileId: profileId, kind: kind, cursor: nil
            )
            profiles = response.profiles
            nextCursor = response.nextCursor
            errorText = nil
        } catch {
            errorText = "Couldn't load the list. Check connection and try again."
        }
    }

    private func loadMore() async {
        guard let cursor = nextCursor, !isLoadingMore else { return }
        isLoadingMore = true
        defer { isLoadingMore = false }
        do {
            let response = try await AIWorkspaceAPI.fetchFollowList(
                profileId: profileId, kind: kind, cursor: cursor
            )
            profiles.append(contentsOf: response.profiles)
            nextCursor = response.nextCursor
        } catch {
            // soft-fail: do not clobber already-shown items, keep cursor so user can retry via scroll
        }
    }

    private func toggleFollow(_ profile: AIWorkspaceAPI.FollowListProfile) async {
        guard !pendingFollowOps.contains(profile.id) else { return }
        pendingFollowOps.insert(profile.id)
        defer { pendingFollowOps.remove(profile.id) }

        // Optimistic flip.
        let original = profile
        if let idx = profiles.firstIndex(where: { $0.id == profile.id }) {
            profiles[idx] = AIWorkspaceAPI.FollowListProfile(
                id: profile.id,
                name: profile.name,
                headline: profile.headline,
                avatarUrl: profile.avatarUrl,
                isFollowedByViewer: !profile.isFollowedByViewer
            )
        }

        do {
            let response = try await AIWorkspaceAPI.followProfile(profileId: profile.id)
            // Reconcile with server's authoritative state.
            if let idx = profiles.firstIndex(where: { $0.id == profile.id }) {
                profiles[idx] = AIWorkspaceAPI.FollowListProfile(
                    id: profile.id,
                    name: profile.name,
                    headline: profile.headline,
                    avatarUrl: profile.avatarUrl,
                    isFollowedByViewer: response.following
                )
            }
        } catch {
            // Revert on failure.
            if let idx = profiles.firstIndex(where: { $0.id == profile.id }) {
                profiles[idx] = original
            }
        }
    }
}
