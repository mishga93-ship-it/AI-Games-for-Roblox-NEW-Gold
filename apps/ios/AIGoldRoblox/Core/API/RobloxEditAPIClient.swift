// RobloxEditAPIClient.swift — Release 4 client for editing / analyzing / advising
// on an EXISTING Roblox model (.rbxm) or place (.rbxl). Talks to the backend
// /api/roblox/* endpoints wired in session 430 (index.ts) on top of the
// Phase 1-3 pipeline (analyze deep/outline/scope -> edit-ops -> apply; advisors).
//
// Networking mirrors the existing *APIClient enums (DisasterSpawner/Outfit/...):
// thin static funcs over APIClient.request with Codable wire types.

import Foundation

// MARK: - Shared

enum RobloxEditTarget: String, Codable, CaseIterable {
    case model // .rbxm
    case place // .rbxl

    /// Best-effort target inference from a file name/extension.
    static func infer(fromFileName name: String) -> RobloxEditTarget {
        name.lowercased().hasSuffix(".rbxl") || name.lowercased().hasSuffix(".rbxlx") ? .place : .model
    }
}

enum RobloxEditAPIError: LocalizedError {
    case rateLimited
    case emptyInput
    case emptyRequest
    case workerUnavailable
    case underlying(Error)

    var errorDescription: String? {
        switch self {
        case .rateLimited:
            return loc(en: "Too many requests. Wait a minute.",
                       ru: "Слишком много запросов. Подожди минутку.")
        case .emptyInput:
            return loc(en: "Pick a .rbxm or .rbxl file first.",
                       ru: "Сначала выбери файл .rbxm или .rbxl.")
        case .emptyRequest:
            return loc(en: "Describe what to change — type or speak.",
                       ru: "Опиши, что изменить — введи или произнеси.")
        case .workerUnavailable:
            return loc(en: "Editor service is warming up. Try again shortly.",
                       ru: "Сервис редактора прогревается. Попробуй чуть позже.")
        case .underlying(let err):
            return err.localizedDescription
        }
    }
}

// MARK: - Wire types

private struct RobloxEditRequest: Encodable {
    let inputBase64: String
    let target: String
    let request: String
    let scope: String?
}

struct RobloxEditResponse: Codable {
    let outputBase64: String
    let target: String
    let opsApplied: Int
    let scopeUsed: String?
    let dropped: [String]?

    /// Decoded edited binary, ready to write to a .rbxm/.rbxl file.
    var outputData: Data? { Data(base64Encoded: outputBase64) }
}

private struct RobloxAnalystRequest: Encodable {
    let inputBase64: String
    let target: String
    let description: String?
}

struct RobloxSuggestion: Codable, Identifiable {
    let category: String
    let severity: String
    let title: String
    let detail: String

    var id: String { "\(category)-\(severity)-\(title)" }
}

struct RobloxAnalystResponse: Codable {
    let suggestions: [RobloxSuggestion]
    let usedLlm: Bool
}

private struct RobloxMonetizeRequest: Encodable {
    let inputBase64: String
    let target: String
    let genre: String?
}

struct RobloxMonetizationItem: Codable, Identifiable {
    let kind: String // "gamepass" | "devproduct"
    let name: String
    let priceRobux: Int
    let rationale: String

    var id: String { "\(kind)-\(name)" }
}

struct RobloxMonetizationPlan: Codable {
    let items: [RobloxMonetizationItem]
    let notes: [String]
}

struct RobloxMonetizeResponse: Codable {
    let plan: RobloxMonetizationPlan
    let usedLlm: Bool
}

struct RobloxStarterTemplate: Codable, Identifiable {
    let id: String
    let title: String
    let genre: String
    let summary: String
    let tags: [String]
    let suggestedGamepasses: [String]
    let suggestedDevProducts: [String]
}

struct RobloxStarterTemplatesResponse: Codable {
    let templates: [RobloxStarterTemplate]
}

// MARK: - Client

enum RobloxEditAPIClient {
    /// Upload an existing model/place + a natural-language change; get the edited
    /// binary back. For a place, the backend auto-scopes to the relevant subtree
    /// unless `scope` ("ref:N" | "path:/...") is provided.
    static func edit(
        inputBase64: String,
        target: RobloxEditTarget,
        request: String,
        scope: String? = nil
    ) async throws -> RobloxEditResponse {
        guard !inputBase64.isEmpty else { throw RobloxEditAPIError.emptyInput }
        let trimmed = request.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { throw RobloxEditAPIError.emptyRequest }
        do {
            return try await APIClient.request(
                "api/roblox/edit",
                method: "POST",
                body: RobloxEditRequest(inputBase64: inputBase64, target: target.rawValue, request: trimmed, scope: scope),
                timeout: 120
            )
        } catch let error { throw Self.map(error) }
    }

    /// AI Game Analyst — retention/economy/social/monetization review.
    static func analyst(
        inputBase64: String,
        target: RobloxEditTarget,
        description: String? = nil
    ) async throws -> RobloxAnalystResponse {
        guard !inputBase64.isEmpty else { throw RobloxEditAPIError.emptyInput }
        do {
            return try await APIClient.request(
                "api/roblox/analyst",
                method: "POST",
                body: RobloxAnalystRequest(inputBase64: inputBase64, target: target.rawValue, description: description),
                timeout: 90
            )
        } catch let error { throw Self.map(error) }
    }

    /// AI Monetization Advisor — gamepass / dev-product / pricing plan.
    static func monetize(
        inputBase64: String,
        target: RobloxEditTarget,
        genre: String? = nil
    ) async throws -> RobloxMonetizeResponse {
        guard !inputBase64.isEmpty else { throw RobloxEditAPIError.emptyInput }
        do {
            return try await APIClient.request(
                "api/roblox/monetize",
                method: "POST",
                body: RobloxMonetizeRequest(inputBase64: inputBase64, target: target.rawValue, genre: genre),
                timeout: 90
            )
        } catch let error { throw Self.map(error) }
    }

    /// Starter Template Library. Optionally filter by genre. (Sits behind the
    /// app's global auth middleware like the other /api/roblox/* routes, so it
    /// requires a Firebase token — the app is always authenticated.)
    static func starterTemplates(genre: String? = nil) async throws -> [RobloxStarterTemplate] {
        let path = genre.map { "api/roblox/starter-templates?genre=\($0)" } ?? "api/roblox/starter-templates"
        do {
            let resp: RobloxStarterTemplatesResponse = try await APIClient.request(
                path,
                method: "GET"
            )
            return resp.templates
        } catch let error { throw Self.map(error) }
    }

    private static func map(_ error: Error) -> RobloxEditAPIError {
        if case APIError.httpError(let code) = error {
            if code == 429 { return .rateLimited }
            if code == 503 { return .workerUnavailable }
        }
        if let already = error as? RobloxEditAPIError { return already }
        return .underlying(error)
    }
}
