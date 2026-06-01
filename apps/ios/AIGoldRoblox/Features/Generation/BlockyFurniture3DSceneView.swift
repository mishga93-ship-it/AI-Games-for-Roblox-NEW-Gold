import SwiftUI
import SceneKit
import UIKit

/// Decoded furniture scene sent from the backend via
/// `GenerationArtifact.metadata.furnitureSpecJSON`. Mirrors the shape of
/// LLMScenePartShape in apps/functions/src/robloxWorker.ts (line 5561):
/// each part has shape + size + position + color (hex string) + material.
struct FurnitureSpecPayload: Decodable {
    let furnitureType: String?
    let parts: [Part]
    /// Session 402: for mesh-mode furniture the real geometry is an rbxassetid
    /// MeshPart that SceneKit can't load, so the backend ships the concept
    /// render URL here. When set, the preview shows this image instead of the
    /// (empty/transparent) blocky scene.
    let meshThumbnailUrl: String?

    struct Part: Decodable {
        let name: String?
        let kind: String?              // "Part" | "Seat"
        let role: String?              // optional — base/post/shade/seat/etc
        let shape: String?             // "Block" | "Cylinder" | "Ball" (default Block)
        let position: [Double]         // [x, y, z]
        let size: [Double]             // [x, y, z] — WORLD size (pre-permutation)
        let color: String              // hex like "#A57B53" or "F0E0D0"
        let material: String?
        let transparency: Double?
        let canCollide: Bool?
        /// 2026-05-20: backend's pickCylinderAxis result for Cylinder parts.
        /// 0 = long along world-X, 1 = long along world-Y, 2 = long along
        /// world-Z. iOS uses this instead of the old longest-axis heuristic
        /// which mis-fired on flat discs ([1.2, 0.18, 1.2] → axis Y).
        let cylinderAxis: Int?
    }

    static func decode(from jsonString: String) -> FurnitureSpecPayload? {
        guard let data = jsonString.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(FurnitureSpecPayload.self, from: data)
    }
}

/// Interactive 3D furniture/prop preview. Reconstructs each part as a
/// SceneKit primitive (SCNBox/SCNSphere/SCNCylinder). User can orbit/zoom.
/// Color is a hex string (already what the LLM emits), so we parse it
/// once and apply directly — no BrickColor lookup table needed.
struct BlockyFurniture3DSceneView: UIViewRepresentable {
    let spec: FurnitureSpecPayload

    func makeUIView(context: Context) -> SCNView {
        let scnView = SCNView()
        scnView.scene = SCNScene()
        scnView.allowsCameraControl = true
        scnView.backgroundColor = .clear
        scnView.autoenablesDefaultLighting = false
        scnView.antialiasingMode = .multisampling4X
        context.coordinator.build(scene: scnView.scene!, spec: spec)
        return scnView
    }

