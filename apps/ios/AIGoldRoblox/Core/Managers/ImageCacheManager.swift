import UIKit
import CryptoKit
import Photos

struct ExportableAssetFile {
    let data: Data
    let fileExtension: String
}

final class ImageSaveCoordinator: NSObject {
    let completion: (PhotoSaveResult) -> Void

    init(completion: @escaping (PhotoSaveResult) -> Void) {
        self.completion = completion
    }

    @objc func image(_ image: UIImage, didFinishSavingWithError error: Error?, contextInfo: UnsafeMutableRawPointer?) {
        let result: PhotoSaveResult = error == nil ? .success : .failed
        DispatchQueue.main.async {
            self.completion(result)
        }
        if let contextInfo {
            Unmanaged<ImageSaveCoordinator>.fromOpaque(contextInfo).release()
        }
    }
}

enum PhotoSaveResult {
    case success
    case denied
    case failed

    var message: String {
        switch self {
        case .success:
            return "Saved to Photos."
        case .denied:
            return "Allow photo access in Settings to save images."
        case .failed:
            return "Failed to save image."
        }
    }
}

enum ImageSaver {
    static func saveToPhotos(_ image: UIImage, completion: @escaping (PhotoSaveResult) -> Void) {
        let status = PHPhotoLibrary.authorizationStatus(for: .addOnly)
        switch status {
        case .authorized, .limited:
            performSave(image, completion: completion)
        case .notDetermined:
            PHPhotoLibrary.requestAuthorization(for: .addOnly) { newStatus in
                DispatchQueue.main.async {
                    switch newStatus {
                    case .authorized, .limited:
                        performSave(image, completion: completion)
                    default:
                        completion(.denied)
                    }
                }
            }
        default:
            DispatchQueue.main.async {
                completion(.denied)
            }
        }
    }

    private static func performSave(_ image: UIImage, completion: @escaping (PhotoSaveResult) -> Void) {
        let coordinator = ImageSaveCoordinator(completion: completion)
        let retained = Unmanaged.passRetained(coordinator)
        UIImageWriteToSavedPhotosAlbum(
            image,
            coordinator,
            #selector(ImageSaveCoordinator.image(_:didFinishSavingWithError:contextInfo:)),
            retained.toOpaque()
        )
    }
}

final class SharedImageMemoryCache {
    static let shared = SharedImageMemoryCache()

    private let cache = NSCache<NSString, UIImage>()

    private init() {
        cache.countLimit = 200
        cache.totalCostLimit = 80 * 1024 * 1024
    }

    func image(forKey key: String) -> UIImage? {
        cache.object(forKey: key as NSString)
    }

    func store(_ image: UIImage, forKey key: String, cost: Int = 0) {
        cache.setObject(image, forKey: key as NSString, cost: cost)
    }

    func clear() {
        cache.removeAllObjects()
    }
}

