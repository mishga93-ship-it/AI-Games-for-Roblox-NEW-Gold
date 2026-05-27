// DisasterSpawnerResultView.swift — result screen (session 387).
// Hero gameplay screenshot + Lua viewer + drag-drop .rbxmx + variations
// + "Make More Chaotic" button + share poster.

import SwiftUI
import UIKit

struct DisasterSpawnerResultView: View {
    @ObservedObject var studio: DisasterSpawnerStudio
    let response: DisasterGenerationResponse
    @State private var luaExpanded = false
    @State private var instructionsExpanded = false

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                heroCard
                titleAndStats
                shareButton
                dropInRbxmxCard
                luaSection
                instructionsSection
                variationsStrip
                makeMoreChaoticButton
                footer
            }
            .padding(.horizontal, 16).padding(.top, 60).padding(.bottom, 30)
        }
    }

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
        .frame(maxWidth: .infinity).frame(minHeight: 320, maxHeight: 380)
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    private var heroFallback: some View {
        ZStack {
            LinearGradient(colors: [disasterHex(currentModeAccent), .black], startPoint: .top, endPoint: .bottom)
            VStack(spacing: 6) {
                Image(systemName: "tornado").font(.system(size: 60)).foregroundColor(.white.opacity(0.5))
                Text(loc(en: "Disaster preview unavailable", ru: "Preview недоступен"))
                    .font(.caption).foregroundColor(.white.opacity(0.6))
            }
        }
    }

    private var currentModeAccent: String {
        DisasterMode(rawValue: response.mode)?.accentHex ?? "8B0000"
    }

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
                Text("👥 \(response.recommendedPlayers)")
                    .font(.caption2.bold())
                    .padding(.horizontal, 8).padding(.vertical, 4)
                    .background(Color.blue.opacity(0.25))
                    .foregroundColor(.blue)
                    .clipShape(Capsule())
                Spacer()
            }
            Text(response.localizedTitle).font(.appTitle2.bold()).foregroundColor(.textPrimary)
            Text(response.shareCaption).font(.appCaption).foregroundColor(.textSecondary)
        }
    }

    private var difficultyColor: Color {
        switch response.difficulty.lowercased() {
        case "easy":       return .green
        case "medium":     return .orange
        case "hard":       return .red
        case "impossible": return .purple
        default:           return .gray
        }
    }

    @ViewBuilder
    private var dropInRbxmxCard: some View {
        if let urlStr = response.rbxmxUrl {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 6) {
                    Image(systemName: "arrow.down.doc.fill").foregroundColor(.green)
                    Text(loc(en: "Drag-and-drop into Studio", ru: "Drag-and-drop в Studio"))
                        .font(.appHeadline).foregroundColor(.textPrimary)
                    Spacer()
                    Text(loc(en: "FASTEST", ru: "БЫСТРО"))
                        .font(.caption2.bold())
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .background(Color.green).foregroundColor(.white)
                        .clipShape(Capsule())
                }
                Text(loc(
                    en: "Download .rbxmx → drag into ServerScriptService → Press Play. Disaster starts. Done.",
                    ru: "Скачай .rbxmx → перетащи в ServerScriptService → Play. Disaster пошла. Готово."
                ))
                    .font(.appCaption).foregroundColor(.textSecondary)
                Button(action: { studio.shareRbxmx(urlString: urlStr) }) {
                    Label(loc(en: "Download .rbxmx", ru: "Скачать .rbxmx"), systemImage: "square.and.arrow.down.fill")
                        .font(.appHeadline.bold())
                        .frame(maxWidth: .infinity).padding(.vertical, 12)
                        .background(LinearGradient(colors: [.green, .teal], startPoint: .leading, endPoint: .trailing))
                        .foregroundColor(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
            }
            .padding(12).background(Color.cardBackground).clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.green.opacity(0.4), lineWidth: 1.5))
        }
    }

    private var luaSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button(action: { withAnimation { luaExpanded.toggle() } }) {
                HStack(spacing: 6) {
                    Image(systemName: "chevron.left.forwardslash.chevron.right").foregroundColor(.accentPrimary)
                    Text(loc(en: "Or copy Lua manually", ru: "Или скопируй Lua вручную"))
                        .font(.appHeadline).foregroundColor(.textPrimary)
                    Spacer()
                    Image(systemName: luaExpanded ? "chevron.up" : "chevron.down").foregroundColor(.textSecondary)
                }
            }
            if luaExpanded {
                VStack(spacing: 6) {
                    DisasterLuaCodeView(code: response.luaScript)
                    HStack {
                        Button(action: { studio.copyLua() }) {
                            Label(loc(en: "Copy", ru: "Скопировать"), systemImage: "doc.on.doc")
                                .font(.appBody.bold())
                        }.buttonStyle(.borderedProminent)
                        if response.usedFallback {
                            Label(loc(en: "Safe fallback used", ru: "Safe fallback"), systemImage: "shield.fill")
                                .font(.caption.bold()).foregroundColor(.orange)
                        }
                        Spacer()
                    }
                }
            }
        }
    }

    private var instructionsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button(action: { withAnimation { instructionsExpanded.toggle() } }) {
                HStack {
                    Image(systemName: "list.number").foregroundColor(.accentPrimary)
                    Text(loc(en: "Setup in Roblox Studio", ru: "Setup в Roblox Studio"))
                        .font(.appHeadline).foregroundColor(.textPrimary)
                    Spacer()
                    Image(systemName: instructionsExpanded ? "chevron.up" : "chevron.down").foregroundColor(.textSecondary)
                }
            }
            if instructionsExpanded {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(Array(response.localizedInstructions.enumerated()), id: \.offset) { idx, step in
                        HStack(alignment: .top, spacing: 8) {
                            Text("\(idx + 1).")
                                .font(.appBody.monospacedDigit().bold())
                                .foregroundColor(.accentPrimary)
                            Text(step).font(.appBody).foregroundColor(.textPrimary)
                        }
                    }
                }
                .padding(12).background(Color.cardBackground).clipShape(RoundedRectangle(cornerRadius: 10))
            }
        }
    }

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
                                    default: Image(systemName: "tornado").foregroundColor(.textSecondary.opacity(0.4))
                                    }
                                }
                            } else {
                                Image(systemName: "tornado").foregroundColor(.textSecondary.opacity(0.4))
                            }
                        }
                        .frame(maxWidth: .infinity, minHeight: 130, maxHeight: 130)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                        Text(varLabel(v.label)).font(.caption.bold()).foregroundColor(.textPrimary)
                    }
                }
            }
        }
    }

    private func varLabel(_ s: String) -> String {
        switch s {
        case "extreme": return loc(en: "Extreme 💥", ru: "Extreme 💥")
        case "cursed":  return loc(en: "Cursed 💀", ru: "Cursed 💀")
        default:        return s
        }
    }

    private var makeMoreChaoticButton: some View {
        Button(action: { Task { await studio.generate(forceMoreChaotic: true) } }) {
            HStack(spacing: 8) {
                Text("💥")
                Text(loc(en: "MAKE IT MORE CHAOTIC", ru: "СДЕЛАТЬ ЕЩЁ ХАОТИЧНЕЕ")).font(.appHeadline.bold())
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
                    Label(loc(en: "New disaster", ru: "Новый disaster"), systemImage: "sparkles").font(.appBody)
                }.buttonStyle(.bordered)
            }
            Text(loc(
                en: "Lua script is safe: population cap MAX_ALIVE=30, auto-cleanup via Debris, bounded loop interval ≥ 5s. No networking, no exploits.",
                ru: "Lua безопасен: population cap MAX_ALIVE=30, auto-cleanup через Debris, bounded loop ≥ 5s. Никаких exploit'ов, никакого networking."
            ))
                .font(.caption2).foregroundColor(.textSecondary.opacity(0.7)).padding(.top, 8)
            Text("ID: \(response.generationId)")
                .font(.caption2.monospaced()).foregroundColor(.textSecondary.opacity(0.5))
        }
    }
}

