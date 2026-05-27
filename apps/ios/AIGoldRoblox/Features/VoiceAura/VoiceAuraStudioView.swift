// VoiceAuraStudioView.swift — root screen for Voice-to-Aura (session 385).
// Steps: input (voice or text + style picker) → loading → result.

import SwiftUI

struct VoiceAuraStudioView: View {
    @StateObject private var studio = VoiceAuraStudio()
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack(alignment: .top) {
            LinearGradient(colors: [.gradientTop, .gradientBottom], startPoint: .topLeading, endPoint: .bottomTrailing)
                .ignoresSafeArea()
            content
            if let toast = studio.transientToast {
                AuraToast(message: toast)
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
                Text(loc(en: "Voice-to-Aura", ru: "Voice-to-Aura"))
                    .font(.appHeadline)
                    .foregroundColor(.textPrimary)
            }
        }
    }

    @ViewBuilder
    private var content: some View {
        switch studio.step {
        case .input:
            AuraInputSection(studio: studio)
        case .loading:
            AuraLoadingSection()
        case .result(let r):
            VoiceAuraResultView(studio: studio, response: r)
        case .error(let m):
            AuraErrorSection(message: m, onRetry: studio.retryAfterError)
        }
    }
}

// MARK: - Input section (voice + text + style + modifiers)

