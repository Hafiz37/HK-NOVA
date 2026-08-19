#!/usr/bin/env bash
#
# backup-db.sh — Backup database MySQL HK-NOVA (mysqldump + gzip + retensi)
#
# Mengambil konfigurasi DATABASE_URL dari file .env di project root.
#
# Variabel yang bisa dioverride (env):
#   BACKUP_DIR         lokasi backup (default: <project>/backups)
#   BACKUP_RETENTION   jumlah file backup yang dipertahankan (default: 7)
#   REMOTE_COPY        perintah salin offsite, gunakan token %f untuk path file
#                      contoh: REMOTE_COPY='rclone copy %f remote:noc-backups'
#   MYSQLDUMP_OPTS     opsi ekstra mysqldump
#
# Contoh cron (setiap 02:30):
#   30 2 * * * cd /path/to/hk-nova && bash scripts/backup-db.sh >> logs/backup.log 2>&1
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${PROJECT_ROOT}/.env"

BACKUP_DIR="${BACKUP_DIR:-${PROJECT_ROOT}/backups}"
RETENTION="${BACKUP_RETENTION:-7}"
MYSQLDUMP_OPTS="${MYSQLDUMP_OPTS:---single-transaction --routines --triggers --events}"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "ERROR: "${ENV_FILE}" tidak ditemukan." >&2
  exit 1
fi

# ── Parse DATABASE_URL (mysql://user:pass@host:port/dbname) ────────────────
DATABASE_URL="$(grep '^DATABASE_URL=' "${ENV_FILE}" | head -1 | cut -d'=' -f2- | tr -d '"')"
if [[ -z "${DATABASE_URL}" ]]; then
  echo "ERROR: DATABASE_URL tidak ditemukan di .env" >&2
  exit 1
fi

URL_NO_PROTO="${DATABASE_URL#*://}"   # user:pass@host:port/dbname
CRED="${URL_NO_PROTO%%@*}"            # user:pass
HOSTPORT_DB="${URL_NO_PROTO#*@}"      # host:port/dbname
DB_USER="${CRED%%:*}"
DB_PASS="${CRED#*:}"
DB_HOST="${HOSTPORT_DB%%:*}"
HOSTPORT_DB="${HOSTPORT_DB#*:}"       # port/dbname
DB_PORT="${HOSTPORT_DB%%/*}"
DB_NAME="${HOSTPORT_DB#*/}"

for VAR in DB_USER DB_PASS DB_HOST DB_PORT DB_NAME; do
  [[ -n "${!VAR}" ]] || { echo "ERROR: ${VAR} kosong (cek DATABASE_URL)." >&2; exit 1; }
done

# ── Backup ───────────────────────────────────────────────────────────────────
mkdir -p "${BACKUP_DIR}"
TIMESTAMP="$(date +%Y-%m-%d_%H%M)"
OUT_FILE="${BACKUP_DIR}/${DB_NAME}.${TIMESTAMP}.sql.gz"
TMP_FILE="${OUT_FILE}.tmp"

echo "[$(date '+%F %T')] Backup ${DB_NAME} → ${OUT_FILE}"

mysqldump -u"${DB_USER}" -p"${DB_PASS}" -h"${DB_HOST}" -P"${DB_PORT}" \
  ${MYSQLDUMP_OPTS} "${DB_NAME}" | gzip -9 > "${TMP_FILE}"

mv "${TMP_FILE}" "${OUT_FILE}"
echo "[$(date '+%F %T')] Selesai: $(du -h "${OUT_FILE}" | cut -f1)"

# ── Salin offsite (opsional) ────────────────────────────────────────────────
if [[ -n "${REMOTE_COPY:-}" ]]; then
  REMOTE_CMD="${REMOTE_COPY//%f/${OUT_FILE}}"
  echo "[$(date '+%F %T')] Menyalin offsite: ${REMOTE_CMD}"
  eval "${REMOTE_CMD}"
fi

# ── Retensi ─────────────────────────────────────────────────────────────────
if [[ "${RETENTION}" =~ ^[0-9]+$ ]] && (( "${RETENTION}" > 0 )); then
  ls -1t "${BACKUP_DIR}"/"${DB_NAME}".*.sql.gz 2>/dev/null \
    | tail -n +$((RETENTION + 1)) \
    | while read -r OLD; do
        rm -f "${OLD}"
        echo "[$(date '+%F %T')] Hapus backup lama: ${OLD}"
      done
fi

echo "[$(date '+%F %T')] Backup selesai."