# AI Voice to Games & Mods for Roblox

Mobile app (iOS + Android) — "Roblox Studio in your pocket, voice-controlled." Create full games (.rbxl) and content (models, scripts, UGC) via voice, text, image, or link. AI Smart Interview guides incomplete requests to a full GDD before generation.

## Structure

- **apps/ios** — SwiftUI iOS app (Voice First + Neon Studio): onboarding, auth, chat with mic, Smart Interview, catalog, profile
- **apps/backend** — Node.js API: auth, chat, content, export, moderation, social, files
- **packages/shared** — Shared types and constants (TypeScript, for backend)

## Quick start

```bash
npm install
npm run backend   # Start API (default port 3001)
npm run build:functions
```

**iOS:** Open `apps/ios/AIGoldRoblox.xcodeproj` in Xcode and run on simulator or device. See `apps/ios/README.md`.

## Environment

- Backend: see `apps/backend/.env.example`
- iOS: set API base URL in app Settings or use the default Firebase Functions URL
- Firebase Functions: configure secrets in Secret Manager, then deploy `apps/functions`

## Firebase Functions

The production AI/API integration now lives in `apps/functions` and is designed to keep provider keys out of the iOS client and repository.

### Deploy flow

```bash
npm install
firebase login
firebase use roblox-ai-generator-v2-2-ios
firebase deploy --only functions
```

### Required Firebase secrets

```bash
firebase functions:secrets:set OPENAI_API_KEY
firebase functions:secrets:set ANTHROPIC_API_KEY
firebase functions:secrets:set GEMINI_API_KEY
firebase functions:secrets:set MODELSLAB_API_KEY
firebase functions:secrets:set APIFY_API_TOKEN
firebase functions:secrets:set ALGOLIA_APP_ID
firebase functions:secrets:set ALGOLIA_SEARCH_API_KEY
firebase functions:secrets:set ALGOLIA_WRITE_API_KEY
firebase functions:secrets:set ALGOLIA_ADMIN_API_KEY
firebase functions:secrets:set ALGOLIA_USAGE_API_KEY
firebase functions:secrets:set ALGOLIA_MONITORING_API_KEY
firebase functions:secrets:set SUNO_API_KEY
firebase functions:secrets:set ELEVENLABS_API_KEY
firebase functions:secrets:set REPLICATE_API_TOKEN
firebase functions:secrets:set FAL_API_KEY
firebase functions:secrets:set DEEPGRAM_API_KEY
```

### Local emulators

```bash
npm run functions:emulators
```

Use `http://127.0.0.1:5001/roblox-ai-generator-v2-2-ios/us-central1/api/` as the iOS base URL while testing locally.

## Plan

Implementation follows the plan in `.cursor/plans/` (Phase 1 MVP → Phase 2 games → Phase 3 social → Phase 4 killer features).
