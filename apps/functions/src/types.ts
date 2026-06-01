export type AIProvider =
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'modelslab'
  | 'apify'
  | 'algolia'
  | 'suno'
  | 'elevenlabs'
  | 'fal'
  | 'deepgram'
  | 'meshy'
  | 'hunyuan3d';

export type ProjectKind =
  | 'game'
  | 'content'
  | 'fix'
  | 'clone'
  | 'ugc'
  | 'analyze';

export type WorkspaceFlow = 'quick_generate' | 'smart_interview';

export type ExpertiseLevel = 'beginner' | 'advanced' | 'developer';

export type InputMode = 'voice' | 'text' | 'image' | 'link' | 'file' | 'mixed';

export type ContentCategory =
  | 'script'
  | 'game_system'
  | 'ui'
  | 'character'
  | 'npc_ai'
  | 'weapon'
  | 'vehicle'
  | 'building'
  | 'map'
  | 'map_environment'
  | 'pet'
  | 'ugc_clothing'
  | 'ugc_accessory'
  | 'avatar_body'
  | 'furniture_prop'
  | 'item_tool'
  | 'decal_texture'
  | 'plugin'
  | 'animation'
  | 'audio'
  | 'effect'
  | 'gamepass'
  | 'other';

export type PromptIntent =
  | 'general_chat'
  | 'game_interview'
  | 'content_interview'
  | 'edit_existing'
  | 'analyze_existing'
  | 'game_generation'
  | 'content_generation'
  | 'remix'
  | 'script_doctor'
  | 'game_analyst'
  | 'ugc_designer'
  | 'asset_pack'
  | 'trends_idea'
  | 'monetization'
  | 'npc_dialogue'
  | 'ui_interview'
  | 'ui_generation'
  | 'map_interview'
  | 'map_generation'
  | 'audio_generation'
  | 'audio_interview'
  | 'clothing_interview'
  | 'animation_interview'
  | 'animation_generation'
  | 'decal_texture_generation'
  | 'script_interview'
  | 'script_generation'
  | 'weapon_interview'
  | 'weapon_generation'
  | 'vehicle_interview'
  | 'vehicle_generation'
  | 'item_interview'
  | 'item_generation'
  | 'building_interview'
  | 'building_generation'
  | 'furniture_interview'
  | 'furniture_generation'
  | 'character_interview'
  | 'character_generation'
  | 'npc_interview'
  | 'npc_generation'
  | 'monetization_interview'
  | 'monetization_generation'
  | 'anime_skill_interview'
  | 'anime_skill_generation'
  | 'brainrot_sim_interview'
  | 'brainrot_sim_generation'
  | 'obby_troll_interview'
  | 'obby_troll_generation'
  | 'rpg_interview'
  | 'rpg_generation'
  | 'horror_interview'
  | 'horror_generation'
  | 'pvp_arena_interview'
  | 'pvp_arena_generation'
  | 'simulator_interview'
  | 'simulator_generation'
  | 'tower_defense_interview'
  | 'tower_defense_generation';

export interface PromptContextMetadata {
  projectKind?: ProjectKind;
  workspaceFlow?: WorkspaceFlow;
  expertiseLevel?: ExpertiseLevel;
  inputMode?: InputMode;
  intent?: PromptIntent;
  language?: string;
  contentCategory?: ContentCategory;
  title?: string;
  genre?: string;
  style?: string;
  scale?: string;
  monetization?: string;
  audioType?: 'music' | 'sfx' | 'ambience' | 'voice';
  hasExistingProject?: boolean;
  attachmentKind?: 'image' | 'file' | 'link';
  [key: string]: unknown;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  quickReplies?: string[];
  gddRows?: Array<{ key: string; value: string }>;
  createdAt: string;
}

export interface GameDesignDoc {
  title: string;
  genre: string;
  theme?: string;
  scale: 'small' | 'medium' | 'large';
  mechanics: string[];
  characters?: string[];
  systems: string[];
  monetization?: string[];
  visualStyle?: string;
  dataStore?: string[];
  targetPlayer?: string;
  coreLoop?: string;
  mapStructure?: string;
  levels?: string[];
  progression?: string[];
  economy?: string[];
  winCondition?: string;
  loseCondition?: string;
  uiHud?: string[];
  audioVfx?: string[];
  socialSystems?: string[];
  robloxServices?: string[];
  technicalNotes?: string[];
  safetyNotes?: string[];
  expertiseLevel?: ExpertiseLevel;
  itemType?: string;
  useMode?: string;
  effect?: string;
  effectValue?: number;
  effectDuration?: number;
  tagName?: string;
  currencyName?: string;
  resourceName?: string;
  cooldown?: number;
}

export interface ProjectMemory {
  version: 1;
  title?: string;
  projectKind?: ProjectKind;
  contentSubcategory?: string;
  genre?: string;
  theme?: string;
  currentBrief?: string;
  latestGddRows?: Array<{ key: string; value: string }>;
  latestJobId?: string;
  latestArtifactIds?: string[];
  iteration: number;
  updatedAt: string;
}

