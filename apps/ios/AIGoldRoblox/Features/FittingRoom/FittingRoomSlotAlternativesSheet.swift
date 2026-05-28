// FittingRoomSlotAlternativesSheet.swift — Phase C2 (session 389+3).
//
// Bottom sheet that opens when the user taps a slot tile in the
// dress-up grid. Fetches up to 12 alternative items for that slot from
// the existing generation's aesthetic+gender+style pool, presents them
// as a 2-column grid with thumbnails / names / prices, and on tap
// swaps the slot in the generation doc + reflects the change live in
// the 3D viewer (no img2img re-render).
//
// API contract:
//   GET  /api/fitting-room/:generationId/alternatives?slot=hair
//        → { slot, alternatives: [OutfitItem] }
//   POST /api/fitting-room/:generationId/swap-slot
//        body { slot, newItem: OutfitItem }
//        → FittingRoomDocResponse (updated doc)

import SwiftUI

struct FittingRoomSlotAlternativesSheet: View {
    let generationId: String
    let slot: String
    let slotDisplayLabel: String
    let onSwap: (FittingRoomDocResponse) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var loadState: LoadState = .loading
    @State private var swappingAssetId: String? = nil

    enum LoadState {
        case loading
        case ready([OutfitItem])
        case empty(String)
        case failed(String)
    }

