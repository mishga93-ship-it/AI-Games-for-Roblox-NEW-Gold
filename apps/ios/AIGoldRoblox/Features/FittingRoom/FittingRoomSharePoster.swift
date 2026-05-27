// FittingRoomSharePoster.swift — 1080×1920 PNG poster rendered via
// ImageRenderer for TikTok / IG share (session 386).

import SwiftUI
import UIKit

@available(iOS 16.0, *)
struct FittingRoomSharePoster: View {
    let response: FittingRoomDocResponse
    let heroImage: UIImage?

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [posterAccent.opacity(0.95), .black],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            VStack(spacing: 24) {
                Spacer(minLength: 60)

                // Hook
                HStack {
                    Text("👕 ZERO-ROBUX FIT")
                        .font(.system(size: 38, weight: .black))
                        .foregroundColor(.yellow)
                    Spacer()
                    if response.fitOnUser {
                        Text("ON ME")
                            .font(.system(size: 26, weight: .black))
                            .padding(.horizontal, 18).padding(.vertical, 8)
                            .background(Color.green)
                            .foregroundColor(.white)
                            .clipShape(Capsule())
                    }
                }
                .padding(.horizontal, 60)

                // Big hero
                ZStack {
                    Color.black
                    if let img = heroImage {
                        Image(uiImage: img).resizable().scaledToFit()
                    } else {
                        Image(systemName: "person.crop.rectangle.stack.fill")
                            .font(.system(size: 140))
                            .foregroundColor(.white.opacity(0.4))
                    }
                }
                .frame(maxWidth: 960, maxHeight: 1100)
                .clipShape(RoundedRectangle(cornerRadius: 28))
                .padding(.horizontal, 60)

                // Title
                Text(response.title.uppercased())
                    .font(.system(size: 76, weight: .black))
                    .foregroundColor(.white)
                    .multilineTextAlignment(.center)
                    .minimumScaleFactor(0.6)
                    .lineLimit(2)
                    .padding(.horizontal, 60)

                Spacer()

                // Cost row
                HStack(spacing: 20) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("TOTAL")
                            .font(.system(size: 22, weight: .semibold))
                            .foregroundColor(.white.opacity(0.6))
                        Text("\(response.totalCostRobux) R$")
                            .font(.system(size: 64, weight: .black).monospacedDigit())
                            .foregroundColor(.green)
                    }
                    if response.savedRobux > 0 {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("SAVED")
                                .font(.system(size: 22, weight: .semibold))
                                .foregroundColor(.white.opacity(0.6))
                            Text("\(response.savedRobux.formatted()) R$")
                                .font(.system(size: 64, weight: .black).monospacedDigit())
                                .foregroundColor(.orange)
                        }
                        .padding(.leading, 24)
                    }
                    Spacer()
                }
                .padding(.horizontal, 60)

                HStack(spacing: 10) {
                    Image(systemName: "sparkles")
                    Text("Fitting room by Kami Gold AI")
                        .font(.system(size: 30, weight: .bold))
                }
                .foregroundColor(.white)
                .padding(.bottom, 60)
            }
        }
        .frame(width: 1080, height: 1920)
    }

    private var posterAccent: Color {
        guard let a = FittingRoomAesthetic(rawValue: response.aestheticId) else { return .purple }
        return fittingPosterHex(a.accentHex)
    }
}

private func fittingPosterHex(_ rgb: String) -> Color {
    let h = rgb.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: "#", with: "")
    guard h.count == 6, let n = UInt64(h, radix: 16) else { return .purple }
    return Color(
        red: Double((n >> 16) & 0xff) / 255.0,
        green: Double((n >> 8) & 0xff) / 255.0,
        blue: Double(n & 0xff) / 255.0
    )
}
