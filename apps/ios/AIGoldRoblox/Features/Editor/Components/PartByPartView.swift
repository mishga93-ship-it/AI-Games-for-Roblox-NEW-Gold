//
//  PartByPartView.swift
//  AIGoldRoblox
//

import SwiftUI

enum PartByPartBodyPart: String, CaseIterable {
    case head = "Head"
    case torso = "Torso"
    case leftArm = "Left Arm"
    case rightArm = "Right Arm"
    case legs = "Legs"
}

struct PartByPartView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var selectedPart: PartByPartBodyPart = .head

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(PartByPartBodyPart.allCases, id: \.self) { part in
                            Button {
                                withAnimation { selectedPart = part }
                            } label: {
                                Text(part.rawValue)
                                    .font(.system(.caption, design: .rounded, weight: .bold))
                                    .foregroundColor(selectedPart == part ? .black : .white)
                                    .padding(.horizontal, 14)
                                    .padding(.vertical, 8)
                                    .background(selectedPart == part ? Color.accentPrimary : Color.cardBackground)
                                    .clipShape(Capsule())
                            }
                        }
                    }
                    .padding()
                }

                ScrollView {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 80), spacing: 8)], spacing: 8) {
                        ForEach(0..<12, id: \.self) { _ in
                            RoundedRectangle(cornerRadius: 8)
                                .fill(Color.cardBackground)
                                .frame(height: 80)
                                .overlay(
                                    Image(systemName: "person.crop.square")
                                        .foregroundColor(.textTertiary)
                                )
                        }
                    }
                    .padding()
                }
            }
            .background(Color.appBackground)
            .navigationTitle("Part by Part")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") { dismiss() }
                        .foregroundColor(.accentPrimary)
                }
            }
        }
    }
}
