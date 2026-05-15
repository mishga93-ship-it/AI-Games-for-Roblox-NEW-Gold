//
//  Typography.swift
//  AIGoldRoblox
//

import SwiftUI
import Foundation

extension Font {
    // MARK: - Headlines (Neon Studio: bold)
    static let appLargeTitle = Font.system(size: 28, weight: .bold)
    static let appTitle = Font.system(size: 22, weight: .bold)
    static let appTitle2 = Font.system(size: 18, weight: .semibold)
    static let appHeadline = Font.system(size: 16, weight: .semibold)

    // MARK: - Body
    static let appBody = Font.system(size: 16, weight: .regular)
    static let appCallout = Font.system(size: 14, weight: .regular)
    static let appCaption = Font.system(size: 12, weight: .regular)

    // MARK: - Code
    static let appCode = Font.system(size: 13, weight: .regular).monospaced()

    // MARK: - Technical terms
    static func appTechnical(size: CGFloat, weight: Font.Weight = .semibold) -> Font {
        Font.system(size: size, weight: weight).monospaced()
    }
}

struct TechnicalText: View {
    let content: String
    let baseFont: Font
    let technicalFont: Font

    init(_ content: String, baseFont: Font, technicalFont: Font) {
        self.content = content
        self.baseFont = baseFont
        self.technicalFont = technicalFont
    }

    var body: some View {
        TechnicalTypography.text(content, baseFont: baseFont, technicalFont: technicalFont)
    }
}

enum TechnicalTypography {
    private static let termRegex = try! NSRegularExpression(
        pattern: #"(?<![A-Za-z0-9])(?:AI(?:s|'s)?|LLM(?:s)?|NPC(?:s)?|RBXM|RBXL|UGC|VFX|SFX|UI|GUI|HUD|ChatGPT|2D|3D)(?![A-Za-z0-9])"#,
        options: []
    )

    static func text(_ content: String, baseFont: Font, technicalFont: Font) -> Text {
        guard !content.isEmpty else {
            return Text("")
        }

        let fullRange = NSRange(content.startIndex..<content.endIndex, in: content)
        let matches = termRegex.matches(in: content, options: [], range: fullRange)
        guard !matches.isEmpty else {
            return Text(verbatim: content).font(baseFont)
        }

        var result = Text("")
        var cursor = content.startIndex

        for match in matches {
            guard let range = Range(match.range, in: content) else { continue }
            if cursor < range.lowerBound {
                result = result + Text(verbatim: String(content[cursor..<range.lowerBound])).font(baseFont)
            }
            result = result + Text(verbatim: String(content[range])).font(technicalFont)
            cursor = range.upperBound
        }

        if cursor < content.endIndex {
            result = result + Text(verbatim: String(content[cursor..<content.endIndex])).font(baseFont)
        }

        return result
    }
}
