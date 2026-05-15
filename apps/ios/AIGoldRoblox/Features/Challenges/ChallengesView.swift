import SwiftUI
import UIKit

// MARK: - Challenges View

struct ChallengesView: View {
    @EnvironmentObject private var appState: AppState
    @StateObject private var store = ChallengesStore()
    @State private var selectedTab: ChallengeTab = .active

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 20) {
                tabPicker

                switch selectedTab {
                case .active:
                    activeChallengeSection
                case .voting:
                    votingSection
                case .history:
                    historySection
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .padding(.bottom, 100)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(
            LinearGradient(colors: [.gradientTop, .gradientBottom], startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()
        )
        .navigationTitle("Challenges")
        // Inline title avoids large-title collapse glitches when switching tabs (active/history/voting)
        // inside a single ScrollView — previously the large header overlapped the voting section.
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await store.loadChallenges() }
        .task { await store.loadChallenges() }
    }

    // MARK: - Tab Picker

    private var tabPicker: some View {
        HStack(spacing: 8) {
            ForEach(ChallengeTab.allCases) { tab in
                Button {
                    withAnimation(.easeInOut(duration: 0.2)) { selectedTab = tab }
                } label: {
                    Text(tab.rawValue)
                        .font(.system(size: 14, weight: .bold, design: .rounded))
                        .foregroundColor(selectedTab == tab ? .white : .textSecondary)
                        .padding(.horizontal, 18)
                        .padding(.vertical, 10)
                        .background(selectedTab == tab ? Color.accentPrimary : Color.cardBackground)
                        .clipShape(Capsule())
                        .overlay(
                            Capsule()
                                .stroke(Color.accentPrimary.opacity(selectedTab == tab ? 0 : 0.15), lineWidth: 1)
                        )
                }
                .buttonStyle(.plain)
            }
        }
    }

    // MARK: - Active Challenge

    @ViewBuilder
    private var activeChallengeSection: some View {
        if store.isLoading {
            challengeLoadingPlaceholder
        } else if let challenge = store.activeChallenge {
            ActiveChallengeCard(challenge: challenge, store: store)
        } else {
            activeChallengeEmptyState
        }
    }

    private var activeChallengeEmptyState: some View {
        VStack(spacing: 16) {
            Image(systemName: "trophy")
                .font(.system(size: 40, weight: .bold))
                .foregroundColor(.accentPrimary.opacity(0.5))
            Text("No Active Challenge")
                .font(.system(size: 18, weight: .bold, design: .rounded))
                .foregroundColor(.textPrimary)
            Text("Check back soon — a new challenge starts every week!")
                .font(.system(size: 14, weight: .medium, design: .rounded))
                .foregroundColor(.textSecondary)
                .multilineTextAlignment(.center)
            Button {
                appState.setSelectedRootTab(.create)
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "plus.circle.fill")
                    Text("Create a Project")
                }
                .font(.system(size: 15, weight: .bold, design: .rounded))
                .foregroundColor(.white)
                .padding(.horizontal, 24)
                .padding(.vertical, 13)
                .background(Color.accentPrimary)
                .clipShape(Capsule())
            }
            .buttonStyle(.plain)
            .padding(.top, 4)
        }
        .padding(.top, 60)
    }

    // MARK: - Voting

    @ViewBuilder
    private var votingSection: some View {
        if store.isLoading {
            challengeLoadingPlaceholder
        } else if let challenge = store.votingChallenge {
            VotingChallengeCard(challenge: challenge, store: store)
        } else {
            VStack(spacing: 16) {
                Image(systemName: "hand.thumbsup")
                    .font(.system(size: 40, weight: .bold))
                    .foregroundColor(.accentPrimary.opacity(0.5))
                Text("No Voting Right Now")
                    .font(.system(size: 18, weight: .bold, design: .rounded))
                    .foregroundColor(.textPrimary)
                Text("Voting opens when a challenge's submission period ends.")
                    .font(.system(size: 14, weight: .medium, design: .rounded))
                    .foregroundColor(.textSecondary)
                    .multilineTextAlignment(.center)
                Button {
                    appState.setSelectedRootTab(.create)
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "plus.circle.fill")
                        Text("Create a Project")
                    }
                    .font(.system(size: 15, weight: .bold, design: .rounded))
                    .foregroundColor(.white)
                    .padding(.horizontal, 24)
                    .padding(.vertical, 13)
                    .background(Color.accentPrimary)
                    .clipShape(Capsule())
                }
                .buttonStyle(.plain)
                .padding(.top, 4)
            }
            .padding(.top, 60)
        }
    }

    // MARK: - History

    @ViewBuilder
    private var historySection: some View {
        if store.isLoading {
            challengeLoadingPlaceholder
        } else if store.completedChallenges.isEmpty {
            emptyState(icon: "clock.arrow.circlepath", title: "No Past Challenges", subtitle: "Completed challenges will appear here.")
        } else {
            LazyVStack(spacing: 14) {
                ForEach(store.completedChallenges) { challenge in
                    CompletedChallengeRow(challenge: challenge)
                }
            }
        }
    }

    // MARK: - Helpers

    private var challengeLoadingPlaceholder: some View {
        VStack(spacing: 16) {
            ForEach(0..<2, id: \.self) { _ in
                RoundedRectangle(cornerRadius: 20)
                    .fill(Color.cardBackground)
                    .frame(height: 180)
                    .overlay(ProgressView())
            }
        }
    }

    private func emptyState(icon: String, title: String, subtitle: String) -> some View {
        VStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 40, weight: .bold))
                .foregroundColor(.accentPrimary.opacity(0.5))
            Text(title)
                .font(.system(size: 18, weight: .bold, design: .rounded))
                .foregroundColor(.textPrimary)
            Text(subtitle)
                .font(.system(size: 14, weight: .medium, design: .rounded))
                .foregroundColor(.textSecondary)
                .multilineTextAlignment(.center)
        }
        .padding(.top, 60)
    }
}

