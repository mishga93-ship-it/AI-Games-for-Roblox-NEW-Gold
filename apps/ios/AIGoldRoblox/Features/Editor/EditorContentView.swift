import SwiftUI
import SceneKit
import UIKit

// MARK: - 4-Zone single-screen FORGE editor (matching Unity reference)

struct EditorContentView: View {
    @StateObject private var state = EditorState()
    @EnvironmentObject private var appState: AppState
    @Environment(\.dismiss) private var dismiss
    @State private var showExportSheet = false
    @State private var showChangeSelector = false
    @State private var exportRequestID: UUID?
    @State private var exportedImage: UIImage?
    @State private var pendingSnapshotAction: SnapshotAction?
    @State private var editorStatusMessage: String?

    var body: some View {
        VStack(spacing: 0) {
            topBar
            canvasZone
            quickActionsBar
            toolsBar
            if state.selectedSection != .colors {
                assetGrid
            }
        }
        .background(
            LinearGradient(colors: [.gradientTop, .gradientBottom], startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()
        )
        .navigationBarHidden(true)
        .onAppear {
            appState.isTabBarHidden = true
            print("[EditorContentView] onAppear selectedSection=\(state.selectedSection.rawValue) clothTarget=\(state.clothTarget.rawValue)")
            state.debugDumpToConsole(reason: "EditorContentView.onAppear")
            state.loadContent()
        }
        .onDisappear {
            appState.isTabBarHidden = false
        }
        .onChange(of: state.contentItems.count) { _, newValue in
            print("[EditorContentView] contentItems.count changed -> \(newValue)")
            state.debugDumpToConsole(reason: "contentItems.count changed")
        }
        .onChange(of: state.isLoading) { _, newValue in
            print("[EditorContentView] isLoading changed -> \(newValue)")
            state.debugDumpToConsole(reason: "isLoading changed")
        }
        .onChange(of: state.selectedSection) { _, newValue in
            print("[EditorContentView] selectedSection changed -> \(newValue.rawValue)")
            state.debugDumpToConsole(reason: "selectedSection changed")
        }
        .onChange(of: state.selectedEditArea) { _, newValue in
            print("[EditorContentView] selectedEditArea changed -> \(newValue.rawValue)")
            state.debugDumpToConsole(reason: "selectedEditArea changed")
        }
        .onChange(of: state.clothTarget) { _, newValue in
            print("[EditorContentView] clothTarget changed -> \(newValue.rawValue)")
            state.debugDumpToConsole(reason: "clothTarget changed")
        }
        .onChange(of: state.currentBodyType) { _, newValue in
            print("[EditorContentView] currentBodyType changed -> \(newValue.displayName)")
            state.debugDumpToConsole(reason: "EditorContentView body type changed")
        }
        .onChange(of: state.currentRigType) { _, newValue in
            print("[EditorContentView] currentRigType changed -> \(newValue.displayName)")
            state.debugDumpToConsole(reason: "EditorContentView rig type changed")
        }
        .sheet(isPresented: $showExportSheet) {
            if let exportedImage {
                ExportSheetView(
                    image: exportedImage,
                    clothTextureURL: state.clothTextureURL,
                    clothTarget: state.clothTarget,
                    decalURL: state.stickers.last?.imageURL,
                    exportBaseName: exportBaseName
                )
            }
        }
    }

    private enum SnapshotAction {
        case export2D
        case saveCharacter
    }

    // MARK: Zone 1 — Top Bar

    private var topBar: some View {
        HStack {
            Button { dismiss() } label: {
                Image(systemName: "chevron.left")
                    .font(.title3.bold())
                    .foregroundColor(.textPrimary)
                    .frame(width: 44, height: 44)
            }

            Spacer()

            if state.selectedEditArea == .head {
                Text(state.selectedEditArea.rawValue.uppercased())
                    .font(.system(.headline, design: .rounded, weight: .bold))
                    .foregroundColor(.textPrimary)
            } else {
                HStack(spacing: 12) {
                    Button { state.previousCategory() } label: {
                        Image(systemName: "chevron.left")
                            .foregroundColor(.textSecondary)
                    }
                    Text(state.clothTarget.rawValue)
                        .font(.system(.headline, design: .rounded, weight: .bold))
                        .foregroundColor(.textPrimary)
                    Button { state.nextCategory() } label: {
                        Image(systemName: "chevron.right")
                            .foregroundColor(.textSecondary)
                    }
                }
            }

            Spacer()

            HStack(spacing: 8) {
                Menu {
                    ForEach(AvatarRigType.allCases) { rig in
                        Button(rig.displayName) {
                            withAnimation(.spring()) { state.selectRigType(rig) }
                        }
                    }
                } label: {
                    Text(state.currentRigType.displayName)
                        .font(.system(.caption, design: .rounded, weight: .bold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(Color(red: 0.24, green: 0.20, blue: 0.52))
                        .clipShape(Capsule())
                }

                Menu {
                    ForEach(AvatarBodyType.allCases) { type in
                        Button(type.displayName) {
                            withAnimation(.spring()) { state.selectBodyType(type) }
                        }
                    }
                } label: {
                    Text(state.currentBodyType.displayName)
                        .font(.system(.caption, design: .rounded, weight: .bold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(Color(red: 0.07, green: 0.30, blue: 0.18))
                        .clipShape(Capsule())
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(Color.cardBackground)
    }

    // MARK: Zone 2 — 3D Canvas + FABs

    private var canvasZone: some View {
        ZStack {
            AvatarSceneView(
                state: state,
                exportRequestID: exportRequestID,
                onSnapshotReady: { image in
                    let action = pendingSnapshotAction
                    pendingSnapshotAction = nil

                    switch action {
                    case .export2D:
                        exportedImage = image
                        showExportSheet = true
                    case .saveCharacter:
                        guard let pngData = image.pngData() else {
                            editorStatusMessage = "Failed to save character."
                            return
                        }

                        do {
                            _ = try appState.saveAvatarLook(
                                previewPNGData: pngData,
                                rigType: state.currentRigType,
                                bodyType: state.currentBodyType
                            )
                            editorStatusMessage = "Character saved to Library."
                        } catch {
                            editorStatusMessage = "Failed to save character."
                        }
                    case nil:
                        break
                    }
                }
            )
                .frame(maxWidth: .infinity)
                .frame(height: 320)
                .clipShape(RoundedRectangle(cornerRadius: 16))

            // Sticker overlay
            if state.activeEditingSticker != nil {
                StickerEditorOverlayView(state: state)
            }

            if state.activeEditingLoop != nil {
                LoopEditorOverlayView(state: state)
            }

            // FABs
            VStack {
                HStack {
                    Spacer()
                    fabButton(icon: "info.circle", action: {})
                }
                Spacer()
                HStack {
                    fabButton(icon: "arrow.triangle.2.circlepath") {
                        withAnimation { state.modelRotation += 180 }
                    }
                    Spacer()
                    VStack(spacing: 8) {
                        fabButton(icon: "paintbrush.fill", label: "Change") {
                            withAnimation(.spring()) { showChangeSelector.toggle() }
                        }
                        fabButton(icon: "photo.on.rectangle.angled", label: "3D->2D") {
                            pendingSnapshotAction = .export2D
                            exportRequestID = UUID()
                        }
                        fabButton(icon: "arrow.uturn.backward", label: "Default") {
                            state.resetAll()
                        }
                    }
                }
            }
            .padding(10)

            if showChangeSelector {
                Color.black.opacity(0.08)
                    .ignoresSafeArea()
                    .onTapGesture {
                        withAnimation(.spring()) { showChangeSelector = false }
                    }

                HStack {
                    Spacer()
                    VStack(spacing: 14) {
                        editAreaButton(icon: "person.crop.circle", label: "Head", area: .head)
                        editAreaButton(icon: "tshirt.fill", label: "Torso", area: .torso)
                        editAreaButton(icon: "figure.stand", label: "Legs", area: .legs)
                    }
                    .padding(.vertical, 14)
                    .padding(.horizontal, 12)
                    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 22))
                    .padding(.trailing, 54)
                }
                .transition(.move(edge: .trailing).combined(with: .opacity))
            }
        }
        .padding(.horizontal, 8)
        .onChange(of: state.selectedEditArea) { _, _ in
            if showChangeSelector {
                withAnimation(.spring()) { showChangeSelector = false }
            }
        }
    }

    private var quickActionsBar: some View {
        VStack(spacing: 8) {
            HStack(spacing: 12) {
                PrimaryButton(title: "3D -> 2D") {
                    pendingSnapshotAction = .export2D
                    exportRequestID = UUID()
                }
                PrimaryButton(title: "Save Character", action: {
                    pendingSnapshotAction = .saveCharacter
                    exportRequestID = UUID()
                }, style: .outline)
            }
            .padding(.horizontal, 12)
            .padding(.top, 10)

            if let editorStatusMessage {
                Text(editorStatusMessage)
                    .font(.appCaption)
                    .foregroundColor(.accentPrimary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 12)
            }
        }
        .padding(.bottom, 8)
        .background(Color.elevatedBackground)
    }

    private func editAreaButton(icon: String, label: String, area: EditorEditArea) -> some View {
        Button {
            state.selectEditArea(area)
            withAnimation(.spring()) { showChangeSelector = false }
        } label: {
            VStack(spacing: 4) {
                ZStack {
                    Circle()
                        .fill(state.selectedEditArea == area ? Color.accentOrange : Color.cardBackground)
                        .frame(width: 42, height: 42)
                        .overlay(Circle().stroke(Color.accentPrimary.opacity(0.18), lineWidth: 1))
                    Image(systemName: icon)
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(state.selectedEditArea == area ? .white : .textPrimary)
                }
                Text(label)
                    .font(.system(size: 10, weight: .semibold, design: .rounded))
                    .foregroundColor(.textSecondary)
            }
        }
        .buttonStyle(.plain)
    }

    private func fabButton(icon: String, label: String? = nil, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 2) {
                Image(systemName: icon)
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundColor(.white)
                    .frame(width: 38, height: 38)
                    .background(Color.black.opacity(0.55))
                    .clipShape(Circle())
                if let label {
                    Text(label)
                        .font(.system(size: 9, weight: .semibold, design: .rounded))
                        .foregroundColor(.white)
                }
            }
        }
    }

    // MARK: Zone 3 — Tools Bar

    private var toolsBar: some View {
        VStack(spacing: 0) {
            // Section pills
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(state.availableSections, id: \.self) { section in
                        Button {
                            withAnimation(.spring(response: 0.3)) { state.selectedSection = section }
                        } label: {
                            Text(section.rawValue)
                                .font(.system(.caption2, design: .rounded, weight: .bold))
                                .foregroundColor(state.selectedSection == section ? .black : .textPrimary)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 7)
                                .background(state.selectedSection == section ? sectionAccent(section) : Color.cardBackground)
                                .clipShape(Capsule())
                                .overlay(
                                    Capsule()
                                        .stroke(Color.accentPrimary.opacity(state.selectedSection == section ? 0 : 0.15), lineWidth: 1)
                                )
                        }
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
            }

            // Sub-tools (section-specific)
            if state.selectedSection == .colors {
                colorPalette
            } else if state.selectedSection == .stickers || state.selectedSection == .loops {
                alphaSlider
            } else if state.selectedSection == .clothes {
                clothSlider
            }
        }
        .background(Color.elevatedBackground)
    }

    private func sectionAccent(_ s: EditorSection) -> Color {
        switch s {
        case .textures: return .accentPrimary
        case .stickers: return .accentPink
        case .clothes:  return .accentOrange
        case .colors:   return .neonPurple
        case .loops:    return .accentTeal
        }
    }

    private var colorPalette: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(presetColors, id: \.self) { color in
                    Circle()
                        .fill(color)
                        .frame(width: 32, height: 32)
                        .overlay(Circle().stroke(Color.white.opacity(0.3), lineWidth: 1))
                        .onTapGesture { state.applyPaintColor(color) }
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
        }
    }

    private var presetColors: [Color] {
        [.red, .yellow, .green, .mint, .teal, .cyan, .blue, .indigo, .purple, .pink, .brown, .white, .gray, .black,
         Color(red: 0.45, green: 0.75, blue: 0.45)]
    }

    private var exportBaseName: String {
        "\(state.currentRigType.displayName.lowercased())-\(state.currentBodyType.displayName.lowercased())-avatar"
    }

    private var alphaSlider: some View {
        HStack {
            Text("Alpha")
                .font(.caption2).foregroundColor(.textSecondary)
            Slider(value: state.selectedSection == .stickers ? $state.stickerAlpha : $state.loopAlpha, in: 0...1)
                .tint(.accentPrimary)
            Button("Clear") {
                state.clearCurrentSection()
            }
            .font(.caption2.bold()).foregroundColor(.red)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
    }

    private var clothSlider: some View {
        HStack {
            Text("Opacity")
                .font(.caption2).foregroundColor(.textSecondary)
            Slider(value: $state.clothTranslucence, in: 0...1)
                .tint(.accentOrange)
            Button("Clear") { state.clearCurrentSection() }
                .font(.caption2.bold()).foregroundColor(.red)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
    }

    // MARK: Zone 4 — Asset Grid

    private var assetGrid: some View {
        ScrollView {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 76), spacing: 6)], spacing: 6) {
                ForEach(state.contentItems, id: \.id) { item in
                    EditorGridItem(
                        imagePath: item.imageUrl,
                        isSelected: false,
                        accentColor: sectionAccent(state.selectedSection)
                    )
                    .onTapGesture { applyItem(item) }
                }

                if state.contentItems.isEmpty {
                    if state.isLoading {
                        ForEach(0..<12, id: \.self) { _ in
                            RoundedRectangle(cornerRadius: 8)
                                .fill(Color.cardBackground)
                                .frame(height: 76)
                                .shimmerPlaceholder(isLoading: true)
                        }
                    } else {
                        VStack(spacing: 10) {
                            Text("No editor content loaded")
                                .font(.appBody.weight(.semibold))
                                .foregroundColor(.textPrimary)
                            Text("Retry Dropbox sync or reopen the editor after Home finishes loading.")
                                .font(.appCaption)
                                .foregroundColor(.textSecondary)
                                .multilineTextAlignment(.center)
                            Button("Retry") {
                                state.loadContent()
                            }
                            .font(.system(size: 14, weight: .bold, design: .rounded))
                            .foregroundColor(.white)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 10)
                            .background(Color.accentPrimary)
                            .clipShape(Capsule())
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 28)
                        .gridCellColumns(4)
                    }
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
        }
    }

    private func applyItem(_ item: ContentItem) {
        let path = item.dropboxImagePath.isEmpty ? item.imageUrl : item.dropboxImagePath
        switch state.selectedSection {
        case .textures:
            let clothPath = item.dropboxImagePath.isEmpty ? item.imageUrl : item.dropboxImagePath
            state.applyCloth(url: clothPath)
        case .stickers:
            state.startEditingSticker(path)
        case .clothes:
            state.addAccessory(url: item.imageUrl, slot: .back)
        case .colors:
            break
        case .loops:
            state.startEditingLoop(path)
        }
    }
}

// MARK: - Export Sheet

private struct ExportSheetView: View {
    @EnvironmentObject private var appState: AppState
    @Environment(\.dismiss) private var dismiss
    let image: UIImage
    let clothTextureURL: String?
    let clothTarget: ClothTarget
    let decalURL: String?
    let exportBaseName: String
    @State private var showShareSheet = false
    @State private var saveMessage: String?
    @State private var exportFileURL: URL?
    @State private var isPreparingRobloxAsset = false

