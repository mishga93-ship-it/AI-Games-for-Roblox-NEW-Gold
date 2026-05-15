//
//  ExportView.swift
//  AIGoldRoblox
//

import SwiftUI
import CoreImage.CIFilterBuiltins
import UIKit

struct ExportView: View {
    let fileName: String
    let fileType: String
    let downloadURL: URL?
    var clothingTexturePngURL: URL? = nil
    var isAnimation: Bool = false
    var jobId: String? = nil
    /// List of generated systems/scripts shown as a "What's Inside" preview
    var generatedSystems: [String] = []
    let onDismiss: () -> Void

    @State private var showQRCode = false
    @State private var isPreparingDownload = false
    @State private var downloadedFileURL: URL?
    @State private var showShareSheet = false
    @State private var showFilesPicker = false
    @State private var downloadErrorMessage: String?
    @State private var isPreparingPng = false
    @State private var isPreparingZip = false

    var body: some View {
        ZStack {
            LinearGradient(colors: [.gradientTop, .gradientBottom], startPoint: .topLeading, endPoint: .bottomTrailing)
                .ignoresSafeArea()

            ScrollView(showsIndicators: false) {
                VStack(spacing: 20) {
                    RoundedRectangle(cornerRadius: 28)
                        .fill(Color.cardBackground)
                        .frame(height: 180)
                        .overlay {
                            VStack(spacing: 14) {
                                Image(systemName: "square.and.arrow.up.fill")
                                    .font(.system(size: 48, weight: .semibold))
                                    .foregroundColor(.accentPrimary)
                                Text("\(fileName).\(fileType)")
                                    .font(.appHeadline)
                                    .foregroundColor(.textPrimary)
                                Text(destinationSummary)
                                    .font(.appCaption)
                                    .foregroundColor(.textSecondary)
                                    .multilineTextAlignment(.center)
                                    .padding(.horizontal, 20)
                            }
                        }

                    if clothingTexturePngURL != nil {
                        clothingUploadSection
                    }

                    if !generatedSystems.isEmpty && (fileType.lowercased() == "rbxl" || fileType.lowercased() == "rbxm" || fileType.lowercased() == "rbxmx") {
                        whatsInsideSection
                    }

                    ExportSection(title: "Transfer Options", rows: transferOptions)
                    ExportSection(title: "Studio Flow", rows: robloxFlow)
                    ExportSection(title: "Before Publishing", rows: qualityChecklist)

                    if clothingTexturePngURL != nil {
                        PrimaryButton(title: isPreparingPng ? "Preparing PNG..." : "Save Texture PNG to Files") {
                            prepareDownloadPng(for: .files)
                        }
                        .disabled(isPreparingPng)

                        PrimaryButton(title: "Upload to Creator Hub") {
                            if let url = URL(string: "https://create.roblox.com/dashboard/creations?activeTab=TShirt") {
                                UIApplication.shared.open(url)
                            }
                        }
                    }

                    if downloadURL != nil {
                        PrimaryButton(title: isPreparingDownload ? "Preparing File..." : "Download / Share File") {
                            prepareDownload(for: .share)
                        }
                        .disabled(isPreparingDownload)

                        PrimaryButton(title: "Show QR Code") {
                            showQRCode = true
                        }
                    }

                    if let jobId, !jobId.isEmpty {
                        PrimaryButton(title: isPreparingZip ? "Creating ZIP..." : "Download All as ZIP") {
                            prepareZipDownload(jobId: jobId)
                        }
                        .disabled(isPreparingZip)
                    }

                    PrimaryButton(title: "Done", action: onDismiss)
                }
                .padding(20)
            }
        }
        .sheet(isPresented: $showQRCode) {
            if let url = downloadURL {
                QRCodeSheet(url: url, title: "\(fileName).\(fileType)")
            }
        }
        .sheet(isPresented: $showShareSheet) {
            if let localFileURL = downloadedFileURL {
                FileShareSheet(items: [localFileURL])
            }
        }
        .sheet(isPresented: $showFilesPicker) {
            if let localFileURL = downloadedFileURL {
                FilesExportPicker(fileURL: localFileURL)
            }
        }
        .alert("Download Failed", isPresented: Binding(
            get: { downloadErrorMessage != nil },
            set: { if !$0 { downloadErrorMessage = nil } }
        )) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(downloadErrorMessage ?? "Could not download the file.")
        }
    }

    private var destinationSummary: String {
        switch fileType.lowercased() {
        case "rbxl":
            return "Move this place file to desktop, open it in Studio and publish from there."
        case "rbxm" where isAnimation:
            return "This .rbxm contains a KeyframeSequence animation. Transfer it to desktop and load it into Studio."
        case "rbxm":
            return "Drag the .rbxm into Workspace in Studio. If it contains a Sound object, the audio is already embedded inside."
        case "project_bundle":
            return "Download the project bundle, unpack the JSON + Lua files on desktop, and import the scripts into Studio."
        case "gdd":
            return "Use this generation brief as the production checklist for Studio implementation and publishing."
        case "json" where isAnimation:
            return "Animation keyframes exported as JSON. Transfer to desktop — the .rbxm will be ready on next generation."
        case "text", "json":
            return "Review the generated text or JSON on desktop, then feed it into your production workflow."
        case "glb":
            return "Import this 3D model into Studio via File > Import 3D. The model is pre-scaled for game use."
        case "fbx" where isAnimation:
            return "Import this FBX animation into Studio — it becomes an Animation asset automatically."
        case "fbx":
            return "Import this FBX into Studio using Avatar > Import 3D with Auto Setup for instant R15 rigging."
        case "lua":
            return "Import this Luau module into Studio and wire it into your existing systems."
        case "audio", "mp3", "ogg", "wav", "m4a", "flac", "aac":
            return "Download the generated audio and test it in Studio before adding triggers, loops, or publish media."
        case "png", "jpg", "jpeg":
            return "Download the generated image and review its fit for game UI, thumbnails, or creator references."
        default:
            return "Transfer the generated package to the right toolchain and review it before release."
        }
    }

    private var whatsInsideSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: "doc.badge.gearshape")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.accentPrimary)
                Text("What's Inside")
                    .font(.system(size: 14, weight: .bold, design: .rounded))
                    .foregroundColor(.textPrimary)
            }
            ForEach(Array(generatedSystems.enumerated()), id: \.offset) { _, item in
                HStack(alignment: .top, spacing: 8) {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 13))
                        .foregroundColor(.accentPrimary)
                        .padding(.top, 1)
                    Text(item)
                        .font(.system(size: 13, weight: .medium, design: .rounded))
                        .foregroundColor(.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .padding(16)
        .background(Color.accentPrimary.opacity(0.06))
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(Color.accentPrimary.opacity(0.12), lineWidth: 1)
        )
    }

    private var transferOptions: [String] {
        [
            "Save to Files for direct local access on iPhone or iPad.",
            "Send to desktop with AirDrop, iCloud Drive, Google Drive or email.",
            "Keep a cloud backup before opening in Studio or Creator Hub."
        ]
    }

    private var robloxFlow: [String] {
        switch fileType.lowercased() {
        case "rbxl":
            return [
                "Open Studio on desktop.",
                "Use File → Open and select the exported place file.",
                "Check systems, test gameplay, then publish the experience."
            ]
        case "json" where isAnimation:
            return [
                "Transfer JSON to desktop — it contains raw keyframe data.",
                "Generate a new animation to get the .rbxm with built-in PlayAnimation Script.",
                "Drag the .rbxm into Workspace in Studio and press Play to test."
            ]
        case "rbxm" where isAnimation:
            return [
                "Open your Studio project on desktop.",
                "Drag the .rbxm into the Workspace — the animation plays automatically on your character.",
                "The built-in Script adds the emote to the wheel via StarterCharacterScripts.",
                "Press Play to verify timing, loop, and joint rotations."
            ]
        case "rbxm":
            return [
                "Open the destination Studio project on desktop.",
                "Drag the .rbxm file into Workspace or use File > Import Model.",
                "If it contains a Sound object, the audio plays automatically. If it's a character model, it includes BodyColors and Motor6D joints."
            ]
        case "fbx" where isAnimation:
            return [
                "Open Studio on desktop.",
                "Go to Avatar > Import 3D (or File > Import 3D).",
                "Select the .fbx file — Studio creates an Animation asset automatically.",
                "Right-click the animation and select Save to get an Asset ID.",
                "Use the Asset ID in scripts: anim.AnimationId = \"rbxassetid://ID\""
            ]
        case "glb":
            return [
                "Open Studio on desktop.",
                "Use File > Import 3D and select the .glb file.",
                "The model is pre-scaled to game proportions (~5.5 studs)."
            ]
        case "project_bundle":
            return [
                "Download the bundle JSON and included Lua files.",
                "Open Studio on desktop and create the target containers for scripts and assets.",
                "Use the bundle notes as your import checklist until native rbxl/rbxm export lands."
            ]
        case "gdd":
            return [
                "Open the brief on desktop or iPad.",
                "Turn each section into Studio tasks, UI work, and content milestones.",
                "Generate follow-up code or assets from the brief as needed."
            ]
        case "text", "json":
            return [
                "Open the generated text or JSON result.",
                "Use it as source data for scripts, balancing, or production planning.",
                "Validate the final gameplay result before publishing."
            ]
        case "fbx":
            return [
                "Transfer the .fbx file to your desktop.",
                "Open Studio.",
                "Go to Avatar tab → Import 3D.",
                "Select the .fbx file.",
                "Enable Auto Rigging and Auto Skinning.",
                "Set Rig Type to R15.",
                "Click Import — Studio will auto-create the R15 skeleton.",
                "Press Play to test animations.",
            ]
        case "lua":
            return [
                "Open your target Studio project.",
                "Create the correct Script or ModuleScript container.",
                "Paste or import the generated Luau, then test it in Play mode."
            ]
        case "audio", "mp3", "ogg", "wav", "m4a", "flac", "aac":
            return [
                "Import the audio file into Studio or Creator Hub.",
                "Set the right sound properties, volume, and loop behavior.",
                "Play-test the trigger points on mobile and desktop."
            ]
        case "png", "jpg", "jpeg":
            return [
                "Review the generated image on desktop.",
                "Use it for UI, thumbnails, moodboards, or as a modeling reference.",
                "Re-export or refine it if the style is not yet production-ready."
            ]
        default:
            return [
                "Move the package to desktop.",
                "Open it in the matching Studio tool.",
                "Validate the result before publishing."
            ]
        }
    }

    private var qualityChecklist: [String] {
        [
            "Run a quick mobile-friendly performance check.",
            "Review text, tags and monetization copy for publishing.",
            "Keep screenshots or previews ready for your community post."
        ]
    }

    @ViewBuilder
    private var clothingUploadSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Clothing Setup")
                .font(.appHeadline)
                .foregroundColor(.textPrimary)

            ForEach(Array(clothingUploadSteps.enumerated()), id: \.offset) { index, step in
                HStack(alignment: .top, spacing: 12) {
                    Text("\(index + 1)")
                        .font(.system(size: 13, weight: .black, design: .rounded))
                        .foregroundColor(.white)
                        .frame(width: 26, height: 26)
                        .background(Color.accentPrimary)
                        .clipShape(Circle())
                    Text(step)
                        .font(.appCallout)
                        .foregroundColor(.textPrimary)
                }
                .padding(16)
                .background(Color.cardBackground)
                .clipShape(RoundedRectangle(cornerRadius: 18))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var clothingUploadSteps: [String] {
        [
            "Tap 'Save Texture PNG' below to save the clothing texture to Files.",
            "Tap 'Upload to Creator Hub' — it opens Creator Hub in Safari.",
            "Upload the saved PNG as a 'Decal' (NOT T-Shirt — Decal gives you the Image ID needed for ShirtTemplate/PantsTemplate).",
            "After upload, Creator Hub shows a Decal ID. Copy it.",
            "In Studio, paste the ID into ShirtTemplate or PantsTemplate as: rbxassetid://YOUR_DECAL_ID",
            "⚠️ IMPORTANT: If the texture doesn't appear, the Decal ID may differ from the Image ID. Right-click the Decal in Studio → 'Copy Image ID' and use that number instead.",
            "Press Play — your clothing will appear on the character."
        ]
    }

    private func prepareDownloadPng(for destination: DownloadDestination) {
        guard !isPreparingPng else { return }
        guard let remoteURL = clothingTexturePngURL else {
            downloadErrorMessage = "Missing texture PNG URL."
            return
        }
        isPreparingPng = true
        downloadErrorMessage = nil
        Task {
            do {
                let localURL = try await downloadToTempFile(from: remoteURL, nameOverride: "\(fileName)-texture", extOverride: "png")
                await MainActor.run {
                    isPreparingPng = false
                    downloadedFileURL = localURL
                    switch destination {
                    case .share:
                        showShareSheet = true
                    case .files:
                        showFilesPicker = true
                    }
                }
            } catch {
                await MainActor.run {
                    isPreparingPng = false
                    downloadErrorMessage = error.localizedDescription
                }
            }
        }
    }

    private enum DownloadDestination {
        case share
        case files
    }

    private func prepareDownload(for destination: DownloadDestination) {
        guard !isPreparingDownload else { return }
        guard let remoteURL = downloadURL else {
            downloadErrorMessage = "Missing download URL."
            return
        }
        isPreparingDownload = true
        downloadErrorMessage = nil
        Task {
            do {
                let localURL = try await downloadToTempFile(from: remoteURL)
                await MainActor.run {
                    isPreparingDownload = false
                    downloadedFileURL = localURL
                    switch destination {
                    case .share:
                        showShareSheet = true
                    case .files:
                        showFilesPicker = true
                    }
                }
            } catch {
                await MainActor.run {
                    isPreparingDownload = false
                    downloadErrorMessage = error.localizedDescription
                }
            }
        }
    }

    private func downloadToTempFile(from remoteURL: URL, nameOverride: String? = nil, extOverride: String? = nil) async throws -> URL {
        let (tempURL, response) = try await URLSession.shared.download(from: remoteURL)
        if let http = response as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
            throw URLError(.badServerResponse)
        }
        let baseName = nameOverride ?? fileName
        let ext = extOverride ?? fileType
        // Sanitize: keep ASCII alphanumerics + '-' + '_' + '.'; replace anything else with '-'.
        // iOS rejects file names > 255 bytes or containing invalid unicode (em-dash, zero-width, etc.)
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-_."))
        let trimmed = baseName.trimmingCharacters(in: .whitespacesAndNewlines)
        var sanitizedName = String(trimmed.unicodeScalars.map { allowed.contains($0) ? Character($0) : "-" })
        // Collapse runs of '-'
        while sanitizedName.contains("--") {
            sanitizedName = sanitizedName.replacingOccurrences(of: "--", with: "-")
        }
        sanitizedName = sanitizedName.trimmingCharacters(in: CharacterSet(charactersIn: "-."))
        // Truncate to leave room for extension (iOS limit 255 bytes; UTF-8 ASCII = 1 byte per char).
        let maxBase = max(8, 200 - ext.count - 1)
        if sanitizedName.count > maxBase {
            sanitizedName = String(sanitizedName.prefix(maxBase))
        }
        let fallbackName = sanitizedName.isEmpty ? "export" : sanitizedName
        let finalName = "\(fallbackName).\(ext.lowercased())"
        let destinationURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathComponent(finalName)
        try FileManager.default.createDirectory(
            at: destinationURL.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        if FileManager.default.fileExists(atPath: destinationURL.path) {
            try FileManager.default.removeItem(at: destinationURL)
        }
        try FileManager.default.moveItem(at: tempURL, to: destinationURL)
        return destinationURL
    }

    private func prepareZipDownload(jobId: String) {
        guard !isPreparingZip else { return }
        isPreparingZip = true
        downloadErrorMessage = nil
        Task {
            do {
                let response = try await AIWorkspaceAPI.requestZipExport(jobId: jobId)
                guard let zipURL = URL(string: response.downloadUrl) else {
                    throw URLError(.badURL)
                }
                let localURL = try await downloadToTempFile(from: zipURL, nameOverride: response.fileName.replacingOccurrences(of: ".zip", with: ""), extOverride: "zip")
                await MainActor.run {
                    isPreparingZip = false
                    downloadedFileURL = localURL
                    showShareSheet = true
                }
            } catch {
                print("[ExportView.prepareZipDownload] jobId=\(jobId) error: \(error)")
                await MainActor.run {
                    isPreparingZip = false
                    downloadErrorMessage = "ZIP export is temporarily unavailable. Try exporting individual files instead."
                }
            }
        }
    }
}