// MARK: - Tab Enum

private enum ChallengeTab: String, CaseIterable, Identifiable {
    case active = "Active"
    case voting = "Voting"
    case history = "History"

    var id: String { rawValue }
}

// MARK: - Active Challenge Card

private struct ActiveChallengeCard: View {
    let challenge: AIWorkspaceAPI.Challenge
    @ObservedObject var store: ChallengesStore
    @State private var showSubmitSheet = false

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 10) {
                Image(systemName: challenge.typeIcon)
                    .font(.system(size: 22, weight: .bold))
                    .foregroundColor(.white)
                    .frame(width: 44, height: 44)
                    .background(Color.accentPrimary)
                    .clipShape(RoundedRectangle(cornerRadius: 14))

                VStack(alignment: .leading, spacing: 2) {
                    Text(challenge.title)
                        .font(.system(size: 18, weight: .black, design: .rounded))
                        .foregroundColor(.textPrimary)
                    HStack(spacing: 6) {
                        Text(challenge.typeLabel.uppercased())
                            .font(.system(size: 11, weight: .bold, design: .rounded))
                            .foregroundColor(.accentPrimary)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(Color.accentPrimary.opacity(0.12))
                            .clipShape(Capsule())
                        Text("\(challenge.submissionCount) submissions")
                            .font(.system(size: 12, weight: .medium, design: .rounded))
                            .foregroundColor(.textSecondary)
                    }
                }

                Spacer()
            }

            Text(challenge.description)
                .font(.system(size: 14, weight: .medium, design: .rounded))
                .foregroundColor(.textSecondary)
                .fixedSize(horizontal: false, vertical: true)

            if !challenge.rules.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Text("RULES")
                        .font(.system(size: 11, weight: .bold, design: .rounded))
                        .foregroundColor(.accentPrimary)
                    ForEach(Array(challenge.rules.enumerated()), id: \.offset) { _, rule in
                        HStack(alignment: .top, spacing: 6) {
                            Circle()
                                .fill(Color.accentPrimary)
                                .frame(width: 5, height: 5)
                                .padding(.top, 6)
                            Text(rule)
                                .font(.system(size: 13, weight: .medium, design: .rounded))
                                .foregroundColor(.textSecondary)
                        }
                    }
                }
            }

            if let endDate = challenge.endDateParsed {
                ChallengeCountdownView(targetDate: endDate, label: "Submissions close in")
            }

            if !challenge.prizes.isEmpty {
                PrizesView(prizes: challenge.prizes)
            }

            Button {
                showSubmitSheet = true
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "paperplane.fill")
                    Text("Submit Your Project")
                }
                .font(.system(size: 16, weight: .bold, design: .rounded))
                .foregroundColor(.white)
                .frame(maxWidth: .infinity, minHeight: 52)
                .background(Color.accentPrimary)
                .clipShape(RoundedRectangle(cornerRadius: 16))
            }
            .buttonStyle(.plain)
        }
        .padding(18)
        .background(Color.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 22))
        .overlay(
            RoundedRectangle(cornerRadius: 22)
                .stroke(Color.accentPrimary.opacity(0.12), lineWidth: 1)
        )
        .sheet(isPresented: $showSubmitSheet) {
            SubmitToChallengeSheet(challengeId: challenge.id, store: store)
        }
    }
}

