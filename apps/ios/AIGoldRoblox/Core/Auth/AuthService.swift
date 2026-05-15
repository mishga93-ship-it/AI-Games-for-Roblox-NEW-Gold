//
//  AuthService.swift
//  AIGoldRoblox
//

import Foundation
import CryptoKit
import Security
#if canImport(FirebaseCore)
import FirebaseCore
#endif
#if canImport(FirebaseAuth)
import FirebaseAuth
#endif
#if canImport(GoogleSignIn)
import GoogleSignIn
#endif
#if canImport(UIKit)
import UIKit
#endif

struct AuthService {
    func signIn(email: String, password: String) async throws -> User {
        #if canImport(FirebaseAuth)
        if FirebaseBootstrap.configureIfNeeded() {
            let result = try await Auth.auth().signIn(withEmail: email, password: password)
            return makeUser(from: result.user, fallbackDisplayName: "User")
        }
        #endif

        struct Payload: Encodable { let email: String; let password: String }
        struct Response: Decodable { let token: String; let user: UserDTO }
        struct UserDTO: Decodable { let id: String; let displayName: String?; let email: String? }
        let res: Response = try await APIClient.request("api/auth/signin", method: "POST", body: Payload(email: email, password: password))
        return User(id: res.user.id, displayName: res.user.displayName ?? "User", email: res.user.email)
    }

    func signUp(email: String, password: String, displayName: String) async throws -> User {
        #if canImport(FirebaseAuth)
        if FirebaseBootstrap.configureIfNeeded() {
            let result = try await Auth.auth().createUser(withEmail: email, password: password)
            let changeRequest = result.user.createProfileChangeRequest()
            changeRequest.displayName = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
            try await changeRequest.commitChanges()
            return makeUser(from: result.user, fallbackDisplayName: displayName)
        }
        #endif

        struct Payload: Encodable { let email: String; let password: String; let displayName: String }
        struct Response: Decodable { let token: String; let user: UserDTO }
        struct UserDTO: Decodable { let id: String; let displayName: String?; let email: String? }
        let res: Response = try await APIClient.request("api/auth/signup", method: "POST", body: Payload(email: email, password: password, displayName: displayName))
        return User(id: res.user.id, displayName: res.user.displayName ?? displayName, email: res.user.email)
    }

    @MainActor
    func signInWithGoogle() async throws -> User {
        #if canImport(FirebaseCore) && canImport(FirebaseAuth) && canImport(GoogleSignIn) && canImport(UIKit)
        guard FirebaseBootstrap.configureIfNeeded() else {
            throw AuthError.firebaseNotConfigured
        }
        guard let clientID = FirebaseApp.app()?.options.clientID else {
            throw AuthError.googleClientIDMissing
        }
        guard let presenter = topViewController() else {
            throw AuthError.missingPresenter
        }

        GIDSignIn.sharedInstance.configuration = GIDConfiguration(clientID: clientID)

        let result: GIDSignInResult = try await withCheckedThrowingContinuation { continuation in
            GIDSignIn.sharedInstance.signIn(withPresenting: presenter) { result, error in
                if let error {
                    continuation.resume(throwing: error)
                } else if let result {
                    continuation.resume(returning: result)
                } else {
                    continuation.resume(throwing: AuthError.googleSignInFailed)
                }
            }
        }

        let googleUser = result.user
        guard let idToken = googleUser.idToken?.tokenString else {
            throw AuthError.googleTokenMissing
        }

        let credential = GoogleAuthProvider.credential(
            withIDToken: idToken,
            accessToken: googleUser.accessToken.tokenString
        )
        let authResult = try await Auth.auth().signIn(with: credential)
        return makeUser(from: authResult.user, fallbackDisplayName: googleUser.profile?.name ?? "Google User")
        #else
        throw AuthError.googleSdkMissing
        #endif
    }

    func signInWithApple(idToken: String, rawNonce: String, fullName: PersonNameComponents?) async throws -> User {
        #if canImport(FirebaseAuth)
        guard FirebaseBootstrap.configureIfNeeded() else {
            throw AuthError.firebaseNotConfigured
        }

        let credential = OAuthProvider.appleCredential(
            withIDToken: idToken,
            rawNonce: rawNonce,
            fullName: fullName
        )
        let authResult = try await Auth.auth().signIn(with: credential)
        return makeUser(
            from: authResult.user,
            fallbackDisplayName: displayName(from: fullName) ?? "Apple User"
        )
        #else
        throw AuthError.appleSignInFailed
        #endif
    }

