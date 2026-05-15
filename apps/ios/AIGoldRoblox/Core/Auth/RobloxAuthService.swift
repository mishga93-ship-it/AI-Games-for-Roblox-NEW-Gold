//
//  RobloxAuthService.swift
//  AIGoldRoblox
//

import Foundation
import CryptoKit
import AuthenticationServices

@MainActor
final class RobloxAuthService: NSObject, ObservableObject {
    static let shared = RobloxAuthService()

    static let clientID = "7166160104941278245"
    static let redirectURI = "https://api-z4yzt6dhjq-uc.a.run.app/api/roblox/callback"
    static let scopes = "openid profile asset:read asset:write game-pass:write developer-product:write"

    @Published var isConnected = false
    @Published var robloxUserId: String?
    @Published var universeId: String?
    @Published var isLoading = false
    @Published var errorMessage: String?

    private let connectedKey = "robloxOAuthConnected"
    private let robloxUserIdKey = "robloxOAuthUserId"
    private let universeIdKey = "robloxUniverseId"

    private var codeVerifier: String?
    private var authSession: ASWebAuthenticationSession?

    private override init() {
        super.init()
        isConnected = UserDefaults.standard.bool(forKey: connectedKey)
        robloxUserId = UserDefaults.standard.string(forKey: robloxUserIdKey)
        universeId = UserDefaults.standard.string(forKey: universeIdKey)
    }

    func setUniverseId(_ id: String?) {
        let trimmed = id?.trimmingCharacters(in: .whitespacesAndNewlines)
        universeId = (trimmed?.isEmpty == true) ? nil : trimmed
        if let universeId {
            UserDefaults.standard.set(universeId, forKey: universeIdKey)
        } else {
            UserDefaults.standard.removeObject(forKey: universeIdKey)
        }
    }

    func startOAuthFlow() {
        errorMessage = nil
        isLoading = true

        let verifier = generateCodeVerifier()
        codeVerifier = verifier
        let challenge = generateCodeChallenge(from: verifier)
        let state = UUID().uuidString

        var components = URLComponents(string: "https://apis.roblox.com/oauth/v1/authorize")!
        components.queryItems = [
            URLQueryItem(name: "client_id", value: Self.clientID),
            URLQueryItem(name: "redirect_uri", value: Self.redirectURI),
            URLQueryItem(name: "scope", value: Self.scopes),
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "code_challenge", value: challenge),
            URLQueryItem(name: "code_challenge_method", value: "S256"),
            URLQueryItem(name: "state", value: state),
        ]

        guard let authURL = components.url else {
            errorMessage = "Failed to build authorization URL"
            isLoading = false
            return
        }

        let session = ASWebAuthenticationSession(
            url: authURL,
            callbackURLScheme: "aigoldroblox"
        ) { [weak self] callbackURL, error in
            Task { @MainActor in
                guard let self else { return }
                if let error {
                    if (error as NSError).code == ASWebAuthenticationSessionError.canceledLogin.rawValue {
                        self.isLoading = false
                        return
                    }
                    self.errorMessage = error.localizedDescription
                    self.isLoading = false
                    return
                }
                guard let callbackURL,
                      let code = URLComponents(url: callbackURL, resolvingAgainstBaseURL: false)?
                        .queryItems?.first(where: { $0.name == "code" })?.value else {
                    self.errorMessage = "No authorization code received"
                    self.isLoading = false
                    return
                }
                await self.exchangeCodeForTokens(code: code)
            }
        }

        session.presentationContextProvider = self
        session.prefersEphemeralWebBrowserSession = false
        authSession = session
        session.start()
    }

    func disconnect() async {
        isLoading = true
        defer { isLoading = false }

        do {
            let _: DisconnectResponse = try await APIClient.request(
                "api/roblox/disconnect",
                method: "POST"
            )
        } catch {
            // Best-effort server cleanup
        }

        isConnected = false
        robloxUserId = nil
        UserDefaults.standard.set(false, forKey: connectedKey)
        UserDefaults.standard.removeObject(forKey: robloxUserIdKey)
    }

    func handleCallback(url: URL) -> Bool {
        guard url.scheme == "aigoldroblox",
              url.host == "roblox-oauth-callback" else { return false }
        return true
    }

    // MARK: - Private

    private func exchangeCodeForTokens(code: String) async {
        guard let verifier = codeVerifier else {
            errorMessage = "Missing code verifier"
            isLoading = false
            return
        }

        struct TokenRequest: Encodable {
            let code: String
            let codeVerifier: String
            let redirectUri: String
        }
        struct TokenResponse: Decodable {
            let connected: Bool
            let robloxUserId: String?
        }

        do {
            let response: TokenResponse = try await APIClient.request(
                "api/roblox/token",
                method: "POST",
                body: TokenRequest(
                    code: code,
                    codeVerifier: verifier,
                    redirectUri: Self.redirectURI
                )
            )

            isConnected = response.connected
            robloxUserId = response.robloxUserId
            UserDefaults.standard.set(response.connected, forKey: connectedKey)
            if let uid = response.robloxUserId {
                UserDefaults.standard.set(uid, forKey: robloxUserIdKey)
            }
        } catch {
            errorMessage = "Failed to connect account: \(error.localizedDescription)"
        }

        codeVerifier = nil
        isLoading = false
    }

    private func generateCodeVerifier() -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        return Data(bytes)
            .base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    private func generateCodeChallenge(from verifier: String) -> String {
        let data = Data(verifier.utf8)
        let hash = SHA256.hash(data: data)
        return Data(hash)
            .base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}

extension RobloxAuthService: ASWebAuthenticationPresentationContextProviding {
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        guard let scene = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .first(where: { $0.activationState == .foregroundActive }),
              let window = scene.windows.first(where: \.isKeyWindow) else {
            return ASPresentationAnchor()
        }
        return window
    }
}

private struct DisconnectResponse: Decodable {
    let disconnected: Bool?
}
