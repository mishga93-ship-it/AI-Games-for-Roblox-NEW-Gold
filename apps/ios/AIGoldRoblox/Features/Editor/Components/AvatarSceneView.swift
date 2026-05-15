import SwiftUI
import SceneKit
import Foundation

/// Full 3D avatar view with SceneKit. Loads R15 OBJ avatars when available,
/// and falls back to a simple proxy rig if the mesh resources are missing.
struct AvatarSceneView: UIViewRepresentable {
    @ObservedObject var state: EditorState
    var exportRequestID: UUID? = nil
    var onSnapshotReady: ((UIImage) -> Void)? = nil

    func makeUIView(context: Context) -> SCNView {
        let scnView = SCNView()
        scnView.scene = SCNScene()
        scnView.allowsCameraControl = true
        scnView.backgroundColor = .clear
        scnView.autoenablesDefaultLighting = true
        context.coordinator.setup(scene: scnView.scene!)
        return scnView
    }

    func updateUIView(_ uiView: SCNView, context: Context) {
        let c = context.coordinator
        guard let scene = uiView.scene else { return }

        if c.loadedBodyType != state.currentBodyType || c.loadedRigType != state.currentRigType {
            c.log("Body/rig changed: \(c.loadedBodyType.displayName)/\(c.loadedRigType.displayName) -> \(state.currentBodyType.displayName)/\(state.currentRigType.displayName)")
            c.buildAvatar(type: state.currentBodyType, rig: state.currentRigType, in: scene)
        }

        c.avatarRoot?.eulerAngles.y = Float(state.modelRotation * .pi / 180)

        let currentColor = UIColor(state.paintColor)
        if c.lastAppliedColor != currentColor {
            c.applyColor(currentColor)
            c.lastAppliedColor = currentColor
        }

        let currentStickerIDs = state.stickers.map(\.id)
        if c.lastAppliedStickerIDs != currentStickerIDs || c.lastAppliedStickerAlpha != state.stickerAlpha {
            c.applyStickers(state.stickers, alpha: state.stickerAlpha)
            c.lastAppliedStickerIDs = currentStickerIDs
            c.lastAppliedStickerAlpha = state.stickerAlpha
        }

        if let exportRequestID,
           c.lastHandledExportRequestID != exportRequestID {
            c.lastHandledExportRequestID = exportRequestID
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.12) {
                let image = uiView.snapshot()
                onSnapshotReady?(image)
            }
        }

        let paintURL = state.paintTextureURL
        let clothURL = state.clothTextureURL
        let clothTarget = state.clothTarget
        let clothAlpha = state.clothTranslucence
        let loopURL = state.activeEditingLoop.map { ($0.imageURL, $0.slot, $0.offset) }
            ?? state.loopTextureURL.map { ($0, state.loopSlot, state.loopOffset) }
        let loopAlpha = state.loopAlpha
        let accessories = state.accessories

        let needsPaintUpdate = paintURL != c.lastAppliedPaintURL
        let needsClothUpdate = clothURL != c.lastAppliedClothURL || clothTarget != c.lastAppliedClothTarget || clothAlpha != c.lastAppliedClothAlpha
        let needsLoopUpdate = loopURL?.0 != c.lastAppliedLoopURL
        let needsAccessoryUpdate = accessories != c.lastAppliedAccessories

        guard needsPaintUpdate || needsClothUpdate || needsLoopUpdate || needsAccessoryUpdate else { return }

        if !c.isLoadingAssets {
            c.isLoadingAssets = true
            Task {
                if needsPaintUpdate {
                    if let url = paintURL, let image = await ImageCacheManager.shared.image(for: url) {
                        await MainActor.run { c.applyPaintTexture(image) }
                    }
                    await MainActor.run { c.lastAppliedPaintURL = paintURL }
                }

                if needsClothUpdate {
                    if let url = clothURL, let image = await ImageCacheManager.shared.image(for: url) {
                        await MainActor.run {
                            c.log("updateUIView Task: applying cloth url=\(url.suffix(60)) target=\(clothTarget.rawValue) imageSize=\(image.size)")
                            c.applyClothing(image: image, target: clothTarget, alpha: clothAlpha)
                        }
                    } else {
                        await MainActor.run {
                            c.log("updateUIView Task: cloth cleared or image failed url=\(clothURL ?? "nil")")
                        }
                    }
                    await MainActor.run {
                        c.lastAppliedClothURL = clothURL
                        c.lastAppliedClothTarget = clothTarget
                        c.lastAppliedClothAlpha = clothAlpha
                    }
                }

                if needsLoopUpdate {
                    if let loopSource = loopURL,
                       let image = await ImageCacheManager.shared.image(for: loopSource.0) {
                        await MainActor.run {
                            c.attachAccessory(image: image, slot: loopSource.1, offset: loopSource.2, alpha: loopAlpha)
                        }
                    } else {
                        await MainActor.run {
                            c.removeAccessory(slot: .face)
                            c.removeAccessory(slot: .hat)
                        }
                    }
                    await MainActor.run { c.lastAppliedLoopURL = loopURL?.0 }
                }

                if needsAccessoryUpdate {
                    for (slot, url) in accessories {
                        if let image = await ImageCacheManager.shared.image(for: url) {
                            await MainActor.run { c.attachAccessory(image: image, slot: slot) }
                        }
                    }
                    await MainActor.run { c.lastAppliedAccessories = accessories }
                }

                await MainActor.run { c.isLoadingAssets = false }
            }
        }
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    // MARK: - Coordinator

    class Coordinator {
        var avatarRoot: SCNNode?
        var avatarVisualRoot: SCNNode?
        var bodyNodes: [String: SCNNode] = [:]
        var loadedBodyType: AvatarBodyType = .neutrally
        var loadedRigType: AvatarRigType = .r15
        var lastHandledExportRequestID: UUID?
        private let stickersRoot = SCNNode()
        private var accentNodes: [SCNNode] = []
        private var currentProportions = Proportions.forType(.neutrally, rig: .r15)
        private var loggedModelDiagnostics: Set<String> = []
        private var usesBundledSceneAvatar = false

        var lastAppliedColor: UIColor?
        var lastAppliedStickerIDs: [UUID] = []
        var lastAppliedStickerAlpha: Double = 1.0
        var lastAppliedPaintURL: String?
        var lastAppliedClothURL: String?
        var lastAppliedClothTarget: ClothTarget = .shirt
        var lastAppliedClothAlpha: Double = 1.0
        var lastAppliedLoopURL: String?
        var lastAppliedAccessories: [AccessorySlot: String] = [:]
        var isLoadingAssets = false

        func log(_ message: String) {
            let line = "[AvatarSceneView] \(message)"
            print(line)
            NSLog("%@", line)
        }

        func setup(scene: SCNScene) {
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

            let cam = SCNNode()
            cam.camera = SCNCamera()
            cam.camera?.fieldOfView = 52
            cam.position = SCNVector3(0, 0.32, 2.9)
            scene.rootNode.addChildNode(cam)

            log("Initial scene setup")
            buildAvatar(type: .neutrally, rig: .r15, in: scene)
        }

        // MARK: Build Avatar

        func buildAvatar(type: AvatarBodyType, rig: AvatarRigType, in scene: SCNScene) {
            log("buildAvatar requested rig=\(rig.displayName) body=\(type.displayName)")
            avatarRoot?.removeFromParentNode()
            avatarRoot = nil
            bodyNodes.removeAll()
            bodyGroupNodes.removeAll()
            cachedElementParts.removeAll()
            cachedElementUVBounds.removeAll()
            accentNodes.removeAll()
            avatarVisualRoot = nil
            usesBundledSceneAvatar = false

            lastAppliedColor = nil
            lastAppliedPaintURL = nil
            lastAppliedClothURL = nil
            lastAppliedClothTarget = .shirt
            lastAppliedClothAlpha = 1.0
            lastAppliedLoopURL = nil
            lastAppliedAccessories = [:]
            lastAppliedStickerIDs = []
            isLoadingAssets = false

            let p = Proportions.forType(type, rig: rig)
            currentProportions = p
            let root = SCNNode()
            root.name = "avatarRoot"
            let color = UIColor(red: 0.95, green: 0.97, blue: 0.94, alpha: 1)

            if rig == .r15, let customBody = loadBundledAvatarScene(type: type, tintColor: color) {
                root.addChildNode(customBody)
                avatarVisualRoot = customBody
                usesBundledSceneAvatar = true
                log("Using bundled scene avatar for \(type.displayName)")
            } else {
                let proceduralBody = buildProceduralBody(type: type, rig: rig, proportions: p, color: color)
                root.addChildNode(proceduralBody)
                avatarVisualRoot = proceduralBody
                log("Using procedural avatar fallback for \(type.displayName)")
            }

            stickersRoot.removeFromParentNode()
            stickersRoot.childNodes.forEach { $0.removeFromParentNode() }
            root.addChildNode(stickersRoot)

            scene.rootNode.addChildNode(root)
            avatarRoot = root
            loadedBodyType = type
            loadedRigType = rig
            log("buildAvatar applied rig=\(loadedRigType.displayName) body=\(loadedBodyType.displayName)")
        }

