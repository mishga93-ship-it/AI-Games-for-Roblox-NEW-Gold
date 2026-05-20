import SwiftUI
import SceneKit
import WebKit
import AVFoundation
import Combine

struct GenerationPreviewView: View {
    let title: String
    let artifactType: ArtifactType
    let onExport: () -> Void
    let onExportGLB: (() -> Void)?
    let onExportRBXM: (() -> Void)?
    let onExportFBX: (() -> Void)?
    var isGeneratingContent: Bool = false
    let publishContext: PublishContext?
    let onApproveConcept: (() -> Void)?
    let onRegenerateConcept: ((String?) -> Void)?
    let isProcessingConceptAction: Bool
    /// 2026-05-20: Label for the concept-approval primary button. Must reflect
    /// the mode the user picked (Build 2D / Start 3D / Build T-Shirt) so the
    /// button doesn't lie about what happens next. Default keeps old behavior.
    var approveConceptButtonLabel: String = "Looks good — Start 3D"
    let heroConcepts: [AIWorkspaceAPI.HeroConcept]
    let onToggleHeroConcept: ((Int) -> Void)?
    let onApproveHeroConcepts: (() -> Void)?
    let onRegenerateHeroConcept: ((Int, String?) -> Void)?
    /// Phase F (session 219): Roblox catalog items welded into generated map.
    /// When non-empty — shows a chip "🔥 N live Roblox <Cat> trends embedded".
    var trendingShowcaseItems: [AIWorkspaceAPI.RobloxCatalogItem] = []
    var trendingShowcaseCategory: String? = nil
    /// Decal approval gate (session 231). Non-empty when the backend pause
    /// status='awaiting_review'+approvalKind='decal_upload' fires. The sheet
    /// is modal: user must submit before generation continues.
    var decalCandidates: [AIWorkspaceAPI.DecalCandidate] = []
    var onApproveDecals: (([String]) -> Void)? = nil
    var isSubmittingDecalApproval: Bool = false

    @State private var showPublishSheet = false
    @State private var showPublishSuccess = false
    @State private var codeCopied = false
    @State private var uiPreviewTab: Int = 0
    @State private var conceptFeedback: String = ""
    @State private var heroFeedbackIndex: Int? = nil
    @State private var heroFeedbackText: String = ""
    @State private var showDecalApprovalSheet = false

    struct PublishContext {
        let description: String
        let artifactIds: [String]
        let projectKind: String
        let existingProjectId: String?
        let previewImageURLs: [URL]
        let onPublished: (String) -> Void
    }

    struct PipelineStagePreview: Identifiable {
        let id: String
        let title: String
        let status: String
        let summary: String
        let artifactType: ArtifactType?

        var isProcessing: Bool { status == "processing" }
        var isPending: Bool { status == "pending" }
        var isCompleted: Bool { status == "completed" || status == "skipped" }
        var isFailed: Bool { status == "failed" }
        var isApprovalStage: Bool { id == "concept_approval" || id == "hero_approval" }
        var isWaitingForApproval: Bool { isProcessing && isApprovalStage }
        var statusLabel: String {
            if isWaitingForApproval { return "Waiting for approval" }
            return status.replacingOccurrences(of: "_", with: " ").capitalized
        }
    }

    struct Candidate3D: Identifiable, Equatable {
        let id: String
        let modelURL: URL
        let thumbnailURL: URL?
    }

    enum ArtifactType {
        case code(String)
        case gdd(rows: [(String, String)])
        case text(String)
        case projectBundle(summary: String, files: [String])
        case robloxBinary(kind: String, notes: [String])
        case media(kind: String, remoteURL: URL?)
        case interactive3D(thumbnailURL: URL?, modelURL: URL)
        case model3D(bodyType: AvatarBodyType, accentColor: Color, textureURL: URL?, caption: String, archetype: CharacterArchetype = .default)
        case realModel3D(modelURL: URL, thumbnailURL: URL?, caption: String)
        // 4-кандидатный grid для furniture / multi-variant 3D генерации.
        // Каждый candidate — пара (modelURL, thumbnailURL); можно передать <4 если бэкенд
        // вернул их streaming-ом — пустые слоты UI заполнит skeleton-плэйсхолдером.
        case candidateGrid3D(candidates: [Candidate3D], selectedIndex: Int, caption: String)
        case pipeline(stages: [PipelineStagePreview])
        case clothingPreview(shirtURL: URL?, pantsURL: URL?)
        case animationPreview(name: String, rig: String, keyframeCount: Int, looped: Bool, animationType: String, notes: [String], previewMediaURL: URL? = nil, previewIsVideo: Bool = false)
        case uiPreview(code: String, uiType: String, visualStyle: String, title: String)
        /// 2026-05-20 (Track 3 Phase 2): interactive SceneKit reconstruction
        /// of a blocky pet. Spec comes from the .rbxm artifact's
        /// metadata.blockyPetSpecJSON; user can orbit / pinch-zoom.
        case blockyPet3D(spec: BlockyPetSpecPayload, element: String, rarity: String, species: String, isFlying: Bool, notes: [String])
        case unavailable(String)

        var previewImageURLs: [URL] {
            switch self {
            case .media(let kind, let remoteURL):
                if kind == "audio" { return [] }
                return [remoteURL].compactMap { $0 }
            case .interactive3D(let thumbnailURL, _):
                return [thumbnailURL].compactMap { $0 }
            case .realModel3D(_, let thumbnailURL, _):
                return [thumbnailURL].compactMap { $0 }
            case .candidateGrid3D(let candidates, _, _):
                return candidates.compactMap { $0.thumbnailURL }
            case .animationPreview(_, _, _, _, _, _, let previewMediaURL, let previewIsVideo):
                if previewIsVideo { return [] }
                return [previewMediaURL].compactMap { $0 }
            case .clothingPreview(let shirtURL, let pantsURL):
                return [shirtURL, pantsURL].compactMap { $0 }
            case .pipeline(let stages):
                var urls: [URL] = []
                for stage in stages where stage.isCompleted {
                    if let artifactType = stage.artifactType {
                        urls.append(contentsOf: artifactType.previewImageURLs)
                    }
                    if urls.count >= 2 { break }
                }
                return Array(urls.prefix(2))
            case .code, .gdd, .text, .projectBundle, .robloxBinary, .model3D, .uiPreview, .unavailable, .blockyPet3D:
                return []
            }
        }

        var firstSelectableModelURL: URL? {
            switch self {
            case .realModel3D(let modelURL, _, _): return modelURL
            case .interactive3D(_, let modelURL): return modelURL
            case .candidateGrid3D(let candidates, let selectedIndex, _):
                guard candidates.indices.contains(selectedIndex) else { return candidates.first?.modelURL }
                return candidates[selectedIndex].modelURL
            default: return nil
            }
        }
    }

    var body: some View {
        ZStack {
            LinearGradient(colors: [.gradientTop, .gradientBottom], startPoint: .topLeading, endPoint: .bottomTrailing)
                .ignoresSafeArea()

            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 18) {
                    Text(title)
                        .font(.appTitle2)
                        .foregroundColor(.textPrimary)
                    if !trendingShowcaseItems.isEmpty {
                        trendingShowcaseChip
                    }
                    content
                    actionBar
                }
                .padding(20)
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { syncDecalSheetVisibility() }
        .onChange(of: decalCandidates.count) { _, _ in syncDecalSheetVisibility() }
        .sheet(isPresented: $showDecalApprovalSheet) {
            DecalApprovalSheet(
                candidates: decalCandidates,
                isSubmitting: isSubmittingDecalApproval
            ) { approvedSlotIds in
                onApproveDecals?(approvedSlotIds)
            }
        }
        .sheet(isPresented: $showPublishSheet) {
            if let ctx = publishContext {
                PublishView(
                    initialTitle: title,
                    initialDescription: ctx.description,
                    artifactIds: ctx.artifactIds,
                    projectKind: ctx.projectKind,
                    existingProjectId: ctx.existingProjectId,
                    initialScreenshotURLs: ctx.previewImageURLs,
                    onPublished: { projectId in
                        ctx.onPublished(projectId)
                        showPublishSuccess = true
                    }
                )
            }
        }
        .alert("Published!", isPresented: $showPublishSuccess) {
            Button("OK", role: .cancel) {}
        } message: {
            Text("Your project is now live in the Community feed.")
        }
    }

    /// Phase F (session 219): live-trends chip rendered between title and content.
    /// Tapping it isn't supported in v1 — purely a confidence/awareness indicator
    /// that the generated game contains a `Workspace.TrendingShowcase` Folder.
    private var trendingShowcaseChip: some View {
        let count = trendingShowcaseItems.count
        let cat = trendingShowcaseCategory ?? "Featured"
        let names = trendingShowcaseItems.prefix(2).map(\.name).joined(separator: ", ")
        return HStack(spacing: 10) {
            Image(systemName: "flame.fill")
                .foregroundColor(.accentOrange)
                .font(.system(size: 16, weight: .bold))
            VStack(alignment: .leading, spacing: 2) {
                Text("🔥 \(count) live \(cat) trends embedded")
                    .font(.system(size: 14, weight: .bold, design: .rounded))
                    .foregroundColor(.textPrimary)
                Text(names.isEmpty ? "Open in Studio to see the showcase wall" : "incl. \(names)…")
                    .font(.system(size: 11, weight: .medium, design: .rounded))
                    .foregroundColor(.textSecondary)
                    .lineLimit(1)
            }
            Spacer()
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(
            LinearGradient(colors: [Color.accentOrange.opacity(0.18), Color.accentPrimary.opacity(0.10)], startPoint: .topLeading, endPoint: .bottomTrailing)
        )
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(Color.accentOrange.opacity(0.35), lineWidth: 1)
        )
    }

