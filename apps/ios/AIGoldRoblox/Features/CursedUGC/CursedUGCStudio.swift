// CursedUGCStudio.swift — state controller for Giant & Cursed UGC Modeler
// (session 384). State machine: categoryPicker → stylePicker → customize →
// loading → result.

import Foundation
import SwiftUI
import UIKit
import Photos

@MainActor
final class CursedUGCStudio: ObservableObject {
    enum Step: Equatable {
        case categoryPicker
        case stylePicker(CursedUGCCategory)
        case customize(CursedUGCCategory, CursedUGCStyle)
        case loading
        case result(CursedUGCResponse)
        case error(String)

        static func == (lhs: Step, rhs: Step) -> Bool {
            switch (lhs, rhs) {
            case (.categoryPicker, .categoryPicker): return true
            case (.loading, .loading): return true
            case let (.stylePicker(a), .stylePicker(b)): return a == b
            case let (.customize(a1, s1), .customize(a2, s2)): return a1 == a2 && s1 == s2
            case let (.result(a), .result(b)): return a.generationId == b.generationId
            case let (.error(a), .error(b)): return a == b
            default: return false
            }
        }
    }

    @Published var step: Step = .categoryPicker
    @Published var intensity: CursedUGCIntensity = .strong
    @Published var userPrompt: String = ""
    @Published var transientToast: String?

    var allCategories: [CursedUGCCategory] { CursedUGCCategory.allCases }
    var allStyles: [CursedUGCStyle] { CursedUGCStyle.allCases }

    // MARK: - Flow

    func selectCategory(_ c: CursedUGCCategory) { step = .stylePicker(c) }
    func selectStyle(_ s: CursedUGCStyle) {
        guard case let .stylePicker(c) = step else { return }
        step = .customize(c, s)
    }
    func backToCategory() { step = .categoryPicker }
    func backToStyle() {
        switch step {
        case .customize(let c, _): step = .stylePicker(c)
        case .result(let r):
            if let c = CursedUGCCategory(rawValue: r.categoryId) { step = .stylePicker(c) }
            else { step = .categoryPicker }
        default: step = .categoryPicker
        }
    }
    func backToCustomize() {
        if case let .result(r) = step,
           let c = CursedUGCCategory(rawValue: r.categoryId),
           let s = CursedUGCStyle(rawValue: r.styleId) {
            step = .customize(c, s)
        } else {
            step = .categoryPicker
        }
    }

    func generate(forceMoreCursed: Bool = false) async {
        let category: CursedUGCCategory
        let style: CursedUGCStyle
        switch step {
        case .customize(let c, let s): category = c; style = s
        case .result(let r):
            guard let c = CursedUGCCategory(rawValue: r.categoryId),
                  let s = CursedUGCStyle(rawValue: r.styleId) else { return }
            category = c; style = s
        default: return
        }
        // "Make More Cursed" — bump intensity one level if possible.
        let effectiveIntensity: CursedUGCIntensity = forceMoreCursed
            ? (intensity == .mild ? .strong : .extreme)
            : intensity
        step = .loading
        do {
            let r = try await CursedUGCAPIClient.generate(
                category: category, style: style,
                intensity: effectiveIntensity,
                userPrompt: userPrompt
            )
            intensity = effectiveIntensity
            step = .result(r)
        } catch let CursedUGCAPIError.rateLimited {
            step = .error(loc(en: "Too many requests. Wait a minute.",
                              ru: "Слишком много запросов. Подожди минутку."))
        } catch {
            step = .error(error.localizedDescription)
        }
    }

    func retryAfterError() { step = .categoryPicker }

    // MARK: - Result-screen actions

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
                    await self?.toast(loc(en: "Photos access denied — enable in Settings.",
                                          ru: "Нет доступа к Фото."))
                    return
                }
                UIImageWriteToSavedPhotosAlbum(image, nil, nil, nil)
                await self?.toast(loc(en: "✅ Saved to Photos", ru: "✅ Сохранено в Фото"))
            } catch {
                await self?.toast(loc(en: "⚠️ Save failed: \(error.localizedDescription)",
                                      ru: "⚠️ Ошибка сохранения"))
            }
        }
    }

    func sharePoster() {
        guard case let .result(resp) = step else { return }
        Task { @MainActor in
            if #available(iOS 16.0, *), let image = await renderPoster(resp: resp) {
                // Image-only — see OutfitStudio.shareOutfit() for rationale.
                // Caption is baked into the poster image, so no info loss.
                _ = Self.shareCaption(for: resp)
                presentActivitySheet(items: [image])
            } else {
                presentActivitySheet(items: [Self.shareCaption(for: resp)])
            }
        }
    }

    private static func shareCaption(for resp: CursedUGCResponse) -> String {
        let categoryTag: String = {
            guard let c = CursedUGCCategory(rawValue: resp.categoryId) else { return "#roblox" }
            switch c {
            case .brainrotItem:  return "#brainrot #stealabrainrot"
            case .cursedFace:    return "#cursedroblox #cursed"
            case .giantBackpack: return "#robloxugc #giant"
            case .giantPet:      return "#robloxpets #giant"
            case .memePlushie:   return "#robloxplushie #meme"
            case .weirdMask:     return "#weirdmask #cursed"
            case .oversizedHat:  return "#robloxhat #oversized"
            }
        }()
        return "\(resp.localizedTitle) — \(resp.fakePriceRobux) R$\n\(resp.shareCaption)\n\n#roblox #robloxugc #fyp \(categoryTag) #kamigold"
    }

    @available(iOS 16.0, *)
    @MainActor
    private func renderPoster(resp: CursedUGCResponse) async -> UIImage? {
        // Session 390 — prefer the Meshy v6 3D-render PNG over the flux 2D
        // concept so the TikTok-share visual matches the rotatable 3D mesh
        // the user actually saw on the result screen. Fall back to flux
        // mainImageUrl if meshThumbnailUrl is missing (timeout / failure).
        // Pre-download synchronously so ImageRenderer renders in one frame.
        var mainImg: UIImage? = nil
        let preferredUrl = resp.meshThumbnailUrl ?? resp.mainImageUrl
        if let u = preferredUrl, let url = URL(string: u),
           let (data, _) = try? await URLSession.shared.data(from: url) {
            mainImg = UIImage(data: data)
        }
        let view = CursedUGCSharePoster(response: resp, mainImage: mainImg)
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
