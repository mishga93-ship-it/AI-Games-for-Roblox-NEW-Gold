// FittingRoomResultView.swift — pseudo-3D fitting room result screen
// (session 386).
//
// Killer screen:
//   • Big avatar preview with SWIPE-TO-ROTATE between front / 3/4 / back.
//   • Smooth opacity cross-fade transitions = pseudo-3D illusion.
//   • Page-dots indicator + tappable.
//   • Fit-on-user badge if real Roblox avatar was used.
//   • Cost breakdown: total + saved + fake rarity tier.
//   • Items list (reused OutfitItem rows).
//   • Remix buttons: More Cursed / More Clean / Budget.
//   • Share to TikTok poster.

import SwiftUI

struct FittingRoomResultView: View {
    @ObservedObject var studio: FittingRoomStudio
    let response: FittingRoomDocResponse

    @State private var currentAngle: Int = 0
    @GestureState private var dragX: CGFloat = 0

    private var renders: [String?] {
        [response.renders.front, response.renders.threeQuarter, response.renders.back]
    }
    private var angleLabels: [String] {
        [
            loc(en: "Front", ru: "Спереди"),
            loc(en: "3/4",   ru: "3/4"),
            loc(en: "Back",  ru: "Сзади"),
        ]
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                header
                rotatablePreview
                angleDots
                savingsRow
                shareButton
                remixRow
                itemsList
                footer
            }
            .padding(.horizontal, 16).padding(.top, 60).padding(.bottom, 30)
        }
    }

    // MARK: - Header

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                Text(response.appStoreHook)
                    .font(.appCaption.bold()).foregroundColor(.orange)
                Spacer()
                if response.fitOnUser {
                    Label(loc(en: "ON YOU", ru: "НА ТЕБЕ"), systemImage: "checkmark.seal.fill")
                        .font(.caption2.bold())
                        .padding(.horizontal, 8).padding(.vertical, 3)
                        .background(Color.green)
                        .foregroundColor(.white)
                        .clipShape(Capsule())
                }
            }
            Text(response.title)
                .font(.appTitle2.bold()).foregroundColor(.textPrimary)
            Text(response.localizedPitch)
                .font(.appCaption).foregroundColor(.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Rotatable pseudo-3D preview

    private var rotatablePreview: some View {
        GeometryReader { geo in
            let w = geo.size.width
            ZStack {
                Color.black
                ForEach(0..<renders.count, id: \.self) { i in
                    if let urlStr = renders[i], let url = URL(string: urlStr) {
                        AsyncImage(url: url) { phase in
                            switch phase {
                            case .success(let img): img.resizable().scaledToFit()
                            case .failure: placeholderFor(i: i)
                            case .empty: ZStack { placeholderFor(i: i); ProgressView().tint(.white) }
                            @unknown default: placeholderFor(i: i)
                            }
                        }
                        .opacity(opacity(forIndex: i, w: w))
                        .scaleEffect(scale(forIndex: i, w: w))
                    } else {
                        placeholderFor(i: i)
                            .opacity(opacity(forIndex: i, w: w))
                    }
                }
                // Angle label
                VStack {
                    HStack {
                        Spacer()
                        Text(angleLabels[currentAngle])
                            .font(.caption.bold())
                            .padding(.horizontal, 10).padding(.vertical, 5)
                            .background(Color.black.opacity(0.7))
                            .foregroundColor(.white)
                            .clipShape(Capsule())
                            .padding(12)
                    }
                    Spacer()
                }
            }
            .frame(width: geo.size.width, height: geo.size.width * 1.2)
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .gesture(
                DragGesture()
                    .updating($dragX) { value, state, _ in state = value.translation.width }
                    .onEnded { value in
                        let delta = value.translation.width
                        if delta < -50 && currentAngle < renders.count - 1 {
                            withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) {
                                currentAngle += 1
                            }
                        } else if delta > 50 && currentAngle > 0 {
                            withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) {
                                currentAngle -= 1
                            }
                        }
                    }
            )
        }
        .aspectRatio(0.83, contentMode: .fit)
    }

    /// Soft pseudo-3D cross-fade: the "current" angle is fully opaque, the
    /// in-drag neighbor fades in proportional to drag offset.
    private func opacity(forIndex i: Int, w: CGFloat) -> Double {
        let progress = Double(-dragX / w)   // -1..1 typically (within drag)
        let target = Double(currentAngle) + progress
        let dist = abs(target - Double(i))
        return max(0, 1 - dist)
    }
    private func scale(forIndex i: Int, w: CGFloat) -> CGFloat {
        let progress = -dragX / w
        let target = CGFloat(currentAngle) + progress
        let dist = abs(target - CGFloat(i))
        return 1.0 - min(0.05, dist * 0.05)
    }

    private func placeholderFor(i: Int) -> some View {
        ZStack {
            LinearGradient(
                colors: [fitHex(currentStyleAccent), .black],
                startPoint: .top, endPoint: .bottom
            )
            VStack(spacing: 6) {
                ProgressView().tint(.white)
                Text("Rendering \(angleLabels[i])…")
                    .font(.caption).foregroundColor(.white.opacity(0.7))
            }
        }
    }

    private var currentStyleAccent: String {
        FittingRoomAesthetic(rawValue: response.aestheticId)?.accentHex ?? "5C0D9C"
    }

    private var angleDots: some View {
        HStack(spacing: 8) {
            ForEach(0..<renders.count, id: \.self) { i in
                Circle()
                    .fill(i == currentAngle ? Color.accentPrimary : Color.bubbleBorder.opacity(0.3))
                    .frame(width: 8, height: 8)
                    .onTapGesture {
                        withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) {
                            currentAngle = i
                        }
                    }
            }
        }
    }

    // MARK: - Savings + cost

    private var savingsRow: some View {
        HStack(spacing: 8) {
            badge(text: "Cost \(response.totalCostRobux) R$", icon: "creditcard", tint: .green)
            if response.savedRobux > 0 {
                badge(text: "Saved \(response.savedRobux.formatted()) R$", icon: "tag.fill", tint: .orange)
            }
            badge(text: "\(response.items.count) items", icon: "tshirt.fill", tint: .blue)
        }
    }

    private func badge(text: String, icon: String, tint: Color) -> some View {
        Label(text, systemImage: icon)
            .font(.caption.bold())
            .padding(.horizontal, 8).padding(.vertical, 5)
            .background(tint.opacity(0.18)).foregroundColor(tint)
            .clipShape(Capsule())
    }

    // MARK: - Share + Remix

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

    private var remixRow: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(loc(en: "Remix this fit", ru: "Remix этот фит"))
                .font(.appHeadline).foregroundColor(.textPrimary)
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                remixButton(label: loc(en: "🔄 Remix", ru: "🔄 Remix"), mode: .remix)
                remixButton(label: loc(en: "💰 Budget", ru: "💰 Бюджет"), mode: .budget)
                remixButton(label: loc(en: "🖤 More Cursed", ru: "🖤 Жёстче"), mode: .moreCursed)
                remixButton(label: loc(en: "✨ More Clean", ru: "✨ Чище"), mode: .moreClean)
            }
        }
    }

    private func remixButton(label: String, mode: FittingRoomRemix) -> some View {
        Button(action: { Task { await studio.start(remix: mode) } }) {
            Text(label)
                .font(.appBody.bold())
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
                .background(Color.cardBackground)
                .foregroundColor(.textPrimary)
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.bubbleBorder.opacity(0.3), lineWidth: 1))
        }
    }

    // MARK: - Items list

    private var itemsList: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(loc(en: "Outfit items", ru: "Items"))
                    .font(.appHeadline).foregroundColor(.textPrimary)
                Spacer()
                Text(loc(en: "Tap to open in Roblox", ru: "Тап — открыть в Roblox"))
                    .font(.caption2).foregroundColor(.textSecondary)
            }
            ForEach(response.items) { item in
                Button(action: { studio.openCatalogItem(item.catalogUrl) }) {
                    HStack(alignment: .top, spacing: 10) {
                        Text(item.priceRobux == 0 ? "FREE" : "\(item.priceRobux) R$")
                            .font(.caption2.monospaced().bold())
                            .padding(.horizontal, 6).padding(.vertical, 3)
                            .background(item.priceRobux == 0 ? Color.green.opacity(0.3) : Color.orange.opacity(0.3))
                            .foregroundColor(item.priceRobux == 0 ? .green : .orange)
                            .clipShape(RoundedRectangle(cornerRadius: 4))
                        VStack(alignment: .leading, spacing: 2) {
                            Text(item.slot.capitalized).font(.caption2).foregroundColor(.textSecondary)
                            Text(item.name).font(.appBody.bold()).foregroundColor(.textPrimary).lineLimit(2)
                        }
                        Spacer()
                        Image(systemName: "arrow.up.right.square").foregroundColor(.accentPrimary)
                    }
                    .padding(10)
                    .background(Color.cardBackground)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var footer: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Button(action: { studio.savePreviewToPhotos(urlString: response.renders.front ?? response.renders.threeQuarter) }) {
                    Label(loc(en: "Save PNG", ru: "Скачать PNG"), systemImage: "square.and.arrow.down").font(.appBody)
                }.buttonStyle(.bordered)
                Button(action: studio.backToCustomize) {
                    Label(loc(en: "Tweak", ru: "Доработать"), systemImage: "slider.horizontal.3").font(.appBody)
                }.buttonStyle(.bordered)
                Button(action: studio.backToPicker) {
                    Label(loc(en: "New vibe", ru: "Другая vibe"), systemImage: "sparkles").font(.appBody)
                }.buttonStyle(.bordered)
            }
            Text(loc(
                en: "Pseudo-3D pre-rendered angles. Items list links to real Roblox catalog — tap to equip in Avatar Editor.",
                ru: "Pseudo-3D pre-rendered углы. Items линкуют на Roblox каталог — тап чтобы equip в Avatar Editor."
            ))
                .font(.caption2).foregroundColor(.textSecondary.opacity(0.7)).padding(.top, 8)
            Text("ID: \(response.generationId)")
                .font(.caption2.monospaced()).foregroundColor(.textSecondary.opacity(0.5))
        }
    }
}