// MARK: - Voting Challenge Card

private struct VotingChallengeCard: View {
    let challenge: AIWorkspaceAPI.Challenge
    @ObservedObject var store: ChallengesStore

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 10) {
                Image(systemName: "hand.thumbsup.fill")
                    .font(.system(size: 22, weight: .bold))
                    .foregroundColor(.white)
                    .frame(width: 44, height: 44)
                    .background(Color.accentSecondary)
                    .clipShape(RoundedRectangle(cornerRadius: 14))

                VStack(alignment: .leading, spacing: 2) {
                    Text(challenge.title)
                        .font(.system(size: 18, weight: .black, design: .rounded))
                        .foregroundColor(.textPrimary)
                    Text("VOTING OPEN")
                        .font(.system(size: 11, weight: .bold, design: .rounded))
                        .foregroundColor(.accentSecondary)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(Color.accentSecondary.opacity(0.12))
                        .clipShape(Capsule())
                }

                Spacer()
            }

            Text(challenge.description)
                .font(.system(size: 14, weight: .medium, design: .rounded))
                .foregroundColor(.textSecondary)

            if let votingEnd = challenge.votingEndDateParsed {
                ChallengeCountdownView(targetDate: votingEnd, label: "Voting ends in")
            }

            if store.isLoadingDetail {
                ProgressView("Loading submissions...")
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 20)
            } else {
                SubmissionVotingGrid(
                    submissions: store.votingSubmissions,
                    userVotedProjectId: store.userVotedProjectId,
                    onVote: { projectId in
                        Task { await store.vote(challengeId: challenge.id, projectId: projectId) }
                    }
                )
            }
        }
        .padding(18)
        .background(Color.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 22))
        .overlay(
            RoundedRectangle(cornerRadius: 22)
                .stroke(Color.accentSecondary.opacity(0.12), lineWidth: 1)
        )
        .task { await store.loadChallengeDetail(id: challenge.id) }
    }
}

// MARK: - Submission Voting Grid

private struct SubmissionVotingGrid: View {
    let submissions: [AIWorkspaceAPI.ChallengeSubmission]
    let userVotedProjectId: String?
    let onVote: (String) -> Void

    private let columns = [
        GridItem(.flexible(), spacing: 12),
        GridItem(.flexible(), spacing: 12),
    ]

    var body: some View {
        if submissions.isEmpty {
            Text("No submissions yet")
                .font(.system(size: 14, weight: .medium, design: .rounded))
                .foregroundColor(.textSecondary)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 20)
        } else {
            LazyVGrid(columns: columns, spacing: 12) {
                ForEach(submissions) { sub in
                    SubmissionVoteCard(
                        submission: sub,
                        isVoted: userVotedProjectId == sub.projectId,
                        onVote: { onVote(sub.projectId) }
                    )
                }
            }
        }
    }
}

// MARK: - Submission Vote Card

