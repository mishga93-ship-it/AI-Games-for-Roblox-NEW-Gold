//
//  GDDCard.swift
//  AIGoldRoblox
//
//  Game Design Document card for confirmation before generation
//

import SwiftUI

struct GDDCard: View {
    let title: String
    let rows: [(String, String)]
    let onConfirm: () -> Void
    let onChange: () -> Void
    var showsActions: Bool = true
    /// Language code for localized button/meta copy. Defaults to "en".
    var language: String = "en"
    @State private var isExpanded = true

    private var isRu: Bool { language == "ru" }

    private static let sectionIcons: [String: String] = [
        // English labels
        "Title": "textformat",
        "Genre": "gamecontroller.fill",
        "Theme": "paintpalette.fill",
        "Scale": "arrow.up.left.and.arrow.down.right",
        "Mechanics": "gearshape.2.fill",
        "Characters": "person.2.fill",
        "Systems": "cpu.fill",
        "Monetization": "dollarsign.circle.fill",
        "Visual Style": "eyedropper.halffull",
        "Data Store": "externaldrive.fill",
        "Target Player": "person.crop.circle.badge.checkmark",
        "Core Loop": "arrow.triangle.2.circlepath",
        "Map / Levels": "map.fill",
        "Progression": "chart.line.uptrend.xyaxis",
        "Economy": "banknote.fill",
        "Win / Lose": "flag.checkered",
        "UI / HUD": "rectangle.inset.filled",
        "Audio / VFX": "waveform",
        "Social": "person.3.fill",
        "Platform Services": "server.rack",
        "Technical Notes": "wrench.and.screwdriver.fill",
        "Safety Notes": "checkmark.shield.fill",
        "Expertise Level": "slider.horizontal.3",
        // Russian labels (same icons)
        "Название": "textformat",
        "Жанр": "gamecontroller.fill",
        "Тема": "paintpalette.fill",
        "Масштаб": "arrow.up.left.and.arrow.down.right",
        "Механики": "gearshape.2.fill",
        "Персонажи": "person.2.fill",
        "Системы": "cpu.fill",
        "Монетизация": "dollarsign.circle.fill",
        "Визуальный стиль": "eyedropper.halffull",
        "Хранилище данных": "externaldrive.fill",
        "Целевой игрок": "person.crop.circle.badge.checkmark",
        "Основной цикл": "arrow.triangle.2.circlepath",
        "Карта / уровни": "map.fill",
        "Прогрессия": "chart.line.uptrend.xyaxis",
        "Экономика": "banknote.fill",
        "Победа / поражение": "flag.checkered",
        "Аудио / VFX": "waveform",
        "Социальные системы": "person.3.fill",
        "Сервисы платформы": "server.rack",
        "Технические заметки": "wrench.and.screwdriver.fill",
        "Безопасность": "checkmark.shield.fill",
        "Уровень экспертизы": "slider.horizontal.3",
    ]

    private static let expandableKeys: Set<String> = [
        "Mechanics", "Characters", "Systems", "Monetization", "Data Store",
        "Map / Levels", "Progression", "Economy", "UI / HUD", "Audio / VFX",
        "Social", "Platform Services", "Technical Notes", "Safety Notes",
        "Механики", "Персонажи", "Системы", "Монетизация", "Хранилище данных",
        "Карта / уровни", "Прогрессия", "Экономика", "UI / HUD", "Аудио / VFX",
        "Социальные системы", "Сервисы платформы", "Технические заметки", "Безопасность",
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            header

            if isExpanded {
                tableSection
            }

            if showsActions {
                actionButtons
            } else {
                lockedStatus
            }
        }
        .padding(16)
        .background(Color.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(Color.accentPrimary.opacity(0.3), lineWidth: 1)
        )
        .shadow(color: Color.accentPrimary.opacity(0.08), radius: 8, y: 2)
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            Image(systemName: "doc.text.fill")
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(.accentPrimary)
            Text(title)
                .font(.appTitle2)
                .foregroundColor(.textPrimary)
            Spacer()
            Text(isRu ? "\(rows.count) полей" : "\(rows.count) fields")
                .font(.system(size: 11, weight: .medium, design: .rounded))
                .foregroundColor(.textTertiary)
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(Color.elevatedBackground)
                .clipShape(Capsule())
            Button {
                withAnimation(.spring(response: 0.3)) {
                    isExpanded.toggle()
                }
            } label: {
                Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.textSecondary)
                    .padding(6)
                    .background(Color.elevatedBackground)
                    .clipShape(Circle())
            }
            .buttonStyle(.plain)
        }
    }

    // MARK: - Table

    private var tableSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(rows.enumerated()), id: \.offset) { index, row in
                let isExpandable = Self.expandableKeys.contains(row.0)
                    && row.1.contains(",")
                    && row.1.split(separator: ",").count > 3

                if isExpandable {
                    ExpandableGDDRow(
                        icon: Self.sectionIcons[row.0] ?? "circle.fill",
                        label: row.0,
                        value: row.1,
                        isStriped: index.isMultiple(of: 2),
                        isRu: isRu
                    )
                } else {
                    staticRow(icon: Self.sectionIcons[row.0] ?? "circle.fill",
                              label: row.0,
                              value: row.1,
                              isStriped: index.isMultiple(of: 2))
                }
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(Color.bubbleBorder.opacity(0.3), lineWidth: 1)
        )
    }

    private func staticRow(icon: String, label: String, value: String, isStriped: Bool) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(.accentPrimary.opacity(0.7))
                .frame(width: 16)

            Text(label)
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(.textTertiary)
                .frame(width: 104, alignment: .trailing)
                .fixedSize(horizontal: false, vertical: true)

            Text(value)
                .font(.appCallout)
                .foregroundColor(.textPrimary)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.vertical, 9)
        .padding(.horizontal, 12)
        .background(isStriped ? Color.elevatedBackground.opacity(0.5) : Color.clear)
    }

    // MARK: - Buttons

    private var actionButtons: some View {
        VStack(spacing: 10) {
            Button(action: onConfirm) {
                HStack(spacing: 8) {
                    Image(systemName: "sparkles")
                        .font(.system(size: 14, weight: .bold))
                    Text(isRu ? "Подтвердить и сгенерировать" : "Confirm & Generate")
                        .font(.system(size: 15, weight: .bold, design: .rounded))
                }
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 13)
                .background(
                    LinearGradient(
                        colors: [Color(red: 0.2, green: 0.78, blue: 0.4), Color(red: 0.15, green: 0.68, blue: 0.35)],
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                )
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .shadow(color: Color(red: 0.2, green: 0.78, blue: 0.4).opacity(0.3), radius: 6, y: 3)
            }
            .buttonStyle(.plain)

            Button(action: onChange) {
                HStack(spacing: 6) {
                    Image(systemName: "pencil")
                        .font(.system(size: 12, weight: .semibold))
                    Text(isRu ? "Хочу что-то изменить..." : "I want to change something...")
                        .font(.system(size: 13, weight: .semibold, design: .rounded))
                }
                .foregroundColor(.textSecondary)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
                .background(Color.elevatedBackground.opacity(0.8))
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .overlay(
                    RoundedRectangle(cornerRadius: 10)
                        .stroke(Color.bubbleBorder.opacity(0.3), lineWidth: 1)
                )
            }
            .buttonStyle(.plain)
        }
    }

    private var lockedStatus: some View {
        HStack(spacing: 8) {
            Image(systemName: "checkmark.seal.fill")
                .font(.system(size: 13, weight: .bold))
            Text(isRu ? "Генерация запущена" : "Generation started")
                .font(.system(size: 12, weight: .bold, design: .rounded))
                .lineLimit(1)
                .minimumScaleFactor(0.82)
            Spacer(minLength: 0)
        }
        .foregroundColor(Color(red: 0.12, green: 0.58, blue: 0.26))
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(Color(red: 0.12, green: 0.58, blue: 0.26).opacity(0.1))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(Color(red: 0.12, green: 0.58, blue: 0.26).opacity(0.22), lineWidth: 1)
        )
    }
}

