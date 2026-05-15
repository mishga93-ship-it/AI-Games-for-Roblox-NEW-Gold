//
//  ChatImageCache.swift
//  AIGoldRoblox
//
//  Session-level in-memory cache of user-attached chat images. Purpose:
//  - AsyncImage against a Firebase Storage signed URL was flaky (phase=.failure
//    for some devices/sessions even though the upload succeeded). Showing the
//    user their own selected photo should NOT depend on a backend round-trip
//    and a remote URL that might not be reachable from AsyncImage's URLSession.
//  - Instead, we cache the selected UIImage in memory, keyed by a UUID stored
//    on the ChatMessage (`localImageKey`). The chat bubble reads from this
//    cache and renders the UIImage directly — instant and reliable.
//  - Backend ingest still happens in parallel for the AI prompt anchor (the
//    signed URL is useful for server-side vision models), but UI display
//    no longer blocks on it.
//
//  Session 187 — added off-main downsampler. iPhone photos are 5–15 MB at full
//  res; encoding/uploading them base64 froze the UI. Downsampling to ≤1024px
//  JPEG q0.8 brings payload to 200–600 KB and lets vision models still read
//  details (palette, silhouette, UI cues). Cache itself is now lock-protected
//  so background tasks can `set` from `Task.detached` without main-actor hops.
//

import Foundation
import UIKit
import ImageIO

final class ChatImageCache: @unchecked Sendable {
    static let shared = ChatImageCache()
    private init() {}

    private let lock = NSLock()
    private var cache: [String: UIImage] = [:]

    /// Stores a UIImage for the given key. Overwrites any existing entry.
    /// Safe to call from any thread.
    func set(_ image: UIImage, for key: String) {
        lock.lock()
        cache[key] = image
        lock.unlock()
    }

    /// Retrieves a cached UIImage, or nil if not found (e.g. after app restart).
    /// Safe to call from any thread; SwiftUI views call this from the main thread.
    func image(for key: String) -> UIImage? {
        lock.lock()
        let value = cache[key]
        lock.unlock()
        return value
    }

    /// Clears a specific entry — call when the containing message is deleted.
    func remove(key: String) {
        lock.lock()
        cache.removeValue(forKey: key)
        lock.unlock()
    }
}

/// Downsamples an image to fit within `maxPixel` on the longest side using
/// `ImageIO`'s thumbnail API — does NOT decode the full image into RAM, which
/// is critical for HEIC/JPEG photos coming from the system PhotosPicker.
/// Run from a background context (`Task.detached`).
enum ImageDownsampler {
    static func downsample(data: Data, maxPixel: CGFloat) -> UIImage? {
        let sourceOptions = [kCGImageSourceShouldCache: false] as CFDictionary
        guard let source = CGImageSourceCreateWithData(data as CFData, sourceOptions) else {
            return nil
        }
        let thumbnailOptions: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixel,
        ]
        guard let cgImage = CGImageSourceCreateThumbnailAtIndex(source, 0, thumbnailOptions as CFDictionary) else {
            return nil
        }
        return UIImage(cgImage: cgImage)
    }

    /// Downsamples and JPEG-encodes in one pass off-main. Returns (image, jpegData).
    /// Caller picks the cache image and the upload payload from the same operation.
    static func downsampleAndEncode(data: Data, maxPixel: CGFloat, quality: CGFloat) -> (UIImage, Data)? {
        guard let image = downsample(data: data, maxPixel: maxPixel) else { return nil }
        guard let jpeg = image.jpegData(compressionQuality: quality) else { return nil }
        return (image, jpeg)
    }
}
