// FittingRoomStudio.swift — state controller for Zero-Robux UGC Fitting
// Room (session 386). Polling-based progressive loading.

import Foundation
import SwiftUI
import UIKit
import Photos

@MainActor
final class FittingRoomStudio: ObservableObject {
    enum Step: Equatable {
        case aestheticPicker
        case customize(FittingRoomAesthetic)
        case loading                  // job started, polling for renders
        case result(FittingRoomDocResponse)
        case error(String)

        static func == (lhs: Step, rhs: Step) -> Bool {
            switch (lhs, rhs) {
            case (.aestheticPicker, .aestheticPicker): return true
            case (.loading, .loading):                 return true
            case let (.customize(a), .customize(b)):   return a == b
            case let (.result(a), .result(b)):         return a.generationId == b.generationId
            case let (.error(a), .error(b)):           return a == b
            default: return false
            }
        }
    }

    @Published var step: Step = .aestheticPicker
    @Published var gender: FittingRoomGender = .neutral
    @Published var style: FittingRoomStyle = .dark
    @Published var robloxUsername: String = ""
    @Published var transientToast: String?

    /// Live updates from polling — preview renders appear as they finish.
    @Published var liveDoc: FittingRoomDocResponse?

    @ObservedObject private var robloxAuth = RobloxAuthService.shared
    var oauthConnected: Bool { robloxAuth.isConnected }

    private var pollTask: Task<Void, Never>?

    var allAesthetics: [FittingRoomAesthetic] { FittingRoomAesthetic.allCases }

    // MARK: - Flow

    func selectAesthetic(_ a: FittingRoomAesthetic) { step = .customize(a) }
    func backToPicker() { cancelPolling(); step = .aestheticPicker }
    func backToCustomize() {
        cancelPolling()
        if case let .result(r) = step, let a = FittingRoomAesthetic(rawValue: r.aestheticId) {
            step = .customize(a)
        } else {
            step = .aestheticPicker
        }
    }

    func start(remix: FittingRoomRemix? = nil) async {
        let aesthetic: FittingRoomAesthetic
        switch step {
        case .customize(let a): aesthetic = a
        case .result(let r):
            guard let a = FittingRoomAesthetic(rawValue: r.aestheticId) else { return }
            aesthetic = a
        default: return
        }
        step = .loading
        liveDoc = nil
        do {
            let resp = try await FittingRoomAPIClient.start(
                aesthetic: aesthetic,
                gender: gender,
                style: style,
                remix: remix,
                robloxUsername: robloxUsername
            )
            startPolling(generationId: resp.generationId)
        } catch let FittingRoomAPIError.rateLimited {
            step = .error(loc(en: "Too many requests. Wait a minute.",
                              ru: "Слишком много запросов. Подожди минутку."))
        } catch {
            step = .error(error.localizedDescription)
        }
    }

    private func startPolling(generationId: String) {
        pollTask?.cancel()
        pollTask = Task { [weak self] in
            let deadline = Date().addingTimeInterval(60)  // 60s hard cap
            while !Task.isCancelled, Date() < deadline {
                do {
                    let doc = try await FittingRoomAPIClient.status(generationId: generationId)
                    await MainActor.run {
                        self?.liveDoc = doc
                        // Show result screen as SOON as we have ANY render —
                        // even if just front is ready. Other angles fill in
                        // via liveDoc updates.
                        if let hasAny = self?.hasAnyRender(doc), hasAny, case .loading = self?.step {
                            self?.step = .result(doc)
                        }
                        if doc.done {
                            self?.step = .result(doc)
                        }
                    }
                    if doc.done { return }
                } catch {
                    // Transient — just retry next tick.
                }
                try? await Task.sleep(nanoseconds: 1_500_000_000)
            }
            await MainActor.run {
                guard let self else { return }
                if case .loading = self.step {
                    self.step = .error(loc(
                        en: "Took too long. Try again.",
                        ru: "Слишком долго. Попробуй снова."
                    ))
                }
            }
        }
    }

    private func cancelPolling() {
        pollTask?.cancel()
        pollTask = nil
    }

