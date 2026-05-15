# Firebase Functions

This package hosts the production AI/API layer for the app.

## Endpoints

- `GET /api/health`
- `GET /api/chat/threads`
- `POST /api/chat/threads/:threadId/messages`
- `POST /api/content/generate`
- `GET /api/content/jobs/:jobId`
- `GET /api/export/artifact/:id`
- `POST /api/moderation/check`
- `POST /api/providers/:provider/execute`

## Authentication

All `/api/*` routes except health expect a Firebase ID token in:

```text
Authorization: Bearer <firebase-id-token>
```

For local-only emulator work you can temporarily set:

```text
ALLOW_UNAUTHENTICATED_REQUESTS=true
```

## Secret names

- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GEMINI_API_KEY`
- `MODELSLAB_API_KEY`
- `APIFY_API_TOKEN`
- `ALGOLIA_APP_ID`
- `ALGOLIA_SEARCH_API_KEY`
- `ALGOLIA_WRITE_API_KEY`
- `ALGOLIA_ADMIN_API_KEY`
- `ALGOLIA_USAGE_API_KEY`
- `ALGOLIA_MONITORING_API_KEY`
- `SUNO_API_KEY`
- `ELEVENLABS_API_KEY`
- `REPLICATE_API_TOKEN`
- `FAL_API_KEY`
- `DEEPGRAM_API_KEY`
- `ROBLOX_WORKER_TOKEN`

> **Note:** Meshy 3D generation now runs through `FAL_API_KEY` via fal.ai's hosted Meshy v6 endpoint. No separate Meshy key is needed.

## Character 3D pipeline

- `character_3d` now runs as a staged pipeline: concept image -> Meshy 3D -> mesh optimize -> R15 rig bridge -> export package.
- Intermediate artifacts are stored in Firebase Storage and attached to the generation job so iOS can render stage-by-stage previews.
- When the worker cannot complete a native Roblox export, the job returns `partial` with preserved intermediate assets and a project bundle fallback instead of collapsing to text-only output.

## Notes

- The code stores long-running generation jobs in Firestore.
- Generated text/assets are copied into Firebase Storage and exposed via signed URLs.
- Chat defaults to Gemini, concept images use Fal/Replicate, and `character_3d` routes through Meshy plus the Roblox worker bridge.
