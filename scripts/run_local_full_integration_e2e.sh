#!/usr/bin/env bash
set -euo pipefail

# Always run local integration E2E with elevated privileges unless explicitly bypassed.
# Set E2E_FORCE_ELEVATED=0 for non-elevated troubleshooting.
if [[ "${E2E_FORCE_ELEVATED:-1}" == "1" && "${ELEVATED_E2E:-0}" != "1" ]]; then
  if command -v sudo >/dev/null 2>&1; then
    exec sudo -E ELEVATED_E2E=1 E2E_FORCE_ELEVATED=1 "$0" "$@"
  fi
  echo "[e2e] sudo not available; cannot enforce elevated run"
  exit 1
fi

ROOT_FRONTEND="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARTIFACT_ROOT="${ARTIFACT_ROOT:-$ROOT_FRONTEND/artifacts/integration-e2e}"
TS="$(date +%Y%m%d_%H%M%S)"
RUN_DIR="$ARTIFACT_ROOT/$TS"
LOG_DIR="$RUN_DIR/logs"
SUMMARY_FILE="$RUN_DIR/summary.txt"

if [[ -z "${ROOT_API:-}" ]]; then
  for candidate in \
    "$ROOT_FRONTEND/../leagueOS-api.latest" \
    "$ROOT_FRONTEND/../leagueOS-api.snapshot" \
    "$ROOT_FRONTEND/../leagueOS-api"; do
    if [[ -d "$candidate" ]]; then
      ROOT_API="$candidate"
      break
    fi
  done
fi

if [[ -z "${ROOT_API:-}" || ! -d "$ROOT_API" ]]; then
  echo "[e2e] unable to locate api repo. Set ROOT_API to your local API checkout path."
  echo "[e2e] tried: $ROOT_FRONTEND/../leagueOS-api.latest, $ROOT_FRONTEND/../leagueOS-api.snapshot, $ROOT_FRONTEND/../leagueOS-api"
  exit 1
fi

if [[ ! -x "$ROOT_API/.venv/bin/python" ]]; then
  echo "[e2e] missing python venv at $ROOT_API/.venv/bin/python"
  echo "[e2e] run API setup first, then retry."
  exit 1
fi

DB_URL="${DATABASE_URL:-}"
if [[ -z "$DB_URL" && -f "$ROOT_API/.env" ]]; then
  DB_URL="$(grep '^DATABASE_URL=' "$ROOT_API/.env" | head -n 1 | cut -d'=' -f2-)"
fi
if [[ -z "$DB_URL" ]]; then
  echo "[e2e] DATABASE_URL not found. Set DATABASE_URL or add it to $ROOT_API/.env"
  exit 1
fi

read -r DB_HOST DB_PORT < <(
  "$ROOT_API/.venv/bin/python" - <<'PY' "$DB_URL"
import sys
from urllib.parse import urlparse
u = urlparse(sys.argv[1])
print((u.hostname or "127.0.0.1"), (u.port or 5432))
PY
)

mkdir -p "$LOG_DIR"

echo "[e2e] artifacts: $RUN_DIR"

echo "[e2e] ensuring local postgres is running"
if [[ "$DB_HOST" == "127.0.0.1" || "$DB_HOST" == "localhost" ]]; then
  if ! pg_isready -h "$DB_HOST" -p "$DB_PORT" >/dev/null 2>&1; then
    for svc in postgresql@18 postgresql@17 postgresql@16 postgresql@15 postgresql@14 postgresql; do
      brew services start "$svc" >/dev/null 2>&1 || true
      if pg_isready -h "$DB_HOST" -p "$DB_PORT" >/dev/null 2>&1; then
        break
      fi
    done
  fi

  if ! pg_isready -h "$DB_HOST" -p "$DB_PORT" >/dev/null 2>&1; then
    echo "[e2e] postgres not reachable on ${DB_HOST}:${DB_PORT}"
    echo "[e2e] start postgres and retry."
    exit 1
  fi
else
  echo "[e2e] using non-local database host ${DB_HOST}:${DB_PORT}; skipping local postgres startup"
fi

