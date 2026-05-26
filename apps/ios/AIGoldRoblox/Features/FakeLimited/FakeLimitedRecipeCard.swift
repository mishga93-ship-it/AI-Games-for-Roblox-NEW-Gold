// FakeLimitedRecipeCard.swift — SwiftUI card for the "Fake Headless & Korblox"
// AI Crafter (session 382, Variant 3).
//
// STATUS: ready to activate. File needs to be added to the Xcode project once.
//
// To activate (Variant 3 — full SwiftUI card render in-bubble):
//   1. In Xcode → Project Navigator → right-click on "Features" group →
//      "Add Files to AIGoldRoblox…".
//   2. Select the FakeLimited folder (whole folder, not individual file).
//      Make sure "Copy items if needed" is OFF (file is already in repo).
//      Make sure "Create groups" is selected (not "Create folder references").
//      Target: AIGoldRoblox ✓
//   3. Replace `#if false` below with `#if true` (or just remove the gate).
//   4. In ChatView.swift, find the `MessageBubble` body — replace the
//      `TechnicalText(message.content, …)` block with:
//        if message.role == .assistant, message.linkActions != nil,
//           let recipe = ChatStore.parseFakeLimitedRecipe(from: message) {
//            FakeLimitedRecipeCard(recipe: recipe)
//        } else {
//            TechnicalText(message.content, …)
//        }
//   5. Add a helper `static func parseFakeLimitedRecipe(from:)` to ChatStore
//      that reconstructs the recipe from the markdown text (or store the
//      recipe directly on the message via a new `fakeLimitedRecipe` field).
//
// Until then, Variants 1 and 2 (chip-based + native action buttons under
// markdown text) already deliver the core UX. Variant 3 is a polish step
// for visual hierarchy.

import Foundation
import SwiftUI

#if false  // Activate by adding Features/FakeLimited/ to the Xcode project (see header).

public struct FakeLimitedRecipeCard: View {
    let recipe: ChatStore.FakeLimitedRecipe
    var onApplyOutfitTapped: (() -> Void)? = nil
    var onExportRbxmTapped: (() -> Void)? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(recipe.title)
                    .font(.title3.bold())
                    .foregroundColor(.white)
                Text(recipe.pitch)
                    .font(.subheadline)
                    .foregroundColor(.white.opacity(0.85))
            }
            if let urlString = recipe.previewImageUrl, let url = URL(string: urlString) {
                AsyncImage(url: url) { image in
                    image.resizable().scaledToFit()
                } placeholder: {
                    ProgressView().frame(maxWidth: .infinity, minHeight: 180)
                }
                .frame(maxWidth: .infinity)
                .cornerRadius(12)
            }
            HStack(spacing: 8) {
                Text("Cost \(recipe.totalCostRobux) R$")
                    .font(.caption.bold())
                    .padding(.horizontal, 8).padding(.vertical, 4)
                    .background(Color.green.opacity(0.25))
                    .foregroundColor(.green)
                    .cornerRadius(6)
                Text("Saved \(recipe.savedRobux.formatted()) R$")
                    .font(.caption.bold())
                    .padding(.horizontal, 8).padding(.vertical, 4)
                    .background(Color.orange.opacity(0.25))
                    .foregroundColor(.orange)
                    .cornerRadius(6)
            }
            VStack(alignment: .leading, spacing: 6) {
                Text("Items").font(.caption.bold()).foregroundColor(.white.opacity(0.7))
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
            VStack(alignment: .leading, spacing: 4) {
                Text("Steps").font(.caption.bold()).foregroundColor(.white.opacity(0.7))
                ForEach(Array(recipe.steps.enumerated()), id: \.offset) { _, step in
                    Text("• \(step)").font(.caption).foregroundColor(.white.opacity(0.85))
                }
            }
            HStack(spacing: 8) {
                Button(action: { onApplyOutfitTapped?() }) {
                    Label("Open in Roblox", systemImage: "arrow.up.right.square").frame(maxWidth: .infinity)
                }.buttonStyle(.borderedProminent)
                Button(action: { onExportRbxmTapped?() }) {
                    Label("Export .rbxm", systemImage: "square.and.arrow.down").frame(maxWidth: .infinity)
                }.buttonStyle(.bordered)
            }
            Text(recipe.disclaimer).font(.caption2).foregroundColor(.white.opacity(0.5))
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: 16).fill(Color.black.opacity(0.85)))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.purple.opacity(0.4), lineWidth: 1))
    }
}

#endif
