//
//  TrendingRobloxGamesStrip.swift
//  AIGoldRoblox
//
//  Master Plan Phase B (session 226): top trending Roblox games — horizontal-scroll
//  strip used in Home tab. Source: /api/roblox/trending-games (Rolimons-backed).
//

import SwiftUI
import UIKit

struct TrendingRobloxGamesStrip: View {
    let title: String
    let limit: Int

    @State private var games: [AIWorkspaceAPI.RobloxTrendingGame] = []
    @State private var isLoading = false
    @State private var errorText: String?
    @State private var lastRefresh: Date?

    init(title: String = "🎮 Top Games This Week", limit: Int = 20) {
        self.title = title
        self.limit = limit
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(title.uppercased())
                    .font(.system(size: 14, weight: .black, design: .rounded))
                    .foregroundColor(.textPrimary)
                Spacer()
                if isLoading {
                    ProgressView().scaleEffect(0.7)
                } else {
                    Button {
                        Task { await refresh(force: true) }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundColor(.accentPrimary)
                    }
                    .buttonStyle(.plain)
                }
            }

            if let errorText, games.isEmpty {
                Text(errorText)
                    .font(.appCaption)
                    .foregroundColor(.textSecondary)
                    .padding(.vertical, 8)
            }

            if !games.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    LazyHStack(spacing: 12) {
                        ForEach(games) { game in
                            Button {
                                openInRoblox(game: game)
                            } label: {
                                TrendingGameCard(game: game)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            } else if !isLoading && errorText == nil {
                ScrollView(.horizontal, showsIndicators: false) {
                    LazyHStack(spacing: 12) {
                        ForEach(0..<5, id: \.self) { _ in
                            TrendingGamePlaceholderCard()
                        }
                    }
                }
            }
        }
        .task { await refresh(force: false) }
    }

    private func refresh(force: Bool) async {
        if isLoading { return }
        if !force, let last = lastRefresh, Date().timeIntervalSince(last) < 60, !games.isEmpty {
            return
        }
        isLoading = true
        defer { isLoading = false }
        do {
            let resp = try await AIWorkspaceAPI.fetchRobloxTrendingGames(limit: limit)
            games = resp.games
            errorText = nil
            lastRefresh = Date()
        } catch {
            if games.isEmpty {
                errorText = "Trending games unavailable. Pull to retry."
            }
        }
    }

    private func openInRoblox(game: AIWorkspaceAPI.RobloxTrendingGame) {
        guard let url = URL(string: game.gameUrl) else { return }
        UIApplication.shared.open(url)
    }
}

// MARK: - Card

private struct TrendingGameCard: View {
    let game: AIWorkspaceAPI.RobloxTrendingGame
    @State private var image: UIImage?

    init(game: AIWorkspaceAPI.RobloxTrendingGame) {
        self.game = game
        if let urlString = game.iconUrl {
            _image = State(initialValue: ImageCacheManager.cachedImage(for: urlString))
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ZStack {
                RoundedRectangle(cornerRadius: 14)
                    .fill(Color.cardBackground)
                if let img = image {
                    Image(uiImage: img)
                        .resizable()
                        .scaledToFill()
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                } else {
                    LinearGradient(
                        colors: [Color.accentOrange.opacity(0.18), Color.accentPrimary.opacity(0.05)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                    Image(systemName: "gamecontroller.fill")
                        .font(.system(size: 30))
                        .foregroundColor(.accentOrange.opacity(0.45))
                }
            }
            .frame(width: 150, height: 150)
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .stroke(Color.accentPrimary.opacity(0.12), lineWidth: 1)
            )

            Text(game.name)
                .font(.system(size: 13, weight: .semibold, design: .rounded))
                .foregroundColor(.textPrimary)
                .lineLimit(1)
                .frame(maxWidth: 150, alignment: .leading)

            HStack(spacing: 6) {
                Image(systemName: "person.2.fill")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundColor(.accentOrange)
                Text(formatCount(game.activeUsers))
                    .font(.system(size: 11, weight: .medium, design: .rounded))
                    .foregroundColor(.textSecondary)
                Text("playing")
                    .font(.system(size: 11, weight: .medium, design: .rounded))
                    .foregroundColor(.textTertiary)
                Spacer(minLength: 0)
            }
            .frame(maxWidth: 150)
        }
        .frame(width: 150)
        .task(id: game.placeId) {
            guard let url = game.iconUrl, image == nil else { return }
            image = await ImageCacheManager.shared.image(for: url)
        }
    }

    private func formatCount(_ count: Int) -> String {
        if count >= 1_000_000 { return String(format: "%.1fM", Double(count) / 1_000_000) }
        if count >= 1_000     { return String(format: "%.1fK", Double(count) / 1_000) }
        return "\(count)"
    }
}

private struct TrendingGamePlaceholderCard: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            RoundedRectangle(cornerRadius: 14)
                .fill(Color.cardBackground)
                .frame(width: 150, height: 150)
                .overlay(
                    RoundedRectangle(cornerRadius: 14)
                        .stroke(Color.accentPrimary.opacity(0.08), lineWidth: 1)
                )
            RoundedRectangle(cornerRadius: 4)
                .fill(Color.cardBackground)
                .frame(width: 110, height: 12)
            RoundedRectangle(cornerRadius: 4)
                .fill(Color.cardBackground)
                .frame(width: 70, height: 10)
        }
        .frame(width: 150)
        .redacted(reason: .placeholder)
    }
}
