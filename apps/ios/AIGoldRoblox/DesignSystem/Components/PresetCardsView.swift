//
//  PresetCardsView.swift
//  AIGoldRoblox
//

import SwiftUI

/// A two-column grid of preset cards shown at chat start.
/// Each card has a title, subtitle, and optional emoji.
struct PresetCardsView: View {
    let presets: [ChatPreset]
    let onSelect: (ChatPreset) -> Void

    private let columns = [
        GridItem(.flexible(), spacing: 10),
        GridItem(.flexible(), spacing: 10),
    ]

    var body: some View {
        LazyVGrid(columns: columns, spacing: 10) {
            ForEach(presets) { preset in
                PresetCard(preset: preset) {
                    onSelect(preset)
                }
            }
        }
        .padding(.horizontal, 4)
    }
}

private struct PresetCard: View {
    let preset: ChatPreset
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if let emoji = preset.emoji {
                    Text(emoji)
                        .font(.system(size: 22))
                        .frame(width: 28)
                }

                VStack(alignment: .leading, spacing: 2) {
                    TechnicalText(
                        preset.title,
                        baseFont: .system(size: 13, weight: .bold, design: .rounded),
                        technicalFont: .appTechnical(size: 13, weight: .bold)
                    )
                        .foregroundColor(.textPrimary)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)

                    TechnicalText(
                        preset.subtitle,
                        baseFont: .system(size: 11, weight: .regular, design: .rounded),
                        technicalFont: .appTechnical(size: 11, weight: .semibold)
                    )
                        .foregroundColor(.textSecondary)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                }

                Spacer(minLength: 0)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity, minHeight: 70, alignment: .leading)
            .background(Color.quickReplyBackground)
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .stroke(Color.quickReplyBorder, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }
}