    var body: some View {
        VStack(spacing: 20) {
            RoundedRectangle(cornerRadius: 24)
                .fill(Color.white.opacity(0.96))
                .frame(height: 280)
                .overlay {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFit()
                        .padding(18)
                }
                .overlay(
                    RoundedRectangle(cornerRadius: 24)
                        .stroke(Color.accentPrimary.opacity(0.14), lineWidth: 1)
                )

            Text("Export Avatar").font(.appTitle).foregroundColor(.textPrimary)
            Text("Your current 3D avatar has been converted into a 2D image with all applied changes.")
                .font(.appBody)
                .foregroundColor(.textSecondary)
                .multilineTextAlignment(.center)

            if let saveMessage {
                Text(saveMessage)
                    .font(.appCaption)
                    .foregroundColor(.accentPrimary)
            }

            HStack(spacing: 12) {
                Button("Save to Photos") {
                    ImageSaver.saveToPhotos(image) { result in
                        saveMessage = result.message
                        if case .success = result {
                            appState.addExportRecord(
                                title: "\(exportBaseName).png",
                                format: ".png",
                                destination: "Photos"
                            )
                        }
                    }
                }
                .font(.appHeadline)
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .padding()
                .background(Color.accentPrimary)
                .clipShape(RoundedRectangle(cornerRadius: 12))

                Button("Share") {
                    exportFileURL = nil
                    showShareSheet = true
                }
                .font(.appHeadline)
                .foregroundColor(.textPrimary)
                .frame(maxWidth: .infinity)
                .padding()
                .background(Color.cardBackground)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(Color.accentPrimary.opacity(0.15), lineWidth: 1)
                )
            }

            Button("Export PNG File for Studio") {
                exportFileURL = exportPNGFile()
                showShareSheet = exportFileURL != nil
                if exportFileURL != nil {
                    appState.addExportRecord(
                        title: "\(exportBaseName).png",
                        format: ".png",
                        destination: "Files / Share Sheet"
                    )
                }
            }
            .font(.appHeadline)
            .foregroundColor(.textPrimary)
            .frame(maxWidth: .infinity)
            .padding()
            .background(Color.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(Color.accentPrimary.opacity(0.15), lineWidth: 1)
            )

            if clothTextureURL != nil || decalURL != nil {
                VStack(spacing: 10) {
                    if let clothTextureURL {
                        Button {
                            Task { await exportRobloxAsset(from: clothTextureURL, suggestedName: clothExportName) }
                        } label: {
                            HStack(spacing: 8) {
                                if isPreparingRobloxAsset {
                                    ProgressView()
                                        .tint(.textPrimary)
                                } else {
                                    Image(systemName: "shippingbox.fill")
                                }
                                Text("Export \(clothExportLabel)")
                            }
                            .font(.appHeadline)
                            .foregroundColor(.textPrimary)
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(Color.cardBackground)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                            .overlay(
                                RoundedRectangle(cornerRadius: 12)
                                    .stroke(Color.accentPrimary.opacity(0.15), lineWidth: 1)
                            )
                        }
                        .disabled(isPreparingRobloxAsset)
                    }

                    if let decalURL {
                        Button {
                            Task { await exportRobloxAsset(from: decalURL, suggestedName: "studio-decal") }
                        } label: {
                            HStack(spacing: 8) {
                                if isPreparingRobloxAsset {
                                    ProgressView()
                                        .tint(.textPrimary)
                                } else {
                                    Image(systemName: "seal.fill")
                                }
                                Text("Export Decal")
                            }
                            .font(.appHeadline)
                            .foregroundColor(.textPrimary)
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(Color.cardBackground)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                            .overlay(
                                RoundedRectangle(cornerRadius: 12)
                                    .stroke(Color.accentPrimary.opacity(0.15), lineWidth: 1)
                            )
                        }
                        .disabled(isPreparingRobloxAsset)
                    }
                }
            }

            Button("Done") { dismiss() }
                .font(.appHeadline)
                .foregroundColor(.black)
                .frame(maxWidth: .infinity)
                .padding()
                .background(Color.white.opacity(0.92))
                .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .padding(24)
        .background(Color.appBackground)
        .sheet(isPresented: $showShareSheet) {
            if let exportFileURL {
                EditorShareSheet(items: [exportFileURL])
            } else {
                EditorShareSheet(items: [image])
            }
        }
    }

