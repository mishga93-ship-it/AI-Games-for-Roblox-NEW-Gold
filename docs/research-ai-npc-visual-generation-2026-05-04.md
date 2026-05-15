# Research: AI NPC Visual Generation Quality

**Date**: 2026-05-04
**Context**: generated AI NPCs look too simple: weak accessories, unreadable/no face, not recognizable. The fix must be universal: users can ask for any NPC, not only a floating superhero quest giver.

## Executive Summary

The current default NPC path is technically stable but visually capped. After sessions 174 and 176, new NPCs default to `asset_template_v1` / Animated R15, which avoids the repeated moving-mesh split/fly-away failures. That part is correct and should not be reverted.

The visual weakness comes from the next layer:

- Known NPC roles/archetypes skip `generateNpcVisuals` in `apps/functions/src/index.ts` through `usesTemplateFirstNpcVisuals()`.
- In `apps/functions/src/robloxWorker.ts`, `usesTemplateFirstVisuals` ignores `metadata.npcVisualConfig` palette, transparency, floats, and accessories whenever `npcTemplateKind !== "default"`.
- The deterministic kits are mostly welded primitive `Part`s, not real Roblox avatar `Accessory` assets with `Handle` + `Attachment`.
- The normal Roblox smile `Decal` is suppressed for non-default templates, and the replacement face is made from tiny `Part`s (`FaceEyeL`, `FaceBrowL`, `FaceNose`, `FaceMouth`). From gameplay camera distance this reads as "no face".
- `addNpcAssetTemplateLayer()` has its generic geometry disabled after sessions 160/162, so `asset_template_v1` currently mostly means "deterministic R15 kit + animation/audio markers", not a true rich avatar asset layer.

This explains the screenshot: the RBXM contains markers like `SuperheroHeroCapeBack`, `SuperheroHeroLaserEye*`, `SuperheroFaceEye*`, and `QuestMarker*`, but the visual language is still simple block parts, the face is too small, and the result does not preserve user-specific identity beyond "superhero + quest".

## Do Not Repeat

These approaches have already failed or were intentionally rolled back:

- Do not make Moving 3D Mesh the default again. Sessions 147-174 repeatedly hit split, fly-away, static shell, follow-loop, and missing asset issues.
- Do not let unconstrained LLM accessories be the only source of visual quality. Sessions 112, 116, 118, 120, and 122 show weak/oversized LLM details, giant head cylinders, and random visual drift.
- Do not rely on random free Creator Store models through runtime loading. Roblox asset loading has ownership/settings restrictions and can fail.
- Do not add broad generic overlay geometry on top of dedicated kits. Sessions 160/162 disabled this because it created large chest/head slabs over finished robot/guard kits.

## Current Pipeline Map

1. iOS / chat collects NPC role, theme, appearance, behavior, and visual hooks.
2. Backend extracts `npcRole`, `theme`, `appearance`, `visualDescription`, animation style, quest/shop/combat info.
3. Backend default visual pipeline is `asset_template_v1` after session 174.
4. Backend calls `usesTemplateFirstNpcVisuals(prompt, role, metadata)`.
   - If role is not `dialogue`, it returns true.
   - If role is `dialogue` but prompt has known archetype keywords, it also returns true.
   - When true, backend skips `PROMPT_CATALOG.generateNpcVisuals`.
5. Worker resolves `npcTemplateKind` and sets `usesTemplateFirstVisuals = isNpcFallbackModel && npcTemplateKind !== "default"`.
6. For template NPCs:
   - `paletteFromVisualConfig()` is ignored.
   - `bodyTransparency` is ignored.
   - `npcVisualConfig.accessories` is ignored.
   - deterministic role/archetype kit is applied.
7. Face:
   - Default Roblox `face` decal is suppressed for non-default templates.
   - A small primitive expression kit is added.

Net: stable R15, but low content entropy. Different prompts converge to a small set of deterministic kits.

## Local RBXM Findings

File checked:

`/Users/test/Downloads/парящий-супергерой-квест-гивер-pipeline.rbxm`

The RBXM is around 59 KB and includes:

- `archetype:"superhero"` in `NPCVisualConfig`
- `SuperheroHeroCapeBack`, cape folds, chest suit, chest emblem, mask, laser eyes, flight aura
- `QuestMarkerStem`, `QuestMarkerDot`, scroll/book/quest badge/runes
- `SuperheroFaceEyeL/R`, brows, nose, mouth markers
- `Take Quest` prompt and `Quest` UI

So the current file is not missing all parts in the manifest. The problem is perceptual quality:

