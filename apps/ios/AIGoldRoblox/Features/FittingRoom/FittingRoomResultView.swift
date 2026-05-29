// FittingRoomResultView.swift — R-15 Dress-Up Room result screen (session 389).
//
// User ask: «после генерации мы можем сделать р-15 песонажа в одежде и
// примерять на него новую одежду как в играх по переодиванию. сделать
// все визуально прикольным и современым».
//
// Layout:
//   • Hero card — big rotatable avatar (swipe-to-rotate front / 3-4 / back),
//     glass-effect frame, soft accent glow that matches the aesthetic.
//   • Pill stats — cost / saved / item count chips.
//   • Dress-up slot grid — one tile per item slot (Hair, Face, Top, Bottom,
//     Outer, Accessory, Aura…). Each tile shows the slot icon, item name,
//     price chip, and a tappable "Swap" affordance — classic dress-up-game
//     vibe. Tap → triggers a full remix (per-slot lock is a future iteration
//     once the backend can lock individual slots; today we reuse the same
//     remix endpoint so the visual loop works).
//   • Share to TikTok / IG (primary).
//   • Remix actions: 🔄 Remix / 💰 Budget / 🖤 More Cursed / ✨ More Clean.
//   • Outfit items list (kept — tap to open in Roblox Catalog).
//   • Tweak / New vibe / Save PNG footer.

import SwiftUI

struct FittingRoomResultView: View {
    @ObservedObject var studio: FittingRoomStudio
    let response: FittingRoomDocResponse

    @State private var currentAngle: Int = 0
    @GestureState private var dragX: CGFloat = 0
    @State private var swappingSlot: String? = nil
    /// Phase C2 — bottom sheet for picking alternative items for a slot.
    /// Setting this presents `FittingRoomSlotAlternativesSheet`; the
    /// sheet's onSwap callback writes the updated doc back into studio.
    @State private var slotPickerTile: FittingSlotTile? = nil
    /// Phase A — hero preview can show either the user's REAL 3D R-15
    /// avatar (interactive SceneKit, no fit applied yet) or the AI-rendered
    /// "applied" 3-angle preview (img2img with the outfit on). Default to
    /// 3D when we have a Roblox userId — that's the more impressive view.
    @State private var heroMode: HeroMode = .threeDee
    /// Phase B — when true, every OutfitItem is fetched as a real 3D mesh
    /// from Roblox's asset-3d endpoint and stacked onto the avatar in the
    /// SceneKit scene. No AI re-render needed. Defaults to true so the
    /// dress-up vibe kicks in as soon as the avatar finishes loading.
    @State private var tryOnIn3D: Bool = true
    /// Phase O2-P1 — toggle the 3D BASE between (a) the user's real
    /// Roblox avatar (includes their CURRENT outfit baked in, causes
    /// double-stack when we attach fit items on top) and (b) a bundled
    /// Roblox-official R-15 Classic mannequin (clean — no clothes, no
    /// accessories — so the fit's items show without overlap). Default
    /// to mannequin since that's the cleaner dress-up experience the
    /// user explicitly asked for.
    @State private var useMannequin: Bool = true
    @ObservedObject private var robloxAuth = RobloxAuthService.shared

    enum HeroMode: Hashable { case threeDee, applied }

    /// Best-effort Roblox userId — prefer the doc (came from backend
    /// OAuth lookup at generation time), fall back to the device's
    /// signed-in OAuth user.
    private var robloxUserId: String? {
        if let id = response.robloxUserId, !id.isEmpty { return id }
        return robloxAuth.robloxUserId
    }

    /// Pick the right bundled mannequin model based on the generation's
    /// gender. Boys → R15_men, Girls → women, anything else → basic.
    private var mannequinBodyType: RobloxAvatar3DViewer.Source.BodyType {
        switch response.gender.lowercased() {
        case "boys", "boy", "male", "m":   return .man
        case "girls", "girl", "female", "f": return .woman
        default: return .neutral
        }
    }

    /// Phase O2-P (session 394) — convert the backend's server-composited
    /// render manifest into the viewer's `Avatar3DURLs`. This model has the
    /// FULL look baked in by Roblox (real shirt + pants + hats + hair), so
    /// it's the definitive dress-up view — no attachments / texture hacks.
    /// `userId` here is a synthetic key (only used for the temp-dir name).
    private var composited3DURLs: Avatar3DURLs? {
        guard let r = response.render3d else { return nil }
        return Avatar3DURLs(
            userId: "outfit-\(response.generationId)",
            objUrl: r.objUrl,
            mtlUrl: r.mtlUrl,
            textureUrls: r.textureUrls,
            camera: r.camera,
            aabb: r.aabb
        )
    }

