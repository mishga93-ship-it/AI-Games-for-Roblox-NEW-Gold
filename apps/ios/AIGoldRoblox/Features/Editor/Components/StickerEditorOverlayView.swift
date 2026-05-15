//
//  StickerEditorOverlayView.swift
//  AIGoldRoblox
//

import SwiftUI

struct StickerEditorOverlayView: View {
    @ObservedObject var state: EditorState

    @State private var finalScale: CGFloat = 1.0
    @GestureState private var pinchScale: CGFloat = 1.0
    @State private var offset: CGSize = .zero
    @State private var previousOffset: CGSize = .zero
    @State private var rotation: Angle = .zero
    @State private var previousRotation: Angle = .zero
    @State private var loadedImage: UIImage?

    private var effectiveScale: CGFloat {
        max(0.2, finalScale * pinchScale)
    }

    var body: some View {
        if let sticker = state.activeEditingSticker {
            ZStack {
                Color.black.opacity(0.18).ignoresSafeArea()

                ZStack {
                    RoundedRectangle(cornerRadius: 14)
                        .stroke(style: StrokeStyle(lineWidth: 2, dash: [8, 6]))
                        .foregroundColor(.white.opacity(0.95))
                        .frame(width: 136, height: 136)
                        .scaleEffect(effectiveScale)
                        .offset(offset)
                        .rotationEffect(rotation)

                    Group {
                        if let loadedImage {
                            Image(uiImage: loadedImage)
                                .resizable()
                                .aspectRatio(contentMode: .fit)
                        } else {
                            ProgressView()
                                .tint(.white)
                        }
                    }
                    .frame(width: 120, height: 120)
                    .scaleEffect(effectiveScale)
                    .offset(offset)
                    .rotationEffect(rotation)
                    .gesture(
                        MagnifyGesture()
                            .updating($pinchScale) { value, state, _ in
                                state = value.magnification
                            }
                            .onEnded { value in
                                finalScale = max(0.2, finalScale * value.magnification)
                            }
                    )
                    .simultaneousGesture(
                        DragGesture()
                            .onChanged { value in
                                offset = CGSize(
                                    width: previousOffset.width + value.translation.width,
                                    height: previousOffset.height + value.translation.height
                                )
                            }
                            .onEnded { _ in
                                previousOffset = offset
                            }
                    )
                    .simultaneousGesture(
                        RotationGesture()
                            .onChanged { value in
                                rotation = previousRotation + value
                            }
                            .onEnded { _ in
                                previousRotation = rotation
                            }
                    )
                }

                VStack {
                    Spacer()
                    VStack(spacing: 12) {
                        HStack(spacing: 12) {
                            Text("Size")
                                .font(.system(size: 13, weight: .semibold, design: .rounded))
                                .foregroundColor(.white)
                            Slider(value: sizeSliderBinding, in: 0.2...4.0)
                            .tint(.accentPink)
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 12)
                        .background(Color.black.opacity(0.4), in: Capsule())

                    HStack(spacing: 20) {
                        Button { state.activeEditingSticker = nil } label: {
                            Image(systemName: "xmark.circle.fill")
                                .font(.largeTitle).foregroundColor(.red)
                        }
                        Button { state.confirmSticker() } label: {
                            Image(systemName: "checkmark.circle.fill")
                                .font(.largeTitle).foregroundColor(.green)
                        }
                    }
                    }
                    .padding(.bottom, 40)
                }
            }
            .onAppear {
                finalScale = sticker.scale
                offset = CGSize(width: sticker.position.x, height: sticker.position.y)
                previousOffset = offset
                rotation = sticker.rotation
                previousRotation = rotation
                Task {
                    loadedImage = await ImageCacheManager.shared.image(for: sticker.imageURL)
                }
            }
            .onChange(of: offset) { _, value in
                state.updateActiveSticker(offset: value, scale: effectiveScale, rotation: rotation)
            }
            .onChange(of: finalScale) { _, value in
                state.updateActiveSticker(offset: offset, scale: value, rotation: rotation)
            }
            .onChange(of: pinchScale) { _, _ in
                state.updateActiveSticker(offset: offset, scale: effectiveScale, rotation: rotation)
            }
            .onChange(of: rotation) { _, value in
                state.updateActiveSticker(offset: offset, scale: effectiveScale, rotation: value)
            }
        }
    }

    private var sizeSliderBinding: Binding<Double> {
        Binding(
            get: { Double(finalScale) },
            set: { finalScale = CGFloat($0) }
        )
    }
}

struct LoopEditorOverlayView: View {
    @ObservedObject var state: EditorState

    @State private var offset: CGSize = .zero
    @State private var previousOffset: CGSize = .zero
    @State private var loadedImage: UIImage?

    var body: some View {
        if let loop = state.activeEditingLoop {
            ZStack {
                Color.black.opacity(0.18).ignoresSafeArea()

                ZStack {
                    RoundedRectangle(cornerRadius: 14)
                        .stroke(style: StrokeStyle(lineWidth: 2, dash: [8, 6]))
                        .foregroundColor(.white.opacity(0.95))
                        .frame(width: 160, height: 82)
                        .offset(offset)

                    Group {
                        if let loadedImage {
                            Image(uiImage: loadedImage)
                                .resizable()
                                .aspectRatio(contentMode: .fit)
                        } else {
                            ProgressView()
                                .tint(.white)
                        }
                    }
                    .frame(width: 144, height: 66)
                    .offset(offset)
                    .gesture(
                        DragGesture()
                            .onChanged { value in
                                offset = CGSize(
                                    width: previousOffset.width + value.translation.width,
                                    height: previousOffset.height + value.translation.height
                                )
                            }
                            .onEnded { _ in
                                previousOffset = offset
                            }
                    )
                }

                VStack {
                    Spacer()
                    HStack(spacing: 20) {
                        Button { state.cancelLoopEditing() } label: {
                            Image(systemName: "xmark.circle.fill")
                                .font(.largeTitle)
                                .foregroundColor(.red)
                        }
                        Button { state.confirmLoop() } label: {
                            Image(systemName: "checkmark.circle.fill")
                                .font(.largeTitle)
                                .foregroundColor(.green)
                        }
                    }
                    .padding(.bottom, 40)
                }
            }
            .onAppear {
                offset = loop.offset
                previousOffset = loop.offset
                Task {
                    loadedImage = await ImageCacheManager.shared.image(for: loop.imageURL)
                }
            }
            .onChange(of: offset) { _, value in
                state.updateActiveLoop(offset: value)
            }
        }
    }
}
