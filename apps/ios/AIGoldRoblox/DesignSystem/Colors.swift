//
//  Colors.swift
//  AIGoldRoblox
//
//  Kami Aurora light theme

import SwiftUI

extension Color {
    // MARK: - Brand
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

    // MARK: - Gradient backgrounds
    static let gradientTop = brandCream
    static let gradientBottom = brandPaper

    // MARK: - Surfaces
    static let appBackground = brandCream
    static let cardBackground = Color(red: 0.98, green: 0.99, blue: 1.0).opacity(0.9)
    static let elevatedBackground = Color.white.opacity(0.96)

    // MARK: - Accents
    static let accentPrimary = brandVermillion
    static let accentSecondary = brandIndigo
    static let accentOrange = brandGold
    static let accentPink = brandElectricPink
    static let accentTeal = Color(red: 0.29, green: 0.62, blue: 0.84)
    static let neonGreen = brandGold
    static let neonBlue = brandElectricBlue
    static let neonPurple = brandViolet

    // MARK: - Text
    static let textPrimary = brandInk
    static let textSecondary = Color(red: 0.35, green: 0.42, blue: 0.49)
    static let textTertiary = Color(red: 0.56, green: 0.61, blue: 0.67)

    // MARK: - Buttons / pills
    static let pillBorder = accentPrimary.opacity(0.5)
    static let pillBackground = Color.white.opacity(0.9)

    // MARK: - Tab bar
    static let tabBarBackground = Color.white.opacity(0.95)

    // MARK: - Chat bubbles
    static let userBubble = accentPrimary.opacity(0.15)
    static let assistantBubble = Color.white.opacity(0.9)
    static let bubbleBorder = accentPrimary.opacity(0.3)

    // MARK: - Quick Reply
    static let quickReplyBackground = Color.white.opacity(0.85)
    static let quickReplyBorder = accentPrimary.opacity(0.3)

    // MARK: - Mic button
    static let micButtonFill = accentPrimary
    static let micButtonGlow = accentPrimary.opacity(0.4)
}