private struct SubmissionVoteCard: View {
    let submission: AIWorkspaceAPI.ChallengeSubmission
    let isVoted: Bool
    let onVote: () -> Void
    @State private var image: UIImage?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ZStack(alignment: .topTrailing) {
                if let img = image {
                    Image(uiImage: img)
                        .resizable()
                        .scaledToFill()
                        .frame(height: 100)
                        .clipped()
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                } else {
                    RoundedRectangle(cornerRadius: 12)
                        .fill(Color.accentPrimary.opacity(0.08))
                        .frame(height: 100)
                        .overlay(
                            Image(systemName: "photo")
                                .font(.system(size: 24))
                                .foregroundColor(.textSecondary.opacity(0.4))
                        )
                }

                HStack(spacing: 4) {
                    Image(systemName: "heart.fill")
                        .font(.system(size: 10))
                    Text("\(submission.votes)")
                        .font(.system(size: 11, weight: .bold, design: .rounded))
                }
                .foregroundColor(.white)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(Color.black.opacity(0.55))
                .clipShape(Capsule())
                .padding(6)
            }

            Text(submission.title)
                .font(.system(size: 13, weight: .bold, design: .rounded))
                .foregroundColor(.textPrimary)
                .lineLimit(1)

            Text("by \(submission.authorName)")
                .font(.system(size: 11, weight: .medium, design: .rounded))
                .foregroundColor(.textSecondary)
                .lineLimit(1)

            Button(action: onVote) {
                HStack(spacing: 4) {
                    Image(systemName: isVoted ? "checkmark.circle.fill" : "hand.thumbsup")
                        .font(.system(size: 12, weight: .semibold))
                    Text(isVoted ? "Voted" : "Vote")
                        .font(.system(size: 13, weight: .bold, design: .rounded))
                }
                .foregroundColor(isVoted ? .white : .accentPrimary)
                .frame(maxWidth: .infinity, minHeight: 34)
                .background(isVoted ? Color.accentPrimary : Color.accentPrimary.opacity(0.1))
                .clipShape(RoundedRectangle(cornerRadius: 10))
            }
            .buttonStyle(.plain)
            .disabled(isVoted)
        }
        .padding(10)
        .background(Color.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(isVoted ? Color.accentPrimary.opacity(0.3) : Color.accentPrimary.opacity(0.06), lineWidth: 1)
        )
        .task {
            if let url = submission.previewUrls.first {
                image = await ImageCacheManager.shared.image(for: url)
            }
        }
    }
}

// MARK: - Completed Challenge Row

private struct CompletedChallengeRow: View {
    let challenge: AIWorkspaceAPI.Challenge

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                Image(systemName: challenge.typeIcon)
                    .font(.system(size: 18, weight: .bold))
                    .foregroundColor(.accentPrimary)
                    .frame(width: 36, height: 36)
                    .background(Color.accentPrimary.opacity(0.1))
                    .clipShape(RoundedRectangle(cornerRadius: 10))

                VStack(alignment: .leading, spacing: 2) {
                    Text(challenge.title)
                        .font(.system(size: 15, weight: .bold, design: .rounded))
                        .foregroundColor(.textPrimary)
                    HStack(spacing: 6) {
                        Text(challenge.typeLabel.uppercased())
                            .font(.system(size: 10, weight: .bold, design: .rounded))
                            .foregroundColor(.accentPrimary)
                        Text("\(challenge.submissionCount) entries")
                            .font(.system(size: 11, weight: .medium, design: .rounded))
                            .foregroundColor(.textSecondary)
                    }
                }

                Spacer()

                if !challenge.winnerIds.isEmpty {
                    Image(systemName: "trophy.fill")
                        .font(.system(size: 16))
                        .foregroundColor(.accentOrange)
                }
            }

            if !challenge.winnerIds.isEmpty {
                HStack(spacing: 6) {
                    Image(systemName: "crown.fill")
                        .font(.system(size: 11))
                        .foregroundColor(.accentOrange)
                    Text("\(challenge.winnerIds.count) winner\(challenge.winnerIds.count == 1 ? "" : "s")")
                        .font(.system(size: 12, weight: .semibold, design: .rounded))
                        .foregroundColor(.accentOrange)
                }
            }
        }
        .padding(16)
        .background(Color.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 18))
        .overlay(
            RoundedRectangle(cornerRadius: 18)
                .stroke(Color.accentPrimary.opacity(0.06), lineWidth: 1)
        )
    }
}

