// GlowupStudio.swift — state controller for the Avatar Glow-Up Studio
// (session 382 Phase 2 Session B).
//
// Owns the full UX flow:
//   step .interview → guided chat: vibe → gender → intensity →
//                     (optional) username → auto-generate →
//   step .loading   → API call (5-15 s) →
//   step .result    → preview, asset pack, share, decal upload
//
// All Roblox / Photos / Share-Sheet side effects live here so the SwiftUI
// view layer stays declarative.

import Foundation
import SwiftUI
import UIKit
import Photos

// MARK: - Localization

/// English is the default. We switch to Russian ONLY when the user's iOS
/// interface or in-app override is Russian. Mirrors the same pattern used
/// in ForgeView.swift.
enum GlowupLocale {
    static var isRussian: Bool {
        let code = UserDefaults.standard.string(forKey: "appLanguage")
            ?? Locale.preferredLanguages.first
            ?? ""
        return code
            .lowercased()
            .replacingOccurrences(of: "_", with: "-")
            .split(separator: "-")
            .first == "ru"
    }
}

/// Pick the localized string. Defaults to English unless Russian is detected.
func loc(en: String, ru: String) -> String {
    GlowupLocale.isRussian ? ru : en
}

@MainActor
final class GlowupStudio: ObservableObject {
    enum Step: Equatable {
        case interview
        case loading
        case result(GlowupGenerationResponse)
        case error(String)

        static func == (lhs: Step, rhs: Step) -> Bool {
            switch (lhs, rhs) {
            case (.interview, .interview): return true
            case (.loading, .loading): return true
            case let (.result(a), .result(b)): return a.generationId == b.generationId
            case let (.error(a), .error(b)): return a == b
            default: return false
            }
        }
    }

    /// Which answer the guided interview is currently waiting on.
    enum InterviewSlot: Equatable { case vibe, gender, intensity, username }

    /// One rendered line in the interview transcript.
    struct GlowupChatLine: Identifiable, Equatable {
        enum Role { case assistant, user }
        let id = UUID()
        let role: Role
        let text: String
    }

    @Published var step: Step = .interview
    @Published var gender: GlowupGender = .neutral
    @Published var intensity: GlowupIntensity = .clean
    @Published var robloxUsername: String = ""
    @Published var transientToast: String? = nil

    // Interview state
    @Published var chatLines: [GlowupChatLine] = []
    @Published var awaiting: InterviewSlot? = nil
    @Published var selectedVibe: GlowupVibe? = nil

    @ObservedObject private var robloxAuth = RobloxAuthService.shared

    var oauthConnected: Bool { robloxAuth.isConnected }
    var allVibes: [GlowupVibe] { GlowupVibe.allCases }

    init() {
        startInterview()
    }

    // MARK: - Interview flow

    /// Reset everything and start the guided chat interview from the top.
    func startInterview() {
        selectedVibe = nil
        gender = .neutral
        intensity = .clean
        robloxUsername = ""
        chatLines = []
        step = .interview
        askVibe()
    }

    /// Result-screen "Another vibe" — full restart of the interview.
    func backToPicker() { startInterview() }

    /// Result-screen "Change parameters" — keep the vibe, re-ask from gender.
    func backToCustomize() {
        let keep: GlowupVibe?
        if let v = selectedVibe {
            keep = v
        } else if case let .result(resp) = step {
            keep = GlowupVibe(rawValue: resp.vibeId)
        } else {
            keep = nil
        }
        guard let vibe = keep else { startInterview(); return }
        selectedVibe = vibe
        chatLines = []
        step = .interview
        appendAssistant(loc(en: "Keeping \(vibe.displayTitle). Who's this for?",
                            ru: "Оставляю \(vibe.displayTitle). Под кого собираем?"))
        awaiting = .gender
    }

    func retryAfterError() { startInterview() }

    private func askVibe() {
        appendAssistant(loc(
            en: "Let's make you look like you dropped tens of thousands of R$ — for 0. What are we faking? 😎",
            ru: "Сделаем лук, будто ты слил десятки тысяч R$ — за 0. Что фейкаем? 😎"))
        awaiting = .vibe
    }

    func answerVibe(_ vibe: GlowupVibe) {
        selectedVibe = vibe
        appendUser(vibe.displayTitle)
        GlowupAPIClient.recordEvent("vibe_selected", vibe: vibe)
        askGender()
    }

