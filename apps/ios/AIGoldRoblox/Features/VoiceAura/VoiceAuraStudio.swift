// VoiceAuraStudio.swift — state controller for Voice-to-Aura
// (session 385). On-device speech via SFSpeechRecognizer (free, no API
// cost). State machine: input → loading → result.

import Foundation
import SwiftUI
import UIKit
import Photos
import Speech
import AVFoundation

@MainActor
final class VoiceAuraStudio: NSObject, ObservableObject {
    enum Step: Equatable {
        case input
        case loading
        case result(AuraGenerationResponse)
        case error(String)

        static func == (lhs: Step, rhs: Step) -> Bool {
            switch (lhs, rhs) {
            case (.input, .input): return true
            case (.loading, .loading): return true
            case let (.result(a), .result(b)): return a.generationId == b.generationId
            case let (.error(a), .error(b)): return a == b
            default: return false
            }
        }
    }

    @Published var step: Step = .input
    @Published var prompt: String = ""
    @Published var style: AuraStyle = .anime
    @Published var intensity: AuraIntensity = .aggressive
    @Published var size: AuraSize = .normal
    @Published var tone: AuraTone = .clean
    @Published var transientToast: String?

    // Voice recording state
    @Published var isRecording: Bool = false
    @Published var voiceAvailable: Bool = false
    private let speechRecognizer = SFSpeechRecognizer(locale: Locale(identifier: "en_US"))
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private let audioEngine = AVAudioEngine()
    /// Set to "voice" if the most-recent submit used the mic, else "text".
    private var lastInputMode: String = "text"

    override init() {
        super.init()
        voiceAvailable = (speechRecognizer?.isAvailable ?? false)
    }

    var allStyles: [AuraStyle] { AuraStyle.allCases }

    // MARK: - Generation flow

