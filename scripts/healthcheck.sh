#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# healthcheck.sh — HTTP & System Health Monitor for HK-NOVA
# ==============================================================================

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_FILE="${PROJECT_ROOT}/logs/healthcheck.log"
APP_URL="${NEXT_PUBLIC_APP_URL:-http://localhost:3000}"
LOGIN_ENDPOINT="${APP_URL}/login"

mkdir -p "${PROJECT_ROOT}/logs"

TIMESTAMP="$(date '+%Y-%m-%d %H:%M:%S')"

# 1. Check Web Endpoint
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "${LOGIN_ENDPOINT}" || echo "000")

if [[ "${HTTP_CODE}" == "200" || "${HTTP_CODE}" == "302" || "${HTTP_CODE}" == "307" ]]; then
  STATUS_MSG="[${TIMESTAMP}] ✅ HTTP Uptime OK: Endpoint ${LOGIN_ENDPOINT} returned HTTP ${HTTP_CODE}"
  echo "${STATUS_MSG}"
  echo "${STATUS_MSG}" >> "${LOG_FILE}"
else
  STATUS_MSG="[${TIMESTAMP}] ❌ HTTP Uptime FAIL: Endpoint ${LOGIN_ENDPOINT} returned HTTP ${HTTP_CODE}"
  echo "${STATUS_MSG}" >&2
  echo "${STATUS_MSG}" >> "${LOG_FILE}"
  exit 1
fi

# 2. Check Memory Usage
MEM_FREE_MB=$(free -m | awk '/^Mem:/ {print $7}')
if (( MEM_FREE_MB < 200 )); then
  WARN_MSG="[${TIMESTAMP}] ⚠️ Low Memory Warning: Available memory ${MEM_FREE_MB}MB < 200MB"
  echo "${WARN_MSG}" >&2
  echo "${WARN_MSG}" >> "${LOG_FILE}"
fi

exit 0