    func signOut() throws {
        #if canImport(FirebaseAuth)
        if FirebaseBootstrap.configureIfNeeded() {
            try Auth.auth().signOut()
            return
        }
        #endif
    }

    func deleteAccount() async throws {
        #if canImport(FirebaseAuth)
        if FirebaseBootstrap.configureIfNeeded() {
            guard let user = Auth.auth().currentUser else {
                throw AuthError.firebaseNotConfigured
            }
            do {
                try await user.delete()
                return
            } catch let error as NSError {
                // Bug 19: Firebase requires recent authentication for sensitive
                // operations like account deletion. If the ID token is older
                // than a few minutes the SDK throws this error code. Surface
                // it as a typed error so the UI can drive the appropriate
                // re-auth flow (password prompt / Google / Apple) before
                // retrying the delete.
                if error.code == AuthErrorCode.requiresRecentLogin.rawValue {
                    throw AuthError.requiresRecentLogin(provider: Self.primaryProvider(for: user))
                }
                throw error
            }
        }
        #endif

        struct Empty: Decodable {}
        let _: Empty = try await APIClient.request("api/auth/delete-account", method: "DELETE")
    }

    /// Re-authenticate the current email/password user with the provided
    /// password and then immediately delete the account. Used by the UI
    /// after `deleteAccount()` throws `.requiresRecentLogin(.email)`.
    func reauthenticateAndDelete(password: String) async throws {
        #if canImport(FirebaseAuth)
        guard FirebaseBootstrap.configureIfNeeded() else {
            throw AuthError.firebaseNotConfigured
        }
        guard let user = Auth.auth().currentUser, let email = user.email else {
            throw AuthError.firebaseNotConfigured
        }
        let credential = EmailAuthProvider.credential(withEmail: email, password: password)
        _ = try await user.reauthenticate(with: credential)
        try await user.delete()
        #else
        throw AuthError.firebaseNotConfigured
        #endif
    }

    /// Trigger a fresh Google sign-in, reauthenticate the current user with
    /// the resulting credential, and delete the account. Silent for the user
    /// beyond the Google sheet since Google SSO caches the session.
    @MainActor
    func reauthenticateWithGoogleAndDelete() async throws {
        #if canImport(FirebaseCore) && canImport(FirebaseAuth) && canImport(GoogleSignIn) && canImport(UIKit)
        guard FirebaseBootstrap.configureIfNeeded() else {
            throw AuthError.firebaseNotConfigured
        }
        guard let user = Auth.auth().currentUser else {
            throw AuthError.firebaseNotConfigured
        }
        guard let clientID = FirebaseApp.app()?.options.clientID else {
            throw AuthError.googleClientIDMissing
        }
        guard let presenter = topViewController() else {
            throw AuthError.missingPresenter
        }
        GIDSignIn.sharedInstance.configuration = GIDConfiguration(clientID: clientID)
        let result: GIDSignInResult = try await withCheckedThrowingContinuation { continuation in
            GIDSignIn.sharedInstance.signIn(withPresenting: presenter) { result, error in
                if let error {
                    continuation.resume(throwing: error)
                } else if let result {
                    continuation.resume(returning: result)
                } else {
                    continuation.resume(throwing: AuthError.googleSignInFailed)
                }
            }
        }
        guard let idToken = result.user.idToken?.tokenString else {
            throw AuthError.googleTokenMissing
        }
        let credential = GoogleAuthProvider.credential(
            withIDToken: idToken,
            accessToken: result.user.accessToken.tokenString
        )
        _ = try await user.reauthenticate(with: credential)
        try await user.delete()
        #else
        throw AuthError.googleSdkMissing
        #endif
    }

    /// Reauthenticate the current user with a fresh Apple identity token
    /// (obtained by the caller from `SignInWithAppleButton`) and delete.
    func reauthenticateWithAppleAndDelete(idToken: String, rawNonce: String, fullName: PersonNameComponents?) async throws {
        #if canImport(FirebaseAuth)
        guard FirebaseBootstrap.configureIfNeeded() else {
            throw AuthError.firebaseNotConfigured
        }
        guard let user = Auth.auth().currentUser else {
            throw AuthError.firebaseNotConfigured
        }
        let credential = OAuthProvider.appleCredential(
            withIDToken: idToken,
            rawNonce: rawNonce,
            fullName: fullName
        )
        _ = try await user.reauthenticate(with: credential)
        try await user.delete()
        #else
        throw AuthError.appleSignInFailed
        #endif
    }

