// GlowupResultView.swift — final result screen of the Avatar Glow-Up
// Studio (session 382 Phase 2 Session B). Shows preview + asset pack +
// share/upload/instructions.

import SwiftUI

struct GlowupResultView: View {
    @ObservedObject var studio: GlowupStudio
    let response: GlowupGenerationResponse
    @State private var instructionsExpanded = true

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                header
                previewCard
                savingsBadges
                shareButton
                assetPackSection
                catalogSection
                instructionsSection
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
            Text(response.pitch)
                .font(.appBody)
                .foregroundColor(.textSecondary)
        }
    }

    private var previewCard: some View {
        VStack(alignment: .center, spacing: 6) {
            AsyncImage(url: URL(string: response.previewUrl)) { phase in
                switch phase {
                case .success(let img):
                    img.resizable().scaledToFit()
                case .failure:
                    placeholder
                case .empty:
                    ZStack { placeholder; ProgressView() }
                @unknown default:
                    placeholder
                }
            }
            .frame(maxWidth: .infinity)
            .background(Color.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: 16))

            if response.fitOnUser {
                Label("Это ТВой аватар", systemImage: "checkmark.seal.fill")
                    .font(.caption.bold())
                    .foregroundColor(.green)
            } else {
                Text("Generic preview (Roblox-ник не задан или не найден)")
                    .font(.caption)
                    .foregroundColor(.textSecondary)
            }
        }
    }

    private var placeholder: some View {
        ZStack {
            Color.cardBackground
            Image(systemName: "person.crop.square")
                .font(.system(size: 80))
                .foregroundColor(.textSecondary.opacity(0.4))
        }
        .aspectRatio(0.75, contentMode: .fit)
    }

    private var savingsBadges: some View {
        HStack(spacing: 8) {
            BadgePill(text: "Cost \(response.cost.totalCostRobux) R$", icon: "creditcard", tint: .green)
            BadgePill(text: "Saved \(response.cost.savedRobux.formatted()) R$", icon: "tag.fill", tint: .orange)
            if response.cached == true {
                BadgePill(text: "Cached ⚡", icon: "bolt.fill", tint: .blue)
            }
        }
    }

    private var shareButton: some View {
        Button(action: { studio.shareLook() }) {
            HStack(spacing: 8) {
                Image(systemName: "square.and.arrow.up.fill")
                Text("Share to TikTok / Instagram")
                    .font(.appHeadline.bold())
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(LinearGradient(colors: [.pink, .purple], startPoint: .leading, endPoint: .trailing))
            .foregroundColor(.white)
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }

    private var assetPackSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Asset Pack")
                .font(.appHeadline)
                .foregroundColor(.textPrimary)

            AssetRow(
                title: "Shirt.png",
                subtitle: "Classic Shirt — загрузи на Roblox (10 R$)",
                icon: "tshirt.fill",
                primaryLabel: "Save",
                primaryIcon: "square.and.arrow.down",
                primaryAction: { studio.saveImageToPhotos(urlString: response.assetPack.shirtUrl, label: "Shirt") },
                secondaryLabel: "Upload",
                secondaryIcon: "arrow.up.right.square",
                secondaryAction: { studio.openRobloxUploadPage() }
            )
            AssetRow(
                title: "Pants.png",
                subtitle: "Classic Pants — загрузи на Roblox (10 R$)",
                icon: "figure.stand",
                primaryLabel: "Save",
                primaryIcon: "square.and.arrow.down",
                primaryAction: { studio.saveImageToPhotos(urlString: response.assetPack.pantsUrl, label: "Pants") },
                secondaryLabel: "Upload",
                secondaryIcon: "arrow.up.right.square",
                secondaryAction: { studio.openRobloxUploadPage() }
            )
            AssetRow(
                title: "Decal.png",
                subtitle: studio.oauthConnected
                    ? "Загружу в твой Roblox через OAuth в один тап."
                    : "Подключи Roblox, чтобы загрузить автоматически.",
                icon: "face.dashed.fill",
                primaryLabel: "Save",
                primaryIcon: "square.and.arrow.down",
                primaryAction: { studio.saveImageToPhotos(urlString: response.assetPack.decalUrl, label: "Decal") },
                secondaryLabel: studio.oauthConnected ? "Auto-Upload" : "Connect",
                secondaryIcon: studio.oauthConnected ? "cloud.fill" : "link",
                secondaryAction: {
                    if studio.oauthConnected {
                        Task { await studio.uploadDecal() }
                    } else {
                        studio.openRobloxUploadPage()
                    }
                }
            )
        }
    }

    private var catalogSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Эти аксессуары допиливают look")
                .font(.appHeadline)
                .foregroundColor(.textPrimary)
            ForEach(response.catalogItems) { item in
                Button(action: { studio.openRobloxCatalogItem(item.assetId) }) {
                    HStack(alignment: .top, spacing: 10) {
                        Text(item.pricedRobux == 0 ? "FREE" : "\(item.pricedRobux) R$")
                            .font(.caption2.monospaced().bold())
                            .padding(.horizontal, 6).padding(.vertical, 3)
                            .background(item.pricedRobux == 0 ? Color.green.opacity(0.3) : Color.orange.opacity(0.3))
                            .foregroundColor(item.pricedRobux == 0 ? .green : .orange)
                            .clipShape(RoundedRectangle(cornerRadius: 4))
                        VStack(alignment: .leading, spacing: 2) {
                            Text(item.name).font(.appBody.bold()).foregroundColor(.textPrimary)
                            Text(item.notes).font(.caption).foregroundColor(.textSecondary).lineLimit(2)
                        }
                        Spacer()
                        Image(systemName: "arrow.up.right.square")
                            .foregroundColor(.accentPrimary)
                    }
                    .padding(12)
                    .background(Color.cardBackground)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var instructionsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button(action: { withAnimation { instructionsExpanded.toggle() } }) {
                HStack {
                    Text("Шаги в Avatar Editor")
                        .font(.appHeadline)
                        .foregroundColor(.textPrimary)
                    Spacer()
                    Image(systemName: instructionsExpanded ? "chevron.up" : "chevron.down")
                        .foregroundColor(.textSecondary)
                }
            }
            if instructionsExpanded {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(Array(response.instructionsRU.enumerated()), id: \.offset) { idx, step in
                        HStack(alignment: .top, spacing: 8) {
                            Text("\(idx + 1).")
                                .font(.appBody.monospacedDigit().bold())
                                .foregroundColor(.accentPrimary)
                            Text(step)
                                .font(.appBody)
                                .foregroundColor(.textPrimary)
                        }
                    }
                }
                .padding(12)
                .background(Color.cardBackground)
                .clipShape(RoundedRectangle(cornerRadius: 10))
            }
        }
    }

    private var footer: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Button(action: studio.backToCustomize) {
                    Label("Поменять параметры", systemImage: "slider.horizontal.3")
                        .font(.appBody)
                }
                .buttonStyle(.bordered)
                Button(action: studio.backToPicker) {
                    Label("Другой vibe", systemImage: "sparkles")
                        .font(.appBody)
                }
                .buttonStyle(.bordered)
            }
            Text(response.disclaimer)
                .font(.caption2)
                .foregroundColor(.textSecondary.opacity(0.7))
                .padding(.top, 8)
            Text("ID: \(response.generationId)")
                .font(.caption2.monospaced())
                .foregroundColor(.textSecondary.opacity(0.5))
        }
    }
}

