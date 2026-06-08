//
//  Colors.swift
//  AIGoldRoblox
//
//  Theme-driven palette. Semantic tokens read from the active `ThemePalette`
//  (see AppTheme.swift), so switching the theme re-skins the whole app without
//  touching call-sites. Brand colors below are fixed identity and never themed.

import SwiftUI

extension Color {
    // MARK: - Brand (fixed identity — theme-independent)
    static let brandCream = Color(red: 0.96, green: 0.98, blue: 1.0)        // #F5FAFF
    static let brandPaper = Color(red: 0.92, green: 0.95, blue: 1.0)        // #EBF2FF
    static let brandInk = Color(red: 0.11, green: 0.16, blue: 0.22)         // #1B2838
    static let brandIndigo = Color(red: 0.18, green: 0.42, blue: 0.62)      // #2E6B9E
    static let brandVermillion = Color(red: 0.09, green: 0.72, blue: 1.0)   // legacy alias, now #17B8FF
    static let brandGold = Color(red: 0.31, green: 0.94, blue: 0.76)        // legacy alias, now #4FEFC2
    static let brandNight = Color(red: 0.03, green: 0.04, blue: 0.10)       // #080A19
    static let brandViolet = Color(red: 0.31, green: 0.18, blue: 0.78)      // #4F2EC7
    static let brandElectricBlue = Color(red: 0.09, green: 0.72, blue: 1.0) // #17B8FF
    static let brandElectricPink = Color(red: 0.84, green: 0.26, blue: 1.0) // #D642FF
    static let brandSolar = Color(red: 0.31, green: 0.94, blue: 0.76)       // legacy alias, now #4FEFC2

    // MARK: - Gradient backgrounds (themed)
    static var gradientTop: Color { ThemePalette.current.gradientTop }
    static var gradientBottom: Color { ThemePalette.current.gradientBottom }

    // MARK: - Surfaces (themed)
    static var appBackground: Color { ThemePalette.current.appBackground }
    static var cardBackground: Color { ThemePalette.current.cardBackground }
    static var elevatedBackground: Color { ThemePalette.current.elevatedBackground }

    // MARK: - Accents (themed)
    static var accentPrimary: Color { ThemePalette.current.accentPrimary }
    static var accentSecondary: Color { ThemePalette.current.accentSecondary }
    static var accentOrange: Color { ThemePalette.current.accentOrange }
    static var accentPink: Color { ThemePalette.current.accentPink }
    static var accentTeal: Color { ThemePalette.current.accentTeal }
    static var neonGreen: Color { ThemePalette.current.neonGreen }
    static var neonBlue: Color { ThemePalette.current.neonBlue }
    static var neonPurple: Color { ThemePalette.current.neonPurple }

    // MARK: - Text (themed)
    static var textPrimary: Color { ThemePalette.current.textPrimary }
    static var textSecondary: Color { ThemePalette.current.textSecondary }
    static var textTertiary: Color { ThemePalette.current.textTertiary }

    // MARK: - Buttons / pills
    static var pillBorder: Color { accentPrimary.opacity(0.5) }
    static var pillBackground: Color { ThemePalette.current.pillBackground }

    // MARK: - Tab bar
    static var tabBarBackground: Color { ThemePalette.current.tabBarBackground }

    // MARK: - Chat bubbles
    static var userBubble: Color { accentPrimary.opacity(0.15) }
    static var assistantBubble: Color { ThemePalette.current.assistantBubble }
    static var bubbleBorder: Color { accentPrimary.opacity(0.3) }

    // MARK: - Quick Reply
    static var quickReplyBackground: Color { ThemePalette.current.quickReplyBackground }
    static var quickReplyBorder: Color { accentPrimary.opacity(0.3) }

    // MARK: - Docked bars (chat top/bottom)
    static var dockSurface: Color { ThemePalette.current.dockSurface }

    // MARK: - Mic button
    static var micButtonFill: Color { accentPrimary }
    static var micButtonGlow: Color { accentPrimary.opacity(0.4) }
}

// MARK: - Theme identity

/// Runtime theming. The whole app routes through the named `Color` tokens above,
/// so re-skinning is done by swapping the *source* palette — no view call-sites
/// change. `.light` reproduces the original "Kami Aurora" values exactly, so the
/// default look is unchanged.
enum AppTheme: String, CaseIterable, Identifiable {
    case light
    case obsidian
    case titan
    case neon

    var id: String { rawValue }

    /// Dark themes drive `.preferredColorScheme(.dark)` so system-rendered
    /// chrome (status bar, keyboard, default text) flips to match.
    var isDark: Bool { self != .light }

    var colorScheme: ColorScheme { isDark ? .dark : .light }

    var palette: ThemePalette {
        switch self {
        case .light: return .light
        case .obsidian: return .obsidian
        case .titan: return .titan
        case .neon: return .neon
        }
    }

    var displayName: String {
        switch self {
        case .light: return "Light"
        case .obsidian: return "Obsidian"
        case .titan: return "Titan"
        case .neon: return "Neon"
        }
    }

