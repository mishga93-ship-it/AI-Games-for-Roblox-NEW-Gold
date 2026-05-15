# Roblox Worker Service

This service builds and analyzes Roblox assets for the Firebase backend.

## Endpoints

- `GET /health`
- `POST /build-roblox`
  - body: `{ "manifest": { ... } }`
  - response: `{ "outputBase64": "...", "target": "place|model" }`
- `POST /analyze-roblox`
  - body: `{ "inputBase64": "...", "target": "place|model" }`
  - response: analysis JSON with node summary and rig stats
- `POST /optimize-mesh`
  - body: `{ "sourceUrl": "...", "title": "..." }`
  - response: normalized model payload with `outputBase64`, `outputMimeType`, `outputExtension`
- `POST /auto-rig-r15`
  - body: `{ "sourceUrl": "...", "title": "..." }`
  - response: rig bridge payload with `outputBase64`, `notes`, and stage metadata
- `POST /export-character`
  - body: `{ "sourceUrl": "...", "title": "..." }`
  - response: export bridge payload for downstream FBX/GLB packaging

If `ROBLOX_WORKER_TOKEN` is set, all POST requests require:

- `Authorization: Bearer <token>`

## Local Run

```bash
npm run build --workspace=apps/worker-service
npm run start --workspace=apps/worker-service
```

Worker listens on:

- `WORKER_PORT` (default `8787`)

## Deploy (Cloud Run + Firebase wiring)

Use the repo script:

```bash
npm run deploy:worker
```

This script:

1. builds and deploys `apps/worker-service` to Cloud Run
2. writes `ROBLOX_WORKER_URL` into the Functions env file
3. stores `ROBLOX_WORKER_TOKEN` in Firebase Secret Manager
4. redeploys Functions

## Quality Notes

- Character pipeline (`character_3d`) generates a rigged model manifest (`Humanoid`, body parts, `Motor6D` joints).
- Mesh post-process endpoints currently provide a deterministic bridge layer for pipeline staging and artifact preservation.
- If a downstream step cannot emit a native Roblox binary, the pipeline should still return preserved mesh artifacts and a bundle fallback.
- Worker manifest parser supports typed values:
  - `Vector3` (`{ "__type": "Vector3", x, y, z }`)
  - `Color3` (`{ "__type": "Color3", r, g, b }`)
  - references (`{ "__type": "Ref", id }`) for constraints/joints
- Analyze endpoint returns rig-relevant counters (`Humanoid`, `Motor6D`, `MeshPart`, `Part`).
