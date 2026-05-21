import type { AIProvider, BlockyPetSpec, GenerationKind } from './types.js';
import { logger } from 'firebase-functions';
import { getStorage } from 'firebase-admin/storage';
import sharp from 'sharp';
import {
  ALGOLIA_ADMIN_API_KEY,
  ALGOLIA_APP_ID,
  ALGOLIA_MONITORING_API_KEY,
  ALGOLIA_SEARCH_API_KEY,
  ALGOLIA_USAGE_API_KEY,
  ALGOLIA_WRITE_API_KEY,
  ANTHROPIC_API_KEY,
  APIFY_API_TOKEN,
  DEEPGRAM_API_KEY,
  ELEVENLABS_API_KEY,
  FAL_API_KEY,
  GEMINI_API_KEY,
  MODELSLAB_API_KEY,
  OPENAI_API_KEY,
  SUNO_API_KEY,
  TRIPO_API_KEY,
  defaults,
} from './config.js';
import type { ProviderPromptInput } from './promptCatalog.js';
import { buildTemplateDebugMap, compositePantsTemplate, compositeShirtTemplate } from './clothingCompositor.js';

type JsonRecord = Record<string, unknown>;

export interface ProviderResult {
  text?: string;
  outputUrl?: string;
  mimeType?: string;
  raw: JsonRecord;
}

interface ExecuteOptions {
  provider: AIProvider;
  operation: string;
  prompt?: string | ProviderPromptInput;
  model?: string;
  input?: JsonRecord;
  kind?: GenerationKind;
}

function requireValue(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Missing Firebase secret: ${name}`);
  }
  return value;
}

async function fetchJson(url: string, init: RequestInit, timeoutMs?: number): Promise<JsonRecord> {
  const requestInit = timeoutMs && timeoutMs > 0
    ? { ...init, signal: AbortSignal.timeout(timeoutMs) }
    : init;
  const response = await fetch(url, requestInit);
  const text = await response.text();
  let json: JsonRecord = {};

  if (text) {
    try {
      json = JSON.parse(text) as JsonRecord;
    } catch {
      json = { raw: text };
    }
  }

  if (!response.ok) {
    const message = typeof json.error === 'string'
      ? json.error
      : typeof json.message === 'string'
        ? json.message
        : text || `Provider request failed with ${response.status}`;
    throw new Error(message);
  }

  return json;
}

function promptFrom(input?: JsonRecord, fallback = ''): string {
  const value = input?.prompt;
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function firstString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) {
    return value;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === 'string' && item.trim()) {
        return item;
      }
      if (item && typeof item === 'object') {
        const candidate = firstString((item as JsonRecord).url ?? (item as JsonRecord).text);
        if (candidate) {
          return candidate;
        }
      }
    }
  }
  return undefined;
}

function firstText(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) {
    return value;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const candidate = firstText(item);
      if (candidate) {
        return candidate;
      }
    }
    return undefined;
  }
  if (value && typeof value === 'object') {
    const record = value as JsonRecord;
    const type = typeof record.type === 'string' ? record.type : '';
    if (type === 'reasoning' || type === 'reasoning_text' || type === 'summary_text' || type === 'input_text') {
      return undefined;
    }
    for (const key of ['output_text', 'text', 'content', 'message', 'parts']) {
      const candidate = firstText(record[key]);
      if (candidate) {
        return candidate;
      }
    }
  }
  return undefined;
}

async function runOpenAI(prompt: string, model: string, timeoutMs?: number): Promise<ProviderResult> {
  const apiKey = requireValue(OPENAI_API_KEY.value(), 'OPENAI_API_KEY');
  const raw = await fetchJson('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: prompt,
    }),
  }, timeoutMs);

  return {
    text: firstText(raw.output_text) ?? firstText(raw.output) ?? 'OpenAI returned no text.',
    raw,
  };
}

async function runOpenAIStructured(prompt: ProviderPromptInput, model: string, timeoutMs?: number): Promise<ProviderResult> {
  const apiKey = requireValue(OPENAI_API_KEY.value(), 'OPENAI_API_KEY');
  const raw = await fetchJson('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      instructions: prompt.system,
      input: prompt.user,
    }),
  }, timeoutMs);

  return {
    text: firstText(raw.output_text) ?? firstText(raw.output) ?? 'OpenAI returned no text.',
    raw,
  };
}

async function runAnthropic(prompt: string, model: string, timeoutMs?: number): Promise<ProviderResult> {
  const apiKey = requireValue(ANTHROPIC_API_KEY.value(), 'ANTHROPIC_API_KEY');
  const raw = await fetchJson('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages: [
        { role: 'user', content: prompt },
      ],
    }),
  }, timeoutMs);

  return {
    text: firstText(raw.content) ?? 'Anthropic returned no text.',
    raw,
  };
}

async function runAnthropicStructured(prompt: ProviderPromptInput, model: string, timeoutMs?: number): Promise<ProviderResult> {
  const apiKey = requireValue(ANTHROPIC_API_KEY.value(), 'ANTHROPIC_API_KEY');
  const raw = await fetchJson('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      system: prompt.system,
      model,
      max_tokens: 1400,
      messages: [
        { role: 'user', content: prompt.user },
      ],
    }),
  }, timeoutMs);

  return {
    text: firstText(raw.content) ?? 'Anthropic returned no text.',
    raw,
  };
}

/**
 * Vision-enabled Anthropic call: same as runAnthropicStructured but the user
 * message becomes a content array with one or more image blocks followed by the
 * text. Used by the vehicle quality reviewer so Claude can actually look at the
 * rendered manifest PNG instead of judging by JSON facts alone.
 */
export async function runAnthropicVisionStructured(
  prompt: {
    system: string;
    user: string;
    images: Array<{ base64: string; mediaType?: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' }>;
  },
  model: string,
  timeoutMs?: number,
): Promise<ProviderResult> {
  const apiKey = requireValue(ANTHROPIC_API_KEY.value(), 'ANTHROPIC_API_KEY');
  const content: Array<Record<string, unknown>> = [];
  for (const image of prompt.images) {
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: image.mediaType ?? 'image/png',
        data: image.base64,
      },
    });
  }
  content.push({ type: 'text', text: prompt.user });
  const raw = await fetchJson('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      system: prompt.system,
      model,
      max_tokens: 1400,
      messages: [
        { role: 'user', content },
      ],
    }),
  }, timeoutMs);

  return {
    text: firstText(raw.content) ?? 'Anthropic returned no text.',
    raw,
  };
}

async function runGemini(prompt: string, model: string, timeoutMs?: number): Promise<ProviderResult> {
  const apiKey = requireValue(GEMINI_API_KEY.value(), 'GEMINI_API_KEY');
  const raw = await fetchJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
      }),
    },
    timeoutMs,
  );

  const candidates = raw.candidates as JsonRecord[] | undefined;
  const first = candidates?.[0];
  const content = first?.content as JsonRecord | undefined;
  return {
    text: firstText(content?.parts) ?? 'Gemini returned no text.',
    raw,
  };
}

async function runGeminiStructured(prompt: ProviderPromptInput, model: string, timeoutMs?: number): Promise<ProviderResult> {
  const apiKey = requireValue(GEMINI_API_KEY.value(), 'GEMINI_API_KEY');
  const raw = await fetchJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: prompt.system }],
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt.user }],
          },
        ],
      }),
    },
    timeoutMs,
  );

  const candidates = raw.candidates as JsonRecord[] | undefined;
  const first = candidates?.[0];
  const content = first?.content as JsonRecord | undefined;
  return {
    text: firstText(content?.parts) ?? 'Gemini returned no text.',
    raw,
  };
}

async function runModelsLab(prompt: string, input: JsonRecord): Promise<ProviderResult> {
  const apiKey = requireValue(MODELSLAB_API_KEY.value(), 'MODELSLAB_API_KEY');
  const raw = await fetchJson('https://modelslab.com/api/v6/images/text2img', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      key: apiKey,
      prompt,
      width: input.width ?? '1024',
      height: input.height ?? '1024',
      samples: input.samples ?? '1',
      num_inference_steps: input.steps ?? '30',
      guidance_scale: input.guidanceScale ?? 7.5,
      safety_checker: 'yes',
      enhance_prompt: 'yes',
    }),
  });

  return {
    outputUrl: firstString(raw.output),
    mimeType: 'image/png',
    raw,
  };
}

export async function runFal(operation: string, input: JsonRecord): Promise<ProviderResult> {
  const apiKey = requireValue(FAL_API_KEY.value(), 'FAL_API_KEY');
  const endpoint = typeof input.endpoint === 'string' && input.endpoint.trim()
    ? input.endpoint
    : `fal-ai/${operation}`;
  const raw = await fetchJson(`https://fal.run/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Key ${apiKey}`,
    },
    body: JSON.stringify(input.payload ?? input),
  });

  return {
    outputUrl: firstString(raw.images) ?? firstString(raw.image) ?? firstString(raw.output),
    mimeType: 'image/png',
    raw,
  };
}

async function runApify(operation: string, input: JsonRecord): Promise<ProviderResult> {
  const token = requireValue(APIFY_API_TOKEN.value(), 'APIFY_API_TOKEN');
  const actorId = typeof input.actorId === 'string' && input.actorId.trim()
    ? input.actorId
    : operation;
  const raw = await fetchJson(
    `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${token}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input.payload ?? input),
    },
  );

  return {
    raw,
  };
}

function algoliaKeyForOperation(operation: string): string {
  if (operation === 'search') {
    return requireValue(ALGOLIA_SEARCH_API_KEY.value(), 'ALGOLIA_SEARCH_API_KEY');
  }
  if (operation === 'usage') {
    return requireValue(ALGOLIA_USAGE_API_KEY.value(), 'ALGOLIA_USAGE_API_KEY');
  }
  if (operation === 'monitoring') {
    return requireValue(ALGOLIA_MONITORING_API_KEY.value(), 'ALGOLIA_MONITORING_API_KEY');
  }
  if (operation === 'write') {
    return requireValue(ALGOLIA_WRITE_API_KEY.value(), 'ALGOLIA_WRITE_API_KEY');
  }
  return requireValue(ALGOLIA_ADMIN_API_KEY.value(), 'ALGOLIA_ADMIN_API_KEY');
}

async function runAlgolia(operation: string, input: JsonRecord): Promise<ProviderResult> {
  const appId = requireValue(ALGOLIA_APP_ID.value(), 'ALGOLIA_APP_ID');
  const apiKey = algoliaKeyForOperation(operation);
  const path = typeof input.path === 'string' && input.path.trim()
    ? input.path
    : operation === 'search'
      ? '/1/indexes/*/queries'
      : '/1/indexes';
  const raw = await fetchJson(`https://${appId}-dsn.algolia.net${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Algolia-API-Key': apiKey,
      'X-Algolia-Application-Id': appId,
    },
    body: JSON.stringify(input.payload ?? input),
  });

  return { raw };
}

async function runSuno(input: JsonRecord): Promise<ProviderResult> {
  const apiKey = requireValue(SUNO_API_KEY.value(), 'SUNO_API_KEY');
  const path = typeof input.path === 'string' && input.path.trim()
    ? input.path
    : 'generate';
  const raw = await fetchJson(`https://studio-api.suno.ai/api/external/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(input.payload ?? input),
  });

  return {
    outputUrl: firstString(raw.audio_url) ?? firstString(raw.clips) ?? firstString(raw.output),
    mimeType: 'audio/mpeg',
    raw,
  };
}

async function runElevenLabs(operation: string, input: JsonRecord): Promise<ProviderResult> {
  const apiKey = requireValue(ELEVENLABS_API_KEY.value(), 'ELEVENLABS_API_KEY');
  const isSoundEffect = operation === 'sound-effects'
    || (typeof input.operation === 'string' && input.operation === 'sound-effects')
    || (typeof input.audioType === 'string' && input.audioType === 'sound-effect');

  // Default voice for text-to-speech — can be overridden via input.voiceId
  const defaultVoiceId = '21m00Tcm4TlvDq8ikWAM'; // Rachel — a popular default voice
  const voiceId = typeof input.voiceId === 'string' && input.voiceId.trim()
    ? input.voiceId.trim()
    : defaultVoiceId;

  const path = typeof input.path === 'string' && input.path.trim()
    ? input.path
    : isSoundEffect
      ? '/v1/sound-generation'
      : `/v1/text-to-speech/${voiceId}`;

  // Build request body depending on endpoint
  const payload = (input.payload ?? input) as JsonRecord;
  let requestBody: JsonRecord;

  if (isSoundEffect) {
    // Sound Generation API: https://api.elevenlabs.io/v1/sound-generation
    requestBody = {
      text: typeof payload.text === 'string' ? payload.text : String(payload.prompt ?? ''),
      duration_seconds: typeof payload.duration_seconds === 'number' ? payload.duration_seconds : undefined,
      prompt_influence: typeof payload.prompt_influence === 'number' ? payload.prompt_influence : 0.3,
    };
    // Remove undefined values
    if (requestBody.duration_seconds === undefined) delete requestBody.duration_seconds;
  } else {
    // Text-to-Speech API: https://api.elevenlabs.io/v1/text-to-speech/{voice_id}
    requestBody = {
      text: typeof payload.text === 'string' ? payload.text : String(payload.prompt ?? ''),
      model_id: typeof payload.model_id === 'string' ? payload.model_id : 'eleven_multilingual_v2',
      voice_settings: payload.voice_settings ?? {
        stability: 0.5,
        similarity_boost: 0.75,
      },
    };
  }

  const body = JSON.stringify(requestBody);
  logger.info(`ElevenLabs request: operation=${operation} path=${path} isSoundEffect=${isSoundEffect} voiceId=${isSoundEffect ? 'N/A' : voiceId} keyLen=${apiKey.length} bodyLen=${body.length}`);

  // ElevenLabs requires xi-api-key header — Authorization: Bearer is NOT supported
  // for sk_-prefixed API keys and causes 401 when both headers are present.
  const response = await fetch(`https://api.elevenlabs.io${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
    },
    body,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    logger.error(`ElevenLabs ${operation} failed`, {
      status: response.status,
      statusText: response.statusText,
      path,
      isSoundEffect,
      voiceId: isSoundEffect ? 'N/A' : voiceId,
      keyLen: apiKey.length,
      errorBody: errorBody.slice(0, 500),
    });
    throw new Error(`ElevenLabs ${operation} failed: ${response.status} ${errorBody.slice(0, 500)}`);
  }

  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('audio/') || contentType.includes('application/octet-stream')) {
    const audioBuffer = Buffer.from(await response.arrayBuffer());
    const fileName = `elevenlabs-${Date.now()}.mp3`;
    const bucket = getStorage().bucket('roblox-ai-gen-v2-artifacts');
    const file = bucket.file(`generated-audio/${fileName}`);
    await file.save(audioBuffer, {
      contentType: 'audio/mpeg',
      metadata: { cacheControl: 'public, max-age=31536000' },
    });
    const [signedUrl] = await file.getSignedUrl({ action: 'read', expires: '2030-01-01' });

    return {
      outputUrl: signedUrl,
      mimeType: 'audio/mpeg',
      raw: { provider: 'elevenlabs', operation, isSoundEffect, voiceId: isSoundEffect ? undefined : voiceId, byteLength: audioBuffer.length },
    };
  }

  const raw = JSON.parse(await response.text()) as JsonRecord;
  return {
    outputUrl: firstString(raw.audio_url) ?? firstString(raw.output),
    mimeType: 'audio/mpeg',
    raw,
  };
}

export async function runFalAudio(prompt: string, input: JsonRecord): Promise<ProviderResult> {
  const apiKey = requireValue(FAL_API_KEY.value(), 'FAL_API_KEY');
  const payload = (input.payload ?? input) as Record<string, unknown>;
  const text = typeof payload.text === 'string' ? payload.text : prompt;
  const durationSecs = typeof payload.duration_seconds === 'number'
    ? Math.min(Math.max(payload.duration_seconds as number, 1), 30)
    : 10;

  logger.info(`Fal Audio request: prompt="${text.substring(0, 120)}" duration=${durationSecs}`);

  const raw = await fetchJson('https://fal.run/fal-ai/stable-audio', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Key ${apiKey}`,
    },
    body: JSON.stringify({
      prompt: text,
      seconds_total: durationSecs,
    }),
  });

  const audioFile = raw.audio_file as { url?: string } | undefined;
  const audioUrl = audioFile?.url
    ?? firstString(raw.audio)
    ?? firstString(raw.output)
    ?? firstString(raw.url);
  if (!audioUrl) {
    throw new Error(`Fal Audio returned no audio URL. Keys: ${Object.keys(raw).join(', ')}`);
  }

  return {
    outputUrl: audioUrl,
    mimeType: 'audio/mpeg',
    raw,
  };
}

async function runDeepgram(operation: string, input: JsonRecord): Promise<ProviderResult> {
  const apiKey = requireValue(DEEPGRAM_API_KEY.value(), 'DEEPGRAM_API_KEY');
  const basePath = typeof input.path === 'string' && input.path.trim()
    ? input.path
    : operation === 'speak'
      ? '/v1/speak'
      : '/v1/listen';

  const payload = (input.payload ?? input) as JsonRecord;
  const audioUrl = typeof payload.url === 'string' ? payload.url : undefined;

  const queryParams = new URLSearchParams();
  if (payload.model) queryParams.set('model', String(payload.model));
  if (payload.language) queryParams.set('language', String(payload.language));
  if (payload.detect_language) queryParams.set('detect_language', 'true');
  if (payload.smart_format) queryParams.set('smart_format', 'true');
  if (payload.punctuate) queryParams.set('punctuate', 'true');
  if (payload.diarize) queryParams.set('diarize', 'true');

  const qs = queryParams.toString();
  const fullPath = qs ? `${basePath}?${qs}` : basePath;

  const audioBase64 = typeof payload.audioBase64 === 'string' ? payload.audioBase64 : undefined;
  const audioMimeType = typeof payload.audioMimeType === 'string' ? payload.audioMimeType : 'audio/mp4';

  const bufferSize = audioBase64 ? Buffer.from(audioBase64, 'base64').length : 0;
  logger.info(`Deepgram request: ${fullPath}`, {
    audioUrl: audioUrl?.substring(0, 80),
    hasBase64: !!audioBase64,
    base64Length: audioBase64?.length ?? 0,
    bufferBytes: bufferSize,
    audioMimeType,
  });

  let raw: JsonRecord;
  if (audioUrl) {
    raw = await fetchJson(`https://api.deepgram.com${fullPath}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Token ${apiKey}`,
      },
      body: JSON.stringify({ url: audioUrl }),
    });
  } else if (audioBase64) {
    const audioBuffer = Buffer.from(audioBase64, 'base64');
    const response = await fetch(`https://api.deepgram.com${fullPath}`, {
      method: 'POST',
      headers: {
        'Content-Type': audioMimeType,
        Authorization: `Token ${apiKey}`,
      },
      body: audioBuffer,
    });
    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      throw new Error(`Deepgram ${response.status}: ${errBody.slice(0, 300)}`);
    }
    const text = await response.text();
    try {
      raw = JSON.parse(text) as JsonRecord;
    } catch {
      raw = { raw: text };
    }
  } else {
    throw new Error('Deepgram: no audio URL or base64 data provided');
  }

  if (raw.err_code || raw.err_msg) {
    logger.error('Deepgram API error', { err_code: raw.err_code, err_msg: raw.err_msg });
    throw new Error(`Deepgram error: ${raw.err_msg || raw.err_code}`);
  }

  const transcript = firstString(
    (((raw.results as JsonRecord | undefined)?.channels as JsonRecord[] | undefined)?.[0]?.alternatives as JsonRecord[] | undefined)?.[0]?.transcript,
  ) ?? firstString(raw.results) ?? firstString(raw.output);
  const confidence = (((raw.results as JsonRecord | undefined)?.channels as JsonRecord[] | undefined)?.[0]?.alternatives as JsonRecord[] | undefined)?.[0]?.confidence;
  const language = (((raw.results as JsonRecord | undefined)?.channels as JsonRecord[] | undefined)?.[0] as JsonRecord | undefined)?.detected_language;

  logger.info('Deepgram result', {
    hasTranscript: !!transcript,
    transcriptLength: transcript?.length ?? 0,
    confidence,
    detectedLanguage: language,
  });
  if (!transcript) {
    const metadata = (raw as JsonRecord).metadata as JsonRecord | undefined;
    logger.warn('Deepgram returned empty transcript', {
      duration: metadata?.duration,
      channels: metadata?.channels,
      modelInfo: metadata?.model_info,
      rawKeys: Object.keys(raw),
    });
  }
  if (typeof confidence === 'number') {
    raw.transcriptionConfidence = confidence;
  }
  if (typeof language === 'string') {
    raw.transcriptionLocale = language;
  }

  return {
    text: transcript,
    outputUrl: firstString(raw.url),
    raw,
  };
}

// ── Vision API for image moderation ──────────────────────────────────

export interface VisionModerationResult {
  allowed: boolean;
  reason: string;
  severity: 'safe' | 'review' | 'blocked';
  category?: string;
  flags?: string[];
}

async function fetchImageAsBase64(imageUrl: string): Promise<{ base64: string; mimeType: string }> {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get('content-type') ?? 'image/png';
  const mimeType = contentType.split(';')[0].trim();
  const buffer = Buffer.from(await response.arrayBuffer());
  return { base64: buffer.toString('base64'), mimeType };
}

