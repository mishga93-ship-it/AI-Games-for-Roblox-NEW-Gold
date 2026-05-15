import SwiftUI

struct LaunchLoadingView: View {
    @State private var orbitRotation = 0.0
    @State private var pulse = false
    @State private var drift = false

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [.brandNight, .brandViolet.opacity(0.78), .brandNight],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            AuroraBlob(color: .brandElectricBlue, size: 330)
                .offset(x: drift ? -110 : -150, y: drift ? -270 : -230)
            AuroraBlob(color: .brandElectricPink, size: 360)
                .offset(x: drift ? 150 : 110, y: drift ? -60 : -95)
            AuroraBlob(color: .brandSolar, size: 250)
                .offset(x: drift ? -80 : -35, y: drift ? 265 : 230)

            VStack(spacing: 24) {
                ZStack {
                    Circle()
                        .stroke(Color.white.opacity(0.12), lineWidth: 18)
                        .frame(width: 178, height: 178)

                    Circle()
                        .trim(from: 0.04, to: 0.38)
                        .stroke(
                            LinearGradient(
                                colors: [.brandElectricBlue, .brandElectricPink, .brandSolar],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            ),
                            style: StrokeStyle(lineWidth: 9, lineCap: .round)
                        )
                        .frame(width: 178, height: 178)
                        .rotationEffect(.degrees(orbitRotation))

                    BrandMark(size: 112)
                        .scaleEffect(pulse ? 1.04 : 0.98)
                }

                VStack(spacing: 6) {
                    Text(AppBrand.name)
                        .font(.system(size: 46, weight: .black, design: .rounded))
                        .foregroundColor(.white)

                    Text(AppBrand.subtitle)
                        .font(.system(size: 15, weight: .bold, design: .rounded))
                        .foregroundColor(.white.opacity(0.72))
                        .lineLimit(1)
                        .minimumScaleFactor(0.82)
                }

                LoadingDotsView()
                    .padding(.top, 12)
            }
            .padding(.horizontal, 32)
        }
        .onAppear {
            withAnimation(.linear(duration: 1.6).repeatForever(autoreverses: false)) {
                orbitRotation = 360
            }
            withAnimation(.easeInOut(duration: 1.15).repeatForever(autoreverses: true)) {
                pulse = true
            }
            withAnimation(.easeInOut(duration: 4.5).repeatForever(autoreverses: true)) {
                drift = true
            }
        }
    }
}

private struct AuroraBlob: View {
    let color: Color
    let size: CGFloat

    var body: some View {
        Circle()
            .fill(
                RadialGradient(
                    colors: [color.opacity(0.58), color.opacity(0.08), .clear],
                    center: .center,
                    startRadius: 0,
                    endRadius: size * 0.5
                )
            )
            .frame(width: size, height: size)
            .blur(radius: 14)
    }
}

private struct LoadingDotsView: View {
    @State private var activeIndex = 0
    private let timer = Timer.publish(every: 0.28, on: .main, in: .common).autoconnect()

    var body: some View {
        HStack(spacing: 10) {
            ForEach(0..<3, id: \.self) { index in
                Circle()
                    .fill(index == activeIndex ? Color.brandElectricBlue : Color.white.opacity(0.38))
                    .frame(width: index == activeIndex ? 12 : 9, height: index == activeIndex ? 12 : 9)
                    .animation(.spring(response: 0.28, dampingFraction: 0.72), value: activeIndex)
            }
        }
        .onReceive(timer) { _ in
            activeIndex = (activeIndex + 1) % 3
        }
    }
}
