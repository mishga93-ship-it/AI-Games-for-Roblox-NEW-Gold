// DisasterSpawnerAPIClient.swift — Voice-Controlled Survival Disaster
// Spawner API client (session 387).

import Foundation
import SwiftUI

// MARK: - Modes & modifiers

enum DisasterMode: String, CaseIterable, Codable, Identifiable {
    case funny, horror, meme, sigma

    var id: String { rawValue }
    var displayTitle: String {
        switch self {
        case .funny:  return "Funny"
        case .horror: return "Horror"
        case .meme:   return "Brainrot"
        case .sigma:  return "Sigma Event"
        }
    }
    var emoji: String {
        switch self {
        case .funny:  return "😂"
        case .horror: return "💀"
        case .meme:   return "🧠"
        case .sigma:  return "🗿"
        }
    }
    var accentHex: String {
        switch self {
        case .funny:  return "FFD93D"
        case .horror: return "8B0000"
        case .meme:   return "39FF14"
        case .sigma:  return "1F2530"
        }
    }
}

enum DisasterChaosLevel: String, CaseIterable, Codable {
    case balanced, chaotic, impossible

    var displayTitle: String {
        switch self {
        case .balanced:   return loc(en: "Balanced", ru: "Balanced")
        case .chaotic:    return loc(en: "Chaotic", ru: "Chaotic")
        case .impossible: return loc(en: "Impossible", ru: "Impossible")
        }
    }
}

enum DisasterSize: String, CaseIterable, Codable {
    case small, normal, massive

    var displayTitle: String {
        switch self {
        case .small:   return loc(en: "Small", ru: "Маленькое")
        case .normal:  return loc(en: "Normal", ru: "Обычное")
        case .massive: return loc(en: "Massive", ru: "Огромное")
        }
    }
}

enum DisasterFrequency: String, CaseIterable, Codable {
    case rare, normal, constant

    var displayTitle: String {
        switch self {
        case .rare:     return loc(en: "Rare", ru: "Редко")
        case .normal:   return loc(en: "Normal", ru: "Обычно")
        case .constant: return loc(en: "Constant", ru: "Постоянно")
        }
    }
}

// MARK: - Wire types

struct DisasterVariation: Codable, Identifiable {
    var id: String { label }
    let label: String
    let imageUrl: String?
}

struct DisasterGenerationResponse: Codable {
    let generationId: String
    let mode: String
    let chaos: String
    let size: String
    let frequency: String
    let titleEN: String
    let titleRU: String
    let shareCaption: String
    let rarityVibeEN: String
    let rarityVibeRU: String
    let difficulty: String
    let recommendedPlayers: String
    let previewUrl: String?
    let variations: [DisasterVariation]
    let luaScript: String
    let rbxmxUrl: String?
    let usedFallback: Bool
    let instructionsEN: [String]
    let instructionsRU: [String]
    let generationStatus: String

    var localizedTitle: String          { GlowupLocale.isRussian ? titleRU : titleEN }
    var localizedRarity: String         { GlowupLocale.isRussian ? rarityVibeRU : rarityVibeEN }
    var localizedInstructions: [String] { GlowupLocale.isRussian ? instructionsRU : instructionsEN }
}

struct DisasterGenerateRequest: Encodable {
    let prompt: String
    let mode: String
    let chaos: String
    let size: String
    let frequency: String
    let inputMode: String
}

enum DisasterAPIError: LocalizedError {
    case rateLimited
    case emptyPrompt
    case underlying(Error)

    var errorDescription: String? {
        switch self {
        case .rateLimited:
            return loc(en: "Too many requests. Wait a minute.",
                       ru: "Слишком много запросов. Подожди минутку.")
        case .emptyPrompt:
            return loc(en: "Describe the disaster — type or speak.",
                       ru: "Опиши disaster — введи или произнеси.")
        case .underlying(let err): return err.localizedDescription
        }
    }
}

