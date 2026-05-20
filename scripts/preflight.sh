#!/usr/bin/env bash
#
# preflight.sh — 2-second situation report for any session starting work
# on this project. Shows what parallel sessions are touching so you don't
# blindly step on them.
#
# Wired into AGENTS.md §0.7. Run at session start AND before any
# `firebase deploy` / `git commit` / `xcodebuild`:
#
#     bash scripts/preflight.sh
#
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

bold()   { printf '\033[1m%s\033[0m\n' "$*"; }
dim()    { printf '\033[2m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
green()  { printf '\033[32m%s\033[0m\n' "$*"; }
red()    { printf '\033[31m%s\033[0m\n' "$*"; }
cyan()   { printf '\033[36m%s\033[0m\n' "$*"; }

bold "═══ PREFLIGHT — $(date '+%Y-%m-%d %H:%M:%S') ═══"
echo ""

# ─── Working tree state ────────────────────────────────────────────────────
bold "Working tree (modified files = someone is working here NOW):"
MODIFIED=$(git status --porcelain 2>/dev/null | grep -E '^ ?M' || true)
if [[ -z "$MODIFIED" ]]; then
  green "  ✓ clean — no foreign edits in flight"
else
  echo "$MODIFIED" | while IFS= read -r line; do
    f="${line:3}"
    if [[ -f "$f" ]]; then
      mtime=$(stat -f "%Sm" -t "%H:%M:%S" "$f" 2>/dev/null || stat -c "%y" "$f" 2>/dev/null | cut -d' ' -f2 | cut -d'.' -f1)
      yellow "  $line  (last edit $mtime)"
    else
      yellow "  $line"
    fi
  done
  echo ""
  dim "  ↑ these are uncommitted. If you didn't edit them — it's a parallel session."
  dim "  Don't 'git add .' — stage only your files by name. (AGENTS.md §0.7)"
fi
echo ""

# ─── Untracked ─────────────────────────────────────────────────────────────
UNTRACKED=$(git status --porcelain 2>/dev/null | grep '^??' || true)
if [[ -n "$UNTRACKED" ]]; then
  bold "Untracked files (probably someone's smoke scripts):"
  echo "$UNTRACKED" | sed 's/^/  /'
  echo ""
fi

# ─── Active deploys / builds ───────────────────────────────────────────────
bold "Active deploys / builds elsewhere on this Mac:"
ACTIVE=""

# firebase deploy in progress?
FB_PIDS=$(pgrep -fl "firebase deploy" 2>/dev/null | grep -v preflight || true)
if [[ -n "$FB_PIDS" ]]; then
  red "  ⚡ firebase deploy IN PROGRESS — do not start another one:"
  echo "$FB_PIDS" | sed 's/^/    /'
  ACTIVE="yes"
fi

# xcodebuild?
XC_PIDS=$(pgrep -fl "^.*xcodebuild " 2>/dev/null | grep -v preflight || true)
if [[ -n "$XC_PIDS" ]]; then
  red "  ⚡ xcodebuild IN PROGRESS — your build.db will lock:"
  echo "$XC_PIDS" | sed 's/^/    /'
  ACTIVE="yes"
fi

# Recent deploy lockfile?
if [[ -f .firebase-deploy.lock ]]; then
  LOCK_AGE=$(($(date +%s) - $(stat -f %m .firebase-deploy.lock 2>/dev/null || stat -c %Y .firebase-deploy.lock 2>/dev/null || echo 0)))
  if (( LOCK_AGE < 180 )); then
    red "  ⚡ .firebase-deploy.lock active (${LOCK_AGE}s ago) — wait $((180 - LOCK_AGE))s before deploying"
    ACTIVE="yes"
  fi
fi

if [[ -z "$ACTIVE" ]]; then
  green "  ✓ no active deploys or CLI builds"
fi
echo ""

# ─── Xcode open? ───────────────────────────────────────────────────────────
XCODE_OPEN=$(pgrep -fl "Xcode.app/Contents/MacOS/Xcode$" 2>/dev/null || true)
if [[ -n "$XCODE_OPEN" ]]; then
  bold "Xcode is open:"
  XCODE_PROJ=$(osascript -e 'tell application "Xcode" to get path of active workspace document' 2>/dev/null || echo "")
  if [[ -n "$XCODE_PROJ" ]]; then
    if [[ "$XCODE_PROJ" == *"AIGoldRoblox"* ]]; then
      yellow "  ⚠ Xcode has $XCODE_PROJ open"
      yellow "    → do NOT run xcodebuild against this project (build.db lock)"
      yellow "    → if needed, use:  xcodebuild ... -derivedDataPath /tmp/aigold-claude"
    else
      dim "  Xcode on a different project — safe"
    fi
  fi
  echo ""
fi

# ─── Git history since session start ───────────────────────────────────────
bold "Recent commits (last 5):"
git log --oneline -5 2>/dev/null | sed 's/^/  /'
echo ""

# ─── Unpushed ──────────────────────────────────────────────────────────────
UNPUSHED=$(git log origin/main..main --oneline 2>/dev/null | wc -l | tr -d ' ')
if [[ "$UNPUSHED" -gt 0 ]]; then
  cyan "  ↑ $UNPUSHED commit(s) ahead of origin/main, not pushed yet"
fi

# ─── Stash ─────────────────────────────────────────────────────────────────
STASH_COUNT=$(git stash list 2>/dev/null | wc -l | tr -d ' ')
if [[ "$STASH_COUNT" -gt 0 ]]; then
  echo ""
  yellow "Stash entries (${STASH_COUNT}):"
  git stash list 2>/dev/null | sed 's/^/  /'
fi

# ─── Latest changelog timestamps ───────────────────────────────────────────
echo ""
bold "3 newest cursor/changelog-*.md (track session activity):"
ls -lat cursor/changelog-*.md 2>/dev/null | head -3 | awk '{printf "  %s %s %s\n", $6, $7" "$8, $NF}' || dim "  (no changelogs found)"

echo ""
bold "═══ END PREFLIGHT ═══"
