// ViralLibraryAPIClient.swift — fetch the user's recent fire-and-forget
// viral generations (Outfit, Glowup, CursedUGC, VoiceAura, DisasterSpawner,
// FittingRoom). Backed by Firestore `viralGenerations` collection on the
// functions side.
//
// Created session 385 round 6 after user feedback:
//   «нельзя посмотреть историю генераций — эти генерации не попадают в общую
//    историю»

import Foundation

// MARK: - Wire model

/// One row in the recents list. Mirrors `ViralGenerationListItem` on the
/// backend (`apps/functions/src/viralGenerations.ts`).
struct ViralLibraryItem: Codable, Identifiable, Hashable {
    let generationId: String
    let kind: String         // "disaster_spawner" | "voice_aura" | "cursed_ugc" | "fitting_room" | "outfit" | "glowup"
    let title: String
    let subtitle: String?
    let thumbnailUrl: String?
    let accentHex: String?
    let createdAtMs: Double  // server timestamp in ms; 0 if still pending

    var id: String { generationId }

    /// Human-readable kind label for the cell badge.
    var kindLabel: String {
        switch kind {
        case "disaster_spawner": return "Disaster"
        case "voice_aura":       return "Aura"
        case "cursed_ugc":       return "Cursed UGC"
        case "fitting_room":     return "Fit"
        case "outfit":           return "Outfit"
        case "glowup":           return "Glow-Up"
        default:                 return kind.replacingOccurrences(of: "_", with: " ").capitalized
        }
    }

    /// SF Symbol for kinds without a thumbnail.
    var kindIcon: String {
        switch kind {
        case "disaster_spawner": return "tornado"
        case "voice_aura":       return "sparkles"
        case "cursed_ugc":       return "theatermasks.fill"
        case "fitting_room":     return "tshirt.fill"
        case "outfit":           return "person.crop.rectangle.stack.fill"
        case "glowup":           return "wand.and.stars"
        default:                 return "square.stack.3d.up.fill"
        }
    }

    var createdAtDate: Date? {
        createdAtMs > 0 ? Date(timeIntervalSince1970: createdAtMs / 1000.0) : nil
    }
}

struct ViralLibraryListResponse: Codable {
    let items: [ViralLibraryItem]
}

/// Detail response for `GET /api/viral-generations/:id` when the doc kind is
/// `voice_aura`. Mirrors the payload shape recorded by viralChatDispatch.ts
/// `handleVoiceAura()` exactly. Outer `generationId` is the Firestore doc id;
/// inner `payload` holds the AuraGenerationResponse-equivalent fields.
struct VoiceAuraGenerationDoc: Codable {
    let generationId: String
    let kind: String
    let title: String
    let subtitle: String?
    let thumbnailUrl: String?
    let accentHex: String?
    let createdAtMs: Double
    let payload: VoiceAuraGenerationPayload

    /// Re-hydrate the full `AuraGenerationResponse` so `VoiceAuraResultView`
    /// can present this generation identically to a fresh
    /// `POST /api/voice-aura/generate` response.
    func toAuraResponse() -> AuraGenerationResponse {
        return AuraGenerationResponse(
            generationId: generationId,
            style: payload.style,
            intensity: payload.intensity,
            size: payload.size,
            tone: payload.tone,
            titleEN: payload.titleEN ?? title,
            titleRU: payload.titleRU ?? title,
            shareCaption: payload.shareCaption ?? (subtitle ?? ""),
            rarityVibeEN: payload.rarityVibeEN ?? "Mythic",
            rarityVibeRU: payload.rarityVibeRU ?? "Мифический",
            difficulty: payload.difficulty ?? "Easy",
            previewUrl: payload.previewUrl ?? thumbnailUrl,
            variations: payload.variations ?? [],
            luaScript: payload.luaScript ?? "",
            rbxmxUrl: payload.rbxmxUrl,
            safeUsedFallback: payload.safeUsedFallback ?? false,
            instructionsEN: payload.instructionsEN ?? [],
            instructionsRU: payload.instructionsRU ?? [],
            generationStatus: payload.generationStatus ?? "ready"
        )
    }
}

struct VoiceAuraGenerationPayload: Codable {
    let style: String
    let intensity: String
    let size: String
    let tone: String
    let previewUrl: String?
    let rbxmxUrl: String?
    let luaScript: String?
    let titleEN: String?
    let titleRU: String?
    let shareCaption: String?
    let rarityVibeEN: String?
    let rarityVibeRU: String?
    let difficulty: String?
    let variations: [AuraVariation]?
    let instructionsEN: [String]?
    let instructionsRU: [String]?
    let safeUsedFallback: Bool?
    let generationStatus: String?
}

// MARK: - Errors

enum ViralLibraryAPIError: LocalizedError {
    case unauthenticated
    case underlying(Error)

    var errorDescription: String? {
        switch self {
        case .unauthenticated:
            return loc(en: "Sign in to see your creations.", ru: "Войди, чтобы увидеть свои генерации.")
        case .underlying(let err):
            return err.localizedDescription
        }
    }
}

// MARK: - Client

enum ViralLibraryAPIClient {
    /// Newest first, default 50, max enforced server-side.
    static func list(limit: Int = 50) async throws -> [ViralLibraryItem] {
        do {
            let resp: ViralLibraryListResponse = try await APIClient.request(
                "api/viral-generations?limit=\(limit)",
                method: "GET",
                timeout: 20
            )
            return resp.items
        } catch APIError.httpError(let code) where code == 401 {
            throw ViralLibraryAPIError.unauthenticated
        } catch {
            throw ViralLibraryAPIError.underlying(error)
        }
    }

    /// Fetch a single voice_aura generation by id. Used by
    /// `VoiceAuraChatBridge` to re-hydrate the rich result payload from the
    /// artifact metadata's `generationId` after a chat-flow generation
    /// completes. Returns the fully-decoded payload — convert via
    /// `.toAuraResponse()` to feed `VoiceAuraResultView`.
    static func fetchVoiceAuraById(_ generationId: String) async throws -> VoiceAuraGenerationDoc {
        do {
            return try await APIClient.request(
                "api/viral-generations/\(generationId)",
                method: "GET",
                timeout: 20
            )
        } catch APIError.httpError(let code) where code == 401 {
            throw ViralLibraryAPIError.unauthenticated
        } catch {
            throw ViralLibraryAPIError.underlying(error)
        }
    }
}