    @ViewBuilder
    private var content: some View {
        switch artifactType {
        case .code(let code):
            ScrollView(.horizontal, showsIndicators: true) {
                Text(code)
                    .font(.system(.footnote, design: .monospaced))
                    .foregroundColor(.textPrimary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(16)
                    .background(Color.cardBackground)
                    .clipShape(RoundedRectangle(cornerRadius: 20))
            }
        case .gdd(let rows):
            VStack(spacing: 10) {
                ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                    HStack(alignment: .top) {
                        Text(row.0)
                            .font(.appHeadline)
                            .foregroundColor(.textPrimary)
                        Spacer()
                        Text(row.1)
                            .font(.appBody)
                            .foregroundColor(.textSecondary)
                            .multilineTextAlignment(.trailing)
                    }
                    .padding(16)
                    .background(Color.cardBackground)
                    .clipShape(RoundedRectangle(cornerRadius: 18))
                }
            }
        case .text(let text):
            Text(text)
                .font(.appBody)
                .foregroundColor(.textPrimary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(16)
                .background(Color.cardBackground)
                .clipShape(RoundedRectangle(cornerRadius: 20))
        case .projectBundle(let summary, let files):
            VStack(alignment: .leading, spacing: 14) {
                Text(summary)
                    .font(.appBody)
                    .foregroundColor(.textPrimary)
                ForEach(files, id: \.self) { file in
                    HStack {
                        Image(systemName: "shippingbox.fill")
                            .foregroundColor(.accentPrimary)
                        Text(file)
                            .font(.appCallout)
                            .foregroundColor(.textSecondary)
                    }
                    .padding(14)
                    .background(Color.cardBackground)
                    .clipShape(RoundedRectangle(cornerRadius: 16))
                }
            }
        case .robloxBinary(let kind, let notes):
            VStack(alignment: .leading, spacing: 14) {
                Label(kind.uppercased(), systemImage: "shippingbox.fill")
                    .font(.appHeadline)
                    .foregroundColor(.textPrimary)
                Text("A native binary artifact is available for desktop Studio validation.")
                    .font(.appBody)
                    .foregroundColor(.textPrimary)
                ForEach(notes, id: \.self) { note in
                    Text(note)
                        .font(.appCallout)
                        .foregroundColor(.textSecondary)
                        .padding(14)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.cardBackground)
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                }
            }
        case .blockyPet3D(let spec, let element, let rarity, let species, let isFlying, let notes):
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 8) {
                    Image(systemName: "pawprint.circle.fill")
                        .font(.title2)
                        .foregroundColor(.textPrimary)
                    Text(spec.name ?? "Pet")
                        .font(.appHeadline)
                        .foregroundColor(.textPrimary)
                    Spacer()
                    BlockyPetBadge(text: rarity, tint: BlockyPetPalette.rarityTint(rarity))
                    BlockyPetBadge(text: element, tint: BlockyPetPalette.elementTint(element))
                    if isFlying { BlockyPetBadge(text: "Flying", tint: .blue) }
                }
                Text(species.capitalized)
                    .font(.appCallout)
                    .foregroundColor(.textSecondary)
                BlockyPet3DSceneView(spec: spec, element: element)
                    .frame(height: 360)
                    .background(Color.black.opacity(0.4))
                    .clipShape(RoundedRectangle(cornerRadius: 18))
                Text("Drag to rotate · pinch to zoom · this is exactly how the pet looks in Roblox.")
                    .font(.appCaption)
                    .foregroundColor(.textSecondary)
                    .multilineTextAlignment(.leading)
                ForEach(notes, id: \.self) { note in
                    Text(note)
                        .font(.appCallout)
                        .foregroundColor(.textSecondary)
                        .padding(12)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.cardBackground)
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                }
            }
        case .media(let kind, let remoteURL):
            if kind == "audio", let remoteURL {
                AudioPlayerCard(url: remoteURL)
            } else {
                VStack(alignment: .leading, spacing: 14) {
                    Label(kind.uppercased(), systemImage: "photo")
                        .font(.appHeadline)
                        .foregroundColor(.textPrimary)
                    Text("Image artifact is ready. Use export to open or download the generated asset.")
                        .font(.appBody)
                        .foregroundColor(.textSecondary)
                    if let remoteURL {
                        AsyncImage(url: remoteURL) { phase in
                            switch phase {
                            case .success(let image):
                                image
                                    .resizable()
                                    .aspectRatio(contentMode: .fit)
                                    .frame(maxWidth: .infinity, maxHeight: 300)
                                    .clipShape(RoundedRectangle(cornerRadius: 14))
                            default:
                                ProgressView()
                                    .frame(maxWidth: .infinity, minHeight: 120)
                            }
                        }
                    }
                }
                .padding(16)
                .background(Color.cardBackground)
                .clipShape(RoundedRectangle(cornerRadius: 20))
            }
        case .model3D(let bodyType, let accentColor, let textureURL, let caption, let archetype):
            VStack(spacing: 14) {
                GenerationModelPreview(bodyType: bodyType, accentColor: accentColor, textureURL: textureURL, archetype: archetype)
                    .frame(height: 340)
                    .clipShape(RoundedRectangle(cornerRadius: 24))
                    .overlay(
                        RoundedRectangle(cornerRadius: 24)
                            .stroke(accentColor.opacity(0.3), lineWidth: 1)
                    )

                if !caption.isEmpty {
                    Text(caption)
                        .font(.appBody)
                        .foregroundColor(.textSecondary)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: .infinity)
                        .padding(.horizontal, 8)
                }

                HStack(spacing: 8) {
                    Image(systemName: "hand.draw")
                        .foregroundColor(.textSecondary.opacity(0.6))
                    Text("Drag to rotate")
                        .font(.appCaption)
                        .foregroundColor(.textSecondary.opacity(0.6))
                }
                .padding(.top, 2)
            }
            .padding(16)
            .background(Color.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: 20))
        case .realModel3D(let modelURL, let thumbnailURL, let caption):
            VStack(spacing: 14) {
                RealModel3DPreview(modelURL: modelURL)
                    .frame(height: 380)
                    .clipShape(RoundedRectangle(cornerRadius: 24))
                    .overlay(
                        RoundedRectangle(cornerRadius: 24)
                            .stroke(Color.accentPrimary.opacity(0.3), lineWidth: 1)
                    )

                if let thumbnailURL {
                    AsyncImage(url: thumbnailURL) { phase in
                        switch phase {
                        case .success(let image):
                            image
                                .resizable()
                                .aspectRatio(contentMode: .fit)
                                .frame(maxHeight: 120)
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                        default:
                            EmptyView()
                        }
                    }
                }

                if !caption.isEmpty {
                    Text(caption)
                        .font(.appBody)
                        .foregroundColor(.textSecondary)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: .infinity)
                        .padding(.horizontal, 8)
                }

                HStack(spacing: 8) {
                    Image(systemName: "cube.transparent")
                        .foregroundColor(.accentPrimary.opacity(0.8))
                    TechnicalText("AI-generated 3D model", baseFont: .appCaption, technicalFont: .appTechnical(size: 12, weight: .semibold))
                        .foregroundColor(.textSecondary.opacity(0.7))
                    Spacer()
                    Image(systemName: "hand.draw")
                        .foregroundColor(.textSecondary.opacity(0.6))
                    Text("Drag to rotate")
                        .font(.appCaption)
                        .foregroundColor(.textSecondary.opacity(0.6))
                }
                .padding(.top, 2)
            }
            .padding(16)
            .background(Color.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: 20))
        case .candidateGrid3D(let candidates, let selectedIndex, let caption):
            CandidateGrid3DView(
                candidates: candidates,
                initialSelectedIndex: selectedIndex,
                caption: caption,
                onRegenerate: nil
            )
        case .interactive3D(_, let modelURL):
            VStack(spacing: 14) {
                WebGLBViewer(modelURL: modelURL)
                    .frame(height: 380)
                    .clipShape(RoundedRectangle(cornerRadius: 24))
                    .overlay(
                        RoundedRectangle(cornerRadius: 24)
                            .stroke(Color.accentPrimary.opacity(0.3), lineWidth: 1)
                    )

                HStack(spacing: 8) {
                    Image(systemName: "cube.transparent")
                        .foregroundColor(.accentPrimary.opacity(0.8))
                    TechnicalText("AI-generated 3D model", baseFont: .appCaption, technicalFont: .appTechnical(size: 12, weight: .semibold))
                        .foregroundColor(.textSecondary.opacity(0.7))
                    Spacer()
                    Image(systemName: "hand.draw")
                        .foregroundColor(.textSecondary.opacity(0.6))
                    Text("Drag to rotate · Pinch to zoom")
                        .font(.appCaption)
                        .foregroundColor(.textSecondary.opacity(0.6))
                }
                .padding(.top, 2)
            }
            .padding(16)
            .background(Color.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: 20))
        case .pipeline(let stages):
            let hasAnyProcessing = stages.contains(where: \.isProcessing)
            let clothingPreviewStage = stages.first(where: { stage in
                guard stage.isCompleted, let artifactType = stage.artifactType else { return false }
                if case .clothingPreview = artifactType { return true }
                return false
            })
            let clothingTextureImageStage = stages.first(where: { stage in
                guard stage.id == "clothing_texture", stage.isCompleted, let artifactType = stage.artifactType else { return false }
                if case .media = artifactType { return true }
                return false
            })
            let conceptStage = stages.first(where: { $0.id == "concept_image" && $0.isCompleted && $0.artifactType != nil })
            let meshStage = stages.first(where: { $0.id == "mesh_3d" && $0.isCompleted && $0.artifactType != nil })
            // Game builds have no `concept_image` stage — use `build_scene` as
            // the hero thumbnail source. Backend tags `preview-texture.png`
            // with stageId='build_scene' so it lands here.
            let gameSceneStage = stages.first(where: { stage in
                guard stage.id == "build_scene", stage.isCompleted, let type = stage.artifactType else { return false }
                if case .media = type { return true }
                return false
            })
            let buildingPreviewStage = stages.first(where: { stage in
                guard stage.id == "generate_building_preview", stage.isCompleted, let type = stage.artifactType else { return false }
                if case .media = type { return true }
                return false
            })
            let mapPreviewStage = stages.first(where: { stage in
                guard stage.id == "generate_map_preview", stage.isCompleted, let type = stage.artifactType else { return false }
                if case .media = type { return true }
                return false
            })
            let lastInfoStage = stages.last(where: { $0.isCompleted && $0.artifactType != nil && $0.id != "concept_image" && $0.id != "mesh_3d" && $0.id != "build_scene" })

            VStack(alignment: .leading, spacing: 14) {
                if let clothingPreviewStage, case .clothingPreview(let shirtURL, let pantsURL) = clothingPreviewStage.artifactType {
                    ClothingPreview3DView(shirtTextureURL: shirtURL, pantsTextureURL: pantsURL)
                        .frame(maxWidth: .infinity, minHeight: 300, maxHeight: 340)
                        .clipShape(RoundedRectangle(cornerRadius: 18))
                    HStack(spacing: 6) {
                        Image(systemName: "tshirt.fill")
                            .foregroundColor(.accentPrimary.opacity(0.8))
                        Text("Clothing on R15 avatar")
                            .font(.appCaption)
                            .foregroundColor(.textSecondary.opacity(0.7))
                    }
                } else if let clothingTextureImageStage,
                          case .media(_, let url) = clothingTextureImageStage.artifactType,
                          let url {
                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .success(let image):
                            image
                                .resizable()
                                .aspectRatio(contentMode: .fit)
                                .frame(maxWidth: .infinity, maxHeight: 300)
                                .clipShape(RoundedRectangle(cornerRadius: 18))
                        default:
                            ProgressView()
                                .frame(maxWidth: .infinity, minHeight: 120)
                        }
                    }
                    HStack(spacing: 6) {
                        Image(systemName: "photo")
                            .foregroundColor(.accentPrimary.opacity(0.8))
                        Text("2D clothing preview (texture fallback)")
                            .font(.appCaption)
                            .foregroundColor(.textSecondary.opacity(0.7))
                    }
                } else if let conceptStage, case .media(_, let url) = conceptStage.artifactType, let url {
                    let conceptCaption = conceptStage.title.localizedCaseInsensitiveContains("NPC") ? conceptStage.title : "AI-generated concept"
                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .success(let image):
                            image
                                .resizable()
                                .aspectRatio(contentMode: .fit)
                                .frame(maxWidth: .infinity, maxHeight: 300)
                                .clipShape(RoundedRectangle(cornerRadius: 18))
                        default:
                            ProgressView()
                                .frame(maxWidth: .infinity, minHeight: 120)
                        }
                    }
                    HStack(spacing: 6) {
                        Image(systemName: "sparkles")
                            .foregroundColor(.accentPrimary.opacity(0.8))
                        Text(conceptCaption)
                            .font(.appCaption)
                            .foregroundColor(.textSecondary.opacity(0.7))
                    }
                } else if let gameSceneStage, case .media(_, let url) = gameSceneStage.artifactType, let url {
                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .success(let image):
                            image
                                .resizable()
                                .aspectRatio(contentMode: .fit)
                                .frame(maxWidth: .infinity, maxHeight: 300)
                                .clipShape(RoundedRectangle(cornerRadius: 18))
                        default:
                            ProgressView()
                                .frame(maxWidth: .infinity, minHeight: 120)
                        }
                    }
                    HStack(spacing: 6) {
                        Image(systemName: "photo.stack")
                            .foregroundColor(.accentPrimary.opacity(0.8))
                        TechnicalText("AI-rendered scene preview", baseFont: .appCaption, technicalFont: .appTechnical(size: 12, weight: .semibold))
                            .foregroundColor(.textSecondary.opacity(0.7))
                    }
                } else if let buildingPreviewStage, case .media(_, let url) = buildingPreviewStage.artifactType, let url {
                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .success(let image):
                            image
                                .resizable()
                                .aspectRatio(contentMode: .fit)
                                .frame(maxWidth: .infinity, maxHeight: 300)
                                .clipShape(RoundedRectangle(cornerRadius: 18))
                        default:
                            ProgressView()
                                .frame(maxWidth: .infinity, minHeight: 120)
                        }
                    }
                    HStack(spacing: 6) {
                        Image(systemName: "building.2.fill")
                            .foregroundColor(.accentPrimary.opacity(0.8))
                        Text("2D building preview")
                            .font(.appCaption)
                            .foregroundColor(.textSecondary.opacity(0.7))
                    }
                } else if let mapPreviewStage, case .media(_, let url) = mapPreviewStage.artifactType, let url {
                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .success(let image):
                            image
                                .resizable()
                                .aspectRatio(contentMode: .fit)
                                .frame(maxWidth: .infinity, maxHeight: 300)
                                .clipShape(RoundedRectangle(cornerRadius: 18))
                        default:
                            ProgressView()
                                .frame(maxWidth: .infinity, minHeight: 120)
                        }
                    }
                    HStack(spacing: 6) {
                        Image(systemName: "map.fill")
                            .foregroundColor(.accentPrimary.opacity(0.8))
                        Text("2D map preview")
                            .font(.appCaption)
                            .foregroundColor(.textSecondary.opacity(0.7))
                    }
                }

                // Concept approval buttons — shown when ChatStore says we're awaiting approval
                if conceptStage != nil,
                   onApproveConcept != nil || onRegenerateConcept != nil {
                    VStack(spacing: 10) {
                        Text("Does this concept look good?")
                            .font(.appHeadline)
                            .foregroundColor(.textPrimary)

                        if isProcessingConceptAction {
                            ProgressView()
                                .frame(maxWidth: .infinity, minHeight: 44)
                        } else {
                            if let onApprove = onApproveConcept {
                                Button(action: onApprove) {
                                    HStack(spacing: 8) {
                                        Image(systemName: "checkmark.circle.fill")
                                        Text(approveConceptButtonLabel)
                                    }
                                    .font(.appHeadline)
                                    .foregroundColor(.white)
                                    .frame(maxWidth: .infinity, minHeight: 48)
                                    .background(Color.accentPrimary)
                                    .clipShape(RoundedRectangle(cornerRadius: 14))
                                }
                            }
                            if let onRegenerate = onRegenerateConcept {
                                TextField("What to change? (optional)", text: $conceptFeedback)
                                    .font(.appBody)
                                    .foregroundColor(.textPrimary)
                                    .padding(12)
                                    .background(Color.white.opacity(0.9))
                                    .clipShape(RoundedRectangle(cornerRadius: 12))
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 12)
                                            .stroke(Color.accentPrimary.opacity(0.3), lineWidth: 1)
                                    )

                                Button(action: { onRegenerate(conceptFeedback.isEmpty ? nil : conceptFeedback) }) {
                                    HStack(spacing: 8) {
                                        Image(systemName: "arrow.clockwise")
                                        Text(conceptFeedback.isEmpty ? "Regenerate concept" : "Regenerate with changes")
                                    }
                                    .font(.appBody)
                                    .foregroundColor(.accentPrimary)
                                    .frame(maxWidth: .infinity, minHeight: 44)
                                    .background(Color.accentPrimary.opacity(0.1))
                                    .clipShape(RoundedRectangle(cornerRadius: 14))
                                }
                            }
                        }
                    }
                    .padding(.vertical, 8)
                }

                // Concept approval gallery — multiple concept images
                if !heroConcepts.isEmpty, onApproveHeroConcepts != nil {
                    VStack(spacing: 14) {
                        Text("Pick your concepts")
                            .font(.appHeadline)
                            .foregroundColor(.textPrimary)

                        Text("Tap to select which concepts become 3D assets")
                            .font(.appCaption)
                            .foregroundColor(.textSecondary)

                        ForEach(Array(heroConcepts.enumerated()), id: \.offset) { index, concept in
                            VStack(spacing: 8) {
                                AsyncImage(url: URL(string: concept.imageUrl)) { phase in
                                    switch phase {
                                    case .success(let image):
                                        image
                                            .resizable()
                                            .aspectRatio(contentMode: .fit)
                                            .frame(maxWidth: .infinity, maxHeight: 200)
                                            .clipShape(RoundedRectangle(cornerRadius: 14))
                                            .overlay(
                                                RoundedRectangle(cornerRadius: 14)
                                                    .stroke(concept.approved ? Color.green : Color.clear, lineWidth: 3)
                                            )
                                    default:
                                        ProgressView()
                                            .frame(maxWidth: .infinity, minHeight: 100)
                                    }
                                }
                                .onTapGesture {
                                    onToggleHeroConcept?(index)
                                }

                                HStack {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(concept.name)
                                            .font(.appBody)
                                            .foregroundColor(.textPrimary)
                                        Text(concept.description)
                                            .font(.appCaption)
                                            .foregroundColor(.textSecondary)
                                            .lineLimit(2)
                                    }
                                    Spacer()
                                    // Approve toggle
                                    Button(action: {
                                        print("[HERO_UI] Toggle tapped index=\(index)")
                                        onToggleHeroConcept?(index)
                                    }) {
                                        Image(systemName: concept.approved ? "checkmark.circle.fill" : "circle")
                                            .font(.title2)
                                            .foregroundColor(concept.approved ? .green : .textSecondary.opacity(0.5))
                                            .frame(minWidth: 44, minHeight: 44)
                                    }
                                    .buttonStyle(.borderless)
                                    // Regenerate button — tap to regenerate immediately
                                    Button(action: {
                                        print("[HERO_UI] Regenerate tapped index=\(index), closure nil=\(onRegenerateHeroConcept == nil)")
                                        onRegenerateHeroConcept?(index, nil)
                                    }) {
                                        Image(systemName: "arrow.clockwise")
                                            .font(.title3)
                                            .foregroundColor(.accentPrimary)
                                            .frame(minWidth: 44, minHeight: 44)
                                    }
                                    .buttonStyle(.borderless)
                                }
                            }
                            .padding(10)
                            .background(Color.white.opacity(concept.approved ? 0.15 : 0.05))
                            .clipShape(RoundedRectangle(cornerRadius: 16))
                        }

                        if isProcessingConceptAction {
                            ProgressView()
                                .frame(maxWidth: .infinity, minHeight: 44)
                        } else {
                            let approvedCount = heroConcepts.filter(\.approved).count
                            Button(action: {
                                print("[HERO_UI] 'Generate in 3D' tapped. approvedCount=\(approvedCount), closure nil=\(onApproveHeroConcepts == nil)")
                                onApproveHeroConcepts?()
                            }) {
                                HStack(spacing: 8) {
                                    Image(systemName: "checkmark.circle.fill")
                                    Text(approvedCount > 0
                                        ? "Generate \(approvedCount) asset\(approvedCount > 1 ? "s" : "") in 3D"
                                        : "Select at least one concept")
                                }
                                .font(.appHeadline)
                                .foregroundColor(.white)
                                .frame(maxWidth: .infinity, minHeight: 48)
                                .background(approvedCount > 0 ? Color.accentPrimary : Color.gray)
                                .clipShape(RoundedRectangle(cornerRadius: 14))
                            }
                            .buttonStyle(.borderless)
                            .disabled(approvedCount == 0)
                        }
                    }
                    .padding(.vertical, 8)
                }

                if let meshStage {
                    if case .interactive3D(let thumbURL, _) = meshStage.artifactType {
                        Interactive3DThumbnail(thumbnailURL: thumbURL, artifactType: meshStage.artifactType!)
                    } else if case .media(_, let thumbURL) = meshStage.artifactType, let thumbURL {
                        Interactive3DThumbnail(thumbnailURL: thumbURL, artifactType: meshStage.artifactType!)
                    } else if case .model3D = meshStage.artifactType {
                        HStack(spacing: 8) {
                            Image(systemName: "cube.transparent.fill")
                                .font(.system(size: 28))
                                .foregroundColor(.accentPrimary)
                            VStack(alignment: .leading, spacing: 4) {
                                Text("3D Model Generated")
                                    .font(.appHeadline)
                                    .foregroundColor(.textPrimary)
                                Text("GLB/FBX ready for Studio export")
                                    .font(.appCaption)
                                    .foregroundColor(.textSecondary)
                            }
                            Spacer()
                        }
                        .padding(14)
                        .background(Color.accentPrimary.opacity(0.08))
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                    }
                }

                Text("Pipeline")
                    .font(.appHeadline)
                    .foregroundColor(.textPrimary)

                ForEach(Array(stages.enumerated()), id: \.element.id) { index, stage in
                    PipelineStageRow(stage: stage, index: index, totalStages: stages.count)
                }

                if let processingStage = stages.first(where: \.isProcessing) {
                    Divider().padding(.vertical, 4)
                    pipelineStageCard(processingStage)
                } else if let lastInfoStage {
                    Divider().padding(.vertical, 4)
                    pipelineStageCard(lastInfoStage)
                }

                if hasAnyProcessing {
                    let completedCount = stages.filter(\.isCompleted).count
                    let pct = Int(Double(completedCount) / Double(max(stages.count, 1)) * 100)
                    HStack {
                        ProgressView(value: Double(completedCount), total: Double(stages.count))
                            .tint(.accentPrimary)
                        Text("\(pct)%")
                            .font(.appCaption)
                            .foregroundColor(.textSecondary)
                    }
                    .padding(.top, 4)
                }
            }
            .padding(16)
            .background(Color.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: 20))
        case .clothingPreview(let shirtURL, let pantsURL):
            VStack(spacing: 14) {
                ClothingPreview3DView(shirtTextureURL: shirtURL, pantsTextureURL: pantsURL)
                    .frame(maxWidth: .infinity, minHeight: 300, maxHeight: 380)
                    .clipShape(RoundedRectangle(cornerRadius: 18))
                HStack(spacing: 6) {
                    Image(systemName: "tshirt.fill")
                        .foregroundColor(.accentPrimary.opacity(0.8))
                    Text("Clothing on R15 avatar")
                        .font(.appCaption)
                        .foregroundColor(.textSecondary.opacity(0.7))
                }
            }
            .padding(16)
            .background(Color.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: 20))
        case .animationPreview(let name, let rig, let keyframeCount, let looped, let animationType, let notes, let previewMediaURL, let previewIsVideo):
            AnimationPreviewCard(
                name: name,
                rig: rig,
                keyframeCount: keyframeCount,
                looped: looped,
                animationType: animationType,
                notes: notes,
                previewMediaURL: previewMediaURL,
                previewIsVideo: previewIsVideo
            )
        case .uiPreview(let code, let uiType, let visualStyle, let uiTitle):
            uiPreviewContent(code: code, uiType: uiType, visualStyle: visualStyle, uiTitle: uiTitle)
        case .unavailable(let message):
            ContentUnavailableView(
                "Preview Not Ready",
                systemImage: "sparkles.rectangle.stack",
                description: Text(message)
            )
            .frame(maxWidth: .infinity, minHeight: 320)
        }
    }

    @ViewBuilder
    private func pipelineStageCard(_ stage: PipelineStagePreview) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(stage.title)
                    .font(.appHeadline)
                    .foregroundColor(.textPrimary)
                Spacer()
                stageStatusBadge(stage)
            }

            Text(stage.summary)
                .font(.appBody)
                .foregroundColor(.textSecondary)

            if let artifactType = stage.artifactType {
                stageContent(artifactType)
            } else if stage.isProcessing {
                StageProcessingLoader(stageId: stage.id, title: stage.title)
                    .frame(maxWidth: .infinity, minHeight: 280)
            } else if stage.isPending {
                VStack(spacing: 12) {
                    Image(systemName: "clock.fill")
                        .font(.system(size: 36))
                        .foregroundColor(.textTertiary)
                    Text("Waiting...")
                        .font(.appBody)
                        .foregroundColor(.textSecondary)
                }
                .frame(maxWidth: .infinity, minHeight: 280)
            } else if stage.isFailed {
                VStack(spacing: 12) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.system(size: 36))
                        .foregroundColor(.red)
                    Text("Stage failed")
                        .font(.appBody)
                        .foregroundColor(.textSecondary)
                    Text(stage.summary)
                        .font(.appCaption)
                        .foregroundColor(.textTertiary)
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity, minHeight: 280)
            } else {
                VStack(spacing: 12) {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 36))
                        .foregroundColor(.accentPrimary)
                    Text("Done")
                        .font(.appBody)
                        .foregroundColor(.textSecondary)
                }
                .frame(maxWidth: .infinity, minHeight: 280)
            }
        }
        .padding(12)
        .background(Color.white.opacity(0.5))
        .clipShape(RoundedRectangle(cornerRadius: 18))
    }

    @ViewBuilder
    private func stageStatusBadge(_ stage: PipelineStagePreview) -> some View {
        HStack(spacing: 5) {
            if stage.isWaitingForApproval {
                Image(systemName: "hand.tap.fill")
                    .foregroundColor(.accentPrimary)
                    .font(.system(size: 14))
            } else if stage.isProcessing {
                ProgressView()
                    .scaleEffect(0.7)
            } else if stage.isCompleted {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundColor(.accentPrimary)
                    .font(.system(size: 14))
            } else if stage.isFailed {
                Image(systemName: "xmark.circle.fill")
                    .foregroundColor(.red)
                    .font(.system(size: 14))
            }
            Text(stage.statusLabel)
                .font(.appCaption)
                .foregroundColor(stage.isCompleted || stage.isWaitingForApproval ? .accentPrimary : (stage.isFailed ? .red : .textSecondary))
        }
    }

    @ViewBuilder
    private func stageContent(_ artifactType: ArtifactType) -> some View {
        switch artifactType {
        case .media(let kind, let remoteURL):
            if kind == "audio", let remoteURL {
                AudioPlayerCard(url: remoteURL)
            } else if let remoteURL {
                AsyncImage(url: remoteURL) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .aspectRatio(contentMode: .fit)
                            .frame(maxWidth: .infinity, maxHeight: 280)
                            .clipShape(RoundedRectangle(cornerRadius: 18))
                    default:
                        ProgressView()
                            .frame(maxWidth: .infinity, minHeight: 220)
                    }
                }
            }
        case .realModel3D(let modelURL, _, _):
            RealModel3DPreview(modelURL: modelURL)
                .frame(height: 280)
                .clipShape(RoundedRectangle(cornerRadius: 18))
        case .candidateGrid3D(let candidates, let selectedIndex, _):
            // Внутри pipeline-стадий рендерим только выбранного кандидата (компактно).
            if let candidate = candidates.indices.contains(selectedIndex) ? candidates[selectedIndex] : candidates.first {
                RealModel3DPreview(modelURL: candidate.modelURL)
                    .frame(height: 240)
                    .clipShape(RoundedRectangle(cornerRadius: 18))
            } else {
                Text("Generating candidates…")
                    .font(.appCaption)
                    .foregroundColor(.textSecondary)
                    .frame(maxWidth: .infinity, minHeight: 120)
            }
        case .interactive3D(_, let modelURL):
            WebGLBViewer(modelURL: modelURL)
                .frame(height: 320)
                .clipShape(RoundedRectangle(cornerRadius: 18))
        case .robloxBinary(let kind, let notes):
            VStack(alignment: .leading, spacing: 10) {
                Text(kind.uppercased())
                    .font(.appHeadline)
                    .foregroundColor(.textPrimary)
                ForEach(notes, id: \.self) { note in
                    Text(note)
                        .font(.appCaption)
                        .foregroundColor(.textSecondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(Color.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: 18))
        case .projectBundle(let summary, let files):
            VStack(alignment: .leading, spacing: 10) {
                Text(summary)
                    .font(.appBody)
                    .foregroundColor(.textSecondary)
                ForEach(files, id: \.self) { file in
                    Text(file)
                        .font(.appCaption)
                        .foregroundColor(.textPrimary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(Color.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: 18))
        case .text(let text), .code(let text):
            ScrollView {
                Text(text)
                    .font(.appCaption)
                    .foregroundColor(.textPrimary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .frame(maxHeight: 220)
            .padding(12)
            .background(Color.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: 18))
        case .unavailable(let message):
            Text(message)
                .font(.appBody)
                .foregroundColor(.textSecondary)
        case .gdd(let rows):
            VStack(alignment: .leading, spacing: 8) {
                ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                    Text("\(row.0): \(row.1)")
                        .font(.appCaption)
                        .foregroundColor(.textPrimary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(Color.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: 18))
        case .model3D(let bodyType, let accentColor, let textureURL, _, let archetype):
            GenerationModelPreview(bodyType: bodyType, accentColor: accentColor, textureURL: textureURL, archetype: archetype)
                .frame(height: 280)
                .clipShape(RoundedRectangle(cornerRadius: 18))
        case .clothingPreview(let shirtURL, let pantsURL):
            ClothingPreview3DView(shirtTextureURL: shirtURL, pantsTextureURL: pantsURL)
                .frame(height: 280)
                .clipShape(RoundedRectangle(cornerRadius: 18))
        case .blockyPet3D(let spec, let element, _, _, _, _):
            BlockyPet3DSceneView(spec: spec, element: element)
                .frame(height: 280)
                .background(Color.black.opacity(0.4))
                .clipShape(RoundedRectangle(cornerRadius: 18))
        case .animationPreview(let name, let rig, let keyframeCount, let looped, let animationType, let notes, let previewMediaURL, let previewIsVideo):
            AnimationPreviewCard(
                name: name,
                rig: rig,
                keyframeCount: keyframeCount,
                looped: looped,
                animationType: animationType,
                notes: notes,
                previewMediaURL: previewMediaURL,
                previewIsVideo: previewIsVideo
            )
        case .uiPreview(_, let uiType, let visualStyle, let uiTitle):
            WebUIPreviewView(uiType: uiType, visualStyle: visualStyle, title: uiTitle)
                .frame(height: 280)
                .clipShape(RoundedRectangle(cornerRadius: 18))
        case .pipeline:
            EmptyView()
        }
    }

    @ViewBuilder
    private func uiPreviewContent(code: String, uiType: String, visualStyle: String, uiTitle: String) -> some View {
        VStack(spacing: 14) {
            Picker("Preview Mode", selection: $uiPreviewTab) {
                Text("Visual").tag(0)
                Text("Code").tag(1)
            }
            .pickerStyle(.segmented)

            if uiPreviewTab == 0 {
                WebUIPreviewView(uiType: uiType, visualStyle: visualStyle, title: uiTitle)
                    .frame(maxWidth: .infinity, minHeight: 380, maxHeight: 440)
                    .clipShape(RoundedRectangle(cornerRadius: 24))
                    .overlay(
                        RoundedRectangle(cornerRadius: 24)
                            .stroke(Color.accentPrimary.opacity(0.2), lineWidth: 1)
                    )
                HStack(spacing: 6) {
                    Image(systemName: "rectangle.3.group.fill")
                        .foregroundColor(.accentPrimary.opacity(0.8))
                    Text("\(uiType.replacingOccurrences(of: "_", with: " ").capitalized) — \(visualStyle.capitalized) style")
                        .font(.appCaption)
                        .foregroundColor(.textSecondary.opacity(0.7))
                }
            } else {
                ScrollView(.horizontal, showsIndicators: true) {
                    Text(code)
                        .font(.system(.footnote, design: .monospaced))
                        .foregroundColor(.textPrimary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(16)
                }
                .frame(maxHeight: 400)
                .background(Color.cardBackground)
                .clipShape(RoundedRectangle(cornerRadius: 20))
            }
        }
        .padding(16)
        .background(Color.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 20))
    }

    private var actionBar: some View {
        VStack(spacing: 12) {
            if isGeneratingContent {
                HStack(spacing: 8) {
                    ProgressView()
                        .tint(.accentPrimary)
                    Text("Generation in progress…")
                        .font(.system(size: 14, weight: .semibold, design: .rounded))
                        .foregroundColor(.textSecondary)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
            }
            if case .code(let code) = artifactType {
                VStack(spacing: 4) {
                    PrimaryButton(
                        title: codeCopied ? "Copied!" : "Copy to Clipboard",
                        action: {
                            UIPasteboard.general.string = code
                            codeCopied = true
                            DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                                codeCopied = false
                            }
                        }
                    )
                    Text("Paste directly into a Script in Studio")
                        .font(.appCaption)
                        .foregroundColor(.textTertiary)
                }
            }
            if case .uiPreview(let code, _, _, _) = artifactType {
                if let onExportRBXM {
                    VStack(spacing: 4) {
                        PrimaryButton(title: "Export .rbxmx Files", action: onExportRBXM)
                        Text("ShopGui → StarterGui, Server → ServerScriptService")
                            .font(.appCaption)
                            .foregroundColor(.textTertiary)
                    }
                }
                if !code.isEmpty {
                    VStack(spacing: 4) {
                        PrimaryButton(
                            title: codeCopied ? "Copied!" : "Copy Code",
                            action: {
                                UIPasteboard.general.string = code
                                codeCopied = true
                                DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                                    codeCopied = false
                                }
                            },
                            style: .outline
                        )
                        Text("Full source code for customization")
                            .font(.appCaption)
                            .foregroundColor(.textTertiary)
                    }
                }
            }
            // 3D model export buttons (skip for .uiPreview — handled above)
            if case .uiPreview = artifactType {
                // Already rendered RBXM button above
            } else if onExportFBX != nil || onExportGLB != nil || onExportRBXM != nil {
                if let onExportFBX {
                    VStack(spacing: 4) {
                        PrimaryButton(title: "Export FBX (for Studio)", action: onExportFBX)
                        Text("Use Avatar Auto Setup for R15 rigging")
                            .font(.appCaption)
                            .foregroundColor(.textTertiary)
                    }
                }
                if let onExportGLB {
                    VStack(spacing: 4) {
                        PrimaryButton(title: "Export GLB (3D Model)", action: onExportGLB, style: .outline)
                        Text("Raw mesh — for Blender or other 3D tools")
                            .font(.appCaption)
                            .foregroundColor(.textTertiary)
                    }
                }
                if let onExportRBXM {
                    VStack(spacing: 4) {
                        if case .code = artifactType {
                            PrimaryButton(title: "Export Script (.rbxm)", action: onExportRBXM, style: .outline)
                            Text("Drag into Studio Explorer")
                                .font(.appCaption)
                                .foregroundColor(.textTertiary)
                        } else if case .media(let kind, _) = artifactType, kind == "audio" {
                            PrimaryButton(title: "Export RBXM (with Sound)", action: onExportRBXM, style: .outline)
                            Text("Drag into Workspace in Studio — audio is embedded")
                                .font(.appCaption)
                                .foregroundColor(.textTertiary)
                        } else if case .media(let kind, _) = artifactType, kind == "vehicle_preview" {
                            PrimaryButton(title: "Export Vehicle RBXM", action: onExportRBXM, style: .outline)
                            Text("DriveSeat, interior, physics, sounds, and VFX — drag into Workspace")
                                .font(.appCaption)
                                .foregroundColor(.textTertiary)
                        } else if case .robloxBinary(let kind, _) = artifactType, kind.lowercased() == "rbxl" {
                            PrimaryButton(title: "Export RBXL", action: onExportRBXM, style: .outline)
                            Text("Open the place file directly in Studio")
                                .font(.appCaption)
                                .foregroundColor(.textTertiary)
                        } else {
                            PrimaryButton(title: "Export RBXM (Pre-rigged)", action: onExportRBXM, style: .outline)
                            Text("R15 skeleton with colors — drag into Studio")
                                .font(.appCaption)
                                .foregroundColor(.textTertiary)
                        }
                    }
                }
            } else if case .unavailable = artifactType {
                EmptyView()
            } else {
                PrimaryButton(title: "Export", action: onExport)
            }
            if publishContext != nil {
                PrimaryButton(
                    title: "Publish To Community",
                    action: { showPublishSheet = true },
                    style: .outline
                )
            }
        }
        .disabled(isGeneratingContent)
        .opacity(isGeneratingContent ? 0.5 : 1.0)
    }

    /// Decal approval sheet appears when backend pushed pending candidates.
    /// Hide once candidates clear (server resumes the pipeline).
    private func syncDecalSheetVisibility() {
        let shouldShow = !decalCandidates.isEmpty
        if shouldShow != showDecalApprovalSheet {
            showDecalApprovalSheet = shouldShow
        }
    }
}

// MARK: - Audio Player Card

private class AudioPlayerViewModel: ObservableObject {
    let player: AVPlayer
    @Published var isPlaying = false
    @Published var currentTime: TimeInterval = 0
    @Published var duration: TimeInterval = 0
    @Published var isReady = false

    private var timeObserver: Any?
    private var cancellables = Set<AnyCancellable>()

    init(url: URL) {
        let item = AVPlayerItem(url: url)
        self.player = AVPlayer(playerItem: item)

        item.publisher(for: \.status)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] status in
                guard let self, status == .readyToPlay else { return }
                let dur = item.duration
                if dur.isNumeric && !dur.isIndefinite {
                    self.duration = CMTimeGetSeconds(dur)
                }
                self.isReady = true
            }
            .store(in: &cancellables)

        timeObserver = player.addPeriodicTimeObserver(
            forInterval: CMTime(seconds: 0.25, preferredTimescale: 600),
            queue: .main
        ) { [weak self] time in
            guard let self else { return }
            self.currentTime = CMTimeGetSeconds(time)
            if self.duration > 0, self.currentTime >= self.duration - 0.1 {
                self.isPlaying = false
            }
        }

        NotificationCenter.default.publisher(for: .AVPlayerItemDidPlayToEndTime, object: item)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                self?.isPlaying = false
                self?.player.seek(to: .zero)
                self?.currentTime = 0
            }
            .store(in: &cancellables)
    }

    func togglePlayPause() {
        if isPlaying {
            player.pause()
        } else {
            if currentTime >= duration - 0.1 {
                player.seek(to: .zero)
                currentTime = 0
            }
            player.play()
        }
        isPlaying.toggle()
    }

    func seek(to time: TimeInterval) {
        let cmTime = CMTime(seconds: time, preferredTimescale: 600)
        player.seek(to: cmTime, toleranceBefore: .zero, toleranceAfter: .zero)
        currentTime = time
    }

    func pause() {
        player.pause()
        isPlaying = false
    }

    deinit {
        if let timeObserver {
            player.removeTimeObserver(timeObserver)
        }
        player.pause()
    }
}