        private func modelFilenames(for type: AvatarBodyType) -> [String] {
            switch type {
            case .neutrally:
                return ["basic.obj", "basic.scn"]
            case .woman:
                return ["women.obj", "women.scn"]
            case .man:
                return ["R15_men.obj", "R15_men.scn"]
            }
        }

        private func loadBundledAvatarScene(type: AvatarBodyType, tintColor: UIColor) -> SCNNode? {
            var loadedScene: SCNScene?
            var chosenFilename: String?

            for filename in modelFilenames(for: type) {
                let basename = URL(fileURLWithPath: filename).deletingPathExtension().lastPathComponent
                let ext = URL(fileURLWithPath: filename).pathExtension
                let candidates = [
                    "Models/\(filename)",
                    filename
                ]

                for candidate in candidates {
                    log("Trying bundled avatar scene: \(candidate)")
                    if let scene = SCNScene(named: candidate) {
                        loadedScene = scene
                        chosenFilename = filename
                        log("Loaded bundled avatar scene: \(candidate)")
                        break
                    }
                }

                if loadedScene == nil,
                   let url = Bundle.main.url(forResource: basename, withExtension: ext, subdirectory: "Models") {
                    log("Trying avatar scene URL fallback: \(url.lastPathComponent)")
                    loadedScene = try? SCNScene(url: url, options: nil)
                    if loadedScene != nil {
                        chosenFilename = filename
                    }
                }

                if loadedScene != nil {
                    break
                }
            }

            guard let scene = loadedScene else {
                log("Failed to load bundled avatar scene for type=\(type.displayName)")
                return nil
            }

            let chosenBasename = URL(fileURLWithPath: chosenFilename ?? "").deletingPathExtension().lastPathComponent
            let wrapper = scene.rootNode.clone()
            wrapper.name = "customAvatar_\(chosenBasename)"

            tintCustomAvatar(wrapper, color: tintColor)
            mapBodyNodes(from: wrapper)
            if !hasUsableBodyMapping {
                log("Custom avatar scene loaded but body node mapping is incomplete for \(chosenFilename ?? "unknown"). Spatial mapping found \(bodyGroupNodes.count) groups.")
            }

            let (minVec, maxVec) = wrapper.boundingBox
            let height = max(maxVec.y - minVec.y, 0.0001)
            let targetHeight: Float = 1.8
            let scale = targetHeight / height
            wrapper.scale = SCNVector3(scale, scale, scale)
            wrapper.pivot = SCNMatrix4MakeTranslation(
                (minVec.x + maxVec.x) * 0.5,
                minVec.y,
                (minVec.z + maxVec.z) * 0.5
            )
            wrapper.position = SCNVector3(0, -targetHeight * 0.34, 0)

            log("Custom avatar mapped nodes: \(bodyNodes.keys.sorted().joined(separator: ", "))")
            return wrapper
        }

        private func tintCustomAvatar(_ root: SCNNode, color: UIColor) {
            root.enumerateChildNodes { node, _ in
                guard let geometry = node.geometry else { return }
                let materialCount = max(1, geometry.materials.count)
                geometry.materials = (0..<materialCount).map { _ in
                    let material = SCNMaterial()
                    material.diffuse.contents = color
                    material.lightingModel = .physicallyBased
                    material.roughness.contents = 0.72
                    material.metalness.contents = 0.0
                    material.isDoubleSided = true
                    return material
                }
            }
        }

        private func mapBodyNodes(from root: SCNNode) {
            bodyNodes.removeAll()
            bodyGroupNodes.removeAll()

            var geometryNodes: [(node: SCNNode, center: SCNVector3)] = []
            root.enumerateChildNodes { node, _ in
                guard node.geometry != nil else { return }
                let (minB, maxB) = node.boundingBox
                let worldPos = node.convertPosition(
                    SCNVector3(
                        (minB.x + maxB.x) * 0.5,
                        (minB.y + maxB.y) * 0.5,
                        (minB.z + maxB.z) * 0.5
                    ),
                    to: root
                )
                geometryNodes.append((node, worldPos))
            }

            guard !geometryNodes.isEmpty else {
                log("mapBodyNodes: no geometry nodes found")
                return
            }

            let (rootMin, rootMax) = root.boundingBox
            let totalHeight = rootMax.y - rootMin.y
            let halfWidth = (rootMax.x - rootMin.x) * 0.5
            let midX = (rootMin.x + rootMax.x) * 0.5

            guard totalHeight > 0, halfWidth > 0 else {
                log("mapBodyNodes: degenerate bounding box h=\(totalHeight) hw=\(halfWidth)")
                return
            }

            let armThreshold = halfWidth * 0.30

            for entry in geometryNodes {
                let relY = (entry.center.y - rootMin.y) / totalHeight
                let distFromCenter = abs(entry.center.x - midX)
                let isLeft = entry.center.x < midX
                let nodeName = entry.node.name ?? "?"

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

                appendToBodyGroup(group, node: entry.node)
                log("mapBodyNodes: '\(nodeName)' relY=\(String(format: "%.3f", relY)) distX=\(String(format: "%.2f", distFromCenter)) armThr=\(String(format: "%.2f", armThreshold)) → \(group)")
            }

            log("mapBodyNodes RESULT: \(bodyGroupNodes.keys.sorted().map { "\($0)=\(bodyGroupNodes[$0]?.count ?? 0)" }.joined(separator: ", ")) total=\(geometryNodes.count) nodes")
        }

        private var bodyGroupNodes: [String: [SCNNode]] = [:]

        private func appendToBodyGroup(_ key: String, node: SCNNode) {
            bodyGroupNodes[key, default: []].append(node)
            if bodyNodes[key] == nil {
                bodyNodes[key] = node
            }
        }

        private var hasUsableBodyMapping: Bool {
            !bodyGroupNodes.isEmpty
        }

        private var hasSegmentedBodyMapping: Bool {
            bodyGroupNodes.keys.contains("torso") &&
            bodyGroupNodes.keys.contains("leftArm") &&
            bodyGroupNodes.keys.contains("rightArm") &&
            bodyGroupNodes.keys.contains("leftLeg") &&
            bodyGroupNodes.keys.contains("rightLeg")
        }

