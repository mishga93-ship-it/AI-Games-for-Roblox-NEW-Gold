// GlowupStudio.swift — state controller for the Avatar Glow-Up Studio
// (session 382 Phase 2 Session B).
//
// Owns the full UX flow:
//   step .vibePicker → tap card →
//   step .customize  → gender + intensity + (optional) username + Generate →
//   step .loading    → API call (5-15 s) →
//   step .result     → preview, asset pack, share, decal upload
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
        case vibePicker
        case customize(GlowupVibe)
        case loading
        case result(GlowupGenerationResponse)
        case error(String)

        static func == (lhs: Step, rhs: Step) -> Bool {
            switch (lhs, rhs) {
            case (.vibePicker, .vibePicker): return true
            case (.loading, .loading): return true
            case let (.customize(a), .customize(b)): return a == b
            case let (.result(a), .result(b)): return a.generationId == b.generationId
            case let (.error(a), .error(b)): return a == b
            default: return false
            }
        }
    }

    @Published var step: Step = .vibePicker
    @Published var gender: GlowupGender = .neutral
    @Published var intensity: GlowupIntensity = .clean
    @Published var robloxUsername: String = ""
    @Published var transientToast: String? = nil

    @ObservedObject private var robloxAuth = RobloxAuthService.shared

    var oauthConnected: Bool { robloxAuth.isConnected }
    var allVibes: [GlowupVibe] { GlowupVibe.allCases }

    // MARK: - Flow

    func selectVibe(_ vibe: GlowupVibe) {
        GlowupAPIClient.recordEvent("vibe_selected", vibe: vibe)
        step = .customize(vibe)
    }

    func backToPicker() {
        step = .vibePicker
    }

    func backToCustomize() {
        if case let .result(resp) = step,
           let vibe = GlowupVibe(rawValue: resp.vibeId) {
            step = .customize(vibe)
        } else {
            step = .vibePicker
        }
    }

    func generate() async {
        guard case let .customize(vibe) = step else { return }
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
                ? "Лимит на сегодня закончился. Попробуй завтра."
                : "Слишком быстро. Подожди минутку и попробуй снова.")
        } catch {
            step = .error(error.localizedDescription)
        }
    }

    func retryAfterError() {
        step = .vibePicker
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
                let caption = GlowupLocale.isRussian ? resp.shareCaptionRU : resp.shareCaptionEN
                presentActivitySheet(items: [image, caption])
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
