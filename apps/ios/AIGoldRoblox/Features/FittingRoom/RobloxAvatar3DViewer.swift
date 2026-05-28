// RobloxAvatar3DViewer.swift — Phase A (session 389+1).
//
// Interactive SceneKit viewer for a Roblox user's real 3D avatar (OBJ +
// MTL + PNG textures from the public avatar-3d endpoint, proxied through
// our /api/roblox-avatar/3d/:userId).
//
// Pipeline (all on a background actor; main only renders progress):
//   1. GET /api/roblox-avatar/3d/:userId → { objUrl, mtlUrl, textureUrls,
//      camera, aabb }.
//   2. Download OBJ + MTL + each texture into a fresh temp directory.
//   3. Prepend `mtllib avatar.mtl` to the OBJ (Roblox omits this line, so
//      SceneKit's OBJ importer wouldn't otherwise find materials).
//   4. Load the OBJ via SCNSceneSource. SceneKit walks the mtllib +
//      relative texture paths from the same directory.
//   5. Frame the scene with the camera/aabb from step 1 + enable
//      allowsCameraControl for native rotate / zoom.
//
// Phase B will add per-slot accessory swap on top of this scene; the
// viewer owns the SCNScene so future swaps can manipulate child nodes
// directly without reloading the avatar.

import SwiftUI
import SceneKit

struct RobloxAvatar3DViewer: View {
    let robloxUserId: String

    @State private var loadState: LoadState = .loading

    enum LoadState {
        case loading
        case ready(SCNScene, Avatar3DURLs)
        case failed(String)
    }

    var body: some View {
        ZStack {
            // Subtle backdrop so the SceneView reads as a "stage", not
            // a transparent window.
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

    /// All download + SceneKit work happens on a background actor so we
    /// never block the main thread (OBJ parsing for an R-15 avatar is
    /// ~80-150 ms — small but still off the main run loop).
    private static func loadSceneOffMain(urls: Avatar3DURLs) async throws -> SCNScene {
        let tmpDir = try makeAvatarTempDir(userId: urls.userId)
        defer {
            // Best-effort cleanup AFTER scene is loaded (SceneKit slurps
            // texture references at load time, so files are no longer
            // needed once SCNSceneSource returns).
        }

        // Download OBJ, MTL, textures in parallel for speed.
        async let objData    = downloadData(urls.objUrl)
        async let mtlData    = downloadData(urls.mtlUrl)
        async let textureFiles = downloadAllTextures(urls: urls.textureUrls, into: tmpDir)

        var objBytes = try await objData
        let mtlBytes = try await mtlData
        _ = try await textureFiles

        // Roblox OBJ doesn't reference its MTL — prepend the directive so
        // SceneKit picks up materials automatically.
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
        let scene: SCNScene
        do {
            scene = try source.scene(options: nil)
        } catch {
            throw error
        }

        // Roblox OBJ is offset in Y by a few units (avatar feet are NOT
        // at y=0); we center via the AABB so the camera frames it nicely.
        let aabb = urls.aabb
        let center = SCNVector3(
            (aabb.min.x + aabb.max.x) / 2,
            (aabb.min.y + aabb.max.y) / 2,
            (aabb.min.z + aabb.max.z) / 2
        )
        let rootContainer = SCNNode()
        for child in scene.rootNode.childNodes {
            child.position = SCNVector3(
                child.position.x - center.x,
                child.position.y - center.y,
                child.position.z - center.z
            )
            rootContainer.addChildNode(child)
        }
        scene.rootNode.addChildNode(rootContainer)

        // Soft 3-point lighting for the avatar — without this the OBJ
        // textures look flat against the dark backdrop.
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

        // Camera — Roblox sends a position/direction but it assumes its
        // own world coords. After centering we just frame the avatar at a
        // safe distance based on the AABB diagonal.
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

// MARK: - Wire types (mirror backend RobloxAvatar3DUrls)

struct Avatar3DURLs: Decodable {
    let userId: String
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
        view.allowsCameraControl = true   // native one-finger orbit + pinch zoom
        view.autoenablesDefaultLighting = false  // we set our own lighting above
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
