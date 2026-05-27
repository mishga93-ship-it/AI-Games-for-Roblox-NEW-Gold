// OutfitStudioView.swift — root SwiftUI screen for the 1-Click Outfit
// Generator (session 383).

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
        }
    }

    @ViewBuilder
    private var content: some View {
        switch studio.step {
        case .aestheticPicker:
            OutfitPickerSection(studio: studio)
        case .customize(let a):
            OutfitCustomizeSection(studio: studio, aesthetic: a)
        case .loading:
            OutfitLoadingSection()
        case .result(let resp):
            OutfitResultView(studio: studio, response: resp)
        case .error(let m):
            OutfitErrorSection(message: m, onRetry: studio.retryAfterError)
        }
    }
}

// MARK: - Picker

private struct OutfitPickerSection: View {
    @ObservedObject var studio: OutfitStudio
    // Round 6 redesign: 16pt spacing (was 12) for more breathing room
    // between cards — matches the larger 170pt tile height.
    private let columns: [GridItem] = [GridItem(.flexible(), spacing: 16), GridItem(.flexible(), spacing: 16)]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(loc(en: "AI built your TikTok fit", ru: "AI собрал твой TikTok fit"))
                        .font(.system(size: 24, weight: .bold, design: .rounded))
                        .foregroundColor(.textPrimary)
                    Text(loc(
                        en: "One tap → a full outfit assembled from real Roblox catalog items.",
                        ru: "Один тап — полный outfit из реальных Roblox-айтемов."
                    ))
                        .font(.appBody)
                        .foregroundColor(.textSecondary)
                        .lineSpacing(2)
                }
                .padding(.horizontal, 18)
                .padding(.top, 60)

                LazyVGrid(columns: columns, spacing: 16) {
                    ForEach(studio.allAesthetics) { a in
                        AestheticCard(aesthetic: a) { studio.selectAesthetic(a) }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 40)
            }
        }
    }
}

private struct AestheticCard: View {
    let aesthetic: OutfitAesthetic
    let onTap: () -> Void
    @State private var isPressed = false

    private var accent: Color { hex(aesthetic.accentHex) }

    var body: some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 12) {
                // Hero tile — bigger (170 vs 120), richer gradient, larger
                // glow-y SF Symbol with per-vibe accent shadow. Decorative
                // sparkle in the top-right corner adds Kami brand language
                // (the design system uses sparkle/star motifs throughout).
                ZStack {
                    LinearGradient(
                        colors: [accent, accent.opacity(0.55), .black.opacity(0.78)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )

                    // Soft inner glow blob behind the icon — adds depth that
                    // the old flat gradient lacked.
                    Circle()
                        .fill(accent.opacity(0.55))
                        .frame(width: 130, height: 130)
                        .blur(radius: 38)
                        .offset(y: 6)

                    Image(systemName: aesthetic.iconSymbol)
                        .font(.system(size: 64, weight: .bold))
                        .foregroundStyle(
                            LinearGradient(
                                colors: [.white, .white.opacity(0.82)],
                                startPoint: .top, endPoint: .bottom
                            )
                        )
                        .shadow(color: accent.opacity(0.85), radius: 12, y: 4)
                        .shadow(color: .black.opacity(0.25), radius: 6, y: 2)

                    // Decorative sparkle top-right — picks up Kami brand mark
                    // motif without overpowering the main icon.
                    VStack {
                        HStack {
                            Spacer()
                            Image(systemName: "sparkle")
                                .font(.system(size: 12, weight: .black))
                                .foregroundColor(.white.opacity(0.55))
                                .padding(.top, 10)
                                .padding(.trailing, 10)
                        }
                        Spacer()
                    }
                }
                .frame(height: 170)
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))

                VStack(alignment: .leading, spacing: 5) {
                    Text(aesthetic.displayTitle)
                        .font(.system(size: 17, weight: .bold, design: .rounded))
                        .foregroundColor(.textPrimary)
                    Text(aesthetic.shortPitch)
                        .font(.system(size: 12, weight: .regular))
                        .foregroundColor(.textSecondary)
                        .lineLimit(2)
                        .lineSpacing(1)
                        .multilineTextAlignment(.leading)
                }
                .padding(.horizontal, 6)
            }
            .padding(10)
            .background(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .fill(Color.white.opacity(0.96))
            )
            .overlay(
                // Per-vibe accent stroke (was generic cyan). Hairline so it
                // reads as accent, not as a frame.
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .stroke(accent.opacity(0.45), lineWidth: 1.2)
            )
            // Per-vibe glow shadow — this is the single biggest "premium"
            // upgrade: tiles now feel like they belong to their vibe,
            // instead of being identical white rectangles.
            .shadow(color: accent.opacity(0.32), radius: 14, y: 6)
            .shadow(color: .black.opacity(0.08), radius: 4, y: 2)
            .scaleEffect(isPressed ? 0.97 : 1.0)
            .animation(.spring(response: 0.25, dampingFraction: 0.7), value: isPressed)
        }
        .buttonStyle(.plain)
        .simultaneousGesture(
            DragGesture(minimumDistance: 0)
                .onChanged { _ in isPressed = true }
                .onEnded { _ in isPressed = false }
        )
    }
}