export interface ChatTurnRequest {
  threadId: string;
  message: string;
  quickReply?: string;
  provider?: AIProvider;
  metadata?: PromptContextMetadata;
  skipInterview?: boolean;
}

export interface ChatTurnResponse {
  action: 'message' | 'interview' | 'generating';
  message?: {
    id: string;
    role: 'assistant';
    content: string;
    quickReplies?: string[];
    createdAt: string;
    gdd?: GameDesignDoc;
    gddRows?: Array<{ key: string; value: string }>;
  };
  question?: string;
  quickReplies?: string[];
  gdd?: GameDesignDoc;
  provider?: AIProvider;
  threadTitle?: string;
  jobId?: string;
  projectMemory?: ProjectMemory;
}

export type GenerationStatus =
  | 'queued'
  | 'processing'
  | 'awaiting_review'
  | 'completed'
  | 'failed'
  | 'partial';

export type GenerationStageId =
  | 'concept_image'
  | 'concept_approval'
  | 'clothing_texture'
  | 'mesh_3d'
  | 'convert_fbx'
  | 'upload_roblox'
  | 'mesh_optimized'
  | 'rig_r15'
  | 'generate_cages'
  | 'validate_layered'
  | 'package_accessory'
  | 'export_model'
  | 'export_rbxm'
  | 'generate_keyframes'
  | 'generate_decal_image'
  | 'generate_weapon_scripts'
  | 'generate_vehicle_scripts'
  | 'pick_vehicle_template'
  | 'generate_vehicle_decals'
  | 'generate_vehicle_mesh'
  | 'generate_vehicle_scene'
  | 'generate_item_scripts'
  | 'generate_building_scene'
  | 'generate_building_scripts'
  | 'generate_building_preview'
  | 'generate_furniture_scene'
  | 'generate_furniture_preview'
  | 'generate_map_scene'
  | 'generate_map_preview'
  | 'generate_character_scripts'
  | 'generate_npc_behavior'
  | 'generate_npc_accessories'
  | 'generate_monetization_scripts'
  | 'generate_hero_assets'
  | 'hero_concepts'
  | 'hero_approval'
  | 'plan_systems'
  | 'build_scene'
  | 'assemble_package'
  | 'quality_review'
  // Track 3 (Pet 3D pipeline): visual-evolution pet with 3 mesh stages + rig/anim per stage.
  | 'classify_pet'
  | 'concept_stage1'
  | 'mesh_stage1'
  | 'rig_stage1'
  | 'concept_stage2'
  | 'mesh_stage2'
  | 'rig_stage2'
  | 'concept_stage3'
  | 'mesh_stage3'
  | 'rig_stage3'
  | 'convert_pet_fbx'
  | 'validate_pet'
  | 'package_pet'
  | 'export_pet_rbxm'
  // Track 3 Phase 2 (Blocky Pet): native-Roblox blocky pet from primitive
  // Parts + Motor6D rig + LLM-keyframed Motor6D animations. 5 stages, no
  // external mesh providers needed (Meshy/Tripo bypassed entirely).
  | 'blocky_spec'
  | 'blocky_decals'
  | 'blocky_animations'
  | 'package_blocky_pet';

export type GenerationStageStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'skipped';

export type GenerationArtifactRole =
  | 'concept'
  | 'mesh_raw'
  | 'mesh_optimized'
  | 'rigged_model'
  | 'thumbnail'
  | 'export_binary'
  | 'brief'
  | 'script'
  | 'bundle'
  | 'preview_texture'
  | 'decal_texture'
  | 'stage_report'
  | 'weapon_script'
  | 'item_script'
  | 'building_script'
  | 'building_scene_json'
  | 'map_scene_json'
  | 'npc_script'
  | 'npc_behavior_script'
  | 'npc_quest_config'
  | 'npc_shop_config'
  | 'npc_dialogue_tree'
  | 'monetization_script';

export interface GenerationStageProgress {
  id: GenerationStageId;
  title: string;
  status: GenerationStageStatus;
  artifactIds?: string[];
  notes?: string[];
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
}

export type GenerationKind =
  | 'game_package'
  | 'character_3d'
  | 'clothing_3d'
  | 'pet_3d'
  | 'vehicle_3d'
  | 'animation'
  | 'code'
  | 'image'
  | 'audio'
  | 'search'
  | 'transcription'
  | 'rbxl_build'
  | 'rbxm_build'
  | 'project_parse'
  | 'asset_parse'
  | 'voice_stream_finalize'
  | 'publication_review'
  | 'decal_texture';

export type JobDispatchMode = 'embedded' | 'worker_service' | 'worker_cli';

export type RobloxBuildTarget = 'place' | 'model';

