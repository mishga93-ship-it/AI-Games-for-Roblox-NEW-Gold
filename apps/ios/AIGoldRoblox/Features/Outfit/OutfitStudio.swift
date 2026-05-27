// OutfitStudio.swift — state controller for 1-Click Outfit Generator
// (session 383). Mirrors GlowupStudio's state-machine pattern.

import Foundation
import SwiftUI
import UIKit

@MainActor
final class OutfitStudio: ObservableObject {
    enum Step: Equatable {
        case aestheticPicker
        case customize(OutfitAesthetic)
        case loading
        case result(OutfitGenerationResponse)
        case error(String)

        static func == (lhs: Step, rhs: Step) -> Bool {
            switch (lhs, rhs) {
            case (.aestheticPicker, .aestheticPicker): return true
            case (.loading, .loading): return true
            case let (.customize(a), .customize(b)): return a == b
            case let (.result(a), .result(b)): return a.rerollSeed == b.rerollSeed && a.aestheticId == b.aestheticId
            case let (.error(a), .error(b)): return a == b
            default: return false
            }
        }
    }

    @Published var step: Step = .aestheticPicker
    @Published var gender: OutfitGender = .neutral
    @Published var style: OutfitStyleMode = .dark
    @Published var transientToast: String? = nil

    var allAesthetics: [OutfitAesthetic] { OutfitAesthetic.allCases }

    // MARK: - Flow

    func selectAesthetic(_ a: OutfitAesthetic) {
        step = .customize(a)
    }

    func backToPicker() {
        step = .aestheticPicker
    }

    func backToCustomize() {
        if case let .result(resp) = step,
           let a = OutfitAesthetic(rawValue: resp.aestheticId) {
            step = .customize(a)
        } else {
            step = .aestheticPicker
        }
    }

    func generate(remix: OutfitRemixMode? = nil) async {
        let aesthetic: OutfitAesthetic
        switch step {
        case .customize(let a): aesthetic = a
        case .result(let r):
            guard let a = OutfitAesthetic(rawValue: r.aestheticId) else { return }
            aesthetic = a
        default: return
        }
        step = .loading
        do {
            let resp = try await OutfitAPIClient.generate(
                aesthetic: aesthetic, gender: gender, style: style, remix: remix
            )
            step = .result(resp)
        } catch let OutfitAPIError.rateLimited(_) {
            step = .error(loc(en: "Too many requests. Wait a minute and try again.",
                              ru: "Слишком много запросов. Подожди минутку."))
        } catch {
            step = .error(error.localizedDescription)
        }
    }

    func retryAfterError() {
        step = .aestheticPicker
    }

    // MARK: - Result actions

    func openCatalogItem(_ urlString: String) {
        guard let url = URL(string: urlString) else { return }
        UIApplication.shared.open(url)
    }

    /// Share a TikTok-ready PNG snapshot of the outfit (rendered from a SwiftUI
    /// poster view via ImageRenderer, iOS 16+). Falls back to a text-only
    /// share on older iOS / render failure.
    func shareOutfit() {
        guard case let .result(resp) = step else { return }
        Task { @MainActor in
            if #available(iOS 16.0, *), let image = await renderOutfitPoster(response: resp) {
                // Image-only: when both UIImage and String are in activityItems,
                // iOS shows the String as the lockup title (user reported it
                // looks like "sharing a text file"). The caption is already
                // visually baked into the poster (title + badges), so the user
                // doesn't lose information by dropping the separate text item.
                presentActivitySheet(items: [image])
            } else {
                // Last-resort fallback only when ImageRenderer fails.
                let caption = resp.localizedCaption
                let body = resp.items.map { "• \($0.name) — \($0.priceRobux) R$" }.joined(separator: "\n")
                let text = "\(resp.title) Outfit — \(resp.totalCostRobux) R$\n\(caption)\n\n\(body)\n\n\(Self.tiktokCaption(for: resp))"
                presentActivitySheet(items: [text])
            }
        }
    }

    /// TikTok-tuned caption: short hook + savings flex + algorithm-friendly
    /// hashtags. Aesthetic-specific tags (#sigma #y2k etc.) help the
    /// FYP algorithm cluster this to the right audience.
    private static func tiktokCaption(for resp: OutfitGenerationResponse) -> String {
        let savedStr = resp.savedRobux > 0 ? " · saved \(resp.savedRobux.formatted()) R$" : ""
        let aestheticTag: String = {
            guard let a = OutfitAesthetic(rawValue: resp.aestheticId) else { return "#roblox" }
            switch a {
            case .sigma:      return "#sigma #sigmaaesthetic"
            case .baddie:     return "#baddie #robloxbaddie"
            case .y2k:        return "#y2k #y2kaesthetic"
            case .goth:       return "#goth #darkacademia"
            case .richEmo:    return "#emo #richemo"
            case .slender:    return "#slender #slendylook"
            case .softie:     return "#softie #softgirl"
            case .cyber:      return "#cyberpunk #cybergoth"
            case .animeDemon: return "#anime #demoncore"
            }
        }()
        // FYP-tuned base — first 3 tags are highest-discovery for Roblox content
        // (research May 2026: #roblox / #robloxoutfit / #fyp are top clusters).
        return "\(resp.title) outfit for \(resp.totalCostRobux) R$\(savedStr)\n\(resp.localizedCaption)\n\n#roblox #robloxoutfit #fyp \(aestheticTag) #kamigold"
    }

    @available(iOS 16.0, *)
    @MainActor
    private func renderOutfitPoster(response: OutfitGenerationResponse) async -> UIImage? {
        // ImageRenderer snapshots SwiftUI synchronously — AsyncImage inside
        // the poster doesn't get a chance to fetch. Pre-download every
        // network image into a UIImage dict first, then render with
        // synchronous Image(uiImage:).
        var thumbs: [String: UIImage] = [:]
        let urls: [String] = response.items.compactMap { $0.thumbnailUrl }
        await withTaskGroup(of: (String, UIImage?).self) { group in
            for urlString in urls {
                guard let url = URL(string: urlString) else { continue }
                group.addTask {
                    do {
                        let (data, _) = try await URLSession.shared.data(from: url)
                        return (urlString, UIImage(data: data))
                    } catch { return (urlString, nil) }
                }
            }
            for await (key, img) in group {
                if let img { thumbs[key] = img }
            }
        }
        var heroImage: UIImage? = nil
        if let hu = response.heroPreviewUrl, let url = URL(string: hu) {
            if let (data, _) = try? await URLSession.shared.data(from: url) {
                heroImage = UIImage(data: data)
            }
        }

        let view = OutfitSharePoster(response: response, heroImage: heroImage, thumbnails: thumbs)
            .frame(width: 1080, height: 1920)
        let renderer = ImageRenderer(content: view)
        renderer.scale = 1.0
        return renderer.uiImage
    }

    @MainActor
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

    private func toast(_ message: String) {
        transientToast = message
        Task {
            try? await Task.sleep(nanoseconds: 3_000_000_000)
            if self.transientToast == message {
                self.transientToast = nil
            }
        }
    }
}