export async function runGeminiVision(
  systemPrompt: string,
  imageUrl: string,
  model?: string,
): Promise<VisionModerationResult> {
  const apiKey = requireValue(GEMINI_API_KEY.value(), 'GEMINI_API_KEY');
  const resolvedModel = model ?? 'gemini-2.5-flash';

  const { base64, mimeType } = await fetchImageAsBase64(imageUrl);

  const raw = await fetchJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${resolvedModel}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{
          role: 'user',
          parts: [
            { inlineData: { mimeType, data: base64 } },
            { text: 'Analyze this image and return the JSON moderation result.' },
          ],
        }],
      }),
    },
  );

  const candidates = raw.candidates as JsonRecord[] | undefined;
  const content = candidates?.[0]?.content as JsonRecord | undefined;
  const textPart = firstString(content?.parts) ?? '{}';

  const start = textPart.indexOf('{');
  const end = textPart.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    logger.warn('Gemini Vision returned non-JSON response, defaulting to review', { textPart: textPart.slice(0, 300) });
    return { allowed: true, reason: 'Could not parse vision response', severity: 'review' };
  }

  try {
    const parsed = JSON.parse(textPart.slice(start, end + 1)) as Record<string, unknown>;
    const severity = parsed.severity === 'review' || parsed.severity === 'blocked'
      ? parsed.severity : 'safe';
    const allowed = severity !== 'blocked';
    return {
      allowed,
      reason: typeof parsed.reason === 'string' ? parsed.reason : 'No reason provided',
      severity,
      category: typeof parsed.category === 'string' ? parsed.category : undefined,
      flags: Array.isArray(parsed.flags)
        ? parsed.flags.filter((f): f is string => typeof f === 'string')
        : undefined,
    };
  } catch {
    logger.warn('Failed to parse Gemini Vision JSON, defaulting to review', { textPart: textPart.slice(0, 300) });
    return { allowed: true, reason: 'Failed to parse vision moderation response', severity: 'review' };
  }
}

const CHAT_FALLBACK_ORDER: AIProvider[] = ['gemini', 'anthropic', 'openai'];

interface ChatProviderOptions {
  timeoutMs?: number;
  providerModels?: Partial<Record<AIProvider, string>>;
}

export async function runChatProvider(
  provider: AIProvider,
  prompt: string | ProviderPromptInput,
  model?: string,
  options: ChatProviderOptions = {},
): Promise<ProviderResult> {
  const ordered = [provider, ...CHAT_FALLBACK_ORDER.filter((p) => p !== provider)];
  let lastError: unknown;

  for (const candidate of ordered) {
    try {
      const candidateModel = options.providerModels?.[candidate] ?? (candidate === provider ? model : undefined);
      const result = await runSingleChatProvider(candidate, prompt, candidateModel, options);
      if (candidate !== provider) {
        logger.info('Chat provider fallback succeeded', { requestedProvider: provider, usedProvider: candidate });
      }
      return result;
    } catch (error) {
      lastError = error;
      logger.warn(`Chat provider ${candidate} failed, trying next fallback`, error);
    }
  }

  throw lastError ?? new Error('All chat providers failed');
}

export function runSingleChatProvider(
  provider: AIProvider,
  prompt: string | ProviderPromptInput,
  model?: string,
  options: ChatProviderOptions = {},
): Promise<ProviderResult> {
  const structuredPrompt = typeof prompt === 'string' ? null : prompt;
  const rawPrompt = typeof prompt === 'string' ? prompt : prompt.user;
  const { timeoutMs } = options;

  switch (provider) {
    case 'anthropic':
      return structuredPrompt
        ? runAnthropicStructured(structuredPrompt, model ?? defaults.anthropicModel, timeoutMs)
        : runAnthropic(rawPrompt, model ?? defaults.anthropicModel, timeoutMs);
    case 'gemini':
      return structuredPrompt
        ? runGeminiStructured(structuredPrompt, model ?? defaults.geminiModel, timeoutMs)
        : runGemini(rawPrompt, model ?? defaults.geminiModel, timeoutMs);
    case 'openai':
    default:
      return structuredPrompt
        ? runOpenAIStructured(structuredPrompt, model ?? defaults.chatModel, timeoutMs)
        : runOpenAI(rawPrompt, model ?? defaults.chatModel, timeoutMs);
  }
}

/**
 * Translates non-English text to English using Gemini Flash so that image
 * generation models (Flux Pro, etc.) receive accurate English descriptions.
 * Passes through text that is already ASCII/English unchanged.
 */
async function translateForImageGen(text: string): Promise<string> {
  if (/^[\x00-\x7F]*$/.test(text)) return text;
  // Emojis (e.g. 👤 😈 💪 🗿 🕴️) are non-ASCII but Flux handles them fine. The bottleneck
  // we hit was prompts like "Sigma Chad NPC. 🗿 Full NPC. 🕴️ Suited alpha. 🖤 Luxury black."
  // that are 95% English but trip the ASCII check, sending the whole thing to Gemini Flash —
  // intermittent translate took 100+ seconds. If the text minus emojis/symbols is pure ASCII
  // (i.e. no real Cyrillic/Asian/Arabic letters), skip translation entirely.
  const stripped = text
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Component}\p{Emoji_Presentation}‍️]/gu, '')
    .replace(/[  -⁯✀-➿⬀-⯿■-◿←-⇿]/g, '');
  if (/^[\x00-\x7F]*$/.test(stripped)) {
    logger.info('translateForImageGen: emoji-only non-ASCII, skipping Gemini translate', {
      length: text.length,
    });
    return text;
  }
  try {
    const result = await runChatProvider(
      'gemini',
      `Translate the following text to English. Output ONLY the translated text, no preamble, no markdown, no explanations. Keep all visual details concise:\n\n${text}`,
    );
    const translated = result.text?.trim();
    if (translated && translated.length > 0) {
      logger.info('translateForImageGen: translated non-English description', {
        original: text.substring(0, 100),
        translated: translated.substring(0, 100),
      });
      return translated;
    }
  } catch (error) {
    logger.warn('translateForImageGen: translation failed, using original', error);
  }
  return text;
}

/**
 * Generate a Roblox-style character/asset preview image.
 * Character concepts use the expensive Fal.ai Flux Pro Ultra path first, then fall
 * back through the cheaper Flux endpoints. Prop/game previews keep the cheaper
 * order because they are less sensitive to color/detail quality.
 */
export async function generatePreviewTexture(
  description: string,
  _style: string = 'roblox',
  context: 'character' | 'game' | 'prop' = 'character',
): Promise<string | undefined> {
  const englishDescription = await translateForImageGen(description);
  // Session 231 (Roblox suspension fix): every prompt suffixes a Roblox-friendly safety clause
  // and every Fal.ai payload below carries `negative_prompt`. Prevents "Violent Content and Gore"
  // bans (Asset 99787426663910 — obby texture flagged for blood splatter on brick wall).
  const SAFETY_SUFFIX = ' Family-friendly, safe for kids, no blood, no gore, no violence, no weapons, no horror, clean and tidy.';
  const NEGATIVE_PROMPT = 'blood, gore, wounds, dark stains, blood splatter, violence, weapons, gun, knife, dead, corpse, body, scary, horror, nudity, graphic, mature, drug, alcohol, smoking, hate symbol, swastika';
  // Character-specific negative prompt also bans monochrome/grayscale output. Flux/schnell at
  // 4 inference steps occasionally desaturates to grey when the visual brief is short or
  // contains a stylistic word like "luxury / sigma / chad" — explicit "no monochrome" plus a
  // saturated-color positive directive fixes it.
  const CHARACTER_NEGATIVE = `${NEGATIVE_PROMPT}, monochrome, grayscale, black and white, desaturated, washed out, faded colors, dull, low quality, low detail, blurry, sketch, lineart, cel shading flat, plain black hoodie, all black outfit, black on gray, gray studio background, colorless mannequin`;
  const CHARACTER_COLOR_DIRECTIVE = 'Premium colorful NPC concept art direction: use at least three distinct visible color accents, readable outfit panels, colored accessories, expressive face details, strong silhouette, and a clean bright background. If the brief asks for black or dark clothing, keep the dark base but add vivid cyan, violet, lime, or red accent graphics so the character is not black-on-gray.';
  const prompt = context === 'game'
    ? `3D game level screenshot: ${englishDescription}. Colorful platforming world, obstacle course environment, floating platforms, bright neon colors, top-down isometric camera angle. NO characters, NO people, NO avatars. Only the game world and level geometry. Do NOT include any text or watermarks.${SAFETY_SUFFIX}`
    : context === 'prop'
      ? `${englishDescription}. Single 3D object centered on white background, front view. Clean stylized render, bright saturated colors, game-ready prop. Do NOT include any text, watermarks, logos, people, or characters.${SAFETY_SUFFIX}`
      // Stylized cartoon/Roblox-toon character. Avoid "premium / realistic / studio lighting"
      // wording — it nudges Flux toward photorealism, which Meshy v6 image-to-3d frequently
      // rejects with content_policy_violation, sending us into a retry loop. Heavy color
      // keywords ("bright primary palette", "Saturday morning cartoon") + explicit "FULLY
      // COLORED, NOT monochrome" prefix push schnell to actually saturate the image — without
      // them schnell at 4 steps drifts to grey for low-color briefs (sigma chad, talking npc).
      : `FULLY COLORED, NOT monochrome, NOT grayscale. ${englishDescription}. ${CHARACTER_COLOR_DIRECTIVE} Stylized 3D cartoon character, bright primary palette, vibrant saturated colors, Saturday morning cartoon palette, rich material variety, clean Roblox-toon look, full body in confident A-pose, wearing a fully closed long-sleeve outfit and long pants in distinct colors, white background, centered, 3/4 view. Original non-franchise design; do not imitate or resemble any existing cartoon, game, TV, movie, mascot, or copyrighted character. Do NOT include any text, watermarks, or logos.${SAFETY_SUFFIX}`;
  const imgW = context === 'game' ? 1024 : 768;
  const imgH = context === 'game' ? 768 : 1024;

  logger.info('Generating preview texture', { prompt: prompt.substring(0, 200), style: _style, context });

  // Helper: check if image URL points to a real image (not a black/blank safety-blocked output).
  // Flux safety filters return valid URLs with black pixels instead of throwing errors.
  // A solid-black PNG/JPEG is typically < 15KB; real images are 30KB+.
  const isValidImage = async (url: string): Promise<boolean> => {
    try {
      const resp = await fetch(url, { method: 'HEAD' });
      if (!resp.ok) return false;
      const contentLength = parseInt(resp.headers.get('content-length') ?? '0', 10);
      if (contentLength > 0 && contentLength < 15_000) {
        logger.warn('Preview image likely black/blank (too small)', { url, contentLength });
        return false;
      }
      // If HEAD doesn't return content-length, fetch first bytes
      if (contentLength === 0) {
        const bodyResp = await fetch(url);
        if (!bodyResp.ok) return false;
        const buf = Buffer.from(await bodyResp.arrayBuffer());
        if (buf.length < 15_000) {
          logger.warn('Preview image likely black/blank (too small after download)', { url, size: buf.length });
          return false;
        }
      }
      return true;
    } catch {
      return true; // on error, assume valid — let downstream handle it
    }
  };

  // For characters, flux-pro/v1.1-ultra now goes first (quality + color), then standard
  // flux-pro, then schnell/dev. For game/prop contexts, schnell stays first (cheap,
  // plenty good for backgrounds and isolated props). User feedback: lower-cost paths
  // occasionally produced black-and-white characters for "premium / sigma / chad" briefs.
  const useCharacterNeg = context === 'character';
  const negPrompt = useCharacterNeg ? CHARACTER_NEGATIVE : NEGATIVE_PROMPT;
  const ultraConfig = {
    name: 'flux-pro/v1.1-ultra',
    config: {
      endpoint: 'fal-ai/flux-pro/v1.1-ultra',
      payload: { prompt, aspect_ratio: '3:4', output_format: 'png', num_images: 1, safety_tolerance: '6', enhance_prompt: true, raw: false },
    },
  };
  const proConfig = {
    name: 'flux-pro/v1.1',
    config: {
      endpoint: 'fal-ai/flux-pro/v1.1',
      payload: { prompt, negative_prompt: negPrompt, image_size: { width: imgW, height: imgH }, num_inference_steps: 28, num_images: 1, guidance_scale: 3.5, safety_tolerance: '6' },
    },
  };
  // schnell with 8 inference steps for characters (4 for game/prop). 8 steps is roughly
  // 2x the wall time of 4-step (~2-3s vs ~1s) but visibly improves color saturation and
  // detail on stylized characters — the previous 4-step schnell was producing greyscale
  // bodies for short briefs ("Talking NPC", "Sigma Chad"). Game/prop contexts stay at 4
  // steps because backgrounds and isolated objects don't suffer from undersaturation.
  const schnellSteps = context === 'character' ? 8 : 4;
  const schnellConfig = {
    name: 'flux/schnell',
    config: {
      endpoint: 'fal-ai/flux/schnell',
      payload: { prompt, negative_prompt: negPrompt, image_size: { width: imgW, height: imgH }, num_inference_steps: schnellSteps, num_images: 1 },
    },
  };
  const devConfig = {
    name: 'flux/dev',
    config: {
      endpoint: 'fal-ai/flux/dev',
      payload: { prompt, negative_prompt: negPrompt, image_size: { width: imgW, height: imgH }, num_inference_steps: 28, num_images: 1, guidance_scale: 3.5 },
    },
  };
  // For characters, flux-pro/v1.1-ultra goes first. It costs more than standard
  // flux-pro but provides higher resolution/detail and better prompt adherence for
  // the concept image that becomes the 3D mesh input. Standard flux-pro remains the
  // fallback, then schnell/dev.
  //
  // Previously flux-pro/v1.1 (28-step) went first. schnell at 4-8 steps consistently
  // returned grey / monochrome results for muscular or "realistic" briefs (Sigma Chad, Gym
  // Bro) even with explicit "FULLY COLORED, vibrant saturated colors" positive and an
  // anti-monochrome negative. It also occasionally smeared training-set references into
  // the corner of the image (a tiny Batman appeared next to a Gym Bro). flux-pro is ~3-5s
  // wall time vs ~1s schnell — acceptable trade-off for predictable colour. The earlier
  // pro-first experiment broke because the prompt was "premium realistic studio lighting"
  // which nudged Flux toward photorealism and Meshy v6 image-to-3d rejected with
  // content_policy_violation. Now the prompt is "stylized cartoon vibrant" — Meshy is fine
  // with toon characters. game/prop contexts keep schnell first (cheap + good enough).
  const falProviders: Array<{ name: string; config: Parameters<typeof runFal>[1] }> = context === 'character'
    ? [ultraConfig, proConfig, schnellConfig, devConfig]
    : [schnellConfig, proConfig, devConfig];

  for (const provider of falProviders) {
    try {
      const result = await runFal(provider.name, provider.config);
      if (result.outputUrl && await isValidImage(result.outputUrl)) {
        logger.info(`Preview texture generated via Fal.ai ${provider.name}`, { url: result.outputUrl });
        return result.outputUrl;
      }
      logger.warn(`Fal.ai ${provider.name} returned black/invalid image, trying next`);
    } catch (error) {
      logger.warn(`Fal.ai ${provider.name} failed, trying next`, error);
    }
  }

  return undefined;
}

// ── Body color extraction from concept image ────────────────────────────

export interface RobloxBodyColors {
  headColor: [number, number, number];
  torsoColor: [number, number, number];
  leftArmColor: [number, number, number];
  rightArmColor: [number, number, number];
  leftLegColor: [number, number, number];
  rightLegColor: [number, number, number];
}

export interface OutfitDescription {
  shirtFront: string;
  shirtBack: string;
  leftSleeve: string;
  rightSleeve: string;
  pantsFront: string;
  pantsBack: string;
  leftLeg: string;
  rightLeg: string;
  shirtMaterial: string;
  pantsMaterial: string;
  shirtDesign: string;
  pantsDesign: string;
  // 2026-05-20: NEW fields — *just* the graphic motif (no garment words).
  // The compositor uses these to render the chest/leg print on transparent
  // background. Including words like "shirt", "t-shirt", "hoodie" in the
  // Flux prompt caused the model to draw a tilted t-shirt silhouette as
  // the "print", which the user kept calling "принт футболки".
  shirtPrintMotif: string;
  pantsPrintMotif: string;
  primaryColor: string;
  secondaryColor: string;
}

/**
 * Analyse a concept character image with Gemini Vision and return per-region
 * RGB colours suitable for the R15 BodyColors instance.
 */
export async function extractBodyColorsFromImage(
  imageUrl: string,
): Promise<RobloxBodyColors | undefined> {
  const apiKey = requireValue(GEMINI_API_KEY.value(), 'GEMINI_API_KEY');
  const { base64, mimeType } = await fetchImageAsBase64(imageUrl);

  const systemPrompt =
    'You are analysing a character concept image to extract body-region colours ' +
    'for a Roblox R15 character.\n' +
    'Return ONLY a JSON object with RGB values (0-255) for each body region:\n' +
    '{\n' +
    '  "headColor": [R, G, B],\n' +
    '  "torsoColor": [R, G, B],\n' +
    '  "leftArmColor": [R, G, B],\n' +
    '  "rightArmColor": [R, G, B],\n' +
    '  "leftLegColor": [R, G, B],\n' +
    '  "rightLegColor": [R, G, B]\n' +
    '}\n' +
    'Pick the most representative colour for each body part. ' +
    'If arms or legs share the same colour, repeat the values. ' +
    'For clothed characters use the clothing colour for that region.';

  try {
    const raw = await fetchJson(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{
            role: 'user',
            parts: [
              { inlineData: { mimeType, data: base64 } },
              { text: 'Extract the body region colours from this character image.' },
            ],
          }],
        }),
      },
    );

    const candidates = raw.candidates as JsonRecord[] | undefined;
    const content = candidates?.[0]?.content as JsonRecord | undefined;
    const textPart = firstString(content?.parts) ?? '{}';

    const start = textPart.indexOf('{');
    const end = textPart.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      logger.warn('extractBodyColorsFromImage: non-JSON response', { textPart: textPart.slice(0, 300) });
      return undefined;
    }

    const parsed = JSON.parse(textPart.slice(start, end + 1)) as Record<string, unknown>;

    const isRgb = (v: unknown): v is [number, number, number] =>
      Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && n >= 0 && n <= 255);

    if (
      isRgb(parsed.headColor) &&
      isRgb(parsed.torsoColor) &&
      isRgb(parsed.leftArmColor) &&
      isRgb(parsed.rightArmColor) &&
      isRgb(parsed.leftLegColor) &&
      isRgb(parsed.rightLegColor)
    ) {
      logger.info('extractBodyColorsFromImage: colours extracted', parsed);
      return parsed as unknown as RobloxBodyColors;
    }

    logger.warn('extractBodyColorsFromImage: invalid colour structure', { parsed });
  } catch (error) {
    logger.warn('extractBodyColorsFromImage failed', error);
  }
  return undefined;
}

/**
 * Describe a user-attached reference image (screenshot/concept) so it can be
 * injected into a chat prompt. Returns a concise plaintext summary (≤500 chars).
 * Returns empty string on failure — chat must keep working without vision.
 */
export async function describeReferenceImage(imageUrl: string): Promise<string> {
  if (!imageUrl?.trim()) return '';

  const apiKey = requireValue(GEMINI_API_KEY.value(), 'GEMINI_API_KEY');
  const systemPrompt =
    'You analyse a user-attached reference image (screenshot, concept art, ' +
    'inspiration) for a Roblox game-generation assistant. Return ONLY a JSON ' +
    'object with these fields:\n' +
    '{\n' +
    '  "subject": short string (e.g. "Adopt Me lobby UI", "ninja character concept"),\n' +
    '  "paletteHex": array of 3-5 dominant hex colours like "#aabbcc",\n' +
    '  "mood": short string (e.g. "pastel cozy", "dark gritty", "neon arcade"),\n' +
    '  "silhouette": short string describing main shape/composition,\n' +
    '  "uiElements": optional array of strings if it is a UI screenshot,\n' +
    '  "gameStyle": optional short string (e.g. "tycoon", "obby", "RPG"),\n' +
    '  "productionNotes": 1-2 short sentences with creator-ready cues\n' +
    '}\n' +
    'Keep all strings short. No markdown, no commentary.';

  try {
    const { base64, mimeType } = await fetchImageAsBase64(imageUrl);
    const raw = await fetchJson(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{
            role: 'user',
            parts: [
              { inlineData: { mimeType, data: base64 } },
              { text: 'Describe this reference image as the JSON object.' },
            ],
          }],
        }),
      },
    );

    const candidates = raw.candidates as JsonRecord[] | undefined;
    const content = candidates?.[0]?.content as JsonRecord | undefined;
    const textPart = firstString(content?.parts) ?? '';
    const parsed = extractJsonObject(textPart);
    if (!parsed) {
      logger.warn('describeReferenceImage: non-JSON response', { textPart: textPart.slice(0, 300) });
      return '';
    }

    const lines: string[] = [];
    if (typeof parsed.subject === 'string') lines.push(`Subject: ${parsed.subject}`);
    if (Array.isArray(parsed.paletteHex)) {
      const palette = parsed.paletteHex.filter((v): v is string => typeof v === 'string').slice(0, 5);
      if (palette.length) lines.push(`Palette: ${palette.join(', ')}`);
    }
    if (typeof parsed.mood === 'string') lines.push(`Mood: ${parsed.mood}`);
    if (typeof parsed.silhouette === 'string') lines.push(`Silhouette: ${parsed.silhouette}`);
    if (Array.isArray(parsed.uiElements)) {
      const ui = parsed.uiElements.filter((v): v is string => typeof v === 'string').slice(0, 6);
      if (ui.length) lines.push(`UI elements: ${ui.join(', ')}`);
    }
    if (typeof parsed.gameStyle === 'string') lines.push(`Game style: ${parsed.gameStyle}`);
    if (typeof parsed.productionNotes === 'string') lines.push(`Notes: ${parsed.productionNotes}`);

    const summary = lines.join('\n');
    return summary.length > 500 ? `${summary.slice(0, 497)}...` : summary;
  } catch (error) {
    logger.warn('describeReferenceImage failed', error);
    return '';
  }
}

