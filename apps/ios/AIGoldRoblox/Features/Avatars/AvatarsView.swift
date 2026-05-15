//
//  AvatarsView.swift
//  AIGoldRoblox
//
//  Каталог аватаров
//

import SwiftUI
import UIKit

struct LibraryView: View {
    @EnvironmentObject private var appState: AppState

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 22) {
                titleBlock
                savedCharactersSection
                projectsSection
                editorsSection
                exportsSection
            }
            .padding(16)
            .padding(.bottom, LayoutMetrics.floatingTabBarClearance)
        }
        .background(
            LinearGradient(colors: [.gradientTop, .gradientBottom], startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()
        )
        .navigationTitle("Library")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var titleBlock: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Projects, editors and export history.")
                .font(.appBody)
                .foregroundColor(.textSecondary)

            HStack(spacing: 12) {
                SummaryCapsule(title: "Projects", value: "\(appState.projectSummaries.count)", color: .accentPrimary)
                SummaryCapsule(title: "Exports", value: "\(appState.exportRecords.count)", color: .accentOrange)
                SummaryCapsule(title: "Characters", value: "\(appState.savedAvatarLooks.count)", color: .accentTeal)
                SummaryCapsule(title: "Focus", value: appState.creationFocus.rawValue, color: .accentSecondary)
            }
        }
    }

    private var savedCharactersSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader("Saved Characters")

            if appState.savedAvatarLooks.isEmpty {
                Text("Saved characters from the 3D editor will appear here.")
                    .font(.appCaption)
                    .foregroundColor(.textSecondary)
                    .padding(16)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.cardBackground)
                    .clipShape(RoundedRectangle(cornerRadius: 18))
            } else {
                ForEach(appState.savedAvatarLooks) { look in
                    HStack(spacing: 14) {
                        Group {
                            if let data = try? Data(contentsOf: appState.previewURL(for: look)),
                               let image = UIImage(data: data) {
                                Image(uiImage: image)
                                    .resizable()
                                    .scaledToFill()
                            } else {
                                LinearGradient(colors: [.accentPrimary.opacity(0.35), .accentSecondary.opacity(0.25)], startPoint: .topLeading, endPoint: .bottomTrailing)
                                    .overlay(
                                        Image(systemName: "person.crop.square")
                                            .font(.system(size: 22, weight: .semibold))
                                            .foregroundColor(.white)
                                    )
                            }
                        }
                        .frame(width: 72, height: 72)
                        .clipShape(RoundedRectangle(cornerRadius: 18))

                        VStack(alignment: .leading, spacing: 6) {
                            Text(look.name)
                                .font(.appHeadline)
                                .foregroundColor(.textPrimary)
                            Text("\(look.rigType) • \(look.bodyType)")
                                .font(.appCaption)
                                .foregroundColor(.accentTeal)
                            Text(savedCharacterDateFormatter.string(from: look.createdAt))
                                .font(.appCaption)
                                .foregroundColor(.textSecondary)
                        }

                        Spacer()

                        Image(systemName: "checkmark.circle.fill")
                            .foregroundColor(.accentPrimary)
                    }
                    .padding(16)
                    .background(Color.cardBackground)
                    .clipShape(RoundedRectangle(cornerRadius: 18))
                }
            }
        }
    }

    private var projectsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader("Projects")
            if appState.projectSummaries.isEmpty {
                emptySectionCard("No real projects yet.")
            } else {
                ForEach(appState.projectSummaries) { project in
                    Button {
                        appState.resumeProject(project)
                    } label: {
                        VStack(alignment: .leading, spacing: 12) {
                            HStack {
                                Label(project.kind.rawValue, systemImage: project.kind.icon)
                                    .font(.appCaption)
                                    .foregroundColor(project.accentColor)
                                Spacer()
                                Text(project.status)
                                    .font(.appCaption)
                                    .foregroundColor(.textSecondary)
                            }

                            Text(project.title)
                                .font(.appHeadline)
                                .foregroundColor(.textPrimary)

                            Text(project.subtitle)
                                .font(.appCallout)
                                .foregroundColor(.textSecondary)

                            ProgressView(value: project.progress)
                                .tint(project.accentColor)

                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 8) {
                                    ForEach(project.tags, id: \.self) { tag in
                                        Text(tag)
                                            .font(.system(size: 11, weight: .bold, design: .rounded))
                                            .foregroundColor(project.accentColor)
                                            .padding(.horizontal, 10)
                                            .padding(.vertical, 7)
                                            .background(project.accentColor.opacity(0.12))
                                            .clipShape(Capsule())
                                    }
                                }
                            }
                        }
                        .padding(18)
                        .background(Color.cardBackground)
                        .clipShape(RoundedRectangle(cornerRadius: 22))
                        .overlay(
                            RoundedRectangle(cornerRadius: 22)
                                .stroke(project.accentColor.opacity(0.16), lineWidth: 1)
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var editorsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader("Editors")

            // FORGE Editor временно скрыт — будем дорабатывать. Оставляем код
            // на месте, чтобы быстро вернуть тайл без восстановления из истории.
            // NavigationLink {
            //     EditorContentView()
            // } label: {
            //     EditorTile(
            //         title: "FORGE Editor",
            //         subtitle: "Avatar, clothing, stickers, loops and game export.",
            //         icon: "paintbrush.pointed.fill",
            //         color: .accentPrimary
            //     )
            // }
            // .buttonStyle(.plain)

            NavigationLink {
                ChatView()
            } label: {
                EditorTile(
                    title: "AI Workspace",
                    subtitle: "Opens the AI workspace shell. Real backend required for live responses.",
                    icon: "waveform.badge.mic",
                    color: .accentSecondary
                )
            }
            .buttonStyle(.plain)
        }
    }

    private var exportsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader("Exports")
            if appState.exportRecords.isEmpty {
                emptySectionCard("No real exports yet.")
            } else {
                ForEach(appState.exportRecords) { export in
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(export.title)
                                .font(.appHeadline)
                                .foregroundColor(.textPrimary)
                            Text("\(export.format) • \(export.destination)")
                                .font(.appCaption)
                                .foregroundColor(.textSecondary)
                        }

                        Spacer()

                        Image(systemName: "arrow.up.right.square.fill")
                            .foregroundColor(.accentOrange)
                    }
                    .padding(16)
                    .background(Color.cardBackground)
                    .clipShape(RoundedRectangle(cornerRadius: 18))
                }
            }
        }
    }

    private func sectionHeader(_ title: String) -> some View {
        Text(title.uppercased())
            .font(.system(size: 18, weight: .black, design: .rounded))
            .foregroundColor(.textPrimary)
    }

    private func emptySectionCard(_ text: String) -> some View {
        Text(text)
            .font(.appCaption)
            .foregroundColor(.textSecondary)
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: 18))
    }
}