    #if canImport(FirebaseAuth)
    private static func primaryProvider(for user: FirebaseAuth.User) -> AuthProviderKind {
        for info in user.providerData {
            switch info.providerID {
            case "password": return .email
            case "google.com": return .google
            case "apple.com": return .apple
            default: continue
            }
        }
        return .email
    }
    #endif

    #if canImport(FirebaseAuth)
    private func makeUser(from user: FirebaseAuth.User, fallbackDisplayName: String) -> User {
        let name = user.displayName?.trimmingCharacters(in: .whitespacesAndNewlines)
        return User(
            id: user.uid,
            displayName: (name?.isEmpty == false ? name! : fallbackDisplayName),
            email: user.email
        )
    }
    #endif

    private func displayName(from fullName: PersonNameComponents?) -> String? {
        guard let fullName else { return nil }
        let formatted = PersonNameComponentsFormatter().string(from: fullName)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return formatted.isEmpty ? nil : formatted
    }

    #if canImport(UIKit)
    @MainActor
    private func topViewController() -> UIViewController? {
        let activeScenes = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .filter { $0.activationState == .foregroundActive }

        for scene in activeScenes {
            if let root = scene.windows.first(where: \.isKeyWindow)?.rootViewController {
                return deepestViewController(from: root)
            }
        }

        return nil
    }

    private func deepestViewController(from controller: UIViewController) -> UIViewController {
        if let presented = controller.presentedViewController {
            return deepestViewController(from: presented)
        }
        if let navigation = controller as? UINavigationController, let visible = navigation.visibleViewController {
            return deepestViewController(from: visible)
        }
        if let tabBar = controller as? UITabBarController, let selected = tabBar.selectedViewController {
            return deepestViewController(from: selected)
        }
        return controller
    }
    #endif

    static func randomNonceString(length: Int = 32) -> String {
        precondition(length > 0)
        let charset = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
        var result = ""
        var remainingLength = length

        while remainingLength > 0 {
            var randoms = [UInt8](repeating: 0, count: 16)
            let errorCode = SecRandomCopyBytes(kSecRandomDefault, randoms.count, &randoms)
            if errorCode != errSecSuccess {
                fatalError("Unable to generate nonce. SecRandomCopyBytes failed with OSStatus \(errorCode)")
            }

            randoms.forEach { random in
                guard remainingLength > 0 else { return }
                if random < charset.count {
                    result.append(charset[Int(random)])
                    remainingLength -= 1
                }
            }
        }

        return result
    }

    static func sha256(_ input: String) -> String {
        let inputData = Data(input.utf8)
        let hashedData = SHA256.hash(data: inputData)
        return hashedData.map { String(format: "%02x", $0) }.joined()
    }
}

enum AuthProviderKind {
    case email
    case google
    case apple
}

enum AuthError: LocalizedError {
    case firebaseNotConfigured
    case googleClientIDMissing
    case missingPresenter
    case googleTokenMissing
    case googleSdkMissing
    case googleSignInFailed
    case appleTokenMissing
    case appleSignInFailed
    /// Thrown by `deleteAccount()` when Firebase demands a fresh auth
    /// session before a sensitive operation. The associated value tells
    /// the UI which reauth flow to show.
    case requiresRecentLogin(provider: AuthProviderKind)

    var errorDescription: String? {
        switch self {
        case .firebaseNotConfigured:
            return "Firebase is not configured in the app yet."
        case .googleClientIDMissing:
            return "Google Sign-In client ID is missing."
        case .missingPresenter:
            return "Could not open the Google sign-in window."
        case .googleTokenMissing:
            return "Google Sign-In did not return a valid token."
        case .googleSdkMissing:
            return "Google Sign-In SDK is not installed."
        case .googleSignInFailed:
            return "Google Sign-In failed. Please try again."
        case .appleTokenMissing:
            return "Apple Sign-In did not return a valid identity token."
        case .appleSignInFailed:
            return "Apple Sign-In failed. Please try again."
        case .requiresRecentLogin:
            return "For your security, please confirm your identity to delete your account."
        }
    }
}
