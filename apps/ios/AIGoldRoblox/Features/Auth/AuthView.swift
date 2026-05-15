//
//  AuthView.swift
//  AIGoldRoblox
//

import SwiftUI
import AuthenticationServices

struct AuthView: View {
    let onAuthenticated: (User) -> Void
    @State private var isSignUp = false
    @State private var email = ""
    @State private var password = ""
    @State private var displayName = ""
    @State private var errorMessage: String?
    @State private var isLoading = false
    @State private var currentNonce = ""
    private let passwordRuleText = "Password: at least 8 characters, with uppercase, lowercase, number, and special character."

    var body: some View {
        ZStack {
            LinearGradient(colors: [.gradientTop, .gradientBottom], startPoint: .topLeading, endPoint: .bottomTrailing)
                .ignoresSafeArea()
            ScrollView {
                VStack(spacing: 24) {
                    BrandLockup(markSize: 48, showsSubtitle: true)
                        .frame(maxWidth: .infinity, alignment: .leading)

                    Text(isSignUp ? "Sign Up" : "Sign In")
                        .font(.appLargeTitle)
                        .foregroundColor(.textPrimary)
                    if isSignUp {
                        TextField("Name", text: $displayName)
                            .textFieldStyle(.plain)
                            .padding()
                            .background(Color.cardBackground)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                            .foregroundColor(.textPrimary)
                            .autocapitalization(.none)
                    }
                    TextField("Email", text: $email)
                        .textFieldStyle(.plain)
                        .padding()
                        .background(Color.cardBackground)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                        .foregroundColor(.textPrimary)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    SecureField("Password", text: $password)
                        .textFieldStyle(.plain)
                        .padding()
                        .background(Color.cardBackground)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                        .foregroundColor(.textPrimary)
                    if isSignUp {
                        Text(passwordRuleText)
                            .font(.appCaption)
                            .foregroundColor(.textSecondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    if let msg = errorMessage {
                        Text(msg)
                            .font(.appCaption)
                            .foregroundColor(.red)
                    }
                    PrimaryButton(
                        title: isSignUp ? "Create Account" : "Sign In",
                        action: { Task { await submit() } }
                    )
                    Button(action: { Task { await submitGoogle() } }) {
                        HStack(spacing: 12) {
                            Image(systemName: "globe")
                                .font(.headline)
                            Text("Continue with Google")
                                .font(.appCallout.weight(.semibold))
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                        .background(Color.white)
                        .foregroundColor(.black)
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                    }
                    SignInWithAppleButton(.continue) { request in
                        prepareAppleRequest(request)
                    } onCompletion: { result in
                        handleAppleResult(result)
                    }
                    .signInWithAppleButtonStyle(.white)
                    .frame(height: 54)
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                    Button(action: { isSignUp.toggle(); errorMessage = nil }) {
                        Text(isSignUp ? "Already have an account? Sign In" : "No account yet? Sign Up")
                            .font(.appCallout)
                            .foregroundColor(.accentSecondary)
                    }
                }
                .padding(24)
            }
            if isLoading {
                Color.black.opacity(0.4)
                    .ignoresSafeArea()
                ProgressView()
                    .tint(.white)
            }
        }
        .dismissKeyboardOnTap()
    }

    private func submit() async {
        let trimmedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let trimmedDisplayName = displayName.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !trimmedEmail.isEmpty, !password.isEmpty else {
            errorMessage = "Please fill in all fields"
            return
        }
        guard isValidEmail(trimmedEmail) else {
            errorMessage = "Enter a valid email address."
            return
        }
        if isSignUp && trimmedDisplayName.isEmpty {
            errorMessage = "Enter your name"
            return
        }
        if isSignUp {
            let passwordValidationMessage = validatePassword(password)
            guard passwordValidationMessage == nil else {
                errorMessage = passwordValidationMessage
                return
            }
        }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            let user: User
            if isSignUp {
                user = try await AuthService().signUp(email: trimmedEmail, password: password, displayName: trimmedDisplayName)
            } else {
                user = try await AuthService().signIn(email: trimmedEmail, password: password)
            }
            await MainActor.run { onAuthenticated(user) }
        } catch {
            await MainActor.run { errorMessage = error.localizedDescription }
        }
    }

    @MainActor
    private func submitGoogle() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            let user = try await AuthService().signInWithGoogle()
            onAuthenticated(user)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func prepareAppleRequest(_ request: ASAuthorizationAppleIDRequest) {
        let nonce = AuthService.randomNonceString()
        currentNonce = nonce
        request.requestedScopes = [.fullName, .email]
        request.nonce = AuthService.sha256(nonce)
    }

    private func handleAppleResult(_ result: Result<ASAuthorization, Error>) {
        switch result {
        case .success(let authorization):
            guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential else {
                errorMessage = "Apple Sign-In returned an unexpected credential."
                return
            }
            guard let identityToken = credential.identityToken,
                  let idTokenString = String(data: identityToken, encoding: .utf8) else {
                errorMessage = "Apple Sign-In did not return a valid identity token."
                return
            }

            let rawNonce = currentNonce
            Task { @MainActor in
                isLoading = true
                errorMessage = nil
                defer { isLoading = false }

                do {
                    let user = try await AuthService().signInWithApple(
                        idToken: idTokenString,
                        rawNonce: rawNonce,
                        fullName: credential.fullName
                    )
                    onAuthenticated(user)
                } catch {
                    errorMessage = error.localizedDescription
                }
            }
        case .failure(let error):
            errorMessage = error.localizedDescription
        }
    }

    private func isValidEmail(_ value: String) -> Bool {
        let pattern = #"^[A-Z0-9a-z._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$"#
        return value.range(of: pattern, options: .regularExpression) != nil
    }

    private func validatePassword(_ value: String) -> String? {
        guard value.count >= 8 else {
            return "Password must be at least 8 characters."
        }
        guard value.range(of: #"[A-Z]"#, options: .regularExpression) != nil else {
            return "Password must include at least one uppercase letter."
        }
        guard value.range(of: #"[a-z]"#, options: .regularExpression) != nil else {
            return "Password must include at least one lowercase letter."
        }
        guard value.range(of: #"[0-9]"#, options: .regularExpression) != nil else {
            return "Password must include at least one number."
        }
        guard value.range(of: #"[^A-Za-z0-9]"#, options: .regularExpression) != nil else {
            return "Password must include at least one special character."
        }
        return nil
    }
}
