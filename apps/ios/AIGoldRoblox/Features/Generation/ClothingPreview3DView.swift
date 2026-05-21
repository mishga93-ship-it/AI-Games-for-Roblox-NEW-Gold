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

            // 2026-05-21: force procedural R15. Bundled basic.obj/.scn was
            // returning a single-mesh or oddly-proportioned avatar where
            // mapBodyGroups misclassified the legs as "torso" (relY > 0.35
            // doesn't always separate them), so shirt textures bled onto
            // the legs. Procedural builds six discrete SCNBox nodes with
            // explicit group labels — head / torso / leftArm / rightArm /
            // leftLeg / rightLeg — so the per-face UV crop in
            // applyClothingTextures has unambiguous targets.
            usesProceduralAvatar = true
            let procedural = buildProceduralR15()
            root.addChildNode(procedural)

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

        /// 2026-05-21 — accurate UV-region mapping that mirrors Roblox's
        /// classic shirt template. The old code stretched the whole 585×559
        /// PNG onto each face of every SCNBox, which produced the "design
        /// only on one arm + skin everywhere else" preview the user
        /// complained about — SceneKit's default per-face UV unwrap does
        /// not match Roblox's classic UV.
        ///
        /// SCNBox material order: [+Z front, +X right, -Z back, -X left,
        /// +Y top, -Y bottom]. For each body part we now crop the
        /// SHIRT_REGIONS / PANTS_REGIONS slice of the 585×559 texture that
        /// Roblox would render on that face, and assign it to the matching
        /// material slot. Result: the iOS preview matches what the avatar
        /// actually looks like in Studio.
        private func applyClothingTextures(shirt: UIImage?, pants: UIImage?) {
            // Roblox classic shirt 585×559 UV regions — mirror of
            // SHIRT_REGIONS in apps/functions/src/clothingCompositor.ts.
            // (x, y, w, h) in pixels.
            struct Region {
                let x: CGFloat, y: CGFloat, w: CGFloat, h: CGFloat
            }
            // SCNBox face order: [front +Z, right +X, back -Z, left -X, top +Y, bottom -Y]
            let torsoFaces: [Region] = [
                Region(x:  64, y:  44, w: 128, h: 128), // front
                Region(x: 192, y:  44, w:  64, h: 128), // right
                Region(x: 256, y:  44, w: 128, h: 128), // back
                Region(x:   0, y:  44, w:  64, h: 128), // left
                Region(x:  64, y:   0, w: 128, h:  44), // top
                Region(x:  64, y: 172, w: 128, h:  44), // bottom
            ]
            let leftArmFaces: [Region] = [
                Region(x:  64, y: 284, w:  64, h: 128), // front
                Region(x: 128, y: 284, w:  64, h: 128), // right
                Region(x: 192, y: 284, w:  64, h: 128), // back
                Region(x:   0, y: 284, w:  64, h: 128), // left
                Region(x:  64, y: 240, w:  64, h:  44), // top
                Region(x:  64, y: 412, w:  64, h:  44), // bottom
            ]
            let rightArmFaces: [Region] = [
                Region(x: 384, y: 284, w:  64, h: 128), // front
                Region(x: 448, y: 284, w:  64, h: 128), // right
                Region(x: 512, y: 284, w:  64, h: 128), // back
                Region(x: 320, y: 284, w:  64, h: 128), // left
                Region(x: 384, y: 240, w:  64, h:  44), // top
                Region(x: 384, y: 412, w:  64, h:  44), // bottom
            ]
            // Pants regions — mirror of PANTS_REGIONS in clothingCompositor.ts.
            let leftLegFaces: [Region] = [
                Region(x:  64, y: 284, w:  64, h: 128), // front
                Region(x: 128, y: 284, w:  64, h: 128), // right
                Region(x: 192, y: 284, w:  64, h: 128), // back
                Region(x:   0, y: 284, w:  64, h: 128), // left
                Region(x:  64, y: 240, w:  64, h:  44), // top
                Region(x:  64, y: 412, w:  64, h:  44), // bottom
            ]
            let rightLegFaces: [Region] = [
                Region(x: 384, y: 284, w:  64, h: 128), // front
                Region(x: 448, y: 284, w:  64, h: 128), // right
                Region(x: 512, y: 284, w:  64, h: 128), // back
                Region(x: 320, y: 284, w:  64, h: 128), // left
                Region(x: 384, y: 240, w:  64, h:  44), // top
                Region(x: 384, y: 412, w:  64, h:  44), // bottom
            ]

            func cropImage(_ src: UIImage, region: Region, templateW: CGFloat = 585, templateH: CGFloat = 559) -> UIImage? {
                guard let cg = src.cgImage else { return nil }
                let scaleX = CGFloat(cg.width) / templateW
                let scaleY = CGFloat(cg.height) / templateH
                let rect = CGRect(
                    x: region.x * scaleX,
                    y: region.y * scaleY,
                    width: region.w * scaleX,
                    height: region.h * scaleY,
                )
                guard let cropped = cg.cropping(to: rect) else { return nil }
                return UIImage(cgImage: cropped)
            }

            func materialForRegion(_ regionImage: UIImage?, fallback: UIColor) -> SCNMaterial {
                let mat = SCNMaterial()
                mat.diffuse.contents = regionImage ?? fallback
                mat.diffuse.wrapS = .clamp
                mat.diffuse.wrapT = .clamp
                mat.isDoubleSided = true
                mat.lightingModel = .physicallyBased
                mat.roughness.contents = 0.72
                mat.metalness.contents = 0.0
                return mat
            }

            let groupToFaces: [String: [Region]] = [
                "torso": torsoFaces,
                "leftArm": leftArmFaces,
                "rightArm": rightArmFaces,
                "leftLeg": leftLegFaces,
                "rightLeg": rightLegFaces,
            ]
            let shirtGroups: Set<String> = ["torso", "leftArm", "rightArm"]
            let pantsGroups: Set<String> = ["leftLeg", "rightLeg"]

            for (group, nodes) in bodyGroupNodes {
                let useShirt = shirtGroups.contains(group)
                let usePants = pantsGroups.contains(group)
                let texture: UIImage? = useShirt ? shirt : (usePants ? pants : nil)
                let faces = groupToFaces[group]

                for node in nodes {
                    guard let geometry = node.geometry else { continue }
                    let materialCount = max(1, geometry.materials.count)
                    if let texture {
                        // 2026-05-21: never fall back to skinColor when a
                        // shirt/pants texture exists — the previous code
                        // silently rendered a bare mannequin when materialCount
                        // didn't equal faces.count (e.g. imported SCN models
                        // have 1 material), making the preview look broken.
                        // Now we always show the texture; per-face crop is the
                        // preferred path, full-texture stretch is the safety
                        // net.
                        if let faces, materialCount == faces.count {
                            geometry.materials = faces.map { region in
                                let cropped = cropImage(texture, region: region) ?? texture
                                return materialForRegion(cropped, fallback: self.skinColor)
                            }
                        } else {
                            // Material count doesn't match expected 6 — fall back
                            // to stretching the full texture so the user at
                            // least sees the design (UV-incorrect but visible).
                            geometry.materials = (0..<materialCount).map { _ in
                                materialForRegion(texture, fallback: self.skinColor)
                            }
                        }
                    } else {
                        // No texture for this group (head, or no pants supplied):
                        // solid skin colour on every face.
                        geometry.materials = (0..<materialCount).map { _ in
                            materialForRegion(nil, fallback: self.skinColor)
                        }
                    }
                }
            }
        }
    }
}
