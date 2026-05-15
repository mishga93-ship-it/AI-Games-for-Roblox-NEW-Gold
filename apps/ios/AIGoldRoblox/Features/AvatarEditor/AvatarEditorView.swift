//
//  AvatarEditorView.swift
//  AIGoldRoblox
//

import SwiftUI

struct AvatarEditorView: View {
    @StateObject private var mannequinState = EditorState()
    @State private var selectedPart = "Body"

    var body: some View {
        ZStack {
            LinearGradient(colors: [.gradientTop, .gradientBottom], startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()
            ScrollView {
                VStack(spacing: 16) {
                    AvatarSceneView(state: mannequinState)
                        .frame(height: 300)
                        .background(Color.cardBackground)
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                        .overlay(
                            RoundedRectangle(cornerRadius: 14)
                                .stroke(Color.quickReplyBorder.opacity(0.4), lineWidth: 1)
                        )

                    MannequinBodyTypePicker(state: mannequinState)

                    Text("Switch between R6 and R15, then preview Classic, Woman and Man package silhouettes directly in the 3D editor.")
                        .font(.appCaption)
                        .foregroundColor(.textSecondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal)

                    NavigationLink {
                        EditorContentView()
                    } label: {
                        HStack {
                            Image(systemName: "paintbrush.pointed.fill")
                            Text("FORGE Editor")
                                .font(.appHeadline)
                            Spacer()
                            Image(systemName: "chevron.right")
                                .foregroundColor(.textTertiary)
                        }
                        .foregroundColor(.textPrimary)
                        .padding()
                        .background(Color.elevatedBackground)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                    .padding(.horizontal)

                    Picker("Part", selection: $selectedPart) {
                        Text("Body").tag("Body")
                        Text("Head").tag("Head")
                        Text("Accessories").tag("Accessories")
                    }
                    .pickerStyle(.segmented)
                    .padding(.horizontal)

                    Spacer(minLength: 24)
                }
                .padding(.top, 16)
            }
        }
        .navigationTitle("Avatar Editor")
        .navigationBarTitleDisplayMode(.inline)
    }
}