export type RobloxArtifactFormat = 'binary' | 'xml' | 'project_bundle_fallback';

export interface RobloxBuildSceneNode {
  id: string;
  className: string;
  name: string;
  parentId?: string;
  properties?: Record<string, unknown>;
  bind?: string;
}

export interface RobloxEmbeddedModelRef {
  id: string;
  name: string;
  parentId?: string;
  contentBase64?: string;
  contentPath?: string;
  mode?: 'npc_skinned_body' | 'vehicle_template';
  targetHeight?: number;
  textureId?: string;
  /** Round 20 v3 (vehicle_template mode): preferred variant Model name. */
  preferredVariant?: string;
  variantFallbacks?: string[];
  bodyOriginalHex?: string;
  primaryHex?: string;
  /** Round 20D accessories. */
  plateText?: string;
  roofSignText?: string;
  roofSignColorHex?: string;
  /** Round 20E decals (assetIds for door/hood/trunk Decals on body parts). */
  doorDecalAssetId?: number;
  hoodDecalAssetId?: number;
  trunkDecalAssetId?: number;
  /** Round 20F: assetId for roof sign side wordmark decal. */
  roofSignDecalAssetId?: number;
  /** Round 20I: neon underglow colour. */
  underglowColorHex?: string;
}

export interface RobloxBuildScript {
  id: string;
  name: string;
  scriptType: 'Script' | 'LocalScript' | 'ModuleScript';
  // Either a named Roblox service container OR an arbitrary scene-node id
  // (UUID from RobloxBuildSceneNode.id). build_roblox.luau resolves both via
  // instanceMap, so this widening lets pet/character pipelines parent
  // scripts inside their own model without separate plumbing.
  container:
    | 'ServerScriptService'
    | 'ReplicatedStorage'
    | 'StarterPlayerScripts'
    | 'StarterGui'
    | 'StarterPack'
    | 'Workspace'
    | string;
  source: string;
}

// ---------------------------------------------------------------------------
// Track 3 Phase 2 (Blocky Pet) — JSON spec the LLM emits for a primitive-part
// pet. The manifest builder turns this spec into a Roblox Model with
// Anchored=false Parts welded via Motor6D, ready for Motor6D-based animation.
// ---------------------------------------------------------------------------
export type BlockyPartShape = 'Ball' | 'Cylinder' | 'Block' | 'Wedge' | 'CornerWedge';

export interface BlockyPetPart {
  /** Unique part name within the pet model (e.g. "Body", "Head", "LegFL"). */
  name: string;
  shape: BlockyPartShape;
  /** [x, y, z] studs. Minimum 0.15 per dim. */
  size: [number, number, number];
  /** Part CENTER position relative to model origin (HumanoidRootPart). Y up. */
  position: [number, number, number];
  /** Optional rotation in degrees [rx, ry, rz]. */
  rotation?: [number, number, number];
  /**
   * Colour slot — 'primary' | 'secondary' | 'accent' draw from spec.colors,
   * or a literal BrickColor name like "Bright orange".
   */
  color: string;
  /** Optional material override (defaults to spec.material). */
  material?: string;
  /**
   * Functional role — used by the rig builder to wire Motor6D correctly,
   * and by the animator to know which joints to drive in walk cycle.
   */
  role: 'primary_part' | 'head' | 'snout' | 'eye' | 'nose' | 'ear' | 'tail'
    | 'leg_front_left' | 'leg_front_right' | 'leg_back_left' | 'leg_back_right'
    | 'wing_left' | 'wing_right' | 'horn' | 'mane' | 'fin' | 'spike' | 'detail';
}

export interface BlockyPetJoint {
  /** Joint name (used as the Motor6D Name; the animator references this name). */
  name: string;
  /** Parent part name. Use "HumanoidRootPart" to attach to the invisible root. */
  part0: string;
  part1: string;
}

export interface BlockyPetDecal {
  /** Name of the Part this decal sits on. */
  part: string;
  /** Roblox face: "Front" | "Back" | "Top" | "Bottom" | "Left" | "Right". */
  face: 'Front' | 'Back' | 'Top' | 'Bottom' | 'Left' | 'Right';
  /** Flux prompt for the texture image (256×256). */
  imagePrompt: string;
  /** When the worker uploads the image to Roblox we fill this with rbxassetid://. */
  textureId?: string;
}

export interface BlockyPetSpec {
  /** Short PascalCase display name (e.g. "FluffyFox"). */
  name: string;
  /** Skeleton family — drives keyframe generation. */
  rig: 'Biped' | 'Quadruped' | 'Winged' | 'Serpentine' | 'Aquatic';
  /** Colour palette — slots referenced from each Part. */
  colors: { primary: string; secondary?: string; accent?: string; eye?: string };
  /** Default Material for non-detail parts. */
  material: 'SmoothPlastic' | 'Plastic' | 'Neon' | 'Wood' | 'Fabric' | 'Metal' | 'ForceField';
  /** Total bounding-box height in studs (defaults to 3). */
  height?: number;
  /** Parts and Motor6D joints. */
  parts: BlockyPetPart[];
  joints: BlockyPetJoint[];
  /** Optional surface decals (eyes, patterns). */
  decals?: BlockyPetDecal[];
}

