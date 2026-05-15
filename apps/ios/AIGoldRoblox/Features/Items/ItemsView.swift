//
//  ItemsView.swift
//  AIGoldRoblox
//
//  Предметы (items) — скрипты, модели, UGC и т.д.
//

import SwiftUI

struct ItemsView: View {
    @State private var selectedCategory = "All"
    let categories = ["All", "Scripts", "Models", "UGC", "Audio"]
    let items: [ItemRow] = []

    var body: some View {
        VStack(spacing: 0) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(categories, id: \.self) { cat in
                        Button(action: { selectedCategory = cat }) {
                            Text(cat)
                                .font(.appCallout)
                                .foregroundColor(selectedCategory == cat ? .black : .textPrimary)
                                .padding(.horizontal, 14)
                                .padding(.vertical, 8)
                                .background(selectedCategory == cat ? Color.accentPrimary : Color.cardBackground)
                                .clipShape(Capsule())
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal)
            }
            .padding(.vertical, 8)
            if filteredItems.isEmpty {
                ContentUnavailableView(
                    "No Real Items Yet",
                    systemImage: "shippingbox",
                    description: Text("Items will appear here after a real catalog source is connected.")
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List(filteredItems) { item in
                    ItemRowView(item: item)
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
            }
        }
        .background(Color.appBackground)
        .navigationTitle("Items")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var filteredItems: [ItemRow] {
        if selectedCategory == "All" { return items }
        return items.filter { $0.category == selectedCategory }
    }
}

private struct ItemRowView: View {
    let item: ItemRow

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: item.icon)
                .font(.title2)
                .foregroundColor(.accentPrimary)
                .frame(width: 44, height: 44)
            VStack(alignment: .leading, spacing: 2) {
                Text(item.name)
                    .font(.appHeadline)
                    .foregroundColor(.textPrimary)
                Text(item.category)
                    .font(.appCaption)
                    .foregroundColor(.textSecondary)
            }
            Spacer()
        }
        .padding(.vertical, 6)
        .listRowBackground(Color.cardBackground)
        .listRowSeparatorTint(Color.quickReplyBorder)
    }
}

struct ItemRow: Identifiable {
    let id: String
    let name: String
    let category: String
    let icon: String
}