function sanitizeHexColor(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const clean = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(clean)) return clean;
  if (/^[0-9a-fA-F]{6}$/.test(clean)) return `#${clean}`;
  return fallback;
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const cleaned = text
    .replace(/^```json/i, '')
    .replace(/^```/i, '')
    .replace(/```$/i, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function asText(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export interface ClothingTextureUploadResult {
  assetUrl?: string;
  fallbackPngUrl?: string;
  safetyFailed?: boolean;
  textureBuffer?: Buffer;
}

async function isTextureSafeForRoblox(buffer: Buffer): Promise<boolean> {
  try {
    const apiKey = requireValue(GEMINI_API_KEY.value(), 'GEMINI_API_KEY');
    const base64 = buffer.toString('base64');
    const raw = await fetchJson(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text:
            'You are a content safety filter for Roblox (a children\'s gaming platform). ' +
            'Analyze the image and answer with ONLY the word SAFE or UNSAFE.\n' +
            'This image is a CLOTHING TEXTURE for a Roblox shirt or pants template, or a square classic T-Shirt graphic. ' +
            'It is EXPECTED to show a flat UV layout with fabric, colors, and patterns shaped like body parts (torso, arms, legs), or a flat chest graphic. ' +
            'This is normal for Roblox clothing templates and should NOT be flagged.\n' +
            'Mark as UNSAFE ONLY if the image contains:\n' +
            '- Nudity, suggestive, or sexual content\n' +
            '- Realistic human skin or naked body\n' +
            '- Violence, gore, blood, or weapons\n' +
            '- Hate symbols, profanity, or offensive text\n' +
            '- Drug or alcohol references\n' +
            'Mark as SAFE if the image is a clothing pattern, fabric texture, color design, or stylized garment template.',
          }] },
          contents: [{
            role: 'user',
            parts: [
              { inlineData: { mimeType: 'image/png', data: base64 } },
              { text: 'Is this image safe to upload to Roblox? Answer SAFE or UNSAFE only.' },
            ],
          }],
        }),
      },
    );
    const candidates = raw.candidates as JsonRecord[] | undefined;
    const content = candidates?.[0]?.content as JsonRecord | undefined;
    const textPart = (firstString(content?.parts) ?? '').trim().toUpperCase();
    const safe = textPart.includes('SAFE') && !textPart.includes('UNSAFE');
    if (!safe) {
      logger.warn('Texture safety check FAILED', { response: textPart.slice(0, 100) });
    }
    return safe;
  } catch (err) {
    logger.warn('Texture safety check error, allowing upload', err);
    return true;
  }
}

const UPLOAD_MAX_RETRIES = 3;
const UPLOAD_RETRY_DELAY_MS = 2000;

async function uploadGeneratedClothingTexture(
  buffer: Buffer,
  folder: 'shirts' | 'pants' | 'tshirts',
): Promise<ClothingTextureUploadResult> {
  const bucket = getStorage().bucket('roblox-ai-gen-v2-artifacts');
  const fileName = `generated-clothing/${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.png`;
  const file = bucket.file(fileName);
  await file.save(buffer, {
    contentType: 'image/png',
    metadata: { cacheControl: 'public, max-age=31536000' },
    resumable: false,
  });

  let fallbackPngUrl: string | undefined;
  try {
    const [signedUrl] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 365 * 24 * 60 * 60 * 1000,
    });
    fallbackPngUrl = signedUrl;
  } catch {
    fallbackPngUrl = `gs://${bucket.name}/${fileName}`;
  }

  const safe = await isTextureSafeForRoblox(buffer);
  if (!safe) {
    logger.warn('Texture failed safety check', { folder });
    return { fallbackPngUrl, safetyFailed: true };
  }

  logger.info('Clothing texture saved to Storage (user will upload to Roblox)', { folder, fallbackPngUrl: !!fallbackPngUrl });
  return { fallbackPngUrl, textureBuffer: buffer };
}

export async function analyzeOutfitFromConcept(imageUrl: string): Promise<OutfitDescription> {
  const apiKey = requireValue(GEMINI_API_KEY.value(), 'GEMINI_API_KEY');
  const { base64, mimeType } = await fetchImageAsBase64(imageUrl);
  const systemPrompt =
    'Analyze this Roblox character concept image. Describe the CLOTHING DESIGN in detail.\n' +
    'Return ONLY JSON with keys:\n' +
    '{\n' +
    '  "shirtFront": "...",\n' +
    '  "shirtBack": "...",\n' +
    '  "leftSleeve": "...",\n' +
    '  "rightSleeve": "...",\n' +
    '  "pantsFront": "...",\n' +
    '  "pantsBack": "...",\n' +
    '  "leftLeg": "...",\n' +
    '  "rightLeg": "...",\n' +
    '  "shirtMaterial": "material and color only, e.g. black smooth leather",\n' +
    '  "pantsMaterial": "material and color only, e.g. dark blue denim",\n' +
    '  "shirtDesign": "ALWAYS start with the dominant COLOR. Describe in Roblox cartoon style. NO brand logos, NO text, NO faces. Example: bright red cotton t-shirt with simple black star on chest. Another: dark navy blue hoodie with white drawstrings.",\n' +
    '  "pantsDesign": "ALWAYS start with the dominant COLOR. Describe in Roblox cartoon style. NO brand logos, NO text, NO faces. Example: dark blue denim jeans with simple stitching. Another: black cargo pants with side pockets.",\n' +
    '  "primaryColor": "#RRGGBB (the DOMINANT color of the outfit, NEVER grey/white unless the garment is actually white/grey)",\n' +
    '  "secondaryColor": "#RRGGBB (accent/secondary color)"\n' +
    '}';

  const raw = await fetchJson(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{
          role: 'user',
          parts: [
            { inlineData: { mimeType, data: base64 } },
            { text: 'Describe each clothing region for Roblox shirt and pants generation.' },
          ],
        }],
      }),
    },
  );

  const candidates = raw.candidates as JsonRecord[] | undefined;
  const content = candidates?.[0]?.content as JsonRecord | undefined;
  const textPart = firstString(content?.parts) ?? '{}';
  const parsed = extractJsonObject(textPart) ?? {};

  return {
    shirtFront: asText(parsed.shirtFront, 'solid jacket front'),
    shirtBack: asText(parsed.shirtBack, 'solid jacket back'),
    leftSleeve: asText(parsed.leftSleeve, 'solid sleeve texture'),
    rightSleeve: asText(parsed.rightSleeve, 'solid sleeve texture'),
    pantsFront: asText(parsed.pantsFront, 'solid pants front'),
    pantsBack: asText(parsed.pantsBack, 'solid pants back'),
    leftLeg: asText(parsed.leftLeg, 'solid pant leg texture'),
    rightLeg: asText(parsed.rightLeg, 'solid pant leg texture'),
    shirtMaterial: asText(parsed.shirtMaterial, 'solid colored fabric'),
    pantsMaterial: asText(parsed.pantsMaterial, 'solid colored fabric'),
    shirtDesign: asText(parsed.shirtDesign, 'bright red casual t-shirt with clean solid color'),
    pantsDesign: asText(parsed.pantsDesign, 'dark blue denim jeans'),
    shirtPrintMotif: sanitizePrintMotif(asText(parsed.shirtPrintMotif, 'a single bold geometric shape in the center')),
    pantsPrintMotif: sanitizePrintMotif(asText(parsed.pantsPrintMotif, 'a thin vertical stripe down the side')),
    primaryColor: sanitizeHexColor(parsed.primaryColor, '#CC2222'),
    secondaryColor: sanitizeHexColor(parsed.secondaryColor, '#1A1A2E'),
  };
}

// 2026-05-20: Belt-and-braces guard for the print motif strings sent to
// Flux. Even with the strongest Gemini prompt, the model occasionally
// slips in "t-shirt" / "hoodie" / "shirt" anyway, which immediately makes
// Flux draw a tilted garment silhouette instead of a flat print. Strip
// every garment noun out before we send it to the image model.
function sanitizePrintMotif(input: string): string {
  const banned = /\b(t[\-\s]?shirts?|tshirts?|shirts?|hoodies?|sweaters?|jackets?|coats?|garments?|tops?|dresses?|pants?|jeans?|trousers?|shorts?|skirts?|sleeves?|collars?|cuffs?|hems?|fabric|clothing|outfit|apparel|wearables?|mannequins?)\b/gi;
  const stripped = input.replace(banned, '').replace(/\s+/g, ' ').trim();
  if (!stripped || stripped.length < 6) {
    return 'a single bold geometric shape in the center';
  }
  return stripped;
}