export type RobloxAssetType = 'mesh' | 'texture' | 'audio' | 'animation';

export interface RobloxAssetRef {
  id: string;
  name: string;
  assetType: RobloxAssetType;
  meshId?: string;
  textureId?: string;
  soundId?: string;
  storageUrl?: string;
  robloxAssetId?: number;
  folderId?: string;
}

export interface GameSceneSpecParticle {
  rate?: number;
  lifetime?: number;
  speed?: number;
  color?: [number, number, number];
  size?: number;
  spread?: number;
}

export interface GameSceneSpecPart {
  name: string;
  className?: string;
  size: [number, number, number];
  position: [number, number, number];
  rotation?: [number, number, number];
  color?: [number, number, number];
  material?: string;
  anchored?: boolean;
  canCollide?: boolean;
  transparency?: number;
  shape?: string;
  particles?: GameSceneSpecParticle;
  billboard?: { text: string; color?: [number, number, number]; size?: number; offset?: [number, number, number] };
  prompt?: { actionText: string; objectText?: string; holdDuration?: number; maxDistance?: number };
  sound?: { soundId: string; volume?: number; looped?: boolean; playing?: boolean; playbackSpeed?: number };
}

export interface GameSceneSpecSpawn {
  name?: string;
  position: [number, number, number];
  teamColor?: string;
}

export interface GameSceneSpecNPC {
  name: string;
  position: [number, number, number];
  role?: string;
  dialog?: string;
}

export interface GameSceneSpecTerrain {
  biome: string;
  seed?: number;
  amplitude?: number;
  baseHeight?: number;
  features?: string[];
  range?: number;
}

export interface GameSceneSpecAtmosphere {
  density?: number;
  offset?: number;
  color?: [number, number, number];
  decay?: [number, number, number];
  glare?: number;
  haze?: number;
}

export interface GameSceneSpecPostEffects {
  bloomIntensity?: number;
  bloomSize?: number;
  bloomThreshold?: number;
  ccBrightness?: number;
  ccContrast?: number;
  ccSaturation?: number;
  ccTintColor?: [number, number, number];
}

export interface GameSceneSpecLighting {
  clockTime?: number;
  ambient?: [number, number, number];
  brightness?: number;
  fogEnd?: number;
  fogColor?: [number, number, number];
  outdoorAmbient?: [number, number, number];
  atmosphere?: GameSceneSpecAtmosphere;
  postEffects?: GameSceneSpecPostEffects;
}

export interface GameSceneSpec {
  terrain?: GameSceneSpecTerrain;
  parts: GameSceneSpecPart[];
  spawns?: GameSceneSpecSpawn[];
  npcs?: GameSceneSpecNPC[];
  lighting?: GameSceneSpecLighting;
}

// ---------- Simulator Dynamic Scene Spec (LLM-generated) ----------

export interface SimulatorZoneDecoration {
  name: string;
  size: [number, number, number];
  relPos: [number, number, number];
  color: [number, number, number];
  material: string;
  shape?: string;
}

export interface SimulatorZoneSpec {
  id: number;
  name: string;
  color: [number, number, number];
  material: string;
  position: [number, number, number];
  size: [number, number, number];
  decorations: SimulatorZoneDecoration[];
}

export interface SimulatorEggSpec {
  name: string;
  color: [number, number, number];
}

export interface SimulatorSceneSpec {
  theme: {
    name: string;
    palette: [number, number, number][];
    groundMaterial: string;
    groundColor: [number, number, number];
  };
  zones: SimulatorZoneSpec[];
  sellZone: { position: [number, number, number]; color: [number, number, number] };
  eggHatchery: { position: [number, number, number]; eggs: SimulatorEggSpec[] };
  upgradeShop: { position: [number, number, number]; color: [number, number, number] };
  petArea: { position: [number, number, number]; color: [number, number, number] };
  rebirthPortal: { position: [number, number, number]; color: [number, number, number] };
  spawn: { position: [number, number, number] };
  paths: Array<{ from: string; to: string; material: string; color: [number, number, number] }>;
  worldDecorations: Array<{
    name: string;
    size: [number, number, number];
    position: [number, number, number];
    color: [number, number, number];
    material: string;
    shape?: string;
  }>;
  lighting: GameSceneSpecLighting;
  currency: string;
  pets: {
    common: string[];
    golden: string[];
    legendary: string[];
  };
}

