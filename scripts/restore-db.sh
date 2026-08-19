#!/usr/bin/env bash
#
# restore-db.sh — Restore database MySQL HK-NOVA dari hasil backup-db.sh
#
# Memakai DATABASE_URL dari .env dan nama database sesuai file backup.
#
# Pemakaian:
#   bash scripts/restore-db.sh backups/hk_nova_prod.2026-08-19_0200.sql.gz
#
# ⚠️ Operasi ini MENIMPA data database saat ini. Pastikan sudah ada backup.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${PROJECT_ROOT}/.env"

if [[ $# -lt 1 ]]; then
  echo "Pemakaian: bash $0 <file-dump.sql.gz>" >&2
  exit 1
fi

DUMP_FILE="${1}"
if [[ ! -f "${DUMP_FILE}" ]]; then
  echo "ERROR: file dump tidak ditemukan: ${DUMP_FILE}" >&2
  exit 1
fi

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

URL_NO_PROTO="${DATABASE_URL#*://}"
CRED="${URL_NO_PROTO%%@*}"
HOSTPORT_DB="${URL_NO_PROTO#*@}"
DB_USER="${CRED%%:*}"
DB_PASS="${CRED#*:}"
DB_HOST="${HOSTPORT_DB%%:*}"
HOSTPORT_DB="${HOSTPORT_DB#*:}"
DB_PORT="${HOSTPORT_DB%%/*}"
DB_NAME="${HOSTPORT_DB#*/}"

for VAR in DB_USER DB_PASS DB_HOST DB_PORT DB_NAME; do
  [[ -n "${!VAR}" ]] || { echo "ERROR: ${VAR} kosong (cek DATABASE_URL)." >&2; exit 1; }
done

echo "⚠️  Restore akan MENIMPA database '${DB_NAME}' pada ${DB_HOST}:${DB_PORT}"
read -r -p "Lanjutkan? (yes/N) " CONFIRM
if [[ "${CONFIRM}" != "yes" ]]; then
  echo "Dibatalkan."
  exit 1
fi

echo "[$(date '+%F %T')] Restore dari: ${DUMP_FILE}"
zcat "${DUMP_FILE}" | mysql -u"${DB_USER}" -p"${DB_PASS}" -h"${DB_HOST}" -P"${DB_PORT}" "${DB_NAME}"
echo "[$(date '+%F %T')] Restore selesai."