        private func buildProceduralBody(type: AvatarBodyType, rig: AvatarRigType, proportions p: Proportions, color: UIColor) -> SCNNode {
            let rootNode = SCNNode()
            rootNode.name = "Avatar_Root"

            let torsoY = Float(p.torsoCenterYOffset)
            let headY = Float(p.torso.h / 2 + p.head.h / 2 + p.headLift) + torsoY
            let armX = Float(p.torso.w / 2 + p.arm.w / 2 + p.armGap)
            let armY = Float(p.torso.h / 2 - p.arm.h / 2 + p.armDrop) + torsoY
            let legX = Float((p.torso.w / 4) * p.legSpread)
            let legY = -Float(p.torso.h / 2 + p.leg.h / 2 - p.legLift) + torsoY

            // 1. STRICT HELPER FOR LIMBS (ARMS & LEGS)
            func createLimbGeometry(width: CGFloat, height: CGFloat, depth: CGFloat, type: AvatarBodyType) -> SCNGeometry {
                if type == .neutrally {
                    // Only classic gets blocky limbs
                    return SCNBox(width: width, height: height, length: depth, chamferRadius: 0)
                } else {
                    // MAN AND WOMAN MUST BE CYLINDERS
                    // We use the larger of width/depth to determine the cylinder radius
                    let radius = max(width, depth) / 2.0
                    let cylinder = SCNCylinder(radius: radius, height: height)
                    cylinder.radialSegmentCount = 24
                    return cylinder
                }
            }

            // 2. STRICT HELPER FOR TORSO & HEAD
            func createRoundedBox(width: CGFloat, height: CGFloat, depth: CGFloat, type: AvatarBodyType, isHead: Bool) -> SCNGeometry {
                if type == .neutrally {
                    // Classic gets rigid boxes
                    return SCNBox(width: width, height: height, length: depth, chamferRadius: 0)
                } else {
                    // Man and Woman get beautifully rounded edges
                    let chamfer: CGFloat = isHead ? 0.05 : 0.08
                    return SCNBox(width: width, height: height, length: depth, chamferRadius: chamfer)
                }
            }

            // 3. APPLY THESE HELPERS TO YOUR NODES
            let torsoGeom = createRoundedBox(width: p.torso.w, height: p.torso.h, depth: p.torso.d, type: type, isHead: false)
            let headGeom = createRoundedBox(width: p.head.w, height: p.head.h, depth: p.head.d, type: type, isHead: true)
            let leftArmGeom = createLimbGeometry(width: p.arm.w, height: p.arm.h, depth: p.arm.d, type: type)
            let rightArmGeom = createLimbGeometry(width: p.arm.w, height: p.arm.h, depth: p.arm.d, type: type)
            let leftLegGeom = createLimbGeometry(width: p.leg.w, height: p.leg.h, depth: p.leg.d, type: type)
            let rightLegGeom = createLimbGeometry(width: p.leg.w, height: p.leg.h, depth: p.leg.d, type: type)

            @discardableResult
            func addBodyNode(geometry: SCNGeometry, nodeName: String, legacyKey: String, position: SCNVector3) -> SCNNode {
                configureGeometryMaterials(geometry, color: color)
                let node = SCNNode(geometry: geometry)
                node.name = nodeName
                node.position = position
                rootNode.addChildNode(node)
                bodyNodes[legacyKey] = node
                bodyNodes[nodeName] = node
                return node
            }

            let torso = addBodyNode(
                geometry: torsoGeom,
                nodeName: "torsoNode",
                legacyKey: "torso",
                position: .init(0, torsoY, 0)
            )
            let head = addBodyNode(
                geometry: headGeom,
                nodeName: "headNode",
                legacyKey: "head",
                position: .init(0, headY, 0)
            )
            let leftArm = addBodyNode(
                geometry: leftArmGeom,
                nodeName: "leftArmNode",
                legacyKey: "leftArm",
                position: .init(-armX, armY, 0)
            )
            let rightArm = addBodyNode(
                geometry: rightArmGeom,
                nodeName: "rightArmNode",
                legacyKey: "rightArm",
                position: .init(armX, armY, 0)
            )
            let leftLeg = addBodyNode(
                geometry: leftLegGeom,
                nodeName: "leftLegNode",
                legacyKey: "leftLeg",
                position: .init(-legX, legY, 0)
            )
            let rightLeg = addBodyNode(
                geometry: rightLegGeom,
                nodeName: "rightLegNode",
                legacyKey: "rightLeg",
                position: .init(legX, legY, 0)
            )

            let armTilt = Float(p.armTiltDegrees * .pi / 180)
            leftArm.eulerAngles.z = armTilt
            rightArm.eulerAngles.z = -armTilt

            let legTilt = Float(p.legTiltDegrees * .pi / 180)
            leftLeg.eulerAngles.z = -legTilt
            rightLeg.eulerAngles.z = legTilt

            switch (rig, type) {
            case (.r15, .woman):
                torso.scale = SCNVector3(0.96, 1.02, 0.96)
                head.scale = SCNVector3(0.97, 1.0, 0.97)
            case (.r15, .man):
                torso.scale = SCNVector3(1.05, 1.04, 1.02)
                head.scale = SCNVector3(1.0, 1.0, 1.0)
            case (.r15, .neutrally):
                torso.scale = SCNVector3(1.0, 1.0, 1.0)
                head.scale = SCNVector3(0.98, 1.0, 0.98)
            case (.r6, .woman):
                torso.scale = SCNVector3(0.95, 1.0, 0.95)
            case (.r6, .man):
                torso.scale = SCNVector3(1.04, 1.0, 1.0)
            default:
                break
            }

            let globalScale: Float = rig == .r15 ? 1.04 : 1.10
            rootNode.scale = SCNVector3(globalScale, globalScale, globalScale)
            rootNode.position = SCNVector3(0, rig == .r15 ? -0.06 : -0.03, 0)
            return rootNode
        }

        private func buildAnchorRig(proportions p: Proportions, color: UIColor, parent: SCNNode, visible: Bool) {
            let torsoY = Float(p.torsoCenterYOffset)
            let headY = Float(p.torso.h / 2 + p.head.h / 2 + p.headLift) + torsoY
            let armX = Float(p.torso.w / 2 + p.arm.w / 2 + p.armGap)
            let armY = Float(p.torso.h / 2 - p.arm.h / 2 + p.armDrop) + torsoY
            let legX = Float((p.torso.w / 4) * p.legSpread)
            let legY = -Float(p.torso.h / 2 + p.leg.h / 2 - p.legLift) + torsoY

            let head = makeBox(p.head, name: "head", pos: .init(0, headY, 0), ch: p.chamfer, color: color, parent: parent, visible: visible)
            let torso = makeBox(p.torso, name: "torso", pos: .init(0, torsoY, 0), ch: p.chamfer, color: color, parent: parent, visible: visible)
            let leftArm = makeBox(p.arm, name: "leftArm", pos: .init(-armX, armY, 0), ch: p.chamfer, color: color, parent: parent, visible: visible)
            let rightArm = makeBox(p.arm, name: "rightArm", pos: .init(armX, armY, 0), ch: p.chamfer, color: color, parent: parent, visible: visible)
            let leftLeg = makeBox(p.leg, name: "leftLeg", pos: .init(-legX, legY, 0), ch: p.chamfer, color: color, parent: parent, visible: visible)
            let rightLeg = makeBox(p.leg, name: "rightLeg", pos: .init(legX, legY, 0), ch: p.chamfer, color: color, parent: parent, visible: visible)

            let armTilt = Float(p.armTiltDegrees * .pi / 180)
            leftArm.eulerAngles.z = armTilt
            rightArm.eulerAngles.z = -armTilt

            let legTilt = Float(p.legTiltDegrees * .pi / 180)
            leftLeg.eulerAngles.z = -legTilt
            rightLeg.eulerAngles.z = legTilt

            if visible {
                addSilhouetteDetails(
                    proportions: p,
                    color: color,
                    root: parent,
                    head: head,
                    torso: torso,
                    leftArm: leftArm,
                    rightArm: rightArm,
                    leftLeg: leftLeg,
                    rightLeg: rightLeg
                )
            }
        }

        @discardableResult
        private func makeBox(_ s: BoxSize, name: String, pos: SCNVector3, ch: CGFloat, color: UIColor, parent: SCNNode, visible: Bool) -> SCNNode {
            let box = SCNBox(width: s.w, height: s.h, length: s.d, chamferRadius: ch)
            box.materials = defaultMaterials(color: visible ? color : .clear)
            let node = SCNNode(geometry: box)
            node.name = name
            node.position = pos
            if !visible {
                node.opacity = 0.001
            }
            bodyNodes[name] = node
            parent.addChildNode(node)
            return node
        }

        private func defaultMaterials(color: UIColor) -> [SCNMaterial] {
            (0..<6).map { _ in
                let material = SCNMaterial()
                material.diffuse.contents = color
                material.lightingModel = .physicallyBased
                material.roughness.contents = 0.72
                material.metalness.contents = 0.0
                return material
            }
        }

        private func configureGeometryMaterials(_ geometry: SCNGeometry, color: UIColor) {
            let count: Int
            switch geometry {
            case is SCNBox:
                count = 6
            case is SCNCylinder:
                count = 3
            default:
                count = max(1, geometry.materials.count)
            }

            geometry.materials = (0..<count).map { _ in
                let material = SCNMaterial()
                material.diffuse.contents = color
                material.lightingModel = .physicallyBased
                material.roughness.contents = 0.72
                material.metalness.contents = 0.0
                material.isDoubleSided = true
                return material
            }
        }

