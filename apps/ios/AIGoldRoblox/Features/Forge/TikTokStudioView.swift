//
//  TikTokStudioView.swift
//  AIGoldRoblox
//
//  One-Tap TikTok Gameplay Exporter (Session #179).
//  Entry point from ForgeView when user picks the `tiktok_export` viral tile.
//  Flow: PHPhotoLibrary observer → trim → caption → optional watermark → share
//  via TikTok Share Kit (handoff) or standard UIActivityViewController.
//

import SwiftUI
import AVFoundation
import AVKit
import PhotosUI
import Photos
#if canImport(TikTokOpenShareSDK)
import TikTokOpenShareSDK
#endif

// MARK: - Caption templates

enum CaptionTemplates {
    static let defaults: [String] = [
        "POV: I made this in 30 seconds with AI 🤯",
        "When the AI builds your dream game in one tap 🎮",
        "I asked AI to make a game and it cooked 🔥",
        "This is what happens when AI takes over game dev 💀",
        "Tell me you used AI without telling me 😤",
        "The future of game dev is here, devs in shambles ⚡",
        "Why grind when you can prompt? 🤖✨",
        "AI made this whole game while I was eating lunch 🍕",
        "Built a viral game in 60 seconds, no skills needed 🚀",
        "POV: you discovered the AI creator hack 🤫",
    ]

    static func suggestions(for context: String?) -> [String] {
        // Future: route to gameKind/memeSubTheme-specific bucket. MVP returns defaults.
        _ = context
        return defaults
    }
}

// MARK: - ClipPickerViewModel

@MainActor
final class ClipPickerViewModel: NSObject, ObservableObject, PHPhotoLibraryChangeObserver {
    struct ClipAsset: Identifiable, Hashable {
        let id: String          // PHAsset localIdentifier
        let creationDate: Date
        let duration: TimeInterval
        let pixelWidth: Int
        let pixelHeight: Int

        var aspectRatio: Double {
            guard pixelHeight > 0 else { return 0 }
            return Double(pixelWidth) / Double(pixelHeight)
        }

        var isLikelyVerticalCapture: Bool {
            // 9:16 ≈ 0.5625, but Roblox letterboxed inside a 16:9 capture also flags
            // here via duration<60 and recency rather than aspect alone.
            let ratio = aspectRatio
            return ratio > 0 && (ratio < 0.7 || (duration > 3 && duration <= 60))
        }
    }

    @Published private(set) var clips: [ClipAsset] = []
    @Published var authorizationStatus: PHAuthorizationStatus = .notDetermined
    @Published private(set) var newestClipId: String?
    @Published private(set) var recordingWatchStartedAt: Date?
    @Published private(set) var isWaitingForNewRecording = false
    @Published private(set) var detectionMessage: String?

    private var observerRegistered = false
    private let detectionSlack: TimeInterval = 8

    func requestAccessAndLoad() {
        let current = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        authorizationStatus = current
        if current == .authorized || current == .limited {
            Task { await reload() }
            registerObserverIfNeeded()
            return
        }
        PHPhotoLibrary.requestAuthorization(for: .readWrite) { [weak self] status in
            Task { @MainActor in
                self?.authorizationStatus = status
                if status == .authorized || status == .limited {
                    await self?.reload()
                    self?.registerObserverIfNeeded()
                }
            }
        }
    }

    private func registerObserverIfNeeded() {
        guard !observerRegistered else { return }
        PHPhotoLibrary.shared().register(self)
        observerRegistered = true
    }

    func markRecordingStarted() {
        recordingWatchStartedAt = Date().addingTimeInterval(-3)
        isWaitingForNewRecording = true
        newestClipId = nil
        detectionMessage = "Watching for the clip. Stop recording, return here, then tap Find latest if it does not appear."
    }

    func findLatestRecording() async {
        await reload(detectNew: true, preferSince: recordingWatchStartedAt)
    }

    func clearDetectionMessage() {
        detectionMessage = nil
    }

    func presentLimitedLibraryPicker(from presenter: UIViewController) {
        guard authorizationStatus == .limited else { return }
        PHPhotoLibrary.shared().presentLimitedLibraryPicker(from: presenter)
        Task {
            try? await Task.sleep(nanoseconds: 700_000_000)
            await reload(detectNew: true, preferSince: recordingWatchStartedAt)
        }
    }

    deinit {
        if observerRegistered {
            PHPhotoLibrary.shared().unregisterChangeObserver(self)
        }
    }

    nonisolated func photoLibraryDidChange(_ changeInstance: PHChange) {
        Task { @MainActor in
            await reload(detectNew: true, preferSince: recordingWatchStartedAt)
        }
    }

