// CursedUGCResultView.swift — result screen for Cursed UGC Modeler (session 384).
//
// The killer screen. Lays out:
//   • FAKE Roblox marketplace card with thumbnail, name, price, rarity badge
//   • Fake stats panel ("Wishlisted by 87K", "Trending #3", "Banned in 2")
//   • Variations strip (cuter / more_cursed)
//   • "MAKE MORE CURSED 💀" big button (the headline action)
//   • Share Outfit → image poster

import SwiftUI

struct CursedUGCResultView: View {
    @ObservedObject var studio: CursedUGCStudio
    let response: CursedUGCResponse

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                marketplaceCard
                variationsStrip
                makeMoreCursedButton
                shareButton
                tagsRow
                footer
            }
            .padding(.horizontal, 16)
            .padding(.top, 60)
            .padding(.bottom, 30)
        }
    }

    // MARK: - Fake Roblox Marketplace Card

    private var marketplaceCard: some View {
        VStack(spacing: 0) {
            // Rarity badge floating above
            HStack {
                Text(response.localizedRarity.uppercased())
                    .font(.caption2.bold())
                    .padding(.horizontal, 10).padding(.vertical, 5)
                    .background(Color.orange)
                    .foregroundColor(.white)
                    .clipShape(Capsule())
                Spacer()
                Text("UGC ✦")
                    .font(.caption2.bold())
                    .foregroundColor(.textSecondary)
            }
            .padding(.horizontal, 12)
            .padding(.top, 12)

            // Main visual — Session 390 round 14: render the Meshy GLB via
            // WebGLBViewer (WKWebView + Google <model-viewer>) — the SAME
            // component NPC chats use, which is why NPC 3D works while the
            // MDLAsset/RealModel3DPreview path was always blank (iOS
            // ModelIO can't import GLB: canImportGLB=false on device, proven
            // by round-12 console logs assetCount=0). model-viewer renders
            // GLB through WebGL with full textures + drag-rotate + pinch-zoom,
            // bypassing Apple's broken GLB importer entirely. Falls back to
            // the Meshy thumbnail / flux 2D only when there's no mesh URL.
            ZStack {
                Color.white
                if let meshURL = response.meshUrl.flatMap(URL.init(string:)) {
                    WebGLBViewer(modelURL: meshURL)
                        .background(Color.white)
                    // Small "3D — drag to rotate" hint pinned bottom-left so
                    // users discover the interactivity without instructions.
                    VStack {
                        Spacer()
                        HStack {
                            HStack(spacing: 5) {
                                Image(systemName: "rotate.3d")
                                    .font(.caption2.bold())
                                Text(loc(en: "3D — drag to rotate, pinch to zoom",
                                         ru: "3D — крути и зумь пальцами"))
                                    .font(.caption2.bold())
                            }
                            .padding(.horizontal, 8).padding(.vertical, 4)
                            .background(Color.black.opacity(0.55))
                            .foregroundColor(.white)
                            .clipShape(Capsule())
                            Spacer()
                        }
                        .padding(8)
                    }
                } else if let url = (response.meshThumbnailUrl ?? response.mainImageUrl).flatMap(URL.init(string:)) {
                    // No mesh URL (Meshy timed out) → show the Meshy thumbnail
                    // render (textured) when available, else the flux 2D concept.
                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .success(let img): img.resizable().scaledToFit()
                        case .failure: cursedPlaceholder
                        case .empty: ZStack { cursedPlaceholder; ProgressView() }
                        @unknown default: cursedPlaceholder
                        }
                    }
                } else {
                    cursedPlaceholder
                }
            }
            .frame(maxWidth: .infinity, minHeight: 320, maxHeight: 400)
            .clipped()

            // Name + creator + price
            VStack(alignment: .leading, spacing: 6) {
                Text(response.localizedTitle)
                    .font(.appHeadline.bold())
                    .foregroundColor(.textPrimary)
                HStack(spacing: 6) {
                    Text(loc(en: "By", ru: "От"))
                        .font(.caption).foregroundColor(.textSecondary)
                    Text("Kami Gold AI")
                        .font(.caption.bold()).foregroundColor(.accentPrimary)
                    Image(systemName: "checkmark.seal.fill")
                        .font(.caption).foregroundColor(.accentPrimary)
                }
                Text(response.localizedDescription)
                    .font(.appCaption)
                    .foregroundColor(.textSecondary)
                    .padding(.top, 4)

                // Big price
                HStack(spacing: 6) {
                    Image(systemName: "diamond.fill")
                        .font(.body)
                        .foregroundColor(.green)
                    Text("\(response.fakePriceRobux)")
                        .font(.appTitle2.bold().monospacedDigit())
                        .foregroundColor(.textPrimary)
                    Text("R$")
                        .font(.caption.bold()).foregroundColor(.textSecondary)
                    Spacer()
                    Text(loc(en: "Buy", ru: "Купить"))
                        .font(.appCaption.bold())
                        .foregroundColor(.white)
                        .padding(.horizontal, 14).padding(.vertical, 7)
                        .background(Color.green)
                        .clipShape(Capsule())
                }
                .padding(.top, 8)

                // Fake stats panel
                fakeStatsPanel
                    .padding(.top, 10)
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.bubbleBorder.opacity(0.3), lineWidth: 1))
        .shadow(color: .black.opacity(0.08), radius: 12, y: 4)
    }

    private var cursedPlaceholder: some View {
        ZStack {
            Color.cardBackground
            VStack(spacing: 6) {
                Image(systemName: "sparkles")
                    .font(.system(size: 60))
                    .foregroundColor(.textSecondary.opacity(0.5))
                Text(loc(en: "Cursed concept loading…", ru: "Cursed концепт грузится…"))
                    .font(.caption).foregroundColor(.textSecondary)
            }
        }
    }

    private var fakeStatsPanel: some View {
        VStack(spacing: 8) {
            HStack(spacing: 12) {
                statPill(icon: "heart.fill", value: response.fakeStats.wishlistedBy, label: loc(en: "Wishlisted", ru: "В вишлисте"), tint: .pink)
                statPill(icon: "chart.line.uptrend.xyaxis", value: "#\(response.fakeStats.trendingRank)", label: loc(en: "Trending", ru: "В тренде"), tint: .blue)
            }
            HStack(spacing: 12) {
                statPill(icon: "exclamationmark.octagon.fill", value: "\(response.fakeStats.bannedInCountries)", label: loc(en: "Banned in", ru: "Забанено в"), tint: .red)
                statPill(icon: "clock.fill", value: response.fakeStats.daysLeft, label: loc(en: "Available", ru: "Доступно"), tint: .orange)
            }
        }
    }

    private func statPill(icon: String, value: String, label: String, tint: Color) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon).font(.caption).foregroundColor(tint)
            VStack(alignment: .leading, spacing: 0) {
                Text(value).font(.caption.bold()).foregroundColor(.textPrimary)
                Text(label).font(.caption2).foregroundColor(.textSecondary)
            }
            Spacer()
        }
        .padding(.horizontal, 8).padding(.vertical, 6)
        .background(tint.opacity(0.1))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    // MARK: - Variations

    private var variationsStrip: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(loc(en: "Variations", ru: "Вариации"))
                .font(.appHeadline)
                .foregroundColor(.textPrimary)
            HStack(spacing: 10) {
                ForEach(response.variations) { v in
                    variationCard(v: v)
                }
            }
        }
    }

    private func variationCard(v: CursedUGCVariation) -> some View {
        VStack(spacing: 6) {
            ZStack {
                Color.cardBackground
                if let url = v.imageUrl.flatMap(URL.init(string:)) {
                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .success(let img): img.resizable().scaledToFit()
                        case .failure: Image(systemName: "sparkles").font(.system(size: 30)).foregroundColor(.textSecondary.opacity(0.4))
                        case .empty: ProgressView()
                        @unknown default: EmptyView()
                        }
                    }
                } else {
                    Image(systemName: "sparkles").font(.system(size: 30)).foregroundColor(.textSecondary.opacity(0.4))
                }
            }
            .frame(maxWidth: .infinity, minHeight: 130, maxHeight: 130)
            .clipShape(RoundedRectangle(cornerRadius: 10))
            Text(variationLabel(v.label))
                .font(.caption.bold())
                .foregroundColor(.textPrimary)
        }
    }

    private func variationLabel(_ label: String) -> String {
        switch label {
        case "cuter":       return loc(en: "Cuter 💖", ru: "Cuter 💖")
        case "more_cursed": return loc(en: "More Cursed 💀", ru: "More Cursed 💀")
        default:            return label
        }
    }

    // MARK: - Actions

    private var makeMoreCursedButton: some View {
        Button(action: { Task { await studio.generate(forceMoreCursed: true) } }) {
            HStack(spacing: 8) {
                Text("💀")
                Text(loc(en: "MAKE IT MORE CURSED", ru: "СДЕЛАТЬ ЕЩЁ ХУЖЕ"))
                    .font(.appHeadline.bold())
                Text("💀")
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(LinearGradient(colors: [.purple, .red], startPoint: .leading, endPoint: .trailing))
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
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(LinearGradient(colors: [.pink, .purple], startPoint: .leading, endPoint: .trailing))
            .foregroundColor(.white)
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }

    private var tagsRow: some View {
        HStack(spacing: 6) {
            ForEach(response.tags.prefix(6), id: \.self) { tag in
                Text("#" + tag)
                    .font(.caption.bold())
                    .padding(.horizontal, 8).padding(.vertical, 4)
                    .background(Color.cardBackground)
                    .foregroundColor(.accentPrimary)
                    .clipShape(Capsule())
            }
            Spacer()
        }
    }

    private var footer: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Button(action: { studio.savePreviewToPhotos(urlString: response.mainImageUrl) }) {
                    Label(loc(en: "Save PNG", ru: "Скачать PNG"), systemImage: "square.and.arrow.down")
                        .font(.appBody)
                }
                .buttonStyle(.bordered)
                Button(action: studio.backToCustomize) {
                    Label(loc(en: "Tweak", ru: "Доработать"), systemImage: "slider.horizontal.3")
                        .font(.appBody)
                }
                .buttonStyle(.bordered)
                Button(action: studio.backToCategory) {
                    Label(loc(en: "New", ru: "Новый"), systemImage: "sparkles")
                        .font(.appBody)
                }
                .buttonStyle(.bordered)
            }
            Text(loc(
                en: "Concept image generated by AI — NOT a real Roblox UGC item. Made for memes, not for upload.",
                ru: "Концепт сгенерирован AI — это НЕ настоящий Roblox UGC. Для мемов, не для upload."
            ))
                .font(.caption2)
                .foregroundColor(.textSecondary.opacity(0.7))
                .padding(.top, 8)
            Text("ID: \(response.generationId)")
                .font(.caption2.monospaced())
                .foregroundColor(.textSecondary.opacity(0.5))
        }
    }
}
