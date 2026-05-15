//
//  OnboardingFlowView.swift
//  AIGoldRoblox
//
//  Unified onboarding: Welcome → Focus → Interests → Sign Up → Ready!
//

import AuthenticationServices
import SwiftUI

struct OnboardingFlowView: View {
    @EnvironmentObject private var appState: AppState
    @State private var step = 0
    @State private var selectedFocus: CreationFocus = .both
    @State private var selectedInterests: Set<CreatorInterest> = [.obby, .ugc, .scripts]
    @State private var hasLoadedInitialState = false

    // Auth
    @State private var isSignUp = true
    @State private var email = ""
    @State private var password = ""
    @State private var authDisplayName = ""
    @State private var errorMessage: String?
    @State private var isLoading = false
    @State private var currentNonce = ""

    private let passwordRuleText = "At least 8 characters with uppercase, lowercase, number and special character."

    var body: some View {
        ZStack {
            LinearGradient(colors: [.gradientTop, .gradientBottom], startPoint: .topLeading, endPoint: .bottomTrailing)
                .ignoresSafeArea()

            VStack(spacing: 24) {
                header

                Group {
                    switch step {
                    case 0:
                        introStep
                    case 1:
                        focusStep
                    case 2:
                        interestsStep
                    case 3:
                        signUpStep
                    default:
                        readyStep
                    }
                }

                Spacer(minLength: 0)

                footer
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 24)

            if isLoading {
                Color.black.opacity(0.4).ignoresSafeArea()
                ProgressView().tint(.white)
            }
        }
        .dismissKeyboardOnTap()
        .onAppear {
            guard !hasLoadedInitialState else { return }
            hasLoadedInitialState = true
            selectedFocus = appState.creationFocus
            selectedInterests = Set(appState.creatorInterests.isEmpty ? [.obby, .ugc, .scripts] : appState.creatorInterests)

            if appState.hasCompletedOnboarding, appState.currentUser == nil {
                step = 3
            }
        }
    }

    // MARK: - Header

