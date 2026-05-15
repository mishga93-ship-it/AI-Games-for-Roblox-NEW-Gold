import SwiftUI
import SceneKit
import ModelIO
import SceneKit.ModelIO

// MARK: - Real 3D Model Preview (downloads and displays GLB/OBJ from URL)

struct RealModel3DPreview: UIViewRepresentable {
    let modelURL: URL

    func makeUIView(context: Context) -> SCNView {
        let scnView = SCNView()
        scnView.scene = SCNScene()
        scnView.allowsCameraControl = true
        scnView.backgroundColor = .clear
        scnView.autoenablesDefaultLighting = true
        scnView.antialiasingMode = .multisampling4X
        context.coordinator.downloadAndDisplay(url: modelURL, in: scnView)
        return scnView
    }

    func updateUIView(_ uiView: SCNView, context: Context) {
        if context.coordinator.currentURL != modelURL {
            context.coordinator.downloadAndDisplay(url: modelURL, in: uiView)
        }
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    class Coordinator {
        var currentURL: URL?
        private var downloadTask: Task<Void, Never>?
        private var modelNode: SCNNode?

        private func debugLog(_ location: String, _ message: String, _ data: [String: Any] = [:]) {
            #if DEBUG
            print("[GenerationModelPreview] \(location) | \(message)")
            #endif
        }

        func downloadAndDisplay(url: URL, in scnView: SCNView) {
            downloadTask?.cancel()
            currentURL = url

            debugLog("downloadAndDisplay", "Starting download", ["url": url.absoluteString])

            downloadTask = Task { [weak self] in
                do {
                    let (localURL, response) = try await URLSession.shared.download(from: url)
                    let httpResponse = response as? HTTPURLResponse
                    let ext = url.pathExtension.lowercased()
                    let targetExt = ext.isEmpty ? "glb" : ext
                    let dest = FileManager.default.temporaryDirectory
                        .appendingPathComponent(UUID().uuidString)
                        .appendingPathExtension(targetExt)
                    try FileManager.default.moveItem(at: localURL, to: dest)


                    let fileSize = (try? FileManager.default.attributesOfItem(atPath: dest.path)[.size] as? Int) ?? -1
                    self?.debugLog("GenerationModelPreview.swift:downloadComplete", "Download finished", [
                        "statusCode": httpResponse?.statusCode ?? -1,
                        "fileSize": fileSize,
                        "targetExt": targetExt,
                        "destPath": dest.lastPathComponent,
                        "mimeType": httpResponse?.mimeType ?? "nil",
                        "hypothesisId": "H2,H3"
                    ])


                    guard !Task.isCancelled else { return }
                    await MainActor.run { self?.loadModel(from: dest, into: scnView) }
                } catch {

                    self?.debugLog("GenerationModelPreview.swift:downloadError", "Download FAILED", [
                        "error": error.localizedDescription,
                        "errorType": String(describing: type(of: error)),
                        "url": url.absoluteString,
                        "hypothesisId": "H2"
                    ])

                    print("[RealModel3DPreview] Download failed: \(error.localizedDescription)")
                    await MainActor.run { self?.showFallback(in: scnView) }
                }
            }
        }

        private func loadModel(from fileURL: URL, into scnView: SCNView) {
            modelNode?.removeFromParentNode()
            let ext = fileURL.pathExtension.lowercased()
            let scene: SCNScene?


            debugLog("GenerationModelPreview.swift:loadModel", "Attempting to load model", [
                "ext": ext,
                "fileURL": fileURL.lastPathComponent,
                "hypothesisId": "H1"
            ])


            if ext == "glb" || ext == "gltf" {
                let asset = MDLAsset(url: fileURL)
                asset.loadTextures()

                debugLog("GenerationModelPreview.swift:loadModel:glb", "MDLAsset loaded for GLB/GLTF", [
                    "assetCount": asset.count,
                    "canImportGLB": MDLAsset.canImportFileExtension("glb"),
                    "canImportGLTF": MDLAsset.canImportFileExtension("gltf"),
                    "hypothesisId": "H1"
                ])

                scene = asset.count > 0 ? SCNScene(mdlAsset: asset) : nil
            } else if ext == "obj" {
                let asset = MDLAsset(url: fileURL)
                asset.loadTextures()

                debugLog("GenerationModelPreview.swift:loadModel:obj", "MDLAsset loaded for OBJ", ["assetCount": asset.count, "hypothesisId": "H1"])

                scene = asset.count > 0 ? SCNScene(mdlAsset: asset) : nil
            } else if ext == "usdz" || ext == "usdc" || ext == "usda" {
                scene = try? SCNScene(url: fileURL)
            } else {
                let asset = MDLAsset(url: fileURL)
                asset.loadTextures()

                debugLog("GenerationModelPreview.swift:loadModel:other", "MDLAsset for unknown ext", ["assetCount": asset.count, "ext": ext, "hypothesisId": "H1"])

                scene = asset.count > 0 ? SCNScene(mdlAsset: asset) : (try? SCNScene(url: fileURL))
            }


            debugLog("GenerationModelPreview.swift:loadModel:result", "Scene load result", [
                "sceneIsNil": scene == nil,
                "childCount": scene?.rootNode.childNodes.count ?? -1,
                "hypothesisId": "H1,H3"
            ])


            guard let loadedScene = scene else { showFallback(in: scnView); return }

            let root = SCNNode()
            root.name = "real_model_root"
            for child in loadedScene.rootNode.childNodes { root.addChildNode(child.clone()) }

            let (minV, maxV) = root.boundingBox
            let maxDim = max(maxV.x - minV.x, max(maxV.y - minV.y, maxV.z - minV.z))
            if maxDim > 0.0001 {
                let targetSize: Float = 2.2
                let s = targetSize / maxDim
                root.scale = SCNVector3(s, s, s)
                root.pivot = SCNMatrix4MakeTranslation(
                    (minV.x + maxV.x) * 0.5, minV.y, (minV.z + maxV.z) * 0.5
                )
                root.position = SCNVector3(0, -targetSize * 0.35, 0)
            }

            let cam = SCNNode()
            cam.camera = SCNCamera()
            cam.camera?.fieldOfView = 50
            cam.camera?.automaticallyAdjustsZRange = true
            cam.position = SCNVector3(0, 0.5, 3.5)
            cam.look(at: SCNVector3(0, 0, 0))

            let ambient = SCNNode()
            ambient.light = SCNLight()
            ambient.light?.type = .ambient
            ambient.light?.intensity = 600
            ambient.light?.color = UIColor(white: 0.9, alpha: 1)

            let key = SCNNode()
            key.light = SCNLight()
            key.light?.type = .omni
            key.light?.intensity = 1000
            key.position = SCNVector3(3, 4, 5)

            let fill = SCNNode()
            fill.light = SCNLight()
            fill.light?.type = .omni
            fill.light?.intensity = 400
            fill.position = SCNVector3(-3, 2, 3)

            let newScene = SCNScene()
            newScene.rootNode.addChildNode(root)
            newScene.rootNode.addChildNode(cam)
            newScene.rootNode.addChildNode(ambient)
            newScene.rootNode.addChildNode(key)
            newScene.rootNode.addChildNode(fill)
            newScene.background.contents = UIColor.clear

            root.runAction(SCNAction.repeatForever(
                SCNAction.rotateBy(x: 0, y: .pi * 2, z: 0, duration: 12)
            ), forKey: "idle_spin")

            scnView.scene = newScene
            modelNode = root
        }

        private func showFallback(in scnView: SCNView) {
            let scene = SCNScene()
            let cam = SCNNode()
            cam.camera = SCNCamera()
            cam.camera?.fieldOfView = 50
            cam.position = SCNVector3(0, 0.3, 2.8)
            cam.look(at: SCNVector3(0, 0, 0))
            let ambient = SCNNode()
            ambient.light = SCNLight()
            ambient.light?.type = .ambient
            ambient.light?.intensity = 500
            scene.rootNode.addChildNode(cam)
            scene.rootNode.addChildNode(ambient)
            scene.background.contents = UIColor.clear
            scnView.scene = scene
        }
    }
}

// MARK: - Character Archetype

struct CharacterArchetype: Equatable {
    let id: String
    let skinColor: UIColor
    let clothingColor: UIColor?
    let scaleMultiplier: CGFloat
    let muscleFactor: CGFloat
    let expression: Expression
    let accessories: [Accessory]