    /// Phase O2-P (session 394) — same fit composited onto the USER's own
    /// avatar body (their skin/scales/face), used in "Your Avatar" mode.
    /// Distinct synthetic `userId` → separate temp dir from the grey render.
    private var composited3DUserURLs: Avatar3DURLs? {
        guard let r = response.render3dUser else { return nil }
        return Avatar3DURLs(
            userId: "outfit-user-\(response.generationId)",
            objUrl: r.objUrl,
            mtlUrl: r.mtlUrl,
            textureUrls: r.textureUrls,
            camera: r.camera,
            aabb: r.aabb
        )
    }

    /// The composited model to show for the CURRENT toggle: grey-body fit
    /// in Mannequin mode, the user's-body fit in "Your Avatar" mode. Either
    /// may be nil (older doc / render failed) → caller falls back.
    private var activeComposited: Avatar3DURLs? {
        useMannequin ? composited3DURLs : composited3DUserURLs
    }

    /// True when a server-composited model exists for the current toggle.
    /// Both modes now prefer the baked render (no client-side attachment);
    /// "Your Avatar" falls back to the real avatar + attachments only when
    /// the personalized render is absent.
    private var showComposited: Bool {
        activeComposited != nil
    }

    /// Phase O2-P4 — map OutfitItems → clothing texture overlays for
    /// the mannequin. Roblox classic Shirt / Pants / TShirt are 2D
    /// textures (no 3D mesh on asset-3d). Backend resolves the wrapper
    /// asset to its inner PNG template, iOS applies it to the
    /// mannequin's R-15 body materials. Real-avatar mode ignores this
    /// (the Roblox-rendered OBJ already bakes the user's clothing).
    private var mannequinClothingTextures: [RobloxAvatar3DViewer.ClothingTexture] {
        response.items.compactMap { item in
            let slot = item.slot.lowercased()
            let type: String
            switch slot {
            case "shirt":  type = "shirt"
            case "pants":  type = "pants"
            case "jacket": type = "shirt"   // jackets reuse the shirt template UV layout
            case "tshirt": type = "tshirt"
            default: return nil
            }
            return RobloxAvatar3DViewer.ClothingTexture(assetId: item.assetId, type: type)
        }
    }

    /// Phase B / C3-fix — map OutfitItems → SceneKit attachments.
    ///
    /// Filter set depends on the BASE mesh:
    ///   • Real Roblox avatar: avatar OBJ has the user's current outfit
    ///     baked in (hair / shirt / pants / shoes). Stack a new hair on
    ///     top → double-hair. Skip baked-in slots to avoid the mess.
    ///   • Mannequin (Phase O2-P1): bundled R-15 has NO hair, NO
    ///     accessories, just the bare body. We can safely attach hair
    ///     and the items that have real 3D meshes. Clothing (shirt /
    ///     pants / jacket) is still skipped because Roblox represents
    ///     those as 2D textures on the body, not separate meshes —
    ///     no usable asset-3d output. Adding texture-overlay support
    ///     for ClassicShirt / ClassicPants is a future polish step.
    private var threeDeeAttachments: [RobloxAvatar3DViewer.Attachment] {
        let alwaysSkipped: Set<String> = [
            "shirt", "pants", "jacket",   // 2D texture overlays, no 3D mesh
            "aura",                        // not a 3D mesh on Roblox
            "",
        ]
        let avatarBakedAlso: Set<String> = ["shoes", "hair"]
        let skipSet = useMannequin ? alwaysSkipped : alwaysSkipped.union(avatarBakedAlso)
        return response.items.compactMap { item in
            let slot = item.slot.lowercased()
            if skipSet.contains(slot) { return nil }
            return RobloxAvatar3DViewer.Attachment(assetId: item.assetId, slot: slot)
        }
    }

    private var renders: [String?] {
        [response.renders.front, response.renders.threeQuarter, response.renders.back]
    }
    private var angleLabels: [String] {
        [
            loc(en: "Front", ru: "Спереди"),
            loc(en: "3/4",   ru: "3/4"),
            loc(en: "Back",  ru: "Сзади"),
        ]
    }

    private var accentColor: Color { fitHex(currentStyleAccent) }
    private var currentStyleAccent: String {
        FittingRoomAesthetic(rawValue: response.aestheticId)?.accentHex ?? "5C0D9C"
    }

