// VoiceAuraResultView.swift — result screen for Voice-to-Aura (session 385).
// Lays out:
//   • Hero aura preview (1080×1080 ratio in feed)
//   • Rarity + title + difficulty badge
//   • Lua code viewer (collapsible, monospaced, copy button)
//   • Setup instructions (numbered steps)
//   • Variations strip (op / cursed)
//   • "Make More Overpowered" button
//   • Share poster button + tags + footer

import SwiftUI
import UIKit

struct VoiceAuraResultView: View {
    @ObservedObject var studio: VoiceAuraStudio
    let response: AuraGenerationResponse
    @State private var luaExpanded = true
    @State private var instructionsExpanded = false

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                heroCard
                titleAndStats
                shareButton
                luaSection
                instructionsSection
                variationsStrip
                makeMoreOPButton
                footer
            }
            .padding(.horizontal, 16)
            .padding(.top, 60)
            .padding(.bottom, 30)
        }
    }

    // MARK: - Hero

    private var heroCard: some View {
        ZStack {
            Color.black
            if let url = response.previewUrl.flatMap(URL.init(string:)) {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let img): img.resizable().scaledToFit()
                    case .failure: heroFallback
                    case .empty: ZStack { heroFallback; ProgressView().tint(.white) }
                    @unknown default: heroFallback
                    }
                }
            } else {
                heroFallback
            }
        }
        .frame(maxWidth: .infinity)
        .frame(minHeight: 360, maxHeight: 420)
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    private var heroFallback: some View {
        ZStack {
            LinearGradient(colors: [auraHex(currentStyleAccent), .black], startPoint: .top, endPoint: .bottom)
            VStack(spacing: 6) {
                Image(systemName: "sparkles").font(.system(size: 60)).foregroundColor(.white.opacity(0.5))
                Text(loc(en: "Aura preview unavailable", ru: "Aura preview недоступен")).font(.caption).foregroundColor(.white.opacity(0.6))
            }
        }
    }

    private var currentStyleAccent: String {
        AuraStyle(rawValue: response.style)?.accentHex ?? "5C0D9C"
    }

    // MARK: - Title + meta badges

    private var titleAndStats: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Text(response.localizedRarity.uppercased())
                    .font(.caption2.bold())
                    .padding(.horizontal, 8).padding(.vertical, 4)
                    .background(Color.orange)
                    .foregroundColor(.white)
                    .clipShape(Capsule())
                Text(response.difficulty.uppercased())
                    .font(.caption2.bold())
                    .padding(.horizontal, 8).padding(.vertical, 4)
                    .background(difficultyColor)
                    .foregroundColor(.white)
                    .clipShape(Capsule())
                Spacer()
            }
            Text(response.localizedTitle)
                .font(.appTitle2.bold())
                .foregroundColor(.textPrimary)
            Text(response.shareCaption)
                .font(.appCaption)
                .foregroundColor(.textSecondary)
        }
    }

    private var difficultyColor: Color {
        switch response.difficulty.lowercased() {
        case "easy":     return .green
        case "medium":   return .orange
        case "advanced": return .red
        default:         return .gray
        }
    }

    // MARK: - Lua viewer

    private var luaSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button(action: { withAnimation { luaExpanded.toggle() } }) {
                HStack {
                    Image(systemName: "chevron.left.forwardslash.chevron.right")
                        .foregroundColor(.accentPrimary)
                    Text(loc(en: "Roblox Lua Script", ru: "Roblox Lua Script"))
                        .font(.appHeadline).foregroundColor(.textPrimary)
                    Spacer()
                    Image(systemName: luaExpanded ? "chevron.up" : "chevron.down")
                        .foregroundColor(.textSecondary)
                }
            }

            if luaExpanded {
                VStack(spacing: 6) {
                    LuaCodeView(code: response.luaScript)
                    HStack {
                        Button(action: { studio.copyLua() }) {
                            Label(loc(en: "Copy", ru: "Скопировать"), systemImage: "doc.on.doc")
                                .font(.appBody.bold())
                        }
                        .buttonStyle(.borderedProminent)
                        if response.safeUsedFallback {
                            Label(loc(en: "Safe fallback used", ru: "Safe fallback"), systemImage: "shield.fill")
                                .font(.caption.bold()).foregroundColor(.orange)
                        }
                        Spacer()
                    }
                }
            }
        }
    }

    // MARK: - Instructions

    private var instructionsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button(action: { withAnimation { instructionsExpanded.toggle() } }) {
                HStack {
                    Image(systemName: "list.number")
                        .foregroundColor(.accentPrimary)
                    Text(loc(en: "Setup in Roblox Studio", ru: "Setup в Roblox Studio"))
                        .font(.appHeadline).foregroundColor(.textPrimary)
                    Spacer()
                    Image(systemName: instructionsExpanded ? "chevron.up" : "chevron.down")
                        .foregroundColor(.textSecondary)
                }
            }
            if instructionsExpanded {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(Array(response.localizedInstructions.enumerated()), id: \.offset) { idx, step in
                        HStack(alignment: .top, spacing: 8) {
                            Text("\(idx + 1).")
                                .font(.appBody.monospacedDigit().bold())
                                .foregroundColor(.accentPrimary)
                            Text(step)
                                .font(.appBody)
                                .foregroundColor(.textPrimary)
                        }
                    }
                }
                .padding(12)
                .background(Color.cardBackground)
                .clipShape(RoundedRectangle(cornerRadius: 10))
            }
        }
    }

    // MARK: - Variations

    private var variationsStrip: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(loc(en: "Variations", ru: "Вариации"))
                .font(.appHeadline).foregroundColor(.textPrimary)
            HStack(spacing: 10) {
                ForEach(response.variations) { v in
                    VStack(spacing: 6) {
                        ZStack {
                            Color.cardBackground
                            if let url = v.imageUrl.flatMap(URL.init(string:)) {
                                AsyncImage(url: url) { phase in
                                    switch phase {
                                    case .success(let img): img.resizable().scaledToFit()
                                    case .empty: ProgressView()
                                    default: Image(systemName: "sparkles").foregroundColor(.textSecondary.opacity(0.4))
                                    }
                                }
                            } else {
                                Image(systemName: "sparkles").foregroundColor(.textSecondary.opacity(0.4))
                            }
                        }
                        .frame(maxWidth: .infinity, minHeight: 130, maxHeight: 130)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                        Text(variationLabel(v.label)).font(.caption.bold()).foregroundColor(.textPrimary)
                    }
                }
            }
        }
    }

    private func variationLabel(_ label: String) -> String {
        switch label {
        case "op":     return loc(en: "Overpowered 💥", ru: "Overpowered 💥")
        case "cursed": return loc(en: "Cursed 💀", ru: "Cursed 💀")
        default:       return label
        }
    }

    // MARK: - Actions

    private var makeMoreOPButton: some View {
        Button(action: { Task { await studio.generate(forceMoreOP: true) } }) {
            HStack(spacing: 8) {
                Text("💥")
                Text(loc(en: "MAKE IT MORE OVERPOWERED", ru: "СДЕЛАТЬ ЕЩЁ OP"))
                    .font(.appHeadline.bold())
                Text("💥")
            }
            .frame(maxWidth: .infinity).padding(.vertical, 14)
            .background(LinearGradient(colors: [.purple, .red, .orange], startPoint: .leading, endPoint: .trailing))
            .foregroundColor(.white)
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }

    private var shareButton: some View {
        Button(action: { studio.sharePoster() }) {
            HStack(spacing: 8) {
                Image(systemName: "square.and.arrow.up.fill")
                Text(loc(en: "Share to TikTok / IG", ru: "Шер в TikTok / IG"))
                    .font(.appHeadline.bold())
            }
            .frame(maxWidth: .infinity).padding(.vertical, 14)
            .background(LinearGradient(colors: [.pink, .purple], startPoint: .leading, endPoint: .trailing))
            .foregroundColor(.white)
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }

    private var footer: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Button(action: { studio.savePreviewToPhotos(urlString: response.previewUrl) }) {
                    Label(loc(en: "Save PNG", ru: "Скачать PNG"), systemImage: "square.and.arrow.down").font(.appBody)
                }.buttonStyle(.bordered)
                Button(action: studio.backToInput) {
                    Label(loc(en: "New aura", ru: "Новая aura"), systemImage: "sparkles").font(.appBody)
                }.buttonStyle(.bordered)
            }
            Text(loc(
                en: "Lua script is safe & beginner-friendly: only cosmetic ParticleEmitter on HumanoidRootPart. No networking, no exploits.",
                ru: "Lua безопасен и подходит для новичков: только cosmetic ParticleEmitter на HumanoidRootPart. Никаких exploit'ов, никакого networking."
            ))
                .font(.caption2).foregroundColor(.textSecondary.opacity(0.7)).padding(.top, 8)
            Text("ID: \(response.generationId)")
                .font(.caption2.monospaced()).foregroundColor(.textSecondary.opacity(0.5))
        }
    }
}