    func reload(detectNew: Bool = false, preferSince: Date? = nil) async {
        let current = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        authorizationStatus = current
        guard current == .authorized || current == .limited else { return }

        let options = PHFetchOptions()
        options.predicate = NSPredicate(format: "mediaType = %d", PHAssetMediaType.video.rawValue)
        options.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
        options.fetchLimit = 30
        let result = PHAsset.fetchAssets(with: options)
        var collected: [ClipAsset] = []
        result.enumerateObjects { asset, _, _ in
            collected.append(ClipAsset(
                id: asset.localIdentifier,
                creationDate: asset.creationDate ?? Date.distantPast,
                duration: asset.duration,
                pixelWidth: asset.pixelWidth,
                pixelHeight: asset.pixelHeight
            ))
        }
        let previousIds = Set(clips.map(\.id))
        clips = collected
        guard detectNew else { return }

        let detectionStart = preferSince ?? recordingWatchStartedAt
        let candidateAfterStart = detectionStart.flatMap { start in
            collected.first { clip in
                clip.creationDate >= start.addingTimeInterval(-detectionSlack) && clip.duration >= 1
            }
        }
        let newlyInserted = collected.first { clip in
            !previousIds.contains(clip.id) && clip.duration >= 1
        }

        if let detected = candidateAfterStart ?? newlyInserted {
            newestClipId = detected.id
            isWaitingForNewRecording = false
            detectionMessage = "New clip found. Open it in the editor and export a TikTok-ready version."
        } else if isWaitingForNewRecording || detectionStart != nil {
            let limitedHint = authorizationStatus == .limited ? " Photos access is Limited, so add the recording via Manage Selected Photos if it is missing." : ""
            detectionMessage = "No new recording found yet. Give iOS a few seconds to save it, then refresh again.\(limitedHint)"
        }
    }

    func acknowledgeNewest() {
        newestClipId = nil
    }

    func loadAVAsset(for clip: ClipAsset) async -> AVAsset? {
        await withCheckedContinuation { continuation in
            let fetch = PHAsset.fetchAssets(withLocalIdentifiers: [clip.id], options: nil)
            guard let asset = fetch.firstObject else {
                continuation.resume(returning: nil)
                return
            }
            let options = PHVideoRequestOptions()
            options.isNetworkAccessAllowed = true
            options.deliveryMode = .highQualityFormat
            PHImageManager.default().requestAVAsset(forVideo: asset, options: options) { avAsset, _, _ in
                continuation.resume(returning: avAsset)
            }
        }
    }
}

// MARK: - TrimRange

struct TrimRange: Equatable {
    var start: Double
    var end: Double

    func clamped(to duration: Double) -> TrimRange {
        let s = max(0, min(start, duration))
        let e = max(s + 0.5, min(end, duration))
        return TrimRange(start: s, end: min(e, duration))
    }

    var duration: Double { max(0, end - start) }
}

// MARK: - WatermarkRenderer

enum WatermarkRenderer {
    private static let tiktokRenderSize = CGSize(width: 1080, height: 1920)

    /// Bakes a vertical 9:16 TikTok composition with captions, REC/progress
    /// treatment, light flash effects, and an optional deeplink CTA.
    static func export(
        sourceAsset: AVAsset,
        trim: TrimRange,
        caption: String?,
        deeplinkText: String?
    ) async throws -> URL {
        guard let videoTrack = try await sourceAsset.loadTracks(withMediaType: .video).first else {
            throw NSError(domain: "TikTokStudio", code: 100, userInfo: [NSLocalizedDescriptionKey: "Clip has no video track"])
        }

        let composition = AVMutableComposition()
        guard let compVideoTrack = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid) else {
            throw NSError(domain: "TikTokStudio", code: 103, userInfo: [NSLocalizedDescriptionKey: "Failed to create video track"])
        }
        let timeRange = CMTimeRange(
            start: CMTime(seconds: trim.start, preferredTimescale: 600),
            duration: CMTime(seconds: max(0.5, trim.duration), preferredTimescale: 600)
        )
        try compVideoTrack.insertTimeRange(timeRange, of: videoTrack, at: .zero)

