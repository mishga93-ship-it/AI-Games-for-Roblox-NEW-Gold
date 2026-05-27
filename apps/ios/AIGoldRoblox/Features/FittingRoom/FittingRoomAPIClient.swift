// FittingRoomAPIClient.swift — Zero-Robux UGC Fitting Room API client
// (session 386). Polling-based: start() returns generationId, status() is
// called every ~1.5s until done.

import Foundation

// Reuse Outfit Generator's 9 aesthetics — fitting room IS a visualization
// layer over outfits, not a new product. Type-alias keeps iOS API tidy.
typealias FittingRoomAesthetic = OutfitAesthetic
typealias FittingRoomGender    = OutfitGender
typealias FittingRoomStyle     = OutfitStyleMode
typealias FittingRoomRemix     = OutfitRemixMode

// MARK: - Wire types

struct FittingRoomRenders: Codable {
    let front: String?
    let threeQuarter: String?
    let back: String?

    enum CodingKeys: String, CodingKey {
        case front
        case threeQuarter = "three_quarter"
        case back
    }
}

struct FittingRoomDocResponse: Codable {
    let generationId: String
    let firebaseUid: String?
    let aestheticId: String
    let gender: String
    let style: String
    let remix: String?
    let robloxUserId: String?
    let fitOnUser: Bool
    let renders: FittingRoomRenders
    let items: [OutfitItem]
    let totalCostRobux: Int
    let savedRobux: Int
    let title: String
    let pitchEN: String
    let pitchRU: String
    let shareCaption: String
    let appStoreHook: String
    let status: String                 // pending | partial | ready | failed
    let done: Bool
    let errorCode: String?

    var localizedPitch: String { GlowupLocale.isRussian ? pitchRU : pitchEN }
}

struct FittingRoomStartResponse: Codable {
    let generationId: String
}

struct FittingRoomStartRequest: Encodable {
    let aestheticId: String
    let gender: String
    let style: String
    let remix: String?
    let robloxUsername: String?
}

enum FittingRoomAPIError: LocalizedError {
    case rateLimited
    case underlying(Error)

    var errorDescription: String? {
        switch self {
        case .rateLimited:
            return loc(en: "Too many fitting requests. Wait a minute.",
                       ru: "Слишком много запросов. Подожди минутку.")
        case .underlying(let err): return err.localizedDescription
        }
    }
}

enum FittingRoomAPIClient {
    static func start(
        aesthetic: FittingRoomAesthetic,
        gender: FittingRoomGender,
        style: FittingRoomStyle,
        remix: FittingRoomRemix? = nil,
        robloxUsername: String? = nil
    ) async throws -> FittingRoomStartResponse {
        let trimmed = robloxUsername?.trimmingCharacters(in: .whitespacesAndNewlines)
        let body = FittingRoomStartRequest(
            aestheticId: aesthetic.rawValue,
            gender: gender.rawValue,
            style: style.rawValue,
            remix: remix?.rawValue,
            robloxUsername: trimmed?.isEmpty == false ? trimmed : nil
        )
        do {
            return try await APIClient.request(
                "api/fitting-room/start",
                method: "POST",
                body: body,
                timeout: 15
            )
        } catch APIError.httpError(let code) where code == 429 {
            throw FittingRoomAPIError.rateLimited
        } catch {
            throw FittingRoomAPIError.underlying(error)
        }
    }

    static func status(generationId: String) async throws -> FittingRoomDocResponse {
        do {
            return try await APIClient.request(
                "api/fitting-room/\(generationId)",
                method: "GET",
                timeout: 10
            )
        } catch {
            throw FittingRoomAPIError.underlying(error)
        }
    }
}
