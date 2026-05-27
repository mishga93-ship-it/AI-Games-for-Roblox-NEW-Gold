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
}
