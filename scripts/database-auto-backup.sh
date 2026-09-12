#!/usr/bin/env bash

# HK-NOVA Database Auto Backup Script
BACKUP_DIR="/home/gopal-ichiro/backups/db"
DATE_STR=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/hk_nova_prod_${DATE_STR}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "[$(date)] Starting database dump..."
/usr/bin/mysqldump --no-tablespaces -u hk_nova -p'HkNova2026!DbPass' hk_nova_prod | gzip > "$BACKUP_FILE"

if [ -f "$BACKUP_FILE" ] && [ -s "$BACKUP_FILE" ]; then
    echo "[$(date)] Database backup SUCCESS: $BACKUP_FILE ($(du -h $BACKUP_FILE | cut -f1))"
else
    echo "[$(date)] Database backup FAILED!"
    exit 1
fi

# Cleanup DB backups older than 30 days
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +30 -delete
echo "[$(date)] Cleanup of backups older than 30 days completed."
