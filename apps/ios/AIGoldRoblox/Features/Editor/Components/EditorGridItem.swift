import SwiftUI
import UIKit

final class ConstrainedImageLoader: ObservableObject {
    @Published var image: UIImage?
    private var task: URLSessionDataTask?

    static let session: URLSession = {
        let config = URLSessionConfiguration.default
        config.httpMaximumConnectionsPerHost = 4
        return URLSession(configuration: config)
    }()

    func load(url: URL) {
        cancel()
        task = Self.session.dataTask(with: url) { [weak self] data, _, _ in
            guard let self, let data, let img = UIImage(data: data) else { return }
            DispatchQueue.main.async {
                self.image = img
            }
        }
        task?.resume()
    }

    func cancel() {
        task?.cancel()
        task = nil
    }
}

struct SafeImageView: View {
    let url: URL
    var contentMode: ContentMode = .fit

    @StateObject private var loader = ConstrainedImageLoader()

    var body: some View {
        Group {
            if let img = loader.image {
                Image(uiImage: img)
                    .resizable()
                    .aspectRatio(contentMode: contentMode)
            } else {
                ProgressView()
            }
        }
        .onAppear { loader.load(url: url) }
        .onDisappear { loader.cancel() }
    }
}

struct EditorGridItem: View {
    let imagePath: String
    let isSelected: Bool
    var accentColor: Color = .accentPrimary

    @State private var resolvedURL: URL?
    @State private var isLoading = true

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 8)
                .fill(Color.cardBackground)
                .shimmerPlaceholder(isLoading: isLoading)

            if let resolvedURL {
                SafeImageView(url: resolvedURL, contentMode: .fill)
                    .frame(minWidth: 0, maxWidth: .infinity, minHeight: 0, maxHeight: .infinity)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .onAppear { isLoading = false }
            } else if !isLoading {
                Image(systemName: "photo")
                    .foregroundColor(.textTertiary)
            }
        }
        .frame(height: 80)
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(isSelected ? accentColor : Color.clear, lineWidth: 2)
        )
        .task(id: imagePath) {
            isLoading = true
            if imagePath.hasPrefix("http"), let url = URL(string: imagePath) {
                resolvedURL = url
            } else {
                resolvedURL = try? await DropboxService.shared.getTemporaryLink(forPath: imagePath)
            }
            isLoading = false
        }
    }
}
