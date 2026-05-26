// OutfitSharePoster.swift — SwiftUI view rendered into a PNG poster by
// ImageRenderer (iOS 16+). 1080×1920 vertical, Instagram-Story / TikTok-
// friendly. Goal: a single shareable image that captures the entire fit
// with branding, instead of a useless .txt file.

import SwiftUI

@available(iOS 16.0, *)
struct OutfitSharePoster: View {
    let response: OutfitGenerationResponse

    var body: some View {
        ZStack(alignment: .top) {
            // Background gradient matched to the aesthetic accent.
            LinearGradient(
                colors: [posterAccent.opacity(0.85), .black],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            VStack(alignment: .leading, spacing: 28) {
                // Hook tagline
                Text(response.appStoreHook)
                    .font(.system(size: 38, weight: .bold))
                    .foregroundColor(.orange)
                    .padding(.top, 60)

                // Aesthetic title
                Text(response.title.uppercased())
                    .font(.system(size: 96, weight: .black))
                    .foregroundColor(.white)
                    .minimumScaleFactor(0.5)
                    .lineLimit(2)

                Text(response.localizedCaption)
                    .font(.system(size: 44, weight: .bold))
                    .foregroundColor(.white.opacity(0.9))
                    .padding(.bottom, 20)

                // Item grid — up to 6 items, 2 columns
                LazyVGrid(columns: [
                    GridItem(.flexible(), spacing: 22),
                    GridItem(.flexible(), spacing: 22),
                ], spacing: 22) {
                    ForEach(response.items.prefix(6)) { item in
                        OutfitPosterItem(item: item)
                    }
                }

                Spacer(minLength: 0)

                // Footer: total cost + branding
                HStack(alignment: .center, spacing: 18) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("TOTAL")
                            .font(.system(size: 24, weight: .semibold))
                            .foregroundColor(.white.opacity(0.6))
                        Text("\(response.totalCostRobux) R$")
                            .font(.system(size: 64, weight: .black))
                            .foregroundColor(.green)
                    }
                    if response.savedRobux > 0 {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("SAVED")
                                .font(.system(size: 24, weight: .semibold))
                                .foregroundColor(.white.opacity(0.6))
                            Text("\(response.savedRobux.formatted()) R$")
                                .font(.system(size: 64, weight: .black))
                                .foregroundColor(.orange)
                        }
                        .padding(.leading, 32)
                    }
                    Spacer()
                    Text("✨ Kami Gold")
                        .font(.system(size: 32, weight: .bold))
                        .foregroundColor(.white)
                }
                .padding(.bottom, 60)
            }
            .padding(.horizontal, 60)
        }
        .frame(width: 1080, height: 1920)
    }

    private var posterAccent: Color {
        guard let a = OutfitAesthetic(rawValue: response.aestheticId) else { return .purple }
        return posterHex(a.accentHex)
    }
}

@available(iOS 16.0, *)
private struct OutfitPosterItem: View {
    let item: OutfitItem

    var body: some View {
        VStack(spacing: 8) {
            ZStack {
                Color.white.opacity(0.1)
                if let urlString = item.thumbnailUrl, let url = URL(string: urlString) {
                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .success(let img): img.resizable().scaledToFit()
                        default: thumbnailFallback
                        }
                    }
                } else {
                    thumbnailFallback
                }
            }
            .frame(width: 200, height: 200)
            .clipShape(RoundedRectangle(cornerRadius: 18))

            Text(item.name)
                .font(.system(size: 22, weight: .semibold))
                .foregroundColor(.white)
                .multilineTextAlignment(.center)
                .lineLimit(2)
                .frame(maxWidth: 220)

            Text(item.priceRobux == 0 ? "FREE" : "\(item.priceRobux) R$")
                .font(.system(size: 22, weight: .bold))
                .foregroundColor(item.priceRobux == 0 ? .green : .orange)
        }
    }

    private var thumbnailFallback: some View {
        ZStack {
            Color.white.opacity(0.05)
            Image(systemName: "sparkles")
                .font(.system(size: 60))
                .foregroundColor(.white.opacity(0.4))
        }
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
