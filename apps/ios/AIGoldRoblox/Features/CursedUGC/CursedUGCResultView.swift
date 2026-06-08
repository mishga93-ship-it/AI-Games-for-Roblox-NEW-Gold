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
        // Session 396 round 2 — pin the scroll content to the viewport width.
        // A vertical SwiftUI ScrollView will ALSO pan horizontally the moment
        // any child's intrinsic width exceeds the viewport (long AI-generated
        // title, a wide stat pill, etc.) — which is why the whole result UI
        // could be dragged left/right with the card cut off on the right.
        // Locking the padded content to `geo.size.width` makes the content
        // exactly viewport-wide, so the horizontal axis can never scroll while
        // the vertical scroll is unaffected.
        GeometryReader { geo in
            ScrollView {
                VStack(spacing: 16) {
                    marketplaceCard
                    variationsStrip
                    exportButton
                    makeMoreCursedButton
                    shareButton
                    tagsRow
                    footer
                }
                .padding(.horizontal, 16)
                .padding(.top, 60)
                .padding(.bottom, 30)
                .frame(width: geo.size.width)
            }
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

    private var hasFbxExport: Bool { !(response.fbxUrl ?? "").isEmpty }
    private var hasRbxmExport: Bool { !(response.rbxmUrl ?? "").isEmpty }

    // Session 406 — export the FINISHED 3D item. Priority:
    //   .fbx  — the real Roblox UGC upload format (Studio → Avatar → Import 3D);
    //           the deliverable promised to users, shown as the green headline.
    //   .rbxm — finished Studio item (drop-in MeshPart); shown alongside .fbx
    //           when both built so power users can open it directly in Studio.
    //   .glb  — universal 3D fallback, only when neither Roblox format built, so
    //           the user always gets a 3D file (never just the 2D concept).
    @ViewBuilder
    private var exportButton: some View {
        if hasFbxExport || hasRbxmExport || !(response.meshUrl ?? "").isEmpty {
            VStack(spacing: 10) {
                if let fbx = response.fbxUrl, !fbx.isEmpty {
                    Button(action: { studio.exportModelFile(urlString: fbx, fileExtension: "fbx") }) {
                        exportButtonLabel(
                            title: loc(en: "Export .fbx for Roblox",
                                       ru: "Экспорт .fbx для Roblox"),
                            subtitle: loc(en: "Real 3D item — import in Studio (Avatar → Import 3D) to publish as UGC",
                                          ru: "Настоящий 3D-айтем — импортни в Studio (Avatar → Import 3D) и публикуй как UGC"),
                            icon: "arrow.up.doc.fill",
                            primary: true
                        )
                    }
                }
                if let rbxm = response.rbxmUrl, !rbxm.isEmpty {
                    Button(action: { studio.exportModelFile(urlString: rbxm, fileExtension: "rbxm") }) {
                        exportButtonLabel(
                            title: loc(en: "Export .rbxm for Roblox Studio",
                                       ru: "Экспорт .rbxm для Roblox Studio"),
                            subtitle: loc(en: "Finished 3D item — drop straight into Studio",
                                          ru: "Готовый 3D-айтем — закинь прямо в Studio"),
                            icon: "cube.transparent.fill",
                            primary: !hasFbxExport
                        )
                    }
                }
                if !hasFbxExport, !hasRbxmExport, let glb = response.meshUrl, !glb.isEmpty {
                    Button(action: { studio.exportModelFile(urlString: glb, fileExtension: "glb") }) {
                        exportButtonLabel(
                            title: loc(en: "Export 3D model (.glb)",
                                       ru: "Экспорт 3D-модели (.glb)"),
                            subtitle: loc(en: "Open in any 3D tool or the Studio importer",
                                          ru: "Открой в любом 3D-редакторе или импортёре Studio"),
                            icon: "move.3d",
                            primary: true
                        )
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func exportButtonLabel(title: String, subtitle: String, icon: String, primary: Bool = true) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon).font(.title3.bold())
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.appHeadline.bold())
                Text(subtitle).font(.caption).opacity(0.9)
            }
            Spacer(minLength: 8)
            Image(systemName: "square.and.arrow.down.fill").font(.body.bold())
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 14).padding(.horizontal, 16)
        .background {
            if primary {
                LinearGradient(colors: [.green, .accentPrimary], startPoint: .leading, endPoint: .trailing)
            } else {
                Color.accentPrimary.opacity(0.12)
            }
        }
        .foregroundColor(primary ? .white : .accentPrimary)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

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
        // Session 390 round 15 — horizontal scroll + single-line chips so
        // tags never wrap mid-word («#curs ed» → «#cursed»). fixedSize keeps
        // each capsule sized to its text; the scroll view absorbs overflow
        // when 6 tags exceed the screen width.
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(response.tags.prefix(6), id: \.self) { tag in
                    Text("#" + tag)
                        .font(.caption.bold())
                        .lineLimit(1)
                        .fixedSize(horizontal: true, vertical: false)
                        .padding(.horizontal, 8).padding(.vertical, 4)
                        .background(Color.cardBackground)
                        .foregroundColor(.accentPrimary)
                        .clipShape(Capsule())
                }
            }
            .padding(.horizontal, 1)
        }
    }

    private var footer: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Session 390 round 15 — explicit brand tint. `.buttonStyle(.bordered)`
            // was inheriting the app's green accent (same green as the price
            // diamond / GENERATE button), making all three footer buttons
            // glow nuclear-green. Pin to accentPrimary (Kami brand blue) so
            // they read as secondary actions, not primary-green CTAs.
            HStack(spacing: 8) {
                Button(action: { studio.savePreviewToPhotos(urlString: response.mainImageUrl) }) {
                    Label(loc(en: "Save PNG", ru: "Скачать PNG"), systemImage: "square.and.arrow.down")
                        .font(.appBody)
                }
                .buttonStyle(.bordered)
                .tint(.accentPrimary)
                Button(action: studio.backToCustomize) {
                    Label(loc(en: "Tweak", ru: "Доработать"), systemImage: "slider.horizontal.3")
                        .font(.appBody)
                }
                .buttonStyle(.bordered)
                .tint(.accentPrimary)
                Button(action: studio.backToCategory) {
                    Label(loc(en: "New", ru: "Новый"), systemImage: "sparkles")
                        .font(.appBody)
                }
                .buttonStyle(.bordered)
                .tint(.accentPrimary)
            }
            Text(loc(
                en: "AI-generated 3D item. Export the .fbx and import it in Roblox Studio (Avatar → Import 3D) to publish it as your own UGC. The price & stats above are a stylized preview.",
                ru: "AI-сгенерированный 3D-айтем. Экспортни .fbx и импортни в Roblox Studio (Avatar → Import 3D), чтобы опубликовать как свой UGC. Цена и статы выше — стилизованное превью."
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