        private func addSilhouetteDetails(
            proportions p: Proportions,
            color: UIColor,
            root: SCNNode,
            head: SCNNode,
            torso: SCNNode,
            leftArm: SCNNode,
            rightArm: SCNNode,
            leftLeg: SCNNode,
            rightLeg: SCNNode
        ) {
            let shoulderWidth = max(0.075, p.arm.w * (p.rig == .r15 ? 0.88 : 0.96))
            let shoulderHeight = max(0.075, p.arm.w * (p.rig == .r15 ? 0.54 : 0.62))
            let handWidth = max(0.065, p.arm.w * (p.rig == .r15 ? 0.76 : 0.9))
            let handHeight = max(0.075, p.arm.w * (p.rig == .r15 ? 0.62 : 0.82))
            let footHeight = max(0.05, p.leg.h * (p.rig == .r15 ? 0.14 : 0.17))
            let neckWidth = max(0.075, p.head.w * (p.rig == .r15 ? 0.16 : 0.18))
            let neckHeight = max(0.06, p.head.h * (p.rig == .r15 ? 0.11 : 0.13))
            let pelvisHeight = max(0.08, p.torso.h * (p.rig == .r15 ? 0.14 : 0.16))
            let pelvisWidth = max(0.22, p.torso.w * (p.rig == .r15 ? 0.66 : 0.78))
            let pelvisDepth = max(0.18, p.torso.d * (p.rig == .r15 ? 0.88 : 0.96))
            let jointRadius = max(0.045, min(p.arm.w, p.leg.w) * 0.24)

            let neck = SCNBox(
                width: neckWidth,
                height: neckHeight,
                length: neckWidth,
                chamferRadius: max(0.01, min(neckWidth, neckHeight) * 0.18)
            )
            neck.materials = defaultMaterials(color: color)
            let neckNode = SCNNode(geometry: neck)
            neckNode.position = SCNVector3(0, Float(p.torso.h / 2 + neckHeight * 0.35), 0)
            accentNodes.append(neckNode)
            root.addChildNode(neckNode)

            let pelvis = SCNBox(width: pelvisWidth, height: pelvisHeight, length: pelvisDepth, chamferRadius: pelvisHeight * 0.3)
            pelvis.materials = defaultMaterials(color: color)
            let pelvisNode = SCNNode(geometry: pelvis)
            pelvisNode.position = SCNVector3(0, -Float(p.torso.h / 2 + pelvisHeight * 0.2), 0)
            accentNodes.append(pelvisNode)
            torso.addChildNode(pelvisNode)

            let chest = SCNBox(
                width: max(0.24, p.torso.w * (p.rig == .r15 ? 0.58 : 0.72)),
                height: max(0.16, p.torso.h * (p.rig == .r15 ? 0.26 : 0.32)),
                length: max(0.02, p.torso.d * 0.07),
                chamferRadius: max(0.01, p.torso.w * 0.03)
            )
            chest.materials = defaultMaterials(color: color.withAlphaComponent(0.93))
            let chestNode = SCNNode(geometry: chest)
            chestNode.position = SCNVector3(0, Float(p.torso.h * (p.rig == .r15 ? 0.12 : 0.10)), Float(p.torso.d / 2 + 0.01))
            accentNodes.append(chestNode)
            torso.addChildNode(chestNode)

            for x in [-1.0 as CGFloat, 1.0] {
                let shoulder = SCNBox(
                    width: shoulderWidth,
                    height: shoulderHeight,
                    length: p.arm.d,
                    chamferRadius: max(0.01, shoulderHeight * 0.18)
                )
                shoulder.materials = defaultMaterials(color: color)
                let shoulderNode = SCNNode(geometry: shoulder)
                shoulderNode.position = SCNVector3(
                    Float(x * (p.torso.w / 2 - shoulderWidth * 0.12)),
                    Float(p.torso.h / 2 - shoulderHeight * 0.1),
                    0
                )
                accentNodes.append(shoulderNode)
                torso.addChildNode(shoulderNode)
            }

            addHand(width: handWidth, height: handHeight, depth: p.arm.d, color: color, to: leftArm)
            addHand(width: handWidth, height: handHeight, depth: p.arm.d, color: color, to: rightArm)
            addFoot(width: p.leg.w * 1.02, height: footHeight, depth: p.leg.d * 1.18, color: color, to: leftLeg)
            addFoot(width: p.leg.w * 1.02, height: footHeight, depth: p.leg.d * 1.18, color: color, to: rightLeg)

            if p.rig == .r15 {
                addJoint(radius: jointRadius, yOffset: Float(p.arm.h * 0.22), color: color, to: leftArm)
                addJoint(radius: jointRadius, yOffset: Float(p.arm.h * 0.22), color: color, to: rightArm)
                addJoint(radius: jointRadius, yOffset: Float(p.leg.h * 0.12), color: color, to: leftLeg)
                addJoint(radius: jointRadius, yOffset: Float(p.leg.h * 0.12), color: color, to: rightLeg)
            }
        }

        private func addHand(width: CGFloat, height: CGFloat, depth: CGFloat, color: UIColor, to arm: SCNNode) {
            let hand = SCNBox(
                width: width,
                height: height,
                length: depth,
                chamferRadius: max(0.01, min(width, height) * 0.18)
            )
            hand.materials = defaultMaterials(color: color)
            let handNode = SCNNode(geometry: hand)
            handNode.position = SCNVector3(0, -Float(height * 0.95), 0)
            accentNodes.append(handNode)
            arm.addChildNode(handNode)
        }

        private func addFoot(width: CGFloat, height: CGFloat, depth: CGFloat, color: UIColor, to leg: SCNNode) {
            let foot = SCNBox(width: width, height: height, length: depth, chamferRadius: min(width, height) * 0.25)
            foot.materials = defaultMaterials(color: color)
            let footNode = SCNNode(geometry: foot)
            footNode.position = SCNVector3(0, -Float(height * 1.45), Float(depth * 0.14))
            accentNodes.append(footNode)
            leg.addChildNode(footNode)
        }

        private func addJoint(radius: CGFloat, yOffset: Float, color: UIColor, to limb: SCNNode) {
            let joint = SCNSphere(radius: radius)
            joint.segmentCount = 16
            joint.materials = defaultMaterials(color: color.withAlphaComponent(0.96))
            let jointNode = SCNNode(geometry: joint)
            jointNode.position = SCNVector3(0, -yOffset, 0)
            accentNodes.append(jointNode)
            limb.addChildNode(jointNode)
        }

        // MARK: Color

        func applyColor(_ color: UIColor) {
            if usesBundledSceneAvatar {
                avatarVisualRoot?.enumerateChildNodes { node, _ in
                    guard let geometry = node.geometry else { return }
                    for material in geometry.materials {
                        material.diffuse.contents = color
                        material.lightingModel = .physicallyBased
                        material.roughness.contents = 0.72
                        material.metalness.contents = 0.0
                    }
                }
                return
            }
            for node in bodyNodes.values {
                guard let geometry = node.geometry else { continue }
                for material in geometry.materials {
                    material.diffuse.contents = color
                    material.lightingModel = .physicallyBased
                    material.roughness.contents = 0.72
                    material.metalness.contents = 0.0
                }
            }
            for node in accentNodes {
                guard let materials = node.geometry?.materials else { continue }
                for material in materials {
                    material.diffuse.contents = color
                }
            }
        }

        func applyPaintTexture(_ image: UIImage) {
            if usesBundledSceneAvatar {
                avatarVisualRoot?.enumerateChildNodes { node, _ in
                    guard let geometry = node.geometry else { return }
                    for material in geometry.materials {
                        material.diffuse.contents = image
                        material.diffuse.contentsTransform = self.vFlipTransform
                        material.diffuse.wrapS = .clamp
                        material.diffuse.wrapT = .clamp
                        material.lightingModel = .physicallyBased
                        material.roughness.contents = 0.72
                        material.metalness.contents = 0.0
                    }
                }
                return
            }
            for node in bodyNodes.values {
                guard let geometry = node.geometry else { continue }
                for material in geometry.materials {
                    material.diffuse.contents = image
                    material.diffuse.wrapS = .clamp
                    material.diffuse.wrapT = .clamp
                    material.lightingModel = .physicallyBased
                    material.roughness.contents = 0.72
                    material.metalness.contents = 0.0
                }
            }
        }

        // MARK: Clothing (UV cross-crop)

        /// Apply a cross-shaped clothing texture to body parts using CGImage cropping.
        /// Standard Roblox template is 585×559.
        func applyClothing(image: UIImage, target: ClothTarget, alpha: Double) {
            log("applyClothing called: usesBundledSceneAvatar=\(usesBundledSceneAvatar) target=\(target.rawValue) bodyGroupNodes.keys=\(bodyGroupNodes.keys.sorted()) bodyNodes.keys=\(bodyNodes.keys.sorted())")
            if usesBundledSceneAvatar {
                applyClothingToBundledScene(image: image, target: target, alpha: alpha)
                return
            }

            switch target {
            case .shirt:
                applyCroppedTexture(to: "torso", image: image, rects: cropRects(for: .torso, imageSize: image.size), alpha: alpha)
                applyCroppedTexture(to: "leftArm", image: image, rects: cropRects(for: .leftArm, imageSize: image.size), alpha: alpha)
                applyCroppedTexture(to: "rightArm", image: image, rects: cropRects(for: .rightArm, imageSize: image.size), alpha: alpha)
            case .pants:
                applyCroppedTexture(to: "leftLeg", image: image, rects: cropRects(for: .leftLeg, imageSize: image.size), alpha: alpha)
                applyCroppedTexture(to: "rightLeg", image: image, rects: cropRects(for: .rightLeg, imageSize: image.size), alpha: alpha)
            case .tshirt:
                if let frontRect = tshirtFrontRect(imageSize: image.size) {
                    applySingleFace(to: "torso", faceIndex: 0, image: image, rect: frontRect, alpha: alpha)
                }
            }
        }

        /// SceneKit transform that un-flips the V coordinate inverted by scntool.
        /// scntool converted OBJ→SCN with V' = 1 - V. This transform applies V'' = 1 - V',
        /// restoring the original OBJ UV layout so the composite image regions match.
        private let vFlipTransform = SCNMatrix4Mult(
            SCNMatrix4MakeTranslation(0, 1, 0),
            SCNMatrix4MakeScale(1, -1, 1)
        )

