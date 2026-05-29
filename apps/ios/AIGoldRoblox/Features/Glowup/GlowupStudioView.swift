// GlowupStudioView.swift — full-screen Avatar Glow-Up Studio.
// The "Fake Headless & Korblox" crafter: a guided chat interview
// (vibe → gender → intensity → username) that feeds the existing
// asset-assembly pipeline (GlowupAPIClient.generate) and shows the
// result screen. Mirrors the app's conversational interview style;
// the LLM-free scripted flow keeps inputs mapped to backend enums.

import SwiftUI

struct GlowupStudioView: View {
    @StateObject private var studio = GlowupStudio()
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack(alignment: .top) {
            LinearGradient(colors: [.gradientTop, .gradientBottom], startPoint: .topLeading, endPoint: .bottomTrailing).ignoresSafeArea()
            content
            if let toast = studio.transientToast {
                ToastBanner(message: toast)
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .padding(.top, 16)
            }
        }
        .animation(.spring(response: 0.4, dampingFraction: 0.85), value: studio.transientToast)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                Button(action: { dismiss() }) {
                    Image(systemName: "xmark.circle.fill")
                        .font(.title2)
                        .foregroundColor(.textSecondary)
                }
            }
            ToolbarItem(placement: .principal) {
                Text("Avatar Glow-Up")
                    .font(.appHeadline)
                    .foregroundColor(.textPrimary)
            }
            ToolbarItem(placement: .navigationBarTrailing) {
                if case .interview = studio.step {
                    Button(action: { studio.startInterview() }) {
                        Image(systemName: "arrow.counterclockwise")
                            .font(.body)
                            .foregroundColor(.textSecondary)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var content: some View {
        switch studio.step {
        case .interview:
            GlowupInterviewSection(studio: studio)
        case .loading:
            LoadingSection()
        case .result(let resp):
            GlowupResultView(studio: studio, response: resp)
        case .error(let message):
            ErrorSection(message: message, onRetry: studio.retryAfterError)
        }
    }
}

// MARK: - Chat Interview

private struct GlowupInterviewSection: View {
    @ObservedObject var studio: GlowupStudio
    @FocusState private var usernameFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        ForEach(studio.chatLines) { line in
                            GlowupChatBubble(line: line).id(line.id)
                        }
                        Color.clear.frame(height: 1).id("glowup_bottom")
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 70)
                    .padding(.bottom, 12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .onChange(of: studio.chatLines.count) {
                    withAnimation(.easeOut(duration: 0.25)) {
                        proxy.scrollTo("glowup_bottom", anchor: .bottom)
                    }
                }
            }
            inputBar
        }
    }

    @ViewBuilder
    private var inputBar: some View {
        Group {
            switch studio.awaiting {
            case .vibe:
                VStack(spacing: 8) {
                    ForEach(GlowupVibe.allCases) { vibe in
                        GlowupVibeOptionRow(vibe: vibe) { studio.answerVibe(vibe) }
                    }
                }
            case .gender:
                GlowupChipScroll(
                    items: GlowupGender.allCases,
                    label: { studio.genderLabel($0) },
                    onTap: { studio.answerGender($0) }
                )
            case .intensity:
                GlowupChipScroll(
                    items: GlowupIntensity.allCases,
                    label: { studio.intensityLabel($0) },
                    onTap: { studio.answerIntensity($0) }
                )
            case .username:
                usernameComposer
            case .none:
                EmptyView()
            }
        }
        .padding(.horizontal, 14)
        .padding(.top, 10)
        .padding(.bottom, 14)
        .frame(maxWidth: .infinity)
        .background(.ultraThinMaterial)
    }

    private var usernameComposer: some View {
        HStack(spacing: 8) {
            TextField(loc(en: "e.g. builderman", ru: "Напр.: builderman"), text: $studio.robloxUsername)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled(true)
                .focused($usernameFocused)
                .submitLabel(.go)
                .onSubmit { studio.submitUsername() }
                .padding(.horizontal, 14).padding(.vertical, 11)
                .background(Color.cardBackground)
                .clipShape(Capsule())
                .overlay(Capsule().stroke(Color.bubbleBorder.opacity(0.3), lineWidth: 1))

            Button(action: { studio.submitUsername() }) {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.system(size: 30))
                    .foregroundColor(.accentPrimary)
            }
            Button(action: { studio.skipUsername() }) {
                Text(loc(en: "Skip", ru: "Пропуск"))
                    .font(.appCaption.bold())
                    .foregroundColor(.textSecondary)
                    .padding(.horizontal, 8).padding(.vertical, 8)
            }
        }
    }
}

