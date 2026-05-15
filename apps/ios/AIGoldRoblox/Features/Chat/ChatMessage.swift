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
        weaponColors: WeaponColorPickerPayload? = nil
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
    }
}

extension ChatMessage {
    var gddRowTuples: [(String, String)]? {
        gddRows?.map { ($0.key, $0.value) }
    }
}
