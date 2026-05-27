// CursedUGCAPIClient.swift — Giant & Cursed UGC Modeler API client
// (session 384). Generates AI meme/cursed UGC concept images.

import Foundation
import SwiftUI

// MARK: - Categories

enum CursedUGCCategory: String, CaseIterable, Codable, Identifiable {
    case giantBackpack = "giant_backpack"
    case cursedFace    = "cursed_face"
    case memePlushie   = "meme_plushie"
    case giantPet      = "giant_pet"
    case weirdMask     = "weird_mask"
    case brainrotItem  = "brainrot_item"
    case oversizedHat  = "oversized_hat"

    var id: String { rawValue }

    var displayTitle: String {
        switch self {
        case .giantBackpack: return "Giant Backpack"
        case .cursedFace:    return "Cursed Face"
        case .memePlushie:   return "Meme Plushie"
        case .giantPet:      return "Giant Pet"
        case .weirdMask:     return "Weird Mask"
        case .brainrotItem:  return "Brainrot Item"
        case .oversizedHat:  return "Oversized Hat"
        }
    }

    var shortPitch: String {
        switch self {
        case .giantBackpack: return loc(en: "Comically oversized plushie backpacks.",
                                        ru: "Абсурдно огромные плюшевые рюкзаки.")
        case .cursedFace:    return loc(en: "Cursed-meme face accessories.",
                                        ru: "Cursed-meme face accessories.")
        case .memePlushie:   return loc(en: "Absurd shoulder plushies.",
                                        ru: "Абсурдные плюшевые игрушки на плечо.")
        case .giantPet:      return loc(en: "Pets bigger than your avatar.",
                                        ru: "Питомцы крупнее аватара.")
        case .weirdMask:     return loc(en: "Bizarre meme head masks.",
                                        ru: "Странные мем-маски.")
        case .brainrotItem:  return loc(en: "Steal-a-Brainrot style chaos.",
                                        ru: "Steal-a-Brainrot хаос.")
        case .oversizedHat:  return loc(en: "Hats bigger than the avatar.",
                                        ru: "Шапки больше аватара.")
        }
    }

    var iconSymbol: String {
        switch self {
        case .giantBackpack: return "backpack.fill"
        case .cursedFace:    return "face.dashed.fill"
        case .memePlushie:   return "pawprint.fill"
        case .giantPet:      return "tortoise.fill"
        case .weirdMask:     return "theatermasks.fill"
        case .brainrotItem:  return "brain.head.profile"
        case .oversizedHat:  return "graduationcap.fill"
        }
    }

    var accentHex: String {
        switch self {
        case .giantBackpack: return "FF6B9D"
        case .cursedFace:    return "8B0000"
        case .memePlushie:   return "FFB347"
        case .giantPet:      return "00B4D8"
        case .weirdMask:     return "6A0DAD"
        case .brainrotItem:  return "39FF14"
        case .oversizedHat:  return "F4A460"
        }
    }
}

enum CursedUGCStyle: String, CaseIterable, Codable, Identifiable {
    case cute, horror, sigma, brainrot, anime, hyperreal, cursed, emo

    var id: String { rawValue }

    var displayTitle: String {
        switch self {
        case .cute: return "Cute"; case .horror: return "Horror"
        case .sigma: return "Sigma"; case .brainrot: return "Brainrot"
        case .anime: return "Anime"; case .hyperreal: return "Hyperreal"
        case .cursed: return "Cursed"; case .emo: return "Emo"
        }
    }

    var emoji: String {
        switch self {
        case .cute: return "💖"; case .horror: return "💀"
        case .sigma: return "🗿"; case .brainrot: return "🧠"
        case .anime: return "✨"; case .hyperreal: return "👁️"
        case .cursed: return "🌀"; case .emo: return "🖤"
        }
    }
}

enum CursedUGCIntensity: String, CaseIterable, Codable {
    case mild, strong, extreme

    var displayTitle: String {
        switch self {
        case .mild:    return loc(en: "Mild", ru: "Mild")
        case .strong:  return loc(en: "Strong", ru: "Strong")
        case .extreme: return loc(en: "Unhinged", ru: "Unhinged")
        }
    }
}

// MARK: - Wire types

struct CursedUGCFakeStats: Codable {
    let wishlistedBy: String
    let trendingRank: Int
    let bannedInCountries: Int
    let daysLeft: String
}

struct CursedUGCVariation: Codable, Identifiable {
    var id: String { label }
    let label: String
    let imageUrl: String?
}

struct CursedUGCResponse: Codable {
    let generationId: String
    let categoryId: String
    let styleId: String
    let intensity: String
    let titleEN: String
    let titleRU: String
    let descriptionEN: String
    let descriptionRU: String
    let tags: [String]
    let shareCaption: String
    let rarityVibeEN: String
    let rarityVibeRU: String
    let fakePriceRobux: Int
    let fakeStats: CursedUGCFakeStats
    let mainImageUrl: String?
    let variations: [CursedUGCVariation]
    let generationStatus: String

    var localizedTitle: String       { GlowupLocale.isRussian ? titleRU : titleEN }
    var localizedDescription: String { GlowupLocale.isRussian ? descriptionRU : descriptionEN }
    var localizedRarity: String      { GlowupLocale.isRussian ? rarityVibeRU : rarityVibeEN }
}

struct CursedUGCGenerateRequest: Encodable {
    let categoryId: String
    let styleId: String
    let intensity: String
    let userPrompt: String?
}

enum CursedUGCAPIError: LocalizedError {
    case rateLimited
    case underlying(Error)

    var errorDescription: String? {
        switch self {
        case .rateLimited:
            return loc(en: "Too many cursed requests. Wait a minute.",
                       ru: "Слишком много cursed запросов. Подожди минутку.")
        case .underlying(let err): return err.localizedDescription
        }
    }
}

enum CursedUGCAPIClient {
    static func generate(
        category: CursedUGCCategory,
        style: CursedUGCStyle,
        intensity: CursedUGCIntensity,
        userPrompt: String? = nil
    ) async throws -> CursedUGCResponse {
        let trimmed = userPrompt?.trimmingCharacters(in: .whitespacesAndNewlines)
        let body = CursedUGCGenerateRequest(
            categoryId: category.rawValue,
            styleId: style.rawValue,
            intensity: intensity.rawValue,
            userPrompt: trimmed?.isEmpty == false ? trimmed : nil
        )
        do {
            return try await APIClient.request(
                "api/cursed-ugc/generate",
                method: "POST",
                body: body,
                timeout: 60
            )
        } catch APIError.httpError(let code) where code == 429 {
            throw CursedUGCAPIError.rateLimited
        } catch {
            throw CursedUGCAPIError.underlying(error)
        }
    }
}
