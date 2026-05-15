# Design DNA: Roblox Lavender Glow

> Warm lavender-pink (#F8E8FF) + peach (#FFE4D6) gradient background, purple (#9B59B6) + coral (#FF6B6B) + gold (#F59E0B) accents.
> Playful Roblox-creator aesthetic — rounded cards on white-opacity surfaces, capsule chips, floating tab bar with colored circles.
> Default-design typography (rounded only inline for chips/tab labels), responsive spring animations, light haptics + success notifications, symbol-replace transitions.

**App:** AI Gold Roblox · Entertainment / Creative Tools · SwiftUI · iOS 15+
**Mood:** Playful, Vibrant, Creative, Voice-First, Roblox-Inspired, Youthful, Energetic
**Tagline:** "AI Gold Roblox"

---

## Colors (light / dark)

| Token | Light | Dark | Role |
|---|---|---|---|
| gradientTop | `#F8E8FF` | — | Main background gradient top (lavender-pink) |
| gradientBottom | `#FFE4D6` | — | Main background gradient bottom (peach) |
| appBackground | `#F7EEFF` | — | Fallback solid background |
| cardBackground | `.white` 0.85 | — | Cards, inputs, chips, bubbles |
| elevatedBackground | `.white` 0.95 | — | Elevated panels, tab bar, toolbars |
| tabBarBackground | `.white` 0.95 | — | Floating tab bar bg |
| pillBackground | `.white` 0.9 | — | Pill/badge background |
| pillBorder | accentPrimary 0.5 | — | Pill/badge border |
| textPrimary | `#261929` | — | Headings, titles, primary text |
| textSecondary | `#736388` | — | Descriptions, subtitles, metadata |
| textTertiary | `#A699B2` | — | Placeholders, disabled, hints |
| accentPrimary | `#9B59B6` | — | Purple — CTA, active tabs, mic button, primary actions |
| accentSecondary | `#FF6B6B` | — | Coral — secondary actions, community tab, errors |
| accentOrange | `#F59E0B` | — | Gold — highlights, premium, library tab, trending |
| accentPink | `#FF6699` | — | Pink — decorative glows, launch animation |
| accentTeal | `#4DD9D9` | — | Cyan — create/forge tab, secondary accents |
| neonGreen | `#33D980` | — | Bright green — success states, generate button |
| neonBlue | `#4D99FF` | — | Bright blue — info states |
| neonPurple | = accentPrimary | — | Alias for bright purple states |
| userBubble | accentPrimary 0.15 | — | User chat message background |
| assistantBubble | `.white` 0.9 | — | AI chat message background |
| bubbleBorder | accentPrimary 0.3 | — | Chat bubble border |
| quickReplyBackground | `.white` 0.85 | — | Quick reply chip bg |
| quickReplyBorder | accentPrimary 0.3 | — | Quick reply chip border |
| micButtonFill | accentPrimary | — | Mic button solid fill |
| micButtonGlow | accentPrimary 0.4 | — | Mic button glow halo |

**Note:** App is light-mode only — no dark mode support in current code. All Color tokens defined as static properties on `extension Color` in `Colors.swift`.

**Gradient patterns:**
- Background: `[gradientTop → gradientBottom]` topLeading→bottomTrailing (used on every screen)
- Background (variant): `[gradientTop → gradientBottom]` top→bottom
- Orange-Purple CTA: `[accentOrange → accentPrimary]` leading→trailing (Forge generate button)
- Green CTA: `[#33C766 → #23AD59]` leading→trailing (GDDCard generate button)
- Monochrome purple: `[accentPrimary → accentPrimary 0.7]` top→bottom
- Faded purple: `[accentPrimary 0.3 → accentPrimary 0.1]` topLeading→bottomTrailing
- Mixed accent: `[accentPrimary 0.35 → accentSecondary 0.25]` topLeading→bottomTrailing
- Card subtle: `[white 0.98 → cardBackground]` topLeading→bottomTrailing
- Shimmer: `[white 0.04 → white 0.12 → white 0.04]` leading→trailing (animated 1.2s loop)
- Tab button: RadialGradient `[tab.color 0.6–1.0 → tab.color 0.3–0.7]` center offset (0.35, 0.3)
- Progress ring: AngularGradient `[accentPrimary, accentPink, accentTeal]` (splash logo, generation preview)
- Black overlay (featured cards): LinearGradient `[black → clear]` bottom→center

**Adaptive color helper:** No adaptive helper — all colors are static `Color` extension properties. No dark mode. All tokens in `extension Color` in `Colors.swift`.

---

## Typography

All fonts: `.system(design: .default)` unless inline `.rounded` (Quick Reply Chips, tab bar labels, splash title) or `.monospaced()` (code preview).

| Role | Size | Weight | Examples |
|---|---|---|---|
| display | 28 | bold / black | `.appLargeTitle` (28 bold), splash "AI Gold Roblox" (28 black .rounded), large CTA ("GENERATE") |
| title | 18–22 | bold / semibold | `.appTitle` (22 bold), `.appTitle2` (18 semi), card headers, section titles |
| body | 16 | regular / semibold | `.appBody` (16 regular), `.appHeadline` (16 semi), descriptions, input fields, button text |
| label | 12–14 | regular / semibold | `.appCallout` (14 regular), `.appCaption` (12 regular), chip text, section labels, tag pills |
| micro | 10–13 | medium–semibold (.rounded inline) | Tab bar labels (10 .rounded), quick reply chips (13 semibold .rounded), difficulty badges, feature chips |
| mono | 13 | regular | `.appCode` (13 .monospaced), code preview, technical values |

---

## Spacing

No centralized struct — raw values in code.

| Scale | Values (pt) |
|---|---|
| Base scale | 2 · 3 · 4 · 6 · 8 · 10 · 12 · 14 · 16 · 18 · 20 · 24 · 30 · 32 · 40 |

| Context | Value |
|---|---|
| Screen horizontal padding | 16 |
| Card inner padding | 12–16 |
| Modal inner padding | 20–24 |
| Chat message padding | 16h / 12v |
| Grid item spacing | 12–14 |
| Tab bar bottom clearance | ~70–100 (floatingTabBarClearance) |
| Section vertical gap | 20 |
| Chip spacing | 8 |
| Button vertical padding | 14 (standard), 24 (large CTA) |

---

## Corner Radius

No centralized struct — raw values in code.

| Token | Value | Usage |
|---|---|---|
| minimal | 6 | Small elements, inline badges |
| small | 8 | Shimmer shapes, compact chips |
| input | 10 | GDDCard table rows, inner fields |
| button | 12 | PrimaryButton, action buttons, tag pills, settings rows |
| card | 16 | GDDCard main, standard cards, message bubbles, featured cards |
| panel | 18–20 | Top Charts card, generation preview, large containers |
| tab bar | 24 | Floating tab bar background |
| splash logo | 28 | Launch screen logo container, large CTA, sheets |
| full | Capsule() | Quick reply chips, difficulty badges, progress bars, stat pills, tab labels |

---

## Shadows

| Level | Light | Dark | Usage |
|---|---|---|---|
| minimal | black 0.03, r4, y2 | — | Subtle card depth |
| subtle | black 0.04–0.06, r4–6, y2–3 | — | Home cards, catalog cards |
| card | accentPrimary 0.08, r8, y2 | — | GDDCard |
| medium | black 0.08, r8–12, y4–6 | — | Elevated cards, catalog sections |
| tab bar | accentPrimary 0.12, r10, y-2 | — | Floating tab bar (upward shadow) |
| accent glow | accentPrimary 0.15–0.18, r16, y8–10 | — | Export cards, profile hero, launch logo |
| CTA glow | accentPrimary 0.4, r14, y10 | — | Forge generate button |
| mic idle | micButtonGlow 0.3, r8 | — | Mic button default state |
| mic active | micButtonGlow 0.8, r16 | — | Mic button recording/processing |
| tab active | tab.color 0.5, r6, y2 | — | Active tab circle glow |
| green CTA | #33C766 0.3, r6, y3 | — | GDDCard generate button |

Applied inline — no centralized shadow struct or ViewModifier.

---

## Animations

### Springs (in code)

| Token | Response | Damping | Usage |
|---|---|---|---|
| tab-tap | 0.22 | 0.70 | Tab bar selection pop animation |
| launch | 0.28 | 0.72 | Launch loading dot rotation |
| gdd-collapse | 0.25 | default | GDDCard row collapse |
| chat-scroll | 0.30 | default | Chat scroll-to-bottom, GDDCard expand |
| onboarding | 0.35 | 0.80–0.82 | Onboarding step transitions (3 call sites) |
| catalog | 0.35 | 0.85 | Catalog category expand |
| preview | 0.50 | 0.86 | Generation preview reveal |

### Transitions

| Name | Effect | Usage |
|---|---|---|
| bottom slide | move(bottom) + opacity | Sheet panels, bottom content |
| symbol replace | `.contentTransition(.symbolEffect(.replace))` | Icon state changes (GenerationPreviewView, ChatView) |

### Haptics

| Feedback | Trigger | Context |
|---|---|---|
| `UIImpactFeedbackGenerator(.light)` | tap | Chat input actions (ChatView) |
| `UINotificationFeedbackGenerator(.success)` | async completion | Home section success state (HomeView) |

No `.sensoryFeedback()` modifier — app targets iOS 15, uses pre-iOS 17 haptics API.

### Effects

- `.contentTransition(.symbolEffect(.replace))` — on dynamic icons in GenerationPreviewView, ChatView (voice/text toggle, generation state)

No `.symbolEffect(.bounce)`, `.symbolEffect(.pulse)`, `.contentTransition(.numericText())`, or `.scrollTransition { ... }` present — app targets iOS 15, these are iOS 17+ APIs.

---

## Components

| Component | Role |
|---|---|
| `PrimaryButton` | Full-width button: filled (accentPrimary bg, white text) or outline (border 2pt, accentPrimary text), rounded 12, padding-v 14 |
| `MicButton` | Circle 72×72 mic with 88×88 glow halo, 3 states (idle/recording/processing), dynamic shadow + scale |
| `QuickReplyChips` | Horizontal ScrollView of capsule chips: white 0.85 bg, accentPrimary 0.3 border, 13pt semibold rounded, padding-h 14 / v 10, spacing 8 |
| `GDDCard` | Game Design Document confirmation card: expandable header with field-count badge, striped table rows (radius 10), green gradient generate CTA + secondary change button, EN/RU localization |
| `ShimmerView` | Loading skeleton: 3-stop white gradient (0.04→0.12→0.04), animated 1.2s linear repeat |
| `PresetCardsView` | Preset card selection carousel |
| `LaunchLoadingView` | Splash: gradient bg, 2 pulsing circles (240+320), logo in rounded-rect 96×96 with orbiting AngularGradient arc 146×146, animated dots |
| `LoadingDotsView` | 3 animated dots (12/9 circles) — inline companion to launch |
| `HomeHeroCard` | CTA card on Home tab: image + title + subtitle, pushes to Create tab |
| `FeaturedBannerCard` | Horizontal scroll card 280×160: image fill + black gradient overlay + title/author, radius 20 |
| `FeedPostCard` | Vertical feed card: image + title + author + stats, used in multiple feed sections |
| `ChallengeBannerView` | Active challenge card on Home: image + title + time remaining |
| `ChallengeCountdownView` | Countdown timer row with live time-remaining updates |
| `PrizesView` | Prize breakdown list — icon + rank + reward |
| `GenerationPreviewView` | Content preview, @ViewBuilder switch: code / GDD / text / media (300h) / 3D model (400h) / animation / UI preview / clothing |
| `ExportView` | Export flow: hero icon card 180h + transfer options + Roblox flow + quality checklist + download/share/QR buttons |
| `ExportSheetView` | Editor-contextual export sheet (embedded) |
| `ChatView` | Full-screen conversation: LazyVStack messages (sp 14), user/AI bubbles (max 80%, radius 16), input bar with mic+text+attach, flow picker |
| `OnboardingFlowView` | Multi-step wizard: progress Capsule 8h, step content, back/next buttons, Google/Apple/email auth |
| `AuthView` | Sign-in screen: provider buttons + email form |
| `RootView` | State-machine entry point: launch → ban → onboarding → main |
| `MainTabView` | Custom floating tab bar + content switch (Home/Create/Library/Community/Profile) |
| `DeepLinkDestinationView` | Deep-link router shell (content routed via DeepLinkManager) |
| `DeepLinkPostDetailView` | Post detail sheet, opened via deep link |
| `DeepLinkProfileDetailView` | Creator profile sheet, opened via deep link |
| `ProfileView` | Profile tab: hero card (avatar 70×70 + stats grid) + portfolio + exports + badges + settings link |
| `ProfileAvatarView` | Circular avatar with optional ring/verification badge |
| `BadgeView` | Badge pill: icon + label in capsule |
| `PortfolioItemView` | 2-col grid post thumbnail with title/stats overlay |
| `CatalogView` | Community tab: search bar + category chips (horizontal) + post grid (2-col LazyVGrid, sp 12) |
| `CommunityPostDetailView` | Full post detail: image + author + description + comment tree + like/share |
| `PostImageView` | Post hero image with placeholder/shimmer loading |
| `TopChartsView` | Top charts: tab picker + ranked post list with position numbers |
| `CreatorProfileView` | Public creator profile with follow/portfolio |
| `PostThumbnailView` | Creator profile post grid thumbnail |
| `ForgeView` | Create tab: large generate CTA (radius 28, orange→purple gradient), template horizontal scroll (220w cards), chat history grouped by date/type |
| `LibraryView` | Library tab: editors section + saved characters + project history + export records (file: AvatarsView.swift) |
| `PacksView` | Content packs browser: grid of pack cards |
| `ItemsView` | Items catalog: grid of item cards with filters |
| `ItemRowView` | Items list row: thumbnail + title + metadata |
| `AvatarView` | Community catalog avatar card |
| `AvatarEditorView` | 3D avatar editor: SceneKit preview 300h, body part selection, color picker |
| `ClothesEditorView` | Clothing editor: template selection + pixel canvas |
| `EditorContentView` | Editor workspace shell: canvas + tools + layers |
| `PartByPartView` | Part-by-part editor mode (body-part focused) |
| `SafeImageView` | Crash-safe async image wrapper with placeholder |
| `StickerEditorOverlayView` | Draggable/rotatable sticker overlay for editor |
| `LoopEditorOverlayView` | Loop selection overlay for animation editing |
| `PublishView` | Publish form: title + description + screenshots (PhotosPicker) + category + tags (capsule pills) + publish/cancel |
| `ChallengesView` | Active/Voting/History tab picker + challenge cards |
| `CommentTreeView` | Threaded comments: indented reply tree with like/reply actions |
| `CodesView` | Promo codes screen: input field + redeem button + history |
| `BanView` | Ban screen: moderation notice with reason and sign-out |
| `HomeView` | Home tab root |
| `SectionItemsView` | Home section detail page (all items of one section) |
| `FavoritesView` | User favorites list (push from Home toolbar) |
| `ContentDetailView` | Generic content detail (push from Home/Catalog) |
| `SearchEmptyStateView` | Empty-state view for zero search results |

---

## Screens & Layouts

```
Screen Inventory (21 primary screens + 4 modal/embedded patterns):
 1. LaunchLoadingView — type: initial (splash)
 2. RootView — type: root state machine (launch → ban | onboarding | main)
 3. MainTabView — type: root TabView (tabs: Home, Create, Library, Community, Profile)
 4. HomeView — type: tab content (Home)
 5. ForgeView — type: tab content (Create)
 6. LibraryView — type: tab content (Library) [file: AvatarsView.swift]
 7. CatalogView — type: tab content (Community)
 8. ProfileView — type: tab content (Profile)
 9. ChatView — type: fullScreenCover (from ForgeView)
10. SettingsView — type: push (from HomeView toolbar)
11. OnboardingFlowView — type: root (pre-auth)
12. TopChartsView — type: push (from HomeView)
13. ChallengesView — type: push (from HomeView)
14. GenerationPreviewView — type: sheet (from ChatView)
15. ExportView — type: sheet (from ChatView/GenerationPreview)
16. AvatarEditorView — type: sheet (from LibraryView)
17. ClothesEditorView — type: sheet (from LibraryView)
18. PublishView — type: sheet (from GenerationPreviewView)
19. CodesView — type: push (from HomeView/ProfileView)
20. PacksView — type: push (from HomeView)
21. BanView — type: root (when account is banned)
--- Modal / embedded patterns ---
M1. CommunityPostDetailView — type: sheet (via deep link, from any tab)
M2. CreatorProfileView — type: sheet (via deep link, from any tab)
M3. FavoritesView — type: push (from HomeView toolbar)
M4. CommentTreeView — type: embedded (in CommunityPostDetailView)
```

### Splash (LaunchLoadingView) — type: initial

```
ZStack [.ignoresSafeArea()]
├─ [BG] LinearGradient (.gradientTop → .gradientBottom) topLeading→bottomTrailing
├─ [DECOR] Circle 240×240 (accentPink 0.18, blur 8, pulse 0.92↔1.08)
├─ [DECOR] Circle 320×320 (accentPrimary 0.14, blur 12, glow 0.96↔1.04)
└─ VStack(sp:24)
   ├─ [CENTER] ZStack — logo
   │  ├─ Circle 146×146 stroke (white 0.55, lineWidth 18)
   │  ├─ Circle 146×146 trim(0.08→0.78) stroke AngularGradient [accentPrimary, accentPink, accentTeal] lineWidth 10
   │  │  └─ .rotationEffect (0→360°, linear 1.3s repeat)
   │  └─ RoundedRectangle(r:28) 96×96 (white 0.88)
   │     └─ .shadow(accentPrimary 0.18, r16, y10)
   │     └─ VStack(sp:8) { cube.fill 30pt + sparkles 14pt }
   │     └─ .scaleEffect(pulse 0.97↔1.03, spring response 0.28 damping 0.72)
   ├─ [CENTER] VStack(sp:8)
   │  ├─ Text("AI Gold Roblox") 28pt .black .rounded
   │  └─ Text("Loading adventures...") 15pt .medium .rounded
   └─ [BOTTOM] LoadingDotsView — HStack(sp:10) 3 dots (12×12 active, 9×9 inactive)
```

### Home (HomeView) — type: tab content

```
NavigationStack
└─ ScrollView(showsIndicators: false)
   ├─ [BG] LinearGradient (.gradientTop → .gradientBottom) .ignoresSafeArea()
   └─ VStack(sp:20) .padding(.horizontal, 16) .padding(.top, 12) .padding(.bottom, tabBarClearance)
      ├─ [SECTION] HomeHeroCard() — CTA → .create tab
      ├─ [SECTION] if activeChallenge → ChallengeBannerView
      ├─ [SECTION] NavigationLink → TopChartsView
      │  └─ HStack(sp:12): icon 40×40 (chart.bar.fill, accentOrange bg r12) + VStack(title 16 bold + sub 12) + chevron.right
      │  └─ .padding(14) .background(cardBackground) .clipShape(RoundedRectangle(r:18))
      ├─ [SECTION] Picker(segmented) — feedTabPicker (HomeFeedTab.allCases)
      ├─ [SECTION] if featured → FeaturedBannerStrip
      │  └─ ScrollView(.horizontal) → HStack(sp:14)
      │     └─ FeaturedBannerCard 280×160 (image fill + black gradient + title/author)
      ├─ [FILL] ForEach(HomeFeedSection) → FeedSection
      │  └─ VStack(sp:12): title 18pt .black + ScrollView(.horizontal) HStack(sp:12) of FeedPostCards
      ├─ [SECTION] if projects → ResumeProjectsSection
      ├─ [SECTION] if favorites → FavoritesSection
      ├─ [SECTION] "BROWSE" header + ForEach dropboxSections → HomeSection
      ├─ [SECTION] if loading → ProgressView
      └─ .onReceive(success) → UINotificationFeedbackGenerator().notificationOccurred(.success)
   └─ [TOP] toolbar: heart.fill 44×44 (→ FavoritesView) + gearshape.fill 44×44 (→ SettingsView)
```

### Create (ForgeView) — type: tab content

```
NavigationStack
└─ ScrollView(showsIndicators: false)
   ├─ [BG] LinearGradient (.gradientTop → .gradientBottom) .ignoresSafeArea()
   └─ VStack(alignment: .leading, sp:20) .padding(16) .padding(.bottom, tabBarClearance)
      ├─ [CTA] generateButton
      │  └─ HStack(sp:12): sparkles 24pt .bold + "GENERATE" 28pt .black
      │  └─ .foregroundColor(.black)
      │  └─ .padding(.horizontal, 34) .padding(.vertical, 24)
      │  └─ .background(LinearGradient [accentOrange → accentPrimary])
      │  └─ .clipShape(RoundedRectangle(r:28))
      │  └─ .shadow(accentPrimary 0.4, r14, y10)
      │  → isShowingProjectPicker = true
      ├─ [SECTION] if templates → templateSection
      │  └─ VStack(sp:12): "START FROM TEMPLATE" header
      │     └─ ScrollView(.horizontal) → HStack(sp:12) of templateCard(220w)
      │        └─ VStack(sp:8) .padding(14) .background(cardBackground) .clipShape(RoundedRectangle(r:16))
      └─ [SECTION] if history → chatHistorySection
         └─ VStack(sp:12): "CHAT HISTORY" header + Picker(segmented, .date/.type)
         └─ grouped session cards
   → .fullScreenCover: ChatView (on project selection)
```

### Chat (ChatView) — type: fullScreenCover

```
ZStack
├─ [BG] LinearGradient (.gradientTop → .gradientBottom) .ignoresSafeArea()
└─ VStack(sp:0)
   ├─ [TOP] HStack — header bar
   │  ├─ Button(xmark) → dismiss
   │  ├─ VStack(title + subtitle)
   │  └─ Button(sidebar.left) → thread browser
   ├─ [FILL] ScrollViewReader → LazyVStack(sp:14)
   │  └─ ForEach(messages)
   │     ├─ User bubble: HStack trailing, max 80%, accentPrimary 0.15 bg, r16
   │     ├─ AI bubble: HStack leading, max 80%, white 0.9 bg, r16
   │     └─ Generation progress: inline progress rail
   │  └─ .padding(.horizontal, 16)
   ├─ [SECTION] if quickReplies → QuickReplyChips
   │  └─ ScrollView(.horizontal) → HStack(sp:8) capsule chips (13pt semibold .rounded)
   └─ [BOTTOM] inputBar
      └─ HStack(sp:10) .padding(.horizontal, 16) .padding(.bottom, 12)
         ├─ Button(paperclip.circle.fill) — attach → UIImpactFeedbackGenerator(.light)
         ├─ if voiceMode → MicButton 72×72
         ├─ else → TextField + send button (paperplane.circle.fill)
         └─ Button(text.bubble.fill / mic.fill) — toggle voice/text, `.contentTransition(.symbolEffect(.replace))`
   └─ [OVERLAY] .sheet: GenerationPreviewView, ExportView
```

### Profile (ProfileView) — type: tab content

```
NavigationStack
└─ ScrollView(showsIndicators: false)
   ├─ [BG] LinearGradient (.gradientTop → .gradientBottom) .ignoresSafeArea()
   └─ VStack(sp:16) .padding(.horizontal, 16) .padding(.bottom, tabBarClearance)
      ├─ [HERO] ProfileHeroCard
      │  └─ VStack: ProfileAvatarView (70×70 circle) + displayName (22pt bold) + username (14pt)
      │  └─ HStack: stats grid (projects/exports/characters counts)
      │  └─ .padding(18) .background(cardBackground) .clipShape(RoundedRectangle(r:20))
      │  └─ .shadow(accentPrimary 0.18, r16, y10)
      ├─ [SECTION] if badges → BadgesSection (horizontal scroll of BadgeView)
      ├─ [SECTION] if portfolio → PortfolioSection
      │  └─ LazyVGrid(2 col, sp:12) of PortfolioItemView
      ├─ [SECTION] ExportHistorySection
      ├─ [SECTION] InterestsSection (capsule chips)
      └─ [SECTION] SocialLinksSection
   └─ [TOP] toolbar: gearshape.fill → SettingsView
```

### Community (CatalogView) — type: tab content

```
NavigationStack
└─ ScrollView(showsIndicators: false)
   ├─ [BG] LinearGradient (.gradientTop → .gradientBottom) .ignoresSafeArea()
   └─ VStack(sp:16) .padding(.horizontal, 16)
      ├─ [TOP] search bar (magnifyingglass + TextField, cardBackground, r20)
      ├─ [SECTION] category chips — ScrollView(.horizontal) capsule pills
      │  └─ spring(response: 0.35, dampingFraction: 0.85) on selection
      ├─ [FILL] LazyVGrid(columns: 2, sp:12)
      │  └─ ForEach(posts) → NavigationLink → CommunityPostDetailView
      │     └─ post card (PostImageView + title + author + stats)
      ├─ [SECTION] NavigationLink → TopChartsView
      └─ [BOTTOM] .padding(.bottom, tabBarClearance)
```

### Library (LibraryView) — type: tab content

```
NavigationStack
└─ ScrollView(showsIndicators: false)
   ├─ [BG] LinearGradient (.gradientTop → .gradientBottom) .ignoresSafeArea()
   └─ VStack(sp:20) .padding(16) .padding(.bottom, tabBarClearance)
      ├─ [SECTION] "EDITORS" header + HStack(sp:12)
      │  ├─ editorCard("Avatars", person.crop.square, → AvatarEditorView sheet)
      │  └─ editorCard("Clothes", tshirt.fill, → ClothesEditorView sheet)
      ├─ [SECTION] if characters → SavedCharactersSection
      │  └─ LazyVGrid(2 col, sp:12) of character cards
      ├─ [SECTION] ProjectHistorySection
      └─ [SECTION] ExportRecordsSection
```

### Settings (SettingsView) — type: push

```
ZStack
├─ [BG] LinearGradient (.gradientTop → .gradientBottom) .ignoresSafeArea()
└─ ScrollView(showsIndicators: false)
   └─ VStack(sp:20) .padding(20)
      ├─ [SECTION] Account section — grouped rows
      │  └─ ForEach(rows): HStack { gradient icon 44×44 (r12) + VStack(title+subtitle) + chevron.right }
      │     └─ .padding(12) .background(cardBackground) .clipShape(RoundedRectangle(r:12))
      ├─ [SECTION] Notifications — 5 toggles with .onChange sync
      │  └─ Toggle rows: comments, likes, followers, generations, challenges
      ├─ [SECTION] App info — version, build
      └─ [SECTION] Destructive — sign out, delete account
```

### Onboarding (OnboardingFlowView) — type: root

```
ZStack
├─ [BG] LinearGradient (.gradientTop → .gradientBottom) .ignoresSafeArea()
└─ VStack(sp:0)
   ├─ [TOP] progress bar — Capsule 8h, filled proportionally
   │  └─ .padding(.horizontal, 24) .padding(.top, 12)
   ├─ [FILL] switch step {
   │  ├─ .intro: welcome text + illustration
   │  ├─ .focus: "Games" / "Content" / "Both" selection cards
   │  ├─ .interests: capsule chip grid (Obby, UGC, Scripts, etc.)
   │  ├─ .auth: AuthView (Google/Apple/Email buttons)
   │  └─ .ready: success state + "Let's Go" CTA
   │  }
   └─ [BOTTOM] HStack { back button (outline) + next/skip button (filled) }
      └─ .padding(.horizontal, 16) .padding(.bottom, 24)
   └─ animation: .spring(response: 0.35, dampingFraction: 0.80–0.82)
```

### Generation Preview (GenerationPreviewView) — type: sheet

```
ZStack
├─ [BG] LinearGradient (.gradientTop → .gradientBottom) .ignoresSafeArea()
└─ ScrollView(showsIndicators: false)
   └─ VStack(sp:18) .padding(20)
      ├─ [TOP] Text(title) .appTitle2
      ├─ [FILL] @ViewBuilder content — switch artifact type:
      │  ├─ .code: ScrollView(.horizontal) monospaced text, cardBackground r20
      │  ├─ .gdd: VStack of GDDCard rows (key-value, r12)
      │  ├─ .text: Text body
      │  ├─ .media: AsyncImage height 300, r16
      │  ├─ .interactive3D: Model3DViewer height 400, r16
      │  ├─ .model3D: ZStack accent bg 0.1, height 400
      │  ├─ .clothingPreview: VStack images height 240 each
      │  ├─ .animationPreview: VideoPlayer + metadata
      │  ├─ .uiPreview: Picker(Preview/Code) + WebView or code
      │  └─ .unavailable: ContentUnavailableView
      │  └─ state icon: `.contentTransition(.symbolEffect(.replace))`
      └─ [BOTTOM] actionBar — HStack(sp:12): Publish / Export / Export GLB/RBXM/FBX buttons
   └─ .sheet: PublishView
   └─ reveal: spring(response: 0.5, dampingFraction: 0.86)
```

### Export (ExportView) — type: sheet

```
ZStack
├─ [BG] LinearGradient (.gradientTop → .gradientBottom) .ignoresSafeArea()
└─ ScrollView(showsIndicators: false)
   └─ VStack(sp:20) .padding(20)
      ├─ [HERO] RoundedRectangle(r:28) height 180, cardBackground
      │  └─ VStack(sp:14): square.and.arrow.up.fill 48pt + fileName + destination summary
      ├─ [SECTION] if clothing → clothingUploadSection
      ├─ [SECTION] ExportSection("Transfer Options") — grouped rows
      ├─ [SECTION] ExportSection("Roblox Flow") — grouped rows
      ├─ [SECTION] ExportSection("Before Publishing") — checklist
      ├─ [ACTIONS] PrimaryButton stack: Save PNG / Upload Roblox / Save RBXM / Share / QR Code / ZIP
      └─ [BOTTOM] PrimaryButton("Done", style: .outline) → dismiss
   └─ .sheet: QRCodeView, ShareSheetView
```

### Tab Bar (MainTabView custom tab) — embedded

```
.safeAreaInset(edge: .bottom, spacing: 0) — conditional on keyboard/tabBarHidden
└─ HStack(sp:0) .padding(.horizontal, 12) .padding(.top, 10) .padding(.bottom, 6)
   └─ .background(cardBackground .clipShape(RoundedRectangle(r:24)) .shadow(accentPrimary 0.12, r10, y-2))
   └─ .padding(.horizontal, 16) .padding(.top, 8) .padding(.bottom, 6)
   └─ ForEach(RootTab.allCases) → tabButton
      └─ VStack(sp:4) .frame(maxWidth: .infinity)
         ├─ ZStack: Circle (RadialGradient tab.color) .frame(size) + Image(tab.icon) white
         │  └─ size: 54 (.create selected), 48 (.create), 46 (selected), 40 (default)
         │  └─ .shadow(isSelected ? tab.color 0.5 r6 y2 : clear)
         │  └─ .scaleEffect(popAnimation == tab ? 1.08 : 1.0)
         └─ Text(tab.label) 10pt .rounded (bold if selected)
      └─ .animation(.spring(response: 0.22, dampingFraction: 0.70))

Tabs: home (house.fill, accentPrimary) · create (waveform.badge.mic, accentTeal) · library (square.stack.3d.up.fill, accentOrange) · community (person.3.sequence.fill, accentSecondary) · profile (person.crop.circle.fill, #8560FF)
```

### Challenges (ChallengesView) — type: push

```
ScrollView(showsIndicators: false)
├─ [BG] LinearGradient (.gradientTop → .gradientBottom) .ignoresSafeArea()
└─ VStack(sp:20) .padding(.horizontal, 16) .padding(.top, 12) .padding(.bottom, 100)
   ├─ [TOP] tabPicker — HStack(sp:8) capsule buttons (Active/Voting/History)
   │  └─ 14pt bold, padding-h 18 / v 10, accentPrimary bg when selected
   └─ [FILL] switch selectedTab:
      ├─ .active: ActiveChallengeCard — image 240h + title 24 black + desc + stats HStack(sp:16) + ChallengeCountdownView + submit CTA
      │  └─ .padding(18) .background(cardBackground) .clipShape(RoundedRectangle(r:20))
      ├─ .voting: VotingChallengeCard
      └─ .history: LazyVStack(sp:14) of CompletedChallengeRow
         └─ HStack(sp:12): icon 40 + title/date + "View" .padding(12) .background(cardBackground) .clipShape(r:12)
```

### Publish (PublishView) — type: sheet

```
NavigationStack
├─ [BG] LinearGradient (.gradientTop → .gradientBottom) .ignoresSafeArea()
└─ ScrollView
   └─ VStack(sp:18) .padding(20)
      ├─ [TOP] titleField (TextField, cardBackground r16)
      ├─ [SECTION] descriptionField (TextEditor, minHeight 120, r16)
      ├─ [SECTION] PhotosPicker → HStack of thumbnail (100×100) + add button
      ├─ [SECTION] category picker (capsule chips)
      ├─ [SECTION] tagsField — capsule pills with xmark.circle.fill remove
      └─ [BOTTOM] PrimaryButton("Publish", filled) + PrimaryButton("Cancel", outline)
```

### Avatar Editor (AvatarEditorView) — type: sheet

```
ZStack
├─ [BG] LinearGradient (.gradientTop → .gradientBottom) .ignoresSafeArea()
└─ VStack(sp:0)
   ├─ [TOP] header: Close (xmark) + title + Save (square.and.arrow.down.fill)
   ├─ [FILL] SceneKit preview 300h (cardBackground r20)
   │  └─ overlay: rotation controls (arrow.triangle.2.circlepath)
   ├─ [SECTION] body part selector — HStack(sp:10) capsule chips
   ├─ [SECTION] color swatch grid 30×30 circles
   └─ [BOTTOM] PrimaryButton("Apply", filled)
```

### Ban (BanView) — type: root

```
ZStack
├─ [BG] LinearGradient (.gradientTop → .gradientBottom) .ignoresSafeArea()
└─ VStack(sp:20) .padding(24)
   ├─ Icon: exclamationmark.shield.fill 64pt (accentSecondary)
   ├─ Text "Account Suspended" 22pt bold
   ├─ Text reason (body)
   └─ PrimaryButton("Sign Out", outline)
```

### Codes (CodesView) — type: push

```
ScrollView
├─ [BG] LinearGradient (.gradientTop → .gradientBottom) .ignoresSafeArea()
└─ VStack(sp:16) .padding(16)
   ├─ [TOP] header card: number.square icon + title
   ├─ [INPUT] TextField "Enter code" + PrimaryButton("Redeem")
   │  └─ .padding(14) .background(cardBackground) .clipShape(r:16)
   └─ [HISTORY] LazyVStack of redeemed rows
      └─ HStack: checkmark.circle.fill + code + date + reward
```

### Packs (PacksView) — type: push

```
ScrollView
├─ [BG] LinearGradient (.gradientTop → .gradientBottom) .ignoresSafeArea()
└─ LazyVGrid(2 col, sp:12) .padding(16)
   └─ ForEach(packs) → packCard
      └─ VStack(sp:8): image (160×120) + title 14 bold + description 12 + price/badge
      └─ .padding(12) .background(cardBackground) .clipShape(r:16)
```

### Items (ItemsView) — type: embedded

```
LazyVStack(sp:10)
└─ ForEach(items) → ItemRowView
   └─ HStack(sp:12): thumbnail 50×50 r8 + VStack(title 16 + meta 12) + chevron.right
   └─ .padding(12) .background(cardBackground) .clipShape(r:12)
```

---

## Key Icons (SF Symbols)

**Tab bar:** `house.fill` (Home) · `waveform.badge.mic` (Create/Forge) · `square.stack.3d.up.fill` (Library) · `person.3.sequence.fill` (Community) · `person.crop.circle.fill` (Profile)

**Navigation:** `chevron.left` (back) · `chevron.right` (forward/disclosure) · `chevron.down` (expand) · `chevron.up.chevron.down` (sort) · `xmark` (close) · `xmark.circle.fill` (clear field) · `sidebar.left` (thread browser)

**Actions:** `sparkles` (AI generate, create) · `paperplane.fill` / `paperplane.circle.fill` (send) · `square.and.arrow.up` / `square.and.arrow.up.fill` (share/export) · `arrow.down.circle` (download) · `arrow.down.doc.fill` (download doc) · `arrow.up.circle.fill` (upload) · `arrow.right.circle.fill` (continue) · `arrow.up.right.square.fill` (external link) · `arrow.clockwise` (refresh) · `arrowshape.turn.up.left` (reply) · `doc.on.doc` (copy) · `pencil` (edit) · `plus.circle.fill` (add) · `heart` / `heart.fill` (favorite) · `hand.thumbsup` / `hand.thumbsup.fill` (like)

**Voice/Audio:** `mic.fill` (microphone) · `stop.fill` (stop recording) · `waveform` (audio waveform) · `waveform.badge.mic` (voice input)

**Content:** `cube.fill` / `cube.transparent` / `cube.transparent.fill` (3D model) · `photo` (image) · `photo.stack` (gallery) · `tshirt.fill` (clothing) · `paintbrush.pointed.fill` (editor) · `gamecontroller.fill` (game) · `hand.draw` (drawing)

**Social:** `person.crop.square` (avatar) · `person.crop.circle.fill.badge.checkmark` (verified) · `bubble` / `bubble.left.fill` (comment) · `text.bubble.fill` (text input mode) · `star.fill` (rating) · `globe` (web link)

**Organization:** `chart.bar.fill` (stats/charts) · `trophy` / `trophy.fill` (achievement) · `crown.fill` (top/champion) · `square.grid.2x2.fill` (grid) · `rectangle.3.group.fill` (group) · `doc.fill` / `doc.text.fill` (document) · `doc.badge.gearshape` (settings doc) · `shippingbox.fill` (items) · `magnifyingglass` (search) · `lightbulb.fill` (idea/tip)

**Status:** `checkmark.circle.fill` (success) · `checkmark.seal.fill` (verified) · `seal.fill` (seal) · `exclamationmark.circle.fill` (info/warn) · `exclamationmark.triangle.fill` (warning) · `exclamationmark.shield.fill` (error/ban) · `hourglass` (loading) · `bolt.fill` (fast/processing) · `cpu` (AI processing) · `clock.fill` (time) · `wifi.slash` (no connection) · `folder.badge.questionmark` (not found)

**Attachments:** `paperclip.circle.fill` (attach file) · `arrow.up.left.and.arrow.down.right` (expand)

**Dynamic state (conditional strings):** `heart` ↔ `heart.fill` · `bookmark` ↔ `bookmark.fill` · `circle` ↔ `checkmark` ↔ `circle.dotted` (selection/processing) · `play.circle.fill` ↔ `pause.circle.fill` (media) · `checkmark` ↔ `plus` (follow)

---

## Dimensions (key)

| Element | Size |
|---|---|
| Mic button (core) | 72×72 |
| Mic button (glow halo) | 88×88 |
| Tab button (create, selected) | 54×54 |
| Tab button (create, default) | 48×48 |
| Tab button (selected) | 46×46 |
| Tab button (default) | 40×40 |
| Toolbar icon frame | 44×44 |
| Settings icon background | 44×44 |
| Profile avatar | 70×70 |
| Challenge icon / nav row icon | 40×40 |
| Icon badges (small) | 32×32 – 36×36 |
| Status checkmark (micro) | 22×22 – 26×26 |
| Splash logo outer ring | 146×146 |
| Splash logo inner rect | 96×96 |
| Splash decorative circles | 240×240, 320×320 |
| Featured banner card | 280×160 |
| Template card width | 220 |
| Content grid tile | 160×120 |
| Media preview height | 300 |
| 3D model preview height | 400 |
| Challenge image height | 240 |
| Export hero card height | 180 |
| Clothing preview height | 240 |
| Avatar editor preview | 300h |
| Generation preview container | 340–380h |
| Search bar height | 52 |
| CTA button height (standard) | 54 |
| CTA button padding | 34h / 24v (large), 14v (standard) |
| Loading dots | 12×12 (active), 9×9 (inactive) |
| Tab bar corner radius | 24 |
| Screenshot thumbnail | 100×100 |
| Packs card image | 160×120 |
| Items row thumbnail | 50×50 |
| Color swatch | 30×30 |
| Progress bar | Capsule 8h |
