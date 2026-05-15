//
//  MannequinBodyTypePicker.swift
//  AIGoldRoblox
//

import SwiftUI

struct MannequinBodyTypePicker: View {
    @ObservedObject var state: EditorState

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Rig Type")
                .font(.system(.caption, design: .rounded, weight: .semibold))
                .foregroundColor(.textSecondary)
            Picker("", selection: $state.currentRigType) {
                ForEach(AvatarRigType.allCases) { rig in
                    Text(rig.displayName).tag(rig)
                }
            }
            .pickerStyle(.segmented)

            Text("Body Package")
                .font(.system(.caption, design: .rounded, weight: .semibold))
                .foregroundColor(.textSecondary)
            Picker("", selection: $state.currentBodyType) {
                ForEach(AvatarBodyType.allCases) { type in
                    Text(type.displayName).tag(type)
                }
            }
            .pickerStyle(.segmented)
        }
    }
}