private struct AudioPlayerCard: View {
    let url: URL
    @StateObject private var vm: AudioPlayerViewModel

    init(url: URL) {
        self.url = url
        _vm = StateObject(wrappedValue: AudioPlayerViewModel(url: url))
    }

    var body: some View {
        VStack(spacing: 16) {
            HStack(spacing: 10) {
                Image(systemName: "waveform")
                    .font(.system(size: 20))
                    .foregroundColor(.accentPrimary)
                Text("AUDIO")
                    .font(.appHeadline)
                    .foregroundColor(.textPrimary)
                Spacer()
                Text(formatTime(vm.duration))
                    .font(.system(.caption, design: .monospaced))
                    .foregroundColor(.textSecondary)
            }

            HStack(spacing: 16) {
                Button {
                    vm.togglePlayPause()
                } label: {
                    Image(systemName: vm.isPlaying ? "pause.circle.fill" : "play.circle.fill")
                        .font(.system(size: 44))
                        .foregroundColor(.accentPrimary)
                        .contentTransition(.symbolEffect(.replace))
                }
                .disabled(!vm.isReady)
                .opacity(vm.isReady ? 1 : 0.4)

                VStack(spacing: 4) {
                    Slider(
                        value: Binding(
                            get: { vm.currentTime },
                            set: { vm.seek(to: $0) }
                        ),
                        in: 0...max(vm.duration, 1)
                    )
                    .tint(.accentPrimary)

                    HStack {
                        Text(formatTime(vm.currentTime))
                        Spacer()
                        Text("-" + formatTime(max(vm.duration - vm.currentTime, 0)))
                    }
                    .font(.system(.caption2, design: .monospaced))
                    .foregroundColor(.textTertiary)
                }
            }

            if !vm.isReady {
                HStack(spacing: 8) {
                    ProgressView()
                        .scaleEffect(0.7)
                    Text("Loading audio…")
                        .font(.appCaption)
                        .foregroundColor(.textSecondary)
                }
            }
        }
        .padding(16)
        .background(Color.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 20))
        .onDisappear {
            vm.pause()
        }
    }

    private func formatTime(_ seconds: TimeInterval) -> String {
        guard seconds.isFinite, seconds >= 0 else { return "0:00" }
        let total = Int(seconds)
        let m = total / 60
        let s = total % 60
        return String(format: "%d:%02d", m, s)
    }
}

