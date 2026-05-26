// GlowupStudioView.swift — full-screen Avatar Glow-Up Studio (session 382
// Phase 2 Session B). Replaces the chat-based "Fake Headless & Korblox"
// flow with a dedicated SwiftUI pipeline: vibe picker → customize →
// loading → result.

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
        }
    }

    @ViewBuilder
    private var content: some View {
        switch studio.step {
        case .vibePicker:
            VibePickerSection(studio: studio)
        case .customize(let vibe):
            CustomizeSection(studio: studio, vibe: vibe)
        case .loading:
            LoadingSection()
        case .result(let resp):
            GlowupResultView(studio: studio, response: resp)
        case .error(let message):
            ErrorSection(message: message, onRetry: studio.retryAfterError)
        }
    }
}

// MARK: - Vibe Picker

private struct VibePickerSection: View {
    @ObservedObject var studio: GlowupStudio
    private let columns: [GridItem] = [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Выглядим дорого за 0 Robux")
                        .font(.appTitle2.bold())
                        .foregroundColor(.textPrimary)
                    Text("Выбери vibe — AI соберёт shirt, pants, decal и инструкцию.")
                        .font(.appBody)
                        .foregroundColor(.textSecondary)
                }
                .padding(.horizontal, 16)
                .padding(.top, 60)

                LazyVGrid(columns: columns, spacing: 12) {
                    ForEach(studio.allVibes) { vibe in
                        VibeCard(vibe: vibe) {
                            studio.selectVibe(vibe)
                        }
                    }
                }
                .padding(.horizontal, 12)

                Text("Каждый vibe = реальный shirt PNG + pants PNG + AI-decal + step-by-step. Decal можно загрузить в Roblox в один тап (если подключён OAuth).")
                    .font(.appCaption)
                    .foregroundColor(.textSecondary)
                    .padding(.horizontal, 16)
                    .padding(.bottom, 30)
            }
        }
    }
}

private struct VibeCard: View {
    let vibe: GlowupVibe
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 10) {
                ZStack {
                    LinearGradient(
                        colors: [hex(vibe.accentHex), .black.opacity(0.6)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                    Image(systemName: vibe.iconSymbol)
                        .font(.system(size: 56))
                        .foregroundColor(.white.opacity(0.95))
                }
                .frame(height: 140)
                .clipShape(RoundedRectangle(cornerRadius: 14))

                VStack(alignment: .leading, spacing: 4) {
                    Text(vibe.displayTitle)
                        .font(.appHeadline)
                        .foregroundColor(.textPrimary)
                    Text(vibe.shortPitch)
                        .font(.appCaption)
                        .foregroundColor(.textSecondary)
                        .lineLimit(2)
                    HStack(spacing: 4) {
                        Image(systemName: "tag.fill")
                            .font(.caption2)
                        Text("save ~\(vibe.imitatedRetailRobux.formatted()) R$")
                            .font(.caption.bold())
                    }
                    .foregroundColor(.orange)
                    .padding(.top, 2)
                }
                .padding(.horizontal, 4)
            }
            .padding(8)
            .background(Color.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.bubbleBorder.opacity(0.25), lineWidth: 1))
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Customize

private struct CustomizeSection: View {
    @ObservedObject var studio: GlowupStudio
    let vibe: GlowupVibe

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                headerCard
                genderPicker
                intensityPicker
                usernameField
                generateButton
                Button(action: studio.backToPicker) {
                    Label("Назад к vibes", systemImage: "chevron.left")
                        .font(.appBody)
                        .foregroundColor(.textSecondary)
                }
                .padding(.top, 8)
            }
            .padding(.horizontal, 16)
            .padding(.top, 60)
            .padding(.bottom, 30)
        }
    }

    private var headerCard: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Vibe")
                .font(.caption.bold())
                .foregroundColor(.textSecondary)
            Text(vibe.displayTitle)
                .font(.appTitle2.bold())
                .foregroundColor(.textPrimary)
            Text(vibe.shortPitch)
                .font(.appBody)
                .foregroundColor(.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(LinearGradient(colors: [hex(vibe.accentHex), .black.opacity(0.55)], startPoint: .topLeading, endPoint: .bottomTrailing))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }

    private var genderPicker: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Под кого собираем?").font(.appHeadline).foregroundColor(.textPrimary)
            HStack(spacing: 8) {
                ForEach(GlowupGender.allCases, id: \.self) { g in
                    ChipButton(
                        title: ruGender(g),
                        isSelected: studio.gender == g
                    ) { studio.gender = g }
                }
            }
        }
    }

    private var intensityPicker: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Настроение").font(.appHeadline).foregroundColor(.textPrimary)
            HStack(spacing: 8) {
                ForEach(GlowupIntensity.allCases, id: \.self) { i in
                    ChipButton(
                        title: ruIntensity(i),
                        isSelected: studio.intensity == i
                    ) { studio.intensity = i }
                }
            }
        }
    }

    private var usernameField: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 4) {
                Text("Twой Roblox-ник").font(.appHeadline).foregroundColor(.textPrimary)
                Text("(опционально)").font(.appCaption).foregroundColor(.textSecondary)
            }
            if studio.oauthConnected {
                Text("✅ Roblox подключён — берём твоего аватара автоматически.")
                    .font(.appCaption).foregroundColor(.green)
            } else {
                TextField("Напр.: builderman", text: $studio.robloxUsername)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled(true)
                    .padding(12)
                    .background(Color.cardBackground)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                Text("Введём твой ник — увидишь СЕБЯ в этом луке. Пропусти — будет generic preview.")
                    .font(.appCaption).foregroundColor(.textSecondary)
            }
        }
    }

    private var generateButton: some View {
        Button(action: { Task { await studio.generate() } }) {
            HStack(spacing: 8) {
                Image(systemName: "sparkles")
                Text("Собрать лук")
                    .font(.appHeadline.bold())
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(LinearGradient(colors: [.green, .green.opacity(0.7)], startPoint: .leading, endPoint: .trailing))
            .foregroundColor(.white)
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }

    private func ruGender(_ g: GlowupGender) -> String {
        switch g { case .boys: return "Парень"; case .girls: return "Девушка"; case .neutral: return "Neutral" }
    }
    private func ruIntensity(_ i: GlowupIntensity) -> String {
        switch i { case .clean: return "Чисто"; case .scary: return "Страшнее" }
    }
}

private struct ChipButton: View {
    let title: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.appBody.bold())
                .padding(.horizontal, 14).padding(.vertical, 9)
                .background(isSelected ? Color.accentPrimary : Color.cardBackground)
                .foregroundColor(isSelected ? .white : .textPrimary)
                .clipShape(Capsule())
                .overlay(Capsule().stroke(Color.bubbleBorder.opacity(0.3), lineWidth: 1))
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
            Text("Собираю твой look\(dots)")
                .font(.appHeadline)
                .foregroundColor(.textPrimary)
            Text("5–15 секунд: AI рисует decal, sharp композитит shirt/pants.")
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
            Text("Что-то пошло не так")
                .font(.appHeadline)
                .foregroundColor(.textPrimary)
            Text(message)
                .font(.appBody)
                .foregroundColor(.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
            Button("Попробовать снова", action: onRetry)
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