    /// Items ordered by slot priority for the dress-up grid (head → feet).
    private var orderedSlotItems: [FittingSlotTile] {
        FittingSlotTile.build(from: response.items)
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 18) {
                header
                if robloxUserId != nil {
                    heroModeToggle
                }
                heroAvatarCard
                if heroMode == .applied {
                    angleDots
                }
                statsRow
                dressUpRoom
                shareButton
                remixRow
                itemsList
                footer
            }
            .padding(.horizontal, 16).padding(.top, 60).padding(.bottom, 30)
        }
        .sheet(item: $slotPickerTile) { tile in
            FittingRoomSlotAlternativesSheet(
                generationId: response.generationId,
                slot: tile.slotKey,
                slotDisplayLabel: tile.slotLabel
            ) { updatedDoc in
                // Phase C2: propagate the new doc through the studio so
                // every dependent view (slot grid, stats, items list,
                // 3D viewer attachments) reflects the swap. No img2img
                // re-render — Applied 2D mode stays "frozen" until the
                // user hits a remix button.
                studio.step = .result(updatedDoc)
            }
        }
    }

    // MARK: - 3D / 2D mode toggle

    private var heroModeToggle: some View {
        HStack(spacing: 0) {
            modeButton(.threeDee,
                       icon: "cube.transparent.fill",
                       label: loc(en: "3D Avatar", ru: "3D-аватар"))
            modeButton(.applied,
                       icon: "tshirt.fill",
                       label: loc(en: "Fit Applied", ru: "С фитом"))
        }
        .padding(4)
        .background(Color.cardBackground.opacity(0.6))
        .clipShape(Capsule())
        .overlay(Capsule().stroke(accentColor.opacity(0.3), lineWidth: 0.8))
    }

    private func modeButton(_ mode: HeroMode, icon: String, label: String) -> some View {
        Button(action: {
            withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                heroMode = mode
            }
        }) {
            HStack(spacing: 6) {
                Image(systemName: icon).font(.caption.bold())
                Text(label).font(.caption.bold())
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
            .background(heroMode == mode ? accentColor : Color.clear)
            .foregroundColor(heroMode == mode ? .white : .textSecondary)
            .clipShape(Capsule())
        }
    }

    // MARK: - Header

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                Text(response.appStoreHook)
                    .font(.appCaption.bold())
                    .foregroundColor(accentColor)
                Spacer()
                if response.fitOnUser {
                    Label(loc(en: "ON YOU", ru: "НА ТЕБЕ"), systemImage: "checkmark.seal.fill")
                        .font(.caption2.bold())
                        .padding(.horizontal, 8).padding(.vertical, 3)
                        .background(Color.green)
                        .foregroundColor(.white)
                        .clipShape(Capsule())
                }
            }
            Text(response.title)
                .font(.appTitle2.bold()).foregroundColor(.textPrimary)
            Text(response.localizedPitch)
                .font(.appCaption).foregroundColor(.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Hero avatar card (glass frame + soft accent glow)

    private var heroAvatarCard: some View {
        GeometryReader { geo in
            ZStack {
                // Soft accent glow that bleeds outside the frame.
                RoundedRectangle(cornerRadius: 24)
                    .fill(accentColor.opacity(0.45))
                    .blur(radius: 36)
                    .padding(-12)

                heroInnerStack(geo: geo)
                    .frame(width: geo.size.width, height: geo.size.width * 1.2)
                    .clipShape(RoundedRectangle(cornerRadius: 22))
                    .overlay(
                        RoundedRectangle(cornerRadius: 22)
                            .stroke(LinearGradient(colors: [accentColor.opacity(0.9), .white.opacity(0.25)],
                                                   startPoint: .topLeading, endPoint: .bottomTrailing), lineWidth: 1.5)
                    )
                    .shadow(color: accentColor.opacity(0.35), radius: 18, x: 0, y: 8)
            }
        }
        .aspectRatio(0.83, contentMode: .fit)
    }

    @ViewBuilder
    private func heroInnerStack(geo: GeometryProxy) -> some View {
        switch heroMode {
        case .threeDee:
            heroThreeDee
        case .applied:
            heroApplied(geo: geo)
        }
    }

    // MARK: 3D R-15 avatar (Phase A)

    @ViewBuilder
    private var heroThreeDee: some View {
        // Mannequin mode works without a Roblox userId (bundled SCN);
        // real-avatar mode needs the userId. Show the viewer whenever
        // either path is available.
        if useMannequin || robloxUserId != nil {
            ZStack {
                // Phase O2-P1 — toggle the base mesh between bundled
                // mannequin (clean dress-up base) and the user's real
                // Roblox avatar (familiar but double-stacks with their
                // current outfit). Items attach to whichever base is
                // active — accessories aren't re-fetched on toggle.
                Group {
                    if let composited = activeComposited {
                        // Phase O2-P — server-composited full outfit: real
                        // shirt + pants + hats + hair, all baked in by
                        // Roblox /v1/avatar/render. No attachments / texture
                        // overlays needed (would double-stack the look).
                        // Key is mode-specific so toggling Mannequin↔Your
                        // Avatar reloads the right baked model (grey body vs
                        // the user's own body) instead of reusing the cache.
                        RobloxAvatar3DViewer(
                            compositedOutfit: composited,
                            key: "\(response.generationId)-\(useMannequin ? "m" : "u")"
                        )
                    } else if useMannequin {
                        RobloxAvatar3DViewer(
                            mannequin: mannequinBodyType,
                            attachedAssets: tryOnIn3D ? threeDeeAttachments : [],
                            clothingTextures: tryOnIn3D ? mannequinClothingTextures : []
                        )
                    } else if let userId = robloxUserId {
                        RobloxAvatar3DViewer(
                            robloxUserId: userId,
                            attachedAssets: tryOnIn3D ? threeDeeAttachments : []
                        )
                    }
                }
                VStack {
                    HStack {
                        // Mannequin / Real-avatar toggle (top-left).
                        // Only shown when both modes are actually available
                        // (need a Roblox userId for "Your Avatar"). If user
                        // isn't connected, mannequin is the only option and
                        // we silently stay there.
                        if robloxUserId != nil {
                            Button(action: {
                                withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
                                    useMannequin.toggle()
                                }
                            }) {
                                HStack(spacing: 4) {
                                    Image(systemName: useMannequin ? "figure.stand" : "person.crop.circle.fill")
                                        .font(.caption2.bold())
                                    Text(useMannequin
                                         ? loc(en: "Mannequin", ru: "Манекен")
                                         : loc(en: "Your Avatar", ru: "Твой аватар"))
                                        .font(.caption.bold())
                                }
                                .foregroundColor(.white)
                                .padding(.horizontal, 10).padding(.vertical, 5)
                                .background(.ultraThinMaterial)
                                .clipShape(Capsule())
                                .overlay(Capsule().stroke(.white.opacity(0.3), lineWidth: 0.5))
                                .padding(.leading, 12).padding(.top, 12)
                            }
                        }
                        Spacer()
                        HStack(spacing: 4) {
                            Image(systemName: "cube.transparent.fill").font(.caption2.bold())
                            Text(loc(en: "Real R-15", ru: "Реальный R-15"))
                                .font(.caption.bold())
                        }
                        .padding(.horizontal, 10).padding(.vertical, 5)
                        .background(.ultraThinMaterial)
                        .foregroundColor(.white)
                        .clipShape(Capsule())
                        .overlay(Capsule().stroke(.white.opacity(0.25), lineWidth: 0.5))
                        .padding(12)
                    }
                    Spacer()
                    HStack(spacing: 8) {
                        // Phase B — toggle to add/remove real 3D meshes of
                        // the fit's items on top of the avatar. Hidden in
                        // composited mode: the fit is already baked into the
                        // render, so a "take off" toggle would be a no-op.
                        if !showComposited {
                            Button(action: {
                                withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
                                    tryOnIn3D.toggle()
                                }
                            }) {
                                HStack(spacing: 4) {
                                    Image(systemName: tryOnIn3D ? "xmark.circle.fill" : "sparkles")
                                        .font(.caption2.bold())
                                    Text(tryOnIn3D
                                         ? loc(en: "Take off", ru: "Снять")
                                         : loc(en: "Try this fit on 3D", ru: "Примерить в 3D"))
                                        .font(.caption.bold())
                                }
                                .foregroundColor(.white)
                                .padding(.horizontal, 10).padding(.vertical, 5)
                                .background(tryOnIn3D ? Color.orange.opacity(0.85) : accentColor.opacity(0.85))
                                .clipShape(Capsule())
                                .overlay(Capsule().stroke(.white.opacity(0.3), lineWidth: 0.5))
                            }
                        }
                        HStack(spacing: 4) {
                            Image(systemName: "hand.tap.fill").font(.caption2)
                            Text(loc(en: "Drag · pinch", ru: "Тяни · щипок"))
                                .font(.caption2.bold())
                        }
                        .foregroundColor(.white.opacity(0.85))
                        .padding(.horizontal, 10).padding(.vertical, 4)
                        .background(.ultraThinMaterial)
                        .clipShape(Capsule())
                    }
                    .padding(.bottom, 10)
                }
            }
        } else {
            ZStack {
                LinearGradient(colors: [.black, accentColor.opacity(0.35), .black],
                               startPoint: .top, endPoint: .bottom)
                VStack(spacing: 10) {
                    Image(systemName: "person.crop.circle.badge.questionmark")
                        .font(.system(size: 44)).foregroundColor(.white.opacity(0.7))
                    Text(loc(en: "Connect Roblox to see your 3D avatar",
                             ru: "Подключи Roblox чтобы увидеть свой 3D-аватар"))
                        .font(.appCaption).foregroundColor(.white.opacity(0.85))
                        .multilineTextAlignment(.center).padding(.horizontal, 24)
                }
            }
        }
    }

    // MARK: 2D "applied fit" (img2img preview, swipe to rotate)

    private func heroApplied(geo: GeometryProxy) -> some View {
        let w = geo.size.width
        return ZStack {
            // Inner background — deep black so renders pop.
            LinearGradient(colors: [.black, accentColor.opacity(0.35), .black],
                           startPoint: .top, endPoint: .bottom)

            // Rotatable layers (cross-fade based on drag offset).
            ForEach(0..<renders.count, id: \.self) { i in
                if let urlStr = renders[i], let url = URL(string: urlStr) {
                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .success(let img): img.resizable().scaledToFit()
                        case .failure: placeholderFor(i: i)
                        case .empty:   ZStack { placeholderFor(i: i); ProgressView().tint(.white) }
                        @unknown default: placeholderFor(i: i)
                        }
                    }
                    .opacity(opacity(forIndex: i, w: w))
                    .scaleEffect(scale(forIndex: i, w: w))
                } else {
                    placeholderFor(i: i).opacity(opacity(forIndex: i, w: w))
                }
            }

            // Top-right angle label.
            VStack {
                HStack {
                    Spacer()
                    HStack(spacing: 4) {
                        Image(systemName: "arrow.triangle.2.circlepath")
                            .font(.caption2.bold())
                        Text(angleLabels[currentAngle])
                            .font(.caption.bold())
                    }
                    .padding(.horizontal, 10).padding(.vertical, 5)
                    .background(.ultraThinMaterial)
                    .foregroundColor(.white)
                    .clipShape(Capsule())
                    .overlay(Capsule().stroke(.white.opacity(0.25), lineWidth: 0.5))
                    .padding(12)
                }
                Spacer()
                HStack(spacing: 4) {
                    Image(systemName: "hand.draw.fill").font(.caption2)
                    Text(loc(en: "Swipe to rotate", ru: "Свайп — поворот"))
                        .font(.caption2.bold())
                }
                .foregroundColor(.white.opacity(0.85))
                .padding(.horizontal, 10).padding(.vertical, 4)
                .background(.ultraThinMaterial)
                .clipShape(Capsule())
                .padding(.bottom, 10)
                .opacity(currentAngle == 0 ? 1 : 0)
                .animation(.easeInOut(duration: 0.4), value: currentAngle)
            }
        }
        .gesture(
            DragGesture()
                .updating($dragX) { value, state, _ in state = value.translation.width }
                .onEnded { value in
                    let delta = value.translation.width
                    if delta < -50 && currentAngle < renders.count - 1 {
                        withAnimation(.spring(response: 0.42, dampingFraction: 0.85)) {
                            currentAngle += 1
                        }
                    } else if delta > 50 && currentAngle > 0 {
                        withAnimation(.spring(response: 0.42, dampingFraction: 0.85)) {
                            currentAngle -= 1
                        }
                    }
                }
        )
    }

    /// Soft pseudo-3D cross-fade: the "current" angle is fully opaque, the
    /// in-drag neighbor fades in proportional to drag offset.
    private func opacity(forIndex i: Int, w: CGFloat) -> Double {
        let progress = Double(-dragX / w)
        let target = Double(currentAngle) + progress
        let dist = abs(target - Double(i))
        return max(0, 1 - dist)
    }
    private func scale(forIndex i: Int, w: CGFloat) -> CGFloat {
        let progress = -dragX / w
        let target = CGFloat(currentAngle) + progress
        let dist = abs(target - CGFloat(i))
        return 1.0 - min(0.05, dist * 0.05)
    }

    private func placeholderFor(i: Int) -> some View {
        ZStack {
            LinearGradient(
                colors: [accentColor, .black],
                startPoint: .top, endPoint: .bottom
            )
            VStack(spacing: 6) {
                ProgressView().tint(.white)
                Text(loc(en: "Rendering \(angleLabels[i])…", ru: "Рендерю \(angleLabels[i])…"))
                    .font(.caption).foregroundColor(.white.opacity(0.8))
            }
        }
    }

    private var angleDots: some View {
        HStack(spacing: 8) {
            ForEach(0..<renders.count, id: \.self) { i in
                Capsule()
                    .fill(i == currentAngle ? accentColor : Color.bubbleBorder.opacity(0.3))
                    .frame(width: i == currentAngle ? 22 : 8, height: 8)
                    .animation(.spring(response: 0.4, dampingFraction: 0.85), value: currentAngle)
                    .onTapGesture {
                        withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) { currentAngle = i }
                    }
            }
        }
    }

    // MARK: - Stats strip

    private var statsRow: some View {
        HStack(spacing: 8) {
            statChip(icon: "creditcard.fill",
                     label: "\(response.totalCostRobux) R$",
                     tint: response.totalCostRobux == 0 ? .green : accentColor)
            if response.savedRobux > 0 {
                statChip(icon: "tag.fill",
                         label: loc(en: "Saved \(response.savedRobux.formatted()) R$",
                                    ru: "Сэкон. \(response.savedRobux.formatted()) R$"),
                         tint: .orange)
            }
            statChip(icon: "tshirt.fill",
                     label: "\(response.items.count) \(loc(en: "items", ru: "айт."))",
                     tint: .blue)
            Spacer()
        }
    }

    private func statChip(icon: String, label: String, tint: Color) -> some View {
        Label {
            Text(label).font(.caption.bold())
        } icon: {
            Image(systemName: icon).font(.caption2)
        }
        .padding(.horizontal, 10).padding(.vertical, 6)
        .background(tint.opacity(0.16)).foregroundColor(tint)
        .clipShape(Capsule())
        .overlay(Capsule().stroke(tint.opacity(0.4), lineWidth: 0.5))
    }

    // MARK: - Dress-up Room (swappable slot grid)

    private var dressUpRoom: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Image(systemName: "sparkles").font(.appCaption).foregroundColor(accentColor)
                Text(loc(en: "Dress-up room", ru: "Примерочная"))
                    .font(.appHeadline).foregroundColor(.textPrimary)
                Spacer()
                Text(loc(en: "Tap to swap", ru: "Тап — заменить"))
                    .font(.caption2).foregroundColor(.textSecondary)
            }

            if orderedSlotItems.isEmpty {
                Text(loc(en: "No item data — try regenerating.",
                         ru: "Нет данных — попробуй регенерить."))
                    .font(.appCaption).foregroundColor(.textSecondary)
                    .padding(.vertical, 8)
            } else {
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 10),
                                    GridItem(.flexible(), spacing: 10)], spacing: 10) {
                    ForEach(orderedSlotItems) { tile in
                        slotTile(tile)
                    }
                }
            }
        }
    }

    private func slotTile(_ tile: FittingSlotTile) -> some View {
        Button(action: {
            // Phase C2: tap opens the alternatives sheet for THIS slot
            // (not a full remix). User picks one → backend swaps slot →
            // 3D viewer re-attaches mesh live. Use the studio remix
            // buttons below the grid for a full outfit reshuffle.
            slotPickerTile = tile
        }) {
            VStack(alignment: .leading, spacing: 8) {
                // Top — thumbnail + slot label + item name. Label never
                // wraps (shrinks to fit), name caps at 2 lines.
                HStack(alignment: .top, spacing: 10) {
                    slotThumbnail(tile)
                    VStack(alignment: .leading, spacing: 4) {
                        HStack(spacing: 4) {
                            Text(tile.slotLabel)
                                .font(.caption2.bold()).foregroundColor(.textSecondary)
                                .textCase(.uppercase)
                                .tracking(0.5)
                                .lineLimit(1).minimumScaleFactor(0.7)
                            Spacer(minLength: 4)
                            if swappingSlot == tile.id {
                                ProgressView().scaleEffect(0.6).tint(accentColor)
                            } else {
                                Image(systemName: "arrow.triangle.2.circlepath")
                                    .font(.caption2.bold())
                                    .foregroundColor(accentColor)
                            }
                        }
                        Text(tile.itemName)
                            .font(.appBody.bold()).foregroundColor(.textPrimary)
                            .lineLimit(2).multilineTextAlignment(.leading)
                            .fixedSize(horizontal: false, vertical: true)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
                Spacer(minLength: 4)
                // Bottom — price + Swap span the full card width, so neither
                // ever wraps ("FREE"/"Swap" stay on one line via fixedSize).
                HStack(spacing: 6) {
                    Text(tile.priceLabel)
                        .font(.caption2.monospaced().bold())
                        .lineLimit(1).fixedSize(horizontal: true, vertical: false)
                        .padding(.horizontal, 7).padding(.vertical, 3)
                        .background(tile.priceTint.opacity(0.22))
                        .foregroundColor(tile.priceTint)
                        .clipShape(RoundedRectangle(cornerRadius: 5))
                    Spacer(minLength: 6)
                    Text(loc(en: "Swap", ru: "Замена"))
                        .font(.caption2.bold())
                        .lineLimit(1).fixedSize(horizontal: true, vertical: false)
                        .padding(.horizontal, 12).padding(.vertical, 5)
                        .background(accentColor.opacity(0.18))
                        .foregroundColor(accentColor)
                        .clipShape(Capsule())
                }
            }
            .padding(12)
            .frame(maxWidth: .infinity, minHeight: 124, alignment: .topLeading)
            .background(
                ZStack {
                    LinearGradient(colors: [Color.cardBackground, Color.cardBackground.opacity(0.85)],
                                   startPoint: .topLeading, endPoint: .bottomTrailing)
                    LinearGradient(colors: [tile.tint.opacity(0.18), .clear],
                                   startPoint: .topLeading, endPoint: .bottomTrailing)
                }
            )
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .stroke(tile.tint.opacity(0.35), lineWidth: 0.8)
            )
            .scaleEffect(swappingSlot == tile.id ? 0.97 : 1.0)
            .shadow(color: tile.tint.opacity(0.18), radius: 6, x: 0, y: 2)
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private func slotThumbnail(_ tile: FittingSlotTile) -> some View {
        ZStack {
            RoundedRectangle(cornerRadius: 10)
                .fill(tile.tint.opacity(0.18))
            if let urlStr = tile.thumbnailURL, let url = URL(string: urlStr) {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let img):
                        img.resizable().scaledToFit().padding(4)
                    case .failure:
                        Image(systemName: tile.icon)
                            .font(.title3.bold()).foregroundColor(tile.tint)
                    case .empty:
                        ProgressView().scaleEffect(0.6).tint(tile.tint)
                    @unknown default:
                        Image(systemName: tile.icon)
                            .font(.title3.bold()).foregroundColor(tile.tint)
                    }
                }
            } else {
                Image(systemName: tile.icon)
                    .font(.title3.bold()).foregroundColor(tile.tint)
            }
        }
        .frame(width: 52, height: 52)
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(tile.tint.opacity(0.4), lineWidth: 0.6))
    }

    // MARK: - Share + Remix

    private var shareButton: some View {
        Button(action: { studio.sharePoster() }) {
            HStack(spacing: 8) {
                Image(systemName: "square.and.arrow.up.fill")
                Text(loc(en: "Share to TikTok / IG", ru: "Шер в TikTok / IG"))
                    .font(.appHeadline.bold())
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(LinearGradient(colors: [.pink, accentColor], startPoint: .leading, endPoint: .trailing))
            .foregroundColor(.white)
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .shadow(color: accentColor.opacity(0.35), radius: 10, x: 0, y: 4)
        }
    }

    private var remixRow: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: "wand.and.stars").font(.appCaption).foregroundColor(accentColor)
                Text(loc(en: "Remix this fit", ru: "Remix этот фит"))
                    .font(.appHeadline).foregroundColor(.textPrimary)
            }
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                remixButton(label: loc(en: "🔄 Remix", ru: "🔄 Remix"), mode: .remix)
                remixButton(label: loc(en: "💰 Budget", ru: "💰 Бюджет"), mode: .budget)
                remixButton(label: loc(en: "🖤 More Cursed", ru: "🖤 Жёстче"), mode: .moreCursed)
                remixButton(label: loc(en: "✨ More Clean", ru: "✨ Чище"), mode: .moreClean)
            }
        }
    }

    private func remixButton(label: String, mode: FittingRoomRemix) -> some View {
        Button(action: { Task { await studio.start(remix: mode) } }) {
            Text(label)
                .font(.appBody.bold())
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
                .background(Color.cardBackground)
                .foregroundColor(.textPrimary)
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.bubbleBorder.opacity(0.3), lineWidth: 1))
        }
    }

    // MARK: - Items list (catalog deep-link)

    private var itemsList: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(loc(en: "All items", ru: "Все айтемы"))
                    .font(.appHeadline).foregroundColor(.textPrimary)
                Spacer()
                Text(loc(en: "Tap → Roblox", ru: "Тап → Roblox"))
                    .font(.caption2).foregroundColor(.textSecondary)
            }
            ForEach(response.items) { item in
                Button(action: { studio.openCatalogItem(item.catalogUrl) }) {
                    HStack(alignment: .top, spacing: 10) {
                        Text(item.priceRobux == 0 ? "FREE" : "\(item.priceRobux) R$")
                            .font(.caption2.monospaced().bold())
                            .padding(.horizontal, 6).padding(.vertical, 3)
                            .background(item.priceRobux == 0 ? Color.green.opacity(0.3) : Color.orange.opacity(0.3))
                            .foregroundColor(item.priceRobux == 0 ? .green : .orange)
                            .clipShape(RoundedRectangle(cornerRadius: 4))
                        VStack(alignment: .leading, spacing: 2) {
                            Text(item.slot.capitalized).font(.caption2).foregroundColor(.textSecondary)
                            Text(item.name).font(.appBody.bold()).foregroundColor(.textPrimary).lineLimit(2)
                        }
                        Spacer()
                        Image(systemName: "arrow.up.right.square").foregroundColor(accentColor)
                    }
                    .padding(10)
                    .background(Color.cardBackground)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var footer: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Button(action: { studio.savePreviewToPhotos(urlString: response.renders.front ?? response.renders.threeQuarter) }) {
                    Label(loc(en: "Save PNG", ru: "Скачать PNG"), systemImage: "square.and.arrow.down").font(.appBody)
                }.buttonStyle(.bordered)
                Button(action: studio.backToCustomize) {
                    Label(loc(en: "Tweak", ru: "Доработать"), systemImage: "slider.horizontal.3").font(.appBody)
                }.buttonStyle(.bordered)
                Button(action: studio.backToPicker) {
                    Label(loc(en: "New vibe", ru: "Другая vibe"), systemImage: "sparkles").font(.appBody)
                }.buttonStyle(.bordered)
            }
            Text(loc(
                en: "Pseudo-3D pre-rendered angles + per-slot try-on. Slot Swap currently triggers a full outfit refresh — per-slot lock coming.",
                ru: "Pseudo-3D углы + примерка по слотам. Сейчас Swap делает полный refresh — per-slot lock будет позже."
            ))
                .font(.caption2).foregroundColor(.textSecondary.opacity(0.7)).padding(.top, 8)
            Text("ID: \(response.generationId)")
                .font(.caption2.monospaced()).foregroundColor(.textSecondary.opacity(0.5))
        }
    }
}

