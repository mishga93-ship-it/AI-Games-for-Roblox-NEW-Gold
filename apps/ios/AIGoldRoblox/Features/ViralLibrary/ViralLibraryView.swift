// ViralLibraryView.swift — Recents grid for fire-and-forget viral generations
// (Outfit, Glowup, CursedUGC, VoiceAura, DisasterSpawner, FittingRoom).
//
// Created session 385 round 6 after user feedback:
//   «нельзя посмотреть историю генераций — эти генерации не попадают в общую
//    историю»
//
// First iteration: 2-up LazyVGrid of thumbnails. Tap → re-share the poster
// via the existing UIActivityViewController flow. A full re-open-detail
// experience (re-render the original ResultView from the persisted payload)
// is a follow-up — the persisted Firestore payload already supports it.

import SwiftUI
import UIKit

// MARK: - Color helper (fileprivate — same pattern as OutfitStudioView /
// GlowupStudioView; the project doesn't have a global Color(hex:) init).

fileprivate func hexColor(_ rgb: String) -> Color {
    let h = rgb.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: "#", with: "")
    guard h.count == 6, let n = UInt64(h, radix: 16) else { return .gray }
    return Color(
        red: Double((n >> 16) & 0xff) / 255.0,
        green: Double((n >> 8) & 0xff) / 255.0,
        blue: Double(n & 0xff) / 255.0
    )
}

@MainActor
final class ViralLibraryStore: ObservableObject {
    @Published var items: [ViralLibraryItem] = []
    @Published var isLoading: Bool = false
    @Published var errorMessage: String?

    func load() async {
        if isLoading { return }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            let fetched = try await ViralLibraryAPIClient.list(limit: 50)
            self.items = fetched
        } catch {
            self.errorMessage = error.localizedDescription
        }
    }
}

struct ViralLibraryView: View {
    @StateObject private var store = ViralLibraryStore()
    @Environment(\.dismiss) private var dismiss

    private let columns = [
        GridItem(.flexible(), spacing: 14),
        GridItem(.flexible(), spacing: 14),
    ]

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [.gradientTop, .gradientBottom],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    header

                    if store.isLoading && store.items.isEmpty {
                        loadingState
                    } else if let err = store.errorMessage, store.items.isEmpty {
                        errorState(err)
                    } else if store.items.isEmpty {
                        emptyState
                    } else {
                        LazyVGrid(columns: columns, spacing: 14) {
                            ForEach(store.items) { item in
                                ViralLibraryCell(item: item) {
                                    shareItem(item)
                                }
                            }
                        }
                    }
                }
                .padding(.horizontal, 18)
                .padding(.top, 16)
                .padding(.bottom, 40)
            }
            .refreshable {
                await store.load()
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button {
                    dismiss()
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.title2)
                        .foregroundStyle(.secondary)
                }
            }
            ToolbarItem(placement: .principal) {
                Text(loc(en: "My Creations", ru: "Мои генерации"))
                    .font(.headline.weight(.semibold))
            }
        }
        .task { await store.load() }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(loc(en: "Recent viral generations",
                     ru: "Недавние генерации"))
                .font(.system(size: 22, weight: .bold, design: .rounded))
                .foregroundColor(.textPrimary)
            Text(loc(en: "Tap a card to re-share the poster.",
                     ru: "Тапни на карточку, чтобы пере-расшарить постер."))
                .font(.system(size: 13, weight: .regular))
                .foregroundColor(.textSecondary)
        }
    }

    private var loadingState: some View {
        VStack(spacing: 14) {
            ProgressView()
                .progressViewStyle(.circular)
            Text(loc(en: "Loading…", ru: "Загрузка…"))
                .font(.system(size: 14))
                .foregroundColor(.textSecondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 60)
    }

    private func errorState(_ message: String) -> some View {
        VStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.title)
                .foregroundColor(.orange)
            Text(message)
                .font(.system(size: 14))
                .foregroundColor(.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 24)
            Button {
                Task { await store.load() }
            } label: {
                Text(loc(en: "Retry", ru: "Повторить"))
                    .font(.system(size: 14, weight: .semibold))
                    .padding(.horizontal, 18)
                    .padding(.vertical, 10)
                    .background(Capsule().fill(Color.accentPrimary.opacity(0.15)))
                    .foregroundColor(.accentPrimary)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 60)
    }

    private var emptyState: some View {
        VStack(spacing: 14) {
            Image(systemName: "sparkles.rectangle.stack")
                .font(.system(size: 44))
                .foregroundStyle(LinearGradient(
                    colors: [hexColor("D642FF"), hexColor("17B8FF")],
                    startPoint: .topLeading, endPoint: .bottomTrailing
                ))
            Text(loc(en: "Nothing yet",
                     ru: "Пока пусто"))
                .font(.system(size: 18, weight: .semibold, design: .rounded))
                .foregroundColor(.textPrimary)
            Text(loc(en: "Generate something in Disaster Spawner, Outfit, Glow-Up, Fitting Room, Cursed UGC or Voice Aura — it'll show up here.",
                     ru: "Сгенерируй что-нибудь в Disaster Spawner / Outfit / Glow-Up / Fitting Room / Cursed UGC / Voice Aura — появится здесь."))
                .font(.system(size: 13))
                .foregroundColor(.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 24)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 80)
    }

    /// Quick re-share: download the thumbnail and present UIActivityViewController.
    /// Same image-only items pattern as the per-feature share buttons.
    private func shareItem(_ item: ViralLibraryItem) {
        guard let urlStr = item.thumbnailUrl, let url = URL(string: urlStr) else { return }
        Task {
            do {
                let (data, _) = try await URLSession.shared.data(from: url)
                guard let image = UIImage(data: data) else { return }
                await MainActor.run {
                    presentActivitySheet(items: [image])
                }
            } catch {
                // Silent — user can pull-to-refresh or try another item.
            }
        }
    }

    @MainActor
    private func presentActivitySheet(items: [Any]) {
        let vc = UIActivityViewController(activityItems: items, applicationActivities: nil)
        guard let scene = UIApplication.shared.connectedScenes.first(where: { $0.activationState == .foregroundActive }) as? UIWindowScene,
              let window = scene.windows.first(where: { $0.isKeyWindow }) ?? scene.windows.first,
              var top = window.rootViewController else { return }
        while let presented = top.presentedViewController { top = presented }
        if let pop = vc.popoverPresentationController {
            pop.sourceView = top.view
            pop.sourceRect = CGRect(x: top.view.bounds.midX, y: top.view.bounds.midY, width: 0, height: 0)
            pop.permittedArrowDirections = []
        }
        top.present(vc, animated: true)
    }
}

