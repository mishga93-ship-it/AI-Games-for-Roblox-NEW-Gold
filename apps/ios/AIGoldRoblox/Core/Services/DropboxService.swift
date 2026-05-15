import Foundation

actor DropboxService {
    static let shared = DropboxService()

    private let appKey = "anu7o7soo598g7j"
    private let appSecret = "6ul0w998yymv5qo"
    private let refreshToken = "8ovW134oYMYAAAAAAAAAAVNowN3vV_yCrtKPXsQQEVrkSg_lU5N9LZOyyZibMU_Y"

    private var accessToken: String = ""
    private var tokenExpiresAt: Date = .distantPast
    private var cachedSections: [String: [ContentItem]] = [:]
    private var cachedSectionsAt: Date?
    private var inFlightSectionsLoad: Task<[String: [ContentItem]], Never>?
    private var inFlightSectionsLoadID: UUID?
    private let sectionsCacheTTL: TimeInterval = 300
    private var temporaryLinkCache: [String: (url: URL, expiresAt: Date)] = [:]
    private var inFlightTemporaryLinks: [String: Task<URL, Error>] = [:]
    private let temporaryLinkTTL: TimeInterval = 60 * 60 * 3.5
    private let cacheDirectory: URL
    private let sectionsDiskCacheURL: URL

    private let dropboxSession: URLSession

    private func log(_ message: String) {
        let formatted = "[DropboxService] \(message)"
        print(formatted)
    }

    private func sampleItemsDescription(_ items: [ContentItem], limit: Int = 3) -> String {
        guard !items.isEmpty else { return "[]" }
        return items.prefix(limit).map {
            let imageSource = $0.dropboxImagePath.isEmpty ? $0.imageUrl : $0.dropboxImagePath
            return "{title=\"\($0.title)\", subtitle=\"\($0.subtitle)\", image=\"\(imageSource)\"}"
        }.joined(separator: ", ")
    }

    private func totalItemCount(in sections: [String: [ContentItem]]) -> Int {
        sections.values.reduce(0) { $0 + $1.count }
    }

    // Dropbox folder structure
    static let rootFolder = "/qiuj89h0it6"
    static let folderMap: [String: String] = [
        "21edacsae1": "Skins",
        "34gdgbdbdb": "Codes",
        "3tgjmkkolj": "Categories Cover",
        "56uhgfbbbs": "Editor",
        "6i7jkhgjgw": "Editor Items",
        "90kjyhhhhj": "LookBook",
        "y54hggdfcv": "Mods"
    ]

    private init() {
        let config = URLSessionConfiguration.default
        config.httpMaximumConnectionsPerHost = 4
        config.timeoutIntervalForRequest = 20
        self.dropboxSession = URLSession(configuration: config)
        let cachesRoot = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true)
        self.cacheDirectory = cachesRoot.appendingPathComponent("AIGoldRobloxDropboxCache", isDirectory: true)
        self.sectionsDiskCacheURL = cacheDirectory.appendingPathComponent("sections-cache.json")
        try? FileManager.default.createDirectory(at: cacheDirectory, withIntermediateDirectories: true)
    }

    // MARK: - Token refresh

    private func ensureValidToken() async throws {
        let needsRefresh = accessToken.isEmpty || Date() >= tokenExpiresAt
        guard needsRefresh else { return }
        log("Refreshing access token")

        let url = URL(string: "https://api.dropboxapi.com/oauth2/token")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"

        let body = "grant_type=refresh_token&refresh_token=\(refreshToken)&client_id=\(appKey)&client_secret=\(appSecret)"
        request.httpBody = body.data(using: .utf8)
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")

        let (data, response) = try await dropboxSession.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw URLError(.userAuthenticationRequired)
        }

        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let token = json["access_token"] as? String,
              let expiresIn = json["expires_in"] as? Int else {
            throw URLError(.cannotParseResponse)
        }

        accessToken = token
        tokenExpiresAt = Date().addingTimeInterval(TimeInterval(expiresIn - 60))
        log("Access token refreshed successfully")
    }

    // MARK: - Temporary link

    func getTemporaryLink(forPath path: String) async throws -> URL {
        let normalizedPath = path.hasPrefix("/") ? path : "/" + path
        if let cached = temporaryLinkCache[normalizedPath], cached.expiresAt > Date() {
            return cached.url
        }

        if let existing = inFlightTemporaryLinks[normalizedPath] {
            return try await existing.value
        }

        try await ensureValidToken()
        let token = accessToken
        log("Requesting temporary link for \(normalizedPath)")

        let task = Task<URL, Error> {
            let endpoint = URL(string: "https://api.dropboxapi.com/2/files/get_temporary_link")!
            var request = URLRequest(url: endpoint)
            request.httpMethod = "POST"
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: ["path": normalizedPath])

            let (data, response) = try await self.dropboxSession.data(for: request)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                throw URLError(.badServerResponse)
            }

            guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let link = json["link"] as? String,
                  let url = URL(string: link) else {
                throw URLError(.cannotParseResponse)
            }

            return url
        }

        inFlightTemporaryLinks[normalizedPath] = task

        do {
            let url = try await task.value
            temporaryLinkCache[normalizedPath] = (url, Date().addingTimeInterval(temporaryLinkTTL))
            inFlightTemporaryLinks[normalizedPath] = nil
            log("Temporary link resolved for \(normalizedPath)")
            return url
        } catch {
            inFlightTemporaryLinks[normalizedPath] = nil
            throw error
        }
    }

    // MARK: - List folder

    func listFolder(path: String) async throws -> [[String: Any]] {
        try await ensureValidToken()

        let normalizedPath = path.hasPrefix("/") ? path : "/" + path
        log("Listing folder \(normalizedPath)")
        let endpoint = URL(string: "https://api.dropboxapi.com/2/files/list_folder")!

        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["path": normalizedPath])

        let (data, response) = try await dropboxSession.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw URLError(.badServerResponse)
        }

        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let entries = json["entries"] as? [[String: Any]] else {
            return []
        }

        log("Found \(entries.count) entries in \(normalizedPath)")
        return entries
    }

    // MARK: - Download file content

    func downloadFile(path: String) async throws -> Data {
        try await ensureValidToken()

        let normalizedPath = path.hasPrefix("/") ? path : "/" + path
        log("Downloading file \(normalizedPath)")
        let endpoint = URL(string: "https://content.dropboxapi.com/2/files/download")!

        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")

        let arg = try JSONSerialization.data(withJSONObject: ["path": normalizedPath])
        request.setValue(String(data: arg, encoding: .utf8)!, forHTTPHeaderField: "Dropbox-API-Arg")

        do {
            let (data, response) = try await dropboxSession.data(for: request)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                throw URLError(.badServerResponse)
            }

            log("Downloaded \(normalizedPath) (\(data.count) bytes)")
            return data
        } catch {
            log("Direct download failed for \(normalizedPath): \(error). Retrying via temporary link.")
            let temporaryURL = try await getTemporaryLink(forPath: normalizedPath)
            let (data, response) = try await dropboxSession.data(from: temporaryURL)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                throw URLError(.badServerResponse)
            }

            log("Downloaded \(normalizedPath) via temporary link (\(data.count) bytes)")
            return data
        }
    }

    // MARK: - Parse content JSON

    private func loadJSONObject(path: String) async throws -> Any {
        let data = try await downloadFile(path: path)
        return try JSONSerialization.jsonObject(with: data)
    }

    private func hasImageExtension(_ value: String) -> Bool {
        let lower = value.lowercased()
        return lower.hasSuffix(".png") || lower.hasSuffix(".jpg") || lower.hasSuffix(".jpeg") || lower.hasSuffix(".webp")
    }

    private func fileStem(_ value: String) -> String {
        NSString(string: value).deletingPathExtension
    }

    private func trailingNumber(in value: String) -> Int? {
        let digits = value.reversed().prefix { $0.isNumber }.reversed()
        guard !digits.isEmpty else { return nil }
        return Int(String(digits))
    }

    private func prefixWithoutTrailingNumber(_ value: String) -> String {
        let stem = fileStem(value)
        return String(stem.prefix { !$0.isNumber })
    }

    private func flatPairKey(prefix: String, number: Int?) -> String {
        "\(prefix)#\(number ?? -1)"
    }

    private func prettifiedTitle(_ value: String) -> String {
        let source: String
        if hasImageExtension(value) || value.lowercased().hasSuffix(".rbxmod") {
            source = fileStem(value)
        } else {
            source = value
        }

        let cleaned = source
            .replacingOccurrences(of: "_", with: " ")
            .replacingOccurrences(of: "-", with: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)

        var readable = cleaned
            .unicodeScalars
            .reduce("") { result, scalar in
                if scalar.properties.isUppercase && !result.isEmpty && result.last != " " {
                    return result + " " + String(scalar)
                }
                return result + String(scalar)
            }
            .trimmingCharacters(in: .whitespacesAndNewlines)

        while readable.contains("  ") {
            readable = readable.replacingOccurrences(of: "  ", with: " ")
        }

        return readable
    }

    private func prettifyFileName(_ fileName: String, section: String, index: Int) -> String {
        let readable = prettifiedTitle(fileName)

        if readable.count >= 2 && !isNumericOnly(readable) {
            return readable
        }
        return fallbackFlatTitle(for: section, index: index)
    }

    private func fallbackFlatTitle(for section: String, index: Int) -> String {
        switch section {
        case "Skins":
            return "Skin \(index + 1)"
        case "Codes":
            return "Code \(index + 1)"
        case "Mods":
            return "Mod \(index + 1)"
        case "Categories Cover":
            return "Category \(index + 1)"
        case "Editor":
            return "Item \(index + 1)"
        case "LookBook":
            return "Look \(index + 1)"
        default:
            return "\(section) \(index + 1)"
        }
    }

    private func makeDropboxPath(folderPath: String, fileName: String) -> String {
        fileName.hasPrefix("http") ? fileName : "\(folderPath)/\(fileName)"
    }

    private func isNumericOnly(_ value: String) -> Bool {
        !value.isEmpty && value.allSatisfy(\.isNumber)
    }

    private func isLikelyCode(_ value: String) -> Bool {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.contains(" "), trimmed.count <= 14 else { return false }
        let allowed = CharacterSet.alphanumerics
        let scalarSet = CharacterSet(charactersIn: trimmed)
        return allowed.isSuperset(of: scalarSet) && trimmed.contains(where: \.isNumber)
    }

    private func isSuspiciousDisplayTitle(_ value: String) -> Bool {
        let trimmed = prettifiedTitle(value)
        guard !trimmed.isEmpty else { return true }
        guard !hasImageExtension(trimmed) else { return true }
        guard !trimmed.lowercased().hasSuffix(".rbxmod") else { return true }
        guard !isNumericOnly(trimmed) else { return true }
        guard !isLikelyCode(trimmed) else { return true }

        let tokens = trimmed.split(whereSeparator: \.isWhitespace).map(String.init)
        let alphaTokens = tokens.filter { token in
            token.contains(where: \.isLetter) && !token.contains(where: \.isNumber)
        }
        let hasLongAlphaWord = alphaTokens.contains { $0.count >= 4 }

        if trimmed.contains(where: \.isNumber) && !hasLongAlphaWord {
            return true
        }

        let lettersOnly = trimmed.lowercased().filter(\.isLetter)
        let vowelCount = lettersOnly.filter { "aeiou".contains($0) }.count
        let isUppercaseAcronym = !trimmed.isEmpty && trimmed.allSatisfy { !$0.isLetter || $0.isUppercase }

        if tokens.count == 1, lettersOnly.count >= 6, vowelCount <= 1, !isUppercaseAcronym {
            return true
        }

        return false
    }

    private func cleanDisplayTitleCandidate(_ value: String?) -> String? {
        guard let value else { return nil }
        let cleaned = prettifiedTitle(value)
        guard !isSuspiciousDisplayTitle(cleaned) else { return nil }
        return cleaned
    }

    private func lastPathComponent(from value: String) -> String {
        let withoutQuery = value.components(separatedBy: "?").first ?? value
        if let url = URL(string: withoutQuery), let last = url.pathComponents.last, !last.isEmpty {
            return last
        }
        return NSString(string: withoutQuery).lastPathComponent
    }

    private func resolvedCardTitle(
        rawTitle: String?,
        fallbackKey: String?,
        imagePath: String,
        section: String,
        index: Int
    ) -> String {
        if let title = cleanDisplayTitleCandidate(rawTitle) {
            return title
        }

        if let keyTitle = cleanDisplayTitleCandidate(fallbackKey) {
            return keyTitle
        }

        if section == "Skins" || section == "Codes" || section == "Mods" || section == "Categories Cover" {
            return fallbackFlatTitle(for: section, index: index)
        }

        let imageTitle = prettifyFileName(lastPathComponent(from: imagePath), section: section, index: index)
        if let cleanImageTitle = cleanDisplayTitleCandidate(imageTitle) {
            return cleanImageTitle
        }

        return fallbackFlatTitle(for: section, index: index)
    }

    private func sanitizeSectionItems(_ items: [ContentItem], section: String) -> [ContentItem] {
        items.enumerated().map { index, item in
            var sanitized = item
            let imageSource = item.dropboxImagePath.isEmpty ? item.imageUrl : item.dropboxImagePath
            let fallbackKey = item.subtitle == section ? nil : item.subtitle
            sanitized.title = resolvedCardTitle(
                rawTitle: item.title,
                fallbackKey: fallbackKey,
                imagePath: imageSource,
                section: section,
                index: index
            )
            return sanitized
        }
    }

    private func sanitizeSections(_ sections: [String: [ContentItem]]) -> [String: [ContentItem]] {
        sections.mapValues { items in
            sanitizeSectionItems(items, section: items.first?.section ?? "")
        }
    }

    private func preferredTitleKeys(for section: String) -> [String] {
        switch section {
        case "Skins":
            return ["kN8TYnBl"]
        case "Codes":
            return ["qoS5HpJN"]
        case "Mods":
            return ["gAGNrv4u"]
        case "Categories Cover":
            return ["4fhjfskks"]
        default:
            return []
        }
    }

    private func preferredImageKeys(for section: String) -> [String] {
        switch section {
        case "Skins":
            return ["YjSNRsz1"]
        case "Codes":
            return ["HlKaY83N"]
        case "Mods":
            return ["hXEcVr4Z"]
        case "Categories Cover":
            return ["45gdscc"]
        default:
            return []
        }
    }

    private func detectTitle(in dict: [String: Any], section: String) -> String? {
        for key in preferredTitleKeys(for: section) {
            if let title = cleanDisplayTitleCandidate(dict[key] as? String) {
                return title
            }
        }

        let candidates = dict.values.compactMap { $0 as? String }
            .compactMap(cleanDisplayTitleCandidate)
            .filter { $0.count >= 2 && $0.count <= 120 }

        if let spaced = candidates.first(where: { $0.contains(" ") }) {
            return spaced
        }

        return candidates.first
    }

    private func detectImageList(in dict: [String: Any], section: String) -> [String] {
        for key in preferredImageKeys(for: section) {
            if let arr = dict[key] as? [String], let first = arr.first, hasImageExtension(first) {
                return arr
            }
            if let str = dict[key] as? String, hasImageExtension(str) {
                return [str]
            }
        }

        for value in dict.values {
            if let arr = value as? [String], let first = arr.first, hasImageExtension(first) {
                return arr
            }
            if let str = value as? String, hasImageExtension(str) {
                return [str]
            }
        }
        return []
    }

    private func parseNamedImageCollections(
        json: Any,
        section: String,
        folderPath: String,
        category: String? = nil,
        parentKey: String? = nil,
        items: inout [ContentItem]
    ) {
        if let dict = json as? [String: Any] {
            let images = detectImageList(in: dict, section: section)
            if let image = images.first {
                let title = resolvedCardTitle(
                    rawTitle: detectTitle(in: dict, section: section),
                    fallbackKey: parentKey,
                    imagePath: image,
                    section: section,
                    index: items.count
                )
                let subtitle = category ?? section
                items.append(
                    ContentItem(
                        id: "\(section)-\(subtitle)-\(title)",
                        title: title,
                        subtitle: subtitle,
                        imageUrl: makeDropboxPath(folderPath: folderPath, fileName: image),
                        dropboxImagePath: makeDropboxPath(folderPath: folderPath, fileName: image),
                        section: section
                    )
                )
                return
            }

            for (key, value) in dict {
                let nextCategory = (value is [String: Any] || value is [[String: Any]]) ? (category ?? key) : category
                parseNamedImageCollections(json: value, section: section, folderPath: folderPath, category: nextCategory, parentKey: key, items: &items)
            }
            return
        }

        if let arr = json as? [Any] {
            for (index, value) in arr.enumerated() {
                parseNamedImageCollections(json: value, section: section, folderPath: folderPath, category: category, parentKey: parentKey ?? "\(section) \(index + 1)", items: &items)
            }
        }
    }

    private func parseCategoriesCover(
        json: Any,
        folderPath: String,
        parentGroup: String? = nil,
        items: inout [ContentItem]
    ) {
        if let dict = json as? [String: Any] {
            let image = detectImageList(in: dict, section: "Categories Cover").first
            let title = detectTitle(in: dict, section: "Categories Cover")

            if let title, let image {
                items.append(
                    ContentItem(
                        id: "Categories Cover-\(parentGroup ?? "General")-\(title)",
                        title: title,
                        subtitle: parentGroup ?? "Categories Cover",
                        imageUrl: makeDropboxPath(folderPath: folderPath, fileName: image),
                        dropboxImagePath: makeDropboxPath(folderPath: folderPath, fileName: image),
                        section: "Categories Cover"
                    )
                )
                return
            }

            for (key, value) in dict {
                let nextGroup = parentGroup ?? key
                parseCategoriesCover(json: value, folderPath: folderPath, parentGroup: nextGroup, items: &items)
            }
            return
        }

        if let arr = json as? [Any] {
            for value in arr {
                parseCategoriesCover(json: value, folderPath: folderPath, parentGroup: parentGroup, items: &items)
            }
        }
    }

    private func parsePreviewIconCollections(
        json: Any,
        section: String,
        folderPath: String,
        currentCategory: String? = nil,
        items: inout [ContentItem]
    ) {
        if let dict = json as? [String: Any] {
            let filenames = dict.values.compactMap { $0 as? String }.filter { hasImageExtension($0) }
            if !filenames.isEmpty {
                let preview = filenames.first(where: { $0.lowercased().contains("prew") || $0.lowercased().contains("prev") || $0.lowercased().contains("preview") }) ?? filenames.first!
                let texture = filenames.first(where: { $0.lowercased().contains("icon") }) ?? filenames.last!
                let title = currentCategory ?? section
                items.append(
                    ContentItem(
                        id: "\(section)-\(title)-\(items.count + 1)",
                        title: title,
                        subtitle: currentCategory ?? section,
                        imageUrl: makeDropboxPath(folderPath: folderPath, fileName: preview),
                        dropboxImagePath: makeDropboxPath(folderPath: folderPath, fileName: texture),
                        section: section
                    )
                )
                return
            }

            for (key, value) in dict {
                let nextCategory = value is [Any] ? key : currentCategory
                parsePreviewIconCollections(json: value, section: section, folderPath: folderPath, currentCategory: nextCategory, items: &items)
            }
            return
        }

        if let arr = json as? [Any] {
            for value in arr {
                parsePreviewIconCollections(json: value, section: section, folderPath: folderPath, currentCategory: currentCategory, items: &items)
            }
        }
    }

    private func parseEditorItems(json: Any, folderPath: String, items: inout [ContentItem]) {
        guard let dict = json as? [String: Any] else {
            if let arr = json as? [Any] {
                for value in arr {
                    parseEditorItems(json: value, folderPath: folderPath, items: &items)
                }
            }
            return
        }

        if let title = dict["egdccxsa"] as? String,
           let entryArray = dict["3gevsss"] as? [[String: Any]] {
            for (index, imageDict) in entryArray.enumerated() {
                let imageNames = imageDict.values.compactMap { $0 as? String }.filter { hasImageExtension($0) }
                guard let image = imageNames.first else { continue }
                items.append(
                    ContentItem(
                        id: "Editor Items-\(title)-\(index)",
                        title: title,
                        subtitle: "Textures",
                        imageUrl: makeDropboxPath(folderPath: folderPath, fileName: image),
                        dropboxImagePath: makeDropboxPath(folderPath: folderPath, fileName: image),
                        section: "Editor Items"
                    )
                )
            }
            return
        }

        if let clothPreview = dict["34rfdsfsc"] as? String,
           let clothIcon = dict["4grvsdccaa"] as? String {
            items.append(
                ContentItem(
                    id: "Editor Items-Cloth-\(items.count + 1)",
                    title: "Cloth",
                    subtitle: "Cloth",
                    imageUrl: makeDropboxPath(folderPath: folderPath, fileName: clothPreview),
                    dropboxImagePath: makeDropboxPath(folderPath: folderPath, fileName: clothIcon),
                    section: "Editor Items"
                )
            )
            return
        }

        if let accessoryIcon = dict["4grvsdccaa"] as? String {
            items.append(
                ContentItem(
                    id: "Editor Items-Accessories-\(items.count + 1)",
                    title: "Accessory",
                    subtitle: "Accessories",
                    imageUrl: makeDropboxPath(folderPath: folderPath, fileName: accessoryIcon),
                    dropboxImagePath: makeDropboxPath(folderPath: folderPath, fileName: accessoryIcon),
                    section: "Editor Items"
                )
            )
            return
        }

        if let stickersRoot = dict["3gevsss"] as? [String: Any] {
            for (stickerGroup, values) in stickersRoot {
                guard let stickerItems = values as? [[String: Any]] else { continue }
                for (index, stickerDict) in stickerItems.enumerated() {
                    let imageNames = stickerDict.values.compactMap { $0 as? String }.filter { hasImageExtension($0) }
                    guard let image = imageNames.first else { continue }
                    items.append(
                        ContentItem(
                            id: "Editor Items-Stickers-\(stickerGroup)-\(index)",
                            title: stickerGroup,
                            subtitle: "Stickers",
                            imageUrl: makeDropboxPath(folderPath: folderPath, fileName: image),
                            dropboxImagePath: makeDropboxPath(folderPath: folderPath, fileName: image),
                            section: "Editor Items"
                        )
                    )
                }
            }
            return
        }

        for (_, value) in dict {
            parseEditorItems(json: value, folderPath: folderPath, items: &items)
        }
    }

    private func parseSectionItems(json: Any, section: String, folderPath: String) -> [ContentItem] {
        var items: [ContentItem] = []

        switch section {
        case "Skins", "Codes", "Mods":
            parseNamedImageCollections(json: json, section: section, folderPath: folderPath, items: &items)
        case "Categories Cover":
            parseCategoriesCover(json: json, folderPath: folderPath, items: &items)
        case "LookBook", "Editor":
            parsePreviewIconCollections(json: json, section: section, folderPath: folderPath, items: &items)
        case "Editor Items":
            parseEditorItems(json: json, folderPath: folderPath, items: &items)
        default:
            break
        }

        log("Parsed \(items.count) items for section \(section)")
        if items.isEmpty {
            log("Section \(section) produced 0 parsed items from \(folderPath)")
        } else {
            log("Section \(section) sample items: \(sampleItemsDescription(items))")
        }
        return sanitizeSectionItems(items, section: section)
    }

    private func parseFlatFolderEntries(_ entries: [[String: Any]], section: String, folderPath: String) -> [ContentItem] {
        let fileNames = entries.compactMap { entry -> String? in
            guard entry[".tag"] as? String == "file" else { return nil }
            return entry["name"] as? String
        }

        switch section {
        case "Skins", "Codes", "Mods":
            let images = fileNames.filter(hasImageExtension(_:)).sorted()
            return images.enumerated().map { index, image in
                let prettyTitle = prettifyFileName(image, section: section, index: index)
                return ContentItem(
                    id: "\(section)-flat-\(index)",
                    title: prettyTitle,
                    subtitle: section,
                    imageUrl: makeDropboxPath(folderPath: folderPath, fileName: image),
                    dropboxImagePath: makeDropboxPath(folderPath: folderPath, fileName: image),
                    section: section
                )
            }

        case "Editor", "LookBook":
            let previews = fileNames.filter { $0.lowercased().hasPrefix("prew") }.sorted()
            let icons = fileNames.filter { $0.lowercased().hasPrefix("icon") }.sorted()
            var iconLookup: [String: String] = [:]
            for fileName in icons {
                let key = flatPairKey(
                    prefix: prefixWithoutTrailingNumber(fileName),
                    number: trailingNumber(in: fileName)
                )
                if iconLookup[key] == nil {
                    iconLookup[key] = fileName
                }
            }

            return previews.enumerated().map { index, preview in
                let key = flatPairKey(
                    prefix: prefixWithoutTrailingNumber(preview).replacingOccurrences(of: "Prew", with: "Icon"),
                    number: trailingNumber(in: preview)
                )
                let fallbackIcon = icons.indices.contains(index) ? icons[index] : preview
                let icon = iconLookup[key] ?? fallbackIcon
                let title = prefixWithoutTrailingNumber(preview)
                    .replacingOccurrences(of: "Prew", with: "")
                    .replacingOccurrences(of: "TShort", with: "T-Shirt")
                let resolvedTitle = title.isEmpty ? section : title
                return ContentItem(
                    id: "\(section)-flat-\(index)",
                    title: resolvedTitle,
                    subtitle: section,
                    imageUrl: makeDropboxPath(folderPath: folderPath, fileName: preview),
                    dropboxImagePath: makeDropboxPath(folderPath: folderPath, fileName: icon),
                    section: section
                )
            }

        case "Editor Items":
            let textures = fileNames.filter { fileStem($0).lowercased().hasPrefix("texture") }.sorted()
            let stickers = fileNames.filter { fileStem($0).lowercased().hasPrefix("stickers") }.sorted()
            let accessories = fileNames.filter {
                let lower = fileStem($0).lowercased()
                return lower.hasPrefix("accessories") || lower.hasPrefix("prewbackpack") || lower.hasPrefix("iconbackpac")
            }.sorted()

            let textureItems = textures.enumerated().map { index, image in
                ContentItem(
                    id: "EditorItems-texture-\(index)",
                    title: "Texture \(index + 1)",
                    subtitle: "Textures",
                    imageUrl: makeDropboxPath(folderPath: folderPath, fileName: image),
                    dropboxImagePath: makeDropboxPath(folderPath: folderPath, fileName: image),
                    section: section
                )
            }

            let stickerItems = stickers.enumerated().map { index, image in
                ContentItem(
                    id: "EditorItems-sticker-\(index)",
                    title: "Sticker \(index + 1)",
                    subtitle: "Stickers",
                    imageUrl: makeDropboxPath(folderPath: folderPath, fileName: image),
                    dropboxImagePath: makeDropboxPath(folderPath: folderPath, fileName: image),
                    section: section
                )
            }

            let accessoryItems = accessories.enumerated().map { index, image in
                ContentItem(
                    id: "EditorItems-accessory-\(index)",
                    title: "Accessory \(index + 1)",
                    subtitle: "Accessories",
                    imageUrl: makeDropboxPath(folderPath: folderPath, fileName: image),
                    dropboxImagePath: makeDropboxPath(folderPath: folderPath, fileName: image),
                    section: section
                )
            }

            return textureItems + stickerItems + accessoryItems

        case "Categories Cover":
            let images = fileNames.filter(hasImageExtension(_:)).sorted()
            return images.enumerated().map { index, image in
                ContentItem(
                    id: "CategoriesCover-flat-\(index)",
                    title: prettifyFileName(image, section: section, index: index),
                    subtitle: "Categories Cover",
                    imageUrl: makeDropboxPath(folderPath: folderPath, fileName: image),
                    dropboxImagePath: makeDropboxPath(folderPath: folderPath, fileName: image),
                    section: section
                )
            }

        default:
            return []
        }
    }

    // MARK: - Load all sections

    func loadAllSections(forceRefresh: Bool = false) async -> [String: [ContentItem]] {
        if !forceRefresh,
           let cachedSectionsAt,
           Date().timeIntervalSince(cachedSectionsAt) < sectionsCacheTTL,
           totalItemCount(in: cachedSections) > 0 {
            log("Returning cached sections: \(cachedSections.map { "\($0.key)=\($0.value.count)" }.joined(separator: ", "))")
            return sanitizeSections(cachedSections)
        }

        if !forceRefresh,
           let diskCached = loadSectionsFromDiskIfFresh(),
           totalItemCount(in: diskCached.sections) > 0 {
            cachedSections = diskCached.sections
            cachedSectionsAt = diskCached.savedAt
            log("Returning disk-cached sections: \(diskCached.sections.map { "\($0.key)=\($0.value.count)" }.joined(separator: ", "))")
            return diskCached.sections
        }

        if let inFlightSectionsLoad {
            log("Joining in-flight Dropbox content load")
            return await inFlightSectionsLoad.value
        }

        let loadID = UUID()
        let task = Task { await self.performFullSectionsLoad() }
        inFlightSectionsLoad = task
        inFlightSectionsLoadID = loadID

        let sections = await task.value
        if inFlightSectionsLoadID == loadID {
            inFlightSectionsLoad = nil
            inFlightSectionsLoadID = nil
        }
        return sections
    }

    private func performFullSectionsLoad() async -> [String: [ContentItem]] {
        var result: [String: [ContentItem]] = [:]
        log("Starting full Dropbox content load")

        do {
            let rootEntries = try await listFolder(path: Self.rootFolder)
            let rootFolderNames = rootEntries.compactMap { $0["name"] as? String }
            log("Root folder entries: \(rootFolderNames.joined(separator: ", "))")
            let sectionsToLoad: [(name: String, folderPath: String, jsonPath: String)] = rootEntries.compactMap { entry in
                guard let name = entry["name"] as? String,
                      entry[".tag"] as? String == "folder" else { return nil }

                let folderKey = name.components(separatedBy: "-").first ?? name
                guard let sectionName = Self.folderMap[folderKey] else { return nil }

                let folderPath = "\(Self.rootFolder)/\(name)"
                return (sectionName, folderPath, "\(folderPath)/content.json")
            }
            log("Mapped Dropbox sections: \(sectionsToLoad.map { "\($0.name) -> \($0.folderPath)" }.joined(separator: " | "))")

            await withTaskGroup(of: (String, [ContentItem]).self) { group in
                for section in sectionsToLoad {
                    group.addTask {
                        await self.loadSection(
                            named: section.name,
                            folderPath: section.folderPath,
                            jsonPath: section.jsonPath
                        )
                    }
                }

                for await (sectionName, items) in group {
                    result[sectionName] = items
                }
            }
        } catch {
            log("loadAllSections fatal error: \(error)")
        }

        let totalItems = totalItemCount(in: result)

        if totalItems > 0 {
            let sanitizedResult = sanitizeSections(result)
            cachedSections = sanitizedResult
            cachedSectionsAt = Date()
            saveSectionsToDisk(sanitizedResult, savedAt: cachedSectionsAt ?? Date())
            log("Finished full load: \(sanitizedResult.map { "\($0.key)=\($0.value.count)" }.sorted().joined(separator: ", "))")
            return sanitizedResult
        }

        log("Full load returned 0 items; keeping previous cache if available")
        log("0-item result keys: \(result.keys.sorted().joined(separator: ", "))")
        if totalItemCount(in: cachedSections) > 0 {
            return cachedSections
        }

        return result
    }

    func cachedSectionsSnapshot(includeStaleDisk: Bool = true) -> [String: [ContentItem]] {
        if totalItemCount(in: cachedSections) > 0 {
            return sanitizeSections(cachedSections)
        }

        guard includeStaleDisk,
              let data = try? Data(contentsOf: sectionsDiskCacheURL),
              let payload = try? JSONDecoder().decode(SectionsDiskCache.self, from: data),
              totalItemCount(in: payload.sections) > 0 else {
            return [:]
        }

        cachedSections = sanitizeSections(payload.sections)
        cachedSectionsAt = payload.savedAt
        log("Returning stale disk snapshot: \(payload.sections.map { "\($0.key)=\($0.value.count)" }.joined(separator: ", "))")
        return cachedSections
    }

    private func loadSection(named sectionName: String, folderPath: String, jsonPath: String) async -> (String, [ContentItem]) {
        log("Loading section \(sectionName) from \(jsonPath)")

        do {
            let json = try await loadJSONObject(path: jsonPath)
            log("Section \(sectionName) JSON root type: \(String(describing: type(of: json)))")
            let items = parseSectionItems(json: json, section: sectionName, folderPath: folderPath)
            log("Section \(sectionName) loaded with \(items.count) items")
            if !items.isEmpty {
                return (sectionName, items)
            }
            log("Section \(sectionName) JSON parsed empty, falling back to flat folder listing")
        } catch {
            log("Failed to load section \(sectionName) JSON: \(error). Falling back to flat folder listing.")
        }

        do {
            let entries = try await listFolder(path: folderPath)
            let items = parseFlatFolderEntries(entries, section: sectionName, folderPath: folderPath)
            log("Section \(sectionName) fallback flat parse produced \(items.count) items")
            if items.isEmpty {
                log("Section \(sectionName) fallback entries sample: \(entries.prefix(8).compactMap { $0["name"] as? String }.joined(separator: ", "))")
            } else {
                log("Section \(sectionName) fallback sample items: \(sampleItemsDescription(items))")
            }
            return (sectionName, items)
        } catch {
            log("Failed to load section \(sectionName) from folder listing: \(error)")
            return (sectionName, [])
        }
    }

    private func loadSectionsFromDiskIfFresh() -> (sections: [String: [ContentItem]], savedAt: Date)? {
        guard let data = try? Data(contentsOf: sectionsDiskCacheURL),
              let payload = try? JSONDecoder().decode(SectionsDiskCache.self, from: data) else {
            return nil
        }

        guard Date().timeIntervalSince(payload.savedAt) < sectionsCacheTTL else {
            return nil
        }

        return (sanitizeSections(payload.sections), payload.savedAt)
    }

    private func saveSectionsToDisk(_ sections: [String: [ContentItem]], savedAt: Date) {
        let payload = SectionsDiskCache(savedAt: savedAt, sections: sections)
        guard let data = try? JSONEncoder().encode(payload) else { return }
        try? data.write(to: sectionsDiskCacheURL, options: .atomic)
    }
}

private struct SectionsDiskCache: Codable {
    let savedAt: Date
    let sections: [String: [ContentItem]]
}