// MARK: - Lua code view (same lightweight syntax as VoiceAura)

private struct DisasterLuaCodeView: View {
    let code: String

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

    private var attributed: AttributedString {
        var s = AttributedString(code)
        let keywords = ["local", "function", "end", "if", "then", "else", "elseif", "for", "do", "while", "return", "nil", "true", "false", "and", "or", "not"]
        let ns = code as NSString
        s.foregroundColor = Color(red: 0.86, green: 0.86, blue: 0.88)
        for kw in keywords {
            if let regex = try? NSRegularExpression(pattern: "\\b\(kw)\\b") {
                regex.enumerateMatches(in: code, range: NSRange(location: 0, length: ns.length)) { m, _, _ in
                    guard let r = m?.range, let asr = Range(r, in: s) else { return }
                    s[asr].foregroundColor = Color(red: 0.78, green: 0.56, blue: 1.0)
                    s[asr].font = .system(size: 12, weight: .semibold).monospaced()
                }
            }
        }
        if let regex = try? NSRegularExpression(pattern: "\"[^\"]*\"") {
            regex.enumerateMatches(in: code, range: NSRange(location: 0, length: ns.length)) { m, _, _ in
                guard let r = m?.range, let asr = Range(r, in: s) else { return }
                s[asr].foregroundColor = Color(red: 0.55, green: 0.92, blue: 0.60)
            }
        }
        if let regex = try? NSRegularExpression(pattern: "--[^\n]*") {
            regex.enumerateMatches(in: code, range: NSRange(location: 0, length: ns.length)) { m, _, _ in
                guard let r = m?.range, let asr = Range(r, in: s) else { return }
                s[asr].foregroundColor = Color(red: 0.55, green: 0.70, blue: 0.80)
                s[asr].font = .system(size: 12, weight: .regular).monospaced().italic()
            }
        }
        if let regex = try? NSRegularExpression(pattern: "\\b\\d+\\.?\\d*\\b") {
            regex.enumerateMatches(in: code, range: NSRange(location: 0, length: ns.length)) { m, _, _ in
                guard let r = m?.range, let asr = Range(r, in: s) else { return }
                s[asr].foregroundColor = Color(red: 1.0, green: 0.72, blue: 0.45)
            }
        }
        return s
    }
}
