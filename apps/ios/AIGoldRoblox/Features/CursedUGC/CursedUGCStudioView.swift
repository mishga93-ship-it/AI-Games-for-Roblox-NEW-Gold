// CursedUGCStudioView.swift — root screen for Giant & Cursed UGC Modeler
// (session 384). 5-step state machine: category → style → customize →
// loading → result.

import SwiftUI

struct CursedUGCStudioView: View {
    @StateObject private var studio = CursedUGCStudio()
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack(alignment: .top) {
            LinearGradient(colors: [.gradientTop, .gradientBottom], startPoint: .topLeading, endPoint: .bottomTrailing)
                .ignoresSafeArea()
            content
            if let toast = studio.transientToast {
                CursedToast(message: toast)
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
                Text(loc(en: "Cursed UGC Modeler", ru: "Cursed UGC Modeler"))
                    .font(.appHeadline)
                    .foregroundColor(.textPrimary)
            }
        }
    }

    @ViewBuilder
    private var content: some View {
        switch studio.step {
        case .categoryPicker:
            CategoryPickerSection(studio: studio)
        case .stylePicker(let c):
            StylePickerSection(studio: studio, category: c)
        case .customize(let c, let s):
            CustomizeSection(studio: studio, category: c, style: s)
        case .loading:
            CursedLoadingSection()
        case .result(let r):
            CursedUGCResultView(studio: studio, response: r)
        case .error(let m):
            CursedErrorSection(message: m, onRetry: studio.retryAfterError)
        }
    }
}

// MARK: - Category Picker

private struct CategoryPickerSection: View {
    @ObservedObject var studio: CursedUGCStudio
    private let columns: [GridItem] = [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(loc(en: "AI cursed UGC factory", ru: "AI cursed UGC фабрика"))
                        .font(.appTitle2.bold())
                        .foregroundColor(.textPrimary)
                    Text(loc(
                        en: "Pick a category → style → AI generates absurd Roblox meme accessories.",
                        ru: "Категория → стиль → AI генерит абсурдные мем-аксессуары для Roblox."
                    ))
                        .font(.appBody)
                        .foregroundColor(.textSecondary)
                }
                .padding(.horizontal, 16).padding(.top, 60)

                LazyVGrid(columns: columns, spacing: 12) {
                    ForEach(studio.allCategories) { cat in
                        CursedCategoryCard(category: cat) { studio.selectCategory(cat) }
                    }
                }
                .padding(.horizontal, 12).padding(.bottom, 30)
            }
        }
    }
}