private struct GlowupChatBubble: View {
    let line: GlowupStudio.GlowupChatLine

    var body: some View {
        HStack(alignment: .bottom, spacing: 6) {
            if line.role == .user {
                Spacer(minLength: 40)
            } else {
                Image(systemName: "sparkles")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(.accentPrimary)
                    .padding(.bottom, 6)
            }
            Text(line.text)
                .font(.appBody)
                .foregroundColor(line.role == .user ? .white : .textPrimary)
                .padding(.horizontal, 14).padding(.vertical, 10)
                .background(line.role == .user ? Color.accentPrimary : Color.cardBackground)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .stroke(Color.bubbleBorder.opacity(line.role == .user ? 0 : 0.2), lineWidth: 1)
                )
            if line.role == .assistant { Spacer(minLength: 40) }
        }
    }
}

// MARK: - Interview input components

/// Rich, tappable answer for the main vibe question — shows the savings flex.
private struct GlowupVibeOptionRow: View {
    let vibe: GlowupVibe
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 12) {
                ZStack {
                    LinearGradient(colors: [hex(vibe.accentHex), .black.opacity(0.6)],
                                   startPoint: .topLeading, endPoint: .bottomTrailing)
                    Image(systemName: vibe.iconSymbol)
                        .font(.system(size: 22, weight: .bold))
                        .foregroundColor(.white)
                }
                .frame(width: 46, height: 46)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

                VStack(alignment: .leading, spacing: 2) {
                    Text(vibe.displayTitle)
                        .font(.system(size: 15, weight: .bold, design: .rounded))
                        .foregroundColor(.textPrimary)
                    Text(vibe.shortPitch)
                        .font(.appCaption)
                        .foregroundColor(.textSecondary)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                }
                Spacer(minLength: 6)
                Text("−\(shortRobux(vibe.imitatedRetailRobux)) R$")
                    .font(.caption.bold())
                    .foregroundColor(.orange)
            }
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(Color.bubbleBorder.opacity(0.25), lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    private func shortRobux(_ n: Int) -> String {
        n >= 1000 ? "\(n / 1000)k" : "\(n)"
    }
}

/// Horizontal scroll of accent pills — mirrors the app's QuickReplyChips style
/// for short answers (gender, intensity).
private struct GlowupChipScroll<T: Hashable>: View {
    let items: [T]
    let label: (T) -> String
    let onTap: (T) -> Void

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(items, id: \.self) { item in
                    Button(action: { onTap(item) }) {
                        Text(label(item))
                            .font(.system(size: 14, weight: .semibold, design: .rounded))
                            .foregroundColor(.accentPrimary)
                            .padding(.horizontal, 16).padding(.vertical, 11)
                            .background(Color.accentPrimary.opacity(0.1))
                            .clipShape(Capsule())
                            .overlay(Capsule().stroke(Color.accentPrimary.opacity(0.5), lineWidth: 1.5))
                    }
                    .buttonStyle(.plain)
                    .frame(minHeight: 44)
                }
            }
            .padding(.horizontal, 2)
        }
    }
}

// MARK: - Loading / Error

private struct LoadingSection: View {
    @State private var dots = ""

    var body: some View {
        VStack(spacing: 16) {
            Spacer()
            ProgressView()
                .scaleEffect(1.6)
                .tint(.accentPrimary)
            Text(loc(en: "Building your look\(dots)", ru: "Собираю твой look\(dots)"))
                .font(.appHeadline)
                .foregroundColor(.textPrimary)
            Text(loc(
                en: "5–15 seconds: AI restyles your avatar, sharp composites shirt/pants.",
                ru: "5–15 секунд: AI рисует decal, sharp композитит shirt/pants."
            ))
                .font(.appCaption)
                .foregroundColor(.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
            Spacer()
        }
        .task {
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 400_000_000)
                dots = dots.count >= 3 ? "" : dots + "."
            }
        }
    }
}

private struct ErrorSection: View {
    let message: String
    let onRetry: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            Spacer()
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 48))
                .foregroundColor(.orange)
            Text(loc(en: "Something went wrong", ru: "Что-то пошло не так"))
                .font(.appHeadline)
                .foregroundColor(.textPrimary)
            Text(message)
                .font(.appBody)
                .foregroundColor(.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
            Button(loc(en: "Try again", ru: "Попробовать снова"), action: onRetry)
                .buttonStyle(.borderedProminent)
            Spacer()
        }
    }
}