    func updateUIView(_ uiView: SCNView, context: Context) {
        if context.coordinator.lastSpecSignature != context.coordinator.signature(for: spec) {
            uiView.scene = SCNScene()
            context.coordinator.build(scene: uiView.scene!, spec: spec)
        }
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    final class Coordinator {
        var lastSpecSignature: String = ""

        func signature(for spec: FurnitureSpecPayload) -> String {
            "\(spec.furnitureType ?? "")-\(spec.parts.count)-\(spec.parts.first?.name ?? "")"
        }

        func build(scene: SCNScene, spec: FurnitureSpecPayload) {
            lastSpecSignature = signature(for: spec)
            setupLighting(scene: scene)
            setupCamera(scene: scene, spec: spec)
            setupFloor(scene: scene)
            buildFurniture(scene: scene, spec: spec)
        }

        // MARK: - Scene setup

        private func setupLighting(scene: SCNScene) {
            let ambient = SCNNode()
            ambient.light = SCNLight()
            ambient.light?.type = .ambient
            ambient.light?.intensity = 450
            scene.rootNode.addChildNode(ambient)

            let key = SCNNode()
            key.light = SCNLight()
            key.light?.type = .omni
            key.light?.intensity = 1100
            key.position = SCNVector3(4, 6, 5)
            scene.rootNode.addChildNode(key)

            let fill = SCNNode()
            fill.light = SCNLight()
            fill.light?.type = .omni
            fill.light?.intensity = 450
            fill.light?.color = UIColor(red: 0.88, green: 0.92, blue: 1.0, alpha: 1)
            fill.position = SCNVector3(-3, 3, 4)
            scene.rootNode.addChildNode(fill)

            scene.background.contents = UIColor.clear
        }

        private func setupCamera(scene: SCNScene, spec: FurnitureSpecPayload) {
            let bbox = computeBoundingBox(spec: spec)
            let height = max(1.5, bbox.maxY - bbox.minY)
            let radius = max(1.5, max(bbox.maxX - bbox.minX, bbox.maxZ - bbox.minZ))
            let camDist = max(height, radius) * 3.2

            let cam = SCNNode()
            cam.camera = SCNCamera()
            cam.camera?.fieldOfView = 38
            cam.camera?.zNear = 0.1
            cam.camera?.zFar = 200
            let centerY = (bbox.minY + bbox.maxY) * 0.5
            cam.position = SCNVector3(0, centerY + height * 0.35, camDist)
            cam.look(at: SCNVector3(0, centerY, 0))
            scene.rootNode.addChildNode(cam)
        }

        private func setupFloor(scene: SCNScene) {
            // Soft shadow disc so the prop visually sits ON something.
            let floor = SCNFloor()
            floor.reflectivity = 0.0
            let floorNode = SCNNode(geometry: floor)
            floor.firstMaterial?.diffuse.contents = UIColor.black.withAlphaComponent(0.16)
            floor.firstMaterial?.transparency = 0.85
            floorNode.position = SCNVector3(0, 0, 0)
            scene.rootNode.addChildNode(floorNode)
        }

        // MARK: - Furniture construction

        private func buildFurniture(scene: SCNScene, spec: FurnitureSpecPayload) {
            let root = SCNNode()
            root.name = "FurnitureRoot"
            scene.rootNode.addChildNode(root)

            for part in spec.parts {
                guard part.size.count == 3, part.position.count == 3 else { continue }
                let node = SCNNode(geometry: makeGeometry(part: part))
                node.name = part.name ?? "Part"
                node.position = SCNVector3(part.position[0], part.position[1], part.position[2])
                // For cylinders, the backend already ran pickCylinderAxis and
                // shipped the result. Apply the matching SceneKit rotation:
                //   axis=0 (long along world-X) → rotate Z by 90°
                //   axis=1 (long along world-Y) → no rotation (SCNCylinder
                //          default orientation, height = Y)
                //   axis=2 (long along world-Z) → rotate X by 90°
                if (part.shape ?? "Block") == "Cylinder", let axis = part.cylinderAxis {
                    switch axis {
                    case 0: node.eulerAngles = SCNVector3(0, 0, Float.pi / 2)
                    case 2: node.eulerAngles = SCNVector3(Float.pi / 2, 0, 0)
                    default: break
                    }
                } else if (part.shape ?? "Block") == "Cylinder" {
                    // Legacy fallback for jobs created before cylinderAxis
                    // was attached server-side. Use the most-equal-other-pair
                    // heuristic that mirrors backend pickCylinderAxis.
                    applyLegacyCylinderRotation(node: node, size: part.size)
                }
                root.addChildNode(node)
            }

            // Slow idle spin so the user immediately reads it as 3D.
            let spin = SCNAction.repeatForever(
                SCNAction.rotateBy(x: 0, y: .pi * 2, z: 0, duration: 24)
            )
            root.runAction(spin, forKey: "idle_spin")
        }

        /// Legacy fallback when cylinderAxis isn't shipped in the spec.
        /// Mirrors the backend's pickCylinderAxis: picks the axis whose
        /// OTHER two dimensions are most equal (= where the circular
        /// cross-section lives).
        private func applyLegacyCylinderRotation(node: SCNNode, size: [Double]) {
            let sx = size[0], sy = size[1], sz = size[2]
            // For each candidate axis, compute the ratio of min/max of the
            // OTHER two dims. The axis with the highest ratio (most equal)
            // is the chosen one. Tie-break: prefer the longest length.
            let candidates: [(axis: Int, ratio: Double, len: Double)] = [
                (0, min(sy, sz) / max(sy, sz), sx),
                (1, min(sx, sz) / max(sx, sz), sy),
                (2, min(sx, sy) / max(sx, sy), sz),
            ]
            let best = candidates.max(by: { (a, b) in
                if a.ratio != b.ratio { return a.ratio < b.ratio }
                return a.len < b.len
            })!
            switch best.axis {
            case 0: node.eulerAngles = SCNVector3(0, 0, Float.pi / 2)
            case 2: node.eulerAngles = SCNVector3(Float.pi / 2, 0, 0)
            default: break
            }
        }

        private func makeGeometry(part: FurnitureSpecPayload.Part) -> SCNGeometry {
            let sx = CGFloat(part.size[0])
            let sy = CGFloat(part.size[1])
            let sz = CGFloat(part.size[2])

            let shape = (part.shape ?? "Block")
            let geometry: SCNGeometry
            switch shape {
            case "Ball":
                geometry = SCNSphere(radius: min(sx, sy, sz) / 2)
            case "Cylinder":
                // After cylinderAxis-driven rotation above, SCNCylinder's
                // local Y aligns with the world long axis. Height comes from
                // the long-axis world dimension; radius comes from the mean
                // of the OTHER two world dimensions (which should be ≈ equal
                // — pickCylinderAxis literally picks the axis where they are).
                let axis = part.cylinderAxis ?? -1
                let height: CGFloat
                let radius: CGFloat
                switch axis {
                case 0: height = sx; radius = (sy + sz) / 4
                case 1: height = sy; radius = (sx + sz) / 4
                case 2: height = sz; radius = (sx + sy) / 4
                default:
                    // Legacy: cylinderAxis missing → use longest dim as long axis.
                    let sorted = [sx, sy, sz].sorted(by: >)
                    height = sorted[0]
                    radius = (sorted[1] + sorted[2]) / 4
                }
                geometry = SCNCylinder(radius: radius, height: height)
            default: // Block
                geometry = SCNBox(width: sx, height: sy, length: sz, chamferRadius: 0.02)
            }

            let mat = SCNMaterial()
            mat.diffuse.contents = parseColor(part.color)
            let material = (part.material ?? "SmoothPlastic").lowercased()
            mat.metalness.contents = (material == "metal" || material == "diamondplate") ? 0.7 : 0.0
            mat.roughness.contents = (material == "neon" || material == "forcefield") ? 0.05
                : (material == "glass" || material == "ice") ? 0.1
                : (material == "wood" || material == "fabric") ? 0.85
                : 0.55
            if material == "neon" {
                mat.emission.contents = parseColor(part.color)
                mat.emission.intensity = 0.85
            }
            if let t = part.transparency, t > 0.01 {
                mat.transparency = 1.0 - t
            }
            geometry.firstMaterial = mat
            return geometry
        }

        // MARK: - Color parser

        /// Hex parser tolerant of "#RRGGBB", "RRGGBB", "#RRGGBBAA",
        /// "0xRRGGBB", and arbitrary whitespace. Returns mid-grey when the
        /// input doesn't look like hex (matches the backend's behaviour).
        private func parseColor(_ hex: String) -> UIColor {
            var s = hex.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
            if s.hasPrefix("#") { s.removeFirst() }
            if s.hasPrefix("0X") { s.removeFirst(2) }
            guard s.count == 6 || s.count == 8 else {
                return UIColor(white: 0.6, alpha: 1)
            }
            var rgb: UInt64 = 0
            guard Scanner(string: s).scanHexInt64(&rgb) else {
                return UIColor(white: 0.6, alpha: 1)
            }
            let r, g, b, a: CGFloat
            if s.count == 8 {
                a = CGFloat((rgb & 0xFF000000) >> 24) / 255
                r = CGFloat((rgb & 0x00FF0000) >> 16) / 255
                g = CGFloat((rgb & 0x0000FF00) >>  8) / 255
                b = CGFloat( rgb & 0x000000FF       ) / 255
            } else {
                a = 1
                r = CGFloat((rgb & 0xFF0000) >> 16) / 255
                g = CGFloat((rgb & 0x00FF00) >>  8) / 255
                b = CGFloat( rgb & 0x0000FF       ) / 255
            }
            return UIColor(red: r, green: g, blue: b, alpha: a)
        }

        // MARK: - Bounding box

        private struct BBox { let minX, maxX, minY, maxY, minZ, maxZ: Double }
        private func computeBoundingBox(spec: FurnitureSpecPayload) -> BBox {
            var minX = Double.infinity, maxX = -Double.infinity
            var minY = Double.infinity, maxY = -Double.infinity
            var minZ = Double.infinity, maxZ = -Double.infinity
            for p in spec.parts {
                guard p.position.count == 3, p.size.count == 3 else { continue }
                let hx = p.size[0] / 2, hy = p.size[1] / 2, hz = p.size[2] / 2
                minX = min(minX, p.position[0] - hx)
                maxX = max(maxX, p.position[0] + hx)
                minY = min(minY, p.position[1] - hy)
                maxY = max(maxY, p.position[1] + hy)
                minZ = min(minZ, p.position[2] - hz)
                maxZ = max(maxZ, p.position[2] + hz)
            }
            if minX == .infinity {
                return BBox(minX: -1, maxX: 1, minY: 0, maxY: 2, minZ: -1, maxZ: 1)
            }
            return BBox(minX: minX, maxX: maxX, minY: minY, maxY: maxY, minZ: minZ, maxZ: maxZ)
        }
    }
}