// MARK: - Slot tile model

/// Visual model for a dress-up slot tile (icon + label + tint + the item
/// currently occupying that slot).
struct FittingSlotTile: Identifiable {
    let id: String              // unique per tile (assetId)
    let slotKey: String         // raw slot key (e.g., "hair") for API calls
    let slotLabel: String       // "Hair", "Top", "Shoes" — human-readable, localized
    let itemName: String
    let priceLabel: String
    let priceTint: Color
    let icon: String            // SF Symbol fallback when thumbnail missing
    let tint: Color             // slot accent color
    let thumbnailURL: String?   // Roblox catalog item thumbnail (nullable — sometimes missing)

    /// Stable order: head → feet → extras. Items not in this map fall to the
    /// end in catalog order.
    private static let slotOrder: [String: Int] = [
        "hair": 0, "face": 1, "neck": 2, "shoulder": 3,
        "shirt": 4, "jacket": 5, "back": 6,
        "pants": 7, "shoes": 8,
        "accessory": 9, "aura": 10,
    ]

    static func build(from items: [OutfitItem]) -> [FittingSlotTile] {
        items
            .sorted { lhs, rhs in
                let li = slotOrder[lhs.slot.lowercased()] ?? Int.max
                let ri = slotOrder[rhs.slot.lowercased()] ?? Int.max
                return li < ri
            }
            .map { item in
                let key = item.slot.lowercased()
                let label = slotDisplayLabel(key)
                let (icon, tint) = slotIconAndTint(key)
                let isFree = item.priceRobux == 0
                return FittingSlotTile(
                    id: item.assetId,
                    slotKey: key,
                    slotLabel: label,
                    itemName: item.name,
                    priceLabel: isFree ? "FREE" : "\(item.priceRobux) R$",
                    priceTint: isFree ? .green : .orange,
                    icon: icon,
                    tint: tint,
                    thumbnailURL: item.thumbnailUrl
                )
            }
    }