// MARK: - Pipeline Stage Row

private struct PipelineStageRow: View {
    let stage: GenerationPreviewView.PipelineStagePreview
    let index: Int
    let totalStages: Int

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                if stage.isCompleted {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 22))
                        .foregroundColor(.accentPrimary)
                } else if stage.isWaitingForApproval {
                    Image(systemName: "hand.tap.fill")
                        .font(.system(size: 20))
                        .foregroundColor(.accentPrimary)
                } else if stage.isProcessing {
                    ZStack {
                        Circle()
                            .stroke(Color.accentPrimary.opacity(0.2), lineWidth: 2.5)
                            .frame(width: 22, height: 22)
                        ProgressView()
                            .scaleEffect(0.6)
                            .tint(.accentPrimary)
                    }
                } else if stage.isFailed {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 22))
                        .foregroundColor(.red)
                } else {
                    Circle()
                        .stroke(Color.textTertiary.opacity(0.4), lineWidth: 2)
                        .frame(width: 22, height: 22)
                    Text("\(index + 1)")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(.textTertiary)
                }
            }
            .frame(width: 26, height: 26)

            Text(stage.title)
                .font(.appBody)
                .foregroundColor(stage.isProcessing ? .textPrimary : (stage.isCompleted ? .accentPrimary : .textSecondary))
                .fontWeight(stage.isProcessing ? .semibold : .regular)

            Spacer()

            if stage.isWaitingForApproval {
                Text("Needs approval")
                    .font(.appCaption)
                    .foregroundColor(.accentPrimary)
            } else if stage.isProcessing {
                Text("In progress")
                    .font(.appCaption)
                    .foregroundColor(.accentPrimary)
            } else if stage.isFailed {
                Text("Failed")
                    .font(.appCaption)
                    .foregroundColor(.red)
            }
        }
        .padding(.vertical, 6)
        .padding(.horizontal, 8)
        .background(stage.isProcessing ? Color.accentPrimary.opacity(0.06) : Color.clear)
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }
}