export interface RobloxBuildManifest {
  id: string;
  title: string;
  summary: string;
  target: RobloxBuildTarget;
  rootClassName?: string;
  rootProperties?: Record<string, unknown>;
  formatPreference?: RobloxArtifactFormat;
  scene: RobloxBuildSceneNode[];
  scripts: RobloxBuildScript[];
  ui?: RobloxBuildSceneNode[];
  embeddedModels?: RobloxEmbeddedModelRef[];
  assets?: RobloxAssetRef[];
  metadata?: Record<string, unknown>;
}

export interface BuildValidationIssue {
  severity: 'warning' | 'error';
  code: string;
  message: string;
}

export interface RobloxBuildResult {
  artifactType: 'rbxl' | 'rbxm';
  format: RobloxArtifactFormat;
  fileName: string;
  bufferBase64?: string;
  summary: string;
  validationIssues: BuildValidationIssue[];
  notes: string[];
  manifest: RobloxBuildManifest;
}

export type ArtifactType =
  | 'lua'
  | 'text'
  | 'gdd'
  | 'json'
  | 'project_bundle'
  | 'archive'
  | 'rbxm'
  | 'rbxl'
  | 'png'
  | 'jpg'
  | 'fbx'
  | 'glb'
  | 'obj'
  | 'usdz'
  | 'audio'
  | 'gif'
  | 'mp4';

export interface ArtifactRef {
  id: string;
  type: ArtifactType;
  name: string;
  url?: string;
  code?: string;
  content?: string;
  previewText?: string;
  extension?: string;
  downloadUrl?: string;
  sizeBytes?: number;
  mimeType?: string;
  stageId?: GenerationStageId;
  artifactRole?: GenerationArtifactRole;
  metadata?: Record<string, unknown>;
}

export interface GenerationArtifact extends ArtifactRef {
  storagePath?: string;
}

export interface GenerationJob {
  id: string;
  userId: string;
  threadId?: string;
  prompt: string;
  provider: AIProvider;
  kind: GenerationKind;
  status: GenerationStatus;
  createdAt: string;
  updatedAt: string;
  resultText?: string;
  errorMessage?: string;
  artifacts: GenerationArtifact[];
  history: string[];
  stages?: GenerationStageProgress[];
  dispatchMode?: JobDispatchMode;
  workerTarget?: string;
  metadata?: Record<string, unknown>;
}

// ── Decal approval gate (session 231) ─────────────────────────────────────
// Pause point inserted between Fal.ai preview generation and Roblox Decal
// upload so the user reviews each AI-generated image before it lands in
// their Roblox-account inventory (Roblox moderation flags blood/gore on
// Decals — see Asset 99787426663910 violation).
//
// When the pipeline pauses for decal approval it sets
//   status='awaiting_review'
//   metadata.approvalKind = 'decal_upload'
//   metadata.pendingDecalApprovals = DecalApprovalCandidate[]
// iOS shows DecalApprovalSheet, user submits approved slotIds via
// /api/content/jobs/:jobId/approve-decals, pipeline resumes via /run-phase2
// (continueGamePackageDecalUpload).

export type DecalApprovalKind = 'hero_concepts' | 'decal_upload';

export interface DecalApprovalCandidate {
  /** Stable identifier for this slot — used in approval payload and metadata. */
  slotId: string;
  /** Group label, e.g. "PlatformTex", "NpcImg", "WeaponIcon". For UI grouping/debug. */
  slotPrefix: string;
  /** Storage URL for iOS to render the candidate. */
  previewUrl: string;
  /** Original Fal.ai prompt — useful for debug/long-press tooltip. Not always shown. */
  prompt: string;
  /** Index inside slotPrefix group (preserves ordering on resume). */
  index: number;
}

export interface ApprovedDecalAsset {
  slotId: string;
  slotPrefix: string;
  index: number;
  /** rbxassetid://<imageId> string ready to paste into Lua. */
  rbxAssetUri: string;
  /** Numeric Roblox image asset ID (post-upload). */
  imageAssetId: number;
}

export interface ContentGenerateRequest {
  prompt: string;
  provider?: AIProvider;
  kind?: GenerationKind;
  threadId?: string;
  metadata?: PromptContextMetadata;
}

export interface ContentGenerateResponse {
  jobId: string;
  status: GenerationStatus;
  provider: AIProvider;
  artifactId?: string;
  artifactIds?: string[];
}

export type ModerationSeverity = 'safe' | 'review' | 'blocked';

export type ModerationStage = 'input' | 'artifact' | 'publication' | 'report';

export interface ModerationCheckRequest {
  text: string;
  stage?: ModerationStage;
  provider?: Extract<AIProvider, 'openai' | 'anthropic' | 'gemini'>;
  artifactType?: ArtifactType;
  metadata?: Record<string, unknown>;
}

export interface ModerationCheckResponse {
  allowed: boolean;
  reason?: string;
  provider: string;
  severity: ModerationSeverity;
  action: 'allow' | 'review' | 'block';
  category?: string;
  flags?: string[];
  rewrittenText?: string;
  eventId?: string;
}