// MARK: - Countdown Timer

private struct ChallengeCountdownView: View {
    let targetDate: Date
    let label: String
    @State private var remaining: TimeInterval = 0

    private let timer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "clock.fill")
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(.accentOrange)

            Text(label)
                .font(.system(size: 12, weight: .semibold, design: .rounded))
                .foregroundColor(.textSecondary)

            Spacer()

            Text(formattedRemaining)
                .font(.system(size: 14, weight: .black, design: .monospaced))
                .foregroundColor(.accentOrange)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(Color.accentOrange.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .onReceive(timer) { _ in
            remaining = max(0, targetDate.timeIntervalSince(Date()))
        }
        .onAppear {
            remaining = max(0, targetDate.timeIntervalSince(Date()))
        }
    }

    private var formattedRemaining: String {
        let total = Int(remaining)
        let days = total / 86400
        let hours = (total % 86400) / 3600
        let minutes = (total % 3600) / 60
        let seconds = total % 60
        if days > 0 {
            return String(format: "%dd %02dh %02dm", days, hours, minutes)
        }
        return String(format: "%02d:%02d:%02d", hours, minutes, seconds)
    }
}

// MARK: - Prizes View

private struct PrizesView: View {
    let prizes: [AIWorkspaceAPI.ChallengePrize]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("PRIZES")
                .font(.system(size: 11, weight: .bold, design: .rounded))
                .foregroundColor(.accentOrange)

            ForEach(prizes, id: \.place) { prize in
                HStack(spacing: 10) {
                    Text(placeEmoji(prize.place))
                        .font(.system(size: 20))
                        .frame(width: 32)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(prize.title)
                            .font(.system(size: 13, weight: .bold, design: .rounded))
                            .foregroundColor(.textPrimary)
                        Text(prize.description)
                            .font(.system(size: 11, weight: .medium, design: .rounded))
                            .foregroundColor(.textSecondary)
                    }
                    Spacer()
                }
            }
        }
        .padding(12)
        .background(Color.accentOrange.opacity(0.06))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }

    private func placeEmoji(_ place: Int) -> String {
        switch place {
        case 1: return "🥇"
        case 2: return "🥈"
        case 3: return "🥉"
        default: return "🏅"
        }
    }
}

// MARK: - Submit Sheet

