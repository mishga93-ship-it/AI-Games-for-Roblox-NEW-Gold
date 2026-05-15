import SwiftUI

/// Modal that lets the user review every AI-generated 2D image before it
/// uploads to their Roblox account as a Decal. Roblox runs ML moderation on
/// every Decal; one violation triggers an account suspension. (Session 231 —
/// Asset 99787426663910 banned for blood splatter on a brick texture.)
///
/// Default: every candidate is pre-checked. Users uncheck the risky ones.
/// Skipped candidates: the corresponding texture slot in-game stays default
/// (no decal). Backend route: POST /api/content/jobs/:jobId/approve-decals.
struct DecalApprovalSheet: View {
    let candidates: [AIWorkspaceAPI.DecalCandidate]
    let isSubmitting: Bool
    let onSubmit: (_ approvedSlotIds: [String]) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var approvedIds: Set<String> = []

    private let columns = [
        GridItem(.flexible(), spacing: 12),
        GridItem(.flexible(), spacing: 12),
    ]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    header

                    LazyVGrid(columns: columns, spacing: 12) {
                        ForEach(candidates) { candidate in
                            DecalApprovalCard(
                                candidate: candidate,
                                isApproved: approvedIds.contains(candidate.slotId)
                            ) {
                                toggle(candidate.slotId)
                            }
                        }
                    }
                    .padding(.horizontal, 16)

                    if approvedIds.count < candidates.count {
                        Text("\(candidates.count - approvedIds.count) image(s) will be skipped — those texture slots will use defaults.")
                            .font(.appCaption)
                            .foregroundColor(.textSecondary)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 24)
                    }

                    submitButton
                        .padding(.horizontal, 16)
                        .padding(.bottom, 24)
                }
                .padding(.top, 8)
            }
            .background(Color.appBackground.ignoresSafeArea())
            .navigationTitle("Review images")
            .navigationBarTitleDisplayMode(.inline)
            .interactiveDismissDisabled(true)
        }
        .onAppear {
            // Pre-check every candidate (matches Hero Concepts default).
            if approvedIds.isEmpty {
                approvedIds = Set(candidates.map(\.slotId))
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("Approve before upload", systemImage: "checkmark.shield.fill")
                .font(.appHeadline)
                .foregroundColor(.textPrimary)

            Text("These images upload to your connected creator account as Decals. Platform moderation reviews each one — uncheck anything risky to keep your account safe.")
                .font(.appBody)
                .foregroundColor(.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(Color.white.opacity(0.06))
        )
        .padding(.horizontal, 16)
    }

    private var submitButton: some View {
        Button(action: submit) {
            HStack(spacing: 8) {
                if isSubmitting {
                    ProgressView()
                        .progressViewStyle(.circular)
                        .tint(.white)
                } else {
                    Image(systemName: "arrow.up.circle.fill")
                }
                Text(buttonTitle)
                    .font(.appHeadline)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(approvedIds.isEmpty ? Color.gray.opacity(0.3) : Color.accentPrimary)
            )
            .foregroundColor(.white)
        }
        .disabled(isSubmitting)
    }

    private var buttonTitle: String {
        if approvedIds.isEmpty {
            return "Skip all & continue"
        }
        return "Upload approved (\(approvedIds.count))"
    }

    private func toggle(_ slotId: String) {
        if approvedIds.contains(slotId) {
            approvedIds.remove(slotId)
        } else {
            approvedIds.insert(slotId)
        }
    }

    private func submit() {
        let ordered = candidates
            .map(\.slotId)
            .filter { approvedIds.contains($0) }
        onSubmit(ordered)
    }
}

private struct DecalApprovalCard: View {
    let candidate: AIWorkspaceAPI.DecalCandidate
    let isApproved: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            ZStack(alignment: .topTrailing) {
                AsyncImage(url: URL(string: candidate.previewUrl)) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .aspectRatio(1, contentMode: .fill)
                    case .failure:
                        ZStack {
                            Color.black.opacity(0.4)
                            Image(systemName: "photo.fill")
                                .foregroundColor(.white.opacity(0.6))
                        }
                        .aspectRatio(1, contentMode: .fill)
                    default:
                        ZStack {
                            Color.black.opacity(0.2)
                            ProgressView()
                        }
                        .aspectRatio(1, contentMode: .fill)
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(isApproved ? Color.green : Color.white.opacity(0.15), lineWidth: 2.5)
                )

                Image(systemName: isApproved ? "checkmark.circle.fill" : "circle")
                    .font(.title2)
                    .foregroundColor(isApproved ? .green : .white.opacity(0.7))
                    .background(Circle().fill(Color.black.opacity(0.4)).frame(width: 28, height: 28))
                    .padding(8)

                VStack {
                    Spacer()
                    Text(candidate.slotPrefix)
                        .font(.appCaption)
                        .lineLimit(1)
                        .foregroundColor(.white)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 3)
                        .background(Capsule().fill(Color.black.opacity(0.55)))
                        .padding(6)
                }
            }
        }
        .buttonStyle(.plain)
    }
}