    private func askGender() {
        appendAssistant(loc(en: "Nice pick. Who's this for?", ru: "Топ. Под кого собираем?"))
        awaiting = .gender
    }

    func answerGender(_ g: GlowupGender) {
        gender = g
        appendUser(genderLabel(g))
        askIntensity()
    }

    private func askIntensity() {
        appendAssistant(loc(en: "How hard do we go?", ru: "Насколько жёстко делаем?"))
        awaiting = .intensity
    }

    func answerIntensity(_ i: GlowupIntensity) {
        intensity = i
        appendUser(intensityLabel(i))
        if oauthConnected {
            appendAssistant(loc(
                en: "Roblox connected — I'll put YOU in this look. Building it now…",
                ru: "Roblox подключён — поставлю ТЕБЯ в этот лук. Собираю…"))
            awaiting = nil
            Task { await generate() }
        } else {
            askUsername()
        }
    }

    private func askUsername() {
        appendAssistant(loc(
            en: "Last thing — your Roblox username? You'll see YOURSELF in the look. Or skip for a generic preview.",
            ru: "Последнее — твой Roblox-ник? Увидишь СЕБЯ в этом луке. Или пропусти — будет generic preview."))
        awaiting = .username
    }

    /// Username text field's send button.
    func submitUsername() {
        let name = robloxUsername.trimmingCharacters(in: .whitespacesAndNewlines)
        appendUser(name.isEmpty ? loc(en: "Skip", ru: "Пропустить") : name)
        awaiting = nil
        Task { await generate() }
    }

    func skipUsername() {
        robloxUsername = ""
        appendUser(loc(en: "Skip", ru: "Пропустить"))
        awaiting = nil
        Task { await generate() }
    }

    // MARK: - Generation