// MARK: - Expandable Row

private struct ExpandableGDDRow: View {
    let icon: String
    let label: String
    let value: String
    let isStriped: Bool
    var isRu: Bool = false

    @State private var showAll = false

    private var items: [String] {
        value.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }
    }

    private let collapsedLimit = 3

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: icon)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(.accentPrimary.opacity(0.7))
                    .frame(width: 16)

                Text(label)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(.textTertiary)
                    .frame(width: 104, alignment: .trailing)
                    .fixedSize(horizontal: false, vertical: true)

                VStack(alignment: .leading, spacing: 4) {
                    let visibleItems = showAll ? items : Array(items.prefix(collapsedLimit))

                    FlowLayout(spacing: 6) {
                        ForEach(visibleItems, id: \.self) { item in
                            Text(item)
                                .font(.system(size: 12, weight: .medium, design: .rounded))
                                .foregroundColor(.textPrimary)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 4)
                                .background(Color.accentPrimary.opacity(0.1))
                                .clipShape(Capsule())
                        }
                    }

                    if items.count > collapsedLimit {
                        Button {
                            withAnimation(.spring(response: 0.25)) {
                                showAll.toggle()
                            }
                        } label: {
                            Text(showAll
                                 ? (isRu ? "Свернуть" : "Show less")
                                 : (isRu ? "+\(items.count - collapsedLimit) ещё" : "+\(items.count - collapsedLimit) more"))
                                .font(.system(size: 11, weight: .semibold, design: .rounded))
                                .foregroundColor(.accentPrimary)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(.vertical, 9)
        .padding(.horizontal, 12)
        .background(isStriped ? Color.elevatedBackground.opacity(0.5) : Color.clear)
    }
}

// MARK: - Flow Layout for chips

private struct FlowLayout: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let result = arrange(proposal: proposal, subviews: subviews)
        return result.size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = arrange(proposal: proposal, subviews: subviews)
        for (index, subview) in subviews.enumerated() {
            guard index < result.origins.count else { break }
            let origin = CGPoint(
                x: bounds.minX + result.origins[index].x,
                y: bounds.minY + result.origins[index].y
            )
            subview.place(at: origin, proposal: .unspecified)
        }
    }

    private struct ArrangeResult {
        var origins: [CGPoint]
        var size: CGSize
    }

    private func arrange(proposal: ProposedViewSize, subviews: Subviews) -> ArrangeResult {
        let maxWidth = proposal.width ?? .infinity
        var origins: [CGPoint] = []
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        var totalHeight: CGFloat = 0
        var totalWidth: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > maxWidth, x > 0 {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            origins.append(CGPoint(x: x, y: y))
            rowHeight = max(rowHeight, size.height)
            x += size.width + spacing
            totalWidth = max(totalWidth, x - spacing)
            totalHeight = y + rowHeight
        }
        return ArrangeResult(origins: origins, size: CGSize(width: totalWidth, height: totalHeight))
    }
}
