// VoiceAuraSharePoster.swift — 1080×1920 PNG poster rendered via
// ImageRenderer for TikTok / IG share (session 385).
//
// Anime-style hero poster — big aura preview, dramatic title, rarity badge,
// quoted share caption, branding. Designed to look like an OP-character
// reveal frame from an anime opening.

import SwiftUI
import UIKit

@available(iOS 16.0, *)
struct VoiceAuraSharePoster: View {
    let response: AuraGenerationResponse
    let mainImage: UIImage?

    var body: some View {
        ZStack {
            // Background — gradient + radial glow behind the avatar
            LinearGradient(
                colors: [posterAccent.opacity(0.95), .black],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            RadialGradient(
                colors: [posterAccent.opacity(0.6), .clear],
                center: .center,
                startRadius: 100,
                endRadius: 700
            )

            VStack(spacing: 24) {
                Spacer(minLength: 80)

                // Top — rarity + difficulty badges
                HStack(spacing: 12) {
                    Text(response.localizedRarity.uppercased())
                        .font(.system(size: 28, weight: .black))
                        .padding(.horizontal, 18).padding(.vertical, 8)
                        .background(Color.orange)
                        .foregroundColor(.white)
                        .clipShape(Capsule())
                    Text(response.difficulty.uppercased())
                        .font(.system(size: 28, weight: .black))
                        .padding(.horizontal, 18).padding(.vertical, 8)
                        .background(difficultyTint)
                        .foregroundColor(.white)
                        .clipShape(Capsule())
                }
                .padding(.horizontal, 60)

                // Hero — the aura
                ZStack {
                    Color.black
                    if let img = mainImage {
                        Image(uiImage: img).resizable().scaledToFit()
                    } else {
                        Image(systemName: "sparkles")
                            .font(.system(size: 140)).foregroundColor(.white.opacity(0.4))
                    }
                }
                .frame(maxWidth: 960, maxHeight: 960)
                .clipShape(RoundedRectangle(cornerRadius: 24))
                .overlay(RoundedRectangle(cornerRadius: 24).stroke(.white.opacity(0.25), lineWidth: 2))
                .padding(.horizontal, 60)

                // Title — bold huge
                Text(response.localizedTitle.uppercased())
                    .font(.system(size: 76, weight: .black))
                    .foregroundColor(.white)
                    .multilineTextAlignment(.center)
                    .minimumScaleFactor(0.6)
                    .lineLimit(2)
                    .padding(.horizontal, 60)

                Text(response.shareCaption)
                    .font(.system(size: 38, weight: .bold))
                    .foregroundColor(.white.opacity(0.92))
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 900)
                    .lineLimit(2)

                Spacer()

                // Footer branding
                HStack(spacing: 10) {
                    Image(systemName: "sparkles")
                    Text("Aura by Kami Gold AI")
                        .font(.system(size: 30, weight: .bold))
                }
                .foregroundColor(.white)
                .padding(.bottom, 60)
            }
        }
        .frame(width: 1080, height: 1920)
    }

    private var posterAccent: Color {
        guard let s = AuraStyle(rawValue: response.style) else { return .purple }
        return auraPosterHex(s.accentHex)
    }

    private var difficultyTint: Color {
        switch response.difficulty.lowercased() {
        case "easy":     return .green
        case "medium":   return .orange
        case "advanced": return .red
        default:         return .gray
        }
    }
}

private func auraPosterHex(_ rgb: String) -> Color {
    let h = rgb.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: "#", with: "")
    guard h.count == 6, let n = UInt64(h, radix: 16) else { return .purple }
    return Color(
        red: Double((n >> 16) & 0xff) / 255.0,
        green: Double((n >> 8) & 0xff) / 255.0,
        blue: Double(n & 0xff) / 255.0
    )
}