        if let audioTrack = try await sourceAsset.loadTracks(withMediaType: .audio).first {
            let compAudio = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)
            try compAudio?.insertTimeRange(timeRange, of: audioTrack, at: .zero)
        }

        let naturalSize = try await videoTrack.load(.naturalSize)
        let preferredTransform = try await videoTrack.load(.preferredTransform)
        let renderSize = tiktokRenderSize
        let portraitTransform = makePortraitTransform(
            naturalSize: naturalSize,
            preferredTransform: preferredTransform,
            renderSize: renderSize
        )

        let videoComposition = AVMutableVideoComposition()
        videoComposition.renderSize = renderSize
        videoComposition.frameDuration = CMTime(value: 1, timescale: 30)

        let instruction = AVMutableVideoCompositionInstruction()
        instruction.timeRange = CMTimeRange(start: .zero, duration: composition.duration)
        instruction.backgroundColor = UIColor.black.cgColor
        let layerInstruction = AVMutableVideoCompositionLayerInstruction(assetTrack: compVideoTrack)
        layerInstruction.setTransform(portraitTransform, at: .zero)
        instruction.layerInstructions = [layerInstruction]
        videoComposition.instructions = [instruction]

        let overlayLayer = makeTikTokOverlayLayer(
            deeplinkText: deeplinkText,
            caption: caption,
            renderSize: renderSize,
            duration: CMTimeGetSeconds(composition.duration)
        )
        let parentLayer = CALayer()
        let videoLayer = CALayer()
        parentLayer.frame = CGRect(origin: .zero, size: renderSize)
        videoLayer.frame = CGRect(origin: .zero, size: renderSize)
        parentLayer.addSublayer(videoLayer)
        parentLayer.addSublayer(overlayLayer)
        videoComposition.animationTool = AVVideoCompositionCoreAnimationTool(
            postProcessingAsVideoLayer: videoLayer,
            in: parentLayer
        )

        let outputURL = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("clip-\(UUID().uuidString).mp4")
        guard let exporter = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetHighestQuality) else {
            throw NSError(domain: "TikTokStudio", code: 101, userInfo: [NSLocalizedDescriptionKey: "Failed to create export session"])
        }
        exporter.outputURL = outputURL
        exporter.outputFileType = .mp4
        exporter.videoComposition = videoComposition
        exporter.shouldOptimizeForNetworkUse = true

        await exporter.export()
        if exporter.status == .completed {
            return outputURL
        }
        throw exporter.error ?? NSError(domain: "TikTokStudio", code: 102, userInfo: [NSLocalizedDescriptionKey: "Export failed"])
    }

    private static func makePortraitTransform(
        naturalSize: CGSize,
        preferredTransform: CGAffineTransform,
        renderSize: CGSize
    ) -> CGAffineTransform {
        let transformedRect = CGRect(origin: .zero, size: naturalSize).applying(preferredTransform)
        let orientedSize = CGSize(width: abs(transformedRect.width), height: abs(transformedRect.height))
        let normalize = CGAffineTransform(
            translationX: -transformedRect.minX,
            y: -transformedRect.minY
        )
        let scale = max(
            renderSize.width / max(1, orientedSize.width),
            renderSize.height / max(1, orientedSize.height)
        )
        let scaledSize = CGSize(width: orientedSize.width * scale, height: orientedSize.height * scale)
        let center = CGAffineTransform(
            translationX: (renderSize.width - scaledSize.width) / 2,
            y: (renderSize.height - scaledSize.height) / 2
        )
        return preferredTransform
            .concatenating(normalize)
            .concatenating(CGAffineTransform(scaleX: scale, y: scale))
            .concatenating(center)
    }

    private static func makeTikTokOverlayLayer(
        deeplinkText: String?,
        caption: String?,
        renderSize: CGSize,
        duration: TimeInterval
    ) -> CALayer {
        let container = CALayer()
        container.frame = CGRect(origin: .zero, size: renderSize)
        container.isGeometryFlipped = false

        let padding: CGFloat = 64
        let safeWidth = renderSize.width - padding * 2
        let accent = UIColor(red: 0.09, green: 0.72, blue: 1.0, alpha: 1)

        let vignette = CALayer()
        vignette.frame = container.bounds
        vignette.backgroundColor = UIColor.black.withAlphaComponent(0.08).cgColor
        container.addSublayer(vignette)

        let flash = CALayer()
        flash.frame = container.bounds
        flash.backgroundColor = UIColor.white.cgColor
        flash.opacity = 0
        let flashAnimation = CAKeyframeAnimation(keyPath: "opacity")
        flashAnimation.values = [0, 0.24, 0, 0, 0.18, 0, 0, 0.14, 0].map { NSNumber(value: $0) }
        flashAnimation.keyTimes = [0, 0.025, 0.055, 0.34, 0.37, 0.41, 0.68, 0.71, 0.74].map { NSNumber(value: $0) }
        flashAnimation.duration = max(1, duration)
        flashAnimation.beginTime = AVCoreAnimationBeginTimeAtZero
        flashAnimation.isRemovedOnCompletion = false
        flash.add(flashAnimation, forKey: "jumpFlash")
        container.addSublayer(flash)

        let topPill = makeTextLayer(
            text: "MADE WITH KAMI",
            fontSize: 34,
            foreground: UIColor.white,
            background: UIColor.black.withAlphaComponent(0.58),
            alignment: .center
        )
        topPill.cornerRadius = 24
        topPill.frame = CGRect(x: padding, y: renderSize.height - 128, width: 440, height: 56)
        container.addSublayer(topPill)

        let recPill = makeTextLayer(
            text: "REC 9:16",
            fontSize: 30,
            foreground: UIColor.white,
            background: accent.withAlphaComponent(0.9),
            alignment: .center
        )
        recPill.cornerRadius = 24
        recPill.frame = CGRect(x: renderSize.width - padding - 220, y: renderSize.height - 128, width: 220, height: 56)
        let pulse = CABasicAnimation(keyPath: "opacity")
        pulse.fromValue = 1
        pulse.toValue = 0.42
        pulse.duration = 0.55
        pulse.autoreverses = true
        pulse.repeatCount = Float(max(1, duration / 0.55))
        pulse.beginTime = AVCoreAnimationBeginTimeAtZero
        recPill.add(pulse, forKey: "recPulse")
        container.addSublayer(recPill)

        let progressTrack = CALayer()
        progressTrack.frame = CGRect(x: padding, y: 112, width: safeWidth, height: 10)
        progressTrack.cornerRadius = 5
        progressTrack.backgroundColor = UIColor.white.withAlphaComponent(0.18).cgColor
        container.addSublayer(progressTrack)

        let progressFill = CALayer()
        progressFill.bounds = progressTrack.bounds
        progressFill.anchorPoint = CGPoint(x: 0, y: 0.5)
        progressFill.position = CGPoint(x: padding, y: 117)
        progressFill.cornerRadius = 5
        progressFill.backgroundColor = accent.cgColor
        progressFill.transform = CATransform3DMakeScale(0.01, 1, 1)
        let progressAnimation = CABasicAnimation(keyPath: "transform.scale.x")
        progressAnimation.fromValue = 0.01
        progressAnimation.toValue = 1
        progressAnimation.duration = max(1, duration)
        progressAnimation.beginTime = AVCoreAnimationBeginTimeAtZero
        progressAnimation.isRemovedOnCompletion = false
        progressAnimation.fillMode = .forwards
        progressFill.add(progressAnimation, forKey: "progress")
        container.addSublayer(progressFill)

        if let caption, !caption.isEmpty {
            let captionLayer = makeTextLayer(
                text: caption,
                fontSize: 52,
                foreground: UIColor.white,
                background: UIColor.black.withAlphaComponent(0.34),
                alignment: .center
            )
            captionLayer.shadowColor = UIColor.black.cgColor
            captionLayer.shadowOpacity = 0.8
            captionLayer.shadowOffset = CGSize(width: 0, height: 4)
            captionLayer.shadowRadius = 10
            captionLayer.isWrapped = true
            captionLayer.frame = CGRect(
                x: padding,
                y: 250,
                width: safeWidth,
                height: 170
            )
            let captionPop = CABasicAnimation(keyPath: "transform.scale")
            captionPop.fromValue = 0.96
            captionPop.toValue = 1.02
            captionPop.duration = 0.42
            captionPop.autoreverses = true
            captionPop.repeatCount = 2
            captionPop.beginTime = AVCoreAnimationBeginTimeAtZero + 0.12
            captionLayer.add(captionPop, forKey: "captionPop")
            container.addSublayer(captionLayer)
        }

        if let deeplinkText, !deeplinkText.isEmpty {
            let ctaLayer = makeTextLayer(
                text: deeplinkText,
                fontSize: 30,
                foreground: UIColor.white,
                background: UIColor.black.withAlphaComponent(0.62),
                alignment: .center
            )
            ctaLayer.cornerRadius = 22
            let estimatedWidth = min(safeWidth, max(280, CGFloat(deeplinkText.count) * 17))
            ctaLayer.frame = CGRect(
                x: renderSize.width - padding - estimatedWidth,
                y: 152,
                width: estimatedWidth,
                height: 54
            )
            container.addSublayer(ctaLayer)
        }

        return container
    }

    private static func makeTextLayer(
        text: String,
        fontSize: CGFloat,
        foreground: UIColor,
        background: UIColor,
        alignment: CATextLayerAlignmentMode
    ) -> CATextLayer {
        let layer = CATextLayer()
        layer.string = text
        layer.fontSize = fontSize
        layer.foregroundColor = foreground.cgColor
        layer.backgroundColor = background.cgColor
        layer.alignmentMode = alignment
        layer.contentsScale = UIScreen.main.scale
        layer.truncationMode = .end
        return layer
    }
}