export interface ModerationEvent {
  id: string;
  userId: string;
  stage: ModerationStage;
  provider: string;
  inputText: string;
  allowed: boolean;
  severity: ModerationSeverity;
  action: 'allow' | 'review' | 'block';
  reason?: string;
  category?: string;
  flags?: string[];
  rewrittenText?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export type ModerationEntityType =
  | 'chat'
  | 'artifact'
  | 'project'
  | 'comment'
  | 'profile'
  | 'report'
  | 'voice'
  | 'attachment';

export type ModerationCaseStatus =
  | 'open'
  | 'under_review'
  | 'resolved'
  | 'appealed'
  | 'dismissed';

export interface ModerationDecision {
  id: string;
  actorType: 'system' | 'reviewer' | 'user';
  action: 'allow' | 'review' | 'block' | 'restore';
  rationale: string;
  createdAt: string;
}

export interface ModerationCase {
  id: string;
  eventId?: string;
  userId: string;
  entityType: ModerationEntityType;
  entityId?: string;
  status: ModerationCaseStatus;
  severity: ModerationSeverity;
  reason?: string;
  evidence?: Record<string, unknown>;
  decisions: ModerationDecision[];
  createdAt: string;
  updatedAt: string;
}

export interface ModerationAppeal {
  id: string;
  caseId: string;
  userId: string;
  reason: string;
  status: 'open' | 'reviewed' | 'rejected' | 'accepted';
  createdAt: string;
  updatedAt: string;
}

export interface IngestionAsset {
  id: string;
  userId: string;
  type: 'file' | 'image' | 'audio' | 'url';
  name: string;
  mimeType?: string;
  sourceUrl?: string;
  storagePath?: string;
  downloadUrl?: string;
  extractedText?: string;
  previewText?: string;
  assetFormat?: 'rbxl' | 'rbxm' | 'lua' | 'image' | 'url' | 'text' | 'audio' | 'unknown';
  analysisJobId?: string;
  analysisStatus?: GenerationStatus;
  analysisSummary?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface AttachmentIngestRequest {
  type: 'file' | 'image' | 'audio' | 'url';
  name?: string;
  mimeType?: string;
  contentBase64?: string;
  sourceUrl?: string;
  text?: string;
  parseMode?: 'basic' | 'structured';
  metadata?: Record<string, unknown>;
}

export interface AttachmentIngestResponse {
  asset: IngestionAsset;
  jobId?: string;
  analysis?: ProjectAnalysis;
}

export interface ProjectNodeSummary {
  id: string;
  path: string;
  name: string;
  className: string;
  childCount?: number;
  scriptId?: string;
  details?: string;
}

export interface LuaScriptAnalysis {
  path: string;
  lineCount: number;
  services: string[];
  functions: string[];
  warnings: string[];
  suggestedFixes: string[];
}

export interface ProjectEditOperation {
  op: 'insert' | 'update' | 'delete' | 'move' | 'replace_script';
  targetPath: string;
  description: string;
  beforeText?: string;
  afterText?: string;
}

export interface ProjectDiffPreview {
  summary: string;
  operations: ProjectEditOperation[];
}

export interface ProjectAnalysis {
  id: string;
  assetId: string;
  userId: string;
  kind: 'rbxl' | 'rbxm' | 'lua' | 'image' | 'url' | 'text' | 'audio';
  status: GenerationStatus;
  summary: string;
  nodes: ProjectNodeSummary[];
  scripts: LuaScriptAnalysis[];
  externalLinks: string[];
  diffPreview?: ProjectDiffPreview;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AttachmentAnalysisResponse {
  asset: IngestionAsset;
  analysis: ProjectAnalysis;
}

export interface AttachmentEditPreviewRequest {
  instruction: string;
}

export interface AttachmentEditPreviewResponse {
  analysis: ProjectAnalysis;
}

export interface AttachmentApplyRequest {
  instruction: string;
}

export interface AttachmentApplyResponse {
  job: GenerationJob;
  analysis: ProjectAnalysis;
}

export interface TranscriptionRequest {
  audioBase64: string;
  mimeType?: string;
  fileName?: string;
  metadata?: Record<string, unknown>;
}

export interface TranscriptionResponse {
  jobId: string;
  status: GenerationStatus;
  transcript?: string;
  confidence?: number;
  locale?: string;
  artifact?: GenerationArtifact;
}

export interface VoiceSession {
  id: string;
  userId: string;
  status: 'recording' | 'uploaded' | 'processing' | 'completed' | 'failed';
  locale?: string;
  chunkCount: number;
  partialTranscript?: string;
  finalTranscript?: string;
  finalJobId?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface VoiceSessionChunk {
  id: string;
  sessionId: string;
  order: number;
  mimeType: string;
  durationMs?: number;
  storagePath?: string;
  downloadUrl?: string;
  audioBase64Fallback?: string;
  createdAt: string;
}

export interface VoiceSessionCreateRequest {
  locale?: string;
  metadata?: Record<string, unknown>;
}

export interface VoiceSessionCreateResponse {
  session: VoiceSession;
}

export interface VoiceSessionChunkUploadRequest {
  audioBase64: string;
  mimeType?: string;
  fileName?: string;
  durationMs?: number;
  isLastChunk?: boolean;
}

export interface VoiceSessionChunkUploadResponse {
  session: VoiceSession;
  chunk: VoiceSessionChunk;
}

export interface VoiceSessionFinalizeRequest {
  metadata?: Record<string, unknown>;
}

export interface VoiceSessionFinalizeResponse extends TranscriptionResponse {
  session: VoiceSession;
}

export interface ProviderExecuteResponse {
  provider: AIProvider;
  operation: string;
  result: Record<string, unknown>;
}

export interface UserProfile {
  id: string;
  email?: string;
  displayName: string;
  avatarUrl?: string;
  robloxUsername?: string;
  bio?: string;
  createdAt: string;
}

export interface SocialLink {
  platform: 'roblox' | 'youtube' | 'twitter' | 'discord' | 'tiktok' | 'website' | 'other';
  url: string;
  label?: string;
}

export interface SocialProfile extends UserProfile {
  followerCount: number;
  followingCount: number;
  publishedProjectCount: number;
  savedCount: number;
  totalLikes: number;
  totalDownloads: number;
  headline?: string;
  websiteUrl?: string;
  badges: string[];
  rating?: number;
  socialLinks?: SocialLink[];
}

export interface ChangelogEntry {
  version: string;
  date: string;
  changes: string[];
}

export interface SocialProject {
  id: string;
  authorId: string;
  title: string;
  description: string;
  projectKind: ProjectKind;
  artifactIds: string[];
  artifactTypes?: ArtifactType[];
  coverImageUrl?: string;
  screenshotUrls?: string[];
  category?: ContentCategory;
  tags: string[];
  moderationStatus: 'approved' | 'review' | 'rejected';
  publicationState: 'draft' | 'published' | 'hidden' | 'review' | 'deleted';
  saveCount: number;
  downloadCount: number;
  moderationCaseId?: string;
  changelog?: ChangelogEntry[];
  version?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SocialComment {
  id: string;
  postId: string;
  authorId: string;
  authorName: string;
  content: string;
  parentCommentId?: string;
  likeCount: number;
  moderationStatus?: 'approved' | 'review' | 'rejected';
  createdAt: string;
  /** Bug 20: per-viewer like state so iOS can render filled heart + toggle correctly. */
  likedByViewer?: boolean;
}

export interface SocialPost {
  id: string;
  projectId: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl?: string;
  title: string;
  description: string;
  projectKind: ProjectKind;
  contentType?: 'game' | 'content';
  category?: string;
  tags: string[];
  previewUrls: string[];
  artifactSummary?: string;
  moderationStatus: 'approved' | 'review' | 'rejected';
  publicationState: 'draft' | 'published' | 'hidden' | 'review' | 'deleted';
  likes: number;
  dislikes?: number;
  likedByViewer?: boolean;
  dislikedByViewer?: boolean;
  savedByViewer?: boolean;
  commentCount: number;
  downloadCount: number;
  score?: number;
  authorHeadline?: string;
  artifactTypes?: ArtifactType[];
  staffPick?: boolean;
  featured?: boolean;
  createdAt: string;
}

export type SocialFeedMode = 'new' | 'top' | 'trending' | 'following' | 'recommended' | 'saved' | 'rising' | 'staff_picks';

export interface SocialFeedRequest {
  mode?: SocialFeedMode;
  cursor?: string;
  tag?: string;
  authorId?: string;
  search?: string;
  limit?: number;
  contentType?: 'game' | 'content' | 'all';
  category?: string;
  sortBy?: 'newest' | 'popular' | 'most_downloaded' | 'most_liked' | 'rating';
  timeRange?: 'day' | 'week' | 'month' | 'all';
}

export interface CuratedCollection {
  id: string;
  title: string;
  description: string;
  coverImageUrl?: string;
  postIds: string[];
  posts?: SocialPost[];
  curatorId: string;
  collectionType: 'staff_picks' | 'rising_stars' | 'hall_of_fame' | 'curated';
  createdAt: string;
  updatedAt: string;
}

export interface SocialFeedResponse {
  posts: SocialPost[];
  nextCursor?: string;
  mode?: SocialFeedMode;
}

export interface DownloadableArtifact {
  id: string;
  type: ArtifactType;
  name: string;
  downloadUrl?: string;
  url?: string;
  extension?: string;
  mimeType?: string;
  sizeBytes?: number;
  metadata?: Record<string, unknown>;
}

export interface SocialPostDetail extends SocialPost {
  project?: SocialProject;
  comments?: SocialComment[];
  author?: SocialProfile;
  downloadableArtifacts?: DownloadableArtifact[];
}

export interface SocialProfileUpdateRequest {
  displayName?: string;
  bio?: string;
  robloxUsername?: string;
  headline?: string;
  websiteUrl?: string;
}

export interface SocialProfileUpdateResponse {
  profile: SocialProfile;
}

export interface SocialFollowResponse {
  following: boolean;
  followerCount: number;
  followingCount: number;
}

export interface SocialSaveResponse {
  saved: boolean;
  saveCount: number;
}

export interface CuratedCollection {
  id: string;
  title: string;
  description: string;
  coverImageUrl?: string;
  postIds: string[];
  posts?: SocialPost[];
  curatorId: string;
  collectionType: 'staff_picks' | 'rising_stars' | 'hall_of_fame' | 'curated';
  createdAt: string;
  updatedAt: string;
}

export interface CollectionsResponse {
  collections: CuratedCollection[];
}

export interface GameTemplate {
  id: string;
  title: string;
  genre: string;
  description: string;
  previewUrl?: string;
  manifestJson: RobloxBuildManifest;
  starterPrompt: string;
  features: string[];
  difficulty: 'easy' | 'medium' | 'hard';
  createdAt: string;
  updatedAt: string;
}

export interface BanStatusResponse {
  banned: boolean;
  permanent: boolean;
  reason: string;
  bannedUntil?: string;
}

// --- Weekly Challenges ---

export type ChallengeType = 'game' | 'content' | 'script' | 'ui';
export type ChallengeStatus = 'upcoming' | 'active' | 'voting' | 'completed';

export interface ChallengePrize {
  place: number;
  title: string;
  description: string;
}

export interface Challenge {
  id: string;
  title: string;
  description: string;
  type: ChallengeType;
  startDate: string;
  endDate: string;
  votingEndDate: string;
  status: ChallengeStatus;
  rules: string[];
  prizes: ChallengePrize[];
  featuredProjectIds: string[];
  winnerIds: string[];
  submissionCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChallengeSubmission {
  id: string;
  challengeId: string;
  projectId: string;
  userId: string;
  authorName: string;
  title: string;
  description: string;
  previewUrls: string[];
  votes: number;
  submittedAt: string;
}

export interface ChallengeListResponse {
  challenges: Challenge[];
}

export interface ChallengeDetailResponse {
  challenge: Challenge;
  submissions: ChallengeSubmission[];
  userSubmission?: ChallengeSubmission;
  userVotedProjectId?: string;
}

export interface ChallengeSubmitResponse {
  submission: ChallengeSubmission;
}

export interface ChallengeVoteResponse {
  voted: boolean;
  projectId: string;
  totalVotes: number;
}

// ── Hero Asset Types (Hybrid 3D Pipeline) ──

export type HeroEffect = 'sparkles' | 'fire' | 'glow' | 'smoke' | 'bubbles' | 'stars' | 'none';

export type HeroAnimation = 'rotate' | 'float' | 'pulse' | 'spin_fast' | 'none';

export interface HeroAssetSpec {
  /** Human-readable name — used as Meshy prompt and cache key */
  name: string;
  /** Optional visual description appended to Meshy prompt */
  description?: string;
  /** Particle / light effect type */
  effect: HeroEffect;
  /** Animation loop applied to the spawned part */
  animation: HeroAnimation;
  /** World position [x, y, z] in the tycoon workspace */
  position: [number, number, number];
  /** Optional size override; defaults to [10, 10, 10] */
  size?: [number, number, number];
  /**
   * Session #18: validated Creator Store / Roblox Marketplace asset id used
   * when Meshy generation/upload fails. Runtime tries AssetService first,
   * then InsertService, then the themed composite fallback.
   */
  fallbackAssetId?: number;
  /**
   * Session #18: meme sub-theme tag ('skibidi' / 'bombardir' / 'tralalero' /
   * 'sigma' / 'generic'). When set, the hero-asset loader stores the first
   * successfully-loaded model into ReplicatedStorage.MemeNpcTemplates[subTheme]
   * so the per-platform meme NPC spawner can Clone() a real 3D model instead
   * of stitching primitives. Any string is accepted here to keep types.ts
   * framework-agnostic (enum lives in gameTemplates.ts).
   */
  memeSubTheme?: string;
  /** true = character/NPC (use character concept prompt + a-pose). false/undefined = prop/object */
  isCharacter?: boolean;
}

export interface HeroAssetResult {
  spec: HeroAssetSpec;
  /** Roblox assetId when upload succeeded; 0 means fallback Part */
  assetId: number;
  /** true = MeshPart with real 3D model; false = colored Part fallback */
  isMesh: boolean;
  /** Fallback color [r, g, b] used when isMesh is false */
  fallbackColor?: [number, number, number];
  /** AI-generated concept image URL (Fal.ai Flux). Used for billboard fallback when 3D mesh unavailable. */
  conceptImageUrl?: string;
}
