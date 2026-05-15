import SwiftUI

enum AppBrand {
    static let name = "Kami"
    static let subtitle = "AI Creator Studio"
    static let shortTagline = "Worlds by voice"
    static let studioName = "Kami Studio"
}

struct BrandMark: View {
    var size: CGFloat = 44

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: size * 0.28, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [.brandNight, .brandViolet, .brandElectricBlue.opacity(0.9)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )

            Circle()
                .fill(Color.brandElectricPink.opacity(0.5))
                .frame(width: size * 0.7, height: size * 0.7)
                .blur(radius: size * 0.16)
                .offset(x: -size * 0.18, y: -size * 0.2)

            Circle()
                .fill(Color.brandSolar.opacity(0.45))
                .frame(width: size * 0.5, height: size * 0.5)
                .blur(radius: size * 0.14)
                .offset(x: size * 0.22, y: size * 0.18)

            KamiMonogramShape()
                .stroke(
                    LinearGradient(
                        colors: [.white, .brandElectricBlue, .brandElectricPink, .brandSolar],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ),
                    style: StrokeStyle(lineWidth: max(5, size * 0.17), lineCap: .round, lineJoin: .round)
                )
                .padding(size * 0.2)
                .shadow(color: Color.brandElectricBlue.opacity(0.55), radius: size * 0.08)

            RoundedRectangle(cornerRadius: size * 0.28, style: .continuous)
                .stroke(
                    LinearGradient(
                        colors: [.white.opacity(0.45), .white.opacity(0.08), .brandElectricBlue.opacity(0.35)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ),
                    lineWidth: max(1, size * 0.028)
                )
        }
        .frame(width: size, height: size)
        .shadow(color: Color.brandElectricPink.opacity(0.22), radius: size * 0.24, y: size * 0.1)
        .accessibilityHidden(true)
    }
}

struct BrandLockup: View {
    var markSize: CGFloat = 44
    var showsSubtitle = true
    var subtitle: String = AppBrand.subtitle

    var body: some View {
        HStack(spacing: 12) {
            BrandMark(size: markSize)

            VStack(alignment: .leading, spacing: 2) {
                Text(AppBrand.name)
                    .font(.system(size: max(22, markSize * 0.58), weight: .black, design: .rounded))
                    .foregroundColor(.textPrimary)

                if showsSubtitle {
                    Text(subtitle)
                        .font(.system(size: 12, weight: .semibold, design: .rounded))
                        .foregroundColor(.textSecondary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.82)
                }
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(showsSubtitle ? "\(AppBrand.name), \(subtitle)" : AppBrand.name)
    }
}

struct ScreenBrandHeader: View {
    let eyebrow: String
    let title: String
    let subtitle: String

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            BrandLockup(markSize: 38, showsSubtitle: false)

            Text(eyebrow.uppercased())
                .font(.system(size: 11, weight: .black, design: .rounded))
                .foregroundColor(.accentPrimary)
                .tracking(1.2)

            VStack(alignment: .leading, spacing: 6) {
                Text(title)
                    .font(.system(size: 26, weight: .black, design: .rounded))
                    .foregroundColor(.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)

                Text(subtitle)
                    .font(.system(size: 15, weight: .medium, design: .rounded))
                    .foregroundColor(.textSecondary)
                    .lineSpacing(2)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct KamiMonogramShape: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        let w = rect.width
        let h = rect.height

        path.move(to: CGPoint(x: 0.28 * w, y: 0.16 * h))
        path.addLine(to: CGPoint(x: 0.28 * w, y: 0.84 * h))

        path.move(to: CGPoint(x: 0.78 * w, y: 0.16 * h))
        path.addLine(to: CGPoint(x: 0.35 * w, y: 0.5 * h))
        path.addLine(to: CGPoint(x: 0.8 * w, y: 0.84 * h))

        return path
    }
}
