// CursedUGCChatBridge.swift — opens the rich CursedUGCResultView from
// inside the standard ChatView when a cursed_ugc chat-flow generation
// completes (session 390 round 2).
//
// Why this exists: ChatView's default completion handler shows the generic
// Content Project Pipeline preview (numbered stages + Export RBXM /
// Publish To Community). For cursed_ugc we want the user to land in the
// marketplace-card result screen the dedicated CursedUGCStudio used to
// show — fake leaked-Roblox-UGC hero card with 3D mesh viewer (or 2D
// fallback), rarity badge, fake stats, variations strip, share-poster.
//
// Flow (mirror of DisasterSpawner / FittingRoom / VoiceAura bridges):
//   1. ChatStore.makePreviewPayload tags the preview with
//      viralKind="cursed_ugc" + viralGenerationId when the job
//      artifacts carry metadata.kind="cursed_ugc".
//   2. ChatView.previewSheetContent routes that into this bridge.
//   3. Bridge calls CursedUGCAPIClient.fetchById(generationId) →
//      typed CursedUGCGenerationDoc (GET /api/viral-generations/:id).
//   4. doc.toResponse() rebuilds the full CursedUGCResponse, drives
//      CursedUGCStudio into .result(resp), renders CursedUGCResultView.

import SwiftUI

struct CursedUGCChatBridge: View {
    let generationId: String

    @Environment(\.dismiss) private var dismiss
    @StateObject private var studio = CursedUGCStudio()
    @State private var didStartLoad = false
    @State private var initialErrorMessage: String?

    var body: some View {
        ZStack(alignment: .top) {
            LinearGradient(colors: [.gradientTop, .gradientBottom],
                           startPoint: .topLeading, endPoint: .bottomTrailing)
                .ignoresSafeArea()
            content
            if let toast = studio.transientToast {
                Text(toast)
                    .font(.appCaption.bold()).foregroundColor(.white)
                    .padding(.horizontal, 14).padding(.vertical, 9)
                    .background(Color.black.opacity(0.85))
                    .clipShape(Capsule()).shadow(radius: 4)
                    .padding(.top, 16)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .animation(.spring(response: 0.4, dampingFraction: 0.85), value: studio.transientToast)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                Button(action: { dismiss() }) {
                    Image(systemName: "xmark.circle.fill")
                        .font(.title2).foregroundColor(.textSecondary)
                }
            }
            ToolbarItem(placement: .principal) {
                Text(loc(en: "Cursed UGC Modeler", ru: "Cursed UGC Modeler"))
                    .font(.appHeadline).foregroundColor(.textPrimary)
            }
        }
        .task {
            guard !didStartLoad else { return }
            didStartLoad = true
            await loadInitial()
        }
    }

    @ViewBuilder
    private var content: some View {
        switch studio.step {
        case .result(let resp):
            CursedUGCResultView(studio: studio, response: resp)
        case .loading:
            chatLoadingView
        case .error(let m):
            errorView(message: m)
        case .categoryPicker, .stylePicker, .customize:
            // The bridge isn't a full studio — initial states only appear
            // before the doc loads, or if a Studio action resets state
            // (e.g. user taps "New" / "Tweak" inside CursedUGCResultView).
            // Show loader or error rather than the empty picker.
            if let err = initialErrorMessage {
                errorView(message: err)
            } else {
                chatLoadingView
            }
        }
    }

    private var chatLoadingView: some View {
        VStack(spacing: 12) {
            Spacer()
            ProgressView().scaleEffect(1.4).tint(.accentPrimary)
            Text(loc(en: "Loading cursed UGC…",
                     ru: "Загружаю cursed UGC…"))
                .font(.appHeadline).foregroundColor(.textPrimary)
            Text(loc(en: "Pulling 3D mesh + poster + metadata. Usually instant.",
                     ru: "Достаю 3D меш + постер + метаданные. Обычно мгновенно."))
                .font(.appCaption).foregroundColor(.textSecondary)
                .multilineTextAlignment(.center).padding(.horizontal, 40)
            Spacer()
        }
    }

    private func errorView(message: String) -> some View {
        VStack(spacing: 16) {
            Spacer()
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 48)).foregroundColor(.orange)
            Text(loc(en: "Couldn't open the cursed UGC",
                     ru: "Не удалось открыть cursed UGC"))
                .font(.appHeadline).foregroundColor(.textPrimary)
            Text(message).font(.appBody).foregroundColor(.textSecondary)
                .multilineTextAlignment(.center).padding(.horizontal, 40)
            Button(action: {
                initialErrorMessage = nil
                Task { await loadInitial() }
            }) {
                Label(loc(en: "Retry", ru: "Повторить"), systemImage: "arrow.clockwise")
            }
            .buttonStyle(.borderedProminent)
            Spacer()
        }
    }

    private func loadInitial() async {
        do {
            let doc = try await CursedUGCAPIClient.fetchById(generationId)
            guard doc.kind == "cursed_ugc" else {
                await MainActor.run {
                    initialErrorMessage = loc(
                        en: "This isn't a cursed UGC — kind mismatch.",
                        ru: "Это не cursed UGC — kind mismatch."
                    )
                }
                return
            }
            await MainActor.run {
                studio.step = .result(doc.toResponse())
                initialErrorMessage = nil
            }
        } catch {
            await MainActor.run {
                initialErrorMessage = error.localizedDescription
            }
        }
    }
}
