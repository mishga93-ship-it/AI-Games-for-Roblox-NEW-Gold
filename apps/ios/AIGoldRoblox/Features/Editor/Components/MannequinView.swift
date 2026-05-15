//
//  MannequinView.swift
//  AIGoldRoblox
//

import SwiftUI
import SceneKit
import Foundation

struct MannequinView: UIViewRepresentable {
    @ObservedObject var state: EditorState

    func makeUIView(context: Context) -> SCNView {
        let scnView = SCNView()
        scnView.scene = SCNScene()
        scnView.allowsCameraControl = true
        scnView.backgroundColor = .clear
        scnView.autoenablesDefaultLighting = true
        context.coordinator.buildAvatar(in: scnView.scene!)
        return scnView
    }

    func updateUIView(_ uiView: SCNView, context: Context) {
        let c = context.coordinator

        let uiColor = UIColor(state.paintColor)
        c.applyColorToAvatar(color: uiColor)

        c.avatarRoot?.eulerAngles.y = Float(state.modelRotation * .pi / 180)

        if c.loadedBodyType != state.currentBodyType || c.loadedRigType != state.currentRigType {
            c.loadAvatarModel(type: state.currentBodyType, rig: state.currentRigType, in: uiView.scene!)
        }
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    class Coordinator {
        var avatarRoot: SCNNode?
        var bodyNodes: [String: SCNNode] = [:]
        var loadedBodyType: AvatarBodyType = .neutrally
        var loadedRigType: AvatarRigType = .r15
        private var isCustomModelLoaded = false

        private func log(_ message: String) {
            let line = "[MannequinView] \(message)"
            print(line)
            NSLog("%@", line)
        }

        /// Упрощённые пропорции с поддержкой Roblox R6 и R15.
        struct BodyProportions {
            let rig: AvatarRigType
            let headSize: (w: CGFloat, h: CGFloat, d: CGFloat)
            let torsoSize: (w: CGFloat, h: CGFloat, d: CGFloat)
            let armSize: (w: CGFloat, h: CGFloat, d: CGFloat)
            let legSize: (w: CGFloat, h: CGFloat, d: CGFloat)
            let chamfer: CGFloat
            /// Множитель половины расстояния между ногами (бёдра): >1 — шире, «женский» силуэт.
            let legSpread: CGFloat

            static func forType(_ type: AvatarBodyType, rig: AvatarRigType) -> BodyProportions {
                switch (rig, type) {
                case (.r6, .neutrally):
                    return BodyProportions(
                        rig: rig,
                        headSize: (0.42, 0.42, 0.42), torsoSize: (0.54, 0.60, 0.28),
                        armSize: (0.20, 0.50, 0.20), legSize: (0.22, 0.50, 0.22), chamfer: 0.018,
                        legSpread: 1.0
                    )
                case (.r6, .woman):
                    return BodyProportions(
                        rig: rig,
                        headSize: (0.40, 0.40, 0.40), torsoSize: (0.49, 0.59, 0.26),
                        armSize: (0.18, 0.50, 0.18), legSize: (0.20, 0.52, 0.20), chamfer: 0.02,
                        legSpread: 1.06
                    )
                case (.r6, .man):
                    return BodyProportions(
                        rig: rig,
                        headSize: (0.43, 0.42, 0.43), torsoSize: (0.60, 0.62, 0.30),
                        armSize: (0.22, 0.52, 0.22), legSize: (0.22, 0.52, 0.22), chamfer: 0.018,
                        legSpread: 0.95
                    )
                case (.r15, .neutrally):
                    return BodyProportions(
                        rig: rig,
                        headSize: (0.37, 0.39, 0.37), torsoSize: (0.40, 0.66, 0.21),
                        armSize: (0.14, 0.60, 0.14), legSize: (0.16, 0.66, 0.16), chamfer: 0.042,
                        legSpread: 1.08
                    )
                case (.r15, .woman):
                    return BodyProportions(
                        rig: rig,
                        headSize: (0.36, 0.38, 0.36), torsoSize: (0.37, 0.68, 0.20),
                        armSize: (0.13, 0.62, 0.13), legSize: (0.15, 0.69, 0.15), chamfer: 0.048,
                        legSpread: 1.16
                    )
                case (.r15, .man):
                    return BodyProportions(
                        rig: rig,
                        headSize: (0.38, 0.39, 0.38), torsoSize: (0.44, 0.69, 0.23),
                        armSize: (0.15, 0.63, 0.15), legSize: (0.17, 0.68, 0.17), chamfer: 0.043,
                        legSpread: 1.03
                    )
                }
            }
        }

        func buildAvatar(in scene: SCNScene) {
            setupLighting(in: scene)
            loadAvatarModel(type: .neutrally, rig: .r15, in: scene)
        }

        func setupLighting(in scene: SCNScene) {
            let ambient = SCNNode()
            ambient.light = SCNLight()
            ambient.light?.type = .ambient
            ambient.light?.intensity = 400
            scene.rootNode.addChildNode(ambient)

            let omni = SCNNode()
            omni.light = SCNLight()
            omni.light?.type = .omni
            omni.light?.intensity = 800
            omni.position = SCNVector3(2, 4, 3)
            scene.rootNode.addChildNode(omni)

            let camera = SCNNode()
            camera.camera = SCNCamera()
            camera.position = SCNVector3(0, 0.3, 2.5)
            scene.rootNode.addChildNode(camera)
        }

        func loadAvatarModel(type: AvatarBodyType, rig: AvatarRigType, in scene: SCNScene) {
            avatarRoot?.removeFromParentNode()
            bodyNodes.removeAll()
            isCustomModelLoaded = false
            log("loadAvatarModel start rig=\(rig.rawValue) body=\(type.rawValue)")

            // For R15, prefer bundled Roblox-like mannequin meshes.
            if rig == .r15, let custom = loadBundledR15Model(for: type) {
                scene.rootNode.addChildNode(custom)
                avatarRoot = custom
                loadedBodyType = type
                loadedRigType = rig
                isCustomModelLoaded = true
                log("Using bundled custom model for \(type.rawValue)")
                return
            }
            if rig == .r15 {
                log("Custom R15 model not found, falling back to procedural")
            }

            let props = BodyProportions.forType(type, rig: rig)

            let root = SCNNode()
            root.name = "avatarRoot"

            let defaultColor = UIColor(red: 0.45, green: 0.75, blue: 0.45, alpha: 1)

            func makeBox(_ size: (w: CGFloat, h: CGFloat, d: CGFloat), name: String, pos: SCNVector3) -> SCNNode {
                let box = SCNBox(width: size.w, height: size.h, length: size.d, chamferRadius: props.chamfer)
                box.materials = (0..<6).map { _ in
                    let m = SCNMaterial()
                    m.diffuse.contents = defaultColor
                    return m
                }
                let node = SCNNode(geometry: box)
                node.name = name
                node.position = pos
                bodyNodes[name] = node
                root.addChildNode(node)
                return node
            }

            let torsoY: Float = 0
            let headY = Float(props.torsoSize.h / 2 + props.headSize.h / 2) + torsoY
            let armX = Float(props.torsoSize.w / 2 + props.armSize.w / 2) + 0.02
            let armY = Float(props.torsoSize.h / 2 - props.armSize.h / 2) + torsoY
            let legX = Float((props.torsoSize.w / 4) * props.legSpread)
            let legY = -Float(props.torsoSize.h / 2 + props.legSize.h / 2) + torsoY

            _ = makeBox(props.headSize, name: "head", pos: SCNVector3(0, headY, 0))
            _ = makeBox(props.torsoSize, name: "torso", pos: SCNVector3(0, torsoY, 0))
            _ = makeBox(props.armSize, name: "leftArm", pos: SCNVector3(-armX, armY, 0))
            _ = makeBox(props.armSize, name: "rightArm", pos: SCNVector3(armX, armY, 0))
            _ = makeBox(props.legSize, name: "leftLeg", pos: SCNVector3(-legX, legY, 0))
            _ = makeBox(props.legSize, name: "rightLeg", pos: SCNVector3(legX, legY, 0))

            scene.rootNode.addChildNode(root)
            avatarRoot = root
            loadedBodyType = type
            loadedRigType = rig
            log("Procedural mannequin created for rig=\(rig.rawValue), body=\(type.rawValue)")
        }

        func applyColorToAvatar(color: UIColor) {
            if isCustomModelLoaded {
                avatarRoot?.enumerateChildNodes { node, _ in
                    guard let geometry = node.geometry else { return }
                    if geometry.materials.isEmpty {
                        let material = SCNMaterial()
                        material.diffuse.contents = color
                        material.lightingModel = .physicallyBased
                        geometry.materials = [material]
                    } else {
                        for material in geometry.materials {
                            material.diffuse.contents = color
                        }
                    }
                }
                return
            }

            for (_, node) in bodyNodes {
                if let box = node.geometry as? SCNBox {
                    for mat in box.materials {
                        mat.diffuse.contents = color
                    }
                }
            }
        }

        private func loadBundledR15Model(for type: AvatarBodyType) -> SCNNode? {
            let fileBaseName: String
            switch type {
            case .neutrally:
                fileBaseName = "R15_Block"
            case .woman:
                fileBaseName = "R15_Woman"
            case .man:
                fileBaseName = "R15_man"
            }

            let sceneCandidates = [
                "Models/\(fileBaseName).scn",
                "\(fileBaseName).scn",
                "Models/\(fileBaseName).obj",
                "\(fileBaseName).obj"
            ]

            if let url = Bundle.main.url(forResource: fileBaseName, withExtension: "scn", subdirectory: "Models") {
                log("Found SCN URL in bundle: \(url.lastPathComponent)")
            } else {
                log("Bundle URL lookup failed for Models/\(fileBaseName).scn")
            }
            if let url = Bundle.main.url(forResource: fileBaseName, withExtension: "obj", subdirectory: "Models") {
                log("Found OBJ URL in bundle: \(url.lastPathComponent)")
            } else {
                log("Bundle URL lookup failed for Models/\(fileBaseName).obj")
            }

            var loadedScene: SCNScene?
            for candidate in sceneCandidates {
                log("Trying SCNScene(named: \(candidate))")
                if let scene = SCNScene(named: candidate) {
                    loadedScene = scene
                    log("Loaded model scene via named path: \(candidate)")
                    break
                }
            }
            if loadedScene == nil {
                for ext in ["scn", "obj"] {
                    guard let url = Bundle.main.url(forResource: fileBaseName, withExtension: ext, subdirectory: "Models") else {
                        continue
                    }
                    log("Trying SCNScene(url:) fallback for \(fileBaseName).\(ext)")
                    loadedScene = try? SCNScene(url: url, options: nil)
                    if loadedScene != nil {
                        log("Loaded model scene via URL fallback: \(url.lastPathComponent)")
                        break
                    } else {
                        log("SCNScene(url:) failed for \(url.lastPathComponent)")
                    }
                }
            }
            guard let scene = loadedScene else { return nil }

            let wrapper = SCNNode()
            let importedRoot = SCNNode()
            for child in scene.rootNode.childNodes {
                importedRoot.addChildNode(child)
            }
            log("Imported root child count: \(importedRoot.childNodes.count)")

            // Normalize pivot and scale so all mannequins are framed consistently.
            let (minVec, maxVec) = importedRoot.boundingBox
            log("Original boundingBox min=\(minVec) max=\(maxVec)")
            let size = SCNVector3(
                maxVec.x - minVec.x,
                maxVec.y - minVec.y,
                maxVec.z - minVec.z
            )
            let height = max(size.y, 0.0001)
            let targetHeight: Float = 1.7
            let scale = targetHeight / height
            importedRoot.scale = SCNVector3(scale, scale, scale)
            log("Normalized model height=\(height), scale=\(scale)")

            let centerX = (minVec.x + maxVec.x) * 0.5
            let minY = minVec.y
            let centerZ = (minVec.z + maxVec.z) * 0.5
            importedRoot.pivot = SCNMatrix4MakeTranslation(centerX, minY, centerZ)

            wrapper.addChildNode(importedRoot)
            return wrapper
        }
    }
}
