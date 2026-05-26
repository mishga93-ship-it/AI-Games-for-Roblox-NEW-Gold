// GlowupAPIClient.swift — Phase 2 Session B (session 382).
//
// Codable contract + URLSession wrapper for the Avatar Glow-Up Studio
// backend (POST /api/glowup/generate, GET /api/glowup/generations/:id,
// POST /api/glowup/upload-decal, POST /api/glowup/event).
//
// Reuses APIClient.baseURL + APIClient.request which already handles
// Firebase auth tokens via resolvedToken().

import Foundation

// MARK: - Wire types (mirror backend GlowupGenerateResult)

enum GlowupVibe: String, CaseIterable, Codable, Identifiable {
    case headlessShadow = "headless_shadow"
    case korbloxStyle   = "korblox_style"
    case void           = "void"
    case sigma          = "sigma"

    var id: String { rawValue }

    /// Russian display title — matches backend vibe.title strings.
    var displayTitle: String {
        switch self {
        case .headlessShadow: return "Headless Shadow"
        case .korbloxStyle:   return "Korblox Style"
        case .void:           return "Void"
        case .sigma:          return "Sigma"
        }
    }

    /// Marketing one-liner shown on the picker card.
    var shortPitch: String {
        switch self {
        case .headlessShadow:
            return loc(en: "Dark void where your head should be — for 0 R$",
                       ru: "Тёмный void на месте головы — за 0 R$")
        case .korbloxStyle:
            return loc(en: "Skeleton leg — 25 R$ instead of 17,000",
                       ru: "Скелетная нога — за 25 R$ вместо 17 000")
        case .void:
            return loc(en: "Pitch-black, faceless, cursed",
                       ru: "Полностью чёрный, безликий, cursed")
        case .sigma:
            return loc(en: "Sigma chad — cold, minimalist",
                       ru: "Sigma chad — холодный, минималистичный")
        }
    }

    /// What you save vs the real limited (used as a hype badge).
    var imitatedRetailRobux: Int {
        switch self {
        case .headlessShadow: return 31_000
        case .korbloxStyle:   return 17_000
        case .void:           return 25_000
        case .sigma:          return 5_000
        }
    }

    /// SF Symbol used as the placeholder card icon until we ship hero PNGs.
    var iconSymbol: String {
        switch self {
        case .headlessShadow: return "moon.stars.fill"
        case .korbloxStyle:   return "figure.walk.motion"
        case .void:           return "circle.fill"
        case .sigma:          return "person.fill.checkmark"
        }
    }

    /// Tint color hex for card background gradient.
    var accentHex: String {
        switch self {
        case .headlessShadow: return "1B2A33"
        case .korbloxStyle:   return "2D3540"
        case .void:           return "2A1A3A"
        case .sigma:          return "1F2530"
        }
    }
}

enum GlowupGender: String, Codable, CaseIterable { case boys, girls, neutral }
enum GlowupIntensity: String, Codable, CaseIterable { case clean, scary }
enum GlowupGenerationStatus: String, Codable { case queued, generating, ready, failed }

struct GlowupCatalogItem: Codable, Identifiable {
    var id: String { assetId }
    let assetId: String
    let name: String
    let pricedRobux: Int
    let category: String
    let role: String
    let notes: String
}

struct GlowupAssetPack: Codable {
    let shirtUrl: String
    let pantsUrl: String
    let decalUrl: String
}

struct GlowupCostBreakdown: Codable {
    let catalogCostRobux: Int
    let uploadFeesRobux: Int
    let totalCostRobux: Int
    let savedRobux: Int
}

struct GlowupRateLimitInfo: Codable {
    let hourlyRemaining: Int
    let dailyRemaining: Int
    let ipRemaining: Int?
}

struct GlowupGenerationResponse: Codable {
    let generationId: String
    let generationStatus: GlowupGenerationStatus
    let vibeId: String
    let title: String
    let pitch: String                // backward-compat (=== pitchRU)
    let pitchEN: String?
    let pitchRU: String?
    let appStoreHook: String
    let previewUrl: String
    let fitOnUser: Bool
    let assetPack: GlowupAssetPack
    let catalogItems: [GlowupCatalogItem]
    let instructionsRU: [String]
    let instructionsEN: [String]
    let shareCaptionRU: String
    let shareCaptionEN: String
    let cost: GlowupCostBreakdown
    let disclaimer: String           // backward-compat (=== disclaimerRU)
    let disclaimerEN: String?
    let disclaimerRU: String?
    let cached: Bool?
    let decalAssetId: String?
    let rateLimit: GlowupRateLimitInfo?

