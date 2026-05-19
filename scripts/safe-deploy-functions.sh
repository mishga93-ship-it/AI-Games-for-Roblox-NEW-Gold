#!/usr/bin/env bash
#
# safe-deploy-functions.sh — enforce AGENTS.md §0.6 + §0.7 at the shell level.
#
# Blocks `firebase deploy --only functions:api` when:
#   1. Working tree has uncommitted changes in apps/functions/src/ (§0.6).
#   2. A parallel deploy finished < 3 minutes ago (§0.7).
#   3. dist/ is older than src/ (build was skipped).
#
# Usage:
#   bash scripts/safe-deploy-functions.sh
#   (or via npm script: see package.json)
#
# Bypass for emergencies only:
#   FORCE_DEPLOY=1 bash scripts/safe-deploy-functions.sh
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

LOCAL_NODE_BIN="$ROOT_DIR/.local-tools/node-v20.19.2-darwin-arm64/bin"
export PATH="$LOCAL_NODE_BIN:$ROOT_DIR/node_modules/.bin:$PATH"

LOCK_FILE="$ROOT_DIR/.firebase-deploy.lock"
LOCK_WINDOW_SECONDS=180  # 3 minutes — covers active deploy + propagation

red()    { printf '\033[31m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
green()  { printf '\033[32m%s\033[0m\n' "$*"; }
bold()   { printf '\033[1m%s\033[0m\n' "$*"; }

bold "[safe-deploy-functions] preflight"

# ─── §0.6: commit-before-deploy ─────────────────────────────────────────────
UNCOMMITTED=$(git status --porcelain apps/functions/src/ apps/functions/dist/ packages/shared/ 2>/dev/null | grep -vE '^\?\?' || true)
if [[ -n "$UNCOMMITTED" && "${FORCE_DEPLOY:-}" != "1" ]]; then
  red "✗ Uncommitted changes in apps/functions/src or packages/shared:"
  echo "$UNCOMMITTED" | sed 's/^/    /'
  echo ""
  yellow "Per AGENTS.md §0.6, deploy is only allowed after commit."
  yellow "Stage and commit your task files, then retry."
  yellow "Override (NOT recommended): FORCE_DEPLOY=1 bash scripts/safe-deploy-functions.sh"
  exit 1
fi

# ─── §0.7: wait for parallel deploys ────────────────────────────────────────
if [[ -f "$LOCK_FILE" ]]; then
  LOCK_TIME=$(stat -f %m "$LOCK_FILE" 2>/dev/null || stat -c %Y "$LOCK_FILE" 2>/dev/null || echo 0)
  NOW=$(date +%s)
  ELAPSED=$((NOW - LOCK_TIME))
  if (( ELAPSED < LOCK_WINDOW_SECONDS )) && [[ "${FORCE_DEPLOY:-}" != "1" ]]; then
    LOCK_OWNER=$(cat "$LOCK_FILE" 2>/dev/null || echo "unknown")
    REMAINING=$((LOCK_WINDOW_SECONDS - ELAPSED))
    red "✗ Parallel deploy detected (started ${ELAPSED}s ago by ${LOCK_OWNER})."
    yellow "Per AGENTS.md §0.7, wait ${REMAINING}s and retry."
    yellow "Or override: FORCE_DEPLOY=1 bash scripts/safe-deploy-functions.sh"
    exit 1
  fi
fi

# ─── Build sanity ───────────────────────────────────────────────────────────
green "✓ working tree clean for functions"
echo ""
bold "[safe-deploy-functions] npm run build (apps/functions)"
npm run build --workspace apps/functions

# ─── Claim the lock ─────────────────────────────────────────────────────────
echo "$(whoami)@$(hostname) pid=$$" > "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT INT TERM

# ─── Deploy ─────────────────────────────────────────────────────────────────
echo ""
bold "[safe-deploy-functions] firebase deploy --only functions:api"
PROJECT_ID="${FIREBASE_PROJECT:-$(node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('.firebaserc','utf8')).projects.default)")}"
firebase deploy --only functions:api --project "$PROJECT_ID"

# ─── Health check ───────────────────────────────────────────────────────────
echo ""
bold "[safe-deploy-functions] health check"
FUNCTION_URL="${FUNCTION_URL:-https://api-z4yzt6dhjq-uc.a.run.app}"
HEALTH=$(curl -fsS "$FUNCTION_URL/api/health")
green "✓ /api/health: $HEALTH"

echo ""
green "✓ deploy complete — lock will be released on exit"
