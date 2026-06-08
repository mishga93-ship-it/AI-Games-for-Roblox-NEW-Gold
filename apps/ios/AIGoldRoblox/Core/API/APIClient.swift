//
//  APIClient.swift
//  AIGoldRoblox
//

import Foundation
#if canImport(FirebaseAuth)
import FirebaseAuth
#endif

extension Notification.Name {
    static let userBanned = Notification.Name("AIGoldRoblox.userBanned")
    /// Smart Stub navigation: userInfo["tab"] = RootTab.rawValue (Int), userInfo["action"] = String
    static let smartStubNavigate = Notification.Name("AIGoldRoblox.smartStubNavigate")
    /// Generation notification tap/action: userInfo may include jobId, threadId, projectKind, contentSubcategory.
    static let openGenerationChat = Notification.Name("AIGoldRoblox.openGenerationChat")
    /// Posted after a generation notification route has opened the target preview/screen.
    static let generationNotificationRouteReady = Notification.Name("AIGoldRoblox.generationNotificationRouteReady")
    /// Foreground generation notification received while the app is active.
    static let foregroundGenerationNotification = Notification.Name("AIGoldRoblox.foregroundGenerationNotification")
    /// Session 338: posted when an in-app generation alert should be removed
    /// (e.g. user approved the concept locally). userInfo: jobId, type.
    static let clearForegroundGenerationAlert = Notification.Name("AIGoldRoblox.clearForegroundGenerationAlert")
    /// Challenge notification tap/action: opens the Challenges surface.
    static let openChallenges = Notification.Name("AIGoldRoblox.openChallenges")
}

struct APIClient {
    /// Env `API_BASE_URL` (Xcode scheme) overrides; else value from Settings (`apiBaseURL` in UserDefaults).
    static var baseURL: URL {
        let fromEnv = ProcessInfo.processInfo.environment["API_BASE_URL"]
        let fromSettings = UserDefaults.standard.string(forKey: "apiBaseURL")
        let s = fromEnv ?? fromSettings ?? "https://api-z4yzt6dhjq-uc.a.run.app/"
        return URL(string: s) ?? URL(string: "https://api-z4yzt6dhjq-uc.a.run.app/")!
    }

    static var defaultHeaders: [String: String] {
        ["Content-Type": "application/json", "Accept": "application/json"]
    }

    static func request<T: Decodable>(
        _ path: String,
        method: String = "GET",
        body: Encodable? = nil,
        token: String? = nil,
        timeout: TimeInterval? = nil,
        requiresAuth: Bool = true
    ) async throws -> T {
        let url = URL(string: path, relativeTo: baseURL) ?? baseURL.appendingPathComponent(path)
        var request = URLRequest(url: url)
        request.httpMethod = method
        if let timeout { request.timeoutInterval = timeout }
        defaultHeaders.forEach { request.setValue($1, forHTTPHeaderField: $0) }
        // Public endpoints must skip token resolution: getIDToken() itself can
        // throw (no session / refresh failure), which would otherwise also sink
        // an unauthenticated fallback call.
        if requiresAuth {
            let authToken = try await resolvedToken(explicitToken: token)
            if let authToken {
                request.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")
            }
        }
        if let body = body {
            request.httpBody = try JSONEncoder().encode(AnyEncodable(body))
        }
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            let statusCode = (response as? HTTPURLResponse)?.statusCode ?? -1
            let bodyPreview = String(data: data.prefix(500), encoding: .utf8) ?? "<non-utf8>"
            print("[APIClient] HTTP \(statusCode) for \(request.httpMethod ?? "?") \(request.url?.path ?? "?"): \(bodyPreview)")
            if statusCode == 403, let banInfo = try? JSONDecoder().decode(BanInfo.self, from: data), banInfo.banned {
                NotificationCenter.default.post(name: .userBanned, object: banInfo)
                throw APIError.banned(banInfo)
            }
            throw APIError.httpError(statusCode)
        }
        return try JSONDecoder().decode(T.self, from: data)
    }

    /// Returns raw `Data` instead of decoded object — useful when the response shape varies.
    static func requestRaw(
        _ path: String,
        method: String = "GET",
        body: Encodable? = nil,
        token: String? = nil,
        timeout: TimeInterval? = nil
    ) async throws -> Data {
        let url = URL(string: path, relativeTo: baseURL) ?? baseURL.appendingPathComponent(path)
        var request = URLRequest(url: url)
        request.httpMethod = method
        if let timeout { request.timeoutInterval = timeout }
        defaultHeaders.forEach { request.setValue($1, forHTTPHeaderField: $0) }
        let authToken = try await resolvedToken(explicitToken: token)
        if let authToken {
            request.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")
        }
        if let body = body {
            request.httpBody = try JSONEncoder().encode(AnyEncodable(body))
        }
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            let statusCode = (response as? HTTPURLResponse)?.statusCode ?? -1
            if statusCode == 403, let banInfo = try? JSONDecoder().decode(BanInfo.self, from: data), banInfo.banned {
                NotificationCenter.default.post(name: .userBanned, object: banInfo)
                throw APIError.banned(banInfo)
            }
            throw APIError.httpError(statusCode)
        }
        return data
    }

    private static func resolvedToken(explicitToken: String?) async throws -> String? {
        if let explicitToken, !explicitToken.isEmpty {
            return explicitToken
        }

        #if canImport(FirebaseAuth)
        let configured = FirebaseBootstrap.configureIfNeeded()
        guard configured else {
            return nil
        }
        if let user = Auth.auth().currentUser {
            return try await user.getIDToken()
        }
        #endif

        return nil
    }

}

private struct AnyEncodable: Encodable {
    let value: Encodable
    init(_ value: Encodable) { self.value = value }
    func encode(to encoder: Encoder) throws { try value.encode(to: encoder) }
}

enum APIError: Error {
    case httpError(Int)
    case banned(BanInfo)
    case decoding
}

extension APIError: LocalizedError {
    var errorDescription: String? {
        switch self {
        case .httpError(let code):
            return "Server error (HTTP \(code))"
        case .banned(let info):
            return info.reason ?? "Account suspended"
        case .decoding:
            return "Unexpected server response"
        }
    }
}

struct BanInfo: Codable {
    let banned: Bool
    let permanent: Bool
    let reason: String?
    let bannedUntil: String?

    var bannedUntilDate: Date? {
        guard let bannedUntil else { return nil }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.date(from: bannedUntil)
            ?? ISO8601DateFormatter().date(from: bannedUntil)
    }
}
