//
//  CodesView.swift
//  AIGoldRoblox
//
//  Коды для Roblox-игр (как у конкурентов Games Codes / Rbx Codes)
//

import SwiftUI

struct CodesView: View {
    @State private var searchText = ""
    @State private var codes: [GameCode] = []

    var body: some View {
        Group {
            if filteredCodes.isEmpty {
                ContentUnavailableView(
                    "No Real Codes Yet",
                    systemImage: "number.square",
                    description: Text("This section will show real codes after a live source is connected.")
                )
            } else {
                List {
                    ForEach(filteredCodes) { item in
                        CodeRow(game: item)
                    }
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(Color.appBackground)
        .searchable(text: $searchText, prompt: "Game or code")
        .navigationTitle("Codes")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var filteredCodes: [GameCode] {
        guard !searchText.isEmpty else { return codes }
        return codes.filter {
            $0.gameName.localizedCaseInsensitiveContains(searchText) ||
            $0.code.localizedCaseInsensitiveContains(searchText)
        }
    }
}

private struct CodeRow: View {
    let game: GameCode

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(game.gameName)
                .font(.appHeadline)
                .foregroundColor(.textPrimary)
            Text(game.code)
                .font(.appCode)
                .foregroundColor(.accentPrimary)
            if let reward = game.reward {
                Text(reward)
                    .font(.appCaption)
                    .foregroundColor(.textSecondary)
            }
        }
        .padding(.vertical, 8)
        .listRowBackground(Color.cardBackground)
        .listRowSeparatorTint(Color.quickReplyBorder)
    }
}

struct GameCode: Identifiable {
    let id: String
    let gameName: String
    let code: String
    let reward: String?
}