    func subtitle(isRu: Bool) -> String {
        switch self {
        case .light: return isRu ? "Дневная — как сейчас" : "Daytime — current look"
        case .obsidian: return isRu ? "Глубокий сине-чёрный" : "Deep blue-black"
        case .titan: return isRu ? "Графитовый металл" : "Graphite metal"
        case .neon: return isRu ? "Кибер-фиолет с неоном" : "Cyber violet, neon glow"
        }
    }

    var symbolName: String {
        switch self {
        case .light: return "sun.max.fill"
        case .obsidian: return "moon.stars.fill"
        case .titan: return "circle.lefthalf.filled"
        case .neon: return "sparkles"
        }
    }
}

// MARK: - Palette

/// Theme-driven base colors. Derived shades (borders, bubble tints, glows) are
/// computed from `Color.accentPrimary` above, so they are NOT stored here — they
/// adapt automatically.
struct ThemePalette {
    let gradientTop: Color
    let gradientBottom: Color
    let appBackground: Color
    let cardBackground: Color
    let elevatedBackground: Color
    let accentPrimary: Color
    let accentSecondary: Color
    let accentOrange: Color
    let accentPink: Color
    let accentTeal: Color
    let neonGreen: Color
    let neonBlue: Color
    let neonPurple: Color
    let textPrimary: Color
    let textSecondary: Color
    let textTertiary: Color
    let pillBackground: Color
    let tabBarBackground: Color
    let assistantBubble: Color
    let quickReplyBackground: Color
    /// Translucent surface for docked top/bottom bars (Generation mode header,
    /// Text Chat composer) over the gradient — tinted per theme so it reads as a
    /// soft raised panel, never a mismatched grey.
    let dockSurface: Color

    /// The active palette. The `Color` tokens above read through this; ThemeManager
    /// swaps it synchronously before SwiftUI re-renders. Defaults to `.light` so any
    /// color read before ThemeManager initializes matches today's behavior.
    static var current: ThemePalette = .light
}

extension ThemePalette {
    // Original "Kami Aurora light theme" values — byte-identical to the
    // pre-theming tokens so the light look is unchanged.
    static let light = ThemePalette(
        gradientTop: Color(red: 0.96, green: 0.98, blue: 1.0),
        gradientBottom: Color(red: 0.92, green: 0.95, blue: 1.0),
        appBackground: Color(red: 0.96, green: 0.98, blue: 1.0),
        cardBackground: Color(red: 0.98, green: 0.99, blue: 1.0).opacity(0.9),
        elevatedBackground: Color.white.opacity(0.96),
        accentPrimary: Color(red: 0.09, green: 0.72, blue: 1.0),
        accentSecondary: Color(red: 0.18, green: 0.42, blue: 0.62),
        accentOrange: Color(red: 0.31, green: 0.94, blue: 0.76),
        accentPink: Color(red: 0.84, green: 0.26, blue: 1.0),
        accentTeal: Color(red: 0.29, green: 0.62, blue: 0.84),
        neonGreen: Color(red: 0.31, green: 0.94, blue: 0.76),
        neonBlue: Color(red: 0.09, green: 0.72, blue: 1.0),
        neonPurple: Color(red: 0.31, green: 0.18, blue: 0.78),
        textPrimary: Color(red: 0.11, green: 0.16, blue: 0.22),
        textSecondary: Color(red: 0.35, green: 0.42, blue: 0.49),
        textTertiary: Color(red: 0.56, green: 0.61, blue: 0.67),
        pillBackground: Color.white.opacity(0.9),
        tabBarBackground: Color.white.opacity(0.95),
        assistantBubble: Color.white.opacity(0.9),
        quickReplyBackground: Color.white.opacity(0.85),
        dockSurface: Color.white.opacity(0.6)
    )

    // Deep blue-black volcanic glass; electric-blue accent.
    static let obsidian = ThemePalette(
        gradientTop: Color(red: 0.07, green: 0.09, blue: 0.13),
        gradientBottom: Color(red: 0.03, green: 0.04, blue: 0.07),
        appBackground: Color(red: 0.05, green: 0.06, blue: 0.09),
        cardBackground: Color(red: 0.11, green: 0.13, blue: 0.18).opacity(0.94),
        elevatedBackground: Color(red: 0.15, green: 0.17, blue: 0.23),
        accentPrimary: Color(red: 0.16, green: 0.74, blue: 1.0),
        accentSecondary: Color(red: 0.40, green: 0.58, blue: 0.82),
        accentOrange: Color(red: 0.34, green: 0.95, blue: 0.78),
        accentPink: Color(red: 0.86, green: 0.36, blue: 1.0),
        accentTeal: Color(red: 0.36, green: 0.74, blue: 0.92),
        neonGreen: Color(red: 0.34, green: 0.95, blue: 0.78),
        neonBlue: Color(red: 0.16, green: 0.74, blue: 1.0),
        neonPurple: Color(red: 0.51, green: 0.40, blue: 0.94),
        textPrimary: Color(red: 0.91, green: 0.94, blue: 1.0),
        textSecondary: Color(red: 0.64, green: 0.70, blue: 0.80),
        textTertiary: Color(red: 0.44, green: 0.49, blue: 0.59),
        pillBackground: Color.white.opacity(0.08),
        tabBarBackground: Color(red: 0.08, green: 0.10, blue: 0.15).opacity(0.96),
        assistantBubble: Color.white.opacity(0.07),
        quickReplyBackground: Color.white.opacity(0.07),
        dockSurface: Color(red: 0.12, green: 0.15, blue: 0.22).opacity(0.72)
    )

