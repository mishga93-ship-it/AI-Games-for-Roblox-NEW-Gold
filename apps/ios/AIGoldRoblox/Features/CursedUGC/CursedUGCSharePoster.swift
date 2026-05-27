// CursedUGCSharePoster.swift — 1080×1920 PNG poster rendered via
// ImageRenderer for TikTok/IG share (session 384).
//
// Designed to look like a LEAKED Roblox marketplace listing — white card,
// big thumbnail, price tag, rarity badge, fake stats panel, creator
// checkmark. "bro is this real???" energy.

import SwiftUI
import UIKit

@available(iOS 16.0, *)
struct CursedUGCSharePoster: View {
    let response: CursedUGCResponse
    let mainImage: UIImage?

    var body: some View {
        ZStack {
            // Dramatic background gradient — gives the screenshot context-energy
            LinearGradient(
                colors: [posterAccent.opacity(0.95), .black],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            VStack(spacing: 0) {
                Spacer(minLength: 60)

                // App store-style hook ribbon
                HStack {
                    Text("🔥 NEW ROBLOX UGC?")
                        .font(.system(size: 36, weight: .black))
                        .foregroundColor(.yellow)
                    Spacer()
                }
                .padding(.horizontal, 60)
                .padding(.bottom, 16)

                // FAKE marketplace card
                marketplaceCard
                    .padding(.horizontal, 60)

                Spacer(minLength: 24)

                // Footer — share caption + branding
                VStack(spacing: 8) {
                    Text(response.shareCaption)
                        .font(.system(size: 36, weight: .bold))
                        .foregroundColor(.white)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: 900)
                        .lineLimit(2)
                    HStack(spacing: 8) {
                        Image(systemName: "sparkles")
                        Text("Made with Kami Gold AI")
                            .font(.system(size: 28, weight: .bold))
                    }
                    .foregroundColor(.white.opacity(0.9))
                }
                .padding(.bottom, 60)
            }
        }
        .frame(width: 1080, height: 1920)
    }

    private var marketplaceCard: some View {
        VStack(spacing: 0) {
            // Top — rarity badge
            HStack {
                Text(response.localizedRarity.uppercased())
                    .font(.system(size: 22, weight: .black))
                    .padding(.horizontal, 16).padding(.vertical, 7)
                    .background(Color.orange)
                    .foregroundColor(.white)
                    .clipShape(Capsule())
                Spacer()
                Text("UGC ✦")
                    .font(.system(size: 22, weight: .bold))
                    .foregroundColor(.gray)
            }
            .padding(.horizontal, 24)
            .padding(.top, 24)

            // Hero image
            ZStack {
                Color.white
                if let img = mainImage {
                    Image(uiImage: img)
                        .resizable()
                        .scaledToFit()
                        .padding(20)
                } else {
                    Image(systemName: "sparkles")
                        .font(.system(size: 140))
                        .foregroundColor(.gray.opacity(0.4))
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: 720)

            // Title + creator
            VStack(alignment: .leading, spacing: 12) {
                Text(response.localizedTitle)
                    .font(.system(size: 44, weight: .black))
                    .foregroundColor(.black)
                    .lineLimit(2)
                HStack(spacing: 8) {
                    Text("By Kami Gold AI")
                        .font(.system(size: 22, weight: .bold))
                        .foregroundColor(.blue)
                    Image(systemName: "checkmark.seal.fill")
                        .font(.system(size: 22))
                        .foregroundColor(.blue)
                }
                Text(response.localizedDescription)
                    .font(.system(size: 22))
                    .foregroundColor(.black.opacity(0.7))
                    .lineLimit(3)
                    .padding(.top, 4)

                // Price row
                HStack(spacing: 12) {
                    HStack(spacing: 6) {
                        Image(systemName: "diamond.fill")
                            .font(.system(size: 28))
                            .foregroundColor(.green)
                        Text("\(response.fakePriceRobux)")
                            .font(.system(size: 56, weight: .black).monospacedDigit())
                            .foregroundColor(.black)
                        Text("R$")
                            .font(.system(size: 26, weight: .bold))
                            .foregroundColor(.gray)
                    }
                    Spacer()
                    Text("BUY")
                        .font(.system(size: 24, weight: .black))
                        .foregroundColor(.white)
                        .padding(.horizontal, 26).padding(.vertical, 12)
                        .background(Color.green)
                        .clipShape(Capsule())
                }
                .padding(.top, 12)

                // Fake stats row
                HStack(spacing: 12) {
                    posterStat(icon: "heart.fill", value: response.fakeStats.wishlistedBy, tint: .pink)
                    posterStat(icon: "chart.line.uptrend.xyaxis", value: "#\(response.fakeStats.trendingRank)", tint: .blue)
                    posterStat(icon: "exclamationmark.octagon.fill", value: "Banned ×\(response.fakeStats.bannedInCountries)", tint: .red)
                }
                .padding(.top, 12)
                Text(response.fakeStats.daysLeft)
                    .font(.system(size: 22, weight: .bold))
                    .foregroundColor(.red)
                    .padding(.top, 6)
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 28)
        }
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 24))
    }

    private func posterStat(icon: String, value: String, tint: Color) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 18))
                .foregroundColor(tint)
            Text(value)
                .font(.system(size: 20, weight: .bold))
                .foregroundColor(.black)
        }
        .padding(.horizontal, 10).padding(.vertical, 7)
        .background(tint.opacity(0.12))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private var posterAccent: Color {
        guard let c = CursedUGCCategory(rawValue: response.categoryId) else { return .purple }
        return cursedPosterHex(c.accentHex)
    }
}

private func cursedPosterHex(_ rgb: String) -> Color {
    let h = rgb.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: "#", with: "")
    guard h.count == 6, let n = UInt64(h, radix: 16) else { return .purple }
    return Color(
        red: Double((n >> 16) & 0xff) / 255.0,
        green: Double((n >> 8) & 0xff) / 255.0,
        blue: Double(n & 0xff) / 255.0
    )
}
