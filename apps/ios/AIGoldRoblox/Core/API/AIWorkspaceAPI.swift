import Foundation

enum AIWorkspaceAPI {
    struct ModerationRequest: Encodable {
        let text: String
        let stage: String
        let artifactType: String?
        let metadata: [String: String]?
    }

    struct ModerationResponse: Decodable {
        let allowed: Bool
        let reason: String?
        let provider: String
        let severity: String
        let action: String
        let category: String?
        let flags: [String]?
        let rewrittenText: String?
        let eventId: String?
    }

    struct AttachmentIngestRequest: Encodable {
        let type: String
        let name: String?
        let mimeType: String?
        let contentBase64: String?
        let sourceUrl: String?
        let text: String?
        let parseMode: String?
        let metadata: [String: String]?
    }

    struct AttachmentIngestResponse: Decodable {
        let asset: IngestionAsset
        let jobId: String?
        let analysis: ProjectAnalysis?
    }

    struct IngestionAsset: Decodable {
        let id: String
        let userId: String
        let type: String
        let name: String
        let mimeType: String?
        let sourceUrl: String?
        let storagePath: String?
        let downloadUrl: String?
        let extractedText: String?
        let previewText: String?
        let assetFormat: String?
        let analysisJobId: String?
        let analysisStatus: String?
        let analysisSummary: String?
        let createdAt: String
    }

    struct ProjectAnalysis: Decodable {
        struct Node: Decodable, Identifiable {
            let id: String
            let path: String
            let name: String
            let className: String
            let childCount: Int?
            let details: String?
        }

        struct ScriptAnalysis: Decodable {
            let path: String
            let lineCount: Int
            let services: [String]
            let functions: [String]
            let warnings: [String]
            let suggestedFixes: [String]
        }

        struct DiffPreview: Decodable {
            struct Operation: Decodable, Identifiable {
                let id: UUID
                let op: String
                let targetPath: String
                let description: String
                let beforeText: String?
                let afterText: String?

                private enum CodingKeys: String, CodingKey {
                    case op, targetPath, description, beforeText, afterText
                }

                init(from decoder: Decoder) throws {
                    let container = try decoder.container(keyedBy: CodingKeys.self)
                    self.id = UUID()
                    self.op = try container.decode(String.self, forKey: .op)
                    self.targetPath = try container.decode(String.self, forKey: .targetPath)
                    self.description = try container.decode(String.self, forKey: .description)
                    self.beforeText = try container.decodeIfPresent(String.self, forKey: .beforeText)
                    self.afterText = try container.decodeIfPresent(String.self, forKey: .afterText)
                }
            }

            let summary: String
            let operations: [Operation]
        }

        let id: String
        let assetId: String
        let userId: String
        let kind: String
        let status: String
        let summary: String
        let nodes: [Node]
        let scripts: [ScriptAnalysis]
        let externalLinks: [String]
        let diffPreview: DiffPreview?
        let createdAt: String
        let updatedAt: String
    }

    struct TranscriptionRequest: Encodable {
        let audioBase64: String
        let mimeType: String?
        let fileName: String?
        let metadata: [String: String]?
    }

    struct TranscriptionResponse: Decodable {
        let jobId: String
        let status: String
        let transcript: String?
        let confidence: Double?
        let locale: String?
        let artifact: GenerationArtifact?
    }

    struct VoiceSession: Decodable {
        let id: String
        let userId: String
        let status: String
        let locale: String?
        let chunkCount: Int
        let partialTranscript: String?
        let finalTranscript: String?
        let finalJobId: String?
        let lastError: String?
        let createdAt: String
        let updatedAt: String
    }

    struct VoiceSessionCreateRequest: Encodable {
        let locale: String?
        let metadata: [String: String]?
    }

    struct VoiceSessionCreateResponse: Decodable {
        let session: VoiceSession
    }

    struct VoiceSessionChunkUploadRequest: Encodable {
        let audioBase64: String
        let mimeType: String?
        let fileName: String?
        let durationMs: Int?
        let isLastChunk: Bool?
    }

    struct VoiceSessionChunkUploadResponse: Decodable {
        struct UploadedChunk: Decodable {
            let id: String
            let sessionId: String
            let order: Int
            let mimeType: String
            let durationMs: Int?
            let downloadUrl: String?
            let createdAt: String
        }

        let session: VoiceSession
        let chunk: UploadedChunk
    }

    struct VoiceSessionFinalizeRequest: Encodable {
        let metadata: [String: String]?
    }

    struct VoiceSessionFinalizeResponse: Decodable {
        let session: VoiceSession
        let jobId: String
        let status: String
        let transcript: String?
        let confidence: Double?
        let locale: String?
        let artifact: GenerationArtifact?
    }

    struct ThreadListResponse: Decodable {
        let threads: [ThreadDTO]
    }

    struct ThreadDTO: Decodable {
        let id: String
        let title: String
        let promptHint: String
        let updatedAt: String
        let projectKind: String?
        let contentSubcategory: String?
        let latestJobId: String?
        let projectMemory: ProjectMemory?
    }

    struct ChatRequest: Encodable {
        let threadId: String
        let message: String
        let quickReply: String?
        let provider: String?
        let skipInterview: Bool?
        let metadata: [String: String]?
    }

    struct ChatResponse: Decodable {
        let action: String
        let message: RemoteMessage?
        let question: String?
        let quickReplies: [String]?
        let gdd: RemoteGDD?
        let provider: String?
        let threadTitle: String?
        let jobId: String?
        let colorPicker: WeaponColorPayload?
        let projectMemory: ProjectMemory?
    }

    struct RemoteMessage: Decodable {
        let id: String
        let role: String
        let content: String
        let quickReplies: [String]?
        let createdAt: String
        let gdd: RemoteGDD?
        let gddRows: [RemoteGDDRow]?
        let colorPicker: WeaponColorPayload?
    }

    // Session #095: weapon interview Turn 2 emits default hex colors for iOS ColorPicker UI.
    struct WeaponColorPayload: Decodable, Equatable {
        let primary: String?
        let accent: String?
        let glow: String?
    }

    struct RemoteGDD: Decodable {
        let title: String
        let genre: String
        let theme: String?
        let scale: String
        let mechanics: [String]
        let characters: [String]?
        let systems: [String]
        let monetization: [String]?
        let visualStyle: String?
        let dataStore: [String]?
        let clothingMode: String?
        let targetPlayer: String?
        let coreLoop: String?
        let mapStructure: String?
        let levels: [String]?
        let progression: [String]?
        let economy: [String]?
        let winCondition: String?
        let loseCondition: String?
        let uiHud: [String]?
        let audioVfx: [String]?
        let socialSystems: [String]?
        let robloxServices: [String]?
        let technicalNotes: [String]?
        let safetyNotes: [String]?
        let expertiseLevel: String?
        let itemType: String?
        let useMode: String?
        let effect: String?
        let effectValue: Double?
        let effectDuration: Double?
        let tagName: String?
        let currencyName: String?
        let resourceName: String?
        let cooldown: Double?
    }

    struct RemoteGDDRow: Decodable {
        let key: String
        let value: String
    }

    struct ProjectMemory: Decodable {
        let version: Int
        let title: String?
        let projectKind: String?
        let contentSubcategory: String?
        let genre: String?
        let theme: String?
        let currentBrief: String?
        let latestGddRows: [RemoteGDDRow]?
        let latestJobId: String?
        let latestArtifactIds: [String]?
        let iteration: Int?
        let updatedAt: String
    }

    struct GenerateRequest: Encodable {
        let prompt: String
        let provider: String?
        let kind: String
        let threadId: String?
        let metadata: [String: String]
    }

    struct GenerateResponse: Decodable {
        let jobId: String
        let status: String
        let provider: String
        let artifactId: String?
        let artifactIds: [String]?
    }

    // MARK: - Smart Stubs

    struct SmartStubResponse: Decodable {
        let blocked: Bool
        let tokensCharged: Bool
        let hardPivot: Bool?
        let stub: StubDetail?

        struct StubDetail: Decodable {
            let message: String?
            let scenario: String?
            let unsupportedCategory: String?
            let alternativeActions: [String]?
        }
    }

