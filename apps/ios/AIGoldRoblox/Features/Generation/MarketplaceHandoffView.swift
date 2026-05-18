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
    // Track 2 Phase 4 — layered mesh artifacts, surfaced inline in the Studio
    // AFT block so the user doesn't have to scroll back to the chat to grab them.
    let meshFbxURL: URL?              // .fbx for Studio AFT (canonical layered format)
    let meshGlbURL: URL?              // .glb fallback if Studio's 3D Importer prefers it
    let validationWarnings: [String]  // size / triangle warnings to show prominently
    // Track 3 (3D Pet pipeline) — per-stage artifacts surfaced in petStudioBlock
    // when clothingType begins with "pet_". Each evolution stage is a separate
    // .fbx/.glb pair; user imports each into Studio and pastes the resulting
    // MeshIds back into Stages.StageN.Body inside the .rbxm template.
    var petStage1FbxURL: URL? = nil
    var petStage2FbxURL: URL? = nil
    var petStage3FbxURL: URL? = nil
    var petStage1GlbURL: URL? = nil
    var petStage2GlbURL: URL? = nil
    var petStage3GlbURL: URL? = nil
    var petRbxmURL: URL? = nil        // .rbxm template with placeholder MeshIds + Configuration + scripts
    var petSpeciesType: String? = nil // "dog"|"cat"|"dragon"|"unicorn"|"robot"|"fantasy"
    var petRarity: String? = nil      // "Common"..."Mythic"

    var isPet: Bool { clothingType.hasPrefix("pet_") || petSpeciesType != nil }

    var assetTypeQueryParam: String {
        switch clothingType {
        case "t_shirt": return "TShirt"
        case "classic_pants": return "Pants"
        case "classic_outfit": return "Shirt"  // user uploads shirt first, then pants separately
        case "layered_jacket": return "Jacket"
        case "layered_sweater": return "Sweater"
        case "layered_dress": return "DressSkirt"
        case "layered_shirt": return "Shirt"
        case "layered_pants": return "Pants"
        case "layered_shorts": return "Shorts"
        case "layered_tshirt": return "TShirt"
        default: return "Shirt"
        }
    }

    // Track 2 — layered clothing can't be uploaded via the web Marketplace UI.
    // User must open the .fbx in Studio's Accessory Fitting Tool to add cages,
    // then submit through Avatar Items in the dashboard.
    var isLayered: Bool {
        clothingType.hasPrefix("layered_")
    }

    var uploadURL: URL {
        if isLayered {
            // For layered: send user to Avatar Items page where they can submit
            // the AFT-prepared accessory.
            return URL(string: "https://create.roblox.com/dashboard/creations/catalog")!
        }
        return URL(string: "https://create.roblox.com/dashboard/creations/upload?assetType=\(assetTypeQueryParam)")!
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
                    if context.isPet {
                        petStudioBlock
                    } else if context.isLayered {
                        layeredStudioBlock
                    } else if let assetId = context.robloxAssetId {
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
            Text(context.isLayered
                ? "Layered 3D needs cages (inner/outer) — Roblox Studio's Accessory Fitting Tool generates them automatically. Follow the 5 steps below to finish in Studio, then submit via Creations dashboard."
                : "Roblox doesn't allow listing items from outside the Creator Dashboard. We'll open create.roblox.com with the right asset type, then you paste the prepared title/description/tags.")
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

    // Track 2 — Studio Accessory Fitting Tool handoff. For layered 3D items,
    // Roblox requires inner/outer cage meshes. Rather than auto-generating cages
    // (Path A, unreliable), we hand the user a .fbx mesh and instructions to use
    // Studio's built-in AFT — which generates cages perfectly via UI.
    private var layeredStudioBlock: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Finish in Roblox Studio", systemImage: "wand.and.stars")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.purple)

            // Track 2 Phase 4 — validation warnings shown at top so user sees them
            // BEFORE downloading. Avoids "import → AFT rejected" loop.
            if !context.validationWarnings.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Label("Pre-import warnings", systemImage: "exclamationmark.triangle.fill")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.orange)
                    ForEach(context.validationWarnings, id: \.self) { warning in
                        Text("• \(warning)")
                            .font(.caption2)
                            .foregroundStyle(.orange)
                    }
                }
                .padding(8)
                .background(.orange.opacity(0.10), in: RoundedRectangle(cornerRadius: 6))
            }

            stepRow(num: "1", text: "Download the **.fbx** mesh (or **.glb** fallback):")
            if context.meshFbxURL != nil || context.meshGlbURL != nil {
                HStack(spacing: 8) {
                    if let fbxURL = context.meshFbxURL {
                        Link(destination: fbxURL) {
                            Label(".fbx", systemImage: "arrow.down.doc.fill")
                                .font(.footnote.weight(.semibold))
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(.purple)
                    }
                    if let glbURL = context.meshGlbURL {
                        Link(destination: glbURL) {
                            Label(".glb", systemImage: "arrow.down.doc")
                                .font(.footnote)
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)
                        .tint(.purple)
                    }
                }
                .padding(.leading, 26)
            }
            stepRow(num: "2", text: "Open Roblox Studio → **Avatar tab → 3D Importer** → drag in the .fbx.")
            stepRow(num: "3", text: "With the mesh selected → **Accessory Fitting Tool** → choose **\(context.assetTypeQueryParam)** as accessory type. Studio generates the inner/outer cages for you.")
            stepRow(num: "4", text: "Fit/preview on the avatar → **Save to Roblox** in the AFT panel.")
            stepRow(num: "5", text: "Submit via **Creations dashboard → Avatar Items**.")
            Link("Open Avatar Items dashboard", destination: context.uploadURL)
                .buttonStyle(.borderedProminent)
            Text("⚠️ Layered 3D requires Roblox UGC Program approval. Without it, the AFT submit step is blocked.")
                .font(.caption2)
                .foregroundStyle(.orange)
        }
        .padding()
        .background(.purple.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
    }

    // Track 3 (3D Pet pipeline) — Studio handoff for an AI-generated pet asset
    // with 3 visual evolution stages. The .rbxm template has placeholder
    // MeshIds + scripts; user imports each stage .fbx in Studio's 3D Importer
    // and pastes the resulting asset IDs back into Stages.StageN.Body.MeshId.
    private var petStudioBlock: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Image(systemName: "pawprint.fill")
                    .foregroundStyle(.purple)
                Text("Finish 3D Pet in Roblox Studio")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.purple)
                Spacer()
                if let rarity = context.petRarity {
                    Text(rarity.uppercased())
                        .font(.caption2.monospaced().weight(.bold))
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(rarityTint(rarity).opacity(0.20), in: Capsule())
                        .foregroundStyle(rarityTint(rarity))
                }
            }

            if !context.validationWarnings.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Label("Mesh size warnings", systemImage: "exclamationmark.triangle.fill")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.orange)
                    ForEach(context.validationWarnings, id: \.self) { w in
                        Text("• \(w)").font(.caption2).foregroundStyle(.orange)
                    }
                }
                .padding(8)
                .background(.orange.opacity(0.10), in: RoundedRectangle(cornerRadius: 6))
            }

            stepRow(num: "1", text: "Download the 3 evolution-stage meshes + the .rbxm template:")
            HStack(spacing: 6) {
                petStageDownload(title: "Stage 1", fbx: context.petStage1FbxURL, glb: context.petStage1GlbURL)
                petStageDownload(title: "Stage 2", fbx: context.petStage2FbxURL, glb: context.petStage2GlbURL)
                petStageDownload(title: "Stage 3", fbx: context.petStage3FbxURL, glb: context.petStage3GlbURL)
            }
            .padding(.leading, 26)

            if let rbxm = context.petRbxmURL {
                HStack {
                    Link(destination: rbxm) {
                        Label(".rbxm template", systemImage: "arrow.down.doc.fill")
                            .font(.footnote.weight(.semibold))
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.purple)
                }
                .padding(.leading, 26)
            }

            stepRow(num: "2", text: "In Studio → **Avatar tab → 3D Importer** → drag in **stage1.fbx**. Note the **MeshPart asset id** Studio assigns.")
            stepRow(num: "3", text: "Repeat for **stage2.fbx** and **stage3.fbx**. Three asset ids total.")
            stepRow(num: "4", text: "Open **Animation Editor**. Import the stage idle/walk animations from each FBX → save → copy the **Animation IDs**.")
            stepRow(num: "5", text: "Drag the **.rbxm template** into Workspace. For each `Stages.StageN.Body` paste the matching MeshId. Set `Idle` / `Walk` Animation IDs the same way.")
            stepRow(num: "6", text: "Press **Play**. The pet follows the player. Test evolution in the command bar: `require(workspace.Pet_\(context.petSpeciesType?.capitalized ?? "X").PetLevelingModule):GainXP(2000)` → swaps to Stage 2.")

            Text("Tip: pet stats live in `PetConfig` (Configuration). Tune `CoinBonusBase`, `Level`, `EvolutionStage` directly in Studio for testing.")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .padding()
        .background(.purple.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
    }

    private func petStageDownload(title: String, fbx: URL?, glb: URL?) -> some View {
        VStack(spacing: 4) {
            Text(title)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.purple)
            if let fbxURL = fbx {
                Link(destination: fbxURL) {
                    Label(".fbx", systemImage: "arrow.down.doc.fill")
                        .font(.caption2)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(.purple)
                .controlSize(.small)
            } else if let glbURL = glb {
                Link(destination: glbURL) {
                    Label(".glb", systemImage: "arrow.down.doc")
                        .font(.caption2)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .tint(.purple)
                .controlSize(.small)
            } else {
                Text("—")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func rarityTint(_ rarity: String) -> Color {
        switch rarity {
        case "Mythic":    return .pink
        case "Legendary": return .orange
        case "Epic":      return .purple
        case "Rare":      return .blue
        case "Uncommon":  return .green
        default:          return .gray
        }
    }

    private func stepRow(num: String, text: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Text(num)
                .font(.caption.bold().monospaced())
                .foregroundStyle(.purple)
                .frame(width: 18, alignment: .center)
                .padding(.top, 2)
            Text(.init(text))
                .font(.footnote)
        }
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
        if context.isPet {
            let species = context.petSpeciesType?.capitalized ?? "Pet"
            let rarity = context.petRarity ?? ""
            return rarity.isEmpty ? "🐾 \(species) Pet" : "🐾 \(rarity) \(species) Pet"
        }
        switch type {
        case "t_shirt": return "T-Shirt"
        case "classic_shirt": return "Classic Shirt"
        case "classic_pants": return "Classic Pants"
        case "classic_outfit": return "Shirt + Pants outfit"
        case "layered_jacket": return "🧥 3D Jacket"
        case "layered_sweater": return "🧶 3D Sweater"
        case "layered_dress": return "👗 3D Dress"
        case "layered_shirt": return "3D Shirt"
        case "layered_pants": return "3D Pants"
        case "layered_shorts": return "3D Shorts"
        case "layered_tshirt": return "3D T-Shirt"
        case "pet_dog": return "🐕 Pet Dog"
        case "pet_cat": return "🐈 Pet Cat"
        case "pet_dragon": return "🐉 Pet Dragon"
        case "pet_unicorn": return "🦄 Pet Unicorn"
        case "pet_robot": return "🤖 Pet Robot"
        case "pet_fantasy": return "✨ Fantasy Pet"
        default: return "Clothing"
        }
    }
}
