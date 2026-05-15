//
//  WeaponColorPickerBubble.swift
//  AIGoldRoblox
//
//  Session #095 — inline bubble in weapon interview Turn 2 that lets the user pick
//  primary / accent / glow hex colors. On confirm, calls ChatStore.confirmWeaponColors
//  which stashes them on ProjectDraft so generationMetadata emits them as metadata.*Color.
//

import SwiftUI

struct WeaponColorPickerBubble: View {
    let payload: ChatMessage.WeaponColorPickerPayload
    var onConfirm: (_ primary: String, _ accent: String, _ glow: String) -> Void

    @State private var primary: Color
    @State private var accent: Color
    @State private var glow: Color

    init(
        payload: ChatMessage.WeaponColorPickerPayload,
        onConfirm: @escaping (_ primary: String, _ accent: String, _ glow: String) -> Void
    ) {
        self.payload = payload
        self.onConfirm = onConfirm
        _primary = State(initialValue: Color(hex: payload.primaryHex) ?? .gray)
        _accent  = State(initialValue: Color(hex: payload.accentHex)  ?? .black)
        _glow    = State(initialValue: Color(hex: payload.glowHex)    ?? .cyan)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Weapon colors")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.secondary)

            colorRow(label: "Primary", binding: $primary)
            colorRow(label: "Accent",  binding: $accent)
            colorRow(label: "Glow",    binding: $glow)

            // Presets
            HStack(spacing: 8) {
                presetButton("Fire",   primary: "#C0C0C0", accent: "#1A1A1A", glow: "#FF4500")
                presetButton("Ice",    primary: "#A3E4FF", accent: "#FFFFFF", glow: "#00B4FF")
                presetButton("Shadow", primary: "#1A1A2E", accent: "#9B00FF", glow: "#C080FF")
                presetButton("Gold",   primary: "#D4AF37", accent: "#8B6914", glow: "#FFF0AA")
                presetButton("Neon",   primary: "#00FF88", accent: "#FF00E5", glow: "#00FFFF")
            }
            .font(.caption)

            Button {
                onConfirm(primary.toHex() ?? payload.primaryHex,
                          accent.toHex()  ?? payload.accentHex,
                          glow.toHex()    ?? payload.glowHex)
            } label: {
                Label("Confirm colors", systemImage: "checkmark.seal.fill")
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
            }
            .buttonStyle(.borderedProminent)
        }
        .padding(12)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private func colorRow(label: String, binding: Binding<Color>) -> some View {
        HStack {
            Text(label).font(.callout)
            Spacer()
            ColorPicker("", selection: binding, supportsOpacity: false)
                .labelsHidden()
                .frame(width: 44)
        }
    }

    private func presetButton(_ name: String, primary p: String, accent a: String, glow g: String) -> some View {
        Button(name) {
            primary = Color(hex: p) ?? primary
            accent  = Color(hex: a) ?? accent
            glow    = Color(hex: g) ?? glow
        }
        .buttonStyle(.bordered)
        .controlSize(.small)
    }
}

// MARK: - Color hex helpers (scoped to this file — reusable but no global additions)

extension Color {
    init?(hex: String) {
        let clean = hex.replacingOccurrences(of: "#", with: "").trimmingCharacters(in: .whitespaces)
        let normalized: String
        switch clean.count {
        case 3: normalized = clean.map { "\($0)\($0)" }.joined()
        case 6: normalized = clean
        default: return nil
        }
        guard let value = UInt32(normalized, radix: 16) else { return nil }
        let r = Double((value >> 16) & 0xff) / 255.0
        let g = Double((value >> 8)  & 0xff) / 255.0
        let b = Double(value & 0xff) / 255.0
        self = Color(.sRGB, red: r, green: g, blue: b, opacity: 1)
    }

    func toHex() -> String? {
        #if canImport(UIKit)
        let ui = UIColor(self)
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        guard ui.getRed(&r, green: &g, blue: &b, alpha: &a) else { return nil }
        let R = Int((r * 255).rounded()).clamped(to: 0...255)
        let G = Int((g * 255).rounded()).clamped(to: 0...255)
        let B = Int((b * 255).rounded()).clamped(to: 0...255)
        return String(format: "#%02X%02X%02X", R, G, B)
        #else
        return nil
        #endif
    }
}

private extension Int {
    func clamped(to range: ClosedRange<Int>) -> Int {
        Swift.min(Swift.max(self, range.lowerBound), range.upperBound)
    }
}
