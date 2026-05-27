// DisasterSpawnerStudio.swift — state controller for Voice-Controlled
// Survival Disaster Spawner (session 387). Mirrors VoiceAuraStudio voice
// pipeline (SFSpeechRecognizer + AVAudioEngine).

import Foundation
import SwiftUI
import UIKit
import Photos
import Speech
import AVFoundation

@MainActor
final class DisasterSpawnerStudio: NSObject, ObservableObject {
    enum Step: Equatable {
        case input
        case loading
        case result(DisasterGenerationResponse)
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
    @Published var mode: DisasterMode = .funny
    @Published var chaos: DisasterChaosLevel = .chaotic
    @Published var size: DisasterSize = .normal
    @Published var frequency: DisasterFrequency = .normal
    @Published var transientToast: String?

    // Voice recording state (same pattern as VoiceAuraStudio)
    @Published var isRecording: Bool = false
    @Published var voiceAvailable: Bool = false
    private let speechRecognizer = SFSpeechRecognizer(locale: Locale(identifier: "en_US"))
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private let audioEngine = AVAudioEngine()
    private var lastInputMode: String = "text"

    override init() {
        super.init()
        voiceAvailable = (speechRecognizer?.isAvailable ?? false)
    }

    var allModes: [DisasterMode] { DisasterMode.allCases }

    // MARK: - Flow

    func generate(forceMoreChaotic: Bool = false) async {
        let trimmed = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            toast(loc(en: "Describe the disaster — type or speak.",
                      ru: "Опиши disaster — введи или произнеси."))
            return
        }
        let effectiveChaos: DisasterChaosLevel = forceMoreChaotic
            ? (chaos == .balanced ? .chaotic : .impossible)
            : chaos
        step = .loading
        do {
            let r = try await DisasterSpawnerAPIClient.generate(
                prompt: trimmed,
                mode: mode,
                chaos: effectiveChaos,
                size: size,
                frequency: frequency,
                inputMode: lastInputMode
            )
            chaos = effectiveChaos
            step = .result(r)
        } catch let DisasterAPIError.rateLimited {
            step = .error(loc(en: "Too many requests. Wait a minute.",
                              ru: "Слишком много запросов. Подожди минутку."))
        } catch let DisasterAPIError.emptyPrompt {
            step = .error(loc(en: "Empty prompt.", ru: "Пустой prompt."))
        } catch {
            step = .error(error.localizedDescription)
        }
    }

    func retryAfterError() { step = .input }
    func backToInput() { step = .input }

    // MARK: - Voice (mirrors VoiceAuraStudio)

    func toggleRecording() {
        if isRecording { stopRecording() } else { Task { await startRecording() } }
    }

    private func startRecording() async {
        guard let recognizer = speechRecognizer, recognizer.isAvailable else {
            toast(loc(en: "Speech recognition unavailable.",
                      ru: "Распознавание речи недоступно."))
            return
        }
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
                    if let result { self.prompt = result.bestTranscription.formattedString }
                    if error != nil || (result?.isFinal ?? false) { self.stopRecording() }
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
        toast(loc(en: "✅ Lua copied — paste into Roblox Studio.",
                  ru: "✅ Lua скопирован — вставь в Roblox Studio."))
    }

    func shareRbxmx(urlString: String?) {
        guard let urlString, let url = URL(string: urlString) else {
            toast(loc(en: "No .rbxmx file generated.", ru: "Нет .rbxmx файла."))
            return
        }
        Task { @MainActor in
            do {
                let (tmpUrl, _) = try await URLSession.shared.download(from: url)
                let suggestedName = (urlString.split(separator: "?").first.map(String.init) ?? "")
                    .split(separator: "/").last.map(String.init) ?? "Disaster.rbxmx"
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
                presentActivitySheet(items: [image, Self.shareCaption(resp)])
            } else {
                presentActivitySheet(items: [Self.shareCaption(resp)])
            }
        }
    }

    private static func shareCaption(_ r: DisasterGenerationResponse) -> String {
        return "\(r.localizedTitle) — \(r.localizedRarity) 💀\n\(r.shareCaption)\n\n#roblox #robloxstudio #robloxsurvival #fyp #brainrot #kamigold"
    }

    @available(iOS 16.0, *)
    @MainActor
    private func renderPoster(resp: DisasterGenerationResponse) async -> UIImage? {
        var mainImg: UIImage? = nil
        if let u = resp.previewUrl, let url = URL(string: u),
           let (data, _) = try? await URLSession.shared.data(from: url) {
            mainImg = UIImage(data: data)
        }
        let view = DisasterSpawnerSharePoster(response: resp, mainImage: mainImg)
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