private struct FileShareSheet: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

private struct FilesExportPicker: UIViewControllerRepresentable {
    let fileURL: URL

    func makeUIViewController(context: Context) -> UIDocumentPickerViewController {
        UIDocumentPickerViewController(forExporting: [fileURL], asCopy: true)
    }

    func updateUIViewController(_ uiViewController: UIDocumentPickerViewController, context: Context) {}
}

private struct QRCodeSheet: View {
    @Environment(\.dismiss) private var dismiss
    let url: URL
    let title: String

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                Spacer()

                if let qrImage = generateQRCode(from: url.absoluteString) {
                    Image(uiImage: qrImage)
                        .interpolation(.none)
                        .resizable()
                        .scaledToFit()
                        .frame(width: 220, height: 220)
                        .padding(20)
                        .background(Color.white)
                        .clipShape(RoundedRectangle(cornerRadius: 20))
                        .shadow(color: Color.accentPrimary.opacity(0.15), radius: 16, y: 8)
                } else {
                    ContentUnavailableView("QR Unavailable", systemImage: "qrcode", description: Text("Could not generate QR code for this URL."))
                }

                Text(title)
                    .font(.appHeadline)
                    .foregroundColor(.textPrimary)

                Text(url.absoluteString)
                    .font(.appCaption)
                    .foregroundColor(.textSecondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)

