import SwiftUI
import SceneKit
import UIKit

/// Decoded BlockyPetSpec sent from the backend in
/// `GenerationArtifact.metadata.blockyPetSpecJSON`. The shape matches
/// apps/functions/src/types.ts:BlockyPetSpec.
struct BlockyPetSpecPayload: Decodable {
    let name: String?
    let rig: String?
    let material: String?
    let height: Double?
    let colors: Colors
    let parts: [Part]
    let joints: [Joint]?
    let decals: [Decal]?

    struct Colors: Decodable {
        let primary: String
        let secondary: String?
        let accent: String?
        let eye: String?
    }
    struct Part: Decodable {
        let name: String
        let shape: String          // "Block"|"Ball"|"Cylinder"|"Wedge"|"CornerWedge"
        let size: [Double]         // [x, y, z]
        let position: [Double]     // [x, y, z]
        let rotation: [Double]?    // [rx, ry, rz] in degrees
        let color: String          // "primary"|"secondary"|"accent"|"eye"|BrickColor literal
        let material: String?
        let role: String?
    }
    struct Joint: Decodable {
        let name: String
        let part0: String
        let part1: String
    }
    struct Decal: Decodable {
        let part: String
        let face: String
        let imagePrompt: String?
        let textureId: String?
    }

    static func decode(from jsonString: String) -> BlockyPetSpecPayload? {
        guard let data = jsonString.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(BlockyPetSpecPayload.self, from: data)
    }
}

/// Interactive 3D pet preview. Reconstructs the blocky pet from its
/// BlockyPetSpec using SCNNode primitives (SCNBox / SCNSphere /
/// SCNCylinder) — no .rbxm parsing required since the pet IS just
/// procedural primitives. User can rotate / pinch-zoom via SceneKit's
/// default camera controls.
struct BlockyPet3DSceneView: UIViewRepresentable {
    let spec: BlockyPetSpecPayload
    /// Element name from artifact metadata. Used to tint the egg-style
    /// rim light + the floor disc so the preview reads as e.g. fiery,
    /// icy, etc.
    let element: String

    func makeUIView(context: Context) -> SCNView {
        let scnView = SCNView()
        scnView.scene = SCNScene()
        scnView.allowsCameraControl = true
        scnView.backgroundColor = .clear
        scnView.autoenablesDefaultLighting = false
        scnView.antialiasingMode = .multisampling4X
        context.coordinator.build(scene: scnView.scene!, spec: spec, element: element)
        return scnView
    }