// MARK: - Cell

private struct ViralLibraryCell: View {
    let item: ViralLibraryItem
    let onTap: () -> Void

    private static let dateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateStyle = .medium
        f.timeStyle = .none
        return f
    }()

    var body: some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 8) {
                thumbnail
                VStack(alignment: .leading, spacing: 4) {
                    Text(item.title)
                        .font(.system(size: 14, weight: .semibold, design: .rounded))
                        .foregroundColor(.textPrimary)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                    HStack(spacing: 6) {
                        Text(item.kindLabel.uppercased())
                            .font(.system(size: 10, weight: .heavy, design: .rounded))
                            .tracking(0.6)
                            .foregroundColor(accentColor)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 3)
                            .background(Capsule().fill(accentColor.opacity(0.14)))
                        if let date = item.createdAtDate {
                            Text(Self.dateFormatter.string(from: date))
                                .font(.system(size: 10, weight: .medium))
                                .foregroundColor(.textTertiary)
                        }
                    }
                }
                .padding(.horizontal, 10)
                .padding(.bottom, 10)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(Color.white.opacity(0.92))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(accentColor.opacity(0.28), lineWidth: 1)
            )
            .shadow(color: .black.opacity(0.06), radius: 6, y: 3)
        }
        .buttonStyle(.plain)
    }

    private var accentColor: Color {
        if let hex = item.accentHex { return hexColor(hex) }
        switch item.kind {
        case "disaster_spawner": return hexColor("FF6A00")
        case "voice_aura":       return hexColor("D642FF")
        case "cursed_ugc":       return hexColor("8B0000")
        case "fitting_room":     return hexColor("17B8FF")
        case "outfit":           return hexColor("4FEFC2")
        case "glowup":           return hexColor("FFD93D")
        default:                 return Color.accentPrimary
        }
    }

    private var thumbnail: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(LinearGradient(
                    colors: [accentColor.opacity(0.85), .black.opacity(0.55)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ))

            if let urlStr = item.thumbnailUrl, let url = URL(string: urlStr) {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image):
                        image.resizable().scaledToFill()
                    case .failure:
                        Image(systemName: item.kindIcon)
                            .font(.system(size: 36, weight: .bold))
                            .foregroundColor(.white.opacity(0.92))
                    case .empty:
                        ProgressView().tint(.white)
                    @unknown default:
                        Image(systemName: item.kindIcon)
                            .font(.system(size: 36, weight: .bold))
                            .foregroundColor(.white.opacity(0.92))
                    }
                }
            } else {
                Image(systemName: item.kindIcon)
                    .font(.system(size: 36, weight: .bold))
                    .foregroundColor(.white.opacity(0.92))
            }
        }
        .frame(height: 130)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .padding(.horizontal, 8)
        .padding(.top, 8)
    }
}
