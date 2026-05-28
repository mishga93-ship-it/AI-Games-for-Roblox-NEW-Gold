// DisasterSpawnerChatBridge.swift — opens the rich DisasterSpawnerResultView
// from inside the standard ChatView when a disaster_spawner chat-flow
// generation completes (session 385 round 7).
//
// Why this exists: ChatView's default completion handler shows the generic
// Content Project Pipeline preview (numbered stages + Export RBXM /
// Publish To Community). For disaster_spawner we want the user to land in
// the poster-driven result screen the dedicated DisasterSpawnerStudio used
// to show — hero image, rarity / difficulty / players badges, drop-in
// rbxmx card, collapsible Lua viewer, variations strip, "Make Chaotic"
// retry, and share-poster button.
//
// Flow:
//   1. ChatStore.makePreviewPayload tags the preview with
//      viralKind="disaster_spawner" + viralGenerationId when the job
//      artifacts carry metadata.kind="disaster_spawner".
//   2. ChatView.previewSheetContent routes that into this bridge.
//   3. Bridge calls DisasterSpawnerAPIClient.fetchById(generationId) →
//      typed DisasterGenerationDoc (GET /api/viral-generations/:id under
//      the hood). Mirror of VoiceAuraChatBridge pattern.
//   4. doc.toResponse() rebuilds the full DisasterGenerationResponse, drives
//      DisasterSpawnerStudio into .result, renders DisasterSpawnerResultView.

import SwiftUI

struct DisasterSpawnerChatBridge: View {
    let generationId: String

    @Environment(\.dismiss) private var dismiss
    @StateObject private var studio = DisasterSpawnerStudio()
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
                Text(loc(en: "Disaster Spawner", ru: "Disaster Spawner"))
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
            DisasterSpawnerResultView(studio: studio, response: resp)
        case .loading:
            chatLoadingView
        case .error(let m):
            errorView(message: m)
        case .input:
            // The bridge isn't a full studio — `input` only appears before
            // the doc loads, or if a Studio action resets state. Show a
            // loader / error rather than the empty input form.
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
            Text(loc(en: "Loading disaster…", ru: "Загружаю disaster…"))
                .font(.appHeadline).foregroundColor(.textPrimary)
            Text(loc(en: "Pulling poster + safe Lua + rbxmx. Usually instant.",
                     ru: "Достаю постер + Lua + rbxmx. Обычно мгновенно."))
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
            Text(loc(en: "Couldn't open the disaster",
                     ru: "Не удалось открыть disaster"))
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
            let doc = try await DisasterSpawnerAPIClient.fetchById(generationId)
            guard doc.kind == "disaster_spawner" else {
                await MainActor.run {
                    initialErrorMessage = loc(
                        en: "This isn't a disaster — kind mismatch.",
                        ru: "Это не disaster — kind mismatch."
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
