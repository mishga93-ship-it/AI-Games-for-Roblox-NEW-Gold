import SwiftUI
import PhotosUI

struct PublishView: View {
    let initialTitle: String
    let initialDescription: String
    let artifactIds: [String]
    let projectKind: String
    let existingProjectId: String?
    let initialScreenshotURLs: [URL]
    let onPublished: (String) -> Void

    @State private var title: String
    @State private var descriptionText: String
    @State private var selectedPhotos: [PhotosPickerItem] = []
    @State private var screenshotImages: [UIImage] = []
    @State private var screenshotUrls: [String] = []
    @State private var tags: [String]
    @State private var tagInput = ""
    @State private var selectedCategory: String
    @State private var changelog = ""
    @State private var isPublishing = false
    @State private var errorMessage: String?
    @State private var isUploadingScreenshots = false
    @State private var isLoadingInitialScreenshots = false

    @Environment(\.dismiss) private var dismiss

    var isUpdate: Bool { existingProjectId != nil }

    static let contentCategories: [(String, String)] = [
        ("script", "Script"),
        ("game_system", "Game System"),
        ("ui", "UI"),
        ("character", "Character"),
        ("weapon", "Weapon"),
        ("vehicle", "Vehicle"),
        ("building", "Building"),
        ("map", "Map"),
        ("pet", "Pet"),
        ("ugc_clothing", "UGC Clothing"),
        ("ugc_accessory", "UGC Accessory"),
        ("avatar_body", "Avatar Body"),
        ("furniture_prop", "Furniture & Props"),
        ("item_tool", "Item / Tool"),
        ("decal_texture", "Decal / Texture"),
        ("plugin", "Plugin"),
        ("animation", "Animation"),
        ("audio", "Audio"),
        ("effect", "Effect"),
        ("other", "Other"),
    ]

    static let suggestedTags: [String] = [
        "Obby", "Tycoon", "Simulator", "RPG", "Horror", "Fighting",
        "Racing", "Adventure", "Roleplay", "Survival", "Puzzle",
        "FPS", "Tower Defense", "Open World", "Anime", "PvP",
    ]

    init(
        initialTitle: String,
        initialDescription: String,
        artifactIds: [String],
        projectKind: String,
        existingProjectId: String? = nil,
        existingTags: [String] = [],
        existingCategory: String? = nil,
        initialScreenshotURLs: [URL] = [],
        onPublished: @escaping (String) -> Void
    ) {
        self.initialTitle = initialTitle
        self.initialDescription = initialDescription
        self.artifactIds = artifactIds
        self.projectKind = projectKind
        self.existingProjectId = existingProjectId
        self.initialScreenshotURLs = initialScreenshotURLs
        self.onPublished = onPublished
        _title = State(initialValue: initialTitle)
        _descriptionText = State(initialValue: initialDescription)
        _tags = State(initialValue: existingTags)
        _selectedCategory = State(initialValue: existingCategory ?? "other")
    }

