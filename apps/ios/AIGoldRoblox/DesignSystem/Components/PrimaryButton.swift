//
//  PrimaryButton.swift
//  AIGoldRoblox
//

import SwiftUI

struct PrimaryButton: View {
    let title: String
    let action: () -> Void
    var style: Style = .filled

    enum Style { case filled, outline }

    var body: some View {
        Button(action: action) {
            TechnicalText(title, baseFont: .appHeadline, technicalFont: .appTechnical(size: 16, weight: .bold))
                .foregroundColor(style == .filled ? .black : .accentPrimary)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(
                    RoundedRectangle(cornerRadius: 12)
                        .fill(style == .filled ? Color.accentPrimary : Color.clear)
                        .overlay(
                            RoundedRectangle(cornerRadius: 12)
                                .stroke(Color.accentPrimary, lineWidth: style == .outline ? 2 : 0)
                        )
                )
        }
        .buttonStyle(.plain)
    }
}
