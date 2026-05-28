// VoiceAuraChatBridge.swift — opens the polished VoiceAuraResultView from
// inside the standard ChatView when a voice_aura chat-flow generation
// completes (session 388 round 2).
//
// Why this exists: user feedback — «нет превью, оставь предыдущий экран
// где результаты были, прикольный мне нравился». Default chat completion
// shows the generic Content Project Pipeline UI (9 grey stages, no preview),
// which loses the dedicated VoiceAuraResultView (hero aura image + rarity
// badges + Lua viewer + op/cursed variations + Make More OP) the user
// liked.
//
// Mirrors FittingRoomChatBridge exactly:
//   1. Receives the generationId emitted by viralChatDispatch's
//      handleVoiceAura (via ArtifactMetadata.generationId on the .rbxmx
//      artifact).
//   2. Polls GET /api/viral-generations/:id until the previewUrl is ready
//      (the chat-flow records the doc as soon as the parallel generate
//      tasks settle).
//   3. Re-hydrates an AuraGenerationResponse from the doc payload and
//      drives a VoiceAuraStudio into the .result state so the existing
//      VoiceAuraResultView renders unchanged — Copy Lua / Save PNG /
//      Share / Make More OP all keep working.

import SwiftUI

struct VoiceAuraChatBridge: View {
    let generationId: String

    @Environment(\.dismiss) private var dismiss
    @StateObject private var studio = VoiceAuraStudio()
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
                Text(loc(en: "Voice-to-Aura", ru: "Voice-to-Aura"))
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
        case .result(let response):
            // Pull in the polished result view that VoiceAuraStudioView
            // normally renders — same hero card, rarity badges, drag-and-
            // drop .rbxmx card, Lua viewer, variations, "Make More OP".
            ScrollView {
                VStack(spacing: 0) {
                    VoiceAuraResultView(studio: studio, response: response)
                }
                .padding(.top, 8)
            }
        case .loading:
            chatLoadingView
        case .error(let m):
            errorView(message: m)
        case .input:
            // Initial state before doc loads. Bridge isn't a full studio —
            // either surface the load error or keep showing the spinner.
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
            Text(loc(en: "Loading aura…", ru: "Загружаю auru…"))
                .font(.appHeadline).foregroundColor(.textPrimary)
            Text(loc(en: "Concept art + safe Lua + variations. Usually ~10 seconds.",
                     ru: "Концепт + safe Lua + вариации. Обычно ~10 секунд."))
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
            Text(loc(en: "Couldn't load the aura", ru: "Не удалось загрузить auru"))
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

    /// Poll the dedicated /api/viral-generations/:id endpoint until the
    /// payload carries a previewUrl, then drive studio.step = .result.
    /// Once in .result state, all Studio actions (copyLua, sharePoster,
    /// savePreviewToPhotos, shareRbxmx, "Make More OP") just work — they
    /// already speak directly to VoiceAuraStudio.
    private func loadInitial() async {
        let deadline = Date().addingTimeInterval(75)
        while Date() < deadline {
            do {
                let doc = try await ViralLibraryAPIClient.fetchVoiceAuraById(generationId)
                if doc.payload.previewUrl != nil || doc.payload.luaScript?.isEmpty == false {
                    let response = doc.toAuraResponse()
                    await MainActor.run {
                        studio.step = .result(response)
                        initialErrorMessage = nil
                    }
                    return
                }
                // Doc exists but payload still empty — generation still
                // running on backend. Retry next tick.
            } catch {
                // Transient — retry next tick. 404 (doc not yet written) is
                // common during the first 1-2 seconds of generation.
            }
            try? await Task.sleep(nanoseconds: 1_500_000_000)
        }
        await MainActor.run {
            initialErrorMessage = loc(
                en: "Took too long. Open it from My Creations in a minute.",
                ru: "Слишком долго. Открой из My Creations через минуту."
            )
        }
    }
}