    func generate() async {
        guard let vibe = selectedVibe else { return }
        step = .loading
        let trimmedUsername = robloxUsername.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            let resp = try await GlowupAPIClient.generate(
                vibe: vibe,
                gender: gender,
                intensity: intensity,
                robloxUsername: trimmedUsername.isEmpty ? nil : trimmedUsername,
                autoUploadDecal: false  // explicit upload via Result screen button
            )
            step = .result(resp)
        } catch let GlowupAPIError.rateLimited(_, reason) {
            step = .error(reason == "daily"
                ? loc(en: "Daily limit reached. Try again tomorrow.",
                      ru: "Лимит на сегодня закончился. Попробуй завтра.")
                : loc(en: "Too fast. Wait a minute and try again.",
                      ru: "Слишком быстро. Подожди минутку и попробуй снова."))
        } catch {
            step = .error(error.localizedDescription)
        }
    }

    // MARK: - Interview labels & helpers

    func genderLabel(_ g: GlowupGender) -> String {
        switch g {
        case .boys:    return loc(en: "Guys",    ru: "Парень")
        case .girls:   return loc(en: "Girls",   ru: "Девушка")
        case .neutral: return loc(en: "Neutral", ru: "Neutral")
        }
    }

    func intensityLabel(_ i: GlowupIntensity) -> String {
        switch i {
        case .clean: return loc(en: "Clean",  ru: "Чисто")
        case .scary: return loc(en: "Spooky", ru: "Страшнее")
        }
    }

    private func appendAssistant(_ text: String) {
        chatLines.append(GlowupChatLine(role: .assistant, text: text))
    }
    private func appendUser(_ text: String) {
        chatLines.append(GlowupChatLine(role: .user, text: text))
    }

    // MARK: - Result-screen actions

    func openRobloxCatalogItem(_ assetId: String) {
        guard let url = URL(string: "https://www.roblox.com/catalog/\(assetId)") else { return }
        UIApplication.shared.open(url)
    }

    func openRobloxUploadPage() {
        guard let url = URL(string: "https://create.roblox.com/dashboard/creations/upload") else { return }
        UIApplication.shared.open(url)
        GlowupAPIClient.recordEvent("upload_clicked", meta: ["target": "create_dashboard"])
    }

    func saveImageToPhotos(urlString: String, label: String = "Image") {
        guard let url = URL(string: urlString) else {
            toast(loc(en: "Bad URL — can't download.", ru: "Не получилось — некорректный URL."))
            return
        }
        Task.detached { [weak self] in
            do {
                let (data, _) = try await URLSession.shared.data(from: url)
                guard let image = UIImage(data: data) else { throw URLError(.cannotDecodeContentData) }
                let status = await Self.requestAddPhotosPermission()
                guard status == .authorized || status == .limited else {
                    await self?.toast(loc(en: "Photos access denied — enable it in Settings.",
                                          ru: "Нет доступа к Фото — разреши в настройках."))
                    return
                }
                UIImageWriteToSavedPhotosAlbum(image, nil, nil, nil)
                await self?.toast(loc(en: "✅ \(label) saved to Photos",
                                      ru: "✅ \(label) сохранён в Фото"))
            } catch {
                await self?.toast(loc(en: "⚠️ Couldn't save \(label): \(error.localizedDescription)",
                                      ru: "⚠️ Не получилось сохранить \(label): \(error.localizedDescription)"))
            }
        }
    }

    func shareLook() {
        guard case let .result(resp) = step else { return }
        GlowupAPIClient.recordEvent("share_clicked", vibe: GlowupVibe(rawValue: resp.vibeId))
        Task {
            do {
                guard let url = URL(string: resp.previewUrl) else { return }
                let (data, _) = try await URLSession.shared.data(from: url)
                guard let image = UIImage(data: data) else { return }
                // Image-only — when [UIImage, String] is passed, iOS shows the
                // text as lockup title and the share looks like a text file.
                // Caption is rendered on the poster image itself.
                _ = GlowupLocale.isRussian ? resp.shareCaptionRU : resp.shareCaptionEN
                presentActivitySheet(items: [image])
            } catch {
                toast(loc(en: "Couldn't prepare image: \(error.localizedDescription)",
                          ru: "Не получилось подготовить картинку: \(error.localizedDescription)"))
            }
        }
    }

    func uploadDecal() async {
        guard case let .result(resp) = step else { return }
        guard oauthConnected else {
            toast(loc(en: "Connect Roblox in Settings to upload the decal.",
                      ru: "Подключи Roblox в настройках, чтобы загрузить decal."))
            return
        }
        GlowupAPIClient.recordEvent("upload_clicked", vibe: GlowupVibe(rawValue: resp.vibeId), meta: ["target": "decal"])
        do {
            let upload = try await GlowupAPIClient.uploadDecal(
                decalUrl: resp.assetPack.decalUrl,
                displayName: "\(resp.title) Glow-Up Decal"
            )
            toast(loc(en: "✅ Decal uploaded to Roblox (asset \(upload.assetId))",
                      ru: "✅ Decal загружен в Roblox (asset \(upload.assetId))"))
        } catch GlowupAPIError.robloxNotConnected {
            toast(loc(en: "Connect Roblox in Settings.", ru: "Подключи Roblox в настройках."))
        } catch {
            toast(loc(en: "⚠️ Failed: \(error.localizedDescription)",
                      ru: "⚠️ Не получилось: \(error.localizedDescription)"))
        }
    }

    // MARK: - Helpers

    private func toast(_ message: String) {
        transientToast = message
        Task {
            try? await Task.sleep(nanoseconds: 3_500_000_000)
            if self.transientToast == message {
                self.transientToast = nil
            }
        }
    }

    private static func requestAddPhotosPermission() async -> PHAuthorizationStatus {
        await withCheckedContinuation { cont in
            PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
                cont.resume(returning: status)
            }
        }
    }

    private func presentActivitySheet(items: [Any]) {
        let activityVC = UIActivityViewController(activityItems: items, applicationActivities: nil)
        guard let scene = UIApplication.shared.connectedScenes.first(where: { $0.activationState == .foregroundActive }) as? UIWindowScene,
              let window = scene.windows.first(where: { $0.isKeyWindow }),
              var top = window.rootViewController else { return }
        while let presented = top.presentedViewController { top = presented }
        if let popover = activityVC.popoverPresentationController {
            popover.sourceView = top.view
            popover.sourceRect = CGRect(x: top.view.bounds.midX, y: top.view.bounds.midY, width: 0, height: 0)
            popover.permittedArrowDirections = []
        }
        top.present(activityVC, animated: true)
    }
}