    /// Error thrown when generation is blocked by Smart Stubs.
    struct SmartStubBlocked: Error {
        let stub: SmartStubResponse
    }

    static func voteForFeature(feature: String, prompt: String?) async {
        struct VoteBody: Encodable { let feature: String; let prompt: String? }
        let _: EmptyResponse? = try? await APIClient.request(
            "api/smart-stubs/vote",
            method: "POST",
            body: VoteBody(feature: feature, prompt: prompt)
        )
    }

    private struct EmptyResponse: Decodable {}

    struct GenerationJob: Decodable {
        let id: String
        let userId: String
        let threadId: String?
        let prompt: String
        let provider: String
        let kind: String
        let status: String
        let createdAt: String
        let updatedAt: String
        let resultText: String?
        let errorMessage: String?
        let artifacts: [GenerationArtifact]
        let history: [String]
        let stages: [GenerationStage]?
        let dispatchMode: String?
        let metadata: JobMetadata?
    }

    struct GenerationStage: Decodable, Identifiable {
        let id: String
        let title: String
        let status: String
        let artifactIds: [String]?
        let notes: [String]?
        let startedAt: String?
        let completedAt: String?
        let errorMessage: String?

        var isComplete: Bool {
            status == "completed" || status == "skipped"
        }
    }

    struct HeroConcept: Decodable {
        let name: String
        let description: String
        let imageUrl: String
        let approved: Bool
    }

    /// Single 2D-preview candidate awaiting user approval before upload to Roblox as a Decal.
    /// Backend pauses with `metadata.approvalKind == "decal_upload"` and a list of these.
    struct DecalCandidate: Decodable, Identifiable {
        let slotId: String
        let slotPrefix: String
        let previewUrl: String
        let prompt: String
        let index: Int

        var id: String { slotId }
    }

