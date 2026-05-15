import SwiftUI

struct AvatarView: View {
    let url: String?
    let name: String
    var size: CGFloat = 44

    @State private var image: UIImage?

    init(url: String?, name: String, size: CGFloat = 44) {
        self.url = url
        self.name = name
        self.size = size
        if let url {
            _image = State(initialValue: ImageCacheManager.cachedImage(for: url, maxPixel: max(160, size * 3)))
        }
    }

    var body: some View {
        Group {
            if let img = image {
                Image(uiImage: img)
                    .resizable()
                    .scaledToFill()
                    .frame(width: size, height: size)
                    .clipShape(Circle())
            } else {
                Circle()
                    .fill(Color.accentPrimary.opacity(0.15))
                    .frame(width: size, height: size)
                    .overlay(
                        Text(String(name.prefix(1)).uppercased())
                            .font(.system(size: size * 0.4, weight: .bold, design: .rounded))
                            .foregroundColor(.accentPrimary)
                    )
            }
        }
        .task(id: url) {
            guard let url, let parsed = URL(string: url) else { return }
            image = await ImageCacheManager.shared.image(for: parsed.absoluteString, maxPixel: max(160, size * 3))
        }
    }
}