typealias AvatarsView = LibraryView

private let savedCharacterDateFormatter: DateFormatter = {
    let formatter = DateFormatter()
    formatter.dateStyle = .medium
    formatter.timeStyle = .short
    return formatter
}()

private struct SummaryCapsule: View {
    let title: String
    let value: String
    let color: Color

    var body: some View {
        VStack(spacing: 5) {
            Text(value)
                .font(.system(size: 18, weight: .black, design: .rounded))
                .foregroundColor(color)
            Text(title)
                .font(.appCaption)
                .foregroundColor(.textSecondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14)
        .background(Color.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 18))
    }
}

private struct EditorTile: View {
    let title: String
    let subtitle: String
    let icon: String
    let color: Color

    var body: some View {
        HStack(spacing: 14) {
            RoundedRectangle(cornerRadius: 16)
                .fill(color.opacity(0.14))
                .frame(width: 54, height: 54)
                .overlay(
                    Image(systemName: icon)
                        .font(.system(size: 22, weight: .semibold))
                        .foregroundColor(color)
                )

            VStack(alignment: .leading, spacing: 4) {
                TechnicalText(title, baseFont: .appHeadline, technicalFont: .appTechnical(size: 16, weight: .bold))
                    .foregroundColor(.textPrimary)
                TechnicalText(subtitle, baseFont: .appCaption, technicalFont: .appTechnical(size: 12, weight: .semibold))
                    .foregroundColor(.textSecondary)
            }

            Spacer()

            Image(systemName: "chevron.right")
                .foregroundColor(.textTertiary)
        }
        .padding(18)
        .background(Color.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 20))
        .overlay(
            RoundedRectangle(cornerRadius: 20)
                .stroke(color.opacity(0.12), lineWidth: 1)
        )
    }
}