    private var clothExportLabel: String {
        switch clothTarget {
        case .shirt: return "Shirt Template"
        case .pants: return "Pants Template"
        case .tshirt: return "T-Shirt Decal"
        }
    }

    private var clothExportName: String {
        switch clothTarget {
        case .shirt: return "studio-shirt-template"
        case .pants: return "studio-pants-template"
        case .tshirt: return "studio-tshirt-decal"
        }
    }

    private func exportPNGFile() -> URL? {
        let destination = FileManager.default.temporaryDirectory.appendingPathComponent("\(exportBaseName).png")
        do {
            try? FileManager.default.removeItem(at: destination)
            guard let data = image.pngData() else { return nil }
            try data.write(to: destination, options: .atomic)
            return destination
        } catch {
            saveMessage = "Failed to export PNG file."
            return nil
        }
    }

    @MainActor
    private func exportRobloxAsset(from source: String, suggestedName: String) async {
        isPreparingRobloxAsset = true
        saveMessage = nil

        defer { isPreparingRobloxAsset = false }

        do {
            let exportFile = try await ImageCacheManager.shared.exportableFile(for: source)
            let destination = FileManager.default.temporaryDirectory
                .appendingPathComponent("\(suggestedName).\(exportFile.fileExtension)")
            try? FileManager.default.removeItem(at: destination)
            try exportFile.data.write(to: destination, options: .atomic)
            exportFileURL = destination
            showShareSheet = true
        } catch {
            saveMessage = "Failed to export Studio asset."
        }
    }
}

private struct EditorShareSheet: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}
