# Research: Roblox NPC & AI Systems (2024-2025)

Date: 2026-04-10

---

## 1. NPC Creation Best Practices

### Architecture Patterns

**Single-Script Controller** -- One server script manages all NPCs using CollectionService tags. Pattern:
- `CollectionService:GetInstanceAddedSignal("NPC")` -> `SetUpHumanoid()` -> `StartAI()`
- Best for 30+ NPCs; avoids per-NPC script overhead

**Parallel Luau** -- For 100+ NPCs, use Roblox's multithreading API to run NPC AI logic across threads. Key resource: [Parallel Luau Docs](https://create.roblox.com/docs/scripting/multithreading)

**AnimationController vs Humanoid** -- For high-count NPCs (2000+), replace Humanoid with AnimationController to eliminate per-Humanoid overhead. NPC System V2 uses this approach.

**Server-Authoritative + Client Rendering** -- Server stores positions/health; clients handle physics/animations. Reduces network traffic dramatically.

### Core NPC Components (Standard)
- HumanoidRootPart (invisible root)
- Humanoid (health, walkspeed, state)
- Body parts connected via Motor6D
- Animations folder + Animate script
- NPC behavior script
- Configuration object for tunable parameters

### Official NPC Kit
Roblox provides 4 pre-built NPCs: Drooling Zombie, Soldiers, RO-01 Robots, NP-C 9000 Robots. Uses CollectionService tags for friend/enemy factions.
- Docs: https://create.roblox.com/docs/resources/npc-kit