private struct SubmitToChallengeSheet: View {
    let challengeId: String
    @ObservedObject var store: ChallengesStore
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var appState: AppState
    @State private var selectedProjectId: String?
    @State private var isSubmitting = false
    @State private var error: String?
    @State private var submitted = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                if submitted {
                    VStack(spacing: 16) {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 60))
                            .foregroundColor(.green)
                        Text("Submitted!")
                            .font(.system(size: 22, weight: .black, design: .rounded))
                            .foregroundColor(.textPrimary)
                        Text("Your project has been entered into the challenge. Good luck!")
                            .font(.system(size: 15, weight: .medium, design: .rounded))
                            .foregroundColor(.textSecondary)
                            .multilineTextAlignment(.center)
                        Button("Done") { dismiss() }
                            .font(.system(size: 16, weight: .bold, design: .rounded))
                            .foregroundColor(.white)
                            .frame(maxWidth: .infinity, minHeight: 48)
                            .background(Color.accentPrimary)
                            .clipShape(RoundedRectangle(cornerRadius: 14))
                    }
                    .padding(24)
                } else if appState.projectSummaries.isEmpty {
                    VStack(spacing: 16) {
                        Image(systemName: "folder.badge.questionmark")
                            .font(.system(size: 40, weight: .bold))
                            .foregroundColor(.textSecondary.opacity(0.5))
                        Text("No Projects")
                            .font(.system(size: 18, weight: .bold, design: .rounded))
                            .foregroundColor(.textPrimary)
                        Text("Create a project first, then come back to submit it!")
                            .font(.system(size: 14, weight: .medium, design: .rounded))
                            .foregroundColor(.textSecondary)
                            .multilineTextAlignment(.center)
                        Button {
                            dismiss()
                            appState.setSelectedRootTab(.create)
                        } label: {
                            HStack(spacing: 8) {
                                Image(systemName: "plus.circle.fill")
                                Text("Create a Project")
                            }
                            .font(.system(size: 15, weight: .bold, design: .rounded))
                            .foregroundColor(.white)
                            .padding(.horizontal, 24)
                            .padding(.vertical, 13)
                            .background(Color.accentPrimary)
                            .clipShape(Capsule())
                        }
                        .buttonStyle(.plain)
                        .padding(.top, 4)
                    }
                    .padding(24)
                } else {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Select a project to submit:")
                            .font(.system(size: 16, weight: .bold, design: .rounded))
                            .foregroundColor(.textPrimary)
                            .padding(.horizontal, 16)

                        ScrollView {
                            LazyVStack(spacing: 10) {
                                ForEach(appState.projectSummaries, id: \.id) { project in
                                    Button {
                                        selectedProjectId = project.id
                                    } label: {
                                        HStack(spacing: 12) {
                                            Image(systemName: "doc.fill")
                                                .foregroundColor(selectedProjectId == project.id ? .white : .accentPrimary)
                                                .frame(width: 36, height: 36)
                                                .background(selectedProjectId == project.id ? Color.accentPrimary : Color.accentPrimary.opacity(0.1))
                                                .clipShape(RoundedRectangle(cornerRadius: 10))

                                            VStack(alignment: .leading, spacing: 2) {
                                                Text(project.title)
                                                    .font(.system(size: 14, weight: .bold, design: .rounded))
                                                    .foregroundColor(.textPrimary)
                                                Text(project.kind.rawValue)
                                                    .font(.system(size: 12, weight: .medium, design: .rounded))
                                                    .foregroundColor(.textSecondary)
                                            }

                                            Spacer()

                                            if selectedProjectId == project.id {
                                                Image(systemName: "checkmark.circle.fill")
                                                    .foregroundColor(.accentPrimary)
                                            }
                                        }
                                        .padding(12)
                                        .background(
                                            selectedProjectId == project.id
                                                ? Color.accentPrimary.opacity(0.08)
                                                : Color.cardBackground
                                        )
                                        .clipShape(RoundedRectangle(cornerRadius: 14))
                                        .overlay(
                                            RoundedRectangle(cornerRadius: 14)
                                                .stroke(
                                                    selectedProjectId == project.id
                                                        ? Color.accentPrimary.opacity(0.3)
                                                        : Color.accentPrimary.opacity(0.06),
                                                    lineWidth: 1
                                                )
                                        )
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                            .padding(.horizontal, 16)
                        }

                        if let error {
                            Text(error)
                                .font(.system(size: 13, weight: .medium, design: .rounded))
                                .foregroundColor(.red)
                                .padding(.horizontal, 16)
                        }

                        Button {
                            guard let projectId = selectedProjectId else { return }
                            isSubmitting = true
                            error = nil
                            Task {
                                do {
                                    _ = try await AIWorkspaceAPI.submitToChallenge(
                                        challengeId: challengeId,
                                        projectId: projectId
                                    )
                                    submitted = true
                                    await store.loadChallenges()
                                } catch {
                                    self.error = "Submission failed. You may have already submitted."
                                }
                                isSubmitting = false
                            }
                        } label: {
                            HStack(spacing: 8) {
                                if isSubmitting {
                                    ProgressView()
                                        .tint(.white)
                                } else {
                                    Image(systemName: "paperplane.fill")
                                    Text("Submit")
                                }
                            }
                            .font(.system(size: 16, weight: .bold, design: .rounded))
                            .foregroundColor(.white)
                            .frame(maxWidth: .infinity, minHeight: 52)
                            .background(selectedProjectId != nil ? Color.accentPrimary : Color.gray.opacity(0.4))
                            .clipShape(RoundedRectangle(cornerRadius: 16))
                        }
                        .buttonStyle(.plain)
                        .disabled(selectedProjectId == nil || isSubmitting)
                        .padding(.horizontal, 16)
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(
                LinearGradient(colors: [.gradientTop, .gradientBottom], startPoint: .top, endPoint: .bottom)
                    .ignoresSafeArea()
            )
            .navigationTitle("Submit to Challenge")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Cancel") { dismiss() }
                        .foregroundColor(.accentPrimary)
                }
            }
        }
    }
}

