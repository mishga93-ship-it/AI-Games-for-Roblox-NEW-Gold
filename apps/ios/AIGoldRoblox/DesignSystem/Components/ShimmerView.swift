import SwiftUI

struct ShimmerView: View {
    @State private var phase: CGFloat = -1

    var body: some View {
        GeometryReader { geo in
            let leadingLocation = min(max(0, phase - 0.3), 1)
            let centerLocation = max(leadingLocation, min(max(0, phase), 1))
            let trailingLocation = max(centerLocation, min(max(0, phase + 0.3), 1))

            LinearGradient(
                stops: [
                    .init(color: Color.white.opacity(0.04), location: leadingLocation),
                    .init(color: Color.white.opacity(0.12), location: centerLocation),
                    .init(color: Color.white.opacity(0.04), location: trailingLocation)
                ],
                startPoint: .leading,
                endPoint: .trailing
            )
            .frame(width: geo.size.width, height: geo.size.height)
            .onAppear {
                withAnimation(.linear(duration: 1.2).repeatForever(autoreverses: false)) {
                    phase = 2
                }
            }
        }
        .clipped()
    }
}

extension View {
    @ViewBuilder
    func shimmerPlaceholder(isLoading: Bool) -> some View {
        if isLoading {
            self.overlay(
                ShimmerView()
            )
            .clipShape(RoundedRectangle(cornerRadius: 8))
        } else {
            self
        }
    }
}
