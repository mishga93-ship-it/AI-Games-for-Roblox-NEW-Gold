# blender-cage-service

Headless Blender 4.x microservice that turns a Meshy/Tripo garment `.glb`
into a Roblox layered-clothing-ready `.fbx` with inner + outer wrap cages.

Replaces the manual Studio Accessory Fitting Tool step:

```
.glb (Meshy)  ─►  POST /cage  ─►  .fbx (garment + InnerCage + OuterCage)
                   │
                   ▼
       Roblox Studio: drag → Accessory ready, no AFT button needed
```

## How it works

1. Loads Roblox's official `Clothing_Cage_Template.blend` (vendored).
2. Imports your garment `.glb`, joins multi-part meshes into one.
3. Appends `InnerCage` + `OuterCage` from the template.
4. Applies Blender's **Shrinkwrap** modifier on `OuterCage`:
   - mode `TARGET_PROJECT` + `OUTSIDE_SURFACE`
   - small positive offset (default `0.005`)
   - target = the imported garment mesh
   - vertex topology and UVs are **not** modified (Roblox requirement)
5. Renames objects to `<Name>`, `<Name>_InnerCage`, `<Name>_OuterCage`.
6. Exports as FBX 7.4 with axis `-Z / Y`, scale 1.0 (Studio importer
   defaults).

## Local test

```bash
# install Blender 4.x locally first (https://www.blender.org/download/)
cd apps/blender-cage-service

blender --background --python generate_cages.py -- \
    --garment ~/Downloads/some-meshy.glb \
    --output  /tmp/out.fbx \
    --name    MyJacket
```

Open `/tmp/out.fbx` in Studio: drag into Workspace → should appear as an
Accessory with the cages already attached. **No need to run AFT.**

## Cloud Run

```bash
cd apps/blender-cage-service
gcloud builds submit --tag gcr.io/roblox-ai-generator-v2-2-ios/blender-cage-service
gcloud run deploy blender-cage-service \
    --image gcr.io/roblox-ai-generator-v2-2-ios/blender-cage-service \
    --region us-central1 \
    --memory 2Gi \
    --cpu 2 \
    --timeout 300 \
    --max-instances 5 \
    --allow-unauthenticated
```

Note: Blender 4.x cold-start is ~3-5s; warm `/cage` request takes ~10-20s
for a typical Meshy mesh (≤4k tris).

## API

### `POST /cage`

```json
{
  "garmentUrl": "https://.../meshy-output.glb",
  "name":       "BlackLeatherJacket",
  "offset":     0.005
}
```

Response:

```json
{
  "fbxBase64": "...",
  "fbxBytes":  123456,
  "logs":      "[generate_cages] ..."
}
```

### `GET /healthz`

```json
{ "ok": true, "service": "blender-cage-service" }
```

## Files

| File                              | Purpose |
|-----------------------------------|---------|
| `generate_cages.py`               | Blender Python script (the real work) |
| `server.py`                       | Minimal HTTP server wrapping Blender |
| `Clothing_Cage_Template.blend`    | Vendored from Roblox/avatar repo |
| `Dockerfile`                      | Ubuntu 22.04 + Blender 4.2 binary |
