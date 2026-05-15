//
//  MicButton.swift
//  AIGoldRoblox
//
//  Voice First: dominant mic button with Neon Studio glow
//

import SwiftUI

struct MicButton: View {
    let isRecording: Bool
    let isProcessing: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            ZStack {
                if isRecording || isProcessing {
                    Circle()
                        .fill(Color.micButtonGlow)
                        .frame(width: 88, height: 88)
                        .blur(radius: 12)
                        .scaleEffect(isRecording ? 1.1 : 1.02)
                }
                Circle()
                    .fill(Color.micButtonFill)
                    .frame(width: 72, height: 72)
                    .overlay(
                        Image(systemName: isRecording ? "stop.fill" : (isProcessing ? "waveform" : "mic.fill"))
                            .font(.system(size: 28))
                            .foregroundColor(.black)
                    )
                    .shadow(color: .micButtonGlow.opacity(isRecording || isProcessing ? 0.8 : 0.3), radius: isRecording || isProcessing ? 16 : 8)
            }
        }
        .buttonStyle(.plain)
    }
}
