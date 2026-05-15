//
//  DeepLinkManager.swift
//  AIGoldRoblox
//

import Foundation

enum DeepLink: Equatable, Identifiable {
    case challenges
    case post(id: String)
    case profile(id: String)

    var id: String {
        switch self {
        case .challenges: return "challenges"
        case .post(let id): return "post-\(id)"
        case .profile(let id): return "profile-\(id)"
        }
    }
}

enum DeepLinkManager {
    static let host = "app.aigoldroblox.com"
    static let dynamicLinkHost = "aigoldroblox.page.link"

    static func parse(url: URL) -> DeepLink? {
        let components = URLComponents(url: url, resolvingAgainstBaseURL: true)
        let pathSegments = (components?.path ?? "")
            .split(separator: "/")
            .map(String.init)

        if let link = matchPath(pathSegments) {
            return link
        }

        if let linkParam = components?.queryItems?.first(where: { $0.name == "link" })?.value,
           let innerURL = URL(string: linkParam) {
            return parse(url: innerURL)
        }

        return nil
    }

    static func shareURL(for link: DeepLink) -> URL {
        switch link {
        case .challenges:
            return URL(string: "https://\(host)/challenges")!
        case .post(let id):
            return URL(string: "https://\(host)/post/\(id)")!
        case .profile(let id):
            return URL(string: "https://\(host)/profile/\(id)")!
        }
    }

    private static func matchPath(_ segments: [String]) -> DeepLink? {
        guard let first = segments.first else { return nil }

        switch first {
        case "challenge", "challenges":
            return .challenges
        case "post":
            guard segments.count >= 2 else { return nil }
            return .post(id: segments[1])
        case "profile":
            guard segments.count >= 2 else { return nil }
            return .profile(id: segments[1])
        default:
            return nil
        }
    }
}
