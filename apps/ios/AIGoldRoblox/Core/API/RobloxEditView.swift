// RobloxEditView.swift — Release 4 "Fix" category screen: edit an EXISTING
// Roblox model (.rbxm) or place (.rbxl) by natural language. Launched from the
// Forge "🩺 Fix" tile `roblox_edit` (mirrors the tiktok_export tile → studio
// pivot). Talks to the live backend via RobloxEditAPIClient (/api/roblox/edit).
//
// Self-contained tool screen (pick file → describe → edit → share result) so it
// stays off the core ChatStore send/dispatch path. Sibling Fix tiles (AI Luau
// Doctor / AI Game Analyst) use the chat interview; this one is a focused
// upload→transform→download tool.

import SwiftUI
import UniformTypeIdentifiers

struct RobloxEditView: View {
    @Environment(\.dismiss) private var dismiss

    @State private var pickedURL: URL?
    @State private var pickedName: String = ""
    @State private var target: RobloxEditTarget = .model
    @State private var requestText: String = ""
    @State private var isShowingImporter = false
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var resultURL: URL?
    @State private var resultSummary: String?

    private var rbxTypes: [UTType] {
        [
            UTType(filenameExtension: "rbxm") ?? .data,
            UTType(filenameExtension: "rbxl") ?? .data,
            UTType(filenameExtension: "rbxmx") ?? .data,
            UTType(filenameExtension: "rbxlx") ?? .data,
        ]
    }

    private var canRun: Bool {
        pickedURL != nil && !requestText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        ZStack {
            LinearGradient(colors: [.gradientTop, .gradientBottom],
                           startPoint: .topLeading, endPoint: .bottomTrailing)
                .ignoresSafeArea()
            ScrollView { content.padding(20) }
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                Button(action: { dismiss() }) {
                    Image(systemName: "xmark.circle.fill")
                        .font(.title2).foregroundColor(.textSecondary)
                }
            }
            ToolbarItem(placement: .principal) {
                Text(loc(en: "AI Model / Place Editor", ru: "AI Model / Place Editor"))
                    .font(.appHeadline).foregroundColor(.textPrimary)
            }
        }
        .fileImporter(isPresented: $isShowingImporter,
                      allowedContentTypes: rbxTypes,
                      allowsMultipleSelection: false) { result in
            handlePick(result)
        }
    }

    @ViewBuilder
    private var content: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(loc(en: "Upload a Roblox model (.rbxm) or place (.rbxl), describe the change in plain words, and get an edited file back.",
                     ru: "Загрузи модель (.rbxm) или место (.rbxl) Roblox, опиши правку обычными словами — получи изменённый файл."))
                .font(.appCaption).foregroundColor(.textSecondary)

            Button(action: { isShowingImporter = true }) {
                HStack(spacing: 10) {
                    Image(systemName: pickedURL == nil ? "doc.badge.plus" : "doc.fill")
                    Text(pickedURL == nil
                         ? loc(en: "Pick .rbxm / .rbxl", ru: "Выбрать .rbxm / .rbxl")
                         : pickedName)
                        .lineLimit(1)
                    Spacer()
                    if pickedURL != nil {
                        Text(target == .place ? "place" : "model")
                            .font(.appCaption).foregroundColor(.textSecondary)
                    }
                }
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.cardBackground)
                .clipShape(RoundedRectangle(cornerRadius: 14))
            }
            .buttonStyle(.plain)
            .foregroundColor(.textPrimary)

            Text(loc(en: "What to change", ru: "Что изменить"))
                .font(.appCaption).foregroundColor(.textSecondary)
            TextField(loc(en: "e.g. make the car red, add a second floor",
                          ru: "напр.: покрась машину в красный, добавь второй этаж"),
                      text: $requestText, axis: .vertical)
                .lineLimit(2...5)
                .padding(12)
                .background(Color.cardBackground)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .foregroundColor(.textPrimary)

            Button(action: { Task { await runEdit() } }) {
                HStack(spacing: 8) {
                    if isLoading { ProgressView().tint(.white) }
                    Text(loc(en: "Apply Edit", ru: "Применить правку")).bold()
                }
                .frame(maxWidth: .infinity)
                .padding(14)
            }
            .background(canRun && !isLoading ? Color.accentPrimary : Color.gray.opacity(0.4))
            .foregroundColor(.white)
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .disabled(!canRun || isLoading)

            if let errorMessage {
                Text(errorMessage).font(.appCaption).foregroundColor(.red)
            }

            if let resultURL, let resultSummary {
                VStack(alignment: .leading, spacing: 10) {
                    Label(loc(en: "Done", ru: "Готово"), systemImage: "checkmark.seal.fill")
                        .foregroundColor(.green).font(.appHeadline)
                    Text(resultSummary).font(.appCaption).foregroundColor(.textSecondary)
                    ShareLink(item: resultURL) {
                        Label(loc(en: "Save edited file", ru: "Сохранить файл"),
                              systemImage: "square.and.arrow.up")
                    }
                    .buttonStyle(.borderedProminent)
                }
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.cardBackground)
                .clipShape(RoundedRectangle(cornerRadius: 14))
            }
        }
    }

    private func handlePick(_ result: Result<[URL], Error>) {
        switch result {
        case .success(let urls):
            guard let url = urls.first else { return }
            pickedURL = url
            pickedName = url.lastPathComponent
            target = RobloxEditTarget.infer(fromFileName: url.lastPathComponent)
            errorMessage = nil
            resultURL = nil
            resultSummary = nil
        case .failure(let err):
            errorMessage = err.localizedDescription
        }
    }

    private func runEdit() async {
        guard let url = pickedURL else { return }
        await MainActor.run {
            isLoading = true
            errorMessage = nil
            resultURL = nil
            resultSummary = nil
        }
        do {
            let base64 = try readFileBase64(url)
            let resp = try await RobloxEditAPIClient.edit(
                inputBase64: base64,
                target: target,
                request: requestText
            )
            guard let data = resp.outputData else {
                throw RobloxEditAPIError.underlying(
                    NSError(domain: "RobloxEdit", code: -1,
                            userInfo: [NSLocalizedDescriptionKey: "Empty edited file"])
                )
            }
            let outURL = try writeTempResult(data: data, target: resp.target)
            let scope = resp.scopeUsed ?? ""
            let scopeNote = scope.isEmpty ? "" : " · scope \(scope)"
            await MainActor.run {
                resultURL = outURL
                resultSummary = loc(
                    en: "Applied \(resp.opsApplied) edit(s)\(scopeNote)",
                    ru: "Применено правок: \(resp.opsApplied)\(scopeNote)"
                )
                isLoading = false
            }
        } catch {
            await MainActor.run {
                errorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
                isLoading = false
            }
        }
    }

    private func readFileBase64(_ url: URL) throws -> String {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        let data = try Data(contentsOf: url)
        return data.base64EncodedString()
    }

    private func writeTempResult(data: Data, target: String) throws -> URL {
        let ext = target == "place" ? "rbxl" : "rbxm"
        let base = (pickedName as NSString).deletingPathExtension
        let name = "\(base.isEmpty ? "edited" : base)-edited.\(ext)"
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(name)
        try? FileManager.default.removeItem(at: url)
        try data.write(to: url)
        return url
    }
}