- the accessories are primitive welded parts, not avatar-quality mesh accessories;
- the face parts are too small/subtle at camera distance;
- there is no hair/head identity layer;
- the nameplate and `Quest` label visually dominate the character;
- the kit is still "superhero role props" rather than a user-specific recognizable character.

## Web Research Findings

### 1. Stable interactive NPCs should stay R15/Humanoid

Roblox character docs and the project's own failures point to the same conclusion: an interactive NPC that patrols, talks, gives quests, shows nameplate/health, and uses standard animations should remain a real Humanoid/R15-compatible rig. A single AI mesh shell can look better statically, but without correct rigging/skinning it does not become a living Roblox NPC.

Relevant sources:

- Roblox character specifications: https://create.roblox.com/docs/art/characters/specifications
- Avatar Auto Setup requirements: https://create.roblox.com/docs/avatar-setup/auto-setup-requirements

Key implication: keep Animated R15 as default. Premium mesh bodies are a separate "custom body / Auto Setup" pipeline, not the default for every NPC.

### 2. Real avatar-quality appearance uses HumanoidDescription and Accessory

Roblox `HumanoidDescription` is designed to describe Humanoid appearance: body colors, scales, clothing, animations, faces, and accessories. It can apply face IDs and comma-separated accessory IDs (`HairAccessory`, `HatAccessory`, `FaceAccessory`, `BackAccessory`, `FrontAccessory`, `NeckAccessory`, `ShouldersAccessory`, `WaistAccessory`, etc.).

Roblox `Accessory` is the proper wearable container. It uses a `Handle`; if the handle has an `Attachment` matching one on the character limb, Roblox attaches it correctly.

Relevant sources:

- HumanoidDescription: https://create.roblox.com/docs/reference/engine/classes/HumanoidDescription
- Accessory class: https://create.roblox.com/docs/reference/engine/classes/Accessory
- Rigid accessories: https://create.roblox.com/docs/art/accessories
- Rigid/accessory specs: https://create.roblox.com/docs/art/accessories/clothing-specifications

Key implication: the long-term "recognizable NPC" path needs actual avatar item slots and Accessory containers, not only welded decorative `Part`s.

### 3. Faces need a proper face asset/decal strategy

Roblox `HumanoidDescription.Face` expects a Face asset ID, not a generic Decal/Image ID. Roblox renders the actual face texture as a Decal named `face` or `Face` under the Head.

Relevant source:

- HumanoidDescription Face / FaceAccessory docs: https://create.roblox.com/docs/reference/engine/classes/HumanoidDescription/FaceAccessory

Key implication: the current tiny part-based face expression kit is not enough. The generator needs a visible face layer:

- curated Face asset IDs for common moods;
- or generated/uploaded face decal textures;
- or larger, high-contrast procedural eyes/mouth as fallback.

### 4. Random external assets are risky unless curated

`InsertService:LoadAsset()` can load only assets owned by the game creator, shared by the owner, owned by Roblox, or benign OpenUse asset types like shirts/pants/avatar accessories. `AssetService:LoadAssetAsync()` can load public third-party assets only if "Allow Loading Third Party Assets" is enabled in Studio Experience Settings; by default it behaves like the old ownership check.

Relevant sources:

- InsertService docs: https://create.roblox.com/docs/reference/engine/classes/InsertService
- AssetService docs: https://create.roblox.com/docs/reference/engine/classes/AssetService

Key implication: do not pick arbitrary free models at runtime. Build a curated allowlist of avatar asset IDs and owned/generated assets.

### 5. Catalog/inventory APIs can power a curated content library

Roblox `AvatarEditorService:SearchCatalogAsync()` can search catalog items using `CatalogSearchParams` (asset types, price, keyword, sort). Open Cloud Inventory API can check owned items and inventory categories such as clothing/accessories/faces/hair/heads.

Relevant sources:

- Avatar Editor Service / Search the Marketplace: https://create.roblox.com/docs/players/avatar-editor
- AvatarEditorService reference: https://create.roblox.com/docs/reference/engine/classes/AvatarEditorService
- Inventory API: https://create.roblox.com/docs/cloud/guides/inventory

Key implication: the scalable content solution is a local curated NPC visual library built from verified IDs, not prompt-time random browsing.

### 6. Custom generated accessories are possible, but should be separate assets

Roblox rigid accessory workflow expects a single mesh, textures, and attachment. Accessory geometry should meet budgets (commonly 4k triangles for accessories), be watertight, and use correct attachment points. Avatar Auto Setup can convert bundled body/accessory/clothing models, but custom bodies have strict requirements: humanoid shape, A/T pose, front facing negative Z, watertight geometry, head components, texture maps, and no accessories in the body mesh.

Relevant sources:

