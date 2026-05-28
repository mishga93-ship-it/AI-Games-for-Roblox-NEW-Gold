// RobloxAvatar3DViewer.swift — Phase A + Phase B (session 389+2).
//
// Interactive SceneKit viewer for a Roblox user's real 3D avatar (OBJ +
// MTL + PNG textures from /api/roblox-avatar/3d/:userId).
//
// Phase A: load avatar mesh, frame camera, orbit/zoom controls.
// Phase B: attach catalog asset meshes (hats / hair / accessories) on
// top of the avatar via /api/roblox-asset/3d/:assetId — real 3D
// per-slot try-on, no AI re-render. Position is best-effort per slot
// type since Roblox's standalone asset render uses arbitrary world
// coords (no rig attachment metadata in the OBJ).

import SwiftUI
import SceneKit

struct RobloxAvatar3DViewer: View {
    let robloxUserId: String
    /// Phase B — when non-empty, after the avatar loads we fetch each
    /// asset's 3D mesh and attach it to the scene with slot-specific
    /// positioning. Re-runs when the set changes (SwiftUI .id binding).
    var attachedAssets: [Attachment] = []

    struct Attachment: Hashable {
        let assetId: String
        /// Slot category — drives the placement offset on the avatar
        /// (hat → head top, accessory → torso, etc).
        let slot: String
    }

    @State private var loadState: LoadState = .loading
    @State private var attachmentTask: Task<Void, Never>? = nil

    enum LoadState {
        case loading
        case ready(SCNScene, Avatar3DURLs)
        case failed(String)
    }