// 2026-05-20: New "transparent print" variant — generates the design as a
// centered logo/graphic/emblem on PURE WHITE, then pipes through fal rembg
// so the white drops out to alpha. The compositor stamps this onto the
// front-torso UV region, and the avatar's underlying primaryColor shows
// around the print. Same recipe the T-Shirt path uses (and which the user
// confirmed produces a "real graphic on a shirt" look instead of "white
// square with logo inside a white shirt").
async function generateClothingDesignTransparent(
  designDescription: string,
): Promise<Buffer> {
  // 2026-05-20: Defense-in-depth. The input is already sanitised in
  // sanitizePrintMotif() before reaching here, but be safe anyway —
  // strip any remaining garment nouns just before we hand to Flux.
  const sanitised = designDescription
    .replace(/\b(t[\-\s]?shirts?|tshirts?|shirts?|hoodies?|sweaters?|jackets?|coats?|garments?|tops?|dresses?|pants?|jeans?|trousers?|shorts?|skirts?|sleeves?|collars?|cuffs?|hems?|fabric|clothing|outfit|apparel|wearables?|mannequins?)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim() || 'a single bold geometric shape in the center';
  const prompt =
    `STICKER DESIGN ONLY: ${sanitised}. ` +
    '\n\nThis is a flat 2D STICKER / PATCH / DECAL. Think Telegram sticker, Discord emoji, or printable iron-on patch — NOT a piece of clothing.\n\n' +
    'STRICT RULES — violations will be rejected:\n' +
    '1. Draw the graphic motif ONLY. Pretend you are designing a single icon for an app — no garment, no clothing, no fashion product.\n' +
    '2. Output composition: ONE centered subject taking up the middle ~50-65% of the 512×512 canvas. Pure white background everywhere else.\n' +
    '3. ABSOLUTELY FORBIDDEN visuals (these are auto-reject):\n' +
    '   • Any t-shirt, shirt, hoodie, jacket, dress, vest, top, or any other garment silhouette — even tilted or partially shown.\n' +
    '   • Sleeves, collars, fabric folds, neck holes, garment seams, or any cloth-like geometry.\n' +
    '   • A 3D rendering of clothing, a clothing product mockup, or a clothing photo.\n' +
    '   • A mannequin, person, body, torso, head, character, or figure of any kind.\n' +
    '   • A flat-lay top-down photograph of laid-out clothing.\n' +
    '4. ALLOWED visuals: bold cartoon icon, stylised emblem, geometric shape, simple flat illustration, paint splatter, pattern motif, sticker-style logo (no real brands).\n' +
    '5. Style: Roblox cartoon — bold simple shapes, high contrast, crisp edges, flat colors, no gradients, no shading, no 3D, no shadows, no wrinkles. Readable at small avatar scale (~80px tall on screen).\n' +
    '6. No real-world brand logos (Nike, Adidas, Supreme, etc.). No copyrighted characters. No profanity. No text/letters unless the description explicitly asks for them.\n\n' +
    'Final reminder: this is a STICKER on white background. If you start drawing fabric, sleeves, or any garment outline, STOP and draw just the icon instead.';
  const result = await runFal('flux-pro/v1.1', {
    endpoint: 'fal-ai/flux-pro/v1.1',
    payload: {
      prompt,
      image_size: { width: 512, height: 512 },
      num_inference_steps: 28,
      num_images: 1,
      guidance_scale: 5.5,
      safety_tolerance: '5',
    },
  });
  if (!result.outputUrl) {
    throw new Error('Flux did not return clothing design URL');
  }
  // Background removal via fal rembg → transparent alpha around the logo.
  let downloadUrl = result.outputUrl;
  const cleanedUrl = await removeImageBackgroundViaFal(result.outputUrl);
  if (cleanedUrl) {
    downloadUrl = cleanedUrl;
  } else {
    logger.warn('[generateClothingDesignTransparent] rembg returned null, using raw Flux output (white BG)');
  }
  const resp = await fetch(downloadUrl);
  if (!resp.ok) {
    throw new Error(`Failed to download clothing design: ${resp.status}`);
  }
  const src = Buffer.from(await resp.arrayBuffer());
  return sharp(src)
    .resize(512, 512, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
}

async function generateClothingDesign(
  designDescription: string,
  width: number,
  height: number,
): Promise<Buffer> {
  const upscaleWidth = Math.max(512, width * 2);
  const upscaleHeight = Math.max(512, Math.round((height / width) * upscaleWidth));
  const prompt =
    `Flat colored ${designDescription}. ` +
    'The image must be filled entirely with the EXACT COLOR and pattern described. ' +
    'If a specific color is mentioned (red, blue, black, etc.), the dominant color MUST match it. ' +
    'If there are stripes, plaid, camo, or geometric patterns — render them clearly. ' +
    'Roblox game style: simple, bold, cartoon-like colors. ' +
    'ABSOLUTELY NO real-world brand logos (Nike, Adidas, Supreme, etc). ' +
    'ABSOLUTELY NO human faces, no photographs, no realistic textures. ' +
    'ABSOLUTELY NO text or letters on the design. ' +
    'Flat 2D digital design, clean and crisp. No 3D, no wrinkles, no shadows. ' +
    'No garment shape, no t-shirt silhouette, no mannequin, no person. ' +
    'Just the flat colored surface pattern filling the entire image edge to edge.';
  const result = await runFal('flux-pro/v1.1', {
    endpoint: 'fal-ai/flux-pro/v1.1',
    payload: {
      prompt,
      image_size: { width: upscaleWidth, height: upscaleHeight },
      num_inference_steps: 28,
      num_images: 1,
      guidance_scale: 5.5,
      safety_tolerance: '5',
    },
  });

  if (!result.outputUrl) {
    throw new Error('Flux did not return clothing design URL');
  }
  const resp = await fetch(result.outputUrl);
  if (!resp.ok) {
    throw new Error(`Failed to download clothing design: ${resp.status}`);
  }
  const src = Buffer.from(await resp.arrayBuffer());
  return sharp(src).resize(width, height, { fit: 'cover' }).png().toBuffer();
}

async function generateMaterialTexture(
  materialDescription: string,
  width: number,
  height: number,
): Promise<Buffer> {
  const prompt =
    `Seamless tileable ${materialDescription} fabric texture, ` +
    'flat surface photographed from directly above, uniform lighting, ' +
    'no perspective distortion, no shadows, no wrinkles, no garment shape. ' +
    'Just the raw material surface filling the entire frame. ' +
    'Clean, sharp, high detail. ABSOLUTELY no person, no mannequin, no body.';
  const result = await runFal('flux-pro/v1.1', {
    endpoint: 'fal-ai/flux-pro/v1.1',
    payload: {
      prompt,
      image_size: { width: 512, height: 512 },
      num_inference_steps: 28,
      num_images: 1,
      guidance_scale: 4.0,
      safety_tolerance: '5',
    },
  });
  if (!result.outputUrl) throw new Error('Flux did not return material texture URL');
  const resp = await fetch(result.outputUrl);
  if (!resp.ok) throw new Error(`Failed to download material texture: ${resp.status}`);
  const src = Buffer.from(await resp.arrayBuffer());
  return sharp(src).resize(width, height, { fit: 'cover' }).png().toBuffer();
}

const SAFETY_MAX_RETRIES = 2;

async function buildTShirtDebugGraphic(): Promise<Buffer> {
  const svg = `
    <svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
      <rect width="512" height="512" rx="56" fill="#111827"/>
      <circle cx="256" cy="256" r="156" fill="#22D3EE"/>
      <path d="M256 104 L292 218 L412 218 L314 288 L352 404 L256 332 L160 404 L198 288 L100 218 L220 218 Z" fill="#FACC15"/>
      <circle cx="256" cy="256" r="70" fill="#F97316" opacity="0.92"/>
    </svg>
  `;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function generateTShirtGraphicImage(promptText: string): Promise<Buffer> {
  // 2026-05-20: strip garment nouns from the user-supplied description before
  // sending to Flux — the model otherwise drew tilted t-shirt silhouettes
  // because the prompt itself contained "t-shirt", "shirt" etc. Same fix as
  // generateClothingDesignTransparent.
  const sanitised = promptText
    .trim()
    .slice(0, 1200)
    .replace(/\b(t[\-\s]?shirts?|tshirts?|shirts?|hoodies?|sweaters?|jackets?|coats?|garments?|tops?|dresses?|pants?|jeans?|trousers?|shorts?|skirts?|sleeves?|collars?|cuffs?|hems?|fabric|clothing|outfit|apparel|wearables?|mannequins?)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim() || 'a single bold geometric shape in the center';
  const prompt =
    `STICKER DESIGN ONLY: ${sanitised}. ` +
    '\n\nThis is a flat 2D STICKER / PATCH / DECAL. Think Telegram sticker, Discord emoji, or printable iron-on patch — NOT a piece of clothing.\n\n' +
    'STRICT RULES — violations will be rejected:\n' +
    '1. Draw the graphic motif ONLY. Pretend you are designing a single icon for an app — no garment, no clothing, no fashion product.\n' +
    '2. Output composition: ONE centered subject taking up the middle ~50-65% of the 512×512 canvas. Pure white background everywhere else.\n' +
    '3. ABSOLUTELY FORBIDDEN visuals (these are auto-reject):\n' +
    '   • Any t-shirt, shirt, hoodie, jacket, dress, vest, top, or any other garment silhouette — even tilted or partially shown.\n' +
    '   • Sleeves, collars, fabric folds, neck holes, garment seams, or any cloth-like geometry.\n' +
    '   • A 3D rendering of clothing, a clothing product mockup, or a clothing photo.\n' +
    '   • A mannequin, person, body, torso, head, character, or figure of any kind.\n' +
    '   • A flat-lay top-down photograph of laid-out clothing.\n' +
    '4. ALLOWED visuals: bold cartoon icon, stylised emblem, geometric shape, simple flat illustration, paint splatter, pattern motif, sticker-style logo (no real brands).\n' +
    '5. Style: Roblox cartoon — bold simple shapes, high contrast, crisp edges, flat colors, no gradients, no shading, no 3D, no shadows, no wrinkles. Readable at small avatar scale (~80px tall on screen).\n' +
    '6. No real-world brand logos (Nike, Adidas, Supreme, etc.). No copyrighted characters. No profanity. No text/letters unless the description explicitly asks for them.\n\n' +
    'Final reminder: this is a STICKER on white background. If you start drawing fabric, sleeves, or any garment outline, STOP and draw just the icon instead.';
  const result = await runFal('flux-pro/v1.1', {
    endpoint: 'fal-ai/flux-pro/v1.1',
    payload: {
      prompt,
      image_size: { width: 512, height: 512 },
      num_inference_steps: 28,
      num_images: 1,
      guidance_scale: 5.5,
      safety_tolerance: '5',
    },
  });

  if (!result.outputUrl) {
    throw new Error('Flux did not return T-Shirt graphic URL');
  }
  // 2026-05-20: pipe Flux output through fal rembg so the white background
  // becomes transparent. Roblox stretches the 512×512 decal across the front
  // torso — with a solid white BG the design reads as a "white t-shirt with
  // logo inside the t-shirt", which is what the user kept complaining about.
  // Transparent BG → avatar's underlying shirt color shows around the print.
  let downloadUrl = result.outputUrl;
  const cleanedUrl = await removeImageBackgroundViaFal(result.outputUrl);
  if (cleanedUrl) {
    downloadUrl = cleanedUrl;
  } else {
    logger.warn('[generateTShirtGraphicImage] rembg returned null, using raw Flux output (white BG)');
  }
  const resp = await fetch(downloadUrl);
  if (!resp.ok) {
    throw new Error(`Failed to download T-Shirt graphic: ${resp.status}`);
  }
  const src = Buffer.from(await resp.arrayBuffer());
  // contain (not cover) + transparent background — preserves alpha and keeps
  // the logo centred without cropping if rembg returned a non-square crop.
  return sharp(src)
    .resize(512, 512, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
}

export async function generateTShirtGraphic(
  promptText: string,
): Promise<ClothingTextureUploadResult | undefined> {
  try {
    const debugMode = process.env.CLOTHING_TEXTURE_DEBUG === '1';
    if (debugMode) {
      return await uploadGeneratedClothingTexture(await buildTShirtDebugGraphic(), 'tshirts');
    }

    for (let attempt = 1; attempt <= SAFETY_MAX_RETRIES; attempt++) {
      const graphic = await generateTShirtGraphicImage(promptText);
      const result = await uploadGeneratedClothingTexture(graphic, 'tshirts');
      if (!result.safetyFailed) return result;
      logger.warn(`T-Shirt graphic failed safety check, regenerating (attempt ${attempt}/${SAFETY_MAX_RETRIES})`);
    }
    logger.warn('T-Shirt graphic failed safety check after all retries');
    return undefined;
  } catch (error) {
    logger.warn('generateTShirtGraphic failed', error);
    return undefined;
  }
}

export async function generateShirtTexture(
  conceptImageUrl: string,
  characterDescription: string,
): Promise<ClothingTextureUploadResult | undefined> {
  try {
    const debugMode = process.env.CLOTHING_TEXTURE_DEBUG === '1';
    if (debugMode) {
      const debug = await buildTemplateDebugMap('shirt');
      return await uploadGeneratedClothingTexture(debug, 'shirts');
    }
    const outfit = await analyzeOutfitFromConcept(conceptImageUrl);

    for (let attempt = 1; attempt <= SAFETY_MAX_RETRIES; attempt++) {
      // 2026-05-20 quality refactor: render the front-torso design on a
      // transparent background (rembg removes the white fill the same way
      // it does for T-Shirts). The compositor's primaryColor canvas shows
      // around the logo → looks like a real printed graphic on a coloured
      // shirt, not "white square with a logo inside on a green shirt".
      //
      // CRITICAL: use shirtPrintMotif (NOT shirtDesign) — the motif field
      // is garment-noun-free, so Flux draws a flat sticker instead of a
      // tilted t-shirt silhouette (which was happening with shirtDesign).
      const fabricTexture = await generateClothingDesignTransparent(outfit.shirtPrintMotif);

      const composed = await compositeShirtTemplate({
        frontTorso: fabricTexture,
        // backTorso / sleeves intentionally omitted — compositor fills them
        // with primaryColor (back) and secondaryColor (sleeves) for the
        // clean "pro UGC" look.
        primaryColorHex: outfit.primaryColor,
        secondaryColorHex: outfit.secondaryColor,
      });
      const result = await uploadGeneratedClothingTexture(composed, 'shirts');
      if (!result.safetyFailed) return result;
      logger.warn(`Shirt texture failed safety check, regenerating (attempt ${attempt}/${SAFETY_MAX_RETRIES})`);
    }
    logger.warn('Shirt texture failed safety check after all retries');
    return undefined;
  } catch (error) {
    logger.warn('generateShirtTexture failed', error);
    return undefined;
  }
}

export async function generatePantsTexture(
  conceptImageUrl: string,
  characterDescription: string,
): Promise<ClothingTextureUploadResult | undefined> {
  try {
    const debugMode = process.env.CLOTHING_TEXTURE_DEBUG === '1';
    if (debugMode) {
      const debug = await buildTemplateDebugMap('pants');
      return await uploadGeneratedClothingTexture(debug, 'pants');
    }
    const outfit = await analyzeOutfitFromConcept(conceptImageUrl);

    for (let attempt = 1; attempt <= SAFETY_MAX_RETRIES; attempt++) {
      // 2026-05-20 quality refactor: pants design also on transparent BG.
      // For pants the "design" is typically a stripe/seam/pocket detail —
      // works the same way as the shirt logo: rembg drops the white fill
      // so it composites cleanly over the primary leg color. Uses the
      // garment-noun-free pantsPrintMotif (NOT pantsDesign) to keep Flux
      // from drawing pants-shaped silhouettes.
      const fabricTexture = await generateClothingDesignTransparent(outfit.pantsPrintMotif);

      const composed = await compositePantsTemplate({
        leftLeg: fabricTexture,
        // rightLeg / front/back torso / other faces intentionally omitted —
        // compositor fills with primary (waist) / secondary (other faces).
        primaryColorHex: outfit.primaryColor,
        secondaryColorHex: outfit.secondaryColor,
      });
      const result = await uploadGeneratedClothingTexture(composed, 'pants');
      if (!result.safetyFailed) return result;
      logger.warn(`Pants texture failed safety check, regenerating (attempt ${attempt}/${SAFETY_MAX_RETRIES})`);
    }
    logger.warn('Pants texture failed safety check after all retries');
    return undefined;
  } catch (error) {
    logger.warn('generatePantsTexture failed', error);
    return undefined;
  }
}

// ── Background removal (for Tool icons) ─────────────────────────────────
// Session 327: Item/Weapon/Furniture concept images are generated on a plain
// white background. To use them as Tool.TextureContent we want a transparent
// PNG so the hotbar slot's colored background shows through. fal-ai's
// imageutils/rembg removes the background and (with crop_to_bbox) tight-crops
// to the subject — both fixes in one call. Returns the new image URL or null
// on failure (caller falls back to the original image).
export async function removeImageBackgroundViaFal(
  imageUrl: string,
): Promise<string | null> {
  try {
    const result = await runFal('imageutils/rembg', {
      endpoint: 'fal-ai/imageutils/rembg',
      payload: {
        image_url: imageUrl,
        crop_to_bbox: true,
      },
    });
    const raw = result.raw as Record<string, unknown> | undefined;
    const image = raw?.image as Record<string, unknown> | undefined;
    const url = typeof image?.url === 'string' ? image.url : undefined;
    if (!url) {
      logger.warn('[removeImageBackgroundViaFal] no image.url in response', {
        keys: raw ? Object.keys(raw) : [],
      });
      return null;
    }
    return url;
  } catch (err) {
    logger.warn('[removeImageBackgroundViaFal] threw', { error: (err as Error).message });
    return null;
  }
}

// ── Decal / Texture generation ──────────────────────────────────────────

export interface DecalTextureSpec {
  imagePrompt: string;
  negativePrompt?: string;
  surface?: string;
  tiling?: boolean;
  transparency?: boolean;
  recommendedSize?: 512 | 1024;
  styleTags?: string[];
  robloxUsage?: string;
  widthStuds?: number;
  depthStuds?: number;
}

export async function generateDecalTexture(
  spec: DecalTextureSpec,
): Promise<string | undefined> {
  const size = spec.recommendedSize ?? 512;
  const prompt = [
    spec.imagePrompt,
    spec.tiling ? 'seamless tileable pattern' : '',
    spec.transparency ? 'isolated on transparent background, alpha channel, PNG' : '',
    'no text, no watermarks, no logos',
  ].filter(Boolean).join(', ');

  const negative = spec.negativePrompt
    ?? 'text, watermark, logo, blurry, low quality, border, frame, signature';

  logger.info('Generating decal texture', { prompt: prompt.substring(0, 200), size });

  try {
    const falResult = await runFal('flux-pro/v1.1', {
      endpoint: 'fal-ai/flux-pro/v1.1',
      payload: {
        prompt,
        image_size: { width: size, height: size },
        num_inference_steps: 28,
        num_images: 1,
        guidance_scale: 4.0,
        safety_tolerance: '5',
      },
    });
    if (falResult.outputUrl) {
      logger.info('Decal texture generated via Fal.ai flux-pro', { url: falResult.outputUrl });
      return falResult.outputUrl;
    }
  } catch (error) {
    logger.warn('Fal.ai flux-pro failed for decal texture, trying schnell', error);
  }

  try {
    const falSchnell = await runFal('flux/schnell', {
      endpoint: 'fal-ai/flux/schnell',
      payload: {
        prompt,
        image_size: { width: size, height: size },
        num_inference_steps: 4,
        num_images: 1,
      },
    });
    if (falSchnell.outputUrl) {
      logger.info('Decal texture generated via Fal.ai schnell', { url: falSchnell.outputUrl });
      return falSchnell.outputUrl;
    }
  } catch (error) {
    logger.warn('Fal.ai schnell failed for decal texture, trying ModelsLab', error);
  }

  try {
    const mlResult = await runModelsLab(prompt, {
      width: String(size),
      height: String(size),
      samples: '1',
      steps: '30',
      guidanceScale: 7.5,
    });
    if (mlResult.outputUrl) {
      logger.info('Decal texture generated via ModelsLab', { url: mlResult.outputUrl });
      return mlResult.outputUrl;
    }
  } catch (error) {
    logger.warn('ModelsLab decal texture generation failed', error);
  }

  return undefined;
}

// ── Text-to-3D providers (Meshy v6 & Hunyuan3D v3 via fal.ai) ──────────

const CONCEPT_IMAGE_STYLE_HINT =
  'Stylized 3D character reference sheet style. Neutral resting pose: arms hanging straight down along the sides of the body, palms facing the thighs, legs straight and shoulder-width apart. ' +
  'Front-facing view, symmetrical, full body visible from head to toe. Clean silhouette with arms clearly visible along the sides without overlapping the torso. ' +
  'Character wears a fully closed long-sleeve outfit covering the whole body, long pants, and shoes. ' +
  'Original non-franchise character design; do not imitate or resemble any existing cartoon, game, TV, movie, mascot, or copyrighted character. ' +
  'No action pose, no crossed limbs, no T-pose or A-pose, no dynamic movement. Bright colors, clean shapes, plain white background.';

const NPC_CONCEPT_IMAGE_STYLE_HINT =
  'Premium stylized 3D NPC concept art for a game-ready character. Neutral resting pose with arms hanging straight down along the sides, legs straight and shoulder-width apart. ' +
  'Front-facing full body reference, head-to-toe visible, strong readable silhouette, expressive face, role-specific accessories and outfit details. ' +
  'Use a rich non-monochrome palette with at least three visible accent colors, colored trims, decals, badges, hair/accessory accents, or glowing details. ' +
  'If the concept uses black or dark clothing, add vivid cyan, violet, lime, red, or gold accents so it is not a plain black hoodie on a gray background. ' +
  'Original non-franchise character design; do not imitate or resemble any existing cartoon, game, TV, movie, mascot, or copyrighted character. ' +
  'No action pose, no crossed limbs, no T-pose or A-pose, no dynamic movement. Bright clean background, no grayscale, no monochrome, no plain gray studio render.';

const CLOTHING_STYLE_HINT =
  'Single clothing item only, floating in empty space on a plain white background. ' +
  'NO hanger, NO mannequin, NO human body, NO stand, NO rack, NO display. ' +
  'Just the garment itself, front view, clean 3D render, bright colors.';

const WEAPON_STYLE_HINT =
  'Single isolated weapon, large and close-up filling about 85% of the frame, centered. Plain solid white background (will be auto-removed for transparent icon). ' +
  'Low-poly stylized game weapon, clean geometry, bright saturated colors, simple materials. ' +
  'No character, no hands, no body. Game-ready 3D weapon asset reference.';

const ITEM_STYLE_HINT =
  'Single isolated game item/tool, large and close-up filling about 85% of the frame, centered. Plain solid white background (will be auto-removed for transparent icon). ' +
  'Low-poly stylized pickup asset, clean geometry, bright saturated colors, simple materials. ' +
  'No character, no hands, no body, no person, no mannequin. Game-ready 3D item asset reference (key, potion bottle, coin, medkit, ore/resource, flask, etc.).';

const FURNITURE_STYLE_HINT =
  'ONE single isolated furniture prop, centered on a plain white background. Low-poly stylized game asset, clean geometry, bright flat-shaded colors, simple PBR materials. ' +
  'STRICTLY ONE object only — if a chair, just the chair; if a table, just the table; if a lamp, just the lamp. ' +
  'NO additional furniture, NO chairs around the table, NO objects on top, NO scene, NO room, NO floor, NO walls, NO shadow plane, NO grouped sets, NO multiple variants, NO accessories. ' +
  'No character, no person, no hands, no body. Front 3/4 view, centered composition, game-ready 3D furniture asset reference for Roblox.';

const CLOTHING_KEYWORDS = /jacket|shirt|pants|dress|coat|hat|helmet|crown|cape|armor|shoe|boot|glove|hoodie|sweater|skirt|vest|scarf|mask|glasses|backpack|wing/i;

// Track 3 (3D Pet pipeline) — keyword maps for fast regex fallback when LLM
// classification is unavailable. Bilingual (EN + RU) to match the rest of the
// prompt enrichment layer (`generationEnrichment.ts:65`).
const PET_QUADRUPED_KEYS = /\b(dog|cat|wolf|fox|lion|tiger|bear|horse|unicorn|deer|panther|puppy|kitten|собак|кошк|волк|лис|медвед|единорог|лошад|оленен|пантер|щенок|котён)/i;
const PET_DRAGON_KEYS    = /\b(dragon|wyvern|drake|serpent|snake|hydra|дракон|вирверн|змей|гидр)/i;
const PET_ROBOT_KEYS     = /\b(robot|bot|mech|cyborg|droid|drone|робот|меха|киборг|дрон|андроид)/i;
const PET_BIRD_KEYS      = /\b(bird|phoenix|eagle|hawk|owl|feather|птиц|феникс|орел|сова)/i;
const PET_AQUATIC_KEYS   = /\b(fish|shark|whale|dolphin|octopus|рыб|акул|кит|дельфин|осьминог)/i;
const PET_FLYING_KEYS    = /\b(fly|flying|wing|wings|airborne|hover|летающ|крыл|парящ)/i;
const PET_PET_HINT_KEYS  = /\b(pet|companion|familiar|питом|компаньон|фамильяр)/i;

// Roblox pet-economy rarity tiers — Common is the base, Mythic the cap. Same
// scale used by Pet Simulator X-style games and the existing buildPetSystemScript.
const PET_RARITY_HINTS: Array<{ tier: 'Common'|'Uncommon'|'Rare'|'Epic'|'Legendary'|'Mythic'; re: RegExp }> = [
  { tier: 'Mythic',    re: /\b(mythic|mythical|divine|godly|мифическ|боже)/i },
  { tier: 'Legendary', re: /\b(legendary|exalted|ancient|легендарн|древн)/i },
  { tier: 'Epic',      re: /\b(epic|exotic|premium|эпическ|элит|премиум)/i },
  { tier: 'Rare',      re: /\b(rare|advanced|special|редк|особенн|улучшен)/i },
  { tier: 'Uncommon',  re: /\b(uncommon|enhanced|необычн)/i },
  { tier: 'Common',    re: /\b(common|basic|starter|обычн|начальн|базов)/i },
];

const PET_ELEMENT_HINTS: Array<{ element: 'Fire'|'Ice'|'Shadow'|'Light'|'Nature'|'Tech'; re: RegExp }> = [
  { element: 'Fire',   re: /\b(fire|flame|lava|magma|burning|inferno|огнен|пламен|лава)/i },
  { element: 'Ice',    re: /\b(ice|frost|snow|frozen|cryo|ледян|снежн|морозн)/i },
  { element: 'Shadow', re: /\b(shadow|dark|night|void|spectral|abyss|тенев|тёмн|мрак)/i },
  { element: 'Light',  re: /\b(light|holy|divine|celestial|radiant|солнечн|свет|сия)/i },
  { element: 'Nature', re: /\b(nature|forest|leaf|earth|plant|verdant|природ|лесн|расти)/i },
  { element: 'Tech',   re: /\b(cyber|tech|robot|mech|neon|digital|cyber|техно|механ|нейросет|неон)/i },
];

export type PetSpeciesType = 'dog' | 'cat' | 'dragon' | 'unicorn' | 'robot' | 'fantasy';
export type PetSkeletonType = 'biped' | 'mechanical_biped' | 'quadruped' | 'winged_quadruped' | 'serpentine' | 'aquatic';
export type PetRarity = 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary' | 'Mythic';
export type PetElement = 'Fire' | 'Ice' | 'Shadow' | 'Light' | 'Nature' | 'Tech' | 'Neutral';

export interface PetEvolutionStagePrompt {
  prompt: string;
  visualNotes: string;
}

export interface PetClassification {
  speciesType: PetSpeciesType;
  skeletonType: PetSkeletonType;
  rarity: PetRarity;
  element: PetElement;
  isFlying: boolean;
  baseName: string;
  evolutionArc: {
    stage1: PetEvolutionStagePrompt;
    stage2: PetEvolutionStagePrompt;
    stage3: PetEvolutionStagePrompt;
  };
}

function classifyPetByRegex(prompt: string, requestedSpecies?: string): PetClassification {
  const isDragon = PET_DRAGON_KEYS.test(prompt);
  const isRobot = PET_ROBOT_KEYS.test(prompt);
  const isBird = PET_BIRD_KEYS.test(prompt);
  const isAquatic = PET_AQUATIC_KEYS.test(prompt);
  const isQuadruped = PET_QUADRUPED_KEYS.test(prompt);
  const flyingHint = PET_FLYING_KEYS.test(prompt) || isDragon || isBird;

  let speciesType: PetSpeciesType = 'fantasy';
  if (requestedSpecies) {
    const r = requestedSpecies.toLowerCase();
    if (r === 'dog' || r === 'cat' || r === 'dragon' || r === 'unicorn' || r === 'robot') speciesType = r;
  } else if (isRobot) speciesType = 'robot';
  else if (isDragon) speciesType = 'dragon';
  else if (/\bunicorn|единорог/i.test(prompt)) speciesType = 'unicorn';
  else if (/\bcat\b|kitten|кошк|котён/i.test(prompt)) speciesType = 'cat';
  else if (/\bdog\b|puppy|wolf|fox|собак|щенок|волк|лис/i.test(prompt)) speciesType = 'dog';

  let skeletonType: PetSkeletonType = 'quadruped';
  if (isRobot) skeletonType = /\b(drone|hover|flying|летающ|дрон)/i.test(prompt) ? 'mechanical_biped' : 'mechanical_biped';
  else if (isAquatic) skeletonType = 'aquatic';
  else if (isDragon || (isQuadruped && flyingHint)) skeletonType = 'winged_quadruped';
  else if (/\b(snake|serpent|hydra|змей|гидр)/i.test(prompt)) skeletonType = 'serpentine';
  else if (isBird && !isQuadruped) skeletonType = 'biped';
  else if (isQuadruped) skeletonType = 'quadruped';
  else if (/\b(humanoid|biped|двуног)/i.test(prompt)) skeletonType = 'biped';

  let rarity: PetRarity = 'Rare';
  for (const hint of PET_RARITY_HINTS) {
    if (hint.re.test(prompt)) { rarity = hint.tier; break; }
  }
  let element: PetElement = 'Neutral';
  for (const hint of PET_ELEMENT_HINTS) {
    if (hint.re.test(prompt)) { element = hint.element; break; }
  }

  const baseName = prompt.replace(/[^A-Za-zА-Яа-я0-9\s]/g, '').trim().split(/\s+/).slice(0, 3).join(' ') || 'Companion';

  const stage1Prompt = `tiny baby ${speciesType} pet, hatchling form, small and cute, friendly, ${element !== 'Neutral' ? element.toLowerCase() + ' theme, ' : ''}stylized Roblox-friendly 3D model, single creature, no human, no background, neutral pose`;
  const stage2Prompt = `${prompt}, adult form, ${element !== 'Neutral' ? element.toLowerCase() + ' element, ' : ''}stylized Roblox-friendly 3D pet model, single creature, no human, no background, neutral pose`;
  const stage3Prompt = `${prompt}, legendary mythical form, glowing aura, larger and majestic, ${element !== 'Neutral' ? 'powerful ' + element.toLowerCase() + ' aura, ' : ''}stylized Roblox-friendly 3D pet model, single creature, no human, no background, neutral pose`;

  return {
    speciesType,
    skeletonType,
    rarity,
    element,
    isFlying: flyingHint,
    baseName,
    evolutionArc: {
      stage1: { prompt: stage1Prompt, visualNotes: 'baby/hatchling form, small and cute' },
      stage2: { prompt: stage2Prompt, visualNotes: 'adult form, original prompt' },
      stage3: { prompt: stage3Prompt, visualNotes: `legendary form with ${element.toLowerCase()} aura` },
    },
    // sentinel — never read, just satisfies the spread below
  } as PetClassification;
}

/**
 * Track 3 Phase 2 — Parse JSON returned by an LLM. Handles common malformations
 * we've seen across Anthropic/Gemini/OpenAI in this codebase:
 *   • markdown code-fence wrapping (```json ... ```)
 *   • trailing commas before } or ]
 *   • smart/curly quotes from LLM auto-formatting
 *   • stray prose before/after the JSON object
 *
 * Returns null when even the lenient pass fails (caller decides on retry or
 * fallback). The function never throws.
 */
export function parseLooseJSON(text: string): unknown | null {
  if (!text || typeof text !== 'string') return null;
  // Strip code-fence and surrounding whitespace.
  let cleaned = text
    .trim()
    .replace(/^```(?:json|JSON)?\s*\n?/, '')
    .replace(/\n?```\s*$/, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  cleaned = cleaned.slice(start, end + 1);
  // First try as-is.
  try { return JSON.parse(cleaned); } catch { /* fall through to repair */ }
  // Repair pass: convert smart quotes, then strip trailing commas.
  const repaired = cleaned
    .replace(/[“”″]/g, '"')
    .replace(/[‘’′]/g, "'")
    .replace(/,(\s*[}\]])/g, '$1');
  try { return JSON.parse(repaired); } catch { return null; }
}

/**
 * Classify a Pet prompt into species/skeleton/rarity/element + a 3-stage
 * evolution arc. Uses LLM (Anthropic structured output) when possible,
 * falls back to deterministic regex when LLM is unavailable / non-JSON.
 *
 * Touched on every pet_3d job (cheap LLM call, < 1s) so degrade quietly.
 */
export async function classifyPet(
  prompt: string,
  requestedSpecies?: string,
): Promise<PetClassification> {
  const regexFallback = classifyPetByRegex(prompt, requestedSpecies);

  const systemPrompt = [
    'You classify Roblox pet prompts into a structured JSON for a 3D-asset pipeline.',
    'Output ONLY a valid JSON object matching the requested schema. No prose.',
  ].join(' ');

  const userPrompt = [
    `Pet prompt: "${prompt}"`,
    requestedSpecies ? `Hint: user picked species "${requestedSpecies}".` : '',
    'Return JSON with keys:',
    '  speciesType: one of ["dog","cat","dragon","unicorn","robot","fantasy"]',
    '  skeletonType: one of ["biped","mechanical_biped","quadruped","winged_quadruped","serpentine","aquatic"]',
    '  rarity: one of ["Common","Uncommon","Rare","Epic","Legendary","Mythic"]',
    '  element: one of ["Fire","Ice","Shadow","Light","Nature","Tech","Neutral"]',
    '  isFlying: boolean (true if it flies/hovers)',
    '  baseName: short 1-3 word name in PascalCase',
    '  evolutionArc: { stage1: {prompt,visualNotes}, stage2: {prompt,visualNotes}, stage3: {prompt,visualNotes} }',
    'Each evolutionArc.stageN.prompt must be a self-contained image-generation prompt for that stage',
    '(stage1 = baby/hatchling, stage2 = adult/original form, stage3 = legendary/mythical form).',
    'Each prompt MUST include "single creature, no human, no background, neutral pose" so Meshy/Tripo do not insert a person.',
  ].filter(Boolean).join('\n');

  try {
    const result = await runChatProvider('anthropic', `${systemPrompt}\n\n${userPrompt}`, undefined, { timeoutMs: 20000 });
    const text = result.text?.trim() ?? '';
    const parsed = parseLooseJSON(text) as Partial<PetClassification> | null;
    if (!parsed) throw new Error('classifyPet: no parseable JSON object in LLM response');
    if (!parsed.speciesType || !parsed.skeletonType || !parsed.rarity || !parsed.element || !parsed.evolutionArc) {
      throw new Error('classifyPet: LLM response missing required fields');
    }
    logger.info('classifyPet: LLM classification', {
      speciesType: parsed.speciesType,
      skeletonType: parsed.skeletonType,
      rarity: parsed.rarity,
      element: parsed.element,
      isFlying: parsed.isFlying,
    });
    return {
      speciesType: parsed.speciesType,
      skeletonType: parsed.skeletonType,
      rarity: parsed.rarity,
      element: parsed.element,
      isFlying: !!parsed.isFlying,
      baseName: parsed.baseName ?? regexFallback.baseName,
      evolutionArc: parsed.evolutionArc as PetClassification['evolutionArc'],
    };
  } catch (err) {
    logger.warn('classifyPet: LLM failed, using regex fallback', { error: (err as Error).message });
    return regexFallback;
  }
}

export interface PetProviderRouting {
  mesh: 'meshy' | 'tripo';
  rig: 'meshy' | 'tripo' | 'procedural';
}

// ---------------------------------------------------------------------------
// Track 3 Phase 2 (Blocky Pet) — LLM generates a JSON spec for a primitive-
// Part pet (no external mesh provider). Fast (~3s), cheap (~$0.01-0.05).
// ---------------------------------------------------------------------------

/**
 * Validate a parsed BlockyPetSpec and report any structural problems. Returns
 * { valid, fixed, warnings, critical }. We do light auto-repair (enforce min
 * size, ensure HumanoidRootPart Root joint exists, exactly one primary_part)
 * so a borderline LLM output still ships rather than failing the pet job.
 */
export function validateBlockyPetSpec(raw: unknown): {
  valid: boolean;
  fixed: BlockyPetSpec;
  warnings: string[];
  critical: boolean;
} {
  const warnings: string[] = [];
  const obj = (raw && typeof raw === 'object') ? raw as Partial<BlockyPetSpec> : ({} as Partial<BlockyPetSpec>);

  const name = typeof obj.name === 'string' && obj.name.trim().length > 0 ? obj.name.trim() : 'BlockyPet';
  const rig: BlockyPetSpec['rig'] = ['Biped','Quadruped','Winged','Serpentine','Aquatic'].includes(obj.rig as string)
    ? obj.rig as BlockyPetSpec['rig']
    : 'Quadruped';
  const colors = (obj.colors && typeof obj.colors === 'object') ? obj.colors as BlockyPetSpec['colors'] : {} as BlockyPetSpec['colors'];
  if (!colors.primary) { colors.primary = 'Medium stone grey'; warnings.push('colors.primary missing — default Medium stone grey'); }
  const material: BlockyPetSpec['material'] = ['SmoothPlastic','Plastic','Neon','Wood','Fabric','Metal','ForceField'].includes(obj.material as string)
    ? obj.material as BlockyPetSpec['material']
    : 'SmoothPlastic';
  const height = typeof obj.height === 'number' && obj.height > 0 ? Math.min(Math.max(obj.height, 1.5), 8) : 3;

  let parts: BlockyPetSpec['parts'] = Array.isArray(obj.parts) ? obj.parts as BlockyPetSpec['parts'] : [];
  parts = parts
    .filter((p) => p && typeof p.name === 'string' && Array.isArray(p.size) && Array.isArray(p.position))
    .map((p) => {
      const size: [number, number, number] = [
        Math.max(0.15, Number(p.size[0]) || 0.15),
        Math.max(0.15, Number(p.size[1]) || 0.15),
        Math.max(0.15, Number(p.size[2]) || 0.15),
      ];
      // Structural roles need a 0.30 minimum to avoid invisible-wire look.
      const isStructural = ['primary_part','head','tail','leg_front_left','leg_front_right','leg_back_left','leg_back_right','wing_left','wing_right'].includes(p.role as string);
      if (isStructural) {
        size[0] = Math.max(size[0], 0.30);
        size[2] = Math.max(size[2], 0.30);
      }
      const shape: BlockyPetSpec['parts'][number]['shape'] = ['Ball','Cylinder','Block','Wedge','CornerWedge'].includes(p.shape as string)
        ? p.shape as BlockyPetSpec['parts'][number]['shape']
        : 'Block';
      return {
        name: p.name,
        shape,
        size,
        position: [Number(p.position[0]) || 0, Number(p.position[1]) || 0, Number(p.position[2]) || 0],
        rotation: Array.isArray(p.rotation) && p.rotation.length === 3
          ? [Number(p.rotation[0]) || 0, Number(p.rotation[1]) || 0, Number(p.rotation[2]) || 0]
          : undefined,
        color: typeof p.color === 'string' && p.color.length > 0 ? p.color : 'primary',
        material: typeof p.material === 'string' ? p.material : undefined,
        role: p.role ?? 'detail',
      };
    });

  if (parts.length < 4) warnings.push(`Only ${parts.length} parts — pet may look incomplete (recommend 10-18)`);
  if (parts.length > 24) warnings.push(`${parts.length} parts — pruning to top 24 by name order`);
  parts = parts.slice(0, 24);

  // Ensure exactly one primary_part.
  const primaries = parts.filter((p) => p.role === 'primary_part');
  if (primaries.length === 0 && parts.length > 0) {
    parts[0].role = 'primary_part';
    warnings.push(`No primary_part role — promoted "${parts[0].name}" to PrimaryPart`);
  } else if (primaries.length > 1) {
    primaries.slice(1).forEach((p) => { p.role = 'detail'; });
    warnings.push(`${primaries.length} primary_part roles — kept the first, demoted others to detail`);
  }

  const partNames = new Set(parts.map((p) => p.name));

  let joints: BlockyPetSpec['joints'] = Array.isArray(obj.joints) ? obj.joints as BlockyPetSpec['joints'] : [];
  joints = joints.filter((j) => j && typeof j.name === 'string' && typeof j.part0 === 'string' && typeof j.part1 === 'string'
    && (j.part0 === 'HumanoidRootPart' || partNames.has(j.part0))
    && partNames.has(j.part1));

  const primaryName = parts.find((p) => p.role === 'primary_part')?.name ?? parts[0]?.name ?? 'Body';
  if (!joints.some((j) => j.part0 === 'HumanoidRootPart')) {
    joints.unshift({ name: 'Root', part0: 'HumanoidRootPart', part1: primaryName });
    warnings.push(`Added missing Root Motor6D: HumanoidRootPart → ${primaryName}`);
  }

  let decals: BlockyPetSpec['decals'] = Array.isArray(obj.decals) ? obj.decals as BlockyPetSpec['decals'] : [];
  decals = (decals ?? []).filter((d) => d && typeof d.part === 'string' && typeof d.face === 'string' && typeof d.imagePrompt === 'string'
    && partNames.has(d.part)).slice(0, 6);

  const critical = parts.length === 0 || joints.length === 0;

  return {
    valid: !critical,
    fixed: { name, rig, colors, material, height, parts, joints, decals },
    warnings,
    critical,
  };
}

/**
 * Generate a Blocky Pet spec via LLM (Anthropic Sonnet → Gemini → OpenAI
 * fallback). Validates + auto-fixes the output. On critical failure (no
 * parts, malformed JSON) the caller can either retry once or fall through
 * to a hand-coded fallback spec.
 */
export async function generateBlockyPetSpec(args: {
  prompt: string;
  classification: PetClassification;
}): Promise<BlockyPetSpec> {
  const { prompt, classification } = args;
  const { generateBlockyPetSpec: schemaPrompt } = await import('./promptCatalog.js').then((m) => m.PROMPT_CATALOG);
  const userPrompt = [
    `User wants this pet: "${prompt}"`,
    `Pre-classified as:`,
    `  speciesType: ${classification.speciesType}`,
    `  skeletonType: ${classification.skeletonType}`,
    `  element: ${classification.element}`,
    `  rarity: ${classification.rarity}`,
    `  isFlying: ${classification.isFlying}`,
    `  baseName: ${classification.baseName}`,
    '',
    `Choose rig family matching skeletonType:`,
    `  biped / mechanical_biped → "Biped"`,
    `  quadruped → "Quadruped"`,
    `  winged_quadruped → "Winged"`,
    `  serpentine → "Serpentine"`,
    `  aquatic → "Aquatic"`,
    '',
    `Apply colour palette appropriate to element="${classification.element}".`,
    `Use baseName="${classification.baseName}" as the name field.`,
    `Output ONLY the JSON object — no markdown fence, no prose.`,
  ].join('\n');

  const systemAndUser = `${schemaPrompt}\n\n${userPrompt}`;

  const attempt = async (): Promise<unknown> => {
    const result = await runChatProvider('anthropic', systemAndUser, undefined, { timeoutMs: 30000 });
    const text = result.text?.trim() ?? '';
    const parsed = parseLooseJSON(text);
    if (!parsed) throw new Error('Blocky spec response had no parseable JSON object');
    return parsed;
  };

  try {
    const raw = await attempt();
    const v = validateBlockyPetSpec(raw);
    if (v.warnings.length > 0) logger.info('Blocky spec validation auto-fixed', { warnings: v.warnings });
    if (v.critical) throw new Error('Blocky spec validation: critical issues');
    return v.fixed;
  } catch (err) {
    logger.warn('generateBlockyPetSpec primary attempt failed, retrying with stricter retry hint', { error: (err as Error).message });
    try {
      const retryResult = await runChatProvider('anthropic', `${systemAndUser}\n\nPREVIOUS ATTEMPT WAS INVALID. Emit ONLY the JSON object, no text before or after, no markdown code fences. MUST include parts[] (10-18 entries) AND joints[] (at least Root joint to HumanoidRootPart). Exactly ONE part has role="primary_part". Use straight double quotes (") for all strings. No trailing commas.`, undefined, { timeoutMs: 30000 });
      const text = retryResult.text?.trim() ?? '';
      const parsed = parseLooseJSON(text);
      if (parsed) {
        const v = validateBlockyPetSpec(parsed);
        if (!v.critical) return v.fixed;
      }
    } catch (retryErr) {
      logger.warn('Blocky spec retry also failed, falling back to hand-coded template', { error: (retryErr as Error).message });
    }
    return fallbackBlockyPetSpec(classification);
  }
}

/**
 * Deterministic hand-coded blocky pet for when LLM generation fails. Mirrors
 * the FluffyFox example in the prompt — a quadruped with body/head/legs/tail.
 * Adjusts colours from the classification's element so the fallback at least
 * matches the requested vibe.
 */
function fallbackBlockyPetSpec(classification: PetClassification): BlockyPetSpec {
  const elementPalette: Record<PetElement, BlockyPetSpec['colors']> = {
    Fire:    { primary: 'Bright orange', secondary: 'Bright yellow', accent: 'Really black', eye: 'Really black' },
    Ice:     { primary: 'Light blue',    secondary: 'White',          accent: 'Royal purple', eye: 'Really black' },
    Shadow:  { primary: 'Really black',  secondary: 'Dark stone grey', accent: 'Royal purple', eye: 'Bright red'   },
    Light:   { primary: 'White',         secondary: 'Cool yellow',    accent: 'Bright yellow', eye: 'Really black' },
    Nature:  { primary: 'Bright green',  secondary: 'Reddish brown',  accent: 'Br. yellowish green', eye: 'Really black' },
    Tech:    { primary: 'Medium stone grey', secondary: 'Cyan',       accent: 'Really black', eye: 'Bright red'    },
    Neutral: { primary: 'Medium stone grey', secondary: 'White',      accent: 'Really black', eye: 'Really black'  },
  };
  const colors = elementPalette[classification.element];
  const material: BlockyPetSpec['material'] =
    classification.element === 'Fire' || classification.element === 'Light' ? 'Neon' : 'SmoothPlastic';
  const baseName = classification.baseName || 'Companion';
  const rig: BlockyPetSpec['rig'] =
    classification.skeletonType === 'biped' || classification.skeletonType === 'mechanical_biped' ? 'Biped'
    : classification.skeletonType === 'serpentine' ? 'Serpentine'
    : classification.skeletonType === 'aquatic' ? 'Aquatic'
    : classification.skeletonType === 'winged_quadruped' ? 'Winged'
    : 'Quadruped';

  const isDragon = classification.speciesType === 'dragon' || rig === 'Winged';
  const hasWings = rig === 'Winged' || classification.isFlying;

  const parts: BlockyPetSpec['parts'] = [];
  const joints: BlockyPetSpec['joints'] = [];

  if (isDragon) {
    // Dragon silhouette: bigger body, distinct neck, elongated muzzle, big
    // horns, 5 dorsal spikes, 2-segment tail, large wings, claw accents.
    // ~21 parts — within the 24-part validator cap.
    parts.push(
      { name: 'Body',     shape: 'Block', size: [2.0, 1.3, 3.0], position: [0, 1.05, 0],     color: 'primary',   role: 'primary_part' },
      { name: 'Neck',     shape: 'Block', size: [0.9, 1.1, 0.9], position: [0, 1.45, -1.7],  rotation: [-15, 0, 0], color: 'primary',   role: 'detail' },
      { name: 'Head',     shape: 'Block', size: [1.4, 1.0, 1.6], position: [0, 2.05, -2.3],  color: 'primary',   role: 'head' },
      { name: 'Snout',    shape: 'Block', size: [1.0, 0.6, 1.3], position: [0, 1.85, -3.25], color: 'primary',   role: 'snout' },
      { name: 'Jaw',      shape: 'Block', size: [0.85, 0.35, 1.0], position: [0, 1.55, -3.10], color: 'secondary', role: 'detail' },
      { name: 'Nose',     shape: 'Ball',  size: [0.32, 0.32, 0.32], position: [0, 1.95, -3.85], color: 'accent', role: 'nose' },
      { name: 'EyeL',     shape: 'Ball',  size: [0.30, 0.30, 0.30], position: [-0.45, 2.35, -2.85], color: 'eye', role: 'eye' },
      { name: 'EyeR',     shape: 'Ball',  size: [0.30, 0.30, 0.30], position: [0.45, 2.35, -2.85],  color: 'eye', role: 'eye' },
      { name: 'HornL',    shape: 'Wedge', size: [0.40, 1.2, 0.40], position: [-0.45, 2.95, -2.10], rotation: [-25, 0, -10], color: 'accent', role: 'horn' },
      { name: 'HornR',    shape: 'Wedge', size: [0.40, 1.2, 0.40], position: [0.45, 2.95, -2.10],  rotation: [-25, 0,  10], color: 'accent', role: 'horn' },
      { name: 'Spike1',   shape: 'Wedge', size: [0.30, 0.55, 0.55], position: [0, 1.95, -0.9], color: 'accent', role: 'spike' },
      { name: 'Spike2',   shape: 'Wedge', size: [0.30, 0.65, 0.55], position: [0, 2.00, -0.3], color: 'accent', role: 'spike' },
      { name: 'Spike3',   shape: 'Wedge', size: [0.30, 0.70, 0.55], position: [0, 2.00, 0.3], color: 'accent', role: 'spike' },
      { name: 'Spike4',   shape: 'Wedge', size: [0.30, 0.65, 0.55], position: [0, 1.95, 0.9], color: 'accent', role: 'spike' },
      { name: 'Spike5',   shape: 'Wedge', size: [0.30, 0.55, 0.55], position: [0, 1.85, 1.5], color: 'accent', role: 'spike' },
      { name: 'Tail',     shape: 'Block', size: [0.55, 0.55, 2.0], position: [0, 1.45, 2.50], rotation: [20, 0, 0], color: 'primary', role: 'tail' },
      { name: 'TailTip',  shape: 'Wedge', size: [0.50, 0.80, 0.80], position: [0, 1.95, 3.70], rotation: [50, 0, 0], color: 'accent', role: 'spike' },
      { name: 'LegFL',    shape: 'Block', size: [0.45, 1.0, 0.45], position: [-0.65, 0.50, -1.1], color: 'primary', role: 'leg_front_left' },
      { name: 'LegFR',    shape: 'Block', size: [0.45, 1.0, 0.45], position: [0.65, 0.50, -1.1],  color: 'primary', role: 'leg_front_right' },
      { name: 'LegBL',    shape: 'Block', size: [0.45, 1.0, 0.45], position: [-0.65, 0.50, 1.0],  color: 'primary', role: 'leg_back_left' },
      { name: 'LegBR',    shape: 'Block', size: [0.45, 1.0, 0.45], position: [0.65, 0.50, 1.0],   color: 'primary', role: 'leg_back_right' },
    );
    joints.push(
      { name: 'Root',              part0: 'HumanoidRootPart', part1: 'Body' },
      { name: 'NeckBase',          part0: 'Body', part1: 'Neck' },
      { name: 'Neck',              part0: 'Neck', part1: 'Head' },
      { name: 'SnoutJoint',        part0: 'Head', part1: 'Snout' },
      { name: 'JawJoint',          part0: 'Snout', part1: 'Jaw' },
      { name: 'NoseJoint',         part0: 'Snout', part1: 'Nose' },
      { name: 'LeftEyeJoint',      part0: 'Head', part1: 'EyeL' },
      { name: 'RightEyeJoint',     part0: 'Head', part1: 'EyeR' },
      { name: 'LeftHornJoint',     part0: 'Head', part1: 'HornL' },
      { name: 'RightHornJoint',    part0: 'Head', part1: 'HornR' },
      { name: 'Spike1Joint',       part0: 'Body', part1: 'Spike1' },
      { name: 'Spike2Joint',       part0: 'Body', part1: 'Spike2' },
      { name: 'Spike3Joint',       part0: 'Body', part1: 'Spike3' },
      { name: 'Spike4Joint',       part0: 'Body', part1: 'Spike4' },
      { name: 'Spike5Joint',       part0: 'Body', part1: 'Spike5' },
      { name: 'TailJoint',         part0: 'Body', part1: 'Tail' },
      { name: 'TailTipJoint',      part0: 'Tail', part1: 'TailTip' },
      { name: 'LeftFrontLegJoint', part0: 'Body', part1: 'LegFL' },
      { name: 'RightFrontLegJoint',part0: 'Body', part1: 'LegFR' },
      { name: 'LeftBackLegJoint',  part0: 'Body', part1: 'LegBL' },
      { name: 'RightBackLegJoint', part0: 'Body', part1: 'LegBR' },
    );
  } else {
    // Generic quadruped body for dog/cat/fox/wolf etc.
    parts.push(
      { name: 'Body',  shape: 'Block', size: [1.8, 1.3, 2.6], position: [0, 1.1, 0],     color: 'primary',   role: 'primary_part' },
      { name: 'Head',  shape: 'Block', size: [1.2, 1.1, 1.3], position: [0, 1.6, -1.7],  color: 'primary',   role: 'head' },
      { name: 'Snout', shape: 'Block', size: [0.7, 0.5, 0.7], position: [0, 1.45, -2.3], color: 'secondary', role: 'snout' },
      { name: 'Nose',  shape: 'Ball',  size: [0.25, 0.25, 0.25], position: [0, 1.55, -2.55], color: 'accent', role: 'nose' },
      { name: 'EyeL',  shape: 'Ball',  size: [0.22, 0.22, 0.22], position: [-0.30, 1.80, -2.15], color: 'eye', role: 'eye' },
      { name: 'EyeR',  shape: 'Ball',  size: [0.22, 0.22, 0.22], position: [0.30, 1.80, -2.15], color: 'eye', role: 'eye' },
      { name: 'Tail',  shape: 'Cylinder', size: [0.4, 1.6, 0.4], position: [0, 1.4, 1.8], rotation: [35,0,0], color: 'primary', role: 'tail' },
      { name: 'LegFL', shape: 'Cylinder', size: [0.35, 1.0, 0.35], position: [-0.55, 0.50, -1.0], color: 'primary', role: 'leg_front_left' },
      { name: 'LegFR', shape: 'Cylinder', size: [0.35, 1.0, 0.35], position: [0.55, 0.50, -1.0],  color: 'primary', role: 'leg_front_right' },
      { name: 'LegBL', shape: 'Cylinder', size: [0.35, 1.0, 0.35], position: [-0.55, 0.50, 0.9],  color: 'primary', role: 'leg_back_left' },
      { name: 'LegBR', shape: 'Cylinder', size: [0.35, 1.0, 0.35], position: [0.55, 0.50, 0.9],   color: 'primary', role: 'leg_back_right' },
    );
    joints.push(
      { name: 'Root', part0: 'HumanoidRootPart', part1: 'Body' },
      { name: 'Neck', part0: 'Body', part1: 'Head' },
      { name: 'SnoutJoint', part0: 'Head', part1: 'Snout' },
      { name: 'NoseJoint',  part0: 'Snout', part1: 'Nose' },
      { name: 'LeftEyeJoint',  part0: 'Head', part1: 'EyeL' },
      { name: 'RightEyeJoint', part0: 'Head', part1: 'EyeR' },
      { name: 'TailJoint', part0: 'Body', part1: 'Tail' },
      { name: 'LeftFrontLegJoint',  part0: 'Body', part1: 'LegFL' },
      { name: 'RightFrontLegJoint', part0: 'Body', part1: 'LegFR' },
      { name: 'LeftBackLegJoint',   part0: 'Body', part1: 'LegBL' },
      { name: 'RightBackLegJoint',  part0: 'Body', part1: 'LegBR' },
    );
  }

  if (!isDragon) {
    // Non-dragon quadrupeds get floppy ears (visually communicates dog/cat/fox).
    parts.push(
      { name: 'EarL', shape: 'Wedge', size: [0.45, 0.7, 0.45], position: [-0.40, 2.25, -1.45], rotation: [0, 0, -12], color: 'primary', role: 'ear' },
      { name: 'EarR', shape: 'Wedge', size: [0.45, 0.7, 0.45], position: [0.40, 2.25, -1.45],  rotation: [0, 0,  12], color: 'primary', role: 'ear' },
    );
    joints.push(
      { name: 'LeftEarJoint',  part0: 'Head', part1: 'EarL' },
      { name: 'RightEarJoint', part0: 'Head', part1: 'EarR' },
    );
  }

  // Wings — for winged_quadruped OR explicitly flying pets. Bigger for
  // dragons (DRAGON_WING_SCALE 1.4×) so they read as dramatic membrane wings
  // rather than tiny flaps. Position slightly higher + further back to look
  // like they sprout from shoulder blades, not from the back of the neck.
  if (hasWings) {
    const wingW = isDragon ? 2.4 : 1.6;
    const wingD = isDragon ? 2.0 : 1.4;
    const wingY = isDragon ? 2.3 : 2.0;
    const wingZ = isDragon ? -0.4 : 0.4;
    const wingX = isDragon ? 1.4 : 1.10;
    parts.push(
      { name: 'WingL', shape: 'Wedge', size: [wingW, 0.22, wingD], position: [-wingX, wingY, wingZ], rotation: [-15, 25, -35], color: 'accent', role: 'wing_left' },
      { name: 'WingR', shape: 'Wedge', size: [wingW, 0.22, wingD], position: [wingX, wingY, wingZ],  rotation: [-15, -25,  35], color: 'accent', role: 'wing_right' },
    );
    joints.push(
      { name: 'LeftWingJoint',  part0: 'Body', part1: 'WingL' },
      { name: 'RightWingJoint', part0: 'Body', part1: 'WingR' },
    );
  }

  return {
    name: baseName,
    rig,
    colors,
    material,
    height: hasWings ? 3.2 : 2.8,
    parts,
    joints,
    decals: [],
  };
}

/**
 * Generate Motor6D keyframe animations for a blocky pet. Reuses the existing
 * generation provider but with a different prompt. Returns the raw keyframes
 * JSON which gets passed downstream to buildAnimationBinary for Lune.
 */
export async function generateBlockyPetAnimations(args: {
  spec: BlockyPetSpec;
  isFlying: boolean;
}): Promise<Record<string, unknown>> {
  const { spec, isFlying } = args;
  const { generateBlockyPetAnimation: animPrompt } = await import('./promptCatalog.js').then((m) => m.PROMPT_CATALOG);
  const jointList = spec.joints.map((j) => j.name).join(', ');

  const userPrompt = [
    `Pet rig: ${spec.rig}`,
    `Available Motor6D joints: ${jointList}`,
    `isFlying: ${isFlying}`,
    '',
    `Generate Idle + ${spec.rig === 'Aquatic' ? 'AquaticMarch' : spec.rig === 'Serpentine' ? 'SerpentineMarch' : 'Walk'} tracks.`,
    isFlying ? 'ALSO generate a Fly track using wing joints if present.' : '',
    `Output ONLY the JSON object — no markdown fence, no prose.`,
  ].filter(Boolean).join('\n');

  try {
    const result = await runChatProvider('anthropic', `${animPrompt}\n\n${userPrompt}`, undefined, { timeoutMs: 30000 });
    const text = result.text?.trim() ?? '';
    const parsed = parseLooseJSON(text);
    if (!parsed) throw new Error('Blocky anim response had no parseable JSON object');
    return parsed as Record<string, unknown>;
  } catch (err) {
    logger.warn('generateBlockyPetAnimations failed, returning empty tracks', { error: (err as Error).message });
    return { name: 'Pet animations', rig: 'Motor6D', tracks: [] };
  }
}

/**
 * Decide which mesh + rig provider to use per skeleton type. Meshy v6 Rigging
 * API only supports bipedal humanoid; everything else routes to Tripo.
 */
export function selectMeshProvider(skeletonType: PetSkeletonType): PetProviderRouting {
  switch (skeletonType) {
    case 'biped':
    case 'mechanical_biped':
      return { mesh: 'meshy', rig: 'meshy' };
    case 'quadruped':
    case 'winged_quadruped':
    case 'serpentine':
    case 'aquatic':
    default:
      return { mesh: 'tripo', rig: 'tripo' };
  }
}

export function buildConceptImagePrompt(rawPrompt: string, input: Record<string, unknown>): string {
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const genre = typeof input.genre === 'string' ? input.genre.trim() : '';
  const style = typeof input.style === 'string' ? input.style.trim() : '';
  const contentCategory = typeof input.contentCategory === 'string' ? input.contentCategory : '';
  const contentSubcategory = typeof input.contentSubcategory === 'string' ? input.contentSubcategory : '';
  // NPC categories must count as character so the prompt never degrades into a clothing-only
  // / no-mannequin description (caused empty-suit Sigma Chad concept images).
  const isNpcContent = contentCategory === 'npc_ai'
    || contentCategory === 'npc'
    || contentSubcategory === 'roast_npc'
    || contentSubcategory === 'npcs'
    || contentSubcategory === 'npc';
  const isCharacterContent = isNpcContent
    || contentSubcategory === 'characters'
    || contentCategory === 'character';
  const isWeaponItem = contentCategory === 'weapon';
  const isItemTool = contentCategory === 'item_tool';
  const isFurnitureProp = contentCategory === 'furniture_prop' || contentCategory === 'prop';
  const isVehicleItem = contentCategory === 'vehicle'
    || contentSubcategory === 'vehicles'
    || input.requestedKind === 'vehicle_3d';
  const isClothingItem = !isWeaponItem && !isItemTool && !isFurnitureProp && !isCharacterContent && !isVehicleItem && (['ugc_clothing', 'ugc_accessory'].includes(contentCategory)
    || CLOTHING_KEYWORDS.test(rawPrompt)
    || CLOTHING_KEYWORDS.test(title));
  const styleHint = isWeaponItem
    ? WEAPON_STYLE_HINT
    : isItemTool
      ? ITEM_STYLE_HINT
      : isFurnitureProp
        ? FURNITURE_STYLE_HINT
        : isClothingItem
          ? CLOTHING_STYLE_HINT
          : isNpcContent
            ? NPC_CONCEPT_IMAGE_STYLE_HINT
            : CONCEPT_IMAGE_STYLE_HINT;

  const conversationMatch = rawPrompt.match(/Full conversation context[^:]*:\s*([\s\S]+)/i);
  const chatContext = conversationMatch?.[1]?.trim() ?? '';

  const noisePattern = /^(генерируй!?|generate!?|go[!.]?|create\s+it[!.]?|всё\s+супер[!.]?|ok[!.]?|okay[!.]?|yes[!.]?|да[!.]?)$/i;

  const userLines = chatContext
    .split('\n')
    .filter((line) => /^User:/i.test(line.trim()))
    .map((line) => line.replace(/^User:\s*/i, '').trim())
    .filter((line) => line.length > 0 && !noisePattern.test(line));

  const intentMatch = rawPrompt.match(/Latest user intent[^:]*:\s*([\s\S]+)/i);
  const intentLines = (intentMatch?.[1]?.trim() ?? '')
    .split('\n')
    .map((line) => line.replace(/^-\s*/, '').trim())
    .filter((line) => line.length > 0 && !noisePattern.test(line));

  const combinedUserLines = [...userLines, ...intentLines];
  const userDescription = combinedUserLines.join('. ').slice(0, 300);
  const allText = `${rawPrompt} ${userDescription} ${title}`;

  // Force clothing description into character prompts to prevent bare skin generation.
  // AI image models follow positive descriptions better than negative prohibitions.
  // Items (item_tool) are standalone objects — do NOT add clothing enforcement (otherwise
  // the model draws a dressed character holding/wearing the item).
  const clothingEnforcement = (!isWeaponItem && !isItemTool && !isFurnitureProp && !isClothingItem)
    ? ' Wearing a fully closed long-sleeve outfit and long pants.'
    : '';

  // For furniture inject the user's picked colours + material into the 2D prompt
  // so the concept image actually reflects what they chose in the interview.
  const furnitureColorBits: string[] = [];
  if (isFurnitureProp) {
    const primaryColor = typeof input.primaryColor === 'string' ? input.primaryColor : '';
    const accentColor = typeof input.accentColor === 'string' ? input.accentColor : '';
    const material = typeof input.material === 'string' ? input.material : '';
    if (material) furnitureColorBits.push(`made of ${material}`);
    if (primaryColor) furnitureColorBits.push(`primary colour ${primaryColor}`);
    if (accentColor && accentColor !== primaryColor) furnitureColorBits.push(`accent colour ${accentColor}`);
  }
  const furnitureColorContext = furnitureColorBits.length > 0 ? ` ${furnitureColorBits.join(', ')}.` : '';
  const npcPremiumColorContext = isNpcContent
    ? ' NPC visual direction: make the character instantly readable and colorful in the 2D concept; avoid plain black/gray outfit blocks, gray backgrounds, and generic faceless mannequin styling. Add role-specific colored outfit panels, badges, stickers, trims, props, hair/hat accents, or glow details.'
    : '';

  if (title && title.toLowerCase() !== 'ugc project' && title.toLowerCase() !== 'content project') {
    const extras = userDescription.length > 10 ? ` ${userDescription}.` : '';
    return `${title}.${extras}${furnitureColorContext}${npcPremiumColorContext}${clothingEnforcement} ${styleHint}`;
  }

  if (userDescription && userDescription.length > 10) {
    return `${userDescription}.${npcPremiumColorContext}${clothingEnforcement} ${styleHint}`;
  }

  const cleaned = rawPrompt
    .replace(/Generate a real Roblox 3D.*?for /i, '')
    .replace(/\.?\s*Output a textured.*$/i, '')
    .replace(/Full conversation context[\s\S]*/i, '')
    .replace(/Latest user intent[\s\S]*/i, '')
    .replace(/Genre:.*$/i, '')
    .trim()
    .slice(0, 300);

  return `${cleaned || rawPrompt.slice(0, 300)}.${npcPremiumColorContext}${clothingEnforcement} ${styleHint}`;
}

// Pose: neutral resting pose with arms along the sides ("руки по швам"). Earlier we asked
// Meshy for A-pose, then T-pose, both produced visibly broken arms at runtime because R15
// catalog animations apply deltas relative to a different reference pose, so the mesh + bone
// offsets compound. A natural rest pose is closest to what R15 idle/walk animations expect
// to deform from, and matches what users see in 2D previews ("Sigma Chad standing normally").
const ROBLOX_3D_BASE =
  'Stylized low-poly 3D game character. Standing upright in a neutral resting pose: arms hanging straight down along the sides of the body, palms facing the thighs, legs straight and shoulder-width apart. ' +
  'Blocky chunky proportions similar to Roblox avatars. ' +
  'Character wears a fully closed long-sleeve outfit covering the whole body, long pants, and shoes. ' +
  'Simple clean geometry, under 10000 polygons. Bright flat-shaded colors, minimal texture detail. ' +
  'No realistic details or fine wrinkles. Solid color regions. ' +
  'Clean topology ready for rigging. Single mesh, game-ready asset.';

const ROBLOX_3D_CUTE_SUFFIX = ROBLOX_3D_BASE + ' ' +
  'Cute toy-like proportions with slightly oversized head and hands.';

const ROBLOX_3D_MUSCULAR_SUFFIX = ROBLOX_3D_BASE + ' ' +
  'Muscular powerful build with wide shoulders and thick limbs. ' +
  'Exaggerated heroic proportions: broad shoulders, strong arms hanging down at the sides. ' +
  'Aggressive confident expression. Character wears tight body armor or fully closed outfit covering the whole body, long pants, and heavy boots.';

function pick3DSuffix(text: string): string {
  const lower = text.toLowerCase();
  const muscularKeywords = [
    'hulk', 'muscular', 'strong', 'buff', 'brute', 'warrior', 'tank',
    'giant', 'ogre', 'golem', 'berserker', 'barbarian', 'titan', 'colossus',
    'angry', 'rage', 'fierce', 'tough', 'brawler', 'wrestler', 'champion',
    'mafia', 'boss', 'gangster', 'thug', 'bouncer', 'bodyguard', 'villain',
  ];
  if (muscularKeywords.some((kw) => lower.includes(kw))) {
    return ROBLOX_3D_MUSCULAR_SUFFIX;
  }
  return ROBLOX_3D_CUTE_SUFFIX;
}

const CLOTHING_3D_SUFFIX =
  'Single clothing garment as a 3D object. NO human body, NO mannequin, NO person wearing it. ' +
  'Just the garment itself, laid flat or floating. Clean simple mesh, game-ready asset, under 8000 polygons. ' +
  'Bright colors, clean topology.';

const WEAPON_3D_SUFFIX =
  'Single isolated game weapon, no character, no hands, no body. ' +
  'Low-poly stylized, clean geometry, bright colors, simple materials. ' +
  'Game-ready 3D weapon asset, under 10000 polygons. ' +
  // R5.8.5.6: enforce vertical orientation so runtime Model+Weld loader can rely
  // on Y being the longest axis for every weapon. Blade/barrel/staff points up (+Y);
  // hilt/grip at bottom (-Y). This keeps the mesh bounding box tallest along Y.
  'STRICT ORIENTATION: the weapon must stand vertically with its longest dimension ' +
  'along the Y axis (up). Blade/barrel/staff tip points straight up, hilt or grip ' +
  'at the bottom. Do not rotate or tilt the weapon on its side.';

// For hero decoration props (tycoon/obby landmarks). Kept short so the full
// prompt stays under the fal.ai Meshy 600-char limit.
const PROP_3D_SUFFIX =
  'Standalone 3D game prop, no character, no person, no background. ' +
  'Low-poly stylized, bright flat colors, clean topology, game-ready.';

const FURNITURE_3D_SUFFIX =
  'Single isolated Roblox furniture or decor prop, no character, no person, no room, no floor, no wall, no grouped set. ' +
  'Exactly one game-ready object such as one chair, one table, one lamp, one shelf, one rug, one plant, one sign, or one decor prop. ' +
  'Low-poly stylized, clean topology, bright flat colors, simple PBR materials, under 8000 polygons.';

// For Items & Tools (Release 2): keys, potions, coins, medkits, resources, etc.
// Handled as a Tool with Handle mesh — must be a standalone object, not worn/held by a character.
const ITEM_3D_SUFFIX =
  'Single standalone 3D game item/tool, no character, no person, no hands, no body, no background. ' +
  'Low-poly stylized pickup asset (key, potion bottle, coin, medkit, ore, flask, etc.), clean topology, bright flat colors, game-ready, under 8000 polygons.';

// Vehicles (Release 2): low-poly drivable vehicle body shell. The chassis,
// wheels, DriveSeat and controller are added procedurally by the backend
// AFTER the mesh — so the Meshy mesh must be JUST the body (no wheels, no
// driver, no environment). Aspect ratio is critical: cars/trucks are wider
// and longer than they are tall; planes are very long; helicopters have a
// boom; bikes have a frame with a fuel tank — let the brief drive the shape
// and keep the polycount low so the runtime stays smooth.
const VEHICLE_3D_SUFFIX =
  'Single isolated low-poly Roblox vehicle body shell, no character, no driver, no passenger, no rider, no person, no background, no ground, no scene. ' +
  'No wheels, no tires (wheels are added separately by the engine). ' +
  'Clean low-poly stylized look, simple PBR-ready materials, bright readable colors, game-ready, under 8000 polygons. ' +
  'Front-facing render, full vehicle body visible.';

export function build3DPrompt(rawPrompt: string, input: Record<string, unknown>): string {
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const genre = typeof input.genre === 'string' ? input.genre.trim() : '';
  const style = typeof input.style === 'string' ? input.style.trim() : '';
  const contentCategory = typeof input.contentCategory === 'string' ? input.contentCategory : '';
  const contentSubcategory = typeof input.contentSubcategory === 'string' ? input.contentSubcategory : '';
  // NPC categories must count as character (see runMeshy / buildConceptImagePrompt for the
  // same logic) so prompts don't degrade into clothing-only descriptions.
  const isNpcContent = contentCategory === 'npc_ai'
    || contentCategory === 'npc'
    || contentSubcategory === 'roast_npc'
    || contentSubcategory === 'npcs'
    || contentSubcategory === 'npc';
  const isCharacterContent = isNpcContent
    || contentSubcategory === 'characters'
    || contentCategory === 'character';
  const isWeaponItem = contentCategory === 'weapon';
  const isItemTool = contentCategory === 'item_tool';
  const isPropItem = contentCategory === 'furniture_prop' || contentCategory === 'prop';
  const isVehicleItem = contentCategory === 'vehicle'
    || contentSubcategory === 'vehicles'
    || input.requestedKind === 'vehicle_3d';
  const isClothingItem = !isWeaponItem && !isItemTool && !isPropItem && !isCharacterContent && !isVehicleItem && (['ugc_clothing', 'ugc_accessory'].includes(contentCategory)
    || CLOTHING_KEYWORDS.test(rawPrompt)
    || CLOTHING_KEYWORDS.test(title));

  const conversationMatch = rawPrompt.match(/Full conversation context[^:]*:\s*([\s\S]+)/i);
  const chatContext = conversationMatch?.[1]?.trim() ?? '';

  const userLines = chatContext
    .split('\n')
    .filter((line) => /^User:/i.test(line.trim()))
    .map((line) => line.replace(/^User:\s*/i, '').trim())
    .filter(Boolean);

  const intentMatch = rawPrompt.match(/Latest user intent[^:]*:\s*([\s\S]+)/i);
  const intentLines = (intentMatch?.[1]?.trim() ?? '')
    .split('\n')
    .map((line) => line.replace(/^-\s*/, '').trim())
    .filter(Boolean);

  const combinedUserLines = [...userLines, ...intentLines];
  const userDescription = combinedUserLines.join('. ').slice(0, 400);
  const allText = `${rawPrompt} ${userDescription} ${title}`;
  const suffix = isPropItem
    ? (contentCategory === 'furniture_prop' ? FURNITURE_3D_SUFFIX : PROP_3D_SUFFIX)
    : isItemTool
      ? ITEM_3D_SUFFIX
      : isWeaponItem
        ? WEAPON_3D_SUFFIX
        : isVehicleItem
          ? VEHICLE_3D_SUFFIX
          : isClothingItem
            ? CLOTHING_3D_SUFFIX
            : pick3DSuffix(allText);

  // Vehicles (Release 2): same fast/focused branch as Prop/Item — title-led
  // prompt + colour bits + vehicle suffix, no character-context heuristics.
  if (isVehicleItem) {
    const cleanedRaw = rawPrompt
      .replace(/Full conversation context[\s\S]*/i, '')
      .replace(/Latest user intent[\s\S]*/i, '')
      .replace(/Existing project context[\s\S]*/i, '')
      .trim()
      .slice(0, 320);
    const primaryColor = typeof input.primaryColor === 'string' ? input.primaryColor : '';
    const accentColor = typeof input.accentColor === 'string' ? input.accentColor : '';
    const colorBits: string[] = [];
    if (primaryColor) colorBits.push(`primary body color ${primaryColor}`);
    if (accentColor && accentColor !== primaryColor) colorBits.push(`accent / roof color ${accentColor}`);
    const colorContext = colorBits.length > 0 ? `. ${colorBits.join(', ')}` : '';
    const titleBit = title ? `${title}. ` : '';
    return `${titleBit}${cleanedRaw}${colorContext}. ${suffix}`;
  }

  // Prop items (hero tycoon/obby decorations) should stay short & focused.
  // Skip the character-context heuristics and return a clean prompt < 500 chars.
  if (isPropItem || isItemTool) {
    const cleanedRaw = rawPrompt
      .replace(/Full conversation context[\s\S]*/i, '')
      .replace(/Latest user intent[\s\S]*/i, '')
      .trim()
      .slice(0, 350);
    // Inject the user-picked colours and material from the interview GDD so
    // Meshy actually generates a coloured mesh instead of a generic chrome model.
    // Hex codes are understood by modern image/3D AI models as colour descriptors.
    const primaryColor = typeof input.primaryColor === 'string' ? input.primaryColor : '';
    const accentColor = typeof input.accentColor === 'string' ? input.accentColor : '';
    const material = typeof input.material === 'string' ? input.material : '';
    const colorBits: string[] = [];
    if (material) colorBits.push(`made of ${material}`);
    if (primaryColor) colorBits.push(`primary colour ${primaryColor}`);
    if (accentColor && accentColor !== primaryColor) colorBits.push(`accent colour ${accentColor}`);
    const colorContext = colorBits.length > 0 ? `. ${colorBits.join(', ')}` : '';
    return `${cleanedRaw}${colorContext}. ${suffix}`;
  }

  if (title && title.toLowerCase() !== 'ugc project' && title.toLowerCase() !== 'content project') {
    const extras = userDescription.length > 10 ? `. ${userDescription}` : '';
    const desc = [title, genre, style ? `${style} style` : ''].filter(Boolean).join(', ');
    return `${desc}${extras}. ${suffix}`;
  }

  if (userDescription && userDescription.length > 10) {
    return `${userDescription}. ${style ? `${style} style. ` : ''}${suffix}`;
  }

  const cleaned = rawPrompt
    .replace(/Generate a real Roblox 3D.*?for /i, '')
    .replace(/\.?\s*Output a textured.*$/i, '')
    .replace(/Full conversation context[\s\S]*/i, '')
    .replace(/Latest user intent[\s\S]*/i, '')
    .replace(/Genre:.*$/i, '')
    .trim()
    .slice(0, 400);

  return `${cleaned || rawPrompt.slice(0, 400)}. ${suffix}`;
}

async function pollFalRequest(
  apiKey: string,
  endpoint: string,
  requestId: string,
  statusUrl?: string,
  responseUrl?: string,
  maxAttempts = 120,
): Promise<JsonRecord> {
  const resolvedStatusUrl = statusUrl
    ?? `https://queue.fal.run/${endpoint}/requests/${requestId}/status`;
  const resolvedResponseUrl = responseUrl
    ?? `https://queue.fal.run/${endpoint}/requests/${requestId}`;

  let consecutiveErrors = 0;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 5000));

    try {
      const statusResp = await fetchJson(resolvedStatusUrl, {
        method: 'GET',
        headers: { Authorization: `Key ${apiKey}` },
      });

      consecutiveErrors = 0;
      const status = statusResp.status as string | undefined;
      logger.info('Fal 3D poll', { endpoint, requestId, status, attempt });

      if (status === 'COMPLETED') {
        try {
          return await fetchJson(resolvedResponseUrl, {
            method: 'GET',
            headers: { Authorization: `Key ${apiKey}` },
          });
        } catch (respErr) {
          // Response URL error is fatal — not a transient network error
          throw new Error(`Fal task completed but response fetch failed (${endpoint}): ${(respErr as Error).message}`);
        }
      }
      if (status === 'FAILED') {
        const errMsg = statusResp.error as string ?? JSON.stringify(statusResp);
        throw new Error(`Fal task failed (${endpoint}): ${errMsg}`);
      }
    } catch (pollErr) {
      const msg = (pollErr as Error).message ?? '';
      if (msg.startsWith('Fal task failed') || msg.startsWith('Fal task completed but')) throw pollErr;
      consecutiveErrors++;
      logger.warn('Fal poll network error, retrying', {
        attempt, consecutiveErrors, endpoint, requestId,
        error: (pollErr as Error).message ?? String(pollErr),
      });
      if (consecutiveErrors >= 5) {
        throw new Error(`Fal poll failed after ${consecutiveErrors} consecutive network errors (${endpoint}): ${requestId}`);
      }
    }
  }

  throw new Error(`Fal task did not complete after polling (${endpoint}): ${requestId}`);
}

/**
 * Generate side + back orbit views of a character from a front concept image,
 * to feed Meshy v6 multi-image-to-3d for higher-quality mesh output.
 *
 * Uses fal.ai Flux Pro Kontext (image-to-image edit with text prompt) — preserves
 * character identity (outfit, hair, accessories) from the input image while
 * rotating the camera. Each view costs ~$0.04 ⇒ +$0.08 per mesh.
 *
 * Returns whichever views succeeded; Meshy multi-image accepts 1-4 images so
 * partial success is acceptable. Never throws — failures degrade gracefully to
 * fewer-view input.
 */
async function generateOrbitViewsForMesh(
  frontImageUrl: string,
  characterTitle: string,
  apiKey: string,
): Promise<{ side?: string; back?: string }> {
  // Hint Flux Kontext to preserve identity: same character, same outfit, same
  // proportions — just rotate the camera. Without "same" language the model
  // tends to re-imagine the character from scratch which breaks Meshy's
  // multi-view consistency check.
  const titleHint = characterTitle.trim() ? ` Character: "${characterTitle.trim()}".` : '';
  const sidePrompt = `Same character viewed from the side, full body profile view, exact same outfit, hair, accessories, proportions, and colors as the front view. Neutral standing pose, arms hanging at sides. Plain neutral background.${titleHint}`;
  const backPrompt = `Same character viewed from the back, full body back view, exact same outfit, hair, accessories, proportions, and colors as the front view. Neutral standing pose, arms hanging at sides. Plain neutral background.${titleHint}`;

  const generateView = async (label: 'side' | 'back', viewPrompt: string): Promise<string | undefined> => {
    try {
      const submitResp = await fetchJson('https://queue.fal.run/fal-ai/flux-pro/kontext', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Key ${apiKey}` },
        body: JSON.stringify({
          prompt: viewPrompt,
          image_url: frontImageUrl,
          guidance_scale: 3.5,
          num_images: 1,
          output_format: 'png',
        }),
      });
      const requestId = submitResp.request_id as string | undefined;
      if (!requestId) {
        logger.warn(`[orbitView:${label}] Flux Kontext queue rejected`, {
          response: JSON.stringify(submitResp).slice(0, 200),
        });
        return undefined;
      }
      const statusUrl = submitResp.status_url as string | undefined;
      const responseUrl = submitResp.response_url as string | undefined;
      // Flux Kontext typically completes in 8-20s; allow up to ~60s via default poll cap.
      const raw = await pollFalRequest(apiKey, 'fal-ai/flux-pro/kontext', requestId, statusUrl, responseUrl);
      const images = Array.isArray(raw.images) ? raw.images as JsonRecord[] : [];
      const imageUrl = images[0]?.url as string | undefined;
      if (!imageUrl) {
        logger.warn(`[orbitView:${label}] Flux Kontext completed without image URL`, {
          rawKeys: Object.keys(raw).slice(0, 8),
        });
        return undefined;
      }
      logger.info(`[orbitView:${label}] generated`, { imageUrl: imageUrl.slice(0, 80) });
      return imageUrl;
    } catch (err) {
      logger.warn(`[orbitView:${label}] generation failed`, { error: (err as Error).message });
      return undefined;
    }
  };

  // Parallel — saves ~10-15s vs sequential.
  const [side, back] = await Promise.all([
    generateView('side', sidePrompt),
    generateView('back', backPrompt),
  ]);

  return { side, back };
}

/**
 * Session 001 (Track 2 Phase 2) — garment-only orbit views.
 * Unlike generateOrbitViewsForMesh which preserves character identity (outfit,
 * hair, accessories), this rotates around the GARMENT itself, explicitly
 * suppressing any human body / mannequin / hanger to keep Meshy v6 focused on
 * the wearable mesh. Studio's Accessory Fitting Tool will later wrap the mesh
 * with inner/outer cages — so the orbit views need to show clean garment
 * silhouette from all sides, not a clothed figure.
 */
async function generateGarmentOrbitViewsForMesh(
  frontImageUrl: string,
  garmentTitle: string,
  apiKey: string,
): Promise<{ side?: string; back?: string }> {
  const titleHint = garmentTitle.trim() ? ` Garment: "${garmentTitle.trim()}".` : '';
  const sharedSuffix = ' Just the garment, floating in empty space, plain white background. ABSOLUTELY NO human body, NO person, NO mannequin, NO hanger, NO stand, NO display rack. Exact same fabric, color, pattern, cut, stitching, trim, and details as the front view. Clean 3D render reference, bright colors.';
  const sidePrompt = `Same garment viewed from the side, side profile view of the wearable item.${sharedSuffix}${titleHint}`;
  const backPrompt = `Same garment viewed from the back, back view of the wearable item.${sharedSuffix}${titleHint}`;

  const generateView = async (label: 'side' | 'back', viewPrompt: string): Promise<string | undefined> => {
    try {
      const submitResp = await fetchJson('https://queue.fal.run/fal-ai/flux-pro/kontext', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Key ${apiKey}` },
        body: JSON.stringify({
          prompt: viewPrompt,
          image_url: frontImageUrl,
          guidance_scale: 3.5,
          num_images: 1,
          output_format: 'png',
        }),
      });
      const requestId = submitResp.request_id as string | undefined;
      if (!requestId) {
        logger.warn(`[garmentOrbit:${label}] Flux Kontext queue rejected`, {
          response: JSON.stringify(submitResp).slice(0, 200),
        });
        return undefined;
      }
      const statusUrl = submitResp.status_url as string | undefined;
      const responseUrl = submitResp.response_url as string | undefined;
      const raw = await pollFalRequest(apiKey, 'fal-ai/flux-pro/kontext', requestId, statusUrl, responseUrl);
      const images = Array.isArray(raw.images) ? raw.images as JsonRecord[] : [];
      const imageUrl = images[0]?.url as string | undefined;
      if (!imageUrl) {
        logger.warn(`[garmentOrbit:${label}] Flux Kontext completed without image URL`, {
          rawKeys: Object.keys(raw).slice(0, 8),
        });
        return undefined;
      }
      return imageUrl;
    } catch (err) {
      logger.warn(`[garmentOrbit:${label}] generation failed`, { error: (err as Error).message });
      return undefined;
    }
  };

  const [side, back] = await Promise.all([
    generateView('side', sidePrompt),
    generateView('back', backPrompt),
  ]);

  return { side, back };
}

