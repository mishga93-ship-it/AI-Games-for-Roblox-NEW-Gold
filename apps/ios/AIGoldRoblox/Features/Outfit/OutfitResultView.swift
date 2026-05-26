// OutfitResultView.swift — result screen for the 1-Click Outfit Generator
// (session 383). Shows grouped item list + total cost + share + remix.

import SwiftUI

struct OutfitResultView: View {
    @ObservedObject var studio: OutfitStudio
    let response: OutfitGenerationResponse

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                header
                savingsBadges
                captionCard
                shareButton
                itemsBySlot
                remixSection
                footer
            }
            .padding(.horizontal, 16)
            .padding(.top, 60)
            .padding(.bottom, 30)
        }
    }

    // MARK: - Sections

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(response.appStoreHook)
                .font(.appCaption.bold())
                .foregroundColor(.orange)
            Text(response.title)
                .font(.appTitle2.bold())
                .foregroundColor(.textPrimary)
            Text(response.localizedPitch)
                .font(.appBody)
                .foregroundColor(.textSecondary)
        }
    }

    private var savingsBadges: some View {
        HStack(spacing: 8) {
            outfitBadge(text: "Total \(response.totalCostRobux) R$", icon: "creditcard", tint: .green)
            if response.savedRobux > 0 {
                outfitBadge(text: "Saved \(response.savedRobux.formatted()) R$", icon: "tag.fill", tint: .orange)
            }
            outfitBadge(text: "\(response.items.count) items", icon: "tshirt.fill", tint: .blue)
        }
    }

    private var captionCard: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(loc(en: "TikTok caption", ru: "TikTok caption"))
                .font(.caption.bold())
                .foregroundColor(.textSecondary)
            Text(response.localizedCaption)
                .font(.appBody.bold())
                .foregroundColor(.textPrimary)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private var shareButton: some View {
        Button(action: { studio.shareOutfit() }) {
            HStack(spacing: 8) {
                Image(systemName: "square.and.arrow.up.fill")
                Text(loc(en: "Share Outfit", ru: "Поделиться outfit"))
                    .font(.appHeadline.bold())
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(LinearGradient(colors: [.pink, .purple], startPoint: .leading, endPoint: .trailing))
            .foregroundColor(.white)
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }

    private var itemsBySlot: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(loc(en: "Outfit Items", ru: "Items"))
                    .font(.appHeadline)
                    .foregroundColor(.textPrimary)
                Spacer()
                Text(loc(en: "Tap → get in Roblox", ru: "Тап → получить в Roblox"))
                    .font(.caption2)
                    .foregroundColor(.textSecondary)
            }
            Text(loc(
                en: "How to wear:  1) Tap an item → opens its Roblox page  2) Press “Get” (some are free)  3) Open Avatar Editor → equip.",
                ru: "Как надеть:  1) Тап по айтему → откроется страница в Roblox  2) Нажми “Get” (часть бесплатны)  3) Avatar Editor → equip."
            ))
                .font(.caption)
                .foregroundColor(.textSecondary)
                .padding(.bottom, 4)
            if response.items.isEmpty {
                Text(loc(en: "Catalog is sparse for this aesthetic right now. Try a remix or another vibe.",
                         ru: "Каталог пуст для этой эстетики. Попробуй remix или другую vibe."))
                    .font(.appCaption)
                    .foregroundColor(.textSecondary)
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.cardBackground)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
            } else {
                ForEach(response.items) { item in
                    OutfitItemRow(item: item) { studio.openCatalogItem(item.catalogUrl) }
                }
            }
        }
    }

    private var remixSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(loc(en: "Not feeling it? Remix:", ru: "Не вайбит? Remix:"))
                .font(.appHeadline)
                .foregroundColor(.textPrimary)
            // Grid of 4 remix buttons
            let cols = [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)]
            LazyVGrid(columns: cols, spacing: 8) {
                remixButton(label: loc(en: "🔄 Remix", ru: "🔄 Remix"), mode: .remix)
                remixButton(label: loc(en: "💰 Budget", ru: "💰 Бюджет"), mode: .budget)
                remixButton(label: loc(en: "🖤 More Cursed", ru: "🖤 Жёстче"), mode: .moreCursed)
                remixButton(label: loc(en: "✨ More Clean", ru: "✨ Чище"), mode: .moreClean)
            }
        }
    }

    private func remixButton(label: String, mode: OutfitRemixMode) -> some View {
        Button(action: { Task { await studio.generate(remix: mode) } }) {
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

    private var footer: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Button(action: studio.backToCustomize) {
                    Label(loc(en: "Change parameters", ru: "Поменять параметры"),
                          systemImage: "slider.horizontal.3")
                        .font(.appBody)
                }
                .buttonStyle(.bordered)
                Button(action: studio.backToPicker) {
                    Label(loc(en: "Another vibe", ru: "Другая vibe"), systemImage: "sparkles")
                        .font(.appBody)
                }
                .buttonStyle(.bordered)
            }
            Text(loc(
                en: "Outfit assembled from official Roblox catalog items. Tap any item to open it in Roblox and equip via Avatar Editor.",
                ru: "Outfit собран из официальных Roblox-айтемов. Тапни любой — откроется в Roblox для покупки/exquip."
            ))
                .font(.caption2)
                .foregroundColor(.textSecondary.opacity(0.7))
                .padding(.top, 8)
        }
    }

    private func outfitBadge(text: String, icon: String, tint: Color) -> some View {
        Label(text, systemImage: icon)
            .font(.caption.bold())
            .padding(.horizontal, 8).padding(.vertical, 5)
            .background(tint.opacity(0.18))
            .foregroundColor(tint)
            .clipShape(Capsule())
    }
}