private struct AssetRow: View {
    let title: String
    let subtitle: String
    let icon: String
    let primaryLabel: String
    let primaryIcon: String
    let primaryAction: () -> Void
    let secondaryLabel: String
    let secondaryIcon: String
    let secondaryAction: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 24))
                .foregroundColor(.accentPrimary)
                .frame(width: 36, height: 36)
                .background(Color.accentPrimary.opacity(0.15))
                .clipShape(RoundedRectangle(cornerRadius: 8))
            VStack(alignment: .leading, spacing: 4) {
                Text(title).font(.appBody.bold()).foregroundColor(.textPrimary)
                Text(subtitle).font(.caption).foregroundColor(.textSecondary)
                HStack(spacing: 6) {
                    Button(action: primaryAction) {
                        Label(primaryLabel, systemImage: primaryIcon).font(.caption.bold())
                    }
                    .buttonStyle(.bordered)
                    Button(action: secondaryAction) {
                        Label(secondaryLabel, systemImage: secondaryIcon).font(.caption.bold())
                    }
                    .buttonStyle(.borderedProminent)
                }
            }
            Spacer()
        }
        .padding(12)
        .background(Color.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }
}

private struct BadgePill: View {
    let text: String
    let icon: String
    let tint: Color
    var body: some View {
        Label(text, systemImage: icon)
            .font(.caption.bold())
            .padding(.horizontal, 8).padding(.vertical, 5)
            .background(tint.opacity(0.18))
            .foregroundColor(tint)
            .clipShape(Capsule())
    }
}