        private func applyClothingToBundledScene(image: UIImage, target: ClothTarget, alpha: Double) {
            let bodyColor = lastAppliedColor ?? UIColor.white
            let isFullTemplate = image.size.width > 256 || image.size.height > 256
            log("applyClothingToBundledScene: imageSize=\(image.size) target=\(target.rawValue) isFullTemplate=\(isFullTemplate)")

            if isFullTemplate, hasSegmentedBodyMapping {
                log("applyClothingToBundledScene: applying full template to segmented body groups")
                applyFullTemplateToMappedGroups(image: image, target: target, alpha: alpha, bodyColor: bodyColor)
                return
            }

            if isFullTemplate, applyFullTemplateByElements(image: image, target: target, alpha: alpha, bodyColor: bodyColor) {
                log("applyClothingToBundledScene: applying full template by geometry elements")
                return
            }

            let texture: UIImage
            if isFullTemplate {
                texture = remapFullTemplateToModelUV(template: image, target: target, bodyColor: bodyColor)
                log("applyClothingToBundledScene: FULL TEMPLATE remapped to model UV, result=\(texture.size)")
            } else {
                texture = createTextureFromPreview(preview: image, target: target, bodyColor: bodyColor)
                log("applyClothingToBundledScene: PREVIEW composite, result=\(texture.size)")
            }

            avatarVisualRoot?.enumerateChildNodes { node, _ in
                guard let geometry = node.geometry else { return }
                let count = max(1, geometry.elements.count)
                geometry.materials = (0..<count).map { _ in
                    let mat = SCNMaterial()
                    mat.diffuse.contents = texture
                    mat.diffuse.wrapS = .clamp
                    mat.diffuse.wrapT = .clamp
                    mat.transparency = CGFloat(alpha)
                    mat.isDoubleSided = true
                    mat.lightingModel = .physicallyBased
                    mat.roughness.contents = 0.72
                    mat.metalness.contents = 0.0
                    return mat
                }
            }
        }

        @discardableResult
        private func applyFullTemplateByElements(image: UIImage, target: ClothTarget, alpha: Double, bodyColor: UIColor) -> Bool {
            let texturedParts: Set<String>
            switch target {
            case .shirt:
                texturedParts = ["torso", "arm"]
            case .pants:
                texturedParts = ["leg"]
            case .tshirt:
                texturedParts = ["torso"]
            }

            var applied = false
            avatarVisualRoot?.enumerateChildNodes { node, _ in
                guard let geometry = node.geometry, !geometry.elements.isEmpty else { return }
                let classified = self.classifyElementsByUV(geometry: geometry)
                guard !classified.isEmpty else { return }
                applied = true

                geometry.materials = geometry.elements.enumerated().map { index, _ in
                    let material = SCNMaterial()
                    let part = classified[index] ?? "unknown"
                    material.diffuse.contents = texturedParts.contains(part) ? image : bodyColor
                    material.diffuse.contentsTransform = self.vFlipTransform
                    material.diffuse.wrapS = .clamp
                    material.diffuse.wrapT = .clamp
                    material.transparency = CGFloat(alpha)
                    material.isDoubleSided = true
                    material.lightingModel = .physicallyBased
                    material.roughness.contents = 0.72
                    material.metalness.contents = 0.0
                    return material
                }
            }

            return applied
        }

        private func applyFullTemplateToMappedGroups(image: UIImage, target: ClothTarget, alpha: Double, bodyColor: UIColor) {
            let texturedGroups: Set<String>
            switch target {
            case .shirt:
                texturedGroups = ["torso", "leftArm", "rightArm"]
            case .pants:
                texturedGroups = ["leftLeg", "rightLeg"]
            case .tshirt:
                texturedGroups = ["torso"]
            }

            for (group, nodes) in bodyGroupNodes {
                let useTexture = texturedGroups.contains(group)
                for node in nodes {
                    guard let geometry = node.geometry else { continue }
                    let materialCount = max(1, geometry.materials.count)
                    geometry.materials = (0..<materialCount).map { _ in
                        let mat = SCNMaterial()
                        mat.diffuse.contents = useTexture ? image : bodyColor
                        mat.diffuse.wrapS = .clamp
                        mat.diffuse.wrapT = .clamp
                        mat.transparency = CGFloat(alpha)
                        mat.isDoubleSided = true
                        mat.lightingModel = .physicallyBased
                        mat.roughness.contents = 0.72
                        mat.metalness.contents = 0.0
                        return mat
                    }
                }
            }
        }

        /// Remap a 585x559 Roblox UV template into the model's custom UV space (1024x1024).
        /// Extracts body-part regions from the standard Roblox template layout and places them
        /// at positions matching the SCN model's UV bounds.
        private func remapFullTemplateToModelUV(template: UIImage, target: ClothTarget, bodyColor: UIColor) -> UIImage {
            let s: CGFloat = 1024
            let tw = template.size.width
            let th = template.size.height
            guard let cg = template.cgImage else { return template }

            struct M { let src: CGRect; let dst: CGRect }

            // ── Roblox template source regions (CG coords, y=0 top) ──
            // Upper band (arms + head): y ≈ 0 to 0.67*h
            // Lower band (legs):        y ≈ 0.67*h to h
            // Columns: left arm 0-0.29w | center 0.29w-0.63w | right arm 0.63w-w

            // ── Model UV destination regions (on 1024² canvas) ──
            // Torso:    U 0.00-0.42, V 0.01-0.47  →  canvas top-left
            // L.Arm:    U 0.42-0.71, V 0.00-0.50  →  canvas top-center
            // R.Arm:    U 0.71-1.00, V 0.00-0.50  →  canvas top-right
            // Head:     U 0.00-0.42, V 0.50-1.00  →  canvas bottom-left
            // L.Leg:    U 0.42-0.71, V 0.61-1.00  →  canvas bottom-center
            // R.Leg:    U 0.71-1.00, V 0.61-1.00  →  canvas bottom-right

            let mappings: [M]
            switch target {
            case .shirt:
                mappings = [
                    // Torso: template center column, LOWER half (skip head at top)
                    M(src: CGRect(x: tw * 0.29, y: th * 0.32, width: tw * 0.34, height: th * 0.36),
                      dst: CGRect(x: 0,          y: s * 0.01,  width: s * 0.42,  height: s * 0.46)),
                    // Left arm: template left column, full upper band
                    M(src: CGRect(x: 0,          y: 0,          width: tw * 0.29, height: th * 0.68),
                      dst: CGRect(x: s * 0.42,  y: 0,          width: s * 0.29,  height: s * 0.50)),
                    // Right arm: template right column, full upper band
                    M(src: CGRect(x: tw * 0.63, y: 0,          width: tw * 0.37, height: th * 0.68),
                      dst: CGRect(x: s * 0.71,  y: 0,          width: s * 0.29,  height: s * 0.50)),
                ]
            case .pants:
                mappings = [
                    // Left leg: template bottom-left
                    M(src: CGRect(x: tw * 0.04, y: th * 0.68, width: tw * 0.46, height: th * 0.32),
                      dst: CGRect(x: s * 0.42,  y: s * 0.61,  width: s * 0.29,  height: s * 0.39)),
                    // Right leg: template bottom-right
                    M(src: CGRect(x: tw * 0.50, y: th * 0.68, width: tw * 0.46, height: th * 0.32),
                      dst: CGRect(x: s * 0.71,  y: s * 0.61,  width: s * 0.29,  height: s * 0.39)),
                ]
            case .tshirt:
                mappings = [
                    // T-shirt: just torso area
                    M(src: CGRect(x: tw * 0.29, y: th * 0.32, width: tw * 0.34, height: th * 0.36),
                      dst: CGRect(x: 0,          y: s * 0.01,  width: s * 0.42,  height: s * 0.46)),
                ]
            }

            UIGraphicsBeginImageContextWithOptions(CGSize(width: s, height: s), true, 1.0)
            bodyColor.setFill()
            UIRectFill(CGRect(origin: .zero, size: CGSize(width: s, height: s)))

            for m in mappings {
                let pixelSrc = CGRect(
                    x: m.src.origin.x * template.scale,
                    y: m.src.origin.y * template.scale,
                    width: m.src.size.width * template.scale,
                    height: m.src.size.height * template.scale
                )
                if let cropped = cg.cropping(to: pixelSrc) {
                    UIImage(cgImage: cropped, scale: 1.0, orientation: template.imageOrientation)
                        .draw(in: m.dst)
                }
            }

            let result = UIGraphicsGetImageFromCurrentImageContext()
            UIGraphicsEndImageContext()
            return result ?? template
        }

