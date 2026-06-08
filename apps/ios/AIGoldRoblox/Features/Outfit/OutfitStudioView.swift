// OutfitStudioView.swift — root SwiftUI screen for the 1-Click Outfit
// Generator (session 383). Converted to a guided chat-interview
// (aesthetic → gender → style → auto-assemble) to match the app's
// conversational style. LLM-free scripted flow keeps inputs mapped to
// backend enums.

import SwiftUI

struct OutfitStudioView: View {
    @StateObject private var studio = OutfitStudio()
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack(alignment: .top) {
            LinearGradient(colors: [.gradientTop, .gradientBottom], startPoint: .topLeading, endPoint: .bottomTrailing)
                .ignoresSafeArea()
            content
            if let toast = studio.transientToast {
                OutfitToastBanner(message: toast)
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .padding(.top, 16)
            }
        }
        .animation(.spring(response: 0.4, dampingFraction: 0.85), value: studio.transientToast)
        .alert("Connect your Roblox account", isPresented: $studio.showRobloxConnectAlert) {
            Button("Connect") {
                RobloxAuthService.shared.startOAuthFlow()
            }
            Button("Cancel", role: .cancel) { }
        } message: {
            Text("Your generated creations upload to your own Roblox account. Connect it to start generating.")
        }
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
                Text("Outfit Generator")
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
            OutfitInterviewSection(studio: studio)
        case .loading:
            OutfitLoadingSection()
        case .result(let resp):
            OutfitResultView(studio: studio, response: resp)
        case .error(let m):
            OutfitErrorSection(message: m, onRetry: studio.retryAfterError)
        }
    }
}

// MARK: - Chat Interview

private struct OutfitInterviewSection: View {
    @ObservedObject var studio: OutfitStudio

