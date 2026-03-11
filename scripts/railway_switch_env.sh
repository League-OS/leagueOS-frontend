#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: ./scripts/railway_switch_env.sh <dev|prod>

Required environment variables:
  LEAGUEOS_RAILWAY_DEV_TOKEN   Railway token for Dev environment
  LEAGUEOS_RAILWAY_PROD_TOKEN  Railway token for Production environment
USAGE
}

if [[ "${1:-}" == "" ]]; then
  usage
  exit 1
fi

TARGET_ENV="$(echo "$1" | tr '[:upper:]' '[:lower:]')"

case "$TARGET_ENV" in
  dev)
    TOKEN="${LEAGUEOS_RAILWAY_DEV_TOKEN:-}"
    ;;
  prod|production)
    TARGET_ENV="prod"
    TOKEN="${LEAGUEOS_RAILWAY_PROD_TOKEN:-}"
    ;;
  *)
    echo "Invalid environment: $1"
    usage
    exit 1
    ;;
esac

if [[ -z "$TOKEN" ]]; then
  echo "Missing token env var for '$TARGET_ENV'."
  usage
  exit 1
fi

if ! command -v railway >/dev/null 2>&1; then
  echo "railway CLI not found in PATH."
  exit 1
fi

railway logout >/dev/null 2>&1 || true

if ! RAILWAY_TOKEN="$TOKEN" railway whoami --json >/tmp/leagueos_railway_whoami.json 2>/tmp/leagueos_railway_whoami.err; then
  cat /tmp/leagueos_railway_whoami.err
  echo "Railway authentication failed for '$TARGET_ENV'."
  exit 1
fi

echo "Railway auth switched successfully for '$TARGET_ENV'."
cat /tmp/leagueos_railway_whoami.json
