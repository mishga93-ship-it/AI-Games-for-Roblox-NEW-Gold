// FittingRoomStudioView.swift — root SwiftUI screen for Zero-Robux Fitting
// Room (session 386). 5-step state machine.

import SwiftUI

struct FittingRoomStudioView: View {
    @StateObject private var studio = FittingRoomStudio()
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack(alignment: .top) {
            LinearGradient(colors: [.gradientTop, .gradientBottom], startPoint: .topLeading, endPoint: .bottomTrailing)
                .ignoresSafeArea()
            content
            if let toast = studio.transientToast {
                FittingToast(message: toast)
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
                        .font(.title2).foregroundColor(.textSecondary)
                }
            }
            ToolbarItem(placement: .principal) {
                Text(loc(en: "Fitting Room", ru: "Fitting Room"))
                    .font(.appHeadline).foregroundColor(.textPrimary)
            }
        }
    }

    @ViewBuilder
    private var content: some View {
        switch studio.step {
        case .aestheticPicker:
            FittingPickerSection(studio: studio)
        case .customize(let a):
            FittingCustomizeSection(studio: studio, aesthetic: a)
        case .loading:
            FittingLoadingSection(liveDoc: studio.liveDoc)
        case .result(let r):
            FittingRoomResultView(studio: studio, response: r)
        case .error(let m):
            FittingErrorSection(message: m, onRetry: studio.retryAfterError)
        }
    }
}

// MARK: - Picker

private struct FittingPickerSection: View {
    @ObservedObject var studio: FittingRoomStudio
    private let columns: [GridItem] = [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(loc(en: "Try fits on YOUR avatar", ru: "Примерь на СВОЁМ аватаре"))
                        .font(.appTitle2.bold())
                        .foregroundColor(.textPrimary)
                    Text(loc(
                        en: "Pick a vibe → AI dresses your real Roblox avatar in 3 angles (front · 3/4 · back).",
                        ru: "Выбери vibe → AI оденет твоего Roblox-аватара в 3 ракурсах (спереди · 3/4 · сзади)."
                    ))
                        .font(.appBody).foregroundColor(.textSecondary)
                }
                .padding(.horizontal, 16).padding(.top, 60)

                LazyVGrid(columns: columns, spacing: 12) {
                    ForEach(studio.allAesthetics) { a in
                        FittingAestheticCard(aesthetic: a) { studio.selectAesthetic(a) }
                    }
                }
                .padding(.horizontal, 12).padding(.bottom, 30)
            }
        }
    }
}

