// VoiceAuraAPIClient.swift — Voice-to-Aura Particle Engine API client
// (session 385). Distinct from all prior generators — output includes a
// safe Roblox Lua particle script.

import Foundation
import SwiftUI

// MARK: - Style + modifiers

enum AuraStyle: String, CaseIterable, Codable, Identifiable {
    case anime, realistic, sigma, demon, cyber, void, cosmic, meme

    var id: String { rawValue }

    var displayTitle: String {
        switch self {
        case .anime:     return "Anime"
        case .realistic: return "Realistic"
        case .sigma:     return "Sigma"
        case .demon:     return "Demon"
        case .cyber:     return "Cyber"
        case .void:      return "Void"
        case .cosmic:    return "Cosmic"
        case .meme:      return "Meme"
        }
    }

    var emoji: String {
        switch self {
        case .anime:     return "⚔️"
        case .realistic: return "🔥"
        case .sigma:     return "🗿"
        case .demon:     return "👿"
        case .cyber:     return "⚡"
        case .void:      return "🌀"
        case .cosmic:    return "✨"
        case .meme:      return "💀"
        }
    }

    var accentHex: String {
        switch self {
        case .anime:     return "FF1493"
        case .realistic: return "FF6B35"
        case .sigma:     return "1F2530"
        case .demon:     return "8B0000"
        case .cyber:     return "00FFAA"
        case .void:      return "5C0D9C"
        case .cosmic:    return "8A2BE2"
        case .meme:      return "39FF14"
        }
    }
}

enum AuraIntensity: String, CaseIterable, Codable {
    case calm, aggressive, extreme

    var displayTitle: String {
        switch self {
        case .calm:       return loc(en: "Calm", ru: "Calm")
        case .aggressive: return loc(en: "Aggressive", ru: "Агрессивно")
        case .extreme:    return loc(en: "Extreme", ru: "Extreme")
        }
    }
}

enum AuraSize: String, CaseIterable, Codable {
    case small, normal, massive

    var displayTitle: String {
        switch self {
        case .small:   return loc(en: "Small", ru: "Маленькая")
        case .normal:  return loc(en: "Normal", ru: "Обычная")
        case .massive: return loc(en: "Massive", ru: "Огромная")
        }
    }
}

enum AuraTone: String, CaseIterable, Codable {
    case clean, cursed

    var displayTitle: String {
        switch self {
        case .clean:  return loc(en: "Clean", ru: "Clean")
        case .cursed: return loc(en: "Cursed", ru: "Cursed")
        }
    }
}

// MARK: - Wire types

struct AuraVariation: Codable, Identifiable {
    var id: String { label }
    let label: String
    let imageUrl: String?
}

struct AuraGenerationResponse: Codable {
    let generationId: String
    let style: String
    let intensity: String
    let size: String
    let tone: String
    let titleEN: String
    let titleRU: String
    let shareCaption: String
    let rarityVibeEN: String
    let rarityVibeRU: String
    let difficulty: String
    let previewUrl: String?
    let variations: [AuraVariation]
    let luaScript: String
    let safeUsedFallback: Bool
    let instructionsEN: [String]
    let instructionsRU: [String]
    let generationStatus: String

    var localizedTitle: String      { GlowupLocale.isRussian ? titleRU : titleEN }
    var localizedRarity: String     { GlowupLocale.isRussian ? rarityVibeRU : rarityVibeEN }
    var localizedInstructions: [String] {
        GlowupLocale.isRussian ? instructionsRU : instructionsEN
    }
}

struct AuraGenerateRequest: Encodable {
    let prompt: String
    let style: String
    let intensity: String
    let size: String
    let tone: String
    let inputMode: String
}

enum AuraAPIError: LocalizedError {
    case rateLimited
    case emptyPrompt
    case underlying(Error)

    var errorDescription: String? {
        switch self {
        case .rateLimited:
            return loc(en: "Too many aura requests. Wait a minute.",
                       ru: "Слишком много aura запросов. Подожди минутку.")
        case .emptyPrompt:
            return loc(en: "Tell me what kind of aura — type or speak.",
                       ru: "Скажи какая нужна aura — введи или произнеси.")
        case .underlying(let err): return err.localizedDescription
        }
    }
}

enum VoiceAuraAPIClient {
    static func generate(
        prompt: String,
        style: AuraStyle,
        intensity: AuraIntensity,
        size: AuraSize,
        tone: AuraTone,
        inputMode: String
    ) async throws -> AuraGenerationResponse {
        let trimmed = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { throw AuraAPIError.emptyPrompt }
        let body = AuraGenerateRequest(
            prompt: trimmed,
            style: style.rawValue,
            intensity: intensity.rawValue,
            size: size.rawValue,
            tone: tone.rawValue,
            inputMode: inputMode
        )
        do {
            return try await APIClient.request(
                "api/voice-aura/generate",
                method: "POST",
                body: body,
                timeout: 60
            )
        } catch APIError.httpError(let code) where code == 429 {
            throw AuraAPIError.rateLimited
        } catch {
            throw AuraAPIError.underlying(error)
        }
    }
}
