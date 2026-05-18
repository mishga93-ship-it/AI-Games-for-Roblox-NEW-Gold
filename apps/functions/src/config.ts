import { defineSecret, defineString } from 'firebase-functions/params';

export const OPENAI_API_KEY = defineSecret('OPENAI_API_KEY');
export const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');
export const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');
export const MODELSLAB_API_KEY = defineSecret('MODELSLAB_API_KEY');
export const APIFY_API_TOKEN = defineSecret('APIFY_API_TOKEN');
export const ALGOLIA_APP_ID = defineSecret('ALGOLIA_APP_ID');
export const ALGOLIA_SEARCH_API_KEY = defineSecret('ALGOLIA_SEARCH_API_KEY');
export const ALGOLIA_WRITE_API_KEY = defineSecret('ALGOLIA_WRITE_API_KEY');
export const ALGOLIA_ADMIN_API_KEY = defineSecret('ALGOLIA_ADMIN_API_KEY');
export const ALGOLIA_USAGE_API_KEY = defineSecret('ALGOLIA_USAGE_API_KEY');
export const ALGOLIA_MONITORING_API_KEY = defineSecret('ALGOLIA_MONITORING_API_KEY');
export const SUNO_API_KEY = defineSecret('SUNO_API_KEY');
export const ELEVENLABS_API_KEY = defineSecret('ELEVENLABS_API_KEY');
export const FAL_API_KEY = defineSecret('FAL_API_KEY');
export const DEEPGRAM_API_KEY = defineSecret('DEEPGRAM_API_KEY');
// Track 3 (Pet 3D pipeline): Tripo AI auto-rigging API. Meshy v6 rigging supports only
// bipedal humanoids, so quadrupeds/dragons/serpents use Tripo for image_to_model +
// animate_rig task. Falls back to mesh-only output if the key is missing.
export const TRIPO_API_KEY = defineSecret('TRIPO_API_KEY');
export const ROBLOX_WORKER_TOKEN = defineSecret('ROBLOX_WORKER_TOKEN');
export const ROBLOX_OPEN_CLOUD_API_KEY = defineSecret('ROBLOX_OPEN_CLOUD_API_KEY');
export const ROBLOX_OAUTH_CLIENT_SECRET = defineSecret('ROBLOX_OAUTH_CLIENT_SECRET');
export const ROBLOX_WORKER_URL = defineString('ROBLOX_WORKER_URL', { default: '' });
export const ROBLOX_WORKER_COMMAND = defineString('ROBLOX_WORKER_COMMAND', { default: '' });
export const ROBLOX_WORKER_ARGS = defineString('ROBLOX_WORKER_ARGS', { default: '' });
export const ROBLOX_CREATOR_ID = defineString('ROBLOX_CREATOR_ID', { default: '' });
export const ROBLOX_OAUTH_CLIENT_ID = defineString('ROBLOX_OAUTH_CLIENT_ID', { default: '' });
// Roblox Open Cloud Engine API for executing Luau snippets in a published place. We use
// it to extract the real numeric MeshId of an FBX-imported skinned MeshPart from the Open
// Cloud Model wrapper, so the worker can bake a static MeshPart into the RBXM (visible
// in Studio Edit before Play). Engine API requires a published universe + place to host
// the execution session; the place can be empty.
export const ROBLOX_UNIVERSE_ID = defineString('ROBLOX_UNIVERSE_ID', { default: '' });
export const ROBLOX_PLACE_ID = defineString('ROBLOX_PLACE_ID', { default: '' });
export const JOB_DISPATCH_MODE = defineString('JOB_DISPATCH_MODE', { default: 'embedded' });
export const ALLOW_UNAUTHENTICATED_REQUESTS = defineString('ALLOW_UNAUTHENTICATED_REQUESTS', { default: 'false' });