    // Gunmetal / graphite metallic; steel-cyan accent, warm titanium amber.
    static let titan = ThemePalette(
        gradientTop: Color(red: 0.13, green: 0.14, blue: 0.16),
        gradientBottom: Color(red: 0.06, green: 0.07, blue: 0.08),
        appBackground: Color(red: 0.10, green: 0.11, blue: 0.13),
        cardBackground: Color(red: 0.16, green: 0.18, blue: 0.21).opacity(0.95),
        elevatedBackground: Color(red: 0.22, green: 0.24, blue: 0.28),
        accentPrimary: Color(red: 0.40, green: 0.78, blue: 0.86),
        accentSecondary: Color(red: 0.55, green: 0.62, blue: 0.70),
        accentOrange: Color(red: 0.95, green: 0.72, blue: 0.42),
        accentPink: Color(red: 0.85, green: 0.45, blue: 0.70),
        accentTeal: Color(red: 0.40, green: 0.78, blue: 0.86),
        neonGreen: Color(red: 0.55, green: 0.85, blue: 0.70),
        neonBlue: Color(red: 0.40, green: 0.78, blue: 0.86),
        neonPurple: Color(red: 0.60, green: 0.55, blue: 0.80),
        textPrimary: Color(red: 0.95, green: 0.96, blue: 0.97),
        textSecondary: Color(red: 0.68, green: 0.71, blue: 0.76),
        textTertiary: Color(red: 0.47, green: 0.51, blue: 0.56),
        pillBackground: Color.white.opacity(0.08),
        tabBarBackground: Color(red: 0.12, green: 0.13, blue: 0.15).opacity(0.96),
        assistantBubble: Color.white.opacity(0.07),
        quickReplyBackground: Color.white.opacity(0.07),
        dockSurface: Color(red: 0.20, green: 0.22, blue: 0.26).opacity(0.72)
    )

    // Cyberpunk deep-violet black; electric pink / violet, neon cyan.
    static let neon = ThemePalette(
        gradientTop: Color(red: 0.09, green: 0.05, blue: 0.18),
        gradientBottom: Color(red: 0.04, green: 0.02, blue: 0.10),
        appBackground: Color(red: 0.06, green: 0.03, blue: 0.13),
        cardBackground: Color(red: 0.13, green: 0.08, blue: 0.24).opacity(0.94),
        elevatedBackground: Color(red: 0.18, green: 0.11, blue: 0.31),
        accentPrimary: Color(red: 0.84, green: 0.26, blue: 1.0),
        accentSecondary: Color(red: 0.49, green: 0.36, blue: 0.95),
        accentOrange: Color(red: 0.31, green: 0.94, blue: 0.76),
        accentPink: Color(red: 0.95, green: 0.35, blue: 0.85),
        accentTeal: Color(red: 0.25, green: 0.85, blue: 0.95),
        neonGreen: Color(red: 0.35, green: 0.98, blue: 0.65),
        neonBlue: Color(red: 0.25, green: 0.70, blue: 1.0),
        neonPurple: Color(red: 0.62, green: 0.40, blue: 1.0),
        textPrimary: Color(red: 0.96, green: 0.93, blue: 1.0),
        textSecondary: Color(red: 0.74, green: 0.66, blue: 0.90),
        textTertiary: Color(red: 0.52, green: 0.46, blue: 0.68),
        pillBackground: Color.white.opacity(0.09),
        tabBarBackground: Color(red: 0.08, green: 0.04, blue: 0.16).opacity(0.96),
        assistantBubble: Color.white.opacity(0.08),
        quickReplyBackground: Color.white.opacity(0.08),
        dockSurface: Color(red: 0.17, green: 0.10, blue: 0.30).opacity(0.72)
    )
}

// MARK: - Manager

/// Persists the chosen theme and keeps `ThemePalette.current` in sync. Injected
/// as an `@EnvironmentObject` at the app root; RootView observes it to drive a
/// clean re-theme (`.id`) and `.preferredColorScheme`.
final class ThemeManager: ObservableObject {
    static let storageKey = "appTheme"

    @Published var theme: AppTheme {
        didSet {
            guard oldValue != theme else { return }
            ThemePalette.current = theme.palette
            UserDefaults.standard.set(theme.rawValue, forKey: Self.storageKey)
        }
    }

    var colorScheme: ColorScheme { theme.colorScheme }

    init() {
        let stored = UserDefaults.standard.string(forKey: Self.storageKey)
            .flatMap(AppTheme.init(rawValue:)) ?? .light
        theme = stored
        ThemePalette.current = stored.palette
    }
}