        /// Build a 1024x1024 composite texture: draw the preview image into the UV regions
        /// that correspond to the clothed body parts, fill everything else with body color.
        /// Regions match SCN UV coordinates directly (no vFlipTransform).
        private func createTextureFromPreview(preview: UIImage, target: ClothTarget, bodyColor: UIColor) -> UIImage {
            let s: CGFloat = 1024
            let canvasSize = CGSize(width: s, height: s)

            let regions: [CGRect]
            switch target {
            case .shirt:
                regions = [
                    CGRect(x: s * 0.00, y: s * 0.01, width: s * 0.42, height: s * 0.46),
                    CGRect(x: s * 0.42, y: s * 0.00, width: s * 0.29, height: s * 0.50),
                    CGRect(x: s * 0.71, y: s * 0.00, width: s * 0.29, height: s * 0.50),
                ]
            case .pants:
                regions = [
                    CGRect(x: s * 0.42, y: s * 0.61, width: s * 0.29, height: s * 0.39),
                    CGRect(x: s * 0.71, y: s * 0.61, width: s * 0.29, height: s * 0.39),
                ]
            case .tshirt:
                regions = [
                    CGRect(x: s * 0.00, y: s * 0.01, width: s * 0.42, height: s * 0.46),
                ]
            }

            UIGraphicsBeginImageContextWithOptions(canvasSize, true, 1.0)
            bodyColor.setFill()
            UIRectFill(CGRect(origin: .zero, size: canvasSize))

            for region in regions {
                drawAspectFill(preview, in: region)
            }

            let result = UIGraphicsGetImageFromCurrentImageContext()
            UIGraphicsEndImageContext()
            return result ?? preview
        }

        /// Draw image into rect with aspect-fill: maintain aspect ratio, center and crop.
        private func drawAspectFill(_ image: UIImage, in rect: CGRect) {
            let imgW = image.size.width
            let imgH = image.size.height
            guard imgW > 0 && imgH > 0 else { return }
            let imgAspect = imgW / imgH
            let rectAspect = rect.width / rect.height
            var drawRect = rect
            if imgAspect > rectAspect {
                let scaledW = rect.height * imgAspect
                drawRect = CGRect(x: rect.midX - scaledW / 2, y: rect.minY,
                                  width: scaledW, height: rect.height)
            } else {
                let scaledH = rect.width / imgAspect
                drawRect = CGRect(x: rect.minX, y: rect.midY - scaledH / 2,
                                  width: rect.width, height: scaledH)
            }
            guard let ctx = UIGraphicsGetCurrentContext() else { return }
            ctx.saveGState()
            ctx.clip(to: rect)
            image.draw(in: drawRect)
            ctx.restoreGState()
        }

        private var cachedElementParts: [Int: String] = [:]
        private var cachedElementUVBounds: [Int: (minU: Float, maxU: Float, minV: Float, maxV: Float)] = [:]

        /// Extracts the set of unique vertex indices used by a geometry element.
        private func extractUsedVerts(element: SCNGeometryElement) -> Set<Int> {
            let indexData = element.data
            let bpi = element.bytesPerIndex
            let indexCount = element.primitiveCount * 3
            var verts = Set<Int>()
            for j in 0..<indexCount {
                let vertIndex: Int
                if bpi == 4 {
                    vertIndex = Int(indexData.withUnsafeBytes { $0.load(fromByteOffset: j * 4, as: UInt32.self) })
                } else {
                    vertIndex = Int(indexData.withUnsafeBytes { $0.load(fromByteOffset: j * 2, as: UInt16.self) })
                }
                verts.insert(vertIndex)
            }
            return verts
        }

        /// Read UV (u, v) for a given vertex index from the texcoord source.
        private func readUV(vertIndex: Int, data: Data, stride: Int, offset: Int) -> (Float, Float) {
            let base = vertIndex * stride + offset
            let u = data.withUnsafeBytes { $0.load(fromByteOffset: base, as: Float.self) }
            let v = data.withUnsafeBytes { $0.load(fromByteOffset: base + 4, as: Float.self) }
            return (u, v)
        }

        /// Classify each geometry element as head/torso/arm/leg by analyzing
        /// mean UV coordinates. SCN V is flipped (V'=1-V_obj):
        ///   Torso column (meanU < 0.43): low V' → torso, high V' → head
        ///   Arm/Leg columns (meanU >= 0.43): low V' → arm, high V' → leg
        private func classifyElementsByUV(geometry: SCNGeometry) -> [Int: String] {
            if !cachedElementParts.isEmpty { return cachedElementParts }

            guard let uvSource = geometry.sources.first(where: { $0.semantic == .texcoord }) else {
                log("classifyElementsByUV: no texcoord source found")
                return [:]
            }

            let uvData = uvSource.data
            let uvStride = uvSource.dataStride
            let uvOffset = uvSource.dataOffset
            var result: [Int: String] = [:]

            for (i, element) in geometry.elements.enumerated() {
                let usedVerts = extractUsedVerts(element: element)

                var sumU: Float = 0, sumV: Float = 0
                for vertIndex in usedVerts {
                    let (u, v) = readUV(vertIndex: vertIndex, data: uvData, stride: uvStride, offset: uvOffset)
                    sumU += u
                    sumV += v
                }

                let count = Float(usedVerts.count)
                guard count > 0 else { continue }
                let meanU = sumU / count
                let meanV = sumV / count

                let part: String
                if meanU < 0.43 {
                    part = meanV < 0.50 ? "torso" : "head"
                } else {
                    part = meanV < 0.52 ? "arm" : "leg"
                }
                result[i] = part
                log("  classifyElement \(i): meanU=\(String(format: "%.3f", meanU)) meanV=\(String(format: "%.3f", meanV)) → \(part)")
            }

            cachedElementParts = result
            return result
        }

        /// Compute the UV bounding box (minU, maxU, minV, maxV) of each geometry element.
        private func computeElementUVBounds(geometry: SCNGeometry) -> [Int: (minU: Float, maxU: Float, minV: Float, maxV: Float)] {
            if !cachedElementUVBounds.isEmpty { return cachedElementUVBounds }

            guard let uvSource = geometry.sources.first(where: { $0.semantic == .texcoord }) else { return [:] }

            let uvData = uvSource.data
            let uvStride = uvSource.dataStride
            let uvOffset = uvSource.dataOffset
            var result: [Int: (minU: Float, maxU: Float, minV: Float, maxV: Float)] = [:]

            for (i, element) in geometry.elements.enumerated() {
                let usedVerts = extractUsedVerts(element: element)
                var minU: Float = .greatestFiniteMagnitude, maxU: Float = -.greatestFiniteMagnitude
                var minV: Float = .greatestFiniteMagnitude, maxV: Float = -.greatestFiniteMagnitude

                for vertIndex in usedVerts {
                    let (u, v) = readUV(vertIndex: vertIndex, data: uvData, stride: uvStride, offset: uvOffset)
                    minU = min(minU, u); maxU = max(maxU, u)
                    minV = min(minV, v); maxV = max(maxV, v)
                }

                if !usedVerts.isEmpty {
                    result[i] = (minU, maxU, minV, maxV)
                    log("  uvBounds \(i): U[\(String(format: "%.3f", minU))–\(String(format: "%.3f", maxU))] V[\(String(format: "%.3f", minV))–\(String(format: "%.3f", maxV))]")
                }
            }

            cachedElementUVBounds = result
            return result
        }

        /// Composites clothing regions from a Roblox template onto a body-colored canvas.
        /// Regions match the ORIGINAL OBJ UV layout (V=0 bottom, V=1 top).
        /// The V-flip from scntool is handled by contentsTransform on the material.
        ///
        /// OBJ UV layout (pixel coords with V=0 bottom → UIKit Y=0 at top):
        ///   Torso column  X:0-246   Y:0-265    (upper+lower torso)
        ///   Left arm col  X:249-415 Y:0-280    (upper+lower arm+hand)
        ///   Right arm col X:418-584 Y:0-280    (upper+lower arm+hand)
        ///   Head          X:85-223  Y:269-558  (below torso in same column)
        ///   Left leg col  X:249-415 Y:340-558  (upper+lower leg+foot)
        ///   Right leg col X:418-584 Y:340-558  (upper+lower leg+foot)
        private func compositeTemplateImage(from image: UIImage, target: ClothTarget, bodyColor: UIColor) -> UIImage {
            let w = image.size.width
            let h = image.size.height
            guard let cgImage = image.cgImage else { return image }

            let regions: [CGRect]
            switch target {
            case .shirt:
                regions = [
                    CGRect(x: 0,         y: 0, width: w * 0.425, height: h * 0.475),
                    CGRect(x: w * 0.425, y: 0, width: w * 0.285, height: h * 0.505),
                    CGRect(x: w * 0.714, y: 0, width: w * 0.286, height: h * 0.505),
                ]
            case .pants:
                regions = [
                    CGRect(x: w * 0.425, y: h * 0.605, width: w * 0.285, height: h * 0.395),
                    CGRect(x: w * 0.714, y: h * 0.605, width: w * 0.286, height: h * 0.395),
                ]
            case .tshirt:
                regions = [
                    CGRect(x: 0, y: 0, width: w * 0.425, height: h * 0.475),
                ]
            }

            UIGraphicsBeginImageContextWithOptions(image.size, true, image.scale)
            bodyColor.setFill()
            UIRectFill(CGRect(origin: .zero, size: image.size))

            for region in regions {
                let pixelRect = CGRect(
                    x: region.origin.x * image.scale,
                    y: region.origin.y * image.scale,
                    width: region.size.width * image.scale,
                    height: region.size.height * image.scale
                )
                if let cropped = cgImage.cropping(to: pixelRect) {
                    UIImage(cgImage: cropped, scale: image.scale, orientation: image.imageOrientation)
                        .draw(in: region)
                }
            }

            let result = UIGraphicsGetImageFromCurrentImageContext()
            UIGraphicsEndImageContext()
            return result ?? image
        }