export const secretParams = [
  OPENAI_API_KEY,
  ANTHROPIC_API_KEY,
  GEMINI_API_KEY,
  MODELSLAB_API_KEY,
  APIFY_API_TOKEN,
  ALGOLIA_APP_ID,
  ALGOLIA_SEARCH_API_KEY,
  ALGOLIA_WRITE_API_KEY,
  ALGOLIA_ADMIN_API_KEY,
  ALGOLIA_USAGE_API_KEY,
  ALGOLIA_MONITORING_API_KEY,
  SUNO_API_KEY,
  ELEVENLABS_API_KEY,
  FAL_API_KEY,
  DEEPGRAM_API_KEY,
  TRIPO_API_KEY,
  ROBLOX_WORKER_TOKEN,
  ROBLOX_OPEN_CLOUD_API_KEY,
  ROBLOX_OAUTH_CLIENT_SECRET,
];

export const defaults = {
  region: 'us-central1',
  chatProvider: 'gemini',
  chatModel: 'gpt-5.4',
  anthropicModel: 'claude-opus-4-1-20250805',
  geminiModel: 'gemini-3-pro-preview',
};

function readStringParam(value: string, fallback?: string): string | undefined {
  const resolved = value.trim() || fallback?.trim() || '';
  return resolved || undefined;
}

export function getRobloxWorkerUrl(): string | undefined {
  return readStringParam(ROBLOX_WORKER_URL.value(), process.env.ROBLOX_WORKER_URL);
}

export function getRobloxWorkerCommand(): string | undefined {
  return readStringParam(ROBLOX_WORKER_COMMAND.value(), process.env.ROBLOX_WORKER_COMMAND);
}

export function getRobloxWorkerArgs(): string | undefined {
  return readStringParam(ROBLOX_WORKER_ARGS.value(), process.env.ROBLOX_WORKER_ARGS);
}

export function getRobloxWorkerToken(): string | undefined {
  return readStringParam(ROBLOX_WORKER_TOKEN.value(), process.env.ROBLOX_WORKER_TOKEN);
}

export function getRobloxOpenCloudApiKey(): string | undefined {
  return readStringParam(ROBLOX_OPEN_CLOUD_API_KEY.value(), process.env.ROBLOX_OPEN_CLOUD_API_KEY);
}

export function getRobloxCreatorId(): string | undefined {
  return readStringParam(ROBLOX_CREATOR_ID.value(), process.env.ROBLOX_CREATOR_ID);
}

export function getRobloxUniverseId(): string | undefined {
  return readStringParam(ROBLOX_UNIVERSE_ID.value(), process.env.ROBLOX_UNIVERSE_ID);
}

export function getRobloxPlaceId(): string | undefined {
  return readStringParam(ROBLOX_PLACE_ID.value(), process.env.ROBLOX_PLACE_ID);
}

export function getRobloxOAuthClientId(): string | undefined {
  return readStringParam(ROBLOX_OAUTH_CLIENT_ID.value(), process.env.ROBLOX_OAUTH_CLIENT_ID);
}

export function getRobloxOAuthClientSecret(): string | undefined {
  return readStringParam(ROBLOX_OAUTH_CLIENT_SECRET.value(), process.env.ROBLOX_OAUTH_CLIENT_SECRET);
}

export function getJobDispatchMode(): string {
  return readStringParam(JOB_DISPATCH_MODE.value(), process.env.JOB_DISPATCH_MODE) ?? 'embedded';
}

export function getAllowUnauthenticatedRequests(): boolean {
  return (readStringParam(ALLOW_UNAUTHENTICATED_REQUESTS.value(), process.env.ALLOW_UNAUTHENTICATED_REQUESTS) ?? 'false') === 'true';
}

export function getNpcVisualPipeline(): string {
  // Production-stable NPCs should default to a real Roblox Humanoid rig.
  // The external moving mesh shell remains available only as explicit opt-in.
  return readStringParam(process.env.NPC_VISUAL_PIPELINE ?? '') ?? 'asset_template_v1';
}