    enum Expression: Equatable {
        case neutral
        case angry
        case happy
    }

    enum Accessory: Equatable {
        case tornPants(color: UIColor)
        case helmet(color: UIColor)
        case horns(color: UIColor)
        case cape(color: UIColor)
        case crown(color: UIColor)
        case wings(color: UIColor)
        case sword(color: UIColor)
        case aura(color: UIColor)
    }

    static let `default` = CharacterArchetype(
        id: "default", skinColor: .systemBlue, clothingColor: nil,
        scaleMultiplier: 1.0, muscleFactor: 0.0, expression: .neutral, accessories: []
    )

    static func detect(from text: String) -> CharacterArchetype {
        let t = text.lowercased()

        if t.contains("hulk") || t.contains("халк") || (t.contains("rage") && t.contains("transform")) {
            return CharacterArchetype(
                id: "hulk",
                skinColor: UIColor(red: 0.28, green: 0.65, blue: 0.18, alpha: 1),
                clothingColor: UIColor(red: 0.38, green: 0.22, blue: 0.55, alpha: 1),
                scaleMultiplier: 1.35,
                muscleFactor: 1.0,
                expression: .angry,
                accessories: [.tornPants(color: UIColor(red: 0.38, green: 0.22, blue: 0.55, alpha: 1))]
            )
        }
        if t.contains("dragon") || t.contains("drake") || t.contains("дракон") {
            return CharacterArchetype(
                id: "dragon",
                skinColor: UIColor(red: 0.7, green: 0.15, blue: 0.1, alpha: 1),
                clothingColor: UIColor(red: 0.85, green: 0.55, blue: 0.1, alpha: 1),
                scaleMultiplier: 1.25,
                muscleFactor: 0.6,
                expression: .angry,
                accessories: [
                    .horns(color: UIColor(red: 0.35, green: 0.12, blue: 0.08, alpha: 1)),
                    .wings(color: UIColor(red: 0.75, green: 0.2, blue: 0.12, alpha: 1)),
                ]
            )
        }
        if t.contains("knight") || t.contains("paladin") || t.contains("warrior") || t.contains("рыцарь") || t.contains("воин") || t.contains("паладин") {
            return CharacterArchetype(
                id: "knight",
                skinColor: UIColor(red: 0.6, green: 0.63, blue: 0.68, alpha: 1),
                clothingColor: UIColor(red: 0.35, green: 0.38, blue: 0.45, alpha: 1),
                scaleMultiplier: 1.15,
                muscleFactor: 0.5,
                expression: .neutral,
                accessories: [
                    .helmet(color: UIColor(red: 0.6, green: 0.63, blue: 0.68, alpha: 1)),
                    .sword(color: UIColor(red: 0.78, green: 0.78, blue: 0.82, alpha: 1)),
                ]
            )
        }
        if t.contains("ninja") || t.contains("assassin") || t.contains("shadow") || t.contains("ниндзя") || t.contains("ниндз") || t.contains("ассасин") || t.contains("тень") {
            return CharacterArchetype(
                id: "ninja",
                skinColor: UIColor(red: 0.18, green: 0.18, blue: 0.22, alpha: 1),
                clothingColor: UIColor(red: 0.12, green: 0.12, blue: 0.15, alpha: 1),
                scaleMultiplier: 0.95,
                muscleFactor: 0.2,
                expression: .neutral,
                accessories: [.sword(color: UIColor(red: 0.65, green: 0.65, blue: 0.7, alpha: 1))]
            )
        }
        if t.contains("robot") || t.contains("mech") || t.contains("android") || t.contains("cyborg") || t.contains("робот") || t.contains("мех") || t.contains("киборг") {
            return CharacterArchetype(
                id: "robot",
                skinColor: UIColor(red: 0.55, green: 0.58, blue: 0.62, alpha: 1),
                clothingColor: UIColor(red: 0.2, green: 0.75, blue: 0.9, alpha: 1),
                scaleMultiplier: 1.2,
                muscleFactor: 0.4,
                expression: .neutral,
                accessories: [.aura(color: UIColor(red: 0.2, green: 0.85, blue: 0.95, alpha: 0.4))]
            )
        }
        if t.contains("demon") || t.contains("devil") || t.contains("inferno") || t.contains("демон") || t.contains("дьявол") {
            return CharacterArchetype(
                id: "demon",
                skinColor: UIColor(red: 0.65, green: 0.12, blue: 0.12, alpha: 1),
                clothingColor: UIColor(red: 0.15, green: 0.08, blue: 0.08, alpha: 1),
                scaleMultiplier: 1.2,
                muscleFactor: 0.7,
                expression: .angry,
                accessories: [
                    .horns(color: UIColor(red: 0.25, green: 0.08, blue: 0.08, alpha: 1)),
                    .aura(color: UIColor(red: 0.95, green: 0.3, blue: 0.1, alpha: 0.35)),
                ]
            )
        }
        if t.contains("king") || t.contains("queen") || t.contains("royal") || t.contains("emperor") || t.contains("король") || t.contains("королев") || t.contains("императ") {
            let isQueen = t.contains("queen") || t.contains("empress") || t.contains("королев")
            return CharacterArchetype(
                id: isQueen ? "queen" : "king",
                skinColor: UIColor(red: 0.85, green: 0.7, blue: 0.5, alpha: 1),
                clothingColor: UIColor(red: 0.6, green: 0.15, blue: 0.18, alpha: 1),
                scaleMultiplier: 1.1,
                muscleFactor: isQueen ? 0.0 : 0.3,
                expression: .neutral,
                accessories: [
                    .crown(color: UIColor(red: 0.92, green: 0.78, blue: 0.2, alpha: 1)),
                    .cape(color: UIColor(red: 0.6, green: 0.15, blue: 0.18, alpha: 1)),
                ]
            )
        }
        if t.contains("zombie") || t.contains("undead") || t.contains("зомби") || t.contains("мертвец") {
            return CharacterArchetype(
                id: "zombie",
                skinColor: UIColor(red: 0.5, green: 0.6, blue: 0.35, alpha: 1),
                clothingColor: UIColor(red: 0.35, green: 0.3, blue: 0.25, alpha: 1),
                scaleMultiplier: 1.0,
                muscleFactor: 0.0,
                expression: .angry,
                accessories: []
            )
        }
        if t.contains("wizard") || t.contains("mage") || t.contains("sorcerer") || t.contains("маг") || t.contains("волшебник") || t.contains("колдун") {
            return CharacterArchetype(
                id: "wizard",
                skinColor: UIColor(red: 0.7, green: 0.65, blue: 0.8, alpha: 1),
                clothingColor: UIColor(red: 0.3, green: 0.2, blue: 0.55, alpha: 1),
                scaleMultiplier: 1.0,
                muscleFactor: 0.0,
                expression: .neutral,
                accessories: [.aura(color: UIColor(red: 0.55, green: 0.3, blue: 0.85, alpha: 0.3))]
            )
        }
        if t.contains("pirate") || t.contains("buccaneer") || t.contains("пират") {
            return CharacterArchetype(
                id: "pirate",
                skinColor: UIColor(red: 0.75, green: 0.55, blue: 0.4, alpha: 1),
                clothingColor: UIColor(red: 0.55, green: 0.15, blue: 0.12, alpha: 1),
                scaleMultiplier: 1.05,
                muscleFactor: 0.3,
                expression: .happy,
                accessories: [.sword(color: UIColor(red: 0.7, green: 0.7, blue: 0.75, alpha: 1))]
            )
        }
        if t.contains("ice") || t.contains("frost") || t.contains("frozen") || t.contains("arctic") || t.contains("лёд") || t.contains("лед") || t.contains("мороз") || t.contains("холод") {
            return CharacterArchetype(
                id: "ice",
                skinColor: UIColor(red: 0.6, green: 0.82, blue: 0.95, alpha: 1),
                clothingColor: UIColor(red: 0.25, green: 0.45, blue: 0.7, alpha: 1),
                scaleMultiplier: 1.1,
                muscleFactor: 0.3,
                expression: .neutral,
                accessories: [.aura(color: UIColor(red: 0.7, green: 0.9, blue: 1.0, alpha: 0.3))]
            )
        }
        if t.contains("fire") || t.contains("lava") || t.contains("flame") || t.contains("огонь") || t.contains("огнен") || t.contains("лава") || t.contains("пламя") {
            return CharacterArchetype(
                id: "fire",
                skinColor: UIColor(red: 0.9, green: 0.4, blue: 0.1, alpha: 1),
                clothingColor: UIColor(red: 0.6, green: 0.15, blue: 0.05, alpha: 1),
                scaleMultiplier: 1.1,
                muscleFactor: 0.4,
                expression: .angry,
                accessories: [.aura(color: UIColor(red: 1.0, green: 0.55, blue: 0.1, alpha: 0.35))]
            )
        }
        if t.contains("princess") || t.contains("fairy") || t.contains("unicorn") || t.contains("принцесс") || t.contains("фея") || t.contains("единорог") {
            return CharacterArchetype(
                id: "fairy",
                skinColor: UIColor(red: 0.95, green: 0.75, blue: 0.85, alpha: 1),
                clothingColor: UIColor(red: 0.85, green: 0.5, blue: 0.7, alpha: 1),
                scaleMultiplier: 0.95,
                muscleFactor: 0.0,
                expression: .happy,
                accessories: [
                    .crown(color: UIColor(red: 0.92, green: 0.78, blue: 0.2, alpha: 1)),
                    .wings(color: UIColor(red: 0.9, green: 0.75, blue: 0.95, alpha: 0.7)),
                ]
            )
        }

        return .default
    }
}

// MARK: - GenerationModelPreview

struct GenerationModelPreview: UIViewRepresentable {
    let bodyType: AvatarBodyType
    let accentColor: Color
    let textureURL: URL?
    let autoRotate: Bool
    let archetype: CharacterArchetype

