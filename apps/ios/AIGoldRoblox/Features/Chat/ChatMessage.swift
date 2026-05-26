//
//  ChatMessage.swift
//  AIGoldRoblox
//

import Foundation

struct ChatMessage: Identifiable, Codable {
    let id: String
    let role: Role
    let content: String
    let quickReplies: [String]?
    let gddRows: [GDDRow]?
    let createdAt: Date
    /// Inline audio preview URL — shown as a compact player in the chat bubble
    let audioURL: URL?
    /// Inline image preview URL — shown as a thumbnail inside the chat bubble
    /// (used when user attaches a reference photo via paperclip → Choose Photo / Attach File).
    let imageURL: URL?
    /// Key into `ChatImageCache.shared` — when set, bubble renders the cached
    /// UIImage directly instead of going through AsyncImage+URL. Set for photos
    /// selected via PhotosPicker so the thumbnail is instant and doesn't depend
    /// on the Firebase Storage signed URL being reachable.
    let localImageKey: String?
    /// Session #095 — weapon interview Turn 2 shows a SwiftUI ColorPicker bubble.
    /// Non-nil means this assistant message carries default hex colors to pre-fill the pickers.
    let weaponColors: WeaponColorPickerPayload?
    /// Session 382 Variant 2 — generic "action buttons" rendered as proper
    /// SwiftUI buttons under the bubble content. Each button has a label and
    /// either a URL (opened via UIApplication) or a system action sentinel
    /// (e.g. "savePhoto:<url>", "shareLook:<url>"). Used by the Fake Headless
    /// & Korblox Crafter to render item rows + Save/Share as styled buttons
    /// instead of quick-reply chips.
    let linkActions: [LinkAction]?

    struct LinkAction: Codable, Hashable {
        let label: String
        let url: String          // either https://... or sentinel "savePhoto:" / "shareLook:"
        let systemIcon: String?  // SF Symbol name, optional
        let style: ButtonStyleKind
    }

    enum ButtonStyleKind: String, Codable, Hashable {
        case prominent
        case bordered
        case plain
    }

    struct WeaponColorPickerPayload: Codable, Hashable {
        let primaryHex: String
        let accentHex: String
        let glowHex: String
    }

    enum Role: String, Codable {
        case user
        case assistant
    }

    struct GDDRow: Codable, Hashable {
        let key: String
        let value: String
    }

    init(
        id: String,
        role: Role,
        content: String,
        quickReplies: [String]?,
        gddRows: [(String, String)]?,
        createdAt: Date,
        audioURL: URL? = nil,
        imageURL: URL? = nil,
        localImageKey: String? = nil,
        weaponColors: WeaponColorPickerPayload? = nil,
        linkActions: [LinkAction]? = nil
    ) {
        self.id = id
        self.role = role
        self.content = content
        self.quickReplies = quickReplies
        self.gddRows = gddRows?.map { GDDRow(key: $0.0, value: $0.1) }
        self.createdAt = createdAt
        self.audioURL = audioURL
        self.imageURL = imageURL
        self.localImageKey = localImageKey
        self.weaponColors = weaponColors
        self.linkActions = linkActions
    }
}

extension ChatMessage {
    var gddRowTuples: [(String, String)]? {
        gddRows?.map { ($0.key, $0.value) }
    }
}