    var body: some View {
        ZStack {
            LinearGradient(colors: [.black, Color(red: 0.06, green: 0.04, blue: 0.18), .black],
                           startPoint: .top, endPoint: .bottom)
            switch loadState {
            case .loading:
                VStack(spacing: 10) {
                    ProgressView().scaleEffect(1.3).tint(.white)
                    Text(loc(en: "Loading your 3D avatar…",
                             ru: "Загружаю 3D-аватара…"))
                        .font(.caption.bold()).foregroundColor(.white.opacity(0.85))
                }
            case .ready(let scene, _):
                SceneKitView(scene: scene)
                    .transition(.opacity)
            case .failed(let msg):
                VStack(spacing: 8) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.title).foregroundColor(.orange)
                    Text(loc(en: "3D avatar unavailable",
                             ru: "3D-аватар недоступен"))
                        .font(.caption.bold()).foregroundColor(.white)
                    Text(msg).font(.caption2).foregroundColor(.white.opacity(0.7))
                        .multilineTextAlignment(.center).padding(.horizontal, 16)
                    Button(action: { Task { await load() } }) {
                        Label(loc(en: "Retry", ru: "Повторить"), systemImage: "arrow.clockwise")
                            .font(.caption.bold()).padding(.horizontal, 12).padding(.vertical, 6)
                            .background(Color.white.opacity(0.12))
                            .foregroundColor(.white).clipShape(Capsule())
                    }
                }
            }
        }
        .task(id: robloxUserId) { await load() }
        .onChange(of: attachedAssets) { _, newValue in
            // Re-run attachment when the set changes (toggle on/off, add a
            // new item, remove one). Cancels any in-flight attachment task.
            applyAttachments(newValue)
        }
        .animation(.easeInOut(duration: 0.3), value: stateKey)
    }

    private var stateKey: String {
        switch loadState {
        case .loading:        return "loading"
        case .ready:          return "ready"
        case .failed(let m):  return "failed:\(m)"
        }
    }

    private func load() async {
        await MainActor.run { loadState = .loading }
        do {
            let urls = try await fetchAvatarURLs(userId: robloxUserId)
            let scene = try await Self.loadSceneOffMain(urls: urls)
            await MainActor.run {
                withAnimation { loadState = .ready(scene, urls) }
            }
            // Apply any initial attachments now that the scene is ready.
            applyAttachments(attachedAssets)
        } catch {
            await MainActor.run {
                loadState = .failed(error.localizedDescription)
            }
        }
    }

    private func fetchAvatarURLs(userId: String) async throws -> Avatar3DURLs {
        return try await APIClient.request(
            "api/roblox-avatar/3d/\(userId)",
            method: "GET",
            timeout: 30
        )
    }

    // MARK: - Phase B: attach catalog asset meshes

    private func applyAttachments(_ desired: [Attachment]) {
        attachmentTask?.cancel()
        guard case let .ready(scene, urls) = loadState else { return }

        // Remove any previously attached accessory nodes (named with the
        // "AccessoryAttachment-<assetId>" prefix). Then re-attach desired
        // items. This is simple and idempotent — fine for ~10 items per
        // outfit; if Phase C needs incremental diffing we can revisit.
        for child in scene.rootNode.childNodes
            where child.name?.hasPrefix("AccessoryAttachment-") == true {
                child.removeFromParentNode()
        }
        guard !desired.isEmpty else { return }

        attachmentTask = Task.detached(priority: .userInitiated) { [urls] in
            await Self.attachAll(desired: desired, in: scene, avatarAabb: urls.aabb)
        }
    }

    private static func attachAll(desired: [Attachment], in scene: SCNScene, avatarAabb: Avatar3DAABB) async {
        // Sequential attach so the user sees items pop in one-by-one
        // (parallel would all snap in at once and feel less alive).
        for att in desired {
            if Task.isCancelled { return }
            do {
                let urls = try await fetchAssetURLs(assetId: att.assetId)
                let node = try await loadAssetNodeOffMain(urls: urls, slot: att.slot, avatarAabb: avatarAabb, assetId: att.assetId)
                await MainActor.run {
                    if !Task.isCancelled {
                        // Fly-in animation: start scale 0.01, ease to 1.0.
                        node.scale = SCNVector3(0.01, 0.01, 0.01)
                        scene.rootNode.addChildNode(node)
                        let bounce = SCNAction.sequence([
                            SCNAction.scale(to: 1.05, duration: 0.28),
                            SCNAction.scale(to: 1.0, duration: 0.12),
                        ])
                        bounce.timingMode = .easeOut
                        node.runAction(bounce)
                    }
                }
            } catch {
                // Soft-fail per-item — Phase B just skips items that
                // don't have a 3D mesh on the asset-3d endpoint.
                print("[RobloxAvatar3D] attach failed for \(att.assetId): \(error.localizedDescription)")
            }
        }
    }

    private static func fetchAssetURLs(assetId: String) async throws -> Avatar3DURLs {
        // Backend returns the SAME shape for assets (assetId field instead
        // of userId — we ignore it). Decode into Avatar3DURLs by re-mapping.
        let raw: Asset3DURLs = try await APIClient.request(
            "api/roblox-asset/3d/\(assetId)",
            method: "GET",
            timeout: 25
        )
        return Avatar3DURLs(
            userId: raw.assetId,
            objUrl: raw.objUrl,
            mtlUrl: raw.mtlUrl,
            textureUrls: raw.textureUrls,
            camera: raw.camera,
            aabb: raw.aabb
        )
    }

    private static func loadAssetNodeOffMain(urls: Avatar3DURLs, slot: String, avatarAabb: Avatar3DAABB, assetId: String) async throws -> SCNNode {
        let tmpDir = try makeAvatarTempDir(userId: "asset-\(assetId)")

        async let objData    = downloadData(urls.objUrl)
        async let mtlData    = downloadData(urls.mtlUrl)
        async let textureFiles = downloadAllTextures(urls: urls.textureUrls, into: tmpDir)

        var objBytes = try await objData
        let mtlBytes = try await mtlData
        _ = try await textureFiles

        let mtllibLine = "mtllib avatar.mtl\n".data(using: .utf8) ?? Data()
        if !objBytes.starts(with: mtllibLine) {
            var fixed = Data(); fixed.append(mtllibLine); fixed.append(objBytes)
            objBytes = fixed
        }
        let objURL = tmpDir.appendingPathComponent("avatar.obj")
        let mtlURL = tmpDir.appendingPathComponent("avatar.mtl")
        try objBytes.write(to: objURL)
        try mtlBytes.write(to: mtlURL)

        guard let source = SCNSceneSource(url: objURL, options: [
            SCNSceneSource.LoadingOption.checkConsistency: true,
            SCNSceneSource.LoadingOption.createNormalsIfAbsent: true,
        ]) else {
            throw NSError(domain: "RobloxAsset3D", code: -1, userInfo: [
                NSLocalizedDescriptionKey: "SceneKit could not open asset OBJ",
            ])
        }
        let assetScene = try source.scene(options: nil)

        // Roblox asset OBJ uses arbitrary world coords (whatever the
        // standalone preview render decided). Re-center on its OWN aabb
        // so we can place it deliberately on the avatar afterward.
        let aabb = urls.aabb
        let center = SCNVector3(
            (aabb.min.x + aabb.max.x) / 2,
            (aabb.min.y + aabb.max.y) / 2,
            (aabb.min.z + aabb.max.z) / 2
        )
        let wrapper = SCNNode()
        wrapper.name = "AccessoryAttachment-\(assetId)"
        for child in assetScene.rootNode.childNodes {
            child.position = SCNVector3(
                child.position.x - center.x,
                child.position.y - center.y,
                child.position.z - center.z
            )
            wrapper.addChildNode(child)
        }

        // Position on the avatar — hardcoded slot offsets (Y in the
        // avatar-centered coord system). The avatar's own AABB tells us
        // approximate head/torso heights so accessories scale roughly
        // right across different avatars.
        let avatarHeight = avatarAabb.max.y - avatarAabb.min.y
        let yOffset = slotYOffset(slot: slot, avatarHeight: avatarHeight)
        wrapper.position = SCNVector3(0, yOffset, 0)

        return wrapper
    }

    /// Where on the avatar's vertical axis (in centered coords) to drop
    /// the accessory. Empirical values tuned for R-15 proportions.
    private static func slotYOffset(slot: String, avatarHeight: Double) -> Float {
        let h = Float(avatarHeight)
        switch slot.lowercased() {
        case "hair":              return h * 0.42   // top of head
        case "face":              return h * 0.36   // face area
        case "hat", "head":       return h * 0.45   // hat sits ON the head
        case "neck":              return h * 0.30
        case "shoulder":          return h * 0.28
        case "shirt", "jacket":   return h * 0.15   // torso center
        case "back":              return h * 0.18
        case "pants":             return -h * 0.10  // hip / legs
        case "shoes":             return -h * 0.38  // feet
        case "accessory":         return h * 0.20   // generic torso accessory
        case "aura":              return 0          // surrounds whole avatar
        default:                  return h * 0.20
        }
    }

    // MARK: - Avatar load (Phase A) — extracted helpers shared with Phase B

    private static func loadSceneOffMain(urls: Avatar3DURLs) async throws -> SCNScene {
        let tmpDir = try makeAvatarTempDir(userId: urls.userId)

        async let objData    = downloadData(urls.objUrl)
        async let mtlData    = downloadData(urls.mtlUrl)
        async let textureFiles = downloadAllTextures(urls: urls.textureUrls, into: tmpDir)

        var objBytes = try await objData
        let mtlBytes = try await mtlData
        _ = try await textureFiles

        let mtllibLine = "mtllib avatar.mtl\n".data(using: .utf8) ?? Data()
        if !objBytes.starts(with: mtllibLine) {
            var fixed = Data(); fixed.append(mtllibLine); fixed.append(objBytes)
            objBytes = fixed
        }

        let objURL = tmpDir.appendingPathComponent("avatar.obj")
        let mtlURL = tmpDir.appendingPathComponent("avatar.mtl")
        try objBytes.write(to: objURL)
        try mtlBytes.write(to: mtlURL)

        guard let source = SCNSceneSource(url: objURL, options: [
            SCNSceneSource.LoadingOption.checkConsistency: true,
            SCNSceneSource.LoadingOption.createNormalsIfAbsent: true,
        ]) else {
            throw NSError(domain: "RobloxAvatar3D", code: -1, userInfo: [
                NSLocalizedDescriptionKey: "SceneKit could not open OBJ",
            ])
        }
        let scene = try source.scene(options: nil)

        // Center via aabb (Roblox OBJ has feet offset from y=0).
        let aabb = urls.aabb
        let center = SCNVector3(
            (aabb.min.x + aabb.max.x) / 2,
            (aabb.min.y + aabb.max.y) / 2,
            (aabb.min.z + aabb.max.z) / 2
        )
        let rootContainer = SCNNode()
        rootContainer.name = "AvatarRoot"
        for child in scene.rootNode.childNodes {
            child.position = SCNVector3(
                child.position.x - center.x,
                child.position.y - center.y,
                child.position.z - center.z
            )
            rootContainer.addChildNode(child)
        }
        scene.rootNode.addChildNode(rootContainer)

        // 3-point lighting.
        let key = SCNNode()
        key.light = SCNLight()
        key.light?.type = .directional
        key.light?.intensity = 900
        key.light?.color = UIColor.white
        key.eulerAngles = SCNVector3(-Float.pi / 4, Float.pi / 6, 0)
        scene.rootNode.addChildNode(key)

        let fill = SCNNode()
        fill.light = SCNLight()
        fill.light?.type = .directional
        fill.light?.intensity = 500
        fill.light?.color = UIColor(red: 0.7, green: 0.8, blue: 1.0, alpha: 1.0)
        fill.eulerAngles = SCNVector3(0, -Float.pi / 4, 0)
        scene.rootNode.addChildNode(fill)

        let ambient = SCNNode()
        ambient.light = SCNLight()
        ambient.light?.type = .ambient
        ambient.light?.intensity = 350
        scene.rootNode.addChildNode(ambient)

        // Camera.
        let camera = SCNNode()
        camera.camera = SCNCamera()
        camera.camera?.fieldOfView = CGFloat(urls.camera.fov > 0 ? urls.camera.fov : 28.36)
        let height = Float(aabb.max.y - aabb.min.y)
        let width  = Float(aabb.max.x - aabb.min.x)
        let depth  = Float(aabb.max.z - aabb.min.z)
        let radius = max(height, width, depth)
        let distance = max(radius * 2.2, 6.0)
        camera.position = SCNVector3(0, 0, distance)
        camera.look(at: SCNVector3(0, 0, 0))
        scene.rootNode.addChildNode(camera)

        return scene
    }

    private static func downloadData(_ urlString: String) async throws -> Data {
        guard let url = URL(string: urlString) else {
            throw URLError(.badURL)
        }
        let (data, response) = try await URLSession.shared.data(from: url)
        if let http = response as? HTTPURLResponse, http.statusCode >= 400 {
            throw URLError(.badServerResponse,
                           userInfo: [NSLocalizedDescriptionKey: "HTTP \(http.statusCode) for \(url)"])
        }
        return data
    }

    private static func downloadAllTextures(urls: [String], into dir: URL) async throws -> [URL] {
        try await withThrowingTaskGroup(of: URL.self) { group in
            for (i, urlStr) in urls.enumerated() {
                let dest = dir.appendingPathComponent("\(i).png")
                group.addTask {
                    let bytes = try await downloadData(urlStr)
                    try bytes.write(to: dest)
                    return dest
                }
            }
            var results: [URL] = []
            for try await u in group { results.append(u) }
            return results
        }
    }

    private static func makeAvatarTempDir(userId: String) throws -> URL {
        let base = FileManager.default.temporaryDirectory
            .appendingPathComponent("roblox-avatar-3d", isDirectory: true)
            .appendingPathComponent("\(userId)-\(Int(Date().timeIntervalSince1970))", isDirectory: true)
        try FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
        return base
    }
}