// MARK: - Store

@MainActor
final class ChallengesStore: ObservableObject {
    @Published var challenges: [AIWorkspaceAPI.Challenge] = []
    @Published var isLoading = false
    @Published var isLoadingDetail = false
    @Published var votingSubmissions: [AIWorkspaceAPI.ChallengeSubmission] = []
    @Published var userVotedProjectId: String?
    @Published var errorMessage: String?

    var activeChallenge: AIWorkspaceAPI.Challenge? {
        challenges.first(where: \.isActive)
    }

    var votingChallenge: AIWorkspaceAPI.Challenge? {
        challenges.first(where: \.isVoting)
    }

    var completedChallenges: [AIWorkspaceAPI.Challenge] {
        challenges.filter(\.isCompleted)
    }

    func loadChallenges() async {
        isLoading = true
        defer { isLoading = false }
        do {
            challenges = try await AIWorkspaceAPI.fetchChallenges()
        } catch {
            errorMessage = "Failed to load challenges"
        }
    }

    func loadChallengeDetail(id: String) async {
        isLoadingDetail = true
        defer { isLoadingDetail = false }
        do {
            let detail = try await AIWorkspaceAPI.fetchChallengeDetail(id: id)
            votingSubmissions = detail.submissions
            userVotedProjectId = detail.userVotedProjectId
        } catch {
            errorMessage = "Failed to load challenge details"
        }
    }

    func vote(challengeId: String, projectId: String) async {
        do {
            let result = try await AIWorkspaceAPI.voteForChallengeProject(
                challengeId: challengeId,
                projectId: projectId
            )
            userVotedProjectId = result.projectId
            if let idx = votingSubmissions.firstIndex(where: { $0.projectId == projectId }) {
                let old = votingSubmissions[idx]
                votingSubmissions[idx] = AIWorkspaceAPI.ChallengeSubmission(
                    id: old.id,
                    challengeId: old.challengeId,
                    projectId: old.projectId,
                    userId: old.userId,
                    authorName: old.authorName,
                    title: old.title,
                    description: old.description,
                    previewUrls: old.previewUrls,
                    votes: result.totalVotes,
                    submittedAt: old.submittedAt
                )
            }
        } catch {
            errorMessage = "Vote failed"
        }
    }
}

// MARK: - Home Banner (standalone component)

struct ChallengeBannerView: View {
    let challenge: AIWorkspaceAPI.Challenge

    var body: some View {
        NavigationLink(destination: ChallengesView()) {
            HStack(spacing: 12) {
                Image(systemName: "trophy.fill")
                    .font(.system(size: 22, weight: .bold))
                    .foregroundColor(.white)
                    .frame(width: 44, height: 44)
                    .background(
                        LinearGradient(
                            colors: [.accentOrange, .accentPrimary],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .clipShape(RoundedRectangle(cornerRadius: 14))

                VStack(alignment: .leading, spacing: 3) {
                    Text("WEEKLY CHALLENGE")
                        .font(.system(size: 10, weight: .black, design: .rounded))
                        .foregroundColor(.accentOrange)
                    Text(challenge.title)
                        .font(.system(size: 15, weight: .bold, design: .rounded))
                        .foregroundColor(.textPrimary)
                        .lineLimit(1)
                    Text(challenge.isActive ? "Submit now!" : challenge.isVoting ? "Vote now!" : "")
                        .font(.system(size: 12, weight: .semibold, design: .rounded))
                        .foregroundColor(.accentPrimary)
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(.accentPrimary)
            }
            .padding(14)
            .background(
                LinearGradient(
                    colors: [Color.accentOrange.opacity(0.08), Color.accentPrimary.opacity(0.06)],
                    startPoint: .leading,
                    endPoint: .trailing
                )
            )
            .clipShape(RoundedRectangle(cornerRadius: 18))
            .overlay(
                RoundedRectangle(cornerRadius: 18)
                    .stroke(Color.accentOrange.opacity(0.18), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }
}