// MARK: - Animated Processing Loader

private struct StageProcessingLoader: View {
    let stageId: String
    let title: String

    @State private var estimatedProgress: Double = 0.0
    @State private var elapsedSeconds: Int = 0
    @State private var pulseOpacity: Double = 0.6
    @State private var exceededEstimate = false
    @State private var spinRotation: Double = 0

    private var isApprovalStage: Bool {
        stageId == "concept_approval" || stageId == "hero_approval"
    }

    private var estimatedDuration: TimeInterval {
        switch stageId {
        case "concept_image": return 25
        case "concept_approval", "hero_approval": return 0
        case "mesh_3d": return 360
        case "mesh_optimized": return 45
        case "rig_r15": return 40
        case "export_model": return 30
        case "export_rbxm": return 120
        default: return 90
        }
    }

    private var stageHint: String {
        if isApprovalStage {
            return "Select at least one concept to continue."
        }
        if exceededEstimate {
            switch stageId {
            case "mesh_3d": return "3D model is still generating on the server...\nThis can take up to 10 minutes for complex models."
            case "export_rbxm": return "Final export is still saving on the server...\nThis should not take too long; the app will stop if it goes stale."
            default: return "Still working, please wait..."
            }
        }
        switch stageId {
        case "concept_image": return "Generating concept artwork..."
        case "mesh_3d": return "AI is sculpting your 3D model..."
        case "mesh_optimized": return "Optimizing geometry & polygons..."
        case "rig_r15": return "Auto-rigging for R15..."
        case "export_model": return "Exporting character model..."
        case "export_rbxm": return "Finalizing Studio package..."
        default: return "Processing \(title)..."
        }
    }