    private var header: some View {
        VStack(alignment: .leading, spacing: 14) {
            BrandLockup(markSize: 38, showsSubtitle: step == 0)

            HStack {
                Capsule()
                    .fill(Color.accentPrimary)
                    .frame(width: CGFloat(step + 1) * 56, height: 8)
                    .animation(.spring(response: 0.35, dampingFraction: 0.8), value: step)
                Spacer()
                Text("Step \(step + 1) / \(totalSteps)")
                    .font(.appCaption)
                    .foregroundColor(.textSecondary)
            }

            TechnicalText(titleForStep, baseFont: .appLargeTitle, technicalFont: .appTechnical(size: 28, weight: .bold))
                .foregroundColor(.textPrimary)

            TechnicalText(subtitleForStep, baseFont: .appBody, technicalFont: .appTechnical(size: 16, weight: .semibold))
                .foregroundColor(.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Steps

    private var introStep: some View {
        VStack(spacing: 18) {
            RoundedRectangle(cornerRadius: 34)
                .fill(Color.white.opacity(0.92))
                .frame(height: 280)
                .overlay {
                    Image("OnboardingCreatorHero")
                        .resizable()
                        .scaledToFill()
                }
                .clipShape(RoundedRectangle(cornerRadius: 34))

            HStack(spacing: 12) {
                IntroMetric(title: "Game", subtitle: ".rbxl ready", color: .accentPrimary)
                IntroMetric(title: "Asset", subtitle: ".rbxm / .fbx", color: .accentSecondary)
                IntroMetric(title: "Script", subtitle: "Luau doctor", color: .accentOrange)
            }
        }
    }

    private var focusStep: some View {
        VStack(spacing: 12) {
            ForEach(CreationFocus.allCases) { focus in
                SelectableCard(
                    title: focus.rawValue,
                    subtitle: focusSubtitle(for: focus),
                    icon: focusIcon(for: focus),
                    isSelected: selectedFocus == focus
                ) {
                    selectedFocus = focus
                }
            }
        }
    }

    private var interestsStep: some View {
        VStack(alignment: .leading, spacing: 18) {
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                ForEach(CreatorInterest.allCases) { interest in
                    Button {
                        toggleInterest(interest)
                    } label: {
                        HStack(spacing: 10) {
                            Image(systemName: interest.icon)
                                .font(.system(size: 18, weight: .semibold))
                            Text(interest.rawValue)
                                .font(.appCallout)
                            Spacer()
                        }
                        .foregroundColor(selectedInterests.contains(interest) ? .white : .textPrimary)
                        .padding(14)
                        .background(selectedInterests.contains(interest) ? Color.accentPrimary : Color.cardBackground)
                        .clipShape(RoundedRectangle(cornerRadius: 18))
                        .overlay(
                            RoundedRectangle(cornerRadius: 18)
                                .stroke(Color.accentPrimary.opacity(selectedInterests.contains(interest) ? 0 : 0.15), lineWidth: 1)
                        )
                    }
                    .buttonStyle(.plain)
                }
            }

            Text("Pick at least 3. These interests shape your Home feed, template lanes and Smart Interview defaults.")
                .font(.appCaption)
                .foregroundColor(.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    @ViewBuilder
    private var signUpStep: some View {
        if appState.currentUser != nil {
            VStack(spacing: 20) {
                Image(systemName: "person.crop.circle.fill.badge.checkmark")
                    .font(.system(size: 56))
                    .foregroundColor(.accentPrimary)

                Text("Signed in as \(appState.currentUser?.displayName ?? "")")
                    .font(.appHeadline)
                    .foregroundColor(.textPrimary)

                if let email = appState.currentUser?.email {
                    Text(email)
                        .font(.appBody)
                        .foregroundColor(.textSecondary)
                }
            }
            .frame(maxWidth: .infinity)
        } else {
            ScrollView {
                VStack(spacing: 16) {
                    if isSignUp {
                        TextField("Name", text: $authDisplayName, prompt: Text("Name").foregroundColor(.textSecondary))
                            .textFieldStyle(.plain)
                            .foregroundColor(.textPrimary)
                            .textInputAutocapitalization(.words)
                            .padding(16)
                            .background(Color.white.opacity(0.92))
                            .clipShape(RoundedRectangle(cornerRadius: 18))
                    }

                    TextField("Email", text: $email, prompt: Text("Email").foregroundColor(.textSecondary))
                        .textFieldStyle(.plain)
                        .foregroundColor(.textPrimary)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .padding(16)
                        .background(Color.white.opacity(0.92))
                        .clipShape(RoundedRectangle(cornerRadius: 18))

                    SecureField("Password", text: $password, prompt: Text("Password").foregroundColor(.textSecondary))
                        .textFieldStyle(.plain)
                        .foregroundColor(.textPrimary)
                        .padding(16)
                        .background(Color.white.opacity(0.92))
                        .clipShape(RoundedRectangle(cornerRadius: 18))

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
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    PrimaryButton(title: isSignUp ? "Create Account" : "Sign In") {
                        Task { await submitAuth() }
                    }

                    authDivider

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
                        .clipShape(RoundedRectangle(cornerRadius: 18))
                    }

                    SignInWithAppleButton(.continue) { request in
                        prepareAppleRequest(request)
                    } onCompletion: { result in
                        handleAppleResult(result)
                    }
                    .signInWithAppleButtonStyle(.white)
                    .frame(height: 54)
                    .clipShape(RoundedRectangle(cornerRadius: 18))

                    Button(action: { isSignUp.toggle(); errorMessage = nil }) {
                        Text(isSignUp ? "Already have an account? Sign In" : "No account yet? Sign Up")
                            .font(.appCallout)
                            .foregroundColor(.accentSecondary)
                    }
                }
            }
        }
    }

    private var readyStep: some View {
        VStack(spacing: 24) {
            Spacer()

            Image(systemName: "checkmark.seal.fill")
                .font(.system(size: 72))
                .foregroundStyle(.linearGradient(
                    colors: [.accentPrimary, .accentSecondary],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ))

            if let user = appState.currentUser {
                Text("Welcome, \(user.displayName)!")
                    .font(.appLargeTitle)
                    .foregroundColor(.textPrimary)
                    .multilineTextAlignment(.center)
            }

            VStack(alignment: .leading, spacing: 12) {
                SummaryRow(title: "Focus", value: selectedFocus.rawValue)
                SummaryRow(title: "Interests", value: selectedInterests.map(\.rawValue).sorted().joined(separator: ", "))
            }
            .padding(18)
            .background(Color.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: 22))
            .overlay(
                RoundedRectangle(cornerRadius: 22)
                    .stroke(Color.accentPrimary.opacity(0.14), lineWidth: 1)
            )

            Spacer()
        }
    }

    private var authDivider: some View {
        HStack {
            Rectangle().fill(Color.textSecondary.opacity(0.3)).frame(height: 1)
            Text("or")
                .font(.appCaption)
                .foregroundColor(.textSecondary)
            Rectangle().fill(Color.textSecondary.opacity(0.3)).frame(height: 1)
        }
    }

    // MARK: - Footer

    private var footer: some View {
        VStack(spacing: 12) {
            if step != 3 || appState.currentUser != nil {
                PrimaryButton(title: step == totalSteps - 1 ? "Enter Kami" : "Continue") {
                    if step == totalSteps - 1 {
                        finishOnboarding()
                    } else {
                        withAnimation(.spring(response: 0.35, dampingFraction: 0.82)) {
                            step += 1
                        }
                    }
                }
                .opacity(canContinue ? 1 : 0.55)
                .allowsHitTesting(canContinue)
            }

            if step > 0 {
                Button("Back") {
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.82)) {
                        step -= 1
                    }
                }
                .font(.appCallout)
                .foregroundColor(.textSecondary)
            }
        }
    }

    // MARK: - Step Metadata

    private var titleForStep: String {
        switch step {
        case 0: return "Welcome to Kami"
        case 1: return "Choose your creation focus"
        case 2: return "Tell us what you want to build"
        case 3: return "Create your account"
        default: return "You're all set!"
        }
    }

    private var subtitleForStep: String {
        switch step {
        case 0: return "Games, assets, scripts, UGC and fixes in one branded AI workspace."
        case 1: return "We will tune the shell, home feed and create hub around this."
        case 2: return "Your interests power templates, trends, challenge prompts and starter lanes."
        case 3: return "Sign up to save progress and unlock all creator features."
        default: return "Your Kami workspace is ready. Let's build something amazing."
        }
    }

    private var totalSteps: Int { 5 }

    private var canContinue: Bool {
        switch step {
        case 4:
            return appState.currentUser != nil
        default:
            return true
        }
    }

    // MARK: - Onboarding Completion

    private func finishOnboarding() {
        appState.completeOnboarding(
            displayName: appState.currentUser?.displayName ?? "Player",
            gender: appState.currentUser?.gender ?? .preferNotToSay,
            age: appState.currentUser?.age,
            avatarImageData: appState.currentUser?.avatarImageData,
            focus: selectedFocus,
            expertise: .beginner,
            interests: Array(selectedInterests).sorted { $0.rawValue < $1.rawValue },
            robloxUsername: ""
        )
    }

    // MARK: - Auth

    private func handleAuthSuccess(_ user: User) {
        appState.setUser(user)
        withAnimation(.spring(response: 0.35, dampingFraction: 0.82)) {
            step = 4
        }
    }

    private func submitAuth() async {
        let trimmedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let trimmedName = authDisplayName.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !trimmedEmail.isEmpty, !password.isEmpty else {
            errorMessage = "Please fill in all fields"
            return
        }
        guard isValidEmail(trimmedEmail) else {
            errorMessage = "Enter a valid email address."
            return
        }
        if isSignUp && trimmedName.isEmpty {
            errorMessage = "Enter your name"
            return
        }
        if isSignUp {
            if let msg = validatePassword(password) {
                errorMessage = msg
                return
            }
        }

        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            let user: User
            if isSignUp {
                user = try await AuthService().signUp(email: trimmedEmail, password: password, displayName: trimmedName)
            } else {
                user = try await AuthService().signIn(email: trimmedEmail, password: password)
            }
            await MainActor.run { handleAuthSuccess(user) }
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
            handleAuthSuccess(user)
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
                    handleAuthSuccess(user)
                } catch {
                    errorMessage = error.localizedDescription
                }
            }
        case .failure(let error):
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Helpers