    func generate(forceMoreOP: Bool = false) async {
        if case .result = step {} // OK to regenerate from result.
        let trimmed = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            toast(loc(en: "Type or speak what kind of aura you want.",
                      ru: "Введи или скажи какая нужна aura."))
            return
        }
        let effectiveIntensity: AuraIntensity = forceMoreOP
            ? (intensity == .calm ? .aggressive : .extreme)
            : intensity
        step = .loading
        do {
            let r = try await VoiceAuraAPIClient.generate(
                prompt: trimmed,
                style: style,
                intensity: effectiveIntensity,
                size: size,
                tone: tone,
                inputMode: lastInputMode
            )
            intensity = effectiveIntensity
            step = .result(r)
        } catch let AuraAPIError.rateLimited {
            step = .error(loc(en: "Too many requests. Wait a minute.",
                              ru: "Слишком много запросов. Подожди минутку."))
        } catch let AuraAPIError.emptyPrompt {
            step = .error(loc(en: "Empty prompt.", ru: "Пустой prompt."))
        } catch {
            step = .error(error.localizedDescription)
        }
    }

    func retryAfterError() { step = .input }
    func backToInput() { step = .input }

    // MARK: - Voice input (SFSpeechRecognizer)

    /// Toggle: start listening if idle, stop if recording.
    func toggleRecording() {
        if isRecording {
            stopRecording()
        } else {
            Task { await startRecording() }
        }
    }

    private func startRecording() async {
        guard let recognizer = speechRecognizer, recognizer.isAvailable else {
            toast(loc(en: "Speech recognition unavailable.",
                      ru: "Распознавание речи недоступно."))
            return
        }
        // Permissions
        let speechAuth = await Self.requestSpeechAuthorization()
        guard speechAuth == .authorized else {
            toast(loc(en: "Enable Speech Recognition in Settings.",
                      ru: "Разреши Speech Recognition в Настройках."))
            return
        }
        let micAuth = await Self.requestMicAuthorization()
        guard micAuth else {
            toast(loc(en: "Enable Microphone in Settings.",
                      ru: "Разреши Микрофон в Настройках."))
            return
        }

        do {
            try AVAudioSession.sharedInstance().setCategory(.record, mode: .measurement, options: .duckOthers)
            try AVAudioSession.sharedInstance().setActive(true, options: .notifyOthersOnDeactivation)

            let req = SFSpeechAudioBufferRecognitionRequest()
            req.shouldReportPartialResults = true
            recognitionRequest = req

            let input = audioEngine.inputNode
            let format = input.outputFormat(forBus: 0)
            input.removeTap(onBus: 0)
            input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buf, _ in
                self?.recognitionRequest?.append(buf)
            }
            audioEngine.prepare()
            try audioEngine.start()

            recognitionTask = recognizer.recognitionTask(with: req) { [weak self] result, error in
                guard let self else { return }
                Task { @MainActor in
                    if let result {
                        self.prompt = result.bestTranscription.formattedString
                    }
                    if error != nil || (result?.isFinal ?? false) {
                        self.stopRecording()
                    }
                }
            }
            isRecording = true
            lastInputMode = "voice"
        } catch {
            toast(loc(en: "Recording failed: \(error.localizedDescription)",
                      ru: "Запись не удалась: \(error.localizedDescription)"))
            stopRecording()
        }
    }

    private func stopRecording() {
        audioEngine.stop()
        audioEngine.inputNode.removeTap(onBus: 0)
        recognitionRequest?.endAudio()
        recognitionTask?.cancel()
        recognitionRequest = nil
        recognitionTask = nil
        isRecording = false
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    private static func requestSpeechAuthorization() async -> SFSpeechRecognizerAuthorizationStatus {
        await withCheckedContinuation { cont in
            SFSpeechRecognizer.requestAuthorization { cont.resume(returning: $0) }
        }
    }
    private static func requestMicAuthorization() async -> Bool {
        await withCheckedContinuation { cont in
            AVAudioApplication.requestRecordPermission { cont.resume(returning: $0) }
        }
    }

    // MARK: - Result actions

    func copyLua() {
        guard case let .result(r) = step else { return }
        UIPasteboard.general.string = r.luaScript
        toast(loc(en: "✅ Lua copied — paste into Roblox Studio Script.",
                  ru: "✅ Lua скопирован — вставь в Script в Roblox Studio."))
    }

    func openRobloxStudioInfo() {
        guard let url = URL(string: "https://create.roblox.com/docs/studio/setting-up-roblox-studio") else { return }
        UIApplication.shared.open(url)
    }

    /// Download the .rbxmx model from backend and push it to the iOS Share
    /// Sheet — user can save to Files / iCloud Drive / AirDrop to Mac
    /// (where Roblox Studio runs) → drag into ServerScriptService.
    func shareRbxmx(urlString: String?) {
        guard let urlString, let url = URL(string: urlString) else {
            toast(loc(en: "No .rbxmx file generated for this aura.",
                      ru: "Нет .rbxmx для этой ауры."))
            return
        }
        Task { @MainActor in
            do {
                let (tmpUrl, _) = try await URLSession.shared.download(from: url)
                // Move to a meaningful name so the share sheet shows e.g. CrimsonAura.rbxmx
                let suggestedName = (urlString.split(separator: "?").first.map(String.init) ?? "")
                    .split(separator: "/").last.map(String.init)
                    ?? "Aura.rbxmx"
                let dest = FileManager.default.temporaryDirectory.appendingPathComponent(suggestedName)
                try? FileManager.default.removeItem(at: dest)
                try FileManager.default.moveItem(at: tmpUrl, to: dest)
                presentActivitySheet(items: [dest])
            } catch {
                toast(loc(en: "Download failed: \(error.localizedDescription)",
                          ru: "Загрузка не удалась: \(error.localizedDescription)"))
            }
        }
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
                    await self?.toast(loc(en: "Photos access denied.",
                                          ru: "Нет доступа к Фото."))
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
                // Caption is baked into the poster.
                presentActivitySheet(items: [image])
            } else {
                presentActivitySheet(items: [Self.shareCaption(resp)])
            }
        }
    }

    private static func shareCaption(_ r: AuraGenerationResponse) -> String {
        return "\(r.localizedTitle) — \(r.localizedRarity) Aura 🔥\n\(r.shareCaption)\n\n#roblox #robloxstudio #aura #fyp #anime #kamigold"
    }

    @available(iOS 16.0, *)
    @MainActor
    private func renderPoster(resp: AuraGenerationResponse) async -> UIImage? {
        var mainImg: UIImage? = nil
        if let u = resp.previewUrl, let url = URL(string: u),
           let (data, _) = try? await URLSession.shared.data(from: url) {
            mainImg = UIImage(data: data)
        }
        let view = VoiceAuraSharePoster(response: resp, mainImage: mainImg)
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