// MARK: - Item Row

private struct OutfitItemRow: View {
    let item: OutfitItem
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 10) {
                thumbnailView
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 4) {
                        Text(slotLabel(item.slot).uppercased())
                            .font(.caption2.bold())
                            .padding(.horizontal, 5).padding(.vertical, 2)
                            .background(Color.accentPrimary.opacity(0.15))
                            .foregroundColor(.accentPrimary)
                            .clipShape(RoundedRectangle(cornerRadius: 3))
                        if item.isCurated {
                            Text("★").font(.caption2).foregroundColor(.orange)
                        }
                    }
                    Text(item.name)
                        .font(.appBody.bold())
                        .foregroundColor(.textPrimary)
                        .lineLimit(2)
                    if let creator = item.creatorName, !creator.isEmpty {
                        Text("by \(creator)")
                            .font(.caption2)
                            .foregroundColor(.textSecondary)
                    }
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    Text(item.priceRobux == 0
                         ? loc(en: "FREE", ru: "FREE")
                         : "\(item.priceRobux) R$")
                        .font(.caption.bold())
                        .foregroundColor(item.priceRobux == 0 ? .green : .orange)
                    Image(systemName: "arrow.up.right.square")
                        .foregroundColor(.accentPrimary)
                }
            }
            .padding(10)
            .background(Color.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: 10))
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private var thumbnailView: some View {
        if let urlString = item.thumbnailUrl, let url = URL(string: urlString) {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let img): img.resizable().scaledToFit()
                case .failure: thumbnailFallback
                case .empty: thumbnailFallback
                @unknown default: thumbnailFallback
                }
            }
            .frame(width: 56, height: 56)
            .background(Color.bubbleBorder.opacity(0.15))
            .clipShape(RoundedRectangle(cornerRadius: 8))
        } else {
            thumbnailFallback
                .frame(width: 56, height: 56)
        }
    }

    private var thumbnailFallback: some View {
        ZStack {
            Color.bubbleBorder.opacity(0.15)
            Image(systemName: slotIcon(item.slot))
                .font(.system(size: 22))
                .foregroundColor(.textSecondary.opacity(0.5))
        }
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private func slotLabel(_ slot: String) -> String {
        switch slot {
        case "hair": return "Hair"
        case "face": return "Face"
        case "shirt": return "Shirt"
        case "pants": return "Pants"
        case "jacket": return "Jacket"
        case "neck": return "Neck"
        case "shoulder": return "Shoulder"
        case "back": return "Back"
        case "aura": return "Aura"
        case "accessory": return "Accessory"
        default: return slot.capitalized
        }
    }

    private func slotIcon(_ slot: String) -> String {
        switch slot {
        case "hair": return "person.crop.circle.fill"
        case "face": return "face.smiling"
        case "shirt", "jacket": return "tshirt.fill"
        case "pants": return "figure.stand"
        case "neck": return "link"
        case "shoulder", "back": return "backpack"
        case "aura": return "sparkles"
        case "accessory": return "star.fill"
        default: return "circle.fill"
        }
    }
}