        private func applyFullTemplateToMesh(rootNode: SCNNode, image: UIImage, alpha: Double) {
            log("Applying full template texture to bundled scene mesh")
            rootNode.enumerateChildNodes { node, _ in
                guard let geometry = node.geometry else { return }
                let count = max(1, geometry.materials.count)
                geometry.materials = (0..<count).map { _ in
                    let material = SCNMaterial()
                    material.diffuse.contents = image
                    material.diffuse.wrapS = .repeat
                    material.diffuse.wrapT = .repeat
                    material.transparency = CGFloat(alpha)
                    material.isDoubleSided = true
                    material.lightingModel = .physicallyBased
                    material.roughness.contents = 0.72
                    material.metalness.contents = 0.0
                    return material
                }
            }
        }

        private func applyCroppedTexture(to nodeName: String, image: UIImage, rects: [CGRect], alpha: Double) {
            guard let node = bodyNodes[nodeName], let geometry = node.geometry else { return }
            if let box = geometry as? SCNBox {
                let mats = box.materials
                for (i, mat) in mats.enumerated() where i < rects.count {
                    if let cropped = image.crop(rect: rects[i]) {
                        mat.diffuse.contents = cropped
                        mat.transparency = CGFloat(alpha)
                        mat.isDoubleSided = true
                    }
                }
                return
            }

            if let cropped = image.crop(rect: rects.first ?? .zero) {
                for material in geometry.materials {
                    material.diffuse.contents = cropped
                    material.transparency = CGFloat(alpha)
                    material.isDoubleSided = true
                }
            }
        }

        private func applySingleFace(to nodeName: String, faceIndex: Int, image: UIImage, rect: CGRect, alpha: Double) {
            guard let node = bodyNodes[nodeName], let geometry = node.geometry else { return }
            guard let cropped = image.crop(rect: rect) else { return }
            if let box = geometry as? SCNBox {
                let mats = box.materials
                guard faceIndex < mats.count else { return }
                mats[faceIndex].diffuse.contents = cropped
                mats[faceIndex].transparency = CGFloat(alpha)
                return
            }

            for material in geometry.materials {
                material.diffuse.contents = cropped
                material.transparency = CGFloat(alpha)
            }
        }

        // MARK: Crop rects — Roblox 585×559 standard

        enum BodyPart { case torso, leftArm, rightArm, leftLeg, rightLeg }

        func cropRects(for part: BodyPart, imageSize: CGSize) -> [CGRect] {
            let w = imageSize.width
            let h = imageSize.height

            switch part {
            case .torso:
                // SCNBox face order: front, right, back, left, top, bottom
                let front  = CGRect(x: w * 0.109, y: h * 0.079, width: w * 0.219, height: h * 0.229)
                let right  = CGRect(x: w * 0.328, y: h * 0.079, width: w * 0.109, height: h * 0.229)
                let back   = CGRect(x: w * 0.437, y: h * 0.079, width: w * 0.219, height: h * 0.229)
                let left   = CGRect(x: 0,          y: h * 0.079, width: w * 0.109, height: h * 0.229)
                let top    = CGRect(x: w * 0.109, y: 0,          width: w * 0.219, height: h * 0.079)
                let bottom = CGRect(x: w * 0.109, y: h * 0.308, width: w * 0.219, height: h * 0.079)
                return [front, right, back, left, top, bottom]

            case .leftArm:
                let yOff = h * 0.508
                let front  = CGRect(x: w * 0.109, y: yOff,           width: w * 0.109, height: h * 0.229)
                let right  = CGRect(x: w * 0.219, y: yOff,           width: w * 0.109, height: h * 0.229)
                let back   = CGRect(x: w * 0.328, y: yOff,           width: w * 0.109, height: h * 0.229)
                let left   = CGRect(x: 0,          y: yOff,           width: w * 0.109, height: h * 0.229)
                let top    = CGRect(x: w * 0.109, y: h * 0.429,     width: w * 0.109, height: h * 0.079)
                let bottom = CGRect(x: w * 0.109, y: h * 0.737,     width: w * 0.109, height: h * 0.079)
                return [front, right, back, left, top, bottom]

            case .rightArm:
                let xOff = w * 0.547
                let yOff = h * 0.508
                let front  = CGRect(x: xOff + w * 0.109, y: yOff,       width: w * 0.109, height: h * 0.229)
                let right  = CGRect(x: xOff + w * 0.219, y: yOff,       width: w * 0.109, height: h * 0.229)
                let back   = CGRect(x: xOff + w * 0.328, y: yOff,       width: w * 0.109, height: h * 0.229)
                let left   = CGRect(x: xOff,              y: yOff,       width: w * 0.109, height: h * 0.229)
                let top    = CGRect(x: xOff + w * 0.109, y: h * 0.429, width: w * 0.109, height: h * 0.079)
                let bottom = CGRect(x: xOff + w * 0.109, y: h * 0.737, width: w * 0.109, height: h * 0.079)
                return [front, right, back, left, top, bottom]

            case .leftLeg, .rightLeg:
                let xBase: CGFloat = (part == .leftLeg) ? 0 : w * 0.547
                let yOff = h * 0.508
                let front  = CGRect(x: xBase + w * 0.109, y: yOff,       width: w * 0.109, height: h * 0.229)
                let right  = CGRect(x: xBase + w * 0.219, y: yOff,       width: w * 0.109, height: h * 0.229)
                let back   = CGRect(x: xBase + w * 0.328, y: yOff,       width: w * 0.109, height: h * 0.229)
                let left   = CGRect(x: xBase,              y: yOff,       width: w * 0.109, height: h * 0.229)
                let top    = CGRect(x: xBase + w * 0.109, y: h * 0.429, width: w * 0.109, height: h * 0.079)
                let bottom = CGRect(x: xBase + w * 0.109, y: h * 0.737, width: w * 0.109, height: h * 0.079)
                return [front, right, back, left, top, bottom]
            }
        }

        func tshirtFrontRect(imageSize: CGSize) -> CGRect? {
            CGRect(x: imageSize.width * 0.109, y: imageSize.height * 0.079,
                   width: imageSize.width * 0.219, height: imageSize.height * 0.229)
        }

        // MARK: Accessory routing

        func attachAccessory(image: UIImage, slot: AccessorySlot, offset: CGSize = .zero, alpha: Double = 1.0) {
            let planeSize: CGSize
            let p = currentProportions
            switch slot {
            case .back:
                planeSize = CGSize(width: max(0.42, p.torso.w * 0.95), height: max(0.42, p.torso.h * 0.76))
            case .neck:
                planeSize = CGSize(width: max(0.42, p.torso.w * 1.02), height: max(0.18, p.torso.h * 0.28))
            case .hat:
                planeSize = CGSize(width: max(0.42, p.head.w * 1.18), height: max(0.24, p.head.h * 0.78))
            case .face:
                planeSize = CGSize(width: max(0.34, p.head.w * 0.94), height: max(0.18, p.head.h * 0.46))
            }

            let plane = SCNPlane(width: planeSize.width, height: planeSize.height)
            plane.firstMaterial?.diffuse.contents = image
            plane.firstMaterial?.isDoubleSided = true
            plane.firstMaterial?.writesToDepthBuffer = false
            plane.firstMaterial?.transparency = CGFloat(alpha)
            let node = SCNNode(geometry: plane)
            node.name = "accessory_\(slot.rawValue)"

            avatarRoot?.childNode(withName: "accessory_\(slot.rawValue)", recursively: true)?.removeFromParentNode()

            let xOffset = Float(offset.width / 260)
            let yOffset = Float(-offset.height / 260)

            switch slot {
            case .back:
                node.position = SCNVector3(xOffset, Float(p.torso.h * 0.02) + yOffset, -Float(p.torso.d / 2 + 0.03))
                bodyNodes["torso"]?.addChildNode(node)
            case .neck:
                node.position = SCNVector3(xOffset, Float(p.torso.h / 2 - 0.03) + yOffset, Float(p.torso.d / 2 + 0.03))
                bodyNodes["torso"]?.addChildNode(node)
            case .hat:
                node.position = SCNVector3(xOffset, Float(p.head.h / 2 - 0.02) + yOffset, Float(p.head.d * 0.12))
                bodyNodes["head"]?.addChildNode(node)
            case .face:
                node.position = SCNVector3(xOffset, yOffset, Float(p.head.d / 2 + 0.02))
                bodyNodes["head"]?.addChildNode(node)
            }
        }