actor ImageCacheManager {
    static let shared = ImageCacheManager()

    private let session: URLSession
    private var inFlight: [String: Task<UIImage?, Error>] = [:]
    private let cacheDirectory: URL
    private let diskCacheTTL: TimeInterval = 60 * 60 * 24 * 7
    private let defaultDisplayMaxPixel: CGFloat = 1024

    static func cachedImage(for urlString: String, maxPixel: CGFloat = 1024) -> UIImage? {
        SharedImageMemoryCache.shared.image(forKey: memoryKey(for: urlString, maxPixel: maxPixel))
    }

    private init() {
        let config = URLSessionConfiguration.default
        config.httpMaximumConnectionsPerHost = 3
        config.timeoutIntervalForRequest = 15
        config.requestCachePolicy = .returnCacheDataElseLoad
        config.urlCache = URLCache(
            memoryCapacity: 24 * 1024 * 1024,
            diskCapacity: 160 * 1024 * 1024,
            diskPath: "AIGoldRobloxURLImageCache"
        )
        session = URLSession(configuration: config)
        let cachesRoot = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true)
        cacheDirectory = cachesRoot.appendingPathComponent("AIGoldRobloxImageCache", isDirectory: true)
        try? FileManager.default.createDirectory(at: cacheDirectory, withIntermediateDirectories: true)
    }

    func image(for urlString: String, maxPixel: CGFloat? = nil) async -> UIImage? {
        let targetMaxPixel = maxPixel ?? defaultDisplayMaxPixel
        let memoryKey = Self.memoryKey(for: urlString, maxPixel: targetMaxPixel)

        if let cached = SharedImageMemoryCache.shared.image(forKey: memoryKey) {
            return cached
        }

        if let diskCached = loadImageFromDisk(for: urlString, maxPixel: targetMaxPixel) {
            SharedImageMemoryCache.shared.store(diskCached, forKey: memoryKey, cost: imageCost(diskCached))
            return diskCached
        }

        if let existing = inFlight[memoryKey] {
            return try? await existing.value
        }

        let task = Task<UIImage?, Error> {
            defer { inFlight[memoryKey] = nil }

            var finalURL: URL?

            if urlString.hasPrefix("http") {
                finalURL = URL(string: urlString)
            } else {
                finalURL = try? await DropboxService.shared.getTemporaryLink(forPath: urlString)
            }

            guard let url = finalURL else { return nil }

            let (data, _) = try await session.data(from: url)
            guard let decoded = self.displayImage(from: data, maxPixel: targetMaxPixel) else { return nil }

            SharedImageMemoryCache.shared.store(decoded, forKey: memoryKey, cost: imageCost(decoded))
            self.storeImageDataOnDisk(data, for: urlString, resolvedURL: url)
            return decoded
        }

        inFlight[memoryKey] = task
        return try? await task.value
    }

    func prefetch(_ urlStrings: [String], maxCount: Int = 5, maxPixel: CGFloat? = nil) {
        guard maxCount > 0 else { return }

        let targetMaxPixel = maxPixel ?? defaultDisplayMaxPixel
        var seen = Set<String>()
        var scheduled = 0

        for urlString in urlStrings where !urlString.isEmpty {
            guard seen.insert(urlString).inserted else { continue }
            let memoryKey = Self.memoryKey(for: urlString, maxPixel: targetMaxPixel)
            guard SharedImageMemoryCache.shared.image(forKey: memoryKey) == nil,
                  inFlight[memoryKey] == nil else {
                continue
            }

            scheduled += 1
            Task(priority: .utility) {
                _ = await ImageCacheManager.shared.image(for: urlString, maxPixel: targetMaxPixel)
            }

            if scheduled >= maxCount {
                break
            }
        }
    }

    func exportableFile(for urlString: String) async throws -> ExportableAssetFile {
        if let cachedFile = loadFileDataFromDisk(for: urlString) {
            return cachedFile
        }

        guard let resolvedURL = try await resolvedURL(for: urlString) else {
            throw URLError(.badURL)
        }

        let (data, _) = try await session.data(from: resolvedURL)
        let fileExtension = fileExtension(for: urlString, resolvedURL: resolvedURL)
        storeRawDataOnDisk(data, for: urlString, fileExtension: fileExtension)
        return ExportableAssetFile(data: data, fileExtension: fileExtension)
    }

    private func resolvedURL(for urlString: String) async throws -> URL? {
        if urlString.hasPrefix("http") {
            return URL(string: urlString)
        }
        return try await DropboxService.shared.getTemporaryLink(forPath: urlString)
    }

    private func fileExtension(for urlString: String, resolvedURL: URL) -> String {
        let source = urlString.hasPrefix("http") ? resolvedURL.pathExtension : NSString(string: urlString).pathExtension
        let ext = source.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return ext.isEmpty ? "png" : ext
    }

    private func loadImageFromDisk(for urlString: String, maxPixel: CGFloat) -> UIImage? {
        guard let file = cachedFileURL(for: urlString),
              let data = try? Data(contentsOf: file) else {
            return nil
        }
        return displayImage(from: data, maxPixel: maxPixel)
    }

    private func loadFileDataFromDisk(for urlString: String) -> ExportableAssetFile? {
        guard let file = cachedFileURL(for: urlString),
              let data = try? Data(contentsOf: file) else {
            return nil
        }
        return ExportableAssetFile(data: data, fileExtension: file.pathExtension.isEmpty ? "png" : file.pathExtension)
    }

    private func storeImageDataOnDisk(_ data: Data, for urlString: String, resolvedURL: URL) {
        storeRawDataOnDisk(data, for: urlString, fileExtension: fileExtension(for: urlString, resolvedURL: resolvedURL))
    }

    private func storeRawDataOnDisk(_ data: Data, for urlString: String, fileExtension: String) {
        let fileURL = cacheDirectory.appendingPathComponent("\(cacheKey(for: urlString)).\(fileExtension)")
        try? data.write(to: fileURL, options: .atomic)
    }

    private func cachedFileURL(for urlString: String) -> URL? {
        let key = cacheKey(for: urlString)
        let fileManager = FileManager.default
        guard let file = try? fileManager.contentsOfDirectory(
            at: cacheDirectory,
            includingPropertiesForKeys: [.contentModificationDateKey],
            options: [.skipsHiddenFiles]
        ).first(where: { $0.deletingPathExtension().lastPathComponent == key }) else {
            return nil
        }

        guard let values = try? file.resourceValues(forKeys: [.contentModificationDateKey]),
              let modifiedAt = values.contentModificationDate,
              Date().timeIntervalSince(modifiedAt) < diskCacheTTL else {
            try? fileManager.removeItem(at: file)
            return nil
        }

        return file
    }

    private func cacheKey(for value: String) -> String {
        let digest = SHA256.hash(data: Data(value.utf8))
        return digest.map { String(format: "%02x", $0) }.joined()
    }

    private func displayImage(from data: Data, maxPixel: CGFloat) -> UIImage? {
        let image = ImageDownsampler.downsample(data: data, maxPixel: maxPixel) ?? UIImage(data: data)
        return image?.preparingForDisplay() ?? image
    }

    private func imageCost(_ image: UIImage) -> Int {
        guard let cgImage = image.cgImage else { return 0 }
        return cgImage.bytesPerRow * cgImage.height
    }

    private static func memoryKey(for urlString: String, maxPixel: CGFloat) -> String {
        "\(urlString)#display-\(Int(maxPixel.rounded()))"
    }

    func clearCache() {
        SharedImageMemoryCache.shared.clear()
        try? FileManager.default.removeItem(at: cacheDirectory)
        try? FileManager.default.createDirectory(at: cacheDirectory, withIntermediateDirectories: true)
    }
}