    var body: some View {
        NavigationStack {
            ZStack {
                LinearGradient(
                    colors: [.gradientTop, .gradientBottom],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                .ignoresSafeArea()

                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 20) {
                        titleSection
                        descriptionSection
                        screenshotsSection
                        categorySection
                        tagsSection
                        if isUpdate {
                            changelogSection
                        }
                        if let errorMessage {
                            errorBanner(errorMessage)
                        }
                        publishButton
                    }
                    .padding(20)
                    .padding(.bottom, 40)
                }
            }
            .navigationTitle(isUpdate ? "Update Publication" : "Publish to Community")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .foregroundColor(.textSecondary)
                }
            }
        }
        .dismissKeyboardOnTap()
        .interactiveDismissDisabled(isPublishing)
        .onChange(of: selectedPhotos) {
            loadSelectedPhotos()
        }
        .task {
            guard !initialScreenshotURLs.isEmpty, screenshotImages.isEmpty else { return }
            isLoadingInitialScreenshots = true
            for url in initialScreenshotURLs.prefix(5) {
                do {
                    let (data, _) = try await URLSession.shared.data(from: url)
                    if let image = UIImage(data: data) {
                        screenshotImages.append(image)
                        screenshotUrls.append(url.absoluteString)
                    }
                } catch {
                    continue
                }
            }
            isLoadingInitialScreenshots = false
        }
    }

    // MARK: - Title

    private var titleSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionLabel("Title")
            TextField("Project title", text: $title)
                .font(.appBody)
                .foregroundColor(.textPrimary)
                .padding(14)
                .background(Color.cardBackground)
                .clipShape(RoundedRectangle(cornerRadius: 14))
        }
    }

    // MARK: - Description

    private var descriptionSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionLabel("Description")
            TextEditor(text: $descriptionText)
                .font(.appBody)
                .foregroundColor(.textPrimary)
                .scrollContentBackground(.hidden)
                .frame(minHeight: 100)
                .padding(14)
                .background(Color.cardBackground)
                .clipShape(RoundedRectangle(cornerRadius: 14))
        }
    }

    // MARK: - Screenshots

    private var screenshotsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                sectionLabel("Screenshots")
                Spacer()
                Text("\(screenshotImages.count)/5")
                    .font(.appCaption)
                    .foregroundColor(.textSecondary)
            }

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(Array(screenshotImages.enumerated()), id: \.offset) { index, image in
                        screenshotThumbnail(image: image, index: index)
                    }

                    if screenshotImages.count < 5 {
                        PhotosPicker(
                            selection: $selectedPhotos,
                            maxSelectionCount: 5 - screenshotImages.count,
                            matching: .images
                        ) {
                            VStack(spacing: 6) {
                                Image(systemName: "plus.circle.fill")
                                    .font(.system(size: 28))
                                    .foregroundColor(.accentPrimary)
                                Text("Add")
                                    .font(.appCaption)
                                    .foregroundColor(.textSecondary)
                            }
                            .frame(width: 120, height: 90)
                            .background(Color.cardBackground)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                            .overlay(
                                RoundedRectangle(cornerRadius: 12)
                                    .strokeBorder(
                                        Color.accentPrimary.opacity(0.3),
                                        style: StrokeStyle(lineWidth: 1.5, dash: [6])
                                    )
                            )
                        }
                    }
                }
            }

            if isLoadingInitialScreenshots {
                HStack(spacing: 8) {
                    ProgressView().scaleEffect(0.8)
                    Text("Loading preview images...")
                        .font(.appCaption)
                        .foregroundColor(.textSecondary)
                }
            }

            if isUploadingScreenshots {
                HStack(spacing: 8) {
                    ProgressView().scaleEffect(0.8)
                    Text("Uploading screenshots...")
                        .font(.appCaption)
                        .foregroundColor(.textSecondary)
                }
            }

            if needsScreenshot && screenshotImages.isEmpty {
                HStack(spacing: 6) {
                    Image(systemName: "exclamationmark.circle.fill")
                        .font(.system(size: 12))
                    Text("At least 1 image is required to publish")
                        .font(.appCaption)
                }
                .foregroundColor(.accentOrange)
            }
        }
    }

    private func screenshotThumbnail(image: UIImage, index: Int) -> some View {
        ZStack(alignment: .topTrailing) {
            Image(uiImage: image)
                .resizable()
                .aspectRatio(contentMode: .fill)
                .frame(width: 120, height: 90)
                .clipShape(RoundedRectangle(cornerRadius: 12))

            Button {
                withAnimation(.easeInOut(duration: 0.2)) {
                    screenshotImages.remove(at: index)
                    if index < screenshotUrls.count {
                        screenshotUrls.remove(at: index)
                    }
                }
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 20))
                    .foregroundStyle(.white, .black.opacity(0.5))
                    .shadow(radius: 2)
            }
            .offset(x: 6, y: -6)
        }
    }

    // MARK: - Category

    private var categorySection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionLabel("Category")

            Menu {
                ForEach(Self.contentCategories, id: \.0) { cat in
                    Button(cat.1) { selectedCategory = cat.0 }
                }
            } label: {
                HStack {
                    Text(
                        Self.contentCategories.first { $0.0 == selectedCategory }?.1
                            ?? "Select category"
                    )
                    .font(.appBody)
                    .foregroundColor(.textPrimary)
                    Spacer()
                    Image(systemName: "chevron.up.chevron.down")
                        .font(.system(size: 12))
                        .foregroundColor(.textSecondary)
                }
                .padding(14)
                .background(Color.cardBackground)
                .clipShape(RoundedRectangle(cornerRadius: 14))
            }
        }
    }

    // MARK: - Tags

    private var tagsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionLabel("Tags")

            if !tags.isEmpty {
                PublishFlowLayout(spacing: 8) {
                    ForEach(tags, id: \.self) { tag in
                        tagChip(tag)
                    }
                }
            }

            HStack {
                TextField("Add a tag...", text: $tagInput)
                    .font(.appBody)
                    .foregroundColor(.textPrimary)
                    .onSubmit { addTag() }

                if !tagInput.isEmpty {
                    Button(action: addTag) {
                        Image(systemName: "plus.circle.fill")
                            .foregroundColor(.accentPrimary)
                    }
                }
            }
            .padding(14)
            .background(Color.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: 14))

            let available = Self.suggestedTags.filter { !tags.contains($0) }
            if !available.isEmpty {
                Text("Suggested")
                    .font(.appCaption)
                    .foregroundColor(.textTertiary)

                PublishFlowLayout(spacing: 6) {
                    ForEach(available.prefix(12), id: \.self) { tag in
                        Button {
                            withAnimation(.easeInOut(duration: 0.2)) {
                                tags.append(tag)
                            }
                        } label: {
                            Text(tag)
                                .font(.appCaption)
                                .foregroundColor(.textSecondary)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 6)
                                .background(Color.cardBackground)
                                .clipShape(Capsule())
                        }
                    }
                }
            }
        }
    }

    private func tagChip(_ tag: String) -> some View {
        HStack(spacing: 4) {
            Text(tag)
                .font(.appCaption)
                .foregroundColor(.textPrimary)
            Button {
                withAnimation(.easeInOut(duration: 0.2)) {
                    tags.removeAll { $0 == tag }
                }
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(.textSecondary)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 7)
        .background(Color.accentPrimary.opacity(0.12))
        .clipShape(Capsule())
    }

    // MARK: - Changelog

    private var changelogSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionLabel("Changelog")
            Text("Describe what changed in this update")
                .font(.appCaption)
                .foregroundColor(.textSecondary)
            TextEditor(text: $changelog)
                .font(.appBody)
                .foregroundColor(.textPrimary)
                .scrollContentBackground(.hidden)
                .frame(minHeight: 80)
                .padding(14)
                .background(Color.cardBackground)
                .clipShape(RoundedRectangle(cornerRadius: 14))
        }
    }

    // MARK: - Helpers

    private func sectionLabel(_ text: String) -> some View {
        Text(text)
            .font(.appHeadline)
            .foregroundColor(.textPrimary)
    }

    private func errorBanner(_ message: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundColor(.red)
            Text(message)
                .font(.appCaption)
                .foregroundColor(.red)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.red.opacity(0.1))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private var publishButton: some View {
        PrimaryButton(
            title: isPublishing
                ? (isUpdate ? "Updating..." : "Publishing...")
                : (isUpdate ? "Update" : "Publish"),
            action: publish
        )
        .disabled(!canPublish)
        .opacity(canPublish ? 1 : 0.5)
    }

    private var needsScreenshot: Bool {
        selectedCategory != "audio" && !isUpdate
    }

    private var canPublish: Bool {
        !isPublishing
            && !title.trimmingCharacters(in: .whitespaces).isEmpty
            && !descriptionText.trimmingCharacters(in: .whitespaces).isEmpty
            && (!needsScreenshot || !screenshotImages.isEmpty)
    }

    // MARK: - Actions

    private func addTag() {
        let trimmed = tagInput.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty, !tags.contains(trimmed) else { return }
        withAnimation(.easeInOut(duration: 0.2)) {
            tags.append(trimmed)
        }
        tagInput = ""
    }

    private func loadSelectedPhotos() {
        Task {
            var loaded: [UIImage] = []
            for item in selectedPhotos {
                if let data = try? await item.loadTransferable(type: Data.self),
                   let image = UIImage(data: data) {
                    loaded.append(image)
                }
            }
            await MainActor.run {
                screenshotImages.append(contentsOf: loaded)
                if screenshotImages.count > 5 {
                    screenshotImages = Array(screenshotImages.prefix(5))
                }
                selectedPhotos = []
            }
        }
    }

    private func uploadScreenshots() async -> [String] {
        var urls: [String] = []
        for (index, image) in screenshotImages.enumerated() {
            if index < screenshotUrls.count {
                urls.append(screenshotUrls[index])
                continue
            }
            guard let jpeg = image.jpegData(compressionQuality: 0.85) else { continue }
            do {
                let asset = try await AIWorkspaceAPI.ingestAttachment(
                    type: "image",
                    name: "screenshot_\(index + 1).jpg",
                    mimeType: "image/jpeg",
                    contentBase64: jpeg.base64EncodedString()
                )
                if let url = asset.downloadUrl {
                    urls.append(url)
                }
            } catch {
                continue
            }
        }
        return urls
    }

    private func publish() {
        guard canPublish else { return }
        isPublishing = true
        errorMessage = nil

        Task {
            do {
                var uploadedUrls: [String] = []
                if !screenshotImages.isEmpty {
                    await MainActor.run { isUploadingScreenshots = true }
                    uploadedUrls = await uploadScreenshots()
                    await MainActor.run { isUploadingScreenshots = false }
                }

                if let projectId = existingProjectId {
                    _ = try await AIWorkspaceAPI.updateProject(
                        projectId: projectId,
                        title: title.trimmed,
                        description: descriptionText.trimmed,
                        tags: tags,
                        screenshotUrls: uploadedUrls.isEmpty ? nil : uploadedUrls,
                        changelog: changelog.trimmed.isEmpty ? nil : changelog.trimmed
                    )
                    await MainActor.run {
                        onPublished(projectId)
                        dismiss()
                    }
                } else {
                    let response = try await AIWorkspaceAPI.publishProject(
                        title: title.trimmed,
                        description: descriptionText.trimmed,
                        projectKind: projectKind,
                        artifactIds: artifactIds,
                        tags: tags,
                        screenshotUrls: uploadedUrls,
                        category: selectedCategory
                    )
                    await MainActor.run {
                        onPublished(response.project.id)
                        dismiss()
                    }
                }
            } catch {
                await MainActor.run {
                    isPublishing = false
                    isUploadingScreenshots = false
                    errorMessage = error.localizedDescription
                }
            }
        }
    }
}

// MARK: - Flow Layout

struct PublishFlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        computeLayout(maxWidth: proposal.width ?? .infinity, subviews: subviews).size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = computeLayout(maxWidth: bounds.width, subviews: subviews)
        for (index, frame) in result.frames.enumerated() where index < subviews.count {
            subviews[index].place(
                at: CGPoint(x: bounds.minX + frame.minX, y: bounds.minY + frame.minY),
                proposal: .init(frame.size)
            )
        }
    }

    private func computeLayout(maxWidth: CGFloat, subviews: Subviews) -> (size: CGSize, frames: [CGRect]) {
        var frames: [CGRect] = []
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > maxWidth, x > 0 {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            frames.append(CGRect(origin: CGPoint(x: x, y: y), size: size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }

        return (CGSize(width: maxWidth, height: y + rowHeight), frames)
    }
}

private extension String {
    var trimmed: String { trimmingCharacters(in: .whitespaces) }
}
