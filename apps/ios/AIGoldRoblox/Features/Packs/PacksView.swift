//
//  PacksView.swift
//  AIGoldRoblox
//
//  Наборы контента (паки)
//

import SwiftUI

struct PacksView: View {
    let packs: [PackItem] = []

    var body: some View {
        Group {
            if packs.isEmpty {
                ContentUnavailableView(
                    "No Real Packs Yet",
                    systemImage: "shippingbox.circle",
                    description: Text("Content packs will appear here after a live data source is connected.")
                )
            } else {
                List(packs) { pack in
                    PackRow(pack: pack)
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(Color.appBackground)
        .navigationTitle("Packs")
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct PackRow: View {
    let pack: PackItem

    var body: some View {
        HStack(spacing: 16) {
            RoundedRectangle(cornerRadius: 8)
                .fill(Color.elevatedBackground)
                .frame(width: 60, height: 60)
                .overlay(
                    Image(systemName: "shippingbox.fill")
                        .foregroundColor(.accentPrimary)
                )
            VStack(alignment: .leading, spacing: 4) {
                Text(pack.name)
                    .font(.appHeadline)
                    .foregroundColor(.textPrimary)
                Text(pack.itemCount)
                    .font(.appCaption)
                    .foregroundColor(.textSecondary)
            }
            Spacer()
        }
        .padding(.vertical, 8)
        .listRowBackground(Color.cardBackground)
        .listRowSeparatorTint(Color.quickReplyBorder)
    }
}

struct PackItem: Identifiable {
    let id: String
    let name: String
    let itemCount: String
}