    var body: some View {
        NavigationStack {
            content
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .principal) {
                        VStack(spacing: 2) {
                            Text(loc(en: "Swap \(slotDisplayLabel)",
                                     ru: "Заменить \(slotDisplayLabel)"))
                                .font(.appHeadline).foregroundColor(.textPrimary)
                            Text(loc(en: "Tap an item to try it on",
                                     ru: "Тап — примерить"))
                                .font(.caption2).foregroundColor(.textSecondary)
                        }
                    }
                    ToolbarItem(placement: .navigationBarTrailing) {
                        Button(action: { dismiss() }) {
                            Image(systemName: "xmark.circle.fill")
                                .font(.title3).foregroundColor(.textSecondary)
                        }
                    }
                }
                .background(
                    LinearGradient(colors: [.gradientTop, .gradientBottom],
                                   startPoint: .topLeading, endPoint: .bottomTrailing)
                        .ignoresSafeArea()
                )
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .task { await load() }
    }

    @ViewBuilder
    private var content: some View {
        switch loadState {
        case .loading:
            loadingView
        case .ready(let items):
            grid(items: items)
        case .empty(let msg):
            emptyView(message: msg)
        case .failed(let msg):
            errorView(message: msg)
        }
    }

    private var loadingView: some View {
        VStack(spacing: 12) {
            Spacer()
            ProgressView().scaleEffect(1.3).tint(.accentPrimary)
            Text(loc(en: "Finding alternatives…",
                     ru: "Ищу альтернативы…"))
                .font(.appCaption).foregroundColor(.textSecondary)
            Spacer()
        }
    }

    private func emptyView(message: String) -> some View {
        VStack(spacing: 12) {
            Spacer()
            Image(systemName: "tshirt").font(.system(size: 40))
                .foregroundColor(.textSecondary.opacity(0.6))
            Text(loc(en: "No alternatives for this slot",
                     ru: "Альтернатив для этого слота нет"))
                .font(.appHeadline).foregroundColor(.textPrimary)
            Text(message).font(.appCaption).foregroundColor(.textSecondary)
                .multilineTextAlignment(.center).padding(.horizontal, 30)
            Spacer()
        }
    }

    private func errorView(message: String) -> some View {
        VStack(spacing: 12) {
            Spacer()
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 36)).foregroundColor(.orange)
            Text(loc(en: "Couldn't load alternatives",
                     ru: "Не удалось загрузить"))
                .font(.appHeadline).foregroundColor(.textPrimary)
            Text(message).font(.appCaption).foregroundColor(.textSecondary)
                .multilineTextAlignment(.center).padding(.horizontal, 30)
            Button(action: { Task { await load() } }) {
                Label(loc(en: "Retry", ru: "Повторить"), systemImage: "arrow.clockwise")
            }.buttonStyle(.borderedProminent)
            Spacer()
        }
    }

    private func grid(items: [OutfitItem]) -> some View {
        ScrollView {
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 10),
                                GridItem(.flexible(), spacing: 10)], spacing: 10) {
                ForEach(items) { item in
                    alternativeCard(item)
                }
            }
            .padding(.horizontal, 16).padding(.top, 12).padding(.bottom, 24)
        }
    }

    private func alternativeCard(_ item: OutfitItem) -> some View {
        Button(action: { Task { await swap(to: item) } }) {
            VStack(alignment: .leading, spacing: 8) {
                ZStack {
                    RoundedRectangle(cornerRadius: 10)
                        .fill(Color.cardBackground.opacity(0.55))
                    if let urlStr = item.thumbnailUrl, let url = URL(string: urlStr) {
                        AsyncImage(url: url) { phase in
                            switch phase {
                            case .success(let img): img.resizable().scaledToFit().padding(8)
                            case .failure:          Image(systemName: "tshirt.fill").foregroundColor(.textSecondary)
                            case .empty:            ProgressView().scaleEffect(0.7)
                            @unknown default:       EmptyView()
                            }
                        }
                    } else {
                        Image(systemName: "tshirt.fill")
                            .font(.title2).foregroundColor(.textSecondary)
                    }
                    if swappingAssetId == item.assetId {
                        Color.black.opacity(0.5)
                        ProgressView().tint(.white)
                    }
                }
                .frame(height: 120)
                .clipShape(RoundedRectangle(cornerRadius: 10))

                Text(item.name)
                    .font(.appCaption.bold()).foregroundColor(.textPrimary)
                    .lineLimit(2).multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, alignment: .leading)

                HStack(spacing: 6) {
                    Text(item.priceRobux == 0 ? "FREE" : "\(item.priceRobux) R$")
                        .font(.caption2.monospaced().bold())
                        .padding(.horizontal, 6).padding(.vertical, 3)
                        .background((item.priceRobux == 0 ? Color.green : Color.orange).opacity(0.22))
                        .foregroundColor(item.priceRobux == 0 ? .green : .orange)
                        .clipShape(RoundedRectangle(cornerRadius: 4))
                    Spacer()
                    Image(systemName: "arrow.triangle.2.circlepath")
                        .font(.caption2.bold()).foregroundColor(.accentPrimary)
                }
            }
            .padding(10)
            .background(Color.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.bubbleBorder.opacity(0.25), lineWidth: 0.8))
        }
        .buttonStyle(.plain)
        .disabled(swappingAssetId != nil)
    }

    // MARK: - Network

    private func load() async {
        await MainActor.run { loadState = .loading }
        do {
            let resp: AlternativesResponse = try await APIClient.request(
                "api/fitting-room/\(generationId)/alternatives?slot=\(slot)",
                method: "GET",
                timeout: 20
            )
            await MainActor.run {
                if resp.alternatives.isEmpty {
                    loadState = .empty(loc(
                        en: "Roblox catalog has no curated picks for this slot right now.",
                        ru: "В каталоге сейчас нет вариантов для этого слота."))
                } else {
                    loadState = .ready(resp.alternatives)
                }
            }
        } catch {
            await MainActor.run {
                loadState = .failed(error.localizedDescription)
            }
        }
    }

    private func swap(to item: OutfitItem) async {
        await MainActor.run { swappingAssetId = item.assetId }
        let body = SwapSlotBody(slot: slot, newItem: item)
        do {
            let updated: FittingRoomDocResponse = try await APIClient.request(
                "api/fitting-room/\(generationId)/swap-slot",
                method: "POST",
                body: body,
                timeout: 15
            )
            await MainActor.run {
                onSwap(updated)
                dismiss()
            }
        } catch {
            await MainActor.run {
                swappingAssetId = nil
                loadState = .failed(error.localizedDescription)
            }
        }
    }
}

// MARK: - Wire types

private struct AlternativesResponse: Decodable {
    let slot: String
    let alternatives: [OutfitItem]
}

private struct SwapSlotBody: Encodable {
    let slot: String
    let newItem: OutfitItem
}