- Rigid accessory creation: https://create.roblox.com/docs/art/accessories/creating-rigid
- Auto Setup requirements: https://create.roblox.com/docs/avatar-setup/auto-setup-requirements

Key implication: high-fidelity arbitrary NPC generation should produce separate owned assets:

- body if premium/skinned path;
- accessory meshes for hats/weapons/props;
- textures/face decals;
- then attach/equip them through Roblox-native mechanisms.

## Content Architecture Needed

The generator should stop thinking "one archetype = one kit" and move to composable Visual DNA:

- **Role**: quest giver, merchant, guard, boss, companion, enemy, dialogue, trainer, healer, banker, blacksmith, pet keeper.
- **Species/body**: human, elf, dwarf, gnome, robot, spirit, skeleton, zombie, beast, alien, elemental, slime, golem.
- **Genre/style**: fantasy, sci-fi, cyberpunk, medieval, pirate, modern city, anime, horror, royal, tribal, western, meme.
- **Silhouette**: tall, tiny, bulky, hunched, floating, winged, cloaked, armored, animal-like, mechanical.
- **Face identity**: expression, eyes, brows, mouth, scars, glasses, mask, beard, hair, dynamic head if available.
- **Outfit layer**: shirt/pants/robe/armor/apron/uniform/jacket/cloak/cape/tabard.
- **Props**: staff, sword, shield, book, scroll, map, lantern, satchel, coin pouch, backpack, tool belt, instrument, pet.
- **VFX/material**: glow, aura, particles, trails, ForceField/Neon/Ice/Metal/Fabric/Wood.
- **Behavior marker**: quest marker, shop sign, patrol map, danger aura, companion heart, boss crown.

Minimum visual quality contract per NPC:

- one readable face/expression layer;
- one hair/hat/helmet/mask identity layer;
- one torso outfit layer;
- one shoulder/neck detail;
- one belt/waist detail;
- one hand-held or back prop;
- one boot/cuff/leg detail;
- one role marker;
- one optional VFX layer when theme requires it.

## Universal Archetype Families

These should be data-driven families, not hardcoded one-off branches:

- Fantasy: mage, sage, knight, archer, healer, alchemist, druid, bard.
- Sci-fi/cyber: robot, android, police, hacker, medic, engineer, drone handler.
- Horror/undead: ghost, skeleton, zombie, vampire, demon, cursed doll, wraith.
- Elemental: fire, ice, storm, nature, shadow, light, toxic, crystal.
- Professions: merchant, blacksmith, miner, farmer, fisherman, chef, banker, trainer.
- Royal/boss: king, queen, emperor, overlord, champion, final boss.
- Modern/city: cop, agent, street vendor, athlete, influencer, school NPC.
- Creature/beast: wolf, dragonborn, slime, golem, alien, plant creature.
- Meme/brainrot: skibidi-style, sigma, gen-alpha, viral mascots, roast NPC.
- Quest/utility overlays: quest giver, shop, patrol, companion, enemy, boss, dialogue-only.

Each NPC should combine families: "ghost merchant", "cyber police enemy", "forest ranger quest giver", "royal fire boss", etc.

## Recommended Implementation Plan

### Phase 1 - Immediate quality fix

Goal: keep stable R15 default but make every generated NPC visibly recognizable.

1. Restore a visible face strategy for all template NPCs.
   - Add curated Face IDs by mood when safe.
   - Add a fallback high-contrast decal or larger procedural face if Face ID unavailable.
   - Keep masks/visors from covering the entire face unless the prompt asks for it.

2. Add an additive LLM accent layer for template NPCs.
   - Keep deterministic template as the quality floor.
   - Run `generateNpcVisuals` for all NPCs, but treat output as **accent details only** for known templates.
   - Do not let LLM override palette/scale/role kit for known archetypes.
   - Allow only safe slots and small details: badges, runes, gems, scars, cuffs, pouches, hand glow, small face marks, jewelry.
   - Block giant head cylinders and giant torso slabs.

3. Use actual `Accessory` containers for major props.
   - Hats, back items, face accessories, shoulders, waist, and held props should use `Accessory` + `Handle` + matching `Attachment` when possible.
   - Keep welded `Part`s only as fallback/micro details.

4. Strengthen the quality gate.
   - Fail or warn if no face layer exists.
   - Warn if fewer than 8 visible details are present.
   - Require coverage of head, torso, waist, hand/back, feet/legs.
   - Require material and color contrast.
   - Store manifest markers so Studio screenshots can be diagnosed.

5. Reduce UI occlusion.
   - Quest/name labels should not hide the head/face.
   - Quest marker can be offset higher or smaller when face details exist.

### Phase 2 - Curated avatar content library