// MARK: - TikTokShareService (Share Kit handoff)

enum TikTokShareError: LocalizedError {
    case sdkNotConfigured
    case appNotInstalled
    case underlying(Error)

    var errorDescription: String? {
        switch self {
        case .sdkNotConfigured:
            return "TikTok Share Kit isn't configured yet — finish the developer-portal setup (CLIENT_KEY) to enable one-tap posting."
        case .appNotInstalled:
            return "TikTok app isn't installed on this device. Use the standard Share button instead."
        case .underlying(let e):
            return e.localizedDescription
        }
    }
}

enum TikTokShareService {
    /// TikTok developer-portal client keys for the Kami app (Session #179).
    /// Public identifiers (not secrets) — embedded in the iOS app and matched
    /// against URL schemes `tiktok<CLIENT_KEY>` registered in Info.plist.
    /// Both schemes are pre-registered, switching modes is a one-line change here.
    private static let sandboxClientKey = "sbawptlpdtq9aupkq1"
    private static let productionClientKey = "aw8w3krt18kn6jba"

    /// Active key. Sandbox is used for test users registered in TikTok dashboard;
    /// Production requires a passed App Review form (ToS + Privacy + App Store URL).
    /// Flip to `.production` only after the dashboard form is submitted & approved.
    static let clientKey = sandboxClientKey
    static var redirectURI: String { "tiktok\(clientKey)://" }