private struct FittingAestheticCard: View {
    let aesthetic: FittingRoomAesthetic
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 10) {
                ZStack {
                    LinearGradient(colors: [fitHex(aesthetic.accentHex), .black.opacity(0.6)],
                                   startPoint: .topLeading, endPoint: .bottomTrailing)
                    Image(systemName: aesthetic.iconSymbol)
                        .font(.system(size: 50)).foregroundColor(.white.opacity(0.95))
                }
                .frame(height: 120)
                .clipShape(RoundedRectangle(cornerRadius: 14))
                VStack(alignment: .leading, spacing: 4) {
                    Text(aesthetic.displayTitle).font(.appHeadline).foregroundColor(.textPrimary)
                    Text(aesthetic.shortPitch).font(.appCaption).foregroundColor(.textSecondary).lineLimit(2)
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

// MARK: - Customize (gender + style + username if no OAuth)

private struct FittingCustomizeSection: View {
    @ObservedObject var studio: FittingRoomStudio
    let aesthetic: FittingRoomAesthetic

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                headerCard
                genderPicker
                stylePicker
                avatarSourceCard
                tryItButton
                Button(action: studio.backToPicker) {
                    Label(loc(en: "Back to vibes", ru: "Назад к vibes"),
                          systemImage: "chevron.left")
                        .font(.appBody).foregroundColor(.textSecondary)
                }
                .padding(.top, 8)
            }
            .padding(.horizontal, 16).padding(.top, 60).padding(.bottom, 30)
        }
    }

    private var headerCard: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(loc(en: "Vibe", ru: "Vibe"))
                .font(.caption.bold()).foregroundColor(.textSecondary)
            Text(aesthetic.displayTitle).font(.appTitle2.bold()).foregroundColor(.textPrimary)
            Text(aesthetic.shortPitch).font(.appBody).foregroundColor(.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(LinearGradient(colors: [fitHex(aesthetic.accentHex), .black.opacity(0.55)], startPoint: .topLeading, endPoint: .bottomTrailing))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }

    private var genderPicker: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(loc(en: "Who's this for?", ru: "Под кого?"))
                .font(.appHeadline).foregroundColor(.textPrimary)
            HStack(spacing: 8) {
                ForEach(FittingRoomGender.allCases, id: \.self) { g in
                    FittingChip(title: genderLabel(g), isSelected: studio.gender == g) { studio.gender = g }
                }
            }
        }
    }

    private var stylePicker: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(loc(en: "Style", ru: "Стиль")).font(.appHeadline).foregroundColor(.textPrimary)
            HStack(spacing: 8) {
                ForEach(FittingRoomStyle.allCases, id: \.self) { s in
                    FittingChip(title: styleLabel(s), isSelected: studio.style == s) { studio.style = s }
                }
            }
        }
    }

    private var avatarSourceCard: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(loc(en: "Your avatar", ru: "Твой аватар"))
                    .font(.appHeadline).foregroundColor(.textPrimary)
                Spacer()
            }
            if studio.oauthConnected {
                Label(loc(en: "Roblox connected — using your real avatar.",
                          ru: "Roblox подключён — берём твоего реального аватара."),
                      systemImage: "checkmark.seal.fill")
                    .font(.appCaption).foregroundColor(.green)
            } else {
                TextField(loc(en: "Roblox username (e.g. builderman)",
                              ru: "Roblox-ник (напр. builderman)"),
                          text: $studio.robloxUsername)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled(true)
                    .padding(12)
                    .background(Color.cardBackground)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                Text(loc(en: "Skip — we'll use a generic mannequin (no personalization).",
                         ru: "Пропусти — будет generic mannequin (без персонализации)."))
                    .font(.appCaption).foregroundColor(.textSecondary)
            }
        }
    }

    private var tryItButton: some View {
        Button(action: { Task { await studio.start() } }) {
            HStack(spacing: 8) {
                Image(systemName: "person.crop.rectangle.stack.fill")
                Text(loc(en: "Try this fit on me", ru: "Примерить на себя"))
                    .font(.appHeadline.bold())
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(LinearGradient(colors: [.pink, .purple, .blue], startPoint: .leading, endPoint: .trailing))
            .foregroundColor(.white)
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }

    private func genderLabel(_ g: FittingRoomGender) -> String {
        switch g {
        case .boys:    return loc(en: "Guys", ru: "Парень")
        case .girls:   return loc(en: "Girls", ru: "Девушка")
        case .neutral: return loc(en: "Neutral", ru: "Neutral")
        }
    }
    private func styleLabel(_ s: FittingRoomStyle) -> String {
        switch s {
        case .dark:     return loc(en: "Dark", ru: "Тёмный")
        case .colorful: return loc(en: "Colorful", ru: "Цветной")
        }
    }
}

struct FittingChip: View {
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

// MARK: - Loading (with progressive preview)

private struct FittingLoadingSection: View {
    let liveDoc: FittingRoomDocResponse?
    @State private var dots = ""

    var body: some View {
        VStack(spacing: 16) {
            Spacer()
            ProgressView().scaleEffect(1.6).tint(.accentPrimary)
            Text(progressText)
                .font(.appHeadline).foregroundColor(.textPrimary)
            Text(loc(en: "Rendering 3 angles…",
                     ru: "Рендерим 3 ракурса…"))
                .font(.appCaption).foregroundColor(.textSecondary)
                .multilineTextAlignment(.center).padding(.horizontal, 40)

            // Tiny progress indicator: 3 dots, lit as each angle completes
            HStack(spacing: 12) {
                angleDot(label: "Front",   ready: liveDoc?.renders.front != nil)
                angleDot(label: "3/4",     ready: liveDoc?.renders.threeQuarter != nil)
                angleDot(label: "Back",    ready: liveDoc?.renders.back != nil)
            }
            .padding(.top, 12)
            Spacer()
        }
        .task {
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 400_000_000)
                dots = dots.count >= 3 ? "" : dots + "."
            }
        }
    }

    private var progressText: String {
        let frontReady = liveDoc?.renders.front != nil
        if !frontReady { return loc(en: "Dressing your avatar\(dots)", ru: "Одеваю аватара\(dots)") }
        if liveDoc?.renders.threeQuarter == nil { return loc(en: "Rendering 3/4 angle\(dots)", ru: "Рендерю 3/4\(dots)") }
        if liveDoc?.renders.back == nil { return loc(en: "Rendering back angle\(dots)", ru: "Рендерю back\(dots)") }
        return loc(en: "Finalizing items\(dots)", ru: "Финализирую\(dots)")
    }

    private func angleDot(label: String, ready: Bool) -> some View {
        VStack(spacing: 4) {
            Circle()
                .fill(ready ? Color.green : Color.gray.opacity(0.3))
                .frame(width: 12, height: 12)
            Text(label).font(.caption2).foregroundColor(.textSecondary)
        }
    }
}

private struct FittingErrorSection: View {
    let message: String
    let onRetry: () -> Void
    var body: some View {
        VStack(spacing: 16) {
            Spacer()
            Image(systemName: "exclamationmark.triangle.fill").font(.system(size: 48)).foregroundColor(.orange)
            Text(loc(en: "Something went wrong", ru: "Что-то пошло не так")).font(.appHeadline).foregroundColor(.textPrimary)
            Text(message).font(.appBody).foregroundColor(.textSecondary).multilineTextAlignment(.center).padding(.horizontal, 40)
            Button(loc(en: "Try again", ru: "Попробовать снова"), action: onRetry).buttonStyle(.borderedProminent)
            Spacer()
        }
    }
}

private struct FittingToast: View {
    let message: String
    var body: some View {
        Text(message)
            .font(.appCaption.bold()).foregroundColor(.white)
            .padding(.horizontal, 14).padding(.vertical, 9)
            .background(Color.black.opacity(0.85))
            .clipShape(Capsule()).shadow(radius: 4)
    }
}

// MARK: - Hex helper (file-private)

func fitHex(_ rgb: String) -> Color {
    let h = rgb.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: "#", with: "")
    guard h.count == 6, let n = UInt64(h, radix: 16) else { return .purple }
    return Color(
        red: Double((n >> 16) & 0xff) / 255.0,
        green: Double((n >> 8) & 0xff) / 255.0,
        blue: Double(n & 0xff) / 255.0
    )
}
