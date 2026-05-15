import SwiftUI

struct CommentTreeView: View {
    let comments: [AIWorkspaceAPI.SocialComment]
    let onReply: (AIWorkspaceAPI.SocialComment) -> Void
    let onLike: (AIWorkspaceAPI.SocialComment) -> Void

    private var rootComments: [AIWorkspaceAPI.SocialComment] {
        comments.filter { $0.parentCommentId == nil }
    }

    private var repliesByParent: [String: [AIWorkspaceAPI.SocialComment]] {
        Dictionary(grouping: comments.filter { $0.parentCommentId != nil },
                   by: { $0.parentCommentId! })
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Comments")
                .font(.appHeadline)
                .foregroundColor(.textPrimary)

            if rootComments.isEmpty {
                Text("No comments yet — be the first!")
                    .font(.appCaption)
                    .foregroundColor(.textSecondary)
                    .padding(.vertical, 8)
            } else {
                ForEach(rootComments) { comment in
                    CommentBubble(comment: comment, onReply: onReply, onLike: onLike)

                    if let replies = repliesByParent[comment.id], !replies.isEmpty {
                        ForEach(replies) { reply in
                            CommentBubble(comment: reply, onReply: onReply, onLike: onLike)
                                .padding(.leading, 20)
                        }
                    }
                }
            }
        }
    }
}

private struct CommentBubble: View {
    let comment: AIWorkspaceAPI.SocialComment
    let onReply: (AIWorkspaceAPI.SocialComment) -> Void
    let onLike: (AIWorkspaceAPI.SocialComment) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(comment.authorName)
                    .font(.appCaption)
                    .foregroundColor(.accentPrimary)
                Spacer()
                Text(relativeTime(comment.createdAt))
                    .font(.appCaption)
                    .foregroundColor(.textTertiary)
            }

            Text(comment.content)
                .font(.appBody)
                .foregroundColor(.textPrimary)

            HStack(spacing: 16) {
                Button {
                    onLike(comment)
                } label: {
                    // Bug 20: show filled heart when THIS viewer liked the comment
                    // (was previously driven by likeCount > 0 — unrelated to viewer state).
                    let liked = comment.likedByViewer == true
                    HStack(spacing: 4) {
                        Image(systemName: liked ? "heart.fill" : "heart")
                            .font(.system(size: 13))
                        if comment.likeCount > 0 {
                            Text("\(comment.likeCount)")
                                .font(.appCaption)
                        }
                    }
                    .foregroundColor(liked ? .accentSecondary : .textSecondary)
                }
                .buttonStyle(.plain)

                Button {
                    onReply(comment)
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "arrowshape.turn.up.left")
                            .font(.system(size: 12))
                        Text("Reply")
                            .font(.appCaption)
                    }
                    .foregroundColor(.textSecondary)
                }
                .buttonStyle(.plain)

                Spacer()
            }
            .padding(.top, 2)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    private func relativeTime(_ iso: String) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = formatter.date(from: iso) ?? ISO8601DateFormatter().date(from: iso) else {
            return ""
        }
        let seconds = -date.timeIntervalSinceNow
        switch seconds {
        case ..<60: return "just now"
        case ..<3600: return "\(Int(seconds / 60))m ago"
        case ..<86400: return "\(Int(seconds / 3600))h ago"
        default: return "\(Int(seconds / 86400))d ago"
        }
    }
}