    /// Helper: picks the right pitch based on iOS locale, with fallbacks.
    var localizedPitch: String {
        if GlowupLocale.isRussian { return pitchRU ?? pitch }
        return pitchEN ?? pitch
    }
    var localizedDisclaimer: String {
        if GlowupLocale.isRussian { return disclaimerRU ?? disclaimer }
        return disclaimerEN ?? disclaimer
    }
}

struct GlowupDecalUploadResponse: Codable {
    let assetId: String
    let decalAssetUrl: String
}

// MARK: - Request bodies

struct GlowupGenerateRequest: Encodable {
    let vibeId: String
    let gender: String
    let intensity: String
    let robloxUsername: String?
    let autoUploadDecal: Bool?
}

struct GlowupUploadDecalRequest: Encodable {
    let decalUrl: String
    let displayName: String?
}

struct GlowupEventRequest: Encodable {
    let type: String
    let vibeId: String?
    let meta: [String: String]?
}

// MARK: - Errors

enum GlowupAPIError: LocalizedError {
    case rateLimited(retryAfterMs: Int?, reason: String?)
    case robloxNotConnected
    case generationFailed(generationId: String?)
    case underlying(Error)

    var errorDescription: String? {
        switch self {
        case .rateLimited(_, let reason):
            return reason == "daily"
                ? loc(en: "Daily limit reached — try again tomorrow.",
                      ru: "Лимит на сегодня закончился — попробуй завтра.")
                : loc(en: "Too many requests. Wait a minute and try again.",
                      ru: "Слишком много запросов. Подожди минутку.")
        case .robloxNotConnected:
            return loc(en: "Connect Roblox in Settings to auto-upload decals.",
                       ru: "Подключи Roblox в настройках, чтобы загрузить decal автоматически.")
        case .generationFailed:
            return loc(en: "Couldn't generate the look. Try again.",
                       ru: "Не получилось собрать лук. Попробуй ещё раз.")
        case .underlying(let err):
            return err.localizedDescription
        }
    }
}

// MARK: - Client

enum GlowupAPIClient {
    static func generate(
        vibe: GlowupVibe,
        gender: GlowupGender,
        intensity: GlowupIntensity,
        robloxUsername: String? = nil,
        autoUploadDecal: Bool = false
    ) async throws -> GlowupGenerationResponse {
        let body = GlowupGenerateRequest(
            vibeId: vibe.rawValue,
            gender: gender.rawValue,
            intensity: intensity.rawValue,
            robloxUsername: robloxUsername?.isEmpty == false ? robloxUsername : nil,
            autoUploadDecal: autoUploadDecal
        )
        do {
            return try await APIClient.request(
                "api/glowup/generate",
                method: "POST",
                body: body,
                timeout: 90
            )
        } catch APIError.httpError(let code) where code == 429 {
            throw GlowupAPIError.rateLimited(retryAfterMs: nil, reason: nil)
        } catch {
            throw GlowupAPIError.underlying(error)
        }
    }

    static func fetchGeneration(id: String) async throws -> GlowupGenerationResponse {
        do {
            return try await APIClient.request("api/glowup/generations/\(id)", method: "GET")
        } catch {
            throw GlowupAPIError.underlying(error)
        }
    }

    static func uploadDecal(decalUrl: String, displayName: String? = nil) async throws -> GlowupDecalUploadResponse {
        let body = GlowupUploadDecalRequest(decalUrl: decalUrl, displayName: displayName)
        do {
            return try await APIClient.request(
                "api/glowup/upload-decal",
                method: "POST",
                body: body,
                timeout: 60
            )
        } catch APIError.httpError(let code) where code == 409 {
            throw GlowupAPIError.robloxNotConnected
        } catch {
            throw GlowupAPIError.underlying(error)
        }
    }

    /// Fire-and-forget client analytics. Failures swallowed silently — we
    /// never block UX on an event write.
    static func recordEvent(_ type: String, vibe: GlowupVibe? = nil, meta: [String: String]? = nil) {
        let body = GlowupEventRequest(type: type, vibeId: vibe?.rawValue, meta: meta)
        Task.detached {
            struct EmptyResponse: Decodable {}
            _ = try? await APIClient.request(
                "api/glowup/event",
                method: "POST",
                body: body
            ) as EmptyResponse
        }
    }
}
