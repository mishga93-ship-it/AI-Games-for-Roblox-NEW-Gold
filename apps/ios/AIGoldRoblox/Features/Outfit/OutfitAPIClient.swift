// OutfitAPIClient.swift — 1-Click Outfit Generator API client (session 383).
//
// Distinct product from Glow-Up Studio. This one is a catalog curator —
// asks the backend for a cohesive outfit per aesthetic, returns a list of
// real Roblox catalog items the user can equip.

import Foundation
import SwiftUI

// MARK: - Aesthetic catalog

enum OutfitAesthetic: String, CaseIterable, Codable, Identifiable {
    case sigma, baddie, y2k, goth
    case richEmo  = "rich_emo"
    case slender, softie, cyber
    case animeDemon = "anime_demon"

    var id: String { rawValue }

    var displayTitle: String {
        switch self {
        case .sigma:       return "Sigma"
        case .baddie:      return "Baddie"
        case .y2k:         return "Y2K"
        case .goth:        return "Goth"
        case .richEmo:     return "Rich Emo"
        case .slender:     return "Slender"
        case .softie:      return "Softie"
        case .cyber:       return "Cyber"
        case .animeDemon:  return "Anime Demon"
        }
    }

    var shortPitch: String {
        switch self {
        case .sigma:      return loc(en: "Cold, minimalist, suited — 1% mindset.",
                                     ru: "Холодный, минималистичный, в костюме — 1% mindset.")
        case .baddie:     return loc(en: "TikTok baddie energy — bold, slay-ready.",
                                     ru: "Baddie энергия — смело и slay-ready.")
        case .y2k:        return loc(en: "Mall princess core — butterflies, pink, low-rise.",
                                     ru: "Mall princess — бабочки, розовый, low-rise.")
        case .goth:       return loc(en: "Dark, dramatic, cathedral energy.",
                                     ru: "Тёмная, драматичная, cathedral energy.")
        case .richEmo:    return loc(en: "Designer emo — chains, layers, intentional sadness.",
                                     ru: "Designer emo — цепи, слои, грусть.")
        case .slender:    return loc(en: "Tall, narrow, mysterious — Slender silhouette.",
                                     ru: "Высокий, узкий, загадочный — Slender silhouette.")
        case .softie:     return loc(en: "Pastel, cozy, soft-girl daydream.",
                                     ru: "Пастель, уютно, soft-girl daydream.")
        case .cyber:      return loc(en: "Neon glow, future-tech, 2077 dystopia.",
                                     ru: "Неоновое свечение, future-tech, 2077.")
        case .animeDemon: return loc(en: "Domain expansion — anime demon arc.",
                                     ru: "Domain expansion — anime demon arc.")
        }
    }

    var iconSymbol: String {
        switch self {
        case .sigma:      return "person.fill.checkmark"
        case .baddie:     return "sparkle"
        case .y2k:        return "star.bubble.fill"
        case .goth:       return "moon.fill"
        case .richEmo:    return "music.note"
        case .slender:    return "figure.stand"
        case .softie:     return "cloud.fill"
        case .cyber:      return "bolt.fill"
        case .animeDemon: return "flame.fill"
        }
    }

    var accentHex: String {
        switch self {
        case .sigma:      return "1F2530"
        case .baddie:     return "D642FF"
        case .y2k:        return "FF87C9"
        case .goth:       return "2A0A3A"
        case .richEmo:    return "6B0F1A"
        case .slender:    return "0A0A0A"
        case .softie:     return "F8B8D0"
        case .cyber:      return "00FFAA"
        case .animeDemon: return "C70039"
        }
    }
}

enum OutfitGender: String, Codable, CaseIterable { case boys, girls, neutral }
enum OutfitStyleMode: String, Codable, CaseIterable { case dark, colorful }
enum OutfitRemixMode: String, Codable, CaseIterable {
    case remix
    case budget
    case moreCursed = "more_cursed"
    case moreClean  = "more_clean"
}

// MARK: - Wire types

struct OutfitItem: Codable, Identifiable {
    var id: String { assetId }
    let assetId: String
    let name: String
    let slot: String
    let priceRobux: Int
    let thumbnailUrl: String?
    let catalogUrl: String
    let creatorName: String?
    let favoriteCount: Int?
    let isCurated: Bool
}

struct OutfitGenerationResponse: Codable {
    let aestheticId: String
    let title: String
    let pitchEN: String
    let pitchRU: String
    let appStoreHook: String
    let captionEN: String
    let captionRU: String
    let styleTagsEN: [String]
    let items: [OutfitItem]
    let totalCostRobux: Int
    let savedRobux: Int
    let rerollSeed: String
    let generationStatus: String?
    /// AI-rendered hero preview of an avatar in this outfit (optional —
    /// flux call may fail and the response still carries the item list).
    let heroPreviewUrl: String?

    var localizedPitch: String {
        GlowupLocale.isRussian ? pitchRU : pitchEN
    }
    var localizedCaption: String {
        GlowupLocale.isRussian ? captionRU : captionEN
    }
}

struct OutfitGenerateRequest: Encodable {
    let aestheticId: String
    let gender: String
    let style: String
    let remix: String?
    let seed: String?
}

enum OutfitAPIError: LocalizedError {
    case rateLimited(retryAfterMs: Int?)
    case noItems
    case underlying(Error)

    var errorDescription: String? {
        switch self {
        case .rateLimited:
            return loc(en: "Too many requests. Wait a minute.",
                       ru: "Слишком много запросов. Подожди минутку.")
        case .noItems:
            return loc(en: "Catalog returned no items right now. Try a different aesthetic.",
                       ru: "Каталог пуст. Попробуй другую эстетику.")
        case .underlying(let err):
            return err.localizedDescription
        }
    }
}

// MARK: - Client

enum OutfitAPIClient {
    static func generate(
        aesthetic: OutfitAesthetic,
        gender: OutfitGender,
        style: OutfitStyleMode,
        remix: OutfitRemixMode? = nil,
        seed: String? = nil
    ) async throws -> OutfitGenerationResponse {
        let body = OutfitGenerateRequest(
            aestheticId: aesthetic.rawValue,
            gender: gender.rawValue,
            style: style.rawValue,
            remix: remix?.rawValue,
            seed: seed
        )
        do {
            return try await APIClient.request(
                "api/outfit/generate",
                method: "POST",
                body: body,
                timeout: 30
            )
        } catch APIError.httpError(let code) where code == 429 {
            throw OutfitAPIError.rateLimited(retryAfterMs: nil)
        } catch {
            throw OutfitAPIError.underlying(error)
        }
    }
}