    private static func slotDisplayLabel(_ slot: String) -> String {
        switch slot {
        case "hair":      return loc(en: "Hair",     ru: "Волосы")
        case "face":      return loc(en: "Face",     ru: "Лицо")
        case "shirt":     return loc(en: "Top",      ru: "Верх")
        case "pants":     return loc(en: "Bottom",   ru: "Низ")
        case "jacket":    return loc(en: "Outer",    ru: "Куртка")
        case "neck":      return loc(en: "Neck",     ru: "Шея")
        case "shoulder":  return loc(en: "Shoulder", ru: "Плечо")
        case "back":      return loc(en: "Back",     ru: "Спина")
        case "aura":      return loc(en: "Aura",     ru: "Aura")
        case "accessory": return loc(en: "Accessory", ru: "Акс.")
        case "shoes":     return loc(en: "Shoes",    ru: "Обувь")
        default:          return slot.capitalized
        }
    }

    /// SF Symbol + accent color per slot. Color choices are intentionally
    /// varied so the dress-up grid reads at a glance.
    private static func slotIconAndTint(_ slot: String) -> (String, Color) {
        switch slot {
        case "hair":      return ("scissors", .purple)
        case "face":      return ("face.smiling.fill", .pink)
        case "shirt":     return ("tshirt.fill", .blue)
        case "pants":     return ("figure.stand", .indigo)
        case "jacket":    return ("snowflake", .cyan)
        case "neck":      return ("circle.grid.cross.fill", .mint)
        case "shoulder":  return ("shield.lefthalf.filled", .teal)
        case "back":      return ("backpack.fill", .brown)
        case "aura":      return ("sparkles", .yellow)
        case "accessory": return ("crown.fill", .orange)
        case "shoes":     return ("shoeprints.fill", .red)
        default:          return ("circle.fill", .gray)
        }
    }
}
