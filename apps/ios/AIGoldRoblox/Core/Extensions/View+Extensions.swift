//
//  View+Extensions.swift
//  AIGoldRoblox
//

import SwiftUI

enum LayoutMetrics {
    static let floatingTabBarClearance: CGFloat = 132
}

extension View {
    func cardStyle() -> some View {
        self
            .padding()
            .background(Color.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(Color.quickReplyBorder.opacity(0.5), lineWidth: 1)
            )
    }

    func dismissKeyboardOnTap() -> some View {
        self.background(DismissKeyboardTapView())
    }
}

/// UIKit-based tap that dismisses the keyboard without stealing touches from
/// wrapped UIKit controls (e.g. `SignInWithAppleButton`).
private struct DismissKeyboardTapView: UIViewRepresentable {
    func makeUIView(context: Context) -> UIView {
        let view = PassthroughView()
        let tap = UITapGestureRecognizer(
            target: context.coordinator,
            action: #selector(Coordinator.dismiss)
        )
        tap.cancelsTouchesInView = false
        view.addGestureRecognizer(tap)
        return view
    }
    func updateUIView(_ uiView: UIView, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator() }

    class Coordinator {
        @objc func dismiss() {
            UIApplication.shared.sendAction(
                #selector(UIResponder.resignFirstResponder),
                to: nil, from: nil, for: nil
            )
        }
    }

    private class PassthroughView: UIView {
        override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? { nil }
    }
}

extension View {
    func hideCustomTabBarOnPush() -> some View {
        modifier(HideCustomTabBarOnPushModifier())
    }
}

// MARK: - Global keyboard dismissal
//
// Installs a `UITapGestureRecognizer` on the hosting `UIWindow` that calls
// `endEditing(true)` — dismissing the keyboard from any text input on ANY
// screen, sheet, or modal (sheets live inside the same window).
//
// Use: `.installGlobalKeyboardDismiss()` once on the app's root view.
// `cancelsTouchesInView = false` means button taps still work as usual.
extension View {
    func installGlobalKeyboardDismiss() -> some View {
        self.background(GlobalKeyboardDismissInstaller())
    }
}

// Singleton target for the window-level gesture. Must outlive SwiftUI view
// instances because UITapGestureRecognizer stores its target unretained.
private final class GlobalKeyboardDismissHandler: NSObject, UIGestureRecognizerDelegate {
    static let shared = GlobalKeyboardDismissHandler()

    @objc func handleTap(_ gesture: UITapGestureRecognizer) {
        UIApplication.shared.sendAction(
            #selector(UIResponder.resignFirstResponder),
            to: nil, from: nil, for: nil
        )
    }

    // Coexist with buttons, list taps, ScrollView pan, etc.
    func gestureRecognizer(
        _ gestureRecognizer: UIGestureRecognizer,
        shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer
    ) -> Bool { true }

    // Don't fire when user taps inside a text input (TextField/TextEditor/WebView).
    // Otherwise tapping a field would resign its first-responder the same frame
    // it tries to claim it → focus lost, keyboard hidden.
    func gestureRecognizer(
        _ gestureRecognizer: UIGestureRecognizer,
        shouldReceive touch: UITouch
    ) -> Bool {
        guard let hit = touch.view else { return true }
        var v: UIView? = hit
        while let current = v {
            if current is UITextField || current is UITextView { return false }
            v = current.superview
        }
        return true
    }
}

private struct GlobalKeyboardDismissInstaller: UIViewRepresentable {
    func makeUIView(context: Context) -> UIView {
        let probe = UIView(frame: .zero)
        probe.isUserInteractionEnabled = false
        DispatchQueue.main.async { [weak probe] in
            guard let window = probe?.window ?? Self.keyWindow() else { return }
            let name = "AIGold.GlobalKeyboardDismiss"
            if window.gestureRecognizers?.contains(where: { $0.name == name }) == true {
                return
            }
            let tap = UITapGestureRecognizer(
                target: GlobalKeyboardDismissHandler.shared,
                action: #selector(GlobalKeyboardDismissHandler.handleTap(_:))
            )
            tap.name = name
            tap.cancelsTouchesInView = false
            tap.requiresExclusiveTouchType = false
            tap.delegate = GlobalKeyboardDismissHandler.shared
            window.addGestureRecognizer(tap)
        }
        return probe
    }

    func updateUIView(_ uiView: UIView, context: Context) {}

    private static func keyWindow() -> UIWindow? {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .first(where: { $0.isKeyWindow })
    }
}

private struct HideCustomTabBarOnPushModifier: ViewModifier {
    @EnvironmentObject private var appState: AppState
    @State private var hasApplied = false

    func body(content: Content) -> some View {
        content
            .onAppear {
                guard !hasApplied else { return }
                hasApplied = true
                appState.pushTabBarHidden()
            }
            .onDisappear {
                guard hasApplied else { return }
                hasApplied = false
                appState.popTabBarHidden()
            }
    }
}