async function runMeshy(prompt: string, input: JsonRecord): Promise<ProviderResult> {
  const apiKey = requireValue(FAL_API_KEY.value(), 'FAL_API_KEY');
  const rawCleanPrompt = build3DPrompt(prompt, input);
  // Translate non-ASCII prompts to English — Meshy text-to-3d struggles with non-Latin text
  const cleanPrompt = await translateForImageGen(rawCleanPrompt);
  const contentCategory = typeof input.contentCategory === 'string' ? input.contentCategory : '';
  const contentSubcategory = typeof input.contentSubcategory === 'string' ? input.contentSubcategory : '';
  // NPC categories must be treated as character content so the prompt does NOT degrade to
  // "clothing only / no human body" — that produced empty suits / headless mannequins for
  // Sigma Chad, Mom Friend etc. (logs showed isClothing:true for npc_ai/roast_npc because
  // CLOTHING_KEYWORDS matched "shirt/jacket/hat" inside the LLM-enriched prompt).
  const isNpcContent = contentCategory === 'npc_ai'
    || contentCategory === 'npc'
    || contentSubcategory === 'roast_npc'
    || contentSubcategory === 'npcs'
    || contentSubcategory === 'npc';
  const isCharacterContent = isNpcContent
    || contentSubcategory === 'characters'
    || contentCategory === 'character';
  const isWeaponItem = contentCategory === 'weapon';
  const isItemTool = contentCategory === 'item_tool';
  // Track 3 (Pet 3D pipeline): pets must not degrade into the "no human body"
  // clothing branch nor pick up CLOTHING_KEYWORDS-style negative prompts. We
  // ALSO want multi-view for pets so Meshy/Tripo have side+back angles.
  const isPetContent = contentCategory === 'pet'
    || input.requestedKind === 'pet_3d'
    || input.petMode === 'evolution_3d';
  const isVehicleContent = contentCategory === 'vehicle'
    || contentSubcategory === 'vehicles'
    || input.requestedKind === 'vehicle_3d';
  const isClothingItem = !isWeaponItem && !isItemTool && !isCharacterContent && !isPetContent && !isVehicleContent && (['ugc_clothing', 'ugc_accessory'].includes(contentCategory)
    || CLOTHING_KEYWORDS.test(prompt)
    || CLOTHING_KEYWORDS.test(typeof input.title === 'string' ? input.title : ''));
  const isPropContent = contentCategory === 'furniture_prop' || contentCategory === 'prop';
  const negativePrompt = typeof input.negativePrompt === 'string' && input.negativePrompt.trim()
    ? input.negativePrompt
    : isPetContent
      ? 'human, person, mannequin, clothing, garment, hat, weapon, hands, background scene, multiple creatures, action pose, running, jumping, fighting, low quality, blurry, broken anatomy, floating parts'
      : isVehicleContent
        ? 'human, person, driver, passenger, rider, character, hands, body, face, wheels, tires, environment, ground, road, scene, low quality, blurry, broken geometry, floating parts'
        : isWeaponItem
          ? 'human body, person, hands, character, low quality, blurry, broken geometry, floating parts'
          : isItemTool
            ? 'human body, person, character, hands holding, body, face, mannequin, background scene, low quality, blurry, broken geometry, floating parts'
            : isClothingItem
              ? 'human body, person, mannequin, hanger, stand, rack, legs, arms, head, face, low quality, blurry'
              : isPropContent
                ? 'human, person, character, body, face, hands, feet, mannequin, low quality, blurry, broken geometry, floating parts'
                : 'nude, naked, shirtless, bare chest, exposed skin, nsfw, underwear, open jacket, unbuttoned shirt, open shirt, v-neck showing chest, visible torso, bare torso, low quality, blurry, broken anatomy, noisy topology, floating parts, action pose, dynamic pose, crossed arms, overlapping limbs, running, jumping, fighting';

  const conceptImageUrl = typeof input.conceptImageUrl === 'string' && input.conceptImageUrl.trim()
    ? input.conceptImageUrl.trim()
    : undefined;
  const useImageTo3d = !!conceptImageUrl;
  // Multi-view input is Meshy's #1 quality lever — single-image causes "blurry back faces"
  // (per Meshy docs + 3daistudio.com 2026 comparison). For character/NPC content we generate
  // back + side views from the front concept via Flux Kontext (~$0.04 each, +$0.08 per mesh),
  // then submit [front, side, back] to multi-image-to-3d. Non-character content (props,
  // weapons, furniture) stays on single-image path — extra views rarely help for those.
  // Session 001 (Track 2 Phase 2): layered 3D clothing also benefits massively from
  // multi-view because Roblox UGC validator + AFT need clean side/back geometry to
  // generate correct cages. Single front-view input produces "blurry back faces" that
  // fail UGC moderation.
  const isLayered3DClothing = isClothingItem
    && (input.clothingMode === 'layered_3d'
      || (typeof input.clothingType === 'string' && (input.clothingType as string).startsWith('layered_')));
  // Track 3 (Pet 3D pipeline): multi-view is critical for non-humanoid creatures —
  // back/side angles disambiguate tail/wing/leg geometry that single-image Meshy
  // misinterprets as floating parts.
  const wantsMultiView = useImageTo3d && (isCharacterContent || isNpcContent || isLayered3DClothing || isPetContent);
  const endpoint = useImageTo3d
    ? 'fal-ai/meshy/v6/multi-image-to-3d'
    : 'fal-ai/meshy/v6/text-to-3d';

  // For character/NPC, generate orbit views (back + side) via Flux Kontext to give Meshy
  // 3 reference angles. If generation fails for either view, Meshy multi-image accepts 1-4
  // images so we silently fall back to whatever successfully generated.
  let imageUrls: string[] = useImageTo3d ? [conceptImageUrl!] : [];
  if (wantsMultiView) {
    try {
      const viewPromptBase = (typeof input.title === 'string' ? input.title : '').slice(0, 60);
      // Session 001 (Track 2 Phase 2): garment orbit views use garment-only prompts
      // (no person/mannequin), unlike character views which preserve "outfit/hair/etc.".
      const orbitViews = isLayered3DClothing
        ? await generateGarmentOrbitViewsForMesh(conceptImageUrl!, viewPromptBase, apiKey)
        : await generateOrbitViewsForMesh(conceptImageUrl!, viewPromptBase, apiKey);
      if (orbitViews.side) imageUrls.push(orbitViews.side);
      if (orbitViews.back) imageUrls.push(orbitViews.back);
      logger.info('Meshy multi-view inputs prepared', {
        front: !!conceptImageUrl,
        side: !!orbitViews.side,
        back: !!orbitViews.back,
        totalViews: imageUrls.length,
        garmentMode: isLayered3DClothing,
      });
    } catch (orbitErr) {
      logger.warn('Meshy orbit view generation threw, falling back to single-image input', {
        error: (orbitErr as Error).message,
      });
    }
  }

  logger.info(`Fal Meshy v6 ${useImageTo3d ? 'multi-image' : 'text'}-to-3d`, {
    original: prompt.slice(0, 200),
    clean: cleanPrompt,
    hasConceptImage: useImageTo3d,
    multiViewCount: imageUrls.length,
    isClothing: isClothingItem,
    isWeapon: isWeaponItem,
    keyPrefix: apiKey.slice(0, 8),
  });

  // pose_mode: empty for everything. Meshy v6 only supports 'a-pose' or empty (no t-pose
  // value). When set to 'a-pose', Meshy forcibly spreads arms regardless of what the prompt
  // and 2D preview show, which compounds with R15 catalog animations into broken arm poses
  // ("one arm waving up, the other hanging" — Sigma Chad / Gen-Alpha screenshots). Empty
  // pose_mode lets Meshy follow the 2D preview pose, and our prompt now explicitly asks for
  // "neutral resting pose, arms hanging at sides" which matches user expectation ("по швам").
  //
  // Quality params (changelog-312 follow-up, 2026-05-12, per multi-provider research):
  // - topology: 'quad' — quads rig better than triangles, cleaner deformation under R15
  //   bones. Default in fal.ai was 'triangle'.
  // - target_polycount: 8_000 — lower than the 30k default forces cleaner topology with
  //   sharper silhouette features (per Meshy + 3daistudio.com 2026 comparison).
  // - symmetry_mode: 'auto' — Meshy auto-detects bilateral symmetry and enforces it, which
  //   cleans up uneven faces / asymmetric limbs that single-image inputs often produce.
  // Note: fal.ai's Meshy v6 schema does NOT expose `art_style` or `texture_richness`
  // (verified 2026-05-12). The earlier attempt to pass those returned validation errors.
  // Track 3 (Pet 3D pipeline): legendary stage3 forms are often asymmetric
  // (one glowing eye, scar, ragged wing), so we disable symmetry enforcement
  // when the pet stage is marked as the legendary final form.
  const isLegendaryStage3 = isPetContent && input.petStageIndex === 3;
  const payload: Record<string, unknown> = useImageTo3d
    ? {
        image_urls: imageUrls,
        topology: 'quad',
        // 2026-05-13 update: bumped from 8k to 20k. 8k was too coarse for
        // facial features (eyes, mouth, hat details) — produced "blurry/soapy"
        // visual per user feedback. 20k preserves character details while still
        // being a clean topology compared to default 30k. Roblox MeshPart
        // accepts up to 60k tri so 20k is well within budget.
        target_polycount: 20_000,
        symmetry_mode: isLegendaryStage3 ? 'off' : 'auto',
        pose_mode: '',
        should_remesh: true,
        should_texture: true,
        enable_pbr: true,
      }
    : {
        // fal.ai Meshy v6 text-to-3d enforces a hard 600-char prompt limit.
        prompt: cleanPrompt.slice(0, 600),
        negative_prompt: negativePrompt,
      };

  const submitHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Key ${apiKey}`,
  };

  // Helper: one full submit+poll cycle. Throws on any failure (network / fal error /
  // downstream_service_error). Caller decides whether to retry or fallback.
  const submitAndPoll = async (ep: string, body: Record<string, unknown>): Promise<JsonRecord> => {
    let resp: JsonRecord;
    try {
      resp = await fetchJson(`https://queue.fal.run/${ep}`, {
        method: 'POST',
        headers: submitHeaders,
        body: JSON.stringify(body),
      });
    } catch (submitErr) {
      logger.warn('Fal Meshy POST failed, retrying once', { endpoint: ep, error: (submitErr as Error).message });
      await new Promise((r) => setTimeout(r, 2000));
      resp = await fetchJson(`https://queue.fal.run/${ep}`, {
        method: 'POST',
        headers: submitHeaders,
        body: JSON.stringify(body),
      });
    }
    const reqId = resp.request_id as string | undefined;
    if (!reqId) {
      throw new Error(`Fal Meshy v6: failed to queue task — ${JSON.stringify(resp)}`);
    }
    const sUrl = resp.status_url as string | undefined;
    const rUrl = resp.response_url as string | undefined;
    logger.info('Fal Meshy v6 queued', { endpoint: ep, requestId: reqId, statusUrl: sUrl, responseUrl: rUrl });
    return pollFalRequest(apiKey, ep, reqId, sUrl, rUrl);
  };

  // Detects fal.ai's transient "downstream_service_error" — happens when Meshy itself
  // reports COMPLETED but the result fetch returns 422 with that error type. Retrying the
  // whole submit (new requestId) usually clears it within 1-2 attempts.
  const isTransientDownstreamError = (err: Error): boolean => {
    const msg = err.message ?? '';
    return msg.includes('Fal task completed but response fetch failed')
      || msg.includes('downstream_service_error');
  };

  // Build single-image fallback payload — used when multi-image-to-3d keeps hitting
  // downstream_service_error AND we only have 1 image_url (items / weapons / furniture
  // never have orbit views, so this is always safe for them).
  const canFallbackToSingleImage = useImageTo3d && imageUrls.length === 1;
  const singleImageEndpoint = 'fal-ai/meshy/v6/image-to-3d';
  const buildSingleImagePayload = (): Record<string, unknown> => ({
    image_url: imageUrls[0],
    topology: 'quad',
    target_polycount: 20_000,
    symmetry_mode: 'auto',
    pose_mode: '',
    should_remesh: true,
    should_texture: true,
    enable_pbr: true,
  });

  const MAX_DOWNSTREAM_RETRIES = 2; // 1 initial + 2 retries = 3 attempts on primary endpoint
  let raw: JsonRecord | undefined;
  let lastErr: Error | undefined;
  for (let attempt = 0; attempt <= MAX_DOWNSTREAM_RETRIES; attempt++) {
    try {
      raw = await submitAndPoll(endpoint, payload);
      break;
    } catch (err) {
      lastErr = err as Error;
      if (!isTransientDownstreamError(lastErr)) throw err;
      logger.warn('Fal Meshy v6 transient downstream_service_error — will retry', {
        endpoint, attempt, remaining: MAX_DOWNSTREAM_RETRIES - attempt,
        error: lastErr.message.slice(0, 200),
      });
      if (attempt < MAX_DOWNSTREAM_RETRIES) await new Promise((r) => setTimeout(r, 3000));
    }
  }

  if (!raw && lastErr && isTransientDownstreamError(lastErr) && canFallbackToSingleImage) {
    logger.warn('Fal Meshy v6 multi-image-to-3d exhausted retries, falling back to single-image endpoint', {
      from: endpoint, to: singleImageEndpoint,
    });
    raw = await submitAndPoll(singleImageEndpoint, buildSingleImagePayload());
  }

  if (!raw) {
    throw lastErr ?? new Error(`Fal Meshy v6: unknown failure (${endpoint})`);
  }

  const modelGlb = raw.model_glb as JsonRecord | undefined;
  const modelUrls = raw.model_urls as JsonRecord | undefined;
  const thumbnail = raw.thumbnail as JsonRecord | undefined;

  const glbUrl = modelGlb?.url as string | undefined
    ?? (modelUrls?.glb as JsonRecord | undefined)?.url as string | undefined;
  const thumbnailUrl = thumbnail?.url as string | undefined;
  const fbxUrl = (modelUrls?.fbx as JsonRecord | undefined)?.url as string | undefined;
  const usdzUrl = (modelUrls?.usdz as JsonRecord | undefined)?.url as string | undefined;
  const objUrl = (modelUrls?.obj as JsonRecord | undefined)?.url as string | undefined;

  // Extract texture URLs (base_color, metallic, normal, roughness) from Meshy response
  const rawTextureUrls = Array.isArray(raw.texture_urls) ? raw.texture_urls as JsonRecord[] : [];
  const firstTextures = rawTextureUrls.length > 0 ? rawTextureUrls[0] : undefined;
  const baseColorTextureUrl = (firstTextures?.base_color as JsonRecord | undefined)?.url as string | undefined;
  const normalTextureUrl = (firstTextures?.normal as JsonRecord | undefined)?.url as string | undefined;
  const metallicTextureUrl = (firstTextures?.metallic as JsonRecord | undefined)?.url as string | undefined;
  const roughnessTextureUrl = (firstTextures?.roughness as JsonRecord | undefined)?.url as string | undefined;

  if (!glbUrl) {
    throw new Error(`Fal Meshy v6: response missing GLB model URL — ${JSON.stringify(raw).slice(0, 500)}`);
  }

  logger.info('Fal Meshy v6 model ready', {
    glbUrl, thumbnailUrl, fbxUrl,
    hasBaseColorTexture: !!baseColorTextureUrl,
    hasNormalTexture: !!normalTextureUrl,
  });

  return {
    text: '3D model generated via Meshy v6 on fal.ai.',
    outputUrl: glbUrl,
    mimeType: 'model/gltf-binary',
    raw: {
      ...raw,
      modelUrl: glbUrl,
      thumbnailUrl,
      fbxUrl,
      usdzUrl,
      objUrl,
      baseColorTextureUrl,
      normalTextureUrl,
      metallicTextureUrl,
      roughnessTextureUrl,
      provider: 'fal-meshy-v6',
    },
  };
}