    #if canImport(TikTokOpenShareSDK)
    /// TikTok requires the app to keep the request alive until the callback
    /// returns. This holds the latest request across the app switch.
    @MainActor private static var activeShareRequest: TikTokShareRequest?
    #endif

    static var isNativeShareKitLinked: Bool {
        #if canImport(TikTokOpenShareSDK)
        return true
        #else
        return false
        #endif
    }

    static var primaryActionTitle: String {
        isNativeShareKitLinked ? "Share to TikTok" : "Export & Share Clip"
    }

    static var shareModeTitle: String {
        isNativeShareKitLinked ? "Native TikTok Share Kit" : "Share Sheet Fallback"
    }

    static var shareModeDescription: String {
        if isNativeShareKitLinked {
            return "Native handoff is enabled for TikTok test users."
        }
        return "TikTok SDK is not linked in this build, so this opens the iOS share sheet."
    }

    @MainActor
    static func clearActiveShareRequest() {
        #if canImport(TikTokOpenShareSDK)
        activeShareRequest = nil
        #endif
    }

    /// Hands off a video file to the TikTok app via the official Share Kit.
    /// Flow: save mp4 → Photos library → grab PHAsset.localIdentifier →
    /// TikTokShareRequest → switches to TikTok app where user finalises the post.
    /// Falls back to UIActivityViewController if the SDK module isn't linked yet.
    static func share(videoURL: URL, hashtags: [String] = [], from presenter: UIViewController) async throws {
        #if canImport(TikTokOpenShareSDK)
        try await shareViaTikTokSDK(videoURL: videoURL, hashtags: hashtags, presenter: presenter)
        #else
        try await fallbackShare(videoURL: videoURL, hashtags: hashtags, presenter: presenter)
        #endif
    }

    #if canImport(TikTokOpenShareSDK)
    private static func shareViaTikTokSDK(videoURL: URL, hashtags: [String], presenter: UIViewController) async throws {
        // NOTE: hashtags arg is reserved for the future — TikTok Share Kit (as of
        // SDK v2.x) doesn't expose hashtag pre-fill on TikTokShareRequest; that's
        // a Content Posting API feature which requires app audit. Users add tags
        // manually in TikTok's composer (which suggests them based on caption).
        _ = hashtags
        let identifier = try await persistInPhotosLibrary(videoURL: videoURL)
        try await MainActor.run {
            let request = TikTokShareRequest(
                localIdentifiers: [identifier],
                mediaType: .video,
                redirectURI: redirectURI
            )
            request.shareFormat = .normal
            activeShareRequest = request
            let didOpen = request.send()
            if !didOpen {
                activeShareRequest = nil
                throw TikTokShareError.appNotInstalled
            }
        }
    }
    #endif

    /// Saves a temporary mp4 into the user's photo library and returns the
    /// resulting `PHAsset.localIdentifier`, which TikTok Share Kit expects.
    private static func persistInPhotosLibrary(videoURL: URL) async throws -> String {
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<String, Error>) in
            var placeholder: PHObjectPlaceholder?
            PHPhotoLibrary.shared().performChanges {
                let req = PHAssetCreationRequest.forAsset()
                req.addResource(with: .video, fileURL: videoURL, options: nil)
                placeholder = req.placeholderForCreatedAsset
            } completionHandler: { success, error in
                if let error {
                    cont.resume(throwing: error)
                } else if success, let id = placeholder?.localIdentifier {
                    cont.resume(returning: id)
                } else {
                    cont.resume(throwing: TikTokShareError.underlying(NSError(
                        domain: "TikTokStudio", code: 200,
                        userInfo: [NSLocalizedDescriptionKey: "Could not save clip to Photos"]
                    )))
                }
            }
        }
    }

    @MainActor
    private static func fallbackShare(videoURL: URL, hashtags: [String], presenter: UIViewController) async throws {
        let items: [Any] = hashtags.isEmpty ? [videoURL] : [videoURL, hashtags.joined(separator: " ")]
        let activity = UIActivityViewController(activityItems: items, applicationActivities: nil)
        activity.popoverPresentationController?.sourceView = presenter.view
        presenter.present(activity, animated: true)
    }
}

// MARK: - TikTokStudioView

