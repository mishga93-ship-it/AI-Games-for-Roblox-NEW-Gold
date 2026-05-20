#!/usr/bin/env bash
#
# predeploy-functions-check.sh — wired into firebase.json `predeploy` so that
# ANY caller of `firebase deploy --only functions:api` (Claude, Codex, user,
# CI, safe-deploy wrapper) hits this gate. The single chokepoint that fixes
# the 2026-05-20 incident: parallel session deployed and silently dragged
# another session's uncommitted src/ changes into prod (revision api-00935).
#
# Enforces AGENTS.md §0.6 at the only place that matters — the moment src/
# gets compiled into dist/ for upload.
#
# Bypass for emergencies only:
#   FORCE_DEPLOY=1 firebase deploy --only functions:api
# (and log the override in cursor/changelog-NNN.md with reason).
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

red()    { printf '\033[31m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
green()  { printf '\033[32m%s\033[0m\n' "$*"; }

# ─── §0.6 gate: no uncommitted src/ may be deployed ────────────────────────
# We only care about sources that get compiled into the deployed bundle —
# apps/functions/src/ and packages/shared/src/. Other dirty files in the
# working tree (iOS, docs) are irrelevant to the deployed function.
UNCOMMITTED=$(git status --porcelain apps/functions/src/ packages/shared/src/ 2>/dev/null | grep -vE '^\?\?' || true)
if [[ -n "$UNCOMMITTED" && "${FORCE_DEPLOY:-}" != "1" ]]; then
  echo ""
  red "✗ firebase deploy BLOCKED — uncommitted src/ would silently leak into prod"
  echo ""
  echo "  Modified but not committed:"
  echo "$UNCOMMITTED" | sed 's/^/    /'
  echo ""
  yellow "  Per AGENTS.md §0.6, commit your task files FIRST, then deploy."
  yellow "  This prevents a parallel session from dragging your WIP into prod"
  yellow "  (regression caused by missing this check on 2026-05-20)."
  echo ""
  yellow "  If you absolutely must deploy now (emergency):"
  yellow "      FORCE_DEPLOY=1 firebase deploy --only functions:api"
  yellow "  And log the override in cursor/changelog-NNN.md with reason."
  echo ""
  exit 1
fi

green "✓ §0.6 check passed (no uncommitted src/) — building"

# ─── Build (same as the old predeploy) ─────────────────────────────────────
npm --workspace packages/shared run build
npm --workspace apps/functions run build

green "✓ build complete — firebase will now upload dist/"