    func updateUIView(_ uiView: SCNView, context: Context) {
        // Rebuild only if spec identity changed (cheap pointer-eq check via parts count + name).
        if context.coordinator.lastSpecSignature != context.coordinator.signature(for: spec) {
            uiView.scene = SCNScene()
            context.coordinator.build(scene: uiView.scene!, spec: spec, element: element)
        }
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    final class Coordinator {
        var lastSpecSignature: String = ""

        func signature(for spec: BlockyPetSpecPayload) -> String {
            "\(spec.name ?? "")-\(spec.parts.count)-\(spec.parts.first?.name ?? "")"
        }

        func build(scene: SCNScene, spec: BlockyPetSpecPayload, element: String) {
            lastSpecSignature = signature(for: spec)
            setupLighting(scene: scene, element: element)
            setupCamera(scene: scene, spec: spec)
            setupFloor(scene: scene, element: element)
            buildPet(scene: scene, spec: spec)
        }

        // MARK: - Scene setup

        private func setupLighting(scene: SCNScene, element: String) {
            let ambient = SCNNode()
            ambient.light = SCNLight()
            ambient.light?.type = .ambient
            ambient.light?.intensity = 420
            ambient.light?.color = UIColor(white: 1.0, alpha: 1)
            scene.rootNode.addChildNode(ambient)

            let key = SCNNode()
            key.light = SCNLight()
            key.light?.type = .omni
            key.light?.intensity = 1100
            key.position = SCNVector3(4, 6, 5)
            scene.rootNode.addChildNode(key)

            let rim = SCNNode()
            rim.light = SCNLight()
            rim.light?.type = .omni
            rim.light?.intensity = 700
            rim.light?.color = elementColor(element)
            rim.position = SCNVector3(-4, 3, -4)
            scene.rootNode.addChildNode(rim)

            scene.background.contents = UIColor.clear
        }

        private func setupCamera(scene: SCNScene, spec: BlockyPetSpecPayload) {
            // Aim the camera at the model centroid so big and small pets
            // both frame nicely. Distance is proportional to bounding-box
            // height — bigger pets pull camera further.
            let bbox = computeBoundingBox(spec: spec)
            let height = max(2.0, bbox.maxY - bbox.minY)
            let radius = max(2.0, max(bbox.maxX - bbox.minX, bbox.maxZ - bbox.minZ))
            let camDist = max(height, radius) * 3.0

            let cam = SCNNode()
            cam.camera = SCNCamera()
            cam.camera?.fieldOfView = 38
            cam.camera?.zNear = 0.1
            cam.camera?.zFar = 200
            let centerY = (bbox.minY + bbox.maxY) * 0.5
            cam.position = SCNVector3(0, centerY + height * 0.3, camDist)
            cam.look(at: SCNVector3(0, centerY, 0))
            scene.rootNode.addChildNode(cam)
        }

        private func setupFloor(scene: SCNScene, element: String) {
            // Subtle dark disc beneath the pet so it doesn't float in
            // empty space. Tinted by element so it reads as e.g. fiery
            // orange or icy cyan.
            let floor = SCNFloor()
            floor.reflectivity = 0.0
            let floorNode = SCNNode(geometry: floor)
            let mat = floor.firstMaterial!
            mat.diffuse.contents = UIColor.black.withAlphaComponent(0.18)
            mat.transparency = 0.9
            floorNode.position = SCNVector3(0, 0, 0)
            scene.rootNode.addChildNode(floorNode)

            // Element-colored "energy ring" right at the base.
            let ring = SCNTorus(ringRadius: 1.8, pipeRadius: 0.04)
            ring.firstMaterial?.diffuse.contents = elementColor(element)
            ring.firstMaterial?.emission.contents = elementColor(element)
            ring.firstMaterial?.emission.intensity = 0.45
            let ringNode = SCNNode(geometry: ring)
            ringNode.position = SCNVector3(0, 0.02, 0)
            scene.rootNode.addChildNode(ringNode)
        }

        // MARK: - Pet construction

        private func buildPet(scene: SCNScene, spec: BlockyPetSpecPayload) {
            let petRoot = SCNNode()
            petRoot.name = "PetRoot"
            scene.rootNode.addChildNode(petRoot)

            for part in spec.parts {
                guard part.size.count == 3, part.position.count == 3 else { continue }
                let node = SCNNode(geometry: makeGeometry(part: part, spec: spec))
                node.name = part.name
                node.position = SCNVector3(part.position[0], part.position[1], part.position[2])
                if let rot = part.rotation, rot.count == 3 {
                    node.eulerAngles = SCNVector3(
                        Float(rot[0]) * .pi / 180,
                        Float(rot[1]) * .pi / 180,
                        Float(rot[2]) * .pi / 180
                    )
                }
                petRoot.addChildNode(node)
            }

            // Idle spin so the user immediately sees the pet is 3D, even
            // before they touch the screen to orbit it manually.
            let spin = SCNAction.repeatForever(
                SCNAction.rotateBy(x: 0, y: .pi * 2, z: 0, duration: 18)
            )
            petRoot.runAction(spin, forKey: "idle_spin")
        }

        private func makeGeometry(part: BlockyPetSpecPayload.Part, spec: BlockyPetSpecPayload) -> SCNGeometry {
            let sx = CGFloat(part.size[0])
            let sy = CGFloat(part.size[1])
            let sz = CGFloat(part.size[2])

            let geometry: SCNGeometry
            switch part.shape {
            case "Ball":
                let r = min(sx, sy, sz) / 2
                geometry = SCNSphere(radius: r)
            case "Cylinder":
                // In Roblox, Part.Shape=Cylinder lies along the X axis with
                // length = Size.X and diameter = max(Size.Y, Size.Z). SCNCylinder
                // by default stands along Y, so the consumer rotates via the
                // part.rotation (already pre-baked in spec for vertical pillars).
                let r = max(sy, sz) / 2
                geometry = SCNCylinder(radius: r, height: sx)
            case "Wedge", "CornerWedge":
                geometry = makeWedge(sx: sx, sy: sy, sz: sz, corner: part.shape == "CornerWedge")
            default: // "Block"
                geometry = SCNBox(width: sx, height: sy, length: sz, chamferRadius: 0.02)
            }

            let mat = SCNMaterial()
            mat.diffuse.contents = resolveColor(slot: part.color, spec: spec)
            mat.metalness.contents = part.material == "Metal" ? 0.6 : 0.0
            mat.roughness.contents = (part.material == "Neon" || part.material == "ForceField") ? 0.05 : 0.7
            if part.material == "Neon" {
                mat.emission.contents = resolveColor(slot: part.color, spec: spec)
                mat.emission.intensity = 0.7
            }
            geometry.firstMaterial = mat
            return geometry
        }

        private func makeWedge(sx: CGFloat, sy: CGFloat, sz: CGFloat, corner: Bool) -> SCNGeometry {
            // A Roblox WedgePart is a triangular prism: front face (toward
            // -Z in part-local) is a tall rectangle, back face slopes down
            // to the bottom-back edge. We construct via custom geometry —
            // 6 vertices for a wedge, 8 triangles total (top sloped quad
            // + bottom quad + 3 side faces).
            let hx = Float(sx / 2), hy = Float(sy / 2), hz = Float(sz / 2)
            let v: [SCNVector3] = [
                SCNVector3(-hx, -hy, -hz), // 0: bottom-left-back
                SCNVector3( hx, -hy, -hz), // 1: bottom-right-back
                SCNVector3( hx, -hy,  hz), // 2: bottom-right-front
                SCNVector3(-hx, -hy,  hz), // 3: bottom-left-front
                SCNVector3(-hx,  hy, -hz), // 4: top-left-back   (high edge)
                SCNVector3( hx,  hy, -hz), // 5: top-right-back  (high edge)
            ]
            // Triangles (CCW from outside).
            let idx: [Int32] = [
                // bottom (looking down Y- → CCW from below)
                0,2,1,  0,3,2,
                // back face (Z- face, full rectangle)
                0,1,5,  0,5,4,
                // sloped top (back-high edge → front-bottom edge)
                4,5,2,  4,2,3,
                // left side (triangle)
                0,4,3,
                // right side (triangle)
                1,2,5,
            ]
            _ = corner // corner-wedge variant left as plain wedge for v1; visually adjacent
            let vertexSource = SCNGeometrySource(vertices: v)
            let element = SCNGeometryElement(indices: idx, primitiveType: .triangles)
            return SCNGeometry(sources: [vertexSource], elements: [element])
        }

        // MARK: - Color mapping

        private func resolveColor(slot: String, spec: BlockyPetSpecPayload) -> UIColor {
            // 1. Try named slots first.
            switch slot.lowercased() {
            case "primary":   return brickColor(spec.colors.primary)
            case "secondary": return brickColor(spec.colors.secondary ?? spec.colors.primary)
            case "accent":    return brickColor(spec.colors.accent ?? spec.colors.primary)
            case "eye":       return brickColor(spec.colors.eye ?? "Really black")
            default:
                // 2. Treat as a BrickColor literal.
                return brickColor(slot)
            }
        }

        /// Maps a Roblox BrickColor name to UIColor. Only handles colors
        /// commonly emitted by buildBlockyPetManifest's fallback specs —
        /// if a name doesn't match, falls back to a neutral grey.
        private func brickColor(_ name: String) -> UIColor {
            switch name {
            case "Really black":            return UIColor(white: 0.07, alpha: 1)
            case "Black":                   return UIColor(white: 0.12, alpha: 1)
            case "Really red", "Bright red": return UIColor(red: 0.77, green: 0.13, blue: 0.13, alpha: 1)
            case "Bright orange":           return UIColor(red: 0.85, green: 0.52, blue: 0.25, alpha: 1)
            case "Deep orange":             return UIColor(red: 1.00, green: 0.39, blue: 0.00, alpha: 1)
            case "Bright yellow":           return UIColor(red: 0.96, green: 0.80, blue: 0.19, alpha: 1)
            case "Cool yellow":             return UIColor(red: 0.99, green: 0.91, blue: 0.55, alpha: 1)
            case "Bright green":            return UIColor(red: 0.30, green: 0.62, blue: 0.16, alpha: 1)
            case "Lime green":              return UIColor(red: 0.65, green: 0.86, blue: 0.18, alpha: 1)
            case "Bright blue":             return UIColor(red: 0.05, green: 0.41, blue: 0.66, alpha: 1)
            case "Medium blue":             return UIColor(red: 0.43, green: 0.60, blue: 0.79, alpha: 1)
            case "Pastel blue":             return UIColor(red: 0.60, green: 0.78, blue: 0.86, alpha: 1)
            case "Bright violet":           return UIColor(red: 0.42, green: 0.20, blue: 0.62, alpha: 1)
            case "Bright purple":           return UIColor(red: 0.65, green: 0.20, blue: 0.78, alpha: 1)
            case "Pink":                    return UIColor(red: 1.00, green: 0.60, blue: 0.80, alpha: 1)
            case "Hot pink":                return UIColor(red: 1.00, green: 0.40, blue: 0.70, alpha: 1)
            case "White":                   return UIColor(white: 0.95, alpha: 1)
            case "Institutional white":     return UIColor(white: 0.95, alpha: 1)
            case "Mid gray", "Medium stone grey", "Medium grey": return UIColor(white: 0.55, alpha: 1)
            case "Dark stone grey":         return UIColor(white: 0.35, alpha: 1)
            case "Brown", "CGA brown":      return UIColor(red: 0.45, green: 0.28, blue: 0.14, alpha: 1)
            case "Reddish brown":           return UIColor(red: 0.42, green: 0.20, blue: 0.10, alpha: 1)
            case "Nougat":                  return UIColor(red: 0.80, green: 0.56, blue: 0.41, alpha: 1)
            case "Cyan", "Toothpaste":      return UIColor(red: 0.20, green: 0.78, blue: 0.85, alpha: 1)
            case "Teal":                    return UIColor(red: 0.10, green: 0.60, blue: 0.60, alpha: 1)
            case "Gold":                    return UIColor(red: 0.86, green: 0.69, blue: 0.20, alpha: 1)
            case "Silver":                  return UIColor(white: 0.78, alpha: 1)
            default:                        return UIColor(white: 0.6, alpha: 1)
            }
        }

        private func elementColor(_ element: String) -> UIColor {
            switch element.lowercased() {
            case "fire":   return UIColor(red: 1.00, green: 0.55, blue: 0.10, alpha: 1)
            case "ice":    return UIColor(red: 0.55, green: 0.85, blue: 1.00, alpha: 1)
            case "shadow": return UIColor(red: 0.35, green: 0.10, blue: 0.45, alpha: 1)
            case "light":  return UIColor(red: 1.00, green: 1.00, blue: 0.55, alpha: 1)
            case "nature": return UIColor(red: 0.45, green: 1.00, blue: 0.45, alpha: 1)
            case "tech":   return UIColor(red: 0.00, green: 0.90, blue: 1.00, alpha: 1)
            default:       return UIColor(white: 0.85, alpha: 1)
            }
        }

        // MARK: - Bounding box

        private struct BBox { let minX, maxX, minY, maxY, minZ, maxZ: Double }
        private func computeBoundingBox(spec: BlockyPetSpecPayload) -> BBox {
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
            if minX == .infinity {  // no parts
                return BBox(minX: -1, maxX: 1, minY: 0, maxY: 2, minZ: -1, maxZ: 1)
            }
            return BBox(minX: minX, maxX: maxX, minY: minY, maxY: maxY, minZ: minZ, maxZ: maxZ)
        }
    }
}
