#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# check-backup.sh — Database Backup Integrity & Age Verification
# ==============================================================================

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${PROJECT_ROOT}/backups"
LOG_FILE="${PROJECT_ROOT}/logs/backup-check.log"
TIMESTAMP="$(date '+%Y-%m-%d %H:%M:%S')"

mkdir -p "${PROJECT_ROOT}/logs"

if [[ ! -d "${BACKUP_DIR}" ]]; then
  echo "[${TIMESTAMP}] ⚠️ Backup directory ${BACKUP_DIR} does not exist yet." | tee -a "${LOG_FILE}"
  exit 0
fi

LATEST_BACKUP=$(ls -t "${BACKUP_DIR}"/*.sql.gz 2>/dev/null | head -1 || true)

if [[ -z "${LATEST_BACKUP}" ]]; then
  echo "[${TIMESTAMP}] ⚠️ No database backup (.sql.gz) found in ${BACKUP_DIR}" | tee -a "${LOG_FILE}"
  exit 0
fi

FILE_SIZE=$(stat -c %s "${LATEST_BACKUP}" 2>/dev/null || stat -f %z "${LATEST_BACKUP}")
MOD_TIME=$(stat -c %Y "${LATEST_BACKUP}" 2>/dev/null || stat -f %m "${LATEST_BACKUP}")
NOW=$(date +%s)
AGE_HOURS=$(( (NOW - MOD_TIME) / 3600 ))

if (( FILE_SIZE < 1000 )); then
  echo "[${TIMESTAMP}] ❌ Backup file ${LATEST_BACKUP} is too small (${FILE_SIZE} bytes)." | tee -a "${LOG_FILE}"
  exit 1
fi

if (( AGE_HOURS > 36 )); then
  echo "[${TIMESTAMP}] ⚠️ Latest backup ${LATEST_BACKUP} is ${AGE_HOURS} hours old (> 36 hours)." | tee -a "${LOG_FILE}"
  exit 1
fi

echo "[${TIMESTAMP}] ✅ Backup OK: ${LATEST_BACKUP} (${FILE_SIZE} bytes, ${AGE_HOURS}h old)" | tee -a "${LOG_FILE}"
exit 0