    init(
        bodyType: AvatarBodyType = .neutrally,
        accentColor: Color = .accentPrimary,
        textureURL: URL? = nil,
        autoRotate: Bool = true,
        archetype: CharacterArchetype = .default
    ) {
        self.bodyType = bodyType
        self.accentColor = accentColor
        self.textureURL = textureURL
        self.autoRotate = autoRotate
        self.archetype = archetype
    }

    func makeUIView(context: Context) -> SCNView {
        let scnView = SCNView()
        scnView.scene = SCNScene()
        scnView.allowsCameraControl = true
        scnView.backgroundColor = .clear
        scnView.autoenablesDefaultLighting = false
        scnView.antialiasingMode = .multisampling4X
        scnView.isJitteringEnabled = true
        context.coordinator.setup(scene: scnView.scene!, bodyType: bodyType, color: UIColor(accentColor), archetype: archetype)
        if autoRotate {
            context.coordinator.startIdleRotation(in: scnView.scene!)
        }
        if let textureURL {
            context.coordinator.loadTexture(from: textureURL)
        }
        return scnView
    }

    func updateUIView(_ uiView: SCNView, context: Context) {
        guard let scene = uiView.scene else { return }
        let c = context.coordinator
        let newColor = UIColor(accentColor)

        if c.currentBodyType != bodyType || c.currentArchetype != archetype {
            c.rebuildAvatar(bodyType: bodyType, color: newColor, archetype: archetype, in: scene)
            if let textureURL { c.loadTexture(from: textureURL) }
        } else if c.currentColor != newColor && c.appliedTexture == nil {
            c.applyColor(newColor)
            c.currentColor = newColor
        }

        if textureURL != c.currentTextureURL {
            c.currentTextureURL = textureURL
            if let textureURL {
                c.loadTexture(from: textureURL)
            } else {
                c.removeTexture()
            }
        }
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    class Coordinator {
        var avatarRoot: SCNNode?
        var bodyNodes: [SCNNode] = []
        var accentNodes: [SCNNode] = []
        var currentBodyType: AvatarBodyType = .neutrally
        var currentArchetype: CharacterArchetype = .default
        var currentColor: UIColor = .white
        var currentTextureURL: URL?
        var appliedTexture: UIImage?
        private var textureLoadTask: Task<Void, Never>?
        private var spriteNode: SCNNode?

        func setup(scene: SCNScene, bodyType: AvatarBodyType, color: UIColor, archetype: CharacterArchetype) {
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
            key.light?.color = UIColor(white: 1.0, alpha: 1)
            key.position = SCNVector3(2.5, 4, 4)
            scene.rootNode.addChildNode(key)

            let fill = SCNNode()
            fill.light = SCNLight()
            fill.light?.type = .omni
            fill.light?.intensity = 350
            fill.light?.color = UIColor(red: 0.85, green: 0.88, blue: 1.0, alpha: 1)
            fill.position = SCNVector3(-2, 2, 3)
            scene.rootNode.addChildNode(fill)

            let rim = SCNNode()
            rim.light = SCNLight()
            rim.light?.type = .omni
            rim.light?.intensity = 400
            rim.position = SCNVector3(0, 3, -4)
            scene.rootNode.addChildNode(rim)

            let cam = SCNNode()
            cam.camera = SCNCamera()
            cam.camera?.fieldOfView = 46
            cam.camera?.wantsDepthOfField = true
            cam.camera?.focusDistance = 3.2
            cam.camera?.fStop = 8
            cam.position = SCNVector3(0, 0.5, 3.2)
            cam.look(at: SCNVector3(0, 0.15, 0))
            scene.rootNode.addChildNode(cam)

            scene.background.contents = UIColor.clear

            rebuildAvatar(bodyType: bodyType, color: color, archetype: archetype, in: scene)
        }

        func startIdleRotation(in scene: SCNScene) {
            guard let root = avatarRoot else { return }
            let spin = SCNAction.repeatForever(
                SCNAction.rotateBy(x: 0, y: .pi * 2, z: 0, duration: 14)
            )
            root.runAction(spin, forKey: "idle_spin")
        }

        func rebuildAvatar(bodyType: AvatarBodyType, color: UIColor, archetype: CharacterArchetype, in scene: SCNScene) {
            avatarRoot?.removeFromParentNode()
            avatarRoot = nil
            bodyNodes.removeAll()
            accentNodes.removeAll()
            spriteNode = nil
            appliedTexture = nil

            let root = SCNNode()
            root.name = "preview_avatar"

            let useProceduralForArchetype = archetype.muscleFactor > 0
                || !archetype.accessories.isEmpty
                || archetype.expression != .neutral
                || archetype.scaleMultiplier != 1.0

            if useProceduralForArchetype {
                let procedural = buildProceduralCharacter(type: bodyType, archetype: archetype)
                root.addChildNode(procedural)
            } else if let bundled = loadBundledModel(type: bodyType, archetype: archetype) {
                root.addChildNode(bundled)
                addAccessoriesToBundled(root: bundled, bodyType: bodyType, archetype: archetype)
            } else {
                let procedural = buildProceduralCharacter(type: bodyType, archetype: archetype)
                root.addChildNode(procedural)
            }

            let pedestalColor = archetype.clothingColor ?? archetype.skinColor
            let pedestal = buildPedestal(color: pedestalColor)
            root.addChildNode(pedestal)

            scene.rootNode.addChildNode(root)
            avatarRoot = root
            currentBodyType = bodyType
            currentArchetype = archetype
            currentColor = color

            if root.action(forKey: "idle_spin") == nil {
                let spin = SCNAction.repeatForever(
                    SCNAction.rotateBy(x: 0, y: .pi * 2, z: 0, duration: 14)
                )
                root.runAction(spin, forKey: "idle_spin")
            }
        }

        // MARK: - Texture Loading

        func loadTexture(from url: URL) {
            textureLoadTask?.cancel()
            currentTextureURL = url
            textureLoadTask = Task { [weak self] in
                do {
                    let (data, _) = try await URLSession.shared.data(from: url)
                    guard !Task.isCancelled, let image = UIImage(data: data) else { return }
                    await MainActor.run {
                        self?.applyTexture(image)
                    }
                } catch {
                    print("[GenerationModelPreview] Texture download failed: \(error.localizedDescription)")
                }
            }
        }

        func applyTexture(_ image: UIImage) {
            appliedTexture = image
            addOrUpdateSpriteDisplay(image: image)
        }

        func removeTexture() {
            appliedTexture = nil
            spriteNode?.removeFromParentNode()
            spriteNode = nil
            for node in bodyNodes {
                node.isHidden = false
            }
            if let root = avatarRoot, let pedestal = root.childNode(withName: "pedestal", recursively: true) {
                pedestal.isHidden = false
            }
            applyColor(currentColor)
        }

        private func addOrUpdateSpriteDisplay(image: UIImage) {
            spriteNode?.removeFromParentNode()

            guard let root = avatarRoot else { return }

            for node in bodyNodes {
                node.isHidden = true
            }
            if let pedestal = root.childNode(withName: "pedestal", recursively: true) {
                pedestal.isHidden = true
            }

            let aspect = image.size.width / max(image.size.height, 1)
            let planeHeight: CGFloat = 2.8
            let planeWidth = planeHeight * aspect
            let plane = SCNPlane(width: planeWidth, height: planeHeight)
            plane.cornerRadius = 0.08

            let mat = SCNMaterial()
            mat.diffuse.contents = image
            mat.diffuse.wrapS = .clamp
            mat.diffuse.wrapT = .clamp
            mat.isDoubleSided = true
            mat.lightingModel = .constant
            plane.materials = [mat]

            let node = SCNNode(geometry: plane)
            node.name = "sprite_display"
            node.position = SCNVector3(0, 1.1, 0)

            root.addChildNode(node)
            spriteNode = node
        }

        func applyColor(_ color: UIColor) {
            for node in bodyNodes {
                guard let geometry = node.geometry else { continue }
                for material in geometry.materials {
                    material.diffuse.contents = color
                }
            }
        }

        // MARK: - Procedural Character Builder

        private func buildProceduralCharacter(type: AvatarBodyType, archetype: CharacterArchetype) -> SCNNode {
            let root = SCNNode()
            var p = proportions(for: type)
            let skinColor = archetype.skinColor
            let clothingColor = archetype.clothingColor ?? skinColor
            let muscle = archetype.muscleFactor
            let scale = archetype.scaleMultiplier

            p = CharacterProportions(
                headW: p.headW * (1.0 + muscle * 0.15),
                headH: p.headH * (1.0 + muscle * 0.1),
                headD: p.headD * (1.0 + muscle * 0.12),
                torsoW: p.torsoW * (1.0 + muscle * 0.45),
                torsoH: p.torsoH * (1.0 + muscle * 0.15),
                torsoD: p.torsoD * (1.0 + muscle * 0.35),
                armW: p.armW * (1.0 + muscle * 0.55),
                armH: p.armH * (1.0 + muscle * 0.1),
                armD: p.armD * (1.0 + muscle * 0.5),
                legW: p.legW * (1.0 + muscle * 0.35),
                legH: p.legH * (1.0 + muscle * 0.08),
                legD: p.legD * (1.0 + muscle * 0.3)
            )

            let torsoY: Float = 0
            let headY = Float(p.torsoH / 2 + p.headH / 2 + 0.02)
            let armX = Float(p.torsoW / 2 + p.armW / 2 + 0.025)
            let armY = Float(p.torsoH / 2 - p.armH / 2 - 0.01)
            let legX = Float(p.torsoW / 4)
            let legY = -Float(p.torsoH / 2 + p.legH / 2)

            let hasTornPants = archetype.accessories.contains(where: {
                if case .tornPants = $0 { return true }; return false
            })

            func coloredBox(_ w: CGFloat, _ h: CGFloat, _ d: CGFloat, chamfer: CGFloat, pos: SCNVector3, color: UIColor) -> SCNNode {
                let geom = type == .neutrally
                    ? SCNBox(width: w, height: h, length: d, chamferRadius: 0) as SCNGeometry
                    : SCNBox(width: w, height: h, length: d, chamferRadius: chamfer)
                applyMaterial(geom, color: color)
                let node = SCNNode(geometry: geom)
                node.position = pos
                bodyNodes.append(node)
                return node
            }

            func coloredLimb(_ w: CGFloat, _ h: CGFloat, _ d: CGFloat, pos: SCNVector3, color: UIColor) -> SCNNode {
                let geom: SCNGeometry
                if type == .neutrally {
                    geom = SCNBox(width: w, height: h, length: d, chamferRadius: 0)
                } else {
                    let cyl = SCNCylinder(radius: max(w, d) / 2, height: h)
                    cyl.radialSegmentCount = 24
                    geom = cyl
                }
                applyMaterial(geom, color: color)
                let node = SCNNode(geometry: geom)
                node.position = pos
                bodyNodes.append(node)
                return node
            }

            let torso = coloredBox(p.torsoW, p.torsoH, p.torsoD, chamfer: 0.06, pos: SCNVector3(0, torsoY, 0), color: skinColor)
            let head = coloredBox(p.headW, p.headH, p.headD, chamfer: type == .neutrally ? 0 : 0.04, pos: SCNVector3(0, headY, 0), color: skinColor)
            let lArm = coloredLimb(p.armW, p.armH, p.armD, pos: SCNVector3(-armX, armY, 0), color: skinColor)
            let rArm = coloredLimb(p.armW, p.armH, p.armD, pos: SCNVector3(armX, armY, 0), color: skinColor)

            let legColor = hasTornPants ? clothingColor : skinColor
            let lLeg = coloredLimb(p.legW, p.legH, p.legD, pos: SCNVector3(-legX, legY, 0), color: legColor)
            let rLeg = coloredLimb(p.legW, p.legH, p.legD, pos: SCNVector3(legX, legY, 0), color: legColor)

            let armTilt: Float = type == .neutrally ? 0.02 : (0.06 + Float(muscle) * 0.12)
            lArm.eulerAngles.z = armTilt
            rArm.eulerAngles.z = -armTilt

            [torso, head, lArm, rArm, lLeg, rLeg].forEach { root.addChildNode($0) }

            if hasTornPants {
                addTornPantsEffect(to: lLeg, legSize: (p.legW, p.legH, p.legD), skinColor: skinColor)
                addTornPantsEffect(to: rLeg, legSize: (p.legW, p.legH, p.legD), skinColor: skinColor)
            }

            addFace(to: head, proportions: p, expression: archetype.expression, skinColor: skinColor)

            for accessory in archetype.accessories {
                switch accessory {
                case .helmet(let color):
                    addHelmet(to: head, proportions: p, color: color)
                case .horns(let color):
                    addHorns(to: head, proportions: p, color: color)
                case .cape(let color):
                    addCape(to: torso, proportions: p, color: color)
                case .crown(let color):
                    addCrown(to: head, proportions: p, color: color)
                case .wings(let color):
                    addWings(to: torso, proportions: p, color: color)
                case .sword(let color):
                    addSword(to: rArm, proportions: p, color: color)
                case .aura(let color):
                    addAura(to: root, color: color, scaleMultiplier: scale)
                case .tornPants:
                    break
                }
            }

            let s = Float(scale)
            root.scale = SCNVector3(s * 1.04, s * 1.04, s * 1.04)
            root.position = SCNVector3(0, -0.06 * s, 0)
            return root
        }

        // MARK: - Face & Expression

        private func addFace(to head: SCNNode, proportions p: CharacterProportions, expression: CharacterArchetype.Expression, skinColor: UIColor) {
            let eyeRadius: CGFloat = p.headW * 0.09
            let eyeSpacing: Float = Float(p.headW * 0.16)
            let eyeZ: Float = Float(p.headD / 2 + 0.005)
            let eyeY: Float = Float(p.headH * 0.08)

            let eyeColor: UIColor = expression == .angry
                ? UIColor(red: 1.0, green: 0.95, blue: 0.8, alpha: 1)
                : .white
            let pupilColor: UIColor = expression == .angry
                ? UIColor(red: 0.55, green: 0.15, blue: 0.1, alpha: 1)
                : UIColor(red: 0.15, green: 0.15, blue: 0.2, alpha: 1)

            for xSign: Float in [-1, 1] {
                let eyeSize = expression == .angry ? eyeRadius * 1.15 : eyeRadius
                let eye = SCNSphere(radius: eyeSize)
                eye.segmentCount = 16
                let eyeMat = SCNMaterial()
                eyeMat.diffuse.contents = eyeColor
                eyeMat.lightingModel = .physicallyBased
                eye.materials = [eyeMat]
                let eyeNode = SCNNode(geometry: eye)
                eyeNode.position = SCNVector3(xSign * eyeSpacing, eyeY, eyeZ)
                accentNodes.append(eyeNode)
                head.addChildNode(eyeNode)

                let pupil = SCNSphere(radius: eyeSize * 0.5)
                pupil.segmentCount = 12
                let pupilMat = SCNMaterial()
                pupilMat.diffuse.contents = pupilColor
                pupilMat.lightingModel = .physicallyBased
                pupil.materials = [pupilMat]
                let pupilNode = SCNNode(geometry: pupil)
                pupilNode.position = SCNVector3(0, 0, Float(eyeSize * 0.55))
                eyeNode.addChildNode(pupilNode)

                if expression == .angry {
                    let browW: CGFloat = eyeSize * 2.2
                    let browH: CGFloat = eyeSize * 0.35
                    let brow = SCNBox(width: browW, height: browH, length: 0.01, chamferRadius: browH * 0.3)
                    let browMat = SCNMaterial()
                    browMat.diffuse.contents = skinColor.darker(by: 0.3)
                    browMat.lightingModel = .physicallyBased
                    brow.materials = [browMat]
                    let browNode = SCNNode(geometry: brow)
                    browNode.position = SCNVector3(0, Float(eyeSize * 1.1), Float(eyeSize * 0.2))
                    browNode.eulerAngles.z = xSign > 0 ? -0.25 : 0.25
                    accentNodes.append(browNode)
                    eyeNode.addChildNode(browNode)
                }
            }

            let mouthY: Float = -Float(p.headH * 0.13)
            let mouthZ: Float = Float(p.headD / 2 + 0.003)

            switch expression {
            case .angry:
                let mouthW: CGFloat = p.headW * 0.28
                let mouthH: CGFloat = p.headH * 0.06
                let mouth = SCNBox(width: mouthW, height: mouthH, length: 0.005, chamferRadius: mouthH * 0.2)
                let mouthMat = SCNMaterial()
                mouthMat.diffuse.contents = UIColor(red: 0.2, green: 0.08, blue: 0.08, alpha: 1)
                mouthMat.lightingModel = .physicallyBased
                mouth.materials = [mouthMat]
                let mouthNode = SCNNode(geometry: mouth)
                mouthNode.position = SCNVector3(0, mouthY, mouthZ)
                accentNodes.append(mouthNode)
                head.addChildNode(mouthNode)

                let toothSize: CGFloat = p.headW * 0.04
                for xSign: CGFloat in [-1, 1] {
                    let tooth = SCNBox(width: toothSize, height: toothSize * 1.2, length: 0.006, chamferRadius: toothSize * 0.15)
                    let toothMat = SCNMaterial()
                    toothMat.diffuse.contents = UIColor.white
                    toothMat.lightingModel = .physicallyBased
                    tooth.materials = [toothMat]
                    let toothNode = SCNNode(geometry: tooth)
                    toothNode.position = SCNVector3(Float(xSign * mouthW * 0.25), Float(-mouthH * 0.3), 0.003)
                    mouthNode.addChildNode(toothNode)
                }

            case .happy:
                let smileW: CGFloat = p.headW * 0.28
                let smileH: CGFloat = p.headH * 0.05
                let smile = SCNBox(width: smileW, height: smileH, length: 0.005, chamferRadius: smileH * 0.5)
                let smileMat = SCNMaterial()
                smileMat.diffuse.contents = UIColor(red: 0.25, green: 0.2, blue: 0.22, alpha: 0.8)
                smileMat.lightingModel = .physicallyBased
                smile.materials = [smileMat]
                let smileNode = SCNNode(geometry: smile)
                smileNode.position = SCNVector3(0, mouthY, mouthZ)
                accentNodes.append(smileNode)
                head.addChildNode(smileNode)

                let cheekR: CGFloat = p.headW * 0.05
                for xSign: Float in [-1, 1] {
                    let cheek = SCNSphere(radius: cheekR)
                    cheek.segmentCount = 12
                    let cheekMat = SCNMaterial()
                    cheekMat.diffuse.contents = UIColor(red: 0.95, green: 0.55, blue: 0.55, alpha: 0.45)
                    cheekMat.lightingModel = .physicallyBased
                    cheek.materials = [cheekMat]
                    let cheekNode = SCNNode(geometry: cheek)
                    cheekNode.position = SCNVector3(xSign * Float(p.headW * 0.22), mouthY + Float(cheekR), Float(p.headD / 2))
                    accentNodes.append(cheekNode)
                    head.addChildNode(cheekNode)
                }

            case .neutral:
                let smileW: CGFloat = p.headW * 0.22
                let smileH: CGFloat = p.headH * 0.04
                let smile = SCNBox(width: smileW, height: smileH, length: 0.005, chamferRadius: smileH * 0.4)
                let smileMat = SCNMaterial()
                smileMat.diffuse.contents = UIColor(red: 0.25, green: 0.2, blue: 0.22, alpha: 0.8)
                smileMat.lightingModel = .physicallyBased
                smile.materials = [smileMat]
                let smileNode = SCNNode(geometry: smile)
                smileNode.position = SCNVector3(0, mouthY + Float(p.headH * 0.03), mouthZ)
                accentNodes.append(smileNode)
                head.addChildNode(smileNode)
            }
        }

        // MARK: - Bundled Model Loading

        private func loadBundledModel(type: AvatarBodyType, archetype: CharacterArchetype) -> SCNNode? {
            let filenames: [String]
            switch type {
            case .neutrally: filenames = ["basic.obj", "basic.scn"]
            case .woman: filenames = ["women.obj", "women.scn"]
            case .man: filenames = ["R15_men.obj", "R15_men.scn"]
            }

            for filename in filenames {
                let basename = URL(fileURLWithPath: filename).deletingPathExtension().lastPathComponent
                let ext = URL(fileURLWithPath: filename).pathExtension

                if let scene = SCNScene(named: "Models/\(filename)") ?? SCNScene(named: filename) {
                    return prepareLoadedModel(scene.rootNode.clone(), archetype: archetype)
                }
                if let url = Bundle.main.url(forResource: basename, withExtension: ext, subdirectory: "Models"),
                   let scene = try? SCNScene(url: url) {
                    return prepareLoadedModel(scene.rootNode.clone(), archetype: archetype)
                }
            }
            return nil
        }

        private func prepareLoadedModel(_ root: SCNNode, archetype: CharacterArchetype) -> SCNNode {
            let skinColor = archetype.skinColor
            let clothingColor = archetype.clothingColor ?? skinColor
            let muscle = archetype.muscleFactor
            let scale = archetype.scaleMultiplier

            let (modelMin, modelMax) = root.boundingBox
            let modelHeight = modelMax.y - modelMin.y
            let waistLine = modelMin.y + modelHeight * 0.45

            var allNodes: [SCNNode] = []
            root.enumerateChildNodes { node, _ in
                guard node.geometry != nil else { return }
                allNodes.append(node)
            }

            for node in allNodes {
                guard let geometry = node.geometry else { continue }
                let name = node.name?.lowercased() ?? ""

                let worldPos = node.convertPosition(SCNVector3Zero, to: root)
                let (nodeMin, nodeMax) = node.boundingBox
                let nodeCenter = worldPos.y + (nodeMin.y + nodeMax.y) * 0.5

                let isLeg = name.contains("leg") || name.contains("foot")
                    || name.contains("shoe") || name.contains("pant")
                    || nodeCenter < waistLine

                let partColor = isLeg ? clothingColor : skinColor

                let count = max(1, geometry.materials.count)
                geometry.materials = (0..<count).map { _ in
                    let mat = SCNMaterial()
                    mat.diffuse.contents = partColor
                    mat.lightingModel = .physicallyBased
                    mat.roughness.contents = 0.55
                    mat.metalness.contents = 0.05
                    mat.isDoubleSided = true
                    return mat
                }
                bodyNodes.append(node)
            }

            let (minV, maxV) = root.boundingBox
            let height = max(maxV.y - minV.y, 0.0001)
            let targetHeight: Float = 1.8 * Float(scale)
            let s = targetHeight / height

            let muscleXZ: Float = 1.0 + Float(muscle) * 0.25
            root.scale = SCNVector3(s * muscleXZ, s, s * muscleXZ)
            root.pivot = SCNMatrix4MakeTranslation(
                (minV.x + maxV.x) * 0.5, minV.y, (minV.z + maxV.z) * 0.5
            )
            root.position = SCNVector3(0, -targetHeight * 0.34, 0)
            return root
        }

        private func addAccessoriesToBundled(root: SCNNode, bodyType: AvatarBodyType, archetype: CharacterArchetype) {
            let p = proportions(for: bodyType)
            let headNode = findHead(in: root) ?? root

            for accessory in archetype.accessories {
                switch accessory {
                case .helmet(let color):
                    addHelmet(to: headNode, proportions: p, color: color)
                case .horns(let color):
                    addHorns(to: headNode, proportions: p, color: color)
                case .cape(let color):
                    addCape(to: root, proportions: p, color: color)
                case .crown(let color):
                    addCrown(to: headNode, proportions: p, color: color)
                case .wings(let color):
                    addWings(to: root, proportions: p, color: color)
                case .sword(let color):
                    let armNode = findRightArm(in: root) ?? root
                    addSword(to: armNode, proportions: p, color: color)
                case .aura(let color):
                    addAura(to: root, color: color, scaleMultiplier: archetype.scaleMultiplier)
                case .tornPants:
                    break
                }
            }
        }

        private func findHead(in root: SCNNode) -> SCNNode? {
            var found: SCNNode?
            root.enumerateChildNodes { node, stop in
                if let name = node.name?.lowercased(),
                   name.contains("head") && !name.contains("humanoid") {
                    found = node
                    stop.pointee = true
                }
            }
            return found
        }

        private func findRightArm(in root: SCNNode) -> SCNNode? {
            var found: SCNNode?
            root.enumerateChildNodes { node, stop in
                if let name = node.name?.lowercased(),
                   (name.contains("right") && name.contains("arm"))
                    || (name.contains("right") && name.contains("hand")) {
                    found = node
                    stop.pointee = true
                }
            }
            return found
        }

        // MARK: - Accessories

        private func addTornPantsEffect(to leg: SCNNode, legSize: (CGFloat, CGFloat, CGFloat), skinColor: UIColor) {
            let tearH: CGFloat = legSize.1 * 0.25
            let tearW: CGFloat = legSize.0 * 1.15
            for i in 0..<3 {
                let y = Float(-legSize.1 / 2 + tearH * CGFloat(i) * 0.8)
                let tear = SCNBox(width: tearW * CGFloat.random(in: 0.5...1.0),
                                  height: tearH * CGFloat.random(in: 0.3...0.6),
                                  length: legSize.2 * 1.1,
                                  chamferRadius: 0.005)
                applyMaterial(tear, color: skinColor)
                let tearNode = SCNNode(geometry: tear)
                tearNode.position = SCNVector3(Float.random(in: -0.01...0.01), y, 0)
                tearNode.eulerAngles.z = Float.random(in: -0.15...0.15)
                bodyNodes.append(tearNode)
                leg.addChildNode(tearNode)
            }
        }

        private func addHelmet(to head: SCNNode, proportions p: CharacterProportions, color: UIColor) {
            let helmet = SCNBox(
                width: p.headW * 1.15, height: p.headH * 0.65,
                length: p.headD * 1.15, chamferRadius: 0.04
            )
            applyMaterial(helmet, color: color, metalness: 0.4, roughness: 0.3)
            let helmetNode = SCNNode(geometry: helmet)
            helmetNode.position = SCNVector3(0, Float(p.headH * 0.2), 0)
            accentNodes.append(helmetNode)
            head.addChildNode(helmetNode)

            let visor = SCNBox(
                width: p.headW * 0.7, height: p.headH * 0.15,
                length: 0.01, chamferRadius: 0.01
            )
            applyMaterial(visor, color: UIColor(red: 0.15, green: 0.15, blue: 0.2, alpha: 0.8))
            let visorNode = SCNNode(geometry: visor)
            visorNode.position = SCNVector3(0, Float(-p.headH * 0.05), Float(p.headD * 0.58))
            helmetNode.addChildNode(visorNode)
        }

        private func addHorns(to head: SCNNode, proportions p: CharacterProportions, color: UIColor) {
            for xSign: Float in [-1, 1] {
                let horn = SCNCone(topRadius: 0.0, bottomRadius: p.headW * 0.08, height: p.headH * 0.5)
                horn.radialSegmentCount = 12
                applyMaterial(horn, color: color, metalness: 0.1, roughness: 0.7)
                let hornNode = SCNNode(geometry: horn)
                hornNode.position = SCNVector3(
                    xSign * Float(p.headW * 0.35),
                    Float(p.headH * 0.35),
                    Float(-p.headD * 0.05)
                )
                hornNode.eulerAngles.z = -xSign * 0.35
                hornNode.eulerAngles.x = -0.15
                accentNodes.append(hornNode)
                head.addChildNode(hornNode)
            }
        }

        private func addCape(to torso: SCNNode, proportions p: CharacterProportions, color: UIColor) {
            let capeW: CGFloat = p.torsoW * 1.2
            let capeH: CGFloat = p.torsoH * 1.8
            let cape = SCNPlane(width: capeW, height: capeH)
            let mat = SCNMaterial()
            mat.diffuse.contents = color
            mat.lightingModel = .physicallyBased
            mat.roughness.contents = 0.7
            mat.isDoubleSided = true
            cape.materials = [mat]
            let capeNode = SCNNode(geometry: cape)
            capeNode.position = SCNVector3(0, -Float(p.torsoH * 0.3), -Float(p.torsoD / 2 + 0.02))
            capeNode.eulerAngles.x = 0.12
            accentNodes.append(capeNode)
            torso.addChildNode(capeNode)
        }

        private func addCrown(to head: SCNNode, proportions p: CharacterProportions, color: UIColor) {
            let bandR: CGFloat = p.headW * 0.45
            let bandH: CGFloat = p.headH * 0.12
            let band = SCNCylinder(radius: bandR, height: bandH)
            band.radialSegmentCount = 24
            applyMaterial(band, color: color, metalness: 0.6, roughness: 0.2)
            let bandNode = SCNNode(geometry: band)
            bandNode.position = SCNVector3(0, Float(p.headH * 0.42), 0)
            accentNodes.append(bandNode)
            head.addChildNode(bandNode)

            for i in 0..<5 {
                let angle = Float(i) * (.pi * 2.0 / 5.0)
                let spike = SCNCone(topRadius: 0, bottomRadius: bandH * 0.4, height: bandH * 1.5)
                spike.radialSegmentCount = 8
                applyMaterial(spike, color: color, metalness: 0.6, roughness: 0.2)
                let spikeNode = SCNNode(geometry: spike)
                spikeNode.position = SCNVector3(
                    sin(angle) * Float(bandR * 0.8),
                    Float(bandH * 0.8),
                    cos(angle) * Float(bandR * 0.8)
                )
                bandNode.addChildNode(spikeNode)
            }
        }

        private func addWings(to torso: SCNNode, proportions p: CharacterProportions, color: UIColor) {
            for xSign: Float in [-1, 1] {
                let wingW: CGFloat = p.torsoW * 1.2
                let wingH: CGFloat = p.torsoH * 1.1
                let wing = SCNPlane(width: wingW, height: wingH)
                let mat = SCNMaterial()
                mat.diffuse.contents = color
                mat.lightingModel = .physicallyBased
                mat.roughness.contents = 0.5
                mat.isDoubleSided = true
                wing.materials = [mat]
                let wingNode = SCNNode(geometry: wing)
                wingNode.position = SCNVector3(
                    xSign * Float(p.torsoW / 2 + wingW / 2 - 0.03),
                    Float(p.torsoH * 0.15),
                    -Float(p.torsoD / 2)
                )
                wingNode.eulerAngles.y = xSign * 0.35
                wingNode.eulerAngles.x = 0.1
                accentNodes.append(wingNode)
                torso.addChildNode(wingNode)
            }
        }

        private func addSword(to arm: SCNNode, proportions p: CharacterProportions, color: UIColor) {
            let bladeH: CGFloat = p.armH * 1.2
            let bladeW: CGFloat = p.armW * 0.5
            let blade = SCNBox(width: bladeW, height: bladeH, length: 0.015, chamferRadius: 0.003)
            applyMaterial(blade, color: color, metalness: 0.7, roughness: 0.15)
            let bladeNode = SCNNode(geometry: blade)
            bladeNode.position = SCNVector3(0, -Float(p.armH / 2 + bladeH / 2 - 0.02), Float(p.armD * 0.3))
            accentNodes.append(bladeNode)
            arm.addChildNode(bladeNode)

            let guardW: CGFloat = p.armW * 1.2
            let guardH: CGFloat = 0.025
            let guard_ = SCNBox(width: guardW, height: guardH, length: 0.03, chamferRadius: 0.005)
            applyMaterial(guard_, color: color.darker(by: 0.2), metalness: 0.5, roughness: 0.3)
            let guardNode = SCNNode(geometry: guard_)
            guardNode.position = SCNVector3(0, Float(bladeH / 2), 0)
            bladeNode.addChildNode(guardNode)

            let hiltH: CGFloat = p.armH * 0.22
            let hilt = SCNCylinder(radius: p.armW * 0.12, height: hiltH)
            hilt.radialSegmentCount = 12
            applyMaterial(hilt, color: UIColor(red: 0.4, green: 0.25, blue: 0.15, alpha: 1))
            let hiltNode = SCNNode(geometry: hilt)
            hiltNode.position = SCNVector3(0, Float(bladeH / 2 + hiltH / 2), 0)
            bladeNode.addChildNode(hiltNode)
        }

        private func addAura(to root: SCNNode, color: UIColor, scaleMultiplier: CGFloat) {
            let auraR: CGFloat = 0.85 * scaleMultiplier
            let aura = SCNSphere(radius: auraR)
            aura.segmentCount = 24
            let mat = SCNMaterial()
            mat.diffuse.contents = color
            mat.lightingModel = .constant
            mat.isDoubleSided = true
            mat.transparency = 0.25
            aura.materials = [mat]
            let auraNode = SCNNode(geometry: aura)
            auraNode.position = SCNVector3(0, 0.1, 0)
            auraNode.name = "aura"

            let pulse = SCNAction.repeatForever(
                SCNAction.sequence([
                    SCNAction.scale(to: 1.08, duration: 1.2),
                    SCNAction.scale(to: 0.95, duration: 1.2),
                ])
            )
            auraNode.runAction(pulse, forKey: "aura_pulse")
            root.addChildNode(auraNode)
        }

        // MARK: - Pedestal & Material

        private func buildPedestal(color: UIColor) -> SCNNode {
            let disc = SCNCylinder(radius: 0.55, height: 0.04)
            disc.radialSegmentCount = 48
            let mat = SCNMaterial()
            mat.diffuse.contents = color.withAlphaComponent(0.18)
            mat.lightingModel = .physicallyBased
            mat.roughness.contents = 0.9
            mat.metalness.contents = 0.0
            disc.materials = [mat]
            let node = SCNNode(geometry: disc)
            node.name = "pedestal"
            node.position = SCNVector3(0, -1.0, 0)
            return node
        }

        private func applyMaterial(_ geometry: SCNGeometry, color: UIColor, metalness: CGFloat = 0.05, roughness: CGFloat = 0.55) {
            let count: Int
            if geometry is SCNBox { count = 6 }
            else if geometry is SCNCylinder { count = 3 }
            else if geometry is SCNCone { count = 3 }
            else { count = max(1, geometry.materials.count) }

            geometry.materials = (0..<count).map { _ in
                let mat = SCNMaterial()
                mat.diffuse.contents = color
                mat.lightingModel = .physicallyBased
                mat.roughness.contents = roughness
                mat.metalness.contents = metalness
                mat.isDoubleSided = true
                return mat
            }
        }

        // MARK: - Proportions

        struct CharacterProportions {
            let headW: CGFloat, headH: CGFloat, headD: CGFloat
            let torsoW: CGFloat, torsoH: CGFloat, torsoD: CGFloat
            let armW: CGFloat, armH: CGFloat, armD: CGFloat
            let legW: CGFloat, legH: CGFloat, legD: CGFloat
        }

        func proportions(for type: AvatarBodyType) -> CharacterProportions {
            switch type {
            case .neutrally:
                return CharacterProportions(
                    headW: 0.38, headH: 0.40, headD: 0.38,
                    torsoW: 0.50, torsoH: 0.58, torsoD: 0.25,
                    armW: 0.18, armH: 0.58, armD: 0.18,
                    legW: 0.20, legH: 0.66, legD: 0.20
                )
            case .woman:
                return CharacterProportions(
                    headW: 0.35, headH: 0.37, headD: 0.35,
                    torsoW: 0.38, torsoH: 0.63, torsoD: 0.20,
                    armW: 0.12, armH: 0.61, armD: 0.12,
                    legW: 0.14, legH: 0.74, legD: 0.14
                )
            case .man:
                return CharacterProportions(
                    headW: 0.39, headH: 0.40, headD: 0.39,
                    torsoW: 0.48, torsoH: 0.64, torsoD: 0.25,
                    armW: 0.16, armH: 0.62, armD: 0.16,
                    legW: 0.18, legH: 0.72, legD: 0.18
                )
            }
        }
    }
}

// MARK: - UIColor helpers

private extension UIColor {
    func darker(by factor: CGFloat) -> UIColor {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        getRed(&r, green: &g, blue: &b, alpha: &a)
        return UIColor(red: max(r - factor, 0), green: max(g - factor, 0), blue: max(b - factor, 0), alpha: a)
    }
}