        func removeAccessory(slot: AccessorySlot) {
            avatarRoot?.childNode(withName: "accessory_\(slot.rawValue)", recursively: true)?.removeFromParentNode()
        }

        func detectAccessorySlot(from text: String) -> AccessorySlot {
            let lower = text.lowercased()
            if lower.contains("backpack") || lower.contains("cape") || lower.contains("wing") { return .back }
            if lower.contains("scarf") || lower.contains("tie") || lower.contains("necklace") ||
               lower.contains("shirt") || lower.contains("jacket") || lower.contains("vest") { return .neck }
            if lower.contains("hat") || lower.contains("cap") || lower.contains("crown") ||
               lower.contains("helmet") || lower.contains("hair") { return .hat }
            return .face
        }

        func applyStickers(_ stickers: [StickerState], alpha: Double) {
            stickersRoot.childNodes.forEach { $0.removeFromParentNode() }

            for (index, sticker) in stickers.enumerated() {
                Task {
                    guard let image = await ImageCacheManager.shared.image(for: sticker.imageURL) else { return }
                    await MainActor.run {
                        let layout = stickerLayout(for: sticker.targetArea, scale: sticker.scale)
                        let plane = SCNPlane(width: layout.size.width, height: layout.size.height)
                        let material = SCNMaterial()
                        material.diffuse.contents = image
                        material.isDoubleSided = true
                        material.transparency = CGFloat(alpha)
                        material.writesToDepthBuffer = false
                        plane.materials = [material]

                        let node = SCNNode(geometry: plane)
                        node.name = "sticker_\(index)"
                        node.position = SCNVector3(
                            mappedStickerX(sticker.position.x, limit: layout.positionLimit.width),
                            mappedStickerY(sticker.position.y, limit: layout.positionLimit.height),
                            layout.zPosition + Float(index) * 0.001
                        )
                        node.eulerAngles = SCNVector3(0, 0, Float(sticker.rotation.radians))
                        layout.node?.addChildNode(node)
                    }
                }
            }
        }

        private func stickerLayout(for area: EditorEditArea, scale: CGFloat) -> (size: CGSize, positionLimit: CGSize, zPosition: Float, node: SCNNode?) {
            let clampedScale = max(0.45, min(scale, 3.2))

            switch area {
            case .head:
                return (
                    size: CGSize(width: 0.20 * clampedScale, height: 0.20 * clampedScale),
                    positionLimit: CGSize(width: 0.10, height: 0.10),
                    zPosition: 0.22,
                    node: bodyNodes["head"]
                )
            case .torso:
                return (
                    size: CGSize(width: 0.28 * clampedScale, height: 0.28 * clampedScale),
                    positionLimit: CGSize(width: 0.15, height: 0.17),
                    zPosition: 0.16,
                    node: bodyNodes["torso"]
                )
            case .legs:
                return (
                    size: CGSize(width: 0.18 * clampedScale, height: 0.20 * clampedScale),
                    positionLimit: CGSize(width: 0.04, height: 0.12),
                    zPosition: 0.14,
                    node: bodyNodes["leftLeg"]
                )
            }
        }

        private func mappedStickerX(_ raw: CGFloat, limit: CGFloat) -> Float {
            let normalized = max(-1, min(1, raw / 68))
            return Float(normalized * limit)
        }

        private func mappedStickerY(_ raw: CGFloat, limit: CGFloat) -> Float {
            let normalized = max(-1, min(1, raw / 68))
            return Float(-normalized * limit)
        }

        private func stickerNode(for area: EditorEditArea) -> SCNNode? {
            switch area {
            case .head:
                return bodyNodes["head"]
            case .torso:
                return bodyNodes["torso"]
            case .legs:
                return bodyNodes["leftLeg"]
            }
        }

        private func stickerDepth(for area: EditorEditArea) -> Float {
            switch area {
            case .head:
                return 0.22
            case .torso:
                return 0.16
            case .legs:
                return 0.14
            }
        }
    }

    // MARK: - Proportions

    struct BoxSize {
        let w: CGFloat, h: CGFloat, d: CGFloat
    }

    struct Proportions {
        let rig: AvatarRigType
        let head: BoxSize, torso: BoxSize, arm: BoxSize, leg: BoxSize
        let chamfer: CGFloat
        let legSpread: CGFloat
        let armGap: CGFloat
        let armDrop: CGFloat
        let armTiltDegrees: CGFloat
        let legTiltDegrees: CGFloat
        let headLift: CGFloat
        let legLift: CGFloat
        let torsoCenterYOffset: CGFloat

        static func forType(_ type: AvatarBodyType, rig: AvatarRigType) -> Proportions {
            switch (rig, type) {
            case (.r6, .neutrally):
                return Proportions(
                    rig: rig,
                    head: .init(w: 0.42, h: 0.42, d: 0.42),
                    torso: .init(w: 0.54, h: 0.60, d: 0.28),
                    arm: .init(w: 0.20, h: 0.50, d: 0.20),
                    leg: .init(w: 0.22, h: 0.50, d: 0.22),
                    chamfer: 0.018,
                    legSpread: 1.0,
                    armGap: 0.022,
                    armDrop: 0.0,
                    armTiltDegrees: 1.0,
                    legTiltDegrees: 0.4,
                    headLift: 0.0,
                    legLift: 0.0,
                    torsoCenterYOffset: 0.0
                )
            case (.r6, .woman):
                return Proportions(
                    rig: rig,
                    head: .init(w: 0.40, h: 0.40, d: 0.40),
                    torso: .init(w: 0.49, h: 0.59, d: 0.26),
                    arm: .init(w: 0.18, h: 0.50, d: 0.18),
                    leg: .init(w: 0.20, h: 0.52, d: 0.20),
                    chamfer: 0.02,
                    legSpread: 1.06,
                    armGap: 0.02,
                    armDrop: 0.0,
                    armTiltDegrees: 1.4,
                    legTiltDegrees: 0.8,
                    headLift: 0.0,
                    legLift: 0.0,
                    torsoCenterYOffset: 0.0
                )
            case (.r6, .man):
                return Proportions(
                    rig: rig,
                    head: .init(w: 0.43, h: 0.42, d: 0.43),
                    torso: .init(w: 0.60, h: 0.62, d: 0.30),
                    arm: .init(w: 0.22, h: 0.52, d: 0.22),
                    leg: .init(w: 0.22, h: 0.52, d: 0.22),
                    chamfer: 0.018,
                    legSpread: 0.95,
                    armGap: 0.026,
                    armDrop: 0.0,
                    armTiltDegrees: 0.8,
                    legTiltDegrees: 0.3,
                    headLift: 0.0,
                    legLift: 0.0,
                    torsoCenterYOffset: 0.0
                )
            case (.r15, .neutrally):
                return Proportions(
                    rig: rig,
                    head: .init(w: 0.38, h: 0.40, d: 0.38),
                    torso: .init(w: 0.50, h: 0.58, d: 0.25),
                    arm: .init(w: 0.18, h: 0.58, d: 0.18),
                    leg: .init(w: 0.20, h: 0.66, d: 0.20),
                    chamfer: 0.022,
                    legSpread: 1.0,
                    armGap: 0.024,
                    armDrop: -0.005,
                    armTiltDegrees: 1.0,
                    legTiltDegrees: 0.4,
                    headLift: 0.015,
                    legLift: 0.005,
                    torsoCenterYOffset: -0.015
                )
            case (.r15, .woman):
                return Proportions(
                    rig: rig,
                    head: .init(w: 0.35, h: 0.37, d: 0.35),
                    torso: .init(w: 0.38, h: 0.63, d: 0.20),
                    arm: .init(w: 0.12, h: 0.61, d: 0.12),
                    leg: .init(w: 0.14, h: 0.74, d: 0.14),
                    chamfer: 0.055,
                    legSpread: 1.18,
                    armGap: 0.034,
                    armDrop: -0.03,
                    armTiltDegrees: 3.8,
                    legTiltDegrees: 1.8,
                    headLift: 0.045,
                    legLift: 0.015,
                    torsoCenterYOffset: 0.01
                )
            case (.r15, .man):
                return Proportions(
                    rig: rig,
                    head: .init(w: 0.39, h: 0.40, d: 0.39),
                    torso: .init(w: 0.48, h: 0.64, d: 0.25),
                    arm: .init(w: 0.16, h: 0.62, d: 0.16),
                    leg: .init(w: 0.18, h: 0.72, d: 0.18),
                    chamfer: 0.034,
                    legSpread: 1.02,
                    armGap: 0.03,
                    armDrop: -0.02,
                    armTiltDegrees: 2.0,
                    legTiltDegrees: 0.9,
                    headLift: 0.03,
                    legLift: 0.01,
                    torsoCenterYOffset: -0.005
                )
            }
        }
    }
}
