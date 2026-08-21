#!/usr/bin/env bash
#
# backup-filesystem-sync.sh — Sync backup filesystem ke external storage
#
# Setup:
#   1. Mount external storage: sudo mount /dev/sdb1 /mnt/backup-external
#   2. Add to crontab: 0 3 * * * /opt/hk-nova/scripts/backup-filesystem-sync.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Source & Destination
SOURCE="${BACKUP_FILESYSTEM_PATH:-/var/backups/hk-nova}"
DEST="${BACKUP_SYNC_DEST:-/mnt/backup-external/hk-nova}"
LOG_FILE="${PROJECT_ROOT}/logs/backup-sync.log"

# Ensure log directory exists
mkdir -p "$(dirname "$LOG_FILE")"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

log "=== Backup Filesystem Sync Started ==="

# Check source exists
if [[ ! -d "$SOURCE" ]]; then
  log "ERROR: Source directory does not exist: $SOURCE"
  exit 1
fi

# Check destination is mounted
if ! mountpoint -q "$(dirname "$DEST")" 2>/dev/null; then
  log "WARNING: Destination may not be mounted: $(dirname "$DEST")"
  log "Attempting to mount..."

  # Try to mount (requires fstab entry)
  if ! mount "$(dirname "$DEST")" 2>/dev/null; then
    log "ERROR: Failed to mount destination. Please mount manually."
    exit 1
  fi
fi

# Create destination if not exists
mkdir -p "$DEST"

# Rsync with progress
log "Syncing $SOURCE → $DEST"
rsync -avz --delete \
  --exclude="*.tmp" \
  --exclude="*.lock" \
  --stats \
  "$SOURCE/" "$DEST/" 2>&1 | tee -a "$LOG_FILE"

RSYNC_EXIT=${PIPESTATUS[0]}

if [[ $RSYNC_EXIT -eq 0 ]]; then
  log "SUCCESS: Sync completed successfully"

  # Optional: Create monthly tar archive
  if [[ "$(date +%d)" == "01" ]]; then
    ARCHIVE_NAME="backup-$(date +%Y-%m).tar.gz"
    ARCHIVE_PATH="$DEST/monthly/$ARCHIVE_NAME"
    mkdir -p "$DEST/monthly"

    log "Creating monthly archive: $ARCHIVE_PATH"
    tar -czf "$ARCHIVE_PATH" -C "$SOURCE" . 2>&1 | tee -a "$LOG_FILE"

    # Keep only last 12 months
    find "$DEST/monthly" -name "backup-*.tar.gz" -mtime +365 -delete
  fi
else
  log "ERROR: Sync failed with exit code $RSYNC_EXIT"
  exit 1
fi

log "=== Backup Filesystem Sync Finished ==="