    var body: some View {
        VStack(spacing: 20) {
            if isApprovalStage {
                ZStack {
                    Circle()
                        .stroke(Color.accentPrimary.opacity(0.15), lineWidth: 8)
                        .frame(width: 100, height: 100)

                    Image(systemName: "hand.tap.fill")
                        .font(.system(size: 34, weight: .semibold))
                        .foregroundColor(.accentPrimary)
                        .opacity(pulseOpacity)
                }
            } else if exceededEstimate {
                ZStack {
                    Circle()
                        .stroke(Color.accentPrimary.opacity(0.15), lineWidth: 8)
                        .frame(width: 100, height: 100)

                    Circle()
                        .trim(from: 0, to: 0.25)
                        .stroke(
                            Color.accentPrimary,
                            style: StrokeStyle(lineWidth: 8, lineCap: .round)
                        )
                        .frame(width: 100, height: 100)
                        .rotationEffect(.degrees(spinRotation))

                    VStack(spacing: 2) {
                        Image(systemName: "hourglass")
                            .font(.system(size: 20))
                            .foregroundColor(.accentPrimary)
                        Text("\(elapsedSeconds)s")
                            .font(.system(size: 14, weight: .semibold, design: .rounded))
                            .foregroundColor(.textSecondary)
                    }
                }
            } else {
                ZStack {
                    Circle()
                        .stroke(Color.accentPrimary.opacity(0.15), lineWidth: 8)
                        .frame(width: 100, height: 100)

                    Circle()
                        .trim(from: 0, to: estimatedProgress)
                        .stroke(
                            AngularGradient(
                                colors: [.accentPrimary, .accentPrimary.opacity(0.5)],
                                center: .center
                            ),
                            style: StrokeStyle(lineWidth: 8, lineCap: .round)
                        )
                        .frame(width: 100, height: 100)
                        .rotationEffect(.degrees(-90))

                    Text("\(Int(estimatedProgress * 100))%")
                        .font(.system(size: 24, weight: .bold, design: .rounded))
                        .foregroundColor(.accentPrimary)
                }
            }

            Text(stageHint)
                .font(.appBody)
                .foregroundColor(.textSecondary)
                .multilineTextAlignment(.center)
                .opacity(pulseOpacity)

            if isApprovalStage {
                Text("No 3D generation is running yet. It resumes after approval.")
                    .font(.appCaption)
                    .foregroundColor(.textTertiary)
                    .multilineTextAlignment(.center)
            } else if !exceededEstimate {
                let remaining = Int(max(estimatedDuration * (1 - estimatedProgress), 1))
                Text("~\(remaining)s remaining")
                    .font(.appCaption)
                    .foregroundColor(.textTertiary)
            } else {
                Text(stageId == "export_rbxm" ? "Taking longer than expected — checking export status" : "Taking longer than expected — this is normal for AI 3D generation")
                    .font(.appCaption)
                    .foregroundColor(.textTertiary)
                    .multilineTextAlignment(.center)
            }
        }
        .onAppear {
            if !isApprovalStage {
                startEstimatedProgress()
            }
            withAnimation(.easeInOut(duration: 1.2).repeatForever(autoreverses: true)) {
                pulseOpacity = 1.0
            }
        }
    }

