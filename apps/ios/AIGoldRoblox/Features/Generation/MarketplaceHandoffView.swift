//
//  MarketplaceHandoffView.swift
//  AIGoldRoblox
//
//  Session 001 (Track 1): after a classic clothing item is generated, this sheet
//  guides the user through publishing it on the Roblox Marketplace. Roblox does
//  not allow programmatic listing — we open create.roblox.com/dashboard with the
//  correct assetType and let the user paste the title/description/tags we
//  prepared. The PNG is downloadable from the artifact already.
//

import SwiftUI

struct MarketplaceHandoffContext: Identifiable, Equatable {
    let id = UUID()
    let clothingType: String          // "t_shirt" | "classic_shirt" | "classic_pants" | "classic_outfit"
    let title: String
    let suggestedDescription: String
    let suggestedTags: [String]
    let suggestedPriceRobux: Int
    let robloxAssetId: Int64?         // set if backend auto-uploaded via service cookie
    let textureDownloadURL: URL?      // PNG fallback if user needs to upload manually

    var assetTypeQueryParam: String {
        switch clothingType {
        case "t_shirt": return "TShirt"
        case "classic_pants": return "Pants"
        case "classic_outfit": return "Shirt"  // user uploads shirt first, then pants separately
        default: return "Shirt"
        }
    }

    var uploadURL: URL {
        URL(string: "https://create.roblox.com/dashboard/creations/upload?assetType=\(assetTypeQueryParam)")!
    }

    var creationsURL: URL {
        URL(string: "https://create.roblox.com/dashboard/creations")!
    }
}

struct MarketplaceHandoffView: View {
    let context: MarketplaceHandoffContext
    var onDismiss: () -> Void

    @State private var title: String
    @State private var descriptionText: String
    @State private var tags: String
    @State private var price: Int
    @State private var didCopyAll = false
    @State private var didCopyTitle = false
    @State private var didCopyDescription = false
    @State private var didCopyTags = false

    init(context: MarketplaceHandoffContext, onDismiss: @escaping () -> Void) {
        self.context = context
        self.onDismiss = onDismiss
        _title = State(initialValue: context.title)
        _descriptionText = State(initialValue: context.suggestedDescription)
        _tags = State(initialValue: context.suggestedTags.joined(separator: ", "))
        _price = State(initialValue: context.suggestedPriceRobux)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    headerBlock
                    if let assetId = context.robloxAssetId {
                        uploadedBlock(assetId: assetId)
                    } else if context.textureDownloadURL != nil {
                        manualUploadBlock
                    }
                    metaBlock
                    complianceBlock
                    feeBlock
                }
                .padding()
            }
            .navigationTitle("Publish to Marketplace")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { onDismiss() }
                }
            }
        }
    }

    private var headerBlock: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(displayTitle(for: context.clothingType))
                .font(.title3.bold())
            Text("Roblox doesn't allow listing items from outside the Creator Dashboard. We'll open create.roblox.com with the right asset type, then you paste the prepared title/description/tags.")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
    }

    private func uploadedBlock(assetId: Int64) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("Asset uploaded to Roblox", systemImage: "checkmark.seal.fill")
                .foregroundStyle(.green)
            Text("Asset ID: \(String(assetId))")
                .font(.caption.monospaced())
                .foregroundStyle(.secondary)
            Link("Open in Creator Dashboard", destination: context.creationsURL)
                .buttonStyle(.borderedProminent)
        }
        .padding()
        .background(.green.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
    }

    private var manualUploadBlock: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("Manual upload", systemImage: "square.and.arrow.up")
                .font(.subheadline.weight(.semibold))
            Text("Download the PNG from the chat, then upload it on Roblox's dashboard as \(context.assetTypeQueryParam).")
                .font(.footnote)
                .foregroundStyle(.secondary)
            Link("Open Roblox upload page", destination: context.uploadURL)
                .buttonStyle(.borderedProminent)
        }
        .padding()
        .background(.orange.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
    }

    private var metaBlock: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Marketplace listing")
                .font(.headline)

            row(label: "Title", text: $title, did: $didCopyTitle, copyValue: title)
            row(label: "Description", text: $descriptionText, did: $didCopyDescription, copyValue: descriptionText, multiline: true)
            row(label: "Tags", text: $tags, did: $didCopyTags, copyValue: tags)
            HStack {
                Text("Price (Robux)")
                    .font(.subheadline)
                Spacer()
                Stepper(value: $price, in: 0...10000, step: 5) {
                    Text("R$ \(price)")
                        .font(.subheadline.monospaced())
                }
            }

            Button {
                let blob = "\(title)\n\n\(descriptionText)\n\nTags: \(tags)\nPrice: R$ \(price)"
                UIPasteboard.general.string = blob
                didCopyAll = true
            } label: {
                Label(didCopyAll ? "Copied all ✓" : "Copy all to clipboard", systemImage: "doc.on.doc")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
        }
    }

    private var complianceBlock: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Before publishing")
                .font(.headline)
            checklistRow("Premium 1000 or 2200 subscription (required from Mar 19, 2026 for 2D clothing listings)")
            checklistRow("ID-verified Roblox account")
            checklistRow("Read Marketplace policy — no IP infringement, no offensive content")
        }
        .padding()
        .background(.gray.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
    }

    private var feeBlock: some View {
        VStack(alignment: .leading, spacing: 4) {
            Label("Fees", systemImage: "creditcard")
                .font(.subheadline.weight(.semibold))
            Text("• 10 Robux upload fee\n• 10 Robux on-sale fee\n= 20 Robux total per item")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
        .padding()
        .background(.yellow.opacity(0.10), in: RoundedRectangle(cornerRadius: 10))
    }

    private func row(label: String, text: Binding<String>, did: Binding<Bool>, copyValue: String, multiline: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(label).font(.subheadline)
                Spacer()
                Button {
                    UIPasteboard.general.string = copyValue
                    did.wrappedValue = true
                } label: {
                    Image(systemName: did.wrappedValue ? "checkmark" : "doc.on.doc")
                        .font(.caption)
                }
            }
            if multiline {
                TextEditor(text: text)
                    .frame(minHeight: 80)
                    .padding(6)
                    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 8))
            } else {
                TextField("", text: text)
                    .textFieldStyle(.roundedBorder)
            }
        }
    }

    private func checklistRow(_ msg: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: "checkmark.circle")
                .foregroundStyle(.secondary)
            Text(msg)
                .font(.footnote)
        }
    }

    private func displayTitle(for type: String) -> String {
        switch type {
        case "t_shirt": return "T-Shirt"
        case "classic_shirt": return "Classic Shirt"
        case "classic_pants": return "Classic Pants"
        case "classic_outfit": return "Shirt + Pants outfit"
        default: return "Clothing"
        }
    }
}
