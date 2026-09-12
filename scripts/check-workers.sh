#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# check-workers.sh — PM2 Worker Health & Status Checker for HK-NOVA
# ==============================================================================

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_FILE="${PROJECT_ROOT}/logs/worker-check.log"
TIMESTAMP="$(date '+%Y-%m-%d %H:%M:%S')"

mkdir -p "${PROJECT_ROOT}/logs"

REQUIRED_WORKERS=("hk-nova-web" "hk-nova-icmp-worker" "hk-nova-snmp-worker")
OFFLINE_WORKERS=()

if ! command -v pm2 &>/dev/null; then
  echo "[${TIMESTAMP}] ⚠️ PM2 is not running or not installed in PATH." | tee -a "${LOG_FILE}"
  exit 0
fi

PM2_LIST=$(pm2 jlist 2>/dev/null || echo "[]")

for worker in "${REQUIRED_WORKERS[@]}"; do
  STATUS=$(echo "${PM2_LIST}" | node -e '
    const list = JSON.parse(fs.readFileSync(0, "utf-8"));
    const worker = process.argv[1];
    const found = list.find(item => item.name === worker);
    console.log(found ? found.pm2_env.status : "missing");
  ' "${worker}")

  if [[ "${STATUS}" == "online" ]]; then
    echo "[${TIMESTAMP}] ✅ Worker ${worker}: ONLINE" | tee -a "${LOG_FILE}"
  else
    echo "[${TIMESTAMP}] ❌ Worker ${worker}: STATUS = ${STATUS}" | tee -a "${LOG_FILE}"
    OFFLINE_WORKERS+=("${worker}")
  fi
done

if (( ${#OFFLINE_WORKERS[@]} > 0 )); then
  echo "[${TIMESTAMP}] ❌ CRITICAL: Workers offline: ${OFFLINE_WORKERS[*]}" | tee -a "${LOG_FILE}"
  exit 1
fi

echo "[${TIMESTAMP}] ✅ All essential workers are healthy." | tee -a "${LOG_FILE}"
exit 0