    private func startEstimatedProgress() {
        let tickInterval: TimeInterval = 1.0
        let totalTicks = estimatedDuration / tickInterval
        var tick = 0.0
        Timer.scheduledTimer(withTimeInterval: tickInterval, repeats: true) { timer in
            tick += 1
            elapsedSeconds = Int(tick)

            if tick > totalTicks && !exceededEstimate {
                withAnimation(.spring(response: 0.5)) {
                    exceededEstimate = true
                }
                withAnimation(.linear(duration: 1.5).repeatForever(autoreverses: false)) {
                    spinRotation = 360
                }
            }

            if !exceededEstimate {
                let linear = tick / totalTicks
                let eased = 1 - pow(1 - min(linear, 1), 3)
                let capped = min(eased * 0.92, 0.92)
                withAnimation(.linear(duration: tickInterval)) {
                    estimatedProgress = capped
                }
            }
        }
    }

}

// MARK: - Blocky pet badges (rarity / element / flying chips)
//
// Free-standing helpers — defining these as instance methods on
// GenerationPreviewView caused "cannot find petBadge in scope" inside
// the @ViewBuilder `content` switch (Swift's result-builder lookup at
// case sites doesn't always reach methods declared further down the
// struct's body). Lifting them to top-level types sidesteps the issue.

struct BlockyPetBadge: View {
    let text: String
    let tint: Color
    var body: some View {
        Text(text.capitalized)
            .font(.appCaption.bold())
            .foregroundColor(.white)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(tint.opacity(0.85))
            .clipShape(Capsule())
    }
}

enum BlockyPetPalette {
    static func rarityTint(_ rarity: String) -> Color {
        switch rarity.lowercased() {
        case "mythic":    return Color(red: 1.00, green: 0.30, blue: 0.80)
        case "legendary": return Color(red: 1.00, green: 0.65, blue: 0.05)
        case "epic":      return Color(red: 0.65, green: 0.30, blue: 1.00)
        case "rare":      return Color(red: 0.20, green: 0.55, blue: 1.00)
        case "uncommon":  return Color(red: 0.30, green: 0.80, blue: 0.30)
        default:          return Color(white: 0.55)  // Common
        }
    }

    static func elementTint(_ element: String) -> Color {
        switch element.lowercased() {
        case "fire":   return Color(red: 1.00, green: 0.55, blue: 0.10)
        case "ice":    return Color(red: 0.30, green: 0.70, blue: 1.00)
        case "shadow": return Color(red: 0.35, green: 0.10, blue: 0.45)
        case "light":  return Color(red: 0.95, green: 0.85, blue: 0.30)
        case "nature": return Color(red: 0.40, green: 0.85, blue: 0.40)
        case "tech":   return Color(red: 0.00, green: 0.75, blue: 0.95)
        default:       return Color(white: 0.5)
        }
    }
}

// MARK: - Interactive 3D Thumbnail (tap to open viewer)

private struct Interactive3DThumbnail: View {
    let thumbnailURL: URL?
    let artifactType: GenerationPreviewView.ArtifactType
    @State private var showViewer = false

    private var modelURL: URL? {
        if case .interactive3D(_, let url) = artifactType { return url }
        return nil
    }

    var body: some View {
        VStack(spacing: 6) {
            if let modelURL {
                WebGLBViewer(modelURL: modelURL)
                    .frame(maxWidth: .infinity, minHeight: 240, maxHeight: 280)
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                    .overlay(alignment: .topTrailing) {
                        Button {
                            showViewer = true
                        } label: {
                            Image(systemName: "arrow.up.left.and.arrow.down.right")
                                .font(.system(size: 14, weight: .bold))
                                .foregroundColor(.white)
                                .padding(8)
                                .background(.ultraThinMaterial)
                                .clipShape(Circle())
                        }
                        .padding(8)
                    }
                    .fullScreenCover(isPresented: $showViewer) {
                        FullScreen3DViewer(modelURL: modelURL)
                    }
            } else if let thumbnailURL {
                AsyncImage(url: thumbnailURL) { phase in
                    if case .success(let img) = phase {
                        img.resizable().aspectRatio(contentMode: .fit)
                            .frame(maxWidth: .infinity, maxHeight: 200)
                            .clipShape(RoundedRectangle(cornerRadius: 14))
                    } else {
                        ProgressView()
                            .frame(maxWidth: .infinity, minHeight: 120)
                    }
                }
            }

            HStack(spacing: 6) {
                Image(systemName: "cube.transparent")
                    .foregroundColor(.accentPrimary.opacity(0.8))
                Text(modelURL != nil ? "AI 3D model — drag to rotate, pinch to zoom" : "AI 3D model — ready for export")
                    .font(.appCaption)
                    .foregroundColor(.textSecondary.opacity(0.7))
            }
        }
    }
}

// MARK: - Fullscreen 3D Viewer

private struct FullScreen3DViewer: View {
    let modelURL: URL
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack(alignment: .topLeading) {
            Color.black.ignoresSafeArea()

            WebGLBViewer(modelURL: modelURL)
                .ignoresSafeArea()

            Button {
                dismiss()
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 32))
                    .foregroundColor(.white.opacity(0.8))
                    .padding(16)
            }
        }
    }
}

// MARK: - WebView GLB Viewer (model-viewer)