// ---------------------------------------------------------------------------
// Track 3 (Pet 3D pipeline) — Tripo AI provider for quadruped/winged/serpentine
// /aquatic creatures that Meshy v6 Rigging API does NOT support (it accepts
// only bipedal humanoid).
//
// We use Tripo via fal.ai (fal-ai/tripo3d/tripo/v2.5/image-to-3d) for the
// mesh stage — single hop, polling pattern identical to Meshy. For the rig
// + animation step we call the Tripo platform API directly because fal.ai
// does NOT proxy `animate_rig` yet. If TRIPO_API_KEY is unset the rig step
// degrades gracefully: the pet ships as a static MeshPart and FollowScript
// continues to work (no skinned animation).
// ---------------------------------------------------------------------------

const TRIPO_API_BASE = 'https://api.tripo3d.ai/v2/openapi';

export interface TripoTaskResult {
  taskId: string;
  modelUrl?: string;
  rawJson?: unknown;
  skipped?: boolean;
  skipReason?: string;
}

export interface TripoMeshResult extends TripoTaskResult {
  /** Convenience alias of modelUrl (mesh GLB/FBX). */
  meshUrl?: string;
}

export interface TripoRigResult extends TripoTaskResult {
  /** Convenience alias of modelUrl (rigged FBX or GLB, depends on out_format). */
  fbxUrl?: string;
  glbUrl?: string;
}