enum DisasterSpawnerAPIClient {
    static func generate(
        prompt: String,
        mode: DisasterMode,
        chaos: DisasterChaosLevel,
        size: DisasterSize,
        frequency: DisasterFrequency,
        inputMode: String
    ) async throws -> DisasterGenerationResponse {
        let trimmed = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { throw DisasterAPIError.emptyPrompt }
        let body = DisasterGenerateRequest(
            prompt: trimmed,
            mode: mode.rawValue,
            chaos: chaos.rawValue,
            size: size.rawValue,
            frequency: frequency.rawValue,
            inputMode: inputMode
        )
        do {
            return try await APIClient.request(
                "api/disaster-spawner/generate",
                method: "POST",
                body: body,
                timeout: 60
            )
        } catch APIError.httpError(let code) where code == 429 {
            throw DisasterAPIError.rateLimited
        } catch {
            throw DisasterAPIError.underlying(error)
        }
    }

    /// Fetch a previously generated disaster by id. Used by
    /// `DisasterSpawnerChatBridge` to re-hydrate the rich result payload
    /// from the artifact metadata's `generationId` after a chat-flow
    /// generation completes. Returns the fully-decoded doc — convert via
    /// `.toResponse()` to feed `DisasterSpawnerResultView`.
    static func fetchById(_ generationId: String) async throws -> DisasterGenerationDoc {
        do {
            return try await APIClient.request(
                "api/viral-generations/\(generationId)",
                method: "GET",
                timeout: 20
            )
        } catch APIError.httpError(let code) where code == 401 {
            throw DisasterAPIError.underlying(APIError.httpError(401))
        } catch APIError.httpError(let code) where code == 404 {
            throw DisasterAPIError.underlying(APIError.httpError(404))
        } catch {
            throw DisasterAPIError.underlying(error)
        }
    }
}

// MARK: - Recents detail (GET /api/viral-generations/:id, kind=disaster_spawner)

/// Detail response when the doc kind is `disaster_spawner`. Mirrors the
/// payload shape recorded by `viralChatDispatch.ts` `handleDisasterSpawner()`.
/// Outer `generationId` is the Firestore doc id; inner `payload` holds the
/// full `DisasterGenerationResponse`-equivalent fields so the rich result
/// view can present it identically to a fresh
/// `POST /api/disaster-spawner/generate` response.
struct DisasterGenerationDoc: Codable {
    let generationId: String
    let kind: String
    let title: String
    let subtitle: String?
    let thumbnailUrl: String?
    let accentHex: String?
    let createdAtMs: Double
    let payload: DisasterGenerationPayload

    /// Re-hydrate the full `DisasterGenerationResponse` so
    /// `DisasterSpawnerResultView` can present this generation identically
    /// to a fresh `POST /api/disaster-spawner/generate` response. Fields
    /// missing from older payloads fall back to reasonable defaults so the
    /// view doesn't crash on partial data.
    func toResponse() -> DisasterGenerationResponse {
        return DisasterGenerationResponse(
            generationId: generationId,
            mode: payload.mode ?? "meme",
            chaos: payload.chaos ?? "chaotic",
            size: payload.size ?? "normal",
            frequency: payload.frequency ?? "normal",
            titleEN: payload.titleEN ?? title,
            titleRU: payload.titleRU ?? title,
            shareCaption: payload.shareCaption ?? (subtitle ?? ""),
            rarityVibeEN: payload.rarityVibeEN ?? "Server Destroyer",
            rarityVibeRU: payload.rarityVibeRU ?? "Уничтожитель серверов",
            difficulty: payload.difficulty ?? "Hard",
            recommendedPlayers: payload.recommendedPlayers ?? "10-20",
            previewUrl: payload.previewUrl ?? thumbnailUrl,
            variations: payload.variations ?? [],
            luaScript: payload.luaScript ?? "",
            rbxmxUrl: payload.rbxmxUrl,
            usedFallback: payload.usedFallback ?? false,
            instructionsEN: payload.instructionsEN ?? [],
            instructionsRU: payload.instructionsRU ?? [],
            generationStatus: payload.generationStatus ?? "ready"
        )
    }
}

struct DisasterGenerationPayload: Codable {
    let mode: String?
    let chaos: String?
    let size: String?
    let frequency: String?
    let previewUrl: String?
    let rbxmxUrl: String?
    let luaScript: String?
    let titleEN: String?
    let titleRU: String?
    let shareCaption: String?
    let rarityVibeEN: String?
    let rarityVibeRU: String?
    let difficulty: String?
    let recommendedPlayers: String?
    let variations: [DisasterVariation]?
    let usedFallback: Bool?
    let instructionsEN: [String]?
    let instructionsRU: [String]?
    let generationStatus: String?
}