struct WebGLBViewer: UIViewRepresentable {
    let modelURL: URL

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.bounces = false
        loadModel(in: webView)
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}

    private func loadModel(in webView: WKWebView) {
        let urlString = modelURL.absoluteString
        let html = """
        <!DOCTYPE html>
        <html>
        <head>
        <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
        <style>
            * { margin: 0; padding: 0; }
            html, body { width: 100%; height: 100%; overflow: hidden; background: transparent; }
            model-viewer {
                width: 100%;
                height: 100%;
                --poster-color: transparent;
                background: transparent;
            }
            model-viewer::part(default-progress-bar) { display: none; }
            .loading {
                position: absolute; top: 50%; left: 50%;
                transform: translate(-50%, -50%);
                color: #999; font-family: -apple-system, sans-serif;
                font-size: 14px; text-align: center;
            }
            .loading .spinner {
                width: 32px; height: 32px; margin: 0 auto 8px;
                border: 3px solid rgba(150,100,255,0.2);
                border-top: 3px solid rgba(150,100,255,0.8);
                border-radius: 50%;
                animation: spin 0.8s linear infinite;
            }
            @keyframes spin { to { transform: rotate(360deg); } }
        </style>
        </head>
        <body>
        <div class="loading" id="loader">
            <div class="spinner"></div>
            Loading 3D...
        </div>
        <script type="module" src="https://ajax.googleapis.com/ajax/libs/model-viewer/3.5.0/model-viewer.min.js"></script>
        <model-viewer
            src="\(urlString)"
            camera-controls
            touch-action="pan-y"
            auto-rotate
            shadow-intensity="0.5"
            exposure="1.0"
            camera-orbit="30deg 75deg 105%"
            min-camera-orbit="auto auto 50%"
            max-camera-orbit="auto auto 300%"
            interaction-prompt="none"
            style="background: transparent;"
        ></model-viewer>
        <script>
            document.querySelector('model-viewer').addEventListener('load', function() {
                document.getElementById('loader').style.display = 'none';
            });
        </script>
        </body>
        </html>
        """
        webView.loadHTMLString(html, baseURL: nil)
    }
}

private struct AnimationPreviewCard: View {
    let name: String
    let rig: String
    let keyframeCount: Int
    let looped: Bool
    let animationType: String
    let notes: [String]
    var previewMediaURL: URL? = nil
    var previewIsVideo: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            // AI-generated animated preview (AnimateDiff video or Flux image fallback)
            if let mediaURL = previewMediaURL {
                if previewIsVideo {
                    AnimationVideoPlayerView(url: mediaURL)
                        .frame(height: 200)
                        .frame(maxWidth: .infinity)
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                        .overlay(
                            RoundedRectangle(cornerRadius: 14)
                                .stroke(Color.accentPrimary.opacity(0.2), lineWidth: 1)
                        )
                } else {
                    AsyncImage(url: mediaURL) { phase in
                        switch phase {
                        case .success(let image):
                            image.resizable().aspectRatio(contentMode: .fill)
                        case .failure:
                            Color.accentPrimary.opacity(0.08)
                        case .empty:
                            ZStack {
                                Color(red: 0.94, green: 0.91, blue: 0.99)
                                ProgressView().tint(Color.accentPrimary)
                            }
                        @unknown default:
                            EmptyView()
                        }
                    }
                    .frame(height: 200)
                    .frame(maxWidth: .infinity)
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                    .overlay(
                        RoundedRectangle(cornerRadius: 14)
                            .stroke(Color.accentPrimary.opacity(0.2), lineWidth: 1)
                    )
                }
            }

            ForEach(notes, id: \.self) { note in
                Text(note)
                    .font(.appCallout)
                    .foregroundColor(.textSecondary)
                    .padding(.horizontal, 4)
            }
        }
        .padding(20)
        .background(Color.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 22))
    }

    private func animationStatBadge(icon: String, label: String) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(.accentPrimary)
            Text(label)
                .font(.system(size: 13, weight: .semibold, design: .rounded))
                .foregroundColor(.textPrimary)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Color.accentPrimary.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private var keyframeTimeline: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Keyframe Timeline")
                .font(.system(size: 12, weight: .semibold, design: .rounded))
                .foregroundColor(.textTertiary)

            GeometryReader { geo in
                let dotCount = min(keyframeCount, 16)
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 2)
                        .fill(Color.accentPrimary.opacity(0.15))
                        .frame(height: 4)

                    RoundedRectangle(cornerRadius: 2)
                        .fill(Color.accentPrimary.opacity(0.5))
                        .frame(width: geo.size.width, height: 4)

                    ForEach(0..<dotCount, id: \.self) { i in
                        let x = dotCount > 1
                            ? geo.size.width * CGFloat(i) / CGFloat(dotCount - 1)
                            : geo.size.width / 2
                        Circle()
                            .fill(Color.accentPrimary)
                            .frame(width: 10, height: 10)
                            .position(x: x, y: 6)
                    }
                }
            }
            .frame(height: 12)
        }
        .padding(.vertical, 4)
    }
}

// MARK: - Looping video player for AnimateDiff MP4 preview
import AVKit

private struct AnimationVideoPlayerView: UIViewRepresentable {
    let url: URL

    func makeUIView(context: Context) -> UIView {
        let container = UIView()
        container.backgroundColor = UIColor(red: 0.94, green: 0.91, blue: 0.99, alpha: 1)
        container.clipsToBounds = true

        let player = AVPlayer(url: url)
        player.isMuted = true

        let playerLayer = AVPlayerLayer(player: player)
        playerLayer.videoGravity = .resizeAspectFill
        container.layer.addSublayer(playerLayer)

        // Loop forever
        NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: player.currentItem,
            queue: .main
        ) { _ in
            player.seek(to: .zero)
            player.play()
        }

        player.play()

        // Store player reference to prevent dealloc
        context.coordinator.player = player
        context.coordinator.playerLayer = playerLayer

        return container
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        context.coordinator.playerLayer?.frame = uiView.bounds
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    class Coordinator: NSObject {
        var player: AVPlayer?
        var playerLayer: AVPlayerLayer?

        deinit {
            player?.pause()
            NotificationCenter.default.removeObserver(self)
        }
    }
}

// MARK: - Candidate Grid 3D Preview
// 2×2 LazyVGrid 4-х кандидатов для furniture / multi-variant 3D генерации.
// Тап на тайл — выбирает кандидата. Tap на selected — открывает fullscreen orbit-viewer.
// Если candidates.count < 4, оставшиеся слоты — skeleton placeholders (стриминг-fill).
struct CandidateGrid3DView: View {
    let candidates: [GenerationPreviewView.Candidate3D]
    let initialSelectedIndex: Int
    let caption: String
    let onRegenerate: (() -> Void)?

    @State private var selectedIndex: Int
    @State private var fullscreenCandidate: GenerationPreviewView.Candidate3D?

    init(candidates: [GenerationPreviewView.Candidate3D],
         initialSelectedIndex: Int,
         caption: String,
         onRegenerate: (() -> Void)?) {
        self.candidates = candidates
        self.initialSelectedIndex = initialSelectedIndex
        self.caption = caption
        self.onRegenerate = onRegenerate
        self._selectedIndex = State(initialValue: initialSelectedIndex)
    }

    private let columns = [
        GridItem(.flexible(), spacing: 12),
        GridItem(.flexible(), spacing: 12),
    ]

    var body: some View {
        VStack(spacing: 14) {
            LazyVGrid(columns: columns, spacing: 12) {
                ForEach(0..<4, id: \.self) { idx in
                    tile(for: idx)
                }
            }

            HStack(spacing: 8) {
                Image(systemName: "square.grid.2x2")
                    .foregroundColor(.accentPrimary.opacity(0.8))
                Text("Pick your favourite — tap to expand")
                    .font(.appCaption)
                    .foregroundColor(.textSecondary)
                Spacer()
                if let onRegenerate {
                    Button {
                        onRegenerate()
                    } label: {
                        Label("Regenerate", systemImage: "arrow.clockwise")
                            .font(.appCaption)
                    }
                    .buttonStyle(.borderless)
                }
            }
            .padding(.horizontal, 4)

            if !caption.isEmpty {
                Text(caption)
                    .font(.appBody)
                    .foregroundColor(.textSecondary)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
                    .padding(.horizontal, 8)
            }
        }
        .padding(16)
        .background(Color.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 20))
        .sheet(item: $fullscreenCandidate) { candidate in
            CandidateFullscreenView(candidate: candidate) {
                fullscreenCandidate = nil
            }
        }
    }

    @ViewBuilder
    private func tile(for index: Int) -> some View {
        let isSelected = index == selectedIndex
        if candidates.indices.contains(index) {
            let candidate = candidates[index]
            ZStack(alignment: .topTrailing) {
                RealModel3DPreview(modelURL: candidate.modelURL)
                    .frame(height: 170)
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                    .overlay(
                        RoundedRectangle(cornerRadius: 14)
                            .stroke(isSelected ? Color.accentPrimary : Color.accentPrimary.opacity(0.15),
                                    lineWidth: isSelected ? 2.5 : 1)
                    )
                if isSelected {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundColor(.accentPrimary)
                        .font(.system(size: 22))
                        .padding(6)
                }
            }
            .contentShape(Rectangle())
            .onTapGesture {
                if isSelected {
                    fullscreenCandidate = candidate
                } else {
                    selectedIndex = index
                }
            }
        } else {
            // Skeleton placeholder для слотов, ещё не пришедших с бэкенда.
            RoundedRectangle(cornerRadius: 14)
                .fill(Color.cardBackground.opacity(0.6))
                .frame(height: 170)
                .overlay(
                    VStack(spacing: 6) {
                        ProgressView()
                        Text("Generating…")
                            .font(.appCaption)
                            .foregroundColor(.textSecondary)
                    }
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 14)
                        .stroke(Color.accentPrimary.opacity(0.15), lineWidth: 1)
                )
        }
    }
}

private struct CandidateFullscreenView: View {
    let candidate: GenerationPreviewView.Candidate3D
    let onClose: () -> Void

    var body: some View {
        ZStack(alignment: .topTrailing) {
            Color.black.ignoresSafeArea()
            RealModel3DPreview(modelURL: candidate.modelURL)
                .ignoresSafeArea()
            Button(action: onClose) {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 32))
                    .foregroundColor(.white.opacity(0.85))
                    .padding(16)
            }
        }
    }
}
