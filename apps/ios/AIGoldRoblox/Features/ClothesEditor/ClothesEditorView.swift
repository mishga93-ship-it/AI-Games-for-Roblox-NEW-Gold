//
//  ClothesEditorView.swift
//  AIGoldRoblox
//

import SwiftUI

struct ClothesEditorView: View {
    @StateObject private var mannequinState = EditorState()
    @State private var showTemplates = false

    var body: some View {
        ZStack {
            LinearGradient(colors: [.gradientTop, .gradientBottom], startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()
            ScrollView {
                VStack(spacing: 16) {
                    AvatarSceneView(state: mannequinState)
                        .frame(height: 280)
                        .background(Color.cardBackground)
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                        .overlay(
                            RoundedRectangle(cornerRadius: 14)
                                .stroke(Color.quickReplyBorder.opacity(0.4), lineWidth: 1)
                        )

                    MannequinBodyTypePicker(state: mannequinState)

                    Text("Try clothes on R6 or R15 mannequins and compare Classic, Woman and Man package silhouettes.")
                        .font(.appCaption)
                        .foregroundColor(.textSecondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal)

                    NavigationLink {
                        EditorContentView()
                    } label: {
                        HStack {
                            Image(systemName: "tshirt.fill")
                            Text("FORGE Editor — Layers & Textures")
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

                    HStack(spacing: 12) {
                        PrimaryButton(title: "Templates", action: { showTemplates = true }, style: .outline)
                        PrimaryButton(title: "Export", action: {}, style: .outline)
                    }
                    .padding(.horizontal)

                    Spacer(minLength: 24)
                }
                .padding(.top, 16)
            }
        }
        .navigationTitle("Clothes Editor")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $showTemplates) {
            VStack(spacing: 16) {
                Text("Clothing Templates")
                    .font(.appTitle2)
                    .foregroundColor(.textPrimary)
                Text("Browse templates for skins and clothes.")
                    .font(.appCaption)
                    .foregroundColor(.textSecondary)
                    .multilineTextAlignment(.center)
                    .padding()
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color.appBackground)
        }
    }
}
