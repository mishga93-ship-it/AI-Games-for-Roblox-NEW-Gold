// DisasterSpawnerStudioView.swift — root screen (session 387).

import SwiftUI

struct DisasterSpawnerStudioView: View {
    @StateObject private var studio = DisasterSpawnerStudio()
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack(alignment: .top) {
            LinearGradient(colors: [.gradientTop, .gradientBottom], startPoint: .topLeading, endPoint: .bottomTrailing)
                .ignoresSafeArea()
            content
            if let toast = studio.transientToast {
                DisasterToast(message: toast)
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
                Text(loc(en: "Disaster Spawner", ru: "Disaster Spawner"))
                    .font(.appHeadline).foregroundColor(.textPrimary)
            }
        }
    }

    @ViewBuilder
    private var content: some View {
        switch studio.step {
        case .input:
            DisasterInputSection(studio: studio)
        case .loading:
            DisasterLoadingSection()
        case .result(let r):
            DisasterSpawnerResultView(studio: studio, response: r)
        case .error(let m):
            DisasterErrorSection(message: m, onRetry: studio.retryAfterError)
        }
    }
}

// MARK: - Input

private struct DisasterInputSection: View {
    @ObservedObject var studio: DisasterSpawnerStudio

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                header
                voiceCard
                modePicker
                modifierRow(title: loc(en: "Chaos", ru: "Хаос"),
                            options: DisasterChaosLevel.allCases,
                            selected: studio.chaos) { studio.chaos = $0 }
                modifierRow(title: loc(en: "Spawn size", ru: "Размер"),
                            options: DisasterSize.allCases,
                            selected: studio.size) { studio.size = $0 }
                modifierRow(title: loc(en: "Frequency", ru: "Частота"),
                            options: DisasterFrequency.allCases,
                            selected: studio.frequency) { studio.frequency = $0 }
                generateButton
            }
            .padding(.horizontal, 16).padding(.top, 60).padding(.bottom, 30)
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(loc(en: "AI Survival Chaos Generator", ru: "AI Survival Chaos генератор"))
                .font(.appTitle2.bold()).foregroundColor(.textPrimary)
            Text(loc(
                en: "Say or type the disaster you want — AI builds a SAFE Roblox Lua disaster loop with auto-cleanup.",
                ru: "Скажи или введи нужный disaster — AI соберёт безопасный Roblox Lua loop с auto-cleanup."
            ))
                .font(.appBody).foregroundColor(.textSecondary)
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
                                  : LinearGradient(colors: [.orange, .red], startPoint: .top, endPoint: .bottom))
                            .frame(width: 60, height: 60)
                        Image(systemName: studio.isRecording ? "stop.fill" : "mic.fill")
                            .font(.system(size: 26)).foregroundColor(.white)
                    }
                }
                .disabled(!studio.voiceAvailable && !studio.isRecording)
                VStack(alignment: .leading, spacing: 2) {
                    Text(studio.isRecording
                         ? loc(en: "Listening… tap to stop", ru: "Слушаю… тап чтобы стоп")
                         : loc(en: "Tap to speak", ru: "Тап чтобы говорить"))
                        .font(.appHeadline.bold())
                        .foregroundColor(studio.isRecording ? .red : .textPrimary)
                    Text(loc(en: "e.g. 'spawn giant ducks every 45 seconds'",
                             ru: "напр. 'спавни гигантских уток каждые 45 секунд'"))
                        .font(.caption).foregroundColor(.textSecondary)
                }
                Spacer()
            }

            ZStack(alignment: .topLeading) {
                TextEditor(text: $studio.prompt)
                    .font(.appBody).foregroundColor(.textPrimary)
                    .scrollContentBackground(.hidden)
                    .padding(4)
                    .frame(minHeight: 80, maxHeight: 120)
                if studio.prompt.isEmpty {
                    Text(loc(en: "Type or speak your disaster idea…",
                             ru: "Введи или скажи свою disaster-идею…"))
                        .font(.appBody)
                        .foregroundColor(.textSecondary.opacity(0.6))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 12)
                        .allowsHitTesting(false)
                }
            }
            .padding(4)
            .background(Color.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.bubbleBorder.opacity(0.25), lineWidth: 1))
        }
    }

    private var modePicker: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(loc(en: "Disaster mode", ru: "Mode disaster"))
                .font(.appHeadline).foregroundColor(.textPrimary)
            HStack(spacing: 10) {
                ForEach(studio.allModes) { m in
                    Button(action: { studio.mode = m }) {
                        VStack(spacing: 4) {
                            Text(m.emoji).font(.system(size: 36))
                            Text(m.displayTitle).font(.caption.bold()).foregroundColor(.textPrimary)
                        }
                        .frame(maxWidth: .infinity).padding(.vertical, 10)
                        .background(studio.mode == m
                                    ? Color.accentPrimary.opacity(0.18)
                                    : Color.cardBackground)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                        .overlay(RoundedRectangle(cornerRadius: 12)
                            .stroke(studio.mode == m ? Color.accentPrimary : Color.bubbleBorder.opacity(0.3), lineWidth: 1.5))
                    }
                    .buttonStyle(.plain)
                }
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
        if let c = opt as? DisasterChaosLevel { return c.displayTitle }
        if let s = opt as? DisasterSize       { return s.displayTitle }
        if let f = opt as? DisasterFrequency  { return f.displayTitle }
        return String(describing: opt)
    }

    private var generateButton: some View {
        Button(action: { Task { await studio.generate() } }) {
            HStack(spacing: 8) {
                Image(systemName: "tornado")
                Text(loc(en: "Generate disaster + Lua", ru: "Сгенерировать disaster + Lua"))
                    .font(.appHeadline.bold())
            }
            .frame(maxWidth: .infinity).padding(.vertical, 14)
            .background(LinearGradient(colors: [.orange, .red, .purple], startPoint: .leading, endPoint: .trailing))
            .foregroundColor(.white)
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }
}

// MARK: - Loading / Error / Toast

private struct DisasterLoadingSection: View {
    @State private var dots = ""
    var body: some View {
        VStack(spacing: 16) {
            Spacer()
            ProgressView().scaleEffect(1.6).tint(.accentPrimary)
            Text(loc(en: "Engineering chaos\(dots)", ru: "Готовлю катастрофу\(dots)"))
                .font(.appHeadline).foregroundColor(.textPrimary)
            Text(loc(en: "5-12 sec: flux concept + Anthropic Lua + metadata.",
                     ru: "5-12 сек: flux концепт + Anthropic Lua + метаданные."))
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

private struct DisasterErrorSection: View {
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

private struct DisasterToast: View {
    let message: String
    var body: some View {
        Text(message).font(.appCaption.bold()).foregroundColor(.white)
            .padding(.horizontal, 14).padding(.vertical, 9)
            .background(Color.black.opacity(0.85))
            .clipShape(Capsule()).shadow(radius: 4)
    }
}

// MARK: - Hex helper

func disasterHex(_ rgb: String) -> Color {
    let h = rgb.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: "#", with: "")
    guard h.count == 6, let n = UInt64(h, radix: 16) else { return .red }
    return Color(
        red: Double((n >> 16) & 0xff) / 255.0,
        green: Double((n >> 8) & 0xff) / 255.0,
        blue: Double(n & 0xff) / 255.0
    )
}