echo "[e2e] bootstrapping api db"
if ! (
  cd "$ROOT_API"
  RUN_SEED=1 ./.venv/bin/python -m scripts.bootstrap_db
) >"$LOG_DIR/bootstrap.log" 2>&1
then
  echo "[e2e] api db bootstrap failed. Check $LOG_DIR/bootstrap.log"
  tail -n 40 "$LOG_DIR/bootstrap.log" || true
  exit 1
fi

echo "[e2e] ensuring one OPEN session exists in active season"
(
  cd "$ROOT_API"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -c "WITH active_season AS (SELECT id FROM season WHERE club_id = 1 AND is_active = true ORDER BY id DESC LIMIT 1) INSERT INTO session (season_id, session_date, start_time_local, start_datetime, status, location, created_at, opened_at) SELECT active_season.id, CURRENT_DATE, to_char(now(),'HH24:MI')::time, date_trunc('minute', now()), 'OPEN', 'E2E Auto Session', now(), now() FROM active_season WHERE NOT EXISTS (SELECT 1 FROM session s WHERE s.season_id = active_season.id AND s.status = 'OPEN');"
) >"$LOG_DIR/open_session.log" 2>&1

cleanup() {
  set +e
  if [[ -n "${API_PID:-}" ]]; then kill "$API_PID" >/dev/null 2>&1 || true; fi
  if [[ -n "${WEB_PID:-}" ]]; then kill "$WEB_PID" >/dev/null 2>&1 || true; fi
}
trap cleanup EXIT

echo "[e2e] starting api"
(
  cd "$ROOT_API"
  ./.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
) >"$LOG_DIR/api.log" 2>&1 &
API_PID=$!

echo "[e2e] starting web"
(
  cd "$ROOT_FRONTEND"
  pnpm --filter @leagueos/web dev
) >"$LOG_DIR/web.log" 2>&1 &
WEB_PID=$!

for i in {1..60}; do
  if curl -fsS http://127.0.0.1:8000/health >/dev/null 2>&1 && curl -fsS http://127.0.0.1:3000 >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

if ! curl -fsS http://127.0.0.1:8000/health >/dev/null 2>&1; then
  echo "API failed to start. Check $LOG_DIR/api.log"
  exit 1
fi
if ! curl -fsS http://127.0.0.1:3000 >/dev/null 2>&1; then
  echo "Web failed to start. Check $LOG_DIR/web.log"
  exit 1
fi

echo "[e2e] running playwright"
set +e
(
  cd "$ROOT_FRONTEND/apps/web"
  E2E_ARTIFACT_DIR="$RUN_DIR" E2E_BASE_URL="http://127.0.0.1:3000" E2E_API_BASE="http://127.0.0.1:8000" pnpm test:e2e
) >"$LOG_DIR/playwright.log" 2>&1
STATUS=$?
set -e

TOTAL="n/a"
PASSED="n/a"
FAILED="n/a"
if [[ -f "$RUN_DIR/results.json" ]]; then
  TOTAL=$(python3 - <<PY
import json
p=json.load(open('$RUN_DIR/results.json'))
print(p.get('stats',{}).get('expected',0)+p.get('stats',{}).get('unexpected',0)+p.get('stats',{}).get('flaky',0))
PY
)
  PASSED=$(python3 - <<PY
import json
p=json.load(open('$RUN_DIR/results.json'))
print(p.get('stats',{}).get('expected',0))
PY
)
  FAILED=$(python3 - <<PY
import json
p=json.load(open('$RUN_DIR/results.json'))
print(p.get('stats',{}).get('unexpected',0))
PY
)
fi

{
  echo "Run Timestamp: $TS"
  echo "Status: $([[ $STATUS -eq 0 ]] && echo SUCCESS || echo FAIL)"
  echo "Total: $TOTAL"
  echo "Passed: $PASSED"
  echo "Failed: $FAILED"
  echo "Artifacts: $RUN_DIR"
  echo "HTML Report: $RUN_DIR/html-report/index.html"
  echo "Logs: $LOG_DIR"
} | tee "$SUMMARY_FILE"

if [[ $STATUS -ne 0 ]]; then
  exit $STATUS
fi
