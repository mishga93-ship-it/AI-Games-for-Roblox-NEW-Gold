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
    /// Source of the base R-15 mesh. `.realUser` fetches the user's
    /// Roblox-rendered OBJ (includes their current outfit). `.mannequin`
    /// loads a bundled blank R-15 (Roblox's official Classic mannequin,
    /// pre-converted to .scn at build time) so accessory try-on doesn't
    /// double-stack with whatever the user is wearing. Phase O2-P1.
    enum Source: Equatable {
        case realUser(userId: String)
        case mannequin(BodyType)

        enum BodyType: Equatable {
            case neutral, man, woman
            var sceneName: String {
                switch self {
                case .neutral: return "basic"
                case .man:     return "R15_men"
                case .woman:   return "women"
                }
            }
        }

        /// Identity key used for SwiftUI .task(id:) so view re-loads on
        /// source change but not on unrelated state changes.
        var idKey: String {
            switch self {
            case .realUser(let uid):      return "user:\(uid)"
            case .mannequin(let bt):      return "mannequin:\(bt.sceneName)"
            }
        }
    }

    var source: Source
    /// Phase B — when non-empty, after the avatar loads we fetch each
    /// asset's 3D mesh and attach it to the scene with slot-specific
    /// positioning. Re-runs when the set changes (SwiftUI .id binding).
    var attachedAssets: [Attachment] = []
    /// Phase O2-P4 — classic clothing textures (shirt / pants / tshirt)
    /// to overlay on the mannequin's R-15 body materials. Roblox shirts
    /// don't have 3D meshes — they're 2D textures that wrap the torso /
    /// arms / legs UV layout. iOS fetches the PNG from
    /// /api/roblox-clothing/texture/:assetId, then patches the relevant
    /// SCNNode materials with `.diffuse.contents = UIImage`.
    /// Ignored in `.realUser` mode (the Roblox-rendered OBJ already has
    /// the user's clothing baked in as textures).
    var clothingTextures: [ClothingTexture] = []

    struct ClothingTexture: Hashable {
        let assetId: String
        /// "shirt" / "pants" / "tshirt".
        let type: String
    }

    /// Convenience initialiser that preserves the original Phase A
    /// `RobloxAvatar3DViewer(robloxUserId:)` call shape so existing call
    /// sites in FittingRoomResultView keep working without churn.
    init(robloxUserId: String, attachedAssets: [Attachment] = [],
         clothingTextures: [ClothingTexture] = []) {
        self.source = .realUser(userId: robloxUserId)
        self.attachedAssets = attachedAssets
        self.clothingTextures = clothingTextures
    }

    /// Phase O2-P1 init — bundled mannequin mode (no Roblox round-trip).
    init(mannequin body: Source.BodyType, attachedAssets: [Attachment] = [],
         clothingTextures: [ClothingTexture] = []) {
        self.source = .mannequin(body)
        self.attachedAssets = attachedAssets
        self.clothingTextures = clothingTextures
    }

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
        .task(id: source.idKey) { await load() }
        .onChange(of: attachedAssets) { _, newValue in
            // Re-run attachment when the set changes (toggle on/off, add a
            // new item, remove one). Cancels any in-flight attachment task.
            applyAttachments(newValue)
        }
        .onChange(of: clothingTextures) { _, newValue in
            // Re-apply clothing textures on slot swap / mannequin toggle.
            applyClothingTextures(newValue)
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
            let scene: SCNScene
            let urls: Avatar3DURLs
            switch source {
            case .realUser(let userId):
                urls = try await fetchAvatarURLs(userId: userId)
                scene = try await Self.loadSceneOffMain(urls: urls)
            case .mannequin(let body):
                // Bundled R-15 SCN — instant, offline, GUARANTEED no
                // accessories on top (clean dress-up base). The mannequin
                // path bypasses the rbxcdn round-trip entirely.
                let (loaded, fakeUrls) = try await Self.loadMannequinSceneOffMain(body: body)
                scene = loaded
                urls = fakeUrls
            }
            await MainActor.run {
                Self.startIdleBob(on: scene)
                withAnimation { loadState = .ready(scene, urls) }
            }
            // Apply any initial attachments now that the scene is ready.
            applyAttachments(attachedAssets)
            // Phase O2-P4 — apply classic clothing texture overlays (only
            // mannequin mode; real-avatar OBJ already has clothing baked).
            if case .mannequin = source {
                applyClothingTextures(clothingTextures)
            }
        } catch {
            await MainActor.run {
                loadState = .failed(error.localizedDescription)
            }
        }
    }

    /// Phase C3-anim — kick off the avatar's idle "breathing" bob. Must
    /// run on MainActor (SCNNode.runAction is MainActor-isolated under
    /// Swift 6 strict concurrency).
    @MainActor
    private static func startIdleBob(on scene: SCNScene) {
        guard let avatarRoot = scene.rootNode.childNode(withName: "AvatarRoot", recursively: false)
        else { return }
        let bobUp = SCNAction.moveBy(x: 0, y: 0.1, z: 0, duration: 1.6)
        bobUp.timingMode = .easeInEaseOut
        let bobDown = SCNAction.moveBy(x: 0, y: -0.1, z: 0, duration: 1.6)
        bobDown.timingMode = .easeInEaseOut
        avatarRoot.runAction(SCNAction.repeatForever(SCNAction.sequence([bobUp, bobDown])))
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

        // Accessories live INSIDE the AvatarRoot node so the idle-bob
        // animation translates them along with the avatar (otherwise
        // hat/hair would visibly detach as the body bobs up and down).
        let avatarRoot = scene.rootNode.childNode(withName: "AvatarRoot", recursively: false)
            ?? scene.rootNode

        // Remove previously attached accessory nodes.
        for child in avatarRoot.childNodes
            where child.name?.hasPrefix("AccessoryAttachment-") == true {
                child.removeFromParentNode()
        }
        guard !desired.isEmpty else { return }

        attachmentTask = Task.detached(priority: .userInitiated) { [urls] in
            await Self.attachAll(desired: desired, into: avatarRoot, avatarAabb: urls.aabb)
        }
    }

    // MARK: - Phase O2-P4: classic clothing texture overlays

    private func applyClothingTextures(_ desired: [ClothingTexture]) {
        guard case .mannequin = source else { return }   // only mannequin
        guard case let .ready(scene, urls) = loadState else { return }
        let avatarRoot = scene.rootNode.childNode(withName: "AvatarRoot", recursively: false)
            ?? scene.rootNode
        // Phase O2-P4-fix (user feedback «пропал перс после накладке
        // элементов»): don't pre-reset body-part materials. The previous
        // `material.diffuse.contents = UIColor(white: 0.8)` overwrote the
        // mannequin's original skin/texture state and — combined with
        // the transparent regions in Roblox shirt/pants PNGs — made the
        // body invisible. Now we leave all originals untouched and ONLY
        // modify the materials of parts that get clothing applied. "Take
        // off" → re-toggle is the only way to clear clothing right now;
        // restoring originals across swaps would need an original-state
        // snapshot at scene-load time (future polish).
        guard !desired.isEmpty else { return }

        Task.detached(priority: .userInitiated) {
            await Self.fetchAndApplyAll(desired: desired, in: avatarRoot, avatarAabb: urls.aabb)
        }
    }

    private static func fetchAndApplyAll(desired: [ClothingTexture], in avatarRoot: SCNNode, avatarAabb: Avatar3DAABB) async {
        for piece in desired {
            do {
                let resp: ClothingTextureResp = try await APIClient.request(
                    "api/roblox-clothing/texture/\(piece.assetId)?type=\(piece.type)",
                    method: "GET",
                    timeout: 25
                )
                guard let url = URL(string: resp.pngUrl) else { continue }
                let (data, _) = try await URLSession.shared.data(from: url)
                guard let image = UIImage(data: data) else { continue }
                await MainActor.run {
                    applyTextureToBody(image: image, type: piece.type,
                                       in: avatarRoot, avatarAabb: avatarAabb)
                }
            } catch {
                print("[RobloxAvatar3D] clothing fetch failed for \(piece.assetId) (\(piece.type)): \(error.localizedDescription)")
            }
        }
    }

    /// Apply a Roblox classic-clothing PNG to the R-15 body parts whose
    /// vertical position matches the garment. The bundled mannequin OBJ
    /// puts each Rig# group as a separate child node; we identify upper
    /// vs lower body via bbox center Y on the centered avatar axis
    /// (positive = upper). Roblox's PNG templates are UV-aware (the
    /// shirt wraps torso + arms via standard 4-rectangle layout, pants
    /// covers legs), so setting the PNG as the diffuse map on the
    /// right materials gives a visually correct wrap.
    @MainActor
    private static func applyTextureToBody(image: UIImage, type: String, in avatarRoot: SCNNode, avatarAabb: Avatar3DAABB) {
        // After centering, the avatar Y axis runs -h/2 .. +h/2. Anything
        // above 0 is upper body (torso + arms); below 0 is legs.
        //
        // Robust head detection (user feedback 2026-05-28 «футболка на
        // голове» — shirt template watermark visible on head): instead
        // of a hard Y threshold (h*0.30 was sometimes too high,
        // sometimes too low across asset variants), we DYNAMICALLY pick
        // the body part with the highest Y centre — by definition the
        // head — and exclude it from all clothing. Same dynamic
        // approach for feet (lowest Y) so shoes don't get pants
        // textures.
        let _ = avatarAabb // (unused here now; kept for signature compat)
        let upperLowerSplit: Float = 0
        let bodyParts = avatarRoot.childNodes.filter {
            $0.geometry != nil && $0.name?.hasPrefix("AccessoryAttachment-") != true
        }
        // Y centre for each body part (geometry local centre + node offset).
        let partYs: [(node: SCNNode, y: Float)] = bodyParts.map { node in
            let (lmin, lmax) = node.geometry!.boundingBox
            return (node, (lmin.y + lmax.y) / 2 + node.position.y)
        }
        let headNode  = partYs.max(by: { $0.y < $1.y })?.node
        let chestY    = partYs.filter { $0.node !== headNode && $0.y > 0 }
            .map { $0.y }.min() ?? 0

        for (child, worldCenterY) in partYs {
            // Never put clothing on the head.
            if child === headNode { continue }
            let isUpper = worldCenterY > upperLowerSplit
            let isLower = worldCenterY <= upperLowerSplit
            let shouldApply: Bool
            switch type.lowercased() {
            case "shirt":  shouldApply = isUpper
            case "pants":  shouldApply = isLower
            case "tshirt": shouldApply = isUpper && worldCenterY > chestY * 0.5
            default:       shouldApply = false
            }
            if shouldApply {
                let geom = child.geometry!
                // Roblox clothing PNGs are RGBA with TRANSPARENT regions
                // (the unused parts of the 4-rectangle template layout).
                // If we apply the raw PNG, body parts whose UVs sample
                // transparent pixels become INVISIBLE — that's why the
                // user reported «пропал перс после накладке элементов».
                // Composite the PNG over an opaque skin-tone fill so
                // alpha=0 regions render as skin instead of see-through.
                let opaqueImage = compositeOnSkinBackground(image)
                // Clone the material so setting diffuse on this body
                // part doesn't propagate to others sharing the source.
                let newMaterials = geom.materials.map { src -> SCNMaterial in
                    let clone = src.copy() as? SCNMaterial ?? SCNMaterial()
                    clone.diffuse.contents = opaqueImage
                    return clone
                }
                geom.materials = newMaterials
            }
        }
    }

    /// Draw the clothing PNG on top of a solid skin-tone background so
    /// alpha=0 regions (the unused parts of Roblox's 4-rect template
    /// layout) render as opaque skin instead of transparent. Without
    /// this, body parts whose UVs sample transparent pixels become
    /// invisible — which is exactly what made the user's avatar
    /// «пропал после накладке элементов».
    @MainActor
    private static func compositeOnSkinBackground(_ image: UIImage) -> UIImage {
        let size = image.size
        guard size.width > 0, size.height > 0 else { return image }
        let skin = UIColor(red: 0.95, green: 0.85, blue: 0.70, alpha: 1)
        let format = UIGraphicsImageRendererFormat.default()
        format.opaque = true
        format.scale = image.scale
        let renderer = UIGraphicsImageRenderer(size: size, format: format)
        return renderer.image { ctx in
            skin.setFill()
            ctx.fill(CGRect(origin: .zero, size: size))
            image.draw(in: CGRect(origin: .zero, size: size))
        }
    }

    private static func attachAll(desired: [Attachment], into avatarRoot: SCNNode, avatarAabb: Avatar3DAABB) async {
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
                        avatarRoot.addChildNode(node)
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
        // Phase O2-P2 — fetch attachment metadata in parallel with the
        // 3D mesh. Lets us anchor the asset by its REAL Attachment
        // CFrame instead of falling back to the bbox-center empirical
        // offset. Soft-fail (assets without attachments use the old
        // path; binary RBXM parse error → empty list, also fallback).
        async let attachmentsResp: AssetAttachmentsResp? = try? fetchAssetAttachments(assetId: assetId)

        var objBytes = try await objData
        let mtlBytes = try await mtlData
        _ = try await textureFiles
        let attachments = await attachmentsResp

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

        // Phase O2-P2 round 3 — sanity check: reject Bundles / full-body
        // Packages routed through asset-3d (user feedback 2026-05-29
        // «на перса накладывается перс все криво»). When the catalog
        // ranker accidentally picks a Bundle ID (e.g., a full character
        // package whose thumbnail-3d render contains the entire R-15
        // body), the OBJ comes back ~5–6 studs tall and our placement
        // logic stacks it on top of the mannequin in full size. There
        // is no per-attachment fix for that — the data is wrong by
        // assumption (we expect one accessory mesh, got a character).
        // So: measure the loaded mesh AABB; if any extent exceeds
        // 1.2× the mannequin height, soft-fail so this slot is dropped
        // rather than rendered as a duplicate avatar.
        let assetBBox = recursiveWorldBoundingBox(of: assetScene.rootNode)
        let assetExtX = assetBBox.1.x - assetBBox.0.x
        let assetExtY = assetBBox.1.y - assetBBox.0.y
        let assetExtZ = assetBBox.1.z - assetBBox.0.z
        let assetMaxExtent = max(assetExtX, max(assetExtY, assetExtZ))
        let mannequinHeight = max(Float(avatarAabb.max.y - avatarAabb.min.y), 1)
        let extentCap: Float = mannequinHeight * 1.2
        print("[RobloxAvatar3D] asset \(assetId) slot=\(slot) extent=(\(assetExtX),\(assetExtY),\(assetExtZ)) cap=\(extentCap)")
        if assetMaxExtent > extentCap {
            throw NSError(domain: "RobloxAsset3D", code: -2, userInfo: [
                NSLocalizedDescriptionKey:
                    "Asset \(assetId) slot=\(slot) extent \(assetMaxExtent) exceeds \(extentCap) — looks like a full-body bundle, skipping",
            ])
        }

        // Phase O2-P2 — attachment-driven placement. For an asset that
        // exposes an Attachment instance, we know its EXACT local
        // position on the Handle Part and the Handle's world position
        // in the standalone preview render. So:
        //   anchorWorld = handleWorld + attachmentLocal       (OBJ frame)
        //   target      = R-15 body attachment of same name   (scene frame)
        // Shift asset vertices so anchorWorld → (0,0,0), then place
        // wrapper at `target`. Result: the asset's attachment lines up
        // with the avatar's attachment EXACTLY, no empirical Y guess.
        //
        // Roblox uses Z- as forward; SceneKit uses Z+. We flip Z on
        // both the anchor and the handle to convert into scene space.
        let aabb = urls.aabb
        let avatarHeight = Float(avatarAabb.max.y - avatarAabb.min.y)
        let wrapper = SCNNode()
        wrapper.name = "AccessoryAttachment-\(assetId)"

        let primary = primaryAttachment(in: attachments?.attachments ?? [], slot: slot)
        if let primary,
           let target = bodyAttachmentTarget(name: primary.name, avatarHeight: avatarHeight) {
            // Phase O2-P2 rotation pass: position-only alignment left
            // hats/hair/glasses TILTED because Roblox accessories often
            // have a 90° pre-rotation on the Handle (e.g., the example
            // hat we tested ships with Handle orientation [0 0 -1;
            // 0 1 0; 1 0 0]). We now build the asset world CFrame as
            //   H = HandleCFrame                    (pos + 3×3)
            //   A = AttachmentCFrame_local          (pos + 3×3)
            //   AssetAttachment_world = H · A
            // and set the wrapper transform to the rigid transform that
            // maps that CFrame onto the body's attachment (target pos,
            // identity rotation) — i.e.,
            //   T = (R_body · R_asset⁻¹, p_body − R_body·R_asset⁻¹·p_asset)
            // For our bundled mannequin, body attachments are identity-
            // rotated, so R_body = I and R_t = R_asset⁻¹ = R_asset^T.
            let handle = composeCFrame(
                position: primary.handleWorld,
                rotation9: primary.handleOrientation
            )
            let attLocal = composeCFrame(
                position: primary.localPosition,
                rotation9: primary.localOrientation
            )
            let assetAttachmentWorld = SCNMatrix4Mult(attLocal, handle)
            let wrapperTransform = wrapperTransformFor(
                assetAttachmentWorld: assetAttachmentWorld,
                bodyTarget: target
            )
            for child in assetScene.rootNode.childNodes {
                wrapper.addChildNode(child)
            }
            wrapper.transform = wrapperTransform
        } else {
            // Fallback: bbox-based empirical placement (Phase C3 path).
            let placement = slotPlacement(slot: slot, avatarHeight: Double(avatarHeight))
            let anchor = anchorPointOnAsset(aabb: aabb, alignment: placement.alignment)
            for child in assetScene.rootNode.childNodes {
                child.position = SCNVector3(
                    child.position.x - anchor.x,
                    child.position.y - anchor.y,
                    child.position.z - anchor.z
                )
                wrapper.addChildNode(child)
            }
            wrapper.position = SCNVector3(placement.x, placement.y, placement.z)
        }
        return wrapper
    }

    // MARK: Phase O2-P2 — CFrame math helpers

    /// Build an SCNMatrix4 from a Roblox CFrame (Position + row-major
    /// 3×3 rotation). SCNMatrix4 is column-major in memory; the rotation
    /// matrix mapping is `m[col=j+1][row=i+1] = R[i][j]` so we transpose
    /// the row-major source into our SCN field layout.
    private static func composeCFrame(position: AttachmentVec3, rotation9 r: [Double]) -> SCNMatrix4 {
        guard r.count == 9 else { return SCNMatrix4MakeTranslation(Float(position.x), Float(position.y), Float(position.z)) }
        var m = SCNMatrix4Identity
        // Row-major source: R[i][j] = r[i*3 + j].
        // SCN column-major: m.m{col}{row} where col, row are 1-based.
        m.m11 = Float(r[0]); m.m12 = Float(r[1]); m.m13 = Float(r[2])
        m.m21 = Float(r[3]); m.m22 = Float(r[4]); m.m23 = Float(r[5])
        m.m31 = Float(r[6]); m.m32 = Float(r[7]); m.m33 = Float(r[8])
        m.m14 = Float(position.x)
        m.m24 = Float(position.y)
        m.m34 = Float(position.z)
        return m
    }

    /// Compute the wrapper's local transform such that the asset's
    /// attachment world CFrame (computed from RBXM data) ends up at
    /// `bodyTarget` with identity orientation.
    ///   T = (R_asset⁻¹, p_body − R_asset⁻¹ · p_asset)
    /// where R_asset is the rotation extracted from `assetAttachmentWorld`.
    private static func wrapperTransformFor(assetAttachmentWorld m: SCNMatrix4, bodyTarget: SCNVector3) -> SCNMatrix4 {
        // Extract rotation as 3×3 from SCNMatrix4 columns.
        let r00 = m.m11, r01 = m.m12, r02 = m.m13
        let r10 = m.m21, r11 = m.m22, r12 = m.m23
        let r20 = m.m31, r21 = m.m32, r22 = m.m33
        // Inverse of a pure rotation = its transpose.
        let i00 = r00, i01 = r10, i02 = r20
        let i10 = r01, i11 = r11, i12 = r21
        let i20 = r02, i21 = r12, i22 = r22
        // Asset world position from the CFrame's 4th column.
        let ax = m.m14, ay = m.m24, az = m.m34
        // Translation: p_body − R_asset⁻¹ · p_asset.
        let tx = bodyTarget.x - (i00 * ax + i01 * ay + i02 * az)
        let ty = bodyTarget.y - (i10 * ax + i11 * ay + i12 * az)
        let tz = bodyTarget.z - (i20 * ax + i21 * ay + i22 * az)
        var t = SCNMatrix4Identity
        t.m11 = i00; t.m12 = i01; t.m13 = i02
        t.m21 = i10; t.m22 = i11; t.m23 = i12
        t.m31 = i20; t.m32 = i21; t.m33 = i22
        t.m14 = tx;  t.m24 = ty;  t.m34 = tz
        return t
    }

    // MARK: Phase O2-P2 — attachment lookup helpers

    /// Fetch the parsed attachment metadata for an asset. Returns nil
    /// (caller treats as fallback) on any error; the backend itself
    /// returns an empty list for assets where the parser can't extract
    /// anything (XML shirt/pants wrappers, malformed RBXM).
    private static func fetchAssetAttachments(assetId: String) async throws -> AssetAttachmentsResp {
        return try await APIClient.request(
            "api/roblox-asset/attachments/\(assetId)",
            method: "GET",
            timeout: 15
        )
    }

    /// Pick the attachment to use for placement when an asset declares
    /// multiple (rare but happens — e.g., a backpack with two strap
    /// attachments). Prefer the one whose name matches the slot type
    /// most closely; otherwise the first.
    private static func primaryAttachment(in list: [AssetAttachmentEntry], slot: String) -> AssetAttachmentEntry? {
        guard !list.isEmpty else { return nil }
        let preferred: [String]
        switch slot.lowercased() {
        case "hat", "head":    preferred = ["HatAttachment", "HairAttachment"]
        case "hair":           preferred = ["HairAttachment", "HatAttachment"]
        case "face":           preferred = ["FaceFrontAttachment", "FaceCenterAttachment"]
        case "neck":           preferred = ["NeckAttachment", "BodyFrontAttachment"]
        case "shoulder":       preferred = ["LeftCollarAttachment", "RightCollarAttachment",
                                            "LeftShoulderRigAttachment", "RightShoulderRigAttachment"]
        case "back":           preferred = ["BodyBackAttachment", "WaistBackAttachment"]
        case "accessory":      preferred = ["WaistCenterAttachment", "WaistFrontAttachment",
                                            "BodyFrontAttachment"]
        case "shoes":          preferred = ["LeftFootAttachment", "RightFootAttachment"]
        default:               preferred = []
        }
        for name in preferred {
            if let match = list.first(where: { $0.name == name }) { return match }
        }
        return list.first
    }

    /// Where on the centered mannequin's body the named attachment
    /// lives. Coordinates are in scene space (SCNNode local to the
    /// AvatarRoot). Roblox uses -Z forward, so attachments named
    /// "*Front*" land at NEGATIVE Z (in front of the avatar in the
    /// Roblox-convention OBJ frame). Numbers derived from Roblox R-15
    /// standard rig at scale=1.
    private static func bodyAttachmentTarget(name: String, avatarHeight: Float) -> SCNVector3? {
        let h = avatarHeight
        let headCenter: Float = h * 0.43
        let headTop:    Float = h * 0.50
        switch name {
        case "HatAttachment":             return SCNVector3(0,             headTop,        0)
        case "HairAttachment":            return SCNVector3(0,             headTop - h * 0.02, 0)
        case "FaceFrontAttachment":       return SCNVector3(0,             headCenter,    -h * 0.08)
        case "FaceCenterAttachment":      return SCNVector3(0,             headCenter,     0)
        case "NeckAttachment":            return SCNVector3(0,             h * 0.34,       0)
        case "LeftCollarAttachment":      return SCNVector3(-h * 0.10,     h * 0.30,       0)
        case "RightCollarAttachment":     return SCNVector3(h * 0.10,      h * 0.30,       0)
        case "LeftShoulderRigAttachment": return SCNVector3(-h * 0.16,     h * 0.28,       0)
        case "RightShoulderRigAttachment":return SCNVector3(h * 0.16,      h * 0.28,       0)
        case "BodyFrontAttachment":       return SCNVector3(0,             h * 0.12,      -h * 0.08)
        case "BodyBackAttachment":        return SCNVector3(0,             h * 0.12,       h * 0.08)
        case "WaistFrontAttachment":      return SCNVector3(0,            -h * 0.05,      -h * 0.06)
        case "WaistBackAttachment":       return SCNVector3(0,            -h * 0.05,       h * 0.06)
        case "WaistCenterAttachment":     return SCNVector3(0,            -h * 0.05,       0)
        case "LeftGripAttachment":        return SCNVector3(-h * 0.22,     0,              0)
        case "RightGripAttachment":       return SCNVector3(h * 0.22,      0,              0)
        case "LeftFootAttachment":        return SCNVector3(-h * 0.07,    -h * 0.48,       0)
        case "RightFootAttachment":       return SCNVector3(h * 0.07,     -h * 0.48,       0)
        default: return nil   // unknown attachment → caller falls back
        }
    }

    /// How a slot anchors its asset to the avatar — both the avatar
    /// attachment point (where on the body the item goes) and the asset
    /// alignment (which corner/face of the asset's bbox is the reference).
    private struct SlotPlacement {
        let x: Float
        let y: Float
        let z: Float
        let alignment: AssetAlignment
    }

    private enum AssetAlignment {
        case center           // bbox center → anchor (shirt, neck, generic)
        case bottom           // bbox bottom → anchor (hat, hair, shoes — sits ON the part)
        case top              // bbox top → anchor (rarely needed)
        case front            // bbox front face (min Z) → anchor (face, eyewear)
        case back             // bbox back face (max Z) → anchor (back accessory)
    }

    /// Empirical placements tuned for R-15 anatomy. Y is the dominant
    /// axis; X/Z used for sideways/forward accessories. Bottom-alignment
    /// for hats means "the bottom of the hat sits on the top of the head"
    /// rather than the hat's center floating above.
    private static func slotPlacement(slot: String, avatarHeight: Double) -> SlotPlacement {
        let h = Float(avatarHeight)
        // After the recursive-AABB fix, the avatar's centered Y axis runs
        // from -h/2 (feet) to +h/2 (head top). Approximate R-15 anatomy:
        //   feet bottom    = -h/2     (~-3 stud for h≈6)
        //   knees          = -h*0.35
        //   hip            = -h*0.17
        //   torso center   =  0
        //   chest          =  h*0.10
        //   shoulders      =  h*0.30
        //   neck           =  h*0.38
        //   head bottom    =  h*0.42
        //   head center    =  h*0.46
        //   head top       =  h*0.50  (the actual AABB max)
        //   head front (Z) =  h*0.08
        // Empirical bumps after user feedback 2026-05-28 «hat сбоку,
        // sunglasses на груди»: Roblox asset bboxes don't always centre
        // around the visible mesh (e.g., sunglasses asset bbox extends
        // well below the actual glasses geometry; hat bboxes include
        // off-axis Attachment helpers). Without RBXM attachment-point
        // parsing (planned O2-P2) the only knob is to push the wrapper
        // Y up so the visible mesh lands closer to where it belongs.
        switch slot.lowercased() {
        case "hat", "head":
            // Hat: push wrapper above head crown so asset bbox bottom
            // anchor (which includes Attachment marker below the brim)
            // doesn't land mid-face.
            return .init(x: 0, y: h * 0.55, z: 0, alignment: .bottom)
        case "hair":
            // Hair was already on the head — leave as-is.
            return .init(x: 0, y: h * 0.48, z: 0, alignment: .center)
        case "face":
            // Face items (glasses, masks): push way up so the asset's
            // bbox centre lands on the head instead of chest.
            return .init(x: 0, y: h * 0.55, z: h * 0.10, alignment: .center)
        case "neck":
            // Actual neck line — between collarbone and chin.
            return .init(x: 0, y: h * 0.45, z: 0, alignment: .center)
        case "shoulder":
            return .init(x: 0, y: h * 0.35, z: 0, alignment: .center)
        case "shirt", "jacket":
            return .init(x: 0, y: h * 0.15, z: 0, alignment: .center)
        case "back":
            // Backpacks / wings: anchor BACK face of asset to upper back.
            return .init(x: 0, y: h * 0.22, z: -h * 0.08, alignment: .back)
        case "pants":
            return .init(x: 0, y: -h * 0.20, z: 0, alignment: .center)
        case "shoes":
            // Shoes sit on the floor.
            return .init(x: 0, y: -h * 0.48, z: 0, alignment: .bottom)
        case "accessory":
            // Generic accessory: bumped from chest to mid-torso since
            // most "accessory" items are upper-body / neck-area pieces.
            return .init(x: 0, y: h * 0.28, z: 0, alignment: .center)
        case "aura":
            return .init(x: 0, y: 0, z: 0, alignment: .center)
        default:
            return .init(x: 0, y: h * 0.20, z: 0, alignment: .center)
        }
    }

    /// Returns the point on the asset's bbox that should align with the
    /// avatar's attachment. For .center it's the bbox centroid; for
    /// .bottom it's (centerX, minY, centerZ); etc.
    private static func anchorPointOnAsset(aabb: Avatar3DAABB, alignment: AssetAlignment) -> SCNVector3 {
        let cx = Float((aabb.min.x + aabb.max.x) / 2)
        let cy = Float((aabb.min.y + aabb.max.y) / 2)
        let cz = Float((aabb.min.z + aabb.max.z) / 2)
        switch alignment {
        case .center: return SCNVector3(cx, cy, cz)
        case .bottom: return SCNVector3(cx, Float(aabb.min.y), cz)
        case .top:    return SCNVector3(cx, Float(aabb.max.y), cz)
        case .front:  return SCNVector3(cx, cy, Float(aabb.min.z))
        case .back:   return SCNVector3(cx, cy, Float(aabb.max.z))
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
        // Phase C3-anim — idle bob is attached AFTER the scene reaches the
        // main actor (see load()). SCNNode.runAction is MainActor-isolated
        // under Swift 6 strict concurrency, so we can't kick it off from
        // this nonisolated off-main loader.

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

    // MARK: - Phase O2-P1: bundled mannequin (clean R-15 base)

    /// Load a bundled R-15 mannequin scene (`Models/<name>.scn` or
    /// `Models/<name>.obj`) and apply the same centering / lighting /
    /// camera framing the remote-OBJ path uses. Returns a synthesized
    /// Avatar3DURLs (computed from the loaded mesh) so the rest of the
    /// pipeline (accessory attachment, slot offsets) keeps working
    /// without branching on source type.
    private static func loadMannequinSceneOffMain(body: Source.BodyType) async throws -> (SCNScene, Avatar3DURLs) {
        let baseName = body.sceneName
        // SCN first (faster — Xcode pre-compiled), OBJ as fallback for
        // missing-asset safety.
        var scene: SCNScene? = nil
        for filename in ["Models/\(baseName).scn", "\(baseName).scn",
                         "Models/\(baseName).obj", "\(baseName).obj"] {
            if let s = SCNScene(named: filename) { scene = s; break }
        }
        if scene == nil {
            for ext in ["scn", "obj"] {
                if let url = Bundle.main.url(forResource: baseName, withExtension: ext, subdirectory: "Models")
                    ?? Bundle.main.url(forResource: baseName, withExtension: ext) {
                    if ext == "scn" {
                        scene = try? SCNScene(url: url)
                    } else if let source = SCNSceneSource(url: url, options: nil) {
                        scene = try? source.scene(options: nil)
                    }
                    if scene != nil { break }
                }
            }
        }
        guard let scene else {
            throw NSError(domain: "RobloxAvatar3D", code: -2, userInfo: [
                NSLocalizedDescriptionKey: "Bundled mannequin '\(baseName)' missing from app",
            ])
        }

        // Compute AABB from the loaded scene so framing / accessory slot
        // offsets match the remote-OBJ pipeline. CRITICAL: SCNNode's own
        // .boundingBox only covers that node's geometry — for a bundled
        // SCN where the rootNode has NO geometry of its own and the
        // mesh lives in child body-part nodes, the rootNode bbox is
        // (0,0,0)–(0,0,0). That zero-bbox made all slot offsets zero too,
        // so hair / hat / accessory all stacked at the avatar origin
        // (hair floated near the mannequin's centroid, hat ended up on
        // the throat). User feedback 2026-05-28 «прическа летает, шапка
        // на горле». Fix: walk every descendant with geometry, union
        // their world-space bboxes.
        let (minV, maxV) = recursiveWorldBoundingBox(of: scene.rootNode)
        let aabb = Avatar3DAABB(
            min: Avatar3DVec3(x: Double(minV.x), y: Double(minV.y), z: Double(minV.z)),
            max: Avatar3DVec3(x: Double(maxV.x), y: Double(maxV.y), z: Double(maxV.z))
        )
        let center = SCNVector3(
            (minV.x + maxV.x) / 2, (minV.y + maxV.y) / 2, (minV.z + maxV.z) / 2
        )

        // Wrap the mannequin's mesh nodes in AvatarRoot so the idle-bob
        // animation + accessory attachment can target a single node
        // (same convention as the remote-OBJ pipeline).
        let avatarRoot = SCNNode()
        avatarRoot.name = "AvatarRoot"
        let meshChildren = scene.rootNode.childNodes.filter { $0.geometry != nil || !$0.childNodes.isEmpty }
        for child in meshChildren {
            child.position = SCNVector3(child.position.x - center.x,
                                        child.position.y - center.y,
                                        child.position.z - center.z)
            avatarRoot.addChildNode(child)
        }
        scene.rootNode.addChildNode(avatarRoot)

        // 3-point lighting + camera (mirror of the remote-OBJ path).
        let key = SCNNode(); key.light = SCNLight()
        key.light?.type = .directional; key.light?.intensity = 900
        key.eulerAngles = SCNVector3(-Float.pi / 4, Float.pi / 6, 0)
        scene.rootNode.addChildNode(key)
        let fill = SCNNode(); fill.light = SCNLight()
        fill.light?.type = .directional; fill.light?.intensity = 500
        fill.light?.color = UIColor(red: 0.7, green: 0.8, blue: 1.0, alpha: 1.0)
        fill.eulerAngles = SCNVector3(0, -Float.pi / 4, 0)
        scene.rootNode.addChildNode(fill)
        let ambient = SCNNode(); ambient.light = SCNLight()
        ambient.light?.type = .ambient; ambient.light?.intensity = 350
        scene.rootNode.addChildNode(ambient)

        let camera = SCNNode(); camera.camera = SCNCamera()
        camera.camera?.fieldOfView = 28.36
        let height = Float(aabb.max.y - aabb.min.y)
        let width  = Float(aabb.max.x - aabb.min.x)
        let depth  = Float(aabb.max.z - aabb.min.z)
        let radius = max(height, width, depth)
        let distance = max(radius * 2.2, 6.0)
        camera.position = SCNVector3(0, 0, distance)
        camera.look(at: SCNVector3(0, 0, 0))
        scene.rootNode.addChildNode(camera)

        let urls = Avatar3DURLs(
            userId: "mannequin-\(baseName)",
            objUrl: "", mtlUrl: "", textureUrls: [],
            camera: Avatar3DCamera(
                position: Avatar3DVec3(x: 0, y: 0, z: Double(distance)),
                direction: Avatar3DVec3(x: 0, y: 0, z: -1),
                fov: 28.36
            ),
            aabb: aabb
        )
        return (scene, urls)
    }

    /// Recursive world-space AABB. SCNNode.boundingBox only covers the
    /// node's own geometry, not descendants — so for a bundled SCN where
    /// each R-15 body part is a separate child node, the rootNode's own
    /// bbox is empty. We walk every descendant with geometry, transform
    /// the local bbox corners into world space by multiplying through
    /// each ancestor's transform, and union the results.
    private static func recursiveWorldBoundingBox(of root: SCNNode) -> (SCNVector3, SCNVector3) {
        var minP = SCNVector3(Float.greatestFiniteMagnitude,
                              Float.greatestFiniteMagnitude,
                              Float.greatestFiniteMagnitude)
        var maxP = SCNVector3(-Float.greatestFiniteMagnitude,
                              -Float.greatestFiniteMagnitude,
                              -Float.greatestFiniteMagnitude)

        func walk(_ node: SCNNode, accumulatedTransform: SCNMatrix4) {
            let nodeTransform = SCNMatrix4Mult(node.transform, accumulatedTransform)
            if let geom = node.geometry {
                let (lmin, lmax) = geom.boundingBox
                // 8 corners of the local AABB → world space.
                let corners: [SCNVector3] = [
                    SCNVector3(lmin.x, lmin.y, lmin.z),
                    SCNVector3(lmax.x, lmin.y, lmin.z),
                    SCNVector3(lmin.x, lmax.y, lmin.z),
                    SCNVector3(lmax.x, lmax.y, lmin.z),
                    SCNVector3(lmin.x, lmin.y, lmax.z),
                    SCNVector3(lmax.x, lmin.y, lmax.z),
                    SCNVector3(lmin.x, lmax.y, lmax.z),
                    SCNVector3(lmax.x, lmax.y, lmax.z),
                ]
                for c in corners {
                    // 4-element transform * (cx, cy, cz, 1) → world point.
                    let wx = nodeTransform.m11 * c.x + nodeTransform.m21 * c.y + nodeTransform.m31 * c.z + nodeTransform.m41
                    let wy = nodeTransform.m12 * c.x + nodeTransform.m22 * c.y + nodeTransform.m32 * c.z + nodeTransform.m42
                    let wz = nodeTransform.m13 * c.x + nodeTransform.m23 * c.y + nodeTransform.m33 * c.z + nodeTransform.m43
                    minP.x = min(minP.x, wx); minP.y = min(minP.y, wy); minP.z = min(minP.z, wz)
                    maxP.x = max(maxP.x, wx); maxP.y = max(maxP.y, wy); maxP.z = max(maxP.z, wz)
                }
            }
            for child in node.childNodes {
                walk(child, accumulatedTransform: nodeTransform)
            }
        }
        walk(root, accumulatedTransform: SCNMatrix4Identity)

        // Fallback for empty scenes — return a sane unit-cube so callers
        // don't divide by zero downstream.
        if !minP.x.isFinite || minP.x > maxP.x {
            return (SCNVector3(-2.5, -2.5, -1), SCNVector3(2.5, 2.5, 1))
        }
        return (minP, maxP)
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
                // Roblox MTL references textures by their EXACT hash name
                // (e.g., `map_Kd 30DAY-6c526de974ae2ed520943ae0000f8219` —
                // no extension). If we save as `0.png` / `1.png` SceneKit
                // can't bind them and the mesh renders flat white. Use the
                // URL's last path component (the hash) as the filename so
                // MTL → texture lookup succeeds.
                let url = URL(string: urlStr)
                let hashName = url?.lastPathComponent ?? "tex-\(i)"
                let dest = dir.appendingPathComponent(hashName)
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

struct ClothingTextureResp: Decodable {
    let assetId: String
    let innerAssetId: String
    let pngUrl: String
    let type: String
}

/// Phase O2-P2 — attachment metadata parsed from a Roblox accessory's
/// RBXM. Each entry names the body-part attachment point the accessory
/// snaps to (HatAttachment / FaceFrontAttachment / ...) and gives its
/// position in the Handle's local frame plus the Handle's world
/// position in the standalone preview render. iOS combines these to
/// find the attachment's world point in the OBJ vertex frame and
/// aligns it to the matching R-15 body attachment on the mannequin.
struct AssetAttachmentsResp: Decodable {
    let assetId: String
    let attachments: [AssetAttachmentEntry]
}

struct AssetAttachmentEntry: Decodable {
    let name: String
    let localPosition: AttachmentVec3
    /// Attachment's rotation in Handle-local frame (row-major 3×3 = 9
    /// floats: R00 R01 R02 R10 R11 R12 R20 R21 R22). Identity matrix
    /// if the Roblox CFrame didn't carry orientation (rare).
    let localOrientation: [Double]
    let handleWorld: AttachmentVec3
    /// Handle's rotation in world frame (row-major 3×3). Many
    /// accessories have a 90° pre-rotation here — without applying it,
    /// hats/glasses render sideways.
    let handleOrientation: [Double]
}

struct AttachmentVec3: Decodable {
    let x: Double
    let y: Double
    let z: Double
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