                ShareLink(item: url) {
                    Label("Share Link", systemImage: "square.and.arrow.up")
                        .font(.system(size: 15, weight: .semibold, design: .rounded))
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(Color.accentPrimary)
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                }
                .padding(.horizontal, 32)

                Spacer()
            }
            .frame(maxWidth: .infinity)
            .background(
                LinearGradient(colors: [.gradientTop, .gradientBottom], startPoint: .topLeading, endPoint: .bottomTrailing)
                    .ignoresSafeArea()
            )
            .navigationTitle("QR Code")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    private func generateQRCode(from string: String) -> UIImage? {
        let context = CIContext()
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(string.utf8)
        filter.correctionLevel = "M"

        guard let outputImage = filter.outputImage else { return nil }
        let scale = 256.0 / outputImage.extent.size.width
        let scaledImage = outputImage.transformed(by: CGAffineTransform(scaleX: scale, y: scale))

        guard let cgImage = context.createCGImage(scaledImage, from: scaledImage.extent) else { return nil }
        return UIImage(cgImage: cgImage)
    }
}

private struct ExportSection: View {
    let title: String
    let rows: [String]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title)
                .font(.appHeadline)
                .foregroundColor(.textPrimary)

            ForEach(Array(rows.enumerated()), id: \.offset) { index, row in
                HStack(alignment: .top, spacing: 12) {
                    Text("\(index + 1)")
                        .font(.system(size: 13, weight: .black, design: .rounded))
                        .foregroundColor(.white)
                        .frame(width: 26, height: 26)
                        .background(Color.accentPrimary)
                        .clipShape(Circle())
                    Text(row)
                        .font(.appCallout)
                        .foregroundColor(.textPrimary)
                }
                .padding(16)
                .background(Color.cardBackground)
                .clipShape(RoundedRectangle(cornerRadius: 18))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