    struct JobMetadata: Decodable {
        let previewImageUrl: String?
        let projectKind: String?
        let contentCategory: String?
        let contentSubcategory: String?
        let title: String?
        let buildingType: String?
        let sizeClass: String?
        let floors: Int?
        let originalUserPrompt: String?
        let latestUserIntent: String?
        let genre: String?
        let style: String?
        let displayTitle: String?
        let obbyDescription: String?
        let regenerateHint: String?
        let isClothingTexture: Bool?
        let shirtTextureUrl: String?
        let pantsTextureUrl: String?
        // Session 001 (Track 1) — T-Shirt branch
        let isTShirt: Bool?
        let tshirtGraphicUrl: String?
        let tshirtRobloxAssetId: Int64?
        let shirtRobloxAssetId: Int64?
        let pantsRobloxAssetId: Int64?
        let installCommand: String?
        let heroConcepts: [HeroConcept]?
        let pipelinePhase: String?
        // Decal approval gate (session 231) — present when status='awaiting_review'
        // and the pause is for AI-generated 2D images about to be uploaded as
        // Roblox Decals. iOS shows DecalApprovalSheet when these are populated.
        let approvalKind: String?
        let pendingDecalApprovals: [DecalCandidate]?
        // Phase F (session 219): live Roblox catalog items welded into the
        // generated map as `rbxthumb://` showcase. iOS shows a chip when count > 0.
        let trendingShowcaseItems: [RobloxCatalogItem]?
        let trendingShowcaseCategory: String?
        let qualityReviewStatus: String?
        let qualityReviewScore: Int?
        let qualityReviewMessage: String?
        let qualityRejectionTitle: String?
        let qualityRejectionMessage: String?
        let qualityReviewReasons: [String]?
        let qualityRepairActions: [String]?
        let obbyApifyTaskSummary: [String]?
        // Session 346 — Furniture & Props blocky path
        let furnitureBuildMode: String?
        let furnitureResolvedBuildMode: String?
        let furniturePreviewImageUrl: String?
        // Track 3 (3D Pet pipeline) — surfaced on completed pet_3d jobs so the
        // iOS handoff sheet can render the right title, rarity badge, etc.
        let petBaseName: String?
        let petSpeciesType: String?
        let petSkeletonType: String?
        let petRarity: String?
        let petElement: String?
        let petIsFlying: Bool?
        let isPetEvolution: Bool?
        // Track 3 Phase 2 (Blocky Pet)
        let isBlockyPet: Bool?
        let blockyRig: String?
        let partCount: Int?
        let jointCount: Int?
        // Vehicles pipeline metadata
        let vehicleType: String?
        let driveMode: String?
        let seatCount: Int?
        /// Session 383: pre-extracted parts JSON from the picked Roblox vehicle
        /// template (Sedan / Phenom 100 / Tank / …), body parts already
        /// recolored to the user's primaryHex. iOS feeds this string into
        /// FurnitureSpecPayload.decode(from:) and renders the SAME interactive
        /// SceneKit 3D preview used for furniture/props.
        let vehicleSpecJSON: String?
        let vehicleSpecPartCount: Int?
        /// Session 387 Round 4 — flattened rarity badge & viral caption from
        /// the Modular Vehicle Builder pipeline. nil for template_embed jobs.
        let vehicleRarityLabel: String?
        let vehicleRarityColorHex: String?
        let vehiclePersonalityCaption: String?

        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: DynamicCodingKey.self)
            previewImageUrl = try? container.decode(String.self, forKey: .init("previewImageUrl"))
            projectKind = try? container.decode(String.self, forKey: .init("projectKind"))
            contentCategory = try? container.decode(String.self, forKey: .init("contentCategory"))
            contentSubcategory = try? container.decode(String.self, forKey: .init("contentSubcategory"))
            title = try? container.decode(String.self, forKey: .init("title"))
            buildingType = try? container.decode(String.self, forKey: .init("buildingType"))
            sizeClass = try? container.decode(String.self, forKey: .init("sizeClass"))
            if let floorsInt = try? container.decode(Int.self, forKey: .init("floors")) {
                floors = floorsInt
            } else if let floorsString = try? container.decode(String.self, forKey: .init("floors")), let parsedFloors = Int(floorsString) {
                floors = parsedFloors
            } else {
                floors = nil
            }
            originalUserPrompt = try? container.decode(String.self, forKey: .init("originalUserPrompt"))
            latestUserIntent = try? container.decode(String.self, forKey: .init("latestUserIntent"))
            genre = try? container.decode(String.self, forKey: .init("genre"))
            style = try? container.decode(String.self, forKey: .init("style"))
            displayTitle = try? container.decode(String.self, forKey: .init("displayTitle"))
            obbyDescription = try? container.decode(String.self, forKey: .init("obbyDescription"))
            regenerateHint = try? container.decode(String.self, forKey: .init("regenerateHint"))
            isClothingTexture = try? container.decode(Bool.self, forKey: .init("isClothingTexture"))
            shirtTextureUrl = try? container.decode(String.self, forKey: .init("shirtTextureUrl"))
            pantsTextureUrl = try? container.decode(String.self, forKey: .init("pantsTextureUrl"))
            isTShirt = try? container.decode(Bool.self, forKey: .init("isTShirt"))
            tshirtGraphicUrl = try? container.decode(String.self, forKey: .init("tshirtGraphicUrl"))
            tshirtRobloxAssetId = try? container.decode(Int64.self, forKey: .init("tshirtRobloxAssetId"))
            shirtRobloxAssetId = try? container.decode(Int64.self, forKey: .init("shirtRobloxAssetId"))
            pantsRobloxAssetId = try? container.decode(Int64.self, forKey: .init("pantsRobloxAssetId"))
            installCommand = try? container.decode(String.self, forKey: .init("installCommand"))
            heroConcepts = try? container.decode([HeroConcept].self, forKey: .init("heroConcepts"))
            pipelinePhase = try? container.decode(String.self, forKey: .init("pipelinePhase"))
            approvalKind = try? container.decode(String.self, forKey: .init("approvalKind"))
            pendingDecalApprovals = try? container.decode([DecalCandidate].self, forKey: .init("pendingDecalApprovals"))
            trendingShowcaseItems = try? container.decode([RobloxCatalogItem].self, forKey: .init("trendingShowcaseItems"))
            trendingShowcaseCategory = try? container.decode(String.self, forKey: .init("trendingShowcaseCategory"))
            qualityReviewStatus = try? container.decode(String.self, forKey: .init("qualityReviewStatus"))
            qualityReviewScore = try? container.decode(Int.self, forKey: .init("qualityReviewScore"))
            qualityReviewMessage = try? container.decode(String.self, forKey: .init("qualityReviewMessage"))
            qualityRejectionTitle = try? container.decode(String.self, forKey: .init("qualityRejectionTitle"))
            qualityRejectionMessage = try? container.decode(String.self, forKey: .init("qualityRejectionMessage"))
            qualityReviewReasons = try? container.decode([String].self, forKey: .init("qualityReviewReasons"))
            qualityRepairActions = try? container.decode([String].self, forKey: .init("qualityRepairActions"))
            obbyApifyTaskSummary = try? container.decode([String].self, forKey: .init("obbyApifyTaskSummary"))
            furnitureBuildMode = try? container.decode(String.self, forKey: .init("furnitureBuildMode"))
            furnitureResolvedBuildMode = try? container.decode(String.self, forKey: .init("furnitureResolvedBuildMode"))
            furniturePreviewImageUrl = try? container.decode(String.self, forKey: .init("furniturePreviewImageUrl"))
            petBaseName = try? container.decode(String.self, forKey: .init("petBaseName"))
            petSpeciesType = try? container.decode(String.self, forKey: .init("petSpeciesType"))
            petSkeletonType = try? container.decode(String.self, forKey: .init("petSkeletonType"))
            petRarity = try? container.decode(String.self, forKey: .init("petRarity"))
            petElement = try? container.decode(String.self, forKey: .init("petElement"))
            petIsFlying = try? container.decode(Bool.self, forKey: .init("petIsFlying"))
            isPetEvolution = try? container.decode(Bool.self, forKey: .init("isPetEvolution"))
            isBlockyPet = try? container.decode(Bool.self, forKey: .init("isBlockyPet"))
            blockyRig = try? container.decode(String.self, forKey: .init("blockyRig"))
            partCount = try? container.decode(Int.self, forKey: .init("partCount"))
            jointCount = try? container.decode(Int.self, forKey: .init("jointCount"))
            vehicleType = try? container.decode(String.self, forKey: .init("vehicleType"))
            driveMode = try? container.decode(String.self, forKey: .init("driveMode"))
            if let seatCountInt = try? container.decode(Int.self, forKey: .init("seatCount")) {
                seatCount = seatCountInt
            } else if let seatCountString = try? container.decode(String.self, forKey: .init("seatCount")),
                      let parsedSeatCount = Int(seatCountString) {
                seatCount = parsedSeatCount
            } else {
                seatCount = nil
            }
            vehicleSpecJSON = try? container.decode(String.self, forKey: .init("vehicleSpecJSON"))
            vehicleSpecPartCount = try? container.decode(Int.self, forKey: .init("vehicleSpecPartCount"))
            vehicleRarityLabel = try? container.decode(String.self, forKey: .init("vehicleRarityLabel"))
            vehicleRarityColorHex = try? container.decode(String.self, forKey: .init("vehicleRarityColorHex"))
            vehiclePersonalityCaption = try? container.decode(String.self, forKey: .init("vehiclePersonalityCaption"))
        }

        private struct DynamicCodingKey: CodingKey {
            var stringValue: String
            var intValue: Int?
            init(_ string: String) { self.stringValue = string; self.intValue = nil }
            init?(stringValue: String) { self.stringValue = stringValue; self.intValue = nil }
            init?(intValue: Int) { self.stringValue = "\(intValue)"; self.intValue = intValue }
        }
    }

    struct GenerationArtifact: Decodable {
        let id: String
        let type: String
        let name: String
        let url: String?
        let downloadUrl: String?
        let code: String?
        let content: String?
        let previewText: String?
        let mimeType: String?
        let fileExtension: String?
        let stageId: String?
        let artifactRole: String?
        let metadata: ArtifactMetadata?

        var isPreviewTexture: Bool {
            metadata?.isPreviewTexture == true
        }

        var is3DModel: Bool {
            metadata?.is3DModel == true || type == "glb" || type == "obj" || type == "fbx" || type == "usdz"
        }

        var bestImageUrl: String? {
            downloadUrl ?? url
        }

        var modelDownloadUrl: URL? {
            guard is3DModel else { return nil }
            return (downloadUrl ?? url).flatMap(URL.init(string:))
        }

        private enum CodingKeys: String, CodingKey {
            case id, type, name, url, downloadUrl, code, content, previewText, mimeType, metadata, stageId, artifactRole
            case fileExtension = "extension"
        }
    }

    struct ArtifactMetadata: Decodable {
        let isPreviewTexture: Bool?
        let is3DModel: Bool?
        let moderationStatus: String?
        let isClothingPreview: Bool?
        let isShirtTexture: Bool?
        let isPantsTexture: Bool?
        let isTShirtGraphic: Bool?
        let shirtTextureUrl: String?
        let pantsTextureUrl: String?
        let role: String?
        let animationName: String?
        let rig: String?
        let animationType: String?
        let looped: Bool?
        let keyframeCount: Int?
        // Track 3 (3D Pet pipeline) — flags surfaced by per-stage artifacts
        // and the final .rbxm so iOS can filter and present a Studio handoff.
        let isPetMesh: Bool?
        let isPetRiggedFbx: Bool?
        let isPetEvolution: Bool?
        let isPetConcept: Bool?
        let petStageIndex: Int?
        let petBaseName: String?
        let petStages: Int?
        // Track 3 Phase 2 (Blocky Pet)
        let isBlockyPet: Bool?
        let isBlockyPetSpec: Bool?
        let isPetAnimation: Bool?
        let isBlockyAnimation: Bool?
        let isPetDecal: Bool?
        let trackName: String?
        /// 2026-05-20 (Track 3 Phase 2): JSON-encoded BlockyPetSpec attached
        /// to the .rbxm artifact metadata so iOS can render an interactive
        /// 3D preview (BlockyPet3DSceneView) before download.
        let blockyPetSpecJSON: String?
        let petRarity: String?
        let petElement: String?
        let petSpeciesType: String?
        let petIsFlying: Bool?
        /// 2026-05-20 (Furniture/Props): same pattern as blockyPetSpecJSON —
        /// LLM scene JSON for blocky furniture/prop generation, rendered in
        /// iOS via BlockyFurniture3DSceneView.
        let isBlockyFurniture: Bool?
        let furnitureSpecJSON: String?
        let furnitureType: String?
        /// Session 389 — viralChatDispatch handlers (fitting_room / disaster_spawner /
        /// voice_aura) tag each artifact with `kind` so ChatView can route to a
        /// custom result screen (dress-up room for fitting_room) instead of the
        /// generic GenerationPreviewView. `generationId` is the doc id used to
        /// re-fetch the rich payload (renders + items + cost) via the dedicated
        /// /api/fitting-room/:id endpoint.
        let kind: String?
        let generationId: String?

        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            isPreviewTexture = try? container.decode(Bool.self, forKey: .isPreviewTexture)
            is3DModel = try? container.decode(Bool.self, forKey: .is3DModel)
            moderationStatus = try? container.decode(String.self, forKey: .moderationStatus)
            isClothingPreview = try? container.decode(Bool.self, forKey: .isClothingPreview)
            isShirtTexture = try? container.decode(Bool.self, forKey: .isShirtTexture)
            isPantsTexture = try? container.decode(Bool.self, forKey: .isPantsTexture)
            isTShirtGraphic = try? container.decode(Bool.self, forKey: .isTShirtGraphic)
            shirtTextureUrl = try? container.decode(String.self, forKey: .shirtTextureUrl)
            pantsTextureUrl = try? container.decode(String.self, forKey: .pantsTextureUrl)
            role = try? container.decode(String.self, forKey: .role)
            animationName = try? container.decode(String.self, forKey: .animationName)
            rig = try? container.decode(String.self, forKey: .rig)
            animationType = try? container.decode(String.self, forKey: .animationType)
            looped = try? container.decode(Bool.self, forKey: .looped)
            keyframeCount = try? container.decode(Int.self, forKey: .keyframeCount)
            isPetMesh = try? container.decode(Bool.self, forKey: .isPetMesh)
            isPetRiggedFbx = try? container.decode(Bool.self, forKey: .isPetRiggedFbx)
            isPetEvolution = try? container.decode(Bool.self, forKey: .isPetEvolution)
            isPetConcept = try? container.decode(Bool.self, forKey: .isPetConcept)
            petStageIndex = try? container.decode(Int.self, forKey: .petStageIndex)
            petBaseName = try? container.decode(String.self, forKey: .petBaseName)
            petStages = try? container.decode(Int.self, forKey: .petStages)
            isBlockyPet = try? container.decode(Bool.self, forKey: .isBlockyPet)
            isBlockyPetSpec = try? container.decode(Bool.self, forKey: .isBlockyPetSpec)
            isPetAnimation = try? container.decode(Bool.self, forKey: .isPetAnimation)
            isBlockyAnimation = try? container.decode(Bool.self, forKey: .isBlockyAnimation)
            isPetDecal = try? container.decode(Bool.self, forKey: .isPetDecal)
            trackName = try? container.decode(String.self, forKey: .trackName)
            blockyPetSpecJSON = try? container.decode(String.self, forKey: .blockyPetSpecJSON)
            petRarity = try? container.decode(String.self, forKey: .petRarity)
            petElement = try? container.decode(String.self, forKey: .petElement)
            petSpeciesType = try? container.decode(String.self, forKey: .petSpeciesType)
            petIsFlying = try? container.decode(Bool.self, forKey: .petIsFlying)
            isBlockyFurniture = try? container.decode(Bool.self, forKey: .isBlockyFurniture)
            furnitureSpecJSON = try? container.decode(String.self, forKey: .furnitureSpecJSON)
            furnitureType = try? container.decode(String.self, forKey: .furnitureType)
            kind = try? container.decode(String.self, forKey: .kind)
            generationId = try? container.decode(String.self, forKey: .generationId)
        }

        private enum CodingKeys: String, CodingKey {
            case isPreviewTexture, is3DModel, moderationStatus
            case isClothingPreview, isShirtTexture, isPantsTexture, isTShirtGraphic
            case shirtTextureUrl, pantsTextureUrl
            case role, animationName, rig, animationType, looped, keyframeCount
            case isPetMesh, isPetRiggedFbx, isPetEvolution, isPetConcept
            case petStageIndex, petBaseName, petStages
            case isBlockyPet, isBlockyPetSpec, isPetAnimation, isBlockyAnimation, isPetDecal, trackName
            case blockyPetSpecJSON, petRarity, petElement, petSpeciesType, petIsFlying
            case isBlockyFurniture, furnitureSpecJSON, furnitureType
            case kind, generationId
        }
    }

    struct SocialFeedResponse: Decodable {
        let posts: [SocialPost]
        let nextCursor: String?
        let mode: String?
    }

    struct CuratedCollection: Decodable, Identifiable {
        let id: String
        let title: String
        let description: String
        let coverImageUrl: String?
        let postIds: [String]?
        let posts: [SocialPost]?
        let curatorId: String?
        let collectionType: String?
        let createdAt: String?
        let updatedAt: String?
    }

    struct CollectionsResponse: Decodable {
        let collections: [CuratedCollection]
    }

    struct SocialProfile: Decodable {
        let id: String
        let email: String?
        let displayName: String
        let avatarUrl: String?
        let robloxUsername: String?
        let bio: String?
        let createdAt: String
        let followerCount: Int
        let followingCount: Int
        let publishedProjectCount: Int
        let savedCount: Int
        let totalLikes: Int
        let totalDownloads: Int
        let headline: String?
        let websiteUrl: String?
        let badges: [String]
        let rating: Double?
        let socialLinks: [SocialLink]?
    }

    struct SocialPost: Decodable, Identifiable {
        let id: String
        let projectId: String
        let authorId: String
        let authorName: String
        let authorAvatarUrl: String?
        let title: String
        let description: String
        let projectKind: String
        let contentType: String?
        let category: String?
        let tags: [String]
        let previewUrls: [String]
        let artifactSummary: String?
        let moderationStatus: String
        let publicationState: String
        var likes: Int
        var dislikes: Int?
        var likedByViewer: Bool?
        var dislikedByViewer: Bool?
        var savedByViewer: Bool?
        // Bug 24: mutable so PostInteractionCache can overlay session deltas on feed cards.
        var commentCount: Int
        let downloadCount: Int
        let score: Double?
        let authorHeadline: String?
        let artifactTypes: [String]?
        let staffPick: Bool?
        let featured: Bool?
        let createdAt: String
    }

    struct PublishProjectRequest: Encodable {
        let title: String
        let description: String
        let projectKind: String
        let artifactIds: [String]
        let tags: [String]
        let screenshotUrls: [String]?
        let category: String?
    }

    struct PublishProjectResponse: Decodable {
        let project: PublishedProject
        let post: SocialPost
        let moderation: ModerationResponse
    }

    struct PublishedProject: Decodable {
        let id: String
        let authorId: String
        let title: String
        let description: String
        let projectKind: String
        let artifactIds: [String]
        let coverImageUrl: String?
        let tags: [String]
        let moderationStatus: String
        let publicationState: String
        let saveCount: Int
        let downloadCount: Int
        let moderationCaseId: String?
        let createdAt: String
        let updatedAt: String
    }

    struct CommentsResponse: Decodable {
        let comments: [SocialComment]
    }

    struct SocialComment: Decodable, Identifiable {
        let id: String
        let postId: String
        let authorId: String
        let authorName: String
        let content: String
        let parentCommentId: String?
        // `var` to support optimistic like count increment without a full detail refetch.
        var likeCount: Int
        let moderationStatus: String?
        let createdAt: String
        // Bug 20: per-viewer toggle state — optional because legacy payloads lack the field.
        var likedByViewer: Bool?
    }

    struct DownloadableArtifact: Decodable, Identifiable {
        let id: String
        let type: String
        let name: String
        let downloadUrl: String?
        let url: String?
        let `extension`: String?
        let mimeType: String?
        let sizeBytes: Int?
        let metadata: [String: AnyCodable]?

        var bestURL: URL? {
            (downloadUrl ?? url).flatMap(URL.init(string:))
        }

        var displayExtension: String {
            (`extension` ?? type).uppercased()
        }

        var iconSystemName: String {
            switch type {
            case "rbxm", "rbxmx": return "cube.fill"
            case "fbx": return "rotate.3d"
            case "glb", "obj": return "cube.transparent"
            case "lua": return "chevron.left.forwardslash.chevron.right"
            case "png", "jpg", "jpeg", "gif", "mp4": return "photo.fill"
            case "json": return "doc.text.fill"
            case "audio": return "waveform"
            default: return "doc.fill"
            }
        }

        var isPreviewMedia: Bool {
            ["png", "jpg", "jpeg", "gif", "mp4"].contains(type) || (metadata?["role"]?.stringValue == "animation_preview")
        }
    }

    /// Lightweight wrapper for JSON metadata values
    struct AnyCodable: Decodable {
        let value: Any

        init(from decoder: Decoder) throws {
            let container = try decoder.singleValueContainer()
            if let s = try? container.decode(String.self) { value = s }
            else if let i = try? container.decode(Int.self) { value = i }
            else if let d = try? container.decode(Double.self) { value = d }
            else if let b = try? container.decode(Bool.self) { value = b }
            else { value = "" }
        }

        var stringValue: String? { value as? String }
    }

    struct SocialPostDetail: Decodable {
        let id: String
        let projectId: String
        let authorId: String
        let authorName: String
        let authorAvatarUrl: String?
        let title: String
        let description: String
        let projectKind: String
        let category: String?
        let tags: [String]
        let previewUrls: [String]
        let artifactSummary: String?
        let moderationStatus: String
        let publicationState: String
        // The following five fields are `var` to allow optimistic UI updates
        // in CommunityPostDetailView (like/save/comment) without a full refetch.
        var likes: Int
        let dislikes: Int?
        var likedByViewer: Bool?
        let dislikedByViewer: Bool?
        var savedByViewer: Bool?
        var commentCount: Int
        let downloadCount: Int
        let score: Double?
        let authorHeadline: String?
        let artifactTypes: [String]?
        let createdAt: String
        let project: PublishedProject?
        var comments: [SocialComment]?
        let author: SocialProfile?
        let downloadableArtifacts: [DownloadableArtifact]?
    }

    struct SocialLink: Codable {
        let platform: String
        let url: String
        let label: String?
    }

    struct SocialProfileUpdateRequest: Encodable {
        let displayName: String?
        let bio: String?
        let robloxUsername: String?
        let headline: String?
        let websiteUrl: String?
        let socialLinks: [SocialLink]?
    }

    struct SocialProfilePortfolio: Decodable {
        let profile: SocialProfile
        let publishedPosts: [SocialPost]
        let totalCount: Int
        let nextCursor: String?
    }

    struct TopCreator: Decodable, Identifiable {
        var id: String { profile.id }
        let profile: SocialProfile
        let rank: Int
        let totalScore: Int
        let period: String
    }

    struct LeaderboardResponse: Decodable {
        let creators: [TopCreator]
        let period: String
    }

    struct LeaderboardEntry: Decodable, Identifiable {
        var id: String {
            profile?.id ?? post?.id ?? "\(rank)-\(score)"
        }
        let rank: Int
        let score: Double
        let post: SocialPost?
        let profile: SocialProfile?
    }

    struct LeaderboardsResponse: Decodable {
        let type: String?
        let period: String?
        let entries: [LeaderboardEntry]?
        let risingStars: [LeaderboardEntry]?
    }

    struct StaffPicksResponse: Decodable {
        let posts: [SocialPost]
        let collections: [CuratedCollection]?
        let source: String?
    }

    struct ShareLinkResponse: Decodable {
        let url: String
        let deepLink: String
        let title: String?
        let description: String?
    }

    struct SearchResponse: Decodable {
        let posts: [SocialPost]
        let query: String?
        let contentType: String?
        let category: String?
        let sortBy: String?
        let nextCursor: String?
    }

    struct UpdateProjectRequest: Encodable {
        let title: String?
        let description: String?
        let tags: [String]?
        let screenshotUrls: [String]?
        let changelog: String?
    }

    struct UpdateProjectResponse: Decodable {
        let project: PublishedProject
    }

    struct DislikeResponse: Decodable {
        let disliked: Bool
        let dislikes: Int
    }

    struct SocialProfileUpdateResponse: Decodable {
        let profile: SocialProfile
    }

    struct SocialFollowResponse: Decodable {
        let following: Bool
        let followerCount: Int
        let followingCount: Int
    }

    struct SocialSaveResponse: Decodable {
        let saved: Bool
        let saveCount: Int
    }

    struct ThreadMessagesResponse: Decodable {
        let messages: [RemoteThreadMessage]
        let interviewTurn: Int?
        let lastAction: String?
        let hasMore: Bool?
        let oldestCursor: String?
        let projectMemory: ProjectMemory?
    }

    struct RemoteThreadMessage: Decodable {
        let id: String
        let role: String
        let content: String
        let quickReplies: [String]?
        let gddRows: [RemoteGDDRow]?
        let createdAt: String
    }

    struct RenameThreadRequest: Encodable {
        let title: String
    }

    struct RenameThreadResponse: Decodable {
        let id: String
        let title: String
    }

    static func fetchThreads() async throws -> [ThreadDTO] {
        let response: ThreadListResponse = try await APIClient.request("api/chat/threads")
        return response.threads
    }

    static func searchThreads(query: String) async throws -> [ThreadDTO] {
        let encoded = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? query
        let response: ThreadListResponse = try await APIClient.request("api/chat/threads/search?q=\(encoded)")
        return response.threads
    }

    static func renameThread(threadId: String, title: String) async throws -> RenameThreadResponse {
        try await APIClient.request(
            "api/chat/threads/\(threadId)",
            method: "PUT",
            body: RenameThreadRequest(title: title)
        )
    }

    /// Permanently deletes a thread server-side so it can't resurface via
    /// `fetchThreads()` after a reinstall. A purely-local session id that was
    /// never synced returns 404 — callers treat that as success (nothing to
    /// delete remotely).
    static func deleteThread(threadId: String) async throws {
        struct DeleteThreadResponse: Decodable { let deleted: Bool }
        let _: DeleteThreadResponse = try await APIClient.request(
            "api/chat/threads/\(threadId)",
            method: "DELETE"
        )
    }

    /// Deletes many threads in ONE request. Deleting chats one-by-one fired a
    /// burst of DELETEs that tripped the server's 30-req/60s rate limiter — the
    /// 429'd ones silently survived and reappeared after a reinstall. A single
    /// bulk call consumes one rate-limit token regardless of batch size.
    static func deleteThreads(ids: [String]) async throws {
        struct BulkDeleteRequest: Encodable { let ids: [String] }
        struct BulkDeleteResponse: Decodable { let count: Int }
        let _: BulkDeleteResponse = try await APIClient.request(
            "api/chat/threads/bulk-delete",
            method: "POST",
            body: BulkDeleteRequest(ids: ids)
        )
    }

    static func fetchThreadMessages(threadId: String, limit: Int = 200, before: String? = nil) async throws -> ThreadMessagesResponse {
        var path = "api/chat/threads/\(threadId)/messages?limit=\(limit)"
        if let before { path += "&before=\(before)" }
        return try await APIClient.request(path)
    }

    static func sendMessage(
        threadId: String,
        message: String,
        quickReply: String? = nil,
        provider: String? = nil,
        skipInterview: Bool? = nil,
        metadata: [String: String]? = nil
    ) async throws -> ChatResponse {
        try await APIClient.request(
            "api/chat/threads/\(threadId)/messages",
            method: "POST",
            body: ChatRequest(
                threadId: threadId,
                message: message,
                quickReply: quickReply,
                provider: provider,
                skipInterview: skipInterview,
                metadata: metadata
            )
        )
    }

    static func startGeneration(prompt: String, provider: String?, kind: String, threadId: String?, metadata: [String: String]) async throws -> GenerateResponse {
        // Try to decode as SmartStub first (blocked response returns 200 with different shape)
        let data: Data = try await APIClient.requestRaw(
            "api/content/generate",
            method: "POST",
            body: GenerateRequest(prompt: prompt, provider: provider, kind: kind, threadId: threadId, metadata: metadata),
            timeout: 120
        )
        // Check if response is a stub
        if let stub = try? JSONDecoder().decode(SmartStubResponse.self, from: data), stub.blocked {
            throw SmartStubBlocked(stub: stub)
        }
        guard let response = try? JSONDecoder().decode(GenerateResponse.self, from: data) else {
            throw URLError(.cannotParseResponse)
        }
        return response
    }

    static func fetchJob(jobId: String) async throws -> GenerationJob {
        try await APIClient.request("api/content/jobs/\(jobId)")
    }

    struct ApproveConceptResponse: Decodable {
        let status: String
        let conceptUrl: String?
        let message: String?
    }

    static func approveConcept(jobId: String, approved: Bool, feedback: String? = nil) async throws -> ApproveConceptResponse {
        struct Body: Encodable { let approved: Bool; let feedback: String? }
        return try await APIClient.request(
            "api/content/jobs/\(jobId)/approve-concept",
            method: "POST",
            body: Body(approved: approved, feedback: feedback)
        )
    }

    struct ApproveHeroAssetsResponse: Decodable {
        let status: String
        let approvedCount: Int?
        let totalConcepts: Int?
        let heroConcepts: [HeroConcept]?
        let message: String?
    }

    static func approveHeroAssets(jobId: String, decisions: [[String: Any]]) async throws -> ApproveHeroAssetsResponse {
        struct Body: Encodable {
            let decisions: [Decision]
            struct Decision: Encodable {
                let index: Int
                let approved: Bool
                let feedback: String?
            }
        }
        let typedDecisions = decisions.map { d in
            Body.Decision(
                index: d["index"] as? Int ?? 0,
                approved: d["approved"] as? Bool ?? false,
                feedback: d["feedback"] as? String
            )
        }
        return try await APIClient.request(
            "api/content/jobs/\(jobId)/approve-hero-assets",
            method: "POST",
            body: Body(decisions: typedDecisions)
        )
    }

    struct ApproveDecalsResponse: Decodable {
        let status: String
        let approvedCount: Int?
        let skippedCount: Int?
        let totalCandidates: Int?
        let message: String?
    }

    /// Submit which 2D-preview candidates the user kept checked. Backend then
    /// uploads only those buffers as Roblox Decals. Slots not in
    /// `approvedSlotIds` are silently skipped (their texture goes default).
    static func approveDecals(jobId: String, approvedSlotIds: [String]) async throws -> ApproveDecalsResponse {
        struct Body: Encodable { let approvedSlotIds: [String] }
        return try await APIClient.request(
            "api/content/jobs/\(jobId)/approve-decals",
            method: "POST",
            body: Body(approvedSlotIds: approvedSlotIds)
        )
    }

    struct RunPhase2Response: Decodable {
        let status: String
        let jobId: String?
        let error: String?
    }

    /// Trigger Phase 2 (3D mesh generation) via a long-lived HTTP request.
    /// The connection stays open for the entire Phase 2 duration (5-7 min),
    /// preventing Cloud Run from throttling the CPU.
    static func runPhase2(jobId: String) async throws -> RunPhase2Response {
        struct Empty: Encodable {}
        return try await APIClient.request(
            "api/content/jobs/\(jobId)/run-phase2",
            method: "POST",
            body: Empty(),
            timeout: 660 // 11 minutes — well above the 5-7 min pipeline duration
        )
    }

    static func moderate(text: String, stage: String, artifactType: String? = nil, metadata: [String: String]? = nil) async throws -> ModerationResponse {
        try await APIClient.request(
            "api/moderation/check",
            method: "POST",
            body: ModerationRequest(text: text, stage: stage, artifactType: artifactType, metadata: metadata)
        )
    }

    static func ingestAttachment(
        type: String,
        name: String?,
        mimeType: String?,
        contentBase64: String? = nil,
        sourceUrl: String? = nil,
        text: String? = nil,
        parseMode: String? = nil,
        metadata: [String: String]? = nil
    ) async throws -> IngestionAsset {
        let response: AttachmentIngestResponse = try await APIClient.request(
            "api/attachments/ingest",
            method: "POST",
            body: AttachmentIngestRequest(
                type: type,
                name: name,
                mimeType: mimeType,
                contentBase64: contentBase64,
                sourceUrl: sourceUrl,
                text: text,
                parseMode: parseMode,
                metadata: metadata
            )
        )
        return response.asset
    }

    static func transcribeAudio(audioBase64: String, mimeType: String, fileName: String, metadata: [String: String]? = nil) async throws -> TranscriptionResponse {
        try await APIClient.request(
            "api/voice/transcriptions",
            method: "POST",
            body: TranscriptionRequest(audioBase64: audioBase64, mimeType: mimeType, fileName: fileName, metadata: metadata)
        )
    }

    static func createVoiceSession(locale: String? = nil, metadata: [String: String]? = nil) async throws -> VoiceSession {
        let response: VoiceSessionCreateResponse = try await APIClient.request(
            "api/voice/sessions",
            method: "POST",
            body: VoiceSessionCreateRequest(locale: locale, metadata: metadata)
        )
        return response.session
    }

    static func uploadVoiceChunk(sessionId: String, audioBase64: String, mimeType: String, fileName: String, durationMs: Int? = nil, isLastChunk: Bool = true) async throws -> VoiceSessionChunkUploadResponse {
        try await APIClient.request(
            "api/voice/sessions/\(sessionId)/chunks",
            method: "POST",
            body: VoiceSessionChunkUploadRequest(audioBase64: audioBase64, mimeType: mimeType, fileName: fileName, durationMs: durationMs, isLastChunk: isLastChunk)
        )
    }

    static func finalizeVoiceSession(sessionId: String, metadata: [String: String]? = nil) async throws -> VoiceSessionFinalizeResponse {
        try await APIClient.request(
            "api/voice/sessions/\(sessionId)/finalize",
            method: "POST",
            body: VoiceSessionFinalizeRequest(metadata: metadata)
        )
    }

    static func fetchAssetAnalysis(assetId: String) async throws -> ProjectAnalysis {
        struct Response: Decodable {
            let analysis: ProjectAnalysis
        }
        let response: Response = try await APIClient.request("api/attachments/assets/\(assetId)/analysis")
        return response.analysis
    }

    static func previewAssetEdit(assetId: String, instruction: String) async throws -> ProjectAnalysis {
        struct Request: Encodable { let instruction: String }
        struct Response: Decodable { let analysis: ProjectAnalysis }
        let response: Response = try await APIClient.request(
            "api/attachments/assets/\(assetId)/edit-preview",
            method: "POST",
            body: Request(instruction: instruction)
        )
        return response.analysis
    }

    static func fetchSocialProfile() async throws -> SocialProfile {
        try await APIClient.request("api/social/profile")
    }

    static func followProfile(profileId: String) async throws -> SocialFollowResponse {
        try await APIClient.request("api/social/profiles/\(profileId)/follow", method: "POST")
    }

    // MARK: Follow lists
    //
    // Backend: GET /api/social/profiles/:profileId/followers|following?cursor=…&limit=20.
    // Each page item carries `isFollowedByViewer` so the list UI can render a
    // correct follow/unfollow button without an extra round-trip per row.

    struct FollowListProfile: Decodable, Identifiable {
        let id: String
        let name: String
        let headline: String
        let avatarUrl: String?
        let isFollowedByViewer: Bool
    }

    struct FollowListResponse: Decodable {
        let profiles: [FollowListProfile]
        let nextCursor: String?
    }

    enum FollowListKind: String {
        case followers
        case following
    }

    static func fetchFollowList(profileId: String, kind: FollowListKind, cursor: String?, limit: Int = 20) async throws -> FollowListResponse {
        var path = "api/social/profiles/\(profileId)/\(kind.rawValue)?limit=\(limit)"
        if let cursor, let encoded = cursor.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) {
            path += "&cursor=\(encoded)"
        }
        return try await APIClient.request(path)
    }

    static func publishProject(title: String, description: String, projectKind: String, artifactIds: [String], tags: [String], screenshotUrls: [String] = [], category: String? = nil) async throws -> PublishProjectResponse {
        try await APIClient.request(
            "api/social/projects/publish",
            method: "POST",
            body: PublishProjectRequest(title: title, description: description, projectKind: projectKind, artifactIds: artifactIds, tags: tags, screenshotUrls: screenshotUrls.isEmpty ? nil : screenshotUrls, category: category)
        )
    }

    static func toggleLike(postId: String) async throws {
        struct LikeResponse: Decodable { let liked: Bool }
        let _: LikeResponse = try await APIClient.request("api/social/posts/\(postId)/like", method: "POST")
    }

    static func toggleSave(postId: String) async throws -> SocialSaveResponse {
        try await APIClient.request("api/social/posts/\(postId)/save", method: "POST")
    }

    static func trackDownload(postId: String) async throws {
        struct DownloadResponse: Decodable { let downloaded: Bool }
        let _: DownloadResponse = try await APIClient.request("api/social/posts/\(postId)/download", method: "POST")
    }

    struct ZipExportResponse: Decodable {
        let downloadUrl: String
        let fileName: String
        let sizeBytes: Int
        let artifactCount: Int
    }

    static func requestZipExport(jobId: String, artifactIds: [String]? = nil) async throws -> ZipExportResponse {
        struct ZipRequest: Encodable { let jobId: String; let artifactIds: [String]? }
        return try await APIClient.request(
            "api/export/zip",
            method: "POST",
            body: ZipRequest(jobId: jobId, artifactIds: artifactIds)
        )
    }

    static func fetchPostDetail(postId: String) async throws -> SocialPostDetail {
        try await APIClient.request("api/social/posts/\(postId)")
    }

    static func fetchComments(postId: String) async throws -> [SocialComment] {
        let response: CommentsResponse = try await APIClient.request("api/social/posts/\(postId)/comments")
        return response.comments
    }

    // addComment is defined at end of file with parentCommentId support

    static func reportPost(postId: String, reason: String) async throws {
        struct ReportRequest: Encodable { let reason: String }
        struct ReportResponse: Decodable { let reportId: String; let status: String }
        let _: ReportResponse = try await APIClient.request(
            "api/social/posts/\(postId)/report",
            method: "POST",
            body: ReportRequest(reason: reason)
        )
    }

    static func toggleDislike(postId: String) async throws -> DislikeResponse {
        try await APIClient.request("api/social/posts/\(postId)/dislike", method: "POST")
    }

    static func fetchShareLink(postId: String) async throws -> ShareLinkResponse {
        try await APIClient.request("api/social/posts/\(postId)/share")
    }

    static func updateProject(projectId: String, title: String?, description: String?, tags: [String]?, screenshotUrls: [String]?, changelog: String?) async throws -> UpdateProjectResponse {
        try await APIClient.request(
            "api/social/projects/\(projectId)",
            method: "PUT",
            body: UpdateProjectRequest(title: title, description: description, tags: tags, screenshotUrls: screenshotUrls, changelog: changelog)
        )
    }

    static func fetchPortfolio(profileId: String) async throws -> SocialProfilePortfolio {
        try await APIClient.request("api/social/profiles/\(profileId)/portfolio")
    }

    static func fetchRemoteProfile(profileId: String) async throws -> SocialProfile {
        try await APIClient.request("api/social/profiles/\(profileId)")
    }

    static func fetchLeaderboard(period: String = "all", limit: Int = 20) async throws -> LeaderboardResponse {
        try await APIClient.request("api/social/leaderboard?period=\(period)&limit=\(limit)")
    }

    static func fetchCollections() async throws -> [CuratedCollection] {
        let response: CollectionsResponse = try await APIClient.request("api/social/collections")
        return response.collections
    }

    static func searchPosts(query: String, contentType: String? = nil, category: String? = nil, sortBy: String? = nil, cursor: String? = nil, limit: Int? = nil) async throws -> SearchResponse {
        var path = "api/social/search?q=\(query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? query)"
        if let contentType { path += "&contentType=\(contentType)" }
        if let category { path += "&category=\(category)" }
        if let sortBy { path += "&sortBy=\(sortBy)" }
        if let cursor { path += "&cursor=\(cursor)" }
        if let limit { path += "&limit=\(limit)" }
        return try await APIClient.request(path)
    }

    static func fetchSocialFeed(
        mode: String? = nil,
        contentType: String? = nil,
        category: String? = nil,
        search: String? = nil,
        tag: String? = nil,
        sortBy: String? = nil,
        timeRange: String? = nil,
        cursor: String? = nil,
        limit: Int? = nil,
        authorId: String? = nil
    ) async throws -> SocialFeedResponse {
        var path = "api/social/feed?"
        if let mode { path += "mode=\(mode)&" }
        if let contentType { path += "contentType=\(contentType)&" }
        if let category { path += "category=\(category)&" }
        if let search { path += "search=\(search.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? search)&" }
        if let tag { path += "tag=\(tag.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? tag)&" }
        if let sortBy { path += "sortBy=\(sortBy)&" }
        if let timeRange { path += "timeRange=\(timeRange)&" }
        if let cursor { path += "cursor=\(cursor)&" }
        if let limit { path += "limit=\(limit)&" }
        if let authorId { path += "authorId=\(authorId)&" }
        return try await APIClient.request(path)
    }

    static func fetchCuratedCollections() async throws -> CollectionsResponse {
        try await APIClient.request("api/social/collections")
    }

    static func addComment(postId: String, content: String, parentCommentId: String? = nil) async throws -> SocialComment {
        struct CommentRequest: Encodable { let content: String; let parentCommentId: String? }
        struct CommentResponse: Decodable { let comment: SocialComment }
        let response: CommentResponse = try await APIClient.request(
            "api/social/posts/\(postId)/comments",
            method: "POST",
            body: CommentRequest(content: content, parentCommentId: parentCommentId)
        )
        return response.comment
    }

    struct CommentLikeResponse: Decodable {
        let liked: Bool
        let likeCount: Int
    }

    static func likeComment(postId: String, commentId: String) async throws -> CommentLikeResponse {
        return try await APIClient.request(
            "api/social/posts/\(postId)/comments/\(commentId)/like",
            method: "POST"
        )
    }

    static func updateSocialProfile(displayName: String?, bio: String?, robloxUsername: String?, headline: String?, websiteUrl: String?, socialLinks: [SocialLink]? = nil) async throws -> SocialProfile {
        // Bug 23: backend exposes POST /api/social/profile, not PUT → save was 404'ing.
        let response: SocialProfileUpdateResponse = try await APIClient.request(
            "api/social/profile",
            method: "POST",
            body: SocialProfileUpdateRequest(displayName: displayName, bio: bio, robloxUsername: robloxUsername, headline: headline, websiteUrl: websiteUrl, socialLinks: socialLinks)
        )
        return response.profile
    }

    static func fetchLeaderboards(type: String = "authors", period: String = "all", category: String? = nil, limit: Int = 20) async throws -> LeaderboardsResponse {
        var components = URLComponents(string: "api/social/leaderboards")!
        var queryItems: [URLQueryItem] = [
            .init(name: "type", value: type),
            .init(name: "period", value: period),
            .init(name: "limit", value: "\(limit)"),
        ]
        if let category { queryItems.append(.init(name: "category", value: category)) }
        components.queryItems = queryItems
        let path = components.string ?? "api/social/leaderboards"
        return try await APIClient.request(path)
    }

    static func fetchStaffPicks(limit: Int = 20) async throws -> StaffPicksResponse {
        try await APIClient.request("api/social/staff-picks?limit=\(limit)")
    }

    // MARK: - Challenges

    struct ChallengePrize: Decodable {
        let place: Int
        let title: String
        let description: String
    }

    struct Challenge: Decodable, Identifiable {
        let id: String
        let title: String
        let description: String
        let type: String
        let startDate: String
        let endDate: String
        let votingEndDate: String
        let status: String
        let rules: [String]
        let prizes: [ChallengePrize]
        let featuredProjectIds: [String]
        let winnerIds: [String]
        let submissionCount: Int
        let createdAt: String
        let updatedAt: String

        var endDateParsed: Date? {
            ISO8601DateFormatter().date(from: endDate)
        }

        var votingEndDateParsed: Date? {
            ISO8601DateFormatter().date(from: votingEndDate)
        }

        var isActive: Bool { status == "active" }
        var isVoting: Bool { status == "voting" }
        var isCompleted: Bool { status == "completed" }
        var isUpcoming: Bool { status == "upcoming" }

        var typeLabel: String {
            switch type {
            case "game": return "Game"
            case "content": return "Content"
            case "script": return "Script"
            case "ui": return "UI/UX"
            default: return type.capitalized
            }
        }

        var typeIcon: String {
            switch type {
            case "game": return "gamecontroller.fill"
            case "content": return "paintbrush.fill"
            case "script": return "chevron.left.forwardslash.chevron.right"
            case "ui": return "rectangle.3.group.fill"
            default: return "star.fill"
            }
        }
    }

    struct ChallengeSubmission: Decodable, Identifiable {
        let id: String
        let challengeId: String
        let projectId: String
        let userId: String
        let authorName: String
        let title: String
        let description: String
        let previewUrls: [String]
        let votes: Int
        let submittedAt: String
    }

    struct ChallengeListResponse: Decodable {
        let challenges: [Challenge]
    }

    struct ChallengeDetailResponse: Decodable {
        let challenge: Challenge
        let submissions: [ChallengeSubmission]
        let userSubmission: ChallengeSubmission?
        let userVotedProjectId: String?
    }

    struct ChallengeSubmitResponse: Decodable {
        let submission: ChallengeSubmission
    }

    struct ChallengeVoteResponse: Decodable {
        let voted: Bool
        let projectId: String
        let totalVotes: Int
    }

    static func fetchChallenges() async throws -> [Challenge] {
        let response: ChallengeListResponse = try await APIClient.request("api/challenges")
        return response.challenges
    }

    static func fetchChallengeDetail(id: String) async throws -> ChallengeDetailResponse {
        try await APIClient.request("api/challenges/\(id)")
    }

    static func submitToChallenge(challengeId: String, projectId: String) async throws -> ChallengeSubmission {
        struct SubmitBody: Encodable { let projectId: String }
        let response: ChallengeSubmitResponse = try await APIClient.request(
            "api/challenges/\(challengeId)/submit",
            method: "POST",
            body: SubmitBody(projectId: projectId)
        )
        return response.submission
    }

    static func voteForChallengeProject(challengeId: String, projectId: String) async throws -> ChallengeVoteResponse {
        struct Empty: Encodable {}
        return try await APIClient.request(
            "api/challenges/\(challengeId)/vote/\(projectId)",
            method: "POST",
            body: Empty()
        )
    }

    // MARK: - Game Templates

    struct GameTemplate: Decodable, Identifiable {
        let id: String
        let title: String
        let genre: String
        let description: String
        let previewUrl: String?
        let starterPrompt: String
        let features: [String]
        let difficulty: String

        var difficultyLabel: String {
            switch difficulty {
            case "easy": return "Easy"
            case "medium": return "Medium"
            case "hard": return "Hard"
            default: return difficulty.capitalized
            }
        }

        var difficultyColor: String {
            switch difficulty {
            case "easy": return "green"
            case "medium": return "orange"
            case "hard": return "red"
            default: return "gray"
            }
        }

        var genreIcon: String {
            switch genre {
            case "obby": return "figure.run"
            case "tycoon": return "dollarsign.circle.fill"
            case "simulator": return "hand.tap.fill"
            case "rpg": return "shield.fill"
            case "horror": return "eye.fill"
            case "pvp": return "bolt.fill"
            case "td", "tower_defense": return "tower.cell.broadcast.fill"
            case "racing": return "car.fill"
            case "roleplay", "roleplay_town": return "building.2.fill"
            case "parkour": return "figure.gymnastics"
            case "story", "story_game": return "book.fill"
            case "mini-games", "minigame_hub": return "die.face.5.fill"
            case "survival": return "flame.fill"
            case "fighting", "fighting_arena": return "figure.boxing"
            case "custom", "custom_game": return "sparkles"
            default: return "gamecontroller.fill"
            }
        }
    }

    struct TemplatesResponse: Decodable {
        let templates: [GameTemplate]
    }

    static func fetchTemplates() async throws -> [GameTemplate] {
        let response: TemplatesResponse = try await APIClient.request("api/templates")
        return response.templates
    }

    // MARK: - Roblox Catalog Trends (live)

    struct RobloxCatalogItem: Codable, Identifiable, Hashable {
        let id: Int
        let name: String
        let itemType: String
        let assetType: Int?
        let creatorName: String
        let creatorType: String?
        let price: Int?
        let favoriteCount: Int
        let thumbnailUrl: String?
        let url: String
    }

    struct RobloxTrendingResponse: Codable {
        let source: String
        let fetchedAt: Double
        let cached: Bool
        let category: String
        let sort: String
        let period: String
        let items: [RobloxCatalogItem]
    }

    /// Fetches live Roblox catalog trends from `/api/roblox/trending`.
    /// Categories the backend currently supports: Featured, Animations, Decals, Collectibles.
    static func fetchRobloxTrending(
        category: String = "Featured",
        sort: String = "Sales",
        period: String = "PastWeek",
        limit: Int = 10
    ) async throws -> RobloxTrendingResponse {
        let safeLimit = max(1, min(20, limit))
        let path = "api/roblox/trending?category=\(category)&sort=\(sort)&period=\(period)&limit=\(safeLimit)"
        do {
            return try await APIClient.request(path, timeout: 15)
        } catch {
            // Trending assets are global data — fall back to the token-free
            // `-public` endpoint when the authed call fails (e.g. no Firebase
            // token at launch → 401).
            return try await fetchRobloxTrendingPublic(category: category, sort: sort, period: period, limit: safeLimit)
        }
    }

    // The `-public` trending endpoint returns a slim shape (no thumbnailUrl/url,
    // and the wrapper omits cached/sort/period), so it can't decode straight
    // into RobloxTrendingResponse. Decode leniently and rebuild the full model:
    // synthesize the catalog URL from id+itemType; leave thumbnail to the card
    // placeholder.
    private struct PublicTrendingItem: Decodable {
        let id: Int
        let name: String
        let itemType: String
        let creatorName: String?
        let price: Int?
        let favoriteCount: Int?
    }
    private struct PublicTrendingResponse: Decodable {
        let category: String?
        let items: [PublicTrendingItem]
        let fetchedAt: Double?
        let source: String?
    }

    private static func fetchRobloxTrendingPublic(
        category: String,
        sort: String,
        period: String,
        limit: Int
    ) async throws -> RobloxTrendingResponse {
        let resp: PublicTrendingResponse = try await APIClient.request(
            "api/roblox/trending-public?category=\(category)&limit=\(min(10, limit))",
            timeout: 15,
            requiresAuth: false
        )
        let items = resp.items.map { item -> RobloxCatalogItem in
            let base = item.itemType == "Bundle" ? "bundles" : "catalog"
            return RobloxCatalogItem(
                id: item.id,
                name: item.name,
                itemType: item.itemType,
                assetType: nil,
                creatorName: item.creatorName ?? "Roblox",
                creatorType: nil,
                price: item.price,
                favoriteCount: item.favoriteCount ?? 0,
                thumbnailUrl: nil,
                url: "https://www.roblox.com/\(base)/\(item.id)/--"
            )
        }
        return RobloxTrendingResponse(
            source: resp.source ?? "public",
            fetchedAt: resp.fetchedAt ?? Date().timeIntervalSince1970 * 1000,
            cached: true,
            category: resp.category ?? category,
            sort: sort,
            period: period,
            items: items
        )
    }

    // MARK: - Roblox Trending GAMES (Phase B, session 226)

    struct RobloxTrendingGame: Codable, Identifiable, Hashable {
        let placeId: Int
        let name: String
        let activeUsers: Int
        let iconUrl: String?
        let gameUrl: String
        var id: Int { placeId }
    }

    struct RobloxTrendingGamesResponse: Codable {
        let source: String
        let fetchedAt: Double
        let cached: Bool?
        let games: [RobloxTrendingGame]
    }

    /// Fetches top trending Roblox games (Rolimons-backed). `limit` clamped 1-100.
    /// Top games are global, non-user-specific data. If the authed call fails
    /// (e.g. Firebase token not yet available at launch → 401), fall back to the
    /// `-public` endpoint, which returns the same shape and needs no token.
    static func fetchRobloxTrendingGames(limit: Int = 20) async throws -> RobloxTrendingGamesResponse {
        let safeLimit = max(1, min(100, limit))
        do {
            return try await APIClient.request("api/roblox/trending-games?limit=\(safeLimit)", timeout: 15)
        } catch {
            return try await APIClient.request(
                "api/roblox/trending-games-public?limit=\(min(20, safeLimit))",
                timeout: 15,
                requiresAuth: false
            )
        }
    }

    // MARK: - Push Notifications

    static func registerDeviceToken(_ token: String, platform: String = "ios") async throws {
        struct RegisterRequest: Encodable { let token: String; let platform: String }
        struct RegisterResponse: Decodable { let registered: Bool }
        let _: RegisterResponse = try await APIClient.request(
            "api/notifications/register-device",
            method: "POST",
            body: RegisterRequest(token: token, platform: platform)
        )
    }

    static func updateNotificationPreferences(
        likes: Bool,
        comments: Bool,
        followers: Bool,
        generations: Bool,
        challenges: Bool
    ) async throws {
        struct PrefsRequest: Encodable {
            let likes: Bool; let comments: Bool; let followers: Bool
            let generations: Bool; let challenges: Bool
        }
        struct PrefsResponse: Decodable {
            let preferences: NotificationPrefs
            struct NotificationPrefs: Decodable {
                let likes: Bool; let comments: Bool; let followers: Bool
                let generations: Bool; let challenges: Bool
            }
        }
        let _: PrefsResponse = try await APIClient.request(
            "api/notifications/preferences",
            method: "PUT",
            body: PrefsRequest(
                likes: likes, comments: comments, followers: followers,
                generations: generations, challenges: challenges
            )
        )
    }
}