### Key Sources
- [DevForum: How to make a good NPC system](https://devforum.roblox.com/t/how-do-i-make-a-good-npc-system/2945594)
- [DevForum: How should NPCs be handled](https://devforum.roblox.com/t/how-should-npcs-be-handled/2774722)
- [DevForum: Parallel Luau NPCs](https://devforum.roblox.com/t/parallel-luau-npcs/3812177)
- [General Combat NPC Tutorial](https://devforum.roblox.com/t/general-combat-npc-tutorial/1862031)

---

## 2. AI NPC Dialogue Systems

### Roblox's Native Text Generation API (OFFICIAL -- Best Option)
- **What**: LLM-powered text generation built into Roblox, free during beta
- **Rate limit**: 100 requests/second per experience
- **Token limits**: 5,000 input / 1,000 output tokens
- **Chat history**: Last 20 messages per user per session
- **Language**: English only (currently)
- **Safety**: Built-in moderation against Community Standards
- **Requirements**: ID verification + Moderate or Restricted content maturity
- **Docs**: [Text Generation API](https://devforum.roblox.com/t/beta-introducing-text-generation-api/3556520)
- **Best for**: Dynamic NPC conversations, quest givers, interactive tutorials

### ChatGPT/OpenAI Integration (External)
- Uses HTTPService to call OpenAI API via proxy server
- Multiple DevForum tutorials available
- Costs: OpenAI API token-based pricing
- Can use GPT Assistants API for personality/memory
- **Key tutorials**:
  - [Creating a ChatGPT-Integrated NPC](https://devforum.roblox.com/t/creating-a-chatgpt-integrated-npc-in-roblox/3034021)
  - [AI Powered NPCs With ChatGPT Assistants](https://devforum.roblox.com/t/ai-powered-npcs-with-chatgpt-assistants/3095179)

### Inworld AI (Commercial Platform)
- Full character engine: personality, emotions, long-term memory, autonomous goals
- No-code character creation via studio.inworld.ai
- Roblox SDK available as plugin
- Demo: "AI Wonderland" Roblox experience
- Setup: Install SDK plugin -> Set API key/secret -> Configure scene -> Characters respond in real-time
- **Docs**: https://docs.inworld.ai/docs/tutorial-integrations/roblox/
- **Best for**: Complex NPCs with personality, emotions, memory

### Built-in Dialog Object (Simple)
- Insert Dialog into NPC Head
- Set InitialPrompt + Responses in Properties
- Player sees speech bubble, clicks to interact
- Branching responses supported
- No code required for basic setup
- **Docs**: https://create.roblox.com/docs/reference/engine/classes/Dialog

### Proximity Prompt Pattern (Most Popular for Custom)
- ProximityPrompt in NPC torso -> triggers BillboardGui dialogue
- Player presses E near NPC -> dialogue appears
- Commonly combined with custom UI for typewriter effects
- **Reference**: https://create.roblox.com/docs/ui/proximity-prompts

### Community Dialogue Systems
- **RoSpeak** -- Easy setup, typed text with sound effects, word highlighting, configurable audio. [DevForum](https://devforum.roblox.com/t/rospeak-a-customizable-npc-chat-and-dialogue-system-version-1/3772098)
- **Dialogue Maker** -- Open-source RPG dialogue plugin with visual GUI editor. [GitHub](https://github.com/Beastslash/roblox-dialogue-maker)
- **Advanced NPC Dialogue System** -- Branching dialogue, backtracking, animation support. [BuiltByBit](https://builtbybit.com/resources/advanced-npc-dialogue-system.62699/)

---

## 3. R15/R6 Character Model Format

### R15 Structure (Default, Recommended)
- 15 body parts (vs 6 for R6)
- More joints = better animation fidelity
- Uses MeshParts for body components
- Connected via Motor6D joints
- PrimaryPart must be HumanoidRootPart

### Avatar Auto Setup (Official Tool)
Automatically rigs, cages, segments, and skins 3D models for Roblox.

**Input Requirements**:
- Single or multiple mesh body (tool recombines)
- Watertight geometry (except eyes/mouth)
- A-pose or T-pose (T-pose preferred)
- Face negative Z axis
- Humanoid shape: 2 arms, 2 legs, torso, head
- Symmetrical around Y-axis
- Must include texture maps (supports PBR: albedo, normal, metalness, roughness)
- No accessories, hair, eyebrows, beards, eyelashes

**Polygon Budget** (Total: 10,742 triangles max):
| Body Part | Max Triangles |
|-----------|---------------|
| Head | 4,000 |
| Each Arm | 1,248 |
| Each Leg | 1,248 |
| Torso | 1,750 |

**Head Requirements**:
- Two separate eye meshes (half-sphere, no shared vertices with head)
- Three mouth parts: upper teeth, lower teeth, tongue
- Each singly connected, no shared vertices

**Rigging** (optional -- auto-setup generates if absent):
- Max 15 standard bones for body
- Facial rig needs RootFaceJoint bone
- Min 17 required facial poses
- Max 4 bone influences per vertex

**Docs**: https://create.roblox.com/docs/avatar-setup/auto-setup-requirements

### R15 Part Names (Standard Convention)
Head, UpperTorso, LowerTorso, LeftUpperArm, LeftLowerArm, LeftHand, RightUpperArm, RightLowerArm, RightHand, LeftUpperLeg, LeftLowerLeg, LeftFoot, RightUpperLeg, RightLowerLeg, RightFoot

### Import Pipeline
1. Model in Blender/Maya (FBX format)
2. Avatar tab in Roblox Studio -> Import FBX
3. Verify Humanoid structure matches R15
4. Set PrimaryPart to HumanoidRootPart
5. Or: use Avatar Auto Setup for automatic processing

**Docs**: https://create.roblox.com/docs/art/characters/import

---

## 4. AI-Generated 3D Model to Roblox Pipeline

### Roblox Cube 3D (Official, Native)
- Built-in mesh generation in Roblox Studio
- Text prompts generate 3D meshes (e.g., "/generate a motorcycle")
- Beta API available for in-experience use
- **Docs**: [Cube 3D Announcement](https://devforum.roblox.com/t/beta-cube-3d-generation-tools-and-apis-for-creators/3558947)

### Meshy AI -> Roblox (Recommended Third-Party)
- Text-to-3D and Image-to-3D generation
- **Meshy Roblox Bridge**: Direct upload to Creator Hub inventory
- Exports: GLB, FBX, OBJ, STL
- Roblox Studio plugin available
- Requires polygon reduction for Roblox performance standards
- **Docs**: https://docs.meshy.ai/en/roblox-plugin/introduction
- **Guide**: https://www.meshy.ai/blog/roblox-3d-model

### Sloyd AI
- Text-to-3D with dedicated Roblox preset
- Image-to-3D support
- Optimized output for Roblox technical requirements
- **Site**: https://www.sloyd.ai/use-case/roblox-developers

### Tripo AI
- Generates models in 8-10 seconds
- Magic Brush for texture adjustments
- Smart Low-Poly for polygon reduction
- **Guide**: https://www.tripo3d.ai/blog/export-ai-3d-model-to-roblox

### 3D AI Studio
- Image-to-3D conversion
- Quad remeshing for game-ready topology
- Roblox-optimized output
- **Site**: https://www.3daistudio.com/UseCases/Roblox

### General Pipeline Steps
1. Generate model (text/image prompt) in AI tool
2. Download as GLB or FBX
3. (Optional) Optimize in Blender: reduce polys, fix scale
4. Import to Roblox Studio (Avatar tab for characters, 3D Importer for props)
5. Scale: Roblox uses "studs" unit system (1 stud ~ 0.28m)
6. FBX for animated characters, OBJ for static props

### File Format Conversion
- Online converters: convert3d.org (GLB->RBXM, FBX->RBXM)
- Best practice: import FBX/OBJ directly into Roblox Studio rather than converting to RBXM externally
- For characters: FBX is preferred (preserves rigging/animation data)

---

## 5. Top NPC Libraries & Modules

### NPC System V2 (Best All-in-One, Open Source)
- Server-authoritative + client-side rendering
- Handles 2000+ NPCs smoothly
- AnimationController instead of Humanoid
- Dual sight modes (360 and cone-based)
- Movement types: ranged, melee, stationary
- Faction system
- Integrated pathfinding (NoobPath)
- Distance-based streaming
- Install via GitHub + Rojo, or SuperbulletAI
- **DevForum**: https://devforum.roblox.com/t/npc-system-v2-your-comprehensive-npc-system-for-your-roblox-game/4003818

### SimplePath (Pathfinding)
- Open-source pathfinding module wrapping PathfindingService
- Repeatedly recalculates paths for reliability
- Works with humanoid and non-humanoid NPCs
- Minimal code required
- **GitHub**: https://github.com/grayzcale/simplepath
- **Docs**: https://grayzcale.github.io/simplepath/
- **DevForum**: https://devforum.roblox.com/t/simplepath-pathfinding-module/1196762

### TreeAI (Behavior Trees)
- Visual editor plugin + runtime module
- Three task types: Composite, Decorator, Action
- Tasks return SUCCESS, FAILURE, or RUNNING
- Real-time debugging
- Custom task creation with auto-generated classes
- **DevForum**: https://devforum.roblox.com/t/treeai-easily-create-behavior-trees-for-your-npcs/4034006

### BehaviorTrees3 + BTrees Visual Editor v3.0
- Established behavior tree library
- Visual editor for tree design
- **DevForum**: https://devforum.roblox.com/t/behaviortrees3-btrees-visual-editor-v30/836158

### Ez NPC
- Lightweight NPC module
- Fast setup, flexible configuration
- **DevForum**: https://devforum.roblox.com/t/ez-npc-mmo-npc-system-handler/754905

### Dialogue Maker (Plugin)
- Open-source RPG dialogue plugin
- Visual GUI for adding messages and responses
- **GitHub**: https://github.com/Beastslash/roblox-dialogue-maker

---

## 6. Text-to-Speech & Voice for NPCs

### Roblox Native APIs (2025)

**Text-to-Speech API** (announced RDC 2025):
- Add narration and character dialogue with customizable voices
- Combine with Text Generation API for dynamic voiced NPC conversations
- Part of Roblox's AI initiative

**Speech-to-Text API** (full release 2025):
- Converts player speech to text
- Enables voice-controlled game mechanics
- NPCs can react to spoken words
- **Docs**: https://devforum.roblox.com/t/full-release-speech-to-text-api/4357786

### Combined Flow (Best Practice for 2025+)
1. Player speaks -> Speech-to-Text API -> text
2. Text -> Text Generation API (LLM) -> NPC response text
3. NPC response -> Text-to-Speech API -> voiced dialogue
This creates fully voice-interactive NPCs natively on Roblox.

### External TTS Options
- **Wavel AI**: Paste NPC lines, select from AI voice options or use voice cloning
- **Pre-recorded audio**: Record lines, upload as Sound objects, play via scripts
- **GPT-Realtime-Mini**: Real-time audio processing for spontaneous voice conversations (via HTTPService to external API)

### Current Limitations
- Lua doesn't directly support real-time voice processing; external APIs needed via HTTPService
- Voice AI latency can be noticeable with external services
- Roblox native TTS/STT still rolling out to all developers

---

## 7. Commercial AI NPC Solutions

### Inworld AI
- **Type**: Full character engine (personality, emotions, memory, goals)
- **Roblox integration**: SDK plugin available
- **Setup**: Install plugin -> Configure API key from studio.inworld.ai -> Define characters -> Test in Studio
- **Features**: No-code character creation, emotions engine, long-term memory, autonomous goals, customizable personality
- **Demo**: "AI Wonderland" Roblox experience
- **Pricing**: Free tier available; paid plans for production
- **Docs**: https://docs.inworld.ai/

### SuperbulletAI
- **Type**: AI game builder for Roblox
- **Features**: Generate UI, animations, VFX, 3D builds, complete game systems
- **NPC support**: Can install NPC System V2 in ~60 seconds
- **Pricing**: 1M free tokens/month
- **Site**: https://superbullet.ai/

### Lemonade
- **Type**: AI agent for making Roblox games
- **Site**: https://lemonade.gg/

### ClearlyDev Advanced AI-Integrated NPC System
- **Type**: Pre-built AI NPC system
- **Features**: Customizable behavior, personalities, narratives without scripting
- **Site**: https://clearlydev.com/product/advanced-ai-integrated-npc-system/

### Ropanion AI (Plugin)
- **Type**: AI coding assistant plugin for Roblox Studio
- **DevForum**: https://devforum.roblox.com/t/plugin-ropanion-ai-the-ai-assistant-roblox-studio-should-have-built-in/4028432

### RobloxStudio-MCP (Open Source)
- **Type**: Agentic AI workflows in Roblox Studio
- **GitHub**: https://github.com/boshyxd/robloxstudio-mcp

---

## Summary: Recommended Stack for AI NPC Game

### For NPC Dialogue (pick one):
1. **Roblox Text Generation API** -- Best native option, free, built-in safety. Use for production.
2. **OpenAI API via HTTPService** -- More control, better models, but costs money and needs proxy server.
3. **Inworld AI** -- Best for complex characters with personality/memory, but adds dependency.

### For NPC Behavior:
1. **NPC System V2** -- Best all-in-one for high-count NPCs (2000+)
2. **TreeAI** -- Best for complex behavior trees with visual editor
3. **SimplePath** -- Best standalone pathfinding module

### For 3D Character Models:
1. **Meshy AI + Roblox Bridge** -- Best AI-to-Roblox pipeline with direct integration
2. **Sloyd AI** -- Good alternative with Roblox preset
3. **Avatar Auto Setup** -- Official Roblox tool for rigging/skinning imported meshes

### For Voice:
1. **Roblox TTS + STT APIs** -- Native, combine with Text Generation API for full voice loop
2. **External TTS** (Wavel, ElevenLabs) -- More voice options but higher latency