export type TripoRigType = 'BIPED' | 'QUADRUPED' | 'HEXAPOD' | 'OCTOPOD' | 'AVIAN' | 'SERPENTINE' | 'AQUATIC' | 'OTHERS';
export type TripoAnimationPreset =
  | 'IDLE' | 'WALK' | 'RUN' | 'DIVE' | 'CLIMB' | 'JUMP'
  | 'SLASH' | 'SHOOT' | 'HURT' | 'FALL' | 'TURN'
  | 'QUADRUPED_WALK' | 'HEXAPOD_WALK' | 'OCTOPOD_WALK'
  | 'SERPENTINE_MARCH' | 'AQUATIC_MARCH';

/**
 * Map our pipeline skeleton tags to Tripo's RigType enum (verified against
 * VAST-AI-Research/tripo-python-sdk source).
 */
export function mapSkeletonToTripoRigType(skeleton: PetSkeletonType, isFlying: boolean): TripoRigType {
  if (skeleton === 'biped' || skeleton === 'mechanical_biped') return 'BIPED';
  if (skeleton === 'serpentine') return 'SERPENTINE';
  if (skeleton === 'aquatic') return 'AQUATIC';
  if (skeleton === 'quadruped' || skeleton === 'winged_quadruped') return 'QUADRUPED';
  // Pure flyers with no legs would fall here — only reachable if classify
  // generates a non-standard skeleton; default to AVIAN when isFlying so the
  // wings drive the rig.
  if (isFlying) return 'AVIAN';
  return 'OTHERS';
}

