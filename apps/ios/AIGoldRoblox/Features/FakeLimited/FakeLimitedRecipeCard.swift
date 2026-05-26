// FakeLimitedRecipeCard.swift — Phase 1 (session 382) MVP component for
// rendering a "Fake Headless & Korblox" recipe inside a chat bubble.
//
// Standalone view + small API client. NOT wired into ChatStore yet — that
// wire-up is Phase 1.5 to avoid clashing with the parallel session that is
// editing ChatView.swift right now (see cursor/changelog-382.md preflight).
//
// Backend contract: POST /api/fake-limited/recipe   { kind, includePreview }

import Foundation
import SwiftUI

// MARK: - Model

struct FakeLimitedRecipeItem: Codable, Identifiable {
    var id: String { assetId }
    let assetId: String
    let name: String
    let pricedRobux: Int
    let category: String
    let role: String
    let notes: String
}

struct FakeLimitedRecipe: Codable {
    let kind: String
    let title: String
    let pitch: String
    let items: [FakeLimitedRecipeItem]
    let totalCostRobux: Int
    let savedRobux: Int
    let steps: [String]
    let previewImageUrl: String?
    let disclaimer: String
}

enum FakeLimitedKind: String, CaseIterable, Identifiable {
    case headless
    case korblox
    case combo

    var id: String { rawValue }
    var displayTitle: String {
        switch self {
        case .headless: return "Fake Headless"
        case .korblox: return "Fake Korblox"
        case .combo: return "Headless + Korblox"
        }
    }
}

// MARK: - API client

enum FakeLimitedAPIError: Error { case badResponse, decode }

struct FakeLimitedAPI {
    static let shared = FakeLimitedAPI()

    func fetchRecipe(kind: FakeLimitedKind, includePreview: Bool = true) async throws -> FakeLimitedRecipe {
        let url = APIClient.baseURL.appendingPathComponent("api/fake-limited/recipe")
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let body: [String: Any] = ["kind": kind.rawValue, "includePreview": includePreview]
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw FakeLimitedAPIError.badResponse
        }
        return try JSONDecoder().decode(FakeLimitedRecipe.self, from: data)
    }
}

// MARK: - View

struct FakeLimitedRecipeCard: View {
    let recipe: FakeLimitedRecipe
    var onApplyOutfitTapped: (() -> Void)? = nil
    var onExportRbxmTapped: (() -> Void)? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            header
            if let urlString = recipe.previewImageUrl, let url = URL(string: urlString) {
                AsyncImage(url: url) { image in
                    image.resizable().scaledToFit()
                } placeholder: {
                    ProgressView().frame(maxWidth: .infinity, minHeight: 180)
                }
                .frame(maxWidth: .infinity)
                .cornerRadius(12)
            }
            savingsBadge
            itemsList
            stepsList
            actionButtons
            disclaimerLabel
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: 16).fill(Color.black.opacity(0.85)))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.purple.opacity(0.4), lineWidth: 1))
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(recipe.title)
                .font(.title3.bold())
                .foregroundColor(.white)
            Text(recipe.pitch)
                .font(.subheadline)
                .foregroundColor(.white.opacity(0.85))
        }
    }

    private var savingsBadge: some View {
        HStack(spacing: 8) {
            badgePill(text: "Cost \(recipe.totalCostRobux) R$", color: .green)
            badgePill(text: "Saved \(recipe.savedRobux.formatted()) R$", color: .orange)
        }
    }

    private var itemsList: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Items")
                .font(.caption.bold())
                .foregroundColor(.white.opacity(0.7))
            ForEach(recipe.items) { item in
                HStack(alignment: .top, spacing: 8) {
                    Text(item.pricedRobux == 0 ? "FREE" : "\(item.pricedRobux) R$")
                        .font(.caption2.monospaced().bold())
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .background(item.pricedRobux == 0 ? Color.green.opacity(0.3) : Color.orange.opacity(0.3))
                        .cornerRadius(4)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(item.name).font(.footnote.bold()).foregroundColor(.white)
                        Text(item.notes).font(.caption2).foregroundColor(.white.opacity(0.6))
                    }
                    Spacer()
                }
            }
        }
    }

    private var stepsList: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Steps")
                .font(.caption.bold())
                .foregroundColor(.white.opacity(0.7))
            ForEach(Array(recipe.steps.enumerated()), id: \.offset) { _, step in
                Text("• \(step)").font(.caption).foregroundColor(.white.opacity(0.85))
            }
        }
    }

    private var actionButtons: some View {
        HStack(spacing: 8) {
            Button(action: { onApplyOutfitTapped?() }) {
                Label("Open in Roblox", systemImage: "arrow.up.right.square")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            Button(action: { onExportRbxmTapped?() }) {
                Label("Export .rbxm", systemImage: "square.and.arrow.down")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
        }
    }

    private var disclaimerLabel: some View {
        Text(recipe.disclaimer)
            .font(.caption2)
            .foregroundColor(.white.opacity(0.5))
    }

    private func badgePill(text: String, color: Color) -> some View {
        Text(text)
            .font(.caption.bold())
            .padding(.horizontal, 8).padding(.vertical, 4)
            .background(color.opacity(0.25))
            .foregroundColor(color)
            .cornerRadius(6)
    }
}
