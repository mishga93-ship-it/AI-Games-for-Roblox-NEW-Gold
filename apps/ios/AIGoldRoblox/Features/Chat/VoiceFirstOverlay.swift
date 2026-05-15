//
//  VoiceFirstOverlay.swift
//  AIGoldRoblox
//
//  Voice-first welcome surface: big record button overlaid on the chat.
//  Shown on first entry into a voice-mode thread; collapses after the first
//  successful transcription (auto-sent) so the chat layout takes over.

import SwiftUI

struct VoiceFirstOverlay: View {
    let phase: ChatStore.VoicePhase
    let isRecording: Bool
    let languageCode: String
    let onMicTap: () -> Void
    let onTypeInstead: () -> Void

    @State private var pulseScale: CGFloat = 1.0
    @State private var waveformPhase: CGFloat = 0

    private var isProcessing: Bool {
        phase == .uploading || phase == .finalizing
    }

    private func t(_ key: String) -> String {
        Self.strings[key]?[languageCode] ?? Self.strings[key]?["en"] ?? key
    }

    private var titleText: String {
        if isRecording { return t("listening") }
        if isProcessing { return t("transcribing") }
        if phase == .failed { return t("couldNotTranscribe") }
        return t("tellMeWhat")
    }

    private var subtitleText: String {
        if isRecording { return t("tapToStop") }
        if isProcessing { return t("takesCoupleSeconds") }
        if phase == .failed { return t("tapToRetry") }
        return t("tapAndSpeak")
    }

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [.gradientTop, .gradientBottom],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            VStack(spacing: 28) {
                Spacer(minLength: 0)

                bigMicButton

                VStack(spacing: 8) {
                    Text(titleText)
                        .font(.system(size: 24, weight: .bold, design: .rounded))
                        .foregroundColor(.textPrimary)
                        .multilineTextAlignment(.center)
                    Text(subtitleText)
                        .font(.system(size: 15, weight: .medium, design: .rounded))
                        .foregroundColor(.textSecondary)
                        .multilineTextAlignment(.center)
                }
                .padding(.horizontal, 32)
                .animation(.easeInOut(duration: 0.18), value: titleText)

                if isRecording {
                    waveformView
                        .frame(height: 36)
                        .padding(.horizontal, 60)
                        .transition(.opacity.combined(with: .scale(scale: 0.9)))
                } else {
                    Color.clear.frame(height: 36)
                }

                Spacer(minLength: 0)

                Button(action: onTypeInstead) {
                    HStack(spacing: 6) {
                        Image(systemName: "keyboard")
                            .font(.system(size: 13, weight: .semibold))
                        Text(t("typeInstead"))
                            .font(.system(size: 14, weight: .semibold, design: .rounded))
                    }
                    .foregroundColor(.textSecondary)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 10)
                    .background(
                        Capsule().fill(Color.white.opacity(0.7))
                    )
                    .overlay(
                        Capsule().stroke(Color.accentPrimary.opacity(0.18), lineWidth: 1)
                    )
                }
                .buttonStyle(.plain)
                .padding(.bottom, 32)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .onAppear { startBreathAnimation() }
        .onChange(of: isRecording) { _, recording in
            if recording {
                startRecordingAnimations()
            }
        }
    }

    private var bigMicButton: some View {
        ZStack {
            // Outer pulse rings (only during recording)
            if isRecording {
                ForEach(0..<3) { index in
                    Circle()
                        .stroke(Color.accentPrimary.opacity(0.22), lineWidth: 2)
                        .frame(width: 180, height: 180)
                        .scaleEffect(pulseScale + CGFloat(index) * 0.12)
                        .opacity(2.0 - pulseScale - CGFloat(index) * 0.4)
                }
            }

            // Glow halo
            Circle()
                .fill(Color.micButtonGlow)
                .frame(width: 200, height: 200)
                .blur(radius: 28)
                .opacity(isRecording ? 0.95 : (isProcessing ? 0.7 : 0.45))
                .scaleEffect(isRecording ? 1.05 : 1.0)
                .animation(.easeInOut(duration: 1.2).repeatForever(autoreverses: true), value: isRecording)

            // Main button
            Button(action: onMicTap) {
                ZStack {
                    Circle()
                        .fill(
                            LinearGradient(
                                colors: [Color.accentPrimary, Color.brandElectricBlue],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .frame(width: 168, height: 168)
                        .shadow(color: .accentPrimary.opacity(0.5), radius: 24, x: 0, y: 10)

                    if isProcessing {
                        ProgressView()
                            .progressViewStyle(.circular)
                            .tint(.white)
                            .scaleEffect(1.8)
                    } else {
                        Image(systemName: isRecording ? "stop.fill" : "mic.fill")
                            .font(.system(size: 64, weight: .semibold))
                            .foregroundColor(.white)
                    }
                }
            }
            .buttonStyle(.plain)
            .scaleEffect(isRecording ? 0.96 : 1.0)
            .animation(.spring(response: 0.35, dampingFraction: 0.7), value: isRecording)
            .accessibilityLabel(Text(isRecording ? t("stopRecording") : t("startRecording")))
        }
        .frame(width: 240, height: 240)
    }

    private var waveformView: some View {
        HStack(alignment: .center, spacing: 4) {
            ForEach(0..<24) { index in
                Capsule()
                    .fill(Color.accentPrimary.opacity(0.85))
                    .frame(width: 4, height: barHeight(for: index))
            }
        }
        .onAppear {
            withAnimation(.linear(duration: 1.4).repeatForever(autoreverses: false)) {
                waveformPhase = .pi * 2
            }
        }
    }

    private func barHeight(for index: Int) -> CGFloat {
        let base: CGFloat = 8
        let amplitude: CGFloat = 18
        let theta = waveformPhase + CGFloat(index) * 0.45
        let value = (sin(theta) + 1) / 2
        return base + amplitude * value
    }

    private func startBreathAnimation() {
        guard !isRecording else { return }
        pulseScale = 1.0
    }

    private func startRecordingAnimations() {
        pulseScale = 1.0
        withAnimation(.easeOut(duration: 1.6).repeatForever(autoreverses: false)) {
            pulseScale = 1.8
        }
    }

    private static let strings: [String: [String: String]] = [
        "listening": [
            "en": "Listening...",
            "ru": "Слушаю...",
            "es": "Escuchando...",
            "pt": "Ouvindo...",
            "de": "Ich höre zu...",
            "fr": "J'écoute...",
            "zh": "正在聆听...",
            "ja": "聞いています...",
            "ko": "듣고 있어요...",
        ],
        "transcribing": [
            "en": "Transcribing...",
            "ru": "Распознаю...",
            "es": "Transcribiendo...",
            "pt": "Transcrevendo...",
            "de": "Wird umgewandelt...",
            "fr": "Transcription...",
            "zh": "正在识别...",
            "ja": "認識中...",
            "ko": "변환 중...",
        ],
        "couldNotTranscribe": [
            "en": "Could not transcribe",
            "ru": "Не удалось распознать",
            "es": "No se pudo transcribir",
            "pt": "Não foi possível transcrever",
            "de": "Konnte nicht erkannt werden",
            "fr": "Transcription impossible",
            "zh": "无法识别",
            "ja": "認識できませんでした",
            "ko": "인식하지 못했어요",
        ],
        "tellMeWhat": [
            "en": "Tell me what to build",
            "ru": "Расскажи, что собрать",
            "es": "Dime qué construir",
            "pt": "Diga o que criar",
            "de": "Sag mir, was ich bauen soll",
            "fr": "Dis-moi quoi construire",
            "zh": "告诉我要做什么",
            "ja": "何を作るか教えて",
            "ko": "무엇을 만들지 알려줘",
        ],
        "tapToStop": [
            "en": "Tap to stop",
            "ru": "Коснись, чтобы остановить",
            "es": "Toca para detener",
            "pt": "Toque para parar",
            "de": "Zum Stoppen tippen",
            "fr": "Touchez pour arrêter",
            "zh": "点击以停止",
            "ja": "タップして停止",
            "ko": "탭하여 중지",
        ],
        "takesCoupleSeconds": [
            "en": "This takes a couple of seconds",
            "ru": "Это займёт пару секунд",
            "es": "Tarda solo unos segundos",
            "pt": "Leva apenas alguns segundos",
            "de": "Das dauert ein paar Sekunden",
            "fr": "Cela prend quelques secondes",
            "zh": "需要几秒钟",
            "ja": "数秒かかります",
            "ko": "몇 초 걸려요",
        ],
        "tapToRetry": [
            "en": "Tap to try again",
            "ru": "Коснись, чтобы повторить",
            "es": "Toca para reintentar",
            "pt": "Toque para tentar novamente",
            "de": "Zum Wiederholen tippen",
            "fr": "Touchez pour réessayer",
            "zh": "点击以重试",
            "ja": "タップしてやり直す",
            "ko": "탭하여 다시 시도",
        ],
        "tapAndSpeak": [
            "en": "Tap and speak — I'll send it to the chat",
            "ru": "Коснись и говори — отправлю в чат",
            "es": "Toca y habla — lo enviaré al chat",
            "pt": "Toque e fale — eu envio para o chat",
            "de": "Tippe und sprich — ich sende es in den Chat",
            "fr": "Touchez et parlez — j'envoie au chat",
            "zh": "点击并说话 — 我会发送到聊天",
            "ja": "タップして話してください — チャットに送ります",
            "ko": "탭하고 말하세요 — 채팅으로 전송할게요",
        ],
        "typeInstead": [
            "en": "Type instead",
            "ru": "Печатать вместо этого",
            "es": "Escribir en su lugar",
            "pt": "Digitar em vez disso",
            "de": "Stattdessen tippen",
            "fr": "Taper plutôt",
            "zh": "改为输入",
            "ja": "代わりに入力",
            "ko": "대신 입력하기",
        ],
        "stopRecording": [
            "en": "Stop recording",
            "ru": "Остановить запись",
            "es": "Detener grabación",
            "pt": "Parar gravação",
            "de": "Aufnahme stoppen",
            "fr": "Arrêter l'enregistrement",
            "zh": "停止录音",
            "ja": "録音を停止",
            "ko": "녹음 중지",
        ],
        "startRecording": [
            "en": "Start recording",
            "ru": "Начать запись",
            "es": "Iniciar grabación",
            "pt": "Iniciar gravação",
            "de": "Aufnahme starten",
            "fr": "Démarrer l'enregistrement",
            "zh": "开始录音",
            "ja": "録音を開始",
            "ko": "녹음 시작",
        ],
    ]
}
