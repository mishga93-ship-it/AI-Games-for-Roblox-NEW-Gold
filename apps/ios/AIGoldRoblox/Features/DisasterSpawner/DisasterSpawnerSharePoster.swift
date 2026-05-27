// DisasterSpawnerSharePoster.swift — 1080×1920 PNG poster (session 387).

import SwiftUI
import UIKit

@available(iOS 16.0, *)
struct DisasterSpawnerSharePoster: View {
    let response: DisasterGenerationResponse
    let mainImage: UIImage?

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [posterAccent.opacity(0.95), .black],
                startPoint: .topLeading, endPoint: .bottomTrailing
            ).ignoresSafeArea()

            VStack(spacing: 22) {
                Spacer(minLength: 70)

                HStack(spacing: 12) {
                    Text(response.localizedRarity.uppercased())
                        .font(.system(size: 26, weight: .black))
                        .padding(.horizontal, 16).padding(.vertical, 8)
                        .background(Color.orange).foregroundColor(.white)
                        .clipShape(Capsule())
                    Text(response.difficulty.uppercased())
                        .font(.system(size: 26, weight: .black))
                        .padding(.horizontal, 16).padding(.vertical, 8)
                        .background(difficultyTint).foregroundColor(.white)
                        .clipShape(Capsule())
                    Text("👥 \(response.recommendedPlayers)")
                        .font(.system(size: 22, weight: .bold))
                        .padding(.horizontal, 14).padding(.vertical, 7)
                        .background(Color.blue.opacity(0.25)).foregroundColor(.white)
                        .clipShape(Capsule())
                }
                .padding(.horizontal, 60)

                ZStack {
                    Color.black
                    if let img = mainImage {
                        Image(uiImage: img).resizable().scaledToFit()
                    } else {
                        Image(systemName: "tornado").font(.system(size: 140)).foregroundColor(.white.opacity(0.4))
                    }
                }
                .frame(maxWidth: 960, maxHeight: 960)
                .clipShape(RoundedRectangle(cornerRadius: 24))
                .overlay(RoundedRectangle(cornerRadius: 24).stroke(.white.opacity(0.25), lineWidth: 2))
                .padding(.horizontal, 60)

                Text(response.localizedTitle.uppercased())
                    .font(.system(size: 72, weight: .black))
                    .foregroundColor(.white)
                    .multilineTextAlignment(.center)
                    .minimumScaleFactor(0.55).lineLimit(2)
                    .padding(.horizontal, 60)

                Text(response.shareCaption)
                    .font(.system(size: 36, weight: .bold))
                    .foregroundColor(.white.opacity(0.92))
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 900).lineLimit(2)

                Spacer()

                HStack(spacing: 10) {
                    Image(systemName: "tornado")
                    Text("Disaster by Kami Gold AI")
                        .font(.system(size: 30, weight: .bold))
                }
                .foregroundColor(.white).padding(.bottom, 60)
            }
        }
        .frame(width: 1080, height: 1920)
    }

    private var posterAccent: Color {
        guard let m = DisasterMode(rawValue: response.mode) else { return .red }
        return disasterPosterHex(m.accentHex)
    }

    private var difficultyTint: Color {
        switch response.difficulty.lowercased() {
        case "easy":       return .green
        case "medium":     return .orange
        case "hard":       return .red
        case "impossible": return .purple
        default:           return .gray
        }
    }
}

private func disasterPosterHex(_ rgb: String) -> Color {
    let h = rgb.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: "#", with: "")
    guard h.count == 6, let n = UInt64(h, radix: 16) else { return .red }
    return Color(
        red: Double((n >> 16) & 0xff) / 255.0,
        green: Double((n >> 8) & 0xff) / 255.0,
        blue: Double(n & 0xff) / 255.0
    )
}
