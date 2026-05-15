//
//  TrendingRobloxStrip.swift
//  AIGoldRoblox
//
//  Live Roblox catalog trends — horizontal-scroll strip used in Home & Catalog.
//  Source: /api/roblox/trending (sessions 211 + 216).
//

import SwiftUI
import UIKit

struct TrendingRobloxStrip: View {
    let category: String
    let title: String
    let limit: Int

    @State private var items: [AIWorkspaceAPI.RobloxCatalogItem] = []
    @State private var isLoading = false
    @State private var errorText: String?
    @State private var lastRefresh: Date?

    init(category: String = "Featured", title: String? = nil, limit: Int = 10) {
        self.category = category
        self.title = title ?? "🔥 Trending Assets · \(category)"
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

            if let errorText, items.isEmpty {
                Text(errorText)
                    .font(.appCaption)
                    .foregroundColor(.textSecondary)
                    .padding(.vertical, 8)
            }

            if !items.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    LazyHStack(spacing: 12) {
                        ForEach(items) { item in
                            Button {
                                openInRoblox(item: item)
                            } label: {
                                TrendingItemCard(item: item)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            } else if !isLoading && errorText == nil {
                ScrollView(.horizontal, showsIndicators: false) {
                    LazyHStack(spacing: 12) {
                        ForEach(0..<5, id: \.self) { _ in
                            TrendingPlaceholderCard()
                        }
                    }
                }
            }
        }
        .task { await refresh(force: false) }
    }

    private func refresh(force: Bool) async {
        if isLoading { return }
        if !force, let last = lastRefresh, Date().timeIntervalSince(last) < 60, !items.isEmpty {
            return
        }
        isLoading = true
        defer { isLoading = false }
        do {
            let resp = try await AIWorkspaceAPI.fetchRobloxTrending(category: category, limit: limit)
            items = resp.items
            await ImageCacheManager.shared.prefetch(
                resp.items.compactMap(\.thumbnailUrl),
                maxCount: 5,
                maxPixel: 420
            )
            errorText = nil
            lastRefresh = Date()
        } catch {
            // Keep previous items if any — only show error when nothing to display.
            if items.isEmpty {
                errorText = "Trending unavailable. Pull to retry."
            }
        }
    }

    private func openInRoblox(item: AIWorkspaceAPI.RobloxCatalogItem) {
        guard let url = URL(string: item.url) else { return }
        UIApplication.shared.open(url)
    }
}

// MARK: - Card

private struct TrendingItemCard: View {
    let item: AIWorkspaceAPI.RobloxCatalogItem
    @State private var image: UIImage?

    init(item: AIWorkspaceAPI.RobloxCatalogItem) {
        self.item = item
        if let urlString = item.thumbnailUrl {
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
                        colors: [Color.accentPrimary.opacity(0.18), Color.accentPrimary.opacity(0.05)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                    Image(systemName: item.itemType == "Bundle" ? "shippingbox.fill" : "sparkles")
                        .font(.system(size: 30))
                        .foregroundColor(.accentPrimary.opacity(0.45))
                }
            }
            .frame(width: 140, height: 140)
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .stroke(Color.accentPrimary.opacity(0.12), lineWidth: 1)
            )

            Text(item.name)
                .font(.system(size: 13, weight: .semibold, design: .rounded))
                .foregroundColor(.textPrimary)
                .lineLimit(1)
                .frame(maxWidth: 140, alignment: .leading)

            HStack(spacing: 6) {
                Image(systemName: "heart.fill")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundColor(.accentSecondary)
                Text(formatFav(item.favoriteCount))
                    .font(.system(size: 11, weight: .medium, design: .rounded))
                    .foregroundColor(.textSecondary)
                Spacer(minLength: 4)
                Text(priceLabel(item.price))
                    .font(.system(size: 11, weight: .semibold, design: .rounded))
                    .foregroundColor(item.price == nil || item.price == 0 ? .accentPrimary : .textSecondary)
            }
            .frame(maxWidth: 140)
        }
        .frame(width: 140)
        .task(id: item.id) {
            guard let url = item.thumbnailUrl, image == nil else { return }
            image = await ImageCacheManager.shared.image(for: url)
        }
    }

    private func priceLabel(_ price: Int?) -> String {
        guard let price = price, price > 0 else { return "Free" }
        return "\(price) R$"
    }

    private func formatFav(_ count: Int) -> String {
        if count >= 1_000_000 {
            return String(format: "%.1fM", Double(count) / 1_000_000)
        } else if count >= 1_000 {
            return String(format: "%.1fK", Double(count) / 1_000)
        }
        return "\(count)"
    }
}

private struct TrendingPlaceholderCard: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            RoundedRectangle(cornerRadius: 14)
                .fill(Color.cardBackground)
                .frame(width: 140, height: 140)
                .overlay(
                    RoundedRectangle(cornerRadius: 14)
                        .stroke(Color.accentPrimary.opacity(0.08), lineWidth: 1)
                )
            RoundedRectangle(cornerRadius: 4)
                .fill(Color.cardBackground)
                .frame(width: 100, height: 12)
            RoundedRectangle(cornerRadius: 4)
                .fill(Color.cardBackground)
                .frame(width: 60, height: 10)
        }
        .frame(width: 140)
        .redacted(reason: .placeholder)
    }
}