private struct ToastBanner: View {
    let message: String
    var body: some View {
        Text(message)
            .font(.appCaption.bold())
            .foregroundColor(.white)
            .padding(.horizontal, 14).padding(.vertical, 9)
            .background(Color.black.opacity(0.85))
            .clipShape(Capsule())
            .shadow(radius: 4)
    }
}

// MARK: - Color helper (file-private to avoid colliding with other modules)

fileprivate func hex(_ rgb: String) -> Color {
    let h = rgb.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: "#", with: "")
    guard h.count == 6, let n = UInt64(h, radix: 16) else { return .gray }
    return Color(
        red: Double((n >> 16) & 0xff) / 255.0,
        green: Double((n >> 8) & 0xff) / 255.0,
        blue: Double(n & 0xff) / 255.0
    )
}

// MARK: - GlowupChatBridge (session 395)
//
// Opens the rich GlowupResultView from inside the standard ChatView when a
// glowup (fake Headless / Korblox / Void / Sigma glow-up) chat-flow generation
// completes. ChatView's default completion handler shows the generic Content
// Project Pipeline preview (numbered stages + Export RBXM); for glowup we want
// the user to land in the asset-pack result screen — preview render +
// shirt/pants/decal asset pack + catalog items + upload steps + share.
//
// Flow (mirror of CursedUGC / FittingRoom / VoiceAura bridges):
//   1. viralChatDispatch.handleGlowup records the full GlowupGenerationResponse
//      under /api/viral-generations/:id and tags the chat PNG artifact with
//      metadata.kind="glowup" + metadata.generationId.
//   2. ChatStore.makePreviewPayload → preview.viralKind / viralGenerationId.
//   3. ChatView.previewSheetContent routes that into this bridge.
//   4. Bridge fetches GlowupGenerationDoc (GET /api/viral-generations/:id);
//      its `payload` IS the GlowupGenerationResponse, so it drives
//      GlowupStudio into .result(payload) directly — no field remap.
//
// Inlined into GlowupStudioView.swift (already compiled) instead of a separate
// file: this Xcode project has no file-system-synchronized groups, so a new
// .swift file would need a fragile pbxproj edit while the user's Xcode is open.

struct GlowupChatBridge: View {
    let generationId: String

    @Environment(\.dismiss) private var dismiss
    @StateObject private var studio = GlowupStudio()
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
                Text(loc(en: "Avatar Glow-Up", ru: "Avatar Glow-Up"))
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
            GlowupResultView(studio: studio, response: resp)
        case .loading:
            chatLoadingView
        case .error(let m):
            errorView(message: m)
        case .interview:
            // The bridge isn't a full studio — `.interview` only appears
            // before the doc loads, or if a GlowupResultView footer action
            // resets state ("Another vibe" / "Change parameters"). Show the
            // loader/error rather than the scripted interview; the user
            // returns to the chat via the X button to start a new glow-up.
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
            Text(loc(en: "Loading your glow-up…", ru: "Загружаю glow-up…"))
                .font(.appHeadline).foregroundColor(.textPrimary)
            Text(loc(en: "Pulling preview + asset pack + catalog items. Usually instant.",
                     ru: "Достаю превью + asset pack + айтемы каталога. Обычно мгновенно."))
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
            Text(loc(en: "Couldn't open the glow-up", ru: "Не удалось открыть glow-up"))
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

    /// The handler records the doc inline (fire-and-forget Firestore write), so
    /// it's normally ready the instant the chat job completes. Retry briefly to
    /// cover Firestore write-propagation lag, then surface a retryable error.
    private func loadInitial() async {
        let deadline = Date().addingTimeInterval(20)
        var lastError: String?
        while Date() < deadline {
            do {
                let doc = try await ViralLibraryAPIClient.fetchGlowupById(generationId)
                guard doc.kind == "glowup" else {
                    await MainActor.run {
                        initialErrorMessage = loc(
                            en: "This isn't a glow-up — kind mismatch.",
                            ru: "Это не glow-up — kind mismatch."
                        )
                    }
                    return
                }
                await MainActor.run {
                    studio.step = .result(doc.payload)
                    initialErrorMessage = nil
                }
                return
            } catch {
                lastError = error.localizedDescription
            }
            try? await Task.sleep(nanoseconds: 1_200_000_000)
        }
        await MainActor.run {
            initialErrorMessage = lastError ?? loc(
                en: "Took too long. Open it from Recents in a minute.",
                ru: "Слишком долго. Открой из Recents через минуту."
            )
        }
    }
}