private struct AuraInputSection: View {
    @ObservedObject var studio: VoiceAuraStudio

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                header
                voiceCard
                stylePicker
                modifierRow(title: loc(en: "Intensity", ru: "Интенсивность"),
                            options: AuraIntensity.allCases,
                            selected: studio.intensity) { studio.intensity = $0 }
                modifierRow(title: loc(en: "Size", ru: "Размер"),
                            options: AuraSize.allCases,
                            selected: studio.size) { studio.size = $0 }
                modifierRow(title: loc(en: "Tone", ru: "Tone"),
                            options: AuraTone.allCases,
                            selected: studio.tone) { studio.tone = $0 }
                generateButton
            }
            .padding(.horizontal, 16)
            .padding(.top, 60)
            .padding(.bottom, 30)
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(loc(en: "AI Anime Aura Generator", ru: "AI Anime Aura генератор"))
                .font(.appTitle2.bold())
                .foregroundColor(.textPrimary)
            Text(loc(
                en: "Say or type the aura you want. AI generates the concept art + safe Roblox Lua script.",
                ru: "Скажи или введи нужную aura. AI генерит концепт + безопасный Roblox Lua скрипт."
            ))
                .font(.appBody)
                .foregroundColor(.textSecondary)
        }
    }

    private var voiceCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                Button(action: { studio.toggleRecording() }) {
                    ZStack {
                        Circle()
                            .fill(studio.isRecording
                                  ? LinearGradient(colors: [.red, .pink], startPoint: .top, endPoint: .bottom)
                                  : LinearGradient(colors: [.accentPrimary, .purple], startPoint: .top, endPoint: .bottom))
                            .frame(width: 60, height: 60)
                        Image(systemName: studio.isRecording ? "stop.fill" : "mic.fill")
                            .font(.system(size: 26))
                            .foregroundColor(.white)
                    }
                }
                .disabled(!studio.voiceAvailable && !studio.isRecording)
                VStack(alignment: .leading, spacing: 2) {
                    Text(studio.isRecording
                         ? loc(en: "Listening… tap to stop", ru: "Слушаю… тап чтобы стоп")
                         : loc(en: "Tap to speak", ru: "Тап чтобы говорить"))
                        .font(.appHeadline.bold())
                        .foregroundColor(studio.isRecording ? .red : .textPrimary)
                    Text(loc(en: "e.g. 'purple lightning aura with shadow wolves'",
                             ru: "напр. 'фиолетовая молниевая аура с тенями'"))
                        .font(.caption)
                        .foregroundColor(.textSecondary)
                }
                Spacer()
            }

            TextEditor(text: $studio.prompt)
                .font(.appBody)
                .frame(minHeight: 80, maxHeight: 120)
                .padding(8)
                .background(Color.cardBackground)
                .clipShape(RoundedRectangle(cornerRadius: 10))
        }
    }

    private var stylePicker: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(loc(en: "Aura style", ru: "Стиль ауры"))
                .font(.appHeadline).foregroundColor(.textPrimary)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(studio.allStyles) { s in
                        Button(action: { studio.style = s }) {
                            VStack(spacing: 4) {
                                Text(s.emoji).font(.system(size: 36))
                                Text(s.displayTitle).font(.caption.bold()).foregroundColor(.textPrimary)
                            }
                            .frame(width: 78)
                            .padding(.vertical, 10)
                            .background(studio.style == s
                                        ? Color.accentPrimary.opacity(0.18)
                                        : Color.cardBackground)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                            .overlay(RoundedRectangle(cornerRadius: 12)
                                .stroke(studio.style == s ? Color.accentPrimary : Color.bubbleBorder.opacity(0.3), lineWidth: 1.5))
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 2)
            }
        }
    }

    private func modifierRow<T: RawRepresentable & CaseIterable & Hashable>(
        title: String,
        options: T.AllCases,
        selected: T,
        onSelect: @escaping (T) -> Void
    ) -> some View where T.AllCases: RandomAccessCollection {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.appCaption.bold()).foregroundColor(.textSecondary)
            HStack(spacing: 6) {
                ForEach(Array(options), id: \.self) { opt in
                    let isSel = opt == selected
                    Button(action: { onSelect(opt) }) {
                        Text(displayTitle(opt))
                            .font(.appCaption.bold())
                            .padding(.horizontal, 12).padding(.vertical, 7)
                            .background(isSel ? Color.accentPrimary : Color.cardBackground)
                            .foregroundColor(isSel ? .white : .textPrimary)
                            .clipShape(Capsule())
                            .overlay(Capsule().stroke(Color.bubbleBorder.opacity(0.25), lineWidth: 1))
                    }
                }
                Spacer()
            }
        }
    }

    private func displayTitle<T>(_ opt: T) -> String {
        if let i = opt as? AuraIntensity { return i.displayTitle }
        if let s = opt as? AuraSize      { return s.displayTitle }
        if let t = opt as? AuraTone      { return t.displayTitle }
        return String(describing: opt)
    }

    private var generateButton: some View {
        Button(action: { Task { await studio.generate() } }) {
            HStack(spacing: 8) {
                Image(systemName: "sparkles")
                Text(loc(en: "Generate aura + Lua", ru: "Сгенерировать aura + Lua"))
                    .font(.appHeadline.bold())
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(LinearGradient(colors: [.purple, .pink, .red], startPoint: .leading, endPoint: .trailing))
            .foregroundColor(.white)
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }
}

// MARK: - Loading / Error / Toast

private struct AuraLoadingSection: View {
    @State private var dots = ""
    var body: some View {
        VStack(spacing: 16) {
            Spacer()
            ProgressView().scaleEffect(1.6).tint(.accentPrimary)
            Text(loc(en: "Conjuring aura\(dots)",
                     ru: "Призываю auru\(dots)"))
                .font(.appHeadline).foregroundColor(.textPrimary)
            Text(loc(en: "5-12 sec: flux concept + Anthropic Lua + variations.",
                     ru: "5-12 сек: flux концепт + Anthropic Lua + вариации."))
                .font(.appCaption).foregroundColor(.textSecondary)
                .multilineTextAlignment(.center).padding(.horizontal, 40)
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

private struct AuraErrorSection: View {
    let message: String
    let onRetry: () -> Void
    var body: some View {
        VStack(spacing: 16) {
            Spacer()
            Image(systemName: "exclamationmark.triangle.fill").font(.system(size: 48)).foregroundColor(.orange)
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

private struct AuraToast: View {
    let message: String
    var body: some View {
        Text(message)
            .font(.appCaption.bold()).foregroundColor(.white)
            .padding(.horizontal, 14).padding(.vertical, 9)
            .background(Color.black.opacity(0.85))
            .clipShape(Capsule()).shadow(radius: 4)
    }
}

// MARK: - Hex helper

func auraHex(_ rgb: String) -> Color {
    let h = rgb.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: "#", with: "")
    guard h.count == 6, let n = UInt64(h, radix: 16) else { return .purple }
    return Color(
        red: Double((n >> 16) & 0xff) / 255.0,
        green: Double((n >> 8) & 0xff) / 255.0,
        blue: Double(n & 0xff) / 255.0
    )
}