// MARK: - Wire types (mirror backend RobloxAvatar3DUrls / RobloxAsset3DUrls)

struct Avatar3DURLs: Decodable {
    let userId: String
    let objUrl: String
    let mtlUrl: String
    let textureUrls: [String]
    let camera: Avatar3DCamera
    let aabb: Avatar3DAABB
}

struct Asset3DURLs: Decodable {
    let assetId: String
    let objUrl: String
    let mtlUrl: String
    let textureUrls: [String]
    let camera: Avatar3DCamera
    let aabb: Avatar3DAABB
}

struct Avatar3DCamera: Decodable {
    let position: Avatar3DVec3
    let direction: Avatar3DVec3
    let fov: Double
}

struct Avatar3DAABB: Decodable {
    let min: Avatar3DVec3
    let max: Avatar3DVec3
}

struct Avatar3DVec3: Decodable {
    let x: Double
    let y: Double
    let z: Double
}

// MARK: - SceneKit UIKit bridge

private struct SceneKitView: UIViewRepresentable {
    let scene: SCNScene

    func makeUIView(context: Context) -> SCNView {
        let view = SCNView()
        view.scene = scene
        view.allowsCameraControl = true
        view.autoenablesDefaultLighting = false
        view.backgroundColor = .clear
        view.antialiasingMode = .multisampling4X
        view.preferredFramesPerSecond = 60
        view.defaultCameraController.interactionMode = .orbitTurntable
        view.defaultCameraController.inertiaEnabled = true
        return view
    }

    func updateUIView(_ uiView: SCNView, context: Context) {
        if uiView.scene !== scene { uiView.scene = scene }
    }
}