/**
 * Pick the right Tripo animation presets per rig type. Tripo offers
 * skeleton-specific walk presets (QUADRUPED_WALK / SERPENTINE_MARCH / etc.)
 * which produce much better motion than the generic WALK for non-humanoid
 * skeletons.
 */
export function mapAnimationsForRigType(rigType: TripoRigType): TripoAnimationPreset[] {
  switch (rigType) {
    case 'QUADRUPED':       return ['IDLE', 'QUADRUPED_WALK'];
    case 'SERPENTINE':      return ['IDLE', 'SERPENTINE_MARCH'];
    case 'AQUATIC':         return ['IDLE', 'AQUATIC_MARCH'];
    case 'AVIAN':           return ['IDLE', 'WALK'];
    case 'HEXAPOD':         return ['IDLE', 'HEXAPOD_WALK'];
    case 'OCTOPOD':         return ['IDLE', 'OCTOPOD_WALK'];
    case 'BIPED':
    case 'OTHERS':
    default:                return ['IDLE', 'WALK'];
  }
}

interface TripoStatusPayload {
  data?: { task_id?: string; status?: string; output?: { model?: string; pbr_model?: string; base_model?: string } };
}

/**
 * Submit a Tripo task and poll for completion. Returns { taskId, modelUrl } on
 * SUCCESS or { skipped: true, skipReason } on any failure / missing key.
 *
 * Tripo native API:
 *   POST  https://api.tripo3d.ai/v2/openapi/task   (body: { type, ...params })
 *   GET   https://api.tripo3d.ai/v2/openapi/task/{taskId}
 * Auth header is "Authorization: Bearer <TRIPO_API_KEY>".
 * Status values: queued | running | success | failed | cancelled | banned | expired.
 */
async function submitAndPollTripoTask(args: {
  body: Record<string, unknown>;
  apiKey: string;
  timeoutMs?: number;
  logLabel?: string;
}): Promise<TripoTaskResult> {
  const { body, apiKey } = args;
  const timeoutMs = args.timeoutMs ?? 6 * 60 * 1000;
  const label = args.logLabel ?? body.type ?? 'tripo';

  try {
    const submitResp = await fetch(`${TRIPO_API_BASE}/task`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
    if (!submitResp.ok) {
      const txt = await submitResp.text().catch(() => '');
      return { taskId: '', skipped: true, skipReason: `Tripo ${label} submit ${submitResp.status}: ${txt.slice(0, 200)}` };
    }
    const submitJson = await submitResp.json() as { data?: { task_id?: string } };
    const taskId = submitJson.data?.task_id;
    if (!taskId) return { taskId: '', skipped: true, skipReason: `Tripo ${label} response missing task_id` };

    logger.info('Tripo task submitted', { label, taskId, keyPrefix: apiKey.slice(0, 8) });

    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const statusResp = await fetch(`${TRIPO_API_BASE}/task/${taskId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!statusResp.ok) {
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }
      const statusJson = await statusResp.json() as TripoStatusPayload;
      const status = (statusJson.data?.status ?? '').toLowerCase();
      if (status === 'success' || status === 'succeeded') {
        const out = statusJson.data?.output ?? {};
        return {
          taskId,
          modelUrl: out.model ?? out.pbr_model ?? out.base_model,
          rawJson: statusJson.data,
        };
      }
      if (status === 'failed' || status === 'cancelled' || status === 'banned' || status === 'expired') {
        return { taskId, skipped: true, skipReason: `Tripo ${label} task status=${status}` };
      }
      await new Promise((r) => setTimeout(r, 5000));
    }
    return { taskId, skipped: true, skipReason: `Tripo ${label} task timed out after ${Math.round(timeoutMs / 1000)}s` };
  } catch (err) {
    return { taskId: '', skipped: true, skipReason: `Tripo ${label} error: ${(err as Error).message}` };
  }
}

/**
 * Run Tripo native `image_to_model` task. Pass the concept image URL (Tripo
 * accepts URLs directly via `file: { type: "jpg", url }`); no separate upload
 * step needed. Returns the Tripo task id so downstream `animate_rig` and
 * `animate_retarget` calls can chain by reference.
 *
 * When TRIPO_API_KEY is unset we degrade to Meshy v6 (existing pipeline) —
 * but the caller gets `taskId === ''` which signals "no chain possible".
 *
 * The function ALSO returns a ProviderResult-shaped wrapper so existing call
 * sites that treat it as a generic provider keep working.
 */
export async function runTripo(prompt: string, input: JsonRecord): Promise<ProviderResult & { tripoTaskId?: string }> {
  const tripoKey = TRIPO_API_KEY.value();
  const cleanPrompt = await translateForImageGen(build3DPrompt(prompt, input));
  const conceptImageUrl = typeof input.conceptImageUrl === 'string' && input.conceptImageUrl.trim()
    ? input.conceptImageUrl.trim()
    : undefined;

  if (!conceptImageUrl) {
    logger.warn('runTripo: no concept image — falling back to Meshy text-to-3d');
    return runMeshy(prompt, input);
  }
  if (!tripoKey) {
    logger.warn('runTripo: TRIPO_API_KEY not configured — falling back to Meshy multi-image-to-3d (no skeletal rig available)');
    return runMeshy(prompt, input);
  }

  const imageType: 'jpg' | 'png' = conceptImageUrl.toLowerCase().includes('.png') ? 'png' : 'jpg';
  // Tripo native image_to_model task. face_count is the polycount budget; PBR
  // texturing matches Roblox MeshPart's expected baked albedo+normal+metallic.
  const result = await submitAndPollTripoTask({
    body: {
      type: 'image_to_model',
      file: { type: imageType, url: conceptImageUrl },
      face_count: 25_000,
      texture: true,
      pbr: true,
      auto_size: true,
    },
    apiKey: tripoKey,
    logLabel: `image_to_model petStage=${input.petStageIndex ?? '?'}`,
  });
  if (result.skipped || !result.modelUrl || !result.taskId) {
    logger.warn('runTripo image_to_model failed, falling back to Meshy', { skipReason: result.skipReason });
    return runMeshy(prompt, input);
  }

  logger.info('Tripo image_to_model success', {
    taskId: result.taskId,
    modelUrlPrefix: result.modelUrl.slice(0, 80),
    petStage: input.petStageIndex,
    clean: cleanPrompt.slice(0, 80),
  });

  return {
    text: 'tripo-3d-mesh',
    outputUrl: result.modelUrl,
    mimeType: 'model/gltf-binary',
    raw: {
      provider: 'tripo-native-v2',
      tripoTaskId: result.taskId,
      meshUrl: result.modelUrl,
      conceptImageUrl,
      rawJson: result.rawJson as JsonRecord,
    },
    tripoTaskId: result.taskId,
  };
}

/**
 * Run Tripo `animate_rig` task — adds skeleton + skin weights to a mesh that
 * was produced by an earlier Tripo task. Requires `meshTaskId` (NOT a URL —
 * Tripo binds rigging by task reference). Returns the rigged FBX/GLB url and
 * the new rig task id (used as input for `animate_retarget`).
 *
 * Without TRIPO_API_KEY this graceful-skips so the pet ships as static mesh.
 */
export async function runTripoRigging(args: {
  meshTaskId: string;
  rigType: TripoRigType;
  outFormat?: 'glb' | 'fbx';
  spec?: 'MIXAMO' | 'TRIPO';
}): Promise<TripoRigResult> {
  const apiKey = TRIPO_API_KEY.value();
  if (!apiKey) {
    return { taskId: '', skipped: true, skipReason: 'TRIPO_API_KEY not configured — skipping rig step (pet ships as static mesh)' };
  }
  if (!args.meshTaskId) {
    return { taskId: '', skipped: true, skipReason: 'runTripoRigging requires a meshTaskId from a prior Tripo image_to_model task' };
  }
  const outFormat = args.outFormat ?? 'fbx';
  const spec = args.spec ?? 'TRIPO';

  const result = await submitAndPollTripoTask({
    body: {
      type: 'animate_rig',
      original_model_task_id: args.meshTaskId,
      rig_type: args.rigType,
      spec,
      out_format: outFormat,
    },
    apiKey,
    logLabel: `animate_rig rig=${args.rigType}`,
  });
  if (result.skipped) return { taskId: result.taskId, skipped: true, skipReason: result.skipReason };
  const url = result.modelUrl;
  return {
    taskId: result.taskId,
    modelUrl: url,
    fbxUrl: outFormat === 'fbx' ? url : undefined,
    glbUrl: outFormat === 'glb' ? url : undefined,
    rawJson: result.rawJson,
  };
}

/**
 * Run Tripo `animate_retarget` task — applies an animation library preset
 * (IDLE / QUADRUPED_WALK / SERPENTINE_MARCH / ...) to a rigged model and
 * bakes the keyframes into the output. The result is a single FBX/GLB
 * containing the mesh + skeleton + baked animation track, ready for Roblox
 * 3D Importer.
 *
 * Tripo accepts either `animation` (single preset) or `animations` (list).
 * We always send the list form so the same FBX can carry multiple clips
 * (idle + walk) for the pet.
 */
export async function runTripoAnimation(args: {
  rigTaskId: string;
  animations: TripoAnimationPreset[];
  outFormat?: 'glb' | 'fbx';
  bakeAnimation?: boolean;
  exportWithGeometry?: boolean;
}): Promise<TripoRigResult> {
  const apiKey = TRIPO_API_KEY.value();
  if (!apiKey) {
    return { taskId: '', skipped: true, skipReason: 'TRIPO_API_KEY not configured — skipping animation step' };
  }
  if (!args.rigTaskId) {
    return { taskId: '', skipped: true, skipReason: 'runTripoAnimation requires a rigTaskId from a prior animate_rig task' };
  }
  const outFormat = args.outFormat ?? 'fbx';

  const result = await submitAndPollTripoTask({
    body: {
      type: 'animate_retarget',
      original_model_task_id: args.rigTaskId,
      animations: args.animations,
      out_format: outFormat,
      bake_animation: args.bakeAnimation ?? true,
      export_with_geometry: args.exportWithGeometry ?? true,
    },
    apiKey,
    logLabel: `animate_retarget anims=${args.animations.join(',')}`,
  });
  if (result.skipped) return { taskId: result.taskId, skipped: true, skipReason: result.skipReason };
  const url = result.modelUrl;
  return {
    taskId: result.taskId,
    modelUrl: url,
    fbxUrl: outFormat === 'fbx' ? url : undefined,
    glbUrl: outFormat === 'glb' ? url : undefined,
    rawJson: result.rawJson,
  };
}

async function runHunyuan3D(prompt: string, input: JsonRecord): Promise<ProviderResult> {
  const apiKey = requireValue(FAL_API_KEY.value(), 'FAL_API_KEY');
  const cleanPrompt = build3DPrompt(prompt, input);
  const contentCategory = typeof input.contentCategory === 'string' ? input.contentCategory : '';
  const isClothingItem = ['ugc_clothing', 'ugc_accessory'].includes(contentCategory)
    || CLOTHING_KEYWORDS.test(prompt)
    || CLOTHING_KEYWORDS.test(typeof input.title === 'string' ? input.title : '');

  const conceptImageUrl = typeof input.conceptImageUrl === 'string' && input.conceptImageUrl.trim()
    ? input.conceptImageUrl.trim()
    : undefined;
  const useImageTo3d = !!conceptImageUrl;
  const endpoint = useImageTo3d ? 'fal-ai/hunyuan3d-v3/image-to-3d' : 'fal-ai/hunyuan3d-v3/text-to-3d';

  logger.info(`Fal Hunyuan3D v3 ${useImageTo3d ? 'image' : 'text'}-to-3d`, {
    original: prompt.slice(0, 200),
    clean: cleanPrompt,
    hasConceptImage: useImageTo3d,
    isClothing: isClothingItem,
  });

  const payload: Record<string, unknown> = useImageTo3d
    ? {
        input_image_url: conceptImageUrl,
        generate_type: 'Normal',
        face_count: isClothingItem ? 30_000 : 80_000,
      }
    : {
        prompt: cleanPrompt.slice(0, 1024),
        generate_type: 'Normal',
        face_count: isClothingItem ? 30_000 : 80_000,
      };

  const submitResp = await fetchJson(`https://queue.fal.run/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Key ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  const requestId = submitResp.request_id as string | undefined;
  if (!requestId) {
    throw new Error(`Fal Hunyuan3D v3: failed to queue task — ${JSON.stringify(submitResp)}`);
  }

  const statusUrl = submitResp.status_url as string | undefined;
  const responseUrl = submitResp.response_url as string | undefined;
  logger.info('Fal Hunyuan3D v3 queued', { requestId, statusUrl, responseUrl });

  const raw = await pollFalRequest(apiKey, endpoint, requestId, statusUrl, responseUrl);

  const modelGlb = raw.model_glb as JsonRecord | undefined;
  const modelUrls = raw.model_urls as JsonRecord | undefined;
  const thumbnail = raw.thumbnail as JsonRecord | undefined;

  const glbUrl = modelGlb?.url as string | undefined
    ?? (modelUrls?.glb as JsonRecord | undefined)?.url as string | undefined;
  const thumbnailUrl = thumbnail?.url as string | undefined;
  const objUrl = (modelUrls?.obj as JsonRecord | undefined)?.url as string | undefined;

  if (!glbUrl) {
    throw new Error(`Fal Hunyuan3D v3: response missing GLB model URL — ${JSON.stringify(raw).slice(0, 500)}`);
  }

  logger.info('Fal Hunyuan3D v3 model ready', { requestId, glbUrl, thumbnailUrl });

  return {
    text: '3D model generated via Hunyuan3D v3 on fal.ai.',
    outputUrl: glbUrl,
    mimeType: 'model/gltf-binary',
    raw: {
      ...raw,
      modelUrl: glbUrl,
      thumbnailUrl,
      objUrl,
      provider: 'fal-hunyuan3d-v3',
    },
  };
}

export async function executeProvider(options: ExecuteOptions): Promise<ProviderResult> {
  const input = options.input ?? {};
  const prompt = typeof options.prompt === 'string'
    ? options.prompt
    : promptFrom(input, '');

  switch (options.provider) {
    case 'openai':
    case 'anthropic':
    case 'gemini':
      return runChatProvider(options.provider, options.prompt ?? prompt, options.model);
    case 'modelslab':
      return runModelsLab(prompt, input);
    case 'fal':
      if (options.kind === 'audio') {
        return runFalAudio(prompt, input);
      }
      return runFal(options.operation, input);
    case 'apify':
      return runApify(options.operation, input);
    case 'algolia':
      return runAlgolia(options.operation, input);
    case 'suno':
      return runSuno(input);
    case 'elevenlabs':
      return runElevenLabs(options.operation, input);
    case 'deepgram':
      return runDeepgram(options.operation, input);
    case 'meshy':
      return runMeshy(prompt, input);
    case 'hunyuan3d':
      return runHunyuan3D(prompt, input);
    default:
      throw new Error(`Unsupported provider: ${String(options.provider)}`);
  }
}

// ── Animation preview video generation ───────────────────────────────────────
/**
 * Generates an animated MP4 preview for a Roblox animation using AnimateDiff.
 * Falls back to Flux static image if video generation fails.
 * Returns { url, isVideo } or null on total failure.
 */
export async function generateAnimationPreviewVideo(
  animationName: string,
  animationType: string,
): Promise<{ url: string; isVideo: boolean } | null> {
  const apiKey = requireValue(FAL_API_KEY.value(), 'FAL_API_KEY');

  const videoPrompt = [
    `Roblox blocky cartoon character performing "${animationName}" ${animationType} animation`,
    'looping animation, smooth motion, full body visible',
    'soft purple lavender gradient background',
    'cartoon 3D game art style, vibrant colors',
    'no text, no watermarks, no UI elements',
  ].join(', ');

  logger.info('Generating animation preview video', { animationName, animationType });

  // Primary: AnimateDiff (async queue)
  const endpoint = 'fal-ai/fast-animatediff/text-to-video';
  try {
    const submitResp = await fetchJson(`https://queue.fal.run/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Key ${apiKey}`,
      },
      body: JSON.stringify({
        prompt: videoPrompt,
        negative_prompt: 'blurry, low quality, text, watermark, static, frozen',
        num_frames: 16,
        fps: 8,
        guidance_scale: 7.5,
        num_inference_steps: 25,
        video_size: { width: 512, height: 512 },
      }),
    });

    const requestId = submitResp.request_id as string | undefined;
    if (!requestId) {
      throw new Error(`AnimateDiff: no request_id — ${JSON.stringify(submitResp)}`);
    }

    const statusUrl = submitResp.status_url as string | undefined;
    const responseUrl = submitResp.response_url as string | undefined;
    logger.info('AnimateDiff queued', { requestId });

    // Max 24 attempts × 5s = 120s timeout for animation preview (non-critical)
    const raw = await pollFalRequest(apiKey, endpoint, requestId, statusUrl, responseUrl, 24);

    // Response: { video: { url: string } }
    const videoUrl = (raw.video as Record<string, unknown> | undefined)?.url as string | undefined;
    if (videoUrl) {
      logger.info('Animation preview video generated via AnimateDiff', { url: videoUrl });
      return { url: videoUrl, isVideo: true };
    }
  } catch (err) {
    logger.warn('AnimateDiff failed for animation preview, falling back to Flux image', err);
  }

  // Fallback: Flux Schnell static image
  const imgPrompt = [
    `Roblox blocky cartoon character performing "${animationName}" ${animationType} animation`,
    'dynamic energetic pose, full body visible',
    'clean soft purple lavender gradient background',
    'cartoon 3D game art style, vibrant colors',
    'no text, no watermarks',
  ].join(', ');

  try {
    const result = await runFal('flux/schnell', {
      endpoint: 'fal-ai/flux/schnell',
      payload: {
        prompt: imgPrompt,
        image_size: { width: 512, height: 512 },
        num_inference_steps: 4,
        num_images: 1,
      },
    });
    if (result.outputUrl) {
      logger.info('Animation preview image (fallback) generated via Flux Schnell', { url: result.outputUrl });
      return { url: result.outputUrl, isVideo: false };
    }
  } catch (err) {
    logger.warn('Flux Schnell fallback also failed for animation preview', err);
  }

  return null;
}
