//
//  KeyboardObserver.swift
//  AIGoldRoblox
//

import SwiftUI
import Combine

final class KeyboardObserver: ObservableObject {
    @Published var isVisible = false
    @Published var height: CGFloat = 0

    private var cancellables = Set<AnyCancellable>()

    init() {
        NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)
            .compactMap { ($0.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect)?.height }
            .sink { [weak self] h in
                self?.height = h
                self?.isVisible = true
            }
            .store(in: &cancellables)

        NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)
            .sink { [weak self] _ in
                self?.height = 0
                self?.isVisible = false
            }
            .store(in: &cancellables)
    }
}
