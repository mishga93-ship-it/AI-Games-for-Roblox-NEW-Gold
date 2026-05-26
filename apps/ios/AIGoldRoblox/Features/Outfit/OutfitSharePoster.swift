// OutfitSharePoster.swift — SwiftUI view rendered into a PNG poster by
// ImageRenderer (iOS 16+). 1080×1920 vertical, Instagram-Story / TikTok-
// friendly. Hero render (AI-rendered avatar in this fit) is the main
// visual; item thumbnails are pre-downloaded as UIImages so ImageRenderer
// snapshots them synchronously (AsyncImage doesn't work inside ImageRenderer).

import SwiftUI
import UIKit

@available(iOS 16.0, *)
struct OutfitSharePoster: View {
    let response: OutfitGenerationResponse
    let heroImage: UIImage?
    /// Pre-downloaded item thumbnails keyed by URL string.
    let thumbnails: [String: UIImage]

    var body: some View {
        ZStack(alignment: .top) {
            // Background — vertical gradient from the aesthetic accent into black.
            LinearGradient(
                colors: [posterAccent.opacity(0.95), .black],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()

            VStack(spacing: 0) {
                // Top band: hook + title
                VStack(alignment: .leading, spacing: 16) {
                    Text(response.appStoreHook)
                        .font(.system(size: 40, weight: .bold))
                        .foregroundColor(.orange)
                    Text(response.title.uppercased())
                        .font(.system(size: 112, weight: .black))
                        .foregroundColor(.white)
                        .minimumScaleFactor(0.6)
                        .lineLimit(1)
                    Text(response.localizedCaption)
                        .font(.system(size: 38, weight: .bold))
                        .foregroundColor(.white.opacity(0.95))
                        .lineLimit(2)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 60)
                .padding(.top, 80)

                // Hero render — the AI-painted avatar in the fit.
                heroBlock
                    .padding(.horizontal, 60)
                    .padding(.top, 32)

                // Items strip — small, supportive (NOT the hero).
                itemsStrip
                    .padding(.horizontal, 60)
                    .padding(.top, 32)

                Spacer(minLength: 0)

                // Footer: cost + branding
                HStack(alignment: .center, spacing: 24) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("TOTAL")
                            .font(.system(size: 26, weight: .semibold))
                            .foregroundColor(.white.opacity(0.6))
                        Text("\(response.totalCostRobux) R$")
                            .font(.system(size: 72, weight: .black))
                            .foregroundColor(.green)
                    }
                    if response.savedRobux > 0 {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("SAVED")
                                .font(.system(size: 26, weight: .semibold))
                                .foregroundColor(.white.opacity(0.6))
                            Text("\(response.savedRobux.formatted()) R$")
                                .font(.system(size: 72, weight: .black))
                                .foregroundColor(.orange)
                        }
                    }
                    Spacer()
                    Text("✨ Kami Gold")
                        .font(.system(size: 36, weight: .bold))
                        .foregroundColor(.white)
                }
                .padding(.horizontal, 60)
                .padding(.bottom, 60)
            }
        }
        .frame(width: 1080, height: 1920)
    }

    @ViewBuilder
    private var heroBlock: some View {
        if let hero = heroImage {
            Image(uiImage: hero)
                .resizable()
                .scaledToFit()
                .frame(maxWidth: 960, maxHeight: 960)
                .background(Color.white.opacity(0.05))
                .clipShape(RoundedRectangle(cornerRadius: 32))
                .overlay(
                    RoundedRectangle(cornerRadius: 32)
                        .stroke(Color.white.opacity(0.2), lineWidth: 2)
                )
        } else {
            // Hero unavailable — emphasize the item grid below.
            ZStack {
                Color.white.opacity(0.05)
                VStack(spacing: 12) {
                    Image(systemName: "sparkles")
                        .font(.system(size: 80))
                        .foregroundColor(.white.opacity(0.4))
                    Text("Outfit Assembled")
                        .font(.system(size: 32, weight: .bold))
                        .foregroundColor(.white.opacity(0.8))
                }
            }
            .frame(width: 960, height: 480)
            .clipShape(RoundedRectangle(cornerRadius: 32))
        }
    }

    private var itemsStrip: some View {
        // Horizontal row of up to 5 small thumbnails — supportive caption,
        // not the focal point. Real Roblox thumbnails come pre-downloaded.
        HStack(spacing: 16) {
            ForEach(response.items.prefix(5)) { item in
                VStack(spacing: 6) {
                    ZStack {
                        Color.white.opacity(0.08)
                        if let urlStr = item.thumbnailUrl, let img = thumbnails[urlStr] {
                            Image(uiImage: img)
                                .resizable()
                                .scaledToFit()
                                .padding(6)
                        } else {
                            Image(systemName: "sparkles")
                                .font(.system(size: 32))
                                .foregroundColor(.white.opacity(0.35))
                        }
                    }
                    .frame(width: 150, height: 150)
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                    Text(item.priceRobux == 0 ? "FREE" : "\(item.priceRobux) R$")
                        .font(.system(size: 18, weight: .bold))
                        .foregroundColor(item.priceRobux == 0 ? .green : .orange)
                }
            }
        }
    }

    private var posterAccent: Color {
        guard let a = OutfitAesthetic(rawValue: response.aestheticId) else { return .purple }
        return posterHex(a.accentHex)
    }
}

private func posterHex(_ rgb: String) -> Color {
    let h = rgb.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: "#", with: "")
    guard h.count == 6, let n = UInt64(h, radix: 16) else { return .purple }
    return Color(
        red: Double((n >> 16) & 0xff) / 255.0,
        green: Double((n >> 8) & 0xff) / 255.0,
        blue: Double(n & 0xff) / 255.0
    )
}