struct TikTokStudioView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var pickerVM = ClipPickerViewModel()
    @State private var selectedClip: ClipPickerViewModel.ClipAsset?
    @State private var loadedAsset: AVAsset?
    @State private var trim: TrimRange = TrimRange(start: 0, end: 15)
    @State private var caption: String = CaptionTemplates.defaults.first ?? ""
    @State private var watermarkEnabled: Bool = true
    @State private var deeplink: String = "ai.gold/r/preview"
    @State private var isExporting: Bool = false
    @State private var exportedURL: URL?
    @State private var exportError: String?
    @State private var showOnboarding: Bool = true

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    if showOnboarding {
                        onboardingCard
                    }
                    permissionStatusCard
                    recordingHelperCard
                    if let clip = selectedClip {
                        editorSection(clip: clip)
                    } else {
                        clipPickerSection
                    }
                }
                .padding(20)
            }
            .background(
                LinearGradient(
                    colors: [Color(red: 0.07, green: 0.06, blue: 0.12), Color(red: 0.13, green: 0.05, blue: 0.18)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                .ignoresSafeArea()
            )
            .navigationTitle("TikTok Studio")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .onAppear { pickerVM.requestAccessAndLoad() }
            .onChange(of: scenePhase) { _, phase in
                guard phase == .active else { return }
                Task {
                    await pickerVM.reload(
                        detectNew: pickerVM.isWaitingForNewRecording,
                        preferSince: pickerVM.recordingWatchStartedAt
                    )
                }
            }
            .alert("New clip detected", isPresented: Binding<Bool>(
                get: { pickerVM.newestClipId != nil && selectedClip == nil },
                set: { if !$0 { pickerVM.acknowledgeNewest() } }
            )) {
                Button("Edit") {
                    if let id = pickerVM.newestClipId, let clip = pickerVM.clips.first(where: { $0.id == id }) {
                        selectClip(clip)
                    }
                    pickerVM.acknowledgeNewest()
                }
                Button("Later", role: .cancel) { pickerVM.acknowledgeNewest() }
            } message: {
                Text("We spotted a new screen recording — open it in the editor?")
            }
            .alert("Export failed", isPresented: Binding<Bool>(
                get: { exportError != nil },
                set: { if !$0 { exportError = nil } }
            )) {
                Button("OK") { exportError = nil }
            } message: {
                Text(exportError ?? "Unknown error")
            }
        }
    }

    // MARK: - Sections

    private var onboardingCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("How to record")
                    .font(.headline)
                    .foregroundColor(.white)
                Spacer()
                Button("Hide") { showOnboarding = false }
                    .font(.caption)
                    .foregroundColor(.white.opacity(0.7))
            }
            stepRow("1", "Open your AI-generated game in Studio")
            stepRow("2", "Press F1 (desktop) or tap 🎬 (mobile) to enter cinematic mode")
            stepRow("3", "Swipe down → Control Center → tap Screen Record")
            stepRow("4", "Stop recording, come back here, your clip auto-appears")
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(Color.white.opacity(0.06))
        )
    }

    private func stepRow(_ index: String, _ text: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Text(index)
                .font(.caption.bold())
                .foregroundColor(.white)
                .frame(width: 22, height: 22)
                .background(Circle().fill(Color.pink))
            Text(text)
                .font(.subheadline)
                .foregroundColor(.white.opacity(0.85))
            Spacer()
        }
    }

    private var recordingHelperCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Label("Recording watcher", systemImage: "record.circle")
                    .font(.headline)
                    .foregroundColor(.white)
                Spacer()
                Button {
                    Task { await pickerVM.findLatestRecording() }
                } label: {
                    Image(systemName: "arrow.clockwise")
                        .foregroundColor(.white.opacity(0.8))
                }
                .accessibilityLabel("Refresh clips")
            }

            HStack(spacing: 10) {
                Button {
                    pickerVM.markRecordingStarted()
                } label: {
                    Label("Started", systemImage: "largecircle.fill.circle")
                        .font(.caption.bold())
                        .foregroundColor(.white)
                        .padding(.vertical, 9)
                        .frame(maxWidth: .infinity)
                        .background(Capsule().fill(Color.pink.opacity(0.38)))
                }
                .buttonStyle(.plain)

                Button {
                    Task { await pickerVM.findLatestRecording() }
                } label: {
                    Label("Find latest", systemImage: "sparkles.tv")
                        .font(.caption.bold())
                        .foregroundColor(.white)
                        .padding(.vertical, 9)
                        .frame(maxWidth: .infinity)
                        .background(Capsule().fill(Color.white.opacity(0.12)))
                }
                .buttonStyle(.plain)
            }

            if pickerVM.authorizationStatus == .limited {
                Button {
                    presentLimitedPhotoPicker()
                } label: {
                    Label("Manage Selected Photos", systemImage: "photo.on.rectangle.angled")
                        .font(.caption.bold())
                        .foregroundColor(.white)
                        .padding(.vertical, 8)
                        .frame(maxWidth: .infinity)
                        .background(Capsule().stroke(Color.white.opacity(0.35), lineWidth: 1))
                }
                .buttonStyle(.plain)
            }

            if let message = pickerVM.detectionMessage {
                Text(message)
                    .font(.caption)
                    .foregroundColor(.white.opacity(0.72))
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 12).fill(Color.white.opacity(0.06)))
    }

    private var permissionStatusCard: some View {
        Group {
            switch pickerVM.authorizationStatus {
            case .denied, .restricted:
                VStack(alignment: .leading, spacing: 6) {
                    Text("Photos access required")
                        .font(.headline)
                        .foregroundColor(.white)
                    Text("We read your screen recordings to help you post them. Enable in Settings → Privacy → Photos.")
                        .font(.caption)
                        .foregroundColor(.white.opacity(0.75))
                }
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(RoundedRectangle(cornerRadius: 12).fill(Color.red.opacity(0.18)))
            case .notDetermined:
                ProgressView("Requesting access…")
                    .tint(.white)
                    .foregroundColor(.white)
            default:
                EmptyView()
            }
        }
    }

    private var clipPickerSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Recent screen recordings")
                .font(.headline)
                .foregroundColor(.white)
            if pickerVM.clips.isEmpty {
                Text("No video clips yet. Record gameplay via Control Center → Screen Record, then come back.")
                    .font(.subheadline)
                    .foregroundColor(.white.opacity(0.65))
                    .padding(.vertical, 24)
                    .frame(maxWidth: .infinity)
            } else {
                LazyVStack(spacing: 10) {
                    ForEach(pickerVM.clips) { clip in
                        Button {
                            selectClip(clip)
                        } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(formatDuration(clip.duration))
                                        .font(.subheadline.bold())
                                        .foregroundColor(.white)
                                    Text(clip.creationDate, format: .relative(presentation: .named))
                                        .font(.caption)
                                        .foregroundColor(.white.opacity(0.6))
                                }
                                Spacer()
                                if clip.isLikelyVerticalCapture {
                                    Text("9:16")
                                        .font(.caption2.bold())
                                        .padding(.horizontal, 8)
                                        .padding(.vertical, 4)
                                        .background(Capsule().fill(Color.pink.opacity(0.4)))
                                        .foregroundColor(.white)
                                }
                                Image(systemName: "chevron.right")
                                    .foregroundColor(.white.opacity(0.5))
                            }
                            .padding(14)
                            .frame(maxWidth: .infinity)
                            .background(RoundedRectangle(cornerRadius: 12).fill(Color.white.opacity(0.06)))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func editorSection(clip: ClipPickerViewModel.ClipAsset) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Button {
                    selectedClip = nil
                    loadedAsset = nil
                    exportedURL = nil
                } label: {
                    Label("Pick another clip", systemImage: "chevron.left")
                        .font(.caption.bold())
                        .foregroundColor(.white.opacity(0.8))
                }
                Spacer()
                Text(formatDuration(trim.duration))
                    .font(.caption.bold())
                    .foregroundColor(.pink)
            }

            if let asset = loadedAsset {
                VideoPlayer(player: AVPlayer(playerItem: AVPlayerItem(asset: asset)))
                    .frame(height: 360)
                    .cornerRadius(14)
            } else {
                ProgressView("Loading clip…")
                    .tint(.white)
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity, minHeight: 200)
            }

            trimSection(clipDuration: clip.duration)
            captionSection
            watermarkSection
            shareButtons
        }
    }

    private func trimSection(clipDuration: Double) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Trim (max 60s)")
                .font(.subheadline.bold())
                .foregroundColor(.white)
            HStack {
                Text(formatDuration(trim.start))
                    .font(.caption.monospacedDigit())
                    .foregroundColor(.white.opacity(0.6))
                Slider(value: Binding(
                    get: { trim.start },
                    set: { trim = TrimRange(start: $0, end: max($0 + 1, trim.end)).clamped(to: clipDuration) }
                ), in: 0...max(0.5, clipDuration))
                Text(formatDuration(clipDuration))
                    .font(.caption.monospacedDigit())
                    .foregroundColor(.white.opacity(0.6))
            }
            HStack {
                Text(formatDuration(trim.end))
                    .font(.caption.monospacedDigit())
                    .foregroundColor(.white.opacity(0.6))
                Slider(value: Binding(
                    get: { trim.end },
                    set: { trim = TrimRange(start: trim.start, end: $0).clamped(to: clipDuration) }
                ), in: max(0.5, trim.start + 0.5)...max(1, clipDuration))
                Text("end")
                    .font(.caption)
                    .foregroundColor(.white.opacity(0.6))
            }
        }
    }

    private var captionSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Caption")
                .font(.subheadline.bold())
                .foregroundColor(.white)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(CaptionTemplates.defaults, id: \.self) { template in
                        Button {
                            caption = template
                        } label: {
                            Text(template)
                                .font(.caption)
                                .lineLimit(2)
                                .padding(8)
                                .frame(maxWidth: 220)
                                .background(
                                    RoundedRectangle(cornerRadius: 10)
                                        .fill(caption == template ? Color.pink.opacity(0.5) : Color.white.opacity(0.08))
                                )
                                .foregroundColor(.white)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            TextField("Custom caption…", text: $caption, axis: .vertical)
                .font(.subheadline)
                .padding(10)
                .background(RoundedRectangle(cornerRadius: 10).fill(Color.white.opacity(0.08)))
                .foregroundColor(.white)
                .lineLimit(2...4)
        }
    }

    private var watermarkSection: some View {
        VStack(alignment: .leading, spacing: 6) {
            Toggle(isOn: $watermarkEnabled) {
                Text("Add Kami deeplink watermark")
                    .font(.subheadline)
                    .foregroundColor(.white)
            }
            .tint(.pink)
            if watermarkEnabled {
                Text("Kami deeplink appears bottom-right.")
                    .font(.caption)
                    .foregroundColor(.white.opacity(0.6))
            }
        }
    }

    private var shareButtons: some View {
        VStack(spacing: 10) {
            Button {
                Task { await exportAndShare(target: .tiktok) }
            } label: {
                HStack {
                    Image(systemName: "music.note")
                    Text(isExporting ? "Exporting…" : TikTokShareService.primaryActionTitle)
                        .font(.headline)
                    Spacer()
                    Image(systemName: "arrow.up.forward.square")
                }
                .foregroundColor(.white)
                .padding(14)
                .frame(maxWidth: .infinity)
                .background(LinearGradient(colors: [.pink, .purple], startPoint: .leading, endPoint: .trailing))
                .cornerRadius(14)
            }
            .disabled(isExporting || loadedAsset == nil)

            HStack(spacing: 8) {
                Image(systemName: TikTokShareService.isNativeShareKitLinked ? "checkmark.seal.fill" : "square.and.arrow.up")
                    .foregroundColor(TikTokShareService.isNativeShareKitLinked ? .green : .white.opacity(0.7))
                VStack(alignment: .leading, spacing: 2) {
                    Text(TikTokShareService.shareModeTitle)
                        .font(.caption.bold())
                        .foregroundColor(.white.opacity(0.86))
                    Text(TikTokShareService.shareModeDescription)
                        .font(.caption2)
                        .foregroundColor(.white.opacity(0.58))
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer()
            }
            .padding(.horizontal, 2)

            Button {
                Task { await exportAndShare(target: .system) }
            } label: {
                HStack {
                    Image(systemName: "square.and.arrow.up")
                    Text("Reels / Shorts / Save…")
                        .font(.subheadline.bold())
                    Spacer()
                }
                .foregroundColor(.white)
                .padding(12)
                .frame(maxWidth: .infinity)
                .background(RoundedRectangle(cornerRadius: 12).stroke(Color.white.opacity(0.4), lineWidth: 1))
            }
            .disabled(isExporting || loadedAsset == nil)
        }
    }

    // MARK: - Actions

    private enum ShareTarget { case tiktok, system }

    @MainActor
    private func presentLimitedPhotoPicker() {
        guard let presenter = currentPresenter() else { return }
        pickerVM.presentLimitedLibraryPicker(from: presenter)
    }

    private func selectClip(_ clip: ClipPickerViewModel.ClipAsset) {
        selectedClip = clip
        loadedAsset = nil
        trim = TrimRange(start: 0, end: min(15, clip.duration)).clamped(to: clip.duration)
        Task {
            let asset = await pickerVM.loadAVAsset(for: clip)
            await MainActor.run { loadedAsset = asset }
        }
    }

    private func exportAndShare(target: ShareTarget) async {
        guard let asset = loadedAsset else { return }
        isExporting = true
        defer { isExporting = false }
        do {
            let url = try await WatermarkRenderer.export(
                sourceAsset: asset,
                trim: trim,
                caption: caption.isEmpty ? nil : caption,
                deeplinkText: watermarkEnabled ? deeplink : nil
            )
            exportedURL = url
            try await presentShare(url: url, target: target)
        } catch {
            exportError = error.localizedDescription
        }
    }

    @MainActor
    private func presentShare(url: URL, target: ShareTarget) async throws {
        guard let presenter = currentPresenter() else {
            return
        }
        switch target {
        case .tiktok:
            do {
                try await TikTokShareService.share(
                    videoURL: url,
                    hashtags: ["Kami", "GameAI", "AICreator"],
                    from: presenter
                )
            } catch let error as TikTokShareError {
                throw error
            }
        case .system:
            let activity = UIActivityViewController(activityItems: [url], applicationActivities: nil)
            activity.popoverPresentationController?.sourceView = presenter.view
            presenter.present(activity, animated: true)
        }
    }

    @MainActor
    private func currentPresenter() -> UIViewController? {
        guard let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
              let root = scene.windows.first(where: { $0.isKeyWindow })?.rootViewController ?? scene.windows.first?.rootViewController else {
            return nil
        }
        var presenter = root
        while let presented = presenter.presentedViewController {
            presenter = presented
        }
        return presenter
    }

    private func formatDuration(_ seconds: Double) -> String {
        guard seconds.isFinite else { return "0:00" }
        let total = Int(seconds.rounded())
        let m = total / 60
        let s = total % 60
        return String(format: "%d:%02d", m, s)
    }
}
