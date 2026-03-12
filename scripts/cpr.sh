#!/usr/bin/env bash
set -euo pipefail

PR_BASE="${PR_BASE:-dev}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

cd "$REPO_ROOT"

build_auto_message() {
  local changed_files changed_count sample_paths
  changed_files="$(git status --porcelain | sed -E 's/^.. //')"
  changed_count="$(printf '%s\n' "$changed_files" | sed '/^$/d' | wc -l | tr -d ' ')"

  if [[ "${changed_count}" == "0" ]]; then
    echo "No changes detected. Provide a message manually or modify files before running CPR."
    exit 1
  fi

  sample_paths="$(printf '%s\n' "$changed_files" | sed '/^$/d' | head -n 3 | paste -sd ', ' -)"
  echo "chore(cpr): update ${changed_count} files (${sample_paths})"
}

if [[ $# -ge 1 ]]; then
  MSG="$*"
else
  MSG="$(build_auto_message)"
  echo "Auto message: ${MSG}"
fi

# Run required validation first. Fail fast if it breaks.
./scripts/run_local_full_integration_e2e.sh

TS="$(date +%Y%m%d-%H%M%S)"
SLUG="$(echo "$MSG" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+|-+$//g' | cut -c1-42)"
BRANCH="cpr/${TS}-${SLUG}"

git checkout -b "$BRANCH"
git add -A
git commit -m "$MSG"
git push -u origin "$BRANCH"

PR_URL="$(gh pr create --base "$PR_BASE" --title "$MSG" --fill)"
echo "PR_URL=${PR_URL}"