Goal: make NPCs look like Roblox-avatar quality, not primitive blocks.

Create a local data file, e.g. `npcVisualLibrary.ts` or JSON:

- faces by mood: friendly, stern, evil, magical, sleepy, wise, smirk, neutral;
- hair/beards by species/age/style;
- hats/helmets/hoods/crowns by archetype;
- face accessories: glasses, visors, masks, scars;
- back accessories: capes, wings, backpacks, quivers;
- shoulders/neck/waist: armor, collars, scarves, belts, pouches;
- held/back props: swords, staffs, shields, tools, books, lanterns;
- clothing: shirt/pants IDs by role palette;
- metadata: `assetId`, slot, style tags, color tags, creator/source, loadability, verified date, fallback.

Selection should be deterministic and tag-based:

`visualDNA = role + species + genre + mood + props + palette`

Then choose matching curated assets and apply them through `HumanoidDescription` and/or generated `Accessory` objects.

### Phase 3 - Owned generated accessory assets

Goal: support "anything" beyond catalog items.

For prompts with no good curated match:

1. Generate separate accessory meshes/textures, not one whole NPC shell.
2. Upload as owned Roblox assets.
3. Attach via `Accessory` to R15.
4. Cache by prompt hash so retries reuse assets.
5. Keep moderation/asset-upload failures as partial stage warnings, not silent downgrade.

Examples:

- "crystal mushroom wizard hat" -> generated Hat Accessory.
- "living backpack with teeth" -> generated Back Accessory.
- "floating hologram quest tablet" -> generated Front/Back Accessory.

### Phase 4 - Premium custom body path

Goal: high-fidelity static or skinned NPCs when the user explicitly wants it.

Use Avatar Auto Setup / skinned pipeline only for premium cases:

- full-body custom mesh;
- stricter prompt constraints: humanoid, A/T pose, negative Z front, no accessories in body mesh;
- separate accessories bundled with base body;
- longer generation time and clearer failure state.

This should remain separate from default interactive NPC generation.

## Suggested Code Targets

- `apps/functions/src/index.ts`
  - Change `usesTemplateFirstNpcVisuals()` behavior from "skip LLM visuals" to "template-first + safe accent visuals".
  - Store `npcVisualConfigMode: "accent_layer"` for known templates.

- `apps/functions/src/promptCatalog.ts`
  - Split `generateNpcVisuals` into:
    - `generateNpcVisualDNA` - structured tags and requested visual slots.
    - `generateNpcAccentLayer` - safe small details only.

- `apps/functions/src/robloxWorker.ts`
  - Stop fully ignoring `metadata.npcVisualConfig` for template NPCs.
  - Apply it after deterministic kit as safe accent layer.
  - Add face decal / face asset selection for non-default NPCs.
  - Convert major deterministic props from plain `Part` + `WeldConstraint` to `Accessory` where practical.
  - Add `NPCVisualQualityGate` checks for face/detail/slot coverage.

- New file:
  - `apps/functions/src/npcVisualLibrary.ts`
  - Curated item IDs, style tags, loadability status, and fallback chains.

## Expected Result

After Phase 1:

- A superhero quest giver still uses stable R15, but has a readable face, hair/mask identity, cape/suit/quest details, and user-specific accent details.
- A ghost merchant gets ghost visuals plus merchant props, not only one branch.
- A cyber police enemy gets robot + police + enemy + face/visor identity.
- A completely custom NPC gets template floor plus safe visual accents instead of default minimal blocks.

After Phase 2:

- NPCs start looking like recognizable Roblox avatar characters because real face/hair/hat/back/accessory IDs are applied.

After Phase 3/4:

- "Anything" prompts can get generated unique accessories or premium bodies without destabilizing default NPC behavior.

## Sources

- Roblox HumanoidDescription: https://create.roblox.com/docs/reference/engine/classes/HumanoidDescription
- Roblox Accessory class: https://create.roblox.com/docs/reference/engine/classes/Accessory
- Roblox rigid accessories: https://create.roblox.com/docs/art/accessories
- Roblox accessory/clothing specifications: https://create.roblox.com/docs/art/accessories/clothing-specifications
- Roblox character specifications: https://create.roblox.com/docs/art/characters/specifications
- Roblox Avatar Auto Setup requirements: https://create.roblox.com/docs/avatar-setup/auto-setup-requirements
- Roblox AssetService: https://create.roblox.com/docs/reference/engine/classes/AssetService
- Roblox InsertService: https://create.roblox.com/docs/reference/engine/classes/InsertService
- Roblox Avatar Editor Service: https://create.roblox.com/docs/players/avatar-editor
- Roblox Inventory API: https://create.roblox.com/docs/cloud/guides/inventory
