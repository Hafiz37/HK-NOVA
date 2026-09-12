#!/usr/bin/env bash
# ==============================================================================
# backup-offsite.sh — Offsite Database Backup to S3/MinIO/Remote Server
# ==============================================================================
# Usage: bash scripts/backup-offsite.sh
# Requires: rclone configured (rclone config)
# Cron: 30 3 * * * cd /path/to/hk-nova && bash scripts/backup-offsite.sh >> logs/backup-offsite.log 2>&1

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${PROJECT_ROOT}/.env"

# Configurable via env or .env
RCLONE_REMOTE="${RCLONE_REMOTE:-hk-nova-backups}"      # rclone remote name
RCLONE_PATH="${RCLONE_PATH:-hk-nova/db-backups}"       # remote path
BACKUP_DIR="${BACKUP_DIR:-${PROJECT_ROOT}/backups}"    # local backup dir
RETENTION_LOCAL="${BACKUP_RETENTION:-7}"               # local retention
RETENTION_REMOTE="${BACKUP_RETENTION_REMOTE:-30}"      # remote retention

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "ERROR: ${ENV_FILE} not found." >&2
  exit 1
fi

# Parse DATABASE_URL for database name
DATABASE_URL="$(grep '^DATABASE_URL=' "${ENV_FILE}" | head -1 | cut -d'=' -f2- | tr -d '"')"
URL_NO_PROTO="${DATABASE_URL#*://}"
HOSTPORT_DB="${URL_NO_PROTO#*@}"
DB_NAME="${HOSTPORT_DB#*/}"
DB_NAME="${DB_NAME%%\?*}"

mkdir -p "${BACKUP_DIR}"

TIMESTAMP="$(date +%Y-%m-%d_%H%M)"
LOCAL_FILE="${BACKUP_DIR}/${DB_NAME}.${TIMESTAMP}.sql.gz"

echo "[$(date '+%F %T')] Starting offsite backup for ${DB_NAME}..."

# 1. Create local backup first
mysqldump --defaults-extra-file=<(grep -E '^(DB_USER|DB_PASS|DB_HOST|DB_PORT)=' "${ENV_FILE}" | sed 's/=/ = /' | sed 's/^/[client]\n/') \
  --single-transaction --routines --triggers --events --no-tablespaces \
  "${DB_NAME}" | gzip -9 > "${LOCAL_FILE}"

if [[ ! -f "${LOCAL_FILE}" || ! -s "${LOCAL_FILE}" ]]; then
  echo "ERROR: Local backup failed or empty" >&2
  exit 1
fi

LOCAL_SIZE=$(du -h "${LOCAL_FILE}" | cut -f1)
echo "[$(date '+%F %T')] Local backup created: ${LOCAL_FILE} (${LOCAL_SIZE})"

# 2. Upload to offsite (rclone)
if command -v rclone &>/dev/null; then
  echo "[$(date '+%F %T')] Uploading to ${RCLONE_REMOTE}:${RCLONE_PATH}..."
  rclone copy "${LOCAL_FILE}" "${RCLONE_REMOTE}:${RCLONE_PATH}/" --progress
  RCLONE_EXIT=$?
  if [[ ${RCLONE_EXIT} -eq 0 ]]; then
    echo "[$(date '+%F %T')] ✅ Offsite upload successful"
  else
    echo "[$(date '+%F %T')] ❌ Offsite upload failed (exit: ${RCLONE_EXIT})" >&2
    exit ${RCLONE_EXIT}
  fi
else
  echo "[$(date '+%F %T')] ⚠️ rclone not installed, skipping offsite upload"
  echo "  Install: curl https://rclone.org/install.sh | sudo bash"
  echo "  Configure: rclone config"
fi

# 3. Local retention cleanup
if [[ "${RETENTION_LOCAL}" =~ ^[0-9]+$ ]] && (( RETENTION_LOCAL > 0 )); then
  ls -1t "${BACKUP_DIR}"/"${DB_NAME}".*.sql.gz 2>/dev/null \
    | tail -n +$((RETENTION_LOCAL + 1)) \
    | while read -r OLD; do
        rm -f "${OLD}"
        echo "[$(date '+%F %T')] Cleaned local: ${OLD}"
      done
fi

# 4. Remote retention cleanup (keep more copies offsite)
if command -v rclone &>/dev/null && [[ "${RETENTION_REMOTE}" =~ ^[0-9]+$ ]] && (( RETENTION_REMOTE > 0 )); then
  echo "[$(date '+%F %T')] Cleaning remote backups older than ${RETENTION_REMOTE}..."
  rclone delete "${RCLONE_REMOTE}:${RCLONE_PATH}/" --min-age "${RETENTION_REMOTE}d" --dry-run 2>/dev/null \
    | grep -E '^\s+[0-9]' | awk '{print $2}' \
    | while read -r REMOTE_FILE; do
        if [[ -n "${REMOTE_FILE}" ]]; then
          rclone deletefile "${RCLONE_REMOTE}:${RCLONE_PATH}/${REMOTE_FILE}"
          echo "[$(date '+%F %T')] Cleaned remote: ${REMOTE_FILE}"
        fi
      done
fi

echo "[$(date '+%F %T')] Offsite backup completed."