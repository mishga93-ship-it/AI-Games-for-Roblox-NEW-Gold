//
//  QuickReplyChips.swift
//  AIGoldRoblox
//

import SwiftUI

struct QuickReplyChips: View {
    enum Style {
        case chips
        case actionButtons
    }

    let options: [String]
    var languageCode: String = "en"
    var style: Style = .chips
    let onSelect: (String) -> Void

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(Array(options.enumerated()), id: \.offset) { index, option in
                    if style == .actionButtons {
                        actionButton(option: option, isPrimary: index == 0)
                    } else {
                        chipButton(option: option)
                    }
                }
            }
            .padding(.horizontal, 4)
        }
    }

    private func chipButton(option: String) -> some View {
        Button(action: { onSelect(option) }) {
            TechnicalText(
                displayText(for: option),
                baseFont: .system(size: 13, weight: .semibold, design: .rounded),
                technicalFont: .appTechnical(size: 13, weight: .bold)
            )
            .foregroundColor(.accentPrimary)
            .lineLimit(1)
            .minimumScaleFactor(0.82)
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(Color.accentPrimary.opacity(0.1))
            .clipShape(Capsule())
            .overlay(
                Capsule()
                    .stroke(Color.accentPrimary.opacity(0.5), lineWidth: 1.5)
            )
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .frame(minHeight: 44)
        .contentShape(Capsule())
    }

    private func actionButton(option: String, isPrimary: Bool) -> some View {
        let label = displayText(for: option)
        let foreground = isPrimary ? Color.white : Color.accentPrimary
        let fill = isPrimary ? Color.accentPrimary : Color.cardBackground

        return Button(action: { onSelect(option) }) {
            HStack(spacing: 7) {
                if let iconName = iconName(for: option) {
                    Image(systemName: iconName)
                        .font(.system(size: 13, weight: .bold))
                }
                TechnicalText(
                    label,
                    baseFont: .system(size: 13, weight: .bold, design: .rounded),
                    technicalFont: .appTechnical(size: 13, weight: .bold)
                )
                .lineLimit(1)
                .minimumScaleFactor(0.82)
            }
            .foregroundColor(foreground)
            .padding(.horizontal, 15)
            .padding(.vertical, 11)
            .background(fill, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(isPrimary ? Color.accentPrimary.opacity(0.85) : Color.accentPrimary.opacity(0.36), lineWidth: 1.4)
            )
            .shadow(color: isPrimary ? Color.accentPrimary.opacity(0.22) : Color.black.opacity(0.06), radius: isPrimary ? 8 : 5, x: 0, y: 3)
            .contentShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(.plain)
        .frame(minHeight: 44)
        .contentShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private func iconName(for option: String) -> String? {
        switch option.lowercased().trimmingCharacters(in: .whitespacesAndNewlines) {
        case "open preview", "open approval", "открыть превью", "открыть апрув":
            return "rectangle.on.rectangle"
        case "view jobs", "open jobs", "jobs", "открыть задачи":
            return "list.bullet.rectangle"
        case "start another", "start over", "start fresh chat", "начать ещё":
            return "plus.circle.fill"
        case "retry", "try again", "retry generation", "повторить", "повторить генерацию":
            return "arrow.clockwise"
        case "refine plan", "refine style", "уточнить план", "уточнить стиль":
            return "slider.horizontal.3"
        case "open community", "открыть комьюнити":
            return "person.3.fill"
        case "export brief", "экспорт брифа":
            return "square.and.arrow.up"
        case "regenerate with changes", "перегенерировать с правками":
            return "wand.and.sparkles"
        default:
            return nil
        }
    }

    private func displayText(for option: String) -> String {
        guard languageCode == "ru" else { return option }
        switch option.lowercased().trimmingCharacters(in: .whitespacesAndNewlines) {
        case "animated r15 npc (recommended)", "animated r15 npc", "animated r15":
            return "Анимированный R15 NPC"
        case "static 3d mesh npc", "static 3d mesh":
            return "Статичный 3D Mesh NPC"
        case "moving 3d mesh npc (experimental)", "moving 3d mesh npc", "3d mesh npc":
            return "Движущийся 3D Mesh NPC"
        case "generate!", "generate now":
            return "Генерировать"
        case "change something", "change mode":
            return "Изменить"
        case "decide for me", "generate for me", "generate yourself":
            return "Реши за меня"
        case "view jobs", "open jobs", "jobs":
            return "Открыть задачи"
        case "start another", "start over", "start fresh chat":
            return "Начать ещё"
        case "open preview":
            return "Открыть превью"
        case "open approval":
            return "Открыть апрув"
        case "retry", "try again":
            return "Повторить"
        case "retry generation":
            return "Повторить генерацию"
        case "refine plan":
            return "Уточнить план"
        case "refine style":
            return "Уточнить стиль"
        case "add systems", "add more systems":
            return "Добавить системы"
        case "switch to interview":
            return "К интервью"
        case "switch to quick", "switch to quick generate":
            return "К быстрому режиму"
        case "open community":
            return "Открыть комьюнити"
        case "export brief":
            return "Экспорт брифа"
        case "regenerate with changes":
            return "Перегенерировать с правками"
        case "make it closer to prompt":
            return "Ближе к запросу"
        case "settings":
            return "Настройки"
        default:
            return option
        }
    }
}