    private func toggleInterest(_ interest: CreatorInterest) {
        if selectedInterests.contains(interest) {
            if selectedInterests.count > 3 {
                selectedInterests.remove(interest)
            }
        } else {
            selectedInterests.insert(interest)
        }
    }

    private func focusSubtitle(for focus: CreationFocus) -> String {
        switch focus {
        case .games:
            return "Voice-to-game generation, remixing, monetization and .rbxl export."
        case .content:
            return "UGC, scripts, maps, effects, UI and tools for game creators."
        case .both:
            return "Full creator platform with games, assets, community and publishing."
        }
    }

    private func focusIcon(for focus: CreationFocus) -> String {
        switch focus {
        case .games: return "gamecontroller.fill"
        case .content: return "shippingbox.fill"
        case .both: return "sparkles"
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

private struct IntroMetric: View {
    let title: String
    let subtitle: String
    let color: Color

    var body: some View {
        VStack(spacing: 6) {
            Text(title)
                .font(.system(size: 18, weight: .black, design: .rounded))
                .foregroundColor(color)
            Text(subtitle)
                .font(.appCaption)
                .foregroundColor(.textSecondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14)
        .background(Color.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 18))
    }
}

private struct SelectableCard: View {
    let title: String
    let subtitle: String
    let icon: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 16) {
                ZStack {
                    RoundedRectangle(cornerRadius: 18)
                        .fill(isSelected ? Color.accentPrimary : Color.white.opacity(0.86))
                        .frame(width: 56, height: 56)
                    Image(systemName: icon)
                        .font(.system(size: 22, weight: .semibold))
                        .foregroundColor(isSelected ? .white : .accentPrimary)
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text(title)
                        .font(.appHeadline)
                        .foregroundColor(.textPrimary)
                    Text(subtitle)
                        .font(.appCaption)
                        .foregroundColor(.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Spacer()

                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundColor(isSelected ? .accentPrimary : .textTertiary)
            }
            .padding(18)
            .background(Color.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: 22))
            .overlay(
                RoundedRectangle(cornerRadius: 22)
                    .stroke(isSelected ? Color.accentPrimary : Color.accentPrimary.opacity(0.08), lineWidth: isSelected ? 2 : 1)
            )
        }
        .buttonStyle(.plain)
    }
}

private struct SummaryRow: View {
    let title: String
    let value: String

    var body: some View {
        HStack(alignment: .top) {
            Text(title)
                .font(.appCaption)
                .foregroundColor(.textSecondary)
                .frame(width: 72, alignment: .leading)
            Text(value)
                .font(.appCallout)
                .foregroundColor(.textPrimary)
            Spacer()
        }
    }
}
