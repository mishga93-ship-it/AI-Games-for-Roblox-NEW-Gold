import SwiftUI
import SceneKit

/// 3D R15 avatar preview with clothing textures applied from URLs.
/// Loads the bundled R15 OBJ model and applies the 585×559 Roblox
/// clothing template as a diffuse texture to body-part groups.
/// Matches AvatarSceneView.applyFullTemplateToMappedGroups logic.
struct ClothingPreview3DView: UIViewRepresentable {
    let shirtTextureURL: URL?
    let pantsTextureURL: URL?

    func makeUIView(context: Context) -> SCNView {
        let scnView = SCNView()
        scnView.scene = SCNScene()
        scnView.allowsCameraControl = true
        scnView.backgroundColor = .clear
        scnView.autoenablesDefaultLighting = false
        scnView.antialiasingMode = .multisampling4X
        context.coordinator.setup(scene: scnView.scene!)
        context.coordinator.loadTextures(shirt: shirtTextureURL, pants: pantsTextureURL)
        return scnView
    }

    func updateUIView(_ uiView: SCNView, context: Context) {
        let c = context.coordinator
        if c.currentShirtURL != shirtTextureURL || c.currentPantsURL != pantsTextureURL {
            c.loadTextures(shirt: shirtTextureURL, pants: pantsTextureURL)
        }
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    class Coordinator {
        private var avatarRoot: SCNNode?
        private var bodyGroupNodes: [String: [SCNNode]] = [:]
        private var usesProceduralAvatar = false
        var currentShirtURL: URL?
        var currentPantsURL: URL?
        private var loadTask: Task<Void, Never>?
        private let skinColor = UIColor(red: 0.82, green: 0.65, blue: 0.50, alpha: 1)

        func setup(scene: SCNScene) {
            let ambient = SCNNode()
            ambient.light = SCNLight()
            ambient.light?.type = .ambient
            ambient.light?.intensity = 500
            ambient.light?.color = UIColor(white: 0.95, alpha: 1)
            scene.rootNode.addChildNode(ambient)

            let key = SCNNode()
            key.light = SCNLight()
            key.light?.type = .omni
            key.light?.intensity = 900
            key.position = SCNVector3(2.5, 4, 4)
            scene.rootNode.addChildNode(key)

            let fill = SCNNode()
            fill.light = SCNLight()
            fill.light?.type = .omni
            fill.light?.intensity = 350
            fill.light?.color = UIColor(red: 0.85, green: 0.88, blue: 1.0, alpha: 1)
            fill.position = SCNVector3(-2, 2, 3)
            scene.rootNode.addChildNode(fill)

            let cam = SCNNode()
            cam.camera = SCNCamera()
            cam.camera?.fieldOfView = 46
            cam.position = SCNVector3(0, 0.45, 3.0)
            cam.look(at: SCNVector3(0, 0.15, 0))
            scene.rootNode.addChildNode(cam)

            scene.background.contents = UIColor.clear

            buildAvatar(in: scene)
        }

        // MARK: - Avatar

        private func buildAvatar(in scene: SCNScene) {
            avatarRoot?.removeFromParentNode()
            bodyGroupNodes.removeAll()
            usesProceduralAvatar = false

            let root = SCNNode()
            root.name = "clothingPreviewRoot"

            if let bundled = loadBundledModel() {
                root.addChildNode(bundled)
            } else {
                usesProceduralAvatar = true
                let procedural = buildProceduralR15()
                root.addChildNode(procedural)
            }

            let spin = SCNAction.repeatForever(
                SCNAction.rotateBy(x: 0, y: .pi * 2, z: 0, duration: 14)
            )
            root.runAction(spin, forKey: "idle_spin")

            scene.rootNode.addChildNode(root)
            avatarRoot = root
        }

        private func loadBundledModel() -> SCNNode? {
            let candidates = ["basic.obj", "basic.scn"]
            var loadedScene: SCNScene?
            for filename in candidates {
                let basename = URL(fileURLWithPath: filename).deletingPathExtension().lastPathComponent
                let ext = URL(fileURLWithPath: filename).pathExtension
                if let s = SCNScene(named: "Models/\(filename)") ?? SCNScene(named: filename) {
                    loadedScene = s
                    break
                }
                if let url = Bundle.main.url(forResource: basename, withExtension: ext, subdirectory: "Models"),
                   let s = try? SCNScene(url: url) {
                    loadedScene = s
                    break
                }
            }
            guard let scene = loadedScene else { return nil }

            let wrapper = scene.rootNode.clone()
            tintAvatar(wrapper, color: skinColor)
            mapBodyGroups(from: wrapper)

            let (minV, maxV) = wrapper.boundingBox
            let height = max(maxV.y - minV.y, 0.0001)
            let targetHeight: Float = 1.8
            let scale = targetHeight / height
            wrapper.scale = SCNVector3(scale, scale, scale)
            wrapper.pivot = SCNMatrix4MakeTranslation(
                (minV.x + maxV.x) * 0.5, minV.y, (minV.z + maxV.z) * 0.5
            )
            wrapper.position = SCNVector3(0, -targetHeight * 0.34, 0)
            return wrapper
        }

        private func tintAvatar(_ root: SCNNode, color: UIColor) {
            root.enumerateChildNodes { node, _ in
                guard let geometry = node.geometry else { return }
                let count = max(1, geometry.materials.count)
                geometry.materials = (0..<count).map { _ in
                    let mat = SCNMaterial()
                    mat.diffuse.contents = color
                    mat.lightingModel = .physicallyBased
                    mat.roughness.contents = 0.72
                    mat.metalness.contents = 0.0
                    mat.isDoubleSided = true
                    return mat
                }
            }
        }

        private func mapBodyGroups(from root: SCNNode) {
            bodyGroupNodes.removeAll()
            var geometryNodes: [(node: SCNNode, center: SCNVector3)] = []
            root.enumerateChildNodes { node, _ in
                guard node.geometry != nil else { return }
                let (minB, maxB) = node.boundingBox
                let worldPos = node.convertPosition(
                    SCNVector3((minB.x + maxB.x) * 0.5, (minB.y + maxB.y) * 0.5, (minB.z + maxB.z) * 0.5),
                    to: root
                )
                geometryNodes.append((node, worldPos))
            }
            guard !geometryNodes.isEmpty else { return }

            let (rootMin, rootMax) = root.boundingBox
            let totalHeight = rootMax.y - rootMin.y
            let halfWidth = (rootMax.x - rootMin.x) * 0.5
            let midX = (rootMin.x + rootMax.x) * 0.5
            guard totalHeight > 0, halfWidth > 0 else { return }

            let armThreshold = halfWidth * 0.30
            for entry in geometryNodes {
                let relY = (entry.center.y - rootMin.y) / totalHeight
                let distFromCenter = abs(entry.center.x - midX)
                let isLeft = entry.center.x < midX

                let group: String
                if relY > 0.80 {
                    group = "head"
                } else if distFromCenter > armThreshold {
                    group = isLeft ? "leftArm" : "rightArm"
                } else if relY > 0.35 {
                    group = "torso"
                } else {
                    group = isLeft ? "leftLeg" : "rightLeg"
                }
                bodyGroupNodes[group, default: []].append(entry.node)
            }
        }

        private func buildProceduralR15() -> SCNNode {
            let root = SCNNode()
            let headW: CGFloat = 0.38, headH: CGFloat = 0.40
            let torsoW: CGFloat = 0.50, torsoH: CGFloat = 0.58, torsoD: CGFloat = 0.25
            let armW: CGFloat = 0.18, armH: CGFloat = 0.58
            let legW: CGFloat = 0.20, legH: CGFloat = 0.66

            let torsoY: Float = 0
            let headY = Float(torsoH / 2 + headH / 2 + 0.015)
            let armX = Float(torsoW / 2 + armW / 2 + 0.024)
            let armY = Float(torsoH / 2 - armH / 2 - 0.005)
            let legX = Float(torsoW / 4)
            let legY = -Float(torsoH / 2 + legH / 2)

            @discardableResult
            func box(_ w: CGFloat, _ h: CGFloat, _ d: CGFloat, pos: SCNVector3, group: String) -> SCNNode {
                let geom = SCNBox(width: w, height: h, length: d, chamferRadius: 0.02)
                geom.materials = (0..<6).map { _ in
                    let m = SCNMaterial()
                    m.diffuse.contents = skinColor
                    m.lightingModel = .physicallyBased
                    m.roughness.contents = 0.72
                    m.isDoubleSided = true
                    return m
                }
                let node = SCNNode(geometry: geom)
                node.position = pos
                bodyGroupNodes[group, default: []].append(node)
                root.addChildNode(node)
                return node
            }

            box(headW, headH, headW, pos: SCNVector3(0, headY, 0), group: "head")
            box(torsoW, torsoH, torsoD, pos: SCNVector3(0, torsoY, 0), group: "torso")
            box(armW, armH, armW, pos: SCNVector3(-armX, armY, 0), group: "leftArm")
            box(armW, armH, armW, pos: SCNVector3(armX, armY, 0), group: "rightArm")
            box(legW, legH, legW, pos: SCNVector3(-legX, legY, 0), group: "leftLeg")
            box(legW, legH, legW, pos: SCNVector3(legX, legY, 0), group: "rightLeg")

            root.scale = SCNVector3(1.04, 1.04, 1.04)
            root.position = SCNVector3(0, -0.06, 0)
            return root
        }

        // MARK: - Texture loading & application

        func loadTextures(shirt shirtURL: URL?, pants pantsURL: URL?) {
            loadTask?.cancel()
            currentShirtURL = shirtURL
            currentPantsURL = pantsURL

            guard shirtURL != nil || pantsURL != nil else { return }

            loadTask = Task { [weak self] in
                async let shirtImage = Self.downloadImage(from: shirtURL)
                async let pantsImage = Self.downloadImage(from: pantsURL)
                let (shirt, pants) = await (shirtImage, pantsImage)
                guard !Task.isCancelled else { return }
                await MainActor.run { [weak self] in
                    self?.applyClothingTextures(shirt: shirt, pants: pants)
                }
            }
        }

        private static func downloadImage(from url: URL?) async -> UIImage? {
            guard let url else { return nil }
            do {
                let (data, _) = try await URLSession.shared.data(from: url)
                return UIImage(data: data)
            } catch {
                print("[ClothingPreview3D] Failed to download texture: \(error.localizedDescription)")
                return nil
            }
        }

        /// Applies clothing templates to body-part groups.
        /// Matches AvatarSceneView.applyFullTemplateToMappedGroups:
        /// NO vFlipTransform, just clamp wrapping. The model's UVs are
        /// designed to sample correct regions from the 585×559 template.
        private func applyClothingTextures(shirt: UIImage?, pants: UIImage?) {
            let shirtGroups: Set<String> = ["torso", "leftArm", "rightArm"]
            let pantsGroups: Set<String> = ["leftLeg", "rightLeg"]

            for (group, nodes) in bodyGroupNodes {
                let useShirt = shirtGroups.contains(group)
                let usePants = pantsGroups.contains(group)
                let texture: UIImage? = useShirt ? shirt : (usePants ? pants : nil)

                for node in nodes {
                    guard let geometry = node.geometry else { continue }
                    let materialCount = max(1, geometry.materials.count)
                    geometry.materials = (0..<materialCount).map { _ in
                        let mat = SCNMaterial()
                        if let texture {
                            mat.diffuse.contents = texture
                        } else {
                            mat.diffuse.contents = self.skinColor
                        }
                        mat.diffuse.wrapS = .clamp
                        mat.diffuse.wrapT = .clamp
                        mat.isDoubleSided = true
                        mat.lightingModel = .physicallyBased
                        mat.roughness.contents = 0.72
                        mat.metalness.contents = 0.0
                        return mat
                    }
                }
            }
        }
    }
}
