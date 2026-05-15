/** Chat message in a thread */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  attachments?: Attachment[];
  quickReplies?: string[];
  /** For assistant: GDD summary before generation */
  gdd?: GameDesignDoc;
  gddRows?: Array<{ key: string; value: string }>;
  /** For assistant: generated artifact refs */
  artifacts?: ArtifactRef[];
  createdAt: string; // ISO
}

export interface Attachment {
  id?: string;
  type: 'image' | 'file' | 'link' | 'audio';
  url: string;
  name?: string;
  mimeType?: string;
  extractedText?: string;
  metadata?: Record<string, unknown>;
}

/** Game Design Document (shown before generation) */
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
  [key: string]: unknown;
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

/** Reference to generated file/code for preview and export */
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
  | 'fbx'
  | 'glb'
  | 'obj'
  | 'usdz'
  | 'audio'
  | 'mp4'
  | 'gif';

export interface ArtifactRef {
  id: string;
  type: ArtifactType;
  name: string;
  url?: string; // download URL
  code?: string; // for .lua inline preview
  content?: string; // for text/json/gdd inline preview
  previewText?: string;
  extension?: string;
  downloadUrl?: string;
  sizeBytes?: number;
  mimeType?: string;
  stageId?: GenerationStageId;
  artifactRole?: GenerationArtifactRole;
  metadata?: Record<string, unknown>;
}

/** Chat thread / project */
export interface ChatThread {
  id: string;
  title: string;
  type: 'game' | 'content' | 'both';
  messageIds: string[];
  createdAt: string;
  updatedAt: string;
  projectKind?: ProjectKind;
  contentSubcategory?: string;
  latestJobId?: string;
  projectMemory?: ProjectMemory;
}

/** Content category for generation */
export type ContentCategory =
  | 'script'
  | 'game_system'
  | 'ui'
  | 'character'
  | 'weapon'
  | 'vehicle'
  | 'building'
  | 'map'
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
  | 'other';

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
  | 'ui_generation'
  | 'map_generation'
  | 'audio_generation'
  | 'audio_interview'
  | 'clothing_interview'
  | 'animation_interview'
  | 'animation_generation'
  | 'decal_texture_generation'
  | 'rpg_interview'
  | 'rpg_generation'
  | 'horror_interview'
  | 'horror_generation'
  | 'pvp_arena_interview'
  | 'pvp_arena_generation'
  | 'simulator_interview'
  | 'simulator_generation'
  | 'brainrot_sim_interview'
  | 'brainrot_sim_generation'
  | 'obby_troll_interview'
  | 'obby_troll_generation';

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
  hasExistingProject?: boolean;
  attachmentKind?: 'image' | 'file' | 'link';
  [key: string]: unknown;
}

/** Request to AI: chat turn */
export interface ChatTurnRequest {
  threadId: string;
  message: string;
  attachments?: Attachment[];
  quickReply?: string;
  skipInterview?: boolean; // "Generate yourself"
  provider?: AIProvider;
  metadata?: PromptContextMetadata;
}

/** Response: next message or interview question */
export interface ChatTurnResponse {
  action: 'message' | 'interview' | 'generating';
  message?: ChatMessage;
  question?: string;
  quickReplies?: string[];
  gdd?: GameDesignDoc;
  confirmGenerate?: boolean;
  provider?: AIProvider;
  threadTitle?: string;
  jobId?: string;
  projectMemory?: ProjectMemory;
}

export type AIProvider =
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'modelslab'
  | 'apify'
  | 'algolia'
  | 'suno'
  | 'elevenlabs'
  | 'replicate'
  | 'fal'
  | 'deepgram'
  | 'meshy'
  | 'hunyuan3d';

export type GenerationStatus =
  | 'queued'
  | 'processing'
  | 'awaiting_review'
  | 'completed'
  | 'failed'
  | 'partial';

export type GenerationStageId =
  | 'concept_image'
  | 'clothing_texture'
  | 'mesh_3d'
  | 'convert_fbx'
  | 'upload_roblox'
  | 'mesh_optimized'
  | 'rig_r15'
  | 'generate_cages'
  | 'package_accessory'
  | 'export_model'
  | 'export_rbxm'
  | 'generate_keyframes'
  | 'generate_decal_image';

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
  | 'stage_report';

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
  | 'code'
  | 'image'
  | 'audio'
  | 'animation'
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
}