    var body: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        ForEach(studio.chatLines) { line in
                            OutfitChatBubble(line: line).id(line.id)
                        }
                        Color.clear.frame(height: 1).id("outfit_bottom")
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 70)
                    .padding(.bottom, 12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .onChange(of: studio.chatLines.count) {
                    withAnimation(.easeOut(duration: 0.25)) {
                        proxy.scrollTo("outfit_bottom", anchor: .bottom)
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
            case .aesthetic:
                ScrollView {
                    VStack(spacing: 8) {
                        ForEach(studio.allAesthetics) { a in
                            OutfitAestheticOptionRow(aesthetic: a) { studio.answerAesthetic(a) }
                        }
                    }
                }
                .frame(maxHeight: 320)
            case .gender:
                OutfitChipScroll(
                    items: OutfitGender.allCases,
                    label: { studio.genderLabel($0) },
                    onTap: { studio.answerGender($0) }
                )
            case .style:
                OutfitChipScroll(
                    items: OutfitStyleMode.allCases,
                    label: { studio.styleLabel($0) },
                    onTap: { studio.answerStyle($0) }
                )
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
}

private struct OutfitChatBubble: View {
    let line: OutfitStudio.OutfitChatLine

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

/// Rich, tappable answer for the aesthetic question — icon tile + pitch.
private struct OutfitAestheticOptionRow: View {
    let aesthetic: OutfitAesthetic
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 12) {
                ZStack {
                    LinearGradient(colors: [hex(aesthetic.accentHex), .black.opacity(0.6)],
                                   startPoint: .topLeading, endPoint: .bottomTrailing)
                    Image(systemName: aesthetic.iconSymbol)
                        .font(.system(size: 22, weight: .bold))
                        .foregroundColor(.white)
                }
                .frame(width: 46, height: 46)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

                VStack(alignment: .leading, spacing: 2) {
                    Text(aesthetic.displayTitle)
                        .font(.system(size: 15, weight: .bold, design: .rounded))
                        .foregroundColor(.textPrimary)
                    Text(aesthetic.shortPitch)
                        .font(.appCaption)
                        .foregroundColor(.textSecondary)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                }
                Spacer(minLength: 6)
                Image(systemName: "chevron.right")
                    .font(.caption.bold())
                    .foregroundColor(.textSecondary.opacity(0.6))
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
}

/// Horizontal scroll of accent pills — short answers (gender, style).
private struct OutfitChipScroll<T: Hashable>: View {
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

// MARK: - Loading / Error / Toast

private struct OutfitLoadingSection: View {
    @State private var dots = ""
    var body: some View {
        VStack(spacing: 16) {
            Spacer()
            ProgressView().scaleEffect(1.6).tint(.accentPrimary)
            Text(loc(en: "AI is curating your fit\(dots)",
                     ru: "AI собирает fit\(dots)"))
                .font(.appHeadline)
                .foregroundColor(.textPrimary)
            Text(loc(en: "2–5 seconds: catalog search + style ranking.",
                     ru: "2–5 секунд: поиск по каталогу + style ranking."))
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

private struct OutfitErrorSection: View {
    let message: String
    let onRetry: () -> Void
    var body: some View {
        VStack(spacing: 16) {
            Spacer()
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 48)).foregroundColor(.orange)
            Text(loc(en: "Something went wrong", ru: "Что-то пошло не так"))
                .font(.appHeadline).foregroundColor(.textPrimary)
            Text(message).font(.appBody).foregroundColor(.textSecondary)
                .multilineTextAlignment(.center).padding(.horizontal, 40)
            Button(loc(en: "Try again", ru: "Попробовать снова"), action: onRetry)
                .buttonStyle(.borderedProminent)
            Spacer()
        }
    }
}

private struct OutfitToastBanner: View {
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

// MARK: - Color helper (fileprivate — `hex` already exists in GlowupStudioView)

fileprivate func hex(_ rgb: String) -> Color {
    let h = rgb.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: "#", with: "")
    guard h.count == 6, let n = UInt64(h, radix: 16) else { return .gray }
    return Color(
        red: Double((n >> 16) & 0xff) / 255.0,
        green: Double((n >> 8) & 0xff) / 255.0,
        blue: Double(n & 0xff) / 255.0
    )
}

// MARK: - OutfitChatBridge (session 395)
//
// Twin of GlowupChatBridge. Opens the rich OutfitResultView from inside the
// standard ChatView when a 1-Click Outfit Generator chat-flow generation
// completes, instead of the generic Content Project Pipeline preview.
//
// Flow (mirror of CursedUGC / FittingRoom / VoiceAura / Glowup bridges):
//   1. viralChatDispatch.handleOutfit records the full OutfitGenerationResponse
//      under /api/viral-generations/:id and tags the chat PNG artifact with
//      metadata.kind="outfit" + metadata.generationId.
//   2. ChatStore.makePreviewPayload → preview.viralKind / viralGenerationId.
//   3. ChatView.previewSheetContent routes that into this bridge.
//   4. Bridge fetches OutfitGenerationDoc (GET /api/viral-generations/:id);
//      its `payload` IS the OutfitGenerationResponse, so it drives
//      OutfitStudio into .result(payload) directly — no field remap.
//
// Inlined into OutfitStudioView.swift (already compiled) to avoid a fragile
// pbxproj edit (no file-system-synchronized groups) while Xcode is open.

struct OutfitChatBridge: View {
    let generationId: String

    @Environment(\.dismiss) private var dismiss
    @StateObject private var studio = OutfitStudio()
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
                Text(loc(en: "Outfit Generator", ru: "Outfit Generator"))
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
            OutfitResultView(studio: studio, response: resp)
        case .loading:
            chatLoadingView
        case .error(let m):
            errorView(message: m)
        case .interview:
            // The bridge isn't a full studio — `.interview` only appears
            // before the doc loads, or if an OutfitResultView footer action
            // resets state. Show the loader/error rather than the scripted
            // interview; the user returns to the chat via the X button.
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
            Text(loc(en: "Loading your fit…", ru: "Загружаю fit…"))
                .font(.appHeadline).foregroundColor(.textPrimary)
            Text(loc(en: "Pulling catalog items + hero render. Usually instant.",
                     ru: "Достаю айтемы каталога + hero render. Обычно мгновенно."))
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
            Text(loc(en: "Couldn't open the outfit", ru: "Не удалось открыть outfit"))
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
                let doc = try await ViralLibraryAPIClient.fetchOutfitById(generationId)
                guard doc.kind == "outfit" else {
                    await MainActor.run {
                        initialErrorMessage = loc(
                            en: "This isn't an outfit — kind mismatch.",
                            ru: "Это не outfit — kind mismatch."
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