// MARK: - Customize

private struct OutfitCustomizeSection: View {
    @ObservedObject var studio: OutfitStudio
    let aesthetic: OutfitAesthetic

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                headerCard
                genderPicker
                stylePicker
                generateButton
                Button(action: studio.backToPicker) {
                    Label(loc(en: "Back to vibes", ru: "Назад к vibes"),
                          systemImage: "chevron.left")
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
            Text(loc(en: "Vibe", ru: "Vibe"))
                .font(.caption.bold())
                .foregroundColor(.textSecondary)
            Text(aesthetic.displayTitle)
                .font(.appTitle2.bold())
                .foregroundColor(.textPrimary)
            Text(aesthetic.shortPitch)
                .font(.appBody)
                .foregroundColor(.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(LinearGradient(colors: [hex(aesthetic.accentHex), .black.opacity(0.55)],
                                   startPoint: .topLeading, endPoint: .bottomTrailing))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }

    private var genderPicker: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(loc(en: "Who's this for?", ru: "Под кого собираем?"))
                .font(.appHeadline).foregroundColor(.textPrimary)
            HStack(spacing: 8) {
                ForEach(OutfitGender.allCases, id: \.self) { g in
                    OutfitChip(title: localizedGender(g),
                               isSelected: studio.gender == g) { studio.gender = g }
                }
            }
        }
    }

    private var stylePicker: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(loc(en: "Style", ru: "Стиль")).font(.appHeadline).foregroundColor(.textPrimary)
            HStack(spacing: 8) {
                ForEach(OutfitStyleMode.allCases, id: \.self) { s in
                    OutfitChip(title: localizedStyle(s),
                               isSelected: studio.style == s) { studio.style = s }
                }
            }
        }
    }

    private var generateButton: some View {
        Button(action: { Task { await studio.generate() } }) {
            HStack(spacing: 8) {
                Image(systemName: "sparkles")
                Text(loc(en: "Assemble fit", ru: "Собрать fit"))
                    .font(.appHeadline.bold())
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(LinearGradient(colors: [.pink, .purple], startPoint: .leading, endPoint: .trailing))
            .foregroundColor(.white)
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }

    private func localizedGender(_ g: OutfitGender) -> String {
        switch g {
        case .boys:    return loc(en: "Guys",    ru: "Парень")
        case .girls:   return loc(en: "Girls",   ru: "Девушка")
        case .neutral: return loc(en: "Neutral", ru: "Neutral")
        }
    }
    private func localizedStyle(_ s: OutfitStyleMode) -> String {
        switch s {
        case .dark:     return loc(en: "Dark",     ru: "Тёмный")
        case .colorful: return loc(en: "Colorful", ru: "Цветной")
        }
    }
}

struct OutfitChip: View {
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