export interface RobloxEmbeddedModelRef {
  id: string;
  name: string;
  parentId?: string;
  contentBase64?: string;
  contentPath?: string;
  mode?: 'npc_skinned_body';
  targetHeight?: number;
  textureId?: string;
}

export interface RobloxBuildScript {
  id: string;
  name: string;
  scriptType: 'Script' | 'LocalScript' | 'ModuleScript';
  container:
    | 'ServerScriptService'
    | 'ReplicatedStorage'
    | 'StarterPlayerScripts'
    | 'StarterGui'
    | 'Workspace';
  source: string;
}

export interface RobloxBuildManifest {
  id: string;
  title: string;
  summary: string;
  target: RobloxBuildTarget;
  formatPreference?: RobloxArtifactFormat;
  scene: RobloxBuildSceneNode[];
  scripts: RobloxBuildScript[];
  ui?: RobloxBuildSceneNode[];
  embeddedModels?: RobloxEmbeddedModelRef[];
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

export interface ProviderExecuteRequest {
  provider: AIProvider;
  operation: string;
  input?: Record<string, unknown>;
}

export interface ProviderExecuteResponse {
  provider: AIProvider;
  operation: string;
  result: Record<string, unknown>;
}

/** User profile (social) */
export interface UserProfile {
  id: string;
  email?: string;
  displayName: string;
  avatarUrl?: string;
  robloxUsername?: string;
  bio?: string;
  moderationWarnings?: number;
  bannedUntil?: string | null; // ISO timestamp; null = no temp ban
  permanentlyBanned?: boolean;
  createdAt: string;
}

export interface BanStatusResponse {
  banned: boolean;
  permanent: boolean;
  reason?: string;
  bannedUntil?: string | null;
}

/** Published item in catalog */
export interface CatalogItem {
  id: string;
  authorId: string;
  type: 'game' | 'content';
  category: string;
  name: string;
  description: string;
  previewUrls: string[];
  downloadUrl?: string;
  likes: number;
  downloads: number;
  createdAt: string;
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

export interface SocialLink {
  platform: 'roblox' | 'youtube' | 'twitter' | 'discord' | 'tiktok' | 'website' | 'other';
  url: string;
  label?: string;
}

export type BadgeId =
  | 'top_creator'
  | 'game_developer'
  | 'script_master'
  | '1000_downloads'
  | '100_likes'
  | 'rising_star'
  | 'first_publish'
  | 'community_helper'
  | 'ugc_designer'
  | 'prolific_publisher';

export interface BadgeDefinition {
  id: BadgeId;
  label: string;
  description: string;
  icon: string;
}

export interface SocialProfilePortfolio {
  profile: SocialProfile;
  publishedPosts: SocialPost[];
  totalCount: number;
  nextCursor?: string;
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

export interface ChangelogEntry {
  version: string;
  date: string;
  changes: string[];
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
  dislikes: number;
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

export interface SocialFeedResponse {
  posts: SocialPost[];
  nextCursor?: string;
  mode?: SocialFeedMode;
}

export interface TopCreator {
  profile: SocialProfile;
  rank: number;
  totalScore: number;
  period: 'day' | 'week' | 'month' | 'all';
}

export interface LeaderboardResponse {
  creators: TopCreator[];
  period: 'day' | 'week' | 'month' | 'all';
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
  socialLinks?: SocialLink[];
}

export interface PublishProjectRequest {
  title: string;
  description: string;
  projectKind: ProjectKind;
  artifactIds: string[];
  tags: string[];
  screenshotUrls?: string[];
  contentType?: 'game' | 'content';
  category?: string;
  changelog?: string;
}

export interface UpdatePublicationRequest {
  title?: string;
  description?: string;
  tags?: string[];
  screenshotUrls?: string[];
  changelog?: string;
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

export interface SocialDislikeResponse {
  disliked: boolean;
  dislikes: number;
}

export interface ShareLinkResponse {
  url: string;
  deepLink: string;
}
