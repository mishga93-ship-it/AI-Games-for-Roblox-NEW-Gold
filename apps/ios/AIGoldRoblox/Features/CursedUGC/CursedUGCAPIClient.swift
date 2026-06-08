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
    // Session 390 — Meshy v6 GLB URL of the 3D mesh, populated when the
    // mesh stage finishes within the 75s soft timeout. The result screen
    // renders a rotatable SCNView with this; falls back to mainImageUrl
    // (2D PNG) when nil.
    let meshUrl: String?
    /** Meshy v6 PNG thumbnail of the 3D model — more accurate than the
     *  flux concept image and used as fallback in the share-poster + grids. */
    let meshThumbnailUrl: String?
    /// Session 396 — Roblox-ready .rbxm (one static MeshPart) built from the
    /// Meshy GLB via Open Cloud + Engine API. Populated when those creds are
    /// configured; nil → the result view offers the GLB as a 3D fallback so
    /// the deliverable is never just a 2D image.
    let rbxmUrl: String?
    /// Session 406 — real textured .fbx of the finished item (built from the
    /// optimized GLB via the worker's /convert-to-fbx). This is the format the
    /// user imports into Roblox Studio (Avatar → Import 3D) to publish their
    /// own UGC item. nil when the FBX worker is unreachable → falls back to
    /// the .rbxm / .glb export.
    let fbxUrl: String?
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

    /// Session 390 round 2 — fetch a previously persisted cursed-UGC
    /// generation by id. Used by `CursedUGCChatBridge` to re-hydrate the
    /// rich result payload from the artifact's `metadata.generationId`
    /// after a chat-flow generation completes. Endpoint is the unified
    /// `/api/viral-generations/:id` (same shape as Disaster / VoiceAura /
    /// FittingRoom). Convert the doc via `.toResponse()` to feed
    /// `CursedUGCResultView`.
    static func fetchById(_ generationId: String) async throws -> CursedUGCGenerationDoc {
        do {
            return try await APIClient.request(
                "api/viral-generations/\(generationId)",
                method: "GET",
                timeout: 20
            )
        } catch APIError.httpError(let code) where code == 401 {
            throw CursedUGCAPIError.underlying(APIError.httpError(401))
        } catch APIError.httpError(let code) where code == 404 {
            throw CursedUGCAPIError.underlying(APIError.httpError(404))
        } catch {
            throw CursedUGCAPIError.underlying(error)
        }
    }
}

// MARK: - Recents detail (GET /api/viral-generations/:id, kind=cursed_ugc)

/// Detail response when the doc kind is `cursed_ugc`. Mirrors the payload
/// shape recorded by `viralChatDispatch.ts handleCursedUGC()`. Outer
/// `generationId` is the Firestore doc id; inner `payload` holds the full
/// CursedUGCResponse-equivalent fields so the rich result view can render
/// the chat-flow generation identically to a fresh
/// `POST /api/cursed-ugc/generate` response.
struct CursedUGCGenerationDoc: Codable {
    let generationId: String
    let kind: String
    let title: String
    let subtitle: String?
    let thumbnailUrl: String?
    let accentHex: String?
    let createdAtMs: Double
    let payload: CursedUGCGenerationPayload

    /// Re-hydrate the full `CursedUGCResponse` so `CursedUGCResultView` can
    /// present this generation identically to a fresh
    /// `POST /api/cursed-ugc/generate` response. Fields missing from older
    /// payloads fall back to reasonable defaults so the view doesn't crash
    /// on partial data.
    func toResponse() -> CursedUGCResponse {
        let fallbackStats = CursedUGCFakeStats(
            wishlistedBy: "42K",
            trendingRank: 3,
            bannedInCountries: 2,
            daysLeft: "Limited 2d"
        )
        return CursedUGCResponse(
            generationId: generationId,
            categoryId: payload.categoryId ?? "brainrot_item",
            styleId: payload.styleId ?? "cursed",
            intensity: payload.intensity ?? "strong",
            titleEN: payload.titleEN ?? title,
            titleRU: payload.titleRU ?? title,
            descriptionEN: payload.descriptionEN ?? "",
            descriptionRU: payload.descriptionRU ?? "",
            tags: payload.tags ?? [],
            shareCaption: payload.shareCaption ?? (subtitle ?? ""),
            rarityVibeEN: payload.rarityVibeEN ?? "Legendary Meme",
            rarityVibeRU: payload.rarityVibeRU ?? "Легендарный Мем",
            fakePriceRobux: payload.fakePriceRobux ?? 75000,
            fakeStats: payload.fakeStats ?? fallbackStats,
            mainImageUrl: payload.mainImageUrl ?? thumbnailUrl,
            meshUrl: payload.meshUrl,
            meshThumbnailUrl: payload.meshThumbnailUrl,
            rbxmUrl: payload.rbxmUrl,
            fbxUrl: payload.fbxUrl,
            variations: payload.variations ?? [],
            generationStatus: payload.generationStatus ?? "ready"
        )
    }
}

struct CursedUGCGenerationPayload: Codable {
    let categoryId: String?
    let styleId: String?
    let intensity: String?
    let mainImageUrl: String?
    let meshUrl: String?
    let meshThumbnailUrl: String?
    let rbxmUrl: String?
    let fbxUrl: String?
    let variations: [CursedUGCVariation]?
    let titleEN: String?
    let titleRU: String?
    let descriptionEN: String?
    let descriptionRU: String?
    let tags: [String]?
    let shareCaption: String?
    let rarityVibeEN: String?
    let rarityVibeRU: String?
    let fakePriceRobux: Int?
    let fakeStats: CursedUGCFakeStats?
    let generationStatus: String?
}