private struct CursedCategoryCard: View {
    let category: CursedUGCCategory
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 10) {
                ZStack {
                    LinearGradient(colors: [cursedHex(category.accentHex), .black.opacity(0.6)],
                                   startPoint: .topLeading, endPoint: .bottomTrailing)
                    Image(systemName: category.iconSymbol)
                        .font(.system(size: 50))
                        .foregroundColor(.white.opacity(0.95))
                }
                .frame(height: 120)
                .clipShape(RoundedRectangle(cornerRadius: 14))
                VStack(alignment: .leading, spacing: 4) {
                    Text(category.displayTitle)
                        .font(.appHeadline)
                        .foregroundColor(.textPrimary)
                    Text(category.shortPitch)
                        .font(.appCaption)
                        .foregroundColor(.textSecondary)
                        .lineLimit(2)
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

// MARK: - Style Picker

private struct StylePickerSection: View {
    @ObservedObject var studio: CursedUGCStudio
    let category: CursedUGCCategory
    private let columns: [GridItem] = [
        GridItem(.flexible(), spacing: 10),
        GridItem(.flexible(), spacing: 10),
        GridItem(.flexible(), spacing: 10),
        GridItem(.flexible(), spacing: 10),
    ]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                categoryHeader
                Text(loc(en: "Pick a style", ru: "Выбери стиль"))
                    .font(.appHeadline)
                    .foregroundColor(.textPrimary)
                    .padding(.horizontal, 4)
                LazyVGrid(columns: columns, spacing: 10) {
                    ForEach(studio.allStyles) { s in
                        Button(action: { studio.selectStyle(s) }) {
                            VStack(spacing: 6) {
                                Text(s.emoji).font(.system(size: 38))
                                Text(s.displayTitle).font(.appCaption.bold()).foregroundColor(.textPrimary)
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(Color.cardBackground)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                            .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.bubbleBorder.opacity(0.25), lineWidth: 1))
                        }
                        .buttonStyle(.plain)
                    }
                }
                Button(action: studio.backToCategory) {
                    Label(loc(en: "Back", ru: "Назад"), systemImage: "chevron.left")
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

    private var categoryHeader: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(loc(en: "Category", ru: "Категория"))
                .font(.caption.bold()).foregroundColor(.textSecondary)
            Text(category.displayTitle)
                .font(.appTitle2.bold()).foregroundColor(.textPrimary)
            Text(category.shortPitch)
                .font(.appBody).foregroundColor(.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(LinearGradient(colors: [cursedHex(category.accentHex), .black.opacity(0.55)], startPoint: .topLeading, endPoint: .bottomTrailing))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }
}

// MARK: - Customize

private struct CustomizeSection: View {
    @ObservedObject var studio: CursedUGCStudio
    let category: CursedUGCCategory
    let style: CursedUGCStyle

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                headerCard
                intensityPicker
                promptField
                generateButton
                Button(action: studio.backToStyle) {
                    Label(loc(en: "Back to styles", ru: "Назад к стилям"), systemImage: "chevron.left")
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
            HStack {
                Text(style.emoji).font(.system(size: 38))
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(category.displayTitle) · \(style.displayTitle)")
                        .font(.appTitle2.bold()).foregroundColor(.white)
                    Text(category.shortPitch)
                        .font(.appCaption).foregroundColor(.white.opacity(0.85))
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(LinearGradient(colors: [cursedHex(category.accentHex), .black.opacity(0.55)], startPoint: .topLeading, endPoint: .bottomTrailing))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }

    private var intensityPicker: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(loc(en: "Cursed intensity", ru: "Уровень cursed"))
                .font(.appHeadline).foregroundColor(.textPrimary)
            HStack(spacing: 8) {
                ForEach(CursedUGCIntensity.allCases, id: \.self) { i in
                    CursedChip(title: i.displayTitle,
                               isSelected: studio.intensity == i) {
                        studio.intensity = i
                    }
                }
            }
        }
    }

    private var promptField: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(loc(en: "Custom idea (optional)", ru: "Идея (опционально)"))
                    .font(.appHeadline).foregroundColor(.textPrimary)
                Spacer()
            }
            TextField(loc(en: "e.g. sad hamster, sigma cat, flying banana...",
                          ru: "напр. грустный хомяк, сигма кот, летающий банан..."),
                      text: $studio.userPrompt)
                .textInputAutocapitalization(.never)
                .padding(12)
                .background(Color.cardBackground)
                .clipShape(RoundedRectangle(cornerRadius: 10))
            Text(loc(en: "Skip to let the AI surprise you.",
                     ru: "Пропусти — AI сам решит."))
                .font(.appCaption)
                .foregroundColor(.textSecondary)
        }
    }

    private var generateButton: some View {
        Button(action: { Task { await studio.generate() } }) {
            HStack(spacing: 8) {
                Image(systemName: "sparkles")
                Text(loc(en: "Generate cursed UGC", ru: "Сгенерировать cursed UGC"))
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

struct CursedChip: View {
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

private struct CursedLoadingSection: View {
    @State private var dots = ""
    var body: some View {
        VStack(spacing: 16) {
            Spacer()
            ProgressView().scaleEffect(1.6).tint(.accentPrimary)
            Text(loc(en: "Cooking up cursed UGC\(dots)",
                     ru: "Готовлю cursed UGC\(dots)"))
                .font(.appHeadline).foregroundColor(.textPrimary)
            Text(loc(en: "6-12 sec: 3× flux + AI metadata.",
                     ru: "6-12 сек: 3× flux + AI-метаданные."))
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

private struct CursedErrorSection: View {
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

private struct CursedToast: View {
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

// MARK: - Hex helper

func cursedHex(_ rgb: String) -> Color {
    let h = rgb.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: "#", with: "")
    guard h.count == 6, let n = UInt64(h, radix: 16) else { return .purple }
    return Color(
        red: Double((n >> 16) & 0xff) / 255.0,
        green: Double((n >> 8) & 0xff) / 255.0,
        blue: Double(n & 0xff) / 255.0
    )
}
