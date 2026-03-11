#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPORT_ROOT="$ROOT/artifacts/integration-e2e"
OUT_ROOT="$ROOT/artifacts/pr-reports"

mkdir -p "$OUT_ROOT"

latest_run="${1:-}"
if [[ -z "$latest_run" ]]; then
  latest_run=$(ls -1 "$REPORT_ROOT" 2>/dev/null | sort | tail -n 1 || true)
fi

if [[ -z "$latest_run" ]]; then
  echo "No integration-e2e run found under $REPORT_ROOT"
  exit 1
fi

run_dir="$REPORT_ROOT/$latest_run"
html_dir="$run_dir/html-report"
summary_file="$run_dir/summary.txt"

if [[ ! -d "$html_dir" ]]; then
  echo "HTML report directory missing: $html_dir"
  exit 1
fi

html_file="$OUT_ROOT/${latest_run}-report.html"
cp "$html_dir/index.html" "$html_file"

echo "Packaged report: $html_file"
if [[ -f "$summary_file" ]]; then
  echo "---- summary ----"
  cat "$summary_file"
  echo "-----------------"
fi

echo "Suggested PR note:"
echo "- E2E HTML report: artifacts/pr-reports/${latest_run}-report.html"
