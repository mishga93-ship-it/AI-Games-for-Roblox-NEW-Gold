#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_NODE_BIN="$ROOT_DIR/.local-tools/node-v20.19.2-darwin-arm64/bin"
LOCAL_GCLOUD_BIN="$ROOT_DIR/.local-tools/google-cloud-sdk/bin"
export PATH="$LOCAL_NODE_BIN:$ROOT_DIR/node_modules/.bin:$LOCAL_GCLOUD_BIN:$PATH"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_command node
require_command firebase
require_command gcloud

pick_python() {
  if [[ -n "${CLOUDSDK_PYTHON:-}" ]]; then
    echo "$CLOUDSDK_PYTHON"
    return
  fi
  for candidate in python3.12 python3.11 python3.10; do
    if command -v "$candidate" >/dev/null 2>&1; then
      echo "$(command -v "$candidate")"
      return
    fi
  done
  echo ""
}

PYTHON_BIN="$(pick_python)"
if [[ -z "$PYTHON_BIN" ]]; then
  echo "Google Cloud CLI needs Python 3.10+." >&2
  echo "Install Python 3.10+ and rerun with CLOUDSDK_PYTHON=/path/to/python3.11 npm run deploy:worker" >&2
  exit 1
fi
export CLOUDSDK_PYTHON="$PYTHON_BIN"

PROJECT_ID="${GCP_PROJECT_ID:-$(node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); process.stdout.write(data.projects.default);" "$ROOT_DIR/.firebaserc")}"
REGION="${WORKER_REGION:-us-central1}"
SERVICE_NAME="${WORKER_SERVICE_NAME:-roblox-worker-service}"
FUNCTION_ENV_FILE="$ROOT_DIR/apps/functions/.env.$PROJECT_ID"
FUNCTION_URL="${FUNCTION_URL:-https://api-z4yzt6dhjq-uc.a.run.app}"

if [[ "$(gcloud auth list --format=json)" == "[]" ]]; then
  echo "No Google Cloud account is logged in." >&2
  echo "Run: gcloud auth login" >&2
  exit 1
fi

if [[ -n "${ROBLOX_WORKER_TOKEN:-}" ]]; then
  WORKER_TOKEN="$ROBLOX_WORKER_TOKEN"
else
  WORKER_TOKEN="$(node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))")"
fi

echo "Building worker-service..."
npm run build:worker

echo "Deploying Cloud Run service $SERVICE_NAME to $PROJECT_ID/$REGION..."
gcloud run deploy "$SERVICE_NAME" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --source "$ROOT_DIR/apps/worker-service" \
  --allow-unauthenticated \
  --set-env-vars "ROBLOX_WORKER_TOKEN=$WORKER_TOKEN" \
  --quiet

WORKER_URL="$(gcloud run services describe "$SERVICE_NAME" --project "$PROJECT_ID" --region "$REGION" --format='value(status.url)')"
if [[ -z "$WORKER_URL" ]]; then
  echo "Failed to resolve Cloud Run URL for $SERVICE_NAME" >&2
  exit 1
fi

echo "Updating Firebase function env file..."
node - "$FUNCTION_ENV_FILE" "$WORKER_URL" <<'EOF'
const fs = require('fs');
const envPath = process.argv[2];
const workerUrl = process.argv[3];
const desired = {
  ROBLOX_WORKER_URL: workerUrl,
  ROBLOX_WORKER_COMMAND: '',
  ROBLOX_WORKER_ARGS: '',
  JOB_DISPATCH_MODE: 'worker_service',
  ALLOW_UNAUTHENTICATED_REQUESTS: 'false',
};
const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8').split(/\r?\n/) : [];
const map = new Map();
for (const line of existing) {
  if (!line || line.trim().startsWith('#')) continue;
  const idx = line.indexOf('=');
  if (idx === -1) continue;
  map.set(line.slice(0, idx), line.slice(idx + 1));
}
for (const [key, value] of Object.entries(desired)) {
  map.set(key, value);
}
const output = [...map.entries()].map(([key, value]) => `${key}=${value}`).join('\n') + '\n';
fs.writeFileSync(envPath, output);
EOF

echo "Publishing worker token to Firebase Secret Manager..."
printf '%s' "$WORKER_TOKEN" | firebase functions:secrets:set ROBLOX_WORKER_TOKEN --data-file=-

echo "Deploying Firebase functions with worker URL..."
firebase deploy --only functions --force

echo "Smoke testing worker and API..."
curl -fsS "$WORKER_URL/health" >/dev/null
curl -fsS "$FUNCTION_URL/api/health" >/dev/null

echo ""
echo "Worker URL: $WORKER_URL"
echo "API URL: $FUNCTION_URL"
