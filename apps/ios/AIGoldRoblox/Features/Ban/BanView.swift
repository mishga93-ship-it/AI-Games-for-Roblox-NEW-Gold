//
//  BanView.swift
//  AIGoldRoblox
//

import SwiftUI

struct BanView: View {
    let ban: BanInfo
    let onSignOut: () -> Void

    @State private var timeRemaining: String = ""
    private let timer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    var body: some View {
        ZStack {
            Color.appBackground.ignoresSafeArea()

            VStack(spacing: 28) {
                Spacer()

                Image(systemName: "exclamationmark.shield.fill")
                    .font(.system(size: 64))
                    .foregroundStyle(.red.opacity(0.85))

                Text(ban.permanent ? "Account Permanently Banned" : "Account Temporarily Banned")
                    .font(.appLargeTitle)
                    .foregroundColor(.textPrimary)
                    .multilineTextAlignment(.center)

                if let reason = ban.reason, !reason.isEmpty {
                    Text(reason)
                        .font(.appBody)
                        .foregroundColor(.textSecondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 32)
                }

                if !ban.permanent, let until = ban.bannedUntilDate {
                    VStack(spacing: 12) {
                        Text("Access will be restored in:")
                            .font(.appCaption)
                            .foregroundColor(.textSecondary)

                        Text(timeRemaining)
                            .font(.system(size: 32, weight: .bold, design: .monospaced))
                            .foregroundColor(.accentPrimary)

                        Text(formattedDate(until))
                            .font(.appCaption)
                            .foregroundColor(.textSecondary)
                    }
                    .padding(20)
                    .background(Color.cardBackground)
                    .clipShape(RoundedRectangle(cornerRadius: 16))
                    .padding(.horizontal, 24)
                }

                if ban.permanent {
                    Text("This decision is final. If you believe this is an error, please contact support.")
                        .font(.appCaption)
                        .foregroundColor(.textSecondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 32)
                }

                Spacer()

                Button(action: onSignOut) {
                    Text("Sign Out")
                        .font(.appHeadline)
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.red.opacity(0.85))
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                }
                .padding(.horizontal, 32)
                .padding(.bottom, 40)
            }
        }
        .onAppear { updateTimeRemaining() }
        .onReceive(timer) { _ in updateTimeRemaining() }
    }

    private func updateTimeRemaining() {
        guard !ban.permanent, let until = ban.bannedUntilDate else {
            timeRemaining = "--:--:--"
            return
        }
        let remaining = until.timeIntervalSince(Date())
        if remaining <= 0 {
            timeRemaining = "00:00:00"
            return
        }
        let days = Int(remaining) / 86400
        let hours = (Int(remaining) % 86400) / 3600
        let minutes = (Int(remaining) % 3600) / 60
        let seconds = Int(remaining) % 60
        if days > 0 {
            timeRemaining = String(format: "%dd %02d:%02d:%02d", days, hours, minutes, seconds)
        } else {
            timeRemaining = String(format: "%02d:%02d:%02d", hours, minutes, seconds)
        }
    }

    private func formattedDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        return formatter.string(from: date)
    }
}
