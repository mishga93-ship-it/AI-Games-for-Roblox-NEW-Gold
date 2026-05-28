// FittingRoomChatBridge.swift — opens the redesigned dress-up
// FittingRoomResultView from inside the standard ChatView when a
// fitting_room chat-flow generation completes (session 389).
//
// Why this exists: ChatView's default completion handler shows the
// generic GenerationPreviewView (pipeline stages + Export / Publish
// buttons). For fitting_room we instead want the user to land in the
// dress-up room (hero avatar + slot grid). This bridge:
//   1. Receives the generationId emitted by viralChatDispatch's
//      handleFittingRoom (via ArtifactMetadata.generationId on each PNG).
//   2. Loads the rich FittingRoomDocResponse via the existing
//      /api/fitting-room/:id endpoint.
//   3. Drives a FittingRoomStudio into the .result(doc) state so all
//      Studio actions (sharePoster / savePreviewToPhotos / openCatalogItem
//      / remix buttons) work natively from inside the chat.

import SwiftUI

struct FittingRoomChatBridge: View {
    let generationId: String

    @Environment(\.dismiss) private var dismiss
    @StateObject private var studio = FittingRoomStudio()
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
                Text(loc(en: "Fitting Room", ru: "Fitting Room"))
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
        case .result(let doc):
            FittingRoomResultView(studio: studio, response: doc)
        case .loading:
            chatLoadingView
        case .error(let m):
            errorView(message: m)
        case .aestheticPicker, .customize:
            // Initial state before doc loads, or after user taps "New vibe" /
            // "Tweak". The bridge isn't a full studio — gracefully dismiss
            // so the user goes back to chat.
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
            Text(loc(en: "Loading dress-up room…",
                     ru: "Загружаю примерочную…"))
                .font(.appHeadline).foregroundColor(.textPrimary)
            Text(loc(en: "Rendering AI avatar in 3 angles. Usually takes ~30 seconds.",
                     ru: "Рендерим аватара в 3 ракурсах. Обычно ~30 секунд."))
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
            Text(loc(en: "Couldn't load the fit", ru: "Не удалось загрузить fit"))
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

    /// Poll the dedicated /api/fitting-room/:id endpoint until at least
    /// one angle render is ready, then drive studio.step = .result(doc).
    /// Once in .result state, all Studio actions (remix / share / save)
    /// just work — they're already wired into FittingRoomResultView.
    private func loadInitial() async {
        let deadline = Date().addingTimeInterval(75)
        while Date() < deadline {
            do {
                let doc = try await FittingRoomAPIClient.status(generationId: generationId)
                if doc.renders.front != nil || doc.renders.threeQuarter != nil || doc.renders.back != nil {
                    await MainActor.run {
                        studio.step = .result(doc)
                        initialErrorMessage = nil
                    }
                    return
                }
                if doc.done && doc.status == "failed" {
                    await MainActor.run {
                        initialErrorMessage = loc(
                            en: "Generation failed — try a different prompt.",
                            ru: "Генерация упала — попробуй другой prompt."
                        )
                    }
                    return
                }
            } catch {
                // Transient — retry next tick.
            }
            try? await Task.sleep(nanoseconds: 1_500_000_000)
        }
        await MainActor.run {
            initialErrorMessage = loc(
                en: "Took too long. Open it from Recents in a minute.",
                ru: "Слишком долго. Открой из Recents через минуту."
            )
        }
    }
}