    private func hasAnyRender(_ doc: FittingRoomDocResponse) -> Bool {
        return doc.renders.front != nil
            || doc.renders.threeQuarter != nil
            || doc.renders.back != nil
    }

    func retryAfterError() { step = .aestheticPicker }

    // MARK: - Result actions

    func openCatalogItem(_ urlString: String) {
        guard let url = URL(string: urlString) else { return }
        UIApplication.shared.open(url)
    }

    func savePreviewToPhotos(urlString: String?) {
        guard let urlString, let url = URL(string: urlString) else {
            toast(loc(en: "Bad URL — can't save.", ru: "Некорректный URL."))
            return
        }
        Task.detached { [weak self] in
            do {
                let (data, _) = try await URLSession.shared.data(from: url)
                guard let image = UIImage(data: data) else { throw URLError(.cannotDecodeContentData) }
                let status = await Self.requestPhotosPermission()
                guard status == .authorized || status == .limited else {
                    await self?.toast(loc(en: "Photos access denied.", ru: "Нет доступа к Фото."))
                    return
                }
                UIImageWriteToSavedPhotosAlbum(image, nil, nil, nil)
                await self?.toast(loc(en: "✅ Saved to Photos", ru: "✅ Сохранено в Фото"))
            } catch {
                await self?.toast("⚠️ \(error.localizedDescription)")
            }
        }
    }

    func sharePoster() {
        guard case let .result(resp) = step else { return }
        Task { @MainActor in
            if #available(iOS 16.0, *), let image = await renderPoster(resp: resp) {
                // Image-only — see OutfitStudio.shareOutfit() for rationale.
                // Caption is rendered on the poster.
                _ = Self.shareCaption(resp)
                presentActivitySheet(items: [image])
            } else {
                presentActivitySheet(items: [Self.shareCaption(resp)])
            }
        }
    }

    private static func shareCaption(_ r: FittingRoomDocResponse) -> String {
        let savedStr = r.savedRobux > 0 ? "\nSaved \(r.savedRobux.formatted()) R$" : ""
        return "\(r.title) Fit — \(r.totalCostRobux) R$\(savedStr)\n\(r.shareCaption)\n\n#roblox #robloxfit #fyp #fitting #kamigold"
    }

    @available(iOS 16.0, *)
    @MainActor
    private func renderPoster(resp: FittingRoomDocResponse) async -> UIImage? {
        // Pre-download front render (the hero shot) for synchronous use.
        var heroImg: UIImage? = nil
        if let u = resp.renders.front ?? resp.renders.threeQuarter,
           let url = URL(string: u),
           let (data, _) = try? await URLSession.shared.data(from: url) {
            heroImg = UIImage(data: data)
        }
        let view = FittingRoomSharePoster(response: resp, heroImage: heroImg)
            .frame(width: 1080, height: 1920)
        let renderer = ImageRenderer(content: view)
        renderer.scale = 1.0
        return renderer.uiImage
    }

    // MARK: - Helpers

    private func toast(_ msg: String) {
        transientToast = msg
        Task {
            try? await Task.sleep(nanoseconds: 3_000_000_000)
            if self.transientToast == msg { self.transientToast = nil }
        }
    }

    private static func requestPhotosPermission() async -> PHAuthorizationStatus {
        await withCheckedContinuation { cont in
            PHPhotoLibrary.requestAuthorization(for: .addOnly) { cont.resume(returning: $0) }
        }
    }

    @MainActor
    private func presentActivitySheet(items: [Any]) {
        let vc = UIActivityViewController(activityItems: items, applicationActivities: nil)
        guard let scene = UIApplication.shared.connectedScenes.first(where: { $0.activationState == .foregroundActive }) as? UIWindowScene,
              let window = scene.windows.first(where: { $0.isKeyWindow }),
              var top = window.rootViewController else { return }
        while let presented = top.presentedViewController { top = presented }
        if let popover = vc.popoverPresentationController {
            popover.sourceView = top.view
            popover.sourceRect = CGRect(x: top.view.bounds.midX, y: top.view.bounds.midY, width: 0, height: 0)
            popover.permittedArrowDirections = []
        }
        top.present(vc, animated: true)
    }
}