// MARK: - Lua code view (mono + minor syntax-ish coloring)

private struct LuaCodeView: View {
    let code: String
    private let lineHeight: CGFloat = 18

    var body: some View {
        ScrollView([.horizontal, .vertical], showsIndicators: true) {
            Text(attributed)
                .font(.system(size: 12, weight: .regular).monospaced())
                .padding(12)
                .textSelection(.enabled)
        }
        .frame(maxWidth: .infinity, maxHeight: 320)
        .background(Color.black.opacity(0.92))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    /// Lightweight Lua-ish coloring (keywords + strings + comments).
    private var attributed: AttributedString {
        var s = AttributedString(code)
        let keywords = ["local", "function", "end", "if", "then", "else", "elseif", "for", "do", "while", "return", "nil", "true", "false", "and", "or", "not"]
        let nsString = code as NSString

        // Default: light grey on dark
        s.foregroundColor = Color(red: 0.86, green: 0.86, blue: 0.88)

        // Keywords: violet
        for kw in keywords {
            let pattern = "\\b\(kw)\\b"
            if let regex = try? NSRegularExpression(pattern: pattern) {
                regex.enumerateMatches(in: code, range: NSRange(location: 0, length: nsString.length)) { match, _, _ in
                    guard let r = match?.range, let asr = Range(r, in: s) else { return }
                    s[asr].foregroundColor = Color(red: 0.78, green: 0.56, blue: 1.0)
                    s[asr].font = .system(size: 12, weight: .semibold).monospaced()
                }
            }
        }
        // Strings: green
        if let regex = try? NSRegularExpression(pattern: "\"[^\"]*\"") {
            regex.enumerateMatches(in: code, range: NSRange(location: 0, length: nsString.length)) { match, _, _ in
                guard let r = match?.range, let asr = Range(r, in: s) else { return }
                s[asr].foregroundColor = Color(red: 0.55, green: 0.92, blue: 0.60)
            }
        }
        // Comments: faded grey-blue
        if let regex = try? NSRegularExpression(pattern: "--[^\n]*") {
            regex.enumerateMatches(in: code, range: NSRange(location: 0, length: nsString.length)) { match, _, _ in
                guard let r = match?.range, let asr = Range(r, in: s) else { return }
                s[asr].foregroundColor = Color(red: 0.55, green: 0.70, blue: 0.80)
                s[asr].font = .system(size: 12, weight: .regular).monospaced().italic()
            }
        }
        // Numbers: orange
        if let regex = try? NSRegularExpression(pattern: "\\b\\d+\\.?\\d*\\b") {
            regex.enumerateMatches(in: code, range: NSRange(location: 0, length: nsString.length)) { match, _, _ in
                guard let r = match?.range, let asr = Range(r, in: s) else { return }
                s[asr].foregroundColor = Color(red: 1.0, green: 0.72, blue: 0.45)
            }
        }
        return s
    }
}
